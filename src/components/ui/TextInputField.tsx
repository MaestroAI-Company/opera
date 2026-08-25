import { FontSizes, Fonts, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { Image, ImageSourcePropType, Pressable, StyleProp, StyleSheet, TextInput, TextInputProps, ViewStyle } from "react-native";
import { useRef, useState } from "react";
import IconButton from "./IconButton";

interface TextInputFieldProps extends TextInputProps {
  icon?: ImageSourcePropType;
  containerStyle?: StyleProp<ViewStyle>;
  rightIcon?: ImageSourcePropType;
  onRightIconPress?: () => void;
}

export default function TextInputField({ icon, style, containerStyle, onFocus, onBlur, rightIcon, onRightIconPress, ...props }: TextInputFieldProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      style={({ hovered }) => [styles.container, (hovered || focused) && styles.containerActive, containerStyle]}
      onPress={() => inputRef.current?.focus()}
    >
      {icon && <Image source={icon} style={styles.icon} />}
      <TextInput
        ref={inputRef}
        style={[styles.input, style]}
        placeholderTextColor={Colors.textMuted}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        {...props}
      />
      {rightIcon && (
        <IconButton
          icon={rightIcon}
          onPress={onRightIconPress}
          size={22}
          tintColor={Colors.error}
          containerSize={32}
          pressedColor={Colors.surfacePressed}
          style={styles.rightIconButton}
        />
      )}
    </Pressable>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    paddingLeft: 12,
    paddingRight: 12,
    backgroundColor: Colors.surface,
  },
  containerActive: {
    backgroundColor: Colors.surfacePressed,
  },
  icon: {
    width: 18,
    height: 18,
    marginRight: 10,
    tintColor: Colors.textPrimary,
  },
  rightIconButton: {
    alignSelf: "center",
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.bodyMd,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    padding: 0,
  },
});
