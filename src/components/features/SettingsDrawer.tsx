import * as Calendar from "expo-calendar";
import Constants from "expo-constants";
import * as Contacts from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library/legacy";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, BackHandler, DeviceEventEmitter, Image, Keyboard, Linking, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts, FontSizes, Radius, ThemeColors } from "../../../constants/theme";
import { AIModule } from "../../services/ai/AIModule";
import { getLocalProviderLabel } from "../../services/ai/providers/LocalProvider";
import { getEnabledProviders, getOllamaUrls, serializeOllamaUrls, serializeProviders } from "../../services/ai/providers/sources";
import { ITool } from "../../services/ai/tools/ITool";
import { ToolManager } from "../../services/ai/tools/ToolManager";
import { BackupService, ImportInspection } from "../../services/BackupService";
import { CloudUserInfo } from "../../services/cloud/CloudProvider";
import { CLOUD_PROVIDERS, getCloudProviderDefinition } from "../../services/cloud/registry";
import { CloudSync } from "../../services/CloudSyncService";
import { AppEvents } from "../../services/events";
import { PluginRegistry } from "../../services/plugins/PluginRegistry";
import { Settings } from "../../services/settings/SettingsService";
import { WhisperSTT } from "../../services/speech/STTService";
import { IWidget, WidgetManager } from "../../services/widgets/WidgetManager";
import ActionButton from "../ui/ActionButton";
import DownloadProgress from "../ui/DownloadProgress";
import NotificationModal, { ModalButton } from "../ui/NotificationModal";
import Selector from "../ui/Selector";
import Slider from "../ui/Slider";
import SliderToggle from "../ui/SliderToggle";
import TextInputField from "../ui/TextInputField";
import Toggle from "../ui/Toggle";
import CloudSyncBox from "./CloudSyncBox";

import { useResponsive } from "../../hooks/useResponsive";

import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { setThemeMode, useColors, useThemedStyles } from "../../hooks/useTheme";
import { dragDrawer, drawerWidthFor, gestureVelocity, playPageTransition, settingsProgress, settleDrawer, settleLayoutDrawer } from "./drawerAnimation";

const linkIcon = require("../../../assets/icons/link.png");
const addIcon = require("../../../assets/icons/add.png");
const downloadIcon = require("../../../assets/icons/download.png");
const deleteIcon = require("../../../assets/icons/delete.png");
const penPlaceholderIcon = require("../../../assets/icons/pencil.png");
const profilIcon = require("../../../assets/icons/profil.png");
const cloudIcon = require("../../../assets/icons/cloud.png");
const arrowIcon = require("../../../assets/icons/arrow.png");
const generalIcon = require("../../../assets/icons/general.png");
const serverIcon = require("../../../assets/icons/server.png");
const toolIcon = require("../../../assets/icons/tool.png");
const confidentialityIcon = require("../../../assets/icons/confidentiality.png");
const socialIcon = require("../../../assets/icons/social.png");
const micIcon = require("../../../assets/icons/microphone.png");
const cameraIcon = require("../../../assets/icons/camera.png");
const photoIcon = require("../../../assets/icons/photo.png");
const locationIcon = require("../../../assets/icons/location.png");
const calendarIcon = require("../../../assets/icons/calendar.png");
const binIcon = require("../../../assets/icons/bin.png");
const exportIcon = require("../../../assets/icons/export.png");
const messageIcon = require("../../../assets/icons/message.png");
const timeIcon = require("../../../assets/icons/time.png");

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

type SubPage = "main" | "general" | "assistantoverlay" | "service" | "confidentiality" | "tools" | "widgets" | "profile" | "cloud" | "mobileactions";

export default function SettingsDrawer({ visible, onClose, onDataChanged, isLargeScreen = false, isDesktop = false, initialSubPage }: SettingsDrawerProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { width } = useResponsive();
  const drawerWidth = drawerWidthFor(width);
  const progress = settingsProgress;
  const panResponder = useMemo(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        dragDrawer(progress, Math.max(0, Math.min(1, 1 - gestureState.dx / drawerWidth)));
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
    })
    , [onClose, drawerWidth, progress]);

  const [activeSubPage, setActiveSubPage] = useState<SubPage>(initialSubPage ?? "main");
  const pageAnim = useAnimatedValue(1);

  useEffect(() => {
    if (!visible && activeSubPage !== (initialSubPage ?? "main")) {
      setActiveSubPage(initialSubPage ?? "main");
    }
  }, [visible]);

  const prevSubPageRef = useRef(activeSubPage);
  useEffect(() => {
    if (visible && activeSubPage !== prevSubPageRef.current) {
      playPageTransition(pageAnim);
    }
    prevSubPageRef.current = activeSubPage;
  }, [activeSubPage, visible, pageAnim]);

  //native back navigates back in the menu, then lets parent close the drawer
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeSubPage === "mobileactions" || activeSubPage === "widgets") {
        setActiveSubPage("tools");
        return true;
      }
      if (activeSubPage !== "main") {
        setActiveSubPage("main");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [visible, activeSubPage]);

  const [language, setLanguageState] = useState("en");
  const [theme, setThemeState] = useState("system");
  const [aiService, setAiServiceState] = useState("ollama");
  const [localAvailable, setLocalAvailable] = useState(false);
  const [ollamaUrl, setOllamaUrlState] = useState("");
  const [ollamaUrls, setOllamaUrlsState] = useState<string[]>([]);
  const [enabledProviders, setEnabledProvidersState] = useState<string[]>([]);
  const [ollamaContextLength, setOllamaContextLengthState] = useState("");
  const [ollamaKeepAlive, setOllamaKeepAliveState] = useState("300");
  //unreachable server url
  const [serverErrors, setServerErrors] = useState<Record<string, boolean>>({});
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [, setIsDownloading] = useState(false);
  const [, setGemmaDownloadProgress] = useState<{ progress: number, etaSeconds: number, speedStr: string, sizeStr: string } | null>(null);

  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastSyncSize, setLastSyncSize] = useState<number | null>(null);

  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [exportScopeVisible, setExportScopeVisible] = useState(false);
  const [importScopeVisible, setImportScopeVisible] = useState(false);
  const [exportSelection, setExportSelection] = useState({ settings: true, conversations: true });
  const [importSelection, setImportSelection] = useState({ settings: true, conversations: true });
  const [importInspection, setImportInspection] = useState<ImportInspection | null>(null);
  const [alertConfig, setAlertConfig] = useState<{
    title: string,
    message: string,
    buttons?: ModalButton[],
    showInput?: boolean,
    inputValue?: string,
    onInputChange?: (text: string) => void,
    inputPlaceholder?: string,
    inputSecureTextEntry?: boolean,
    inputKeyboardType?: any,
  }>({ title: '', message: '' });

  const showAlert = (title: string, message: string, buttons?: ModalButton[], extraProps?: any) => {
    setAlertConfig({ title, message, buttons, ...extraProps });
    setAlertModalVisible(true);
  };
  const [whisperModel, setWhisperModelState] = useState("none");
  const [, setWhisperInstalled] = useState<boolean>(false);
  const [installedWhisperModels, setInstalledWhisperModels] = useState<Record<string, boolean>>({});
  const [isDownloadingWhisper, setIsDownloadingWhisper] = useState(false);
  const [whisperDownloadProgress, setWhisperDownloadProgress] = useState<{ progress: number, etaSeconds: number, speedStr: string, sizeStr: string } | null>(null);
  const [, setWhisperLanguageState] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0] || "auto";
    } catch {
      return "auto";
    }
  });
  const [instruction, setInstructionState] = useState("");
  const [name, setNameState] = useState("");
  const [alwaysWhisper, setAlwaysWhisperState] = useState(false);
  const [autoSpeak, setAutoSpeakState] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetailsState] = useState(false);
  const [useAppContext, setUseAppContextState] = useState(true);
  const [autoStartMic, setAutoStartMicState] = useState(true);
  const [usageAnalytics, setUsageAnalyticsState] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  //plugin enabled states (tool name or widget id -> bool)
  const [pluginStates, setPluginStates] = useState<Record<string, boolean>>({});

  const allTools: ITool[] = ToolManager.getAllTools();
  const generalTools = allTools.filter(t => !MOBILE_TOOL_NAMES.has(t.definition.function.name));
  const mobileTools = allTools.filter(t => MOBILE_TOOL_NAMES.has(t.definition.function.name));
  const allWidgets: IWidget[] = WidgetManager.getAllWidgets();

  const [cloudProvider, setCloudProvider] = useState<string>("none");
  const [cloudUserInfo, setCloudUserInfo] = useState<CloudUserInfo | null>(null);
  const [hasSyncPin, setHasSyncPin] = useState(false);
  const [hasCloudBackup, setHasCloudBackup] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [, setOllamaModelOptions] = useState<{ id: string, label: string }[]>([]);

  const languageOptions = [
    { id: "en", label: "English" },
    { id: "fr", label: "Français" },
  ];

  const cloudStorageOptions = [
    { id: "none", label: "None" },
    ...CLOUD_PROVIDERS.map(def => ({ id: def.id, label: def.label })),
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
  const [permissionStatuses, setPermissionStatuses] = useState<Record<"microphone" | "camera" | "location" | "photos" | "contacts" | "calendar", PermissionState>>({
    microphone: "undetermined",
    camera: "undetermined",
    location: "undetermined",
    photos: "undetermined",
    contacts: "undetermined",
    calendar: "undetermined",
  });

  const refreshPermissionStatuses = useCallback(async () => {
    const [mic, camera, location, photos, contacts, calendar] = await Promise.all([
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
    if (!visible || activeSubPage !== "confidentiality" || Platform.OS === "web") return;
    refreshPermissionStatuses();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermissionStatuses();
    });
    return () => sub.remove();
  }, [visible, activeSubPage, refreshPermissionStatuses]);

  const renderPermissionBadge = (status: PermissionState) => (
    <View style={[styles.permissionBadge, status === "granted" && styles.permissionBadgeAllowed]}>
      <Text style={[styles.permissionBadgeText, status === "granted" && styles.permissionBadgeTextAllowed]}>
        {status === "granted" ? "Allowed" : status === "denied" ? "Denied" : "Not defined"}
      </Text>
    </View>
  );

  const handleExportData = () => {
    setExportSelection({ settings: true, conversations: true });
    setExportScopeVisible(true);
  };

  const runExport = async (includeSettings: boolean, includeConversations: boolean) => {
    setExportScopeVisible(false);
    try {
      const ok = await BackupService.exportData({ includeSettings, includeConversations });
      if (ok) showAlert("Export", "Data exported successfully.");
    } catch {
      showAlert("Error", "Failed to export data.");
    }
  };

  const handleImportData = async () => {
    setImportInspection(null);
    try {
      const inspection = await BackupService.pickAndReadBackup();
      if (!inspection) return;
      setImportInspection(inspection);
      setImportSelection({
        settings: inspection.hasSettings,
        conversations: inspection.hasConversations,
      });
      setImportScopeVisible(true);
    } catch {
      showAlert("Error", "Failed to read the backup file.");
    }
  };

  const runImport = async (includeSettings: boolean, includeConversations: boolean) => {
    setImportScopeVisible(false);
    try {
      const result = await BackupService.importData(
        { includeSettings, includeConversations },
        importInspection?.backup
      );
      if (result.success) {
        onDataChanged?.();
        showAlert("Import", result.warning ?? "Data imported successfully.");
      }
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : "Failed to import data.";
      showAlert("Error", message);
    }
  };

  const handleDeleteAllConversations = () => {
    showAlert(
      "Delete All Conversations",
      "This will permanently delete all conversations. This action cannot be undone.",
      [
        {
          text: "Delete All",
          style: "secondary",
          onPress: async () => {
            setAlertModalVisible(false);
            try {
              await BackupService.deleteAllConversations();
              onDataChanged?.();
              showAlert("Done", "All conversations deleted.");
            } catch {
              showAlert("Error", "Failed to delete conversations.");
            }
          },
        },
        { text: "Cancel", onPress: () => setAlertModalVisible(false), style: "danger" },
      ]
    );
  };

  const handleDeleteWhisper = () => {
    if (whisperModel === "none") return;
    showAlert(
      "Delete Whisper Model",
      `Are you sure you want to delete the Whisper ${whisperModel} model?`,
      [
        { text: "Cancel", onPress: () => setAlertModalVisible(false), style: "secondary" },
        {
          text: "Delete",
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            try {
              await WhisperSTT.deleteModel(whisperModel);
              setWhisperInstalled(false);
              setInstalledWhisperModels(prev => ({ ...prev, [whisperModel]: false }));
            } catch (e) {
              console.error("Failed to delete whisper model", e);
            }
          }
        }
      ]
    );
  };

  const whisperModelOptions = [
    { id: "none", label: "None" },
    {
      id: "tiny",
      label: "Tiny",
      isDownload: !installedWhisperModels["tiny"],
      ...(installedWhisperModels["tiny"] && whisperModel === "tiny"
        ? { rightIcon: deleteIcon, rightIconTintColor: Colors.surface, onRightIconPress: handleDeleteWhisper }
        : {}),
    },
    {
      id: "base",
      label: "Base",
      isDownload: !installedWhisperModels["base"],
      ...(installedWhisperModels["base"] && whisperModel === "base"
        ? { rightIcon: deleteIcon, rightIconTintColor: Colors.surface, onRightIconPress: handleDeleteWhisper }
        : {}),
    },
    {
      id: "small",
      label: "Small",
      isDownload: !installedWhisperModels["small"],
      ...(installedWhisperModels["small"] && whisperModel === "small"
        ? { rightIcon: deleteIcon, rightIconTintColor: Colors.surface, onRightIconPress: handleDeleteWhisper }
        : {}),
    },
  ];

  const getWhisperSize = (model: string) => {
    switch (model) {
      case "tiny": return "31 MB";
      case "base": return "57 MB";
      case "small": return "180 MB";
      default: return "";
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
        setOllamaUrlsState(getOllamaUrls());
        setEnabledProvidersState(getEnabledProviders());
        setOllamaContextLengthState(s.ollamaContextLength && s.ollamaContextLength !== 8192 ? String(s.ollamaContextLength) : "");
        setOllamaKeepAliveState(String(s.ollamaKeepAlive ?? 300));
        setWhisperModelState(s.whisperModel);
        setWhisperLanguageState(s.whisperLanguage);
        setInstructionState(s.instruction);
        setNameState(s.name || "");
        setAlwaysWhisperState(s.alwaysWhisper);
        setAutoSpeakState(s.autoSpeak);
        setShowTechnicalDetailsState(s.showTechnicalDetails);
        setUseAppContextState(s.useAppContext);
        //apply to services
        AIModule.configure(s.ollamaUrl, s.ollamaContextLength, s.ollamaKeepAlive);
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

  //load plugin states when settings tab opens
  useEffect(() => {
    if (activeSubPage !== 'tools' && activeSubPage !== 'widgets' && activeSubPage !== 'mobileactions') return;
    const states: Record<string, boolean> = {};
    for (const tool of ToolManager.getAllTools()) {
      const name = tool.definition.function.name;
      states[`tool:${name}`] = PluginRegistry.isEnabled('tool', name, tool.enabledByDefault ?? false);
    }
    for (const widget of WidgetManager.getAllWidgets()) {
      states[`widget:${widget.id}`] = PluginRegistry.isEnabled('widget', widget.id, widget.enabledByDefault ?? false);
    }
    setPluginStates(states);
  }, [activeSubPage]);

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

  //fallback when caller did not change value
  const effectiveContextLength = (raw: string = ollamaContextLength) => {
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) || parsed <= 0 ? 8192 : parsed;
  };

  const effectiveKeepAlive = (raw: string = ollamaKeepAlive) => {
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? 300 : parsed;
  };

  //keep active server in the list
  const saveOllamaUrls = (urls: string[]) => {
    setOllamaUrlsState(urls);
    const filled = urls.map(u => u.trim()).filter(Boolean);
    const activeUrl = filled.includes(ollamaUrl.trim()) ? ollamaUrl : (filled[0] ?? "");
    Settings.set("ollamaUrls", serializeOllamaUrls(urls));
    if (activeUrl !== ollamaUrl) {
      setOllamaUrlState(activeUrl);
      Settings.set("ollamaUrl", activeUrl);
      AIModule.configure(activeUrl, effectiveContextLength(), effectiveKeepAlive());
    }
  };

  const setOllamaUrlAt = (index: number, value: string) => {
    saveOllamaUrls(ollamaUrls.map((url, i) => (i === index ? value : url)));
  };

  const setOllamaContextLength = (v: string) => {
    setOllamaContextLengthState(v);
    Settings.set("ollamaContextLength", effectiveContextLength(v));
    AIModule.configure(ollamaUrl, effectiveContextLength(v), effectiveKeepAlive());
  };

  const setOllamaKeepAlive = (v: string) => {
    setOllamaKeepAliveState(v);
    Settings.set("ollamaKeepAlive", effectiveKeepAlive(v));
    AIModule.configure(ollamaUrl, effectiveContextLength(), effectiveKeepAlive(v));
  };

  //drop server on empty field
  const handleOllamaUrlBlur = (index: number) => {
    if (!ollamaUrls[index]?.trim()) {
      saveOllamaUrls(ollamaUrls.filter((_, i) => i !== index));
      return;
    }
    checkOllamaServers();
  };

  const setProviderEnabled = (id: string, enabled: boolean) => {
    const next = enabled
      ? [...enabledProviders.filter(p => p !== id), id]
      : enabledProviders.filter(p => p !== id);
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
        setInstalledWhisperModels(prev => ({ ...prev, [v]: installed }));
        if (installed) {
          WhisperSTT.init(v).then((success) => {
            if (!success) {
              showAlert("Error", `Failed to load Whisper model ${v}. It might be corrupted.`);
              setWhisperInstalled(false);
              setInstalledWhisperModels(prev => ({ ...prev, [v]: false }));
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
      showAlert("Connection Error", `Could not connect to ${getCloudProviderDefinition(providerName)?.label ?? providerName}. Check your settings and try again.`);
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
    const label = getCloudProviderDefinition(cloudProvider)?.label ?? "cloud storage";
    showAlert(`Disconnect ${label}?`, "Your account will be unlinked and automatic backups will stop. Your existing cloud backup won't be deleted.", [
      {
        text: "Disconnect", style: "secondary", onPress: async () => {
          setAlertModalVisible(false);
          await handleSetCloudProvider("none");
        }
      },
      { text: "Cancel", onPress: () => setAlertModalVisible(false), style: "primary" },
    ]);
  };

  const handleCreateSyncPin = () => {
    let currentInput = "";
    showAlert("Create Sync PIN", "No cloud backup found. Create a 4 to 6 digit PIN. If you forget this PIN, you will lose access to your cloud backups.", [
      { text: "Cancel", onPress: () => setAlertModalVisible(false), style: "secondary" },
      {
        text: "Create", style: "primary", onPress: async () => {
          if (currentInput.length >= 4 && currentInput.length <= 6) {
            await CloudSync.setPin(currentInput);
            setHasSyncPin(true);
            setAlertModalVisible(false);
            handleSyncNow();
          } else {
            setAlertModalVisible(false);
            setTimeout(() => showAlert("Error", "PIN must be 4 to 6 digits."), 300);
          }
        }
      }
    ], {
      showInput: true,
      inputPlaceholder: "Enter 4-6 digits",
      inputSecureTextEntry: true,
      inputKeyboardType: "numeric",
      onInputChange: (text: string) => {
        currentInput = text;
        setAlertConfig(prev => ({ ...prev, inputValue: text }));
      }
    });
  };

  const handleUnlockSyncPin = () => {
    let currentInput = "";
    showAlert("Unlock Cloud Backup", "A cloud backup was found. Enter your PIN to unlock it and resume sync.", [
      { text: "Forgot Code", onPress: handleForgetSyncPin, style: "secondary" },
      {
        text: "Unlock", style: "primary", onPress: async () => {
          setAlertModalVisible(false);
          const success = await CloudSync.verifyAndSetPin(currentInput);
          if (success) {
            setHasSyncPin(true);
            setTimeout(() => showAlert("Success", "Backup unlocked successfully!"), 300);
          } else {
            setTimeout(() => showAlert("Error", "Incorrect PIN. Could not decrypt backup.", [
              { text: "Try Again", onPress: handleUnlockSyncPin, style: "primary" },
              { text: "Cancel", onPress: () => setAlertModalVisible(false), style: "secondary" }
            ]), 300);
          }
        }
      }
    ], {
      showInput: true,
      inputPlaceholder: "Enter 4-6 digits",
      inputSecureTextEntry: true,
      inputKeyboardType: "numeric",
      onInputChange: (text: string) => {
        currentInput = text;
        setAlertConfig(prev => ({ ...prev, inputValue: text }));
      }
    });
  };

  const handleForgetSyncPin = () => {
    showAlert("Reset Backup?", "This will permanently delete your existing cloud backup so you can create a new PIN. Are you sure?", [
      { text: "Cancel", onPress: () => setAlertModalVisible(false), style: "secondary" },
      {
        text: "Delete & Reset", style: "danger", onPress: async () => {
          await CloudSync.forgetCode();
          setHasSyncPin(false);
          setAlertModalVisible(false);
          setTimeout(() => handleCreateSyncPin(), 400);
        }
      }
    ]);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    const result = await CloudSync.sync();
    setIsSyncing(false);
    if (result.success) {
      onDataChanged?.();
      await refreshLastSync();
      showAlert("Success", "Data synchronized successfully.");
    } else {
      showAlert("Sync Error", result.error || "Unknown error occurred.");
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
    const sub = DeviceEventEmitter.addListener(AppEvents.syncPinInvalidated, async () => {
      setHasSyncPin(false);
      setHasCloudBackup(await CloudSync.hasCloudBackup());
    });
    return () => sub.remove();
  }, []);

  //ping every configured server
  const checkOllamaServers = useCallback(async () => {
    if (!settingsLoaded) return;
    const urls = ollamaUrls.map(u => u.trim()).filter(Boolean);
    const results = await Promise.all(urls.map(url => AIModule.isSourceAvailable("ollama", url)));
    const errors: Record<string, boolean> = {};
    urls.forEach((url, i) => { errors[url] = !results[i]; });
    setServerErrors(errors);
  }, [settingsLoaded, ollamaUrls]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        checkOllamaServers();
        if (Platform.OS === "web") {
          ["tiny", "base", "small"].forEach(m => {
            WhisperSTT.isModelInstalled(m).then(installed => {
              setInstalledWhisperModels(prev => ({ ...prev, [m]: installed }));
            });
          });
          if (whisperModel && whisperModel !== "none") {
            WhisperSTT.isModelInstalled(whisperModel).then(setWhisperInstalled);
          }
        }
      }, 300);
    }
  }, [visible, checkOllamaServers, whisperModel]);

  const handleDownloadGemma = async () => {
    setDownloadModalVisible(false);
    setIsDownloading(true);
    setGemmaDownloadProgress(null);
    try {
      await AIModule.downloadService("gemma4", (progress, etaSeconds, speedStr, sizeStr) => {
        setGemmaDownloadProgress({ progress, etaSeconds, speedStr, sizeStr });
      });
      const fetchedModels = await AIModule.getAvailableModels();
      if (fetchedModels && fetchedModels.length > 0) {
        const options = fetchedModels.map((m: string) => ({
          id: m,
          label: m,
        }));
        setOllamaModelOptions(options);
      }
    } catch (e) {
      console.error("Failed to download gemma4", e);
      showAlert("Error", "Failed to download model.");
    } finally {
      setIsDownloading(false);
      setGemmaDownloadProgress(null);
    }
  };

  const handleDownloadWhisper = async (modelToDownload?: string) => {
    const model = modelToDownload || whisperModel;
    if (model === "none") return;
    setIsDownloadingWhisper(true);
    setWhisperDownloadProgress(null);
    try {
      await WhisperSTT.downloadModel(model, (progress, etaSeconds, speedStr, sizeStr) => {
        setWhisperDownloadProgress({ progress, etaSeconds, speedStr, sizeStr });
      });
      setWhisperInstalled(true);
      setInstalledWhisperModels(prev => ({ ...prev, [model]: true }));
      setWhisperModel(model);
      showAlert("Success", `Whisper ${model} model downloaded successfully.`);
    } catch (e) {
      console.error("Failed to download whisper model", e);
      showAlert("Error", "Failed to download Whisper model.");
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
      "Download Whisper Model",
      `Are you sure you want to download the Whisper ${v} model (${getWhisperSize(v)})?`,
      [
        { text: "Cancel", onPress: () => setAlertModalVisible(false), style: "secondary" },
        {
          text: "Download",
          onPress: () => {
            setAlertModalVisible(false);
            handleDownloadWhisper(v);
          }
        }
      ]
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

  // back header for subpages
  const renderSubPageHeader = (title: string, backTo: SubPage = "main") => (
    <View style={styles.subPageHeader}>
      <Text style={[styles.title, { marginBottom: 12 }]}>{title}</Text>
      <Pressable
        onPress={() => setActiveSubPage(backTo)}
        hitSlop={12}
        style={({ pressed, hovered }) => [styles.backButton, (pressed || hovered) && { opacity: 0.6 }]}
      >
        <Image source={arrowIcon} style={styles.backIcon} tintColor={Colors.textPrimary} />
      </Pressable>
    </View>
  );

  // main navigation page content
  const renderMainPage = () => (
    <View style={styles.menuContainer}>
      <Text style={styles.title}>Settings</Text>

      {/* profile section */}
      <View style={styles.groupShadowLayer}>
        <View style={styles.groupBox}>
          <Pressable
            style={({ pressed, hovered }) => [styles.navItem, (pressed || hovered) && styles.navItemPressed]}
            onPress={() => setActiveSubPage("profile")}
          >
            <Image source={profilIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>{name || "Profil"}</Text>
              <Text style={styles.navSubtitle}>Name</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed, hovered }) => [styles.navItem, styles.navItemLast, (pressed || hovered) && styles.navItemPressed]}
            onPress={() => setActiveSubPage("cloud")}
          >
            <Image source={cloudIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>Cloud</Text>
              <Text style={styles.navSubtitle}>Cloud storage, Backup</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.groupShadowLayer}>
        <View style={styles.groupBox}>
          <Pressable
            style={({ pressed, hovered }) => [styles.navItem, (pressed || hovered) && styles.navItemPressed]}
            onPress={() => setActiveSubPage("general")}
          >
            <Image source={generalIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>General</Text>
              <Text style={styles.navSubtitle}>Language, Theme</Text>
            </View>
          </Pressable>

          {!isDesktop && (
            <Pressable
              style={({ pressed, hovered }) => [styles.navItem, (pressed || hovered) && styles.navItemPressed]}
              onPress={() => setActiveSubPage("assistantoverlay")}
            >
              <Image source={micIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
              <View style={styles.navTextContainer}>
                <Text style={styles.navTitle}>Assistant Overlay</Text>
                <Text style={styles.navSubtitle}>Voice, Screen context</Text>
              </View>
            </Pressable>
          )}

          <Pressable
            style={({ pressed, hovered }) => [styles.navItem, (pressed || hovered) && styles.navItemPressed]}
            onPress={() => setActiveSubPage("service")}
          >
            <Image source={linkIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>Service</Text>
              <Text style={styles.navSubtitle}>AI Service, Ollama server</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed, hovered }) => [styles.navItem, styles.navItemLast, (pressed || hovered) && styles.navItemPressed]}
            onPress={() => setActiveSubPage("tools")}
          >
            <Image source={toolIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>Tools</Text>
              <Text style={styles.navSubtitle}>{isDesktop ? "Assistant Tools, Widgets" : "Assistant Tools, Widgets, Mobile actions"}</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.groupShadowLayer}>
        <View style={styles.groupBox}>
          <Pressable
            style={({ pressed, hovered }) => [styles.navItem, (pressed || hovered) && styles.navItemPressed]}
            onPress={() => setActiveSubPage("confidentiality")}
          >
            <Image source={confidentialityIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>Confidentiality</Text>
              <Text style={styles.navSubtitle}>Data privacy, Usage analytics</Text>
            </View>
          </Pressable>

          <View style={[styles.navItem, styles.navItemLast]}>
            <Image source={socialIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>Social Links</Text>
              <Text style={styles.navSubtitle}>Github, Instagram, Website</Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={styles.versionText}>v{appVersion}</Text>
    </View>
  );

  // profile subpage
  const renderProfileSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Profile")}

      <View style={styles.settingRowVertical}>
        <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Name</Text>
        <TextInputField
          icon={penPlaceholderIcon}
          placeholder="Enter your name"
          value={name}
          onChangeText={setName}
        />
      </View>

      <View style={styles.settingRowVertical}>
        <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Write your instructions to AI</Text>
        <TextInputField
          icon={penPlaceholderIcon}
          placeholder="write"
          value={instruction}
          onChangeText={setInstruction}
        />
      </View>
    </View>
  );

  // general subpage
  const renderGeneralSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("General")}

      <View style={[styles.settingRowVertical, { marginTop: 0 }]}>
        <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Language</Text>
        <Selector
          options={languageOptions}
          selectedValue={language}
          onSelect={setLanguage}
          title="Select Language"
          fullWidth
        />
      </View>

      <View style={styles.settingRowVertical}>
        <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Theme app</Text>
        <SliderToggle
          selectedValue={theme}
          onSelect={setTheme}
        />
      </View>

      <View style={styles.settingRowVertical}>
        <View style={styles.toggleRow}>
          <Text style={styles.settingLabel}>Show technical details</Text>
          <Toggle
            checked={showTechnicalDetails}
            onToggle={setShowTechnicalDetails}
          />
        </View>
        <Text style={styles.helpText}>Add an info button below answers to inspect AI technical data.</Text>
      </View>

      <View style={styles.settingRowVertical}>
        <View style={styles.toggleRow}>
          <Text style={styles.settingLabel}>Auto-read replies</Text>
          <Toggle
            checked={autoSpeak}
            onToggle={setAutoSpeak}
          />
        </View>
        <Text style={styles.helpText}>Speak the answer aloud when you ask by voice.</Text>
      </View>
    </View>
  );

  // assistant overlay subpage
  const renderAssistantOverlaySubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Assistant Overlay")}

      <View style={[styles.settingRowVertical, { marginTop: 0 }]}>
        <View style={styles.toggleRow}>
          <Text style={styles.settingLabel}>Auto-start microphone</Text>
          <Toggle
            checked={autoStartMic}
            onToggle={setAutoStartMic}
          />
        </View>
        <Text style={styles.helpText}>Automatically activate the microphone as soon as the assistant opens.</Text>
      </View>

      {Platform.OS === 'android' && (
        <View style={styles.settingRowVertical}>
          <View style={styles.toggleRow}>
            <Text style={styles.settingLabel}>Use app context</Text>
            <Toggle
              checked={useAppContext}
              onToggle={setUseAppContext}
            />
          </View>
          <Text style={styles.helpText}>Send the foreground app and on-screen text to the assistant when using the overlay</Text>
        </View>
      )}
    </View>
  );

  // cloud subpage
  const renderCloudSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Cloud")}

      <View style={[styles.settingRowVertical, { marginTop: 0 }]}>
        <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Cloud storage</Text>
        <Selector
          options={cloudStorageOptions}
          selectedValue={cloudProvider}
          onSelect={handleSetCloudProvider}
          title="Select Cloud Storage"
          fullWidth
        />
        {cloudProvider !== "none" && !cloudUserInfo && (() => {
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
  );

  // service subpage content
  const renderServiceSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Service")}

      {localAvailable && (
        <View style={styles.settingRowVertical}>
          <View style={styles.toggleRow}>
            <Text style={styles.settingLabel}>{getLocalProviderLabel()}</Text>
            <Toggle
              checked={enabledProviders.includes("local")}
              onToggle={(v) => setProviderEnabled("local", v)}
            />
          </View>
          <Text style={styles.helpText}>Runs the local model directly on this device. No server needed.</Text>
        </View>
      )}

      <View style={styles.settingRowVertical}>
        {/* ollama servers section */}
        <View style={styles.toggleRow}>
          <Text style={styles.settingLabel}>Ollama</Text>
          <Toggle
            checked={enabledProviders.includes("ollama")}
            onToggle={(v) => setProviderEnabled("ollama", v)}
          />
        </View>
        <Text style={[styles.helpText, { marginBottom: 10 }]}>Use your Ollama servers to run powerful AI models at home.</Text>

        {enabledProviders.includes("ollama") && (
          <>
            {ollamaUrls.map((url, index) => (
              <View key={index} style={{ marginBottom: 10 }}>
                <TextInputField
                  icon={linkIcon}
                  placeholder="server link"
                  value={url}
                  onChangeText={(v) => setOllamaUrlAt(index, v)}
                  onBlur={() => handleOllamaUrlBlur(index)}
                />
                {serverErrors[url.trim()] ? (
                  <Text style={styles.errorText}>This server is unreachable</Text>
                ) : null}
              </View>
            ))}

            <ActionButton
              icon={addIcon}
              label="Add server link"
              onPress={() => saveOllamaUrls([...ollamaUrls, ""])}
              standalone
            />

            <Text style={[styles.settingLabel, { marginTop: 20 }]}>Context Length</Text>
            <Text style={[styles.helpText, { marginBottom: 10 }]}>Maximum number of tokens the model can use.</Text>
            <Slider
              icon={messageIcon}
              options={ollamaContextLengthOptions}
              selectedValue={String(effectiveContextLength())}
              onSelect={setOllamaContextLength}
            />
            <Text style={[styles.settingLabel, { marginTop: 20 }]}>Model Keep Alive</Text>
            <Text style={[styles.helpText, { marginBottom: 10 }]}>How long the model stays loaded in memory after a request.</Text>
            <Slider
              icon={timeIcon}
              options={ollamaKeepAliveOptions}
              selectedValue={ollamaKeepAlive}
              onSelect={setOllamaKeepAlive}
            />
          </>
        )}
      </View>

      {Platform.OS === "web" && (
        <>
          <View style={[styles.settingRowVertical, { zIndex: 9 }]}>
            <Text style={styles.settingLabel}>Whisper Model</Text>
            <Text style={[styles.helpText, { marginBottom: 10 }]}>The larger size, the longer the processing will take.</Text>
            <Selector
              options={whisperModelOptions}
              selectedValue={whisperModel}
              onSelect={handleSelectWhisperModel}
              title="Select Whisper Model"
              fullWidth
            />
            {isDownloadingWhisper && (
              <View style={{ marginTop: 10 }}>
                <DownloadProgress
                  title={`Downloading Whisper ${whisperModel}...`}
                  progress={whisperDownloadProgress?.progress || 0}
                  sizeStr={whisperDownloadProgress?.sizeStr}
                  etaSeconds={whisperDownloadProgress?.etaSeconds}
                />
              </View>
            )}
          </View>
        </>
      )}

      <View style={[styles.settingRowVertical, Platform.OS === "web" && { marginTop: 10 }]}>
        <View style={styles.toggleRow}>
          <Text style={styles.settingLabel}>Always Transcribe Locally</Text>
          <Toggle
            checked={alwaysWhisper}
            onToggle={setAlwaysWhisper}
          />
        </View>
        <Text style={styles.helpText}>
          {Platform.OS === "web"
            ? "Process audio transcriptions locally on your device instead of using the selected model."
            : "Use your device's built-in speech recognition instead of the selected model."}
        </Text>
      </View>
    </View>
  );

  // confidentiality subpage content
  const renderConfidentialitySubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Confidentiality")}

      <View style={styles.settingRowVertical}>
        <Text style={styles.settingLabel}>Data privacy</Text>
        <Text style={[styles.helpText, { marginBottom: 6 }]}>
          Designed for privacy, Opera keeps all your data and searches entirely on your device.
        </Text>
        <Text style={styles.helpText}>
          Local Storage: All your data, searches, and settings stay strictly on your device.
        </Text>
        <Text style={[styles.helpText, { marginTop: 4 }]}>
          No Tracking: We do not collect personal info, analytics, or crash reports. Your privacy is fully protected.
        </Text>
      </View>

      <View style={styles.settingRowVertical}>
        <Text style={styles.settingLabel}>Permissions</Text>
        <Text style={[styles.helpText, { marginBottom: 12 }]}>
          {Platform.OS === "web"
            ? "Opera needs a few permissions to work at its best. You can manage them from your browser's site settings."
            : "Opera needs a few permissions to work at its best. You can change them in your device settings."}
        </Text>

        <View style={[styles.groupShadowLayer, { marginBottom: 0 }]}>
          <View style={styles.groupBox}>
            <ActionButton
              icon={micIcon}
              label="Microphone"
              onPress={Platform.OS !== "web" ? () => Linking.openSettings() : undefined}
              disabled={Platform.OS === "web"}
              rightElement={Platform.OS !== "web" ? renderPermissionBadge(permissionStatuses.microphone) : undefined}
            />
            <ActionButton
              icon={cameraIcon}
              label="Camera"
              onPress={Platform.OS !== "web" ? () => Linking.openSettings() : undefined}
              disabled={Platform.OS === "web"}
              rightElement={Platform.OS !== "web" ? renderPermissionBadge(permissionStatuses.camera) : undefined}
            />
            <ActionButton
              icon={locationIcon}
              label="Location"
              onPress={Platform.OS !== "web" ? () => Linking.openSettings() : undefined}
              disabled={Platform.OS === "web"}
              isLast={Platform.OS === "web"}
              rightElement={Platform.OS !== "web" ? renderPermissionBadge(permissionStatuses.location) : undefined}
            />
            {Platform.OS !== "web" && (
              <ActionButton
                icon={photoIcon}
                label="Photos"
                onPress={() => Linking.openSettings()}
                rightElement={renderPermissionBadge(permissionStatuses.photos)}
              />
            )}
            {Platform.OS !== "web" && (
              <ActionButton
                icon={profilIcon}
                label="Contacts"
                onPress={() => Linking.openSettings()}
                rightElement={renderPermissionBadge(permissionStatuses.contacts)}
              />
            )}
            {Platform.OS !== "web" && (
              <ActionButton
                icon={calendarIcon}
                label="Calendar"
                onPress={() => Linking.openSettings()}
                isLast
                rightElement={renderPermissionBadge(permissionStatuses.calendar)}
              />
            )}
          </View>
        </View>
      </View>

      <View style={styles.settingRowVertical}>
        <Text style={styles.settingLabel}>Data management</Text>
        <Text style={[styles.helpText, { marginBottom: 12 }]}>
          Manage your conversations and settings data locally.
        </Text>

        <View style={[styles.groupShadowLayer, { marginBottom: 0 }]}>
          <View style={styles.groupBox}>
            <ActionButton
              icon={exportIcon}
              label="Export data"
              onPress={handleExportData}
            />
            <ActionButton
              icon={downloadIcon}
              label="Import data"
              onPress={handleImportData}
            />
            <ActionButton
              icon={binIcon}
              label="Delete all conversations"
              onPress={handleDeleteAllConversations}
              isLast
            />
          </View>
        </View>
      </View>
    </View>
  );

  // tools subpage content: assistant tools stay inline, widgets and mobile actions link out
  const renderToolsSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Tools")}

      {generalTools.map((tool) => {
        const name = tool.definition.function.name;
        const key = `tool:${name}`;
        const enabled = pluginStates[key] ?? (tool.enabledByDefault ?? false);
        return (
          <View key={name} style={styles.settingRowVertical}>
            <View style={styles.toggleRow}>
              <Text style={styles.settingLabel}>{tool.displayName ?? name}</Text>
              <Toggle
                checked={enabled}
                onToggle={async (v) => {
                  setPluginStates(prev => ({ ...prev, [key]: v }));
                  await PluginRegistry.setEnabled('tool', name, v);
                  //request permission at enable time
                  if (v) await tool.requestPermission?.();
                }}
              />
            </View>
            {tool.displayDescription ? (
              <Text style={styles.helpText}>
                {tool.displayDescription.endsWith('.') ? tool.displayDescription : `${tool.displayDescription}.`}
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* widgets block: links out, same pattern as mobile actions below */}
      <View style={styles.settingRowVertical}>
        <Text style={styles.settingLabel}>Widgets</Text>
        <Text style={[styles.helpText, { marginBottom: 12 }]}>
          Structured results the assistant can display: {allWidgets.map(w => w.name).join(", ")}.
        </Text>

        <View style={[styles.groupShadowLayer, { marginBottom: 0 }]}>
          <View style={styles.groupBox}>
            <Pressable
              style={({ pressed, hovered }) => [styles.navItem, styles.navItemLast, (pressed || hovered) && styles.navItemPressed]}
              onPress={() => setActiveSubPage("widgets")}
            >
              <Image source={arrowIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
              <Text style={styles.navLabel}>See widgets</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* mobile actions block, last: points to a deeper subpage instead of toggling in place. desktop has no mobile apps to open, so it's hidden there */}
      {!isDesktop && (
        <View style={styles.settingRowVertical}>
          <Text style={styles.settingLabel}>Mobile actions</Text>
          <Text style={[styles.helpText, { marginBottom: 12 }]}>
            Allow the assistant to integrate with installed apps: {mobileTools.map(t => t.displayName ?? t.definition.function.name).join(", ")}.
          </Text>

          <View style={[styles.groupShadowLayer, { marginBottom: 0 }]}>
            <View style={styles.groupBox}>
              <Pressable
                style={({ pressed, hovered }) => [styles.navItem, styles.navItemLast, (pressed || hovered) && styles.navItemPressed]}
                onPress={() => setActiveSubPage("mobileactions")}
              >
                <Image source={arrowIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
                <Text style={styles.navLabel}>See mobile actions</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  // widgets subpage content
  const renderWidgetsSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Widgets", "tools")}

      {allWidgets.map((widget) => {
        const key = `widget:${widget.id}`;
        const enabled = pluginStates[key] ?? (widget.enabledByDefault ?? false);
        return (
          <View key={widget.id} style={styles.settingRowVertical}>
            <View style={styles.toggleRow}>
              <Text style={styles.settingLabel}>{widget.name}</Text>
              <Toggle
                checked={enabled}
                onToggle={async (v) => {
                  setPluginStates(prev => ({ ...prev, [key]: v }));
                  await PluginRegistry.setEnabled('widget', widget.id, v);
                }}
              />
            </View>
            <Text style={styles.helpText}>{widget.description.split('.')[0]}.</Text>
          </View>
        );
      })}
    </View>
  );

  // mobile actions subpage content
  const renderMobileActionsSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Mobile actions", "tools")}

      {mobileTools.map((tool) => {
        const name = tool.definition.function.name;
        const key = `tool:${name}`;
        const enabled = pluginStates[key] ?? (tool.enabledByDefault ?? false);
        return (
          <View key={name} style={styles.settingRowVertical}>
            <View style={styles.toggleRow}>
              <Text style={styles.settingLabel}>{tool.displayName ?? name}</Text>
              <Toggle
                checked={enabled}
                onToggle={async (v) => {
                  setPluginStates(prev => ({ ...prev, [key]: v }));
                  await PluginRegistry.setEnabled('tool', name, v);
                  //request permission at enable time
                  if (v) await tool.requestPermission?.();
                }}
              />
            </View>
            {tool.displayDescription ? (
              <Text style={styles.helpText}>
                {tool.displayDescription.endsWith('.') ? tool.displayDescription : `${tool.displayDescription}.`}
              </Text>
            ) : null}
          </View>
        );
      })}
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
      case "confidentiality":
        return renderConfidentialitySubPage();
      case "tools":
        return renderToolsSubPage();
      case "widgets":
        return renderWidgetsSubPage();
      case "mobileactions":
        return renderMobileActionsSubPage();
      case "main":
      default:
        return renderMainPage();
    }
  };

  const innerContent = (
    <ScrollView contentContainerStyle={{ paddingTop: isDesktop ? 0 : 60, paddingBottom: 40, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      <Animated.View style={{ flex: 1, opacity: pageAnim, transform: [{ translateY: pageAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        {getSubPageContent()}
      </Animated.View>
    </ScrollView>
  );

  const notificationModal = (
    <>
      <NotificationModal
        visible={downloadModalVisible}
        title="Download Gemma4"
        icon={downloadIcon}
        message="Do you want to download the Gemma4 model to your Ollama server? This model is several GB in size."
        onClose={() => setDownloadModalVisible(false)}
        buttons={[
          { text: "Cancel", onPress: () => setDownloadModalVisible(false), style: "secondary" },
          { text: "Download", onPress: handleDownloadGemma, style: "primary" },
        ]}
      />
      <NotificationModal
        visible={alertModalVisible}
        title={alertConfig.title}
        message={alertConfig.message}
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
        title="Export data"
        message="Select what would you like to export."
        onClose={() => setExportScopeVisible(false)}
        options={[
          {
            label: "Conversations",
            checked: exportSelection.conversations,
            onToggle: (checked) => setExportSelection(prev => ({ ...prev, conversations: checked })),
          },
          {
            label: "Settings",
            checked: exportSelection.settings,
            onToggle: (checked) => setExportSelection(prev => ({ ...prev, settings: checked })),
          },
        ]}
        buttons={[
          {
            text: "Export",
            style: "primary",
            disabled: !exportSelection.settings && !exportSelection.conversations,
            onPress: () => runExport(exportSelection.settings, exportSelection.conversations),
          },
          { text: "Cancel", style: "secondary", onPress: () => setExportScopeVisible(false) },
        ]}
      />
      <NotificationModal
        visible={importScopeVisible}
        title="Import data"
        message="Select what would you like to import. This will replace the selected data."
        onClose={() => setImportScopeVisible(false)}
        options={[
          {
            label: "Conversations",
            checked: importSelection.conversations,
            disabled: !(importInspection?.hasConversations ?? true),
            onToggle: (checked) => setImportSelection(prev => ({ ...prev, conversations: checked })),
          },
          {
            label: "Settings",
            checked: importSelection.settings,
            disabled: !(importInspection?.hasSettings ?? true),
            onToggle: (checked) => setImportSelection(prev => ({ ...prev, settings: checked })),
          },
        ]}
        buttons={[
          {
            text: "Import",
            style: "primary",
            disabled: !importSelection.settings && !importSelection.conversations,
            onPress: () => runImport(importSelection.settings, importSelection.conversations),
          },
          { text: "Cancel", style: "secondary", onPress: () => setImportScopeVisible(false) },
        ]}
      />
    </>
  );

  if (isDesktop) {
    const largeScreenWidth = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 320]
    });
    const largeScreenMargin = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 16]
    });
    const largeScreenOpacity = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1]
    });

    return (
      <Animated.View style={[
        styles.largeScreenContainer,
        isDesktop ? styles.floatingContainer : styles.attachedContainer,
        {
          width: largeScreenWidth,
          opacity: largeScreenOpacity,
          marginLeft: isDesktop ? largeScreenMargin : 0,
          marginRight: isDesktop ? largeScreenMargin : 0,
          overflow: "hidden"
        }
      ]}>
        <View style={{ width: 320, flex: 1 }}>
          <View style={isDesktop ? styles.floatingContent : styles.attachedContent}>
            {innerContent}
          </View>
        </View>
        {notificationModal}
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

      <Animated.View style={[styles.content, { width: drawerWidth }, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        {innerContent}
      </Animated.View>

      {notificationModal}
    </View>
  );

  return mobileDrawer;
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
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
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
  },
  largeScreenContainer: {
    width: 320,
    backgroundColor: Colors.surface,
    zIndex: 10,
  },
  floatingContainer: {
    margin: 16,
    marginTop: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 40 : 8,
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
    paddingHorizontal: 16,
  },
  attachedContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: FontSizes.xxxl,
    color: Colors.textPrimary,
    marginBottom: 24,
    fontFamily: Fonts.display,
  },
  menuContainer: {
    flex: 1,
  },
  subPageContainer: {
    flex: 1,
  },
  subPageHeader: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  backIcon: {
    width: 18,
    height: 18,
    transform: [{ rotate: "-180deg" }],
  },
  groupShadowLayer: {
    position: "relative",
    marginBottom: 20,
  },
  groupBox: {
    position: "relative",
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.surface,
    zIndex: 1,
    overflow: "hidden",
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
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
    marginBottom: 30,
    zIndex: 10,
  },
  settingLabel: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  errorText: {
    fontSize: FontSizes.caption,
    color: Colors.primary,
    fontFamily: Fonts.body,
    marginTop: 8,
    marginBottom: 0,
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
