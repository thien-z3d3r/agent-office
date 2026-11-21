import {
  ModelIdValueSchema,
  type ModelCatalogEntry,
  type ModelTier,
  type ProviderId,
} from "@agent-office/protocol";
import { PROVIDER_METADATA } from "./providers.ts";

export const ALL_PROVIDER_IDS: readonly ProviderId[] = [
  "antigravity",
  "claude",
  "openai_oauth",
  "openai_api",
  "kimi_code",
  "gemini",
];

export const CURATED_MODEL_CATALOG: Record<
  ProviderId,
  readonly ModelCatalogEntry[]
> = {
  antigravity: [
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      tier: "flagship",
      capabilitySummary: "Deep reasoning and multi-file code architecture",
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      isDefault: true,
      source: "curated",
      available: true,
    },
    {
      id: "gemini-3-flash",
      label: "Gemini 3 Flash",
      tier: "fast",
      capabilitySummary: "Low-latency coding, triage, and fast iteration",
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      source: "curated",
      available: true,
    },
    {
      id: "claude-opus-5-5-high",
      label: "Claude Opus 5.5 High",
      tier: "reasoning",
      capabilitySummary: "High-effort architectural design and security review",
      contextWindow: 200000,
      maxOutputTokens: 32000,
      source: "curated",
      available: true,
    },
    {
      id: "claude-sonnet-5-5-medium",
      label: "Claude Sonnet 5.5 Medium",
      tier: "balanced",
      capabilitySummary: "Balanced implementation, tests, and PR review",
      contextWindow: 200000,
      maxOutputTokens: 16384,
      source: "curated",
      available: true,
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      tier: "fast",
      capabilitySummary: "Fast everyday editing, specs, and verification",
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      source: "curated",
      available: true,
    },
    {
      id: "gpt-oss-120b-medium",
      label: "GPT-OSS 120B Medium",
      tier: "coding",
      capabilitySummary: "Open-weight reasoning and code generation",
      contextWindow: 131072,
      maxOutputTokens: 16384,
      source: "curated",
      available: true,
    },
  ],
  claude: [
    {
      id: "claude-sonnet-4-5-20250929",
      label: "Claude Sonnet 4.5",
      tier: "balanced",
      capabilitySummary:
        "Primary coding, UI/API implementation, and test authoring",
      contextWindow: 200000,
      maxOutputTokens: 64000,
      isDefault: true,
      source: "curated",
      available: true,
    },
    {
      id: "claude-opus-4-5-20251101",
      label: "Claude Opus 4.5",
      tier: "flagship",
      capabilitySummary:
        "Complex architecture, ADR authoring, and deep code review",
      contextWindow: 200000,
      maxOutputTokens: 64000,
      source: "curated",
      available: true,
    },
    {
      id: "claude-opus-4-1-20250805",
      label: "Claude Opus 4.1",
      tier: "reasoning",
      capabilitySummary: "Thorough multi-step reasoning and security auditing",
      contextWindow: 200000,
      maxOutputTokens: 32000,
      source: "curated",
      available: true,
    },
    {
      id: "claude-haiku-4-5-20251001",
      label: "Claude Haiku 4.5",
      tier: "fast",
      capabilitySummary:
        "Rapid ticket triage, summaries, and lightweight checks",
      contextWindow: 200000,
      maxOutputTokens: 64000,
      source: "curated",
      available: true,
    },
  ],
  openai_oauth: [
    {
      id: "gpt-5.4",
      label: "GPT-5.4",
      tier: "flagship",
      capabilitySummary:
        "Flagship ChatGPT OAuth reasoning and full-stack coding",
      contextWindow: 272000,
      maxOutputTokens: 32768,
      isDefault: true,
      source: "curated",
      available: true,
    },
    {
      id: "gpt-5.3-codex",
      label: "GPT-5.3 Codex",
      tier: "coding",
      capabilitySummary:
        "Agentic repository editing, refactoring, and test runs",
      contextWindow: 272000,
      maxOutputTokens: 32768,
      source: "curated",
      available: true,
    },
    {
      id: "gpt-5.6-pro[web]",
      label: "GPT-5.6 Pro (Web)",
      tier: "reasoning",
      capabilitySummary:
        "ChatGPT Web route for deep analysis when OAuth is inactive",
      contextWindow: 200000,
      maxOutputTokens: 32768,
      source: "curated",
      available: true,
    },
    {
      id: "gpt-5.2-codex",
      label: "GPT-5.2 Codex",
      tier: "balanced",
      capabilitySummary: "Reliable multi-step coding and review via OAuth",
      contextWindow: 272000,
      maxOutputTokens: 32768,
      source: "curated",
      available: true,
    },
    {
      id: "gpt-5-mini",
      label: "GPT-5 Mini",
      tier: "fast",
      capabilitySummary: "Fast triage and lightweight verification",
      contextWindow: 272000,
      maxOutputTokens: 16384,
      source: "curated",
      available: true,
    },
  ],
  openai_api: [
    {
      id: "gpt-4.1",
      label: "GPT-4.1",
      tier: "balanced",
      capabilitySummary:
        "Balanced instruction following, coding, and tool use",
      contextWindow: 1047576,
      maxOutputTokens: 32768,
      isDefault: true,
      source: "curated",
      available: true,
    },
    {
      id: "gpt-5",
      label: "GPT-5",
      tier: "flagship",
      capabilitySummary:
        "Flagship reasoning, architecture, and complex code changes",
      contextWindow: 400000,
      maxOutputTokens: 128000,
      source: "curated",
      available: true,
    },
    {
      id: "o4-mini",
      label: "o4-mini",
      tier: "reasoning",
      capabilitySummary:
        "Fast structured reasoning for review, QA, and debugging",
      contextWindow: 200000,
      maxOutputTokens: 100000,
      source: "curated",
      available: true,
    },
    {
      id: "gpt-4.1-mini",
      label: "GPT-4.1 Mini",
      tier: "fast",
      capabilitySummary: "Cost-effective triage, docs, and rapid checks",
      contextWindow: 1047576,
      maxOutputTokens: 32768,
      source: "curated",
      available: true,
    },
  ],
  kimi_code: [
    {
      id: "kimi-for-coding",
      label: "Kimi for Coding",
      tier: "coding",
      capabilitySummary:
        "Dedicated coding-tuned model for repo edits and tool loops",
      contextWindow: 262144,
      maxOutputTokens: 32768,
      isDefault: true,
      source: "curated",
      available: true,
    },
    {
      id: "kimi-k2-thinking",
      label: "Kimi K2 Thinking",
      tier: "reasoning",
      capabilitySummary:
        "Extended chain-of-thought reasoning for architecture and audits",
      contextWindow: 262144,
      maxOutputTokens: 32768,
      source: "curated",
      available: true,
    },
    {
      id: "kimi-k2-0905-preview",
      label: "Kimi K2 Preview",
      tier: "flagship",
      capabilitySummary:
        "High-capability general engineering and multi-file synthesis",
      contextWindow: 262144,
      maxOutputTokens: 32768,
      source: "curated",
      available: true,
    },
    {
      id: "kimi-k2-turbo-preview",
      label: "Kimi K2 Turbo",
      tier: "fast",
      capabilitySummary:
        "High-throughput coding, triage, and fast test iteration",
      contextWindow: 262144,
      maxOutputTokens: 32768,
      source: "curated",
      available: true,
    },
  ],
  gemini: [
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      tier: "fast",
      capabilitySummary:
        "Fast price-performance coding, specs, and tool execution",
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      isDefault: true,
      source: "curated",
      available: true,
    },
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      tier: "flagship",
      capabilitySummary:
        "Advanced reasoning, system design, and deep code review",
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      source: "curated",
      available: true,
    },
    {
      id: "gemini-2.5-flash-lite",
      label: "Gemini 2.5 Flash-Lite",
      tier: "fast",
      capabilitySummary: "Ultra-lightweight triage and routine verification",
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      source: "curated",
      available: true,
    },
  ],
};

export function getCuratedModelsForProvider(
  provider: ProviderId
): ModelCatalogEntry[] {
  return CURATED_MODEL_CATALOG[provider].map((entry) => ({ ...entry }));
}

function inferTierFromId(lowerId: string): ModelTier {
  if (lowerId.includes("codex") || lowerId.includes("coding")) return "coding";
  if (
    lowerId.includes("thinking") ||
    lowerId.includes("reason") ||
    /^o\d/.test(lowerId) ||
    lowerId.includes("-high")
  ) {
    return "reasoning";
  }
  if (
    lowerId.includes("flash") ||
    lowerId.includes("haiku") ||
    lowerId.includes("mini") ||
    lowerId.includes("nano") ||
    lowerId.includes("lite") ||
    lowerId.includes("turbo")
  ) {
    return "fast";
  }
  if (
    lowerId.includes("opus") ||
    lowerId.includes("pro") ||
    lowerId.includes("gpt-5") ||
    lowerId.includes("gpt-6")
  ) {
    return "flagship";
  }
  return "balanced";
}

export function inferLiveModelMetadata(
  provider: ProviderId,
  modelId: string
): ModelCatalogEntry {
  const trimmed = modelId.trim();
  const lower = trimmed.toLowerCase();
  const tier = inferTierFromId(lower);
  const summaryByTier: Record<ModelTier, string> = {
    flagship: "Live-discovered flagship model from provider catalog",
    reasoning: "Live-discovered reasoning model from provider catalog",
    coding: "Live-discovered coding model from provider catalog",
    fast: "Live-discovered low-latency model from provider catalog",
    balanced: "Live-discovered general-purpose model from provider catalog",
    custom: "Custom user-specified model ID",
  };
  return {
    id: trimmed,
    label: trimmed,
    tier,
    capabilitySummary: summaryByTier[tier],
    isDefault: trimmed === PROVIDER_METADATA[provider].defaultModel,
    source: "live",
    available: true,
  };
}

export function mergeCuratedAndDiscoveredModels(
  provider: ProviderId,
  discoveredIds: readonly string[]
): ModelCatalogEntry[] {
  const merged = getCuratedModelsForProvider(provider);
  const seen = new Set(merged.map((m) => m.id));

  for (const rawId of discoveredIds) {
    if (typeof rawId !== "string") continue;
    const id = rawId.trim();
    if (!id || id === "default" || seen.has(id)) continue;
    const parsed = ModelIdValueSchema.safeParse(id);
    if (!parsed.success) continue;
    seen.add(parsed.data);
    merged.push(inferLiveModelMetadata(provider, parsed.data));
  }

  return merged;
}

export function validateModelString(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Invalid model name" };
  }
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    return { ok: false, error: "Model ID cannot contain control characters" };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  const parsed = ModelIdValueSchema.safeParse(trimmed);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid model name",
    };
  }
  return { ok: true, value: parsed.data };
}
