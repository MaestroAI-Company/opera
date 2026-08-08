import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";
import { Image, ImageSourcePropType, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from "react-native";

interface TextInputFieldProps extends TextInputProps {
  icon?: ImageSourcePropType;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function TextInputField({ icon, style, containerStyle, ...props }: TextInputFieldProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {icon && <Image source={icon} style={styles.icon} />}
      <TextInput
        style={[styles.input, icon ? { paddingLeft: 10 } : undefined, style]}
        placeholderTextColor={Colors.textMuted}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
  },
  icon: {
    width: 18,
    height: 18,
    
  },
  input: {
    flex: 1,
    fontSize: FontSizes.bodyMd,
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    padding: 0,
  },
});
