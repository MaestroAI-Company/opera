import { resample } from './pcm';

type AudioApi = typeof import('react-native-audio-api');

export type MicStream = { stop(): void };

//chunks of about 100 ms
const CHUNK_MS = 100;

export async function startMic(sampleRate: number, onChunk: (samples: Float32Array) => void): Promise<MicStream> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const api = require('react-native-audio-api') as AudioApi;
  const permission = await api.AudioManager.requestRecordingPermissions();
  if (permission !== 'Granted') throw new Error('microphone permission denied');
  //voice chat mode enables the os echo canceller on ios
  api.AudioManager.setAudioSessionOptions({
    iosCategory: 'playAndRecord',
    iosMode: 'voiceChat',
    iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
  });
  const recorder = new api.AudioRecorder();
  recorder.onAudioReady(
    { sampleRate, bufferLength: Math.round((sampleRate * CHUNK_MS) / 1000), channelCount: 1 },
    ({ buffer }) => {
      //device may ignore the asked rate
      onChunk(resample(buffer.getChannelData(0), buffer.sampleRate, sampleRate));
    },
  );
  const started = await recorder.start();
  if (started.status === 'error') throw new Error(started.message);
  return {
    stop() {
      recorder.clearOnAudioReady();
      recorder.stop().catch(() => {});
    },
  };
}
