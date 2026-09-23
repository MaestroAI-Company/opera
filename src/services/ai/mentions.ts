import { ToolManager } from './tools/ToolManager';
import { WidgetManager } from '../widgets/WidgetManager';

export type MentionKind = 'tool' | 'widget';

export type Mentionable = {
  id: string;
  kind: MentionKind;
  label: string;
  description: string;
  requires: string[];
};

export type ResolvedMention = Mentionable & {
  //pulled in as a dependency
  requiredBy?: string;
};

//@ starts a word, not emails
const MENTION_RE = /(^|\s)@([\w-]+)/g;

//read live, no registration needed
export function listMentionables(): Mentionable[] {
  const tools: Mentionable[] = ToolManager.getEnabledTools().map(t => ({
    id: t.definition.function.name,
    kind: 'tool',
    label: t.displayName ?? t.definition.function.name,
    description: t.displayDescription ?? t.definition.function.description,
    requires: t.requires ?? [],
  }));
  const widgets: Mentionable[] = WidgetManager.getEnabledWidgets().map(w => ({
    id: w.id,
    kind: 'widget',
    label: w.name,
    description: w.description,
    requires: w.requires ?? [],
  }));
  return [...tools, ...widgets];
}

export type MentionSpan = { start: number; end: number };

//@id tokens naming real items
export function findMentionSpans(text: string): MentionSpan[] {
  const ids = new Set(listMentionables().map(m => m.id.toLowerCase()));
  const spans: MentionSpan[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    if (!ids.has(match[2].toLowerCase())) continue;
    const start = (match.index ?? 0) + match[1].length;
    spans.push({ start, end: start + match[2].length + 1 });
  }
  return spans;
}

//mentioned items first, then their dependencies
export function resolveMentions(text: string): ResolvedMention[] {
  const available = new Map<string, Mentionable>();
  //tools win clashes, deps name tools
  for (const item of listMentionables()) {
    if (!available.has(item.id)) available.set(item.id, item);
  }

  const resolved = new Map<string, ResolvedMention>();
  for (const match of text.matchAll(MENTION_RE)) {
    const item = available.get(match[2].toLowerCase());
    if (item) resolved.set(item.id, item);
  }

  const addDependencies = (item: Mentionable) => {
    for (const dep of item.requires) {
      const required = available.get(dep);
      if (!required || resolved.has(dep)) continue;
      resolved.set(dep, { ...required, requiredBy: item.id });
      addDependencies(required);
    }
  };
  [...resolved.values()].forEach(addDependencies);

  return [...resolved.values()];
}

//tells the model what is asked
export function buildMentionSegment(mentions: ResolvedMention[]): string {
  if (mentions.length === 0) return '';
  const lines = mentions.map(m => {
    const kind = m.kind === 'tool' ? 'Tool' : 'Widget';
    const origin = m.requiredBy ? ` (available, needed by \`${m.requiredBy}\`)` : '';
    return `- ${kind} \`${m.id}\`${origin}`;
  });
  return `\n\n# Requested Tools — IMPORTANT\n`
    + `For this message only, the user explicitly asked you to use the items below (the @name tokens in their message refer to them). Use them to answer, without asking first: call tools with a tool call, render widgets with a widget block.\n`
    + lines.join('\n');
}
