import type { AgentEvent, AgentRoleId } from "./schemas.ts";
import {
  ALL_ROLE_IDS,
  type AgentLiveState,
  type OfficeStateSnapshot,
} from "./state.ts";

export function officeReducer(
  state: OfficeStateSnapshot,
  event: AgentEvent
): OfficeStateSnapshot {
  const eventCount = state.eventCount + 1;

  switch (event.t) {
    case "agent.status": {
      const prev = state.agents[event.agentId];
      return {
        ...state,
        agents: {
          ...state.agents,
          [event.agentId]: {
            ...prev,
            status: event.status,
            detail: event.detail ?? prev.detail,
            currentTicketId: event.ticketId ?? prev.currentTicketId,
            targetZone: event.targetZone ?? prev.targetZone,
            streamBuffer: event.status === "thinking" ? "" : prev.streamBuffer,
          },
        },
        eventCount,
      };
    }
    case "agent.text": {
      const prev = state.agents[event.agentId];
      const appended = (prev.streamBuffer + event.delta).slice(-1200);
      return {
        ...state,
        agents: {
          ...state.agents,
          [event.agentId]: {
            ...prev,
            streamBuffer: appended,
          },
        },
        eventCount,
      };
    }
    case "tool.start": {
      const prev = state.agents[event.agentId];
      return {
        ...state,
        agents: {
          ...state.agents,
          [event.agentId]: {
            ...prev,
            activeTool: {
              callId: event.callId,
              tool: event.tool,
              summary: event.summary,
            },
            detail: `${event.tool}: ${event.summary}`,
          },
        },
        eventCount,
      };
    }
    case "tool.end": {
      const prev = state.agents[event.agentId];
      return {
        ...state,
        agents: {
          ...state.agents,
          [event.agentId]: {
            ...prev,
            activeTool: null,
            detail: event.preview
              ? `${event.ok ? "[OK]" : "[ERR]"} ${event.preview.slice(0, 120)}`
              : prev.detail,
          },
        },
        eventCount,
      };
    }
    case "approval.req": {
      const prev = state.agents[event.agentId];
      return {
        ...state,
        approvals: {
          ...state.approvals,
          [event.reqId]: {
            reqId: event.reqId,
            agentId: event.agentId,
            runId: event.runId,
            ticketId: event.ticketId,
            kind: event.kind,
            action: event.action,
            risk: event.risk,
            reason: event.reason,
            ts: event.ts,
          },
        },
        agents: {
          ...state.agents,
          [event.agentId]: {
            ...prev,
            status: "waiting_approval",
            detail: `Waiting Director approval: ${event.action}`,
            targetZone: "director_desk",
          },
        },
        eventCount,
      };
    }
    case "approval.res": {
      const req = state.approvals[event.reqId];
      if (!req) {
        return { ...state, eventCount };
      }
      const nextApprovals = { ...state.approvals };
      delete nextApprovals[event.reqId];
      const prev = state.agents[req.agentId];
      return {
        ...state,
        approvals: nextApprovals,
        agents: {
          ...state.agents,
          [req.agentId]: {
            ...prev,
            status: event.approved ? "thinking" : "error",
            detail: event.approved
              ? `Director approved: ${req.action}`
              : `Director denied: ${req.action}`,
            targetZone: null,
          },
        },
        eventCount,
      };
    }
    case "handoff": {
      const fromAgent = state.agents[event.from];
      const toAgent = state.agents[event.to];
      return {
        ...state,
        agents: {
          ...state.agents,
          [event.from]: {
            ...fromAgent,
            status: "handoff",
            currentTicketId: event.ticketId,
            detail: `Handoff ${event.ticketId} -> ${event.to.toUpperCase()}: ${event.note}`,
            targetZone: `role_${event.to}`,
          },
          [event.to]: {
            ...toAgent,
            currentTicketId: event.ticketId,
            detail: `Received ${event.ticketId} from ${event.from.toUpperCase()}`,
          },
        },
        eventCount,
      };
    }
    case "ticket.upsert": {
      const nextTickets = {
        ...state.tickets,
        [event.ticket.id]: event.ticket,
      };
      let nextAgents: Record<AgentRoleId, AgentLiveState> | undefined;
      if (event.ticket.stage === "Done") {
        for (const id of ALL_ROLE_IDS) {
          const ag = state.agents[id];
          if (ag.currentTicketId === event.ticket.id && ag.status === "handoff") {
            if (!nextAgents) {
              nextAgents = { ...state.agents };
            }
            nextAgents[id] = {
              ...ag,
              status: "done",
              targetZone: null,
              detail: `Completed ${event.ticket.id} task row`,
            };
          }
        }
      }
      return {
        ...state,
        tickets: nextTickets,
        agents: nextAgents ?? state.agents,
        eventCount,
      };
    }
    case "standup.summary": {
      const nextAgents = { ...state.agents };
      for (const id of ALL_ROLE_IDS) {
        nextAgents[id] = {
          ...nextAgents[id],
          status: "standup",
          targetZone: "meeting_room",
          detail: "In daily standup",
        };
      }
      return {
        ...state,
        lastStandup: {
          summary: event.summary,
          ts: event.ts,
          activeTickets: event.activeTickets,
        },
        agents: nextAgents,
        eventCount,
      };
    }
    case "usage": {
      const prev = state.agents[event.agentId];
      return {
        ...state,
        agents: {
          ...state.agents,
          [event.agentId]: {
            ...prev,
            inTok: prev.inTok + event.inTok,
            outTok: prev.outTok + event.outTok,
            costUsd: Number((prev.costUsd + event.costUsd).toFixed(6)),
          },
        },
        totalCostUsd: Number((state.totalCostUsd + event.costUsd).toFixed(6)),
        eventCount,
      };
    }
    case "provider.changed": {
      return {
        ...state,
        activeProvider: event.provider,
        activeRuntime: event.runtime,
        activeModel: event.model ?? null,
        eventCount,
      };
    }
    case "task.table.set": {
      if (event.rows.length === 0) {
        return { ...state, eventCount };
      }
      const nextTaskTable = { ...state.taskTable };
      let nextAgents: Record<AgentRoleId, AgentLiveState> | undefined;
      for (const row of event.rows) {
        nextTaskTable[row.id] = row;
        const prevAgent = (nextAgents ?? state.agents)[row.role];
        if (
          prevAgent.currentTicketId !== null &&
          prevAgent.currentTicketId !== row.ticketId
        ) {
          const prevTicket = state.tickets[prevAgent.currentTicketId];
          const prevTicketActive = prevTicket
            ? prevTicket.stage !== "Done" && prevTicket.stage !== "Escalated"
            : prevAgent.status !== "idle" &&
              prevAgent.status !== "done" &&
              prevAgent.status !== "error";
          const rowTicket = state.tickets[row.ticketId];
          const rowTicketTerminal =
            rowTicket?.stage === "Done" || rowTicket?.stage === "Escalated";
          if (prevTicketActive || rowTicketTerminal) {
            continue;
          }
        }
        if (!nextAgents) {
          nextAgents = { ...state.agents };
        }
        nextAgents[row.role] = {
          ...prevAgent,
          subAgentId: row.subAgentId,
          currentTicketId: row.ticketId,
          status:
            row.status === "done" && prevAgent.status === "handoff"
              ? "done"
              : prevAgent.status,
          targetZone: row.status === "done" ? null : prevAgent.targetZone,
        };
      }
      return {
        ...state,
        taskTable: nextTaskTable,
        agents: nextAgents ?? state.agents,
        eventCount,
      };
    }
    case "task.row.updated": {
      const prevAgent = state.agents[event.row.role];
      return {
        ...state,
        taskTable: {
          ...state.taskTable,
          [event.row.id]: event.row,
        },
        agents: {
          ...state.agents,
          [event.row.role]: {
            ...prevAgent,
            subAgentId: event.row.subAgentId,
            currentTicketId: event.row.ticketId,
          },
        },
        eventCount,
      };
    }
  }
}
