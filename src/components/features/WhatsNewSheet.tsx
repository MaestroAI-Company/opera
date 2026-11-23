import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import type { ReleaseNotes } from "../../services/updates/UpdateService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import ImageCard from "../ui/ImageCard";
import { renderMarkdown } from "../ui/MarkdownText";
import DrawerSheet, { SheetScrollView } from "./DrawerSheet";

import arrowIcon from "../../../assets/icons/arrow2.svg";
import downloadIcon from "../../../assets/icons/download2.svg";
import githubIcon from "../../../assets/icons/github.svg";

const DESKTOP_CARD_WIDTH = 420;
const BANNER_SIZE = { width: 1561, height: 800 };
const BANNER_BASE = "https://raw.githubusercontent.com/MaestroAI-Company/opera";

//first line ![](updatebanner.png) becomes the banner, resolved at the release tag
function splitBanner(release: ReleaseNotes | null): { banner: string | null; notes: string } {
  if (!release) return { banner: null, notes: "" };
  const match = release.notes.match(/^!\[[^\]]*\]\(([^)\s]+)\)\s*/);
  if (!match) return { banner: null, notes: release.notes };
  const path = match[1];
  const tag = release.tag ?? `v${release.version}`;
  const banner = /^https?:\/\//.test(path) ? path : `${BANNER_BASE}/${tag}/distribution/${path}`;
  return { banner, notes: release.notes.slice(match[0].length) };
}

type WhatsNewSheetProps = {
  release: ReleaseNotes | null;
  onClose: () => void;
  //only shown from update banner
  onOpenGithub?: () => void;
  //desktop installs in app
  onInstall?: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//release notes after an update
export default function WhatsNewSheet({ release, onClose, onOpenGithub, onInstall, isLargeScreen = false, isDesktop = false }: WhatsNewSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  //last notes stay during close animation
  const [shown, setShown] = useState<ReleaseNotes | null>(release);
  if (release && release !== shown) setShown(release);

  const { banner, notes: body } = useMemo(() => splitBanner(shown), [shown]);
  const notes = useMemo(() => (shown ? renderMarkdown(body) : null), [shown, body]);
  //show the banner only once loaded, no empty box when offline
  const [loadedBanner, setLoadedBanner] = useState<string | null>(null);
  useEffect(() => {
    if (!banner) return;
    Image.prefetch(banner).then(() => setLoadedBanner(banner)).catch(() => {});
  }, [banner]);

  return (
    <DrawerSheet
      visible={!!release}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      //sheet may grow up to just under the status bar
      sheetStyle={[styles.sheet, { maxHeight: windowHeight - insets.top - Spacing.xl2 }]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView contentContainerStyle={styles.content}>
        {shown && (
          <View style={styles.contentCard}>
            {banner && banner === loadedBanner && (
              <ImageCard source={{ uri: banner, ...BANNER_SIZE }} width="100%" style={styles.banner} />
            )}
            <Text style={styles.title}>{t("whatsNew.title", { version: shown.version })}</Text>
            <View style={styles.notes}>{notes}</View>
            {onOpenGithub && (
              <>
                {!onInstall && <Text style={styles.storeNote}>{t("whatsNew.storeDelay")}</Text>}
                <Group style={styles.githubGroup}>
                  <ActionButton icon={githubIcon} label={t("whatsNew.openGithub")} onPress={onOpenGithub} />
                </Group>
              </>
            )}
            <Group style={styles.highlightGroup}>
              {onInstall ? (
                <ActionButton icon={downloadIcon} label={t("update.install")} onPress={onInstall} variant="highlight" />
              ) : (
                <ActionButton icon={arrowIcon} label={t("whatsNew.close")} onPress={onClose} variant="highlight" />
              )}
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
  },
  contentCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl + Spacing.md,
    borderWidth: 0,
    padding: Spacing.md,
  },
  banner: {
    marginBottom: Spacing.md,
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
  storeNote: {
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  githubGroup: {
    marginBottom: Spacing.md,
  },
  highlightGroup: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
});
