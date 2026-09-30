import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, Image, Keyboard, NativeScrollEvent, NativeSyntheticEvent, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
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
import { conversationsProgress, dragDrawer, drawerWidthFor, gestureVelocity, releaseOpens, settleDrawer, settleLayoutDrawer } from "./drawerAnimation";
import DrawerBackButton from "./DrawerBackButton";
import PageStack from "./PageStack";
import { pressStyle } from "../ui/pressStyle";

const searchIcon = require("../../../assets/icons/search.png");
const newIcon = require("../../../assets/icons/add.png");
const deleteIcon = require("../../../assets/icons/delete.png");
const shareIcon = require("../../../assets/icons/share.png");
const pinIcon = require("../../../assets/icons/pin.png");
const unpinIcon = require("../../../assets/icons/unpin.png");

const DRAWER_SYNC_DELAY_MS = 1500;

//docked desktop panel, resized from its right border
const DOCKED_WIDTH = 320;
const DOCKED_MIN_WIDTH = 240;
const DOCKED_MAX_WIDTH = 480;

//cursor holds while the pointer leaves the thin handle
function setPageCursor(cursor: string) {
  document.body.style.cursor = cursor;
}

type DrawerPage = "list" | "search";
const drawerPageParent = (page: DrawerPage) => (page === "search" ? "list" : null);

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
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    //a morph while sliding out would show
    if (!visible) return;
    setIsScrolled(false);
  }, [isSearching, visible]);

  //detect scroll to morph close button
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrolled = e.nativeEvent.contentOffset.y > 10;
    setIsScrolled((prev) => (prev !== scrolled ? scrolled : prev));
  }, []);

  //search clears before paint on open, never while sliding out
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setIsSearching(false);
      setSearchQuery("");
      setSearchResults([]);
      setSelectedSearchId(null);
    }
  }

  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    //search input stays mounted while closing, it would keep the keyboard
    if (!visible && wasVisibleRef.current) Keyboard.dismiss();
    wasVisibleRef.current = visible;
  }, [visible]);

  //query is reset on entry so results stay while the page slides out
  const enterSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSelectedSearchId(null);
    setIsSearching(true);
  };
  const exitSearch = useCallback(() => {
    Keyboard.dismiss();
    setIsSearching(false);
  }, []);

  //native back exits search mode, then lets parent close the drawer
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSearching) {
        exitSearch();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [visible, isSearching, exitSearch]);

  useEffect(() => {
    if (!isSearching) return;
    if (searchQuery.trim().length === 0) {
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
        dragDrawer(progress, 1 + gestureState.dx / drawerWidth);
      },
      onPanResponderRelease: (_, gestureState) => {
        const open = releaseOpens(1 + gestureState.dx / drawerWidth, gestureState.vx);
        settleDrawer(progress, open, gestureVelocity(gestureState.vx, drawerWidth));
        if (!open) onClose();
      },
      onPanResponderTerminate: () => {
        settleDrawer(progress, true);
      },
    })
    , [onClose, drawerWidth, progress]);

  const largeScreenAnim = useAnimatedValue(visible ? 1 : 0);
  const [dockedWidth, setDockedWidth] = useState(DOCKED_WIDTH);
  //panel starts at the window edge, so the pointer x is its width
  const resizeResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      //widgets and message text would otherwise take the drag over
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        //the mousedown default starts a text selection
        e.preventDefault();
        setPageCursor("col-resize");
      },
      onPanResponderMove: (_, gestureState) => {
        setDockedWidth(Math.min(DOCKED_MAX_WIDTH, Math.max(DOCKED_MIN_WIDTH, gestureState.moveX)));
      },
      onPanResponderRelease: () => setPageCursor(""),
      onPanResponderTerminate: () => setPageCursor(""),
    })
    , []);

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
      //reset once the close settles
      const reset = () => setIsSearching(false);
      if (isDesktop) {
        settleLayoutDrawer(largeScreenAnim, false, reset);
      } else {
        settleDrawer(progress, false, undefined, undefined, reset);
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
          style={pressStyle(styles.discussionTextContainer, "fade")}
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
    <View style={{ flex: 1, paddingTop: isDesktop ? Spacing.lg : 60 }}>
      <View style={styles.header}>
        <DrawerBackButton kind="back" onPress={exitSearch} pulseKey="search" />
        <Text style={styles.title} numberOfLines={1}>{t("conversations.search.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.contentCard}>
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
        {/* results under the keyboard stay reachable */}
        <KeyboardAwareScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
                    style={pressStyle(styles.discussionTextContainer, "fade")}
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
        </KeyboardAwareScrollView>
        {/* docked desktop panel scrolls to its edges without fades */}
        {!isDesktop && (
          <>
            <LinearGradient
              colors={[Colors.groupedBackground, Colors.groupedBackgroundFade, Colors.groupedBackgroundClear]}
              style={styles.gradientTop}
              pointerEvents="none"
            />
            <LinearGradient
              colors={[Colors.groupedBackgroundClear, Colors.groupedBackgroundFade, Colors.groupedBackground]}
              style={styles.gradientBottom}
              pointerEvents="none"
            />
          </>
        )}
      </View>
    </View>
  );

  const innerContent = (
    <View style={styles.scrollListContainer}>
      {/* docked desktop panel toggles from the top bar */}
      {!isDesktop && (
        <View style={[styles.fixedCloseWrapper, { top: 60 }]} pointerEvents="box-none">
          <DrawerBackButton kind="close" onPress={onClose} scrolled={isScrolled} />
        </View>
      )}

      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        //desktop title level with the top bar buttons
        contentContainerStyle={{ paddingTop: isDesktop ? Spacing.lg : 60, paddingBottom: 40 }}
      >
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.title} numberOfLines={1}>{t("conversations.title")}</Text>
          <View style={styles.headerSpacer} />
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
            onPress={enterSearch}
          />
        </Group>

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
      {!isDesktop && (
        <>
          <LinearGradient
            colors={[Colors.groupedBackground, Colors.groupedBackgroundFade, Colors.groupedBackgroundClear]}
            style={styles.screenGradientTop}
            pointerEvents="none"
          />
          <LinearGradient
            colors={[Colors.groupedBackgroundClear, Colors.groupedBackgroundFade, Colors.groupedBackground]}
            style={styles.screenGradientBottom}
            pointerEvents="none"
          />
        </>
      )}
    </View>
  );

  const pages = (
    <PageStack
      page={isSearching ? "search" : "list"}
      visible={visible}
      width={isDesktop ? dockedWidth : drawerWidth}
      parentOf={drawerPageParent}
      onBack={exitSearch}
      renderPage={(page) => (page === "search" ? searchContent : innerContent)}
    />
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
      outputRange: [0, dockedWidth]
    });
    const largeScreenOpacity = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1]
    });

    return (
      <Animated.View style={[
        styles.largeScreenContainer,
        {
          width: largeScreenWidth,
          opacity: largeScreenOpacity,
          alignItems: 'flex-end',
        }
      ]}>
        <View style={[styles.dockedPanel, { width: dockedWidth }]}>
          <View style={styles.dockedContent}>
            {pages}
          </View>
        </View>
        <View
          //rn types only know pointer, the web takes any css cursor
          style={[styles.resizeHandle, { cursor: "col-resize" } as any]}
          {...resizeResponder.panHandlers}
        />
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
        {pages}
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
    backgroundColor: Colors.groupedBackground,
    paddingHorizontal: Spacing.lg2,
    //pushed pages stay inside the panel
    overflow: "hidden",
  },
  largeScreenContainer: {
    backgroundColor: Colors.groupedBackground,
    zIndex: 10,
    overflow: "hidden",
  },
  //border rides the inner panel so a closed drawer takes no width
  dockedPanel: {
    flex: 1,
    borderRightWidth: 2,
    borderRightColor: Colors.border,
  },
  //sits over the border
  resizeHandle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: 8,
  },
  dockedContent: {
    //clears the tauri title bar
    paddingTop: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 32 : 0,
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
  contentCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl + Spacing.md,
    borderWidth: 0,
    padding: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  quickActionsSpacing: {
    marginBottom: Spacing.xxl,
    borderRadius: Radius.xxl + Spacing.md,
    borderWidth: 0,
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
  screenGradientTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    zIndex: 10,
  },
  screenGradientBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    zIndex: 10,
  },
  fixedCloseWrapper: {
    position: "absolute",
    right: 0,
    zIndex: 100,
    elevation: 10,
    width: 40,
    height: 40,
  },
  scrollContent: {
    paddingTop: 30,
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
    paddingHorizontal: Spacing.lg,
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
