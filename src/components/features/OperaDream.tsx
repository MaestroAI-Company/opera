import { File } from "expo-file-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DeviceEventEmitter,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import HeadlessWebView from "../../../components/HeadlessWebView";
import { SYSTEM_PROMPTS } from "../../../constants/prompts";
import { DarkColors, FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useResponsive } from "../../hooks/useResponsive";
import { ColorsOverride, initTheme, useColors, useThemedStyles } from "../../hooks/useTheme";
import { getLocale, initI18n, useT } from "../../i18n";
import { AIModule } from "../../services/ai/AIModule";
import { buildSystemPrompt } from "../../services/ai/generation/chatGeneration";
import { GenerationService } from "../../services/ai/generation/GenerationService";
import { hydrateLiteRTCatalog } from "../../services/ai/providers/huggingFaceCatalog";
import { getLiteRTModelLabel, isLiteRTModel } from "../../services/ai/providers/LiteRTProvider";
import { getLocalModelLabel, isLocalModel } from "../../services/ai/providers/LocalProvider";
import { getOllamaTuning, migrateModelSources } from "../../services/ai/providers/sources";
import { resolveQuickFlow } from "../../services/ai/quickFlow";
import { arrayBufferToBase64 } from "../../services/ai/utils/base64";
import { Conversation, DB } from "../../services/db/DatabaseService";
import { AppEvents } from "../../services/events";
import { McpService } from "../../services/mcp/McpService";
import { PluginRegistry } from "../../services/plugins/PluginRegistry";
import { AppSettings, Settings } from "../../services/settings/SettingsService";
import { STT } from "../../services/speech/STTService";
import { TTS } from "../../services/speech/TTSService";
import "../../services/widgets/registerWidgets";
import { deriveChatDisplay, renderMarkdown } from "../ui/MarkdownText";
import { pressStyle } from "../ui/pressStyle";
import ThinkingIcon from "../ui/ThinkingIcon";
import ButterflyCluster from "./ButterflyCluster";
import { ModelSelectorDrawer } from "./ModelSelector";

const micIcon = require("../../../assets/icons/microphone.png");
const stopIcon = require("../../../assets/icons/stop.png");

//same silence window as the chat bar
const VAD_SILENCE_MS = 1500;
//recognizer may never send its end event
const STOP_TIMEOUT_MS = 3000;

//the router layout never mounts here
initTheme();
initI18n();

type Turn = { role: "user" | "assistant"; content: string };
type VoiceState = "idle" | "listening" | "transcribing";

function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const delay = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    const timer = setTimeout(() => setNow(new Date()), delay);
    return () => clearTimeout(timer);
  }, [now]);
  return now;
}

//locale clock without am pm
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(getLocale(), { hour: "numeric", minute: "2-digit" })
    .formatToParts(date)
    .filter((part) => part.type !== "dayPeriod")
    .map((part) => part.value)
    .join("")
    .trim();
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(getLocale(), { weekday: "short", day: "numeric", month: "short" }).format(date);
}

function modelLabel(model: string): string {
  if (isLocalModel(model)) return getLocalModelLabel(model, true);
  if (isLiteRTModel(model)) return getLiteRTModelLabel(model);
  return model;
}

export default function OperaDreamRoot() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <GestureHandlerRootView style={rootStyles.fill}>
          {/* dark screen ignores the app theme */}
          <ColorsOverride.Provider value={DarkColors}>
            <OperaDream />
          </ColorsOverride.Provider>
        </GestureHandlerRootView>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

function OperaDream() {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();
  const now = useMinute();

  const [landscape, setLandscape] = useState(true);
  const [butterflySize, setButterflySize] = useState(0);

  const [selectedModel, setSelectedModel] = useState("");
  const [aiService, setAiService] = useState("ollama");
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [selectedReflection, setSelectedReflection] = useState("none");
  const [modelCapabilities, setModelCapabilities] = useState<string[]>([]);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const modelSelectorProgress = useAnimatedValue(0);
  const [incognito, setIncognito] = useState(false);

  const [question, setQuestion] = useState("");
  const [liveText, setLiveText] = useState("");
  const [answer, setAnswer] = useState<{ msgId: string; content: string } | null>(null);
  const [generatingConvId, setGeneratingConvId] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceState>("idle");

  //async voice and generation flows read these
  const selectedModelRef = useRef("");
  const reflectionRef = useRef("none");
  const incognitoRef = useRef(false);
  const capabilitiesRef = useRef<string[]>([]);
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
  useEffect(() => { reflectionRef.current = selectedReflection; }, [selectedReflection]);
  useEffect(() => { incognitoRef.current = incognito; }, [incognito]);
  useEffect(() => { capabilitiesRef.current = modelCapabilities; }, [modelCapabilities]);

  const convRef = useRef<Conversation | null>(null);
  const historyRef = useRef<Turn[]>([]);

  const liveTextRef = useRef("");
  const audioUriRef = useRef<string | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  //first of end event or timeout wins
  const settledRef = useRef(true);

  const applySettings = useCallback((loaded: AppSettings) => {
    const s = migrateModelSources(loaded);
    if (s.ollamaModel) setSelectedModel(s.ollamaModel);
    setAiService(s.aiService);
    setOllamaUrl(s.ollamaUrl);
    const tuning = getOllamaTuning(s.ollamaUrl);
    AIModule.configure(s.ollamaUrl, tuning.contextLength, tuning.keepAlive);
    AIModule.setMode(s.aiService);
    STT.setLanguage(s.whisperLanguage);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([DB.init(), Settings.init()]);
        await hydrateLiteRTCatalog();
        applySettings(await Settings.load());
      } catch (e) {
        console.warn("Failed to load settings in the dream", e);
      }
      PluginRegistry.init().then(() => PluginRegistry.loadAll()).catch(() => { });
      McpService.init().then(() => McpService.connectAll()).catch(() => { });
    };
    init();
  }, [applySettings]);

  //settings edited elsewhere in this process
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(AppEvents.settingsChanged, () => {
      Settings.load().then(applySettings).catch(() => { });
    });
    return () => sub.remove();
  }, [applySettings]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedModel) return;
    AIModule.getModelCapabilities(selectedModel).then((caps) => {
      if (!cancelled) setModelCapabilities(caps);
    });
    return () => { cancelled = true; };
  }, [selectedModel, aiService, ollamaUrl]);

  useEffect(() => {
    return GenerationService.subscribe((run) => {
      if (run.status !== "streaming") return;
      setAnswer((prev) => (prev && prev.msgId === run.msgId ? { msgId: prev.msgId, content: run.content } : prev));
    });
  }, []);

  //voice leaves the mic free on exit
  useEffect(() => {
    return () => {
      clearTimeout(vadTimerRef.current);
      clearTimeout(stopTimerRef.current);
      STT.abort();
      TTS.stop();
    };
  }, []);

  const generateTitle = async (convId: string, userMessage: string) => {
    try {
      let title = "";
      await AIModule.sendOn(
        resolveQuickFlow(selectedModelRef.current),
        SYSTEM_PROMPTS.SUMMARIZE,
        [{ role: "user", content: userMessage }],
        (chunk) => { title += chunk; },
        undefined,
        { think: false }
      );
      const cleaned = title.trim();
      if (cleaned.length > 0) await DB.renameConversation(convId, cleaned);
    } catch (e) {
      //a failed title is not worth surfacing
      console.warn("Title generation skipped:", (e as any)?.message ?? e);
    }
  };

  //same flow as the app home
  const ask = async (text: string) => {
    const model = selectedModelRef.current;
    const isIncognito = incognitoRef.current;
    let conv = convRef.current;
    const isFirstMessage = !conv;
    if (!conv) {
      const name = text.length > 30 ? text.slice(0, 30) + "…" : text;
      conv = isIncognito
        ? { id: "incognito_" + Date.now(), name, model: model || "unknown", createdAt: Date.now(), updatedAt: Date.now() }
        : await DB.createConversation(model || "unknown", name);
      convRef.current = conv;
    }

    const history: Turn[] = [...historyRef.current, { role: "user", content: text }];
    historyRef.current = history;
    setQuestion(text);
    let msgId = "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    if (!isIncognito) {
      await DB.addMessage(conv.id, "user", text);
      msgId = (await DB.addMessage(conv.id, "assistant", "…")).id;
    }
    setAnswer({ msgId, content: "…" });
    setGeneratingConvId(conv.id);

    const reflection = reflectionRef.current;
    const run = await GenerationService.start({
      convId: conv.id,
      msgId,
      prompt: text,
      model,
      systemPrompt: buildSystemPrompt(model, Settings.getCached().instruction),
      history,
      think: reflection === "none" ? false : reflection,
      persist: !isIncognito,
      noModelMessage: t("dream.noModel"),
    });

    setAnswer({ msgId, content: run.content });
    setGeneratingConvId(null);
    historyRef.current = [...historyRef.current, { role: "assistant", content: run.content }];

    const isError = run.status === "error";
    if (isFirstMessage && !isIncognito && !isError) generateTitle(conv.id, text);
    //every dream question comes by voice
    if (!isError && Settings.getCached().autoSpeak) {
      TTS.speak(run.content, { language: Settings.getCached().language, id: msgId });
    }
  };

  //audio models hear the raw recording
  const resolveTranscript = async (localText: string | null): Promise<string | null> => {
    const uri = audioUriRef.current;
    audioUriRef.current = null;
    const model = selectedModelRef.current;
    if (!uri || !model) return localText;
    try {
      const wavBuffer = await new File(uri).arrayBuffer();
      let transcription = "";
      await AIModule.sendMessage(
        model,
        SYSTEM_PROMPTS.TRANSCRIBE,
        [{ role: "user", content: "Transcribe this audio.", images: ["data:audio/wav;base64," + arrayBufferToBase64(wavBuffer)] }],
        (chunk) => { transcription += chunk; },
        undefined,
        { think: false }
      );
      return transcription.trim() || localText;
    } catch (e) {
      console.warn("Remote transcription failed, keeping the local transcript", e);
      return localText;
    }
  };

  const settle = async () => {
    if (settledRef.current) return;
    settledRef.current = true;
    clearTimeout(vadTimerRef.current);
    clearTimeout(stopTimerRef.current);
    const text = await resolveTranscript(liveTextRef.current.trim() || null);
    liveTextRef.current = "";
    setLiveText("");
    setVoice("idle");
    if (text) ask(text).catch((e) => console.warn("Dream question failed", e));
  };

  const stopListening = () => {
    clearTimeout(vadTimerRef.current);
    setVoice("transcribing");
    STT.stop();
    stopTimerRef.current = setTimeout(settle, STOP_TIMEOUT_MS);
  };

  const startListening = async () => {
    //the mic would hear the previous reply
    TTS.stop();
    const granted = await STT.requestPermissions();
    if (!granted) {
      setAnswer({ msgId: "", content: t("chatbar.micPermission.message") });
      return;
    }
    let locale = Settings.getCached().whisperLanguage || "en-US";
    if (locale === "auto" || locale.length > 5) locale = "en-US";
    const canTranscribeRemotely = !Settings.getCached().alwaysWhisper && capabilitiesRef.current.includes("audio") && !!selectedModelRef.current;
    liveTextRef.current = "";
    audioUriRef.current = null;
    settledRef.current = false;
    setLiveText("");
    setVoice("listening");
    const fail = (e: unknown) => {
      console.warn("Dream voice input failed:", e);
      settledRef.current = true;
      clearTimeout(vadTimerRef.current);
      clearTimeout(stopTimerRef.current);
      setLiveText("");
      setVoice("idle");
    };
    try {
      STT.start(locale, {
        onPartial: (text) => { if (text) { liveTextRef.current = text; setLiveText(text); } },
        onFinal: (text) => { if (text) { liveTextRef.current = text; setLiveText(text); } },
        onSpeechStart: () => clearTimeout(vadTimerRef.current),
        //stop once the speaker stays quiet
        onSpeechEnd: () => {
          clearTimeout(vadTimerRef.current);
          vadTimerRef.current = setTimeout(stopListening, VAD_SILENCE_MS);
        },
        onAudioFile: (uri) => { audioUriRef.current = uri; },
        onError: fail,
        onDone: settle,
      }, canTranscribeRemotely && STT.supportsRecording());
    } catch (e) {
      fail(e);
    }
  };

  const handleMicPress = () => {
    Vibration.vibrate(10);
    if (generatingConvId) GenerationService.stop(generatingConvId);
    else if (voice === "listening") stopListening();
    else if (voice === "idle") startListening();
  };

  const busy = voice !== "idle" || !!generatingConvId;
  const conversing = answer !== null || voice !== "idle";
  const display = answer ? deriveChatDisplay(answer.content, !!generatingConvId, null, modelCapabilities.includes("thinking") && selectedReflection !== "none") : null;
  const showMarkdown = !!display?.showMarkdown;
  const finalContent = display?.finalContent ?? "";
  //reparse only when the text changes
  const markdown = useMemo(
    () => (showMarkdown ? renderMarkdown(finalContent, incognito, true) : null),
    [showMarkdown, finalContent, incognito]
  );
  const answerView = voice === "transcribing" || display?.showThinkingRow ? <ThinkingIcon incognito={incognito} /> : markdown;

  const time = formatTime(now);

  const micButton = (
    <Pressable
      onPress={handleMicPress}
      style={pressStyle(
        [styles.button, styles.micButton, incognito && styles.micButtonIncognito, conversing && styles.wideButton],
        incognito ? { backgroundColor: Colors.incognitoPressed } : "primary"
      )}
    >
      <Image source={busy ? stopIcon : micIcon} style={styles.micIcon} tintColor={Colors.textOnPrimary} />
    </Pressable>
  );

  const modelButton = (
    <Pressable
      onPress={() => setModelSelectorVisible((v) => !v)}
      style={pressStyle([styles.button, styles.surfaceButton], { backgroundColor: Colors.surfacePressed })}
    >
      <Text style={styles.buttonLabel} numberOfLines={1}>
        {selectedModel ? modelLabel(selectedModel) : t("dream.model")}
      </Text>
    </Pressable>
  );

  const incognitoButton = (
    <Pressable
      onPress={() => {
        Vibration.vibrate(10);
        setIncognito((v) => !v);
      }}
      style={pressStyle(
        [styles.button, styles.surfaceButton, incognito && styles.incognitoButtonActive],
        incognito ? { backgroundColor: Colors.incognitoPressed } : { backgroundColor: Colors.surfacePressed }
      )}
    >
      <Text style={[styles.buttonLabel, incognito && styles.buttonLabelActive]} numberOfLines={1}>
        {t("dream.incognito")}
      </Text>
    </Pressable>
  );

  const idleLayout = (
    <>
      <View style={[styles.fill, landscape ? styles.row : styles.column]}>
        <View style={[styles.clock, landscape && styles.fill]}>
          <Text style={styles.time} numberOfLines={1} adjustsFontSizeToFit>{time}</Text>
          <Text style={styles.date} numberOfLines={1}>{formatDate(now)}</Text>
        </View>
        <View
          style={[styles.fill, styles.center]}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setButterflySize(Math.min(width, height));
          }}
        >
          {butterflySize > 0 && (
            <ButterflyCluster incognito={incognito} style={{ width: butterflySize, height: butterflySize }} />
          )}
        </View>
      </View>
      <View style={styles.buttonRow}>
        {micButton}
        {modelButton}
        {incognitoButton}
      </View>
    </>
  );

  const questionText = (
    <Text style={styles.question} numberOfLines={4}>
      {voice === "idle" ? question : liveText}
    </Text>
  );
  const answerScroll = (
    <ScrollView style={styles.fill} contentContainerStyle={styles.answerContent}>
      {answerView}
    </ScrollView>
  );
  const conversationButtons = (
    <View style={styles.buttonRow}>
      {micButton}
      {modelButton}
    </View>
  );

  const conversationLayout = landscape ? (
    <View style={[styles.fill, styles.row]}>
      <View style={[styles.fill, styles.spread]}>
        <Text style={styles.smallTime}>{time}</Text>
        <View style={styles.stack}>
          {questionText}
          {conversationButtons}
        </View>
      </View>
      {answerScroll}
    </View>
  ) : (
    <View style={[styles.fill, styles.column]}>
      <Text style={styles.smallTime}>{time}</Text>
      {answerScroll}
      <View style={styles.stack}>
        {questionText}
        {conversationButtons}
      </View>
    </View>
  );

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setLandscape(width > height);
      }}
    >
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.xxl,
            paddingBottom: insets.bottom + Spacing.xxl,
            paddingLeft: insets.left + Spacing.xxl,
            paddingRight: insets.right + Spacing.xxl,
          },
        ]}
      >
        {conversing ? conversationLayout : idleLayout}
      </View>

      <ModelSelectorDrawer
        visible={modelSelectorVisible}
        onClose={() => setModelSelectorVisible(false)}
        progress={modelSelectorProgress}
        selectedModel={selectedModel}
        selectedReflection={selectedReflection}
        showReflection={modelCapabilities.includes("thinking")}
        aiService={aiService}
        ollamaUrl={ollamaUrl}
        onServiceChange={(service, url) => {
          setAiService(service);
          setOllamaUrl(url);
          Settings.set("aiService", service);
          Settings.set("ollamaUrl", url);
          AIModule.setMode(service);
          if (url) {
            const tuning = getOllamaTuning(url);
            AIModule.configure(url, tuning.contextLength, tuning.keepAlive);
          }
        }}
        onModelChange={(model) => {
          setSelectedModel(model);
          Settings.set("ollamaModel", model);
          AIModule.preloadModel(model).catch(() => { });
        }}
        onReflectionChange={setSelectedReflection}
        isLargeScreen={isLargeScreen}
      />

      <HeadlessWebView />
    </View>
  );
}

const rootStyles = StyleSheet.create({
  fill: { flex: 1 },
});

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    gap: Spacing.xxl,
  },
  fill: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.xxl,
  },
  column: {
    flexDirection: "column",
    gap: Spacing.xxl,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  //question and buttons sink to the bottom
  spread: {
    justifyContent: "space-between",
  },
  stack: {
    gap: Spacing.lg2,
  },
  clock: {
    alignItems: "center",
    justifyContent: "center",
  },
  time: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.displayClock,
    color: Colors.textPrimary,
  },
  date: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xxxl,
    color: Colors.textPrimary,
  },
  smallTime: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.displayLg,
    color: Colors.textPrimary,
  },
  question: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  answerContent: {
    paddingBottom: Spacing.xxl,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    paddingHorizontal: Spacing.lg2,
    alignItems: "center",
    justifyContent: "center",
  },
  //same glow as the chat composer
  micButton: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
    boxShadow: `2px 6px 22px ${Colors.primary}`,
    elevation: 8,
  },
  micButtonIncognito: {
    backgroundColor: Colors.incognito,
    boxShadow: `2px 6px 15px ${Colors.incognito}`,
  },
  wideButton: {
    flex: 2,
  },
  micIcon: {
    width: 18,
    height: 18,
  },
  surfaceButton: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  incognitoButtonActive: {
    backgroundColor: Colors.incognito,
    borderColor: Colors.borderOnPrimary,
  },
  buttonLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  buttonLabelActive: {
    color: Colors.textOnPrimary,
  },
});

