const MAX_LINES = 2000;

type Level = "log" | "warn" | "error";

const buffer: string[] = [];
let installed = false;

//errors serialize to {} through json
function format(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    const cause = (value as { cause?: unknown }).cause;
    const stack = value.stack ? `\n${value.stack}` : "";
    return `${value.name}: ${value.message}${cause ? ` (cause: ${format(cause)})` : ""}${stack}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function push(level: Level, args: unknown[]) {
  const text = args.map(format).join(" ");
  buffer.push(`${new Date().toISOString()} [${level}] ${text}`);
  if (buffer.length > MAX_LINES) buffer.shift();
}

//reports ship earlier console output
export function installLogger() {
  if (installed) return;
  installed = true;
  (["log", "warn", "error"] as Level[]).forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      push(level, args);
      original(...args);
    };
  });
}

//short hash keeps servers anonymous
function hostTag(host: string): string {
  let hash = 0;
  for (let i = 0; i < host.length; i++) hash = (hash * 31 + host.charCodeAt(i)) | 0;
  //low bits avoid ip collisions
  return Math.abs(hash).toString(36).slice(-4);
}

//anonymize urls for public reports
function redactUrls(line: string): string {
  return line.replace(/\bhttps?:\/\/\S+/gi, (match) => {
    //strip trailing punctuation from url
    const trailing = match.match(/[:,.;)\]]+$/)?.[0] ?? "";
    const url = match.slice(0, match.length - trailing.length);
    const scheme = url.slice(0, url.indexOf("//") + 2);
    const rest = url.slice(scheme.length);
    const authority = rest.split(/[/?#]/)[0];
    const path = rest.slice(authority.length).split(/[?#]/)[0];
    //strip creds and query params
    const host = authority.split("@").pop() ?? authority;
    const port = host.match(/:\d+$/)?.[0] ?? "";
    const query = rest.length > authority.length + path.length ? "?…" : "";
    return `${scheme}host-${hostTag(host.slice(0, host.length - port.length))}${port}${path}${query}${trailing}`;
  });
}

//post error share of window
const TAIL_RATIO = 4;

//context lines around last error
export function getRelevantLogs(limit: number): string[] {
  let errorAt = -1;
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i].includes("[error]")) {
      errorAt = i;
      break;
    }
  }
  if (errorAt === -1) return buffer.slice(-limit).map(redactUrls);

  const tail = Math.min(buffer.length - errorAt - 1, Math.floor(limit / TAIL_RATIO));
  const end = errorAt + 1 + tail;
  return buffer.slice(Math.max(0, end - limit), end).map(redactUrls);
}
