import { Image, ImageSourcePropType, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import TextInputField from "./TextInputField";

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
              {icon && <Image source={icon} style={styles.icon} tintColor="#222" />}
              {title && <Text style={styles.title}>{title}</Text>}
            </View>
          )}

          {message && <Text style={styles.message}>{message}</Text>}

          {showInput && (
            <View style={styles.inputContainer}>
              <TextInputField
                value={inputValue}
                onChangeText={onInputChange}
                placeholder={inputPlaceholder}
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
                        ? { backgroundColor: "#D61515", borderColor: "#D61515" }
                        : isDanger
                          ? { backgroundColor: "#d60e0e", borderColor: "#d60e0e" }
                          : { backgroundColor: "#eaeaea" }
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
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    padding: 24,
    width: "100%",
    maxWidth: 400,
    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
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
    fontSize: 18,
    fontWeight: "bold",
    color: "#222",
    fontFamily: "IBMPlexMono-Medium",
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: "#555",
    fontFamily: "Jakarta",
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
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "transparent",
    minWidth: 80,
    alignItems: "center",
  },
  buttonPrimary: {
    backgroundColor: "#FF1A1A",
    borderColor: "#ffffff52",
  },
  buttonDanger: {
    backgroundColor: "#FF1A1A",
    borderColor: "#ffffff52",
  },
  buttonSecondary: {
    backgroundColor: "#fff",
    borderColor: "#00000017",
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "IBMPlexMono-Medium",
  },
  buttonTextSecondary: {
    color: "#222",
  },
});
