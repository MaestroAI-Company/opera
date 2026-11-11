import { useCameraPermissions } from "expo-camera";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import type { MessageMetrics } from "../../services/db/DatabaseService";
import { showLiveCall, startLiveCall } from "../../services/live/LiveCall";
import type { LiveBackend } from "../../services/live/liveBackend";
import { startLiveSession, type LiveSession, type LiveState } from "../../services/live/LiveSession";
import Group from "../ui/Group";
import { renderMarkdown } from "../ui/MarkdownText";
import Selector from "../ui/Selector";
import LiveCamera, { listCameras, type CameraDevice, type LiveCameraHandle } from "./LiveCamera";
import { pressStyle } from "../ui/pressStyle";

const micIcon = require("../../../assets/icons/microphone.png");
const cameraIcon = require("../../../assets/icons/videocam.png");
const hangUpIcon = require("../../../assets/icons/cancel.png");

const BUTTON_SIZE = 56;
const ORB_SIZE = 120;
const RING_SIZE = 168;
const FRAME_INTERVAL_MS = 1000;
const FRAME_QUALITY = 0.4;
//speech rms rarely passes 0.15
const VOLUME_GAIN = 7;

type Turn = { user: string; assistant: string };

type LiveScreenProps = {
  backend: LiveBackend;
  instructions: string;
  incognito: boolean;
  //second session transcribes local models
  transcribe: boolean;
  onTurn: (role: "user" | "assistant", content: string, metrics?: MessageMetrics) => void;
  onClose: () => void;
};

export default function LiveScreen({ backend, instructions, incognito, transcribe, onTurn, onClose }: LiveScreenProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const insets = useSafeAreaInsets();
  const accent = incognito ? Colors.incognito : Colors.primary;

  const [state, setState] = useState<LiveState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [current, setCurrent] = useState<Turn>({ user: "", assistant: "" });
  const [permission, requestPermission] = useCameraPermissions();

  const sessionRef = useRef<LiveSession | null>(null);
  const cameraRef = useRef<LiveCameraHandle>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraId, setCameraId] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const volume = useAnimatedValue(0);
  const spin = useAnimatedValue(0);
  const pulse = useAnimatedValue(0);
  const [toolName, setToolName] = useState<string | null>(null);
  const [widgets, setWidgets] = useState("");
  //latest callback without restarting the session
  const onTurnRef = useRef(onTurn);
  useEffect(() => {
    onTurnRef.current = onTurn;
  }, [onTurn]);

  useEffect(() => {
    let cancelled = false;
    startLiveSession(backend, instructions, {
      onState: setState,
      onVolume: (level) => volume.setValue(Math.min(1, level * VOLUME_GAIN)),
      onTranscript: (user, assistant) => setCurrent({ user, assistant }),
      onTool: setToolName,
      onWidgets: setWidgets,
      onMessage: (role, content, metrics) => {
        if (role === "user") {
          setTurns((prev) => [...prev, { user: content, assistant: "" }]);
        } else {
          //widgets show above, not in the transcript
          const said = content.replace(/```[\s\S]*?```/g, "").trim();
          setTurns((prev) => {
            const last = prev[prev.length - 1];
            if (last && !last.assistant) return [...prev.slice(0, -1), { ...last, assistant: said }];
            return [...prev, { user: "", assistant: said }];
          });
        }
        onTurnRef.current(role, content, metrics);
      },
      onError: setError,
    }, { transcribe, voicePlaceholder: t("live.voiceMessage") })
      .then((session) => {
        if (cancelled) session.stop();
        else sessionRef.current = session;
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, instructions, transcribe]);

  //call card in the status bar while live
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const toggleMuteRef = useRef(() => {});
  useEffect(
    () => startLiveCall((action) => (action === "hangup" ? onCloseRef.current() : toggleMuteRef.current())),
    [],
  );
  //label follows the mute state
  useEffect(() => {
    showLiveCall({ title: "Maestro", text: backend.model, hangUp: t("live.hangUp"), mute: t(muted ? "live.unmute" : "live.mute") });
  }, [backend, t, muted]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  //frames feed the model while the camera is on
  useEffect(() => {
    if (!cameraOn) return;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy || !cameraRef.current) return;
      busy = true;
      try {
        const frame = await cameraRef.current.capture(FRAME_QUALITY);
        if (frame) sessionRef.current?.sendFrame(frame);
      } catch {}
      busy = false;
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [cameraOn]);

  //desktop can pick among several cameras
  useEffect(() => {
    if (!cameraOn) return;
    listCameras()
      .then((list) => {
        setCameras(list);
        setCameraId((id) => id || list[0]?.id || "");
      })
      .catch(() => {});
  }, [cameraOn]);

  //spinning ring while maestro thinks or uses a tool
  const waiting = state === "thinking" || state === "tool";
  useEffect(() => {
    if (!waiting) return;
    spin.setValue(0);
    pulse.setValue(0);
    const loop = Animated.parallel([
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    ]);
    loop.start();
    return () => loop.stop();
  }, [waiting, spin, pulse]);

  const toggleMute = () => {
    sessionRef.current?.setMicMuted(!muted);
    setMuted(!muted);
  };
  useEffect(() => {
    toggleMuteRef.current = toggleMute;
  });

  const toggleCamera = async () => {
    if (!cameraOn && !permission?.granted && !(await requestPermission()).granted) return;
    setCameraOn(!cameraOn);
  };

  const stateLabel = error ? t("live.error") : t(`live.state.${state}`);
  const orbScale = volume.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const breathe = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.75] });
  const widgetNodes = useMemo(() => (widgets ? renderMarkdown(widgets, incognito) : null), [widgets, incognito]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xxxl, paddingBottom: insets.bottom + Spacing.xxl }]}>
      <View style={styles.header}>
        <Text style={styles.model} numberOfLines={1}>{backend.model}</Text>
        <Text style={styles.state}>{stateLabel}</Text>
        {error && <Text style={styles.error} numberOfLines={3}>{error}</Text>}
      </View>

      {/* tap stops the reply */}
      <Pressable style={styles.stage} onPress={() => sessionRef.current?.interrupt()}>
        {cameraOn ? (
          <View style={styles.cameraBox}>
            <LiveCamera ref={cameraRef} style={styles.camera} deviceId={cameraId || undefined} />
            {cameras.length > 1 && (
              <Group>
                <Selector
                  options={cameras}
                  selectedValue={cameraId}
                  onSelect={setCameraId}
                  title={t("live.selectCamera")}
                  fullWidth
                />
              </Group>
            )}
          </View>
        ) : waiting ? (
          <View style={styles.orbBox}>
            <Animated.View style={[styles.ring, { borderTopColor: accent, transform: [{ rotate }] }]} />
            <Animated.View style={[styles.orb, { backgroundColor: accent, transform: [{ scale: breathe }] }]} />
          </View>
        ) : (
          <Animated.View style={[styles.orb, { backgroundColor: accent, transform: [{ scale: orbScale }] }]} />
        )}
        {state === "tool" && !!toolName && <Text style={styles.hint}>{toolName}</Text>}
        {state === "speaking" && <Text style={styles.hint}>{t("live.tapToInterrupt")}</Text>}
      </Pressable>

      {widgetNodes && (
        <ScrollView style={styles.widgets} contentContainerStyle={styles.widgetsContent}>
          {widgetNodes}
        </ScrollView>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.transcript}
        contentContainerStyle={styles.transcriptContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {[...turns, current].map((turn, i) => (
          <View key={i} style={styles.turn}>
            {!!turn.user && <Text style={styles.userText}>{turn.user}</Text>}
            {!!turn.assistant && <Text style={styles.assistantText}>{turn.assistant}</Text>}
          </View>
        ))}
      </ScrollView>

      <View style={styles.controls}>
        <Pressable
          accessibilityLabel={t(muted ? "live.unmute" : "live.mute")}
          onPress={toggleMute}
          style={pressStyle([styles.button, muted && { backgroundColor: accent, borderColor: Colors.borderOnPrimary }], "fadeLight")}
        >
          <Image source={micIcon} style={styles.icon} tintColor={muted ? Colors.textOnPrimary : Colors.textPrimary} />
        </Pressable>
        {backend.camera && (
          <Pressable
            accessibilityLabel={t("live.camera")}
            onPress={toggleCamera}
            style={pressStyle([styles.button, cameraOn && { backgroundColor: accent, borderColor: Colors.borderOnPrimary }], "fadeLight")}
          >
            <Image source={cameraIcon} style={styles.icon} tintColor={cameraOn ? Colors.textOnPrimary : Colors.textPrimary} />
          </Pressable>
        )}
        <Pressable
          accessibilityLabel={t("live.hangUp")}
          onPress={onClose}
          style={pressStyle([styles.button, { backgroundColor: accent, borderColor: Colors.borderOnPrimary }], "fadeLight")}
        >
          <Image source={hangUpIcon} style={styles.icon} tintColor={Colors.textOnPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xxl,
  },
  header: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  model: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    color: Colors.textMuted,
  },
  state: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.displayMd,
    color: Colors.textPrimary,
  },
  error: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.caption,
    color: Colors.error,
    textAlign: "center",
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xxl,
  },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
  },
  orbBox: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 3,
    borderColor: Colors.border,
  },
  //compact column, the orb stays the focus
  widgets: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    maxHeight: 220,
    marginBottom: Spacing.lg2,
  },
  widgetsContent: {
    gap: Spacing.md,
  },
  cameraBox: {
    width: "100%",
    maxWidth: 480,
    gap: Spacing.md,
  },
  camera: {
    width: "100%",
    maxWidth: 480,
    aspectRatio: 3 / 4,
    borderRadius: Radius.window,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  hint: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    color: Colors.textMuted,
  },
  transcript: {
    maxHeight: 160,
    marginBottom: Spacing.xxl,
  },
  transcriptContent: {
    gap: Spacing.md,
  },
  turn: {
    gap: Spacing.xs,
  },
  userText: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.bodyMd,
    color: Colors.textMuted,
    textAlign: "right",
  },
  assistantText: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.body,
    lineHeight: 21,
    color: Colors.textPrimary,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xxl2,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 22,
    height: 22,
  },
});
