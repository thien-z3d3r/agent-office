import React, { useMemo } from "react";
import type { AgentRoleId } from "@agent-office/protocol";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { ListChecks, Plus } from "lucide-react";
import { useOfficeStore } from "../store/office-store.ts";
import {
  PROVIDER_META_BY_ID,
  resolveModelForRole,
} from "../store/provider-catalog.ts";

export interface TaskTablePanelProps {
  onOpenDispatch: () => void;
  onInspectRole: (roleId: AgentRoleId) => void;
}

export const TaskTablePanel: React.FC<TaskTablePanelProps> = React.memo(
  ({ onOpenDispatch, onInspectRole }) => {
    const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
    const activeRuntime = useOfficeStore((s) => s.snapshot.activeRuntime);
    const activeModel = useOfficeStore((s) => s.snapshot.activeModel ?? null);
    const roleModels = useOfficeStore((s) => s.snapshot.roleModels);
    const catalogDefault = useOfficeStore(
      (s) =>
        s.modelCatalogByProvider[s.snapshot.activeProvider]?.defaultModel ??
        null
    );
    const taskTable = useOfficeStore((s) => s.snapshot.taskTable);
    const selectedRoleId = useOfficeStore((s) => s.selectedRoleId);
    const setSelectedTicket = useOfficeStore((s) => s.setSelectedTicket);

    const taskTableRows = useMemo(
      () => Object.values(taskTable).sort((a, b) => a.order - b.order),
      [taskTable]
    );

    const effectiveDefaultModel =
      activeModel ??
      catalogDefault ??
      PROVIDER_META_BY_ID[activeProvider].defaultModel;

    return (
      <section
        id="drawer-panel-tasks"
        role="tabpanel"
        className="hud-drawer-body"
        aria-label="Task table and sub-agent spawner"
      >
        <div className="hud-task-context">
          <span>
            {PROVIDER_META_BY_ID[activeProvider].shortLabel} ({activeRuntime})
          </span>
          <span className="hud-mono-tag">{effectiveDefaultModel}</span>
        </div>

        <div className="hud-drawer-scroll">
          {taskTableRows.length === 0 ? (
            <EmptyState
              isCompact
              icon={<Icon icon={ListChecks} size="lg" />}
              title="No active sub-agent tasks"
              description={`Dispatch a ticket or run a demo workflow so ${PROVIDER_META_BY_ID[activeProvider].shortLabel} spawns role sub-agents.`}
              actions={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Icon icon={Plus} />}
                  label="Dispatch First Task"
                  onClick={onOpenDispatch}
                />
              }
            />
          ) : (
            <ul className="hud-list">
              {taskTableRows.map((row) => {
                const isSelected = selectedRoleId === row.role;
                const rowModel =
                  row.model ??
                  resolveModelForRole({
                    provider: row.provider,
                    roleId: row.role,
                    activeModel,
                    roleModels,
                    catalogDefault,
                  });

                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="hud-list-row"
                      data-selected={isSelected ? "true" : undefined}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => {
                        setSelectedTicket(row.ticketId);
                        onInspectRole(row.role);
                      }}
                    >
                      <span className="hud-row-main">
                        <span className="hud-row-head">
                          <span className="hud-row-title" title={row.title}>
                            #{row.order} [{row.role.toUpperCase()}] {row.title}
                          </span>
                          <span className="hud-row-status">
                            {row.status === "failed" ? (
                              <Badge variant="error" label="Failed" />
                            ) : row.status === "running" ? (
                              <Badge variant="orange" label="Running" />
                            ) : (
                              <span
                                className="hud-status-quiet"
                                data-state={
                                  row.status === "done" ? "done" : undefined
                                }
                              >
                                {row.status}
                              </span>
                            )}
                          </span>
                        </span>

                        <span className="hud-row-meta">
                          <span className="hud-mono-tag">{rowModel}</span>
                          <span className="hud-row-sub">
                            {row.artifactOrCmd}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    );
  }
);

TaskTablePanel.displayName = "TaskTablePanel";
