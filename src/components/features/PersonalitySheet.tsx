import { useState } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import {
  Fonts,
  FontSizes,
  Radius,
  Spacing,
  ThemeColors,
} from "../../../constants/theme";
import {
  PERSONALITY_DEPTHS,
  PERSONALITY_MOODS,
  PERSONALITY_STYLES,
  type PersonalitySettings,
} from "../../../constants/personality";
import { useT, type TranslationKey } from "../../i18n";
import { useThemedStyles } from "../../hooks/useTheme";
import { Settings } from "../../services/settings/SettingsService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import { pressStyle } from "../ui/pressStyle";
import DrawerSheet, { SheetScrollView } from "./DrawerSheet";

const validIcon = require("../../../assets/icons/valid.png");

const DESKTOP_CARD_WIDTH = 560;

type Slot = "mood" | "style" | "depth";

const SLOT_KEY: Record<Slot, keyof PersonalitySettings> = {
  mood: "maestroMood",
  style: "maestroStyle",
  depth: "maestroDepth",
};

const SLOT_ORDER: Slot[] = ["mood", "style", "depth"];

const SLOT_OPTIONS: Record<Slot, readonly string[]> = {
  mood: PERSONALITY_MOODS,
  style: PERSONALITY_STYLES,
  depth: PERSONALITY_DEPTHS,
};

export function readPersonality(): PersonalitySettings {
  const s = Settings.getCached();
  return {
    maestroMood: s.maestroMood,
    maestroStyle: s.maestroStyle,
    maestroDepth: s.maestroDepth,
  };
}

//sentence split around the slot placeholders
export function personalityParts(template: string): (string | Slot)[] {
  return template.split(/\{(mood|style|depth)\}/).filter(Boolean) as (
    string | Slot
  )[];
}

export function slotWord(
  t: ReturnType<typeof useT>,
  slot: Slot,
  value: string,
): string {
  return t(`settings.personality.${slot}.${value}` as TranslationKey);
}

type PersonalitySheetProps = {
  visible: boolean;
  onClose: () => void;
  onSaved: (value: PersonalitySettings) => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

export default function PersonalitySheet({
  visible,
  onClose,
  onSaved,
  isLargeScreen = false,
  isDesktop = false,
}: PersonalitySheetProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <DrawerSheet
      visible={visible}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={styles.sheet}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView contentContainerStyle={styles.content}>
        {/* remount on open for a fresh draft */}
        <PersonalityEditor
          key={String(visible)}
          onClose={onClose}
          onSaved={onSaved}
        />
      </SheetScrollView>
    </DrawerSheet>
  );
}

function PersonalityEditor({
  onClose,
  onSaved,
}: Pick<PersonalitySheetProps, "onClose" | "onSaved">) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const [draft, setDraft] = useState<PersonalitySettings>(readPersonality);
  const [slot, setSlot] = useState<Slot>("mood");

  //picking a value moves to the next slot
  const pick = (value: string) => {
    Vibration.vibrate(10);
    setDraft((d) => ({ ...d, [SLOT_KEY[slot]]: value }));
    const next = SLOT_ORDER[SLOT_ORDER.indexOf(slot) + 1];
    if (next) setSlot(next);
  };

  const save = () => {
    Settings.setMany(draft);
    onSaved(draft);
    onClose();
  };

  return (
    <View style={styles.sheetCard}>
      <Text style={styles.sentence}>
        {personalityParts(t("settings.personality.sentence")).map((part, i) =>
          part === "mood" || part === "style" || part === "depth" ? (
            <Text
              key={i}
              onPress={() => {
                Vibration.vibrate(10);
                setSlot(part);
              }}
              style={[styles.slot, slot === part && styles.slotActive]}
            >
              {` ${slotWord(t, part, draft[SLOT_KEY[part]])} `}
            </Text>
          ) : (
            <Text key={i}>{part}</Text>
          ),
        )}
      </Text>

      <View style={styles.chips}>
        {SLOT_OPTIONS[slot].map((value) => {
          const selected = draft[SLOT_KEY[slot]] === value;
          const word = slotWord(t, slot, value);
          return (
            <Pressable
              key={value}
              onPress={() => pick(value)}
              style={pressStyle(
                [styles.chip, selected && styles.chipSelected],
                selected ? "primary" : "surface",
              )}
            >
              <Text
                style={[styles.chipLabel, selected && styles.chipLabelSelected]}
              >
                {word.charAt(0).toUpperCase() + word.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Group style={styles.highlightGroup}>
        <ActionButton
          icon={validIcon}
          label={t("settings.personality.save")}
          onPress={save}
          variant="highlight"
        />
      </Group>
    </View>
  );
}

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
    sheetCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      padding: Spacing.md,
    },
    sentence: {
      fontSize: FontSizes.lg,
      //room for the framed slot words
      lineHeight: Spacing.xxxl,
      color: Colors.textMuted,
      fontFamily: Fonts.body,
      textAlign: "center",
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
    },
    slot: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.lg,
      color: Colors.textPrimary,
    },
    slotActive: {
      color: Colors.primary,
    },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: Spacing.md,
      marginVertical: Spacing.xxl,
    },
    chip: {
      borderWidth: 2,
      borderColor: Colors.border,
      borderRadius: Radius.xxl,
      backgroundColor: Colors.surface,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg2,
    },
    chipSelected: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    chipLabel: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
    },
    chipLabelSelected: {
      color: Colors.textOnPrimary,
    },
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
  });
