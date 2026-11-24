import crypto from "node:crypto";
import {
  createInitialOfficeState,
  normalizeRoleModels,
  officeReducer,
  resolveModelForRole,
  type AgentEvent,
  type AgentRoleId,
  type OfficeConfig,
  type OfficeStateSnapshot,
  type ProviderId,
  type RoleConfig,
  type RuntimeKind,
  type TaskTableRow,
  type Ticket,
  type TicketSize,
} from "@agent-office/protocol";
import {
  PROVIDER_METADATA,
  validateRuntimeForProvider,
} from "../domain/providers.ts";
import type { WorkflowLimits } from "../domain/ticket-machine.ts";
import type {
  AgentRuntimePort,
  ApprovalCallbackRequest,
  EventStorePort,
  WorkspacePort,
} from "../ports/index.ts";
import {
  driveTicket as runTicketWorkflow,
  type StageRunnerContext,
} from "./stage-runner.ts";
import { buildStandupSummaryEvent } from "./standup.ts";
import {
  buildSyncedTaskTableRows,
  buildTaskTableForTicket,
  buildUpdatedTaskRow,
} from "./task-table.ts";

export interface SubmitTicketInput {
  title: string;
  description: string;
  size?: TicketSize;
  authorRole?: "fe" | "be";
  mode?: "scripted" | "live";
  autoApproveMerge?: boolean;
}

export class OfficeOrchestrator {
  private readonly config: OfficeConfig;
  private readonly store: EventStorePort;
  private readonly workspace: WorkspacePort;
  private readonly runtimes: Map<RuntimeKind, AgentRuntimePort>;
  private readonly subscribers = new Set<(event: AgentEvent) => void>();
  private readonly pendingApprovals = new Map<
    string,
    {
      reqId: string;
      ticketId: string;
      agentId: AgentRoleId;
      resolve: (approved: boolean) => void;
    }
  >();
  private state: OfficeStateSnapshot;
  private ticketCounter = 1;

  constructor(args: {
    config: OfficeConfig;
    store: EventStorePort;
    workspace: WorkspacePort;
    runtimes: Map<RuntimeKind, AgentRuntimePort>;
  }) {
    this.config = args.config;
    this.store = args.store;
    this.workspace = args.workspace;
    this.runtimes = args.runtimes;

    const initialProvider = args.config.activeProvider;
    const initialRuntime =
      args.config.activeRuntime ??
      PROVIDER_METADATA[initialProvider].defaultRuntime;
    validateRuntimeForProvider(initialProvider, initialRuntime);
    const initialModel =
      typeof args.config.activeModel === "string" &&
      args.config.activeModel.trim().length > 0
        ? args.config.activeModel.trim()
        : null;
    const initialRoleModels = normalizeRoleModels(args.config.roleModels);

    this.state = {
      ...createInitialOfficeState(),
      activeProvider: initialProvider,
      activeRuntime: initialRuntime,
      activeModel: initialModel,
      roleModels: initialRoleModels,
    };

    const existing = this.store.listAll();
    for (const ev of existing) {
      this.state = officeReducer(this.state, ev);
    }
    this.ticketCounter = Object.keys(this.state.tickets).length + 1;
    this.store.markInterruptedRunsOnStartup();

    if (
      Object.keys(this.state.tickets).length > 0 &&
      Object.keys(this.state.taskTable).length === 0
    ) {
      for (const ticketId of Object.keys(this.state.tickets)) {
        this.syncTaskTableForTicket(ticketId);
      }
    }
  }

  getSnapshot(): OfficeStateSnapshot {
    return this.state;
  }

  getConfig(): OfficeConfig {
    return this.config;
  }

  setActiveProvider(
    provider: ProviderId,
    runtime?: RuntimeKind,
    model?: string | null,
    roleModels?: Partial<Record<AgentRoleId, string | null>>
  ): AgentEvent {
    const resolvedRuntime = runtime ?? PROVIDER_METADATA[provider].defaultRuntime;
    validateRuntimeForProvider(provider, resolvedRuntime);
    const providerChanged = provider !== this.state.activeProvider;
    const normalizedModel =
      model !== undefined
        ? typeof model === "string" && model.trim().length > 0
          ? model.trim()
          : null
        : providerChanged
          ? null
          : this.state.activeModel ?? null;
    const nextRoleModels =
      roleModels !== undefined
        ? normalizeRoleModels(roleModels)
        : providerChanged
          ? {}
          : this.state.roleModels;
    const ev: AgentEvent = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      t: "provider.changed",
      provider,
      runtime: resolvedRuntime,
      model: normalizedModel,
      roleModels: nextRoleModels,
    };
    this.emit(ev);
    for (const ticket of Object.values(this.state.tickets)) {
      if (ticket.stage === "Done" || ticket.stage === "Escalated") continue;
      this.syncTaskTableForTicket(ticket.id);
    }
    return ev;
  }

  setModelConfig(input: {
    model?: string | null;
    roleModels?: Partial<Record<AgentRoleId, string | null>>;
    resetRoles?: boolean;
  }): AgentEvent {
    const nextModel =
      input.model === undefined
        ? this.state.activeModel
        : typeof input.model === "string" && input.model.trim().length > 0
          ? input.model.trim()
          : null;

    let nextRoleModels: Partial<Record<AgentRoleId, string>>;
    if (input.resetRoles) {
      nextRoleModels = {};
    } else if (input.roleModels !== undefined) {
      nextRoleModels = normalizeRoleModels({
        ...this.state.roleModels,
        ...input.roleModels,
      });
    } else {
      nextRoleModels = this.state.roleModels;
    }

    return this.setActiveProvider(
      this.state.activeProvider,
      this.state.activeRuntime,
      nextModel,
      nextRoleModels
    );
  }

  buildTaskTableForTicket(ticket: Ticket): TaskTableRow[] {
    return buildTaskTableForTicket(
      ticket,
      this.state.activeProvider,
      this.state.activeModel,
      this.state.roleModels
    );
  }

  syncTaskTableForTicket(ticketId: string): void {
    const ticket = this.state.tickets[ticketId];
    if (!ticket) return;
    const rows = buildSyncedTaskTableRows(
      ticket,
      this.state.activeProvider,
      this.state.taskTable,
      this.state.activeModel,
      this.state.roleModels
    );
    this.emit({
      id: crypto.randomUUID(),
      ts: Date.now(),
      t: "task.table.set",
      ticketId,
      rows,
    });
  }

  private updateTaskRow(
    ticketId: string,
    role: AgentRoleId,
    status: TaskTableRow["status"],
    outputPreview?: string
  ): void {
    const resolvedModel = resolveModelForRole({
      provider: this.state.activeProvider,
      roleId: role,
      activeModel: this.state.activeModel,
      roleModels: this.state.roleModels,
    });
    const updated = buildUpdatedTaskRow(
      this.state.taskTable,
      ticketId,
      role,
      this.state.activeProvider,
      status,
      outputPreview,
      resolvedModel
    );
    if (!updated) return;
    this.emit({
      id: crypto.randomUUID(),
      ts: Date.now(),
      t: "task.row.updated",
      row: updated,
    });
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  emit(event: AgentEvent): void {
    this.store.append(event);
    this.state = officeReducer(this.state, event);
    for (const sub of this.subscribers) {
      sub(event);
    }
  }

  private getRole(roleId: AgentRoleId): RoleConfig {
    const found = this.config.roles.find((r) => r.id === roleId);
    if (!found) {
      throw new Error(`Role "${roleId}" not found in office.config.yaml`);
    }
    return found;
  }

  private getWorkflowLimits(): WorkflowLimits {
    return {
      reviewRounds: this.config.limits.reviewRounds,
      qaBounces: this.config.limits.qaBounces,
      ticketUsd: this.config.limits.ticketUsd,
    };
  }

  private createStageRunnerContext(): StageRunnerContext {
    return {
      config: this.config,
      store: this.store,
      workspace: this.workspace,
      runtimes: this.runtimes,
      getSnapshot: () => this.state,
      emit: (event) => this.emit(event),
      getRole: (roleId) => this.getRole(roleId),
      getWorkflowLimits: () => this.getWorkflowLimits(),
      updateTaskRow: (ticketId, role, status, outputPreview) =>
        this.updateTaskRow(ticketId, role, status, outputPreview),
      requestApproval: (agentId, runId, ticketId, req) =>
        this.requestApproval(agentId, runId, ticketId, req),
    };
  }

  requestApproval(
    agentId: AgentRoleId,
    runId: string,
    ticketId: string,
    req: ApprovalCallbackRequest
  ): Promise<boolean> {
    const reqId = `apr-${crypto.randomUUID().slice(0, 8)}`;
    return new Promise<boolean>((resolve) => {
      this.pendingApprovals.set(reqId, {
        reqId,
        ticketId,
        agentId,
        resolve,
      });
      this.emit({
        id: crypto.randomUUID(),
        ts: Date.now(),
        t: "approval.req",
        reqId,
        agentId,
        runId,
        ticketId,
        kind: req.kind,
        action: req.action,
        risk: req.risk,
        reason: req.reason,
      });
    });
  }

  resolveApproval(reqId: string, approved: boolean, note?: string): boolean {
    const pending = this.pendingApprovals.get(reqId);
    const existing = this.state.approvals[reqId];
    if (!pending && !existing) return false;
    if (pending) {
      this.pendingApprovals.delete(reqId);
    }
    this.emit({
      id: crypto.randomUUID(),
      ts: Date.now(),
      t: "approval.res",
      reqId,
      approved,
      resolvedBy: "director",
      note,
    });
    if (pending) {
      pending.resolve(approved);
    } else if (existing) {
      // Fixture or replayed approval without an active coroutine: settle agent cleanly.
      this.emit({
        id: crypto.randomUUID(),
        ts: Date.now(),
        t: "agent.status",
        agentId: existing.agentId,
        runId: existing.runId,
        ticketId: existing.ticketId,
        status: approved ? "done" : "error",
        detail: approved
          ? `Approved by Director: ${existing.action}`
          : `Denied by Director: ${existing.action}`,
      });
    }
    return true;
  }

  triggerStandup(): AgentEvent {
    const ev = buildStandupSummaryEvent(this.state.tickets);
    this.emit(ev);
    return ev;
  }

  async submitTicket(
    input: SubmitTicketInput
  ): Promise<{ ticket: Ticket; completion: Promise<Ticket> }> {
    const id = `T-${this.ticketCounter++}`;
    const now = Date.now();
    const size: TicketSize = input.size ?? "S";
    const authorRole: "fe" | "be" = input.authorRole ?? "fe";

    const ticket: Ticket = {
      id,
      title: input.title,
      description: input.description,
      size,
      stage: "Triage",
      assignee: "em",
      authorRole,
      reviewRounds: 0,
      qaBounces: 0,
      spentUsd: 0,
      comments: [],
      createdAt: now,
      updatedAt: now,
    };

    this.emit({
      id: crypto.randomUUID(),
      ts: now,
      t: "ticket.upsert",
      ticket,
    });

    const rows = this.buildTaskTableForTicket(ticket);
    this.emit({
      id: crypto.randomUUID(),
      ts: now,
      t: "task.table.set",
      ticketId: ticket.id,
      rows,
    });

    const completion = this.driveTicket(
      ticket.id,
      input.mode ?? "scripted",
      input.autoApproveMerge ?? false
    );
    return { ticket, completion };
  }

  async driveTicket(
    ticketId: string,
    mode: "scripted" | "live" = "scripted",
    autoApproveMerge: boolean = false
  ): Promise<Ticket> {
    return runTicketWorkflow(
      this.createStageRunnerContext(),
      ticketId,
      mode,
      autoApproveMerge
    );
  }
}
