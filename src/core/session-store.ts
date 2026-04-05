import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getUserConfigDir } from '../config.js';
import type { ChatMessage, ProviderType } from '../types.js';

export interface SessionSnapshot {
  sessionId: string;
  cwd: string;
  provider: ProviderType;
  model: string;
  messages: ChatMessage[];
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  savedAt: string;
  summary: string;
}

export interface SessionSummary {
  sessionId: string;
  summary: string;
  model: string;
  savedAt: string;
  messageCount: number;
}

export async function saveSessionSnapshot(options: {
  cwd: string;
  provider: ProviderType;
  model: string;
  messages: ChatMessage[];
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  maxSnapshots?: number;
}): Promise<void> {
  const sessionDir = await ensureSessionDir(options.cwd);
  const summary = summarizeMessages(options.messages);
  const sessionId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const payload: SessionSnapshot = {
    sessionId,
    cwd: path.resolve(options.cwd),
    provider: options.provider,
    model: options.model,
    messages: options.messages,
    usage: options.usage,
    savedAt: new Date().toISOString(),
    summary,
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(path.join(sessionDir, 'latest.json'), serialized, 'utf-8');
  await fs.writeFile(path.join(sessionDir, `session-${sessionId}.json`), serialized, 'utf-8');
  await trimOldSessions(sessionDir, Math.max(1, options.maxSnapshots || 20));
}

export async function hasSavedSession(cwd: string): Promise<boolean> {
  try {
    await fs.access(path.join(getSessionDir(cwd), 'latest.json'));
    return true;
  } catch {
    return false;
  }
}

export async function loadLatestSession(cwd: string): Promise<SessionSnapshot | null> {
  return loadSessionFromFile(path.join(getSessionDir(cwd), 'latest.json'));
}

export async function loadSessionById(cwd: string, sessionId: string): Promise<SessionSnapshot | null> {
  const normalized = String(sessionId || '').trim();
  if (!normalized || normalized === 'latest') {
    return loadLatestSession(cwd);
  }
  return loadSessionFromFile(path.join(getSessionDir(cwd), `session-${normalized}.json`));
}

export async function listRecentSessions(cwd: string, limit: number = 10): Promise<SessionSummary[]> {
  const sessionDir = getSessionDir(cwd);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(sessionDir);
  } catch {
    return [];
  }

  const sessions = await Promise.all(
    entries
      .filter(name => /^session-\d{14}\.json$/.test(name))
      .sort()
      .reverse()
      .slice(0, Math.max(1, limit))
      .map(async name => {
        const data = await loadSessionFromFile(path.join(sessionDir, name));
        if (!data) return null;
        return {
          sessionId: data.sessionId,
          summary: data.summary,
          model: data.model,
          savedAt: data.savedAt,
          messageCount: data.messages.length,
        } satisfies SessionSummary;
      }),
  );

  return sessions.filter((item): item is SessionSummary => !!item);
}

function getSessionDir(cwd: string): string {
  const resolved = path.resolve(cwd);
  const digest = createHash('sha1').update(resolved).digest('hex').slice(0, 12);
  return path.join(getUserConfigDir(), 'sessions', `${path.basename(resolved) || 'workspace'}-${digest}`);
}

async function ensureSessionDir(cwd: string): Promise<string> {
  const sessionDir = getSessionDir(cwd);
  await fs.mkdir(sessionDir, { recursive: true });
  return sessionDir;
}

async function trimOldSessions(sessionDir: string, maxSnapshots: number): Promise<void> {
  const entries = (await fs.readdir(sessionDir))
    .filter(name => /^session-\d{14}\.json$/.test(name))
    .sort()
    .reverse();

  for (const name of entries.slice(maxSnapshots)) {
    await fs.rm(path.join(sessionDir, name), { force: true });
  }
}

async function loadSessionFromFile(filePath: string): Promise<SessionSnapshot | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as SessionSnapshot;
    if (!Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function summarizeMessages(messages: ChatMessage[]): string {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = flattenMessageContent(message).trim();
    if (text) return text.slice(0, 120);
  }
  return '(empty session)';
}

function flattenMessageContent(message: ChatMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .map(item => item.type === 'text' ? item.text : '[image]')
    .join('\n');
}
