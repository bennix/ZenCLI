// ============================================================
// zen-cli  —  Terminal Input Handler
// ============================================================
// Uses readline with terminal:false to avoid interfering with
// Windows IME (Input Method Editor) for CJK character input.
// The OS terminal handles line editing natively; we just read
// complete lines from stdin.

import readline from 'node:readline';
import chalk from 'chalk';

export interface TerminalOptions {
  onMessage: (message: string) => Promise<void>;
  onCommand: (command: string, args: string) => Promise<boolean>;
  onExit: () => void;
}

export class Terminal {
  private rl: readline.Interface;
  private options: TerminalOptions;
  private busy = false;
  private pendingLines: string[] = [];

  constructor(options: TerminalOptions) {
    this.options = options;

    // Ensure UTF-8 encoding
    if (typeof process.stdin.setEncoding === 'function') {
      process.stdin.setEncoding('utf-8');
    }

    // IMPORTANT: terminal: false
    // This prevents readline from intercepting raw keystrokes,
    // which breaks IME composition on Windows.
    // Trade-off: we lose readline features (history, arrow keys),
    // but the OS console handles basic line editing natively.
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
  }

  /** Start the interactive loop */
  start(): void {
    // Listen for lines from stdin
    this.rl.on('line', (line: string) => {
      if (this.busy) {
        // Queue input received while processing
        this.pendingLines.push(line);
        return;
      }
      this.handleInput(line);
    });

    this.rl.on('close', () => {
      this.shutdown();
    });

    // Show initial prompt
    this.showPrompt();
  }

  /** Display the prompt character */
  private showPrompt(): void {
    process.stdout.write(chalk.blue('> '));
  }

  /** Handle a line of input */
  private async handleInput(line: string): Promise<void> {
    const trimmed = line.trim();

    if (!trimmed) {
      this.showPrompt();
      return;
    }

    // Handle slash commands
    if (trimmed.startsWith('/')) {
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      if (cmd === '/quit' || cmd === '/exit' || cmd === '/q') {
        this.shutdown();
        return;
      }

      this.busy = true;
      try {
        const handled = await this.options.onCommand(cmd, args);
        if (!handled) {
          console.log(chalk.yellow(`  Unknown command: ${cmd}. Type /help for available commands.`));
        }
      } catch (err) {
        console.log(chalk.red(`  Command error: ${(err as Error).message}`));
      }
      this.busy = false;
      this.drainPending();
      return;
    }

    // Regular message
    this.busy = true;
    try {
      await this.options.onMessage(trimmed);
    } catch (err) {
      console.log(chalk.red(`  Error: ${(err as Error).message}`));
    }
    this.busy = false;
    this.drainPending();
  }

  /** Process any lines that arrived while busy, or show prompt */
  private drainPending(): void {
    if (this.pendingLines.length > 0) {
      const next = this.pendingLines.shift()!;
      this.handleInput(next);
    } else {
      this.showPrompt();
    }
  }

  /** Clean shutdown */
  private shutdown(): void {
    console.log(chalk.gray('\n  Goodbye!\n'));
    this.options.onExit();
    process.exit(0);
  }
}
