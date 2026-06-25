import {
  nonEmptyString,
  nonEmptyStringArray,
  objectValue,
  positiveNumber,
  safeRelativePath,
  sha256Hex,
} from "./subagent-live-confidence-validator-utils.mjs";

const REQUIRED_BASELINE_WORKFLOW_UI_DOGFOOD_SCENARIOS = ["vocabulary-quiz", "local-file-classifier"];
const REQUIRED_BROADER_WORKFLOW_UI_DOGFOOD_SCENARIOS = [
  "gmail-20-metadata-readonly-validation",
  "downloads-document-categorization",
  "public-source-browser",
  "current-web-recipe-report",
];

export function validateWorkflowDogfoodArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Live workflow dogfood artifact is missing."] };
  if (artifact.run?.status !== "succeeded") {
    issues.push(`Live workflow dogfood run status is ${artifact.run?.status ?? "missing"}.`);
  }
  if (!artifact.run?.id) issues.push("Live workflow dogfood artifact is missing run id.");
  if (!artifact.artifact?.id) issues.push("Live workflow dogfood artifact is missing workflow artifact id.");
  if (!artifact.artifact?.workflowThreadId) issues.push("Live workflow dogfood artifact is missing workflowThreadId.");
  if (!positiveNumber(artifact.events)) issues.push("Live workflow dogfood artifact is missing runtime event evidence.");
  if ("fileReads" in artifact && !positiveNumber(artifact.fileReads)) {
    issues.push("Live workflow dogfood artifact is missing file_read tool evidence.");
  }
  const modelCalls = Array.isArray(artifact.modelCalls) ? artifact.modelCalls : [];
  if (!modelCalls.some((call) => call?.status === "succeeded")) {
    issues.push("Live workflow dogfood artifact is missing a succeeded Ambient model call.");
  }
  if (!artifact.checkpoint) issues.push("Live workflow dogfood artifact is missing checkpoint output.");
  return { valid: issues.length === 0, issues };
}

export function validateWorkflowSymphonyConfidenceArtifacts(input = {}) {
  const workflow = validateWorkflowDogfoodArtifact(input.liveWorkflowArtifact);
  const workflowUiDogfood = validateWorkflowUiDogfoodMatrixArtifact(
    input.workflowUiDogfoodArtifact,
    workflowUiDogfoodValidationOptions(input.workflowUiDogfoodProfile),
  );
  const callableDogfood = validateCallableWorkflowDogfoodConfidenceArtifact(input.callableWorkflowDogfoodArtifact);
  const callableRehydration = validateCallableWorkflowRehydrationConfidenceArtifact(input.callableWorkflowRehydrationArtifact);
  const issues = [...workflow.issues, ...workflowUiDogfood.issues, ...callableDogfood.issues, ...callableRehydration.issues];
  return {
    valid: issues.length === 0,
    issues,
    parts: {
      workflow,
      workflowUiDogfood,
      callableDogfood,
      callableRehydration,
    },
  };
}

export function validateWorkflowUiDogfoodMatrixArtifact(artifact, options = {}) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Workflow Agent UI dogfood matrix artifact is missing."] };
  const expectedSuite = options.expectedSuite ?? "phase0-live";
  const requiredScenarios = options.requiredScenarios ?? REQUIRED_BASELINE_WORKFLOW_UI_DOGFOOD_SCENARIOS;
  if (artifact.ok !== true) issues.push("Workflow Agent UI dogfood matrix did not pass.");
  if (artifact.preflight?.requested === true && artifact.preflight?.ok !== true) {
    const preflightIssues =
      Array.isArray(artifact.preflight.issues) && artifact.preflight.issues.length > 0
        ? artifact.preflight.issues.join(" ")
        : `status=${artifact.preflight.status ?? "unknown"}`;
    issues.push(`Workflow Agent UI dogfood matrix preflight failed: ${preflightIssues}`);
  }
  if (artifact.suite && artifact.suite !== expectedSuite) {
    issues.push(`Workflow Agent UI dogfood matrix suite is ${artifact.suite}; expected ${expectedSuite}.`);
  }
  const scenarios = Array.isArray(artifact.scenarios) ? artifact.scenarios : [];
  for (const required of requiredScenarios) {
    if (!scenarios.includes(required)) issues.push(`Workflow Agent UI dogfood matrix is missing scenario ${required}.`);
  }
  const results = Array.isArray(artifact.results) ? artifact.results : [];
  const expectedResultCount = Math.max(requiredScenarios.length, scenarios.length, 2);
  if (results.length < expectedResultCount) {
    issues.push(`Workflow Agent UI dogfood matrix has ${results.length} result(s); expected at least ${expectedResultCount}.`);
  }
  for (const result of results) {
    const scenario = result?.scenario ?? "unknown";
    if (result?.ok !== true) issues.push(`Workflow Agent UI dogfood scenario ${scenario} did not pass.`);
    if (result?.exitCode !== 0) issues.push(`Workflow Agent UI dogfood scenario ${scenario} exitCode is ${result?.exitCode ?? "missing"}.`);
    if (result?.runStatus !== "succeeded")
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} runStatus is ${result?.runStatus ?? "missing"}.`);
    if (!nonEmptyString(result?.reportPath)) issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing reportPath.`);
    if (result?.scenarioAssertions?.passed !== true) {
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing passed scenario assertions.`);
    }
    const runEvidence = result?.runEvidence ?? {};
    if (!positiveNumber(runEvidence.events))
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing runtime event evidence.`);
    if (!positiveNumber(runEvidence.modelCalls))
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing model call evidence.`);
    if (!positiveNumber(runEvidence.checkpoints))
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing checkpoint evidence.`);
    if (!positiveNumber(runEvidence.outputSignals))
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing output signal evidence.`);
    const finalOutput = result?.finalOutput ?? result?.scenarioAssertions?.finalOutput ?? {};
    if (!positiveNumber(finalOutput.charCount)) {
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing final output evidence.`);
    }
    if (!Array.isArray(result?.screenshots) || result.screenshots.length === 0) {
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing screenshot evidence.`);
    }
    if (options.requiredLaunchWorkspaceMode && result?.launch?.workspaceMode !== options.requiredLaunchWorkspaceMode) {
      issues.push(
        `Workflow Agent UI dogfood scenario ${scenario} launch workspaceMode is ${result?.launch?.workspaceMode ?? "missing"}; expected ${options.requiredLaunchWorkspaceMode}.`,
      );
    }
    if (options.requiredGoogleWorkspaceStatus && result?.launch?.googleWorkspace?.status !== options.requiredGoogleWorkspaceStatus) {
      issues.push(
        `Workflow Agent UI dogfood scenario ${scenario} Google Workspace status is ${result?.launch?.googleWorkspace?.status ?? "missing"}; expected ${options.requiredGoogleWorkspaceStatus}.`,
      );
    }
  }
  return { valid: issues.length === 0, issues };
}

export function workflowUiDogfoodProfileForSliceKind(sliceKind) {
  return sliceKind === "workflow_symphony_broader" ? "broader" : "baseline";
}

export function workflowUiDogfoodValidationOptions(profile) {
  if (profile === "broader") {
    return {
      expectedSuite: "phase1-live",
      requiredScenarios: REQUIRED_BROADER_WORKFLOW_UI_DOGFOOD_SCENARIOS,
      requiredLaunchWorkspaceMode: "shared-snapshot-temp-copy",
      requiredGoogleWorkspaceStatus: "configured",
    };
  }
  return {
    expectedSuite: "phase0-live",
    requiredScenarios: REQUIRED_BASELINE_WORKFLOW_UI_DOGFOOD_SCENARIOS,
  };
}

export const REQUIRED_CALLABLE_WORKFLOW_DOGFOOD_MATURITY_ASSERTIONS = [
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

export const REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS = [
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

export function validateCallableWorkflowDogfoodConfidenceArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Callable workflow dogfood artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-callable-workflow-dogfood-evidence-v1") {
    issues.push(`Callable workflow dogfood schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  const task = objectValue(artifact.task);
  if (task.status !== "succeeded") issues.push(`Callable workflow dogfood task status is ${task.status ?? "missing"}.`);
  if (task.blocking !== true) issues.push("Callable workflow dogfood task must be blocking.");
  for (const field of ["id", "workflowArtifactId", "workflowRunId"]) {
    if (!nonEmptyString(task[field])) issues.push(`Callable workflow dogfood task is missing ${field}.`);
  }

  const launchCard = objectValue(artifact.launchCard);
  if (launchCard.present !== true) issues.push("Callable workflow dogfood launch card proof is missing.");
  if (!["low", "medium", "high"].includes(launchCard.riskLevel)) {
    issues.push("Callable workflow dogfood launch card riskLevel is missing or invalid.");
  }
  for (const field of ["estimatedAgents", "maxFanout", "maxDepth", "estimatedTokenBudget", "estimatedLocalMemoryBytes"]) {
    if (!positiveNumber(launchCard[field])) issues.push(`Callable workflow dogfood launch card is missing ${field}.`);
  }
  if (launchCard.defaultCollapsed !== true) issues.push("Callable workflow dogfood launch card must be default collapsed.");
  if (launchCard.blocking !== true) issues.push("Callable workflow dogfood launch card must be blocking.");
  if (launchCard.pauseResumeCancel !== true) {
    issues.push("Callable workflow dogfood task must expose pause/resume/cancel controls.");
  }
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

  const childCaller = objectValue(artifact.childCaller);
  if (childCaller.kind !== "subagent_child_thread") issues.push("Callable workflow dogfood must be child-originated.");
  for (const field of ["threadId", "runId", "subagentRunId", "canonicalTaskPath", "parentThreadId", "parentRunId"]) {
    if (!nonEmptyString(childCaller[field])) issues.push(`Callable workflow dogfood child caller is missing ${field}.`);
  }

  const mutation = objectValue(artifact.mutation);
  if (mutation.mutationPolicy === "read_only") issues.push("Callable workflow dogfood must use a mutating artifact policy.");
  if (mutation.approvalRequired !== true) issues.push("Callable workflow dogfood must prove approvalRequired.");
  if (mutation.approvalSource !== "child_bridge_policy")
    issues.push("Callable workflow dogfood approvalSource must be child_bridge_policy.");
  if (mutation.approvalScope !== "this_child_thread") issues.push("Callable workflow dogfood approvalScope must be this_child_thread.");
  if (mutation.worktreeRequired !== true) issues.push("Callable workflow dogfood must require a worktree.");
  if (mutation.worktreeIsolated !== true) issues.push("Callable workflow dogfood must use an isolated worktree.");
  if (mutation.worktreeStatus !== "active") issues.push("Callable workflow dogfood worktreeStatus must be active.");
  if (mutation.worktreePathPresent !== true) issues.push("Callable workflow dogfood must prove a worktree path was present.");
  if (mutation.nestedFanoutRequired !== true) issues.push("Callable workflow dogfood must require nested fanout policy.");
  if (mutation.nestedFanoutSource !== "child_bridge_policy")
    issues.push("Callable workflow dogfood nestedFanoutSource must be child_bridge_policy.");

  const mutationOutput = objectValue(artifact.mutationOutput);
  if (mutationOutput.kind !== "staged_file") issues.push("Callable workflow dogfood mutation output must be staged_file.");
  if (!safeRelativePath(mutationOutput.stagedRelativePath)) {
    issues.push("Callable workflow dogfood mutation output is missing a safe stagedRelativePath.");
  }
  if (!sha256Hex(mutationOutput.stagedFileSha256)) issues.push("Callable workflow dogfood mutation output is missing stagedFileSha256.");
  if (!nonEmptyString(mutationOutput.fullArtifactPath))
    issues.push("Callable workflow dogfood mutation output is missing fullArtifactPath.");
  if (!positiveNumber(mutationOutput.fullArtifactBytes))
    issues.push("Callable workflow dogfood mutation output is missing fullArtifactBytes.");
  if (!sha256Hex(mutationOutput.fullArtifactSha256))
    issues.push("Callable workflow dogfood mutation output is missing fullArtifactSha256.");
  if (!nonEmptyString(mutationOutput.boundedPreview) || mutationOutput.boundedPreview.length > 512) {
    issues.push("Callable workflow dogfood mutation output must include a boundedPreview.");
  }
  if (!positiveNumber(mutationOutput.previewBytes)) issues.push("Callable workflow dogfood mutation output is missing previewBytes.");
  if (mutationOutput.previewTruncated !== true) issues.push("Callable workflow dogfood mutation output must prove previewTruncated.");
  if (mutationOutput.parentWorkspaceUnchanged !== true) {
    issues.push("Callable workflow dogfood mutation output must prove parentWorkspaceUnchanged.");
  }

  const workflow = objectValue(artifact.workflow);
  if (!nonEmptyString(workflow.workflowThreadId)) issues.push("Callable workflow dogfood is missing workflowThreadId.");
  if (workflow.taskArtifactLinkMatches !== true) issues.push("Callable workflow dogfood artifact link must match the task.");
  if (workflow.taskRunLinkMatches !== true) issues.push("Callable workflow dogfood run link must match the task.");
  if (workflow.runStatus !== "succeeded") issues.push(`Callable workflow dogfood runStatus is ${workflow.runStatus ?? "missing"}.`);

  const taskEvents = objectValue(artifact.taskEvents);
  if (taskEvents.started !== true) issues.push("Callable workflow dogfood is missing task-started event proof.");
  if (taskEvents.finished !== true) issues.push("Callable workflow dogfood is missing task-finished event proof.");

  const parentBlocking = objectValue(artifact.parentBlocking);
  if (parentBlocking.blockedBeforeCompletion !== true) {
    issues.push("Callable workflow dogfood must prove parent synthesis was blocked before completion.");
  }
  if (parentBlocking.unblockedAfterCompletion !== true) {
    issues.push("Callable workflow dogfood must prove parent synthesis unblocked after completion.");
  }
  if (!Array.isArray(parentBlocking.waitingTaskIds) || parentBlocking.waitingTaskIds.length === 0) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing waitingTaskIds.");
  }
  const allowedChoices = Array.isArray(parentBlocking.allowedUserChoiceIds) ? parentBlocking.allowedUserChoiceIds : [];
  if (!allowedChoices.includes("wait_again") || !allowedChoices.includes("cancel_parent")) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing wait/cancel choices.");
  }
  if (!String(parentBlocking.idempotencyKey ?? "").startsWith("callable-workflow:parent-finalization-blocked:")) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing a stable idempotency key.");
  }

  const deniedScope = objectValue(artifact.deniedScope);
  if (deniedScope.denied !== true) issues.push("Callable workflow dogfood must prove denied child workflow scope.");
  const deniedCategories = Array.isArray(deniedScope.deniedCategoryIds) ? deniedScope.deniedCategoryIds : [];
  const deniedTools = Array.isArray(deniedScope.deniedToolIds) ? deniedScope.deniedToolIds : [];
  if (!deniedCategories.includes("workflow.call")) issues.push("Callable workflow dogfood denied scope is missing workflow.call.");
  if (!deniedTools.some((id) => typeof id === "string" && id.startsWith("callable_workflow:ambient_workflow_"))) {
    issues.push("Callable workflow dogfood denied scope is missing exact callable workflow tool denial.");
  }
  const bridgeReasons = Array.isArray(deniedScope.bridgeReasons) ? deniedScope.bridgeReasons : [];
  for (const reasonFragment of [
    "disabled by child role policy",
    "requires an active isolated child worktree",
    "nested fanout limit is exhausted",
  ]) {
    if (!bridgeReasons.some((reason) => typeof reason === "string" && reason.includes(reasonFragment))) {
      issues.push(`Callable workflow dogfood denied scope is missing bridge reason: ${reasonFragment}.`);
    }
  }

  const restart = objectValue(artifact.restart);
  if (restart.terminalRepairObserved !== true) {
    issues.push("Callable workflow dogfood must observe terminal workflow restart repair.");
  }
  if (!Array.isArray(restart.repairedTaskIds) || restart.repairedTaskIds.length === 0) {
    issues.push("Callable workflow dogfood restart proof is missing repaired task IDs.");
  }
  if (!Array.isArray(restart.diagnosticTaskIds) || restart.diagnosticTaskIds.length === 0) {
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

export function validateCallableWorkflowRehydrationConfidenceArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Callable workflow rehydration artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-callable-workflow-rehydration-evidence-v1") {
    issues.push(`Callable workflow rehydration schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }

  const task = objectValue(artifact.task);
  if (task.status !== "running") issues.push(`Callable workflow rehydration task status is ${task.status ?? "missing"}.`);
  if (task.blocking !== true) issues.push("Callable workflow rehydration task must be blocking.");
  for (const field of ["id", "workflowThreadId", "workflowArtifactId", "workflowRunId"]) {
    if (!nonEmptyString(task[field])) issues.push(`Callable workflow rehydration task is missing ${field}.`);
  }

  const rehydration = objectValue(artifact.rehydration);
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

  const childCaller = objectValue(artifact.childCaller);
  if (childCaller.kind !== "subagent_child_thread") {
    issues.push("Callable workflow rehydration must prove child-originated caller provenance.");
  }
  for (const field of ["threadId", "runId", "subagentRunId", "canonicalTaskPath", "parentThreadId", "parentRunId"]) {
    if (!nonEmptyString(childCaller[field])) issues.push(`Callable workflow rehydration child caller is missing ${field}.`);
  }

  const workflowArtifact = objectValue(artifact.artifact);
  if (workflowArtifact.id !== task.workflowArtifactId) {
    issues.push("Callable workflow rehydration task artifact link does not match artifact.");
  }
  if (!nonEmptyString(workflowArtifact.workflowThreadId))
    issues.push("Callable workflow rehydration artifact is missing workflowThreadId.");
  if (!nonEmptyString(workflowArtifact.sourcePath)) issues.push("Callable workflow rehydration artifact is missing sourcePath.");
  if (!nonEmptyString(workflowArtifact.statePath)) issues.push("Callable workflow rehydration artifact is missing statePath.");
  if (!nonEmptyString(workflowArtifact.mutationPolicy)) issues.push("Callable workflow rehydration artifact is missing mutationPolicy.");
  if (!nonEmptyString(workflowArtifact.specGoal)) issues.push("Callable workflow rehydration artifact is missing specGoal.");
  if (workflowArtifact.workflowThreadId !== task.workflowThreadId) {
    issues.push("Callable workflow rehydration workflowThreadId was not joined from the artifact.");
  }

  const workflowRun = objectValue(artifact.workflowRun);
  if (workflowRun.id !== task.workflowRunId) issues.push("Callable workflow rehydration task run link does not match workflowRun.");
  if (workflowRun.artifactId !== task.workflowArtifactId) {
    issues.push("Callable workflow rehydration workflow run does not point at the task artifact.");
  }
  if (workflowRun.status !== "running") {
    issues.push(`Callable workflow rehydration workflow run status is ${workflowRun.status ?? "missing"}.`);
  }

  const progress = objectValue(artifact.progressSnapshot);
  if (!positiveNumber(progress.eventCount)) issues.push("Callable workflow rehydration progress is missing eventCount.");
  if (!positiveNumber(progress.modelCallCount)) issues.push("Callable workflow rehydration progress is missing modelCallCount.");
  if (!positiveNumber(progress.completedStepCount)) issues.push("Callable workflow rehydration progress is missing completedStepCount.");
  if (!nonEmptyString(progress.lastEventType)) issues.push("Callable workflow rehydration progress is missing lastEventType.");

  const usage = objectValue(artifact.usageSnapshot);
  if (!positiveNumber(usage.modelCallCount)) issues.push("Callable workflow rehydration usage is missing modelCallCount.");
  if (!positiveNumber(usage.tokenCount)) issues.push("Callable workflow rehydration usage is missing tokenCount.");
  if (typeof usage.tokenCountEstimated !== "boolean") issues.push("Callable workflow rehydration usage is missing tokenCountEstimated.");
  if (!positiveNumber(usage.costMicros)) issues.push("Callable workflow rehydration usage is missing costMicros.");
  if (typeof usage.costEstimated !== "boolean") issues.push("Callable workflow rehydration usage is missing costEstimated.");

  const taskEvents = objectValue(artifact.taskEvents);
  if (taskEvents.started !== true) issues.push("Callable workflow rehydration is missing task-started event proof.");
  const eventTypes = Array.isArray(taskEvents.eventTypes) ? taskEvents.eventTypes : [];
  if (!eventTypes.includes("step.end")) issues.push("Callable workflow rehydration is missing persisted workflow progress event proof.");
  validateWorkflowMaturityAssertions(
    artifact.maturityAssertions,
    issues,
    "Callable workflow rehydration",
    REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS,
  );
  return { valid: issues.length === 0, issues };
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
    const evidence = Array.isArray(assertion.evidence) ? assertion.evidence : [];
    if (!evidence.some(nonEmptyString)) {
      issues.push(`${label} maturity assertion ${expected.id} is missing readable evidence.`);
    } else if (!evidence.every((entry) => typeof entry === "string" && /^passed: .+/.test(entry))) {
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
