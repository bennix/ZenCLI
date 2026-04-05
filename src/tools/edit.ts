// ============================================================
// zen-cli  —  Tool: edit_file
// ============================================================
// Exact string replacement in a file.
// old_string must appear exactly once in the file (uniqueness enforced).

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ToolResult } from '../types.js';
import { pendingChanges } from '../core/pending-changes.js';
import { formatPermissionError, isPermissionError } from '../core/permission-errors.js';

export async function editFile(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = args.path as string;
  const oldString = args.old_string as string;
  const newString = args.new_string as string;

  if (!filePath) {
    return { success: false, output: 'Error: "path" parameter is required.' };
  }
  if (oldString === undefined || oldString === null) {
    return { success: false, output: 'Error: "old_string" parameter is required.' };
  }
  if (newString === undefined || newString === null) {
    return { success: false, output: 'Error: "new_string" parameter is required.' };
  }

  try {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    const { content } = await pendingChanges.readFile(resolvedPath);

    // Count occurrences
    let count = 0;
    let searchFrom = 0;
    while (true) {
      const idx = content.indexOf(oldString, searchFrom);
      if (idx === -1) break;
      count++;
      searchFrom = idx + 1;
    }

    if (count === 0) {
      // Show a snippet of the file to help debug
      const lines = content.split('\n');
      const preview = lines.slice(0, 10).map((l, i) => `${i + 1}: ${l}`).join('\n');
      return {
        success: false,
        output: `Error: old_string not found in ${filePath}.\n\nFirst 10 lines of the file:\n${preview}`,
      };
    }

    if (count > 1) {
      return {
        success: false,
        output: `Error: Found ${count} matches for old_string in ${filePath}. ` +
          'Provide more surrounding context in old_string to identify the correct match, ' +
          'or use the full line(s) to make it unique.',
      };
    }

    // Perform the replacement
    const newContent = content.replace(oldString, newString);
    const staged = await pendingChanges.stage(resolvedPath, newContent);

    // Calculate the diff location
    const beforeLines = content.substring(0, content.indexOf(oldString)).split('\n');
    const lineNum = beforeLines.length;

    if (staged.status === 'cleared') {
      return {
        success: true,
        output: `Cleared staged changes for ${filePath}; file now matches disk.`,
        pendingChangesChanged: true,
        touchedPaths: [resolvedPath],
      };
    }

    return {
      success: true,
      output: `Staged edit for ${filePath} at line ${lineNum}: replaced ${oldString.split('\n').length} line(s). ` +
        'Awaiting user approval in the review panel.',
      pendingChangesChanged: true,
      touchedPaths: [resolvedPath],
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return { success: false, output: `Error: File not found: ${filePath}` };
    }
    if (isPermissionError(error)) {
      return {
        success: false,
        output: formatPermissionError({
          operation: 'edit the file',
          target: filePath,
        }),
      };
    }
    return { success: false, output: `Error editing file: ${error.message}` };
  }
}
