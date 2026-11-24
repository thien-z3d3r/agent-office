import React, { useEffect, useMemo, useState } from "react";
import type { AgentRoleId, TicketSize } from "@agent-office/protocol";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { Send } from "lucide-react";
import { useOfficeStore } from "../store/office-store.ts";
import { PROVIDER_META_BY_ID } from "../store/provider-catalog.ts";
import { ModalDialog } from "./ModalDialog.tsx";

export interface DispatchTicketModalProps {
  open: boolean;
  onClose: () => void;
}

const DispatchTicketModalContent: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
  const activeRuntime = useOfficeStore((s) => s.snapshot.activeRuntime);
  const activeModel = useOfficeStore((s) => s.snapshot.activeModel);
  const catalogDefault = useOfficeStore(
    (s) =>
      s.modelCatalogByProvider[s.snapshot.activeProvider]?.defaultModel ?? null
  );
  const roleOverrideCount = useOfficeStore((s) => {
    let count = 0;
    const rm = s.snapshot.roleModels;
    if (rm) {
      for (const k in rm) {
        if (rm[k as AgentRoleId]) count += 1;
      }
    }
    return count;
  });
  const submitTicket = useOfficeStore((s) => s.submitTicket);
  const clearError = useOfficeStore((s) => s.clearError);
  const effectiveDefaultModel =
    activeModel ??
    catalogDefault ??
    PROVIDER_META_BY_ID[activeProvider].defaultModel;

  const [title, setTitle] = useState("Add multiply(a, b) to src/math.ts");
  const [description, setDescription] = useState(
    "Implement multiply(a, b) with strict TypeScript types and unit verification."
  );
  const [size, setSize] = useState<TicketSize>("S");
  const [authorRole, setAuthorRole] = useState<"fe" | "be">("be");
  const [mode, setMode] = useState<"scripted" | "live">("scripted");
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);

  useEffect(() => {
    setSubmitFeedback(null);
    setSubmitting(false);
  }, []);

  const sizeOptions = useMemo(
    () => [
      {
        value: "S",
        label: "Size S · Fast Fix",
        description: "EM triage -> Engineer -> Reviewer -> Merge",
      },
      {
        value: "M",
        label: "Size M · Feature + QA",
        description: "Adds dedicated QA Engineer test verification",
      },
      {
        value: "L",
        label: "Size L · Full 8-Role Flow",
        description: "PM spec + TL ADR + Dev + Review + QA + DevOps",
      },
    ],
    []
  );

  const authorOptions = useMemo(
    () => [
      {
        value: "be",
        label: "Backend Engineer (BE)",
        description: `Runs on ${PROVIDER_META_BY_ID[activeProvider].shortLabel}`,
      },
      {
        value: "fe",
        label: "Frontend Engineer (FE)",
        description: `Runs on ${PROVIDER_META_BY_ID[activeProvider].shortLabel}`,
      },
    ],
    [activeProvider]
  );

  const modeOptions = useMemo(
    () => [
      {
        value: "scripted",
        label: "Scripted Simulation ($0 cost)",
        description: "Deterministic local git worktree workflow preview",
      },
      {
        value: "live",
        label: `Live Provider (${PROVIDER_META_BY_ID[activeProvider].shortLabel})`,
        description: `${activeRuntime} · ${effectiveDefaultModel}${
          roleOverrideCount > 0 ? ` (+${roleOverrideCount} overrides)` : ""
        }`,
      },
    ],
    [activeProvider, activeRuntime, effectiveDefaultModel, roleOverrideCount]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSubmitFeedback("Ticket title is required before dispatching.");
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
      open
      width={600}
      purpose="form"
      title="Dispatch Task to Dev Office"
      subtitle={`Assigns a new ticket to ${PROVIDER_META_BY_ID[activeProvider].shortLabel} sub-agents`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" label="Cancel" onClick={onClose} />
          <Button
            variant="primary"
            type="submit"
            form="dispatch-ticket-form"
            icon={<Icon icon={Send} />}
            isLoading={submitting}
            label={submitting ? "Dispatching..." : "Dispatch Task"}
          />
        </>
      }
    >
      <form id="dispatch-ticket-form" onSubmit={(e) => void handleSubmit(e)}>
        <VStack gap={4}>
          {submitFeedback && !titleMissing && (
            <Banner status="error" title="Dispatch failed" description={submitFeedback} />
          )}

          <TextInput
            label="Ticket Title"
            isRequired
            hasAutoFocus
            width="100%"
            value={title}
            status={
              titleMissing
                ? { type: "error", message: submitFeedback ?? "Required" }
                : undefined
            }
            onChange={(val) => {
              setTitle(val);
              if (submitFeedback) setSubmitFeedback(null);
            }}
            placeholder="e.g. Add subtract(a, b) helper to src/math.ts"
          />

          <TextArea
            label="Task Specification & Acceptance Criteria"
            width="100%"
            value={description}
            onChange={setDescription}
            placeholder="Describe what the engineer, reviewer, and QA should verify..."
          />

          <div className="modal-grid-2">
            <Selector
              label="Workflow Size"
              width="100%"
              value={size}
              options={sizeOptions}
              onChange={(val) => setSize(val as TicketSize)}
            />

            <Selector
              label="Primary Engineer Seat"
              width="100%"
              value={authorRole}
              options={authorOptions}
              onChange={(val) => setAuthorRole(val as "fe" | "be")}
            />
          </div>

          <Selector
            label="Execution Runtime"
            width="100%"
            value={mode}
            options={modeOptions}
            onChange={(val) => setMode(val as "scripted" | "live")}
          />
        </VStack>
      </form>
    </ModalDialog>
  );
};

export const DispatchTicketModal: React.FC<DispatchTicketModalProps> =
  React.memo(({ open, onClose }) => {
    if (!open) return null;
    return <DispatchTicketModalContent onClose={onClose} />;
  });

DispatchTicketModal.displayName = "DispatchTicketModal";
