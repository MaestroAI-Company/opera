export type WebViewTaskSource = { uri: string } | { html: string };

//one page load driven by a service, rendered by the headless webview
export interface WebViewTask {
  source: WebViewTaskSource;
  //runs after load, must postMessage a json payload
  injectedJavaScript?: string;
  userAgent?: string;
  timeoutMs?: number;
}

export interface RunningTask {
  id: string;
  task: WebViewTask;
}

const DEFAULT_TIMEOUT = 20000;
//two slots keep fetch_pages parallel
const MAX_CONCURRENT = 2;

type Pending = {
  id: string;
  task: WebViewTask;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

type Running = Pending & {
  timer: ReturnType<typeof setTimeout>;
};

//short label for timeout messages
function describe(task: WebViewTask): string {
  const label = 'uri' in task.source ? task.source.uri : 'inline html';
  return label.length > 80 ? `${label.substring(0, 80)}...` : label;
}

//runs webview jobs for any service that needs a real browser (search, page fetch, pdf parsing)
class WebViewRunnerService {
  private queue: Pending[] = [];
  private running = new Map<string, Running>();
  private listeners = new Set<(tasks: RunningTask[]) => void>();
  private counter = 0;

  //resolves with the first json message the page posts back
  run<T>(task: WebViewTask): Promise<T> {
    const id = `wv-${++this.counter}`;
    return new Promise<T>((resolve, reject) => {
      //timer starts when the task renders
      this.queue.push({ id, task, resolve, reject });
      this.pump();
    });
  }

  //parallel jobs, a failed one comes back as null instead of sinking the batch
  runAll<T>(tasks: WebViewTask[]): Promise<(T | null)[]> {
    return Promise.all(tasks.map(t => this.run<T>(t).catch(() => null)));
  }

  //called by the headless webview when a page posts a message
  deliver(id: string, raw: string): void {
    const entry = this.running.get(id);
    if (!entry) return;
    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      this.fail(id, new Error('WebView returned an unreadable payload'));
      return;
    }
    //pages report their own failures through an error field
    if (payload && payload.error) {
      this.fail(id, new Error(String(payload.error)));
      return;
    }
    this.settle(id, entry => entry.resolve(payload));
  }

  fail(id: string, error: Error): void {
    this.settle(id, entry => entry.reject(error));
  }

  getTasks(): RunningTask[] {
    return Array.from(this.running.entries()).map(([id, entry]) => ({ id, task: entry.task }));
  }

  subscribe(listener: (tasks: RunningTask[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getTasks());
    return () => this.listeners.delete(listener);
  }

  //starts queued tasks
  private pump(): void {
    while (this.running.size < MAX_CONCURRENT && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      const timeoutMs = entry.task.timeoutMs ?? DEFAULT_TIMEOUT;
      const timer = setTimeout(
        () => this.fail(entry.id, new Error(`WebView task timed out after ${timeoutMs}ms (${describe(entry.task)})`)),
        timeoutMs
      );
      this.running.set(entry.id, { ...entry, timer });
    }
    this.emit();
  }

  private settle(id: string, apply: (entry: Running) => void): void {
    const entry = this.running.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.running.delete(id);
    apply(entry);
    this.pump();
  }

  private emit(): void {
    const tasks = this.getTasks();
    this.listeners.forEach(l => l(tasks));
  }
}

export const WebViewRunner = new WebViewRunnerService();
