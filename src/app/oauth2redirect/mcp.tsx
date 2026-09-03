import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { McpAuth } from "../../services/mcp/McpAuth";
import { McpService } from "../../services/mcp/McpService";
import { Settings } from "../../services/settings/SettingsService";

export default function McpOAuthRedirect() {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    const finish = async () => {
      if (handled.current) return;
      handled.current = true;

      if (Platform.OS === 'web') {
        try {
          const params = new URLSearchParams(window.location.search);
          const serverId = await McpAuth.completeBrowserRedirect(params);
          if (serverId) {
            //hard load lands here with uninitialized services
            await Settings.init();
            await Settings.load();
            await McpService.init();
            await McpService.connect(serverId);
          }
        } catch (e) {
          console.warn('Failed to complete MCP connect:', e);
        }
        //strip the code from the url so a reload does not reprocess it
        window.history.replaceState(null, '', window.location.pathname);
      }

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    };
    finish();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  }
});
