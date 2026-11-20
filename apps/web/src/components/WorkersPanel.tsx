import React, { useMemo } from "react";
import type { AgentRoleId, RoleConfig } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";
import { WorkerRow } from "./WorkerRow.tsx";

function sortRolesNeedingApprovalFirst(
  roles: RoleConfig[],
  waitingIdsKey: string
): RoleConfig[] {
  if (!waitingIdsKey) return roles;
  const waiting = new Set(waitingIdsKey.split(","));
  return [...roles].sort(
    (a, b) => (waiting.has(a.id) ? 0 : 1) - (waiting.has(b.id) ? 0 : 1)
  );
}

export interface WorkersPanelProps {
  onHide: () => void;
  onInspectRole: (roleId: AgentRoleId) => void;
}

export const WorkersPanel: React.FC<WorkersPanelProps> = ({
  onHide,
  onInspectRole,
}) => {
  const roles = useOfficeStore((s) => s.roles);
  const selectedRoleId = useOfficeStore((s) => s.selectedRoleId);
  const totalCostUsd = useOfficeStore((s) => s.snapshot.totalCostUsd);
  const approvalsCount = useOfficeStore(
    (s) => Object.keys(s.snapshot.approvals).length
  );
  const firstWaitingAgentId = useOfficeStore(
    (s) => Object.values(s.snapshot.approvals)[0]?.agentId ?? null
  );
  const waitingIdsKey = useOfficeStore((s) => {
    let key = "";
    for (const role of s.roles) {
      if (s.snapshot.agents[role.id]?.status === "waiting_approval") {
        key = key ? `${key},${role.id}` : role.id;
      }
    }
    return key;
  });

  const sortedRoles = useMemo(
    () => sortRolesNeedingApprovalFirst(roles, waitingIdsKey),
    [roles, waitingIdsKey]
  );

  return (
    <section className="panel" aria-label="Workers in the office">
      <h2>
        <span>Workers</span>
        <span className="count">({roles.length})</span>
        <span className="cost">${totalCostUsd.toFixed(4)}</span>
        <button
          type="button"
          className="panel-x"
          aria-label="Hide Workers panel"
          onClick={onHide}
        >
          <span aria-hidden="true">X</span>
        </button>
      </h2>

      {approvalsCount > 0 && firstWaitingAgentId && (
        <button
          type="button"
          className="waiting-alert"
          onClick={() => onInspectRole(firstWaitingAgentId)}
        >
          <span>
            {approvalsCount} worker waiting on Director approval
          </span>
          <span>Inspect</span>
        </button>
      )}

      <ul className="worker-list">
        {sortedRoles.map((role) => (
          <WorkerRow
            key={role.id}
            role={role}
            isSelected={role.id === selectedRoleId}
            onInspect={onInspectRole}
          />
        ))}
      </ul>
    </section>
  );
};
