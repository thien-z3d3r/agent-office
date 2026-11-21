import React from "react";
import type { AgentRoleId, RoleConfig } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";

export interface WorkerRowProps {
  role: RoleConfig;
  isSelected: boolean;
  onInspect: (roleId: AgentRoleId) => void;
}

export const WorkerRow: React.FC<WorkerRowProps> = React.memo(
  ({ role, isSelected, onInspect }) => {
    const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
    const status = useOfficeStore(
      (s) => s.snapshot.agents[role.id]?.status ?? "idle"
    );
    const detail = useOfficeStore(
      (s) => s.snapshot.agents[role.id]?.detail ?? "Ready at desk"
    );
    const subAgentId = useOfficeStore(
      (s) => s.snapshot.agents[role.id]?.subAgentId ?? null
    );

    const isWaiting = status === "waiting_approval";

    return (
      <li>
        <button
          type="button"
          className={`worker-row ${isSelected ? "selected" : ""} ${
            isWaiting ? "needs-you" : ""
          }`}
          aria-current={isSelected ? "true" : undefined}
          onClick={() => onInspect(role.id)}
        >
          <span
            className="dot"
            style={{ background: role.tint }}
            aria-hidden="true"
          />
          <span className="worker-main">
            <span className="worker-title">
              {role.id.toUpperCase()} · {role.title}
            </span>
            <span className="worker-sub">
              {subAgentId ?? `sub-${activeProvider}-${role.id}`} · {detail}
            </span>
          </span>
          <span className={`pill ${status}`}>
            {isWaiting ? "NEEDS YOU" : status}
          </span>
        </button>
      </li>
    );
  }
);

WorkerRow.displayName = "WorkerRow";
