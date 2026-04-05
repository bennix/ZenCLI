// ============================================================
// zen-cli  —  Auto Commit
// ============================================================
// Automatically commits changes when the AI stops, providing
// granular Git history instead of end-of-day commit dumps.

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface AutoCommitResult {
  success: boolean;
  output: string;
  commitHash?: string;
}

export async function runAutoCommit(
  messageTemplate: string,
  cwd: string,
  changedFiles?: string[],
): Promise<AutoCommitResult> {
  try {
    const { stdout: statusOut } = await execAsync('git status --porcelain', {
      cwd,
      timeout: 10_000,
    });

    if (!statusOut.trim()) {
      return { success: false, output: 'No changes to commit.' };
    }

    const message = messageTemplate
      .replace(/\{timestamp\}/g, new Date().toISOString())
      .replace(/\{date\}/g, new Date().toLocaleDateString())
      .replace(/\{time\}/g, new Date().toLocaleTimeString())
      .replace(/\{files\}/g, changedFiles ? changedFiles.join(', ') : 'multiple files')
      .replace(/\{file_count\}/g, changedFiles ? String(changedFiles.length) : 'multiple');

    const filesToStage = changedFiles && changedFiles.length > 0
      ? changedFiles.map(f => `"${f}"`).join(' ')
      : '.';

    await execAsync(`git add ${filesToStage}`, {
      cwd,
      timeout: 10_000,
    });

    const { stdout: commitOut } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd,
      timeout: 10_000,
    });

    const { stdout: hashOut } = await execAsync('git rev-parse --short HEAD', {
      cwd,
      timeout: 5_000,
    });

    return {
      success: true,
      output: commitOut.trim() || 'Committed successfully.',
      commitHash: hashOut.trim(),
    };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    const output = err.stderr || err.stdout || `Auto-commit failed with exit code ${err.code || 'unknown'}`;
    return { success: false, output };
  }
}

export function generateCommitMessage(
  template: string,
  changedFiles: string[],
  toolCallsSummary: string[],
): string {
  return template
    .replace(/\{timestamp\}/g, new Date().toISOString())
    .replace(/\{date\}/g, new Date().toLocaleDateString())
    .replace(/\{time\}/g, new Date().toLocaleTimeString())
    .replace(/\{files\}/g, changedFiles.join(', '))
    .replace(/\{file_count\}/g, String(changedFiles.length))
    .replace(/\{actions\}/g, toolCallsSummary.join('; '));
}
