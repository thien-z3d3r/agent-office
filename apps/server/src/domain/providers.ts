import type { ProviderId, RuntimeKind } from "@agent-office/protocol";

export const MANAGED_SECRET_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "KIMI_API_KEY",
  "GEMINI_API_KEY",
] as const;

export type ManagedSecretKey = (typeof MANAGED_SECRET_KEYS)[number];

export const MANAGED_SECRET_KEY_SET: ReadonlySet<string> = new Set(
  MANAGED_SECRET_KEYS
);

export const SCRUBBED_SECRET_ENV_KEYS = [
  ...MANAGED_SECRET_KEYS,
  "MOONSHOT_API_KEY",
  "GOOGLE_API_KEY",
  "OFFICE_MASTER_KEY",
] as const;

export interface ProviderMetadata {
  authMode: "jcode-oauth" | "api-key";
  defaultRuntime: RuntimeKind;
  supportedRuntimes: readonly RuntimeKind[];
  jcodeProvider: string;
  envKey: ManagedSecretKey;
  defaultModel: string;
}

export const PROVIDER_METADATA: Record<ProviderId, ProviderMetadata> = {
  antigravity: {
    authMode: "jcode-oauth",
    defaultRuntime: "jcode",
    supportedRuntimes: ["jcode", "scripted"],
    jcodeProvider: "antigravity",
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-pro",
  },
  claude: {
    authMode: "api-key",
    defaultRuntime: "ai-sdk",
    supportedRuntimes: ["ai-sdk", "jcode", "claude-agent-sdk", "scripted"],
    jcodeProvider: "anthropic-api",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-5-20250929",
  },
  openai_oauth: {
    authMode: "jcode-oauth",
    defaultRuntime: "jcode",
    supportedRuntimes: ["jcode", "codex-sdk", "scripted"],
    jcodeProvider: "openai",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4.1",
  },
  openai_api: {
    authMode: "api-key",
    defaultRuntime: "ai-sdk",
    supportedRuntimes: ["ai-sdk", "jcode", "codex-sdk", "scripted"],
    jcodeProvider: "openai-api",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4.1",
  },
  kimi_code: {
    authMode: "api-key",
    defaultRuntime: "ai-sdk",
    supportedRuntimes: ["ai-sdk", "jcode", "scripted"],
    jcodeProvider: "kimi",
    envKey: "KIMI_API_KEY",
    defaultModel: "kimi-for-coding",
  },
  gemini: {
    authMode: "api-key",
    defaultRuntime: "ai-sdk",
    supportedRuntimes: ["ai-sdk", "jcode", "scripted"],
    jcodeProvider: "gemini-api",
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
  },
};

export function validateRuntimeForProvider(
  provider: ProviderId,
  runtime: RuntimeKind
): void {
  const meta = PROVIDER_METADATA[provider];
  if (meta.supportedRuntimes.includes(runtime)) {
    return;
  }
  if (meta.authMode === "jcode-oauth" && runtime === "ai-sdk") {
    throw new Error(
      `Provider "${provider}" uses jcode OAuth and does not support the "ai-sdk" runtime. Use "jcode" or switch to an API-key provider.`
    );
  }
  throw new Error(
    `Runtime "${runtime}" is not supported for provider "${provider}". Supported runtimes: ${meta.supportedRuntimes.join(", ")}.`
  );
}

export interface ResolvedProviderDefaults {
  provider: ProviderId;
  runtime: RuntimeKind;
  model: string | null;
  defaultModel: string;
}

export function resolveProviderDefaults(
  provider: ProviderId,
  runtime?: RuntimeKind,
  model?: string | null
): ResolvedProviderDefaults {
  const meta = PROVIDER_METADATA[provider];
  const resolvedRuntime = runtime ?? meta.defaultRuntime;
  validateRuntimeForProvider(provider, resolvedRuntime);
  const trimmed = model?.trim();
  return {
    provider,
    runtime: resolvedRuntime,
    model: trimmed ? trimmed : null,
    defaultModel: meta.defaultModel,
  };
}
