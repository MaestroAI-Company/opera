import { AIModule } from '../AIModule';
import { SYSTEM_PROMPTS } from '../../../../constants/prompts';
import { resolveQuickFlow } from '../quickFlow';
import { splitDocumentBlocks } from '../../documents/DocumentService';

//pill label, full text on tap
export type Suggestion = {
  label: string;
  message: string;
};

const MAX_SUGGESTIONS = 3;
const MAX_LABEL_WORDS = 5;
//long replies only confuse a small model
const MAX_INPUT_CHARS = 2000;

//keep only what the user actually reads
function stripToVisibleText(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '')
    .replace(/\[\[cite:[\s\S]*?(?:\]\]|$)/g, '')
    //tool call payloads and widget blocks are chrome
    .replace(/\{"tool_calls":[\s\S]*?\}\]\}/g, '')
    .replace(/```widget[\s\S]*?```/g, '')
    .trim();
}

//tolerates a half-written array
function extractObjects(body: string): unknown[] {
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          out.push(JSON.parse(body.slice(start, i + 1)));
        } catch {
          //unparsable object, drop it and keep going
        }
        start = -1;
      }
    }
  }
  return out;
}

//fallback label from message start
function fallbackLabel(message: string): string {
  const words = message.split(/\s+/);
  if (words.length <= MAX_LABEL_WORDS) return message;
  //ellipsis flags clipped intent
  return `${words.slice(0, MAX_LABEL_WORDS).join(' ')}…`;
}

function parseSuggestions(raw: string): Suggestion[] {
  const cleaned = stripToVisibleText(raw);
  const start = cleaned.indexOf('[');
  if (start === -1) return [];

  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const entry of extractObjects(cleaned.slice(start + 1))) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { label, message } = entry as { label?: unknown; message?: unknown };
    if (typeof message !== 'string') continue;

    const fullMessage = message.trim();
    if (fullMessage.length === 0) continue;
    const key = fullMessage.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const rawLabel = typeof label === 'string' ? label.trim() : '';
    //pill ellipsises anyway
    const short = rawLabel.length > 0 && rawLabel.split(/\s+/).length <= MAX_LABEL_WORDS
      ? rawLabel
      : fallbackLabel(rawLabel.length > 0 ? rawLabel : fullMessage);

    out.push({ label: short, message: fullMessage });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

function trimHead(text: string): string {
  return text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
}

//the offer or question lives at the end of a reply
function trimTail(text: string): string {
  return text.length > MAX_INPUT_CHARS ? text.slice(-MAX_INPUT_CHARS) : text;
}

//best-effort, an empty list means nothing worth showing
export async function generateSuggestions(params: {
  model: string;
  userMessage: string;
  assistantMessage: string;
  signal?: AbortSignal;
  //fires each time a new suggestion finishes streaming
  onPartial?: (items: Suggestion[]) => void;
}): Promise<Suggestion[]> {
  const assistant = stripToVisibleText(params.assistantMessage);
  if (assistant.length === 0) return [];

  //attachments are noise for this prompt
  const user = splitDocumentBlocks(params.userMessage).text.trim();
  const input = `User: ${trimHead(user)}\n\nAssistant: ${trimTail(assistant)}`;

  let raw = '';
  let emitted = 0;

  try {
    await AIModule.sendOn(
      resolveQuickFlow(params.model),
      SYSTEM_PROMPTS.SUGGESTIONS,
      [{ role: 'user', content: input }],
      chunk => {
        raw += chunk;
        if (!params.onPartial) return;
        const items = parseSuggestions(raw);
        if (items.length > emitted) {
          emitted = items.length;
          params.onPartial(items);
        }
      },
      params.signal,
      { think: false }
    );
    return parseSuggestions(raw);
  } catch (e) {
    //never surface a chore failure to the user
    console.warn('Suggestions skipped:', (e as any)?.message ?? e);
    //keep whatever already made it to the bar
    return parseSuggestions(raw);
  }
}
