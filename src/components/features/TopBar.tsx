import { ReactNode } from "react";
import { Image, ImageSourcePropType, Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { pressStyle } from "../ui/pressStyle";

const moreIcon = require("../../../assets/icons/More.png");
const addIcon = require("../../../assets/icons/add.png");

type TopBarProps = {
  onMenuPress: () => void;
  onNewPress: () => void;
  centerElement?: ReactNode;
  rightElement?: ReactNode;
  isDesktop?: boolean;
};

export default function TopBar({ onMenuPress, onNewPress, centerElement, rightElement, isDesktop = false }: TopBarProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  //native desktop has no new button
  const showNewButton = !isDesktop || Platform.OS === "web";

  const menuButton = <BarButton icon={moreIcon} label={isDesktop ? t("topbar.discussions") : undefined} onPress={onMenuPress} />;
  const newButton = showNewButton && <BarButton icon={addIcon} label={isDesktop ? t("topbar.new") : undefined} onPress={onNewPress} />;

  return (
    <View style={styles.topBar}>
      <View style={styles.leftSection}>
        {isDesktop ? (
          <>
            <Pill>{menuButton}</Pill>
            {newButton && <Pill style={styles.newGap}>{newButton}</Pill>}
          </>
        ) : (
          //mobile shares one segmented pill
          <Pill>
            {menuButton}
            {newButton}
          </Pill>
        )}
      </View>

      <View style={styles.rightSection}>
        {centerElement && <View style={isDesktop ? styles.centerDesktop : styles.centerMobile}>{centerElement}</View>}
        {rightElement}
      </View>
    </View>
  );
}

//surface with the offset sticker shadow
function Pill({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.shadowLayer, style]}>
      <View style={styles.shadowBlock} />
      <View style={styles.pill}>{children}</View>
    </View>
  );
}

function BarButton({ icon, label, onPress }: { icon: ImageSourcePropType; label?: string; onPress: () => void }) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={pressStyle([styles.button, label ? styles.buttonLabeled : null], "surface")}
    >
      <Image source={icon} style={styles.buttonIcon} resizeMode="contain" tintColor={Colors.textPrimary} />
      {label && <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl2,
    paddingVertical: Spacing.md,
  },
  leftSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  newGap: {
    marginLeft: Spacing.xl2,
  },
  rightSection: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  centerDesktop: {
    marginRight: Spacing.xl2,
  },
  centerMobile: {
    marginRight: Spacing.xs,
  },
  shadowLayer: {
    position: "relative",
    zIndex: 6,
  },
  shadowBlock: {
    position: "absolute",
    top: 4,
    left: -4,
    right: 4,
    height: 44,
    backgroundColor: Colors.shadowInk,
    borderRadius: Radius.xxl,
  },
  pill: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    position: "relative",
    zIndex: 1,
    overflow: "hidden",
  },
  button: {
    height: 44,
    paddingHorizontal: 11,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  //labeled pill on desktop is slightly wider
  buttonLabeled: {
    paddingHorizontal: Spacing.lg2,
  },
  buttonIcon: {
    width: 18,
    height: 18,
  },
  buttonText: {
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
    marginLeft: Spacing.md,
  },
});
