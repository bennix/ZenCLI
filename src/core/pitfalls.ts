import fs from 'node:fs/promises';
import path from 'node:path';
import { findProjectRoot } from './project-context.js';

const MAX_PITFALLS = 40;

export interface PitfallEntry {
  id: string;
  headline: string;
  detail: string;
  toolName?: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

export function getProjectPitfallsPath(startDir: string = process.cwd()): string {
  const root = findProjectRoot(startDir);
  return path.join(root, '.zen-cli', 'PITFALLS.json');
}

export async function loadPitfalls(startDir: string = process.cwd()): Promise<PitfallEntry[]> {
  try {
    const raw = await fs.readFile(getProjectPitfallsPath(startDir), 'utf-8');
    const parsed = JSON.parse(raw) as { pitfalls?: PitfallEntry[] } | PitfallEntry[];
    const items = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.pitfalls) ? parsed.pitfalls : []);
    return items
      .filter(item => !!item && typeof item.headline === 'string' && typeof item.detail === 'string')
      .slice(0, MAX_PITFALLS);
  } catch {
    return [];
  }
}

export async function savePitfalls(entries: PitfallEntry[], startDir: string = process.cwd()): Promise<void> {
  const filePath = getProjectPitfallsPath(startDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ pitfalls: entries.slice(0, MAX_PITFALLS) }, null, 2)}\n`, 'utf-8');
}

export async function clearPitfalls(startDir: string = process.cwd()): Promise<void> {
  const filePath = getProjectPitfallsPath(startDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ pitfalls: [] }, null, 2)}\n`, 'utf-8');
}

export async function recordPitfall(
  options: {
    headline: string;
    detail: string;
    toolName?: string;
  },
  startDir: string = process.cwd(),
): Promise<PitfallEntry | null> {
  const normalizedHeadline = collapseWhitespace(options.headline);
  const normalizedDetail = collapseWhitespace(options.detail);
  if (!normalizedHeadline || !normalizedDetail) return null;

  const items = await loadPitfalls(startDir);
  const id = buildPitfallId(options.toolName || '', normalizedHeadline);
  const now = new Date().toISOString();
  const existing = items.find(item => item.id === id);

  if (existing) {
    existing.occurrences += 1;
    existing.lastSeen = now;
    if (normalizedDetail.length > existing.detail.length) {
      existing.detail = normalizedDetail;
    }
  } else {
    items.unshift({
      id,
      headline: normalizedHeadline,
      detail: normalizedDetail,
      toolName: options.toolName,
      occurrences: 1,
      firstSeen: now,
      lastSeen: now,
    });
  }

  items.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  await savePitfalls(items, startDir);
  return items[0] || null;
}

export function derivePitfallFromFailure(options: {
  source: 'tool' | 'error';
  toolName?: string;
  message: string;
}): { headline: string; detail: string; toolName?: string } | null {
  const text = collapseWhitespace(String(options.message || ''));
  if (!text) return null;

  if (
    /chat_cancelled/i.test(text)
    || /^no matches found for pattern:/i.test(text)
    || /^unknown command:/i.test(text)
  ) {
    return null;
  }

  const headline = inferHeadline(text, options);
  const detail = inferDetail(text);
  if (!headline || !detail) return null;

  return {
    headline,
    detail,
    toolName: options.toolName,
  };
}

function inferHeadline(text: string, options: { source: 'tool' | 'error'; toolName?: string }): string {
  if (/permission denied/i.test(text)) return 'Avoid paths or commands blocked by permissions';
  if (/timed out/i.test(text)) return 'Long-running commands need narrower scope or higher timeout';
  if (/old_string not found/i.test(text)) return 'Read the latest file content before edit_file replacements';
  if (/found \d+ matches for old_string/i.test(text)) return 'Use more unique context for edit_file replacements';
  if (/does not support tool calling/i.test(text)) return 'Choose a tools-capable Ollama model before asking for actions';
  if (/embedding-only model/i.test(text)) return 'Avoid embedding-only Ollama models for chat sessions';
  if (/binary file preview is not supported/i.test(text)) return 'Do not rely on text reads for binary assets';
  if (options.toolName) return `${options.toolName} previously failed in this workspace`;
  return 'A previous failure in this workspace should be avoided';
}

function inferDetail(text: string): string {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => collapseWhitespace(line))
    .filter(Boolean);

  return lines.slice(0, 3).join(' | ').slice(0, 500);
}

function buildPitfallId(toolName: string, headline: string): string {
  const raw = `${toolName}::${headline}`.toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'pitfall';
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
