// ============================================================
// zen-cli  —  Tool: read_file
// ============================================================
// Read file contents with line numbers. Supports offset and limit for pagination.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ToolResult } from '../types.js';
import { pendingChanges } from '../core/pending-changes.js';
import { formatPermissionError, isPermissionError } from '../core/permission-errors.js';

export async function readFile(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = args.path as string;
  const offset = (args.offset as number) || 1;    // 1-indexed line number
  const limit = (args.limit as number) || 2000;

  if (!filePath) {
    return { success: false, output: 'Error: "path" parameter is required.' };
  }

  try {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;

    try {
      stat = await fs.stat(resolvedPath);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') throw err;
    }

    // Check if path is a directory
    if (stat?.isDirectory() || (!stat && pendingChanges.hasDirectoryEntries(resolvedPath))) {
      const entries = stat?.isDirectory()
        ? await fs.readdir(resolvedPath, { withFileTypes: true })
        : [];
      const diskListing = entries.map(entry => entry.isDirectory() ? `${entry.name}/` : entry.name);
      const listing = pendingChanges
        .listDirectoryEntries(resolvedPath, diskListing)
        .join('\n');
      return {
        success: true,
        output: `Directory listing of ${filePath}:\n${listing || '(empty directory)'}`,
      };
    }

    // Read file, preferring staged content when present.
    const fileData = await pendingChanges.readFile(resolvedPath);
    const content = fileData.content;
    const allLines = content.split('\n');
    const totalLines = allLines.length;

    // Apply offset (1-indexed) and limit
    const startIdx = Math.max(0, offset - 1);
    const endIdx = Math.min(totalLines, startIdx + limit);
    const selectedLines = allLines.slice(startIdx, endIdx);

    // Add line numbers
    const numbered = selectedLines
      .map((line, i) => {
        const lineNum = startIdx + i + 1;
        // Truncate very long lines
        const displayLine = line.length > 2000 ? line.substring(0, 2000) + '... (truncated)' : line;
        return `${lineNum}: ${displayLine}`;
      })
      .join('\n');

    let output = numbered;
    if (endIdx < totalLines) {
      output += `\n\n(Showing lines ${startIdx + 1}-${endIdx} of ${totalLines} total. Use offset=${endIdx + 1} to read more.)`;
    }
    if (fileData.fromPending) {
      output += '\n\n(Note: showing staged changes pending user approval.)';
    }

    return { success: true, output };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return { success: false, output: `Error: File not found: ${filePath}` };
    }
    if (isPermissionError(error)) {
      return {
        success: false,
        output: formatPermissionError({
          operation: 'read the file',
          target: filePath,
        }),
      };
    }
    return { success: false, output: `Error reading file: ${error.message}` };
  }
}
