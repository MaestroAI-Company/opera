import { ImageSourcePropType, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import ImageCard from "../ui/ImageCard";
import DrawerSheet, { SheetScrollView } from "./DrawerSheet";

const DESKTOP_CARD_WIDTH = 420;

export type HelpSection = {
  title?: string;
  body: string;
};

type HelpSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  image?: ImageSourcePropType;
  //one card per group
  cards: HelpSection[][];
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//explains a feature and how to use it
export default function HelpSheet({
  visible,
  onClose,
  title,
  image,
  cards,
  isLargeScreen = false,
  isDesktop = false,
}: HelpSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <DrawerSheet
      visible={visible}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[styles.sheet, { maxHeight: windowHeight - insets.top - Spacing.xl2 }]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView contentContainerStyle={styles.content}>
        {cards.map((sections, index) => (
          <View key={index} style={styles.contentCard}>
            {index === 0 && image && (
              <ImageCard source={image} width="100%" style={styles.image} />
            )}
            {index === 0 && <Text style={styles.title}>{title}</Text>}
            {sections.map((section, i) => (
              <View key={i}>
                {!!section.title && <Text style={styles.sectionTitle}>{section.title}</Text>}
                <Text style={styles.body}>{section.body}</Text>
              </View>
            ))}
          </View>
        ))}
      </SheetScrollView>
    </DrawerSheet>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.groupedBackground,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingTop: Spacing.xxl,
  },
  desktopCard: {
    width: DESKTOP_CARD_WIDTH,
  },
  sheetHandleContainer: {
    //floats so top edge matches sides
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  content: {
    paddingHorizontal: Spacing.lg2,
    paddingBottom: Spacing.lg,
    gap: Spacing.xxl2,
  },
  image: {
    marginBottom: Spacing.lg2,
  },
  contentCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl + Spacing.md,
    borderWidth: 0,
    padding: Spacing.md,
  },
  title: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  body: {
    fontSize: FontSizes.body,
    lineHeight: 22,
    color: Colors.textSecondary,
    fontFamily: Fonts.body,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
});
