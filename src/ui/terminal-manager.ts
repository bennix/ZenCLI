import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Writable } from 'node:stream';
import { promisify } from 'node:util';
import { getShellContext } from '../core/shell-environment.js';

const execFileAsync = promisify(execFile);

const PYTHON_LOCAL_ENV_DIRS = ['.venv', 'venv', 'env', '.env'];
const PTY_BRIDGE_SOURCE = `
import os
import pty
import select
import fcntl
import json
import signal
import struct
import termios
import sys

shell = sys.argv[1]
cwd = sys.argv[2]
shell_args = sys.argv[3:]

if cwd:
    os.chdir(cwd)

pid, fd = pty.fork()
if pid == 0:
    os.execvpe(shell, [shell] + shell_args, os.environ.copy())

stdin_fd = sys.stdin.fileno()
stdout_fd = sys.stdout.fileno()
control_fd = 3
control_buffer = b''

try:
    while True:
        readable, _, _ = select.select([fd, stdin_fd, control_fd], [], [])
        if fd in readable:
            try:
                data = os.read(fd, 4096)
            except OSError:
                break
            if not data:
                break
            os.write(stdout_fd, data)
        if stdin_fd in readable:
            data = os.read(stdin_fd, 4096)
            if not data:
                break
            os.write(fd, data)
        if control_fd in readable:
            message = os.read(control_fd, 4096)
            if not message:
                continue
            control_buffer += message
            while b'\\n' in control_buffer:
                line, control_buffer = control_buffer.split(b'\\n', 1)
                if not line:
                    continue
                try:
                    payload = json.loads(line.decode('utf-8'))
                    if payload.get('type') == 'resize':
                        rows = max(2, int(payload.get('rows', 24)))
                        cols = max(20, int(payload.get('cols', 80)))
                        winsize = struct.pack('HHHH', rows, cols, 0, 0)
                        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
                        os.kill(pid, signal.SIGWINCH)
                except Exception:
                    continue
finally:
    try:
        os.close(fd)
    except OSError:
        pass

_, status = os.waitpid(pid, 0)
if os.WIFEXITED(status):
    sys.exit(os.WEXITSTATUS(status))
if os.WIFSIGNALED(status):
    os.kill(os.getpid(), os.WTERMSIG(status))
sys.exit(0)
`.trim();

export interface TerminalSessionSummary {
  id: string;
  name: string;
  cwd: string;
  kind: 'shell' | 'python';
  running: boolean;
  createdAt: number;
  command: string | null;
  exitCode: number | null;
  exitSignal: string | null;
}

export interface PythonInterpreterInfo {
  path: string;
  version: string;
  source: string;
}

interface TerminalSession {
  summary: TerminalSessionSummary;
  process: ChildProcess;
  controlStream: Writable | null;
}

interface CreateTerminalSessionOptions {
  cwd: string;
  name: string;
  kind: TerminalSessionSummary['kind'];
  command?: string | null;
}

interface TerminalManagerOptions {
  getWorkingDir: () => string;
  onOutput: (sessionId: string, chunk: string) => void;
  onExit: (sessionId: string, exitCode: number | null, signal: string | null) => void;
}

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly options: TerminalManagerOptions;

  constructor(options: TerminalManagerOptions) {
    this.options = options;
  }

  listSessions(): TerminalSessionSummary[] {
    return [...this.sessions.values()]
      .map(session => ({ ...session.summary }))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async createShellSession(cwd?: string, name = 'Shell'): Promise<TerminalSessionSummary> {
    const resolvedCwd = await this.ensureDirectory(cwd || this.options.getWorkingDir());
    return this.createSession({
      cwd: resolvedCwd,
      name,
      kind: 'shell',
      command: null,
    });
  }

  async createPythonSession(filePath: string): Promise<{
    session: TerminalSessionSummary;
    interpreter: PythonInterpreterInfo;
  }> {
    const interpreter = await this.detectPythonInterpreter(filePath);
    const resolvedPath = path.resolve(this.options.getWorkingDir(), filePath);
    const command = `${shellQuote(interpreter.path)} ${shellQuote(resolvedPath)}`;

    const session = await this.createSession({
      cwd: path.dirname(resolvedPath),
      name: `${path.basename(filePath)} • Python`,
      kind: 'python',
      command,
    });

    return { session, interpreter };
  }

  async detectPythonInterpreter(filePath?: string): Promise<PythonInterpreterInfo> {
    const workingDir = this.options.getWorkingDir();
    const resolvedFile = filePath ? path.resolve(workingDir, filePath) : '';
    const roots = buildSearchRoots(workingDir, resolvedFile ? path.dirname(resolvedFile) : workingDir);
    const candidates: Array<{ command: string; source: string }> = [];
    const seen = new Set<string>();

    if (process.env.VIRTUAL_ENV) {
      const virtualEnvPython = path.join(process.env.VIRTUAL_ENV, 'bin', 'python');
      candidates.push({ command: virtualEnvPython, source: 'VIRTUAL_ENV' });
    }

    for (const root of roots) {
      for (const envDir of PYTHON_LOCAL_ENV_DIRS) {
        candidates.push({
          command: path.join(root, envDir, 'bin', 'python'),
          source: `${path.relative(workingDir, root) || '.'}/${envDir}`,
        });
      }
    }

    if (process.platform === 'darwin') {
      candidates.push({ command: '/opt/homebrew/bin/python3', source: 'Homebrew' });
      candidates.push({ command: '/usr/local/bin/python3', source: 'Homebrew' });
      candidates.push({ command: '/usr/bin/python3', source: 'System Python 3' });
    }

    candidates.push({ command: 'python3', source: 'PATH:python3' });
    candidates.push({ command: 'python', source: 'PATH:python' });

    for (const candidate of candidates) {
      const normalized = candidate.command;
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      const info = await probePythonCommand(candidate.command, candidate.source);
      if (info) return info;
    }

    throw new Error('No usable Python interpreter found. Install Python 3 or create a local virtual environment.');
  }

  writeToSession(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.summary.running || !session.process.stdin) return false;
    session.process.stdin.write(data);
    return true;
  }

  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.summary.running || !session.controlStream) return false;
    session.controlStream.write(JSON.stringify({
      type: 'resize',
      cols: Math.max(20, Math.floor(cols || 80)),
      rows: Math.max(2, Math.floor(rows || 24)),
    }) + '\n');
    return true;
  }

  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (session.summary.running) {
      session.process.kill('SIGTERM');
    } else {
      this.sessions.delete(sessionId);
    }
    return true;
  }

  closeAllSessions(): void {
    for (const session of this.sessions.values()) {
      if (session.summary.running) {
        session.process.kill('SIGTERM');
      }
    }
  }

  private async createSession(options: CreateTerminalSessionOptions): Promise<TerminalSessionSummary> {
    const id = createSessionId();
    const child = await spawnTerminalProcess(options.cwd);
    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new Error('Failed to create terminal stdio pipes');
    }
    const controlCandidate = child.stdio[3];
    const controlStream = controlCandidate && 'write' in controlCandidate
      ? controlCandidate as Writable
      : null;
    const summary: TerminalSessionSummary = {
      id,
      name: options.name,
      cwd: options.cwd,
      kind: options.kind,
      running: true,
      createdAt: Date.now(),
      command: options.command || null,
      exitCode: null,
      exitSignal: null,
    };

    const session: TerminalSession = {
      summary,
      process: child,
      controlStream,
    };
    this.sessions.set(id, session);

    child.stdout.on('data', (chunk: Buffer | string) => {
      this.options.onOutput(id, chunk.toString());
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      this.options.onOutput(id, chunk.toString());
    });
    child.on('close', (code, signal) => {
      summary.running = false;
      summary.exitCode = code;
      summary.exitSignal = signal;
      this.options.onExit(id, code, signal);
    });
    child.on('error', (error) => {
      this.options.onOutput(id, `\r\n[terminal error] ${error.message}\r\n`);
    });

    if (controlStream) {
      setTimeout(() => {
        if (summary.running) {
          this.resizeSession(id, 120, 32);
        }
      }, 40);
    }

    if (options.command) {
      setTimeout(() => {
        if (summary.running && child.stdin) {
          child.stdin.write(options.command + '\n');
        }
      }, 120);
    }

    return { ...summary };
  }

  private async ensureDirectory(targetPath: string): Promise<string> {
    const resolved = path.resolve(targetPath);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`${resolved} is not a directory`);
    }
    return resolved;
  }
}

function buildSearchRoots(workingDir: string, fileDir: string): string[] {
  const roots: string[] = [];
  let current = fileDir;

  while (current.startsWith(workingDir)) {
    roots.push(current);
    if (current === workingDir) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (!roots.includes(workingDir)) {
    roots.push(workingDir);
  }

  return roots;
}

async function probePythonCommand(command: string, source: string): Promise<PythonInterpreterInfo | null> {
  if (path.isAbsolute(command)) {
    if (!fsSync.existsSync(command)) return null;
    try {
      await fs.access(command, fsSync.constants.X_OK);
    } catch {
      return null;
    }
  }

  try {
    const { env } = await getShellContext().catch(() => ({ env: { ...process.env } }));
    const { stdout } = await execFileAsync(
      command,
      ['-c', 'import sys; print(sys.executable); print(sys.version.split()[0])'],
      {
        timeout: 5_000,
        env: {
          ...env,
          PYTHONIOENCODING: 'utf-8',
        },
      },
    );
    const [resolvedPath, version] = String(stdout).trim().split(/\r?\n/);
    if (!resolvedPath || !version) return null;
    return {
      path: resolvedPath,
      version,
      source,
    };
  } catch {
    return null;
  }
}

async function spawnTerminalProcess(cwd: string): Promise<ChildProcess> {
  if (process.platform === 'win32') {
    return spawn(process.env.ComSpec || 'cmd.exe', ['/K'], {
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL || '',
        HOME: process.env.HOME || os.homedir(),
      },
      stdio: 'pipe',
    });
  }

  const { shellPath, env } = await getShellContext();
  const bridgePython = resolveBridgePython();
  return spawn(bridgePython, ['-u', '-c', PTY_BRIDGE_SOURCE, shellPath, cwd, '-il'], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  });
}

function createSessionId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function resolveBridgePython(): string {
  const candidates = [
    '/usr/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    'python3',
    'python',
  ];

  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate) || fsSync.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'python3';
}
