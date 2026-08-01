import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  Animated,
  Image,
  PanResponder,
  Linking,
  ScrollView,
} from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHandler } from 'react-native';
import ChatBar, { ChatBarHandle } from '../../components/ChatBar';
import NotificationModal from '../../components/NotificationModal';
import { renderMarkdown } from '../../components/MarkdownText';
import { Conversation, DB, Message } from '../services/db/DatabaseService';
import { Settings } from '../services/settings/SettingsService';
import { AIModule } from '../services/ai/AIModule';
import { AICoreSTT } from '../services/ai/AICoreSpeechService';
import { SYSTEM_PROMPTS } from '../../constants/prompts';
import { Whisper } from '../services/whisper/WhisperService';
import { NotificationService } from '../services/notifications/NotificationService';
import ModelDropdown from '../../components/ModelDropdown';
import SearchWebView from '../../components/SearchWebView';
import { useResponsive } from '../hooks/useResponsive';
import { WidgetManager } from '../services/widgets/WidgetManager';

export default function AssistantOverlayWrapper() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <AssistantOverlay />
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

const thinkingGif = require('../../assets/icons/thinking.gif');

// isolated flashing text — never causes parent re-renders
const FlashingText = React.memo(({ text }: { text: string }) => {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.Text style={[styles.flashingText, { opacity }]} numberOfLines={2}>
      {text}
    </Animated.Text>
  );
});

function extractThinkStep(thinkingText: string): string {
  const stepRegex = /^\s*(?:(?:\d+[.)!]|[-*])\s*)?\*\*(.*?)\*\*/gm;
  const steps: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(thinkingText)) !== null) {
    steps.push(match[1].replace(/:$/, '').trim());
  }
  if (steps.length > 0) return `${steps.length}. ${steps[steps.length - 1]}`;
  const lines = thinkingText.split('\n').filter(l => l.trim().length > 0);
  return lines.length > 0 ? lines[lines.length - 1] : 'Thinking...';
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

// bubble height as fraction of screen so it feels like a sheet
const BUBBLE_HEIGHT_RATIO = 0.42;

function AssistantOverlay() {
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();
  const [ready, setReady] = useState(false);

  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // ref mirror so callbacks never have stale messages
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const [selectedModel, setSelectedModel] = useState('');
  const [aiService, setAiService] = useState('ollama');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [userInstruction, setUserInstruction] = useState('');
  const [alwaysWhisper, setAlwaysWhisper] = useState(false);
  // autoStartMic setting from db — only passed to ChatBar once capabilities are resolved
  const autoStartMicSetting = useRef(false);
  const [modelCapabilities, setModelCapabilities] = useState<string[]>([]);
  // true once getModelCapabilities has resolved — mic fires after this
  const [capabilitiesReady, setCapabilitiesReady] = useState(false);

  // reflection held in both state (for UI) and ref (for send handler — avoids stale closure)
  const [selectedReflection, setSelectedReflection] = useState('none');
  const selectedReflectionRef = useRef('none');
  const setReflection = useCallback((v: string) => {
    selectedReflectionRef.current = v;
    setSelectedReflection(v);
  }, []);

  // other volatile settings as refs so handleSend is stable
  const selectedModelRef = useRef('');
  const userInstructionRef = useRef('');
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
  useEffect(() => { userInstructionRef.current = userInstruction; }, [userInstruction]);

  const [generatingConvId, setGeneratingConvId] = useState<string | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatBarRef = useRef<ChatBarHandle>(null);

  // modal state for whisper errors
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

  // raf-throttle streaming updates to ~60fps
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

  // --- slide-up + fade animation (100% native driver) ---
  const slideAnim = useRef(new Animated.Value(0)).current;
  const bubbleOpacity = useRef(new Animated.Value(1)).current;

  const activeConversationRef = useRef<Conversation | null>(null);
  useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);

  const openMainApp = useCallback(() => {
    const url = activeConversationRef.current
      ? `opera://?convId=${activeConversationRef.current.id}`
      : 'opera://';
    setActiveConversation(null);
    setMessages([]);
    slideAnim.setValue(0);
    bubbleOpacity.setValue(1);
    Linking.openURL(url);
  }, [slideAnim, bubbleOpacity]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && g.dy < 0,
      onPanResponderMove: (_, g) => {
        if (g.dy < 0) {
          slideAnim.setValue(g.dy);
          // fade + scale out as user pulls up (0 at -200px)
          const progress = Math.min(1, Math.abs(g.dy) / 200);
          bubbleOpacity.setValue(1 - progress * 0.5);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -120 || g.vy < -0.9) {
          // fly out: slide up + fade simultaneously
          Animated.parallel([
            Animated.timing(slideAnim, {
              toValue: -700,
              duration: 280,
              useNativeDriver: true,
            }),
            Animated.timing(bubbleOpacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(openMainApp);
        } else {
          // spring back with restore
          Animated.parallel([
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 8,
              speed: 16,
            }),
            Animated.timing(bubbleOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  // pull indicator brightens as you pull
  const handleOpacity = useMemo(() =>
    slideAnim.interpolate({
      inputRange: [-200, 0],
      outputRange: [0.6, 0.22],
      extrapolate: 'clamp',
    }),
    [slideAnim]
  );

  // init db + settings + preload model
  useEffect(() => {
    const init = async () => {
      await DB.init();
      try {
        await Settings.init();
        const s = await Settings.load();
        setUserInstruction(s.instruction);
        if (s.ollamaModel) {
          setSelectedModel(s.ollamaModel);
          selectedModelRef.current = s.ollamaModel;
        }
        setAiService(s.aiService);
        setOllamaUrl(s.ollamaUrl);
        setAlwaysWhisper(s.alwaysWhisper);
        // store setting — passed to ChatBar only after capabilities resolve
        autoStartMicSetting.current = s.autoStartMic ?? true;
        AIModule.configure(s.ollamaUrl);
        AIModule.setMode(s.aiService);
        Whisper.setLanguage(s.whisperLanguage);

        // preload model into RAM so first response is fast
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

  // hardware back
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      setActiveConversation(null);
      setMessages([]);
      setTimeout(() => BackHandler.exitApp(), 100);
      return true;
    });
    return () => handler.remove();
  }, []);

  // model capabilities — mic auto-start fires once this resolves
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

  //check gemini stt model when aicore mode active
  const [aicoreSTTReady, setAicoreSTTReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (aiService !== 'aicore' || Platform.OS !== 'android') {
        setAicoreSTTReady(false);
        return;
      }
      const locale = Settings.getCached().whisperLanguage || 'en-US';
      const ready = await AICoreSTT.ensureReady(locale);
      if (!cancelled) setAicoreSTTReady(ready);
    };
    check();
    return () => { cancelled = true; };
  }, [aiService]);

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

  const handleSend = useCallback(async (text: string, images?: string[]) => {
    const model = selectedModelRef.current;
    const instruction = userInstructionRef.current;
    const reflection = selectedReflectionRef.current; // always fresh

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
    }

    if (isFirstMessage && !isError) generateTitle(conv.id, text, images);

    setGeneratingConvId(null);
    streamingMsgIdRef.current = null;
    
    AIModule.SharedGenerationState.activeConvId = null;
    AIModule.SharedGenerationState.activeMsgId = null;
    AIModule.SharedGenerationState.notify();
  }, [scheduleFlush, generateTitle]);

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

    // fallback or alwaysWhisper = true
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

      const isInstalled = await Whisper.isModelInstalled(whisperModelName);
      if (!isInstalled) {
        setModalConfig({
          title: "Whisper Not Installed",
          message: `The Whisper ${whisperModelName} model is required for on-device transcription. Please install it in the main app settings.`,
          buttons: [{ text: "OK", onPress: () => setModalVisible(false), style: "primary" }]
        });
        setModalVisible(true);
        return null;
      }

      const initialized = await Whisper.init(whisperModelName);
      if (!initialized) {
        setModalConfig({
          title: "Initialization Error",
          message: `Failed to load the Whisper ${whisperModelName} model.`,
          buttons: [{ text: "OK", onPress: () => setModalVisible(false), style: "primary" }]
        });
        setModalVisible(true);
        return null;
      }

      return await Whisper.transcribeData(wavBuffer);
    } catch (e) {
      console.error("Whisper transcription failed:", e);
      return null;
    }
  }, [alwaysWhisper, modelCapabilities]);

  const closeOverlay = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
    chatBarRef.current?.clear();
    setTimeout(() => BackHandler.exitApp(), 100);
  }, []);

  if (!ready) return null;

  // derive display state — only runs when messages change
  const lastMsg = messages.length > 0
    ? [...messages].reverse().find(m => m.role === 'assistant') ?? null
    : null;

  let isThinking = false;
  let hasThinkingText = false;
  let currentThought = 'Thinking...';
  let finalContent = '…';

  if (lastMsg) {
    const isGenerating = generatingConvId === activeConversation?.id
      && streamingMsgIdRef.current === lastMsg.id;
    const thinkMatches = [...lastMsg.content.matchAll(/<think>([\s\S]*?)(?:<\/think>|$)/g)];
    const thinkDone = thinkMatches.length > 0 ? thinkMatches[thinkMatches.length - 1][0].endsWith("</think>") : false;
    hasThinkingText = thinkMatches.length > 0;
    const thinkingText = thinkMatches.map(m => m[1].trim()).filter(t => t.length > 0).join('\n');

    const stripped = lastMsg.content === '…'
      ? '…'
      : lastMsg.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
    
    isThinking = lastMsg.content === '…' || (isGenerating && (hasThinkingText || activeTool.name) && (!thinkDone || stripped === '' || activeTool.name));

    if (hasThinkingText) currentThought = extractThinkStep(thinkingText);
    if (activeTool.name) {
      if (activeTool.name === 'web_search') {
        currentThought = `Searching the web for "${activeTool.args?.query || ''}"...`;
      } else {
        currentThought = `Running tool: ${activeTool.name}...`;
      }
    }

    finalContent = stripped.length > 0 ? stripped : '…';
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable style={styles.backdrop} onPress={closeOverlay} />

      {/* model selector — top center */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]} pointerEvents="box-none">
        <ModelDropdown
          selectedModel={selectedModel}
          selectedReflection={selectedReflection}
          showReflection={modelCapabilities.includes('thinking')}
          onModelChange={model => {
            setSelectedModel(model);
            selectedModelRef.current = model;
            Settings.set('ollamaModel', model);
            // preload newly selected model
            AIModule.preloadModel(model).catch(() => {});
          }}
          onReflectionChange={setReflection}
        />
      </View>

      {/* chat area */}
      <View style={styles.chatContainer}>
        {lastMsg && (
          <View style={styles.overlayBubbleWrapper} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.overlayBubble,
                {
                  transform: [{ translateY: slideAnim }],
                  opacity: bubbleOpacity,
                },
              ]}
              {...panResponder.panHandlers}
            >
              <Animated.View style={[styles.pullIndicator, { opacity: handleOpacity }]} />

              <ScrollView style={styles.bubbleScroll} showsVerticalScrollIndicator={false}>
                {isThinking ? (
                  <View style={styles.thinkingContainer}>
                    <Image source={thinkingGif} style={styles.thinkingIcon} resizeMode="contain" />
                    {hasThinkingText && <FlashingText text={currentThought} />}
                  </View>
                ) : (
                  renderMarkdown(finalContent, false)
                )}
              </ScrollView>
            </Animated.View>
          </View>
        )}

        <View style={[styles.bottomBarOverlay, isLargeScreen && styles.bottomBarOverlayLarge]} pointerEvents="box-none">
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
            aicoreSTT={aiService === 'aicore' && aicoreSTTReady}
            onOpenSettings={() => {}}
            enabled={true}
            autoStartMic={capabilitiesReady && autoStartMicSetting.current}
          />
        </View>
      </View>

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
    justifyContent: 'flex-end',
  },
  backdrop: {
    // style backdrop background
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  chatContainer: {
    flex: 0.7,
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
  overlayBubbleWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 110,
  },
  overlayBubble: {
    alignSelf: 'center',
    width: '90%',
    backgroundColor: '#FFF5EC',
    borderWidth: 2,
    borderColor: '#ffffff52',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: '80%',
  },
  bubbleScroll: {
    flexShrink: 1,
  },
  pullIndicator: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thinkingIcon: {
    width: 60,
  },
  flashingText: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'IBMPlexMono-Medium',
    flexShrink: 1,
  },
});
