import fs from 'node:fs';
import path from 'node:path';
import { getUserConfigDir } from '../config.js';
import type { ToolDefinition } from '../types.js';
import { findProjectRoot } from '../core/project-context.js';

export interface LoadedCustomTool {
  definition: ToolDefinition;
  commandTemplate: string;
  readOnly: boolean;
  timeoutMs?: number;
  sourcePath: string;
}

interface CustomToolManifest {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  commandTemplate: string;
  readOnly: boolean;
  timeoutMs?: number;
}

export function getCustomToolDirectories(cwd: string = process.cwd()): string[] {
  const projectRoot = findProjectRoot(cwd);
  return [
    path.join(getUserConfigDir(), 'tools'),
    path.join(projectRoot, '.zen-cli', 'tools'),
  ];
}

export function loadCustomTools(cwd: string = process.cwd()): LoadedCustomTool[] {
  const tools: LoadedCustomTool[] = [];
  const seenNames = new Set<string>();

  for (const dir of getCustomToolDirectories(cwd)) {
    if (!fs.existsSync(dir)) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

      const fullPath = path.join(dir, entry.name);
      const manifest = parseManifest(fullPath);
      if (!manifest || seenNames.has(manifest.name)) continue;

      seenNames.add(manifest.name);
      tools.push({
        definition: {
          type: 'function',
          function: {
            name: manifest.name,
            description: `${manifest.description} (custom tool from ${path.basename(fullPath)})`,
            parameters: manifest.inputSchema,
          },
        },
        commandTemplate: manifest.commandTemplate,
        readOnly: manifest.readOnly,
        timeoutMs: manifest.timeoutMs,
        sourcePath: fullPath,
      });
    }
  }

  return tools;
}

export function renderCustomToolCommand(
  template: string,
  args: Record<string, unknown>,
): { command: string; missingKeys: string[] } {
  const missingKeys: string[] = [];

  const command = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, rawKey) => {
    const key = String(rawKey || '');
    if (!Object.prototype.hasOwnProperty.call(args, key)) {
      missingKeys.push(key);
      return "''";
    }
    return shellQuote(args[key]);
  });

  return { command, missingKeys };
}

function parseManifest(filePath: string): CustomToolManifest | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    const inputSchema = (raw.inputSchema || raw.input_schema) as Record<string, unknown> | undefined;
    const commandTemplate = typeof raw.commandTemplate === 'string'
      ? raw.commandTemplate.trim()
      : (typeof raw.command === 'string' ? raw.command.trim() : '');

    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name) || !description || !commandTemplate) {
      return null;
    }

    if (!inputSchema || typeof inputSchema !== 'object') {
      return null;
    }

    return {
      name,
      description,
      inputSchema,
      commandTemplate,
      readOnly: raw.readOnly === true || raw.read_only === true,
      timeoutMs: typeof raw.timeoutMs === 'number'
        ? raw.timeoutMs
        : (typeof raw.timeout_ms === 'number' ? raw.timeout_ms : undefined),
    };
  } catch {
    return null;
  }
}

function shellQuote(value: unknown): string {
  const serialized = typeof value === 'string'
    ? value
    : JSON.stringify(value);

  const safe = String(serialized ?? '');
  return `'${safe.replace(/'/g, `'\\''`)}'`;
}
