import fs from 'node:fs';
import path from 'node:path';
import { getProjectPitfallsPath, type PitfallEntry } from './pitfalls.js';

const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'deno.json',
  'tsconfig.json',
];

const GUIDANCE_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'CLAUDE.local.md',
];

const MAX_DOC_CHARS = 8_000;
const MAX_TOTAL_GUIDANCE_CHARS = 16_000;

export interface ProjectDocument {
  path: string;
  content: string;
  truncated: boolean;
  kind?: 'file' | 'directory';
}

export function findProjectRoot(startDir: string = process.cwd()): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const start = path.resolve(startDir);
  const ancestors = listAncestors(start);

  for (const dir of ancestors) {
    for (const marker of PROJECT_MARKERS) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir;
      }
    }
  }

  return home && start.startsWith(home) ? start : start;
}

export function getProjectMemoryPath(startDir: string = process.cwd()): string {
  const root = findProjectRoot(startDir);
  return path.join(root, '.zen-cli', 'MEMORY.md');
}

export function readProjectMemory(startDir: string = process.cwd(), maxChars: number = 6_000): ProjectDocument | null {
  const memoryPath = getProjectMemoryPath(startDir);
  const loaded = readTextFile(memoryPath, maxChars);
  if (!loaded) return null;

  return {
    path: memoryPath,
    content: loaded.content,
    truncated: loaded.truncated,
  };
}

export function readProjectPitfalls(startDir: string = process.cwd(), maxEntries: number = 10): ProjectDocument | null {
  const pitfallsPath = getProjectPitfallsPath(startDir);
  const loaded = readTextFile(pitfallsPath, 24_000);
  if (!loaded || !loaded.content.trim()) return null;

  try {
    const parsed = JSON.parse(loaded.content) as { pitfalls?: PitfallEntry[] };
    const items = Array.isArray(parsed.pitfalls) ? parsed.pitfalls.slice(0, maxEntries) : [];
    if (items.length === 0) return null;

    const lines = ['Recent pitfalls to avoid repeating:'];
    for (const item of items) {
      lines.push(`- ${item.headline} (seen ${item.occurrences}x)`);
      lines.push(`  ${item.detail}`);
    }

    return {
      path: pitfallsPath,
      content: lines.join('\n'),
      truncated: loaded.truncated,
    };
  } catch {
    return null;
  }
}

export function collectProjectGuidance(startDir: string = process.cwd()): ProjectDocument[] {
  const root = findProjectRoot(startDir);
  const docs: ProjectDocument[] = [];
  let remaining = MAX_TOTAL_GUIDANCE_CHARS;

  for (const dir of listAncestors(path.resolve(startDir))) {
    if (!isSamePath(dir, root) && !isWithin(dir, root)) {
      continue;
    }

    for (const filename of GUIDANCE_FILES) {
      const absPath = path.join(dir, filename);
      if (!fs.existsSync(absPath) || docs.some(doc => isSamePath(doc.path, absPath))) {
        continue;
      }

      const loaded = readTextFile(absPath, Math.min(MAX_DOC_CHARS, remaining));
      if (!loaded || !loaded.content.trim()) continue;

      docs.push({
        path: absPath,
        content: loaded.content,
        truncated: loaded.truncated,
      });

      remaining -= loaded.content.length;
      if (remaining <= 0) {
        return docs;
      }
    }

    if (isSamePath(dir, root)) {
      break;
    }
  }

  return docs;
}

export function upsertMemorySection(existingContent: string, title: string, body: string): string {
  const normalizedTitle = title.trim() || 'Untitled Memory';
  const normalizedBody = body.trim();
  const timestamp = new Date().toISOString();
  const header = '# Project Memory';
  const section = [
    `## ${normalizedTitle}`,
    `Saved: ${timestamp}`,
    '',
    normalizedBody,
    '',
  ].join('\n');

  const base = existingContent.trim()
    ? existingContent.trim()
    : `${header}\n`;

  const escapedTitle = escapeRegExp(normalizedTitle);
  const sectionPattern = new RegExp(
    String.raw`(?:^|\n)## ${escapedTitle}\n[\s\S]*?(?=\n## |\n# |\s*$)`,
    'm',
  );

  if (sectionPattern.test(base)) {
    return `${base.replace(sectionPattern, `\n${section}`)}`.trimEnd() + '\n';
  }

  const prefix = base.startsWith(header) ? base : `${header}\n\n${base}`;
  return `${prefix.replace(/\s*$/, '')}\n\n${section}`.trimEnd() + '\n';
}

function listAncestors(startDir: string): string[] {
  const dirs: string[] = [];
  let current = path.resolve(startDir);

  while (true) {
    dirs.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return dirs;
}

function readTextFile(filePath: string, maxChars: number): { content: string; truncated: boolean } | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.length <= maxChars) {
      return { content, truncated: false };
    }
    return { content: content.slice(0, maxChars), truncated: true };
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

function isSamePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}

function isWithin(candidate: string, root: string): boolean {
  const normalizedCandidate = normalizePath(candidate);
  const normalizedRoot = normalizePath(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}
