import React from "react";
import { Banner } from "@astryxdesign/core/Banner";
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
    <div className="hud-banner-stack">
      {!connected && (
        <Banner
          status="warning"
          elevation="med"
          title="Offline"
          description="WebSocket disconnected. Reconnecting to local server at 127.0.0.1:4173..."
        />
      )}

      {lastError && (
        <Banner
          status="error"
          elevation="med"
          title="Server Error"
          description={lastError}
          isDismissable
          dismissLabel="Dismiss error"
          onDismiss={clearError}
        />
      )}

      {modelsError && (
        <Banner
          status="error"
          elevation="med"
          title="3D Asset Error"
          description={modelsError}
          isDismissable
          dismissLabel="Dismiss 3D asset error"
          onDismiss={() => setModelsError(null)}
        />
      )}
    </div>
  );
});

ErrorBanner.displayName = "ErrorBanner";
