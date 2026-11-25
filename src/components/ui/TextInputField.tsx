import { FontSizes, Fonts, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { Pressable, StyleProp, StyleSheet, TextInput, TextInputProps, ViewStyle } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import AppIcon, { IconSource } from "./AppIcon";
import IconButton from "./IconButton";
import cancelIcon from "../../../assets/icons/cancel2.svg";
import searchIcon from "../../../assets/icons/search2.svg";
import visionIcon from "../../../assets/icons/visibility2.svg";
import visionOffIcon from "../../../assets/icons/visibility_off2.svg";

interface TextInputFieldProps extends TextInputProps {
  icon?: IconSource;
  containerStyle?: StyleProp<ViewStyle>;
  clearable?: boolean;
  revealable?: boolean;
  rightIcon?: IconSource;
  rightIconSize?: number;
  rightIconTint?: string;
  rightIconOpacity?: number;
  rightIconLabel?: string;
  onRightIconPress?: () => void;
  variant?: "default" | "large" | "password" | "search";
}

const RIGHT_CONTAINER_SIZE = 32;
const ACTION_ICON_SIZE = 18;
const ACTION_ICON_OPACITY = 0.6;
const BLUR_HIDE_DELAY_MS = 150;

export default function TextInputField({
  icon,
  style,
  containerStyle,
  onFocus,
  onBlur,
  value,
  onChangeText,
  clearable,
  revealable = true,
  rightIcon,
  rightIconSize = 22,
  rightIconTint,
  rightIconOpacity,
  rightIconLabel,
  onRightIconPress,
  variant = "default",
  multiline,
  textAlignVertical,
  secureTextEntry,
  autoCapitalize,
  autoCorrect,
  ...props
}: TextInputFieldProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showTrailing, setShowTrailing] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const isLarge = variant === "large";
  const isPassword = variant === "password" || Boolean(secureTextEntry);
  const isSearch = variant === "search";
  const leadingIcon = icon ?? (isSearch ? searchIcon : undefined);
  const showReveal = isPassword && revealable && !rightIcon;
  const showClear = (clearable ?? isSearch) && !isPassword && !rightIcon && typeof value === "string" && value.length > 0;
  const trailingKind = rightIcon ? "custom" : showReveal ? "reveal" : showClear ? "clear" : null;
  const trailing = trailingKind === "custom"
    ? {
        icon: rightIcon!,
        label: rightIconLabel ?? t("common.clear"),
        size: rightIconSize,
        tintColor: rightIconTint ?? Colors.error,
        opacity: rightIconOpacity,
      }
    : trailingKind === "reveal"
      ? {
          icon: revealed ? visionOffIcon : visionIcon,
          label: revealed ? t("common.hidePassword") : t("common.showPassword"),
          size: ACTION_ICON_SIZE,
          tintColor: rightIconTint ?? Colors.textPrimary,
          opacity: rightIconOpacity ?? ACTION_ICON_OPACITY,
        }
      : trailingKind === "clear"
        ? {
            icon: cancelIcon,
            label: rightIconLabel ?? t("common.clear"),
            size: ACTION_ICON_SIZE,
            tintColor: rightIconTint ?? Colors.textPrimary,
            opacity: rightIconOpacity ?? ACTION_ICON_OPACITY,
          }
        : null;
  //offset the 32px touch box so the icon edge matches the left icon padding
  const rightInsetOffset = (RIGHT_CONTAINER_SIZE - (trailing?.size ?? ACTION_ICON_SIZE)) / 2;
  const rightButtonStyle = [
    styles.rightIconButton,
    { marginLeft: 10 - rightInsetOffset, marginRight: -rightInsetOffset },
    isLarge && {
      alignSelf: "flex-start" as const,
      marginTop: -rightInsetOffset,
    },
  ];

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
      {leadingIcon && <AppIcon source={leadingIcon} style={styles.icon} />}
      <TextInput
        ref={inputRef}
        style={[styles.input, isLarge && styles.inputLarge, style]}
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline ?? isLarge}
        textAlignVertical={textAlignVertical ?? (isLarge ? "top" : undefined)}
        onFocus={(e) => {
          clearTimeout(hideTimer.current);
          setFocused(true);
          setShowTrailing(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          //let a press on the button land before it unmounts
          hideTimer.current = setTimeout(() => setShowTrailing(false), BLUR_HIDE_DELAY_MS);
          onBlur?.(e);
        }}
        secureTextEntry={isPassword && !revealed}
        autoCapitalize={autoCapitalize ?? (isPassword || isSearch ? "none" : undefined)}
        autoCorrect={autoCorrect ?? (isPassword || isSearch ? false : undefined)}
        {...props}
      />
      {trailing && showTrailing && (
        <IconButton
          icon={trailing.icon}
          label={trailing.label}
          onPress={
            trailingKind === "reveal"
              ? () => setRevealed((v) => !v)
              : trailingKind === "clear"
                ? () => {
                    inputRef.current?.clear();
                    onChangeText?.("");
                  }
                : onRightIconPress
          }
          size={trailing.size}
          tintColor={trailing.tintColor}
          iconOpacity={trailing.opacity}
          containerSize={RIGHT_CONTAINER_SIZE}
          pressedColor={Colors.overlaySubtle}
          style={rightButtonStyle}
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
  rightIconButton: {
    alignSelf: "center",
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
