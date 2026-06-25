import type { AmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import type { SubagentParentMailboxEventSummary, SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";

export function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "child-1",
    title: "Child",
    workspacePath: "/workspace",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    messageCount: 0,
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "local/text-4b",
    thinkingLevel: "medium",
    kind: "subagent_child",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    subagentRunId: "run-1",
    collapsedByDefault: true,
    childStatus: "running",
    ...overrides,
  } as ThreadSummary;
}

export function run(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "run-1",
    protocolVersion: "ambient-subagent-protocol-v1",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    parentMessageId: "message-1",
    childThreadId: "child-1",
    canonicalTaskPath: "root/0:summarizer",
    roleId: "summarizer",
    dependencyMode: "required",
    status: "running",
    featureFlagSnapshot: {
      schemaVersion: "ambient-feature-flags-v1",
      generatedAt: "2026-06-05T00:00:00.000Z",
      flags: {
        "ambient.subagents": {
          id: "ambient.subagents",
          enabled: true,
          source: "settings",
          defaultEnabled: false,
          settingsEnabled: true,
        },
      },
    },
    modelRuntimeSnapshot: modelRuntimeSnapshot(),
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  } as SubagentRunSummary;
}

export function barrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    childRunIds: ["run-1"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    timeoutMs: 30_000,
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

export function parentMailboxEvent(overrides: Partial<SubagentParentMailboxEventSummary> = {}): SubagentParentMailboxEventSummary {
  return {
    id: "parent-mailbox-1",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    parentMessageId: "message-1",
    type: "subagent.batch_progress",
    payload: {},
    deliveryState: "queued",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:10.000Z",
    ...overrides,
  };
}

export function waitBarrierDecisionPayload(input: {
  waitBarrierId: string;
  decision: "continue_with_partial" | "retry_child" | "detach_child" | "cancel_parent" | "fail_parent";
  barrierStatus: string;
  childRunIds: string[];
  userDecisionPreview?: string;
  partialSummaryPreview?: string;
  retryRequestedRunIds?: string[];
  retryAcceptedRunIds?: string[];
  retryMailboxEventIds?: string[];
  detachedRunIds?: string[];
  cancelledRunIds?: string[];
  stoppedChildRunIds?: string[];
  unchangedRunIds?: string[];
  cancelledMailboxEventIds?: string[];
  parentCancellationRequested?: boolean;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-decision-v1",
    waitBarrierId: input.waitBarrierId,
    decision: input.decision,
    barrierStatus: input.barrierStatus,
    dependencyMode: "required_all",
    failurePolicy: "ask_user",
    childRunIds: input.childRunIds,
    childStatuses: input.childRunIds.map((childRunId) => ({ childRunId, status: "failed" })),
    ...(input.userDecisionPreview ? { userDecisionPreview: input.userDecisionPreview } : {}),
    ...(input.partialSummaryPreview ? { partialSummaryPreview: input.partialSummaryPreview } : {}),
    ...(input.retryRequestedRunIds?.length ? { retryRequestedRunIds: input.retryRequestedRunIds } : {}),
    ...(input.retryAcceptedRunIds?.length ? { retryAcceptedRunIds: input.retryAcceptedRunIds } : {}),
    ...(input.retryMailboxEventIds?.length ? { retryMailboxEventIds: input.retryMailboxEventIds } : {}),
    ...(input.detachedRunIds?.length ? { detachedRunIds: input.detachedRunIds } : {}),
    ...(input.cancelledRunIds?.length ? { cancelledRunIds: input.cancelledRunIds } : {}),
    ...(input.stoppedChildRunIds?.length ? { stoppedChildRunIds: input.stoppedChildRunIds } : {}),
    ...(input.unchangedRunIds?.length ? { unchangedRunIds: input.unchangedRunIds } : {}),
    ...(input.cancelledMailboxEventIds?.length ? { cancelledMailboxEventIds: input.cancelledMailboxEventIds } : {}),
    ...(input.parentCancellationRequested ? { parentCancellationRequested: true } : {}),
  };
}

export function callableWorkflowTask(overrides: Partial<CallableWorkflowTaskSummary> = {}): CallableWorkflowTaskSummary {
  return {
    id: "callable-task-1",
    launchId: "callable-workflow:launch-1",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    parentMessageId: "message-1",
    toolCallId: "tool-call-1",
    toolId: "symphony.map_reduce",
    toolName: "symphony_map_reduce",
    sourceKind: "symphony_recipe",
    title: "Symphony Map-Reduce",
    status: "queued",
    statusLabel: "Queued",
    blocking: true,
    defaultCollapsed: true,
    progressVisible: true,
    tokenCostTracking: true,
    pauseResumeCancel: true,
    cancelHandle: "callable-workflow-task:callable-task-1",
    runnerTarget: "workflowCompilerService",
    runnerDeferredReason: "callable_workflow_runner_not_connected",
    executionPlan: {},
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

export function callableWorkflowLaunchCard(): NonNullable<CallableWorkflowTaskSummary["launchCard"]> {
  return {
    schemaVersion: "ambient-callable-workflow-launch-card-v1",
    title: "Symphony Map-Reduce",
    sourceKind: "symphony_recipe",
    riskLevel: "high",
    estimatedAgents: 12,
    maxFanout: 12,
    maxDepth: 2,
    estimatedTokenBudget: 180_000,
    tokenBudgetEstimated: true,
    estimatedLocalMemoryBytes: 8 * 1024 * 1024 * 1024,
    localMemoryEstimated: true,
    costEstimateLabel: "Budgeted up to 180,000 tokens; provider dollar cost is estimated after runtime pricing is known.",
    toolMutationScope:
      "Recipe and user scope define allowed tools; mutating child actions require approval, child identifiers, and worktree isolation.",
    checkpointResume:
      "Compile to a persisted workflow artifact before running; visible runs must expose progress, pause/resume/cancel, and restart evidence.",
    approvalFailureHandling:
      "Denied, unavailable, or non-interactive approvals leave the workflow blocked or needing attention; the parent must not synthesize it as complete.",
    defaultCollapsed: true,
    blocking: true,
    smallSliceRecommended: true,
    requireConfirmation: true,
    requirementIds: ["estimated_agents", "token_cost_budget", "tool_mutation_scope", "checkpoint_resume", "approval_failure_handling"],
    metricTemplateIds: ["map_reduce-metric"],
    policyWarnings: ["May fan out to as many as 12 child threads."],
  };
}

export function callableWorkflowBlockingPayload(overrides: {
  tasks: Array<Record<string, unknown>>;
  taskIds: string[];
  waitingTaskIds: string[];
  attentionTaskIds: string[];
  workflowArtifactIds: string[];
  workflowRunIds: string[];
}) {
  return {
    schemaVersion: "ambient-callable-workflow-parent-blocking-v1",
    reason: "blocking_callable_workflow_not_synthesis_safe",
    message: "Parent final answer blocked because blocking callable workflow work is not safe for synthesis.",
    instruction: "Do not synthesize workflow work.",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    parentMessageId: "message-1",
    synthesisAllowed: false,
    parentFinalizationBlocked: true,
    launchIds: overrides.tasks.map((task) => String(task.launchId ?? task.id ?? "")),
    allowedUserChoices: [
      { id: "wait_again", label: "Wait again", action: "wait_for_workflow" },
      { id: "cancel_parent", label: "Cancel parent run", action: "cancel_parent_run" },
    ],
    ...overrides,
  };
}

export function spawnFailurePayload() {
  return {
    schemaVersion: "ambient-subagent-spawn-failure-v1",
    failureStage: "model_scope",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    toolCallId: "spawn-bad-model",
    requestedRoleId: "explorer",
    roleId: "explorer",
    reason:
      "Selected model is not eligible for sub-agent runs (custom/unregistered-model): Model is not registered in this Ambient Desktop build.",
    modelScope: {
      schemaVersion: "ambient-subagent-model-scope-v1",
      source: "caller_override",
      requestedModelId: "custom/unregistered-model",
      roleDefaultModelId: "local/text-4b",
      selectedModelId: "custom/unregistered-model",
      profile: {
        profileId: "unknown:custom/unregistered-model",
        providerId: "unknown",
        modelId: "custom/unregistered-model",
        label: "Unknown model",
        locality: "cloud",
        toolUse: "none",
        structuredOutput: "none",
        available: false,
        selectableAsSubagent: false,
        supportsStreaming: false,
        unavailableReason: "Model is not registered in this Ambient Desktop build.",
      },
      warnings: [],
      blockingReasons: [
        "Model is not registered in this Ambient Desktop build.",
        "Model custom/unregistered-model is not selectable for sub-agent delegation.",
        "Model custom/unregistered-model does not support required sub-agent streaming.",
      ],
      candidateDiagnostics: [
        {
          schemaVersion: "ambient-subagent-model-scope-candidate-v1",
          source: "caller_override",
          modelId: "custom/unregistered-model",
          profileId: "unknown:custom/unregistered-model",
          providerId: "unknown",
          label: "Unknown model",
          selected: true,
          eligible: false,
          locality: "cloud",
          toolUse: "none",
          structuredOutput: "none",
          selectableAsSubagent: false,
          supportsStreaming: false,
          available: false,
          unavailableReason: "Model is not registered in this Ambient Desktop build.",
          capabilityDiagnostics: [
            {
              capability: "availability",
              status: "fail",
              required: "registered and available runtime profile",
              actual: "unavailable",
              reason: "Model is not registered in this Ambient Desktop build.",
            },
          ],
          blockingReasons: ["Model is not registered in this Ambient Desktop build."],
        },
      ],
    },
  };
}

export function barrierDecisionArtifact(input: {
  decision: "continue_with_partial" | "retry_child" | "detach_child" | "cancel_parent" | "fail_parent";
  userDecision?: string;
  partialSummary?: string;
  retryRequestedRunIds?: string[];
  retryAcceptedRunIds?: string[];
  retryMailboxEventIds?: string[];
  detachedRunIds?: string[];
  cancelledRunIds?: string[];
  stoppedChildRunIds?: string[];
  unchangedRunIds?: string[];
  cancelledWaitBarrierIds?: string[];
  cancelledMailboxEventIds?: string[];
  parentCancellationRequested?: boolean;
}): NonNullable<SubagentWaitBarrierSummary["resolutionArtifact"]> {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
    childRunIds: ["run-1"],
    childStatuses: [{ childRunId: "run-1", status: "failed" }],
    synthesisAllowed: input.decision === "continue_with_partial",
    explicitPartial: input.decision === "continue_with_partial",
    resultArtifact: null,
    ...(input.retryRequestedRunIds?.length ? { retryRequestedRunIds: input.retryRequestedRunIds } : {}),
    ...(input.retryAcceptedRunIds?.length ? { retryAcceptedRunIds: input.retryAcceptedRunIds } : {}),
    ...(input.retryMailboxEventIds?.length ? { retryMailboxEventIds: input.retryMailboxEventIds } : {}),
    ...(input.detachedRunIds?.length ? { detachedRunIds: input.detachedRunIds } : {}),
    ...(input.cancelledRunIds?.length ? { cancelledRunIds: input.cancelledRunIds } : {}),
    ...(input.stoppedChildRunIds?.length ? { stoppedChildRunIds: input.stoppedChildRunIds } : {}),
    ...(input.unchangedRunIds?.length ? { unchangedRunIds: input.unchangedRunIds } : {}),
    ...(input.cancelledWaitBarrierIds?.length ? { cancelledWaitBarrierIds: input.cancelledWaitBarrierIds } : {}),
    ...(input.cancelledMailboxEventIds?.length ? { cancelledMailboxEventIds: input.cancelledMailboxEventIds } : {}),
    ...(input.parentCancellationRequested ? { parentCancellationRequested: true } : {}),
    userDecision: {
      schemaVersion: "ambient-subagent-user-decision-v1",
      decision: input.decision,
      userDecision: input.userDecision ?? null,
      partialSummary: input.partialSummary ?? null,
      decidedAt: "2026-06-05T00:01:00.000Z",
      toolCallId: "tool-call-1",
      idempotencyKey: "barrier-decision:test",
    },
  };
}

export function barrierChildToneForTest(status: SubagentRunSummary["status"]) {
  if (status === "running" || status === "starting") return "active";
  if (status === "reserved") return "warning";
  if (status === "completed") return "success";
  if (status === "failed" || status === "stopped" || status === "cancelled") return "danger";
  return "neutral";
}

export function modelRuntimeSnapshot(): AmbientModelRuntimeSnapshot {
  return {
    schemaVersion: "ambient-model-runtime-snapshot-v1",
    resolvedAt: "2026-06-05T00:00:00.000Z",
    requestedModelId: "local/text-4b",
    profile: {
      schemaVersion: "ambient-model-runtime-profile-v1",
      profileId: "local:local/text-4b:startup",
      providerId: "local",
      modelId: "local/text-4b",
      label: "Local Text startup runtime",
      selectableAsMain: false,
      selectableAsSubagent: true,
      available: true,
      contextWindowTokens: 8192,
      maxOutputTokens: 2048,
      supportsStreaming: true,
      toolUse: "none",
      structuredOutput: "none",
      supportsVision: false,
      supportsAudio: false,
      locality: "local",
      costClass: "local",
      trustClass: "local-user-managed",
      privacyLabel: "Local user-managed text runtime",
      memoryClass: "small-local",
      providerQuirks: [],
    },
  };
}
