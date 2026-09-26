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
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../constants/theme";
import ProfileCard from "../components/features/ProfileCard";
import Group from "../components/ui/Group";
import TextInputField from "../components/ui/TextInputField";
import LottieView from "lottie-react-native";
import { useAnimatedValue } from "../hooks/useAnimatedValue";
import { useResponsive } from "../hooks/useResponsive";
import { useColors, useThemedStyles } from "../hooks/useTheme";
import { useT } from "../i18n";
import { CalendarService } from "../services/calendar/CalendarService";
import { ContactsService } from "../services/contacts/ContactsService";
import { LocationService } from "../services/location/LocationService";
import { Settings } from "../services/settings/SettingsService";
import { STT } from "../services/speech/STTService";
import { pressStyle } from "../components/ui/pressStyle";

const texture2 = require("../../assets/images/texture2.png");
const wordmarkAnimation = require("../../assets/animations/wordmark.json");
const homeButterfly = require("../../assets/images/butterfly5.png");
const arrowIcon = require("../../assets/icons/arrow.png");
const pencilIcon = require("../../assets/icons/pencil.png");
const serverIcon = require("../../assets/icons/server.png");
const confidentialityIcon = require("../../assets/icons/confidentiality.png");
const githubIcon = require("../../assets/icons/github.png");
const micIcon = require("../../assets/icons/microphone.png");
const cameraIcon = require("../../assets/icons/camera.png");
const photoIcon = require("../../assets/icons/photo.png");
const contactIcon = require("../../assets/icons/profil.png");
const calendarIcon = require("../../assets/icons/calendar.png");
const locationIcon = require("../../assets/icons/location.png");

const isWeb = Platform.OS === "web";

//intro welcome profile permissions ready
const LAST_STEP = 4;
const BACK_BUTTON_SIZE = 56;

type IntroPhase = "logo" | "phrases";

const WORDMARK = { width: 260, height: 44 };
const WORDMARK_LARGE = { width: 360, height: 61 };

const PHRASE_HOLD = 3500;
const INTRO_PHRASES = [
  "privateAgain",
  "noTrace",
  "freedom",
  "offline",
  "privateLife",
  "neverLeave",
  "askAnything",
  "staysHome",
  "noCloud",
  "pocket",
] as const;

const PROMISES = [
  { id: "local", icon: serverIcon },
  { id: "account", icon: confidentialityIcon },
  { id: "open", icon: githubIcon },
] as const;

type PermissionId = "microphone" | "camera" | "photos" | "contacts" | "calendar" | "location";
type PermissionStatus = "granted" | "denied";
type PermissionDef = {
  id: PermissionId;
  icon: ImageSourcePropType;
  request: () => Promise<boolean>;
};

const requestLocation = async () => {
  const granted = await LocationService.requestPermission();
  //warm cache for location context
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
      { id: "contacts", icon: contactIcon, request: () => ContactsService.requestPermission() },
      { id: "calendar", icon: calendarIcon, request: () => CalendarService.requestPermission() },
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

//slow hover keeps the mascot alive
function FloatingButterfly({ source, style }: { source: ImageSourcePropType; style: StyleProp<any> }) {
  const float = useAnimatedValue(0);

  useEffect(() => {
    const drift = (toValue: number) =>
      Animated.timing(float, { toValue, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([drift(1), drift(0)]));
    loop.start();
    return () => loop.stop();
  }, [float]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  return <Animated.Image source={source} resizeMode="contain" style={[style, { transform: [{ translateY }] }]} />;
}


type PhraseCyclerProps = {
  phrases: string[];
  style: StyleProp<TextStyle>;
  onFirstShown: () => void;
};

//fades each phrase in then out
function PhraseCycler({ phrases, style, onFirstShown }: PhraseCyclerProps) {
  const [index, setIndex] = useState(0);
  const cycle = useAnimatedValue(0);
  const shown = useRef(false);

  useEffect(() => {
    cycle.setValue(0);
    Animated.timing(cycle, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      if (!shown.current) {
        shown.current = true;
        onFirstShown();
      }
      Animated.timing(cycle, {
        toValue: 2,
        duration: 400,
        delay: PHRASE_HOLD,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished: done }) => done && setIndex((i) => (i + 1) % phrases.length));
    });
    return () => cycle.stopAnimation();
  }, [index, cycle, phrases.length, onFirstShown]);

  //rises in then keeps rising out
  const animatedStyle = useMemo(
    () => ({
      opacity: cycle.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
      transform: [{ translateY: cycle.interpolate({ inputRange: [0, 1, 2], outputRange: [10, 0, -10] }) }],
    }),
    [cycle],
  );

  return <Animated.Text style={[style, animatedStyle]}>{phrases[index]}</Animated.Text>;
}

type IntroStageProps = {
  phase: IntroPhase;
  onLogoGone: () => void;
  onReady: () => void;
};

//logo sweep then the phrases
function IntroStage({ phase, onLogoGone, onReady }: IntroStageProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { isLargeScreen } = useResponsive();
  const phrases = useMemo(() => INTRO_PHRASES.map((id) => t(`onboarding.intro.${id}`)), [t]);

  return (
    <View style={styles.stage}>
      {phase === "logo" && (
        <LottieView
          source={wordmarkAnimation}
          autoPlay
          loop={false}
          style={isLargeScreen ? WORDMARK_LARGE : WORDMARK}
          resizeMode="contain"
          colorFilters={[{ keypath: "**", color: Colors.textPrimary }]}
          onAnimationFinish={(isCancelled) => {
            if (!isCancelled) onLogoGone();
          }}
        />
      )}
      {phase === "phrases" && (
        <PhraseCycler phrases={phrases} style={[styles.phrase, isLargeScreen && styles.phraseLarge]} onFirstShown={onReady} />
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
  const [name, setName] = useState(() => Settings.getCached().name);
  const [statuses, setStatuses] = useState<Partial<Record<PermissionId, PermissionStatus>>>({});
  const contentOpacity = useAnimatedValue(1);
  const backButtonProgress = useAnimatedValue(0);
  const launchCtaOpacity = useAnimatedValue(0);
  const [launchCtaReady, setLaunchCtaReady] = useState(false);
  const [introPhase, setIntroPhase] = useState<IntroPhase>("logo");
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

  //cta trails the first phrase
  const revealCta = useCallback(() => {
    setLaunchCtaReady(true);
    Animated.timing(launchCtaOpacity, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [launchCtaOpacity]);

  const onLogoGone = useCallback(() => setIntroPhase("phrases"), []);

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

  const isLast = step === LAST_STEP;
  const ctaLabel = step === 0 ? t("onboarding.welcome.cta") : isLast ? t("onboarding.ready.cta") : t("onboarding.next");
  const trimmedName = name.trim();

  const renderIntro = () => <IntroStage phase={introPhase} onLogoGone={onLogoGone} onReady={revealCta} />;

  const renderWelcome = () => (
    <>
      <Reveal>
        <Text style={[styles.heroTitle, isLargeScreen && styles.heroTitleLarge]}>{t("onboarding.welcome.title")}</Text>
      </Reveal>
      <Reveal delay={120}>
        <Text style={styles.lead}>{t("onboarding.welcome.subtitle")}</Text>
      </Reveal>
      <Reveal delay={240}>
        <Group>
          {PROMISES.map((promise) => (
            <View key={promise.id} style={styles.row}>
              <View style={styles.iconBadge}>
                <Image source={promise.icon} style={styles.badgeIcon} tintColor={Colors.textOnPrimary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t(`onboarding.welcome.${promise.id}.title`)}</Text>
                <Text style={styles.rowDescription}>{t(`onboarding.welcome.${promise.id}.description`)}</Text>
              </View>
            </View>
          ))}
        </Group>
      </Reveal>
    </>
  );

  const renderProfile = () => (
    <>
      <Reveal>
        <Text style={styles.title}>{t("onboarding.profile.title")}</Text>
      </Reveal>
      <Reveal delay={100}>
        <Text style={styles.lead}>{t("onboarding.profile.subtitle")}</Text>
      </Reveal>
      <Reveal delay={200}>
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
      </Reveal>
      <Reveal delay={300}>
        <Text style={styles.sectionLabel}>{t("onboarding.profile.card")}</Text>
        <Group>
          <ProfileCard name={name} />
        </Group>
      </Reveal>
    </>
  );

  const renderPermissions = () => (
    <>
      <Reveal>
        <Text style={styles.title}>{t("onboarding.permissions.title")}</Text>
      </Reveal>
      <Reveal delay={100}>
        <Text style={styles.lead}>
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
      </Reveal>
      <Reveal delay={200}>
        <Group>
          {PERMISSIONS.map((perm) => {
            const status = statuses[perm.id];
            return (
              <Pressable
                key={perm.id}
                onPress={() => requestPermission(perm)}
                disabled={!!status}
                style={pressStyle(styles.row, !status && styles.rowPressed)}
              >
                <View style={styles.iconBadge}>
                  <Image source={perm.icon} style={styles.badgeIcon} tintColor={Colors.textOnPrimary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{t(`permissions.${perm.id}.label`)}</Text>
                  <Text style={styles.rowDescription}>{t(`permissions.${perm.id}.description`)}</Text>
                </View>
                <View
                  style={[
                    styles.chip,
                    status === "granted" && styles.chipGranted,
                    status === "denied" && styles.chipDenied,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      status === "granted" && styles.chipTextGranted,
                      status === "denied" && styles.chipTextDenied,
                    ]}
                  >
                    {status === "granted"
                      ? t("permissions.allowed")
                      : status === "denied"
                        ? t("permissions.denied")
                        : t("permissions.allow")}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </Group>
      </Reveal>
    </>
  );

  const renderReady = () => (
    <View style={styles.readyContent}>
      <Reveal>
        <FloatingButterfly source={homeButterfly} style={styles.readyButterfly} />
      </Reveal>
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

  const steps = [renderIntro, renderWelcome, renderProfile, renderPermissions, renderReady];

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
            <ScrollView
              key={step}
              contentContainerStyle={[styles.scrollContent, (step === 1 || step === 2) && styles.scrollContentTop]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {steps[step]()}
            </ScrollView>
          </Animated.View>

          <View style={styles.footer}>
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
                style={pressStyle([styles.cta, isLast && styles.ctaGlow], styles.ctaPressed)}
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
    //welcome and profile read top down, not centered
    scrollContentTop: {
      justifyContent: "flex-start",
      paddingTop: Spacing.xl,
    },
    stage: {
      alignItems: "center",
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
    heroTitle: {
      fontFamily: Fonts.display,
      fontSize: FontSizes.displayLg,
      lineHeight: 42,
      color: Colors.textPrimary,
    },
    heroTitleLarge: {
      fontSize: FontSizes.displayHero,
      lineHeight: 54,
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
    sectionLabel: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textMuted,
      marginBottom: Spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: Spacing.lg2,
      paddingHorizontal: Spacing.lg2,
      gap: Spacing.lg2,
    },
    rowPressed: {
      backgroundColor: Colors.surfacePressed,
    },
    iconBadge: {
      width: 36,
      height: 36,
      borderRadius: Radius.xxl,
      backgroundColor: Colors.primary,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeIcon: {
      width: 18,
      height: 18,
    },
    rowText: {
      flex: 1,
      gap: Spacing.xs2,
    },
    rowTitle: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.bodyMd,
      color: Colors.textPrimary,
    },
    rowDescription: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      lineHeight: 18,
      color: Colors.textMuted,
    },
    chip: {
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    chipGranted: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primaryBright,
    },
    chipDenied: {
      backgroundColor: Colors.surfaceSubtle,
    },
    chipText: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textSecondary,
    },
    chipTextGranted: {
      color: Colors.textOnPrimary,
    },
    chipTextDenied: {
      color: Colors.textMuted,
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
    //echoes the chat composer glow
    ctaGlow: {
      boxShadow: `2px 6px 22px ${Colors.primary}`,
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
