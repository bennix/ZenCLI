// ============================================================
// zen-cli  —  Stream Renderer
// ============================================================
// Handles real-time rendering of streamed content and tool execution feedback.

import chalk from 'chalk';
import type { ToolResult } from '../types.js';

export class Renderer {
  private isStreaming = false;

  /** Print the welcome banner */
  printBanner(model: string, baseUrl: string): void {
    console.log('');
    console.log(chalk.cyan.bold('  zen-cli') + chalk.gray(` v0.1.0`));
    console.log(chalk.gray(`  Model: ${model}`));
    console.log(chalk.gray(`  API:   ${baseUrl}`));
    console.log(chalk.gray(`  Type your message, or /help for commands.`));
    console.log(chalk.gray(`  ─────────────────────────────────────────`));
    console.log('');
  }

  /** Start streaming content */
  startStream(): void {
    this.isStreaming = true;
    process.stdout.write(chalk.green('  '));
  }

  /** Write a content delta (real-time streaming) */
  writeContentDelta(text: string): void {
    // Handle newlines for proper indentation
    const formatted = text.replace(/\n/g, '\n  ');
    process.stdout.write(formatted);
  }

  /** End streaming content */
  endStream(): void {
    if (this.isStreaming) {
      process.stdout.write('\n\n');
      this.isStreaming = false;
    }
  }

  /** Render a tool call start */
  renderToolStart(name: string, args: Record<string, unknown>): void {
    this.endStream();
    const argsPreview = formatToolArgs(name, args);
    console.log(chalk.yellow(`  ● ${name}`) + chalk.gray(`(${argsPreview})`));
  }

  /** Render a tool call result */
  renderToolEnd(name: string, result: ToolResult): void {
    if (result.success) {
      // Show abbreviated output
      const preview = abbreviate(result.output, 3);
      if (preview) {
        const lines = preview.split('\n');
        for (const line of lines) {
          console.log(chalk.gray(`    ${line}`));
        }
      }
      console.log(chalk.green(`    ✓ ${name} succeeded`));
    } else {
      const preview = abbreviate(result.output, 5);
      const lines = preview.split('\n');
      for (const line of lines) {
        console.log(chalk.red(`    ${line}`));
      }
      console.log(chalk.red(`    ✗ ${name} failed`));
    }
    console.log('');
  }

  /** Render usage info */
  renderUsage(promptTokens: number, completionTokens: number): void {
    const total = promptTokens + completionTokens;
    console.log(
      chalk.gray(`  tokens: ${total} (prompt: ${promptTokens}, completion: ${completionTokens})`),
    );
  }

  /** Render an error */
  renderError(error: string): void {
    this.endStream();
    console.log(chalk.red(`\n  Error: ${error}\n`));
  }

  /** Print a system message */
  printSystem(message: string): void {
    console.log(chalk.gray(`  ${message}`));
  }
}

/** Format tool arguments for display */
function formatToolArgs(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'read_file':
      return String(args.path || '');
    case 'write_file':
      return String(args.path || '');
    case 'edit_file':
      return String(args.path || '');
    case 'bash':
      return truncateStr(String(args.command || ''), 80);
    case 'grep':
      return `/${args.pattern || ''}/${args.path ? ' in ' + args.path : ''}`;
    case 'glob':
      return String(args.pattern || '');
    default: {
      const json = JSON.stringify(args);
      return truncateStr(json, 80);
    }
  }
}

/** Abbreviate multi-line output to N lines */
function abbreviate(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  const shown = lines.slice(0, maxLines);
  return shown.join('\n') + `\n... (${lines.length - maxLines} more lines)`;
}

/** Truncate a string to max length */
function truncateStr(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.substring(0, max - 3) + '...';
}
