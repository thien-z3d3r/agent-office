import type {
  AgentEvent,
  AgentRoleId,
  ProviderId,
  RoleConfig,
  RuntimeKind,
  Ticket,
} from "@agent-office/protocol";

export interface ApprovalCallbackRequest {
  kind: "command" | "merge" | "escalation";
  action: string;
  risk: "low" | "medium" | "high";
  reason: string;
}

export interface AgentRunRequest {
  runId: string;
  ticket: Ticket;
  role: RoleConfig;
  provider: ProviderId;
  runtime?: RuntimeKind;
  model?: string;
  prompt: string;
  worktreePath: string;
  signal: AbortSignal;
  requestApproval: (req: ApprovalCallbackRequest) => Promise<boolean>;
  askColleague?: (targetRole: AgentRoleId, question: string) => Promise<string>;
}

export interface AgentRuntimePort {
  readonly kind: RuntimeKind;
  run(req: AgentRunRequest): AsyncIterable<AgentEvent>;
}

export interface EventStorePort {
  append(event: AgentEvent): void;
  listAll(limit?: number): AgentEvent[];
  saveTicket(ticket: Ticket): void;
  getTicket(id: string): Ticket | null;
  listTickets(): Ticket[];
  saveStageRun(run: {
    runId: string;
    ticketId: string;
    roleId: AgentRoleId;
    stage: string;
    status: "running" | "completed" | "failed" | "interrupted";
    startedAt: number;
    endedAt?: number;
  }): void;
  markInterruptedRunsOnStartup(): number;
}

export interface WorkspacePort {
  ensureWorktree(
    ticketId: string,
    roleId: AgentRoleId
  ): Promise<{ worktreePath: string; branch: string }>;
  getDiff(worktreePath: string): Promise<string>;
  mergeBranchToMain(branch: string, commitMessage: string): Promise<string>;
  runShellCommand(
    worktreePath: string,
    command: string,
    timeoutMs?: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface SecretStorePort {
  setSecret(keyName: string, plaintext: string): void;
  getSecret(keyName: string): string | null;
  listConfiguredKeys(): Record<string, boolean>;
}

export interface ModelDiscoveryResult {
  source: "curated" | "live";
  discoveredIds: string[];
  discoveredAt: string;
}

export interface ModelDiscoveryPort {
  discoverModels(
    provider: ProviderId,
    options?: { forceRefresh?: boolean }
  ): Promise<ModelDiscoveryResult>;
  clearCache(provider?: ProviderId): void;
}
