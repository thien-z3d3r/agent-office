import type {
  AgentRoleId,
  AgentStatus,
  ProviderId,
  RuntimeKind,
  TaskTableRow,
  Ticket,
} from "./schemas.ts";

export interface AgentLiveState {
  id: AgentRoleId;
  status: AgentStatus;
  detail: string;
  currentTicketId: string | null;
  targetZone: string | null;
  streamBuffer: string;
  activeTool: { callId: string; tool: string; summary: string } | null;
  inTok: number;
  outTok: number;
  costUsd: number;
  subAgentId?: string | null;
  model?: string | null;
}

export interface PendingApproval {
  reqId: string;
  agentId: AgentRoleId;
  runId: string;
  ticketId: string;
  kind: "command" | "merge" | "escalation";
  action: string;
  risk: "low" | "medium" | "high";
  reason: string;
  ts: number;
}

export interface OfficeStateSnapshot {
  activeProvider: ProviderId;
  activeRuntime: RuntimeKind;
  activeModel: string | null;
  roleModels: Partial<Record<AgentRoleId, string>>;
  agents: Record<AgentRoleId, AgentLiveState>;
  tickets: Record<string, Ticket>;
  taskTable: Record<string, TaskTableRow>;
  approvals: Record<string, PendingApproval>;
  lastStandup: { summary: string; ts: number; activeTickets: number } | null;
  totalCostUsd: number;
  eventCount: number;
}

export const ALL_ROLE_IDS: readonly AgentRoleId[] = [
  "em",
  "pm",
  "tl",
  "fe",
  "be",
  "qa",
  "reviewer",
  "devops",
];

export const PROVIDER_DEFAULT_MODELS: Record<ProviderId, string> = {
  antigravity: "gemini-2.5-pro",
  claude: "claude-sonnet-4-5-20250929",
  openai_oauth: "gpt-5.4",
  openai_api: "gpt-4.1",
  kimi_code: "kimi-for-coding",
  gemini: "gemini-2.5-flash",
};

export function normalizeRoleModels(
  input?: Partial<Record<AgentRoleId, string | null>> | null
): Partial<Record<AgentRoleId, string>> {
  const normalized: Partial<Record<AgentRoleId, string>> = {};
  if (!input) {
    return normalized;
  }
  for (const roleId of ALL_ROLE_IDS) {
    const raw = input[roleId];
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        normalized[roleId] = trimmed;
      }
    }
  }
  return normalized;
}

export function resolveModelForRole(args: {
  provider: ProviderId;
  roleId: AgentRoleId;
  activeModel?: string | null;
  roleModels?: Partial<Record<AgentRoleId, string | null>> | null;
  defaultModel?: string | null;
}): string {
  const roleOverride = args.roleModels?.[args.roleId]?.trim();
  if (roleOverride) {
    return roleOverride;
  }
  const activeOverride = args.activeModel?.trim();
  if (activeOverride) {
    return activeOverride;
  }
  const explicitDefault = args.defaultModel?.trim();
  if (explicitDefault) {
    return explicitDefault;
  }
  return PROVIDER_DEFAULT_MODELS[args.provider];
}

export function createInitialOfficeState(): OfficeStateSnapshot {
  const agents = {} as Record<AgentRoleId, AgentLiveState>;
  for (const id of ALL_ROLE_IDS) {
    agents[id] = {
      id,
      status: "idle",
      detail: "Ready at workstation",
      currentTicketId: null,
      targetZone: null,
      streamBuffer: "",
      activeTool: null,
      inTok: 0,
      outTok: 0,
      costUsd: 0,
      subAgentId: null,
      model: null,
    };
  }
  return {
    activeProvider: "antigravity",
    activeRuntime: "jcode",
    activeModel: null,
    roleModels: {},
    agents,
    tickets: {},
    taskTable: {},
    approvals: {},
    lastStandup: null,
    totalCostUsd: 0,
    eventCount: 0,
  };
}
