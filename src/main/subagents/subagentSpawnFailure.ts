import type { SubagentCapacityLeaseSnapshot } from "../../shared/subagentCapacity";
import type { SubagentDependencyMode } from "../../shared/subagentProtocol";
import type { SubagentRoleId, SubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentToolCategoryId } from "../../shared/subagentToolScope";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
} from "../../shared/subagentTypes";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import type { SubagentChildRuntimeLaunchPreflightResult } from "./subagentPiRuntimeFacade";
import { createSubagentIdempotencyKey, createSubagentPayloadFingerprint } from "./subagentIdempotency";
import type { SubagentModelScopeResolution } from "./subagentModelProviderFacade";
import { compactSubagentCapacityLeaseForPi } from "./subagentAgentStatus";
import { compactSubagentToolScopeSnapshot } from "./subagentToolScopeSnapshot";

export const SUBAGENT_SPAWN_FAILURE_SCHEMA_VERSION = "ambient-subagent-spawn-failure-v1" as const;
export const SUBAGENT_SCHEDULED_SPAWN_FIELDS = [
  "schedule",
  "scheduled",
  "scheduledAt",
  "runAt",
  "startAt",
  "notBefore",
  "delayMs",
  "runAfterMs",
  "cron",
  "rrule",
  "recurrence",
  "automation",
  "automationId",
  "automationScheduleId",
  "scheduleId",
] as const;
export const SCHEDULED_SUBAGENT_AUTOMATION_DEFERRED_REASON =
  "Scheduled sub-agent runs are deferred to Ambient automations; spawn_agent can only create live child threads attached to the active parent run, and scheduled automation runs cannot inherit live parent context.";

export type SubagentSpawnFailureStage =
  | "scheduling_policy"
  | "model_scope"
  | "runtime_launch_preflight"
  | "capacity"
  | "tool_scope";

export interface SubagentUnavailableExtensionTool {
  id: string;
  categoryId?: SubagentToolCategoryId;
}

export interface SubagentSpawnFailureParentRunRef {
  id: string;
  assistantMessageId?: string;
}

export function scheduledSubagentSpawnRequestFields(input: Record<string, unknown>): string[] {
  return SUBAGENT_SCHEDULED_SPAWN_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(input, field));
}

export function buildScheduledSubagentSpawnFailureReason(scheduledSpawnFields: readonly string[]): string {
  return `${SCHEDULED_SUBAGENT_AUTOMATION_DEFERRED_REASON} Unsupported field${scheduledSpawnFields.length === 1 ? "" : "s"}: ${scheduledSpawnFields.join(", ")}.`;
}

export function buildSubagentPreRunSpawnFailureParentMailboxInput(input: {
  parentThread: Pick<ThreadSummary, "id">;
  parentRun: SubagentSpawnFailureParentRunRef;
  phase: string;
  toolCallId: string;
  task: string;
  requestedRoleId: string;
  roleId: SubagentRoleId;
  modelScope: SubagentModelScopeResolution;
  idempotencyKey?: string;
  failureStage?: Exclude<SubagentSpawnFailureStage, "scheduling_policy">;
  runtimeLaunchPreflight?: SubagentChildRuntimeLaunchPreflightResult;
  capacityLease?: SubagentCapacityLeaseSnapshot;
  unavailableExtensionTools?: readonly SubagentUnavailableExtensionTool[];
  reason: string;
}): {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  type: "subagent.spawn_failed";
  payload: Record<string, unknown>;
  deliveryState: "queued";
  idempotencyKey: string;
} {
  const failureStage = input.failureStage ?? "model_scope";
  const payloadFingerprint = createSubagentPayloadFingerprint({
    task: input.task,
    requestedRoleId: input.requestedRoleId,
    roleId: input.roleId,
    modelScope: compactSubagentModelScopeForPi(input.modelScope),
    failureStage,
    ...(input.runtimeLaunchPreflight ? { runtimeLaunchPreflight: compactSubagentRuntimeLaunchPreflightForPi(input.runtimeLaunchPreflight) } : {}),
    ...(input.capacityLease ? { capacityLease: compactSubagentCapacityLeaseForPi(input.capacityLease) } : {}),
    ...(input.unavailableExtensionTools ? { unavailableExtensionTools: input.unavailableExtensionTools } : {}),
    reason: input.reason,
  });
  const idempotencyKey = input.idempotencyKey ??
    createSubagentIdempotencyKey({
      operation: "spawn-failed",
      parentRunId: input.parentRun.id,
      payloadFingerprint,
    });
  return {
    parentThreadId: input.parentThread.id,
    parentRunId: input.parentRun.id,
    ...(input.parentRun.assistantMessageId ? { parentMessageId: input.parentRun.assistantMessageId } : {}),
    type: "subagent.spawn_failed",
    payload: {
      schemaVersion: SUBAGENT_SPAWN_FAILURE_SCHEMA_VERSION,
      phase: input.phase,
      failureStage,
      parentThreadId: input.parentThread.id,
      parentRunId: input.parentRun.id,
      ...(input.parentRun.assistantMessageId ? { parentMessageId: input.parentRun.assistantMessageId } : {}),
      toolCallId: input.toolCallId,
      idempotencyKey,
      taskPreview: previewSubagentSpawnText(input.task),
      requestedRoleId: input.requestedRoleId,
      roleId: input.roleId,
      modelScope: compactSubagentModelScopeForPi(input.modelScope),
      ...(input.runtimeLaunchPreflight ? { runtimeLaunchPreflight: compactSubagentRuntimeLaunchPreflightForPi(input.runtimeLaunchPreflight) } : {}),
      ...(input.capacityLease ? { capacityLease: compactSubagentCapacityLeaseForPi(input.capacityLease) } : {}),
      ...(input.unavailableExtensionTools ? { unavailableExtensionTools: input.unavailableExtensionTools } : {}),
      reason: previewSubagentSpawnText(input.reason, 1200),
    },
    deliveryState: "queued",
    idempotencyKey,
  };
}

export function buildScheduledSubagentSpawnFailureParentMailboxInput(input: {
  parentThread: Pick<ThreadSummary, "id">;
  parentRun: SubagentSpawnFailureParentRunRef;
  phase: string;
  toolCallId: string;
  task: string;
  requestedRoleId: string;
  roleId: SubagentRoleId;
  role: Pick<SubagentRoleProfile, "schedulingPolicy">;
  scheduledSpawnFields: readonly string[];
  idempotencyKey?: string;
}): {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  type: "subagent.spawn_failed";
  payload: Record<string, unknown>;
  deliveryState: "queued";
  idempotencyKey: string;
} {
  const reason = buildScheduledSubagentSpawnFailureReason(input.scheduledSpawnFields);
  const payloadFingerprint = createSubagentPayloadFingerprint({
    task: input.task,
    requestedRoleId: input.requestedRoleId,
    roleId: input.roleId,
    schedulingPolicy: input.role.schedulingPolicy,
    failureStage: "scheduling_policy",
    scheduledSpawnFields: input.scheduledSpawnFields,
    reason,
  });
  const idempotencyKey = input.idempotencyKey ??
    createSubagentIdempotencyKey({
      operation: "spawn-failed",
      parentRunId: input.parentRun.id,
      payloadFingerprint,
    });
  return {
    parentThreadId: input.parentThread.id,
    parentRunId: input.parentRun.id,
    ...(input.parentRun.assistantMessageId ? { parentMessageId: input.parentRun.assistantMessageId } : {}),
    type: "subagent.spawn_failed",
    payload: {
      schemaVersion: SUBAGENT_SPAWN_FAILURE_SCHEMA_VERSION,
      phase: input.phase,
      failureStage: "scheduling_policy",
      parentThreadId: input.parentThread.id,
      parentRunId: input.parentRun.id,
      ...(input.parentRun.assistantMessageId ? { parentMessageId: input.parentRun.assistantMessageId } : {}),
      toolCallId: input.toolCallId,
      idempotencyKey,
      taskPreview: previewSubagentSpawnText(input.task),
      requestedRoleId: input.requestedRoleId,
      roleId: input.roleId,
      schedulingPolicy: input.role.schedulingPolicy,
      scheduledSpawnFields: input.scheduledSpawnFields,
      reason: previewSubagentSpawnText(reason, 1200),
      automationGuidance: "Create scheduled background work through the automation layer; do not reuse live parent transcript state as scheduled child context.",
    },
    deliveryState: "queued",
    idempotencyKey,
  };
}

export function buildSubagentPostReservationSpawnFailureParentMailboxInput(input: {
  parentThread: Pick<ThreadSummary, "id">;
  parentRun: SubagentSpawnFailureParentRunRef;
  phase: string;
  run: Pick<SubagentRunSummary, "id" | "childThreadId" | "canonicalTaskPath" | "status">;
  toolCallId: string;
  task: string;
  requestedRoleId: string;
  roleId: SubagentRoleId;
  modelScope: SubagentModelScopeResolution;
  idempotencyKey: string;
  failureStage: Extract<SubagentSpawnFailureStage, "capacity" | "tool_scope">;
  reason: string;
  capacityLease: SubagentCapacityLeaseSnapshot;
  toolScopeSnapshot: SubagentToolScopeSnapshotSummary;
  childWorktree?: ThreadWorktreeSummary;
  approvalUnavailable: boolean;
}): {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  type: "subagent.spawn_failed";
  payload: Record<string, unknown>;
  deliveryState: "queued";
  idempotencyKey: string;
} {
  return {
    parentThreadId: input.parentThread.id,
    parentRunId: input.parentRun.id,
    ...(input.parentRun.assistantMessageId ? { parentMessageId: input.parentRun.assistantMessageId } : {}),
    type: "subagent.spawn_failed",
    payload: {
      schemaVersion: SUBAGENT_SPAWN_FAILURE_SCHEMA_VERSION,
      phase: input.phase,
      failureStage: input.failureStage,
      parentThreadId: input.parentThread.id,
      parentRunId: input.parentRun.id,
      ...(input.parentRun.assistantMessageId ? { parentMessageId: input.parentRun.assistantMessageId } : {}),
      childRunId: input.run.id,
      childThreadId: input.run.childThreadId,
      canonicalTaskPath: input.run.canonicalTaskPath,
      toolCallId: input.toolCallId,
      idempotencyKey: input.idempotencyKey,
      taskPreview: previewSubagentSpawnText(input.task),
      requestedRoleId: input.requestedRoleId,
      roleId: input.roleId,
      status: input.run.status,
      modelScope: compactSubagentModelScopeForPi(input.modelScope),
      capacityLease: compactSubagentCapacityLeaseForPi(input.capacityLease),
      toolScopeSnapshot: compactSubagentToolScopeSnapshot(input.toolScopeSnapshot),
      ...(input.childWorktree ? { childWorktree: compactSubagentThreadWorktreeForPi(input.childWorktree) } : {}),
      approvalMode: input.toolScopeSnapshot.scope.approvalMode,
      approvalUnavailable: input.approvalUnavailable,
      reason: previewSubagentSpawnText(input.reason, 1200),
      resultArtifact: buildSubagentSpawnBlockedResultArtifact(input.run, input.reason),
    },
    deliveryState: "queued",
    idempotencyKey: input.idempotencyKey,
  };
}

export function buildSubagentChildReservationMessage(input: {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath" | "status">;
  role: Pick<SubagentRoleProfile, "label" | "schedulingPolicy">;
  task: string;
  dependencyMode: SubagentDependencyMode;
}): string {
  return [
    `Sub-agent reserved: ${input.role.label}`,
    `Canonical path: ${input.run.canonicalTaskPath}`,
    `Run id: ${input.run.id}`,
    `Status: ${input.run.status}`,
    `Dependency mode: ${input.dependencyMode}`,
    `Scheduling policy: ${input.role.schedulingPolicy}`,
    "",
    "Task:",
    input.task,
    "",
    "Phase 2 note: this child thread is durable and inspectable. When a live child runtime is attached, Ambient starts the child Pi session and records runtime events here.",
  ].join("\n");
}

export function buildSubagentChildLaunchBlockedMessage(input: {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath">;
  role: Pick<SubagentRoleProfile, "label" | "schedulingPolicy">;
  task: string;
  dependencyMode: SubagentDependencyMode;
  reason: string;
}): string {
  return [
    `Sub-agent launch blocked: ${input.role.label}`,
    `Canonical path: ${input.run.canonicalTaskPath}`,
    `Run id: ${input.run.id}`,
    "Status: failed",
    `Dependency mode: ${input.dependencyMode}`,
    `Scheduling policy: ${input.role.schedulingPolicy}`,
    `Reason: ${input.reason}`,
    "",
    "Task:",
    input.task,
    "",
    "No child model session was started.",
  ].join("\n");
}

export function buildSubagentSpawnText(
  run: Pick<SubagentRunSummary, "id" | "childThreadId" | "canonicalTaskPath" | "status" | "startedAt">,
  orchestrationStarted: boolean,
): string {
  return [
    `${orchestrationStarted ? "Started" : "Reserved"} sub-agent ${run.canonicalTaskPath}.`,
    `childRunId: ${run.id}`,
    `childThreadId: ${run.childThreadId}`,
    `status: ${run.status}`,
    "",
    orchestrationStarted
      ? "The child Pi session is running in the visible child thread. Use wait_agent when the parent needs the result before proceeding."
      : "Ambient created the visible child thread and queued the task, but no live child runtime is attached in this execution context.",
  ].join("\n");
}

export function buildSubagentSpawnBlockedText(
  run: Pick<SubagentRunSummary, "id" | "childThreadId" | "canonicalTaskPath" | "status">,
  reason: string,
): string {
  const hint = spawnBlockedRecoveryHint(run, reason);
  return [
    `Sub-agent ${run.canonicalTaskPath} was not started.`,
    `childRunId: ${run.id}`,
    `childThreadId: ${run.childThreadId}`,
    `status: ${run.status}`,
    `reason: ${reason}`,
    "",
    "The child thread is visible for inspection, but no child Pi/model session was started.",
    hint,
  ].filter(Boolean).join("\n");
}

function spawnBlockedRecoveryHint(
  run: Pick<SubagentRunSummary, "canonicalTaskPath">,
  reason: string,
): string {
  if (!/workspace\.write|isolated worktree/i.test(reason)) return "";
  if (/(?:^|:)worker\b/.test(run.canonicalTaskPath)) {
    return "Recovery: worker children mutate files and require an approved isolated worktree. If the task is only drafting, planning, reviewing, or analysis, retry with roleId drafter/reviewer and omit workspace.write.";
  }
  return "Recovery: if this child only needs to draft, plan, review, or analyze, retry spawn_agent without workspace.write/toolScope and have the child return its work in the structured result instead of writing a file. Use roleId worker with isolated worktree only for real file mutations.";
}

export function buildSubagentExistingRunText(run: Pick<SubagentRunSummary, "id" | "childThreadId" | "canonicalTaskPath" | "status">): string {
  return [
    `Reusing existing sub-agent reservation ${run.canonicalTaskPath}.`,
    `childRunId: ${run.id}`,
    `childThreadId: ${run.childThreadId}`,
    `status: ${run.status}`,
  ].join("\n");
}

export function buildSubagentSpawnBlockedResultArtifact(
  run: Pick<SubagentRunSummary, "id" | "childThreadId">,
  reason: string,
): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: run.id,
    status: "failed",
    partial: false,
    summary: `Sub-agent launch failed before model execution: ${reason}`,
    childThreadId: run.childThreadId,
  };
}

export function compactSubagentThreadWorktreeForPi(worktree: ThreadWorktreeSummary): Record<string, unknown> {
  return {
    threadId: worktree.threadId,
    projectRoot: worktree.projectRoot,
    worktreePath: worktree.worktreePath,
    branchName: worktree.branchName,
    baseRef: worktree.baseRef,
    upstream: worktree.upstream,
    status: worktree.status,
    createdAt: worktree.createdAt,
    updatedAt: worktree.updatedAt,
    lastCheckpointId: worktree.lastCheckpointId,
    error: worktree.error,
  };
}

export function compactSubagentRuntimeLaunchPreflightForPi(preflight: SubagentChildRuntimeLaunchPreflightResult): Record<string, unknown> {
  return {
    schemaVersion: preflight.schemaVersion,
    runtime: preflight.runtime,
    allowed: preflight.allowed,
    blockers: preflight.blockers.map((blocker) => previewSubagentSpawnText(blocker, 500)),
    warnings: preflight.warnings.map((warning) => previewSubagentSpawnText(warning, 500)),
    ...(preflight.capacity ? { capacity: compactSubagentRuntimeLaunchPreflightCapacityForPi(preflight.capacity) } : {}),
    ...(preflight.details ? { details: compactSubagentRuntimeLaunchPreflightDetailsForPi(preflight.details) } : {}),
  };
}

export function compactSubagentModelScopeForPi(scope: SubagentModelScopeResolution): Record<string, unknown> {
  return {
    schemaVersion: scope.schemaVersion,
    source: scope.source,
    selectedModelId: scope.selectedModelId,
    ...(scope.requestedModelId ? { requestedModelId: scope.requestedModelId } : {}),
    ...(scope.parentModelId ? { parentModelId: scope.parentModelId } : {}),
    roleDefaultModelId: scope.roleDefaultModelId,
    profile: {
      profileId: scope.profile.profileId,
      providerId: scope.profile.providerId,
      modelId: scope.profile.modelId,
      label: scope.profile.label,
      locality: scope.profile.locality,
      toolUse: scope.profile.toolUse,
      structuredOutput: scope.profile.structuredOutput,
      supportsVision: scope.profile.supportsVision,
      supportsAudio: scope.profile.supportsAudio,
      costClass: scope.profile.costClass,
      trustClass: scope.profile.trustClass,
      privacyLabel: scope.profile.privacyLabel,
      available: scope.profile.available,
      selectableAsSubagent: scope.profile.selectableAsSubagent,
      supportsStreaming: scope.profile.supportsStreaming,
      ...(scope.profile.unavailableReason ? { unavailableReason: scope.profile.unavailableReason } : {}),
      ...(scope.profile.contextWindowTokens !== undefined ? { contextWindowTokens: scope.profile.contextWindowTokens } : {}),
      ...(scope.profile.maxOutputTokens !== undefined ? { maxOutputTokens: scope.profile.maxOutputTokens } : {}),
      ...(scope.profile.memoryClass !== undefined ? { memoryClass: scope.profile.memoryClass } : {}),
      ...(scope.profile.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: scope.profile.estimatedResidentMemoryBytes } : {}),
      providerQuirks: scope.profile.providerQuirks.map((quirk) => previewSubagentSpawnText(quirk, 500)),
    },
    warnings: scope.warnings,
    blockingReasons: scope.blockingReasons,
    candidateDiagnostics: scope.candidateDiagnostics.map((candidate) => ({
      schemaVersion: candidate.schemaVersion,
      source: candidate.source,
      modelId: candidate.modelId,
      profileId: candidate.profileId,
      providerId: candidate.providerId,
      label: candidate.label,
      selected: candidate.selected,
      eligible: candidate.eligible,
      locality: candidate.locality,
      toolUse: candidate.toolUse,
      structuredOutput: candidate.structuredOutput,
      selectableAsSubagent: candidate.selectableAsSubagent,
      supportsStreaming: candidate.supportsStreaming,
      available: candidate.available,
      ...(candidate.unavailableReason ? { unavailableReason: candidate.unavailableReason } : {}),
      ...(candidate.contextWindowTokens !== undefined ? { contextWindowTokens: candidate.contextWindowTokens } : {}),
      ...(candidate.maxOutputTokens !== undefined ? { maxOutputTokens: candidate.maxOutputTokens } : {}),
      capabilityDiagnostics: candidate.capabilityDiagnostics,
      blockingReasons: candidate.blockingReasons,
    })),
  };
}

export function compactSubagentParentMailboxForPi(event: SubagentParentMailboxEventSummary): Record<string, unknown> {
  const payload = objectInput(event.payload);
  const childRunIds = uniqueStrings([
    typeof payload.childRunId === "string" ? payload.childRunId : undefined,
    ...arrayInput(payload.childRunIds).filter((runId): runId is string => typeof runId === "string"),
    ...arrayInput(payload.childRuns)
      .map((item) => objectInput(item).runId)
      .filter((runId): runId is string => typeof runId === "string"),
  ]);
  const childDecisionRequest = compactChildDecisionRequestForPi(payload.childDecisionRequest);
  const symphonyDecisionOptions = compactSymphonyDecisionOptionsForPi(payload.symphonyDecisionOptions);
  return {
    id: event.id,
    parentThreadId: event.parentThreadId,
    parentRunId: event.parentRunId,
    ...(event.parentMessageId ? { parentMessageId: event.parentMessageId } : {}),
    type: event.type,
    deliveryState: event.deliveryState,
    ...(event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : {}),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    notificationCount: typeof payload.notificationCount === "number" ? payload.notificationCount : undefined,
    childRunIds,
    ...(childDecisionRequest ? { childDecisionRequest } : {}),
    ...(symphonyDecisionOptions.length ? { symphonyDecisionOptions } : {}),
  };
}

export function previewSubagentSpawnText(text: string, limit = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function compactSubagentRuntimeLaunchPreflightCapacityForPi(
  capacity: NonNullable<SubagentChildRuntimeLaunchPreflightResult["capacity"]>,
): Record<string, unknown> {
  return {
    ...(capacity.localMemory ? { localMemory: capacity.localMemory } : {}),
  };
}

function compactSubagentRuntimeLaunchPreflightDetailsForPi(details: Record<string, unknown>): Record<string, unknown> {
  const launchReadiness = objectInput(details.launchReadiness);
  if (launchReadiness.schemaVersion === "ambient-local-text-runtime-launch-readiness-v1") {
    const descriptor = objectInput(launchReadiness.descriptor);
    return {
      launchReadiness: {
        schemaVersion: launchReadiness.schemaVersion,
        ready: launchReadiness.ready,
        blockers: Array.isArray(launchReadiness.blockers)
          ? launchReadiness.blockers.map((blocker) => previewSubagentSpawnText(String(blocker), 500))
          : [],
        warnings: Array.isArray(launchReadiness.warnings)
          ? launchReadiness.warnings.map((warning) => previewSubagentSpawnText(String(warning), 500))
          : [],
        descriptor: {
          runtimeId: descriptor.runtimeId,
          providerId: descriptor.providerId,
          modelId: descriptor.modelId,
          profileId: descriptor.profileId,
          command: typeof descriptor.command === "string" ? previewSubagentSpawnText(descriptor.command, 500) : descriptor.command,
          argCount: Array.isArray(descriptor.args) ? descriptor.args.length : undefined,
          cwd: descriptor.cwd,
          stateRootPath: descriptor.stateRootPath,
          healthUrl: descriptor.healthUrl,
          startupTimeoutMs: descriptor.startupTimeoutMs,
          idleTimeoutMs: descriptor.idleTimeoutMs,
          estimatedResidentMemoryBytes: descriptor.estimatedResidentMemoryBytes,
        },
      },
    };
  }
  return { detailKeys: Object.keys(details).sort() };
}

function objectInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayInput(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compactChildDecisionRequestForPi(value: unknown): Record<string, unknown> | undefined {
  const request = objectInput(value);
  const requestId = stringInput(request.requestId);
  const barrierId = stringInput(request.barrierId);
  const parentRunId = stringInput(request.parentRunId);
  const schemaVersion = stringInput(request.schemaVersion);
  const reason = stringInput(request.reason);
  const recommendedOption = stringInput(request.recommendedOption);
  if (!requestId || !barrierId || !parentRunId) return undefined;
  const options = stringArrayInput(request.options);
  return {
    ...(schemaVersion ? { schemaVersion } : {}),
    requestId,
    barrierId,
    parentRunId,
    childRunIds: stringArrayInput(request.childRunIds),
    ...(reason ? { reason } : {}),
    options,
    ...(recommendedOption ? { recommendedOption } : {}),
    optionActions: compactChildDecisionOptionActionsForPi(request.optionActions),
    evidenceRefs: stringArrayInput(request.evidenceRefs),
  };
}

function compactChildDecisionOptionActionsForPi(value: unknown): Record<string, unknown>[] {
  return arrayInput(value).flatMap((item) => {
    const action = objectInput(item);
    const option = stringInput(action.option);
    const toolAction = stringInput(action.toolAction);
    const decision = stringInput(action.decision);
    if (!option || !toolAction || !decision) return [];
    return [{
      option,
      toolAction,
      decision,
      ...(action.requiresUserDecision === true ? { requiresUserDecision: true } : {}),
      ...(action.requiresPartialSummary === true ? { requiresPartialSummary: true } : {}),
    }];
  });
}

function compactSymphonyDecisionOptionsForPi(value: unknown): Record<string, unknown>[] {
  return arrayInput(value).flatMap((item) => {
    const option = objectInput(item);
    const id = stringInput(option.id);
    if (!id) return [];
    const label = stringInput(option.label);
    return [{
      id,
      ...(label ? { label: previewSubagentSpawnText(label, 120) } : {}),
      recommended: option.recommended === true,
    }];
  });
}

function stringArrayInput(value: unknown): string[] {
  return uniqueStrings(arrayInput(value).map((item) => typeof item === "string" ? item : undefined));
}

function stringInput(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}
