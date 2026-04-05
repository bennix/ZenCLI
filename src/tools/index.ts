// ============================================================
// zen-cli  —  Tool Registry & Dispatcher
// ============================================================
// Central registry of all tool definitions and the executeTool dispatcher.

import path from 'node:path';
import type { BackgroundSubtaskManagerHandle, ToolDefinition, ToolResult } from '../types.js';
import { readFile } from './read.js';
import { writeFile } from './write.js';
import { editFile } from './edit.js';
import { executeBash } from './bash.js';
import { grepFiles } from './grep.js';
import { globFiles } from './glob.js';
import { webSearch } from './web-search.js';
import { webFetch } from './web-fetch.js';
import { writeMemory } from './write-memory.js';
import {
  isBackgroundSubtaskReadOnly,
  listSubtasks,
  readSubtaskOutput,
  startSubtask,
  stopSubtask,
} from './subtasks.js';
import { loadCustomTools, renderCustomToolCommand } from './custom-tools.js';
import { evaluatePermission, isSafeShellCommand } from '../core/permissions.js';
import { checkDangerousCommand, enhancePermissionSettingsWithDangerousCommands } from '../core/dangerous-command-interceptor.js';
import { checkSensitiveFile, getSensitiveFileRules } from '../core/sensitive-file-locker.js';
import { getAuditLogger } from '../core/audit-logger.js';
import { getProjectMemoryPath } from '../core/project-context.js';
import type { ZenCliConfig } from '../types.js';

type ToolKind = 'shell' | 'file' | 'network' | 'memory' | 'other';

interface RegisteredTool {
  definition: ToolDefinition;
  kind: ToolKind;
  isReadOnly: (args: Record<string, unknown>) => boolean;
  resolvePaths?: (args: Record<string, unknown>, cwd: string) => string[];
  describeCommand?: (args: Record<string, unknown>) => string | undefined;
  execute: (args: Record<string, unknown>, config: ZenCliConfig, cwd: string) => Promise<ToolResult>;
}

// ---- Tool Executor Dispatcher ----

export function getToolDefinitions(config: ZenCliConfig, cwd: string = process.cwd()): ToolDefinition[] {
  return buildRegisteredTools(config, cwd).map(tool => tool.definition);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  options: {
    config: ZenCliConfig;
    cwd?: string;
    subtaskManager?: BackgroundSubtaskManagerHandle;
  },
): Promise<ToolResult> {
  const cwd = options.cwd || process.cwd();
  const config = options.config;
  const tool = buildRegisteredTools(config, cwd, options.subtaskManager).find(item => item.definition.function.name === name);

  if (!tool) {
    return { success: false, output: `Unknown tool: ${name}` };
  }

  const command = tool.describeCommand?.(args);
  const filePaths = tool.resolvePaths?.(args, cwd) || [];

  if (config.safety.sensitiveFiles.enabled && tool.kind === 'file' && !tool.isReadOnly(args)) {
    for (const fp of filePaths) {
      const sensitiveCheck = checkSensitiveFile(fp, config.safety.sensitiveFiles.patterns);
      if (sensitiveCheck.isSensitive) {
        return { success: false, output: sensitiveCheck.reason };
      }
    }
  }

  if (config.safety.dangerousCommands.enabled && command) {
    const dangerousCheck = checkDangerousCommand(command, config.safety.dangerousCommands.extraPatterns);
    if (dangerousCheck.isDangerous) {
      return { success: false, output: dangerousCheck.reason };
    }
  }

  const effectivePermissionSettings = config.safety.dangerousCommands.enabled
    ? enhancePermissionSettingsWithDangerousCommands(config.permission, config.safety.dangerousCommands.extraPatterns)
    : config.permission;

  const sensitiveRules = config.safety.sensitiveFiles.enabled
    ? getSensitiveFileRules(config.safety.sensitiveFiles.patterns)
    : [];

  const combinedSettings: typeof config.permission = {
    ...effectivePermissionSettings,
    pathRules: [...effectivePermissionSettings.pathRules, ...sensitiveRules],
  };

  const decision = evaluatePermission(combinedSettings, {
    toolName: name,
    isReadOnly: tool.isReadOnly(args),
    kind: tool.kind,
    command,
    filePaths,
    cwd,
  });

  if (!decision.allowed) {
    return {
      success: false,
      output: decision.reason,
    };
  }

  const auditLogger = getAuditLogger();
  if (auditLogger.isEnabled() && tool.kind === 'shell' && command) {
    const result = await tool.execute(args, config, cwd);
    auditLogger.log({
      command,
      cwd,
      success: result.success,
      exitCode: result.success ? '0' : '1',
      toolName: name,
    });
    return result;
  }

  return tool.execute(args, config, cwd);
}

function buildRegisteredTools(
  config: ZenCliConfig,
  cwd: string,
  subtaskManager?: BackgroundSubtaskManagerHandle,
): RegisteredTool[] {
  const builtins: RegisteredTool[] = [
    {
      definition: {
        type: 'function',
        function: {
          name: 'read_file',
          description:
            'Read the contents of a file or list a directory. Returns file content with line numbers. ' +
            'Use offset and limit for paginated reading of large files.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The file or directory path to read (relative to working directory)',
              },
              offset: {
                type: 'number',
                description: 'Line number to start from (1-indexed, default: 1)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of lines to read (default: 2000)',
              },
            },
            required: ['path'],
          },
        },
      },
      kind: 'file',
      isReadOnly: () => true,
      resolvePaths: (args, activeCwd) => [path.resolve(activeCwd, String(args.path || '.'))],
      execute: (args) => readFile(args),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'write_file',
          description:
            'Stage content for a file change. Creates the file if it does not exist. ' +
            'The user must accept the diff before it is written to disk.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The file path to write to (relative to working directory)',
              },
              content: {
                type: 'string',
                description: 'The content to write to the file',
              },
            },
            required: ['path', 'content'],
          },
        },
      },
      kind: 'file',
      isReadOnly: () => false,
      resolvePaths: (args, activeCwd) => [path.resolve(activeCwd, String(args.path || '.'))],
      execute: (args) => writeFile(args),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'edit_file',
          description:
            'Edit a file by replacing an exact string with a new string. ' +
            'The old_string must appear EXACTLY ONCE in the file. If it appears multiple times, ' +
            'provide more surrounding context to make it unique. ' +
            'Always read the file first before editing. The resulting diff is staged for user approval.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The file path to edit (relative to working directory)',
              },
              old_string: {
                type: 'string',
                description: 'The exact string to find and replace (must be unique in the file)',
              },
              new_string: {
                type: 'string',
                description: 'The replacement string',
              },
            },
            required: ['path', 'old_string', 'new_string'],
          },
        },
      },
      kind: 'file',
      isReadOnly: () => false,
      resolvePaths: (args, activeCwd) => [path.resolve(activeCwd, String(args.path || '.'))],
      execute: (args) => editFile(args),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'bash',
          description:
            'Execute a shell command. Use for git, npm, build tools, tests, and system commands. ' +
            'Do not use bash to modify files. Commands time out after 120 seconds. Output is truncated if very long.',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The shell command to execute',
              },
              workdir: {
                type: 'string',
                description: 'Working directory for the command (default: current directory)',
              },
            },
            required: ['command'],
          },
        },
      },
      kind: 'shell',
      isReadOnly: (args) => isSafeShellCommand(String(args.command || '')),
      describeCommand: (args) => String(args.command || ''),
      resolvePaths: (args, activeCwd) => [path.resolve(activeCwd, String(args.workdir || '.'))],
      execute: (args, activeConfig) => executeBash(args, activeConfig.tools.bash.timeout),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'start_subtask',
          description:
            'Start a background shell subtask for long-running work such as dev servers, watchers, or extended tests. ' +
            'Use this instead of bash when work should continue after the current turn ends.',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'Shell command to run in the background',
              },
              name: {
                type: 'string',
                description: 'Optional short task label',
              },
              workdir: {
                type: 'string',
                description: 'Working directory for the task (default: current directory)',
              },
              timeout_seconds: {
                type: 'number',
                description: 'Optional timeout override in seconds (default: configured subtask timeout)',
              },
            },
            required: ['command'],
          },
        },
      },
      kind: 'shell',
      isReadOnly: (args) => isBackgroundSubtaskReadOnly(args.command),
      describeCommand: (args) => String(args.command || ''),
      resolvePaths: (args, activeCwd) => [path.resolve(activeCwd, String(args.workdir || '.'))],
      execute: (args, activeConfig) => startSubtask(args, subtaskManager, activeConfig.subtasks.timeoutMs),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'list_subtasks',
          description:
            'List background subtasks started earlier, including their current state, working directory, timeout, and output preview.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      kind: 'other',
      isReadOnly: () => true,
      execute: () => listSubtasks(subtaskManager),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'read_subtask_output',
          description: 'Read the latest output from a background subtask.',
          parameters: {
            type: 'object',
            properties: {
              task_id: {
                type: 'string',
                description: 'Background subtask id returned by start_subtask or list_subtasks',
              },
              max_chars: {
                type: 'number',
                description: 'Maximum number of characters to return from the tail of the output',
              },
            },
            required: ['task_id'],
          },
        },
      },
      kind: 'other',
      isReadOnly: () => true,
      execute: (args) => readSubtaskOutput(args, subtaskManager),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'stop_subtask',
          description: 'Stop a running background subtask.',
          parameters: {
            type: 'object',
            properties: {
              task_id: {
                type: 'string',
                description: 'Background subtask id returned by start_subtask or list_subtasks',
              },
            },
            required: ['task_id'],
          },
        },
      },
      kind: 'other',
      isReadOnly: () => true,
      execute: (args) => stopSubtask(args, subtaskManager),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'grep',
          description:
            'Search file contents using a regex pattern. Returns matching lines with context. ' +
            'Automatically ignores node_modules, .git, dist, and binary files.',
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Regex pattern to search for',
              },
              path: {
                type: 'string',
                description: 'Directory or file to search in (default: current directory)',
              },
              include: {
                type: 'string',
                description: 'File glob pattern to filter (e.g. "*.ts", "*.{js,jsx}")',
              },
              context_lines: {
                type: 'number',
                description: 'Number of context lines around matches (default: 2)',
              },
            },
            required: ['pattern'],
          },
        },
      },
      kind: 'file',
      isReadOnly: () => true,
      resolvePaths: (args, activeCwd) => [path.resolve(activeCwd, String(args.path || '.'))],
      execute: (args, activeConfig) => grepFiles(args, activeConfig.tools.grep.maxResults),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'glob',
          description:
            'Find files matching a glob pattern. Returns matching file paths. ' +
            'Automatically ignores node_modules, .git, dist directories.',
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.tsx")',
              },
              path: {
                type: 'string',
                description: 'Base directory to search from (default: current directory)',
              },
            },
            required: ['pattern'],
          },
        },
      },
      kind: 'file',
      isReadOnly: () => true,
      resolvePaths: (args, activeCwd) => [path.resolve(activeCwd, String(args.path || '.'))],
      execute: (args) => globFiles(args),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'web_search',
          description:
            'Search the public web and return a compact list of relevant results with titles, links, and snippets.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of results to return (default: configured limit)',
              },
            },
            required: ['query'],
          },
        },
      },
      kind: 'network',
      isReadOnly: () => true,
      execute: (args, activeConfig) => webSearch(args, activeConfig.web.searchMaxResults),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'web_fetch',
          description:
            'Fetch a webpage and return a readable text extraction for the target URL.',
          parameters: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'Absolute URL to fetch',
              },
              max_chars: {
                type: 'number',
                description: 'Maximum number of characters to return',
              },
            },
            required: ['url'],
          },
        },
      },
      kind: 'network',
      isReadOnly: () => true,
      execute: (args, activeConfig) => webFetch(args, activeConfig.web.fetchMaxChars),
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'write_memory',
          description:
            'Stage a durable project memory entry in .zen-cli/MEMORY.md. Use for stable facts such as architecture decisions, conventions, and important commands.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Short memory entry title',
              },
              content: {
                type: 'string',
                description: 'Memory content to persist',
              },
            },
            required: ['title', 'content'],
          },
        },
      },
      kind: 'memory',
      isReadOnly: () => false,
      resolvePaths: (_args, activeCwd) => [getProjectMemoryPath(activeCwd)],
      execute: (args) => writeMemory(args),
    },
  ];

  const customTools = loadCustomTools(cwd).map<RegisteredTool>(customTool => ({
    definition: customTool.definition,
    kind: 'shell',
    isReadOnly: () => customTool.readOnly,
    describeCommand: (args) => renderCustomToolCommand(customTool.commandTemplate, args).command,
    execute: async (args, activeConfig) => {
      const rendered = renderCustomToolCommand(customTool.commandTemplate, args);
      if (rendered.missingKeys.length > 0) {
        return {
          success: false,
          output: `Missing required template values for custom tool "${customTool.definition.function.name}": ${rendered.missingKeys.join(', ')}`,
        };
      }

      return executeBash(
        {
          command: rendered.command,
          workdir: cwd,
        },
        customTool.timeoutMs || activeConfig.tools.bash.timeout,
      );
    },
  }));

  return [...builtins, ...customTools];
}
