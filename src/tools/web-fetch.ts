import type { ToolResult } from '../types.js';

const DEFAULT_MAX_CHARS = 12_000;

export async function webFetch(args: Record<string, unknown>, maxChars: number = DEFAULT_MAX_CHARS): Promise<ToolResult> {
  const url = String(args.url || '').trim();
  const requestedMaxChars = typeof args.max_chars === 'number' ? args.max_chars : undefined;
  const limit = Math.max(1_000, Math.min(requestedMaxChars || maxChars, 50_000));

  if (!url) {
    return { success: false, output: 'Error: "url" parameter is required.' };
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 zen-cli' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      return { success: false, output: `Fetch failed: ${response.status} ${response.statusText}` };
    }

    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();
    const text = collapseWhitespace(
      contentType.includes('html')
        ? stripHtml(rawText)
        : rawText,
    );

    const clipped = text.length > limit ? `${text.slice(0, limit)}\n\n[truncated]` : text;
    return {
      success: true,
      output: [
        `URL: ${response.url}`,
        `Content-Type: ${contentType || 'unknown'}`,
        '',
        clipped || '(empty response)',
      ].join('\n'),
    };
  } catch (error) {
    return {
      success: false,
      output: `Fetch failed: ${(error as Error).message}`,
    };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|h\d|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&');
}

function collapseWhitespace(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
