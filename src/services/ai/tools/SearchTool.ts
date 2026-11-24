import { ITool, ToolContext, ToolDefinition, ToolPlatform } from './ITool';
import { SearchBridge } from '../../search/SearchBridge';

export class SearchTool implements ITool {
  displayName = 'Web Search';
  displayDescription = 'Allow the assistant to search the web for real-time information.';
  enabledByDefault = true;
  //web excluded because of cors
  platforms: ToolPlatform[] = ['ios', 'android', 'desktop'];
  requires = ['fetch_pages'];

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

  async execute(args: Record<string, any>, { recordSource }: ToolContext = {}): Promise<string> {
    const query = args.query;
    if (!query || typeof query !== 'string') {
      return 'Error: missing or invalid query parameter.';
    }

    try {
      const results = await SearchBridge.search(query);

      if (results.length === 0) {
        return 'No search results found.';
      }

      for (const r of results) {
        if (r.url && r.title) recordSource?.({ url: r.url, title: r.title });
      }

      const formatted = results.map((r, i) => {
        return `### Result ${i + 1}: ${r.title}\n**URL:** ${r.url}\n**Snippet:** ${r.snippet || 'No snippet available.'}`;
      });

      return `Search results for "${query}":\n\n${formatted.join('\n\n---\n\n')}\n\nNow call fetch_pages on up to 2 of the most relevant URLs above to read their full contents. Add a focus when you only need specific details from the page. Prioritize official and trusted sources.`;
    } catch (e: any) {
      console.error('[SearchTool] error:', e?.message || e);
      throw new Error(`search failed: ${e?.message || e}`);
    }
  }
}
