import { View, Pressable, Text, StyleSheet } from "react-native";

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
          <View style={styles.buttonsRow}>
            <Pressable onPress={onMenuPress} style={styles.squareButton}>
              <Text style={styles.buttonLabel}>☰</Text>
            </Pressable>
            <Pressable onPress={onNewPress} style={styles.squareButton}>
              <Text style={styles.buttonLabel}>＋</Text>
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
    width: 68,
    height: 36,
    backgroundColor: "#00000013",
    borderRadius: 5,
  },
  buttonsRow: {
    flexDirection: "row",
    position: "relative",
    zIndex: 1,
    marginLeft: 0,
  },
  squareButton: {
    width: 36,
    height: 36,
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  buttonLabel: {
    fontSize: 18,
    color: "#333",
  },
});
