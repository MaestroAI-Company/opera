
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import { TextInputWrapper } from "expo-paste-input";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  PanResponder,
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

import { Settings } from "../../services/settings/SettingsService";
import { STT } from "../../services/speech/STTService";
import AttachmentSheet, { SelectedFile } from "./AttachmentSheet";
import NotificationModal from "../ui/NotificationModal";
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";

const nextWhiteIcon = require("../../../assets/icons/arrow.png");
const micIcon = require("../../../assets/icons/microphone.png");
const addIcon = require("../../../assets/icons/add.png");
const stopIcon = require("../../../assets/icons/stop.png");

const IMAGE_MAX_WIDTH = 1280;
const IMAGE_COMPRESS_QUALITY = 0.7;

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
  onPlusPress?: () => void;
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
  [riff, wave, fmt, data].forEach(() => { });
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

function VoiceIndicator() {
  const anims = useRef(Array.from({ length: 7 }).map(() => new Animated.Value(1))).current;
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
  onPlusPress,
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
}, ref) {
  useImperativeHandle(ref, () => ({
    stopRecording: () => {
      setIsRecording(false);
    },
    clear: () => {
      setText("");
      setSelectedFiles([]);
    }
  }));
  const insets = useSafeAreaInsets();
  const bottomInsetToFill = insets.bottom + 16;
  const [text, setText] = useState("");
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{ title: string, message: string, buttons?: { text: string, onPress: () => void, style?: "primary" | "secondary" | "danger" }[] }>({ title: "", message: "" });
  const [isAttachmentSheetVisible, setIsAttachmentSheetVisible] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<any[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const autoStartedRef = useRef(false);
  const transcribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sheetHeightAnim = useRef(new Animated.Value(0)).current;
  const spacerHeightAnim = useRef(new Animated.Value(insets.bottom)).current;
  const targetSheetHeight = useRef(200);

  const closeSheet = () => {
    setIsAttachmentSheetVisible(false);
  };

  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (e, gestureState) => {
        if (gestureState.dy > 0) {
          sheetHeightAnim.setValue(Math.max(0, targetSheetHeight.current - gestureState.dy));
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          closeSheet();
        } else {
          Animated.spring(sheetHeightAnim, {
            toValue: targetSheetHeight.current,
            useNativeDriver: false,
            bounciness: 4,
            speed: 12,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!isAttachmentSheetVisible) {
      setIsSelectionMode(false);
    }
  }, [isAttachmentSheetVisible]);

  useEffect(() => {
    onAttachmentSheetVisibilityChange?.(isAttachmentSheetVisible);
  }, [isAttachmentSheetVisible]);

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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pressAnim = useRef(new Animated.Value(0)).current;

  const liveTextRef = useRef<string>("");
  const sttModeRef = useRef<'stt' | 'whisper'>('whisper');

  const stopSTTVolume = () => {
    currentAudioVolume = 0;
  };

  //web-only whisper surface (stt resolves to the whisper implementation there)
  const webSTT = STT as unknown as {
    isModelInstalled(modelName: string): Promise<boolean>;
    init(modelName: string): Promise<boolean>;
    isAvailable(): boolean;
    transcribeData(buffer: ArrayBuffer): Promise<string>;
  };

  //native stt, partials fill input, volume drives the indicator
  const startExpoSTT = async () => {
    try {
      sttModeRef.current = 'stt';
      liveTextRef.current = "";
      setText("");
      clearTimeout(transcribeTimerRef.current);
      setIsTranscribing(false);
      setIsRecording(true);
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
        onError: (msg) => {
          console.error("STT error:", msg);
          stopSTTVolume();
          setIsRecording(false);
          onTranscribeError?.();
        },
        onDone: () => {},
      });
    } catch (e) {
      console.error("failed to start expo STT:", e);
      stopSTTVolume();
      setIsRecording(false);
      onTranscribeError?.();
    }
  };

  //stop stt, keep the transcribe state 1s so the final result lands, then send or fill input
  const stopExpoSTT = (send: boolean) => {
    stopSTTVolume();
    setIsRecording(false);
    setIsTranscribing(true);
    STT.stop();
    clearTimeout(transcribeTimerRef.current);
    transcribeTimerRef.current = setTimeout(() => {
      setIsTranscribing(false);
      const finalText = liveTextRef.current.trim();
      liveTextRef.current = "";
      if (finalText.length > 0) {
        if (send) {
          onSend?.(finalText, undefined, true);
          setText("");
        } else {
          setText(finalText);
        }
      } else if (autoStartMic) {
        onTranscribeError?.();
      }
    }, 1000);
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
      if (Platform.OS !== 'web') STT.abort();
    };
  }, []);

  useEffect(() => {
    if (selectedFiles.length === 0 && isSelectionMode) {
      setIsSelectionMode(false);
    }
  }, [selectedFiles.length, isSelectionMode]);

  useEffect(() => {
    if (autoStartMic && !autoStartedRef.current) {
      autoStartedRef.current = true;
      // skip whisper checks, parent handles transcription
      setTimeout(() => (Platform.OS === 'web' ? startRecording() : startExpoSTT()), 800);
    }
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
    if (isAttachmentSheetVisible) {
      Animated.parallel([
        Animated.spring(sheetHeightAnim, {
          toValue: targetSheetHeight.current,
          useNativeDriver: false,
          bounciness: 4,
          speed: 12,
        }),
        Animated.timing(spacerHeightAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        })
      ]).start();

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
    } else {
      Animated.parallel([
        Animated.timing(sheetHeightAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }),
        Animated.timing(spacerHeightAnim, {
          toValue: insets.bottom,
          duration: 250,
          useNativeDriver: false,
        })
      ]).start();
    }
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

  const handleLongPressRecentPhoto = (photo: any) => {
    handleSelectRecentPhoto(photo);
  };



  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const checkWhisper = async () => {
      const modelName = Settings.getCached().whisperModel || "base";
      const isInstalled = await webSTT.isModelInstalled(modelName);
      if (isInstalled) {
        webSTT.init(modelName).then((ok) => setWhisperAvailable(ok));
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
  }, [isRecording]);

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
      sttModeRef.current = 'whisper';
      pcmChunksRef.current = [];
      setIsRecording(true);
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

  const stopAndTranscribe = async (): Promise<string | null> => {
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
      //delegate to parent if provided, otherwise use whisper directly
      const transcribed = onTranscribe
        ? await onTranscribe(wavBuffer)
        : await webSTT.transcribeData(wavBuffer);
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
          const isImage = a.mimeType?.startsWith('image/');
          const isAudio = a.mimeType?.startsWith('audio/') || a.name.toLowerCase().match(/\.(wav|mp3|m4a|aac|flac|ogg)$/);

          if (isImage) {
            validFiles.push({ uri: a.uri, type: 'image', name: a.name });
            continue;
          }

          if (isAudio) {
            const ext = a.name.toLowerCase().split('.').pop();
            if (ext === 'wav' || ext === 'mp3') {
              validFiles.push({ uri: a.uri, type: 'audio', name: a.name });
            } else {
              hasInvalidFile = true;
            }
          }
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

  const startWhisperRecording = async () => {
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

      const isInstalled = await webSTT.isModelInstalled(modelName);
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

      const initialized = await webSTT.init(modelName);
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
      if (sttModeRef.current === 'stt') {
        stopExpoSTT(true);
      } else {
        if (webAudioProcessorRef.current) webAudioProcessorRef.current.disconnect();
        if (webAudioContextRef.current) webAudioContextRef.current.close();
        if (webAudioStreamRef.current) webAudioStreamRef.current.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        pcmChunksRef.current = [];
      }
    } else {
      if (Platform.OS === 'web') {
        await startWhisperRecording();
      } else {
        await startExpoSTT();
      }
    }
  };

  const handleSend = async () => {
    if (isRecording) {
      if (sttModeRef.current === 'stt') {
        stopExpoSTT(true);
        return;
      }
      const transcribed = await stopAndTranscribe();
      if (transcribed && transcribed.length > 0) {
        setText(transcribed);
      } else if (autoStartMic && !transcribed) {
        onTranscribeError?.();
      }
      return;
    }
    if ((text.trim() || selectedFiles.length > 0) && onSend) {
      const images = await Promise.all(
        selectedFiles.map(f => f.type === 'image'
          ? compressImageToDataUri(f.uri)
          : Promise.resolve(`${f.uri}?name=${encodeURIComponent(f.name)}`))
      );
      onSend(text.trim(), images);
      setText("");
      setSelectedFiles([]);
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
            const mimeType = file.type;
            const name = file.name || "pasted_file";
            const isImage = mimeType.startsWith('image/');
            const isAudio = mimeType.startsWith('audio/') || name.toLowerCase().match(/\.(wav|mp3|m4a|aac|flac|ogg)$/);

            if (!isImage && !isAudio) {
              resolve(null);
              return;
            }

            if (isAudio) {
              const ext = name.toLowerCase().split('.').pop();
              if (ext !== 'wav' && ext !== 'mp3') {
                resolve(null);
                return;
              }
            }

            const reader = new FileReader();
            reader.onload = (ev) => {
              resolve({
                uri: ev.target?.result as string,
                type: isImage ? 'image' : 'audio',
                name
              });
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
              {selectedFiles.length > 0 && (
                <View style={[styles.filesContainerTop, incognito && styles.filesContainerTopIncognito]}>
                  <View style={styles.fileChipsContainer}>
                    {selectedFiles.map((file, i) => (
                      <View key={i} style={styles.filePreviewContainerTop}>
                        {file.type === 'image' ? (
                          <Image source={{ uri: file.uri }} style={styles.filePreviewImageTop} />
                        ) : (
                          <View style={styles.filePreviewAudioTop}>
                            <Text style={styles.filePreviewAudioTextTop} numberOfLines={1}>{file.name}</Text>
                          </View>
                        )}
                        <Pressable style={({ pressed, hovered }) => [styles.removeFileBtnTop, (pressed || hovered) && { opacity: 0.8 }]} onPress={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))}>
                          <Text style={styles.removeFileBtnTextTop}>✕</Text>
                        </Pressable>
                      </View>
                    ))}
                    <Text style={[styles.filesAddedText, incognito && { color: Colors.textDisabledStrong }]}>
                      {selectedFiles.length} File{selectedFiles.length !== 1 ? 's' : ''} Added
                    </Text>
                  </View>
                </View>
              )}

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
                      <Image source={isRecording ? stopIcon : micIcon} style={[styles.micIcon, isRecording && styles.micIconRecording]} tintColor={Colors.surface} />
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

      <Animated.View style={{ width: '100%', height: spacerHeightAnim }} />

      {/* attachment sheet */}
      <Animated.View
        style={{
          height: sheetHeightAnim,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        <View onLayout={(e) => {
          const newHeight = Math.max(150, e.nativeEvent.layout.height);
          if (targetSheetHeight.current !== newHeight) {
            targetSheetHeight.current = newHeight;
            if (isAttachmentSheetVisible) {
              Animated.spring(sheetHeightAnim, {
                toValue: newHeight,
                useNativeDriver: false,
                bounciness: 4,
                speed: 12,
              }).start();
            }
          }
        }}>
          <AttachmentSheet
            bottomInset={bottomInsetToFill}
            visible={isAttachmentSheetVisible}
            incognito={incognito}
            onCamera={handleCamera}
            onPickFiles={handlePickFiles}
            onPhotos={handlePhotos}
            recentPhotos={recentPhotos}
            selectedFiles={selectedFiles}
            onSelectRecentPhoto={handleSelectRecentPhoto}
            onLongPressRecentPhoto={handleLongPressRecentPhoto}
            panHandlers={handlePanResponder.panHandlers}
          />
        </View>
      </Animated.View>

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
  micIconRecording: {

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
    borderColor: Colors.incognitoBorder,
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
    backgroundColor: Colors.textFaint,
  },
  filePreviewAudioTop: {
    width: 44,
    height: 32,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: Colors.textFaint,
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
    color: Colors.textDisabled,
    fontSize: FontSizes.bodyMd,
    marginLeft: 4,
  },
});