import { ITool, ToolDefinition, ToolPlatform, ToolSource, ToolWidget, TOOL_PAUSED } from './ITool';
import { universalFetch } from '../utils/universalFetch';
import { arrayBufferToBase64 } from '../utils/base64';
import { Settings } from '../../settings/SettingsService';
import { BROWSER_UA } from '../../net/userAgent';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import MarkdownImage from '../../../components/ui/MarkdownImage';
import { AppEvents } from '../../events';
import { DeviceEventEmitter } from 'react-native';
import { useState } from 'react';

//urls the user revealed this session
const allowed = new Set<string>();

const TOOL_NAME = 'read_image';

//system turn sent after approval
const RESUME_PROMPT = 'The user approved the pending image. Call read_image again with the same url and describe what it shows.';

//system turn sent after refusal
const REJECT_PROMPT = 'The user refused to let you read the image. Answer without it and do not ask again.';

//url the widget is waiting on
let awaiting: string | null = null;

//approval unlocks the url
function approve(url: string): void {
  allowed.add(url);
  //stale cards must not restart anything
  if (awaiting !== url) return;
  awaiting = null;
  DeviceEventEmitter.emit(AppEvents.toolResume, RESUME_PROMPT);
}

//refusal clears the wait and resumes
function refuse(url: string): void {
  if (awaiting !== url) return;
  awaiting = null;
  DeviceEventEmitter.emit(AppEvents.toolResume, REJECT_PROMPT);
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
//below this chart labels get lost
const MAX_IMAGE_WIDTH = 1024;
const JPEG_QUALITY = 0.8;
//raw fallback costs too many tokens
const RAW_FALLBACK_BYTES = 2 * 1024 * 1024;
const MAX_QUESTION_LENGTH = 300;

//vision bills by pixels
async function toModelBase64(buffer: ArrayBuffer, mime: string): Promise<string> {
  const source = `data:${mime};base64,${arrayBufferToBase64(buffer)}`;
  try {
    const original = await ImageManipulator.manipulate(source).renderAsync();
    //never upscale a small image
    if (original.width <= MAX_IMAGE_WIDTH) {
      const saved = await original.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG, base64: true });
      //empty payload breaks the provider
      if (!saved.base64) throw new Error('the image could not be re-encoded');
      return saved.base64;
    }
    const context = ImageManipulator.manipulate(source);
    context.resize({ width: MAX_IMAGE_WIDTH });
    const resized = await context.renderAsync();
    const saved = await resized.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG, base64: true });
    if (!saved.base64) throw new Error('the image could not be re-encoded');
    return saved.base64;
  } catch (e: any) {
    //small unsupported formats still pass
    if (buffer.byteLength > RAW_FALLBACK_BYTES) throw e;
    return arrayBufferToBase64(buffer);
  }
}

//card pauses the turn
function ImageApproval({ url, incognito }: { url: string; incognito?: boolean }) {
  const [refused, setRefused] = useState(false);
  //refusal comes back as a turn
  if (refused) return null;
  return (
    <MarkdownImage
      url={url}
      incognito={incognito}
      onReveal={approve}
      onReject={() => {
        setRefused(true);
        refuse(url);
      }}
    />
  );
}

export class ReadImageTool implements ITool {
  displayName = 'Read Image';
  displayDescription = 'Allow the assistant to look at images found on web pages, such as charts or diagrams.';
  enabledByDefault = true;
  //web hidden because of cors
  platforms: ToolPlatform[] = ['ios', 'android', 'desktop'];

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: TOOL_NAME,
      description: 'Look at an image from a web page, such as a chart, a diagram or a screenshot. Use the image URLs returned by fetch_pages. Returns a text description of what the image shows.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Absolute URL of the image to look at.',
          },
          question: {
            type: 'string',
            description: 'What to look for in the image, e.g. "the values of the 2025 bars". Omit for a general description.',
          },
        },
        required: ['url'],
      },
    },
  };

  //url waiting for user approval
  private pendingUrl: string | null = null;

  widget: ToolWidget<{ url: string }> = {
    name: 'Image Widget',
    //image card draws its own frame
    hasBorder: false,
    build: () => (this.pendingUrl ? { url: this.pendingUrl } : null),
    component: ({ data, incognito }) => (
      <ImageApproval url={data.url} incognito={incognito} />
    ),
  };

  async execute(
    args: Record<string, any>,
    _summarize?: (text: string, systemPrompt?: string) => Promise<string>,
    _recordSource?: (source: ToolSource) => void,
    describeImage?: (base64: string, prompt: string) => Promise<string>
  ): Promise<string> {
    this.pendingUrl = null;
    awaiting = null;

    const url = typeof args.url === 'string' ? args.url.trim() : '';
    if (!/^https?:\/\//i.test(url)) {
      return 'Error: missing or invalid url parameter.';
    }
    if (!describeImage) {
      return 'Error: no vision model is available right now.';
    }

    //same gate as chat images
    if (!Settings.getCached().showRemoteImages && !allowed.has(url)) {
      this.pendingUrl = url;
      awaiting = url;
      return TOOL_PAUSED;
    }

    const question = typeof args.question === 'string' ? args.question.trim().slice(0, MAX_QUESTION_LENGTH) : '';

    //kept for the failure message
    let detail = 'unknown format';
    try {
      //some hosts block the default agent
      const res = await universalFetch(url, { headers: { 'User-Agent': BROWSER_UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const type = res.headers.get('content-type') || '';
      if (!type.startsWith('image/')) throw new Error(`not an image (${type || 'unknown type'})`);

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('image is too large');

      const mime = type.split(';')[0].trim();
      detail = `${mime}, ${Math.round(buffer.byteLength / 1024)} KB`;
      const description = await describeImage(await toModelBase64(buffer, mime), question || 'Describe this image.');
      return description || 'No description returned.';
    } catch (e: any) {
      console.error('[ReadImageTool] error:', e?.message || e);
      throw new Error(`could not read the image (${detail}): ${e?.message || e}`);
    }
  }
}
