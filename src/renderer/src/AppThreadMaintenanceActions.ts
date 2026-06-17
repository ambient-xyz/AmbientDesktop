import type { Dispatch, SetStateAction } from "react";

import type {
  ChatMessage,
  DesktopState,
  DiagnosticExportResult,
  ExportChatPdfInput,
  ExportChatPdfResult,
  ExportChatResult,
  RunStatus,
} from "../../shared/types";
import type { ApiKeyStatus } from "./RightPanel";
import { chatExportStatusMessage } from "./AutomationsWorkspace";

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
}: {
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
}): {
  compactActiveThread: (customInstructions?: string) => Promise<void>;
  duplicateActiveThreadFromTranscript: () => Promise<void>;
  exportActiveChat: () => Promise<ExportChatResult | undefined>;
  exportChatPdfThread: (input: ExportChatPdfInput | undefined) => Promise<ExportChatPdfResult | undefined>;
  exportChatThread: (threadId: string | undefined) => Promise<ExportChatResult | undefined>;
  exportDiagnostics: () => Promise<DiagnosticExportResult | undefined>;
  importDiagnostics: () => Promise<DiagnosticExportResult | undefined>;
  recoverActiveThreadContext: () => Promise<boolean>;
  recoverActiveThreadContextAndRetryLatest: () => Promise<void>;
} {
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
