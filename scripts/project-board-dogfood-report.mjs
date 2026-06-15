export function buildProjectBoardDogfoodReleaseGate(observations = {}, options = {}) {
  const board = options.board;
  const steps = Array.isArray(observations.steps) ? observations.steps : [];
  const incremental = latestStep(steps, "initial-board-incremental-milestones");
  const synthesis = latestSynthesisRun(board);
  const execution = latestStep(steps, "execute-local-task");
  const ticketize = latestStep(steps, "ticketize-card");
  const manualRuntimeSplitCardObserved = observations.manualRuntimeSplitCard === true && Boolean(latestStep(steps, "create-runtime-split-manual-card"));
  const duplicateMetrics = duplicateCardMetrics(board?.cards ?? cardsFromObservationSteps(steps));
  const clarificationMetrics = clarificationQuestionMetrics(board?.cards ?? []);
  const sourceCoverage = sourceCoverageMetrics(board, incremental, synthesis);
  const timeToFirstCardMs = firstFinite(
    incremental?.timeToFirstCardMs,
    incremental?.firstCard?.elapsedMs,
    firstStepWithNumber(steps, "timeToFirstCardMs"),
  );
  const timeToFirstTicketizedTaskMs = firstFinite(
    incremental?.timeToFirstTicketizedTaskMs,
    incremental?.firstTicketizedCard?.elapsedMs,
    firstStepWithNumber(steps, "timeToFirstTicketizedTaskMs"),
  );
  const finalPlanningDurationMs = synthesis?.completedAt
    ? firstFinite(durationMs(synthesis.startedAt, synthesis.completedAt), synthesis.durationMs)
    : undefined;
  const planningObservedDurationMs = firstFinite(
    finalPlanningDurationMs,
    durationMs(synthesis?.startedAt, synthesis?.updatedAt),
    incremental?.samples?.at?.(-1)?.elapsedMs,
  );
  const proofOutcome = proofOutcomeMetrics(execution);
  const proofActionIntegrity = proofActionIntegrityMetrics(execution);
  const visualProof = visualProofMetrics(execution, proofOutcome);
  const splitOutcome = splitOutcomeMetrics(board?.cards ?? []);
  const proofScopeWarnings = proofScopeWarningMetrics(board);
  const productRuntimeBudgetClosure = productRuntimeBudgetClosureMetrics(observations, proofOutcome, splitOutcome);
  const progress = progressMetrics(incremental, synthesis, steps);
  const gates = {
    firstCardObserved: Number.isFinite(timeToFirstCardMs) || manualRuntimeSplitCardObserved,
    firstTicketizedTaskObserved: Number.isFinite(timeToFirstTicketizedTaskMs) || Boolean(ticketize?.taskId),
    duplicateRateAcceptable: duplicateMetrics.duplicateCardRate <= 0.15,
    noNeedsClarificationWithoutQuestion: clarificationMetrics.needsClarificationWithoutQuestions === 0,
    proofOutcomeObserved: proofOutcome.observed,
    proofOutcomeActionable: proofOutcome.skipped || !proofOutcome.observed || proofOutcome.actionableNextStep === true,
    proofActionIntegrityAcceptable: proofActionIntegrity.issueCount === 0,
    taskActionProtocolObserved: observations.requireTaskActions !== true || proofOutcome.skipped || !proofOutcome.observed || Number(proofOutcome.taskActionCount ?? 0) > 0,
    visualProofReadableOrActionable: !visualProof.required || visualProof.hasReadableArtifact || visualProof.handledByProofReview,
    workerPartialProgressActionable: !proofOutcome.partial || proofOutcome.actionableNextStep === true,
    runtimeSplitOutcomeActionable: runtimeSplitOutcomeGate(proofOutcome, splitOutcome),
    productRuntimeBudgetClosureObserved: productRuntimeBudgetClosure.observed,
    proofScopeWarningsAcknowledged:
      proofScopeWarnings.warnedTicketizedWithoutAcknowledgementCount === 0,
  };
  const notes = releaseGateNotes({
    observations,
    gates,
    duplicateMetrics,
    clarificationMetrics,
    proofOutcome,
    proofActionIntegrity,
    visualProof,
    splitOutcome,
    proofScopeWarnings,
    productRuntimeBudgetClosure,
    sourceCoverage,
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    status: releaseGateStatus(observations.status, gates),
    metrics: {
      timeToFirstCardMs,
      timeToFirstTicketizedTaskMs,
      finalPlanningDurationMs,
      planningObservedDurationMs,
      sourceCoverage,
      duplicateCards: duplicateMetrics,
      clarificationQuestions: clarificationMetrics,
      proofOutcome,
      proofActionIntegrity,
      visualProof,
      splitOutcomes: splitOutcome,
      proofScopeWarnings,
      productRuntimeBudgetClosure,
      progress,
      focusedManualRuntimeSplit: {
        manualCardObserved: manualRuntimeSplitCardObserved,
      },
      board: boardSummary(board),
    },
    gates,
    notes,
  };
}

function latestStep(steps, name) {
  return [...steps].reverse().find((step) => step?.name === name);
}

function firstStepWithNumber(steps, key) {
  return steps.map((step) => step?.[key]).find((value) => Number.isFinite(value));
}

function firstFinite(...values) {
  return values.find((value) => Number.isFinite(value));
}

function latestSynthesisRun(board) {
  const runs = Array.isArray(board?.synthesisRuns) ? board.synthesisRuns : [];
  return [...runs].sort((left, right) => timestampMs(right.updatedAt ?? right.completedAt) - timestampMs(left.updatedAt ?? left.completedAt))[0];
}

function durationMs(startedAt, completedAt) {
  const started = timestampMs(startedAt);
  const completed = timestampMs(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return undefined;
  return completed - started;
}

function timestampMs(value) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function duplicateCardMetrics(cards) {
  const activeCards = cards.filter((card) => card && card.status !== "archived" && card.candidateStatus !== "duplicate");
  const groups = new Map();
  for (const card of activeCards) {
    const key = normalizeTitle(card.title);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push({ id: card.id, title: card.title, status: card.status, candidateStatus: card.candidateStatus });
    groups.set(key, group);
  }
  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  const duplicateCardCount = duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);
  const totalCardCount = activeCards.length;
  return {
    totalCardCount,
    duplicateCardCount,
    duplicateGroupCount: duplicateGroups.length,
    duplicateCardRate: totalCardCount ? Number((duplicateCardCount / totalCardCount).toFixed(4)) : 0,
    duplicateGroups: duplicateGroups.slice(0, 10),
  };
}

function cardsFromObservationSteps(steps) {
  return steps.flatMap((step) => (Array.isArray(step?.cards) ? step.cards : []));
}

function normalizeTitle(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clarificationQuestionMetrics(cards) {
  const needsClarificationCards = cards.filter((card) => card?.candidateStatus === "needs_clarification");
  const cardsWithClarificationQuestions = cards.filter((card) => Array.isArray(card?.clarificationQuestions) && card.clarificationQuestions.length > 0);
  const totalClarificationQuestions = cardsWithClarificationQuestions.reduce((sum, card) => sum + card.clarificationQuestions.length, 0);
  const needsClarificationWithoutQuestions = needsClarificationCards.filter((card) => !Array.isArray(card?.clarificationQuestions) || card.clarificationQuestions.length === 0).length;
  return {
    needsClarificationCardCount: needsClarificationCards.length,
    cardsWithClarificationQuestions: cardsWithClarificationQuestions.length,
    totalClarificationQuestions,
    needsClarificationWithoutQuestions,
  };
}

function sourceCoverageMetrics(board, incremental, synthesis) {
  const sourceCount = firstFinite(synthesis?.sourceCount, incremental?.sourceCount, board?.sources?.length) ?? 0;
  const includedSourceCount = firstFinite(synthesis?.includedSourceCount, incremental?.includedSourceCount, board?.sources?.filter?.((source) => source.includeInSynthesis !== false).length) ?? 0;
  return {
    sourceCount,
    includedSourceCount,
    sourceCharCount: firstFinite(synthesis?.sourceCharCount, incremental?.sourceCharCount),
    promptCharCount: firstFinite(synthesis?.promptCharCount, incremental?.promptCharCount),
    responseCharCount: firstFinite(synthesis?.responseCharCount, incremental?.responseCharCount),
    coverageRatio: sourceCount ? Number((includedSourceCount / sourceCount).toFixed(4)) : undefined,
  };
}

function proofOutcomeMetrics(execution) {
  const review = execution?.proofReview;
  const runtimeBudget = execution?.proofOfWork?.projectBoardRuntimeBudget;
  const harnessBudget = execution?.proofOfWork?.projectBoardDogfoodHarnessBudget;
  const harnessBoundedTimeout = execution?.status === "bounded_timeout";
  return {
    skipped: execution?.skipped === true,
    partial: execution?.partial === true || harnessBoundedTimeout || runtimeBudget?.exceeded === true || harnessBudget?.exceeded === true,
    observed: Boolean(review || execution?.status || execution?.cardStatus),
    runStatus: execution?.status,
    cardStatus: execution?.cardStatus,
    proofReviewStatus: review?.status,
    recommendedAction: review?.recommendedAction ?? (runtimeBudget?.exceeded === true || harnessBudget?.exceeded === true ? "retry" : undefined),
    evidenceQuality: review?.evidenceQuality,
    confidence: review?.confidence,
    actionableNextStep: actionableProofReviewOutcome(review) ?? (runtimeBudget?.exceeded === true || harnessBudget?.exceeded === true ? true : undefined),
    missingCount: Array.isArray(review?.missing) ? review.missing.length : undefined,
    taskActionCount: execution?.taskActions?.count,
    followUpCardCount: execution?.followUpCardCount,
    meaningfulChangedPathCount: Array.isArray(execution?.meaningfulChangedPaths) ? execution.meaningfulChangedPaths.length : undefined,
    visualProofArtifactCount: Array.isArray(execution?.visualProofArtifacts) ? execution.visualProofArtifacts.length : undefined,
    runtimeBudgetExceeded: runtimeBudget?.exceeded === true,
    runtimeBudgetMaxMs: runtimeBudget?.maxRuntimeMs,
    runtimeBudgetElapsedMs: runtimeBudget?.elapsedMs ?? execution?.workerElapsedMs,
    harnessBoundedTimeout,
    harnessBudgetExceeded: harnessBudget?.exceeded === true,
    harnessBudgetMaxMs: harnessBudget?.maxRuntimeMs,
    harnessBudgetElapsedMs: harnessBudget?.elapsedMs ?? execution?.workerElapsedMs,
  };
}

function proofActionIntegrityMetrics(execution) {
  const actions = rawTaskActionsFromExecution(execution);
  const issues = [];
  const hasMaterialProofAction = actions.some((action) => ["task_report_proof", "task_complete"].includes(action.action) && taskActionHasMaterialProof(action));
  for (const action of actions) {
    const copiedFields = copiedSampleTaskActionFields(action);
    if (copiedFields.length > 0) issues.push(`${action.action} ${action.actionId ?? "(missing id)"} copied sample value(s): ${copiedFields.join(", ")}.`);
    if (action.action === "task_report_proof" && !taskActionHasMaterialProof(action)) {
      issues.push(`${action.action} ${action.actionId ?? "(missing id)"} has no material proof payload.`);
    }
    if (action.action === "task_complete" && !hasMaterialProofAction && !taskActionHasMaterialProof(action)) {
      issues.push(`${action.action} ${action.actionId ?? "(missing id)"} has no material proof payload.`);
    }
  }
  return {
    checkedActionCount: actions.length,
    issueCount: issues.length,
    issues: [...new Set(issues)].slice(0, 10),
  };
}

function visualProofMetrics(execution, proofOutcome) {
  const artifacts = Array.isArray(execution?.visualProofArtifacts) ? execution.visualProofArtifacts : [];
  const readableArtifacts = artifacts.filter(isReadableVisualProofArtifact);
  const required = execution?.visualProofRequired === true;
  const handledByProofReview =
    required &&
    readableArtifacts.length === 0 &&
    proofOutcome.actionableNextStep === true &&
    typeof proofOutcome.recommendedAction === "string" &&
    proofOutcome.recommendedAction !== "close" &&
    proofOutcome.proofReviewStatus !== "done";
  return {
    required,
    artifactCount: artifacts.length,
    readableArtifactCount: readableArtifacts.length,
    unreadableArtifactCount: Math.max(0, artifacts.length - readableArtifacts.length),
    hasReadableArtifact: readableArtifacts.length > 0,
    handledByProofReview,
    unreadableArtifacts: artifacts
      .filter((artifact) => !isReadableVisualProofArtifact(artifact))
      .slice(0, 5)
      .map((artifact) => ({
        path: artifact.path,
        width: artifact.width,
        height: artifact.height,
        nonBlackRatio: artifact.nonBlackRatio,
        distinctColorCount: artifact.distinctColorCount,
      })),
  };
}

function isReadableVisualProofArtifact(artifact) {
  return artifact?.width >= 800 && artifact?.height >= 600 && artifact?.nonBlackPixels > 0 && artifact?.distinctColorCount > 1;
}

function splitOutcomeMetrics(cards) {
  const byId = new Map(cards.filter(Boolean).map((card) => [card.id, card]));
  const rows = cards
    .filter((card) => card?.splitOutcome)
    .map((parent) => {
      const outcome = parent.splitOutcome;
      const childCardIds = Array.isArray(outcome.childCardIds) ? outcome.childCardIds.filter((id) => typeof id === "string" && id.trim()) : [];
      const children = childCardIds.map((id) => byId.get(id)).filter(Boolean);
      const missingChildCardIds = childCardIds.filter((id) => !byId.has(id));
      const actionableChildren = children.filter(isActionableSplitChild);
      const representedChildren = children.filter(isRepresentedSplitChild);
      const open = outcome.status === "proposed" || outcome.status === "approved";
      return {
        parentCardId: parent.id,
        parentTitle: parent.title,
        status: outcome.status,
        source: outcome.source,
        sourceRunId: outcome.sourceRunId,
        open,
        childCardIds,
        childCardCount: children.length,
        missingChildCardIds,
        missingChildRefCount: missingChildCardIds.length,
        actionableChildCount: actionableChildren.length,
        representedChildCount: representedChildren.length,
        childTitles: children.map((child) => child.title).slice(0, 5),
      };
    });
  const runtimeRows = rows.filter((row) => row.source === "runtime_budget");
  const openRuntimeRows = runtimeRows.filter((row) => row.open);
  return {
    totalSplitCount: rows.length,
    runtimeBudgetSplitCount: runtimeRows.length,
    proposedCount: rows.filter((row) => row.status === "proposed").length,
    approvedCount: rows.filter((row) => row.status === "approved").length,
    rejectedCount: rows.filter((row) => row.status === "rejected").length,
    replacedCount: rows.filter((row) => row.status === "replaced").length,
    doneViaSplitCount: rows.filter((row) => row.status === "done_via_split").length,
    childCardCount: rows.reduce((sum, row) => sum + row.childCardCount, 0),
    actionableChildCount: rows.reduce((sum, row) => sum + row.actionableChildCount, 0),
    representedChildCount: rows.reduce((sum, row) => sum + row.representedChildCount, 0),
    unresolvedChildRefCount: rows.reduce((sum, row) => sum + row.missingChildRefCount, 0),
    openRuntimeBudgetSplitCount: openRuntimeRows.length,
    openRuntimeBudgetSplitWithoutActionableChildCount: openRuntimeRows.filter((row) => row.actionableChildCount === 0).length,
    rows: rows.slice(0, 10),
  };
}

function proofScopeWarningMetrics(board) {
  const cards = Array.isArray(board?.cards) ? board.cards : [];
  const warnings = proofScopeWarningsFromBoard(board);
  const cardMatches = warnings.flatMap((warning) =>
    cards
      .filter((card) => proofScopeWarningMatchesCard(warning, card))
      .map((card) => ({ warning, card })),
  );
  const warnedCards = uniqueBy(
    cardMatches.map(({ card }) => ({
      id: card.id,
      sourceId: card.sourceId,
      title: card.title,
      status: card.status,
      candidateStatus: card.candidateStatus,
      orchestrationTaskId: card.orchestrationTaskId,
      acknowledged: projectBoardCardHasProofScopeAcknowledgement(card),
      userTouchedFields: Array.isArray(card.userTouchedFields) ? card.userTouchedFields : [],
    })),
    (card) => card.id ?? `${card.sourceId}:${normalizeTitle(card.title)}`,
  );
  const ticketizedWarnedCards = warnedCards.filter((card) => Boolean(card.orchestrationTaskId));
  const ticketizedWithoutAcknowledgement = ticketizedWarnedCards.filter((card) => !card.acknowledged);
  return {
    warningCount: warnings.length,
    warnedCardCount: warnedCards.length,
    warnedTicketizedCardCount: ticketizedWarnedCards.length,
    warnedTicketizedWithoutAcknowledgementCount: ticketizedWithoutAcknowledgement.length,
    warningRecords: warnings.slice(0, 10),
    warnedTicketizedCards: ticketizedWarnedCards.slice(0, 10),
    warnedTicketizedWithoutAcknowledgement: ticketizedWithoutAcknowledgement.slice(0, 10),
    advisory: true,
  };
}

function proofScopeWarningsFromBoard(board) {
  const direct = Array.isArray(board?.proofScopeWarnings) ? board.proofScopeWarnings : [];
  const fromRuns = (Array.isArray(board?.synthesisRuns) ? board.synthesisRuns : []).flatMap((run) =>
    (Array.isArray(run?.progressiveRecords) ? run.progressiveRecords : [])
      .filter((record) => record?.type === "warning" && record?.code === "proof_scope_mismatch")
      .map((record) => proofScopeWarningFromRecord(record, run)),
  );
  return uniqueBy([...direct, ...fromRuns].map(normalizeProofScopeWarning).filter(Boolean), (warning) =>
    [warning.runId ?? "", warning.cardRef ?? "", warning.title ?? "", warning.message ?? ""].join("\n"),
  );
}

function normalizeProofScopeWarning(warning) {
  if (!warning || typeof warning !== "object") return undefined;
  const metadata = warning.metadata && typeof warning.metadata === "object" ? warning.metadata : {};
  const cardRef = warning.cardRef ?? warning.cardId ?? warning.sourceId ?? metadata.cardId ?? metadata.sourceId;
  return {
    code: "proof_scope_mismatch",
    runId: warning.runId,
    runStatus: warning.runStatus,
    runStage: warning.runStage,
    message: String(warning.message ?? ""),
    createdAt: warning.createdAt,
    cardRef: typeof cardRef === "string" && cardRef.trim() ? cardRef.trim() : undefined,
    title: typeof warning.title === "string" && warning.title.trim()
      ? warning.title.trim()
      : typeof metadata.title === "string" && metadata.title.trim()
        ? metadata.title.trim()
        : undefined,
    proofOwnership: warning.proofOwnership ?? metadata.proofOwnership,
    visualProofItems: Array.isArray(warning.visualProofItems)
      ? warning.visualProofItems.filter((item) => typeof item === "string" && item.trim()).slice(0, 5)
      : Array.isArray(metadata.visualProofItems)
        ? metadata.visualProofItems.filter((item) => typeof item === "string" && item.trim()).slice(0, 5)
        : [],
  };
}

function proofScopeWarningFromRecord(record, run) {
  return {
    runId: run?.id,
    runStatus: run?.status,
    runStage: run?.stage,
    message: record.message,
    createdAt: record.createdAt,
    metadata: record.metadata,
  };
}

function proofScopeWarningMatchesCard(warning, card) {
  if (!warning || !card) return false;
  const refs = [card.id, card.sourceId, card.orchestrationTaskId].filter((value) => typeof value === "string" && value.trim());
  if (warning.cardRef && refs.includes(warning.cardRef)) return true;
  return Boolean(warning.title && normalizeTitle(warning.title) && normalizeTitle(warning.title) === normalizeTitle(card.title));
}

function projectBoardCardHasProofScopeAcknowledgement(card) {
  const touched = Array.isArray(card?.userTouchedFields) ? card.userTouchedFields : [];
  return touched.some((field) =>
    ["candidateStatus", "testPlan", "acceptanceCriteria", "description", "clarificationQuestions", "clarificationAnswers"].includes(field),
  );
}

function uniqueBy(items, keyForItem) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyForItem(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function isActionableSplitChild(card) {
  if (!card || card.status === "archived") return false;
  if (["duplicate", "rejected", "evidence"].includes(card.candidateStatus)) return false;
  if (card.candidateStatus === "needs_clarification") {
    return Array.isArray(card.clarificationQuestions) && card.clarificationQuestions.length > 0;
  }
  return ["draft", "ready", "blocked", "in_progress", "review"].includes(card.status) || Boolean(card.orchestrationTaskId);
}

function isRepresentedSplitChild(card) {
  if (!card || card.status === "archived") return false;
  return card.status === "done" || card.candidateStatus === "evidence";
}

function runtimeSplitOutcomeGate(proofOutcome, splitOutcome) {
  if (!proofOutcome.runtimeBudgetExceeded) return true;
  if (splitOutcome.runtimeBudgetSplitCount === 0) return proofOutcome.recommendedAction !== "follow_up";
  if (splitOutcome.unresolvedChildRefCount > 0) return false;
  return splitOutcome.openRuntimeBudgetSplitWithoutActionableChildCount === 0;
}

function productRuntimeBudgetClosureMetrics(observations, proofOutcome, splitOutcome) {
  const required = observations?.requireRuntimeSplit === true;
  const observed =
    !required ||
    (proofOutcome.runtimeBudgetExceeded === true &&
      proofOutcome.harnessBoundedTimeout !== true &&
      splitOutcome.runtimeBudgetSplitCount > 0 &&
      splitOutcome.unresolvedChildRefCount === 0 &&
      splitOutcome.openRuntimeBudgetSplitWithoutActionableChildCount === 0);
  return {
    required,
    observed,
    harnessTimedOutFirst: required && proofOutcome.harnessBoundedTimeout === true,
  };
}

function rawTaskActionsFromExecution(execution) {
  const proof = execution?.proofOfWork && typeof execution.proofOfWork === "object" ? execution.proofOfWork : {};
  const raw = [proof.taskToolActions, proof.taskActions, proof.modelTaskActions]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter((action) => action && typeof action === "object" && typeof action.action === "string" && action.action.startsWith("task_"));
  if (raw.length > 0) return raw;
  return Array.isArray(execution?.taskActions?.actions) ? execution.taskActions.actions : [];
}

function copiedSampleTaskActionFields(action) {
  const fields = [];
  const hasSampleActionId = ["heartbeat-1", "proof-1", "unique-heartbeat-id", "unique-proof-id"].includes(String(action.actionId ?? ""));
  const check = (field, value) => {
    for (const item of stringValues(value)) {
      if (isCopiedSampleTaskActionValue(item)) fields.push(field);
    }
  };
  check("summary", action.summary ?? action.reason ?? action.title);
  check("completed", action.completed);
  check("remaining", action.remaining);
  check("commands", action.commands);
  check("changedFiles", action.changedFiles);
  check("manualChecks", action.manualChecks);
  if (hasSampleActionId && fields.length > 0) fields.unshift("actionId");
  return [...new Set(fields)];
}

function stringValues(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  return [];
}

function isCopiedSampleTaskActionValue(value) {
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return [
    "short progress update.",
    "concrete completed item.",
    "concrete remaining item.",
    "verification passed.",
    "describe actual progress from this run.",
    "name a concrete item actually completed.",
    "name concrete remaining work, or leave this array empty.",
    "summarize the actual proof collected in this run.",
  ].includes(normalized);
}

function taskActionHasMaterialProof(action) {
  return (
    valueCount(action.commands) > 0 ||
    valueCount(action.changedFiles) > 0 ||
    valueCount(action.screenshots) > 0 ||
    valueCount(action.browserTraces) > 0 ||
    valueCount(action.visualChecks) > 0 ||
    valueCount(action.manualChecks) > 0 ||
    valueCount(action.completed) > 0
  );
}

function valueCount(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function progressMetrics(incremental, synthesis, steps) {
  return {
    synthesisProgressSampleCount: incremental?.sampleCount ?? incremental?.samples?.length ?? 0,
    progressiveRecordCount: firstFinite(synthesis?.progressiveRecordCount, incremental?.progressiveRecordCount),
    maxBoardSynthesisCardCount: incremental?.maxBoardSynthesisCardCount,
    maxTicketizedCardCount: incremental?.maxTicketizedCardCount,
    synthesisEventCount: firstFinite(synthesis?.eventCount, Array.isArray(synthesis?.events) ? synthesis.events.length : undefined),
    executedStepCount: steps.length,
  };
}

function boardSummary(board) {
  if (!board) return undefined;
  const cards = Array.isArray(board.cards) ? board.cards : [];
  return {
    status: board.status,
    cardCount: cards.length,
    draftCardCount: cards.filter((card) => card.status === "draft").length,
    readyCardCount: cards.filter((card) => card.status === "ready").length,
    inProgressCardCount: cards.filter((card) => card.status === "in_progress").length,
    reviewCardCount: cards.filter((card) => card.status === "review").length,
    doneCardCount: cards.filter((card) => card.status === "done").length,
    ticketizedCardCount: cards.filter((card) => card.orchestrationTaskId).length,
    sourceCount: Array.isArray(board.sources) ? board.sources.length : 0,
    questionCount: Array.isArray(board.questions) ? board.questions.length : 0,
    synthesisRunCount: Array.isArray(board.synthesisRuns) ? board.synthesisRuns.length : 0,
  };
}

function releaseGateStatus(observationStatus, gates) {
  if (observationStatus === "failed") return "failed";
  if (observationStatus === "attention") return "attention";
  if (!gates.firstCardObserved || !gates.firstTicketizedTaskObserved) return "attention";
  if (!gates.duplicateRateAcceptable || !gates.noNeedsClarificationWithoutQuestion) return "attention";
  if (!gates.proofOutcomeActionable) return "attention";
  if (!gates.proofActionIntegrityAcceptable) return "attention";
  if (!gates.taskActionProtocolObserved) return "attention";
  if (!gates.visualProofReadableOrActionable) return "attention";
  if (!gates.workerPartialProgressActionable) return "attention";
  if (!gates.runtimeSplitOutcomeActionable) return "attention";
  if (!gates.productRuntimeBudgetClosureObserved) return "attention";
  return "passed";
}

function releaseGateNotes({
  observations,
  gates,
  duplicateMetrics,
  clarificationMetrics,
  proofOutcome,
  proofActionIntegrity,
  visualProof,
  splitOutcome,
  proofScopeWarnings,
  productRuntimeBudgetClosure,
  sourceCoverage,
}) {
  const notes = [...(Array.isArray(observations.loopBreaks) ? observations.loopBreaks : [])];
  if (observations.error && observations.workerRuntimeBudget?.kind === "dogfood_harness_timeout") {
    notes.push(`Dogfood harness timeout stopped observation before a terminal worker result: ${observations.error}`);
  } else if (observations.error && observations.workerRuntimeBudget) notes.push(`Worker runtime budget stopped the run: ${observations.error}`);
  else if (observations.error) notes.push(`Run failed: ${observations.error}`);
  if (!gates.firstCardObserved) notes.push("No time-to-first-card measurement was captured.");
  if (!gates.firstTicketizedTaskObserved) notes.push("No first ticketized task was observed.");
  if (!gates.duplicateRateAcceptable) notes.push(`Duplicate-card rate was ${duplicateMetrics.duplicateCardRate}.`);
  if (!gates.noNeedsClarificationWithoutQuestion) notes.push(`${clarificationMetrics.needsClarificationWithoutQuestions} Needs Clarification cards have no explicit clarification question.`);
  if (!gates.proofOutcomeActionable) notes.push("Worker proof review did not include an actionable missing item or next step for its non-close recommendation.");
  if (!gates.proofActionIntegrityAcceptable) notes.push(`Task-action proof integrity issue: ${proofActionIntegrity.issues[0]}`);
  if (!gates.taskActionProtocolObserved) notes.push("Live worker did not emit a project-board task action; progress/proof was inferred from transcript and workspace artifacts.");
  if (visualProof.required && !visualProof.hasReadableArtifact) {
    notes.push(
      visualProof.handledByProofReview
        ? "Visual proof screenshot was missing or unreadable; PM proof review kept the card open with an actionable next step."
        : "Visual proof was required but no readable nonblank screenshot was captured.",
    );
  }
  if (!gates.workerPartialProgressActionable) notes.push("Worker stopped with partial progress but did not leave an actionable review, retry, split, or blocker note.");
  if (!gates.runtimeSplitOutcomeActionable) {
    notes.push("Runtime-budget follow-up did not leave an actionable split child or resolved parent split decision.");
  }
  if (proofScopeWarnings.warningCount > 0) {
    notes.push(`${proofScopeWarnings.warningCount} proof-scope warning${proofScopeWarnings.warningCount === 1 ? "" : "s"} occurred during board planning.`);
  }
  if (proofScopeWarnings.warnedTicketizedWithoutAcknowledgementCount > 0) {
    notes.push(
      `${proofScopeWarnings.warnedTicketizedWithoutAcknowledgementCount} warned card${proofScopeWarnings.warnedTicketizedWithoutAcknowledgementCount === 1 ? " was" : "s were"} ticketized without durable user/actionable acknowledgement; proof-scope remains advisory for now, but strict profiles should require review before execution.`,
    );
  }
  if (!gates.productRuntimeBudgetClosureObserved) {
    notes.push(
      productRuntimeBudgetClosure?.harnessTimedOutFirst
        ? "Product runtime-budget closure was required, but the dogfood harness timeout fired before the product closed or split the card."
        : "Product runtime-budget closure was required but was not observed.",
    );
  }
  if (proofOutcome.skipped) notes.push("Worker execution was skipped for this focused pass.");
  else if (proofOutcome.partial) notes.push("Worker execution stopped at a bounded runtime with partial proof for review.");
  else if (!proofOutcome.observed) notes.push("No worker proof outcome was observed in this pass.");
  if (sourceCoverage.sourceCount && !sourceCoverage.includedSourceCount) notes.push("Sources were found but none were included in synthesis.");
  return [...new Set(notes)];
}

function actionableProofReviewOutcome(review) {
  if (!review) return undefined;
  if (!review.recommendedAction || review.recommendedAction === "close") return true;
  const missing = Array.isArray(review.missing) ? review.missing.filter((item) => String(item ?? "").trim()) : [];
  if (missing.length === 0) return false;
  if (review.recommendedAction === "ask_user") return missing.some((item) => /\?|\b(ask|question|decide|clarify|confirm|choose|inspect|review)\b/i.test(String(item)));
  if (review.recommendedAction === "retry") return missing.some((item) => /\b(retry|rerun|run|command|test|proof|missing|failed|fix)\b/i.test(String(item)));
  if (review.recommendedAction === "follow_up") return missing.some((item) => /\b(follow[- ]?up|remaining|scope|card|create|split|missing)\b/i.test(String(item)));
  if (review.recommendedAction === "block") return missing.some((item) => /\b(block|blocked|terminal|credential|permission|access|decision|api key|cannot|can't|requires?)\b/i.test(String(item)));
  return true;
}
