import type { TranslationKey } from "../src/i18n";

//capability ids and labels only
export const MODEL_CAPABILITY_KEYS = {
  tools: "settings.model.capTools",
  vision: "settings.model.capVision",
  thinking: "settings.model.capThinking",
  audio: "settings.model.capAudio",
  video: "settings.model.capVideo",
} as const satisfies Record<string, TranslationKey>;

export type ModelCapabilityId = keyof typeof MODEL_CAPABILITY_KEYS;