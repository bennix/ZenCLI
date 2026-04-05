// ============================================================
// zen-cli  —  Web Server (HTTP + SSE)
// ============================================================
// Serves the IDE-style chat UI with file browser and code editor.
// APIs: chat, providers, file system (list/read/write/open-folder).

import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHtmlPage } from './web-page.js';
import { AgentLoop } from '../core/agent-loop.js';
import { detectProviders, switchProvider } from '../core/provider.js';
import { getActiveProvider, saveUserConfig, getUserConfigPath, loadConfig } from '../config.js';
import type { BackgroundSubtaskSummary, ZenCliConfig, ProviderInfo } from '../types.js';
import { pendingChanges } from '../core/pending-changes.js';
import { TerminalManager, type PythonInterpreterInfo, type TerminalSessionSummary } from './terminal-manager.js';
import { formatPermissionError, isPermissionError } from '../core/permission-errors.js';
import { getProjectMemoryPath } from '../core/project-context.js';
import { parsePathRules, parseStringList, serializePathRules, serializeStringList } from '../core/permissions.js';
import { getCustomToolDirectories } from '../tools/custom-tools.js';
import { derivePitfallFromFailure, getProjectPitfallsPath, recordPitfall } from '../core/pitfalls.js';
import { exportMemoryBundle, importMemoryBundle, resetManagedMemory } from '../core/memory-bundle.js';
import { SubtaskManager } from '../core/subtask-manager.js';

// Resolve vendor directory: try multiple locations
function resolveVendorDir(): string {
  const candidates = [
    // From project root (dev: npm run dev / cwd is project root)
    path.resolve(process.cwd(), 'vendor'),
    // Relative to this file (dist/ui/ -> ../../vendor)
    path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'vendor'),
    // Electron packaged app: next to app.asar
    path.resolve(process.resourcesPath || '', 'vendor'),
  ];
  for (const dir of candidates) {
    if (fsSync.existsSync(dir)) return dir;
  }
  return candidates[0]; // fallback
}
const VENDOR_DIR = resolveVendorDir();

function resolveNodeModulesDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'node_modules'),
    path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'node_modules'),
    path.resolve(process.resourcesPath || '', 'app', 'node_modules'),
    path.resolve(process.resourcesPath || '', 'node_modules'),
  ];
  for (const dir of candidates) {
    if (fsSync.existsSync(dir)) return dir;
  }
  return candidates[0];
}
const NODE_MODULES_DIR = resolveNodeModulesDir();

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

const PREVIEW_FILE_MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

type PreviewKind = 'image' | 'pdf';

interface ServerEvent {
  type:
    | 'content'
    | 'reasoning'
    | 'system'
    | 'tool_start'
    | 'tool_end'
    | 'error'
    | 'usage'
    | 'done'
    | 'provider_changed'
    | 'ollama_pull_progress'
    | 'ollama_pull_done'
    | 'pending_changes_updated'
    | 'folder_changed'
    | 'terminal_output'
    | 'terminal_exit'
    | 'subtask_updated'
    | 'subtask_output';
  data: unknown;
}

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileEntry[];
}

interface SearchableFileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
  lowerPath: string;
  lowerName: string;
}

interface OllamaModelCapabilities {
  capabilities: string[];
  supportsCompletion: boolean;
  supportsTools: boolean;
}

// Directories to skip when listing files
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.cache', '.vscode', '.idea', 'coverage', '.nyc_output',
]);
const SEARCH_CACHE_TTL_MS = 10_000;
const SEARCH_MAX_DEPTH = 6;
const SEARCH_MAX_FILES = 8_000;
const MAX_CHAT_IMAGES = 5;

function getInitialWorkingDir(): string {
  const cwd = process.cwd();
  const home = os.homedir();

  if (!cwd) return home;

  // Finder-launched macOS apps often start from "/" or inside the app bundle.
  if (cwd === '/' || cwd.includes('.app/Contents/') || cwd.startsWith('/Applications/')) {
    return home;
  }

  return cwd;
}

export class WebServer {
  private config: ZenCliConfig;
  private agent: AgentLoop;
  private sseClients: Set<http.ServerResponse> = new Set();
  private server: http.Server;
  private providers: ProviderInfo[] = [];
  private activeProvider: ProviderInfo | null = null;
  private workingDir: string = getInitialWorkingDir();
  private searchFileCacheRoot = '';
  private searchFileCacheAt = 0;
  private searchFileCache: SearchableFileEntry[] = [];
  private searchFileCachePromise: Promise<SearchableFileEntry[]> | null = null;
  private ollamaCapabilitiesCache: Map<string, OllamaModelCapabilities> = new Map();
  private activeOllamaCapabilities: OllamaModelCapabilities | null = null;
  private terminalManager: TerminalManager;
  private subtaskManager: SubtaskManager;
  private currentChatAbortController: AbortController | null = null;
  private onWindowAction: ((action: 'minimize' | 'maximize' | 'close' | 'toggle-maximize') => void) | null = null;

  setWindowActionHandler(handler: (action: 'minimize' | 'maximize' | 'close' | 'toggle-maximize') => void): void {
    this.onWindowAction = handler;
  }

  constructor(config: ZenCliConfig) {
    this.config = config;
    this.agent = this.createAgent();
    this.terminalManager = new TerminalManager({
      getWorkingDir: () => this.workingDir,
      onOutput: (sessionId, chunk) => {
        this.broadcastRaw({ type: 'terminal_output', data: { sessionId, chunk } });
      },
      onExit: (sessionId, exitCode, signal) => {
        this.broadcastRaw({ type: 'terminal_exit', data: { sessionId, exitCode, signal } });
      },
    });
    this.subtaskManager = new SubtaskManager({
      getWorkingDir: () => this.workingDir,
      getDefaultTimeoutMs: () => this.config.subtasks.timeoutMs,
      onTaskUpdate: (task) => {
        this.broadcastRaw({ type: 'subtask_updated', data: { task } });
      },
      onTaskOutput: (taskId, chunk, preview) => {
        this.broadcastRaw({ type: 'subtask_output', data: { taskId, chunk, preview } });
      },
    });
    process.chdir(this.workingDir);
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  private createAgent(): AgentLoop {
    return new AgentLoop({
      config: this.config,
      onContentDelta: (text) => this.broadcast({ type: 'content', data: { text } }),
      onReasoningDelta: (text) => this.broadcast({ type: 'reasoning', data: { text } }),
      onToolStart: (name, args) => this.broadcast({ type: 'tool_start', data: { name, args } }),
      onToolEnd: (name, result) => {
        this.broadcast({ type: 'tool_end', data: { name, ...result } });
        if (!result.success) {
          void this.recordPitfallFromFailure({ source: 'tool', toolName: name, message: result.output });
        }
        if (result.pendingChangesChanged) {
          this.broadcastPendingChanges();
        }
      },
      onSystemMessage: (message) => this.broadcast({ type: 'system', data: { message } }),
      onError: (error) => {
        this.broadcast({ type: 'error', data: { error } });
        void this.recordPitfallFromFailure({ source: 'error', message: error });
      },
      onUsage: (p, c) => this.broadcast({ type: 'usage', data: { promptTokens: p, completionTokens: c } }),
      modelSupportsCompletion: this.getCurrentModelSupportsCompletion(),
      toolCallingSupported: this.getCurrentToolCallingSupport(),
      subtaskManager: this.subtaskManager,
    });
  }

  async start(port: number = 3456): Promise<{ providers: ProviderInfo[]; active: ProviderInfo }> {
    const detection = await detectProviders(this.config);
    this.providers = detection.providers;
    this.activeProvider = detection.active;
    switchProvider(this.config, detection.active);
    await this.refreshActiveOllamaCapabilities();
    this.agent = this.createAgent();

    return await new Promise((resolve, reject) => {
      const cleanup = (): void => {
        this.server.off('error', onError);
        this.server.off('listening', onListening);
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const onListening = (): void => {
        cleanup();
        resolve({ providers: this.providers, active: detection.active });
      };

      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(port, '127.0.0.1');
    });
  }

  async stop(): Promise<void> {
    this.currentChatAbortController?.abort();
    this.terminalManager.closeAllSessions();
    this.subtaskManager.closeAllTasks();

    if (!this.server.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private getCurrentModelSupportsCompletion(): boolean {
    return this.config.provider !== 'ollama' || this.activeOllamaCapabilities?.supportsCompletion !== false;
  }

  private getCurrentToolCallingSupport(): boolean {
    return this.config.provider !== 'ollama' || this.activeOllamaCapabilities?.supportsTools !== false;
  }

  private maskApiKey(apiKey: string): string {
    if (!apiKey) return '';
    if (apiKey.length <= 14) return `${apiKey.slice(0, 4)}...${apiKey.slice(-2)}`;
    return `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`;
  }

  private sanitizeApiKey(value: unknown): string {
    const raw = typeof value === 'string' ? value.trim() : '';
    return raw.replace(/[^\x20-\x7E]/g, '');
  }

  private normalizeTextField(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private mergeSavedModelHistory(existing: string[] | undefined, ...preferredModels: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    const append = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) append(item);
        return;
      }
      const normalized = typeof value === 'string' ? value.trim() : '';
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(normalized);
    };

    for (const model of preferredModels) append(model);
    append(existing || []);
    return result.slice(0, 50);
  }

  private buildSavedModelsUpdate(
    provider: 'zenmux' | 'nvidia',
    model: string,
  ): ZenCliConfig['savedModels'] {
    return {
      zenmux: provider === 'zenmux'
        ? this.mergeSavedModelHistory(this.config.savedModels.zenmux, model, this.config.model)
        : this.mergeSavedModelHistory(this.config.savedModels.zenmux, this.config.model),
      nvidia: provider === 'nvidia'
        ? this.mergeSavedModelHistory(this.config.savedModels.nvidia, model, this.config.nvidia.model)
        : this.mergeSavedModelHistory(this.config.savedModels.nvidia, this.config.nvidia.model),
    };
  }

  private getStoredProviderApiKey(provider: 'zenmux' | 'nvidia' | 'openrouter'): string {
    if (provider === 'nvidia') return this.config.nvidia.apiKey || this.config.apiKey || '';
    if (provider === 'openrouter') return this.config.openrouter.apiKey || '';
    return this.config.apiKey || '';
  }

  private async persistConfigUpdates(updates: Partial<ZenCliConfig>): Promise<void> {
    saveUserConfig(updates);
    this.config = loadConfig();

    const detection = await detectProviders(this.config);
    this.providers = detection.providers;
    this.activeProvider = detection.active;
    switchProvider(this.config, detection.active);
    await this.refreshActiveOllamaCapabilities();

    this.agent.clearContext();
    this.agent = this.createAgent();

    this.broadcast({
      type: 'provider_changed',
      data: { provider: this.config.provider, model: getActiveProvider(this.config).model, name: this.config.provider },
    });
  }

  private async testRemoteModelConnection(options: {
    provider: 'zenmux' | 'nvidia' | 'openrouter';
    baseUrl: string;
    apiKey: string;
    model: string;
  }): Promise<void> {
    const url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const payload: Record<string, unknown> = {
      model: options.model,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 8,
      temperature: 0,
      stream: false,
    };

    if (options.provider === 'nvidia') {
      payload.chat_template_kwargs = { enable_thinking: true };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    };
    if (options.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://github.com/zhipingxu/zen-cli';
      headers['X-OpenRouter-Title'] = 'zen-cli';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const detail = errorBody.trim().replace(/\s+/g, ' ').slice(0, 240);
      throw new Error(detail
        ? `${response.status} ${response.statusText}: ${detail}`
        : `${response.status} ${response.statusText}`);
    }
  }

  private async refreshActiveOllamaCapabilities(): Promise<void> {
    if (this.config.provider !== 'ollama') {
      this.activeOllamaCapabilities = null;
      return;
    }

    this.activeOllamaCapabilities = await this.getOllamaModelCapabilities(this.config.ollama.model);
  }

  private async getOllamaModelCapabilities(model: string): Promise<OllamaModelCapabilities> {
    const normalizedModel = String(model || '').trim();
    const cacheKey = `${this.getOllamaNativeUrl()}::${normalizedModel}`;
    if (!normalizedModel) {
      return {
        capabilities: [],
        supportsCompletion: true,
        supportsTools: true,
      };
    }

    const cached = this.ollamaCapabilitiesCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(`${this.getOllamaNativeUrl()}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizedModel }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Ollama /api/show failed: ${response.status}`);
      }

      const data = await response.json() as { capabilities?: string[] };
      const capabilities = Array.isArray(data.capabilities)
        ? data.capabilities.filter((value): value is string => typeof value === 'string')
        : [];

      const normalizedCapabilities = capabilities.map(value => value.toLowerCase());
      const info: OllamaModelCapabilities = {
        capabilities,
        supportsCompletion: normalizedCapabilities.includes('completion'),
        supportsTools: normalizedCapabilities.includes('tools'),
      };
      this.ollamaCapabilitiesCache.set(cacheKey, info);
      return info;
    } catch {
      const fallback: OllamaModelCapabilities = {
        capabilities: [],
        supportsCompletion: true,
        supportsTools: true,
      };
      this.ollamaCapabilitiesCache.set(cacheKey, fallback);
      return fallback;
    }
  }

  // ==================== Router ====================

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    try {
      // Static
      if (url.pathname === '/' && req.method === 'GET') return this.serveHtml(res);
      if (url.pathname.startsWith('/vendor/') && req.method === 'GET') return this.serveVendorFile(url.pathname, res);
      if (url.pathname.startsWith('/modules/') && req.method === 'GET') return this.serveNodeModuleFile(url.pathname, res);

      // SSE
      if (url.pathname === '/api/stream' && req.method === 'GET') return await this.handleSSE(res);

      // Chat
      if (url.pathname === '/api/chat' && req.method === 'POST') return await this.handleChat(req, res);
      if (url.pathname === '/api/chat/cancel' && req.method === 'POST') return this.handleCancelChat(res);
      if (url.pathname === '/api/command' && req.method === 'POST') return await this.handleCommand(req, res);

      // Providers
      if (url.pathname === '/api/providers' && req.method === 'GET') return this.handleGetProviders(res);
      if (url.pathname === '/api/providers/switch' && req.method === 'POST') return await this.handleSwitchProvider(req, res);
      if (url.pathname === '/api/providers/refresh' && req.method === 'POST') return await this.handleRefreshProviders(res);

      // File System
      if (url.pathname === '/api/files/search' && req.method === 'GET') return await this.handleSearchFiles(url, res);
      if (url.pathname === '/api/files' && req.method === 'GET') return await this.handleListFiles(url, res);
      if (url.pathname === '/api/file' && req.method === 'GET') return await this.handleReadFile(url, res);
      if (url.pathname === '/api/file/raw' && req.method === 'GET') return await this.handleServeRawFile(url, res);
      if (url.pathname === '/api/file' && req.method === 'PUT') return await this.handleWriteFile(req, res);
      if (url.pathname === '/api/file/delete' && req.method === 'POST') return await this.handleDeleteEntry(req, res);
      if (url.pathname === '/api/memory/export' && req.method === 'GET') return await this.handleExportMemoryBundle(res);
      if (url.pathname === '/api/memory/import' && req.method === 'POST') return await this.handleImportMemoryBundle(req, res);
      if (url.pathname === '/api/memory/reset' && req.method === 'POST') return await this.handleResetMemoryBundle(res);
      if (url.pathname === '/api/python/interpreter' && req.method === 'GET') return await this.handlePythonInterpreter(url, res);
      if (url.pathname === '/api/python/run' && req.method === 'POST') return await this.handleRunPython(req, res);
      if (url.pathname === '/api/terminal/sessions' && req.method === 'GET') return this.handleTerminalSessions(res);
      if (url.pathname === '/api/terminal/create' && req.method === 'POST') return await this.handleCreateTerminal(req, res);
      if (url.pathname === '/api/terminal/input' && req.method === 'POST') return await this.handleTerminalInput(req, res);
      if (url.pathname === '/api/terminal/resize' && req.method === 'POST') return await this.handleTerminalResize(req, res);
      if (url.pathname === '/api/terminal/close' && req.method === 'POST') return await this.handleCloseTerminal(req, res);
      if (url.pathname === '/api/subtasks' && req.method === 'GET') return this.handleSubtasks(res);
      if (url.pathname === '/api/subtasks/create' && req.method === 'POST') return await this.handleCreateSubtask(req, res);
      if (url.pathname === '/api/subtasks/stop' && req.method === 'POST') return await this.handleStopSubtask(req, res);
      if (url.pathname === '/api/dialog/open-folder' && req.method === 'POST') return await this.handlePickFolderDialog(res, 'open');
      if (url.pathname === '/api/dialog/create-folder' && req.method === 'POST') return await this.handlePickFolderDialog(res, 'create');
      if (url.pathname === '/api/folder/open' && req.method === 'POST') return await this.handleOpenFolder(req, res);
      if (url.pathname === '/api/folder/open-in-finder' && req.method === 'POST') return await this.handleOpenInFinder(res);
      if (url.pathname === '/api/folder/create' && req.method === 'POST') return await this.handleCreateFolder(req, res);
      if (url.pathname === '/api/folder/create-in' && req.method === 'POST') return await this.handleCreateFolderIn(req, res);
      if (url.pathname === '/api/folder/current' && req.method === 'GET') return this.handleCurrentFolder(res);
      if (url.pathname === '/api/pending-changes' && req.method === 'GET') return this.handlePendingChanges(res);
      if (url.pathname === '/api/pending-changes/accept' && req.method === 'POST') return await this.handleAcceptPendingChanges(req, res);
      if (url.pathname === '/api/pending-changes/reject' && req.method === 'POST') return await this.handleRejectPendingChanges(req, res);

      // Window control
      if (url.pathname === '/api/window/toggle-maximize' && req.method === 'POST') return await this.handleToggleMaximize(res);
      if (url.pathname === '/api/window/minimize' && req.method === 'POST') return await this.handleMinimizeWindow(res);
      if (url.pathname === '/api/window/close' && req.method === 'POST') return await this.handleCloseAppWindow(res);

      // Config
      if (url.pathname === '/api/config' && req.method === 'GET') {
        const p = getActiveProvider(this.config);
        this.jsonResponse(res, 200, { provider: this.config.provider, model: p.model, baseUrl: p.baseUrl });
        return;
      }

      // Settings
      if (url.pathname === '/api/settings' && req.method === 'GET') return this.handleGetSettings(res);
      if (url.pathname === '/api/settings' && req.method === 'PUT') return await this.handleSaveSettings(req, res);
      if (url.pathname === '/api/settings/test' && req.method === 'POST') return await this.handleTestConnection(req, res);

      // Ollama model management
      if (url.pathname === '/api/ollama/models' && req.method === 'GET') return await this.handleOllamaModels(res);
      if (url.pathname === '/api/ollama/pull' && req.method === 'POST') return await this.handleOllamaPull(req, res);
      if (url.pathname === '/api/ollama/delete' && req.method === 'POST') return await this.handleOllamaDelete(req, res);

      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found');
    } catch (err) {
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  // ==================== HTML ====================

  private serveHtml(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getHtmlPage());
  }

  /** Serve static files from vendor/ directory */
  private serveVendorFile(pathname: string, res: http.ServerResponse): void {
    // pathname is like /vendor/hljs/highlight.min.js
    // Strip leading /vendor/ and resolve against VENDOR_DIR
    const relPath = pathname.replace(/^\/vendor\//, '');
    const filePath = path.join(VENDOR_DIR, relPath);

    // Security: ensure resolved path is under VENDOR_DIR
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(VENDOR_DIR)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    try {
      const content = fsSync.readFileSync(resolved);
      const ext = path.extname(resolved);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.end(content);
    } catch {
      res.writeHead(404); res.end('Not Found');
    }
  }

  /** Serve packaged production dependencies needed by the UI (xterm, katex, etc.) */
  private serveNodeModuleFile(pathname: string, res: http.ServerResponse): void {
    const relPath = pathname.replace(/^\/modules\//, '');
    const filePath = path.join(NODE_MODULES_DIR, relPath);
    const resolved = path.resolve(filePath);

    if (!resolved.startsWith(NODE_MODULES_DIR)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    try {
      const content = fsSync.readFileSync(resolved);
      const ext = path.extname(resolved);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.end(content);
    } catch {
      res.writeHead(404); res.end('Not Found');
    }
  }

  // ==================== SSE ====================

  private async handleSSE(res: http.ServerResponse): Promise<void> {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const provider = getActiveProvider(this.config);
    const savedSessionAvailable = await this.agent.hasSavedSession();
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      data: {
        provider: this.config.provider,
        model: provider.model,
        providers: this.providers,
        workingDir: this.workingDir,
        pendingChangeCount: pendingChanges.list(this.workingDir).length,
        savedSessionAvailable,
        permissionMode: this.config.permission.mode,
        showOllamaReasoning: this.config.ollama.showReasoning === true,
      },
    })}\n\n`);
    this.sseClients.add(res);
    reqCleanup(res, () => { this.sseClients.delete(res); });
  }

  // ==================== Chat ====================

  private async handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (this.currentChatAbortController) {
      this.jsonResponse(res, 409, { error: 'A chat request is already in progress' });
      return;
    }

    const body = await this.parseJson(req) as { message?: string; contextFiles?: string[]; images?: Array<{ base64: string; filename: string }>; permissionMode?: string };
    const message = body.message || '';
    const contextFiles = this.sanitizeContextFiles(body.contextFiles);
    const requestedImages = Array.isArray(body.images) ? body.images : [];
    if (requestedImages.length > MAX_CHAT_IMAGES) {
      this.jsonResponse(res, 400, { error: `A maximum of ${MAX_CHAT_IMAGES} images is supported per message` });
      return;
    }
    const images = this.sanitizeImages(requestedImages);

    if (!message.trim() && contextFiles.length === 0 && images.length === 0) {
      this.jsonResponse(res, 400, { error: 'Empty message' });
      return;
    }

    const originalPermissionMode = this.config.permission.mode;
    if (body.permissionMode && (body.permissionMode === 'default' || body.permissionMode === 'auto' || body.permissionMode === 'plan')) {
      this.config.permission.mode = body.permissionMode as ZenCliConfig['permission']['mode'];
    }

    const abortController = new AbortController();
    this.currentChatAbortController = abortController;
    this.jsonResponse(res, 200, { status: 'ok' });
    try {
      const result = await this.agent.processUserMessage(message, contextFiles, images, {
        signal: abortController.signal,
      });
      if (result.cancelled) {
        this.broadcast({ type: 'system', data: { message: 'CHAT_CANCELLED' } });
      }
      this.broadcast({ type: 'done', data: {} });
    } catch (err) {
      this.broadcast({ type: 'error', data: { error: (err as Error).message } });
    } finally {
      this.config.permission.mode = originalPermissionMode;
      if (this.currentChatAbortController === abortController) {
        this.currentChatAbortController = null;
      }
    }
  }

  private handleCancelChat(res: http.ServerResponse): void {
    if (!this.currentChatAbortController) {
      this.jsonResponse(res, 200, { success: false, active: false });
      return;
    }

    this.currentChatAbortController.abort();
    this.jsonResponse(res, 200, { success: true, active: true });
  }

  private async handleCommand(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { command } = await this.parseJson(req) as { command: string };
    const rawCommand = String(command || '').trim();
    const spaceIndex = rawCommand.indexOf(' ');
    const baseCommand = spaceIndex === -1 ? rawCommand : rawCommand.slice(0, spaceIndex);
    const argText = spaceIndex === -1 ? '' : rawCommand.slice(spaceIndex + 1).trim();

    let result = '';
    let messages: unknown[] | undefined;

    switch (baseCommand) {
      case '/help':
        result = [
          'Available commands:',
          '/help',
          '/clear',
          '/compact',
          '/usage',
          '/sessions',
          '/resume [session-id]',
        ].join('\n');
        break;
      case '/clear':
        this.agent.clearContext();
        result = 'Conversation cleared.';
        break;
      case '/compact':
        await this.agent.forceCompact();
        result = 'Conversation compacted.';
        break;
      case '/usage': {
        const u = this.agent.getUsage();
        result = `Prompt: ${u.promptTokens} | Completion: ${u.completionTokens} | Total: ${u.promptTokens + u.completionTokens}`;
        break;
      }
      case '/sessions': {
        const sessions = await this.agent.listRecentSessions(10);
        result = sessions.length === 0
          ? 'No saved sessions for this workspace.'
          : sessions.map((session, index) => (
            `${index + 1}. ${session.sessionId}  ${session.savedAt}\n   ${session.summary}`
          )).join('\n');
        break;
      }
      case '/resume': {
        const restored = await this.agent.restoreLatestSession(argText || undefined);
        if (!restored.restored) {
          result = argText
            ? `Session not found: ${argText}`
            : 'No saved session found for this workspace.';
          break;
        }
        messages = this.agent.getContextMessages();
        result = `Resumed session ${restored.sessionId}${restored.summary ? ` — ${restored.summary}` : ''}`;
        break;
      }
      default:
        result = `Unknown command: ${rawCommand || '(empty command)'}`;
    }
    this.jsonResponse(res, 200, { result, messages });
  }

  // ==================== Providers ====================

  private handleGetProviders(res: http.ServerResponse): void {
    this.jsonResponse(res, 200, { providers: this.providers, active: this.config.provider });
  }

  private async handleSwitchProvider(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { provider: targetType } = await this.parseJson(req) as { provider: string };
    const target = this.providers.find(p => p.type === targetType);
    if (!target) { this.jsonResponse(res, 400, { error: `Unknown provider: ${targetType}` }); return; }
    if (!target.available) { this.jsonResponse(res, 400, { error: `Provider ${target.name} is not available` }); return; }
    switchProvider(this.config, target);
    this.activeProvider = target;
    await this.refreshActiveOllamaCapabilities();
    this.agent.clearContext();
    this.agent = this.createAgent();
    this.jsonResponse(res, 200, { success: true, provider: target.type, model: target.model });
    this.broadcast({ type: 'provider_changed', data: { provider: target.type, model: target.model, name: target.name } });
  }

  private async handleRefreshProviders(res: http.ServerResponse): Promise<void> {
    const detection = await detectProviders(this.config);
    this.providers = detection.providers;
    this.activeProvider = detection.active;
    this.jsonResponse(res, 200, { providers: this.providers, active: this.config.provider });
  }

  // ==================== File System ====================

  /** GET /api/files?path=xxx&depth=2 — list directory tree */
  private async handleListFiles(url: URL, res: http.ServerResponse): Promise<void> {
    const dirPath = url.searchParams.get('path') || '.';
    const depth = parseInt(url.searchParams.get('depth') || '2', 10);
    const resolved = path.resolve(this.workingDir, dirPath);

    // Security: must be under workingDir
    if (!resolved.startsWith(this.workingDir) && resolved !== this.workingDir) {
      this.jsonResponse(res, 403, { error: 'Access denied: outside working directory' });
      return;
    }

    try {
      const tree = await this.buildFileTree(resolved, depth, 0);
      this.jsonResponse(res, 200, { root: dirPath, tree });
    } catch (err) {
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  /** GET /api/files/search?q=foo&limit=20 — search files for @ mentions */
  private async handleSearchFiles(url: URL, res: http.ServerResponse): Promise<void> {
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, SEARCH_MAX_FILES);

    try {
      const entries = await this.getSearchableFiles();
      const matches = entries
        .filter(entry => !query || entry.lowerName.includes(query) || entry.lowerPath.includes(query))
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))
        .slice(0, limit)
        .map(entry => ({
          path: entry.path,
          name: entry.name,
          type: entry.type,
        }));

      this.jsonResponse(res, 200, { files: matches });
    } catch (err) {
      this.jsonResponse(res, 500, { error: (err as Error).message, files: [] });
    }
  }

  /** GET /api/file?path=xxx — read file content */
  private async handleReadFile(url: URL, res: http.ServerResponse): Promise<void> {
    const filePath = url.searchParams.get('path') || '';
    if (!filePath) { this.jsonResponse(res, 400, { error: 'path parameter required' }); return; }

    try {
      const resolved = this.resolveWorkingDirPath(filePath);
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) {
        this.jsonResponse(res, 400, { error: 'Not a file' });
        return;
      }

      const ext = path.extname(resolved).slice(1);
      const preview = this.getPreviewMetadata(resolved);
      if (preview) {
        this.jsonResponse(res, 200, {
          path: filePath,
          extension: ext,
          size: stat.size,
          mimeType: preview.mimeType,
          previewKind: preview.kind,
          previewUrl: `/api/file/raw?path=${encodeURIComponent(filePath)}`,
        });
        return;
      }

      if (stat.size > 2 * 1024 * 1024) {
        this.jsonResponse(res, 400, { error: 'File too large (>2MB)' });
        return;
      }

      const buffer = await fs.readFile(resolved);
      if (this.isProbablyBinaryFile(buffer)) {
        this.jsonResponse(res, 400, { error: 'Binary file preview is not supported for this format' });
        return;
      }

      const content = buffer.toString('utf-8');
      this.jsonResponse(res, 200, { path: filePath, content, extension: ext, size: stat.size });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') { this.jsonResponse(res, 404, { error: 'File not found' }); return; }
      if (e.message === 'Access denied') {
        this.jsonResponse(res, 403, { error: 'Access denied' });
        return;
      }
      if (isPermissionError(e)) {
        this.jsonResponse(res, 403, {
          error: formatPermissionError({
            operation: 'read the file',
            target: filePath,
          }),
        });
        return;
      }
      this.jsonResponse(res, 500, { error: e.message });
    }
  }

  /** GET /api/file/raw?path=xxx — serve raw previewable files */
  private async handleServeRawFile(url: URL, res: http.ServerResponse): Promise<void> {
    const filePath = url.searchParams.get('path') || '';
    if (!filePath) { this.jsonResponse(res, 400, { error: 'path parameter required' }); return; }

    try {
      const resolved = this.resolveWorkingDirPath(filePath);
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) {
        this.jsonResponse(res, 400, { error: 'Not a file' });
        return;
      }

      const preview = this.getPreviewMetadata(resolved);
      if (!preview) {
        this.jsonResponse(res, 400, { error: 'Preview is not supported for this file type' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': preview.mimeType,
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });

      const stream = fsSync.createReadStream(resolved);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Preview failed');
          return;
        }
        res.destroy();
      });
      stream.pipe(res);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') { this.jsonResponse(res, 404, { error: 'File not found' }); return; }
      if (e.message === 'Access denied') {
        this.jsonResponse(res, 403, { error: 'Access denied' });
        return;
      }
      if (isPermissionError(e)) {
        this.jsonResponse(res, 403, {
          error: formatPermissionError({
            operation: 'preview the file',
            target: filePath,
          }),
        });
        return;
      }
      this.jsonResponse(res, 500, { error: e.message });
    }
  }

  /** PUT /api/file — write/save file */
  private async handleWriteFile(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { path: filePath, content } = await this.parseJson(req) as { path: string; content: string };
    if (!filePath) { this.jsonResponse(res, 400, { error: 'path required' }); return; }

    try {
      const resolved = this.resolveWorkingDirPath(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, 'utf-8');
      pendingChanges.reject([resolved]);
      this.invalidateSearchFileCache();
      this.jsonResponse(res, 200, { success: true, path: filePath });
      this.broadcastPendingChanges();
    } catch (err) {
      if ((err as Error).message === 'Access denied') {
        this.jsonResponse(res, 403, { error: 'Access denied' });
        return;
      }
      if (isPermissionError(err)) {
        this.jsonResponse(res, 403, {
          error: formatPermissionError({
            operation: 'save the file',
            target: filePath,
          }),
        });
        return;
      }
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  /** POST /api/file/delete — delete a file or folder (folders are recursive) */
  private async handleDeleteEntry(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { path: targetPath } = await this.parseJson(req) as { path?: string };
    if (!targetPath) {
      this.jsonResponse(res, 400, { error: 'path required' });
      return;
    }

    try {
      const resolved = this.resolveWorkingDirPath(targetPath);
      if (resolved === this.workingDir) {
        this.jsonResponse(res, 400, { error: 'Cannot delete the current working directory' });
        return;
      }

      const stat = await fs.lstat(resolved);
      const entryType = stat.isDirectory() ? 'directory' : 'file';

      const trashed = await this.movePathToTrash(resolved);
      if (!trashed) {
        await this.removePathRecursively(resolved);
      }
      const rejected = this.rejectPendingChangesWithin(resolved);

      this.invalidateSearchFileCache();
      this.jsonResponse(res, 200, {
        success: true,
        path: targetPath,
        type: entryType,
        trashed,
        rejectedPendingCount: rejected.length,
      });
      this.broadcastPendingChanges();
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        this.jsonResponse(res, 404, { error: 'File or folder not found' });
        return;
      }
      if (e.message === 'Access denied') {
        this.jsonResponse(res, 403, { error: 'Access denied' });
        return;
      }
      if (isPermissionError(e)) {
        this.jsonResponse(res, 403, {
          error: formatPermissionError({
            operation: 'delete the file or folder',
            target: targetPath,
            advice: 'Choose a writable folder, or adjust ownership and permissions before deleting it.',
          }),
        });
        return;
      }
      this.jsonResponse(res, 500, { error: e.message });
    }
  }

  /** GET /api/python/interpreter?path=xxx — resolve the best local Python interpreter */
  private async handlePythonInterpreter(url: URL, res: http.ServerResponse): Promise<void> {
    const filePath = url.searchParams.get('path') || '';
    try {
      const interpreter = await this.resolvePythonInterpreter(filePath);
      this.jsonResponse(res, 200, { success: true, interpreter });
    } catch (err) {
      this.jsonResponse(res, 200, { success: false, error: (err as Error).message });
    }
  }

  /** POST /api/python/run — run a Python file inside a new terminal session */
  private async handleRunPython(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { path: filePath } = await this.parseJson(req) as { path?: string };
    if (!filePath) {
      this.jsonResponse(res, 400, { error: 'path required' });
      return;
    }

    try {
      const { resolvedPath, relativePath } = await this.resolveFilePath(filePath);
      const result = await this.terminalManager.createPythonSession(relativePath);
      this.jsonResponse(res, 200, {
        success: true,
        path: relativePath,
        absolutePath: resolvedPath,
        interpreter: result.interpreter,
        session: result.session,
      });
    } catch (err) {
      if (isPermissionError(err)) {
        this.jsonResponse(res, 403, {
          error: formatPermissionError({
            operation: 'run the Python file',
            target: filePath,
            advice: 'Use a file and working directory you can access, and make sure the interpreter can read the project files.',
          }),
        });
        return;
      }
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  private handleTerminalSessions(res: http.ServerResponse): void {
    this.jsonResponse(res, 200, {
      sessions: this.terminalManager.listSessions(),
    });
  }

  private async handleCreateTerminal(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseJson(req) as { cwd?: string; name?: string };
    try {
      const cwd = await this.resolveTerminalCwd(body.cwd);
      const session = await this.terminalManager.createShellSession(cwd, body.name || 'Shell');
      this.jsonResponse(res, 200, { success: true, session });
    } catch (err) {
      if (isPermissionError(err)) {
        this.jsonResponse(res, 403, {
          error: formatPermissionError({
            operation: 'create a terminal session',
            target: body.cwd || this.workingDir,
            advice: 'Choose a working directory you can access, or adjust ownership and permissions for that folder.',
          }),
        });
        return;
      }
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  private async handleTerminalInput(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { sessionId, data } = await this.parseJson(req) as { sessionId?: string; data?: string };
    if (!sessionId || typeof data !== 'string') {
      this.jsonResponse(res, 400, { error: 'sessionId and data required' });
      return;
    }

    const ok = this.terminalManager.writeToSession(sessionId, data);
    if (!ok) {
      this.jsonResponse(res, 404, { error: 'Terminal session not found or already exited' });
      return;
    }

    this.jsonResponse(res, 200, { success: true });
  }

  private async handleTerminalResize(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { sessionId, cols, rows } = await this.parseJson(req) as { sessionId?: string; cols?: number; rows?: number };
    if (!sessionId || typeof cols !== 'number' || typeof rows !== 'number') {
      this.jsonResponse(res, 400, { error: 'sessionId, cols and rows required' });
      return;
    }

    const ok = this.terminalManager.resizeSession(sessionId, cols, rows);
    if (!ok) {
      this.jsonResponse(res, 404, { error: 'Terminal session not found or already exited' });
      return;
    }

    this.jsonResponse(res, 200, { success: true });
  }

  private async handleCloseTerminal(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { sessionId } = await this.parseJson(req) as { sessionId?: string };
    if (!sessionId) {
      this.jsonResponse(res, 400, { error: 'sessionId required' });
      return;
    }

    const ok = this.terminalManager.closeSession(sessionId);
    if (!ok) {
      this.jsonResponse(res, 404, { error: 'Terminal session not found' });
      return;
    }

    this.jsonResponse(res, 200, { success: true });
  }

  private handleSubtasks(res: http.ServerResponse): void {
    this.jsonResponse(res, 200, {
      tasks: this.subtaskManager.listTasks(),
    });
  }

  private async handleCreateSubtask(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseJson(req) as {
      command?: string;
      name?: string;
      cwd?: string;
      timeoutSeconds?: number;
    };

    const command = this.normalizeTextField(body.command);
    if (!command) {
      this.jsonResponse(res, 400, { error: 'command required' });
      return;
    }

    try {
      const cwd = await this.resolveTerminalCwd(body.cwd);
      const timeoutSeconds = Number(body.timeoutSeconds);
      const task = await this.subtaskManager.startTask({
        command,
        cwd,
        name: this.normalizeTextField(body.name),
        timeoutMs: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
          ? Math.floor(timeoutSeconds * 1000)
          : this.config.subtasks.timeoutMs,
      });
      this.jsonResponse(res, 200, { success: true, task });
    } catch (err) {
      if (isPermissionError(err)) {
        this.jsonResponse(res, 403, {
          error: formatPermissionError({
            operation: 'start the background subtask',
            target: body.cwd || this.workingDir,
            advice: 'Choose a working directory you can access, or adjust ownership and permissions for that folder.',
          }),
        });
        return;
      }
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  private async handleStopSubtask(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { taskId } = await this.parseJson(req) as { taskId?: string };
    if (!taskId) {
      this.jsonResponse(res, 400, { error: 'taskId required' });
      return;
    }

    const stopped = this.subtaskManager.stopTask(taskId);
    if (!stopped) {
      this.jsonResponse(res, 404, { error: 'Background subtask not found or already exited' });
      return;
    }

    this.jsonResponse(res, 200, { success: true });
  }

  /** POST /api/folder/open — change working directory */
  private async handleOpenFolder(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { path: dirPath } = await this.parseJson(req) as { path: string };
    if (!dirPath) { this.jsonResponse(res, 400, { error: 'path required' }); return; }

    try {
      const payload = await this.switchWorkingDir(path.resolve(dirPath));
      this.jsonResponse(res, 200, { success: true, ...payload });
    } catch (err) {
      if (isPermissionError(err)) {
        this.jsonResponse(res, 403, {
          error: formatPermissionError({
            operation: 'open the folder',
            target: dirPath,
            advice: 'Choose a folder you can access. If this is a protected system folder, reopen it through the app to grant access.',
          }),
        });
        return;
      }
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  /** POST /api/folder/create — create a folder and open it */
  private async handleCreateFolder(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { path: dirPath } = await this.parseJson(req) as { path: string };
    if (!dirPath) { this.jsonResponse(res, 400, { error: 'path required' }); return; }

    try {
      const resolved = path.resolve(this.workingDir, dirPath);
      await fs.mkdir(resolved, { recursive: true });
      const payload = await this.switchWorkingDir(resolved);
      this.jsonResponse(res, 200, { success: true, created: true, ...payload });
    } catch (err) {
      if (isPermissionError(err)) {
        this.jsonResponse(res, 403, {
          error: formatPermissionError({
            operation: 'create or open the folder',
            target: dirPath,
            advice: 'Choose a parent directory you can write to, or adjust ownership and permissions for that location.',
          }),
        });
        return;
      }
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  /** POST /api/folder/create-in — create a folder inside a specific parent without switching working dir */
  private async handleCreateFolderIn(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { parent, name } = await this.parseJson(req) as { parent: string; name: string };
    if (!parent || !name) { this.jsonResponse(res, 400, { error: 'parent and name required' }); return; }

    try {
      const resolved = path.resolve(parent, name);
      await fs.mkdir(resolved, { recursive: true });
      this.jsonResponse(res, 200, { success: true, path: resolved });
    } catch (err) {
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  private async handlePickFolderDialog(
    res: http.ServerResponse,
    mode: 'open' | 'create',
  ): Promise<void> {
    const result = await this.showNativeFolderDialog(mode);

    if (!result.success && result.unsupported) {
      this.jsonResponse(res, 200, { success: false, unsupported: true });
      return;
    }

    if (!result.success && result.cancelled) {
      this.jsonResponse(res, 200, { success: false, cancelled: true });
      return;
    }

    this.jsonResponse(res, 200, result);
  }

  /** GET /api/folder/current */
  private handleCurrentFolder(res: http.ServerResponse): void {
    this.jsonResponse(res, 200, { workingDir: this.workingDir });
  }

  /** POST /api/folder/open-in-finder — open current working directory in Finder */
  private async handleOpenInFinder(res: http.ServerResponse): Promise<void> {
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      await execAsync(`open "${this.workingDir}"`, { timeout: 5000 });
      this.jsonResponse(res, 200, { success: true });
    } catch (err) {
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  /** POST /api/window/toggle-maximize */
  private async handleToggleMaximize(res: http.ServerResponse): Promise<void> {
    this.onWindowAction?.('toggle-maximize');
    this.jsonResponse(res, 200, { success: true });
  }

  /** POST /api/window/minimize */
  private async handleMinimizeWindow(res: http.ServerResponse): Promise<void> {
    this.onWindowAction?.('minimize');
    this.jsonResponse(res, 200, { success: true });
  }

  /** POST /api/window/close */
  private async handleCloseAppWindow(res: http.ServerResponse): Promise<void> {
    this.onWindowAction?.('close');
    this.jsonResponse(res, 200, { success: true });
  }

  private handlePendingChanges(res: http.ServerResponse): void {
    this.jsonResponse(res, 200, {
      changes: pendingChanges.list(this.workingDir),
    });
  }

  private async handleAcceptPendingChanges(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseJson(req);
    const paths = this.normalizePendingPaths(body);
    try {
      const accepted = await pendingChanges.accept(paths);
      if (accepted.length > 0) this.invalidateSearchFileCache();
      this.jsonResponse(res, 200, { success: true, accepted });
      this.broadcastPendingChanges();
    } catch (err) {
      if (isPermissionError(err)) {
        this.jsonResponse(res, 403, {
          error: formatPermissionError({
            operation: 'apply the pending file changes',
            advice: 'The target file or folder is not writable. Choose a writable location, or adjust ownership and permissions before accepting the diff.',
          }),
        });
        this.broadcastPendingChanges();
        return;
      }
      throw err;
    }
  }

  private async handleRejectPendingChanges(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseJson(req);
    const paths = this.normalizePendingPaths(body);
    const rejected = pendingChanges.reject(paths);
    this.jsonResponse(res, 200, { success: true, rejected });
    this.broadcastPendingChanges();
  }

  private async handleExportMemoryBundle(res: http.ServerResponse): Promise<void> {
    const bundle = await exportMemoryBundle(this.workingDir);
    this.jsonResponse(res, 200, bundle);
  }

  private async handleImportMemoryBundle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseJson(req);
    const bundle = body.bundle as Parameters<typeof importMemoryBundle>[0] | undefined;
    if (!bundle || typeof bundle !== 'object') {
      this.jsonResponse(res, 400, { error: 'bundle required' });
      return;
    }

    const result = await importMemoryBundle(bundle, this.workingDir);
    this.invalidateSearchFileCache();
    this.jsonResponse(res, 200, {
      success: true,
      stagedPaths: result.stagedPaths.map(filePath => path.relative(this.workingDir, filePath).replace(/\\/g, '/')),
      pitfallsImported: result.pitfallsImported,
    });
    this.broadcastPendingChanges();
  }

  private async handleResetMemoryBundle(res: http.ServerResponse): Promise<void> {
    const stagedPaths = await resetManagedMemory(this.workingDir);
    this.invalidateSearchFileCache();
    this.jsonResponse(res, 200, {
      success: true,
      stagedPaths: stagedPaths.map(filePath => path.relative(this.workingDir, filePath).replace(/\\/g, '/')),
    });
    this.broadcastPendingChanges();
  }

  // ==================== Settings ====================

  /** GET /api/settings — return current settings (mask API key) */
  private handleGetSettings(res: http.ServerResponse): void {
    const zenApiKey = this.config.apiKey;
    const nvidiaApiKey = this.config.nvidia.apiKey || this.config.apiKey;
    this.jsonResponse(res, 200, {
      provider: this.config.provider,
      apiKey: this.maskApiKey(zenApiKey),
      hasApiKey: !!zenApiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      ollama: this.config.ollama,
      nvidia: {
        ...this.config.nvidia,
        apiKey: this.maskApiKey(nvidiaApiKey),
        hasApiKey: !!nvidiaApiKey,
      },
      openrouter: {
        ...this.config.openrouter,
        apiKey: this.maskApiKey(this.config.openrouter.apiKey),
        hasApiKey: !!this.config.openrouter.apiKey,
      },
      savedModels: this.config.savedModels,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      maxIterations: this.config.maxIterations,
      permission: this.config.permission,
      permissionPathRulesText: serializePathRules(this.config.permission.pathRules),
      deniedCommandsText: serializeStringList(this.config.permission.deniedCommands),
      subtasks: this.config.subtasks,
      subtaskTimeoutSeconds: Math.round(this.config.subtasks.timeoutMs / 1000),
      showOllamaReasoning: this.config.ollama.showReasoning === true,
      safety: this.config.safety,
      memoryPath: getProjectMemoryPath(this.workingDir),
      pitfallsPath: getProjectPitfallsPath(this.workingDir),
      customToolDirs: getCustomToolDirectories(this.workingDir),
      configPath: getUserConfigPath(),
    });
  }

  /** PUT /api/settings — save settings to ~/.zen-cli/config.json */
  private async handleSaveSettings(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseJson(req);
    const updates: Partial<ZenCliConfig> = {};
    const savedModels: ZenCliConfig['savedModels'] = {
      zenmux: this.config.savedModels.zenmux.slice(),
      nvidia: this.config.savedModels.nvidia.slice(),
    };
    let savedModelsChanged = false;

    // Only update fields that are explicitly provided
    if (typeof body.apiKey === 'string' && body.apiKey) {
      updates.apiKey = this.sanitizeApiKey(body.apiKey);
    }
    if (typeof body.baseUrl === 'string' && body.baseUrl) {
      updates.baseUrl = this.normalizeTextField(body.baseUrl);
    }
    if (typeof body.model === 'string' && body.model) {
      updates.model = this.normalizeTextField(body.model);
      savedModels.zenmux = this.mergeSavedModelHistory(this.config.savedModels.zenmux, updates.model, this.config.model);
      savedModelsChanged = true;
    }
    if (typeof body.provider === 'string') updates.provider = body.provider as ZenCliConfig['provider'];
    if (typeof body.maxTokens === 'number') updates.maxTokens = body.maxTokens as number;
    if (typeof body.temperature === 'number') updates.temperature = body.temperature as number;
    if (typeof body.maxIterations === 'number') {
      updates.maxIterations = Number.isFinite(body.maxIterations) && body.maxIterations > 0
        ? Math.floor(body.maxIterations as number)
        : this.config.maxIterations;
    }

    if (body.permission && typeof body.permission === 'object') {
      const permissionBody = body.permission as Record<string, unknown>;
      updates.permission = {
        ...this.config.permission,
        mode: typeof permissionBody.mode === 'string'
          ? permissionBody.mode as ZenCliConfig['permission']['mode']
          : this.config.permission.mode,
        pathRules: typeof permissionBody.pathRulesText === 'string'
          ? parsePathRules(permissionBody.pathRulesText)
          : this.config.permission.pathRules,
        deniedCommands: typeof permissionBody.deniedCommandsText === 'string'
          ? parseStringList(permissionBody.deniedCommandsText)
          : this.config.permission.deniedCommands,
      };
    }

    if (body.subtasks && typeof body.subtasks === 'object') {
      const subtaskBody = body.subtasks as Record<string, unknown>;
      const timeoutSeconds = Number(subtaskBody.timeoutSeconds);
      updates.subtasks = {
        timeoutMs: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
          ? Math.floor(timeoutSeconds * 1000)
          : this.config.subtasks.timeoutMs,
      };
    }

    if (body.ollama && typeof body.ollama === 'object') {
      const o = body.ollama as Record<string, unknown>;
      updates.ollama = {
        baseUrl: (typeof o.baseUrl === 'string' && o.baseUrl) ? this.normalizeTextField(o.baseUrl) : this.config.ollama.baseUrl,
        model: (typeof o.model === 'string' && o.model) ? this.normalizeTextField(o.model) : this.config.ollama.model,
        showReasoning: typeof o.showReasoning === 'boolean' ? o.showReasoning : this.config.ollama.showReasoning,
      };
    }

    if (body.nvidia && typeof body.nvidia === 'object') {
      const n = body.nvidia as Record<string, unknown>;
      updates.nvidia = {
        apiKey: this.config.nvidia.apiKey,
        baseUrl: (typeof n.baseUrl === 'string' && n.baseUrl) ? this.normalizeTextField(n.baseUrl) : this.config.nvidia.baseUrl,
        model: (typeof n.model === 'string' && n.model) ? this.normalizeTextField(n.model) : this.config.nvidia.model,
      };
      if (typeof n.apiKey === 'string' && n.apiKey) {
        updates.nvidia.apiKey = this.sanitizeApiKey(n.apiKey);
      }
      if (typeof n.model === 'string' && n.model) {
        savedModels.nvidia = this.mergeSavedModelHistory(this.config.savedModels.nvidia, updates.nvidia.model, this.config.nvidia.model);
        savedModelsChanged = true;
      }
    }

    if (body.openrouter && typeof body.openrouter === 'object') {
      const o = body.openrouter as Record<string, unknown>;
      updates.openrouter = {
        apiKey: this.config.openrouter.apiKey,
        baseUrl: (typeof o.baseUrl === 'string' && o.baseUrl) ? this.normalizeTextField(o.baseUrl) : this.config.openrouter.baseUrl,
        model: (typeof o.model === 'string' && o.model) ? this.normalizeTextField(o.model) : this.config.openrouter.model,
        siteUrl: (typeof o.siteUrl === 'string') ? this.normalizeTextField(o.siteUrl) : this.config.openrouter.siteUrl,
        siteName: (typeof o.siteName === 'string') ? this.normalizeTextField(o.siteName) : this.config.openrouter.siteName,
      };
      if (typeof o.apiKey === 'string' && o.apiKey) {
        updates.openrouter.apiKey = this.sanitizeApiKey(o.apiKey);
      }
    }

    if (savedModelsChanged) {
      updates.savedModels = savedModels;
    }

    if (body.safety && typeof body.safety === 'object') {
      const s = body.safety as Record<string, unknown>;
      updates.safety = {
        ...this.config.safety,
        ...(s.auditLog && typeof s.auditLog === 'object' ? { auditLog: { ...this.config.safety.auditLog, ...(s.auditLog as Record<string, unknown>) } } : {}),
        ...(s.dangerousCommands && typeof s.dangerousCommands === 'object' ? { dangerousCommands: { ...this.config.safety.dangerousCommands, ...(s.dangerousCommands as Record<string, unknown>) } } : {}),
        ...(s.sensitiveFiles && typeof s.sensitiveFiles === 'object' ? { sensitiveFiles: { ...this.config.safety.sensitiveFiles, ...(s.sensitiveFiles as Record<string, unknown>) } } : {}),
        ...(s.autoFormat && typeof s.autoFormat === 'object' ? { autoFormat: { ...this.config.safety.autoFormat, ...(s.autoFormat as Record<string, unknown>) } } : {}),
        ...(s.autoTest && typeof s.autoTest === 'object' ? { autoTest: { ...this.config.safety.autoTest, ...(s.autoTest as Record<string, unknown>) } } : {}),
        ...(s.prGate && typeof s.prGate === 'object' ? { prGate: { ...this.config.safety.prGate, ...(s.prGate as Record<string, unknown>) } } : {}),
        ...(s.autoCommit && typeof s.autoCommit === 'object' ? { autoCommit: { ...this.config.safety.autoCommit, ...(s.autoCommit as Record<string, unknown>) } } : {}),
      };
    }

    try {
      await this.persistConfigUpdates(updates);

      this.jsonResponse(res, 200, {
        success: true,
        configPath: getUserConfigPath(),
        providers: this.providers,
      });
    } catch (err) {
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  /** POST /api/settings/test — test API connection with given key */
  private async handleTestConnection(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseJson(req);
    const testType = (body.type as string) || 'zenmux'; // 'zenmux', 'ollama', or 'nvidia'

    try {
      if (testType === 'ollama') {
        const ollamaBaseUrl = this.normalizeTextField(body.ollamaBaseUrl) || this.config.ollama.baseUrl;
        const url = `${ollamaBaseUrl.replace(/\/+$/, '')}/models`;
        const resp = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(8000),
        });

        if (resp.ok) {
          const data = await resp.json() as { data?: Array<{ id: string }> };
          const models = (data.data || []).slice(0, 20).map(m => m.id);
          this.jsonResponse(res, 200, { success: true, models, status: resp.status });
        } else {
          const errText = await resp.text().catch(() => '');
          this.jsonResponse(res, 200, { success: false, error: `${resp.status} ${resp.statusText}`, detail: errText.substring(0, 500) });
        }
        return;
      }

      const provider = testType === 'nvidia' ? 'nvidia' : testType === 'openrouter' ? 'openrouter' : 'zenmux';
      const baseUrl = this.normalizeTextField(body.baseUrl)
        || (provider === 'nvidia' ? this.config.nvidia.baseUrl : provider === 'openrouter' ? this.config.openrouter.baseUrl : this.config.baseUrl);
      const model = this.normalizeTextField(body.model)
        || (provider === 'nvidia' ? this.config.nvidia.model : provider === 'openrouter' ? this.config.openrouter.model : this.config.model);
      const typedApiKey = this.sanitizeApiKey(body.apiKey);
      const apiKey = typedApiKey || this.getStoredProviderApiKey(provider);

      if (!model) {
        this.jsonResponse(res, 200, { success: false, error: 'Model name required' });
        return;
      }

      if (!apiKey) {
        this.jsonResponse(res, 200, { success: false, error: 'API key required' });
        return;
      }

      await this.testRemoteModelConnection({ provider, baseUrl, apiKey, model });

      if (provider === 'zenmux') {
        await this.persistConfigUpdates({
          baseUrl,
          model,
          ...(typedApiKey ? { apiKey: typedApiKey } : {}),
          savedModels: this.buildSavedModelsUpdate('zenmux', model),
        });
      } else if (provider === 'nvidia') {
        await this.persistConfigUpdates({
          nvidia: {
            apiKey: typedApiKey || this.config.nvidia.apiKey,
            baseUrl,
            model,
          },
          savedModels: this.buildSavedModelsUpdate('nvidia', model),
        });
      } else {
        await this.persistConfigUpdates({
          openrouter: {
            apiKey: typedApiKey || this.config.openrouter.apiKey,
            baseUrl,
            model,
            siteUrl: this.config.openrouter.siteUrl,
            siteName: this.config.openrouter.siteName,
          },
        });
      }

      this.jsonResponse(res, 200, {
        success: true,
        model,
        savedModels: this.config.savedModels,
        providers: this.providers,
        configPath: getUserConfigPath(),
      });
    } catch (err) {
      this.jsonResponse(res, 200, { success: false, error: (err as Error).message });
    }
  }

  // ==================== Ollama Model Management ====================

  /** Get Ollama native base URL (without /v1 suffix) */
  private getOllamaNativeUrl(): string {
    return this.config.ollama.baseUrl.replace(/\/v1\/?$/, '');
  }

  /** GET /api/ollama/models — list locally available Ollama models */
  private async handleOllamaModels(res: http.ServerResponse): Promise<void> {
    try {
      const url = `${this.getOllamaNativeUrl()}/api/tags`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) {
        this.jsonResponse(res, 200, { success: false, error: `Ollama not reachable: ${resp.status}`, models: [] });
        return;
      }
      const data = await resp.json() as { models?: Array<{ name: string; size: number; modified_at: string; details?: { parameter_size?: string; family?: string } }> };
      
      // Filter out embedding models (e.g., nomic-embed-text, mxbai-embed-large, etc.)
      const embeddingKeywords = ['embed', 'embedding'];
      const filteredModels = (data.models || []).filter(m => {
        const modelName = m.name.toLowerCase();
        return !embeddingKeywords.some(keyword => modelName.includes(keyword));
      });
      
      const models = await Promise.all(filteredModels.map(async (m) => {
        const capabilityInfo = await this.getOllamaModelCapabilities(m.name);
        return {
          name: m.name,
          size: m.size,
          sizeHuman: formatBytes(m.size),
          modified: m.modified_at,
          parameterSize: m.details?.parameter_size || '',
          family: m.details?.family || '',
          capabilities: capabilityInfo.capabilities,
          supportsCompletion: capabilityInfo.supportsCompletion,
          supportsTools: capabilityInfo.supportsTools,
        };
      }));
      this.jsonResponse(res, 200, { success: true, models });
    } catch (err) {
      this.jsonResponse(res, 200, { success: false, error: (err as Error).message, models: [] });
    }
  }

  /** POST /api/ollama/pull — pull/download a model (SSE progress via broadcast) */
  private async handleOllamaPull(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { model } = await this.parseJson(req) as { model: string };
    if (!model) { this.jsonResponse(res, 400, { error: 'model name required' }); return; }

    // Respond immediately, stream progress via SSE
    this.jsonResponse(res, 200, { status: 'pulling', model });

    try {
      const url = `${this.getOllamaNativeUrl()}/api/pull`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: true }),
      });

      if (!resp.ok || !resp.body) {
        this.broadcast({ type: 'error', data: { error: `Ollama pull failed: ${resp.status}` } });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as { status: string; completed?: number; total?: number; digest?: string };
            let progressText = event.status;
            if (event.total && event.completed) {
              const pct = Math.round((event.completed / event.total) * 100);
              progressText = `${event.status}: ${pct}% (${formatBytes(event.completed)}/${formatBytes(event.total)})`;
            }
            this.broadcast({ type: 'content', data: { text: '' } }); // keep-alive
            // Use a special broadcast for pull progress
            this.broadcastRaw({ type: 'ollama_pull_progress', data: { model, status: progressText, completed: event.completed, total: event.total } });
          } catch { /* skip bad json */ }
        }
      }

      this.broadcastRaw({ type: 'ollama_pull_done', data: { model } });
      this.ollamaCapabilitiesCache.clear();
    } catch (err) {
      this.broadcast({ type: 'error', data: { error: `Pull failed: ${(err as Error).message}` } });
    }
  }

  /** POST /api/ollama/delete — delete a local model */
  private async handleOllamaDelete(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { model } = await this.parseJson(req) as { model: string };
    if (!model) { this.jsonResponse(res, 400, { error: 'model name required' }); return; }

    try {
      const url = `${this.getOllamaNativeUrl()}/api/delete`;
      const resp = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
      });
      if (resp.ok) {
        this.ollamaCapabilitiesCache.clear();
        this.jsonResponse(res, 200, { success: true, model });
      } else {
        const errText = await resp.text().catch(() => '');
        this.jsonResponse(res, 200, { success: false, error: errText || `${resp.status}` });
      }
    } catch (err) {
      this.jsonResponse(res, 200, { success: false, error: (err as Error).message });
    }
  }

  // ==================== Helpers ====================

  private async buildFileTree(dirPath: string, maxDepth: number, currentDepth: number): Promise<FileEntry[]> {
    if (currentDepth >= maxDepth) return [];
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const result: FileEntry[] = [];
    // Sort: directories first, then files, alphabetical
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(this.workingDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        const children = await this.buildFileTree(fullPath, maxDepth, currentDepth + 1);
        result.push({ name: entry.name, path: relPath, type: 'directory', children });
      } else {
        result.push({ name: entry.name, path: relPath, type: 'file' });
      }
    }
    return result;
  }

  private invalidateSearchFileCache(): void {
    this.searchFileCacheRoot = '';
    this.searchFileCacheAt = 0;
    this.searchFileCache = [];
    this.searchFileCachePromise = null;
  }

  private async getSearchableFiles(): Promise<SearchableFileEntry[]> {
    const now = Date.now();
    if (
      this.searchFileCacheRoot === this.workingDir &&
      now - this.searchFileCacheAt < SEARCH_CACHE_TTL_MS &&
      this.searchFileCache.length > 0
    ) {
      return this.searchFileCache;
    }

    if (this.searchFileCachePromise) {
      return await this.searchFileCachePromise;
    }

    const rootDir = this.workingDir;
    this.searchFileCachePromise = (async () => {
      const normalizedFiles = await this.scanSearchableFiles(rootDir);

      if (rootDir === this.workingDir) {
        this.searchFileCacheRoot = rootDir;
        this.searchFileCacheAt = Date.now();
        this.searchFileCache = normalizedFiles;
      }

      return normalizedFiles;
    })();

    try {
      return await this.searchFileCachePromise;
    } finally {
      this.searchFileCachePromise = null;
    }
  }

  private async scanSearchableFiles(rootDir: string): Promise<SearchableFileEntry[]> {
    const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];
    const files: SearchableFileEntry[] = [];

    while (queue.length > 0 && files.length < SEARCH_MAX_FILES) {
      const current = queue.shift();
      if (!current) break;

      let entries: fsSync.Dirent[];
      try {
        entries = await fs.readdir(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }

      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env') continue;
        if (IGNORE_DIRS.has(entry.name)) continue;

        const fullPath = path.join(current.dir, entry.name);
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          files.push({
            path: relPath,
            name: entry.name,
            type: 'directory',
            lowerPath: relPath.toLowerCase(),
            lowerName: entry.name.toLowerCase(),
          });

          if (current.depth + 1 <= SEARCH_MAX_DEPTH && !entry.isSymbolicLink()) {
            queue.push({ dir: fullPath, depth: current.depth + 1 });
          }
          if (files.length >= SEARCH_MAX_FILES) break;
          continue;
        }

        if (!entry.isFile()) continue;

        files.push({
          path: relPath,
          name: entry.name,
          type: 'file',
          lowerPath: relPath.toLowerCase(),
          lowerName: entry.name.toLowerCase(),
        });

        if (files.length >= SEARCH_MAX_FILES) break;
      }
    }

    return files;
  }

  private broadcast(event: ServerEvent): void {
    const data = JSON.stringify(event);
    for (const client of this.sseClients) {
      try { client.write(`data: ${data}\n\n`); } catch { this.sseClients.delete(client); }
    }
  }

  private broadcastRaw(event: ServerEvent): void {
    this.broadcast(event);
  }

  private broadcastPendingChanges(): void {
    this.broadcastRaw({
      type: 'pending_changes_updated',
      data: { count: pendingChanges.list(this.workingDir).length },
    });
  }

  private broadcastFolderChanged(): void {
    this.broadcastRaw({
      type: 'folder_changed',
      data: { workingDir: this.workingDir },
    });
  }

  private async resolveFilePath(filePath: string): Promise<{ resolvedPath: string; relativePath: string }> {
    const resolvedPath = this.resolveWorkingDirPath(filePath);

    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Not a file');
    }

    return {
      resolvedPath,
      relativePath: path.relative(this.workingDir, resolvedPath).replace(/\\/g, '/'),
    };
  }

  private async resolvePythonInterpreter(filePath: string): Promise<PythonInterpreterInfo> {
    if (filePath) {
      await this.resolveFilePath(filePath);
    }
    return this.terminalManager.detectPythonInterpreter(filePath || undefined);
  }

  private async resolveTerminalCwd(inputPath?: string): Promise<string> {
    if (!inputPath) return this.workingDir;

    const resolved = this.resolveWorkingDirPath(inputPath);

    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw new Error('Not a directory');
    }

    return resolved;
  }

  private async ensureDirectoryReadable(dirPath: string): Promise<void> {
    await fs.access(dirPath, fsSync.constants.R_OK);
  }

  private resolveWorkingDirPath(inputPath: string): string {
    const resolved = path.resolve(this.workingDir, inputPath);
    const relative = path.relative(this.workingDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Access denied');
    }
    return resolved;
  }

  private getPreviewMetadata(filePath: string): { kind: PreviewKind; mimeType: string } | null {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = PREVIEW_FILE_MIME_TYPES[ext];
    if (!mimeType) return null;
    return {
      kind: ext === '.pdf' ? 'pdf' : 'image',
      mimeType,
    };
  }

  private isProbablyBinaryFile(content: Buffer): boolean {
    const sample = content.subarray(0, Math.min(content.length, 4096));
    for (const byte of sample) {
      if (byte === 0) return true;
    }
    return false;
  }

  private rejectPendingChangesWithin(absPath: string): ReturnType<typeof pendingChanges.reject> {
    const affectedPaths = pendingChanges.list(this.workingDir)
      .map(change => change.path)
      .filter(changePath => this.isSameOrChildPath(changePath, absPath));

    if (affectedPaths.length === 0) return [];
    return pendingChanges.reject(affectedPaths);
  }

  private isSameOrChildPath(targetPath: string, basePath: string): boolean {
    if (targetPath === basePath) return true;
    const relative = path.relative(basePath, targetPath);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  private async removePathRecursively(absPath: string): Promise<void> {
    try {
      await fs.rm(absPath, {
        recursive: true,
        force: false,
        maxRetries: 8,
        retryDelay: 120,
      });
      return;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (!['ENOTEMPTY', 'EPERM', 'EBUSY', 'EEXIST'].includes(error.code || '')) {
        throw err;
      }
    }

    await this.removePathRecursivelyFallback(absPath);
  }

  private async movePathToTrash(absPath: string): Promise<boolean> {
    if (!process.versions.electron) return false;

    try {
      const { shell } = await import('electron');
      await shell.trashItem(absPath);
      return true;
    } catch {
      return false;
    }
  }

  private async removePathRecursivelyFallback(absPath: string): Promise<void> {
    let stat: fsSync.Stats;
    try {
      stat = await fs.lstat(absPath);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') return;
      throw err;
    }

    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      await fs.unlink(absPath);
      return;
    }

    const entries = await fs.readdir(absPath);
    for (const entry of entries) {
      await this.removePathRecursivelyFallback(path.join(absPath, entry));
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await fs.rmdir(absPath);
        return;
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'ENOENT') return;
        if (error.code !== 'ENOTEMPTY') throw err;

        const remainingEntries = await fs.readdir(absPath).catch(() => []);
        for (const entry of remainingEntries) {
          await this.removePathRecursivelyFallback(path.join(absPath, entry));
        }
        await delay(80 * (attempt + 1));
      }
    }

    await fs.rmdir(absPath);
  }

  private async parseJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const body = await readBody(req);
    return JSON.parse(body) as Record<string, unknown>;
  }

  private jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  private normalizePendingPaths(body: Record<string, unknown>): string[] | undefined {
    if (Array.isArray(body.paths)) {
      return body.paths
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map(filePath => path.resolve(this.workingDir, filePath));
    }

    if (typeof body.path === 'string' && body.path.length > 0) {
      return [path.resolve(this.workingDir, body.path)];
    }

    return undefined;
  }

  private sanitizeContextFiles(values: unknown): string[] {
    if (!Array.isArray(values)) return [];

    return values
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map(filePath => path.resolve(this.workingDir, filePath))
      .filter(filePath => filePath.startsWith(this.workingDir))
      .map(filePath => path.relative(this.workingDir, filePath).replace(/\\/g, '/'));
  }

  private sanitizeImages(values: unknown): Array<{ base64: string; filename: string }> {
    if (!Array.isArray(values)) return [];

    return values
      .slice(0, MAX_CHAT_IMAGES)
      .flatMap((value) => {
        if (!value || typeof value !== 'object') return [];

        const image = value as { base64?: unknown; filename?: unknown };
        const base64 = typeof image.base64 === 'string' ? image.base64.trim() : '';
        if (!base64.startsWith('data:image/')) return [];

        const filename = typeof image.filename === 'string' && image.filename.trim()
          ? image.filename.trim()
          : 'image';

        return [{ base64, filename }];
      });
  }

  async showNativeFolderDialog(mode: 'open' | 'create'): Promise<
    | { success: true; workingDir: string; tree: FileEntry[]; created?: boolean }
    | { success: false; unsupported?: boolean; cancelled?: boolean }
  > {
    if (!process.versions.electron) {
      return { success: false, unsupported: true };
    }

    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog({
      title: mode === 'create' ? 'Create or Open Folder' : 'Open Folder',
      defaultPath: this.workingDir,
      buttonLabel: mode === 'create' ? 'Create / Open' : 'Open',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }

    const payload = await this.switchWorkingDir(result.filePaths[0]);
    return {
      success: true,
      created: mode === 'create',
      ...payload,
    };
  }

  private async switchWorkingDir(resolved: string): Promise<{ workingDir: string; tree: FileEntry[] }> {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw new Error('Not a directory');
    }
    await this.ensureDirectoryReadable(resolved);

    this.workingDir = resolved;
    process.chdir(resolved);
    this.invalidateSearchFileCache();
    const tree = await this.buildFileTree(resolved, 2, 0);
    this.broadcastFolderChanged();
    this.broadcastPendingChanges();
    return { workingDir: resolved, tree };
  }

  private async recordPitfallFromFailure(options: {
    source: 'tool' | 'error';
    toolName?: string;
    message: string;
  }): Promise<void> {
    const derived = derivePitfallFromFailure(options);
    if (!derived) return;
    try {
      await recordPitfall(derived, this.workingDir);
    } catch {
      // Keep the main interaction path unaffected by pitfall persistence failures.
    }
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function reqCleanup(res: http.ServerResponse, cb: () => void): void {
  res.on('close', cb);
  res.on('error', cb);
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0B';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + 'GB';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
