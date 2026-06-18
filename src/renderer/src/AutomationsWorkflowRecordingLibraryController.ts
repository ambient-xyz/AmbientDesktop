import { useState } from "react";

import type { ExportChatResult } from "../../shared/threadTypes";
import type { WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import type { ApiKeyStatus } from "./RightPanel";

export type WorkflowRecordingExportChat = (input: { threadId: string }) => Promise<ExportChatResult | undefined>;

export function chatExportStatusMessage(result: ExportChatResult): string {
  const sourceLabel = result.source === "pi-session" ? "Pi session" : "visible transcript fallback";
  const fileName = result.path.split(/[\\/]/).pop() || result.path;
  return `Exported ${sourceLabel}: ${fileName}`;
}

export function workflowRecordingMissingThreadExportStatus(): ApiKeyStatus {
  return {
    kind: "error",
    message: "This saved playbook does not reference a source chat thread to export.",
  };
}

export function workflowRecordingExportResultStatus(result: ExportChatResult | undefined): ApiKeyStatus {
  return result
    ? { kind: "success", message: chatExportStatusMessage(result) }
    : { kind: "info", message: "Export canceled." };
}

export function workflowRecordingExportErrorStatus(error: unknown): ApiKeyStatus {
  return { kind: "error", message: error instanceof Error ? error.message : String(error) };
}

function defaultWorkflowRecordingExportChat(input: { threadId: string }): Promise<ExportChatResult | undefined> {
  return window.ambientDesktop.exportChat(input);
}

export function useAutomationsWorkflowRecordingLibraryController({
  onRefreshWorkflowRecordingLibrary,
  onWorkflowErrorChanged,
  exportChat = defaultWorkflowRecordingExportChat,
}: {
  onRefreshWorkflowRecordingLibrary: () => Promise<void>;
  onWorkflowErrorChanged: (error: string | undefined) => void;
  exportChat?: WorkflowRecordingExportChat;
}) {
  const [workflowRecordingExportStatus, setWorkflowRecordingExportStatus] = useState<ApiKeyStatus | undefined>();
  const [workflowRecordingExportBusyThreadId, setWorkflowRecordingExportBusyThreadId] = useState<string | undefined>();
  const [workflowLibraryQuery, setWorkflowLibraryQuery] = useState("");
  const [workflowLibraryRefreshing, setWorkflowLibraryRefreshing] = useState(false);

  async function refreshWorkflowRecordingLibraryFromHome(): Promise<void> {
    if (workflowLibraryRefreshing) return;
    setWorkflowLibraryRefreshing(true);
    onWorkflowErrorChanged(undefined);
    try {
      await onRefreshWorkflowRecordingLibrary();
    } catch (error) {
      onWorkflowErrorChanged(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkflowLibraryRefreshing(false);
    }
  }

  async function exportWorkflowRecordingPlaybookSession(playbook: WorkflowRecordingLibraryEntry): Promise<void> {
    if (workflowRecordingExportBusyThreadId) return;
    if (!playbook.threadId) {
      setWorkflowRecordingExportStatus(workflowRecordingMissingThreadExportStatus());
      return;
    }
    onWorkflowErrorChanged(undefined);
    setWorkflowRecordingExportStatus(undefined);
    setWorkflowRecordingExportBusyThreadId(playbook.threadId);
    try {
      setWorkflowRecordingExportStatus(workflowRecordingExportResultStatus(await exportChat({ threadId: playbook.threadId })));
    } catch (error) {
      setWorkflowRecordingExportStatus(workflowRecordingExportErrorStatus(error));
    } finally {
      setWorkflowRecordingExportBusyThreadId(undefined);
    }
  }

  return {
    workflowLibraryQuery,
    setWorkflowLibraryQuery,
    workflowLibraryRefreshing,
    workflowRecordingExportStatus,
    workflowRecordingExportBusyThreadId,
    refreshWorkflowRecordingLibraryFromHome,
    exportWorkflowRecordingPlaybookSession,
  };
}
