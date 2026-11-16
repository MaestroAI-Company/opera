import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { DeviceEventEmitter, Platform } from "react-native";
import { LightColors, VoiceAccents } from "../../../constants/theme";
import { getMaestroButterflyId, MAESTRO_BUTTERFLIES } from "../../components/features/maestroButterfly";
import { t } from "../../i18n";
import { DEFAULT_BUTTERFLY, quickActionsProps } from "../../widgets/widgetProps";
import { AppEvents } from "../events";
import { parseTtsVoices } from "../settings/schema";
import { Settings } from "../settings/SettingsService";

//wait for the last color tap
const SETTLE_MS = 1000;
//widget bitmaps must stay small
const BUTTERFLY_WIDTH = 800;

//widgets cannot read the app sandbox
async function copyToWidgets(
  directory: string,
  source: number,
  name: string,
  width?: number
): Promise<string> {
  const target = new File(directory, name);
  //name already encodes the content
  if (target.exists) return target.uri;

  const asset = Asset.fromModule(source);
  await asset.downloadAsync();
  let uri = asset.localUri ?? asset.uri;
  if (width) {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width });
    const image = await context.renderAsync();
    uri = (await image.saveAsync({ format: SaveFormat.PNG })).uri;
  }
  new File(uri).copy(target);
  return target.uri;
}

function currentAccent(): string {
  const settings = Settings.getCached();
  if (!settings.applyMaestroColor) return LightColors.primary;
  return VoiceAccents[parseTtsVoices(settings.ttsVoices).supertonic] ?? LightColors.primary;
}

async function sync(): Promise<void> {
  try {
    //expo go has no widgets module
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { widgetsDirectory } = require("expo-widgets") as typeof import("expo-widgets");
    const quickActions = require("../../widgets/QuickActions") as typeof import("../../widgets/QuickActions");
    const butterflyWidget = (require("../../widgets/Butterfly") as typeof import("../../widgets/Butterfly")).default;
    /* eslint-enable @typescript-eslint/no-require-imports */

    const accent = currentAccent();
    const butterflyId = getMaestroButterflyId();
    const directory = widgetsDirectory;
    const [addIcon, cameraIcon, image] = directory
      ? await Promise.all([
          copyToWidgets(directory, require("../../../assets/icons/add.png"), "add.png"),
          copyToWidgets(directory, require("../../../assets/icons/camera.png"), "camera.png"),
          copyToWidgets(
            directory,
            MAESTRO_BUTTERFLIES[butterflyId].base as number,
            `butterfly-${butterflyId}.png`,
            BUTTERFLY_WIDTH
          ),
        ])
      : ["", "", ""];

    const labels = { newLabel: t("conversations.new"), cameraLabel: t("attachment.camera") };
    quickActions.QuickActions.updateSnapshot(
      quickActionsProps(accent, labels, { addIcon, cameraIcon }, false)
    );
    if (Platform.OS === "android") {
      quickActions.QuickActionsWide.updateSnapshot(
        quickActionsProps(accent, labels, { addIcon, cameraIcon }, true)
      );
    }
    butterflyWidget.updateSnapshot({ ...DEFAULT_BUTTERFLY, accent, image });
  } catch {
    //next settings change retries
  }
}

let started = false;

//widgets follow butterfly and accent
export function initWidgets(): void {
  if (started) return;
  started = true;

  (async () => {
    try {
      await Settings.init();
      await Settings.load();
    } catch {
      //defaults would overwrite widgets
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
