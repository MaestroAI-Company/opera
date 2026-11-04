import { useSyncExternalStore } from "react";
import { DeviceEventEmitter, ImageSourcePropType } from "react-native";
import { DEFAULT_PERSONALITY, PERSONALITY_DEPTHS, PERSONALITY_MOODS, PERSONALITY_STYLES, type PersonalitySettings } from "../../../constants/personality";
import { VoiceColors } from "../../../constants/theme";
import { getLocale, t, type TranslationKey } from "../../i18n";
import { AppEvents } from "../../services/events";
import { Settings } from "../../services/settings/SettingsService";
import { getVoice, setVoice } from "../../services/speech/engines";
import { TTS } from "../../services/speech/TTSService";

export type MaestroButterfly = {
  //black/white only, red accent cut out
  base: ImageSourcePropType;
  //red accent only, tinted to recolor it live
  accent: ImageSourcePropType;
  icon: ImageSourcePropType;
};

export type MaestroButterflyId =
  | "butterfly1"
  | "butterfly2"
  | "butterfly3"
  | "butterfly4"
  | "butterfly5"
  | "butterflyEgg";

const DEFAULT_BUTTERFLY: MaestroButterflyId = "butterfly1";

const butterfly2: MaestroButterfly = {
  base: require("../../../assets/images/butterflies/butterfly2_base.png"),
  accent: require("../../../assets/images/butterflies/butterfly2_accent.png"),
  icon: require("../../../assets/icons/operaicon2.png"),
};

export const MAESTRO_BUTTERFLIES: Record<MaestroButterflyId, MaestroButterfly> =
  {
    butterfly1: {
      base: require("../../../assets/images/butterflies/butterfly1_base.png"),
      accent: require("../../../assets/images/butterflies/butterfly1_accent.png"),
      icon: require("../../../assets/icons/operaicon.png"),
    },
    butterfly2,
    butterfly3: {
      base: require("../../../assets/images/butterflies/butterfly3_base.png"),
      accent: require("../../../assets/images/butterflies/butterfly3_accent.png"),
      icon: require("../../../assets/icons/operaicon3.png"),
    },
    butterfly4: {
      base: require("../../../assets/images/butterflies/butterfly4_base.png"),
      accent: require("../../../assets/images/butterflies/butterfly4_accent.png"),
      icon: require("../../../assets/icons/operaicon4.png"),
    },
    butterfly5: {
      base: require("../../../assets/images/butterflies/butterfly5_base.png"),
      accent: require("../../../assets/images/butterflies/butterfly5_accent.png"),
      icon: require("../../../assets/icons/operaicon5.png"),
    },
    //hidden one, no tile in the selector
    butterflyEgg: {
      base: require("../../../assets/images/butterflies/butterflyEgg_base.png"),
      accent: require("../../../assets/images/butterflies/butterflyEgg_accent.png"),
      icon: require("../../../assets/icons/operaiconEgg.png"),
    },
  };

//each supertonic voice owns an accent color
export const VOICE_OPTIONS = [
  { id: "F1", color: VoiceColors.red },
  { id: "F2", color: VoiceColors.pink },
  { id: "M1", color: VoiceColors.amber },
  { id: "M2", color: VoiceColors.blue },
];

const PREVIEW_COUNT = 8;
let previewIndex = 0;

export function selectVoice(id: string): void {
  setVoice("supertonic", id);
  //cache updates before speaking
  const key = `settings.tts.preview.${(previewIndex++ % PREVIEW_COUNT) + 1}` as TranslationKey;
  TTS.speak(t(key), { language: getLocale() });
}

const BUTTERFLY_IDS = Object.keys(MAESTRO_BUTTERFLIES).filter((id) => id !== "butterflyEgg");

//one number per answer combination, mood*9 + style*3 + depth
export function personalityCode(p: PersonalitySettings): number {
  return (
    PERSONALITY_MOODS.indexOf(p.maestroMood as never) * 9 +
    PERSONALITY_STYLES.indexOf(p.maestroStyle as never) * 3 +
    PERSONALITY_DEPTHS.indexOf(p.maestroDepth as never)
  );
}

export const DEFAULT_PERSONALITY_CODE = personalityCode(DEFAULT_PERSONALITY);

//every answer shifts the butterfly, neutral defaults give the first
export function butterflyForPersonality(p: PersonalitySettings): MaestroButterflyId {
  const shift = personalityCode(p) - DEFAULT_PERSONALITY_CODE;
  return BUTTERFLY_IDS[((shift % BUTTERFLY_IDS.length) + BUTTERFLY_IDS.length) % BUTTERFLY_IDS.length] as MaestroButterflyId;
}

//a stored id wins, else the personality picks
function getSnapshot(): MaestroButterflyId {
  const { maestroButterfly: id, maestroMood, maestroStyle, maestroDepth } = Settings.getCached();
  if (Object.keys(MAESTRO_BUTTERFLIES).includes(id)) return id as MaestroButterflyId;
  return butterflyForPersonality({ maestroMood, maestroStyle, maestroDepth });
}

function subscribe(callback: () => void): () => void {
  //settings page writes through Settings.set
  const sub = DeviceEventEmitter.addListener(AppEvents.settingsChanged, callback);
  return () => sub.remove();
}

//prerendered web html uses the default
function getServerSnapshot(): MaestroButterflyId {
  return DEFAULT_BUTTERFLY;
}

export function useMaestroButterfly(): MaestroButterflyId {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const getCodeSnapshot = () => personalityCode(Settings.getCached());

//live code of the personality answers
export function usePersonalityCode(): number {
  return useSyncExternalStore(subscribe, getCodeSnapshot, () => DEFAULT_PERSONALITY_CODE);
}

const getVoiceSnapshot = () => getVoice("supertonic");
const getServerVoice = () => VOICE_OPTIONS[0].id;

export function useVoice(): string {
  return useSyncExternalStore(subscribe, getVoiceSnapshot, getServerVoice);
}

//accent color of the current voice
export function useVoiceColor(): string {
  const voice = useVoice();
  return (VOICE_OPTIONS.find((v) => v.id === voice) ?? VOICE_OPTIONS[0]).color;
}
