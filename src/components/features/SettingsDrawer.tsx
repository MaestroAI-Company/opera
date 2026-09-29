import * as Calendar from "expo-calendar";
import Constants from "expo-constants";
import * as Contacts from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  AppState,
  BackHandler,
  DeviceEventEmitter,
  Image,
  ImageSourcePropType,
  Keyboard,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef, releaseCapture } from "react-native-view-shot";
import {
  Fonts,
  FontSizes,
  Radius,
  Spacing,
  ThemeColors,
} from "../../../constants/theme";
import { AIModule } from "../../services/ai/AIModule";
import { contextFloorTokens } from "../../services/ai/generation/chatGeneration";
import {
  CatalogEntry,
  familyPublisher,
  fetchCatalogEntry,
  fetchFamilies,
  fetchModelDescription,
  formatBytes,
  getCachedFamilies,
  getCatalogEntry,
  hydrateLiteRTCatalog,
  MIN_SEARCH_LENGTH,
  modelAvatarUrl,
  ModelFamily,
  OTHER_FAMILY_ID,
  sameFamilyModels,
  searchModels,
  similarModels,
} from "../../services/ai/providers/huggingFaceCatalog";
import {
  cancelLiteRTDownload,
  deleteLiteRTModel,
  downloadLiteRTModel,
  getInstalledLiteRTModels,
  getLiteRTModelLabel,
  getPendingLiteRTDownload,
  isLiteRTModelDownloaded,
  LiteRTDownloadCancelled,
  LiteRTDownloadSnapshot,
  LiteRTModelInfo,
  subscribeLiteRTDownload,
} from "../../services/ai/providers/LiteRTProvider";
import { LocalModelSheet } from "../../services/ai/providers/LocalProvider";
import {
  BETA_PROVIDER_ID,
  BETA_SERVER_URL,
  buildSources,
  getEnabledProviders,
  getOllamaServers,
  getOllamaTuning,
  getOpenAIApiKeyById,
  getOpenAIServers,
  isProviderSupported,
  newOpenAIServerId,
  OllamaServer,
  OPENAI_PROVIDER_ID,
  openAIServerNames,
  serializeServers,
  serializeProviders,
  setOpenAIApiKey,
} from "../../services/ai/providers/sources";
import { OpenAIProvider } from "../../services/ai/providers/OpenAIProvider";
import {
  parseQuickFlowOptionId,
  quickFlowOptionId,
} from "../../services/ai/quickFlow";
import { ITool } from "../../services/ai/tools/ITool";
import { ToolManager } from "../../services/ai/tools/ToolManager";
import {
  isDefaultAssistant,
  openAssistantSettings,
} from "../../services/assistant/DefaultAssistant";
import { BackupService } from "../../services/BackupService";
import { CloudUserInfo } from "../../services/cloud/CloudProvider";
import {
  CLOUD_PROVIDERS,
  getCloudProviderDefinition,
} from "../../services/cloud/registry";
import { CloudSync } from "../../services/CloudSyncService";
import { AppEvents } from "../../services/events";
import { McpService } from "../../services/mcp/McpService";
import { McpServerConfig } from "../../services/mcp/types";
import { PluginRegistry } from "../../services/plugins/PluginRegistry";
import { Settings } from "../../services/settings/SettingsService";
import {
  NEURAL_ENGINES,
  TTS_SPEEDS,
  getVoice,
  setVoice,
  supportedEngineIds,
} from "../../services/speech/engines";
import { WhisperSTT } from "../../services/speech/STTService";
import { IWidget, WidgetManager } from "../../services/widgets/WidgetManager";
import ActionButton from "../ui/ActionButton";
import Checkbox from "../ui/Checkbox";
import DownloadProgress from "../ui/DownloadProgress";
import Group from "../ui/Group";
import NotificationBanner from "../ui/NotificationBanner";
import NotificationCard from "../ui/NotificationCard";
import NotificationModal, { ModalButton } from "../ui/NotificationModal";
import ProgressBar from "../ui/ProgressBar";
import Selector, { SelectorOption } from "../ui/Selector";
import Slider from "../ui/Slider";
import SliderToggle from "../ui/SliderToggle";
import TextInputField from "../ui/TextInputField";
import Toggle from "../ui/Toggle";
import DrawerSheet from "./DrawerSheet";
import MaestroCard from "./MaestroCard";
import ProfileCard from "./ProfileCard";

import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller";
import { useResponsive } from "../../hooks/useResponsive";
import { useSettingsNotices } from "../../hooks/useSettingsNotices";

import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useBugReport } from "../../hooks/useBugReport";
import { setThemeMode, useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { pressStyle } from "../ui/pressStyle";
import {
  dragDrawer,
  drawerWidthFor,
  gestureVelocity,
  releaseOpens,
  settingsProgress,
  settleDrawer,
  settleLayoutDrawer,
} from "./drawerAnimation";
import DrawerBackButton from "./DrawerBackButton";
import PageStack from "./PageStack";

const linkIcon = require("../../../assets/icons/link.png");
const addIcon = require("../../../assets/icons/add.png");
const downloadIcon = require("../../../assets/icons/download.png");
const deleteIcon = require("../../../assets/icons/delete.png");
const penPlaceholderIcon = require("../../../assets/icons/pencil.png");

const LITERT_CAPABILITY_KEYS = {
  vision: "settings.litert.capVision",
  audio: "settings.litert.capAudio",
  thinking: "settings.litert.capThinking",
} as const;
const TTS_ENGINE_KEYS = {
  kokoro: "settings.tts.kokoro",
  supertonic: "settings.tts.supertonic",
} as const;
const searchIcon =require("../../../assets/icons/search.png");
const profilIcon = require("../../../assets/icons/profil.png");
const cloudIcon = require("../../../assets/icons/cloud.png");
const cloudUploadIcon = require("../../../assets/icons/cloudupload.png");
const cloudDownloadIcon = require("../../../assets/icons/clouddownload.png");
const arrowIcon = require("../../../assets/icons/arrow.png");
const rightArrowIcon = require("../../../assets/icons/right.png");
const cancelIcon = require("../../../assets/icons/cancel.png");
const generalIcon = require("../../../assets/icons/general.png");
const advancedIcon = require("../../../assets/icons/settings.png");
const serverIcon = require("../../../assets/icons/server.png");
const toolIcon = require("../../../assets/icons/tool.png");
const confidentialityIcon = require("../../../assets/icons/confidentiality.png");
const reportsIcon = require("../../../assets/icons/bug.png");
const supportIcon = require("../../../assets/icons/support.png");
const informationIcon = require("../../../assets/icons/information.png");
const githubIcon = require("../../../assets/icons/github.png");
const operaIcon = require("../../../assets/icons/operaicon.png");
const instagramIcon = require("../../../assets/icons/instagram.png");
const tiktokIcon = require("../../../assets/icons/tiktok.png");
const micIcon = require("../../../assets/icons/microphone.png");
const cameraIcon = require("../../../assets/icons/camera.png");
const visionIcon = require("../../../assets/icons/vision.png");
const microIcon = require("../../../assets/icons/micro.png");
const brainIcon = require("../../../assets/icons/brain.png");
//same icons as the model drawer
const LITERT_CAPABILITY_ICONS = {
  vision: visionIcon,
  audio: microIcon,
  thinking: brainIcon,
};
const photoIcon = require("../../../assets/icons/photo.png");
const locationIcon = require("../../../assets/icons/location.png");
const calendarIcon = require("../../../assets/icons/calendar.png");
const binIcon = require("../../../assets/icons/bin.png");
const exportIcon = require("../../../assets/icons/export.png");
const messageIcon = require("../../../assets/icons/message.png");
const timeIcon = require("../../../assets/icons/time.png");
const errorIcon = require("../../../assets/icons/error.png");
const ollamaErrorImage = require("../../../assets/images/ImageCard/OllamaError.png");
const infoIcon = require("../../../assets/icons/info.png");
const reconnectIcon = require("../../../assets/icons/reconnect.png");
const hyperlinkIcon = require("../../../assets/icons/hyperlink2.png");

const DRAWER_SYNC_DELAY_MS = 1500;

//downloads tick per chunk, repaint on whole percents or twice a second
function throttleProgress<T extends { progress: number }>(
  set: Dispatch<SetStateAction<T | null>>,
) {
  let lastPercent = -1;
  let lastTime = 0;
  return (value: T) => {
    const percent = Math.floor(value.progress * 100);
    const now = Date.now();
    if (percent === lastPercent && now - lastTime < 500) return;
    lastPercent = percent;
    lastTime = now;
    set(value);
  };
}

//plugin help shows the first sentence only
function shortDescription(text: string) {
  const first = text
    .trim()
    .split(/\.\s|\n/)[0]
    .replace(/[\s.:;,]+$/, "");
  return first ? `${first}.` : "";
}

const appVersion = Constants.expoConfig?.version ?? "1.0.0";

const MOBILE_TOOL_NAMES = new Set([
  "contact",
  "calendar",
  "settings",
  "timer",
  "clipboard",
  "send_message",
  "open_app",
]);

type SettingsDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  initialSubPage?: SubPage;
};

export type SubPage =
  | "main"
  | "general"
  | "advanced"
  | "maestro"
  | "assistantoverlay"
  | "service"
  | "beta"
  | "local"
  | "litert"
  | "litertmodel"
  | "ollama"
  | "ollamaserver"
  | "openai"
  | "openaiserver"
  | "confidentiality"
  | "reports"
  | "tools"
  | "widgets"
  | "voice"
  | "profile"
  | "profileedit"
  | "cloud"
  | "mobileactions"
  | "mcpservers"
  | "mcpserver"
  | "mcpserversettings"
  | "sociallinks";

//page a subpage steps back to, followed by the header arrow and the android back button
const SUB_PAGE_PARENT: Record<SubPage, SubPage> = {
  main: "main",
  general: "main",
  voice: "general",
  advanced: "main",
  maestro: "main",
  assistantoverlay: "maestro",
  service: "main",
  beta: "service",
  local: "service",
  litert: "service",
  litertmodel: "litert",
  ollama: "service",
  ollamaserver: "ollama",
  openai: "service",
  openaiserver: "openai",
  confidentiality: "main",
  reports: "main",
  tools: "main",
  profile: "main",
  profileedit: "profile",
  cloud: "main",
  sociallinks: "main",
  widgets: "tools",
  mobileactions: "tools",
  mcpservers: "tools",
  mcpserver: "mcpservers",
  mcpserversettings: "mcpserver",
};

const subPageParent = (page: SubPage) =>
  page === "main" ? null : SUB_PAGE_PARENT[page];

type LitertPage = "browse" | "search" | "model";

export default function SettingsDrawer({
  visible,
  onClose,
  onDataChanged,
  isLargeScreen = false,
  isDesktop = false,
  initialSubPage,
}: SettingsDrawerProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { width } = useResponsive();
  const drawerWidth = drawerWidthFor(width);
  const progress = settingsProgress;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            gestureState.dx > 10 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
          );
        },
        onPanResponderMove: (_, gestureState) => {
          dragDrawer(progress, 1 - gestureState.dx / drawerWidth);
        },
        onPanResponderRelease: (_, gestureState) => {
          const open = releaseOpens(
            1 - gestureState.dx / drawerWidth,
            -gestureState.vx,
          );
          settleDrawer(
            progress,
            open,
            -gestureVelocity(gestureState.vx, drawerWidth),
          );
          if (!open) onClose();
        },
        onPanResponderTerminate: () => {
          settleDrawer(progress, true);
        },
      }),
    [onClose, drawerWidth, progress],
  );

  const [activeSubPage, setActiveSubPage] = useState<SubPage>(
    initialSubPage ?? "main",
  );

  //entry page swaps in before paint, never while sliding out
  const [prevVisible, setPrevVisible] = useState(visible);
  const [prevInitialSubPage, setPrevInitialSubPage] = useState(initialSubPage);
  if (visible !== prevVisible || initialSubPage !== prevInitialSubPage) {
    setPrevVisible(visible);
    setPrevInitialSubPage(initialSubPage);
    if (visible) setActiveSubPage(initialSubPage ?? "main");
  }

  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    //page stays mounted while closing, its input would keep the keyboard
    if (!visible && wasVisibleRef.current) Keyboard.dismiss();
    wasVisibleRef.current = visible;
  }, [visible]);

  //native back navigates back in the menu, then lets parent close the drawer
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (activeSubPage === "main") return false;
      setActiveSubPage(SUB_PAGE_PARENT[activeSubPage]);
      return true;
    });
    return () => sub.remove();
  }, [visible, activeSubPage]);

  const [isScrolled, setIsScrolled] = useState(false);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);

  const handleBack = useCallback(() => {
    if (activeSubPage === "main") {
      onClose();
    } else {
      setActiveSubPage(SUB_PAGE_PARENT[activeSubPage]);
    }
  }, [activeSubPage, onClose]);

  useEffect(() => {
    //a jump while sliding out would show
    if (!visible) return;
    setIsScrolled(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeSubPage, visible]);

  //detect scroll to morph button
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const scrolled = y > 10;
      setIsScrolled((prev) => (prev !== scrolled ? scrolled : prev));
    },
    [],
  );

  const [language, setLanguageState] = useState("en");
  const [theme, setThemeState] = useState("system");
  const [aiService, setAiServiceState] = useState("ollama");
  const [localAvailable, setLocalAvailable] = useState(false);
  const [localSheet, setLocalSheet] = useState<LocalModelSheet | null>(null);
  const [localDownload, setLocalDownload] = useState<{
    progress: number;
    sizeStr: string;
  } | null>(null);
  const [selectedLocalModelId, setSelectedLocalModelId] = useState<
    string | null
  >(null);
  const [localGridWidth, setLocalGridWidth] = useState(0);
  const [cardGridWidth, setCardGridWidth] = useState(0);
  const selectedLocalModel =
    localSheet?.models.find((m) => m.id === selectedLocalModelId) ?? null;
  const [ollamaUrl, setOllamaUrlState] = useState("");
  const [ollamaServers, setOllamaServersState] = useState<OllamaServer[]>([]);
  const [enabledProviders, setEnabledProvidersState] = useState<string[]>([]);
  const [modelFailover, setModelFailoverState] = useState(true);
  //unreachable server url
  const [serverErrors, setServerErrors] = useState<Record<string, boolean>>({});
  //opened server index in the list
  const [ollamaDetailIndex, setOllamaDetailIndex] = useState<number | null>(
    null,
  );
  //raw text of the tuning fields
  const [ollamaContextDraft, setOllamaContextDraft] = useState("");
  const [ollamaKeepAliveDraft, setOllamaKeepAliveDraft] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  //ignore stale server answers
  const ollamaModelsRequest = useRef(0);
  const [openaiServers, setOpenAIServersState] = useState<OllamaServer[]>([]);
  const [openaiDetailIndex, setOpenAIDetailIndex] = useState<number | null>(
    null,
  );
  const [openaiModels, setOpenAIModels] = useState<string[]>([]);
  const [openaiModelsLoading, setOpenAIModelsLoading] = useState(false);
  const openaiModelsRequest = useRef(0);
  //key text saved on blur
  const [openaiKeyDraft, setOpenAIKeyDraft] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastSyncSize, setLastSyncSize] = useState<number | null>(null);

  const [addModelSheetVisible, setAddModelSheetVisible] = useState(false);
  const [ollamaAddVisible, setOllamaAddVisible] = useState(false);
  const [openaiAddVisible, setOpenAIAddVisible] = useState(false);
  const [mcpAddVisible, setMcpAddVisible] = useState(false);
  const [litertDownloadVisible, setLitertDownloadVisible] = useState(false);
  //id outlives the close so the sheet keeps its content
  const [cloudSetupVisible, setCloudSetupVisible] = useState(false);
  const [cloudSetupId, setCloudSetupId] = useState("");
  const [addModelScrolled, setAddModelScrolled] = useState(false);
  const [litertPage, setLitertPage] = useState<LitertPage>("browse");
  //model steps back to the list it came from
  const [litertModelFrom, setLitertModelFrom] = useState<"browse" | "search">(
    "browse",
  );
  const [litertDetail, setLitertDetail] = useState<{
    repoId: string;
    entry: CatalogEntry | null;
    loading: boolean;
    //undefined while the card loads
    description?: string | null;
  } | null>(null);
  //installed model shown on its own subpage
  const [installedModel, setInstalledModel] = useState<{
    id: string;
    description?: string | null;
  } | null>(null);
  const addModelScrollRef = useRef<ScrollView>(null);
  const profileCardRef = useRef<View>(null);
  //measured width, the slide's push distance
  const [litertBodyWidth, setLitertBodyWidth] = useState(320);

  //open sheets keep the back press for themselves
  const sheetOpen =
    addModelSheetVisible ||
    ollamaAddVisible ||
    openaiAddVisible ||
    mcpAddVisible ||
    litertDownloadVisible ||
    cloudSetupVisible ||
    selectedLocalModel !== null;

  const [hfModelInput, setHfModelInput] = useState("");
  //entry fields hand their focus to the search page
  const [litertSearchHandoff, setLitertSearchHandoff] = useState(false);
  const [litertForceLoad, setLitertForceLoadState] = useState(false);
  const [litertContextLength, setLitertContextLengthState] = useState("8192");
  const [installedLitertModels, setInstalledLitertModels] = useState<
    LiteRTModelInfo[]
  >([]);
  const [downloadingLitert, setDownloadingLitert] = useState<string | null>(
    null,
  );
  const [litertDownloadProgress, setLitertDownloadProgress] =
    useState<LiteRTDownloadSnapshot | null>(null);
  //families browse as carousels
  const [litertFamilies, setLitertFamilies] = useState<ModelFamily[]>([]);
  const [litertSearchResults, setLitertSearchResults] = useState<
    CatalogEntry[]
  >([]);
  const [litertBrowserLoading, setLitertBrowserLoading] = useState(false);
  const [litertBrowserFailed, setLitertBrowserFailed] = useState(false);
  //kept apart so the catalog never shows a search state
  const [litertSearchLoading, setLitertSearchLoading] = useState(false);
  const [litertSearchFailed, setLitertSearchFailed] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  //sheet may grow up to just under the status bar
  const sheetMaxHeight = windowHeight - insets.top - Spacing.xl2;
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [exportScopeVisible, setExportScopeVisible] = useState(false);
  const [exportSelection, setExportSelection] = useState({
    settings: true,
    conversations: true,
  });
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    icon?: ImageSourcePropType;
    image?: ImageSourcePropType;
    messageAlign?: "left" | "center";
    buttons?: ModalButton[];
    showInput?: boolean;
    inputValue?: string;
    onInputChange?: (text: string) => void;
    inputPlaceholder?: string;
    inputSecureTextEntry?: boolean;
    inputKeyboardType?: any;
    loading?: boolean;
  }>({ title: "", message: "" });

  const showAlert = (
    title: string,
    message: string,
    buttons?: ModalButton[],
    extraProps?: any,
  ) => {
    setAlertConfig({ title, message, buttons, ...extraProps });
    setAlertModalVisible(true);
  };
  //empty id means chores follow the main model
  const [quickFlowId, setQuickFlowIdState] = useState("");
  const [quickFlowOptions, setQuickFlowOptions] = useState<SelectorOption[]>(
    [],
  );
  const [whisperModel, setWhisperModelState] = useState("none");
  const [, setWhisperInstalled] = useState<boolean>(false);
  const [installedWhisperModels, setInstalledWhisperModels] = useState<
    Record<string, boolean>
  >({});
  const [isDownloadingWhisper, setIsDownloadingWhisper] = useState(false);
  const [whisperDownloadProgress, setWhisperDownloadProgress] = useState<{
    progress: number;
    etaSeconds: number;
    speedStr: string;
    sizeStr: string;
  } | null>(null);
  const [ttsEngine, setTtsEngineState] = useState("system");
  const [ttsVoice, setTtsVoiceState] = useState("");
  const [ttsSpeed, setTtsSpeedState] = useState("1");
  const [installedEngines, setInstalledEngines] = useState<
    Record<string, boolean>
  >({});
  const [downloadingEngine, setDownloadingEngine] = useState<string | null>(
    null,
  );
  const [engineDownloadProgress, setEngineDownloadProgress] = useState<{
    progress: number;
    sizeStr: string;
  } | null>(null);
  const [, setWhisperLanguageState] = useState(() => {
    try {
      return (
        Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0] || "auto"
      );
    } catch {
      return "auto";
    }
  });
  const notices = useSettingsNotices(visible);
  const report = useBugReport(showAlert);
  const [instruction, setInstructionState] = useState("");
  const [name, setNameState] = useState("");
  //only feeds the card's look, so it doesn't redesign on every keystroke
  const [confirmedName, setConfirmedName] = useState("");
  const [alwaysWhisper, setAlwaysWhisperState] = useState(false);
  const [autoSpeak, setAutoSpeakState] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetailsState] = useState(false);
  const [showDetectionBoxes, setShowDetectionBoxesState] = useState(false);
  const [advancedMode, setAdvancedModeState] = useState(false);
  const [useAppContext, setUseAppContextState] = useState(true);
  const [autoStartMic, setAutoStartMicState] = useState(true);
  const [shareInstanceUrl, setShareInstanceUrlState] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  //plugin enabled states (tool name or widget id -> bool)
  const [pluginStates, setPluginStates] = useState<Record<string, boolean>>({});

  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  //mirrored from secret store for editing
  const [mcpHeaderValues, setMcpHeaderValues] = useState<
    Record<string, string>
  >({});
  const [mcpConnecting, setMcpConnecting] = useState<Record<string, boolean>>(
    {},
  );
  //shared draft for the add form
  const [serverDraft, setServerDraft] = useState({
    name: "",
    url: "",
    headerName: "",
    headerValue: "",
    clientId: "",
  });
  const [serverDraftBusy, setServerDraftBusy] = useState(false);
  //active detail server
  const [mcpDetailId, setMcpDetailId] = useState<string | null>(null);
  //triggers repaint on connection change
  const [mcpTick, setMcpTick] = useState(0);

  const allTools: ITool[] = ToolManager.getBuiltInTools();
  const generalTools = allTools.filter(
    (t) => !MOBILE_TOOL_NAMES.has(t.definition.function.name),
  );
  const mobileTools = allTools.filter((t) =>
    MOBILE_TOOL_NAMES.has(t.definition.function.name),
  );
  const allWidgets: IWidget[] = WidgetManager.getAllWidgets();

  const [cloudProvider, setCloudProvider] = useState<string>("none");
  const [cloudUserInfo, setCloudUserInfo] = useState<CloudUserInfo | null>(
    null,
  );
  const [hasSyncPin, setHasSyncPin] = useState(false);
  const [hasCloudBackup, setHasCloudBackup] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const languageOptions = [
    { id: "en", label: "English" },
    { id: "fr", label: "Français" },
  ];

  const cloudStorageOptions = [
    { id: "none", label: t("settings.cloud.none") },
    ...CLOUD_PROVIDERS.map((def) => ({ id: def.id, label: def.label })),
  ];

  const ollamaKeepAliveOptions = [
    { id: "300", label: "5m" },
    { id: "900", label: "10m" },
    { id: "1800", label: "30m" },
    { id: "3600", label: "1h" },
    { id: "7200", label: "2h" },
    { id: "18000", label: "5h" },
    { id: "43200", label: "12h" },
    { id: "86400", label: "24h" },
    { id: "-1", label: "∞" },
  ];

  //first step must fit the system prompt
  const withContextFloor = (
    service: string,
    options: { id: string; label: string }[],
  ) => {
    const floor = contextFloorTokens(service, instruction);
    return [
      { id: String(floor), label: `${(floor / 1024).toFixed(1)}k` },
      ...options.filter((o) => Number(o.id) > floor),
    ];
  };

  const litertContextLengthOptions = withContextFloor("litert", [
    { id: "1024", label: "1k" },
    { id: "2048", label: "2k" },
    { id: "4096", label: "4k" },
    { id: "8192", label: "8k" },
  ]);

  const ollamaContextLengthOptions = withContextFloor("ollama", [
    { id: "8192", label: "8k" },
    { id: "16384", label: "16k" },
    { id: "32768", label: "32k" },
    { id: "65536", label: "64k" },
    { id: "131072", label: "128k" },
    { id: "262144", label: "256k" },
    { id: "524288", label: "512k" },
  ]);

  type PermissionState = "granted" | "denied" | "undetermined";
  const [permissionStatuses, setPermissionStatuses] = useState<
    Record<
      "microphone" | "camera" | "location" | "photos" | "contacts" | "calendar",
      PermissionState
    >
  >({
    microphone: "undetermined",
    camera: "undetermined",
    location: "undetermined",
    photos: "undetermined",
    contacts: "undetermined",
    calendar: "undetermined",
  });

  const refreshPermissionStatuses = useCallback(async () => {
    const [mic, camera, location, photos, contacts, calendar] =
      await Promise.all([
        ExpoSpeechRecognitionModule.getPermissionsAsync().catch(() => null),
        ImagePicker.getCameraPermissionsAsync().catch(() => null),
        Location.getForegroundPermissionsAsync().catch(() => null),
        MediaLibrary.getPermissionsAsync().catch(() => null),
        Contacts.getPermissionsAsync().catch(() => null),
        Calendar.getCalendarPermissions().catch(() => null),
      ]);
    setPermissionStatuses({
      microphone: (mic?.status as PermissionState) ?? "undetermined",
      camera: (camera?.status as PermissionState) ?? "undetermined",
      location: (location?.status as PermissionState) ?? "undetermined",
      photos: (photos?.status as PermissionState) ?? "undetermined",
      contacts: (contacts?.status as PermissionState) ?? "undetermined",
      calendar: (calendar?.status as PermissionState) ?? "undetermined",
    });
  }, []);

  //keep badges in sync after the user flips a permission in system settings
  useEffect(() => {
    if (
      !visible ||
      activeSubPage !== "confidentiality" ||
      Platform.OS === "web"
    )
      return;
    refreshPermissionStatuses();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermissionStatuses();
    });
    return () => sub.remove();
  }, [visible, activeSubPage, refreshPermissionStatuses]);

  //null means no assistant role here
  const [assistantStatus, setAssistantStatus] = useState<boolean | null>(null);

  const refreshAssistantStatus = useCallback(() => {
    isDefaultAssistant()
      .then(setAssistantStatus)
      .catch(() => {});
  }, []);

  //recheck after returning from system settings
  useEffect(() => {
    if (!visible || activeSubPage !== "assistantoverlay") return;
    refreshAssistantStatus();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshAssistantStatus();
    });
    return () => sub.remove();
  }, [visible, activeSubPage, refreshAssistantStatus]);

  const renderPermissionBadge = (status: PermissionState) => (
    <View
      style={[
        styles.permissionBadge,
        status === "granted" && styles.permissionBadgeAllowed,
      ]}
    >
      <Text
        style={[
          styles.permissionBadgeText,
          status === "granted" && styles.permissionBadgeTextAllowed,
        ]}
      >
        {status === "granted"
          ? t("permissions.allowed")
          : status === "denied"
            ? t("permissions.denied")
            : t("permissions.undefined")}
      </Text>
    </View>
  );

  const handleExportData = () => {
    setExportSelection({ settings: true, conversations: true });
    setExportScopeVisible(true);
  };

  const runExport = async (
    includeSettings: boolean,
    includeConversations: boolean,
  ) => {
    setExportScopeVisible(false);
    try {
      const ok = await BackupService.exportData({
        includeSettings,
        includeConversations,
      });
      if (ok)
        showAlert(t("settings.data.export"), t("settings.data.exportSuccess"));
    } catch {
      showAlert(t("common.error"), t("settings.data.exportFailed"));
    }
  };

  const handleImportData = async () => {
    try {
      const result = await BackupService.importData();
      if (result.success) {
        onDataChanged?.();
        showAlert(
          t("settings.data.import"),
          result.warning ?? t("settings.data.importSuccess"),
        );
      }
    } catch (e) {
      const message =
        e instanceof Error && e.message
          ? e.message
          : t("settings.data.importFailed");
      showAlert(t("common.error"), message);
    }
  };

  const handleDeleteAllConversations = () => {
    showAlert(
      t("settings.data.deleteAll.title"),
      t("settings.data.deleteAll.message"),
      [
        {
          text: t("settings.data.deleteAll.confirm"),
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            try {
              await BackupService.deleteAllConversations();
              onDataChanged?.();
              showAlert(t("common.done"), t("settings.data.deleteAll.success"));
            } catch {
              showAlert(t("common.error"), t("settings.data.deleteAll.failed"));
            }
          },
        },
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
      ],
    );
  };

  const handleDeleteWhisper = () => {
    if (whisperModel === "none") return;
    showAlert(
      t("settings.whisper.delete.title"),
      t("settings.whisper.delete.message", { model: whisperModel }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("common.delete"),
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            try {
              await WhisperSTT.deleteModel(whisperModel);
              setWhisperInstalled(false);
              setInstalledWhisperModels((prev) => ({
                ...prev,
                [whisperModel]: false,
              }));
            } catch (e) {
              console.error("Failed to delete whisper model", e);
            }
          },
        },
      ],
    );
  };

  const whisperModelOptions = [
    { id: "none", label: t("settings.whisper.none") },
    {
      id: "tiny",
      label: t("settings.whisper.tiny"),
      isDownload: !installedWhisperModels["tiny"],
      ...(installedWhisperModels["tiny"] && whisperModel === "tiny"
        ? {
            rightIcon: deleteIcon,
            rightIconTintColor: Colors.surface,
            onRightIconPress: handleDeleteWhisper,
          }
        : {}),
    },
    {
      id: "base",
      label: t("settings.whisper.base"),
      isDownload: !installedWhisperModels["base"],
      ...(installedWhisperModels["base"] && whisperModel === "base"
        ? {
            rightIcon: deleteIcon,
            rightIconTintColor: Colors.surface,
            onRightIconPress: handleDeleteWhisper,
          }
        : {}),
    },
    {
      id: "small",
      label: t("settings.whisper.small"),
      isDownload: !installedWhisperModels["small"],
      ...(installedWhisperModels["small"] && whisperModel === "small"
        ? {
            rightIcon: deleteIcon,
            rightIconTintColor: Colors.surface,
            onRightIconPress: handleDeleteWhisper,
          }
        : {}),
    },
  ];

  const getWhisperSize = (model: string) => {
    switch (model) {
      case "tiny":
        return "31 MB";
      case "base":
        return "57 MB";
      case "small":
        return "180 MB";
      default:
        return "";
    }
  };

  const ttsEngines = supportedEngineIds();
  const engineName = (id: string) =>
    t(TTS_ENGINE_KEYS[id as keyof typeof TTS_ENGINE_KEYS]);

  const setTtsEngine = (v: string) => {
    setTtsEngineState(v);
    setTtsVoiceState(getVoice(v));
    Settings.set("ttsEngine", v);
  };

  const setTtsVoice = (v: string) => {
    setTtsVoiceState(v);
    setVoice(ttsEngine, v);
  };

  const setTtsSpeed = (v: string) => {
    setTtsSpeedState(v);
    Settings.set("ttsSpeed", v);
  };

  const handleDownloadEngine = async (id: string) => {
    const engine = NEURAL_ENGINES[id];
    setDownloadingEngine(id);
    setEngineDownloadProgress(null);
    const reportProgress = throttleProgress(setEngineDownloadProgress);
    try {
      await engine.download((progress) =>
        reportProgress({
          progress,
          sizeStr: `${formatBytes(progress * engine.sizeBytes)} / ${formatBytes(engine.sizeBytes)}`,
        }),
      );
      setInstalledEngines((prev) => ({ ...prev, [id]: true }));
      setTtsEngine(id);
      showAlert(
        t("common.success"),
        t("settings.tts.downloadSuccess", { engine: engineName(id) }),
      );
    } catch (e) {
      console.error(`Failed to download ${id} voice`, e);
      showAlert(
        t("common.error"),
        t("settings.tts.downloadFailed", { engine: engineName(id) }),
      );
    } finally {
      setDownloadingEngine(null);
      setEngineDownloadProgress(null);
    }
  };

  const handleSelectTtsEngine = (v: string) => {
    if (v === "system" || installedEngines[v]) {
      setTtsEngine(v);
      return;
    }
    if (downloadingEngine) return;
    showAlert(
      t("settings.tts.download.title", { engine: engineName(v) }),
      t("settings.tts.download.message", {
        engine: engineName(v),
        size: formatBytes(NEURAL_ENGINES[v].sizeBytes),
      }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("settings.tts.download.confirm"),
          onPress: () => {
            setAlertModalVisible(false);
            handleDownloadEngine(v);
          },
        },
      ],
    );
  };

  const handleDeleteEngine = (id: string) => {
    showAlert(
      t("settings.tts.delete.title", { engine: engineName(id) }),
      t("settings.tts.delete.message", { engine: engineName(id) }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("common.delete"),
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            try {
              await NEURAL_ENGINES[id].remove();
              setInstalledEngines((prev) => ({ ...prev, [id]: false }));
              setTtsEngine("system");
            } catch (e) {
              console.error(`Failed to delete ${id} voice`, e);
            }
          },
        },
      ],
    );
  };

  const ttsEngineOptions = [
    { id: "system", label: t("settings.tts.system") },
    ...ttsEngines.map((id) => ({
      id,
      label: engineName(id),
      isDownload: !installedEngines[id],
      ...(installedEngines[id] && ttsEngine === id
        ? {
            rightIcon: deleteIcon,
            rightIconTintColor: Colors.surface,
            onRightIconPress: () => handleDeleteEngine(id),
          }
        : {}),
    })),
  ];

  const ttsVoiceOptions =
    NEURAL_ENGINES[ttsEngine]?.voiceOptions(language) ?? [];
  //kokoro may lack the slot
  const selectedTtsVoice = ttsVoiceOptions.some((o) => o.id === ttsVoice)
    ? ttsVoice
    : (ttsVoiceOptions[0]?.id ?? "");

  const ttsSpeedOptions = TTS_SPEEDS.map((id) => ({ id, label: `${id}×` }));

  useEffect(() => {
    const loadSettings = async () => {
      try {
        await Settings.init();
        const s = await Settings.load();
        setLanguageState(s.language || "en");
        setThemeState(s.theme);
        setAiServiceState(s.aiService);
        setOllamaUrlState(s.ollamaUrl);
        setOllamaServersState(getOllamaServers());
        setOpenAIServersState(getOpenAIServers());
        setEnabledProvidersState(getEnabledProviders());
        setQuickFlowIdState(
          s.quickFlowModel
            ? quickFlowOptionId(
                s.quickFlowService,
                s.quickFlowUrl,
                s.quickFlowModel,
              )
            : "",
        );
        setWhisperModelState(s.whisperModel);
        setWhisperLanguageState(s.whisperLanguage);
        setInstructionState(s.instruction);
        setNameState(s.name || "");
        setConfirmedName(s.name || "");
        setAlwaysWhisperState(s.alwaysWhisper);
        setAutoSpeakState(s.autoSpeak);
        setTtsEngineState(s.ttsEngine);
        setTtsVoiceState(getVoice(s.ttsEngine));
        setTtsSpeedState(s.ttsSpeed);
        setInstalledEngines(
          Object.fromEntries(
            supportedEngineIds().map((id) => [
              id,
              NEURAL_ENGINES[id].isInstalled(),
            ]),
          ),
        );
        setShowTechnicalDetailsState(s.showTechnicalDetails);
        setShowDetectionBoxesState(s.showDetectionBoxes);
        setAdvancedModeState(s.advancedMode);
        setUseAppContextState(s.useAppContext);
        setAutoStartMicState(s.autoStartMic);
        setModelFailoverState(s.modelFailover);
        setShareInstanceUrlState(s.shareInstanceUrl || "");
        setLitertForceLoadState(s.litertForceLoad);
        setLitertContextLengthState(String(s.litertContextLength));
        //installed read is synchronous while rendering
        await hydrateLiteRTCatalog();
        setInstalledLitertModels(getInstalledLiteRTModels());
        //apply to services
        const tuning = getOllamaTuning(s.ollamaUrl);
        AIModule.configure(s.ollamaUrl, tuning.contextLength, tuning.keepAlive);
        AIModule.setMode(s.aiService);
        const localModeAvailable = await AIModule.isModeAvailable("local");
        setLocalAvailable(localModeAvailable);
        //preselect on-device provider if available and no explicit choice saved
        if (localModeAvailable && !(await Settings.has("aiService"))) {
          setAiServiceState("local");
          Settings.set("aiService", "local");
          AIModule.setMode("local");
        }
        WhisperSTT.setLanguage(s.whisperLanguage);
      } catch (e) {
        console.warn("Failed to load settings", e);
      }

      try {
        await CloudSync.init();
        setCloudProvider(CloudSync.getProviderName());
        setHasSyncPin(CloudSync.hasPin());
        if (CloudSync.getProviderName() !== "none") {
          const ui = await CloudSync.getUserInfo();
          setCloudUserInfo(ui);
          const time = await CloudSync.getLastSyncTime();
          setLastSyncTime(time);
          const size = await CloudSync.getLastSyncSize();
          setLastSyncSize(size);
          setHasCloudBackup(await CloudSync.hasCloudBackup());
        }
      } catch (e) {
        console.warn("Failed to init CloudSync", e);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  //all reachable models, one row each
  useEffect(() => {
    if (activeSubPage !== "advanced") return;
    let cancelled = false;
    (async () => {
      const sources = buildSources(localAvailable);
      const rows: SelectorOption[] = [
        { id: "", label: t("settings.quickFlow.sameAsMain") },
      ];
      //query all sources in parallel
      const modelsBySource = await Promise.all(
        sources.map((source) =>
          AIModule.getModelsFor(source.service, source.url),
        ),
      );
      sources.forEach((source, i) => {
        for (const model of [...modelsBySource[i]].sort((a, b) =>
          a.localeCompare(b),
        )) {
          rows.push({
            id: quickFlowOptionId(source.service, source.url, model),
            //source only matters when multiple
            label: sources.length > 1 ? `${model} — ${source.label}` : model,
          });
        }
      });
      if (!cancelled) setQuickFlowOptions(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSubPage, localAvailable, ollamaServers, enabledProviders, t]);

  //built-in facts, read on page open
  useEffect(() => {
    if (activeSubPage !== "local") return;
    let cancelled = false;
    AIModule.getLocalModelSheet()
      .then((sheet) => {
        if (!cancelled) setLocalSheet(sheet);
      })
      .catch((e) => console.warn("Failed to load local model sheet", e));
    return () => {
      cancelled = true;
    };
  }, [activeSubPage]);

  //browsers need a user gesture
  const handleDownloadLocal = async (modelId: string) => {
    setLocalDownload({ progress: 0, sizeStr: "" });
    const reportProgress = throttleProgress(setLocalDownload);
    try {
      await AIModule.downloadFor(
        "local",
        undefined,
        modelId,
        (progress, _eta, _speed, sizeStr) =>
          reportProgress({ progress, sizeStr }),
      );
      setLocalSheet(await AIModule.getLocalModelSheet());
    } catch (e) {
      console.warn("Local model download failed", e);
      showAlert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setLocalDownload(null);
    }
  };

  const handleSelectQuickFlow = (id: string) => {
    setQuickFlowIdState(id);
    const { service, url, model } = parseQuickFlowOptionId(id);
    Settings.setMany({
      quickFlowService: service,
      quickFlowUrl: url,
      quickFlowModel: model,
    });
  };

  //load plugin states when settings tab opens
  useEffect(() => {
    if (
      activeSubPage !== "tools" &&
      activeSubPage !== "widgets" &&
      activeSubPage !== "mobileactions" &&
      activeSubPage !== "mcpserver"
    )
      return;
    const states: Record<string, boolean> = {};
    for (const tool of ToolManager.getAllTools()) {
      const name = tool.definition.function.name;
      states[`tool:${name}`] = PluginRegistry.isEnabled(
        "tool",
        name,
        tool.enabledByDefault ?? false,
      );
    }
    for (const widget of WidgetManager.getAllWidgets()) {
      states[`widget:${widget.id}`] = PluginRegistry.isEnabled(
        "widget",
        widget.id,
        widget.enabledByDefault ?? false,
      );
    }
    setPluginStates(states);
  }, [activeSubPage, mcpTick]);

  //sync list when connections change
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      AppEvents.mcpServersChanged,
      () => {
        setMcpServers([...McpService.getServers()]);
        setMcpTick((t) => t + 1);
      },
    );
    return () => sub.remove();
  }, []);

  //read from secret store on mount
  useEffect(() => {
    if (activeSubPage !== "mcpservers" && activeSubPage !== "mcpserver") return;
    const servers = McpService.getServers();
    //avoid flash of missing headers
    Promise.all(
      servers.map(
        async (server) =>
          [server.id, await McpService.getHeaderValue(server.id)] as const,
      ),
    )
      .then((entries) => {
        setMcpServers([...servers]);
        setMcpHeaderValues(Object.fromEntries(entries));
      })
      .catch(() => setMcpServers([...servers]));
  }, [activeSubPage]);

  //local spinner while connecting
  const connectMcpServer = async (id: string) => {
    setMcpConnecting((prev) => ({ ...prev, [id]: true }));
    try {
      const server = McpService.getServers().find((s) => s.id === id);
      //check if server needs oauth
      if (McpService.getStatus(id).state === "needs_auth")
        await McpService.authorize(id);
      else if (server?.url.trim()) await McpService.connect(id);
    } finally {
      setMcpConnecting((prev) => ({ ...prev, [id]: false }));
    }
  };

  //shared label for list and detail
  //use registry for accurate count
  const mcpEnabledCount = (id: string): number =>
    McpService.getTools(id).filter((tool) =>
      PluginRegistry.isEnabled(
        "tool",
        tool.definition.function.name,
        tool.enabledByDefault ?? false,
      ),
    ).length;

  const mcpStatusLabel = (id: string): string => {
    if (mcpConnecting[id]) return t("settings.mcp.connecting");
    const status = McpService.getStatus(id);
    if (status.state === "connected") {
      const total = status.toolCount;
      if (total === 0) return t("settings.mcp.noTools");
      const enabled = mcpEnabledCount(id);
      //skip count when all enabled
      if (enabled === total)
        return total === 1
          ? t("settings.mcp.oneTool")
          : t("settings.mcp.toolCount", { count: total });
      return t("settings.mcp.toolsEnabled", { enabled, total });
    }
    if (status.state === "needs_auth") return t("settings.mcp.signInRequired");
    if (status.state === "error") return t("settings.mcp.unreachable");
    return t("settings.mcp.notConnected");
  };

  //the sign-in state shows an icon instead of a label
  const mcpNeedsAuth = (id: string): boolean =>
    !mcpConnecting[id] && McpService.getStatus(id).state === "needs_auth";

  //the overlay carries the sign-in itself
  const showMcpAuthInfo = (id: string) =>
    showAlert(
      t("settings.mcp.signInRequired"),
      t("settings.mcp.signInInfo"),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("settings.mcp.signIn"),
          onPress: () => {
            setAlertModalVisible(false);
            connectMcpServer(id);
          },
        },
      ],
      { messageAlign: "left" },
    );

  const refreshMcpHeaders = async () => {
    const entries = await Promise.all(
      McpService.getServers().map(
        async (server) =>
          [server.id, await McpService.getHeaderValue(server.id)] as const,
      ),
    );
    setMcpHeaderValues(Object.fromEntries(entries));
  };

  //server joins only once it answers
  const openMcpAddSheet = () => {
    setServerDraft({
      name: "",
      url: "",
      headerName: "",
      headerValue: "",
      clientId: "",
    });
    setServerDraftBusy(false);
    setMcpAddVisible(true);
  };

  const openOllamaAddSheet = () => {
    setServerDraft({
      name: "",
      url: "",
      headerName: "",
      headerValue: "",
      clientId: "",
    });
    setServerDraftBusy(false);
    setOllamaAddVisible(true);
  };

  const submitMcpDraft = async () => {
    const url = serverDraft.url.trim();
    if (mcpServers.some((s) => s.url.trim() === url)) {
      showAlert(t("settings.server.addFailed"), t("settings.server.duplicate"));
      return;
    }
    setServerDraftBusy(true);
    try {
      await McpService.addServer(serverDraft);
      setMcpServers([...McpService.getServers()]);
      await refreshMcpHeaders();
      setMcpAddVisible(false);
    } catch (e: any) {
      showAlert(
        t("settings.server.addFailed"),
        e?.message || t("settings.mcp.unreachable"),
        undefined,
        { messageAlign: "left" },
      );
    } finally {
      setServerDraftBusy(false);
    }
  };

  const submitOllamaDraft = async () => {
    const url = serverDraft.url.trim();
    if (ollamaServers.some((s) => s.url.trim() === url)) {
      showAlert(t("settings.server.addFailed"), t("settings.server.duplicate"));
      return;
    }
    setServerDraftBusy(true);
    try {
      if (!(await AIModule.isSourceAvailable("ollama", url))) {
        showAlert(
          t("settings.ollama.unreachableTitle"),
          t("settings.ollama.unreachableInfo"),
          undefined,
          { image: ollamaErrorImage, messageAlign: "left" },
        );
        return;
      }
      saveOllamaServers([
        ...ollamaServers,
        { url, name: serverDraft.name.trim() },
      ]);
      //skip waiting for the next sweep
      setServerErrors((prev) => ({ ...prev, [url]: false }));
      setOllamaAddVisible(false);
    } finally {
      setServerDraftBusy(false);
    }
  };

  const openOpenAIAddSheet = () => {
    setServerDraft({
      name: "",
      url: "",
      headerName: "",
      headerValue: "",
      clientId: "",
    });
    setOpenAIKeyDraft("");
    setServerDraftBusy(false);
    setOpenAIAddVisible(true);
  };

  const submitOpenAIDraft = async () => {
    const url = serverDraft.url.trim();
    if (openaiServers.some((s) => s.url.trim() === url)) {
      showAlert(t("settings.server.addFailed"), t("settings.server.duplicate"));
      return;
    }
    setServerDraftBusy(true);
    try {
      //unsaved key probes with the draft
      if (!(await new OpenAIProvider(url, openaiKeyDraft).isAvailable())) {
        showAlert(
          t("settings.ollama.unreachableTitle"),
          t("settings.cloudapi.unreachableInfo"),
          undefined,
          { messageAlign: "left" },
        );
        return;
      }
      const id = newOpenAIServerId();
      await setOpenAIApiKey(id, openaiKeyDraft);
      saveOpenAIServers([
        ...openaiServers,
        { id, url, name: serverDraft.name.trim() },
      ]);
      //skip waiting for the next sweep
      setServerErrors((prev) => ({ ...prev, [url]: false }));
      setOpenAIAddVisible(false);
    } finally {
      setServerDraftBusy(false);
    }
  };

  const saveMcpServer = async (id: string, patch: Partial<McpServerConfig>) => {
    await McpService.updateServer(id, patch);
    setMcpServers([...McpService.getServers()]);
  };

  //empty link drops the server
  const handleMcpUrlBlur = async (id: string, url: string) => {
    if (!url.trim()) {
      await McpService.removeServer(id);
      setMcpServers([...McpService.getServers()]);
      setMcpDetailId(null);
      setActiveSubPage("mcpservers");
      return;
    }
    await saveMcpServer(id, { url });
  };

  const removeMcpServer = (id: string, label: string) => {
    showAlert(
      t("settings.mcp.remove.title"),
      t("settings.mcp.remove.message", { name: label }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("common.remove"),
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            await McpService.removeServer(id);
            setMcpServers([...McpService.getServers()]);
            setActiveSubPage("mcpservers");
          },
        },
      ],
    );
  };

  //save helpers
  const setLanguage = (v: string) => {
    setLanguageState(v);
    Settings.set("language", v);
  };

  const setTheme = (v: string) => {
    setThemeState(v);
    //skips the db round trip lag
    setThemeMode(v as "system" | "light" | "dark");
    Settings.set("theme", v);
  };

  const setAiService = (v: string) => {
    setAiServiceState(v);
    Settings.set("aiService", v);
    AIModule.setMode(v);
  };

  //prefer the given name
  const ollamaServerLabel = (server: OllamaServer): string =>
    server.name.trim() ||
    server.url
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "") ||
    t("settings.ollama.newServer");

  const openAIServerLabel = (index: number): string =>
    openAIServerNames(openaiServers)[index] ||
    ollamaServerLabel(openaiServers[index]);

  //undefined falls back to global
  const serverContextLength = (server: OllamaServer) =>
    server.contextLength && server.contextLength > 0
      ? server.contextLength
      : Settings.getCached().ollamaContextLength;

  const serverKeepAlive = (server: OllamaServer) =>
    server.keepAlive ?? Settings.getCached().ollamaKeepAlive;

  //unknown until the first ping answers
  const ollamaStatusLabel = (server: OllamaServer): string => {
    const url = server.url.trim();
    if (!url) return t("settings.ollama.noLink");
    const failed = serverErrors[url];
    if (failed === undefined) return t("settings.ollama.checking");
    return failed
      ? t("settings.ollama.unreachable")
      : t("settings.ollama.connected");
  };

  //keep active server in the list
  const saveOllamaServers = (servers: OllamaServer[]) => {
    setOllamaServersState(servers);
    Settings.set("ollamaUrls", serializeServers(servers));
    const filled = servers.filter((s) => s.url.trim().length > 0);
    const active =
      filled.find((s) => s.url.trim() === ollamaUrl.trim()) ?? filled[0];
    const activeUrl = active?.url.trim() ?? "";
    if (activeUrl === ollamaUrl) return;
    setOllamaUrlState(activeUrl);
    Settings.set("ollamaUrl", activeUrl);
    if (active)
      AIModule.configure(
        activeUrl,
        serverContextLength(active),
        serverKeepAlive(active),
      );
  };

  const patchOllamaServer = (index: number, patch: Partial<OllamaServer>) => {
    saveOllamaServers(
      ollamaServers.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  //tune only the active server
  const tuneOllamaServer = (index: number, patch: Partial<OllamaServer>) => {
    const next = ollamaServers.map((s, i) =>
      i === index ? { ...s, ...patch } : s,
    );
    saveOllamaServers(next);
    const server = next[index];
    if (server.url.trim() === ollamaUrl.trim()) {
      AIModule.configure(
        server.url.trim(),
        serverContextLength(server),
        serverKeepAlive(server),
      );
    }
  };

  const setOllamaServerContext = (index: number, v: string) => {
    const next = v.replace(/[^0-9]/g, "");
    setOllamaContextDraft(next);
    const parsed = parseInt(next, 10);
    tuneOllamaServer(index, {
      contextLength: isNaN(parsed) ? undefined : parsed,
    });
  };

  //leading minus keeps -1 typable
  const setOllamaServerKeepAlive = (index: number, v: string) => {
    const next = (v.startsWith("-") ? "-" : "") + v.replace(/[^0-9]/g, "");
    setOllamaKeepAliveDraft(next);
    const parsed = parseInt(next, 10);
    tuneOllamaServer(index, { keepAlive: isNaN(parsed) ? undefined : parsed });
  };

  const loadOllamaModels = async (url: string) => {
    const target = url.trim();
    const request = ++ollamaModelsRequest.current;
    if (!target) {
      setOllamaModels([]);
      return;
    }
    setOllamaModelsLoading(true);
    try {
      const models = await AIModule.getModelsFor("ollama", target);
      if (ollamaModelsRequest.current === request) setOllamaModels(models);
    } catch {
      if (ollamaModelsRequest.current === request) setOllamaModels([]);
    } finally {
      if (ollamaModelsRequest.current === request)
        setOllamaModelsLoading(false);
    }
  };

  const openOllamaServer = (index: number) => {
    const server = ollamaServers[index];
    setOllamaDetailIndex(index);
    setOllamaContextDraft(
      server?.contextLength != null ? String(server.contextLength) : "",
    );
    setOllamaKeepAliveDraft(
      server?.keepAlive != null ? String(server.keepAlive) : "",
    );
    setOllamaModels([]);
    loadOllamaModels(server?.url ?? "");
    setActiveSubPage("ollamaserver");
  };

  const removeOllamaServer = (index: number) => {
    const server = ollamaServers[index];
    showAlert(
      t("settings.ollama.remove.title"),
      t("settings.ollama.remove.message", { name: ollamaServerLabel(server) }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("common.remove"),
          style: "danger",
          onPress: () => {
            setAlertModalVisible(false);
            saveOllamaServers(ollamaServers.filter((_, i) => i !== index));
            setOllamaDetailIndex(null);
            setActiveSubPage("ollama");
          },
        },
      ],
    );
  };

  //empty link drops the server
  const handleOllamaUrlBlur = (index: number) => {
    const url = ollamaServers[index]?.url.trim() ?? "";
    if (!url) {
      saveOllamaServers(ollamaServers.filter((_, i) => i !== index));
      setOllamaDetailIndex(null);
      setActiveSubPage("ollama");
      return;
    }
    checkServers();
    loadOllamaModels(url);
  };

  const reconnectOllamaServer = async (index: number) => {
    await checkServers();
    await loadOllamaModels(ollamaServers[index]?.url ?? "");
  };

  //move url only while openai active
  const saveOpenAIServers = (servers: OllamaServer[]) => {
    setOpenAIServersState(servers);
    Settings.set("openaiUrls", serializeServers(servers));
    if (aiService !== OPENAI_PROVIDER_ID) return;
    const filled = servers.filter((s) => s.url.trim().length > 0);
    const active =
      filled.find((s) => s.url.trim() === ollamaUrl.trim()) ?? filled[0];
    const activeUrl = active?.url.trim() ?? "";
    if (activeUrl === ollamaUrl) return;
    setOllamaUrlState(activeUrl);
    Settings.set("ollamaUrl", activeUrl);
    AIModule.configure(activeUrl);
  };

  const patchOpenAIServer = (index: number, patch: Partial<OllamaServer>) => {
    saveOpenAIServers(
      openaiServers.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  const loadOpenAIModels = async (url: string) => {
    const target = url.trim();
    const request = ++openaiModelsRequest.current;
    if (!target) {
      setOpenAIModels([]);
      return;
    }
    setOpenAIModelsLoading(true);
    try {
      const models = await AIModule.getModelsFor(OPENAI_PROVIDER_ID, target);
      if (openaiModelsRequest.current === request) setOpenAIModels(models);
    } catch {
      if (openaiModelsRequest.current === request) setOpenAIModels([]);
    } finally {
      if (openaiModelsRequest.current === request)
        setOpenAIModelsLoading(false);
    }
  };

  const openOpenAIServer = (index: number) => {
    const server = openaiServers[index];
    setOpenAIDetailIndex(index);
    setOpenAIKeyDraft("");
    if (server?.id) getOpenAIApiKeyById(server.id).then(setOpenAIKeyDraft);
    setOpenAIModels([]);
    loadOpenAIModels(server?.url ?? "");
    setActiveSubPage("openaiserver");
  };

  //empty link drops the server
  const handleOpenAIUrlBlur = (index: number) => {
    const server = openaiServers[index];
    const url = server?.url.trim() ?? "";
    if (!url) {
      if (server?.id) setOpenAIApiKey(server.id, "");
      saveOpenAIServers(openaiServers.filter((_, i) => i !== index));
      setOpenAIDetailIndex(null);
      setActiveSubPage("openai");
      return;
    }
    checkServers();
    loadOpenAIModels(url);
  };

  //providers cache the key so rebuild
  const handleOpenAIKeyBlur = async (index: number) => {
    const server = openaiServers[index];
    if (!server) return;
    //legacy entries get an id here
    const id = server.id ?? newOpenAIServerId();
    if (!server.id) patchOpenAIServer(index, { id });
    await setOpenAIApiKey(id, openaiKeyDraft);
    const url = server.url.trim();
    if (aiService === OPENAI_PROVIDER_ID && url === ollamaUrl.trim()) {
      AIModule.configure(url);
    }
    checkServers();
    loadOpenAIModels(url);
  };

  const reconnectOpenAIServer = async (index: number) => {
    await checkServers();
    await loadOpenAIModels(openaiServers[index]?.url ?? "");
  };

  const removeOpenAIServer = (index: number) => {
    const server = openaiServers[index];
    showAlert(
      t("settings.ollama.remove.title"),
      t("settings.ollama.remove.message", { name: openAIServerLabel(index) }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("common.remove"),
          style: "danger",
          onPress: () => {
            setAlertModalVisible(false);
            if (server.id) setOpenAIApiKey(server.id, "");
            saveOpenAIServers(openaiServers.filter((_, i) => i !== index));
            setOpenAIDetailIndex(null);
            setActiveSubPage("openai");
          },
        },
      ],
    );
  };

  const refreshLitertModels = useCallback(() => {
    setInstalledLitertModels(getInstalledLiteRTModels());
  }, []);

  const setLitertForceLoad = (v: boolean) => {
    setLitertForceLoadState(v);
    Settings.set("litertForceLoad", v);
  };

  const setLitertContextLength = (v: string) => {
    setLitertContextLengthState(v);
    const parsed = parseInt(v, 10);
    if (!isNaN(parsed)) Settings.set("litertContextLength", parsed);
  };

  const handleDownloadLitert = async (entry: CatalogEntry) => {
    setAddModelSheetVisible(false);
    setDownloadingLitert(entry.repoId);
    setLitertDownloadProgress(null);
    try {
      //progress arrives through the shared subscription below
      await downloadLiteRTModel(entry.repoId);
    } catch (e) {
      //failures alert, cancels do not
      if (!(e instanceof LiteRTDownloadCancelled)) {
        showAlert(
          t("common.error"),
          e instanceof Error ? e.message : String(e),
        );
      }
    } finally {
      setDownloadingLitert(null);
      setLitertDownloadProgress(null);
      setLitertDownloadVisible(false);
      refreshLitertModels();
    }
  };

  const handleCancelLitert = () => {
    if (downloadingLitert) cancelLiteRTDownload(downloadingLitert);
  };

  const confirmDownloadLitert = (entry: CatalogEntry) => {
    showAlert(
      t("settings.litert.downloadTitle", { name: entry.label }),
      t("settings.litert.downloadMessage", {
        name: entry.label,
        size: formatBytes(entry.sizeBytes),
      }),
      [
        {
          text: t("settings.litert.downloadAction"),
          style: "primary",
          onPress: () => {
            setAlertModalVisible(false);
            handleDownloadLitert(entry);
          },
        },
        {
          text: t("common.cancel"),
          style: "secondary",
          onPress: () => setAlertModalVisible(false),
        },
      ],
    );
  };

  const handleDeleteLitert = (model: LiteRTModelInfo) => {
    showAlert(
      t("settings.litert.deleteTitle", { name: model.label }),
      t("settings.litert.deleteMessage"),
      [
        {
          text: t("common.delete"),
          style: "danger",
          onPress: () => {
            setAlertModalVisible(false);
            try {
              deleteLiteRTModel(model.id);
            } catch (e) {
              console.warn("Could not delete the model:", e);
            }
            refreshLitertModels();
            setInstalledModel(null);
            setActiveSubPage("litert");
          },
        },
        {
          text: t("common.cancel"),
          style: "secondary",
          onPress: () => setAlertModalVisible(false),
        },
      ],
    );
  };

  const openAddModelSheet = async () => {
    setLitertPage("browse");
    setLitertDetail(null);
    setHfModelInput("");
    setLitertSearchHandoff(false);
    setLitertSearchResults([]);
    setAddModelSheetVisible(true);
    //cache paints, hub refreshes behind
    const cached = getCachedFamilies();
    setLitertFamilies(cached);
    setLitertBrowserFailed(false);
    setLitertBrowserLoading(cached.length === 0);
    try {
      setLitertFamilies(await fetchFamilies());
    } catch (e) {
      console.warn("Could not list the hugging face models:", e);
      setLitertBrowserFailed(cached.length === 0);
    } finally {
      setLitertBrowserLoading(false);
    }
  };

  //queries hit the hub, not families
  const runLitertSearch = useCallback(
    async (query: string, signal: AbortSignal) => {
      setLitertSearchFailed(false);
      setLitertSearchLoading(true);
      try {
        const results = await searchModels(query, signal);
        if (!signal.aborted) setLitertSearchResults(results);
      } catch (e) {
        console.warn("Could not search the hugging face models:", e);
        if (!signal.aborted) setLitertSearchFailed(true);
      } finally {
        if (!signal.aborted) setLitertSearchLoading(false);
      }
    },
    [],
  );

  //each page opens at the top
  const showLitertPage = (page: LitertPage) => {
    setAddModelScrolled(false);
    setLitertPage(page);
  };

  //a model found by search steps back to its results
  const openLitertSearch = () => {
    if (litertPage !== "model" || litertModelFrom !== "search") {
      setHfModelInput("");
      setLitertSearchResults([]);
      setLitertSearchLoading(false);
      setLitertSearchFailed(false);
    }
    setLitertSearchHandoff(true);
    showLitertPage("search");
  };

  //sizes resolve on open, not on listing
  const openLitertDetail = async (repoId: string) => {
    //keyboard slides away with the push
    Keyboard.dismiss();
    if (litertPage === "model") {
      //similar model swaps in place
      addModelScrollRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      setLitertModelFrom(litertPage);
    }
    showLitertPage("model");
    setLitertDetail({ repoId, entry: null, loading: true });
    fetchModelDescription(repoId).then((description) =>
      setLitertDetail((prev) =>
        prev?.repoId === repoId ? { ...prev, description } : prev,
      ),
    );
    const entry = await fetchCatalogEntry(repoId);
    setLitertDetail((prev) =>
      prev?.repoId === repoId ? { ...prev, entry, loading: false } : prev,
    );
  };

  const openInstalledLitert = (repoId: string) => {
    setInstalledModel({ id: repoId });
    setActiveSubPage("litertmodel");
    fetchModelDescription(repoId).then((description) =>
      setInstalledModel((prev) =>
        prev?.id === repoId ? { ...prev, description } : prev,
      ),
    );
  };

  const litertFamilyName = (family: ModelFamily) =>
    family.id === OTHER_FAMILY_ID
      ? t("settings.litert.familyOther")
      : family.label;

  const setProviderEnabled = (id: string, enabled: boolean) => {
    const next = enabled
      ? [...enabledProviders.filter((p) => p !== id), id]
      : enabledProviders.filter((p) => p !== id);
    setEnabledProvidersState(next);
    Settings.set("enabledProviders", serializeProviders(next));
    //the active service has to stay on an enabled provider
    if (!enabled && aiService === id && next.length > 0) {
      setAiService(next[0]);
    } else if (enabled && !enabledProviders.includes(aiService)) {
      setAiService(id);
    }
  };

  //dead downloads resume from disk
  useEffect(() => {
    if (activeSubPage !== "litert" || downloadingLitert) return;
    let dropped = false;
    getPendingLiteRTDownload().then((pending) => {
      if (dropped || !pending) return;
      const entry = getCatalogEntry(pending);
      if (entry?.url) handleDownloadLitert(entry);
    });
    return () => {
      dropped = true;
    };
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubPage]);

  //typing settles before a round trip
  useEffect(() => {
    const query = hfModelInput.trim();
    if (!addModelSheetVisible || query.length < MIN_SEARCH_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => runLitertSearch(query, controller.signal),
      400,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [hfModelInput, addModelSheetVisible, runLitertSearch]);

  //external downloads still drive this bar
  useEffect(() => {
    const reportProgress = throttleProgress(setLitertDownloadProgress);
    return subscribeLiteRTDownload((modelId, snapshot) => {
      if (snapshot) {
        setDownloadingLitert(modelId);
        reportProgress(snapshot);
      } else {
        setDownloadingLitert((current) =>
          current === modelId ? null : current,
        );
        setLitertDownloadProgress(null);
        setLitertDownloadVisible(false);
        refreshLitertModels();
      }
    });
  }, [refreshLitertModels]);

  const setWhisperModel = (v: string) => {
    setWhisperModelState(v);
    Settings.set("whisperModel", v);
    if (v && v !== "none") {
      WhisperSTT.isModelInstalled(v).then((installed) => {
        setWhisperInstalled(installed);
        setInstalledWhisperModels((prev) => ({ ...prev, [v]: installed }));
        if (installed) {
          WhisperSTT.init(v).then((success) => {
            if (!success) {
              showAlert(
                t("common.error"),
                t("settings.whisper.loadFailed", { model: v }),
              );
              setWhisperInstalled(false);
              setInstalledWhisperModels((prev) => ({ ...prev, [v]: false }));
            }
          });
        }
      });
    } else {
      setWhisperInstalled(false);
    }
  };

  const setInstruction = (v: string) => {
    setInstructionState(v);
    Settings.set("instruction", v);
  };

  const setName = (v: string) => {
    setNameState(v);
    Settings.set("name", v);
  };

  const setShareInstanceUrl = (v: string) => {
    setShareInstanceUrlState(v);
    Settings.set("shareInstanceUrl", v.trim());
  };

  const setAlwaysWhisper = (v: boolean) => {
    setAlwaysWhisperState(v);
    Settings.set("alwaysWhisper", v);
  };

  const setAutoSpeak = (v: boolean) => {
    setAutoSpeakState(v);
    Settings.set("autoSpeak", v);
  };

  const setShowTechnicalDetails = (v: boolean) => {
    setShowTechnicalDetailsState(v);
    Settings.set("showTechnicalDetails", v);
  };

  const setShowDetectionBoxes = (v: boolean) => {
    setShowDetectionBoxesState(v);
    Settings.set("showDetectionBoxes", v);
  };

  const setAdvancedMode = (v: boolean) => {
    setAdvancedModeState(v);
    Settings.set("advancedMode", v);
  };

  const setModelFailover = (v: boolean) => {
    setModelFailoverState(v);
    Settings.set("modelFailover", v);
  };

  const setUseAppContext = (v: boolean) => {
    setUseAppContextState(v);
    Settings.set("useAppContext", v);
  };

  const setAutoStartMic = (v: boolean) => {
    setAutoStartMicState(v);
    Settings.set("autoStartMic", v);
  };

  //same modal stays open between cloud steps
  const showCloudProgress = (
    message: string,
    providerName = CloudSync.getProviderName(),
  ) => {
    showAlert(
      getCloudProviderDefinition(providerName)?.label ??
        t("settings.cloud.storage"),
      message,
      undefined,
      { loading: true, messageAlign: "center" },
    );
  };

  const completeCloudConnect = async (v: string) => {
    const pinSet = CloudSync.hasPin();
    setHasSyncPin(pinSet);
    if (v !== "none") {
      const ui = await CloudSync.getUserInfo();
      setCloudUserInfo(ui);

      //paused account resumes with its stored pin
      if (pinSet) {
        showCloudProgress(t("cloudSync.syncing"));
        handleSyncNow();
        return;
      }

      //wait to avoid ui lag
      setTimeout(async () => {
        showCloudProgress(t("settings.cloud.progress.checking"));
        const cloudBackupExists = await CloudSync.hasCloudBackup();
        setHasCloudBackup(cloudBackupExists);
        if (cloudBackupExists) {
          handleUnlockSyncPin();
        } else {
          handleCreateSyncPin();
        }
      }, 100);
    } else {
      setCloudUserInfo(null);
      setHasSyncPin(false);
      setHasCloudBackup(false);
    }
  };

  const connectProvider = async (providerName: string) => {
    setCloudProvider(providerName);
    showCloudProgress(t("settings.cloud.progress.connecting"), providerName);
    const success = await CloudSync.setProvider(providerName);
    if (success) {
      await completeCloudConnect(providerName);
    } else {
      setCloudProvider("none");
      setCloudUserInfo(null);
      showAlert(
        t("settings.cloud.connectionError"),
        t("settings.cloud.connectFailed", {
          provider:
            getCloudProviderDefinition(providerName)?.label ?? providerName,
        }),
      );
    }
  };

  const handleSetCloudProvider = async (v: string) => {
    if (v === "none") {
      setCloudProvider("none");
      const success = await CloudSync.setProvider("none");
      if (success) {
        await completeCloudConnect("none");
      }
      return;
    }

    const def = getCloudProviderDefinition(v);
    if (!def) return;

    //setup happens in a sheet, current storage stays until it connects
    if (def.SetupComponent && !(await CloudSync.isProviderConfigured(v))) {
      setCloudSetupId(v);
      setCloudSetupVisible(true);
      return;
    }

    await connectProvider(v);
  };

  const handleDisconnectCloud = () => {
    const label =
      getCloudProviderDefinition(cloudProvider)?.label ??
      t("settings.cloud.storage");
    showAlert(
      t("settings.cloud.disconnect.title", { name: label }),
      t("settings.cloud.disconnect.message"),
      [
        {
          text: t("cloudSync.disconnect"),
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            //full unlink, the selector only pauses
            await CloudSync.disconnect();
            setCloudProvider("none");
            await completeCloudConnect("none");
            await refreshLastSync();
          },
        },
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
      ],
    );
  };

  const handleCreateSyncPin = () => {
    let currentInput = "";
    showAlert(
      t("settings.pin.create.title"),
      t("settings.pin.create.message"),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("settings.pin.create.confirm"),
          style: "primary",
          onPress: async () => {
            if (currentInput.length >= 4 && currentInput.length <= 6) {
              showCloudProgress(t("cloudSync.syncing"));
              await CloudSync.setPin(currentInput);
              setHasSyncPin(true);
              handleSyncNow();
            } else {
              setAlertModalVisible(false);
              setTimeout(
                () => showAlert(t("common.error"), t("settings.pin.invalid")),
                300,
              );
            }
          },
        },
      ],
      {
        showInput: true,
        inputPlaceholder: t("settings.pin.placeholder"),
        inputSecureTextEntry: true,
        inputKeyboardType: "numeric",
        onInputChange: (text: string) => {
          currentInput = text;
          setAlertConfig((prev) => ({ ...prev, inputValue: text }));
        },
      },
    );
  };

  const handleUnlockSyncPin = () => {
    let currentInput = "";
    showAlert(
      t("settings.pin.unlock.title"),
      t("settings.pin.unlock.message"),
      [
        {
          text: t("settings.pin.forgot"),
          onPress: handleForgetSyncPin,
          style: "secondary",
        },
        {
          text: t("settings.pin.unlock.confirm"),
          style: "primary",
          onPress: async () => {
            showCloudProgress(t("settings.cloud.progress.unlocking"));
            const success = await CloudSync.verifyAndSetPin(currentInput);
            if (success) {
              setHasSyncPin(true);
              //first sync runs right away
              showCloudProgress(t("cloudSync.syncing"));
              handleSyncNow();
            } else {
              showAlert(t("common.error"), t("settings.pin.incorrect"), [
                {
                  text: t("settings.pin.tryAgain"),
                  onPress: handleUnlockSyncPin,
                  style: "primary",
                },
                {
                  text: t("common.cancel"),
                  onPress: () => setAlertModalVisible(false),
                  style: "secondary",
                },
              ]);
            }
          },
        },
      ],
      {
        showInput: true,
        inputPlaceholder: t("settings.pin.placeholder"),
        inputSecureTextEntry: true,
        inputKeyboardType: "numeric",
        onInputChange: (text: string) => {
          currentInput = text;
          setAlertConfig((prev) => ({ ...prev, inputValue: text }));
        },
      },
    );
  };

  const handleForgetSyncPin = () => {
    showAlert(t("settings.pin.reset.title"), t("settings.pin.reset.message"), [
      {
        text: t("common.cancel"),
        onPress: () => setAlertModalVisible(false),
        style: "secondary",
      },
      {
        text: t("settings.pin.reset.confirm"),
        style: "danger",
        onPress: async () => {
          showCloudProgress(t("settings.cloud.progress.resetting"));
          await CloudSync.forgetCode();
          setHasSyncPin(false);
          handleCreateSyncPin();
        },
      },
    ]);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    const result = await CloudSync.sync();
    setIsSyncing(false);
    if (result.success) {
      onDataChanged?.();
      await refreshLastSync();
      showAlert(t("common.success"), t("settings.cloud.syncSuccess"));
    } else {
      showAlert(
        t("settings.cloud.syncError"),
        result.error || t("settings.cloud.unknownError"),
      );
    }
  };

  const refreshLastSync = useCallback(async () => {
    const time = await CloudSync.getLastSyncTime();
    setLastSyncTime(time);
    const size = await CloudSync.getLastSyncSize();
    setLastSyncSize(size);
  }, []);

  useEffect(() => {
    if (visible) {
      CloudSync.requestAutoSync(DRAWER_SYNC_DELAY_MS);
      refreshLastSync();
    }
  }, [visible, refreshLastSync]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(AppEvents.syncCompleted, () => {
      refreshLastSync();
    });
    return () => sub.remove();
  }, [refreshLastSync]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      AppEvents.syncPinInvalidated,
      async () => {
        setHasSyncPin(false);
        setHasCloudBackup(await CloudSync.hasCloudBackup());
      },
    );
    return () => sub.remove();
  }, []);

  //ping every server of both providers
  const checkServers = useCallback(async () => {
    if (!settingsLoaded) return;
    const targets = [
      ...ollamaServers.map((s) => ({ service: "ollama", url: s.url.trim() })),
      ...openaiServers.map((s) => ({
        service: OPENAI_PROVIDER_ID,
        url: s.url.trim(),
      })),
    ].filter((target) => target.url.length > 0);
    const results = await Promise.all(
      targets.map((target) =>
        AIModule.isSourceAvailable(target.service, target.url),
      ),
    );
    const errors: Record<string, boolean> = {};
    targets.forEach((target, i) => {
      errors[target.url] = !results[i];
    });
    setServerErrors(errors);
  }, [settingsLoaded, ollamaServers, openaiServers]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        checkServers();
        if (Platform.OS === "web") {
          ["tiny", "base", "small"].forEach((m) => {
            WhisperSTT.isModelInstalled(m).then((installed) => {
              setInstalledWhisperModels((prev) => ({
                ...prev,
                [m]: installed,
              }));
            });
          });
          if (whisperModel && whisperModel !== "none") {
            WhisperSTT.isModelInstalled(whisperModel).then(setWhisperInstalled);
          }
        }
      }, 300);
    }
  }, [visible, checkServers, whisperModel]);

  const handleDownloadWhisper = async (modelToDownload?: string) => {
    const model = modelToDownload || whisperModel;
    if (model === "none") return;
    setIsDownloadingWhisper(true);
    setWhisperDownloadProgress(null);
    const reportProgress = throttleProgress(setWhisperDownloadProgress);
    try {
      await WhisperSTT.downloadModel(
        model,
        (progress, etaSeconds, speedStr, sizeStr) => {
          reportProgress({
            progress,
            etaSeconds,
            speedStr,
            sizeStr,
          });
        },
      );
      setWhisperInstalled(true);
      setInstalledWhisperModels((prev) => ({ ...prev, [model]: true }));
      setWhisperModel(model);
      showAlert(
        t("common.success"),
        t("settings.whisper.downloadSuccess", { model }),
      );
    } catch (e) {
      console.error("Failed to download whisper model", e);
      showAlert(t("common.error"), t("settings.whisper.downloadFailed"));
    } finally {
      setIsDownloadingWhisper(false);
      setWhisperDownloadProgress(null);
    }
  };

  const handleSelectWhisperModel = (v: string) => {
    if (v === "none" || installedWhisperModels[v]) {
      setWhisperModel(v);
      return;
    }
    showAlert(
      t("settings.whisper.download.title"),
      t("settings.whisper.download.message", {
        model: v,
        size: getWhisperSize(v),
      }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("settings.whisper.download.confirm"),
          onPress: () => {
            setAlertModalVisible(false);
            handleDownloadWhisper(v);
          },
        },
      ],
    );
  };

  const largeScreenAnim = useAnimatedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      if (isDesktop) {
        settleLayoutDrawer(largeScreenAnim, true);
      } else {
        settleDrawer(progress, true);
      }
    } else {
      //reset once the close settles
      const reset = () => setActiveSubPage("main");
      if (isDesktop) {
        settleLayoutDrawer(largeScreenAnim, false, reset);
      } else {
        settleDrawer(progress, false, undefined, undefined, reset);
      }
    }
  }, [visible, isDesktop, largeScreenAnim, progress]);

  //back header for subpages
  const renderSubPageHeader = (title: string) => (
    <View style={styles.header}>
      <View style={styles.headerSpacer} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  //shared card grid for list pages
  const renderCardGrid = (
    cards: {
      key: string;
      title: string;
      status: string;
      error?: boolean;
      disabled?: boolean;
      onPress: () => void;
    }[],
  ) => (
    <View
      style={[styles.localModelsGrid, { marginTop: Spacing.md }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== cardGridWidth) setCardGridWidth(w);
      }}
    >
      {cards.map((card, index) => {
        //expand lone odd card to full row
        const isLastOdd = cards.length % 2 !== 0 && index === cards.length - 1;
        //prevent wrapping subpixel overflow
        const cardWidth = isLastOdd
          ? "100%"
          : cardGridWidth > 0
            ? Math.floor((cardGridWidth - Spacing.md) / 2) - 1
            : "47%";

        return (
          <Pressable
            key={card.key}
            disabled={card.disabled}
            style={pressStyle(
              [
                styles.localModelCard,
                { width: cardWidth, flexGrow: 1 },
                isLastOdd && styles.localModelCardWide,
              ],
              "surface",
            )}
            onPress={() => {
              Vibration.vibrate(8);
              card.onPress();
            }}
          >
            <Text style={styles.localModelCardTitle} numberOfLines={2}>
              {card.title}
            </Text>
            <Text
              style={[
                styles.localModelCardStatus,
                card.error && { color: Colors.error },
              ]}
              numberOfLines={1}
            >
              {card.status}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  //main navigation page content
  const renderMainPage = () => (
    <View style={styles.menuContainer}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.title} numberOfLines={1}>
          {t("settings.title")}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {notices.assistant && (
        <NotificationCard
          image={operaIcon}
          tintColor={Colors.textPrimary}
          title={t("settings.notice.assistant")}
          onPress={notices.openAssistant}
          onDismiss={notices.closeAssistant}
          style={[styles.groupSpacing, styles.mainPageGroup]}
        />
      )}

      {!!notices.update && (
        <NotificationBanner
          icon={downloadIcon}
          label={t("settings.notice.update", {
            version: notices.update.version,
          })}
          onPress={notices.openUpdate}
          style={[styles.groupSpacing, styles.mainPageGroup]}
        />
      )}

      {/* profile section */}
      <Group style={[styles.groupSpacing, styles.mainPageGroup]}>
        <Pressable
          style={pressStyle(styles.navItem, styles.navItemPressed)}
          onPress={() => setActiveSubPage("profile")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={profilIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {name || t("settings.nav.profile.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.profile.subtitle")}
            </Text>
          </View>
        </Pressable>

        {!isDesktop && (
          <Pressable
            style={pressStyle(styles.navItem, styles.navItemPressed)}
            onPress={() => setActiveSubPage("maestro")}
          >
            <View style={styles.menuIconWrap}>
              <Image
                source={operaIcon}
                style={styles.menuIcon}
                tintColor={Colors.textOnPrimary}
              />
            </View>
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>
                {t("settings.nav.maestro.title")}
              </Text>
              <Text style={styles.navSubtitle}>
                {t("settings.nav.maestro.subtitle")}
              </Text>
            </View>
          </Pressable>
        )}

        <Pressable
          style={pressStyle(
            [styles.navItem, styles.navItemLast],
            styles.navItemPressed,
          )}
          onPress={() => setActiveSubPage("cloud")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={cloudIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>{t("settings.nav.cloud.title")}</Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.cloud.subtitle")}
            </Text>
          </View>
        </Pressable>
      </Group>

      <Group style={[styles.groupSpacing, styles.mainPageGroup]}>
        <Pressable
          style={pressStyle(styles.navItem, styles.navItemPressed)}
          onPress={() => setActiveSubPage("general")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={generalIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {t("settings.nav.general.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.general.subtitle")}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={pressStyle(styles.navItem, styles.navItemPressed)}
          onPress={() => setActiveSubPage("service")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={linkIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {t("settings.nav.service.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.service.subtitle")}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={pressStyle(
            [styles.navItem, !advancedMode && styles.navItemLast],
            styles.navItemPressed,
          )}
          onPress={() => setActiveSubPage("tools")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={toolIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>{t("settings.nav.tools.title")}</Text>
            <Text style={styles.navSubtitle}>
              {isDesktop
                ? t("settings.nav.tools.subtitleDesktop")
                : t("settings.nav.tools.subtitle")}
            </Text>
          </View>
        </Pressable>

        {advancedMode && (
          <Pressable
            style={pressStyle(
              [styles.navItem, styles.navItemLast],
              styles.navItemPressed,
            )}
            onPress={() => setActiveSubPage("advanced")}
          >
            <View style={styles.menuIconWrap}>
              <Image
                source={advancedIcon}
                style={styles.menuIcon}
                tintColor={Colors.textOnPrimary}
              />
            </View>
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>
                {t("settings.nav.advanced.title")}
              </Text>
              <Text style={styles.navSubtitle}>
                {t("settings.nav.advanced.subtitle")}
              </Text>
            </View>
          </Pressable>
        )}
      </Group>

      <Group style={[styles.groupSpacing, styles.mainPageGroup]}>
        <Pressable
          style={pressStyle(styles.navItem, styles.navItemPressed)}
          onPress={() => setActiveSubPage("confidentiality")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={confidentialityIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {t("settings.nav.privacy.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.privacy.subtitle")}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={pressStyle(styles.navItem, styles.navItemPressed)}
          onPress={() => setActiveSubPage("reports")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={reportsIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {t("settings.nav.support.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.support.subtitle")}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={pressStyle(
            [styles.navItem, styles.navItemLast],
            styles.navItemPressed,
          )}
          onPress={() => setActiveSubPage("sociallinks")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={informationIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>{t("settings.nav.info.title")}</Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.info.subtitle")}
            </Text>
          </View>
        </Pressable>
      </Group>
    </View>
  );

  // social links subpage content
  const renderSocialLinksSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.info.title"))}

      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
          <Text style={styles.settingLabel}>{t("settings.info.version")}</Text>
          <Text style={styles.helpText}>Opera Beta v{appVersion}</Text>
        </View>

        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.info.links")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.info.linksHelp")}
          </Text>

          <Group>
            <ActionButton
              icon={operaIcon}
              label={t("settings.info.website")}
              onPress={() =>
                Linking.openURL("https://maestroai.company").catch(() => {})
              }
            />
            <ActionButton
              icon={githubIcon}
              label="Github"
              onPress={() =>
                Linking.openURL(
                  "https://github.com/MaestroAI-Company/opera",
                ).catch(() => {})
              }
            />
            <ActionButton
              icon={instagramIcon}
              label="Instagram"
              onPress={() =>
                Linking.openURL(
                  "https://www.instagram.com/maestroai.company?igsh=MWF4dmZvMXl1ZmdzeA==",
                ).catch(() => {})
              }
            />
            <ActionButton
              icon={tiktokIcon}
              label="TikTok"
              onPress={() =>
                Linking.openURL(
                  "https://www.tiktok.com/@maestroai.company?_r=1&_t=ZG-99DGujxTPEn",
                ).catch(() => {})
              }
            />
          </Group>
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Text style={[styles.helpText, { textAlign: "center" }]}>
          Maestroai.Company
        </Text>
      </View>
    </View>
  );

  const exportProfileCard = async () => {
    let uri: string | null = null;
    try {
      uri = await captureRef(profileCardRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png" });
      }
    } catch (e) {
      console.warn("[Profile] card export failed:", e);
    } finally {
      //drop the cached png
      if (uri) releaseCapture(uri);
    }
  };

  // profile subpage
  const renderProfileSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.profile.title"))}

      {/* android needs a real view */}
      <View ref={profileCardRef} collapsable={false} style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <ProfileCard name={confirmedName} />
        </View>
      </View>

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Group>
            <ActionButton
              icon={penPlaceholderIcon}
              label={t("settings.profile.personalize")}
              onPress={() => setActiveSubPage("profileedit")}
            />
            <ActionButton
              icon={exportIcon}
              label={t("settings.profile.exportCard")}
              onPress={exportProfileCard}
            />
          </Group>
        </View>
      </View>
    </View>
  );

  // profile edit subpage
  const renderProfileEditSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.profile.personalize"))}

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
            {t("settings.profile.name")}
          </Text>
          <Group>
            <TextInputField
              icon={penPlaceholderIcon}
              placeholder={t("onboarding.name.placeholder")}
              value={name}
              onChangeText={setName}
              onSubmitEditing={() => setConfirmedName(name)}
            />
          </Group>
        </View>
      </View>
    </View>
  );

  // general subpage
  const renderGeneralSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.general.title"))}

      {/* language, appearance and modes card */}
      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
          <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
            {t("settings.general.language")}
          </Text>
          <Group>
            <Selector
              options={languageOptions}
              selectedValue={language}
              onSelect={setLanguage}
              title={t("settings.general.selectLanguage")}
              fullWidth
            />
          </Group>
        </View>

        <View style={styles.settingRowVertical}>
          <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
            {t("settings.general.theme")}
          </Text>
          <Group>
            <SliderToggle selectedValue={theme} onSelect={setTheme} />
          </Group>
        </View>

        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.general.advancedMode")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.general.advancedModeHelp")}
              </Text>
            </View>
            <Toggle checked={advancedMode} onToggle={setAdvancedMode} />
          </View>
        </View>
      </View>

      {/* voice nav */}
      <Group style={styles.groupSpacing}>
        {renderToolsNavRow(
          "voice",
          t("settings.general.voice.title"),
          t("settings.general.voice.help"),
        )}
      </Group>
    </View>
  );

  // voice subpage
  const renderVoiceSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.general.voice.title"))}

      {/* voice engine card */}
      {ttsEngines.length > 0 && (
        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>{t("settings.tts.label")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.tts.help")}
            </Text>
            <Group>
              <Selector
                options={ttsEngineOptions}
                selectedValue={ttsEngine}
                onSelect={handleSelectTtsEngine}
                title={t("settings.tts.select")}
                fullWidth
              />
            </Group>
            {downloadingEngine && (
              <DownloadProgress
                title={t("settings.tts.downloading", {
                  engine: engineName(downloadingEngine),
                })}
                progress={engineDownloadProgress?.progress || 0}
                sizeStr={engineDownloadProgress?.sizeStr}
              />
            )}
          </View>
          {ttsVoiceOptions.length > 0 && installedEngines[ttsEngine] && (
            <View style={styles.settingRowVertical}>
              <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
                {t("settings.tts.voiceLabel")}
              </Text>
              <Group>
                <Selector
                  options={ttsVoiceOptions}
                  selectedValue={selectedTtsVoice}
                  onSelect={setTtsVoice}
                  title={t("settings.tts.selectVoice")}
                  fullWidth
                />
              </Group>
            </View>
          )}
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.tts.speed")}
            </Text>
            <Group>
              <Slider
                icon={timeIcon}
                options={ttsSpeedOptions}
                selectedValue={ttsSpeed}
                onSelect={setTtsSpeed}
              />
            </Group>
          </View>
        </View>
      )}

      {/* auto read card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.general.autoRead")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.general.autoReadHelp")}
              </Text>
            </View>
            <Toggle checked={autoSpeak} onToggle={setAutoSpeak} />
          </View>
        </View>
      </View>
    </View>
  );

  const renderAdvancedSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.advanced.title"))}

      {/* audio and technical card */}
      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.transcribeLocally.label")}
              </Text>
              <Text style={styles.helpText}>
                {Platform.OS === "web"
                  ? t("settings.transcribeLocally.helpWeb")
                  : t("settings.transcribeLocally.help")}
              </Text>
            </View>
            <Toggle checked={alwaysWhisper} onToggle={setAlwaysWhisper} />
          </View>
        </View>

        <View style={styles.settingRowVertical}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.general.technicalDetails")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.general.technicalDetailsHelp")}
              </Text>
            </View>
            <Toggle
              checked={showTechnicalDetails}
              onToggle={setShowTechnicalDetails}
            />
          </View>
        </View>

        {Platform.OS === "android" && (
          <View style={styles.settingRowVertical}>
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.general.detectionBoxes")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.general.detectionBoxesHelp")}
                </Text>
              </View>
              <Toggle
                checked={showDetectionBoxes}
                onToggle={setShowDetectionBoxes}
              />
            </View>
          </View>
        )}

        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.litert.forceLoad")}
              </Text>
              <Text style={[styles.helpText, { marginBottom: 0 }]}>
                {t("settings.litert.forceLoadHelp")}
              </Text>
            </View>
            <Toggle checked={litertForceLoad} onToggle={setLitertForceLoad} />
          </View>
        </View>
      </View>

      {/* sharing instance card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.sharing.label")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.xs }]}>
            {t("settings.sharing.help")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.sharing.instanceHelp")}
          </Text>

          <Group>
            <TextInputField
              icon={serverIcon}
              placeholder="https://privatebin.net/"
              value={shareInstanceUrl}
              onChangeText={setShareInstanceUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Group>
        </View>
      </View>

      {/* quick flow card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.quickFlow.label")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.quickFlow.help")}
          </Text>
          <Group>
            <Selector
              options={quickFlowOptions}
              selectedValue={quickFlowId}
              onSelect={handleSelectQuickFlow}
              title={t("settings.quickFlow.select")}
              fullWidth
            />
          </Group>
        </View>
      </View>
    </View>
  );

  // maestro subpage
  const renderMaestroSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.maestro.title"))}

      <View style={{ paddingVertical: Spacing.xxl2, marginBottom: Spacing.xxl2 }}>
        <MaestroCard />
      </View>

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
            {t("settings.profile.instructions")}
          </Text>
          <Group>
            <TextInputField
              icon={penPlaceholderIcon}
              placeholder={t("settings.profile.instructionsPlaceholder")}
              value={instruction}
              onChangeText={setInstruction}
            />
          </Group>
        </View>
      </View>

      <Group style={styles.groupSpacing}>
        {renderToolsNavRow(
          "assistantoverlay",
          t("settings.nav.overlay.title"),
          t("settings.nav.overlay.subtitle"),
        )}
      </Group>
    </View>
  );

  // assistant overlay subpage
  const renderAssistantOverlaySubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.overlay.title"))}

      {/* default assistant card */}
      {assistantStatus !== null && (
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={styles.settingLabel}>
              {t("settings.overlay.default")}
            </Text>
            <Text style={styles.helpText}>
              {t("settings.overlay.defaultHelp")}
            </Text>
            <Text
              style={[
                styles.assistantStatusText,
                assistantStatus
                  ? styles.assistantStatusOn
                  : styles.assistantStatusOff,
              ]}
            >
              {assistantStatus
                ? t("settings.overlay.isDefault")
                : t("settings.overlay.isNotDefault")}
            </Text>
            {!assistantStatus && (
              <Group>
                <ActionButton
                  icon={operaIcon}
                  label={t("settings.overlay.setDefault")}
                  onPress={openAssistantSettings}
                />
              </Group>
            )}
          </View>
        </View>
      )}

      {/* overlay options card */}
      <View style={styles.contentCard}>
        <View
          style={[
            styles.settingRowVertical,
            Platform.OS !== "android" && { marginBottom: 0 },
          ]}
        >
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.overlay.autoMic")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.overlay.autoMicHelp")}
              </Text>
            </View>
            <Toggle checked={autoStartMic} onToggle={setAutoStartMic} />
          </View>
        </View>

        {Platform.OS === "android" && (
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.overlay.appContext")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.overlay.appContextHelp")}
                </Text>
              </View>
              <Toggle checked={useAppContext} onToggle={setUseAppContext} />
            </View>
          </View>
        )}
      </View>
    </View>
  );

  // cloud subpage
  const renderCloudSubPage = () => {
    const cloudDef = getCloudProviderDefinition(cloudProvider);
    //details only once a backup went up
    const cloudRows =
      hasSyncPin && lastSyncTime
        ? [
            {
              label: t("cloudSync.lastSynced"),
              value: new Date(lastSyncTime).toLocaleString(),
            },
            ...(lastSyncSize != null
              ? [
                  {
                    label: t("cloudSync.backupSize"),
                    value: formatBytes(lastSyncSize),
                  },
                ]
              : []),
          ]
        : [];

    return (
      <View style={styles.subPageContainer}>
        {renderSubPageHeader(t("settings.nav.cloud.title"))}

        {/* storage card */}
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.cloud.storage")}
            </Text>
            <Group>
              <Selector
                options={cloudStorageOptions}
                selectedValue={cloudProvider}
                onSelect={handleSetCloudProvider}
                title={t("settings.cloud.selectStorage")}
                fullWidth
              />
            </Group>
          </View>
        </View>

        {/* account card */}
        {cloudDef && cloudUserInfo && (
          <View style={styles.contentCard}>
            <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
              <View style={styles.cloudAccount}>
                {cloudUserInfo.picture ? (
                  <Image
                    source={{ uri: cloudUserInfo.picture }}
                    style={styles.cloudAvatar}
                  />
                ) : (
                  <View style={styles.cloudAvatar}>
                    <Image
                      source={profilIcon}
                      style={styles.cloudAvatarIcon}
                      tintColor={Colors.textMuted}
                    />
                  </View>
                )}
                {!!cloudUserInfo.name && (
                  <Text style={styles.cloudName} numberOfLines={1}>
                    {cloudUserInfo.name}
                  </Text>
                )}
                <Text style={styles.cloudEmail} numberOfLines={1}>
                  {cloudUserInfo.email}
                </Text>
              </View>

              {cloudRows.length > 0 && (
                <View style={styles.groupSpacingTight}>
                  {cloudRows.map((row) => (
                    <ActionButton
                      key={row.label}
                      label={row.label}
                      rightElement={
                        <Text
                          style={styles.infoValue}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {row.value}
                        </Text>
                      }
                    />
                  ))}
                </View>
              )}

              <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
                {hasSyncPin
                  ? t("cloudSync.ready")
                  : t("cloudSync.setupIncomplete")}
              </Text>

              {!hasSyncPin && (
                <Group
                  style={[
                    styles.highlightGroup,
                    styles.groupSpacingTight,
                    isSyncing && styles.highlightGroupDisabled,
                  ]}
                >
                  <ActionButton
                    icon={hasCloudBackup ? cloudDownloadIcon : cloudUploadIcon}
                    label={
                      hasCloudBackup
                        ? t("cloudSync.enterPin")
                        : t("cloudSync.createPin")
                    }
                    variant="highlight"
                    onPress={
                      hasCloudBackup ? handleUnlockSyncPin : handleCreateSyncPin
                    }
                  />
                </Group>
              )}

              <Group>
                {hasSyncPin && (
                  <ActionButton
                    icon={reconnectIcon}
                    label={
                      isSyncing
                        ? t("cloudSync.syncing")
                        : t("cloudSync.syncNow")
                    }
                    disabled={isSyncing}
                    style={isSyncing && styles.highlightGroupDisabled}
                    onPress={handleSyncNow}
                  />
                )}
                <ActionButton
                  icon={cancelIcon}
                  label={t("cloudSync.disconnect")}
                  onPress={handleDisconnectCloud}
                />
              </Group>
            </View>
          </View>
        )}
      </View>
    );
  };

  // service subpage content
  const renderServiceSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.service.title"))}

      {/* service providers group: beta, hugging face, ollama */}
      <Group style={styles.groupSpacing}>
        {!!BETA_SERVER_URL && (
          <Pressable
            style={pressStyle(
              styles.toggleGroupRowItem,
              styles.toggleGroupCardPressed,
            )}
            onPress={() => setActiveSubPage("beta")}
          >
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.service.beta")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.service.betaHelp")}
                </Text>
              </View>
              <View style={styles.toggleDivider} />
              <Toggle
                checked={enabledProviders.includes(BETA_PROVIDER_ID)}
                onToggle={(v) => setProviderEnabled(BETA_PROVIDER_ID, v)}
              />
            </View>
          </Pressable>
        )}

        <Pressable
          style={pressStyle(
            styles.toggleGroupRowItem,
            styles.toggleGroupCardPressed,
          )}
          onPress={() => setActiveSubPage("local")}
        >
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.service.local")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.service.localHelp")}
              </Text>
            </View>
            <View style={styles.toggleDivider} />
            <Toggle
              checked={localAvailable && enabledProviders.includes("local")}
              disabled={!localAvailable}
              onToggle={(v) => {
                if (localAvailable) setProviderEnabled("local", v);
              }}
            />
          </View>
        </Pressable>

        {isProviderSupported("litert") && (
          <Pressable
            style={pressStyle(
              styles.toggleGroupRowItem,
              styles.toggleGroupCardPressed,
            )}
            onPress={() => setActiveSubPage("litert")}
          >
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.service.litert")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.service.litertHelp")}
                </Text>
              </View>
              <View style={styles.toggleDivider} />
              <Toggle
                checked={enabledProviders.includes("litert")}
                onToggle={(v) => setProviderEnabled("litert", v)}
              />
            </View>
          </Pressable>
        )}

        <Pressable
          style={pressStyle(
            styles.toggleGroupRowItem,
            styles.toggleGroupCardPressed,
          )}
          onPress={() => setActiveSubPage("ollama")}
        >
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.service.ollama")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.service.ollamaHelp")}
              </Text>
            </View>
            <View style={styles.toggleDivider} />
            <Toggle
              checked={enabledProviders.includes("ollama")}
              onToggle={(v) => setProviderEnabled("ollama", v)}
            />
          </View>
        </Pressable>

        <Pressable
          style={pressStyle(
            [styles.toggleGroupRowItem, styles.navItemLast],
            styles.toggleGroupCardPressed,
          )}
          onPress={() => setActiveSubPage("openai")}
        >
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.service.cloudapi")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.service.cloudapiHelp")}
              </Text>
            </View>
            <View style={styles.toggleDivider} />
            <Toggle
              checked={enabledProviders.includes(OPENAI_PROVIDER_ID)}
              onToggle={(v) => setProviderEnabled(OPENAI_PROVIDER_ID, v)}
            />
          </View>
        </Pressable>
      </Group>

      {/* local whisper transcription for web */}
      {Platform.OS === "web" && (
        <View style={styles.contentCard}>
          <View
            style={[styles.settingRowVertical, { zIndex: 9, marginBottom: 0 }]}
          >
            <Text style={styles.settingLabel}>
              {t("settings.whisper.label")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.whisper.help")}
            </Text>
            <Group>
              <Selector
                options={whisperModelOptions}
                selectedValue={whisperModel}
                onSelect={handleSelectWhisperModel}
                title={t("settings.whisper.select")}
                fullWidth
              />
            </Group>
            {isDownloadingWhisper && (
              <DownloadProgress
                title={t("settings.whisper.downloading", {
                  model: whisperModel,
                })}
                progress={whisperDownloadProgress?.progress || 0}
                sizeStr={whisperDownloadProgress?.sizeStr}
                etaSeconds={whisperDownloadProgress?.etaSeconds}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );

  //beta provider info subpage
  const renderBetaSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Opera Beta")}

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.service.beta")}</Text>
          <Text style={[styles.helpText, { marginTop: Spacing.md }]}>
            {t("settings.beta.intro")}
          </Text>
          <Text style={[styles.helpText, { marginTop: Spacing.sm }]}>
            {t("settings.beta.privacy")}
          </Text>
          <Text style={[styles.helpText, { marginTop: Spacing.sm }]}>
            {t("settings.beta.testing")}
          </Text>
        </View>
      </View>
    </View>
  );

  //built-in provider, model ships with device
  const renderLocalSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.local.title"))}

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.local.title")}</Text>
          <Text style={[styles.helpText, { marginBottom: 0 }]}>
            {t("settings.local.help")}
          </Text>
        </View>
      </View>

      {localSheet && (
        <View style={styles.contentCard}>
          <View
            style={
              localSheet.models.length > 0
                ? styles.settingRowVertical
                : [styles.settingRowVertical, { marginBottom: 0 }]
            }
          >
            <Text style={styles.settingLabel}>
              {t("settings.local.sheetTitle")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.local.sheetHelp")}
            </Text>
            <Group>
              {(
                [
                  ["family", localSheet.family],
                  ["runtime", localSheet.runtime],
                  ["browser", localSheet.browser],
                ] as const
              )
                .filter(([, value]) => !!value)
                .map(([key, value]) => (
                  <ActionButton
                    key={key}
                    label={t(`settings.local.sheet.${key}`)}
                    rightElement={
                      <Text style={styles.litertRowMeta}>{value}</Text>
                    }
                  />
                ))}
            </Group>
          </View>

          {localSheet.models.length > 0 && (
            <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
              <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
                {t("settings.local.modelsTitle")}
              </Text>
              {/* measure available grid width for columns */}
              <View
                style={styles.localModelsGrid}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0 && w !== localGridWidth) setLocalGridWidth(w);
                }}
              >
                {localSheet.models.map((model, i) => {
                  const isOdd = localSheet.models.length % 2 !== 0;
                  //expand lone odd model to full row
                  const isLastOdd = isOdd && i === localSheet.models.length - 1;
                  //prevent wrapping subpixel overflow
                  const cardWidth = isLastOdd
                    ? "100%"
                    : localGridWidth > 0
                      ? Math.floor((localGridWidth - Spacing.md) / 2) - 1
                      : "47%";

                  return (
                    <Pressable
                      key={model.id}
                      style={pressStyle(
                        [
                          styles.localModelCard,
                          { width: cardWidth, flexGrow: isLastOdd ? 1 : 1 },
                          isLastOdd && styles.localModelCardWide,
                        ],
                        "surface",
                      )}
                      onPress={() => {
                        Vibration.vibrate(8);
                        setSelectedLocalModelId(model.id);
                      }}
                    >
                      <Text
                        style={styles.localModelCardTitle}
                        numberOfLines={2}
                      >
                        {model.label}
                      </Text>
                      {!!model.status && (
                        <Text
                          style={styles.localModelCardStatus}
                          numberOfLines={1}
                        >
                          {t(`settings.local.status.${model.status}`)}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {!!localDownload && (
                <DownloadProgress
                  title={t("settings.local.downloading")}
                  progress={localDownload.progress}
                  sizeStr={localDownload.sizeStr}
                />
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );

  //on-device provider, models the browser installed
  const renderLitertSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.litert.title"))}

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.litert.modelTitle")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.litert.help")}
          </Text>

          <Group
            style={[
              styles.highlightGroup,
              !!downloadingLitert && styles.highlightGroupDisabled,
            ]}
          >
            <ActionButton
              icon={addIcon}
              label={t("settings.litert.addModel")}
              variant="highlight"
              disabled={!!downloadingLitert}
              onPress={openAddModelSheet}
            />
          </Group>

          {(installedLitertModels.length > 0 || !!downloadingLitert) &&
            renderCardGrid([
              ...(downloadingLitert
                ? [
                    {
                      key: downloadingLitert,
                      title: getLiteRTModelLabel(downloadingLitert),
                      status: t("settings.litert.downloadingPercent", {
                        percent: Math.round(
                          (litertDownloadProgress?.progress ?? 0) * 100,
                        ),
                      }),
                      onPress: () => setLitertDownloadVisible(true),
                    },
                  ]
                : []),
              ...installedLitertModels.map((model) => ({
                key: model.id,
                title: model.label,
                status: model.sizeStr,
                disabled: !!downloadingLitert,
                onPress: () => openInstalledLitert(model.id),
              })),
            ])}
        </View>
      </View>

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.litert.contextTitle")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.litert.contextHelp")}
          </Text>
          <Group>
            <Slider
              icon={messageIcon}
              options={litertContextLengthOptions}
              selectedValue={litertContextLength}
              onSelect={setLitertContextLength}
            />
          </Group>
        </View>
      </View>
    </View>
  );

  //installed on-device model subpage
  const renderLitertModelSubPage = () => {
    const entry = installedModel ? getCatalogEntry(installedModel.id) : null;
    if (!installedModel || !entry) return renderLitertSubPage();

    const publisher = familyPublisher(entry.family);
    const capabilities = entry.capabilities
      .filter(
        (c): c is keyof typeof LITERT_CAPABILITY_KEYS =>
          c in LITERT_CAPABILITY_KEYS,
      )
      .map((c) => ({
        id: c,
        label: t(LITERT_CAPABILITY_KEYS[c]),
        icon: LITERT_CAPABILITY_ICONS[c],
      }));
    const { description } = installedModel;

    return (
      <View style={styles.subPageContainer}>
        {renderSubPageHeader(entry.label)}

        <View style={styles.contentCard}>
          <View style={styles.litertDetailHeader}>
            <View style={styles.litertDetailTile}>
              <Image
                source={{ uri: modelAvatarUrl(entry, entry.repoId) }}
                style={styles.litertTileImage}
              />
            </View>
            <View style={styles.litertDetailInfo}>
              <Text style={styles.litertDetailName}>{entry.label}</Text>
              {!!publisher && (
                <Text style={styles.litertDetailMeta}>{publisher}</Text>
              )}
              <Text style={styles.litertDetailMeta}>
                {formatBytes(entry.sizeBytes)}
              </Text>
              {capabilities.map((capability) => (
                <View key={capability.id} style={styles.litertCapability}>
                  <Image
                    source={capability.icon}
                    style={styles.litertCapabilityIcon}
                    tintColor={Colors.textSecondary}
                  />
                  <Text style={styles.litertDetailMeta}>
                    {capability.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={[styles.settingLabel, styles.litertDetailSection]}>
            {t("settings.litert.description")}
          </Text>
          <Text style={styles.helpText}>
            {description === undefined
              ? t("settings.litert.loading")
              : (description ?? t("settings.litert.noDescription"))}
          </Text>
        </View>

        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group>
              <ActionButton
                icon={binIcon}
                label={t("settings.litert.deleteModel")}
                onPress={() =>
                  handleDeleteLitert({
                    id: entry.repoId,
                    label: entry.label,
                    sizeStr: formatBytes(entry.sizeBytes),
                  })
                }
              />
            </Group>
          </View>
        </View>
      </View>
    );
  };

  //ollama server list subpage
  const renderOllamaSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Ollama")}

      {/* ollama servers card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.ollama.title")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.ollama.help")}
          </Text>

          <Group style={styles.highlightGroup}>
            <ActionButton
              icon={addIcon}
              label={t("settings.server.add")}
              variant="highlight"
              onPress={openOllamaAddSheet}
            />
          </Group>

          {ollamaServers.length > 0 &&
            renderCardGrid(
              ollamaServers.map((server, index) => ({
                key: String(index),
                title: ollamaServerLabel(server),
                status: ollamaStatusLabel(server),
                error: serverErrors[server.url.trim()] === true,
                onPress: () => openOllamaServer(index),
              })),
            )}
        </View>
      </View>

      {/* model failover card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.service.failover")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.service.failoverHelp")}
              </Text>
            </View>
            <Toggle checked={modelFailover} onToggle={setModelFailover} />
          </View>
        </View>
      </View>
    </View>
  );

  //ollama server detail page
  const renderOllamaServerSubPage = () => {
    const index = ollamaDetailIndex ?? -1;
    const server = ollamaServers[index];
    if (!server) return renderOllamaSubPage();

    const url = server.url.trim();
    const connected = url.length > 0 && serverErrors[url] === false;

    return (
      <View style={styles.subPageContainer}>
        {renderSubPageHeader(ollamaServerLabel(server))}

        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.name")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.server.namePlaceholder")}
                value={server.name}
                onChangeText={(v) => patchOllamaServer(index, { name: v })}
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.link")}
            </Text>
            <Group>
              <TextInputField
                icon={linkIcon}
                placeholder={t("settings.service.serverLink")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={server.url}
                onChangeText={(v) => patchOllamaServer(index, { url: v })}
                onBlur={() => handleOllamaUrlBlur(index)}
                rightIcon={
                  serverErrors[server.url.trim()] ? errorIcon : undefined
                }
                rightIconLabel={t("common.error")}
                onRightIconPress={() =>
                  showAlert(
                    t("settings.ollama.unreachableTitle"),
                    t("settings.ollama.unreachableInfo"),
                    undefined,
                    { image: ollamaErrorImage, messageAlign: "left" },
                  )
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>
              {t("settings.ollama.contextLength")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.ollama.contextHelp")}
            </Text>
            <Group>
              {advancedMode ? (
                <TextInputField
                  icon={messageIcon}
                  placeholder="8192"
                  value={ollamaContextDraft}
                  onChangeText={(v) => setOllamaServerContext(index, v)}
                  keyboardType="numeric"
                />
              ) : (
                <Slider
                  icon={messageIcon}
                  options={ollamaContextLengthOptions}
                  selectedValue={String(serverContextLength(server))}
                  onSelect={(v) => setOllamaServerContext(index, v)}
                />
              )}
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>
              {t("settings.ollama.keepAlive")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {advancedMode
                ? t("settings.ollama.keepAliveHelpAdvanced")
                : t("settings.ollama.keepAliveHelp")}
            </Text>
            <Group>
              {advancedMode ? (
                <TextInputField
                  icon={timeIcon}
                  placeholder="300"
                  value={ollamaKeepAliveDraft}
                  onChangeText={(v) => setOllamaServerKeepAlive(index, v)}
                  keyboardType="numeric"
                />
              ) : (
                <Slider
                  icon={timeIcon}
                  options={ollamaKeepAliveOptions}
                  selectedValue={String(serverKeepAlive(server))}
                  onSelect={(v) => setOllamaServerKeepAlive(index, v)}
                />
              )}
            </Group>
          </View>

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {ollamaModels.length > 0
                ? t("settings.ollama.modelsCount", {
                    count: ollamaModels.length,
                  })
                : t("settings.ollama.models")}
            </Text>
            <Text style={styles.helpText}>
              {ollamaModels.length > 0
                ? ollamaModels.join(", ")
                : ollamaModelsLoading
                  ? t("settings.ollama.modelsLoading")
                  : t("settings.ollama.noModels")}
            </Text>
          </View>
        </View>

        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group>
              {!connected && (
                <ActionButton
                  icon={reconnectIcon}
                  label={
                    ollamaModelsLoading
                      ? t("settings.ollama.connecting")
                      : t("settings.ollama.reconnect")
                  }
                  disabled={ollamaModelsLoading || url.length === 0}
                  onPress={() => reconnectOllamaServer(index)}
                />
              )}
              <ActionButton
                icon={binIcon}
                label={t("settings.ollama.remove.action")}
                onPress={() => removeOllamaServer(index)}
              />
            </Group>
          </View>
        </View>
      </View>
    );
  };

  //openai server list subpage
  const renderOpenAISubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.service.cloudapi"))}

      {/* openai servers card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.cloudapi.title")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.cloudapi.help")}
          </Text>

          <Group style={styles.highlightGroup}>
            <ActionButton
              icon={addIcon}
              label={t("settings.server.add")}
              variant="highlight"
              onPress={openOpenAIAddSheet}
            />
          </Group>

          {openaiServers.length > 0 &&
            renderCardGrid(
              openaiServers.map((server, index) => ({
                key: String(index),
                title: openAIServerLabel(index),
                status: ollamaStatusLabel(server),
                error: serverErrors[server.url.trim()] === true,
                onPress: () => openOpenAIServer(index),
              })),
            )}
        </View>
      </View>

      {/* model failover card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.service.failover")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.service.failoverHelp")}
              </Text>
            </View>
            <Toggle checked={modelFailover} onToggle={setModelFailover} />
          </View>
        </View>
      </View>
    </View>
  );

  //openai server detail page
  const renderOpenAIServerSubPage = () => {
    const index = openaiDetailIndex ?? -1;
    const server = openaiServers[index];
    if (!server) return renderOpenAISubPage();

    const url = server.url.trim();
    const connected = url.length > 0 && serverErrors[url] === false;

    return (
      <View style={styles.subPageContainer}>
        {renderSubPageHeader(openAIServerLabel(index))}

        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.name")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.server.namePlaceholder")}
                value={server.name}
                onChangeText={(v) => patchOpenAIServer(index, { name: v })}
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.link")}
            </Text>
            <Group>
              <TextInputField
                icon={linkIcon}
                placeholder={t("settings.service.serverLink")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={server.url}
                onChangeText={(v) => patchOpenAIServer(index, { url: v })}
                onBlur={() => handleOpenAIUrlBlur(index)}
                rightIcon={
                  serverErrors[server.url.trim()] ? errorIcon : undefined
                }
                rightIconLabel={t("common.error")}
                onRightIconPress={() =>
                  showAlert(
                    t("settings.ollama.unreachableTitle"),
                    t("settings.cloudapi.unreachableInfo"),
                    undefined,
                    { messageAlign: "left" },
                  )
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>
              {t("settings.cloudapi.apiKey")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.cloudapi.apiKeyHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.cloudapi.apiKeyPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                value={openaiKeyDraft}
                onChangeText={setOpenAIKeyDraft}
                onBlur={() => handleOpenAIKeyBlur(index)}
              />
            </Group>
          </View>

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {openaiModels.length > 0
                ? t("settings.ollama.modelsCount", {
                    count: openaiModels.length,
                  })
                : t("settings.ollama.models")}
            </Text>
            <Text style={styles.helpText}>
              {openaiModels.length > 0
                ? openaiModels.join(", ")
                : openaiModelsLoading
                  ? t("settings.ollama.modelsLoading")
                  : t("settings.ollama.noModels")}
            </Text>
          </View>
        </View>

        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group>
              {!connected && (
                <ActionButton
                  icon={reconnectIcon}
                  label={
                    openaiModelsLoading
                      ? t("settings.ollama.connecting")
                      : t("settings.ollama.reconnect")
                  }
                  disabled={openaiModelsLoading || url.length === 0}
                  onPress={() => reconnectOpenAIServer(index)}
                />
              )}
              <ActionButton
                icon={binIcon}
                label={t("settings.ollama.remove.action")}
                onPress={() => removeOpenAIServer(index)}
              />
            </Group>
          </View>
        </View>
      </View>
    );
  };

  // confidentiality subpage content
  const renderConfidentialitySubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.privacy.title"))}

      {/* privacy policy card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.privacy.data")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.xs }]}>
            {t("settings.privacy.intro")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.xs }]}>
            {t("settings.privacy.externalServices")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.privacy.noTracking")}
          </Text>
          <Group>
            <ActionButton
              icon={hyperlinkIcon}
              label={t("settings.privacy.policy")}
              onPress={() =>
                Linking.openURL("https://maestroai.company/privacy.html").catch(
                  () => {},
                )
              }
            />
          </Group>
        </View>
      </View>

      {/* permissions card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("permissions.title")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {Platform.OS === "web"
              ? t("settings.privacy.permissionsWeb")
              : t("settings.privacy.permissionsNative")}
          </Text>

          <Group>
            <ActionButton
              icon={micIcon}
              label={t("permissions.microphone.label")}
              onPress={
                Platform.OS !== "web" ? () => Linking.openSettings() : undefined
              }
              disabled={Platform.OS === "web"}
              rightElement={
                Platform.OS !== "web"
                  ? renderPermissionBadge(permissionStatuses.microphone)
                  : undefined
              }
            />
            <ActionButton
              icon={cameraIcon}
              label={t("permissions.camera.label")}
              onPress={
                Platform.OS !== "web" ? () => Linking.openSettings() : undefined
              }
              disabled={Platform.OS === "web"}
              rightElement={
                Platform.OS !== "web"
                  ? renderPermissionBadge(permissionStatuses.camera)
                  : undefined
              }
            />
            <ActionButton
              icon={locationIcon}
              label={t("permissions.location.label")}
              onPress={
                Platform.OS !== "web" ? () => Linking.openSettings() : undefined
              }
              disabled={Platform.OS === "web"}
              rightElement={
                Platform.OS !== "web"
                  ? renderPermissionBadge(permissionStatuses.location)
                  : undefined
              }
            />
            {Platform.OS !== "web" && (
              <ActionButton
                icon={photoIcon}
                label={t("permissions.photos.label")}
                onPress={() => Linking.openSettings()}
                rightElement={renderPermissionBadge(permissionStatuses.photos)}
              />
            )}
            {Platform.OS !== "web" && (
              <ActionButton
                icon={profilIcon}
                label={t("permissions.contacts.label")}
                onPress={() => Linking.openSettings()}
                rightElement={renderPermissionBadge(
                  permissionStatuses.contacts,
                )}
              />
            )}
            {Platform.OS !== "web" && (
              <ActionButton
                icon={calendarIcon}
                label={t("permissions.calendar.label")}
                onPress={() => Linking.openSettings()}
                rightElement={renderPermissionBadge(
                  permissionStatuses.calendar,
                )}
              />
            )}
          </Group>
        </View>
      </View>

      {/* data management card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.data.management")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.data.managementHelp")}
          </Text>

          <Group>
            <ActionButton
              icon={exportIcon}
              label={t("settings.data.exportAction")}
              onPress={handleExportData}
            />
            <ActionButton
              icon={downloadIcon}
              label={t("settings.data.importAction")}
              onPress={handleImportData}
            />
            <ActionButton
              icon={binIcon}
              label={t("settings.data.deleteAllAction")}
              onPress={handleDeleteAllConversations}
            />
          </Group>
        </View>
      </View>
    </View>
  );

  //fresh draft on every visit
  useEffect(() => {
    if (activeSubPage === "reports") report.reset();
  }, [activeSubPage]);

  // reports subpage content
  const renderReportsSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.support.title"))}

      {/* bug report card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.support.report")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.support.reportHelp")}
          </Text>
          <Group style={styles.groupSpacingTight}>
            <TextInputField
              icon={penPlaceholderIcon}
              placeholder={t("bugReport.placeholder")}
              value={report.text}
              onChangeText={report.setText}
            />
          </Group>

          <View style={styles.toggleRow}>
            <Checkbox
              label={t("bugReport.attachLogs")}
              checked={report.logs !== null}
              onToggle={report.toggleLogs}
              labelFirst
              style={styles.checkboxRow}
            />
          </View>

          <Text
            style={[
              styles.helpText,
              { marginTop: Spacing.md, marginBottom: Spacing.md },
            ]}
          >
            {t("bugReport.consent")}
          </Text>

          <Group style={styles.highlightGroup}>
            <ActionButton
              icon={arrowIcon}
              label={t("bugReport.send")}
              onPress={() => report.send()}
              variant="highlight"
            />
          </Group>
        </View>
      </View>

      {/* contact support card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.support.more")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.support.moreHelp")}
          </Text>
          <Group>
            <ActionButton
              icon={supportIcon}
              label={t("settings.support.contact")}
              onPress={() =>
                Linking.openURL("https://maestroai.company/contact.html").catch(
                  () => {},
                )
              }
            />
          </Group>
        </View>
      </View>
    </View>
  );

  // tools subpage content: assistant tools stay inline, widgets and mobile actions link out
  //whole row opens the subpage
  const renderToolsNavRow = (page: SubPage, title: string, help: string) => (
    <Pressable
      style={pressStyle(
        styles.toggleGroupRowItem,
        styles.toggleGroupCardPressed,
      )}
      onPress={() => setActiveSubPage(page)}
    >
      <View style={styles.toggleGroupRow}>
        <View style={styles.toggleGroupContent}>
          <Text style={styles.settingLabel}>{title}</Text>
          <Text style={styles.helpText}>{help}</Text>
        </View>
        <Image
          source={rightArrowIcon}
          style={[styles.menuIcon, { marginRight: Spacing.md }]}
          tintColor={Colors.textMuted}
        />
      </View>
    </Pressable>
  );

  const renderToolsSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.tools.title"))}

      {/* built-in tools card */}
      <View style={styles.contentCard}>
        {generalTools.map((tool, index) => {
          const name = tool.definition.function.name;
          const key = `tool:${name}`;
          const enabled = pluginStates[key] ?? tool.enabledByDefault ?? false;
          const isLast = index === generalTools.length - 1;
          return (
            <View
              key={name}
              style={[styles.settingRowVertical, isLast && { marginBottom: 0 }]}
            >
              <View style={styles.toggleGroupRow}>
                <View style={styles.toggleGroupContent}>
                  <Text style={styles.settingLabel}>
                    {tool.displayName ?? name}
                  </Text>
                  {tool.displayDescription ? (
                    <Text style={styles.helpText}>
                      {shortDescription(tool.displayDescription)}
                    </Text>
                  ) : null}
                </View>
                <Toggle
                  checked={enabled}
                  onToggle={async (v) => {
                    setPluginStates((prev) => ({ ...prev, [key]: v }));
                    await PluginRegistry.setEnabled("tool", name, v);
                    if (v) await tool.requestPermission?.();
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>

      {/* extensions and integrations group */}
      <Group style={styles.groupSpacing}>
        {renderToolsNavRow(
          "widgets",
          t("settings.tools.widgets.title"),
          t("settings.tools.widgets.help", {
            list: allWidgets.map((w) => w.name).join(", "),
          }),
        )}

        {renderToolsNavRow(
          "mcpservers",
          t("settings.tools.mcp.title"),
          t("settings.tools.mcp.help"),
        )}

        {!isDesktop &&
          renderToolsNavRow(
            "mobileactions",
            t("settings.tools.mobile.title"),
            t("settings.tools.mobile.help", {
              list: mobileTools
                .map(
                  (tool) => tool.displayName ?? tool.definition.function.name,
                )
                .join(", "),
            }),
          )}
      </Group>
    </View>
  );

  //mcp list page
  const renderMcpServersSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.tools.mcp.title"))}

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.tools.mcp.title")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.tools.mcp.help")}
          </Text>

          <Group style={styles.highlightGroup}>
            <ActionButton
              icon={addIcon}
              label={t("settings.server.add")}
              variant="highlight"
              onPress={openMcpAddSheet}
            />
          </Group>

          {mcpServers.length > 0 &&
            renderCardGrid(
              mcpServers.map((server) => ({
                key: server.id,
                title: server.name,
                status: mcpStatusLabel(server.id),
                error: McpService.getStatus(server.id).state === "error",
                onPress: () => {
                  setMcpDetailId(server.id);
                  setActiveSubPage("mcpserver");
                },
              })),
            )}
        </View>
      </View>
    </View>
  );

  //server detail page
  const renderMcpServerSubPage = () => {
    const server = mcpServers.find((s) => s.id === mcpDetailId);
    if (!server) return renderMcpServersSubPage();

    const status = McpService.getStatus(server.id);
    const tools = McpService.getTools(server.id);
    const busy = mcpConnecting[server.id];

    return (
      <View style={styles.subPageContainer}>
        {renderSubPageHeader(server.name)}

        {/* server settings card */}
        <View style={styles.contentCard}>
          {status.error ? (
            <View style={styles.settingRowVertical}>
              <Text style={[styles.helpText, { color: Colors.error }]}>
                {status.error}
              </Text>
            </View>
          ) : null}

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {server.name}
            </Text>
            <Group>
              <ActionButton
                icon={arrowIcon}
                label={t("settings.server.settings")}
                onPress={() => setActiveSubPage("mcpserversettings")}
              />
            </Group>
          </View>
        </View>

        {/* tools card */}
        {tools.length > 0 && (
          <View style={styles.contentCard}>
            <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
              <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
                {t("settings.mcp.tools", { count: tools.length })}
              </Text>
              {tools.map((tool, index) => {
                const name = tool.definition.function.name;
                const key = `tool:${name}`;
                const enabled =
                  pluginStates[key] ?? tool.enabledByDefault ?? false;
                return (
                  <View
                    key={name}
                    style={
                      index < tools.length - 1 && { marginBottom: Spacing.xxl }
                    }
                  >
                    <View style={styles.toggleGroupRow}>
                      <View style={styles.toggleGroupContent}>
                        <Text style={styles.settingLabel}>
                          {tool.displayName ?? name}
                        </Text>
                        {tool.displayDescription ? (
                          <Text style={styles.helpText}>
                            {shortDescription(tool.displayDescription)}
                          </Text>
                        ) : null}
                      </View>
                      <Toggle
                        checked={enabled}
                        onToggle={async (v) => {
                          setPluginStates((prev) => ({ ...prev, [key]: v }));
                          await PluginRegistry.setEnabled("tool", name, v);
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* server actions card */}
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group>
              {/* reconnect only while offline */}
              {status.state !== "connected" && (
                <ActionButton
                  icon={reconnectIcon}
                  label={
                    busy
                      ? t("settings.mcp.connecting")
                      : t("settings.mcp.reconnect")
                  }
                  disabled={busy || !server.url.trim()}
                  onPress={() => connectMcpServer(server.id)}
                />
              )}
              <ActionButton
                icon={binIcon}
                label={t("settings.mcp.remove.action")}
                onPress={() => removeMcpServer(server.id, server.name)}
              />
            </Group>
          </View>
        </View>
      </View>
    );
  };

  //server settings subpage
  const renderMcpServerSettingsSubPage = () => {
    const server = mcpServers.find((s) => s.id === mcpDetailId);
    if (!server) return renderMcpServersSubPage();

    return (
      <View style={styles.subPageContainer}>
        {renderSubPageHeader(t("settings.server.settings"))}

        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.link")}
            </Text>
            <Group>
              <TextInputField
                icon={linkIcon}
                placeholder={t("settings.service.serverLink")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={server.url}
                onChangeText={(v) =>
                  setMcpServers((prev) =>
                    prev.map((s) =>
                      s.id === server.id ? { ...s, url: v } : s,
                    ),
                  )
                }
                onBlur={() => handleMcpUrlBlur(server.id, server.url)}
                rightIcon={mcpNeedsAuth(server.id) ? infoIcon : undefined}
                rightIconTint={Colors.textMuted}
                rightIconLabel={t("common.info")}
                onRightIconPress={() => showMcpAuthInfo(server.id)}
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.mcp.headerHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.mcp.headerName")}
                autoCapitalize="none"
                autoCorrect={false}
                value={server.headerName}
                onChangeText={(v) =>
                  setMcpServers((prev) =>
                    prev.map((s) =>
                      s.id === server.id ? { ...s, headerName: v } : s,
                    ),
                  )
                }
                onBlur={() =>
                  saveMcpServer(server.id, { headerName: server.headerName })
                }
              />
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.mcp.headerValue")}
                autoCapitalize="none"
                secureTextEntry
                value={mcpHeaderValues[server.id] ?? ""}
                onChangeText={(v) =>
                  setMcpHeaderValues((prev) => ({ ...prev, [server.id]: v }))
                }
                onBlur={() =>
                  McpService.setHeaderValue(
                    server.id,
                    mcpHeaderValues[server.id] ?? "",
                  )
                }
              />
            </Group>
          </View>

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.mcp.clientIdHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.mcp.clientId")}
                autoCapitalize="none"
                autoCorrect={false}
                value={server.clientId ?? ""}
                onChangeText={(v) =>
                  setMcpServers((prev) =>
                    prev.map((s) =>
                      s.id === server.id ? { ...s, clientId: v } : s,
                    ),
                  )
                }
                onBlur={() =>
                  saveMcpServer(server.id, { clientId: server.clientId ?? "" })
                }
              />
            </Group>
          </View>
        </View>
      </View>
    );
  };

  // widgets subpage content
  const renderWidgetsSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.tools.widgets.title"))}

      <View style={styles.contentCard}>
        {allWidgets.map((widget, index) => {
          const key = `widget:${widget.id}`;
          const enabled = pluginStates[key] ?? widget.enabledByDefault ?? false;
          return (
            <View
              key={widget.id}
              style={[
                styles.settingRowVertical,
                index === allWidgets.length - 1 && { marginBottom: 0 },
              ]}
            >
              <View style={styles.toggleGroupRow}>
                <View style={styles.toggleGroupContent}>
                  <Text style={styles.settingLabel}>{widget.name}</Text>
                  <Text style={styles.helpText}>
                    {shortDescription(widget.description)}
                  </Text>
                </View>
                <Toggle
                  checked={enabled}
                  onToggle={async (v) => {
                    setPluginStates((prev) => ({ ...prev, [key]: v }));
                    await PluginRegistry.setEnabled("widget", widget.id, v);
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  // mobile actions subpage content
  const renderMobileActionsSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.tools.mobile.title"))}

      <View style={styles.contentCard}>
        {mobileTools.map((tool, index) => {
          const name = tool.definition.function.name;
          const key = `tool:${name}`;
          const enabled = pluginStates[key] ?? tool.enabledByDefault ?? false;
          return (
            <View
              key={name}
              style={[
                styles.settingRowVertical,
                index === mobileTools.length - 1 && { marginBottom: 0 },
              ]}
            >
              <View style={styles.toggleGroupRow}>
                <View style={styles.toggleGroupContent}>
                  <Text style={styles.settingLabel}>
                    {tool.displayName ?? name}
                  </Text>
                  {tool.displayDescription ? (
                    <Text style={styles.helpText}>
                      {shortDescription(tool.displayDescription)}
                    </Text>
                  ) : null}
                </View>
                <Toggle
                  checked={enabled}
                  onToggle={async (v) => {
                    setPluginStates((prev) => ({ ...prev, [key]: v }));
                    await PluginRegistry.setEnabled("tool", name, v);
                    if (v) await tool.requestPermission?.();
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  const getSubPageContent = (page: SubPage) => {
    switch (page) {
      case "profile":
        return renderProfileSubPage();
      case "profileedit":
        return renderProfileEditSubPage();
      case "cloud":
        return renderCloudSubPage();
      case "general":
        return renderGeneralSubPage();
      case "voice":
        return renderVoiceSubPage();
      case "maestro":
        return renderMaestroSubPage();
      case "assistantoverlay":
        return renderAssistantOverlaySubPage();
      case "service":
        return renderServiceSubPage();
      case "beta":
        return renderBetaSubPage();
      case "local":
        return renderLocalSubPage();
      case "litert":
        return renderLitertSubPage();
      case "litertmodel":
        return renderLitertModelSubPage();
      case "ollama":
        return renderOllamaSubPage();
      case "ollamaserver":
        return renderOllamaServerSubPage();
      case "openai":
        return renderOpenAISubPage();
      case "openaiserver":
        return renderOpenAIServerSubPage();
      case "confidentiality":
        return renderConfidentialitySubPage();
      case "advanced":
        return renderAdvancedSubPage();
      case "reports":
        return renderReportsSubPage();
      case "tools":
        return renderToolsSubPage();
      case "widgets":
        return renderWidgetsSubPage();
      case "mobileactions":
        return renderMobileActionsSubPage();
      case "mcpservers":
        return renderMcpServersSubPage();
      case "mcpserver":
        return renderMcpServerSubPage();
      case "mcpserversettings":
        return renderMcpServerSettingsSubPage();
      case "sociallinks":
        return renderSocialLinksSubPage();
      case "main":
      default:
        return renderMainPage();
    }
  };

  const innerContent = (
    <View style={styles.innerContainer}>
      <View
        style={[styles.fixedBackWrapper, { top: isDesktop ? 0 : 60 }]}
        pointerEvents="box-none"
      >
        <DrawerBackButton
          kind={activeSubPage === "main" ? "close" : "back"}
          onPress={handleBack}
          scrolled={isScrolled}
          pulseKey={activeSubPage}
        />
      </View>

      <PageStack
        page={activeSubPage}
        visible={visible}
        //push travels the whole panel, padding included
        width={isDesktop ? 320 : drawerWidth}
        parentOf={subPageParent}
        gestureEnabled={!sheetOpen}
        onBack={handleBack}
        renderPage={(page, active) => (
          //focused field scrolls just above the keyboard
          <KeyboardAwareScrollView
            ref={active ? scrollRef : undefined}
            bottomOffset={Spacing.xl2}
            onScroll={active ? handleScroll : undefined}
            scrollEventThrottle={16}
            contentContainerStyle={{
              paddingTop: isDesktop ? 0 : 60,
              paddingBottom: 40,
              flexGrow: 1,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flex: 1 }}>{getSubPageContent(page)}</View>
          </KeyboardAwareScrollView>
        )}
      />

      {/* floating drawers keep their titles visible */}
      {!isDesktop && (
        <LinearGradient
          colors={[
            Colors.groupedBackground,
            Colors.groupedBackgroundFade,
            Colors.groupedBackgroundClear,
          ]}
          style={styles.gradientTop}
          pointerEvents="none"
        />
      )}
      <LinearGradient
        colors={[
          Colors.groupedBackgroundClear,
          Colors.groupedBackgroundFade,
          Colors.groupedBackground,
        ]}
        style={styles.gradientBottom}
        pointerEvents="none"
      />
    </View>
  );

  const notificationModal = (
    <>
      <NotificationModal
        visible={alertModalVisible}
        title={alertConfig.title}
        icon={alertConfig.icon}
        image={alertConfig.image}
        message={alertConfig.message}
        messageAlign={alertConfig.messageAlign}
        onClose={() => setAlertModalVisible(false)}
        buttons={alertConfig.buttons}
        showInput={alertConfig.showInput}
        inputValue={alertConfig.inputValue}
        onInputChange={alertConfig.onInputChange}
        inputPlaceholder={alertConfig.inputPlaceholder}
        inputSecureTextEntry={alertConfig.inputSecureTextEntry}
        inputKeyboardType={alertConfig.inputKeyboardType}
        loading={alertConfig.loading}
      />
      <NotificationModal
        visible={exportScopeVisible}
        title={t("settings.data.exportAction")}
        message={t("settings.data.exportScope")}
        onClose={() => setExportScopeVisible(false)}
        options={[
          {
            label: t("settings.data.conversations"),
            checked: exportSelection.conversations,
            onToggle: (checked) =>
              setExportSelection((prev) => ({
                ...prev,
                conversations: checked,
              })),
          },
          {
            label: t("settings.title"),
            checked: exportSelection.settings,
            onToggle: (checked) =>
              setExportSelection((prev) => ({ ...prev, settings: checked })),
          },
        ]}
        buttons={[
          {
            text: t("settings.data.export"),
            style: "primary",
            disabled:
              !exportSelection.settings && !exportSelection.conversations,
            onPress: () =>
              runExport(
                exportSelection.settings,
                exportSelection.conversations,
              ),
          },
          {
            text: t("common.cancel"),
            style: "secondary",
            onPress: () => setExportScopeVisible(false),
          },
        ]}
      />
    </>
  );

  //the hub query waits for enough chars
  const isLitertQuerying = hfModelInput.trim().length >= MIN_SEARCH_LENGTH;

  const litertPageParent = (page: LitertPage) =>
    page === "model" ? litertModelFrom : page === "search" ? "browse" : null;

  //android back steps up the pages before the sheet closes
  const handleLitertBackPress = () => {
    const parent = litertPageParent(litertPage);
    if (parent === null) return false;
    //keyboard slides away with the pop
    Keyboard.dismiss();
    //a page reached by back never grabs focus
    setLitertSearchHandoff(false);
    showLitertPage(parent);
    return true;
  };

  const renderLitertCard = (repoId: string) => {
    const entry = getCatalogEntry(repoId);
    return (
      <Pressable
        key={repoId}
        onPress={() => openLitertDetail(repoId)}
        style={pressStyle(styles.litertCard, "fade")}
      >
        <View style={styles.litertCardTile}>
          <Image
            source={{ uri: modelAvatarUrl(entry, repoId) }}
            style={styles.litertTileImage}
          />
        </View>
        <Text style={styles.litertCardName} numberOfLines={2}>
          {entry?.label ?? repoId.split("/").pop()}
        </Text>
        <Text style={styles.litertCardMeta} numberOfLines={1}>
          {isLiteRTModelDownloaded(repoId)
            ? t("settings.litert.installed")
            : familyPublisher(entry?.family ?? "")}
        </Text>
      </Pressable>
    );
  };

  const renderLitertSearchResult = (entry: CatalogEntry) => (
    <Pressable
      key={entry.repoId}
      onPress={() => openLitertDetail(entry.repoId)}
      style={pressStyle(styles.litertSearchResultRow, "surface")}
    >
      <View style={styles.litertSearchResultTile}>
        <Image
          source={{ uri: modelAvatarUrl(entry, entry.repoId) }}
          style={styles.litertTileImage}
        />
      </View>
      <View style={styles.litertSearchResultInfo}>
        <Text style={styles.litertSearchResultName} numberOfLines={1}>
          {entry.label}
        </Text>
        <Text style={styles.litertRowMeta}>
          {isLiteRTModelDownloaded(entry.repoId)
            ? t("settings.litert.installed")
            : formatBytes(entry.sizeBytes)}
        </Text>
      </View>
    </Pressable>
  );

  const renderLitertDetail = () => {
    if (!litertDetail) return null;
    const { repoId, entry: resolved, loading, description } = litertDetail;
    const entry = resolved ?? getCatalogEntry(repoId);
    const installed = isLiteRTModelDownloaded(repoId);
    const canDownload = !!resolved && !installed && !downloadingLitert;
    const publisher = familyPublisher(entry?.family ?? "");
    const capabilities = (resolved?.capabilities ?? [])
      .filter(
        (c): c is keyof typeof LITERT_CAPABILITY_KEYS =>
          c in LITERT_CAPABILITY_KEYS,
      )
      .map((c) => ({
        id: c,
        label: t(LITERT_CAPABILITY_KEYS[c]),
        icon: LITERT_CAPABILITY_ICONS[c],
      }));
    //both carousels share one card
    const sections = [
      {
        title: t("settings.litert.otherModels"),
        repoIds: similarModels(repoId),
      },
      {
        title: t("settings.litert.sameFamily"),
        repoIds: sameFamilyModels(repoId),
      },
    ].filter((section) => section.repoIds.length > 0);

    return (
      <>
        <View style={styles.contentCard}>
          <View style={styles.litertDetailHeader}>
            <View style={styles.litertDetailTile}>
              <Image
                source={{ uri: modelAvatarUrl(entry, repoId) }}
                style={styles.litertTileImage}
              />
            </View>
            <View style={styles.litertDetailInfo}>
              <Text style={styles.litertDetailName}>
                {entry?.label ?? repoId.split("/").pop()}
              </Text>
              {!!publisher && (
                <Text style={styles.litertDetailMeta}>{publisher}</Text>
              )}
              <Text style={styles.litertDetailMeta}>
                {loading
                  ? t("settings.litert.loading")
                  : resolved
                    ? formatBytes(resolved.sizeBytes)
                    : t("settings.litert.unavailable")}
              </Text>
              {capabilities.map((capability) => (
                <View key={capability.id} style={styles.litertCapability}>
                  <Image
                    source={capability.icon}
                    style={styles.litertCapabilityIcon}
                    tintColor={Colors.textSecondary}
                  />
                  <Text style={styles.litertDetailMeta}>
                    {capability.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Group
            style={[
              styles.highlightGroup,
              styles.litertDetailDownload,
              !canDownload && styles.highlightGroupDisabled,
            ]}
          >
            <ActionButton
              icon={downloadIcon}
              label={
                installed
                  ? t("settings.litert.installed")
                  : t("settings.litert.downloadAction")
              }
              variant="highlight"
              disabled={!canDownload}
              onPress={() => resolved && confirmDownloadLitert(resolved)}
            />
          </Group>

          <Text style={[styles.settingLabel, styles.litertDetailSection]}>
            {t("settings.litert.description")}
          </Text>
          <Text style={styles.helpText}>
            {description === undefined
              ? t("settings.litert.loading")
              : (description ?? t("settings.litert.noDescription"))}
          </Text>
        </View>

        {sections.length > 0 && (
          <View style={[styles.contentCard, styles.litertFamilies]}>
            {sections.map((section) => (
              <View key={section.title}>
                <Text style={[styles.settingLabel, styles.litertFamilyTitle]}>
                  {section.title}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.litertCarousel}
                >
                  {section.repoIds.map(renderLitertCard)}
                </ScrollView>
              </View>
            ))}
          </View>
        )}
      </>
    );
  };

  const litertList = litertBrowserLoading ? (
    <Text style={styles.helpText}>{t("settings.litert.loading")}</Text>
  ) : litertBrowserFailed ? (
    <Text style={styles.helpText}>{t("settings.litert.loadFailed")}</Text>
  ) : (
    <View style={styles.litertFamilies}>
      {litertFamilies.map((family) => (
        <View key={family.id}>
          <Text style={[styles.settingLabel, styles.litertFamilyTitle]}>
            {litertFamilyName(family)}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.litertCarousel}
          >
            {family.repoIds.map(renderLitertCard)}
          </ScrollView>
        </View>
      ))}
    </View>
  );

  //nothing until a query goes out
  const litertSearchList = litertSearchLoading ? (
    <Text style={styles.helpText}>{t("settings.litert.loading")}</Text>
  ) : litertSearchFailed ? (
    <Text style={styles.helpText}>{t("settings.litert.loadFailed")}</Text>
  ) : litertSearchResults.length > 0 ? (
    <Group>{litertSearchResults.map(renderLitertSearchResult)}</Group>
  ) : (
    isLitertQuerying && (
      <Text style={styles.helpText}>{t("settings.litert.noResults")}</Text>
    )
  );

  const renderLitertSearchField = (page: LitertPage) => (
    <Group>
      <TextInputField
        icon={searchIcon}
        placeholder={t("settings.litert.addModelPlaceholder")}
        //other pages only lead to the search page
        value={page === "search" ? hfModelInput : ""}
        onChangeText={setHfModelInput}
        onFocus={
          page === "search"
            ? () => setLitertSearchHandoff(false)
            : openLitertSearch
        }
        autoFocus={page === "search" && litertSearchHandoff}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Group>
  );

  //catalog, search and model push like settings pages
  const renderLitertPage = (page: LitertPage, active: boolean) => (
    <>
      <ScrollView
        ref={active ? addModelScrollRef : undefined}
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
        onScroll={
          active
            ? (e) => setAddModelScrolled(e.nativeEvent.contentOffset.y > 4)
            : undefined
        }
        scrollEventThrottle={16}
      >
        {page === "browse" ? (
          <View style={styles.contentCard}>
            <View style={styles.settingRowVertical}>
              {renderLitertSearchField(page)}
            </View>
            {litertList}
          </View>
        ) : (
          <>
            <View style={[styles.contentCard, styles.litertSearchWithBack]}>
              {renderLitertSearchField(page)}
            </View>
            {page === "model"
              ? renderLitertDetail()
              : litertSearchList && (
                  <View style={styles.contentCard}>{litertSearchList}</View>
                )}
          </>
        )}
      </ScrollView>

      {/* floats over the scroll like the settings back button */}
      {page !== "browse" && (
        <View style={styles.litertBackWrapper} pointerEvents="box-none">
          <DrawerBackButton
            kind="back"
            onPress={handleLitertBackPress}
            scrolled={addModelScrolled}
            pulseKey={page === "model" ? litertDetail?.repoId : page}
          />
        </View>
      )}
    </>
  );

  const addModelSheet = (
    <DrawerSheet
      visible={addModelSheetVisible}
      onClose={() => setAddModelSheetVisible(false)}
      onBackPress={handleLitertBackPress}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          //stacked pages cannot size the sheet
          height: sheetMaxHeight,
        },
      ]}
      desktopStyle={[styles.addModelSheetDesktop, { height: sheetMaxHeight }]}
    >
      <View
        style={styles.litertSheetBody}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          setLitertBodyWidth((prev) => (prev !== width ? width : prev));
        }}
      >
        <PageStack
          page={litertPage}
          visible={addModelSheetVisible}
          width={litertBodyWidth}
          parentOf={litertPageParent}
          onBack={handleLitertBackPress}
          renderPage={renderLitertPage}
        />
      </View>
    </DrawerSheet>
  );

  const ollamaAddServerSheet = (
    <DrawerSheet
      visible={ollamaAddVisible}
      onClose={() => setOllamaAddVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      <ScrollView
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>{t("settings.server.name")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.server.nameHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.server.namePlaceholder")}
                value={serverDraft.name}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, name: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.link")}
            </Text>
            <Group>
              <TextInputField
                icon={linkIcon}
                placeholder={t("settings.service.serverLink")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={serverDraft.url}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, url: v }))
                }
              />
            </Group>
          </View>

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group
              style={[
                styles.highlightGroup,
                (serverDraftBusy || !serverDraft.url.trim()) &&
                  styles.highlightGroupDisabled,
              ]}
            >
              <ActionButton
                icon={addIcon}
                label={
                  serverDraftBusy
                    ? t("settings.server.checking")
                    : t("settings.server.add")
                }
                variant="highlight"
                disabled={serverDraftBusy || !serverDraft.url.trim()}
                onPress={submitOllamaDraft}
              />
            </Group>
          </View>
        </View>
      </ScrollView>
    </DrawerSheet>
  );

  const openaiAddServerSheet = (
    <DrawerSheet
      visible={openaiAddVisible}
      onClose={() => setOpenAIAddVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      <ScrollView
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>{t("settings.server.name")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.server.nameHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.server.namePlaceholder")}
                value={serverDraft.name}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, name: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.link")}
            </Text>
            <Group>
              <TextInputField
                icon={linkIcon}
                placeholder={t("settings.service.serverLink")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={serverDraft.url}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, url: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>
              {t("settings.cloudapi.apiKey")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.cloudapi.apiKeyHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.cloudapi.apiKeyPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                value={openaiKeyDraft}
                onChangeText={setOpenAIKeyDraft}
              />
            </Group>
          </View>

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group
              style={[
                styles.highlightGroup,
                (serverDraftBusy || !serverDraft.url.trim()) &&
                  styles.highlightGroupDisabled,
              ]}
            >
              <ActionButton
                icon={addIcon}
                label={
                  serverDraftBusy
                    ? t("settings.server.checking")
                    : t("settings.server.add")
                }
                variant="highlight"
                disabled={serverDraftBusy || !serverDraft.url.trim()}
                onPress={submitOpenAIDraft}
              />
            </Group>
          </View>
        </View>
      </ScrollView>
    </DrawerSheet>
  );

  const mcpAddServerSheet = (
    <DrawerSheet
      visible={mcpAddVisible}
      onClose={() => setMcpAddVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      {/* too tall to ride the keyboard */}
      <KeyboardAwareScrollView
        bottomOffset={Spacing.xl2}
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>{t("settings.server.name")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.server.nameHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.server.namePlaceholder")}
                value={serverDraft.name}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, name: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.link")}
            </Text>
            <Group>
              <TextInputField
                icon={linkIcon}
                placeholder={t("settings.service.serverLink")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={serverDraft.url}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, url: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.mcp.headerHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.mcp.headerName")}
                autoCapitalize="none"
                autoCorrect={false}
                value={serverDraft.headerName}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, headerName: v }))
                }
              />
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.mcp.headerValue")}
                autoCapitalize="none"
                secureTextEntry
                value={serverDraft.headerValue}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, headerValue: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.mcp.clientIdHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.mcp.clientId")}
                autoCapitalize="none"
                autoCorrect={false}
                value={serverDraft.clientId}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, clientId: v }))
                }
              />
            </Group>
          </View>

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group
              style={[
                styles.highlightGroup,
                (serverDraftBusy || !serverDraft.url.trim()) &&
                  styles.highlightGroupDisabled,
              ]}
            >
              <ActionButton
                icon={addIcon}
                label={
                  serverDraftBusy
                    ? t("settings.server.checking")
                    : t("settings.server.add")
                }
                variant="highlight"
                disabled={serverDraftBusy || !serverDraft.url.trim()}
                onPress={submitMcpDraft}
              />
            </Group>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </DrawerSheet>
  );

  //storage switches only once the setup connects
  const CloudSetup = getCloudProviderDefinition(cloudSetupId)?.SetupComponent;
  const cloudSetupSheet = (
    <DrawerSheet
      visible={cloudSetupVisible}
      onClose={() => setCloudSetupVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      <ScrollView
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentCard}>
          {CloudSetup && (
            <CloudSetup
              onDone={() => {
                setCloudSetupVisible(false);
                connectProvider(cloudSetupId);
              }}
            />
          )}
        </View>
      </ScrollView>
    </DrawerSheet>
  );

  //built-in model detail sheet
  const localModelDetailSheet = (
    <DrawerSheet
      visible={selectedLocalModel !== null}
      onClose={() => setSelectedLocalModelId(null)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      {selectedLocalModel && (
        <View style={styles.addModelSheetBody}>
          <ScrollView
            contentContainerStyle={styles.addModelSheetContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentCard}>
              <View
                style={[
                  styles.settingRowVertical,
                  { marginBottom: Spacing.md },
                ]}
              >
                <Text style={styles.settingLabel}>
                  {selectedLocalModel.label}
                </Text>
                {selectedLocalModel.status && (
                  <Text style={[styles.helpText, { marginBottom: 0 }]}>
                    {t(`settings.local.status.${selectedLocalModel.status}`)}
                  </Text>
                )}
              </View>

              <Group>
                {selectedLocalModel.status && (
                  <ActionButton
                    label={t("settings.local.sheet.status")}
                    rightElement={
                      <Text style={styles.litertRowMeta}>
                        {t(
                          `settings.local.status.${selectedLocalModel.status}`,
                        )}
                      </Text>
                    }
                  />
                )}
                {!!selectedLocalModel.version && (
                  <ActionButton
                    label={t("settings.local.sheet.version")}
                    rightElement={
                      <Text style={styles.litertRowMeta}>
                        {selectedLocalModel.version}
                      </Text>
                    }
                  />
                )}
                {selectedLocalModel.contextTokens !== undefined && (
                  <ActionButton
                    label={t("settings.local.sheet.context")}
                    rightElement={
                      <Text style={styles.litertRowMeta}>
                        {t("settings.local.sheet.tokens", {
                          count:
                            selectedLocalModel.contextTokens.toLocaleString(),
                        })}
                      </Text>
                    }
                  />
                )}
                {selectedLocalModel.thinking !== undefined && (
                  <ActionButton
                    label={t("settings.local.sheet.thinking")}
                    rightElement={
                      <Text style={styles.litertRowMeta}>
                        {t(
                          selectedLocalModel.thinking
                            ? "settings.local.sheet.yes"
                            : "settings.local.sheet.no",
                        )}
                      </Text>
                    }
                  />
                )}
                {localSheet?.canDownload &&
                  (selectedLocalModel.status === "downloadable" ||
                    selectedLocalModel.status === "downloading") && (
                    <ActionButton
                      icon={downloadIcon}
                      label={t("settings.local.download")}
                      disabled={!!localDownload}
                      onPress={() => {
                        handleDownloadLocal(selectedLocalModel.id);
                      }}
                    />
                  )}
              </Group>

              {!!localDownload && (
                <DownloadProgress
                  title={t("settings.local.downloading")}
                  progress={localDownload.progress}
                  sizeStr={localDownload.sizeStr}
                />
              )}
            </View>
          </ScrollView>
        </View>
      )}
    </DrawerSheet>
  );

  //on-device download detail sheet
  const litertDownloadSheet = (
    <DrawerSheet
      visible={litertDownloadVisible}
      onClose={() => setLitertDownloadVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      {!!downloadingLitert && (
        <View style={styles.addModelSheetBody}>
          <ScrollView contentContainerStyle={styles.addModelSheetContent}>
            <View style={styles.contentCard}>
              <View
                style={[
                  styles.settingRowVertical,
                  { marginBottom: Spacing.md },
                ]}
              >
                <Text style={styles.settingLabel}>
                  {t("settings.litert.downloadingModel", {
                    name: getLiteRTModelLabel(downloadingLitert),
                  })}
                </Text>
              </View>

              <Group>
                <ProgressBar
                  progress={litertDownloadProgress?.progress ?? 0}
                  icon={downloadIcon}
                />
                <ActionButton
                  label={t("settings.litert.downloaded")}
                  rightElement={
                    <Text style={styles.litertRowMeta}>
                      {litertDownloadProgress?.sizeStr ??
                        t("download.starting")}
                    </Text>
                  }
                />
                <ActionButton
                  label={t("settings.litert.speed")}
                  rightElement={
                    <Text style={styles.litertRowMeta}>
                      {litertDownloadProgress?.speedStr ??
                        t("download.starting")}
                    </Text>
                  }
                />
                <ActionButton
                  label={t("settings.litert.timeLeft")}
                  rightElement={
                    <Text style={styles.litertRowMeta}>
                      {litertDownloadProgress?.etaSeconds
                        ? `${Math.round(litertDownloadProgress.etaSeconds)}s`
                        : t("download.starting")}
                    </Text>
                  }
                />
              </Group>

              <Group style={styles.litertCancelRow}>
                <ActionButton
                  icon={cancelIcon}
                  label={t("settings.litert.cancelDownload")}
                  onPress={handleCancelLitert}
                />
              </Group>
            </View>
          </ScrollView>
        </View>
      )}
    </DrawerSheet>
  );

  if (isDesktop) {
    const largeScreenWidth = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 320],
    });
    const largeScreenMargin = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 16],
    });
    const largeScreenOpacity = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    return (
      <Animated.View
        style={[
          styles.largeScreenContainer,
          styles.floatingContainer,
          {
            width: largeScreenWidth,
            opacity: largeScreenOpacity,
            marginLeft: largeScreenMargin,
            marginRight: largeScreenMargin,
            overflow: "hidden",
          },
        ]}
      >
        <View style={{ width: 320, flex: 1 }}>
          <View style={styles.floatingContent}>{innerContent}</View>
        </View>
        {notificationModal}
        {addModelSheet}
        {ollamaAddServerSheet}
        {openaiAddServerSheet}
        {mcpAddServerSheet}
        {cloudSetupSheet}
        {localModelDetailSheet}
        {litertDownloadSheet}
      </Animated.View>
    );
  }

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [drawerWidth, 0],
  });

  //settle before state change
  const dismiss = () => {
    settleDrawer(progress, false);
    onClose();
  };

  const mobileDrawer = (
    <View style={styles.root} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[styles.overlay, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      <Animated.View
        style={[
          styles.content,
          { width: drawerWidth },
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        {innerContent}
      </Animated.View>

      {notificationModal}
      {addModelSheet}
      {ollamaAddServerSheet}
      {openaiAddServerSheet}
      {mcpAddServerSheet}
      {cloudSetupSheet}
      {localModelDetailSheet}
      {litertDownloadSheet}
    </View>
  );

  return mobileDrawer;
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      zIndex: 1000,
      elevation: 1000,
    },
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: Colors.scrimDrawer,
    },
    content: {
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      backgroundColor: Colors.groupedBackground,
      paddingHorizontal: Spacing.lg2,
      overflow: "hidden",
    },
    largeScreenContainer: {
      width: 320,
      backgroundColor: Colors.groupedBackground,
      zIndex: 10,
    },
    floatingContainer: {
      margin: 16,
      marginTop:
        typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
          ? 40
          : 8,
      marginBottom: 16,
      borderRadius: Radius.xxl,
      borderWidth: 2,
      borderColor: Colors.border,
      boxShadow: `-6px 6px 0px ${Colors.shadowInk}`,
      elevation: 5,
      overflow: "hidden",
    },
    floatingContent: {
      flex: 1,
      paddingTop: 24,
      paddingHorizontal: Spacing.lg2,
    },
    innerContainer: {
      flex: 1,
      position: "relative",
    },
    fixedBackWrapper: {
      position: "absolute",
      left: 0,
      zIndex: 100,
      elevation: 10,
      width: 40,
      height: 40,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.xxxl,
      minHeight: 40,
    },
    title: {
      flex: 1,
      fontSize: FontSizes.xxxl,
      color: Colors.textPrimary,
      fontFamily: Fonts.display,
      textAlign: "center",
      includeFontPadding: false,
      lineHeight: 40,
    },
    menuContainer: {
      flex: 1,
    },
    subPageContainer: {
      flex: 1,
    },
    contentCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
      marginBottom: Spacing.xxl2,
    },
    gradientTop: {
      position: "absolute",
      top: 0,
      left: -Spacing.lg2,
      right: -Spacing.lg2,
      height: 60,
      zIndex: 10,
    },
    gradientBottom: {
      position: "absolute",
      bottom: 0,
      left: -Spacing.lg2,
      right: -Spacing.lg2,
      height: 60,
      zIndex: 10,
    },
    headerSpacer: {
      width: 40,
      height: 40,
    },
    addModelSheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.groupedBackground,
      borderTopLeftRadius: Radius.huge2,
      borderTopRightRadius: Radius.huge2,
      paddingTop: 12,
      overflow: "hidden",
    },
    sheetHandleContainer: {
      alignItems: "center",
      marginBottom: Spacing.xs2,
      paddingVertical: 10,
      marginTop: -10,
    },
    addModelSheetDesktop: {
      backgroundColor: Colors.groupedBackground,
      borderRadius: Radius.xxl,
      borderWidth: 2,
      borderColor: Colors.border,
      boxShadow: `-6px 6px 0px ${Colors.shadowInk}`,
      elevation: 5,
      width: 380,
      overflow: "hidden",
      paddingVertical: 16,
    },
    localModelsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.md,
    },
    localModelCard: {
      borderWidth: 2,
      borderColor: Colors.border,
      borderRadius: Radius.xxl,
      backgroundColor: Colors.surface,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.lg,
      minHeight: 76,
      justifyContent: "center",
      alignItems: "center",
    },
    localModelCardWide: {
      minHeight: 70,
    },
    localModelCardTitle: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      lineHeight: 18,
      color: Colors.textPrimary,
      textAlign: "center",
      marginBottom: Spacing.xs,
    },
    localModelCardStatus: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      color: Colors.textSecondary,
      textAlign: "center",
    },
    litertCancelRow: {
      marginTop: Spacing.md,
    },
    litertDetailHeader: {
      flexDirection: "row",
      gap: Spacing.lg2,
    },
    litertDetailTile: {
      width: 120,
      height: 120,
      backgroundColor: Colors.logoTile,
      borderWidth: 2,
      borderColor: Colors.logoTileBorder,
      borderRadius: Radius.xxl,
      overflow: "hidden",
    },
    litertTileImage: {
      width: "100%",
      height: "100%",
    },
    litertDetailInfo: {
      flex: 1,
    },
    litertDetailName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.title,
      color: Colors.textPrimary,
      marginBottom: Spacing.xs,
    },
    litertDetailMeta: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      color: Colors.textSecondary,
      lineHeight: 20,
    },
    litertCapability: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs2,
    },
    litertCapabilityIcon: {
      width: 14,
      height: 14,
    },
    litertDetailDownload: {
      marginTop: Spacing.lg2,
    },
    litertDetailSection: {
      marginTop: Spacing.xxl,
    },
    litertFamilies: {
      gap: Spacing.xxl,
    },
    litertFamilyTitle: {
      marginBottom: Spacing.md,
    },
    litertCarousel: {
      gap: Spacing.lg2,
      paddingHorizontal: Spacing.md,
    },
    litertCard: {
      width: 96,
      alignItems: "center",
    },
    litertCardTile: {
      width: 96,
      height: 96,
      backgroundColor: Colors.logoTile,
      borderWidth: 2,
      borderColor: Colors.logoTileBorder,
      borderRadius: Radius.xxl,
      marginBottom: Spacing.md,
      overflow: "hidden",
    },
    litertCardName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textPrimary,
      textAlign: "center",
    },
    litertCardMeta: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.labelSm,
      color: Colors.textSecondary,
      marginTop: Spacing.xs2,
    },
    litertRowMeta: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.micro,
      color: Colors.textMuted,
    },
    litertSearchResultRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: Spacing.lg2,
      paddingHorizontal: Spacing.lg2,
      gap: Spacing.lg2,
    },
    litertSearchResultTile: {
      width: 44,
      height: 44,
      backgroundColor: Colors.logoTile,
      borderWidth: 2,
      borderColor: Colors.logoTileBorder,
      borderRadius: Radius.xxl,
      overflow: "hidden",
    },
    litertSearchResultInfo: {
      flex: 1,
      gap: Spacing.xs2,
    },
    litertSearchResultName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
    },
    addModelSheetBody: {
      flexShrink: 1,
      position: "relative",
    },
    litertSheetBody: {
      flex: 1,
    },
    litertBackWrapper: {
      position: "absolute",
      top: Spacing.md + 4,
      left: Spacing.lg2,
      width: 40,
      height: 40,
      zIndex: 10,
      elevation: 10,
    },
    litertSearchWithBack: {
      marginLeft: 40 + Spacing.md,
    },
    addModelSheetContent: {
      paddingHorizontal: Spacing.lg2,
      paddingBottom: Spacing.lg,
    },
    groupSpacing: {
      marginBottom: Spacing.xxl,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
    },
    mainPageGroup: {
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
    },
    groupSpacingTight: {
      marginBottom: Spacing.lg2,
    },
    navItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: Spacing.lg2,
      paddingHorizontal: Spacing.lg2,
      gap: Spacing.lg2,
    },
    navItemLast: {
      marginBottom: 0,
    },
    navItemPressed: {
      backgroundColor: Colors.surfacePressed,
    },
    menuIcon: {
      width: 18,
      height: 18,
    },
    menuIconWrap: {
      width: 36,
      height: 36,
      borderRadius: Radius.xxl,
      backgroundColor: Colors.primary,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
      alignItems: "center",
      justifyContent: "center",
    },
    navTextContainer: {
      flex: 1,
    },
    //same as the image preview rows
    infoValue: {
      flexShrink: 1,
      maxWidth: "60%",
      textAlign: "right",
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
    cloudAccount: {
      alignItems: "center",
      paddingVertical: Spacing.xl2,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.lg2,
    },
    cloudAvatar: {
      width: 80,
      height: 80,
      //stays a circle at this size
      borderRadius: Radius.pill * 2,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.surfaceSubtle,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Spacing.lg2,
    },
    cloudAvatarIcon: {
      width: 32,
      height: 32,
    },
    cloudName: {
      fontSize: FontSizes.lg,
      fontFamily: Fonts.mono,
      color: Colors.textPrimary,
      textAlign: "center",
      marginBottom: Spacing.xs2,
    },
    cloudEmail: {
      fontSize: FontSizes.bodyMd,
      fontFamily: Fonts.body,
      color: Colors.textMuted,
      textAlign: "center",
    },
    navTitle: {
      fontSize: FontSizes.lg,
      fontFamily: Fonts.mono,
      color: Colors.textPrimary,
      marginBottom: 2,
    },
    navSubtitle: {
      fontSize: FontSizes.bodyMd,
      fontFamily: Fonts.body,
      color: Colors.textMuted,
    },
    permissionBadge: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: Radius.md,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    permissionBadgeAllowed: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primaryBright,
    },
    permissionBadgeText: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.labelSm,
      color: Colors.textSecondary,
    },
    permissionBadgeTextAllowed: {
      color: Colors.textOnPrimary,
    },
    settingRowVertical: {
      marginBottom: Spacing.xxl,
      zIndex: 10,
    },
    settingLabel: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
      paddingTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    toggleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    toggleGroupRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    toggleGroupContent: {
      flex: 1,
      marginRight: Spacing.lg2,
    },
    toggleGroupRowItem: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
    },
    toggleGroupCardPressed: {
      backgroundColor: Colors.surfacePressed,
    },
    toggleDivider: {
      width: 2,
      height: 34,
      backgroundColor: Colors.border,
      marginRight: Spacing.lg2,
    },
    checkboxRow: {
      flex: 1,
      justifyContent: "space-between",
      paddingHorizontal: Spacing.md,
    },
    helpText: {
      fontSize: FontSizes.bodyMd,
      color: Colors.textMuted,
      fontFamily: Fonts.body,
      marginTop: 4,
      lineHeight: 20,
      paddingHorizontal: Spacing.md,
    },
    assistantStatusText: {
      fontSize: FontSizes.bodyMd,
      fontFamily: Fonts.body,
      marginTop: 6,
      marginBottom: 12,
      lineHeight: 20,
    },
    assistantStatusOn: {
      color: Colors.primary,
    },
    assistantStatusOff: {
      color: Colors.textMuted,
    },
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroupDisabled: {
      opacity: 0.5,
    },
  });
