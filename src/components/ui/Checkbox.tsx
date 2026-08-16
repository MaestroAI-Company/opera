import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { Pressable, StyleSheet, Text, View } from "react-native";

type CheckboxProps = {
  label: string;
  checked: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
  labelFirst?: boolean;
};

export default function Checkbox({ label, checked, onToggle, disabled = false, labelFirst = false }: CheckboxProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.container,
        (pressed || hovered) && !disabled && { opacity: 0.7 },
        disabled && { opacity: 0.5 },
      ]}
      onPress={() => !disabled && onToggle(!checked)}
      disabled={disabled}
    >
      {labelFirst ? (
        <>
          <Text style={styles.label}>{label}</Text>
          <View style={[styles.box, checked && styles.boxChecked]}>
            {checked}
          </View>
        </>
      ) : (
        <>
          <View style={[styles.box, checked && styles.boxChecked]}>
            {checked}
          </View>
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
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
    color: Colors.textOnPrimary,
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
