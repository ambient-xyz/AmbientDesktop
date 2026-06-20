import { useEffect, useRef, useState } from "react";

import type { AgentMemoryClearResult } from "../../shared/agentMemoryDiagnostics";
import type { AgentMemoryStarterEnableInput, AgentMemoryStarterOperationKind, AgentMemoryStarterOperationResult, AgentMemoryStarterStatus } from "../../shared/agentMemoryStarter";
import type { AgentMemoryMode } from "../../shared/agentMemorySettings";
import type { DesktopState, ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { LocalModelRuntimeLifecycleActionInput, LocalModelRuntimeLifecycleActionResult, VoiceArtifactRetentionSummary, VoiceOnboardingHostFacts } from "../../shared/localRuntimeTypes";
import type { ModelProviderCredentialSaveResult } from "../../shared/pluginTypes";
import type { InstallModelProviderEndpointInput, InstallModelProviderEndpointResult, SaveModelProviderCredentialInput } from "../../shared/threadTypes";
import {
  buildFirstRunCapabilityOnboardingPrompt,
  buildProviderCatalogCardOnboardingPrompt,
  buildRemoteSurfaceActivationPrompt,
  buildVoiceProviderCapabilityPrompt,
  providerCatalogSettingsCardsForArea,
} from "./pluginUiModel";
import type { CapabilityBuilderPromptResult } from "./AppCapabilityPromptActions";
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
  activeThreadMemoryEnabled: boolean;
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
  onRefreshAgentMemoryDiagnostics: () => Promise<void>;
  onApplyMemorySettingsSnapshot: (memory: DesktopState["settings"]["memory"]) => void;
  onClearAgentMemory: () => Promise<AgentMemoryClearResult>;
  onStartCapabilityBuilder: (prompt: string, newChat: boolean, activityLine?: string) => Promise<CapabilityBuilderPromptResult>;
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

function agentMemoryStarterSettingsRefreshKey(settings: DesktopState["settings"]): string {
  const memory = settings.memory;
  const embeddings = memory.embeddings;
  return [
    settings.featureFlags?.tencentDbMemory ?? "default",
    memory.mode,
    memory.enabled,
    memory.defaultThreadEnabled,
    memory.adapter,
    memory.shortTermOffloadEnabled,
    memory.storageScope,
    embeddings.enabled,
    embeddings.providerMode,
    embeddings.providerCapabilityId ?? "",
    embeddings.autoStartProvider,
    embeddings.modelId ?? "",
    embeddings.dimensions ?? "",
    embeddings.sendDimensions,
    embeddings.maxInputChars,
    embeddings.timeoutMs,
    embeddings.preflightEnabled,
  ].join("|");
}

export function agentMemoryStarterEnableInputForMode(
  mode: DesktopState["settings"]["memory"]["mode"],
): AgentMemoryStarterEnableInput {
  if (mode === "disabled") return { enableCurrentThread: true, enableNewThreads: true };
  if (mode === "enabled_all") return { enableCurrentThread: false, enableNewThreads: true };
  return { enableCurrentThread: false, enableNewThreads: false };
}

export function useRightPanelSettingsController({
  panel,
  running,
  activeThreadId,
  activeThreadMemoryEnabled,
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
  onRefreshAgentMemoryDiagnostics,
  onApplyMemorySettingsSnapshot,
  onClearAgentMemory,
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
  const [agentMemoryStarterStatus, setAgentMemoryStarterStatus] = useState<AgentMemoryStarterStatus | undefined>();
  const [agentMemoryStarterLoading, setAgentMemoryStarterLoading] = useState(false);
  const [agentMemoryStarterError, setAgentMemoryStarterError] = useState<string | undefined>();
  const [agentMemoryStarterOperationLoading, setAgentMemoryStarterOperationLoading] = useState<AgentMemoryStarterOperationKind | undefined>();
  const [agentMemoryStarterOperationResult, setAgentMemoryStarterOperationResult] = useState<AgentMemoryStarterOperationResult | undefined>();
  const [agentMemoryClearConfirming, setAgentMemoryClearConfirming] = useState(false);
  const [agentMemoryClearWorkspacePath, setAgentMemoryClearWorkspacePath] = useState<string | undefined>();
  const [agentMemoryClearLoading, setAgentMemoryClearLoading] = useState(false);
  const [agentMemoryClearStatus, setAgentMemoryClearStatus] = useState<{ kind: "success" | "error"; message: string } | undefined>();
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
  const workspacePathRef = useRef(workspacePath);

  const modelProviderEndpointInstall = modelProviderEndpointInstallDraftModel(modelProviderInstallDraft);
  const modelProviderCredentialSave = modelProviderCredentialSaveDraftModel(modelProviderInstallDraft, modelProviderCredentialValue);
  const agentMemoryStarterSettingsKey = agentMemoryStarterSettingsRefreshKey(settings);

  useEffect(() => {
    setVoiceSearchQuery("");
  }, [settings.voice.providerCapabilityId]);

  useEffect(() => {
    workspacePathRef.current = workspacePath;
  }, [workspacePath]);

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

  async function loadAgentMemoryStarterStatus() {
    setAgentMemoryStarterLoading(true);
    setAgentMemoryStarterError(undefined);
    try {
      setAgentMemoryStarterStatus(await window.ambientDesktop.getAgentMemoryStarterStatus());
    } catch (error) {
      setAgentMemoryStarterError(error instanceof Error ? error.message : String(error));
    } finally {
      setAgentMemoryStarterLoading(false);
    }
  }

  function applyAgentMemoryStarterStatus(status: AgentMemoryStarterStatus) {
    setAgentMemoryStarterError(undefined);
    setAgentMemoryStarterStatus(status);
  }

  async function runAgentMemoryStarterOperation(
    operation: AgentMemoryStarterOperationKind,
    targetMode?: AgentMemoryMode,
  ) {
    setAgentMemoryStarterOperationLoading(operation);
    setAgentMemoryStarterError(undefined);
    try {
      const enableInput = agentMemoryStarterEnableInputForMode(targetMode ?? settings.memory.mode);
      const repairInput = {
        enableCurrentThread: false,
        enableNewThreads: settings.memory.mode === "enabled_all",
      };
      const result = operation === "enable"
        ? await window.ambientDesktop.enableAgentMemoryStarter(enableInput)
        : operation === "repair"
          ? await window.ambientDesktop.repairAgentMemoryStarter(repairInput)
          : await window.ambientDesktop.disableAgentMemoryStarter({});
      setAgentMemoryStarterOperationResult(result);
      setAgentMemoryStarterStatus(result.status);
      onApplyMemorySettingsSnapshot(result.status.settings.memory);
      await onRefreshAgentMemoryDiagnostics();
    } catch (error) {
      setAgentMemoryStarterError(error instanceof Error ? error.message : String(error));
    } finally {
      setAgentMemoryStarterOperationLoading((current) => current === operation ? undefined : current);
    }
  }

  function requestAgentMemoryClearFromSettings() {
    setAgentMemoryClearStatus(undefined);
    setAgentMemoryClearWorkspacePath(workspacePath);
    setAgentMemoryClearConfirming(true);
  }

  function cancelAgentMemoryClearFromSettings() {
    if (agentMemoryClearLoading) return;
    setAgentMemoryClearConfirming(false);
    setAgentMemoryClearWorkspacePath(undefined);
  }

  async function confirmAgentMemoryClearFromSettings() {
    if (agentMemoryClearLoading) return;
    const confirmedWorkspacePath = agentMemoryClearWorkspacePath;
    if (!confirmedWorkspacePath || confirmedWorkspacePath !== workspacePath) {
      setAgentMemoryClearConfirming(false);
      setAgentMemoryClearWorkspacePath(undefined);
      setAgentMemoryClearStatus({
        kind: "error",
        message: "Agent Memory clear confirmation expired because the active workspace changed. Review this workspace and try again.",
      });
      return;
    }
    setAgentMemoryClearLoading(true);
    setAgentMemoryClearStatus(undefined);
    try {
      const result = await onClearAgentMemory();
      if (workspacePathRef.current !== confirmedWorkspacePath) {
        setAgentMemoryClearConfirming(false);
        setAgentMemoryClearWorkspacePath(undefined);
        return;
      }
      await onRefreshAgentMemoryDiagnostics();
      if (workspacePathRef.current !== confirmedWorkspacePath) {
        setAgentMemoryClearConfirming(false);
        setAgentMemoryClearWorkspacePath(undefined);
        return;
      }
      await loadAgentMemoryStarterStatus();
      if (workspacePathRef.current !== confirmedWorkspacePath) {
        setAgentMemoryClearConfirming(false);
        setAgentMemoryClearWorkspacePath(undefined);
        return;
      }
      setAgentMemoryClearConfirming(false);
      setAgentMemoryClearWorkspacePath(undefined);
      setAgentMemoryClearStatus({
        kind: "success",
        message: `Cleared ${result.removedFileCount.toLocaleString()} Agent Memory files and reset ${result.activeSessionsReset.disposedSessions.toLocaleString()} active sessions.`,
      });
    } catch (error) {
      if (workspacePathRef.current !== confirmedWorkspacePath) {
        setAgentMemoryClearConfirming(false);
        setAgentMemoryClearWorkspacePath(undefined);
        return;
      }
      setAgentMemoryClearStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setAgentMemoryClearLoading(false);
    }
  }

  useEffect(() => {
    if (!agentMemoryClearConfirming) return;
    if (panel === "settings" && agentMemoryClearWorkspacePath === workspacePath) return;
    setAgentMemoryClearConfirming(false);
    setAgentMemoryClearWorkspacePath(undefined);
  }, [agentMemoryClearConfirming, agentMemoryClearWorkspacePath, panel, workspacePath]);

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
    if (panel === "settings") void loadAgentMemoryStarterStatus();
  }, [panel, workspacePath, activeThreadId, activeThreadMemoryEnabled, agentMemoryStarterSettingsKey]);

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
    agentMemoryStarterStatus,
    agentMemoryStarterLoading,
    agentMemoryStarterError,
    agentMemoryStarterOperationLoading,
    agentMemoryStarterOperationResult,
    agentMemoryClearConfirming,
    agentMemoryClearLoading,
    agentMemoryClearStatus,
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
    loadAgentMemoryStarterStatus,
    applyAgentMemoryStarterStatus,
    enableAgentMemoryStarterFromSettings: (targetMode?: AgentMemoryMode) => runAgentMemoryStarterOperation("enable", targetMode),
    repairAgentMemoryStarterFromSettings: () => runAgentMemoryStarterOperation("repair"),
    disableAgentMemoryStarterFromSettings: () => runAgentMemoryStarterOperation("disable"),
    requestAgentMemoryClearFromSettings,
    cancelAgentMemoryClearFromSettings,
    confirmAgentMemoryClearFromSettings,
    saveModelProviderCredentialFromSettings,
    installModelProviderEndpointFromSettings,
    runLocalRuntimeLifecycleActionFromSettings,
  };
}

export type RightPanelSettingsController = ReturnType<typeof useRightPanelSettingsController>;
