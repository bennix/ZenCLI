import path from 'node:path';
import type { PermissionMode, PermissionPathRule, PermissionSettings } from '../types.js';

const DEFAULT_SAFE_SHELL_PREFIXES = [
  'pwd',
  'ls',
  'dir',
  'tree',
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'which',
  'where',
  'rg',
  'grep',
  'find',
  'git status',
  'git diff',
  'git show',
  'git log',
  'git branch',
  'git rev-parse',
  'git remote',
  'npm test',
  'npm run test',
  'npm run lint',
  'npm run build',
  'pnpm test',
  'pnpm run test',
  'pnpm run lint',
  'pnpm run build',
  'yarn test',
  'yarn lint',
  'yarn build',
  'pytest',
  'python -m pytest',
  'python3 -m pytest',
  'tsc',
  'cargo test',
  'cargo check',
  'go test',
  'go vet',
  'dotnet test',
  'uv run pytest',
  'uvx pytest',
];

const MUTATING_SHELL_PATTERNS = [
  /\brm\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\btouch\b/i,
  /\bmkdir\b/i,
  /\brmdir\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\binstall\b/i,
  /\bpatch\b/i,
  /\bgit\s+(commit|push|checkout|switch|reset|clean|merge|rebase|apply|am|stash|tag|branch\s+-d)\b/i,
  /\bnpm\s+(install|add|remove|uninstall|publish|version)\b/i,
  /\bpnpm\s+(install|add|remove|up|update|publish)\b/i,
  /\byarn\s+(install|add|remove|upgrade|up|publish)\b/i,
  /\bpip(?:3)?\s+install\b/i,
  /\buv\s+sync\b/i,
  /(^|[;&|])\s*>/,
];

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
}

export function createDefaultPermissionSettings(): PermissionSettings {
  return {
    mode: 'default',
    pathRules: [],
    deniedCommands: [
      'rm -rf /',
      'git push --force*',
      'git reset --hard*',
    ],
    allowedTools: [],
    deniedTools: [],
  };
}

export function normalizePermissionSettings(value: Partial<PermissionSettings> | undefined): PermissionSettings {
  const defaults = createDefaultPermissionSettings();
  return {
    mode: isPermissionMode(value?.mode) ? value.mode : defaults.mode,
    pathRules: Array.isArray(value?.pathRules)
      ? value.pathRules
        .filter((rule): rule is PermissionPathRule => !!rule && typeof rule.pattern === 'string' && rule.pattern.trim().length > 0)
        .map(rule => ({ pattern: rule.pattern.trim(), allow: rule.allow !== false }))
      : defaults.pathRules,
    deniedCommands: normalizeStringList(value?.deniedCommands),
    allowedTools: normalizeStringList(value?.allowedTools),
    deniedTools: normalizeStringList(value?.deniedTools),
  };
}

export function evaluatePermission(
  settings: PermissionSettings,
  options: {
    toolName: string;
    isReadOnly: boolean;
    kind?: 'shell' | 'file' | 'network' | 'memory' | 'other';
    command?: string;
    filePaths?: string[];
    cwd?: string;
  },
): PermissionDecision {
  const cwd = path.resolve(options.cwd || process.cwd());

  if (settings.deniedTools.includes(options.toolName)) {
    return {
      allowed: false,
      reason: `Tool "${options.toolName}" is blocked by the current permission policy.`,
    };
  }

  if (settings.allowedTools.includes(options.toolName)) {
    return { allowed: true, reason: 'Tool explicitly allowed by permission settings.' };
  }

  for (const filePath of options.filePaths || []) {
    const blocked = matchesDeniedPathRule(filePath, settings.pathRules, cwd);
    if (blocked) {
      return {
        allowed: false,
        reason: `Access to "${filePath}" is blocked by path rule "${blocked.pattern}".`,
      };
    }
  }

  if (options.command) {
    const blockedPattern = settings.deniedCommands.find(pattern => matchesCommandPattern(options.command || '', pattern));
    if (blockedPattern) {
      return {
        allowed: false,
        reason: `Command blocked by denied command rule "${blockedPattern}".`,
      };
    }
  }

  if (settings.mode === 'auto') {
    return { allowed: true, reason: 'Auto mode allows this action.' };
  }

  if (options.isReadOnly) {
    return { allowed: true, reason: 'Read-only action allowed.' };
  }

  if (settings.mode === 'plan') {
    return {
      allowed: false,
      reason: 'Plan mode blocks mutating actions. Switch permission mode to continue.',
    };
  }

  if (options.kind === 'shell' && options.command && !isSafeShellCommand(options.command)) {
    return {
      allowed: false,
      reason: 'Default mode blocks mutating shell commands. Use permission mode "auto" to run this command.',
    };
  }

  return {
    allowed: true,
    reason: 'Staged or non-shell mutation allowed in default mode.',
  };
}

export function isSafeShellCommand(command: string): boolean {
  const normalized = String(command || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return false;

  for (const pattern of MUTATING_SHELL_PATTERNS) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  return DEFAULT_SAFE_SHELL_PREFIXES.some(prefix => normalized.toLowerCase().startsWith(prefix));
}

export function serializePathRules(rules: PermissionPathRule[]): string {
  return rules
    .map(rule => `${rule.allow ? 'allow' : 'deny'} ${rule.pattern}`)
    .join('\n');
}

export function parsePathRules(text: string): PermissionPathRule[] {
  const rules: PermissionPathRule[] = [];

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(allow|deny)\s+(.+)$/i);
    if (!match) continue;

    rules.push({
      allow: match[1].toLowerCase() === 'allow',
      pattern: match[2].trim(),
    });
  }

  return rules;
}

export function serializeStringList(values: string[]): string {
  return normalizeStringList(values).join('\n');
}

export function parseStringList(text: string): string[] {
  return normalizeStringList(String(text || '').split(/\r?\n/));
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function matchesDeniedPathRule(candidatePath: string, rules: PermissionPathRule[], cwd: string): PermissionPathRule | null {
  const absolute = normalizeGlobPath(path.resolve(candidatePath));
  const relative = normalizeGlobPath(path.relative(cwd, absolute) || '.');

  for (const rule of rules) {
    if (rule.allow) continue;
    const pattern = normalizeGlobPath(rule.pattern);
    if (matchesGlob(absolute, pattern) || matchesGlob(relative, pattern)) {
      return rule;
    }
  }

  return null;
}

function matchesCommandPattern(command: string, pattern: string): boolean {
  const normalizedCommand = String(command || '').trim();
  const normalizedPattern = String(pattern || '').trim();
  if (!normalizedPattern) return false;
  if (normalizedPattern.includes('*')) {
    return matchesGlob(normalizedCommand, normalizedPattern);
  }
  return normalizedCommand === normalizedPattern;
}

function matchesGlob(candidate: string, pattern: string): boolean {
  try {
    return path.matchesGlob(candidate, pattern);
  } catch {
    return candidate === pattern;
  }
}

function normalizeGlobPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === 'default' || value === 'auto' || value === 'plan';
}
