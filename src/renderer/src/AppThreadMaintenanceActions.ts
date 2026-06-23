import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { DiagnosticExportResult } from "../../shared/diagnosticTypes";
import type { ChatMessage, ExportChatPdfInput, ExportChatPdfResult, ExportChatResult, RunStatus } from "../../shared/threadTypes";
import type { ApiKeyStatus } from "./RightPanel";
import { chatExportStatusMessage } from "./AutomationsWorkspace";
import type { createAppComposerRetryActions } from "./AppComposerRetryActions";
import type { useAppConversationDisplayModel } from "./AppConversationDisplayModel";
import type { useAppCoreLifecycleControlsForApp } from "./AppCoreLifecycleControls";
import type { createAppDesktopStateAppliers } from "./AppDesktopStateAppliers";
import type { createAppNavigationActionsForApp } from "./AppNavigationActions";
import type { useAppRunActivityState } from "./AppRunActivityState";
import type { useAppShellUiState } from "./AppShellUiState";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";

export const COMPACT_CONTEXT_ACTIVITY = "Compacting context.";
export const RECOVER_CONTEXT_ACTIVITY = "Rebuilding model context from the visible transcript.";
export const EXPORT_CHAT_CANCELED_STATUS: ApiKeyStatus = { kind: "info", message: "Export canceled." };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function desktopStateWithContextUsage(
  state: DesktopState,
  contextUsage: DesktopState["contextUsage"],
): DesktopState {
  return { ...state, contextUsage };
}

export function threadRunStatusesWithStatus(
  statuses: Record<string, RunStatus>,
  threadId: string,
  status: RunStatus,
): Record<string, RunStatus> {
  return { ...statuses, [threadId]: status };
}

export function canStartActiveThreadMaintenance({
  busy = false,
  running,
  state,
}: {
  busy?: boolean;
  running: boolean;
  state: Pick<DesktopState, "activeThreadId"> | undefined;
}): boolean {
  return Boolean(state?.activeThreadId && !running && !busy);
}

export function chatPdfExportStatusMessage(result: ExportChatPdfResult): string {
  const fileName = result.path.split(/[\\/]/).pop() || result.path;
  return `Exported visible transcript PDF: ${fileName}`;
}

export interface AppThreadMaintenanceActionsOptions {
  applyProjectActionState: (next: DesktopState) => void;
  chatExportBusy: boolean;
  contextRecoveryBusy: boolean;
  latestRecoveryPrompt: ChatMessage | undefined;
  projectIdForWorkspacePath: (workspacePath: string) => string;
  resetRunActivityLines: (initialText?: string, threadId?: string) => void;
  retryFailedPrompt: (message: ChatMessage) => Promise<void>;
  running: boolean;
  setChatExportBusy: Dispatch<SetStateAction<boolean>>;
  setChatExportStatus: Dispatch<SetStateAction<ApiKeyStatus | undefined>>;
  setContextRecoveryBusy: Dispatch<SetStateAction<boolean>>;
  setError: (message: string | undefined) => void;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  setThreadRunStatuses: Dispatch<SetStateAction<Record<string, RunStatus>>>;
  state: DesktopState | undefined;
}

export type AppThreadMaintenanceActions = {
  compactActiveThread: (customInstructions?: string) => Promise<void>;
  duplicateActiveThreadFromTranscript: () => Promise<void>;
  exportActiveChat: () => Promise<ExportChatResult | undefined>;
  exportChatPdfThread: (input: ExportChatPdfInput | undefined) => Promise<ExportChatPdfResult | undefined>;
  exportChatThread: (threadId: string | undefined) => Promise<ExportChatResult | undefined>;
  exportDiagnostics: () => Promise<DiagnosticExportResult | undefined>;
  importDiagnostics: () => Promise<DiagnosticExportResult | undefined>;
  recoverActiveThreadContext: () => Promise<boolean>;
  recoverActiveThreadContextAndRetryLatest: () => Promise<void>;
};

type AppComposerRetryActionsForThreadMaintenanceActions = Pick<
  ReturnType<typeof createAppComposerRetryActions>,
  "retryFailedPrompt"
>;

type AppConversationDisplayModelForThreadMaintenanceActions = Pick<
  ReturnType<typeof useAppConversationDisplayModel>,
  "latestRecoveryPrompt"
>;

type AppCoreLifecycleControlsForThreadMaintenanceActions = Pick<
  ReturnType<typeof useAppCoreLifecycleControlsForApp>,
  "resetRunActivityLines"
>;

type AppDesktopStateAppliersForThreadMaintenanceActions = Pick<
  ReturnType<typeof createAppDesktopStateAppliers>,
  "applyProjectActionState"
>;

type AppNavigationActionsForThreadMaintenanceActions = Pick<
  ReturnType<typeof createAppNavigationActionsForApp>,
  "projectIdForWorkspacePath"
>;

type AppRunActivityStateForThreadMaintenanceActions = Pick<
  ReturnType<typeof useAppRunActivityState>,
  "setRunStatus" | "setThreadRunStatuses"
>;

type AppShellUiStateForThreadMaintenanceActions = Pick<
  ReturnType<typeof useAppShellUiState>,
  "setError"
>;

type AppWorkflowRuntimeStateForThreadMaintenanceActions = Pick<
  ReturnType<typeof useAppWorkflowRuntimeState>,
  | "chatExportBusy"
  | "contextRecoveryBusy"
  | "setChatExportBusy"
  | "setChatExportStatus"
  | "setContextRecoveryBusy"
>;

export type AppThreadMaintenanceActionsForAppInput = {
  appDesktopStateAppliers: AppDesktopStateAppliersForThreadMaintenanceActions;
  composerRetryActions: AppComposerRetryActionsForThreadMaintenanceActions;
  conversationDisplayModel: AppConversationDisplayModelForThreadMaintenanceActions;
  coreLifecycleControls: AppCoreLifecycleControlsForThreadMaintenanceActions;
  navigationActions: AppNavigationActionsForThreadMaintenanceActions;
  runActivityState: AppRunActivityStateForThreadMaintenanceActions;
  running: boolean;
  setState: AppThreadMaintenanceActionsOptions["setState"];
  shellUiState: AppShellUiStateForThreadMaintenanceActions;
  state: DesktopState | undefined;
  workflowRuntimeState: AppWorkflowRuntimeStateForThreadMaintenanceActions;
};

export function createAppThreadMaintenanceActionsForApp({
  appDesktopStateAppliers,
  composerRetryActions,
  conversationDisplayModel,
  coreLifecycleControls,
  navigationActions,
  runActivityState,
  running,
  setState,
  shellUiState,
  state,
  workflowRuntimeState,
}: AppThreadMaintenanceActionsForAppInput): AppThreadMaintenanceActions {
  return createAppThreadMaintenanceActions({
    applyProjectActionState: appDesktopStateAppliers.applyProjectActionState,
    chatExportBusy: workflowRuntimeState.chatExportBusy,
    contextRecoveryBusy: workflowRuntimeState.contextRecoveryBusy,
    latestRecoveryPrompt: conversationDisplayModel.latestRecoveryPrompt,
    projectIdForWorkspacePath: navigationActions.projectIdForWorkspacePath,
    resetRunActivityLines: coreLifecycleControls.resetRunActivityLines,
    retryFailedPrompt: composerRetryActions.retryFailedPrompt,
    running,
    setChatExportBusy: workflowRuntimeState.setChatExportBusy,
    setChatExportStatus: workflowRuntimeState.setChatExportStatus,
    setContextRecoveryBusy: workflowRuntimeState.setContextRecoveryBusy,
    setError: shellUiState.setError,
    setRunStatus: runActivityState.setRunStatus,
    setState,
    setThreadRunStatuses: runActivityState.setThreadRunStatuses,
    state,
  });
}

export function createAppThreadMaintenanceActions({
  applyProjectActionState,
  chatExportBusy,
  contextRecoveryBusy,
  latestRecoveryPrompt,
  projectIdForWorkspacePath,
  resetRunActivityLines,
  retryFailedPrompt,
  running,
  setChatExportBusy,
  setChatExportStatus,
  setContextRecoveryBusy,
  setError,
  setRunStatus,
  setState,
  setThreadRunStatuses,
  state,
}: AppThreadMaintenanceActionsOptions): AppThreadMaintenanceActions {
  async function exportDiagnostics(): Promise<DiagnosticExportResult | undefined> {
    setError(undefined);
    return window.ambientDesktop.exportDiagnosticBundle();
  }

  async function importDiagnostics(): Promise<DiagnosticExportResult | undefined> {
    setError(undefined);
    return window.ambientDesktop.importDiagnosticBundle();
  }

  async function exportChatThread(threadId: string | undefined): Promise<ExportChatResult | undefined> {
    if (!threadId || chatExportBusy) return undefined;
    setError(undefined);
    setChatExportStatus(undefined);
    setChatExportBusy(true);
    try {
      const result = await window.ambientDesktop.exportChat({ threadId });
      if (!result) {
        setChatExportStatus(EXPORT_CHAT_CANCELED_STATUS);
        return undefined;
      }
      setChatExportStatus({ kind: "success", message: chatExportStatusMessage(result) });
      return result;
    } catch (error) {
      const message = errorMessage(error);
      setChatExportStatus({ kind: "error", message });
      setError(message);
      return undefined;
    } finally {
      setChatExportBusy(false);
    }
  }

  async function exportChatPdfThread(input: ExportChatPdfInput | undefined): Promise<ExportChatPdfResult | undefined> {
    if (!input?.threadId || chatExportBusy) return undefined;
    setError(undefined);
    setChatExportStatus(undefined);
    setChatExportBusy(true);
    try {
      const result = await window.ambientDesktop.exportChatPdf(input);
      if (!result) {
        setChatExportStatus(EXPORT_CHAT_CANCELED_STATUS);
        return undefined;
      }
      setChatExportStatus({ kind: "success", message: chatPdfExportStatusMessage(result) });
      return result;
    } catch (error) {
      const message = errorMessage(error);
      setChatExportStatus({ kind: "error", message });
      setError(message);
      return undefined;
    } finally {
      setChatExportBusy(false);
    }
  }

  async function exportActiveChat(): Promise<ExportChatResult | undefined> {
    return exportChatThread(state?.activeThreadId);
  }

  async function compactActiveThread(customInstructions?: string): Promise<void> {
    const currentState = state;
    if (!currentState || !canStartActiveThreadMaintenance({ state: currentState, running })) return;
    const threadId = currentState.activeThreadId;
    setError(undefined);
    setRunStatus("compacting");
    setThreadRunStatuses((statuses) => threadRunStatusesWithStatus(statuses, threadId, "compacting"));
    resetRunActivityLines(COMPACT_CONTEXT_ACTIVITY);
    try {
      const snapshot = await window.ambientDesktop.compactThread({
        threadId,
        customInstructions,
      });
      setState((current) => (current ? desktopStateWithContextUsage(current, snapshot) : current));
    } catch (error) {
      setError(errorMessage(error));
      setRunStatus("error");
    }
  }

  async function recoverActiveThreadContext(): Promise<boolean> {
    const currentState = state;
    if (!currentState || !canStartActiveThreadMaintenance({ state: currentState, running, busy: contextRecoveryBusy })) return false;
    const threadId = currentState.activeThreadId;
    setContextRecoveryBusy(true);
    setError(undefined);
    resetRunActivityLines(RECOVER_CONTEXT_ACTIVITY);
    try {
      const snapshot = await window.ambientDesktop.recoverThreadContext({
        threadId,
        reason: currentState.contextUsage?.diagnostics?.message,
      });
      setState((current) => (current ? desktopStateWithContextUsage(current, snapshot) : current));
      return true;
    } catch (error) {
      setError(errorMessage(error));
      return false;
    } finally {
      setContextRecoveryBusy(false);
    }
  }

  async function recoverActiveThreadContextAndRetryLatest(): Promise<void> {
    if (!latestRecoveryPrompt || running || contextRecoveryBusy) return;
    const recovered = await recoverActiveThreadContext();
    if (recovered) await retryFailedPrompt(latestRecoveryPrompt);
  }

  async function duplicateActiveThreadFromTranscript(): Promise<void> {
    if (!state || running) return;
    setError(undefined);
    try {
      applyProjectActionState(
        await window.ambientDesktop.forkThread({
          threadId: state.activeThreadId,
          projectId: projectIdForWorkspacePath(state.workspace.path),
          mode: "local",
        }),
      );
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  return {
    compactActiveThread,
    duplicateActiveThreadFromTranscript,
    exportActiveChat,
    exportChatPdfThread,
    exportChatThread,
    exportDiagnostics,
    importDiagnostics,
    recoverActiveThreadContext,
    recoverActiveThreadContextAndRetryLatest,
  };
}
