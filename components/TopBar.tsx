import { Image, Pressable, StyleSheet, View, Text } from "react-native";

const moreIcon = require("../assets/icons/More.png");
const addIcon = require("../assets/icons/add.png");

type TopBarProps = {
  onMenuPress: () => void;
  onNewPress: () => void;
  centerElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

export default function TopBar({ onMenuPress, onNewPress, centerElement, rightElement, isLargeScreen, isDesktop }: TopBarProps) {
  const showDesktopButtons = isDesktop;

  return (
    <View style={styles.topBar}>
      <View style={styles.leftSection}>
        <View style={styles.shadowLayer}>
          <View style={styles.shadowBlock} />
          <View style={styles.buttonsContainer}>
            <Pressable
              onPress={onMenuPress}
              style={({ pressed }) => [styles.button, pressed && { backgroundColor: "#eaeaea" }]}
            >
              <Image source={moreIcon} style={styles.buttonIcon} resizeMode="contain" tintColor="#333333" />
              {showDesktopButtons && <Text style={styles.buttonText}>Conversation</Text>}
            </Pressable>
            {!showDesktopButtons && (
              <Pressable
                onPress={onNewPress}
                style={({ pressed }) => [styles.button, pressed && { backgroundColor: "#eaeaea" }]}
              >
                <Image source={addIcon} style={styles.buttonIcon} resizeMode="contain" tintColor="#333333" />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View style={styles.centerSection}>
        {centerElement}
      </View>

      <View style={styles.rightSection}>
        {rightElement}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  centerSection: {
    flex: 2,
    alignItems: "center",
  },
  rightSection: {
    flex: 1,
    alignItems: "flex-end",
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
    backgroundColor: "#00000013",
    borderRadius: 10,
  },
  buttonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 10,
    position: "relative",
    zIndex: 1,
    overflow: "hidden",
  },
  button: {
    height: 40,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  buttonIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: "IBMPlexMono-Medium",
    color: "#333",
  },
});
