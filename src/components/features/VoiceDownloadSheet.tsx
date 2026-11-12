import { useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import {
  InstallSnapshot,
  canCancelInstall,
  cancelInstall,
  getInstallSnapshot,
  isInstalling,
  subscribeInstall,
  supportedEngineIds,
} from "../../services/speech/engines";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import ProgressBar from "../ui/ProgressBar";
import DrawerSheet, { SheetBody, SheetScrollView } from "./DrawerSheet";
import { TTS_ENGINE_KEYS } from "./VoiceEngineCard";

const downloadIcon = require("../../../assets/icons/download.png");
const cancelIcon = require("../../../assets/icons/cancel.png");

const DESKTOP_CARD_WIDTH = 560;

type VoiceDownloadSheetProps = {
  visible: boolean;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//voice pack download detail, same layout as the on-device one
export default function VoiceDownloadSheet({ visible, onClose, isLargeScreen = false, isDesktop = false }: VoiceDownloadSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const packId = supportedEngineIds()[0];
  const [snapshot, setSnapshot] = useState<InstallSnapshot | null>(() => (packId ? getInstallSnapshot(packId) : null));

  useEffect(
    () =>
      subscribeInstall((id, next) => {
        if (id !== packId) return;
        setSnapshot(next);
        //finished or cancelled
        if (!next) onClose();
      }),
    [packId, onClose],
  );

  if (!packId) return null;
  const starting = t("download.starting");
  const engine = t(TTS_ENGINE_KEYS[packId as keyof typeof TTS_ENGINE_KEYS]);

  return (
    <DrawerSheet
      visible={visible}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[styles.sheet, { maxHeight: windowHeight - insets.top - Spacing.xl2 }]}
      desktopStyle={styles.desktopCard}
    >
      <SheetBody style={styles.body}>
        <SheetScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={[styles.label, { marginBottom: Spacing.md }]}>
              {t("settings.litert.downloadingModel", { name: engine })}
            </Text>
            <Group style={{ marginBottom: Spacing.lg2 }}>
              <ProgressBar progress={snapshot?.progress ?? 0} icon={downloadIcon} />
              <ActionButton
                label={t("settings.litert.downloaded")}
                rightElement={<Text style={styles.rowMeta}>{snapshot?.sizeStr || starting}</Text>}
              />
              <ActionButton
                label={t("settings.litert.speed")}
                rightElement={<Text style={styles.rowMeta}>{snapshot?.speedStr ?? starting}</Text>}
              />
              <ActionButton
                label={t("settings.litert.timeLeft")}
                rightElement={
                  <Text style={styles.rowMeta}>
                    {snapshot?.etaSeconds ? `${Math.round(snapshot.etaSeconds)}s` : starting}
                  </Text>
                }
              />
            </Group>
            {canCancelInstall(packId) && (
              <Group>
                <ActionButton
                  icon={cancelIcon}
                  label={t("settings.litert.cancelDownload")}
                  disabled={!isInstalling(packId)}
                  onPress={() => cancelInstall(packId)}
                />
              </Group>
            )}
          </View>
        </SheetScrollView>
      </SheetBody>
    </DrawerSheet>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    sheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.groupedBackground,
      borderTopLeftRadius: Radius.huge2,
      borderTopRightRadius: Radius.huge2,
      paddingTop: Spacing.xxl,
      overflow: "hidden",
    },
    desktopCard: {
      width: DESKTOP_CARD_WIDTH,
    },
    sheetHandleContainer: {
      //floats so top edge matches sides
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      alignItems: "center",
      paddingVertical: Spacing.md,
    },
    body: {
      flexShrink: 1,
      position: "relative",
    },
    content: {
      paddingHorizontal: Spacing.lg2,
      paddingBottom: Spacing.lg,
    },
    card: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
    },
    label: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
      paddingTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    rowMeta: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.micro,
      color: Colors.textMuted,
    },
  });
