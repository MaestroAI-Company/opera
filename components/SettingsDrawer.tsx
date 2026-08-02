import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AIModule } from "../src/services/ai/AIModule";
import { BackupService } from "../src/services/BackupService";
import { Settings } from "../src/services/settings/SettingsService";
import { Whisper } from "../src/services/whisper/WhisperService";
import DownloadProgress from "./DownloadProgress";
import NotificationModal, { ModalButton } from "./NotificationModal";
import Selector from "./Selector";
import TextInputField from "./TextInputField";
import ThemeSelector from "./ThemeSelector";
import Toggle from "./Toggle";

import { useResponsive } from "../src/hooks/useResponsive";

const linkIcon = require("../assets/icons/link.png");
const downloadIcon = require("../assets/icons/download.png");
const deleteIcon = require("../assets/icons/delete.png");
const penPlaceholderIcon = require("../assets/icons/pencil.png");
const arrowIcon = require("../assets/icons/arrow.png");
const generalIcon = require("../assets/icons/general.png");
const serverIcon = require("../assets/icons/server.png");
const toolIcon = require("../assets/icons/tool.png");
const confidentialityIcon = require("../assets/icons/confidentiality.png");
const socialIcon = require("../assets/icons/social.png");

type SettingsDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  initialSubPage?: SubPage;
};

type SubPage = "main" | "general" | "models" | "confidentiality" | "tools" | "profile";

export default function SettingsDrawer({ visible, onClose, onDataChanged, isLargeScreen = false, isDesktop = false, initialSubPage }: SettingsDrawerProps) {
  const { width } = useResponsive();
  const drawerWidth = Math.min(width * 0.88, 360);

  const translateX = useRef(new Animated.Value(drawerWidth)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const [activeSubPage, setActiveSubPage] = useState<SubPage>(initialSubPage ?? "main");

  useEffect(() => {
    if (visible) setActiveSubPage(initialSubPage ?? "main");
  }, [visible, initialSubPage]);

  const [language, setLanguageState] = useState("en");
  const [theme, setThemeState] = useState("system");
  const [aiService, setAiServiceState] = useState("ollama");
  const [ollamaUrl, setOllamaUrlState] = useState("");
  const [ollamaError, setOllamaError] = useState("");
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [gemmaDownloadProgress, setGemmaDownloadProgress] = useState<{ progress: number, etaSeconds: number, speedStr: string, sizeStr: string } | null>(null);

  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ title: string, message: string, buttons?: ModalButton[] }>({ title: '', message: '' });

  const showAlert = (title: string, message: string, buttons?: ModalButton[]) => {
    setAlertConfig({ title, message, buttons });
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
  const [username, setUsernameState] = useState("");
  const [alwaysWhisper, setAlwaysWhisperState] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetailsState] = useState(true);
  const [usageAnalytics, setUsageAnalyticsState] = useState(true);
  const [useWebsearch, setUseWebsearchState] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [ollamaModelOptions, setOllamaModelOptions] = useState<{ id: string, label: string }[]>([]);

  const languageOptions = [
    { id: "en", label: "English" },
    { id: "fr", label: "Français" },
  ];

  const cloudStorageOptions = [
    { id: "none", label: "None" },
  ];

  const aiServiceOptions = [
    { id: "ollama", label: "Ollama" },
    ...(Platform.OS === "android"
      ? [{ id: "aicore", label: "Gemini Nano (On-Device)" }]
      : []),
  ];

  const handleExportData = async () => {
    try {
      const ok = await BackupService.exportData();
      if (ok) showAlert("Export", "Data exported successfully.");
    } catch {
      showAlert("Error", "Failed to export data.");
    }
  };

  const handleImportData = async () => {
    showAlert(
      "Import Data",
      "This will replace all your current conversations and settings. Are you sure?",
      [
        { text: "Cancel", onPress: () => setAlertModalVisible(false), style: "secondary" },
        {
          text: "Import",
          style: "primary",
          onPress: async () => {
            setAlertModalVisible(false);
            try {
              const ok = await BackupService.importData();
              if (ok) {
                showAlert("Import", "Data imported successfully.");
                onDataChanged?.();
              }
            } catch {
              showAlert("Error", "Failed to import data.");
            }
          },
        },
      ]
    );
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
              await Whisper.deleteModel(whisperModel);
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
        ? { rightIcon: deleteIcon, rightIconTintColor: "#ffffff", onRightIconPress: handleDeleteWhisper }
        : {}),
    },
    {
      id: "base",
      label: "Base",
      isDownload: !installedWhisperModels["base"],
      ...(installedWhisperModels["base"] && whisperModel === "base"
        ? { rightIcon: deleteIcon, rightIconTintColor: "#ffffff", onRightIconPress: handleDeleteWhisper }
        : {}),
    },
    {
      id: "small",
      label: "Small",
      isDownload: !installedWhisperModels["small"],
      ...(installedWhisperModels["small"] && whisperModel === "small"
        ? { rightIcon: deleteIcon, rightIconTintColor: "#ffffff", onRightIconPress: handleDeleteWhisper }
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
        setUsernameState(s.username || "");
        setAlwaysWhisperState(s.alwaysWhisper);
        //apply to services
        AIModule.configure(s.ollamaUrl);
        AIModule.setMode(s.aiService);
        Whisper.setLanguage(s.whisperLanguage);
      } catch (e) {
        console.warn("Failed to load settings", e);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

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
      Whisper.isModelInstalled(v).then((installed) => {
        setWhisperInstalled(installed);
        setInstalledWhisperModels(prev => ({ ...prev, [v]: installed }));
        if (installed) {
          Whisper.init(v).then((success) => {
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

  const setUsername = (v: string) => {
    setUsernameState(v);
    Settings.set("username", v);
  };

  const setAlwaysWhisper = (v: boolean) => {
    setAlwaysWhisperState(v);
    Settings.set("alwaysWhisper", v);
  };

  const fetchOllamaModels = useCallback(async () => {
    if (!settingsLoaded) return;
    try {
      const isAvailable = await AIModule.isAvailable();
      if (!isAvailable) {
        setOllamaError("The Ollama URL is incorrect or the server is unreachable.");
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
        ["tiny", "base", "small"].forEach(m => {
          Whisper.isModelInstalled(m).then(installed => {
            setInstalledWhisperModels(prev => ({ ...prev, [m]: installed }));
          });
        });
        if (whisperModel && whisperModel !== "none") {
          Whisper.isModelInstalled(whisperModel).then(setWhisperInstalled);
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
      await Whisper.downloadModel(model, (progress, etaSeconds, speedStr, sizeStr) => {
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
        style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
      >
        <Image source={arrowIcon} style={styles.backIcon} tintColor="#000" />
      </Pressable>
    </View>
  );

  // main navigation page content
  const mainPageContent = (
    <View style={styles.menuContainer}>
      <Text style={styles.title}>Settings</Text>

      {/* profile section */}
      <Pressable
        style={({ pressed }) => [styles.profileCard, pressed && styles.navItemPressed]}
        onPress={() => setActiveSubPage("profile")}
      >
        <Image source={penPlaceholderIcon} style={styles.menuIcon} tintColor="#000" />
        <View style={styles.navTextContainer}>
          <Text style={styles.navTitle}>{username || "Set your username"}</Text>
          <Text style={styles.navSubtitle}>Username, AI Instructions</Text>
        </View>
      </Pressable>

      <View style={styles.groupShadowLayer}>
        <View style={styles.groupBox}>
          <Pressable
            style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            onPress={() => setActiveSubPage("general")}
          >
            <Image source={generalIcon} style={styles.menuIcon} tintColor="#000" />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>General</Text>
              <Text style={styles.navSubtitle}>Language, Theme, Cloud Storage</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            onPress={() => setActiveSubPage("models")}
          >
            <Image source={serverIcon} style={styles.menuIcon} tintColor="#000" />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>Models & Server</Text>
              <Text style={styles.navSubtitle}>Ollama server, Whisper Model, TOD</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.navItem, styles.navItemLast, pressed && styles.navItemPressed]}
            onPress={() => setActiveSubPage("tools")}
          >
            <Image source={toolIcon} style={styles.menuIcon} tintColor="#000" />
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
            style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            onPress={() => setActiveSubPage("confidentiality")}
          >
            <Image source={confidentialityIcon} style={styles.menuIcon} tintColor="#000" />
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>Confidentiality</Text>
              <Text style={styles.navSubtitle}>Data privacy, Usage analytics</Text>
            </View>
          </Pressable>

          <View style={[styles.navItem, styles.navItemLast]}>
            <Image source={socialIcon} style={styles.menuIcon} tintColor="#000" />
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
        <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Username</Text>
        <TextInputField
          icon={penPlaceholderIcon}
          placeholder="Enter your username"
          value={username}
          onChangeText={setUsername}
        />
      </View>

      <View style={[styles.settingRowVertical, { marginTop: 16 }]}>
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
        <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Cloud storage</Text>
        <Selector
          options={cloudStorageOptions}
          selectedValue="none"
          onSelect={() => { }}
          title="Select Cloud Storage"
          fullWidth
        />
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.settingLabel}>Show technical details</Text>
        <Toggle
          checked={showTechnicalDetails}
          onToggle={setShowTechnicalDetailsState}
        />
      </View>
      <Text style={styles.helpText}>Include technical data in AI responses</Text>
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
          Uses Gemini Nano directly on this device. No server needed.
        </Text>
      )}

      {aiService === "ollama" && (
        <View style={styles.settingRowVertical}>
          <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Ollama server</Text>
          <TextInputField
            icon={linkIcon}
            placeholder="server link"
            value={ollamaUrl}
            onChangeText={setOllamaUrl}
            onBlur={fetchOllamaModels}
          />
        </View>
      )}
      {aiService === "ollama" && ollamaError ? <Text style={styles.errorText}>{ollamaError}</Text> : null}

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
      <Text style={styles.helpText}>Process audio transcriptions locally on your device</Text>
    </View>
  );

  // confidentiality subpage content
  const confidentialitySubPageContent = (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Confidentiality")}

      <View style={{ marginBottom: 24 }}>
        <Text style={styles.settingLabel}>Data privacy</Text>
        <Text style={styles.helpText}>Datausage</Text>
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.settingLabel}>Usage analytics</Text>
        <Toggle
          checked={usageAnalytics}
          onToggle={setUsageAnalyticsState}
        />
      </View>
      <Text style={styles.helpText}>Help improve the app by sharing daily active counts without exposing your chats</Text>

      <View style={{ marginTop: 28, gap: 8 }}>
        <Text style={styles.settingLabel}>Data management</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <Pressable style={({ pressed }) => [styles.dataBtn, pressed && styles.dataBtnPressed]} onPress={handleExportData}>
            <Text style={styles.dataBtnText}>Export</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.dataBtn, pressed && styles.dataBtnPressed]} onPress={handleImportData}>
            <Text style={styles.dataBtnText}>Import</Text>
          </Pressable>
        </View>
        <Pressable style={({ pressed }) => [styles.dataBtn, styles.dataBtnDanger, pressed && styles.dataBtnDangerPressed]} onPress={handleDeleteAllConversations}>
          <Text style={styles.dataBtnTextDanger}>Delete all conversations</Text>
        </Pressable>
      </View>
    </View>
  );

  // tools & widgets subpage content
  const toolsSubPageContent = (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Tools & Widgets")}

      <View style={styles.toggleRow}>
        <Text style={styles.settingLabel}>Use websearch</Text>
        <Toggle
          checked={useWebsearch}
          onToggle={setUseWebsearchState}
        />
      </View>
      <Text style={styles.helpText}>Allow the assistant to search the web for real-time information</Text>
    </View>
  );

  const getSubPageContent = () => {
    switch (activeSubPage) {
      case "profile":
        return profileSubPageContent;
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

      <Animated.View style={[styles.content, { width: drawerWidth }, { transform: [{ translateX }] }]}>
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
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  content: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
  },
  largeScreenContainer: {
    width: 320,
    backgroundColor: "#fff",
    zIndex: 10,
  },
  floatingContainer: {
    margin: 16,
    marginTop: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 40 : 8,
    marginBottom: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    boxShadow: "-6px 6px 0px #00000013",
    elevation: 5,
    overflow: "hidden",
  },
  attachedContainer: {
    borderLeftWidth: 1,
    borderLeftColor: "rgba(0,0,0,0.05)",
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
    fontSize: 32,
    color: "#222",
    marginBottom: 24,
    fontFamily: "Petrona",
  },
  menuContainer: {
    flex: 1,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#00000017",
    padding: 14,
    marginBottom: 20,
    gap: 12,
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
    borderColor: "#00000017",
    borderRadius: 10,
    backgroundColor: "#fff",
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
    backgroundColor: "#eaeaea",
  },
  menuIcon: {
    width: 18,
    height: 18,
  },
  navTextContainer: {
    flex: 1,
  },
  navTitle: {
    fontSize: 18,
    fontFamily: "IBMPlexMono-Medium",
    color: "#000",
    marginBottom: 2,
  },
  navSubtitle: {
    fontSize: 12,
    fontFamily: "Jakarta",
    color: "#888",
  },
  settingRowVertical: {
    marginBottom: 20,
    zIndex: 10,
  },
  settingLabel: {
    fontSize: 15,
    color: "#222",
    fontFamily: "IBMPlexMono-Medium",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  errorText: {
    fontSize: 13,
    color: "#FF1A1A",
    fontFamily: "Jakarta",
    marginTop: -10,
    marginBottom: 20,
  },
  downloadOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderStyle: "dashed",
    gap: 10,
    marginBottom: 20,
  },
  downloadIcon: {
    width: 20,
    height: 20,
  },
  downloadText: {
    fontSize: 14,
    color: "#FF1A1A",
    fontFamily: "IBMPlexMono-Medium",
  },
  helpText: {
    fontSize: 12,
    color: "#888",
    fontFamily: "Jakarta",
    marginTop: 4,
  },
  dataBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  dataBtnPressed: {
    backgroundColor: "#eaeaea",
  },
  dataBtnText: {
    fontSize: 13,
    fontFamily: "IBMPlexMono-Medium",
    color: "#222",
  },
  dataBtnDanger: {
    borderColor: "#FF1A1A22",
    backgroundColor: "#fff",
  },
  dataBtnDangerPressed: {
    backgroundColor: "#fff0f0",
  },
  dataBtnTextDanger: {
    fontSize: 13,
    fontFamily: "IBMPlexMono-Medium",
    color: "#FF1A1A",
  },
});
