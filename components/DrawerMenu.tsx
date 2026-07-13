import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Image, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { Conversation } from "../src/services/db/DatabaseService";

const operaLogo = require("../assets/icons/opera.png");

const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.82;

type DrawerMenuProps = {
  visible: boolean;
  onClose: () => void;
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conv: Conversation) => void;
  onNewConversation: () => void;
};

export default function DrawerMenu({
  visible,
  onClose,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
}: DrawerMenuProps) {
  const [rendered, setRendered] = useState(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
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
          tintColor="#E53935"
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
              <Text style={styles.quickActionIcon}>＋</Text>
              <Text style={styles.quickActionLabel}>New discussion</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.quickActionItem}>
              <Text style={styles.quickActionIcon}>⌕</Text>
              <Text style={styles.quickActionLabel}>Search</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Récents</Text>

        <ScrollView showsVerticalScrollIndicator={false}>
          {conversations.length === 0 && (
            <Text style={styles.emptyText}>Aucune conversation</Text>
          )}
          {conversations.map((conv) => {
            const isSelected = conv.id === selectedConversationId;
            return (
              <Pressable
                key={conv.id}
                onPress={() => {
                  onSelectConversation(conv);
                  onClose();
                }}
                style={[styles.discussionRow, isSelected && styles.discussionRowSelected]}
              >
                <Text
                  style={[styles.discussionText, isSelected && styles.discussionTextSelected]}
                  numberOfLines={1}
                >
                  {conv.name}
                </Text>
                <Text style={styles.discussionDate}>
                  {new Date(conv.updatedAt).toLocaleDateString("fr-FR")}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>
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
    fontSize: 18,
    color: "#333",
  },
  quickActionLabel: {
    fontSize: 15,
    color: "#222",
    fontFamily: "monospace",
  },
  sectionTitle: {
    fontSize: 12,
    color: "#888",
    fontFamily: "monospace",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#aaa",
    fontFamily: "monospace",
    textAlign: "center",
    marginTop: 20,
  },
  discussionRow: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 2,
  },
  discussionRowSelected: {
    backgroundColor: "#FFF0F0",
  },
  discussionText: {
    fontSize: 15,
    color: "#222",
    fontFamily: "monospace",
  },
  discussionTextSelected: {
    color: "#E53935",
    fontWeight: "600",
  },
  discussionDate: {
    fontSize: 11,
    color: "#aaa",
    fontFamily: "monospace",
    marginTop: 2,
  },
});
