import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

//secrets stay out of the settings table so cloud sync never carries them
export async function setSecret(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

export async function getSecret(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(key);
  return await SecureStore.getItemAsync(key);
}
