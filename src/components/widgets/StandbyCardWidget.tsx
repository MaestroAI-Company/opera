import { useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from '../../../constants/theme';
import { useThemedStyles } from '../../hooks/useTheme';
import { getLocale } from '../../i18n';
import { IWidget } from '../../services/widgets/WidgetManager';
import { Block } from '../toolwidgets/ToolWidgetBlocks';

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
    const [size, setSize] = useState({ width: 0, height: 0 });
    const rows = (data.rows ?? []).slice(0, 3);
    const list = (data.list ?? []).slice(0, 6);
    //one text size for the whole grid
    const long = rows.some((row) => row.slice(0, 2).some((value) => String(value).length > 16));

    const onLayout = (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };

    const hasText = rows.length > 0 || list.length > 0;
    //too short for a picture above the text
    const showImage = !!image && (!hasText || size.width > size.height * MIN_WIDE_RATIO || size.height >= MIN_STACK_HEIGHT);
    //wide area puts the picture beside the text
    const sideBySide = showImage && hasText && size.width > size.height * MIN_WIDE_RATIO;
    //long list splits in two columns when there is room
    const listColumns = list.length > 3 && (!showImage || sideBySide) && size.width > size.height * MIN_WIDE_RATIO ? 2 : 1;

    const facts = rows.length > 0 && (
      <View style={[styles.facts, { flex: rows.length + 0.4 }]}>
        {rows.map((row, index) => (
          //first row is the subject
          <View key={index} style={[styles.row, index === 0 && styles.rowLead]}>
            {row.slice(0, 2).map((value, i) => <Block key={i} text={String(value)} long={long} style={styles.block} />)}
          </View>
        ))}
      </View>
    );

    const items = list.length > 0 && (
      <View style={[styles.list, { flex: Math.max(1.5, Math.ceil(list.length / listColumns) * 0.6) }, listColumns === 2 && styles.listWrap]}>
        {list.map((item, index) => (
          <View key={index} style={[styles.listLine, listColumns === 2 && styles.listLineHalf]}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.listItem}>{`• ${item}`}</Text>
          </View>
        ))}
      </View>
    );

    const picture = showImage && (
      <Image source={{ uri: image! }} style={[styles.image, { flex: sideBySide ? 1 : hasText ? 3 : 1 }]} resizeMode="cover" />
    );

    return (
      <View onLayout={onLayout} style={[styles.container, sideBySide && styles.containerRow]}>
        {picture}
        {sideBySide ? <View style={styles.textColumn}>{facts}{items}</View> : <>{facts}{items}</>}
      </View>
    );
  },
};

//beside the picture above this width over height
const MIN_WIDE_RATIO = 1.5;
//below this the picture gives way to the text
const MIN_STACK_HEIGHT = 240;

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  //fills the parent, children take weighted shares
  container: {
    flex: 1,
    gap: Spacing.sm,
  },
  containerRow: {
    flexDirection: "row",
  },
  textColumn: {
    flex: 1,
    gap: Spacing.sm,
  },
  image: {
    minHeight: 0,
    minWidth: 0,
    borderRadius: Radius.window,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  facts: {
    gap: Spacing.sm,
  },
  block: {
    borderWidth: 0,
    borderRadius: Radius.window,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
  },
  rowLead: {
    flex: 1.4,
  },
  list: {
    borderRadius: Radius.window,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl2,
  },
  listWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: Spacing.xl2,
    alignContent: "space-around",
  },
  listLine: {
    flex: 1,
    justifyContent: "center",
  },
  listLineHalf: {
    flex: 0,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 28,
  },
  listItem: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
  },
});
