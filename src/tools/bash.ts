// ============================================================
// zen-cli  —  Tool: bash
// ============================================================
// Execute shell commands via the user's login shell.
// 120s timeout, output truncation when exceeding 500 lines.

import { execFile } from 'node:child_process';
import type { ToolResult } from '../types.js';
import { pendingChanges } from '../core/pending-changes.js';
import { containsPermissionDeniedText, formatPermissionError, isPermissionError } from '../core/permission-errors.js';
import { getShellContext } from '../core/shell-environment.js';

const DEFAULT_TIMEOUT = 120_000; // 120 seconds
const MAX_OUTPUT_LINES = 500;
const HEAD_LINES = 200;
const TAIL_LINES = 100;

export async function executeBash(
  args: Record<string, unknown>,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<ToolResult> {
  const command = args.command as string;
  const workdir = args.workdir as string | undefined;

  if (!command) {
    return { success: false, output: 'Error: "command" parameter is required.' };
  }

  if (pendingChanges.hasPendingChanges()) {
    return {
      success: false,
      output:
        'Bash is temporarily blocked because there are staged file changes waiting for user approval. ' +
        'Ask the user to accept or reject the pending diff first so shell commands run against the correct files.',
    };
  }

  return new Promise<ToolResult>((resolve) => {
    const cwd = workdir || process.cwd();
    void getShellContext().then(({ shellPath, env }) => {
      execFile(shellPath, ['-lc', command], {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env,
      }, (error, stdout, stderr) => {
        let output = '';

        if (stdout) {
          output += stdout;
        }
        if (stderr) {
          if (output) output += '\n';
          output += `STDERR:\n${stderr}`;
        }

        // Truncate if too long
        output = truncateOutput(output);

        if (error) {
          const stderrText = String(stderr || '');
          const stdoutText = String(stdout || '');
          const isPermissionDenied = isPermissionError(error)
            || error.code === 126
            || containsPermissionDeniedText(stderrText)
            || containsPermissionDeniedText(stdoutText);

          if (isPermissionDenied) {
            resolve({
              success: false,
              output: formatPermissionError({
                operation: 'execute the shell command',
                target: command,
                advice: 'Check that the working directory is accessible and, if this is a script or binary, verify it is executable.',
                detail: output,
              }),
            });
            return;
          }

          // Check if it was a timeout
          if (error.killed) {
            resolve({
              success: false,
              output: `Command timed out after ${timeout / 1000}s.\n${output}`.trim(),
            });
            return;
          }

          // Non-zero exit code
          const exitCode = error.code ?? 'unknown';
          resolve({
            success: false,
            output: `Command failed (exit code ${exitCode}):\n${output}`.trim(),
          });
          return;
        }

        resolve({
          success: true,
          output: output || '(no output)',
        });
      });
    }).catch((error: Error) => {
      resolve({
        success: false,
        output: `Failed to initialize login shell environment: ${error.message}`,
      });
    });
  });
}

/** Truncate output preserving head and tail if over MAX_OUTPUT_LINES */
function truncateOutput(output: string): string {
  const lines = output.split('\n');
  if (lines.length <= MAX_OUTPUT_LINES) return output;

  const head = lines.slice(0, HEAD_LINES);
  const tail = lines.slice(-TAIL_LINES);
  const omitted = lines.length - HEAD_LINES - TAIL_LINES;

  return [
    ...head,
    `\n... (${omitted} lines omitted) ...\n`,
    ...tail,
  ].join('\n');
}
