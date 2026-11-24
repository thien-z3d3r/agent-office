import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ProviderId, RuntimeKind } from "@agent-office/protocol";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Code } from "@astryxdesign/core/Code";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Selector } from "@astryxdesign/core/Selector";
import { StackItem } from "@astryxdesign/core/Stack";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { Cpu, KeyRound, RefreshCw } from "lucide-react";
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
        ? "Ready (Encrypted Key)"
        : activeRuntime === "jcode" && activeJcodeInfo?.status === "available"
          ? "Ready via jcode CLI"
          : "Setup Required";

  const providerOptions = useMemo(
    () =>
      PROVIDER_CATALOG.map((opt) => ({
        value: opt.id,
        label: opt.label,
      })),
    []
  );

  const runtimeOptions = useMemo(() => {
    const list: RuntimeKind[] = activeMeta.compatibleRuntimes.includes(
      activeRuntime
    )
      ? [...activeMeta.compatibleRuntimes]
      : [...activeMeta.compatibleRuntimes, activeRuntime];
    return list.map((rt) => ({
      value: rt,
      label: RUNTIME_LABELS[rt],
    }));
  }, [activeMeta.compatibleRuntimes, activeRuntime]);

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
    setFeedbackSuccess(
      `Execution runtime set to ${RUNTIME_LABELS[nextRuntime]}.`
    );
  };

  const handleSaveSecret = async (keyName: string) => {
    const val = (keyDrafts[keyName] ?? "").trim();
    if (!val) {
      setFeedbackSuccess(null);
      setErrorKey(keyName);
      setFeedbackError(`Enter an API key for ${keyName} before saving.`);
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

  const tabBar = (
    <div style={{ padding: "var(--spacing-2) var(--spacing-4) 0" }}>
      <TabList
        role="tablist"
        size="sm"
        hasDivider
        value={settingsTab}
        onChange={(val) => {
          clearFeedback();
          setSettingsTab(val as SettingsTab);
        }}
      >
        <Tab
          value="credentials"
          panelId="providers-tabpanel-credentials"
          label="Credentials & Runtime"
          icon={<Icon icon={KeyRound} size="xsm" />}
        />
        <Tab
          value="models"
          panelId="providers-tabpanel-models"
          label="Model Catalog"
          icon={<Icon icon={Cpu} size="xsm" />}
        />
      </TabList>
    </div>
  );

  return (
    <ModalDialog
      open
      width={720}
      title="Providers, Models & Credentials"
      subtitle="Manage the single active provider, local jcode OAuth, and per-role model overrides"
      subheader={tabBar}
      onClose={onClose}
      footer={<Button variant="secondary" label="Done" onClick={onClose} />}
    >
      <VStack gap={4}>
        {feedbackError && !errorKey && (
          <Banner
            status="error"
            title="Configuration error"
            description={feedbackError}
            isDismissable
            onDismiss={clearFeedback}
          />
        )}

        {feedbackSuccess && (
          <Banner
            status="success"
            title={feedbackSuccess}
            isDismissable
            onDismiss={clearFeedback}
          />
        )}

        {settingsTab === "models" ? (
          <ModelCatalogTab
            onSuccess={handleSuccessFeedback}
            onError={handleErrorFeedback}
            clearFeedback={clearFeedback}
          />
        ) : (
          <div id="providers-tabpanel-credentials" role="tabpanel">
            <VStack gap={4}>
              <div className="modal-grid-2">
                <Selector
                  label="Active Provider"
                  width="100%"
                  value={activeProvider}
                  isDisabled={switchingProvider}
                  options={providerOptions}
                  onChange={(val) => void handleProviderChange(val as ProviderId)}
                />

                <Selector
                  label="Execution Runtime"
                  width="100%"
                  value={activeRuntime}
                  isDisabled={switchingProvider}
                  description={
                    activeMeta.compatibleRuntimes.length === 1
                      ? "OAuth providers require local jcode runtime."
                      : undefined
                  }
                  options={runtimeOptions}
                  onChange={(val) => void handleRuntimeChange(val as RuntimeKind)}
                />
              </div>

              <Card variant="muted" padding={3}>
                <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text type="supporting" weight="semibold">
                      Default model
                    </Text>
                    <Code>{effectiveDefaultModel}</Code>
                    {roleOverrideCount > 0 && (
                      <Badge
                        variant="orange"
                        label={`+${roleOverrideCount} role override${
                          roleOverrideCount === 1 ? "" : "s"
                        }`}
                      />
                    )}
                  </HStack>

                  <Button
                    size="sm"
                    variant="secondary"
                    label="Configure in Model Catalog"
                    onClick={() => {
                      clearFeedback();
                      setSettingsTab("models");
                    }}
                  />
                </HStack>
              </Card>

              {loadingSettings && (
                <Banner
                  status="info"
                  title="Checking provider credentials and jcode OAuth status..."
                />
              )}

              <Card padding={4}>
                <VStack gap={3}>
                  <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                    <HStack gap={2} vAlign="center">
                      <Heading level={3}>{activeMeta.shortLabel}</Heading>
                      <Badge
                        variant={isReady ? "success" : "error"}
                        label={readyLabel}
                      />
                    </HStack>

                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Icon icon={RefreshCw} />}
                      isLoading={refreshing}
                      label={refreshing ? "Refreshing..." : "Refresh Status"}
                      onClick={() => void handleRefreshSettings()}
                    />
                  </HStack>

                  <Text type="supporting">{activeMeta.hint}</Text>

                  <Divider />

                  {activeMeta.authMode === "jcode-oauth" ? (
                    <VStack gap={2}>
                      <HStack gap={2} vAlign="center" hAlign="between">
                        <Text weight="medium">
                          jcode OAuth ({activeMeta.jcodeAuthKey})
                        </Text>
                        <Badge
                          variant={isReady ? "success" : "error"}
                          label={
                            activeJcodeInfo
                              ? `${activeJcodeInfo.status} (${activeJcodeInfo.authKind})`
                              : "CLI status unavailable"
                          }
                        />
                      </HStack>

                      {!isReady && (
                        <Text type="supporting">
                          Run <Code>jcode auth login</Code> in your terminal,
                          then click Refresh Status.
                        </Text>
                      )}
                    </VStack>
                  ) : activeMeta.secretKey ? (
                    <VStack gap={3}>
                      <HStack gap={2} vAlign="end">
                        <StackItem size="fill">
                          <TextInput
                            type="password"
                            width="100%"
                            label={activeMeta.secretLabel ?? activeMeta.secretKey}
                            description={
                              isActiveKeySet
                                ? "Encrypted key stored in local SQLite"
                                : "Stored AES-256-GCM encrypted in local SQLite"
                            }
                            value={keyDrafts[activeMeta.secretKey] ?? ""}
                            status={
                              feedbackError && errorKey === activeMeta.secretKey
                                ? { type: "error", message: feedbackError }
                                : undefined
                            }
                            onChange={(nextVal) => {
                              const secretKey = activeMeta.secretKey!;
                              setKeyDrafts((prev) => ({
                                ...prev,
                                [secretKey]: nextVal,
                              }));
                              if (errorKey === secretKey && feedbackError) {
                                setFeedbackError(null);
                                setErrorKey(null);
                              }
                            }}
                            placeholder="Paste API key..."
                          />
                        </StackItem>

                        <Button
                          variant="primary"
                          isLoading={savingKey === activeMeta.secretKey}
                          label={
                            savingKey === activeMeta.secretKey
                              ? "Saving..."
                              : "Save Key"
                          }
                          onClick={() =>
                            void handleSaveSecret(activeMeta.secretKey!)
                          }
                        />
                      </HStack>

                      {activeRuntime === "jcode" && (
                        <HStack gap={2} vAlign="center" hAlign="between">
                          <Text type="supporting">
                            jcode CLI ({activeMeta.jcodeAuthKey})
                          </Text>
                          <Badge
                            variant={
                              activeJcodeInfo?.status === "available"
                                ? "success"
                                : "neutral"
                            }
                            label={
                              activeJcodeInfo
                                ? `${activeJcodeInfo.status} (${activeJcodeInfo.authKind})`
                                : "not probed"
                            }
                          />
                        </HStack>
                      )}
                    </VStack>
                  ) : null}
                </VStack>
              </Card>

              <Collapsible
                defaultIsOpen={false}
                trigger={
                  <Text weight="semibold">
                    Other Providers (optional, for switching later)
                  </Text>
                }
              >
                <VStack gap={3} style={{ paddingTop: "var(--spacing-3)" }}>
                  <Card variant="muted" padding={3}>
                    <VStack gap={2}>
                      <Text type="label" weight="semibold">
                        Local jcode Harness Providers
                      </Text>
                      {otherJcodeProviders.map((p) => {
                        const info = jcodeAuth[p];
                        const rowReady = info?.status === "available";
                        return (
                          <HStack key={p} gap={2} vAlign="center" hAlign="between">
                            <Code>{p}</Code>
                            <Text type="supporting">
                              {info
                                ? `${info.status} (${info.authKind})`
                                : "run jcode auth status"}
                            </Text>
                            {rowReady && (
                              <Badge variant="success" label="Available" />
                            )}
                          </HStack>
                        );
                      })}
                    </VStack>
                  </Card>

                  {otherApiKeyProviders.map((item) => {
                    const secretKey = item.secretKey!;
                    const isSet = Boolean(configuredKeys[secretKey]);
                    const hasFieldError = Boolean(
                      feedbackError && errorKey === secretKey
                    );
                    return (
                      <Card key={secretKey} padding={3}>
                        <VStack gap={2}>
                          <HStack gap={2} vAlign="center" hAlign="between">
                            <Text weight="semibold">{item.secretLabel}</Text>
                            <Badge
                              variant={isSet ? "success" : "neutral"}
                              label={isSet ? "Encrypted" : "Not set"}
                            />
                          </HStack>
                          <HStack gap={2} vAlign="end">
                            <StackItem size="fill">
                              <TextInput
                                type="password"
                                width="100%"
                                label={item.secretLabel ?? secretKey}
                                isLabelHidden
                                value={keyDrafts[secretKey] ?? ""}
                                status={
                                  hasFieldError
                                    ? { type: "error", message: feedbackError ?? undefined }
                                    : undefined
                                }
                                onChange={(nextVal) => {
                                  setKeyDrafts((prev) => ({
                                    ...prev,
                                    [secretKey]: nextVal,
                                  }));
                                  if (errorKey === secretKey && feedbackError) {
                                    setFeedbackError(null);
                                    setErrorKey(null);
                                  }
                                }}
                                placeholder="Paste API key (AES-256-GCM encrypted)..."
                              />
                            </StackItem>
                            <Button
                              size="sm"
                              variant="secondary"
                              isLoading={savingKey === secretKey}
                              label={
                                savingKey === secretKey ? "Saving..." : "Save"
                              }
                              onClick={() => void handleSaveSecret(secretKey)}
                            />
                          </HStack>
                        </VStack>
                      </Card>
                    );
                  })}
                </VStack>
              </Collapsible>
            </VStack>
          </div>
        )}
      </VStack>
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
