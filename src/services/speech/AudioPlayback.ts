type AudioApi = typeof import('react-native-audio-api');
type AudioContext = InstanceType<AudioApi['AudioContext']>;

export type AudioPlayback = {
  enqueue(samples: Float32Array): void;
  finish(): Promise<void>;
  stop(): void;
};

//one context per engine sample rate
const contexts = new Map<number, AudioContext>();

function contextFor(sampleRate: number): AudioContext {
  let context = contexts.get(sampleRate);
  if (!context) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require('react-native-audio-api') as AudioApi;
    context = new api.AudioContext({ sampleRate });
    contexts.set(sampleRate, context);
  }
  return context;
}

//first context creation is slow
export function prepareAudio(sampleRate: number): void {
  contextFor(sampleRate);
}

//plays silence while the chunk synthesizes
export function createPlayback(sampleRate: number): AudioPlayback {
  const context = contextFor(sampleRate);
  const node = context.createBufferQueueSource();
  node.connect(context.destination);

  let pending = 0;
  let closed = false;
  let released = false;
  let done = () => {};
  const finished = new Promise<void>((resolve) => (done = resolve));
  const release = () => {
    if (released) return;
    released = true;
    node.onBufferEnded = null;
    node.disconnect();
    done();
  };
  const settle = () => {
    if (closed && pending === 0) release();
  };

  node.onBufferEnded = () => {
    pending--;
    settle();
  };
  //lib rejects the default offset
  node.start(0, 0);

  return {
    enqueue(samples) {
      if (released) return;
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      pending++;
      node.enqueueBuffer(buffer);
    },
    finish() {
      closed = true;
      settle();
      return finished;
    },
    stop() {
      try {
        node.stop();
      } catch (e) {
        console.warn('Audio playback stop error:', e);
      }
      release();
    },
  };
}
