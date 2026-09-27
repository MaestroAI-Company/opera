import { useEffect, useState } from "react";
import { Image, ImageBackground, StyleSheet, Text, View } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { getLocale, useT } from "../../i18n";
import { Settings } from "../../services/settings/SettingsService";

const butterflyDefault = require("../../../assets/images/butterfly5.png");

const BUTTERFLIES = [
  {
    color: require("../../../assets/images/butterfly2.png"),
    grey: require("../../../assets/images/butterfly2_grey.png"),
  },
  {
    color: require("../../../assets/images/butterfly3.png"),
    grey: require("../../../assets/images/butterlfy3_grey.png"),
  },
  {
    color: require("../../../assets/images/butterfly4.png"),
    grey: require("../../../assets/images/butterfly4_grey.png"),
  },
];

const TEXTURES = [
  require("../../../assets/images/texture1.png"),
  require("../../../assets/images/texture2.png"),
  require("../../../assets/images/texture3.png"),
];

//same order as FONT_OPTIONS / TEXTURES below, each entry is that option's icon
const FONT_OPTIONS = [Fonts.display, Fonts.body, Fonts.mono];
const FONT_ICONS = [
  require("../../../assets/icons/petrona.png"),
  require("../../../assets/icons/figtree.png"),
  require("../../../assets/icons/fragnent.png"),
];
const TEXTURE_ICONS = [
  require("../../../assets/icons/tiles.png"),
  require("../../../assets/icons/checkerboards.png"),
  require("../../../assets/icons/grains.png"),
];
//red vs incognito
const THEME_ICONS = [require("../../../assets/icons/light.png"), require("../../../assets/icons/dark.png")];
//same order as BUTTERFLIES below, each entry stands in for that shape
const SHAPE_ICONS = [
  require("../../../assets/icons/operaicon.png"),
  require("../../../assets/icons/operaicon2.png"),
  require("../../../assets/icons/operaicon3.png"),
];

//latin-1 supplement range skips the symbols sitting between accented letters
const VOWELS = "aeiouyàáâãäåèéêëìíîïòóôõöùúûüỳÿ";
const LETTER_RE = /[a-zà-öø-ÿ]/i;

function countLetters(name: string) {
  let vowels = 0;
  let consonants = 0;
  for (const char of name) {
    if (!LETTER_RE.test(char)) continue;
    if (VOWELS.includes(char.toLowerCase())) vowels++;
    else consonants++;
  }
  return { vowels, consonants };
}

//name length parity picks the palette, vowels the butterfly, consonants the texture, length the font
function getPersonalization(name: string, Colors: ThemeColors) {
  const total = name.length;
  const { vowels, consonants } = countLetters(name);
  const isRed = total % 2 === 0;
  const fontIndex = total % FONT_OPTIONS.length;
  const textureIndex = consonants % TEXTURES.length;
  const shapeIndex = vowels % BUTTERFLIES.length;
  const shape = BUTTERFLIES[shapeIndex];

  return {
    background: isRed ? Colors.primary : Colors.incognito,
    //text/icons sit on the white card, incognito's base purple reads too dark there (see ChatBar's mentionHighlightIncognito)
    accent: isRed ? Colors.primary : Colors.incognitoBright,
    butterfly: isRed ? shape.color : shape.grey,
    texture: TEXTURES[textureIndex],
    font: FONT_OPTIONS[fontIndex],
    fontIndex,
    textureIndex,
    shapeIndex,
    themeIndex: isRed ? 0 : 1,
  };
}

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
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const trimmed = name.trim();
  const personalization = trimmed ? getPersonalization(trimmed, Colors) : null;
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

  //accent stands in for the chosen color everywhere: name, meta line and the icon tints
  const accent = personalization?.accent ?? Colors.textMuted;
  const butterfly = personalization?.butterfly ?? butterflyDefault;
  const icons = [
    THEME_ICONS[personalization?.themeIndex ?? 0],
    FONT_ICONS[personalization?.fontIndex ?? 0],
    TEXTURE_ICONS[personalization?.textureIndex ?? 0],
    SHAPE_ICONS[personalization?.shapeIndex ?? 0],
  ];

  return (
    <View style={styles.card}>
      <View
        style={[
          styles.tile,
          {
            backgroundColor: personalization?.background ?? Colors.background,
            borderColor: personalization ? Colors.borderOnPrimary : Colors.border,
          },
        ]}
      >
        {personalization && (
          <ImageBackground
            source={personalization.texture}
            style={StyleSheet.absoluteFill}
            imageStyle={styles.texture}
            resizeMode="cover"
          />
        )}
        <Image source={butterfly} style={styles.tileButterfly} resizeMode="contain" />
      </View>

      <Text
        style={[
          styles.name,
          {
            color: accent,
            fontFamily: personalization?.font ?? Fonts.display,
            //Figtree/FragmentMono only ship a regular weight, thicken it so it holds up at this size
            fontWeight: personalization?.font === Fonts.display ? "normal" : "600",
          },
        ]}
        numberOfLines={2}
      >
        {trimmed || t("profileCard.placeholder")}
      </Text>

      {createdAt !== null && (
        <Text style={[styles.meta, { color: accent }]}>{`Opera - ${formatDate(createdAt)}`}</Text>
      )}

      <View style={styles.iconRow}>
        {icons.map((icon, index) => (
          <Image key={index} source={icon} style={[styles.icon, { tintColor: accent }]} resizeMode="contain" />
        ))}
      </View>
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
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    texture: {
      opacity: 0.03,
    },
    tileButterfly: {
      width: "55%",
      height: "55%",
    },
    name: {
      fontFamily: Fonts.display,
      fontSize: FontSizes.displayHero,
      lineHeight: 52,
    },
    meta: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.caption,
      marginTop: -Spacing.sm,
    },
    iconRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.xl2,
      marginTop: Spacing.xxxl + Spacing.xxl,
    },
    icon: {
      width: 14,
      height: 14,
    },
  });
