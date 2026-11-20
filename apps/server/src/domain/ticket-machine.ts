import type {
  AgentRoleId,
  Ticket,
  TicketSize,
  TicketStage,
} from "@agent-office/protocol";

export interface WorkflowLimits {
  reviewRounds: number;
  qaBounces: number;
  ticketUsd: number;
}

export const DEFAULT_WORKFLOW_LIMITS: WorkflowLimits = {
  reviewRounds: 3,
  qaBounces: 2,
  ticketUsd: 2.0,
};

export type TicketTransitionAction =
  | { type: "TRIAGE_COMPLETE"; size: TicketSize; authorRole: "fe" | "be" }
  | { type: "SPEC_COMPLETE"; specPath: string }
  | { type: "DESIGN_COMPLETE"; adrPath: string }
  | { type: "DEV_COMPLETE"; branch: string; diffPreview?: string }
  | { type: "REVIEW_APPROVED" }
  | { type: "REVIEW_CHANGES_REQUESTED"; feedback: string }
  | { type: "QA_PASSED" }
  | { type: "QA_FAILED"; bugReport: string }
  | { type: "DIRECTOR_APPROVE_MERGE"; directorApproved: boolean }
  | { type: "RECORD_COST"; costUsd: number }
  | { type: "AGENT_ERROR"; reason: string }
  | { type: "DIRECTOR_UNBLOCK"; resumeStage?: TicketStage };

export function assigneeForStage(
  stage: TicketStage,
  authorRole: "fe" | "be"
): AgentRoleId | null {
  switch (stage) {
    case "Triage":
      return "em";
    case "Spec":
      return "pm";
    case "Design":
      return "tl";
    case "InProgress":
      return authorRole;
    case "Review":
      return "reviewer";
    case "QA":
      return "qa";
    case "ReadyToMerge":
      return "devops";
    case "Escalated":
      return "em";
    case "Done":
      return null;
  }
}

export function transitionTicket(
  ticket: Ticket,
  action: TicketTransitionAction,
  limits: WorkflowLimits = DEFAULT_WORKFLOW_LIMITS,
  now: number = Date.now()
): Ticket {
  if (action.type === "RECORD_COST") {
    const spentUsd = Number((ticket.spentUsd + action.costUsd).toFixed(6));
    if (spentUsd > limits.ticketUsd && ticket.stage !== "Done") {
      return {
        ...ticket,
        spentUsd,
        stage: "Escalated",
        assignee: "em",
        escalationReason: `Ticket budget exceeded ($${spentUsd.toFixed(2)} > $${limits.ticketUsd.toFixed(2)})`,
        updatedAt: now,
      };
    }
    return { ...ticket, spentUsd, updatedAt: now };
  }

  if (action.type === "AGENT_ERROR") {
    return {
      ...ticket,
      stage: "Escalated",
      assignee: "em",
      escalationReason: action.reason,
      updatedAt: now,
    };
  }

  if (action.type === "DIRECTOR_UNBLOCK") {
    if (ticket.stage !== "Escalated") {
      throw new Error(`Cannot unblock ticket from stage ${ticket.stage}`);
    }
    const nextStage = action.resumeStage ?? "InProgress";
    return {
      ...ticket,
      stage: nextStage,
      assignee: assigneeForStage(nextStage, ticket.authorRole),
      escalationReason: undefined,
      updatedAt: now,
    };
  }

  switch (ticket.stage) {
    case "Triage": {
      if (action.type !== "TRIAGE_COMPLETE") {
        throw new Error(`Illegal action ${action.type} in stage Triage`);
      }
      const nextStage: TicketStage = action.size === "L" ? "Spec" : "InProgress";
      return {
        ...ticket,
        size: action.size,
        authorRole: action.authorRole,
        stage: nextStage,
        assignee: assigneeForStage(nextStage, action.authorRole),
        updatedAt: now,
      };
    }

    case "Spec": {
      if (action.type !== "SPEC_COMPLETE") {
        throw new Error(`Illegal action ${action.type} in stage Spec`);
      }
      return {
        ...ticket,
        specPath: action.specPath,
        stage: "Design",
        assignee: "tl",
        updatedAt: now,
      };
    }

    case "Design": {
      if (action.type !== "DESIGN_COMPLETE") {
        throw new Error(`Illegal action ${action.type} in stage Design`);
      }
      return {
        ...ticket,
        adrPath: action.adrPath,
        stage: "InProgress",
        assignee: ticket.authorRole,
        updatedAt: now,
      };
    }

    case "InProgress": {
      if (action.type !== "DEV_COMPLETE") {
        throw new Error(`Illegal action ${action.type} in stage InProgress`);
      }
      return {
        ...ticket,
        branch: action.branch,
        diffPreview: action.diffPreview ?? ticket.diffPreview,
        stage: "Review",
        assignee: "reviewer",
        updatedAt: now,
      };
    }

    case "Review": {
      if (action.type === "REVIEW_APPROVED") {
        const nextStage: TicketStage =
          ticket.size === "S" ? "ReadyToMerge" : "QA";
        return {
          ...ticket,
          stage: nextStage,
          assignee: assigneeForStage(nextStage, ticket.authorRole),
          updatedAt: now,
        };
      }
      if (action.type === "REVIEW_CHANGES_REQUESTED") {
        const reviewRounds = ticket.reviewRounds + 1;
        if (reviewRounds >= limits.reviewRounds) {
          return {
            ...ticket,
            reviewRounds,
            stage: "Escalated",
            assignee: "em",
            escalationReason: `Exceeded max review rounds (${limits.reviewRounds}): ${action.feedback}`,
            updatedAt: now,
          };
        }
        return {
          ...ticket,
          reviewRounds,
          stage: "InProgress",
          assignee: ticket.authorRole,
          updatedAt: now,
        };
      }
      throw new Error(`Illegal action ${action.type} in stage Review`);
    }

    case "QA": {
      if (action.type === "QA_PASSED") {
        return {
          ...ticket,
          stage: "ReadyToMerge",
          assignee: "devops",
          updatedAt: now,
        };
      }
      if (action.type === "QA_FAILED") {
        const qaBounces = ticket.qaBounces + 1;
        if (qaBounces >= limits.qaBounces) {
          return {
            ...ticket,
            qaBounces,
            stage: "Escalated",
            assignee: "em",
            escalationReason: `Exceeded max QA bounces (${limits.qaBounces}): ${action.bugReport}`,
            updatedAt: now,
          };
        }
        return {
          ...ticket,
          qaBounces,
          stage: "InProgress",
          assignee: ticket.authorRole,
          updatedAt: now,
        };
      }
      throw new Error(`Illegal action ${action.type} in stage QA`);
    }

    case "ReadyToMerge": {
      if (action.type !== "DIRECTOR_APPROVE_MERGE") {
        throw new Error(`Illegal action ${action.type} in stage ReadyToMerge`);
      }
      if (!action.directorApproved) {
        throw new Error("Merge to main requires explicit Director approval");
      }
      return {
        ...ticket,
        stage: "Done",
        assignee: null,
        updatedAt: now,
      };
    }

    default:
      throw new Error(`Cannot transition from terminal/escalated stage ${ticket.stage}`);
  }
}
