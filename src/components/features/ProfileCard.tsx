import { useEffect, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Gyroscope } from "expo-sensors";
import { Animated, AppState, Image, Platform, StyleSheet, Text, View } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { getLocale, useT } from "../../i18n";
import { Settings } from "../../services/settings/SettingsService";
import { MAESTRO_BUTTERFLIES, useMaestroButterfly } from "./maestroButterfly";

const CARD_CREATED_AT_KEY = "profileCardCreatedAt";
const TEXTURES = [
  require("../../../assets/images/texture1.png"),
  require("../../../assets/images/texture2.png"),
  require("../../../assets/images/texture3.png"),
  require("../../../assets/images/texture4.png"),
];
const NAME_FONTS = [Fonts.display, Fonts.body, Fonts.mono];
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
};

export default function ProfileCard({ name, createdAt: givenCreatedAt, compact = false }: ProfileCardProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const t = useT();
  const butterfly = MAESTRO_BUTTERFLIES[useMaestroButterfly()];
  const trimmed = name.trim();
  //length picks the texture, first letter picks the font
  const texture = TEXTURES[trimmed.length % TEXTURES.length];
  const nameFont = trimmed
    ? NAME_FONTS[trimmed.toLowerCase().charCodeAt(0) % NAME_FONTS.length]
    : Fonts.display;
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
    if (Platform.OS === "web") return;
    let isMounted = true;
    let sub: { remove: () => void } | null = null;
    let offset = 0;

    const subscribe = () => {
      if (sub) return;
      Gyroscope.isAvailableAsync().then((available) => {
        if (!available || !isMounted || sub) return;
        Gyroscope.setUpdateInterval(50);
        sub = Gyroscope.addListener(({ x }) => {
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
  }, [shift]);

  return (
    <View style={styles.card}>
      {/* white fade gives the red its gradient */}
      <LinearGradient
        colors={[`${Colors.textOnPrimary}59`, `${Colors.textOnPrimary}00`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Image source={texture} style={styles.texture} resizeMode="cover" />

      <View style={[styles.content, compact && styles.contentCompact]}>
        <View style={styles.tile}>
          <Image source={butterfly.color} style={styles.tileButterfly} resizeMode="contain" />
        </View>

        <Text
          style={[styles.name, compact && styles.nameCompact, { fontFamily: nameFont }, !trimmed && styles.placeholder]}
          numberOfLines={2}
        >
          {trimmed || t("profileCard.placeholder")}
        </Text>

        {shownCreatedAt !== null && !compact && (
          <Text style={styles.meta}>{`Opera - ${formatDate(shownCreatedAt)}`}</Text>
        )}

        <Image source={butterfly.icon} style={styles.logo} tintColor={`${Colors.textOnPrimary}99`} />
      </View>
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
    contentCompact: {
      padding: Spacing.lg2,
      gap: Spacing.lg,
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
