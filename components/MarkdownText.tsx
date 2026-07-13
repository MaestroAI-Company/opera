import React from "react";
import { StyleSheet, Text } from "react-native";

const s = StyleSheet.create({
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },
  code: {
    fontFamily: "monospace",
    backgroundColor: "#f0f0f0",
    color: "#d63384",
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 13,
  },
  codeBlock: {
    fontFamily: "monospace",
    backgroundColor: "#1e1e1e",
    color: "#d4d4d4",
    padding: 8,
    borderRadius: 6,
    fontSize: 13,
    lineHeight: 18,
    marginVertical: 4,
  },
  h1: { fontSize: 22, fontWeight: "bold", marginTop: 8, marginBottom: 4 },
  h2: { fontSize: 19, fontWeight: "bold", marginTop: 7, marginBottom: 3 },
  h3: { fontSize: 17, fontWeight: "bold", marginTop: 6, marginBottom: 3 },
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
    // plain text — collect until next special char
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

export function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block ```
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <Text key={`code-${i}`} style={s.codeBlock}>
          {codeLines.join("\n")}
        </Text>
      );
      continue;
    }

    // headings
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const style = level === 1 ? s.h1 : level === 2 ? s.h2 : s.h3;
      elements.push(
        <Text key={`h-${i}`} style={style}>
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
        <Text key={`li-${i}`} style={{ marginVertical: 2 }}>
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
        <Text key={`oli-${i}`} style={{ marginVertical: 2 }}>
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
        <Text key={`quote-${i}`} style={{ borderLeftColor: "#FF1A1A", borderLeftWidth: 3, paddingLeft: 10, marginVertical: 4 }}>
          {renderTokens(parseInline(quoteText), i)}
        </Text>
      );
      i++;
      continue;
    }

    // empty line = spacing
    if (line.trim() === "") {
      i++;
      continue;
    }

    // regular paragraph
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].trimStart().startsWith("#") && !lines[i].trimStart().startsWith("```") && !lines[i].trimStart().match(/^[-*]\s/) && !lines[i].trimStart().match(/^\d+\.\s/) && !lines[i].trimStart().startsWith("> ")) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <Text key={`p-${i}`} style={{ marginVertical: 2 }}>
          {renderTokens(parseInline(paraLines.join(" ")), i)}
        </Text>
      );
    }
  }

  return elements;
}
