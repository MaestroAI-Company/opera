import 'expo-router/entry';
import { AppRegistry } from 'react-native';
import AssistantOverlay from './src/components/features/AssistantOverlay';

//optional fetcher loaded before models
try {
  const { initExecutorch } = require('react-native-executorch');
  const { ExpoResourceFetcher } = require('react-native-executorch-expo-resource-fetcher');
  initExecutorch({ resourceFetcher: ExpoResourceFetcher });
} catch (e) {
  console.warn('ExecuTorch setup skipped:', e);
}

// Register the secondary entry point for the assistant overlay
AppRegistry.registerComponent('AssistantOverlay', () => AssistantOverlay);
