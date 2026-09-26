import { Image, ImageSourcePropType, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import Checkbox from "./Checkbox";
import Group from "./Group";
import ImageCard from "./ImageCard";
import TextInputField from "./TextInputField";
import { pressStyle } from "./pressStyle";

export type ModalButton = {
  text: string;
  onPress: () => void;
  style?: "primary" | "secondary" | "danger";
  disabled?: boolean;
};

export type ModalOption = {
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
};

export type NotificationModalProps = {
  visible: boolean;
  title?: string;
  icon?: ImageSourcePropType;
  image?: ImageSourcePropType;
  message?: string;
  messageAlign?: "left" | "center";

  //optional text input
  showInput?: boolean;
  inputValue?: string;
  onInputChange?: (text: string) => void;
  inputPlaceholder?: string;
  inputSecureTextEntry?: boolean;
  inputKeyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';

  buttons?: ModalButton[];
  options?: ModalOption[];

  onClose: () => void;
};

export default function NotificationModal({
  visible,
  title,
  icon,
  image,
  message,
  messageAlign = "left",
  showInput,
  inputValue,
  onInputChange,
  inputPlaceholder,
  inputSecureTextEntry,
  inputKeyboardType,
  buttons,
  options,
  onClose,
}: NotificationModalProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);

  //fallback to single close button if none provided
  const activeButtons = buttons && buttons.length > 0
    ? buttons.slice(0, 4)
    : [{ text: "OK", onPress: onClose, style: "primary" as const }];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* dialog recenters above the keyboard */}
      <KeyboardAvoidingView behavior="padding" style={styles.scrim}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.container} onPress={() => { }}>

            {image && (
              <View style={styles.imageContainer}>
                <ImageCard source={image} width="100%" />
              </View>
            )}

            {(title || icon) && (
              <View style={styles.header}>
                {icon && <Image source={icon} style={styles.icon} tintColor={Colors.textPrimary} />}
                {title && <Text style={styles.title}>{title}</Text>}
              </View>
            )}

            {message && <Text style={[styles.message, { textAlign: messageAlign }]}>{message}</Text>}

            {showInput && (
              <View style={styles.inputContainer}>
                <Group>
                  <TextInputField
                    value={inputValue || ""}
                    onChangeText={onInputChange}
                    placeholder={inputPlaceholder}
                    secureTextEntry={inputSecureTextEntry}
                    keyboardType={inputKeyboardType}
                  />
                </Group>
              </View>
            )}

            {options && options.length > 0 && (
              <View style={styles.optionsContainer}>
                {options.map((option, index) => (
                  <Checkbox
                    key={index}
                    label={option.label}
                    checked={option.checked}
                    onToggle={option.onToggle}
                    disabled={option.disabled}
                    labelFirst
                  />
                ))}
              </View>
            )}

            <View style={styles.buttonContainer}>
              {[...activeButtons]
                .sort((a, b) => {
                  const rank = (btn: ModalButton) => btn.style === "primary" || btn.style === "danger" ? 1 : 0;
                  return rank(a) - rank(b);
                })
                .map((btn, index) => {
                  const isPrimary = btn.style === "primary" || !btn.style;
                  const isDanger = btn.style === "danger";

                  return (
                    <Pressable
                      key={index}
                      style={pressStyle(
                        [
                          styles.button,
                          isPrimary && styles.buttonPrimary,
                          isDanger && styles.buttonDanger,
                          !isPrimary && !isDanger && styles.buttonSecondary,
                          btn.disabled && styles.buttonDisabled,
                        ],
                        !btn.disabled && (isPrimary || isDanger
                          ? { backgroundColor: Colors.primaryPressed, borderColor: Colors.primaryPressed }
                          : "surface")
                      )}
                      onPress={() => !btn.disabled && btn.onPress()}
                    >
                      <Text style={[
                        styles.buttonText,
                        !isPrimary && !isDanger && styles.buttonTextSecondary,
                        btn.disabled && styles.buttonTextDisabled
                      ]}>
                        {btn.text}
                      </Text>
                    </Pressable>
                  );
                })}
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: Colors.scrimModal,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.window,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    boxShadow: `0px 4px 12px ${Colors.overlay}`,
    elevation: 8,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  icon: {
    width: 24,
    height: 24,

  },
  title: {
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    textAlign: "center",
  },
  message: {
    fontSize: FontSizes.bodyMd,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 24,
  },
  optionsContainer: {
    marginBottom: 20,
    gap: 12,
  },
  buttonContainer: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: Spacing.lg,
  },
  button: {
    paddingVertical: Spacing.lg2,
    paddingHorizontal: Spacing.xxl,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: "transparent",
    minWidth: 80,
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: Colors.textMuted,
    borderColor: Colors.textMuted,
  },
  buttonPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
  buttonDanger: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
  buttonSecondary: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  buttonText: {
    color: Colors.textOnPrimary,
    fontSize: FontSizes.body,
    fontFamily: Fonts.mono,
  },
  buttonTextSecondary: {
    color: Colors.textSecondary,
  },
  buttonTextDisabled: {
    color: Colors.textMuted,
  },
});
