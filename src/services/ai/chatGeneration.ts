import { AIModule } from './AIModule';
import { MessageMetrics } from '../db/DatabaseService';
import { WidgetManager } from '../widgets/WidgetManager';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';

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
      }
    );
    return { status: 'done', content, metrics };
  } catch (e) {
    if (isAbortError(e)) {
      content += INTERRUPTED_MARKER;
      params.onContent(content);
      return { status: 'aborted', content, metrics };
    }
    console.error('Assistant reply failed:', e);
    //caller picks the user wording
    return { status: 'error', content, metrics };
  }
}
