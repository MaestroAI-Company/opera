import 'expo-router/entry';
import { AppRegistry } from 'react-native';
import AssistantOverlay from './src/components/AssistantOverlay';

// Register the secondary entry point for the assistant overlay
AppRegistry.registerComponent('AssistantOverlay', () => AssistantOverlay);
