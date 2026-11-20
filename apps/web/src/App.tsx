import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AgentRoleId } from "@agent-office/protocol";
import "./styles/office.css";
import { useOfficeStore } from "./store/office-store.ts";
import { OfficeCanvas } from "./scene/OfficeCanvas.tsx";
import { onModelsProgress } from "./scene/models.ts";
import { LoadingOverlay } from "./components/LoadingOverlay.tsx";
import { TelescopeOverlay } from "./components/TelescopeOverlay.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { ErrorBanner } from "./components/ErrorBanner.tsx";
import { SidePanel } from "./components/SidePanel.tsx";
import { EventFeed } from "./components/EventFeed.tsx";
import { ApprovalDock } from "./components/ApprovalDock.tsx";
import { DispatchTicketModal } from "./components/DispatchTicketModal.tsx";
import { AgentInspectorModal } from "./components/AgentInspectorModal.tsx";
import { ProvidersModal } from "./components/ProvidersModal.tsx";

export const App: React.FC = () => {
  const reducedMotion = useOfficeStore((s) => s.reducedMotion);
  const settingsOpen = useOfficeStore((s) => s.settingsOpen);
  const setSettingsOpen = useOfficeStore((s) => s.setSettingsOpen);
  const setSelectedRole = useOfficeStore((s) => s.setSelectedRole);
  const connectSocket = useOfficeStore((s) => s.connectSocket);

  const [sceneReady, setSceneReady] = useState(false);
  const [loadPct, setLoadPct] = useState(20);
  const [nightMode, setNightMode] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<
    "overview" | "meeting" | "telescope"
  >("overview");

  const [showWorkersPanel, setShowWorkersPanel] = useState(true);
  const [showQueuePanel, setShowQueuePanel] = useState(true);
  const [showSpendPanel, setShowSpendPanel] = useState(true);

  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [inspectorModalOpen, setInspectorModalOpen] = useState(false);

  const stageMainRef = useRef<HTMLElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);

  const anyModalOpen =
    dispatchModalOpen || inspectorModalOpen || settingsOpen;
  const hasSidePanels = showWorkersPanel || showQueuePanel || showSpendPanel;

  useEffect(() => {
    return connectSocket();
  }, [connectSocket]);

  useEffect(() => {
    return onModelsProgress(({ asked, done }) => {
      if (asked > 0) {
        setLoadPct(Math.min(100, Math.round((done / asked) * 100)));
      }
    });
  }, []);

  useLayoutEffect(() => {
    const stageMain = stageMainRef.current;
    const hud = hudRef.current;
    if (stageMain) stageMain.inert = anyModalOpen;
    if (hud) hud.inert = anyModalOpen;
    return () => {
      if (stageMain) stageMain.inert = false;
      if (hud) hud.inert = false;
    };
  }, [anyModalOpen]);

  useEffect(() => {
    if (cameraPreset !== "telescope" || anyModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCameraPreset("overview");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cameraPreset, anyModalOpen]);

  const openAgentInspector = useCallback(
    (roleId: AgentRoleId) => {
      setSelectedRole(roleId);
      setInspectorModalOpen(true);
    },
    [setSelectedRole]
  );

  const handleSceneReady = useCallback(() => {
    setSceneReady(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, [setSettingsOpen]);

  return (
    <div
      id="app"
      className={reducedMotion ? "hud-root reduced-motion" : "hud-root"}
      data-theme={nightMode ? "night" : "day"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      {!sceneReady && <LoadingOverlay loadPct={loadPct} />}

      <main
        ref={stageMainRef}
        id="stage-main"
        aria-hidden={anyModalOpen || undefined}
      >
        <OfficeCanvas
          nightMode={nightMode}
          cameraPreset={cameraPreset}
          onReady={handleSceneReady}
          onSelectAgentModal={openAgentInspector}
        />

        {cameraPreset === "telescope" && (
          <TelescopeOverlay onExit={() => setCameraPreset("overview")} />
        )}
      </main>

      <div
        ref={hudRef}
        id="hud"
        className={hasSidePanels ? undefined : "no-side"}
        aria-hidden={anyModalOpen || undefined}
      >
        <a
          href={hasSidePanels ? "#office-panels" : "#office-events"}
          className="skip-link"
        >
          {hasSidePanels ? "Skip to office panels" : "Skip to recent events"}
        </a>

        <TopBar
          nightMode={nightMode}
          onToggleNightMode={() => setNightMode((n) => !n)}
          cameraPreset={cameraPreset}
          onToggleMeeting={() =>
            setCameraPreset((p) => (p === "meeting" ? "overview" : "meeting"))
          }
          onToggleTelescope={() =>
            setCameraPreset((p) =>
              p === "telescope" ? "overview" : "telescope"
            )
          }
          showWorkersPanel={showWorkersPanel}
          onToggleWorkersPanel={() => setShowWorkersPanel((v) => !v)}
          showQueuePanel={showQueuePanel}
          onToggleQueuePanel={() => setShowQueuePanel((v) => !v)}
          onOpenDispatch={() => setDispatchModalOpen(true)}
        />

        <ErrorBanner />

        <SidePanel
          showWorkersPanel={showWorkersPanel}
          onHideWorkersPanel={() => setShowWorkersPanel(false)}
          showQueuePanel={showQueuePanel}
          onHideQueuePanel={() => setShowQueuePanel(false)}
          showSpendPanel={showSpendPanel}
          onHideSpendPanel={() => setShowSpendPanel(false)}
          onInspectRole={openAgentInspector}
          onOpenDispatch={() => setDispatchModalOpen(true)}
        />

        <EventFeed />

        <ApprovalDock />
      </div>

      <DispatchTicketModal
        open={dispatchModalOpen}
        onClose={() => setDispatchModalOpen(false)}
      />

      <AgentInspectorModal
        open={inspectorModalOpen}
        onClose={() => setInspectorModalOpen(false)}
      />

      <ProvidersModal open={settingsOpen} onClose={handleCloseSettings} />
    </div>
  );
};
