//regenerate after katex version bumps

const fs = require("fs");
const path = require("path");

const katexDist = path.join(__dirname, "..", "node_modules", "katex", "dist");
const outputFile = path.join(__dirname, "..", "src", "components", "ui", "katexAssets.ts");

const katexVersion = require(path.join(__dirname, "..", "node_modules", "katex", "package.json")).version;

function inlineFonts(css) {
  //woff2 only slashes font payload
  return css.replace(/src:([^;}]*)/g, (declaration) => {
    const woff2Match = declaration.match(/url\(fonts\/([^)]+\.woff2)\)/);
    if (!woff2Match) return declaration;

    const fontFile = path.join(katexDist, "fonts", woff2Match[1]);
    const base64 = fs.readFileSync(fontFile).toString("base64");
    return `src:url(data:font/woff2;base64,${base64}) format("woff2")`;
  });
}

const css = inlineFonts(fs.readFileSync(path.join(katexDist, "katex.min.css"), "utf8"));

//escape template literal breakers
const escape = (source) => source.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

//webview only gets the stylesheet
const output = `//generated file do not edit
//katex embedded not fetched from cdn

export const KATEX_VERSION = ${JSON.stringify(katexVersion)};

export const KATEX_CSS = \`${escape(css)}\`;
`;

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, output);

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`katex ${katexVersion}`);
console.log(`  css with inlined fonts : ${kb(css.length)}`);
console.log(`  written to             : ${path.relative(path.join(__dirname, ".."), outputFile)} (${kb(output.length)})`);
