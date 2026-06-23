import { useEffect, useRef, useState } from "react";

import type { AgentMemoryClearResult } from "../../shared/agentMemoryDiagnostics";
import type {
  AgentMemoryStarterEnableInput,
  AgentMemoryStarterOperationKind,
  AgentMemoryStarterOperationResult,
  AgentMemoryStarterStatus,
} from "../../shared/agentMemoryStarter";
import type { AgentMemoryMode } from "../../shared/agentMemorySettings";
import type { DesktopState } from "../../shared/desktopTypes";

type UseRightPanelSettingsAgentMemoryControllerInput = {
  panel: string;
  activeThreadId: string;
  activeThreadMemoryEnabled: boolean;
  workspacePath: string;
  settings: DesktopState["settings"];
  onRefreshAgentMemoryDiagnostics: () => Promise<void>;
  onApplyMemorySettingsSnapshot: (memory: DesktopState["settings"]["memory"]) => void;
  onClearAgentMemory: () => Promise<AgentMemoryClearResult>;
};

export function agentMemoryStarterSettingsRefreshKey(settings: DesktopState["settings"]): string {
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

export function useRightPanelSettingsAgentMemoryController({
  panel,
  activeThreadId,
  activeThreadMemoryEnabled,
  workspacePath,
  settings,
  onRefreshAgentMemoryDiagnostics,
  onApplyMemorySettingsSnapshot,
  onClearAgentMemory,
}: UseRightPanelSettingsAgentMemoryControllerInput) {
  const [agentMemoryStarterStatus, setAgentMemoryStarterStatus] = useState<AgentMemoryStarterStatus | undefined>();
  const [agentMemoryStarterLoading, setAgentMemoryStarterLoading] = useState(false);
  const [agentMemoryStarterError, setAgentMemoryStarterError] = useState<string | undefined>();
  const [agentMemoryStarterOperationLoading, setAgentMemoryStarterOperationLoading] =
    useState<AgentMemoryStarterOperationKind | undefined>();
  const [agentMemoryStarterOperationResult, setAgentMemoryStarterOperationResult] =
    useState<AgentMemoryStarterOperationResult | undefined>();
  const [agentMemoryClearConfirming, setAgentMemoryClearConfirming] = useState(false);
  const [agentMemoryClearWorkspacePath, setAgentMemoryClearWorkspacePath] = useState<string | undefined>();
  const [agentMemoryClearLoading, setAgentMemoryClearLoading] = useState(false);
  const [agentMemoryClearStatus, setAgentMemoryClearStatus] = useState<
    { kind: "success" | "error"; message: string } | undefined
  >();
  const workspacePathRef = useRef(workspacePath);
  const agentMemoryStarterSettingsKey = agentMemoryStarterSettingsRefreshKey(settings);

  useEffect(() => {
    workspacePathRef.current = workspacePath;
  }, [workspacePath]);

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
      const result =
        operation === "enable"
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
      setAgentMemoryStarterOperationLoading((current) => (current === operation ? undefined : current));
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
    if (panel === "settings") void loadAgentMemoryStarterStatus();
  }, [panel, workspacePath, activeThreadId, activeThreadMemoryEnabled, agentMemoryStarterSettingsKey]);

  return {
    agentMemoryStarterStatus,
    agentMemoryStarterLoading,
    agentMemoryStarterError,
    agentMemoryStarterOperationLoading,
    agentMemoryStarterOperationResult,
    agentMemoryClearConfirming,
    agentMemoryClearLoading,
    agentMemoryClearStatus,
    loadAgentMemoryStarterStatus,
    applyAgentMemoryStarterStatus,
    enableAgentMemoryStarterFromSettings: (targetMode?: AgentMemoryMode) =>
      runAgentMemoryStarterOperation("enable", targetMode),
    repairAgentMemoryStarterFromSettings: () => runAgentMemoryStarterOperation("repair"),
    disableAgentMemoryStarterFromSettings: () => runAgentMemoryStarterOperation("disable"),
    requestAgentMemoryClearFromSettings,
    cancelAgentMemoryClearFromSettings,
    confirmAgentMemoryClearFromSettings,
  };
}
