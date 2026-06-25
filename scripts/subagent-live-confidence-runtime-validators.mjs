import { arrayIncludesAll, nonEmptyString, nonEmptyStringArray, positiveNumber } from "./subagent-live-confidence-validator-utils.mjs";

export function validateLocalRuntimeControlProofArtifact(artifact, gateArtifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Local runtime control proof artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-local-runtime-control-proof-v1") {
    issues.push(`Local runtime control proof schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  const scenarios = artifact.scenarios && typeof artifact.scenarios === "object" ? artifact.scenarios : {};
  const minicpm = scenarios["minicpm-nondestructive-stop"];
  const blocker = scenarios["active-subagent-stop-blocker"];
  const untracked = scenarios["untracked-runtime-safety"];
  const staleRecovery = scenarios["stale-lease-recovery"];
  const stoppedDisplay = scenarios["stopped-provider-display"];
  const providerLifecycle = scenarios["provider-declared-lifecycle"];

  requirePassedScenario(minicpm, "minicpm-nondestructive-stop", issues);
  if (minicpm) {
    if (minicpm.stopped !== true) issues.push("MiniCPM proof did not prove stopped=true.");
    if (minicpm.uninstalled === true) issues.push("MiniCPM proof reported uninstalled=true.");
    if (minicpm.packageStatePreserved !== true) issues.push("MiniCPM proof did not prove provider package state was preserved.");
  }

  requirePassedScenario(blocker, "active-subagent-stop-blocker", issues);
  if (blocker) {
    if (blocker.ordinaryStopAllowed !== false) issues.push("Sub-agent stop-blocker proof did not prove ordinaryStopAllowed=false.");
    if (!positiveNumber(blocker.activeLeaseCount)) issues.push("Sub-agent stop-blocker proof did not prove an active local runtime lease.");
    if (!Array.isArray(blocker.affectedSubagents) || blocker.affectedSubagents.length < 1) {
      issues.push("Sub-agent stop-blocker proof did not list affected sub-agents.");
    } else {
      const owner = blocker.affectedSubagents[0];
      for (const field of [
        "leaseId",
        "parentThreadId",
        "subagentThreadId",
        "modelRuntimeId",
        "modelProfileId",
        "providerId",
        "capabilityKind",
      ]) {
        if (!owner?.[field]) issues.push(`Sub-agent stop-blocker proof affected sub-agent is missing ${field}.`);
      }
    }
    if (blocker.forceRequiresSubagentCancellation !== true) {
      issues.push("Sub-agent stop-blocker proof did not prove forced termination requires sub-agent cancellation.");
    }
  }

  requirePassedScenario(untracked, "untracked-runtime-safety", issues);
  if (untracked) {
    if (untracked.trackingStatus !== "untracked") issues.push("Untracked runtime proof did not prove trackingStatus=untracked.");
    if (untracked.ordinaryStopAllowed !== false) issues.push("Untracked runtime proof did not prove ordinaryStopAllowed=false.");
    if (untracked.ordinaryRestartAllowed !== false) issues.push("Untracked runtime proof did not prove ordinaryRestartAllowed=false.");
    if (untracked.forceTerminationAllowed !== false) issues.push("Untracked runtime proof did not prove forceTerminationAllowed=false.");
    if (untracked.untracked !== true) issues.push("Untracked runtime proof did not preserve untracked=true.");
    const untrackedRuntimeIds = Array.isArray(untracked.untrackedRuntimeIds) ? untracked.untrackedRuntimeIds : [];
    if (!untrackedRuntimeIds.includes(untracked.runtimeEntryId)) {
      issues.push("Untracked runtime proof did not include the runtime in untrackedRuntimeIds.");
    }
    const nextSafeActions = Array.isArray(untracked.nextSafeActions) ? untracked.nextSafeActions : [];
    const mutationToolNames = nextSafeActions
      .map((action) => (typeof action?.toolName === "string" ? action.toolName : ""))
      .filter((toolName) => localRuntimeLifecycleMutationTools.has(toolName));
    if (mutationToolNames.length > 0) {
      issues.push(`Untracked runtime proof exposed lifecycle mutation tools: ${mutationToolNames.join(", ")}.`);
    }
    if (!nextSafeActions.some((action) => action?.action === "ask-user-to-stop-untracked" && action?.safety === "external")) {
      issues.push("Untracked runtime proof did not offer external ask-user-to-stop-untracked guidance.");
    }
    validateRepeatedUntrackedObservations(untracked, issues);
  }

  requirePassedScenario(staleRecovery, "stale-lease-recovery", issues);
  if (staleRecovery) {
    if (staleRecovery.ordinaryStopAllowed !== true) issues.push("Stale lease recovery proof did not prove ordinaryStopAllowed=true.");
    if (staleRecovery.ordinaryRestartAllowed !== true) issues.push("Stale lease recovery proof did not prove ordinaryRestartAllowed=true.");
    if (staleRecovery.forceRequiresSubagentCancellation !== false) {
      issues.push("Stale lease recovery proof did not prove forced lifecycle avoids sub-agent cancellation.");
    }
    if (staleRecovery.activeLeaseCount !== 0) issues.push("Stale lease recovery proof did not prove activeLeaseCount=0.");
    if (staleRecovery.activeOwnerCount !== 0) issues.push("Stale lease recovery proof did not prove activeOwnerCount=0.");
    const staleLeaseIds = Array.isArray(staleRecovery.staleLeaseIds) ? staleRecovery.staleLeaseIds : [];
    if (!staleLeaseIds.includes("lease-stale")) {
      issues.push("Stale lease recovery proof did not preserve lease-stale in staleLeaseIds.");
    }
    const blockerLeaseIds = Array.isArray(staleRecovery.blockerLeaseIds) ? staleRecovery.blockerLeaseIds : [];
    if (blockerLeaseIds.length > 0) issues.push("Stale lease recovery proof still reports blockerLeaseIds.");
    if (Array.isArray(staleRecovery.affectedSubagents) && staleRecovery.affectedSubagents.length > 0) {
      issues.push("Stale lease recovery proof still reports affected sub-agents.");
    }
    const nextSafeActions = Array.isArray(staleRecovery.nextSafeActions) ? staleRecovery.nextSafeActions : [];
    if (!nextSafeActions.some((action) => action?.action === "stop-runtime" && action?.toolName === "ambient_local_model_runtime_stop")) {
      issues.push("Stale lease recovery proof did not offer an ordinary Stop preview action.");
    }
    if (
      !nextSafeActions.some((action) => action?.action === "restart-runtime" && action?.toolName === "ambient_local_model_runtime_restart")
    ) {
      issues.push("Stale lease recovery proof did not offer an ordinary Restart preview action.");
    }
    if (nextSafeActions.some((action) => action?.action === "force-stop-runtime" || action?.action === "force-restart-runtime")) {
      issues.push("Stale lease recovery proof still offered forced ownership resolution actions.");
    }
  }

  requirePassedScenario(stoppedDisplay, "stopped-provider-display", issues);
  if (stoppedDisplay) {
    if (stoppedDisplay.minicpmDisplayedStopped !== true)
      issues.push("Stopped-provider display proof did not prove MiniCPM displayed stopped.");
    if (stoppedDisplay.voiceDisplayedStopped !== true)
      issues.push("Stopped-provider display proof did not prove voice provider displayed stopped.");
  }

  requirePassedScenario(providerLifecycle, "provider-declared-lifecycle", issues);
  if (providerLifecycle) {
    const actions = new Set(Array.isArray(providerLifecycle.actions) ? providerLifecycle.actions : []);
    for (const action of ["start", "stop", "restart"]) {
      if (!actions.has(action)) issues.push(`Provider-declared lifecycle proof did not prove ${action}.`);
    }
    if (providerLifecycle.usedGenericLifecycle === true) issues.push("Provider-declared lifecycle proof reported generic lifecycle use.");
  }

  if (!gateArtifact) {
    issues.push("Local runtime control proof gate artifact is missing.");
  } else {
    if (gateArtifact.schemaVersion !== "ambient-local-runtime-control-proof-gate-v1") {
      issues.push(`Local runtime control proof gate schemaVersion is ${gateArtifact.schemaVersion ?? "missing"}.`);
    }
    if (gateArtifact.status === "attention") {
      issues.push("Local runtime control proof gate reported attention status.");
    }
    const blockingIssues = Array.isArray(gateArtifact.releaseDecision?.blockingIssues) ? gateArtifact.releaseDecision.blockingIssues : [];
    if (blockingIssues.length > 0) {
      issues.push(`Local runtime control proof gate reported blocking issues: ${blockingIssues.join(" ")}`);
    }
    const failedChecks = (Array.isArray(gateArtifact.checks) ? gateArtifact.checks : [])
      .filter((check) => check?.status === "failed")
      .map((check) => check.id ?? "unknown");
    if (failedChecks.length > 0) {
      issues.push(`Local runtime control proof gate has failed checks: ${failedChecks.join(", ")}`);
    }
  }
  return { valid: issues.length === 0, issues };
}

const localRuntimeLifecycleMutationTools = new Set([
  "ambient_local_model_runtime_start",
  "ambient_local_model_runtime_stop",
  "ambient_local_model_runtime_restart",
]);

export const REQUIRED_LIFECYCLE_EDGE_KINDS = ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"];

export function validateSubagentRestartRepairArtifact(artifact, fixtureArtifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Sub-agent restart repair diagnostics artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-subagent-replay-diagnostics-v1") {
    issues.push(`Sub-agent restart repair diagnostics schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") {
    issues.push(`Sub-agent restart repair diagnostics status is ${artifact.status ?? "missing"}.`);
  }
  if (artifact.plan?.fixture !== "restart-repair-broken-child-tree") {
    issues.push(`Sub-agent restart repair fixture is ${artifact.plan?.fixture ?? "missing"}.`);
  }
  if (artifact.plan?.liveTokens !== false) {
    issues.push("Sub-agent restart repair replay diagnostics must not require live tokens.");
  }
  if (artifact.commandResult?.exitCode !== 0) {
    issues.push(`Sub-agent restart repair command exit code is ${artifact.commandResult?.exitCode ?? "missing"}.`);
  }
  if (artifact.vitest?.status !== "passed") {
    issues.push(`Sub-agent restart repair vitest status is ${artifact.vitest?.status ?? "missing"}.`);
  }
  if (Array.isArray(artifact.vitest?.missingReplayTests) && artifact.vitest.missingReplayTests.length > 0) {
    issues.push(`Sub-agent restart repair is missing replay tests: ${artifact.vitest.missingReplayTests.join(", ")}`);
  }
  const replayEvidence = artifact.replayEvidence;
  validateRestartRepairReplayEvidence(replayEvidence, issues);
  if (fixtureArtifact) validateRestartRepairReplayEvidence(fixtureArtifact, issues, "fixture ");
  return { valid: issues.length === 0, issues };
}

export function validateSubagentRestartRepairConfidenceArtifacts(restartRepairArtifact, fixtureArtifact, lifecycleEdgeArtifact) {
  const restartRepair = validateSubagentRestartRepairArtifact(restartRepairArtifact, fixtureArtifact);
  const lifecycleEdges = validateSubagentLifecycleEdgeArtifact(lifecycleEdgeArtifact);
  const issues = [...restartRepair.issues, ...lifecycleEdges.issues];
  return {
    valid: issues.length === 0,
    issues,
    parts: {
      restartRepair,
      lifecycleEdges,
    },
  };
}

export function validateSubagentLifecycleEdgeArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Sub-agent lifecycle edge artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-subagent-lifecycle-edge-evidence-v1") {
    issues.push(`Sub-agent lifecycle edge schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.featureFlagSnapshot?.ambientSubagentsEnabled !== true) {
    issues.push("Sub-agent lifecycle edge proof must prove ambient.subagents was enabled.");
  }
  if (!artifact.parent?.threadId || !artifact.parent?.runId) {
    issues.push("Sub-agent lifecycle edge proof is missing parent thread/run identity.");
  }
  const coveredKinds = Array.isArray(artifact.summary?.coveredEdgeKinds) ? artifact.summary.coveredEdgeKinds : [];
  const missingKinds = REQUIRED_LIFECYCLE_EDGE_KINDS.filter((kind) => !coveredKinds.includes(kind));
  if (missingKinds.length > 0) {
    issues.push(`Sub-agent lifecycle edge proof is missing edge kinds: ${missingKinds.join(", ")}.`);
  }
  if (Array.isArray(artifact.summary?.missingEdgeKinds) && artifact.summary.missingEdgeKinds.length > 0) {
    issues.push(`Sub-agent lifecycle edge proof summary reports missing edge kinds: ${artifact.summary.missingEdgeKinds.join(", ")}.`);
  }
  if (Array.isArray(artifact.summary?.unsafeEdgeIds) && artifact.summary.unsafeEdgeIds.length > 0) {
    issues.push(`Sub-agent lifecycle edge proof summary reports unsafe edges: ${artifact.summary.unsafeEdgeIds.join(", ")}.`);
  }
  const edges = Array.isArray(artifact.edges) ? artifact.edges : [];
  if (edges.length < REQUIRED_LIFECYCLE_EDGE_KINDS.length) {
    issues.push(`Sub-agent lifecycle edge proof has ${edges.length} edge rows; expected at least ${REQUIRED_LIFECYCLE_EDGE_KINDS.length}.`);
  }
  for (const edge of edges) validateLifecycleEdgeArtifactRow(edge, issues);
  return { valid: issues.length === 0, issues };
}

function validateRepeatedUntrackedObservations(artifact, issues) {
  const observations = Array.isArray(artifact.repeatedObservations) ? artifact.repeatedObservations : [];
  if (!Number.isInteger(artifact.repeatedObservationCount) || artifact.repeatedObservationCount < 2) {
    issues.push("Untracked runtime proof did not prove repeatedObservationCount>=2.");
    return;
  }
  if (observations.length !== artifact.repeatedObservationCount) {
    issues.push("Untracked runtime proof repeatedObservations length does not match repeatedObservationCount.");
    return;
  }
  const seenKinds = new Set();
  for (const [index, observation] of observations.entries()) {
    const label = observation?.observationKind ?? `#${index}`;
    if (observation?.runtimeEntryId !== artifact.runtimeEntryId) {
      issues.push(`Untracked runtime repeated observation ${label} did not match runtimeEntryId.`);
    }
    if (observation?.trackingStatus !== "untracked") {
      issues.push(`Untracked runtime repeated observation ${label} did not preserve trackingStatus=untracked.`);
    }
    if (observation?.ordinaryStopAllowed !== false) {
      issues.push(`Untracked runtime repeated observation ${label} did not keep ordinaryStopAllowed=false.`);
    }
    if (observation?.ordinaryRestartAllowed !== false) {
      issues.push(`Untracked runtime repeated observation ${label} did not keep ordinaryRestartAllowed=false.`);
    }
    if (observation?.forceTerminationAllowed !== false) {
      issues.push(`Untracked runtime repeated observation ${label} did not keep forceTerminationAllowed=false.`);
    }
    if (observation?.untracked !== true) {
      issues.push(`Untracked runtime repeated observation ${label} did not preserve untracked=true.`);
    }
    if (observation?.nextSafeAction !== "ask-user-to-stop-untracked" || observation?.nextSafeActionSafety !== "external") {
      issues.push(`Untracked runtime repeated observation ${label} did not keep external ask-user guidance.`);
    }
    if (typeof observation?.observationKind === "string" && observation.observationKind.length > 0) {
      seenKinds.add(observation.observationKind);
    }
  }
  if (seenKinds.size < 2) {
    issues.push("Untracked runtime proof did not prove at least two distinct repeated observation kinds.");
  }
}

function requirePassedScenario(scenario, id, issues) {
  if (!scenario) {
    issues.push(`Local runtime control proof is missing ${id} scenario.`);
  } else if (scenario.status !== "passed") {
    issues.push(`Local runtime control proof ${id} scenario status is ${scenario.status ?? "missing"}.`);
  }
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

function validateRestartRepairReplayEvidence(evidence, issues, labelPrefix = "") {
  if (!evidence || typeof evidence !== "object") {
    issues.push(`Sub-agent restart repair ${labelPrefix}replay evidence is missing.`);
    return;
  }
  if (evidence.schemaVersion !== "ambient-subagent-replay-evidence-v1") {
    issues.push(`Sub-agent restart repair ${labelPrefix}replay evidence schemaVersion is ${evidence.schemaVersion ?? "missing"}.`);
  }
  if (evidence.fixtureName !== "restart-repair-broken-child-tree") {
    issues.push(`Sub-agent restart repair ${labelPrefix}fixtureName is ${evidence.fixtureName ?? "missing"}.`);
  }
  if (evidence.liveTokens !== false) {
    issues.push(`Sub-agent restart repair ${labelPrefix}replay evidence must not require live tokens.`);
  }
  if (!positiveNumber(evidence.counts?.runtimeEvents)) {
    issues.push(`Sub-agent restart repair ${labelPrefix}runtime event evidence is missing.`);
  }
  if (!positiveNumber(evidence.counts?.persistedRunEvents)) {
    issues.push(`Sub-agent restart repair ${labelPrefix}persisted run event evidence is missing.`);
  }
  if (!positiveNumber(evidence.counts?.parentMailboxEvents)) {
    issues.push(`Sub-agent restart repair ${labelPrefix}parent mailbox evidence is missing.`);
  }
  if (!positiveNumber(evidence.counts?.childThreads)) {
    issues.push(`Sub-agent restart repair ${labelPrefix}child thread evidence is missing.`);
  }
  if (!Array.isArray(evidence.runtimeEventTimeline) || evidence.runtimeEventTimeline.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}runtimeEventTimeline is empty.`);
  }
  if (!Array.isArray(evidence.persistedRunEventTimeline) || evidence.persistedRunEventTimeline.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}persistedRunEventTimeline is empty.`);
  }
  if (!Array.isArray(evidence.parentMailboxTimeline) || evidence.parentMailboxTimeline.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}parentMailboxTimeline is empty.`);
  }
  if (!Array.isArray(evidence.childThreads) || evidence.childThreads.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}childThreads are missing.`);
  }
  const repair = evidence.restartRepair ?? {};
  const expectedIssueKinds = Array.isArray(repair.expectedIssueKinds) ? repair.expectedIssueKinds : [];
  const observedIssueKinds = Array.isArray(repair.observedIssueKinds) ? repair.observedIssueKinds : [];
  if (expectedIssueKinds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}expected issue kinds are missing.`);
  }
  if (observedIssueKinds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}observed issue kinds are missing.`);
  }
  const missingKinds = expectedIssueKinds.filter((kind) => !observedIssueKinds.includes(kind));
  if (missingKinds.length > 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}did not observe expected issue kinds: ${missingKinds.join(", ")}`);
  }
  if (!Array.isArray(repair.repairedRunIds) || repair.repairedRunIds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}repaired run ids are missing.`);
  }
  if (!Array.isArray(repair.repairedBarrierIds) || repair.repairedBarrierIds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}repaired barrier ids are missing.`);
  }
  if (!Array.isArray(repair.repairableSpawnEdgeRunIds) || repair.repairableSpawnEdgeRunIds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}repairable spawn-edge run ids are missing.`);
  }
  if (!Array.isArray(repair.danglingSpawnEdgeRunIds) || repair.danglingSpawnEdgeRunIds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}dangling spawn-edge run ids are missing.`);
  }
  if (!Array.isArray(repair.diagnosticRunIds) || repair.diagnosticRunIds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}diagnostic run ids are missing.`);
  }
  validateRestartRepairRehydrationProof(evidence.rehydration, issues, labelPrefix);
}

function validateRestartRepairRehydrationProof(rehydration, issues, labelPrefix = "") {
  if (!rehydration || typeof rehydration !== "object") {
    issues.push(`Sub-agent restart repair ${labelPrefix}rehydration proof is missing.`);
    return;
  }
  if (rehydration.schemaVersion !== "ambient-subagent-restart-rehydration-proof-v1") {
    issues.push(`Sub-agent restart repair ${labelPrefix}rehydration proof schemaVersion is ${rehydration.schemaVersion ?? "missing"}.`);
  }
  if (!nonEmptyStringArray(rehydration.childRunIds))
    issues.push(`Sub-agent restart repair ${labelPrefix}rehydration childRunIds are missing.`);
  if (!nonEmptyStringArray(rehydration.childThreadIds))
    issues.push(`Sub-agent restart repair ${labelPrefix}rehydration childThreadIds are missing.`);
  if (!nonEmptyStringArray(rehydration.parentMailboxEventIds))
    issues.push(`Sub-agent restart repair ${labelPrefix}rehydration parentMailboxEventIds are missing.`);
  const mailboxStates = Array.isArray(rehydration.parentMailboxStates) ? rehydration.parentMailboxStates : [];
  if (mailboxStates.length === 0) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration parentMailboxStates are missing.`);
  for (const state of mailboxStates) {
    if (!nonEmptyString(state?.id)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration mailbox state is missing id.`);
    if (!nonEmptyString(state?.parentThreadId))
      issues.push(`Sub-agent restart repair ${labelPrefix}rehydration mailbox ${state?.id ?? "unknown"} is missing parentThreadId.`);
    if (!nonEmptyString(state?.parentRunId))
      issues.push(`Sub-agent restart repair ${labelPrefix}rehydration mailbox ${state?.id ?? "unknown"} is missing parentRunId.`);
    if (!["queued", "delivered", "consumed", "failed", "cancelled"].includes(state?.deliveryState)) {
      issues.push(
        `Sub-agent restart repair ${labelPrefix}rehydration mailbox ${state?.id ?? "unknown"} has invalid deliveryState ${state?.deliveryState ?? "missing"}.`,
      );
    }
    if (!nonEmptyStringArray(state?.childRunIds))
      issues.push(`Sub-agent restart repair ${labelPrefix}rehydration mailbox ${state?.id ?? "unknown"} is missing childRunIds.`);
  }
  if (!nonEmptyStringArray(rehydration.transcriptThreadIds))
    issues.push(`Sub-agent restart repair ${labelPrefix}rehydration transcriptThreadIds are missing.`);
  const artifactPointers = Array.isArray(rehydration.resultArtifactPointers) ? rehydration.resultArtifactPointers : [];
  if (artifactPointers.length === 0) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration resultArtifactPointers are missing.`);
  for (const pointer of artifactPointers) {
    if (!nonEmptyString(pointer?.runId))
      issues.push(`Sub-agent restart repair ${labelPrefix}rehydration artifact pointer is missing runId.`);
    if (!nonEmptyString(pointer?.childThreadId))
      issues.push(
        `Sub-agent restart repair ${labelPrefix}rehydration artifact pointer ${pointer?.runId ?? "unknown"} is missing childThreadId.`,
      );
    if (![pointer?.artifactPath, pointer?.fullOutputPath, pointer?.structuredOutputPath].some(nonEmptyString)) {
      issues.push(
        `Sub-agent restart repair ${labelPrefix}rehydration artifact pointer ${pointer?.runId ?? "unknown"} is missing artifact paths.`,
      );
    }
  }
  if (!nonEmptyStringArray(rehydration.missingResultArtifactRunIds)) {
    issues.push(`Sub-agent restart repair ${labelPrefix}rehydration missingResultArtifactRunIds are missing.`);
  }
  const integrity = rehydration.artifactPointerIntegrity ?? {};
  for (const field of [
    "allResultPointersHaveRunAndThread",
    "missingResultArtifactsDiagnosed",
    "parentMailboxChildRefsResolved",
    "transcriptChildRefsResolved",
  ]) {
    if (integrity[field] !== true) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration integrity ${field} is not true.`);
  }
}
