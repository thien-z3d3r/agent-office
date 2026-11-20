import React, { useEffect, useRef, useState } from "react";
import { useOfficeStore } from "../store/office-store.ts";
import { ModalDialog } from "./ModalDialog.tsx";

const SECRET_KEY_CONFIG: Array<{ key: string; label: string; hint: string }> = [
  {
    key: "ANTHROPIC_API_KEY",
    label: "Claude Console API Key (ANTHROPIC_API_KEY)",
    hint: "Used when Claude is selected as the single active office provider",
  },
  {
    key: "KIMI_API_KEY",
    label: "Kimi Code API Key (KIMI_API_KEY)",
    hint: "Used when Kimi Code is selected as the single active office provider (api.kimi.com/coding/v1)",
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API Key (OPENAI_API_KEY)",
    hint: "Used when OpenAI API Key is selected as the single active office provider",
  },
  {
    key: "GEMINI_API_KEY",
    label: "Gemini API Key (GEMINI_API_KEY)",
    hint: "Used when Gemini is selected as the single active office provider",
  },
];

const JCODE_PROVIDERS = [
  "antigravity",
  "openai",
  "claude",
  "kimi",
  "gemini",
] as const;

export interface ProvidersModalProps {
  open: boolean;
  onClose: () => void;
}

export const ProvidersModal: React.FC<ProvidersModalProps> = ({
  open,
  onClose,
}) => {
  const configuredKeys = useOfficeStore((s) => s.configuredKeys);
  const jcodeAuth = useOfficeStore((s) => s.jcodeAuth);
  const saveSecretKey = useOfficeStore((s) => s.saveSecretKey);
  const clearError = useOfficeStore((s) => s.clearError);

  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [secretSuccess, setSecretSuccess] = useState<string | null>(null);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (open) {
      setSecretError(null);
      setErrorKey(null);
      setSecretSuccess(null);
      setSavingKey(null);
    }
  }, [open]);

  const handleSave = async (keyName: string) => {
    const val = (keyDrafts[keyName] ?? "").trim();
    if (!val) {
      setSecretSuccess(null);
      setErrorKey(keyName);
      setSecretError(`Enter an API key for ${keyName} before saving.`);
      inputRefs.current[keyName]?.focus();
      return;
    }

    setSavingKey(keyName);
    setSecretError(null);
    setErrorKey(null);
    setSecretSuccess(null);
    clearError();
    await saveSecretKey(keyName, val);
    setSavingKey(null);

    const apiError = useOfficeStore.getState().lastError;
    if (apiError) {
      setErrorKey(keyName);
      setSecretError(apiError);
      return;
    }

    setKeyDrafts((prev) => ({
      ...prev,
      [keyName]: "",
    }));
    setSecretSuccess(`Saved ${keyName} (encrypted in SQLite).`);
  };

  return (
    <ModalDialog
      open={open}
      titleId="settings-modal-title"
      title="AI Providers & jcode OAuth Settings"
      closeLabel="Close Providers Settings modal"
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="body">
        {secretError && (
          <div id="providers-secret-error" className="inline-alert" role="alert">
            <span className="pill error">Error</span>
            <span>{secretError}</span>
          </div>
        )}

        {secretSuccess && (
          <div className="inline-status" role="status">
            <span className="pill done">Saved</span>
            <span>{secretSuccess}</span>
          </div>
        )}

        <div className="panel jcode-status-card">
          <div className="jcode-status-title">
            Local jcode Harness Status (jcode CLI)
          </div>
          {JCODE_PROVIDERS.map((p) => {
            const info = jcodeAuth[p];
            const isReady = info?.status === "available";
            return (
              <div key={p} className="jcode-status-row">
                <span>{p}</span>
                <span className={`pill ${isReady ? "done" : "idle"}`}>
                  {info
                    ? `${info.status} (${info.authKind})`
                    : "run jcode auth status"}
                </span>
              </div>
            );
          })}
        </div>

        {SECRET_KEY_CONFIG.map((item) => {
          const isSet = configuredKeys[item.key];
          const inputId = `secret-input-${item.key}`;
          const hasFieldError = Boolean(secretError && errorKey === item.key);
          return (
            <div key={item.key} className="field-group">
              <div className="secret-label-row">
                <label htmlFor={inputId}>{item.label}</label>
                <span className={`pill ${isSet ? "done" : "idle"}`}>
                  {isSet ? "Encrypted in SQLite" : "Not configured"}
                </span>
              </div>
              <div className="field-hint">{item.hint}</div>
              <div className="secret-input-row">
                <input
                  ref={(el) => {
                    inputRefs.current[item.key] = el;
                  }}
                  id={inputId}
                  type="password"
                  className="input-control"
                  value={keyDrafts[item.key] ?? ""}
                  aria-invalid={hasFieldError ? "true" : undefined}
                  aria-describedby={
                    hasFieldError ? "providers-secret-error" : undefined
                  }
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setKeyDrafts((prev) => ({
                      ...prev,
                      [item.key]: nextVal,
                    }));
                    if (errorKey === item.key && secretError) {
                      setSecretError(null);
                      setErrorKey(null);
                    }
                  }}
                  placeholder="Paste API key (stored AES-256-GCM encrypted)..."
                />
                <button
                  type="button"
                  className="btn primary"
                  disabled={savingKey === item.key}
                  onClick={() => void handleSave(item.key)}
                >
                  {savingKey === item.key ? "Saving..." : "Save Key"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ModalDialog>
  );
};
