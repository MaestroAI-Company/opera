import { Directory, DownloadPauseState, DownloadTask, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  createLLM,
  estimateMemory,
  isMemoryError,
  type Backend,
  type LiteRTLMInstance,
  type Message as LiteRTMessage,
  type MultimodalPart,
} from 'react-native-litert-lm';
import { toByteArray } from 'react-native-quick-base64';
import { t } from '../../../i18n';
import { MessageMetrics } from '../../db/DatabaseService';
import { NotificationService } from '../../notifications/NotificationService';
import { Settings } from '../../settings/SettingsService';
import { ToolCall, ToolDefinition } from '../tools/ITool';
import {
  backendForFile,
  CatalogEntry,
  formatBytes,
  getCatalogEntry,
  hydrateLiteRTCatalog,
  listCatalogEntries,
} from './huggingFaceCatalog';
import { IAIProvider } from './IAIProvider';
import { isProviderSupported } from './sources';

const DEFAULT_CONTEXT_TOKENS = 8192;
const FALLBACK_CONTEXT_TOKENS = [8192, 4096, 2048, 1024];

//documents survive ios cache eviction
const MODELS_DIR = 'litert-models';
const PENDING_KEY = 'litert_pending_download';

function modelsDirectory(): Directory {
  return new Directory(Paths.document, MODELS_DIR);
}

//repo id keeps filenames unique
function localFile(entry: CatalogEntry): File {
  const name = `${entry.repoId.replace(/\//g, '__')}__${entry.file}`;
  return new File(modelsDirectory(), name);
}

//shorter file means resumable transfer
function localSize(file: File): number {
  try {
    return file.exists ? (file.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

export function getLiteRTModelLabel(modelName: string): string {
  return getCatalogEntry(modelName)?.label ?? modelName;
}

export type LiteRTModelInfo = { id: string; label: string; sizeStr: string };

//disk managed here, browsing in the sheet
export function getInstalledLiteRTModels(): LiteRTModelInfo[] {
  return listCatalogEntries()
    .filter((entry) => isLiteRTModelDownloaded(entry.repoId))
    .map((entry) => ({ id: entry.repoId, label: entry.label, sizeStr: formatBytes(entry.sizeBytes) }));
}

export function isLiteRTModel(modelName: string): boolean {
  return !!getCatalogEntry(modelName);
}

//filesystem read, safe while rendering
export function isLiteRTModelDownloaded(modelName: string): boolean {
  const model = getCatalogEntry(modelName);
  if (!model?.url || !isProviderSupported('litert')) return false;
  //full blob counts as installed
  return localSize(localFile(model)) === model.sizeBytes;
}

export function deleteLiteRTModel(modelName: string): void {
  const model = getCatalogEntry(modelName);
  if (!model?.url) throw new Error(`Unknown LiteRT model: ${modelName}`);
  const file = localFile(model);
  if (file.exists) file.delete();
}

type ProgressCallback = (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void;

//raw bytes become ratio, speed, eta
function createDownloadReporter(modelName: string, model: CatalogEntry, onProgress?: ProgressCallback) {
  const id = `litert-${modelName}`;
  const title = getLiteRTModelLabel(modelName);
  const pending = t('download.starting');
  let started = false;
  let lastBytes = 0;
  let lastTime = Date.now();
  let speed = 0;

  const report = (received: number) => {
    started = true;
    const now = Date.now();
    const elapsed = (now - lastTime) / 1000;
    if (elapsed >= 0.5) {
      const current = (received - lastBytes) / elapsed;
      //smooth chunks arriving in bursts
      speed = speed === 0 ? current : speed * 0.7 + current * 0.3;
      lastBytes = received;
      lastTime = now;
    }
    const ratio = model.sizeBytes > 0 ? Math.min(received / model.sizeBytes, 1) : 0;
    const etaSeconds = speed > 0 ? (model.sizeBytes - received) / speed : 0;
    const sizeStr = `${formatBytes(received)} / ${formatBytes(model.sizeBytes)}`;
    const speedStr = speed > 0 ? `${formatBytes(speed)}/s` : pending;
    onProgress?.(ratio, etaSeconds, speedStr, sizeStr);
    NotificationService.displayDownloadProgress(id, title, ratio, etaSeconds, speedStr, sizeStr);
  };

  //foreground service before the first chunk
  const start = async (resumedFrom = 0) => {
    started = true;
    lastBytes = resumedFrom;
    lastTime = Date.now();
    const ratio = model.sizeBytes > 0 ? resumedFrom / model.sizeBytes : 0;
    const sizeStr = `${formatBytes(resumedFrom)} / ${formatBytes(model.sizeBytes)}`;
    onProgress?.(ratio, 0, pending, sizeStr);
    await NotificationService.displayDownloadProgress(id, title, ratio, 0, pending, sizeStr);
  };

  //cached models leave the tray alone
  const settle = async (succeeded: boolean) => {
    if (!started) return;
    if (succeeded) await NotificationService.displayDownloadFinished(id, title);
    else await NotificationService.cancelNotification(id);
  };

  return { start, report, settle };
}

export type LiteRTDownloadSnapshot = { progress: number; etaSeconds: number; speedStr: string; sizeStr: string };
type LiteRTDownloadListener = (modelId: string, snapshot: LiteRTDownloadSnapshot | null) => void;

//settings and picker share one download
const activeDownloads = new Map<string, Promise<void>>();
const lastProgress = new Map<string, LiteRTDownloadSnapshot>();
const downloadListeners = new Set<LiteRTDownloadListener>();

export function subscribeLiteRTDownload(listener: LiteRTDownloadListener): () => void {
  downloadListeners.add(listener);
  return () => { downloadListeners.delete(listener); };
}

//late screens seed from the latest snapshot
export function getLiteRTDownloadSnapshot(modelName: string): LiteRTDownloadSnapshot | null {
  return lastProgress.get(modelName) ?? null;
}

function broadcastLiteRTDownload(modelId: string, snapshot: LiteRTDownloadSnapshot | null) {
  if (snapshot) lastProgress.set(modelId, snapshot);
  else lastProgress.delete(modelId);
  downloadListeners.forEach((l) => l(modelId, snapshot));
}

//tasks let the ui cancel transfers
const activeTasks = new Map<string, DownloadTask>();

export class LiteRTDownloadCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'LiteRTDownloadCancelled';
  }
}

//android resumes from the on-disk file
//ios restarts, resume data is opaque
function resumeStateFor(entry: CatalogEntry, file: File): DownloadPauseState | null {
  if (Platform.OS !== 'android') return null;
  const done = localSize(file);
  if (done <= 0 || done >= entry.sizeBytes) return null;
  return { url: entry.url, fileUri: file.uri, isDirectory: false, resumeData: String(done) };
}

//settings can finish a mid-flight model
async function setPendingDownload(modelName: string | null): Promise<void> {
  try {
    await Settings.setLocal(PENDING_KEY, modelName ?? '');
  } catch (error) {
    console.warn('[LiteRT] could not record the pending download:', error);
  }
}

export async function getPendingLiteRTDownload(): Promise<string | null> {
  try {
    const stored = (await Settings.getLocal(PENDING_KEY))?.trim();
    if (!stored) return null;
    const entry = getCatalogEntry(stored);
    if (!entry?.url || isLiteRTModelDownloaded(stored)) return null;
    return stored;
  } catch {
    return null;
  }
}

export function cancelLiteRTDownload(modelName: string): void {
  activeTasks.get(modelName)?.cancel();
}

//download now, build the engine later
export async function downloadLiteRTModel(modelName: string, onProgress?: ProgressCallback): Promise<void> {
  const model = getCatalogEntry(modelName);
  if (!model?.url) throw new Error(`Unknown LiteRT model: ${modelName}`);
  if (!isProviderSupported('litert')) throw new Error('LiteRT-LM is not available on this platform');
  if (isLiteRTModelDownloaded(modelName)) return;

  //second callers ride the same transfer
  const existing = activeDownloads.get(modelName);
  if (existing) {
    if (!onProgress) return existing;
    const unsubscribe = subscribeLiteRTDownload((id, snapshot) => {
      if (id === modelName && snapshot) onProgress(snapshot.progress, snapshot.etaSeconds, snapshot.speedStr, snapshot.sizeStr);
    });
    try {
      await existing;
    } finally {
      unsubscribe();
    }
    return;
  }

  const directory = modelsDirectory();
  if (!directory.exists) directory.create({ intermediates: true });
  const file = localFile(model);

  //oversized file is broken, not partial
  if (localSize(file) > model.sizeBytes) file.delete();
  const resumeState = resumeStateFor(model, file);
  const alreadyDone = resumeState ? localSize(file) : 0;
  if (!resumeState && file.exists) file.delete();

  const reporter = createDownloadReporter(modelName, model, (progress, etaSeconds, speedStr, sizeStr) => {
    onProgress?.(progress, etaSeconds, speedStr, sizeStr);
    broadcastLiteRTDownload(modelName, { progress, etaSeconds, speedStr, sizeStr });
  });

  const options = { onProgress: (p: { bytesWritten: number }) => reporter.report(p.bytesWritten) };
  const task = resumeState
    ? DownloadTask.fromSavable(resumeState, options)
    : new DownloadTask(model.url, file, options);
  activeTasks.set(modelName, task);

  const download = (async () => {
    await reporter.start(alreadyDone);
    await setPendingDownload(modelName);
    try {
      await (resumeState ? task.resumeAsync() : task.downloadAsync());
    } catch (e) {
      await reporter.settle(false);
      if (task.state === 'cancelled') throw new LiteRTDownloadCancelled();
      throw e;
    }
    await reporter.settle(true);
  })();

  activeDownloads.set(modelName, download);
  try {
    await download;
    await setPendingDownload(null);
  } catch (e) {
    //cancel drops bytes, interrupts resume
    if (e instanceof LiteRTDownloadCancelled) {
      await setPendingDownload(null);
      if (file.exists) file.delete();
    }
    throw e;
  } finally {
    activeTasks.delete(modelName);
    activeDownloads.delete(modelName);
    task.release();
    broadcastLiteRTDownload(modelName, null);
  }
}

//tool results replay as user turn
function toLiteRTMessage(message: { role: string; content: string }): LiteRTMessage {
  if (message.role === 'assistant') return { role: 'model', content: message.content };
  if (message.role === 'system') return { role: 'system', content: message.content };
  if (message.role === 'tool') {
    return { role: 'user', content: `[SYSTEM: Automated Tool Execution Result]\n${message.content}` };
  }
  return { role: 'user', content: message.content };
}

//base64 images become vision buffers
function buildParts(message?: { content: string; images?: string[] }): MultimodalPart[] {
  if (!message) return [];
  const parts: MultimodalPart[] = [];
  for (const image of message.images ?? []) {
    if (!image) continue;
    const bytes = toByteArray(image.startsWith('data:') ? image.split(',')[1] : image);
    parts.push({
      type: 'image',
      imageBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });
  }
  if (message.content.trim().length > 0) parts.push({ type: 'text', text: message.content });
  return parts;
}

//shaped like fetch abort, marks interrupted
function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

//reflection maps to a thinking budget
function toThinkingOptions(think?: boolean | string): { enabled: boolean; tokenBudget: number } | undefined {
  if (!think || think === 'none') return undefined;
  return { enabled: true, tokenBudget: think === 'low' ? 512 : 2048 };
}

export class LiteRTProvider implements IAIProvider {
  private llm: LiteRTLMInstance | null = null;
  private loadedModel: string | null = null;
  private loadedKey = '';
  private loadedMultimodal = false;
  //engine work runs one at a time
  private pending: Promise<unknown> = Promise.resolve();

  async isAvailable(): Promise<boolean> {
    return isProviderSupported('litert');
  }

  //list what is on disk, browse elsewhere
  async getAvailableModels(): Promise<string[]> {
    if (!isProviderSupported('litert')) return [];
    //installed check reads the disk only
    await hydrateLiteRTCatalog();
    return getInstalledLiteRTModels().map((model) => model.id);
  }

  //no litert tools, always prompt fallback
  async getModelCapabilities(modelName: string): Promise<string[]> {
    if (!isProviderSupported('litert')) return [];
    return getCatalogEntry(modelName)?.capabilities ?? [];
  }

  //warm the disk, big downloads explicit
  async preloadModel(modelName: string): Promise<void> {
    await hydrateLiteRTCatalog();
    if (!isLiteRTModelDownloaded(modelName)) return;
    try {
      await this.ensureLoaded(modelName, false);
    } catch (e) {
      console.warn('LiteRT preloadModel error:', e);
    }
  }

  //weights fetched before the engine build
  async downloadService(modelName: string, onProgress?: ProgressCallback): Promise<void> {
    await downloadLiteRTModel(modelName, onProgress);
  }

  async sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[]; tool_calls?: any[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string; tools?: ToolDefinition[] },
    onMetrics?: (metrics: MessageMetrics) => void
  ): Promise<{ toolCalls?: ToolCall[]; content?: string }> {
    if (signal?.aborted) throw abortError();
    const latest = messages[messages.length - 1];
    //text only history, carry last image
    const carried = latest && !latest.images?.length && getCatalogEntry(modelName)?.capabilities?.includes('vision')
      ? [...messages].reverse().find((m) => m.images?.length)?.images
      : undefined;
    const lastMessage = carried ? { ...latest, images: carried } : latest;

    let aborted = false;
    let rejectOnAbort: (error: Error) => void = () => {};
    //abort frees the caller, engine finishes queued
    const abortedEarly = new Promise<never>((_, reject) => { rejectOnAbort = reject; });
    const onAbort = () => {
      aborted = true;
      rejectOnAbort(abortError());
    };
    signal?.addEventListener('abort', onAbort);

    const run = this.enqueue(async () => {
      const llm = await this.load(modelName, (lastMessage?.images?.length ?? 0) > 0);
      if (aborted) return {};

      const parts = buildParts(lastMessage);
      if (parts.length === 0) return {};

      //replay our transcript, calls stay stateless
      const history = messages
        .slice(0, -1)
        .map(toLiteRTMessage)
        .filter((m) => m.content.trim().length > 0);
      llm.resetConversation(JSON.stringify(history), systemPrompt);

      const startTime = Date.now();
      await llm.execute(
        parts,
        (token) => {
          //drop chunks after an abort
          if (aborted || !token) return;
          onChunk(token);
        },
        { thinking: toThinkingOptions(options?.think) }
      );

      if (!aborted) {
        const stats = llm.getStats();
        onMetrics?.({
          model: modelName,
          timeSec: (Date.now() - startTime) / 1000,
          tokens: stats.completionTokens,
          tokensPerSec: stats.tokensPerSecond,
        });
      }
      return {};
    });

    try {
      return await Promise.race([run, abortedEarly]);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  //single engine, work never overlaps
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.pending.catch(() => {}).then(task);
    this.pending = next.then(() => {}, () => {});
    return next;
  }

  //load only on model change
  private ensureLoaded(modelName: string, multimodal: boolean, onProgress?: ProgressCallback): Promise<LiteRTLMInstance> {
    return this.enqueue(() => this.load(modelName, multimodal, onProgress));
  }

  private async load(modelName: string, multimodal: boolean, onProgress?: ProgressCallback): Promise<LiteRTLMInstance> {
    if (!isProviderSupported('litert')) throw new Error('LiteRT-LM is not available on this platform');
    const model = getCatalogEntry(modelName);
    if (!model?.url) throw new Error(`Unknown LiteRT model: ${modelName}`);

    if (!this.llm) this.llm = createLLM();
    const llm = this.llm;
    const settings = Settings.getCached();
    //file or settings rebuild the engine
    const loadKey = [model.file, settings.litertContextLength, settings.litertForceLoad].join('|');
    //encoders cost gigabytes, load on demand
    if (this.loadedModel === modelName && this.loadedKey === loadKey && (this.loadedMultimodal || !multimodal)) return llm;

    //free the previous engine first
    if (this.loadedModel) {
      this.loadedModel = null;
      this.loadedMultimodal = false;
      await llm.unload();
    }

    //weights first, retried loads skip reporting
    await downloadLiteRTModel(modelName, onProgress);

    const forceLoad = settings.litertForceLoad;
    const configuredContext = settings.litertContextLength || DEFAULT_CONTEXT_TOKENS;
    const backend: Backend = backendForFile(model.file);

    console.log(`[LiteRT] backend: ${backend}`);

    //pre-flight memory check with fallback
    const contextCandidates = forceLoad
      ? [configuredContext]
      : [configuredContext, ...FALLBACK_CONTEXT_TOKENS.filter((c) => c < configuredContext)];

    //smaller context cannot fix oversized weights
    const floorContext = contextCandidates[contextCandidates.length - 1];
    const floorEstimate = estimateMemory({
      modelFileSizeBytes: model.sizeBytes,
      availableMemoryBytes: llm.getMemoryUsage().availableMemoryBytes,
      config: { backend, maxContextTokens: floorContext },
    });
    if (!forceLoad && floorEstimate.verdict === 'critical') {
      throw new Error(
        `not enough memory for ${getLiteRTModelLabel(modelName)}: ` +
        `${formatBytes(floorEstimate.totalEstimatedBytes)} needed at ${floorContext} tokens, ` +
        `${formatBytes(floorEstimate.availableBytes)} available`
      );
    }

    let lastError: unknown = null;

    for (const contextTokens of contextCandidates) {
      try {
        const memory = llm.getMemoryUsage();
        const estimate = estimateMemory({
          modelFileSizeBytes: model.sizeBytes,
          availableMemoryBytes: memory.availableMemoryBytes,
          config: { backend, maxContextTokens: contextTokens },
        });
        console.log(
          `[LiteRT] pre-flight: verdict=${estimate.verdict} ` +
          `model=${formatBytes(model.sizeBytes)} avail=${formatBytes(memory.availableMemoryBytes)} ` +
          `context=${contextTokens}`
        );
        if (estimate.verdict !== 'safe') {
          console.warn(`[LiteRT] recommendation: ${estimate.recommendation}`);
        }

        await llm.loadModel(localFile(model).uri, {
          backend,
          multimodal,
          maxContextTokens: contextTokens,
          forceLoad,
        });

        //log os memory pressure warnings
        llm.setMemoryWarningCallback((level, usage) => {
          console.warn(`[LiteRT] memory warning: level=${level} avail=${formatBytes(usage.availableMemoryBytes)} rss=${formatBytes(usage.residentBytes)}`);
        });

        this.loadedModel = modelName;
        this.loadedKey = loadKey;
        this.loadedMultimodal = multimodal;
        console.log(`[LiteRT] loaded: ${modelName} context=${contextTokens} backend=${backend} multimodal=${multimodal}`);
        return llm;
      } catch (e) {
        if (isMemoryError(e)) {
          console.warn(
            `[LiteRT] MemoryError at context=${contextTokens}: verdict=${e.estimate.verdict} ` +
            `recommendation=${e.estimate.recommendation}`
          );
          lastError = e;
          if (forceLoad) break;
          continue;
        }
        throw e;
      }
    }

    throw lastError ?? new Error('LiteRT model load failed: insufficient memory');
  }
}
