import type { ProviderId, RuntimeKind } from "@agent-office/protocol";

export interface FrontendProviderMeta {
  id: ProviderId;
  label: string;
  shortLabel: string;
  authMode: "jcode-oauth" | "api-key";
  defaultRuntime: RuntimeKind;
  compatibleRuntimes: readonly RuntimeKind[];
  defaultModel: string;
  jcodeAuthKey:
    | "antigravity"
    | "openai"
    | "openai-api"
    | "anthropic-api"
    | "kimi"
    | "gemini-api";
  secretKey?:
    | "ANTHROPIC_API_KEY"
    | "OPENAI_API_KEY"
    | "KIMI_API_KEY"
    | "GEMINI_API_KEY";
  secretLabel?: string;
  hint: string;
}

export const RUNTIME_LABELS: Record<RuntimeKind, string> = {
  "ai-sdk": "Direct AI SDK (Encrypted API Key)",
  jcode: "jcode CLI (Local Harness)",
  "claude-agent-sdk": "Claude Agent SDK",
  "codex-sdk": "Codex SDK",
  scripted: "Scripted Simulation",
};

export const PROVIDER_CATALOG: readonly FrontendProviderMeta[] = [
  {
    id: "antigravity",
    label: "Antigravity (jcode OAuth)",
    shortLabel: "Antigravity",
    authMode: "jcode-oauth",
    defaultRuntime: "jcode",
    compatibleRuntimes: ["jcode"],
    defaultModel: "gemini-2.5-pro",
    jcodeAuthKey: "antigravity",
    hint: "Uses local jcode CLI OAuth state. Tokens stay inside jcode.",
  },
  {
    id: "claude",
    label: "Claude (Console API Key)",
    shortLabel: "Claude",
    authMode: "api-key",
    defaultRuntime: "ai-sdk",
    compatibleRuntimes: ["ai-sdk", "jcode"],
    defaultModel: "claude-sonnet-4-5-20250929",
    jcodeAuthKey: "anthropic-api",
    secretKey: "ANTHROPIC_API_KEY",
    secretLabel: "Claude Console API Key (ANTHROPIC_API_KEY)",
    hint: "Used when Claude is selected as the single active office provider.",
  },
  {
    id: "openai_oauth",
    label: "OpenAI (ChatGPT OAuth)",
    shortLabel: "OpenAI (ChatGPT OAuth)",
    authMode: "jcode-oauth",
    defaultRuntime: "jcode",
    compatibleRuntimes: ["jcode"],
    defaultModel: "gpt-4.1",
    jcodeAuthKey: "openai",
    hint: "Uses local jcode ChatGPT OAuth login. Tokens stay inside jcode.",
  },
  {
    id: "openai_api",
    label: "OpenAI (Platform API Key)",
    shortLabel: "OpenAI (API Key)",
    authMode: "api-key",
    defaultRuntime: "ai-sdk",
    compatibleRuntimes: ["ai-sdk", "jcode"],
    defaultModel: "gpt-4.1",
    jcodeAuthKey: "openai-api",
    secretKey: "OPENAI_API_KEY",
    secretLabel: "OpenAI API Key (OPENAI_API_KEY)",
    hint: "Used when OpenAI API Key is selected as the single active office provider.",
  },
  {
    id: "kimi_code",
    label: "Kimi Code (Coding API Key)",
    shortLabel: "Kimi Code",
    authMode: "api-key",
    defaultRuntime: "ai-sdk",
    compatibleRuntimes: ["ai-sdk", "jcode"],
    defaultModel: "kimi-for-coding",
    jcodeAuthKey: "kimi",
    secretKey: "KIMI_API_KEY",
    secretLabel: "Kimi Code API Key (KIMI_API_KEY)",
    hint: "Used when Kimi Code is selected (api.kimi.com/coding/v1).",
  },
  {
    id: "gemini",
    label: "Gemini (Google API Key)",
    shortLabel: "Gemini",
    authMode: "api-key",
    defaultRuntime: "ai-sdk",
    compatibleRuntimes: ["ai-sdk", "jcode"],
    defaultModel: "gemini-2.5-flash",
    jcodeAuthKey: "gemini-api",
    secretKey: "GEMINI_API_KEY",
    secretLabel: "Gemini API Key (GEMINI_API_KEY)",
    hint: "Used when Gemini is selected as the single active office provider.",
  },
];

export const PROVIDER_META_BY_ID: Record<ProviderId, FrontendProviderMeta> =
  Object.fromEntries(PROVIDER_CATALOG.map((p) => [p.id, p])) as Record<
    ProviderId,
    FrontendProviderMeta
  >;
