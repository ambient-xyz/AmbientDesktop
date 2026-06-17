import { isAbsolute, relative, resolve } from "node:path";
import type { AmbientModelRuntimeProfile } from "../../shared/ambientModels";
import type {
  SubagentDependencyMode,
  SubagentForkMode,
  SubagentPromptMode,
  SubagentRunStatus,
} from "../../shared/subagentProtocol";
import { buildSubagentChildReservationMessage } from "./subagentSpawnFailure";
import type { SubagentRoleId, SubagentRoleProfile } from "../../shared/subagentRoles";
import {
  resolveSubagentToolScope,
  type SubagentToolScopeGrant,
  type SubagentToolScopeResolution,
} from "../../shared/subagentToolScope";
import type {
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../../shared/types";
import {
  assertValidMutationWorkspaceLease,
  symphonyExactToolPolicyId,
  symphonyPolicyIncludesExactTool,
} from "../../shared/symphonyFineGrainedContracts";
import {
  resolveSubagentTurnBudgetPolicy,
  type SubagentTurnBudgetPolicy,
} from "../../shared/subagentTurnBudget";
import {
  releaseSymphonyMutationWorkspaceLease,
} from "../symphonyMutationWorkspaceLeaseService";
import type {
  SubagentChildRuntimeLaunchPreflightResult,
  SubagentChildRuntimeStartInput,
  SubagentChildRuntimeStartResult,
  SubagentRuntimeEventEmitter,
} from "../pi/piChildSessionAdapter";
import type { SubagentModelScopeResolution } from "../model-provider/modelScopeResolver";
import { recordSubagentLaunchRejection } from "./subagentLaunchRejectionRecorder";
import { resolveSubagentSpawnBlockDecision, type SubagentSpawnBlockDecision } from "./subagentSpawnBlockDecision";
import {
  resolveSubagentChildAuthorityProfile,
  resolveSubagentLaunchWorkspaceToolPolicy,
  resolveSubagentToolScopeLaunchDenial,
  SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION,
  type SubagentLaunchWorkspaceToolPolicy,
  type SubagentToolScopeLaunchDenial,
} from "./subagentToolScopeLaunchPolicy";
import type { SubagentToolScopeRequest } from "./subagentToolScopeRequest";
import {
  buildSubagentSpawnRequestedRunEventInput,
  buildSubagentTaskMailboxEventInput,
  type SubagentSpawnRequestContractInput,
} from "./subagentSpawnRequest";
import { isPathInside } from "../session/sessionPaths";

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
  updateSubagentRunMutationWorkspaceLease?(
    runId: string,
    lease: NonNullable<SubagentRunSummary["symphonyMutationWorkspaceLease"]>,
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
  const launchRequestedToolScope = remapMutationLeaseAuthorityRoots(
    input.requestedToolScope,
    input.run.symphonyMutationWorkspaceLease,
    input.parentThread.workspacePath,
    input.run.symphonyLaunchContracts?.childLaunchPolicySnapshot.inheritedAuthorityRoots ?? [],
  );
  const workspacePolicy = resolveSubagentLaunchWorkspaceToolPolicy({
    parentThread: input.parentThread,
    requestedApprovalMode: launchRequestedToolScope.approvalMode,
    childWorktree: input.childWorktree,
    mutationWorkspaceLease: input.run.symphonyMutationWorkspaceLease,
    expectedChildThreadId: input.run.childThreadId,
  });
  const resolvedToolScope = resolveSubagentToolScope({
    role: input.role,
    model: input.model,
    task: launchRequestedToolScope,
    workspacePolicy,
  });
  const childAuthorityProfile = resolveSubagentChildAuthorityProfile({
    parentThread: input.parentThread,
    childRun: input.run,
    roleId: input.roleId,
    requestedToolScope: launchRequestedToolScope,
    scope: resolvedToolScope,
    workspacePolicy,
  });
  const launchDenial = resolveSubagentToolScopeLaunchDenial({
    scope: resolvedToolScope,
    requestedToolScope: launchRequestedToolScope,
  }) ?? resolveSymphonyLaunchPolicyDenial({
    scope: resolvedToolScope,
    run: input.run,
    childAuthorityProfile,
    explicitToolRequest: Boolean(
      input.requestedToolScope.requestedCategories?.length ||
      input.requestedToolScope.requestedSources?.length ||
      input.requestedToolScope.requestedFanout
    ),
  });
  const toolScope = denyBashForSubdirectoryMutationLease({
    scope: resolvedToolScope,
    run: input.run,
    childAuthorityProfile,
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
      effectiveChildAuthority: launchRequestedToolScope.childAuthority ?? null,
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
      mutationWorkspaceLease: compactSubagentMutationWorkspaceLeaseForLaunch(input.run.symphonyMutationWorkspaceLease),
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
    const currentRun = releaseActiveMutationLease(input.store, failedRun);
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
  let startResult: SubagentChildRuntimeStartResult | undefined;
  try {
    startResult = input.startChildRun
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
  } catch (error) {
    releaseActiveMutationLease(input.store, input.store.getSubagentRun(input.run.id));
    throw error;
  }
  const runtimeRun = startResult?.run ?? input.store.getSubagentRun(input.run.id);
  const currentRun = startResult?.started
    ? runtimeRun
    : releaseActiveMutationLease(input.store, runtimeRun);
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

function releaseActiveMutationLease(
  store: SubagentSpawnLaunchExecutorStore,
  run: SubagentRunSummary,
): SubagentRunSummary {
  if (!store.updateSubagentRunMutationWorkspaceLease || !run.symphonyMutationWorkspaceLease) return run;
  if (!["active", "promoting"].includes(run.symphonyMutationWorkspaceLease.status)) return run;
  const released = releaseSymphonyMutationWorkspaceLease(run.symphonyMutationWorkspaceLease, { now: run.updatedAt });
  return released ? store.updateSubagentRunMutationWorkspaceLease(run.id, released) : run;
}

function remapMutationLeaseAuthorityRoots(
  requestedToolScope: SubagentToolScopeRequest,
  lease: SubagentRunSummary["symphonyMutationWorkspaceLease"] | undefined,
  parentWorkspacePath: string | undefined,
  inheritedAuthorityRoots: readonly string[],
): SubagentToolScopeRequest {
  const requestedReadRoots = requestedToolScope.childAuthority?.readRoots;
  const requestedWriteRoots = requestedToolScope.childAuthority?.writeRoots;
  if (!lease || lease.status !== "active") {
    return requestedToolScope;
  }
  const defaultReadRoots = inheritedAuthorityRoots.length ? inheritedAuthorityRoots : lease.sourceRoots;
  const remappedReadRoots = requestedReadRoots?.length
    ? requestedReadRoots.map((readRoot) =>
      remapMutationLeaseReadRoot(readRoot, parentWorkspacePath, lease) ?? readRoot
    )
    : defaultReadRoots
      .map((readRoot) => remapMutationLeaseReadRoot(readRoot, parentWorkspacePath, lease))
      .filter((readRoot): readRoot is string => Boolean(readRoot));
  const remappedWriteRoots = requestedWriteRoots?.length
    ? requestedWriteRoots.map((writeRoot) => remapMutationLeaseWriteRoot(writeRoot, lease) ?? writeRoot)
    : lease.writableRoots;
  const effectiveReadRoots = [...new Set(remappedReadRoots)];
  const effectiveWriteRoots = [...new Set(remappedWriteRoots)];
  if (
    requestedReadRoots?.length
    && effectiveReadRoots.length === requestedReadRoots.length
    && effectiveReadRoots.every((readRoot, index) => readRoot === requestedReadRoots[index])
    &&
    requestedWriteRoots?.length
    && effectiveWriteRoots.length === requestedWriteRoots.length
    && effectiveWriteRoots.every((writeRoot, index) => writeRoot === requestedWriteRoots[index])
  ) {
    return requestedToolScope;
  }
  return {
    ...requestedToolScope,
    childAuthority: {
      ...requestedToolScope.childAuthority,
      mutation: requestedToolScope.childAuthority?.mutation ?? "allow_isolated_worktree",
      readRoots: effectiveReadRoots,
      writeRoots: effectiveWriteRoots,
    },
  };
}

function remapMutationLeaseReadRoot(
  readRoot: string,
  parentWorkspacePath: string | undefined,
  lease: NonNullable<SubagentRunSummary["symphonyMutationWorkspaceLease"]>,
): string | undefined {
  const resolvedReadRoot = resolveAuthorityRoot(readRoot, parentWorkspacePath);
  if (!resolvedReadRoot) return undefined;
  const sourceRoot = [...lease.sourceRoots, ...(parentWorkspacePath ? [parentWorkspacePath] : [])]
    .find((root) => pathWithinRoot(resolvedReadRoot, root));
  if (!sourceRoot) return resolvedReadRoot;
  const suffix = relative(sourceRoot, resolvedReadRoot);
  return suffix ? resolve(lease.rootPath, suffix) : lease.rootPath;
}

function denyBashForSubdirectoryMutationLease(input: {
  scope: SubagentToolScopeResolution;
  run: SubagentRunSummary;
  childAuthorityProfile: ReturnType<typeof resolveSubagentChildAuthorityProfile>;
}): SubagentToolScopeResolution {
  const lease = input.run.symphonyMutationWorkspaceLease;
  if (!lease || lease.status !== "active") return input.scope;
  const writeRoots = input.childAuthorityProfile.resourceScopes.filesystem.writeRoots;
  if (pathWithinAnyRoot(lease.rootPath, writeRoots)) return input.scope;
  if (input.scope.deniedTools.some((tool) => tool.source === "built_in" && tool.id === "bash")) return input.scope;
  return {
    ...input.scope,
    loadedTools: input.scope.loadedTools.filter((tool) => !(tool.source === "built_in" && tool.id === "bash")),
    piVisibleTools: input.scope.piVisibleTools.filter((tool) => !(tool.source === "built_in" && tool.id === "bash")),
    deniedTools: [
      ...input.scope.deniedTools,
      {
        source: "built_in",
        id: "bash",
        categoryId: "workspace.write",
        reason: "Bash starts at the child workspace root, but this mutation lease only grants subdirectory write roots.",
      },
    ],
  };
}

function remapMutationLeaseWriteRoot(
  writeRoot: string,
  lease: NonNullable<SubagentRunSummary["symphonyMutationWorkspaceLease"]>,
): string | undefined {
  const declaredIndex = lease.declaredWritableRoots.findIndex((declaredRoot) => pathWithinRoot(writeRoot, declaredRoot));
  if (declaredIndex < 0) return undefined;
  const declaredRoot = lease.declaredWritableRoots[declaredIndex];
  const leasedRoot = lease.writableRoots[declaredIndex];
  if (!declaredRoot || !leasedRoot) return undefined;
  const suffix = relative(declaredRoot, writeRoot);
  return suffix ? resolve(leasedRoot, suffix) : leasedRoot;
}

function resolveAuthorityRoot(root: string, parentWorkspacePath: string | undefined): string | undefined {
  const trimmed = root.trim();
  if (!trimmed) return undefined;
  return isAbsolute(trimmed) || !parentWorkspacePath ? resolve(trimmed) : resolve(parentWorkspacePath, trimmed);
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

function resolveSymphonyLaunchPolicyDenial(input: {
  scope: SubagentToolScopeResolution;
  run: SubagentRunSummary;
  childAuthorityProfile: ReturnType<typeof resolveSubagentChildAuthorityProfile>;
  explicitToolRequest: boolean;
}): SubagentToolScopeLaunchDenial | undefined {
  const policy = input.run.symphonyLaunchContracts?.childLaunchPolicySnapshot;
  if (!policy) return undefined;
  const allowed = new Set(policy.allowedToolIds);
  const denied = new Set(policy.deniedToolIds);
  const deniedCategoryIds = new Set<string>();
  const deniedToolIds = new Set<string>();
  const reasons: string[] = [];
  const resolvedTools = uniqueResolvedToolGrants(input.scope);
  const resolvedCategories = [...new Set([...input.scope.loadedCategories, ...input.scope.piVisibleCategories])];
  const readRoots = input.childAuthorityProfile.resourceScopes.filesystem.readRoots;
  const writeRoots = input.childAuthorityProfile.resourceScopes.filesystem.writeRoots;

  const leaseReasons = symphonyMutationLeaseDenialReasons({
    run: input.run,
    policy,
    writeRoots,
  });
  if (leaseReasons.length > 0) {
    reasons.push(...leaseReasons);
    for (const tool of resolvedTools) {
      if (tool.mutatesState) deniedToolIds.add(symphonyExactToolPolicyId(tool));
    }
  }

  for (const categoryId of resolvedCategories) {
    if (denied.has(categoryId)) {
      deniedCategoryIds.add(categoryId);
      reasons.push(`${categoryId} is denied by the Symphony child launch policy`);
      continue;
    }
    if (!allowed.has(categoryId) && !resolvedCategoryCoveredByExactToolGrants(categoryId, resolvedTools, policy)) {
      deniedCategoryIds.add(categoryId);
      reasons.push(`${categoryId} is not allowed by the Symphony child launch policy`);
    }
  }

  for (const tool of resolvedTools) {
    const exactToolId = symphonyExactToolPolicyId(tool);
    const categoryAllowed = tool.categoryId ? allowed.has(tool.categoryId) : false;
    const exactAllowed = symphonyPolicyIncludesExactTool(policy.allowedToolIds, tool);
    const categoryDenied = tool.categoryId ? denied.has(tool.categoryId) : false;
    const exactDenied = symphonyPolicyIncludesExactTool(policy.deniedToolIds, tool);
    if (policy.mutation === "none" && tool.mutatesState) {
      deniedToolIds.add(exactToolId);
      reasons.push(`${exactToolId} mutates state but the Symphony child launch policy mutation is none`);
      continue;
    }
    if (categoryDenied || exactDenied) {
      deniedToolIds.add(exactToolId);
      reasons.push(`${exactToolId} is denied by the Symphony child launch policy`);
      continue;
    }
    if (!categoryAllowed && !exactAllowed) {
      deniedToolIds.add(exactToolId);
      reasons.push(`${exactToolId} is not allowed by the Symphony child launch policy`);
    }
  }

  for (const readRoot of readRoots) {
    if (readRootCoveredByMutationLease(readRoot, input.run.symphonyMutationWorkspaceLease, policy.inheritedAuthorityRoots)) continue;
    if (!pathWithinAnyRoot(readRoot, policy.inheritedAuthorityRoots)) {
      reasons.push(`${readRoot} is outside Symphony inherited authority roots`);
    }
  }
  for (const writeRoot of writeRoots) {
    if (writeRootCoveredByMutationLease(writeRoot, input.run.symphonyMutationWorkspaceLease)) continue;
    if (!pathWithinAnyRoot(writeRoot, policy.writableRoots)) {
      reasons.push(`${writeRoot} is outside Symphony writable roots`);
    }
  }

  if (reasons.length === 0) return undefined;
  return {
    schemaVersion: SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION,
    kind: "symphony_policy_mismatch",
    reason: `Symphony child launch policy does not cover resolved tool scope: ${[...new Set(reasons)].join("; ")}`,
    explicitToolRequest: input.explicitToolRequest,
    deniedCategoryIds: [...deniedCategoryIds] as SubagentToolScopeLaunchDenial["deniedCategoryIds"],
    deniedToolIds: [...deniedToolIds],
  };
}

function pathWithinAnyRoot(candidate: string, roots: readonly string[]): boolean {
  if (!roots.length) return false;
  return roots.some((root) => pathWithinRoot(candidate, root));
}

function writeRootCoveredByMutationLease(
  writeRoot: string,
  lease: SubagentRunSummary["symphonyMutationWorkspaceLease"] | undefined,
): boolean {
  if (!lease || lease.status !== "active") return false;
  return pathWithinAnyRoot(writeRoot, lease.writableRoots);
}

function readRootCoveredByMutationLease(
  readRoot: string,
  lease: SubagentRunSummary["symphonyMutationWorkspaceLease"] | undefined,
  inheritedAuthorityRoots: readonly string[],
): boolean {
  if (!lease || lease.status !== "active") return false;
  const sourceRoot = remapMutationLeaseReadRootToSource(readRoot, lease);
  return Boolean(sourceRoot && pathWithinAnyRoot(sourceRoot, inheritedAuthorityRoots));
}

function remapMutationLeaseReadRootToSource(
  readRoot: string,
  lease: NonNullable<SubagentRunSummary["symphonyMutationWorkspaceLease"]>,
): string | undefined {
  if (!pathWithinRoot(readRoot, lease.rootPath)) return undefined;
  const suffix = relative(lease.rootPath, readRoot);
  const sourceRoot = lease.sourceRoots[0];
  if (!sourceRoot) return undefined;
  return suffix ? resolve(sourceRoot, suffix) : sourceRoot;
}

function symphonyMutationLeaseDenialReasons(input: {
  run: SubagentRunSummary;
  policy: NonNullable<SubagentRunSummary["symphonyLaunchContracts"]>["childLaunchPolicySnapshot"];
  writeRoots: readonly string[];
}): string[] {
  if (input.policy.mutation !== "lease_required") return [];
  const lease = input.run.symphonyMutationWorkspaceLease;
  if (!lease) {
    return ["Symphony child launch policy requires an active mutation workspace lease, but no lease is bound to this launch."];
  }
  let validated: NonNullable<SubagentRunSummary["symphonyMutationWorkspaceLease"]>;
  try {
    validated = assertValidMutationWorkspaceLease(lease);
  } catch (error) {
    return [`Symphony mutation workspace lease is invalid: ${error instanceof Error ? error.message : String(error)}`];
  }
  const reasons: string[] = [];
  if (validated.status !== "active") {
    reasons.push(`Symphony mutation workspace lease ${validated.leaseId} must be active before launch; current status is ${validated.status}.`);
  }
  if (validated.parentThreadId !== input.run.parentThreadId) {
    reasons.push(`Symphony mutation workspace lease ${validated.leaseId} belongs to parent thread ${validated.parentThreadId}, not ${input.run.parentThreadId}.`);
  }
  if (validated.childThreadId !== input.run.childThreadId) {
    reasons.push(`Symphony mutation workspace lease ${validated.leaseId} belongs to child thread ${validated.childThreadId}, not ${input.run.childThreadId}.`);
  }
  if (validated.childRunId !== input.run.id) {
    reasons.push(`Symphony mutation workspace lease ${validated.leaseId} belongs to child run ${validated.childRunId}, not ${input.run.id}.`);
  }
  for (const declaredWritableRoot of validated.declaredWritableRoots) {
    if (!pathWithinAnyRoot(declaredWritableRoot, input.policy.writableRoots)) {
      reasons.push(`${declaredWritableRoot} is outside Symphony launch policy declared writable roots.`);
    }
  }
  for (const writeRoot of input.writeRoots) {
    if (!pathWithinAnyRoot(writeRoot, validated.writableRoots)) {
      reasons.push(`${writeRoot} is outside active Symphony mutation workspace lease writable roots.`);
    }
  }
  return reasons;
}

function pathWithinRoot(candidate: string, root: string): boolean {
  return isPathInside(root, candidate);
}

function uniqueResolvedToolGrants(scope: SubagentToolScopeResolution): SubagentToolScopeGrant[] {
  const grants: SubagentToolScopeGrant[] = [];
  const seen = new Set<string>();
  for (const tool of [...scope.loadedTools, ...scope.piVisibleTools]) {
    const key = `${tool.source}:${tool.id}:${tool.categoryId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    grants.push(tool);
  }
  return grants;
}

function resolvedCategoryCoveredByExactToolGrants(
  categoryId: string,
  tools: readonly SubagentToolScopeGrant[],
  policy: NonNullable<SubagentRunSummary["symphonyLaunchContracts"]>["childLaunchPolicySnapshot"],
): boolean {
  const categoryTools = tools.filter((tool) => tool.categoryId === categoryId);
  if (categoryTools.length === 0) return false;
  return categoryTools.every((tool) => {
    if (policy.mutation === "none" && tool.mutatesState) return false;
    return symphonyPolicyIncludesExactTool(policy.allowedToolIds, tool);
  });
}

function compactSubagentCapacityLeaseForLaunch(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function compactSubagentMutationWorkspaceLeaseForLaunch(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const lease = value as NonNullable<SubagentRunSummary["symphonyMutationWorkspaceLease"]>;
  return {
    leaseId: lease.leaseId,
    kind: lease.kind,
    status: lease.status,
    rootPath: lease.rootPath,
    declaredWritableRoots: lease.declaredWritableRoots,
    writableRoots: lease.writableRoots,
    acquiredAt: lease.acquiredAt,
    lastHeartbeatAt: lease.lastHeartbeatAt,
  };
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
