// ============================================================
// zen-cli  —  Tool: glob
// ============================================================
// Find files matching glob patterns using fast-glob.

import path from 'node:path';
import fg from 'fast-glob';
import type { ToolResult } from '../types.js';

export async function globFiles(args: Record<string, unknown>): Promise<ToolResult> {
  const pattern = args.pattern as string;
  const searchPath = (args.path as string) || '.';

  if (!pattern) {
    return { success: false, output: 'Error: "pattern" parameter is required.' };
  }

  try {
    const cwd = path.resolve(process.cwd(), searchPath);

    const files = await fg(pattern, {
      cwd,
      absolute: false,
      dot: false,
      onlyFiles: true,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
      ],
    });

    // Sort by path for consistent output
    files.sort();

    if (files.length === 0) {
      return { success: true, output: `No files found matching pattern: ${pattern}` };
    }

    let output = files.join('\n');
    if (files.length > 500) {
      output = files.slice(0, 500).join('\n');
      output += `\n\n(Showing 500 of ${files.length} matches. Narrow your pattern for more specific results.)`;
    }

    return { success: true, output: `Found ${files.length} file(s):\n${output}` };
  } catch (err) {
    return { success: false, output: `Error: ${(err as Error).message}` };
  }
}
