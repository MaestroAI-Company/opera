import { getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from "expo-alternate-app-icons";
import { AppState } from "react-native";
import { AppSettings, parseTtsVoices } from "./settings/schema";
import { Settings } from "./settings/SettingsService";

//alternate icon names declared in app.json, the red voice keeps the default icon
const ICON_BY_VOICE: Record<string, string> = { F2: "Pink", M1: "Amber", M2: "Blue" };

function wantedIcon(settings: AppSettings): string | null {
  if (!settings.applyMaestroColor) return null;
  return ICON_BY_VOICE[parseTtsVoices(settings.ttsVoices).supertonic] ?? null;
}

//ios alert interrupts audio, so callers wait for the user to leave settings
export async function syncAppIcon(): Promise<void> {
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

    //leaving the app applies the pending icon too
    AppState.addEventListener("change", (state) => {
      if (state !== "active") syncAppIcon();
    });
    syncAppIcon();
  })();
}
