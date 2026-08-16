import { StyleSheet, Text, View } from 'react-native';
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from '../../../constants/theme';
import { useColors, useThemedStyles } from '../../hooks/useTheme';

//container holding caption and block rows
export function BlockContainer({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.container}>{children}</View>;
}

//muted line describing the blocks
export function Caption({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.caption}>{text}</Text>;
}

//row holding the result blocks
export function BlockRow({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.row}>{children}</View>;
}

//symbol between blocks
export function BlockSymbol({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.symbol}>{text}</Text>;
}

interface BlockProps {
  text: string;
  //red fill for the main value
  filled?: boolean;
  //serif names else mono
  serif?: boolean;
  grow?: boolean;
  //incognito discussion swaps the fill to purple-gray
  incognito?: boolean;
}

export function Block({ text, filled, serif, grow = true, incognito }: BlockProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      style={[
        styles.block,
        filled ? styles.blockFilled : styles.blockOutlined,
        grow && styles.blockGrow,
        filled && incognito && { backgroundColor: Colors.incognito },
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          //long values step down not shrink
          text.length > 16 ? styles.blockTextLong : styles.blockText,
          serif ? styles.blockTextSerif : styles.blockTextMono,
          filled ? styles.blockTextOnPrimary : styles.blockTextPrimary,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  caption: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  symbol: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.displayMd,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.xs,
  },
  block: {
    borderRadius: Radius.md,
    borderWidth: 2,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockGrow: {
    flex: 1,
  },
  blockFilled: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
    borderWidth: 2,
  },
  blockOutlined: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  blockText: {
    fontSize: FontSizes.xxxl,
  },
  blockTextLong: {
    fontSize: FontSizes.displaySm,
  },
  blockTextMono: {
    fontFamily: Fonts.mono,
  },
  blockTextSerif: {
    fontFamily: Fonts.display,
  },
  blockTextOnPrimary: {
    color: Colors.textOnPrimary,
  },
  blockTextPrimary: {
    color: Colors.textPrimary,
  },
});
