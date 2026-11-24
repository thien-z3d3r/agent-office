import React from "react";
import type { AgentRoleId, Ticket } from "@agent-office/protocol";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useOfficeStore } from "../store/office-store.ts";
import {
  PROVIDER_META_BY_ID,
  resolveModelForRole,
} from "../store/provider-catalog.ts";
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

  const selectedRole =
    roles.find((r) => r.id === selectedRoleId) ?? roles[0];

  if (!selectedRole || !selectedAgentLive) {
    return null;
  }

  const resolvedModel = resolveModelForRole({
    provider: activeProvider,
    roleId: selectedRole.id,
    activeModel,
    roleModels: roleModelOverride
      ? { [selectedRole.id]: roleModelOverride }
      : null,
    catalogDefault,
  });

  const terminalText =
    selectedAgentLive.streamBuffer ||
    `$ agent-office --role ${selectedRole.id} --provider ${activeProvider} --model ${resolvedModel}\n// Ready at desk. Dispatch a ticket to stream live output.`;

  const hasDiff = Boolean(activeTicket?.diffPreview);
  const diffText =
    activeTicket?.diffPreview ||
    (activeTicket
      ? "// Worktree diff will appear once the engineer modifies files."
      : "// No active ticket yet. Dispatch a task to inspect its git worktree diff.");

  const statusBadgeVariant =
    selectedAgentLive.status === "waiting_approval" ||
    selectedAgentLive.status === "error"
      ? "error"
      : selectedAgentLive.status === "done"
        ? "success"
        : selectedAgentLive.status === "idle"
          ? "neutral"
          : "orange";

  const roleTabStrip = (
    <div style={{ padding: "var(--spacing-2) var(--spacing-4) 0" }}>
      <TabList
        role="tablist"
        size="sm"
        hasDivider
        value={selectedRole.id}
        onChange={(val) => setSelectedRole(val as AgentRoleId)}
      >
        {roles.map((r) => (
          <Tab
            key={r.id}
            value={r.id}
            panelId="inspector-role-panel"
            label={r.id.toUpperCase()}
          />
        ))}
      </TabList>
    </div>
  );

  const isLongDetail = selectedAgentLive.detail.length > 96;
  const conciseSubtitle = isLongDetail
    ? `${selectedAgentLive.detail.slice(0, 92).trimEnd()}...`
    : selectedAgentLive.detail;

  return (
    <ModalDialog
      open
      width={780}
      title={`${selectedRole.id.toUpperCase()} · ${selectedRole.title}`}
      subtitle={conciseSubtitle}
      startContent={
        <span
          className="hud-role-dot"
          style={{ background: selectedRole.tint, marginTop: 0 }}
          aria-hidden="true"
        />
      }
      endContent={
        <Badge
          variant={statusBadgeVariant}
          label={
            selectedAgentLive.status === "waiting_approval"
              ? "Needs approval"
              : selectedAgentLive.status
          }
        />
      }
      subheader={roleTabStrip}
      onClose={onClose}
      footer={<Button variant="secondary" label="Done" onClick={onClose} />}
    >
      <div id="inspector-role-panel" role="tabpanel">
        <VStack gap={4}>
          {(isLongDetail || selectedAgentLive.status === "error") && (
            <Banner
              status={selectedAgentLive.status === "error" ? "error" : "info"}
              title={
                selectedAgentLive.status === "error"
                  ? "Agent Error Details"
                  : "Latest Activity"
              }
              description={selectedAgentLive.detail}
            />
          )}

          <div className="inspector-meta-grid">
            <div className="inspector-meta-cell">
              <span className="inspector-meta-label">Provider</span>
              <span className="inspector-meta-value">
                {PROVIDER_META_BY_ID[activeProvider].shortLabel} ({activeRuntime})
              </span>
            </div>

            <div className="inspector-meta-cell">
              <span className="inspector-meta-label">
                Model {roleModelOverride ? "(Override)" : "(Default)"}
              </span>
              <span
                className="inspector-meta-value"
                style={{ fontFamily: "var(--font-family-code)" }}
                title={resolvedModel}
              >
                {resolvedModel}
              </span>
            </div>

            <div className="inspector-meta-cell">
              <span className="inspector-meta-label">Sub-Agent</span>
              <span
                className="inspector-meta-value"
                style={{ fontFamily: "var(--font-family-code)" }}
              >
                {selectedAgentLive.subAgentId ??
                  `sub-${activeProvider}-${selectedRole.id}`}
              </span>
            </div>

            <div className="inspector-meta-cell">
              <span className="inspector-meta-label">Tokens &amp; Cost</span>
              <span className="inspector-meta-value">
                {selectedAgentLive.inTok} in / {selectedAgentLive.outTok} out · $
                {selectedAgentLive.costUsd.toFixed(4)}
              </span>
            </div>
          </div>

          <VStack gap={1.5}>
            <Text type="label" weight="semibold">
              Curated Tools
            </Text>
            <div className="tool-chip-list">
              {selectedRole.tools.map((tool) => (
                <span key={tool} className="tool-chip">
                  {tool}
                </span>
              ))}
            </div>
          </VStack>

          <CodeBlock
            title="Laptop Terminal Stream"
            language="bash"
            size="sm"
            width="100%"
            maxHeight={210}
            hasCopyButton
            code={terminalText}
          />

          <VStack gap={1.5}>
            <HStack gap={2} vAlign="center" hAlign="between">
              <Text type="label" weight="semibold">
                Git Worktree Diff
                {activeTicket
                  ? ` · ${activeTicket.id} (${activeTicket.branch ?? "main"})`
                  : ""}
              </Text>
              {!hasDiff && <Badge variant="neutral" label="No diff" />}
            </HStack>

            <CodeBlock
              title={activeTicket?.branch ?? "worktree.diff"}
              language="ts"
              isDiff={hasDiff}
              size="sm"
              width="100%"
              maxHeight={220}
              hasCopyButton
              code={diffText}
            />
          </VStack>
        </VStack>
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
