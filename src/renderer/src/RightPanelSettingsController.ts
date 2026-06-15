import { useEffect, useRef, useState } from "react";

import type {
  DesktopState,
  InstallModelProviderEndpointInput,
  InstallModelProviderEndpointResult,
  LocalModelRuntimeLifecycleActionInput,
  LocalModelRuntimeLifecycleActionResult,
  ModelProviderCredentialSaveResult,
  ProviderCatalogSettingsCard,
  SaveModelProviderCredentialInput,
  VoiceArtifactRetentionSummary,
  VoiceOnboardingHostFacts,
} from "../../shared/types";
import {
  buildFirstRunCapabilityOnboardingPrompt,
  buildProviderCatalogCardOnboardingPrompt,
  buildRemoteSurfaceActivationPrompt,
  buildVoiceProviderCapabilityPrompt,
  providerCatalogSettingsCardsForArea,
} from "./pluginUiModel";
import {
  emptyModelProviderEndpointInstallDraft,
  modelProviderCredentialSaveDraftModel,
  modelProviderCredentialSaveInputFromDraft,
  modelProviderEndpointInstallDraftModel,
  type ModelProviderEndpointInstallDraft,
} from "./modelProviderOnboardingUiModel";
import type { ModelRuntimeCatalogRuntimeAction, ModelRuntimeCatalogRuntimeRow } from "./modelRuntimeCatalogUiModel";
import { firstLine, localRuntimeLifecycleResultStatusKind, type ApiKeyStatus } from "./RightPanelSettingsRuntime";
import { shortcutFromKeyboardEvent } from "./sttShortcut";

const FIRST_RUN_CAPABILITY_ONBOARDING_DISMISSED_KEY = "ambient.firstRunCapabilityOnboarding.dismissed.v1";

type SettingsFocusSection = "voice" | "mcp-runtime" | "search-web";

type SettingsFocusRequest = {
  section?: SettingsFocusSection;
  nonce: number;
};

type SettingsMcpController = {
  refreshContainerRuntimeStatus: (force?: boolean, options?: { continueDefaultCapabilitySetup?: boolean }) => Promise<void>;
  loadInstalledServers: () => Promise<void>;
  loadManagedDevServers: () => Promise<void>;
};

type UseRightPanelSettingsControllerInput = {
  panel: string;
  running: boolean;
  activeThreadId: string;
  workspacePath: string;
  activeWorkspacePath: string;
  permissionAuditRevision: number;
  settings: DesktopState["settings"];
  providerCatalogCards: ProviderCatalogSettingsCard[];
  subagentsEffectiveEnabled: boolean;
  settingsFocusRequest?: SettingsFocusRequest;
  mcp: SettingsMcpController;
  onLoadPermissionAudit: () => Promise<void>;
  onLoadPermissionGrants: () => Promise<void>;
  onLoadVoiceProviders: (trigger?: string) => Promise<void>;
  onStartCapabilityBuilder: (prompt: string, newChat: boolean, activityLine?: string) => Promise<void>;
  onHydrateSearchRoutingSettings: () => void;
  onSttSettingsChange: (stt: DesktopState["settings"]["stt"]) => void;
  onSaveModelProviderCredential: (input: SaveModelProviderCredentialInput) => Promise<ModelProviderCredentialSaveResult>;
  onInstallModelProviderEndpoint: (input: InstallModelProviderEndpointInput) => Promise<InstallModelProviderEndpointResult>;
  onRunLocalModelRuntimeLifecycleAction: (input: LocalModelRuntimeLifecycleActionInput) => Promise<LocalModelRuntimeLifecycleActionResult>;
};

function readInitialFirstRunCapabilityOnboardingDismissed(): boolean {
  try {
    return window.localStorage.getItem(FIRST_RUN_CAPABILITY_ONBOARDING_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function useRightPanelSettingsController({
  panel,
  running,
  activeThreadId,
  workspacePath,
  activeWorkspacePath,
  permissionAuditRevision,
  settings,
  providerCatalogCards,
  subagentsEffectiveEnabled,
  settingsFocusRequest,
  mcp,
  onLoadPermissionAudit,
  onLoadPermissionGrants,
  onLoadVoiceProviders,
  onStartCapabilityBuilder,
  onHydrateSearchRoutingSettings,
  onSttSettingsChange,
  onSaveModelProviderCredential,
  onInstallModelProviderEndpoint,
  onRunLocalModelRuntimeLifecycleAction,
}: UseRightPanelSettingsControllerInput) {
  const [permissionAuditFilter, setPermissionAuditFilter] = useState<"all" | "sandbox-fallback">("all");
  const [modelProviderInstallDraft, setModelProviderInstallDraft] = useState<ModelProviderEndpointInstallDraft>(() => emptyModelProviderEndpointInstallDraft());
  const [modelProviderCredentialValue, setModelProviderCredentialValue] = useState("");
  const [modelProviderCredentialBusy, setModelProviderCredentialBusy] = useState(false);
  const [modelProviderCredentialStatus, setModelProviderCredentialStatus] = useState<ApiKeyStatus | undefined>();
  const [modelProviderInstallBusy, setModelProviderInstallBusy] = useState(false);
  const [modelProviderInstallStatus, setModelProviderInstallStatus] = useState<ApiKeyStatus | undefined>();
  const [localRuntimeLifecycleBusyId, setLocalRuntimeLifecycleBusyId] = useState<string | undefined>();
  const [localRuntimeLifecycleStatus, setLocalRuntimeLifecycleStatus] = useState<ApiKeyStatus | undefined>();
  const [capabilityOnboardingDismissed, setCapabilityOnboardingDismissed] = useState(readInitialFirstRunCapabilityOnboardingDismissed);
  const [capabilityOnboardingStarting, setCapabilityOnboardingStarting] = useState(false);
  const [voiceArtifactRetention, setVoiceArtifactRetention] = useState<VoiceArtifactRetentionSummary | undefined>();
  const [voiceArtifactRetentionLoading, setVoiceArtifactRetentionLoading] = useState(false);
  const [voiceArtifactRetentionError, setVoiceArtifactRetentionError] = useState<string | undefined>();
  const [voiceArtifactPruning, setVoiceArtifactPruning] = useState(false);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [voiceSearchQuery, setVoiceSearchQuery] = useState("");
  const [focusedSettingsSection, setFocusedSettingsSection] = useState<SettingsFocusSection | undefined>();
  const [sttShortcutCapture, setSttShortcutCapture] = useState(false);
  const voiceSettingsRowRef = useRef<HTMLElement | null>(null);
  const searchWebSettingsRowRef = useRef<HTMLElement | null>(null);
  const mcpRuntimeSettingsRowRef = useRef<HTMLElement | null>(null);

  const modelProviderEndpointInstall = modelProviderEndpointInstallDraftModel(modelProviderInstallDraft);
  const modelProviderCredentialSave = modelProviderCredentialSaveDraftModel(modelProviderInstallDraft, modelProviderCredentialValue);

  useEffect(() => {
    setVoiceSearchQuery("");
  }, [settings.voice.providerCapabilityId]);

  useEffect(() => {
    if (!sttShortcutCapture) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const shortcut = shortcutFromKeyboardEvent(event);
      if (!shortcut) return;
      onSttSettingsChange({ ...settings.stt, pushToTalkShortcut: shortcut });
      setSttShortcutCapture(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onSttSettingsChange, settings.stt, sttShortcutCapture]);

  async function startVoiceProviderOnboarding() {
    if (running) return;
    let hostFacts: VoiceOnboardingHostFacts | undefined;
    try {
      hostFacts = await window.ambientDesktop.getVoiceOnboardingHostFacts();
    } catch {
      hostFacts = undefined;
    }
    const voiceCatalogCards = providerCatalogSettingsCardsForArea(providerCatalogCards, "voice-generation");
    await onStartCapabilityBuilder(buildVoiceProviderCapabilityPrompt(hostFacts, voiceCatalogCards), true);
  }

  async function startProviderCatalogCardOnboarding(card: ProviderCatalogSettingsCard) {
    if (running) return;
    let hostFacts: VoiceOnboardingHostFacts | undefined;
    try {
      hostFacts = await window.ambientDesktop.getVoiceOnboardingHostFacts();
    } catch {
      hostFacts = undefined;
    }
    await onStartCapabilityBuilder(buildProviderCatalogCardOnboardingPrompt(card, hostFacts), true);
  }

  async function startRemoteSurfaceActivation(provider: "telegram" | "signal" | "choose") {
    if (running) return;
    const activityLine =
      provider === "telegram"
        ? "Remote Ambient Surface Telegram setup sent to Ambient."
        : provider === "signal"
          ? "Remote Ambient Surface Signal check sent to Ambient."
          : "Remote Ambient Surface setup sent to Ambient.";
    await onStartCapabilityBuilder(buildRemoteSurfaceActivationPrompt(provider), true, activityLine);
  }

  async function startFirstRunCapabilityOnboarding() {
    if (running) return;
    setCapabilityOnboardingStarting(true);
    let hostFacts: VoiceOnboardingHostFacts | undefined;
    try {
      hostFacts = await window.ambientDesktop.getVoiceOnboardingHostFacts();
    } catch {
      hostFacts = undefined;
    }
    try {
      await onStartCapabilityBuilder(buildFirstRunCapabilityOnboardingPrompt(hostFacts, providerCatalogCards), true);
      setCapabilityOnboardingDismissed(false);
      try {
        window.localStorage.removeItem(FIRST_RUN_CAPABILITY_ONBOARDING_DISMISSED_KEY);
      } catch {
        // localStorage is best-effort; the entrypoint remains available for this session.
      }
    } finally {
      setCapabilityOnboardingStarting(false);
    }
  }

  function dismissFirstRunCapabilityOnboarding() {
    setCapabilityOnboardingDismissed(true);
    try {
      window.localStorage.setItem(FIRST_RUN_CAPABILITY_ONBOARDING_DISMISSED_KEY, "1");
    } catch {
      // localStorage is best-effort; in-memory dismissal still avoids repeating this session.
    }
  }

  function resumeFirstRunCapabilityOnboarding() {
    setCapabilityOnboardingDismissed(false);
    try {
      window.localStorage.removeItem(FIRST_RUN_CAPABILITY_ONBOARDING_DISMISSED_KEY);
    } catch {
      // localStorage is best-effort.
    }
  }

  async function loadVoiceArtifactRetention(providerCapabilityId = settings.voice.providerCapabilityId) {
    setVoiceArtifactRetentionLoading(true);
    setVoiceArtifactRetentionError(undefined);
    try {
      setVoiceArtifactRetention(
        await window.ambientDesktop.inspectVoiceArtifacts({
          threadId: activeThreadId,
          providerCapabilityId,
        }),
      );
    } catch (error) {
      setVoiceArtifactRetentionError(error instanceof Error ? error.message : String(error));
    } finally {
      setVoiceArtifactRetentionLoading(false);
    }
  }

  async function pruneVoiceArtifactRetention() {
    setVoiceArtifactPruning(true);
    setVoiceArtifactRetentionError(undefined);
    try {
      setVoiceArtifactRetention(
        await window.ambientDesktop.pruneVoiceArtifacts({
          threadId: activeThreadId,
          providerCapabilityId: settings.voice.providerCapabilityId,
        }),
      );
    } catch (error) {
      setVoiceArtifactRetentionError(error instanceof Error ? error.message : String(error));
    } finally {
      setVoiceArtifactPruning(false);
    }
  }

  useEffect(() => {
    if (panel === "settings") {
      void onLoadPermissionAudit();
      void onLoadPermissionGrants();
      void onLoadVoiceProviders();
      void loadVoiceArtifactRetention();
      void mcp.refreshContainerRuntimeStatus(false);
      void mcp.loadInstalledServers();
      void mcp.loadManagedDevServers();
    }
  }, [panel, workspacePath, permissionAuditRevision]);

  useEffect(() => {
    if (panel === "settings") void loadVoiceArtifactRetention();
  }, [panel, activeThreadId, settings.voice.providerCapabilityId]);

  useEffect(() => {
    if (panel !== "settings" || settingsFocusRequest?.section !== "voice") return;
    setFocusedSettingsSection("voice");
    void onLoadVoiceProviders();
    void loadVoiceArtifactRetention();
    const scrollTimer = window.setTimeout(() => {
      voiceSettingsRowRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    const clearTimer = window.setTimeout(() => setFocusedSettingsSection(undefined), 2400);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [panel, settingsFocusRequest?.nonce, settingsFocusRequest?.section, activeThreadId, settings.voice.providerCapabilityId]);

  useEffect(() => {
    if (panel !== "settings" || settingsFocusRequest?.section !== "mcp-runtime") return;
    setFocusedSettingsSection("mcp-runtime");
    void mcp.refreshContainerRuntimeStatus(true, { continueDefaultCapabilitySetup: true });
    void mcp.loadInstalledServers();
    void mcp.loadManagedDevServers();
    const scrollTimer = window.setTimeout(() => {
      mcpRuntimeSettingsRowRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    const clearTimer = window.setTimeout(() => setFocusedSettingsSection(undefined), 2400);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [panel, settingsFocusRequest?.nonce, settingsFocusRequest?.section, activeWorkspacePath]);

  useEffect(() => {
    if (panel !== "settings" || settingsFocusRequest?.section !== "search-web") return;
    setFocusedSettingsSection("search-web");
    void onHydrateSearchRoutingSettings();
    const scrollTimer = window.setTimeout(() => {
      searchWebSettingsRowRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    const clearTimer = window.setTimeout(() => setFocusedSettingsSection(undefined), 2400);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [panel, settingsFocusRequest?.nonce, settingsFocusRequest?.section, activeWorkspacePath]);

  useEffect(() => {
    if (panel !== "settings") return;
    onHydrateSearchRoutingSettings();
  }, [panel, workspacePath]);

  async function saveModelProviderCredentialFromSettings() {
    const input = modelProviderCredentialSaveInputFromDraft(modelProviderInstallDraft, modelProviderCredentialValue);
    if (!input) {
      setModelProviderCredentialStatus({ kind: "error", message: modelProviderCredentialSave.validationRows[0] ?? "Credential save input is incomplete." });
      return;
    }
    setModelProviderCredentialBusy(true);
    setModelProviderCredentialStatus({ kind: "info", message: "Saving credential." });
    try {
      const result = await onSaveModelProviderCredential(input);
      setModelProviderInstallDraft((current) => ({
        ...current,
        managedSecretRef: result.credentialRef.managedSecretRef,
        credentialLabel: result.credentialRef.label ?? current.credentialLabel,
      }));
      setModelProviderCredentialValue("");
      setModelProviderCredentialStatus({ kind: "success", message: "Credential saved." });
    } catch (error) {
      setModelProviderCredentialStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setModelProviderCredentialBusy(false);
    }
  }

  async function installModelProviderEndpointFromSettings() {
    if (!modelProviderEndpointInstall.input) {
      setModelProviderInstallStatus({ kind: "error", message: modelProviderEndpointInstall.validationRows[0] ?? "Endpoint probe input is incomplete." });
      return;
    }
    setModelProviderInstallBusy(true);
    setModelProviderInstallStatus({ kind: "info", message: "Probing endpoint." });
    try {
      const result = await onInstallModelProviderEndpoint(modelProviderEndpointInstall.input);
      setModelProviderInstallStatus({ kind: "success", message: `Installed ${result.installedProviderKey}.` });
    } catch (error) {
      setModelProviderInstallStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setModelProviderInstallBusy(false);
    }
  }

  async function runLocalRuntimeLifecycleActionFromSettings(
    row: ModelRuntimeCatalogRuntimeRow,
    action: ModelRuntimeCatalogRuntimeAction,
  ) {
    if (action.kind === "unload") return;
    if (!subagentsEffectiveEnabled) {
      setLocalRuntimeLifecycleStatus({
        kind: "error",
        message: "Local runtime controls are disabled while ambient.subagents is off.",
      });
      return;
    }
    if (!action.enabled) {
      setLocalRuntimeLifecycleStatus({ kind: "error", message: action.title });
      return;
    }
    const runtimeId = row.modelRuntimeId ?? row.id;
    const busyId = `${row.id}:${action.kind}`;
    setLocalRuntimeLifecycleBusyId(busyId);
    setLocalRuntimeLifecycleStatus({
      kind: "info",
      message: `${action.label.replace(" disabled", "")} requested for ${row.label}.`,
    });
    try {
      const result = await onRunLocalModelRuntimeLifecycleAction({
        action: action.kind,
        runtimeId,
        force: false,
        dryRun: false,
      });
      setLocalRuntimeLifecycleStatus({
        kind: localRuntimeLifecycleResultStatusKind(result.status),
        message: firstLine(result.message),
      });
    } catch (error) {
      setLocalRuntimeLifecycleStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLocalRuntimeLifecycleBusyId((current) => current === busyId ? undefined : current);
    }
  }

  return {
    permissionAuditFilter,
    setPermissionAuditFilter,
    modelProviderInstallDraft,
    setModelProviderInstallDraft,
    modelProviderCredentialValue,
    setModelProviderCredentialValue,
    modelProviderCredentialBusy,
    modelProviderCredentialStatus,
    modelProviderInstallBusy,
    modelProviderInstallStatus,
    modelProviderEndpointInstall,
    modelProviderCredentialSave,
    localRuntimeLifecycleBusyId,
    localRuntimeLifecycleStatus,
    firstRunCapabilityOnboardingDismissed: capabilityOnboardingDismissed,
    firstRunCapabilityOnboardingStarting: capabilityOnboardingStarting,
    voiceArtifactRetention,
    voiceArtifactRetentionLoading,
    voiceArtifactRetentionError,
    voiceArtifactPruning,
    settingsSearchQuery,
    setSettingsSearchQuery,
    voiceSearchQuery,
    setVoiceSearchQuery,
    focusedSettingsSection,
    sttShortcutCapture,
    setSttShortcutCapture,
    voiceSettingsRowRef,
    searchWebSettingsRowRef,
    mcpRuntimeSettingsRowRef,
    startVoiceProviderOnboarding,
    startProviderCatalogCardOnboarding,
    startRemoteSurfaceActivation,
    startFirstRunCapabilityOnboarding,
    dismissFirstRunCapabilityOnboarding,
    resumeFirstRunCapabilityOnboarding,
    loadVoiceArtifactRetention,
    pruneVoiceArtifactRetention,
    saveModelProviderCredentialFromSettings,
    installModelProviderEndpointFromSettings,
    runLocalRuntimeLifecycleActionFromSettings,
  };
}

export type RightPanelSettingsController = ReturnType<typeof useRightPanelSettingsController>;
