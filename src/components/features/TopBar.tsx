import { ReactNode } from "react";
import { Image, ImageSourcePropType, Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { pressStyle } from "../ui/pressStyle";

const moreIcon = require("../../../assets/icons/More.png");
const addIcon = require("../../../assets/icons/add.png");

type TopBarProps = {
  onMenuPress: () => void;
  onNewPress: () => void;
  centerElement?: ReactNode;
  rightElement?: ReactNode;
  //centered in the bar, between both sides
  middleElement?: ReactNode;
  //only the middle and right elements, for the sampler screen
  middleOnly?: boolean;
  showNewButton?: boolean;
  isDesktop?: boolean;
};

export default function TopBar({
  onMenuPress,
  onNewPress,
  centerElement,
  rightElement,
  middleElement,
  middleOnly = false,
  showNewButton = true,
  isDesktop = false,
}: TopBarProps) {
  const styles = useThemedStyles(makeStyles);

  const menuButton = <BarButton icon={moreIcon} onPress={onMenuPress} />;
  const newButton = <BarButton icon={addIcon} onPress={onNewPress} />;

  return (
    <View style={styles.topBar}>
      <View style={styles.leftSection}>
        {middleOnly || isDesktop ? null : (
          //mobile shares one segmented pill
          <Pill>
            {menuButton}
            {showNewButton && newButton}
          </Pill>
        )}
      </View>

      {middleElement && <Pill style={styles.middle}>{middleElement}</Pill>}

      <View style={styles.rightSection}>
        {!middleOnly && centerElement && (
          <View style={isDesktop ? styles.centerDesktop : styles.centerMobile}>{centerElement}</View>
        )}
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

function BarButton({ icon, onPress }: { icon: ImageSourcePropType; onPress: () => void }) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={pressStyle(styles.button, "surface")}
    >
      <Image source={icon} style={styles.buttonIcon} resizeMode="contain" tintColor={Colors.textPrimary} />
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
  //fits the chat and sampler switch
  middle: {
    width: 220,
    marginHorizontal: Spacing.xl2,
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
    borderRadius: Radius.window,
  },
  pill: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.window,
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
  buttonIcon: {
    width: 18,
    height: 18,
  },
});
