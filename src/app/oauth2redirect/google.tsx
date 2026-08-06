import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Colors } from "../../../constants/theme";
import { CloudSync } from "../../services/CloudSyncService";
import { GoogleDriveProvider } from "../../services/cloud/GoogleDriveProvider";

export default function OAuthRedirect() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    const finish = async () => {
      if (handled.current) return;
      handled.current = true;

      if (Platform.OS === 'web') {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = params.get('access_token');
        if (accessToken) {
          const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
          try {
            const provider = new GoogleDriveProvider();
            await provider.persistRedirectTokens(accessToken, expiresIn);
            await CloudSync.setProvider('google_drive');
          } catch (e) {
            console.warn('Failed to complete Google Drive connect:', e);
          }
        }
        //strip token from url so a reload doesn't reprocess it
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  }
});
