import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { renderMarkdown } from "./MarkdownText";
import { Conversation, Message } from "../src/services/db/DatabaseService";

const butterflyImage = require("../assets/images/butterfly2.png");
const thinkingGif = require("../assets/icons/thinking.gif");
const speakerIcon = require("../assets/icons/speaker.png");
const reloadIcon = require("../assets/icons/reload.png");
const copyIcon = require("../assets/icons/copy.png");

type ChatViewProps = {
  messages: Message[];
  conversation: Conversation | null;
  contentTopPadding: number;
  contentBottomPadding: number;
  incognito?: boolean;
  onRegenerate?: (messageId: string) => void;
  speakerEnabled?: boolean;
  generatingMessageId?: string | null;
};

const stripMarkdown = (md: string) => {
  return md
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[#_*~`]/g, '')
    .replace(/^> /gm, '')
    .trim();
};

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));
}

const MessageItem = React.memo(({ item, incognito, onRegenerate, speakerEnabled, showSnackbar, isGenerating }: { item: Message; incognito?: boolean; onRegenerate?: (id: string) => void; speakerEnabled?: boolean; showSnackbar: (msg: string) => void; isGenerating?: boolean; }) => {
  const isUser = item.role === "user";
  const isThinking = !isUser && item.content === "…";

  const copyToClipboard = async (text: string, isMarkdown: boolean) => {
    const contentToCopy = isMarkdown ? text : stripMarkdown(text);
    await Clipboard.setStringAsync(contentToCopy);
    showSnackbar(isMarkdown ? "Markdown copied to clipboard" : "Copied to clipboard");
  };

  return (
    <View style={[styles.bubble, isUser ? (incognito ? styles.userBubbleIncognito : styles.userBubble) : styles.aiBubble]}>
      {isUser ? (
        <Text 
          style={[styles.bubbleText, styles.userText]}
          selectable={true}
          selectionColor="rgba(255, 255, 255, 0.4)"
        >
          {item.content}
        </Text>
      ) : (
        <View style={styles.aiContainer}>
          {isThinking ? (
            <Image
              source={thinkingGif}
              style={styles.thinkingIcon}
              resizeMode="contain"
            />
          ) : (
            renderMarkdown(item.content, incognito)
          )}
          {!isUser && !isThinking && !isGenerating && (
            <View style={styles.aiToolbar}>
              {speakerEnabled && (
                <Pressable style={styles.toolbarIconContainer}>
                  <Image source={speakerIcon} style={{ width: 22, height: 22, tintColor: "#999" }} />
                </Pressable>
              )}
              <Pressable onPress={() => onRegenerate?.(item.id)} style={styles.toolbarIconContainer}>
                <Image source={reloadIcon} style={{ width: 22, height: 22, tintColor: "#999" }} />
              </Pressable>
              <Pressable 
                onPress={() => copyToClipboard(item.content, false)} 
                onLongPress={() => copyToClipboard(item.content, true)}
                delayLongPress={500}
                style={styles.toolbarIconContainer}
              >
                <Image source={copyIcon} style={{ width: 22, height: 22, tintColor: "#999" }} />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}, (prev, next) => prev.item.content === next.item.content && prev.incognito === next.incognito && prev.speakerEnabled === next.speakerEnabled && prev.isGenerating === next.isGenerating);
MessageItem.displayName = "MessageItem";

export default function ChatView({ messages, conversation, contentTopPadding, contentBottomPadding, incognito, onRegenerate, speakerEnabled, generatingMessageId }: ChatViewProps) {
  const listRef = useRef<FlatList>(null);
  const [showTopGradient, setShowTopGradient] = useState(false);
  const [showBottomGradient, setShowBottomGradient] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const isAtBottomRef = useRef(true);
  const initialScrollDone = useRef(false);
  
  const [snackbarMessage, setSnackbarMessage] = useState("");
  useEffect(() => {
    if (snackbarMessage) {
      const timer = setTimeout(() => setSnackbarMessage(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [snackbarMessage]);

  //scroll past header on first load
  useEffect(() => {
    if (!initialScrollDone.current && messages.length > 0 && headerHeight > 0) {
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: headerHeight, animated: false });
        initialScrollDone.current = true;
      }, 50);
    }
  }, [messages.length, headerHeight]);

  const isAutoScrolling = useRef(false);
  const autoScrollTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atTop = contentOffset.y <= headerHeight + 10;
    //threshold for bottom detection
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 100;
    
    if (!isAutoScrolling.current) {
      isAtBottomRef.current = atBottom;
    }
    setShowTopGradient(!atTop);
    setShowBottomGradient(!atBottom);
  };

  const renderItem = ({ item }: { item: Message }) => {
    return <MessageItem item={item} incognito={incognito} onRegenerate={onRegenerate} speakerEnabled={speakerEnabled} showSnackbar={setSnackbarMessage} isGenerating={item.id === generatingMessageId} />;
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
        onScrollBeginDrag={() => {
          isAutoScrolling.current = false;
          if (autoScrollTimeout.current) clearTimeout(autoScrollTimeout.current);
        }}
        onContentSizeChange={(w, h) => {
          if (isAtBottomRef.current) {
            isAutoScrolling.current = true;
            if (autoScrollTimeout.current) clearTimeout(autoScrollTimeout.current);
            autoScrollTimeout.current = setTimeout(() => {
              isAutoScrolling.current = false;
            }, 500);
            
            //scrollToOffset to avoid android jump
            listRef.current?.scrollToOffset({ offset: h + 1000, animated: true });
          }
        }}
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
      {!!snackbarMessage && (
        <View style={styles.snackbarContainer} pointerEvents="none">
          <View style={styles.snackbar}>
            <Text style={styles.snackbarText}>{snackbarMessage}</Text>
          </View>
        </View>
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
  userBubbleIncognito: {
    alignSelf: "flex-end",
    backgroundColor: "#565A75",
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
  thinkingIcon: {
    width: 70,
    marginTop: 4,
  },
  aiToolbar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 16,
  },
  toolbarIconContainer: {
    padding: 4,
  },
  snackbarContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  snackbar: {
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  snackbarText: {
    color: '#fff',
    fontSize: 14,
  }
});
