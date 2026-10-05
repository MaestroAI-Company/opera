import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { getLocale, useT } from "../../i18n";
import { formatBytes } from "../../services/ai/providers/huggingFaceCatalog";
import { Settings } from "../../services/settings/SettingsService";
import {
  NEURAL_ENGINES,
  TTS_SPEEDS,
  getVoice,
  setVoice,
  supportedEngineIds,
} from "../../services/speech/engines";
import DownloadProgress, { throttleProgress } from "../ui/DownloadProgress";
import Group from "../ui/Group";
import NotificationModal, { ModalButton } from "../ui/NotificationModal";
import Selector from "../ui/Selector";
import Slider from "../ui/Slider";

const deleteIcon = require("../../../assets/icons/delete.png");
const timeIcon = require("../../../assets/icons/time.png");

const TTS_ENGINE_KEYS = {
  kokoro: "settings.tts.kokoro",
  supertonic: "settings.tts.supertonic",
} as const;

//voice engine, voice and speed, shared by settings and onboarding
export default function VoiceEngineCard() {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const language = getLocale();
  const [ttsEngine, setTtsEngineState] = useState(() => Settings.getCached().ttsEngine);
  const [ttsVoice, setTtsVoiceState] = useState(() => getVoice(Settings.getCached().ttsEngine));
  const [ttsSpeed, setTtsSpeedState] = useState(() => Settings.getCached().ttsSpeed);
  const [installedEngines, setInstalledEngines] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(supportedEngineIds().map((id) => [id, NEURAL_ENGINES[id].isInstalled()])),
  );
  const [downloadingEngine, setDownloadingEngine] = useState<string | null>(null);
  const [engineDownloadProgress, setEngineDownloadProgress] = useState<{
    progress: number;
    sizeStr: string;
  } | null>(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    buttons?: ModalButton[];
  }>({ title: "", message: "" });

  const showAlert = (title: string, message: string, buttons?: ModalButton[]) => {
    setAlertConfig({ title, message, buttons });
    setAlertVisible(true);
  };

  const ttsEngines = supportedEngineIds();
  const engineName = (id: string) => t(TTS_ENGINE_KEYS[id as keyof typeof TTS_ENGINE_KEYS]);

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
      showAlert(t("common.success"), t("settings.tts.downloadSuccess", { engine: engineName(id) }));
    } catch (e) {
      console.error(`Failed to download ${id} voice`, e);
      showAlert(t("common.error"), t("settings.tts.downloadFailed", { engine: engineName(id) }));
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
          onPress: () => setAlertVisible(false),
          style: "secondary",
        },
        {
          text: t("settings.tts.download.confirm"),
          onPress: () => {
            setAlertVisible(false);
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
          onPress: () => setAlertVisible(false),
          style: "secondary",
        },
        {
          text: t("common.delete"),
          style: "danger",
          onPress: async () => {
            setAlertVisible(false);
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

  const ttsVoiceOptions = NEURAL_ENGINES[ttsEngine]?.voiceOptions(language) ?? [];
  //kokoro may lack the slot
  const selectedTtsVoice = ttsVoiceOptions.some((o) => o.id === ttsVoice)
    ? ttsVoice
    : (ttsVoiceOptions[0]?.id ?? "");

  const ttsSpeedOptions = TTS_SPEEDS.map((id) => ({ id, label: `${id}×` }));

  if (ttsEngines.length === 0) return null;

  return (
    <View style={styles.contentCard}>
      <View style={styles.settingRowVertical}>
        <Text style={styles.settingLabel}>{t("settings.tts.label")}</Text>
        <Text style={[styles.helpText, styles.labelGap]}>{t("settings.tts.help")}</Text>
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
            title={t("settings.tts.downloading", { engine: engineName(downloadingEngine) })}
            progress={engineDownloadProgress?.progress || 0}
            sizeStr={engineDownloadProgress?.sizeStr}
          />
        )}
      </View>
      {ttsVoiceOptions.length > 0 && installedEngines[ttsEngine] && (
        <View style={styles.settingRowVertical}>
          <Text style={[styles.settingLabel, styles.labelGap]}>{t("settings.tts.voiceLabel")}</Text>
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
      <View style={[styles.settingRowVertical, styles.lastRow]}>
        <Text style={[styles.settingLabel, styles.labelGap]}>{t("settings.tts.speed")}</Text>
        <Group>
          <Slider icon={timeIcon} options={ttsSpeedOptions} selectedValue={ttsSpeed} onSelect={setTtsSpeed} />
        </Group>
      </View>
      <NotificationModal
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertVisible(false)}
        buttons={alertConfig.buttons}
      />
    </View>
  );
}

//same card, label and help text as the settings pages
const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    contentCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
      marginBottom: Spacing.xxl2,
    },
    settingRowVertical: {
      marginBottom: Spacing.xxl,
      zIndex: 10,
    },
    lastRow: {
      marginBottom: 0,
    },
    settingLabel: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      paddingTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    labelGap: {
      marginBottom: Spacing.md,
    },
    helpText: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.bodyMd,
      lineHeight: 20,
      color: Colors.textMuted,
      marginTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
  });
