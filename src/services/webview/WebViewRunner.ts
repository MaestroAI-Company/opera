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

type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  task: WebViewTask;
};

//runs webview jobs for any service that needs a real browser (search, page fetch, pdf parsing)
class WebViewRunnerService {
  private pending = new Map<string, Pending>();
  private listeners = new Set<(tasks: RunningTask[]) => void>();
  private counter = 0;

  //resolves with the first json message the page posts back
  run<T>(task: WebViewTask): Promise<T> {
    const id = `wv-${++this.counter}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(id, new Error('WebView task timed out')), task.timeoutMs ?? DEFAULT_TIMEOUT);
      this.pending.set(id, { resolve, reject, timer, task });
      this.emit();
    });
  }

  //parallel jobs, a failed one comes back as null instead of sinking the batch
  runAll<T>(tasks: WebViewTask[]): Promise<(T | null)[]> {
    return Promise.all(tasks.map(t => this.run<T>(t).catch(() => null)));
  }

  //called by the headless webview when a page posts a message
  deliver(id: string, raw: string): void {
    const entry = this.pending.get(id);
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
    return Array.from(this.pending.entries()).map(([id, entry]) => ({ id, task: entry.task }));
  }

  subscribe(listener: (tasks: RunningTask[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getTasks());
    return () => this.listeners.delete(listener);
  }

  private settle(id: string, apply: (entry: Pending) => void): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    apply(entry);
    this.emit();
  }

  private emit(): void {
    const tasks = this.getTasks();
    this.listeners.forEach(l => l(tasks));
  }
}

export const WebViewRunner = new WebViewRunnerService();
