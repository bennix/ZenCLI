// ============================================================
// zen-cli  —  Configuration Loader
// ============================================================
// Config stored in user home directory: ~/.zen-cli/config.json
// API keys are NEVER stored in the application directory.
// Priority: env vars > user config file > defaults

import fs from 'node:fs';
import path from 'node:path';
import type { ZenCliConfig } from './types.js';
import { createDefaultPermissionSettings, normalizePermissionSettings } from './core/permissions.js';
import { createDefaultSafetySettings, normalizeSafetySettings } from './core/safety-settings.js';

const DEFAULT_ZENMUX_MODEL = 'anthropic/claude-sonnet-4.6';
const DEFAULT_OLLAMA_MODEL = 'qwen3-coder-next';
const DEFAULT_NVIDIA_MODEL = 'qwen/qwen3.5-122b-a10b';
const DEFAULT_OPENROUTER_MODEL = 'qwen/qwen3.6-plus:free';

function normalizeModelHistory(...values: unknown[]): string[] {
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

  for (const value of values) append(value);
  return result.slice(0, 50);
}

const DEFAULT_CONFIG: ZenCliConfig = {
  provider: 'zenmux',
  apiKey: '',
  baseUrl: 'https://zenmux.ai/api/v1',
  model: DEFAULT_ZENMUX_MODEL,
  savedModels: {
    zenmux: [],
    nvidia: [],
  },
  ollama: {
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: DEFAULT_OLLAMA_MODEL,
    showReasoning: false,
  },
  nvidia: {
    apiKey: '',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: DEFAULT_NVIDIA_MODEL,
  },
  openrouter: {
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: DEFAULT_OPENROUTER_MODEL,
    siteUrl: '',
    siteName: '',
  },
  maxTokens: 8192,
  contextWindow: 200000,
  temperature: 0,
  maxIterations: 100,
  permission: createDefaultPermissionSettings(),
  session: {
    autoSave: true,
    autoResume: false,
    maxSnapshots: 20,
  },
  web: {
    searchMaxResults: 5,
    fetchMaxChars: 12000,
  },
  subtasks: {
    timeoutMs: 3_600_000,
  },
  tools: {
    bash: { timeout: 120000 },
    read: { maxLines: 2000 },
    grep: { maxResults: 100 },
  },
  safety: createDefaultSafetySettings(),
};

/** Get user config directory: ~/.zen-cli/ */
export function getUserConfigDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.zen-cli');
}

/** Get user config file path: ~/.zen-cli/config.json */
export function getUserConfigPath(): string {
  return path.join(getUserConfigDir(), 'config.json');
}

/** Ensure ~/.zen-cli/ directory exists */
function ensureConfigDir(): void {
  const dir = getUserConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Load config from ~/.zen-cli/config.json */
function loadUserConfig(): Partial<ZenCliConfig> {
  const filePath = getUserConfigPath();
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Partial<ZenCliConfig>;
  } catch (err) {
    console.error(`Warning: Failed to parse ${filePath}: ${(err as Error).message}`);
    return {};
  }
}

/** Save config to ~/.zen-cli/config.json */
export function saveUserConfig(config: Partial<ZenCliConfig>): void {
  ensureConfigDir();
  const filePath = getUserConfigPath();

  // Load existing config to merge
  let existing: Partial<ZenCliConfig> = {};
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { /* start fresh */ }
  }

  const merged = {
    ...existing,
    ...config,
  };

  // If ollama is provided, deep merge it
  if (config.ollama || existing.ollama) {
    merged.ollama = {
      ...(existing.ollama || {}),
      ...(config.ollama || {}),
    } as ZenCliConfig['ollama'];
  }

  // If nvidia is provided, deep merge it
  if (config.nvidia || existing.nvidia) {
    merged.nvidia = {
      ...(existing.nvidia || {}),
      ...(config.nvidia || {}),
    } as ZenCliConfig['nvidia'];
  }

  // If openrouter is provided, deep merge it
  if (config.openrouter || existing.openrouter) {
    merged.openrouter = {
      ...(existing.openrouter || {}),
      ...(config.openrouter || {}),
    } as ZenCliConfig['openrouter'];
  }

  if (config.savedModels || existing.savedModels) {
    merged.savedModels = {
      zenmux: normalizeModelHistory(
        config.model,
        existing.model,
        config.savedModels?.zenmux,
        existing.savedModels?.zenmux,
      ),
      nvidia: normalizeModelHistory(
        config.nvidia?.model,
        existing.nvidia?.model,
        config.savedModels?.nvidia,
        existing.savedModels?.nvidia,
      ),
    };
  }

  if (config.permission || existing.permission) {
    merged.permission = normalizePermissionSettings({
      ...(existing.permission || {}),
      ...(config.permission || {}),
    });
  }

  if (config.session || existing.session) {
    merged.session = {
      ...(existing.session || {}),
      ...(config.session || {}),
    } as ZenCliConfig['session'];
  }

  if (config.web || existing.web) {
    merged.web = {
      ...(existing.web || {}),
      ...(config.web || {}),
    } as ZenCliConfig['web'];
  }

  if (config.subtasks || existing.subtasks) {
    merged.subtasks = {
      ...(existing.subtasks || {}),
      ...(config.subtasks || {}),
    } as ZenCliConfig['subtasks'];
  }

  if (config.safety || existing.safety) {
    merged.safety = normalizeSafetySettings({
      ...(existing.safety || {}),
      ...(config.safety || {}),
    });
  }

  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
}

/** Load config from environment variables */
function loadEnvConfig(): Partial<ZenCliConfig> {
  const env: Partial<ZenCliConfig> = {};
  if (process.env.ZEN_API_KEY) env.apiKey = process.env.ZEN_API_KEY;
  if (process.env.ZEN_BASE_URL) env.baseUrl = process.env.ZEN_BASE_URL;
  if (process.env.ZEN_MODEL) env.model = process.env.ZEN_MODEL;
  if (process.env.ZEN_MAX_TOKENS) env.maxTokens = parseInt(process.env.ZEN_MAX_TOKENS, 10);
  if (process.env.ZEN_CONTEXT_WINDOW) env.contextWindow = parseInt(process.env.ZEN_CONTEXT_WINDOW, 10);
  if (process.env.ZEN_MAX_ITERATIONS) env.maxIterations = parseInt(process.env.ZEN_MAX_ITERATIONS, 10);
  if (process.env.ZEN_PROVIDER) env.provider = process.env.ZEN_PROVIDER as ZenCliConfig['provider'];
  if (process.env.NVIDIA_API_KEY) {
    env.nvidia = {
      ...(env.nvidia || {}),
      apiKey: process.env.NVIDIA_API_KEY,
      baseUrl: DEFAULT_CONFIG.nvidia.baseUrl,
      model: DEFAULT_CONFIG.nvidia.model,
    };
  }
  if (process.env.NVIDIA_BASE_URL || process.env.NVIDIA_MODEL) {
    env.nvidia = {
      apiKey: (env.nvidia && env.nvidia.apiKey) || DEFAULT_CONFIG.nvidia.apiKey,
      ...(env.nvidia || {}),
      baseUrl: DEFAULT_CONFIG.nvidia.baseUrl,
      model: DEFAULT_CONFIG.nvidia.model,
    };
    if (process.env.NVIDIA_BASE_URL && env.nvidia) env.nvidia.baseUrl = process.env.NVIDIA_BASE_URL;
    if (process.env.NVIDIA_MODEL && env.nvidia) env.nvidia.model = process.env.NVIDIA_MODEL;
  }
  return env;
}

/** Merge all config sources and return final config */
export function loadConfig(): ZenCliConfig {
  const userConfig = loadUserConfig();
  const envConfig = loadEnvConfig();

  const config: ZenCliConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    ...envConfig,
    ollama: {
      ...DEFAULT_CONFIG.ollama,
      ...((userConfig as Record<string, unknown>).ollama as Partial<ZenCliConfig['ollama']> || {}),
    },
    nvidia: {
      ...DEFAULT_CONFIG.nvidia,
      ...((userConfig as Record<string, unknown>).nvidia as Partial<ZenCliConfig['nvidia']> || {}),
      ...((envConfig as Record<string, unknown>).nvidia as Partial<ZenCliConfig['nvidia']> || {}),
    },
    openrouter: {
      ...DEFAULT_CONFIG.openrouter,
      ...((userConfig as Record<string, unknown>).openrouter as Partial<ZenCliConfig['openrouter']> || {}),
    },
    savedModels: {
      zenmux: normalizeModelHistory(
        envConfig.model,
        userConfig.model,
        envConfig.savedModels?.zenmux,
        userConfig.savedModels?.zenmux,
      ),
      nvidia: normalizeModelHistory(
        ((envConfig as Record<string, unknown>).nvidia as Partial<ZenCliConfig['nvidia']> | undefined)?.model,
        ((userConfig as Record<string, unknown>).nvidia as Partial<ZenCliConfig['nvidia']> | undefined)?.model,
        envConfig.savedModels?.nvidia,
        userConfig.savedModels?.nvidia,
      ),
    },
    permission: normalizePermissionSettings((userConfig as Record<string, unknown>).permission as Partial<ZenCliConfig['permission']> | undefined),
    session: {
      ...DEFAULT_CONFIG.session,
      ...((userConfig as Record<string, unknown>).session as Partial<ZenCliConfig['session']> || {}),
    },
    web: {
      ...DEFAULT_CONFIG.web,
      ...((userConfig as Record<string, unknown>).web as Partial<ZenCliConfig['web']> || {}),
    },
    subtasks: {
      ...DEFAULT_CONFIG.subtasks,
      ...((userConfig as Record<string, unknown>).subtasks as Partial<ZenCliConfig['subtasks']> || {}),
    },
    tools: {
      ...DEFAULT_CONFIG.tools,
      ...(userConfig.tools || {}),
    },
    safety: normalizeSafetySettings((userConfig as Record<string, unknown>).safety as Partial<ZenCliConfig['safety']> | undefined),
  };

  return config;
}

/** Validate config — lenient: no API key is fine, will fallback to Ollama or prompt in UI */
export function validateConfig(_config: ZenCliConfig): string[] {
  // No hard errors — the Settings UI allows the user to configure API key at runtime.
  return [];
}

/** Get active provider connection params */
export function getActiveProvider(config: ZenCliConfig): {
  baseUrl: string;
  apiKey: string;
  model: string;
  siteUrl?: string;
  siteName?: string;
} {
  if (config.provider === 'ollama') {
    return {
      baseUrl: config.ollama.baseUrl,
      apiKey: '',
      model: config.ollama.model,
    };
  }
  if (config.provider === 'nvidia') {
    return {
      baseUrl: config.nvidia.baseUrl,
      apiKey: config.nvidia.apiKey || config.apiKey,
      model: config.nvidia.model,
    };
  }
  if (config.provider === 'openrouter') {
    return {
      baseUrl: config.openrouter.baseUrl,
      apiKey: config.openrouter.apiKey || config.apiKey,
      model: config.openrouter.model,
      siteUrl: config.openrouter.siteUrl,
      siteName: config.openrouter.siteName,
    };
  }
  return {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  };
}
