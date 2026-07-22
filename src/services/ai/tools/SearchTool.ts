import { ITool, ToolDefinition } from './ITool';
import { SearchBridge } from '../../search/SearchBridge';
import { Platform } from 'react-native';
import { universalFetch } from '../utils/universalFetch';

export class SearchTool implements ITool {
  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Use this to find sources. This returns a list of web pages with a short snippet of their content.You MUST use the fetch_pages tool afterwards to read the full content of the most relevant sources.',
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
    summarize?: (text: string) => Promise<string>
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
            } catch (e) {}
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

      const formatted = results.map((r, i) => {
        return `### Result ${i + 1}: ${r.title}\n**URL:** ${r.url}\n**Snippet:** ${r.snippet || 'No snippet available.'}`;
      });

      return `Search results for "${query}":\n\n${formatted.join('\n\n---\n\n')}\n\nSelect up to 2 URLs from the results above and use the fetch_pages tool to read their full contents. CRITICAL: Always prioritize well-known, highly trusted, and official sources (e.g. major news outlets, official documentation, renowned encyclopedias) over obscure blogs or unreliable sites.`;
    } catch (e: any) {
      return `Search failed: ${e.message}`;
    }
  }
}
