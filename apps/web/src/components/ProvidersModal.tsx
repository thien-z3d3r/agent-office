import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderId, RuntimeKind } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";
import {
  PROVIDER_CATALOG,
  PROVIDER_META_BY_ID,
  RUNTIME_LABELS,
  type SettingsTab,
} from "../store/provider-catalog.ts";
import { ModalDialog } from "./ModalDialog.tsx";
import { ModelCatalogTab } from "./ModelCatalogTab.tsx";

const JCODE_PROVIDERS = PROVIDER_CATALOG.map((p) => p.jcodeAuthKey);

const API_KEY_PROVIDERS = PROVIDER_CATALOG.filter(
  (p) => p.authMode === "api-key" && p.secretKey
);

const TAB_ORDER: readonly SettingsTab[] = ["credentials", "models"];

export interface ProvidersModalProps {
  open: boolean;
  onClose: () => void;
}

const ProvidersModalContent: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
  const activeRuntime = useOfficeStore((s) => s.snapshot.activeRuntime);
  const activeModel = useOfficeStore((s) => s.snapshot.activeModel ?? null);
  const catalogDefault = useOfficeStore(
    (s) =>
      s.modelCatalogByProvider[s.snapshot.activeProvider]?.defaultModel ?? null
  );
  const roleOverrideCount = useOfficeStore((s) => {
    let count = 0;
    const rm = s.snapshot.roleModels;
    if (rm) {
      for (const k in rm) {
        if (rm[k as keyof typeof rm]) count += 1;
      }
    }
    return count;
  });
  const settingsTab = useOfficeStore((s) => s.settingsTab);
  const setSettingsTab = useOfficeStore((s) => s.setSettingsTab);
  const configuredKeys = useOfficeStore((s) => s.configuredKeys);
  const jcodeAuth = useOfficeStore((s) => s.jcodeAuth);
  const setActiveProvider = useOfficeStore((s) => s.setActiveProvider);
  const fetchSettings = useOfficeStore((s) => s.fetchSettings);
  const saveSecretKey = useOfficeStore((s) => s.saveSecretKey);
  const clearError = useOfficeStore((s) => s.clearError);

  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [switchingProvider, setSwitchingProvider] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>(
    {}
  );

  const clearFeedback = useCallback(() => {
    setFeedbackError(null);
    setErrorKey(null);
    setFeedbackSuccess(null);
  }, []);

  const handleSuccessFeedback = useCallback((msg: string) => {
    setFeedbackError(null);
    setErrorKey(null);
    setFeedbackSuccess(msg);
  }, []);

  const handleErrorFeedback = useCallback((msg: string) => {
    setFeedbackSuccess(null);
    setFeedbackError(msg);
  }, []);

  useEffect(() => {
    clearFeedback();
    setSavingKey(null);
    setSwitchingProvider(false);
    clearError();

    let cancelled = false;
    setLoadingSettings(true);
    void (async () => {
      try {
        await fetchSettings();
        if (!cancelled) {
          const apiError = useOfficeStore.getState().lastError;
          if (apiError) {
            setFeedbackError(apiError);
          }
        }
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSettings, clearError, clearFeedback]);

  const activeMeta = PROVIDER_META_BY_ID[activeProvider];
  const effectiveDefaultModel =
    activeModel ?? catalogDefault ?? activeMeta.defaultModel;
  const activeJcodeInfo = jcodeAuth[activeMeta.jcodeAuthKey];
  const isActiveKeySet = activeMeta.secretKey
    ? Boolean(configuredKeys[activeMeta.secretKey])
    : false;
  const isReady =
    activeMeta.authMode === "jcode-oauth"
      ? activeJcodeInfo?.status === "available"
      : activeRuntime === "jcode"
        ? isActiveKeySet || activeJcodeInfo?.status === "available"
        : isActiveKeySet;

  const readyLabel =
    activeMeta.authMode === "jcode-oauth"
      ? isReady
        ? "Ready via jcode OAuth"
        : "Setup Required"
      : isActiveKeySet
        ? "Ready (Encrypted API Key)"
        : activeRuntime === "jcode" && activeJcodeInfo?.status === "available"
          ? "Ready via jcode CLI"
          : "Setup Required";

  const runtimeOptions: RuntimeKind[] = activeMeta.compatibleRuntimes.includes(
    activeRuntime
  )
    ? [...activeMeta.compatibleRuntimes]
    : [...activeMeta.compatibleRuntimes, activeRuntime];

  const handleTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let nextIndex = index;
    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % TAB_ORDER.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = TAB_ORDER.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextTab = TAB_ORDER[nextIndex];
    if (!nextTab) return;
    setSettingsTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const handleRefreshSettings = async () => {
    setRefreshing(true);
    clearFeedback();
    clearError();
    await fetchSettings();
    setRefreshing(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      setFeedbackError(apiError);
    } else {
      setFeedbackSuccess("Provider status refreshed.");
    }
  };

  const handleProviderChange = async (nextProvider: ProviderId) => {
    setSwitchingProvider(true);
    clearFeedback();
    clearError();
    await setActiveProvider(nextProvider, undefined, null);
    setSwitchingProvider(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      setFeedbackError(apiError);
      return;
    }
    setFeedbackSuccess(
      `Active provider switched to ${PROVIDER_META_BY_ID[nextProvider].shortLabel}.`
    );
  };

  const handleRuntimeChange = async (nextRuntime: RuntimeKind) => {
    setSwitchingProvider(true);
    clearFeedback();
    clearError();
    await setActiveProvider(activeProvider, nextRuntime, activeModel ?? null);
    setSwitchingProvider(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      setFeedbackError(apiError);
      return;
    }
    setFeedbackSuccess(`Execution runtime set to ${RUNTIME_LABELS[nextRuntime]}.`);
  };

  const handleSaveSecret = async (keyName: string) => {
    const val = (keyDrafts[keyName] ?? "").trim();
    if (!val) {
      setFeedbackSuccess(null);
      setErrorKey(keyName);
      setFeedbackError(`Enter an API key for ${keyName} before saving.`);
      inputRefs.current[keyName]?.focus();
      return;
    }

    setSavingKey(keyName);
    clearFeedback();
    clearError();
    await saveSecretKey(keyName, val);
    setSavingKey(null);

    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      setErrorKey(keyName);
      setFeedbackError(apiError);
      return;
    }

    setKeyDrafts((prev) => ({
      ...prev,
      [keyName]: "",
    }));
    setFeedbackSuccess(`Saved ${keyName} (encrypted in SQLite).`);
  };

  const otherJcodeProviders = JCODE_PROVIDERS.filter(
    (p) => p !== activeMeta.jcodeAuthKey
  );
  const otherApiKeyProviders = API_KEY_PROVIDERS.filter(
    (item) => item.secretKey !== activeMeta.secretKey
  );

  return (
    <ModalDialog
      open
      titleId="settings-modal-title"
      title="Providers, Models & Credentials"
      closeLabel="Close Providers & Models Settings modal"
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      }
    >
      <div
        className="modal-tabs"
        role="tablist"
        aria-label="Provider and model settings"
      >
        <button
          ref={(el) => {
            tabRefs.current.credentials = el;
          }}
          id="providers-tab-credentials"
          type="button"
          role="tab"
          aria-selected={settingsTab === "credentials"}
          aria-controls="providers-tabpanel-credentials"
          tabIndex={settingsTab === "credentials" ? 0 : -1}
          className={`btn btn-sm ${
            settingsTab === "credentials" ? "primary" : ""
          }`}
          onClick={() => {
            clearFeedback();
            setSettingsTab("credentials");
          }}
          onKeyDown={(e) => handleTabKeyDown(e, 0)}
        >
          Credentials &amp; Runtime
        </button>
        <button
          ref={(el) => {
            tabRefs.current.models = el;
          }}
          id="providers-tab-models"
          type="button"
          role="tab"
          aria-selected={settingsTab === "models"}
          aria-controls="providers-tabpanel-models"
          tabIndex={settingsTab === "models" ? 0 : -1}
          className={`btn btn-sm ${settingsTab === "models" ? "primary" : ""}`}
          onClick={() => {
            clearFeedback();
            setSettingsTab("models");
          }}
          onKeyDown={(e) => handleTabKeyDown(e, 1)}
        >
          Model Catalog
        </button>
      </div>

      <div className="body">
        {feedbackError && (
          <div id="providers-secret-error" className="inline-alert" role="alert">
            <span className="pill error">Error</span>
            <span>{feedbackError}</span>
          </div>
        )}

        {feedbackSuccess && (
          <div className="inline-status" role="status">
            <span className="pill done">Saved</span>
            <span>{feedbackSuccess}</span>
          </div>
        )}

        {settingsTab === "models" ? (
          <ModelCatalogTab
            onSuccess={handleSuccessFeedback}
            onError={handleErrorFeedback}
            clearFeedback={clearFeedback}
          />
        ) : (
          <div
            id="providers-tabpanel-credentials"
            role="tabpanel"
            aria-labelledby="providers-tab-credentials"
            className="modal-tabpanel"
          >
            <div className="field-grid-2">
              <div className="field-group">
                <label htmlFor="modal-active-provider">Active Provider</label>
                <select
                  id="modal-active-provider"
                  className="input-control"
                  value={activeProvider}
                  disabled={switchingProvider}
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

              <div className="field-group">
                <label htmlFor="modal-active-runtime">Execution Runtime</label>
                <select
                  id="modal-active-runtime"
                  className="input-control"
                  value={activeRuntime}
                  disabled={switchingProvider}
                  onChange={(e) =>
                    void handleRuntimeChange(e.target.value as RuntimeKind)
                  }
                >
                  {runtimeOptions.map((rt) => (
                    <option key={rt} value={rt}>
                      {RUNTIME_LABELS[rt]}
                    </option>
                  ))}
                </select>
                {activeMeta.compatibleRuntimes.length === 1 && (
                  <div className="field-hint">
                    OAuth providers require local jcode runtime.
                  </div>
                )}
              </div>
            </div>

            <div className="inline-status credentials-model-summary">
              <span className="pill idle">Models</span>
              <span className="credentials-model-text">
                Default model:{" "}
                <span className="code-chip">{effectiveDefaultModel}</span>
                {roleOverrideCount > 0
                  ? ` (+${roleOverrideCount} role override${
                      roleOverrideCount === 1 ? "" : "s"
                    })`
                  : ""}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  clearFeedback();
                  setSettingsTab("models");
                }}
              >
                Configure in Model Catalog
              </button>
            </div>

            {loadingSettings && (
              <div className="inline-status" role="status">
                <span className="pill idle">Checking</span>
                <span>
                  Checking provider credentials and jcode OAuth status...
                </span>
              </div>
            )}

        <section
          className={`panel active-provider-card ${isReady ? "is-ready" : "needs-setup"}`}
          aria-labelledby="active-provider-card-title"
        >
          <div className="active-provider-header">
            <div className="active-provider-title-group">
              <h3 id="active-provider-card-title">{activeMeta.shortLabel}</h3>
              <span className={`pill ${isReady ? "done" : "error"}`}>
                {readyLabel}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              disabled={refreshing}
              onClick={() => void handleRefreshSettings()}
            >
              {refreshing ? "Refreshing..." : "Refresh Status"}
            </button>
          </div>

          <div className="field-hint">{activeMeta.hint}</div>

          {activeMeta.authMode === "jcode-oauth" ? (
            <>
              <div className="jcode-status-row">
                <span>jcode OAuth ({activeMeta.jcodeAuthKey})</span>
                <span className={`pill ${isReady ? "done" : "error"}`}>
                  {activeJcodeInfo
                    ? `${activeJcodeInfo.status} (${activeJcodeInfo.authKind})`
                    : "jcode CLI status unavailable"}
                </span>
              </div>
              {!isReady && (
                <div className="field-hint">
                  Run <code className="code-chip">jcode auth login</code> in
                  your terminal, then click Refresh Status.
                </div>
              )}
            </>
          ) : activeMeta.secretKey ? (
            <>
              <div className="field-group">
                <div className="secret-label-row">
                  <label htmlFor={`active-secret-${activeMeta.secretKey}`}>
                    {activeMeta.secretLabel}
                  </label>
                  <span className={`pill ${isActiveKeySet ? "done" : "idle"}`}>
                    {isActiveKeySet ? "Encrypted in SQLite" : "Not configured"}
                  </span>
                </div>
                <div className="secret-input-row">
                  <input
                    ref={(el) => {
                      if (activeMeta.secretKey) {
                        inputRefs.current[activeMeta.secretKey] = el;
                      }
                    }}
                    id={`active-secret-${activeMeta.secretKey}`}
                    type="password"
                    className="input-control"
                    value={keyDrafts[activeMeta.secretKey] ?? ""}
                    aria-invalid={
                      Boolean(feedbackError && errorKey === activeMeta.secretKey)
                        ? "true"
                        : undefined
                    }
                    aria-describedby={
                      Boolean(feedbackError && errorKey === activeMeta.secretKey)
                        ? "providers-secret-error"
                        : undefined
                    }
                    onChange={(e) => {
                      const secretKey = activeMeta.secretKey!;
                      const nextVal = e.target.value;
                      setKeyDrafts((prev) => ({
                        ...prev,
                        [secretKey]: nextVal,
                      }));
                      if (errorKey === secretKey && feedbackError) {
                        setFeedbackError(null);
                        setErrorKey(null);
                      }
                    }}
                    placeholder="Paste API key (stored AES-256-GCM encrypted)..."
                  />
                  <button
                    type="button"
                    className="btn primary"
                    disabled={savingKey === activeMeta.secretKey}
                    onClick={() => void handleSaveSecret(activeMeta.secretKey!)}
                  >
                    {savingKey === activeMeta.secretKey
                      ? "Saving..."
                      : "Save Key"}
                  </button>
                </div>
              </div>
              {activeRuntime === "jcode" && (
                <div className="jcode-status-row">
                  <span>jcode CLI ({activeMeta.jcodeAuthKey})</span>
                  <span
                    className={`pill ${
                      activeJcodeInfo?.status === "available" ? "done" : "idle"
                    }`}
                  >
                    {activeJcodeInfo
                      ? `${activeJcodeInfo.status} (${activeJcodeInfo.authKind})`
                      : "not probed"}
                  </span>
                </div>
              )}
            </>
          ) : null}
        </section>

        <details className="other-providers-details">
          <summary className="other-providers-summary">
            <span>Other Providers (optional, for switching later)</span>
          </summary>
          <div className="other-providers-body">
            <div className="panel jcode-status-card">
              <div className="jcode-status-title">
                Other Local jcode Harness Providers
              </div>
              {otherJcodeProviders.map((p) => {
                const info = jcodeAuth[p];
                const rowReady = info?.status === "available";
                return (
                  <div key={p} className="jcode-status-row">
                    <span>{p}</span>
                    <span className={`pill ${rowReady ? "done" : "idle"}`}>
                      {info
                        ? `${info.status} (${info.authKind})`
                        : "run jcode auth status"}
                    </span>
                  </div>
                );
              })}
            </div>

            {otherApiKeyProviders.map((item) => {
              const secretKey = item.secretKey!;
              const isSet = Boolean(configuredKeys[secretKey]);
              const inputId = `other-secret-${secretKey}`;
              const hasFieldError = Boolean(
                feedbackError && errorKey === secretKey
              );
              return (
                <div key={secretKey} className="field-group">
                  <div className="secret-label-row">
                    <label htmlFor={inputId}>{item.secretLabel}</label>
                    <span className={`pill ${isSet ? "done" : "idle"}`}>
                      {isSet ? "Encrypted in SQLite" : "Not configured"}
                    </span>
                  </div>
                  <div className="field-hint">{item.hint}</div>
                  <div className="secret-input-row">
                    <input
                      ref={(el) => {
                        inputRefs.current[secretKey] = el;
                      }}
                      id={inputId}
                      type="password"
                      className="input-control"
                      value={keyDrafts[secretKey] ?? ""}
                      aria-invalid={hasFieldError ? "true" : undefined}
                      aria-describedby={
                        hasFieldError ? "providers-secret-error" : undefined
                      }
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setKeyDrafts((prev) => ({
                          ...prev,
                          [secretKey]: nextVal,
                        }));
                        if (errorKey === secretKey && feedbackError) {
                          setFeedbackError(null);
                          setErrorKey(null);
                        }
                      }}
                      placeholder="Paste API key (stored AES-256-GCM encrypted)..."
                    />
                    <button
                      type="button"
                      className="btn primary"
                      disabled={savingKey === secretKey}
                      onClick={() => void handleSaveSecret(secretKey)}
                    >
                      {savingKey === secretKey ? "Saving..." : "Save Key"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
          </div>
        )}
      </div>
    </ModalDialog>
  );
};

export const ProvidersModal: React.FC<ProvidersModalProps> = React.memo(
  ({ open, onClose }) => {
    if (!open) return null;
    return <ProvidersModalContent onClose={onClose} />;
  }
);

ProvidersModal.displayName = "ProvidersModal";
