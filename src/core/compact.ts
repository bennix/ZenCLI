// ============================================================
// zen-cli  —  Context Compaction
// ============================================================
// When message history approaches the context window limit (85%),
// trigger a summarization call and replace history with the summary.

import type { ChatMessage, ZenCliConfig } from '../types.js';
import { chatCompletion } from './sse-client.js';
import { MessageContext } from './context.js';
import { getActiveProvider } from '../config.js';

const COMPACT_THRESHOLD = 0.85;

const SUMMARIZE_PROMPT = `\
Please provide a concise summary of our conversation so far. Include:
1. The user's original request/goal
2. Key decisions made and actions taken
3. Current state of the work (what's done, what's pending)
4. Any important file paths, code snippets, or error messages that were discussed

Be thorough but concise. This summary will replace the conversation history to free up context space.`;

/** Check if compaction is needed based on estimated token count */
export function needsCompact(context: MessageContext, config: ZenCliConfig): boolean {
  const estimated = context.estimateTokens();
  const threshold = config.contextWindow * COMPACT_THRESHOLD;
  return estimated > threshold;
}

/** Compact the conversation by summarizing it via an API call */
export async function compactContext(
  context: MessageContext,
  config: ZenCliConfig,
  signal?: AbortSignal,
): Promise<void> {
  const messages = context.getMessages();

  // Build summarization request (convert multi-modal content to text for summarization)
  const summarizeMessages: ChatMessage[] = messages.map(msg => {
    if (Array.isArray(msg.content)) {
      const textContent = msg.content
        .map(item => {
          if (item.type === 'text') return item.text;
          if (item.type === 'image_url') return '[Image]';
          return '';
        })
        .join(' ');
      return { ...msg, content: textContent || '[empty]' };
    }
    return { ...msg, content: msg.content || '[empty]' };
  });

  summarizeMessages.push({ role: 'user', content: SUMMARIZE_PROMPT });

  try {
    const provider = getActiveProvider(config);
    const result = await chatCompletion(
      {
        model: provider.model,
        messages: summarizeMessages,
        max_tokens: 4096,
        temperature: 0,
      },
      {
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        signal,
      },
    );

    // Replace messages with compact summary
    const compactedMessages: ChatMessage[] = [
      {
        role: 'user',
        content: `[Previous conversation summary]\n\n${result.content}`,
      },
      {
        role: 'assistant',
        content: 'Understood. I have the context from our previous conversation. How can I continue helping you?',
      },
    ];

    context.replace(compactedMessages);
  } catch (err) {
    // If summarization fails, do a simple truncation — keep the last N messages
    const keepCount = Math.min(10, messages.length);
    const kept = messages.slice(-keepCount);
    context.replace(kept);
  }
}
