import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import { promisify } from "node:util";
import type {
  AgentEvent,
  AgentRoleId,
  ProviderId,
} from "@agent-office/protocol";
import {
  PROVIDER_METADATA,
  SCRUBBED_SECRET_ENV_KEYS,
  validateRuntimeForProvider,
} from "../../domain/providers.ts";
import {
  getJcodeToolsFlagForRole,
  mapToolToAgentStatus,
} from "../../domain/roles.ts";
import type {
  AgentRunRequest,
  AgentRuntimePort,
  SecretStorePort,
} from "../../ports/index.ts";

const execFileAsync = promisify(execFile);

const AUTH_CACHE_TTL_MS = 15_000;
const AUTH_ERROR_TTL_MS = 2_000;
const MAX_STDERR_TAIL_CHARS = 4096;

export interface JcodeAuthEntry {
  provider: string;
  status: string;
  authKind: string;
  detail: string;
}

const authCache = new Map<
  string,
  { expiresAt: number; value: Record<string, JcodeAuthEntry> }
>();
const inFlightAuthProbes = new Map<
  string,
  Promise<Record<string, JcodeAuthEntry>>
>();

export function clearJcodeAuthStatusCache(): void {
  authCache.clear();
  inFlightAuthProbes.clear();
}

export async function probeJcodeAuthStatus(
  jcodeBinary: string = "/home/skadi/.local/bin/jcode",
  options?: { forceRefresh?: boolean }
): Promise<Record<string, JcodeAuthEntry>> {
  const now = Date.now();
  if (!options?.forceRefresh) {
    const cached = authCache.get(jcodeBinary);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
  }

  const existing = inFlightAuthProbes.get(jcodeBinary);
  if (existing) {
    return existing;
  }

  const probePromise = (async (): Promise<Record<string, JcodeAuthEntry>> => {
    try {
      const { stdout } = await execFileAsync(jcodeBinary, ["auth", "status"], {
        timeout: 5000,
      });
      const out: Record<string, JcodeAuthEntry> = {};
      for (const rawLine of stdout.split("\n")) {
        const cols = rawLine.split("\t");
        if (cols.length >= 5) {
          const provider = (cols[0] ?? "").trim();
          if (!provider) continue;
          out[provider] = {
            provider,
            status: (cols[1] ?? "").trim(),
            authKind: (cols[2] ?? "").trim(),
            detail: (cols[4] ?? "").trim(),
          };
        }
      }
      const ttl = Object.keys(out).length > 0 ? AUTH_CACHE_TTL_MS : AUTH_ERROR_TTL_MS;
      authCache.set(jcodeBinary, { expiresAt: Date.now() + ttl, value: out });
      return out;
    } catch {
      const empty: Record<string, JcodeAuthEntry> = {};
      authCache.set(jcodeBinary, {
        expiresAt: Date.now() + AUTH_ERROR_TTL_MS,
        value: empty,
      });
      return empty;
    } finally {
      inFlightAuthProbes.delete(jcodeBinary);
    }
  })();

  inFlightAuthProbes.set(jcodeBinary, probePromise);
  return probePromise;
}

export function parseJcodeNdjsonLineToEvents(
  rawLine: string,
  ctx: {
    agentId: AgentRoleId;
    runId: string;
    ticketId: string;
    provider: ProviderId;
    zone: string;
  }
): AgentEvent[] {
  const trimmed = rawLine.trim();
  if (!trimmed) return [];
  const now = Date.now();
  const uid = () => crypto.randomUUID();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [
      {
        id: uid(),
        ts: now,
        t: "agent.text",
        agentId: ctx.agentId,
        runId: ctx.runId,
        ticketId: ctx.ticketId,
        delta: trimmed + "\n",
      },
    ];
  }

  const evType = String(parsed["type"] ?? parsed["event"] ?? "");
  const events: AgentEvent[] = [];

  if (
    evType === "text" ||
    evType === "text_delta" ||
    evType === "assistant" ||
    evType === "content_block_delta" ||
    typeof parsed["delta"] === "string" ||
    typeof parsed["text"] === "string"
  ) {
    const delta = String(parsed["delta"] ?? parsed["text"] ?? parsed["content"] ?? "");
    if (delta) {
      events.push({
        id: uid(),
        ts: now,
        t: "agent.text",
        agentId: ctx.agentId,
        runId: ctx.runId,
        ticketId: ctx.ticketId,
        delta,
      });
    }
  } else if (evType === "tool_start" || evType === "tool_use" || evType === "tool.start") {
    const toolName = String(parsed["tool"] ?? parsed["name"] ?? "bash");
    const callId = String(parsed["call_id"] ?? parsed["id"] ?? uid());
    const summary = String(parsed["summary"] ?? parsed["input"] ?? toolName).slice(0, 120);
    const status = mapToolToAgentStatus(toolName);
    events.push(
      {
        id: uid(),
        ts: now,
        t: "tool.start",
        agentId: ctx.agentId,
        runId: ctx.runId,
        ticketId: ctx.ticketId,
        callId,
        tool: toolName,
        summary,
      },
      {
        id: uid(),
        ts: now,
        t: "agent.status",
        agentId: ctx.agentId,
        runId: ctx.runId,
        ticketId: ctx.ticketId,
        status,
        detail: `${toolName}: ${summary}`,
        targetZone: ctx.zone,
      }
    );
  } else if (evType === "tool_end" || evType === "tool_result" || evType === "tool.end") {
    const callId = String(parsed["call_id"] ?? parsed["id"] ?? uid());
    const ok = parsed["ok"] !== false && parsed["is_error"] !== true;
    const preview = String(parsed["preview"] ?? parsed["output"] ?? "completed").slice(0, 140);
    events.push({
      id: uid(),
      ts: now,
      t: "tool.end",
      agentId: ctx.agentId,
      runId: ctx.runId,
      ticketId: ctx.ticketId,
      callId,
      ok,
      preview,
    });
  } else if (evType === "usage" || parsed["usage"] !== undefined) {
    const u = (parsed["usage"] as Record<string, unknown> | undefined) ?? parsed;
    const inTok = Number(u["input_tokens"] ?? u["inTok"] ?? 0);
    const outTok = Number(u["output_tokens"] ?? u["outTok"] ?? 0);
    const costUsd = Number(u["cost_usd"] ?? u["costUsd"] ?? (inTok + outTok) * 0.000003);
    events.push({
      id: uid(),
      ts: now,
      t: "usage",
      agentId: ctx.agentId,
      runId: ctx.runId,
      ticketId: ctx.ticketId,
      provider: ctx.provider,
      inTok,
      outTok,
      costUsd,
    });
  }

  return events;
}

export type JcodeLineStreamFactory = (args: {
  binary: string;
  cliArgs: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
}) => AsyncIterable<string>;

export const defaultLineStreamFactory: JcodeLineStreamFactory = async function* ({
  binary,
  cliArgs,
  cwd,
  env,
  signal,
}) {
  const child = spawn(binary, cliArgs, {
    cwd,
    env,
    signal,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buffer = "";
  let stderrTail = "";

  const queue: string[] = [];
  let head = 0;
  let done = false;
  let error: Error | null = null;
  let notify: (() => void) | null = null;

  const wake = () => {
    if (notify) {
      const fn = notify;
      notify = null;
      fn();
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const l of lines) {
      if (l.trim()) queue.push(l);
    }
    wake();
  });

  // Drain stderr continuously so verbose child output never fills the 64 KiB OS pipe buffer.
  child.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(
      -MAX_STDERR_TAIL_CHARS
    );
  });

  child.on("error", (err) => {
    error = err;
    done = true;
    wake();
  });

  child.on("close", (code) => {
    if (buffer.trim()) queue.push(buffer);
    if (code !== 0 && code !== null && !error) {
      const detail = stderrTail.trim();
      error = new Error(
        detail ? `jcode exited with code ${code}: ${detail}` : `jcode exited with code ${code}`
      );
    }
    done = true;
    wake();
  });

  while (!done || head < queue.length) {
    if (head < queue.length) {
      const line = queue[head++]!;
      if (head >= 256 && head * 2 >= queue.length) {
        queue.splice(0, head);
        head = 0;
      }
      yield line;
    } else if (!done) {
      await new Promise<void>((r) => {
        notify = r;
      });
    }
  }

  if (error) throw error;
};

export class JcodeRuntimeAdapter implements AgentRuntimePort {
  readonly kind = "jcode" as const;
  private readonly binary: string;
  private readonly secrets: SecretStorePort;
  private readonly streamFactory: JcodeLineStreamFactory;

  constructor(
    secrets: SecretStorePort,
    binary: string = "/home/skadi/.local/bin/jcode",
    streamFactory: JcodeLineStreamFactory = defaultLineStreamFactory
  ) {
    this.secrets = secrets;
    this.binary = binary;
    this.streamFactory = streamFactory;
  }

  async *run(req: AgentRunRequest): AsyncIterable<AgentEvent> {
    const uid = () => crypto.randomUUID();
    const provider = req.provider;
    try {
      validateRuntimeForProvider(provider, this.kind);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield {
        id: uid(),
        ts: Date.now(),
        t: "agent.status",
        agentId: req.role.id,
        runId: req.runId,
        ticketId: req.ticket.id,
        status: "error",
        detail: msg,
        targetZone: req.role.zone,
      };
      throw err;
    }

    const providerMeta = PROVIDER_METADATA[provider];
    const jcodeProvider = providerMeta.jcodeProvider;
    const toolsFlag = getJcodeToolsFlagForRole(req.role.id, req.role);
    const cliArgs = [
      "run",
      "--ndjson",
      "--quiet",
      "--no-update",
      "-p",
      jcodeProvider,
      "-C",
      req.worktreePath,
      "--tools",
      toolsFlag,
    ];
    const model = req.model?.trim();
    if (model) {
      cliArgs.push("-m", model);
    }
    cliArgs.push(req.prompt);

    // Strip all provider secrets before injecting only the active API-key provider's key.
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const keyName of SCRUBBED_SECRET_ENV_KEYS) {
      delete env[keyName];
    }
    if (providerMeta.authMode === "api-key") {
      const secret = this.secrets.getSecret(providerMeta.envKey);
      if (secret && secret.trim()) {
        env[providerMeta.envKey] = secret;
      }
    }
    yield {
      id: uid(),
      ts: Date.now(),
      t: "agent.status",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      status: "thinking",
      detail: `Running jcode (-p ${jcodeProvider} --tools ${toolsFlag})`,
      targetZone: req.role.zone,
    };

    try {
      for await (const line of this.streamFactory({
        binary: this.binary,
        cliArgs,
        cwd: req.worktreePath,
        env,
        signal: req.signal,
      })) {
        const mapped = parseJcodeNdjsonLineToEvents(line, {
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          provider,
          zone: req.role.zone,
        });
        for (const ev of mapped) {
          yield ev;
        }
      }

      yield {
        id: uid(),
        ts: Date.now(),
        t: "agent.status",
        agentId: req.role.id,
        runId: req.runId,
        ticketId: req.ticket.id,
        status: "done",
        detail: `jcode (${jcodeProvider}) completed stage ${req.ticket.stage}`,
        targetZone: req.role.zone,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield {
        id: uid(),
        ts: Date.now(),
        t: "agent.status",
        agentId: req.role.id,
        runId: req.runId,
        ticketId: req.ticket.id,
        status: "error",
        detail: `jcode (${jcodeProvider}) error: ${msg}`,
        targetZone: req.role.zone,
      };
      throw err;
    }
  }
}
