// ============================================================
// zen-cli  —  Provider Detection & Switching
// ============================================================
// Auto-detect available providers: ZenMux (cloud) / Ollama (local) / Nvidia (cloud).
// Probes each endpoint with a lightweight request.

import type { ProviderInfo, ZenCliConfig } from '../types.js';

/** Probe ZenMux availability by hitting /models endpoint */
async function probeZenMux(config: ZenCliConfig): Promise<ProviderInfo> {
  const info: ProviderInfo = {
    type: 'zenmux',
    name: 'ZenMux',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    available: false,
    contextWindow: config.contextWindow,
  };

  if (!config.apiKey) return info;

  try {
    const url = `${config.baseUrl.replace(/\/+$/, '')}/models`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    info.available = resp.ok;
  } catch {
    info.available = false;
  }

  return info;
}

/** Probe Ollama availability by hitting /v1/models (OpenAI compat) */
async function probeOllama(config: ZenCliConfig): Promise<ProviderInfo> {
  const info: ProviderInfo = {
    type: 'ollama',
    name: 'Ollama (local)',
    baseUrl: config.ollama.baseUrl,
    apiKey: '',
    model: config.ollama.model,
    available: false,
    contextWindow: 32768,  // Ollama default
  };

  try {
    const url = `${config.ollama.baseUrl.replace(/\/+$/, '')}/models`;
    const resp = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      info.available = true;
      // Try to find the configured model
      try {
        const data = await resp.json() as { data?: Array<{ id: string }> };
        if (data.data) {
          const found = data.data.find(m => m.id === config.ollama.model || m.id.startsWith(config.ollama.model));
          if (found) {
            info.model = found.id;
          }
        }
      } catch { /* ignore parse errors */ }
    }
  } catch {
    info.available = false;
  }

  return info;
}

/** Probe Nvidia API availability */
async function probeNvidia(config: ZenCliConfig): Promise<ProviderInfo> {
  const apiKey = config.nvidia.apiKey || config.apiKey;
  const info: ProviderInfo = {
    type: 'nvidia',
    name: 'NVIDIA',
    baseUrl: config.nvidia.baseUrl,
    apiKey,
    model: config.nvidia.model,
    available: false,
    contextWindow: 131072,  // Nvidia typical max
  };

  if (!apiKey) return info;

  try {
    // Nvidia doesn't have a /models endpoint, so we just check if the API is reachable
    const url = `${config.nvidia.baseUrl.replace(/\/+$/, '')}/models`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    // Even if it returns 4xx, having auth work means the connection is good
    info.available = resp.ok || resp.status === 401 || resp.status === 403;
  } catch {
    info.available = false;
  }

  return info;
}

/** Probe OpenRouter API availability */
async function probeOpenRouter(config: ZenCliConfig): Promise<ProviderInfo> {
  const apiKey = config.openrouter.apiKey || config.apiKey;
  const info: ProviderInfo = {
    type: 'openrouter',
    name: 'OpenRouter',
    baseUrl: config.openrouter.baseUrl,
    apiKey,
    model: config.openrouter.model,
    available: false,
    contextWindow: 131072,  // OpenRouter typical max
  };

  if (!apiKey) return info;

  try {
    const url = `${config.openrouter.baseUrl.replace(/\/+$/, '')}/models`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    info.available = resp.ok || resp.status === 401 || resp.status === 403;
  } catch {
    info.available = false;
  }

  return info;
}

/** Detect all providers and return the best available one */
export async function detectProviders(config: ZenCliConfig): Promise<{
  providers: ProviderInfo[];
  active: ProviderInfo;
}> {
  // Probe all providers in parallel
  const [zenmux, ollama, nvidia, openrouter] = await Promise.all([
    probeZenMux(config),
    probeOllama(config),
    probeNvidia(config),
    probeOpenRouter(config),
  ]);

  const providers = [zenmux, ollama, nvidia, openrouter];

  // Determine active provider
  let active: ProviderInfo;

  if (config.provider === 'ollama' && ollama.available) {
    active = ollama;
  } else if (config.provider === 'nvidia' && nvidia.available) {
    active = nvidia;
  } else if (config.provider === 'openrouter' && openrouter.available) {
    active = openrouter;
  } else if (config.provider === 'zenmux' && zenmux.available) {
    active = zenmux;
  } else if (zenmux.available) {
    // Default: prefer ZenMux if available
    active = zenmux;
  } else if (ollama.available) {
    // Fallback to Ollama
    active = ollama;
  } else if (nvidia.available) {
    // Fallback to Nvidia
    active = nvidia;
  } else if (openrouter.available) {
    // Fallback to OpenRouter
    active = openrouter;
  } else {
    // Nothing available — default to ZenMux config (will fail at API call time)
    active = zenmux;
  }

  return { providers, active };
}

/** Apply a provider to the config (mutates config) */
export function switchProvider(config: ZenCliConfig, provider: ProviderInfo): void {
  config.provider = provider.type;
  if (provider.type === 'ollama') {
    config.ollama.baseUrl = provider.baseUrl;
    config.ollama.model = provider.model;
    config.contextWindow = provider.contextWindow;
  } else if (provider.type === 'nvidia') {
    config.nvidia.baseUrl = provider.baseUrl;
    config.nvidia.model = provider.model;
    config.contextWindow = provider.contextWindow;
  } else if (provider.type === 'openrouter') {
    config.openrouter.baseUrl = provider.baseUrl;
    config.openrouter.model = provider.model;
    config.contextWindow = provider.contextWindow;
  }
}
