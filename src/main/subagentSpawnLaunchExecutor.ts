import type { AmbientModelRuntimeProfile } from "../shared/ambientModels";
import type {
  SubagentDependencyMode,
  SubagentForkMode,
  SubagentPromptMode,
  SubagentRunStatus,
} from "../shared/subagentProtocol";
import { buildSubagentChildReservationMessage } from "./subagentSpawnFailure";
import type { SubagentRoleId, SubagentRoleProfile } from "../shared/subagentRoles";
import {
  resolveSubagentToolScope,
  type SubagentToolScopeResolution,
} from "../shared/subagentToolScope";
import type {
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../shared/types";
import {
  resolveSubagentTurnBudgetPolicy,
  type SubagentTurnBudgetPolicy,
} from "../shared/subagentTurnBudget";
import type {
  SubagentChildRuntimeLaunchPreflightResult,
  SubagentChildRuntimeStartInput,
  SubagentChildRuntimeStartResult,
  SubagentRuntimeEventEmitter,
} from "./piChildSessionAdapter";
import type { SubagentModelScopeResolution } from "./modelScopeResolver";
import { recordSubagentLaunchRejection } from "./subagentLaunchRejectionRecorder";
import { resolveSubagentSpawnBlockDecision, type SubagentSpawnBlockDecision } from "./subagentSpawnBlockDecision";
import {
  resolveSubagentChildAuthorityProfile,
  resolveSubagentLaunchWorkspaceToolPolicy,
  resolveSubagentToolScopeLaunchDenial,
  type SubagentLaunchWorkspaceToolPolicy,
  type SubagentToolScopeLaunchDenial,
} from "./subagentToolScopeLaunchPolicy";
import type { SubagentToolScopeRequest } from "./subagentToolScopeRequest";
import {
  buildSubagentSpawnRequestedRunEventInput,
  buildSubagentTaskMailboxEventInput,
  type SubagentSpawnRequestContractInput,
} from "./subagentSpawnRequest";

export const SUBAGENT_SPAWN_LAUNCH_EXECUTOR_SCHEMA_VERSION =
  "ambient-subagent-spawn-launch-executor-v1" as const;

export interface SubagentSpawnLaunchExecutorStore {
  getSubagentRun(runId: string): SubagentRunSummary;
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary;
  recordSubagentToolScopeSnapshot(runId: string, input: {
    scope: SubagentToolScopeSnapshotSummary["scope"];
    resolverInputs?: unknown;
    createdAt?: string;
  }): SubagentToolScopeSnapshotSummary;
  markSubagentRunStatus(
    runId: string,
    status: SubagentRunStatus,
    options?: { resultArtifact?: unknown; now?: string },
  ): SubagentRunSummary;
  createSubagentWaitBarrier(input: {
    parentThreadId: string;
    parentRunId: string;
    childRunIds: string[];
    dependencyMode: "required_all" | "required_any" | "quorum" | "optional_background";
    failurePolicy: "fail_parent" | "ask_user" | "degrade_partial" | "retry_child";
    quorumThreshold?: number;
    timeoutMs?: number;
    createdAt?: string;
  }): SubagentWaitBarrierSummary;
  updateSubagentWaitBarrierStatus(
    id: string,
    status: "failed",
    options?: { resolutionArtifact?: unknown; now?: string },
  ): SubagentWaitBarrierSummary;
  appendSubagentMailboxEvent(runId: string, input: {
    direction: "parent_to_child" | "child_to_parent";
    type: string;
    payload: unknown;
    deliveryState?: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentMailboxEventSummary;
  appendSubagentParentMailboxEvent(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: string;
    payload: unknown;
    deliveryState?: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
    idempotencyKey?: string;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentParentMailboxEventSummary;
  addMessage(input: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }): unknown;
}

export interface ExecuteSubagentSpawnLaunchInput {
  store: SubagentSpawnLaunchExecutorStore;
  runtime: string;
  phase: string;
  parentThread: ThreadSummary;
  parentRun: { id: string; assistantMessageId?: string };
  run: SubagentRunSummary;
  task: string;
  toolCallId: string;
  requestedRoleId: string;
  roleId: SubagentRoleId;
  role: SubagentRoleProfile;
  modelId: string;
  model: AmbientModelRuntimeProfile;
  modelScope: SubagentModelScopeResolution;
  runtimeLaunchPreflight?: SubagentChildRuntimeLaunchPreflightResult;
  dependencyMode: SubagentDependencyMode;
  forkMode: SubagentForkMode;
  promptMode: SubagentPromptMode;
  retentionPolicy: string;
  idempotencyKey: string;
  requestedToolScope: SubagentToolScopeRequest;
  availableExtensionToolNames?: readonly string[];
  childWorktree?: ThreadWorktreeSummary;
  startChildRun?: (input: SubagentChildRuntimeStartInput) => Promise<SubagentChildRuntimeStartResult> | SubagentChildRuntimeStartResult;
  createRuntimeSpawnEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
}

export interface SubagentSpawnLaunchExecutionResult {
  schemaVersion: typeof SUBAGENT_SPAWN_LAUNCH_EXECUTOR_SCHEMA_VERSION;
  run: SubagentRunSummary;
  currentRun: SubagentRunSummary;
  toolScope: SubagentToolScopeResolution;
  toolScopeSnapshot: SubagentToolScopeSnapshotSummary;
  workspacePolicy: SubagentLaunchWorkspaceToolPolicy;
  launchDenial?: SubagentToolScopeLaunchDenial;
  spawnBlockDecision: SubagentSpawnBlockDecision;
  spawnRequestedRunEvent: SubagentRunEventSummary;
  taskMailboxEvent?: SubagentMailboxEventSummary;
  waitBarrier?: SubagentWaitBarrierSummary;
  blockedWaitBarrier?: SubagentWaitBarrierSummary;
  spawnFailureParentMailbox?: SubagentParentMailboxEventSummary;
  startResult?: SubagentChildRuntimeStartResult;
  turnBudgetPolicy: SubagentTurnBudgetPolicy;
  orchestrationStarted: boolean;
}

export async function executeSubagentSpawnLaunch(
  input: ExecuteSubagentSpawnLaunchInput,
): Promise<SubagentSpawnLaunchExecutionResult> {
  const workspacePolicy = resolveSubagentLaunchWorkspaceToolPolicy({
    parentThread: input.parentThread,
    requestedApprovalMode: input.requestedToolScope.approvalMode,
    childWorktree: input.childWorktree,
    expectedChildThreadId: input.run.childThreadId,
  });
  const toolScope = resolveSubagentToolScope({
    role: input.role,
    model: input.model,
    task: input.requestedToolScope,
    workspacePolicy,
  });
  const launchDenial = resolveSubagentToolScopeLaunchDenial({
    scope: toolScope,
    requestedToolScope: input.requestedToolScope,
  });
  const childAuthorityProfile = resolveSubagentChildAuthorityProfile({
    parentThread: input.parentThread,
    childRun: input.run,
    roleId: input.roleId,
    requestedToolScope: input.requestedToolScope,
    scope: toolScope,
    workspacePolicy,
  });
  const toolScopeSnapshot = input.store.recordSubagentToolScopeSnapshot(input.run.id, {
    scope: toolScope,
    resolverInputs: {
      schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
      roleId: input.roleId,
      requestedCategories: input.requestedToolScope.requestedCategories ?? null,
      requestedSources: input.requestedToolScope.requestedSources ?? null,
      requestedFanout: input.requestedToolScope.requestedFanout ?? null,
      requestedApprovalMode: input.requestedToolScope.approvalMode ?? null,
      requestedChildAuthority: input.requestedToolScope.childAuthority ?? null,
      childAuthorityProfile,
      model: {
        profileId: input.model.profileId,
        providerId: input.model.providerId,
        modelId: input.model.modelId,
        toolUse: input.model.toolUse,
        structuredOutput: input.model.structuredOutput,
        locality: input.model.locality,
      },
      modelScope: compactSubagentModelScopeForLaunch(input.modelScope),
      availableExtensionToolNames: input.availableExtensionToolNames ? [...input.availableExtensionToolNames] : null,
      capacityLease: compactSubagentCapacityLeaseForLaunch(input.run.capacityLeaseSnapshot),
      childWorktree: input.childWorktree ? compactSubagentThreadWorktreeForLaunch(input.childWorktree) : null,
      workspacePolicy,
      parentThread: {
        id: input.parentThread.id,
        permissionMode: input.parentThread.permissionMode,
        kind: input.parentThread.kind,
      },
    },
  });
  const turnBudgetPolicy = resolveSubagentTurnBudgetPolicy(input.role);
  const spawnBlockDecision = resolveSubagentSpawnBlockDecision({
    capacityLease: input.run.capacityLeaseSnapshot,
    ...(launchDenial ? { launchDenial } : {}),
    toolScopeSnapshot,
  });
  const waitBarrier = !spawnBlockDecision.blocked && input.dependencyMode === "required"
    ? input.store.createSubagentWaitBarrier({
      parentThreadId: input.parentThread.id,
      parentRunId: input.parentRun.id,
      childRunIds: [input.run.id],
      dependencyMode: "required_all",
      failurePolicy: input.role.guardPolicy.allowPartialResult ? "degrade_partial" : "ask_user",
      timeoutMs: input.role.guardPolicy.maxRuntimeMs,
    })
    : undefined;
  const spawnRequestInput: SubagentSpawnRequestContractInput = {
    phase: input.phase,
    parentThread: input.parentThread,
    parentRun: input.parentRun,
    run: input.run,
    task: input.task,
    idempotencyKey: input.idempotencyKey,
    roleId: input.roleId,
    modelId: input.modelId,
    modelScope: input.modelScope,
    ...(input.runtimeLaunchPreflight ? { runtimeLaunchPreflight: input.runtimeLaunchPreflight } : {}),
    dependencyMode: input.dependencyMode,
    forkMode: input.forkMode,
    promptMode: input.promptMode,
    retentionPolicy: input.retentionPolicy,
    schedulingPolicy: input.role.schedulingPolicy,
    turnBudgetPolicy,
    toolScope,
    toolScopeSnapshot,
    ...(input.childWorktree ? { childWorktree: input.childWorktree } : {}),
    ...(waitBarrier ? { waitBarrier } : {}),
  };
  const spawnRequestedRunEvent = input.store.appendSubagentRunEvent(
    input.run.id,
    buildSubagentSpawnRequestedRunEventInput(spawnRequestInput),
  );
  const taskMailboxEvent = spawnBlockDecision.blocked
    ? undefined
    : input.store.appendSubagentMailboxEvent(input.run.id, buildSubagentTaskMailboxEventInput(spawnRequestInput));

  if (spawnBlockDecision.blocked) {
    const { failedRun, spawnFailureParentMailbox } = recordSubagentLaunchRejection({
      store: input.store,
      runtime: input.runtime,
      phase: input.phase,
      parentThread: input.parentThread,
      parentRun: input.parentRun,
      run: input.run,
      role: input.role,
      dependencyMode: input.dependencyMode,
      task: input.task,
      toolCallId: input.toolCallId,
      requestedRoleId: input.requestedRoleId,
      roleId: input.roleId,
      modelScope: input.modelScope,
      idempotencyKey: input.idempotencyKey,
      spawnBlockDecision,
      toolScopeSnapshot,
      ...(input.childWorktree ? { childWorktree: input.childWorktree } : {}),
    });
    return {
      schemaVersion: SUBAGENT_SPAWN_LAUNCH_EXECUTOR_SCHEMA_VERSION,
      run: input.run,
      currentRun: failedRun,
      toolScope,
      toolScopeSnapshot,
      workspacePolicy,
      ...(launchDenial ? { launchDenial } : {}),
      spawnBlockDecision,
      spawnRequestedRunEvent,
      spawnFailureParentMailbox,
      turnBudgetPolicy,
      orchestrationStarted: false,
    };
  }

  input.store.addMessage({
    threadId: input.run.childThreadId,
    role: "system",
    content: buildSubagentChildReservationMessage({
      run: input.run,
      role: input.role,
      task: input.task,
      dependencyMode: input.dependencyMode,
    }),
    metadata: {
      runtime: input.runtime,
      phase: input.phase,
      status: "reserved",
      subagentRunId: input.run.id,
      canonicalTaskPath: input.run.canonicalTaskPath,
    },
  });
  const emitEvent = input.createRuntimeSpawnEventEmitter(input.run);
  const startResult = input.startChildRun
    ? await input.startChildRun({
      parentThread: input.parentThread,
      run: input.run,
      task: input.task,
      role: input.role,
      dependencyMode: input.dependencyMode,
      forkMode: input.forkMode,
      promptMode: input.promptMode,
      toolScope,
      toolScopeSnapshot,
      turnBudgetPolicy,
      childWorktree: input.childWorktree,
      idempotencyKey: input.idempotencyKey,
      emitEvent,
    })
    : undefined;
  const currentRun = startResult?.run ?? input.store.getSubagentRun(input.run.id);
  return {
    schemaVersion: SUBAGENT_SPAWN_LAUNCH_EXECUTOR_SCHEMA_VERSION,
    run: input.run,
    currentRun,
    toolScope,
    toolScopeSnapshot,
    workspacePolicy,
    ...(launchDenial ? { launchDenial } : {}),
    spawnBlockDecision,
    spawnRequestedRunEvent,
    ...(taskMailboxEvent ? { taskMailboxEvent } : {}),
    ...(waitBarrier ? { waitBarrier } : {}),
    ...(startResult ? { startResult } : {}),
    turnBudgetPolicy,
    orchestrationStarted: Boolean(startResult?.started || currentRun.startedAt),
  };
}

function compactSubagentModelScopeForLaunch(scope: SubagentModelScopeResolution): Record<string, unknown> {
  return {
    selectedModelId: scope.selectedModelId,
    profileId: scope.profile.profileId,
    providerId: scope.profile.providerId,
    blockingReasons: scope.blockingReasons,
    warnings: scope.warnings,
  };
}

function compactSubagentCapacityLeaseForLaunch(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function compactSubagentThreadWorktreeForLaunch(worktree: ThreadWorktreeSummary): Record<string, unknown> {
  return {
    threadId: worktree.threadId,
    status: worktree.status,
    worktreePath: worktree.worktreePath,
    branchName: worktree.branchName,
    ...(worktree.error ? { error: worktree.error } : {}),
  };
}
