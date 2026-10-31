import { ITool, ToolContext, ToolDefinition, ToolPlatform } from './ITool';
import { universalFetch } from '../utils/universalFetch';
import { arrayBufferToBase64 } from '../utils/base64';
import { Settings } from '../../settings/SettingsService';
import { RemoteImages } from '../../net/remoteImages';
import { BROWSER_UA } from '../../net/userAgent';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
//below this chart labels get lost
const MAX_IMAGE_WIDTH = 1024;
const JPEG_QUALITY = 0.8;
const MAX_QUESTION_LENGTH = 300;
const FETCH_TIMEOUT_MS = 15000;

//vision bills by pixels
async function toModelBase64(buffer: ArrayBuffer, mime: string): Promise<string> {
  const context = ImageManipulator.manipulate(`data:${mime};base64,${arrayBufferToBase64(buffer)}`);
  let image = await context.renderAsync();
  //never upscale a small image
  if (image.width > MAX_IMAGE_WIDTH) {
    context.resize({ width: MAX_IMAGE_WIDTH });
    image = await context.renderAsync();
  }
  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG, base64: true });
  //empty payload breaks the provider
  if (!saved.base64) throw new Error('the image could not be re-encoded');
  return saved.base64;
}

//download with timeout and signal
async function download(url: string, signal?: AbortSignal): Promise<{ buffer: ArrayBuffer; mime: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    //some hosts block the default agent
    const res = await universalFetch(url, { headers: { 'User-Agent': BROWSER_UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) throw new Error(`not an image (${type || 'unknown type'})`);
    //abort when declared too large
    if (Number(res.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new Error('image is too large');

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('image is too large');
    return { buffer, mime: type.split(';')[0].trim() };
  } catch (e: any) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error(`timed out after ${FETCH_TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export class ReadImageTool implements ITool {
  displayName = 'Read Image';
  displayDescription = 'Allow the assistant to look at images found on web pages, such as charts or diagrams.';
  enabledByDefault = true;
  requiresVision = true;
  //web hidden because of cors
  platforms: ToolPlatform[] = ['ios', 'android', 'desktop'];

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'read_image',
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

  async execute(args: Record<string, any>, context: ToolContext = {}): Promise<string> {
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    let domain = '';
    try {
      domain = /^https?:\/\//i.test(url) ? new URL(url).hostname : '';
    } catch {}
    if (!domain) return 'Error: missing or invalid url parameter.';
    if (!context.describeImage) return 'Error: no vision model is available right now.';

    //same gate as chat images
    if (!RemoteImages.isAllowed(url)) {
      if (!context.askConsent) return 'The user must approve remote images, which cannot be asked right now. Answer without the image.';
      const answer = await context.askConsent({
        tool: 'read_image',
        title: 'markdown.image.external',
        message: 'markdown.image.warning',
        params: { domain },
        always: 'markdown.image.alwaysShow',
      });
      if (context.signal?.aborted) return 'Cancelled.';
      if (answer === 'deny') return 'The user refused to let you read this image. Answer without it and do not ask again.';
      if (answer === 'always') Settings.set('showRemoteImages', true);
      RemoteImages.allow(url);
    }

    const question = typeof args.question === 'string' ? args.question.trim().slice(0, MAX_QUESTION_LENGTH) : '';

    //kept for the failure message
    let detail = 'not downloaded';
    try {
      const { buffer, mime } = await download(url, context.signal);
      detail = `${mime}, ${Math.round(buffer.byteLength / 1024)} KB`;
      const description = await context.describeImage(await toModelBase64(buffer, mime), question || 'Describe this image.');
      return description || 'No description returned.';
    } catch (e: any) {
      console.error('[ReadImageTool] error:', e?.message || e);
      throw new Error(`could not read the image (${detail}): ${e?.message || e}`);
    }
  }
}
