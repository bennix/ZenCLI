// ============================================================
// zen-cli  —  Auto Test Runner
// ============================================================
// Automatically runs tests after file modifications and captures
// the tail of error output so the AI knows if it broke something.

import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface TestResult {
  success: boolean;
  output: string;
  exitCode: number;
  testCount?: number;
  failureCount?: number;
}

export function detectTestCommand(cwd: string): string | null {
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const scripts = pkg.scripts || {};
      if (scripts.test) return `npm test`;
    } catch { /* ignore */ }
  }

  const pyprojectPath = path.join(cwd, 'pyproject.toml');
  const setupPath = path.join(cwd, 'setup.py');
  const testsDir = path.join(cwd, 'tests');
  const testDir = path.join(cwd, 'test');

  if (fs.existsSync(pyprojectPath) || fs.existsSync(setupPath)) {
    if (fs.existsSync(testsDir) || fs.existsSync(testDir)) {
      return 'pytest';
    }
  }

  const cargoPath = path.join(cwd, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    return 'cargo test';
  }

  const goModPath = path.join(cwd, 'go.mod');
  if (fs.existsSync(goModPath)) {
    return 'go test ./...';
  }

  return null;
}

export async function runAutoTest(
  command: string,
  cwd: string,
  maxOutputChars: number = 10000,
): Promise<TestResult> {
  if (!command || !command.trim()) {
    return { success: false, output: 'No test command configured.', exitCode: 0 };
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 120_000,
      maxBuffer: 20 * 1024 * 1024,
    });

    const combined = stdout || stderr || 'Tests passed with no output.';
    const truncated = truncateOutput(combined, maxOutputChars);
    const { testCount, failureCount } = parseTestOutput(combined);

    return {
      success: true,
      output: truncated,
      exitCode: 0,
      testCount,
      failureCount,
    };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
    const stderrContent = err.stderr || err.stdout || `Test command failed with exit code ${err.code || 'unknown'}`;
    const truncated = truncateOutput(stderrContent, maxOutputChars);
    const { testCount, failureCount } = parseTestOutput(stderrContent);

    return {
      success: false,
      output: truncated,
      exitCode: err.code || 1,
      testCount,
      failureCount,
    };
  }
}

function truncateOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;

  const tail = output.slice(-maxChars);
  const firstNewline = tail.indexOf('\n');
  const truncated = firstNewline >= 0 ? tail.slice(firstNewline + 1) : tail;

  return `[... output truncated, showing last ${maxChars} chars ...]\n\n${truncated}`;
}

function parseTestOutput(output: string): { testCount?: number; failureCount?: number } {
  const result: { testCount?: number; failureCount?: number } = {};

  const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/);
  if (jestMatch) {
    result.testCount = parseInt(jestMatch[1], 10) + parseInt(jestMatch[2], 10);
    result.failureCount = parseInt(jestMatch[2], 10);
    return result;
  }

  const pytestMatch = output.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?/);
  if (pytestMatch) {
    result.testCount = parseInt(pytestMatch[1], 10) + (pytestMatch[2] ? parseInt(pytestMatch[2], 10) : 0);
    result.failureCount = pytestMatch[2] ? parseInt(pytestMatch[2], 10) : 0;
    return result;
  }

  const cargoMatch = output.match(/(\d+)\s+passed;\s+(\d+)\s+failed/);
  if (cargoMatch) {
    result.testCount = parseInt(cargoMatch[1], 10) + parseInt(cargoMatch[2], 10);
    result.failureCount = parseInt(cargoMatch[2], 10);
    return result;
  }

  const genericMatch = output.match(/(\d+)\s+(?:tests?|test)/i);
  if (genericMatch) {
    result.testCount = parseInt(genericMatch[1], 10);
  }

  return result;
}
