import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { Image, Platform, Pressable, StyleSheet, View, Text } from "react-native";

const moreIcon = require("../../../assets/icons/More.png");
const addIcon = require("../../../assets/icons/add.png");

type TopBarProps = {
  onMenuPress: () => void;
  onNewPress: () => void;
  centerElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

export default function TopBar({ onMenuPress, onNewPress, centerElement, rightElement, isLargeScreen, isDesktop }: TopBarProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const showDesktopButtons = isDesktop;
  const showNewButton = !showDesktopButtons || Platform.OS === "web";

  return (
    <View style={styles.topBar}>
      <View style={styles.leftSection}>
        <View style={styles.shadowLayer}>
          <View style={styles.shadowBlock} />
          <View style={styles.buttonsContainer}>
            <Pressable
              onPress={onMenuPress}
              style={({ pressed, hovered }) => [styles.button, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
            >
              <Image source={moreIcon} style={styles.buttonIcon} resizeMode="contain" tintColor={Colors.textPrimary} />
              {showDesktopButtons && <Text style={styles.buttonText}>Conversation</Text>}
            </Pressable>
            {showNewButton && (
              <Pressable
                onPress={onNewPress}
                style={({ pressed, hovered }) => [styles.button, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
              >
                <Image source={addIcon} style={styles.buttonIcon} resizeMode="contain" tintColor={Colors.textPrimary} />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View style={styles.rightSection}>
        {centerElement && <View style={{ marginRight: isDesktop ? 16 : 4 }}>{centerElement}</View>}
        {rightElement}
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  leftSection: {
    flex: 1,
    alignItems: "flex-start",
  },
  rightSection: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: "center",
  },
  shadowLayer: {
    position: "relative",
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
  buttonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    position: "relative",
    zIndex: 1,
    overflow: "hidden",
  },
  button: {
    height: 40,
    paddingHorizontal: 11,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  buttonIcon: {
    width: 18,
    height: 18,
  },
  buttonText: {
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
});
