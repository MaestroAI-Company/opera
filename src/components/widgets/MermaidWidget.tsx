import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { IWidget } from '../../services/widgets/WidgetManager';
import { FontSizes, Fonts, Spacing, ThemeColors } from '../../../constants/theme';
import { useThemedStyles } from '../../hooks/useTheme';

export interface MermaidWidgetData {
  mermaid: string;
}

// sanitize in TS scope so regex escaping works correctly
function sanitizeMermaid(code: string): string {
  code = code.replace(/--<\|>/g, '<-->');
  code = code.replace(/^\s*style\s+\w+\s+fill:[^;]+;?\s*$/gm, '');
  code = code.replace(/^\s*note_\w+\[.*?\]\s*--.*?note_\w+\[.*?\];?\s*$/gm, '');
  code = code.replace(/^\s*note_\w+\[.*?\];?\s*$/gm, '');
  code = code.replace(/^(\s*(?:subgraph|end).*?);$/gm, '$1');
  code = code.replace(/\n{3,}/g, '\n\n');
  return code.trim();
}

const generateMermaidHtml = (rawCode: string) => {
  const processed = sanitizeMermaid(rawCode.replace(/\\n/g, '<br/>'));
  const safeCode = encodeURIComponent(processed);
  const safeFallback = encodeURIComponent(rawCode);

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

        async function renderDiagram() {
            try {
                const code = decodeURIComponent("${safeCode}");
                const { svg } = await mermaid.render('mermaid-svg', code);
                document.getElementById('container').innerHTML = svg;
            } catch (err) {
                const raw = decodeURIComponent("${safeFallback}");
                document.getElementById('container').innerHTML =
                    '<pre style="font-size:11px; font-family:monospace; background:#f4f4f4; padding:12px; border-radius:8px; overflow-x:auto; color:#333; white-space:pre-wrap;">' +
                    raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
                    '</pre>';
            }
        }
        renderDiagram();
    <\/script>
    <style>
        body { margin: 0; padding: 16px; background-color: transparent; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: 'Figtree', sans-serif; overflow: auto; }
        #container { background-color: transparent; max-width: 100%; display: flex; justify-content: center; }
        ::-webkit-scrollbar { width: 0px; height: 0px; }
    </style>
</head>
<body>
    <div id="container"></div>
</body>
</html>
  `;
};

export const MermaidWidget: IWidget<MermaidWidgetData> = {
  id: 'diagram',
  name: 'Diagram',
  hasBorder: true,
  aiDefinesTitle: false,
  enabledByDefault: true,
  description: 'Displays a flowchart, sequence diagram, or mindmap using Mermaid.js syntax. CRITICAL: Do NOT use \\n for line breaks inside diagram nodes or messages. You MUST use <br/> instead. Output valid Mermaid syntax in the "mermaid" property. When you explain something, you can use it to illustrate.',
  schema: `{
    "mermaid": "graph TD;\\nA-->B;"
  }`,
  component: function MermaidWidgetView({ data, title }) {
    const styles = useThemedStyles(makeStyles);
    const html = generateMermaidHtml(data.mermaid || 'graph TD;\\nError-->NoData;');

    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title || 'Diagram'}</Text>
        <View style={styles.diagram}>
          {Platform.OS === 'web' ? (
            <iframe
              srcDoc={html}
              style={{ width: '100%', height: '100%', border: 'none', backgroundColor: 'transparent' }}
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
      </View>
    );
  }
};

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    width: '100%',
  },
  title: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  diagram: {
    width: '100%',
    height: 350,
    backgroundColor: 'transparent',
  },
});
