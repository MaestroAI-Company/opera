import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AIModule } from "../src/services/ai/AIModule";
import { BackupService } from "../src/services/BackupService";
import { Settings } from "../src/services/settings/SettingsService";
import { Whisper } from "../src/services/whisper/WhisperService";
import Checkbox from "./Checkbox";
import NotificationModal, { ModalButton } from "./NotificationModal";
import Selector from "./Selector";
import TextInputField from "./TextInputField";
import ThemeSelector from "./ThemeSelector";
import DownloadProgress from "./DownloadProgress";


import { useResponsive } from "../src/hooks/useResponsive";

const linkIcon = require("../assets/icons/link.png");
const downloadIcon = require("../assets/icons/download.png");
const penPlaceholderIcon = require("../assets/icons/pencil.png");

type SettingsDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

export default function SettingsDrawer({ visible, onClose, onDataChanged, isLargeScreen = false, isDesktop = false }: SettingsDrawerProps) {
  const { width } = useResponsive();
  const drawerWidth = Math.min(width * 0.88, 360);

  const translateX = useRef(new Animated.Value(drawerWidth)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;



  const [language, setLanguageState] = useState("fr");
  const [theme, setThemeState] = useState("system");
  const [aiService, setAiServiceState] = useState("ollama");
  const [ollamaUrl, setOllamaUrlState] = useState("");
  const [ollamaError, setOllamaError] = useState("");
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [gemmaDownloadProgress, setGemmaDownloadProgress] = useState<{progress: number, etaSeconds: number, speedStr: string, sizeStr: string} | null>(null);

  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ title: string, message: string, buttons?: ModalButton[] }>({ title: '', message: '' });

  const showAlert = (title: string, message: string, buttons?: ModalButton[]) => {
    setAlertConfig({ title, message, buttons });
    setAlertModalVisible(true);
  };
  const [whisperModel, setWhisperModelState] = useState("base");
  const [whisperInstalled, setWhisperInstalled] = useState<boolean>(false);
  const [installedWhisperModels, setInstalledWhisperModels] = useState<Record<string, boolean>>({});
  const [isDownloadingWhisper, setIsDownloadingWhisper] = useState(false);
  const [whisperDownloadProgress, setWhisperDownloadProgress] = useState<{progress: number, etaSeconds: number, speedStr: string, sizeStr: string} | null>(null);
  const [whisperLanguage, setWhisperLanguageState] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0] || "auto";
    } catch {
      return "auto";
    }
  });
  const [instruction, setInstructionState] = useState("");
  const [alwaysWhisper, setAlwaysWhisperState] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [ollamaModelOptions, setOllamaModelOptions] = useState<{ id: string, label: string }[]>([]);

  const languageOptions = [
    { id: "fr", label: "Français" },
    { id: "en", label: "English" },
  ];



  const aiServiceOptions = [
    { id: "ollama", label: "Ollama" },
  ];

  const whisperModelOptions = [
    { id: "none", label: "None" },
    { id: "tiny", label: "Tiny", isDownload: !installedWhisperModels["tiny"] },
    { id: "base", label: "Base", isDownload: !installedWhisperModels["base"] },
    { id: "small", label: "Small", isDownload: !installedWhisperModels["small"] },
  ];

  const getWhisperSize = (model: string) => {
    switch (model) {
      case "tiny": return "31 MB";
      case "base": return "57 MB";
      case "small": return "180 MB";
      default: return "";
    }
  };

  const whisperLanguageOptions = [
    { id: "auto", label: "Auto" },
    { id: "en", label: "English" },
    { id: "fr", label: "Français" },
    { id: "es", label: "Español" },
    { id: "de", label: "Deutsch" },
  ];
  if (whisperLanguage !== "auto" && !whisperLanguageOptions.find(o => o.id === whisperLanguage)) {
    whisperLanguageOptions.push({ id: whisperLanguage, label: whisperLanguage.toUpperCase() });
  }

  //load settings on first open
  useEffect(() => {
    const loadSettings = async () => {
      try {
        await Settings.init();
        const s = await Settings.load();
        setLanguageState(s.language);
        setThemeState(s.theme);
        setAiServiceState(s.aiService);
        setOllamaUrlState(s.ollamaUrl);
        setWhisperModelState(s.whisperModel);
        setWhisperLanguageState(s.whisperLanguage);
        setInstructionState(s.instruction);
        setAlwaysWhisperState(s.alwaysWhisper);
        //apply to services
        AIModule.configure(s.ollamaUrl);
        Whisper.setLanguage(s.whisperLanguage);
      } catch (e) {
        console.warn("Failed to load settings", e);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  //save helpers — save setting and apply side effect
  const setLanguage = (v: string) => {
    setLanguageState(v);
    Settings.set("language", v);
  };

  const setTheme = (v: string) => {
    setThemeState(v);
    Settings.set("theme", v);
  };

  const setAiService = (v: string) => {
    setAiServiceState(v);
    Settings.set("aiService", v);
  };

  const setOllamaUrl = (v: string) => {
    setOllamaUrlState(v);
    Settings.set("ollamaUrl", v);
    AIModule.configure(v);
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

  const setWhisperLanguage = (v: string) => {
    setWhisperLanguageState(v);
    Settings.set("whisperLanguage", v);
    Whisper.setLanguage(v);
  };

  const setInstruction = (v: string) => {
    setInstructionState(v);
    Settings.set("instruction", v);
  };

  const setAlwaysWhisper = (v: boolean) => {
    setAlwaysWhisperState(v);
    Settings.set("alwaysWhisper", v);
  };

  const fetchOllamaModels = useCallback(async () => {
    if (aiService !== "ollama" || !settingsLoaded) return;
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
  }, [aiService, settingsLoaded]);

  //fetch models on open
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
      }, 300); // Wait for the 280ms open animation to finish
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

  const handleDownloadWhisper = async () => {
    if (whisperModel === "none") return;
    setIsDownloadingWhisper(true);
    setWhisperDownloadProgress(null);
    try {
      await Whisper.downloadModel(whisperModel, (progress, etaSeconds, speedStr, sizeStr) => {
        setWhisperDownloadProgress({ progress, etaSeconds, speedStr, sizeStr });
      });
      setWhisperInstalled(true);
      setInstalledWhisperModels(prev => ({ ...prev, [whisperModel]: true }));
      showAlert("Success", `Whisper ${whisperModel} model downloaded successfully.`);
    } catch (e) {
      console.error("Failed to download whisper model", e);
      showAlert("Error", "Failed to download Whisper model.");
    } finally {
      setIsDownloadingWhisper(false);
      setWhisperDownloadProgress(null);
    }
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

  const handleExport = async () => {
    try {
      const exported = await BackupService.exportData();
      if (exported !== false) {
        showAlert("Success", "Data exported successfully.");
      }
    } catch (e) {
      showAlert("Error", "Failed to export data");
    }
  };

  const handleImport = async () => {
    try {
      const imported = await BackupService.importData();
      if (imported) {
        showAlert("Success", "Data imported successfully. The app settings and conversations have been restored.");
        onDataChanged?.();
      }
    } catch (e) {
      showAlert("Error", "Failed to import data");
    }
  };

  const handleDeleteAll = () => {
    showAlert(
      "Delete all conversations",
      "Are you sure you want to delete all conversations? This action cannot be undone.",
      [
        { text: "Cancel", onPress: () => setAlertModalVisible(false), style: "secondary" },
        {
          text: "Delete",
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            try {
              await BackupService.deleteAllConversations();
              setTimeout(() => {
                showAlert("Success", "All conversations deleted.");
                onDataChanged?.();
              }, 300);
            } catch (e) {
              setTimeout(() => {
                showAlert("Error", "Failed to delete conversations");
              }, 300);
            }
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

  const innerContent = (
    <ScrollView contentContainerStyle={{ paddingTop: isDesktop ? 0 : 60, paddingBottom: 40, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionTitle}>General</Text>

      <View style={styles.settingRowVertical}>
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
        <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Theme</Text>
        <ThemeSelector
          selectedValue={theme}
          onSelect={setTheme}
        />
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>AI</Text>

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

      {true && (
        <>
          <View style={[styles.settingRowVertical, { zIndex: 9 }]}>
            <Text style={styles.settingLabel}>Whisper Model</Text>
            <Text style={[styles.helpText, { marginBottom: 10 }]}>The larger the size, the longer the processing will take.</Text>
            <Selector
              options={whisperModelOptions}
              selectedValue={whisperModel}
              onSelect={setWhisperModel}
              title="Select Whisper Model"
              fullWidth
            />
            {whisperModel !== "none" && (
              <View style={{ marginTop: 10 }}>
                {whisperInstalled ? (
                  <Pressable
                    style={({ pressed }) => [styles.downloadOption, pressed && { backgroundColor: "#eaeaea" }]}
                    onPress={handleDeleteWhisper}
                  >
                    <Text style={[styles.downloadText, { color: "#FF1A1A" }]}>Delete Model ({getWhisperSize(whisperModel)})</Text>
                  </Pressable>
                ) : isDownloadingWhisper ? (
                  <DownloadProgress
                    title={`Downloading Whisper ${whisperModel}...`}
                    progress={whisperDownloadProgress?.progress || 0}
                    sizeStr={whisperDownloadProgress?.sizeStr}
                    etaSeconds={whisperDownloadProgress?.etaSeconds}
                  />
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.downloadOption, pressed && { backgroundColor: "#eaeaea" }]}
                    onPress={handleDownloadWhisper}
                  >
                    <Image source={downloadIcon} style={styles.downloadIcon} tintColor="#0066cc" />
                    <Text style={styles.downloadText}>
                      Download {whisperModel} model ({getWhisperSize(whisperModel)})
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {whisperModel !== "none" && (
            <>
              <View style={styles.settingRowVertical}>
                <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Whisper Language</Text>
                <Selector
                  options={whisperLanguageOptions}
                  selectedValue={whisperLanguage}
                  onSelect={setWhisperLanguage}
                  title="Select Language"
                  fullWidth
                />
              </View>

              <View style={{ marginBottom: 20 }}>
                <Checkbox
                  label="Always transcribe on-device (Whisper)"
                  checked={alwaysWhisper}
                  onToggle={setAlwaysWhisper}
                />
              </View>
            </>
          )}
        </>
      )}

      {aiService === "ollama" && (
        <View style={styles.sectionGroup}>
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Ollama</Text>
          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Host URL</Text>
            <TextInputField
              icon={linkIcon}
              placeholder={Platform.OS === 'android' ? 'http://10.0.2.2:11434' : 'http://127.0.0.1:11434'}
              value={ollamaUrl}
              onChangeText={setOllamaUrl}
              onBlur={fetchOllamaModels}
            />
          </View>

          {ollamaError ? (
            <Text style={styles.errorText}>{ollamaError}</Text>
          ) : (
            <View style={styles.settingRowVertical}>
              <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Available Models</Text>
              {ollamaModelOptions.length > 0 ? (
                ollamaModelOptions.map((model) => (
                  <Text key={model.id} style={{ fontFamily: "IBMPlexMono-Medium", color: "#555", marginBottom: 4 }}>
                    • {model.label}
                  </Text>
                ))
              ) : (
                <Text style={{ fontFamily: "IBMPlexMono-Medium", color: "#888", marginBottom: 10 }}>
                  No models detected.
                </Text>
              )}
              {ollamaModelOptions.length === 0 && (
                isDownloading ? (
                  <DownloadProgress
                    title="Downloading Gemma4..."
                    progress={gemmaDownloadProgress?.progress || 0}
                    sizeStr={gemmaDownloadProgress?.sizeStr}
                    etaSeconds={gemmaDownloadProgress?.etaSeconds}
                  />
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.downloadOption, pressed && { backgroundColor: "#eaeaea" }, { marginTop: 10 }]}
                    onPress={() => setDownloadModalVisible(true)}
                  >
                    <Image source={downloadIcon} style={styles.downloadIcon} tintColor="#0066cc" />
                    <Text style={styles.downloadText}>
                      Download Gemma4?
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          )}
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Personalization</Text>
      <View style={styles.settingRowVertical}>
        <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Write your instruction for AI</Text>
        <TextInputField
          icon={penPlaceholderIcon}
          placeholder="Ex: You are a helpful assistant..."
          value={instruction}
          onChangeText={setInstruction}
        />
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 30 }]}>Data & Storage</Text>
      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, { flex: 1 }, pressed && { backgroundColor: "#eaeaea" }]}
          onPress={handleExport}
        >
          <Text style={styles.actionButtonText}>Export</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButton, { flex: 1 }, pressed && { backgroundColor: "#eaeaea" }]}
          onPress={handleImport}
        >
          <Text style={styles.actionButtonText}>Import</Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.actionButton,
          styles.dangerButton,
          { marginTop: 15, marginBottom: 20 },
          pressed && { backgroundColor: "#ffdcdc" }
        ]}
        onPress={handleDeleteAll}
      >
        <Text style={[styles.actionButtonText, styles.dangerButtonText]}>Delete all conversations</Text>
      </Pressable>
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
  sectionTitle: {
    fontSize: 12,
    color: "#888",
    fontFamily: "Jakarta",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 14,
    color: "#aaa",
    fontFamily: "Jakarta",
    marginTop: 10,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    zIndex: 10,
  },
  settingRowVertical: {
    marginBottom: 20,
    zIndex: 10,
  },
  sectionGroup: {
    marginBottom: 10,
  },
  settingLabel: {
    fontSize: 15,
    color: "#222",
    fontFamily: "IBMPlexMono-Medium",
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
    borderRadius: 8,
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
    color: "#0066cc",
    fontFamily: "IBMPlexMono-Medium",
  },
  helpText: {
    fontSize: 12,
    color: "#888",
    fontFamily: "Jakarta",
    marginTop: 4,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    alignItems: "center",
    position: "relative",
    zIndex: 1,
  },
  actionButtonText: {
    fontSize: 14,
    color: "#222",
    fontFamily: "IBMPlexMono-Medium",
  },
  dangerButton: {
    backgroundColor: "#fff0f0",
    borderColor: "#ffcccc",
  },
  dangerButtonText: {
    color: "#FF1A1A",
  },
});
