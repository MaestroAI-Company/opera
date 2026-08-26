import { Image, StyleSheet, Text, View } from 'react-native';
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from '../../../constants/theme';
import { useColors, useThemedStyles } from '../../hooks/useTheme';
import { useResponsive } from '../../hooks/useResponsive';
import { IWidget } from '../../services/widgets/WidgetManager';
import { Block, BlockContainer, Caption } from '../toolwidgets/ToolWidgetBlocks';

export interface WeatherItem {
  label?: string;
  icon: string;
  temp: number;
  max?: number;
  min?: number;
}

export interface WeatherWidgetData {
  description?: string;
  unit?: string;
  now: WeatherItem;
  forecast: WeatherItem[];
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
  description: 'Weather card with current conditions and forecast. title="CITY" (city name only). "description": condition text (e.g. "Sunny"). "now": 1 item with temp, max, min for the day. "forecast": exactly 4 items (hours OR days, never mixed), each with icon, temp, max, min. Search for weather data first, then render this widget.',
  schema: `{
    "description": "Sunny",
    "unit": "C",
    "now": { "icon": "clear_day", "temp": 23, "max": 28, "min": 21 },
    "forecast": [
      { "label": "18:00", "icon": "clear_day", "temp": 26, "max": 27, "min": 24 },
      { "label": "19:00", "icon": "partly_cloudy_day", "temp": 24, "max": 25, "min": 22 },
      { "label": "20:00", "icon": "cloud", "temp": 21, "max": 22, "min": 19 },
      { "label": "21:00", "icon": "cloud", "temp": 19, "max": 20, "min": 17 }
    ]
  }
  RULES:
  - "now": exactly 1 item, the current conditions, with max/min for the day.
  - "forecast": exactly 4 items with max/min each, either the next 4 hours or the next 4 days (not both, no more, no less).
  Allowed icon values: clear_day, moon_stars, partly_cloudy_day, partly_cloudy_night, cloud, rainy, thunderstorm, foggy, weather_hail`,
  component: function WeatherWidgetView({ data, title, incognito }) {
    const Colors = useColors();
    const styles = useThemedStyles(makeStyles);
    const { isDesktop } = useResponsive();
    const now = data.now;
    if (!now) return null;

    const unit = data.unit || 'C';
    //enforce max of 4 items, no more no less
    const forecast = (data.forecast || []).slice(0, 4);
    const nowRange = formatRange(now);
    const caption = [title, data.description].filter(Boolean).join(' ');

    return (
      <BlockContainer>
        {!!caption && <Caption text={caption} />}

        <View style={[styles.nowRow, isDesktop && styles.nowRowLarge]}>
          <View style={[styles.iconTile, incognito && { backgroundColor: Colors.incognito }]}>
            <Image source={ICONS[now.icon] || ICONS.cloud} style={styles.iconTileImage} resizeMode="contain" />
          </View>
          <View style={styles.nowValues}>
            <Block text={formatTemp(now.temp, unit)} />
            {!!nowRange && <Block text={nowRange} />}
          </View>
        </View>

        {forecast.length > 0 && (
          <View style={styles.forecastBox}>
            <View style={[styles.forecastRow, isDesktop && styles.forecastRowLarge]}>
              {forecast.map((item, index) => {
                const range = formatRange(item);

                return (
                  <View key={index} style={styles.column}>
                    <Text style={styles.temp}>{formatTemp(item.temp, unit)}</Text>
                    {!!range && <Text style={styles.columnRange}>{range}</Text>}
                    <Image source={ICONS[item.icon] || ICONS.cloud} style={styles.icon} resizeMode="contain" />
                    {!!item.label && <Text style={styles.label}>{item.label}</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </BlockContainer>
    );
  },
};

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  //icon + now values, stretched so the value column fills the icon's height
  nowRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  //taller on desktop, elongates the whole card
  nowRowLarge: {
    minHeight: 160,
  },
  //same filled treatment as the primary Block, sized to a square
  iconTile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileImage: {
    width: '55%',
    height: '55%',
    tintColor: Colors.textOnPrimary,
  },
  nowValues: {
    flex: 1,
    gap: Spacing.sm,
  },
  //outlined like the value Blocks, wraps the whole forecast strip
  forecastBox: {
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  forecastRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
  },
  forecastRowLarge: {
    paddingVertical: Spacing.xl2,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  temp: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  columnRange: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.micro,
    color: Colors.textMuted,
    marginTop: Spacing.xs2,
  },
  icon: {
    width: 44,
    height: 44,
    marginVertical: Spacing.md,
    tintColor: Colors.textPrimary,
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.labelSm,
    color: Colors.textSecondary,
  },
});
