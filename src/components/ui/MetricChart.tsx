import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import ActionButton from "./ActionButton";
import Group from "./Group";

//samples the graph shows at once, older ones leave on the left
export const CHART_POINTS = 30;
const CHART_HEIGHT = 200;
//a vertical mark every 6 samples, 30s at the poll rate
const MARK_EVERY = 6;
const LINE_WIDTH = 2;

type MetricChartProps = {
  title: string;
  //oldest first
  samples: number[];
  //every sample ever taken, anchors the vertical marks in time
  received: number;
  //already formatted
  value: string;
  //top of the scale, follows the samples when missing
  max?: number;
  footerLabel: string;
  //what the value is made of, one info row each
  details?: { label: string; value: string }[];
};

//telemetry card: a live line graph in its own outlined frame, then one info row
export default function MetricChart({ title, samples, received, value, max, footerLabel, details = [] }: MetricChartProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);

  //headroom keeps a flat line off the top edge
  const top = max ?? Math.max(1, ...samples) * 1.25;
  const step = width / (CHART_POINTS - 1);
  //half the stroke stays inside the frame
  const usable = CHART_HEIGHT - LINE_WIDTH * 2;
  const points = samples
    .map((sample, i) => {
      const x = width - (samples.length - 1 - i) * step;
      const y = LINE_WIDTH + usable * (1 - Math.min(1, Math.max(0, sample / top)));
      return `${x},${y}`;
    })
    .join(" ");

  //marks ride with the samples they were drawn at
  const marks: number[] = [];
  for (let back = 0; back < CHART_POINTS; back++) {
    const index = received - 1 - back;
    if (index < 0) break;
    if (index % MARK_EVERY === 0) marks.push(width - back * step);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Group style={styles.chartGroup}>
        <View style={styles.chart} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <Svg width={width} height={CHART_HEIGHT}>
              {marks.map((x, i) => (
                <Line key={i} x1={x} y1={0} x2={x} y2={CHART_HEIGHT} stroke={Colors.border} strokeWidth={LINE_WIDTH} />
              ))}
              {samples.length > 1 && (
                <Polyline
                  points={points}
                  fill="none"
                  stroke={Colors.primary}
                  strokeWidth={LINE_WIDTH}
                  strokeLinejoin="round"
                />
              )}
            </Svg>
          )}
        </View>
      </Group>
      <Group style={styles.infoGroup}>
        {[{ label: footerLabel, value }, ...details.map((row) => ({ ...row, label: `- ${row.label}` }))].map((row) => (
          <ActionButton
            key={row.label}
            label={row.label}
            rightElement={
              <Text style={styles.infoValue} numberOfLines={1}>
                {row.value}
              </Text>
            }
          />
        ))}
      </Group>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      padding: Spacing.md,
      marginBottom: Spacing.xxl2,
    },
    title: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
      paddingTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
    },
    chartGroup: {
      marginBottom: Spacing.md,
    },
    chart: {
      height: CHART_HEIGHT,
    },
    infoGroup: {
      borderWidth: 0,
    },
    infoValue: {
      flexShrink: 1,
      maxWidth: "60%",
      textAlign: "right",
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
  });
