import { Pressable, StyleSheet, Vibration, View } from "react-native";
import { Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import AppIcon, { IconSource } from "./AppIcon";
import { pressStyle } from "./pressStyle";
import dotIcon from "../../../assets/icons/dotcolor.svg";

export type IconSelectorOption = {
  id: string;
  icon?: IconSource;
  //dot icon tinted with this color instead of an icon
  color?: string;
};

type IconSelectorProps = {
  options: IconSelectorOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
};

//row of icon choices
export default function IconSelector({ options, selectedValue, onSelect }: IconSelectorProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.id === selectedValue;
        return (
          <Pressable
            key={option.id}
            onPress={() => {
              Vibration.vibrate(10);
              onSelect(option.id);
            }}
            style={pressStyle(
              [
                styles.option,
                selected && styles.optionSelected,
                //a color tile fills with its own color
                selected && !!option.color && { backgroundColor: option.color },
              ],
              option.color ? "fadeLight" : selected ? "primary" : "surface",
            )}
          >
            {(option.color || option.icon) && (
              <AppIcon
                source={option.color ? dotIcon : option.icon!}
                style={[
                  styles.icon,
                  selected && styles.iconSelected,
                  //unselected dot shows its own color
                  !!option.color && !selected && { tintColor: option.color },
                ]}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      gap: Spacing.md,
    },
    option: {
      flex: 1,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: Radius.xxl,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    optionSelected: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    icon: {
      width: 18,
      height: 18,
      resizeMode: "contain",
      tintColor: Colors.textPrimary,
    },
    iconSelected: {
      tintColor: Colors.textOnPrimary,
    },
  });
