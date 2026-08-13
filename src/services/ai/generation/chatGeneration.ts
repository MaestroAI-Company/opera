import { AIModule } from '../AIModule';
import { MessageMetrics } from '../../db/DatabaseService';
import { WidgetManager } from '../../widgets/WidgetManager';
import { SYSTEM_PROMPTS } from '../../../../constants/prompts';
import { ToolSource } from '../tools/ITool';
import { extractCitedUrls } from './citations';

//marker when user stops generation
export const INTERRUPTED_MARKER = '\n\n_The user interrupted the response_';

export type ChatHistoryEntry = {
  role: string;
  content: string;
  images?: string[];
};

export type ReplyStatus = 'done' | 'aborted' | 'error';

export type ReplyOutcome = {
  status: ReplyStatus;
  //streamed content with marker if aborted
  content: string;
  metrics?: MessageMetrics;
  sources?: ToolSource[];
  //raw provider error message
  error?: string;
};

//instruction then app prompt then extras
export function buildSystemPrompt(userInstruction: string, extraSegment = ''): string {
  const instruction = userInstruction.trim();
  const base = instruction.length > 0
    ? `${instruction}\n\n---\n\n${SYSTEM_PROMPTS.DEFAULT}`
    : SYSTEM_PROMPTS.DEFAULT;
  return base + WidgetManager.getSystemPromptSegment() + extraSegment;
}

function isAbortError(error: any): boolean {
  const message = String(error?.message ?? '').toLowerCase();
  return error?.name === 'AbortError' || message.includes('aborted') || message.includes('cancel');
}

//keep model-cited sources in citation order
function resolveCitedSources(content: string, recorded: ToolSource[] | undefined): ToolSource[] | undefined {
  const citedUrls = extractCitedUrls(content);
  if (citedUrls.length === 0) return undefined;
  return citedUrls.map(url => recorded?.find(s => s.url === url) ?? { url });
}

//one streaming path for both screens
export async function streamAssistantReply(params: {
  model: string;
  systemPrompt: string;
  history: ChatHistoryEntry[];
  think: boolean | string;
  signal: AbortSignal;
  onContent: (content: string) => void;
  onMetrics?: (metrics: MessageMetrics) => void;
}): Promise<ReplyOutcome> {
  let content = '';
  let metrics: MessageMetrics | undefined;
  //consulted sources narrowed to cited ones
  let sources: ToolSource[] | undefined;

  try {
    await AIModule.sendMessageWithTools(
      params.model,
      params.systemPrompt,
      params.history,
      (chunk) => {
        content += chunk;
        params.onContent(content);
      },
      params.signal,
      { think: params.think },
      (received) => {
        metrics = received;
        params.onMetrics?.(received);
      },
      (received) => {
        sources = received;
      }
    );
    return { status: 'done', content, metrics, sources: resolveCitedSources(content, sources) };
  } catch (e) {
    if (isAbortError(e)) {
      content += INTERRUPTED_MARKER;
      params.onContent(content);
      return { status: 'aborted', content, metrics, sources: resolveCitedSources(content, sources) };
    }
    console.error('Assistant reply failed:', e);
    //caller picks the user wording
    return { status: 'error', content, metrics, sources: resolveCitedSources(content, sources), error: (e as any)?.message ?? String(e) };
  }
}
