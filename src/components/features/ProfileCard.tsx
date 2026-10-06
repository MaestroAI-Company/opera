import { useEffect, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Image, StyleSheet, Text, View } from "react-native";
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

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));
}

type ProfileCardProps = {
  name: string;
};

export default function ProfileCard({ name }: ProfileCardProps) {
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

  //first render stamps the card, later renders just read it back
  useEffect(() => {
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
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.tile}>
        {/* white fade gives the red its gradient */}
        <LinearGradient
          colors={[`${Colors.textOnPrimary}59`, `${Colors.textOnPrimary}00`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Image source={texture} style={styles.tileTexture} resizeMode="cover" />
        <Image source={butterfly.color} style={styles.tileButterfly} resizeMode="contain" />
      </View>

      <Text
        style={[styles.name, { fontFamily: nameFont }, !trimmed && styles.placeholder]}
        numberOfLines={2}
      >
        {trimmed || t("profileCard.placeholder")}
      </Text>

      {createdAt !== null && <Text style={styles.meta}>{`Opera - ${formatDate(createdAt)}`}</Text>}

      <Image source={butterfly.icon} style={styles.logo} tintColor={Colors.primary} />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    //frame comes from the surrounding container, this just stacks its content
    card: {
      padding: Spacing.xs2,
      gap: Spacing.xxl,
    },
    tile: {
      aspectRatio: 1,
      borderRadius: Radius.xl,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.primary,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    tileTexture: {
      position: "absolute",
      width: "100%",
      height: "100%",
      opacity: 0.08,
    },
    tileButterfly: {
      width: "75%",
      height: "75%",
    },
    name: {
      fontFamily: Fonts.display,
      fontSize: FontSizes.displayHero,
      lineHeight: 52,
      color: Colors.primary,
    },
    placeholder: {
      color: Colors.textMuted,
    },
    meta: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.caption,
      marginTop: -Spacing.sm,
      color: Colors.textMuted,
    },
    logo: {
      width: Spacing.xl2,
      height: Spacing.xl2,
      alignSelf: "center",
    },
  });
