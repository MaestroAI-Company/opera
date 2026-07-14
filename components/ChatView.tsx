import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { renderMarkdown } from "./MarkdownText";
import { Conversation, Message } from "../src/services/db/DatabaseService";

const butterflyImage = require("../assets/images/butterfly2.png");

type ChatViewProps = {
  messages: Message[];
  conversation: Conversation | null;
  contentTopPadding: number;
  contentBottomPadding: number;
};

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));
}

export default function ChatView({ messages, conversation, contentTopPadding, contentBottomPadding }: ChatViewProps) {
  const listRef = useRef<FlatList>(null);
  const [showTopGradient, setShowTopGradient] = useState(false);
  const [showBottomGradient, setShowBottomGradient] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  //scroll past the header so first message is at the top
  useEffect(() => {
    if (messages.length > 0 && headerHeight > 0) {
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: headerHeight, animated: false });
      }, 50);
    }
  }, [messages.length, headerHeight]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atTop = contentOffset.y <= headerHeight + 10;
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 10;
    setShowTopGradient(!atTop);
    setShowBottomGradient(!atBottom);
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {isUser ? (
          <Text style={[styles.bubbleText, styles.userText]}>
            {item.content}
          </Text>
        ) : (
          <View style={styles.aiContainer}>
            {renderMarkdown(item.content)}
          </View>
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
        ListHeaderComponent={
          conversation ? (
            <View
              style={styles.conversationHeader}
              onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
            >
              <Image
                source={butterflyImage}
                style={styles.headerButterfly}
                resizeMode="contain"
              />
              <Text style={styles.headerTitle} numberOfLines={2}>
                {conversation.name}
              </Text>
              <Text style={styles.headerDate}>
                {formatDate(conversation.createdAt)}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={[styles.list, { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />
      {showTopGradient && (
        <LinearGradient
          colors={["#FFF5EC", "rgba(255,245,236,0.9)", "rgba(255,245,236,0)"]}
          style={styles.gradientTop}
          pointerEvents="none"
        />
      )}
      {showBottomGradient && (
        <LinearGradient
          colors={["rgba(255,245,236,0)", "rgba(255,245,236,0.9)", "#FFF5EC"]}
          style={styles.gradientBottom}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
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
  aiContainer: {
    gap: 2,
  },
  conversationHeader: {
    alignItems: "center",
    paddingVertical: 20,
    marginBottom: 10,
  },
  headerButterfly: {
    width: 100,
    height: 90,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "300",
    color: "#333",
    textAlign: "center",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  headerDate: {
    fontSize: 13,
    color: "#999",
    fontFamily: "monospace",
  },
  gradientTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  gradientBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
});
