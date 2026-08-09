import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts, FontSizes, Spacing } from '../../../constants/theme';
import { IWidget } from '../../services/widgets/WidgetManager';

export interface WeatherItem {
  label?: string;
  icon: string;
  temp: number;
  max?: number;
  min?: number;
}

export interface WeatherWidgetData {
  mode?: 'now' | 'hourly' | 'daily';
  unit?: string;
  items: WeatherItem[];
}

const ICONS: Record<string, any> = {
  clear_day: require('../../../assets/icons/weather/clear_day.png'),
  moon_stars: require('../../../assets/icons/weather/moon_stars.png'),
  partly_cloudy_day: require('../../../assets/icons/weather/partly_cloudy_day.png'),
  partly_cloudy_night: require('../../../assets/icons/weather/partly_cloudy_night.png'),
  cloud: require('../../../assets/icons/weather/cloud.png'),
  rainy: require('../../../assets/icons/weather/rainy.png'),
  thunderstorm: require('../../../assets/icons/weather/thunderstorm.png'),
  foggy: require('../../../assets/icons/weather/foggy.png'),
  weather_hail: require('../../../assets/icons/weather/weather_hail.png'),
};

const formatTemp = (value: number, unit: string) => `${Math.round(value)}°${unit}`;

const formatRange = (item: WeatherItem) => {
  if (item.max === undefined || item.min === undefined) return null;
  return `${Math.round(item.max)}°/${Math.round(item.min)}°`;
};

export const WeatherWidget: IWidget<WeatherWidgetData> = {
  id: 'weather',
  name: 'Weather',
  hasBorder: true,
  aiDefinesTitle: true,
  enabledByDefault: true,
  icon: ICONS.clear_day,
  description: 'Displays a weather forecast for a location. REQUIRED title="CITY": the title attribute MUST contain ONLY the city name (e.g. title="Paris"), never add other words like "Weather", "Forecast", "Météo" or the date. Choose EXACTLY ONE mode and respect its item count: "now" = current conditions only (exactly 1 item, only the first item is displayed); "hourly" = the NEXT 4 HOURS (exactly 4 items, no more, no less); "daily" = the NEXT 4 DAYS (exactly 4 items, no more, no less). Never give more or fewer than 4 items for hourly and daily. The label is the hour ("14:00", "Now") in hourly mode and the day ("Today", "Tomorrow", "Friday") in daily mode. You do not know the weather: get it with the search tools first, then render this widget.',
  schema: `{
    "mode": "now | hourly | daily",
    "unit": "C",
    "items": [
      { "label": "Now", "icon": "clear_day", "temp": 27, "max": 29, "min": 18 }
    ]
  }
  RULES:
  - mode "now": exactly 1 item (current conditions).
  - mode "hourly": exactly 4 items, the next 4 hours.
  - mode "daily": exactly 4 items, the next 4 days.
  Allowed icon values: clear_day, moon_stars, partly_cloudy_day, partly_cloudy_night, cloud, rainy, thunderstorm, foggy, weather_hail`,
  component: ({ data }) => {
    let items = data.items || [];
    const unit = data.unit || 'C';
    const mode = data.mode || 'now';

    if (items.length === 0) return null;

    //enforce max of 4 items for hourly/daily, no more no less
    if (mode !== 'now') {
      items = items.slice(0, 4);
    }

    if (mode === 'now') {
      const item = items[0];
      const range = formatRange(item);

      return (
        <View style={styles.nowRow}>
          <Image source={ICONS[item.icon] || ICONS.cloud} style={styles.nowIcon} resizeMode="contain" />
          <View style={styles.nowValues}>
            <Text style={styles.nowTemp}>{formatTemp(item.temp, unit)}</Text>
            {range && <Text style={styles.range}>{range}</Text>}
          </View>
        </View>
      );
    }

    //scroll instead of squeezing columns when the forecast is long
    const isScrollable = items.length > 4;

    const columns = items.map((item, index) => {
      const range = formatRange(item);

      return (
        <View key={index} style={[styles.column, isScrollable ? styles.columnFixed : styles.columnFlex]}>
          <Text style={styles.temp}>{formatTemp(item.temp, unit)}</Text>
          {range && <Text style={styles.range}>{range}</Text>}
          <Image source={ICONS[item.icon] || ICONS.cloud} style={styles.icon} resizeMode="contain" />
          {item.label && <Text style={styles.label}>{item.label}</Text>}
        </View>
      );
    });

    if (isScrollable) {
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {columns}
        </ScrollView>
      );
    }

    return <View style={styles.row}>{columns}</View>;
  },
};

const styles = StyleSheet.create({
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  nowIcon: {
    width: 88,
    height: 88,
  },
  nowValues: {
    flex: 1,
    alignItems: 'flex-end',
  },
  nowTemp: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.displayLg,
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
  },
  column: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  columnFlex: {
    flex: 1,
  },
  columnFixed: {
    width: 76,
  },
  temp: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  range: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.micro,
    color: Colors.textMuted,
    marginTop: Spacing.xs2,
  },
  icon: {
    width: 44,
    height: 44,
    marginVertical: Spacing.md,
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.labelSm,
    color: Colors.textSecondary,
  },
});
