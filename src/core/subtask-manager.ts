import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  BackgroundSubtaskManagerHandle,
  BackgroundSubtaskOutput,
  BackgroundSubtaskSummary,
} from '../types.js';
import { getShellContext } from './shell-environment.js';

const DEFAULT_MAX_OUTPUT_CHARS = 200_000;
const DEFAULT_PREVIEW_CHARS = 220;
const STOP_GRACE_MS = 5_000;

interface ManagedSubtask {
  summary: BackgroundSubtaskSummary;
  process: ChildProcess;
  output: string;
  timeoutHandle: NodeJS.Timeout | null;
  forceKillHandle: NodeJS.Timeout | null;
}

interface SubtaskManagerOptions {
  getWorkingDir: () => string;
  getDefaultTimeoutMs: () => number;
  onTaskUpdate?: (summary: BackgroundSubtaskSummary) => void;
  onTaskOutput?: (taskId: string, chunk: string, preview: string) => void;
  maxOutputChars?: number;
}

export class SubtaskManager implements BackgroundSubtaskManagerHandle {
  private readonly tasks = new Map<string, ManagedSubtask>();
  private readonly options: SubtaskManagerOptions;
  private readonly maxOutputChars: number;

  constructor(options: SubtaskManagerOptions) {
    this.options = options;
    this.maxOutputChars = Math.max(20_000, Math.floor(options.maxOutputChars || DEFAULT_MAX_OUTPUT_CHARS));
  }

  listTasks(): BackgroundSubtaskSummary[] {
    return [...this.tasks.values()]
      .map(task => cloneSummary(task.summary))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getTask(taskId: string): BackgroundSubtaskSummary | null {
    const task = this.tasks.get(taskId);
    return task ? cloneSummary(task.summary) : null;
  }

  getTaskOutput(taskId: string, maxChars = 12_000): BackgroundSubtaskOutput | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const normalizedMaxChars = Math.max(200, Math.floor(maxChars || 12_000));
    const storedOutput = task.output || '';
    const slice = storedOutput.length > normalizedMaxChars
      ? storedOutput.slice(-normalizedMaxChars)
      : storedOutput;
    const truncated = task.summary.outputOverflowed || storedOutput.length > normalizedMaxChars;

    return {
      taskId,
      output: truncated
        ? `[showing last ${normalizedMaxChars} chars]\n${slice}`.trim()
        : slice,
      truncated,
    };
  }

  async startTask(options: {
    command: string;
    cwd?: string;
    name?: string;
    timeoutMs?: number;
  }): Promise<BackgroundSubtaskSummary> {
    const command = String(options.command || '').trim();
    if (!command) {
      throw new Error('Subtask command is required');
    }

    const cwd = await this.ensureDirectory(path.resolve(this.options.getWorkingDir(), options.cwd || '.'));
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs ?? this.options.getDefaultTimeoutMs());
    const id = createSubtaskId();
    const now = Date.now();
    const child = await spawnBackgroundShell(command, cwd);
    const summary: BackgroundSubtaskSummary = {
      id,
      name: normalizeTaskName(options.name, command),
      command,
      cwd,
      status: 'running',
      running: true,
      createdAt: now,
      startedAt: now,
      finishedAt: null,
      exitCode: null,
      exitSignal: null,
      timedOut: false,
      timeoutMs,
      lastOutputAt: null,
      outputPreview: '',
      outputOverflowed: false,
    };

    const record: ManagedSubtask = {
      summary,
      process: child,
      output: '',
      timeoutHandle: null,
      forceKillHandle: null,
    };

    this.tasks.set(id, record);
    this.emitTaskUpdate(summary);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      this.appendOutput(record, chunk.toString());
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      this.appendOutput(record, chunk.toString());
    });
    child.on('error', (error) => {
      this.appendOutput(record, `\n[subtask error] ${error.message}\n`);
    });
    child.on('close', (code, signal) => {
      this.finalizeTask(record, code, signal);
    });

    if (timeoutMs > 0) {
      record.timeoutHandle = setTimeout(() => {
        this.appendOutput(record, `\n[subtask timed out after ${Math.round(timeoutMs / 1000)}s]\n`);
        this.stopRecord(record, true);
      }, timeoutMs);
    }

    return cloneSummary(summary);
  }

  stopTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    return this.stopRecord(task, false);
  }

  closeAllTasks(): void {
    for (const task of this.tasks.values()) {
      this.stopRecord(task, false);
    }
  }

  private async ensureDirectory(targetPath: string): Promise<string> {
    const resolved = path.resolve(targetPath);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`${resolved} is not a directory`);
    }
    return resolved;
  }

  private appendOutput(task: ManagedSubtask, chunk: string): void {
    if (!chunk) return;

    const nextOutput = task.output + chunk;
    if (nextOutput.length > this.maxOutputChars) {
      task.output = nextOutput.slice(-this.maxOutputChars);
      task.summary.outputOverflowed = true;
    } else {
      task.output = nextOutput;
    }

    task.summary.lastOutputAt = Date.now();
    task.summary.outputPreview = buildOutputPreview(task.output, task.summary.outputOverflowed);
    this.options.onTaskOutput?.(task.summary.id, chunk, task.summary.outputPreview);
  }

  private stopRecord(task: ManagedSubtask, timedOut: boolean): boolean {
    if (!task.summary.running) return false;

    if (timedOut) {
      task.summary.timedOut = true;
    }

    if (task.summary.status !== 'stopping') {
      task.summary.status = 'stopping';
      this.emitTaskUpdate(task.summary);
    }

    try {
      task.process.kill('SIGTERM');
    } catch {
      // The process may have already exited; the close handler will finalize state.
    }

    if (!task.forceKillHandle) {
      task.forceKillHandle = setTimeout(() => {
        if (!task.summary.running) return;
        try {
          task.process.kill('SIGKILL');
        } catch {
          // Ignore follow-up kill errors.
        }
      }, STOP_GRACE_MS);
    }

    return true;
  }

  private finalizeTask(task: ManagedSubtask, code: number | null, signal: string | null): void {
    if (task.timeoutHandle) {
      clearTimeout(task.timeoutHandle);
      task.timeoutHandle = null;
    }
    if (task.forceKillHandle) {
      clearTimeout(task.forceKillHandle);
      task.forceKillHandle = null;
    }

    task.summary.running = false;
    task.summary.finishedAt = Date.now();
    task.summary.exitCode = code;
    task.summary.exitSignal = signal;
    task.summary.status = task.summary.timedOut ? 'timed_out' : 'exited';
    this.emitTaskUpdate(task.summary);
  }

  private emitTaskUpdate(summary: BackgroundSubtaskSummary): void {
    this.options.onTaskUpdate?.(cloneSummary(summary));
  }
}

async function spawnBackgroundShell(command: string, cwd: string): Promise<ChildProcess> {
  if (process.platform === 'win32') {
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
      cwd,
      env: {
        ...process.env,
        TERM: process.env.TERM || 'xterm-256color',
        COLORTERM: process.env.COLORTERM || 'truecolor',
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL || '',
        HOME: process.env.HOME || os.homedir(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  const { shellPath, env } = await getShellContext();
  return spawn(shellPath, ['-lc', command], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function createSubtaskId(): string {
  return `task_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normalizeTaskName(name: string | undefined, command: string): string {
  const explicit = String(name || '').trim();
  if (explicit) return explicit.slice(0, 80);
  return command.length > 80 ? `${command.slice(0, 77)}...` : command;
}

function normalizeTimeoutMs(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(1_000, Math.floor(value));
}

function buildOutputPreview(output: string, overflowed: boolean): string {
  const normalized = String(output || '').replace(/\r/g, '').trim();
  if (!normalized) return '';
  const preview = normalized.length > DEFAULT_PREVIEW_CHARS
    ? normalized.slice(-DEFAULT_PREVIEW_CHARS)
    : normalized;
  return overflowed && normalized.length > preview.length ? `...${preview}` : preview;
}

function cloneSummary(summary: BackgroundSubtaskSummary): BackgroundSubtaskSummary {
  return { ...summary };
}
