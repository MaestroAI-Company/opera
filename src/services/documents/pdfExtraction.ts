import { WebViewRunner } from '../webview/WebViewRunner';
import { PDFJSCORE_SOURCE } from './vendor/pdfjsCore';
import { PDFJSWORKER_SOURCE } from './vendor/pdfjsWorker';

//short pages render as scanned images
const TEXT_LAYER_MIN_CHARS = 24;
//same ceiling as picked images
const RENDER_MAX_DIMENSION = 1280;
const RENDER_QUALITY = 0.7;
//scanned page rendering is slow
const PARSE_TIMEOUT = 60000;

export interface PdfPage {
  index: number;
  text: string;
  //jpeg uri for textless pages
  image?: string;
}

export interface PdfParseResult {
  pageCount: number;
  pages: PdfPage[];
  //true when pages dropped by cap
  truncated: boolean;
}

const EXTRACT_JS = `
(function() {
  function post(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  function bytesFromBase64(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  //line breaks prevent paragraph gluing
  function itemsToText(items) {
    var out = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (typeof item.str !== 'string') continue;
      out += item.str;
      if (item.hasEOL) out += '\\n';
      else if (item.str.length > 0) out += ' ';
    }
    return out.replace(/[ \\t]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim();
  }

  async function renderPage(page) {
    var base = page.getViewport({ scale: 1 });
    var scale = Math.min(${RENDER_MAX_DIMENSION} / Math.max(base.width, base.height), 2);
    var viewport = page.getViewport({ scale: scale });
    var canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    var context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return canvas.toDataURL('image/jpeg', ${RENDER_QUALITY});
  }

  async function run() {
    try {
      var lib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
      //inline worker bundle avoids worker threads
      lib.GlobalWorkerOptions.workerSrc = 'pdf.worker.js';

      //webview needs these pdf.js flags
      var doc = await lib.getDocument({ data: bytesFromBase64(window.__PDF_DATA__) }).promise;

      var limit = Math.min(doc.numPages, window.__PDF_MAX_PAGES__);
      var pages = [];
      var rendered = 0;

      for (var i = 1; i <= limit; i++) {
        var page = await doc.getPage(i);
        var content = await page.getTextContent();
        var text = itemsToText(content.items);
        var entry = { index: i, text: text };
        //scanned page becomes vision model image
        if (text.length < ${TEXT_LAYER_MIN_CHARS} && rendered < window.__PDF_MAX_IMAGES__) {
          try {
            entry.image = await renderPage(page);
            rendered++;
          } catch (e) {}
        }
        page.cleanup();
        pages.push(entry);
      }

      post({ pageCount: doc.numPages, pages: pages, truncated: limit < doc.numPages });
    } catch (e) {
      post({ error: (e && e.message) ? e.message : String(e) });
    }
  }

  run();
})();
`;

//inlined payload needs no network
function buildHtml(base64: string, maxPages: number, maxImages: number): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
window.__PDF_DATA__ = ${JSON.stringify(base64)};
window.__PDF_MAX_PAGES__ = ${maxPages};
window.__PDF_MAX_IMAGES__ = ${maxImages};
</script><script>${PDFJSWORKER_SOURCE}</script><script>${PDFJSCORE_SOURCE}</script><script>${EXTRACT_JS}</script></body></html>`;
}

//pdf parse in headless webview
export function parsePdf(base64: string, maxPages: number, maxImages: number): Promise<PdfParseResult> {
  return WebViewRunner.run<PdfParseResult>({
    source: { html: buildHtml(base64, maxPages, maxImages) },
    timeoutMs: PARSE_TIMEOUT,
  });
}
