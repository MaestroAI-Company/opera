import { useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, BackHandler, Easing, Image, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useResponsive } from "../../hooks/useResponsive";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import type { MessageMetrics } from "../../services/db/DatabaseService";
import { showLiveCall, startLiveCall } from "../../services/live/LiveCall";
import type { LiveBackend } from "../../services/live/liveBackend";
import { startLiveSession, type LiveSession, type LiveState } from "../../services/live/LiveSession";
import Group from "../ui/Group";
import Selector from "../ui/Selector";
import VoiceGrid from "./VoiceGrid";
import LiveCamera, { listCameras, type CameraDevice, type LiveCameraHandle } from "./LiveCamera";
import { pressStyle } from "../ui/pressStyle";

//buttons are 28px in a 56px bar, slop fills its height
const HIT_SLOP = { top: 14, bottom: 14, left: 6, right: 6 };
const micIcon = require("../../../assets/icons/microphone.png");
const micMutedIcon = require("../../../assets/icons/microphone-muted.png");
const cameraIcon = require("../../../assets/icons/camera.png");
const hangUpIcon = require("../../../assets/icons/cancel.png");

const FRAME_INTERVAL_MS = 1000;
const FRAME_QUALITY = 0.4;
//speech rms rarely passes 0.15
const VOICE_GRID_GAIN = 0.9;
const SPINNER_SIZE = 18;

type LiveScreenProps = {
  backend: LiveBackend;
  instructions: string;
  incognito: boolean;
  //second session transcribes local models
  transcribe: boolean;
  onTurn: (role: "user" | "assistant", content: string, metrics?: MessageMetrics) => void;
  onClose: () => void;
};

//replaces the composer while live, turns land in the chat above
export default function LiveScreen({ backend, instructions, incognito, transcribe, onTurn, onClose }: LiveScreenProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();

  const [state, setState] = useState<LiveState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const sessionRef = useRef<LiveSession | null>(null);
  const cameraRef = useRef<LiveCameraHandle>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraId, setCameraId] = useState("");
  //raw mic level read by the pixel wave
  const voiceRef = useRef(0);
  const getVoice = useCallback(() => voiceRef.current, []);
  const spin = useAnimatedValue(0);
  const pressAnim = useAnimatedValue(0);
  //latest callback without restarting the session
  const onTurnRef = useRef(onTurn);
  useEffect(() => {
    onTurnRef.current = onTurn;
  }, [onTurn]);

  useEffect(() => {
    let cancelled = false;
    startLiveSession(backend, instructions, {
      onState: setState,
      onVolume: (level) => {
        voiceRef.current = level * VOICE_GRID_GAIN;
      },
      onTranscript: () => {},
      onWidgets: () => {},
      onTool: () => {},
      onMessage: (role, content, metrics) => onTurnRef.current(role, content, metrics),
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
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [waiting, spin]);

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

  //same touch feedback as the composer
  const handlePressIn = () => {
    Vibration.vibrate(10);
    Animated.timing(pressAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
  };
  const handlePressOut = () => {
    Animated.timing(pressAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };
  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const barColor = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: incognito ? [Colors.incognito, Colors.incognitoBright] : [Colors.primary, Colors.primaryBright],
  });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.root}>
      <View style={styles.column}>
        {error && <Text style={styles.error} numberOfLines={3}>{error}</Text>}

        {cameraOn && (
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
        )}

        <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Animated.View style={[styles.bar, incognito && styles.barIncognito, isDesktop && styles.barDesktop, { backgroundColor: barColor, transform: [{ scale }] }]}>
          <Pressable
            accessibilityLabel={t(muted ? "live.unmute" : "live.mute")}
            onPress={toggleMute}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            hitSlop={HIT_SLOP}
            style={pressStyle(styles.iconButton, "fadeLight")}
          >
            <Image source={muted ? micMutedIcon : micIcon} style={styles.icon} tintColor={Colors.textOnPrimary} />
          </Pressable>

          {backend.camera && (
            <Pressable
              accessibilityLabel={t("live.camera")}
              onPress={toggleCamera}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              hitSlop={HIT_SLOP}
              style={pressStyle([styles.iconButton, cameraOn && styles.iconButtonActive], "fadeLight")}
            >
              <Image source={cameraIcon} style={styles.icon} tintColor={cameraOn ? (incognito ? Colors.incognito : Colors.primary) : Colors.textOnPrimary} />
            </Pressable>
          )}

          {/* tap stops the reply */}
          <Pressable
            onPress={() => sessionRef.current?.interrupt()}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[styles.center, { marginVertical: isDesktop ? -6 : -10 }]}
          >
            {waiting && (
              <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />
            )}
            <VoiceGrid getVolume={getVoice} color={muted ? Colors.whiteSoft : Colors.textOnPrimary} style={styles.grid} />
          </Pressable>

          <Pressable
            accessibilityLabel={t("live.hangUp")}
            onPress={onClose}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            hitSlop={HIT_SLOP}
            style={pressStyle(styles.iconButton, "fadeLight")}
          >
            <Image source={hangUpIcon} style={styles.icon} tintColor={Colors.textOnPrimary} />
          </Pressable>
        </Animated.View>
        </Pressable>
      </View>
      {/* keeps the bar clear of the safe area */}
      <View style={{ width: "100%", height: insets.bottom }} />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: {
    width: "100%",
    maxWidth: 840,
    alignSelf: "center",
  },
  column: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    paddingHorizontal: Spacing.xl2,
    paddingBottom: Spacing.xl2,
    gap: Spacing.md,
  },
  error: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.caption,
    color: Colors.error,
    textAlign: "center",
  },
  cameraBox: {
    width: 180,
    alignSelf: "flex-end",
    gap: Spacing.md,
  },
  camera: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: Radius.window,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  //same pill as the composer
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    minHeight: 56,
    paddingHorizontal: Spacing.lg2,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.window,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    backgroundColor: Colors.primary,
    boxShadow: `2px 6px 22px ${Colors.primary}`,
    elevation: 8,
  },
  barIncognito: {
    boxShadow: `2px 6px 15px ${Colors.incognito}`,
  },
  barDesktop: {
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonActive: {
    backgroundColor: Colors.textOnPrimary,
  },
  icon: {
    width: 18,
    height: 18,
  },
  center: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    overflow: "hidden",
  },
  grid: {
    flex: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  spinner: {
    width: SPINNER_SIZE,
    height: SPINNER_SIZE,
    borderRadius: SPINNER_SIZE / 2,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    borderTopColor: Colors.textOnPrimary,
  },
});
