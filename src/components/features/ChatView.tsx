import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Fonts, FontSizes, Radius, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { AIModule } from "../../services/ai/AIModule";
import { Suggestion } from "../../services/ai/generation/suggestions";
import { Conversation, Message, MessageSource } from "../../services/db/DatabaseService";
import { splitDocumentBlocks } from "../../services/documents/DocumentService";
import { Settings } from "../../services/settings/SettingsService";
import { TTS } from "../../services/speech/TTSService";
import IconButton from "../ui/IconButton";
import { deriveChatDisplay, renderMarkdown } from "../ui/MarkdownText";
import SuggestionBar from "../ui/SuggestionBar";
import SuggestionPill from "../ui/SuggestionPill";
import ThinkingIcon from "../ui/ThinkingIcon";

const butterflyImage = require("../../../assets/images/butterfly5.png");
const butterflyGreyImage = require("../../../assets/images/butterfly2_grey.png");
const speakerIcon = require("../../../assets/icons/speaker.png");
const reloadIcon = require("../../../assets/icons/reload.png");
const copyIcon = require("../../../assets/icons/copy.png");
const infoIcon = require("../../../assets/icons/info.png");
const chatIcon = require("../../../assets/icons/chat.png");
const appSourceIcon = require("../../../assets/icons/tool.png");
const imageSourceIcon = require("../../../assets/icons/photo.png");
const linkSourceIcon = require("../../../assets/icons/hyperlink.png");
const arrowIcon = require("../../../assets/icons/arrow.png");

//last title segment after separator
function sourceLabel(source: MessageSource): string {
  if (source.title) {
    const parts = source.title.split(/\s[-–|]\s/);
    if (parts.length > 1) return parts[parts.length - 1].trim();
    return source.title.trim();
  }
  try {
    return new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    return source.url;
  }
}

type SourceKind = 'app' | 'url' | 'image';
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico)(\?.*)?$/i;

//kind from scheme or image extension
function getSourceKind(url: string): SourceKind {
  if (!/^https?:\/\//i.test(url)) return 'app';
  try {
    if (IMAGE_EXT_RE.test(new URL(url).pathname)) return 'image';
  } catch { }
  return 'url';
}

const SourcePill = ({ source }: { source: MessageSource }) => {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  //disable open when url unhandled
  const [canOpen, setCanOpen] = useState(true);
  useEffect(() => {
    let cancelled = false;
    Linking.canOpenURL(source.url)
      .then((ok) => { if (!cancelled) setCanOpen(ok); })
      .catch(() => { if (!cancelled) setCanOpen(false); });
    return () => { cancelled = true; };
  }, [source.url]);

  //failed favicon falls back to generic
  const [faviconFailed, setFaviconFailed] = useState(false);
  useEffect(() => { setFaviconFailed(false); }, [source.favicon]);

  const kind = useMemo(() => getSourceKind(source.url), [source.url]);
  const useFavicon = kind === 'url' && !!source.favicon && !faviconFailed;
  const icon = kind === 'image' ? imageSourceIcon : kind === 'app' ? appSourceIcon : (useFavicon ? { uri: source.favicon } : linkSourceIcon);

  return (
    <Pressable
      onPress={() => { if (canOpen) Linking.openURL(source.url).catch(() => { }); }}
      disabled={!canOpen}
      style={({ pressed, hovered }) => [styles.sourcePill, canOpen && (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
    >
      <Text style={styles.sourceLabel} numberOfLines={1}>{sourceLabel(source)}</Text>
      <Image
        source={icon}
        style={[styles.sourceFavicon, !useFavicon && { tintColor: Colors.textMuted }]}
        onError={() => setFaviconFailed(true)}
      />
    </Pressable>
  );
};

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
  dark?: boolean;
  alignBottom?: boolean;
  onOpenInApp?: (item: Message) => void;
  //shown under the last assistant message only
  suggestions?: Suggestion[];
  onSuggestionPress?: (text: string) => void;
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
  const styles = useThemedStyles(makeStyles);
  const opacity = useAnimatedValue(0.4);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true })
      ])
    );
    loop.start();
    //interval kept running after unmount
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.Text style={[styles.flashingText, { opacity }]} numberOfLines={2}>
      {text}
    </Animated.Text>
  );
};

const MessageItem = React.memo(({ item, incognito, onRegenerate, speakerEnabled, onSpeak, isSpeaking, showSnackbar, isGenerating, isChatGenerating, showMetrics, fallbackModel, canThink, dark, onOpenInApp, suggestions, onSuggestionPress }: { item: Message; incognito?: boolean; onRegenerate?: (id: string) => void; speakerEnabled?: boolean; onSpeak?: (item: Message) => void; isSpeaking?: boolean; showSnackbar: (msg: string) => void; isGenerating?: boolean; isChatGenerating?: boolean; showMetrics?: boolean; fallbackModel?: string; canThink?: boolean; dark?: boolean; onOpenInApp?: (item: Message) => void; suggestions?: Suggestion[]; onSuggestionPress?: (text: string) => void }) => {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const isUser = item.role === "user";
  const [showDetails, setShowDetails] = useState(false);

  const [activeTool, setActiveTool] = useState<{ name: string | null, args: any | null }>({ name: null, args: null });
  useEffect(() => {
    if (!isGenerating) return;
    const unsub = AIModule.SharedGenerationState.subscribe(() => {
      setActiveTool({
        name: AIModule.SharedGenerationState.activeToolName,
        args: AIModule.SharedGenerationState.activeToolArgs
      });
    });
    //catch up with the store missed before subscribing
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTool({
      name: AIModule.SharedGenerationState.activeToolName,
      args: AIModule.SharedGenerationState.activeToolArgs
    });
    return unsub;
  }, [isGenerating]);

  //documents live in the message text
  const visibleContent = useMemo(
    () => (isUser ? splitDocumentBlocks(item.content).text : item.content),
    [isUser, item.content]
  );

  //reparse only when deps move
  const disp = useMemo(
    () => deriveChatDisplay(item.content, !!isGenerating, activeTool, !!canThink),
    [item.content, isGenerating, activeTool, canThink]
  );
  const isCurrentlyThinking = !isUser && disp.showThinkingRow;

  //reparse keyed on text and theme colors
  const markdownNodes = useMemo(
    () => (disp.showMarkdown ? renderMarkdown(disp.finalContent, incognito, isGenerating, dark) : null),
    [disp.showMarkdown, disp.finalContent, incognito, isGenerating, dark, Colors]
  );

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
          {item.screenContext && item.screenContext.icon && (
            <View style={styles.screenContextChip}>
              <Image source={{ uri: item.screenContext.icon }} style={styles.screenContextIcon} />
              {!!item.screenContext.label && (
                <Text style={styles.screenContextLabel} numberOfLines={1}>{item.screenContext.label}</Text>
              )}
            </View>
          )}
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
                    } catch {
                      return 'Audio Recording.wav';
                    }
                  }
                  try {
                    return decodeURIComponent(path.split('/').pop() || 'Audio File');
                  } catch {
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
          {!!visibleContent && (
            <Text
              style={[styles.bubbleText, styles.userText]}
              selectable={true}
              selectionColor={Colors.whiteDim}
            >
              {visibleContent}
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.aiContainer}>
          {isCurrentlyThinking && (
            <View style={styles.thinkingContainer}>
              <ThinkingIcon />
              {!!disp.currentThought && <FlashingText text={disp.currentThought} />}
            </View>
          )}
          {markdownNodes}
          {!isCurrentlyThinking && !!item.sources && item.sources.length > 0 && (
            <View style={styles.sourcesRow}>
              {item.sources.map((source) => (
                <SourcePill key={source.url} source={source} />
              ))}
            </View>
          )}
          {!isUser && !isCurrentlyThinking && !isGenerating && (
            <View style={styles.aiToolbar}>
              {speakerEnabled && (
                <IconButton
                  icon={speakerIcon}
                  onPress={() => onSpeak?.(item)}
                  containerSize={32}
                  pressedColor={Colors.surfacePressed}
                  tintColor={isSpeaking ? Colors.primary : (dark ? Colors.surface : Colors.textMuted)}
                />
              )}
              <IconButton
                icon={reloadIcon}
                onPress={() => onRegenerate?.(item.id)}
                disabled={isChatGenerating}
                containerSize={32}
                pressedColor={Colors.surfacePressed}
                tintColor={dark ? Colors.surface : Colors.textMuted}
              />
              <IconButton
                icon={copyIcon}
                onPress={() => copyToClipboard(item.content, false)}
                onLongPress={() => copyToClipboard(item.content, true)}
                delayLongPress={500}
                containerSize={32}
                pressedColor={Colors.surfacePressed}
                tintColor={dark ? Colors.surface : Colors.textMuted}
              />
              {!!onOpenInApp && (
                <IconButton
                  icon={chatIcon}
                  onPress={() => onOpenInApp(item)}
                  containerSize={32}
                  pressedColor={Colors.surfacePressed}
                  tintColor={dark ? Colors.surface : Colors.textMuted}
                />
              )}
              {showMetrics && (
                <IconButton
                  icon={infoIcon}
                  onPress={() => setShowDetails(prev => !prev)}
                  containerSize={32}
                  pressedColor={Colors.surfacePressed}
                  tintColor={showDetails ? (incognito ? Colors.incognito : Colors.primary) : (dark ? Colors.surface : Colors.textMuted)}
                />
              )}
            </View>
          )}
          {!isCurrentlyThinking && !isGenerating && !isChatGenerating && !!suggestions && suggestions.length > 0 && (
            <SuggestionBar align="right">
              {suggestions.map((suggestion) => (
                <SuggestionPill
                  key={suggestion.message}
                  icon={arrowIcon}
                  label={suggestion.label}
                  onPress={() => onSuggestionPress?.(suggestion.message)}
                />
              ))}
            </SuggestionBar>
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
}, (prev, next) =>
  //key avoids stale recycled rows
  prev.item.id === next.item.id &&
  prev.item.content === next.item.content &&
  prev.item.metrics === next.item.metrics &&
  prev.item.images === next.item.images &&
  prev.item.screenContext === next.item.screenContext &&
  prev.incognito === next.incognito &&
  prev.speakerEnabled === next.speakerEnabled &&
  prev.isGenerating === next.isGenerating &&
  prev.isChatGenerating === next.isChatGenerating &&
  prev.isSpeaking === next.isSpeaking &&
  prev.showMetrics === next.showMetrics &&
  prev.canThink === next.canThink &&
  prev.dark === next.dark &&
  prev.suggestions === next.suggestions &&
  //stable callbacks avoid stale closures
  prev.onSpeak === next.onSpeak &&
  prev.onRegenerate === next.onRegenerate &&
  prev.showSnackbar === next.showSnackbar &&
  prev.onOpenInApp === next.onOpenInApp &&
  prev.onSuggestionPress === next.onSuggestionPress);
MessageItem.displayName = "MessageItem";

export default function ChatView({ messages, conversation, contentTopPadding, contentBottomPadding, incognito, onRegenerate, speakerEnabled, showMetrics, generatingMessageId, hideHeader, hideGradients, onOpenConfidentiality, canThink, dark, alignBottom, onOpenInApp, suggestions, onSuggestionPress }: ChatViewProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const listRef = useRef<FlatList>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const isAtBottomRef = useRef(true);
  const initialScrollDone = useRef(false);

  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  //mirrors TTS state so the speaker icon reacts to auto-play too, not just manual taps
  useEffect(() => {
    const unsub = TTS.subscribe(() => setSpeakingMessageId(TTS.getSpeakingId()));
    return unsub;
  }, []);

  //manual speaker toggle
  const handleSpeak = useCallback((item: Message) => {
    if (TTS.getSpeakingId() === item.id) {
      TTS.stop();
      return;
    }
    TTS.speak(item.content, {
      language: Settings.getCached().language,
      id: item.id,
    });
  }, []);

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
    //threshold for bottom detection
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 100;

    if (!isAutoScrolling.current) {
      isAtBottomRef.current = atBottom;
    }
  };

  //suggestions belong to the newest assistant message
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const renderItem = useCallback(({ item }: { item: Message }) => {
    return <MessageItem item={item} incognito={incognito} onRegenerate={onRegenerate} speakerEnabled={speakerEnabled} onSpeak={handleSpeak} isSpeaking={speakingMessageId === item.id} showSnackbar={setSnackbarMessage} isGenerating={item.id === generatingMessageId} isChatGenerating={!!generatingMessageId} showMetrics={showMetrics} fallbackModel={conversation?.model} canThink={canThink} dark={dark} onOpenInApp={onOpenInApp} suggestions={item.id === lastAssistantId ? suggestions : undefined} onSuggestionPress={onSuggestionPress} />;
  }, [incognito, onRegenerate, speakerEnabled, handleSpeak, speakingMessageId, generatingMessageId, showMetrics, conversation?.model, canThink, dark, onOpenInApp, lastAssistantId, suggestions, onSuggestionPress]);

  return (
    <View style={styles.container}>
      <FlatList
        style={{ flex: 1, width: '100%' }}
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        nestedScrollEnabled={true}
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
                  style={({ pressed, hovered }) => [(pressed || hovered) && { opacity: 0.6 }]}
                >
                  <Text style={[styles.disclaimerLink, incognito && styles.disclaimerLinkIncognito]}>
                    Confidentiality
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null
        }
        contentContainerStyle={[styles.list, { width: '100%', maxWidth: 840, alignSelf: 'center', paddingTop: contentTopPadding, paddingBottom: contentBottomPadding, flexGrow: 1, justifyContent: alignBottom ? 'flex-end' : 'flex-start' }]}
        showsVerticalScrollIndicator={false}
        //keep live rows small
        windowSize={7}
        maxToRenderPerBatch={5}
        initialNumToRender={8}
        removeClippedSubviews={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          isAutoScrolling.current = false;
          if (autoScrollTimeout.current) clearTimeout(autoScrollTimeout.current);
        }}
        onContentSizeChange={(w, h) => {
          if (!isAtBottomRef.current) return;
          isAutoScrolling.current = true;
          if (autoScrollTimeout.current) clearTimeout(autoScrollTimeout.current);
          autoScrollTimeout.current = setTimeout(() => {
            isAutoScrolling.current = false;
          }, 500);
          listRef.current?.scrollToOffset({ offset: h + 1000, animated: true });
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

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
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
    fontSize: FontSizes.lg,
    lineHeight: 25,
    fontFamily: Fonts.body,
  },
  userText: {
    color: Colors.textOnPrimary,
  },
  aiContainer: {
    gap: 2,
  },
  headerBlock: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 32,
  },
  headerButterfly: {
    width: 100,
    height: 90,
    marginBottom: 22,
  },
  headerTitle: {
    fontSize: FontSizes.displayMd,
    color: Colors.textSecondary,
    textAlign: "center",
    letterSpacing: 0.5,
    marginBottom: 16,
    fontFamily: Fonts.display,
  },
  headerDate: {
    fontSize: FontSizes.bodyMd,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    marginBottom: 20,
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
  flashingText: {
    color: Colors.textSecondary,
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
    color: Colors.textMuted,
    minWidth: 110,
  },
  metricsSeparator: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    color: Colors.textMuted,
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
    backgroundColor: Colors.textSecondary,
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
  screenContextChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.whiteFaint,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: Radius.huge,
    marginBottom: 6,
    gap: 6,
    maxWidth: 220,
  },
  screenContextIcon: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  screenContextLabel: {
    color: 'white',
    fontFamily: Fonts.body,
    fontSize: FontSizes.xxs,
    flexShrink: 1,
  },
  sourcesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 6,
    maxWidth: 220,
  },
  sourceFavicon: {
    width: 20,
    height: 20,
    borderRadius: Radius.xs,
  },
  sourceLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    flexShrink: 1,
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
    marginTop: 10,
    marginBottom: 28,
    marginHorizontal: 16,
  },
  disclaimerText: {
    fontSize: FontSizes.bodyMd,
    color: Colors.textMuted,
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
