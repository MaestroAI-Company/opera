import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View, Alert } from "react-native";
import Selector from "./Selector";
import TextInputField from "./TextInputField";
import NotificationModal from "./NotificationModal";
import { AIModule } from "../src/services/ai/AIModule";
import { Settings } from "../src/services/settings/SettingsService";
import { Whisper } from "../src/services/whisper/WhisperService";
import { BackupService } from "../src/services/BackupService";

const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.88;

const linkIcon = require("../assets/icons/link.png");
const downloadIcon = require("../assets/icons/download.png");
const penPlaceholderIcon = require("../assets/icons/pencil.png");

type SettingsDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
};

export default function SettingsDrawer({ visible, onClose, onDataChanged }: SettingsDrawerProps) {
  const [rendered, setRendered] = useState(false);
  const translateX = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const [language, setLanguageState] = useState("fr");
  const [theme, setThemeState] = useState("system");
  const [aiService, setAiServiceState] = useState("ollama");
  const [ollamaUrl, setOllamaUrlState] = useState("");
  const [ollamaModel, setOllamaModelState] = useState("");
  const [ollamaError, setOllamaError] = useState("");
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [whisperModel, setWhisperModelState] = useState("base");
  const [whisperLanguage, setWhisperLanguageState] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0] || "auto";
    } catch {
      return "auto";
    }
  });
  const [instruction, setInstructionState] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [ollamaModelOptions, setOllamaModelOptions] = useState([
    { id: "llama3", label: "Llama 3" },
    { id: "mistral", label: "Mistral" },
    { id: "gemma", label: "Gemma" },
  ]);

  const languageOptions = [
    { id: "fr", label: "Français" },
    { id: "en", label: "English" },
  ];

  const themeOptions = [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];

  const aiServiceOptions = [
    { id: "ollama", label: "Ollama" },
  ];

  const whisperModelOptions = [
    { id: "tiny", label: "Tiny" },
    { id: "base", label: "Base" },
    { id: "small", label: "Small" },
  ];

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
        setOllamaModelState(s.ollamaModel);
        setWhisperModelState(s.whisperModel);
        setWhisperLanguageState(s.whisperLanguage);
        setInstructionState(s.instruction);
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

  const setOllamaModel = (v: string) => {
    setOllamaModelState(v);
    Settings.set("ollamaModel", v);
  };

  const setWhisperModel = (v: string) => {
    setWhisperModelState(v);
    Settings.set("whisperModel", v);
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
        
        //use state callback for latest model
        setOllamaModelState((currentModel) => {
          if (!options.find((o) => o.id === currentModel)) {
            const first = options[0].id;
            Settings.set("ollamaModel", first);
            return first;
          }
          return currentModel;
        });
      } else {
        setOllamaModelOptions([]);
        setOllamaModelState("");
      }
    } catch (e) {
      console.warn("Could not fetch Ollama models", e);
    }
  }, [aiService, settingsLoaded]);

  //fetch models on open
  useEffect(() => {
    if (visible) {
      fetchOllamaModels();
    }
  }, [visible, fetchOllamaModels]);

  const handleDownloadGemma = async () => {
    setDownloadModalVisible(false);
    setIsDownloading(true);
    try {
      await AIModule.downloadService("gemma4");
      const fetchedModels = await AIModule.getAvailableModels();
      if (fetchedModels && fetchedModels.length > 0) {
        const options = fetchedModels.map((m: string) => ({
          id: m,
          label: m,
        }));
        setOllamaModelOptions(options);
        setOllamaModelState("gemma4");
        Settings.set("ollamaModel", "gemma4");
      }
    } catch (e) {
      console.error("Failed to download gemma4", e);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExport = async () => {
    try {
      await BackupService.exportData();
    } catch (e) {
      Alert.alert("Error", "Failed to export data");
    }
  };

  const handleImport = async () => {
    try {
      await BackupService.importData();
      Alert.alert("Success", "Data imported successfully. The app settings and conversations have been restored.");
      onDataChanged?.();
    } catch (e) {
      Alert.alert("Error", "Failed to import data");
    }
  };

  const handleDeleteAll = () => {
    Alert.alert(
      "Delete all conversations",
      "Are you sure you want to delete all conversations? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              await BackupService.deleteAllConversations();
              Alert.alert("Success", "All conversations deleted.");
              onDataChanged?.();
            } catch (e) {
              Alert.alert("Error", "Failed to delete conversations");
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setRendered(true);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: DRAWER_WIDTH,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start((result) => {
        if (result.finished) {
          setRendered(false);
        }
      });
    }
  }, [visible]);

  if (!rendered) return null;

  return (
    <View style={styles.root} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.content, { transform: [{ translateX }] }]}>
        <ScrollView contentContainerStyle={{ paddingTop: 60, paddingBottom: 40, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Settings</Text>

        <Text style={styles.sectionTitle}>General</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Language</Text>
          <Selector
            options={languageOptions}
            selectedValue={language}
            onSelect={setLanguage}
            title="Select Language"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Theme</Text>
          <Selector
            options={themeOptions}
            selectedValue={theme}
            onSelect={setTheme}
            title="Select Theme"
          />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>AI</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>AI Service</Text>
          <Selector
            options={aiServiceOptions}
            selectedValue={aiService}
            onSelect={setAiService}
            title="Select AI Service"
          />
        </View>

        <View style={styles.settingRowVertical}>
          <View style={[styles.settingRow, { marginBottom: 4, zIndex: 9 }]}>
            <Text style={styles.settingLabel}>Whisper Model</Text>
            <Selector
              options={whisperModelOptions}
              selectedValue={whisperModel}
              onSelect={setWhisperModel}
              title="Select Whisper Model"
            />
          </View>
          <Text style={styles.helpText}>The larger the size, the longer the processing will take.</Text>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Whisper Language</Text>
          <Selector
            options={whisperLanguageOptions}
            selectedValue={whisperLanguage}
            onSelect={setWhisperLanguage}
            title="Select Language"
          />
        </View>

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
            ) : ollamaModelOptions.length > 0 ? (
              <View style={styles.settingRowVertical}>
                <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Preferred Model</Text>
                <Selector
                  options={[...ollamaModelOptions].sort((a, b) => {
                    if (a.id === ollamaModel) return -1;
                    if (b.id === ollamaModel) return 1;
                    return a.label.localeCompare(b.label);
                  })}
                  selectedValue={ollamaModel}
                  onSelect={setOllamaModel}
                  title="Select Model"
                  fullWidth
                />
              </View>
            ) : (
              <Pressable 
                style={({ pressed }) => [styles.downloadOption, pressed && { backgroundColor: "#eaeaea" }]} 
                onPress={() => setDownloadModalVisible(true)}
              >
                <Image source={downloadIcon} style={styles.downloadIcon} />
                <Text style={styles.downloadText}>
                  {isDownloading ? "Downloading..." : "No models. Download Gemma4?"}
                </Text>
              </Pressable>
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
      </Animated.View>

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
    </View>

    
    
  );

  
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
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
    width: DRAWER_WIDTH,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#222",
    marginBottom: 24,
    fontFamily: "monospace",
  },
  sectionTitle: {
    fontSize: 12,
    color: "#888",
    fontFamily: "monospace",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 14,
    color: "#aaa",
    fontFamily: "monospace",
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
    fontFamily: "monospace",
  },
  errorText: {
    fontSize: 13,
    color: "#FF1A1A",
    fontFamily: "monospace",
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
    tintColor: "#0066cc",
  },
  downloadText: {
    fontSize: 14,
    color: "#0066cc",
    fontFamily: "monospace",
    fontWeight: "bold",
  },
  helpText: {
    fontSize: 12,
    color: "#888",
    fontFamily: "monospace",
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
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#00000017",
    alignItems: "center",
    position: "relative",
    zIndex: 1,
  },
  actionButtonText: {
    fontSize: 14,
    color: "#222",
    fontFamily: "monospace",
    fontWeight: "bold",
  },
  dangerButton: {
    backgroundColor: "#fff0f0",
    borderColor: "#ffcccc",
  },
  dangerButtonText: {
    color: "#FF1A1A",
  },
});
