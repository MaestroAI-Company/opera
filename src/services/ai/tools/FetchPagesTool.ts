import { ITool, ToolContext, ToolDefinition, ToolPlatform } from './ITool';
import { SearchBridge, PageImage } from '../../search/SearchBridge';
import { Platform } from 'react-native';
import { universalFetch } from '../utils/universalFetch';
import { isTauri } from '../../platform';
import { SYSTEM_PROMPTS } from '../../../../constants/prompts';

const MAX_CONTENT_LENGTH = 4000;
const SUMMARIZE_THRESHOLD = 8000;
const MAX_FOCUS_LENGTH = 800;

//escape brackets for markdown image
function imageMarkdown(img: PageImage): string {
  const alt = (img.alt || 'image').replace(/[[\]]/g, '');
  const url = img.src.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `- ![${alt}](${url})`;
}

export class FetchPagesTool implements ITool {
  displayName = 'Fetch Pages';
  displayDescription = 'Allow the assistant to read the full content of web pages from search results.';
  enabledByDefault = true;
  //web excluded because of cors
  platforms: ToolPlatform[] = ['ios', 'android', 'desktop'];

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'fetch_pages',
      description: 'Fetch the full content of up to 2 web pages. Use after web_search to read the sources you selected. Pass focus when you only need specific details, otherwise you get a general summary of the page.',
      parameters: {
        type: 'object',
        properties: {
          urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'An array of URLs to fetch. Maximum 2 URLs.',
          },
          focus: {
            type: 'string',
            description: 'What to extract from the pages, e.g. "price and release date" or "the benchmark chart values". Omit to get a general summary.',
          },
        },
        required: ['urls'],
      },
    },
  };

  async execute(args: Record<string, any>, { summarize, recordSource }: ToolContext = {}): Promise<string> {
    const urls = args.urls;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return 'Error: missing or invalid urls parameter.';
    }

    //focus keeps the summary on point
    const focus = typeof args.focus === 'string' ? args.focus.trim().slice(0, MAX_FOCUS_LENGTH) : '';

    const targetUrls = urls.slice(0, 2); //max 2 urls

    try {
      let results: any[] = [];

      //web hidden because of cors
      if (Platform.OS === 'web' && !isTauri) {
        const fetchPromises = targetUrls.map(async (url) => {
          try {
            const res = await universalFetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
              }
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const html = await res.text();
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const removeTags = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript', 'svg', 'form', 'button', 'menu'];
            removeTags.forEach(tag => {
              const els = doc.querySelectorAll(tag);
              els.forEach(el => el.remove());
            });
            
            const main = doc.querySelector('main, article, [role="main"], .content, #content, .post, .article') || doc.body;
            let text = main.textContent || '';
            text = text.replace(/\s+/g, ' ').trim();

            //guessed favicon urls usually 404
            const iconLink = doc.querySelector('link[rel~="icon"]');
            const favicon = iconLink ? new URL(iconLink.getAttribute('href') || '', url).href : undefined;

            return { url, content: text, title: doc.title, favicon };
          } catch (e: any) {
            console.error('[FetchPagesTool] page fetch error:', e?.message || e);
            return { url, content: `Failed to fetch: ${e.message}` };
          }
        });
        
        results = await Promise.all(fetchPromises);
      } else {
        results = await SearchBridge.fetchPages(targetUrls);
      }

      //both platforms prefix failures this way
      if (results.every(r => r.content?.startsWith('Failed to'))) {
        throw new Error(results.map(r => `${r.url}: ${r.content}`).join('; ') || 'no page content could be extracted');
      }

      for (const r of results) {
        if (r.url && (r.title || r.favicon)) {
          recordSource?.({ url: r.url, title: r.title, favicon: r.favicon });
        }
      }

      //summarize when long or focused
      const prompt = focus ? `${SYSTEM_PROMPTS.SEARCH_EXTRACT}\n\n# Focus\n\n${focus}` : undefined;
      const formatted = await Promise.all(
        results.map(async (r) => {
          let content = r.content || 'No content extracted.';

          //never summarize an error string
          const failed = content.startsWith('Failed to');

          if (!failed && summarize && (focus || content.length > SUMMARIZE_THRESHOLD)) {
            try {
              content = await summarize(content, prompt);
            } catch {
              content = content.substring(0, MAX_CONTENT_LENGTH) + '...';
            }
          } else if (content.length > MAX_CONTENT_LENGTH) {
            content = content.substring(0, MAX_CONTENT_LENGTH) + '...';
          }

          const images = r.images ?? [];
          const imageBlock = images.length
            ? `\n\nImages on this page (copy a line as is to show it):\n${images.map(imageMarkdown).join('\n')}`
            : '';

          return `### Page Content: ${r.url}\n\n${content}${imageBlock}`;
        })
      );

      return `${focus ? `Extracted from pages (focus: "${focus}"):` : 'Fetched page contents:'}\n\n${formatted.join('\n\n---\n\n')}`;
    } catch (e: any) {
      console.error('[FetchPagesTool] error:', e?.message || e);
      throw new Error(`fetch failed: ${e?.message || e}`);
    }
  }
}
