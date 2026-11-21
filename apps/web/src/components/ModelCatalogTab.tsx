import React, { useEffect, useState } from "react";
import type { AgentRoleId, ProviderId } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";
import {
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

  let roleOverrideCount = 0;
  for (const r of roles) {
    if (roleModels[r.id]) roleOverrideCount += 1;
  }

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
    <div
      id="providers-tabpanel-models"
      role="tabpanel"
      aria-labelledby="providers-tab-models"
      className="modal-tabpanel"
    >
      <div className="catalog-toolbar">
        <div className="field-group catalog-provider-field">
          <label htmlFor="catalog-active-provider">Active Provider</label>
          <select
            id="catalog-active-provider"
            className="input-control"
            value={activeProvider}
            disabled={savingModels}
            onChange={(e) =>
              void handleProviderChange(e.target.value as ProviderId)
            }
          >
            {PROVIDER_CATALOG.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="catalog-source-row">
          <span
            className={`pill ${catalog?.source === "live" ? "done" : "idle"}`}
          >
            {catalog?.source === "live" ? "Live Discovery" : "Curated Catalog"}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={modelCatalogLoading || savingModels}
            onClick={() => void fetchProviderModels(activeProvider, true)}
          >
            {modelCatalogLoading ? "Refreshing..." : "Refresh Models"}
          </button>
        </div>
      </div>

      {modelCatalogLoading && (
        <div className="inline-status" role="status">
          <span className="pill idle">Loading</span>
          <span>Discovering models for {activeMeta.shortLabel}...</span>
        </div>
      )}

      {modelCatalogError && (
        <div className="inline-alert" role="alert">
          <span className="pill error">Error</span>
          <span>{modelCatalogError}</span>
        </div>
      )}

      {!modelCatalogLoading && catalogModels.length === 0 ? (
        <div className="empty-state" role="status">
          <span className="pill idle">Empty</span>
          <p>
            No catalog models returned for {activeMeta.shortLabel}. Enter a
            custom model ID below or refresh discovery.
          </p>
        </div>
      ) : (
        <div className="field-group">
          <div className="secret-label-row">
            <span className="field-heading">
              Available Models for {activeMeta.shortLabel}
            </span>
            <span className="field-hint">
              Active default:{" "}
              <span className="code-chip">{effectiveDefaultModel}</span>
            </span>
          </div>
          <ul
            className="model-catalog-list"
            aria-label={`${activeMeta.shortLabel} models`}
          >
            {catalogModels.map((entry) => {
              const isActiveDefault = entry.id === effectiveDefaultModel;
              const ctxHint = formatTokenHint(entry.contextWindow);
              const outHint = formatTokenHint(entry.maxOutputTokens);
              const hintParts = [entry.capabilitySummary];
              if (ctxHint) {
                hintParts.push(
                  outHint ? `${ctxHint} ctx / ${outHint} out` : `${ctxHint} ctx`
                );
              }
              hintParts.push(entry.source === "live" ? "Live" : "Curated");

              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`model-option-row ${
                      isActiveDefault ? "selected" : ""
                    }`}
                    aria-pressed={isActiveDefault}
                    disabled={savingModels}
                    onClick={() => void handleSelectDefaultModel(entry.id)}
                  >
                    <span className="model-option-header">
                      <strong>{entry.label}</strong>
                      <span className="code-chip">{entry.id}</span>
                      {isActiveDefault && (
                        <span className="pill done">Active Default</span>
                      )}
                      {entry.isDefault && (
                        <span className="pill idle">Recommended</span>
                      )}
                      <span className="pill handoff">{entry.tier}</span>
                    </span>
                    <span className="model-option-meta">
                      {hintParts.join(" · ")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <form
        className="field-group"
        onSubmit={(e) => void handleCustomDefaultSubmit(e)}
      >
        <label htmlFor="catalog-custom-model">
          Custom Provider Default Model ID
        </label>
        <div className="model-override-row">
          <input
            id="catalog-custom-model"
            type="text"
            className="input-control"
            value={customDefaultDraft}
            disabled={savingModels}
            onChange={(e) => setCustomDefaultDraft(e.target.value)}
            placeholder={`Default: ${catalogDefaultModel}`}
          />
          <button
            type="submit"
            className="btn primary"
            disabled={savingModels}
          >
            Set Provider Default
          </button>
          {activeModel !== null && (
            <button
              type="button"
              className="btn"
              disabled={savingModels}
              onClick={() => void handleResetDefaultModel()}
            >
              Reset to Catalog Default
            </button>
          )}
        </div>
      </form>

      <section
        className="field-group"
        aria-labelledby="role-overrides-heading"
      >
        <div className="role-overrides-header">
          <h3 id="role-overrides-heading" className="field-heading">
            Per-Role Model Overrides ({roleOverrideCount}/8)
          </h3>
          <button
            type="button"
            className="btn btn-sm"
            disabled={roleOverrideCount === 0 || savingModels}
            onClick={() => void handleResetAllRoles()}
          >
            Reset all roles to provider default
          </button>
        </div>

        <div className="role-overrides-list">
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
              : (override ?? "");

            return (
              <div key={role.id} className="role-override-row">
                <div className="role-override-header">
                  <label htmlFor={`role-model-select-${role.id}`}>
                    <span
                      className="dot"
                      style={{ background: role.tint }}
                      aria-hidden="true"
                    />
                    <span>
                      {role.id.toUpperCase()} - {role.title}
                    </span>
                  </label>
                  {override ? (
                    <span className="pill handoff">Override</span>
                  ) : (
                    <span className="field-hint">Provider default</span>
                  )}
                </div>

                <select
                  id={`role-model-select-${role.id}`}
                  className="input-control"
                  value={selectValue}
                  disabled={savingModels}
                  onChange={(e) => {
                    const val = e.target.value;
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
                      val === "" ? null : val
                    );
                  }}
                >
                  <option value="">
                    Use provider default ({effectiveDefaultModel})
                  </option>
                  {catalogModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.id})
                    </option>
                  ))}
                  {override && !inCatalog && (
                    <option value={override}>Custom: {override}</option>
                  )}
                  <option value="__custom__">Custom model ID...</option>
                </select>

                {isCustomOpen && (
                  <div className="role-custom-row">
                    <label
                      htmlFor={`role-custom-input-${role.id}`}
                      className="sr-only"
                    >
                      Custom model ID for {role.id.toUpperCase()}
                    </label>
                    <input
                      id={`role-custom-input-${role.id}`}
                      type="text"
                      className="input-control"
                      value={customRoleDrafts[role.id] ?? ""}
                      disabled={savingModels}
                      onChange={(e) =>
                        setCustomRoleDrafts((prev) => ({
                          ...prev,
                          [role.id]: e.target.value,
                        }))
                      }
                      placeholder="Enter custom model ID..."
                    />
                    <button
                      type="button"
                      className="btn btn-sm primary"
                      disabled={savingModels}
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
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={savingModels}
                      onClick={() =>
                        setCustomRoleInputOpen((prev) => ({
                          ...prev,
                          [role.id]: false,
                        }))
                      }
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="field-hint">
                  Resolved: <span className="code-chip">{resolvedForRole}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
