import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from '../../../constants/theme';
import { useThemedStyles } from '../../hooks/useTheme';
import { getLocale } from '../../i18n';
import { IWidget } from '../../services/widgets/WidgetManager';
import { Block, BlockRow } from '../toolwidgets/ToolWidgetBlocks';

export interface StandbyCardData {
  image?: string;
  rows?: string[][];
  list?: string[];
  open?: { label: string; url: string };
}

//lead picture of the closest wikipedia article
async function findImage(query: string, lang: string): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=800&gsrsearch=${encodeURIComponent(query)}`;
  const json = await (await fetch(url)).json();
  const page: any = Object.values(json?.query?.pages ?? {})[0];
  return page?.thumbnail?.source ?? null;
}

function useWikiImage(query?: string): string | null {
  const [result, setResult] = useState<{ query: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const lang = getLocale().split('-')[0];
    findImage(query, lang)
      .then((found) => found ?? (lang === 'en' ? null : findImage(query, 'en')))
      .then((uri) => { if (!cancelled) setResult({ query, uri }); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [query]);
  //a stale lookup never shows
  return result && result.query === query ? result.uri : null;
}

export const StandbyCardWidget: IWidget<StandbyCardData> = {
  id: 'standby_card',
  name: 'Standby card',
  hasBorder: true,
  aiDefinesTitle: false,
  standbyOnly: true,
  description: 'Key facts shown in large on the standby screen, with an optional picture.',
  schema: `{
    "image": "Carl Pei",
    "rows": [["Carl Pei", "37 ans"], ["CEO of Nothing"]],
    "list": ["Co-founded OnePlus in 2013", "Founded Nothing in 2020"],
    "open": { "label": "Open Wikipedia", "url": "https://en.wikipedia.org/wiki/Carl_Pei" }
  }`,
  component: function StandbyCardView({ data }) {
    const styles = useThemedStyles(makeStyles);
    const image = useWikiImage(data.image);
    const rows = (data.rows ?? []).slice(0, 3);
    const list = (data.list ?? []).slice(0, 6);

    return (
      <View style={styles.container}>
        {!!image && <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />}
        {rows.map((row, index) => (
          <BlockRow key={index}>
            {row.slice(0, 2).map((value, i) => <Block key={i} text={String(value)} />)}
          </BlockRow>
        ))}
        {list.length > 0 && (
          <View style={styles.list}>
            {list.map((item, index) => (
              <Text key={index} style={styles.listItem}>{`• ${item}`}</Text>
            ))}
          </View>
        )}
      </View>
    );
  },
};

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  //sized by its content
  container: {
    maxHeight: "100%",
    gap: Spacing.sm,
  },
  //gives way first when facts pile up
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
    flexShrink: 1,
    minHeight: 0,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  list: {
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl2,
    gap: Spacing.xs,
  },
  listItem: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
  },
});
