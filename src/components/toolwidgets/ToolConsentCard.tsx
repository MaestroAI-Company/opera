import { useSyncExternalStore } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from '../../../constants/theme';
import { useColors, useIsDark, useThemedStyles } from '../../hooks/useTheme';
import { useT } from '../../i18n';
import { ToolConsent } from '../../services/ai/tools/ToolConsent';
import { pressStyle } from '../ui/pressStyle';

const consentIcon = require('../../../assets/icons/confidentiality.png');

//inline approval for a waiting tool
export default function ToolConsentCard({ data, incognito }: { data: { id: string }; incognito?: boolean }) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const status = useSyncExternalStore(
    listener => ToolConsent.subscribe(listener),
    () => ToolConsent.status(data.id),
  );
  const prompt = ToolConsent.get(data.id);

  //answered cards leave the reply
  if (status === 'answered') return null;

  const cardBg = isDark ? Colors.responseSurface : Colors.surface;
  const borderColor = incognito ? Colors.incognito : isDark ? Colors.responseBorder : Colors.border;
  const titleColor = isDark ? Colors.responseTextStrong : Colors.textPrimary;
  const bodyColor = isDark ? Colors.responseText : Colors.textSecondary;

  //the turn died with the app
  if (!prompt) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <Text style={[styles.message, { color: bodyColor }]}>{t('tools.consent.expired')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.titleRow}>
        <Image source={consentIcon} style={styles.icon} tintColor={incognito ? Colors.incognito : Colors.primary} />
        <Text style={[styles.title, { color: titleColor }]}>{t(prompt.title, prompt.params)}</Text>
      </View>
      <Text style={[styles.message, { color: bodyColor }]}>{t(prompt.message, prompt.params)}</Text>
      <View style={styles.actionRow}>
        <Pressable
          onPress={() => ToolConsent.answer(data.id, 'deny')}
          style={pressStyle([styles.buttonSecondary, { borderColor }], 'surface')}
        >
          <Text style={[styles.buttonText, { color: titleColor }]}>{t('tools.consent.decline')}</Text>
        </Pressable>
        {!!prompt.always && (
          <Pressable
            onPress={() => ToolConsent.answer(data.id, 'always')}
            style={pressStyle([styles.buttonSecondary, { borderColor }], 'surface')}
          >
            <Text style={[styles.buttonText, { color: titleColor }]}>{t(prompt.always)}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => ToolConsent.answer(data.id, 'allow')}
          style={pressStyle(
            [styles.buttonPrimary, incognito && { backgroundColor: Colors.incognito }],
            {
              backgroundColor: incognito ? Colors.incognitoBright : Colors.primaryBright,
              borderColor: incognito ? Colors.incognitoBright : Colors.primaryBright,
            },
          )}
        >
          <Text style={[styles.buttonText, { color: Colors.textOnPrimary }]}>{t('tools.consent.allow')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

//shared frame with remote images
const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: Radius.xxl,
      borderWidth: 2,
      marginVertical: Spacing.md,
      overflow: 'hidden',
      shadowColor: Colors.shadowInk,
      shadowOffset: { width: -3, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.xs,
    },
    icon: {
      width: 16,
      height: 16,
    },
    title: {
      flexShrink: 1,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      letterSpacing: 0.5,
    },
    message: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      lineHeight: 18,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.sm,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.md,
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.lg,
      paddingTop: Spacing.xs,
    },
    buttonSecondary: {
      flexGrow: 1,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      borderRadius: Radius.xxl,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
    },
    buttonPrimary: {
      flexGrow: 1,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      borderRadius: Radius.xxl,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
    },
    buttonText: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
  });
