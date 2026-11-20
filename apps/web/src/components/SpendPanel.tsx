import React from "react";
import { useOfficeStore } from "../store/office-store.ts";

export interface SpendPanelProps {
  onHide: () => void;
}

export const SpendPanel: React.FC<SpendPanelProps> = ({ onHide }) => {
  const totalCostUsd = useOfficeStore((s) => s.snapshot.totalCostUsd);
  const reducedMotion = useOfficeStore((s) => s.reducedMotion);
  const toggleReducedMotion = useOfficeStore((s) => s.toggleReducedMotion);

  const budgetPct = Math.min(100, (totalCostUsd / 15.0) * 100);

  return (
    <section
      className="panel spend-panel"
      aria-label="Spend and accessibility"
    >
      <h2>
        <span>Spend & Motion</span>
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
      <div className="budget-meter spend-meter">
        <div className="budget-fill" style={{ width: `${budgetPct}%` }} />
      </div>
      <button
        type="button"
        className="btn btn-sm btn-block"
        onClick={() => toggleReducedMotion()}
        aria-pressed={reducedMotion}
      >
        Reduced Motion: {reducedMotion ? "ON (Instant)" : "OFF"}
      </button>
    </section>
  );
};
