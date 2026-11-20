import crypto from "node:crypto";
import type { AgentEvent } from "@agent-office/protocol";
import { evaluateCommandPolicy } from "../../domain/command-policy.ts";
import { mapToolToAgentStatus } from "../../domain/roles.ts";
import type { AgentRunRequest, AgentRuntimePort } from "../../ports/index.ts";

export type ClaudeSdkRawMessage =
  | { type: "assistant"; text: string }
  | {
      type: "tool_use";
      callId: string;
      toolName: string;
      input: Record<string, string | undefined>;
    }
  | { type: "tool_result"; callId: string; ok: boolean; output: string }
  | {
      type: "result";
      subtype: "success" | "error";
      inTok?: number;
      outTok?: number;
      total_cost_usd?: number;
    };

export type CodexSdkRawEvent =
  | {
      type: "item.started";
      item: { id: string; type: "message" | "command_execution" | "file_change"; summary: string };
    }
  | {
      type: "item.completed";
      item: { id: string; type: "message" | "command_execution" | "file_change"; text?: string; ok?: boolean };
    }
  | {
      type: "turn.completed";
      turn: { status: "completed" | "failed" };
      usage?: { input_tokens: number; output_tokens: number };
    };

export class ClaudeAgentSdkRuntimeAdapter implements AgentRuntimePort {
  readonly kind = "claude-agent-sdk" as const;
  private readonly streamProvider: (
    req: AgentRunRequest
  ) => AsyncIterable<ClaudeSdkRawMessage>;

  constructor(
    streamProvider: (req: AgentRunRequest) => AsyncIterable<ClaudeSdkRawMessage>
  ) {
    this.streamProvider = streamProvider;
  }

  async *run(req: AgentRunRequest): AsyncIterable<AgentEvent> {
    const uid = () => crypto.randomUUID();
    yield {
      id: uid(),
      ts: Date.now(),
      t: "agent.status",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      status: "thinking",
      detail: `${req.role.title} starting Claude Agent SDK session`,
      targetZone: req.role.zone,
    };

    for await (const msg of this.streamProvider(req)) {
      if (msg.type === "assistant") {
        yield {
          id: uid(),
          ts: Date.now(),
          t: "agent.text",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          delta: msg.text,
        };
      } else if (msg.type === "tool_use") {
        if (msg.toolName.toLowerCase() === "bash") {
          const cmd = msg.input["command"] ?? "";
          const policy = evaluateCommandPolicy(
            cmd,
            req.role.allowCommands,
            req.worktreePath
          );
          if (policy.decision === "deny") {
            yield {
              id: uid(),
              ts: Date.now(),
              t: "tool.end",
              agentId: req.role.id,
              runId: req.runId,
              ticketId: req.ticket.id,
              callId: msg.callId,
              ok: false,
              preview: `PreToolUse Blocked: ${policy.reason}`,
            };
            continue;
          }
          if (policy.decision === "ask") {
            const approved = await req.requestApproval({
              kind: "command",
              action: cmd,
              risk: policy.risk,
              reason: policy.reason,
            });
            if (!approved) {
              yield {
                id: uid(),
                ts: Date.now(),
                t: "tool.end",
                agentId: req.role.id,
                runId: req.runId,
                ticketId: req.ticket.id,
                callId: msg.callId,
                ok: false,
                preview: `PreToolUse Director denied: ${cmd}`,
              };
              continue;
            }
          }
        }
        const status = mapToolToAgentStatus(msg.toolName);
        yield {
          id: uid(),
          ts: Date.now(),
          t: "tool.start",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          callId: msg.callId,
          tool: msg.toolName,
          summary: JSON.stringify(msg.input).slice(0, 100),
        };
        yield {
          id: uid(),
          ts: Date.now(),
          t: "agent.status",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          status,
          detail: `${msg.toolName}`,
          targetZone: req.role.zone,
        };
      } else if (msg.type === "tool_result") {
        yield {
          id: uid(),
          ts: Date.now(),
          t: "tool.end",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          callId: msg.callId,
          ok: msg.ok,
          preview: msg.output.slice(0, 120),
        };
      } else if (msg.type === "result") {
        yield {
          id: uid(),
          ts: Date.now(),
          t: "usage",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          provider: "claude",
          inTok: msg.inTok ?? 0,
          outTok: msg.outTok ?? 0,
          costUsd: msg.total_cost_usd ?? 0,
        };
        yield {
          id: uid(),
          ts: Date.now(),
          t: "agent.status",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          status: msg.subtype === "success" ? "done" : "error",
          detail: `Claude Agent SDK ${msg.subtype}`,
          targetZone: req.role.zone,
        };
      }
    }
  }
}

export class CodexSdkRuntimeAdapter implements AgentRuntimePort {
  readonly kind = "codex-sdk" as const;
  private readonly streamProvider: (
    req: AgentRunRequest
  ) => AsyncIterable<CodexSdkRawEvent>;

  constructor(
    streamProvider: (req: AgentRunRequest) => AsyncIterable<CodexSdkRawEvent>
  ) {
    this.streamProvider = streamProvider;
  }

  async *run(req: AgentRunRequest): AsyncIterable<AgentEvent> {
    const uid = () => crypto.randomUUID();
    yield {
      id: uid(),
      ts: Date.now(),
      t: "agent.status",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      status: "thinking",
      detail: `${req.role.title} running Codex SDK thread.runStreamed()`,
      targetZone: req.role.zone,
    };

    for await (const ev of this.streamProvider(req)) {
      if (ev.type === "item.started") {
        const toolName =
          ev.item.type === "command_execution"
            ? "bash"
            : ev.item.type === "file_change"
              ? "write"
              : "read";
        const status = mapToolToAgentStatus(toolName);
        yield {
          id: uid(),
          ts: Date.now(),
          t: "tool.start",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          callId: ev.item.id,
          tool: toolName,
          summary: ev.item.summary,
        };
        yield {
          id: uid(),
          ts: Date.now(),
          t: "agent.status",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          status,
          detail: ev.item.summary,
          targetZone: req.role.zone,
        };
      } else if (ev.type === "item.completed") {
        if (ev.item.text) {
          yield {
            id: uid(),
            ts: Date.now(),
            t: "agent.text",
            agentId: req.role.id,
            runId: req.runId,
            ticketId: req.ticket.id,
            delta: ev.item.text,
          };
        }
        yield {
          id: uid(),
          ts: Date.now(),
          t: "tool.end",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          callId: ev.item.id,
          ok: ev.item.ok ?? true,
          preview: ev.item.text ?? "completed",
        };
      } else if (ev.type === "turn.completed") {
        const inTok = ev.usage?.input_tokens ?? 0;
        const outTok = ev.usage?.output_tokens ?? 0;
        yield {
          id: uid(),
          ts: Date.now(),
          t: "usage",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          provider: "openai_oauth",
          inTok,
          outTok,
          costUsd: Number(((inTok * 2 + outTok * 8) / 1_000_000).toFixed(6)),
        };
        yield {
          id: uid(),
          ts: Date.now(),
          t: "agent.status",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          status: ev.turn.status === "completed" ? "done" : "error",
          detail: `Codex turn ${ev.turn.status}`,
          targetZone: req.role.zone,
        };
      }
    }
  }
}
