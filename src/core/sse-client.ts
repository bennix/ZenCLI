// ============================================================
// zen-cli  —  SSE Streaming Client (OpenAI-compatible format)
// ============================================================
// Works with both ZenMux and Ollama (both expose OpenAI-compat API).
// Uses Node.js 22+ native fetch() with ReadableStream.
// Also supports NVIDIA API with special parameters.

import type {
  ChatCompletionRequest,
  ChatCompletionChunk,
  ChatMessage,
  SSEEvent,
} from '../types.js';

export interface SSEClientOptions {
  apiKey: string;   // empty string for Ollama (no auth needed)
  baseUrl: string;
  signal?: AbortSignal;
  siteUrl?: string;    // OpenRouter: site URL for rankings
  siteName?: string;   // OpenRouter: site name for rankings
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  const value = error as { name?: string; code?: string; message?: string };
  if (signal?.aborted) return true;
  return value?.name === 'AbortError'
    || value?.code === 'ABORT_ERR'
    || /aborted|abort/i.test(String(value?.message || ''));
}

/**
 * Stream a chat completion request, yielding SSEEvent objects.
 */
export async function* streamChatCompletion(
  request: ChatCompletionRequest,
  options: SSEClientOptions,
): AsyncGenerator<SSEEvent> {
  const url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const normalizedRequest = normalizeChatCompletionRequest(request);

  // Build headers — skip Authorization for Ollama (no apiKey)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }
  // OpenRouter optional headers for rankings
  if (options.siteUrl) headers['HTTP-Referer'] = options.siteUrl;
  if (options.siteName) headers['X-OpenRouter-Title'] = options.siteName;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...normalizedRequest, stream: true }),
      signal: options.signal,
    });
  } catch (err) {
    if (isAbortError(err, options.signal)) {
      throw err;
    }
    yield {
      type: 'error',
      error: `Connection failed: ${(err as Error).message}\nURL: ${url}`,
    };
    return;
  }

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch { /* ignore */ }
    yield {
      type: 'error',
      error: `API request failed: ${response.status} ${response.statusText}\n${errorBody}`,
    };
    return;
  }

  if (!response.body) {
    yield { type: 'error', error: 'Response body is null — streaming not supported' };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data:')) {
          const data = trimmed.slice(5).trim();

          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          let chunk: ChatCompletionChunk;
          try {
            chunk = JSON.parse(data) as ChatCompletionChunk;
          } catch {
            continue;
          }

          yield* processChunk(chunk);
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const data = trimmed.slice(5).trim();
        if (data !== '[DONE]') {
          try {
            const chunk = JSON.parse(data) as ChatCompletionChunk;
            yield* processChunk(chunk);
          } catch { /* ignore */ }
        }
      }
    }
    yield { type: 'done' };
  } catch (err) {
    if (isAbortError(err, options.signal)) {
      throw err;
    }
    yield {
      type: 'error',
      error: `Streaming failed: ${(err as Error).message}`,
    };
  } finally {
    reader.releaseLock();
  }
}

/** Extract SSEEvents from a single ChatCompletionChunk */
function* processChunk(chunk: ChatCompletionChunk): Generator<SSEEvent> {
  for (const choice of chunk.choices) {
    const delta = choice.delta;

    if (delta.reasoning) {
      yield { type: 'reasoning_delta', content: delta.reasoning };
    }

    if (delta.reasoning_content) {
      yield { type: 'reasoning_delta', content: delta.reasoning_content };
    }

    if (delta.content) {
      yield { type: 'content_delta', content: delta.content };
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        yield {
          type: 'tool_call_delta',
          index: tc.index,
          id: tc.id,
          name: tc.function?.name,
          arguments: tc.function?.arguments,
        };
      }
    }

    if (choice.finish_reason) {
      yield { type: 'finish', reason: choice.finish_reason };
    }
  }

  if (chunk.usage) {
    yield {
      type: 'usage',
      promptTokens: chunk.usage.prompt_tokens,
      completionTokens: chunk.usage.completion_tokens,
      totalTokens: chunk.usage.prompt_tokens + chunk.usage.completion_tokens,
    };
  }
}

/**
 * Non-streaming chat completion (used for compact/summarization).
 */
export async function chatCompletion(
  request: Omit<ChatCompletionRequest, 'stream'>,
  options: SSEClientOptions,
): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
  const url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const normalizedRequest = normalizeChatCompletionRequest({ ...request, stream: false });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(normalizedRequest),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorBody}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    } : undefined,
  };
}

function normalizeChatCompletionRequest(request: ChatCompletionRequest): ChatCompletionRequest {
  return {
    ...request,
    messages: Array.isArray(request.messages)
      ? request.messages.map(normalizeChatMessage)
      : [],
  };
}

function normalizeChatMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    content: normalizeChatMessageContent(message.content),
  };
}

function normalizeChatMessageContent(content: ChatMessage['content']): ChatMessage['content'] {
  if (content == null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content || '');
  const filtered = content
    .filter((item): item is NonNullable<typeof item> => !!item)
    .map(item => item.type === 'text'
      ? {
          type: 'text' as const,
          text: typeof item.text === 'string' ? item.text : '',
        }
      : {
          type: 'image_url' as const,
          image_url: {
            url: String(item.image_url?.url || ''),
          },
        })
    .filter(item => item.type !== 'image_url' || item.image_url.url.length > 0);
  if (filtered.length === 0) return '';
  return filtered;
}
