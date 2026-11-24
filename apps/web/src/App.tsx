import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AgentRoleId } from "@agent-office/protocol";
import { Theme } from "@astryxdesign/core/theme";
import "./styles/office.css";
import { themes, defaultThemeSlug } from "./astryx-themes.ts";
import { useOfficeStore } from "./store/office-store.ts";
import { OfficeCanvas } from "./scene/OfficeCanvas.tsx";
import { onModelsProgress } from "./scene/models.ts";
import { LoadingOverlay } from "./components/LoadingOverlay.tsx";
import { TelescopeOverlay } from "./components/TelescopeOverlay.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { ErrorBanner } from "./components/ErrorBanner.tsx";
import { SidePanel, type DrawerTab } from "./components/SidePanel.tsx";
import { EventFeed } from "./components/EventFeed.tsx";
import { ApprovalDock } from "./components/ApprovalDock.tsx";
import { DispatchTicketModal } from "./components/DispatchTicketModal.tsx";
import { AgentInspectorModal } from "./components/AgentInspectorModal.tsx";
import { ProvidersModal } from "./components/ProvidersModal.tsx";

export type CameraPreset = "overview" | "meeting" | "telescope";

export const App: React.FC = () => {
  const reducedMotion = useOfficeStore((s) => s.reducedMotion);
  const performanceMode = useOfficeStore((s) => s.performanceMode);
  const settingsOpen = useOfficeStore((s) => s.settingsOpen);
  const setSettingsOpen = useOfficeStore((s) => s.setSettingsOpen);
  const setSelectedRole = useOfficeStore((s) => s.setSelectedRole);
  const connectSocket = useOfficeStore((s) => s.connectSocket);
  const triggerStandup = useOfficeStore((s) => s.triggerStandup);

  const [sceneReady, setSceneReady] = useState(false);
  const [loadPct, setLoadPct] = useState(20);
  const [nightMode, setNightMode] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("overview");

  const [drawerOpen, setDrawerOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 900 : true
  );
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("workers");

  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [inspectorModalOpen, setInspectorModalOpen] = useState(false);

  const stageMainRef = useRef<HTMLElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);

  const anyModalOpen =
    dispatchModalOpen || inspectorModalOpen || settingsOpen;
  const stageInert = anyModalOpen || !sceneReady;
  const hudInert = stageInert || cameraPreset === "telescope";

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

  const handleSelectCameraPreset = useCallback(
    (preset: CameraPreset) => {
      if (preset === "meeting" && cameraPreset !== "meeting") {
        void triggerStandup();
      }
      setCameraPreset(preset);
    },
    [cameraPreset, triggerStandup]
  );

  const handleExitTelescope = useCallback(() => {
    setCameraPreset("overview");
  }, []);

  const handleToggleNightMode = useCallback(() => {
    setNightMode((n) => !n);
  }, []);

  const handleToggleDrawer = useCallback(() => {
    setDrawerOpen((open) => !open);
  }, []);

  const handleOpenDrawerTab = useCallback((tab: DrawerTab) => {
    setDrawerTab(tab);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
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
    <Theme theme={themes[defaultThemeSlug]} mode={nightMode ? "dark" : "light"}>
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
          className={drawerOpen ? undefined : "no-side"}
          aria-hidden={hudInert || undefined}
        >
          <a
            href={drawerOpen ? "#office-panels" : "#office-events"}
            className="skip-link"
          >
            {drawerOpen ? "Skip to office panels" : "Skip to recent events"}
          </a>

          <TopBar
            nightMode={nightMode}
            onToggleNightMode={handleToggleNightMode}
            cameraPreset={cameraPreset}
            onSelectCameraPreset={handleSelectCameraPreset}
            drawerOpen={drawerOpen}
            onToggleDrawer={handleToggleDrawer}
            onOpenDrawerTab={handleOpenDrawerTab}
            onOpenDispatch={handleOpenDispatch}
          />

          <ErrorBanner />

          <SidePanel
            open={drawerOpen}
            activeTab={drawerTab}
            onTabChange={setDrawerTab}
            onClose={handleCloseDrawer}
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
    </Theme>
  );
};
