import type { Dispatch, SetStateAction } from "react";

import type {
  CallableWorkflowTaskSummary,
  DesktopState,
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
  WorkflowAgentFolderSummary,
} from "../../shared/types";
import type { AutomationPane } from "./AutomationsWorkspace";
import type { SidebarArea } from "./AppShellSidebar";
import {
  subagentApprovalInitialScope,
  type SubagentApprovalDecisionDialogState,
  type SubagentBarrierDecisionDialogState,
} from "./AppModalHost";
import type {
  SubagentParentClusterApprovalActionModel,
  SubagentParentClusterChildModel,
  SubagentParentClusterMailboxActionModel,
  SubagentParentClusterWorkflowTaskModel,
} from "./subagentParentClusterUiModel";

export const SUBAGENT_CHILD_CANCEL_REASON = "User canceled sub-agent child from the parent thread cluster.";
export const SUBAGENT_CHILD_CLOSE_REASON = "User closed sub-agent child from the parent thread cluster.";
export const CALLABLE_WORKFLOW_CANCEL_REASON = "User canceled callable workflow task from the parent thread cluster.";
export const CALLABLE_WORKFLOW_PAUSE_REASON = "User paused callable workflow task from the parent thread cluster.";

export function subagentApprovalActionBusyKey(action: Pick<SubagentParentClusterApprovalActionModel, "approvalId" | "childRunId">): string {
  return `${action.childRunId}:${action.approvalId}`;
}

export function subagentBarrierActionBusyKey(action: Pick<SubagentParentClusterMailboxActionModel, "decision" | "waitBarrierId">): string {
  return `${action.waitBarrierId}:${action.decision}`;
}

function sortedUpsert<T extends { id: string; createdAt: string }>(items: T[], next: T): T[] {
  const exists = items.some((candidate) => candidate.id === next.id);
  return exists
    ? items.map((candidate) => (candidate.id === next.id ? next : candidate))
    : [...items, next].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function appStateWithCallableWorkflowTaskSummary(
  current: DesktopState | undefined,
  nextTask: CallableWorkflowTaskSummary,
): DesktopState | undefined {
  if (!current) return current;
  if (nextTask.parentThreadId !== current.activeThreadId) return current;
  return {
    ...current,
    callableWorkflowTasks: sortedUpsert(current.callableWorkflowTasks, nextTask),
  };
}

export function appStateWithSubagentRunSummary(
  current: DesktopState | undefined,
  nextRun: SubagentRunSummary,
): DesktopState | undefined {
  if (!current) return current;
  if (nextRun.parentThreadId !== current.activeThreadId && nextRun.childThreadId !== current.activeThreadId) return current;
  return {
    ...current,
    subagentRuns: sortedUpsert(current.subagentRuns, nextRun),
  };
}

export function appStateWithSubagentWaitBarrierSummary(
  current: DesktopState | undefined,
  nextBarrier: SubagentWaitBarrierSummary,
): DesktopState | undefined {
  if (!current) return current;
  if (nextBarrier.parentThreadId !== current.activeThreadId) return current;
  return {
    ...current,
    subagentWaitBarriers: sortedUpsert(current.subagentWaitBarriers, nextBarrier),
  };
}

export function appStateWithSubagentParentMailboxEventSummary(
  current: DesktopState | undefined,
  nextEvent: SubagentParentMailboxEventSummary,
): DesktopState | undefined {
  if (!current) return current;
  if (nextEvent.parentThreadId !== current.activeThreadId) return current;
  return {
    ...current,
    subagentParentMailboxEvents: sortedUpsert(current.subagentParentMailboxEvents, nextEvent),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAppSubagentParentClusterActions({
  clearAutomationPopover,
  clearProjectPopover,
  setCallableWorkflowTaskCancelBusy,
  setCallableWorkflowTaskPauseBusy,
  setCallableWorkflowTaskResumeBusy,
  setError,
  setSelectedAutomationPane,
  setSelectedAutomationThreadId,
  setSelectedWorkflowAgentFolderId,
  setSelectedWorkflowAgentThreadId,
  setSelectedWorkflowRecordingId,
  setSidebarArea,
  setState,
  setSubagentApprovalActionBusy,
  setSubagentApprovalDecisionDialog,
  setSubagentBarrierActionBusy,
  setSubagentBarrierDecisionDialog,
  setSubagentChildCancelBusy,
  setSubagentChildCloseBusy,
  setWorkflowAgentFolders,
  setWorkflowAgentNavigationError,
  subagentApprovalDecisionDialog,
  subagentBarrierDecisionDialog,
}: {
  clearAutomationPopover: () => void;
  clearProjectPopover: () => void;
  setCallableWorkflowTaskCancelBusy: Dispatch<SetStateAction<string | undefined>>;
  setCallableWorkflowTaskPauseBusy: Dispatch<SetStateAction<string | undefined>>;
  setCallableWorkflowTaskResumeBusy: Dispatch<SetStateAction<string | undefined>>;
  setError: (message: string | undefined) => void;
  setSelectedAutomationPane: Dispatch<SetStateAction<AutomationPane>>;
  setSelectedAutomationThreadId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedWorkflowAgentFolderId: Dispatch<SetStateAction<string>>;
  setSelectedWorkflowAgentThreadId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedWorkflowRecordingId: Dispatch<SetStateAction<string | undefined>>;
  setSidebarArea: Dispatch<SetStateAction<SidebarArea>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  setSubagentApprovalActionBusy: Dispatch<SetStateAction<string | undefined>>;
  setSubagentApprovalDecisionDialog: Dispatch<SetStateAction<SubagentApprovalDecisionDialogState | undefined>>;
  setSubagentBarrierActionBusy: Dispatch<SetStateAction<string | undefined>>;
  setSubagentBarrierDecisionDialog: Dispatch<SetStateAction<SubagentBarrierDecisionDialogState | undefined>>;
  setSubagentChildCancelBusy: Dispatch<SetStateAction<string | undefined>>;
  setSubagentChildCloseBusy: Dispatch<SetStateAction<string | undefined>>;
  setWorkflowAgentFolders: Dispatch<SetStateAction<WorkflowAgentFolderSummary[]>>;
  setWorkflowAgentNavigationError: Dispatch<SetStateAction<string | undefined>>;
  subagentApprovalDecisionDialog?: SubagentApprovalDecisionDialogState;
  subagentBarrierDecisionDialog?: SubagentBarrierDecisionDialogState;
}) {
  function upsertCallableWorkflowTaskSummary(nextTask: CallableWorkflowTaskSummary): void {
    setState((current) => appStateWithCallableWorkflowTaskSummary(current, nextTask));
  }

  function upsertSubagentRunSummary(nextRun: SubagentRunSummary): void {
    setState((current) => appStateWithSubagentRunSummary(current, nextRun));
  }

  function upsertSubagentWaitBarrierSummary(nextBarrier: SubagentWaitBarrierSummary): void {
    setState((current) => appStateWithSubagentWaitBarrierSummary(current, nextBarrier));
  }

  function upsertSubagentParentMailboxEventSummary(nextEvent: SubagentParentMailboxEventSummary): void {
    setState((current) => appStateWithSubagentParentMailboxEventSummary(current, nextEvent));
  }

  function resolveSubagentBarrierAction(action: SubagentParentClusterMailboxActionModel): void {
    setSubagentBarrierDecisionDialog({
      action,
      userDecision: "",
      partialSummary: "",
    });
  }

  function resolveSubagentApprovalAction(action: SubagentParentClusterApprovalActionModel): void {
    setSubagentApprovalDecisionDialog({
      action,
      decision: action.decision,
      requestedScope: subagentApprovalInitialScope(action),
      userDecision: "",
    });
  }

  async function submitSubagentApprovalDecisionDialog(): Promise<void> {
    if (!subagentApprovalDecisionDialog || subagentApprovalDecisionDialog.busy) return;
    const { action, decision } = subagentApprovalDecisionDialog;
    const userDecision = subagentApprovalDecisionDialog.userDecision.trim();
    setSubagentApprovalDecisionDialog((current) => (current ? { ...current, busy: true, error: undefined } : current));
    setSubagentApprovalActionBusy(subagentApprovalActionBusyKey(action));
    setError(undefined);
    try {
      const result = await window.ambientDesktop.resolveSubagentApproval({
        childRunId: action.childRunId,
        approvalId: action.approvalId,
        decision,
        requestedScope: decision === "approved" ? subagentApprovalDecisionDialog.requestedScope : "this_action",
        approvalRequestParentMailboxEventId: action.approvalRequestParentMailboxEventId,
        ...(userDecision ? { userDecision } : {}),
      });
      upsertSubagentRunSummary(result.childRun);
      if (result.waitBarrier) upsertSubagentWaitBarrierSummary(result.waitBarrier);
      if (result.approvalRequestParentMailboxEvent) upsertSubagentParentMailboxEventSummary(result.approvalRequestParentMailboxEvent);
      if (result.approvalForwardedParentMailboxEvent) upsertSubagentParentMailboxEventSummary(result.approvalForwardedParentMailboxEvent);
      setSubagentApprovalDecisionDialog(undefined);
    } catch (error) {
      const message = errorMessage(error);
      setSubagentApprovalDecisionDialog((current) => (current ? { ...current, busy: false, error: message } : current));
      setError(message);
    } finally {
      setSubagentApprovalActionBusy(undefined);
    }
  }

  async function submitSubagentBarrierDecisionDialog(): Promise<void> {
    if (!subagentBarrierDecisionDialog || subagentBarrierDecisionDialog.busy) return;
    const { action } = subagentBarrierDecisionDialog;
    const userDecision = subagentBarrierDecisionDialog.userDecision.trim();
    const partialSummary = subagentBarrierDecisionDialog.partialSummary.trim();
    if (action.requiresUserDecision && !userDecision) {
      setSubagentBarrierDecisionDialog((current) => (current ? { ...current, error: "Decision note is required." } : current));
      return;
    }
    if (action.requiresPartialSummary && !partialSummary) {
      setSubagentBarrierDecisionDialog((current) => (current ? { ...current, error: "Partial summary is required." } : current));
      return;
    }
    setSubagentBarrierDecisionDialog((current) => (current ? { ...current, busy: true, error: undefined } : current));
    setSubagentBarrierActionBusy(subagentBarrierActionBusyKey(action));
    setError(undefined);
    try {
      const result = await window.ambientDesktop.resolveSubagentWaitBarrier({
        waitBarrierId: action.waitBarrierId,
        decision: action.decision,
        ...(userDecision ? { userDecision } : {}),
        ...(partialSummary ? { partialSummary } : {}),
      });
      upsertSubagentWaitBarrierSummary(result.waitBarrier);
      result.childRuns.forEach(upsertSubagentRunSummary);
      if (result.parentMailboxEvent) upsertSubagentParentMailboxEventSummary(result.parentMailboxEvent);
      setSubagentBarrierDecisionDialog(undefined);
    } catch (error) {
      const message = errorMessage(error);
      setSubagentBarrierDecisionDialog((current) => (current ? { ...current, busy: false, error: message } : current));
      setError(message);
    } finally {
      setSubagentBarrierActionBusy(undefined);
    }
  }

  async function cancelSubagentChild(child: SubagentParentClusterChildModel): Promise<void> {
    setSubagentChildCancelBusy(child.runId);
    setError(undefined);
    try {
      const run = await window.ambientDesktop.cancelSubagentRun({
        childRunId: child.runId,
        reason: SUBAGENT_CHILD_CANCEL_REASON,
      });
      upsertSubagentRunSummary(run);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSubagentChildCancelBusy(undefined);
    }
  }

  async function closeSubagentChild(child: SubagentParentClusterChildModel): Promise<void> {
    setSubagentChildCloseBusy(child.runId);
    setError(undefined);
    try {
      const run = await window.ambientDesktop.closeSubagentRun({
        childRunId: child.runId,
        reason: SUBAGENT_CHILD_CLOSE_REASON,
      });
      upsertSubagentRunSummary(run);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSubagentChildCloseBusy(undefined);
    }
  }

  async function cancelCallableWorkflowTask(task: SubagentParentClusterWorkflowTaskModel): Promise<void> {
    setCallableWorkflowTaskCancelBusy(task.id);
    setError(undefined);
    try {
      const nextTask = await window.ambientDesktop.cancelCallableWorkflowTask({
        taskId: task.id,
        reason: CALLABLE_WORKFLOW_CANCEL_REASON,
      });
      upsertCallableWorkflowTaskSummary(nextTask);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setCallableWorkflowTaskCancelBusy(undefined);
    }
  }

  async function pauseCallableWorkflowTask(task: SubagentParentClusterWorkflowTaskModel): Promise<void> {
    setCallableWorkflowTaskPauseBusy(task.id);
    setError(undefined);
    try {
      const nextTask = await window.ambientDesktop.pauseCallableWorkflowTask({
        taskId: task.id,
        reason: CALLABLE_WORKFLOW_PAUSE_REASON,
      });
      upsertCallableWorkflowTaskSummary(nextTask);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setCallableWorkflowTaskPauseBusy(undefined);
    }
  }

  async function resumeCallableWorkflowTask(task: SubagentParentClusterWorkflowTaskModel): Promise<void> {
    setCallableWorkflowTaskResumeBusy(task.id);
    setError(undefined);
    try {
      const nextTask = await window.ambientDesktop.resumeCallableWorkflowTask({
        taskId: task.id,
      });
      upsertCallableWorkflowTaskSummary(nextTask);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setCallableWorkflowTaskResumeBusy(undefined);
    }
  }

  async function openCallableWorkflowThread(task: SubagentParentClusterWorkflowTaskModel): Promise<void> {
    if (!task.workflowThreadId) return;
    setError(undefined);
    setWorkflowAgentNavigationError(undefined);
    try {
      const thread = await window.ambientDesktop.ensureWorkflowAgentChatThread({ workflowThreadId: task.workflowThreadId });
      const folders = await window.ambientDesktop.listWorkflowAgentFolders();
      setWorkflowAgentFolders(folders);
      setSidebarArea("automations");
      clearProjectPopover();
      clearAutomationPopover();
      setSelectedAutomationPane("workflow_agent");
      setSelectedAutomationThreadId(undefined);
      setSelectedWorkflowRecordingId(undefined);
      setSelectedWorkflowAgentFolderId(thread.folderId);
      setSelectedWorkflowAgentThreadId(thread.id);
    } catch (error) {
      const message = errorMessage(error);
      setWorkflowAgentNavigationError(message);
      setError(message);
    }
  }

  return {
    cancelCallableWorkflowTask,
    cancelSubagentChild,
    closeSubagentChild,
    openCallableWorkflowThread,
    pauseCallableWorkflowTask,
    resolveSubagentApprovalAction,
    resolveSubagentBarrierAction,
    resumeCallableWorkflowTask,
    submitSubagentApprovalDecisionDialog,
    submitSubagentBarrierDecisionDialog,
    upsertCallableWorkflowTaskSummary,
    upsertSubagentParentMailboxEventSummary,
    upsertSubagentRunSummary,
    upsertSubagentWaitBarrierSummary,
  };
}
