import { useEffect, useRef } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { renderMarkdown } from "./MarkdownText";
import { Message } from "../src/services/db/DatabaseService";

type ChatViewProps = {
  messages: Message[];
};

export default function ChatView({ messages }: ChatViewProps) {
  const listRef = useRef<FlatList>(null);

  //scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [messages.length]);

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {isUser ? (
          <Text style={[styles.bubbleText, styles.userText]}>
            {item.content}
          </Text>
        ) : (
          <Text style={styles.aiText}>
            {renderMarkdown(item.content)}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#FF1A1A",
    borderRadius: 10,
    maxWidth: "80%",
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: "transparent",
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  userText: {
    color: "#fff",
  },
  aiText: {
    fontSize: 18,
    lineHeight: 26,
    color: "#000",
  },
});
