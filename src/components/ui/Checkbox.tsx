import { Pressable, StyleProp, StyleSheet, Text, Vibration, View, ViewStyle } from "react-native";
import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";

type CheckboxProps = {
  label: string;
  checked: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
  labelFirst?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Checkbox({ label, checked, onToggle, disabled = false, labelFirst = false, style }: CheckboxProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const box = (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.box,
        checked && styles.boxChecked,
        (pressed || hovered) && !disabled && { opacity: 0.7 },
        disabled && { opacity: 0.5 },
      ]}
      onPress={() => {
        if (!disabled) {
          Vibration.vibrate(10);
          onToggle(!checked);
        }
      }}
      disabled={disabled}
    >
      {checked}
    </Pressable>
  );

  return (
    <View style={[styles.container, style]}>
      {labelFirst ? (
        <>
          <Text style={styles.label}>{label}</Text>
          {box}
        </>
      ) : (
        <>
          {box}
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </View>
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
    borderColor: Colors.borderOnPrimary,
  },
  checkmark: {
    color: Colors.textOnPrimary,
    fontSize: FontSizes.caption,
    fontWeight: "bold",
    lineHeight: 16,
  },
  label: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    flex: 1,
  },
});
