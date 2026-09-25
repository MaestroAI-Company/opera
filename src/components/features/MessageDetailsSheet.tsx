import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import type { ToolCall } from "../../services/ai/tools/ITool";
import { MessageMetrics } from "../../services/db/DatabaseService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import { describeToolCall } from "../ui/MarkdownText";
import DrawerSheet from "./DrawerSheet";

const DESKTOP_CARD_WIDTH = 420;
const DESKTOP_MARGIN = 24;

const REFLECTION_KEYS = {
  none: "reflection.none",
  low: "reflection.low",
  high: "reflection.high",
} as const;

export type PreviewDetails = { model?: string; metrics?: MessageMetrics; thinkingText: string; toolCalls: ToolCall[] };

type MessageDetailsSheetProps = {
  details: PreviewDetails | null;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  bottomInset?: number;
};

//technical details of an assistant reply
export default function MessageDetailsSheet({ details, onClose, isLargeScreen = false, isDesktop = false, bottomInset = 0 }: MessageDetailsSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  //last details stay during close animation
  const [shown, setShown] = useState<PreviewDetails | null>(details);
  if (details && details !== shown) setShown(details);

  const metrics = shown?.metrics;
  const thinking = metrics?.thinking;
  const reflectionKey = thinking && thinking in REFLECTION_KEYS ? REFLECTION_KEYS[thinking as keyof typeof REFLECTION_KEYS] : null;
  const rows = [
    shown?.model ? { label: t("messageDetails.model"), value: shown.model } : null,
    metrics?.timeSec != null ? { label: t("messageDetails.time"), value: `${metrics.timeSec.toFixed(1)}s` } : null,
    metrics?.tokens != null ? { label: t("messageDetails.tokens"), value: String(metrics.tokens) } : null,
    metrics?.tokensPerSec != null ? { label: t("messageDetails.speed"), value: metrics.tokensPerSec.toFixed(1) } : null,
    metrics?.systemPrompt ? { label: t("messageDetails.prompt"), value: metrics.systemPrompt } : null,
    thinking ? { label: t("messageDetails.thinking"), value: reflectionKey ? t(reflectionKey) : thinking } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);
  //reasoning only when the model was asked to think
  const reasoning = thinking !== "none" ? shown?.thinkingText ?? "" : "";

  const centeredStyle = {
    position: "absolute" as const,
    left: Math.max(DESKTOP_MARGIN, (windowWidth - DESKTOP_CARD_WIDTH) / 2),
    top: Math.max(DESKTOP_MARGIN, windowHeight * 0.08),
    maxHeight: windowHeight * 0.84,
  };

  return (
    <DrawerSheet
      visible={!!details}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      //sheet may grow up to just under the status bar
      sheetStyle={[styles.sheet, { paddingBottom: (Platform.OS === "ios" ? 20 : 10) + bottomInset, maxHeight: windowHeight - insets.top - Spacing.xl2 }]}
      desktopStyle={[styles.desktopCard, centeredStyle]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {shown && (
          <>
            {rows.length > 0 && (
              <Group style={styles.infoGroup}>
                {rows.map(row => (
                  <ActionButton
                    key={row.label}
                    label={row.label}
                    rightElement={<Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">{row.value}</Text>}
                  />
                ))}
              </Group>
            )}
            {shown.toolCalls.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>{t("messageDetails.tools")}</Text>
                {shown.toolCalls.map((call, i) => (
                  <View key={i} style={styles.toolRow}>
                    <Text style={styles.toolName}>{`${i + 1}. ${describeToolCall(call).name}`}</Text>
                    {Object.keys(call.function.arguments).length > 0 && (
                      <Text style={styles.toolArgs} selectable={true}>
                        {Object.entries(call.function.arguments)
                          .map(([key, value]) => `${key}: ${[value].flat().map(v => typeof v === "string" ? v : JSON.stringify(v)).join(", ")}`)
                          .join("\n")}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
            {!!reasoning && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>{t("messageDetails.reasoning")}</Text>
                <Text style={styles.reasoningText} selectable={true}>{reasoning}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
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
    paddingTop: 12,
  },
  desktopCard: {
    backgroundColor: Colors.groupedBackground,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    boxShadow: `-6px 6px 0px ${Colors.shadowInk}`,
    elevation: 5,
    width: DESKTOP_CARD_WIDTH,
    overflow: "hidden",
  },
  sheetHandleContainer: {
    alignItems: "center",
    marginBottom: Spacing.xs2,
    paddingVertical: 10,
    marginTop: -10,
  },
  content: {
    paddingHorizontal: Spacing.lg2,
    paddingBottom: Spacing.lg,
    gap: Spacing.xxl2,
  },
  infoGroup: {
    borderRadius: Radius.xxl + Spacing.md,
    borderWidth: 0,
  },
  //label takes the rest of the row
  infoValue: {
    flexShrink: 1,
    maxWidth: "60%",
    textAlign: "right",
    color: Colors.textMuted,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl + Spacing.md,
    padding: Spacing.md,
  },
  cardLabel: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  toolRow: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
    gap: Spacing.xs2,
  },
  toolName: {
    fontSize: FontSizes.bodyMd,
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
  },
  toolArgs: {
    fontSize: FontSizes.label,
    color: Colors.textMuted,
    fontFamily: Fonts.mono,
    lineHeight: 18,
  },
  reasoningText: {
    fontSize: FontSizes.bodyMd,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    marginTop: Spacing.xs,
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
});
