import { useSyncExternalStore } from "react";
import { DeviceEventEmitter, ImageSourcePropType } from "react-native";
import { AppEvents } from "../../services/events";
import { Settings } from "../../services/settings/SettingsService";
import { setVoice } from "../../services/speech/engines";

export type MaestroButterfly = {
  color: ImageSourcePropType;
  grey: ImageSourcePropType;
  icon: ImageSourcePropType;
};

export type MaestroButterflyId =
  | "butterfly1"
  | "butterfly2"
  | "butterfly3"
  | "butterfly4"
  | "butterfly5";

const DEFAULT_BUTTERFLY: MaestroButterflyId = "butterfly1";

const butterfly2: MaestroButterfly = {
  color: require("../../../assets/images/butterfly2.png"),
  grey: require("../../../assets/images/butterfly2_grey.png"),
  icon: require("../../../assets/icons/operaicon2.png"),
};

export const MAESTRO_BUTTERFLIES: Record<MaestroButterflyId, MaestroButterfly> =
  {
    butterfly1: {
      color: require("../../../assets/images/butterfly1.png"),
      grey: require("../../../assets/images/butterfly1_grey.png"),
      icon: require("../../../assets/icons/operaicon.png"),
    },
    butterfly2,
    butterfly3: {
      color: require("../../../assets/images/butterfly3.png"),
      grey: require("../../../assets/images/butterfly3_grey.png"),
      icon: require("../../../assets/icons/operaicon3.png"),
    },
    butterfly4: {
      color: require("../../../assets/images/butterfly4.png"),
      grey: require("../../../assets/images/butterfly4_grey.png"),
      icon: require("../../../assets/icons/operaicon4.png"),
    },
    //hidden one, no tile in the selector
    butterfly5: {
      color: require("../../../assets/images/butterfly5.png"),
      grey: require("../../../assets/images/butterfly5_grey.png"),
      icon: require("../../../assets/icons/operaicon5.png"),
    },
  };

//selector tiles, butterfly5 stays hidden
export const BUTTERFLY_OPTIONS = (["butterfly1", "butterfly2", "butterfly3", "butterfly4"] as const).map((id) => ({
  id,
  icon: MAESTRO_BUTTERFLIES[id].icon,
}));

//each butterfly tile picks a supertonic voice
const BUTTERFLY_VOICES: Record<string, string> = {
  butterfly1: "F1",
  butterfly2: "F2",
  butterfly3: "M1",
  butterfly4: "M2",
};

export function selectButterfly(id: string): void {
  Settings.set("maestroButterfly", id);
  setVoice("supertonic", BUTTERFLY_VOICES[id]);
}

//unknown ids fall back to the default
function getSnapshot(): MaestroButterflyId {
  const id = Settings.getCached().maestroButterfly;
  return Object.keys(MAESTRO_BUTTERFLIES).includes(id)
    ? (id as MaestroButterflyId)
    : DEFAULT_BUTTERFLY;
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
