import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import DrawerSheet, { SheetScrollView } from "./DrawerSheet";

const cancelIcon = require("../../../assets/icons/cancel.png");

const DESKTOP_CARD_WIDTH = 720;

type HubSheetProps = {
  visible: boolean;
  rows: { label: string; value: string }[];
  //only the machine hosting the hub can stop it
  canStop: boolean;
  busy: boolean;
  onStop: () => void;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//hub details and its stop action, opened from the orbit center
export default function HubSheet({
  visible,
  rows,
  canStop,
  busy,
  onStop,
  onClose,
  isLargeScreen = false,
  isDesktop = false,
}: HubSheetProps) {
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
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: windowHeight - insets.top - Spacing.xl2,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView contentContainerStyle={styles.content}>
        <View style={[styles.contentCard, !canStop && { marginBottom: 0 }]}>
          <Group style={styles.infoGroup}>
            {rows.map((row) => (
              <ActionButton
                key={row.label}
                label={row.label}
                rightElement={
                  <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
                    {row.value}
                  </Text>
                }
              />
            ))}
          </Group>
        </View>

        {canStop && (
          <View style={[styles.contentCard, { marginBottom: 0 }]}>
            <Group>
              <ActionButton
                icon={cancelIcon}
                label={t("settings.hub.stopHosting")}
                disabled={busy}
                onPress={onStop}
              />
            </Group>
          </View>
        )}
      </SheetScrollView>
    </DrawerSheet>
  );
}

//same values as the device sheet
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
      marginBottom: Spacing.xxl2,
    },
    infoGroup: {
      borderWidth: 0,
    },
    infoValue: {
      flexShrink: 1,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textMuted,
      textAlign: "right",
      maxWidth: "60%",
    },
  });
