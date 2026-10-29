import { useMemo, useState } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import type { ReleaseNotes } from "../../services/updates/UpdateService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import { renderMarkdown } from "../ui/MarkdownText";
import DrawerSheet, { SheetScrollView } from "./DrawerSheet";

const arrowIcon = require("../../../assets/icons/arrow.png");

const DESKTOP_CARD_WIDTH = 420;

type WhatsNewSheetProps = {
  release: ReleaseNotes | null;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  bottomInset?: number;
};

//release notes after an update
export default function WhatsNewSheet({ release, onClose, isLargeScreen = false, isDesktop = false, bottomInset = 0 }: WhatsNewSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  //last notes stay during close animation
  const [shown, setShown] = useState<ReleaseNotes | null>(release);
  if (release && release !== shown) setShown(release);

  const notes = useMemo(() => (shown ? renderMarkdown(shown.notes) : null), [shown]);

  return (
    <DrawerSheet
      visible={!!release}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      //sheet may grow up to just under the status bar
      sheetStyle={[styles.sheet, { paddingBottom: (Platform.OS === "ios" ? 20 : 10) + bottomInset, maxHeight: windowHeight - insets.top - Spacing.xl2 }]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView contentContainerStyle={styles.content}>
        {shown && (
          <View style={styles.contentCard}>
            <Text style={styles.title}>{t("whatsNew.title", { version: shown.version })}</Text>
            <View style={styles.notes}>{notes}</View>
            <Group style={styles.highlightGroup}>
              <ActionButton icon={arrowIcon} label={t("whatsNew.close")} onPress={onClose} variant="highlight" />
            </Group>
          </View>
        )}
      </SheetScrollView>
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
    paddingTop: Spacing.xxl,
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
  content: {
    paddingHorizontal: Spacing.lg2,
    paddingBottom: Spacing.lg,
  },
  contentCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl + Spacing.md,
    borderWidth: 0,
    padding: Spacing.md,
  },
  title: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  notes: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg2,
  },
  highlightGroup: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
});
