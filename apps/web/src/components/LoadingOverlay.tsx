import React from "react";
import { useOfficeStore } from "../store/office-store.ts";

export interface LoadingOverlayProps {
  loadPct: number;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ loadPct }) => {
  const modelsError = useOfficeStore((s) => s.modelsError);

  return (
    <div id="loading" role="status" aria-live="polite">
      <div className="loading-card panel">
        <svg className="loading-paw" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M32 31c8 0 18 9 18 17 0 6-5 8-10 7-3-.5-5-1.5-8-1.5s-5 1-8 1.5c-5 1-10-1-10-7 0-8 10-17 18-17z" />
          <ellipse
            cx="11.5"
            cy="31"
            rx="5.5"
            ry="7.5"
            transform="rotate(-24 11.5 31)"
          />
          <ellipse
            cx="24"
            cy="17.5"
            rx="6"
            ry="8"
            transform="rotate(-8 24 17.5)"
          />
          <ellipse
            cx="40"
            cy="17.5"
            rx="6"
            ry="8"
            transform="rotate(8 40 17.5)"
          />
          <ellipse
            cx="52.5"
            cy="31"
            rx="5.5"
            ry="7.5"
            transform="rotate(24 52.5 31)"
          />
        </svg>
        <div className="loading-title">Agent Office</div>
        <div
          className="loading-bar"
          role="progressbar"
          aria-label="Loading 3D office models"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={loadPct}
        >
          <span className="loading-fill" style={{ width: `${loadPct}%` }} />
        </div>
        <div className="loading-subtitle">
          Loading Blender glTF models ({loadPct}%)...
        </div>
        {modelsError && (
          <div className="inline-alert" role="alert">
            <span className="pill error">Error</span>
            <span>{modelsError}</span>
          </div>
        )}
      </div>
    </div>
  );
};
