import { DeviceEventEmitter } from 'react-native';
import { AppEvents } from '../events';

export type AppSettings = {
  language: string;
  theme: string;
  aiService: string;
  ollamaUrl: string;
  ollamaUrls: string;
  enabledProviders: string;
  ollamaModel: string;
  ollamaContextLength: number;
  ollamaKeepAlive: number;
  whisperModel: string;
  whisperLanguage: string;
  instruction: string;
  speaker: boolean;
  autoSpeak: boolean;
  alwaysWhisper: boolean;
  autoStartMic: boolean;
  hasSeenOnboarding: boolean;
  name: string;
  includeDateTime: boolean;
  dataWarningDismissed: boolean;
  useAppContext: boolean;
  shakeToReport: boolean;
  assistantPromptDismissed: boolean;
};

const DEFAULTS: AppSettings = {
  language: 'fr',
  theme: 'system',
  aiService: 'ollama',
  ollamaUrl: '',
  ollamaUrls: '[]',
  enabledProviders: 'local,ollama',
  ollamaModel: '',
  ollamaContextLength: 8192,
  ollamaKeepAlive: 300,
  whisperModel: 'base',
  whisperLanguage: (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0] || 'auto';
    } catch {
      return 'auto';
    }
  })(),
  instruction: '',
  speaker: true,
  autoSpeak: true,
  alwaysWhisper: false,
  autoStartMic: true,
  hasSeenOnboarding: false,
  name: '',
  includeDateTime: true,
  dataWarningDismissed: false,
  useAppContext: true,
  shakeToReport: true,
  assistantPromptDismissed: false,
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
        ollamaUrls: parsed.ollamaUrls ?? DEFAULTS.ollamaUrls,
        enabledProviders: parsed.enabledProviders ?? DEFAULTS.enabledProviders,
        ollamaModel: parsed.ollamaModel ?? DEFAULTS.ollamaModel,
        ollamaContextLength: typeof parsed.ollamaContextLength === 'number' ? parsed.ollamaContextLength : DEFAULTS.ollamaContextLength,
        ollamaKeepAlive: typeof parsed.ollamaKeepAlive === 'number' ? parsed.ollamaKeepAlive : DEFAULTS.ollamaKeepAlive,
        whisperModel: parsed.whisperModel ?? DEFAULTS.whisperModel,
        whisperLanguage: parsed.whisperLanguage ?? DEFAULTS.whisperLanguage,
        instruction: parsed.instruction ?? DEFAULTS.instruction,
        speaker: typeof parsed.speaker === 'boolean' ? parsed.speaker : DEFAULTS.speaker,
        autoSpeak: typeof parsed.autoSpeak === 'boolean' ? parsed.autoSpeak : DEFAULTS.autoSpeak,
        alwaysWhisper: typeof parsed.alwaysWhisper === 'boolean' ? parsed.alwaysWhisper : DEFAULTS.alwaysWhisper,
        autoStartMic: typeof parsed.autoStartMic === 'boolean' ? parsed.autoStartMic : DEFAULTS.autoStartMic,
        hasSeenOnboarding: typeof parsed.hasSeenOnboarding === 'boolean' ? parsed.hasSeenOnboarding : DEFAULTS.hasSeenOnboarding,
        name: parsed.name ?? DEFAULTS.name,
        includeDateTime: typeof parsed.includeDateTime === 'boolean' ? parsed.includeDateTime : DEFAULTS.includeDateTime,
        dataWarningDismissed: typeof parsed.dataWarningDismissed === 'boolean' ? parsed.dataWarningDismissed : DEFAULTS.dataWarningDismissed,
        useAppContext: typeof parsed.useAppContext === 'boolean' ? parsed.useAppContext : DEFAULTS.useAppContext,
        shakeToReport: typeof parsed.shakeToReport === 'boolean' ? parsed.shakeToReport : DEFAULTS.shakeToReport,
        assistantPromptDismissed: typeof parsed.assistantPromptDismissed === 'boolean' ? parsed.assistantPromptDismissed : DEFAULTS.assistantPromptDismissed,
      };
      
      this.cache = settings;
      return settings;
    } catch (e) {
      console.error('failed to load settings', e);
      this.cache = { ...DEFAULTS };
      return this.cache;
    }
  }

  // check if a setting key was explicitly saved
  async has(key: string): Promise<boolean> {
    const stored = localStorage.getItem('opera_settings');
    const parsed = stored ? JSON.parse(stored) : {};
    return Object.prototype.hasOwnProperty.call(parsed, key);
  }

  // save to localstorage
  private save(): void {
    if (this.cache) {
      localStorage.setItem('opera_settings', JSON.stringify(this.cache));
    }
  }

  //timestamp of last local settings change
  async getSettingsUpdatedAt(): Promise<number> {
    const stored = localStorage.getItem('opera_settings_updated_at');
    return stored ? (parseInt(stored, 10) || 0) : 0;
  }

  //force the settings timestamp (used by sync merge)
  async setSettingsUpdatedAt(value: number): Promise<void> {
    localStorage.setItem('opera_settings_updated_at', String(value));
  }

  private bumpSettingsUpdatedAt(): void {
    localStorage.setItem('opera_settings_updated_at', String(Date.now()));
  }

  // set single key-value
  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    if (!this.cache) {
      this.cache = { ...DEFAULTS };
    }
    (this.cache as any)[key] = value;
    this.bumpSettingsUpdatedAt();
    this.save();
    DeviceEventEmitter.emit(AppEvents.settingsChanged);
  }

  // set multiple settings
  async setMany(partial: Partial<AppSettings>): Promise<void> {
    if (!this.cache) {
      this.cache = { ...DEFAULTS };
    }
    Object.assign(this.cache, partial);
    this.bumpSettingsUpdatedAt();
    this.save();
    DeviceEventEmitter.emit(AppEvents.settingsChanged);
  }

  //apply cloud settings without bumping local timestamp
  async applyCloudSettings(partial: Partial<AppSettings>): Promise<void> {
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
