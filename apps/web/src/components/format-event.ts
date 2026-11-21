import type { AgentEvent } from "@agent-office/protocol";

export function formatEventLine(ev: AgentEvent): string {
  switch (ev.t) {
    case "agent.status":
      return `[${ev.agentId.toUpperCase()}] ${ev.status}: ${ev.detail ?? ""}`;
    case "tool.start":
      return `[${ev.agentId.toUpperCase()}] tool ${ev.tool}: ${ev.summary}`;
    case "tool.end":
      return `[${ev.agentId.toUpperCase()}] ${ev.ok ? "ok" : "failed"}: ${
        ev.preview ?? ""
      }`;
    case "handoff":
      return `[HANDOFF] ${ev.from.toUpperCase()} -> ${ev.to.toUpperCase()} (${
        ev.ticketId
      } · ${ev.stage}): ${ev.note}`;
    case "approval.req":
      return `[NEEDS DIRECTOR] ${ev.agentId.toUpperCase()} (${ev.ticketId}): ${
        ev.action
      }`;
    case "approval.res":
      return `[DIRECTOR] ${ev.approved ? "Approved" : "Denied"} request ${
        ev.reqId
      }`;
    case "ticket.upsert":
      return `[TICKET] ${ev.ticket.id} (${ev.ticket.size}) -> ${ev.ticket.stage}`;
    case "standup.summary":
      return `[STANDUP] ${ev.activeTickets} active tickets reviewed in meeting room`;
    case "usage":
      return `[USAGE] ${ev.agentId.toUpperCase()} (${ev.provider}): +${
        ev.inTok + ev.outTok
      } tok ($${ev.costUsd.toFixed(4)})`;
    case "agent.text":
      return `[${ev.agentId.toUpperCase()}] ${ev.delta.trim().slice(0, 80)}`;
    case "provider.changed": {
      let overrideCount = 0;
      if (ev.roleModels) {
        for (const key in ev.roleModels) {
          if (ev.roleModels[key as keyof typeof ev.roleModels]) {
            overrideCount += 1;
          }
        }
      }
      return `[PROVIDER] Office unified provider switched to ${ev.provider.toUpperCase()} (${ev.runtime}${ev.model ? `, ${ev.model}` : ""}${overrideCount > 0 ? `, +${overrideCount} role overrides` : ""})`;
    }
    case "task.table.set":
      return `[TASK TABLE] Generated ${ev.rows.length} role sub-agent tasks for ${ev.ticketId}`;
    case "task.row.updated":
      return `[SUB-AGENT ${ev.row.subAgentId}] #${ev.row.order} (${ev.row.role.toUpperCase()}) -> ${ev.row.status.toUpperCase()}`;
  }
}
