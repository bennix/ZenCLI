// ============================================================
// zen-cli  —  Auto Formatter
// ============================================================
// Automatically runs Prettier/Black/formatter after AI modifies files
// to ensure consistent code style.

import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface FormatResult {
  success: boolean;
  output: string;
  filesFormatted: number;
}

const FORMATTER_COMMANDS: Record<string, string> = {
  prettier: 'npx prettier --write',
  black: 'black',
  ruff: 'ruff format',
  gofmt: 'gofmt -w',
  rustfmt: 'cargo fmt',
  swiftformat: 'swiftformat',
  clangformat: 'clang-format -i',
};

export function detectFormatter(cwd: string): string | null {
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.prettier) return 'npx prettier --write';
    } catch { /* ignore */ }
  }

  const pyprojectPath = path.join(cwd, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      if (content.includes('black')) return 'black';
      if (content.includes('ruff')) return 'ruff format';
    } catch { /* ignore */ }
  }

  return null;
}

export async function runAutoFormat(
  command: string,
  cwd: string,
  changedFiles?: string[],
): Promise<FormatResult> {
  if (!command || !command.trim()) {
    return { success: false, output: 'No format command configured.', filesFormatted: 0 };
  }

  const targetFiles = changedFiles && changedFiles.length > 0
    ? changedFiles.map(f => `"${f}"`).join(' ')
    : '.';

  const fullCommand = `${command} ${targetFiles}`;

  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      cwd,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const output = stdout || stderr || 'Format completed successfully.';
    const filesFormatted = countFormattedFiles(output, command);

    return { success: true, output, filesFormatted };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
    const output = err.stderr || err.stdout || `Formatter failed with exit code ${err.code || 'unknown'}`;
    return { success: false, output, filesFormatted: 0 };
  }
}

function countFormattedFiles(output: string, command: string): number {
  const prettierMatch = output.match(/(\d+)\s+files?/i);
  if (prettierMatch) return parseInt(prettierMatch[1], 10);

  const blackMatch = output.match(/(\d+)\s+file.*(?:reformatted|left unchanged|failed)/gi);
  if (blackMatch) return blackMatch.length;

  const ruffMatch = output.match(/(\d+)\s+file/gi);
  if (ruffMatch) return parseInt(ruffMatch[1], 10);

  return 0;
}
