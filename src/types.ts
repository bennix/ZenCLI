// ============================================================
// zen-cli  —  Shared Type Definitions
// ============================================================

// ---- Provider types ----

export type ProviderType = 'zenmux' | 'ollama' | 'nvidia' | 'openrouter';
export type PermissionMode = 'default' | 'auto' | 'plan';

export interface ProviderInfo {
  type: ProviderType;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  available: boolean;
  contextWindow: number;
}

// ---- OpenAI-compatible API types ----

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  chat_template_kwargs?: Record<string, unknown>;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChunkChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChunkChoice {
  index: number;
  delta: {
    role?: string;
    content?: string | null;
    reasoning?: string | null;
    reasoning_content?: string | null;
    tool_calls?: ChunkToolCall[];
  };
  finish_reason: string | null;
}

export interface ChunkToolCall {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

// ---- SSE Event types ----

export type SSEEvent =
  | { type: 'content_delta'; content: string }
  | { type: 'reasoning_delta'; content: string }
  | { type: 'tool_call_delta'; index: number; id?: string; name?: string; arguments?: string }
  | { type: 'finish'; reason: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number; totalTokens: number }
  | { type: 'error'; error: string }
  | { type: 'done' };

// ---- Pending change types ----

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface PendingChangeSummary {
  path: string;
  relativePath: string;
  existed: boolean;
  addedLines: number;
  removedLines: number;
  updatedAt: number;
  hunks: DiffHunk[];
}

export interface AttachedContextFile {
  path: string;
  content: string;
  truncated: boolean;
  fromPending: boolean;
  kind?: 'file' | 'directory';
}

// ---- Tool execution types ----

export interface ToolResult {
  success: boolean;
  output: string;
  pendingChangesChanged?: boolean;
  touchedPaths?: string[];
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<ToolResult>;

export type BackgroundSubtaskStatus = 'running' | 'stopping' | 'exited' | 'timed_out';

export interface BackgroundSubtaskSummary {
  id: string;
  name: string;
  command: string;
  cwd: string;
  status: BackgroundSubtaskStatus;
  running: boolean;
  createdAt: number;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  exitSignal: string | null;
  timedOut: boolean;
  timeoutMs: number;
  lastOutputAt: number | null;
  outputPreview: string;
  outputOverflowed: boolean;
}

export interface BackgroundSubtaskOutput {
  taskId: string;
  output: string;
  truncated: boolean;
}

export interface BackgroundSubtaskManagerHandle {
  listTasks(): BackgroundSubtaskSummary[];
  startTask(options: {
    command: string;
    cwd?: string;
    name?: string;
    timeoutMs?: number;
  }): Promise<BackgroundSubtaskSummary>;
  stopTask(taskId: string): boolean;
  getTask(taskId: string): BackgroundSubtaskSummary | null;
  getTaskOutput(taskId: string, maxChars?: number): BackgroundSubtaskOutput | null;
  closeAllTasks(): void;
}

// ---- Config types ----

export interface ZenCliConfig {
  // Active provider
  provider: ProviderType;

  // ZenMux provider
  apiKey: string;
  baseUrl: string;
  model: string;
  savedModels: {
    zenmux: string[];
    nvidia: string[];
  };

  // Ollama provider
  ollama: {
    baseUrl: string;
    model: string;
    showReasoning: boolean;
  };

  // Nvidia provider
  nvidia: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };

  // OpenRouter provider
  openrouter: {
    apiKey: string;
    baseUrl: string;
    model: string;
    siteUrl: string;
    siteName: string;
  };

  // General settings
  maxTokens: number;
  contextWindow: number;
  temperature: number;
  maxIterations: number;
  permission: PermissionSettings;
  session: SessionSettings;
  web: {
    searchMaxResults: number;
    fetchMaxChars: number;
  };
  subtasks: {
    timeoutMs: number;
  };
  tools: {
    bash: { timeout: number };
    read: { maxLines: number };
    grep: { maxResults: number };
  };
  safety: SafetySettings;
}

export interface PermissionPathRule {
  pattern: string;
  allow: boolean;
}

export interface PermissionSettings {
  mode: PermissionMode;
  pathRules: PermissionPathRule[];
  deniedCommands: string[];
  allowedTools: string[];
  deniedTools: string[];
}

export interface SessionSettings {
  autoSave: boolean;
  autoResume: boolean;
  maxSnapshots: number;
}

export interface SafetySettings {
  auditLog: {
    enabled: boolean;
    logFile?: string;
  };
  dangerousCommands: {
    enabled: boolean;
    extraPatterns: string[];
  };
  sensitiveFiles: {
    enabled: boolean;
    patterns: string[];
  };
  autoFormat: {
    enabled: boolean;
    command: string;
    runAfterFileChanges: boolean;
  };
  autoTest: {
    enabled: boolean;
    command: string;
    runAfterFileChanges: boolean;
    maxOutputChars: number;
  };
  prGate: {
    enabled: boolean;
    testCommand: string;
  };
  autoCommit: {
    enabled: boolean;
    messageTemplate: string;
    onTurnEnd: boolean;
  };
}

// ---- Agent Loop types ----

export interface AgentLoopOptions {
  config: ZenCliConfig;
  onContentDelta: (text: string) => void;
  onReasoningDelta?: (text: string) => void;
  onToolStart: (name: string, args: Record<string, unknown>) => void;
  onToolEnd: (name: string, result: ToolResult) => void;
  onSystemMessage?: (message: string) => void;
  onError: (error: string) => void;
  onUsage: (promptTokens: number, completionTokens: number) => void;
  modelSupportsCompletion?: boolean;
  toolCallingSupported?: boolean;
  subtaskManager?: BackgroundSubtaskManagerHandle;
}

// ---- Accumulated tool call from streaming ----

export interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
}
