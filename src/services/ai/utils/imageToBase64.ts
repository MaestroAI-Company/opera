import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export const DEFAULT_OLLAMA_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:11434'
  : 'http://127.0.0.1:11434';

//local file uri to base64
export async function imageToBase64(uri: string): Promise<string> {
  //strip picker query param
  const fileUri = uri.split('?name=')[0];
  return FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
}
