import { useState } from "react";
import { Image, ImageSourcePropType, Pressable, StyleProp, StyleSheet, Text, Vibration, View, ViewStyle } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { pressStyle } from "./pressStyle";

export type GridCard = {
  key: string;
  title: string;
  status: string;
  icon?: ImageSourcePropType;
  error?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

type CardGridProps = {
  cards: GridCard[];
  //more than two columns on wide pages
  minCardWidth?: number;
  style?: StyleProp<ViewStyle>;
};

//framed tiles of the items a user added or installed
export default function CardGrid({ cards, minCardWidth, style }: CardGridProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const [width, setWidth] = useState(0);

  const columns = minCardWidth
    ? Math.max(2, Math.floor((width + Spacing.md) / (minCardWidth + Spacing.md)))
    : 2;
  //prevent wrapping subpixel overflow
  const cardWidth = width > 0 ? Math.floor((width - Spacing.md * (columns - 1)) / columns) - 1 : "47%";

  return (
    <View
      style={[styles.grid, style]}
      onLayout={(e) => {
        const measured = e.nativeEvent.layout.width;
        if (measured > 0 && measured !== width) setWidth(measured);
      }}
    >
      {cards.map((card, index) => {
        //a lone last card takes the row
        const lone = cards.length % columns === 1 && index === cards.length - 1;
        return (
          <Pressable
            key={card.key}
            disabled={card.disabled || !card.onPress}
            style={pressStyle([styles.card, { width: cardWidth, flexGrow: 1 }, lone && styles.cardWide], "surface")}
            onPress={() => {
              Vibration.vibrate(8);
              card.onPress?.();
            }}
          >
            {card.icon && <Image source={card.icon} style={styles.icon} tintColor={Colors.textPrimary} />}
            <Text style={styles.title} numberOfLines={2}>
              {card.title}
            </Text>
            <Text style={[styles.status, card.error && styles.error]} numberOfLines={1}>
              {card.status}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.md,
    },
    card: {
      borderWidth: 2,
      borderColor: Colors.border,
      borderRadius: Radius.xxl,
      backgroundColor: Colors.surface,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.lg,
      minHeight: 76,
      justifyContent: "center",
      alignItems: "center",
    },
    cardWide: {
      minHeight: 70,
    },
    icon: {
      width: 32,
      height: 32,
      marginBottom: Spacing.md,
    },
    title: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      lineHeight: 18,
      color: Colors.textPrimary,
      textAlign: "center",
      marginBottom: Spacing.xs,
    },
    status: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      color: Colors.textSecondary,
      textAlign: "center",
    },
    error: {
      color: Colors.error,
    },
  });
