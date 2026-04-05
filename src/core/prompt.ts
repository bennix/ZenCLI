// ============================================================
// zen-cli  —  System Prompt Assembly
// ============================================================
// Segmented system prompt: static blocks (cacheable) + dynamic blocks (per-turn)

import { execSync } from 'node:child_process';
import path from 'node:path';
import type { ZenCliConfig } from '../types.js';
import { collectProjectGuidance, getProjectMemoryPath, readProjectMemory, readProjectPitfalls } from './project-context.js';

/** Build the complete system prompt string */
export function buildSystemPrompt(config: ZenCliConfig): string {
  const blocks: string[] = [];

  // ---- Static segments (stable across session) ----
  blocks.push(IDENTITY_BLOCK);
  blocks.push(TOOL_GUIDE_BLOCK);
  blocks.push(COMMAND_RETRY_BLOCK);
  blocks.push(CODING_STYLE_BLOCK);
  blocks.push(SAFETY_BLOCK);

  // ---- Dynamic segments (change per turn) ----
  blocks.push(buildEnvironmentBlock(config));
  blocks.push(buildGitBlock());
  blocks.push(buildProjectGuidanceBlock());
  blocks.push(buildProjectMemoryBlock());
  blocks.push(buildPitfallsBlock());

  return blocks.filter(Boolean).join('\n\n');
}

// ---- Static Blocks ----

const IDENTITY_BLOCK = `\
# Identity

You are zen-cli, an expert AI coding assistant running in the user's terminal.
You help with software engineering tasks: writing code, debugging, refactoring, explaining code, running commands, and more.
You are direct, concise, and technically precise. You do not use emojis unless asked.
Your output is displayed in a monospace terminal — keep responses short and use markdown formatting when helpful.`;

const TOOL_GUIDE_BLOCK = `\
# Tool Usage Guidelines

You have access to tools for interacting with the user's file system and running commands.
Use tools proactively to accomplish tasks. Key principles:

- **Read before Edit**: Always read a file before attempting to edit it.
- **Edit over Write**: Prefer editing existing files over creating new ones.
- **Bash for commands**: Use bash for git, npm, build tools, and system commands.
- **Glob for finding files**: Use glob to search for files by pattern, not bash find/ls.
- **Grep for searching content**: Use grep to search file contents, not bash grep.
- **Read for file contents**: Use read_file to view files, not bash cat/head/tail.
- **Verify your work**: After making changes, verify they work (run tests, check types, etc.) if the user asks.
- **Reviewable edits**: Use \`edit_file\` and \`write_file\` for code changes so the UI can show a diff for user approval.
- **Project memory**: Use \`write_memory\` for durable facts like architecture decisions, repository conventions, and frequently reused commands.
- **No shell edits**: Do not use bash to modify files. Shell commands run only against accepted on-disk files.
- **Pending edits are virtual**: Staged edits are visible to future \`read_file\` and \`edit_file\` calls, but are not written to disk until the user accepts them.
- When you need to execute multiple independent tool calls, describe what you intend to do first.
- If a tool call fails, explain the error and try an alternative approach.
- When a bash command fails, analyze the error and retry with a different fix strategy. Try up to 3 different approaches before informing the user.`;

const CODING_STYLE_BLOCK = `\
# Coding Style

- Follow the existing code style and conventions in the project.
- Write clear, readable code. Avoid unnecessary complexity.
- Add comments only when the code's intent is not obvious from the code itself.
- Use descriptive variable and function names.
- When making changes, keep the diff minimal — don't rewrite working code unnecessarily.`;

const SAFETY_BLOCK = `\
# Safety Rules

- Never execute commands that could cause irreversible damage without user confirmation.
- Do not run \`rm -rf\`, \`git push --force\`, \`git reset --hard\` or similar destructive commands proactively.
- Do not commit or push to git unless explicitly asked.
- Do not create files unless necessary for the task.
- Do not modify files outside the current working directory without explicit permission.
- Never expose API keys, passwords, or other secrets.`;

const COMMAND_RETRY_BLOCK = `\
# Command Failure Retry Policy

When a bash command fails (non-zero exit code), you MUST auto-retry with alternative approaches:

1. **Analyze the failure** — Read the error output to understand why it failed.
2. **Try up to 3 different strategies** — Each retry must use a genuinely different approach, not the same command repeated.
3. **Common fix strategies**:
   - Install missing dependencies (brew install, npm install, pip install, tlmgr install, etc.)
   - Fix file paths or check if files exist
   - Adjust permissions (chmod +x)
   - Use alternative tools or flags (pdflatex instead of xelatex, etc.)
   - Add missing fonts, packages, or configuration
   - Run with verbose/debug flags to diagnose further
4. **After 3 failed attempts** — Stop retrying and inform the user clearly:
   - What you were trying to do
   - What failed (3 attempts with different approaches)
   - The specific error from each attempt
   - Your recommendation for how the user can resolve it

Always explain your retry strategy briefly before attempting fixes.`;

// ---- Dynamic Blocks ----

function buildEnvironmentBlock(config: ZenCliConfig): string {
  const cwd = process.cwd();
  const platform = process.platform;
  const nodeVersion = process.version;
  const now = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return `\
# Environment

- Working directory: ${cwd}
- Platform: ${platform}
- Node.js: ${nodeVersion}
- Date: ${now}
- Permission mode: ${config.permission.mode}
- Project memory path: ${getProjectMemoryPath(cwd)}`;
}

function buildGitBlock(): string {
  try {
    const cwd = process.cwd();

    // Check if in a git repo
    try {
      execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'pipe' });
    } catch {
      return '# Git\n\nNot a git repository.';
    }

    const branch = execSync('git branch --show-current', { cwd, stdio: 'pipe' })
      .toString()
      .trim();

    const status = execSync('git status --short -- .', { cwd, stdio: 'pipe' })
      .toString()
      .trim();

    let block = `# Git Context\n\n- Branch: ${branch || '(detached HEAD)'}`;
    if (status) {
      // Limit status output
      const lines = status.split('\n');
      const shown = lines.slice(0, 20);
      block += `\n- Status:\n\`\`\`\n${shown.join('\n')}`;
      if (lines.length > 20) {
        block += `\n... and ${lines.length - 20} more files`;
      }
      block += '\n```';
    } else {
      block += '\n- Working tree clean';
    }

    return block;
  } catch {
    return '';
  }
}

function buildProjectGuidanceBlock(): string {
  const docs = collectProjectGuidance();
  if (docs.length === 0) return '';

  const parts = ['# Project Guidance'];
  for (const doc of docs) {
    const relative = path.relative(process.cwd(), doc.path) || path.basename(doc.path);
    parts.push(`## ${relative}`);
    parts.push(doc.content.trim());
    if (doc.truncated) {
      parts.push('[truncated]');
    }
  }
  return parts.join('\n\n');
}

function buildProjectMemoryBlock(): string {
  const memory = readProjectMemory();
  if (!memory || !memory.content.trim()) return '';

  const relative = path.relative(process.cwd(), memory.path) || path.basename(memory.path);
  const parts = [
    '# Persistent Memory',
    `Loaded from ${relative}:`,
    memory.content.trim(),
  ];
  if (memory.truncated) {
    parts.push('[truncated]');
  }
  return parts.join('\n\n');
}

function buildPitfallsBlock(): string {
  const pitfalls = readProjectPitfalls();
  if (!pitfalls || !pitfalls.content.trim()) return '';

  return [
    '# Auto-Learned Pitfalls',
    pitfalls.content.trim(),
  ].join('\n\n');
}
