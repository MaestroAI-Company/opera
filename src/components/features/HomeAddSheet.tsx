import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { type IconSource } from "../ui/AppIcon";
import CardGrid from "../ui/CardGrid";
import DrawerSheet, { SheetScrollView } from "./DrawerSheet";

const DESKTOP_CARD_WIDTH = 720;
const TILE_ICON = 24;

export type HomeSectionChoice = {
  id: string;
  icon: IconSource;
  label: string;
};

type HomeAddSheetProps = {
  visible: boolean;
  //sections not on the home yet
  choices: HomeSectionChoice[];
  onAdd: (id: string) => void;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//hidden sections of the home, a tap puts one back at the end
export default function HomeAddSheet({
  visible,
  choices,
  onAdd,
  onClose,
  isLargeScreen = false,
  isDesktop = false,
}: HomeAddSheetProps) {
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
      sheetStyle={[
        styles.sheet,
        {
          maxHeight: windowHeight - insets.top - Spacing.xl2,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView contentContainerStyle={styles.content}>
        <View style={styles.sheetCard}>
          <CardGrid
            iconSize={TILE_ICON}
            cards={choices.map((choice) => ({
              key: choice.id,
              title: choice.label,
              icon: choice.icon,
              onPress: () => {
                onAdd(choice.id);
                onClose();
              },
            }))}
          />
        </View>
      </SheetScrollView>
    </DrawerSheet>
  );
}

//same values as the hub sheet
const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    sheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.groupedBackground,
      borderTopLeftRadius: Radius.huge2,
      borderTopRightRadius: Radius.huge2,
      paddingTop: Spacing.xxl,
      overflow: "hidden",
    },
    desktopCard: {
      width: DESKTOP_CARD_WIDTH,
    },
    sheetHandleContainer: {
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
    sheetCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
    },
  });
