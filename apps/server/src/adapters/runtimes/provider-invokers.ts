import type { ProviderId } from "@agent-office/protocol";
import { parseStructuredToolBlocks } from "./tool-parser.ts";

export interface ModelTurnResult {
  text: string;
  toolCalls?: Array<{
    id: string;
    tool: string;
    args: Record<string, string | undefined>;
  }>;
  inTok: number;
  outTok: number;
  costUsd: number;
}

export type ProviderModelInvoker = (args: {
  provider: ProviderId;
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  signal: AbortSignal;
}) => Promise<ModelTurnResult>;

async function invokeAnthropic(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  signal: AbortSignal;
}): Promise<ModelTurnResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 2048,
      system: args.systemPrompt,
      messages: args.messages,
    }),
    signal: args.signal,
  });
  if (!res.ok) {
    throw new Error(`Claude API HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? [])
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
  const inTok = data.usage?.input_tokens ?? 200;
  const outTok = data.usage?.output_tokens ?? 100;
  return {
    text,
    toolCalls: parseStructuredToolBlocks(text),
    inTok,
    outTok,
    costUsd: Number(((inTok * 3 + outTok * 15) / 1_000_000).toFixed(6)),
  };
}

async function invokeGemini(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  signal: AbortSignal;
}): Promise<ModelTurnResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    args.model
  )}:generateContent?key=${encodeURIComponent(args.apiKey)}`;
  const contents = [
    {
      role: "user",
      parts: [
        {
          text: `${args.systemPrompt}\n\n${args.messages
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n\n")}`,
        },
      ],
    },
  ];
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents }),
    signal: args.signal,
  });
  if (!res.ok) {
    throw new Error(`Gemini API HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n") ??
    "";
  const inTok = data.usageMetadata?.promptTokenCount ?? 200;
  const outTok = data.usageMetadata?.candidatesTokenCount ?? 100;
  return {
    text,
    toolCalls: parseStructuredToolBlocks(text),
    inTok,
    outTok,
    costUsd: Number(((inTok * 0.3 + outTok * 1.2) / 1_000_000).toFixed(6)),
  };
}

async function invokeOpenAiCompatible(args: {
  provider: ProviderId;
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  signal: AbortSignal;
}): Promise<ModelTurnResult> {
  const baseUrl =
    args.provider === "kimi_code"
      ? "https://api.kimi.com/coding/v1"
      : "https://api.openai.com/v1";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      messages: [{ role: "system", content: args.systemPrompt }, ...args.messages],
    }),
    signal: args.signal,
  });
  if (!res.ok) {
    throw new Error(`${args.provider} API HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  const inTok = data.usage?.prompt_tokens ?? 200;
  const outTok = data.usage?.completion_tokens ?? 100;
  return {
    text,
    toolCalls: parseStructuredToolBlocks(text),
    inTok,
    outTok,
    costUsd: Number(((inTok * 2 + outTok * 8) / 1_000_000).toFixed(6)),
  };
}

export const defaultProviderInvoker: ProviderModelInvoker = async (args) => {
  if (args.provider === "claude") {
    return invokeAnthropic(args);
  }
  if (args.provider === "gemini") {
    return invokeGemini(args);
  }
  if (args.provider === "openai_api" || args.provider === "kimi_code") {
    return invokeOpenAiCompatible(args);
  }
  throw new Error(
    `Provider "${args.provider}" is not supported by ai-sdk direct HTTP invoker. Use "jcode" runtime instead.`
  );
};
