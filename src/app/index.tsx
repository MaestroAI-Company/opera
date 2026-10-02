import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useQuickActionCallback } from "expo-quick-actions/hooks";
import { useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  AppState,
  BackHandler,
  DeviceEventEmitter,
  Easing,
  Image,
  ImageBackground,
  PanResponder,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HeadlessWebView from "../../components/HeadlessWebView";
import { SYSTEM_PROMPTS } from "../../constants/prompts";
import { Fonts, FontSizes, Radius, ThemeColors } from "../../constants/theme";
import BugReportSheet from "../components/features/BugReportSheet";
import ButterflyCluster from "../components/features/ButterflyCluster";
import ChatBar from "../components/features/ChatBar";
import ChatView from "../components/features/ChatView";
import CodePreviewSheet, {
  PreviewCode,
} from "../components/features/CodePreviewSheet";
import ConversationsDrawer from "../components/features/ConversationsDrawer";
import {
  conversationsProgress,
  dragDrawer,
  drawerWidthFor,
  gestureVelocity,
  releaseOpens,
  settingsProgress,
  settleDrawer,
} from "../components/features/drawerAnimation";
import { sheetTravel } from "../components/features/DrawerSheet";
import ImagePreviewSheet, {
  PreviewImage,
} from "../components/features/ImagePreviewSheet";
import MessageDetailsSheet, {
  PreviewDetails,
} from "../components/features/MessageDetailsSheet";
import {
  ModelSelectorDrawer,
  ModelSelectorTrigger,
} from "../components/features/ModelSelector";
import SettingsDrawer, { SubPage } from "../components/features/SettingsDrawer";
import TopBar from "../components/features/TopBar";
import ActionButton from "../components/ui/ActionButton";
import Group from "../components/ui/Group";
import NotificationModal from "../components/ui/NotificationModal";
import { pressStyle } from "../components/ui/pressStyle";
import { isWidgetTouchActive } from "../components/widgets/WidgetTouchArea";
import { useAnimatedValue } from "../hooks/useAnimatedValue";
import { useBugReportTrigger } from "../hooks/useBugReportTrigger";
import { useKeyboardLift } from "../hooks/useKeyboardLift";
import { useResponsive } from "../hooks/useResponsive";
import { useColors, useThemedStyles } from "../hooks/useTheme";
import { t, useT, type TranslationFn } from "../i18n";
import { AIModule } from "../services/ai/AIModule";
import { buildSystemPrompt } from "../services/ai/generation/chatGeneration";
import { GenerationService } from "../services/ai/generation/GenerationService";
import {
  generateSuggestions,
  Suggestion,
} from "../services/ai/generation/suggestions";
import { hydrateLiteRTCatalog } from "../services/ai/providers/huggingFaceCatalog";
import {
  getOllamaTuning,
  migrateModelSources,
} from "../services/ai/providers/sources";
import { resolveQuickFlow } from "../services/ai/quickFlow";
import { arrayBufferToBase64 } from "../services/ai/utils/base64";
import { CloudSync } from "../services/CloudSyncService";
import { Conversation, DB, Message } from "../services/db/DatabaseService";
import {
  getInitialDeepLink,
  subscribeToDeepLinks,
  type DeepLinkRoute,
} from "../services/deeplinks/DeepLinkService";
import { splitDocumentBlocks } from "../services/documents/DocumentService";
import { AppEvents } from "../services/events";
import { LocationService } from "../services/location/LocationService";
import {
  takePendingCrash,
  type Crash,
} from "../services/logging/CrashReporter";
import { captureScreen } from "../services/logging/ReportScreenshot";
import { McpService } from "../services/mcp/McpService";
import {
  subscribeToNotificationPress,
  takePendingNotificationConvId,
} from "../services/notifications/NotificationService";
import { PluginRegistry } from "../services/plugins/PluginRegistry";
import { NEW_CHAT_ACTION_ID } from "../services/quickActions/QuickActionsService";
import { Settings } from "../services/settings/SettingsService";
import {
  clearShareFromUrl,
  fetchSharedConversation,
  resolvePasteHost,
  shareConversation,
  tryOpenSharedInApp,
  usesDefaultPasteHost,
} from "../services/share/ShareService";
import { speakReplyLive } from "../services/speech/liveReply";
import { STT, WhisperSTT } from "../services/speech/STTService";

const texture2 = require("../../assets/images/texture2.png");
const settingsIcon = require("../../assets/icons/settings.png");
const addIcon = require("../../assets/icons/add.png");

function shareConsentMessage(): string {
  const host = resolvePasteHost()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const retention = usesDefaultPasteHost()
    ? t("share.consent.retentionDefault")
    : t("share.consent.retentionCustom");
  return t("share.consent.body", { host, retention });
}

//unified modal for both directions
type ShareNotice =
  | { kind: "confirm"; conv: Conversation }
  | { kind: "creating" }
  | { kind: "link"; link: string }
  | { kind: "opening" }
  | { kind: "error"; message: string };

//matches welcomeText's lineHeight, reserved upfront so the second line doesn't shift layout
const WELCOME_LINE_HEIGHT = 40;

//time-of-day greeting shown on the home screen
function getGreeting(t: TranslationFn): string {
  const hour = new Date().getHours();
  if (hour < 12) return t("home.greeting.morning");
  if (hour < 18) return t("home.greeting.afternoon");
  return t("home.greeting.evening");
}

//fades in then types out text character by character, like a typewriter
function TypewriterWelcome({
  text,
  style,
  reserveLines = 1,
}: {
  text: string;
  style: any;
  reserveLines?: number;
}) {
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
    <Animated.Text
      style={[
        style,
        { opacity, minHeight: WELCOME_LINE_HEIGHT * reserveLines },
      ]}
    >
      {displayedText}
    </Animated.Text>
  );
}

//fades a child in after a delay, later than the welcome text reveal
function DissolveIn({
  delay,
  style,
  children,
}: {
  delay: number;
  style?: any;
  children: ReactNode;
}) {
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

//both labels have a different length, so the pill eases between their widths instead of jumping
function IncognitoToggle({
  incognito,
  onPress,
}: {
  incognito: boolean;
  onPress: () => void;
}) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const [widths, setWidths] = useState({ on: 0, off: 0 });
  const [label, setLabel] = useState(incognito);
  const width = useAnimatedValue(0);
  const labelOpacity = useAnimatedValue(1);
  const sizedFor = useRef<boolean | null>(null);

  const target = incognito ? widths.on : widths.off;
  const measured = widths.on > 0 && widths.off > 0;

  useEffect(() => {
    if (!target) return;
    //only a mode change is worth easing, a fresh measure just sets the size
    const modeChanged =
      sizedFor.current !== null && sizedFor.current !== incognito;
    sizedFor.current = incognito;
    if (!modeChanged) {
      width.setValue(target);
      return;
    }
    Animated.timing(width, {
      toValue: target,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [target, incognito, width]);

  //swaps the label while it is faded out, so the text is never clipped mid resize
  useEffect(() => {
    if (label === incognito) return;
    Animated.timing(labelOpacity, {
      toValue: 0,
      duration: 110,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setLabel(incognito);
      Animated.timing(labelOpacity, {
        toValue: 1,
        duration: 190,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }, [incognito, label, labelOpacity]);

  return (
    <>
      <View style={styles.incognitoMeasure}>
        <View
          style={styles.incognitoBox}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setWidths((prev) => (prev.off === w ? prev : { ...prev, off: w }));
          }}
        >
          <Text style={styles.incognitoButtonText}>
            {t("home.incognito.enable")}
          </Text>
        </View>
        <View
          style={styles.incognitoBox}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setWidths((prev) => (prev.on === w ? prev : { ...prev, on: w }));
          }}
        >
          <Text style={styles.incognitoButtonText}>
            {t("home.incognito.disable")}
          </Text>
        </View>
      </View>
      <Animated.View style={measured ? { width } : null}>
        <Pressable
          onPress={onPress}
          style={pressStyle(
            [styles.incognitoBox, incognito && styles.incognitoBoxActive],
            incognito
              ? { backgroundColor: Colors.incognitoPressed }
              : "surface",
          )}
        >
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.incognitoButtonText,
              label && styles.incognitoButtonTextActive,
              { opacity: labelOpacity },
            ]}
          >
            {label ? t("home.incognito.disable") : t("home.incognito.enable")}
          </Animated.Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

export default function Index() {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, isLargeScreen, isDesktop } = useResponsive();
  //edge drag maps to drawer progress
  const dragWidth = drawerWidthFor(width);
  //computed once per mount so it doesn't shift mid-session
  const greeting = useMemo(() => getGreeting(t), [t]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedReflection, setSelectedReflection] = useState("none");
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [settingsDrawerVisible, setSettingsDrawerVisible] = useState(false);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  //shared with the panResponder below so the swipe-up gesture can drag it live
  const modelSelectorProgress = useAnimatedValue(0);
  const [settingsInitialSubPage, setSettingsInitialSubPage] =
    useState<SubPage>("main");
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

  //desktop: opening discussions or settings closes the model dropdown behind it
  useEffect(() => {
    if (isDesktop && (drawerVisible || settingsDrawerVisible)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- closes a sibling panel on desktop
      setModelSelectorVisible(false);
    }
  }, [drawerVisible, settingsDrawerVisible, isDesktop]);

  const [incognitoMode, setIncognitoMode] = useState(false);
  //fades the incognito blurb in and out instead of snapping it
  const incognitoProgress = useAnimatedValue(0);
  useEffect(() => {
    Animated.timing(incognitoProgress, {
      toValue: incognitoMode ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [incognitoMode, incognitoProgress]);
  const [userName, setUserName] = useState("");
  const [userInstruction, setUserInstruction] = useState("");
  const [aiService, setAiService] = useState("ollama");
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [speakerEnabled, setSpeakerEnabled] = useState(false);
  const [modelCapabilities, setModelCapabilities] = useState<string[]>([]);
  //bumped so edited capabilities reload
  const [capsRevision, setCapsRevision] = useState(0);
  const [alwaysWhisper, setAlwaysWhisper] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);

  //conversation state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  //home butterfly flies to the chat header
  const homeButterflyRef = useRef<View>(null);
  const [butterflyFrom, setButterflyFrom] = useState<DOMRect | null>(null);
  //per conversation, tied to their reply
  const [suggestionsByConv, setSuggestionsByConv] = useState<
    Record<string, { msgId: string; items: Suggestion[] }>
  >({});
  //held in memory until reader saves it
  const [sharedPreviewId, setSharedPreviewId] = useState<string | null>(null);
  const sharedPreviewIdRef = useRef<string | null>(null);
  useEffect(() => {
    sharedPreviewIdRef.current = sharedPreviewId;
  }, [sharedPreviewId]);
  const [shareNotice, setShareNotice] = useState<ShareNotice | null>(null);

  const setSuggestions = useCallback(
    (convId: string, value: { msgId: string; items: Suggestion[] }) => {
      setSuggestionsByConv((prev) => ({ ...prev, [convId]: value }));
    },
    [],
  );

  //only match the newest reply
  const activeSuggestions = useMemo(() => {
    const suggestions = activeConversation
      ? suggestionsByConv[activeConversation.id]
      : undefined;
    if (!suggestions) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        return messages[i].id === suggestions.msgId
          ? suggestions.items
          : undefined;
      }
    }
    return undefined;
  }, [messages, suggestionsByConv, activeConversation]);

  //ref serves streaming callbacks
  const streamingMsgIdRef = useRef<string | null>(null);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const setStreamingMessageId = useCallback((id: string | null) => {
    streamingMsgIdRef.current = id;
    setStreamingMsgId(id);
  }, []);
  const streamingContentRef = useRef<string>("");

  const [generatingConvId, setGeneratingConvId] = useState<string | null>(null);

  //refs for background processing
  const activeConversationRef = useRef<Conversation | null>(null);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  //every close path must pick up what changed in settings
  const closeSettings = useCallback(() => {
    setSettingsDrawerVisible(false);
    setSettingsInitialSubPage("main");
    const cached = Settings.getCached();
    if (cached.ollamaModel) setSelectedModel(cached.ollamaModel);
    setAiService(cached.aiService);
    setOllamaUrl(cached.ollamaUrl);
    setSpeakerEnabled(cached.speaker);
    setAlwaysWhisper(cached.alwaysWhisper);
    setShowTechnicalDetails(cached.showTechnicalDetails);
  }, []);

  useEffect(() => {
    const handleBackButton = () => {
      //close drawers on android back press, after drawer-level handlers
      if (settingsDrawerVisibleRef.current) {
        closeSettings();
        return true;
      }
      if (drawerVisibleRef.current) {
        setDrawerVisible(false);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackButton,
    );

    return () => backHandler.remove();
  }, [closeSettings]);

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

  //desktop panel hangs under this button
  const modelTriggerRef = useRef<View | null>(null);

  //reopen crash report from last run
  const [pendingCrash, setPendingCrash] = useState<Crash | null>(
    takePendingCrash,
  );
  const [bugReportVisible, setBugReportVisible] = useState(
    pendingCrash !== null,
  );
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [previewCode, setPreviewCode] = useState<PreviewCode | null>(null);
  const [previewDetails, setPreviewDetails] = useState<PreviewDetails | null>(
    null,
  );
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const rootRef = useRef<View>(null);

  const bugReportVisibleRef = useRef(bugReportVisible);
  useEffect(() => {
    bugReportVisibleRef.current = bugReportVisible;
  }, [bugReportVisible]);

  //overlay inputs must not lift the chat
  const keyboardLift = useKeyboardLift(
    !drawerVisible && !settingsDrawerVisible && !bugReportVisible,
  );
  const keyboardLiftStyle = useAnimatedStyle(() => ({
    //bar's safe area spacer sits under the keyboard
    paddingBottom: Math.max(keyboardLift.value - insets.bottom, 0),
  }));
  //lift at send, -1 when not sending
  const sendLift = useSharedValue(-1);
  const homeFreezeStyle = useAnimatedStyle(() => ({
    //home keeps its height while keyboard closes
    marginBottom:
      sendLift.value < 0
        ? 0
        : Math.max(sendLift.value - insets.bottom, 0) -
          Math.max(keyboardLift.value - insets.bottom, 0),
  }));

  const openBugReport = useCallback(async () => {
    //shakes ignored while sheet is open
    if (bugReportVisibleRef.current) return;
    if (!Settings.getCached().shakeToReport) return;
    Vibration.vibrate(30);
    //capture first or sheet shoots itself
    setScreenshot(await captureScreen(rootRef));
    openDrawerSafely(() => setBugReportVisible(true));
  }, [openDrawerSafely]);

  useBugReportTrigger(openBugReport);

  const [pendingConvIds, setPendingConvIds] = useState<string[]>([]);
  const [pendingMsgIds, setPendingMsgIds] = useState<string[]>([]);
  const requestQueueRef = useRef<
    {
      convId: string;
      task: () => Promise<void>;
      assistantMsgId: string;
      isIncognito: boolean;
    }[]
  >([]);
  const isProcessingRef = useRef(false);
  const generatingConvIdRef = useRef<string | null>(null);
  //composer owns its own drags, text selection is not a swipe
  const touchInComposerRef = useRef(false);

  //grant resets dx and dy, so the axis is picked before it
  const swipeAxisRef = useRef<"x" | "y">("x");

  //state read lets compiler memoize
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          //an open panel covers the screen and owns its gestures
          if (drawerVisible || settingsDrawerVisible || modelSelectorVisible)
            return false;
          //an interactive widget owns the gesture it started
          if (isWidgetTouchActive()) return false;
          //locked for the whole drag, a diagonal must not flip it
          if (Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
            swipeAxisRef.current = "x";
            if (Math.abs(gestureState.dx) <= 10) return false;
            const isLeftEdge = gestureState.x0 < 40;
            return gestureState.dx < 0 || isLeftEdge;
          }
          swipeAxisRef.current = "y";

          if (touchInComposerRef.current) return false;

          //swipe up on homepage opens model selector
          return !activeConversation && gestureState.dy < -15;
        },
        onPanResponderGrant: () => {
          //retract before keyboard shrinks panel
          KeyboardController.dismiss();
        },
        onPanResponderMove: (evt, gestureState) => {
          if (swipeAxisRef.current === "x") {
            //clamp keeps the other panel out
            dragDrawer(conversationsProgress, gestureState.dx / dragWidth);
            dragDrawer(settingsProgress, -gestureState.dx / dragWidth);
          } else {
            //carries the model selector up with the finger, same as the horizontal drawers
            dragDrawer(
              modelSelectorProgress,
              -gestureState.dy / sheetTravel(modelSelectorProgress),
            );
          }
        },
        onPanResponderRelease: (evt, gestureState) => {
          if (swipeAxisRef.current === "y") {
            const travel = sheetTravel(modelSelectorProgress);
            const opens = releaseOpens(
              -gestureState.dy / travel,
              -gestureState.vy,
            );
            settleDrawer(
              modelSelectorProgress,
              opens,
              -gestureVelocity(gestureState.vy, travel),
            );
            if (opens) setModelSelectorVisible(true);
            return;
          }

          const velocity = gestureVelocity(gestureState.vx, dragWidth);
          //same release rule as the drawers
          if (
            gestureState.dx > 0 &&
            releaseOpens(gestureState.dx / dragWidth, gestureState.vx)
          ) {
            settleDrawer(conversationsProgress, true, velocity);
            setDrawerVisible(true);
          } else if (
            gestureState.dx < 0 &&
            releaseOpens(-gestureState.dx / dragWidth, -gestureState.vx)
          ) {
            settleDrawer(settingsProgress, true, -velocity);
            setSettingsDrawerVisible(true);
          } else {
            //send peeked panel back off
            settleDrawer(conversationsProgress, false, velocity);
            settleDrawer(settingsProgress, false, -velocity);
          }
        },
        onPanResponderTerminate: () => {
          settleDrawer(conversationsProgress, false);
          settleDrawer(settingsProgress, false);
          settleDrawer(modelSelectorProgress, false);
        },
      }),
    [
      drawerVisible,
      settingsDrawerVisible,
      modelSelectorVisible,
      dragWidth,
      activeConversation,
      modelSelectorProgress,
    ],
  );

  //trackpad two-finger horizontal swipe like mobile gesture
  useEffect(() => {
    if (
      Platform.OS !== "web" &&
      Platform.OS !== "windows" &&
      Platform.OS !== "macos"
    )
      return;

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
          closeSettings();
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
      while (
        node &&
        node !== document.documentElement &&
        node !== document.body
      ) {
        const overflowX = window.getComputedStyle(node).overflowX;
        if (
          (overflowX === "auto" || overflowX === "scroll") &&
          node.scrollWidth > node.clientWidth
        ) {
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
        const reversed =
          lastDelta !== 0 && Math.sign(deltaX) !== Math.sign(lastDelta);
        const pushedAgain =
          Math.abs(deltaX) > Math.abs(lastDelta) &&
          Math.abs(lastDelta) < TAIL_DELTA;
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
  }, [openDrawerSafely, closeSettings]);

  const processQueue = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      while (requestQueueRef.current.length > 0) {
        const item = requestQueueRef.current.shift();
        setPendingConvIds([...requestQueueRef.current.map((i) => i.convId)]);
        setPendingMsgIds(requestQueueRef.current.map((i) => i.assistantMsgId));
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
  const showAssistantContent = useCallback(
    (msgId: string, convId: string, content: string) => {
      if (activeConversationRef.current?.id !== convId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, content } : m)),
      );
    },
    [],
  );

  //follow any run, whichever surface started it
  useEffect(() => {
    return GenerationService.subscribe((run) => {
      if (activeConversationRef.current?.id !== run.convId) return;

      if (run.status === "streaming") {
        if (generatingConvIdRef.current !== run.convId) {
          setGeneratingConvId(run.convId);
          generatingConvIdRef.current = run.convId;
        }
        //the spinner needs this even when the conversation did not change
        if (streamingMsgIdRef.current !== run.msgId)
          setStreamingMessageId(run.msgId);
        streamingContentRef.current = run.content;
        setMessages((prev) =>
          prev.some((m) => m.id === run.msgId)
            ? prev.map((m) =>
                m.id === run.msgId ? { ...m, content: run.content } : m,
              )
            : prev,
        );
        return;
      }

      //the queue clears its own state once it drains
      if (isProcessingRef.current) return;
      setGeneratingConvId(null);
      generatingConvIdRef.current = null;
      setStreamingMessageId(null);
      //incognito runs have no db row to read back
      if (run.persist) DB.getMessages(run.convId).then(setMessages);
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
        if (granted) LocationService.refresh().catch(() => {});
      });
      //load and apply settings
      try {
        await Settings.init();
        const s = migrateModelSources(await Settings.load());
        if ((await DB.detectDataIssues()) && !s.dataWarningDismissed) {
          setShowDataWarning(true);
        }
        //arms background sync at launch
        CloudSync.init().catch((e) =>
          console.warn("Could not start cloud sync:", e),
        );
        await PluginRegistry.init();
        await PluginRegistry.loadAll();
        //mcp tools register as servers connect
        McpService.init()
          .then(() => McpService.connectAll())
          .catch((e) => console.warn("Could not connect MCP servers:", e));

        //onboarding flow is native/desktop only, browser web skips straight to the app
        const isBrowserWeb =
          Platform.OS === "web" &&
          !(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
        if (!s.hasSeenOnboarding && !isBrowserWeb) {
          router.replace("/onboarding");
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
        const tuning = getOllamaTuning(s.ollamaUrl);
        AIModule.configure(s.ollamaUrl, tuning.contextLength, tuning.keepAlive);
        AIModule.setMode(s.aiService);
        //model name comes from the catalog
        await hydrateLiteRTCatalog();
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
  }, [selectedModel, aiService, ollamaUrl, capsRevision]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && dbReady) {
        loadConversations();
        if (
          activeConversationRef.current &&
          activeConversationRef.current.id !== sharedPreviewIdRef.current
        ) {
          DB.getMessages(activeConversationRef.current.id).then((msgs) => {
            // keep streaming content if generating
            if (
              generatingConvIdRef.current ===
                activeConversationRef.current?.id &&
              streamingMsgIdRef.current
            ) {
              const patched = msgs.map((m) =>
                m.id === streamingMsgIdRef.current
                  ? { ...m, content: streamingContentRef.current || "…" }
                  : m,
              );
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

    const conversationsSub = DeviceEventEmitter.addListener(
      AppEvents.conversationsChanged,
      scheduleReload,
    );
    //sync ai service on change
    const settingsSub = DeviceEventEmitter.addListener(
      AppEvents.settingsChanged,
      () => {
        setAiService(Settings.getCached().aiService);
        setOllamaUrl(Settings.getCached().ollamaUrl);
        setUserName(Settings.getCached().name);
        setShowTechnicalDetails(Settings.getCached().showTechnicalDetails);
        setCapsRevision((r) => r + 1);
      },
    );
    const modelSelectorSub = DeviceEventEmitter.addListener(
      AppEvents.openModelSelector,
      () => {
        openDrawerSafely(() => setModelSelectorVisible(true));
      },
    );
    const codePreviewSub = DeviceEventEmitter.addListener(
      AppEvents.openCodePreview,
      setPreviewCode,
    );

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      conversationsSub.remove();
      settingsSub.remove();
      modelSelectorSub.remove();
      codePreviewSub.remove();
    };
  }, [dbReady, loadConversations, openDrawerSafely]);

  //load messages when a conversation is selected
  const selectConversation = useCallback(async (conv: Conversation) => {
    setActiveConversation(conv);
    const msgs = await DB.getMessages(conv.id);

    if (generatingConvIdRef.current === conv.id && streamingMsgIdRef.current) {
      const patched = msgs.map((m) =>
        m.id === streamingMsgIdRef.current
          ? { ...m, content: streamingContentRef.current || "…" }
          : m,
      );
      setMessages(patched);
    } else {
      setMessages(msgs);
    }
  }, []);

  //start new empty conversation
  const startNewConversation = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
    setButterflyFrom(null);
    sendLift.set(-1);
  }, [sendLift]);

  //stable ref keeps drawer rows memoized
  const closeConversationsDrawer = useCallback(
    () => setDrawerVisible(false),
    [],
  );

  //defer upload until accepted
  const askToShareConversation = useCallback((conv: Conversation) => {
    setShareNotice({ kind: "confirm", conv });
  }, []);

  //encrypt, upload, return link
  const createShareLink = useCallback(
    async (conv: Conversation) => {
      setShareNotice({ kind: "creating" });
      try {
        const msgs = await DB.getMessages(conv.id);
        if (msgs.length === 0) {
          setShareNotice({ kind: "error", message: t("share.error.empty") });
          return;
        }
        const link = await shareConversation(conv, msgs);
        //native has share sheet, web needs display
        if (Platform.OS === "web") {
          setShareNotice({ kind: "link", link });
          return;
        }
        setShareNotice(null);
        //android share only reads message
        await Share.share(
          Platform.OS === "ios" ? { url: link } : { message: link },
        );
      } catch (e: any) {
        setShareNotice({
          kind: "error",
          message: e?.message || t("share.error.create"),
        });
      }
    },
    [t],
  );

  //decrypt shared convo, no db write yet
  const openSharedConversation = useCallback(
    async (pasteId: string, secret: string) => {
      tryOpenSharedInApp(pasteId, secret);
      setShareNotice({ kind: "opening" });
      try {
        const { conversation, messages: sharedMessages } =
          await fetchSharedConversation(pasteId, secret);
        setSharedPreviewId(conversation.id);
        setActiveConversation(conversation);
        setMessages(sharedMessages);
        setShareNotice(null);
        clearShareFromUrl();
      } catch (e: any) {
        setShareNotice({
          kind: "error",
          message: e?.message || t("share.error.open"),
        });
      }
    },
    [t],
  );

  const saveSharedConversation = useCallback(async () => {
    if (!activeConversation || activeConversation.id !== sharedPreviewId)
      return;
    await DB.replaceConversationWithMessages(activeConversation, messages);
    setSharedPreviewId(null);
    await loadConversations();
  }, [activeConversation, sharedPreviewId, messages, loadConversations]);

  //handle deeplinks (cold + warm start, mobile + tauri)
  const pendingDeepLinkRef = useRef<DeepLinkRoute | null>(null);
  const initialShareRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const apply = (route: DeepLinkRoute) => {
      if (route.type === "new-chat") {
        startNewConversation();
      } else if (route.type === "shared") {
        openSharedConversation(route.pasteId, route.secret);
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
      } else if (route.type === "settings") {
        openDrawerSafely(() => {
          setSettingsInitialSubPage("main");
          setSettingsDrawerVisible(true);
        });
      }
    };
    getInitialDeepLink().then((route) => {
      if (cancelled || !route) return;
      //dedupe cold links across db re-init
      if (route.type === "shared") {
        if (initialShareRef.current === route.pasteId) return;
        initialShareRef.current = route.pasteId;
      }
      apply(route);
    });
    const unsubscribe = subscribeToDeepLinks(apply);
    //a finished background generation opens its conversation
    const drainNotification = () => {
      takePendingNotificationConvId().then((convId) => {
        if (!cancelled && convId) apply({ type: "conversation", convId });
      });
    };
    const unsubscribeNotification =
      subscribeToNotificationPress(drainNotification);
    //a tap from the background may land before or after the app is back
    const resumeSub = AppState.addEventListener("change", (state) => {
      if (state === "active") drainNotification();
    });
    drainNotification();
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeNotification();
      resumeSub.remove();
    };
  }, [
    dbReady,
    selectConversation,
    startNewConversation,
    openSharedConversation,
    openDrawerSafely,
  ]);

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
  const togglePinConversation = useCallback(
    async (convId: string, pinned: boolean) => {
      await DB.togglePinConversation(convId, pinned);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId ? { ...c, pinned: pinned ? 1 : 0 } : c,
        ),
      );
      if (activeConversation?.id === convId) {
        setActiveConversation((prev) =>
          prev ? { ...prev, pinned: pinned ? 1 : 0 } : prev,
        );
      }
    },
    [activeConversation],
  );

  //delete conversation
  const deleteConversation = useCallback(
    async (convId: string) => {
      await DB.deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversation?.id === convId) {
        startNewConversation();
      }
    },
    [activeConversation, startNewConversation],
  );

  //generate title from first message
  const generateTitle = useCallback(
    async (convId: string, userMessage: string, images?: string[]) => {
      try {
        let title = "";
        //title prompt only needs doc names
        const { names, text } = splitDocumentBlocks(userMessage);
        const summarized =
          names.length > 0 ? `${names.join(", ")}\n${text}` : text;
        await AIModule.sendOn(
          resolveQuickFlow(selectedModel),
          SYSTEM_PROMPTS.SUMMARIZE,
          [{ role: "user", content: summarized, images }],
          (chunk) => {
            title += chunk;
          },
          undefined,
          { think: false },
        );
        const cleaned = title.trim();
        if (cleaned.length > 0) {
          await DB.renameConversation(convId, cleaned);
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, name: cleaned } : c)),
          );
          setActiveConversation((prev) =>
            prev && prev.id === convId ? { ...prev, name: cleaned } : prev,
          );
        }
      } catch (e) {
        //best-effort title keep on failure
        console.warn("Title generation skipped:", (e as any)?.message ?? e);
      }
    },
    [selectedModel],
  );

  //send a message — creates conversation on first send
  const handleSend = useCallback(
    async (text: string, images?: string[], viaVoice?: boolean) => {
      if (!dbReady && !incognitoMode) return;

      let conv = activeConversation;
      let isFirstMessage = false;
      const isIncognitoTask = conv
        ? conv.id.startsWith("incognito_")
        : incognitoMode;

      //create conversation if this is the first message
      if (!conv) {
        isFirstMessage = true;
        //chatbar dismisses the keyboard right after
        sendLift.set(keyboardLift.get());
        //read before the home screen unmounts
        const homeButterfly =
          homeButterflyRef.current?.getBoundingClientRect() ?? null;
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
        setButterflyFrom(homeButterfly);
        setActiveConversation(conv);
      }

      //save user message immediately
      let userMsg: Message;
      if (isIncognitoTask) {
        userMsg = {
          id:
            "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
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
      const taskSystemPrompt = buildSystemPrompt(
        selectedModel,
        userInstruction,
      );
      const taskReflection = selectedReflection;
      const taskConv = conv;

      //create empty assistant message for streaming immediately
      let assistantMsg: Message;
      if (isIncognitoTask) {
        assistantMsg = {
          id:
            "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
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

        //speak voice replies as they stream
        const finishSpeech =
          viaVoice && Settings.getCached().autoSpeak
            ? speakReplyLive(assistantMsg.id)
            : null;
        const run = await GenerationService.start({
          convId: taskConv.id,
          msgId: assistantMsg.id,
          prompt: text,
          model: taskSelectedModel,
          systemPrompt: taskSystemPrompt,
          history: taskHistory,
          think: taskReflection === "none" ? false : taskReflection,
          persist: !isIncognitoTask,
          noModelMessage: t("chat.noModel"),
        });
        finishSpeech?.(run);

        const isError = run.status === "error";
        const isAborted = run.status === "aborted";
        streamingContentRef.current = run.content;
        showAssistantContent(assistantMsg.id, taskConv.id, run.content);
        if (activeConversationRef.current?.id === taskConv.id) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsg.id
                ? {
                    ...msg,
                    sources: run.sources ?? msg.sources,
                    metrics: run.metrics ?? msg.metrics,
                  }
                : msg,
            ),
          );
        }
        //refresh conversation list (updatedAt changed)
        if (!isIncognitoTask && !isError) await loadConversations();

        //generate AI title for new conversations
        if (isFirstMessage && !isIncognitoTask && !isError) {
          generateTitle(taskConv.id, text, images);
        }

        //propose follow-ups once the reply landed whole
        if (!isError && !isAborted && taskSelectedModel) {
          generateSuggestions({
            model: taskSelectedModel,
            userMessage: text,
            assistantMessage: streamingContentRef.current,
            //show each pill once complete
            onPartial: (items) =>
              setSuggestions(taskConv.id, { msgId: assistantMsg.id, items }),
          }).then((items) => {
            if (items.length > 0)
              setSuggestions(taskConv.id, { msgId: assistantMsg.id, items });
          });
        }
      };

      requestQueueRef.current.push({
        convId: conv.id,
        task,
        assistantMsgId: assistantMsg.id,
        isIncognito: isIncognitoTask,
      });
      setPendingConvIds([...requestQueueRef.current.map((i) => i.convId)]);
      setPendingMsgIds(requestQueueRef.current.map((i) => i.assistantMsgId));
      processQueue().catch((e) => console.error("Queue processing failed:", e));
    },
    //processQueue is recreated every render, keeping it out avoids churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dbReady,
      incognitoMode,
      activeConversation,
      selectedModel,
      selectedReflection,
      generateTitle,
      userInstruction,
      aiService,
      ollamaUrl,
      sendLift,
      keyboardLift,
    ],
  );

  //switch active provider or server
  const handleServiceChange = useCallback((service: string, url: string) => {
    setAiService(service);
    setOllamaUrl(url);
    //atomic pair, no half-saved state
    Settings.setMany({ aiService: service, ollamaUrl: url });
    AIModule.setMode(service);
    if (url) {
      const tuning = getOllamaTuning(url);
      AIModule.configure(url, tuning.contextLength, tuning.keepAlive);
    }
  }, []);

  //use remote model unless local forced
  //native transcript used instead of whisper
  const handleTranscribe = useCallback(
    async (
      wavBuffer: ArrayBuffer,
      localFallback?: string | null,
    ): Promise<string | null> => {
      const useRemote =
        !alwaysWhisper && modelCapabilities.includes("audio") && selectedModel;

      const transcribeLocally = async () => {
        if (localFallback !== undefined) return localFallback;
        if (!WhisperSTT.isAvailable()) {
          const modelName = Settings.getCached().whisperModel || "base";
          if (
            modelName !== "none" &&
            (await WhisperSTT.isModelInstalled(modelName))
          ) {
            await WhisperSTT.init(modelName);
          }
        }
        if (WhisperSTT.isAvailable()) {
          return WhisperSTT.transcribeData(wavBuffer);
        }
        console.error(
          "Whisper fallback failed because Whisper is not initialized or installed.",
        );
        return null;
      };

      if (!useRemote) {
        return transcribeLocally();
      }
      try {
        //encode wav as data uri
        const base64Audio =
          "data:audio/wav;base64," + arrayBufferToBase64(wavBuffer);

        //send to remote model with TRANSCRIBE prompt
        let transcription = "";
        await AIModule.sendMessage(
          selectedModel,
          SYSTEM_PROMPTS.TRANSCRIBE,
          [
            {
              role: "user",
              content: "Transcribe this audio.",
              images: [base64Audio],
            },
          ],
          (chunk) => {
            transcription += chunk;
          },
          undefined,
          { think: false },
        );
        return transcription.trim() || null;
      } catch (e) {
        console.error("Remote transcription failed, falling back to local:", e);
        return transcribeLocally();
      }
    },
    [alwaysWhisper, modelCapabilities, selectedModel],
  );

  const handleRegenerate = useCallback(
    async (aiMessageId: string) => {
      if (!activeConversation) return;

      if (generatingConvId === activeConversation.id) {
        GenerationService.stop(activeConversation.id);
      }
      //queued replies get deleted below
      requestQueueRef.current = requestQueueRef.current.filter(
        (i) => i.convId !== activeConversation.id,
      );
      setPendingConvIds([...requestQueueRef.current.map((i) => i.convId)]);
      setPendingMsgIds(requestQueueRef.current.map((i) => i.assistantMsgId));

      const msgIndex = messagesRef.current.findIndex(
        (m) => m.id === aiMessageId,
      );
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
      const taskSystemPrompt = buildSystemPrompt(
        selectedModel,
        userInstruction,
      );
      const taskReflection = selectedReflection;
      const taskConv = activeConversation;
      const isIncognitoTask = taskConv.id.startsWith("incognito_");

      let assistantMsg: Message;
      if (isIncognitoTask) {
        assistantMsg = {
          id:
            "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          conversationId: taskConv.id,
          role: "assistant",
          content: "…",
          createdAt: Date.now(),
        };
      } else {
        assistantMsg = await DB.addMessage(taskConv.id, "assistant", "…");
      }

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== aiMessageId),
        assistantMsg,
      ]);

      const task = async () => {
        setGeneratingConvId(taskConv.id);
        generatingConvIdRef.current = taskConv.id;
        setStreamingMessageId(assistantMsg.id);
        streamingContentRef.current = "";

        //the reply changed, so do the follow-ups
        const lastUser = [...taskHistory]
          .reverse()
          .find((m) => m.role === "user");

        const run = await GenerationService.start({
          convId: taskConv.id,
          msgId: assistantMsg.id,
          prompt: lastUser?.content ?? "",
          model: taskSelectedModel,
          systemPrompt: taskSystemPrompt,
          history: taskHistory,
          think: taskReflection === "none" ? false : taskReflection,
          persist: !isIncognitoTask,
          noModelMessage: t("chat.noModel"),
        });

        const isError = run.status === "error";
        const isAborted = run.status === "aborted";
        streamingContentRef.current = run.content;
        showAssistantContent(assistantMsg.id, taskConv.id, run.content);
        if (activeConversationRef.current?.id === taskConv.id) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsg.id
                ? {
                    ...msg,
                    sources: run.sources ?? msg.sources,
                    metrics: run.metrics ?? msg.metrics,
                  }
                : msg,
            ),
          );
        }
        if (!isIncognitoTask && !isError) await loadConversations();
        if (!isError && !isAborted && taskSelectedModel && lastUser) {
          generateSuggestions({
            model: taskSelectedModel,
            userMessage: lastUser.content,
            assistantMessage: streamingContentRef.current,
            //show each pill once complete
            onPartial: (items) =>
              setSuggestions(taskConv.id, { msgId: assistantMsg.id, items }),
          }).then((items) => {
            if (items.length > 0)
              setSuggestions(taskConv.id, { msgId: assistantMsg.id, items });
          });
        }
      };

      requestQueueRef.current.push({
        convId: taskConv.id,
        task,
        assistantMsgId: assistantMsg.id,
        isIncognito: isIncognitoTask,
      });
      setPendingConvIds([...requestQueueRef.current.map((i) => i.convId)]);
      setPendingMsgIds(requestQueueRef.current.map((i) => i.assistantMsgId));
      processQueue().catch((e) => console.error("Queue processing failed:", e));

      //processQueue is recreated every render, keeping it out avoids churn
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [
      activeConversation,
      generatingConvId,
      incognitoMode,
      selectedModel,
      ollamaUrl,
      aiService,
      userInstruction,
      selectedReflection,
    ],
  );

  const handleStop = useCallback(async () => {
    const currentConvId = activeConversation?.id;
    if (!currentConvId) return;

    if (generatingConvId === currentConvId) {
      GenerationService.stop(currentConvId);
    } else if (pendingConvIds.includes(currentConvId)) {
      //cancel all pending tasks for this conversation
      const tasksToCancel = requestQueueRef.current.filter(
        (i) => i.convId === currentConvId,
      );
      requestQueueRef.current = requestQueueRef.current.filter(
        (i) => i.convId !== currentConvId,
      );
      setPendingConvIds([...requestQueueRef.current.map((i) => i.convId)]);
      setPendingMsgIds(requestQueueRef.current.map((i) => i.assistantMsgId));

      for (const item of tasksToCancel) {
        if (!item.isIncognito) {
          await DB.updateMessageContent(
            item.assistantMsgId,
            "\n\n_The user interrupted the response_",
          );
        }
      }
      setMessages((prev) =>
        prev.map((m) => {
          if (tasksToCancel.some((t) => t.assistantMsgId === m.id)) {
            return { ...m, content: "\n\n_The user interrupted the response_" };
          }
          return m;
        }),
      );
    }
  }, [activeConversation, generatingConvId, pendingConvIds]);

  if (dbFailed) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.welcomeText}>{t("home.dbFailed.title")}</Text>
        <Text style={styles.incognitoDescription}>
          {t("home.dbFailed.message")}
        </Text>
      </View>
    );
  }

  if (!dbReady) {
    return <View style={styles.container} />;
  }

  //preview until saved or switched
  const isSharedPreview =
    !!sharedPreviewId && activeConversation?.id === sharedPreviewId;

  const shareNoticeButtons =
    shareNotice?.kind === "confirm"
      ? [
          {
            text: t("common.cancel"),
            style: "secondary" as const,
            onPress: () => setShareNotice(null),
          },
          {
            text: t("share.createLink"),
            style: "primary" as const,
            onPress: () => createShareLink(shareNotice.conv),
          },
        ]
      : shareNotice?.kind === "link"
        ? [
            {
              text: t("common.close"),
              style: "secondary" as const,
              onPress: () => setShareNotice(null),
            },
            {
              text: t("share.copyLink"),
              style: "primary" as const,
              onPress: () => {
                Clipboard.setStringAsync(shareNotice.link);
                setShareNotice(null);
              },
            },
          ]
        : [
            {
              text: t("common.close"),
              style: "secondary" as const,
              onPress: () => setShareNotice(null),
            },
          ];

  const conversationsDrawer = (
    <ConversationsDrawer
      isDesktop={isDesktop}
      visible={drawerVisible}
      onClose={closeConversationsDrawer}
      conversations={conversations}
      selectedConversationId={activeConversation?.id ?? null}
      onSelectConversation={selectConversation}
      onNewConversation={startNewConversation}
      onDeleteConversation={deleteConversation}
      onTogglePinConversation={togglePinConversation}
      onShareConversation={askToShareConversation}
    />
  );

  const settingsDrawer = (
    <SettingsDrawer
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      visible={settingsDrawerVisible}
      initialSubPage={settingsInitialSubPage}
      onClose={closeSettings}
      onDataChanged={async () => {
        await loadConversations();
        startNewConversation();
      }}
    />
  );

  return (
    <View style={styles.container} ref={rootRef} collapsable={false}>
      <ImageBackground
        source={texture2}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
        imageStyle={styles.backgroundTexture}
        resizeMode="cover"
      />
      <LinearGradient
        colors={[
          Colors.background,
          `${Colors.background}D9`,
          `${Colors.background}BF`,
          `${Colors.background}A6`,
          `${Colors.background}4D`,
          `${Colors.background}1A`,
          "transparent",
        ]}
        locations={[0.1, 0.4, 0.5, 0.75, 0.8, 0.9, 0.95]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
      />
      <Reanimated.View
        style={[
          styles.container,
          { backgroundColor: "transparent" },
          keyboardLiftStyle,
        ]}
        {...(isLargeScreen ? {} : panResponder.panHandlers)}
      >
        <View
          style={{ flex: 1, flexDirection: isLargeScreen ? "row" : "column" }}
          pointerEvents="box-none"
        >
          {/* only the desktop panels take part in layout, the overlay ones live outside the
              keyboard avoiding view or they get clipped to its shrunken height */}
          {isDesktop ? conversationsDrawer : null}

          <View
            style={{ flex: 1, backgroundColor: "transparent" }}
            pointerEvents="box-none"
          >
            {!activeConversation && (
              <Reanimated.View style={[styles.centerContent, homeFreezeStyle]}>
                <ButterflyCluster
                  ref={homeButterflyRef}
                  incognito={incognitoMode}
                  style={styles.butterfly}
                />
                <TypewriterWelcome
                  text={userName ? `${greeting}\n${userName}` : greeting}
                  style={styles.welcomeText}
                  reserveLines={userName ? 2 : 1}
                />
                <DissolveIn delay={2800}>
                  <IncognitoToggle
                    incognito={incognitoMode}
                    onPress={() => {
                      Vibration.vibrate(10);
                      setIncognitoMode((prev) => !prev);
                    }}
                  />
                </DissolveIn>
                <Animated.Text
                  style={[
                    styles.incognitoDescription,
                    {
                      opacity: incognitoProgress,
                      transform: [
                        {
                          translateY: incognitoProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [6, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  Welcome to incognito mode. You can ask quick questions without
                  leaving a trace. Once you close the window, your conversation
                  disappears forever.
                </Animated.Text>
              </Reanimated.View>
            )}

            {activeConversation && (
              <ChatView
                suggestions={activeSuggestions}
                onSuggestionPress={handleSend}
                messages={messages}
                conversation={activeConversation}
                contentTopPadding={insets.top + 72}
                contentBottomPadding={88 + insets.bottom}
                incognito={activeConversation.id.startsWith("incognito_")}
                onRegenerate={handleRegenerate}
                speakerEnabled={speakerEnabled}
                showMetrics={showTechnicalDetails}
                generatingMessageId={
                  generatingConvId === activeConversation.id
                    ? streamingMsgId
                    : null
                }
                queuedMessageIds={pendingMsgIds}
                hideGradients={isDesktop}
                onOpenConfidentiality={() => {
                  openDrawerSafely(() => {
                    setSettingsInitialSubPage("confidentiality");
                    setSettingsDrawerVisible(true);
                  });
                }}
                canThink={
                  modelCapabilities.includes("thinking") &&
                  selectedReflection !== "none"
                }
                onImagePress={setPreviewImage}
                onDetailsPress={setPreviewDetails}
                butterflyFrom={butterflyFrom}
              />
            )}

            <View
              style={[
                styles.topBarOverlay,
                {
                  paddingTop:
                    insets.top +
                    (typeof window !== "undefined" &&
                    "__TAURI_INTERNALS__" in window
                      ? 32
                      : 0),
                  zIndex: attachmentSheetVisible ? 200 : undefined,
                },
              ]}
              pointerEvents="box-none"
            >
              <TopBar
                onMenuPress={() => {
                  if (!isDesktop && settingsDrawerVisible) return;
                  openDrawerSafely(() => setDrawerVisible((prev) => !prev));
                }}
                onNewPress={startNewConversation}
                isDesktop={isDesktop}
                centerElement={
                  <ModelSelectorTrigger
                    viewRef={modelTriggerRef}
                    selectedModel={selectedModel}
                    onPress={() => {
                      if (
                        !isDesktop &&
                        (drawerVisible || settingsDrawerVisible)
                      )
                        return;
                      openDrawerSafely(() =>
                        setModelSelectorVisible((prev) => !prev),
                      );
                    }}
                  />
                }
                rightElement={
                  <View style={styles.settingsShadowLayer}>
                    <View style={styles.settingsShadowBlock} />
                    <Pressable
                      style={pressStyle(
                        [
                          styles.settingsButton,
                          !isDesktop && { paddingHorizontal: 0, width: 44 },
                        ],
                        "surface",
                      )}
                      onPress={() => {
                        if (!isDesktop && drawerVisible) return;
                        openDrawerSafely(() => {
                          if (settingsDrawerVisible) {
                            closeSettings();
                          } else {
                            setSettingsDrawerVisible(true);
                          }
                        });
                      }}
                    >
                      <Image
                        source={settingsIcon}
                        style={[
                          styles.settingsIcon,
                          !isDesktop && { marginRight: 0 },
                        ]}
                      />
                      {isDesktop && (
                        <Text style={styles.settingsButtonText}>
                          {t("home.settings")}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                }
              />
            </View>

            {/* bottom bar overlay */}
            <View
              style={[styles.bottomBarOverlay]}
              pointerEvents="box-none"
              onTouchStart={() => {
                touchInComposerRef.current = true;
              }}
              onTouchEnd={() => {
                touchInComposerRef.current = false;
              }}
              onTouchCancel={() => {
                touchInComposerRef.current = false;
              }}
            >
              {isSharedPreview ? (
                <View style={styles.addSharedContainer}>
                  <View style={styles.addSharedInner}>
                    <View style={styles.shareWarningWrapper}>
                      <Group
                        style={{
                          backgroundColor: Colors.dangerBgSoft,
                          borderColor: Colors.dangerBorderSoft,
                        }}
                      >
                        <View style={styles.shareWarningBox}>
                          <Text style={styles.shareWarningText}>
                            {t("share.preview.warning")}
                          </Text>
                        </View>
                      </Group>
                    </View>
                    <View style={styles.addSharedWrapper}>
                      <Group>
                        <ActionButton
                          icon={addIcon}
                          label={t("share.preview.add")}
                          labelStyle={styles.addSharedLabel}
                          onPress={saveSharedConversation}
                          style={styles.addSharedButton}
                        />
                      </Group>
                    </View>
                  </View>
                  <View style={{ width: "100%", height: insets.bottom }} />
                </View>
              ) : (
                <ChatBar
                  onSend={handleSend}
                  incognito={
                    activeConversation
                      ? activeConversation.id.startsWith("incognito_")
                      : incognitoMode
                  }
                  isGenerating={
                    activeConversation
                      ? generatingConvId === activeConversation.id ||
                        pendingConvIds.includes(activeConversation.id)
                      : false
                  }
                  onStop={handleStop}
                  onTranscribe={handleTranscribe}
                  canTranscribeRemotely={
                    !alwaysWhisper &&
                    modelCapabilities.includes("audio") &&
                    !!selectedModel
                  }
                  modelCapabilities={modelCapabilities}
                  onOpenSettings={() => {
                    openDrawerSafely(() => {
                      setSettingsInitialSubPage("main");
                      setSettingsDrawerVisible(true);
                    });
                  }}
                  onAttachmentSheetVisibilityChange={setAttachmentSheetVisible}
                />
              )}
            </View>
          </View>
        </View>
      </Reanimated.View>

      {isDesktop ? null : conversationsDrawer}
      {settingsDrawer}

      <BugReportSheet
        visible={bugReportVisible}
        crash={pendingCrash}
        screenshot={screenshot}
        onClose={() => {
          setBugReportVisible(false);
          setPendingCrash(null);
          setScreenshot(null);
        }}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
        bottomInset={insets.bottom}
      />

      <ImagePreviewSheet
        image={previewImage}
        onClose={() => setPreviewImage(null)}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
        bottomInset={insets.bottom}
      />

      <CodePreviewSheet
        code={previewCode}
        onClose={() => setPreviewCode(null)}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
        bottomInset={insets.bottom}
      />

      <MessageDetailsSheet
        details={previewDetails}
        onClose={() => setPreviewDetails(null)}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
        bottomInset={insets.bottom}
      />

      <ModelSelectorDrawer
        visible={modelSelectorVisible}
        onClose={() => setModelSelectorVisible(false)}
        progress={modelSelectorProgress}
        selectedModel={selectedModel}
        selectedReflection={selectedReflection}
        showReflection={modelCapabilities.includes("thinking")}
        aiService={aiService}
        ollamaUrl={ollamaUrl}
        onServiceChange={handleServiceChange}
        onModelChange={(model) => {
          setSelectedModel(model);
          Settings.set("ollamaModel", model);
        }}
        onReflectionChange={setSelectedReflection}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
        triggerRef={modelTriggerRef}
        messages={messages}
        onOpenProviderSettings={(provider) => {
          setModelSelectorVisible(false);
          openDrawerSafely(() => {
            const page = (
              ["beta", "local", "litert", "ollama", "openai"].includes(provider)
                ? provider
                : "service"
            ) as SubPage;
            setSettingsInitialSubPage(page);
            setSettingsDrawerVisible(true);
          });
        }}
      />

      <HeadlessWebView />

      <NotificationModal
        visible={!!shareNotice}
        title={
          shareNotice?.kind === "opening"
            ? t("share.modal.openTitle")
            : t("share.modal.title")
        }
        message={
          shareNotice?.kind === "confirm"
            ? shareConsentMessage()
            : shareNotice?.kind === "creating"
              ? t("share.modal.creating")
              : shareNotice?.kind === "opening"
                ? t("share.modal.opening")
                : shareNotice?.kind === "error"
                  ? shareNotice.message
                  : shareNotice?.kind === "link"
                    ? shareNotice.link
                    : undefined
        }
        onClose={() => setShareNotice(null)}
        buttons={shareNoticeButtons}
      />

      <NotificationModal
        visible={showDataWarning}
        title={t("home.dataWarning.title")}
        message={t("home.dataWarning.message")}
        onClose={() => setShowDataWarning(false)}
        buttons={[
          {
            text: t("home.dataWarning.goToSettings"),
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
            text: t("home.dataWarning.later"),
            style: "secondary",
            onPress: () => {
              Settings.set("dataWarningDismissed", true);
              setShowDataWarning(false);
            },
          },
        ]}
      />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    backgroundTexture: { opacity: 0.02, width: "100%", height: "100%" },
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
    //same frame as the composer
    addSharedContainer: {
      width: "100%",
      maxWidth: 840,
      alignSelf: "center",
    },
    addSharedInner: {
      width: "100%",
      maxWidth: 800,
      alignSelf: "center",
    },
    addSharedWrapper: {
      marginHorizontal: 16,
      marginBottom: 16,
    },
    shareWarningWrapper: {
      marginHorizontal: 16,
      marginBottom: 8,
    },
    shareWarningBox: {
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    shareWarningText: {
      fontSize: FontSizes.bodyMd,
      fontFamily: Fonts.body,
      color: Colors.textPrimary,
      lineHeight: 20,
    },
    addSharedButton: {
      height: 56,
      justifyContent: "center",
    },
    //auto basis or the label collapses
    addSharedLabel: {
      flex: 0,
      flexGrow: 0,
      flexShrink: 1,
      flexBasis: "auto",
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
      zIndex: 6,
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
      borderRadius: Radius.xxl,
      position: "relative",
      zIndex: 1,
    },
    settingsIcon: {
      width: 18,
      height: 18,
      marginRight: 8,
      tintColor: Colors.textPrimary,
    },
    settingsButtonText: {
      fontSize: FontSizes.bodyMd,
      fontFamily: Fonts.mono,
      color: Colors.textSecondary,
    },
    incognitoBox: {
      position: "relative",
      borderRadius: Radius.xxl,
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: Colors.surface,
      zIndex: 1,
      marginTop: 20,
    },
    //off screen copies of the pill, measured to know both target widths up front
    incognitoMeasure: {
      position: "absolute",
      width: 400,
      alignItems: "flex-start",
      opacity: 0,
      pointerEvents: "none",
    },
    incognitoBoxActive: {
      backgroundColor: Colors.incognito,
    },
    incognitoButtonText: {
      fontSize: FontSizes.caption,
      color: Colors.textSecondary,
      fontFamily: Fonts.mono,
      textAlign: "center",
    },
    incognitoButtonTextActive: {
      color: Colors.textOnPrimary,
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
