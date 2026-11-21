import React, { useRef } from "react";
import type { AgentRoleId, Ticket } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";
import { resolveModelForRole } from "../store/provider-catalog.ts";
import { ModalDialog } from "./ModalDialog.tsx";

export interface AgentInspectorModalProps {
  open: boolean;
  onClose: () => void;
}

const AgentInspectorModalContent: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const roles = useOfficeStore((s) => s.roles);
  const selectedRoleId = useOfficeStore((s) => s.selectedRoleId);
  const setSelectedRole = useOfficeStore((s) => s.setSelectedRole);
  const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
  const activeRuntime = useOfficeStore((s) => s.snapshot.activeRuntime);
  const activeModel = useOfficeStore((s) => s.snapshot.activeModel ?? null);
  const roleModelOverride = useOfficeStore(
    (s) => s.snapshot.roleModels?.[s.selectedRoleId] ?? null
  );
  const catalogDefault = useOfficeStore(
    (s) =>
      s.modelCatalogByProvider[s.snapshot.activeProvider]?.defaultModel ?? null
  );
  const selectedAgentLive = useOfficeStore(
    (s) => s.snapshot.agents[s.selectedRoleId]
  );
  const activeTicket = useOfficeStore((s) => {
    if (s.selectedTicketId) {
      const selected = s.snapshot.tickets[s.selectedTicketId];
      if (selected) return selected;
    }
    let latest: Ticket | null = null;
    for (const id in s.snapshot.tickets) {
      const ticket = s.snapshot.tickets[id]!;
      if (!latest || ticket.updatedAt > latest.updatedAt) latest = ticket;
    }
    return latest;
  });

  const tabRefs = useRef<Partial<Record<AgentRoleId, HTMLButtonElement | null>>>(
    {}
  );

  const selectedRole =
    roles.find((r) => r.id === selectedRoleId) ?? roles[0];

  if (!selectedRole || !selectedAgentLive) {
    return null;
  }

  const resolvedModel = resolveModelForRole({
    provider: activeProvider,
    roleId: selectedRole.id,
    activeModel,
    roleModels: roleModelOverride ? { [selectedRole.id]: roleModelOverride } : null,
    catalogDefault,
  });

  const handleTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (roles.length === 0) return;
    let nextIndex = index;
    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % roles.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + roles.length) % roles.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = roles.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextRole = roles[nextIndex];
    if (!nextRole) return;
    setSelectedRole(nextRole.id);
    tabRefs.current[nextRole.id]?.focus();
  };

  const diffText =
    activeTicket?.diffPreview ||
    (activeTicket
      ? "// Worktree diff will appear once the engineer modifies files."
      : "// No active ticket yet. Dispatch a task to inspect its git worktree diff.");

  const footer = (
    <>
      <div
        className="inspector-role-tabs"
        role="tablist"
        aria-label="Agent roles"
      >
        {roles.map((r, index) => {
          const isActive = r.id === selectedRole.id;
          return (
            <button
              key={r.id}
              ref={(el) => {
                tabRefs.current[r.id] = el;
              }}
              id={`role-tab-${r.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="inspector-role-panel"
              aria-label={`${r.id.toUpperCase()} · ${r.title}`}
              tabIndex={isActive ? 0 : -1}
              className={`btn btn-sm ${isActive ? "primary" : ""}`}
              onClick={() => setSelectedRole(r.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
            >
              {r.id.toUpperCase()}
            </button>
          );
        })}
      </div>
      <button type="button" className="btn" onClick={onClose}>
        Done
      </button>
    </>
  );

  return (
    <ModalDialog
      open
      titleId="inspector-modal-title"
      title={`${selectedRole.id.toUpperCase()} · ${selectedRole.title}`}
      closeLabel="Close Agent Inspector modal"
      onClose={onClose}
      footer={footer}
    >
      <div className="body">
        <div
          id="inspector-role-panel"
          className="inspector-tabpanel"
          role="tabpanel"
          aria-labelledby={`role-tab-${selectedRole.id}`}
        >
          <div className="inspector-summary-row">
            <div>
              <strong>Unified Provider:</strong>{" "}
              <span className="code-chip">{activeProvider}</span> (
              <span className="code-chip">{activeRuntime}</span>) ·{" "}
              <strong>Model:</strong>{" "}
              <span className="code-chip">{resolvedModel}</span>{" "}
              <span
                className={`pill ${roleModelOverride ? "handoff" : "idle"}`}
              >
                {roleModelOverride ? "Role Override" : "Provider Default"}
              </span>{" "}
              · <strong>Spawned Sub-Agent:</strong>{" "}
              <span className="code-chip">
                {selectedAgentLive.subAgentId ??
                  `sub-${activeProvider}-${selectedRole.id}`}
              </span>
            </div>
            <span className={`pill ${selectedAgentLive.status}`}>
              {selectedAgentLive.status}
            </span>
          </div>

          <div className="inspector-metrics">
            <strong>Activity:</strong> {selectedAgentLive.detail} ·{" "}
            <strong>Tokens:</strong> {selectedAgentLive.inTok} in /{" "}
            {selectedAgentLive.outTok} out ($
            {selectedAgentLive.costUsd.toFixed(4)})
          </div>

          <div className="inspector-tools">
            <strong>Curated Tools:</strong> {selectedRole.tools.join(", ")}
          </div>

          <div className="field-group">
            <h3 id="inspector-terminal-heading" className="field-heading">
              Laptop Terminal Stream
            </h3>
            <pre
              className="terminal-box"
              role="region"
              aria-labelledby="inspector-terminal-heading"
              tabIndex={0}
            >
              {selectedAgentLive.streamBuffer ||
                `$ agent-office --role ${selectedRole.id} --provider ${activeProvider} --model ${resolvedModel}\n// Ready at desk. Dispatch a ticket to stream live output.`}
            </pre>
          </div>

          <div className="field-group">
            <h3 id="inspector-diff-heading" className="field-heading">
              <span>
                Git Worktree Diff
                {activeTicket
                  ? ` · ${activeTicket.id} (${activeTicket.branch ?? "main"})`
                  : ""}
              </span>
              {!activeTicket?.diffPreview && (
                <span className="pill idle">No Diff</span>
              )}
            </h3>
            <pre
              className="terminal-box"
              role="region"
              aria-labelledby="inspector-diff-heading"
              tabIndex={0}
            >
              {diffText}
            </pre>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
};

export const AgentInspectorModal: React.FC<AgentInspectorModalProps> =
  React.memo(({ open, onClose }) => {
    if (!open) return null;
    return <AgentInspectorModalContent onClose={onClose} />;
  });

AgentInspectorModal.displayName = "AgentInspectorModal";
