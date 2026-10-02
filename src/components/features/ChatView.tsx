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
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { t } from "../../i18n";
import { AIModule } from "../../services/ai/AIModule";
import { Suggestion } from "../../services/ai/generation/suggestions";
import { resolveMentions } from "../../services/ai/mentions";
import type { ToolCall } from "../../services/ai/tools/ITool";
import { Conversation, Message, MessageSource } from "../../services/db/DatabaseService";
import { splitDocumentBlocks } from "../../services/documents/DocumentService";
import { Settings } from "../../services/settings/SettingsService";
import { TTS } from "../../services/speech/TTSService";
import IconButton from "../ui/IconButton";
import { deriveChatDisplay, describeToolCall, renderMarkdown } from "../ui/MarkdownText";
import SuggestionPill from "../ui/SuggestionPill";
import ThinkingIcon from "../ui/ThinkingIcon";
import ButterflyCluster from "./ButterflyCluster";
import type { PreviewImage } from "./ImagePreviewSheet";
import type { PreviewDetails } from "./MessageDetailsSheet";
import { pressStyle } from "../ui/pressStyle";

const speakerIcon = require("../../../assets/icons/speaker.png");
const videoIcon = require("../../../assets/icons/camera.png");
const reloadIcon = require("../../../assets/icons/reload.png");
const copyIcon = require("../../../assets/icons/copy.png");
const infoIcon = require("../../../assets/icons/info.png");
const chatIcon = require("../../../assets/icons/chat.png");
const appSourceIcon = require("../../../assets/icons/tool.png");
const imageSourceIcon = require("../../../assets/icons/photo.png");
const linkSourceIcon = require("../../../assets/icons/hyperlink.png");
const arrowIcon = require("../../../assets/icons/return.png");
const fileIcon = require("../../../assets/icons/file.png");
const rightArrowIcon = require("../../../assets/icons/right.png");

//android 13+ shows its own clipboard confirmation
const ANDROID_CLIPBOARD_UI_API = 33;

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
      style={pressStyle(styles.sourcePill, canOpen && "surface")}
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

//readable name from a data uri or path
function attachmentFilename(path: string): string {
  //pasted files carry their own name
  if (path.startsWith('data:') && !path.includes('?name=')) return 'Audio Recording.wav';
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
}

//attached file above a user bubble
const AttachmentChip = ({ icon, label, tinted = true }: { icon: any; label: string; tinted?: boolean }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.attachmentChip}>
      <Image source={icon} style={[styles.attachmentIcon, tinted && styles.attachmentIconTinted]} />
      {!!label && <Text style={styles.attachmentLabel} numberOfLines={2} ellipsizeMode="middle">{label}</Text>}
    </View>
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
  //waiting behind another conversation
  queuedMessageIds?: string[];
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
  onImagePress?: (image: PreviewImage) => void;
  onDetailsPress?: (details: PreviewDetails) => void;
  //home butterfly frame to fly from
  butterflyFrom?: DOMRect | null;
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

const FlashingText = ({ text }: { text: React.ReactNode }) => {
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
    <Animated.Text style={[styles.flashingText, { opacity }]} numberOfLines={1}>
      {text}
    </Animated.Text>
  );
};

//every tool call of a reply in one pill
const ToolsPill = ({ calls }: { calls: ToolCall[] }) => {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const last = calls.length - 1;

  //numbered like the thinking steps
  const callLine = (call: ToolCall, index: number) => {
    const { name, detail } = describeToolCall(call);
    return (
      <>
        {`${index + 1}. ${name}`}
        {!!detail && <Text style={styles.toolDetail}>{` · ${detail}`}</Text>}
      </>
    );
  };

  return (
    <Pressable
      onPress={() => setOpen(prev => !prev)}
      style={pressStyle([styles.thinkingPill, open && styles.thinkingPillOpen], "surface")}
    >
      <Image source={rightArrowIcon} style={[styles.thinkingArrow, open && styles.thinkingArrowOpen]} />
      {open ? (
        <View style={styles.toolList}>
          {calls.map((call, i) => (
            <Text key={i} style={styles.thinkingText}>{callLine(call, i)}</Text>
          ))}
        </View>
      ) : (
        <FlashingText text={callLine(calls[last], last)} />
      )}
    </Pressable>
  );
};

const MessageItem = React.memo(({ item, incognito, onRegenerate, speakerEnabled, onSpeak, isSpeaking, showSnackbar, isGenerating, isQueued, isChatGenerating, showMetrics, fallbackModel, canThink, dark, onOpenInApp, suggestions, onSuggestionPress, onImagePress, onDetailsPress }: { item: Message; incognito?: boolean; onRegenerate?: (id: string) => void; speakerEnabled?: boolean; onSpeak?: (item: Message) => void; isSpeaking?: boolean; showSnackbar: (msg: string) => void; isGenerating?: boolean; isQueued?: boolean; isChatGenerating?: boolean; showMetrics?: boolean; fallbackModel?: string; canThink?: boolean; dark?: boolean; onOpenInApp?: (item: Message) => void; suggestions?: Suggestion[]; onSuggestionPress?: (text: string) => void; onImagePress?: (image: PreviewImage) => void; onDetailsPress?: (details: PreviewDetails) => void }) => {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const isUser = item.role === "user";
  const [thinkingOpen, setThinkingOpen] = useState(false);
  //suggestion cards take half the visible row
  const [suggestionBarWidth, setSuggestionBarWidth] = useState(0);

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
  const userDocuments = useMemo(
    () => (isUser ? splitDocumentBlocks(item.content) : null),
    [isUser, item.content]
  );
  const documentNames = userDocuments?.names ?? [];
  const visibleContent = userDocuments ? userDocuments.text : item.content;
  //requested tools with their dependencies
  const mentions = useMemo(
    () => (isUser ? resolveMentions(visibleContent) : []),
    [isUser, visibleContent]
  );

  //queued rows load like running ones
  const isBusy = !!isGenerating || !!isQueued;
  //reparse only when deps move
  const disp = useMemo(
    () => deriveChatDisplay(item.content, isBusy, activeTool, !!canThink),
    [item.content, isBusy, activeTool, canThink]
  );
  const isCurrentlyThinking = !isUser && disp.showThinkingRow;
  const isUsingTools = !isUser && disp.showToolsRow;
  //only real reasoning can unfold
  const hasReasoning = disp.thinkingText.length > 0;
  const reasoningOpen = thinkingOpen && hasReasoning;

  //reparse keyed on text and theme colors
  const markdownNodes = useMemo(
    () => (disp.showMarkdown ? renderMarkdown(disp.finalContent, incognito, dark) : null),
    [disp.showMarkdown, disp.finalContent, incognito, dark, Colors]
  );

  //copy only what is displayed
  const copyToClipboard = async (isMarkdown: boolean) => {
    const contentToCopy = isMarkdown ? disp.visibleText : stripMarkdown(disp.visibleText);
    await Clipboard.setStringAsync(contentToCopy);
    const message = isMarkdown ? t("chat.copiedMarkdown") : t("chat.copied");
    if (Platform.OS !== "android") showSnackbar(message);
    else if (Platform.Version < ANDROID_CLIPBOARD_UI_API) ToastAndroid.show(message, ToastAndroid.SHORT);
  };

  return (
    <View style={[styles.bubble, isUser ? styles.userMessage : styles.aiBubble]}>
      {isUser ? (
        <>
          {(!!item.screenContext?.icon || (item.images && item.images.length > 0) || documentNames.length > 0 || mentions.length > 0) && (
            <View style={styles.attachmentsRow}>
              {!!item.screenContext?.icon && (
                <AttachmentChip icon={{ uri: item.screenContext.icon }} label={item.screenContext.label || ''} tinted={false} />
              )}
              {item.images?.map((uri, i) => {
                const isAudio = uri.startsWith('data:audio') || /\.(wav|mp3|m4a|aac|flac|ogg)(?:\?.*)?$/i.test(uri);
                const isVideo = uri.startsWith('data:video') || /\.(mp4|mov|webm)(?:\?.*)?$/i.test(uri);
                return isAudio || isVideo ? (
                  <AttachmentChip key={i} icon={isVideo ? videoIcon : speakerIcon} label={attachmentFilename(uri)} />
                ) : (
                  <Pressable key={i} onPress={() => onImagePress?.({ uri })} style={pressStyle(null, "fadeLight")}>
                    <Image source={{ uri }} style={styles.messageImage} />
                  </Pressable>
                );
              })}
              {documentNames.map((name, i) => (
                <AttachmentChip key={`doc-${i}`} icon={fileIcon} label={name} />
              ))}
              {mentions.map(mention => (
                <AttachmentChip key={`mention-${mention.id}`} icon={appSourceIcon} label={`@${mention.id}`} />
              ))}
            </View>
          )}
          {!!visibleContent && (
            <View style={incognito ? styles.userBubbleIncognito : styles.userBubble}>
              <Text
                style={[styles.bubbleText, styles.userText]}
                selectable={true}
                selectionColor={Colors.whiteDim}
              >
                {visibleContent}
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.aiContainer}>
          {(isCurrentlyThinking || isUsingTools) && (
            <View style={styles.thinkingContainer}>
              <View style={styles.thinkingIcon}>
                <ThinkingIcon incognito={incognito} />
              </View>
              <View style={styles.activityPills}>
                {isCurrentlyThinking && (!!disp.currentThought || hasReasoning) && (
                  <Pressable
                    disabled={!hasReasoning}
                    onPress={() => setThinkingOpen(prev => !prev)}
                    style={pressStyle([styles.thinkingPill, reasoningOpen && styles.thinkingPillOpen], hasReasoning && "surface")}
                  >
                    {hasReasoning && (
                      <Image source={rightArrowIcon} style={[styles.thinkingArrow, reasoningOpen && styles.thinkingArrowOpen]} />
                    )}
                    {reasoningOpen ? (
                      <Text style={styles.thinkingText}>{disp.thinkingText.replace(/\*\*/g, "")}</Text>
                    ) : (
                      <FlashingText text={disp.currentThought} />
                    )}
                  </Pressable>
                )}
                {isUsingTools && <ToolsPill calls={disp.toolCalls} />}
              </View>
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
          {!isUser && !isCurrentlyThinking && !isBusy && (
            <View style={styles.aiToolbar}>
              {speakerEnabled && (
                <IconButton
                  icon={speakerIcon}
                  label={isSpeaking ? t("common.stop") : t("common.listen")}
                  onPress={() => onSpeak?.(item)}
                  containerSize={32}
                  pressedColor={Colors.surfacePressed}
                  tintColor={isSpeaking ? (incognito ? Colors.incognito : Colors.primary) : (dark ? Colors.surface : Colors.textMuted)}
                />
              )}
              <IconButton
                icon={reloadIcon}
                label={t("common.regenerate")}
                onPress={() => onRegenerate?.(item.id)}
                disabled={isChatGenerating}
                containerSize={32}
                pressedColor={Colors.surfacePressed}
                tintColor={dark ? Colors.surface : Colors.textMuted}
              />
              <IconButton
                icon={copyIcon}
                label={t("common.copy")}
                onPress={() => copyToClipboard(false)}
                onLongPress={() => copyToClipboard(true)}
                delayLongPress={500}
                containerSize={32}
                pressedColor={Colors.surfacePressed}
                tintColor={dark ? Colors.surface : Colors.textMuted}
              />
              {!!onOpenInApp && (
                <IconButton
                  icon={chatIcon}
                  label={t("common.openInApp")}
                  onPress={() => onOpenInApp(item)}
                  containerSize={32}
                  pressedColor={Colors.surfacePressed}
                  tintColor={dark ? Colors.surface : Colors.textMuted}
                />
              )}
              {showMetrics && !!onDetailsPress && (
                <IconButton
                  icon={infoIcon}
                  label={t("common.details")}
                  onPress={() => onDetailsPress({
                    model: item.metrics?.model || fallbackModel,
                    metrics: item.metrics,
                    thinkingText: disp.thinkingText,
                    toolCalls: disp.toolCalls,
                  })}
                  containerSize={32}
                  pressedColor={Colors.surfacePressed}
                  tintColor={dark ? Colors.surface : Colors.textMuted}
                />
              )}
            </View>
          )}
          {!isCurrentlyThinking && !isBusy && !isChatGenerating && !!suggestions && suggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              onLayout={(e) => setSuggestionBarWidth(e.nativeEvent.layout.width)}
              style={styles.suggestionBar}
              contentContainerStyle={styles.suggestionContent}
            >
              {suggestionBarWidth > 0 && suggestions.map((suggestion) => (
                <SuggestionPill
                  key={suggestion.message}
                  icon={arrowIcon}
                  label={suggestion.label}
                  width={suggestionBarWidth / 2}
                  onPress={() => onSuggestionPress?.(suggestion.message)}
                />
              ))}
            </ScrollView>
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
  prev.isQueued === next.isQueued &&
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
  prev.onSuggestionPress === next.onSuggestionPress &&
  prev.onImagePress === next.onImagePress &&
  prev.onDetailsPress === next.onDetailsPress);
MessageItem.displayName = "MessageItem";

export default function ChatView({ messages, conversation, contentTopPadding, contentBottomPadding, incognito, onRegenerate, speakerEnabled, showMetrics, generatingMessageId, queuedMessageIds, hideHeader, hideGradients, onOpenConfidentiality, canThink, dark, alignBottom, onOpenInApp, suggestions, onSuggestionPress, onImagePress, onDetailsPress, butterflyFrom }: ChatViewProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const listRef = useRef<FlatList>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const isAtBottomRef = useRef(true);
  //chat from home keeps its header in view
  const initialScrollDone = useRef(!!butterflyFrom);

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
    return <MessageItem item={item} incognito={incognito} onRegenerate={onRegenerate} speakerEnabled={speakerEnabled} onSpeak={handleSpeak} isSpeaking={speakingMessageId === item.id} showSnackbar={setSnackbarMessage} isGenerating={item.id === generatingMessageId} isQueued={!!queuedMessageIds?.includes(item.id)} isChatGenerating={!!generatingMessageId} showMetrics={showMetrics} fallbackModel={conversation?.model} canThink={canThink} dark={dark} onOpenInApp={onOpenInApp} suggestions={item.id === lastAssistantId ? suggestions : undefined} onSuggestionPress={onSuggestionPress} onImagePress={onImagePress} onDetailsPress={onDetailsPress} />;
  }, [incognito, onRegenerate, speakerEnabled, handleSpeak, speakingMessageId, generatingMessageId, queuedMessageIds, showMetrics, conversation?.model, canThink, dark, onOpenInApp, lastAssistantId, suggestions, onSuggestionPress, onImagePress, onDetailsPress]);

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
              //only the initial scroll reads it
              onLayout={(e) => {
                if (!initialScrollDone.current) setHeaderHeight(e.nativeEvent.layout.height);
              }}
            >
              <ButterflyCluster
                incognito={incognito}
                style={styles.headerButterfly}
                from={butterflyFrom}
                parallax={false}
                intro={false}
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
                  style={pressStyle(null, "fade")}
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
  //attachments and text stacked on the right
  userMessage: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
    maxWidth: "80%",
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: Spacing.sm,
  },
  userBubble: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  userBubbleIncognito: {
    backgroundColor: Colors.incognito,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    //butterfly stays on the first line
    alignItems: 'flex-start',
    gap: 12,
  },
  //unfolded text must not squeeze it
  thinkingIcon: {
    flexShrink: 0,
  },
  //pills hug their text
  activityPills: {
    flexShrink: 1,
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  flashingText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
    flexShrink: 1,
  },
  thinkingPill: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg2,
  },
  thinkingPillOpen: {
    alignItems: "flex-start",
  },
  //right chevron points down when folded
  thinkingArrow: {
    width: 18,
    height: 18,
    tintColor: Colors.textPrimary,
    transform: [{ rotate: "90deg" }],
  },
  thinkingArrowOpen: {
    transform: [{ rotate: "-90deg" }],
  },
  thinkingText: {
    flexShrink: 1,
    color: Colors.textSecondary,
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
    lineHeight: 20,
  },
  toolList: {
    flexShrink: 1,
    gap: Spacing.xs,
  },
  toolDetail: {
    color: Colors.textMuted,
  },
  aiToolbar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 16,
  },
  suggestionBar: {
    marginTop: Spacing.md,
    //row sizes itself inside column
    flexGrow: 0,
  },
  suggestionContent: {
    flexDirection: "row",
    gap: Spacing.md,
    //every card matches the tallest one
    alignItems: "stretch",
    //cards hug the right edge when sparse
    flexGrow: 1,
    justifyContent: "flex-end",
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
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSubtle,
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
  attachmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  //square tile matching image size
  attachmentChip: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  attachmentIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
  },
  attachmentIconTinted: {
    tintColor: Colors.textMuted,
  },
  attachmentLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    textAlign: 'center',
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
