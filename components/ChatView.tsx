import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Conversation, Message } from "../src/services/db/DatabaseService";
import { renderMarkdown } from "./MarkdownText";

const butterflyImage = require("../assets/images/butterfly2.png");
const butterflyGreyImage = require("../assets/images/butterfly2_grey.png");
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
  hideHeader?: boolean;
  hideGradients?: boolean;
  onOpenConfidentiality?: () => void;
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

const FlashingText = ({ text }: { text: string }) => {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true })
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.Text style={[styles.flashingText, { opacity }]} numberOfLines={2}>
      {text}
    </Animated.Text>
  );
};

const MessageItem = React.memo(({ item, incognito, onRegenerate, speakerEnabled, showSnackbar, isGenerating, isChatGenerating }: { item: Message; incognito?: boolean; onRegenerate?: (id: string) => void; speakerEnabled?: boolean; showSnackbar: (msg: string) => void; isGenerating?: boolean; isChatGenerating?: boolean }) => {
  const isUser = item.role === "user";

  const thinkMatch = item.content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
  const isThinkingFinished = item.content.includes("</think>");
  const hasThinkingText = thinkMatch !== null;
  const thinkingText = thinkMatch ? thinkMatch[1].trim() : "";

  const isCurrentlyThinking = !isUser && (item.content === "…" || (isGenerating && hasThinkingText && !isThinkingFinished));

  const extractSteps = (text: string) => {
    const stepRegex = /^\s*(?:(?:\d+[\.\)]|[-*])\s*)?\*\*(.*?)\*\*/gm;
    const steps = [];
    let match;
    while ((match = stepRegex.exec(text)) !== null) {
      let stepText = match[1].replace(/:$/, '').trim();
      steps.push(stepText);
    }

    if (steps.length > 0) {
      return `${steps.length}. ${steps[steps.length - 1]}`;
    } else {
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      return lines.length > 0 ? lines[lines.length - 1] : "Thinking...";
    }
  };

  const currentThought = extractSteps(thinkingText);

  const displayContent = item.content === "…" ? "…" : item.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
  const finalContent = displayContent.length > 0 ? displayContent : "…";

  const copyToClipboard = async (text: string, isMarkdown: boolean) => {
    const contentToCopy = isMarkdown ? text : stripMarkdown(text);
    await Clipboard.setStringAsync(contentToCopy);
    showSnackbar(isMarkdown ? "Markdown copied to clipboard" : "Copied to clipboard");
  };

  return (
    <View style={[styles.bubble, isUser ? (incognito ? styles.userBubbleIncognito : styles.userBubble) : styles.aiBubble]}>
      {isUser ? (
        <View>
          {item.images && item.images.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {item.images.map((uri, i) => {
                const isAudioPath = uri.toLowerCase().match(/\.(wav|mp3|m4a|aac|flac|ogg)(?:\?.*)?$/);
                const isAudioData = uri.startsWith('data:audio');
                const isAudio = isAudioPath || isAudioData;

                const getFilename = (path: string) => {
                  if (path.startsWith('data:')) return 'Audio Recording.wav';
                  if (path.includes('?name=')) {
                    try {
                      return decodeURIComponent(path.split('?name=')[1]);
                    } catch (e) {
                      // ignore
                    }
                  }
                  try {
                    return decodeURIComponent(path.split('/').pop() || 'Audio File');
                  } catch (e) {
                    return path.split('/').pop() || 'Audio File';
                  }
                };

                return isAudio ? (
                  <View key={i} style={styles.audioAttachmentBubble}>
                    <Image source={speakerIcon} style={{ width: 14, height: 14, tintColor: '#fff', marginRight: 6 }} />
                    <Text style={styles.audioAttachmentText} numberOfLines={1} ellipsizeMode="middle">{getFilename(uri)}</Text>
                  </View>
                ) : (
                  <Image key={i} source={{ uri }} style={styles.messageImage} />
                );
              })}
            </View>
          )}
          <Text
            style={[styles.bubbleText, styles.userText]}
            selectable={true}
            selectionColor="rgba(255, 255, 255, 0.4)"
          >
            {item.content}
          </Text>
        </View>
      ) : (
        <View style={styles.aiContainer}>
          {isCurrentlyThinking ? (
            <View style={styles.thinkingContainer}>
              <Image
                source={thinkingGif}
                style={styles.thinkingIcon}
                resizeMode="contain"
              />
              {hasThinkingText && (
                <FlashingText text={currentThought} />
              )}
            </View>
          ) : (
            renderMarkdown(finalContent, incognito)
          )}
          {!isUser && !isCurrentlyThinking && !isGenerating && (
            <View style={styles.aiToolbar}>
              {speakerEnabled && (
                <Pressable style={({ pressed }) => [styles.toolbarIconContainer, pressed && { backgroundColor: "#eaeaea" }]}>
                  <Image source={speakerIcon} style={{ width: 22, height: 22, tintColor: "#999" }} />
                </Pressable>
              )}
              <Pressable
                onPress={() => onRegenerate?.(item.id)}
                disabled={isChatGenerating}
                style={({ pressed }) => [
                  styles.toolbarIconContainer,
                  pressed && { backgroundColor: "#eaeaea" },
                  isChatGenerating && { opacity: 0.3 }
                ]}
              >
                <Image source={reloadIcon} style={{ width: 22, height: 22, tintColor: "#999" }} />
              </Pressable>
              <Pressable
                onPress={() => copyToClipboard(item.content, false)}
                onLongPress={() => copyToClipboard(item.content, true)}
                delayLongPress={500}
                style={({ pressed }) => [styles.toolbarIconContainer, pressed && { backgroundColor: "#eaeaea" }]}
              >
                <Image source={copyIcon} style={{ width: 22, height: 22, tintColor: "#999" }} />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}, (prev, next) => prev.item.content === next.item.content && prev.incognito === next.incognito && prev.speakerEnabled === next.speakerEnabled && prev.isGenerating === next.isGenerating && prev.isChatGenerating === next.isChatGenerating);
MessageItem.displayName = "MessageItem";

export default function ChatView({ messages, conversation, contentTopPadding, contentBottomPadding, incognito, onRegenerate, speakerEnabled, generatingMessageId, hideHeader, hideGradients, onOpenConfidentiality }: ChatViewProps) {
  const listRef = useRef<FlatList>(null);
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
  };

  const renderItem = ({ item }: { item: Message }) => {
    return <MessageItem item={item} incognito={incognito} onRegenerate={onRegenerate} speakerEnabled={speakerEnabled} showSnackbar={setSnackbarMessage} isGenerating={item.id === generatingMessageId} isChatGenerating={!!generatingMessageId} />;
  };

  return (
    <View style={styles.container}>
      <FlatList
        style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          !hideHeader && conversation ? (
            <View
              style={styles.headerBlock}
              onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
            >
              <Image
                source={incognito ? butterflyGreyImage : butterflyImage}
                style={styles.headerButterfly}
                resizeMode="contain"
              />
              <Text style={styles.headerTitle} numberOfLines={2}>
                {conversation.name}
              </Text>
              <Text style={styles.headerDate}>
                {formatDate(conversation.createdAt)}
              </Text>
              <View style={styles.disclaimerContainer}>
                <Text style={styles.disclaimerText}>
                  AI responses may be inaccurate. Verify important facts.{" "}
                </Text>
                <Pressable
                  onPress={() => onOpenConfidentiality?.()}
                  hitSlop={8}
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.disclaimerLink, incognito && styles.disclaimerLinkIncognito]}>
                    Confidentiality
                  </Text>
                </Pressable>
              </View>
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
      {!hideGradients && (
        <>
          <LinearGradient
            colors={["#FFF5EC", "rgba(255,245,236,0.9)", "rgba(255,245,236,0)"]}
            style={styles.gradientTop}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["rgba(255,245,236,0)", "rgba(255,245,236,0.9)", "#FFF5EC"]}
            style={styles.gradientBottom}
            pointerEvents="none"
          />
        </>
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
    paddingVertical: 8,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#FF1A1A",
    borderRadius: 10,
    maxWidth: "80%",
    borderWidth: 2,
    borderColor: "#ffffff52",
  },
  userBubbleIncognito: {
    alignSelf: "flex-end",
    backgroundColor: "#565A75",
    borderRadius: 10,
    maxWidth: "80%",
    borderWidth: 2,
    borderColor: "#ffffff52",
  },
  aiBubble: {
    alignSelf: "stretch",
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "Jakarta",
  },
  userText: {
    color: "#fff",
  },
  aiContainer: {
    gap: 2,
  },
  headerBlock: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerButterfly: {
    width: 100,
    height: 90,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    color: "#333",
    textAlign: "center",
    letterSpacing: 0.5,
    marginBottom: 8,
    fontFamily: "Petrona",
  },
  headerDate: {
    fontSize: 14,
    color: "#999",
    fontFamily: "Plusjakarta",
    marginBottom: 12,
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
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thinkingIcon: {
    width: 70,
  },
  flashingText: {
    color: "#666",
    fontSize: 14,
    fontFamily: "IBMPlexMono-Medium",
    flexShrink: 1,
  },
  aiToolbar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 16,
  },
  toolbarIconContainer: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
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
    boxShadow: "0px 2px 3.84px rgba(0, 0, 0, 0.25)",
    elevation: 5,
  },
  snackbarText: {
    color: '#fff',
    fontSize: 14,
  },
  messageImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  audioAttachmentBubble: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioAttachmentText: {
    color: 'white',
    fontSize: 12,
  },
  disclaimerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
    marginHorizontal: 16,
  },
  disclaimerText: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    fontFamily: 'Jakarta',
  },
  disclaimerLink: {
    color: '#FF1A1A',
    textDecorationLine: 'underline',
    fontFamily: 'Jakarta',
  },
  disclaimerLinkIncognito: {
    color: '#565A75',
  },
});
