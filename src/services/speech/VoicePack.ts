import { Settings } from '../settings/SettingsService';
import { isInstalling, NEURAL_ENGINES } from './engines';

type Host = (resolve: () => void) => void;

//bridges speech to the mounted modal
class VoicePackService {
  private hosts: Host[] = [];
  private pending: Promise<void> | null = null;

  attach(host: Host): () => void {
    this.hosts.push(host);
    return () => {
      this.hosts = this.hosts.filter((h) => h !== host);
    };
  }

  //resolves once voice is chosen
  ask(): Promise<void> {
    if (this.pending) return this.pending;
    const id = Settings.getCached().ttsEngine;
    const engine = NEURAL_ENGINES[id];
    if (!engine?.isSupported() || engine.isInstalled() || isInstalling(id)) return Promise.resolve();
    //latest mounted surface is in front
    const host = this.hosts[this.hosts.length - 1];
    if (!host) return Promise.resolve();
    this.pending = new Promise<void>((resolve) => host(resolve)).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
}

export const VoicePack = new VoicePackService();
