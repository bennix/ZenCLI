import type { ToolResult } from '../types.js';

const DEFAULT_MAX_RESULTS = 5;

export async function webSearch(args: Record<string, unknown>, maxResults: number = DEFAULT_MAX_RESULTS): Promise<ToolResult> {
  const query = String(args.query || '').trim();
  const requestedMax = typeof args.max_results === 'number' ? args.max_results : undefined;
  const limit = Math.max(1, Math.min(requestedMax || maxResults, 10));

  if (!query) {
    return { success: false, output: 'Error: "query" parameter is required.' };
  }

  try {
    const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 zen-cli' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, output: `Search failed: ${response.status} ${response.statusText}` };
    }

    const xml = await response.text();
    const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))
      .slice(0, limit)
      .map(match => match[1]);

    if (items.length === 0) {
      return { success: true, output: `No search results found for "${query}".` };
    }

    const lines = items.map((item, index) => {
      const title = decodeXml(getTag(item, 'title'));
      const link = decodeXml(getTag(item, 'link'));
      const description = collapseWhitespace(decodeXml(getTag(item, 'description'))).slice(0, 240);
      return [
        `${index + 1}. ${title || '(untitled)'}`,
        link,
        description,
      ].filter(Boolean).join('\n');
    });

    return {
      success: true,
      output: `Search results for "${query}":\n\n${lines.join('\n\n')}`,
    };
  } catch (error) {
    return {
      success: false,
      output: `Search failed: ${(error as Error).message}`,
    };
  }
}

function getTag(input: string, tag: string): string {
  const match = input.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1] : '';
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&');
}
