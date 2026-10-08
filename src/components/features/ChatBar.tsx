
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { TextInputWrapper } from "expo-paste-input";
import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Image,
  Keyboard,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextLayoutEventData,
  TextLayoutLine,
  Vibration,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import {
  DOCUMENT_MIME_TYPES,
  classifyDocument,
  extractDocument,
  formatDocumentsForPrompt,
  type ExtractedDocument,
} from "../../services/documents/DocumentService";
import { findMentionSpans, listMentionables, MentionSpan } from "../../services/ai/mentions";
import { Settings } from "../../services/settings/SettingsService";
import { STT, WhisperSTT } from "../../services/speech/STTService";
import NotificationModal from "../ui/NotificationModal";
import AttachmentSheet, { SelectedFile } from "./AttachmentSheet";
import { pressStyle } from "../ui/pressStyle";

const nextWhiteIcon = require("../../../assets/icons/arrow.png");
const micIcon = require("../../../assets/icons/microphone.png");
const addIcon = require("../../../assets/icons/add.png");
const stopIcon = require("../../../assets/icons/stop.png");
const fileIcon = require("../../../assets/icons/file.png");
const pencilIcon = require("../../../assets/icons/pencil.png");

const IMAGE_MAX_WIDTH = 1280;
const IMAGE_COMPRESS_QUALITY = 0.7;

//only two audio containers accepted
const SUPPORTED_AUDIO_EXTENSIONS = ['wav', 'mp3'];
const AUDIO_EXTENSION_PATTERN = /\.(wav|mp3|m4a|aac|flac|ogg)$/;
const VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|webm)$/;
const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

//@query typed at the text end
const MENTION_QUERY_RE = /(^|\s)@([\w-]*)$/;

type AttachmentKind = 'image' | 'audio' | 'video' | 'document' | 'unsupported';

//one attach rule for all pickers
function classifyAttachment(name: string, mimeType?: string | null): AttachmentKind {
  if (mimeType?.startsWith('image/')) return 'image';

  const lowerName = name.toLowerCase();
  if (VIDEO_EXTENSION_PATTERN.test(lowerName) || VIDEO_MIME_TYPES.includes(mimeType ?? '')) return 'video';
  if (mimeType?.startsWith('video/')) return 'unsupported';
  const looksLikeAudio = mimeType?.startsWith('audio/') || AUDIO_EXTENSION_PATTERN.test(lowerName);
  if (!looksLikeAudio) return classifyDocument(name, mimeType) ? 'document' : 'unsupported';

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
  onTranscribe?: (wavBuffer: ArrayBuffer, localFallback?: string | null) => Promise<string | null>;
  onTranscribeError?: () => void;
  placeholder?: string;
  incognito?: boolean;
  isGenerating?: boolean;
  modelCapabilities?: string[];
  canTranscribeRemotely?: boolean;
  onOpenSettings?: () => void;
  onAttachmentSheetVisibilityChange?: (visible: boolean) => void;
  autoStartMic?: boolean;
  //screen-selection attachment from overlay
  selection?: { uri: string; label: string } | null;
  onSelectionRemove?: () => void;
  //foreground-app chip from overlay
  appContextChip?: { icon: string; label: string } | null;
  onAppContextRemove?: () => void;
  //message edit mode
  editing?: boolean;
  onEditCancel?: () => void;
  editDraft?: { id: string; text: string } | null;
  editFiles?: SelectedFile[] | null;
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

//deletion inside a mention keeps @
function collapseMention(base: string, next: string): string | null {
  if (next.length >= base.length) return null;
  let start = 0;
  while (start < next.length && next[start] === base[start]) start++;
  let tail = 0;
  while (tail < next.length - start && next[next.length - 1 - tail] === base[base.length - 1 - tail]) tail++;
  if (start + tail !== next.length) return null;
  const end = base.length - tail;
  const span = findMentionSpans(base).find(m => start > m.start && end <= m.end);
  return span ? base.slice(0, span.start + 1) + base.slice(span.end) : null;
}

const INPUT_PADDING_VERTICAL = 6;
const MENTION_LIST_MAX_HEIGHT = 200;
const INPUT_LINE_HEIGHT = 20;
const WEB_INPUT_LINE_HEIGHT = 22;

//mention boxes drawn behind the input
function MentionBoxes({ text, spans, scrollY }: { text: string; spans: MentionSpan[]; scrollY: number }) {
  const styles = useThemedStyles(makeStyles);
  const [lastLines, setLastLines] = useState<Record<string, TextLayoutLine>>({});
  const [widths, setWidths] = useState<Record<string, number>>({});
  const keys = spans.map(span => `${span.start}:${text.slice(0, span.end)}`);
  //keep only measures of current mentions
  const withMeasure = <T,>(prev: Record<string, T>, key: string, value: T) => {
    const next: Record<string, T> = { [key]: value };
    keys.forEach(k => { if (k !== key && k in prev) next[k] = prev[k]; });
    return next;
  };

  return (
    <View pointerEvents="none" style={styles.inputMirrorClip}>
      {spans.map((span, i) => {
        //key drops stale measures
        const key = keys[i];
        const line = lastLines[key];
        const width = widths[key];
        return (
          <Fragment key={key}>
            {/* mention line from prefix end */}
            <Text
              style={[styles.input, styles.mentionMeasure]}
              textBreakStrategy="simple"
              onTextLayout={(e: NativeSyntheticEvent<TextLayoutEventData>) => {
                const lines = e.nativeEvent.lines;
                if (lines.length > 0) setLastLines(prev => withMeasure(prev, key, lines[lines.length - 1]));
              }}
            >
              {text.slice(0, span.end)}
            </Text>
            <Text
              style={[styles.input, styles.mentionMeasureWord]}
              numberOfLines={1}
              onTextLayout={(e: NativeSyntheticEvent<TextLayoutEventData>) => {
                const lines = e.nativeEvent.lines;
                if (lines.length > 0) setWidths(prev => withMeasure(prev, key, lines[0].width));
              }}
            >
              {text.slice(span.start, span.end)}
            </Text>
            {line && width != null && (
              <View
                style={[styles.mentionBox, {
                  left: line.x + line.width - width,
                  top: INPUT_PADDING_VERTICAL + line.y - scrollY,
                  width,
                  height: line.height,
                }]}
              />
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

function VoiceIndicator() {
  const styles = useThemedStyles(makeStyles);
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
  placeholder,
  incognito = false,
  isGenerating = false,
  modelCapabilities = [],
  canTranscribeRemotely = false,
  onOpenSettings,
  onAttachmentSheetVisibilityChange,
  autoStartMic = false,
  selection = null,
  onSelectionRemove,
  appContextChip = null,
  onAppContextRemove,
  editing = false,
  onEditCancel,
  editDraft = null,
  editFiles = null,
}, ref) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const insets = useSafeAreaInsets();
  const supportsImages = modelCapabilities.includes('vision');
  const supportsAudio = modelCapabilities.includes('audio');
  const supportsVideo = modelCapabilities.includes('video');
  const supportsFiles = supportsImages || supportsAudio || supportsVideo;
  const [text, setText] = useState("");
  //latest text before react rerenders
  const textRef = useRef("");
  //draft loads into the composer
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- draft arrives from the message being edited
    if (editDraft) setText(editDraft.text);
  }, [editDraft]);
  //leaving edit empties the composer
  const wasEditingRef = useRef(false);
  useEffect(() => {
    if (wasEditingRef.current && !editing) setText("");
    wasEditingRef.current = editing;
  }, [editing]);
  const lastCollapseRef = useRef<{ from: string; to: string } | null>(null);
  useEffect(() => { textRef.current = text; }, [text]);
  const [webInputHeight, setWebInputHeight] = useState<number | undefined>(undefined);
  const [, setWhisperAvailable] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  //message files load as chips
  //leaving edit empties them
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tray follows the edit session
    setSelectedFiles(editFiles ?? []);
  }, [editFiles]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{ title: string, message: string, buttons?: { text: string, onPress: () => void, style?: "primary" | "secondary" | "danger" }[] }>({ title: "", message: "" });
  const [isAttachmentSheetVisible, setIsAttachmentSheetVisible] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<any[]>([]);
  const autoStartedRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  //web mirror follows the textarea scroll
  const [inputScrollY, setInputScrollY] = useState(0);
  const transcribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  //cache extraction so send stays instant
  const documentsRef = useRef(new Map<string, Promise<ExtractedDocument>>());

  //the picker rejects the format, the model rejects what it cannot read
  const attachmentError = (kind: AttachmentKind, formatMessage: string) => {
    if (kind === 'unsupported') return { title: t("chatbar.unsupportedFormat"), message: formatMessage };
    if (kind === 'image' && !supportsImages) return { title: t("chatbar.unsupportedByModel"), message: t("chatbar.modelNoImages") };
    if (kind === 'audio' && !supportsAudio) return { title: t("chatbar.unsupportedByModel"), message: t("chatbar.modelNoAudio") };
    if (kind === 'video' && !supportsVideo) return { title: t("chatbar.unsupportedByModel"), message: t("chatbar.modelNoVideo") };
    return null;
  };

  const readDocument = (file: SelectedFile): Promise<ExtractedDocument> => {
    let pending = documentsRef.current.get(file.uri);
    if (!pending) {
      pending = extractDocument({ uri: file.uri, name: file.name, mimeType: file.mimeType });
      documentsRef.current.set(file.uri, pending);
    }
    return pending;
  };

  //warm cache and drop unreadable files
  useEffect(() => {
    let cancelled = false;
    selectedFiles
      .filter(f => f.type === 'document' && !documentsRef.current.has(f.uri))
      .forEach(file => {
        readDocument(file).catch((e: any) => {
          documentsRef.current.delete(file.uri);
          if (cancelled) return;
          setSelectedFiles(prev => prev.filter(f => f.uri !== file.uri));
          setModalConfig({ title: t("chatbar.unreadableDocument"), message: `${file.name}: ${e.message}` });
          setModalVisible(true);
        });
      });
    return () => { cancelled = true; };
  }, [selectedFiles, t]);

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
  const incognitoAnim = useAnimatedValue(incognito ? 1 : 0);

  useEffect(() => {
    incognitoAnim.setValue(incognito ? 1 : 0);
  }, [incognito, incognitoAnim]);

  const liveTextRef = useRef<string>("");
  const nativeAudioUriRef = useRef<string | null>(null);
  const stopResolverRef = useRef<((text: string | null) => void) | null>(null);
  const sendCancelledRef = useRef(false);
  //repeat taps during a freeze resend stale text
  const sendingRef = useRef(false);
  const [sentCount, setSentCount] = useState(0);
  //unlock once the cleared input rendered
  useEffect(() => {
    sendingRef.current = false;
  }, [sentCount]);

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

  //try remote model on persisted audio
  const resolveNativeTranscript = async (localText: string | null): Promise<string | null> => {
    const uri = nativeAudioUriRef.current;
    nativeAudioUriRef.current = null;
    if (!uri || !onTranscribe) return localText;
    try {
      const wavBuffer = await new File(uri).arrayBuffer();
      return await onTranscribe(wavBuffer, localText);
    } catch (e) {
      console.error("failed to read native recording for remote transcription:", e);
      return localText;
    }
  };

  //native continuous stt
  const startContinuousSTT = async () => {
    try {
      liveTextRef.current = "";
      nativeAudioUriRef.current = null;
      setText("");
      clearTimeout(transcribeTimerRef.current);
      setIsTranscribing(false);
      setIsRecording(true);
      resetVad();
      const granted = await STT.requestPermissions();
      if (!granted) {
        setIsRecording(false);
        setModalConfig({
          title: t("chatbar.micPermission.title"),
          message: t("chatbar.micPermission.message"),
          buttons: [{ text: "OK", onPress: () => setModalVisible(false), style: "primary" }]
        });
        setModalVisible(true);
        onTranscribeError?.();
        return;
      }
      let locale = Settings.getCached().whisperLanguage || "en-US";
      if (locale === "auto" || locale.length > 5) locale = "en-US";
      const recordAudio = canTranscribeRemotely && STT.supportsRecording();
      STT.start(locale, {
        onPartial: (t) => { if (t) { liveTextRef.current = t; setText(t); } },
        onFinal: (t) => { if (t) liveTextRef.current = t; },
        onVolume: (v) => { currentAudioVolume = v > 0 ? v / 10 : 0; },
        onSpeechStart: cancelNativeVadStop,
        onSpeechEnd: scheduleNativeVadStop,
        onAudioFile: (uri) => { nativeAudioUriRef.current = uri; },
        onError: (msg) => {
          console.error("STT error:", msg);
          stopSTTVolume();
          setIsRecording(false);
          setIsTranscribing(false);
          stopResolverRef.current?.(null);
          stopResolverRef.current = null;
          onTranscribeError?.();
        },
        onDone: async () => {
          const text = liveTextRef.current.trim() || null;
          liveTextRef.current = "";
          const resolver = stopResolverRef.current;
          stopResolverRef.current = null;
          const finalText = await resolveNativeTranscript(text);
          setIsTranscribing(false);
          resolver?.(finalText);
        },
      }, recordAudio);
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
      transcribeTimerRef.current = setTimeout(async () => {
        const resolver = stopResolverRef.current;
        stopResolverRef.current = null;
        const finalText = await resolveNativeTranscript(liveTextRef.current.trim() || null);
        setIsTranscribing(false);
        resolver?.(finalText);
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
      setTimeout(() => startSTT(), 150);
    }
    //fires once, guarded by autoStartedRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartMic]);

  const toggleAttachmentSheet = async () => {
    if (isAttachmentSheetVisible) {
      closeSheet();
    } else {
      Keyboard.dismiss();
      //no recent photos on android
      if (Platform.OS !== 'android') {
        const { granted, canAskAgain } = await MediaLibrary.getPermissionsAsync();
        //a refusal sticks, only prompt while the os still allows it
        if (!granted && canAskAgain) {
          await MediaLibrary.requestPermissionsAsync();
        }
      }
      setIsAttachmentSheetVisible(true);
    }
  };

  useEffect(() => {
    //play policy forbids broad media access
    if (!isAttachmentSheetVisible || Platform.OS === 'android') return;

    const getRecentPhotos = async () => {
      const { status } = await MediaLibrary.getPermissionsAsync();
      if (status === 'granted') {
        const media = await MediaLibrary.getAssetsAsync({
          mediaType: supportsVideo ? ['photo', 'video'] : 'photo',
          first: 10,
          sortBy: ['creationTime'],
        });
        setRecentPhotos(media.assets);
      }
    };
    getRecentPhotos();
  }, [isAttachmentSheetVisible, supportsVideo]);

  const handleCamera = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      setModalConfig({ title: t("chatbar.permissionDenied"), message: t("chatbar.cameraDenied") });
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
    //android system picker needs no permission
    if (Platform.OS !== 'android') {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        setModalConfig({ title: t("chatbar.permissionDenied"), message: t("chatbar.photosDenied") });
        setModalVisible(true);
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: supportsVideo ? ['images', 'videos'] : ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (!result.canceled && result.assets) {
      const newFiles = result.assets.map(asset => asset.type === 'video'
        ? { uri: asset.uri, type: 'video', name: asset.fileName || 'video.mp4', mimeType: asset.mimeType ?? undefined }
        : { uri: asset.uri, type: 'image', name: asset.fileName || 'photo.jpg' });
      setSelectedFiles(prev => [...prev, ...newFiles]);
      setIsAttachmentSheetVisible(false);
    }
  };

  const handleSelectRecentPhoto = async (photo: any) => {
    const isVideo = photo.mediaType === 'video';
    //ios ph uri is not a file
    const videoUri = isVideo && Platform.OS === 'ios'
      ? (await MediaLibrary.getAssetInfoAsync(photo)).localUri
      : undefined;
    setSelectedFiles(prev => {
      const targetUri = videoUri || photo.uri || photo.localUri;
      const isSelected = prev.some(f => (f.id && f.id === photo.id) || f.uri === targetUri);
      if (isSelected) {
        return prev.filter(f => !((f.id && f.id === photo.id) || f.uri === targetUri));
      } else {
        return [...prev, {
          uri: targetUri,
          type: isVideo ? 'video' : 'image',
          name: photo.filename || (isVideo ? 'recent_video.mp4' : 'recent_photo.jpg'),
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
  //one color line, press walks outward from either mode
  const backgroundColor = Animated.add(
    incognitoAnim,
    Animated.multiply(pressAnim, incognitoAnim.interpolate({ inputRange: [0, 1], outputRange: [-1, 1] }))
  ).interpolate({
    inputRange: [-1, 0, 1, 2],
    outputRange: [Colors.primaryBright, Colors.primary, Colors.incognito, Colors.incognitoBright],
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
        type: ['image/*', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', ...(supportsVideo ? VIDEO_MIME_TYPES : []), ...DOCUMENT_MIME_TYPES],
        multiple: true,
        copyToCacheDirectory: true
      });
      if (!result.canceled && result.assets) {
        const validFiles: SelectedFile[] = [];
        let rejection: { title: string; message: string } | null = null;

        for (const a of result.assets) {
          const kind = classifyAttachment(a.name, a.mimeType);
          const error = attachmentError(kind, t("chatbar.unsupportedAudio"));
          if (error) {
            rejection = error;
            continue;
          }
          validFiles.push({ uri: a.uri, type: kind, name: a.name, mimeType: a.mimeType ?? undefined });
        }

        if (rejection) {
          setModalConfig(rejection);
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
          title: t("whisper.notConfigured.title"),
          message: t("whisper.notConfigured.message"),
          buttons: [
            { text: t("common.cancel"), onPress: () => setModalVisible(false), style: "secondary" },
            {
              text: t("chatbar.settings"), onPress: () => {
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
          title: t("whisper.notInstalled.title"),
          message: t("whisper.notInstalled.messageInstall", { model: modelName }),
          buttons: [
            { text: t("common.cancel"), onPress: () => setModalVisible(false), style: "secondary" },
            {
              text: t("chatbar.install"), onPress: () => {
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
          title: t("whisper.initError.title"),
          message: t("whisper.initError.messageReinstall", { model: modelName }),
          buttons: [
            { text: t("common.cancel"), onPress: () => setModalVisible(false), style: "secondary" },
            {
              text: t("chatbar.settings"), onPress: () => {
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
  //attachment drawer doubles as banner
  const trayVisible = hasAttachments || !!editing;
  const [renderFiles, setRenderFiles] = useState(trayVisible);
  const filesAnim = useAnimatedValue(trayVisible ? 1 : 0);
  const [drawerHeight, setDrawerHeight] = useState(36);

  //keep the drawer mounted through the close slide, unmount when it finishes
  useEffect(() => {
    if (trayVisible) {
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
      }).start(({ finished }) => {
        if (finished) setRenderFiles(false);
      });
    }
  }, [trayVisible, filesAnim]);

  //compress only picked images
  const buildImages = async (): Promise<string[]> => {
    const picked = await Promise.all(
      selectedFiles
        .filter(f => f.type !== 'document')
        .map(f => f.type === 'image'
          ? compressImageToDataUri(f.uri)
          : Promise.resolve(`${f.uri}?name=${encodeURIComponent(f.name)}`))
    );
    return selection?.uri ? [...picked, selection.uri] : picked;
  };

  const handleSend = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    let sent = false;
    try {
      sent = await sendOnce();
    } finally {
      if (!sent) sendingRef.current = false;
    }
  };

  const sendOnce = async (): Promise<boolean> => {
    const wasRecording = isRecording;
    let voiceText: string | null = null;
    if (wasRecording) {
      voiceText = await stopSTT();
      const cancelled = sendCancelledRef.current;
      sendCancelledRef.current = false;
      if (cancelled) return false;
    }
    const finalText = (voiceText ?? text).trim();
    if ((finalText || attachments.length > 0) && onSend) {
      //camera and gallery never pass through the picker checks
      const blocked = selectedFiles
        .map(f => attachmentError(f.type as AttachmentKind, t("chatbar.unsupportedFile")))
        .find(e => e !== null);
      if (blocked) {
        setModalConfig(blocked);
        setModalVisible(true);
        return false;
      }

      let documents: ExtractedDocument[];
      try {
        documents = await Promise.all(selectedFiles.filter(f => f.type === 'document').map(readDocument));
      } catch (e: any) {
        setModalConfig({ title: t("chatbar.unreadableDocument"), message: e.message });
        setModalVisible(true);
        return false;
      }
      const images = await buildImages();
      onSend(
        formatDocumentsForPrompt(documents) + finalText,
        [...images, ...documents.flatMap(d => d.images)],
        voiceText != null
      );
      setText("");
      if (Platform.OS === 'web') setWebInputHeight(undefined);
      setSelectedFiles([]);
      documentsRef.current.clear();
      setSentCount(n => n + 1);
      Keyboard.dismiss();
      return true;
    } else if (voiceText === null && wasRecording && autoStartMic) {
      onTranscribeError?.();
    }
    return false;
  };

  //live list shows new items instantly
  const mentionQuery = isRecording || isTranscribing ? null : text.match(MENTION_QUERY_RE)?.[2]?.toLowerCase() ?? null;
  const mentionOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    return listMentionables()
      .filter(m => m.id.toLowerCase().includes(mentionQuery))
      .sort((a, b) => Number(b.id.toLowerCase().startsWith(mentionQuery)) - Number(a.id.toLowerCase().startsWith(mentionQuery)));
  }, [mentionQuery]);

  //tab cursor resets with the query
  const [mentionCursor, setMentionCursor] = useState({ query: '', index: 0 });
  const activeMention = mentionCursor.query === mentionQuery && mentionOptions.length > 0
    ? mentionCursor.index % mentionOptions.length
    : 0;
  const mentionListRef = useRef<ScrollView>(null);
  const mentionRowsRef = useRef<Record<number, { y: number; height: number }>>({});

  const moveMention = (step: number) => {
    const count = mentionOptions.length;
    const index = (activeMention + step + count) % count;
    setMentionCursor({ query: mentionQuery ?? '', index });
    const row = mentionRowsRef.current[index];
    if (row) mentionListRef.current?.scrollTo({ y: Math.max(0, row.y + row.height - MENTION_LIST_MAX_HEIGHT), animated: false });
  };

  const pickMention = (id: string) => {
    setText(prev => prev.replace(MENTION_QUERY_RE, `$1@${id} `));
    //web click blurs the input
    inputRef.current?.focus();
  };

  const mentionSpans = useMemo(() => findMentionSpans(text), [text]);

  //backspace inside a mention leaves @
  const handleChangeText = (next: string) => {
    const last = lastCollapseRef.current;
    //fast backspaces carry uncollapsed text
    if (last && collapseMention(last.from, next) === last.to) {
      textRef.current = last.to;
      setText(last.to);
      return;
    }
    const collapsed = collapseMention(textRef.current, next);
    lastCollapseRef.current = collapsed ? { from: textRef.current, to: collapsed } : null;
    textRef.current = collapsed ?? next;
    setText(textRef.current);
  };

  //valid mentions styled, rest plain
  const renderInputText = () => {
    if (isTranscribing) return t("chatbar.transcribing");
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    mentionSpans.forEach(span => {
      if (span.start > cursor) parts.push(text.slice(cursor, span.start));
      parts.push(
        <Text key={span.start} style={[styles.inputMention, incognito && styles.inputMentionIncognito, Platform.OS === 'web' && styles.inputMentionWeb]}>
          {text.slice(span.start, span.end)}
        </Text>
      );
      cursor = span.end;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  };

  const renderMentionName = (id: string, query: string) => {
    const highlight = incognito ? styles.mentionHighlightIncognito : styles.mentionHighlight;
    const start = Math.max(0, id.toLowerCase().indexOf(query));
    const end = start + query.length;
    return (
      <Text style={[styles.mentionName, incognito && styles.mentionNameIncognito]}>
        <Text style={highlight}>@</Text>
        {id.slice(0, start)}
        <Text style={highlight}>{id.slice(start, end)}</Text>
        {id.slice(end)}
      </Text>
    );
  };

  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web') {
      if (e.nativeEvent.key === 'Tab' && mentionOptions.length > 0) {
        e.preventDefault();
        moveMention(e.nativeEvent.shiftKey ? -1 : 1);
        return;
      }
      if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
        e.preventDefault();
        if (mentionOptions.length > 0) {
          pickMention(mentionOptions[activeMention].id);
          return;
        }
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

        let rejection: { title: string; message: string } | null = null;
        const readable = pastedFiles.filter(file => {
          const kind = classifyAttachment(file.name || "pasted_file", file.type);
          const error = attachmentError(kind, t("chatbar.unsupportedFile"));
          if (error) rejection = error;
          return !error;
        });

        const promises = readable.map(file => {
          return new Promise<SelectedFile | null>((resolve) => {
            const name = file.name || "pasted_file";
            const kind = classifyAttachment(name, file.type);
            const reader = new FileReader();
            reader.onload = (ev) => {
              resolve({ uri: ev.target?.result as string, type: kind, name, mimeType: file.type });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          });
        });

        Promise.all(promises).then(results => {
          const validFiles = results.filter(r => r !== null) as SelectedFile[];

          if (rejection) {
            setModalConfig(rejection);
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
  }, [supportsImages, supportsAudio, supportsVideo, t]);

  //camera, gallery and a model switch can leave an unreadable file attached
  useEffect(() => {
    const blocked = selectedFiles
      .map(f => attachmentError(f.type as AttachmentKind, t("chatbar.unsupportedFile")))
      .find(e => e !== null);
    if (!blocked) return;
    setModalConfig(blocked);
    setModalVisible(true);
  }, [selectedFiles, supportsImages, supportsAudio, supportsVideo, t]);

  return (
    <View style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <View style={{ width: '100%', alignItems: 'center', zIndex: 2, elevation: 9 }}>
        <Animated.View style={{ width: '100%', maxWidth: 800, zIndex: 2, elevation: 9 }}>
          {mentionOptions.length > 0 && mentionQuery !== null && (
            <View style={[styles.mentionPopup, incognito && styles.mentionPopupIncognito]}>
              <ScrollView ref={mentionListRef} style={styles.mentionList} keyboardShouldPersistTaps="always">
                {mentionOptions.map((option, index) => (
                  <Pressable
                    key={`${option.kind}-${option.id}`}
                    onPress={() => pickMention(option.id)}
                    onLayout={e => { mentionRowsRef.current[index] = e.nativeEvent.layout; }}
                    style={({ pressed, hovered }) => [
                      styles.mentionRow,
                      (pressed || hovered || (Platform.OS === 'web' && index === activeMention)) && (incognito ? styles.mentionRowPressedIncognito : styles.mentionRowPressed),
                    ]}
                  >
                    {renderMentionName(option.id, mentionQuery)}
                    {option.requires.length > 0 && (
                      <Text style={styles.mentionRequires}>{option.requires.map(r => `+@${r}`).join(' ')}</Text>
                    )}
                    <Text style={styles.mentionDescription} numberOfLines={1}>{option.description}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
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
                      {editing && (
                        <View style={styles.editTrayRow}>
                          <Image source={pencilIcon} style={styles.filePreviewDocumentIconTop} tintColor={Colors.textMuted} />
                          <Text style={styles.filesAddedText}>{t("chatbar.editingMessage")}</Text>
                          <Pressable
                            onPress={onEditCancel}
                            style={pressStyle([styles.removeFileBtnTop, { position: "relative" as const, right: 0, marginLeft: "auto" as const }], "fadeLight")}
                          >
                            <Text style={styles.removeFileBtnTextTop}>✕</Text>
                          </Pressable>
                        </View>
                      )}
                      {editing && <View style={styles.editTrayDivider} />}
                      {appContextChip && (
                        <View style={styles.filePreviewContainerTop}>
                          <Image source={{ uri: appContextChip.icon }} style={styles.appContextChipIcon} resizeMode="contain" />
                          {onAppContextRemove && (
                            <Pressable style={pressStyle(styles.removeFileBtnTop, "fadeLight")} onPress={onAppContextRemove}>
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
                              {chip.kind === 'document' ? (
                                <Image source={fileIcon} style={styles.filePreviewDocumentIconTop} tintColor={Colors.textOnPrimary} />
                              ) : (
                                <Text style={styles.filePreviewAudioTextTop} numberOfLines={1}>{chip.name}</Text>
                              )}
                            </View>
                          )}
                          <Pressable style={pressStyle(styles.removeFileBtnTop, "fadeLight")} onPress={chip.onRemove}>
                            <Text style={styles.removeFileBtnTextTop}>✕</Text>
                          </Pressable>
                        </View>
                      ))}
                      {hasAttachments && (
                        <Text style={[styles.filesAddedText, incognito && { color: Colors.textMuted }]}>
                          {(() => {
                            const filesPart = attachments.length > 0 ? t(attachments.length === 1 ? 'chatbar.fileCount.one' : 'chatbar.fileCount.other', { count: attachments.length }) : '';
                            const appPart = appContextChip ? 'App context' : '';
                            if (filesPart && appPart) return `${filesPart} and app context Added`;
                            if (filesPart) return `${filesPart} Added`;
                            return `${appPart} Added`;
                          })()}
                        </Text>
                      )}
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
                  <Pressable onPress={Platform.OS === 'web' ? handlePickFiles : toggleAttachmentSheet} onPressIn={handlePressIn} onPressOut={handlePressOut} style={pressStyle(styles.plusButton, "fadeLight")}>
                    <Image source={addIcon} style={styles.plusIcon} tintColor={Colors.textOnPrimary} />
                  </Pressable>
                )}

                {(Platform.OS !== 'web' || Settings.getCached().whisperModel !== 'none' || canTranscribeRemotely) && !isGenerating && (
                  <Pressable onPress={handleMicPress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={pressStyle(styles.micButton, "fadeLight")}>
                    <Animated.View style={{ opacity: isRecording ? pulseAnim : 1 }}>
                      <Image source={isRecording ? stopIcon : micIcon} style={styles.micIcon} tintColor={Colors.textOnPrimary} />
                    </Animated.View>
                  </Pressable>
                )}

                {isRecording ? (
                  <VoiceIndicator />
                ) : (
                  <View style={{ flex: 1, marginLeft: 8, justifyContent: 'center' }}>
                    {Platform.OS !== 'web' && !isTranscribing && mentionSpans.length > 0 && (
                      <MentionBoxes text={text} spans={mentionSpans} scrollY={inputScrollY} />
                    )}
                    {/* mirror drawn behind the web textarea */}
                    {Platform.OS === 'web' && mentionSpans.length > 0 && (
                      <View pointerEvents="none" style={styles.inputMirrorClip}>
                        <Text style={[styles.input, styles.inputMirror, { transform: [{ translateY: -inputScrollY }] }]}>
                          {renderInputText()}
                        </Text>
                      </View>
                    )}
                    <TextInputWrapper
                      onPaste={(payload) => {
                        if (supportsImages && payload.type === "images") {
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
                        ref={inputRef}
                        style={[
                          styles.input,
                          { maxHeight: 132, minHeight: Platform.OS === 'web' ? 22 : 32, lineHeight: Platform.OS === 'web' ? WEB_INPUT_LINE_HEIGHT : INPUT_LINE_HEIGHT },
                          //default edittext padding offsets the boxes
                          Platform.OS === 'android' && { paddingHorizontal: 0 },
                          Platform.OS === 'web' && ({
                            outlineStyle: 'none',
                            margin: 0,
                            paddingHorizontal: 0,
                            paddingVertical: 0,
                            minHeight: 22,
                            height: text ? webInputHeight : 22,
                            overflow: 'auto',
                            resize: 'none',
                            fieldSizing: 'content',
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                          } as any),
                          Platform.OS === 'web' && mentionSpans.length > 0 && [styles.inputUnderMirror, { caretColor: Colors.textOnPrimary } as any],
                        ]}
                        value={Platform.OS === 'web' ? (isTranscribing ? t("chatbar.transcribing") : text) : undefined}
                        onChangeText={isTranscribing ? undefined : (newText) => {
                          if (!newText && webInputHeight !== undefined) setWebInputHeight(undefined);
                          handleChangeText(newText);
                        }}
                        onScroll={(e: any) => setInputScrollY(e.nativeEvent.contentOffset?.y ?? e.nativeEvent.target?.scrollTop ?? 0)}
                        placeholder={placeholder ?? t("chatbar.placeholder")}
                        placeholderTextColor={Colors.whiteSoft}
                        multiline={true}
                        numberOfLines={Platform.OS === 'web' ? 1 : undefined}
                        onContentSizeChange={Platform.OS === 'web' ? (e) => {
                          const h = e.nativeEvent.contentSize?.height;
                          if (h && h > 0) {
                            setWebInputHeight(Math.min(132, Math.max(22, h)));
                          }
                        } : undefined}
                        editable={!isTranscribing}
                        onTouchStart={handlePressIn}
                        onTouchEnd={handlePressOut}
                        onKeyPress={handleKeyPress}
                        {...(Platform.OS === 'web' && ({ dataSet: { chatbarInput: true } } as any))}
                      >
                        {/* native span colors the mention */}
                        {Platform.OS !== 'web' && <Text>{renderInputText()}</Text>}
                      </TextInput>
                    </TextInputWrapper>
                  </View>
                )}

                {isGenerating ? (
                  <Pressable onPress={onStop} onPressIn={handlePressIn} onPressOut={handlePressOut} style={pressStyle(styles.sendButton, "fadeLight")}>
                    <Image source={stopIcon} style={styles.sendIcon} tintColor={Colors.textOnPrimary} />
                  </Pressable>
                ) : (
                  <Pressable onPress={handleSend} onPressIn={handlePressIn} onPressOut={handlePressOut} style={pressStyle(styles.sendButton, "fadeLight")}>
                    <Image source={nextWhiteIcon} style={styles.sendIcon} tintColor={Colors.textOnPrimary} />
                  </Pressable>
                )}
              </Animated.View>
            </Animated.View>
          </Pressable>

        </Animated.View>
      </View>

      <AttachmentSheet
        bottomInset={insets.bottom}
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

      {/* lifting sheet needs safe area below */}
      <View style={{ width: '100%', height: insets.bottom }} />

      <NotificationModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        buttons={modalConfig.buttons}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
});

export default ChatBar;

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
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
    borderColor: Colors.borderOnPrimary,
    minHeight: 56,
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
    color: Colors.textOnPrimary,
    fontSize: FontSizes.md,
    paddingVertical: INPUT_PADDING_VERTICAL,
  },
  inputMention: {
    color: Colors.primary,
  },
  inputMentionIncognito: {
    color: Colors.incognito,
  },
  //ring outside, mirror stays aligned
  inputMentionWeb: {
    backgroundColor: Colors.textOnPrimary,
    borderRadius: Radius.sm,
    boxShadow: `0px 0px 0px 2px ${Colors.textOnPrimary}, 0px 0px 0px 4px ${Colors.borderOnPrimary}`,
  },
  mentionBox: {
    position: 'absolute',
    backgroundColor: Colors.textOnPrimary,
    borderRadius: Radius.sm,
    boxShadow: `0px 0px 0px 2px ${Colors.textOnPrimary}, 0px 0px 0px 4px ${Colors.borderOnPrimary}`,
  },
  mentionMeasure: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 0,
    lineHeight: INPUT_LINE_HEIGHT,
    opacity: 0,
  },
  mentionMeasureWord: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingVertical: 0,
    lineHeight: INPUT_LINE_HEIGHT,
    opacity: 0,
  },
  inputMirrorClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  //matches the web textarea metrics
  inputMirror: {
    lineHeight: WEB_INPUT_LINE_HEIGHT,
    paddingVertical: 0,
  },
  inputUnderMirror: {
    color: 'transparent',
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
    //bars sit on the red/incognito composer in both themes, always white
    backgroundColor: Colors.textOnPrimary,
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
    minHeight: 60,
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
  filePreviewDocumentIconTop: {
    width: 18,
    height: 18,
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
  mentionPopup: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    marginHorizontal: Spacing.xl2,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    boxShadow: `-4px 4px 0px ${Colors.shadowInk}`,
  },
  mentionPopupIncognito: {
    backgroundColor: Colors.incognitoSurface,
  },
  mentionList: {
    maxHeight: MENTION_LIST_MAX_HEIGHT,
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg2,
    paddingVertical: Spacing.md,
  },
  mentionRowPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  mentionRowPressedIncognito: {
    backgroundColor: Colors.incognitoPressed,
  },
  mentionName: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyMd,
    color: Colors.textPrimary,
  },
  mentionNameIncognito: {
    color: Colors.textOnPrimary,
  },
  mentionHighlight: {
    color: Colors.primary,
  },
  mentionHighlightIncognito: {
    color: Colors.incognitoBright,
  },
  mentionRequires: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    color: Colors.textMuted,
  },
  mentionDescription: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSizes.caption,
    color: Colors.textMuted,
  },
  filesAddedText: {
    fontFamily: Fonts.mono,
    color: Colors.textMuted,
    fontSize: FontSizes.bodyMd,
    marginLeft: 4,
  },
  editTrayRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    //matches the chip row height
    minHeight: 32,
  },
  editTrayDivider: {
    width: '100%',
    height: 2,
    backgroundColor: Colors.border,
  },
});