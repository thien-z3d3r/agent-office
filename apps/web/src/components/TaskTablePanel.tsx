import React, { useMemo } from "react";
import type { AgentRoleId } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";

export interface TaskTablePanelProps {
  onHide: () => void;
  onOpenDispatch: () => void;
  onInspectRole: (roleId: AgentRoleId) => void;
}

export const TaskTablePanel: React.FC<TaskTablePanelProps> = ({
  onHide,
  onOpenDispatch,
  onInspectRole,
}) => {
  const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
  const activeRuntime = useOfficeStore((s) => s.snapshot.activeRuntime);
  const taskTable = useOfficeStore((s) => s.snapshot.taskTable);
  const selectedRoleId = useOfficeStore((s) => s.selectedRoleId);
  const setSelectedTicket = useOfficeStore((s) => s.setSelectedTicket);

  const taskTableRows = useMemo(
    () => Object.values(taskTable).sort((a, b) => a.order - b.order),
    [taskTable]
  );

  return (
    <section
      className="panel"
      aria-label="Task table and sub-agent spawner"
    >
      <h2>
        <span>Task Table (Sub-Agents)</span>
        <span className="count">({taskTableRows.length})</span>
        <button
          type="button"
          className="panel-x panel-x-end"
          aria-label="Hide Task Table panel"
          onClick={onHide}
        >
          <span aria-hidden="true">X</span>
        </button>
      </h2>

      <div className="panel-hint">
        Unified Provider:{" "}
        <span className="code-chip">
          {activeProvider} ({activeRuntime})
        </span>{" "}
        spawns role sub-agents row by row
      </div>

      {taskTableRows.length === 0 ? (
        <div className="empty-state" role="status">
          <span className="pill idle">Empty</span>
          <p>
            Task Table is empty. Dispatch a task or trigger a demo workflow so{" "}
            <strong>{activeProvider.toUpperCase()}</strong> spawns role
            sub-agents through the table.
          </p>
          <button
            type="button"
            className="btn btn-sm primary"
            onClick={onOpenDispatch}
          >
            Dispatch First Task
          </button>
        </div>
      ) : (
        <ul className="ticket-list">
          {taskTableRows.map((row) => {
            const isSelected = selectedRoleId === row.role;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className={`ticket-row ${isSelected ? "selected" : ""}`}
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => {
                    setSelectedTicket(row.ticketId);
                    onInspectRole(row.role);
                  }}
                >
                  <span className="worker-main">
                    <span className="worker-title">
                      #{row.order} [{row.role.toUpperCase()}] · {row.title}
                    </span>
                    <span className="worker-sub">
                      Sub-Agent: {row.subAgentId} · Target: {row.artifactOrCmd}
                    </span>
                  </span>
                  <span
                    className={`pill ${
                      row.status === "done"
                        ? "done"
                        : row.status === "failed"
                          ? "error"
                          : row.status === "running"
                            ? "writing"
                            : "idle"
                    }`}
                  >
                    {row.status}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
