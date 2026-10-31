import type { ConsentAnswer, ConsentPrompt } from './ITool';

//widget id of the inline card
export const CONSENT_WIDGET_ID = 'tool_consent';

type Pending = {
  prompt: ConsentPrompt;
  resolve: (answer: ConsentAnswer) => void;
};

//reply cards answer consent requests
class ToolConsentService {
  private pending = new Map<string, Pending>();
  private answered = new Set<string>();
  private listeners = new Set<() => void>();
  private counter = 0;

  //id goes in the streamed card
  ask(prompt: ConsentPrompt, signal?: AbortSignal): { id: string; answer: Promise<ConsentAnswer> } {
    const id = `consent-${Date.now()}-${++this.counter}`;
    const answer = new Promise<ConsentAnswer>(resolve => {
      this.pending.set(id, { prompt, resolve });
      //stopping the reply declines
      signal?.addEventListener('abort', () => this.answer(id, 'deny'), { once: true });
      if (signal?.aborted) this.answer(id, 'deny');
    });
    this.emit();
    return { id, answer };
  }

  get(id: string): ConsentPrompt | undefined {
    return this.pending.get(id)?.prompt;
  }

  //missing id indicates restart during wait
  status(id: string): 'pending' | 'answered' | 'expired' {
    if (this.pending.has(id)) return 'pending';
    return this.answered.has(id) ? 'answered' : 'expired';
  }

  answer(id: string, answer: ConsentAnswer): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    this.answered.add(id);
    entry.resolve(answer);
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.listeners.forEach(l => l());
  }
}

export const ToolConsent = new ToolConsentService();
