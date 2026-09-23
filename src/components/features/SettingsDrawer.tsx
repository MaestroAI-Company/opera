import * as Calendar from "expo-calendar";
import Constants from "expo-constants";
import * as Contacts from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library/legacy";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  View,
} from "react-native";
import {
  Fonts,
  FontSizes,
  Radius,
  Spacing,
  ThemeColors,
} from "../../../constants/theme";
import { AIModule } from "../../services/ai/AIModule";
import {
  BETA_PROVIDER_ID,
  BETA_SERVER_URL,
  buildSources,
  getEnabledProviders,
  getOllamaServers,
  getOllamaTuning,
  OllamaServer,
  serializeOllamaServers,
  serializeProviders,
} from "../../services/ai/providers/sources";
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
import { WhisperSTT } from "../../services/speech/STTService";
import { IWidget, WidgetManager } from "../../services/widgets/WidgetManager";
import ActionButton from "../ui/ActionButton";
import Checkbox from "../ui/Checkbox";
import DownloadProgress from "../ui/DownloadProgress";
import Group from "../ui/Group";
import IconButton from "../ui/IconButton";
import ImageCard from "../ui/ImageCard";
import NotificationBanner from "../ui/NotificationBanner";
import NotificationCard from "../ui/NotificationCard";
import NotificationModal, { ModalButton } from "../ui/NotificationModal";
import Selector, { SelectorOption } from "../ui/Selector";
import Slider from "../ui/Slider";
import SliderToggle from "../ui/SliderToggle";
import TextInputField from "../ui/TextInputField";
import Toggle from "../ui/Toggle";
import CloudSyncBox from "./CloudSyncBox";
import DrawerSheet from "./DrawerSheet";

import { useResponsive } from "../../hooks/useResponsive";
import { useSettingsNotices } from "../../hooks/useSettingsNotices";

import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useBugReport } from "../../hooks/useBugReport";
import { setThemeMode, useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import {
  dragDrawer,
  drawerWidthFor,
  gestureVelocity,
  playBackButtonPulse,
  playPageTransition,
  settingsProgress,
  settleDrawer,
  settleLayoutDrawer,
} from "./drawerAnimation";

const linkIcon = require("../../../assets/icons/link.png");
const addIcon = require("../../../assets/icons/add.png");
const downloadIcon = require("../../../assets/icons/download.png");
const deleteIcon = require("../../../assets/icons/delete.png");
const penPlaceholderIcon = require("../../../assets/icons/pencil.png");
const searchIcon = require("../../../assets/icons/search.png");
const profilIcon = require("../../../assets/icons/profil.png");
const cloudIcon = require("../../../assets/icons/cloud.png");
const arrowIcon = require("../../../assets/icons/arrow.png");
const cancelIcon = require("../../../assets/icons/cancel.png");
const generalIcon = require("../../../assets/icons/general.png");
const advancedIcon = require("../../../assets/icons/settings.png");
const serverIcon = require("../../../assets/icons/server.png");
const toolIcon = require("../../../assets/icons/tool.png");
const confidentialityIcon = require("../../../assets/icons/confidentiality.png");
const reportsIcon = require("../../../assets/icons/bug.png");
const supportIcon = require("../../../assets/icons/support.png");
const socialIcon = require("../../../assets/icons/social.png");
const informationIcon = require("../../../assets/icons/information.png");
const githubIcon = require("../../../assets/icons/github.png");
const operaIcon = require("../../../assets/icons/operaicon.png");
const instagramIcon = require("../../../assets/icons/instagram.png");
const tiktokIcon = require("../../../assets/icons/tiktok.png");
const micIcon = require("../../../assets/icons/microphone.png");
const cameraIcon = require("../../../assets/icons/camera.png");
const photoIcon = require("../../../assets/icons/photo.png");
const locationIcon = require("../../../assets/icons/location.png");
const calendarIcon = require("../../../assets/icons/calendar.png");
const binIcon = require("../../../assets/icons/bin.png");
const exportIcon = require("../../../assets/icons/export.png");
const messageIcon = require("../../../assets/icons/message.png");
const timeIcon = require("../../../assets/icons/time.png");
const errorIcon = require("../../../assets/icons/error.png");
const validIcon = require("../../../assets/icons/valid.png");
const ollamaImage = require("../../../assets/images/ImageCard/Ollama.png");
const ollamaErrorImage = require("../../../assets/images/ImageCard/OllamaError.png");
const ollamaInfoImage = require("../../../assets/images/ImageCard/OllamaInfo.png");
const huggingImage = require("../../../assets/images/ImageCard/Hugging.png");
const questionIcon = require("../../../assets/icons/question.png");
const infoIcon = require("../../../assets/icons/info.png");
const reconnectIcon = require("../../../assets/icons/reconnect.png");
const hyperlinkIcon = require("../../../assets/images/hyperlink2.png");

const DRAWER_SYNC_DELAY_MS = 1500;

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

type SubPage =
  | "main"
  | "general"
  | "advanced"
  | "assistantoverlay"
  | "service"
  | "beta"
  | "local"
  | "ollama"
  | "ollamaserver"
  | "ollamaserveradd"
  | "confidentiality"
  | "reports"
  | "tools"
  | "widgets"
  | "profile"
  | "cloud"
  | "mobileactions"
  | "mcpservers"
  | "mcpserver"
  | "mcpserversettings"
  | "mcpserveradd"
  | "sociallinks";

//page a subpage steps back to, followed by the header arrow and the android back button
const SUB_PAGE_PARENT: Record<SubPage, SubPage> = {
  main: "main",
  general: "main",
  advanced: "main",
  assistantoverlay: "main",
  service: "main",
  beta: "service",
  local: "service",
  ollama: "service",
  ollamaserver: "ollama",
  ollamaserveradd: "ollama",
  confidentiality: "main",
  reports: "main",
  tools: "main",
  profile: "main",
  cloud: "main",
  sociallinks: "main",
  widgets: "tools",
  mobileactions: "tools",
  mcpservers: "tools",
  mcpserver: "mcpservers",
  mcpserversettings: "mcpserver",
  mcpserveradd: "mcpservers",
};

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
          dragDrawer(
            progress,
            Math.max(0, Math.min(1, 1 - gestureState.dx / drawerWidth)),
          );
        },
        onPanResponderRelease: (_, gestureState) => {
          const velocity = -gestureVelocity(gestureState.vx, drawerWidth);
          if (gestureState.dx > drawerWidth * 0.35 || gestureState.vx > 0.5) {
            settleDrawer(progress, false, velocity);
            onClose();
          } else {
            settleDrawer(progress, true, velocity);
          }
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
  const pageAnim = useAnimatedValue(1);
  const backPulse = useAnimatedValue(0);

  useEffect(() => {
    if (!visible && activeSubPage !== (initialSubPage ?? "main")) {
      setActiveSubPage(initialSubPage ?? "main");
    }
  }, [visible]);

  const prevSubPageRef = useRef(activeSubPage);
  useEffect(() => {
    if (visible && activeSubPage !== prevSubPageRef.current) {
      playPageTransition(pageAnim);
      playBackButtonPulse(backPulse);
    }
    prevSubPageRef.current = activeSubPage;
  }, [activeSubPage, visible, pageAnim, backPulse]);

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
  const scrollRef = useRef<ScrollView>(null);

  const handleBack = useCallback(() => {
    if (activeSubPage === "main") {
      onClose();
    } else {
      setActiveSubPage(SUB_PAGE_PARENT[activeSubPage]);
    }
  }, [activeSubPage, onClose]);

  useEffect(() => {
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
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastSyncSize, setLastSyncSize] = useState<number | null>(null);

  const [addModelSheetVisible, setAddModelSheetVisible] = useState(false);
  const [hfModelInput, setHfModelInput] = useState("");
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
  const [alwaysWhisper, setAlwaysWhisperState] = useState(false);
  const [autoSpeak, setAutoSpeakState] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetailsState] = useState(false);
  const [advancedMode, setAdvancedModeState] = useState(false);
  const [useAppContext, setUseAppContextState] = useState(true);
  const [autoStartMic, setAutoStartMicState] = useState(true);
  const [usageAnalytics, setUsageAnalyticsState] = useState(true);
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
    { id: "600", label: "10m" },
    { id: "1800", label: "30m" },
    { id: "3600", label: "1h" },
    { id: "7200", label: "2h" },
    { id: "18000", label: "5h" },
    { id: "43200", label: "12h" },
    { id: "86400", label: "24h" },
    { id: "-1", label: "∞" },
  ];

  const ollamaContextLengthOptions = [
    { id: "8192", label: "8k" },
    { id: "16384", label: "16k" },
    { id: "32768", label: "32k" },
    { id: "65536", label: "64k" },
    { id: "131072", label: "128k" },
    { id: "262144", label: "256k" },
    { id: "524288", label: "512k" },
  ];

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
          style: "secondary",
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
          style: "danger",
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
        setAlwaysWhisperState(s.alwaysWhisper);
        setAutoSpeakState(s.autoSpeak);
        setShowTechnicalDetailsState(s.showTechnicalDetails);
        setAdvancedModeState(s.advancedMode);
        setUseAppContextState(s.useAppContext);
        setModelFailoverState(s.modelFailover);
        setShareInstanceUrlState(s.shareInstanceUrl || "");
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
      if (enabled === total) return `${total} tool${total === 1 ? "" : "s"}`;
      return `${enabled} of ${total} tools`;
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
  const openServerDraft = (page: SubPage) => {
    setServerDraft({
      name: "",
      url: "",
      headerName: "",
      headerValue: "",
      clientId: "",
    });
    setServerDraftBusy(false);
    setActiveSubPage(page);
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
      setActiveSubPage("mcpservers");
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
      setActiveSubPage("ollama");
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
    Settings.set("ollamaUrls", serializeOllamaServers(servers));
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
    checkOllamaServers();
    loadOllamaModels(url);
  };

  const reconnectOllamaServer = async (index: number) => {
    await checkOllamaServers();
    await loadOllamaModels(ollamaServers[index]?.url ?? "");
  };

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
  };

  const completeCloudConnect = async (v: string) => {
    const pinSet = CloudSync.hasPin();
    setHasSyncPin(pinSet);
    if (v !== "none") {
      const ui = await CloudSync.getUserInfo();
      setCloudUserInfo(ui);

      //wait to avoid ui lag
      setTimeout(async () => {
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

    //providers with a setup component need config before connecting
    if (def.SetupComponent && !(await CloudSync.isProviderConfigured(v))) {
      if (cloudProvider !== "none") {
        await CloudSync.setProvider("none");
        setCloudUserInfo(null);
        setHasSyncPin(false);
      }
      setCloudProvider(v);
      return;
    }

    await connectProvider(v);
  };

  const handleDisconnectCloud = () => {
    const label =
      getCloudProviderDefinition(cloudProvider)?.label ?? "cloud storage";
    showAlert(
      t("settings.cloud.disconnect.title", { name: label }),
      t("settings.cloud.disconnect.message"),
      [
        {
          text: t("cloudSync.disconnect"),
          style: "secondary",
          onPress: async () => {
            setAlertModalVisible(false);
            await handleSetCloudProvider("none");
          },
        },
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "primary",
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
              await CloudSync.setPin(currentInput);
              setHasSyncPin(true);
              setAlertModalVisible(false);
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
            setAlertModalVisible(false);
            const success = await CloudSync.verifyAndSetPin(currentInput);
            if (success) {
              setHasSyncPin(true);
              setTimeout(
                () =>
                  showAlert(
                    t("common.success"),
                    t("settings.pin.unlockSuccess"),
                  ),
                300,
              );
            } else {
              setTimeout(
                () =>
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
                  ]),
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

  const handleForgetSyncPin = () => {
    showAlert(t("settings.pin.reset.title"), t("settings.pin.reset.message"), [
      {
        text: t("common.cancel"),
        onPress: () => setAlertModalVisible(false),
        style: "secondary",
      },
      {
        text: "Delete & Reset",
        style: "danger",
        onPress: async () => {
          await CloudSync.forgetCode();
          setHasSyncPin(false);
          setAlertModalVisible(false);
          setTimeout(() => handleCreateSyncPin(), 400);
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
      setActiveSubPage(initialSubPage ?? "main");
      CloudSync.requestAutoSync(DRAWER_SYNC_DELAY_MS);
      refreshLastSync();
    }
  }, [visible, initialSubPage, refreshLastSync]);

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

  //ping every configured server
  const checkOllamaServers = useCallback(async () => {
    if (!settingsLoaded) return;
    const urls = ollamaServers.map((s) => s.url.trim()).filter(Boolean);
    const results = await Promise.all(
      urls.map((url) => AIModule.isSourceAvailable("ollama", url)),
    );
    const errors: Record<string, boolean> = {};
    urls.forEach((url, i) => {
      errors[url] = !results[i];
    });
    setServerErrors(errors);
  }, [settingsLoaded, ollamaServers]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        checkOllamaServers();
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
  }, [visible, checkOllamaServers, whisperModel]);

  const handleDownloadWhisper = async (modelToDownload?: string) => {
    const model = modelToDownload || whisperModel;
    if (model === "none") return;
    setIsDownloadingWhisper(true);
    setWhisperDownloadProgress(null);
    try {
      await WhisperSTT.downloadModel(
        model,
        (progress, etaSeconds, speedStr, sizeStr) => {
          setWhisperDownloadProgress({
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
      if (isDesktop) {
        settleLayoutDrawer(largeScreenAnim, false);
      } else {
        settleDrawer(progress, false);
      }
    }
  }, [visible, isDesktop, largeScreenAnim, progress]);

  //back header for subpages
  const renderSubPageHeader = (title: string, _backTo?: SubPage) => (
    <View style={styles.header}>
      <View style={styles.headerSpacer} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
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
          style={({ pressed, hovered }) => [
            styles.navItem,
            (pressed || hovered) && styles.navItemPressed,
          ]}
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

        <Pressable
          style={({ pressed, hovered }) => [
            styles.navItem,
            styles.navItemLast,
            (pressed || hovered) && styles.navItemPressed,
          ]}
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
          style={({ pressed, hovered }) => [
            styles.navItem,
            (pressed || hovered) && styles.navItemPressed,
          ]}
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

        {!isDesktop && (
          <Pressable
            style={({ pressed, hovered }) => [
              styles.navItem,
              (pressed || hovered) && styles.navItemPressed,
            ]}
            onPress={() => setActiveSubPage("assistantoverlay")}
          >
            <View style={styles.menuIconWrap}>
              <Image
                source={micIcon}
                style={styles.menuIcon}
                tintColor={Colors.textOnPrimary}
              />
            </View>
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>
                {t("settings.nav.overlay.title")}
              </Text>
              <Text style={styles.navSubtitle}>
                {t("settings.nav.overlay.subtitle")}
              </Text>
            </View>
          </Pressable>
        )}

        <Pressable
          style={({ pressed, hovered }) => [
            styles.navItem,
            (pressed || hovered) && styles.navItemPressed,
          ]}
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
          style={({ pressed, hovered }) => [
            styles.navItem,
            !advancedMode && styles.navItemLast,
            (pressed || hovered) && styles.navItemPressed,
          ]}
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
            style={({ pressed, hovered }) => [
              styles.navItem,
              styles.navItemLast,
              (pressed || hovered) && styles.navItemPressed,
            ]}
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
          style={({ pressed, hovered }) => [
            styles.navItem,
            (pressed || hovered) && styles.navItemPressed,
          ]}
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
          style={({ pressed, hovered }) => [
            styles.navItem,
            (pressed || hovered) && styles.navItemPressed,
          ]}
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
          style={({ pressed, hovered }) => [
            styles.navItem,
            styles.navItemLast,
            (pressed || hovered) && styles.navItemPressed,
          ]}
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

  // profile subpage
  const renderProfileSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.profile.title"))}

      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
          <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
            {t("settings.profile.name")}
          </Text>
          <Group>
            <TextInputField
              icon={penPlaceholderIcon}
              placeholder={t("onboarding.name.placeholder")}
              value={name}
              onChangeText={setName}
            />
          </Group>
        </View>

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
    </View>
  );

  // general subpage
  const renderGeneralSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.general.title"))}

      {/* language and appearance card */}
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

        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
            {t("settings.general.theme")}
          </Text>
          <Group>
            <SliderToggle selectedValue={theme} onSelect={setTheme} />
          </Group>
        </View>
      </View>

      {/* audio and modes card */}
      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
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
    </View>
  );

  const renderAdvancedSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.advanced.title"))}

      {/* flow, audio and technical card */}
      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
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

        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
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
              keyboardType="url"
            />
          </Group>
        </View>
      </View>
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
  const renderCloudSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.cloud.title"))}

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
          {cloudProvider !== "none" &&
            !cloudUserInfo &&
            (() => {
              const def = getCloudProviderDefinition(cloudProvider);
              if (!def?.SetupComponent) return null;
              const Setup = def.SetupComponent;
              return <Setup onDone={() => connectProvider(def.id)} />;
            })()}
          {cloudProvider !== "none" && (
            <CloudSyncBox
              userInfo={cloudUserInfo}
              status={hasSyncPin ? "ready" : "locked"}
              hasBackup={hasCloudBackup}
              lastSyncTime={lastSyncTime}
              lastSyncSize={lastSyncSize}
              onEnterPin={handleUnlockSyncPin}
              onCreatePin={handleCreateSyncPin}
              onDisconnect={handleDisconnectCloud}
              onSync={handleSyncNow}
              isSyncing={isSyncing}
            />
          )}
        </View>
      </View>
    </View>
  );

  // service subpage content
  const renderServiceSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.service.title"))}

      {/* service providers group: beta, hugging face, ollama */}
      <Group style={styles.groupSpacing}>
        {!!BETA_SERVER_URL && (
          <Pressable
            style={({ pressed, hovered }) => [
              styles.toggleGroupRowItem,
              (pressed || hovered) && styles.toggleGroupCardPressed,
            ]}
            onPress={() => setActiveSubPage("beta")}
          >
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>Opera Beta server</Text>
                <Text style={styles.helpText}>
                  A test server we host so you can try Opera without setting one
                  up.
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
          style={({ pressed, hovered }) => [
            styles.toggleGroupRowItem,
            (pressed || hovered) && styles.toggleGroupCardPressed,
          ]}
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

        <Pressable
          style={({ pressed, hovered }) => [
            styles.toggleGroupRowItem,
            styles.navItemLast,
            (pressed || hovered) && styles.toggleGroupCardPressed,
          ]}
          onPress={() => setActiveSubPage("ollama")}
        >
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <View style={styles.toggleRow}>
                <Text style={styles.settingLabel}>
                  {t("settings.service.ollama")}
                </Text>
                <IconButton
                  icon={questionIcon}
                  label={t("common.info")}
                  size={22}
                  tintColor={Colors.textMuted}
                  containerSize={32}
                  pressedColor={Colors.surfacePressed}
                  onPress={() =>
                    showAlert(
                      t("settings.service.ollama"),
                      t("settings.service.ollamaInfo"),
                      undefined,
                      { image: ollamaInfoImage, messageAlign: "left" },
                    )
                  }
                />
              </View>
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
              <View style={{ marginTop: 10 }}>
                <DownloadProgress
                  title={t("settings.whisper.downloading", {
                    model: whisperModel,
                  })}
                  progress={whisperDownloadProgress?.progress || 0}
                  sizeStr={whisperDownloadProgress?.sizeStr}
                  etaSeconds={whisperDownloadProgress?.etaSeconds}
                />
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );

  //beta provider info subpage
  const renderBetaSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Opera Beta", "service")}

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>Opera Beta server</Text>
          <Text style={[styles.helpText, { marginTop: 8 }]}>
            A test server we host so you can try Opera without setting one up.
            Everything needed to answer goes through it: your messages, your
            attachments, whatever a tool reads for you (contacts, calendar,
            screen text), and your IP address.
          </Text>
          <Text style={[styles.helpText, { marginTop: 6 }]}>
            We do not read any of it, we do not keep it, and we will never use
            it for anything. The server is shut down and wiped at the end of the
            Play Store beta.
          </Text>
          <Text style={[styles.helpText, { marginTop: 6 }]}>
            It is there for testing only. For everyday use, set up your own
            Ollama server and nothing leaves your network.
          </Text>
        </View>
      </View>
    </View>
  );

  //local provider info subpage
  const renderLocalSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.service.local"), "service")}

      <View style={styles.contentCard}>
        <View style={{ marginBottom: Spacing.xxl }}>
          <ImageCard source={huggingImage} width="100%" alt="Hugging Face" />
        </View>

        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.local.modelTitle")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.local.help")}
          </Text>

          <Group>
            <ActionButton
              icon={addIcon}
              label={t("settings.local.addModel")}
              onPress={() => setAddModelSheetVisible(true)}
            />
          </Group>
        </View>
      </View>
    </View>
  );

  //ollama server list subpage
  const renderOllamaSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Ollama", "service")}

      {/* ollama servers card */}
      <View style={styles.contentCard}>
        <View style={{ marginBottom: Spacing.xxl }}>
          <ImageCard source={ollamaImage} width="100%" alt="Ollama" />
        </View>

        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.ollama.title")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.ollama.help")}
          </Text>

          {ollamaServers.length > 0 && (
            <Group style={styles.groupSpacingTight}>
              {ollamaServers.map((server, index) => {
                const url = server.url.trim();
                const connected = url.length > 0 && serverErrors[url] === false;
                return (
                  <Pressable
                    key={index}
                    style={({ pressed, hovered }) => [
                      styles.navItem,
                      styles.mcpGroupRow,
                      (pressed || hovered) && styles.navItemPressed,
                    ]}
                    onPress={() => openOllamaServer(index)}
                  >
                    <Image
                      source={arrowIcon}
                      style={styles.menuIcon}
                      tintColor={Colors.textPrimary}
                    />
                    <Text style={styles.navLabel}>
                      {ollamaServerLabel(server)}
                    </Text>
                    <IconButton
                      icon={connected ? validIcon : errorIcon}
                      label={
                        connected
                          ? t("common.statusOk")
                          : t("common.statusError")
                      }
                      size={20}
                      tintColor={connected ? Colors.textPrimary : Colors.error}
                      containerSize={32}
                      pressedColor={Colors.surfacePressed}
                      style={styles.navStatusIcon}
                      onPress={() => {
                        if (!connected) {
                          showAlert(
                            t("settings.ollama.unreachableTitle"),
                            t("settings.ollama.unreachableInfo"),
                            undefined,
                            { image: ollamaErrorImage, messageAlign: "left" },
                          );
                        } else {
                          showAlert(
                            ollamaServerLabel(server),
                            t("settings.ollama.connected"),
                          );
                        }
                      }}
                    />
                  </Pressable>
                );
              })}
            </Group>
          )}

          <Group>
            <ActionButton
              icon={addIcon}
              label={t("settings.server.add")}
              onPress={() => openServerDraft("ollamaserveradd")}
            />
          </Group>
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

  //mcp add server form
  const renderMcpServerAddSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.server.add"), "mcpservers")}

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
    </View>
  );

  //ollama add server form
  const renderOllamaServerAddSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.server.add"), "ollama")}

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
        {renderSubPageHeader(ollamaServerLabel(server), "ollama")}

        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={styles.helpText}>{ollamaStatusLabel(server)}</Text>
          </View>

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

          {/* reconnect only while offline */}
          {!connected && (
            <View style={styles.settingRowVertical}>
              <Group>
                <ActionButton
                  icon={reconnectIcon}
                  label={
                    ollamaModelsLoading
                      ? t("settings.ollama.connecting")
                      : t("settings.ollama.reconnect")
                  }
                  disabled={ollamaModelsLoading || url.length === 0}
                  onPress={() => reconnectOllamaServer(index)}
                  style={styles.mcpGroupRow}
                />
              </Group>
            </View>
          )}

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

        {/* danger zone card */}
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group style={styles.dangerGroup}>
              <ActionButton
                icon={binIcon}
                label={t("settings.ollama.remove.action")}
                variant="highlight"
                onPress={() => removeOllamaServer(index)}
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
          <Text style={[styles.helpText, { marginBottom: 6 }]}>
            {t("settings.privacy.intro")}
          </Text>
          <Text style={styles.helpText}>
            {t("settings.privacy.localStorage")}
          </Text>
          <Text
            style={[
              styles.helpText,
              { marginTop: 4, marginBottom: Spacing.md },
            ]}
          >
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
                      {tool.displayDescription.endsWith(".")
                        ? tool.displayDescription
                        : `${tool.displayDescription}.`}
                    </Text>
                  ) : null}
                </View>
                <Toggle
                  checked={enabled}
                  onToggle={async (v) => {
                    setPluginStates((prev) => ({ ...prev, [key]: v }));
                    await PluginRegistry.setEnabled("tool", name, v);
                    //request permission at enable time
                    if (v) await tool.requestPermission?.();
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>

      {/* extensions and integrations card */}
      <View style={styles.contentCard}>
        {/* widgets block */}
        <View style={styles.settingRowVertical}>
          <Text style={styles.settingLabel}>
            {t("settings.tools.widgets.title")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.tools.widgets.help", {
              list: allWidgets.map((w) => w.name).join(", "),
            })}
          </Text>

          <Group>
            <Pressable
              style={({ pressed, hovered }) => [
                styles.navItem,
                styles.navItemLast,
                (pressed || hovered) && styles.navItemPressed,
              ]}
              onPress={() => setActiveSubPage("widgets")}
            >
              <Image
                source={arrowIcon}
                style={styles.menuIcon}
                tintColor={Colors.textPrimary}
              />
              <Text style={styles.navLabel}>
                {t("settings.tools.widgets.see")}
              </Text>
            </Pressable>
          </Group>
        </View>

        {/* mcp block */}
        <View
          style={[styles.settingRowVertical, isDesktop && { marginBottom: 0 }]}
        >
          <Text style={styles.settingLabel}>
            {t("settings.tools.mcp.title")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.tools.mcp.help")}
          </Text>

          <Group>
            <Pressable
              style={({ pressed, hovered }) => [
                styles.navItem,
                styles.navItemLast,
                (pressed || hovered) && styles.navItemPressed,
              ]}
              onPress={() => setActiveSubPage("mcpservers")}
            >
              <Image
                source={arrowIcon}
                style={styles.menuIcon}
                tintColor={Colors.textPrimary}
              />
              <Text style={styles.navLabel}>{t("settings.tools.mcp.see")}</Text>
            </Pressable>
          </Group>
        </View>

        {/* mobile actions block */}
        {!isDesktop && (
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={styles.settingLabel}>
              {t("settings.tools.mobile.title")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.tools.mobile.help", {
                list: mobileTools
                  .map(
                    (tool) => tool.displayName ?? tool.definition.function.name,
                  )
                  .join(", "),
              })}
            </Text>

            <Group>
              <Pressable
                style={({ pressed, hovered }) => [
                  styles.navItem,
                  styles.navItemLast,
                  (pressed || hovered) && styles.navItemPressed,
                ]}
                onPress={() => setActiveSubPage("mobileactions")}
              >
                <Image
                  source={arrowIcon}
                  style={styles.menuIcon}
                  tintColor={Colors.textPrimary}
                />
                <Text style={styles.navLabel}>
                  {t("settings.tools.mobile.see")}
                </Text>
              </Pressable>
            </Group>
          </View>
        )}
      </View>
    </View>
  );

  //mcp list page
  const renderMcpServersSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.tools.mcp.title"), "tools")}

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.tools.mcp.help")}
          </Text>

          {mcpServers.length > 0 && (
            <Group style={styles.groupSpacingTight}>
              {mcpServers.map((server) => (
                <Pressable
                  key={server.id}
                  style={({ pressed, hovered }) => [
                    styles.navItem,
                    styles.mcpGroupRow,
                    (pressed || hovered) && styles.navItemPressed,
                  ]}
                  onPress={() => {
                    setMcpDetailId(server.id);
                    setActiveSubPage("mcpserver");
                  }}
                >
                  <Image
                    source={arrowIcon}
                    style={styles.menuIcon}
                    tintColor={Colors.textPrimary}
                  />
                  <Text style={styles.navLabel}>{server.name}</Text>
                  {mcpNeedsAuth(server.id) ? (
                    <IconButton
                      icon={infoIcon}
                      label={t("common.info")}
                      size={22}
                      tintColor={Colors.textMuted}
                      containerSize={32}
                      pressedColor={Colors.surfacePressed}
                      style={styles.navStatusIcon}
                      onPress={() => showMcpAuthInfo(server.id)}
                    />
                  ) : (
                    <Text style={styles.navStatus}>
                      {mcpStatusLabel(server.id)}
                    </Text>
                  )}
                </Pressable>
              ))}
            </Group>
          )}

          <Group>
            <ActionButton
              icon={addIcon}
              label={t("settings.server.add")}
              onPress={() => openServerDraft("mcpserveradd")}
            />
          </Group>
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
        {renderSubPageHeader(server.name, "mcpservers")}

        {/* server status and actions card */}
        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={styles.helpText}>{mcpStatusLabel(server.id)}</Text>
            {status.error ? (
              <Text
                style={[styles.helpText, { marginTop: 6, color: Colors.error }]}
              >
                {status.error}
              </Text>
            ) : null}
          </View>

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {server.name}
            </Text>
            <Group
              style={
                status.state !== "connected"
                  ? styles.groupSpacingTight
                  : undefined
              }
            >
              <Pressable
                style={({ pressed, hovered }) => [
                  styles.navItem,
                  styles.mcpGroupRow,
                  (pressed || hovered) && styles.navItemPressed,
                ]}
                onPress={() => setActiveSubPage("mcpserversettings")}
              >
                <Image
                  source={arrowIcon}
                  style={styles.menuIcon}
                  tintColor={Colors.textPrimary}
                />
                <Text style={styles.navLabel}>
                  {t("settings.server.settings")}
                </Text>
              </Pressable>
            </Group>

            {/* reconnect only while offline */}
            {status.state !== "connected" && (
              <Group>
                <ActionButton
                  icon={reconnectIcon}
                  label={
                    busy
                      ? t("settings.mcp.connecting")
                      : t("settings.mcp.reconnect")
                  }
                  disabled={busy || !server.url.trim()}
                  onPress={() => connectMcpServer(server.id)}
                  style={styles.mcpGroupRow}
                />
              </Group>
            )}
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
                          {tool.displayName}
                        </Text>
                        {tool.displayDescription ? (
                          <Text style={styles.helpText}>
                            {tool.displayDescription}
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

        {/* danger zone card */}
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group style={styles.dangerGroup}>
              <ActionButton
                icon={binIcon}
                label={t("settings.mcp.remove.action")}
                variant="highlight"
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
        {renderSubPageHeader(t("settings.server.settings"), "mcpserver")}

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
      {renderSubPageHeader(t("settings.tools.widgets.title"), "tools")}

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
                    {widget.description.split(".")[0]}.
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
      {renderSubPageHeader(t("settings.tools.mobile.title"), "tools")}

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
                      {tool.displayDescription.endsWith(".")
                        ? tool.displayDescription
                        : `${tool.displayDescription}.`}
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

  const getSubPageContent = () => {
    switch (activeSubPage) {
      case "profile":
        return renderProfileSubPage();
      case "cloud":
        return renderCloudSubPage();
      case "general":
        return renderGeneralSubPage();
      case "assistantoverlay":
        return renderAssistantOverlaySubPage();
      case "service":
        return renderServiceSubPage();
      case "beta":
        return renderBetaSubPage();
      case "local":
        return renderLocalSubPage();
      case "ollama":
        return renderOllamaSubPage();
      case "ollamaserver":
        return renderOllamaServerSubPage();
      case "ollamaserveradd":
        return renderOllamaServerAddSubPage();
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
      case "mcpserveradd":
        return renderMcpServerAddSubPage();
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
        {isScrolled && (
          <View style={styles.fixedBackShadow} pointerEvents="none" />
        )}
        <Animated.View
          style={{
            transform: [
              {
                scale: backPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.3],
                }),
              },
            ],
            opacity: backPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.3],
            }),
          }}
        >
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            style={({ pressed, hovered }) => [
              styles.fixedBackButton,
              isScrolled
                ? styles.fixedBackButtonScrolled
                : styles.fixedBackButtonUnscrolled,
              (pressed || hovered) &&
                (isScrolled
                  ? { backgroundColor: Colors.surfacePressed }
                  : { opacity: 0.6 }),
            ]}
          >
            <Image
              source={activeSubPage === "main" ? cancelIcon : arrowIcon}
              style={
                activeSubPage === "main" ? styles.closeIcon : styles.backIcon
              }
              tintColor={Colors.textPrimary}
            />
          </Pressable>
        </Animated.View>
      </View>

      <ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: isDesktop ? 0 : 60,
          paddingBottom: 40,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            flex: 1,
            opacity: pageAnim,
            transform: [
              {
                translateY: pageAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          }}
        >
          {getSubPageContent()}
        </Animated.View>
      </ScrollView>

      <LinearGradient
        colors={[Colors.groupedBackground, Colors.groupedBackgroundFade, Colors.groupedBackgroundClear]}
        style={styles.gradientTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[Colors.groupedBackgroundClear, Colors.groupedBackgroundFade, Colors.groupedBackground]}
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

  const addModelSheet = (
    <DrawerSheet
      visible={addModelSheetVisible}
      onClose={() => setAddModelSheetVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      sheetStyle={[
        styles.addModelSheet,
        { paddingBottom: Platform.OS === "ios" ? 34 : 20 },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      <View style={styles.addModelSheetContent}>
        <Group>
          <TextInputField
            icon={searchIcon}
            placeholder={t("settings.local.addModelPlaceholder")}
            value={hfModelInput}
            onChangeText={setHfModelInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Group>
      </View>
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
          isDesktop ? styles.floatingContainer : styles.attachedContainer,
          {
            width: largeScreenWidth,
            opacity: largeScreenOpacity,
            marginLeft: isDesktop ? largeScreenMargin : 0,
            marginRight: isDesktop ? largeScreenMargin : 0,
            overflow: "hidden",
          },
        ]}
      >
        <View style={{ width: 320, flex: 1 }}>
          <View
            style={isDesktop ? styles.floatingContent : styles.attachedContent}
          >
            {innerContent}
          </View>
        </View>
        {notificationModal}
        {addModelSheet}
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
    attachedContainer: {
      borderLeftWidth: 1,
      borderLeftColor: Colors.overlaySubtle,
    },
    floatingContent: {
      flex: 1,
      paddingTop: 24,
      paddingHorizontal: Spacing.lg2,
    },
    attachedContent: {
      flex: 1,
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
    fixedBackShadow: {
      position: "absolute",
      top: 4,
      left: -4,
      width: 40,
      height: 40,
      backgroundColor: Colors.shadowInk,
      borderRadius: Radius.xxl,
    },
    fixedBackButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
      zIndex: 1,
    },
    fixedBackButtonScrolled: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl,
    },
    fixedBackButtonUnscrolled: {
      backgroundColor: "transparent",
      borderRadius: Radius.xxl,
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
    backIcon: {
      width: 18,
      height: 18,
      transform: [{ rotate: "-180deg" }],
    },
    closeIcon: {
      width: 18,
      height: 18,
    },
    gradientTop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 60,
      zIndex: 10,
    },
    gradientBottom: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
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
    addModelSheetContent: {
      paddingHorizontal: Spacing.lg2,
      paddingTop: Spacing.sm,
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
    navLabel: {
      flex: 1,
      fontSize: FontSizes.body,
      fontFamily: Fonts.mono,
      color: Colors.textPrimary,
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
    toggleRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
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
    toggleGroupCard: {
      overflow: "hidden",
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
    },
    downloadOption: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: Colors.surfaceSubtle,
      padding: 12,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.codeBlockText,
      borderStyle: "dashed",
      gap: 10,
      marginBottom: 20,
    },
    downloadIcon: {
      width: 20,
      height: 20,
    },
    downloadText: {
      fontSize: FontSizes.bodyMd,
      color: Colors.primary,
      fontFamily: Fonts.mono,
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
    mcpGroupRow: {
      height: 44,
      paddingVertical: 0,
      gap: 10,
    },
    navStatus: {
      marginLeft: "auto",
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      color: Colors.textMuted,
    },
    navStatusIcon: {
      marginLeft: "auto",
    },
    dangerGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroupDisabled: {
      opacity: 0.5,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: Fonts.mono,
      color: Colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 10,
      marginTop: 4,
    },
    versionText: {
      textAlign: "center",
      fontSize: FontSizes.label,
      fontFamily: Fonts.mono,
      color: Colors.textMuted,
      marginTop: "auto",
      paddingTop: 16,
    },
  });
