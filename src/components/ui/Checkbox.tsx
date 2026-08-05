import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";
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
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  boxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: Colors.surface,
    fontSize: FontSizes.caption,
    fontWeight: "bold",
    lineHeight: 16,
  },
  label: {
    fontSize: FontSizes.bodyMd,
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    flex: 1,
  },
});
