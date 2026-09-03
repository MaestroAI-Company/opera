import { ITool, ToolDefinition, ToolPlatform, ToolSource } from './ITool';
import { SearchBridge } from '../../search/SearchBridge';
import { Platform } from 'react-native';
import { universalFetch } from '../utils/universalFetch';

export class SearchTool implements ITool {
  displayName = 'Web Search';
  displayDescription = 'Allow the assistant to search the web for real-time information.';
  enabledByDefault = true;
  //ios/android need the SearchWebView bridge
  platforms: ToolPlatform[] = ['ios', 'android', 'web', 'desktop'];

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Use when facts may have changed since training (news, prices, weather, versions, availability) or when you need a source. Include the city for location-dependent queries. After searching, call fetch_pages on the most relevant URLs to read their full content.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to look up on the web.',
          },
        },
        required: ['query'],
      },
    },
  };

  async execute(
    args: Record<string, any>,
    summarize?: (text: string) => Promise<string>,
    recordSource?: (source: ToolSource) => void
  ): Promise<string> {
    const query = args.query;
    if (!query || typeof query !== 'string') {
      return 'Error: missing or invalid query parameter.';
    }

    try {
      let results: any[] = [];

      if (Platform.OS === 'web') {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await universalFetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
          }
        });
        
        if (!res.ok) {
          throw new Error(`Failed to fetch search results: ${res.status}`);
        }
        
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const links = doc.querySelectorAll('.result__a');
        const snippets = doc.querySelectorAll('.result__snippet');
        
        for (let i = 0; i < links.length && results.length < 5; i++) {
          const a = links[i] as HTMLAnchorElement;
          let href = a.href;
          if (href && href.includes('duckduckgo.com/l/?')) {
            try {
              const u = new URL(href);
              const uddg = u.searchParams.get('uddg');
              if (uddg) href = uddg;
            } catch {}
          }
          if (href && href.startsWith('http') && href.indexOf('duckduckgo.com') === -1) {
            const snippetText = snippets[i] && snippets[i].textContent ? snippets[i].textContent.trim() : '';
            results.push({ title: a.textContent?.trim() || '', url: href, snippet: snippetText });
          }
        }
      } else {
        results = await SearchBridge.search(query);
      }

      if (results.length === 0) {
        return 'No search results found.';
      }

      for (const r of results) {
        if (r.url && r.title) recordSource?.({ url: r.url, title: r.title });
      }

      const formatted = results.map((r, i) => {
        return `### Result ${i + 1}: ${r.title}\n**URL:** ${r.url}\n**Snippet:** ${r.snippet || 'No snippet available.'}`;
      });

      return `Search results for "${query}":\n\n${formatted.join('\n\n---\n\n')}\n\nNow call fetch_pages on up to 2 of the most relevant URLs above to read their full contents. Prioritize official and trusted sources.`;
    } catch (e: any) {
      console.error('[SearchTool] error:', e?.message || e);
      return `Search failed: ${e.message}`;
    }
  }
}
