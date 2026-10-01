import { WebViewRunner, WebViewTask } from '../webview/WebViewRunner';
import { isTauri } from '../platform';

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
}

const GOOGLEBOT_UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 Googlebot/2.1; +http://www.google.com/bot.html";

const MAX_RESULTS = 5;

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
        if (text.length > 5000) text = text.substring(0, 5000) + '...';
        window.ReactNativeWebView.postMessage(JSON.stringify({ content: text, title: document.title, favicon: favicon }));
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
    const payloads = await Promise.all(
      urls.map(url =>
        runTask<{ content: string; title?: string; favicon?: string }>({
          source: { uri: url },
          injectedJavaScript: EXTRACT_CONTENT_JS,
          userAgent: GOOGLEBOT_UA,
          timeoutMs: 25000,
        }).catch(() => null)
      )
    );
    return payloads.flatMap((payload, i) =>
      payload ? [{ url: urls[i], content: payload.content, title: payload.title, favicon: payload.favicon }] : []
    );
  }
}

export const SearchBridge = new SearchBridgeService();
