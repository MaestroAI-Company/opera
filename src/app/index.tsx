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
const texture2 = require("../../assets/images/texture2.png");
const settingsIcon = require("../../assets/icons/settings.png");

export default function Index() {
  const insets = useSafeAreaInsets();
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedReflection, setSelectedReflection] = useState("quick");
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [dbReady, setDbReady] = useState(false);

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
      if (!dbReady) return;

      let conv = activeConversation;
      let isFirstMessage = false;

      //create conversation if this is the first message
      if (!conv) {
        isFirstMessage = true;
        //use first 30 chars of message as placeholder name
        const name = text.length > 30 ? text.slice(0, 30) + "…" : text;
        conv = await DB.createConversation(selectedModel || "unknown", name);
        setActiveConversation(conv);
        setConversations((prev) => [conv!, ...prev]);
      }

      //build history before updating state to avoid double-sending
      const history = messagesRef.current
        .filter((m) => m.content !== "…")
        .map((m) => ({ role: m.role, content: m.content }));

      //save user message
      const userMsg = await DB.addMessage(conv.id, "user", text);
      setMessages((prev) => [...prev, userMsg]);

      //create empty assistant message for streaming
      const assistantMsg = await DB.addMessage(conv.id, "assistant", "…");
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

      //save final assistant message content to db
      await DB.updateMessageContent(assistantMsg.id, streamingContentRef.current);
      //refresh conversation list (updatedAt changed)
      await loadConversations();

      //generate AI title for new conversations
      if (isFirstMessage && conv) {
        generateTitle(conv.id, text);
      }
    },
    [dbReady, activeConversation, selectedModel, selectedReflection, generateTitle]
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ImageBackground
        source={texture2}
        style={[styles.container, { paddingTop: insets.top }]}
        imageStyle={styles.backgroundTexture}
      >
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

        {/* welcome screen when no active conversation */}
        {!activeConversation ? (
          <View style={styles.centerContent}>
            <Image
              source={butterflyImage}
              style={styles.butterfly}
              resizeMode="contain"
            />
            <Text style={styles.welcomeText}>Welcome</Text>
          </View>
        ) : (
          //chat view over the welcome screen
          <ChatView messages={messages} />
        )}

        <View style={{ paddingBottom: insets.bottom }}>
          <ChatBar
            onSend={handleSend}
            onPlusPress={() => console.log("plus pressed")}
          />
        </View>

        <DrawerMenu
          visible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          conversations={conversations}
          selectedConversationId={activeConversation?.id ?? null}
          onSelectConversation={selectConversation}
          onNewConversation={startNewConversation}
        />
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
});
