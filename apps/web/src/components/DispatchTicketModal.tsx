import React, { useEffect, useRef, useState } from "react";
import type { TicketSize } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";
import { ModalDialog } from "./ModalDialog.tsx";

export interface DispatchTicketModalProps {
  open: boolean;
  onClose: () => void;
}

export const DispatchTicketModal: React.FC<DispatchTicketModalProps> = ({
  open,
  onClose,
}) => {
  const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
  const submitTicket = useOfficeStore((s) => s.submitTicket);
  const clearError = useOfficeStore((s) => s.clearError);

  const [title, setTitle] = useState("Add multiply(a, b) to src/math.ts");
  const [description, setDescription] = useState(
    "Implement multiply(a, b) with strict TypeScript types and unit verification."
  );
  const [size, setSize] = useState<TicketSize>("S");
  const [authorRole, setAuthorRole] = useState<"fe" | "be">("be");
  const [mode, setMode] = useState<"scripted" | "live">("scripted");
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSubmitFeedback(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSubmitFeedback("Ticket title is required before dispatching.");
      titleInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setSubmitFeedback(null);
    clearError();
    await submitTicket({
      title: trimmedTitle,
      description: description.trim(),
      size,
      authorRole,
      mode,
    });
    setSubmitting(false);

    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      setSubmitFeedback(apiError);
      return;
    }
    onClose();
  };

  const titleMissing = Boolean(submitFeedback && !title.trim());

  return (
    <ModalDialog
      open={open}
      titleId="dispatch-modal-title"
      title="Dispatch Task to Dev Office"
      closeLabel="Close Dispatch Task modal"
      onClose={onClose}
      initialFocusRef={titleInputRef}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="body">
          {submitFeedback && (
            <div id="dispatch-error" className="inline-alert" role="alert">
              <span className="pill error">Error</span>
              <span>{submitFeedback}</span>
            </div>
          )}

          <div className="field-group">
            <label htmlFor="ticket-title-input">Ticket Title</label>
            <input
              ref={titleInputRef}
              id="ticket-title-input"
              type="text"
              className="input-control"
              value={title}
              aria-invalid={titleMissing ? "true" : undefined}
              aria-describedby={submitFeedback ? "dispatch-error" : undefined}
              onChange={(e) => {
                setTitle(e.target.value);
                if (submitFeedback) setSubmitFeedback(null);
              }}
              placeholder="e.g. Add subtract(a, b) helper to src/math.ts"
            />
          </div>

          <div className="field-group">
            <label htmlFor="ticket-desc-input">
              Task Specification & Acceptance Criteria
            </label>
            <textarea
              id="ticket-desc-input"
              rows={3}
              className="input-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what the engineer, reviewer, and QA should verify..."
            />
          </div>

          <div className="field-grid-2">
            <div className="field-group">
              <label htmlFor="ticket-size-select">Workflow Size</label>
              <select
                id="ticket-size-select"
                className="input-control"
                value={size}
                onChange={(e) => setSize(e.target.value as TicketSize)}
              >
                <option value="S">
                  Size S (EM -&gt; Dev -&gt; Review -&gt; Merge)
                </option>
                <option value="M">Size M (+ QA Engineer Tests)</option>
                <option value="L">
                  Size L (Full 8-Role: PM Spec + TL ADR + Dev + Review + QA)
                </option>
              </select>
            </div>

            <div className="field-group">
              <label htmlFor="ticket-author-select">
                Primary Engineer Seat
              </label>
              <select
                id="ticket-author-select"
                className="input-control"
                value={authorRole}
                onChange={(e) =>
                  setAuthorRole(e.target.value as "fe" | "be")
                }
              >
                <option value="be">
                  Backend Engineer Sub-Agent ({activeProvider.toUpperCase()})
                </option>
                <option value="fe">
                  Frontend Engineer Sub-Agent ({activeProvider.toUpperCase()})
                </option>
              </select>
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="ticket-mode-select">Execution Runtime</label>
            <select
              id="ticket-mode-select"
              className="input-control"
              value={mode}
              onChange={(e) =>
                setMode(e.target.value as "scripted" | "live")
              }
            >
              <option value="scripted">
                Scripted Simulation ($0 token cost, deterministic git worktree
                test)
              </option>
              <option value="live">
                Live AI Providers (jcode OAuth + Configured API Keys)
              </option>
            </select>
          </div>
        </div>
        <footer>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={submitting}
          >
            {submitting ? "Dispatching..." : "Dispatch to Engineering Manager"}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
};
