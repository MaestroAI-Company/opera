import { useAudioPlayer } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library/legacy";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Image,
  ImageBackground,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../constants/theme";
import ButterflyCluster from "../components/features/ButterflyCluster";
import VoiceEngineCard from "../components/features/VoiceEngineCard";
import ActionButton from "../components/ui/ActionButton";
import Group from "../components/ui/Group";
import TextInputField from "../components/ui/TextInputField";
import LottieView from "lottie-react-native";
import { useAnimatedValue } from "../hooks/useAnimatedValue";
import { useResponsive } from "../hooks/useResponsive";
import { useColors, useThemedStyles } from "../hooks/useTheme";
import { useT } from "../i18n";
import { LocationService } from "../services/location/LocationService";
import { Settings } from "../services/settings/SettingsService";
import { supportedEngineIds } from "../services/speech/engines";
import { STT } from "../services/speech/STTService";
import { pressStyle } from "../components/ui/pressStyle";

const texture2 = require("../../assets/images/texture2.png");
const wordmarkAnimation = require("../../assets/animations/wordmark.json");
const startupSound = require("../../assets/sounds/startup.m4a");
const arrowIcon = require("../../assets/icons/arrow.png");
const pencilIcon = require("../../assets/icons/pencil.png");
const micIcon = require("../../assets/icons/microphone.png");
const cameraIcon = require("../../assets/icons/camera.png");
const photoIcon = require("../../assets/icons/photo.png");
const locationIcon = require("../../assets/icons/location.png");

const isWeb = Platform.OS === "web";

const BACK_BUTTON_SIZE = 56;

type IntroPhase = "logo" | "phrases";

const WORDMARK = { width: 260, height: 44 };
const WORDMARK_LARGE = { width: 360, height: 61 };

//colorFilters are ignored on web and miss on android
const tintWordmark = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const source = JSON.parse(JSON.stringify(wordmarkAnimation));
  for (const layer of source.layers)
    for (const group of layer.shapes)
      for (const item of group.it) if (item.ty === "fl") item.c.k = [r, g, b, 1];
  return source;
};

//logo ends at 4s with the sound's first part
const LOGO_HOLD_EXTRA_FRAMES = 13;

//pushes each bar's sweep out later
const holdWordmark = (source: any) => {
  for (const layer of source.layers) {
    layer.op += LOGO_HOLD_EXTRA_FRAMES;
    for (const mask of layer.masksProperties) for (const key of mask.pt.k.slice(2)) key.t += LOGO_HOLD_EXTRA_FRAMES;
  }
  source.op += LOGO_HOLD_EXTRA_FRAMES;
  return source;
};

//android can't set amplitude, so ticks spaced further apart read as weaker
const buildRumble = (fadeMs: number) => {
  //short close ticks blur into one soft buzz
  const baseTick = 6;
  //share of time spent buzzing, kept low to barely feel it
  const peakDuty = 0.2;
  //extra duty and tick length that hit hard at the start
  const startBoost = 0.6;
  const boostDecay = 800;
  //sparser ticks would just be stray taps
  const maxGap = 800;
  //no delay before the first tick
  const pattern = [0];
  let t = 0;
  while (t < fadeMs) {
    const boost = Math.exp(-t / boostDecay);
    //longer ticks hit harder than shorter ones
    const tick = Math.round(baseTick + 14 * boost);
    //boost fades fast then the base thins out linearly to nothing
    const duty = peakDuty * (1 - t / fadeMs) + startBoost * boost;
    const gap = Math.round(tick * (1 / duty - 1));
    if (gap > maxGap) break;
    pattern.push(tick, gap);
    t += tick + gap;
  }
  return pattern;
};
//starts with the sound and fades out around eight seconds
const INTRO_RUMBLE = buildRumble(8400);

const PHRASE_HOLD = 2000;
//blur is android 12+ and web only
const INTRO_BLUR = 8;
const TITLES_DURATION = 6000;
const INTRO_PHRASES = [
  "personal",
  "choice",
  "freedom",
  "pocket",
  "control",
  "cloud",
  "noTracking",
  "privacy",
  "noAccount",
  "openSource",
] as const;

type PermissionId = "microphone" | "camera" | "photos" | "location";
type PermissionStatus = "granted" | "denied";
type PermissionDef = {
  id: PermissionId;
  icon: ImageSourcePropType;
  request: () => Promise<boolean>;
};

const requestLocation = async () => {
  const granted = await LocationService.requestPermission();
  if (granted) LocationService.refresh().catch(() => {});
  return granted;
};

//tracks only trigger the prompt
const requestMedia = async (constraints: MediaStreamConstraints) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
};

const PERMISSIONS: PermissionDef[] = isWeb
  ? [
      { id: "microphone", icon: micIcon, request: () => requestMedia({ audio: true }) },
      { id: "camera", icon: cameraIcon, request: () => requestMedia({ video: true }) },
      { id: "location", icon: locationIcon, request: requestLocation },
    ]
  : [
      { id: "microphone", icon: micIcon, request: () => STT.requestPermissions() },
      { id: "camera", icon: cameraIcon, request: async () => (await ImagePicker.requestCameraPermissionsAsync()).granted },
      { id: "photos", icon: photoIcon, request: async () => (await MediaLibrary.requestPermissionsAsync()).granted },
      { id: "location", icon: locationIcon, request: requestLocation },
    ];

//staggered fade up on mount
function Reveal({ delay = 0, style, children }: { delay?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const progress = useAnimatedValue(0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}


type PhraseCyclerProps = {
  phrases: string[];
  style: StyleProp<TextStyle>;
};

//fades each phrase in then out
function PhraseCycler({ phrases, style }: PhraseCyclerProps) {
  const styles = useThemedStyles(makeStyles);
  const [index, setIndex] = useState(0);
  const cycle = useAnimatedValue(0);

  //native driver can't animate filter
  useEffect(() => {
    cycle.setValue(0);
    Animated.timing(cycle, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
      if (!finished) return;
      Animated.timing(cycle, {
        toValue: 2,
        duration: 400,
        delay: PHRASE_HOLD,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished: done }) => done && setIndex((i) => (i + 1) % phrases.length));
    });
    return () => cycle.stopAnimation();
  }, [index, cycle, phrases.length]);

  //rises in then keeps rising out
  const animatedStyle = useMemo(
    () => ({
      opacity: cycle.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
      transform: [{ translateY: cycle.interpolate({ inputRange: [0, 1, 2], outputRange: [10, 0, -10] }) }],
      filter: cycle.interpolate({
        inputRange: [0, 1, 2],
        outputRange: [`blur(${INTRO_BLUR}px)`, "blur(0px)", "blur(0px)"],
      }),
    }),
    [cycle],
  );

  return (
    <Animated.View style={[styles.blurRoom, animatedStyle]}>
      <Text style={style}>{phrases[index]}</Text>
    </Animated.View>
  );
}

type IntroStageProps = {
  phase: IntroPhase;
  onLogoGone: () => void;
};

//logo sweep then the phrases
function IntroStage({ phase, onLogoGone }: IntroStageProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { isLargeScreen } = useResponsive();
  const phrases = useMemo(() => INTRO_PHRASES.map((id) => t(`onboarding.intro.${id}`)), [t]);
  const wordmark = useMemo(
    () => holdWordmark(tintWordmark(Colors.primary)),
    [Colors.primary],
  );
  const logoMotion = useAnimatedValue(0);

  //arrive, hold, leave timed to the lottie sweeps
  useEffect(() => {
    if (phase !== "logo") return;
    const motion = Animated.sequence([
      Animated.timing(logoMotion, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(logoMotion, { toValue: 2, duration: 1500, easing: Easing.linear, useNativeDriver: false }),
      Animated.timing(logoMotion, { toValue: 3, duration: 1000, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
    ]);
    motion.start();
    return () => motion.stop();
  }, [phase, logoMotion]);

  const logoStyle = useMemo(
    () => ({
      transform: [{ translateX: logoMotion.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [-48, 0, 0, 72] }) }],
      filter: logoMotion.interpolate({
        inputRange: [0, 1, 2, 3],
        outputRange: [`blur(${INTRO_BLUR}px)`, "blur(0px)", "blur(0px)", `blur(${INTRO_BLUR}px)`],
      }),
    }),
    [logoMotion],
  );

  return (
    <View style={styles.stage}>
      {phase === "logo" && (
        <Animated.View style={[styles.blurRoom, logoStyle]}>
          <LottieView
            source={wordmark}
            autoPlay
            loop={false}
            style={isLargeScreen ? WORDMARK_LARGE : WORDMARK}
            resizeMode="contain"
            onAnimationFinish={(isCancelled) => {
              if (!isCancelled) onLogoGone();
            }}
          />
        </Animated.View>
      )}
      {phase === "phrases" && (
        <PhraseCycler phrases={phrases} style={[styles.phrase, isLargeScreen && styles.phraseLarge]} />
      )}
    </View>
  );
}

export default function OnboardingPage() {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();

  const [step, setStep] = useState(0);
  //no neural engine on this platform, nothing to pick
  const [hasVoiceEngines] = useState(() => supportedEngineIds().length > 0);
  const [name, setName] = useState(() => Settings.getCached().name);
  const [statuses, setStatuses] = useState<Partial<Record<PermissionId, PermissionStatus>>>({});
  const contentOpacity = useAnimatedValue(1);
  const backButtonProgress = useAnimatedValue(0);
  const launchCtaOpacity = useAnimatedValue(0);
  const [launchCtaReady, setLaunchCtaReady] = useState(false);
  const [introPhase, setIntroPhase] = useState<IntroPhase>("logo");
  const creditOpacity = useAnimatedValue(0);
  const startupPlayer = useAudioPlayer(startupSound);
  const busy = useRef(false);
  const showBack = step > 0;

  const goTo = useCallback((next: number) => {
    if (busy.current) return;
    busy.current = true;
    Keyboard.dismiss();
    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => setStep(next));
  }, [contentOpacity]);

  //restore after commit to avoid flashes
  useEffect(() => {
    contentOpacity.setValue(1);
    busy.current = false;
  }, [step, contentOpacity]);

  //sound and rumble ride the logo animation
  useEffect(() => {
    startupPlayer.play();
    //ios plays every buzz at a fixed length
    if (Platform.OS !== "android") return;
    Vibration.vibrate(INTRO_RUMBLE);
    return () => Vibration.cancel();
  }, [startupPlayer]);

  //hardware back walks steps backward
  useEffect(() => {
    if (step === 0) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goTo(step - 1);
      return true;
    });
    return () => sub.remove();
  }, [step, goTo]);

  //slides the back button open, cta reflows with it
  useEffect(() => {
    Animated.timing(backButtonProgress, {
      toValue: showBack ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [showBack, backButtonProgress]);

  //cta waits for the titles to play
  const onLogoGone = useCallback(() => {
    setIntroPhase("phrases");
    Animated.timing(launchCtaOpacity, {
      toValue: 1,
      duration: 500,
      delay: TITLES_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setLaunchCtaReady(true));
  }, [launchCtaOpacity]);

  //credit lives only with the logo
  useEffect(() => {
    Animated.timing(creditOpacity, {
      toValue: introPhase === "logo" ? 1 : 0,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [introPhase, creditOpacity]);

  const requestPermission = async (perm: PermissionDef) => {
    if (statuses[perm.id]) return;
    const granted = await perm.request();
    setStatuses((prev) => ({ ...prev, [perm.id]: granted ? "granted" : "denied" }));
  };

  const finish = async () => {
    if (busy.current) return;
    busy.current = true;
    await Settings.setMany({ name: name.trim(), hasSeenOnboarding: true });
    router.replace("/");
  };

  const trimmedName = name.trim();

  const renderIntro = () => <IntroStage phase={introPhase} onLogoGone={onLogoGone} />;

  //same pill as the settings permissions page
  const renderPermissionBadge = (status?: PermissionStatus) => (
    <View style={[styles.permissionBadge, status === "granted" && styles.permissionBadgeAllowed]}>
      <Text style={[styles.permissionBadgeText, status === "granted" && styles.permissionBadgeTextAllowed]}>
        {status === "granted"
          ? t("permissions.allowed")
          : status === "denied"
            ? t("permissions.denied")
            : t("permissions.allow")}
      </Text>
    </View>
  );

  const renderProfile = () => (
    <>
      <Reveal>
        <Text style={styles.title}>{t("onboarding.profile.title")}</Text>
      </Reveal>
      <Reveal delay={100}>
        <View style={styles.contentCard}>
          <Text style={styles.settingLabel}>{t("settings.profile.name")}</Text>
          <Text style={styles.helpText}>{t("onboarding.profile.subtitle")}</Text>
          <Group>
            <TextInputField
              icon={pencilIcon}
              value={name}
              onChangeText={setName}
              placeholder={t("onboarding.name.placeholder")}
              returnKeyType="next"
              onSubmitEditing={() => goTo(step + 1)}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </Group>
        </View>
      </Reveal>
    </>
  );

  const renderVoice = () => (
    <>
      <Reveal>
        <Text style={styles.title}>{t("onboarding.voice.title")}</Text>
      </Reveal>
      <ButterflyCluster parallax={false} intro={false} style={styles.voiceButterfly} />
      <Reveal delay={100}>
        <VoiceEngineCard />
      </Reveal>
    </>
  );

  const renderPermissions = () => (
    <>
      <Reveal>
        <Text style={styles.title}>{t("onboarding.permissions.title")}</Text>
      </Reveal>
      <Reveal delay={100}>
        <View style={styles.contentCard}>
          <Text style={styles.settingLabel}>{t("permissions.title")}</Text>
          <Text style={styles.helpText}>
            {isWeb ? (
              t("onboarding.permissions.subtitleWeb")
            ) : (
              <>
                {t("onboarding.permissions.subtitle")}{" "}
                <Text style={styles.link} onPress={() => Linking.openSettings()}>
                  {t("onboarding.permissions.settingsLink")}
                </Text>
              </>
            )}
          </Text>
          <Group>
            {PERMISSIONS.map((perm) => {
              const status = statuses[perm.id];
              return (
                <ActionButton
                  key={perm.id}
                  icon={perm.icon}
                  label={t(`permissions.${perm.id}.label`)}
                  onPress={() => requestPermission(perm)}
                  disabled={!!status}
                  rightElement={renderPermissionBadge(status)}
                />
              );
            })}
          </Group>
        </View>
      </Reveal>
    </>
  );

  const renderReady = () => (
    <View style={styles.readyContent}>
      <ButterflyCluster style={styles.readyButterfly} />
      <Reveal delay={120}>
        <Text style={[styles.title, styles.centered]}>
          {trimmedName ? t("onboarding.ready.titleNamed", { name: trimmedName }) : t("onboarding.ready.title")}
        </Text>
      </Reveal>
      <Reveal delay={240}>
        <Text style={[styles.lead, styles.centered]}>{t("onboarding.ready.subtitle")}</Text>
      </Reveal>
    </View>
  );

  const steps = [renderIntro, renderProfile, ...(hasVoiceEngines ? [renderVoice] : []), renderPermissions, renderReady];

  const isLast = step === steps.length - 1;
  const ctaLabel = step === 0 ? t("onboarding.welcome.cta") : isLast ? t("onboarding.ready.cta") : t("onboarding.next");

  return (
    <View style={styles.container}>
      <ImageBackground
        source={texture2}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
        imageStyle={styles.backgroundTexture}
        resizeMode="cover"
      />
      <LinearGradient
        colors={[
          Colors.background,
          `${Colors.background}D9`,
          `${Colors.background}BF`,
          `${Colors.background}A6`,
          `${Colors.background}4D`,
          `${Colors.background}1A`,
          "transparent",
        ]}
        locations={[0, 0.2, 0.5, 0.75, 0.85, 0.95, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View
          style={[
            styles.frame,
            isLargeScreen && styles.frameLarge,
            { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xxl },
          ]}
        >
          <View style={styles.header} />

          <Animated.View style={[styles.flex, { opacity: contentOpacity }]}>
            {step === 0 ? (
              //scrollview would clip the logo's slide
              <View style={styles.scrollContent}>{steps[0]()}</View>
            ) : (
              <ScrollView
                key={step}
                contentContainerStyle={[styles.scrollContent, step > 0 && !isLast && styles.scrollContentTop]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {steps[step]()}
              </ScrollView>
            )}
          </Animated.View>

          <View style={styles.footer}>
            {step === 0 && (
              <Animated.View style={[styles.credit, { opacity: creditOpacity }]}>
                <Text style={styles.creditText}>by Maestroai.Company</Text>
              </Animated.View>
            )}
            <Animated.View
              pointerEvents={showBack ? "auto" : "none"}
              style={[
                styles.backButtonWrap,
                {
                  width: backButtonProgress.interpolate({ inputRange: [0, 1], outputRange: [0, BACK_BUTTON_SIZE] }),
                  marginRight: backButtonProgress.interpolate({ inputRange: [0, 1], outputRange: [0, Spacing.md] }),
                  opacity: backButtonProgress,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("onboarding.back")}
                onPress={() => goTo(step - 1)}
                style={pressStyle(styles.backButton, styles.backButtonPressed)}
              >
                <Image source={arrowIcon} style={styles.backIcon} tintColor={Colors.textPrimary} />
              </Pressable>
            </Animated.View>
            <Animated.View pointerEvents={launchCtaReady ? "auto" : "none"} style={[styles.ctaWrap, { opacity: launchCtaOpacity }]}>
              <Pressable
                onPress={isLast ? finish : () => goTo(step + 1)}
                style={pressStyle(styles.cta, styles.ctaPressed)}
              >
                <Text style={styles.ctaText}>{ctaLabel}</Text>
                <Image source={arrowIcon} style={styles.ctaIcon} tintColor={Colors.textOnPrimary} />
              </Pressable>
            </Animated.View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    backgroundTexture: {
      opacity: 0.02,
      width: "100%",
      height: "100%",
    },
    flex: {
      flex: 1,
    },
    frame: {
      flex: 1,
      width: "100%",
      paddingHorizontal: Spacing.xxl2,
    },
    frameLarge: {
      alignSelf: "center",
      maxWidth: 520,
    },
    //keeps step titles where they were
    header: {
      height: 44,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
    },
    //sits in the hidden cta slot
    credit: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
    },
    creditText: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      color: Colors.textMuted,
    },
    //clips the button as its animated width reveals it
    backButtonWrap: {
      height: BACK_BUTTON_SIZE,
      overflow: "hidden",
    },
    backButton: {
      width: BACK_BUTTON_SIZE,
      height: BACK_BUTTON_SIZE,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: Radius.xxl,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    backButtonPressed: {
      backgroundColor: Colors.surfacePressed,
    },
    //pixel arrow points right so flip
    backIcon: {
      width: 16,
      height: 16,
      transform: [{ scaleX: -1 }],
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingVertical: Spacing.xxl2,
      gap: Spacing.xxl,
    },
    //middle steps read top down, not centered
    scrollContentTop: {
      justifyContent: "flex-start",
      paddingTop: Spacing.xl,
    },
    stage: {
      alignItems: "center",
    },
    //filter clips to bounds, pad so the blur fits
    blurRoom: {
      padding: Spacing.xxxl,
      margin: -Spacing.xxxl,
    },
    phrase: {
      maxWidth: 320,
      fontFamily: Fonts.display,
      fontSize: FontSizes.displayMd,
      lineHeight: 32,
      textAlign: "center",
      color: Colors.textPrimary,
    },
    phraseLarge: {
      maxWidth: 480,
      fontSize: FontSizes.displayLg,
      lineHeight: 44,
    },
    title: {
      fontFamily: Fonts.display,
      fontSize: FontSizes.xxxl,
      lineHeight: 38,
      color: Colors.textPrimary,
    },
    lead: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.body,
      lineHeight: 22,
      color: Colors.textSecondary,
    },
    link: {
      color: Colors.primary,
      textDecorationLine: "underline",
    },
    centered: {
      textAlign: "center",
    },
    //same card, label and help text as the settings pages
    contentCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      padding: Spacing.md,
    },
    settingLabel: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      paddingTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    helpText: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.bodyMd,
      lineHeight: 20,
      color: Colors.textMuted,
      marginTop: Spacing.xs,
      marginBottom: Spacing.md,
      paddingHorizontal: Spacing.md,
    },
    permissionBadge: {
      paddingVertical: 3,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    permissionBadgeAllowed: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primaryBright,
    },
    permissionBadgeText: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.labelSm,
      color: Colors.textSecondary,
    },
    permissionBadgeTextAllowed: {
      color: Colors.textOnPrimary,
    },
    voiceButterfly: {
      width: 200,
      height: 200,
      alignSelf: "center",
    },
    readyContent: {
      alignItems: "center",
      gap: Spacing.xxl,
    },
    readyButterfly: {
      width: 220,
      height: 220,
    },
    ctaWrap: {
      flex: 1,
    },
    cta: {
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Spacing.xl2,
      borderRadius: Radius.xxl,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
      backgroundColor: Colors.primary,
    },
    ctaPressed: {
      backgroundColor: Colors.primaryPressed,
    },
    ctaText: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.md,
      color: Colors.textOnPrimary,
    },
    ctaIcon: {
      width: 16,
      height: 16,
    },
  });
