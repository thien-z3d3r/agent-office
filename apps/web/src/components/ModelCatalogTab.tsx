import React, { useEffect, useMemo, useState } from "react";
import type { AgentRoleId, ProviderId } from "@agent-office/protocol";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Code } from "@astryxdesign/core/Code";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Selector } from "@astryxdesign/core/Selector";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { Cpu, RefreshCw, RotateCcw } from "lucide-react";
import { useOfficeStore } from "../store/office-store.ts";
import {
  countRoleModelOverrides,
  PROVIDER_CATALOG,
  PROVIDER_META_BY_ID,
  resolveModelForRole,
} from "../store/provider-catalog.ts";

function formatTokenHint(tokens?: number): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  return `${Math.round(tokens / 1000)}k`;
}

export interface ModelCatalogTabProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  clearFeedback: () => void;
}

export const ModelCatalogTab: React.FC<ModelCatalogTabProps> = ({
  onSuccess,
  onError,
  clearFeedback,
}) => {
  const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
  const activeModel = useOfficeStore((s) => s.snapshot.activeModel ?? null);
  const roleModels = useOfficeStore((s) => s.snapshot.roleModels);
  const roles = useOfficeStore((s) => s.roles);
  const catalog = useOfficeStore(
    (s) => s.modelCatalogByProvider[s.snapshot.activeProvider]
  );
  const modelCatalogLoading = useOfficeStore((s) => s.modelCatalogLoading);
  const modelCatalogError = useOfficeStore((s) => s.modelCatalogError);
  const fetchProviderModels = useOfficeStore((s) => s.fetchProviderModels);
  const setActiveProvider = useOfficeStore((s) => s.setActiveProvider);
  const updateProviderModels = useOfficeStore((s) => s.updateProviderModels);
  const clearError = useOfficeStore((s) => s.clearError);

  const [customDefaultDraft, setCustomDefaultDraft] = useState(
    activeModel ?? ""
  );
  const [customRoleInputOpen, setCustomRoleInputOpen] = useState<
    Partial<Record<AgentRoleId, boolean>>
  >({});
  const [customRoleDrafts, setCustomRoleDrafts] = useState<
    Partial<Record<AgentRoleId, string>>
  >({});
  const [savingModels, setSavingModels] = useState(false);

  const activeMeta = PROVIDER_META_BY_ID[activeProvider];
  const catalogDefaultModel = catalog?.defaultModel ?? activeMeta.defaultModel;
  const effectiveDefaultModel = activeModel ?? catalogDefaultModel;
  const catalogModels = catalog?.models ?? [];

  useEffect(() => {
    setCustomDefaultDraft(activeModel ?? "");
  }, [activeProvider, activeModel]);

  useEffect(() => {
    setCustomRoleInputOpen({});
    setCustomRoleDrafts({});
    if (!useOfficeStore.getState().modelCatalogByProvider[activeProvider]) {
      void fetchProviderModels(activeProvider);
    }
  }, [activeProvider, fetchProviderModels]);

  const roleOverrideCount = countRoleModelOverrides(roleModels);

  const providerOptions = useMemo(
    () =>
      PROVIDER_CATALOG.map((opt) => ({
        value: opt.id,
        label: opt.label,
      })),
    []
  );

  const handleProviderChange = async (nextProvider: ProviderId) => {
    setSavingModels(true);
    clearFeedback();
    clearError();
    await setActiveProvider(nextProvider, undefined, null);
    setSavingModels(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      onError(apiError);
      return;
    }
    onSuccess(
      `Active provider switched to ${PROVIDER_META_BY_ID[nextProvider].shortLabel} (role overrides reset).`
    );
  };

  const handleSelectDefaultModel = async (modelId: string) => {
    setSavingModels(true);
    clearFeedback();
    clearError();
    await updateProviderModels({ model: modelId });
    setSavingModels(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      onError(apiError);
      return;
    }
    onSuccess(`Provider default model set to ${modelId}.`);
  };

  const handleCustomDefaultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customDefaultDraft.trim();
    if (!trimmed) {
      onError("Enter a custom model ID or use Reset to Catalog Default.");
      return;
    }
    await handleSelectDefaultModel(trimmed);
  };

  const handleResetDefaultModel = async () => {
    setSavingModels(true);
    clearFeedback();
    clearError();
    await updateProviderModels({ model: null });
    setSavingModels(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      onError(apiError);
      return;
    }
    setCustomDefaultDraft("");
    onSuccess(`Reset provider default model to ${catalogDefaultModel}.`);
  };

  const handleRoleOverrideChange = async (
    roleId: AgentRoleId,
    nextValue: string | null
  ) => {
    setSavingModels(true);
    clearFeedback();
    clearError();
    await updateProviderModels({
      roleModels: { [roleId]: nextValue },
    });
    setSavingModels(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      onError(apiError);
      return;
    }
    setCustomRoleInputOpen((prev) => ({ ...prev, [roleId]: false }));
    onSuccess(
      nextValue
        ? `${roleId.toUpperCase()} model override set to ${nextValue}.`
        : `${roleId.toUpperCase()} reset to provider default (${effectiveDefaultModel}).`
    );
  };

  const handleResetAllRoles = async () => {
    setSavingModels(true);
    clearFeedback();
    clearError();
    await updateProviderModels({ resetRoles: true });
    setSavingModels(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      onError(apiError);
      return;
    }
    setCustomRoleInputOpen({});
    setCustomRoleDrafts({});
    onSuccess(
      `All 8 worker roles reset to provider default (${effectiveDefaultModel}).`
    );
  };

  return (
    <div id="providers-tabpanel-models" role="tabpanel">
      <VStack gap={4}>
        <HStack gap={3} vAlign="end" wrap="wrap">
          <StackItem size="fill">
            <Selector
              label="Active Provider"
              width="100%"
              value={activeProvider}
              isDisabled={savingModels}
              options={providerOptions}
              onChange={(val) => void handleProviderChange(val as ProviderId)}
            />
          </StackItem>

          <HStack gap={2} vAlign="center">
            <Badge
              variant={catalog?.source === "live" ? "success" : "neutral"}
              label={
                catalog?.source === "live" ? "Live Discovery" : "Curated"
              }
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<Icon icon={RefreshCw} />}
              isLoading={modelCatalogLoading}
              isDisabled={savingModels}
              label={modelCatalogLoading ? "Refreshing..." : "Refresh Models"}
              onClick={() => void fetchProviderModels(activeProvider, true)}
            />
          </HStack>
        </HStack>

        {modelCatalogError && (
          <Banner
            status="error"
            title="Model discovery error"
            description={modelCatalogError}
          />
        )}

        {modelCatalogLoading && catalogModels.length === 0 ? (
          <Banner
            status="info"
            title={`Discovering models for ${activeMeta.shortLabel}...`}
          />
        ) : !modelCatalogLoading && catalogModels.length === 0 ? (
          <EmptyState
            isCompact
            icon={<Icon icon={Cpu} size="lg" />}
            title={`No catalog models for ${activeMeta.shortLabel}`}
            description="Enter a custom model ID below or refresh live discovery."
          />
        ) : (
          <VStack gap={2}>
            <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
              <Heading level={3}>
                Available Models ({catalogModels.length})
              </Heading>
              <HStack gap={1.5} vAlign="center">
                <Text type="supporting">Active default:</Text>
                <Code>{effectiveDefaultModel}</Code>
              </HStack>
            </HStack>

            <VStack gap={1.5}>
              {catalogModels.map((entry) => {
                const isActiveDefault = entry.id === effectiveDefaultModel;
                const ctxHint = formatTokenHint(entry.contextWindow);
                const outHint = formatTokenHint(entry.maxOutputTokens);
                const hintParts = [entry.capabilitySummary];
                if (ctxHint) {
                  hintParts.push(
                    outHint
                      ? `${ctxHint} ctx / ${outHint} out`
                      : `${ctxHint} ctx`
                  );
                }
                hintParts.push(entry.tier);

                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="model-option-btn"
                    aria-pressed={isActiveDefault}
                    disabled={savingModels}
                    onClick={() => void handleSelectDefaultModel(entry.id)}
                  >
                    <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <Text weight="semibold">{entry.label}</Text>
                        <Code color="secondary">{entry.id}</Code>
                      </HStack>

                      <HStack gap={1.5} vAlign="center">
                        {isActiveDefault && (
                          <Badge variant="success" label="Active" />
                        )}
                        {entry.isDefault && !isActiveDefault && (
                          <Text type="supporting">Recommended</Text>
                        )}
                      </HStack>
                    </HStack>

                    <Text type="supporting">{hintParts.join(" · ")}</Text>
                  </button>
                );
              })}
            </VStack>
          </VStack>
        )}

        <form onSubmit={(e) => void handleCustomDefaultSubmit(e)}>
          <HStack gap={2} vAlign="end" wrap="wrap">
            <StackItem size="fill">
              <TextInput
                label="Custom Provider Default Model ID"
                width="100%"
                value={customDefaultDraft}
                isDisabled={savingModels}
                onChange={setCustomDefaultDraft}
                placeholder={`Default: ${catalogDefaultModel}`}
              />
            </StackItem>
            <Button
              type="submit"
              variant="primary"
              isDisabled={savingModels}
              label="Set Default"
            />
            {activeModel !== null && (
              <Button
                variant="secondary"
                isDisabled={savingModels}
                label="Reset"
                onClick={() => void handleResetDefaultModel()}
              />
            )}
          </HStack>
        </form>

        <Divider />

        <VStack gap={3}>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <Heading level={3}>
              Per-Role Overrides ({roleOverrideCount}/8)
            </Heading>
            <Button
              size="sm"
              variant="ghost"
              icon={<Icon icon={RotateCcw} />}
              isDisabled={roleOverrideCount === 0 || savingModels}
              label="Reset all roles"
              onClick={() => void handleResetAllRoles()}
            />
          </HStack>

          <div className="modal-grid-2">
            {roles.map((role) => {
              const override = roleModels[role.id] ?? null;
              const resolvedForRole = resolveModelForRole({
                provider: activeProvider,
                roleId: role.id,
                activeModel,
                roleModels,
                catalogDefault: catalogDefaultModel,
              });
              const isCustomOpen = Boolean(customRoleInputOpen[role.id]);
              const inCatalog = Boolean(
                override && catalogModels.some((m) => m.id === override)
              );
              const selectValue = isCustomOpen
                ? "__custom__"
                : (override ?? "__default__");

              const roleOptions = [
                {
                  value: "__default__",
                  label: `Provider default (${effectiveDefaultModel})`,
                },
                ...catalogModels.map((m) => ({
                  value: m.id,
                  label: m.label,
                  description: m.id,
                })),
                ...(override && !inCatalog
                  ? [{ value: override, label: `Custom: ${override}` }]
                  : []),
                { value: "__custom__", label: "Custom model ID..." },
              ];

              return (
                <div key={role.id} className="role-override-card">
                  <HStack gap={2} vAlign="center" hAlign="between">
                    <HStack gap={1.5} vAlign="center">
                      <span
                        className="hud-role-dot"
                        style={{ background: role.tint, marginTop: 0 }}
                        aria-hidden="true"
                      />
                      <Text type="label" weight="semibold">
                        {role.id.toUpperCase()} · {role.title}
                      </Text>
                    </HStack>
                    {override && <Badge variant="orange" label="Override" />}
                  </HStack>

                  <Selector
                    label={`Model for ${role.id.toUpperCase()}`}
                    isLabelHidden
                    size="sm"
                    width="100%"
                    value={selectValue}
                    isDisabled={savingModels}
                    options={roleOptions}
                    onChange={(val) => {
                      if (val === "__custom__") {
                        setCustomRoleDrafts((prev) => ({
                          ...prev,
                          [role.id]: override ?? "",
                        }));
                        setCustomRoleInputOpen((prev) => ({
                          ...prev,
                          [role.id]: true,
                        }));
                        return;
                      }
                      setCustomRoleInputOpen((prev) => ({
                        ...prev,
                        [role.id]: false,
                      }));
                      void handleRoleOverrideChange(
                        role.id,
                        val === "__default__" ? null : val
                      );
                    }}
                  />

                  {isCustomOpen && (
                    <HStack gap={1.5} vAlign="end">
                      <StackItem size="fill">
                        <TextInput
                          size="sm"
                          width="100%"
                          label={`Custom model ID for ${role.id.toUpperCase()}`}
                          isLabelHidden
                          value={customRoleDrafts[role.id] ?? ""}
                          isDisabled={savingModels}
                          onChange={(val) =>
                            setCustomRoleDrafts((prev) => ({
                              ...prev,
                              [role.id]: val,
                            }))
                          }
                          placeholder="Enter model ID..."
                        />
                      </StackItem>
                      <Button
                        size="sm"
                        variant="primary"
                        isDisabled={savingModels}
                        label="Apply"
                        onClick={() => {
                          const trimmed = (
                            customRoleDrafts[role.id] ?? ""
                          ).trim();
                          if (!trimmed) {
                            onError(
                              `Enter a custom model ID for ${role.id.toUpperCase()}.`
                            );
                            return;
                          }
                          void handleRoleOverrideChange(role.id, trimmed);
                        }}
                      />
                    </HStack>
                  )}

                  <Text type="supporting" maxLines={1}>
                    Resolved: <Code color="secondary">{resolvedForRole}</Code>
                  </Text>
                </div>
              );
            })}
          </div>
        </VStack>
      </VStack>
    </div>
  );
};
