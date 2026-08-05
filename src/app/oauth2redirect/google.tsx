import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from "../../../constants/theme";

export default function OAuthRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    //return to app after oauth
    const timer = setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    }, 100);
    
    return () => clearTimeout(timer);
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
