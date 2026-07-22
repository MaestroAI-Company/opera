import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  BackHandler,
  Image,
  ImageBackground,
  Keyboard,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  AppState,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ChatBar from "../../components/ChatBar";
import ChatView from "../../components/ChatView";
import ConversationsDrawer from "../../components/ConversationsDrawer";
import ModelDropdown from "../../components/ModelDropdown";
import SettingsDrawer from "../../components/SettingsDrawer";
import SearchWebView from "../../components/SearchWebView";
import TopBar from "../../components/TopBar";
import { SYSTEM_PROMPTS } from "../../constants/prompts";
import { AIModule } from "../services/ai/AIModule";
import { Conversation, DB, Message } from "../services/db/DatabaseService";
import { NotificationService } from '../services/notifications/NotificationService';
import { Settings } from "../services/settings/SettingsService";
import { Whisper } from "../services/whisper/WhisperService";
import { useResponsive } from "../hooks/useResponsive";


const butterflyImage = require("../../assets/images/butterfly5.png");
const butterflyGrey = require("../../assets/images/butterfly2_grey.png");
const texture2 = require("../../assets/images/texture2.png");
const settingsIcon = require("../../assets/icons/settings.png");

export default function Index() {
  const insets = useSafeAreaInsets();
  const { isLargeScreen, isDesktop } = useResponsive();
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedReflection, setSelectedReflection] = useState("none");
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [settingsDrawerVisible, setSettingsDrawerVisible] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  
  const { convId } = useLocalSearchParams<{ convId?: string }>();
  const [incognitoMode, setIncognitoMode] = useState(false);
  const [userInstruction, setUserInstruction] = useState("");
  const [aiService, setAiService] = useState("ollama");
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [speakerEnabled, setSpeakerEnabled] = useState(false);
  const [modelCapabilities, setModelCapabilities] = useState<string[]>([]);
  const [alwaysWhisper, setAlwaysWhisper] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);

  //conversation state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  //streaming assistant message id ref
  const streamingMsgIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>("");

  const [generatingConvId, setGeneratingConvId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  //refs for background processing
  const activeConversationRef = useRef<Conversation | null>(null);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    const handleBackButton = () => {
      //close drawers on android back press
      if (settingsDrawerVisible) {
        setSettingsDrawerVisible(false);
        return true;
      }
      if (drawerVisible) {
        setDrawerVisible(false);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackButton
    );

    return () => backHandler.remove();
  }, [drawerVisible, settingsDrawerVisible]);

  const [pendingConvIds, setPendingConvIds] = useState<string[]>([]);
  const requestQueueRef = useRef<{ convId: string, task: () => Promise<void>, assistantMsgId: string, isIncognito: boolean }[]>([]);
  const isProcessingRef = useRef(false);
  const generatingConvIdRef = useRef<string | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const isLeftEdge = gestureState.x0 < 40;
        const isSwipeRight = gestureState.dx > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        return isLeftEdge && isSwipeRight;
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 40) {
          setDrawerVisible(true);
        }
      },
    })
  ).current;

  const processQueue = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    while (requestQueueRef.current.length > 0) {
      const item = requestQueueRef.current.shift();
      setPendingConvIds([...requestQueueRef.current.map(i => i.convId)]);
      if (item) {
        await item.task();
      }
    }

    isProcessingRef.current = false;
    setGeneratingConvId(null);
    generatingConvIdRef.current = null;
    streamingMsgIdRef.current = null;
  };

  //ref to latest messages for handleSend
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  // Synchronize with shared generation from overlay
  useEffect(() => {
    return AIModule.SharedGenerationState.subscribe(() => {
      const activeState = AIModule.SharedGenerationState;
      if (activeState.activeConvId && activeConversationRef.current?.id === activeState.activeConvId) {
        if (generatingConvIdRef.current !== activeState.activeConvId) {
          setGeneratingConvId(activeState.activeConvId);
          generatingConvIdRef.current = activeState.activeConvId;
          streamingMsgIdRef.current = activeState.activeMsgId;
        }
        streamingContentRef.current = activeState.content;
        setMessages((prev) => {
          const msgExists = prev.some(m => m.id === activeState.activeMsgId);
          if (!msgExists) return prev;
          return prev.map((m) =>
            m.id === activeState.activeMsgId
              ? { ...m, content: activeState.content }
              : m
          );
        });
      } else if (!activeState.activeConvId && generatingConvIdRef.current === activeConversationRef.current?.id && !isProcessingRef.current) {
        setGeneratingConvId(null);
        generatingConvIdRef.current = null;
        streamingMsgIdRef.current = null;
        if (activeConversationRef.current) {
          DB.getMessages(activeConversationRef.current.id).then(setMessages);
        }
      }
    });
  }, []);

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
        setSpeakerEnabled(s.speaker);
        setAlwaysWhisper(s.alwaysWhisper);
        AIModule.configure(s.ollamaUrl);
        Whisper.setLanguage(s.whisperLanguage);
      } catch (e) {
        console.warn("Failed to load settings at boot", e);
      }

      setDbReady(true);
    };
    init();
  }, []);

  //fetch model capabilities when selectedModel changes
  useEffect(() => {
    const fetchCapabilities = async () => {
      if (selectedModel && aiService === "ollama") {
        const caps = await AIModule.getModelCapabilities(selectedModel);
        setModelCapabilities(caps);
      } else {
        setModelCapabilities([]);
      }
    };
    fetchCapabilities();
  }, [selectedModel, aiService, ollamaUrl]);

  const loadConversations = async () => {
    const convs = await DB.getConversations();
    setConversations(convs);
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && dbReady) {
        loadConversations();
        if (activeConversationRef.current) {
          DB.getMessages(activeConversationRef.current.id).then((msgs) => {
            // keep streaming content if generating
            if (generatingConvIdRef.current === activeConversationRef.current?.id && streamingMsgIdRef.current) {
              const patched = msgs.map(m => m.id === streamingMsgIdRef.current ? { ...m, content: streamingContentRef.current || "…" } : m);
              setMessages(patched);
            } else {
              setMessages(msgs);
            }
          });
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [dbReady]);

  //load messages when a conversation is selected
  const selectConversation = useCallback(async (conv: Conversation) => {
    setActiveConversation(conv);
    const msgs = await DB.getMessages(conv.id);

    if (generatingConvIdRef.current === conv.id && streamingMsgIdRef.current) {
      const patched = msgs.map(m => m.id === streamingMsgIdRef.current ? { ...m, content: streamingContentRef.current || "…" } : m);
      setMessages(patched);
    } else {
      setMessages(msgs);
    }
  }, []);

  //select conversation from cold start deep link
  useEffect(() => {
    if (convId && conversations.length > 0 && dbReady) {
      const target = conversations.find(c => c.id === convId);
      if (target && target.id !== activeConversationRef.current?.id) {
        selectConversation(target);
      }
    }
  }, [convId, conversations, dbReady, selectConversation]);

  //select conversation from warm start deep link
  useEffect(() => {
    if (!dbReady) return;
    const handleUrl = ({ url }: { url: string }) => {
      try {
        const parsed = new URL(url);
        const id = parsed.searchParams.get('convId');
        if (id) {
          // load conversations first
          DB.getConversations().then(convs => {
            const target = convs.find(c => c.id === id);
            if (target) selectConversation(target);
          });
        }
      } catch {}
    };
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, [dbReady, selectConversation]);

  //start new empty conversation
  const startNewConversation = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
  }, []);

  //toggle pin conversation
  const togglePinConversation = useCallback(async (convId: string, pinned: boolean) => {
    await DB.togglePinConversation(convId, pinned);
    setConversations((prev) =>
      prev.map(c => c.id === convId ? { ...c, pinned: pinned ? 1 : 0 } : c)
    );
    if (activeConversation?.id === convId) {
      setActiveConversation(prev => prev ? { ...prev, pinned: pinned ? 1 : 0 } : prev);
    }
  }, [activeConversation]);

  //delete conversation
  const deleteConversation = useCallback(async (convId: string) => {
    await DB.deleteConversation(convId);
    setConversations((prev) => prev.filter(c => c.id !== convId));
    if (activeConversation?.id === convId) {
      startNewConversation();
    }
  }, [activeConversation, startNewConversation]);

  //generate title from first message
  const generateTitle = useCallback(
    async (convId: string, userMessage: string, images?: string[]) => {
      try {
        let title = "";
        await AIModule.sendMessage(
          selectedModel,
          SYSTEM_PROMPTS.SUMMARIZE,
          [{ role: "user", content: userMessage, images }],
          (chunk) => { title += chunk; },
          undefined,
          { think: false }
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
    async (text: string, images?: string[]) => {
      if (!dbReady && !incognitoMode) return;

      let conv = activeConversation;
      let isFirstMessage = false;
      const isIncognitoTask = conv ? conv.id.startsWith("incognito_") : incognitoMode;

      //create conversation if this is the first message
      if (!conv) {
        isFirstMessage = true;
        const name = text.length > 30 ? text.slice(0, 30) + "…" : text;
        if (isIncognitoTask) {
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

      //save user message immediately
      let userMsg: Message;
      if (isIncognitoTask) {
        userMsg = {
          id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          conversationId: conv.id,
          role: "user",
          content: text,
          createdAt: Date.now(),
        };
      } else {
        userMsg = await DB.addMessage(conv.id, "user", text, images);
      }

      //attach images to incognito message as well if needed
      if (images && images.length > 0) {
        userMsg.images = images;
      }

      if (isFirstMessage || activeConversationRef.current?.id === conv.id) {
        setMessages((prev) => [...prev, userMsg]);
      }

      //build history for this task
      const taskHistory = messagesRef.current
        .filter((m) => m.content !== "…")
        .map((m) => ({ role: m.role, content: m.content, images: m.images }));
      taskHistory.push({ role: "user", content: text, images });

      const taskSelectedModel = selectedModel;
      const taskOllamaUrl = ollamaUrl;
      const taskAiService = aiService;
      const taskSystemPrompt = userInstruction.trim().length > 0
        ? `${userInstruction.trim()}\n\n---\n\n${SYSTEM_PROMPTS.DEFAULT}`
        : SYSTEM_PROMPTS.DEFAULT;
      const taskReflection = selectedReflection;
      const taskConv = conv;

      //create empty assistant message for streaming immediately
      let assistantMsg: Message;
      if (isIncognitoTask) {
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

      if (isFirstMessage || activeConversationRef.current?.id === conv.id) {
        setMessages((prev) => [...prev, assistantMsg]);
      }

      const task = async () => {
        setGeneratingConvId(taskConv.id);
        generatingConvIdRef.current = taskConv.id;

        streamingMsgIdRef.current = assistantMsg.id;
        streamingContentRef.current = "";

        abortControllerRef.current = new AbortController();

        let isError = false;

        //send to AI and stream chunks
        if (!taskSelectedModel) {
          isError = true;
          streamingContentRef.current = "Please select a model from the top menu before sending a message.";
          if (activeConversationRef.current?.id === taskConv.id) {
            setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: streamingContentRef.current } : m));
          }
          abortControllerRef.current = null;
        } else {
          try {
            await AIModule.sendMessageWithTools(
              taskSelectedModel,
              taskSystemPrompt,
              taskHistory,
              async (chunk) => {
                streamingContentRef.current += chunk;
                //update message in state if we are on this conversation
                if (activeConversationRef.current?.id === taskConv.id) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: streamingContentRef.current }
                        : m
                    )
                  );
                }
              },
              abortControllerRef.current.signal,
              { think: taskReflection === "none" ? false : taskReflection }
            );
          } catch (e: any) {
            const isAborted = e.name === "AbortError" ||
              e.message?.toLowerCase().includes("aborted") ||
              e.message?.toLowerCase().includes("cancel");

            if (isAborted) {
              console.log("Generation aborted by user");
              streamingContentRef.current += "\n\n_The user interrupted the response_";
            } else {
              isError = true;
              console.error(e);
              streamingContentRef.current = "Error generating response. Please check your model or server connection.";
            }

            if (activeConversationRef.current?.id === taskConv.id) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: streamingContentRef.current }
                    : m
                )
              );
            }
          } finally {
            abortControllerRef.current = null;
          }
        }

        if (!isIncognitoTask) {
          if (isError) {
            if (isFirstMessage) {
              await DB.deleteConversation(taskConv.id);
            } else {
              await DB.deleteMessage(userMsg.id);
              await DB.deleteMessage(assistantMsg.id);
            }
          } else {
            //save final assistant message content to db
            await DB.updateMessageContent(assistantMsg.id, streamingContentRef.current);
            //refresh conversation list (updatedAt changed)
            await loadConversations();
          }
        }

        //generate AI title for new conversations
        if (isFirstMessage && !isIncognitoTask && !isError) {
          generateTitle(taskConv.id, text, images);
        }
      };

      requestQueueRef.current.push({
        convId: conv.id,
        task,
        assistantMsgId: assistantMsg.id,
        isIncognito: isIncognitoTask
      });
      setPendingConvIds([...requestQueueRef.current.map(i => i.convId)]);
      processQueue();
    },
    [dbReady, incognitoMode, activeConversation, selectedModel, selectedReflection, generateTitle, userInstruction, aiService, ollamaUrl]
  );

  //encode arraybuffer to base64 without btoa (hermes safe)
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const parts: string[] = [];
    const len = bytes.length;
    for (let i = 0; i < len; i += 3) {
      const a = bytes[i];
      const b = i + 1 < len ? bytes[i + 1] : 0;
      const c = i + 2 < len ? bytes[i + 2] : 0;
      parts.push(
        chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)] +
        (i + 1 < len ? chars[((b & 15) << 2) | (c >> 6)] : '=') +
        (i + 2 < len ? chars[c & 63] : '=')
      );
    }
    return parts.join('');
  };

  //transcribe audio: use remote model if it supports audio and user hasnt forced whisper
  const handleTranscribe = useCallback(async (wavBuffer: ArrayBuffer): Promise<string | null> => {
    const useRemote = !alwaysWhisper && modelCapabilities.includes("audio") && selectedModel;
    if (!useRemote) {
      //fallback to whisper on-device
      return Whisper.transcribeData(wavBuffer);
    }
    try {
      //encode wav as data uri 
      const base64Audio = 'data:audio/wav;base64,' + arrayBufferToBase64(wavBuffer);

      //send to remote model with TRANSCRIBE prompt
      let transcription = '';
      await AIModule.sendMessage(
        selectedModel,
        SYSTEM_PROMPTS.TRANSCRIBE,
        [{ role: 'user', content: 'Transcribe this audio.', images: [base64Audio] }],
        (chunk) => { transcription += chunk; },
        undefined,
        { think: false }
      );
      return transcription.trim() || null;
    } catch (e) {
      console.error('Remote transcription failed, falling back to Whisper:', e);
      return Whisper.transcribeData(wavBuffer);
    }
  }, [alwaysWhisper, modelCapabilities, selectedModel]);

  const handleRegenerate = useCallback(async (aiMessageId: string) => {
    if (!activeConversation) return;

    if (generatingConvId === activeConversation.id) {
      abortControllerRef.current?.abort();
    }

    const msgIndex = messagesRef.current.findIndex(m => m.id === aiMessageId);
    if (msgIndex === -1) return;

    const historyUpToHere = messagesRef.current.slice(0, msgIndex);
    const taskHistory = historyUpToHere
      .filter((m) => m.content !== "…")
      .map((m) => ({ role: m.role, content: m.content, images: m.images }));

    const messagesToDelete = messagesRef.current.slice(msgIndex);

    if (!incognitoMode) {
      for (const m of messagesToDelete) {
        await DB.deleteMessage(m.id);
      }
    }
    setMessages([...historyUpToHere]);

    const taskSelectedModel = selectedModel;
    const taskOllamaUrl = ollamaUrl;
    const taskAiService = aiService;
    const taskSystemPrompt = userInstruction.trim().length > 0
      ? `${userInstruction.trim()}\n\n---\n\n${SYSTEM_PROMPTS.DEFAULT}`
      : SYSTEM_PROMPTS.DEFAULT;
    const taskReflection = selectedReflection;
    const taskConv = activeConversation;
    const isIncognitoTask = taskConv.id.startsWith("incognito_");

    let assistantMsg: Message;
    if (isIncognitoTask) {
      assistantMsg = {
        id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        conversationId: taskConv.id,
        role: "assistant",
        content: "…",
        createdAt: Date.now(),
      };
    } else {
      assistantMsg = await DB.addMessage(taskConv.id, "assistant", "…");
    }

    setMessages((prev) => [...prev.filter(m => m.id !== aiMessageId), assistantMsg]);

    const task = async () => {
      setGeneratingConvId(taskConv.id);
      generatingConvIdRef.current = taskConv.id;
      streamingMsgIdRef.current = assistantMsg.id;
      streamingContentRef.current = "";
      abortControllerRef.current = new AbortController();
      let isError = false;

      if (!taskSelectedModel) {
        isError = true;
        streamingContentRef.current = "Please select a model from the top menu before sending a message.";
        if (activeConversationRef.current?.id === taskConv.id) {
          setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: streamingContentRef.current } : m));
        }
        abortControllerRef.current = null;
      } else {
        try {
          await AIModule.sendMessageWithTools(
            taskSelectedModel,
            taskSystemPrompt,
            taskHistory,
            async (chunk) => {
              streamingContentRef.current += chunk;
              if (activeConversationRef.current?.id === taskConv.id) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: streamingContentRef.current }
                      : m
                  )
                );
              }
            },
            abortControllerRef.current.signal,
            { think: taskReflection === "none" ? false : taskReflection }
          );
        } catch (e: any) {
          const isAborted = e.name === "AbortError" || e.message?.toLowerCase().includes("aborted") || e.message?.toLowerCase().includes("cancel");
          if (isAborted) {
            streamingContentRef.current += "\n\n_The user interrupted the response_";
          } else {
            isError = true;
            streamingContentRef.current = "Error generating response. Please check your model or server connection.";
          }
          if (activeConversationRef.current?.id === taskConv.id) {
            setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: streamingContentRef.current } : m));
          }
        } finally {
          abortControllerRef.current = null;
        }
      }

      if (!isIncognitoTask) {
        if (isError) {
          await DB.deleteMessage(assistantMsg.id);
        } else {
          await DB.updateMessageContent(assistantMsg.id, streamingContentRef.current);
          await loadConversations();
        }
      }
    };

    requestQueueRef.current.push({
      convId: taskConv.id,
      task,
      assistantMsgId: assistantMsg.id,
      isIncognito: isIncognitoTask
    });
    setPendingConvIds([...requestQueueRef.current.map(i => i.convId)]);
    processQueue();

  }, [activeConversation, generatingConvId, incognitoMode, selectedModel, ollamaUrl, aiService, userInstruction, selectedReflection]);

  const handleStop = useCallback(async () => {
    const currentConvId = activeConversation?.id;
    if (!currentConvId) return;

    if (generatingConvId === currentConvId) {
      abortControllerRef.current?.abort();
    } else if (pendingConvIds.includes(currentConvId)) {
      //cancel all pending tasks for this conversation
      const tasksToCancel = requestQueueRef.current.filter(i => i.convId === currentConvId);
      requestQueueRef.current = requestQueueRef.current.filter(i => i.convId !== currentConvId);
      setPendingConvIds([...requestQueueRef.current.map(i => i.convId)]);

      for (const item of tasksToCancel) {
        if (!item.isIncognito) {
          await DB.updateMessageContent(item.assistantMsgId, "\n\n_The user interrupted the response_");
        }
      }
      setMessages(prev => prev.map(m => {
        if (tasksToCancel.some(t => t.assistantMsgId === m.id)) {
          return { ...m, content: "\n\n_The user interrupted the response_" };
        }
        return m;
      }));
    }
  }, [activeConversation, generatingConvId, pendingConvIds]);

  if (!dbReady) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={texture2}
        style={StyleSheet.absoluteFill}
        imageStyle={styles.backgroundTexture} resizeMode="cover"
      />
      <KeyboardAvoidingView 
        style={[styles.container, { backgroundColor: "transparent" }]} 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        enabled={!settingsDrawerVisible && (isLargeScreen || !drawerVisible)}
        {...(isLargeScreen ? {} : panResponder.panHandlers)}
      >

      <View style={{ flex: 1, flexDirection: isLargeScreen ? "row" : "column" }} pointerEvents="box-none">
        <ConversationsDrawer
          isLargeScreen={isLargeScreen}
          isDesktop={isDesktop}
          visible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          conversations={conversations}
          selectedConversationId={activeConversation?.id ?? null}
          onSelectConversation={selectConversation}
          onNewConversation={startNewConversation}
          onDeleteConversation={deleteConversation}
          onTogglePinConversation={togglePinConversation}
        />

        <View style={{ flex: 1, backgroundColor: "transparent" }} pointerEvents="box-none">
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
                style={({ pressed }) => [
                  styles.incognitoBox,
                  incognitoMode && styles.incognitoBoxActive,
                  pressed && (incognitoMode ? { backgroundColor: "#3e4157" } : { backgroundColor: "#eaeaea" })
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

          {activeConversation && (
            <ChatView
              messages={messages}
              conversation={activeConversation}
              contentTopPadding={insets.top + 72}
              contentBottomPadding={88 + insets.bottom}
              incognito={activeConversation.id.startsWith("incognito_")}
              onRegenerate={handleRegenerate}
              speakerEnabled={speakerEnabled}
              generatingMessageId={generatingConvId === activeConversation.id ? streamingMsgIdRef.current : null}
            />
          )}

          <View style={[styles.topBarOverlay, { 
            paddingTop: insets.top + (
              (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) 
                ? (navigator.userAgent.includes("Linux") && !navigator.userAgent.includes("Android") ? 0 : 32) 
                : 0
            ),
            zIndex: attachmentSheetVisible ? 200 : undefined,
          }]} pointerEvents="box-none">
            <TopBar
              onMenuPress={() => {
                Keyboard.dismiss();
                setDrawerVisible(prev => !prev);
              }}
              onNewPress={startNewConversation}
              isLargeScreen={isLargeScreen}
              isDesktop={isDesktop}
              centerElement={
                aiService === "ollama" ? (
                  <ModelDropdown
                    selectedModel={selectedModel}
                    selectedReflection={selectedReflection}
                    showReflection={modelCapabilities.includes("thinking")}
                    onModelChange={(model) => {
                      setSelectedModel(model);
                      Settings.set("ollamaModel", model);
                    }}
                    onReflectionChange={setSelectedReflection}
                  />
                ) : null
              }
              rightElement={
                <View style={styles.settingsShadowLayer}>
                  <View style={styles.settingsShadowBlock} />
                  <Pressable
                    style={({ pressed }) => {
                      const showText = isDesktop;
                      return [
                        styles.settingsButton, 
                        pressed && { backgroundColor: "#eaeaea" },
                        !showText && { paddingHorizontal: 0, width: 44 }
                      ];
                    }}
                    onPress={() => {
                      Keyboard.dismiss();
                      if (settingsDrawerVisible) {
                        const cached = Settings.getCached();
                        if (cached.ollamaModel && cached.ollamaModel !== selectedModel) {
                          setSelectedModel(cached.ollamaModel);
                        }
                        setAiService(cached.aiService);
                        setOllamaUrl(cached.ollamaUrl);
                        setSpeakerEnabled(cached.speaker);
                        setAlwaysWhisper(cached.alwaysWhisper);
                      }
                      setSettingsDrawerVisible(!settingsDrawerVisible);
                    }}
                  >
                    <Image 
                      source={settingsIcon} 
                      style={[styles.settingsIcon, !isDesktop && { marginRight: 0 }]} 
                    />
                    {isDesktop && (
                      <Text style={styles.settingsButtonText}>Settings</Text>
                    )}
                  </Pressable>
                </View>
              }
            />
          </View>

          {/* bottom bar overlay */}
          <View style={[styles.bottomBarOverlay]} pointerEvents="box-none">
            <ChatBar
              onSend={handleSend}
              onPlusPress={() => console.log("plus pressed")}
              incognito={activeConversation ? activeConversation.id.startsWith("incognito_") : incognitoMode}
              isGenerating={activeConversation ? (generatingConvId === activeConversation.id || pendingConvIds.includes(activeConversation.id)) : false}
              onStop={handleStop}
              onTranscribe={handleTranscribe}
              canTranscribeRemotely={!alwaysWhisper && modelCapabilities.includes("audio") && !!selectedModel}
              supportsFiles={modelCapabilities.includes("vision") || modelCapabilities.includes("audio")}
              onOpenSettings={() => {
                Keyboard.dismiss();
                setSettingsDrawerVisible(true);
              }}
              onAttachmentSheetVisibilityChange={setAttachmentSheetVisible}
              enabled={!settingsDrawerVisible && (isLargeScreen || !drawerVisible)}
            />
          </View>
        </View>

        <SettingsDrawer
          isLargeScreen={isLargeScreen}
          isDesktop={isDesktop}
          visible={settingsDrawerVisible}
          onClose={() => {
            setSettingsDrawerVisible(false);
            const cached = Settings.getCached();
            if (cached.ollamaModel && cached.ollamaModel !== selectedModel) {
              setSelectedModel(cached.ollamaModel);
            }
            setAiService(cached.aiService);
            setOllamaUrl(cached.ollamaUrl);
            setSpeakerEnabled(cached.speaker);
            setAlwaysWhisper(cached.alwaysWhisper);
          }}
          onDataChanged={async () => {
            await loadConversations();
            startNewConversation();
          }}
        />
      </View>
      </KeyboardAvoidingView>

      <SearchWebView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF5EC",
  },
  backgroundTexture: { opacity: 0.02 },
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
    zIndex: 100,
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
    fontSize: 34,
    color: "#333",
    letterSpacing: 1,
    fontFamily: "Petrona",
    marginVertical: 20,
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
    borderRadius: 10,
  },
  settingsButton: {
    height: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 10,
    position: "relative",
    zIndex: 1,
  },
  settingsIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
  },
  settingsButtonText: {
    fontSize: 14,
    fontFamily: "IBMPlexMono-Medium",
    color: "#333",
  },
  incognitoBox: {
    position: "relative",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    zIndex: 1,
    marginTop: 20,
  },
  incognitoBoxActive: {
    backgroundColor: "#565A75",
    borderColor: "#565A75",
  },
  incognitoButtonText: {
    fontSize: 13,
    color: "#222",
    fontFamily: "IBMPlexMono-Medium",
    textAlign: "center",
  },
  incognitoButtonTextActive: {
    color: "#fff",
  },
  incognitoDescription: {
    marginTop: 14,
    fontSize: 12,
    color: "#999",
    fontFamily: "Jakarta",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 300,
    alignSelf: "center",
  },
});
