import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProviderConfig, ProviderId } from "@agent-office/protocol";
import {
  PROVIDER_METADATA,
  SCRUBBED_SECRET_ENV_KEYS,
} from "../../domain/providers.ts";
import type {
  ModelDiscoveryPort,
  ModelDiscoveryResult,
  SecretStorePort,
} from "../../ports/index.ts";

const execFileAsync = promisify(execFile);

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_ERROR_TTL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 3_500;
const DEFAULT_JCODE_BINARY = "/home/skadi/.local/bin/jcode";
const DEFAULT_KIMI_BASE_URL = "https://api.kimi.com/coding/v1";

export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: { timeout?: number; env?: NodeJS.ProcessEnv }
) => Promise<{ stdout: string; stderr: string }>;

export type FetchFn = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export interface ModelDiscoveryDeps {
  execFileFn?: ExecFileFn;
  fetchFn?: FetchFn;
  nowFn?: () => number;
  ttlMs?: number;
  errorTtlMs?: number;
  timeoutMs?: number;
}

function dedupeModelIds(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "default" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function buildScrubbedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const keyName of SCRUBBED_SECRET_ENV_KEYS) {
    delete env[keyName];
  }
  return env;
}

function parseJcodeModelsOutput(stdout: string): string[] {
  const parsed = JSON.parse(stdout) as {
    models?: unknown[];
    routes?: Array<{ model?: unknown; available?: unknown }>;
  };
  if (Array.isArray(parsed.routes) && parsed.routes.length > 0) {
    const availableRoutes = parsed.routes
      .filter((r) => r && r.available !== false)
      .map((r) => r.model);
    const dedupedRoutes = dedupeModelIds(availableRoutes);
    if (dedupedRoutes.length > 0) {
      return dedupedRoutes;
    }
  }
  return Array.isArray(parsed.models) ? dedupeModelIds(parsed.models) : [];
}

function parseOpenAiStyleModels(
  data: unknown,
  filterChatFamilies: boolean
): string[] {
  const obj = data as { data?: Array<{ id?: unknown }> };
  if (!Array.isArray(obj.data)) return [];
  const all = dedupeModelIds(obj.data.map((m) => m?.id));
  if (!filterChatFamilies) return all;
  const filtered = all.filter((id) =>
    /^(gpt-|o1\b|o1-|o3\b|o3-|o4\b|o4-|chatgpt-)/i.test(id)
  );
  return filtered.length > 0 ? filtered : all;
}

function parseGeminiModels(data: unknown): string[] {
  const obj = data as {
    models?: Array<{
      name?: unknown;
      supportedGenerationMethods?: unknown[];
    }>;
  };
  if (!Array.isArray(obj.models)) return [];
  const ids = obj.models
    .filter((entry) => {
      if (!entry || typeof entry.name !== "string") return false;
      if (!Array.isArray(entry.supportedGenerationMethods)) return true;
      return entry.supportedGenerationMethods.includes("generateContent");
    })
    .map((entry) => String(entry.name).replace(/^models\//, ""));
  return dedupeModelIds(ids);
}

export function createModelDiscoveryAdapter(
  secrets: SecretStorePort,
  providerConfigs?: Partial<Record<ProviderId, ProviderConfig>>,
  deps?: ModelDiscoveryDeps
): ModelDiscoveryPort {
  const execFileFn: ExecFileFn =
    deps?.execFileFn ??
    ((file, args, options) => execFileAsync(file, [...args], options));
  const fetchFn: FetchFn = deps?.fetchFn ?? ((input, init) => fetch(input, init));
  const nowFn = deps?.nowFn ?? (() => Date.now());
  const ttlMs = deps?.ttlMs ?? DEFAULT_TTL_MS;
  const errorTtlMs = deps?.errorTtlMs ?? DEFAULT_ERROR_TTL_MS;
  const timeoutMs = deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const cache = new Map<
    ProviderId,
    { expiresAt: number; result: ModelDiscoveryResult }
  >();
  const inFlight = new Map<ProviderId, Promise<ModelDiscoveryResult>>();
  // Track cache invalidations so an in-flight probe from before clearCache cannot repopulate stale data.
  const generationByProvider = new Map<ProviderId, number>();

  const getGeneration = (provider: ProviderId): number =>
    generationByProvider.get(provider) ?? 0;

  async function probeProvider(
    provider: ProviderId
  ): Promise<ModelDiscoveryResult> {
    const discoveredAt = new Date(nowFn()).toISOString();
    const meta = PROVIDER_METADATA[provider];
    const cfg = providerConfigs?.[provider];

    try {
      if (meta.authMode === "jcode-oauth") {
        const binary = cfg?.binary ?? DEFAULT_JCODE_BINARY;
        const jcodeProvider = cfg?.jcodeProvider ?? meta.jcodeProvider;
        const { stdout } = await execFileFn(
          binary,
          ["model", "list", "-p", jcodeProvider, "--json"],
          { timeout: timeoutMs, env: buildScrubbedEnv() }
        );
        const ids = parseJcodeModelsOutput(stdout);
        return {
          source: ids.length > 0 ? "live" : "curated",
          discoveredIds: ids,
          discoveredAt,
        };
      }

      const apiKey = secrets.getSecret(meta.envKey)?.trim();
      if (!apiKey) {
        return {
          source: "curated",
          discoveredIds: [],
          discoveredAt,
        };
      }

      const signal = AbortSignal.timeout(timeoutMs);
      let ids: string[] = [];

      if (provider === "claude") {
        const res = await fetchFn("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ids = parseOpenAiStyleModels(await res.json(), false);
      } else if (provider === "openai_api") {
        const res = await fetchFn("https://api.openai.com/v1/models", {
          headers: {
            authorization: `Bearer ${apiKey}`,
          },
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ids = parseOpenAiStyleModels(await res.json(), true);
      } else if (provider === "kimi_code") {
        const baseUrl = (cfg?.baseUrl ?? DEFAULT_KIMI_BASE_URL).replace(
          /\/+$/,
          ""
        );
        const res = await fetchFn(`${baseUrl}/models`, {
          headers: {
            authorization: `Bearer ${apiKey}`,
          },
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ids = parseOpenAiStyleModels(await res.json(), false);
      } else if (provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
          apiKey
        )}`;
        const res = await fetchFn(url, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ids = parseGeminiModels(await res.json());
      }

      return {
        source: ids.length > 0 ? "live" : "curated",
        discoveredIds: ids,
        discoveredAt,
      };
    } catch {
      return {
        source: "curated",
        discoveredIds: [],
        discoveredAt,
      };
    }
  }

  return {
    async discoverModels(
      provider: ProviderId,
      options?: { forceRefresh?: boolean }
    ): Promise<ModelDiscoveryResult> {
      const now = nowFn();
      if (!options?.forceRefresh) {
        const cached = cache.get(provider);
        if (cached && cached.expiresAt > now) {
          return cached.result;
        }
        const pending = inFlight.get(provider);
        if (pending) {
          return pending;
        }
      } else {
        generationByProvider.set(provider, getGeneration(provider) + 1);
      }

      const startGen = getGeneration(provider);
      const runProbe = async (): Promise<ModelDiscoveryResult> => {
        try {
          const result = await probeProvider(provider);
          if (getGeneration(provider) === startGen) {
            const ttl = result.source === "live" ? ttlMs : errorTtlMs;
            cache.set(provider, {
              expiresAt: nowFn() + ttl,
              result,
            });
          }
          return result;
        } finally {
          if (inFlight.get(provider) === promise) {
            inFlight.delete(provider);
          }
        }
      };
      const promise = runProbe();

      inFlight.set(provider, promise);
      return promise;
    },

    clearCache(provider?: ProviderId): void {
      if (provider) {
        generationByProvider.set(provider, getGeneration(provider) + 1);
        cache.delete(provider);
        inFlight.delete(provider);
        return;
      }
      for (const key of [
        "antigravity",
        "claude",
        "openai_oauth",
        "openai_api",
        "kimi_code",
        "gemini",
      ] as const) {
        generationByProvider.set(key, getGeneration(key) + 1);
      }
      cache.clear();
      inFlight.clear();
    },
  };
}
