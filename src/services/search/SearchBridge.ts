import { WebViewRunner, WebViewTask } from '../webview/WebViewRunner';
import { isTauri } from '../platform';
import { BROWSER_UA } from '../net/userAgent';

//search result with extracted content
export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

export interface FetchResult {
  url: string;
  content: string;
  title?: string;
  favicon?: string;
  images?: PageImage[];
}

//image found on a fetched page
export interface PageImage {
  src: string;
  alt?: string;
}

const MAX_RESULTS = 5;
const MAX_IMAGES = 6;
//smaller images are icons or thumbnails
const MIN_IMAGE_SIZE = 100;
//enough for a phone screen
const MAX_IMAGE_WIDTH = 1600;

const EXTRACT_RESULTS_JS = `
(function() {
  function extract() {
    try {
      var links = document.querySelectorAll('.result__a');
      if (links.length === 0) return false;
      var results = [];
      var snippets = document.querySelectorAll('.result__snippet');
      for (var i = 0; i < links.length && results.length < ${MAX_RESULTS}; i++) {
        var href = links[i].href;
        if (href && href.includes('duckduckgo.com/l/?')) {
          try {
            var u = new URL(href);
            var uddg = u.searchParams.get('uddg');
            if (uddg) href = uddg;
          } catch(e) {}
        }
        if (href && href.startsWith('http') && href.indexOf('duckduckgo.com') === -1) {
          var snippetText = (snippets[i] && snippets[i].textContent) ? snippets[i].textContent.trim() : '';
          results.push({ title: links[i].textContent.trim(), url: href, snippet: snippetText });
        }
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ results: results }));
      return true;
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ results: [] }));
      return true;
    }
  }

  if (!extract()) {
    var observer = new MutationObserver(function(mutations, obs) {
      if (extract()) obs.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function() { observer.disconnect(); extract(); }, 5000);
  }
})(); true;
`;

const EXTRACT_CONTENT_JS = `
(function() {
  function abs(u) {
    try { return new URL(u, document.baseURI).href; } catch(e) { return ''; }
  }

  //biggest srcset candidate a phone needs
  function pickSrcset(set) {
    var best = '';
    var bestW = 0;
    (set || '').split(',').forEach(function(part) {
      var bits = part.trim().split(/\\s+/);
      if (!bits[0]) return;
      var d = bits[1] || '1x';
      var w = parseFloat(d) * (/x$/i.test(d) ? 800 : 1) || 0;
      var fits = w <= ${MAX_IMAGE_WIDTH};
      //best candidate fitting maximum width
      if (!best || (fits && (w > bestW || bestW > ${MAX_IMAGE_WIDTH})) || (!fits && bestW > w)) { best = bits[0]; bestW = w; }
    });
    return best;
  }

  //extract url from data attributes
  function imageUrl(el) {
    var picture = el.closest('picture');
    var source = picture ? picture.querySelector('source[srcset], source[data-srcset]') : null;
    var candidates = [
      el.getAttribute('data-src'),
      el.getAttribute('data-lazy-src'),
      el.getAttribute('data-original'),
      pickSrcset(el.getAttribute('data-srcset')),
      pickSrcset(el.getAttribute('srcset')),
      el.currentSrc,
      el.getAttribute('src'),
      source ? pickSrcset(source.getAttribute('srcset') || source.getAttribute('data-srcset')) : ''
    ];
    for (var i = 0; i < candidates.length; i++) {
      var u = candidates[i] ? abs(candidates[i].trim()) : '';
      //data uris are placeholders
      if (/^https?:/i.test(u)) return u;
    }
    return '';
  }

  //skip decorative and icon images
  var SKIP_URL = /(^|[\\/_.-])(logo|icons?|avatars?|sprites?|badges?|emojis?|pixel|spacer|blank|placeholder|loader|1x1)([\\/_.-]|$)|\\.svg($|[?#])/i;
  var SKIP_CLASS = /(^|\\s|-)(logo|icon|avatar|emoji|badge|sprite)(\\s|-|$)/i;

  function collectImages(main) {
    var out = [];
    var seen = {};
    function add(src, alt) {
      //deduplicate images by base url
      var key = src.split(/[?#]/)[0];
      if (!src || seen[key] || out.length >= ${MAX_IMAGES} || SKIP_URL.test(key)) return;
      seen[key] = true;
      out.push({ src: src, alt: (alt || '').replace(/\\s+/g, ' ').trim().slice(0, 120) });
    }

    //share image is the page hero
    var og = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
    var ogAlt = document.querySelector('meta[property="og:image:alt"]');
    var ogSrc = og ? abs(og.getAttribute('content') || '') : '';
    //site wide share cards say nothing
    if (ogSrc && !/default|social|share/i.test(ogSrc)) add(ogSrc, ogAlt ? ogAlt.getAttribute('content') : document.title);

    //prioritize article images over body
    var roots = main === document.body ? [document.body] : [main, document.body];
    for (var r = 0; r < roots.length; r++) {
      var imgs = roots[r].querySelectorAll('img');
      for (var i = 0; i < imgs.length && out.length < ${MAX_IMAGES}; i++) {
        var el = imgs[i];
        if (SKIP_CLASS.test((el.getAttribute('class') || '') + ' ' + (el.id || ''))) continue;
        //lazy images report zero until loaded
        var w = (el.complete && el.naturalWidth) || parseInt(el.getAttribute('width') || '0', 10);
        var h = (el.complete && el.naturalHeight) || parseInt(el.getAttribute('height') || '0', 10);
        if ((w && w < ${MIN_IMAGE_SIZE}) || (h && h < ${MIN_IMAGE_SIZE})) continue;
        var alt = el.getAttribute('alt') || el.getAttribute('title') || '';
        if (!alt.trim()) {
          var fig = el.closest('figure');
          var cap = fig ? fig.querySelector('figcaption') : null;
          if (cap) alt = cap.textContent;
        }
        add(imageUrl(el), alt);
      }
    }
    return out;
  }

  function walk(node) {
    if (node.nodeType === 3) return node.textContent.replace(/\\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    var tag = node.tagName.toLowerCase();
    var content = Array.from(node.childNodes).map(walk).join('');
    if (tag === 'h1') return '\\n# ' + content + '\\n';
    if (tag === 'h2') return '\\n## ' + content + '\\n';
    if (tag === 'h3') return '\\n### ' + content + '\\n';
    if (tag === 'p') return '\\n\\n' + content + '\\n\\n';
    if (tag === 'a') return '[' + content.trim() + '](' + node.href + ')';
    if (tag === 'b' || tag === 'strong') return '**' + content.trim() + '**';
    if (tag === 'i' || tag === 'em') return '*' + content.trim() + '*';
    if (tag === 'li') return '\\n- ' + content;
    if (tag === 'ul' || tag === 'ol') return '\\n' + content + '\\n';
    return content;
  }

  function extract(force) {
    try {
      var removeTags = ['script','style','nav','header','footer','aside','iframe','noscript','svg','form','button','menu'];
      removeTags.forEach(function(tag) {
        var els = document.querySelectorAll(tag);
        for (var i = 0; i < els.length; i++) els[i].remove();
      });
      var main = document.querySelector('main, article, [role="main"], .content, #content, .post, .article') || document.body;

      var text = walk(main);
      text = text.replace(/\\n{3,}/g, '\\n\\n').trim();

      //guessed favicon urls usually 404
      var iconLink = document.querySelector('link[rel~="icon"]');
      var favicon = iconLink ? iconLink.href : null;

      //send if enough text or forced
      if (text.length > 300 || force) {
        //stay above the summarize threshold
        if (text.length > 12000) text = text.substring(0, 12000) + '...';
        window.ReactNativeWebView.postMessage(JSON.stringify({ content: text, title: document.title, favicon: favicon, images: collectImages(main) }));
        return true;
      }
      return false;
    } catch(e) {
      if (force) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ content: 'Failed to extract content.' }));
      }
      return force;
    }
  }

  var attempts = 0;
  var interval = setInterval(function() {
    if (extract(false) || attempts > 50) { //poll every 100ms up to 5s
      clearInterval(interval);
      if (attempts > 50) extract(true); //force extract on timeout
    }
    attempts++;
  }, 100);
})(); true;
`;

//desktop uses a hidden tauri window
async function runTask<T>(task: WebViewTask & { source: { uri: string } }): Promise<T> {
  if (!isTauri) return WebViewRunner.run<T>(task);
  const { invoke } = await import('@tauri-apps/api/core');
  const raw = await invoke<string>('webview_task', {
    url: task.source.uri,
    script: task.injectedJavaScript ?? '',
    userAgent: task.userAgent ?? null,
    timeoutMs: task.timeoutMs ?? 20000,
  });
  return JSON.parse(raw);
}

//web browsing via shared headless webview
class SearchBridgeService {
  //start a search
  async search(query: string): Promise<SearchResult[]> {
    const payload = await runTask<{ results?: SearchResult[] }>({
      source: { uri: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}` },
      injectedJavaScript: EXTRACT_RESULTS_JS,
      timeoutMs: 15000,
    });
    return (payload.results ?? []).slice(0, MAX_RESULTS);
  }

  //fetch specific pages
  async fetchPages(urls: string[]): Promise<FetchResult[]> {
    type Payload = { content: string; title?: string; favicon?: string; images?: PageImage[] };
    const payloads = await Promise.all<Payload>(
      urls.map(url =>
        runTask<Payload>({
          source: { uri: url },
          injectedJavaScript: EXTRACT_CONTENT_JS,
          userAgent: BROWSER_UA,
          timeoutMs: 25000,
        })
          //keep failures visible
          .catch((e: any) => ({ content: `Failed to fetch: ${e?.message || e}` }))
      )
    );
    return payloads.map((payload, i) => ({
      url: urls[i],
      content: payload.content,
      title: payload.title,
      favicon: payload.favicon,
      images: payload.images,
    }));
  }
}

export const SearchBridge = new SearchBridgeService();
