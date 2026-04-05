// ============================================================
// zen-cli  —  Sensitive File Locker
// ============================================================
// Prevents AI from touching sensitive files (.env, lock files,
// credential files) to prevent dependency breakage or privacy leaks.

import path from 'node:path';
import type { PermissionPathRule } from '../types.js';

const DEFAULT_SENSITIVE_PATTERNS = [
  '**/.env',
  '**/.env.*',
  '**/.env.local',
  '**/.env.production',
  '**/.env.development',
  '**/.env.test',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/Pipfile.lock',
  '**/poetry.lock',
  '**/Gemfile.lock',
  '**/composer.lock',
  '**/Cargo.lock',
  '**/go.sum',
  '**/*.key',
  '**/*.pem',
  '**/*.p12',
  '**/*.pfx',
  '**/*.keystore',
  '**/id_rsa',
  '**/id_ed25519',
  '**/id_dsa',
  '**/*.secret',
  '**/credentials.json',
  '**/service-account*.json',
  '**/.npmrc',
  '**/.pypirc',
  '**/.netrc',
  '**/.git-credentials',
  '**/.ssh/config',
  '**/.aws/credentials',
  '**/.docker/config.json',
];

export interface SensitiveFileCheck {
  isSensitive: boolean;
  matchedPattern: string;
  reason: string;
}

export function checkSensitiveFile(filePath: string, patterns: string[] = []): SensitiveFileCheck {
  const allPatterns = [...DEFAULT_SENSITIVE_PATTERNS, ...patterns];
  const normalizedPath = filePath.replace(/\\/g, '/');
  const basename = path.basename(filePath);

  for (const pattern of allPatterns) {
    if (matchesSensitivePattern(normalizedPath, pattern) || matchesSensitivePattern(basename, pattern)) {
      return {
        isSensitive: true,
        matchedPattern: pattern,
        reason: `Access to "${filePath}" is blocked — matches sensitive file pattern "${pattern}"`,
      };
    }
  }

  return { isSensitive: false, matchedPattern: '', reason: '' };
}

export function getSensitiveFileRules(extraPatterns: string[] = []): PermissionPathRule[] {
  const allPatterns = [...DEFAULT_SENSITIVE_PATTERNS, ...extraPatterns];
  return allPatterns.map(pattern => ({
    pattern,
    allow: false,
  }));
}

function matchesSensitivePattern(candidatePath: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, '/');

  if (normalizedPattern.includes('**')) {
    const regexPattern = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    try {
      return new RegExp(`^${regexPattern}$`).test(candidatePath);
    } catch {
      return false;
    }
  }

  if (normalizedPattern.includes('*')) {
    const regexPattern = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*');
    try {
      return new RegExp(`^${regexPattern}$`).test(candidatePath);
    } catch {
      return false;
    }
  }

  return candidatePath === normalizedPattern;
}
