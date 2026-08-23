const MAX_LINES = 2000;

type Level = "log" | "warn" | "error";

const buffer: string[] = [];
let installed = false;

function push(level: Level, args: unknown[]) {
  const text = args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
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

export function getRecentLogs(limit?: number): string[] {
  return limit ? buffer.slice(-limit) : [...buffer];
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
  if (errorAt === -1) return buffer.slice(-limit);

  const tail = Math.min(buffer.length - errorAt - 1, Math.floor(limit / TAIL_RATIO));
  const end = errorAt + 1 + tail;
  return buffer.slice(Math.max(0, end - limit), end);
}
