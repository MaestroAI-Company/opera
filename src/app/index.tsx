import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ChatBar from "../../components/ChatBar";
import ChatView from "../../components/ChatView";
import DrawerMenu from "../../components/DrawerMenu";
import ModelDropdown from "../../components/ModelDropdown";
import TopBar from "../../components/TopBar";
import { SYSTEM_PROMPTS } from "../../constants/prompts";
import { AIModule } from "../services/ai/AIModule";
import { Conversation, DB, Message } from "../services/db/DatabaseService";

const butterflyImage = require("../../assets/images/butterfly2.png");
const butterflyGrey = require("../../assets/images/butterfly2_grey.png");
const texture2 = require("../../assets/images/texture2.png");
const settingsIcon = require("../../assets/icons/settings.png");

export default function Index() {
  const insets = useSafeAreaInsets();
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedReflection, setSelectedReflection] = useState("quick");
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [incognitoMode, setIncognitoMode] = useState(false);

  //conversation state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  //streaming assistant message id ref
  const streamingMsgIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>("");

  //keep a ref to the latest messages so handleSend always sees fresh data
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  //init database on mount
  useEffect(() => {
    DB.init().then(() => {
      setDbReady(true);
      loadConversations();
    });
  }, []);

  const loadConversations = async () => {
    const convs = await DB.getConversations();
    setConversations(convs);
  };

  //load messages when a conversation is selected
  const selectConversation = useCallback(async (conv: Conversation) => {
    setActiveConversation(conv);
    const msgs = await DB.getMessages(conv.id);
    setMessages(msgs);
  }, []);

  //start a new empty conversation (reset to welcome screen)
  const startNewConversation = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
  }, []);

  //generate a title from the first user message using the AI
  const generateTitle = useCallback(
    async (convId: string, userMessage: string) => {
      try {
        let title = "";
        await AIModule.sendMessage(
          selectedModel,
          SYSTEM_PROMPTS.SUMMARIZE,
          [{ role: "user", content: userMessage }],
          (chunk) => { title += chunk; },
        );
        const cleaned = title.trim();
        if (cleaned.length > 0) {
          await DB.renameConversation(convId, cleaned);
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, name: cleaned } : c))
          );
          setActiveConversation((prev) =>
            prev && prev.id === convId ? { ...prev, name: cleaned } : prev
          );
        }
      } catch (e) {
        console.error("Failed to generate title:", e);
      }
    },
    [selectedModel]
  );

  //send a message — creates conversation on first send
  const handleSend = useCallback(
    async (text: string) => {
      if (!dbReady && !incognitoMode) return;

      let conv = activeConversation;
      let isFirstMessage = false;

      //create conversation if this is the first message
      if (!conv) {
        isFirstMessage = true;
        const name = text.length > 30 ? text.slice(0, 30) + "…" : text;
        if (incognitoMode) {
          conv = {
            id: "incognito_" + Date.now(),
            name,
            model: selectedModel || "unknown",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        } else {
          conv = await DB.createConversation(selectedModel || "unknown", name);
          setConversations((prev) => [conv!, ...prev]);
        }
        setActiveConversation(conv);
      }

      //build history before updating state to avoid double-sending
      const history = messagesRef.current
        .filter((m) => m.content !== "…")
        .map((m) => ({ role: m.role, content: m.content }));

      //save user message
      let userMsg: Message;
      if (incognitoMode) {
        userMsg = {
          id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          conversationId: conv.id,
          role: "user",
          content: text,
          createdAt: Date.now(),
        };
      } else {
        userMsg = await DB.addMessage(conv.id, "user", text);
      }
      setMessages((prev) => [...prev, userMsg]);

      //create empty assistant message for streaming
      let assistantMsg: Message;
      if (incognitoMode) {
        assistantMsg = {
          id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          conversationId: conv.id,
          role: "assistant",
          content: "…",
          createdAt: Date.now(),
        };
      } else {
        assistantMsg = await DB.addMessage(conv.id, "assistant", "…");
      }
      streamingMsgIdRef.current = assistantMsg.id;
      streamingContentRef.current = "";
      setMessages((prev) => [...prev, assistantMsg]);

      //send to AI and stream chunks
      try {
        await AIModule.sendMessage(
          selectedModel,
          SYSTEM_PROMPTS.DEFAULT,
          [...history, { role: "user", content: text }],
          async (chunk) => {
            streamingContentRef.current += chunk;
            //update message in state
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: streamingContentRef.current }
                  : m
              )
            );
          },
          undefined,
          { think: selectedReflection === "think" }
        );
      } catch (e) {
        console.error(e);
        streamingContentRef.current = "Erreur lors de la réponse.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: streamingContentRef.current }
              : m
          )
        );
      }

      if (!incognitoMode) {
        //save final assistant message content to db
        await DB.updateMessageContent(assistantMsg.id, streamingContentRef.current);
        //refresh conversation list (updatedAt changed)
        await loadConversations();
      }

      //generate AI title for new conversations
      if (isFirstMessage && conv && !incognitoMode) {
        generateTitle(conv.id, text);
      }
    },
    [dbReady, incognitoMode, activeConversation, selectedModel, selectedReflection, generateTitle]
  );

  return (
    <View style={styles.container}>
      <ImageBackground
        source={texture2}
        style={StyleSheet.absoluteFill}
        imageStyle={styles.backgroundTexture}
      >
        {!activeConversation && (
          <View style={styles.centerContent}>
            <Image
              source={incognitoMode ? butterflyGrey : butterflyImage}
              style={styles.butterfly}
              resizeMode="contain"
            />
            <Text style={styles.welcomeText}>Welcome</Text>
            <Pressable
              onPress={() => setIncognitoMode((prev) => !prev)}
            >
              <View style={styles.incognitoShadowLayer}>
                <View style={styles.incognitoShadowBlock} />
                <View
                  style={[
                    styles.incognitoBox,
                    incognitoMode && styles.incognitoBoxActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.incognitoButtonText,
                      incognitoMode && styles.incognitoButtonTextActive,
                    ]}
                  >
                    {incognitoMode
                      ? "Disable incognito mode"
                      : "Enable incognito mode"}
                  </Text>
                </View>
              </View>
            </Pressable>
            <Text
              style={[
                styles.incognitoDescription,
                { opacity: incognitoMode ? 1 : 0 },
              ]}
            >
              Welcome to incognito mode. You can ask quick questions without leaving a trace. Once you close the window, your conversation disappears forever and won't be used to train our AI.
            </Text>
          </View>
        )}
      </ImageBackground>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={{ flex: 1, backgroundColor: "transparent" }}>
          {activeConversation && (
            <ChatView
              messages={messages}
              conversation={activeConversation}
              contentTopPadding={insets.top + 72}
              contentBottomPadding={88 + insets.bottom}
            />
          )}

          {/* top bar overlay */}
          <View style={[styles.topBarOverlay, { paddingTop: insets.top }]}>
            <TopBar
              onMenuPress={() => setDrawerVisible(true)}
              onNewPress={startNewConversation}
            >
              <ModelDropdown
                selectedModel={selectedModel}
                selectedReflection={selectedReflection}
                onModelChange={setSelectedModel}
                onReflectionChange={setSelectedReflection}
                rightElement={
                  <View style={styles.settingsShadowLayer}>
                    <View style={styles.settingsShadowBlock} />
                    <Pressable style={styles.settingsButton}>
                      <Image source={settingsIcon} style={styles.settingsIcon} />
                    </Pressable>
                  </View>
                }
              />
            </TopBar>
          </View>

          {/* bottom bar overlay */}
          <View style={[styles.bottomBarOverlay, { paddingBottom: insets.bottom }]}>
            <ChatBar
              onSend={handleSend}
              onPlusPress={() => console.log("plus pressed")}
              incognito={incognitoMode}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      <DrawerMenu
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        conversations={conversations}
        selectedConversationId={activeConversation?.id ?? null}
        onSelectConversation={selectConversation}
        onNewConversation={startNewConversation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF5EC",
  },
  backgroundTexture: {
    opacity: 0.02,
    resizeMode: "cover",
  },
  topBarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  bottomBarOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
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
  settingsShadowLayer: {
    position: "relative",
    marginLeft: 6,
  },
  settingsShadowBlock: {
    position: "absolute",
    top: 4,
    left: -4,
    right: 4,
    height: 44,
    backgroundColor: "#00000013",
    borderRadius: 5,
  },
  settingsButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 5,
    position: "relative",
    zIndex: 1,
  },
  settingsIcon: {
    width: 18,
    height: 18,
  },
  incognitoShadowLayer: {
    position: "relative",
    marginTop: 20,
  },
  incognitoShadowBlock: {
    position: "absolute",
    top: 6,
    left: -6,
    right: 6,
    bottom: -6,
    backgroundColor: "#00000013",
    borderRadius: 5,
  },
  incognitoBox: {
    position: "relative",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
    zIndex: 1,
  },
  incognitoBoxActive: {
    backgroundColor: "#FF1A1A",
    borderColor: "#FF1A1A",
  },
  incognitoButtonText: {
    fontSize: 14,
    color: "#222",
    fontFamily: "monospace",
    textAlign: "center",
  },
  incognitoButtonTextActive: {
    color: "#fff",
  },
  incognitoDescription: {
    marginTop: 14,
    fontSize: 12,
    color: "#999",
    fontFamily: "monospace",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 300,
    alignSelf: "center",
  },
});
