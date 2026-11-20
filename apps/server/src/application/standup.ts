import crypto from "node:crypto";
import type { AgentEvent, Ticket } from "@agent-office/protocol";

export function buildStandupSummaryEvent(
  tickets: Record<string, Ticket>
): AgentEvent {
  const active = Object.values(tickets).filter((t) => t.stage !== "Done");
  const lines =
    active.length === 0
      ? ["All tickets complete. Office ready for new tasks."]
      : active.map(
          (t) =>
            `- ${t.id} [${t.size} | ${t.stage}] (${
              t.assignee ? t.assignee.toUpperCase() : "unassigned"
            }): ${t.title}`
        );
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    t: "standup.summary",
    summary: `Daily Standup (${active.length} active):\n${lines.join("\n")}`,
    activeTickets: active.length,
  };
}
