// ============================================================
// zen-cli  —  Pending Change Manager
// ============================================================
// Keeps model-written file changes in memory until the user
// explicitly accepts or rejects them from the UI.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DiffHunk, DiffLine, PendingChangeSummary } from '../types.js';

interface StoredPendingChange {
  path: string;
  existed: boolean;
  originalContent: string;
  proposedContent: string;
  updatedAt: number;
}

interface FileContentResult {
  exists: boolean;
  content: string;
  fromPending: boolean;
}

interface StageChangeResult {
  summary: PendingChangeSummary | null;
  status: 'staged' | 'cleared';
}

export class PendingChangeManager {
  private changes = new Map<string, StoredPendingChange>();

  hasPendingChanges(rootDir?: string): boolean {
    return this.list(rootDir).length > 0;
  }

  hasFile(absPath: string): boolean {
    return this.changes.has(absPath);
  }

  async readFile(absPath: string): Promise<FileContentResult> {
    const change = this.changes.get(absPath);
    if (change) {
      return {
        exists: true,
        content: change.proposedContent,
        fromPending: true,
      };
    }

    const content = await fs.readFile(absPath, 'utf-8');
    return {
      exists: true,
      content,
      fromPending: false,
    };
  }

  hasDirectoryEntries(absPath: string): boolean {
    for (const changedPath of this.changes.keys()) {
      const rel = path.relative(absPath, changedPath);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
      return true;
    }
    return false;
  }

  listDirectoryEntries(absPath: string, diskEntries: string[]): string[] {
    const entrySet = new Set(diskEntries);

    for (const changedPath of this.changes.keys()) {
      const rel = path.relative(absPath, changedPath);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
      const firstSegment = rel.split(path.sep)[0];
      if (!firstSegment) continue;
      entrySet.add(rel.includes(path.sep) ? `${firstSegment}/` : firstSegment);
    }

    return Array.from(entrySet).sort((a, b) => a.localeCompare(b));
  }

  async stage(absPath: string, proposedContent: string): Promise<StageChangeResult> {
    const existing = this.changes.get(absPath);

    if (existing) {
      if (existing.originalContent === proposedContent) {
        this.changes.delete(absPath);
        return { summary: null, status: 'cleared' };
      }

      existing.proposedContent = proposedContent;
      existing.updatedAt = Date.now();
      return {
        summary: this.toSummary(existing, process.cwd()),
        status: 'staged',
      };
    }

    let originalContent = '';
    let existed = true;

    try {
      originalContent = await fs.readFile(absPath, 'utf-8');
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        existed = false;
      } else {
        throw err;
      }
    }

    if (existed && originalContent === proposedContent) {
      return { summary: null, status: 'cleared' };
    }

    const change: StoredPendingChange = {
      path: absPath,
      existed,
      originalContent,
      proposedContent,
      updatedAt: Date.now(),
    };

    this.changes.set(absPath, change);

    return {
      summary: this.toSummary(change, process.cwd()),
      status: 'staged',
    };
  }

  list(rootDir: string = process.cwd()): PendingChangeSummary[] {
    const summaries: PendingChangeSummary[] = [];

    for (const change of this.changes.values()) {
      if (!isWithinRoot(change.path, rootDir)) continue;
      summaries.push(this.toSummary(change, rootDir));
    }

    return summaries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  async accept(pathsToAccept?: string[]): Promise<PendingChangeSummary[]> {
    const accepted = this.getSelectedChanges(pathsToAccept);

    for (const change of accepted) {
      await fs.mkdir(path.dirname(change.path), { recursive: true });
      await fs.writeFile(change.path, change.proposedContent, 'utf-8');
      this.changes.delete(change.path);
    }

    return accepted.map(change => this.toSummary(change, process.cwd()));
  }

  reject(pathsToReject?: string[]): PendingChangeSummary[] {
    const rejected = this.getSelectedChanges(pathsToReject);

    for (const change of rejected) {
      this.changes.delete(change.path);
    }

    return rejected.map(change => this.toSummary(change, process.cwd()));
  }

  private getSelectedChanges(pathsToSelect?: string[]): StoredPendingChange[] {
    if (!pathsToSelect || pathsToSelect.length === 0) {
      return Array.from(this.changes.values());
    }

    const selected: StoredPendingChange[] = [];
    for (const filePath of pathsToSelect) {
      const absPath = path.resolve(filePath);
      const change = this.changes.get(absPath);
      if (change) selected.push(change);
    }
    return selected;
  }

  private toSummary(change: StoredPendingChange, rootDir: string): PendingChangeSummary {
    const relativePath = normalizePath(path.relative(rootDir, change.path) || path.basename(change.path));
    const diff = buildDiff(change.originalContent, change.proposedContent);

    let addedLines = 0;
    let removedLines = 0;
    for (const hunk of diff) {
      for (const line of hunk.lines) {
        if (line.type === 'add') addedLines++;
        if (line.type === 'remove') removedLines++;
      }
    }

    return {
      path: change.path,
      relativePath,
      existed: change.existed,
      addedLines,
      removedLines,
      updatedAt: change.updatedAt,
      hunks: diff,
    };
  }
}

export const pendingChanges = new PendingChangeManager();

function buildDiff(originalContent: string, proposedContent: string): DiffHunk[] {
  const originalLines = originalContent.split('\n');
  const proposedLines = proposedContent.split('\n');

  const oldLen = originalLines.length;
  const newLen = proposedLines.length;
  const dp: number[][] = Array.from({ length: oldLen + 1 }, () => Array<number>(newLen + 1).fill(0));

  for (let i = oldLen - 1; i >= 0; i--) {
    for (let j = newLen - 1; j >= 0; j--) {
      if (originalLines[i] === proposedLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const ops: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLen && newIndex < newLen) {
    if (originalLines[oldIndex] === proposedLines[newIndex]) {
      ops.push({
        type: 'context',
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
        content: originalLines[oldIndex],
      });
      oldIndex++;
      newIndex++;
      continue;
    }

    if (dp[oldIndex + 1][newIndex] >= dp[oldIndex][newIndex + 1]) {
      ops.push({
        type: 'remove',
        oldLineNumber: oldIndex + 1,
        newLineNumber: null,
        content: originalLines[oldIndex],
      });
      oldIndex++;
    } else {
      ops.push({
        type: 'add',
        oldLineNumber: null,
        newLineNumber: newIndex + 1,
        content: proposedLines[newIndex],
      });
      newIndex++;
    }
  }

  while (oldIndex < oldLen) {
    ops.push({
      type: 'remove',
      oldLineNumber: oldIndex + 1,
      newLineNumber: null,
      content: originalLines[oldIndex],
    });
    oldIndex++;
  }

  while (newIndex < newLen) {
    ops.push({
      type: 'add',
      oldLineNumber: null,
      newLineNumber: newIndex + 1,
      content: proposedLines[newIndex],
    });
    newIndex++;
  }

  return buildHunks(ops, 3);
}

function buildHunks(lines: DiffLine[], contextLines: number): DiffHunk[] {
  const changedIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'context') changedIndices.push(i);
  }

  if (changedIndices.length === 0) return [];

  const ranges: Array<{ start: number; end: number }> = [];
  let start = Math.max(0, changedIndices[0] - contextLines);
  let end = Math.min(lines.length, changedIndices[0] + contextLines + 1);

  for (let i = 1; i < changedIndices.length; i++) {
    const changeIndex = changedIndices[i];
    const nextStart = Math.max(0, changeIndex - contextLines);
    const nextEnd = Math.min(lines.length, changeIndex + contextLines + 1);

    if (nextStart <= end) {
      end = Math.max(end, nextEnd);
    } else {
      ranges.push({ start, end });
      start = nextStart;
      end = nextEnd;
    }
  }

  ranges.push({ start, end });

  return ranges.map(({ start: rangeStart, end: rangeEnd }) => {
    const slice = lines.slice(rangeStart, rangeEnd);
    const oldStart = slice.find(line => line.oldLineNumber !== null)?.oldLineNumber ?? 0;
    const newStart = slice.find(line => line.newLineNumber !== null)?.newLineNumber ?? 0;
    const oldCount = slice.filter(line => line.oldLineNumber !== null).length;
    const newCount = slice.filter(line => line.newLineNumber !== null).length;

    return {
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines: slice,
    };
  });
}

function isWithinRoot(targetPath: string, rootDir: string): boolean {
  const rel = path.relative(rootDir, targetPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
