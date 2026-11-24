import React from "react";
import type { AgentRoleId } from "@agent-office/protocol";
import { Badge } from "@astryxdesign/core/Badge";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Boxes } from "lucide-react";
import { useOfficeStore } from "../store/office-store.ts";
import { HudDock, type HudDockProps } from "./HudDock.tsx";

export type TopBarProps = HudDockProps;

export const TopBar: React.FC<TopBarProps> = React.memo((props) => {
  const connected = useOfficeStore((s) => s.connected);
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
    <header className="hud-topbar">
      <div className="hud-surface hud-brand">
        <span className="hud-brand-mark" aria-hidden="true">
          <Boxes size={15} strokeWidth={2.2} />
        </span>

        <h1 className="hud-brand-title">Agent Office</h1>

        <StatusDot
          variant={connected ? "success" : "error"}
          label={connected ? "Connected to local event stream" : "Disconnected"}
          tooltip={
            connected
              ? "Live connection to local Agent Office server"
              : "Reconnecting to local server"
          }
        />

        <span className="hud-brand-meta" title="Active sub-agents in office">
          {activeWorkersCount}/{rolesCount} active
        </span>

        {approvalsCount > 0 && (
          <Badge variant="error" label={`${approvalsCount} waiting`} />
        )}
      </div>

      <HudDock {...props} />
    </header>
  );
});

TopBar.displayName = "TopBar";
