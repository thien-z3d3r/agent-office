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
  defaultRuntime: RuntimeKind;
  jcodeProvider: string;
  vendorGroup: "google" | "anthropic" | "openai" | "moonshot";
  envKey: ManagedSecretKey;
  defaultModel: string;
}

export const PROVIDER_METADATA: Record<ProviderId, ProviderMetadata> = {
  antigravity: {
    defaultRuntime: "jcode",
    jcodeProvider: "antigravity",
    vendorGroup: "google",
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-pro",
  },
  claude: {
    defaultRuntime: "ai-sdk",
    jcodeProvider: "anthropic-api",
    vendorGroup: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-5-20250929",
  },
  openai_oauth: {
    defaultRuntime: "jcode",
    jcodeProvider: "openai",
    vendorGroup: "openai",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4.1",
  },
  openai_api: {
    defaultRuntime: "ai-sdk",
    jcodeProvider: "openai-api",
    vendorGroup: "openai",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4.1",
  },
  kimi_code: {
    defaultRuntime: "ai-sdk",
    jcodeProvider: "kimi",
    vendorGroup: "moonshot",
    envKey: "KIMI_API_KEY",
    defaultModel: "kimi-for-coding",
  },
  gemini: {
    defaultRuntime: "ai-sdk",
    jcodeProvider: "gemini-api",
    vendorGroup: "google",
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
  },
};
