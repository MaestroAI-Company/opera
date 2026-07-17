import { Image, Pressable, StyleSheet, View } from "react-native";

const moreIcon = require("../assets/icons/More.png");
const addIcon = require("../assets/icons/add.png");

type TopBarProps = {
  onMenuPress: () => void;
  onNewPress: () => void;
  children?: React.ReactNode;
};

export default function TopBar({ onMenuPress, onNewPress, children }: TopBarProps) {
  return (
    <View style={styles.topBar}>
      <View style={styles.leftButtons}>
        <View style={styles.shadowLayer}>
          <View style={styles.shadowBlock} />
          <View style={styles.buttonsContainer}>
            <Pressable
              onPress={onMenuPress}
              style={({ pressed }) => [styles.button, pressed && { backgroundColor: "#eaeaea" }]}
            >
              <Image source={moreIcon} style={styles.buttonIcon} />
            </Pressable>
            <Pressable
              onPress={onNewPress}
              style={({ pressed }) => [styles.button, pressed && { backgroundColor: "#eaeaea" }]}
            >
              <Image source={addIcon} style={styles.buttonIcon} />
            </Pressable>
          </View>
        </View>
      </View>

      {children}
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
  leftButtons: {},
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
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonIcon: {
    width: 18,
    height: 18,
    resizeMode: "contain",
    tintColor: "#333333",
  },
});
