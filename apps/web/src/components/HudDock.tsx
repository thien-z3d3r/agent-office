import React from "react";
import type { ProviderId } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";

const PROVIDER_OPTIONS: Array<{ id: ProviderId; label: string }> = [
  { id: "antigravity", label: "Antigravity (jcode OAuth)" },
  { id: "claude", label: "Claude (Console API Key)" },
  { id: "openai_oauth", label: "OpenAI (ChatGPT OAuth)" },
  { id: "openai_api", label: "OpenAI (Platform API Key)" },
  { id: "kimi_code", label: "Kimi Code (Coding API Key)" },
  { id: "gemini", label: "Gemini (Google API Key)" },
];

export interface HudDockProps {
  nightMode: boolean;
  onToggleNightMode: () => void;
  cameraPreset: "overview" | "meeting" | "telescope";
  onToggleMeeting: () => void;
  onToggleTelescope: () => void;
  showWorkersPanel: boolean;
  onToggleWorkersPanel: () => void;
  showQueuePanel: boolean;
  onToggleQueuePanel: () => void;
  onOpenDispatch: () => void;
}

export const HudDock: React.FC<HudDockProps> = ({
  nightMode,
  onToggleNightMode,
  cameraPreset,
  onToggleMeeting,
  onToggleTelescope,
  showWorkersPanel,
  onToggleWorkersPanel,
  showQueuePanel,
  onToggleQueuePanel,
  onOpenDispatch,
}) => {
  const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
  const taskTableCount = useOfficeStore(
    (s) => Object.keys(s.snapshot.taskTable).length
  );
  const rolesCount = useOfficeStore((s) => s.roles.length);
  const setActiveProvider = useOfficeStore((s) => s.setActiveProvider);
  const replayFixture = useOfficeStore((s) => s.replayFixture);
  const triggerStandup = useOfficeStore((s) => s.triggerStandup);
  const setSettingsOpen = useOfficeStore((s) => s.setSettingsOpen);

  return (
    <nav className="dock" aria-label="Office actions">
      <label
        htmlFor="unified-provider-select"
        className="btn dock-btn dock-provider"
      >
        <span className="lbl">Provider:</span>
        <select
          id="unified-provider-select"
          className="dock-select"
          title="Single active provider for all agents"
          value={activeProvider}
          onChange={(e) =>
            void setActiveProvider(e.target.value as ProviderId)
          }
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="btn primary dock-btn"
        onClick={onOpenDispatch}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="lbl">Dispatch Task</span>
      </button>

      <button
        type="button"
        className="btn dock-btn"
        onClick={() => void replayFixture("s-ticket")}
      >
        <span className="lbl">Demo S-Ticket</span>
      </button>

      <button
        type="button"
        className="btn dock-btn"
        onClick={() => void replayFixture("l-ticket-handoff")}
      >
        <span className="lbl">Demo 8-Agent Flow</span>
      </button>

      <button
        type="button"
        className="btn dock-btn"
        onClick={() => {
          void triggerStandup();
          onToggleMeeting();
        }}
        aria-pressed={cameraPreset === "meeting"}
      >
        <span className="lbl">Standup Room</span>
      </button>

      <button
        type="button"
        className="btn dock-btn"
        onClick={onToggleTelescope}
        aria-pressed={cameraPreset === "telescope"}
      >
        <span className="lbl">Loft Telescope</span>
      </button>

      <button
        type="button"
        className="btn dock-btn"
        onClick={onToggleNightMode}
        aria-pressed={nightMode}
        aria-label={
          nightMode
            ? "Night theme (switch to Day)"
            : "Day theme (switch to Night)"
        }
      >
        <span className="lbl">{nightMode ? "Night" : "Day"}</span>
      </button>

      <button
        type="button"
        className="btn dock-btn"
        onClick={onToggleWorkersPanel}
        aria-pressed={showWorkersPanel}
      >
        <span className="lbl">Workers</span>
        <span className="svc-count">{rolesCount}</span>
      </button>

      <button
        type="button"
        className="btn dock-btn"
        onClick={onToggleQueuePanel}
        aria-pressed={showQueuePanel}
      >
        <span className="lbl">Task Table</span>
        {taskTableCount > 0 && (
          <span className="svc-count">{taskTableCount}</span>
        )}
      </button>

      <button
        type="button"
        className="btn dock-btn"
        onClick={() => setSettingsOpen(true)}
      >
        <span className="lbl">Providers & OAuth</span>
      </button>
    </nav>
  );
};
