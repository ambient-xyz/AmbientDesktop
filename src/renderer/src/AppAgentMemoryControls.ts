import { useEffect, useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";

import type {
  AgentMemoryEmbeddingLifecycleActionKind,
  AgentMemoryEmbeddingLifecycleActionResult,
  AgentMemoryStorageDiagnostics,
} from "../../shared/agentMemoryDiagnostics";
import type { DesktopState } from "../../shared/desktopTypes";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import type { UtilityPanel } from "./RightPanel";

interface AgentMemoryDiagnosticsRefreshKeyInput {
  activeThreadMemoryEnabled: boolean;
  state: DesktopState | undefined;
}

export function agentMemoryDiagnosticsRefreshKeyForState({
  activeThreadMemoryEnabled,
  state,
}: AgentMemoryDiagnosticsRefreshKeyInput): string {
  if (!state) return "";
  return [
    state.workspace.path,
    state.activeThreadId,
    activeThreadMemoryEnabled,
    state.settings.featureFlags.tencentDbMemory ?? "default",
    state.settings.memory.mode,
    state.settings.memory.enabled,
    state.settings.memory.defaultThreadEnabled,
    state.settings.memory.shortTermOffloadEnabled,
    state.settings.memory.storageScope,
    state.settings.memory.embeddings.enabled,
    state.settings.memory.embeddings.providerMode,
    state.settings.memory.embeddings.providerCapabilityId ?? "",
    state.settings.memory.embeddings.autoStartProvider,
    state.settings.memory.embeddings.sendDimensions,
    state.settings.memory.embeddings.maxInputChars,
    state.settings.memory.embeddings.timeoutMs,
  ].join("\u001f");
}

export interface AppAgentMemoryControls {
  refreshAgentMemoryDiagnostics: () => Promise<void>;
  runAgentMemoryEmbeddingLifecycleAction: (
    action: AgentMemoryEmbeddingLifecycleActionKind,
  ) => Promise<AgentMemoryEmbeddingLifecycleActionResult | undefined>;
}

export interface AppAgentMemoryControlsInput {
  agentMemoryDiagnosticsRequestSeqRef: RefObject<number>;
  setAgentMemoryDiagnostics: Dispatch<SetStateAction<AgentMemoryStorageDiagnostics | undefined>>;
  setAgentMemoryDiagnosticsError: Dispatch<SetStateAction<string | undefined>>;
  setAgentMemoryDiagnosticsLoading: Dispatch<SetStateAction<boolean>>;
  setAgentMemoryEmbeddingActionError: Dispatch<SetStateAction<string | undefined>>;
  setAgentMemoryEmbeddingActionLoading: Dispatch<SetStateAction<AgentMemoryEmbeddingLifecycleActionKind | undefined>>;
  setAgentMemoryEmbeddingActionResult: Dispatch<SetStateAction<AgentMemoryEmbeddingLifecycleActionResult | undefined>>;
}

type AppAgentMemoryRuntimeStateInput = Pick<
  ReturnType<typeof useAppProviderRuntimeState>,
  | "agentMemoryDiagnosticsRequestSeqRef"
  | "setAgentMemoryDiagnostics"
  | "setAgentMemoryDiagnosticsError"
  | "setAgentMemoryDiagnosticsLoading"
  | "setAgentMemoryEmbeddingActionError"
  | "setAgentMemoryEmbeddingActionLoading"
  | "setAgentMemoryEmbeddingActionResult"
>;

export interface AppAgentMemoryPanelControlsInput {
  activeThreadMemoryEnabled: boolean;
  panel: UtilityPanel | undefined;
  providerRuntimeState: AppAgentMemoryRuntimeStateInput;
  state: DesktopState | undefined;
}

export function useAppAgentMemoryPanelControls({
  activeThreadMemoryEnabled,
  panel,
  providerRuntimeState,
  state,
}: AppAgentMemoryPanelControlsInput): AppAgentMemoryControls {
  const controls = useMemo(
    () =>
      createAppAgentMemoryControls({
        agentMemoryDiagnosticsRequestSeqRef: providerRuntimeState.agentMemoryDiagnosticsRequestSeqRef,
        setAgentMemoryDiagnostics: providerRuntimeState.setAgentMemoryDiagnostics,
        setAgentMemoryDiagnosticsError: providerRuntimeState.setAgentMemoryDiagnosticsError,
        setAgentMemoryDiagnosticsLoading: providerRuntimeState.setAgentMemoryDiagnosticsLoading,
        setAgentMemoryEmbeddingActionError: providerRuntimeState.setAgentMemoryEmbeddingActionError,
        setAgentMemoryEmbeddingActionLoading: providerRuntimeState.setAgentMemoryEmbeddingActionLoading,
        setAgentMemoryEmbeddingActionResult: providerRuntimeState.setAgentMemoryEmbeddingActionResult,
      }),
    [
      providerRuntimeState.agentMemoryDiagnosticsRequestSeqRef,
      providerRuntimeState.setAgentMemoryDiagnostics,
      providerRuntimeState.setAgentMemoryDiagnosticsError,
      providerRuntimeState.setAgentMemoryDiagnosticsLoading,
      providerRuntimeState.setAgentMemoryEmbeddingActionError,
      providerRuntimeState.setAgentMemoryEmbeddingActionLoading,
      providerRuntimeState.setAgentMemoryEmbeddingActionResult,
    ],
  );

  const diagnosticsRefreshKey = agentMemoryDiagnosticsRefreshKeyForState({
    activeThreadMemoryEnabled,
    state,
  });

  useEffect(() => {
    if (panel !== "settings" || !state) return;
    void controls.refreshAgentMemoryDiagnostics();
  }, [panel, diagnosticsRefreshKey, controls, state]);

  return controls;
}

export function createAppAgentMemoryControls({
  agentMemoryDiagnosticsRequestSeqRef,
  setAgentMemoryDiagnostics,
  setAgentMemoryDiagnosticsError,
  setAgentMemoryDiagnosticsLoading,
  setAgentMemoryEmbeddingActionError,
  setAgentMemoryEmbeddingActionLoading,
  setAgentMemoryEmbeddingActionResult,
}: AppAgentMemoryControlsInput): AppAgentMemoryControls {
  async function refreshAgentMemoryDiagnostics(): Promise<void> {
    const requestId = agentMemoryDiagnosticsRequestSeqRef.current + 1;
    agentMemoryDiagnosticsRequestSeqRef.current = requestId;
    setAgentMemoryDiagnosticsError(undefined);
    setAgentMemoryDiagnosticsLoading(true);
    try {
      const diagnostics = await window.ambientDesktop.getAgentMemoryDiagnostics();
      if (requestId !== agentMemoryDiagnosticsRequestSeqRef.current) return;
      setAgentMemoryDiagnostics(diagnostics);
    } catch (err) {
      if (requestId !== agentMemoryDiagnosticsRequestSeqRef.current) return;
      setAgentMemoryDiagnosticsError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestId === agentMemoryDiagnosticsRequestSeqRef.current) {
        setAgentMemoryDiagnosticsLoading(false);
      }
    }
  }

  async function runAgentMemoryEmbeddingLifecycleAction(
    action: AgentMemoryEmbeddingLifecycleActionKind,
  ): Promise<AgentMemoryEmbeddingLifecycleActionResult | undefined> {
    setAgentMemoryEmbeddingActionError(undefined);
    setAgentMemoryEmbeddingActionLoading(action);
    try {
      const result = await window.ambientDesktop.runAgentMemoryEmbeddingLifecycleAction({ action });
      setAgentMemoryEmbeddingActionResult(result);
      agentMemoryDiagnosticsRequestSeqRef.current += 1;
      setAgentMemoryDiagnosticsLoading(false);
      setAgentMemoryDiagnostics(result.diagnostics);
      return result;
    } catch (err) {
      setAgentMemoryEmbeddingActionError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setAgentMemoryEmbeddingActionLoading(undefined);
    }
  }

  return {
    refreshAgentMemoryDiagnostics,
    runAgentMemoryEmbeddingLifecycleAction,
  };
}
