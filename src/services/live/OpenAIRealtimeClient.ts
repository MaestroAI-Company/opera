import { Platform } from 'react-native';
import { pcm16Base64ToFloat } from './pcm';
import {
  frameText,
  openSocket,
  parseArgs,
  waitFor,
  type LiveProtocol,
  type LiveToolCall,
  type ProtocolOptions,
} from './protocol';

const OPENAI_RATE = 24000;
const OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
//benign errors after a cancel
const IGNORED_ERRORS = ['response_cancel_not_active'];

//openai realtime ga over websocket
export async function connectOpenAIRealtime(options: ProtocolOptions): Promise<LiveProtocol> {
  const { wsUrl, apiKey, instructions, events } = options;
  //realtime tools are flat, not nested in function
  const tools = options.tools.map((t) => ({ type: 'function', ...t.function }));
  const isWeb = Platform.OS === 'web';
  //browsers cannot set headers on websockets
  const protocols = isWeb && apiKey ? ['realtime', `openai-insecure-api-key.${apiKey}`] : undefined;
  const headers = !isWeb && apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
  const ws = openSocket(wsUrl, protocols, headers);
  const send = (msg: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  await waitFor(ws, (m) => m.type === 'session.created');
  const updated = waitFor(ws, (m) => m.type === 'session.updated');
  send({
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions,
      output_modalities: ['audio'],
      tools,
      tool_choice: 'auto',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: OPENAI_RATE },
          transcription: { model: OPENAI_TRANSCRIBE_MODEL },
          turn_detection: { type: 'semantic_vad' },
        },
        output: { format: { type: 'audio/pcm', rate: OPENAI_RATE } },
      },
    },
  });
  await updated;

  let latestFrame: string | null = null;
  let responding = false;
  let closing = false;
  let calls: LiveToolCall[] = [];

  const sendFrameItem = () => {
    if (!latestFrame) return;
    send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_image', image_url: `data:image/jpeg;base64,${latestFrame}` }],
      },
    });
    latestFrame = null;
  };

  ws.addEventListener('message', async (e: MessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(await frameText(e.data));
    } catch {
      return;
    }
    switch (msg.type) {
      case 'response.created':
        responding = true;
        break;
      case 'response.output_audio.delta':
        events.audio(pcm16Base64ToFloat(msg.delta));
        break;
      case 'response.output_audio_transcript.delta':
        events.assistantText(msg.delta);
        break;
      case 'conversation.item.input_audio_transcription.completed':
        events.userText(msg.transcript ?? '');
        break;
      case 'input_audio_buffer.speech_started':
        //frame from the start of the question
        sendFrameItem();
        events.speechStarted();
        break;
      case 'response.output_item.done':
        if (msg.item?.type === 'function_call') {
          calls.push({ id: msg.item.call_id, name: msg.item.name, args: parseArgs(msg.item.arguments) });
        }
        break;
      case 'response.done': {
        responding = false;
        const pending = calls;
        calls = [];
        //cancelled replies drop their calls
        if (pending.length > 0 && msg.response?.status === 'completed') events.toolCalls(pending);
        else events.responseDone(msg.response?.usage?.output_tokens);
        break;
      }
      case 'error':
        if (!IGNORED_ERRORS.includes(msg.error?.code)) events.error(msg.error?.message ?? 'live session error');
        break;
    }
  });
  ws.addEventListener('close', (e: CloseEvent) => {
    if (!closing) events.error(e.reason || 'live session closed');
  });

  return {
    inputRate: OPENAI_RATE,
    outputRate: OPENAI_RATE,
    appendAudio(pcm16Base64) {
      send({ type: 'input_audio_buffer.append', audio: pcm16Base64 });
    },
    sendFrame(jpegBase64) {
      latestFrame = jpegBase64;
    },
    sendToolResults(results) {
      for (const { call, output } of results) {
        send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: call.id, output } });
      }
      send({ type: 'response.create' });
    },
    cancel() {
      if (responding) send({ type: 'response.cancel' });
    },
    close() {
      closing = true;
      ws.close();
    },
  };
}
