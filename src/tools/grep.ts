// ============================================================
// zen-cli  —  Tool: grep
// ============================================================
// Search file contents using regex patterns.
// Self-implemented — does not depend on system grep.

import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import type { ToolResult } from '../types.js';
import { formatPermissionError, isPermissionError } from '../core/permission-errors.js';

const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_CONTEXT_LINES = 2;

export async function grepFiles(
  args: Record<string, unknown>,
  maxResults: number = DEFAULT_MAX_RESULTS,
): Promise<ToolResult> {
  const pattern = args.pattern as string;
  const searchPath = (args.path as string) || '.';
  const include = args.include as string | undefined;  // e.g. "*.ts"
  const contextLines = (args.context_lines as number) ?? DEFAULT_CONTEXT_LINES;

  if (!pattern) {
    return { success: false, output: 'Error: "pattern" parameter is required.' };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch (err) {
    return { success: false, output: `Error: Invalid regex pattern: ${(err as Error).message}` };
  }

  try {
    const resolvedPath = path.resolve(process.cwd(), searchPath);
    const stat = await fs.stat(resolvedPath);

    let files: string[];

    if (stat.isFile()) {
      files = [resolvedPath];
    } else {
      // Use fast-glob to find files
      const globPattern = include || '**/*';
      files = await fg(globPattern, {
        cwd: resolvedPath,
        absolute: true,
        dot: false,
        onlyFiles: true,
        ignore: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/*.min.js',
          '**/*.min.css',
          '**/package-lock.json',
          '**/yarn.lock',
          '**/pnpm-lock.yaml',
        ],
      });
    }

    const results: string[] = [];
    let totalMatches = 0;
    let permissionDeniedCount = 0;
    const permissionDeniedSamples: string[] = [];

    for (const file of files) {
      if (totalMatches >= maxResults) break;

      try {
        const content = await fs.readFile(file, 'utf-8');
        // Skip binary files
        if (content.includes('\0')) continue;

        const lines = content.split('\n');
        const matches: Array<{ lineNum: number; line: string }> = [];

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches.push({ lineNum: i + 1, line: lines[i] });
          }
        }

        if (matches.length > 0) {
          const relPath = path.relative(process.cwd(), file);

          for (const match of matches) {
            if (totalMatches >= maxResults) break;

            // Build context
            const startLine = Math.max(0, match.lineNum - 1 - contextLines);
            const endLine = Math.min(lines.length, match.lineNum + contextLines);
            const contextSnippet = lines
              .slice(startLine, endLine)
              .map((l, idx) => {
                const num = startLine + idx + 1;
                const marker = num === match.lineNum ? '>' : ' ';
                return `${marker} ${num}: ${l}`;
              })
              .join('\n');

            results.push(`${relPath}:${match.lineNum}\n${contextSnippet}`);
            totalMatches++;
          }
        }
      } catch (err) {
        if (isPermissionError(err)) {
          permissionDeniedCount++;
          if (permissionDeniedSamples.length < 3) {
            permissionDeniedSamples.push(path.relative(process.cwd(), file));
          }
        }
        continue;
      }
    }

    if (results.length === 0) {
      let output = `No matches found for pattern: ${pattern}`;
      if (permissionDeniedCount > 0) {
        output += `\n\nSkipped ${permissionDeniedCount} file(s) due to permission errors`;
        if (permissionDeniedSamples.length > 0) {
          output += `: ${permissionDeniedSamples.join(', ')}`;
        }
        output += '.';
      }
      return { success: true, output };
    }

    let output = results.join('\n\n');
    if (totalMatches >= maxResults) {
      output += `\n\n(Results limited to ${maxResults} matches)`;
    }
    if (permissionDeniedCount > 0) {
      output += `\n\nSkipped ${permissionDeniedCount} file(s) due to permission errors`;
      if (permissionDeniedSamples.length > 0) {
        output += `: ${permissionDeniedSamples.join(', ')}`;
      }
      output += '.';
    }

    return { success: true, output };
  } catch (err) {
    if (isPermissionError(err)) {
      return {
        success: false,
        output: formatPermissionError({
          operation: 'search files',
          target: searchPath,
        }),
      };
    }
    return { success: false, output: `Error: ${(err as Error).message}` };
  }
}
