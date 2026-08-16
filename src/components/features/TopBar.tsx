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

  //desktop: Discussions and New are two independent pills, side by side (matches the Model/Settings pattern)
  if (showDesktopButtons) {
    return (
      <View style={styles.topBar}>
        <View style={styles.leftSectionRow}>
          <View style={styles.shadowLayer}>
            <View style={styles.shadowBlock} />
            <Pressable
              onPress={onMenuPress}
              style={({ pressed, hovered }) => [styles.soloButton, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
            >
              <Image source={moreIcon} style={styles.buttonIcon} resizeMode="contain" tintColor={Colors.textPrimary} />
              <Text style={styles.buttonText}>Discussions</Text>
            </Pressable>
          </View>
          {showNewButton && (
            <View style={[styles.shadowLayer, styles.newGap]}>
              <View style={styles.shadowBlock} />
              <Pressable
                onPress={onNewPress}
                style={({ pressed, hovered }) => [styles.soloButton, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
              >
                <Image source={addIcon} style={styles.buttonIcon} resizeMode="contain" tintColor={Colors.textPrimary} />
                <Text style={styles.buttonText}>New</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.rightSection}>
          {centerElement && <View style={{ marginRight: 16 }}>{centerElement}</View>}
          {rightElement}
        </View>
      </View>
    );
  }

  //mobile/tablet: unchanged, both icon-only buttons share one segmented pill
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
        {centerElement && <View style={{ marginRight: 4 }}>{centerElement}</View>}
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
  //desktop: Discussions and New sit as independent pills in a row
  leftSectionRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  newGap: {
    marginLeft: 16,
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
  //desktop: standalone bordered pill, same treatment as the Settings button
  soloButton: {
    height: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    position: "relative",
    zIndex: 1,
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
