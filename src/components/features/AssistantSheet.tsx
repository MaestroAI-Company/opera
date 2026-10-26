import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useT } from "../../i18n";
import { useThemedStyles } from "../../hooks/useTheme";
import { openAssistantSettings } from "../../services/assistant/DefaultAssistant";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import ImageCard from "../ui/ImageCard";
import DrawerSheet, { SheetScrollView } from "./DrawerSheet";

const operaIcon = require("../../../assets/icons/operaicon.png");
const assistantInfoImage = require("../../../assets/images/ImageCard/AssistantInfo.png");

const DESKTOP_CARD_WIDTH = 380;

type AssistantSheetProps = {
  visible: boolean;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  bottomInset?: number;
};

//offers the default assistant role once
export default function AssistantSheet({ visible, onClose, isLargeScreen = false, isDesktop = false, bottomInset = 0 }: AssistantSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <DrawerSheet
      visible={visible}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.sheet,
        { paddingBottom: (Platform.OS === "ios" ? 20 : 10) + bottomInset, maxHeight: windowHeight - insets.top - Spacing.xl2 },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView contentContainerStyle={styles.content}>
        <View style={styles.contentCard}>
          <ImageCard source={assistantInfoImage} width="100%" style={styles.image} />

          <View style={styles.row}>
            <Text style={styles.settingLabel}>{t("settings.overlay.default")}</Text>
            <Text style={styles.helpText}>{t("settings.overlay.defaultHelp")}</Text>
          </View>

          <Group style={styles.highlightGroup}>
            <ActionButton
              icon={operaIcon}
              label={t("settings.overlay.setDefault")}
              onPress={() => {
                openAssistantSettings();
                onClose();
              }}
              variant="highlight"
            />
          </Group>
        </View>
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
  image: {
    marginBottom: Spacing.lg2,
  },
  row: {
    marginBottom: Spacing.xxl,
  },
  settingLabel: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  helpText: {
    fontSize: FontSizes.bodyMd,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    marginTop: Spacing.xs,
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
  },
  highlightGroup: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
});
