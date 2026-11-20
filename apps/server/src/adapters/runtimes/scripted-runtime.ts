import fs from "node:fs";
import crypto from "node:crypto";
import {
  AgentEventSchema,
  type AgentEvent,
} from "@agent-office/protocol";
import type { AgentRunRequest, AgentRuntimePort } from "../../ports/index.ts";

export function loadJsonlFixture(filePath: string): AgentEvent[] {
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.map((line) => AgentEventSchema.parse(JSON.parse(line)));
}

export class ScriptedRuntimeAdapter implements AgentRuntimePort {
  readonly kind = "scripted" as const;
  private readonly stepDelayMs: number;

  constructor(stepDelayMs: number = 25) {
    this.stepDelayMs = stepDelayMs;
  }

  async *run(req: AgentRunRequest): AsyncIterable<AgentEvent> {
    const now = () => Date.now();
    const uid = () => crypto.randomUUID();
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    yield {
      id: uid(),
      ts: now(),
      t: "agent.status",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      status: "thinking",
      detail: `${req.role.title} analyzing ${req.ticket.id}: ${req.ticket.title}`,
      targetZone: req.role.zone,
    };
    await sleep(this.stepDelayMs);

    yield {
      id: uid(),
      ts: now(),
      t: "agent.text",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      delta: `[${req.role.title}] Working on stage ${req.ticket.stage} for "${req.ticket.title}"...\n`,
    };
    await sleep(this.stepDelayMs);

    const callId = uid();
    const primaryTool =
      req.role.id === "qa" || req.role.id === "devops"
        ? "run_command"
        : req.role.id === "reviewer" || req.role.id === "em"
          ? "read"
          : "write";
    const statusForTool =
      primaryTool === "run_command"
        ? "executing"
        : primaryTool === "read"
          ? "reading"
          : "writing";

    yield {
      id: uid(),
      ts: now(),
      t: "tool.start",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      callId,
      tool: primaryTool,
      summary: `${req.ticket.id} (${req.ticket.stage})`,
    };

    yield {
      id: uid(),
      ts: now(),
      t: "agent.status",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      status: statusForTool,
      detail: `${primaryTool} on ${req.ticket.id}`,
      targetZone: req.role.zone,
    };
    await sleep(this.stepDelayMs);

    yield {
      id: uid(),
      ts: now(),
      t: "tool.end",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      callId,
      ok: true,
      preview: `Completed ${req.ticket.stage} step for ${req.ticket.id}`,
    };

    yield {
      id: uid(),
      ts: now(),
      t: "usage",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      provider: req.providerOverride ?? req.role.provider,
      inTok: 250,
      outTok: 95,
      costUsd: 0.0015,
    };

    yield {
      id: uid(),
      ts: now(),
      t: "agent.status",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      status: "done",
      detail: `Finished ${req.ticket.stage} for ${req.ticket.id}`,
      targetZone: req.role.zone,
    };
  }
}
