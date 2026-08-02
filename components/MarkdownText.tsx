import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View, Image } from "react-native";
import MathText from "react-native-math";
import { WidgetManager } from "../src/services/widgets/WidgetManager";
import WidgetWrapper from "../src/components/widgets/WidgetWrapper";

const toolIcon = require("../assets/icons/tool.png");

const ToolCallBubble = ({ toolName, isGenerating }: { toolName: string, isGenerating?: boolean }) => {
  const opacity = useRef(new Animated.Value(isGenerating ? 0.4 : 1)).current;

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
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.04)', padding: 10, borderRadius: 12, marginVertical: 6, alignSelf: 'flex-start' }}>
      <Image source={toolIcon} style={{ width: 18, height: 18, marginRight: 8, opacity: 0.7, tintColor: '#666' }} />
      <Animated.Text style={{ fontFamily: 'IBMPlexMono-Medium', fontSize: 13, color: '#555', opacity }}>
        {isGenerating ? `Using tool: ${toolName}...` : `Used tool: ${toolName}`}
      </Animated.Text>
    </View>
  );
};

const s = StyleSheet.create({
  base: { fontSize: 18, lineHeight: 26, color: "#000", fontFamily: "Jakarta" },
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },
  code: {
    fontFamily: "IBMPlexMono-Medium",
    backgroundColor: "#f0f0f0",
    color: "#d63384",
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 13,
  },
  codeBlock: {
    fontFamily: "IBMPlexMono-Medium",
    backgroundColor: "#1e1e1e",
    color: "#d4d4d4",
    padding: 8,
    borderRadius: 6,
    fontSize: 13,
    lineHeight: 18,
    marginVertical: 4,
  },
  h1: { fontSize: 22, fontWeight: "bold", marginTop: 8, marginBottom: 4, color: "#000" },
  h2: { fontSize: 19, fontWeight: "bold", marginTop: 7, marginBottom: 3, color: "#000" },
  h3: { fontSize: 17, fontWeight: "bold", marginTop: 6, marginBottom: 3, color: "#000" },
  paragraph: { marginVertical: 2 },
  spacing: { height: 8 },
});

type Token =
  | { type: "text"; content: string }
  | { type: "bold"; children: Token[] }
  | { type: "italic"; children: Token[] }
  | { type: "code"; content: string };

function parseInline(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
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
    while (j < text.length && text[j] !== "*" && text[j] !== "_" && text[j] !== "`") j++;
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
      case "code":
        return <Text key={key} style={s.code}>{t.content}</Text>;
      default:
        return null;
    }
  });
}

type ToolCallBlock = { start: number; end: number; json: string };

//scan raw toolcall json blocks in a non-code segment
function pushRawToolCallBlocks(md: string, from: number, to: number, blocks: ToolCallBlock[]): void {
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
    
    const blockEnd = endIndex !== -1 ? endIndex + 1 : to;
    const blockText = md.substring(start, blockEnd);
    
    const cleanBlockText = blockText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '');
    
    if (/^\{\s*"?\s*(?:tool[\s\n]*_[\s\n]*calls|name|function)\s*"?\s*:/i.test(cleanBlockText)) {
      blocks.push({ start, end: blockEnd, json: blockText });
      searchIndex = blockEnd;
    } else {
      searchIndex = start + 1;
    }
  }
}

//scan toolcall json blocks (fenced or raw), skipping raw blocks inside code fences
function findToolCallBlocks(md: string): ToolCallBlock[] {
  const blocks: ToolCallBlock[] = [];
  const fenceRe = /```[^\n]*/g;
  let segmentStart = 0;
  let m;
  while ((m = fenceRe.exec(md)) !== null) {
    const fenceStart = m.index;
    pushRawToolCallBlocks(md, segmentStart, fenceStart, blocks);

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
      if (/^\{\s*"?\s*(?:tool[\s\n]*_[\s\n]*calls|name|function)\s*"?\s*:[\s\S]*\}$/i.test(cleanInner)) {
        blocks.push({ start: fenceStart, end: closeEnd, json: inner });
      }
    }

    segmentStart = closeEnd;
    fenceRe.lastIndex = closeEnd;
  }
  pushRawToolCallBlocks(md, segmentStart, md.length, blocks);
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

export function renderMarkdown(md: string, incognito?: boolean, isGenerating?: boolean): React.ReactNode[] {
  const selColor = incognito ? "rgba(86, 90, 117, 0.4)" : "rgba(255, 26, 26, 0.4)";
  
  //wrap toolcall blocks for bubble rendering
  let processedMd = md;
  const blocks = findToolCallBlocks(processedMd);
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
              <View key={`loading-${i}`} style={{ padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 12, marginVertical: 8 }}>
                <Text style={{ fontFamily: 'Jakarta', color: '#666', fontStyle: 'italic' }}>
                  Génération du widget {widgetTitle || widget.name}...
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
            } catch (e2: any) {
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
        const cleanJson = rawJson.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
        
        let toolNames: string[] = [];
        try {
          const data = JSON.parse(cleanJson);
          if (data?.tool_calls && Array.isArray(data.tool_calls)) {
            data.tool_calls.forEach((tc: any) => {
              if (tc?.function?.name) toolNames.push(tc.function.name);
            });
          } else if (data?.name) {
            toolNames.push(data.name);
          }
        } catch (e) {
          // fallback regex for incomplete JSON during streaming
          const nameMatches = cleanJson.matchAll(/"name"\s*:\s*"([^"]+)"/g);
          for (const match of nameMatches) {
            toolNames.push(match[1]);
          }
        }
        
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
        <Text key={`code-${i}`} style={[s.base, s.codeBlock]} selectable={true} selectionColor={selColor}>
          {codeLines.join("\n")}
        </Text>
      );
      continue;
    }

    // math block $$
    if (line.trimStart().startsWith("$$")) {
      const isSingleLine = line.trimEnd().endsWith("$$") && line.trim().length > 4;
      if (isSingleLine) {
        const mathContent = line; // react-native-math needs the $$ intact
        elements.push(
          <View key={`math-${i}`} style={{ width: "100%", marginVertical: 8, minHeight: 40, alignSelf: "center", overflow: "hidden", backgroundColor: "transparent" }}>
            <MathText
              content={mathContent}
              textSize={16}
              textColor={incognito ? "#E0E0E0" : "#333333"}
              style={{ flex: 1, backgroundColor: "transparent" }}
            />
          </View>
        );
        i++;
        continue;
      }

      const mathLines: string[] = [];
      mathLines.push(line);

      i++;
      while (i < lines.length && !lines[i].includes("$$")) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        mathLines.push(lines[i]);
        i++; // skip closing $$
      }

      elements.push(
        <View key={`math-${i}`} style={{ width: "100%", marginVertical: 8, minHeight: Math.max(40, mathLines.length * 25), alignSelf: "center", overflow: "hidden", backgroundColor: "transparent" }}>
          <MathText
            content={mathLines.join("\n")}
            textSize={16}
            textColor={incognito ? "#E0E0E0" : "#333333"}
            style={{ flex: 1, backgroundColor: "transparent" }}
          />
        </View>
      );
      continue;
    }

    // headings
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const style = level === 1 ? s.h1 : level === 2 ? s.h2 : s.h3;
      elements.push(
        <Text key={`h-${i}`} style={[s.base, style]} selectable={true} selectionColor={selColor}>
          {renderTokens(parseInline(headingMatch[2]), i)}
        </Text>
      );
      i++;
      continue;
    }

    // unordered list
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.*)/);
    if (bulletMatch) {
      elements.push(
        <Text key={`li-${i}`} style={[s.base, s.paragraph]} selectable={true} selectionColor={selColor}>
          {"• "}{renderTokens(parseInline(bulletMatch[1]), i)}
        </Text>
      );
      i++;
      continue;
    }

    // ordered list
    const olMatch = line.match(/^[\s]*(\d+)\.\s+(.*)/);
    if (olMatch) {
      elements.push(
        <Text key={`oli-${i}`} style={[s.base, s.paragraph]} selectable={true} selectionColor={selColor}>
          {`${olMatch[1]}. `}{renderTokens(parseInline(olMatch[2]), i)}
        </Text>
      );
      i++;
      continue;
    }

    // blockquote
    if (line.trimStart().startsWith("> ")) {
      const quoteText = line.replace(/^[\s]*>\s?/, "");
      elements.push(
        <Text key={`quote-${i}`} style={[s.base, { borderLeftColor: incognito ? "#565A75" : "#FF1A1A", borderLeftWidth: 3, paddingLeft: 10, marginVertical: 4 }]} selectable={true} selectionColor={selColor}>
          {renderTokens(parseInline(quoteText), i)}
        </Text>
      );
      i++;
      continue;
    }

    // custom interrupted line
    if (line.trim() === "_The user interrupted the response_") {
      elements.push(
        <Text key={`interrupted-${i}`} style={[s.base, s.italic, { color: "gray", marginTop: 4 }]} selectable={true} selectionColor={selColor}>
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
      !lines[i].trimStart().match(/^(#{1,3})\s/) &&
      !lines[i].trimStart().match(/^[-*]\s/) &&
      !lines[i].trimStart().match(/^\d+\.\s/) &&
      !lines[i].trimStart().startsWith("> ")
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      elements.push(
        <Text key={`p-${i}`} style={[s.base, s.paragraph]} selectable={true} selectionColor={selColor}>
          {renderTokens(parseInline(paraLines.join("\n")), i)}
        </Text>
      );
    } else {
      //safety fallback prevent infinite loop
      i++;
    }
  }

  return elements;
}
