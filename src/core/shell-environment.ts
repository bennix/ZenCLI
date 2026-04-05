import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ENV_START_MARKER = Buffer.from('__ZEN_ENV_START__\0', 'utf8');
const ENV_END_MARKER = Buffer.from('\0__ZEN_ENV_END__\0', 'utf8');

let shellContextPromise: Promise<ShellContext> | null = null;

export interface ShellContext {
  shellPath: string;
  env: NodeJS.ProcessEnv;
}

export async function applyShellEnvironmentToProcess(): Promise<ShellContext> {
  const context = await getShellContext();
  for (const [key, value] of Object.entries(context.env)) {
    if (typeof value === 'string') {
      process.env[key] = value;
    }
  }
  process.env.SHELL = context.shellPath;
  return context;
}

export function getShellContext(): Promise<ShellContext> {
  if (!shellContextPromise) {
    shellContextPromise = resolveShellContext().catch(error => {
      shellContextPromise = null;
      throw error;
    });
  }
  return shellContextPromise;
}

async function resolveShellContext(): Promise<ShellContext> {
  if (process.platform === 'win32') {
    const shellPath = process.env.ComSpec || 'cmd.exe';
    return {
      shellPath,
      env: {
        ...process.env,
      },
    };
  }

  const shellPath = await resolveUserShellPath();
  const env = await resolveLoginShellEnvironment(shellPath);
  return {
    shellPath,
    env: {
      ...process.env,
      ...env,
      SHELL: shellPath,
      HOME: env.HOME || process.env.HOME || os.homedir(),
      LANG: env.LANG || process.env.LANG || 'en_US.UTF-8',
      LC_ALL: env.LC_ALL || process.env.LC_ALL || '',
      TERM: env.TERM || process.env.TERM || 'xterm-256color',
      COLORTERM: env.COLORTERM || process.env.COLORTERM || 'truecolor',
    },
  };
}

async function resolveUserShellPath(): Promise<string> {
  const envShell = String(process.env.SHELL || '').trim();
  if (envShell && fs.existsSync(envShell)) {
    return envShell;
  }

  const username = os.userInfo().username;

  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('dscl', ['.', '-read', `/Users/${username}`, 'UserShell'], {
        timeout: 5_000,
      });
      const match = String(stdout).match(/UserShell:\s+(.+)\s*$/m);
      const resolved = String(match?.[1] || '').trim();
      if (resolved && fs.existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // fall through
    }
    return '/bin/zsh';
  }

  try {
    const { stdout } = await execFileAsync('getent', ['passwd', username], { timeout: 5_000 });
    const fields = String(stdout).trim().split(':');
    const resolved = String(fields[fields.length - 1] || '').trim();
    if (resolved && fs.existsSync(resolved)) {
      return resolved;
    }
  } catch {
    // fall through
  }

  return '/bin/sh';
}

async function resolveLoginShellEnvironment(shellPath: string): Promise<NodeJS.ProcessEnv> {
  const command = `printf '__ZEN_ENV_START__\\0'; env -0; printf '\\0__ZEN_ENV_END__\\0'`;
  try {
    const { stdout } = await execFileAsync(shellPath, ['-lic', command], {
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'buffer',
      env: {
        ...process.env,
        TERM: process.env.TERM || 'xterm-256color',
        COLORTERM: process.env.COLORTERM || 'truecolor',
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL || '',
        HOME: process.env.HOME || os.homedir(),
      },
    });
    return parseEnvironmentBlock(stdout as Buffer);
  } catch {
    return {
      ...process.env,
    };
  }
}

function parseEnvironmentBlock(stdout: Buffer): NodeJS.ProcessEnv {
  const startIndex = stdout.indexOf(ENV_START_MARKER);
  if (startIndex === -1) {
    return { ...process.env };
  }

  const bodyStart = startIndex + ENV_START_MARKER.length;
  const endIndex = stdout.indexOf(ENV_END_MARKER, bodyStart);
  if (endIndex === -1) {
    return { ...process.env };
  }

  const envBlock = stdout.subarray(bodyStart, endIndex).toString('utf8');
  const result: NodeJS.ProcessEnv = {};

  for (const entry of envBlock.split('\0')) {
    if (!entry) continue;
    const equalsIndex = entry.indexOf('=');
    if (equalsIndex <= 0) continue;
    const key = entry.slice(0, equalsIndex);
    const value = entry.slice(equalsIndex + 1);
    result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : { ...process.env };
}
