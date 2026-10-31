import 'expo-router/entry';
import { AppRegistry } from 'react-native';

//optional fetcher loaded before models
try {
  const { initExecutorch } = require('react-native-executorch');
  const { ExpoResourceFetcher } = require('react-native-executorch-expo-resource-fetcher');
  initExecutorch({ resourceFetcher: ExpoResourceFetcher });
} catch (e) {
  console.warn('ExecuTorch setup skipped:', e);
}

//keep overlay off startup path
AppRegistry.registerComponent('AssistantOverlay', () => require('./src/components/features/AssistantOverlay').default);
AppRegistry.registerComponent('OperaDream', () => require('./src/components/features/OperaDream').default);
