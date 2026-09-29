import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { getLocale, useT } from "../../i18n";
import { Settings } from "../../services/settings/SettingsService";
import { MAESTRO_BUTTERFLIES, useMaestroButterfly } from "./maestroButterfly";

const CARD_CREATED_AT_KEY = "profileCardCreatedAt";

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
  const t = useT();
  const butterfly = MAESTRO_BUTTERFLIES[useMaestroButterfly()];
  const trimmed = name.trim();
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
        <Image source={butterfly.color} style={styles.tileButterfly} resizeMode="contain" />
      </View>

      <Text style={[styles.name, !trimmed && styles.placeholder]} numberOfLines={2}>
        {trimmed || t("profileCard.placeholder")}
      </Text>

      {createdAt !== null && <Text style={styles.meta}>{`Opera - ${formatDate(createdAt)}`}</Text>}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    //frame comes from the surrounding container, this just stacks its content
    card: {
      padding: Spacing.xs2,
      gap: Spacing.lg,
    },
    tile: {
      aspectRatio: 1,
      borderRadius: Radius.xl,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.background,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    tileButterfly: {
      width: "55%",
      height: "55%",
    },
    name: {
      fontFamily: Fonts.display,
      fontSize: FontSizes.displayHero,
      lineHeight: 52,
      color: Colors.textPrimary,
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
  });
