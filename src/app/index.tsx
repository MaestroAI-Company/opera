import { useQuickActionCallback } from "expo-quick-actions/hooks";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  AppState,
  BackHandler,
  DeviceEventEmitter,
  Image,
  ImageBackground,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { KeyboardAvoidingView, KeyboardController } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SearchWebView from "../../components/SearchWebView";
import { SYSTEM_PROMPTS } from "../../constants/prompts";
import { Colors, Fonts, FontSizes, Radius } from "../../constants/theme";
import ChatBar from "../components/features/ChatBar";
import ChatView from "../components/features/ChatView";
import ConversationsDrawer from "../components/features/ConversationsDrawer";
import { conversationsProgress, dragDrawer, drawerWidthFor, gestureVelocity, settingsProgress, settleDrawer } from "../components/features/drawerAnimation";
import ModelDropdown from "../components/features/ModelDropdown";
import SettingsDrawer from "../components/features/SettingsDrawer";
import TopBar from "../components/features/TopBar";
import NotificationModal from "../components/ui/NotificationModal";
import { useResponsive } from "../hooks/useResponsive";
import { AIModule } from "../services/ai/AIModule";
import { buildSystemPrompt, streamAssistantReply } from "../services/ai/chatGeneration";
import { arrayBufferToBase64 } from "../services/ai/utils/base64";
import { Conversation, DB, Message, MessageMetrics } from "../services/db/DatabaseService";
import {
  getInitialDeepLink,
  subscribeToDeepLinks,
  type DeepLinkRoute,
} from "../services/deeplinks/DeepLinkService";
import { AppEvents } from "../services/events";
import { LocationService } from "../services/location/LocationService";
import { PluginRegistry } from "../services/plugins/PluginRegistry";
import { NEW_CHAT_ACTION_ID } from "../services/quickActions/QuickActionsService";
import { Settings } from "../services/settings/SettingsService";
import { STT, WhisperSTT } from "../services/speech/STTService";
import { TTS } from "../services/speech/TTSService";

const butterflyImage = require("../../assets/images/butterfly5.png");
const butterflyGrey = require("../../assets/images/butterfly2_grey.png");
const texture2 = require("../../assets/images/texture2.png");
const settingsIcon = require("../../assets/icons/settings.png");

//matches welcomeText's lineHeight, reserved upfront so the second line doesn't shift layout
const WELCOME_LINE_HEIGHT = 40;

//time-of-day greeting shown on the home screen
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

//fades in then types out text character by character, like a typewriter
function TypewriterWelcome({ text, style, reserveLines = 1 }: { text: string; style: any; reserveLines?: number }) {
  const [displayedText, setDisplayedText] = useState("");
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setDisplayedText("");
    opacity.setValue(0);
    let timer: ReturnType<typeof setInterval> | undefined;

    //wait a beat after launch before the reveal starts
    const startDelay = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      let currentIndex = 0;
      timer = setInterval(() => {
        if (currentIndex < text.length) {
          currentIndex++;
          setDisplayedText(text.slice(0, currentIndex));
        } else {
          clearInterval(timer);
        }
      }, 70);
    }, 1000);

    return () => {
      clearTimeout(startDelay);
      if (timer) clearInterval(timer);
    };
  }, [text, opacity]);

  return (
    <Animated.Text style={[style, { opacity, minHeight: WELCOME_LINE_HEIGHT * reserveLines }]}>
      {displayedText}
    </Animated.Text>
  );
}

//fades a child in after a delay, later than the welcome text reveal
function DissolveIn({ delay, style, children }: { delay: number; style?: any; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startDelay = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, delay);
    return () => clearTimeout(startDelay);
  }, [opacity, delay]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

export default function Index() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, isLargeScreen, isDesktop } = useResponsive();
  //edge drag maps to drawer progress
  const dragWidth = drawerWidthFor(width);
  //computed once per mount so it doesn't shift mid-session
  const greeting = useMemo(() => getGreeting(), []);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedReflection, setSelectedReflection] = useState("none");
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [settingsDrawerVisible, setSettingsDrawerVisible] = useState(false);
  const [settingsInitialSubPage, setSettingsInitialSubPage] = useState<"main" | "general" | "confidentiality" | "tools">("main");
  const [dbReady, setDbReady] = useState(false);
  const [dbFailed, setDbFailed] = useState(false);
  const [showDataWarning, setShowDataWarning] = useState(false);

  const drawerVisibleRef = useRef(drawerVisible);
  useEffect(() => {
    drawerVisibleRef.current = drawerVisible;
  }, [drawerVisible]);

  const settingsDrawerVisibleRef = useRef(settingsDrawerVisible);
  useEffect(() => {
    settingsDrawerVisibleRef.current = settingsDrawerVisible;
  }, [settingsDrawerVisible]);

  const [incognitoMode, setIncognitoMode] = useState(false);
  const [userName, setUserName] = useState("");
  const [userInstruction, setUserInstruction] = useState("");
  const [aiService, setAiService] = useState("ollama");
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [speakerEnabled, setSpeakerEnabled] = useState(false);
  const [modelCapabilities, setModelCapabilities] = useState<string[]>([]);
  const [alwaysWhisper, setAlwaysWhisper] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);

  //conversation state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  //ref serves streaming callbacks
  const streamingMsgIdRef = useRef<string | null>(null);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const setStreamingMessageId = useCallback((id: string | null) => {
    streamingMsgIdRef.current = id;
    setStreamingMsgId(id);
  }, []);
  const streamingContentRef = useRef<string>("");

  const [generatingConvId, setGeneratingConvId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  //refs for background processing
  const activeConversationRef = useRef<Conversation | null>(null);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    const handleBackButton = () => {
      //close drawers on android back press, after drawer-level handlers
      if (settingsDrawerVisibleRef.current) {
        setSettingsDrawerVisible(false);
        return true;
      }
      if (drawerVisibleRef.current) {
        setDrawerVisible(false);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackButton
    );

    return () => backHandler.remove();
  }, []);

  const openDrawerSafely = useCallback((openFn: () => void) => {
    //skip pointless native round trip
    if (!KeyboardController.isVisible()) {
      openFn();
      return;
    }
    //wait for keyboard retract so drawer opens at full height
    let opened = false;
    const run = () => {
      if (opened) return;
      opened = true;
      openFn();
    };
    //cap wait to one hide animation
    const fallback = setTimeout(run, 250);
    KeyboardController.dismiss().then(() => {
      clearTimeout(fallback);
      run();
    });
  }, []);

  const [pendingConvIds, setPendingConvIds] = useState<string[]>([]);
  const requestQueueRef = useRef<{ convId: string, task: () => Promise<void>, assistantMsgId: string, isIncognito: boolean }[]>([]);
  const isProcessingRef = useRef(false);
  const generatingConvIdRef = useRef<string | null>(null);

  //state read lets compiler memoize
  const panResponder = useMemo(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        if (!isHorizontal || Math.abs(gestureState.dx) <= 10) return false;

        if (settingsDrawerVisible && gestureState.dx > 0) return true;
        if (drawerVisible && gestureState.dx < 0) return true;

        const isLeftEdge = gestureState.x0 < 40;
        if (isLeftEdge && gestureState.dx > 0) return true;
        return gestureState.dx < 0;
      },
      onPanResponderGrant: () => {
        //retract before keyboard shrinks panel
        if (!drawerVisible && !settingsDrawerVisible) KeyboardController.dismiss();
      },
      onPanResponderMove: (evt, gestureState) => {
        //gesture drives panel directly
        if (drawerVisible || settingsDrawerVisible) return;
        const ratio = Math.min(1, Math.abs(gestureState.dx) / dragWidth);
        //crossing start leaves other panel out
        dragDrawer(conversationsProgress, gestureState.dx > 0 ? ratio : 0);
        dragDrawer(settingsProgress, gestureState.dx > 0 ? 0 : ratio);
      },
      onPanResponderRelease: (evt, gestureState) => {
        const velocity = gestureVelocity(gestureState.vx, dragWidth);
        //short flicks still commit
        const opensLeft = gestureState.dx > 40 || gestureState.vx > 0.5;
        const opensRight = gestureState.dx < -40 || gestureState.vx < -0.5;

        if (opensLeft) {
          if (settingsDrawerVisible) {
            setSettingsDrawerVisible(false);
          } else {
            settleDrawer(conversationsProgress, true, velocity);
            setDrawerVisible(true);
          }
        } else if (opensRight) {
          if (drawerVisible) {
            setDrawerVisible(false);
          } else {
            settleDrawer(settingsProgress, true, -velocity);
            setSettingsDrawerVisible(true);
          }
        } else if (!drawerVisible && !settingsDrawerVisible) {
          //send peeked panel back off
          settleDrawer(conversationsProgress, false, velocity);
          settleDrawer(settingsProgress, false, -velocity);
        }
      },
      onPanResponderTerminate: () => {
        if (drawerVisible || settingsDrawerVisible) return;
        settleDrawer(conversationsProgress, false);
        settleDrawer(settingsProgress, false);
      },
    })
    , [drawerVisible, settingsDrawerVisible, dragWidth]);

  //trackpad two-finger horizontal swipe like mobile gesture
  useEffect(() => {
    if (Platform.OS !== "web" && Platform.OS !== "windows" && Platform.OS !== "macos") return;

    const SWIPE_THRESHOLD = 40;
    //short rearm for next swipe
    const IDLE_DELAY = 120;
    //below it's inertia tail
    const TAIL_DELTA = 6;
    let accumulator = 0;
    let handled = false;
    let lastDelta = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const resetGesture = () => {
      accumulator = 0;
      handled = false;
      lastDelta = 0;
    };

    const commitSwipe = (total: number) => {
      handled = true;
      if (total >= SWIPE_THRESHOLD) {
        if (settingsDrawerVisibleRef.current) {
          setSettingsDrawerVisible(false);
        } else {
          openDrawerSafely(() => setDrawerVisible(true));
        }
      } else if (total <= -SWIPE_THRESHOLD) {
        if (drawerVisibleRef.current) {
          setDrawerVisible(false);
        } else {
          openDrawerSafely(() => setSettingsDrawerVisible(true));
        }
      }
    };

    const isOverHorizontalScroll = (target: EventTarget | null): boolean => {
      let node = target instanceof Element ? target : null;
      while (node && node !== document.documentElement && node !== document.body) {
        const overflowX = window.getComputedStyle(node).overflowX;
        if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const handleWheel = (e: WheelEvent) => {
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const deltaX = e.deltaX * factor;
      if (Math.abs(deltaX) <= Math.abs(e.deltaY * factor)) return;
      if (isOverHorizontalScroll(e.target)) return;
      e.preventDefault();

      //reversal unlocks after inertia tail
      if (handled) {
        const reversed = lastDelta !== 0 && Math.sign(deltaX) !== Math.sign(lastDelta);
        const pushedAgain = Math.abs(deltaX) > Math.abs(lastDelta) && Math.abs(lastDelta) < TAIL_DELTA;
        if (reversed || pushedAgain) resetGesture();
      }
      lastDelta = deltaX;

      //rearm on every event
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(resetGesture, IDLE_DELAY);
      if (handled) return;
      accumulator += deltaX;
      if (Math.abs(accumulator) >= SWIPE_THRESHOLD) {
        commitSwipe(accumulator);
        accumulator = 0;
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [openDrawerSafely]);

  const processQueue = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      while (requestQueueRef.current.length > 0) {
        const item = requestQueueRef.current.shift();
        setPendingConvIds([...requestQueueRef.current.map(i => i.convId)]);
        if (!item) continue;
        try {
          await item.task();
        } catch (e) {
          //failed task must not drop queue
          console.error("Generation task failed:", e);
        }
      }
    } finally {
      //always release the lock
      isProcessingRef.current = false;
      setGeneratingConvId(null);
      generatingConvIdRef.current = null;
      setStreamingMessageId(null);
    }
  };

  //latest messages ref via effect
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  //write final content if chat visible
  const showAssistantContent = useCallback((msgId: string, convId: string, content: string) => {
    if (activeConversationRef.current?.id !== convId) return;
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content } : m)));
  }, []);

  //one render per frame of tokens
  const rafPendingRef = useRef(false);
  const scheduleFlush = useCallback((msgId: string, convId: string) => {
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      if (activeConversationRef.current?.id !== convId) return;
      const content = streamingContentRef.current;
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content } : m)));
    });
  }, []);

  //sync with shared generation from overlay
  useEffect(() => {
    return AIModule.SharedGenerationState.subscribe(() => {
      const activeState = AIModule.SharedGenerationState;
      if (activeState.activeConvId && activeConversationRef.current?.id === activeState.activeConvId) {
        if (generatingConvIdRef.current !== activeState.activeConvId) {
          setGeneratingConvId(activeState.activeConvId);
          generatingConvIdRef.current = activeState.activeConvId;
          setStreamingMessageId(activeState.activeMsgId);
        }
        streamingContentRef.current = activeState.content;
        setMessages((prev) => {
          const msgExists = prev.some(m => m.id === activeState.activeMsgId);
          if (!msgExists) return prev;
          return prev.map((m) =>
            m.id === activeState.activeMsgId
              ? { ...m, content: activeState.content }
              : m
          );
        });
      } else if (!activeState.activeConvId && generatingConvIdRef.current === activeConversationRef.current?.id && !isProcessingRef.current) {
        setGeneratingConvId(null);
        generatingConvIdRef.current = null;
        setStreamingMessageId(null);
        if (activeConversationRef.current) {
          DB.getMessages(activeConversationRef.current.id).then(setMessages);
        }
      }
    });
  }, [setStreamingMessageId]);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await DB.getConversations();
      setConversations(convs);
    } catch (e) {
      //read failure never aborts task
      console.warn("Failed to load conversations", e);
    }
  }, []);

  //init database and settings on mount
  useEffect(() => {
    const init = async () => {
      try {
        await DB.init();
      } catch {
        //no db, show real error
        setDbFailed(true);
        return;
      }
      loadConversations();
      //warm cached location if granted
      LocationService.hasPermission().then((granted) => {
        if (granted) LocationService.refresh().catch(() => { });
      });
      //load and apply settings
      try {
        await Settings.init();
        const s = await Settings.load();
        if ((await DB.detectDataIssues()) && !s.dataWarningDismissed) {
          setShowDataWarning(true);
        }
        await PluginRegistry.init();
        await PluginRegistry.loadAll();

        if (!s.hasSeenOnboarding) {
          router.replace("/starting");
          return;
        }

        setUserName(s.name);
        setUserInstruction(s.instruction);
        if (s.ollamaModel) {
          setSelectedModel(s.ollamaModel);
        }
        setAiService(s.aiService);
        setOllamaUrl(s.ollamaUrl);
        setSpeakerEnabled(s.speaker);
        setAlwaysWhisper(s.alwaysWhisper);
        setShowTechnicalDetails(s.showTechnicalDetails);
        AIModule.configure(s.ollamaUrl);
        AIModule.setMode(s.aiService);
        STT.setLanguage(s.whisperLanguage);
      } catch (e) {
        console.warn("Failed to load settings at boot", e);
      }

      setDbReady(true);
    };
    init();
  }, [loadConversations, router]);

  //fetch model capabilities when selectedModel changes
  useEffect(() => {
    const fetchCapabilities = async () => {
      if (selectedModel) {
        const caps = await AIModule.getModelCapabilities(selectedModel);
        setModelCapabilities(caps);
      } else {
        setModelCapabilities([]);
      }
    };
    fetchCapabilities();
  }, [selectedModel, aiService, ollamaUrl]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && dbReady) {
        loadConversations();
        if (activeConversationRef.current) {
          DB.getMessages(activeConversationRef.current.id).then((msgs) => {
            // keep streaming content if generating
            if (generatingConvIdRef.current === activeConversationRef.current?.id && streamingMsgIdRef.current) {
              const patched = msgs.map(m => m.id === streamingMsgIdRef.current ? { ...m, content: streamingContentRef.current || "…" } : m);
              setMessages(patched);
            } else {
              setMessages(msgs);
            }
          });
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [dbReady, loadConversations]);

  //refresh conversation list on any db change (including cloud merges)
  useEffect(() => {
    if (!dbReady) return;
    //one reload per write burst
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(loadConversations, 300);
    };

    const conversationsSub = DeviceEventEmitter.addListener(AppEvents.conversationsChanged, scheduleReload);
    //sync ai service on change
    const settingsSub = DeviceEventEmitter.addListener(AppEvents.settingsChanged, () => {
      setAiService(Settings.getCached().aiService);
      setUserName(Settings.getCached().name);
    });

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      conversationsSub.remove();
      settingsSub.remove();
    };
  }, [dbReady, loadConversations]);

  //load messages when a conversation is selected
  const selectConversation = useCallback(async (conv: Conversation) => {
    setActiveConversation(conv);
    const msgs = await DB.getMessages(conv.id);

    if (generatingConvIdRef.current === conv.id && streamingMsgIdRef.current) {
      const patched = msgs.map(m => m.id === streamingMsgIdRef.current ? { ...m, content: streamingContentRef.current || "…" } : m);
      setMessages(patched);
    } else {
      setMessages(msgs);
    }
  }, []);

  //start new empty conversation
  const startNewConversation = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
  }, []);

  //handle deeplinks (cold + warm start, mobile + tauri)
  const pendingDeepLinkRef = useRef<DeepLinkRoute | null>(null);
  useEffect(() => {
    let cancelled = false;
    const apply = (route: DeepLinkRoute) => {
      if (route.type === "new-chat") {
        startNewConversation();
      } else if (route.type === "conversation") {
        if (!dbReady) {
          pendingDeepLinkRef.current = route;
          return;
        }
        DB.getConversations().then((convs) => {
          if (cancelled) return;
          const target = convs.find((c) => c.id === route.convId);
          if (target) selectConversation(target);
        });
      }
    };
    getInitialDeepLink().then((route) => {
      if (!cancelled && route) apply(route);
    });
    const unsubscribe = subscribeToDeepLinks(apply);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [dbReady, selectConversation, startNewConversation]);

  //apply pending conversation deeplink once the db is ready
  useEffect(() => {
    if (!dbReady) return;
    const route = pendingDeepLinkRef.current;
    if (route?.type === "conversation") {
      pendingDeepLinkRef.current = null;
      DB.getConversations().then((convs) => {
        const target = convs.find((c) => c.id === route.convId);
        if (target) selectConversation(target);
      });
    }
  }, [dbReady, selectConversation]);

  //open a new chat when the home screen shortcut is pressed
  useQuickActionCallback((action) => {
    if (action.id === NEW_CHAT_ACTION_ID) {
      startNewConversation();
    }
  });

  //toggle pin conversation
  const togglePinConversation = useCallback(async (convId: string, pinned: boolean) => {
    await DB.togglePinConversation(convId, pinned);
    setConversations((prev) =>
      prev.map(c => c.id === convId ? { ...c, pinned: pinned ? 1 : 0 } : c)
    );
    if (activeConversation?.id === convId) {
      setActiveConversation(prev => prev ? { ...prev, pinned: pinned ? 1 : 0 } : prev);
    }
  }, [activeConversation]);

  //delete conversation
  const deleteConversation = useCallback(async (convId: string) => {
    await DB.deleteConversation(convId);
    setConversations((prev) => prev.filter(c => c.id !== convId));
    if (activeConversation?.id === convId) {
      startNewConversation();
    }
  }, [activeConversation, startNewConversation]);

  //generate title from first message
  const generateTitle = useCallback(
    async (convId: string, userMessage: string, images?: string[]) => {
      try {
        let title = "";
        await AIModule.sendMessage(
          selectedModel,
          SYSTEM_PROMPTS.SUMMARIZE,
          [{ role: "user", content: userMessage, images }],
          (chunk) => { title += chunk; },
          undefined,
          { think: false }
        );
        const cleaned = title.trim();
        if (cleaned.length > 0) {
          await DB.renameConversation(convId, cleaned);
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, name: cleaned } : c))
          );
          setActiveConversation((prev) =>
            prev && prev.id === convId ? { ...prev, name: cleaned } : prev
          );
        }
      } catch (e) {
        //best-effort title keep on failure
        console.warn("Title generation skipped:", (e as any)?.message ?? e);
      }
    },
    [selectedModel]
  );

  //send a message — creates conversation on first send
  const handleSend = useCallback(
    async (text: string, images?: string[], viaVoice?: boolean) => {
      if (!dbReady && !incognitoMode) return;

      let conv = activeConversation;
      let isFirstMessage = false;
      const isIncognitoTask = conv ? conv.id.startsWith("incognito_") : incognitoMode;

      //create conversation if this is the first message
      if (!conv) {
        isFirstMessage = true;
        const name = text.length > 30 ? text.slice(0, 30) + "…" : text;
        if (isIncognitoTask) {
          conv = {
            id: "incognito_" + Date.now(),
            name,
            model: selectedModel || "unknown",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        } else {
          conv = await DB.createConversation(selectedModel || "unknown", name);
          setConversations((prev) => [conv!, ...prev]);
        }
        setActiveConversation(conv);
      }

      //save user message immediately
      let userMsg: Message;
      if (isIncognitoTask) {
        userMsg = {
          id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          conversationId: conv.id,
          role: "user",
          content: text,
          createdAt: Date.now(),
        };
      } else {
        userMsg = await DB.addMessage(conv.id, "user", text, images);
      }

      //attach images to incognito message as well if needed
      if (images && images.length > 0) {
        userMsg.images = images;
      }

      if (isFirstMessage || activeConversationRef.current?.id === conv.id) {
        setMessages((prev) => [...prev, userMsg]);
      }

      //build history for this task
      const taskHistory = messagesRef.current
        .filter((m) => m.content !== "…")
        .map((m) => ({ role: m.role, content: m.content, images: m.images }));
      taskHistory.push({ role: "user", content: text, images });

      const taskSelectedModel = selectedModel;
      const taskSystemPrompt = buildSystemPrompt(userInstruction);
      const taskReflection = selectedReflection;
      const taskConv = conv;

      //create empty assistant message for streaming immediately
      let assistantMsg: Message;
      if (isIncognitoTask) {
        assistantMsg = {
          id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          conversationId: conv.id,
          role: "assistant",
          content: "…",
          createdAt: Date.now(),
        };
      } else {
        assistantMsg = await DB.addMessage(conv.id, "assistant", "…");
      }

      if (isFirstMessage || activeConversationRef.current?.id === conv.id) {
        setMessages((prev) => [...prev, assistantMsg]);
      }

      const task = async () => {
        setGeneratingConvId(taskConv.id);
        generatingConvIdRef.current = taskConv.id;

        setStreamingMessageId(assistantMsg.id);
        streamingContentRef.current = "";

        abortControllerRef.current = new AbortController();

        let isError = false;
        let messageMetrics: MessageMetrics | undefined;

        //send to AI and stream chunks
        if (!taskSelectedModel) {
          isError = true;
          streamingContentRef.current = "Please select a model from the top menu before sending a message.";
          showAssistantContent(assistantMsg.id, taskConv.id, streamingContentRef.current);
          abortControllerRef.current = null;
        } else {
          try {
            const outcome = await streamAssistantReply({
              model: taskSelectedModel,
              systemPrompt: taskSystemPrompt,
              history: taskHistory,
              think: taskReflection === "none" ? false : taskReflection,
              signal: abortControllerRef.current.signal,
              onContent: (content) => {
                streamingContentRef.current = content;
                scheduleFlush(assistantMsg.id, taskConv.id);
              },
              onMetrics: (m) => {
                messageMetrics = m;
                if (activeConversationRef.current?.id === taskConv.id) {
                  setMessages((prev) => prev.map((msg) => msg.id === assistantMsg.id ? { ...msg, metrics: m } : msg));
                }
              },
            });

            if (outcome.status === "error") {
              isError = true;
              streamingContentRef.current = "Error generating response. Please check your model or server connection.";
            } else {
              streamingContentRef.current = outcome.content;
            }
            showAssistantContent(assistantMsg.id, taskConv.id, streamingContentRef.current);
          } finally {
            abortControllerRef.current = null;
          }
        }

        if (!isIncognitoTask) {
          if (isError) {
            if (isFirstMessage) {
              await DB.deleteConversation(taskConv.id);
            } else {
              await DB.deleteMessage(userMsg.id);
              await DB.deleteMessage(assistantMsg.id);
            }
          } else {
            //save final assistant message content to db
            await DB.updateMessageContent(assistantMsg.id, streamingContentRef.current);
            if (messageMetrics) {
              await DB.updateMessageMetrics(assistantMsg.id, messageMetrics);
            }
            //refresh conversation list (updatedAt changed)
            await loadConversations();
          }
        }

        //generate AI title for new conversations
        if (isFirstMessage && !isIncognitoTask && !isError) {
          generateTitle(taskConv.id, text, images);
        }

        //auto-read the reply aloud when it was requested via voice
        if (viaVoice && !isError && Settings.getCached().autoSpeak) {
          TTS.speak(streamingContentRef.current, { language: Settings.getCached().language, id: assistantMsg.id });
        }
      };

      requestQueueRef.current.push({
        convId: conv.id,
        task,
        assistantMsgId: assistantMsg.id,
        isIncognito: isIncognitoTask
      });
      setPendingConvIds([...requestQueueRef.current.map(i => i.convId)]);
      processQueue().catch((e) => console.error("Queue processing failed:", e));
    },
    //processQueue is recreated every render, keeping it out avoids churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dbReady, incognitoMode, activeConversation, selectedModel, selectedReflection, generateTitle, userInstruction, aiService, ollamaUrl, scheduleFlush]
  );

  //transcribe audio: use remote model if it supports audio and user hasnt forced whisper
  const handleTranscribe = useCallback(async (wavBuffer: ArrayBuffer): Promise<string | null> => {
    const useRemote = !alwaysWhisper && modelCapabilities.includes("audio") && selectedModel;

    const transcribeWithWhisper = async () => {
      if (!WhisperSTT.isAvailable()) {
        const modelName = Settings.getCached().whisperModel || "base";
        if (modelName !== "none" && await WhisperSTT.isModelInstalled(modelName)) {
          await WhisperSTT.init(modelName);
        }
      }
      if (WhisperSTT.isAvailable()) {
        return WhisperSTT.transcribeData(wavBuffer);
      }
      console.error('Whisper fallback failed because Whisper is not initialized or installed.');
      return null;
    };

    if (!useRemote) {
      //fallback to whisper on-device
      return transcribeWithWhisper();
    }
    try {
      //encode wav as data uri 
      const base64Audio = 'data:audio/wav;base64,' + arrayBufferToBase64(wavBuffer);

      //send to remote model with TRANSCRIBE prompt
      let transcription = '';
      await AIModule.sendMessage(
        selectedModel,
        SYSTEM_PROMPTS.TRANSCRIBE,
        [{ role: 'user', content: 'Transcribe this audio.', images: [base64Audio] }],
        (chunk) => { transcription += chunk; },
        undefined,
        { think: false }
      );
      return transcription.trim() || null;
    } catch (e) {
      console.error('Remote transcription failed, falling back to Whisper:', e);
      return transcribeWithWhisper();
    }
  }, [alwaysWhisper, modelCapabilities, selectedModel]);

  const handleRegenerate = useCallback(async (aiMessageId: string) => {
    if (!activeConversation) return;

    if (generatingConvId === activeConversation.id) {
      abortControllerRef.current?.abort();
    }

    const msgIndex = messagesRef.current.findIndex(m => m.id === aiMessageId);
    if (msgIndex === -1) return;

    const historyUpToHere = messagesRef.current.slice(0, msgIndex);
    const taskHistory = historyUpToHere
      .filter((m) => m.content !== "…")
      .map((m) => ({ role: m.role, content: m.content, images: m.images }));

    const messagesToDelete = messagesRef.current.slice(msgIndex);

    if (!incognitoMode) {
      for (const m of messagesToDelete) {
        await DB.deleteMessage(m.id);
      }
    }
    setMessages([...historyUpToHere]);

    const taskSelectedModel = selectedModel;
    const taskSystemPrompt = buildSystemPrompt(userInstruction);
    const taskReflection = selectedReflection;
    const taskConv = activeConversation;
    const isIncognitoTask = taskConv.id.startsWith("incognito_");

    let assistantMsg: Message;
    if (isIncognitoTask) {
      assistantMsg = {
        id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        conversationId: taskConv.id,
        role: "assistant",
        content: "…",
        createdAt: Date.now(),
      };
    } else {
      assistantMsg = await DB.addMessage(taskConv.id, "assistant", "…");
    }

    setMessages((prev) => [...prev.filter(m => m.id !== aiMessageId), assistantMsg]);

    const task = async () => {
      setGeneratingConvId(taskConv.id);
      generatingConvIdRef.current = taskConv.id;
      setStreamingMessageId(assistantMsg.id);
      streamingContentRef.current = "";
      abortControllerRef.current = new AbortController();
      let isError = false;
      let messageMetrics: MessageMetrics | undefined;

      if (!taskSelectedModel) {
        isError = true;
        streamingContentRef.current = "Please select a model from the top menu before sending a message.";
        showAssistantContent(assistantMsg.id, taskConv.id, streamingContentRef.current);
        abortControllerRef.current = null;
      } else {
        try {
          const outcome = await streamAssistantReply({
            model: taskSelectedModel,
            systemPrompt: taskSystemPrompt,
            history: taskHistory,
            think: taskReflection === "none" ? false : taskReflection,
            signal: abortControllerRef.current.signal,
            onContent: (content) => {
              streamingContentRef.current = content;
              scheduleFlush(assistantMsg.id, taskConv.id);
            },
            onMetrics: (m) => {
              messageMetrics = m;
              if (activeConversationRef.current?.id === taskConv.id) {
                setMessages((prev) => prev.map((msg) => msg.id === assistantMsg.id ? { ...msg, metrics: m } : msg));
              }
            },
          });

          if (outcome.status === "error") {
            isError = true;
            streamingContentRef.current = "Error generating response. Please check your model or server connection.";
          } else {
            streamingContentRef.current = outcome.content;
          }
          showAssistantContent(assistantMsg.id, taskConv.id, streamingContentRef.current);
        } finally {
          abortControllerRef.current = null;
        }
      }

      if (!isIncognitoTask) {
        if (isError) {
          await DB.deleteMessage(assistantMsg.id);
        } else {
          await DB.updateMessageContent(assistantMsg.id, streamingContentRef.current);
          if (messageMetrics) {
            await DB.updateMessageMetrics(assistantMsg.id, messageMetrics);
          }
          await loadConversations();
        }
      }
    };

    requestQueueRef.current.push({
      convId: taskConv.id,
      task,
      assistantMsgId: assistantMsg.id,
      isIncognito: isIncognitoTask
    });
    setPendingConvIds([...requestQueueRef.current.map(i => i.convId)]);
    processQueue().catch((e) => console.error("Queue processing failed:", e));

    //processQueue is recreated every render, keeping it out avoids churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation, generatingConvId, incognitoMode, selectedModel, ollamaUrl, aiService, userInstruction, selectedReflection, scheduleFlush]);

  const handleStop = useCallback(async () => {
    const currentConvId = activeConversation?.id;
    if (!currentConvId) return;

    if (generatingConvId === currentConvId) {
      abortControllerRef.current?.abort();
    } else if (pendingConvIds.includes(currentConvId)) {
      //cancel all pending tasks for this conversation
      const tasksToCancel = requestQueueRef.current.filter(i => i.convId === currentConvId);
      requestQueueRef.current = requestQueueRef.current.filter(i => i.convId !== currentConvId);
      setPendingConvIds([...requestQueueRef.current.map(i => i.convId)]);

      for (const item of tasksToCancel) {
        if (!item.isIncognito) {
          await DB.updateMessageContent(item.assistantMsgId, "\n\n_The user interrupted the response_");
        }
      }
      setMessages(prev => prev.map(m => {
        if (tasksToCancel.some(t => t.assistantMsgId === m.id)) {
          return { ...m, content: "\n\n_The user interrupted the response_" };
        }
        return m;
      }));
    }
  }, [activeConversation, generatingConvId, pendingConvIds]);

  if (dbFailed) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.welcomeText}>Something went wrong</Text>
        <Text style={styles.incognitoDescription}>
          Opera could not open its local database. Please restart the app. If the problem persists, reinstall it.
        </Text>
      </View>
    );
  }

  if (!dbReady) {
    return <View style={styles.container} />;
  }

  const conversationsDrawer = (
    <ConversationsDrawer
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      visible={drawerVisible}
      onClose={() => setDrawerVisible(false)}
      conversations={conversations}
      selectedConversationId={activeConversation?.id ?? null}
      onSelectConversation={selectConversation}
      onNewConversation={startNewConversation}
      onDeleteConversation={deleteConversation}
      onTogglePinConversation={togglePinConversation}
    />
  );

  const settingsDrawer = (
    <SettingsDrawer
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      visible={settingsDrawerVisible}
      initialSubPage={settingsInitialSubPage}
      onClose={() => {
        setSettingsDrawerVisible(false);
        setSettingsInitialSubPage("main");
        const cached = Settings.getCached();
        if (cached.ollamaModel && cached.ollamaModel !== selectedModel) {
          setSelectedModel(cached.ollamaModel);
        }
        setAiService(cached.aiService);
        setOllamaUrl(cached.ollamaUrl);
        setSpeakerEnabled(cached.speaker);
        setAlwaysWhisper(cached.alwaysWhisper);
        setShowTechnicalDetails(cached.showTechnicalDetails);
      }}
      onDataChanged={async () => {
        await loadConversations();
        startNewConversation();
      }}
    />
  );

  return (
    <View style={styles.container}>
      <ImageBackground
        source={texture2}
        style={StyleSheet.absoluteFill}
        imageStyle={styles.backgroundTexture} resizeMode="cover"
      />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: "transparent" }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        enabled={!drawerVisible && !settingsDrawerVisible}
        {...(isLargeScreen ? {} : panResponder.panHandlers)}
      >

        <View style={{ flex: 1, flexDirection: isLargeScreen ? "row" : "column" }} pointerEvents="box-none">
          {/* only the desktop panels take part in layout, the overlay ones live outside the
              keyboard avoiding view or they get clipped to its shrunken height */}
          {isDesktop ? conversationsDrawer : null}

          <View style={{ flex: 1, backgroundColor: "transparent" }} pointerEvents="box-none">
            {!activeConversation && (
              <View style={styles.centerContent}>
                <Image
                  source={incognitoMode ? butterflyGrey : butterflyImage}
                  style={styles.butterfly}
                  resizeMode="contain"
                />
                <TypewriterWelcome
                  text={userName ? `${greeting}\n${userName}` : greeting}
                  style={styles.welcomeText}
                  reserveLines={userName ? 2 : 1}
                />
                <DissolveIn delay={2800}>
                  <Pressable
                    onPress={() => setIncognitoMode((prev) => !prev)}
                    style={({ pressed, hovered }) => [
                      styles.incognitoBox,
                      incognitoMode && styles.incognitoBoxActive,
                      (pressed || hovered) && (incognitoMode ? { backgroundColor: Colors.incognitoPressed } : { backgroundColor: Colors.surfacePressed })
                    ]}
                  >
                    <Text
                      style={[
                        styles.incognitoButtonText,
                        incognitoMode && styles.incognitoButtonTextActive,
                      ]}
                    >
                      {incognitoMode
                        ? "Disable incognito mode"
                        : "Enable incognito mode"}
                    </Text>
                  </Pressable>
                </DissolveIn>
                <Text
                  style={[
                    styles.incognitoDescription,
                    { opacity: incognitoMode ? 1 : 0 },
                  ]}
                >
                  Welcome to incognito mode. You can ask quick questions without leaving a trace. Once you close the window, your conversation disappears forever.
                </Text>
              </View>
            )}

            {activeConversation && (
              <ChatView
                messages={messages}
                conversation={activeConversation}
                contentTopPadding={insets.top + 72}
                contentBottomPadding={88 + insets.bottom}
                incognito={activeConversation.id.startsWith("incognito_")}
                onRegenerate={handleRegenerate}
                speakerEnabled={speakerEnabled}
                showMetrics={showTechnicalDetails}
                generatingMessageId={generatingConvId === activeConversation.id ? streamingMsgId : null}
                onOpenConfidentiality={() => {
                  openDrawerSafely(() => {
                    setSettingsInitialSubPage("confidentiality");
                    setSettingsDrawerVisible(true);
                  });
                }}
                canThink={modelCapabilities.includes("thinking") && selectedReflection !== "none"}
              />
            )}

            <View style={[styles.topBarOverlay, {
              paddingTop: insets.top + (
                (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window)
                  ? (navigator.userAgent.includes("Linux") && !navigator.userAgent.includes("Android") ? 0 : 32)
                  : 0
              ),
              zIndex: attachmentSheetVisible ? 200 : undefined,
            }]} pointerEvents="box-none">
              <TopBar
                onMenuPress={() => {
                  if (!isDesktop && settingsDrawerVisible) return;
                  openDrawerSafely(() => setDrawerVisible(prev => !prev));
                }}
                onNewPress={startNewConversation}
                isLargeScreen={isLargeScreen}
                isDesktop={isDesktop}
                centerElement={
                  (aiService === "ollama" || aiService === "aicore" || aiService === "local") ? (
                    <ModelDropdown
                      selectedModel={selectedModel}
                      selectedReflection={selectedReflection}
                      showReflection={modelCapabilities.includes("thinking")}
                      aiService={aiService}
                      onModelChange={(model) => {
                        setSelectedModel(model);
                        Settings.set("ollamaModel", model);
                      }}
                      onReflectionChange={setSelectedReflection}
                    />
                  ) : null
                }
                rightElement={
                  <View style={styles.settingsShadowLayer}>
                    <View style={styles.settingsShadowBlock} />
                    <Pressable
                      style={({ pressed, hovered }) => {
                        const showText = isDesktop;
                        return [
                          styles.settingsButton,
                          (pressed || hovered) && { backgroundColor: Colors.surfacePressed },
                          !showText && { paddingHorizontal: 0, width: 44 }
                        ];
                      }}
                      onPress={() => {
                        if (!isDesktop && drawerVisible) return;
                        openDrawerSafely(() => {
                          if (settingsDrawerVisible) {
                            const cached = Settings.getCached();
                            if (cached.ollamaModel && cached.ollamaModel !== selectedModel) {
                              setSelectedModel(cached.ollamaModel);
                            }
                            setAiService(cached.aiService);
                            setOllamaUrl(cached.ollamaUrl);
                            setSpeakerEnabled(cached.speaker);
                            setAlwaysWhisper(cached.alwaysWhisper);
                            setShowTechnicalDetails(cached.showTechnicalDetails);
                          }
                          setSettingsDrawerVisible(!settingsDrawerVisible);
                        });
                      }}
                    >
                      <Image
                        source={settingsIcon}
                        style={[styles.settingsIcon, !isDesktop && { marginRight: 0 }]}
                      />
                      {isDesktop && (
                        <Text style={styles.settingsButtonText}>Settings</Text>
                      )}
                    </Pressable>
                  </View>
                }
              />
            </View>

            {/* bottom bar overlay */}
            <View style={[styles.bottomBarOverlay]} pointerEvents="box-none">
              <ChatBar
                onSend={handleSend}
                incognito={activeConversation ? activeConversation.id.startsWith("incognito_") : incognitoMode}
                isGenerating={activeConversation ? (generatingConvId === activeConversation.id || pendingConvIds.includes(activeConversation.id)) : false}
                onStop={handleStop}
                onTranscribe={handleTranscribe}
                canTranscribeRemotely={!alwaysWhisper && modelCapabilities.includes("audio") && !!selectedModel}
                supportsFiles={modelCapabilities.includes("vision") || modelCapabilities.includes("audio")}
                onOpenSettings={() => {
                  openDrawerSafely(() => {
                    setSettingsInitialSubPage("main");
                    setSettingsDrawerVisible(true);
                  });
                }}
                onAttachmentSheetVisibilityChange={setAttachmentSheetVisible}
                enabled={!settingsDrawerVisible && (isLargeScreen || !drawerVisible)}
              />
            </View>
          </View>

          {isDesktop ? settingsDrawer : null}
        </View>
      </KeyboardAvoidingView>

      {isDesktop ? null : conversationsDrawer}
      {isDesktop ? null : settingsDrawer}

      <SearchWebView />

      <NotificationModal
        visible={showDataWarning}
        title="Possible data inconsistency"
        message="After this update, some saved data may be inconsistent. If you encounter any problems, go to Settings → Confidentiality to export your data or delete all conversations."
        onClose={() => setShowDataWarning(false)}
        buttons={[
          {
            text: "Go to Settings",
            style: "primary",
            onPress: () => {
              setShowDataWarning(false);
              openDrawerSafely(() => {
                setSettingsInitialSubPage("confidentiality");
                setSettingsDrawerVisible(true);
              });
            },
          },
          {
            text: "Later", style: "secondary", onPress: () => {
              Settings.set("dataWarningDismissed", true);
              setShowDataWarning(false);
            }
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backgroundTexture: { opacity: 0.02 },
  topBarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  bottomBarOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  butterfly: {
    width: 250,
    height: 250,
    marginBottom: 16,
  },
  welcomeText: {
    fontSize: FontSizes.displayXl,
    lineHeight: WELCOME_LINE_HEIGHT,
    color: Colors.textPrimary,
    letterSpacing: 1,
    fontFamily: Fonts.display,
    marginVertical: 20,
    textAlign: "center",
  },
  settingsShadowLayer: {
    position: "relative",
    marginLeft: 6,
  },
  settingsShadowBlock: {
    position: "absolute",
    top: 4,
    left: -4,
    right: 4,
    height: 44,
    backgroundColor: Colors.shadowInk,
    borderRadius: Radius.xxl,
  },
  settingsButton: {
    height: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    position: "relative",
    zIndex: 1,
  },
  settingsIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
  },
  settingsButtonText: {
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
  },
  incognitoBox: {
    position: "relative",
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
    zIndex: 1,
    marginTop: 20,
  },
  incognitoBoxActive: {
    backgroundColor: Colors.incognito,
    borderColor: Colors.incognito,
  },
  incognitoButtonText: {
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    textAlign: "center",
  },
  incognitoButtonTextActive: {
    color: Colors.surface,
  },
  incognitoDescription: {
    marginTop: 14,
    fontSize: FontSizes.label,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 300,
    alignSelf: "center",
  },
});
