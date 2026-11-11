import { pcm16Base64ToFloat } from './pcm';
import { frameText, openSocket, parseArgs, waitFor, type LiveProtocol, type ProtocolOptions } from './protocol';

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

//gemini live api over websocket
export async function connectGeminiLive(options: ProtocolOptions): Promise<LiveProtocol> {
  const { wsUrl, model, instructions, events } = options;
  const ws = openSocket(wsUrl);
  const send = (msg: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('cannot reach the live server'));
  });
  const ready = waitFor(ws, (m) => 'setupComplete' in m);
  send({
    setup: {
      model: `models/${model}`,
      generationConfig: { responseModalities: ['AUDIO'] },
      systemInstruction: { parts: [{ text: instructions }] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools: options.tools.length
        ? [{ functionDeclarations: options.tools.map((t) => t.function) }]
        : undefined,
    },
  });
  await ready;

  let closing = false;
  let tokens: number | undefined;
  ws.addEventListener('message', async (e: MessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(await frameText(e.data));
    } catch {
      return;
    }
    //usage may come apart from the content
    if (msg.usageMetadata?.responseTokenCount) tokens = msg.usageMetadata.responseTokenCount;
    const calls = msg.toolCall?.functionCalls;
    if (calls?.length) {
      events.toolCalls(calls.map((c: any) => ({ id: c.id, name: c.name, args: parseArgs(c.args) })));
      return;
    }
    const content = msg.serverContent;
    if (!content) return;
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) events.audio(pcm16Base64ToFloat(part.inlineData.data));
    }
    if (content.inputTranscription?.text) events.userText(content.inputTranscription.text);
    if (content.outputTranscription?.text) events.assistantText(content.outputTranscription.text);
    if (content.interrupted) {
      events.speechStarted();
      events.responseDone();
    }
    if (content.turnComplete) {
      events.responseDone(tokens);
      tokens = undefined;
    }
  });
  ws.addEventListener('close', (e: CloseEvent) => {
    if (!closing) events.error(e.reason || 'live session closed');
  });

  return {
    inputRate: INPUT_RATE,
    outputRate: OUTPUT_RATE,
    appendAudio(pcm16Base64) {
      send({ realtimeInput: { audio: { data: pcm16Base64, mimeType: `audio/pcm;rate=${INPUT_RATE}` } } });
    },
    sendToolResults(results) {
      send({
        toolResponse: {
          functionResponses: results.map(({ call, output }) => ({ id: call.id, name: call.name, response: { result: output } })),
        },
      });
    },
    sendFrame(jpegBase64) {
      send({ realtimeInput: { video: { data: jpegBase64, mimeType: 'image/jpeg' } } });
    },
    //server vad stops the reply itself
    cancel() {},
    close() {
      closing = true;
      ws.close();
    },
  };
}
