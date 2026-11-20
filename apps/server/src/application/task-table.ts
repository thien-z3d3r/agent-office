import type {
  AgentRoleId,
  ProviderId,
  TaskTableRow,
  Ticket,
} from "@agent-office/protocol";

export function buildTaskTableForTicket(
  ticket: Ticket,
  activeProvider: ProviderId
): TaskTableRow[] {
  const now = Date.now();
  const specs: Array<{
    role: AgentRoleId;
    title: string;
    artifactOrCmd: string;
  }> = [
    {
      role: "em",
      title: `Triage ${ticket.id} (${ticket.size}) & spawn role sub-agents`,
      artifactOrCmd: `task-table/${ticket.id}.json`,
    },
  ];

  if (ticket.size === "L") {
    specs.push(
      {
        role: "pm",
        title: `Author product specification for ${ticket.title}`,
        artifactOrCmd: `docs/specs/${ticket.id}.md`,
      },
      {
        role: "tl",
        title: `Author architecture decision record (ADR)`,
        artifactOrCmd: `docs/adr/${ticket.id}.md`,
      }
    );
  }

  specs.push(
    {
      role: ticket.authorRole,
      title: `Implement changes in isolated git worktree`,
      artifactOrCmd: `.worktrees/${ticket.authorRole}-${ticket.id}`,
    },
    {
      role: "reviewer",
      title: `Audit git diff & command security policy`,
      artifactOrCmd: `git diff main...agent/${ticket.id}`,
    }
  );

  if (ticket.size !== "S") {
    specs.push({
      role: "qa",
      title: `Run verification test suite in QA worktree`,
      artifactOrCmd: `npm test (${ticket.id})`,
    });
  }

  specs.push({
    role: "devops",
    title: `Verify release build & prepare Director merge gate`,
    artifactOrCmd: `git merge agent/${ticket.id} -> main`,
  });

  return specs.map((s, idx) => ({
    id: `${ticket.id}-TASK-${idx + 1}`,
    ticketId: ticket.id,
    order: idx + 1,
    role: s.role,
    provider: activeProvider,
    subAgentId: `sub-${activeProvider}-${s.role}-${idx + 1}`,
    title: s.title,
    artifactOrCmd: s.artifactOrCmd,
    status: "queued" as const,
    outputPreview: "",
    updatedAt: now,
  }));
}

export function buildSyncedTaskTableRows(
  ticket: Ticket,
  activeProvider: ProviderId
): TaskTableRow[] {
  return buildTaskTableForTicket(ticket, activeProvider).map((r) => ({
    ...r,
    status:
      ticket.stage === "Done"
        ? ("done" as const)
        : ticket.stage === "Escalated"
          ? ("failed" as const)
          : ticket.assignee === r.role
            ? ("running" as const)
            : ("done" as const),
    outputPreview:
      ticket.stage === "Done"
        ? `Completed via ${activeProvider} sub-agent ${r.subAgentId}`
        : `Active on ${activeProvider}`,
  }));
}

export function buildUpdatedTaskRow(
  taskTable: Record<string, TaskTableRow>,
  ticketId: string,
  role: AgentRoleId,
  activeProvider: ProviderId,
  status: TaskTableRow["status"],
  outputPreview?: string
): TaskTableRow | null {
  const row = Object.values(taskTable).find(
    (r) => r.ticketId === ticketId && r.role === role
  );
  if (!row) return null;
  return {
    ...row,
    provider: activeProvider,
    status,
    outputPreview: outputPreview ?? row.outputPreview,
    updatedAt: Date.now(),
  };
}
