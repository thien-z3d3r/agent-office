import React from "react";
import type { AgentRoleId } from "@agent-office/protocol";
import { WorkersPanel } from "./WorkersPanel.tsx";
import { TaskTablePanel } from "./TaskTablePanel.tsx";
import { SpendPanel } from "./SpendPanel.tsx";

export interface SidePanelProps {
  showWorkersPanel: boolean;
  onHideWorkersPanel: () => void;
  showQueuePanel: boolean;
  onHideQueuePanel: () => void;
  showSpendPanel: boolean;
  onHideSpendPanel: () => void;
  onInspectRole: (roleId: AgentRoleId) => void;
  onOpenDispatch: () => void;
}

export const SidePanel: React.FC<SidePanelProps> = React.memo(({
  showWorkersPanel,
  onHideWorkersPanel,
  showQueuePanel,
  onHideQueuePanel,
  showSpendPanel,
  onHideSpendPanel,
  onInspectRole,
  onOpenDispatch,
}) => {
  if (!showWorkersPanel && !showQueuePanel && !showSpendPanel) {
    return null;
  }

  return (
    <aside
      id="office-panels"
      tabIndex={-1}
      className="side"
      aria-label="Office status panels"
    >
      {showWorkersPanel && (
        <WorkersPanel
          onHide={onHideWorkersPanel}
          onInspectRole={onInspectRole}
        />
      )}
      {showQueuePanel && (
        <TaskTablePanel
          onHide={onHideQueuePanel}
          onOpenDispatch={onOpenDispatch}
          onInspectRole={onInspectRole}
        />
      )}
      {showSpendPanel && <SpendPanel onHide={onHideSpendPanel} />}
    </aside>
  );
});

SidePanel.displayName = "SidePanel";
