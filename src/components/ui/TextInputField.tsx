import { FontSizes, Fonts, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { Pressable, StyleProp, StyleSheet, TextInput, TextInputProps, ViewStyle } from "react-native";
import { useRef, useState } from "react";
import { useT } from "../../i18n";
import AppIcon, { IconSource } from "./AppIcon";
import IconButton from "./IconButton";
import visionIcon from "../../../assets/icons/vision2.svg";
import visionOffIcon from "../../../assets/icons/vision_off2.svg";

interface TextInputFieldProps extends TextInputProps {
  icon?: IconSource;
  containerStyle?: StyleProp<ViewStyle>;
  rightIcon?: IconSource;
  rightIconTint?: string;
  rightIconLabel?: string;
  onRightIconPress?: () => void;
  variant?: "default" | "large";
}

export default function TextInputField({
  icon,
  style,
  containerStyle,
  onFocus,
  onBlur,
  rightIcon,
  rightIconTint,
  rightIconLabel,
  onRightIconPress,
  variant = "default",
  multiline,
  textAlignVertical,
  secureTextEntry,
  ...props
}: TextInputFieldProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isLarge = variant === "large";

  return (
    <Pressable
      style={({ hovered }) => [
        styles.container,
        isLarge && styles.containerLarge,
        (hovered || focused) && styles.containerActive,
        containerStyle,
      ]}
      onPress={() => inputRef.current?.focus()}
      //skip wrapper on web tab navigation
      tabIndex={-1}
    >
      {icon && <AppIcon source={icon} style={[styles.icon, isLarge && styles.iconLarge]} />}
      <TextInput
        ref={inputRef}
        style={[styles.input, isLarge && styles.inputLarge, style]}
        placeholderTextColor={Colors.textMuted}
        multiline={multiline ?? isLarge}
        textAlignVertical={textAlignVertical ?? (isLarge ? "top" : undefined)}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        secureTextEntry={secureTextEntry && !revealed}
        {...props}
      />
      {secureTextEntry ? (
        <IconButton
          icon={revealed ? visionOffIcon : visionIcon}
          label={revealed ? t("common.hidePassword") : t("common.showPassword")}
          onPress={() => setRevealed((v) => !v)}
          size={22}
          tintColor={Colors.textPrimary}
          containerSize={32}
          pressedColor={Colors.surfacePressed}
          style={styles.rightIconButton}
        />
      ) : rightIcon && (
        <IconButton
          icon={rightIcon}
          label={rightIconLabel ?? t("common.clear")}
          onPress={onRightIconPress}
          size={22}
          tintColor={rightIconTint ?? Colors.error}
          containerSize={32}
          pressedColor={Colors.surfacePressed}
          style={[styles.rightIconButton, isLarge && styles.rightIconButtonLarge]}
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
    paddingLeft: Spacing.lg2,
    paddingRight: Spacing.lg2,
    backgroundColor: Colors.surface,
  },
  containerLarge: {
    height: 132,
    alignItems: "flex-start",
    paddingVertical: Spacing.lg2,
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
  iconLarge: {
    marginTop: Spacing.xs2,
  },
  rightIconButton: {
    alignSelf: "center",
    marginLeft: 10,
  },
  rightIconButtonLarge: {
    alignSelf: "flex-start",
  },
  input: {
    flex: 1,
    fontSize: FontSizes.bodyMd,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    padding: 0,
  },
  inputLarge: {
    alignSelf: "stretch",
  },
});
