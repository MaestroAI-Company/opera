import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { IWidget } from '../../services/widgets/WidgetManager';

export interface MermaidWidgetData {
  mermaid: string;
}

const generateMermaidHtml = (code: string) => {
  const safeCode = encodeURIComponent(code);
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
                let code = decodeURIComponent("${safeCode}");
                // replace literal newlines
                code = code.replace(/\\\\n/g, '<br/>');
                const { svg } = await mermaid.render('mermaid-svg', code);
                document.getElementById('container').innerHTML = svg;
            } catch (err) {
                let code = decodeURIComponent("${safeCode}");
                document.getElementById('container').innerHTML = '<div style="color:red; font-family:sans-serif; padding:10px;"><b>Syntax Error in Mermaid diagram</b><br/><pre style="font-size:10px; background:#eee; padding:5px; border-radius:5px; overflow-x:auto;">' + code.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre></div>';
            }
        }
        renderDiagram();
    </script>
    <style>
        body { margin: 0; padding: 16px; background-color: transparent; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: 'Jakarta', sans-serif; overflow: auto; }
        #container { background-color: transparent; max-width: 100%; display: flex; justify-content: center; }
        /* hide scrollbars */
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
  hasBorder: false, // no wrapper border
  aiDefinesTitle: false,
  description: 'Displays a flowchart, sequence diagram, or mindmap using Mermaid.js syntax. CRITICAL: Do NOT use \\n for line breaks inside diagram nodes or messages. You MUST use <br/> instead. Output valid Mermaid syntax in the "mermaid" property. When you explain something, you can use it to illustrate.',
  schema: `{
    "mermaid": "graph TD;\\nA-->B;"
  }`,
  component: ({ data }) => {
    const html = generateMermaidHtml(data.mermaid || 'graph TD;\\nError-->NoData;');

    return (
      <View style={styles.container}>
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
    );
  }
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 350,
    backgroundColor: 'transparent',
    marginVertical: 12,
  }
});
