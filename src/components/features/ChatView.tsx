import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  LayoutChangeEvent,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ToastAndroid,
  View,
} from "react-native";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useResponsive } from "../../hooks/useResponsive";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { t } from "../../i18n";
import { AIModule } from "../../services/ai/AIModule";
import { Suggestion } from "../../services/ai/generation/suggestions";
import { openExternalUrl } from "../../services/ai/utils/openExternalUrl";
import { resolveMentions, type ResolvedMention } from "../../services/ai/mentions";
import type { ToolCall } from "../../services/ai/tools/ITool";
import { Conversation, Message, MessageSource } from "../../services/db/DatabaseService";
import { splitDocumentBlocks } from "../../services/documents/DocumentService";
import { Settings } from "../../services/settings/SettingsService";
import { TTS } from "../../services/speech/TTSService";
import AppIcon, { type IconSource } from "../ui/AppIcon";
import IconButton from "../ui/IconButton";
import { deriveChatDisplay, describeToolCall, renderMarkdown } from "../ui/MarkdownText";
import SuggestionPill from "../ui/SuggestionPill";
import ThinkingIcon from "../ui/ThinkingIcon";
import ButterflyCluster from "./ButterflyCluster";
import type { PreviewImage } from "./ImagePreviewSheet";
import type { PreviewDetails } from "./MessageDetailsSheet";
import { pressStyle } from "../ui/pressStyle";
import speakerIcon from "../../../assets/icons/speaker2.svg";
import videoIcon from "../../../assets/icons/camera2.svg";
import reloadIcon from "../../../assets/icons/reload2.svg";
import copyIcon from "../../../assets/icons/copy2.svg";
import infoIcon from "../../../assets/icons/info2.svg";
import chatIcon from "../../../assets/icons/message2.svg";
import imageSourceIcon from "../../../assets/icons/photo2.svg";
import linkSourceIcon from "../../../assets/icons/hyperlink2.svg";
import arrowIcon from "../../../assets/icons/return2.svg";
import fileIcon from "../../../assets/icons/file.svg";
import rightArrowIcon from "../../../assets/icons/arrow2.svg";
import pencilIcon from "../../../assets/icons/edit2.svg";
import appSourceIcon from "../../../assets/icons/tool2.svg";
import widgetIcon from "../../../assets/icons/code2.svg";
import { buzzPress } from "../ui/buzzPress";

//distance from the bottom that resumes the follow
const FOLLOW_REGAIN = 60;
//length of one native smooth scroll
const GLIDE_MS = 250;
//a conversation moves without a slide while it settles in
const SETTLE_MS = 500;
//a regeneration lands in the room of the reply it replaces
const ROOM_GRACE = 300;
//space between two rows, and between a question and its reply
const LIST_GAP = 10;
//the pinned question stops this far under the top bar buttons
const PIN_MARGIN = Spacing.xxl;

//a question and the replies that follow it
type Turn = { id: string; messages: Message[] };

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
  const fallbackIcon = kind === 'image' ? imageSourceIcon : kind === 'app' ? appSourceIcon : linkSourceIcon;

  return (
    <Pressable
      onPress={buzzPress(() => { if (canOpen) openExternalUrl(source.url).catch(() => { }); })}
      disabled={!canOpen}
      style={pressStyle(styles.sourcePill, canOpen && "surface")}
    >
      <Text style={styles.sourceLabel} numberOfLines={1}>{sourceLabel(source)}</Text>
      {useFavicon ? (
        <Image
          source={{ uri: source.favicon }}
          style={styles.sourceFavicon}
          onError={() => setFaviconFailed(true)}
        />
      ) : (
        <AppIcon
          source={fallbackIcon}
          style={styles.sourceFavicon}
          tintColor={Colors.textMuted}
        />
      )}
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
const AttachmentChip = ({ icon, label, tinted = true }: { icon: IconSource; label: string; tinted?: boolean }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.attachmentChip}>
      <AppIcon source={icon} style={[styles.attachmentIcon, tinted && styles.attachmentIconTinted]} />
      {!!label && <Text style={styles.attachmentLabel} numberOfLines={2} ellipsizeMode="middle">{label}</Text>}
    </View>
  );
};

//requested tools and widgets grouped in one card
const MentionsCard = ({ mentions }: { mentions: ResolvedMention[] }) => {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.mentionsCard}>
      {mentions.map(mention => (
        <View key={`${mention.kind}-${mention.id}`} style={styles.mentionItemRow}>
          <AppIcon
            source={mention.kind === 'widget' ? widgetIcon : appSourceIcon}
            style={styles.mentionItemIcon}
            tintColor={Colors.textMuted}
          />
          <Text style={styles.mentionItemLabel} numberOfLines={1} ellipsizeMode="middle">
            {`@${mention.id}`}
          </Text>
        </View>
      ))}
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
  onEditMessage?: (item: Message) => void;
  //toggle gates the ai edit button
  editAiEnabled?: boolean;
  //lets a host size itself to the content
  onContentHeight?: (height: number) => void;
};

const stripMarkdown = (md: string) => {
  return md
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1')
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

export const FlashingText = ({ text, style }: { text: React.ReactNode; style?: StyleProp<TextStyle> }) => {
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
    <Animated.Text style={[styles.flashingText, style, { opacity }]} numberOfLines={1}>
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
      onPress={buzzPress(() => setOpen(prev => !prev))}
      style={pressStyle([styles.thinkingPill, open && styles.thinkingPillOpen], "surface")}
    >
      <View style={open && styles.thinkingArrowOpen}>
        <AppIcon source={rightArrowIcon} style={styles.thinkingArrow} />
      </View>
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

const MessageItem = React.memo(({ item, incognito, onRegenerate, speakerEnabled, onSpeak, isSpeaking, showSnackbar, isGenerating, isQueued, isChatGenerating, fallbackModel, canThink, dark, onOpenInApp, suggestions, onSuggestionPress, onImagePress, onDetailsPress, onEditMessage, editAiEnabled }: { item: Message; incognito?: boolean; onRegenerate?: (id: string) => void; speakerEnabled?: boolean; onSpeak?: (item: Message) => void; isSpeaking?: boolean; showSnackbar: (msg: string) => void; isGenerating?: boolean; isQueued?: boolean; isChatGenerating?: boolean; fallbackModel?: string; canThink?: boolean; dark?: boolean; onOpenInApp?: (item: Message) => void; suggestions?: Suggestion[]; onSuggestionPress?: (text: string) => void; onImagePress?: (image: PreviewImage) => void; onDetailsPress?: (details: PreviewDetails) => void; onEditMessage?: (item: Message) => void; editAiEnabled?: boolean }) => {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const isUser = item.role === "user";
  const [thinkingOpen, setThinkingOpen] = useState(false);
  //suggestion cards take half the visible row
  const [suggestionBarWidth, setSuggestionBarWidth] = useState(0);
  const { isMobile } = useResponsive();

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

  //split settled blocks from streaming tail
  const [settledMd, tailMd] = useMemo(() => {
    if (!disp.showMarkdown) return ["", ""];
    if (!isGenerating) return [disp.finalContent, ""];
    const fenceCount = (disp.finalContent.match(/```/g) ?? []).length;
    if (fenceCount % 2 !== 0) return ["", disp.finalContent];
    const splitAt = disp.finalContent.lastIndexOf("\n\n");
    if (splitAt <= 0) return ["", disp.finalContent];
    return [disp.finalContent.slice(0, splitAt), disp.finalContent.slice(splitAt + 2)];
  }, [disp.showMarkdown, disp.finalContent, isGenerating]);

  const settledNodes = useMemo(
    () => (settledMd ? renderMarkdown(settledMd, incognito, dark) : null),
    [settledMd, incognito, dark]
  );
  const tailNodes = useMemo(
    () => (tailMd ? renderMarkdown(tailMd, incognito, dark) : null),
    [tailMd, incognito, dark]
  );
  const markdownNodes = settledNodes || tailNodes ? <>{settledNodes}{tailNodes}</> : null;

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
                  <Pressable key={i} onPress={buzzPress(() => onImagePress?.({ uri }))} style={pressStyle(null, "fadeLight")}>
                    <Image source={{ uri }} style={styles.messageImage} />
                  </Pressable>
                );
              })}
              {documentNames.map((name, i) => (
                <AttachmentChip key={`doc-${i}`} icon={fileIcon} label={name} />
              ))}
              {mentions.length > 0 && <MentionsCard mentions={mentions} />}
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
          {!!visibleContent && (
            <View
              style={[styles.userToolbar, (isBusy || isChatGenerating) && styles.toolbarHidden]}
              pointerEvents={isBusy || isChatGenerating ? "none" : "auto"}
              accessibilityElementsHidden={isBusy || isChatGenerating}
              importantForAccessibility={isBusy || isChatGenerating ? "no-hide-descendants" : "auto"}
            >
              <IconButton
                icon={pencilIcon}
                label={t("common.edit")}
                onPress={() => onEditMessage?.(item)}
                size={18}
                containerSize={28}
                pressedColor={Colors.surfacePressed}
                tintColor={dark ? Colors.surface : Colors.textMuted}
              />
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
                    onPress={buzzPress(() => setThinkingOpen(prev => !prev))}
                    style={pressStyle([styles.thinkingPill, reasoningOpen && styles.thinkingPillOpen], hasReasoning && "surface")}
                  >
                    {hasReasoning && (
                      <View style={reasoningOpen && styles.thinkingArrowOpen}>
                        <AppIcon source={rightArrowIcon} style={styles.thinkingArrow} />
                      </View>
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
          {!isUser && (
            <View
              style={[styles.aiToolbar, (isCurrentlyThinking || isBusy) && styles.toolbarHidden]}
              pointerEvents={isCurrentlyThinking || isBusy ? "none" : "auto"}
              accessibilityElementsHidden={isCurrentlyThinking || isBusy}
              importantForAccessibility={isCurrentlyThinking || isBusy ? "no-hide-descendants" : "auto"}
            >
              {speakerEnabled && (
                <IconButton
                  icon={speakerIcon}
                  label={isSpeaking ? t("common.stop") : t("common.listen")}
                  onPress={() => onSpeak?.(item)}
                  size={18}
                  containerSize={28}
                  pressedColor={Colors.surfacePressed}
                  tintColor={isSpeaking ? (incognito ? Colors.incognito : Colors.primary) : (dark ? Colors.surface : Colors.textMuted)}
                />
              )}
              <IconButton
                icon={reloadIcon}
                label={t("common.regenerate")}
                onPress={() => onRegenerate?.(item.id)}
                disabled={isChatGenerating}
                size={18}
                containerSize={28}
                pressedColor={Colors.surfacePressed}
                tintColor={dark ? Colors.surface : Colors.textMuted}
              />
              <IconButton
                icon={copyIcon}
                label={t("common.copy")}
                onPress={() => copyToClipboard(false)}
                onLongPress={() => copyToClipboard(true)}
                delayLongPress={500}
                size={18}
                containerSize={28}
                pressedColor={Colors.surfacePressed}
                tintColor={dark ? Colors.surface : Colors.textMuted}
              />
              {!!onOpenInApp && (
                <IconButton
                  icon={chatIcon}
                  label={t("common.openInApp")}
                  onPress={() => onOpenInApp(item)}
                  size={18}
                  containerSize={28}
                  pressedColor={Colors.surfacePressed}
                  tintColor={dark ? Colors.surface : Colors.textMuted}
                />
              )}
              {editAiEnabled && !!onEditMessage && (
                <IconButton
                  icon={pencilIcon}
                  label={t("common.edit")}
                  onPress={() => onEditMessage(item)}
                  disabled={isChatGenerating}
                  size={18}
                  containerSize={28}
                  pressedColor={Colors.surfacePressed}
                  tintColor={dark ? Colors.surface : Colors.textMuted}
                />
              )}
              {!!onDetailsPress && (
                <IconButton
                  icon={infoIcon}
                  label={t("common.details")}
                  onPress={() => onDetailsPress({
                    model: item.metrics?.model || fallbackModel,
                    metrics: item.metrics,
                    thinkingText: disp.thinkingText,
                    toolCalls: disp.toolCalls,
                  })}
                  size={18}
                  containerSize={28}
                  pressedColor={Colors.surfacePressed}
                  tintColor={dark ? Colors.surface : Colors.textMuted}
                />
              )}
            </View>
          )}
          {!isCurrentlyThinking && !isBusy && !isChatGenerating && !!suggestions && suggestions.length > 0 && (
            isMobile ? (
              <View style={styles.suggestionList}>
                {suggestions.map((suggestion, index) => (
                  <SuggestionPill
                    key={suggestion.message}
                    icon={arrowIcon}
                    index={index}
                    label={suggestion.label}
                    onPress={() => onSuggestionPress?.(suggestion.message)}
                  />
                ))}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                onLayout={(e) => setSuggestionBarWidth(e.nativeEvent.layout.width)}
                style={styles.suggestionBar}
                contentContainerStyle={styles.suggestionContent}
              >
                {suggestionBarWidth > 0 && suggestions.map((suggestion, index) => (
                  <SuggestionPill
                    key={suggestion.message}
                    icon={arrowIcon}
                    index={index}
                    label={suggestion.label}
                    width={suggestionBarWidth / 2}
                    onPress={() => onSuggestionPress?.(suggestion.message)}
                  />
                ))}
              </ScrollView>
            )
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
  prev.onDetailsPress === next.onDetailsPress &&
  prev.onEditMessage === next.onEditMessage &&
  prev.editAiEnabled === next.editAiEnabled);
MessageItem.displayName = "MessageItem";

export default function ChatView({ messages, conversation, contentTopPadding, contentBottomPadding, incognito, onRegenerate, speakerEnabled, generatingMessageId, queuedMessageIds, hideHeader, hideGradients, onOpenConfidentiality, canThink, dark, alignBottom, onOpenInApp, suggestions, onSuggestionPress, onImagePress, onDetailsPress, onEditMessage, editAiEnabled, onContentHeight }: ChatViewProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const listRef = useRef<FlatList>(null);
  //height without the keyboard, it sizes the room
  const [viewportHeight, setViewportHeight] = useState(0);
  //turn pinned to the top of the view while its reply grows
  const [anchorId, setAnchorId] = useState<string | null>(null);
  //live reply holding the room, per conversation
  const [claim, setClaim] = useState<{ conv: string | undefined; live: string | null }>({ conv: conversation?.id, live: null });

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

  const followingRef = useRef(true);
  //a finger moved the list since our last pin
  const draggingRef = useRef(false);
  //the pin waits until the room is laid out
  const pinRef = useRef<{ sized: boolean; measured: boolean } | null>(null);
  const armedRef = useRef<string | null>(null);
  const anchorHeightRef = useRef(0);
  const anchorViewRef = useRef<View>(null);
  //instant moves while a conversation settles in, armed per conversation
  const settleUntilRef = useRef(0);
  //live sizes, the keyboard included
  const liveHeightRef = useRef(0);
  const liveWidthRef = useRef(0);
  const contentHeightRef = useRef(0);
  const roomSeenRef = useRef(0);

  //room a pinned reply takes between the two bars
  const viewRoom = Math.max(0, viewportHeight - contentTopPadding - contentBottomPadding - PIN_MARGIN);

  //native end, padding included, read at run time
  const scrollToEnd = useCallback((animated: boolean) => {
    listRef.current?.getNativeScrollRef()?.scrollToEnd({ animated });
  }, []);

  const glideUntilRef = useRef(0);
  const glideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopGlide = useCallback(() => {
    if (glideTimerRef.current) clearTimeout(glideTimerRef.current);
    glideTimerRef.current = null;
    glideUntilRef.current = 0;
  }, []);

  useEffect(() => stopGlide, [stopGlide]);

  //a new glide restarts at rest, so they chain
  const glideToEnd = useCallback(() => {
    const start = () => {
      glideUntilRef.current = Date.now() + GLIDE_MS;
      //android reports this glide as momentum
      draggingRef.current = false;
      scrollToEnd(true);
    };
    if (glideTimerRef.current) return;
    const wait = glideUntilRef.current - Date.now();
    if (wait <= 0) {
      start();
      return;
    }
    glideTimerRef.current = setTimeout(() => {
      glideTimerRef.current = null;
      if (followingRef.current) start();
    }, wait);
  }, [scrollToEnd]);

  //a wheel is the only scroll gesture the web list never reports
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = (listRef.current as any)?.getScrollableNode?.();
    if (!node?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        followingRef.current = false;
        pinRef.current = null;
        stopGlide();
      } else if (node.scrollHeight - node.clientHeight - node.scrollTop - e.deltaY < FOLLOW_REGAIN) {
        followingRef.current = true;
      }
    };
    node.addEventListener("wheel", onWheel, { passive: true });
    return () => node.removeEventListener("wheel", onWheel);
  }, [stopGlide]);

  const handleBeginDrag = () => {
    draggingRef.current = true;
    followingRef.current = false;
    pinRef.current = null;
    stopGlide();
  };

  //letting go near the bottom resumes the follow
  const handleRelease = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    //android reports our own glides as momentum
    if (!draggingRef.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    followingRef.current = contentSize.height - layoutMeasurement.height - contentOffset.y < FOLLOW_REGAIN;
  };

  //messages land after the id, so the settle restarts with them
  const loadedConvRef = useRef<string | undefined>(undefined);

  //every conversation opens at its own bottom
  useLayoutEffect(() => {
    followingRef.current = true;
    pinRef.current = null;
    armedRef.current = null;
    stopGlide();
    settleUntilRef.current = Date.now() + SETTLE_MS;
    loadedConvRef.current = undefined;
  }, [conversation?.id, stopGlide]);
  useLayoutEffect(() => {
    if (!conversation || messages.length === 0) return;
    if (messages[0].conversationId !== conversation.id) return;
    if (loadedConvRef.current === conversation.id) return;
    loadedConvRef.current = conversation.id;
    followingRef.current = true;
    settleUntilRef.current = Date.now() + SETTLE_MS;
    scrollToEnd(false);
  }, [conversation, messages, scrollToEnd]);

  //a reply lives in the row of its question, so the room pins the question
  const turns = useMemo(() => {
    const rows: Turn[] = [];
    for (const m of messages) {
      const row = rows[rows.length - 1];
      if (m.role === "assistant" && row) row.messages.push(m);
      else rows.push({ id: m.id, messages: [m] });
    }
    return rows;
  }, [messages]);
  const turnCount = turns.length;

  //the reply being written, its turn pinned under the top bar
  const last = messages.length > 0 ? messages[messages.length - 1] : null;
  //a list from the conversation we just left must not pin anything
  const liveId =
    last && last.role === "assistant" && last.conversationId === conversation?.id &&
      (last.id === generatingMessageId || !!queuedMessageIds?.includes(last.id))
      ? last.id
      : null;
  const liveTurnId = liveId ? turns[turns.length - 1].id : null;

  //room lands in the same commit as its turn
  if (claim.conv !== conversation?.id) {
    //drops the room of the conversation we leave
    setClaim({ conv: conversation?.id, live: null });
    setAnchorId(null);
  } else if (claim.live && !messages.some((m) => m.id === claim.live)) {
    setClaim({ conv: claim.conv, live: null });
  } else if (!alignBottom && liveId && liveId !== claim.live) {
    setClaim({ conv: claim.conv, live: liveId });
    setAnchorId(liveTurnId);
  }

  //a reply that left the list gives its room back, late enough for a regeneration
  useEffect(() => {
    if (claim.live || !anchorId) return;
    const timer = setTimeout(() => setAnchorId(null), ROOM_GRACE);
    return () => clearTimeout(timer);
  }, [messages, claim.live, anchorId]);

  //arms one pin per generation
  useLayoutEffect(() => {
    if (!claim.live || armedRef.current === claim.live) return;
    armedRef.current = claim.live;
    followingRef.current = true;
    //reopening mid reply lands like any opening
    if (Date.now() < settleUntilRef.current && turnCount > 1) return;
    settleUntilRef.current = 0;
    draggingRef.current = false;
    pinRef.current = { sized: false, measured: false };
  }, [claim.live, turnCount]);

  //one native glide once the room is laid out
  const tryPin = useCallback(() => {
    const pin = pinRef.current;
    if (!pin?.sized || viewRoom <= 0) return false;
    //a turn outside the window never lays out
    if (!pin.measured && anchorViewRef.current) return false;
    pinRef.current = null;
    //the follow waits for this glide
    stopGlide();
    glideUntilRef.current = Date.now() + GLIDE_MS;
    if (!pin.measured || anchorHeightRef.current <= viewRoom + 1) {
      //aims where the closing keyboard leaves the end
      if (liveHeightRef.current < viewportHeight - 1) {
        listRef.current?.scrollToOffset({ offset: contentHeightRef.current - viewportHeight, animated: true });
      } else {
        scrollToEnd(true);
      }
      return true;
    }
    //a tall question shows its top instead
    followingRef.current = false;
    const inner = listRef.current?.getNativeScrollRef()?.getInnerViewRef();
    //list metrics lag behind the cells above
    if (inner) anchorViewRef.current?.measureLayout(inner, (_x, y) => {
      listRef.current?.scrollToOffset({ offset: y - contentTopPadding - PIN_MARGIN, animated: true });
    });
    return true;
  }, [viewRoom, viewportHeight, contentTopPadding, scrollToEnd, stopGlide]);

  const handleAnchorLayout = useCallback((e: LayoutChangeEvent) => {
    anchorHeightRef.current = e.nativeEvent.layout.height;
    if (!pinRef.current) return;
    pinRef.current.measured = true;
    tryPin();
  }, [tryPin]);

  //suggestions belong to the newest assistant message
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const renderItem = useCallback(({ item: turn }: { item: Turn }) => {
    return (
      <View
        ref={turn.id === anchorId ? anchorViewRef : undefined}
        style={[styles.turn, turn.id === anchorId && { minHeight: viewRoom }]}
        onLayout={turn.id === anchorId ? handleAnchorLayout : undefined}
      >
        {turn.messages.map((item) => (
          <MessageItem key={item.id} item={item} incognito={incognito} onRegenerate={onRegenerate} speakerEnabled={speakerEnabled} onSpeak={handleSpeak} isSpeaking={speakingMessageId === item.id} showSnackbar={setSnackbarMessage} isGenerating={item.id === generatingMessageId} isQueued={!!queuedMessageIds?.includes(item.id)} isChatGenerating={!!generatingMessageId} fallbackModel={conversation?.model} canThink={canThink} dark={dark} onOpenInApp={onOpenInApp} suggestions={item.id === lastAssistantId ? suggestions : undefined} onSuggestionPress={onSuggestionPress} onImagePress={onImagePress} onDetailsPress={onDetailsPress} onEditMessage={onEditMessage} editAiEnabled={editAiEnabled} />
        ))}
      </View>
    );
  }, [styles.turn, incognito, onRegenerate, speakerEnabled, handleSpeak, speakingMessageId, generatingMessageId, queuedMessageIds, conversation?.model, canThink, dark, onOpenInApp, lastAssistantId, suggestions, onSuggestionPress, onImagePress, onDetailsPress, onEditMessage, editAiEnabled, anchorId, viewRoom, handleAnchorLayout]);

  return (
    <View style={styles.container}>
      <FlatList
        style={{ flex: 1, width: '100%' }}
        ref={listRef}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          //the keyboard shrinks the view, never the room
          const keepRoom = Platform.OS !== "web" && width === liveWidthRef.current;
          liveWidthRef.current = width;
          liveHeightRef.current = height;
          setViewportHeight((prev) => (keepRoom ? Math.max(prev, height) : height));
          if (Date.now() < settleUntilRef.current) scrollToEnd(false);
        }}
        data={turns}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        nestedScrollEnabled={true}
        ListHeaderComponent={
          !hideHeader && conversation ? (
            <View style={styles.headerBlock}>
              <ButterflyCluster
                incognito={incognito}
                style={styles.headerButterfly}
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
                  onPress={buzzPress(() => onOpenConfidentiality?.())}
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
        onScrollBeginDrag={handleBeginDrag}
        onScrollEndDrag={handleRelease}
        onMomentumScrollBegin={() => {
          //a fling is still the user
          if (draggingRef.current) followingRef.current = false;
        }}
        onMomentumScrollEnd={handleRelease}
        onContentSizeChange={(w, h) => {
          onContentHeight?.(h);
          const growth = h - contentHeightRef.current;
          contentHeightRef.current = h;
          //a resized room is not a growing reply
          const roomMoved = !!anchorId && roomSeenRef.current !== viewRoom;
          roomSeenRef.current = viewRoom;
          if (pinRef.current) {
            pinRef.current.sized = true;
            if (tryPin()) return;
          }
          //a conversation opens at its bottom without a slide
          if (Date.now() < settleUntilRef.current) {
            scrollToEnd(false);
            return;
          }
          //a reply filling its own room never changes this height
          if (pinRef.current || !followingRef.current || roomMoved) return;
          //a block landing at once would slide visibly
          if (growth > viewRoom / 2) {
            stopGlide();
            scrollToEnd(false);
          } else {
            glideToEnd();
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

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    gap: LIST_GAP,
  },
  turn: {
    gap: LIST_GAP,
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
    borderRadius: Radius.window,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  userBubbleIncognito: {
    backgroundColor: Colors.incognito,
    borderRadius: Radius.window,
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
    width: 140,
    height: 126,
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
  //kept mounted so the reply does not shift
  toolbarHidden: {
    opacity: 0,
  },
  //right aligned under user bubble
  userToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 4,
    gap: 16,
  },
  //stacked cards fill the chat width on mobile
  suggestionList: {
    marginTop: Spacing.md,
    gap: Spacing.md,
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
    backgroundColor: Colors.snackbarBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    boxShadow: `0px 2px 3.84px ${Colors.scrimDrawer}`,
    elevation: 5,
  },
  snackbarText: {
    color: Colors.textOnPrimary,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyMd,
  },
  messageImage: {
    width: 120,
    height: 120,
    borderRadius: Radius.window,
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
    borderRadius: Radius.huge,
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
    borderRadius: Radius.window,
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
  mentionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.window,
    paddingHorizontal: Spacing.lg2,
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  mentionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  mentionItemIcon: {
    width: 16,
    height: 16,
  },
  mentionItemLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    flexShrink: 1,
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
