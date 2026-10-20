import type { AudioPlayback } from './AudioPlayback';

export type { AudioPlayback };

//one context per engine sample rate
const contexts = new Map<number, AudioContext>();

function contextFor(sampleRate: number): AudioContext {
  let context = contexts.get(sampleRate);
  if (!context) {
    context = new AudioContext({ sampleRate });
    contexts.set(sampleRate, context);
  }
  return context;
}

export function prepareAudio(sampleRate: number): void {
  contextFor(sampleRate);
}

//chunks are scheduled back to back
export function createPlayback(sampleRate: number): AudioPlayback {
  const context = contextFor(sampleRate);
  //autoplay policy may suspend it
  context.resume().catch(() => {});
  const sources = new Set<AudioBufferSourceNode>();
  let nextStart = 0;
  let closed = false;
  let released = false;
  let done = () => {};
  const finished = new Promise<void>((resolve) => (done = resolve));
  const release = () => {
    if (released) return;
    released = true;
    done();
  };
  const settle = () => {
    if (closed && sources.size === 0) release();
  };

  return {
    enqueue(samples) {
      if (released) return;
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      nextStart = Math.max(nextStart, context.currentTime);
      node.start(nextStart);
      nextStart += buffer.duration;
      sources.add(node);
      node.onended = () => {
        sources.delete(node);
        node.disconnect();
        settle();
      };
    },
    finish() {
      closed = true;
      settle();
      return finished;
    },
    stop() {
      for (const node of sources) {
        node.onended = null;
        try {
          node.stop();
        } catch (e) {
          console.warn('Audio playback stop error:', e);
        }
        node.disconnect();
      }
      sources.clear();
      release();
    },
  };
}
