import { View, TextInput, Pressable, Image, StyleSheet } from "react-native";
import { useState } from "react";

//icons
const nextWhiteIcon = require("../assets/icons/next-white.png");

type ChatInputBarProps = {
  onSend?: (message: string) => void;
  onPlusPress?: () => void;
  placeholder?: string;
};

export default function ChatBar({
  onSend,
  onPlusPress,
  placeholder = "Ask",
}: ChatInputBarProps) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (text.trim() && onSend) {
      onSend(text.trim());
      setText("");
    }
  };

  return (
    <View style={styles.container}>
      {/* + button */}
      <Pressable onPress={onPlusPress} style={styles.plusButton}>
        <View style={styles.plusIcon}>
          <View style={styles.plusH} />
          <View style={styles.plusV} />
        </View>
      </Pressable>

      {/* text input */}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.6)"
        onSubmitEditing={handleSend}
        returnKeyType="send"
      />

      {/* send button */}
      <Pressable onPress={handleSend} style={styles.sendButton}>
        <Image source={nextWhiteIcon} style={styles.sendIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF1A1A",
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    height: 52,
  },
  plusButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  plusIcon: {
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  plusH: {
    position: "absolute",
    width: 16,
    height: 2,
    backgroundColor: "#fff",
    borderRadius: 1,
  },
  plusV: {
    position: "absolute",
    width: 2,
    height: 16,
    backgroundColor: "#fff",
    borderRadius: 1,
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    marginLeft: 8,
    paddingVertical: 0,
  },
  sendButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: {
    width: 20,
    height: 20,
    tintColor: "#fff",
  },
});
