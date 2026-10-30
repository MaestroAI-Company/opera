import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter, Image, Pressable, StyleSheet, View } from 'react-native';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';
import { Radius, Spacing, type ThemeColors } from '../../../constants/theme';
import { useAnimatedValue } from '../../hooks/useAnimatedValue';
import { useColors, useThemedStyles } from '../../hooks/useTheme';
import { pressStyle } from '../ui/pressStyle';
import { AIModule } from '../../services/ai/AIModule';
import { buildSystemPrompt } from '../../services/ai/generation/chatGeneration';
import { GenerationService } from '../../services/ai/generation/GenerationService';
import { getOllamaTuning, migrateModelSources } from '../../services/ai/providers/sources';
import { resolveQuickFlow } from '../../services/ai/quickFlow';
import { arrayBufferToBase64 } from '../../services/ai/utils/base64';
import { CloudSync } from '../../services/CloudSyncService';
import { Conversation, DB, Message } from '../../services/db/DatabaseService';
import { AppEvents } from '../../services/events';
import { McpService } from '../../services/mcp/McpService';
import { PluginRegistry } from '../../services/plugins/PluginRegistry';
import { AppSettings, Settings } from '../../services/settings/SettingsService';
import { pushDesktopOverlayConfig } from '../../services/overlay/desktopOverlay';
import { STT, WhisperSTT } from '../../services/speech/STTService';
import AttachmentSheet, { useAttachments } from './AttachmentSheet';
import ChatBar, { ChatBarHandle } from './ChatBar';
import ChatView from './ChatView';
import { ModelSelectorDrawer, ModelSelectorTrigger } from './ModelSelector';

const closeIcon = require('../../../assets/icons/cancel.png');
const chatIcon = require('../../../assets/icons/chat.png');

//reply card never covers the screen
const MAX_REPLY_HEIGHT = 360;
//room for the bar glow
const GLOW_ROOM = Spacing.xxl2;
//floating button side
const BUTTON_SIZE = 44;
//room for drawers and sheets
const EXPANDED_HEIGHT = 560;

//smoothstep from the shell tint to clear
function fadeStops(tint: string): [string, string, ...string[]] {
  const [r, g, b, a = '1'] = tint.match(/[\d.]+/g) ?? ['0', '0', '0'];
  return Array.from({ length: 6 }, (_, i) => {
    const t = i / 5;
    return `rgba(${r},${g},${b},${(Number(a) * (1 - t * t * (3 - 2 * t))).toFixed(3)})`;
  }) as [string, string, ...string[]];
}

export default function DesktopOverlay() {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const topFade = useMemo(() => fadeStops(Colors.overlayShell), [Colors.overlayShell]);
  //pinned stays on top and drags
  const [pinned, setPinned] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const conversationRef = useRef<Conversation | null>(null);

  const [selectedModel, setSelectedModel] = useState('');
  const selectedModelRef = useRef('');
  const instructionRef = useRef('');
  const [aiService, setAiService] = useState('ollama');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [alwaysWhisper, setAlwaysWhisper] = useState(false);
  const [modelCapabilities, setModelCapabilities] = useState<string[]>([]);
  const picker = useAttachments(modelCapabilities);
  //latest picker for the reset
  const pickerRef = useRef(picker);
  useEffect(() => { pickerRef.current = picker; });
  //file dialogs must not dismiss it
  const attachments = useMemo(() => {
    const pinned = (open: () => Promise<void> | void) => async () => {
      await invoke('overlay_hold', { held: true });
      try { await open(); } finally { invoke('overlay_hold', { held: false }); }
    };
    return { ...picker, pickFiles: pinned(picker.pickFiles), pickPhotos: pinned(picker.pickPhotos), openCamera: pinned(picker.openCamera) };
  }, [picker]);
  const [reflection, setReflection] = useState('none');
  const reflectionRef = useRef('none');
  useEffect(() => { reflectionRef.current = reflection; }, [reflection]);

  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const modelSelectorProgress = useAnimatedValue(0);

  const [generatingMsgId, setGeneratingMsgId] = useState<string | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  const chatBarRef = useRef<ChatBarHandle>(null);
  const keepRef = useRef(false);

  const [shellHeight, setShellHeight] = useState(0);
  const [replyHeight, setReplyHeight] = useState(0);

  //window has no background of its own
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  const applySettings = useCallback((loaded: AppSettings) => {
    //onboarding unfinished so open the app
    if (!loaded.hasSeenOnboarding) {
      invoke('overlay_show_main');
      return;
    }
    const s = migrateModelSources(loaded);
    instructionRef.current = s.instruction;
    if (s.ollamaModel) {
      setSelectedModel(s.ollamaModel);
      selectedModelRef.current = s.ollamaModel;
    }
    setAiService(s.aiService);
    setOllamaUrl(s.ollamaUrl);
    setAlwaysWhisper(s.alwaysWhisper);
    const tuning = getOllamaTuning(s.ollamaUrl);
    AIModule.configure(s.ollamaUrl, tuning.contextLength, tuning.keepAlive);
    AIModule.setMode(s.aiService);
    STT.setLanguage(s.whisperLanguage);
  }, []);

  const reloadSettings = useCallback(() => {
    Settings.load().then(applySettings).catch(() => { });
  }, [applySettings]);

  useEffect(() => {
    Promise.all([DB.init(), Settings.init()])
      .then(() => Settings.load())
      .then(s => {
        applySettings(s);
        //native side boots with defaults
        pushDesktopOverlayConfig(s);
      })
      .catch(e => console.warn('Failed to load settings in DesktopOverlay', e));
    PluginRegistry.init().then(() => PluginRegistry.loadAll()).catch(() => { });
    McpService.init().then(() => McpService.connectAll()).catch(() => { });
  }, [applySettings]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(AppEvents.settingsChanged, reloadSettings);
    return () => sub.remove();
  }, [reloadSettings]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedModel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModelCapabilities([]);
      return;
    }
    AIModule.getModelCapabilities(selectedModel).then(caps => {
      if (!cancelled) setModelCapabilities(caps);
    });
    return () => { cancelled = true; };
  }, [selectedModel, aiService, ollamaUrl]);

  //stream tokens into the reply
  useEffect(() => {
    return GenerationService.subscribe(run => {
      if (run.status !== 'streaming') return;
      setMessages(prev => prev.map(m => (m.id === run.msgId ? { ...m, content: run.content } : m)));
    });
  }, []);

  //each open starts a fresh conversation
  const reset = useCallback(() => {
    chatBarRef.current?.stopRecording();
    chatBarRef.current?.clear();
    setMessages([]);
    setConversation(null);
    conversationRef.current = null;
    setGeneratingMsgId(null);
    streamingMsgIdRef.current = null;
    setModelSelectorVisible(false);
    setReplyHeight(0);
    pickerRef.current.setFiles([]);
    pickerRef.current.closeSheet();
  }, []);

  useEffect(() => {
    const shown = listen('overlay-shown', () => {
      if (!keepRef.current) reset();
      keepRef.current = false;
      reloadSettings();
      chatBarRef.current?.focus();
    });
    const talkStart = listen('overlay-talk-start', () => chatBarRef.current?.startVoice());
    const talkEnd = listen('overlay-talk-end', () => chatBarRef.current?.sendVoice());
    const hidden = listen('overlay-hidden', () => {
      setPinned(false);
      chatBarRef.current?.stopRecording();
      //keep a reply still streaming
      keepRef.current = !!streamingMsgIdRef.current;
    });
    return () => {
      shown.then(un => un());
      hidden.then(un => un());
      talkStart.then(un => un());
      talkEnd.then(un => un());
    };
  }, [reloadSettings, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') invoke('overlay_hide');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const expanded = modelSelectorVisible || attachments.sheetVisible;
  useEffect(() => {
    if (!shellHeight) return;
    invoke('overlay_resize', { height: expanded ? Math.max(EXPANDED_HEIGHT, shellHeight) : shellHeight });
  }, [shellHeight, expanded]);

  const generateTitle = useCallback(async (convId: string, text: string, images?: string[]) => {
    try {
      let title = '';
      await AIModule.sendOn(
        resolveQuickFlow(selectedModelRef.current),
        SYSTEM_PROMPTS.SUMMARIZE,
        [{ role: 'user', content: text, images }],
        chunk => { title += chunk; },
        undefined,
        { think: false }
      );
      const cleaned = title.trim();
      if (cleaned) await DB.renameConversation(convId, cleaned);
    } catch (e) {
      console.warn('Title generation skipped:', (e as any)?.message ?? e);
    }
  }, []);

  //shared by send and retry
  const runReply = useCallback(async (conv: Conversation, prompt: string, history: Message[]) => {
    const model = selectedModelRef.current;
    const assistantMsg = await DB.addMessage(conv.id, 'assistant', '…');
    setMessages([...history, assistantMsg]);
    setReplyHeight(0);
    //a reply keeps the window until closed
    setPinned(true);
    invoke('overlay_set_pinned', { pinned: true });
    streamingMsgIdRef.current = assistantMsg.id;
    setGeneratingMsgId(assistantMsg.id);

    const run = await GenerationService.start({
      convId: conv.id,
      msgId: assistantMsg.id,
      prompt,
      model,
      systemPrompt: buildSystemPrompt(model, instructionRef.current, ''),
      history: history
        .filter(m => m.content !== '…')
        .map(m => ({ role: m.role, content: m.content, images: m.images })),
      think: reflectionRef.current === 'none' ? false : reflectionRef.current,
    });

    setMessages(prev => prev.map(m =>
      m.id === assistantMsg.id ? { ...m, content: run.content, sources: run.sources ?? m.sources } : m
    ));
    if (run.status !== 'error') CloudSync.requestAutoSync(0);
    //a newer run may own it
    if (streamingMsgIdRef.current === assistantMsg.id) {
      streamingMsgIdRef.current = null;
      setGeneratingMsgId(null);
    }
    return run;
  }, []);

  const handleSend = useCallback(async (text: string, images?: string[]) => {
    let conv = conversationRef.current;
    const isFirst = !conv;
    if (!conv) {
      const name = text.length > 30 ? text.slice(0, 30) + '…' : text;
      conv = await DB.createConversation(selectedModelRef.current || 'unknown', name);
      conversationRef.current = conv;
      setConversation(conv);
    }
    const userMsg = await DB.addMessage(conv.id, 'user', text, images);
    if (images && images.length > 0) userMsg.images = images;
    const run = await runReply(conv, text, [...messagesRef.current, userMsg]);
    if (isFirst && run.status !== 'error') generateTitle(conv.id, text, images);
  }, [runReply, generateTitle]);

  const handleStop = useCallback(() => {
    const convId = conversationRef.current?.id;
    if (convId) GenerationService.stop(convId);
  }, []);

  const handleRegenerate = useCallback(async (aiMessageId: string) => {
    const conv = conversationRef.current;
    if (!conv) return;
    GenerationService.stop(conv.id);
    const index = messagesRef.current.findIndex(m => m.id === aiMessageId);
    if (index === -1) return;
    const history = messagesRef.current.slice(0, index);
    for (const m of messagesRef.current.slice(index)) await DB.deleteMessage(m.id);
    const lastUser = [...history].reverse().find(m => m.role === 'user');
    await runReply(conv, lastUser?.content ?? '', history);
  }, [runReply]);

  const handleTranscribe = useCallback(async (wavBuffer: ArrayBuffer, localFallback?: string | null): Promise<string | null> => {
    const model = selectedModelRef.current;
    if (!alwaysWhisper && modelCapabilities.includes('audio') && model) {
      try {
        let transcription = '';
        await AIModule.sendMessage(
          model,
          SYSTEM_PROMPTS.TRANSCRIBE,
          [{ role: 'user', content: 'Transcribe this audio.', images: ['data:audio/wav;base64,' + arrayBufferToBase64(wavBuffer)] }],
          chunk => { transcription += chunk; },
          undefined,
          { think: false }
        );
        if (transcription.trim()) return transcription.trim();
      } catch (e) {
        console.warn('Remote transcription failed, falling back to local', e);
      }
    }
    if (localFallback !== undefined) return localFallback;
    const whisperModel = Settings.getCached().whisperModel || 'base';
    if (whisperModel === 'none' || !(await WhisperSTT.isModelInstalled(whisperModel))) return null;
    if (!(await WhisperSTT.init(whisperModel))) return null;
    return WhisperSTT.transcribeData(wavBuffer);
  }, [alwaysWhisper, modelCapabilities]);

  let lastReply: Message | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') { lastReply = messages[i]; break; }
  }

  return (
    <View style={styles.root}>
      <View
        style={styles.shell}
        //inputs and buttons keep their clicks
        onStartShouldSetResponder={e => pinned && !(e.target as unknown as HTMLElement).closest?.('input,textarea')}
        onResponderGrant={() => invoke('overlay_drag')}
        onLayout={e => setShellHeight(Math.ceil(e.nativeEvent.layout.height) + GLOW_ROOM * 2)}>
        {lastReply && (
          <View style={styles.floatingRow} pointerEvents="box-none">
            <Pressable onPress={() => invoke('overlay_hide')} style={pressStyle(styles.floatingButton, 'surface')}>
              <Image source={closeIcon} style={styles.floatingIcon} tintColor={Colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => invoke('overlay_open_conversation', { convId: lastReply.conversationId })}
              style={pressStyle(styles.floatingButton, 'surface')}>
              <Image source={chatIcon} style={styles.floatingIcon} tintColor={Colors.textPrimary} />
            </Pressable>
          </View>
        )}
        {lastReply && (
          <View style={[styles.reply, { height: Math.min(Math.max(replyHeight, 1), MAX_REPLY_HEIGHT) }]}>
            <ChatView
              messages={[lastReply]}
              conversation={conversation}
              contentTopPadding={BUTTON_SIZE + Spacing.lg2}
              contentBottomPadding={0}
              hideHeader={true}
              hideGradients={true}
              generatingMessageId={generatingMsgId}
              speakerEnabled={true}
              onRegenerate={handleRegenerate}
              canThink={modelCapabilities.includes('thinking') && reflection !== 'none'}
              alignBottom={true}
              onContentHeight={setReplyHeight}
            />
            <LinearGradient colors={topFade} style={styles.topFade} pointerEvents="none" />
          </View>
        )}
        <ChatBar
          ref={chatBarRef}
          onSend={handleSend}
          isGenerating={!!generatingMsgId}
          onStop={handleStop}
          onTranscribe={handleTranscribe}
          canTranscribeRemotely={!alwaysWhisper && modelCapabilities.includes('audio') && !!selectedModel}
          modelCapabilities={modelCapabilities}
          picker={attachments}
          flush
          leadingElement={
            <ModelSelectorTrigger
              selectedModel={selectedModel}
              flat
              onPress={() => setModelSelectorVisible(v => !v)}
            />
          }
        />
      </View>

      <AttachmentSheet
        visible={attachments.sheetVisible}
        onClose={attachments.closeSheet}
        onCamera={attachments.openCamera}
        onPickFiles={attachments.pickFiles}
        onPhotos={attachments.pickPhotos}
        recentPhotos={attachments.recentPhotos}
        selectedFiles={attachments.files}
        onSelectRecentPhoto={attachments.toggleRecentPhoto}
        onLongPressRecentPhoto={attachments.toggleRecentPhoto}
        isLargeScreen={false}
        bottomInset={0}
      />

      <ModelSelectorDrawer
        visible={modelSelectorVisible}
        onClose={() => setModelSelectorVisible(false)}
        progress={modelSelectorProgress}
        selectedModel={selectedModel}
        selectedReflection={reflection}
        showReflection={modelCapabilities.includes('thinking')}
        aiService={aiService}
        ollamaUrl={ollamaUrl}
        onServiceChange={(service, url) => {
          setAiService(service);
          setOllamaUrl(url);
          Settings.setMany({ aiService: service, ollamaUrl: url });
          AIModule.setMode(service);
          if (url) {
            const tuning = getOllamaTuning(url);
            AIModule.configure(url, tuning.contextLength, tuning.keepAlive);
          }
        }}
        onModelChange={model => {
          setSelectedModel(model);
          selectedModelRef.current = model;
          Settings.set('ollamaModel', model);
          AIModule.preloadModel(model).catch(() => { });
        }}
        onReflectionChange={setReflection}
        isLargeScreen={false}
        messages={messages}
        hideScrim
      />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    //text scrolls up to the frame edge
    reply: {
      marginTop: -Spacing.sm,
      marginHorizontal: -Spacing.sm,
      overflow: 'hidden',
      borderTopLeftRadius: Radius.window + Spacing.sm,
      borderTopRightRadius: Radius.window + Spacing.sm,
    },
    topFade: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: BUTTON_SIZE + Spacing.sm,
    },
    floatingRow: {
      position: 'absolute',
      top: Spacing.sm,
      left: Spacing.sm,
      right: Spacing.sm,
      zIndex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      //room for the sticker shadow
      paddingLeft: Spacing.xs,
    },
    floatingButton: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: Radius.window,
      backgroundColor: Colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      boxShadow: `-4px 4px 0px ${Colors.shadowInk}`,
    } as any,
    floatingIcon: {
      width: 18,
      height: 18,
    },
    root: {
      flex: 1,
      justifyContent: 'flex-end',
      padding: GLOW_ROOM,
      backgroundColor: 'transparent',
    },
    shell: {
      padding: Spacing.sm,
      gap: Spacing.lg,
      //concentric with the bar corners
      borderRadius: Radius.window + Spacing.sm,
      backgroundColor: Colors.overlayShell,
      //frosted glass on the desktop
      backdropFilter: 'blur(24px)',
    } as any,
  });
