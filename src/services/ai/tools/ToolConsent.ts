import type { TranslationKey } from '../../../i18n';

export interface ConsentRequest {
  tool: string;
  title: TranslationKey;
  message: TranslationKey;
  resolve: (granted: boolean) => void;
}

type Host = (request: ConsentRequest) => void;

//bridges calls to mounted modal
class ToolConsentService {
  private hosts: Host[] = [];
  private pending = new Map<string, Promise<boolean>>();

  attach(host: Host): () => void {
    this.hosts.push(host);
    return () => {
      this.hosts = this.hosts.filter(h => h !== host);
    };
  }

  //null when no screen can ask
  request(tool: string, text: { title: TranslationKey; message: TranslationKey }): Promise<boolean> | null {
    const existing = this.pending.get(tool);
    if (existing) return existing;
    //latest mounted surface is in front
    const host = this.hosts[this.hosts.length - 1];
    if (!host) return null;

    const promise = new Promise<boolean>(resolve => {
      host({ tool, ...text, resolve });
    }).finally(() => this.pending.delete(tool));
    this.pending.set(tool, promise);
    return promise;
  }
}

export const ToolConsent = new ToolConsentService();
