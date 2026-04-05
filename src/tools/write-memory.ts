import fs from 'node:fs/promises';
import path from 'node:path';
import type { ToolResult } from '../types.js';
import { pendingChanges } from '../core/pending-changes.js';
import { getProjectMemoryPath, upsertMemorySection } from '../core/project-context.js';
import { formatPermissionError, isPermissionError } from '../core/permission-errors.js';

export async function writeMemory(args: Record<string, unknown>): Promise<ToolResult> {
  const title = String(args.title || '').trim();
  const content = String(args.content || '').trim();

  if (!title) {
    return { success: false, output: 'Error: "title" parameter is required.' };
  }
  if (!content) {
    return { success: false, output: 'Error: "content" parameter is required.' };
  }

  const memoryPath = getProjectMemoryPath(process.cwd());

  try {
    let current = '';
    try {
      const fileData = await pendingChanges.readFile(memoryPath);
      current = fileData.content;
    } catch (error) {
      const typed = error as NodeJS.ErrnoException;
      if (typed.code !== 'ENOENT') throw error;
    }

    const nextContent = upsertMemorySection(current, title, content);
    const staged = await pendingChanges.stage(memoryPath, nextContent);

    if (staged.status === 'cleared') {
      return {
        success: true,
        output: `Project memory already matched the requested content: ${path.relative(process.cwd(), memoryPath)}`,
        pendingChangesChanged: true,
        touchedPaths: [memoryPath],
      };
    }

    return {
      success: true,
      output: `Staged project memory update in ${path.relative(process.cwd(), memoryPath)} under "${title}". Awaiting user approval in the review panel.`,
      pendingChangesChanged: true,
      touchedPaths: [memoryPath],
    };
  } catch (error) {
    if (isPermissionError(error)) {
      return {
        success: false,
        output: formatPermissionError({
          operation: 'update project memory',
          target: memoryPath,
        }),
      };
    }

    return {
      success: false,
      output: `Error updating project memory: ${(error as Error).message}`,
    };
  }
}
