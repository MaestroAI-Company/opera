import { AIModule } from '../AIModule';
import { isLocalModel } from '../providers/LocalProvider';
import { MessageMetrics } from '../../db/DatabaseService';
import { WidgetManager } from '../../widgets/WidgetManager';
import { SYSTEM_PROMPTS } from '../../../../constants/prompts';
import { Settings } from '../../settings/SettingsService';
import { ToolSource } from '../tools/ITool';
import { extractCitedUrls } from './citations';
import { buildMentionSegment, resolveMentions } from '../mentions';
import { estimateTokens } from '../tokens';

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

type ModelTier = 'small' | 'medium' | 'large';

//parameter billions read from model names
function parseParamsB(model: string): number | null {
  const match = model.match(/(\d+(?:\.\d+)?)\s*([bm])(?![a-z])/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return match[2].toLowerCase() === 'm' ? value / 1000 : value;
}

//small windows cannot afford full prompt
function modelTier(model: string): ModelTier {
  //nano full handles the medium prompt
  if (model.startsWith('aicore-nano-full')) return 'medium';
  if (isLocalModel(model)) return 'small';
  const paramsB = parseParamsB(model);
  if (paramsB === null) {
    //unknown sizes: on-device small, servers large
    return Settings.getCached().aiService === 'litert' ? 'small' : 'large';
  }
  if (paramsB < 3) return 'small';
  if (paramsB <= 14) return 'medium';
  return 'large';
}

const PROMPT_BY_TIER: Record<ModelTier, string> = {
  small: SYSTEM_PROMPTS.DEFAULT_SMALL,
  medium: SYSTEM_PROMPTS.DEFAULT_MEDIUM,
  large: SYSTEM_PROMPTS.DEFAULT,
};

//instruction then app prompt then extras
export function buildSystemPrompt(model: string, userInstruction: string, extraSegment = ''): string {
  return promptForTier(modelTier(model), userInstruction, extraSegment);
}

//headroom for the first reply
const CONTEXT_MARGIN = 100;

//smallest context that still fits the system prompt
export function contextFloorTokens(service: string, userInstruction: string): number {
  const settings = Settings.getCached();
  //other sources assume their usual tier
  const prompt = settings.aiService === service
    ? buildSystemPrompt(settings.ollamaModel, userInstruction)
    : promptForTier(service === 'litert' ? 'small' : 'large', userInstruction);
  return estimateTokens(prompt) + CONTEXT_MARGIN;
}

function promptForTier(tier: ModelTier, userInstruction: string, extraSegment = ''): string {
  const instruction = userInstruction.trim();
  const appPrompt = PROMPT_BY_TIER[tier];
  const base = instruction.length > 0
    ? `${instruction}\n\n---\n\n${appPrompt}`
    : appPrompt;
  //small models see widgets via @mentions
  const widgetSegment = tier === 'small' ? '' : WidgetManager.getSystemPromptSegment();
  return base + widgetSegment + extraSegment;
}

//last mentions drive tools and widgets
function applyMentions(model: string, systemPrompt: string, history: ChatHistoryEntry[]): { systemPrompt: string; toolFilter?: string[] } {
  const small = modelTier(model) === 'small';
  const lastUser = [...history].reverse().find(m => m.role === 'user');
  const mentions = lastUser ? resolveMentions(lastUser.content) : [];
  //small models keep only mentioned tools
  const toolFilter = small ? mentions.filter(m => m.kind === 'tool').map(m => m.id) : undefined;
  if (mentions.length === 0) return { systemPrompt, toolFilter };

  const widgets = small
    ? mentions.filter(m => m.kind === 'widget').map(m => WidgetManager.getWidget(m.id)).filter(w => !!w)
    : [];
  const widgetSegment = widgets.length > 0 ? WidgetManager.getSystemPromptSegment(widgets) : '';
  return { systemPrompt: systemPrompt + widgetSegment + buildMentionSegment(mentions), toolFilter };
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

//not every provider reports token counts
function completeMetrics(metrics: MessageMetrics, content: string, think: boolean | string, model: string): MessageMetrics {
  const tokens = metrics.tokens || estimateTokens(content);
  const tokensPerSec = metrics.tokensPerSec || (metrics.timeSec ? tokens / metrics.timeSec : undefined);
  const thinking = think === false ? 'none' : think === true ? 'high' : think;
  return { ...metrics, tokens, tokensPerSec, thinking, systemPrompt: modelTier(model) };
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
  const { systemPrompt, toolFilter } = applyMentions(params.model, params.systemPrompt, params.history);

  try {
    await AIModule.sendMessageWithTools(
      params.model,
      systemPrompt,
      params.history,
      (chunk) => {
        content += chunk;
        params.onContent(content);
      },
      params.signal,
      { think: params.think },
      (received) => {
        metrics = completeMetrics(received, content, params.think, params.model);
        params.onMetrics?.(metrics);
      },
      (received) => {
        sources = received;
      },
      toolFilter
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
