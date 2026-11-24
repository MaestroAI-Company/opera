import { getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from "expo-alternate-app-icons";
import { DeviceEventEmitter } from "react-native";
import { AppEvents } from "./events";
import { AppSettings, parseTtsVoices } from "./settings/schema";
import { Settings } from "./settings/SettingsService";

//alternate icon names declared in app.json, the red voice keeps the default icon
const ICON_BY_VOICE: Record<string, string> = { F2: "Pink", M1: "Amber", M2: "Blue" };

//voice picker taps through colors, wait for the last one
const SETTLE_MS = 1000;

function wantedIcon(settings: AppSettings): string | null {
  if (!settings.applyMaestroColor) return null;
  return ICON_BY_VOICE[parseTtsVoices(settings.ttsVoices).supertonic] ?? null;
}

async function sync(): Promise<void> {
  const wanted = wantedIcon(Settings.getCached());
  //ios asks the user on every change
  if (getAppIconName() === wanted) return;
  try {
    await setAlternateAppIcon(wanted);
  } catch {
    //launcher refused, the next change retries
  }
}

let started = false;

//launcher icon follows the maestro color the same way the theme does
export function initAppIcon(): void {
  if (started || !supportsAlternateIcons) return;
  started = true;

  (async () => {
    try {
      await Settings.init();
      await Settings.load();
    } catch {
      //defaults would reset a saved icon
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    DeviceEventEmitter.addListener(AppEvents.settingsChanged, () => {
      clearTimeout(timer);
      timer = setTimeout(sync, SETTLE_MS);
    });
    sync();
  })();
}
