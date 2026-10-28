
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { TextInputWrapper } from "expo-paste-input";
import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Image,
  Keyboard,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  Platform,
  PixelRatio,
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
import Reanimated, { type SharedValue, useAnimatedStyle, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import {
  extractDocument,
  formatDocumentsForPrompt,
  type ExtractedDocument,
} from "../../services/documents/DocumentService";
import { findMentionSpans, listMentionables, MentionSpan } from "../../services/ai/mentions";
import { Settings } from "../../services/settings/SettingsService";
import { STT, WhisperSTT } from "../../services/speech/STTService";
import { buildWavBuffer } from "../../services/speech/wav";
import IconButton from "../ui/IconButton";
import NotificationModal from "../ui/NotificationModal";
import { classifyAttachment, type AttachmentKind, type Attachments, type SelectedFile } from "./AttachmentSheet";
import { pressStyle } from "../ui/pressStyle";

const nextWhiteIcon = require("../../../assets/icons/arrow.png");
const micIcon = require("../../../assets/icons/microphone.png");
const addIcon = require("../../../assets/icons/add.png");
const stopIcon = require("../../../assets/icons/stop.png");
const fileIcon = require("../../../assets/icons/file.png");
const pencilIcon = require("../../../assets/icons/pencil.png");
const cancelIcon = require("../../../assets/icons/cancel2.png");

const IMAGE_MAX_WIDTH = 1280;
const IMAGE_COMPRESS_QUALITY = 0.7;

//@query typed at the text end
const MENTION_QUERY_RE = /(^|\s)@([\w-]*)$/;

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
  picker: Attachments;
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

const VOICE_TICK_MS = 60;
//caps the animated cell count on very wide bars
const VOICE_MAX_COLS = 80;
const VOICE_ROWS = 5;
//history step that makes the voice spread from the center outward
const VOICE_SHIFT_MS = 70;
//columns over which each side fades out
const VOICE_FADE_COLS = 8;
const VOICE_LEVELS = Array.from({ length: VOICE_ROWS }, (_, i) => i);

function VoiceCell({ col, row, cell, heights, cols }: { col: number; row: number; cell: number; heights: SharedValue<number[]>; cols: SharedValue<number> }) {
  const styles = useThemedStyles(makeStyles);
  const style = useAnimatedStyle(() => {
    //cell opacity follows its depth under the column top: 60, 80, 100 percent
    const d = heights.value[col] - row;
    const alpha = d <= 0 ? 0 : d <= 1 ? 0.6 * d : Math.min(1, 0.6 + 0.2 * (d - 1));
    //fade toward both edges so the row never ends in a hard cut
    const edge = Math.min(1, Math.min(col + 1, cols.value - col) / VOICE_FADE_COLS);
    return { opacity: alpha * edge };
  });
  //neighbours share the same snapped edge so no hairline shows between cells
  const snap = (n: number) => PixelRatio.roundToNearestPixel(n * cell);
  const left = snap(col);
  const bottom = snap(row);
  return <Reanimated.View style={[styles.voiceCell, { left, bottom, width: snap(col + 1) - left, height: snap(row + 1) - bottom }, style]} />;
}

function VoiceIndicator() {
  const styles = useThemedStyles(makeStyles);
  const vol = useSharedValue(0);
  const energy = useSharedValue(0);
  const clock = useSharedValue(0);
  const history = useSharedValue<number[]>(Array(VOICE_MAX_COLS / 2).fill(0));
  const heights = useSharedValue<number[]>(Array(VOICE_MAX_COLS).fill(0));
  const colsShared = useSharedValue(0);
  const [grid, setGrid] = useState({ cols: 0, cell: 0 });
  //cell size makes the rows span the full bar height, columns fill the width and stay even so the center sits between two
  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const cell = height / VOICE_ROWS;
    const next = Math.min(VOICE_MAX_COLS, 2 * Math.floor(width / (2 * cell)));
    colsShared.value = next;
    setGrid({ cols: next, cell });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      vol.value = Math.min(1, currentAudioVolume * 50);
    }, VOICE_TICK_MS);
    return () => clearInterval(timer);
  }, [vol]);

  //runs every frame on the ui thread so the columns glide between volume samples
  useFrameCallback(frame => {
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 50);
    const t = frame.timeSinceFirstFrame / 1000;
    //fast attack, slow release
    const target = vol.value;
    energy.value += (target - energy.value) * (1 - Math.exp(-dt / (target > energy.value ? 40 : 160)));

    clock.value += dt;
    if (clock.value >= VOICE_SHIFT_MS) {
      clock.value = 0;
      history.value = [energy.value, ...history.value.slice(0, VOICE_MAX_COLS / 2 - 1)];
    }

    const prev = heights.value;
    const total = colsShared.value;
    const half = total / 2;
    const next = new Array<number>(VOICE_MAX_COLS).fill(0);
    for (let c = 0; c < total; c++) {
      //distance from the center picks how old the volume sample is
      const dist = c < half ? half - 1 - c : c - half;
      //idle breathing keeps the row alive in silence
      const idle = 0.5 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.2 + c * 0.8));
      //two slow waves of different speed so no column repeats its neighbour
      const wobble = 0.7 + 0.3 * Math.sin(t * 4.3 + c * 1.7) * Math.sin(t * 1.9 + c * 0.5);
      const goal = Math.min(VOICE_ROWS, idle + history.value[dist] * (VOICE_ROWS - 1.2) * wobble);
      const tau = goal > prev[c] ? 50 : 140;
      next[c] = prev[c] + (goal - prev[c]) * (1 - Math.exp(-dt / tau));
    }
    heights.value = next;
  });

  return (
    //negative margins stretch the grid over the bar padding up to the border
    <View onLayout={handleLayout} style={[styles.voiceIndicatorContainer, { marginVertical: -10 }]}>
      <View style={{ width: grid.cols * grid.cell, height: VOICE_ROWS * grid.cell }}>
        {Array.from({ length: grid.cols }, (_, col) =>
          VOICE_LEVELS.map(row => <VoiceCell key={`${col}-${row}`} col={col} row={row} cell={grid.cell} heights={heights} cols={colsShared} />)
        )}
      </View>
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
  picker,
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
  const {
    files: selectedFiles,
    setFiles: setSelectedFiles,
    sheetVisible: isAttachmentSheetVisible,
    closeSheet,
    toggleSheet: toggleAttachmentSheet,
    pickFiles: handlePickFiles,
    attachmentError,
  } = picker;
  //message files load as chips
  //leaving edit empties them
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tray follows the edit session
    setSelectedFiles(editFiles ?? []);
  }, [editFiles, setSelectedFiles]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{ title: string, message: string, buttons?: { text: string, onPress: () => void, style?: "primary" | "secondary" | "danger" }[] }>({ title: "", message: "" });
  const autoStartedRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  //web mirror follows the textarea scroll
  const [inputScrollY, setInputScrollY] = useState(0);
  const transcribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  //cache extraction so send stays instant
  const documentsRef = useRef(new Map<string, Promise<ExtractedDocument>>());

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
  }, [selectedFiles, setSelectedFiles, t]);

  useImperativeHandle(ref, () => ({
    stopRecording: () => {
      setIsRecording(false);
    },
    clear: () => {
      setText("");
      setSelectedFiles([]);
    }
  }));

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
  }, [isAttachmentSheetVisible, closeSheet, isRecording, isTranscribing]);

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
                  <View style={[styles.filesContainerTop, incognito && styles.filesContainerTopIncognito, editing && !hasAttachments && styles.filesContainerTopEditOnly]}>
                    <View style={styles.fileChipsContainer}>
                      {editing && (
                        <View style={styles.editTrayRow}>
                          <Image source={pencilIcon} style={styles.filePreviewDocumentIconTop} tintColor={Colors.textMuted} />
                          <Text style={styles.editTrayText} numberOfLines={1}>{t("chatbar.editingMessage")}</Text>
                          <IconButton
                            icon={cancelIcon}
                            label={t("common.cancel")}
                            onPress={onEditCancel}
                            size={18}
                            tintColor={Colors.textMuted}
                            containerSize={32}
                          />
                        </View>
                      )}
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
                {supportsFiles && !isRecording && (
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
                        if (payload.type !== "images") return;
                        //same rejection flow as the pickers
                        const error = attachmentError('image', t("chatbar.unsupportedFile"));
                        if (error) {
                          setModalConfig(error);
                          setModalVisible(true);
                          return;
                        }
                        const newFiles: SelectedFile[] = payload.uris.map(uri => {
                          const name = uri.split('/').pop() || "pasted_image.png";
                          const extension = name.split('.').pop()?.toLowerCase();
                          return { uri, type: "image", name, mimeType: `image/${extension === 'jpg' ? 'jpeg' : extension || 'png'}` };
                        });
                        setSelectedFiles(prev => [...prev, ...newFiles]);
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

      {/* keeps the bar clear of the safe area */}
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
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    marginLeft: 8,
    marginRight: 8,
  },
  voiceCell: {
    position: "absolute",
    //cells sit on the red/incognito composer in both themes, always white
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
  filesContainerTopEditOnly: {
    minHeight: 0,
  },
  editTrayRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingLeft: Spacing.md,
    minHeight: 32,
  },
  editTrayText: {
    flex: 1,
    fontFamily: Fonts.mono,
    color: Colors.textMuted,
    fontSize: FontSizes.bodyMd,
  },
});
