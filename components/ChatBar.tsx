import { useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";

//icons
const nextWhiteIcon = require("../assets/icons/arrow.png");
const micIcon = require("../assets/icons/micrphone-white.png");
const addIcon = require("../assets/icons/add.png");

type ChatInputBarProps = {
  onSend?: (message: string) => void;
  onPlusPress?: () => void;
  placeholder?: string;
  incognito?: boolean;
};

export default function ChatBar({
  onSend,
  onPlusPress,
  placeholder = "Ask",
  incognito = false,
}: ChatInputBarProps) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (text.trim() && onSend) {
      onSend(text.trim());
      setText("");
    }
  };

  return (
    <View style={[styles.container, incognito && styles.containerIncognito]}>
      {/* + button */}
      <Pressable onPress={onPlusPress} style={styles.plusButton}>
        <Image source={addIcon} style={styles.plusIcon} />
      </Pressable>

      {/* mic button */}
      <Pressable style={styles.micButton}>
        <Image source={micIcon} style={styles.micIcon} />
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
    height: 56,
    shadowColor: "#FF1A1A",
    shadowOffset: { width: 2, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 6,
  },
  containerIncognito: {
    backgroundColor: "#747474",
    shadowColor: "#747474",
  },
  plusButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  micButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  micIcon: {
    width: 18,
    height: 18,
    tintColor: "#fff",
    resizeMode: "contain",
  },
  plusIcon: {
    width: 18,
    height: 18,
    tintColor: "#fff",
    resizeMode: "contain",
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    marginLeft: 8,
    paddingVertical: 0,
  },
  sendButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: {
    width: 18,
    height: 18,
    tintColor: "#fff",
  },
});
