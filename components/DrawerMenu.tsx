import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Conversation } from "../src/services/db/DatabaseService";
import NotificationModal from "./NotificationModal";

const operaLogo = require("../assets/icons/opera.png");
const searchIcon = require("../assets/icons/search.png");
const newIcon = require("../assets/icons/add.png");
const deleteIcon = require("../assets/icons/delete.png");
const pinIcon = require("../assets/icons/pin.png");
const unpinIcon = require("../assets/icons/unpin.png");

const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.88;

type DrawerMenuProps = {
  visible: boolean;
  onClose: () => void;
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conv: Conversation) => void;
  onNewConversation: () => void;
  onDeleteConversation?: (id: string) => void;
  onTogglePinConversation?: (id: string, pinned: boolean) => void;
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

export default function DrawerMenu({
  visible,
  onClose,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onTogglePinConversation,
}: DrawerMenuProps) {
  const [rendered, setRendered] = useState(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setRendered(true);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start((result) => {
        if (result.finished) {
          setRendered(false);
        }
      });
    }
  }, [visible]);

  if (!rendered) return null;

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
          style={styles.discussionTextContainer}
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
                style={styles.actionIconButton}
              >
                <Image source={conv.pinned ? unpinIcon : pinIcon} style={[styles.actionIcon, { tintColor: "#fff" }]} />
              </Pressable>
              <Pressable 
                onPress={() => setDeleteConfirmId(conv.id)} 
                style={styles.actionIconButton}
              >
                <Image source={deleteIcon} style={[styles.actionIcon, { tintColor: "#fff" }]} />
              </Pressable>
            </>
          ) : (
            conv.pinned ? (
              <View style={styles.actionIconButton}>
                <Image source={pinIcon} style={[styles.actionIcon, { tintColor: "#aaa", opacity: 0.5 }]} />
              </View>
            ) : null
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.content, { transform: [{ translateX }] }]}>
        <Image
          source={operaLogo}
          style={styles.logo}
          resizeMode="contain"
          tintColor="#FF1A1A"
        />

        <View style={styles.quickActionsShadowLayer}>
          <View style={styles.quickActionsShadowBlock} />
          <View style={styles.quickActionsBox}>
            <Pressable
              onPress={() => {
                onNewConversation();
                onClose();
              }}
              style={styles.quickActionItem}
            >
              <Image source={newIcon} style={styles.quickActionIcon} />
              <Text style={styles.quickActionLabel}>New discussion</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.quickActionItem}>
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
      </Animated.View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
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
    width: DRAWER_WIDTH,
    backgroundColor: "#fff",
    paddingTop: 60,
    paddingHorizontal: 24,
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
    borderRadius: 5,
  },
  quickActionsBox: {
    position: "relative",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 5,
    paddingVertical: 4,
    backgroundColor: "#fff",
    zIndex: 1,
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
    fontFamily: "monospace",
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
    fontFamily: "monospace",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#aaa",
    fontFamily: "monospace",
    textAlign: "center",
    marginTop: 20,
  },
  discussionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 2,
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
    fontFamily: "monospace",
  },
  discussionTextSelected: {
    color: "#ffffffff",
    fontWeight: "600",
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionIconButton: {
    padding: 4,
  },
  actionIcon: {
    width: 16,
    height: 16,
  },
});
