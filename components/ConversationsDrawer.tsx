import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View, PanResponder, TextInput } from "react-native";
import { Conversation, DB } from "../src/services/db/DatabaseService";
import NotificationModal from "./NotificationModal";
import { useResponsive } from "../src/hooks/useResponsive";

const operaLogo = require("../assets/icons/opera.png");
const searchIcon = require("../assets/icons/search.png");
const newIcon = require("../assets/icons/add.png");
const deleteIcon = require("../assets/icons/delete.png");
const pinIcon = require("../assets/icons/pin.png");
const unpinIcon = require("../assets/icons/unpin.png");
const arrowIcon = require("../assets/icons/arrow.png");

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
    return `DATE (${dd}/${mm})`;
  } else {
    const yy = String(date.getFullYear()).slice(-2);
    return `DATE (${dd}/${mm}/${yy})`;
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
  const drawerWidth = Math.min(width * 0.88, 360);

  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Conversation[]>([]);
  const [selectedSearchId, setSelectedSearchId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setIsSearching(false);
      setSearchQuery("");
      setSearchResults([]);
      setSelectedSearchId(null);
    }
  }, [visible]);

  // Triggering Fast Refresh
  useEffect(() => {
    if (isSearching && searchQuery.trim().length > 0) {
      DB.searchConversations(searchQuery).then(setSearchResults).catch(console.error);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, isSearching]);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx < -20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50) {
          onClose();
        }
      },
    })
  ).current;

  const largeScreenAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      const anims = [];
      if (isDesktop) {
        anims.push(Animated.timing(largeScreenAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: false,
        }));
      } else {
        anims.push(
          Animated.timing(translateX, {
            toValue: 0,
            duration: 280,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: 280,
            useNativeDriver: Platform.OS !== "web",
          })
        );
      }
      Animated.parallel(anims).start();
    } else {
      const anims = [];
      if (isDesktop) {
        anims.push(Animated.timing(largeScreenAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }));
      } else {
        anims.push(
          Animated.timing(translateX, {
            toValue: -drawerWidth,
            duration: 250,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: Platform.OS !== "web",
          })
        );
      }
      Animated.parallel(anims).start();
    }
  }, [visible, isDesktop, drawerWidth]);

  //group conversations
  const pinnedConversations = conversations.filter(c => c.pinned);
  const groups: { title: string; data: Conversation[] }[] = [];
  const groupMap = new Map<string, Conversation[]>();

  conversations.forEach(c => {
    const title = getGroupTitle(c.updatedAt);
    if (!groupMap.has(title)) {
      groupMap.set(title, []);
      groups.push({ title, data: groupMap.get(title)! });
    }
    groupMap.get(title)!.push(c);
  });

  const renderConversationRow = (conv: Conversation) => {
    const isSelected = conv.id === selectedConversationId;
    return (
      <View key={conv.id} style={[styles.discussionRow, isSelected && styles.discussionRowSelected]}>
        <Pressable
          style={({ pressed }) => [styles.discussionTextContainer, pressed && { opacity: 0.6 }]}
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
                style={({ pressed }) => [styles.actionIconButton, pressed && { backgroundColor: "rgba(0, 0, 0, 0.15)" }]}
              >
                <Image source={conv.pinned ? unpinIcon : pinIcon} style={styles.actionIcon} tintColor="#fff" />
              </Pressable>
              <Pressable
                onPress={() => setDeleteConfirmId(conv.id)}
                style={({ pressed }) => [styles.actionIconButton, pressed && { backgroundColor: "rgba(0, 0, 0, 0.15)" }]}
              >
                <Image source={deleteIcon} style={styles.actionIcon} tintColor="#fff" />
              </Pressable>
            </>
          ) : (
            conv.pinned ? (
              <View style={styles.actionIconButton}>
                <Image source={pinIcon} style={[styles.actionIcon, { opacity: 0.5 }]} tintColor="#aaa" />
              </View>
            ) : null
          )}
        </View>
      </View>
    );
  };

  const searchContent = (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <Text style={{ fontFamily: "Recoleta-Regular", fontSize: 32 }}>Search</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <Pressable onPress={() => { Keyboard.dismiss(); setIsSearching(false); setSearchQuery(""); setSelectedSearchId(null); }} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Image source={arrowIcon} style={{ width: 24, height: 24, transform: [{ rotate: '-180deg' }] }} tintColor="#666" />
        </Pressable>

        <View style={styles.searchInputContainer}>
          <Image source={searchIcon} style={{ width: 16, height: 16, tintColor: "#999" }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            placeholderTextColor="#999"
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
                  style={({ pressed }) => [styles.discussionTextContainer, pressed && { opacity: 0.6 }]}
                  onPress={() => {
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
                        style={({ pressed }) => [styles.actionIconButton, pressed && { backgroundColor: "rgba(0, 0, 0, 0.15)" }]}
                      >
                        <Image source={conv.pinned ? unpinIcon : pinIcon} style={styles.actionIcon} tintColor="#fff" />
                      </Pressable>
                      <Pressable
                        onPress={() => setDeleteConfirmId(conv.id)}
                        style={({ pressed }) => [styles.actionIconButton, pressed && { backgroundColor: "rgba(0, 0, 0, 0.15)" }]}
                      >
                        <Image source={deleteIcon} style={styles.actionIcon} tintColor="#fff" />
                      </Pressable>
                    </>
                  ) : (
                    <Text style={{ fontSize: 12, color: "#888", fontFamily: "IBMPlexMono-Medium" }}>
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
      <Image
        source={operaLogo}
        style={styles.logo}
        resizeMode="contain"
        tintColor="#FF1A1A"
      />

      <View style={styles.quickActionsShadowLayer}>
        {!isDesktop && <View style={styles.quickActionsShadowBlock} />}
        <View style={styles.quickActionsBox}>
          <Pressable
            onPress={() => {
              onNewConversation();
              if (!isDesktop) onClose();
            }}
            style={({ pressed }) => [styles.quickActionItem, pressed && { backgroundColor: "#eaeaea" }]}
          >
            <Image source={newIcon} style={styles.quickActionIcon} />
            <Text style={styles.quickActionLabel}>New discussion</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsSearching(true)}
            style={({ pressed }) => [styles.quickActionItem, pressed && { backgroundColor: "#eaeaea" }]}
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

  const mobileDrawer = (
    <View style={[styles.root, { pointerEvents: visible ? "auto" : "none" }]}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  content: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#fff",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  largeScreenContainer: {
    width: 320,
    backgroundColor: "#fff",
    zIndex: 10,
  },
  floatingContainer: {
    margin: 16,
    marginTop: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 40 : 8,
    marginBottom: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    boxShadow: "-6px 6px 0px #00000013",
    elevation: 5,
    overflow: "hidden",
  },
  attachedContainer: {
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.05)",
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
  logo: {
    width: 160,
    height: 35,
    marginBottom: 24,
  },
  quickActionsShadowLayer: {
    position: "relative",
    marginBottom: 24,
  },
  quickActionsShadowBlock: {
    position: "absolute",
    top: 6,
    left: -6,
    right: 6,
    bottom: -6,
    backgroundColor: "#00000013",
    borderRadius: 10,
  },
  quickActionsBox: {
    position: "relative",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 10,
    backgroundColor: "#fff",
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
    fontSize: 15,
    color: "#222",
    fontFamily: "IBMPlexMono-Medium",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    color: "#888",
    fontFamily: "Jakarta",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#aaa",
    fontFamily: "Jakarta",
    textAlign: "center",
    marginTop: 20,
  },
  discussionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 2,
    borderWidth: 2,
    borderColor: "#ffffff52",
  },
  discussionRowSelected: {
    backgroundColor: "#FF1A1A",
  },
  discussionTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  discussionText: {
    fontSize: 15,
    color: "#000000ff",
    fontFamily: "IBMPlexMono-Medium",
  },
  discussionTextSelected: {
    color: "#ffffffff",
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
    borderRadius: 16,
  },
  actionIcon: {
    width: 20,
    height: 20,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "IBMPlexMono-Medium",
    color: "#000",
  },
});
