import React from "react";
import type { AgentRoleId } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";
import { HudDock, type HudDockProps } from "./HudDock.tsx";

export type TopBarProps = HudDockProps;

export const TopBar: React.FC<TopBarProps> = React.memo((props) => {
  const connected = useOfficeStore((s) => s.connected);
  const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
  const activeRuntime = useOfficeStore((s) => s.snapshot.activeRuntime);
  const rolesCount = useOfficeStore((s) => s.roles.length);
  const approvalsCount = useOfficeStore((s) => {
    let count = 0;
    for (const _ in s.snapshot.approvals) count += 1;
    return count;
  });
  const activeWorkersCount = useOfficeStore((s) => {
    let count = 0;
    for (const id in s.snapshot.agents) {
      if (s.snapshot.agents[id as AgentRoleId]?.status !== "idle") count += 1;
    }
    return count;
  });

  return (
    <header className="topbar">
      <div className="project panel">
        <h1 className="project-name">
          <span>Agent Office</span>
          <span
            className={`pill ${connected ? "done" : "error"}`}
            title={
              connected
                ? "Connected to local event stream"
                : "Disconnected from local server"
            }
          >
            {connected ? "Live" : "Offline"}
          </span>
          {approvalsCount > 0 && (
            <span className="svc-count">{approvalsCount} waiting</span>
          )}
        </h1>
        <div className="project-meta">
          Unified Provider: <strong>{activeProvider.toUpperCase()}</strong> (
          {activeRuntime}) · Active sub-agents: {activeWorkersCount}/
          {rolesCount}
        </div>
      </div>

      <HudDock {...props} />
    </header>
  );
});

TopBar.displayName = "TopBar";
