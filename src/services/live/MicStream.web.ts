import type { MicStream } from './MicStream';

export type { MicStream };

export async function startMic(sampleRate: number, onChunk: (samples: Float32Array) => void): Promise<MicStream> {
  //browser echo canceller allows barge in
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const context = new AudioContext({ sampleRate });
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(processor);
  processor.connect(context.destination);
  return {
    stop() {
      processor.onaudioprocess = null;
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      context.close().catch(() => {});
    },
  };
}
