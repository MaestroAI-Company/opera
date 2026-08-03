import { Pressable, StyleSheet, Text, View } from "react-native";

type CheckboxProps = {
  label: string;
  checked: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
};

export default function Checkbox({ label, checked, onToggle, disabled = false }: CheckboxProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && !disabled && { opacity: 0.7 },
        disabled && { opacity: 0.5 },
      ]}
      onPress={() => !disabled && onToggle(!checked)}
      disabled={disabled}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#00000017",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  boxChecked: {
    backgroundColor: "#FF1A1A",
    borderColor: "#FF1A1A",
  },
  checkmark: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
    lineHeight: 16,
  },
  label: {
    fontSize: 14,
    color: "#222",
    fontFamily: "monospace",
    flex: 1,
  },
});
