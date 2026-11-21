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
  const performanceMode = useOfficeStore((s) => s.performanceMode);
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
  const stageInert = anyModalOpen || !sceneReady;
  const hudInert = stageInert || cameraPreset === "telescope";
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
    if (stageMain) stageMain.inert = stageInert;
    if (hud) hud.inert = hudInert;
    return () => {
      if (stageMain) stageMain.inert = false;
      if (hud) hud.inert = false;
    };
  }, [stageInert, hudInert]);

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

  const handleExitTelescope = useCallback(() => {
    setCameraPreset("overview");
  }, []);

  const handleToggleNightMode = useCallback(() => {
    setNightMode((n) => !n);
  }, []);

  const handleToggleMeeting = useCallback(() => {
    setCameraPreset((p) => (p === "meeting" ? "overview" : "meeting"));
  }, []);

  const handleToggleTelescope = useCallback(() => {
    setCameraPreset((p) => (p === "telescope" ? "overview" : "telescope"));
  }, []);

  const handleToggleWorkersPanel = useCallback(() => {
    setShowWorkersPanel((v) => !v);
  }, []);

  const handleToggleQueuePanel = useCallback(() => {
    setShowQueuePanel((v) => !v);
  }, []);

  const handleHideWorkersPanel = useCallback(() => {
    setShowWorkersPanel(false);
  }, []);

  const handleHideQueuePanel = useCallback(() => {
    setShowQueuePanel(false);
  }, []);

  const handleHideSpendPanel = useCallback(() => {
    setShowSpendPanel(false);
  }, []);

  const handleOpenDispatch = useCallback(() => {
    setDispatchModalOpen(true);
  }, []);

  const handleCloseDispatch = useCallback(() => {
    setDispatchModalOpen(false);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setInspectorModalOpen(false);
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
      data-performance-mode={performanceMode ? "true" : "false"}
    >
      {!sceneReady && <LoadingOverlay loadPct={loadPct} />}

      <main
        ref={stageMainRef}
        id="stage-main"
        aria-hidden={stageInert || undefined}
      >
        <OfficeCanvas
          nightMode={nightMode}
          cameraPreset={cameraPreset}
          onReady={handleSceneReady}
          onSelectAgentModal={openAgentInspector}
        />

        {cameraPreset === "telescope" && (
          <TelescopeOverlay onExit={handleExitTelescope} />
        )}
      </main>

      <div
        ref={hudRef}
        id="hud"
        className={hasSidePanels ? undefined : "no-side"}
        aria-hidden={hudInert || undefined}
      >
        <a
          href={hasSidePanels ? "#office-panels" : "#office-events"}
          className="skip-link"
        >
          {hasSidePanels ? "Skip to office panels" : "Skip to recent events"}
        </a>

        <TopBar
          nightMode={nightMode}
          onToggleNightMode={handleToggleNightMode}
          cameraPreset={cameraPreset}
          onToggleMeeting={handleToggleMeeting}
          onToggleTelescope={handleToggleTelescope}
          showWorkersPanel={showWorkersPanel}
          onToggleWorkersPanel={handleToggleWorkersPanel}
          showQueuePanel={showQueuePanel}
          onToggleQueuePanel={handleToggleQueuePanel}
          onOpenDispatch={handleOpenDispatch}
        />

        <ErrorBanner />

        <SidePanel
          showWorkersPanel={showWorkersPanel}
          onHideWorkersPanel={handleHideWorkersPanel}
          showQueuePanel={showQueuePanel}
          onHideQueuePanel={handleHideQueuePanel}
          showSpendPanel={showSpendPanel}
          onHideSpendPanel={handleHideSpendPanel}
          onInspectRole={openAgentInspector}
          onOpenDispatch={handleOpenDispatch}
        />

        <EventFeed />

        <ApprovalDock />
      </div>

      <DispatchTicketModal
        open={dispatchModalOpen}
        onClose={handleCloseDispatch}
      />

      <AgentInspectorModal
        open={inspectorModalOpen}
        onClose={handleCloseInspector}
      />

      <ProvidersModal open={settingsOpen} onClose={handleCloseSettings} />
    </div>
  );
};
