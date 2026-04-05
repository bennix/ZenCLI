// ============================================================
// zen-cli  —  PR Test Gate
// ============================================================
// Intercepts PR creation attempts and blocks them until all tests
// pass with a green status.

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface PRGateResult {
  allowed: boolean;
  reason: string;
  testOutput: string;
}

export async function checkPRGate(
  testCommand: string,
  cwd: string,
): Promise<PRGateResult> {
  if (!testCommand || !testCommand.trim()) {
    return {
      allowed: true,
      reason: 'No test command configured for PR gate — skipping check.',
      testOutput: '',
    };
  }

  try {
    const { stdout, stderr } = await execAsync(testCommand, {
      cwd,
      timeout: 120_000,
      maxBuffer: 20 * 1024 * 1024,
    });

    return {
      allowed: true,
      reason: 'All tests passed — PR gate cleared.',
      testOutput: stdout || stderr || 'Tests passed.',
    };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    const output = err.stderr || err.stdout || `Tests failed with exit code ${err.code || 'unknown'}`;
    const truncated = truncateTail(output, 8000);

    return {
      allowed: false,
      reason: `PR gate blocked — tests failed (exit code: ${err.code || 'unknown'}). Fix failing tests before creating a PR.`,
      testOutput: truncated,
    };
  }
}

export function isPRRelatedCommand(command: string): boolean {
  const normalized = command.toLowerCase().trim();
  return (
    normalized.includes('pull request') ||
    normalized.includes('pr create') ||
    normalized.includes('gh pr create') ||
    normalized.includes('glab mr create') ||
    normalized.includes('git request-pull') ||
    normalized.includes('hub pull-request')
  );
}

function truncateTail(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;
  const tail = output.slice(-maxChars);
  const firstNewline = tail.indexOf('\n');
  return `[... ${output.length - (firstNewline >= 0 ? firstNewline + 1 : 0)} chars omitted ...]\n\n${tail.slice(firstNewline >= 0 ? firstNewline + 1 : 0)}`;
}
