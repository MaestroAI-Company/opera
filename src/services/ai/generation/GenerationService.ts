import { DB, MessageMetrics } from '../../db/DatabaseService';
import { ToolSource } from '../tools/ITool';
import { ChatHistoryEntry, streamAssistantReply } from './chatGeneration';

export type RunStatus = 'streaming' | 'done' | 'error' | 'aborted';

//reply owned outside any screen
export type Run = {
  convId: string;
  msgId: string;
  //drives the background notification title
  prompt: string;
  content: string;
  status: RunStatus;
  metrics?: MessageMetrics;
  sources?: ToolSource[];
  error?: string;
  //incognito runs have no db row
  persist: boolean;
};

export type StartParams = {
  convId: string;
  msgId: string;
  prompt: string;
  model: string;
  systemPrompt: string;
  history: ChatHistoryEntry[];
  think: boolean | string;
  //incognito never reaches the db
  persist?: boolean;
  //wording differs per screen
  noModelMessage?: string;
};

//cadence keeps renders from stalling
const PUBLISH_MS = 60;

class GenerationServiceImpl {
  private runs = new Map<string, Run>();
  private aborts = new Map<string, AbortController>();
  private lastPublish = new Map<string, number>();
  private listeners = new Set<(run: Run) => void>();

  get(convId: string | null | undefined): Run | undefined {
    return convId ? this.runs.get(convId) : undefined;
  }

  isRunning(convId?: string | null): boolean {
    if (convId) return this.runs.has(convId);
    return this.runs.size > 0;
  }

  subscribe(listener: (run: Run) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  stop(convId: string) {
    this.aborts.get(convId)?.abort();
  }

  async start(params: StartParams): Promise<Run> {
    //new run replaces the previous one
    this.stop(params.convId);

    const persist = params.persist !== false;
    const run: Run = {
      convId: params.convId,
      msgId: params.msgId,
      prompt: params.prompt,
      content: '',
      status: 'streaming',
      persist,
    };
    this.runs.set(params.convId, run);
    this.lastPublish.set(params.convId, 0);
    this.emit(run);

    if (!params.model) {
      run.content = params.noModelMessage ?? 'Please select a model in the main app settings.';
      return this.finish(run, 'error', persist);
    }

    const controller = new AbortController();
    this.aborts.set(params.convId, controller);

    let status: RunStatus = 'done';
    try {
      const outcome = await streamAssistantReply({
        model: params.model,
        systemPrompt: params.systemPrompt,
        history: params.history,
        think: params.think,
        signal: controller.signal,
        onContent: content => {
          run.content = content;
          this.publish(run);
        },
        onMetrics: metrics => { run.metrics = metrics; },
      });

      if (outcome.status === 'error') {
        status = 'error';
        run.error = outcome.error;
        run.content = `Error during generation: ${outcome.error ?? 'unknown error'}`;
      } else {
        status = outcome.status === 'aborted' ? 'aborted' : 'done';
        run.content = outcome.content;
      }
      run.sources = outcome.sources;
    } finally {
      this.aborts.delete(params.convId);
    }

    return this.finish(run, status, persist);
  }

  private async finish(run: Run, status: RunStatus, persist: boolean): Promise<Run> {
    if (persist) {
      //partial text is still worth keeping
      await DB.updateMessageContent(run.msgId, run.content);
      if (status !== 'error') {
        if (run.metrics) await DB.updateMessageMetrics(run.msgId, run.metrics);
        if (run.sources && run.sources.length > 0) await DB.updateMessageSources(run.msgId, run.sources);
      }
    }
    run.status = status;
    //replacement run may own the slot
    if (this.runs.get(run.convId) === run) {
      this.runs.delete(run.convId);
      this.lastPublish.delete(run.convId);
    }
    this.emit(run);
    return run;
  }

  private publish(run: Run) {
    const now = Date.now();
    if (now - (this.lastPublish.get(run.convId) ?? 0) < PUBLISH_MS) return;
    this.lastPublish.set(run.convId, now);
    this.emit(run);
  }

  private emit(run: Run) {
    this.listeners.forEach(l => l(run));
  }
}

export const GenerationService = new GenerationServiceImpl();
