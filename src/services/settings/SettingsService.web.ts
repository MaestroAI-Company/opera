export type AppSettings = {
  language: string;
  theme: string;
  aiService: string;
  ollamaUrl: string;
  ollamaModel: string;
  whisperModel: string;
  whisperLanguage: string;
  instruction: string;
  speaker: boolean;
  alwaysWhisper: boolean;
};

const DEFAULTS: AppSettings = {
  language: 'fr',
  theme: 'system',
  aiService: 'ollama',
  ollamaUrl: '',
  ollamaModel: '',
  whisperModel: 'base',
  whisperLanguage: (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0] || 'auto';
    } catch {
      return 'auto';
    }
  })(),
  instruction: '',
  speaker: false,
  alwaysWhisper: false,
};

class SettingsService {
  private cache: AppSettings | null = null;

  // init settings
  async init(): Promise<void> {
    try {
      await this.load();
    } catch (e) {
      console.error('settings init failed', e);
    }
  }

  // load settings from localstorage
  async load(): Promise<AppSettings> {
    try {
      const stored = localStorage.getItem('opera_settings');
      const parsed = stored ? JSON.parse(stored) : {};
      
      const settings: AppSettings = {
        language: parsed.language ?? DEFAULTS.language,
        theme: parsed.theme ?? DEFAULTS.theme,
        aiService: parsed.aiService ?? DEFAULTS.aiService,
        ollamaUrl: parsed.ollamaUrl ?? DEFAULTS.ollamaUrl,
        ollamaModel: parsed.ollamaModel ?? DEFAULTS.ollamaModel,
        whisperModel: parsed.whisperModel ?? DEFAULTS.whisperModel,
        whisperLanguage: parsed.whisperLanguage ?? DEFAULTS.whisperLanguage,
        instruction: parsed.instruction ?? DEFAULTS.instruction,
        speaker: typeof parsed.speaker === 'boolean' ? parsed.speaker : DEFAULTS.speaker,
        alwaysWhisper: typeof parsed.alwaysWhisper === 'boolean' ? parsed.alwaysWhisper : DEFAULTS.alwaysWhisper,
      };
      
      this.cache = settings;
      return settings;
    } catch (e) {
      console.error('failed to load settings', e);
      this.cache = { ...DEFAULTS };
      return this.cache;
    }
  }

  // save to localstorage
  private save(): void {
    if (this.cache) {
      localStorage.setItem('opera_settings', JSON.stringify(this.cache));
    }
  }

  // set single key-value
  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    if (!this.cache) {
      this.cache = { ...DEFAULTS };
    }
    (this.cache as any)[key] = value;
    this.save();
  }

  // set multiple settings
  async setMany(partial: Partial<AppSettings>): Promise<void> {
    if (!this.cache) {
      this.cache = { ...DEFAULTS };
    }
    Object.assign(this.cache, partial);
    this.save();
  }

  // get cached settings
  getCached(): AppSettings {
    return this.cache ?? { ...DEFAULTS };
  }
}

// export settings instance
export const Settings = new SettingsService();
