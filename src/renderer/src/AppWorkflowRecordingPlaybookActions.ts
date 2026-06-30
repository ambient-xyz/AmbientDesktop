import type { Dispatch, SetStateAction } from "react";

import type { WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import type { PendingWorkflowRecordingEditContext } from "./AppComposerSubmitActionTypes";
import type {
  AutomationPopover,
  ProjectPopover,
} from "./AppSidebar";
import type { SidebarArea } from "./AppShellSidebar";
import type { UtilityPanel } from "./RightPanel";
import { workflowRecorderEditWithAmbientModel } from "./workflowRecorderUiModel";

export type PendingProjectComposerDraft = {
  value: string;
  nonce: number;
};

export type { PendingWorkflowRecordingEditContext } from "./AppComposerSubmitActionTypes";

export type WorkflowRecordingEditDraftRequest = {
  browserPreviewPath: string;
  composerDraft: PendingProjectComposerDraft;
  editContext: PendingWorkflowRecordingEditContext;
};

export function workflowRecordingEditDraftRequest(
  playbook: WorkflowRecordingLibraryEntry,
  nonce = Date.now(),
): WorkflowRecordingEditDraftRequest {
  const editModel = workflowRecorderEditWithAmbientModel(playbook);
  return {
    browserPreviewPath: editModel.browserPreviewPath,
    composerDraft: {
      value: editModel.draftPrefix,
      nonce,
    },
    editContext: {
      ...editModel.context,
      draftPrefix: editModel.draftPrefix,
    },
  };
}

export function workflowRecordingPreviewFallbackMessage(error: unknown): string {
  return error instanceof Error
    ? `Opened workflow in Files instead of Browser: ${error.message}`
    : `Opened workflow in Files instead of Browser: ${String(error)}`;
}

export function createAppWorkflowRecordingPlaybookActions({
  closeProjectBoard,
  previewLocalFile,
  setAutomationPopover,
  setBrowserRevision,
  setError,
  setPendingProjectComposerDraft,
  setPendingWorkflowRecordingEditContext,
  setProjectPopover,
  setRightPanel,
  setSelectedAutomationThreadId,
  setSelectedWorkflowAgentThreadId,
  setSelectedWorkflowRecordingId,
  setSidebarArea,
}: {
  closeProjectBoard: () => void;
  previewLocalFile: (path: string) => void;
  setAutomationPopover: Dispatch<SetStateAction<AutomationPopover | undefined>>;
  setBrowserRevision: Dispatch<SetStateAction<number>>;
  setError: (message: string | undefined) => void;
  setPendingProjectComposerDraft: Dispatch<SetStateAction<PendingProjectComposerDraft | undefined>>;
  setPendingWorkflowRecordingEditContext: Dispatch<SetStateAction<PendingWorkflowRecordingEditContext | undefined>>;
  setProjectPopover: Dispatch<SetStateAction<ProjectPopover | undefined>>;
  setRightPanel: Dispatch<SetStateAction<UtilityPanel | undefined>>;
  setSelectedAutomationThreadId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedWorkflowAgentThreadId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedWorkflowRecordingId: Dispatch<SetStateAction<string | undefined>>;
  setSidebarArea: Dispatch<SetStateAction<SidebarArea>>;
}): {
  editWorkflowRecordingPlaybookInChat: (playbook: WorkflowRecordingLibraryEntry) => void;
  previewWorkflowRecordingPlaybookInBrowser: (path: string) => Promise<void>;
} {
  async function previewWorkflowRecordingPlaybookInBrowser(path: string): Promise<void> {
    setRightPanel("browser");
    setBrowserRevision((revision) => revision + 1);
    try {
      await window.ambientDesktop.previewLocalPathInBrowser({ path });
      setBrowserRevision((revision) => revision + 1);
    } catch (error) {
      previewLocalFile(path);
      setError(workflowRecordingPreviewFallbackMessage(error));
    }
  }

  function editWorkflowRecordingPlaybookInChat(playbook: WorkflowRecordingLibraryEntry): void {
    const editRequest = workflowRecordingEditDraftRequest(playbook);
    setSidebarArea("projects");
    setProjectPopover(undefined);
    setAutomationPopover(undefined);
    setSelectedWorkflowRecordingId(undefined);
    setSelectedAutomationThreadId(undefined);
    setSelectedWorkflowAgentThreadId(undefined);
    closeProjectBoard();
    setPendingWorkflowRecordingEditContext(editRequest.editContext);
    setPendingProjectComposerDraft(editRequest.composerDraft);
    void previewWorkflowRecordingPlaybookInBrowser(editRequest.browserPreviewPath);
  }

  return {
    editWorkflowRecordingPlaybookInChat,
    previewWorkflowRecordingPlaybookInBrowser,
  };
}
