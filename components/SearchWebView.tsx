import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';
import { SearchBridge, FetchResult } from '../src/services/search/SearchBridge';

const GOOGLEBOT_UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 Googlebot/2.1; +http://www.google.com/bot.html";

const EXTRACT_RESULTS_JS = `
(function() {
  function extract() {
    try {
      var links = document.querySelectorAll('.result__a');
      if (links.length === 0) return false;
      var results = [];
      var snippets = document.querySelectorAll('.result__snippet');
      for (var i = 0; i < links.length && results.length < 5; i++) {
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
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'search_results', results: results }));
      return true;
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'search_results', results: [] }));
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
      
      //send if enough text or forced
      if (text.length > 300 || force) {
        if (text.length > 5000) text = text.substring(0, 5000) + '...';
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'page_content', content: text }));
        return true;
      }
      return false;
    } catch(e) {
      if (force) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'page_content', content: 'Failed to extract content.' }));
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

export default function SearchWebView() {
  const [queryUrl, setQueryUrl] = useState('about:blank');
  const [fetchUrls, setFetchUrls] = useState<string[]>([]);
  
  const ddgRef = useRef<WebView>(null);
  const pageRefs = useRef<(WebView | null)[]>([]);
  
  const fetchResultsRef = useRef<FetchResult[]>([]);
  const completedCountRef = useRef(0);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubSearch = SearchBridge.subscribeSearch((query) => {
      setQueryUrl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    });

    const unsubFetch = SearchBridge.subscribeFetch((urls) => {
      setFetchUrls(urls);
      fetchResultsRef.current = [];
      completedCountRef.current = 0;
      
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
         if (fetchResultsRef.current.length > 0) {
            SearchBridge.resolveFetch([...fetchResultsRef.current]);
         } else {
            SearchBridge.rejectFetch(new Error('Fetch timeout'));
         }
         setFetchUrls([]);
      }, 25000);
    });

    return () => {
      unsubSearch();
      unsubFetch();
    };
  }, []);

  const handleDdgMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'search_results') {
        const results = (data.results || []).slice(0, 5); //max 5 sources
        SearchBridge.resolveSearch(results);
        setQueryUrl('about:blank');
      }
    } catch {
      SearchBridge.rejectSearch(new Error('Failed to parse search results'));
      setQueryUrl('about:blank');
    }
  }, []);

  const finishFetch = useCallback(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    SearchBridge.resolveFetch([...fetchResultsRef.current]);
    setFetchUrls([]);
  }, []);

  const handlePageContent = useCallback((idx: number, content: string) => {
    const url = fetchUrls[idx];
    if (!url) return;
    
    if (!fetchResultsRef.current.some(r => r.url === url)) {
      fetchResultsRef.current.push({ url, content });
      completedCountRef.current += 1;
    }
    
    if (completedCountRef.current >= fetchUrls.length && fetchUrls.length > 0) {
      finishFetch();
    }
  }, [fetchUrls, finishFetch]);

  return (
    <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} pointerEvents="none">
      {/* Search Engine WebView */}
      {queryUrl !== 'about:blank' && (
        <WebView
          ref={ddgRef}
          source={{ uri: queryUrl }}
          injectedJavaScript={EXTRACT_RESULTS_JS}
          onMessage={handleDdgMessage}
          onError={() => {
            SearchBridge.rejectSearch(new Error('Failed to load search engine'));
            setQueryUrl('about:blank');
          }}
          onHttpError={() => {
            SearchBridge.rejectSearch(new Error('Failed to load search engine'));
            setQueryUrl('about:blank');
          }}
          javaScriptEnabled
          domStorageEnabled={false}
          thirdPartyCookiesEnabled={false}
          incognito
          cacheEnabled={false}
        />
      )}

      {/* Parallel Fetch WebViews */}
      {fetchUrls.map((url, idx) => (
        <WebView
          key={`fetch-${idx}-${url}`}
          ref={(el) => { pageRefs.current[idx] = el; }}
          source={{ uri: url }}
          userAgent={GOOGLEBOT_UA}
          injectedJavaScript={EXTRACT_CONTENT_JS}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'page_content') {
                handlePageContent(idx, data.content);
              }
            } catch {}
          }}
          onError={() => handlePageContent(idx, 'Failed to load page.')}
          onHttpError={() => handlePageContent(idx, 'Failed to load page.')}
          javaScriptEnabled
          domStorageEnabled={false}
          thirdPartyCookiesEnabled={false}
          incognito
          cacheEnabled={false}
        />
      ))}
    </View>
  );
}
