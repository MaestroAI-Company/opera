import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useVoicePackInstalled } from "../../hooks/useVoicePackInstalled";
import { useT } from "../../i18n";
import { Settings } from "../../services/settings/SettingsService";
import {
  InstallSnapshot,
  getInstallSnapshot,
  install,
  InstallCancelled,
  isInstalling,
  subscribeInstall,
  supportedEngineIds,
} from "../../services/speech/engines";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import ProgressBar from "../ui/ProgressBar";

const downloadIcon = require("../../../assets/icons/download.png");

export const TTS_ENGINE_KEYS = {
  supertonic: "settings.tts.supertonic",
} as const;

//voice pack download, shared by settings and onboarding
export default function VoiceEngineCard({ onOpenDownload }: { onOpenDownload: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const packId = supportedEngineIds()[0];
  const installed = useVoicePackInstalled();
  //download may have started in chat
  const [download, setDownload] = useState<{ id: string; snapshot: InstallSnapshot } | null>(() => {
    const id = supportedEngineIds().find(isInstalling);
    return id ? { id, snapshot: getInstallSnapshot(id) ?? { progress: 0, sizeStr: "" } } : null;
  });

  useEffect(() => subscribeInstall((id, snapshot) => setDownload(snapshot ? { id, snapshot } : null)), []);

  const handleDownloadPack = async () => {
    try {
      await install(packId);
      Settings.set("ttsEngine", packId);
    } catch (e) {
      if (e instanceof InstallCancelled) return;
      console.error(`Failed to download ${packId} voice`, e);
    }
  };

  if (!packId || installed) return null;

  return (
    <View style={styles.contentCard}>
      <Text style={styles.settingLabel}>{t("settings.tts.pack.title")}</Text>
      <Text style={[styles.helpText, styles.labelGap]}>{t("settings.tts.pack.help")}</Text>
      <Group>
        {download ? (
          <Pressable onPress={onOpenDownload}>
            <ProgressBar progress={download.snapshot.progress} icon={downloadIcon} />
          </Pressable>
        ) : (
          <ActionButton icon={downloadIcon} label={t("settings.tts.pack.download")} onPress={handleDownloadPack} />
        )}
      </Group>
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
