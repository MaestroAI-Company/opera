import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, Image, Keyboard, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useResponsive } from "../../hooks/useResponsive";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT, type TranslationFn } from "../../i18n";
import { CloudSync } from "../../services/CloudSyncService";
import { Conversation, DB } from "../../services/db/DatabaseService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import IconButton from "../ui/IconButton";
import NotificationModal from "../ui/NotificationModal";
import TextInputField from "../ui/TextInputField";
import { conversationsProgress, dragDrawer, drawerWidthFor, gestureVelocity, playPageTransition, settleDrawer, settleLayoutDrawer } from "./drawerAnimation";

const searchIcon = require("../../../assets/icons/search.png");
const newIcon = require("../../../assets/icons/add.png");
const deleteIcon = require("../../../assets/icons/delete.png");
const shareIcon = require("../../../assets/icons/share.png");
const pinIcon = require("../../../assets/icons/pin.png");
const unpinIcon = require("../../../assets/icons/unpin.png");
const arrowIcon = require("../../../assets/icons/arrow.png");
const cancelIcon = require("../../../assets/icons/cancel.png");

const DRAWER_SYNC_DELAY_MS = 1500;

type ConversationsDrawerProps = {
  visible: boolean;
  onClose: () => void;
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conv: Conversation, highlightTerm?: string) => void;
  onNewConversation: () => void;
  onDeleteConversation?: (id: string) => void;
  onTogglePinConversation?: (id: string, pinned: boolean) => void;
  onShareConversation?: (conv: Conversation) => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//format group title based on date
function getGroupTitle(timestamp: number, t: TranslationFn): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffTime = startOfToday - timestamp;

  if (diffTime <= 0) return t("conversations.group.last");

  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 3) return t("conversations.group.daysAgo", { count: diffDays });

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');

  if (date.getFullYear() === now.getFullYear()) {
    return `${dd}/${mm}`;
  } else {
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  }
}

export default function ConversationsDrawer({
  visible,
  onClose,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onTogglePinConversation,
  onShareConversation,
  isLargeScreen = false,
  isDesktop = false,
}: ConversationsDrawerProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { width } = useResponsive();
  const drawerWidth = drawerWidthFor(width);

  //one value drives slide and scrim
  const progress = conversationsProgress;
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Conversation[]>([]);
  const [selectedSearchId, setSelectedSearchId] = useState<string | null>(null);
  const pageAnim = useAnimatedValue(1);

  useEffect(() => {
    if (!visible && (isSearching || searchQuery !== "" || selectedSearchId !== null)) {
      setIsSearching(false);
      setSearchQuery("");
      setSearchResults([]);
      setSelectedSearchId(null);
    }
  }, [visible]);

  const prevSearchingRef = useRef(isSearching);
  useEffect(() => {
    if (visible && isSearching !== prevSearchingRef.current) {
      playPageTransition(pageAnim);
    }
    prevSearchingRef.current = isSearching;
  }, [isSearching, visible, pageAnim]);

  //native back exits search mode, then lets parent close the drawer
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSearching) {
        Keyboard.dismiss();
        setIsSearching(false);
        setSearchQuery("");
        setSelectedSearchId(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [visible, isSearching]);

  useEffect(() => {
    if (!isSearching || searchQuery.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      DB.searchConversations(searchQuery).then(setSearchResults).catch(console.error);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, isSearching]);
  const panResponder = useMemo(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx < -10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        dragDrawer(progress, Math.max(0, Math.min(1, 1 + gestureState.dx / drawerWidth)));
      },
      onPanResponderRelease: (_, gestureState) => {
        const velocity = gestureVelocity(gestureState.vx, drawerWidth);
        if (gestureState.dx < -drawerWidth * 0.35 || gestureState.vx < -0.5) {
          settleDrawer(progress, false, velocity);
          onClose();
        } else {
          settleDrawer(progress, true, velocity);
        }
      },
      onPanResponderTerminate: () => {
        settleDrawer(progress, true);
      },
    })
    , [onClose, drawerWidth, progress]);

  const largeScreenAnim = useAnimatedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      //sync deferred past opening
      CloudSync.requestAutoSync(DRAWER_SYNC_DELAY_MS);
      Keyboard.dismiss();
      if (isDesktop) {
        settleLayoutDrawer(largeScreenAnim, true);
      } else {
        settleDrawer(progress, true);
      }
    } else {
      if (isDesktop) {
        settleLayoutDrawer(largeScreenAnim, false);
      } else {
        settleDrawer(progress, false);
      }
    }
  }, [visible, isDesktop, largeScreenAnim, progress]);

  //group only when list changes
  const { pinnedConversations, groups } = useMemo(() => {
    const pinned = conversations.filter(c => c.pinned);
    const grouped: { title: string; data: Conversation[] }[] = [];
    const groupMap = new Map<string, Conversation[]>();

    conversations.forEach(c => {
      const title = getGroupTitle(c.updatedAt, t);
      if (!groupMap.has(title)) {
        groupMap.set(title, []);
        grouped.push({ title, data: groupMap.get(title)! });
      }
      groupMap.get(title)!.push(c);
    });

    return { pinnedConversations: pinned, groups: grouped };
  }, [conversations, t]);

  const renderConversationRow = (conv: Conversation) => {
    const isSelected = conv.id === selectedConversationId;
    return (
      <View key={conv.id} style={[styles.discussionRow, isSelected && styles.discussionRowSelected]}>
        <Pressable
          style={({ pressed, hovered }) => [styles.discussionTextContainer, (pressed || hovered) && { opacity: 0.6 }]}
          onPress={() => {
            onSelectConversation(conv);
            onClose();
          }}
        >
          <Text
            style={[styles.discussionText, isSelected && styles.discussionTextSelected]}
            numberOfLines={1}
          >
            {conv.name}
          </Text>
        </Pressable>

        <View style={styles.rowActions}>
          {isSelected ? (
            <>
              <IconButton
                icon={shareIcon}
                label={t("common.share")}
                onPress={() => onShareConversation?.(conv)}
                size={22}
                tintColor={Colors.textOnPrimary}
                containerSize={32}
                pressedColor={Colors.overlayHover}
              />
              <IconButton
                icon={conv.pinned ? unpinIcon : pinIcon}
                label={conv.pinned ? t("common.unpin") : t("common.pin")}
                onPress={() => onTogglePinConversation?.(conv.id, !conv.pinned)}
                size={22}
                tintColor={Colors.textOnPrimary}
                containerSize={32}
                pressedColor={Colors.overlayHover}
              />
              <IconButton
                icon={deleteIcon}
                label={t("common.delete")}
                onPress={() => setDeleteConfirmId(conv.id)}
                size={22}
                tintColor={Colors.textOnPrimary}
                containerSize={32}
                pressedColor={Colors.overlayHover}
              />
            </>
          ) : (
            conv.pinned ? (
              <View style={styles.pinnedIndicator}>
                <Image source={pinIcon} style={styles.pinnedIcon} tintColor={Colors.textMuted} />
              </View>
            ) : null
          )}
        </View>
      </View>
    );
  };

  const searchContent = (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Pressable
          hitSlop={12}
          onPress={() => {
            Keyboard.dismiss();
            setIsSearching(false);
            setSearchQuery("");
            setSelectedSearchId(null);
          }}
          style={({ pressed, hovered }) => [styles.backButton, (pressed || hovered) && { opacity: 0.6 }]}
        >
          <Image source={arrowIcon} style={styles.backIcon} tintColor={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{t("conversations.search.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={{ marginBottom: 24 }}>
        <Group>
          <TextInputField
            icon={searchIcon}
            placeholder={t("conversations.search.placeholder")}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </Group>
      </View>

      <View style={styles.scrollListContainer}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>{t("conversations.search.results")}</Text>
          {searchResults.length === 0 && searchQuery.length > 0 ? (
            <Text style={styles.emptyText}>{t("conversations.search.empty")}</Text>
          ) : (
            searchResults.map((conv) => {
              const isSelected = conv.id === selectedSearchId;
              const formattedDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(conv.updatedAt));

              return (
                <View key={conv.id} style={[styles.discussionRow, isSelected && styles.discussionRowSelected]}>
                  <Pressable
                    style={({ pressed, hovered }) => [styles.discussionTextContainer, (pressed || hovered) && { opacity: 0.6 }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setSelectedSearchId(conv.id);
                      onSelectConversation(conv, searchQuery);
                      if (!isDesktop) onClose();
                    }}
                  >
                    <Text style={[styles.discussionText, isSelected && styles.discussionTextSelected]} numberOfLines={1}>
                      {conv.name}
                    </Text>
                  </Pressable>

                  <View style={styles.rowActions}>
                    {isSelected ? (
                      <>
                        <IconButton
                          icon={shareIcon}
                          label={t("common.share")}
                          onPress={() => onShareConversation?.(conv)}
                          size={22}
                          tintColor={Colors.textOnPrimary}
                          containerSize={32}
                          pressedColor={Colors.overlayHover}
                        />
                        <IconButton
                          icon={conv.pinned ? unpinIcon : pinIcon}
                          label={conv.pinned ? t("common.unpin") : t("common.pin")}
                          onPress={() => onTogglePinConversation?.(conv.id, !conv.pinned)}
                          size={22}
                          tintColor={Colors.textOnPrimary}
                          containerSize={32}
                          pressedColor={Colors.overlayHover}
                        />
                        <IconButton
                          icon={deleteIcon}
                          label={t("common.delete")}
                          onPress={() => setDeleteConfirmId(conv.id)}
                          size={22}
                          tintColor={Colors.textOnPrimary}
                          containerSize={32}
                          pressedColor={Colors.overlayHover}
                        />
                      </>
                    ) : (
                      <Text style={{ fontSize: FontSizes.label, color: Colors.textMuted, fontFamily: Fonts.mono }}>
                        {formattedDate}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
        <LinearGradient
          colors={[Colors.surface, Colors.surfaceFade, Colors.surfaceClear]}
          style={styles.gradientTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[Colors.surfaceClear, Colors.surfaceFade, Colors.surface]}
          style={styles.gradientBottom}
          pointerEvents="none"
        />
      </View>
    </View>
  );

  const innerContent = (
    <>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.title} numberOfLines={1}>{t("conversations.title")}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={({ pressed, hovered }) => [styles.backButton, (pressed || hovered) && { opacity: 0.6 }]}
        >
          <Image source={cancelIcon} style={styles.closeIcon} tintColor={Colors.textPrimary} />
        </Pressable>
      </View>

      <Group style={styles.quickActionsSpacing}>
        <ActionButton
          icon={newIcon}
          iconBadge
          label={t("conversations.new")}
          onPress={() => {
            onNewConversation();
            if (!isDesktop) onClose();
          }}
        />
        <ActionButton
          icon={searchIcon}
          iconBadge
          label={t("conversations.search.action")}
          onPress={() => setIsSearching(true)}
        />
      </Group>

      <View style={styles.scrollListContainer}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {conversations.length === 0 && (
            <Text style={styles.emptyText}>{t("conversations.empty")}</Text>
          )}

          {pinnedConversations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("conversations.pins")}</Text>
              {pinnedConversations.map(renderConversationRow)}
            </View>
          )}

          {groups.map((group) => (
            <View key={group.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{group.title}</Text>
              {group.data.map(renderConversationRow)}
            </View>
          ))}
        </ScrollView>
        <LinearGradient
          colors={[Colors.surface, Colors.surfaceFade, Colors.surfaceClear]}
          style={styles.gradientTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[Colors.surfaceClear, Colors.surfaceFade, Colors.surface]}
          style={styles.gradientBottom}
          pointerEvents="none"
        />
      </View>
    </>
  );

  const notificationModal = (
    <NotificationModal
      visible={!!deleteConfirmId}
      title={t("conversations.delete.title")}
      message={t("conversations.delete.message")}
      onClose={() => setDeleteConfirmId(null)}
      buttons={[
        {
          text: t("common.delete"),
          style: "secondary",
          onPress: () => {
            if (deleteConfirmId) {
              onDeleteConversation?.(deleteConfirmId);
            }
            setDeleteConfirmId(null);
          }
        },
        {
          text: t("common.cancel"),
          style: "danger",
          onPress: () => setDeleteConfirmId(null)
        },
      ]}
    />
  );

  if (isDesktop) {
    const largeScreenWidth = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 320]
    });
    const largeScreenMargin = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 16]
    });
    const largeScreenOpacity = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1]
    });

    return (
      <Animated.View style={[
        styles.largeScreenContainer,
        isDesktop ? styles.floatingContainer : styles.attachedContainer,
        {
          width: largeScreenWidth,
          opacity: largeScreenOpacity,
          marginLeft: isDesktop ? largeScreenMargin : 0,
          marginRight: isDesktop ? largeScreenMargin : 0,
          alignItems: 'flex-end',
        }
      ]}>
        <View style={{ width: 320, flex: 1 }}>
          <View style={isDesktop ? styles.floatingContent : styles.attachedContent}>
            <Animated.View style={{ flex: 1, opacity: pageAnim, transform: [{ translateY: pageAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
              {isSearching ? searchContent : innerContent}
            </Animated.View>
          </View>
        </View>
        {notificationModal}
      </Animated.View>
    );
  }

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
  });

  //settle before state change
  const dismiss = () => {
    settleDrawer(progress, false);
    onClose();
  };

  const mobileDrawer = (
    <View style={[styles.root, { pointerEvents: visible ? "auto" : "none" }]}>
      <Animated.View style={[styles.overlay, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      <Animated.View
        style={[styles.content, { width: drawerWidth }, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Animated.View style={{ flex: 1, opacity: pageAnim, transform: [{ translateY: pageAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
          {isSearching ? searchContent : innerContent}
        </Animated.View>
      </Animated.View>

      {notificationModal}
    </View>
  );

  return mobileDrawer;
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.scrimDrawer,
  },
  content: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Colors.surface,
    paddingTop: 60,
    paddingHorizontal: Spacing.lg2,
  },
  largeScreenContainer: {
    width: 320,
    backgroundColor: Colors.surface,
    zIndex: 10,
  },
  floatingContainer: {
    margin: 16,
    marginTop: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 40 : 8,
    marginBottom: 16,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    boxShadow: `-6px 6px 0px ${Colors.shadowInk}`,
    elevation: 5,
    overflow: "hidden",
  },
  attachedContainer: {
    borderRightWidth: 1,
    borderRightColor: Colors.overlaySubtle,
  },
  floatingContent: {
    paddingTop: 24,
    paddingHorizontal: Spacing.lg2,
    flex: 1,
  },
  attachedContent: {
    paddingTop: 60,
    paddingHorizontal: Spacing.lg2,
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xxxl,
    minHeight: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  backIcon: {
    width: 18,
    height: 18,
    transform: [{ rotate: "-180deg" }],
  },
  closeIcon: {
    width: 18,
    height: 18,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  title: {
    flex: 1,
    fontSize: FontSizes.xxxl,
    color: Colors.textPrimary,
    fontFamily: Fonts.display,
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: 40,
  },
  quickActionsSpacing: {
    marginBottom: Spacing.lg2,
    borderRadius: Radius.xxl + Spacing.md,
  },
  scrollListContainer: {
    flex: 1,
    position: "relative",
  },
  gradientTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 30,
    zIndex: 10,
  },
  gradientBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 10,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: FontSizes.label,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: FontSizes.bodyMd,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    textAlign: "center",
    marginTop: 20,
  },
  discussionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: Radius.xxl,
    marginBottom: 2,
    borderWidth: 2,
    borderColor: "transparent",
  },
  discussionRowSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
    paddingVertical: 4,
  },
  discussionTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  discussionText: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
  },
  discussionTextSelected: {
    color: Colors.textOnPrimary,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pinnedIndicator: {
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  pinnedIcon: {
    width: 22,
    height: 22,
    opacity: 0.5,
  },
});
