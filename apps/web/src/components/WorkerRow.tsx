import React from "react";
import type { AgentRoleId, RoleConfig } from "@agent-office/protocol";
import { Badge } from "@astryxdesign/core/Badge";
import { useOfficeStore } from "../store/office-store.ts";
import { resolveModelForRole } from "../store/provider-catalog.ts";

export interface WorkerRowProps {
  role: RoleConfig;
  isSelected: boolean;
  onInspect: (roleId: AgentRoleId) => void;
}

const ACTIVE_WORK_STATES = new Set([
  "thinking",
  "writing",
  "reading",
  "testing",
  "web",
  "standup",
  "handoff",
]);

export const WorkerRow: React.FC<WorkerRowProps> = React.memo(
  ({ role, isSelected, onInspect }) => {
    const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
    const activeModel = useOfficeStore((s) => s.snapshot.activeModel ?? null);
    const roleModel = useOfficeStore(
      (s) => s.snapshot.roleModels?.[role.id] ?? null
    );
    const catalogDefault = useOfficeStore(
      (s) =>
        s.modelCatalogByProvider[s.snapshot.activeProvider]?.defaultModel ??
        null
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
    const isError = status === "error";
    const isWorking = ACTIVE_WORK_STATES.has(status);

    return (
      <li>
        <button
          type="button"
          className="hud-list-row"
          data-selected={isSelected ? "true" : undefined}
          data-attention={isWaiting || isError ? "true" : undefined}
          aria-current={isSelected ? "true" : undefined}
          onClick={() => onInspect(role.id)}
        >
          <span
            className="hud-role-dot"
            style={{ background: role.tint }}
            aria-hidden="true"
          />

          <span className="hud-row-main">
            <span className="hud-row-head">
              <span className="hud-row-title">
                {role.id.toUpperCase()} · {role.title}
              </span>

              <span className="hud-row-status">
                {isWaiting ? (
                  <Badge variant="error" label="Needs you" />
                ) : isError ? (
                  <Badge variant="error" label="Error" />
                ) : isWorking ? (
                  <Badge variant="orange" label={status} />
                ) : (
                  <span
                    className="hud-status-quiet"
                    data-state={status === "done" ? "done" : undefined}
                  >
                    {status}
                  </span>
                )}
              </span>
            </span>

            <span className="hud-row-meta">
              <span className="hud-mono-tag">{resolvedModel}</span>
              {roleModel && <span>override</span>}
            </span>

            <span className="hud-row-sub" title={detail}>
              {subAgentId ? `${subAgentId} · ` : ""}
              {detail}
            </span>
          </span>
        </button>
      </li>
    );
  }
);

WorkerRow.displayName = "WorkerRow";
