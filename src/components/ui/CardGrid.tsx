import { useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, Vibration, View, ViewStyle } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import AppIcon, { IconSource } from "./AppIcon";
import { pressStyle } from "./pressStyle";

export type GridCard = {
  key: string;
  title: string;
  status?: string;
  icon?: IconSource;
  //small mark left of the title
  badge?: IconSource;
  error?: boolean;
  //0 to 1, the card itself fills with the primary color
  progress?: number;
  //red tile of a picked choice
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

type CardGridProps = {
  cards: GridCard[];
  //more than two columns on wide pages
  minCardWidth?: number;
  //one-line title cut with an ellipsis
  singleLineTitle?: boolean;
  //side of the card icon, 32 by default
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
};

//framed tiles of the items a user added or installed
export default function CardGrid({ cards, minCardWidth, singleLineTitle, iconSize, style }: CardGridProps) {
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
            style={pressStyle(
              [styles.card, { width: cardWidth, flexGrow: 1 }, lone && styles.cardWide, card.selected && styles.cardSelected],
              card.selected ? "primary" : "surface",
            )}
            onPress={() => {
              Vibration.vibrate(8);
              card.onPress?.();
            }}
          >
            {card.progress !== undefined && (
              <View
                pointerEvents="none"
                style={[styles.fill, { width: `${Math.max(0, Math.min(1, card.progress)) * 100}%` }]}
              />
            )}
            {card.icon && (
              <AppIcon
                source={card.icon}
                style={[styles.icon, iconSize !== undefined && { width: iconSize, height: iconSize }]}
                tintColor={Colors.textPrimary}
              />
            )}
            <View style={styles.titleRow}>
              {card.badge && <AppIcon source={card.badge} style={styles.badge} tintColor={Colors.textMuted} />}
              <Text style={[styles.title, card.selected && styles.titleSelected]} numberOfLines={singleLineTitle ? 1 : 2}>
                {card.title}
              </Text>
            </View>
            {!!card.status && (
              <Text style={[styles.status, card.error && styles.error, card.selected && styles.titleSelected]} numberOfLines={1}>
                {card.status}
              </Text>
            )}
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
      overflow: "hidden",
    },
    //grows from the left edge behind the content
    fill: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: Colors.primary,
    },
    cardWide: {
      minHeight: 70,
    },
    cardSelected: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    titleSelected: {
      color: Colors.textOnPrimary,
    },
    icon: {
      width: 32,
      height: 32,
      marginBottom: Spacing.md,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.sm,
      marginBottom: Spacing.xs,
      maxWidth: "100%",
    },
    badge: {
      width: 14,
      height: 14,
    },
    title: {
      flexShrink: 1,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      lineHeight: 18,
      color: Colors.textPrimary,
      textAlign: "center",
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
