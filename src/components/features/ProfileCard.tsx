import { useEffect, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Gyroscope } from "expo-sensors";
import { Animated, AppState, Image, Platform, StyleSheet, Text, View } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors, VoiceColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { getLocale, useT } from "../../i18n";
import { Settings } from "../../services/settings/SettingsService";
import { MAESTRO_BUTTERFLIES, MaestroButterflyId, useMaestroButterfly, usePersonalityCode, useVoiceColor, DEFAULT_PERSONALITY_CODE } from "./maestroButterfly";

const CARD_CREATED_AT_KEY = "profileCardCreatedAt";
const TEXTURES = [
  require("../../../assets/images/texture/texture1.png"),
  require("../../../assets/images/texture/texture2.png"),
  require("../../../assets/images/texture/texture3.png"),
  require("../../../assets/images/texture/texture4.png"),
];
//indexed by style: informal, common, formal
const STYLE_FONTS = [Fonts.mono, Fonts.body, Fonts.display];
const MAX_SHIFT = 28;
const DECAY = 0.92;
const GYRO_SPEED = 7;

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));
}

type ProfileCardProps = {
  name: string;
  //a hub profile brings its own date
  createdAt?: number;
  //grid tile in the profile picker
  compact?: boolean;
  //pause sensor when offscreen
  active?: boolean;
  //a hub profile shows its own look
  butterfly?: string | null;
};

export default function ProfileCard({
  name,
  createdAt: givenCreatedAt,
  compact = false,
  active = true,
  butterfly: givenButterfly,
}: ProfileCardProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const t = useT();
  const ownButterfly = useMaestroButterfly();
  const ownColor = useVoiceColor();
  //unknown or missing ids keep this device's look
  const butterfly =
    MAESTRO_BUTTERFLIES[
      givenButterfly && givenButterfly in MAESTRO_BUTTERFLIES
        ? (givenButterfly as MaestroButterflyId)
        : ownButterfly
    ];
  //a hub voice never reaches here, so its card stays red
  const accentColor = givenButterfly ? VoiceColors.red : ownColor;
  const trimmed = name.trim();
  //personality picks the look, a hub profile keeps the defaults
  const ownCode = usePersonalityCode();
  const code = givenButterfly ? DEFAULT_PERSONALITY_CODE : ownCode;
  const texture = TEXTURES[(Math.floor(code / 3) + (code % 3)) % TEXTURES.length];
  const nameFont = STYLE_FONTS[Math.floor(code / 3) % 3];
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const shift = useRef(new Animated.Value(0)).current;

  //first render stamps the card, later renders just read it back
  useEffect(() => {
    if (givenCreatedAt !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = await Settings.getLocal(CARD_CREATED_AT_KEY);
        if (stored) {
          if (!cancelled) setCreatedAt(parseInt(stored, 10));
          return;
        }
        const now = Date.now();
        await Settings.setLocal(CARD_CREATED_AT_KEY, String(now));
        if (!cancelled) setCreatedAt(now);
      } catch {
        //settings not ready yet, card still renders without a date
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [givenCreatedAt]);
  const shownCreatedAt = givenCreatedAt ?? createdAt;

  //tilting the phone slides the stripes along y
  useEffect(() => {
    if (Platform.OS === "web" || !active) return;
    let isMounted = true;
    let sub: { remove: () => void } | null = null;
    let offset = 0;
    let wasAtRest = true;

    const subscribe = () => {
      if (sub) return;
      Gyroscope.isAvailableAsync().then((available) => {
        if (!available || !isMounted || sub) return;
        Gyroscope.setUpdateInterval(50);
        sub = Gyroscope.addListener(({ x }) => {
          //skip updates when resting immobile
          const isInputZero = Math.abs(x) < 0.02;
          const isMotionZero = Math.abs(offset) < 0.08;
          if (isInputZero && isMotionZero) {
            if (wasAtRest) return;
            wasAtRest = true;
            offset = 0;
            Animated.spring(shift, { toValue: 0, tension: 26, friction: 9, useNativeDriver: true }).start();
            return;
          }
          wasAtRest = false;
          //accumulate rotation with decay so it settles back
          offset = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, offset * DECAY + x * GYRO_SPEED));
          Animated.spring(shift, { toValue: offset, tension: 26, friction: 9, useNativeDriver: true }).start();
        });
      });
    };
    const unsubscribe = () => {
      sub?.remove();
      sub = null;
    };

    if (AppState.currentState === "active") subscribe();
    //sensor sleeps with the app
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") subscribe();
      else unsubscribe();
    });
    return () => {
      isMounted = false;
      unsubscribe();
      appStateSub.remove();
    };
  }, [shift, active]);

  return (
    <View style={[styles.card, { backgroundColor: accentColor }]}>
      {/* white fade gives the red its gradient */}
      <LinearGradient
        colors={[`${Colors.textOnPrimary}59`, `${Colors.textOnPrimary}00`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Image source={texture} style={styles.texture} resizeMode="cover" resizeMethod="resize" />

      {compact ? (
        <View style={styles.contentCompact}>
          <View style={styles.compactText}>
            <Text
              style={[styles.name, styles.nameCompact, { fontFamily: nameFont }, !trimmed && styles.placeholder]}
              numberOfLines={2}
            >
              {trimmed || t("profileCard.placeholder")}
            </Text>
            <Image source={butterfly.icon} style={styles.logoCompact} tintColor={`${Colors.textOnPrimary}99`} />
          </View>
          <View style={styles.butterflyCompact}>
            <Image source={butterfly.base} style={styles.stackFill} resizeMode="contain" resizeMethod="resize" />
            <Image source={butterfly.accent} tintColor={accentColor} style={styles.stackFill} resizeMode="contain" resizeMethod="resize" />
          </View>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.tile}>
            <View style={styles.tileButterfly}>
              <Image source={butterfly.base} style={styles.stackFill} resizeMode="contain" resizeMethod="resize" />
              <Image source={butterfly.accent} tintColor={accentColor} style={styles.stackFill} resizeMode="contain" resizeMethod="resize" />
            </View>
          </View>

          <Text
            style={[styles.name, { fontFamily: nameFont }, !trimmed && styles.placeholder]}
            numberOfLines={2}
          >
            {trimmed || t("profileCard.placeholder")}
          </Text>

          {shownCreatedAt !== null && (
            <Text style={styles.meta}>{`Opera - ${formatDate(shownCreatedAt)}`}</Text>
          )}

          <Image source={butterfly.icon} style={styles.logo} tintColor={`${Colors.textOnPrimary}99`} />
        </View>
      )}
      {/* a hairline above the thick stripe, a thinner one below */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: shift }] }]} pointerEvents="none">
        <View style={[styles.stripe, styles.stripeHair]} />
        <View style={[styles.stripe, styles.stripeWide]} />
        <View style={[styles.stripe, styles.stripeThin]} />
      </Animated.View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    //frame comes from the surrounding container, this just stacks its content
    card: {
      borderRadius: Radius.xl,
      backgroundColor: Colors.primary,
      overflow: "hidden",
    },
    //padding lives here so the background layers stay full bleed
    content: {
      padding: 15,
      gap: Spacing.xxl,
    },
    //name and icon on the left, butterfly centered on the right
    contentCompact: {
      flexDirection: "row",
      alignItems: "center",
      padding: Spacing.lg2,
      gap: Spacing.lg,
    },
    compactText: {
      flex: 1,
      alignSelf: "stretch",
      justifyContent: "space-between",
      gap: Spacing.lg,
    },
    butterflyCompact: {
      width: 64,
      height: 64,
    },
    logoCompact: {
      width: Spacing.xxl,
      height: Spacing.xxl,
      alignSelf: "flex-start",
    },
    tile: {
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    texture: {
      position: "absolute",
      width: "100%",
      height: "100%",
      opacity: 0.08,
    },
    //wider than the card so the rotated ends never show
    stripe: {
      position: "absolute",
      left: "-30%",
      width: "160%",
      transform: [{ rotate: "-35deg" }],
    },
    stripeHair: {
      top: "16%",
      height: 14,
      backgroundColor: `${Colors.textOnPrimary}17`,
    },
    stripeWide: {
      top: "32%",
      height: 72,
      backgroundColor: `${Colors.textOnPrimary}28`,
    },
    stripeThin: {
      top: "58%",
      height: 32,
      backgroundColor: `${Colors.textOnPrimary}1D`,
    },
    tileButterfly: {
      width: "75%",
      height: "75%",
    },
    //accent layer sits exactly over the base layer
    stackFill: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
    },
    name: {
      fontFamily: Fonts.display,
      fontSize: FontSizes.displayHero,
      lineHeight: 52,
      color: `${Colors.textOnPrimary}99`,
    },
    nameCompact: {
      fontSize: FontSizes.displaySm,
      lineHeight: 26,
    },
    placeholder: {
      color: `${Colors.textOnPrimary}99`,
    },
    meta: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.caption,
      marginTop: -Spacing.sm,
      color: `${Colors.textOnPrimary}99`,
    },
    logo: {
      width: Spacing.xl2,
      height: Spacing.xl2,
      alignSelf: "center",
    },
  });
