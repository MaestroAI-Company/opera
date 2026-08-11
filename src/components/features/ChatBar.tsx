
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { TextInputWrapper } from "expo-paste-input";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { Settings } from "../../services/settings/SettingsService";
import { STT, WhisperSTT } from "../../services/speech/STTService";
import NotificationModal from "../ui/NotificationModal";
import AttachmentSheet, { SelectedFile } from "./AttachmentSheet";

const nextWhiteIcon = require("../../../assets/icons/arrow.png");
const micIcon = require("../../../assets/icons/microphone.png");
const addIcon = require("../../../assets/icons/add.png");
const stopIcon = require("../../../assets/icons/stop.png");

const IMAGE_MAX_WIDTH = 1280;
const IMAGE_COMPRESS_QUALITY = 0.7;

//only two audio containers accepted
const SUPPORTED_AUDIO_EXTENSIONS = ['wav', 'mp3'];
const AUDIO_EXTENSION_PATTERN = /\.(wav|mp3|m4a|aac|flac|ogg)$/;

type AttachmentKind = 'image' | 'audio' | 'unsupported';

//one attach rule for all pickers
function classifyAttachment(name: string, mimeType?: string | null): AttachmentKind {
  if (mimeType?.startsWith('image/')) return 'image';

  const lowerName = name.toLowerCase();
  const looksLikeAudio = mimeType?.startsWith('audio/') || AUDIO_EXTENSION_PATTERN.test(lowerName);
  if (!looksLikeAudio) return 'unsupported';

  const extension = lowerName.split('.').pop() ?? '';
  return SUPPORTED_AUDIO_EXTENSIONS.includes(extension) ? 'audio' : 'unsupported';
}

//compress and resize an image to a base64 data uri
const compressImageToDataUri = async (uri: string): Promise<string> => {
  try {
    const context = ImageManipulator.manipulate(uri);
    const preview = await context.renderAsync();
    if (preview.width > IMAGE_MAX_WIDTH) {
      context.reset();
      context.resize({ width: IMAGE_MAX_WIDTH });
    }
    const ref = preview.width > IMAGE_MAX_WIDTH ? await context.renderAsync() : preview;
    const result = await ref.saveAsync({
      compress: IMAGE_COMPRESS_QUALITY,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (result.base64) return `data:image/jpeg;base64,${result.base64}`;
  } catch (e) {
    console.error('Failed to compress image:', e);
  }
  return uri;
};

type ChatInputBarProps = {
  onSend?: (message: string, images?: string[], viaVoice?: boolean) => void;
  onStop?: () => void;
  onTranscribe?: (wavBuffer: ArrayBuffer) => Promise<string | null>;
  onTranscribeError?: () => void;
  placeholder?: string;
  incognito?: boolean;
  isGenerating?: boolean;
  supportsFiles?: boolean;
  canTranscribeRemotely?: boolean;
  onOpenSettings?: () => void;
  onAttachmentSheetVisibilityChange?: (visible: boolean) => void;
  enabled?: boolean;
  autoStartMic?: boolean;
  //screen-selection attachment from overlay
  selection?: { uri: string; label: string } | null;
  onSelectionRemove?: () => void;
  //foreground-app chip from overlay
  appContextChip?: { icon: string; label: string } | null;
  onAppContextRemove?: () => void;
};

export type ChatBarHandle = {
  stopRecording: () => void;
  clear: () => void;
};

//wav buffer builder from pcm chunks
function buildWavBuffer(pcmFloat32Chunks: ArrayBuffer[], sampleRate: number): ArrayBuffer {
  const totalSamples = pcmFloat32Chunks.reduce((n, b) => n + b.byteLength / 4, 0);
  const dataBytes = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const enc = new TextEncoder();
  const riff = enc.encode("RIFF");
  const wave = enc.encode("WAVE");
  const fmt = enc.encode("fmt ");
  const data = enc.encode("data");
  view.setUint8(0, riff[0]); view.setUint8(1, riff[1]);
  view.setUint8(2, riff[2]); view.setUint8(3, riff[3]);
  view.setUint32(4, 36 + dataBytes, true);
  view.setUint8(8, wave[0]); view.setUint8(9, wave[1]);
  view.setUint8(10, wave[2]); view.setUint8(11, wave[3]);
  view.setUint8(12, fmt[0]); view.setUint8(13, fmt[1]);
  view.setUint8(14, fmt[2]); view.setUint8(15, fmt[3]);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint8(36, data[0]); view.setUint8(37, data[1]);
  view.setUint8(38, data[2]); view.setUint8(39, data[3]);
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (const chunk of pcmFloat32Chunks) {
    const f32 = new Float32Array(chunk);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
}

let currentAudioVolume = 0;

//vad tuning: native relies on the os's own speechstart/speechend events, web on raw pcm rms
const VAD_SILENCE_MS = 1500;
const VAD_GRACE_MS = 600;
const VAD_WEB_RMS_THRESHOLD = 0.01;

function VoiceIndicator() {
  const anims = useMemo(() => Array.from({ length: 7 }).map(() => new Animated.Value(1)), []);
  useEffect(() => {
    let isMounted = true;
    const animate = () => {
      if (!isMounted) return;
      const vol = Math.min(1, currentAudioVolume * 50);
      const animations = anims.map((anim, i) => {
        const targetScale = 1 + vol * (2 + Math.sin(Date.now() / 100 + i)) + (Math.random() * vol * 1.5);
        return Animated.timing(anim, {
          toValue: Math.max(1, Math.min(targetScale, 5)),
          duration: 60,
          useNativeDriver: Platform.OS !== "web",
        });
      });
      Animated.parallel(animations).start(() => {
        if (isMounted) requestAnimationFrame(animate);
      });
    };
    animate();
    return () => {
      isMounted = false;
      anims.forEach(a => a.stopAnimation());
    };
  }, [anims]);
  return (
    <View style={styles.voiceIndicatorContainer}>
      {anims.map((anim, i) => (
        <Animated.View key={i} style={[styles.voiceSquare, { transform: [{ scaleY: anim }] }]} />
      ))}
    </View>
  );
}

const ChatBar = forwardRef<ChatBarHandle, ChatInputBarProps>(function ChatBar({
  onSend,
  onStop,
  onTranscribe,
  onTranscribeError,
  placeholder = "Ask",
  incognito = false,
  isGenerating = false,
  supportsFiles = false,
  canTranscribeRemotely = false,
  onOpenSettings,
  onAttachmentSheetVisibilityChange,
  enabled = true,
  autoStartMic = false,
  selection = null,
  onSelectionRemove,
  appContextChip = null,
  onAppContextRemove,
}, ref) {
  const insets = useSafeAreaInsets();
  const bottomInsetToFill = insets.bottom + 16;
  const [text, setText] = useState("");
  const [, setWhisperAvailable] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{ title: string, message: string, buttons?: { text: string, onPress: () => void, style?: "primary" | "secondary" | "danger" }[] }>({ title: "", message: "" });
  const [isAttachmentSheetVisible, setIsAttachmentSheetVisible] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<any[]>([]);
  const autoStartedRef = useRef(false);
  const transcribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    stopRecording: () => {
      setIsRecording(false);
    },
    clear: () => {
      setText("");
      setSelectedFiles([]);
    }
  }));

  const closeSheet = () => {
    setIsAttachmentSheetVisible(false);
  };

  useEffect(() => {
    onAttachmentSheetVisibilityChange?.(isAttachmentSheetVisible);
  }, [isAttachmentSheetVisible, onAttachmentSheetVisibilityChange]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        if (isAttachmentSheetVisible) {
          closeSheet();
        }
      }
    );
    return () => {
      showSubscription.remove();
    };
  }, [isAttachmentSheetVisible]);

  const pcmChunksRef = useRef<ArrayBuffer[]>([]);
  const sampleRateRef = useRef<number>(16000);
  const pulseAnim = useAnimatedValue(1);
  const pressAnim = useAnimatedValue(0);

  const liveTextRef = useRef<string>("");
  const stopResolverRef = useRef<((text: string | null) => void) | null>(null);
  const sendCancelledRef = useRef(false);

  //web vad state (rms threshold)
  const vadHasSpeechRef = useRef(false);
  const vadLastSpeechAtRef = useRef(0);
  const vadStartAtRef = useRef(0);
  const vadTriggeredRef = useRef(false);
  //native vad state (os speechstart/speechend events)
  const vadSpeechEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSTTVolume = () => {
    currentAudioVolume = 0;
  };

  //reset vad state at the start of a new recording
  const resetVad = () => {
    const now = Date.now();
    vadHasSpeechRef.current = false;
    vadLastSpeechAtRef.current = now;
    vadStartAtRef.current = now;
    vadTriggeredRef.current = false;
    clearTimeout(vadSpeechEndTimerRef.current);
    vadSpeechEndTimerRef.current = null;
  };

  //auto-stop recording after a sustained silence following detected speech (web rms)
  const checkVadSilence = (volume: number) => {
    if (!isRecordingRef.current || vadTriggeredRef.current) return;
    const now = Date.now();
    if (now - vadStartAtRef.current < VAD_GRACE_MS) return;
    if (volume > VAD_WEB_RMS_THRESHOLD) {
      vadHasSpeechRef.current = true;
      vadLastSpeechAtRef.current = now;
      return;
    }
    if (vadHasSpeechRef.current && now - vadLastSpeechAtRef.current > VAD_SILENCE_MS) {
      vadTriggeredRef.current = true;
      finishRecording();
    }
  };

  //native: os reported speech has stopped, auto-stop unless speech resumes before the timer fires
  const scheduleNativeVadStop = () => {
    if (vadTriggeredRef.current) return;
    clearTimeout(vadSpeechEndTimerRef.current);
    vadSpeechEndTimerRef.current = setTimeout(() => {
      if (!isRecordingRef.current || vadTriggeredRef.current) return;
      vadTriggeredRef.current = true;
      finishRecording();
    }, VAD_SILENCE_MS);
  };

  //native: os reported speech resumed, cancel any pending auto-stop
  const cancelNativeVadStop = () => {
    clearTimeout(vadSpeechEndTimerRef.current);
    vadSpeechEndTimerRef.current = null;
  };

  //generic entry points per platform, implementations are declared further down
  const startSTT = async () => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line react-hooks/immutability
      await startBatchSTT();
    } else {
      await startContinuousSTT();
    }
  };

  const stopSTT = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return stopBatchSTT();
    }
    return stopContinuousSTT();
  };

  //shared stop path for the mic button and the vad auto-stop
  const finishRecording = async () => {
    const transcribed = await stopSTT();
    if (transcribed) setText(transcribed);
  };

  //native continuous stt
  const startContinuousSTT = async () => {
    try {
      liveTextRef.current = "";
      setText("");
      clearTimeout(transcribeTimerRef.current);
      setIsTranscribing(false);
      setIsRecording(true);
      resetVad();
      const granted = await STT.requestPermissions();
      if (!granted) {
        setIsRecording(false);
        setModalConfig({
          title: "Microphone Permission",
          message: "Microphone access is required for voice input. Please enable it in your device settings.",
          buttons: [{ text: "OK", onPress: () => setModalVisible(false), style: "primary" }]
        });
        setModalVisible(true);
        onTranscribeError?.();
        return;
      }
      let locale = Settings.getCached().whisperLanguage || "en-US";
      if (locale === "auto" || locale.length > 5) locale = "en-US";
      STT.start(locale, {
        onPartial: (t) => { if (t) { liveTextRef.current = t; setText(t); } },
        onFinal: (t) => { if (t) liveTextRef.current = t; },
        onVolume: (v) => { currentAudioVolume = v > 0 ? v / 10 : 0; },
        onSpeechStart: cancelNativeVadStop,
        onSpeechEnd: scheduleNativeVadStop,
        onError: (msg) => {
          console.error("STT error:", msg);
          stopSTTVolume();
          setIsRecording(false);
          setIsTranscribing(false);
          stopResolverRef.current?.(null);
          stopResolverRef.current = null;
          onTranscribeError?.();
        },
        onDone: () => {
          const text = liveTextRef.current.trim() || null;
          liveTextRef.current = "";
          const resolver = stopResolverRef.current;
          stopResolverRef.current = null;
          setIsTranscribing(false);
          resolver?.(text);
        },
      });
    } catch (e) {
      console.error("failed to start continuous STT:", e);
      stopSTTVolume();
      setIsRecording(false);
      setIsTranscribing(false);
      onTranscribeError?.();
    }
  };

  //stop stt resolve with transcript
  const stopContinuousSTT = (): Promise<string | null> => {
    stopSTTVolume();
    cancelNativeVadStop();
    setIsRecording(false);
    setIsTranscribing(true);
    STT.stop();
    clearTimeout(transcribeTimerRef.current);
    return new Promise<string | null>((resolve) => {
      stopResolverRef.current = resolve;
      transcribeTimerRef.current = setTimeout(() => {
        const resolver = stopResolverRef.current;
        stopResolverRef.current = null;
        setIsTranscribing(false);
        resolver?.(liveTextRef.current.trim() || null);
        liveTextRef.current = "";
      }, 3000);
    });
  };

  const webAudioContextRef = useRef<AudioContext | null>(null);
  const webAudioStreamRef = useRef<MediaStream | null>(null);
  const webAudioProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const isRecordingRef = useRef(false);

  useEffect(() => {
    const handleBackButton = () => {
      if (isAttachmentSheetVisible) {
        closeSheet();
        return true;
      }
      if (isTranscribing) {
        clearTimeout(transcribeTimerRef.current);
        stopResolverRef.current?.(null);
        stopResolverRef.current = null;
        sendCancelledRef.current = true;
        setIsTranscribing(false);
        return true;
      }
      if (isRecording) {
        if (Platform.OS === 'web') {
          if (webAudioProcessorRef.current) webAudioProcessorRef.current.disconnect();
          if (webAudioContextRef.current) webAudioContextRef.current.close();
          if (webAudioStreamRef.current) webAudioStreamRef.current.getTracks().forEach(t => t.stop());
        } else {
          stopSTTVolume();
          cancelNativeVadStop();
          STT.abort();
        }
        setIsRecording(false);
        pcmChunksRef.current = [];
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackButton
    );

    return () => backHandler.remove();
  }, [isAttachmentSheetVisible, isRecording, isTranscribing]);

  //cleanup pending transcribe timer on unmount
  useEffect(() => {
    return () => {
      clearTimeout(transcribeTimerRef.current);
      clearTimeout(vadSpeechEndTimerRef.current);
      if (Platform.OS !== 'web') STT.abort();
    };
  }, []);

  useEffect(() => {
    if (autoStartMic && !autoStartedRef.current) {
      autoStartedRef.current = true;
      setTimeout(() => startSTT(), 800);
    }
    //fires once, guarded by autoStartedRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartMic]);

  const toggleAttachmentSheet = async () => {
    if (isAttachmentSheetVisible) {
      closeSheet();
    } else {
      Keyboard.dismiss();
      const { status } = await MediaLibrary.getPermissionsAsync();
      if (status !== 'granted') {
        await MediaLibrary.requestPermissionsAsync();
      }
      setIsAttachmentSheetVisible(true);
    }
  };

  useEffect(() => {
    if (!isAttachmentSheetVisible) return;

    const getRecentPhotos = async () => {
      const { status } = await MediaLibrary.getPermissionsAsync();
      if (status === 'granted') {
        const media = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: 10,
          sortBy: ['creationTime'],
        });
        setRecentPhotos(media.assets);
      }
    };
    getRecentPhotos();
  }, [isAttachmentSheetVisible]);

  const handleCamera = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      setModalConfig({ title: "Permission Denied", message: "You've refused to allow this app to access your camera!" });
      setModalVisible(true);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedFiles(prev => [...prev, {
        uri: asset.uri,
        type: 'image',
        name: asset.fileName || 'camera_image.jpg'
      }]);
      setIsAttachmentSheetVisible(false);
    }
  };

  const handlePhotos = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      setModalConfig({ title: "Permission Denied", message: "You've refused to allow this app to access your photos!" });
      setModalVisible(true);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (!result.canceled && result.assets) {
      const newFiles = result.assets.map(asset => ({
        uri: asset.uri,
        type: 'image',
        name: asset.fileName || 'photo.jpg'
      }));
      setSelectedFiles(prev => [...prev, ...newFiles]);
      setIsAttachmentSheetVisible(false);
    }
  };

  const handleSelectRecentPhoto = (photo: any) => {
    setSelectedFiles(prev => {
      const targetUri = photo.uri || photo.localUri;
      const isSelected = prev.some(f => (f.id && f.id === photo.id) || f.uri === targetUri);
      if (isSelected) {
        return prev.filter(f => !((f.id && f.id === photo.id) || f.uri === targetUri));
      } else {
        return [...prev, {
          uri: targetUri,
          type: 'image',
          name: photo.filename || 'recent_photo.jpg',
          id: photo.id
        }];
      }
    });
  };



  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const checkWhisper = async () => {
      const modelName = Settings.getCached().whisperModel || "base";
      const isInstalled = await WhisperSTT.isModelInstalled(modelName);
      if (isInstalled) {
        WhisperSTT.init(modelName).then((ok) => setWhisperAvailable(ok));
      }
    };
    checkWhisper();
  }, []);

  useEffect(() => {
    isRecordingRef.current = isRecording;
    if (isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const handlePressIn = () => {
    Vibration.vibrate(10);
    Animated.timing(pressAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
  };

  const handlePressOut = () => {
    Animated.timing(pressAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const backgroundColor = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: incognito ? [Colors.incognito, Colors.incognitoBright] : [Colors.primary, Colors.primaryBright],
  });

  const startRecording = async () => {
    try {
      pcmChunksRef.current = [];
      setIsRecording(true);
      resetVad();
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      webAudioStreamRef.current = ms;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioCtx({ sampleRate: 16000 });
      webAudioContextRef.current = context;
      const source = context.createMediaStreamSource(ms);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        if (isRecordingRef.current) {
          const inputData = e.inputBuffer.getChannelData(0);
          const chunk = new Float32Array(inputData);
          pcmChunksRef.current.push(chunk.buffer);
          sampleRateRef.current = context.sampleRate;

          let sum = 0;
          for (let i = 0; i < chunk.length; i++) {
            sum += chunk[i] * chunk[i];
          }
          currentAudioVolume = Math.sqrt(sum / chunk.length);
          checkVadSilence(currentAudioVolume);
        }
      };
      source.connect(processor);
      processor.connect(context.destination);
      webAudioProcessorRef.current = processor;
    } catch (e) {
      console.error("failed to start audio stream:", e);
      setIsRecording(false);
    }
  };

  const stopBatchSTT = async (): Promise<string | null> => {
    try {
      if (webAudioProcessorRef.current) {
        webAudioProcessorRef.current.disconnect();
        webAudioProcessorRef.current = null;
      }
      if (webAudioContextRef.current) {
        webAudioContextRef.current.close();
        webAudioContextRef.current = null;
      }
      if (webAudioStreamRef.current) {
        webAudioStreamRef.current.getTracks().forEach(track => track.stop());
        webAudioStreamRef.current = null;
      }
      setIsRecording(false);
      const chunks = pcmChunksRef.current;
      pcmChunksRef.current = [];
      if (chunks.length === 0) return null;
      setIsTranscribing(true);
      const wavBuffer = buildWavBuffer(chunks, sampleRateRef.current);
      //delegate to parent or whisper
      const transcribed = onTranscribe
        ? await onTranscribe(wavBuffer)
        : await WhisperSTT.transcribeData(wavBuffer);
      setIsTranscribing(false);
      return transcribed;
    } catch (e) {
      console.error("transcription failed:", e);
      setIsTranscribing(false);
      return null;
    }
  };

  const handlePickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3'],
        multiple: true,
        copyToCacheDirectory: true
      });
      if (!result.canceled && result.assets) {
        const validFiles: SelectedFile[] = [];
        let hasInvalidFile = false;

        for (const a of result.assets) {
          const kind = classifyAttachment(a.name, a.mimeType);
          if (kind === 'unsupported') {
            hasInvalidFile = true;
            continue;
          }
          validFiles.push({ uri: a.uri, type: kind, name: a.name });
        }

        if (hasInvalidFile) {
          setModalConfig({ title: "Unsupported Format", message: "Only WAV and MP3 audio files are supported." });
          setModalVisible(true);
        }

        if (validFiles.length > 0) {
          setSelectedFiles(prev => [...prev, ...validFiles]);
        }
        setIsAttachmentSheetVisible(false);
      }
    } catch (e) {
      console.error("Failed to pick files", e);
    }
  };

  const startBatchSTT = async () => {
    if (!canTranscribeRemotely) {
      const modelName = Settings.getCached().whisperModel || "base";
      if (modelName === "none") {
        setModalConfig({
          title: "Whisper Not Configured",
          message: "You have disabled on-device transcription. Please select a Whisper model in settings to enable it.",
          buttons: [
            { text: "Cancel", onPress: () => setModalVisible(false), style: "secondary" },
            {
              text: "Settings", onPress: () => {
                setModalVisible(false);
                if (onOpenSettings) onOpenSettings();
              }, style: "primary"
            }
          ]
        });
        setModalVisible(true);
        setIsRecording(false);
        return;
      }

      const isInstalled = await WhisperSTT.isModelInstalled(modelName);
      if (!isInstalled) {
        setModalConfig({
          title: "Whisper Not Installed",
          message: `The Whisper ${modelName} model is required for on-device transcription. Would you like to install it?`,
          buttons: [
            { text: "Cancel", onPress: () => setModalVisible(false), style: "secondary" },
            {
              text: "Install", onPress: () => {
                setModalVisible(false);
                if (onOpenSettings) onOpenSettings();
              }, style: "primary"
            }
          ]
        });
        setModalVisible(true);
        setIsRecording(false);
        return;
      }

      const initialized = await WhisperSTT.init(modelName);
      if (!initialized) {
        setModalConfig({
          title: "Initialization Error",
          message: `Failed to load the Whisper ${modelName} model. It might be corrupted or incompatible. Please try reinstalling it from the settings.`,
          buttons: [
            { text: "Cancel", onPress: () => setModalVisible(false), style: "secondary" },
            {
              text: "Settings", onPress: () => {
                setModalVisible(false);
                if (onOpenSettings) onOpenSettings();
              }, style: "primary"
            }
          ]
        });
        setModalVisible(true);
        setIsRecording(false);
        return;
      }
    }
    await startRecording();
  };

  const handleMicPress = async () => {
    if (isRecording) {
      await finishRecording();
    } else {
      await startSTT();
    }
  };

  //one chip row for both
  const attachments: { key: string; kind: string; uri: string; name: string; onRemove: () => void }[] = [];
  if (selection) {
    attachments.push({ key: 'selection', kind: 'image', uri: selection.uri, name: selection.label, onRemove: () => onSelectionRemove?.() });
  }
  selectedFiles.forEach((file, index) => {
    attachments.push({
      key: `file-${index}`,
      kind: file.type,
      uri: file.uri,
      name: file.name,
      onRemove: () => setSelectedFiles(prev => prev.filter((_, i) => i !== index)),
    });
  });

  const hasAttachments = attachments.length > 0 || !!appContextChip;
  const [renderFiles, setRenderFiles] = useState(hasAttachments);
  const filesAnim = useAnimatedValue(hasAttachments ? 1 : 0);
  const [drawerHeight, setDrawerHeight] = useState(36);

  //keep the drawer mounted through the close slide, unmount when it finishes
  useEffect(() => {
    if (hasAttachments) {
      setRenderFiles(true);
      const raf = requestAnimationFrame(() => {
        Animated.timing(filesAnim, {
          toValue: 1,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }).start();
      });
      return () => cancelAnimationFrame(raf);
    } else {
      Animated.timing(filesAnim, {
        toValue: 0,
        duration: 130,
        easing: Easing.in(Easing.quad),
        useNativeDriver: Platform.OS !== "web",
      }).start(() => setRenderFiles(false));
    }
  }, [hasAttachments, filesAnim]);

  //only picked files need compressing
  const buildImages = async (): Promise<string[]> => {
    const picked = await Promise.all(
      selectedFiles.map(f => f.type === 'image'
        ? compressImageToDataUri(f.uri)
        : Promise.resolve(`${f.uri}?name=${encodeURIComponent(f.name)}`))
    );
    return selection?.uri ? [...picked, selection.uri] : picked;
  };

  const handleSend = async () => {
    const wasRecording = isRecording;
    let voiceText: string | null = null;
    if (wasRecording) {
      voiceText = await stopSTT();
      const cancelled = sendCancelledRef.current;
      sendCancelledRef.current = false;
      if (cancelled) return;
    }
    const finalText = (voiceText ?? text).trim();
    if ((finalText || attachments.length > 0) && onSend) {
      const images = await buildImages();
      onSend(finalText, images, voiceText != null);
      setText("");
      setSelectedFiles([]);
    } else if (voiceText === null && wasRecording && autoStartMic) {
      onTranscribeError?.();
    }
  };

  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web') {
      if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
        e.preventDefault();
        if (!isGenerating) {
          handleSend();
        }
      }
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !supportsFiles) return;

    const handleGlobalPaste = (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData || (window as any).clipboardData;
      if (!clipboardData) return;

      const pastedFiles = Array.from(clipboardData.files || []) as File[];
      if (pastedFiles.length > 0) {
        e.preventDefault();

        const promises = pastedFiles.map(file => {
          return new Promise<SelectedFile | null>((resolve) => {
            const name = file.name || "pasted_file";
            const kind = classifyAttachment(name, file.type);
            if (kind === 'unsupported') {
              resolve(null);
              return;
            }

            const reader = new FileReader();
            reader.onload = (ev) => {
              resolve({ uri: ev.target?.result as string, type: kind, name });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          });
        });

        Promise.all(promises).then(results => {
          const validFiles = results.filter(r => r !== null) as SelectedFile[];

          if (validFiles.length < pastedFiles.length) {
            setModalConfig({ title: "Unsupported Format", message: "Only images, WAV and MP3 audio files are supported." });
            setModalVisible(true);
          }

          if (validFiles.length > 0) {
            setSelectedFiles(prev => [...prev, ...validFiles]);
          }
        });
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [supportsFiles]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      enabled={enabled}
      style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}
    >
      <View style={{ width: '100%', alignItems: 'center', zIndex: 2, elevation: 9 }}>
        <Animated.View style={{ width: '100%', maxWidth: 800, zIndex: 2, elevation: 9 }}>
          <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.pressableWrapper}>
            <Animated.View style={{ transform: [{ scale }] }}>
              {renderFiles ? (
                <Animated.View
                  onLayout={e => setDrawerHeight(e.nativeEvent.layout.height)}
                  style={{
                    transform: [{ translateY: filesAnim.interpolate({ inputRange: [0, 1], outputRange: [drawerHeight, 0] }) }],
                  }}
                >
                  <View style={[styles.filesContainerTop, incognito && styles.filesContainerTopIncognito]}>
                    <View style={styles.fileChipsContainer}>
                      {appContextChip && (
                        <View style={styles.filePreviewContainerTop}>
                          <Image source={{ uri: appContextChip.icon }} style={styles.appContextChipIcon} resizeMode="contain" />
                          {onAppContextRemove && (
                            <Pressable style={({ pressed, hovered }) => [styles.removeFileBtnTop, (pressed || hovered) && { opacity: 0.8 }]} onPress={onAppContextRemove}>
                              <Text style={styles.removeFileBtnTextTop}>✕</Text>
                            </Pressable>
                          )}
                        </View>
                      )}
                      {attachments.map(chip => (
                        <View key={chip.key} style={styles.filePreviewContainerTop}>
                          {chip.kind === 'image' ? (
                            <Image source={{ uri: chip.uri }} style={styles.filePreviewImageTop} />
                          ) : (
                            <View style={styles.filePreviewAudioTop}>
                              <Text style={styles.filePreviewAudioTextTop} numberOfLines={1}>{chip.name}</Text>
                            </View>
                          )}
                          <Pressable style={({ pressed, hovered }) => [styles.removeFileBtnTop, (pressed || hovered) && { opacity: 0.8 }]} onPress={chip.onRemove}>
                            <Text style={styles.removeFileBtnTextTop}>✕</Text>
                          </Pressable>
                        </View>
                      ))}
                      <Text style={[styles.filesAddedText, incognito && { color: Colors.textMuted }]}>
                        {(() => {
                          const filesPart = attachments.length > 0 ? `${attachments.length} File${attachments.length !== 1 ? 's' : ''}` : '';
                          const appPart = appContextChip ? 'App context' : '';
                          if (filesPart && appPart) return `${filesPart} and app context Added`;
                          if (filesPart) return `${filesPart} Added`;
                          return `${appPart} Added`;
                        })()}
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              ) : null}

              <Animated.View
                style={[
                  styles.container,
                  incognito && styles.containerIncognito,
                  { backgroundColor: backgroundColor }
                ]}
              >
                {supportsFiles && (
                  <Pressable onPress={Platform.OS === 'web' ? handlePickFiles : toggleAttachmentSheet} onPressIn={handlePressIn} onPressOut={handlePressOut} style={({ pressed, hovered }) => [styles.plusButton, (pressed || hovered) && { opacity: 0.8 }]}>
                    <Image source={addIcon} style={styles.plusIcon} tintColor={Colors.surface} />
                  </Pressable>
                )}

                {(Platform.OS !== 'web' || Settings.getCached().whisperModel !== 'none' || canTranscribeRemotely) && !isGenerating && (
                  <Pressable onPress={handleMicPress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={({ pressed, hovered }) => [styles.micButton, (pressed || hovered) && { opacity: 0.8 }]}>
                    <Animated.View style={{ opacity: isRecording ? pulseAnim : 1 }}>
                      <Image source={isRecording ? stopIcon : micIcon} style={styles.micIcon} tintColor={Colors.surface} />
                    </Animated.View>
                  </Pressable>
                )}

                {isRecording ? (
                  <VoiceIndicator />
                ) : (
                  <View style={{ flex: 1, marginLeft: 8, justifyContent: 'center' }}>
                    <TextInputWrapper
                      onPaste={(payload) => {
                        if (supportsFiles && payload.type === "images") {
                          const newFiles = payload.uris.map(uri => ({
                            uri,
                            type: "image",
                            name: uri.split('/').pop() || "pasted_image.png"
                          }));
                          setSelectedFiles(prev => [...prev, ...newFiles]);
                        }
                      }}
                    >
                      <TextInput
                        style={[
                          styles.input,
                          { maxHeight: 36, minHeight: 36, lineHeight: 20 },
                          Platform.OS === 'web' && { outlineStyle: 'none', margin: 0, paddingHorizontal: 0, overflow: 'hidden' } as any
                        ]}
                        value={isTranscribing ? "Transcribing..." : text}
                        onChangeText={isTranscribing ? undefined : setText}
                        placeholder={placeholder}
                        placeholderTextColor={Colors.whiteSoft}
                        multiline={true}
                        numberOfLines={1}
                        editable={!isTranscribing}
                        onTouchStart={handlePressIn}
                        onTouchEnd={handlePressOut}
                        onKeyPress={handleKeyPress}
                      />
                    </TextInputWrapper>
                  </View>
                )}

                {isGenerating ? (
                  <Pressable onPress={onStop} onPressIn={handlePressIn} onPressOut={handlePressOut} style={({ pressed, hovered }) => [styles.sendButton, (pressed || hovered) && { opacity: 0.8 }]}>
                    <Image source={stopIcon} style={styles.sendIcon} tintColor={Colors.surface} />
                  </Pressable>
                ) : (
                  <Pressable onPress={handleSend} onPressIn={handlePressIn} onPressOut={handlePressOut} style={({ pressed, hovered }) => [styles.sendButton, (pressed || hovered) && { opacity: 0.8 }]}>
                    <Image source={nextWhiteIcon} style={styles.sendIcon} tintColor={Colors.surface} />
                  </Pressable>
                )}
              </Animated.View>
            </Animated.View>
          </Pressable>

        </Animated.View>
      </View>

      <View style={{ width: '100%', height: insets.bottom }} />

      <AttachmentSheet
        bottomInset={bottomInsetToFill}
        visible={isAttachmentSheetVisible}
        incognito={incognito}
        onClose={closeSheet}
        onCamera={handleCamera}
        onPickFiles={handlePickFiles}
        onPhotos={handlePhotos}
        recentPhotos={recentPhotos}
        selectedFiles={selectedFiles}
        onSelectRecentPhoto={handleSelectRecentPhoto}
        onLongPressRecentPhoto={handleSelectRecentPhoto}
      />

      <NotificationModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        buttons={modalConfig.buttons}
        onClose={() => setModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
});

export default ChatBar;

const styles = StyleSheet.create({
  pressableWrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  container: {
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.xxl,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    height: 56,
    boxShadow: `2px 6px 22px ${Colors.primary}`,
    elevation: 8,
  },
  containerIncognito: {
    boxShadow: `2px 6px 15px ${Colors.incognito}`,
  },
  plusButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  micButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  micIcon: {
    width: 18,
    height: 18,
  },
  plusIcon: {
    width: 18,
    height: 18,

  },
  input: {
    color: Colors.surface,
    fontSize: FontSizes.md,
    paddingVertical: 8,
  },
  voiceIndicatorContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    marginRight: 8,
    gap: 12,
  },
  voiceSquare: {
    width: 3,
    height: 6,
    backgroundColor: Colors.surface,
  },
  sendButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: {
    width: 18,
    height: 18,
  },
  filesContainerTop: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderTopLeftRadius: Radius.lg2,
    borderTopRightRadius: Radius.lg2,
    borderBottomWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 10,
    marginBottom: -10,
    marginHorizontal: 10,
  },
  filesContainerTopIncognito: {
    backgroundColor: Colors.incognitoSurface,
    borderColor: Colors.border,
  },
  fileChipsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  filePreviewContainerTop: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  filePreviewImageTop: {
    width: 44,
    height: 32,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: Colors.textMuted,
  },
  appContextChipIcon: {
    width: 32,
    height: 32,
    backgroundColor: 'transparent',
  },
  filePreviewAudioTop: {
    width: 44,
    height: 32,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: Colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  filePreviewAudioTextTop: {
    color: 'white',
    fontSize: FontSizes.xxs,
    textAlign: 'center',
  },
  removeFileBtnTop: {
    position: 'absolute',
    right: 4,
    backgroundColor: Colors.overlayStrong,
    borderRadius: Radius.xl,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeFileBtnTextTop: {
    color: 'white',
    fontSize: FontSizes.labelSm,
    fontWeight: 'bold',
  },
  filesAddedText: {
    fontFamily: Fonts.mono,
    color: Colors.textMuted,
    fontSize: FontSizes.bodyMd,
    marginLeft: 4,
  },
});