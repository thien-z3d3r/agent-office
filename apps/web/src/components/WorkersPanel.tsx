import React, { useMemo } from "react";
import type { AgentRoleId, RoleConfig } from "@agent-office/protocol";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
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
  onInspectRole: (roleId: AgentRoleId) => void;
}

export const WorkersPanel: React.FC<WorkersPanelProps> = React.memo(
  ({ onInspectRole }) => {
    const roles = useOfficeStore((s) => s.roles);
    const selectedRoleId = useOfficeStore((s) => s.selectedRoleId);
    const approvalsCount = useOfficeStore((s) => {
      let count = 0;
      for (const _ in s.snapshot.approvals) count += 1;
      return count;
    });
    const firstWaitingAgentId = useOfficeStore((s) => {
      for (const id in s.snapshot.approvals) {
        return s.snapshot.approvals[id]?.agentId ?? null;
      }
      return null;
    });
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
      <section
        id="drawer-panel-workers"
        role="tabpanel"
        className="hud-drawer-scroll"
        aria-label="Workers in the office"
      >
        {approvalsCount > 0 && firstWaitingAgentId && (
          <div style={{ marginBottom: "var(--spacing-2)" }}>
            <Banner
              status="error"
              title={`${approvalsCount} waiting on Director`}
              endContent={
                <Button
                  size="sm"
                  variant="secondary"
                  label="Inspect"
                  onClick={() => onInspectRole(firstWaitingAgentId)}
                />
              }
            />
          </div>
        )}

        <ul className="hud-list">
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
  }
);

WorkersPanel.displayName = "WorkersPanel";
