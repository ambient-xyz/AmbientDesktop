import type { Dispatch, SetStateAction } from "react";

import type {
  AutomationThreadSummary,
  WorkflowAgentThreadSummary,
  WorkflowRecordingLibraryEntry,
} from "../../shared/types";
import type { AutomationPane } from "./AutomationsWorkspace";
import type { SidebarArea } from "./AppShellSidebar";

type OptionalStringSetter = Dispatch<SetStateAction<string | undefined>>;

export function automationPaneForSelectedThread(
  selectedThread: AutomationThreadSummary | undefined,
  selectedPane: AutomationPane,
): AutomationPane {
  return selectedThread ? "folder" : selectedPane;
}

export function automationPaneKeepsWorkflowAgentThread(pane: AutomationPane): boolean {
  return pane === "schedules" || pane === "runs_reviews";
}

export function automationPaneKeepsWorkflowRecording(pane: AutomationPane): boolean {
  return pane === "workflow_agent";
}

export function createAppAutomationSelectionControls({
  setSidebarArea,
  setSelectedAutomationPane,
  setSelectedAutomationFolderId,
  setSelectedAutomationThreadId,
  setSelectedWorkflowAgentFolderId,
  setSelectedWorkflowAgentThreadId,
  setSelectedWorkflowRecordingId,
  selectThread,
}: {
  setSidebarArea: Dispatch<SetStateAction<SidebarArea>>;
  setSelectedAutomationPane: Dispatch<SetStateAction<AutomationPane>>;
  setSelectedAutomationFolderId: Dispatch<SetStateAction<string>>;
  setSelectedAutomationThreadId: OptionalStringSetter;
  setSelectedWorkflowAgentFolderId: Dispatch<SetStateAction<string>>;
  setSelectedWorkflowAgentThreadId: OptionalStringSetter;
  setSelectedWorkflowRecordingId: OptionalStringSetter;
  selectThread: (threadId: string, workspacePath?: string) => Promise<void> | void;
}) {
  function selectWorkflowAgentFolder(folderId: string) {
    setSelectedWorkflowAgentFolderId(folderId);
    setSelectedWorkflowAgentThreadId(undefined);
    setSelectedWorkflowRecordingId(undefined);
    setSelectedAutomationPane("workflow_agent");
    setSelectedAutomationThreadId(undefined);
  }

  function selectWorkflowAgentThread(thread: WorkflowAgentThreadSummary) {
    setSelectedWorkflowAgentFolderId(thread.folderId);
    setSelectedWorkflowAgentThreadId(thread.id);
    setSelectedWorkflowRecordingId(undefined);
    setSelectedAutomationPane("workflow_agent");
    setSelectedAutomationThreadId(undefined);
  }

  function selectWorkflowRecording(playbook: WorkflowRecordingLibraryEntry, pane: AutomationPane) {
    setSelectedWorkflowRecordingId(playbook.id);
    setSelectedWorkflowAgentThreadId(undefined);
    setSelectedAutomationPane(pane);
    setSelectedAutomationThreadId(undefined);
  }

  function selectAutomationPane(pane: AutomationPane) {
    setSelectedAutomationPane(pane);
    setSelectedAutomationThreadId(undefined);
    if (!automationPaneKeepsWorkflowAgentThread(pane)) {
      setSelectedWorkflowAgentThreadId(undefined);
    }
    if (!automationPaneKeepsWorkflowRecording(pane)) {
      setSelectedWorkflowRecordingId(undefined);
    }
  }

  function selectAutomationThread(thread: AutomationThreadSummary) {
    setSelectedAutomationPane("folder");
    setSelectedAutomationFolderId(thread.folderId);
    setSelectedAutomationThreadId(thread.id);
    setSelectedWorkflowRecordingId(undefined);
  }

  async function openAutomationRunThread(threadId: string, workspacePath?: string) {
    setSidebarArea("projects");
    await selectThread(threadId, workspacePath);
  }

  return {
    selectWorkflowAgentFolder,
    selectWorkflowAgentThread,
    selectWorkflowRecordingForSidebar(playbook: WorkflowRecordingLibraryEntry) {
      selectWorkflowRecording(playbook, "workflow_agent");
    },
    selectWorkflowRecordingForLab(playbook: WorkflowRecordingLibraryEntry) {
      selectWorkflowRecording(playbook, "workflow_lab");
    },
    selectAutomationPane,
    selectAutomationThread,
    openAutomationRunThread,
  };
}
