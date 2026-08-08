import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, BackHandler, DeviceEventEmitter, Image, Keyboard, Linking, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";
import { AIModule } from "../../services/ai/AIModule";
import { getLocalProviderLabel } from "../../services/ai/LocalProvider";
import { ITool } from "../../services/ai/tools/ITool";
import { ToolManager } from "../../services/ai/tools/ToolManager";
import { BackupService, ImportInspection } from "../../services/BackupService";
import { CloudUserInfo } from "../../services/cloud/CloudProvider";
import { CLOUD_PROVIDERS, getCloudProviderDefinition } from "../../services/cloud/registry";
import { CloudSync } from "../../services/CloudSyncService";
import { PluginRegistry } from "../../services/plugins/PluginRegistry";
import { Settings } from "../../services/settings/SettingsService";
import { STT } from "../../services/speech/STTService";
import { IWidget, WidgetManager } from "../../services/widgets/WidgetManager";
import DownloadProgress from "../ui/DownloadProgress";
import NotificationModal, { ModalButton } from "../ui/NotificationModal";
import Selector from "../ui/Selector";
import TextInputField from "../ui/TextInputField";
import ThemeSelector from "../ui/ThemeSelector";
import Toggle from "../ui/Toggle";
import CloudSyncBox from "./CloudSyncBox";

//web whisper surface, only used in browser flows
const WebSTT = STT as unknown as {
  isModelInstalled(modelName: string): Promise<boolean>;
  init(modelName: string): Promise<boolean>;
  setLanguage(lang: string): void;
  deleteModel(modelName: string): Promise<void>;
  downloadModel(modelName: string, onProgress?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void>;
};

import { useResponsive } from "../../hooks/useResponsive";

const linkIcon = require("../../../assets/icons/link.png");
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
const exportIcon = require("../../../assets/icons/export.png");

import ActionButton from "../ui/ActionButton";

type SettingsDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  initialSubPage?: SubPage;
};

type SubPage = "main" | "general" | "models" | "confidentiality" | "tools" | "profile" | "cloud";

export default function SettingsDrawer({ visible, onClose, onDataChanged, isLargeScreen = false, isDesktop = false, initialSubPage }: SettingsDrawerProps) {
  const { width } = useResponsive();
  const drawerWidth = Math.min(width * 0.88, 360);

  const translateX = useRef(new Animated.Value(drawerWidth)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          onClose();
        }
      },
    })
  ).current;

  const [activeSubPage, setActiveSubPage] = useState<SubPage>(initialSubPage ?? "main");

  useEffect(() => {
    if (visible) {
      setActiveSubPage(initialSubPage ?? "main");
      CloudSync.requestAutoSync(0);
      refreshLastSync();
    }
  }, [visible, initialSubPage]);

  //native back navigates back in the menu, then lets parent close the drawer
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
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
  const [ollamaError, setOllamaError] = useState("");
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [gemmaDownloadProgress, setGemmaDownloadProgress] = useState<{ progress: number, etaSeconds: number, speedStr: string, sizeStr: string } | null>(null);

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
  const [whisperInstalled, setWhisperInstalled] = useState<boolean>(false);
  const [installedWhisperModels, setInstalledWhisperModels] = useState<Record<string, boolean>>({});
  const [isDownloadingWhisper, setIsDownloadingWhisper] = useState(false);
  const [whisperDownloadProgress, setWhisperDownloadProgress] = useState<{ progress: number, etaSeconds: number, speedStr: string, sizeStr: string } | null>(null);
  const [whisperLanguage, setWhisperLanguageState] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0] || "auto";
    } catch {
      return "auto";
    }
  });
  const [instruction, setInstructionState] = useState("");
  const [name, setNameState] = useState("");
  const [alwaysWhisper, setAlwaysWhisperState] = useState(true);
  const [autoSpeak, setAutoSpeakState] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetailsState] = useState(false);
  const [usageAnalytics, setUsageAnalyticsState] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  //plugin enabled states (tool name or widget id -> bool)
  const [pluginStates, setPluginStates] = useState<Record<string, boolean>>({});

  const allTools: ITool[] = ToolManager.getAllTools();
  const allWidgets: IWidget[] = WidgetManager.getAllWidgets();

  const [useWebsearch, setUseWebsearchState] = useState(true);

  const [cloudProvider, setCloudProvider] = useState<string>("none");
  const [cloudUserInfo, setCloudUserInfo] = useState<CloudUserInfo | null>(null);
  const [hasSyncPin, setHasSyncPin] = useState(false);
  const [hasCloudBackup, setHasCloudBackup] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [ollamaModelOptions, setOllamaModelOptions] = useState<{ id: string, label: string }[]>([]);

  const languageOptions = [
    { id: "en", label: "English" },
    { id: "fr", label: "Français" },
  ];

  const cloudStorageOptions = [
    { id: "none", label: "None" },
    ...CLOUD_PROVIDERS.map(def => ({ id: def.id, label: def.label })),
  ];

  const aiServiceOptions = [
    { id: "ollama", label: "Ollama" },
    ...(localAvailable
      ? [{ id: "local", label: getLocalProviderLabel() }]
      : []),
  ];

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
        { text: "Cancel", onPress: () => setAlertModalVisible(false), style: "secondary" },
        {
          text: "Delete All",
          style: "danger",
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
              await WebSTT.deleteModel(whisperModel);
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

  //load settings on first open
  useEffect(() => {
    const loadSettings = async () => {
      try {
        await Settings.init();
        const s = await Settings.load();
        setLanguageState(s.language || "en");
        setThemeState(s.theme);
        setAiServiceState(s.aiService);
        setOllamaUrlState(s.ollamaUrl);
        setWhisperModelState(s.whisperModel);
        setWhisperLanguageState(s.whisperLanguage);
        setInstructionState(s.instruction);
        setNameState(s.name || "");
        setAlwaysWhisperState(s.alwaysWhisper);
        setAutoSpeakState(s.autoSpeak);
        setShowTechnicalDetailsState(s.showTechnicalDetails);
        //apply to services
        AIModule.configure(s.ollamaUrl);
        AIModule.setMode(s.aiService);
        const localModeAvailable = await AIModule.isModeAvailable("local");
        setLocalAvailable(localModeAvailable);
        //preselect on-device provider if available and no explicit choice saved
        if (localModeAvailable && !(await Settings.has("aiService"))) {
          setAiServiceState("local");
          Settings.set("aiService", "local");
          AIModule.setMode("local");
        }
        WebSTT.setLanguage(s.whisperLanguage);
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
    if (activeSubPage !== 'tools') return;
    const states: Record<string, boolean> = {};
    for (const tool of allTools) {
      const name = tool.definition.function.name;
      states[`tool:${name}`] = PluginRegistry.isEnabled('tool', name, tool.enabledByDefault ?? false);
    }
    for (const widget of allWidgets) {
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
    Settings.set("theme", v);
  };

  const setOllamaUrl = (v: string) => {
    setOllamaUrlState(v);
    Settings.set("ollamaUrl", v);
    AIModule.configure(v);
  };

  const setAiService = (v: string) => {
    setAiServiceState(v);
    Settings.set("aiService", v);
    AIModule.setMode(v);
  };

  const setWhisperModel = (v: string) => {
    setWhisperModelState(v);
    Settings.set("whisperModel", v);
    if (v && v !== "none") {
      WebSTT.isModelInstalled(v).then((installed) => {
        setWhisperInstalled(installed);
        setInstalledWhisperModels(prev => ({ ...prev, [v]: installed }));
        if (installed) {
          WebSTT.init(v).then((success) => {
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
      { text: "Forgot Code", onPress: handleForgetSyncPin, style: "danger" },
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
    const sub = DeviceEventEmitter.addListener("SYNC_COMPLETED", () => {
      refreshLastSync();
    });
    return () => sub.remove();
  }, [refreshLastSync]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("SYNC_PIN_INVALIDATED", async () => {
      setHasSyncPin(false);
      setHasCloudBackup(await CloudSync.hasCloudBackup());
    });
    return () => sub.remove();
  }, []);

  const fetchOllamaModels = useCallback(async () => {
    if (!settingsLoaded) return;
    try {
      const isAvailable = await AIModule.isAvailable();
      if (!isAvailable) {
        setOllamaError("The Ollama URL is incorrect or the server is unreachable");
        setOllamaModelOptions([]);
        return;
      }
      setOllamaError("");

      const fetchedModels = await AIModule.getAvailableModels();
      if (fetchedModels && fetchedModels.length > 0) {
        const options = fetchedModels.map((m: string) => ({
          id: m,
          label: m,
        }));
        setOllamaModelOptions(options);
      } else {
        setOllamaModelOptions([]);
      }
    } catch (e) {
      console.warn("Could not fetch Ollama models", e);
    }
  }, [settingsLoaded]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        fetchOllamaModels();
        if (Platform.OS === "web") {
          ["tiny", "base", "small"].forEach(m => {
            WebSTT.isModelInstalled(m).then(installed => {
              setInstalledWhisperModels(prev => ({ ...prev, [m]: installed }));
            });
          });
          if (whisperModel && whisperModel !== "none") {
            WebSTT.isModelInstalled(whisperModel).then(setWhisperInstalled);
          }
        }
      }, 300);
    }
  }, [visible, fetchOllamaModels, whisperModel]);

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
      await WebSTT.downloadModel(model, (progress, etaSeconds, speedStr, sizeStr) => {
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

  const largeScreenAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      const anims = [];
      if (isDesktop) {
        anims.push(Animated.timing(largeScreenAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: false,
        }));
      } else {
        anims.push(
          Animated.timing(translateX, {
            toValue: 0,
            duration: 280,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: 280,
            useNativeDriver: Platform.OS !== "web",
          })
        );
      }
      Animated.parallel(anims).start();
    } else {
      const anims = [];
      if (isDesktop) {
        anims.push(Animated.timing(largeScreenAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }));
      } else {
        anims.push(
          Animated.timing(translateX, {
            toValue: drawerWidth,
            duration: 250,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: Platform.OS !== "web",
          })
        );
      }
      Animated.parallel(anims).start();
    }
  }, [visible, isDesktop, drawerWidth]);

  // back header for subpages
  const renderSubPageHeader = (title: string) => (
    <View style={styles.subPageHeader}>
      <Text style={[styles.title, { marginBottom: 12 }]}>{title}</Text>
      <Pressable
        onPress={() => setActiveSubPage("main")}
        style={({ pressed, hovered }) => [styles.backButton, (pressed || hovered) && { opacity: 0.6 }]}
      >
        <Image source={arrowIcon} style={styles.backIcon} tintColor={Colors.textPrimary} />
      </Pressable>
    </View>
  );

  // main navigation page content
  const mainPageContent = (
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
              <Text style={styles.navSubtitle}>Name, AI Instructions</Text>
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

          <Pressable
            style={({ pressed, hovered }) => [styles.navItem, (pressed || hovered) && styles.navItemPressed]}
            onPress={() => setActiveSubPage("models")}
          >
            <Image source={serverIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>Models & Server</Text>
              <Text style={styles.navSubtitle}>Ollama server, Whisper Model, TOD</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed, hovered }) => [styles.navItem, styles.navItemLast, (pressed || hovered) && styles.navItemPressed]}
            onPress={() => setActiveSubPage("tools")}
          >
            <Image source={toolIcon} style={styles.menuIcon} tintColor={Colors.textPrimary} />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>Tools & Widgets</Text>
              <Text style={styles.navSubtitle}>Websearch</Text>
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
    </View>
  );

  // profile subpage
  const profileSubPageContent = (
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
  const generalSubPageContent = (
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
        <ThemeSelector
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

  // cloud subpage
  const cloudSubPageContent = (
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
            onDisconnect={() => handleSetCloudProvider("none")}
            onSync={handleSyncNow}
            isSyncing={isSyncing}
          />
        )}
      </View>
    </View>
  );

  // models & server subpage content
  const modelsSubPageContent = (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Models & Server")}

      <View style={styles.settingRowVertical}>
        <Text style={[styles.settingLabel, { marginBottom: 10 }]}>AI Service</Text>
        <Selector
          options={aiServiceOptions}
          selectedValue={aiService}
          onSelect={setAiService}
          title="Select AI Service"
          fullWidth
        />
      </View>
      {aiService !== "ollama" && (
        <Text style={[styles.helpText, { marginBottom: 20 }]}>
          Runs the local model directly on this device. No server needed.
        </Text>
      )}

      {aiService === "ollama" && (
        <View style={styles.settingRowVertical}>
          {/* ollama server input section */}
          <Text style={styles.settingLabel}>Ollama server</Text>
          <Text style={[styles.helpText, { marginBottom: 10 }]}>URL of your local or remote Ollama instance.</Text>
          <TextInputField
            icon={linkIcon}
            placeholder="server link"
            value={ollamaUrl}
            onChangeText={setOllamaUrl}
            onBlur={fetchOllamaModels}
          />
          {ollamaError ? <Text style={styles.errorText}>{ollamaError}</Text> : null}
        </View>
      )}

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

          <View style={[styles.toggleRow, { marginTop: 10 }]}>
            <Text style={styles.settingLabel}>Transcribe-On-Device</Text>
            <Toggle
              checked={alwaysWhisper}
              onToggle={setAlwaysWhisper}
            />
          </View>
          <Text style={styles.helpText}>Process audio transcriptions locally on your device.</Text>
        </>
      )}
    </View>
  );

  // confidentiality subpage content
  const confidentialitySubPageContent = (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Confidentiality")}

      <View style={styles.settingRowVertical}>
        <Text style={styles.settingLabel}>Data privacy</Text>
        <Text style={styles.helpText}>Designed for privacy, Opera operates entirely on-device. All your data, searches, and settings remain strictly local—no personal info, analytics, or crash data are ever transmitted to external servers.</Text>
      </View>

      <View style={styles.settingRowVertical}>
        <Text style={styles.settingLabel}>Permissions</Text>
        <Text style={[styles.helpText, { marginBottom: 12 }]}>
          {Platform.OS === "web"
            ? "Opera needs a few permissions to work at its best. You can manage them from your browser's site settings."
            : <>Opera needs a few permissions to work at its best. You can change them in your device{" "}
              <Text style={styles.settingsLink} onPress={() => Linking.openSettings()}>
                settings ↗
              </Text>
              .</>}
        </Text>

        <View style={{ gap: 12 }}>
          <ActionButton
            icon={micIcon}
            title="Microphone"
            description="To dictate your messages by voice. ↗"
            onPress={Platform.OS !== "web" ? () => Linking.openSettings() : undefined}
          />
          <ActionButton
            icon={cameraIcon}
            title="Camera"
            description="To photograph and analyze documents. ↗"
            onPress={Platform.OS !== "web" ? () => Linking.openSettings() : undefined}
          />
          {Platform.OS !== "web" && (
            <ActionButton
              icon={photoIcon}
              title="Photos"
              description="To share images from your gallery. ↗"
              onPress={() => Linking.openSettings()}
            />
          )}
        </View>
      </View>

      <View style={styles.settingRowVertical}>
        <Text style={styles.settingLabel}>Data management</Text>
        <Text style={[styles.helpText, { marginBottom: 12 }]}>
          Manage your conversations and settings data locally.
        </Text>

        <View style={{ gap: 12 }}>
          <ActionButton
            icon={exportIcon}
            title="Export data"
            description="Save your data to a json file."
            onPress={handleExportData}
          />
          <ActionButton
            icon={downloadIcon}
            title="Import data"
            description="Restore your data from a backup json file."
            onPress={handleImportData}
          />
          <ActionButton
            icon={deleteIcon}
            title="Delete all conversations"
            description="Clear all chat history from this device."
            onPress={handleDeleteAllConversations}
          />
        </View>
      </View>
    </View>
  );

  // tools & widgets subpage content
  const toolsSubPageContent = (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Tools & Widgets")}

      {/* tools section */}
      <Text style={styles.sectionTitle}>Tools</Text>
      {allTools.map((tool) => {
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

      {/* widgets section */}
      <Text style={styles.sectionTitle}>Widgets</Text>
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

  const getSubPageContent = () => {
    switch (activeSubPage) {
      case "profile":
        return profileSubPageContent;
      case "cloud":
        return cloudSubPageContent;
      case "general":
        return generalSubPageContent;
      case "models":
        return modelsSubPageContent;
      case "confidentiality":
        return confidentialitySubPageContent;
      case "tools":
        return toolsSubPageContent;
      case "main":
      default:
        return mainPageContent;
    }
  };

  const innerContent = (
    <ScrollView contentContainerStyle={{ paddingTop: isDesktop ? 0 : 60, paddingBottom: 40, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      {getSubPageContent()}
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

  const mobileDrawer = (
    <View style={styles.root} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.content, { width: drawerWidth }, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        {innerContent}
      </Animated.View>

      {notificationModal}
    </View>
  );

  return mobileDrawer;
}

const styles = StyleSheet.create({
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
    color: Colors.textSecondary,
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
    fontSize: FontSizes.label,
    fontFamily: Fonts.body,
    color: Colors.textMuted,
  },
  settingRowVertical: {
    marginBottom: 30,
    zIndex: 10,
  },
  settingLabel: {
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
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
    fontSize: FontSizes.label,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "IBMPlexMono-Medium",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  settingsLink: {
    color: Colors.primary,
    textDecorationLine: "underline",
  },
});
