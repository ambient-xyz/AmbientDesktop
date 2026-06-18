import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { SubagentParentMailboxEventSummary, SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { CallableWorkflowTaskSummary, WorkflowAgentFolderSummary } from "../../shared/workflowTypes";
import type { AutomationPane } from "./AutomationsWorkspace";
import type { SidebarArea } from "./AppShellSidebar";
import type {
  SubagentApprovalDecisionDialogState,
  SubagentBarrierDecisionDialogState,
} from "./AppModalHost";
import type {
  SubagentParentClusterApprovalActionModel,
  SubagentParentClusterChildModel,
  SubagentParentClusterMailboxActionModel,
  SubagentParentClusterWorkflowTaskModel,
} from "./subagentParentClusterUiModel";
import {
  CALLABLE_WORKFLOW_CANCEL_REASON,
  CALLABLE_WORKFLOW_PAUSE_REASON,
  SUBAGENT_CHILD_CANCEL_REASON,
  SUBAGENT_CHILD_CLOSE_REASON,
  appStateWithCallableWorkflowTaskSummary,
  createAppSubagentParentClusterActions,
  subagentApprovalActionBusyKey,
  subagentBarrierActionBusyKey,
} from "./AppSubagentParentClusterActions";

describe("App subagent parent-cluster actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("models busy keys and active-thread task upserts", () => {
    expect(subagentApprovalActionBusyKey(approvalAction())).toBe("child-run-1:approval-1");
    expect(subagentBarrierActionBusyKey(barrierAction())).toBe("barrier-1:continue_with_partial");

    const existing = callableWorkflowTask({ id: "task-b", createdAt: "2026-06-14T00:01:00.000Z" });
    const inserted = callableWorkflowTask({ id: "task-a", createdAt: "2026-06-14T00:00:00.000Z" });
    const current = desktopState({ callableWorkflowTasks: [existing] });

    expect(appStateWithCallableWorkflowTaskSummary(current, inserted)?.callableWorkflowTasks.map((task) => task.id)).toEqual(["task-a", "task-b"]);
    expect(appStateWithCallableWorkflowTaskSummary(current, callableWorkflowTask({ parentThreadId: "other" }))).toBe(current);
  });

  it("opens approval and barrier dialogs with existing defaults", () => {
    const controller = createController();
    const approval = approvalAction({ requestedScope: "always" });
    const barrier = barrierAction({ requiresPartialSummary: true });

    controller.actions.resolveSubagentApprovalAction(approval);
    controller.actions.resolveSubagentBarrierAction(barrier);

    expect(controller.approvalDialog.value).toEqual({
      action: approval,
      decision: "approved",
      requestedScope: "this_child_thread",
      userDecision: "",
    });
    expect(controller.barrierDialog.value).toEqual({
      action: barrier,
      userDecision: "",
      partialSummary: "",
    });
  });

  it("submits approval decisions with scoped payloads and returned summaries", async () => {
    const childRun = subagentRun({ id: "run-updated" });
    const waitBarrier = waitBarrierSummary();
    const requestEvent = parentMailboxEvent({ id: "event-request" });
    const forwardedEvent = parentMailboxEvent({ id: "event-forwarded", createdAt: "2026-06-14T00:02:00.000Z" });
    const resolveSubagentApproval = vi.fn(async () => ({
      schemaVersion: "ambient-subagent-approval-resolution-v1",
      replay: false,
      childRun,
      approvalId: "approval-1",
      decision: "approved",
      requestedScope: "always",
      effectiveScope: "always",
      childAlwaysDefaulted: false,
      parentRemainsBlocked: false,
      approvalRequestParentMailboxEvent: requestEvent,
      approvalForwardedParentMailboxEvent: forwardedEvent,
      waitBarrier,
    }));
    vi.stubGlobal("window", { ambientDesktop: { resolveSubagentApproval } });
    const dialog: SubagentApprovalDecisionDialogState = {
      action: approvalAction(),
      decision: "approved",
      requestedScope: "always",
      userDecision: " Looks fine ",
    };
    const controller = createController({ subagentApprovalDecisionDialog: dialog });

    await controller.actions.submitSubagentApprovalDecisionDialog();

    expect(resolveSubagentApproval).toHaveBeenCalledWith({
      childRunId: "child-run-1",
      approvalId: "approval-1",
      decision: "approved",
      requestedScope: "always",
      approvalRequestParentMailboxEventId: "mailbox-approval-1",
      userDecision: "Looks fine",
    });
    expect(controller.approvalBusy.calls).toEqual(["child-run-1:approval-1", undefined]);
    expect(controller.approvalDialog.value).toBeUndefined();
    expect(controller.state.value?.subagentRuns).toEqual([childRun]);
    expect(controller.state.value?.subagentWaitBarriers).toEqual([waitBarrier]);
    expect(controller.state.value?.subagentParentMailboxEvents).toEqual([requestEvent, forwardedEvent]);
  });

  it("requires barrier decision notes before resolving and then sends valid payloads", async () => {
    const dialog: SubagentBarrierDecisionDialogState = {
      action: barrierAction({ requiresPartialSummary: true, requiresUserDecision: true }),
      userDecision: "",
      partialSummary: "",
    };
    const controller = createController({ subagentBarrierDecisionDialog: dialog });

    await controller.actions.submitSubagentBarrierDecisionDialog();

    expect(controller.barrierDialog.value?.error).toBe("Decision note is required.");

    const resolvedDialog: SubagentBarrierDecisionDialogState = {
      ...dialog,
      userDecision: " Continue ",
      partialSummary: " Partial summary ",
    };
    const resolveSubagentWaitBarrier = vi.fn(async () => ({
      schemaVersion: "ambient-subagent-wait-barrier-resolution-result-v1",
      replay: false,
      waitBarrier: waitBarrierSummary({ status: "satisfied" }),
      childRuns: [subagentRun()],
      decision: "continue_with_partial",
      parentMailboxEvent: parentMailboxEvent(),
    }));
    vi.stubGlobal("window", { ambientDesktop: { resolveSubagentWaitBarrier } });
    const validController = createController({ subagentBarrierDecisionDialog: resolvedDialog });

    await validController.actions.submitSubagentBarrierDecisionDialog();

    expect(resolveSubagentWaitBarrier).toHaveBeenCalledWith({
      waitBarrierId: "barrier-1",
      decision: "continue_with_partial",
      userDecision: "Continue",
      partialSummary: "Partial summary",
    });
    expect(validController.barrierBusy.calls).toEqual(["barrier-1:continue_with_partial", undefined]);
    expect(validController.barrierDialog.value).toBeUndefined();
    expect(validController.state.value?.subagentRuns).toEqual([subagentRun()]);
    expect(validController.state.value?.subagentWaitBarriers[0].status).toBe("satisfied");
  });

  it("uses stable reasons and clears busy state for child and callable workflow controls", async () => {
    const cancelSubagentRun = vi.fn(async () => subagentRun({ id: "run-canceled" }));
    const closeSubagentRun = vi.fn(async () => subagentRun({ id: "run-closed" }));
    const cancelCallableWorkflowTask = vi.fn(async () => callableWorkflowTask({ id: "task-canceled" }));
    const pauseCallableWorkflowTask = vi.fn(async () => callableWorkflowTask({ id: "task-paused" }));
    const resumeCallableWorkflowTask = vi.fn(async () => callableWorkflowTask({ id: "task-resumed" }));
    vi.stubGlobal("window", {
      ambientDesktop: {
        cancelCallableWorkflowTask,
        cancelSubagentRun,
        closeSubagentRun,
        pauseCallableWorkflowTask,
        resumeCallableWorkflowTask,
      },
    });
    const controller = createController();

    await controller.actions.cancelSubagentChild(childModel());
    await controller.actions.closeSubagentChild(childModel());
    await controller.actions.cancelCallableWorkflowTask(workflowTaskModel());
    await controller.actions.pauseCallableWorkflowTask(workflowTaskModel());
    await controller.actions.resumeCallableWorkflowTask(workflowTaskModel());

    expect(cancelSubagentRun).toHaveBeenCalledWith({ childRunId: "child-run-1", reason: SUBAGENT_CHILD_CANCEL_REASON });
    expect(closeSubagentRun).toHaveBeenCalledWith({ childRunId: "child-run-1", reason: SUBAGENT_CHILD_CLOSE_REASON });
    expect(cancelCallableWorkflowTask).toHaveBeenCalledWith({ taskId: "task-1", reason: CALLABLE_WORKFLOW_CANCEL_REASON });
    expect(pauseCallableWorkflowTask).toHaveBeenCalledWith({ taskId: "task-1", reason: CALLABLE_WORKFLOW_PAUSE_REASON });
    expect(resumeCallableWorkflowTask).toHaveBeenCalledWith({ taskId: "task-1" });
    expect(controller.childCancelBusy.calls).toEqual(["child-run-1", undefined]);
    expect(controller.childCloseBusy.calls).toEqual(["child-run-1", undefined]);
    expect(controller.taskCancelBusy.calls).toEqual(["task-1", undefined]);
    expect(controller.taskPauseBusy.calls).toEqual(["task-1", undefined]);
    expect(controller.taskResumeBusy.calls).toEqual(["task-1", undefined]);
  });

  it("opens callable workflow threads in the workflow-agent sidebar path", async () => {
    const folders = [{ id: "folder-1" }] as WorkflowAgentFolderSummary[];
    const ensureWorkflowAgentChatThread = vi.fn(async () => ({ id: "workflow-agent-thread-1", folderId: "folder-1" }));
    const listWorkflowAgentFolders = vi.fn(async () => folders);
    vi.stubGlobal("window", {
      ambientDesktop: {
        ensureWorkflowAgentChatThread,
        listWorkflowAgentFolders,
      },
    });
    const controller = createController();

    await controller.actions.openCallableWorkflowThread(workflowTaskModel({ workflowThreadId: "workflow-thread-1" }));

    expect(ensureWorkflowAgentChatThread).toHaveBeenCalledWith({ workflowThreadId: "workflow-thread-1" });
    expect(controller.workflowAgentFolders.value).toBe(folders);
    expect(controller.sidebarArea.value).toBe("automations");
    expect(controller.clearProjectPopover).toHaveBeenCalledOnce();
    expect(controller.clearAutomationPopover).toHaveBeenCalledOnce();
    expect(controller.selectedAutomationPane.value).toBe("workflow_agent");
    expect(controller.selectedAutomationThreadId.value).toBeUndefined();
    expect(controller.selectedWorkflowRecordingId.value).toBeUndefined();
    expect(controller.selectedWorkflowAgentFolderId.value).toBe("folder-1");
    expect(controller.selectedWorkflowAgentThreadId.value).toBe("workflow-agent-thread-1");
  });
});

function createController({
  subagentApprovalDecisionDialog,
  subagentBarrierDecisionDialog,
}: {
  subagentApprovalDecisionDialog?: SubagentApprovalDecisionDialogState;
  subagentBarrierDecisionDialog?: SubagentBarrierDecisionDialogState;
} = {}) {
  const state = statefulSetter<DesktopState | undefined>(desktopState());
  const approvalDialog = statefulSetter<SubagentApprovalDecisionDialogState | undefined>(subagentApprovalDecisionDialog);
  const barrierDialog = statefulSetter<SubagentBarrierDecisionDialogState | undefined>(subagentBarrierDecisionDialog);
  const approvalBusy = statefulSetter<string | undefined>(undefined);
  const barrierBusy = statefulSetter<string | undefined>(undefined);
  const childCancelBusy = statefulSetter<string | undefined>(undefined);
  const childCloseBusy = statefulSetter<string | undefined>(undefined);
  const taskCancelBusy = statefulSetter<string | undefined>(undefined);
  const taskPauseBusy = statefulSetter<string | undefined>(undefined);
  const taskResumeBusy = statefulSetter<string | undefined>(undefined);
  const workflowAgentFolders = statefulSetter<WorkflowAgentFolderSummary[]>([]);
  const workflowAgentNavigationError = statefulSetter<string | undefined>(undefined);
  const sidebarArea = statefulSetter<SidebarArea>("projects");
  const selectedAutomationPane = statefulSetter<AutomationPane>("home");
  const selectedAutomationThreadId = statefulSetter<string | undefined>("automation-thread");
  const selectedWorkflowAgentFolderId = statefulSetter<string>("home");
  const selectedWorkflowAgentThreadId = statefulSetter<string | undefined>(undefined);
  const selectedWorkflowRecordingId = statefulSetter<string | undefined>("recording-1");
  const clearAutomationPopover = vi.fn();
  const clearProjectPopover = vi.fn();
  const errors: Array<string | undefined> = [];

  const actions = createAppSubagentParentClusterActions({
    clearAutomationPopover,
    clearProjectPopover,
    setCallableWorkflowTaskCancelBusy: taskCancelBusy.set,
    setCallableWorkflowTaskPauseBusy: taskPauseBusy.set,
    setCallableWorkflowTaskResumeBusy: taskResumeBusy.set,
    setError: (message) => errors.push(message),
    setSelectedAutomationPane: selectedAutomationPane.set,
    setSelectedAutomationThreadId: selectedAutomationThreadId.set,
    setSelectedWorkflowAgentFolderId: selectedWorkflowAgentFolderId.set,
    setSelectedWorkflowAgentThreadId: selectedWorkflowAgentThreadId.set,
    setSelectedWorkflowRecordingId: selectedWorkflowRecordingId.set,
    setSidebarArea: sidebarArea.set,
    setState: state.set,
    setSubagentApprovalActionBusy: approvalBusy.set,
    setSubagentApprovalDecisionDialog: approvalDialog.set,
    setSubagentBarrierActionBusy: barrierBusy.set,
    setSubagentBarrierDecisionDialog: barrierDialog.set,
    setSubagentChildCancelBusy: childCancelBusy.set,
    setSubagentChildCloseBusy: childCloseBusy.set,
    setWorkflowAgentFolders: workflowAgentFolders.set,
    setWorkflowAgentNavigationError: workflowAgentNavigationError.set,
    subagentApprovalDecisionDialog,
    subagentBarrierDecisionDialog,
  });

  return {
    actions,
    approvalBusy,
    approvalDialog,
    barrierBusy,
    barrierDialog,
    childCancelBusy,
    childCloseBusy,
    clearAutomationPopover,
    clearProjectPopover,
    errors,
    selectedAutomationPane,
    selectedAutomationThreadId,
    selectedWorkflowAgentFolderId,
    selectedWorkflowAgentThreadId,
    selectedWorkflowRecordingId,
    sidebarArea,
    state,
    taskCancelBusy,
    taskPauseBusy,
    taskResumeBusy,
    workflowAgentFolders,
    workflowAgentNavigationError,
  };
}

function desktopState(input: Partial<DesktopState> = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    callableWorkflowTasks: [],
    subagentParentMailboxEvents: [],
    subagentRuns: [],
    subagentWaitBarriers: [],
    ...input,
  } as unknown as DesktopState;
}

function approvalAction(input: Partial<SubagentParentClusterApprovalActionModel> = {}): SubagentParentClusterApprovalActionModel {
  return {
    label: "Approve",
    title: "Approve",
    decision: "approved",
    childRunId: "child-run-1",
    approvalId: "approval-1",
    approvalRequestParentMailboxEventId: "mailbox-approval-1",
    ...input,
  };
}

function barrierAction(input: Partial<SubagentParentClusterMailboxActionModel> = {}): SubagentParentClusterMailboxActionModel {
  return {
    label: "Continue",
    title: "Continue",
    waitBarrierId: "barrier-1",
    decision: "continue_with_partial",
    requiresPartialSummary: false,
    requiresUserDecision: false,
    ...input,
  };
}

function childModel(input: Partial<SubagentParentClusterChildModel> = {}): SubagentParentClusterChildModel {
  return {
    runId: "child-run-1",
    ...input,
  } as unknown as SubagentParentClusterChildModel;
}

function workflowTaskModel(input: Partial<SubagentParentClusterWorkflowTaskModel> = {}): SubagentParentClusterWorkflowTaskModel {
  return {
    id: "task-1",
    workflowThreadId: "workflow-thread-1",
    ...input,
  } as unknown as SubagentParentClusterWorkflowTaskModel;
}

function callableWorkflowTask(input: Partial<CallableWorkflowTaskSummary> = {}): CallableWorkflowTaskSummary {
  return {
    id: "task-1",
    parentThreadId: "thread-1",
    createdAt: "2026-06-14T00:00:00.000Z",
    ...input,
  } as unknown as CallableWorkflowTaskSummary;
}

function subagentRun(input: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "run-1",
    parentThreadId: "thread-1",
    childThreadId: "child-thread-1",
    createdAt: "2026-06-14T00:00:00.000Z",
    ...input,
  } as unknown as SubagentRunSummary;
}

function waitBarrierSummary(input: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "thread-1",
    childRunIds: ["child-run-1"],
    createdAt: "2026-06-14T00:00:00.000Z",
    status: "waiting",
    ...input,
  } as unknown as SubagentWaitBarrierSummary;
}

function parentMailboxEvent(input: Partial<SubagentParentMailboxEventSummary> = {}): SubagentParentMailboxEventSummary {
  return {
    id: "event-1",
    parentThreadId: "thread-1",
    createdAt: "2026-06-14T00:00:00.000Z",
    ...input,
  } as unknown as SubagentParentMailboxEventSummary;
}

function statefulSetter<T>(initial: T): {
  calls: T[];
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = {
    calls: [] as T[],
    value: initial,
  };
  return {
    get calls() {
      return state.calls;
    },
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
      state.calls.push(state.value);
    },
    get value() {
      return state.value;
    },
  };
}
