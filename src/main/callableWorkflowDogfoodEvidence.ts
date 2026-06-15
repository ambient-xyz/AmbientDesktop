import type {
  CallableWorkflowTaskRestartReconciliationSummary,
  CallableWorkflowTaskSummary,
  WorkflowArtifactSummary,
  WorkflowRunSummary,
} from "../shared/types";
import {
  CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
  CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
  callableWorkflowParentBlockingAllowedUserChoices,
  callableWorkflowParentBlockingIdempotencyKey,
  resolveCallableWorkflowParentBlocking,
} from "./callableWorkflowParentBlocking";
import { callableWorkflowExecutionPlanFromTask } from "./callableWorkflowTaskQueue";
import {
  SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION,
  type SubagentToolScopeLaunchDenial,
} from "./subagentToolScopeLaunchPolicy";

export const CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_SCHEMA_VERSION =
  "ambient-callable-workflow-dogfood-evidence-v1" as const;

export interface CallableWorkflowDogfoodEvidenceInput {
  task: CallableWorkflowTaskSummary;
  artifact: WorkflowArtifactSummary;
  workflowRun: WorkflowRunSummary;
  workflowRunEventTypes: readonly string[];
  restartSummary: CallableWorkflowTaskRestartReconciliationSummary;
  mutationOutput: CallableWorkflowDogfoodMutationOutputEvidence;
  blockingTaskBeforeCompletion?: CallableWorkflowTaskSummary;
  deniedWorkflowScopeProof?: {
    launchDenials: readonly SubagentToolScopeLaunchDenial[];
    bridgeReasons: readonly string[];
  };
  createdAt?: string;
}

export interface CallableWorkflowDogfoodMutationOutputEvidence {
  kind: "staged_file";
  stagedRelativePath: string;
  stagedFileSha256: string;
  fullArtifactPath: string;
  fullArtifactBytes: number;
  fullArtifactSha256: string;
  boundedPreview: string;
  previewBytes: number;
  previewTruncated: boolean;
  parentWorkspaceUnchanged: boolean;
}

export type CallableWorkflowDogfoodMaturityAssertionId =
  | "workflow_launch_card_bounds"
  | "workflow_mutating_child_worker"
  | "workflow_parent_blocking_completion"
  | "workflow_denied_child_scope"
  | "workflow_restart_repair";

export interface CallableWorkflowDogfoodMaturityAssertion {
  id: CallableWorkflowDogfoodMaturityAssertionId;
  status: "passed";
  capabilities: string[];
  evidence: string[];
}

export interface CallableWorkflowDogfoodEvidence {
  schemaVersion: typeof CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_SCHEMA_VERSION;
  createdAt: string;
  task: {
    id: string;
    launchId: string;
    toolName: string;
    sourceKind: string;
    status: CallableWorkflowTaskSummary["status"];
    blocking: boolean;
    workflowArtifactId?: string;
    workflowRunId?: string;
  };
  launchCard: {
    present: boolean;
    riskLevel?: string;
    estimatedAgents?: number;
    maxFanout?: number;
    maxDepth?: number;
    estimatedTokenBudget?: number;
    estimatedLocalMemoryBytes?: number;
    defaultCollapsed?: boolean;
    blocking?: boolean;
    pauseResumeCancel?: boolean;
    checkpointResume?: string;
    approvalFailureHandling?: string;
    requirementIds: string[];
    metricTemplateIds: string[];
    policyWarnings: string[];
  };
  childCaller: {
    kind: string;
    threadId?: string;
    runId?: string;
    subagentRunId?: string;
    canonicalTaskPath?: string;
    parentThreadId?: string;
    parentRunId?: string;
  };
  mutation: {
    artifactId: string;
    mutationPolicy: WorkflowArtifactSummary["manifest"]["mutationPolicy"];
    approvalRequired: boolean;
    approvalSource?: string;
    approvalScope?: string;
    worktreeRequired: boolean;
    worktreeIsolated: boolean;
    worktreeStatus?: string;
    worktreePathPresent: boolean;
    nestedFanoutRequired: boolean;
    nestedFanoutSource?: string;
  };
  mutationOutput: CallableWorkflowDogfoodMutationOutputEvidence;
  workflow: {
    workflowThreadId?: string;
    artifactId: string;
    artifactStatus: WorkflowArtifactSummary["status"];
    runId: string;
    runStatus: WorkflowRunSummary["status"];
    taskArtifactLinkMatches: boolean;
    taskRunLinkMatches: boolean;
  };
  taskEvents: {
    started: boolean;
    finished: boolean;
    control: boolean;
    eventTypes: string[];
  };
  parentBlocking: {
    schemaVersion: typeof CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION;
    reason: typeof CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON;
    blockedBeforeCompletion: boolean;
    unblockedAfterCompletion: boolean;
    blockedTaskIds: string[];
    waitingTaskIds: string[];
    attentionTaskIds: string[];
    allowedUserChoiceIds: string[];
    idempotencyKey: string;
    message: string;
  };
  deniedScope: {
    schemaVersion: typeof SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION;
    denied: boolean;
    denialKinds: string[];
    explicitToolRequestObserved: boolean;
    deniedCategoryIds: string[];
    deniedToolIds: string[];
    reasonSamples: string[];
    bridgeReasons: string[];
  };
  restart: {
    schemaVersion: CallableWorkflowTaskRestartReconciliationSummary["schemaVersion"];
    issueKinds: string[];
    repairedTaskIds: string[];
    diagnosticTaskIds: string[];
    terminalRepairObserved: boolean;
  };
  maturityAssertions: Record<CallableWorkflowDogfoodMaturityAssertionId, CallableWorkflowDogfoodMaturityAssertion>;
  observations: string[];
}

export interface CallableWorkflowDogfoodEvidenceValidation {
  valid: boolean;
  issues: string[];
}

export function buildCallableWorkflowDogfoodEvidence(
  input: CallableWorkflowDogfoodEvidenceInput,
): CallableWorkflowDogfoodEvidence {
  const executionPlan = callableWorkflowExecutionPlanFromTask(input.task);
  const caller = executionPlan.callerProvenance;
  const childCaller = caller.kind === "subagent_child_thread" ? caller : undefined;
  const eventTypes = [...new Set(input.workflowRunEventTypes)];
  const issueKinds = [...new Set(input.restartSummary.issues.map((issue) => issue.kind))];
  const blockingTaskBeforeCompletion = input.blockingTaskBeforeCompletion ?? callableWorkflowTaskBeforeCompletion(input.task);
  const parentBlockBefore = resolveCallableWorkflowParentBlocking({ tasks: [blockingTaskBeforeCompletion] });
  const parentBlockAfter = resolveCallableWorkflowParentBlocking({ tasks: [input.task] });
  const launchDenials = [...(input.deniedWorkflowScopeProof?.launchDenials ?? [])];
  const bridgeReasons = uniqueStrings(input.deniedWorkflowScopeProof?.bridgeReasons ?? []);
  const launchCard = input.task.launchCard;
  const evidence: CallableWorkflowDogfoodEvidence = {
    schemaVersion: CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_SCHEMA_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    task: {
      id: input.task.id,
      launchId: input.task.launchId,
      toolName: input.task.toolName,
      sourceKind: input.task.sourceKind,
      status: input.task.status,
      blocking: input.task.blocking,
      ...(input.task.workflowArtifactId ? { workflowArtifactId: input.task.workflowArtifactId } : {}),
      ...(input.task.workflowRunId ? { workflowRunId: input.task.workflowRunId } : {}),
    },
    launchCard: {
      present: !!launchCard,
      ...(launchCard?.riskLevel ? { riskLevel: launchCard.riskLevel } : {}),
      ...(typeof launchCard?.estimatedAgents === "number" ? { estimatedAgents: launchCard.estimatedAgents } : {}),
      ...(typeof launchCard?.maxFanout === "number" ? { maxFanout: launchCard.maxFanout } : {}),
      ...(typeof launchCard?.maxDepth === "number" ? { maxDepth: launchCard.maxDepth } : {}),
      ...(typeof launchCard?.estimatedTokenBudget === "number"
        ? { estimatedTokenBudget: launchCard.estimatedTokenBudget }
        : {}),
      ...(typeof launchCard?.estimatedLocalMemoryBytes === "number"
        ? { estimatedLocalMemoryBytes: launchCard.estimatedLocalMemoryBytes }
        : {}),
      ...(typeof launchCard?.defaultCollapsed === "boolean" ? { defaultCollapsed: launchCard.defaultCollapsed } : {}),
      ...(typeof launchCard?.blocking === "boolean" ? { blocking: launchCard.blocking } : {}),
      pauseResumeCancel: input.task.pauseResumeCancel,
      ...(launchCard?.checkpointResume ? { checkpointResume: launchCard.checkpointResume } : {}),
      ...(launchCard?.approvalFailureHandling ? { approvalFailureHandling: launchCard.approvalFailureHandling } : {}),
      requirementIds: [...(launchCard?.requirementIds ?? [])],
      metricTemplateIds: [...(launchCard?.metricTemplateIds ?? [])],
      policyWarnings: [...(launchCard?.policyWarnings ?? [])],
    },
    childCaller: {
      kind: caller.kind,
      ...(childCaller?.threadId ? { threadId: childCaller.threadId } : {}),
      ...(childCaller?.runId ? { runId: childCaller.runId } : {}),
      ...(childCaller?.subagentRunId ? { subagentRunId: childCaller.subagentRunId } : {}),
      ...(childCaller?.canonicalTaskPath ? { canonicalTaskPath: childCaller.canonicalTaskPath } : {}),
      ...(childCaller?.parentThreadId ? { parentThreadId: childCaller.parentThreadId } : {}),
      ...(childCaller?.parentRunId ? { parentRunId: childCaller.parentRunId } : {}),
    },
    mutation: {
      artifactId: input.artifact.id,
      mutationPolicy: input.artifact.manifest.mutationPolicy,
      approvalRequired: childCaller?.approval.required === true,
      worktreeRequired: childCaller?.worktree.required === true,
      worktreeIsolated: childCaller?.worktree.isolated === true,
      worktreePathPresent: !!childCaller?.worktree.worktreePath,
      nestedFanoutRequired: childCaller?.nestedFanout.required === true,
      ...(childCaller?.approval.source ? { approvalSource: childCaller.approval.source } : {}),
      ...(childCaller?.approval.scopeHint ? { approvalScope: childCaller.approval.scopeHint } : {}),
      ...(childCaller?.worktree.status ? { worktreeStatus: childCaller.worktree.status } : {}),
      ...(childCaller?.nestedFanout.source ? { nestedFanoutSource: childCaller.nestedFanout.source } : {}),
    },
    mutationOutput: { ...input.mutationOutput },
    workflow: {
      ...(input.artifact.workflowThreadId ? { workflowThreadId: input.artifact.workflowThreadId } : {}),
      artifactId: input.artifact.id,
      artifactStatus: input.artifact.status,
      runId: input.workflowRun.id,
      runStatus: input.workflowRun.status,
      taskArtifactLinkMatches: input.task.workflowArtifactId === input.artifact.id,
      taskRunLinkMatches: input.task.workflowRunId === input.workflowRun.id,
    },
    taskEvents: {
      started: eventTypes.includes("callable_workflow.task_started"),
      finished: eventTypes.includes("callable_workflow.task_finished"),
      control: eventTypes.includes("callable_workflow.task_control"),
      eventTypes,
    },
    parentBlocking: {
      schemaVersion: CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
      reason: CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
      blockedBeforeCompletion: parentBlockBefore?.parentFinalizationBlocked === true,
      unblockedAfterCompletion: parentBlockAfter === undefined,
      blockedTaskIds: parentBlockBefore?.taskIds ?? [],
      waitingTaskIds: parentBlockBefore?.waitingTaskIds ?? [],
      attentionTaskIds: parentBlockBefore?.attentionTaskIds ?? [],
      allowedUserChoiceIds: parentBlockBefore
        ? callableWorkflowParentBlockingAllowedUserChoices(parentBlockBefore)
          .map((choice) => String(choice.id ?? ""))
          .filter(Boolean)
        : [],
      idempotencyKey: parentBlockBefore
        ? callableWorkflowParentBlockingIdempotencyKey({
            parentRunId: input.task.parentRunId,
            block: parentBlockBefore,
          })
        : "",
      message: parentBlockBefore?.message ?? "",
    },
    deniedScope: {
      schemaVersion: SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION,
      denied: launchDenials.length > 0 || bridgeReasons.length > 0,
      denialKinds: uniqueStrings(launchDenials.map((denial) => denial.kind)),
      explicitToolRequestObserved: launchDenials.some((denial) => denial.explicitToolRequest),
      deniedCategoryIds: uniqueStrings(launchDenials.flatMap((denial) => denial.deniedCategoryIds)),
      deniedToolIds: uniqueStrings(launchDenials.flatMap((denial) => denial.deniedToolIds)),
      reasonSamples: uniqueStrings(launchDenials.map((denial) => denial.reason)),
      bridgeReasons,
    },
    restart: {
      schemaVersion: input.restartSummary.schemaVersion,
      issueKinds,
      repairedTaskIds: [...input.restartSummary.repairedTaskIds],
      diagnosticTaskIds: [...input.restartSummary.diagnosticTaskIds],
      terminalRepairObserved: issueKinds.includes("workflow_run_terminal_task_unfinished") &&
        input.restartSummary.repairedTaskIds.length > 0,
    },
    maturityAssertions: {
      workflow_launch_card_bounds: {
        id: "workflow_launch_card_bounds",
        status: "passed",
        capabilities: ["workflow_launch", "launch_card_bounds", "pause_resume_cancel"],
        evidence: [
          `passed: risk=${launchCard?.riskLevel ?? "missing"} agents=${launchCard?.estimatedAgents ?? "missing"} fanout=${launchCard?.maxFanout ?? "missing"} depth=${launchCard?.maxDepth ?? "missing"}`,
          `passed: tokenBudget=${launchCard?.estimatedTokenBudget ?? "missing"} localMemory=${launchCard?.estimatedLocalMemoryBytes ?? "missing"} checkpoint=${launchCard?.checkpointResume ?? "missing"}`,
          `passed: defaultCollapsed=${launchCard?.defaultCollapsed === true} blocking=${launchCard?.blocking === true} pauseResumeCancel=${input.task.pauseResumeCancel === true}`,
        ],
      },
      workflow_mutating_child_worker: {
        id: "workflow_mutating_child_worker",
        status: "passed",
        capabilities: ["mutating_child_workflow", "child_scoped_approval", "isolated_child_worktree"],
        evidence: [
          `passed: approval=${childCaller?.approval.source ?? "missing"} scope=${childCaller?.approval.scopeHint ?? "missing"}`,
          `passed: worktree=${childCaller?.worktree.status ?? "missing"} isolated=${childCaller?.worktree.isolated === true} path=${!!childCaller?.worktree.worktreePath}`,
          `passed: staged=${input.mutationOutput.stagedRelativePath} parentUnchanged=${input.mutationOutput.parentWorkspaceUnchanged === true}`,
        ],
      },
      workflow_parent_blocking_completion: {
        id: "workflow_parent_blocking_completion",
        status: "passed",
        capabilities: ["parent_blocking_workflow", "workflow_launch"],
        evidence: [
          `passed: blockedBeforeCompletion=${parentBlockBefore?.parentFinalizationBlocked === true}`,
          `passed: unblockedAfterCompletion=${parentBlockAfter === undefined}`,
          `passed: choices=${parentBlockBefore ? callableWorkflowParentBlockingAllowedUserChoices(parentBlockBefore).map((choice) => choice.id).join(",") : "missing"}`,
        ],
      },
      workflow_denied_child_scope: {
        id: "workflow_denied_child_scope",
        status: "passed",
        capabilities: ["denied_workflow_scope", "child_workflow_scope"],
        evidence: [
          `passed: denials=${launchDenials.length}`,
          `passed: categories=${uniqueStrings(launchDenials.flatMap((denial) => denial.deniedCategoryIds)).join(",")}`,
          `passed: bridgeReasons=${bridgeReasons.length}`,
        ],
      },
      workflow_restart_repair: {
        id: "workflow_restart_repair",
        status: "passed",
        capabilities: ["workflow_task_rehydration", "restart_repair"],
        evidence: [
          `passed: issueKinds=${issueKinds.join(",")}`,
          `passed: repairedTaskIds=${input.restartSummary.repairedTaskIds.join(",")}`,
          `passed: diagnosticTaskIds=${input.restartSummary.diagnosticTaskIds.join(",")}`,
        ],
      },
    },
    observations: [
      "Child-originated callable workflow produced a mutating artifact only with child-scoped approval and active isolated worktree evidence.",
      "Mutating worker dogfood wrote a concrete staged file in the child worktree, kept a bounded preview plus full artifact metadata, and left the parent workspace sentinel unchanged.",
      "Parent synthesis was blocked while the required callable workflow was still running and unblocked only after the workflow task succeeded.",
      "Denied child callable workflow scope records readable launch-policy and bridge-policy reasons before execution starts.",
      "Workflow task events identify the callable workflow launch and include started and finished lifecycle evidence.",
      "Restart reconciliation observes terminal workflow runs attached to unfinished visible tasks without silently dropping evidence.",
    ],
  };
  const validation = validateCallableWorkflowDogfoodEvidence(evidence);
  if (!validation.valid) {
    throw new Error(`Callable workflow dogfood evidence is invalid: ${validation.issues.join(" ")}`);
  }
  return evidence;
}

export function validateCallableWorkflowDogfoodEvidence(input: unknown): CallableWorkflowDogfoodEvidenceValidation {
  const issues: string[] = [];
  if (!isRecord(input)) return { valid: false, issues: ["Callable workflow dogfood evidence must be an object."] };
  if (input.schemaVersion !== CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_SCHEMA_VERSION) {
    issues.push(`Callable workflow dogfood evidence schemaVersion is ${String(input.schemaVersion ?? "missing")}.`);
  }
  if (!isValidTimestamp(input.createdAt)) issues.push("Callable workflow dogfood evidence createdAt is missing or invalid.");
  const task = isRecord(input.task) ? input.task : {};
  if (task.status !== "succeeded") issues.push(`Callable workflow dogfood task status is ${String(task.status ?? "missing")}.`);
  if (task.blocking !== true) issues.push("Callable workflow dogfood task must prove a blocking workflow launch.");
  if (!nonEmptyString(task.workflowArtifactId)) issues.push("Callable workflow dogfood task is missing workflowArtifactId.");
  if (!nonEmptyString(task.workflowRunId)) issues.push("Callable workflow dogfood task is missing workflowRunId.");

  const launchCard = isRecord(input.launchCard) ? input.launchCard : {};
  if (launchCard.present !== true) issues.push("Callable workflow dogfood launch card proof is missing.");
  if (!["low", "medium", "high"].includes(stringValue(launchCard.riskLevel) ?? "")) {
    issues.push("Callable workflow dogfood launch card riskLevel is missing or invalid.");
  }
  for (const field of ["estimatedAgents", "maxFanout", "maxDepth", "estimatedTokenBudget", "estimatedLocalMemoryBytes"]) {
    if (!positiveInteger(launchCard[field])) issues.push(`Callable workflow dogfood launch card is missing ${field}.`);
  }
  if (launchCard.defaultCollapsed !== true) issues.push("Callable workflow dogfood launch card must be default collapsed.");
  if (launchCard.blocking !== true) issues.push("Callable workflow dogfood launch card must be blocking.");
  if (launchCard.pauseResumeCancel !== true) issues.push("Callable workflow dogfood task must expose pause/resume/cancel controls.");
  if (!nonEmptyString(launchCard.checkpointResume)) {
    issues.push("Callable workflow dogfood launch card is missing checkpoint/resume text.");
  }
  if (!nonEmptyString(launchCard.approvalFailureHandling)) {
    issues.push("Callable workflow dogfood launch card is missing approval failure handling text.");
  }
  if (!nonEmptyStringArray(launchCard.requirementIds)) {
    issues.push("Callable workflow dogfood launch card is missing requirementIds.");
  }
  if (!nonEmptyStringArray(launchCard.metricTemplateIds)) {
    issues.push("Callable workflow dogfood launch card is missing metricTemplateIds.");
  }

  const childCaller = isRecord(input.childCaller) ? input.childCaller : {};
  if (childCaller.kind !== "subagent_child_thread") issues.push("Callable workflow dogfood must be child-originated.");
  if (!nonEmptyString(childCaller.threadId)) issues.push("Callable workflow dogfood child caller is missing threadId.");
  if (!nonEmptyString(childCaller.runId)) issues.push("Callable workflow dogfood child caller is missing runId.");
  if (!nonEmptyString(childCaller.subagentRunId)) issues.push("Callable workflow dogfood child caller is missing subagentRunId.");
  if (!nonEmptyString(childCaller.canonicalTaskPath)) issues.push("Callable workflow dogfood child caller is missing canonicalTaskPath.");
  if (!nonEmptyString(childCaller.parentThreadId)) issues.push("Callable workflow dogfood child caller is missing parentThreadId.");
  if (!nonEmptyString(childCaller.parentRunId)) issues.push("Callable workflow dogfood child caller is missing parentRunId.");

  const mutation = isRecord(input.mutation) ? input.mutation : {};
  if (mutation.mutationPolicy === "read_only") issues.push("Callable workflow dogfood must use a mutating artifact policy.");
  if (mutation.approvalRequired !== true) issues.push("Callable workflow dogfood mutating proof must require approval.");
  if (mutation.approvalSource !== "child_bridge_policy") issues.push("Callable workflow dogfood approval source must be child_bridge_policy.");
  if (mutation.approvalScope !== "this_child_thread") issues.push("Callable workflow dogfood approval scope must be this_child_thread.");
  if (mutation.worktreeRequired !== true) issues.push("Callable workflow dogfood mutating proof must require a worktree.");
  if (mutation.worktreeIsolated !== true) issues.push("Callable workflow dogfood mutating proof must use an isolated worktree.");
  if (mutation.worktreeStatus !== "active") issues.push("Callable workflow dogfood worktree status must be active.");
  if (mutation.worktreePathPresent !== true) issues.push("Callable workflow dogfood mutating proof must include a worktree path.");
  if (mutation.nestedFanoutRequired !== true) issues.push("Callable workflow dogfood child workflow proof must require nested fanout policy.");
  if (mutation.nestedFanoutSource !== "child_bridge_policy") issues.push("Callable workflow dogfood nested fanout source must be child_bridge_policy.");

  const mutationOutput = isRecord(input.mutationOutput) ? input.mutationOutput : {};
  if (mutationOutput.kind !== "staged_file") issues.push("Callable workflow dogfood mutation output must be a staged_file proof.");
  if (!isSafeRelativePath(mutationOutput.stagedRelativePath)) {
    issues.push("Callable workflow dogfood mutation output must include a safe stagedRelativePath.");
  }
  if (!isSha256(mutationOutput.stagedFileSha256)) {
    issues.push("Callable workflow dogfood mutation output must include stagedFileSha256.");
  }
  if (!nonEmptyString(mutationOutput.fullArtifactPath)) {
    issues.push("Callable workflow dogfood mutation output must include a fullArtifactPath.");
  }
  if (!positiveInteger(mutationOutput.fullArtifactBytes)) {
    issues.push("Callable workflow dogfood mutation output must include fullArtifactBytes.");
  }
  if (!isSha256(mutationOutput.fullArtifactSha256)) {
    issues.push("Callable workflow dogfood mutation output must include fullArtifactSha256.");
  }
  if (!nonEmptyString(mutationOutput.boundedPreview)) {
    issues.push("Callable workflow dogfood mutation output must include a boundedPreview.");
  } else if (mutationOutput.boundedPreview.length > 512) {
    issues.push("Callable workflow dogfood mutation output boundedPreview must stay bounded.");
  }
  if (!positiveInteger(mutationOutput.previewBytes)) {
    issues.push("Callable workflow dogfood mutation output must include previewBytes.");
  }
  if (mutationOutput.previewTruncated !== true) {
    issues.push("Callable workflow dogfood mutation output must prove previewTruncated.");
  }
  if (mutationOutput.parentWorkspaceUnchanged !== true) {
    issues.push("Callable workflow dogfood mutation output must prove the parent workspace was unchanged.");
  }

  const workflow = isRecord(input.workflow) ? input.workflow : {};
  if (!nonEmptyString(workflow.workflowThreadId)) issues.push("Callable workflow dogfood workflow is missing workflowThreadId.");
  if (workflow.taskArtifactLinkMatches !== true) issues.push("Callable workflow dogfood task artifact link does not match.");
  if (workflow.taskRunLinkMatches !== true) issues.push("Callable workflow dogfood task run link does not match.");
  if (workflow.runStatus !== "succeeded") issues.push(`Callable workflow dogfood run status is ${String(workflow.runStatus ?? "missing")}.`);

  const taskEvents = isRecord(input.taskEvents) ? input.taskEvents : {};
  if (taskEvents.started !== true) issues.push("Callable workflow dogfood evidence is missing task_started event proof.");
  if (taskEvents.finished !== true) issues.push("Callable workflow dogfood evidence is missing task_finished event proof.");

  const parentBlocking = isRecord(input.parentBlocking) ? input.parentBlocking : {};
  if (parentBlocking.schemaVersion !== CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION) {
    issues.push("Callable workflow dogfood parent-blocking schema is missing or invalid.");
  }
  if (parentBlocking.reason !== CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON) {
    issues.push("Callable workflow dogfood parent-blocking reason is missing or invalid.");
  }
  if (parentBlocking.blockedBeforeCompletion !== true) {
    issues.push("Callable workflow dogfood must prove parent synthesis was blocked before workflow completion.");
  }
  if (parentBlocking.unblockedAfterCompletion !== true) {
    issues.push("Callable workflow dogfood must prove parent synthesis unblocks after successful workflow completion.");
  }
  if (!arrayIncludesString(parentBlocking.waitingTaskIds, stringValue(task.id) ?? "")) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing the workflow task in waitingTaskIds.");
  }
  if (!arrayIncludesString(parentBlocking.allowedUserChoiceIds, "wait_again") ||
      !arrayIncludesString(parentBlocking.allowedUserChoiceIds, "cancel_parent")) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing wait/cancel user choices.");
  }
  if (!stringValue(parentBlocking.idempotencyKey)?.startsWith("callable-workflow:parent-finalization-blocked:")) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing a stable idempotency key.");
  }
  if (!stringValue(parentBlocking.message)?.includes("Parent final answer blocked")) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing readable parent-blocked text.");
  }

  const deniedScope = isRecord(input.deniedScope) ? input.deniedScope : {};
  const deniedCategoryIds = arrayStrings(deniedScope.deniedCategoryIds);
  const deniedToolIds = arrayStrings(deniedScope.deniedToolIds);
  const reasonSamples = arrayStrings(deniedScope.reasonSamples);
  const bridgeReasons = arrayStrings(deniedScope.bridgeReasons);
  if (deniedScope.schemaVersion !== SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION) {
    issues.push("Callable workflow dogfood denied-scope schema is missing or invalid.");
  }
  if (deniedScope.denied !== true) {
    issues.push("Callable workflow dogfood must prove denied child workflow scope before execution.");
  }
  if (!arrayIncludesString(deniedScope.denialKinds, "phase4_isolation_required")) {
    issues.push("Callable workflow dogfood denied-scope proof is missing phase4_isolation_required.");
  }
  if (deniedScope.explicitToolRequestObserved !== true) {
    issues.push("Callable workflow dogfood denied-scope proof must include an explicit child workflow tool request.");
  }
  if (!deniedCategoryIds.includes("workflow.call")) {
    issues.push("Callable workflow dogfood denied-scope proof is missing workflow.call denial.");
  }
  if (!deniedToolIds.some((id) => id.startsWith("callable_workflow:ambient_workflow_"))) {
    issues.push("Callable workflow dogfood denied-scope proof is missing exact callable workflow tool denial.");
  }
  if (!reasonSamples.some((reason) => reason.includes("Requested sub-agent tool scope was denied") ||
      reason.includes("Sub-agent role/tool scope is not launchable"))) {
    issues.push("Callable workflow dogfood denied-scope proof is missing a readable denial reason.");
  }
  if (!bridgeReasons.some((reason) => reason.includes("disabled by child role policy"))) {
    issues.push("Callable workflow dogfood denied-scope proof is missing disabled child role policy reason.");
  }
  if (!bridgeReasons.some((reason) => reason.includes("requires an active isolated child worktree"))) {
    issues.push("Callable workflow dogfood denied-scope proof is missing isolated worktree reason.");
  }
  if (!bridgeReasons.some((reason) => reason.includes("nested fanout limit is exhausted"))) {
    issues.push("Callable workflow dogfood denied-scope proof is missing exhausted nested fanout reason.");
  }

  const restart = isRecord(input.restart) ? input.restart : {};
  if (restart.schemaVersion !== "ambient-callable-workflow-task-restart-v1") {
    issues.push("Callable workflow dogfood restart summary schema is missing or invalid.");
  }
  if (restart.terminalRepairObserved !== true) {
    issues.push("Callable workflow dogfood restart proof must observe workflow_run_terminal_task_unfinished repair.");
  }
  if (!Array.isArray(restart.repairedTaskIds) || restart.repairedTaskIds.length === 0) {
    issues.push("Callable workflow dogfood restart proof is missing repaired task IDs.");
  }
  if (!Array.isArray(restart.diagnosticTaskIds) || restart.diagnosticTaskIds.length === 0) {
    issues.push("Callable workflow dogfood restart proof is missing diagnostic task IDs.");
  }

  validateDogfoodMaturityAssertions(input.maturityAssertions, issues);

  const secretPaths = findSecretLikeStrings(input);
  if (secretPaths.length) {
    issues.push(`Callable workflow dogfood evidence appears to contain secret-like material at ${secretPaths.slice(0, 3).join(", ")}.`);
  }
  return { valid: issues.length === 0, issues };
}

export function summarizeCallableWorkflowDogfoodEvidence(input: CallableWorkflowDogfoodEvidence): string[] {
  const validation = validateCallableWorkflowDogfoodEvidence(input);
  return [
    `schemaVersion: ${input.schemaVersion}`,
    `task: ${input.task.id}`,
    `tool: ${input.task.toolName}`,
    `launchCard: risk=${input.launchCard.riskLevel ?? "missing"} agents=${input.launchCard.estimatedAgents ?? 0} fanout=${input.launchCard.maxFanout ?? 0} checkpoint=${input.launchCard.checkpointResume ?? "missing"}`,
    `child: ${input.childCaller.threadId ?? "missing"} / ${input.childCaller.subagentRunId ?? "missing"}`,
    `mutationPolicy: ${input.mutation.mutationPolicy}`,
    `approval: ${input.mutation.approvalSource ?? "missing"} / ${input.mutation.approvalScope ?? "missing"}`,
    `worktree: ${input.mutation.worktreeStatus ?? "missing"} isolated=${input.mutation.worktreeIsolated}`,
    `mutationOutput: ${input.mutationOutput.kind} ${input.mutationOutput.stagedRelativePath} parentUnchanged=${input.mutationOutput.parentWorkspaceUnchanged}`,
    `workflowRun: ${input.workflow.runId} ${input.workflow.runStatus}`,
    `parentBlocking: blocked=${input.parentBlocking.blockedBeforeCompletion} unblocked=${input.parentBlocking.unblockedAfterCompletion}`,
    `deniedScope: ${input.deniedScope.deniedCategoryIds.join(",")} / ${input.deniedScope.deniedToolIds.join(",")}`,
    `restartRepairObserved: ${input.restart.terminalRepairObserved}`,
    `maturityAssertions: ${summarizeDogfoodMaturityAssertions(input.maturityAssertions)}`,
    `valid: ${validation.valid}`,
    ...(validation.issues.length ? [`issues: ${validation.issues.join("; ")}`] : []),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isSafeRelativePath(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.split("/").some((part) => part === ".." || part === "");
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function callableWorkflowTaskBeforeCompletion(task: CallableWorkflowTaskSummary): CallableWorkflowTaskSummary {
  const { completedAt: _completedAt, ...draft } = task;
  return {
    ...draft,
    status: "running",
    statusLabel: "Running",
    runnerDeferredReason: task.workflowRunId ? "workflow_run_started" : "workflow_run_not_started",
    updatedAt: task.startedAt ?? task.updatedAt,
  };
}

function uniqueStrings(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).filter((value) => value.length > 0))];
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function arrayIncludesString(value: unknown, needle: string): boolean {
  return arrayStrings(value).includes(needle);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const REQUIRED_DOGFOOD_MATURITY_ASSERTIONS: {
  id: CallableWorkflowDogfoodMaturityAssertionId;
  capabilities: string[];
}[] = [{
  id: "workflow_launch_card_bounds",
  capabilities: ["workflow_launch", "launch_card_bounds", "pause_resume_cancel"],
}, {
  id: "workflow_mutating_child_worker",
  capabilities: ["mutating_child_workflow", "child_scoped_approval", "isolated_child_worktree"],
}, {
  id: "workflow_parent_blocking_completion",
  capabilities: ["parent_blocking_workflow", "workflow_launch"],
}, {
  id: "workflow_denied_child_scope",
  capabilities: ["denied_workflow_scope", "child_workflow_scope"],
}, {
  id: "workflow_restart_repair",
  capabilities: ["workflow_task_rehydration", "restart_repair"],
}];

function summarizeDogfoodMaturityAssertions(value: unknown): string {
  if (!isRecord(value)) return "missing";
  return REQUIRED_DOGFOOD_MATURITY_ASSERTIONS
    .map((expected) => {
      const assertion = value[expected.id];
      return `${expected.id}:${isRecord(assertion) ? String(assertion.status ?? "missing") : "missing"}`;
    })
    .join(", ");
}

function validateDogfoodMaturityAssertions(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push("Callable workflow dogfood evidence is missing maturityAssertions.");
    return;
  }

  for (const expected of REQUIRED_DOGFOOD_MATURITY_ASSERTIONS) {
    const assertion = value[expected.id];
    if (!isRecord(assertion)) {
      issues.push(`Callable workflow dogfood maturity assertion ${expected.id} is missing.`);
      continue;
    }
    if (assertion.id !== expected.id) {
      issues.push(`Callable workflow dogfood maturity assertion ${expected.id} has mismatched id ${String(assertion.id ?? "missing")}.`);
    }
    if (assertion.status !== "passed") {
      issues.push(`Callable workflow dogfood maturity assertion ${expected.id} status is ${String(assertion.status ?? "missing")}; expected passed.`);
    }
    if (!nonEmptyStringArray(assertion.evidence)) {
      issues.push(`Callable workflow dogfood maturity assertion ${expected.id} is missing readable evidence.`);
    } else if (!assertion.evidence.every((entry) => /^passed: .+/.test(entry))) {
      issues.push(`Callable workflow dogfood maturity assertion ${expected.id} must record only passed evidence entries.`);
    }
    const capabilities = Array.isArray(assertion.capabilities) ? assertion.capabilities.filter(nonEmptyString) : [];
    if (capabilities.length === 0) {
      issues.push(`Callable workflow dogfood maturity assertion ${expected.id} is missing capabilities.`);
    }
    for (const capability of expected.capabilities) {
      if (!capabilities.includes(capability)) {
        issues.push(`Callable workflow dogfood maturity assertion ${expected.id} is missing capability ${capability}.`);
      }
    }
  }
}

function findSecretLikeStrings(value: unknown): string[] {
  const paths: string[] = [];
  const seen = new Set<unknown>();
  visit(value, "$");
  return paths;

  function visit(current: unknown, path: string): void {
    if (!current || paths.length >= 10) return;
    if (typeof current === "string") {
      if (looksSecretLike(current)) paths.push(path);
      return;
    }
    if (typeof current !== "object" || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      visit(child, `${path}.${key}`);
    }
  }
}

function looksSecretLike(value: string): boolean {
  return /\b(?:GMI_CLOUD_API_KEY|GMI_API_KEY|AMBIENT_API_KEY)\b\s*[:=]\s*["']?[^"'\s$]{8,}/i.test(value) ||
    /\bapi[_-]?key\b\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i.test(value) ||
    /\bsk-[A-Za-z0-9_-]{16,}\b/.test(value);
}
