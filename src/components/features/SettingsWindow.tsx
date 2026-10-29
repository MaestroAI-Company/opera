import { useEffect, useState } from "react";
import { View } from "react-native";
import { useColors } from "../../hooks/useTheme";
import { CloudSync } from "../../services/CloudSyncService";
import { DB } from "../../services/db/DatabaseService";
import { HubSync } from "../../services/hub/HubSync";
import { McpService } from "../../services/mcp/McpService";
import { PluginRegistry } from "../../services/plugins/PluginRegistry";
import { Settings } from "../../services/settings/SettingsService";
import {
  closeSettingsWindow,
  notifyDataChanged,
  onSettingsNavigate,
} from "../../services/settingsWindow";
import SettingsDrawer, { SubPage } from "./SettingsDrawer";

//the main screen starts these, the settings window needs them to read and edit
async function startServices() {
  await DB.init();
  await Settings.init();
  await Settings.load();
  await PluginRegistry.init();
  await McpService.init();
  //background sync stays with the main window
  await CloudSync.init({ passive: true });
  await HubSync.readCached();
  McpService.connectAll().catch((e) => console.warn("Could not connect MCP servers:", e));
}

function readTarget() {
  const query = new URLSearchParams(window.location.search);
  return {
    page: (query.get("page") as SubPage | null) ?? undefined,
    pair: query.get("pair"),
  };
}

export default function SettingsWindow() {
  const Colors = useColors();
  const [ready, setReady] = useState(false);
  const [target, setTarget] = useState(readTarget);

  useEffect(() => {
    startServices()
      .catch((e) => console.warn("Settings window services failed:", e))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    onSettingsNavigate((page, pair) =>
      setTarget({ page: (page as SubPage | null) ?? undefined, pair }),
    ).then((unlisten) => {
      stop = unlisten;
    });
    return () => stop?.();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.groupedBackground }}>
      {ready && (
        <SettingsDrawer
          windowed
          isDesktop
          isLargeScreen
          visible
          initialSubPage={target.page}
          hubPairLink={target.pair}
          onHubPairLinkHandled={() => setTarget((t) => ({ ...t, pair: null }))}
          onClose={closeSettingsWindow}
          onDataChanged={notifyDataChanged}
        />
      )}
    </View>
  );
}
