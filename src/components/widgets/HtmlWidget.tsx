import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { IWidget } from '../../services/widgets/WidgetManager';
import { Colors, Radius } from '../../../constants/theme';

export interface HtmlWidgetData {
  html?: string;
  url?: string;
  height?: number;
}

export const HtmlWidget: IWidget<HtmlWidgetData> = {
  id: 'html',
  name: 'Web Page',
  hasBorder: true,
  aiDefinesTitle: true,
  enabledByDefault: true,
  description: 'Displays a web page (URL) or raw HTML. CRITICAL DESIGN RULES FOR RAW HTML: You MUST use modern CSS matching the app: font-family: "Figtree", system-ui, sans-serif; text color: #333333; primary accent color: #FF1A1A (red); backgrounds: #F9F9F9; rounded corners (12px); clean flexbox layouts with padding.',
  schema: `{
    "html": "<html>...</html>",
    "url": "https://example.com",
    "height": 300
  }`,
  component: ({ data }) => {
    const source = data.html ? { html: data.html } : data.url ? { uri: data.url } : { html: '<p>No content provided</p>' };
    const widgetHeight = data.height || 300;

    return (
      <View style={[styles.container, { height: widgetHeight }]}>
        {Platform.OS === 'web' ? (
          <iframe
            src={data.url}
            srcDoc={data.html}
            style={{ width: '100%', height: '100%', border: 'none' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <WebView
            source={source}
            style={{ flex: 1 }}
            scrollEnabled={true}
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
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    overflow: 'hidden',
  }
});
