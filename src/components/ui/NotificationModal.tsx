import { Image, ImageSourcePropType, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import TextInputField from "./TextInputField";
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";

export type ModalButton = {
  text: string;
  onPress: () => void;
  style?: "primary" | "secondary" | "danger";
};

export type NotificationModalProps = {
  visible: boolean;
  title?: string;
  icon?: ImageSourcePropType;
  message?: string;

  //optional text input
  showInput?: boolean;
  inputValue?: string;
  onInputChange?: (text: string) => void;
  inputPlaceholder?: string;
  inputSecureTextEntry?: boolean;
  inputKeyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';

  //custom buttons (up to 3)
  buttons?: ModalButton[];

  onClose: () => void;
};

export default function NotificationModal({
  visible,
  title,
  icon,
  message,
  showInput,
  inputValue,
  onInputChange,
  inputPlaceholder,
  inputSecureTextEntry,
  inputKeyboardType,
  buttons,
  onClose,
}: NotificationModalProps) {

  //fallback to single close button if none provided
  const activeButtons = buttons && buttons.length > 0
    ? buttons.slice(0, 3)
    : [{ text: "OK", onPress: onClose, style: "primary" as const }];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>

          {(title || icon) && (
            <View style={styles.header}>
              {icon && <Image source={icon} style={styles.icon} tintColor={Colors.textSecondary} />}
              {title && <Text style={styles.title}>{title}</Text>}
            </View>
          )}

          {message && <Text style={styles.message}>{message}</Text>}

          {showInput && (
            <View style={styles.inputContainer}>
              <TextInputField
                value={inputValue || ""}
                onChangeText={onInputChange}
                placeholder={inputPlaceholder}
                secureTextEntry={inputSecureTextEntry}
                keyboardType={inputKeyboardType}
              />
            </View>
          )}

          <View style={styles.buttonContainer}>
            {activeButtons.map((btn, index) => {
              const isPrimary = btn.style === "primary" || !btn.style;
              const isDanger = btn.style === "danger";

              return (
                <Pressable
                  key={index}
                  style={({ pressed }) => [
                    styles.button,
                    isPrimary && styles.buttonPrimary,
                    isDanger && styles.buttonDanger,
                    !isPrimary && !isDanger && styles.buttonSecondary,
                    pressed && (
                      isPrimary
                        ? { backgroundColor: Colors.primaryPressed, borderColor: Colors.primaryPressed }
                        : isDanger
                          ? { backgroundColor: Colors.primaryPressed, borderColor: Colors.primaryPressed }
                          : { backgroundColor: Colors.surfacePressed }
                    )
                  ]}
                  onPress={btn.onPress}
                >
                  <Text style={[
                    styles.buttonText,
                    !isPrimary && !isDanger && styles.buttonTextSecondary
                  ]}>
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.scrimModal,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    boxShadow: `0px 4px 12px ${Colors.overlay}`,
    elevation: 8,
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
    fontWeight: "bold",
    color: Colors.textSecondary,
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
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: "transparent",
    minWidth: 80,
    alignItems: "center",
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
    color: Colors.surface,
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
  },
  buttonTextSecondary: {
    color: Colors.textSecondary,
  },
});
