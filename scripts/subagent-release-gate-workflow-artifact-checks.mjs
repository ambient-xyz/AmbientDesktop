import {
  arrayIncludesAll,
  artifactFreshness,
  check,
  isWorkflowMutationPolicy,
  nonEmptyString,
  nonEmptyStringArray,
  positiveInteger,
  positiveNumber,
  safeRelativePath,
  sha256Hex,
} from "./subagent-release-gate-validation-helpers.mjs";

export function replayDiagnosticsArtifactCheck(artifact, options) {
  const issues = [];
  if (!artifact) {
    return check({
      id: "artifact.replay-diagnostics",
      area: "artifacts",
      status: "failed",
      label: "deterministic replay diagnostics artifact is green",
      evidence: ["missing test-results/subagent-replay-diagnostics/latest.json"],
      issues: ["Run pnpm run test:subagents:replay-diagnostics before the release gate."],
    });
  }
  if (artifact.schemaVersion !== "ambient-subagent-replay-diagnostics-v1") {
    issues.push(`Replay diagnostics schema is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") issues.push(`Replay diagnostics status is ${artifact.status ?? "missing"}.`);
  if (artifact.plan?.liveTokens !== false) issues.push("Replay diagnostics must declare liveTokens: false.");
  if ((artifact.vitest?.failedTests ?? 0) !== 0) issues.push(`${artifact.vitest?.failedTests} replay diagnostic tests failed.`);
  if ((artifact.vitest?.missingReplayTests ?? []).length) {
    issues.push(`Replay diagnostics missed required tests: ${artifact.vitest.missingReplayTests.join(", ")}.`);
  }
  const replayEvidence = validateReplayEvidenceArtifact(artifact.replayEvidence);
  issues.push(...replayEvidence.issues);
  const lifecycleEdgeEvidence = isValidLifecycleEdgeArtifact(artifact.lifecycleEdgeEvidence);
  if (!artifact.lifecycleEdgeEvidence) {
    issues.push("Replay diagnostics must include lifecycleEdgeEvidence.");
  } else {
    issues.push(...lifecycleEdgeEvidence.issues);
  }
  const freshness = artifactFreshness(artifact.completedAt, options);
  issues.push(...freshness.issues);
  return check({
    id: "artifact.replay-diagnostics",
    area: "artifacts",
    status: issues.length ? "failed" : "passed",
    label: "deterministic replay diagnostics artifact is green",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/subagent-replay-diagnostics/latest.json"}`,
      `status: ${artifact.status ?? "missing"}`,
      `tests: ${artifact.vitest?.passedTests ?? 0}/${artifact.vitest?.totalTests ?? 0}`,
      `runtime events: ${artifact.replayEvidence?.counts?.runtimeEvents ?? 0}`,
      `parent mailbox events: ${artifact.replayEvidence?.counts?.parentMailboxEvents ?? 0}`,
      `repair issues: ${artifact.replayEvidence?.counts?.restartRepairIssues ?? 0}`,
      `rehydrated artifact pointers: ${artifact.replayEvidence?.rehydration?.resultArtifactPointers?.length ?? 0}`,
      `lifecycle edges: ${(artifact.lifecycleEdgeEvidence?.summary?.coveredEdgeKinds ?? []).join(", ") || "missing"}`,
      ...freshness.evidence,
    ],
    issues,
  });
}

function validateReplayEvidenceArtifact(evidence) {
  const issues = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { issues: ["Replay diagnostics must include replayEvidence."] };
  }
  if (evidence.schemaVersion !== "ambient-subagent-replay-evidence-v1") {
    issues.push(`Replay evidence schema is ${evidence.schemaVersion ?? "missing"}.`);
  }
  if (evidence.liveTokens !== false) issues.push("Replay evidence must declare liveTokens: false.");
  if (!Array.isArray(evidence.runtimeEventTimeline) || evidence.runtimeEventTimeline.length === 0) {
    issues.push("Replay evidence must include a runtimeEventTimeline.");
  }
  if (!Array.isArray(evidence.persistedRunEventTimeline) || evidence.persistedRunEventTimeline.length === 0) {
    issues.push("Replay evidence must include a persistedRunEventTimeline.");
  }
  if (!Array.isArray(evidence.parentMailboxTimeline) || evidence.parentMailboxTimeline.length === 0) {
    issues.push("Replay evidence must include a parentMailboxTimeline.");
  }
  if ((typeof evidence.counts?.parentMailboxEvents === "number" ? evidence.counts.parentMailboxEvents : 0) <= 0) {
    issues.push("Replay evidence must include parent mailbox event counts.");
  }
  if (!Array.isArray(evidence.childThreads) || evidence.childThreads.length === 0) {
    issues.push("Replay evidence must include childThreads.");
  }
  const expectedIssueKinds = evidence.restartRepair?.expectedIssueKinds;
  const observedIssueKinds = evidence.restartRepair?.observedIssueKinds;
  if (!Array.isArray(expectedIssueKinds) || expectedIssueKinds.length === 0) {
    issues.push("Replay evidence must include expected restart repair issue kinds.");
  }
  if (!Array.isArray(observedIssueKinds) || observedIssueKinds.length === 0) {
    issues.push("Replay evidence must include observed restart repair issue kinds.");
  }
  if (Array.isArray(expectedIssueKinds) && Array.isArray(observedIssueKinds)) {
    const missingObserved = expectedIssueKinds.filter((kind) => !observedIssueKinds.includes(kind));
    if (missingObserved.length) issues.push(`Replay evidence did not observe expected issue kinds: ${missingObserved.join(", ")}.`);
  }
  validateReplayRehydrationProof(evidence.rehydration, issues);
  return { issues };
}

function validateReplayRehydrationProof(rehydration, issues) {
  if (!rehydration || typeof rehydration !== "object" || Array.isArray(rehydration)) {
    issues.push("Replay evidence must include restart rehydration proof.");
    return;
  }
  if (rehydration.schemaVersion !== "ambient-subagent-restart-rehydration-proof-v1") {
    issues.push(`Replay rehydration proof schema is ${rehydration.schemaVersion ?? "missing"}.`);
  }
  if (!nonEmptyStringArray(rehydration.childRunIds)) issues.push("Replay rehydration proof must include childRunIds.");
  if (!nonEmptyStringArray(rehydration.childThreadIds)) issues.push("Replay rehydration proof must include childThreadIds.");
  if (!nonEmptyStringArray(rehydration.parentMailboxEventIds)) issues.push("Replay rehydration proof must include parentMailboxEventIds.");
  const mailboxStates = Array.isArray(rehydration.parentMailboxStates) ? rehydration.parentMailboxStates : [];
  if (mailboxStates.length === 0) issues.push("Replay rehydration proof must include parentMailboxStates.");
  for (const state of mailboxStates) {
    if (!nonEmptyString(state?.id)) issues.push("Replay rehydration mailbox state is missing id.");
    if (!nonEmptyString(state?.parentThreadId))
      issues.push(`Replay rehydration mailbox ${state?.id ?? "unknown"} is missing parentThreadId.`);
    if (!nonEmptyString(state?.parentRunId)) issues.push(`Replay rehydration mailbox ${state?.id ?? "unknown"} is missing parentRunId.`);
    if (!["queued", "delivered", "consumed", "failed", "cancelled"].includes(state?.deliveryState)) {
      issues.push(`Replay rehydration mailbox ${state?.id ?? "unknown"} has invalid deliveryState ${state?.deliveryState ?? "missing"}.`);
    }
    if (!nonEmptyStringArray(state?.childRunIds))
      issues.push(`Replay rehydration mailbox ${state?.id ?? "unknown"} is missing childRunIds.`);
  }
  if (!nonEmptyStringArray(rehydration.transcriptThreadIds)) issues.push("Replay rehydration proof must include transcriptThreadIds.");
  const artifactPointers = Array.isArray(rehydration.resultArtifactPointers) ? rehydration.resultArtifactPointers : [];
  if (artifactPointers.length === 0) issues.push("Replay rehydration proof must include resultArtifactPointers.");
  for (const pointer of artifactPointers) {
    if (!nonEmptyString(pointer?.runId)) issues.push("Replay rehydration artifact pointer is missing runId.");
    if (!nonEmptyString(pointer?.childThreadId))
      issues.push(`Replay rehydration artifact pointer ${pointer?.runId ?? "unknown"} is missing childThreadId.`);
    if (![pointer?.artifactPath, pointer?.fullOutputPath, pointer?.structuredOutputPath].some(nonEmptyString)) {
      issues.push(`Replay rehydration artifact pointer ${pointer?.runId ?? "unknown"} is missing artifact paths.`);
    }
  }
  if (!nonEmptyStringArray(rehydration.missingResultArtifactRunIds)) {
    issues.push("Replay rehydration proof must include missingResultArtifactRunIds.");
  }
  const integrity = rehydration.artifactPointerIntegrity ?? {};
  for (const field of [
    "allResultPointersHaveRunAndThread",
    "missingResultArtifactsDiagnosed",
    "parentMailboxChildRefsResolved",
    "transcriptChildRefsResolved",
  ]) {
    if (integrity[field] !== true) issues.push(`Replay rehydration integrity ${field} is not true.`);
  }
}

const REQUIRED_CALLABLE_WORKFLOW_DOGFOOD_MATURITY_ASSERTIONS = [
  {
    id: "workflow_launch_card_bounds",
    capabilities: ["workflow_launch", "launch_card_bounds", "pause_resume_cancel"],
  },
  {
    id: "workflow_mutating_child_worker",
    capabilities: ["mutating_child_workflow", "child_scoped_approval", "isolated_child_worktree"],
  },
  {
    id: "workflow_parent_blocking_completion",
    capabilities: ["parent_blocking_workflow", "workflow_launch"],
  },
  {
    id: "workflow_denied_child_scope",
    capabilities: ["denied_workflow_scope", "child_workflow_scope"],
  },
  {
    id: "workflow_restart_repair",
    capabilities: ["workflow_task_rehydration", "restart_repair"],
  },
];

const REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS = [
  {
    id: "workflow_rehydrated_task_links",
    capabilities: ["workflow_task_rehydration", "artifact_link"],
  },
  {
    id: "workflow_rehydrated_artifact_payload",
    capabilities: ["artifact_link", "checkpoint_output"],
  },
  {
    id: "workflow_rehydrated_progress_usage",
    capabilities: ["workflow_task_rehydration", "checkpoint_output"],
  },
  {
    id: "workflow_rehydrated_child_provenance",
    capabilities: ["child_workflow_provenance", "workflow_task_rehydration"],
  },
];

export function callableWorkflowDogfoodArtifactCheck(artifact, options) {
  const validation = isValidCallableWorkflowDogfoodArtifact(artifact);
  const freshness = artifactFreshness(artifact?.createdAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    return check({
      id: "artifact.callable-workflow-dogfood",
      area: "artifacts",
      status: "failed",
      label: "callable workflow mutating child dogfood proof artifact is green",
      evidence: ["missing test-results/callable-workflow-dogfood/latest.json"],
      issues: ["Run pnpm run test:callable-workflow-dogfood:proof before the release gate."],
    });
  }
  return check({
    id: "artifact.callable-workflow-dogfood",
    area: "artifacts",
    status: issues.length ? "failed" : "passed",
    label: "callable workflow mutating child dogfood proof artifact is green",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/callable-workflow-dogfood/latest.json"}`,
      `task: ${artifact.task?.id ?? "missing"}`,
      `workflowRun: ${artifact.workflow?.runId ?? "missing"} ${artifact.workflow?.runStatus ?? "missing"}`,
      `child: ${artifact.childCaller?.threadId ?? "missing"} / ${artifact.childCaller?.subagentRunId ?? "missing"}`,
      `mutationOutput: ${artifact.mutationOutput?.kind ?? "missing"} ${artifact.mutationOutput?.stagedRelativePath ?? "missing"} parentUnchanged=${artifact.mutationOutput?.parentWorkspaceUnchanged === true}`,
      `parentBlocking: blocked=${artifact.parentBlocking?.blockedBeforeCompletion === true} unblocked=${artifact.parentBlocking?.unblockedAfterCompletion === true}`,
      `restartRepairObserved: ${artifact.restart?.terminalRepairObserved === true}`,
      `maturityAssertions: ${summarizeWorkflowMaturityAssertions(artifact.maturityAssertions, REQUIRED_CALLABLE_WORKFLOW_DOGFOOD_MATURITY_ASSERTIONS)}`,
      ...freshness.evidence,
    ],
    issues,
  });
}

function isValidCallableWorkflowDogfoodArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-callable-workflow-dogfood-evidence-v1") {
    issues.push(`Callable workflow dogfood schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.task?.status !== "succeeded") {
    issues.push(`Callable workflow dogfood task status is ${artifact.task?.status ?? "missing"}.`);
  }
  if (artifact.task?.blocking !== true) issues.push("Callable workflow dogfood task must be blocking.");
  if (!nonEmptyString(artifact.task?.workflowArtifactId)) issues.push("Callable workflow dogfood task is missing workflowArtifactId.");
  if (!nonEmptyString(artifact.task?.workflowRunId)) issues.push("Callable workflow dogfood task is missing workflowRunId.");
  if (artifact.launchCard?.present !== true) issues.push("Callable workflow dogfood launch card proof is missing.");
  if (!["low", "medium", "high"].includes(artifact.launchCard?.riskLevel)) {
    issues.push("Callable workflow dogfood launch card riskLevel is missing or invalid.");
  }
  for (const field of ["estimatedAgents", "maxFanout", "maxDepth", "estimatedTokenBudget", "estimatedLocalMemoryBytes"]) {
    if (!positiveInteger(artifact.launchCard?.[field])) issues.push(`Callable workflow dogfood launch card is missing ${field}.`);
  }
  if (artifact.launchCard?.defaultCollapsed !== true) issues.push("Callable workflow dogfood launch card must be default collapsed.");
  if (artifact.launchCard?.blocking !== true) issues.push("Callable workflow dogfood launch card must be blocking.");
  if (artifact.launchCard?.pauseResumeCancel !== true) {
    issues.push("Callable workflow dogfood task must expose pause/resume/cancel controls.");
  }
  if (!nonEmptyString(artifact.launchCard?.checkpointResume)) {
    issues.push("Callable workflow dogfood launch card is missing checkpoint/resume text.");
  }
  if (!nonEmptyString(artifact.launchCard?.approvalFailureHandling)) {
    issues.push("Callable workflow dogfood launch card is missing approval failure handling text.");
  }
  if (!nonEmptyStringArray(artifact.launchCard?.requirementIds)) {
    issues.push("Callable workflow dogfood launch card is missing requirementIds.");
  }
  if (!nonEmptyStringArray(artifact.launchCard?.metricTemplateIds)) {
    issues.push("Callable workflow dogfood launch card is missing metricTemplateIds.");
  }
  if (artifact.childCaller?.kind !== "subagent_child_thread") issues.push("Callable workflow dogfood must be child-originated.");
  for (const field of ["threadId", "runId", "subagentRunId", "canonicalTaskPath", "parentThreadId", "parentRunId"]) {
    if (!nonEmptyString(artifact.childCaller?.[field])) issues.push(`Callable workflow dogfood child caller is missing ${field}.`);
  }
  if (artifact.mutation?.mutationPolicy === "read_only") issues.push("Callable workflow dogfood must use a mutating artifact policy.");
  if (artifact.mutation?.approvalRequired !== true) issues.push("Callable workflow dogfood must prove approvalRequired.");
  if (artifact.mutation?.approvalSource !== "child_bridge_policy")
    issues.push("Callable workflow dogfood approvalSource must be child_bridge_policy.");
  if (artifact.mutation?.approvalScope !== "this_child_thread")
    issues.push("Callable workflow dogfood approvalScope must be this_child_thread.");
  if (artifact.mutation?.worktreeRequired !== true) issues.push("Callable workflow dogfood must require a worktree.");
  if (artifact.mutation?.worktreeIsolated !== true) issues.push("Callable workflow dogfood must use an isolated worktree.");
  if (artifact.mutation?.worktreeStatus !== "active") issues.push("Callable workflow dogfood worktreeStatus must be active.");
  if (artifact.mutation?.worktreePathPresent !== true) issues.push("Callable workflow dogfood must prove a worktree path was present.");
  if (artifact.mutation?.nestedFanoutRequired !== true) issues.push("Callable workflow dogfood must require nested fanout policy.");
  if (artifact.mutation?.nestedFanoutSource !== "child_bridge_policy")
    issues.push("Callable workflow dogfood nestedFanoutSource must be child_bridge_policy.");
  const mutationOutput = artifact.mutationOutput && typeof artifact.mutationOutput === "object" ? artifact.mutationOutput : {};
  if (mutationOutput.kind !== "staged_file") issues.push("Callable workflow dogfood mutation output must be staged_file.");
  if (!safeRelativePath(mutationOutput.stagedRelativePath)) {
    issues.push("Callable workflow dogfood mutation output is missing a safe stagedRelativePath.");
  }
  if (!sha256Hex(mutationOutput.stagedFileSha256)) {
    issues.push("Callable workflow dogfood mutation output is missing stagedFileSha256.");
  }
  if (!nonEmptyString(mutationOutput.fullArtifactPath)) {
    issues.push("Callable workflow dogfood mutation output is missing fullArtifactPath.");
  }
  if (!positiveInteger(mutationOutput.fullArtifactBytes)) {
    issues.push("Callable workflow dogfood mutation output is missing fullArtifactBytes.");
  }
  if (!sha256Hex(mutationOutput.fullArtifactSha256)) {
    issues.push("Callable workflow dogfood mutation output is missing fullArtifactSha256.");
  }
  if (!nonEmptyString(mutationOutput.boundedPreview) || mutationOutput.boundedPreview.length > 512) {
    issues.push("Callable workflow dogfood mutation output must include a boundedPreview.");
  }
  if (!positiveInteger(mutationOutput.previewBytes)) {
    issues.push("Callable workflow dogfood mutation output is missing previewBytes.");
  }
  if (mutationOutput.previewTruncated !== true) {
    issues.push("Callable workflow dogfood mutation output must prove previewTruncated.");
  }
  if (mutationOutput.parentWorkspaceUnchanged !== true) {
    issues.push("Callable workflow dogfood mutation output must prove parentWorkspaceUnchanged.");
  }
  if (!nonEmptyString(artifact.workflow?.workflowThreadId)) issues.push("Callable workflow dogfood is missing workflowThreadId.");
  if (artifact.workflow?.taskArtifactLinkMatches !== true) issues.push("Callable workflow dogfood artifact link must match the task.");
  if (artifact.workflow?.taskRunLinkMatches !== true) issues.push("Callable workflow dogfood run link must match the task.");
  if (artifact.workflow?.runStatus !== "succeeded")
    issues.push(`Callable workflow dogfood runStatus is ${artifact.workflow?.runStatus ?? "missing"}.`);
  if (artifact.taskEvents?.started !== true) issues.push("Callable workflow dogfood is missing task-started event proof.");
  if (artifact.taskEvents?.finished !== true) issues.push("Callable workflow dogfood is missing task-finished event proof.");
  if (artifact.parentBlocking?.blockedBeforeCompletion !== true) {
    issues.push("Callable workflow dogfood must prove parent synthesis was blocked before completion.");
  }
  if (artifact.parentBlocking?.unblockedAfterCompletion !== true) {
    issues.push("Callable workflow dogfood must prove parent synthesis unblocked after completion.");
  }
  if (!Array.isArray(artifact.parentBlocking?.waitingTaskIds) || artifact.parentBlocking.waitingTaskIds.length === 0) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing waitingTaskIds.");
  }
  const allowedChoices = Array.isArray(artifact.parentBlocking?.allowedUserChoiceIds) ? artifact.parentBlocking.allowedUserChoiceIds : [];
  if (!allowedChoices.includes("wait_again") || !allowedChoices.includes("cancel_parent")) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing wait/cancel choices.");
  }
  if (artifact.deniedScope?.denied !== true) issues.push("Callable workflow dogfood must prove denied child workflow scope.");
  const deniedCategories = Array.isArray(artifact.deniedScope?.deniedCategoryIds) ? artifact.deniedScope.deniedCategoryIds : [];
  const deniedTools = Array.isArray(artifact.deniedScope?.deniedToolIds) ? artifact.deniedScope.deniedToolIds : [];
  if (!deniedCategories.includes("workflow.call")) issues.push("Callable workflow dogfood denied scope is missing workflow.call.");
  if (!deniedTools.some((id) => typeof id === "string" && id.startsWith("callable_workflow:ambient_workflow_"))) {
    issues.push("Callable workflow dogfood denied scope is missing exact callable workflow tool denial.");
  }
  const bridgeReasons = Array.isArray(artifact.deniedScope?.bridgeReasons) ? artifact.deniedScope.bridgeReasons : [];
  for (const reasonFragment of [
    "disabled by child role policy",
    "requires an active isolated child worktree",
    "nested fanout limit is exhausted",
  ]) {
    if (!bridgeReasons.some((reason) => typeof reason === "string" && reason.includes(reasonFragment))) {
      issues.push(`Callable workflow dogfood denied scope is missing bridge reason: ${reasonFragment}.`);
    }
  }
  if (artifact.restart?.terminalRepairObserved !== true) {
    issues.push("Callable workflow dogfood must observe terminal workflow restart repair.");
  }
  if (!Array.isArray(artifact.restart?.repairedTaskIds) || artifact.restart.repairedTaskIds.length === 0) {
    issues.push("Callable workflow dogfood restart proof is missing repaired task IDs.");
  }
  if (!Array.isArray(artifact.restart?.diagnosticTaskIds) || artifact.restart.diagnosticTaskIds.length === 0) {
    issues.push("Callable workflow dogfood restart proof is missing diagnostic task IDs.");
  }
  validateWorkflowMaturityAssertions(
    artifact.maturityAssertions,
    issues,
    "Callable workflow dogfood",
    REQUIRED_CALLABLE_WORKFLOW_DOGFOOD_MATURITY_ASSERTIONS,
  );
  return { valid: issues.length === 0, issues };
}

export function callableWorkflowRehydrationArtifactCheck(artifact, options) {
  const validation = isValidCallableWorkflowRehydrationArtifact(artifact);
  const freshness = artifactFreshness(artifact?.createdAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    return check({
      id: "artifact.callable-workflow-rehydration",
      area: "artifacts",
      status: "failed",
      label: "callable workflow restart rehydration proof artifact is green",
      evidence: ["missing test-results/callable-workflow-rehydration/latest.json"],
      issues: ["Run pnpm run test:callable-workflow-rehydration:proof before the release gate."],
    });
  }
  return check({
    id: "artifact.callable-workflow-rehydration",
    area: "artifacts",
    status: issues.length ? "failed" : "passed",
    label: "callable workflow restart rehydration proof artifact is green",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/callable-workflow-rehydration/latest.json"}`,
      `task: ${artifact.task?.id ?? "missing"}`,
      `workflowRun: ${artifact.workflowRun?.id ?? "missing"} ${artifact.workflowRun?.status ?? "missing"}`,
      `workflowThread: ${artifact.task?.workflowThreadId ?? "missing"}`,
      `artifactSourcePath: ${artifact.artifact?.sourcePath ?? "missing"}`,
      `artifactStatePath: ${artifact.artifact?.statePath ?? "missing"}`,
      `artifactMutationPolicy: ${artifact.artifact?.mutationPolicy ?? "missing"}`,
      `progressEvents: ${artifact.progressSnapshot?.eventCount ?? 0}`,
      `modelCalls: ${artifact.usageSnapshot?.modelCallCount ?? 0}`,
      `tokens: ${artifact.usageSnapshot?.tokenCount ?? 0}`,
      `maturityAssertions: ${summarizeWorkflowMaturityAssertions(artifact.maturityAssertions, REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS)}`,
      ...freshness.evidence,
    ],
    issues,
  });
}

function isValidCallableWorkflowRehydrationArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-callable-workflow-rehydration-evidence-v1") {
    issues.push(`Callable workflow rehydration schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.task?.status !== "running")
    issues.push(`Callable workflow rehydration task status is ${artifact.task?.status ?? "missing"}.`);
  if (artifact.task?.blocking !== true) issues.push("Callable workflow rehydration task must be blocking.");
  for (const field of ["workflowThreadId", "workflowArtifactId", "workflowRunId"]) {
    if (!nonEmptyString(artifact.task?.[field])) issues.push(`Callable workflow rehydration task is missing ${field}.`);
  }
  const rehydration = artifact.rehydration && typeof artifact.rehydration === "object" ? artifact.rehydration : {};
  for (const field of [
    "sameTaskId",
    "sameArtifactId",
    "sameRunId",
    "workflowThreadHydrated",
    "artifactSourcePathHydrated",
    "artifactStatePathHydrated",
    "artifactMutationPolicyHydrated",
    "artifactSpecHydrated",
    "launchCardHydrated",
    "executionPlanHydrated",
    "progressHydrated",
    "usageHydrated",
  ]) {
    if (rehydration[field] !== true) issues.push(`Callable workflow rehydration proof is missing ${field}.`);
  }
  if (artifact.childCaller?.kind !== "subagent_child_thread") {
    issues.push("Callable workflow rehydration must prove child-originated caller provenance.");
  }
  for (const field of ["threadId", "runId", "subagentRunId", "canonicalTaskPath", "parentThreadId", "parentRunId"]) {
    if (!nonEmptyString(artifact.childCaller?.[field])) issues.push(`Callable workflow rehydration child caller is missing ${field}.`);
  }
  if (artifact.artifact?.id !== artifact.task?.workflowArtifactId) {
    issues.push("Callable workflow rehydration task artifact link does not match artifact.");
  }
  if (!nonEmptyString(artifact.artifact?.workflowThreadId)) {
    issues.push("Callable workflow rehydration artifact is missing workflowThreadId.");
  }
  if (!nonEmptyString(artifact.artifact?.sourcePath)) {
    issues.push("Callable workflow rehydration artifact is missing sourcePath.");
  }
  if (!nonEmptyString(artifact.artifact?.statePath)) {
    issues.push("Callable workflow rehydration artifact is missing statePath.");
  }
  if (!isWorkflowMutationPolicy(artifact.artifact?.mutationPolicy)) {
    issues.push("Callable workflow rehydration artifact is missing mutationPolicy.");
  }
  if (!nonEmptyString(artifact.artifact?.specGoal)) {
    issues.push("Callable workflow rehydration artifact is missing specGoal.");
  }
  if (artifact.artifact?.workflowThreadId !== artifact.task?.workflowThreadId) {
    issues.push("Callable workflow rehydration workflowThreadId was not joined from the artifact.");
  }
  if (artifact.workflowRun?.id !== artifact.task?.workflowRunId) {
    issues.push("Callable workflow rehydration task run link does not match workflowRun.");
  }
  if (artifact.workflowRun?.artifactId !== artifact.task?.workflowArtifactId) {
    issues.push("Callable workflow rehydration workflow run does not point at the task artifact.");
  }
  if (artifact.workflowRun?.status !== "running") {
    issues.push(`Callable workflow rehydration workflow run status is ${artifact.workflowRun?.status ?? "missing"}.`);
  }
  if (!positiveNumber(artifact.progressSnapshot?.eventCount)) issues.push("Callable workflow rehydration progress is missing eventCount.");
  if (!positiveNumber(artifact.progressSnapshot?.modelCallCount))
    issues.push("Callable workflow rehydration progress is missing modelCallCount.");
  if (!positiveNumber(artifact.progressSnapshot?.completedStepCount))
    issues.push("Callable workflow rehydration progress is missing completedStepCount.");
  if (!nonEmptyString(artifact.progressSnapshot?.lastEventType))
    issues.push("Callable workflow rehydration progress is missing lastEventType.");
  if (!positiveNumber(artifact.usageSnapshot?.modelCallCount))
    issues.push("Callable workflow rehydration usage is missing modelCallCount.");
  if (!positiveNumber(artifact.usageSnapshot?.tokenCount)) issues.push("Callable workflow rehydration usage is missing tokenCount.");
  if (typeof artifact.usageSnapshot?.tokenCountEstimated !== "boolean") {
    issues.push("Callable workflow rehydration usage is missing tokenCountEstimated.");
  }
  if (!positiveNumber(artifact.usageSnapshot?.costMicros)) issues.push("Callable workflow rehydration usage is missing costMicros.");
  if (typeof artifact.usageSnapshot?.costEstimated !== "boolean") {
    issues.push("Callable workflow rehydration usage is missing costEstimated.");
  }
  if (artifact.taskEvents?.started !== true) issues.push("Callable workflow rehydration is missing task-started event proof.");
  const eventTypes = Array.isArray(artifact.taskEvents?.eventTypes) ? artifact.taskEvents.eventTypes : [];
  if (!eventTypes.includes("step.end")) issues.push("Callable workflow rehydration is missing persisted workflow progress event proof.");
  validateWorkflowMaturityAssertions(
    artifact.maturityAssertions,
    issues,
    "Callable workflow rehydration",
    REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS,
  );
  return { valid: issues.length === 0, issues };
}

function summarizeWorkflowMaturityAssertions(maturityAssertions, expectedAssertions) {
  if (!maturityAssertions || typeof maturityAssertions !== "object" || Array.isArray(maturityAssertions)) return "missing";
  return expectedAssertions.map((expected) => `${expected.id}:${maturityAssertions[expected.id]?.status ?? "missing"}`).join(", ");
}

function validateWorkflowMaturityAssertions(maturityAssertions, issues, label, expectedAssertions) {
  if (!maturityAssertions || typeof maturityAssertions !== "object" || Array.isArray(maturityAssertions)) {
    issues.push(`${label} evidence is missing maturityAssertions.`);
    return;
  }

  for (const expected of expectedAssertions) {
    const assertion = maturityAssertions[expected.id];
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      issues.push(`${label} maturity assertion ${expected.id} is missing.`);
      continue;
    }
    if (assertion.id !== expected.id) {
      issues.push(`${label} maturity assertion ${expected.id} has mismatched id ${assertion.id ?? "missing"}.`);
    }
    if (assertion.status !== "passed") {
      issues.push(`${label} maturity assertion ${expected.id} status is ${assertion.status ?? "missing"}; expected passed.`);
    }
    if (!nonEmptyStringArray(assertion.evidence)) {
      issues.push(`${label} maturity assertion ${expected.id} is missing readable evidence.`);
    } else if (!assertion.evidence.every((entry) => typeof entry === "string" && /^passed: .+/.test(entry))) {
      issues.push(`${label} maturity assertion ${expected.id} must record only passed evidence entries.`);
    }
    const capabilities = Array.isArray(assertion.capabilities) ? assertion.capabilities : [];
    if (!capabilities.some(nonEmptyString)) {
      issues.push(`${label} maturity assertion ${expected.id} is missing capabilities.`);
    }
    for (const capability of expected.capabilities) {
      if (!capabilities.includes(capability)) {
        issues.push(`${label} maturity assertion ${expected.id} is missing capability ${capability}.`);
      }
    }
  }
}

export function lifecycleEdgeArtifactCheck(artifact, options) {
  const validation = isValidLifecycleEdgeArtifact(artifact);
  const freshness = artifactFreshness(artifact?.createdAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    return check({
      id: "artifact.lifecycle-edges",
      area: "artifacts",
      status: "failed",
      label: "sub-agent lifecycle edge proof artifact is green",
      evidence: ["missing test-results/subagent-lifecycle-edges/latest.json"],
      issues: ["Run pnpm run test:subagents:lifecycle-edges:proof before the release gate."],
    });
  }
  return check({
    id: "artifact.lifecycle-edges",
    area: "artifacts",
    status: issues.length ? "failed" : "passed",
    label: "sub-agent lifecycle edge proof artifact is green",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/subagent-lifecycle-edges/latest.json"}`,
      `source: ${artifact.source ?? "missing"}`,
      `parent: ${artifact.parent?.threadId ?? "missing"} / ${artifact.parent?.runId ?? "missing"}`,
      `coveredEdges: ${(artifact.summary?.coveredEdgeKinds ?? []).join(", ") || "missing"}`,
      `unsafeEdges: ${(artifact.summary?.unsafeEdgeIds ?? []).join(", ") || "none"}`,
      ...freshness.evidence,
    ],
    issues,
  });
}

function isValidLifecycleEdgeArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-subagent-lifecycle-edge-evidence-v1") {
    issues.push(`Sub-agent lifecycle edge schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.featureFlagSnapshot?.ambientSubagentsEnabled !== true) {
    issues.push("Sub-agent lifecycle edge proof must prove ambient.subagents was enabled.");
  }
  if (!nonEmptyString(artifact.parent?.threadId) || !nonEmptyString(artifact.parent?.runId)) {
    issues.push("Sub-agent lifecycle edge proof is missing parent thread/run identity.");
  }
  const requiredKinds = ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"];
  if (!arrayIncludesAll(artifact.summary?.requiredEdgeKinds, requiredKinds)) {
    issues.push("Sub-agent lifecycle edge proof requiredEdgeKinds is incomplete.");
  }
  if (!arrayIncludesAll(artifact.summary?.coveredEdgeKinds, requiredKinds)) {
    issues.push("Sub-agent lifecycle edge proof coveredEdgeKinds is incomplete.");
  }
  if (Array.isArray(artifact.summary?.missingEdgeKinds) && artifact.summary.missingEdgeKinds.length > 0) {
    issues.push(`Sub-agent lifecycle edge proof reports missing edge kinds: ${artifact.summary.missingEdgeKinds.join(", ")}.`);
  }
  if (Array.isArray(artifact.summary?.unsafeEdgeIds) && artifact.summary.unsafeEdgeIds.length > 0) {
    issues.push(`Sub-agent lifecycle edge proof reports unsafe edge ids: ${artifact.summary.unsafeEdgeIds.join(", ")}.`);
  }
  const edges = Array.isArray(artifact.edges) ? artifact.edges : [];
  if (edges.length < requiredKinds.length) {
    issues.push(`Sub-agent lifecycle edge proof has ${edges.length} edges; expected at least ${requiredKinds.length}.`);
  }
  for (const edge of edges) validateLifecycleEdgeArtifactRow(edge, issues);
  return { valid: issues.length === 0, issues };
}

function validateLifecycleEdgeArtifactRow(edge, issues) {
  const id = nonEmptyString(edge?.id) ? edge.id : "unknown";
  const requiredKinds = ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"];
  if (!requiredKinds.includes(edge?.kind)) {
    issues.push(`Sub-agent lifecycle edge ${id} has unknown kind ${edge?.kind ?? "missing"}.`);
    return;
  }
  for (const field of ["label", "parentBlockingStateBefore", "parentBlockingStateAfter"]) {
    if (!nonEmptyString(edge?.[field])) issues.push(`Sub-agent lifecycle edge ${id} is missing ${field}.`);
  }
  for (const field of ["childRunIds", "childThreadIds", "observedEventIds"]) {
    if (!nonEmptyStringArray(edge?.[field])) issues.push(`Sub-agent lifecycle edge ${id} is missing ${field}.`);
  }
  const safety = edge?.synthesisSafety ?? {};
  for (const field of [
    "parentDidNotSynthesizeUnsafeChild",
    "resultArtifactStateExplicit",
    "affectedChildrenNamed",
    "decisionOrEventAttributed",
    "visibleCollapsedThreadState",
  ]) {
    if (safety[field] !== true) issues.push(`Sub-agent lifecycle edge ${id} is missing synthesis safety ${field}.`);
  }
  if (edge.kind === "restart") {
    const restart = edge.restart ?? {};
    if (!nonEmptyStringArray(restart.interruptedRunIds))
      issues.push(`Sub-agent lifecycle restart edge ${id} is missing interruptedRunIds.`);
    if (!nonEmptyStringArray(restart.diagnosticRunIds)) issues.push(`Sub-agent lifecycle restart edge ${id} is missing diagnosticRunIds.`);
    if (restart.restartRepairObserved !== true) issues.push(`Sub-agent lifecycle restart edge ${id} did not observe restart repair.`);
    if (restart.nonResumableMarkedInterrupted !== true)
      issues.push(`Sub-agent lifecycle restart edge ${id} did not mark non-resumable children interrupted.`);
  }
  if (edge.kind === "stop") {
    const stop = edge.stop ?? {};
    if (!nonEmptyStringArray(stop.stoppedRunIds)) issues.push(`Sub-agent lifecycle stop edge ${id} is missing stoppedRunIds.`);
    if (!nonEmptyStringArray(stop.siblingRunIdsUnaffected))
      issues.push(`Sub-agent lifecycle stop edge ${id} is missing siblingRunIdsUnaffected.`);
    if (stop.structuredCancellationResult !== true)
      issues.push(`Sub-agent lifecycle stop edge ${id} is missing structuredCancellationResult.`);
    if (stop.capacityReleased !== true) issues.push(`Sub-agent lifecycle stop edge ${id} did not release capacity.`);
  }
  if (edge.kind === "detach") {
    const detach = edge.detach ?? {};
    if (!nonEmptyStringArray(detach.detachedRunIds)) issues.push(`Sub-agent lifecycle detach edge ${id} is missing detachedRunIds.`);
    if (detach.detachedChildrenExcludedFromSynthesis !== true)
      issues.push(`Sub-agent lifecycle detach edge ${id} did not exclude detached children from synthesis.`);
    if (detach.parentUnblockedAfterDecision !== true)
      issues.push(`Sub-agent lifecycle detach edge ${id} did not unblock parent after decision.`);
    if (detach.mailboxCleanupRecorded !== true) issues.push(`Sub-agent lifecycle detach edge ${id} did not record mailbox cleanup.`);
  }
  if (edge.kind === "cancel") {
    const cancel = edge.cancel ?? {};
    if (cancel.parentCancellationRequested !== true)
      issues.push(`Sub-agent lifecycle cancel edge ${id} is missing parentCancellationRequested.`);
    if (!nonEmptyStringArray(cancel.cancelledRunIds)) issues.push(`Sub-agent lifecycle cancel edge ${id} is missing cancelledRunIds.`);
    if (cancel.cancellationCascadeRecorded !== true)
      issues.push(`Sub-agent lifecycle cancel edge ${id} did not record cancellation cascade.`);
    if (cancel.parentReturnedCancelledState !== true)
      issues.push(`Sub-agent lifecycle cancel edge ${id} did not return parent cancelled state.`);
  }
  if (edge.kind === "retry") {
    const retry = edge.retry ?? {};
    if (!nonEmptyStringArray(retry.retryRequestedRunIds))
      issues.push(`Sub-agent lifecycle retry edge ${id} is missing retryRequestedRunIds.`);
    if (!nonEmptyStringArray(retry.retryAcceptedRunIds))
      issues.push(`Sub-agent lifecycle retry edge ${id} is missing retryAcceptedRunIds.`);
    if (!nonEmptyStringArray(retry.retryMailboxEventIds))
      issues.push(`Sub-agent lifecycle retry edge ${id} is missing retryMailboxEventIds.`);
    if (retry.parentRemainedBlocked !== true) issues.push(`Sub-agent lifecycle retry edge ${id} did not keep parent blocked.`);
    if (retry.childSessionRestarted !== true) issues.push(`Sub-agent lifecycle retry edge ${id} did not restart the child session.`);
  }
  if (edge.kind === "timeout") {
    const timeout = edge.timeout ?? {};
    if (timeout.barrierStatus !== "timed_out")
      issues.push(`Sub-agent lifecycle timeout edge ${id} barrierStatus is ${timeout.barrierStatus ?? "missing"}.`);
    if (!nonEmptyString(timeout.failurePolicy)) issues.push(`Sub-agent lifecycle timeout edge ${id} is missing failurePolicy.`);
    if (!arrayIncludesAll(timeout.allowedUserChoiceIds, ["wait_again", "cancel_parent"])) {
      issues.push(`Sub-agent lifecycle timeout edge ${id} is missing wait_again/cancel_parent choices.`);
    }
    if (timeout.noTimedOutChildSynthesis !== true) issues.push(`Sub-agent lifecycle timeout edge ${id} allowed timed-out child synthesis.`);
  }
  if (edge.kind === "partial_result") {
    const partial = edge.partialResult ?? {};
    if (partial.decision !== "continue_with_partial")
      issues.push(`Sub-agent lifecycle partial-result edge ${id} decision is ${partial.decision ?? "missing"}.`);
    if (partial.partialSummaryIncluded !== true)
      issues.push(`Sub-agent lifecycle partial-result edge ${id} is missing partialSummaryIncluded.`);
    if (!nonEmptyStringArray(partial.omittedChildRunIds))
      issues.push(`Sub-agent lifecycle partial-result edge ${id} is missing omittedChildRunIds.`);
    if (partial.failedChildNotSynthesized !== true)
      issues.push(`Sub-agent lifecycle partial-result edge ${id} did not exclude failed child output.`);
    if (partial.parentMarkedPartial !== true) issues.push(`Sub-agent lifecycle partial-result edge ${id} did not mark parent partial.`);
  }
}
