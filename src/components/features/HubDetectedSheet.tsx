import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Fonts,
  FontSizes,
  Radius,
  Spacing,
  ThemeColors,
} from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { NearbyHub } from "../../services/hub/SamplerHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import DrawerSheet, { SheetScrollView } from "./DrawerSheet";

const linkIcon = require("../../../assets/icons/link.png");
const laptopIcon = require("../../../assets/icons/laptop.png");

const DESKTOP_CARD_WIDTH = 720;

type HubDetectedSheetProps = {
  visible: boolean;
  hub: NearbyHub | null;
  onClose: () => void;
  onLink: (hub: NearbyHub) => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//offers a hub found on the network, same look as the pairing sheet
export default function HubDetectedSheet({
  visible,
  hub,
  onClose,
  onLink,
  isLargeScreen = false,
  isDesktop = false,
}: HubDetectedSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
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
          maxHeight: windowHeight - insets.top - Spacing.xl2,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView contentContainerStyle={styles.content}>
        {hub && (
          <View style={styles.contentCard}>
            <Image
              source={laptopIcon}
              style={styles.hubImage}
              tintColor={Colors.textPrimary}
              resizeMode="contain"
            />
            <Text style={styles.title} numberOfLines={1}>
              {hub.name}
            </Text>
            <Text style={styles.foundText}>{t("hubPairing.found")}</Text>
            <Text style={styles.foundId} numberOfLines={1}>
              {hub.id.slice(0, 8)}
            </Text>
            <Group style={styles.highlightGroup}>
              <ActionButton
                icon={linkIcon}
                label={t("hubPairing.link", { name: hub.name })}
                variant="highlight"
                onPress={() => onLink(hub)}
              />
            </Group>
          </View>
        )}
      </SheetScrollView>
    </DrawerSheet>
  );
}

//same values as settings drawer pages
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
    hubImage: {
      width: "100%",
      height: 220,
      marginVertical: Spacing.xxl2,
    },
    title: {
      fontSize: FontSizes.displayMd,
      color: Colors.textPrimary,
      fontFamily: Fonts.display,
      textAlign: "center",
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.lg,
    },
    foundText: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
      paddingHorizontal: Spacing.md,
    },
    foundId: {
      fontSize: FontSizes.body,
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      marginTop: Spacing.sm,
      marginBottom: Spacing.lg2,
      paddingHorizontal: Spacing.md,
    },
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
  });
