import React, { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import MathText from "react-native-math";
import AutoHeightWebView from "react-native-autoheight-webview";
import CodeHighlighter from "react-native-code-highlighter";
import { vs2015 } from "react-syntax-highlighter/dist/esm/styles/hljs";

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
  h4: { fontSize: 15, fontWeight: "bold", marginTop: 5, marginBottom: 3, color: "#000" },
  paragraph: { marginVertical: 2 },
  spacing: { height: 8 },
  strike: { textDecorationLine: "line-through" },
  link: { color: "#3B82F6", textDecorationLine: "underline" },
  tableCell: { fontSize: 15, lineHeight: 20, color: "#000", fontFamily: "Jakarta" },
  tableCellBox: { flex: 1, paddingHorizontal: 8, paddingVertical: 6 },
  inlineRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
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

const KATEX_HTML = (content: string, textSize: number, textColor: string): string => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" integrity="sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+" crossorigin="anonymous">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" integrity="sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" integrity="sha384-43gviWU0YVjaDtb/GhzOouOXtZMP/7XUzwPTstBeZFe/+rCMvRwr4yROQP43s0Xk" crossorigin="anonymous"
onload="renderMathInElement(document.body, {
    delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\\\[', right: '\\\\]', display: true },
        { left: '\\\\(', right: '\\\\)', display: false }
            ],
            ignoredTags: [
                'script', 'noscript', 'style', 'textarea', 'pre', 'code', 'a'
            ]
            });"></script>
            <style>
            body { margin: 0; padding: 0; }
            </style>
            </head>
            <body>
            <div style="font-size: ${textSize}px; color: ${textColor}; padding: 2px 0;">
            ${content}
            </div>
            </body>
            </html>
`;

function MathInline({ content, estWidth, incognito }: { content: string; estWidth: number; incognito?: boolean }) {
  const [height, setHeight] = useState(34);
  return (
    <AutoHeightWebView
      style={{ width: estWidth, height, overflow: "hidden", marginHorizontal: 2, backgroundColor: "transparent" }}
      onSizeUpdated={(size) => {
        if (size.height > 0) setHeight(size.height + 2);
      }}
      source={{ html: KATEX_HTML(`$${content}$`, 18, incognito ? "#E0E0E0" : "#333333") }}
      scalesPageToFit={false}
      viewportContent={"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"}
      scrollEnabled={false}
    />
  );
}

function renderMathBlock(content: string, key: string, incognito?: boolean): React.ReactNode {
  const estWidth = Math.min(400, Math.max(70, content.length * 10));
  return <MathInline key={key} content={content} estWidth={estWidth} incognito={incognito} />;
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

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const lang = language ? LANG_ALIASES[language] ?? language : undefined;
  const textStyle = { fontFamily: "IBMPlexMono-Medium", fontSize: 13, lineHeight: 18 } as const;
  if (!lang) {
    return (
      <Text style={[s.base, s.codeBlock]} selectable={true}>
        {code}
      </Text>
    );
  }
  return (
    <View style={[s.codeBlock, { backgroundColor: "#1E1E1E" }]}>
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
}

export function renderMarkdown(md: string, incognito?: boolean): React.ReactNode[] {
  const selColor = incognito ? "rgba(86, 90, 117, 0.4)" : "rgba(255, 26, 26, 0.4)";
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block ```
    if (line.trimStart().startsWith("```")) {
      const language = line.replace(/```/g, "").trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      


      elements.push(
        <CodeBlock key={`code-${i}`} code={codeLines.join("\n")} language={language} />
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

    // horizontal rule
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      elements.push(
        <View key={`hr-${i}`} style={{ height: 1, backgroundColor: incognito ? "#565A75" : "#e0e0e0", marginVertical: 10 }} />
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
      const borderColor = incognito ? "#565A75" : "#e0e0e0";
      const headerBg = incognito ? "rgba(86, 90, 117, 0.25)" : "rgba(255, 26, 26, 0.07)";

      elements.push(
        <View key={`table-${i}`} style={{ borderWidth: 1, borderColor, borderRadius: 6, overflow: "hidden", marginVertical: 6 }}>
          {headerCells && (
            <View style={{ flexDirection: "row", backgroundColor: headerBg }}>
              {padCell(headerCells).map((c, ci) => (
                <View key={`h-${ci}`} style={[s.tableCellBox, ci < colCount - 1 && { borderRightWidth: 1, borderRightColor: borderColor }, { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
                  {wrapContent(c, `hc-${ci}`, [s.tableCell, s.bold], ci, incognito, selColor)}
                </View>
              ))}
            </View>
          )}
          {bodyRows.map((row, ri) => (
            <View key={`r-${ri}`} style={{ flexDirection: "row", backgroundColor: ri % 2 === 1 ? (incognito ? "rgba(86, 90, 117, 0.1)" : "rgba(0,0,0,0.03)") : "transparent" }}>
              {padCell(row).map((c, ci) => (
                <View key={`b-${ri}-${ci}`} style={[s.tableCellBox, ci < colCount - 1 && { borderRightWidth: 1, borderRightColor: borderColor }, { borderTopWidth: 1, borderTopColor: borderColor }]}>
                  {wrapContent(c, `bc-${ri}-${ci}`, s.tableCell, ci, incognito, selColor)}
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
        wrapContent(headingMatch[2], `h-${i}`, [s.base, style], i, incognito, selColor)
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
        wrapContent(`${glyph} ${bulletMatch[3]}`, `li-${i}`, [s.base, s.paragraph, { paddingLeft: depth * 14 }], i, incognito, selColor)
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
        wrapContent(itemLines.join("\n"), `oli-${i}`, [s.base, s.paragraph], i, incognito, selColor)
      );
      continue;
    }

    // blockquote
    if (line.trimStart().startsWith("> ")) {
      const quoteText = line.replace(/^[\s]*>\s?/, "");
      elements.push(
        wrapContent(quoteText, `quote-${i}`, [s.base, { borderLeftColor: incognito ? "#565A75" : "#FF1A1A", borderLeftWidth: 3, paddingLeft: 10, marginVertical: 4 }], i, incognito, selColor)
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
        wrapContent(paraLines.join("\n"), `p-${i}`, [s.base, s.paragraph], i, incognito, selColor)
      );
    } else {
      //safety fallback prevent infinite loop
      i++;
    }
  }

  return elements;
}
