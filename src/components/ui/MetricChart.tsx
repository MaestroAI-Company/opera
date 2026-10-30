import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import Group from "./Group";

//samples the graph shows at once, older ones leave on the left
export const CHART_POINTS = 30;
const CHART_HEIGHT = 200;
//a vertical mark every 6 samples, 30s at the poll rate
const MARK_EVERY = 6;
const LINE_WIDTH = 2;

export type ChartSeries = {
  label: string;
  //oldest first
  samples: number[];
  color: string;
  //top of the scale, follows the samples when missing
  max?: number;
};

type MetricChartProps = {
  title: string;
  //each line keeps its own scale
  series: ChartSeries[];
  //every sample ever taken, anchors the vertical marks in time
  received: number;
  //already formatted values per column
  table: { columns: string[]; rows: { label: string; values: string[] }[] };
};

//telemetry card: live line graphs in one outlined frame, then a value table
export default function MetricChart({ title, series, received, table }: MetricChartProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);

  const step = width / (CHART_POINTS - 1);
  //half the stroke stays inside the frame
  const usable = CHART_HEIGHT - LINE_WIDTH * 2;
  const pointsOf = ({ samples, max }: ChartSeries) => {
    //headroom keeps a flat line off the top edge
    const top = max ?? Math.max(1, ...samples) * 1.25;
    return samples
      .map((sample, i) => {
        const x = width - (samples.length - 1 - i) * step;
        const y = LINE_WIDTH + usable * (1 - Math.min(1, Math.max(0, sample / top)));
        return `${x},${y}`;
      })
      .join(" ");
  };

  //marks ride with the samples they were drawn at
  const marks: number[] = [];
  for (let back = 0; back < CHART_POINTS; back++) {
    const index = received - 1 - back;
    if (index < 0) break;
    if (index % MARK_EVERY === 0) marks.push(width - back * step);
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {series.length > 1 && (
          <View style={styles.legend}>
            {series.map((line) => (
              <View key={line.label} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: line.color }]} />
                <Text style={styles.legendLabel}>{line.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Group style={styles.chartGroup}>
        <View style={styles.chart} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <Svg width={width} height={CHART_HEIGHT}>
              {marks.map((x, i) => (
                <Line key={i} x1={x} y1={0} x2={x} y2={CHART_HEIGHT} stroke={Colors.border} strokeWidth={LINE_WIDTH} />
              ))}
              {series.map(
                (line) =>
                  line.samples.length > 1 && (
                    <Polyline
                      key={line.label}
                      points={pointsOf(line)}
                      fill="none"
                      stroke={line.color}
                      strokeWidth={LINE_WIDTH}
                      strokeLinejoin="round"
                    />
                  ),
              )}
            </Svg>
          )}
        </View>
      </Group>
      <Group style={styles.infoGroup}>
        <View style={styles.row}>
          <View style={styles.labelCell} />
          {table.columns.map((column) => (
            <Text key={column} style={styles.headerCell} numberOfLines={1}>
              {column}
            </Text>
          ))}
        </View>
        {table.rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={[styles.labelCell, styles.label]} numberOfLines={1}>
              {row.label}
            </Text>
            {row.values.map((value, i) => (
              <Text key={i} style={styles.valueCell} numberOfLines={1}>
                {value}
              </Text>
            ))}
          </View>
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
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: Spacing.md,
      paddingTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
    },
    title: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
    },
    legend: {
      flexDirection: "row",
      gap: Spacing.lg2,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    legendSwatch: {
      width: Spacing.lg2,
      height: LINE_WIDTH,
    },
    legendLabel: {
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
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
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: Spacing.lg2,
      paddingHorizontal: Spacing.lg2,
      gap: Spacing.lg2,
    },
    //wider for breakdown labels on phones
    labelCell: {
      flex: 4,
    },
    label: {
      fontSize: FontSizes.body,
      fontFamily: Fonts.mono,
      color: Colors.textPrimary,
    },
    headerCell: {
      flex: 3,
      textAlign: "right",
      color: Colors.textSecondary,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
    valueCell: {
      flex: 3,
      textAlign: "right",
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
  });
