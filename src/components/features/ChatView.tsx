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
import { Conversation, Message } from "../../services/db/DatabaseService";
import { renderMarkdown, deriveChatDisplay } from "../ui/MarkdownText";
import { AIModule } from "../../services/ai/AIModule";
import { Settings } from "../../services/settings/SettingsService";
import { TTS } from "../../services/speech/TTSService";
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";

const butterflyImage = require("../../../assets/images/butterfly2.png");
const butterflyGreyImage = require("../../../assets/images/butterfly2_grey.png");
const thinkingGif = require("../../../assets/icons/thinking.gif");
const speakerIcon = require("../../../assets/icons/speaker.png");
const reloadIcon = require("../../../assets/icons/reload.png");
const copyIcon = require("../../../assets/icons/copy.png");
const infoIcon = require("../../../assets/icons/info.png");

type ChatViewProps = {
  messages: Message[];
  conversation: Conversation | null;
  contentTopPadding: number;
  contentBottomPadding: number;
  incognito?: boolean;
  onRegenerate?: (messageId: string) => void;
  speakerEnabled?: boolean;
  showMetrics?: boolean;
  generatingMessageId?: string | null;
  hideHeader?: boolean;
  hideGradients?: boolean;
  onOpenConfidentiality?: () => void;
  canThink?: boolean;
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

const MessageItem = React.memo(({ item, incognito, onRegenerate, speakerEnabled, onSpeak, isSpeaking, showSnackbar, isGenerating, isChatGenerating, showMetrics, fallbackModel, canThink }: { item: Message; incognito?: boolean; onRegenerate?: (id: string) => void; speakerEnabled?: boolean; onSpeak?: (item: Message) => void; isSpeaking?: boolean; showSnackbar: (msg: string) => void; isGenerating?: boolean; isChatGenerating?: boolean; showMetrics?: boolean; fallbackModel?: string; canThink?: boolean }) => {
  const isUser = item.role === "user";
  const [showDetails, setShowDetails] = useState(false);

  const [activeTool, setActiveTool] = useState<{name: string | null, args: any | null}>({ name: null, args: null });
  useEffect(() => {
    if (!isGenerating) return;
    const unsub = AIModule.SharedGenerationState.subscribe(() => {
      setActiveTool({ 
        name: AIModule.SharedGenerationState.activeToolName, 
        args: AIModule.SharedGenerationState.activeToolArgs 
      });
    });
    setActiveTool({ 
      name: AIModule.SharedGenerationState.activeToolName, 
      args: AIModule.SharedGenerationState.activeToolArgs 
    });
    return unsub;
  }, [isGenerating]);

  const disp = deriveChatDisplay(item.content, !!isGenerating, activeTool, !!canThink);
  const isCurrentlyThinking = !isUser && disp.showThinkingRow;

  const metricRows = [
    { label: "ai_model", value: item.metrics?.model || fallbackModel || "N/A" },
    { label: "time", value: item.metrics?.timeSec != null ? `${item.metrics.timeSec.toFixed(1)}s` : "N/A" },
    { label: "tokens", value: item.metrics?.tokens != null ? String(item.metrics.tokens) : "N/A" },
    { label: "tokens_per_sec", value: item.metrics?.tokensPerSec != null ? item.metrics.tokensPerSec.toFixed(1) : "N/A" },
  ];

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
                    <Image source={speakerIcon} style={{ width: 14, height: 14, tintColor: Colors.surface, marginRight: 6 }} />
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
            selectionColor={Colors.whiteDim}
          >
            {item.content}
          </Text>
        </View>
      ) : (
        <View style={styles.aiContainer}>
          {isCurrentlyThinking && (
            <View style={styles.thinkingContainer}>
              <Image
                source={thinkingGif}
                style={styles.thinkingIcon}
                resizeMode="contain"
              />
              {!!disp.currentThought && <FlashingText text={disp.currentThought} />}
            </View>
          )}
          {disp.showMarkdown && (
            renderMarkdown(disp.finalContent, incognito, isGenerating)
          )}
          {!isUser && !isCurrentlyThinking && !isGenerating && (
            <View style={styles.aiToolbar}>
              {speakerEnabled && (
                <Pressable
                  onPress={() => onSpeak?.(item)}
                  style={({ pressed }) => [styles.toolbarIconContainer, pressed && { backgroundColor: Colors.surfacePressed }]}
                >
                  <Image source={speakerIcon} style={{ width: 22, height: 22, tintColor: isSpeaking ? Colors.primary : Colors.textDisabled }} />
                </Pressable>
              )}
              <Pressable
                onPress={() => onRegenerate?.(item.id)}
                disabled={isChatGenerating}
                style={({ pressed }) => [
                  styles.toolbarIconContainer,
                  pressed && { backgroundColor: Colors.surfacePressed },
                  isChatGenerating && { opacity: 0.3 }
                ]}
              >
                <Image source={reloadIcon} style={{ width: 22, height: 22, tintColor: Colors.textDisabled }} />
              </Pressable>
              <Pressable
                onPress={() => copyToClipboard(item.content, false)}
                onLongPress={() => copyToClipboard(item.content, true)}
                delayLongPress={500}
                style={({ pressed }) => [styles.toolbarIconContainer, pressed && { backgroundColor: Colors.surfacePressed }]}
              >
                <Image source={copyIcon} style={{ width: 22, height: 22, tintColor: Colors.textDisabled }} />
              </Pressable>
              {showMetrics && (
                <Pressable
                  onPress={() => setShowDetails(prev => !prev)}
                  style={({ pressed }) => [styles.toolbarIconContainer, pressed && { backgroundColor: Colors.surfacePressed }]}
                >
                  <Image source={infoIcon} style={{ width: 22, height: 22, tintColor: showDetails ? (incognito ? Colors.incognito : Colors.primary) : Colors.textDisabled }} />
                </Pressable>
              )}
            </View>
          )}
          {showMetrics && showDetails && (
            <View style={styles.metricsCard}>
              {metricRows.map(row => (
                <View key={row.label} style={styles.metricsRow}>
                  <Text style={styles.metricsLabel}>{row.label}</Text>
                  <Text style={styles.metricsSeparator}> : </Text>
                  <Text style={[styles.metricsValue, incognito && { color: Colors.incognito }]}>{row.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}, (prev, next) => prev.item.content === next.item.content && prev.item.metrics === next.item.metrics && prev.incognito === next.incognito && prev.speakerEnabled === next.speakerEnabled && prev.isGenerating === next.isGenerating && prev.isChatGenerating === next.isChatGenerating && prev.isSpeaking === next.isSpeaking && prev.showMetrics === next.showMetrics && prev.canThink === next.canThink);
MessageItem.displayName = "MessageItem";

export default function ChatView({ messages, conversation, contentTopPadding, contentBottomPadding, incognito, onRegenerate, speakerEnabled, showMetrics, generatingMessageId, hideHeader, hideGradients, onOpenConfidentiality, canThink }: ChatViewProps) {
  const listRef = useRef<FlatList>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const isAtBottomRef = useRef(true);
  const initialScrollDone = useRef(false);

  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  //manual speaker button: tap toggles speech for that message
  const handleSpeak = (item: Message) => {
    if (speakingMessageId === item.id) {
      TTS.stop();
      setSpeakingMessageId(null);
    } else {
      setSpeakingMessageId(item.id);
      TTS.speak(item.content, {
        language: Settings.getCached().language,
        onDone: () => setSpeakingMessageId(cur => (cur === item.id ? null : cur)),
      });
    }
  };

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
    return <MessageItem item={item} incognito={incognito} onRegenerate={onRegenerate} speakerEnabled={speakerEnabled} onSpeak={handleSpeak} isSpeaking={speakingMessageId === item.id} showSnackbar={setSnackbarMessage} isGenerating={item.id === generatingMessageId} isChatGenerating={!!generatingMessageId} showMetrics={showMetrics} fallbackModel={conversation?.model} canThink={canThink} />;
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
            colors={[Colors.background, Colors.backgroundFade, Colors.backgroundClear]}
            style={styles.gradientTop}
            pointerEvents="none"
          />
          <LinearGradient
            colors={[Colors.backgroundClear, Colors.backgroundFade, Colors.background]}
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
    backgroundColor: Colors.primary,
    borderRadius: Radius.xxl,
    maxWidth: "80%",
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
  },
  userBubbleIncognito: {
    alignSelf: "flex-end",
    backgroundColor: Colors.incognito,
    borderRadius: Radius.xxl,
    maxWidth: "80%",
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
  },
  aiBubble: {
    alignSelf: "stretch",
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  bubbleText: {
    fontSize: FontSizes.body,
    lineHeight: 21,
    fontFamily: Fonts.body,
  },
  userText: {
    color: Colors.surface,
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
    fontSize: FontSizes.displayMd,
    color: Colors.textTertiary,
    textAlign: "center",
    letterSpacing: 0.5,
    marginBottom: 8,
    fontFamily: Fonts.display,
  },
  headerDate: {
    fontSize: FontSizes.bodyMd,
    color: Colors.textDisabled,
    fontFamily: Fonts.body,
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
    color: Colors.textBody,
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
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
    borderRadius: Radius.huge,
  },
  metricsCard: {
    marginTop: 4,
    gap: 3,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metricsLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    color: Colors.textFaint,
    minWidth: 110,
  },
  metricsSeparator: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    color: Colors.textFaint,
  },
  metricsValue: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    color: Colors.primary,
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
    backgroundColor: Colors.textTertiary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    boxShadow: `0px 2px 3.84px ${Colors.scrimDrawer}`,
    elevation: 5,
  },
  snackbarText: {
    color: Colors.surface,
    fontSize: FontSizes.bodyMd,
  },
  messageImage: {
    width: 120,
    height: 120,
    borderRadius: Radius.xl,
  },
  audioAttachmentBubble: {
    backgroundColor: Colors.whiteFaint,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.huge,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioAttachmentText: {
    color: 'white',
    fontSize: FontSizes.label,
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
    fontSize: FontSizes.bodyMd,
    color: Colors.textPlaceholder,
    textAlign: 'center',
    fontFamily: Fonts.body,
  },
  disclaimerLink: {
    color: Colors.primary,
    textDecorationLine: 'underline',
    fontFamily: Fonts.body,
  },
  disclaimerLinkIncognito: {
    color: Colors.incognito,
  },
});
