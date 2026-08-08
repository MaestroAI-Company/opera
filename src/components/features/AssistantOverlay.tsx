import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  DeviceEventEmitter,
  Linking,
  Animated,
  BackHandler,
  Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { KeyboardAvoidingView, KeyboardProvider, useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatBar, { ChatBarHandle } from './ChatBar';
import NotificationModal from '../ui/NotificationModal';
import ChatView from './ChatView';
import { Conversation, DB, Message } from '../../services/db/DatabaseService';
import { Settings } from '../../services/settings/SettingsService';
import { AIModule } from '../../services/ai/AIModule';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';
import { STT } from '../../services/speech/STTService';
import { TTS } from '../../services/speech/TTSService';
import { NotificationService } from '../../services/notifications/NotificationService';
import { CloudSync } from '../../services/CloudSyncService';
import ModelDropdown from './ModelDropdown';
import SelectionLayer, { SelectionState } from './SelectionLayer';

import { useObjectDetector } from '../../services/overlay/useObjectDetector';
import { YoloDetection } from '../../services/overlay/yoloPostprocess';
import { OverlayNative } from '../../services/overlay/OverlayNative';
import { useResponsive } from '../../hooks/useResponsive';

//on-device deki yolo model
const OBJECT_DETECTOR_CONFIG = {
  modelSource: require('../../../assets/models/deki-yolo.pte'),
  classes: ['View', 'ImageView', 'Text', 'Line'] as const,
};

//web whisper surface, only used in browser flows
const WebSTT = STT as unknown as {
  isAvailable(): boolean;
  isModelInstalled(modelName: string): Promise<boolean>;
  init(modelName: string): Promise<boolean>;
  setLanguage(lang: string): void;
  transcribeData(buffer: ArrayBuffer): Promise<string>;
};
import SearchWebView from '../../../components/SearchWebView';
import { WidgetManager } from '../../services/widgets/WidgetManager';
import { PluginRegistry } from '../../services/plugins/PluginRegistry';

export default function AssistantOverlayWrapper() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <AssistantOverlay />
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const parts: string[] = [];
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    parts.push(
      chars[a >> 2] +
      chars[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < len ? chars[((b & 15) << 2) | (c >> 6)] : '=') +
      (i + 2 < len ? chars[c & 63] : '=')
    );
  }
  return parts.join('');
}

function AssistantOverlay() {
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();
  const [ready, setReady] = useState(false);

  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  //ref mirror for fresh messages
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const [selectedModel, setSelectedModel] = useState('');
  const [aiService, setAiService] = useState('ollama');
  const [ollamaUrl, setOllamaUrl] = useState('');
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
  const [modalConfig, setModalConfig] = useState<{ title: string, message: string, buttons?: any[] }>({ title: '', message: '' });

  const [activeTool, setActiveTool] = useState<{name: string | null, args: any | null}>({ name: null, args: null });
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
      setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, content } : m)));
    });
  }, []);

  //overlay phases: select/respond
  const [phase, setPhase] = useState<'select' | 'respond'>('select');
  const [detections, setDetections] = useState<YoloDetection[]>([]);
  const [screenshotSize, setScreenshotSize] = useState<{ width: number; height: number } | null>(null);
  const [selection, setSelection] = useState<SelectionState>({ kind: 'none' });
  const [selectionImage, setSelectionImage] = useState<{ uri: string, label: string } | null>(null);
  //bump on each overlay session to force a fresh screenshot analysis
  const [session, setSession] = useState(0);

  //lift bottom bar above keyboard in select phase
  const keyboardHeight = useSharedValue(0);
  useGenericKeyboardHandler({
    onMove: (e) => { 'worklet'; keyboardHeight.value = e.height; },
    onEnd: (e) => { 'worklet'; keyboardHeight.value = e.height; },
  }, []);
  const liftBarInSelect = useSharedValue(1);
  useEffect(() => { liftBarInSelect.value = phase === 'select' ? 1 : 0; }, [phase, liftBarInSelect]);
  const bottomBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboardHeight.value * liftBarInSelect.value }],
  }));

  // entry bounce (100% native driver)
  const mountOpacity = useRef(new Animated.Value(0)).current;
  const mountTranslate = useRef(new Animated.Value(-30)).current;
  const responseOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(mountOpacity, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 18 }).start();
    Animated.spring(mountTranslate, { toValue: 0, useNativeDriver: true, bounciness: 8, speed: 18 }).start();
  }, [mountOpacity, mountTranslate]);

  //on-device yolo screen parser
  const { isReady: parserReady, error: parserError, detect } = useObjectDetector(OBJECT_DETECTOR_CONFIG);

  //analyze screenshot when model loaded
  useEffect(() => {
    if (!parserReady || parserError) return;
    let cancelled = false;
    (async () => {
      try {
        const [ds, info] = await Promise.all([
          detect(),
          OverlayNative.getScreenshotInfo(),
        ]);
        if (cancelled) return;
        setDetections(ds);
        if (info) setScreenshotSize(info);
      } catch (e) {
        if (!cancelled) console.warn('[ObjectDetector] analysis failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [parserReady, parserError, detect, session]);

  const activeConversationRef = useRef<Conversation | null>(null);
  useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);

  const goToSelect = useCallback(() => {
    Animated.timing(responseOpacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setPhase('select');
      setSelection({ kind: 'none' });
      setSelectionImage(null);
    });
  }, [responseOpacity]);

  const handleSelectionChange = useCallback((s: SelectionState) => {
    setSelection(s);
    if (s.kind === 'none') {
      setSelectionImage(null);
      return;
    }
    const region = s.kind === 'box'
      ? s.region
      : { x: 0, y: 0, w: 1, h: 1 };
    OverlayNative.cropRegion(region)
      .then(uri => {
        if (uri && uri.length > 0) {
          setSelectionImage({ uri, label: s.kind === 'box' ? 'Selection' : 'Full screen' });
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectionRemove = useCallback(() => {
    setSelection({ kind: 'none' });
    setSelectionImage(null);
  }, []);

  const goToRespond = useCallback(() => {
    setPhase('respond');
    setSelection({ kind: 'none' });
    setSelectionImage(null);
    responseOpacity.setValue(0);
    Animated.timing(responseOpacity, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [responseOpacity]);



  //init db, settings, preload model
  useEffect(() => {
    const init = async () => {
      await DB.init();
      try {
        await Settings.init();
        const s = await Settings.load();
        await PluginRegistry.init();
        await PluginRegistry.loadAll();
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
        AIModule.configure(s.ollamaUrl);
        AIModule.setMode(s.aiService);
        STT.setLanguage(s.whisperLanguage);

        //preload model into ram
        if (s.ollamaModel) {
          AIModule.preloadModel(s.ollamaModel).catch(() => {});
        }
      } catch (e) {
        console.warn('Failed to load settings in AssistantOverlay', e);
      }
      setReady(true);
    };
    init();
  }, []);

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
    setSelection({ kind: 'none' });
    setSelectionImage(null);
    setPhase('select');
    setGeneratingConvId(null);
    setDetections([]);
    setScreenshotSize(null);
    setSession(s => s + 1);
    AIModule.SharedGenerationState.activeConvId = null;
    AIModule.SharedGenerationState.activeMsgId = null;
    AIModule.SharedGenerationState.content = '';
    AIModule.SharedGenerationState.abort = () => {};
    AIModule.SharedGenerationState.notify();
  }, []);

  //hardware back
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      resetOverlay();
      setTimeout(() => BackHandler.exitApp(), 100);
      return true;
    });
    return () => handler.remove();
  }, [resetOverlay]);

  //reopen via same activity instance
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('OVERLAY_REOPENED', () => {
      resetOverlay();
    });
    return () => sub.remove();
  }, [resetOverlay]);

  //hand conversation to the full app then close overlay
  const openConversationInApp = useCallback((convId: string) => {
    Linking.openURL(`opera://?convId=${convId}`).catch(() => {});
    resetOverlay();
    //close overlay only, not the app
    setTimeout(() => OverlayNative.closeOverlay(), 100);
  }, [resetOverlay]);

  //model capabilities for mic auto-start
  useEffect(() => {
    let cancelled = false;
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
      await AIModule.sendMessage(
        selectedModelRef.current,
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
      console.error('Failed to generate title:', e);
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

    const taskSystemPrompt = (instruction.trim().length > 0
      ? `${instruction.trim()}\n\n---\n\n${SYSTEM_PROMPTS.DEFAULT}`
      : SYSTEM_PROMPTS.DEFAULT) + WidgetManager.getSystemPromptSegment();

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

    if (!model) {
      isError = true;
      streamingContentRef.current = 'Please select a model in the main app settings.';
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, content: streamingContentRef.current } : m
      ));
      abortControllerRef.current = null;
    } else {
      try {
        await AIModule.sendMessageWithTools(
          model,
          taskSystemPrompt,
          taskHistory,
          chunk => {
            streamingContentRef.current += chunk;
            AIModule.SharedGenerationState.content = streamingContentRef.current;
            AIModule.SharedGenerationState.notify();
            scheduleFlush(assistantMsg.id);
          },
          abortControllerRef.current.signal,
          { think: reflection === 'none' ? false : reflection }
        );
      } catch (e: any) {
        const isAborted = e.name === 'AbortError'
          || e.message?.toLowerCase().includes('aborted')
          || e.message?.toLowerCase().includes('cancel');
        if (isAborted) {
          streamingContentRef.current += '\n\n_The user interrupted the response_';
        } else {
          isError = true;
          streamingContentRef.current = 'Error generating response.';
          console.error('AssistantOverlay AI Error:', e);
        }
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, content: streamingContentRef.current } : m
        ));
      } finally {
        abortControllerRef.current = null;
      }
    }

    if (isError) {
      if (isFirstMessage) {
        await DB.deleteConversation(conv.id);
        setActiveConversation(null);
        activeConversationRef.current = null;
        setMessages([]);
      } else {
        await DB.deleteMessage(userMsg.id);
        await DB.deleteMessage(assistantMsg.id);
      }
    } else {
      await DB.updateMessageContent(assistantMsg.id, streamingContentRef.current);
      CloudSync.requestAutoSync(0); //push completed ai message right away
    }

    if (isFirstMessage && !isError) generateTitle(conv.id, text, images);

    //auto-read the reply aloud when it was requested via voice
    if (viaVoice && !isError && Settings.getCached().autoSpeak) {
      TTS.speak(streamingContentRef.current, { language: Settings.getCached().language });
    }

    setGeneratingConvId(null);
    streamingMsgIdRef.current = null;
    
    AIModule.SharedGenerationState.activeConvId = null;
    AIModule.SharedGenerationState.activeMsgId = null;
    AIModule.SharedGenerationState.notify();
  }, [scheduleFlush, generateTitle, goToRespond]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleTranscribe = useCallback(async (wavBuffer: ArrayBuffer): Promise<string | null> => {
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
        console.warn('Remote transcription failed, falling back to Whisper', e);
      }
    }

    //fallback or alwaysWhisper = true
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

      const isInstalled = await WebSTT.isModelInstalled(whisperModelName);
      if (!isInstalled) {
        setModalConfig({
          title: "Whisper Not Installed",
          message: `The Whisper ${whisperModelName} model is required for on-device transcription. Please install it in the main app settings.`,
          buttons: [{ text: "OK", onPress: () => setModalVisible(false), style: "primary" }]
        });
        setModalVisible(true);
        return null;
      }

      const initialized = await WebSTT.init(whisperModelName);
      if (!initialized) {
        setModalConfig({
          title: "Initialization Error",
          message: `Failed to load the Whisper ${whisperModelName} model.`,
          buttons: [{ text: "OK", onPress: () => setModalVisible(false), style: "primary" }]
        });
        setModalVisible(true);
        return null;
      }

      return await WebSTT.transcribeData(wavBuffer);
    } catch (e) {
      console.error("Whisper transcription failed:", e);
      return null;
    }
  }, [alwaysWhisper, modelCapabilities]);

  if (!ready) return null;

  //derive display state from messages
  const lastMsg = messages.length > 0
    ? [...messages].reverse().find(m => m.role === 'assistant') ?? null
    : null;

  let isGenerating = false;
  if (lastMsg) {
    isGenerating = generatingConvId === activeConversation?.id
      && streamingMsgIdRef.current === lastMsg.id;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="height"
      enabled={phase === 'respond'}
    >
      <Animated.View
        style={[styles.phaseContainer, { opacity: mountOpacity, transform: [{ translateY: mountTranslate }] }]}
      >
        {phase === 'select' ? (
          <SelectionLayer
            detections={detections}
            screenshotSize={screenshotSize}
            selection={selection}
            onChange={handleSelectionChange}
            onVibrate={() => Vibration.vibrate(10)}
          />
        ) : (
          <Animated.View style={[styles.phaseContainer, { opacity: responseOpacity }]} pointerEvents="box-none">
            <LinearGradient
              colors={['rgba(0,0,0,0.50)', 'rgba(0,0,0,0.95)']}
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
                generatingMessageId={streamingMsgIdRef.current}
                speakerEnabled={true}
                canThink={modelCapabilities.includes('thinking') && selectedReflection !== 'none'}
                dark={true}
                alignBottom={true}
                onOpenInApp={(item) => openConversationInApp(item.conversationId)}
              />
            </LinearGradient>
          </Animated.View>
        )}

        {/* model selector — top center */}
        <View style={[styles.topBar, { paddingTop: insets.top + 16 }]} pointerEvents="box-none">
          <ModelDropdown
            selectedModel={selectedModel}
            selectedReflection={selectedReflection}
            showReflection={modelCapabilities.includes('thinking')}
            aiService={aiService}
            onModelChange={model => {
              setSelectedModel(model);
              selectedModelRef.current = model;
              Settings.set('ollamaModel', model);
              //preload newly selected model
              AIModule.preloadModel(model).catch(() => {});
            }}
            onReflectionChange={setReflection}
          />
        </View>

        <Reanimated.View style={[styles.bottomBarOverlay, isLargeScreen && styles.bottomBarOverlayLarge, bottomBarStyle]} pointerEvents="box-none">
          <ChatBar
            ref={chatBarRef}
            onSend={handleSend}
            onPlusPress={() => {}}
            incognito={false}
            isGenerating={!!generatingConvId}
            onStop={handleStop}
            onTranscribe={handleTranscribe}
            canTranscribeRemotely={!alwaysWhisper && modelCapabilities.includes('audio') && !!selectedModel}
            supportsFiles={modelCapabilities.includes('vision') || modelCapabilities.includes('audio')}
            onOpenSettings={() => {}}
            enabled={true}
            autoStartMic={capabilitiesReady && autoStartMicSetting.current}
            selection={selectionImage}
            onSelectionRemove={handleSelectionRemove}
          />
        </Reanimated.View>
      </Animated.View>

      <NotificationModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        buttons={modalConfig.buttons}
        onClose={() => setModalVisible(false)}
      />

      <SearchWebView />
    </KeyboardAvoidingView>
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
