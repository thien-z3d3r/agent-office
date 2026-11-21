import React from "react";
import { useOfficeStore } from "../store/office-store.ts";

export interface SpendPanelProps {
  onHide: () => void;
}

export const SpendPanel: React.FC<SpendPanelProps> = React.memo(({ onHide }) => {
  const totalCostUsd = useOfficeStore((s) => s.snapshot.totalCostUsd);
  const reducedMotion = useOfficeStore((s) => s.reducedMotion);
  const toggleReducedMotion = useOfficeStore((s) => s.toggleReducedMotion);
  const performanceMode = useOfficeStore((s) => s.performanceMode);
  const togglePerformanceMode = useOfficeStore((s) => s.togglePerformanceMode);

  const budgetPct = Math.min(100, (totalCostUsd / 15.0) * 100);

  return (
    <section
      className="panel spend-panel"
      aria-label="Spend, motion, and performance"
    >
      <h2>
        <span>Spend & Performance</span>
        <button
          type="button"
          className="panel-x panel-x-end"
          aria-label="Hide Spend panel"
          onClick={onHide}
        >
          <span aria-hidden="true">X</span>
        </button>
      </h2>
      <div className="spend-row">
        <span>Session Spend: ${totalCostUsd.toFixed(4)}</span>
        <span>Daily Cap: $15.00</span>
      </div>
      <div
        className="budget-meter spend-meter"
        role="progressbar"
        aria-label="Daily spend budget"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(budgetPct)}
        aria-valuetext={`$${totalCostUsd.toFixed(4)} of $15.00 daily cap`}
      >
        <div className="budget-fill" style={{ width: `${budgetPct}%` }} />
      </div>
      <div className="spend-controls">
        <button
          type="button"
          className="btn btn-sm btn-block"
          onClick={toggleReducedMotion}
          aria-pressed={reducedMotion}
        >
          Reduced Motion: {reducedMotion ? "ON (Instant)" : "OFF"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-block"
          onClick={togglePerformanceMode}
          aria-pressed={performanceMode}
        >
          Performance Mode: {performanceMode ? "ON (Low-GPU)" : "OFF"}
        </button>
      </div>
    </section>
  );
});

SpendPanel.displayName = "SpendPanel";
