import React from "react";
import type { AgentRoleId } from "@agent-office/protocol";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { ListChecks, Users } from "lucide-react";
import { useOfficeStore } from "../store/office-store.ts";
import { WorkersPanel } from "./WorkersPanel.tsx";
import { TaskTablePanel } from "./TaskTablePanel.tsx";
import { SpendPanel } from "./SpendPanel.tsx";

export type DrawerTab = "workers" | "tasks";

export interface SidePanelProps {
  open: boolean;
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  onInspectRole: (roleId: AgentRoleId) => void;
  onOpenDispatch: () => void;
}

export const SidePanel: React.FC<SidePanelProps> = React.memo(
  ({
    open,
    activeTab,
    onTabChange,
    onClose,
    onInspectRole,
    onOpenDispatch,
  }) => {
    const rolesCount = useOfficeStore((s) => s.roles.length);
    const taskCount = useOfficeStore((s) => {
      let count = 0;
      for (const _ in s.snapshot.taskTable) count += 1;
      return count;
    });

    if (!open) {
      return null;
    }

    return (
      <aside
        id="office-panels"
        tabIndex={-1}
        className="hud-surface hud-drawer"
        aria-label="Office workspace inspector"
      >
        <div className="hud-drawer-header">
          <div className="hud-drawer-tabs">
            <TabList
              role="tablist"
              size="sm"
              layout="fill"
              value={activeTab}
              onChange={(val) => onTabChange(val as DrawerTab)}
            >
              <Tab
                value="workers"
                panelId="drawer-panel-workers"
                label="Workers"
                icon={<Icon icon={Users} size="xsm" />}
                endContent={
                  <Text type="supporting" hasTabularNumbers>
                    {rolesCount}
                  </Text>
                }
              />
              <Tab
                value="tasks"
                panelId="drawer-panel-tasks"
                label="Tasks"
                icon={<Icon icon={ListChecks} size="xsm" />}
                endContent={
                  taskCount > 0 ? (
                    <Text type="supporting" hasTabularNumbers>
                      {taskCount}
                    </Text>
                  ) : undefined
                }
              />
            </TabList>
          </div>

          <IconButton
            size="sm"
            variant="ghost"
            icon={<Icon icon="close" size="xsm" />}
            label="Hide workspace panel"
            tooltip="Hide panel"
            onClick={onClose}
          />
        </div>

        <div className="hud-drawer-body">
          {activeTab === "workers" ? (
            <WorkersPanel onInspectRole={onInspectRole} />
          ) : (
            <TaskTablePanel
              onOpenDispatch={onOpenDispatch}
              onInspectRole={onInspectRole}
            />
          )}
        </div>

        <SpendPanel />
      </aside>
    );
  }
);

SidePanel.displayName = "SidePanel";
