import type { ToolDefinition, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type {
  CallableWorkflowTaskSummary,
  WorkflowRecordingLibraryDescription,
} from "../../shared/workflowTypes";
import type {
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
} from "../../shared/subagentTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowCallerProvenance } from "./agentRuntimeCallableWorkflowFacade";
import {
  callableWorkflowActiveToolNamesForThread as defaultCallableWorkflowActiveToolNamesForThread,
  createCallableWorkflowPiToolDefinitions as defaultCreateCallableWorkflowPiToolDefinitions,
  type CallableWorkflowPiToolContext,
  type CreateCallableWorkflowPiToolDefinitionsOptions,
} from "./agentRuntimeCallableWorkflowFacade";

export interface CallableWorkflowRecordedPlaybookStore {
  listWorkflowRecordingLibrary: (input: { limit?: number }) => { id: string }[];
  describeWorkflowRecording: (id: string) => WorkflowRecordingLibraryDescription;
}

export interface CallableWorkflowCallerProvenanceStore {
  getThread: (threadId: string) => Pick<ThreadSummary, "id" | "kind" | "subagentRunId" | "gitWorktree" | "workspacePath">;
  getSubagentRun: (runId: string) => Pick<SubagentRunSummary, "id" | "canonicalTaskPath" | "parentThreadId" | "parentRunId">;
  listSubagentToolScopeSnapshots: (runId: string) => readonly Pick<SubagentToolScopeSnapshotSummary, "scope">[];
}

export interface AgentRuntimeCallableWorkflowToolRuntimeStore {
  getRunRecord: (runId: string) => { id: string; assistantMessageId?: string };
  enqueueCallableWorkflowTask: (input: {
    executionPlan: Parameters<NonNullable<CreateCallableWorkflowPiToolDefinitionsOptions["enqueueCallableWorkflowTask"]>>[0]["executionPlan"];
    featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  }) => CallableWorkflowTaskSummary;
}

export type AgentRuntimeCallableWorkflowToolExtensionStore =
  CallableWorkflowRecordedPlaybookStore &
  CallableWorkflowCallerProvenanceStore &
  AgentRuntimeCallableWorkflowToolRuntimeStore;

export interface ResolveCallableWorkflowCallerProvenanceInput {
  threadId: string;
  parentRun: { id: string; assistantMessageId?: string };
  toolName: string;
  workflowRunPlan: { launchCard: { requireConfirmation: boolean; approvalFailureHandling: string } };
}

export interface CallableWorkflowToolExtensionOptions {
  initialRecordedWorkflowPlaybooks?: readonly WorkflowRecordingLibraryDescription[];
  childCallableWorkflowToolNames?: readonly string[];
  getThread: () => Pick<ThreadSummary, "id" | "kind">;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  getParentRun?: CreateCallableWorkflowPiToolDefinitionsOptions["getParentRun"];
  getCallerProvenance?: CreateCallableWorkflowPiToolDefinitionsOptions["getCallerProvenance"];
  beforeEnqueueCallableWorkflowTask?: (input: {
    executionPlan: Parameters<NonNullable<CreateCallableWorkflowPiToolDefinitionsOptions["enqueueCallableWorkflowTask"]>>[0]["executionPlan"];
  }) => void;
  enqueueCallableWorkflowTask: NonNullable<CreateCallableWorkflowPiToolDefinitionsOptions["enqueueCallableWorkflowTask"]>;
  startCallableWorkflowTask: NonNullable<CreateCallableWorkflowPiToolDefinitionsOptions["startCallableWorkflowTask"]>;
  getRecordedWorkflowPlaybooks: NonNullable<CreateCallableWorkflowPiToolDefinitionsOptions["getRecordedWorkflowPlaybooks"]>;
  callableWorkflowActiveToolNamesForThread?: (input: CallableWorkflowPiToolContext) => string[];
  createCallableWorkflowPiToolDefinitions?: (options: CreateCallableWorkflowPiToolDefinitionsOptions) => ToolDefinition<any, any, any>[];
}

export function createAgentRuntimeCallableWorkflowToolExtension(input: {
  threadId: string;
  workspace: WorkspaceState;
  initialRecordedWorkflowPlaybooks?: readonly WorkflowRecordingLibraryDescription[];
  childCallableWorkflowToolNames?: readonly string[];
  activeRunIds: Pick<Map<string, string>, "get">;
  store: AgentRuntimeCallableWorkflowToolExtensionStore;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  startCallableWorkflowTaskForThread: (threadId: string, taskId: string, workspace: WorkspaceState) => void;
  emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
  beforeEnqueueCallableWorkflowTask?: (input: {
    executionPlan: Parameters<NonNullable<CreateCallableWorkflowPiToolDefinitionsOptions["enqueueCallableWorkflowTask"]>>[0]["executionPlan"];
  }) => void;
  callableWorkflowActiveToolNamesForThread?: (input: CallableWorkflowPiToolContext) => string[];
  createCallableWorkflowPiToolDefinitions?: (options: CreateCallableWorkflowPiToolDefinitionsOptions) => ToolDefinition<any, any, any>[];
}): ExtensionFactory {
  return createCallableWorkflowToolExtension({
    initialRecordedWorkflowPlaybooks: input.initialRecordedWorkflowPlaybooks,
    childCallableWorkflowToolNames: input.childCallableWorkflowToolNames,
    getThread: () => input.store.getThread(input.threadId),
    getFeatureFlagSnapshot: input.getFeatureFlagSnapshot,
    ...createAgentRuntimeCallableWorkflowToolRuntime({
      threadId: input.threadId,
      workspace: input.workspace,
      activeRunIds: input.activeRunIds,
      store: input.store,
      getFeatureFlagSnapshot: input.getFeatureFlagSnapshot,
      getCallerProvenance: ({ parentRun, toolName, workflowRunPlan }) =>
        resolveCallableWorkflowCallerProvenance({
          threadId: input.threadId,
          parentRun,
          toolName,
          workflowRunPlan,
        }, input.store),
      startCallableWorkflowTaskForThread: input.startCallableWorkflowTaskForThread,
      emitCallableWorkflowTaskUpdated: input.emitCallableWorkflowTaskUpdated,
      beforeEnqueueCallableWorkflowTask: input.beforeEnqueueCallableWorkflowTask,
    }),
    getRecordedWorkflowPlaybooks: () => callableWorkflowRecordedPlaybooks(input.store),
    callableWorkflowActiveToolNamesForThread: input.callableWorkflowActiveToolNamesForThread,
    createCallableWorkflowPiToolDefinitions: input.createCallableWorkflowPiToolDefinitions,
  });
}

export function createAgentRuntimeCallableWorkflowToolRuntime(input: {
  threadId: string;
  workspace: WorkspaceState;
  activeRunIds: Pick<Map<string, string>, "get">;
  store: AgentRuntimeCallableWorkflowToolRuntimeStore;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  getCallerProvenance: NonNullable<CreateCallableWorkflowPiToolDefinitionsOptions["getCallerProvenance"]>;
  startCallableWorkflowTaskForThread: (threadId: string, taskId: string, workspace: WorkspaceState) => void;
  emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
  beforeEnqueueCallableWorkflowTask?: (input: {
    executionPlan: Parameters<NonNullable<CreateCallableWorkflowPiToolDefinitionsOptions["enqueueCallableWorkflowTask"]>>[0]["executionPlan"];
  }) => void;
}): Pick<
  CallableWorkflowToolExtensionOptions,
  "getParentRun" | "getCallerProvenance" | "enqueueCallableWorkflowTask" | "startCallableWorkflowTask"
> {
  return {
    getParentRun: () => {
      const runId = input.activeRunIds.get(input.threadId);
      if (!runId) return undefined;
      try {
        const run = input.store.getRunRecord(runId);
        return { id: run.id, assistantMessageId: run.assistantMessageId };
      } catch {
        return { id: runId };
      }
    },
    getCallerProvenance: (provenanceInput) => input.getCallerProvenance(provenanceInput),
    enqueueCallableWorkflowTask: ({ executionPlan }) => {
      input.beforeEnqueueCallableWorkflowTask?.({ executionPlan });
      const task = input.store.enqueueCallableWorkflowTask({
        executionPlan,
        featureFlagSnapshot: input.getFeatureFlagSnapshot(),
      });
      input.emitCallableWorkflowTaskUpdated(task);
      return task;
    },
    startCallableWorkflowTask: ({ taskId }) => {
      input.startCallableWorkflowTaskForThread(input.threadId, taskId, input.workspace);
    },
  };
}

export function resolveCallableWorkflowCallerProvenance(
  input: ResolveCallableWorkflowCallerProvenanceInput,
  store: CallableWorkflowCallerProvenanceStore,
): CallableWorkflowCallerProvenance | undefined {
  const thread = store.getThread(input.threadId);
  if (thread.kind !== "subagent_child" || !thread.subagentRunId) return undefined;
  const subagentRun = store.getSubagentRun(thread.subagentRunId);
  const worktree = thread.gitWorktree;
  const worktreeIsolated = Boolean(
    worktree?.status === "active" &&
      Boolean(worktree.worktreePath) &&
      thread.workspacePath === worktree.worktreePath,
  );
  const latestSnapshot = store.listSubagentToolScopeSnapshots(subagentRun.id).at(-1);
  const workflowGrant = latestSnapshot?.scope.piVisibleTools.find((grant) =>
    grant.source === "callable_workflow" &&
    grant.id === input.toolName &&
    grant.piVisible
  );
  return {
    kind: "subagent_child_thread",
    threadId: thread.id,
    runId: input.parentRun.id,
    ...(input.parentRun.assistantMessageId ? { messageId: input.parentRun.assistantMessageId } : {}),
    subagentRunId: subagentRun.id,
    canonicalTaskPath: subagentRun.canonicalTaskPath,
    parentThreadId: subagentRun.parentThreadId,
    parentRunId: subagentRun.parentRunId,
    approval: {
      required: Boolean(workflowGrant?.requiresApproval ?? input.workflowRunPlan.launchCard.requireConfirmation),
      source: workflowGrant?.requiresApproval ? "child_bridge_policy" : "launch_card",
      failureHandling: input.workflowRunPlan.launchCard.approvalFailureHandling,
      scopeHint: "this_child_thread",
    },
    worktree: {
      required: true,
      isolated: worktreeIsolated,
      status: worktree?.status ?? "missing",
      workspacePath: thread.workspacePath,
      ...(worktree?.worktreePath ? { worktreePath: worktree.worktreePath } : {}),
      ...(worktree?.branchName ? { branchName: worktree.branchName } : {}),
    },
    nestedFanout: {
      required: true,
      source: "child_bridge_policy",
    },
  };
}

export function callableWorkflowRecordedPlaybooks(
  store: CallableWorkflowRecordedPlaybookStore,
  limit = 50,
): WorkflowRecordingLibraryDescription[] {
  const entries = store.listWorkflowRecordingLibrary({ limit });
  return entries.flatMap((entry): WorkflowRecordingLibraryDescription[] => {
    try {
      return [store.describeWorkflowRecording(entry.id)];
    } catch (error) {
      console.warn(`Failed to describe recorded workflow ${entry.id} for callable workflow registry: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  });
}

export function createCallableWorkflowToolExtension(options: CallableWorkflowToolExtensionOptions): ExtensionFactory {
  return (pi) => {
    const thread = options.getThread();
    const featureFlagSnapshot = options.getFeatureFlagSnapshot();
    const recordedWorkflowPlaybooks = options.initialRecordedWorkflowPlaybooks ?? [];
    const activeToolNamesForThread = options.callableWorkflowActiveToolNamesForThread ?? defaultCallableWorkflowActiveToolNamesForThread;
    if (!activeToolNamesForThread({
      thread,
      featureFlagSnapshot,
      recordedWorkflowPlaybooks,
      childCallableWorkflowToolNames: options.childCallableWorkflowToolNames ?? [],
    }).length) return;

    const createToolDefinitions = options.createCallableWorkflowPiToolDefinitions ?? defaultCreateCallableWorkflowPiToolDefinitions;
    for (const tool of createToolDefinitions({
      getThread: options.getThread,
      getFeatureFlagSnapshot: options.getFeatureFlagSnapshot,
      getChildCallableWorkflowToolNames: () => options.childCallableWorkflowToolNames ?? [],
      getParentRun: options.getParentRun,
      getCallerProvenance: options.getCallerProvenance,
      enqueueCallableWorkflowTask: options.enqueueCallableWorkflowTask,
      startCallableWorkflowTask: options.startCallableWorkflowTask,
      getRecordedWorkflowPlaybooks: options.getRecordedWorkflowPlaybooks,
    })) {
      pi.registerTool(tool);
    }
  };
}
