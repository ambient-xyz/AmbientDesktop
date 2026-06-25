import { useEffect, useState } from "react";

import type { AgentMemoryClearResult } from "../../shared/agentMemoryDiagnostics";
import type { DesktopState, ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { LocalModelRuntimeLifecycleActionInput, LocalModelRuntimeLifecycleActionResult } from "../../shared/localRuntimeTypes";
import type { ModelProviderCredentialSaveResult } from "../../shared/pluginTypes";
import type {
  InstallModelProviderEndpointInput,
  InstallModelProviderEndpointResult,
  SaveModelProviderCredentialInput,
} from "../../shared/threadTypes";
import type { CapabilityBuilderPromptResult } from "./AppCapabilityPromptActions";
import {
  emptyModelProviderEndpointInstallDraft,
  modelProviderCredentialSaveDraftModel,
  modelProviderCredentialSaveInputFromDraft,
  modelProviderEndpointInstallDraftModel,
  type ModelProviderEndpointInstallDraft,
} from "./modelProviderOnboardingUiModel";
import type { ModelRuntimeCatalogRuntimeAction, ModelRuntimeCatalogRuntimeRow } from "./modelRuntimeCatalogUiModel";
import { useRightPanelSettingsAgentMemoryController } from "./RightPanelSettingsAgentMemoryController";
import { firstLine, localRuntimeLifecycleResultStatusKind, type ApiKeyStatus } from "./RightPanelSettingsRuntime";
import {
  useRightPanelSettingsVoiceFocusController,
  type SettingsFocusRequest,
  type SettingsMcpController,
} from "./RightPanelSettingsVoiceFocusController";
import { shortcutFromKeyboardEvent } from "./sttShortcut";

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

export { agentMemoryStarterEnableInputForMode } from "./RightPanelSettingsAgentMemoryController";

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
  const [modelProviderInstallDraft, setModelProviderInstallDraft] = useState<ModelProviderEndpointInstallDraft>(() =>
    emptyModelProviderEndpointInstallDraft(),
  );
  const [modelProviderCredentialValue, setModelProviderCredentialValue] = useState("");
  const [modelProviderCredentialBusy, setModelProviderCredentialBusy] = useState(false);
  const [modelProviderCredentialStatus, setModelProviderCredentialStatus] = useState<ApiKeyStatus | undefined>();
  const [modelProviderInstallBusy, setModelProviderInstallBusy] = useState(false);
  const [modelProviderInstallStatus, setModelProviderInstallStatus] = useState<ApiKeyStatus | undefined>();
  const [localRuntimeLifecycleBusyId, setLocalRuntimeLifecycleBusyId] = useState<string | undefined>();
  const [localRuntimeLifecycleStatus, setLocalRuntimeLifecycleStatus] = useState<ApiKeyStatus | undefined>();
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [sttShortcutCapture, setSttShortcutCapture] = useState(false);

  const modelProviderEndpointInstall = modelProviderEndpointInstallDraftModel(modelProviderInstallDraft);
  const modelProviderCredentialSave = modelProviderCredentialSaveDraftModel(modelProviderInstallDraft, modelProviderCredentialValue);
  const agentMemorySettingsController = useRightPanelSettingsAgentMemoryController({
    panel,
    activeThreadId,
    activeThreadMemoryEnabled,
    workspacePath,
    settings,
    onRefreshAgentMemoryDiagnostics,
    onApplyMemorySettingsSnapshot,
    onClearAgentMemory,
  });
  const voiceFocusController = useRightPanelSettingsVoiceFocusController({
    panel,
    running,
    activeThreadId,
    activeWorkspacePath,
    workspacePath,
    permissionAuditRevision,
    voiceProviderCapabilityId: settings.voice.providerCapabilityId,
    providerCatalogCards,
    settingsFocusRequest,
    mcp,
    onLoadPermissionAudit,
    onLoadPermissionGrants,
    onLoadVoiceProviders,
    onStartCapabilityBuilder,
    onHydrateSearchRoutingSettings,
  });

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

  async function saveModelProviderCredentialFromSettings() {
    const input = modelProviderCredentialSaveInputFromDraft(modelProviderInstallDraft, modelProviderCredentialValue);
    if (!input) {
      setModelProviderCredentialStatus({
        kind: "error",
        message: modelProviderCredentialSave.validationRows[0] ?? "Credential save input is incomplete.",
      });
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
      setModelProviderInstallStatus({
        kind: "error",
        message: modelProviderEndpointInstall.validationRows[0] ?? "Endpoint probe input is incomplete.",
      });
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

  async function runLocalRuntimeLifecycleActionFromSettings(row: ModelRuntimeCatalogRuntimeRow, action: ModelRuntimeCatalogRuntimeAction) {
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
      setLocalRuntimeLifecycleBusyId((current) => (current === busyId ? undefined : current));
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
    ...agentMemorySettingsController,
    ...voiceFocusController,
    settingsSearchQuery,
    setSettingsSearchQuery,
    sttShortcutCapture,
    setSttShortcutCapture,
    saveModelProviderCredentialFromSettings,
    installModelProviderEndpointFromSettings,
    runLocalRuntimeLifecycleActionFromSettings,
  };
}

export type RightPanelSettingsController = ReturnType<typeof useRightPanelSettingsController>;
