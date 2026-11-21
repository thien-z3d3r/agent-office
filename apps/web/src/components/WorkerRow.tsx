import React from "react";
import type { AgentRoleId, RoleConfig } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";
import { resolveModelForRole } from "../store/provider-catalog.ts";

export interface WorkerRowProps {
  role: RoleConfig;
  isSelected: boolean;
  onInspect: (roleId: AgentRoleId) => void;
}

export const WorkerRow: React.FC<WorkerRowProps> = React.memo(
  ({ role, isSelected, onInspect }) => {
    const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
    const activeModel = useOfficeStore((s) => s.snapshot.activeModel ?? null);
    const roleModel = useOfficeStore(
      (s) => s.snapshot.roleModels?.[role.id] ?? null
    );
    const catalogDefault = useOfficeStore(
      (s) =>
        s.modelCatalogByProvider[s.snapshot.activeProvider]?.defaultModel ?? null
    );
    const status = useOfficeStore(
      (s) => s.snapshot.agents[role.id]?.status ?? "idle"
    );
    const detail = useOfficeStore(
      (s) => s.snapshot.agents[role.id]?.detail ?? "Ready at desk"
    );
    const subAgentId = useOfficeStore(
      (s) => s.snapshot.agents[role.id]?.subAgentId ?? null
    );

    const resolvedModel = resolveModelForRole({
      provider: activeProvider,
      roleId: role.id,
      activeModel,
      roleModels: roleModel ? { [role.id]: roleModel } : null,
      catalogDefault,
    });
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
            <span className="worker-model-row">
              <span className="code-chip worker-model-chip">
                {resolvedModel}
              </span>
              {roleModel && (
                <span className="worker-model-tag">role override</span>
              )}
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
