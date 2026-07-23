import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { IWidget } from '../../services/widgets/WidgetManager';

export interface MapsWidgetData {
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
        body { padding: 0; margin: 0; background-color: #f0f0f0; }
        html, body, #map { height: 100%; width: 100%; }
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
  description: 'Displays an interactive map. If multiple points are provided, it automatically draws a route connecting them.',
  schema: `{
    "points": [
      { "name": "Location Name", "lat": 48.8566, "lng": 2.3522 }
    ]
  }`,
  component: ({ data }) => {
    const html = generateMapHtml(data.points || []);

    return (
      <View style={styles.container}>
        {Platform.OS === 'web' ? (
          <iframe
            srcDoc={html}
            style={{ width: '100%', height: '100%', border: 'none' }}
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <WebView
            source={{ html }}
            style={{ flex: 1, backgroundColor: 'transparent' }}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled={true}
          />
        )}
      </View>
    );
  }
};

const styles = StyleSheet.create({
  container: {
    height: 300,
    width: '100%',
    backgroundColor: '#EAEAEA',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
  }
});
