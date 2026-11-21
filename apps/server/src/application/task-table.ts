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
  activeProvider: ProviderId,
  existingTaskTable?: Record<string, TaskTableRow>
): TaskTableRow[] {
  const rows = buildTaskTableForTicket(ticket, activeProvider);
  const activeIdx = ticket.assignee
    ? rows.findIndex((r) => r.role === ticket.assignee)
    : -1;

  return rows.map((r, idx) => {
    const existing = existingTaskTable?.[r.id];
    if (ticket.stage === "Done") {
      return {
        ...r,
        status: "done" as const,
        outputPreview: `Completed via ${activeProvider} sub-agent ${r.subAgentId}`,
      };
    }
    if (existing) {
      return {
        ...r,
        status: existing.status,
        outputPreview: existing.outputPreview,
      };
    }
    if (ticket.stage === "Escalated") {
      const isAssignee = r.role === ticket.assignee;
      return {
        ...r,
        status: isAssignee ? ("failed" as const) : ("queued" as const),
        outputPreview: isAssignee
          ? ticket.escalationReason ?? `Escalated on ${activeProvider}`
          : "",
      };
    }
    const status =
      activeIdx >= 0 && idx < activeIdx
        ? ("done" as const)
        : idx === activeIdx
          ? ("running" as const)
          : ("queued" as const);
    const outputPreview =
      status === "done"
        ? `Completed by ${r.subAgentId}`
        : status === "running"
          ? `Active on ${activeProvider}`
          : "";
    return {
      ...r,
      status,
      outputPreview,
    };
  });
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
    subAgentId: `sub-${activeProvider}-${row.role}-${row.order}`,
    status,
    outputPreview: outputPreview ?? row.outputPreview,
    updatedAt: Date.now(),
  };
}
