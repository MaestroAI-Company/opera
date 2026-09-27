//sentences fed while a reply streams
export class SentenceQueue {
  private items: string[] = [];
  private closed = false;
  private wake: (() => void) | null = null;

  push(sentences: string[]): void {
    if (this.closed || sentences.length === 0) return;
    this.items.push(...sentences);
    this.signal();
  }

  //puts back a sentence not spoken
  unshift(sentence: string): void {
    this.items.unshift(sentence);
  }

  close(): void {
    this.closed = true;
    this.signal();
  }

  //null once closed and empty
  async next(): Promise<string | null> {
    await this.ready();
    return this.items.shift() ?? null;
  }

  //everything buffered, empty once closed
  async drain(): Promise<string[]> {
    await this.ready();
    return this.items.splice(0);
  }

  async peek(): Promise<string[]> {
    await this.ready();
    return [...this.items];
  }

  private async ready(): Promise<void> {
    while (this.items.length === 0 && !this.closed) {
      await new Promise<void>((resolve) => (this.wake = resolve));
    }
  }

  private signal(): void {
    this.wake?.();
    this.wake = null;
  }
}
