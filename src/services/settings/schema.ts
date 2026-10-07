import { defaultLocale } from '../../i18n/catalogs';

export type AppSettings = {
  language: string;
  theme: string;
  aiService: string;
  ollamaUrl: string;
  ollamaUrls: string;
  openaiUrls: string;
  mcpServers: string;
  enabledProviders: string;
  modelFailover: boolean;
  ollamaModel: string;
  ollamaContextLength: number;
  ollamaKeepAlive: number;
  quickFlowService: string;
  quickFlowUrl: string;
  quickFlowModel: string;
  whisperModel: string;
  whisperLanguage: string;
  instruction: string;
  speaker: boolean;
  autoSpeak: boolean;
  maestroButterfly: string;
  ttsEngine: string;
  ttsVoices: string;
  ttsSpeed: string;
  alwaysWhisper: boolean;
  autoStartMic: boolean;
  hasSeenOnboarding: boolean;
  name: string;
  includeDateTime: boolean;
  showTechnicalDetails: boolean;
  showDetectionBoxes: boolean;
  advancedMode: boolean;
  dataWarningDismissed: boolean;
  useAppContext: boolean;
  shakeToReport: boolean;
  assistantPromptDismissed: boolean;
  hasSeenAssistantOverlay: boolean;
  shareInstanceUrl: string;
  litertForceLoad: boolean;
  litertContextLength: number;
};

//shared by both platforms, web overrides ollamaUrl
export const BASE_DEFAULTS: AppSettings = {
  language: defaultLocale(),
  theme: 'system',
  aiService: 'ollama',
  ollamaUrl: '',
  ollamaUrls: '[]',
  openaiUrls: '[]',
  mcpServers: '[]',
  enabledProviders: 'local,litert,ollama,openai,beta',
  modelFailover: true,
  ollamaModel: '',
  ollamaContextLength: 8192,
  ollamaKeepAlive: 300,
  //empty means chores use main model
  quickFlowService: '',
  quickFlowUrl: '',
  quickFlowModel: '',
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
  //empty means the first butterfly
  maestroButterfly: '',
  //supertonic until the user picks system
  ttsEngine: 'supertonic',
  //engine id to voice json
  ttsVoices: '{}',
  //string keeps fractional rates
  ttsSpeed: '1',
  alwaysWhisper: false,
  autoStartMic: true,
  hasSeenOnboarding: false,
  name: '',
  includeDateTime: true,
  showTechnicalDetails: false,
  showDetectionBoxes: false,
  advancedMode: false,
  dataWarningDismissed: false,
  useAppContext: true,
  shakeToReport: true,
  assistantPromptDismissed: false,
  hasSeenAssistantOverlay: false,
  //empty means the built-in privatebin instance
  shareInstanceUrl: '',
  litertForceLoad: false,
  litertContextLength: 8192,
};

//text storage needs per-key readers
const BOOLEAN_KEYS = [
  'modelFailover',
  'speaker',
  'autoSpeak',
  'alwaysWhisper',
  'autoStartMic',
  'hasSeenOnboarding',
  'includeDateTime',
  'showTechnicalDetails',
  'showDetectionBoxes',
  'advancedMode',
  'dataWarningDismissed',
  'useAppContext',
  'shakeToReport',
  'assistantPromptDismissed',
  'hasSeenAssistantOverlay',
  'litertForceLoad',
] as const;

const NUMBER_KEYS = [
  'ollamaContextLength',
  'ollamaKeepAlive',
  'litertContextLength',
] as const;

export function isBooleanKey(key: string): boolean {
  return (BOOLEAN_KEYS as readonly string[]).includes(key);
}

export function isNumberKey(key: string): boolean {
  return (NUMBER_KEYS as readonly string[]).includes(key);
}
