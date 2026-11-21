import React, { useMemo } from "react";
import { useOfficeStore } from "../store/office-store.ts";

export const ApprovalDock: React.FC = React.memo(() => {
  const approvals = useOfficeStore((s) => s.snapshot.approvals);
  const resolveApproval = useOfficeStore((s) => s.resolveApproval);

  const approvalsList = useMemo(() => Object.values(approvals), [approvals]);
  if (approvalsList.length === 0) return null;

  return (
    <section
      className="approval-dock panel"
      aria-label="Director approval requests"
    >
      <div className="approval-title">
        Director Approval Required ({approvalsList.length})
      </div>
      {approvalsList.map((req) => (
        <div key={req.reqId} className="approval-item">
          <div>
            <div className="approval-summary">
              [{req.agentId.toUpperCase()}] ({req.ticketId} · {req.kind}):{" "}
              <span className="code-chip">{req.action}</span>
            </div>
            <div className="approval-meta">
              Risk: {req.risk.toUpperCase()} · {req.reason}
            </div>
          </div>
          <div className="approval-actions">
            <button
              type="button"
              className="btn btn-sm good"
              onClick={() => void resolveApproval(req.reqId, true)}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn-sm danger"
              onClick={() => void resolveApproval(req.reqId, false)}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </section>
  );
});

ApprovalDock.displayName = "ApprovalDock";
