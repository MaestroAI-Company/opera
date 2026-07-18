import { Image, Pressable, StyleSheet, Text, View } from "react-native";

// load theme icons
const autoIcon = require("../assets/icons/auto.png");
const lightIcon = require("../assets/icons/light.png");
const darkIcon = require("../assets/icons/dark.png");

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
              style={[
                styles.optionButton,
                isSelected && styles.optionButtonActive,
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
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    height: 44,
    paddingLeft: 12,
    paddingRight: 4,
    width: "100%",
  },
  icon: {
    width: 18,
    height: 18,
    tintColor: "#000",
    marginRight: 10,
    resizeMode: "contain",
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
    borderRadius: 5,
  },
  optionButtonActive: {
    backgroundColor: "#FF1A1A",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  optionText: {
    fontFamily: "IBMPlexMono-Medium",
    fontSize: 14,
    color: "#000",
  },
  optionTextActive: {
    color: "#fff",
  },
});
