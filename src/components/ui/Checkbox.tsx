import { Pressable, StyleProp, StyleSheet, Text, Vibration, View, ViewStyle } from "react-native";
import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { pressStyle } from "./pressStyle";

type CheckboxProps = {
  label?: string;
  checked: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
  labelFirst?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Checkbox({ label, checked, onToggle, disabled = false, labelFirst = false, style }: CheckboxProps) {
  const styles = useThemedStyles(makeStyles);
  const box = (
    <Pressable
      style={pressStyle(
        [styles.box, checked && styles.boxChecked, disabled && { opacity: 0.5 }],
        !disabled && (checked ? styles.boxCheckedActive : styles.boxActive)
      )}
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

  //row renders its own label
  if (!label) return box;

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
  boxActive: {
    backgroundColor: Colors.surfacePressed,
  },
  boxCheckedActive: {
    backgroundColor: Colors.primaryPressed,
  },
  label: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    flex: 1,
  },
});
