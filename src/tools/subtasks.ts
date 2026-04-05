import { pendingChanges } from '../core/pending-changes.js';
import { isSafeShellCommand } from '../core/permissions.js';
import type { BackgroundSubtaskManagerHandle, BackgroundSubtaskSummary, ToolResult } from '../types.js';

export async function startSubtask(
  args: Record<string, unknown>,
  manager?: BackgroundSubtaskManagerHandle,
  defaultTimeoutMs = 3_600_000,
): Promise<ToolResult> {
  if (!manager) {
    return {
      success: false,
      output: 'Background subtasks are not available in this runtime.',
    };
  }

  const command = String(args.command || '').trim();
  if (!command) {
    return {
      success: false,
      output: 'Error: "command" parameter is required.',
    };
  }

  if (pendingChanges.hasPendingChanges()) {
    return {
      success: false,
      output:
        'Background subtasks are blocked because there are staged file changes waiting for user approval. ' +
        'Ask the user to accept or reject the pending diff first so the task runs against the correct files.',
    };
  }

  const timeoutSeconds = Number(args.timeout_seconds);
  const timeoutMs = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
    ? Math.floor(timeoutSeconds * 1000)
    : defaultTimeoutMs;

  try {
    const task = await manager.startTask({
      command,
      cwd: typeof args.workdir === 'string' ? args.workdir : undefined,
      name: typeof args.name === 'string' ? args.name : undefined,
      timeoutMs,
    });

    return {
      success: true,
      output: [
        `Started background subtask ${task.id}.`,
        `Name: ${task.name}`,
        `Timeout: ${Math.round(task.timeoutMs / 1000)}s`,
        `CWD: ${task.cwd}`,
        `Command: ${task.command}`,
        'Use list_subtasks to inspect status and read_subtask_output to check logs.',
      ].join('\n'),
    };
  } catch (error) {
    return {
      success: false,
      output: (error as Error).message,
    };
  }
}

export async function listSubtasks(manager?: BackgroundSubtaskManagerHandle): Promise<ToolResult> {
  if (!manager) {
    return {
      success: false,
      output: 'Background subtasks are not available in this runtime.',
    };
  }

  const tasks = manager.listTasks();
  if (tasks.length === 0) {
    return {
      success: true,
      output: 'No background subtasks.',
    };
  }

  return {
    success: true,
    output: tasks.map(formatTaskSummary).join('\n\n'),
  };
}

export async function readSubtaskOutput(
  args: Record<string, unknown>,
  manager?: BackgroundSubtaskManagerHandle,
): Promise<ToolResult> {
  if (!manager) {
    return {
      success: false,
      output: 'Background subtasks are not available in this runtime.',
    };
  }

  const taskId = String(args.task_id || '').trim();
  if (!taskId) {
    return {
      success: false,
      output: 'Error: "task_id" parameter is required.',
    };
  }

  const maxChars = Number(args.max_chars);
  const output = manager.getTaskOutput(
    taskId,
    Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : undefined,
  );
  const summary = manager.getTask(taskId);

  if (!output || !summary) {
    return {
      success: false,
      output: `Background subtask not found: ${taskId}`,
    };
  }

  return {
    success: true,
    output: [
      formatTaskSummary(summary),
      '',
      output.output || '(no output yet)',
    ].join('\n'),
  };
}

export async function stopSubtask(
  args: Record<string, unknown>,
  manager?: BackgroundSubtaskManagerHandle,
): Promise<ToolResult> {
  if (!manager) {
    return {
      success: false,
      output: 'Background subtasks are not available in this runtime.',
    };
  }

  const taskId = String(args.task_id || '').trim();
  if (!taskId) {
    return {
      success: false,
      output: 'Error: "task_id" parameter is required.',
    };
  }

  const summary = manager.getTask(taskId);
  if (!summary) {
    return {
      success: false,
      output: `Background subtask not found: ${taskId}`,
    };
  }

  const stopped = manager.stopTask(taskId);
  if (!stopped) {
    return {
      success: false,
      output: `Background subtask is already finished: ${taskId}`,
    };
  }

  return {
    success: true,
    output: `Stop signal sent to background subtask ${taskId} (${summary.name}).`,
  };
}

export function isBackgroundSubtaskReadOnly(command: unknown): boolean {
  return isSafeShellCommand(String(command || ''));
}

function formatTaskSummary(task: BackgroundSubtaskSummary): string {
  const status = task.status === 'timed_out'
    ? 'timed_out'
    : task.status;

  return [
    `${task.id} [${status}] ${task.name}`,
    `cwd: ${task.cwd}`,
    `timeout: ${Math.round(task.timeoutMs / 1000)}s`,
    `command: ${task.command}`,
    task.outputPreview ? `preview: ${task.outputPreview}` : '',
  ].filter(Boolean).join('\n');
}
