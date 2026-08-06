import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

// load theme icons
const autoIcon = require("../../../assets/icons/auto.png");
const lightIcon = require("../../../assets/icons/light.png");
const darkIcon = require("../../../assets/icons/dark.png");

type ThemeSelectorProps = {
  selectedValue: string;
  onSelect: (value: string) => void;
};

// theme selector component
export default function ThemeSelector({ selectedValue, onSelect }: ThemeSelectorProps) {
  const options = [
    { id: "system", label: "Auto" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];

  // get icon based on selected value
  const getSelectedIcon = () => {
    switch (selectedValue) {
      case "light":
        return lightIcon;
      case "dark":
        return darkIcon;
      case "system":
      default:
        return autoIcon;
    }
  };

  return (
    <View style={styles.container}>
      <Image source={getSelectedIcon()} style={styles.icon} />
      <View style={styles.optionsContainer}>
        {options.map((option) => {
          const isSelected = option.id === selectedValue;
          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              style={({ pressed, hovered }) => [
                styles.optionButton,
                isSelected && styles.optionButtonActive,
                (pressed || hovered) && (isSelected ? { backgroundColor: Colors.primaryPressed } : { backgroundColor: Colors.surfacePressed }),
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  isSelected && styles.optionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    height: 44,
    paddingLeft: 12,
    paddingRight: 4,
    width: "100%",
  },
  icon: {
    width: 18,
    height: 18,
    
    marginRight: 10,
    
  },
  optionsContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
    gap: 4,
  },
  optionButton: {
    flex: 1,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Radius.md,
  },
  optionButtonActive: {
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
  },
  optionText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyMd,
    color: Colors.textPrimary,
  },
  optionTextActive: {
    color: Colors.surface,
  },
});
