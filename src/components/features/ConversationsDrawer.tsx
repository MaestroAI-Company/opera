import { useEffect, useState, useMemo } from "react";
import { Animated, BackHandler, Image, Keyboard, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useResponsive } from "../../hooks/useResponsive";
import { Conversation, DB } from "../../services/db/DatabaseService";
import { CloudSync } from "../../services/CloudSyncService";
import NotificationModal from "../ui/NotificationModal";
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { conversationsProgress, dragDrawer, drawerWidthFor, gestureVelocity, settleDrawer, settleLayoutDrawer } from "./drawerAnimation";

const searchIcon = require("../../../assets/icons/search.png");
const newIcon = require("../../../assets/icons/add.png");
const deleteIcon = require("../../../assets/icons/delete.png");
const pinIcon = require("../../../assets/icons/pin.png");
const unpinIcon = require("../../../assets/icons/unpin.png");
const arrowIcon = require("../../../assets/icons/arrow.png");

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
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//format group title based on date
function getGroupTitle(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffTime = startOfToday - timestamp;

  if (diffTime <= 0) return "LAST DISCUSSION";

  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "1 day ago";
  if (diffDays === 2) return "2 day ago";
  if (diffDays === 3) return "3 day ago";

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
  isLargeScreen = false,
  isDesktop = false,
}: ConversationsDrawerProps) {
  const { width } = useResponsive();
  const drawerWidth = drawerWidthFor(width);

  //one value drives slide and scrim
  const progress = conversationsProgress;
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Conversation[]>([]);
  const [selectedSearchId, setSelectedSearchId] = useState<string | null>(null);

  useEffect(() => {
    //reset only when needed
    if (!visible && (isSearching || searchQuery !== "" || selectedSearchId !== null)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsSearching(false);
      setSearchQuery("");
      setSearchResults([]);
      setSelectedSearchId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      return;
    }
    //debounce full-text queries
    const timer = setTimeout(() => {
      DB.searchConversations(searchQuery).then(setSearchResults).catch(console.error);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, isSearching]);
  //useMemo read during render
  const panResponder = useMemo(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx < -10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        //panel tracks the finger
        dragDrawer(progress, Math.max(0, Math.min(1, 1 + gestureState.dx / drawerWidth)));
      },
      onPanResponderRelease: (_, gestureState) => {
        //settle here keeps flick speed
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
      const title = getGroupTitle(c.updatedAt);
      if (!groupMap.has(title)) {
        groupMap.set(title, []);
        grouped.push({ title, data: groupMap.get(title)! });
      }
      groupMap.get(title)!.push(c);
    });

    return { pinnedConversations: pinned, groups: grouped };
  }, [conversations]);

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
              <Pressable
                onPress={() => onTogglePinConversation?.(conv.id, !conv.pinned)}
                style={({ pressed, hovered }) => [styles.actionIconButton, (pressed || hovered) && { backgroundColor: Colors.overlay }]}
              >
                <Image source={conv.pinned ? unpinIcon : pinIcon} style={styles.actionIcon} tintColor={Colors.surface} />
              </Pressable>
              <Pressable
                onPress={() => setDeleteConfirmId(conv.id)}
                style={({ pressed, hovered }) => [styles.actionIconButton, (pressed || hovered) && { backgroundColor: Colors.overlay }]}
              >
                <Image source={deleteIcon} style={styles.actionIcon} tintColor={Colors.surface} />
              </Pressable>
            </>
          ) : (
            conv.pinned ? (
              <View style={styles.actionIconButton}>
                <Image source={pinIcon} style={[styles.actionIcon, { opacity: 0.5 }]} tintColor={Colors.textMuted} />
              </View>
            ) : null
          )}
        </View>
      </View>
    );
  };

  const searchContent = (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={styles.title}>Search</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <Pressable onPress={() => { Keyboard.dismiss(); setIsSearching(false); setSearchQuery(""); setSelectedSearchId(null); }} style={({ pressed, hovered }) => [(pressed || hovered) && { opacity: 0.6 }]}>
          <Image source={arrowIcon} style={{ width: 18, height: 18, transform: [{ rotate: '-180deg' }] }} tintColor={Colors.textPrimary} />
        </Pressable>

        <View style={styles.searchInputContainer}>
          <Image source={searchIcon} style={{ width: 16, height: 16, tintColor: Colors.textPrimary }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>RESULTS</Text>
        {searchResults.length === 0 && searchQuery.length > 0 ? (
          <Text style={styles.emptyText}>No results found</Text>
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
                      <Pressable
                        onPress={() => onTogglePinConversation?.(conv.id, !conv.pinned)}
                        style={({ pressed, hovered }) => [styles.actionIconButton, (pressed || hovered) && { backgroundColor: Colors.overlay }]}
                      >
                        <Image source={conv.pinned ? unpinIcon : pinIcon} style={styles.actionIcon} tintColor={Colors.surface} />
                      </Pressable>
                      <Pressable
                        onPress={() => setDeleteConfirmId(conv.id)}
                        style={({ pressed, hovered }) => [styles.actionIconButton, (pressed || hovered) && { backgroundColor: Colors.overlay }]}
                      >
                        <Image source={deleteIcon} style={styles.actionIcon} tintColor={Colors.surface} />
                      </Pressable>
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
    </View>
  );

  const innerContent = (
    <>
      <Text style={styles.title}>Discussions</Text>

      <View style={styles.quickActionsShadowLayer}>
        <View style={styles.quickActionsBox}>
          <Pressable
            onPress={() => {
              onNewConversation();
              if (!isDesktop) onClose();
            }}
            style={({ pressed, hovered }) => [styles.quickActionItem, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
          >
            <Image source={newIcon} style={styles.quickActionIcon} />
            <Text style={styles.quickActionLabel}>New discussion</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsSearching(true)}
            style={({ pressed, hovered }) => [styles.quickActionItem, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
          >
            <Image source={searchIcon} style={styles.quickActionIcon} />
            <Text style={styles.quickActionLabel}>Search</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {conversations.length === 0 && (
          <Text style={styles.emptyText}>No conversation</Text>
        )}

        {pinnedConversations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PINS</Text>
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
    </>
  );

  const notificationModal = (
    <NotificationModal
      visible={!!deleteConfirmId}
      title="Delete Conversation"
      message="Are you sure you want to delete this conversation? This action cannot be undone."
      onClose={() => setDeleteConfirmId(null)}
      buttons={[
        {
          text: "Cancel",
          style: "secondary",
          onPress: () => setDeleteConfirmId(null)
        },
        {
          text: "Delete",
          style: "danger",
          onPress: () => {
            if (deleteConfirmId) {
              onDeleteConversation?.(deleteConfirmId);
            }
            setDeleteConfirmId(null);
          }
        }
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
            {isSearching ? searchContent : innerContent}
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
        {isSearching ? searchContent : innerContent}
      </Animated.View>

      {notificationModal}
    </View>
  );

  return mobileDrawer;
}

const styles = StyleSheet.create({
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
    paddingHorizontal: 16,
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
    paddingHorizontal: 16,
    flex: 1,
  },
  attachedContent: {
    paddingTop: 60,
    paddingHorizontal: 16,
    flex: 1,
  },
  title: {
    fontSize: FontSizes.xxxl,
    color: Colors.textSecondary,
    marginBottom: 24,
    fontFamily: Fonts.display,
  },
  quickActionsShadowLayer: {
    position: "relative",
    marginBottom: 24,
  },
  quickActionsBox: {
    position: "relative",
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.surface,
    zIndex: 1,
    overflow: "hidden",
  },
  quickActionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  quickActionIcon: {
    width: 18,
    height: 18,
  },
  quickActionLabel: {
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
  },
  scrollContent: {
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
    letterSpacing: 1,
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
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: Radius.xxl,
    marginBottom: 2,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
  },
  discussionRowSelected: {
    backgroundColor: Colors.primary,
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
    color: Colors.surface,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionIconButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Radius.huge,
  },
  actionIcon: {
    width: 18,
    height: 18,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    fontFamily: Fonts.mono,
    color: Colors.textPrimary,
  },
});
