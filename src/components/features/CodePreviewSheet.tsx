import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import { CodeContent, codeLanguageName } from "../ui/MarkdownText";
import DrawerSheet from "./DrawerSheet";

const copyIcon = require("../../../assets/icons/copy2.png");

const DESKTOP_CARD_WIDTH = 560;

export type PreviewCode = { code: string; language?: string; title?: string; incognito?: boolean };

type CodePreviewSheetProps = {
  code: PreviewCode | null;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  bottomInset?: number;
};

//full view of a chat code block
export default function CodePreviewSheet({ code, onClose, isLargeScreen = false, isDesktop = false, bottomInset = 0 }: CodePreviewSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  //last code stays during close animation
  const [shown, setShown] = useState<PreviewCode | null>(code);
  const [copied, setCopied] = useState(false);
  if (code && code !== shown) {
    setShown(code);
    setCopied(false);
  }

  const language = codeLanguageName(shown?.language);
  const rows = shown ? [
    shown.title ? { label: t("codePreview.name"), value: shown.title } : null,
    language ? { label: t("codePreview.language"), value: language } : null,
    { label: t("codePreview.lines"), value: String(shown.code.split("\n").length) },
    { label: t("codePreview.characters"), value: String(shown.code.length) },
  ].filter((r): r is { label: string; value: string } => r !== null) : [];

  const handleCopy = async () => {
    if (!shown) return;
    await Clipboard.setStringAsync(shown.code);
    setCopied(true);
  };

  return (
    <DrawerSheet
      visible={!!code}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      //sheet may grow up to just under the status bar
      sheetStyle={[styles.sheet, { paddingBottom: (Platform.OS === "ios" ? 20 : 10) + bottomInset, maxHeight: windowHeight - insets.top - Spacing.xl2 }]}
      desktopStyle={styles.desktopCard}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {shown && (
          <>
            <Group style={styles.infoGroup}>
              <View style={styles.codeContainer}>
                <CodeContent code={shown.code} language={shown.language} incognito={shown.incognito} radius={Radius.xxl} />
              </View>
              {rows.map(row => (
                <ActionButton
                  key={row.label}
                  label={row.label}
                  rightElement={<Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">{row.value}</Text>}
                />
              ))}
            </Group>
            <View style={styles.buttonCard}>
              <Group>
                <ActionButton
                  icon={copyIcon}
                  label={copied ? t("chat.copied") : t("common.copy")}
                  onPress={handleCopy}
                />
              </Group>
            </View>
          </>
        )}
      </ScrollView>
    </DrawerSheet>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.groupedBackground,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingTop: Spacing.lg2,
  },
  desktopCard: {
    width: DESKTOP_CARD_WIDTH,
  },
  sheetHandleContainer: {
    alignItems: "center",
    marginBottom: Spacing.xs2,
    paddingVertical: Spacing.lg,
    marginTop: -Spacing.lg,
  },
  content: {
    paddingHorizontal: Spacing.lg2,
    paddingBottom: Spacing.lg,
    gap: Spacing.xxl2,
  },
  codeContainer: {
    padding: Spacing.md,
  },
  infoGroup: {
    borderRadius: Radius.xxl + Spacing.md,
    borderWidth: 0,
  },
  buttonCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl + Spacing.md,
    padding: Spacing.md,
  },
  //label takes the rest of the row
  infoValue: {
    flexShrink: 1,
    maxWidth: "60%",
    textAlign: "right",
    color: Colors.textMuted,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
  },
});
