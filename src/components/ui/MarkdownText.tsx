import React, { useEffect, useMemo, useState } from "react";
import { Animated, Linking, StyleSheet, Text, View, Image } from "react-native";
import AutoHeightWebView from "react-native-autoheight-webview";
import CodeHighlighter from "react-native-code-highlighter";
import { vs2015 } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { Colors, Fonts, FontSizes, Radius, Spacing } from "../../../constants/theme";
import { ensureKatexStylesheet, getKatexCss, KATEX_STYLESHEET_NAME } from "./katexStylesheet";
import { WidgetManager } from "../../services/widgets/WidgetManager";
import WidgetWrapper from "../widgets/WidgetWrapper";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";

const toolIcon = require("../../../assets/icons/tool.png");

const ToolCallBubble = ({ toolName, isGenerating }: { toolName: string, isGenerating?: boolean }) => {
  const opacity = useAnimatedValue(isGenerating ? 0.4 : 1);

  useEffect(() => {
    if (isGenerating) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      opacity.setValue(1);
    }
  }, [isGenerating, opacity]);

  return (
    <View style={s.toolCallBubble}>
      <Image source={toolIcon} style={s.toolCallIcon} />
      <Animated.Text style={[s.toolCallLabel, { opacity }]}>
        {isGenerating ? `Using tool: ${toolName}...` : `Used tool: ${toolName}`}
      </Animated.Text>
    </View>
  );
};

const s = StyleSheet.create({
  base: { fontSize: FontSizes.lg, lineHeight: 26, color: Colors.textPrimary, fontFamily: Fonts.body },
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },
  code: {
    fontFamily: Fonts.mono,
    backgroundColor: Colors.surfaceCode,
    color: Colors.codeInlineText,
    paddingHorizontal: 4,
    borderRadius: Radius.sm,
    fontSize: FontSizes.caption,
  },
  codeBlock: {
    fontFamily: Fonts.mono,
    backgroundColor: Colors.codeBlockBg,
    color: Colors.codeBlockText,
    padding: 8,
    borderRadius: Radius.lg,
    fontSize: FontSizes.caption,
    lineHeight: 18,
    marginVertical: 4,
  },
  h1: { fontSize: FontSizes.displaySm, fontWeight: "bold", marginTop: 8, marginBottom: 4, color: Colors.textPrimary },
  h2: { fontSize: FontSizes.xl, fontWeight: "bold", marginTop: 7, marginBottom: 3, color: Colors.textPrimary },
  h3: { fontSize: FontSizes.title, fontWeight: "bold", marginTop: 6, marginBottom: 3, color: Colors.textPrimary },
  h4: { fontSize: FontSizes.body, fontWeight: "bold", marginTop: 5, marginBottom: 3, color: Colors.textPrimary },
  paragraph: { marginVertical: 2 },
  spacing: { height: 8 },
  strike: { textDecorationLine: "line-through" },
  link: { color: Colors.primary, textDecorationLine: "underline" },
  tableCell: { fontSize: FontSizes.body, lineHeight: 20, color: Colors.textPrimary, fontFamily: Fonts.body },
  tableCellBox: { flex: 1, paddingHorizontal: 8, paddingVertical: 6 },
  inlineRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  toolCallBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.overlayFaint,
    padding: Spacing.lg,
    borderRadius: Radius.lg2,
    marginVertical: Spacing.sm,
    alignSelf: "flex-start",
  },
  toolCallIcon: {
    width: 18,
    height: 18,
    marginRight: Spacing.md,
    opacity: 0.7,
    tintColor: Colors.textSecondary,
  },
  toolCallLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  widgetLoading: {
    padding: Spacing.xl2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.overlayFaint,
    borderRadius: Radius.lg2,
    marginVertical: Spacing.md,
  },
  mathBlock: {
    width: "100%",
    marginVertical: Spacing.md,
    minHeight: 40,
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  widgetLoadingText: {
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
});

type Token =
  | { type: "text"; content: string }
  | { type: "bold"; children: Token[] }
  | { type: "italic"; children: Token[] }
  | { type: "strike"; children: Token[] }
  | { type: "code"; content: string }
  | { type: "link"; url: string; children: Token[] };

function parseInline(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    // strikethrough ~~
    if (text[i] === "~" && text[i + 1] === "~") {
      const end = text.indexOf("~~", i + 2);
      if (end !== -1) {
        tokens.push({ type: "strike", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    // link [text](url)
    if (text[i] === "[") {
      const close = text.indexOf("]", i + 1);
      if (close !== -1 && text[close + 1] === "(") {
        const closeParen = text.indexOf(")", close + 2);
        if (closeParen !== -1) {
          const url = text.slice(close + 2, closeParen).trim();
          if (url) {
            tokens.push({ type: "link", url, children: parseInline(text.slice(i + 1, close)) });
            i = closeParen + 1;
            continue;
          }
        }
      }
      tokens.push({ type: "text", content: "[" });
      i++;
      continue;
    }
    // bold ** or __
    if ((text[i] === "*" && text[i + 1] === "*") || (text[i] === "_" && text[i + 1] === "_")) {
      const delim = text.slice(i, i + 2);
      const end = text.indexOf(delim, i + 2);
      if (end !== -1) {
        tokens.push({ type: "bold", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    // italic * or _
    if (text[i] === "*" || text[i] === "_") {
      const delim = text[i];
      // avoid matching ** or __
      if (text[i + 1] !== delim) {
        const end = text.indexOf(delim, i + 1);
        if (end !== -1 && end !== i + 1) {
          tokens.push({ type: "italic", children: parseInline(text.slice(i + 1, end)) });
          i = end + 1;
          continue;
        }
      }
    }
    // inline code `
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        tokens.push({ type: "code", content: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // plain text collect until next special char
    let j = i + 1;
    while (j < text.length && text[j] !== "*" && text[j] !== "_" && text[j] !== "`" && text[j] !== "~" && text[j] !== "[") j++;
    tokens.push({ type: "text", content: text.slice(i, j) });
    i = j;
  }

  return tokens;
}

function renderTokens(tokens: Token[], keyBase: number): React.ReactNode[] {
  return tokens.map((t, i) => {
    const key = `${keyBase}-${i}`;
    switch (t.type) {
      case "text":
        return <Text key={key}>{t.content}</Text>;
      case "bold":
        return <Text key={key} style={s.bold}>{renderTokens(t.children, keyBase + i)}</Text>;
      case "italic":
        return <Text key={key} style={s.italic}>{renderTokens(t.children, keyBase + i)}</Text>;
      case "strike":
        return <Text key={key} style={s.strike}>{renderTokens(t.children, keyBase + i)}</Text>;
      case "link":
        return (
          <Text key={key} style={s.link} onPress={() => { Linking.openURL(t.url).catch(() => {}); }}>
            {renderTokens(t.children, keyBase + i)}
          </Text>
        );
      case "code":
        return <Text key={key} style={s.code}>{t.content}</Text>;
      default:
        return null;
    }
  });
}

type ToolCallBlock = { start: number; end: number; json: string };

//scan raw toolcall json blocks in a non-code segment
function pushRawToolCallBlocks(md: string, from: number, to: number, blocks: ToolCallBlock[], allowPartial: boolean): void {
  let searchIndex = from;
  while (true) {
    const start = md.indexOf('{', searchIndex);
    if (start === -1 || start >= to) break;
    
    let braces = 0;
    let endIndex = -1;
    let inString = false;
    let escape = false;
    for (let j = start; j < to; j++) {
      const char = md[j];
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (!inString) {
        if (char === '{') braces++;
        else if (char === '}') braces--;
      }
      if (braces === 0 && j > start) { endIndex = j; break; }
    }
    
    const isPartial = endIndex === -1 && allowPartial;
    const blockEnd = endIndex !== -1 ? endIndex + 1 : to;
    const blockText = md.substring(start, blockEnd);
    
    const cleanBlockText = blockText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '');
    
    //accept open block as tool call
    const looksLikeTool = /^\{\s*"?\s*(?:tool[\s\n]*_[\s\n]*calls|name|function)\s*"?\s*:/i.test(cleanBlockText);
    const partialLooksLikeTool = isPartial && /^\{\s*"?\s*(?:tool[\s\n]*_[\s\n]*calls|name|function)/i.test(cleanBlockText);
    
    if (looksLikeTool || partialLooksLikeTool) {
      blocks.push({ start, end: blockEnd, json: blockText });
      searchIndex = blockEnd;
    } else {
      searchIndex = start + 1;
    }
  }
}

//scan toolcall json outside fences
function findToolCallBlocks(md: string, allowPartial = false): ToolCallBlock[] {
  const blocks: ToolCallBlock[] = [];
  const fenceRe = /```[^\n]*/g;
  let segmentStart = 0;
  let m;
  while ((m = fenceRe.exec(md)) !== null) {
    const fenceStart = m.index;
    pushRawToolCallBlocks(md, segmentStart, fenceStart, blocks, allowPartial);

    const headerLang = m[0].replace(/^```/, '').trim().split(' ')[0].toLowerCase();
    const contentStart = fenceStart + m[0].length;
    const closeRe = /```/g;
    closeRe.lastIndex = contentStart;
    const close = closeRe.exec(md);
    const contentEnd = close ? close.index : md.length;
    const closeEnd = close ? close.index + 3 : md.length;

    if (headerLang === '' || headerLang === 'json' || headerLang === 'toolcall') {
      const inner = md.substring(contentStart, contentEnd).trim();
      const cleanInner = inner.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
      const fullMatch = /^\{\s*"?\s*(?:tool[\s\n]*_[\s\n]*calls|name|function)\s*"?\s*:[\s\S]*\}$/i.test(cleanInner);
      const partialMatch = allowPartial && !close && /^\{\s*"?\s*(?:tool[\s\n]*_[\s\n]*calls|name|function)/i.test(cleanInner);
      if (fullMatch || partialMatch) {
        blocks.push({ start: fenceStart, end: closeEnd, json: inner });
      }
    }

    segmentStart = closeEnd;
    fenceRe.lastIndex = closeEnd;
  }
  pushRawToolCallBlocks(md, segmentStart, md.length, blocks, allowPartial);
  return blocks;
}

export function hasConversationalText(md: string): boolean {
  if (md === "…" || md.trim() === "") return false;
  let clean = md.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
  const blocks = findToolCallBlocks(clean);
  for (let k = blocks.length - 1; k >= 0; k--) {
    clean = clean.substring(0, blocks[k].start) + clean.substring(blocks[k].end);
  }
  return clean.trim().length > 0;
}

//extract tool names from json
export function parseToolNames(json: string): string[] {
  const clean = json.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
  const names: string[] = [];
  try {
    const data = JSON.parse(clean);
    if (data?.tool_calls && Array.isArray(data.tool_calls)) {
      data.tool_calls.forEach((tc: any) => {
        if (tc?.function?.name) names.push(tc.function.name);
      });
    } else if (data?.name) {
      names.push(data.name);
    }
  } catch {
    const nameMatches = clean.matchAll(/"name"\s*:\s*"([^"]+)"/g);
    for (const match of nameMatches) names.push(match[1]);
  }
  return names;
}

//last visible thinking step for the thinking row
export function extractThinkStep(thinkingText: string): string {
  const stepRegex = /^\s*(?:(?:\d+[.)!]|[-*])\s*)?\*\*(.*?)\*\*/gm;
  const steps: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(thinkingText)) !== null) {
    steps.push(match[1].replace(/:$/, '').trim());
  }
  if (steps.length > 0) return `${steps.length}. ${steps[steps.length - 1]}`;
  const lines = thinkingText.split('\n').filter(l => l.trim().length > 0);
  return lines.length > 0 ? lines[lines.length - 1] : 'Thinking...';
}

export type LiveTool = { name: string | null; args: any } | null;

export type ChatDisplay = {
  thinkingText: string;
  toolNames: string[];
  finalContent: string;
  showThinkingRow: boolean;
  showMarkdown: boolean;
  currentThought: string;
};

//single source for bubble display state
export function deriveChatDisplay(raw: string, isGenerating: boolean, liveTool: LiveTool, canThink = false): ChatDisplay {
  const normalized = raw === '…' ? '' : raw;
  const thinkMatches = [...normalized.matchAll(/<think>([\s\S]*?)(?:<\/think>|$)/g)];
  const thinkingText = thinkMatches.map(m => m[1].trim()).filter(t => t.length > 0).join('\n');

  const stripped = normalized.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '');
  const blocks = findToolCallBlocks(stripped, isGenerating);

  //keep tool json for bubbles
  //strip blocks to compute presence
  let contentOnly = stripped;
  const contentToolNames: string[] = [];
  for (let k = blocks.length - 1; k >= 0; k--) {
    const b = blocks[k];
    contentOnly = contentOnly.substring(0, b.start) + contentOnly.substring(b.end);
    contentToolNames.push(...parseToolNames(b.json));
  }

  const toolNames: string[] = [];
  for (const n of contentToolNames) {
    if (n && n !== 'Tool' && !toolNames.includes(n)) toolNames.push(n);
  }
  const liveName = isGenerating ? liveTool?.name : null;
  if (liveName && !toolNames.includes(liveName)) toolNames.push(liveName);

  const hasConvText = contentOnly.trim().length > 0;
  const hasTool = toolNames.length > 0;

  let showThinkingRow = false;
  let currentThought = '';
  if (isGenerating) {
    showThinkingRow = thinkingText.length > 0 || (!hasConvText && !hasTool);
    if (thinkingText.length > 0) {
      currentThought = extractThinkStep(thinkingText);
    } else if (liveName) {
      currentThought = liveName === 'web_search'
        ? `Searching the web for "${liveTool?.args?.query || ''}"...`
        : `Running tool: ${liveName}...`;
    } else if (canThink) {
      currentThought = 'Thinking...';
    }
  }

  const showMarkdown = hasConvText || hasTool;
  return { thinkingText, toolNames, finalContent: stripped, showThinkingRow, showMarkdown, currentThought };
}

function splitMath(text: string): { kind: "text" | "math"; content: string }[] {
  const parts: { kind: "text" | "math"; content: string }[] = [];
  const re = /\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: "text", content: text.slice(last, m.index) });
    parts.push({ kind: "math", content: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", content: text.slice(last) });
  return parts;
}

//webview gets prebuilt markup
const KATEX_HTML = (renderedMath: string, textSize: number, textColor: string, stylesheetDirectory: string | null): string => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
${stylesheetDirectory ? `<link rel="stylesheet" href="${KATEX_STYLESHEET_NAME}">` : `<style>${getKatexCss()}</style>`}
<style>
  body { margin: 0; padding: 0; background: transparent; }
  #math { font-size: ${textSize}px; color: ${textColor}; padding: 2px 0; }
</style>
</head>
<body>
<div id="math">${renderedMath}</div>
</body>
</html>
`;

//plain helpers need manual memo
const MathView = React.memo(function MathView({ latex, displayMode, width, incognito, dark }: { latex: string; displayMode: boolean; width?: number; incognito?: boolean; dark?: boolean }) {
  const [height, setHeight] = useState(displayMode ? 40 : 34);
  //undefined while writing stylesheet
  const [stylesheetDirectory, setStylesheetDirectory] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    ensureKatexStylesheet().then((directory) => {
      if (!cancelled) setStylesheetDirectory(directory);
    });
    return () => { cancelled = true; };
  }, []);

  const textColor = dark ? Colors.responseText : (incognito ? Colors.codeBlockText : Colors.textSecondary);

  const renderedMath = useMemo(() => {
    try {
      //lazy require keeps katex off startup
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const katex = require("katex");
      return katex.renderToString(latex, { displayMode, throwOnError: false });
    } catch {
      //malformed latex shows as text
      return latex;
    }
  }, [latex, displayMode]);

  const html = useMemo(
    () => KATEX_HTML(renderedMath, displayMode ? FontSizes.md : FontSizes.lg, textColor, stylesheetDirectory ?? null),
    [renderedMath, displayMode, textColor, stylesheetDirectory]
  );

  //nothing until stylesheet ready
  if (stylesheetDirectory === undefined) {
    return <View style={{ width: width ?? undefined, height }} />;
  }

  return (
    <AutoHeightWebView
      style={{
        width: width ?? undefined,
        height,
        overflow: "hidden",
        marginHorizontal: displayMode ? 0 : 2,
        backgroundColor: "transparent",
      }}
      onSizeUpdated={(size) => {
        if (size.height > 0) setHeight(size.height + 2);
      }}
      source={stylesheetDirectory ? { html, baseUrl: stylesheetDirectory } : { html }}
      allowFileAccess={true}
      allowFileAccessFromFileURLs={true}
      originWhitelist={["*"]}
      scalesPageToFit={false}
      viewportContent={"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"}
      scrollEnabled={false}
    />
  );
});

function renderMathBlock(content: string, key: string, incognito?: boolean): React.ReactNode {
  const estWidth = Math.min(400, Math.max(70, content.length * 10));
  return <MathView key={key} latex={content} displayMode={false} width={estWidth} incognito={incognito} />;
}

function renderContent(text: string, keyBase: number, incognito?: boolean): React.ReactNode[] {
  return splitMath(text).map((part, i) => {
    if (part.kind === "math") {
      return renderMathBlock(part.content, `im-${keyBase}-${i}`, incognito);
    }
    return (
      <Text key={`im-${keyBase}-${i}`} style={s.base}>
        {renderTokens(parseInline(part.content), keyBase + i)}
      </Text>
    );
  });
}

function wrapContent(
  text: string,
  key: string,
  style: any,
  keyBase: number,
  incognito?: boolean,
  selColor?: string
): React.ReactNode {
  if (!text.includes("$")) {
    return (
      <Text key={key} style={style} selectable={true} selectionColor={selColor}>
        {renderTokens(parseInline(text), keyBase)}
      </Text>
    );
  }
  return (
    <View key={key} style={[s.inlineRow, style]}>
      {renderContent(text, keyBase, incognito)}
    </View>
  );
}

const LANG_ALIASES: Record<string, string> = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", sh: "bash", shell: "bash", zsh: "bash",
  yml: "yaml", "c++": "cpp", "objective-c": "objectivec", md: "markdown",
};

//rehighlighting a block is costly
const CodeBlock = React.memo(function CodeBlock({ code, language }: { code: string; language?: string }) {
  const lang = language ? LANG_ALIASES[language] ?? language : undefined;
  const textStyle = { fontFamily: Fonts.mono, fontSize: FontSizes.code, lineHeight: 18 } as const;
  if (!lang) {
    return (
      <Text style={[s.base, s.codeBlock]} selectable={true}>
        {code}
      </Text>
    );
  }
  return (
    <View style={[s.codeBlock, { backgroundColor: Colors.codeBlockBg }]}>
      <CodeHighlighter
        language={lang}
        hljsStyle={vs2015}
        textStyle={textStyle}
        scrollViewProps={{ nestedScrollEnabled: true }}
      >
        {code}
      </CodeHighlighter>
    </View>
  );
});

export function renderMarkdown(md: string, incognito?: boolean, isGenerating?: boolean, dark?: boolean): React.ReactNode[] {
  const selColor = incognito ? Colors.incognitoSelection : Colors.primarySelection;
  //dark variant text colors
  const textColor = dark ? Colors.responseText : undefined;
  const headingColor = dark ? Colors.responseTextStrong : undefined;
  const mutedColor = dark ? Colors.responseTextMuted : Colors.textMuted;
  const borderColor = dark ? Colors.responseBorder : Colors.codeBlockText;
  
  //wrap toolcall blocks for bubble rendering
  let processedMd = md;
  const blocks = findToolCallBlocks(processedMd, isGenerating);
  for (let k = blocks.length - 1; k >= 0; k--) {
    const b = blocks[k];
    processedMd = processedMd.substring(0, b.start) + '\n```toolcall\n' + b.json + '\n```\n' + processedMd.substring(b.end);
  }

  const lines = processedMd.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block ```
    if (line.trimStart().startsWith("```")) {
      const header = line.trimStart().substring(3).trim();
      const language = header.split(" ")[0].toLowerCase();
      const codeLines: string[] = [];
      i++;
      let isClosed = false;
      while (i < lines.length) {
        if (lines[i].trimStart().startsWith("```")) {
          isClosed = true;
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      
      if (language === "widget") {
        const idMatch = header.match(/id="([^"]+)"/);
        const titleMatch = header.match(/title="([^"]+)"/);
        const widgetId = idMatch ? idMatch[1] : null;
        const widgetTitle = titleMatch ? titleMatch[1] : undefined;
        
        const widget = widgetId ? WidgetManager.getWidget(widgetId) : undefined;
        if (widget) {
          if (!isClosed) {
            elements.push(
              <View key={`loading-${i}`} style={s.widgetLoading}>
                <Text style={s.widgetLoadingText}>
                  Generating widget {widgetTitle || widget.name}...
                </Text>
              </View>
            );
            continue;
          }

          let data;
          const rawJson = codeLines.join("\n");
          try {
            data = JSON.parse(rawJson);
          } catch (e1: any) {
            try {
              // sanitize raw json
              const sanitized = rawJson.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => {
                return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
              });
              data = JSON.parse(sanitized);
            } catch {
              // fallback to code block on parse error
              elements.push(
                <Text key={`code-${i}`} style={[s.base, s.codeBlock]} selectable={true} selectionColor={selColor}>
                  {`[Widget Data Error: ${e1.message}]\n${rawJson}`}
                </Text>
              );
              continue;
            }
          }

          elements.push(
            <WidgetWrapper key={`widget-${i}`} widget={widget} title={widgetTitle}>
              <widget.component data={data} />
            </WidgetWrapper>
          );
          continue;
        }
      }

      if (language === "toolcall") {
        const rawJson = codeLines.join("\n");
        let toolNames = parseToolNames(rawJson);
        
        if (toolNames.length === 0) {
          toolNames = ["Tool"];
        }

        toolNames.forEach((tName, idx) => {
          elements.push(
            <ToolCallBubble key={`toolcall-${i}-${idx}`} toolName={tName} isGenerating={isGenerating} />
          );
        });
        continue;
      }

      elements.push(
        <CodeBlock key={`code-${i}`} code={codeLines.join("\n")} language={language} />
      );
      continue;
    }

    // math block $$
    if (line.trimStart().startsWith("$$")) {
      const mathLines: string[] = [line];
      const isSingleLine = line.trimEnd().endsWith("$$") && line.trim().length > 4;

      if (isSingleLine) {
        i++;
      } else {
        i++;
        while (i < lines.length && !lines[i].includes("$$")) {
          mathLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) {
          mathLines.push(lines[i]);
          i++; //skip closing $$
        }
      }

      //latex without delimiters
      const latex = mathLines.join("\n").replace(/^\s*\$\$/, "").replace(/\$\$\s*$/, "").trim();
      elements.push(
        <View key={`math-${i}`} style={s.mathBlock}>
          <MathView latex={latex} displayMode={true} incognito={incognito} dark={dark} />
        </View>
      );
      continue;
    }

    // horizontal rule
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      elements.push(
        <View key={`hr-${i}`} style={{ height: 1, backgroundColor: incognito ? Colors.incognito : borderColor, marginVertical: 10 }} />
      );
      i++;
      continue;
    }

    // table
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const cellsOf = (l: string): string[] => {
        const cells = l.split("|").map((c) => c.trim());
        if (cells[0] === "") cells.shift();
        if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
        return cells;
      };
      const rows = tableLines.map(cellsOf);
      const isSep = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
      const sepIdx = rows.findIndex(isSep);
      const headerCells = sepIdx === 1 ? rows[0] : null;
      const bodyRows = sepIdx === 1 ? rows.slice(2) : rows;
      const colCount = Math.max(1, ...(headerCells ? [headerCells.length] : []), ...bodyRows.map((r) => r.length));
      const padCell = (cells: string[]): string[] => {
        const out = cells.slice();
        while (out.length < colCount) out.push("");
        return out;
      };
      const borderColor = incognito ? Colors.incognito : (dark ? Colors.responseBorder : Colors.codeBlockText);
      const headerBg = incognito ? Colors.incognitoHeader : (dark ? Colors.whiteFaint : Colors.primaryHeader);

      elements.push(
        <View key={`table-${i}`} style={{ borderWidth: 1, borderColor, borderRadius: Radius.lg, overflow: "hidden", marginVertical: 6 }}>
          {headerCells && (
            <View style={{ flexDirection: "row", backgroundColor: headerBg }}>
              {padCell(headerCells).map((c, ci) => (
                <View key={`h-${ci}`} style={[s.tableCellBox, ci < colCount - 1 && { borderRightWidth: 1, borderRightColor: borderColor }, { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
                  {wrapContent(c, `hc-${ci}`, [s.tableCell, s.bold, textColor && { color: textColor }], ci, incognito, selColor)}
                </View>
              ))}
            </View>
          )}
          {bodyRows.map((row, ri) => (
            <View key={`r-${ri}`} style={{ flexDirection: "row", backgroundColor: ri % 2 === 1 ? (incognito ? Colors.incognitoStripe : (dark ? Colors.overlaySubtle : Colors.overlayFaint)) : "transparent" }}>
              {padCell(row).map((c, ci) => (
                <View key={`b-${ri}-${ci}`} style={[s.tableCellBox, ci < colCount - 1 && { borderRightWidth: 1, borderRightColor: borderColor }, { borderTopWidth: 1, borderTopColor: borderColor }]}>
                  {wrapContent(c, `bc-${ri}-${ci}`, [s.tableCell, textColor && { color: textColor }], ci, incognito, selColor)}
                </View>
              ))}
            </View>
          ))}
        </View>
      );
      continue;
    }

    // headings
    const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const style = level === 1 ? s.h1 : level === 2 ? s.h2 : level === 3 ? s.h3 : s.h4;
      elements.push(
        wrapContent(headingMatch[2], `h-${i}`, [s.base, style, (dark ? headingColor : textColor) && { color: dark ? headingColor : textColor }], i, incognito, selColor)
      );
      i++;
      continue;
    }

    // unordered list
    const bulletMatch = line.match(/^([\s]*)([-*])\s+(.*)/);
    if (bulletMatch) {
      const depth = Math.min(2, Math.floor(bulletMatch[1].replace(/\t/g, "  ").length / 2));
      const glyph = ["•", "◦", "▪"][depth] || "•";
      elements.push(
        wrapContent(`${glyph} ${bulletMatch[3]}`, `li-${i}`, [s.base, s.paragraph, { paddingLeft: depth * 14 }, textColor && { color: textColor }], i, incognito, selColor)
      );
      i++;
      continue;
    }

    // ordered list
    const olMatch = line.match(/^[\s]*(\d+)\.\s+(.*)/);
    if (olMatch) {
      const itemLines = [`${olMatch[1]}. ${olMatch[2]}`];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !lines[i].trimStart().startsWith("```") &&
        !lines[i].trimStart().match(/^(#{1,4})\s/) &&
        !lines[i].trimStart().match(/^[-*]\s/) &&
        !lines[i].trimStart().match(/^\d+\.\s/) &&
        !lines[i].trimStart().startsWith("> ") &&
        !lines[i].trimStart().startsWith("|") &&
        !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
      ) {
        itemLines.push(lines[i].trim());
        i++;
      }
      elements.push(
        wrapContent(itemLines.join("\n"), `oli-${i}`, [s.base, s.paragraph, textColor && { color: textColor }], i, incognito, selColor)
      );
      continue;
    }

    // blockquote
    if (line.trimStart().startsWith("> ")) {
      const quoteText = line.replace(/^[\s]*>\s?/, "");
      elements.push(
        wrapContent(quoteText, `quote-${i}`, [s.base, { borderLeftColor: incognito ? Colors.incognito : (dark ? Colors.responseTextStrong : Colors.primary), borderLeftWidth: 3, paddingLeft: 10, marginVertical: 4 }, textColor && { color: textColor }], i, incognito, selColor)
      );
      i++;
      continue;
    }

    // custom interrupted line
    if (line.trim() === "_The user interrupted the response_") {
      elements.push(
        <Text key={`interrupted-${i}`} style={[s.base, s.italic, { color: mutedColor, marginTop: 4 }]} selectable={true} selectionColor={selColor}>
          The user interrupted the response
        </Text>
      );
      i++;
      continue;
    }

    // empty line = spacing
    if (line.trim() === "") {
      elements.push(<View key={`sp-${i}`} style={s.spacing} />);
      i++;
      continue;
    }

    // regular paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !lines[i].trimStart().match(/^(#{1,4})\s/) &&
      !lines[i].trimStart().match(/^[-*]\s/) &&
      !lines[i].trimStart().match(/^\d+\.\s/) &&
      !lines[i].trimStart().startsWith("> ") &&
      !lines[i].trimStart().startsWith("|") &&
      !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      elements.push(
        wrapContent(paraLines.join("\n"), `p-${i}`, [s.base, s.paragraph, textColor && { color: textColor }], i, incognito, selColor)
      );
    } else {
      //safety fallback prevent infinite loop
      i++;
    }
  }

  return elements;
}
