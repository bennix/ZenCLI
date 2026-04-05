// ============================================================
// zen-cli  —  Message Context Management
// ============================================================
// Maintains the conversation message history for the agent loop.

import type { ChatMessage } from '../types.js';

export class MessageContext {
  private messages: ChatMessage[] = [];

  /** Add a message to the history */
  push(message: ChatMessage): void {
    this.messages.push(message);
  }

  /** Get all messages */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /** Replace all messages (used after compaction) */
  replace(messages: ChatMessage[]): void {
    this.messages = [...messages];
  }

  /** Get the last message */
  last(): ChatMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  /** Get the number of messages */
  get length(): number {
    return this.messages.length;
  }

  /**
   * Estimate token count.
   * Rough heuristic: total characters / 4 (works reasonably for mixed English/Chinese/code).
   */
  estimateTokens(): number {
    let totalChars = 0;
    for (const msg of this.messages) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        // Multi-modal content
        for (const item of msg.content) {
          if (item.type === 'text') {
            totalChars += item.text.length;
          } else if (item.type === 'image_url') {
            // Estimate ~100 tokens per image (base64 is large, but API handles it differently)
            totalChars += 400;
          }
        }
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          totalChars += tc.function.name.length;
          totalChars += tc.function.arguments.length;
        }
      }
    }
    return Math.ceil(totalChars / 4);
  }

  /** Clear all messages */
  clear(): void {
    this.messages = [];
  }
}
