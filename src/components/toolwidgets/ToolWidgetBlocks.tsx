import { StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts, FontSizes, Radius, Spacing } from '../../../constants/theme';

//muted line describing the blocks
export function Caption({ text }: { text: string }) {
  return <Text style={styles.caption}>{text}</Text>;
}

//row holding the result blocks
export function BlockRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

interface BlockProps {
  text: string;
  //red fill for the main value
  filled?: boolean;
  //serif names else mono
  serif?: boolean;
  grow?: boolean;
}

export function Block({ text, filled, serif, grow = true }: BlockProps) {
  return (
    <View style={[styles.block, filled ? styles.blockFilled : styles.blockOutlined, grow && styles.blockGrow]}>
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

const styles = StyleSheet.create({
  caption: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  block: {
    borderRadius: Radius.xxl,
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
    borderColor: Colors.primary,
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
