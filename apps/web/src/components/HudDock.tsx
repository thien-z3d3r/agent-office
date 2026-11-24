import React, { useMemo } from "react";
import type { AgentRoleId, ProviderId } from "@agent-office/protocol";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Selector } from "@astryxdesign/core/Selector";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import {
  Cpu,
  LayoutGrid,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Settings,
  Sun,
  Telescope,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { useOfficeStore } from "../store/office-store.ts";
import {
  PROVIDER_CATALOG,
  PROVIDER_META_BY_ID,
} from "../store/provider-catalog.ts";
import type { CameraPreset } from "../App.tsx";
import type { DrawerTab } from "./SidePanel.tsx";

export interface HudDockProps {
  nightMode: boolean;
  onToggleNightMode: () => void;
  cameraPreset: CameraPreset;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  onToggleDrawer: () => void;
  onOpenDrawerTab: (tab: DrawerTab) => void;
  onOpenDispatch: () => void;
}

export const HudDock: React.FC<HudDockProps> = React.memo(
  ({
    nightMode,
    onToggleNightMode,
    cameraPreset,
    onSelectCameraPreset,
    drawerOpen,
    onToggleDrawer,
    onOpenDrawerTab,
    onOpenDispatch,
  }) => {
    const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
    const activeModel = useOfficeStore((s) => s.snapshot.activeModel ?? null);
    const catalogDefault = useOfficeStore(
      (s) =>
        s.modelCatalogByProvider[s.snapshot.activeProvider]?.defaultModel ??
        null
    );
    const roleOverrideCount = useOfficeStore((s) => {
      let count = 0;
      const rm = s.snapshot.roleModels;
      if (rm) {
        for (const k in rm) {
          if (rm[k as AgentRoleId]) count += 1;
        }
      }
      return count;
    });
    const setActiveProvider = useOfficeStore((s) => s.setActiveProvider);
    const replayFixture = useOfficeStore((s) => s.replayFixture);
    const openSettingsModal = useOfficeStore((s) => s.openSettingsModal);

    const effectiveDefaultModel =
      activeModel ??
      catalogDefault ??
      PROVIDER_META_BY_ID[activeProvider].defaultModel;

    const providerOptions = useMemo(
      () =>
        PROVIDER_CATALOG.map((opt) => ({
          value: opt.id,
          label: opt.shortLabel,
          description: opt.authMode === "jcode-oauth" ? "jcode OAuth" : "API Key / CLI",
        })),
      []
    );

    const demoMenuItems = useMemo(
      () => [
        {
          type: "section" as const,
          title: "Replay Workflows",
          items: [
            {
              label: "Demo S-Ticket",
              description: "Fast single-engineer fix and review",
              icon: Zap,
              onClick: () => {
                onOpenDrawerTab("tasks");
                void replayFixture("s-ticket");
              },
            },
            {
              label: "Demo 8-Agent Flow",
              description: "Full PM, TL, Dev, QA, Review & DevOps",
              icon: Workflow,
              onClick: () => {
                onOpenDrawerTab("tasks");
                void replayFixture("l-ticket-handoff");
              },
            },
          ],
        },
        { type: "divider" as const },
        {
          label: "Providers & OAuth",
          description: "Configure credentials and runtimes",
          icon: Settings,
          onClick: () => openSettingsModal("credentials"),
        },
        {
          label: "Model Catalog",
          description: "Default model and per-role overrides",
          icon: Cpu,
          onClick: () => openSettingsModal("models"),
        },
      ],
      [onOpenDrawerTab, openSettingsModal, replayFixture]
    );

    return (
      <nav className="hud-surface hud-command-bar" aria-label="Office actions">
        <div className="hud-provider-slot">
          <Selector
            label="Active provider"
            isLabelHidden
            size="sm"
            variant="ghost"
            width="100%"
            value={activeProvider}
            options={providerOptions}
            onChange={(val) =>
              void setActiveProvider(val as ProviderId, undefined, null)
            }
          />
        </div>

        <div className="hud-model-btn-wrap">
          <Button
            size="sm"
            variant="ghost"
            icon={<Icon icon={Cpu} />}
            label={`Models: ${effectiveDefaultModel}`}
            tooltip={`Default model: ${effectiveDefaultModel}${
              roleOverrideCount > 0
                ? ` (+${roleOverrideCount} role overrides)`
                : ""
            }`}
            endContent={
              roleOverrideCount > 0 ? (
                <Badge variant="orange" label={`+${roleOverrideCount}`} />
              ) : undefined
            }
            onClick={() => openSettingsModal("models")}
          >
            <span className="hud-model-chip-text">{effectiveDefaultModel}</span>
          </Button>
        </div>

        <span className="hud-bar-divider" aria-hidden="true" />

        <SegmentedControl
          label="Camera view"
          size="sm"
          value={cameraPreset}
          onChange={(val) => onSelectCameraPreset(val as CameraPreset)}
        >
          <SegmentedControlItem
            value="overview"
            label="Office"
            icon={<Icon icon={LayoutGrid} size="xsm" />}
          />
          <SegmentedControlItem
            value="meeting"
            label="Standup"
            icon={<Icon icon={Users} size="xsm" />}
          />
          <SegmentedControlItem
            value="telescope"
            label="Loft"
            icon={<Icon icon={Telescope} size="xsm" />}
          />
        </SegmentedControl>

        <span className="hud-bar-divider" aria-hidden="true" />

        <Button
          variant="primary"
          size="sm"
          icon={<Icon icon={Plus} />}
          label="Dispatch"
          tooltip="Dispatch a new task to the office"
          onClick={onOpenDispatch}
        />

        <div className="hud-demos-wrap">
          <DropdownMenu
            button={{
              label: "Demos",
              size: "sm",
              variant: "ghost",
              icon: <Icon icon={Play} />,
            }}
            items={demoMenuItems}
            alignment="end"
            menuWidth={260}
          />
        </div>

        <IconButton
          size="sm"
          variant="ghost"
          icon={<Icon icon={Settings} />}
          label="Providers and credentials settings"
          tooltip="Providers, OAuth & Models"
          onClick={() => openSettingsModal("credentials")}
        />

        <IconButton
          size="sm"
          variant="ghost"
          icon={<Icon icon={nightMode ? Sun : Moon} />}
          label={
            nightMode
              ? "Switch to Day theme"
              : "Switch to Night theme"
          }
          tooltip={nightMode ? "Switch to Day mode" : "Switch to Night mode"}
          onClick={onToggleNightMode}
        />

        <IconButton
          size="sm"
          variant={drawerOpen ? "secondary" : "ghost"}
          icon={
            <Icon icon={drawerOpen ? PanelRightClose : PanelRightOpen} />
          }
          label={drawerOpen ? "Hide workspace drawer" : "Show workspace drawer"}
          tooltip={drawerOpen ? "Hide workspace panel" : "Show workspace panel"}
          onClick={onToggleDrawer}
        />
      </nav>
    );
  }
);

HudDock.displayName = "HudDock";
