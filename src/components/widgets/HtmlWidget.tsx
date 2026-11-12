import { Platform, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { IWidget } from '../../services/widgets/WidgetManager';
import { Radius, ThemeColors } from '../../../constants/theme';
import { getColors, useThemedStyles } from '../../hooks/useTheme';
import { useT } from '../../i18n';
import WidgetTouchArea from './WidgetTouchArea';

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
  //read per prompt so generated html follows the accent
  get description() {
    return `Displays a web page (URL) or raw HTML. For raw HTML, use font-family: "Figtree", system-ui; text: #333; accent: ${getColors().primary}; background: #F9F9F9; border-radius: 12px.`;
  },
  schema: `{
    "html": "<html>...</html>",
    "url": "https://example.com",
    "height": 300
  }`,
  component: function HtmlWidgetView({ data }) {
    const styles = useThemedStyles(makeStyles);
    const t = useT();
    const source = data.html ? { html: data.html } : data.url ? { uri: data.url } : { html: `<p>${t('widget.html.empty')}</p>` };
    const widgetHeight = data.height || 300;

    return (
      <WidgetTouchArea style={[styles.container, { height: widgetHeight }]}>
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
            nestedScrollEnabled={true}
            overScrollMode="never"
          />
        )}
      </WidgetTouchArea>
    );
  }
};

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
  }
});
