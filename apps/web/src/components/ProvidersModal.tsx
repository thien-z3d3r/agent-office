import React, { useEffect, useRef, useState } from "react";
import type { ProviderId, RuntimeKind } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";
import {
  PROVIDER_CATALOG,
  PROVIDER_META_BY_ID,
  RUNTIME_LABELS,
} from "../store/provider-catalog.ts";
import { ModalDialog } from "./ModalDialog.tsx";

const JCODE_PROVIDERS = PROVIDER_CATALOG.map((p) => p.jcodeAuthKey);

const API_KEY_PROVIDERS = PROVIDER_CATALOG.filter(
  (p) => p.authMode === "api-key" && p.secretKey
);

export interface ProvidersModalProps {
  open: boolean;
  onClose: () => void;
}

const ProvidersModalContent: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const activeProvider = useOfficeStore((s) => s.snapshot.activeProvider);
  const activeRuntime = useOfficeStore((s) => s.snapshot.activeRuntime);
  const activeModel = useOfficeStore((s) => s.snapshot.activeModel);
  const configuredKeys = useOfficeStore((s) => s.configuredKeys);
  const jcodeAuth = useOfficeStore((s) => s.jcodeAuth);
  const setActiveProvider = useOfficeStore((s) => s.setActiveProvider);
  const fetchSettings = useOfficeStore((s) => s.fetchSettings);
  const saveSecretKey = useOfficeStore((s) => s.saveSecretKey);
  const clearError = useOfficeStore((s) => s.clearError);

  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [modelDraft, setModelDraft] = useState<string>(activeModel ?? "");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [switchingProvider, setSwitchingProvider] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setModelDraft(activeModel ?? "");
  }, [activeProvider, activeModel]);

  useEffect(() => {
    setFeedbackError(null);
    setErrorKey(null);
    setFeedbackSuccess(null);
    setSavingKey(null);
    setSwitchingProvider(false);
    setModelDraft(useOfficeStore.getState().snapshot.activeModel ?? "");
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
  }, [fetchSettings, clearError]);

  const activeMeta = PROVIDER_META_BY_ID[activeProvider];
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

  const handleRefreshSettings = async () => {
    setRefreshing(true);
    setFeedbackError(null);
    setErrorKey(null);
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
    setFeedbackError(null);
    setErrorKey(null);
    setFeedbackSuccess(null);
    clearError();
    await setActiveProvider(nextProvider, undefined, null);
    setSwitchingProvider(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      setFeedbackError(apiError);
      return;
    }
    setModelDraft("");
    setFeedbackSuccess(
      `Active provider switched to ${PROVIDER_META_BY_ID[nextProvider].shortLabel}.`
    );
  };

  const handleRuntimeChange = async (nextRuntime: RuntimeKind) => {
    setSwitchingProvider(true);
    setFeedbackError(null);
    setErrorKey(null);
    setFeedbackSuccess(null);
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

  const handleApplyModel = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = modelDraft.trim();
    const nextModel = trimmed.length > 0 ? trimmed : null;
    setSwitchingProvider(true);
    setFeedbackError(null);
    setErrorKey(null);
    setFeedbackSuccess(null);
    clearError();
    await setActiveProvider(activeProvider, activeRuntime, nextModel);
    setSwitchingProvider(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      setFeedbackError(apiError);
      return;
    }
    setFeedbackSuccess(
      nextModel
        ? `Model override set to ${nextModel}.`
        : `Reset to default model (${activeMeta.defaultModel}).`
    );
  };

  const handleResetModel = async () => {
    setSwitchingProvider(true);
    setFeedbackError(null);
    setErrorKey(null);
    setFeedbackSuccess(null);
    clearError();
    await setActiveProvider(activeProvider, activeRuntime, null);
    setSwitchingProvider(false);
    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      setFeedbackError(apiError);
      return;
    }
    setModelDraft("");
    setFeedbackSuccess(`Reset to default model (${activeMeta.defaultModel}).`);
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
    setFeedbackError(null);
    setErrorKey(null);
    setFeedbackSuccess(null);
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
      title="Single Active Provider & Credentials"
      closeLabel="Close Providers Settings modal"
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="body">
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

        <form className="field-group" onSubmit={(e) => void handleApplyModel(e)}>
          <label htmlFor="modal-active-model">Model Override (optional)</label>
          <div className="model-override-row">
            <input
              id="modal-active-model"
              type="text"
              className="input-control"
              value={modelDraft}
              disabled={switchingProvider}
              onChange={(e) => setModelDraft(e.target.value)}
              placeholder={`Default: ${activeMeta.defaultModel}`}
            />
            <button
              type="submit"
              className="btn"
              disabled={switchingProvider}
            >
              Apply Model
            </button>
            {activeModel && (
              <button
                type="button"
                className="btn"
                disabled={switchingProvider}
                onClick={() => void handleResetModel()}
              >
                Reset
              </button>
            )}
          </div>
          <div className="field-hint">
            All 8 office sub-agents run on {activeMeta.shortLabel} ({activeRuntime}
            {activeModel ? `, model: ${activeModel}` : `, default: ${activeMeta.defaultModel}`}).
          </div>
        </form>

        {loadingSettings && (
          <div className="inline-status" role="status">
            <span className="pill idle">Checking</span>
            <span>Checking provider credentials and jcode OAuth status...</span>
          </div>
        )}

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
