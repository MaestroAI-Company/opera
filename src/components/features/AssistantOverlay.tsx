import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  DeviceEventEmitter,
  ImageSourcePropType,
  InteractionManager,
  Linking,
  Platform,
  StyleSheet,
  Vibration,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView, KeyboardProvider, useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';
import { Colors } from '../../../constants/theme';
import { AIModule } from '../../services/ai/AIModule';
import { buildSystemPrompt, streamAssistantReply } from '../../services/ai/generation/chatGeneration';
import { generateSuggestions, Suggestion } from '../../services/ai/generation/suggestions';
import { resolveQuickFlow } from '../../services/ai/quickFlow';
import { arrayBufferToBase64 } from '../../services/ai/utils/base64';
import { CloudSync } from '../../services/CloudSyncService';
import { Conversation, DB, Message } from '../../services/db/DatabaseService';
import { AppEvents } from '../../services/events';
import { AppSettings, Settings } from '../../services/settings/SettingsService';
import { STT, WhisperSTT } from "../../services/speech/STTService";
import { TTS } from '../../services/speech/TTSService';
import NotificationModal from '../ui/NotificationModal';
import ChatBar, { ChatBarHandle } from './ChatBar';
import ChatView from './ChatView';
import { ModelSelectorDrawer, ModelSelectorTrigger } from './ModelSelector';
import SelectionLayer from './SelectionLayer';

import { useResponsive } from '../../hooks/useResponsive';
import { AppContext, AppIcon, ScreenCapture } from '../../services/overlay/screenCapture';
import { useScreenDetections } from '../../services/overlay/useScreenDetections';
import { useScreenSelection } from '../../services/overlay/useScreenSelection';

import HeadlessWebView from '../../../components/HeadlessWebView';
import { useAnimatedValue } from '../../hooks/useAnimatedValue';
import { PluginRegistry } from '../../services/plugins/PluginRegistry';
import '../../services/widgets/registerWidgets';

//how far bars start offscreen
const BAR_ENTRY = 120;
//thickness of the activation rim
const HALO_SIZE = 88;
const assistantInfoImage = require('../../../assets/images/ImageCard/AssistantInfo.png');

export default function AssistantOverlayWrapper() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <AssistantOverlay />
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

function AssistantOverlay() {
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();

  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  //tied to the reply they were generated for
  const [suggestions, setSuggestions] = useState<{ msgId: string; items: Suggestion[] } | null>(null);

  //ref mirror for fresh messages
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const [selectedModel, setSelectedModel] = useState('');
  const [aiService, setAiService] = useState('ollama');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const modelSelectorProgress = useAnimatedValue(0);
  const [userInstruction, setUserInstruction] = useState('');
  const [alwaysWhisper, setAlwaysWhisper] = useState(false);
  //autoStartMic setting from db
  const autoStartMicSetting = useRef(false);
  const [modelCapabilities, setModelCapabilities] = useState<string[]>([]);
  //true once capabilities resolve
  const [capabilitiesReady, setCapabilitiesReady] = useState(false);

  //reflection in state and ref
  const [selectedReflection, setSelectedReflection] = useState('none');
  const selectedReflectionRef = useRef('none');
  const setReflection = useCallback((v: string) => {
    selectedReflectionRef.current = v;
    setSelectedReflection(v);
  }, []);

  //other settings as refs
  const selectedModelRef = useRef('');
  const userInstructionRef = useRef('');
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
  useEffect(() => { userInstructionRef.current = userInstruction; }, [userInstruction]);

  const [generatingConvId, setGeneratingConvId] = useState<string | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatBarRef = useRef<ChatBarHandle>(null);

  //modal state for whisper errors
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{ title: string, message: string, image?: ImageSourcePropType, buttons?: any[] }>({ title: '', message: '' });

  //state re-renders while a tool runs
  const [, setActiveTool] = useState<{ name: string | null, args: any | null }>({ name: null, args: null });
  useEffect(() => {
    const unsub = AIModule.SharedGenerationState.subscribe(() => {
      setActiveTool({
        name: AIModule.SharedGenerationState.activeToolName,
        args: AIModule.SharedGenerationState.activeToolArgs
      });
    });
    return unsub;
  }, []);

  //raf-throttle streaming updates to ~60fps
  const rafPendingRef = useRef(false);
  const scheduleFlush = useCallback((msgId: string) => {
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      const content = streamingContentRef.current;
      //notify shared state with render flush
      AIModule.SharedGenerationState.content = content;
      AIModule.SharedGenerationState.notify();
      setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, content } : m)));
    });
  }, []);

  //overlay phases select and respond
  const [phase, setPhase] = useState<'select' | 'respond'>('select');
  //bump forces fresh screenshot analysis
  const [session, setSession] = useState(0);
  const { selection, select, clear: clearSelection, attachment } = useScreenSelection(session);
  //selection works without it
  const detections = useScreenDetections(session);
  //foreground app and screen text
  const appContextRef = useRef<AppContext | null>(null);
  //chip icon and label state
  const [appIconInfo, setAppIconInfo] = useState<AppIcon | null>(null);
  //dismissible chip strips screen context
  const [appContextDismissed, setAppContextDismissed] = useState(false);
  //hide chrome while drawing lasso
  const [isDrawingSelection, setIsDrawingSelection] = useState(false);

  //lift bottom bar above keyboard
  const keyboardHeight = useSharedValue(0);
  useGenericKeyboardHandler({
    onMove: (e) => { 'worklet'; keyboardHeight.value = e.height; },
    onEnd: (e) => { 'worklet'; keyboardHeight.value = e.height; },
  }, []);
  const liftBarInSelect = useSharedValue(1);
  useEffect(() => { liftBarInSelect.value = phase === 'select' ? 1 : 0; }, [phase, liftBarInSelect]);
  //bar rides in above keyboard
  const bottomBarEntry = useSharedValue(BAR_ENTRY);
  const bottomBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bottomBarEntry.value - keyboardHeight.value * liftBarInSelect.value }],
  }));

  //entry bounce
  const mountOpacity = useAnimatedValue(0);
  const topBarEntry = useAnimatedValue(-BAR_ENTRY);
  const responseOpacity = useAnimatedValue(0);

  //activation rim fades out
  const haloOpacity = useAnimatedValue(0);
  //exit runs once, a second dismiss must not cut it short
  const closingRef = useRef(false);

  //replayed when the activity is reused instead of remounted
  const playEntry = useCallback(() => {
    mountOpacity.setValue(0);
    topBarEntry.setValue(-BAR_ENTRY);
    haloOpacity.setValue(0);
    bottomBarEntry.value = BAR_ENTRY;
    Animated.spring(mountOpacity, { toValue: 1, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    //bars return to their edges
    Animated.spring(topBarEntry, { toValue: 0, useNativeDriver: true, bounciness: 9, speed: 14 }).start();
    //bar slides up from the bottom, same feel as ModelSelector's sheet
    bottomBarEntry.value = withSpring(0, { duration: 500, dampingRatio: 0.65 });
    Animated.sequence([
      Animated.timing(haloOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(haloOpacity, { toValue: 0, delay: 160, duration: 760, useNativeDriver: true }),
    ]).start();
  }, [mountOpacity, topBarEntry, bottomBarEntry, haloOpacity]);

  //same springs as the entry, played back toward the offscreen start
  const playExit = useCallback((done: () => void) => {
    Animated.spring(topBarEntry, { toValue: -BAR_ENTRY, useNativeDriver: true, bounciness: 9, speed: 14 }).start();
    bottomBarEntry.value = withSpring(BAR_ENTRY, { duration: 500, dampingRatio: 0.65 });
    //fade owns the timing, everything is hidden once it lands
    Animated.spring(mountOpacity, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start(() => done());
  }, [mountOpacity, topBarEntry, bottomBarEntry]);

  useEffect(() => { playEntry(); }, [playEntry]);

  //capture app context for the ai
  //defer assist and icon reads
  useEffect(() => {
    let cancelled = false;
    appContextRef.current = null;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      setAppIconInfo(null);
      setAppContextDismissed(false);
      ScreenCapture.getAppContext()
        .then(async ctx => {
          if (cancelled) return;
          appContextRef.current = ctx;
          if (ctx?.appPackage) {
            const info = await ScreenCapture.getAppIcon(ctx.appPackage);
            if (!cancelled && info) setAppIconInfo(info);
          }
        })
        .catch(() => { });
    });
    return () => { cancelled = true; handle.cancel(); };
  }, [session]);


  const activeConversationRef = useRef<Conversation | null>(null);
  useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);

  const goToRespond = useCallback(() => {
    setPhase('respond');
    clearSelection();
    responseOpacity.setValue(0);
    Animated.timing(responseOpacity, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [responseOpacity, clearSelection]);

  //push db settings into module and local state
  const applySettings = useCallback((s: AppSettings) => {
    setUserInstruction(s.instruction);
    if (s.ollamaModel) {
      setSelectedModel(s.ollamaModel);
      selectedModelRef.current = s.ollamaModel;
    }
    setAiService(s.aiService);
    setOllamaUrl(s.ollamaUrl);
    setAlwaysWhisper(s.alwaysWhisper);
    //store setting for later
    autoStartMicSetting.current = s.autoStartMic ?? true;
    AIModule.configure(s.ollamaUrl, s.ollamaContextLength, s.ollamaKeepAlive);
    AIModule.setMode(s.aiService);
    STT.setLanguage(s.whisperLanguage);
  }, []);

  //reload settings changed while overlay open
  const reloadSettings = useCallback(() => {
    Settings.load().then(applySettings).catch(() => { });
  }, [applySettings]);

  //init db settings and model
  useEffect(() => {
    const init = async () => {
      try {
        //parallel db and settings connections
        await Promise.all([DB.init(), Settings.init()]);
        const s = await Settings.load();
        applySettings(s);

        //show once, first time this overlay is opened
        if (!s.hasSeenAssistantOverlay) {
          Settings.set('hasSeenAssistantOverlay', true);
          setModalConfig({
            title: 'Welcome to the Assistant View',
            message: "This is your floating assistant. You can Circle To Ask on your screen with any content. It's here to help you across your usage.",
            image: assistantInfoImage,
            buttons: [{ text: 'OK', onPress: () => setModalVisible(false), style: 'primary' }]
          });
          setModalVisible(true);
        }

        //defer model preload past animation
        if (s.ollamaModel) {
          InteractionManager.runAfterInteractions(() => {
            AIModule.preloadModel(s.ollamaModel!).catch(() => { });
          });
        }
      } catch (e) {
        console.warn('Failed to load settings in AssistantOverlay', e);
      }
      //only needed once tools are used
      InteractionManager.runAfterInteractions(() => {
        PluginRegistry.init().then(() => PluginRegistry.loadAll()).catch(() => { });
      });
    };
    init();
  }, [applySettings]);

  //settings edited elsewhere in this process
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(AppEvents.settingsChanged, reloadSettings);
    return () => sub.remove();
  }, [reloadSettings]);

  //full overlay reset on close/reopen
  const resetOverlay = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    streamingMsgIdRef.current = null;
    streamingContentRef.current = '';
    chatBarRef.current?.stopRecording();
    chatBarRef.current?.clear();
    if (Platform.OS !== 'web') STT.abort();
    setActiveConversation(null);
    activeConversationRef.current = null;
    setMessages([]);
    setPhase('select');
    setGeneratingConvId(null);
    appContextRef.current = null;
    setAppIconInfo(null);
    setAppContextDismissed(false);
    //reset capture and selection
    setSession(s => s + 1);
    AIModule.SharedGenerationState.activeConvId = null;
    AIModule.SharedGenerationState.activeMsgId = null;
    AIModule.SharedGenerationState.content = '';
    AIModule.SharedGenerationState.abort = () => { };
    AIModule.SharedGenerationState.notify();
  }, []);

  //hardware back
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (closingRef.current) return true;
      closingRef.current = true;
      playExit(() => {
        resetOverlay();
        BackHandler.exitApp();
      });
      return true;
    });
    return () => handler.remove();
  }, [resetOverlay, playExit]);

  //reopen via same activity instance
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(AppEvents.overlayReopened, () => {
      closingRef.current = false;
      resetOverlay();
      //settings may have changed while closed
      reloadSettings();
      //values were left at their exit end, wind them back
      playEntry();
    });
    return () => sub.remove();
  }, [resetOverlay, reloadSettings, playEntry]);

  //close overlay but keep app alive
  const closeOverlay = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    //reset only once hidden, so the content does not blank mid exit
    playExit(() => {
      resetOverlay();
      ScreenCapture.close();
    });
  }, [playExit, resetOverlay]);

  //hand off conversation then close
  const openConversationInApp = useCallback((convId: string) => {
    //app launches while the overlay plays out
    Linking.openURL(`opera://?convId=${convId}`).catch(() => { });
    if (closingRef.current) return;
    closingRef.current = true;
    playExit(() => {
      resetOverlay();
      //close overlay only
      ScreenCapture.close();
    });
  }, [playExit, resetOverlay]);

  //model capabilities for mic auto-start
  useEffect(() => {
    let cancelled = false;
    //reset the gate while the new model's capabilities load
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCapabilitiesReady(false);
    if (selectedModel) {
      AIModule.getModelCapabilities(selectedModel).then(caps => {
        if (!cancelled) {
          setModelCapabilities(caps);
          setCapabilitiesReady(true);
        }
      });
    } else {
      setModelCapabilities([]);
      setCapabilitiesReady(true);
    }
    return () => { cancelled = true; };
  }, [selectedModel, aiService, ollamaUrl]);

  const generateTitle = useCallback(async (convId: string, userMessage: string, images?: string[]) => {
    try {
      let title = '';
      await AIModule.sendOn(
        resolveQuickFlow(selectedModelRef.current),
        SYSTEM_PROMPTS.SUMMARIZE,
        [{ role: 'user', content: userMessage, images }],
        chunk => { title += chunk; },
        undefined,
        { think: false }
      );
      const cleaned = title.trim();
      if (cleaned.length > 0) {
        await DB.renameConversation(convId, cleaned);
        setActiveConversation(prev =>
          prev && prev.id === convId ? { ...prev, name: cleaned } : prev
        );
      }
    } catch (e) {
      //best-effort title keep on failure
      console.warn('Title generation skipped:', (e as any)?.message ?? e);
    }
  }, []);

  const handleSend = useCallback(async (text: string, images?: string[], viaVoice?: boolean) => {
    const model = selectedModelRef.current;
    const instruction = userInstructionRef.current;
    const reflection = selectedReflectionRef.current; //always fresh

    //switch to respond phase while streaming
    goToRespond();

    let conv = activeConversationRef.current;
    let isFirstMessage = false;

    if (!conv) {
      isFirstMessage = true;
      const name = text.length > 30 ? text.slice(0, 30) + '…' : text;
      conv = await DB.createConversation(model || 'unknown', name);
      setActiveConversation(conv);
      activeConversationRef.current = conv;
    }

    const userMsg = await DB.addMessage(conv.id, 'user', text, images);
    if (images && images.length > 0) userMsg.images = images;
    setMessages(prev => [...prev, userMsg]);

    const taskHistory = messagesRef.current
      .filter(m => m.content !== '…')
      .map(m => ({ role: m.role, content: m.content, images: m.images }));
    taskHistory.push({ role: 'user', content: text, images });

    //give model screen context
    //refetch if assist arrived late
    let screenContextSegment = '';
    const appContextEnabled = Settings.getCached().useAppContext !== false;
    let ctx = appContextDismissed || !appContextEnabled ? null : appContextRef.current;
    if (appContextEnabled && !appContextDismissed && (!ctx || (!ctx.appPackage && !ctx.screenText))) {
      ctx = await ScreenCapture.getAppContext();
      appContextRef.current = ctx;
    }
    if (ctx && (ctx.appPackage || ctx.screenText)) {
      //reuse chip icon and label
      let iconInfo = appIconInfo;
      if (!iconInfo && ctx.appPackage) {
        iconInfo = await ScreenCapture.getAppIcon(ctx.appPackage);
      }
      const badge = {
        appPackage: ctx.appPackage ?? null,
        hasScreenText: !!(ctx.screenText && ctx.screenText.trim().length > 0),
        icon: iconInfo?.icon ?? null,
        label: iconInfo?.label ?? null,
      };
      userMsg.screenContext = badge;
      //patch bubble to show badge
      setMessages(prev => prev.map(m => m.id === userMsg.id ? { ...m, screenContext: badge } : m));
      //persist badge across reloads
      DB.updateMessageScreenContext(userMsg.id, badge).catch(() => { });
      const parts: string[] = ['\n\n---\n\n# Screen Context'];
      if (ctx.appPackage) parts.push(`Foreground app: ${ctx.appPackage}`);
      if (ctx.screenText && ctx.screenText.trim().length > 0) {
        parts.push(`Visible text on screen:\n"""\n${ctx.screenText.trim()}\n"""`);
      }
      screenContextSegment = parts.join('\n');
    }
    //dismiss chip after first message
    setAppContextDismissed(true);

    const taskSystemPrompt = buildSystemPrompt(instruction, screenContextSegment);

    const assistantMsg = await DB.addMessage(conv.id, 'assistant', '…');
    setMessages(prev => [...prev, assistantMsg]);

    setGeneratingConvId(conv.id);
    streamingMsgIdRef.current = assistantMsg.id;
    streamingContentRef.current = '';
    abortControllerRef.current = new AbortController();

    AIModule.SharedGenerationState.activeConvId = conv.id;
    AIModule.SharedGenerationState.activeMsgId = assistantMsg.id;
    AIModule.SharedGenerationState.content = '';
    AIModule.SharedGenerationState.abort = () => abortControllerRef.current?.abort();

    let isError = false;
    let isAborted = false;
    let messageSources: Message['sources'];

    if (!model) {
      isError = true;
      streamingContentRef.current = 'Please select a model in the main app settings.';
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, content: streamingContentRef.current } : m
      ));
      abortControllerRef.current = null;
    } else {
      try {
        const outcome = await streamAssistantReply({
          model,
          systemPrompt: taskSystemPrompt,
          history: taskHistory,
          think: reflection === 'none' ? false : reflection,
          signal: abortControllerRef.current.signal,
          onContent: (content) => {
            streamingContentRef.current = content;
            scheduleFlush(assistantMsg.id);
          },
        });

        if (outcome.status === 'error') {
          isError = true;
          streamingContentRef.current = `Error during generation: ${outcome.error ?? 'unknown error'}`;
        } else {
          isAborted = outcome.status === 'aborted';
          streamingContentRef.current = outcome.content;
        }
        messageSources = outcome.sources;
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, content: streamingContentRef.current, sources: messageSources ?? m.sources } : m
        ));
      } finally {
        abortControllerRef.current = null;
      }
    }

    //keep partial text on error
    await DB.updateMessageContent(assistantMsg.id, streamingContentRef.current);
    if (!isError) {
      if (messageSources && messageSources.length > 0) {
        await DB.updateMessageSources(assistantMsg.id, messageSources);
      }
      CloudSync.requestAutoSync(0); //push completed ai message right away
    }

    if (isFirstMessage && !isError) generateTitle(conv.id, text, images);

    //propose follow-ups once the reply landed whole
    if (!isError && !isAborted && model) {
      generateSuggestions({
        model,
        userMessage: text,
        assistantMessage: streamingContentRef.current,
        //show each pill once complete
        onPartial: items => setSuggestions({ msgId: assistantMsg.id, items }),
      }).then(items => {
        if (items.length > 0) setSuggestions({ msgId: assistantMsg.id, items });
      });
    }

    //auto-read the reply aloud when it was requested via voice
    if (viaVoice && !isError && Settings.getCached().autoSpeak) {
      TTS.speak(streamingContentRef.current, { language: Settings.getCached().language, id: assistantMsg.id });
    }

    setGeneratingConvId(null);
    streamingMsgIdRef.current = null;

    AIModule.SharedGenerationState.activeConvId = null;
    AIModule.SharedGenerationState.activeMsgId = null;
    AIModule.SharedGenerationState.notify();
  }, [scheduleFlush, generateTitle, goToRespond, appContextDismissed, appIconInfo]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  //native transcript used instead of whisper
  const handleTranscribe = useCallback(async (wavBuffer: ArrayBuffer, localFallback?: string | null): Promise<string | null> => {
    const model = selectedModelRef.current;
    const useRemote = !alwaysWhisper && modelCapabilities.includes('audio') && model;

    if (useRemote) {
      try {
        const base64Audio = 'data:audio/wav;base64,' + arrayBufferToBase64(wavBuffer);
        let transcription = '';
        await AIModule.sendMessage(
          model,
          SYSTEM_PROMPTS.TRANSCRIBE,
          [{ role: 'user', content: 'Transcribe this audio.', images: [base64Audio] }],
          chunk => { transcription += chunk; },
          undefined,
          { think: false }
        );
        const result = transcription.trim();
        if (result) return result;
      } catch (e) {
        console.warn('Remote transcription failed, falling back to local', e);
      }
    }

    if (localFallback !== undefined) return localFallback;

    //fallback or forced whisper
    try {
      const whisperModelName = Settings.getCached().whisperModel || "base";
      if (whisperModelName === "none") {
        setModalConfig({
          title: "Whisper Not Configured",
          message: "You have disabled on-device transcription. Please select a Whisper model in settings to enable it.",
          buttons: [{ text: "OK", onPress: () => setModalVisible(false), style: "primary" }]
        });
        setModalVisible(true);
        return null;
      }

      const isInstalled = await WhisperSTT.isModelInstalled(whisperModelName);
      if (!isInstalled) {
        setModalConfig({
          title: "Whisper Not Installed",
          message: `The Whisper ${whisperModelName} model is required for on-device transcription. Please install it in the main app settings.`,
          buttons: [{ text: "OK", onPress: () => setModalVisible(false), style: "primary" }]
        });
        setModalVisible(true);
        return null;
      }

      const initialized = await WhisperSTT.init(whisperModelName);
      if (!initialized) {
        setModalConfig({
          title: "Initialization Error",
          message: `Failed to load the Whisper ${whisperModelName} model.`,
          buttons: [{ text: "OK", onPress: () => setModalVisible(false), style: "primary" }]
        });
        setModalVisible(true);
        return null;
      }

      return await WhisperSTT.transcribeData(wavBuffer);
    } catch (e) {
      console.error("Whisper transcription failed:", e);
      return null;
    }
  }, [alwaysWhisper, modelCapabilities]);

  //refs drive the render here, they are written from the async generation flow
  /* eslint-disable react-hooks/refs */
  const generatingMessageId = streamingMsgIdRef.current;
  const shouldAutoStartMic = capabilitiesReady && autoStartMicSetting.current;
  /* eslint-enable react-hooks/refs */

  //latest assistant message via reverse scan
  let lastMsg: Message | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') { lastMsg = messages[i]; break; }
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="height"
        enabled={phase === 'respond'}
      >
        <Animated.View
          style={[styles.phaseContainer, { opacity: mountOpacity }]}
        >
          {phase === 'select' ? (
            <SelectionLayer
              selection={selection}
              onChange={select}
              onVibrate={() => Vibration.vibrate(10)}
              onDrawingChange={setIsDrawingSelection}
              onDismiss={closeOverlay}
              detections={detections}
            />
          ) : (
            <Animated.View style={[styles.phaseContainer, { opacity: responseOpacity }]} pointerEvents="box-none">
              <LinearGradient
                colors={['rgba(0,0,0,0.60)', 'rgba(0,0,0,1)']}
                style={styles.chatViewWrapper}
                pointerEvents="box-none"
              >
                <ChatView
                  messages={lastMsg ? [lastMsg] : []}
                  conversation={activeConversation}
                  contentTopPadding={insets.top + 56}
                  contentBottomPadding={insets.bottom + 96}
                  hideHeader={true}
                  hideGradients={true}
                  generatingMessageId={generatingMessageId}
                  speakerEnabled={true}
                  canThink={modelCapabilities.includes('thinking') && selectedReflection !== 'none'}
                  dark={true}
                  alignBottom={true}
                  onOpenInApp={(item) => openConversationInApp(item.conversationId)}
                  suggestions={suggestions && lastMsg && suggestions.msgId === lastMsg.id ? suggestions.items : undefined}
                  onSuggestionPress={handleSend}
                />
              </LinearGradient>
            </Animated.View>
          )}

          {/* model selector top center, hidden while drawing a lasso */}
          <Animated.View
            style={[styles.topBar, { paddingTop: insets.top + 16, transform: [{ translateY: topBarEntry }] }, isDrawingSelection && styles.hiddenBar]}
            pointerEvents={isDrawingSelection ? 'none' : 'box-none'}
          >
            <ModelSelectorTrigger
              selectedModel={selectedModel}
              onPress={() => setModelSelectorVisible(v => !v)}
            />
          </Animated.View>

          <Reanimated.View
            style={[styles.bottomBarOverlay, isLargeScreen && styles.bottomBarOverlayLarge, bottomBarStyle, isDrawingSelection && styles.hiddenBar]}
            pointerEvents={isDrawingSelection ? 'none' : 'box-none'}
          >
            <ChatBar
              ref={chatBarRef}
              onSend={handleSend}
              incognito={false}
              isGenerating={!!generatingConvId}
              onStop={handleStop}
              onTranscribe={handleTranscribe}
              canTranscribeRemotely={!alwaysWhisper && modelCapabilities.includes('audio') && !!selectedModel}
              supportsFiles={modelCapabilities.includes('vision') || modelCapabilities.includes('audio')}
              onOpenSettings={() => { }}
              enabled={true}
              autoStartMic={shouldAutoStartMic}
              selection={attachment}
              onSelectionRemove={clearSelection}
              appContextChip={Settings.getCached().useAppContext !== false && !appContextDismissed && appIconInfo ? { icon: appIconInfo.icon, label: appIconInfo.label } : null}
              onAppContextRemove={() => setAppContextDismissed(true)}
            />
          </Reanimated.View>
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, { opacity: haloOpacity }]} pointerEvents="none">
          <LinearGradient colors={[Colors.overlayHalo, Colors.overlayHaloClear]} style={styles.haloTop} />
          <LinearGradient colors={[Colors.overlayHaloClear, Colors.overlayHalo]} style={styles.haloBottom} />
          <LinearGradient colors={[Colors.overlayHalo, Colors.overlayHaloClear]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.haloLeft} />
          <LinearGradient colors={[Colors.overlayHaloClear, Colors.overlayHalo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.haloRight} />
        </Animated.View>

        <NotificationModal
          visible={modalVisible}
          title={modalConfig.title}
          image={modalConfig.image}
          message={modalConfig.message}
          buttons={modalConfig.buttons}
          onClose={() => setModalVisible(false)}
        />

        <ModelSelectorDrawer
          visible={modelSelectorVisible}
          onClose={() => setModelSelectorVisible(false)}
          progress={modelSelectorProgress}
          selectedModel={selectedModel}
          selectedReflection={selectedReflection}
          showReflection={modelCapabilities.includes('thinking')}
          aiService={aiService}
          ollamaUrl={ollamaUrl}
          onServiceChange={(service, url) => {
            setAiService(service);
            setOllamaUrl(url);
            Settings.set('aiService', service);
            Settings.set('ollamaUrl', url);
            AIModule.setMode(service);
            if (service === 'ollama') {
              const cached = Settings.getCached();
              AIModule.configure(url, cached.ollamaContextLength, cached.ollamaKeepAlive);
            }
          }}
          onModelChange={model => {
            setSelectedModel(model);
            selectedModelRef.current = model;
            Settings.set('ollamaModel', model);
            //preload newly selected model
            AIModule.preloadModel(model).catch(() => { });
          }}
          onReflectionChange={setReflection}
          isLargeScreen={isLargeScreen}
        />

        <HeadlessWebView />
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  phaseContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  chatViewWrapper: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  hiddenBar: {
    opacity: 0,
  },
  haloTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HALO_SIZE,
  },
  haloBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: HALO_SIZE,
  },
  haloLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: HALO_SIZE,
  },
  haloRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: HALO_SIZE,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  bottomBarOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBarOverlayLarge: {
    bottom: 24,
    right: 24,
    left: 'auto',
    width: 450,
  },
});
