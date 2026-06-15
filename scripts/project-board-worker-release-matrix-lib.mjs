export function buildProjectBoardWorkerReleaseMatrixReport(input = {}) {
  const dogfood = input.dogfood && typeof input.dogfood === "object" ? input.dogfood : {};
  const releaseGate = dogfood.releaseGate && typeof dogfood.releaseGate === "object" ? dogfood.releaseGate : undefined;
  const metrics = releaseGate?.metrics ?? {};
  const gates = releaseGate?.gates ?? {};
  const steps = Array.isArray(dogfood.steps) ? dogfood.steps : [];
  const execution = latestStep(steps, "execute-local-task");
  const ticketize = latestStep(steps, "ticketize-card");
  const splitResolution = latestStep(steps, "resolve-runtime-split");
  const dogfoodExitCode = Number.isFinite(input.dogfoodExitCode) ? input.dogfoodExitCode : undefined;
  const dogfoodPassed = dogfoodExitCode === 0 && dogfood.status === "passed" && releaseGate?.status === "passed";
  const report = {
    version: 1,
    status: dogfoodPassed ? "passed" : "attention",
    generatedAt: input.completedAt ?? new Date().toISOString(),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    dogfoodOutputPath: input.dogfoodOutputPath,
    dogfoodExitCode,
    dogfoodSignal: input.dogfoodSignal,
    command: input.command,
    sourceRevision: input.sourceRevision,
    focus:
      "App-boundary first-ready worker execution with product-owned runtime closure, task-action protocol, PM proof review, and runtime-split follow-up state.",
    scenario: {
      name: "worker-enabled first-ready execution",
      manualRuntimeSplitCard: dogfood.manualRuntimeSplitCard === true,
      forcedCardRuntimeBudgetMs: dogfood.forcedCardRuntimeBudgetMs,
      requireRuntimeSplit: dogfood.requireRuntimeSplit === true,
      splitDecisionAction: dogfood.splitDecisionAction || undefined,
      workerRunMaxElapsedMs: dogfood.workerRunMaxElapsedMs,
    },
    observations: {
      dogfoodStatus: dogfood.status,
      releaseGateStatus: releaseGate?.status,
      runStatus: execution?.status,
      taskState: execution?.taskState,
      finalCardStatus: execution?.cardStatus,
      ticketizedCardTitle: ticketize?.title,
      ticketizedCardId: ticketize?.cardId,
      taskId: ticketize?.taskId,
      proofReviewStatus: metrics.proofOutcome?.proofReviewStatus,
      proofRecommendedAction: metrics.proofOutcome?.recommendedAction,
      proofEvidenceQuality: metrics.proofOutcome?.evidenceQuality,
      proofConfidence: metrics.proofOutcome?.confidence,
      proofActionIntegrityIssueCount: metrics.proofActionIntegrity?.issueCount,
      proofActionIntegrityIssues: metrics.proofActionIntegrity?.issues ?? [],
      taskActionProtocolObserved: gates.taskActionProtocolObserved,
      taskActionCount: metrics.proofOutcome?.taskActionCount,
      taskActionCountsByAction: execution?.taskActions?.countsByAction,
      meaningfulChangedPathCount: metrics.proofOutcome?.meaningfulChangedPathCount,
      meaningfulChangedPaths: execution?.meaningfulChangedPaths ?? [],
      runtimeBudgetExceeded: metrics.proofOutcome?.runtimeBudgetExceeded,
      runtimeBudgetMaxMs: metrics.proofOutcome?.runtimeBudgetMaxMs,
      runtimeBudgetElapsedMs: metrics.proofOutcome?.runtimeBudgetElapsedMs,
      harnessTimedOutFirst: metrics.productRuntimeBudgetClosure?.harnessTimedOutFirst,
      productRuntimeBudgetClosureObserved: metrics.productRuntimeBudgetClosure?.observed,
      runtimeBudgetSplitCount: metrics.splitOutcomes?.runtimeBudgetSplitCount,
      runtimeSplitOutcomeActionable: gates.runtimeSplitOutcomeActionable,
      splitDecisionObserved: Boolean(splitResolution),
      splitDecisionAction: splitResolution?.action,
      splitDecisionAfterStatus: splitResolution?.afterStatus,
      followUpCardCount: metrics.proofOutcome?.followUpCardCount,
      followUpCards: execution?.followUpCards ?? [],
      providerTimeoutObserved: providerTimeoutObserved(dogfood),
      notes: releaseGate?.notes ?? [],
    },
    gates: {
      firstCardObserved: gates.firstCardObserved,
      firstTicketizedTaskObserved: gates.firstTicketizedTaskObserved,
      proofOutcomeObserved: gates.proofOutcomeObserved,
      proofOutcomeActionable: gates.proofOutcomeActionable,
      proofActionIntegrityAcceptable: gates.proofActionIntegrityAcceptable,
      taskActionProtocolObserved: gates.taskActionProtocolObserved,
      runtimeSplitOutcomeActionable: gates.runtimeSplitOutcomeActionable,
      productRuntimeBudgetClosureObserved: gates.productRuntimeBudgetClosureObserved,
      workerPartialProgressActionable: gates.workerPartialProgressActionable,
    },
    releaseGate,
    stepSummary: steps.map((step) => ({
      name: step?.name,
      status: step?.status,
      title: step?.title,
      runId: step?.runId,
      cardId: step?.cardId,
      taskId: step?.taskId,
      proofReviewStatus: step?.proofReview?.status,
      splitOutcomeStatus: step?.splitOutcome?.status,
      followUpCardCount: step?.followUpCardCount,
      action: step?.action,
    })),
  };
  report.status = workerReleaseMatrixPassed(report) ? "passed" : "attention";
  return report;
}

export function workerReleaseMatrixPassed(report) {
  return (
    report?.dogfoodExitCode === 0 &&
    report?.observations?.dogfoodStatus === "passed" &&
    report?.observations?.releaseGateStatus === "passed" &&
    report?.gates?.firstCardObserved === true &&
    report?.gates?.firstTicketizedTaskObserved === true &&
    report?.gates?.proofOutcomeObserved === true &&
    report?.gates?.proofOutcomeActionable === true &&
    report?.gates?.proofActionIntegrityAcceptable === true &&
    report?.gates?.taskActionProtocolObserved === true &&
    report?.gates?.runtimeSplitOutcomeActionable === true &&
    report?.gates?.productRuntimeBudgetClosureObserved === true &&
    report?.observations?.providerTimeoutObserved !== true
  );
}

function latestStep(steps, name) {
  return [...steps].reverse().find((step) => step?.name === name);
}

function providerTimeoutObserved(dogfood) {
  const text = [
    dogfood.error,
    dogfood.electronOutputTail,
    ...(Array.isArray(dogfood.loopBreaks) ? dogfood.loopBreaks : []),
    ...(dogfood.releaseGate?.notes ?? []),
  ]
    .filter((value) => typeof value === "string")
    .join("\n")
    .toLowerCase();
  return /\b(provider|ambient|pi|stream|model).{0,80}\b(timeout|stalled|idle)\b/.test(text);
}
