import type { ConsentPrompt } from '../ai/tools/ITool';
import { ToolConsent } from '../ai/tools/ToolConsent';
import { ToolManager } from '../ai/tools/ToolManager';
import type { MessageMetrics } from '../db/DatabaseService';
import { createPlayback, type AudioPlayback } from '../speech/AudioPlayback';
import { connectGeminiLive } from './GeminiLiveClient';
import { liveEndpoint, type LiveBackend } from './liveBackend';
import { liveToolDefinitions, liveToolName, runLiveTool, SHOW_WIDGET } from './liveTools';
import { startMic, type MicStream } from './MicStream';
import { connectOpenAIRealtime } from './OpenAIRealtimeClient';
import { floatToPcm16Base64, rms } from './pcm';
import type { LiveProtocol, LiveToolResult, ProtocolEvents } from './protocol';

export type LiveState = 'connecting' | 'listening' | 'thinking' | 'tool' | 'speaking';

export type LiveCallbacks = {
  onState(state: LiveState): void;
  onVolume(level: number): void;
  //running text of the current turn
  onTranscript(user: string, assistant: string): void;
  //name of the running tool, null when done
  onTool(name: string | null): void;
  //widget blocks of the latest turn
  onWidgets(markdown: string): void;
  //saved as soon as known, user first
  onMessage(role: 'user' | 'assistant', content: string, metrics?: MessageMetrics): void;
  onError(message: string): void;
};

export type LiveSession = {
  setMicMuted(muted: boolean): void;
  sendFrame(jpegBase64: string): void;
  //stop the reply now
  interrupt(): void;
  stop(): void;
};

//voice must beat the measured echo for 300 ms
const BARGE_IN_RMS = 0.08;
const BARGE_IN_ECHO_RATIO = 3;
const BARGE_IN_CHUNKS = 3;
//slow average so speech barely moves it
const ECHO_SMOOTHING = 0.05;
//listen to the echo first, no barge in yet
const ECHO_LEARN_MS = 600;
const ECHO_LEARN_SMOOTHING = 0.3;
//openai transcribes the user after the reply may end
const USER_TRANSCRIPT_WAIT_MS = 1500;

export async function startLiveSession(
  backend: LiveBackend,
  instructions: string,
  cb: LiveCallbacks,
): Promise<LiveSession> {
  let state: LiveState = 'connecting';
  const setState = (next: LiveState) => {
    if (next === state) return;
    state = next;
    cb.onState(next);
  };
  cb.onState(state);

  let playback: AudioPlayback | null = null;
  //drops deltas of a cancelled reply
  let dropAudio = false;
  let turnUser = '';
  let turnAssistant = '';
  let turnWidgets = '';
  let consentBlock = '';
  let userSaved = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  //reply timing for the technical details
  let replyStart = 0;
  let replyMetrics: MessageMetrics = {};
  //the question is saved once the reply starts
  const saveUser = () => {
    const text = turnUser.trim();
    if (userSaved || !text) return;
    userSaved = true;
    cb.onMessage('user', text);
    showTranscript();
  };
  //a saved question already shows in the list
  const showTranscript = () => cb.onTranscript(userSaved ? '' : turnUser, turnAssistant);
  const markReply = () => {
    if (!replyStart) replyStart = Date.now();
    saveUser();
  };
  const showWidgets = () => cb.onWidgets(turnWidgets + consentBlock);

  const flushTurn = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    //widgets stay saved with the reply
    const assistant = (turnWidgets + turnAssistant).trim();
    saveUser();
    if (assistant) cb.onMessage('assistant', assistant, replyMetrics);
    turnUser = '';
    turnAssistant = '';
    turnWidgets = '';
    userSaved = false;
    cb.onTranscript('', '');
  };

  //released playbacks may still be sounding
  const sounding = new Set<AudioPlayback>();

  //lets the next audio start a new playback
  const releasePlayback = (): Promise<void> | null => {
    const current = playback;
    playback = null;
    return current ? current.finish().then(() => void sounding.delete(current)) : null;
  };

  const stopPlayback = () => {
    sounding.forEach((p) => p.stop());
    sounding.clear();
    playback = null;
  };

  //consent card shows under the animation
  const askConsent = (prompt: ConsentPrompt) => {
    const { id, answer } = ToolConsent.ask(prompt);
    consentBlock = ToolManager.buildConsentBlock(id);
    showWidgets();
    return answer.finally(() => {
      consentBlock = '';
      showWidgets();
    });
  };

  const events: ProtocolEvents = {
    audio(samples) {
      if (dropAudio || stopped) return;
      markReply();
      if (!playback) {
        playback = createPlayback(protocol.outputRate);
        sounding.add(playback);
        setState('speaking');
      }
      playback.enqueue(samples);
      cb.onVolume(rms(samples));
    },
    assistantText(delta) {
      markReply();
      turnAssistant += delta;
      showTranscript();
    },
    userText(delta) {
      turnUser += delta;
      showTranscript();
      if (flushTimer) flushTurn();
      else if (replyStart) saveUser();
    },
    async toolCalls(calls) {
      //the waiting sentence keeps playing
      releasePlayback();
      setState('tool');
      const results: LiveToolResult[] = [];
      for (const call of calls) {
        if (call.name !== SHOW_WIDGET) cb.onTool(liveToolName(call.name));
        const { output, widget } = await runLiveTool(call, askConsent);
        if (stopped) return;
        if (widget) {
          turnWidgets += widget;
          showWidgets();
        }
        results.push({ call, output });
      }
      cb.onTool(null);
      protocol.sendToolResults(results);
      setState('thinking');
    },
    speechStarted() {
      stopPlayback();
      setState('listening');
    },
    responseDone(tokens) {
      dropAudio = false;
      cb.onTool(null);
      const timeSec = replyStart ? (Date.now() - replyStart) / 1000 : undefined;
      replyMetrics = {
        model: backend.model,
        timeSec,
        tokens,
        tokensPerSec: tokens && timeSec ? tokens / timeSec : undefined,
      };
      replyStart = 0;
      if (!turnUser.trim() && turnAssistant.trim()) {
        flushTimer = setTimeout(flushTurn, USER_TRANSCRIPT_WAIT_MS);
      } else {
        flushTurn();
      }
      const finished = releasePlayback();
      if (!finished) {
        setState('listening');
        return;
      }
      finished.then(() => {
        if (state === 'speaking' && !playback) setState('listening');
      });
    },
    error(message) {
      if (!stopped) cb.onError(message);
    },
  };

  const { wsUrl, apiKey } = await liveEndpoint(backend);
  const options = {
    wsUrl,
    apiKey,
    model: backend.model,
    instructions,
    tools: liveToolDefinitions(backend.camera),
    events,
  };
  const protocol: LiveProtocol =
    backend.kind === 'gemini'
      ? await connectGeminiLive(options)
      : await connectOpenAIRealtime(options);

  let muted = false;
  let bargeChunks: Float32Array[] = [];
  //speaker sound picked up by the mic
  let echoLevel = 0;
  let speakingSince = 0;
  const append = (samples: Float32Array) => protocol.appendAudio(floatToPcm16Base64(samples));

  const onChunk = (samples: Float32Array) => {
    if (stopped) return;
    const level = rms(samples);
    if (state !== 'speaking') cb.onVolume(muted ? 0 : level);
    //loud speech over the echo cuts maestro off
    //echo of any sound still playing counts
    if (sounding.size > 0 && !muted) {
      if (!speakingSince) speakingSince = Date.now();
      if (Date.now() - speakingSince < ECHO_LEARN_MS) {
        echoLevel += (level - echoLevel) * ECHO_LEARN_SMOOTHING;
        return;
      }
      const loud = level > Math.max(BARGE_IN_RMS, echoLevel * BARGE_IN_ECHO_RATIO);
      bargeChunks = loud ? [...bargeChunks, samples] : [];
      if (!loud) echoLevel += (level - echoLevel) * ECHO_SMOOTHING;
      if (bargeChunks.length >= BARGE_IN_CHUNKS) {
        //the start of the sentence is not lost
        const heard = bargeChunks;
        bargeChunks = [];
        session.interrupt();
        heard.forEach(append);
        return;
      }
    } else {
      speakingSince = 0;
      bargeChunks = [];
    }
    //mic is ignored while maestro talks, echo would loop
    if (muted || sounding.size > 0 || state === 'tool') return;
    append(samples);
  };

  let mic: MicStream;
  try {
    mic = await startMic(protocol.inputRate, onChunk);
  } catch (e) {
    protocol.close();
    throw e;
  }
  setState('listening');

  const session: LiveSession = {
    setMicMuted(next) {
      muted = next;
    },
    sendFrame(jpegBase64) {
      protocol.sendFrame(jpegBase64);
    },
    interrupt() {
      if (state !== 'speaking' && state !== 'thinking' && sounding.size === 0) return;
      dropAudio = true;
      stopPlayback();
      protocol.cancel();
      setState('listening');
    },
    stop() {
      stopped = true;
      //hanging up keeps what was said
      if (replyStart) replyMetrics = { model: backend.model, timeSec: (Date.now() - replyStart) / 1000 };
      flushTurn();
      mic.stop();
      stopPlayback();
      protocol.close();
    },
  };
  return session;
}
