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
import SettingsDrawer from "../../components/SettingsDrawer";
import ModelDropdown from "../../components/ModelDropdown";
import TopBar from "../../components/TopBar";
import { SYSTEM_PROMPTS } from "../../constants/prompts";
import { AIModule } from "../services/ai/AIModule";
import { Conversation, DB, Message } from "../services/db/DatabaseService";
import { Settings } from "../services/settings/SettingsService";
import { Whisper } from "../services/whisper/WhisperService";

const butterflyImage = require("../../assets/images/butterfly5.png");
const butterflyGrey = require("../../assets/images/butterfly2_grey.png");
const texture2 = require("../../assets/images/texture2.png");
const settingsIcon = require("../../assets/icons/settings.png");

export default function Index() {
  const insets = useSafeAreaInsets();
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedReflection, setSelectedReflection] = useState("quick");
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [settingsDrawerVisible, setSettingsDrawerVisible] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [incognitoMode, setIncognitoMode] = useState(false);
  const [userInstruction, setUserInstruction] = useState("");
  const [aiService, setAiService] = useState("ollama");
  const [ollamaUrl, setOllamaUrl] = useState("");

  //conversation state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  //streaming assistant message id ref
  const streamingMsgIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>("");

  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  //ref to latest messages for handleSend
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  //init database and settings on mount
  useEffect(() => {
    const init = async () => {
      await DB.init();
      loadConversations();
      //load and apply settings
      try {
        await Settings.init();
        const s = await Settings.load();
        setUserInstruction(s.instruction);
        if (s.ollamaModel) {
          setSelectedModel(s.ollamaModel);
        }
        setAiService(s.aiService);
        setOllamaUrl(s.ollamaUrl);
        AIModule.configure(s.ollamaUrl);
        Whisper.setLanguage(s.whisperLanguage);
      } catch (e) {
        console.warn("Failed to load settings at boot", e);
      }
      
      setDbReady(true);
    };
    init();
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

  //generate title from first message
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

      setIsGenerating(true);
      abortControllerRef.current = new AbortController();

      //build system prompt with optional user instruction
      const systemPrompt = userInstruction.trim().length > 0
        ? `${userInstruction.trim()}\n\n---\n\n${SYSTEM_PROMPTS.DEFAULT}`
        : SYSTEM_PROMPTS.DEFAULT;

      //send to AI and stream chunks
      if (aiService === 'ollama' && (!ollamaUrl || ollamaUrl.trim() === '')) {
        streamingContentRef.current = "Ollama URL is undefined or invalid. Please check your settings.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: streamingContentRef.current }
              : m
          )
        );
        setIsGenerating(false);
        abortControllerRef.current = null;
      } else if (!selectedModel) {
        streamingContentRef.current = "Please select a model from the top menu before sending a message.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: streamingContentRef.current }
              : m
          )
        );
        setIsGenerating(false);
        abortControllerRef.current = null;
      } else {
        try {
          await AIModule.sendMessage(
            selectedModel,
            systemPrompt,
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
            abortControllerRef.current.signal,
            { think: selectedReflection === "think" }
          );
        } catch (e: any) {
          const isAborted = e.name === "AbortError" ||
            e.message?.toLowerCase().includes("aborted") ||
            e.message?.toLowerCase().includes("cancel");

          if (isAborted) {
            console.log("Generation aborted by user");
            streamingContentRef.current += "\n\n_The user interrupted the response_";
          } else {
            console.error(e);
            streamingContentRef.current = "Error generating response. Please check your model or server connection.";
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: streamingContentRef.current }
                : m
            )
          );
        } finally {
          setIsGenerating(false);
          abortControllerRef.current = null;
        }
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
    [dbReady, incognitoMode, activeConversation, selectedModel, selectedReflection, generateTitle, userInstruction]
  );

  if (!dbReady) {
    return <View style={styles.container} />;
  }

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

            </Pressable>
            <Text
              style={[
                styles.incognitoDescription,
                { opacity: incognitoMode ? 1 : 0 },
              ]}
            >
              Welcome to incognito mode. You can ask quick questions without leaving a trace. Once you close the window, your conversation disappears forever.
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

          <View style={[styles.topBarOverlay, { paddingTop: insets.top }]}>
            <TopBar
              onMenuPress={() => setDrawerVisible(true)}
              onNewPress={startNewConversation}
            >
              {aiService === "ollama" ? (
                <ModelDropdown
                  selectedModel={selectedModel}
                  selectedReflection={selectedReflection}
                  onModelChange={setSelectedModel}
                  onReflectionChange={setSelectedReflection}
                  rightElement={
                    <View style={styles.settingsShadowLayer}>
                      <View style={styles.settingsShadowBlock} />
                      <Pressable style={styles.settingsButton} onPress={() => setSettingsDrawerVisible(true)}>
                        <Image source={settingsIcon} style={styles.settingsIcon} />
                      </Pressable>
                    </View>
                  }
                />
              ) : (
                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <View style={styles.settingsShadowLayer}>
                      <View style={styles.settingsShadowBlock} />
                      <Pressable style={styles.settingsButton} onPress={() => setSettingsDrawerVisible(true)}>
                        <Image source={settingsIcon} style={styles.settingsIcon} />
                      </Pressable>
                    </View>
                </View>
              )}
            </TopBar>
          </View>

          {/* bottom bar overlay */}
          <View style={[styles.bottomBarOverlay, { paddingBottom: insets.bottom }]}>
            <ChatBar
              onSend={handleSend}
              onPlusPress={() => console.log("plus pressed")}
              incognito={incognitoMode}
              isGenerating={isGenerating}
              onStop={() => abortControllerRef.current?.abort()}
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

      <SettingsDrawer
        visible={settingsDrawerVisible}
        onClose={() => {
          setSettingsDrawerVisible(false);
          const cached = Settings.getCached();
          if (cached.ollamaModel && cached.ollamaModel !== selectedModel) {
            setSelectedModel(cached.ollamaModel);
          }
          setAiService(cached.aiService);
          setOllamaUrl(cached.ollamaUrl);
        }}
        onDataChanged={async () => {
          await loadConversations();
          startNewConversation();
        }}
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
    width: 250,
    height: 250,
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
  incognitoBox: {
    position: "relative",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
    zIndex: 1,
    marginTop: 20,
  },
  incognitoBoxActive: {
    backgroundColor: "#565A75",
    borderColor: "#565A75",
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
