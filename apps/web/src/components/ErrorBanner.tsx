import React from "react";
import { useOfficeStore } from "../store/office-store.ts";

export const ErrorBanner: React.FC = React.memo(() => {
  const connected = useOfficeStore((s) => s.connected);
  const lastError = useOfficeStore((s) => s.lastError);
  const clearError = useOfficeStore((s) => s.clearError);
  const modelsError = useOfficeStore((s) => s.modelsError);
  const setModelsError = useOfficeStore((s) => s.setModelsError);

  if (connected && !lastError && !modelsError) {
    return null;
  }

  return (
    <div className="banner-stack">
      {!connected && (
        <div className="hud-banner" role="status" aria-live="polite">
          <span className="hud-banner-text">
            <span className="pill error">Offline</span>
            <span>
              WebSocket disconnected. Reconnecting to local server at
              127.0.0.1:4173...
            </span>
          </span>
        </div>
      )}

      {lastError && (
        <div className="hud-banner" role="alert">
          <span className="hud-banner-text">
            <span className="pill error">Error</span>
            <span>{lastError}</span>
          </span>
          <button
            type="button"
            className="btn btn-sm"
            aria-label="Dismiss error"
            onClick={clearError}
          >
            Dismiss
          </button>
        </div>
      )}

      {modelsError && (
        <div className="hud-banner" role="alert">
          <span className="hud-banner-text">
            <span className="pill error">3D Asset Error</span>
            <span>{modelsError}</span>
          </span>
          <button
            type="button"
            className="btn btn-sm"
            aria-label="Dismiss 3D asset error"
            onClick={() => setModelsError(null)}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
});

ErrorBanner.displayName = "ErrorBanner";
