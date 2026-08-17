import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { Image, ImageSourcePropType, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from "react-native";

interface TextInputFieldProps extends TextInputProps {
  icon?: ImageSourcePropType;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function TextInputField({ icon, style, containerStyle, ...props }: TextInputFieldProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.container, containerStyle]}>
      {icon && <Image source={icon} style={styles.icon} />}
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={Colors.textMuted}
        {...props}
      />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    height: 44,
    paddingLeft: 12,
    paddingRight: 12,
    backgroundColor: Colors.surface,
  },
  icon: {
    width: 18,
    height: 18,
    marginRight: 10,
    tintColor: Colors.textPrimary,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.bodyMd,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    padding: 0,
  },
});
