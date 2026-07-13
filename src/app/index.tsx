import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ChatBar from "../../components/ChatBar";

// Assets
const butterflyImage = require("../../assets/images/butterfly2.png");
const maestroIcon = require("../../assets/icons/maestroicon.png");
const operaLogo = require("../../assets/icons/opera.png");
const texture2 = require("../../assets/images/texture2.png");

const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.82;

const MODELS = [
  { id: "maestro", label: "Maestro" },
  { id: "maestro-large", label: "Maestro-large" },
];

const DISCUSSIONS = [
  { id: "1", title: "Discussion 1" },
  { id: "2", title: "Discussion 2" },
  { id: "3", title: "Discussion 3" },
  { id: "4", title: "Discussion 4" },
];

export default function Index() {
  const insets = useSafeAreaInsets();

  //state for model selection
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [selectedModel, setSelectedModel] = useState("maestro");
  const currentModel = MODELS.find((m) => m.id === selectedModel) || MODELS[0];

  //state & animation for drawer menu
  const [drawerVisible, setDrawerVisible] = useState(false);
  //track if drawer should be rendered in layout
  const [drawerRendered, setDrawerRendered] = useState(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (drawerVisible) {
      setDrawerRendered(true);
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
          setDrawerRendered(false);
        }
      });
    }
  }, [drawerVisible]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
    <ImageBackground source={texture2} style={[styles.container, { paddingTop: insets.top }]} imageStyle={styles.backgroundTexture}>
      {/* top bar */}
      <View style={styles.topBar}>
        {/* left actions */}
        <View style={styles.topBarLeftGroup}>
          <View style={styles.topButtonShadowLayer}>
            <View style={styles.topButtonShadowBlock} />
            <Pressable
              onPress={() => setDrawerVisible(true)}
              style={styles.topBarSquareButton}
            >
              <Text style={styles.topBarButtonLabel}>☰</Text>
            </Pressable>
          </View>
        </View>

        {/* model selector dropdown */}
        <View>
          <View style={styles.modelSelectorShadowLayer}>
            <View style={styles.modelSelectorShadowBlock} />
            <Pressable onPress={() => setDropdownVisible(true)} style={styles.dropdownTrigger}>
              <Image source={maestroIcon} style={styles.dropdownIcon} />
              <Text style={styles.dropdownLabel}>{currentModel.label}</Text>
              <Text style={styles.dropdownChevron}>▾</Text>
            </Pressable>
          </View>

          <Modal
            visible={dropdownVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setDropdownVisible(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setDropdownVisible(false)}
            >
              <View style={styles.dropdownMenu}>
                <FlatList
                  data={MODELS}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setSelectedModel(item.id);
                        setDropdownVisible(false);
                      }}
                      style={[
                        styles.dropdownOption,
                        item.id === selectedModel && styles.dropdownOptionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          item.id === selectedModel && styles.dropdownOptionTextSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>
            </Pressable>
          </Modal>
        </View>

        {/* right button */}
        <View style={styles.topButtonShadowLayer}>
          <View style={styles.topButtonShadowBlock} />
          <Pressable onPress={() => { }} style={styles.topBarSquareButton}>
            <Text style={styles.topBarButtonLabel}>＋</Text>
          </Pressable>
        </View>
      </View>

      {/* main content */}
      <View style={styles.centerContent}>
        <Image
          source={butterflyImage}
          style={styles.butterfly}
          resizeMode="contain"
        />
        <Text style={styles.welcomeText}>Welcome</Text>
      </View>

      {/* bottom chat bar */}
      <View style={{ paddingBottom: insets.bottom }}>
        <ChatBar
          onSend={(msg) => console.log("send:", msg)}
          onPlusPress={() => console.log("plus pressed")}
        />
      </View>

      {/* drawer menu overlay */}
      <View
        style={[
          styles.drawerRoot,
          !drawerRendered && { display: "none" }
        ]}
        pointerEvents={drawerVisible ? "auto" : "none"}
      >
        <Animated.View style={[styles.drawerOverlay, { opacity: overlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDrawerVisible(false)} />
        </Animated.View>

        <Animated.View
          style={[styles.drawerContent, { transform: [{ translateX }] }]}
        >
          {/* opera logo */}
          <Image
            source={operaLogo}
            style={styles.drawerLogo}
            resizeMode="contain"
            tintColor="#E53935"
          />

          {/* quick actions */}
          <View style={styles.drawerQuickActionsShadowLayer}>
            <View style={styles.drawerQuickActionsShadowBlock} />
            <View style={styles.drawerQuickActionsBox}>
              <Pressable onPress={() => setDrawerVisible(false)} style={styles.drawerQuickActionItem}>
                <Text style={styles.drawerQuickActionIcon}>＋</Text>
                <Text style={styles.drawerQuickActionLabel}>New discussion</Text>
              </Pressable>
              <Pressable onPress={() => setDrawerVisible(false)} style={styles.drawerQuickActionItem}>
                <Text style={styles.drawerQuickActionIcon}>⌕</Text>
                <Text style={styles.drawerQuickActionLabel}>Search</Text>
              </Pressable>
            </View>
          </View>

          {/* discussion list */}
          <Text style={styles.drawerSectionTitle}>Récents</Text>
          {DISCUSSIONS.map((d) => (
            <Pressable
              key={d.id}
              onPress={() => {
                setDrawerVisible(false);
                console.log("Discussion selected:", d.id);
              }}
              style={styles.drawerDiscussionRow}
            >
              <Text style={styles.drawerDiscussionText}>{d.title}</Text>
            </Pressable>
          ))}
        </Animated.View>
      </View>
    </ImageBackground>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF5EC",
  },
  backgroundTexture: {
    opacity: 0.01,
    resizeMode: "cover",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  topBarLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  topButtonShadowLayer: {
    position: "relative",
    width: 36,
    height: 36,
  },
  topButtonShadowBlock: {
    position: "absolute",
    top: 4,
    left: -4,
    width: 36,
    height: 36,
    backgroundColor: "#00000013",
    borderRadius: 5,
  },
  topBarSquareButton: {
    position: "relative",
    width: 36,
    height: 36,
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    zIndex: 1,
  },
  topBarButtonLabel: {
    fontSize: 18,
    color: "#333",
  },
  modelSelectorShadowLayer: {
    position: "relative",
  },
  modelSelectorShadowBlock: {
    position: "absolute",
    top: 4,
    left: -4,
    right: 4,
    bottom: -4,
    backgroundColor: "#00000013",
    borderRadius: 5,
  },
  dropdownTrigger: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#00000017",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    gap: 6,
    zIndex: 1,
  },
  dropdownIcon: {
    width: 18,
    height: 18,
  },
  dropdownLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
    fontFamily: "monospace",
  },
  dropdownChevron: {
    fontSize: 12,
    color: "#666",
    marginLeft: 2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 100,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  dropdownMenu: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
    width: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownOptionSelected: {
    backgroundColor: "#FFF0F0",
  },
  dropdownOptionText: {
    fontSize: 15,
    color: "#333",
    fontFamily: "monospace",
  },
  dropdownOptionTextSelected: {
    color: "#FF1A1A",
    fontWeight: "600",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  butterfly: {
    width: 180,
    height: 160,
    marginBottom: 16,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: "300",
    color: "#333",
    letterSpacing: 1,
  },
  //drawer styles
  drawerRoot: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  drawerContent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#fff",
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  drawerLogo: {
    width: 160,
    height: 35,
    marginBottom: 24,
  },
  drawerQuickActionsShadowLayer: {
    position: "relative",
    marginBottom: 24,
  },
  drawerQuickActionsShadowBlock: {
    position: "absolute",
    top: 6,
    left: -6,
    right: 6,
    bottom: -6,
    backgroundColor: "#00000013",
    borderRadius: 5,
  },
  drawerQuickActionsBox: {
    position: "relative",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 5,
    paddingVertical: 4,
    backgroundColor: "#fff",
    zIndex: 1,
  },
  drawerQuickActionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  drawerQuickActionIcon: {
    fontSize: 18,
    color: "#333",
  },
  drawerQuickActionLabel: {
    fontSize: 15,
    color: "#222",
    fontFamily: "monospace",
  },
  drawerSectionTitle: {
    fontSize: 12,
    color: "#888",
    fontFamily: "monospace",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  drawerDiscussionRow: {
    paddingVertical: 10,
  },
  drawerDiscussionText: {
    fontSize: 15,
    color: "#222",
    fontFamily: "monospace",
  },
});
