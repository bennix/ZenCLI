import fs from 'node:fs/promises';
import path from 'node:path';
import { pendingChanges } from './pending-changes.js';
import { clearPitfalls, getProjectPitfallsPath, loadPitfalls, savePitfalls, type PitfallEntry } from './pitfalls.js';
import { findProjectRoot, getProjectMemoryPath } from './project-context.js';

export interface ManagedMemoryFile {
  id: 'AGENTS.md' | 'CLAUDE.md' | 'MEMORY.md';
  absPath: string;
  relativePath: string;
  content: string;
  exists: boolean;
}

export interface MemoryBundle {
  version: 1;
  exportedAt: string;
  rootName: string;
  files: Array<{
    id: ManagedMemoryFile['id'];
    relativePath: string;
    exists: boolean;
    content: string;
  }>;
  pitfalls: PitfallEntry[];
}

export async function exportMemoryBundle(startDir: string = process.cwd()): Promise<MemoryBundle> {
  const root = findProjectRoot(startDir);
  const files = await readManagedMemoryFiles(root);
  const pitfalls = await loadPitfalls(root);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    rootName: path.basename(root) || 'workspace',
    files: files.map(file => ({
      id: file.id,
      relativePath: file.relativePath,
      exists: file.exists,
      content: file.content,
    })),
    pitfalls,
  };
}

export async function importMemoryBundle(
  bundle: MemoryBundle,
  startDir: string = process.cwd(),
): Promise<{ stagedPaths: string[]; pitfallsImported: number }> {
  const root = findProjectRoot(startDir);
  const targets = getManagedMemoryTargets(root);
  const stagedPaths: string[] = [];

  for (const file of bundle.files || []) {
    const target = targets[file.id];
    if (!target) continue;
    await pendingChanges.stage(target.absPath, String(file.content || ''));
    stagedPaths.push(target.absPath);
  }

  await savePitfalls(Array.isArray(bundle.pitfalls) ? bundle.pitfalls : [], root);
  return {
    stagedPaths,
    pitfallsImported: Array.isArray(bundle.pitfalls) ? bundle.pitfalls.length : 0,
  };
}

export async function resetManagedMemory(startDir: string = process.cwd()): Promise<string[]> {
  const root = findProjectRoot(startDir);
  const targets = getManagedMemoryTargets(root);
  const stagedPaths: string[] = [];

  for (const target of Object.values(targets)) {
    await pendingChanges.stage(target.absPath, getDefaultManagedMemoryContent(target.id));
    stagedPaths.push(target.absPath);
  }

  await clearPitfalls(root);
  return stagedPaths;
}

export function getManagedMemoryTargets(startDir: string = process.cwd()): Record<ManagedMemoryFile['id'], { id: ManagedMemoryFile['id']; absPath: string; relativePath: string }> {
  const root = findProjectRoot(startDir);
  const agentsPath = path.join(root, 'AGENTS.md');
  const claudePath = path.join(root, 'CLAUDE.md');
  const memoryPath = getProjectMemoryPath(root);

  return {
    'AGENTS.md': {
      id: 'AGENTS.md',
      absPath: agentsPath,
      relativePath: path.relative(root, agentsPath).replace(/\\/g, '/'),
    },
    'CLAUDE.md': {
      id: 'CLAUDE.md',
      absPath: claudePath,
      relativePath: path.relative(root, claudePath).replace(/\\/g, '/'),
    },
    'MEMORY.md': {
      id: 'MEMORY.md',
      absPath: memoryPath,
      relativePath: path.relative(root, memoryPath).replace(/\\/g, '/'),
    },
  };
}

export function getDefaultManagedMemoryContent(id: ManagedMemoryFile['id']): string {
  switch (id) {
    case 'AGENTS.md':
      return [
        '# Agent Guidance',
        '',
        '- Add durable repository-specific instructions for coding agents here.',
        '- Keep this file focused on workflow, architecture, and constraints that should persist across sessions.',
        '',
      ].join('\n');
    case 'CLAUDE.md':
      return [
        '# Claude Guidance',
        '',
        '- Add collaboration conventions, style notes, and preferred workflows here.',
        '- Keep this file concise and durable.',
        '',
      ].join('\n');
    case 'MEMORY.md':
      return '# Project Memory\n';
  }
}

async function readManagedMemoryFiles(startDir: string): Promise<ManagedMemoryFile[]> {
  const root = findProjectRoot(startDir);
  const targets = Object.values(getManagedMemoryTargets(root));
  const files: ManagedMemoryFile[] = [];

  for (const target of targets) {
    let content = '';
    let exists = false;
    try {
      const fileData = await pendingChanges.readFile(target.absPath);
      content = fileData.content;
      exists = true;
    } catch {
      try {
        content = await fs.readFile(target.absPath, 'utf-8');
        exists = true;
      } catch {
        content = '';
        exists = false;
      }
    }

    files.push({
      id: target.id,
      absPath: target.absPath,
      relativePath: target.relativePath,
      content,
      exists,
    });
  }

  return files;
}
