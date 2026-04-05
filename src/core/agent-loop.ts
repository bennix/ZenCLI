// ============================================================
// zen-cli  —  Agent Loop (while-loop state machine)
// ============================================================
// Core agent loop: configurable max iterations per user turn.
// Each iteration: check compact → build prompt → SSE call → process response.
// Branch on finish_reason: stop → end, tool_calls → execute → next iteration.

import type {
  ChatMessage,
  AccumulatedToolCall,
  AgentLoopOptions,
  ZenCliConfig,
  SSEEvent,
  AttachedContextFile,
  ChatCompletionRequest,
  ToolDefinition,
} from '../types.js';
import { streamChatCompletion } from './sse-client.js';
import { MessageContext } from './context.js';
import { needsCompact, compactContext } from './compact.js';
import { buildSystemPrompt } from './prompt.js';
import { executeTool, getToolDefinitions } from '../tools/index.js';
import { getActiveProvider } from '../config.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pendingChanges } from './pending-changes.js';
import { hasSavedSession, listRecentSessions, loadLatestSession, loadSessionById, saveSessionSnapshot, type SessionSummary } from './session-store.js';
import { checkPRGate, isPRRelatedCommand } from './pr-test-gate.js';
import { runAutoFormat, detectFormatter } from './auto-formatter.js';
import { runAutoTest, detectTestCommand } from './auto-test-runner.js';
import { runAutoCommit } from './auto-commit.js';
import { getAuditLogger, initAuditLogger } from './audit-logger.js';
import { checkDangerousCommand } from './dangerous-command-interceptor.js';

const MAX_CONTEXT_FILES = 8;
const MAX_CONTEXT_CHARS_PER_FILE = 24_000;
const MAX_CONTEXT_TOTAL_CHARS = 72_000;
const MAX_DIRECTORY_CONTEXT_ENTRIES = 200;
const OLLAMA_WAITING_NOTICE_DELAY_MS = 2000;
const OLLAMA_COMPAT_BASE_TOOL_NAMES = ['glob', 'read_file', 'edit_file', 'write_file', 'bash'];
const OLLAMA_REDUCED_TOOL_NAMES = ['glob', 'read_file', 'bash'];
const OLLAMA_SHELL_ONLY_TOOL_NAMES = ['bash'];

interface ToolAttemptProfile {
  label: 'default' | 'compat' | 'reduced' | 'shell';
  tools?: ToolDefinition[];
}

interface StreamingProgressReporter {
  markReasoning(): void;
  markVisibleOutput(): void;
  dispose(): void;
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  const value = error as { name?: string; code?: string; message?: string };
  if (signal?.aborted) return true;
  return value?.name === 'AbortError'
    || value?.code === 'ABORT_ERR'
    || /aborted|abort/i.test(String(value?.message || ''));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Operation aborted');
  error.name = 'AbortError';
  throw error;
}

export class AgentLoop {
  private context: MessageContext;
  private config: ZenCliConfig;
  private options: AgentLoopOptions;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;

  constructor(options: AgentLoopOptions) {
    this.config = options.config;
    this.options = options;
    this.context = new MessageContext();
    initAuditLogger(this.config.safety.auditLog.enabled, this.config.safety.auditLog.logFile);
  }

  /** Process a user message through the agent loop */
  async processUserMessage(
    userMessage: string,
    contextFiles: string[] = [],
    images: Array<{ base64: string; filename: string }> = [],
    runOptions: { signal?: AbortSignal } = {},
  ): Promise<{ cancelled: boolean }> {
    const signal = runOptions.signal;
    const contextSnapshot = this.context.getMessages();
    throwIfAborted(signal);
    const normalizedMessage = userMessage.trim();
    try {
      const attachedFiles = await this.loadAttachedFiles(contextFiles);
      const composedUserMessage = this.composeUserMessage(normalizedMessage, attachedFiles);
      const provider = getActiveProvider(this.config);
      const toolCallingSupported = this.options.toolCallingSupported !== false;
      const modelSupportsCompletion = this.options.modelSupportsCompletion !== false;

      if (this.config.provider === 'ollama' && !modelSupportsCompletion) {
        this.options.onError(`OLLAMA_MODEL_NO_CHAT_SUPPORT::${provider.model}`);
        return { cancelled: false };
      }

      if (this.config.provider === 'ollama' && !toolCallingSupported) {
        this.options.onSystemMessage?.(`OLLAMA_CHAT_ONLY::${provider.model}`);
      }

      let userContent: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

      if (images.length > 0) {
        userContent = [];
        if (composedUserMessage) {
          userContent.push({ type: 'text', text: composedUserMessage });
        }
        for (const img of images) {
          userContent.push({
            type: 'image_url',
            image_url: { url: img.base64 },
          });
        }
        if (userContent.length === 0) {
          userContent = 'User attached image files for context.';
        }
      } else {
        userContent = composedUserMessage || 'Hello';
      }

      this.context.push({ role: 'user', content: userContent });

      let iteration = 0;

      while (iteration < this.config.maxIterations) {
        iteration++;
        throwIfAborted(signal);

        if (needsCompact(this.context, this.config)) {
          this.options.onContentDelta('\n[Compacting conversation history...]\n');
          await compactContext(this.context, this.config, signal);
          throwIfAborted(signal);
        }

        const messages: ChatMessage[] = [
          { role: 'system', content: buildSystemPrompt(this.config) },
          ...this.context.getMessages(),
        ];

        const allTools = toolCallingSupported
          ? getToolDefinitions(this.config, process.cwd())
          : [];
        const toolAttempts = this.buildToolAttempts(normalizedMessage, allTools, toolCallingSupported);

        let accumulatedContent: string[] = [];
        let accumulatedToolCalls: Map<number, AccumulatedToolCall> = new Map();
        let finishReason = '';

        for (let attemptIndex = 0; attemptIndex < toolAttempts.length; attemptIndex++) {
          const attempt = toolAttempts[attemptIndex];
          if (attemptIndex > 0 && this.config.provider === 'ollama') {
            this.options.onSystemMessage?.(`OLLAMA_TOOL_RETRY::${provider.model}::${attempt.label}`);
          }

          const result = await this.runStreamingAttempt(messages, provider, attempt, signal);
          if (result.error) {
            this.options.onError(result.error);
            return { cancelled: false };
          }

          accumulatedContent = result.accumulatedContent;
          accumulatedToolCalls = result.accumulatedToolCalls;
          finishReason = result.finishReason;

          if (!this.shouldRetryOllamaAttempt(result, attempt, attemptIndex, toolAttempts.length)) {
            break;
          }
        }

        throwIfAborted(signal);

        if (accumulatedContent.join('').trim().length === 0 && accumulatedToolCalls.size === 0) {
          this.options.onError(
            this.config.provider === 'ollama'
              ? `OLLAMA_EMPTY_RESPONSE::${provider.model}`
              : 'Model returned an empty response with no content and no tool calls.',
          );
          return { cancelled: false };
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: accumulatedContent.join(''),
        };

        if (accumulatedToolCalls.size > 0) {
          assistantMessage.tool_calls = Array.from(accumulatedToolCalls.values()).map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }));
        }

        this.context.push(assistantMessage);

        if (finishReason === 'tool_calls' || accumulatedToolCalls.size > 0) {
          const fileChangeToolNames = new Set(['write_file', 'edit_file', 'write_memory']);
          let hadFileChanges = false;
          const toolCallSummary: Array<{ name: string; args: Record<string, unknown> }> = [];

          for (const [, toolCall] of accumulatedToolCalls) {
            throwIfAborted(signal);
            let args: Record<string, unknown>;
            try {
              args = JSON.parse(toolCall.arguments);
            } catch {
              args = {};
            }

            toolCallSummary.push({ name: toolCall.name, args });

            if (this.config.safety.prGate.enabled && isPRRelatedCommand(toolCall.name === 'bash' ? String(args.command || '') : '')) {
              const gateResult = await checkPRGate(
                this.config.safety.prGate.testCommand,
                process.cwd(),
              );
              if (!gateResult.allowed) {
                this.options.onToolStart(toolCall.name, args);
                this.options.onToolEnd(toolCall.name, {
                  success: false,
                  output: gateResult.reason + '\n\nTest output:\n' + gateResult.testOutput,
                });
                this.context.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: gateResult.reason + '\n\nTest output:\n' + gateResult.testOutput,
                });
                continue;
              }
            }

            this.options.onToolStart(toolCall.name, args);

            const result = await executeTool(toolCall.name, args, {
              config: this.config,
              cwd: process.cwd(),
              subtaskManager: this.options.subtaskManager,
            });

            this.options.onToolEnd(toolCall.name, result);
            throwIfAborted(signal);

            if (fileChangeToolNames.has(toolCall.name) && result.success) {
              hadFileChanges = true;
            }

            this.context.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result.output,
            });
          }

          if (hadFileChanges && this.config.safety.autoFormat.enabled && this.config.safety.autoFormat.runAfterFileChanges) {
            const formatCommand = this.config.safety.autoFormat.command || detectFormatter(process.cwd());
            if (formatCommand) {
              this.options.onContentDelta('\n[Running auto-formatter...]\n');
              const formatResult = await runAutoFormat(formatCommand, process.cwd());
              if (formatResult.success) {
                this.options.onContentDelta(`Formatter: ${formatResult.filesFormatted} file(s) formatted.\n`);
              } else {
                this.options.onContentDelta(`Formatter output: ${formatResult.output}\n`);
              }
            }
          }

          if (hadFileChanges && this.config.safety.autoTest.enabled && this.config.safety.autoTest.runAfterFileChanges) {
            const testCommand = this.config.safety.autoTest.command || detectTestCommand(process.cwd());
            if (testCommand) {
              this.options.onContentDelta('\n[Running tests...]\n');
              const testResult = await runAutoTest(
                testCommand,
                process.cwd(),
                this.config.safety.autoTest.maxOutputChars,
              );
              const testSummary = testResult.testCount
                ? `Tests: ${testResult.testCount} total, ${testResult.failureCount || 0} failed.`
                : '';
              this.options.onContentDelta(`${testSummary}\n${testResult.output}\n`);
            }
          }

          continue;
        }

        break;
      }

      if (iteration >= this.config.maxIterations) {
        this.options.onContentDelta(
          `\n\n[Reached maximum iterations (${this.config.maxIterations}). Stopping.]\n`,
        );
      }

      if (this.config.safety.autoCommit.enabled && this.config.safety.autoCommit.onTurnEnd) {
        const commitResult = await runAutoCommit(
          this.config.safety.autoCommit.messageTemplate,
          process.cwd(),
        );
        if (commitResult.success) {
          this.options.onContentDelta(`\n[Auto-committed: ${commitResult.commitHash || 'done'}] ${commitResult.output}\n`);
        }
      }

      await this.persistSession();

      return { cancelled: false };
    } catch (error) {
      if (isAbortError(error, signal)) {
        this.context.replace(contextSnapshot);
        return { cancelled: true };
      }
      throw error;
    }
  }

  private async loadAttachedFiles(contextFiles: string[]): Promise<AttachedContextFile[]> {
    const uniquePaths = Array.from(new Set(contextFiles)).slice(0, MAX_CONTEXT_FILES);
    const files: AttachedContextFile[] = [];
    let totalChars = 0;

    for (const filePath of uniquePaths) {
      const resolvedPath = path.resolve(process.cwd(), filePath);
      try {
        let content = '';
        let truncated = false;
        let fromPending = false;
        let kind: AttachedContextFile['kind'] = 'file';

        const stat = await fs.stat(resolvedPath).catch(() => null);
        if (stat?.isDirectory() || (!stat && pendingChanges.hasDirectoryEntries(resolvedPath))) {
          const directoryContext = await this.loadDirectoryContext(resolvedPath, filePath);
          content = directoryContext.content;
          truncated = directoryContext.truncated;
          kind = 'directory';
        } else {
          const fileData = await pendingChanges.readFile(resolvedPath);
          const isBinary = fileData.content.includes('\0');
          if (isBinary) continue;
          content = fileData.content;
          fromPending = fileData.fromPending;
        }

        if (content.length > MAX_CONTEXT_CHARS_PER_FILE) {
          content = content.slice(0, MAX_CONTEXT_CHARS_PER_FILE);
          truncated = true;
        }

        const remainingBudget = MAX_CONTEXT_TOTAL_CHARS - totalChars;
        if (remainingBudget <= 0) break;
        if (content.length > remainingBudget) {
          content = content.slice(0, remainingBudget);
          truncated = true;
        }

        totalChars += content.length;
        files.push({
          path: filePath.replace(/\\/g, '/'),
          content,
          truncated,
          fromPending,
          kind,
        });
      } catch {
        continue;
      }
    }

    return files;
  }

  private composeUserMessage(userMessage: string, attachedFiles: AttachedContextFile[]): string {
    if (attachedFiles.length === 0) {
      return userMessage;
    }

    const parts: string[] = [];

    if (userMessage) {
      parts.push(userMessage);
    } else {
      parts.push('User attached files for context.');
    }

    parts.push('Attached context:');

    for (const file of attachedFiles) {
      const notes: string[] = [];
      if (file.truncated) notes.push('truncated');
      if (file.fromPending) notes.push('includes pending in-app edits');
      const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
      const tagName = file.kind === 'directory' ? 'directory' : 'file';

      parts.push(`\n<${tagName} path="${file.path}"${suffix}>`);
      parts.push(file.content);
      parts.push(`</${tagName}>`);
    }

    parts.push('\nUse the attached files as additional context for this turn.');
    return parts.join('\n');
  }

  /** Accumulate incremental tool call deltas into complete tool calls */
  private accumulateToolCall(
    map: Map<number, AccumulatedToolCall>,
    event: Extract<SSEEvent, { type: 'tool_call_delta' }>,
  ): void {
    const existing = map.get(event.index);
    if (!existing) {
      map.set(event.index, {
        id: event.id || `call_${event.index}`,
        name: event.name || '',
        arguments: event.arguments || '',
      });
    } else {
      if (event.id) existing.id = event.id;
      if (event.name) existing.name += event.name;
      if (event.arguments) existing.arguments += event.arguments;
    }
  }

  private buildToolAttempts(
    userMessage: string,
    allTools: ToolDefinition[],
    toolCallingSupported: boolean,
  ): ToolAttemptProfile[] {
    if (!toolCallingSupported) {
      return [{ label: 'default' }];
    }

    if (this.config.provider !== 'ollama') {
      return [{ label: 'default', tools: allTools }];
    }

    const attempts: ToolAttemptProfile[] = [
      {
        label: 'compat',
        tools: this.filterToolDefinitions(
          allTools,
          this.getOllamaCompatToolNames(userMessage),
        ),
      },
      {
        label: 'reduced',
        tools: this.filterToolDefinitions(allTools, OLLAMA_REDUCED_TOOL_NAMES),
      },
      {
        label: 'shell',
        tools: this.filterToolDefinitions(allTools, OLLAMA_SHELL_ONLY_TOOL_NAMES),
      },
    ];

    const deduped: ToolAttemptProfile[] = [];
    const seen = new Set<string>();

    for (const attempt of attempts) {
      const key = attempt.tools?.map(tool => tool.function.name).sort().join(',') || 'none';
      if (!attempt.tools || attempt.tools.length === 0 || seen.has(key)) continue;
      seen.add(key);
      deduped.push(attempt);
    }

    return deduped.length > 0 ? deduped : [{ label: 'default', tools: allTools }];
  }

  private getOllamaCompatToolNames(userMessage: string): string[] {
    const lowered = userMessage.toLowerCase();
    const toolNames = new Set<string>(OLLAMA_COMPAT_BASE_TOOL_NAMES);

    if (
      /search|find|grep|match|where|contains|查找|搜索|匹配|在哪|包含/.test(lowered)
    ) {
      toolNames.add('grep');
    }

    if (
      /https?:\/\/|website|web|internet|online|url|link|网站|网页|网络|上网|链接/.test(lowered)
    ) {
      toolNames.add('web_search');
      toolNames.add('web_fetch');
    }

    if (
      /remember|memory|persist|记录|记住|记忆|永久/.test(lowered)
    ) {
      toolNames.add('write_memory');
    }

    if (
      /background|subtask|daemon|watch|monitor|long[- ]running|后台|子任务|常驻|监听|持续运行/.test(lowered)
    ) {
      toolNames.add('start_subtask');
      toolNames.add('list_subtasks');
      toolNames.add('read_subtask_output');
      toolNames.add('stop_subtask');
    }

    return Array.from(toolNames);
  }

  private filterToolDefinitions(allTools: ToolDefinition[], allowedNames: string[]): ToolDefinition[] {
    const allowed = new Set(allowedNames);
    return allTools.filter(tool => allowed.has(tool.function.name));
  }

  private shouldRetryOllamaAttempt(
    result: {
      accumulatedContent: string[];
      accumulatedToolCalls: Map<number, AccumulatedToolCall>;
      finishReason: string;
    },
    attempt: ToolAttemptProfile,
    attemptIndex: number,
    totalAttempts: number,
  ): boolean {
    if (this.config.provider !== 'ollama') return false;
    if (!attempt.tools || attempt.tools.length === 0) return false;
    if (attemptIndex >= totalAttempts - 1) return false;
    if (result.accumulatedToolCalls.size > 0) return false;
    if (result.accumulatedContent.join('').trim().length > 0) return false;
    return result.finishReason === '' || result.finishReason === 'stop';
  }

  private createStreamingProgressReporter(
    provider: { model: string },
    attempt: ToolAttemptProfile,
  ): StreamingProgressReporter {
    if (this.config.provider !== 'ollama') {
      return {
        markReasoning() {},
        markVisibleOutput() {},
        dispose() {},
      };
    }

    let visibleOutputSeen = false;
    let waitingNoticeSent = false;
    let thinkingNoticeSent = false;
    let waitingTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (visibleOutputSeen || waitingNoticeSent) return;
      waitingNoticeSent = true;
      this.options.onSystemMessage?.(`OLLAMA_WAITING::${provider.model}::${attempt.label}`);
    }, OLLAMA_WAITING_NOTICE_DELAY_MS);

    const clearWaitingTimer = (): void => {
      if (!waitingTimer) return;
      clearTimeout(waitingTimer);
      waitingTimer = null;
    };

    return {
      markReasoning: () => {
        if (visibleOutputSeen || thinkingNoticeSent) return;
        thinkingNoticeSent = true;
        clearWaitingTimer();
        this.options.onSystemMessage?.(`OLLAMA_THINKING::${provider.model}::${attempt.label}`);
      },
      markVisibleOutput: () => {
        visibleOutputSeen = true;
        clearWaitingTimer();
      },
      dispose: () => {
        clearWaitingTimer();
      },
    };
  }

  private async runStreamingAttempt(
    messages: ChatMessage[],
    provider: { apiKey: string; baseUrl: string; model: string },
    attempt: ToolAttemptProfile,
    signal?: AbortSignal,
  ): Promise<{
    accumulatedContent: string[];
    accumulatedToolCalls: Map<number, AccumulatedToolCall>;
    finishReason: string;
    error?: string;
  }> {
    const accumulatedContent: string[] = [];
    const accumulatedToolCalls: Map<number, AccumulatedToolCall> = new Map();
    let finishReason = '';
    const progressReporter = this.createStreamingProgressReporter(provider, attempt);

    const baseRequest: ChatCompletionRequest = {
      model: provider.model,
      messages,
      stream: true,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    if (this.config.provider === 'nvidia') {
      (baseRequest as unknown as Record<string, unknown>).top_p = 0.95;
      (baseRequest as unknown as Record<string, unknown>).top_k = 20;
      (baseRequest as unknown as Record<string, unknown>).presence_penalty = 0;
      (baseRequest as unknown as Record<string, unknown>).repetition_penalty = 1;
      (baseRequest as unknown as Record<string, unknown>).chat_template_kwargs = { enable_thinking: true };
    }

    const stream = streamChatCompletion(
      attempt.tools
        ? {
            ...baseRequest,
            tools: attempt.tools,
            tool_choice: 'auto' as const,
          }
        : baseRequest,
      {
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        signal,
        siteUrl: (provider as Record<string, unknown>).siteUrl as string | undefined,
        siteName: (provider as Record<string, unknown>).siteName as string | undefined,
      },
    );

    try {
      for await (const event of stream) {
        throwIfAborted(signal);
        switch (event.type) {
          case 'reasoning_delta':
            progressReporter.markReasoning();
            this.options.onReasoningDelta?.(event.content);
            break;

          case 'content_delta':
            progressReporter.markVisibleOutput();
            accumulatedContent.push(event.content);
            this.options.onContentDelta(event.content);
            break;

          case 'tool_call_delta':
            progressReporter.markVisibleOutput();
            this.accumulateToolCall(accumulatedToolCalls, event);
            break;

          case 'finish':
            finishReason = event.reason;
            break;

          case 'usage':
            this.totalPromptTokens += event.promptTokens;
            this.totalCompletionTokens += event.completionTokens;
            this.options.onUsage(event.promptTokens, event.completionTokens);
            break;

          case 'error':
            return {
              accumulatedContent,
              accumulatedToolCalls,
              finishReason,
              error: event.error,
            };

          case 'done':
            break;
        }
      }
    } finally {
      progressReporter.dispose();
    }

    return {
      accumulatedContent,
      accumulatedToolCalls,
      finishReason,
    };
  }

  /** Get token usage statistics */
  getUsage(): { promptTokens: number; completionTokens: number } {
    return {
      promptTokens: this.totalPromptTokens,
      completionTokens: this.totalCompletionTokens,
    };
  }

  /** Clear conversation history */
  clearContext(): void {
    this.context.clear();
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
  }

  /** Force compact */
  async forceCompact(): Promise<void> {
    await compactContext(this.context, this.config);
  }

  private async loadDirectoryContext(absPath: string, displayPath: string): Promise<{ content: string; truncated: boolean }> {
    const entries = await fs.readdir(absPath, { withFileTypes: true }).catch(() => [] as Awaited<ReturnType<typeof fs.readdir>>);
    const diskEntries = entries
      .map(entry => ({
        name: String(entry.name),
        isDirectory: entry.isDirectory(),
      }))
      .filter(entry => !entry.name.startsWith('.') || entry.name === '.env')
      .map(entry => entry.isDirectory ? `${entry.name}/` : entry.name);
    const combined = pendingChanges
      .listDirectoryEntries(absPath, diskEntries)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const sorted = combined.slice(0, MAX_DIRECTORY_CONTEXT_ENTRIES);

    const content = [
      `Directory listing for ${displayPath}:`,
      ...(sorted.length > 0 ? sorted : ['(empty directory)']),
    ].join('\n');

    return {
      content,
      truncated: combined.length > sorted.length,
    };
  }

  async hasSavedSession(): Promise<boolean> {
    return hasSavedSession(process.cwd());
  }

  async listRecentSessions(limit: number = 10): Promise<SessionSummary[]> {
    return listRecentSessions(process.cwd(), limit);
  }

  async restoreLatestSession(sessionId?: string): Promise<{ restored: boolean; summary?: string; sessionId?: string }> {
    const snapshot = sessionId
      ? await loadSessionById(process.cwd(), sessionId)
      : await loadLatestSession(process.cwd());

    if (!snapshot) {
      return { restored: false };
    }

    this.context.replace(snapshot.messages);
    this.totalPromptTokens = Number(snapshot.usage?.promptTokens || 0);
    this.totalCompletionTokens = Number(snapshot.usage?.completionTokens || 0);

    return {
      restored: true,
      summary: snapshot.summary,
      sessionId: snapshot.sessionId,
    };
  }

  getContextMessages(): ChatMessage[] {
    return this.context.getMessages();
  }

  private async persistSession(): Promise<void> {
    if (!this.config.session.autoSave || this.context.length === 0) return;

    const provider = getActiveProvider(this.config);
    await saveSessionSnapshot({
      cwd: process.cwd(),
      provider: this.config.provider,
      model: provider.model,
      messages: this.context.getMessages(),
      usage: this.getUsage(),
      maxSnapshots: this.config.session.maxSnapshots,
    });
  }
}
