// ============================================================
// zen-cli  —  Tool: write_file
// ============================================================
// Write content to a file. Creates parent directories if needed.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ToolResult } from '../types.js';
import { pendingChanges } from '../core/pending-changes.js';
import { formatPermissionError, isPermissionError } from '../core/permission-errors.js';

export async function writeFile(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = args.path as string;
  const content = args.content as string;

  if (!filePath) {
    return { success: false, output: 'Error: "path" parameter is required.' };
  }
  if (content === undefined || content === null) {
    return { success: false, output: 'Error: "content" parameter is required.' };
  }

  try {
    const resolvedPath = path.resolve(process.cwd(), filePath);

    // Check if file exists (for the output message)
    let existed = false;
    try {
      await fs.access(resolvedPath);
      existed = true;
    } catch {
      // File doesn't exist — that's fine
    }

    // Stage the file instead of writing to disk directly.
    const staged = await pendingChanges.stage(resolvedPath, content);

    if (staged.status === 'cleared') {
      return {
        success: true,
        output: `Cleared staged changes for ${filePath}; file now matches disk.`,
        pendingChangesChanged: true,
        touchedPaths: [resolvedPath],
      };
    }

    const lineCount = content.split('\n').length;
    const action = existed ? 'Updated' : 'Created';
    return {
      success: true,
      output: `Staged ${action.toLowerCase()} for ${filePath} (${lineCount} lines, ${content.length} bytes). ` +
        'Awaiting user approval in the review panel.',
      pendingChangesChanged: true,
      touchedPaths: [resolvedPath],
    };
  } catch (err) {
    if (isPermissionError(err)) {
      return {
        success: false,
        output: formatPermissionError({
          operation: 'stage a write for the file',
          target: filePath,
        }),
      };
    }
    return { success: false, output: `Error writing file: ${(err as Error).message}` };
  }
}
