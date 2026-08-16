import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { IWidget } from '../../services/widgets/WidgetManager';
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from '../../../constants/theme';
import { useThemedStyles } from '../../hooks/useTheme';

export interface MapsWidgetData {
  label?: string;
  title?: string;
  location?: string;
  points: {
    name: string;
    lat: number;
    lng: number;
  }[];
}

const generateMapHtml = (points: MapsWidgetData['points']) => {
  const markersJs = points.map(p =>
    `var m = L.marker([${p.lat}, ${p.lng}]).addTo(map).bindPopup("${p.name.replace(/"/g, '\\"')}");
     bounds.push([${p.lat}, ${p.lng}]);`
  ).join('\n');

  const polylineJs = points.length > 1
    ? `var route = L.polyline(bounds, {color: 'blue', weight: 4, opacity: 0.7, dashArray: '10, 10'}).addTo(map);`
    : '';

  const setViewJs = points.length === 1
    ? `map.setView([${points[0].lat}, ${points[0].lng}], 13);`
    : `map.fitBounds(bounds, { padding: [30, 30] });`;

  return `
<!DOCTYPE html>
<html>
<head>
    <title>Map</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        body { padding: 0; margin: 0; background-color: #f0f0f0; touch-action: none; overscroll-behavior: none; }
        html, body, #map { height: 100%; width: 100%; touch-action: none; overscroll-behavior: none; }
        .leaflet-control-attribution { display: none; }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        var map = L.map('map', { zoomControl: false });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        var bounds = [];
        ${markersJs}
        
        ${polylineJs}

        if (bounds.length > 0) {
            ${setViewJs}
        } else {
            map.setView([48.8566, 2.3522], 13); // default map center
        }
    </script>
</body>
</html>
  `;
};

export const MapsWidget: IWidget<MapsWidgetData> = {
  id: 'maps',
  name: 'Map',
  hasBorder: true,
  aiDefinesTitle: true,
  enabledByDefault: true,
  description: 'Displays an interactive map. "label" or "location" is a description of the displayed location or route (e.g. "Paris, France" or "Trip to Tokyo"). If multiple points are provided, it automatically draws a route connecting them.',
  schema: `{
    "label": "Paris, France",
    "points": [
      { "name": "Location Name", "lat": 48.8566, "lng": 2.3522 }
    ]
  }`,
  component: function MapsWidgetView({ data }) {
    const styles = useThemedStyles(makeStyles);
    const html = generateMapHtml(data.points || []);
    const caption = data.label || data.title || data.location;

    return (
      <View
        style={styles.container}
        //prevent parent gestures from intercepting
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onStartShouldSetResponderCapture={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onResponderTerminationRequest={() => false}
      >
        {!!caption && (
          <Text style={styles.caption} numberOfLines={1}>{caption}</Text>
        )}
        <View style={styles.mapWrapper}>
          {Platform.OS === 'web' ? (
            <iframe
              srcDoc={html}
              style={{ width: '100%', height: '100%', border: 'none', touchAction: 'none' }}
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <WebView
              source={{ html }}
              style={{ flex: 1, backgroundColor: 'transparent' }}
              scrollEnabled={false}
              bounces={false}
              javaScriptEnabled={true}
              nestedScrollEnabled={true}
              overScrollMode="never"
            />
          )}
        </View>
      </View>
    );
  }
};

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    width: '100%',
    gap: Spacing.xs,
  },
  caption: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
  },
  mapWrapper: {
    height: 300,
    width: '100%',
    backgroundColor: Colors.surfacePressed,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
});
