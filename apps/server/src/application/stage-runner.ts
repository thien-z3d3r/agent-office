import crypto from "node:crypto";
import type {
  AgentEvent,
  AgentRoleId,
  OfficeConfig,
  OfficeStateSnapshot,
  ProviderId,
  RoleConfig,
  RuntimeKind,
  TaskTableRow,
  Ticket,
  TicketStage,
} from "@agent-office/protocol";
import {
  transitionTicket,
  type TicketTransitionAction,
  type WorkflowLimits,
} from "../domain/ticket-machine.ts";
import type {
  AgentRuntimePort,
  ApprovalCallbackRequest,
  EventStorePort,
  WorkspacePort,
} from "../ports/index.ts";

const TEXT_COALESCE_FLUSH_MS = 50;
const TEXT_COALESCE_MAX_CHARS = 512;

type AgentTextEvent = Extract<AgentEvent, { t: "agent.text" }>;

export interface StageRunnerContext {
  config: OfficeConfig;
  store: EventStorePort;
  workspace: WorkspacePort;
  runtimes: Map<RuntimeKind, AgentRuntimePort>;
  getSnapshot(): OfficeStateSnapshot;
  emit(event: AgentEvent): void;
  getRole(roleId: AgentRoleId): RoleConfig;
  getWorkflowLimits(): WorkflowLimits;
  updateTaskRow(
    ticketId: string,
    role: AgentRoleId,
    status: TaskTableRow["status"],
    outputPreview?: string
  ): void;
  requestApproval(
    agentId: AgentRoleId,
    runId: string,
    ticketId: string,
    req: ApprovalCallbackRequest
  ): Promise<boolean>;
}

function commitTransition(
  ctx: StageRunnerContext,
  ticket: Ticket,
  action: TicketTransitionAction,
  limits: WorkflowLimits
): Ticket {
  const next = transitionTicket(ticket, action, limits);
  ctx.emit({
    id: crypto.randomUUID(),
    ts: Date.now(),
    t: "ticket.upsert",
    ticket: next,
  });
  return next;
}

function emitHandoff(
  ctx: StageRunnerContext,
  from: AgentRoleId,
  to: AgentRoleId,
  ticketId: string,
  stage: TicketStage,
  note: string
): void {
  ctx.emit({
    id: crypto.randomUUID(),
    ts: Date.now(),
    t: "handoff",
    from,
    to,
    ticketId,
    stage,
    note,
  });
}

export async function runRoleStage(
  ctx: StageRunnerContext,
  args: {
    ticket: Ticket;
    roleId: AgentRoleId;
    prompt: string;
    mode: "scripted" | "live";
    providerOverride?: ProviderId;
    runtimeOverride?: RuntimeKind;
  }
): Promise<Ticket> {
  const snapshot = ctx.getSnapshot();
  const baseRole = ctx.getRole(args.roleId);
  const activeProvider = args.providerOverride ?? snapshot.activeProvider;
  const role: RoleConfig = {
    ...baseRole,
    provider: activeProvider,
    runtime: snapshot.activeRuntime,
  };
  const runtimeKind: RuntimeKind =
    args.mode === "scripted"
      ? "scripted"
      : args.runtimeOverride ?? snapshot.activeRuntime;
  const runtime =
    ctx.runtimes.get(runtimeKind) ?? ctx.runtimes.get("scripted");
  if (!runtime) {
    throw new Error(`No runtime registered for kind "${runtimeKind}"`);
  }

  ctx.updateTaskRow(
    args.ticket.id,
    args.roleId,
    "running",
    `Spawned sub-agent on ${activeProvider}`
  );

  const { worktreePath, branch } = await ctx.workspace.ensureWorktree(
    args.ticket.id,
    args.roleId
  );
  const runId = `run-${args.roleId}-${args.ticket.id}-${Date.now()}`;
  const controller = new AbortController();
  const startedAt = Date.now();

  ctx.store.saveStageRun({
    runId,
    ticketId: args.ticket.id,
    roleId: args.roleId,
    stage: args.ticket.stage,
    status: "running",
    startedAt,
  });

  let askColleagueCount = 0;
  let currentTicket: Ticket = {
    ...args.ticket,
    branch,
    worktreePath,
  };

  let pendingText: AgentTextEvent | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFlushTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flushPendingText = () => {
    clearFlushTimer();
    if (pendingText) {
      const toEmit = pendingText;
      pendingText = null;
      ctx.emit(toEmit);
    }
  };

  try {
    for await (const ev of runtime.run({
      runId,
      ticket: currentTicket,
      role,
      providerOverride: activeProvider,
      prompt: args.prompt,
      worktreePath,
      signal: controller.signal,
      requestApproval: (req) =>
        ctx.requestApproval(args.roleId, runId, currentTicket.id, req),
      askColleague: async (targetRole, question) => {
        if (askColleagueCount >= ctx.config.limits.askAgentPerStage) {
          return `[ask_agent cap (${ctx.config.limits.askAgentPerStage}) reached for this stage]`;
        }
        askColleagueCount++;
        emitHandoff(
          ctx,
          args.roleId,
          targetRole,
          currentTicket.id,
          currentTicket.stage,
          `Question: ${question}`
        );
        return `[${targetRole.toUpperCase()}] Acknowledged question on ${currentTicket.id}.`;
      },
    })) {
      if (ev.t === "agent.text") {
        if (
          pendingText !== null &&
          pendingText.agentId === ev.agentId &&
          pendingText.runId === ev.runId
        ) {
          pendingText = {
            id: pendingText.id,
            ts: ev.ts,
            t: "agent.text",
            agentId: pendingText.agentId,
            runId: pendingText.runId,
            ticketId: pendingText.ticketId,
            delta: pendingText.delta + ev.delta,
          };
        } else {
          flushPendingText();
          pendingText = ev;
        }

        if (pendingText.delta.length >= TEXT_COALESCE_MAX_CHARS) {
          flushPendingText();
        } else if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null;
            flushPendingText();
          }, TEXT_COALESCE_FLUSH_MS);
          flushTimer.unref?.();
        }
        continue;
      }

      // Flush buffered text before non-text events to preserve causal event ordering.
      flushPendingText();
      ctx.emit(ev);

      if (ev.t === "usage") {
        const limits = ctx.getWorkflowLimits();
        currentTicket = transitionTicket(
          currentTicket,
          { type: "RECORD_COST", costUsd: ev.costUsd },
          limits
        );
        const currentTotalCost = ctx.getSnapshot().totalCostUsd;
        if (
          currentTicket.stage === "Escalated" ||
          currentTotalCost > ctx.config.limits.dailyUsd
        ) {
          controller.abort();
          if (currentTicket.stage !== "Escalated") {
            currentTicket = transitionTicket(
              currentTicket,
              {
                type: "AGENT_ERROR",
                reason: `Daily budget exceeded ($${currentTotalCost.toFixed(
                  2
                )} > $${ctx.config.limits.dailyUsd.toFixed(2)})`,
              },
              limits
            );
          }
          ctx.emit({
            id: crypto.randomUUID(),
            ts: Date.now(),
            t: "ticket.upsert",
            ticket: currentTicket,
          });
          break;
        }
      }
    }

    flushPendingText();
    ctx.store.saveStageRun({
      runId,
      ticketId: currentTicket.id,
      roleId: args.roleId,
      stage: currentTicket.stage,
      status: "completed",
      startedAt,
      endedAt: Date.now(),
    });
    ctx.updateTaskRow(
      currentTicket.id,
      args.roleId,
      currentTicket.stage === "Escalated" ? "failed" : "done",
      `Completed by sub-${activeProvider}-${args.roleId}`
    );
  } catch (err) {
    flushPendingText();
    ctx.store.saveStageRun({
      runId,
      ticketId: currentTicket.id,
      roleId: args.roleId,
      stage: currentTicket.stage,
      status: "failed",
      startedAt,
      endedAt: Date.now(),
    });
    ctx.updateTaskRow(
      currentTicket.id,
      args.roleId,
      "failed",
      err instanceof Error ? err.message : String(err)
    );
    if (args.mode === "live" && !args.providerOverride) {
      return runRoleStage(ctx, {
        ...args,
        providerOverride: baseRole.fallback.provider,
        runtimeOverride: baseRole.fallback.runtime,
      });
    }
    currentTicket = commitTransition(
      ctx,
      currentTicket,
      {
        type: "AGENT_ERROR",
        reason: err instanceof Error ? err.message : String(err),
      },
      ctx.getWorkflowLimits()
    );
  }

  return currentTicket;
}

export async function driveTicket(
  ctx: StageRunnerContext,
  ticketId: string,
  mode: "scripted" | "live" = "scripted",
  autoApproveMerge: boolean = false
): Promise<Ticket> {
  let ticket =
    ctx.getSnapshot().tickets[ticketId] ?? ctx.store.getTicket(ticketId);
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  const limits = ctx.getWorkflowLimits();

  while (ticket.stage !== "Done" && ticket.stage !== "Escalated") {
    if (ticket.stage === "Triage") {
      ticket = await runRoleStage(ctx, {
        ticket,
        roleId: "em",
        mode,
        prompt: `Triage ticket ${ticket.id}: "${ticket.title}" (${ticket.description}). Size=${ticket.size}, Author=${ticket.authorRole}.`,
      });
      if (ticket.stage === "Escalated") break;

      ticket = commitTransition(
        ctx,
        ticket,
        {
          type: "TRIAGE_COMPLETE",
          size: ticket.size,
          authorRole: ticket.authorRole,
        },
        limits
      );
      if (ticket.assignee) {
        emitHandoff(
          ctx,
          "em",
          ticket.assignee,
          ticket.id,
          ticket.stage,
          `EM assigned ${ticket.id} (${ticket.size}) to ${ticket.assignee.toUpperCase()}`
        );
      }
    } else if (ticket.stage === "Spec") {
      ticket = await runRoleStage(ctx, {
        ticket,
        roleId: "pm",
        mode,
        prompt: `Write product specification docs/specs/${ticket.id}.md for "${ticket.title}": ${ticket.description}`,
      });
      if (ticket.stage === "Escalated") break;

      ticket = commitTransition(
        ctx,
        ticket,
        {
          type: "SPEC_COMPLETE",
          specPath: `docs/specs/${ticket.id}.md`,
        },
        limits
      );
      emitHandoff(
        ctx,
        "pm",
        "tl",
        ticket.id,
        "Design",
        `Spec ready at ${ticket.specPath}`
      );
    } else if (ticket.stage === "Design") {
      ticket = await runRoleStage(ctx, {
        ticket,
        roleId: "tl",
        mode,
        prompt: `Write architecture decision record docs/adr/${ticket.id}.md for "${ticket.title}" based on ${ticket.specPath}`,
      });
      if (ticket.stage === "Escalated") break;

      ticket = commitTransition(
        ctx,
        ticket,
        {
          type: "DESIGN_COMPLETE",
          adrPath: `docs/adr/${ticket.id}.md`,
        },
        limits
      );
      emitHandoff(
        ctx,
        "tl",
        ticket.authorRole,
        ticket.id,
        "InProgress",
        `ADR ready at ${ticket.adrPath}`
      );
    } else if (ticket.stage === "InProgress") {
      ticket = await runRoleStage(ctx, {
        ticket,
        roleId: ticket.authorRole,
        mode,
        prompt: `Implement ticket ${ticket.id}: "${ticket.title}"\nDescription: ${ticket.description}`,
      });
      if (ticket.stage === "Escalated") break;

      const diff = ticket.worktreePath
        ? await ctx.workspace.getDiff(ticket.worktreePath)
        : "";
      ticket = {
        ...ticket,
        authorProvider: ctx.getSnapshot().activeProvider,
      };
      ticket = commitTransition(
        ctx,
        ticket,
        {
          type: "DEV_COMPLETE",
          branch: ticket.branch ?? `agent/${ticket.id}`,
          diffPreview:
            diff || `// Changes implemented for ${ticket.id}: ${ticket.title}`,
        },
        limits
      );
      emitHandoff(
        ctx,
        ticket.authorRole,
        "reviewer",
        ticket.id,
        "Review",
        `Branch ${ticket.branch} ready for cross-vendor review`
      );
    } else if (ticket.stage === "Review") {
      ticket = await runRoleStage(ctx, {
        ticket,
        roleId: "reviewer",
        mode,
        prompt: `Review diff for ${ticket.id} (${ticket.title}):\n${
          ticket.diffPreview ?? ""
        }`,
      });
      if (ticket.stage === "Escalated") break;

      ticket = commitTransition(ctx, ticket, { type: "REVIEW_APPROVED" }, limits);
      if (ticket.assignee) {
        emitHandoff(
          ctx,
          "reviewer",
          ticket.assignee,
          ticket.id,
          ticket.stage,
          `Review approved by sub-${ctx.getSnapshot().activeProvider}-reviewer`
        );
      }
    } else if (ticket.stage === "QA") {
      ticket = await runRoleStage(ctx, {
        ticket,
        roleId: "qa",
        mode,
        prompt: `Run QA verification and test suite for ${ticket.id}: "${ticket.title}"`,
      });
      if (ticket.stage === "Escalated") break;

      ticket = commitTransition(ctx, ticket, { type: "QA_PASSED" }, limits);
      emitHandoff(
        ctx,
        "qa",
        "devops",
        ticket.id,
        "ReadyToMerge",
        `QA passed for ${ticket.id}`
      );
    } else if (ticket.stage === "ReadyToMerge") {
      ticket = await runRoleStage(ctx, {
        ticket,
        roleId: "devops",
        mode,
        prompt: `Verify build and prepare merge proposal for ${ticket.id} (${ticket.branch})`,
      });
      if (ticket.stage === "Escalated") break;

      let approved = autoApproveMerge;
      if (!autoApproveMerge) {
        approved = await ctx.requestApproval(
          "tl",
          `run-merge-${ticket.id}`,
          ticket.id,
          {
            kind: "merge",
            action: `Merge ${ticket.branch ?? ticket.id} -> main`,
            risk: "medium",
            reason: `Ticket ${ticket.id} passed review${
              ticket.size !== "S" ? " & QA" : ""
            } and is ready to merge to main.`,
          }
        );
      }

      if (!approved) {
        ticket = commitTransition(
          ctx,
          ticket,
          {
            type: "AGENT_ERROR",
            reason: "Director declined merge to main",
          },
          limits
        );
        break;
      }

      ticket = commitTransition(
        ctx,
        ticket,
        { type: "DIRECTOR_APPROVE_MERGE", directorApproved: true },
        limits
      );
      ctx.emit({
        id: crypto.randomUUID(),
        ts: Date.now(),
        t: "agent.status",
        agentId: "devops",
        runId: `run-merge-${ticket.id}`,
        ticketId: ticket.id,
        status: "done",
        detail: `Shipped ${ticket.id} to main`,
      });
    }
  }

  return ticket;
}
