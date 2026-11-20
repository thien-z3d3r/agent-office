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
    };
  }
  return {
    activeProvider: "antigravity",
    activeRuntime: "jcode",
    agents,
    tickets: {},
    taskTable: {},
    approvals: {},
    lastStandup: null,
    totalCostUsd: 0,
    eventCount: 0,
  };
}
