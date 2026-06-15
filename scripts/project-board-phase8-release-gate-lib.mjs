export function buildProjectBoardPhase8ReleaseGateReport(input = {}) {
  const provider = input.provider && typeof input.provider === "object" ? input.provider : {};
  const worker = input.worker && typeof input.worker === "object" ? input.worker : {};
  const budget = input.budget && typeof input.budget === "object" ? input.budget : {};
  const pmReviewProviderFixtures = input.pmReviewProviderFixtures && typeof input.pmReviewProviderFixtures === "object" ? input.pmReviewProviderFixtures : undefined;
  const pmReviewUiVariants = input.pmReviewUiVariants && typeof input.pmReviewUiVariants === "object" ? input.pmReviewUiVariants : undefined;
  const handoff = input.handoff && typeof input.handoff === "object" ? input.handoff : {};
  const pauseResume = input.pauseResume && typeof input.pauseResume === "object" ? input.pauseResume : undefined;
  const pauseResumeUi = input.pauseResumeUi && typeof input.pauseResumeUi === "object" ? input.pauseResumeUi : undefined;
  const startFreshUi = input.startFreshUi && typeof input.startFreshUi === "object" ? input.startFreshUi : undefined;
  const pmReviewUi = input.pmReviewUi && typeof input.pmReviewUi === "object" ? input.pmReviewUi : undefined;
  const sourceClassificationUi =
    input.sourceClassificationUi && typeof input.sourceClassificationUi === "object" ? input.sourceClassificationUi : undefined;
  const directHelperRetry =
    input.directHelperRetry && typeof input.directHelperRetry === "object" ? input.directHelperRetry : undefined;
  const providerSummary = provider.summary && typeof provider.summary === "object" ? provider.summary : {};
  const workerObservations = worker.observations && typeof worker.observations === "object" ? worker.observations : {};
  const workerGates = worker.gates && typeof worker.gates === "object" ? worker.gates : {};
  const handoffObservations = handoff.observations && typeof handoff.observations === "object" ? handoff.observations : {};
  const pauseResumeObservations = pauseResume?.observations && typeof pauseResume.observations === "object" ? pauseResume.observations : {};
  const skipProviderWorker = input.skipProviderWorker === true;
  const providerCheck = skipProviderWorker ? skippedGateCheck("Provider matrix skipped for focused UI-only release gate.") : providerGateCheck(provider);
  const workerCheck = skipProviderWorker ? skippedGateCheck("Worker matrix skipped for focused UI-only release gate.") : workerGateCheck(worker);
  const budgetCheck = budgetGateCheck(budget);
  const pmReviewProviderFixturesCheck = pmReviewProviderFixturesGateCheck(pmReviewProviderFixtures, {
    required: input.requirePmReviewProviderFixtures === true,
    requireLive: input.requirePmReviewProviderVariantsLive === true,
  });
  const pmReviewUiVariantsCheck = pmReviewUiVariantsGateCheck(pmReviewUiVariants, {
    required: input.requirePmReviewUiVariants === true,
  });
  const handoffCheck = handoffGateCheck(handoff);
  const pauseResumeCheck = pauseResumeGateCheck(pauseResume, { required: input.requirePauseResumeLive === true });
  const pauseResumeUiCheck = pauseResumeUiGateCheck(pauseResumeUi, { required: input.requirePauseResumeUi === true });
  const startFreshUiCheck = startFreshUiGateCheck(startFreshUi, { required: input.requireStartFreshUi === true });
  const pmReviewUiCheck = pmReviewUiGateCheck(pmReviewUi, {
    required: input.requirePmReviewUi === true,
    requireWork: input.requirePmReviewWork === true,
  });
  const sourceClassificationUiCheck = sourceClassificationUiGateCheck(sourceClassificationUi, {
    required: input.requireSourceClassificationUi === true,
  });
  const directHelperRetryCheck = directHelperRetryGateCheck(directHelperRetry, {
    required: input.requireDirectHelperRetry === true,
  });
  const freshness = releaseArtifactFreshnessCheck({
    provider,
    worker,
    currentSourceRevision: input.currentSourceRevision,
    requireCurrentHead: input.requireCurrentHead === true,
    maxArtifactAgeHours: input.maxArtifactAgeHours,
    skipProviderWorker,
    nowIso: input.completedAt,
  });
  const allChecksPassed =
    providerCheck.passed &&
    workerCheck.passed &&
    budgetCheck.passed &&
    pmReviewProviderFixturesCheck.passed &&
    pmReviewUiVariantsCheck.passed &&
    handoffCheck.passed &&
    pauseResumeCheck.passed &&
    pauseResumeUiCheck.passed &&
    startFreshUiCheck.passed &&
    pmReviewUiCheck.passed &&
    sourceClassificationUiCheck.passed &&
    directHelperRetryCheck.passed &&
    freshness.check.passed;
  const report = {
    version: 1,
    status: allChecksPassed ? "passed" : "attention",
    generatedAt: input.completedAt ?? new Date().toISOString(),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    providerReportPath: input.providerReportPath,
    workerReportPath: input.workerReportPath,
    budgetReportPath: input.budgetReportPath,
    pmReviewProviderFixturesReportPath: input.pmReviewProviderFixturesReportPath,
    pmReviewUiVariantsReportPath: input.pmReviewUiVariantsReportPath,
    handoffReportPath: input.handoffReportPath,
    pauseResumeReportPath: input.pauseResumeReportPath,
    pauseResumeUiReportPath: input.pauseResumeUiReportPath,
    startFreshUiReportPath: input.startFreshUiReportPath,
    pmReviewUiReportPath: input.pmReviewUiReportPath,
    sourceClassificationUiReportPath: input.sourceClassificationUiReportPath,
    directHelperRetryReportPath: input.directHelperRetryReportPath,
    focus:
      "Project-board release gate: provider planning repeatability, prompt-budget regression guard, app-boundary worker execution, and objective-card Git handoff.",
    provider: {
      status: provider.status ?? (skipProviderWorker ? "not_required" : undefined),
      model: provider.model,
      reasoning: provider.reasoning,
      generatedAt: provider.generatedAt,
      sourceRevision: provider.sourceRevision,
      scenarioCount: providerSummary.scenarioCount,
      totalDurationMs: providerSummary.totalDurationMs,
      totalCards: providerSummary.totalCards,
      totalProofReadyCards: providerSummary.totalProofReadyCards,
      duplicateTitleCount: providerSummary.duplicateTitleCount,
      warningCodes: providerSummary.warningCodes ?? [],
      errorCodes: providerSummary.errorCodes ?? [],
      providerTimeoutObserved: providerSummary.providerTimeoutObserved,
      scenarios: Array.isArray(provider.scenarios)
        ? provider.scenarios.map((scenario) => ({
            name: scenario.name,
            status: scenario.status,
            durationMs: scenario.durationMs,
            cardCount: scenario.cardCount,
            proofReadyCardCount: scenario.proofReadyCardCount,
            duplicateTitleCount: scenario.duplicateTitleCount,
            clarificationQuestionCount: scenario.clarificationQuestionCount,
            warningCodes: scenario.warningCodes ?? [],
            errorCodes: scenario.errorCodes ?? [],
            providerTimeoutObserved: scenario.providerTimeoutObserved,
          }))
        : [],
      check: providerCheck,
    },
    worker: {
      status: worker.status ?? (skipProviderWorker ? "not_required" : undefined),
      generatedAt: worker.generatedAt,
      sourceRevision: worker.sourceRevision,
      dogfoodExitCode: worker.dogfoodExitCode,
      dogfoodOutputPath: worker.dogfoodOutputPath,
      releaseGateStatus: workerObservations.releaseGateStatus,
      runStatus: workerObservations.runStatus,
      taskState: workerObservations.taskState,
      finalCardStatus: workerObservations.finalCardStatus,
      ticketizedCardTitle: workerObservations.ticketizedCardTitle,
      proofReviewStatus: workerObservations.proofReviewStatus,
      proofRecommendedAction: workerObservations.proofRecommendedAction,
      proofEvidenceQuality: workerObservations.proofEvidenceQuality,
      proofConfidence: workerObservations.proofConfidence,
      taskActionProtocolObserved: workerObservations.taskActionProtocolObserved,
      taskActionCount: workerObservations.taskActionCount,
      taskActionCountsByAction: workerObservations.taskActionCountsByAction,
      proofActionIntegrityIssueCount: workerObservations.proofActionIntegrityIssueCount,
      meaningfulChangedPathCount: workerObservations.meaningfulChangedPathCount,
      runtimeBudgetExceeded: workerObservations.runtimeBudgetExceeded,
      runtimeBudgetMaxMs: workerObservations.runtimeBudgetMaxMs,
      runtimeBudgetElapsedMs: workerObservations.runtimeBudgetElapsedMs,
      harnessTimedOutFirst: workerObservations.harnessTimedOutFirst,
      productRuntimeBudgetClosureObserved: workerObservations.productRuntimeBudgetClosureObserved,
      runtimeBudgetSplitCount: workerObservations.runtimeBudgetSplitCount,
      runtimeSplitOutcomeActionable: workerObservations.runtimeSplitOutcomeActionable,
      splitDecisionObserved: workerObservations.splitDecisionObserved,
      splitDecisionAction: workerObservations.splitDecisionAction,
      splitDecisionAfterStatus: workerObservations.splitDecisionAfterStatus,
      followUpCardCount: workerObservations.followUpCardCount,
      providerTimeoutObserved: workerObservations.providerTimeoutObserved,
      notes: workerObservations.notes ?? [],
      gates: workerGates,
      check: workerCheck,
    },
    budget: {
      status: budgetCheck.passed ? "passed" : "attention",
      generatedAt: budget.generatedAt,
      purpose: budget.purpose,
      scenarioCount: budgetCheck.scenarioCount,
      requiredScenarioNames: budgetCheck.requiredScenarioNames,
      overBudgetBeforeCompactionObserved: budgetCheck.overBudgetBeforeCompactionObserved,
      compactionObserved: budgetCheck.compactionObserved,
      cacheReplayObserved: budgetCheck.cacheReplayObserved,
      scenarios: budgetCheck.scenarios,
      check: budgetCheck,
    },
    pmReviewProviderFixtures: {
      status: pmReviewProviderFixtures?.status ?? "not_run",
      generatedAt: pmReviewProviderFixtures?.generatedAt,
      required: pmReviewProviderFixturesCheck.required,
      deterministicStatus: pmReviewProviderFixtures?.deterministic?.status,
      deterministicScenarioCount: pmReviewProviderFixturesCheck.deterministicScenarioCount,
      deterministicScenarioNames: pmReviewProviderFixturesCheck.deterministicScenarioNames,
      constrainedReadiness: pmReviewProviderFixturesCheck.coverage.constrainedReadiness,
      sourceConflict: pmReviewProviderFixturesCheck.coverage.sourceConflict,
      ignoredSourceExclusion: pmReviewProviderFixturesCheck.coverage.ignoredSourceExclusion,
      recommendationScope: pmReviewProviderFixturesCheck.coverage.recommendationScope,
      zeroCardContract: pmReviewProviderFixturesCheck.coverage.zeroCardContract,
      activationMetadata: pmReviewProviderFixturesCheck.coverage.activationMetadata,
      liveStatus: pmReviewProviderFixtures?.liveVariants?.status ?? "not_run",
      liveObserved: pmReviewProviderFixturesCheck.liveObserved,
      liveRequired: pmReviewProviderFixturesCheck.liveRequired,
      liveScenarioNames: pmReviewProviderFixturesCheck.liveScenarioNames,
      check: pmReviewProviderFixturesCheck,
    },
    handoff: {
      status: handoff.status,
      generatedAt: handoff.generatedAt,
      durationMs: handoff.durationMs,
      command: handoff.command,
      exitCode: handoff.exitCode,
      outputPath: handoff.outputPath,
      objectiveGitHandoffObserved: handoffObservations.objectiveGitHandoffObserved,
      sourcePathLineageObserved: handoffObservations.sourcePathLineageObserved,
      cloneContinuationObserved: handoffObservations.cloneContinuationObserved,
      firstCloneApplyObserved: handoffObservations.firstCloneApplyObserved,
      check: handoffCheck,
    },
    pauseResume: {
      status: pauseResume?.status ?? "not_run",
      required: input.requirePauseResumeLive === true,
      observed: pauseResumeCheck.observed,
      generatedAt: pauseResume?.generatedAt,
      durationMs: pauseResume?.durationMs,
      model: pauseResume?.model,
      fixture: pauseResume?.fixture,
      pauseObserved: pauseResumeObservations.pauseObserved,
      pauseCheckpointObserved: pauseResumeObservations.pauseCheckpointObserved,
      resumeObserved: pauseResumeObservations.resumeObserved,
      continuationPromptObserved: pauseResumeObservations.continuationPromptObserved,
      noDuplicateCardsObserved: pauseResumeObservations.noDuplicateCardsObserved,
      pausedCardCount: pauseResumeObservations.pausedCardCount,
      resumedCardCount: pauseResumeObservations.resumedCardCount,
      renderedCardDuplicateFilterCount: pauseResumeObservations.renderedCardDuplicateFilterCount,
      check: pauseResumeCheck,
    },
    pauseResumeUi: {
      status: pauseResumeUi?.status ?? "not_run",
      required: input.requirePauseResumeUi === true,
      observed: pauseResumeUiCheck.observed,
      generatedAt: pauseResumeUi?.completedAt ?? pauseResumeUi?.generatedAt,
      runRoot: pauseResumeUi?.runRoot,
      dogfoodReleaseGateStatus: pauseResumeUi?.releaseGate?.status,
      pauseResumeDogfoodMode: pauseResumeUi?.pauseResumeDogfoodMode,
      stepName: pauseResumeUiCheck.step?.name,
      pausedRunStatus: pauseResumeUiCheck.step?.pausedRunStatus,
      resumedRunStatus: pauseResumeUiCheck.step?.resumedRunStatus,
      pausedRunId: pauseResumeUiCheck.step?.pausedRunId,
      resumedRunId: pauseResumeUiCheck.step?.resumedRunId,
      retryOfRunId: pauseResumeUiCheck.step?.retryOfRunId,
      pausedCardCount: pauseResumeUiCheck.step?.pausedCardCount,
      resumedCardCount: pauseResumeUiCheck.step?.resumedCardCount,
      duplicateCardCount: pauseResumeUiCheck.step?.duplicateCardCount,
      duplicateCardRate: pauseResumeUiCheck.step?.duplicateCardRate,
      screenshotCount: pauseResumeUiCheck.screenshotCount,
      screenshotPaths: pauseResumeUiCheck.screenshotPaths,
      check: pauseResumeUiCheck,
    },
    startFreshUi: {
      status: startFreshUi?.status ?? "not_run",
      required: input.requireStartFreshUi === true,
      observed: startFreshUiCheck.observed,
      generatedAt: startFreshUi?.completedAt ?? startFreshUi?.generatedAt,
      runRoot: startFreshUi?.runRoot,
      dogfoodReleaseGateStatus: startFreshUi?.releaseGate?.status,
      startFreshDogfoodMode: startFreshUi?.startFreshDogfoodMode,
      stepName: startFreshUiCheck.step?.name,
      abandonedRunStatus: startFreshUiCheck.step?.abandonedRunStatus,
      freshRunStatus: startFreshUiCheck.step?.freshRunStatus,
      freshRunStatusBeforeCleanup: startFreshUiCheck.step?.freshRunStatusBeforeCleanup,
      abandonedRunId: startFreshUiCheck.step?.abandonedRunId,
      freshRunId: startFreshUiCheck.step?.freshRunId,
      retryOfRunId: startFreshUiCheck.step?.retryOfRunId,
      abandonedCheckpointCardCount: startFreshUiCheck.step?.abandonedCheckpointCardCount,
      freshCardCount: startFreshUiCheck.step?.freshCardCount,
      duplicateCardCount: startFreshUiCheck.step?.duplicateCardCount,
      duplicateCardRate: startFreshUiCheck.step?.duplicateCardRate,
      loadedPreviousRecords: startFreshUiCheck.step?.loadedPreviousRecords,
      abandonedProgressiveRecordCount: startFreshUiCheck.step?.abandonedProgressiveRecordCount,
      freshProgressiveRecordCount: startFreshUiCheck.step?.freshProgressiveRecordCount,
      overlappingCardIdCount: startFreshUiCheck.step?.overlappingCardIdCount,
      overlappingSourceIdCount: startFreshUiCheck.step?.overlappingSourceIdCount,
      supersededHistoryVisible: startFreshUiCheck.step?.supersededHistoryVisible,
      supersededHistoryIncludesAbandonedCard: startFreshUiCheck.step?.supersededHistoryIncludesAbandonedCard,
      screenshotCount: startFreshUiCheck.screenshotCount,
      screenshotPaths: startFreshUiCheck.screenshotPaths,
      check: startFreshUiCheck,
    },
    pmReviewUi: {
      status: pmReviewUi?.status ?? "not_run",
      required: input.requirePmReviewUi === true,
      observed: pmReviewUiCheck.observed,
      generatedAt: pmReviewUi?.completedAt ?? pmReviewUi?.generatedAt,
      runRoot: pmReviewUi?.runRoot,
      dogfoodReleaseGateStatus: pmReviewUi?.releaseGate?.status,
      pmReviewActivationDogfoodMode: pmReviewUi?.pmReviewActivationDogfoodMode,
      stepName: pmReviewUiCheck.step?.name,
      reviewRunStatus: pmReviewUiCheck.step?.reviewRunStatus,
      activationRunStatus: pmReviewUiCheck.step?.activationRunStatus,
      zeroCardReportObserved: pmReviewUiCheck.step?.zeroCardReportObserved,
      answerUpdateObserved: pmReviewUiCheck.step?.answerUpdateObserved,
      reviewQuestionCount: pmReviewUiCheck.step?.reviewQuestionCount,
      answeredQuestionCount: pmReviewUiCheck.step?.answeredQuestionCount,
      sourceConfidence: pmReviewUiCheck.step?.sourceConfidence,
      sourceConfidenceNoteCount: pmReviewUiCheck.step?.sourceConfidenceNoteCount,
      gitState: pmReviewUiCheck.step?.gitState,
      gitStateNoteCount: pmReviewUiCheck.step?.gitStateNoteCount,
      readiness: pmReviewUiCheck.step?.readiness,
      blockingQuestionCount: pmReviewUiCheck.step?.blockingQuestionCount,
      riskCount: pmReviewUiCheck.step?.riskCount,
      sourceConflictCount: pmReviewUiCheck.step?.sourceConflictCount,
      sourceAuthorityNoteCount: pmReviewUiCheck.step?.sourceAuthorityNoteCount,
      cardGenerationConstraintCount: pmReviewUiCheck.step?.cardGenerationConstraintCount,
      recommendedActivationScopePresent: pmReviewUiCheck.step?.recommendedActivationScopePresent,
      reportUiCoverage: pmReviewUiCheck.step?.reportUiCoverage,
      activationSurface: pmReviewUiCheck.step?.activationSurface,
      generatedActivationCardCount: pmReviewUiCheck.step?.generatedActivationCardCount,
      generatedProposalCardCount: pmReviewUiCheck.step?.generatedProposalCardCount,
      generatedDraftCardCount: pmReviewUiCheck.step?.generatedDraftCardCount,
      duplicateCardCount: pmReviewUiCheck.step?.duplicateCardCount,
      duplicateCardRate: pmReviewUiCheck.step?.duplicateCardRate,
      workRequired: pmReviewUiCheck.requiredWork,
      workObserved: pmReviewUiCheck.workObserved,
      workPassed: pmReviewUiCheck.workPassed,
      workCardId: pmReviewUiCheck.workStep?.cardId,
      workRunStatus: pmReviewUiCheck.workStep?.runStatus,
      workTaskState: pmReviewUiCheck.workStep?.taskState,
      workProofReviewStatus: pmReviewUiCheck.workStep?.proofReview?.status,
      workProofRecommendedAction: pmReviewUiCheck.workStep?.proofReview?.recommendedAction,
      workMeaningfulChangedPathCount: pmReviewUiCheck.workStep?.meaningfulChangedPathCount,
      workTaskActionCount: pmReviewUiCheck.workStep?.taskActions?.count,
      workTaskActionCountsByAction: pmReviewUiCheck.workStep?.taskActions?.countsByAction,
      workTaskActionProtocolSatisfied: pmReviewUiCheck.workStep?.taskActions?.protocolSatisfied,
      workTaskActionProtocolMissing: pmReviewUiCheck.workStep?.taskActions?.protocolMissing,
      workTaskActionTerminalActionCount: pmReviewUiCheck.workStep?.taskActions?.terminalActionCount,
      workSplitOutcomeStatus: pmReviewUiCheck.workStep?.splitOutcome?.status,
      workFollowUpCardCount: pmReviewUiCheck.workStep?.followUpCardCount,
      screenshotCount: pmReviewUiCheck.screenshotCount,
      screenshotPaths: pmReviewUiCheck.screenshotPaths,
      check: pmReviewUiCheck,
    },
    sourceClassificationUi: {
      status: sourceClassificationUi?.status ?? "not_run",
      required: input.requireSourceClassificationUi === true,
      observed: sourceClassificationUiCheck.observed,
      generatedAt: sourceClassificationUi?.completedAt ?? sourceClassificationUi?.generatedAt,
      runRoot: sourceClassificationUi?.runRoot,
      dogfoodReleaseGateStatus: sourceClassificationUi?.releaseGate?.status,
      sourceClassificationUiDogfoodMode: sourceClassificationUi?.sourceClassificationUiDogfoodMode,
      stepName: sourceClassificationUiCheck.step?.name,
      targetPath: sourceClassificationUiCheck.step?.targetPath,
      originalKind: sourceClassificationUiCheck.step?.originalKind,
      ignoredKind: sourceClassificationUiCheck.step?.ignoredKind,
      ignoredClassifiedBy: sourceClassificationUiCheck.step?.ignoredClassifiedBy,
      ignoredIncludeInSynthesis: sourceClassificationUiCheck.step?.ignoredIncludeInSynthesis,
      ignoredVisibleInReview: sourceClassificationUiCheck.step?.ignoredVisibleInReview,
      ignoredFilterVisible: sourceClassificationUiCheck.step?.ignoredFilterVisible,
      ignoredDetailExplainsExclusion: sourceClassificationUiCheck.step?.ignoredDetailExplainsExclusion,
      ignoredElaborateDisabled: sourceClassificationUiCheck.step?.ignoredElaborateDisabled,
      refreshPreservedIgnored: sourceClassificationUiCheck.step?.refreshPreservedIgnored,
      refreshTitleIncludesPreservation: sourceClassificationUiCheck.step?.refreshTitleIncludesPreservation,
      refreshCopyIncludesPreservation: sourceClassificationUiCheck.step?.refreshCopyIncludesPreservation,
      reclassifiedKind: sourceClassificationUiCheck.step?.reclassifiedKind,
      reclassifiedIncludeInSynthesis: sourceClassificationUiCheck.step?.reclassifiedIncludeInSynthesis,
      reclassifiedElaborateEnabled: sourceClassificationUiCheck.step?.reclassifiedElaborateEnabled,
      includedDetailExplainsEligibility: sourceClassificationUiCheck.step?.includedDetailExplainsEligibility,
      sourceRefreshSettledBeforePmReview: sourceClassificationUiCheck.step?.sourceRefreshSettledBeforePmReview,
      latestSourceRunStatusBeforePmReview: sourceClassificationUiCheck.step?.latestSourceRunStatusBeforePmReview,
      latestSourceRunStageBeforePmReview: sourceClassificationUiCheck.step?.latestSourceRunStageBeforePmReview,
      activationSurface: sourceClassificationUiCheck.pmReviewStep?.activationSurface,
      generatedActivationCardCount: sourceClassificationUiCheck.pmReviewStep?.generatedActivationCardCount,
      generatedDraftCardCount: sourceClassificationUiCheck.pmReviewStep?.generatedDraftCardCount,
      duplicateCardCount: sourceClassificationUiCheck.pmReviewStep?.duplicateCardCount,
      duplicateCardRate: sourceClassificationUiCheck.pmReviewStep?.duplicateCardRate,
      pmReviewTransientRetryCount: sourceClassificationUiCheck.pmReviewStep?.transientRetryCount,
      screenshotCount: sourceClassificationUiCheck.screenshotCount,
      screenshotPaths: sourceClassificationUiCheck.screenshotPaths,
      check: sourceClassificationUiCheck,
    },
    directHelperRetry: {
      status: directHelperRetry?.status ?? "not_run",
      required: input.requireDirectHelperRetry === true,
      observed: directHelperRetryCheck.observed,
      generatedAt: directHelperRetry?.generatedAt,
      scenarioCount: directHelperRetryCheck.scenarioCount,
      targets: directHelperRetryCheck.targets,
      sourceClassificationComplete: directHelperRetryCheck.sourceClassificationComplete,
      charterSummaryComplete: directHelperRetryCheck.charterSummaryComplete,
      proofJudgmentComplete: directHelperRetryCheck.proofJudgmentComplete,
      sourceClassification: directHelperRetryCheck.sourceClassification,
      charterSummary: directHelperRetryCheck.charterSummary,
      proofJudgment: directHelperRetryCheck.proofJudgment,
      check: directHelperRetryCheck,
    },
    pmReviewUiVariants: {
      status: pmReviewUiVariants?.status ?? "not_run",
      required: input.requirePmReviewUiVariants === true,
      observed: pmReviewUiVariantsCheck.observed,
      generatedAt: pmReviewUiVariants?.completedAt ?? pmReviewUiVariants?.generatedAt,
      deterministicStatus: pmReviewUiVariantsCheck.deterministicStatus,
      deterministicScenarioCount: pmReviewUiVariantsCheck.deterministicScenarioCount,
      deterministicScenarioNames: pmReviewUiVariantsCheck.deterministicScenarioNames,
      constrainedReadiness: pmReviewUiVariantsCheck.coverage.constrainedReadiness,
      sourceConflict: pmReviewUiVariantsCheck.coverage.sourceConflict,
      ignoredSourceExclusion: pmReviewUiVariantsCheck.coverage.ignoredSourceExclusion,
      recommendationScope: pmReviewUiVariantsCheck.coverage.recommendationScope,
      rendererSections: pmReviewUiVariantsCheck.coverage.rendererSections,
      recommendationBanner: pmReviewUiVariantsCheck.coverage.recommendationBanner,
      check: pmReviewUiVariantsCheck,
    },
    freshness,
    releaseDecision: {
      phase8InstrumentationComplete: allChecksPassed,
      providerWorkerSkipped: skipProviderWorker,
      objectiveHandoffComplete: handoffCheck.passed,
      pauseResumeLiveComplete: pauseResumeCheck.observed && pauseResumeCheck.passed,
      pauseResumeUiComplete: pauseResumeUiCheck.observed && pauseResumeUiCheck.passed,
      startFreshUiComplete: startFreshUiCheck.observed && startFreshUiCheck.passed,
      pmReviewUiComplete: pmReviewUiCheck.observed && pmReviewUiCheck.passed,
      pmReviewWorkComplete: pmReviewUiCheck.workObserved && pmReviewUiCheck.workPassed,
      pmReviewProviderFixturesComplete: pmReviewProviderFixturesCheck.observed && pmReviewProviderFixturesCheck.passed,
      pmReviewProviderLiveVariantsComplete: pmReviewProviderFixturesCheck.liveObserved && pmReviewProviderFixturesCheck.livePassed,
      pmReviewUiVariantsComplete: pmReviewUiVariantsCheck.observed && pmReviewUiVariantsCheck.passed,
      sourceClassificationUiComplete: sourceClassificationUiCheck.observed && sourceClassificationUiCheck.passed,
      directHelperRetryComplete: directHelperRetryCheck.observed && directHelperRetryCheck.passed,
      advisoryProviderWarnings: providerSummary.warningCodes ?? [],
      advisoryIssues: [
        ...(providerCheck.advisoryIssues ?? []),
        ...(workerCheck.advisoryIssues ?? []),
        ...freshness.check.advisoryIssues,
        ...pmReviewProviderFixturesCheck.advisoryIssues,
        ...pmReviewUiVariantsCheck.advisoryIssues,
        ...pauseResumeCheck.advisoryIssues,
        ...pauseResumeUiCheck.advisoryIssues,
        ...startFreshUiCheck.advisoryIssues,
        ...pmReviewUiCheck.advisoryIssues,
        ...sourceClassificationUiCheck.advisoryIssues,
        ...directHelperRetryCheck.advisoryIssues,
      ],
      blockingIssues: [
        ...providerCheck.issues,
        ...workerCheck.issues,
        ...budgetCheck.issues,
        ...pmReviewProviderFixturesCheck.issues,
        ...pmReviewUiVariantsCheck.issues,
        ...handoffCheck.issues,
        ...pauseResumeCheck.issues,
        ...pauseResumeUiCheck.issues,
        ...startFreshUiCheck.issues,
        ...pmReviewUiCheck.issues,
        ...sourceClassificationUiCheck.issues,
        ...directHelperRetryCheck.issues,
        ...freshness.check.issues,
      ],
      nextSlice:
        allChecksPassed &&
        directHelperRetryCheck.required &&
        directHelperRetryCheck.observed &&
        directHelperRetryCheck.passed
          ? "Keep the aggressive-retry direct-helper GMI lane green as strict outage-period release proof, and use any future source, charter, or proof-judgment failures to drive the next hardening slice."
          : allChecksPassed &&
        sourceClassificationUiCheck.required &&
        sourceClassificationUiCheck.observed &&
        sourceClassificationUiCheck.passed &&
        !directHelperRetryCheck.observed
          ? "Run the opt-in direct-helper retry GMI UI smoke with --run-direct-helper-retry-live --require-direct-helper-retry, then promote source-classification, charter-summary, and proof-judgment retry evidence once all three stay green."
          : pmReviewUiCheck.requiredWork &&
        pmReviewUiCheck.workObserved &&
        pmReviewUiCheck.workStep?.taskActions?.protocolSatisfied === false
          ? "Make PM Review generated-card workers reliably emit terminal task_report_proof/task_complete/task_block/task_create_followup/task_report_handoff actions, then make the focused work lane's terminal protocol check strict."
          : allChecksPassed &&
        sourceClassificationUiCheck.required &&
        sourceClassificationUiCheck.observed &&
        sourceClassificationUiCheck.passed
          ? "Keep the strict focused UI sweep green with PM Review terminal task-action enforcement, then move to the next recoverability slice outside focused UI hardening."
          : allChecksPassed &&
        pauseResumeUiCheck.required &&
        startFreshUiCheck.required &&
        pmReviewUiCheck.requiredWork &&
        pmReviewUiCheck.workObserved &&
        pmReviewProviderFixturesCheck.liveObserved &&
        pmReviewProviderFixturesCheck.livePassed &&
        pmReviewUiVariantsCheck.observed &&
        pmReviewUiVariantsCheck.passed
          ? "Run the focused source-classification UI dogfood with --run-source-classification-ui-live --require-source-classification-ui, then promote ignored-source refresh/reclassification evidence once it stays green."
          : allChecksPassed &&
        pauseResumeUiCheck.required &&
        startFreshUiCheck.required &&
        pmReviewUiCheck.requiredWork &&
        pmReviewUiCheck.workObserved &&
        pmReviewProviderFixturesCheck.liveObserved &&
        pmReviewProviderFixturesCheck.livePassed
          ? "Add focused in-app PM Review UI variant dogfood for constrained-readiness, source-conflict, ignored-source, and recommendation-scope reports."
          : allChecksPassed &&
        pauseResumeUiCheck.required &&
        startFreshUiCheck.required &&
        pmReviewUiCheck.requiredWork &&
        pmReviewUiCheck.workObserved &&
        pmReviewProviderFixturesCheck.observed &&
        pmReviewProviderFixturesCheck.passed
          ? "Run the opt-in live PM Review provider variant gate with --run-pm-review-provider-variants-live --require-pm-review-provider-variants-live."
          : allChecksPassed &&
        pauseResumeUiCheck.required &&
        startFreshUiCheck.required &&
        pmReviewUiCheck.requiredWork &&
        pmReviewUiCheck.workObserved
          ? "Promote the PM Review provider fixture matrix into release-gate reporting, then add opt-in live variant coverage for constrained, conflict, ignored-source, and recommendation-scope reports."
          : allChecksPassed && pmReviewUiCheck.requiredWork && pmReviewUiCheck.workObserved
          ? "Run the full focused UI live sweep with strict PM Review terminal task-action enforcement, then move to the next recoverability slice outside focused UI hardening once it stays green."
          : allChecksPassed && pmReviewUiCheck.required && pmReviewUiCheck.observed
          ? "Run the PM Review generated-card work dogfood with --run-pm-review-work-live --require-pm-review-work, then promote that evidence once the ticketize-and-work path stays green."
          : allChecksPassed && pauseResumeUiCheck.required && startFreshUiCheck.required && pauseResumeUiCheck.observed && startFreshUiCheck.observed
          ? "Run focused PM Review UI dogfood with --run-pm-review-ui-live, then require it once the lightweight report-to-draft-board activation path stays green."
          : allChecksPassed && startFreshUiCheck.observed
          ? "Promote the focused pause/resume and Start Fresh UI evidence into strict release sweeps after the Start Fresh supersede semantics keep passing live visual dogfood."
          : allChecksPassed && pauseResumeUiCheck.observed
            ? "Run the focused Start Fresh UI dogfood and feed its abandoned-checkpoint, fresh Draft Inbox, and Superseded history evidence into --run-start-fresh-ui-live."
          : allChecksPassed && pauseResumeCheck.observed
            ? "Run the focused in-app Ambient Desktop pause/resume dogfood and feed its UI evidence into --run-pause-resume-ui-live."
            : allChecksPassed
              ? "Run the opt-in live Pi pause/resume smoke with --run-pause-resume-live, then decide whether the same gate should become required for strict project-board release sweeps."
              : "Fix the blocking release-gate issue(s), then rerun the failed matrix or dogfood before treating this project-board slice as complete.",
    },
  };
  return report;
}

export function phase8ReleaseGatePassed(report) {
  return report?.status === "passed" && report?.releaseDecision?.phase8InstrumentationComplete === true;
}

function skippedGateCheck(message) {
  return {
    passed: true,
    skipped: true,
    issues: [],
    advisoryIssues: [message],
  };
}

function providerGateCheck(provider) {
  const summary = provider.summary && typeof provider.summary === "object" ? provider.summary : {};
  const scenarios = Array.isArray(provider.scenarios) ? provider.scenarios : [];
  const issues = [];
  if (provider.status !== "passed_with_worker_pass_skipped" && provider.status !== "passed") {
    issues.push(`Provider matrix status was ${provider.status ?? "missing"}.`);
  }
  if (scenarios.length === 0 || scenarios.some((scenario) => scenario.status !== "passed")) {
    issues.push("Provider matrix did not report every scenario as passed.");
  }
  if (!Number.isFinite(summary.totalCards) || summary.totalCards <= 0) {
    issues.push("Provider matrix did not produce cards.");
  }
  if (summary.totalProofReadyCards !== summary.totalCards) {
    issues.push(`Provider proof-ready count ${summary.totalProofReadyCards ?? "missing"} did not match card count ${summary.totalCards ?? "missing"}.`);
  }
  if ((summary.duplicateTitleCount ?? 0) !== 0) {
    issues.push(`Provider matrix reported ${summary.duplicateTitleCount} duplicate title(s).`);
  }
  if (summary.providerTimeoutObserved === true) {
    issues.push("Provider matrix observed a provider timeout.");
  }
  if (Array.isArray(summary.errorCodes) && summary.errorCodes.length > 0) {
    issues.push(`Provider matrix reported error code(s): ${summary.errorCodes.join(", ")}.`);
  }
  return {
    passed: issues.length === 0,
    issues,
    advisoryWarningCodes: summary.warningCodes ?? [],
  };
}

function workerGateCheck(worker) {
  const observations = worker.observations && typeof worker.observations === "object" ? worker.observations : {};
  const gates = worker.gates && typeof worker.gates === "object" ? worker.gates : {};
  const issues = [];
  if (worker.status !== "passed") issues.push(`Worker matrix status was ${worker.status ?? "missing"}.`);
  if (worker.dogfoodExitCode !== 0) issues.push(`Worker dogfood exit code was ${worker.dogfoodExitCode ?? "missing"}.`);
  if (observations.releaseGateStatus !== "passed") issues.push(`Worker dogfood release gate was ${observations.releaseGateStatus ?? "missing"}.`);
  for (const [key, expected] of Object.entries({
    firstCardObserved: true,
    firstTicketizedTaskObserved: true,
    proofOutcomeObserved: true,
    proofOutcomeActionable: true,
    proofActionIntegrityAcceptable: true,
    taskActionProtocolObserved: true,
    runtimeSplitOutcomeActionable: true,
    productRuntimeBudgetClosureObserved: true,
    workerPartialProgressActionable: true,
  })) {
    if (gates[key] !== expected) issues.push(`Worker gate ${key} was ${String(gates[key])}.`);
  }
  if (observations.proofActionIntegrityIssueCount !== 0) {
    issues.push(`Worker proof-action integrity issue count was ${observations.proofActionIntegrityIssueCount ?? "missing"}.`);
  }
  if (observations.providerTimeoutObserved === true) issues.push("Worker matrix observed a provider timeout.");
  if (observations.harnessTimedOutFirst === true) issues.push("Worker harness timed out before product runtime closure.");
  if (observations.productRuntimeBudgetClosureObserved !== true) issues.push("Worker product runtime-budget closure was not observed.");
  if (observations.taskActionProtocolObserved !== true) issues.push("Worker task-action protocol was not observed.");
  if (!Number.isFinite(observations.runtimeBudgetSplitCount) || observations.runtimeBudgetSplitCount <= 0) {
    issues.push("Worker matrix did not observe a runtime-budget split.");
  }
  if (observations.runtimeSplitOutcomeActionable !== true) issues.push("Worker runtime split outcome was not actionable.");
  return {
    passed: issues.length === 0,
    issues,
  };
}

function budgetGateCheck(budget) {
  const scenarios = Array.isArray(budget.scenarios) ? budget.scenarios : [];
  const requiredScenarioNames = ["small", "medium", "large-ledger", "large-ledger-cache-replay"];
  const byName = new Map(scenarios.map((scenario) => [scenario?.name, scenario]));
  const issues = [];
  const normalizedScenarios = scenarios.map((scenario) => ({
    name: scenario?.name,
    promptBudgetStatus: scenario?.promptBudgetStatus,
    rawPromptBudgetStatus: scenario?.rawPromptBudgetStatus,
    promptBudgetWarningCount: scenario?.promptBudgetWarningCount,
    plannerLedgerCompactionCount: scenario?.plannerLedgerCompactionCount,
    plannerLedgerCompactionCacheHitCount: scenario?.plannerLedgerCompactionCacheHitCount,
    compactionPromptCount: scenario?.compactionPromptCount,
    plannerPromptCount: scenario?.plannerPromptCount,
    maxPromptBudgetUtilization: scenario?.maxPromptBudgetUtilization,
    cardCount: scenario?.cardCount,
  }));

  for (const name of requiredScenarioNames) {
    if (!byName.has(name)) issues.push(`Budget gate did not report required scenario ${name}.`);
  }

  for (const name of ["small", "medium"]) {
    const scenario = byName.get(name);
    if (!scenario) continue;
    if (scenario.promptBudgetStatus !== "within_budget") {
      issues.push(`Budget gate scenario ${name} prompt status was ${scenario.promptBudgetStatus ?? "missing"}.`);
    }
    if ((scenario.promptBudgetWarningCount ?? 0) !== 0) {
      issues.push(`Budget gate scenario ${name} reported ${scenario.promptBudgetWarningCount} prompt-budget warning(s).`);
    }
    if ((scenario.plannerLedgerCompactionCount ?? 0) !== 0) {
      issues.push(`Budget gate scenario ${name} unexpectedly compacted ${scenario.plannerLedgerCompactionCount} ledger(s).`);
    }
    if (!Number.isFinite(scenario.cardCount) || scenario.cardCount <= 0) {
      issues.push(`Budget gate scenario ${name} did not produce a candidate card.`);
    }
  }

  const large = byName.get("large-ledger");
  if (large) {
    if (!["summarization_recommended", "soft_prompt_budget_exceeded", "context_budget_exceeded"].includes(large.rawPromptBudgetStatus)) {
      issues.push(`Budget gate large-ledger raw prompt status was ${large.rawPromptBudgetStatus ?? "missing"}.`);
    }
    if (large.promptBudgetStatus !== "within_budget") {
      issues.push(`Budget gate large-ledger final prompt status was ${large.promptBudgetStatus ?? "missing"}.`);
    }
    if ((large.promptBudgetWarningCount ?? 0) !== 0) {
      issues.push(`Budget gate large-ledger reported ${large.promptBudgetWarningCount} prompt-budget warning(s).`);
    }
    if ((large.plannerLedgerCompactionCount ?? 0) < 1) {
      issues.push("Budget gate large-ledger did not compact the prior-card ledger.");
    }
    if ((large.compactionPromptCount ?? 0) < 1) {
      issues.push("Budget gate large-ledger did not exercise the compaction prompt path.");
    }
  }

  const replay = byName.get("large-ledger-cache-replay");
  if (replay) {
    if (replay.promptBudgetStatus !== "within_budget") {
      issues.push(`Budget gate cache replay final prompt status was ${replay.promptBudgetStatus ?? "missing"}.`);
    }
    if ((replay.plannerLedgerCompactionCacheHitCount ?? 0) < 1) {
      issues.push("Budget gate cache replay did not reuse a checksum-keyed compaction.");
    }
    if ((replay.compactionPromptCount ?? 0) !== 0) {
      issues.push(`Budget gate cache replay made ${replay.compactionPromptCount} compaction prompt call(s).`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    scenarioCount: scenarios.length,
    requiredScenarioNames,
    overBudgetBeforeCompactionObserved: ["summarization_recommended", "soft_prompt_budget_exceeded", "context_budget_exceeded"].includes(
      large?.rawPromptBudgetStatus,
    ),
    compactionObserved: (large?.plannerLedgerCompactionCount ?? 0) > 0,
    cacheReplayObserved: (replay?.plannerLedgerCompactionCacheHitCount ?? 0) > 0 && (replay?.compactionPromptCount ?? 0) === 0,
    scenarios: normalizedScenarios,
  };
}

function pmReviewProviderFixturesGateCheck(report, input = {}) {
  const required = input.required === true;
  const liveRequired = input.requireLive === true;
  const issues = [];
  const advisoryIssues = [];
  const requiredScenarioNames = [
    "ready_with_constraints",
    "source_conflict_needs_answer",
    "ignored_source_excluded",
    "recommendation_scope_ready_for_activation",
  ];

  if (!report) {
    const message = "PM Review provider fixture gate has not run; run test:project-board-pm-review-provider-fixtures-gate to capture constrained, conflict, ignored-source, and recommendation-scope coverage.";
    if (required) issues.push(message);
    return {
      passed: issues.length === 0,
      observed: false,
      required,
      liveRequired,
      liveObserved: false,
      livePassed: !liveRequired,
      deterministicScenarioCount: 0,
      deterministicScenarioNames: [],
      liveScenarioNames: [],
      coverage: {},
      issues,
      advisoryIssues,
    };
  }

  const deterministic = report.deterministic && typeof report.deterministic === "object" ? report.deterministic : {};
  const liveVariants = report.liveVariants && typeof report.liveVariants === "object" ? report.liveVariants : {};
  const deterministicScenarioNames = Array.isArray(deterministic.scenarioNames) ? deterministic.scenarioNames : [];
  const liveScenarioNames = Array.isArray(liveVariants.scenarioNames) ? liveVariants.scenarioNames : [];
  const coverage = deterministic.coverage && typeof deterministic.coverage === "object" ? deterministic.coverage : {};

  if (report.status !== "passed") issues.push(`PM Review provider fixture gate status was ${report.status ?? "missing"}.`);
  if (deterministic.status !== "passed") issues.push(`PM Review provider deterministic fixture status was ${deterministic.status ?? "missing"}.`);
  if (deterministic.exitCode !== 0) issues.push(`PM Review provider deterministic fixture exit code was ${deterministic.exitCode ?? "missing"}.`);
  for (const name of requiredScenarioNames) {
    if (!deterministicScenarioNames.includes(name)) {
      issues.push(`PM Review provider fixture gate did not report scenario ${name}.`);
    }
  }
  for (const [key, label] of Object.entries({
    constrainedReadiness: "constrained readiness",
    sourceConflict: "source conflict",
    ignoredSourceExclusion: "ignored-source exclusion",
    recommendationScope: "recommendation scope",
    zeroCardContract: "zero-card contract",
    activationMetadata: "activation metadata",
  })) {
    if (coverage[key] !== true) issues.push(`PM Review provider fixture gate did not cover ${label}.`);
  }

  const liveObserved = liveVariants.status === "passed" || liveVariants.status === "attention";
  const livePassed = liveVariants.status === "passed" && liveVariants.exitCode === 0;
  if (!liveObserved) {
    const message = "PM Review provider live variant matrix has not run; rerun with --run-pm-review-provider-variants-live to exercise constrained, conflict, ignored-source, and recommendation reports against Ambient/Pi.";
    if (liveRequired) issues.push(message);
    else advisoryIssues.push(message);
  } else {
    if (liveVariants.status !== "passed") issues.push(`PM Review provider live variant status was ${liveVariants.status ?? "missing"}.`);
    if (liveVariants.exitCode !== 0) issues.push(`PM Review provider live variant exit code was ${liveVariants.exitCode ?? "missing"}.`);
    for (const name of requiredScenarioNames) {
      if (!liveScenarioNames.includes(name)) {
        issues.push(`PM Review provider live variant gate did not report scenario ${name}.`);
      }
    }
  }

  return {
    passed: issues.length === 0,
    observed: true,
    required,
    liveRequired,
    liveObserved,
    livePassed,
    deterministicScenarioCount: deterministicScenarioNames.length,
    deterministicScenarioNames,
    liveScenarioNames,
    coverage,
    issues,
    advisoryIssues,
  };
}

function pmReviewUiVariantsGateCheck(report, input = {}) {
  const required = input.required === true;
  const issues = [];
  const advisoryIssues = [];
  const requiredScenarioNames = [
    "ready_with_constraints",
    "source_conflict_needs_answer",
    "ignored_source_excluded",
    "recommendation_scope_ready_for_activation",
  ];

  if (!report) {
    const message =
      "PM Review UI variant gate has not run; run test:project-board-pm-review-ui-variants-gate to verify constrained, conflict, ignored-source, and recommendation report rendering.";
    if (required) issues.push(message);
    return {
      passed: issues.length === 0,
      observed: false,
      required,
      deterministicStatus: "not_run",
      deterministicScenarioCount: 0,
      deterministicScenarioNames: [],
      coverage: {},
      issues,
      advisoryIssues,
    };
  }

  const deterministic = report.deterministic && typeof report.deterministic === "object" ? report.deterministic : {};
  const deterministicScenarioNames = Array.isArray(deterministic.scenarioNames) ? deterministic.scenarioNames : [];
  const coverage = deterministic.coverage && typeof deterministic.coverage === "object" ? deterministic.coverage : {};

  if (report.status !== "passed") issues.push(`PM Review UI variant gate status was ${report.status ?? "missing"}.`);
  if (deterministic.status !== "passed") issues.push(`PM Review UI variant deterministic status was ${deterministic.status ?? "missing"}.`);
  if (deterministic.exitCode !== 0) issues.push(`PM Review UI variant deterministic exit code was ${deterministic.exitCode ?? "missing"}.`);
  for (const name of requiredScenarioNames) {
    if (!deterministicScenarioNames.includes(name)) {
      issues.push(`PM Review UI variant gate did not report scenario ${name}.`);
    }
  }
  for (const [key, label] of Object.entries({
    constrainedReadiness: "constrained readiness rendering",
    sourceConflict: "source conflict rendering",
    ignoredSourceExclusion: "ignored-source exclusion rendering",
    recommendationScope: "recommendation scope rendering",
    rendererSections: "renderer report sections",
    recommendationBanner: "recommendation banner",
  })) {
    if (coverage[key] !== true) issues.push(`PM Review UI variant gate did not cover ${label}.`);
  }

  return {
    passed: issues.length === 0,
    observed: true,
    required,
    deterministicStatus: deterministic.status ?? "missing",
    deterministicScenarioCount: deterministicScenarioNames.length,
    deterministicScenarioNames,
    coverage,
    issues,
    advisoryIssues,
  };
}

function handoffGateCheck(handoff) {
  const observations = handoff.observations && typeof handoff.observations === "object" ? handoff.observations : {};
  const issues = [];
  if (handoff.status !== "passed") issues.push(`Objective handoff dogfood status was ${handoff.status ?? "missing"}.`);
  if (handoff.exitCode !== 0) issues.push(`Objective handoff dogfood exit code was ${handoff.exitCode ?? "missing"}.`);
  for (const [key, expected] of Object.entries({
    objectiveGitHandoffObserved: true,
    sourcePathLineageObserved: true,
    cloneContinuationObserved: true,
    firstCloneApplyObserved: true,
  })) {
    if (observations[key] !== expected) issues.push(`Objective handoff observation ${key} was ${String(observations[key])}.`);
  }
  return {
    passed: issues.length === 0,
    issues,
  };
}

function pauseResumeGateCheck(pauseResume, input = {}) {
  const required = input.required === true;
  const observations = pauseResume?.observations && typeof pauseResume.observations === "object" ? pauseResume.observations : {};
  const issues = [];
  const advisoryIssues = [];
  if (!pauseResume) {
    const message = "Pause/resume live smoke has not run; run with --run-pause-resume-live to capture no-duplicate-card evidence.";
    if (required) issues.push(message);
    else advisoryIssues.push(message);
    return { passed: issues.length === 0, observed: false, required, issues, advisoryIssues };
  }
  if (pauseResume.status !== "passed") issues.push(`Pause/resume live smoke status was ${pauseResume.status ?? "missing"}.`);
  for (const [key, expected] of Object.entries({
    pauseObserved: true,
    pauseCheckpointObserved: true,
    resumeObserved: true,
    continuationPromptObserved: true,
    noDuplicateCardsObserved: true,
  })) {
    if (observations[key] !== expected) issues.push(`Pause/resume live smoke observation ${key} was ${String(observations[key])}.`);
  }
  if (!Number.isFinite(observations.pausedCardCount) || observations.pausedCardCount <= 0) {
    issues.push("Pause/resume live smoke did not capture any cards before pause.");
  }
  if (!Number.isFinite(observations.resumedCardCount) || observations.resumedCardCount < observations.pausedCardCount) {
    issues.push("Pause/resume live smoke resumed with fewer cards than the paused checkpoint.");
  }
  return {
    passed: issues.length === 0,
    observed: true,
    required,
    issues,
    advisoryIssues,
  };
}

function pauseResumeUiGateCheck(pauseResumeUi, input = {}) {
  const required = input.required === true;
  const issues = [];
  const advisoryIssues = [];
  if (!pauseResumeUi) {
    const message =
      "Focused pause/resume UI dogfood has not run; run with --run-pause-resume-ui-live to capture PM Review button and screenshot evidence.";
    if (required) issues.push(message);
    else advisoryIssues.push(message);
    return { passed: issues.length === 0, observed: false, required, issues, advisoryIssues, screenshotCount: 0, screenshotPaths: [] };
  }

  const steps = Array.isArray(pauseResumeUi.steps) ? pauseResumeUi.steps : [];
  const step = steps.find((candidate) => candidate?.name === "pause-resume-planning-ui");
  const screenshots = step?.screenshots && typeof step.screenshots === "object" ? step.screenshots : {};
  const screenshotEntries = Object.entries(screenshots).filter(([, value]) => value && typeof value === "object");
  const screenshotPaths = screenshotEntries.map(([, value]) => value.path).filter((value) => typeof value === "string" && value.trim());

  if (pauseResumeUi.status !== "passed") issues.push(`Focused pause/resume UI dogfood status was ${pauseResumeUi.status ?? "missing"}.`);
  if (pauseResumeUi.pauseResumeDogfoodMode !== true) issues.push("Focused pause/resume UI dogfood was not run in pause/resume mode.");
  if (!step) {
    issues.push("Focused pause/resume UI dogfood did not report the pause-resume-planning-ui step.");
  } else {
    if (step.pausedRunStatus !== "paused") issues.push(`Focused pause/resume UI paused run status was ${step.pausedRunStatus ?? "missing"}.`);
    if (!step.resumedRunId || step.resumedRunId === step.pausedRunId) issues.push("Focused pause/resume UI dogfood did not start a distinct resumed run.");
    if (step.retryOfRunId !== step.pausedRunId) {
      issues.push(`Focused pause/resume UI resumed run retryOfRunId ${step.retryOfRunId ?? "missing"} did not match paused run ${step.pausedRunId ?? "missing"}.`);
    }
    if (!Number.isFinite(step.pausedCardCount) || step.pausedCardCount <= 0) {
      issues.push("Focused pause/resume UI dogfood did not capture cards before pausing.");
    }
    if (!Number.isFinite(step.resumedCardCount) || step.resumedCardCount < step.pausedCardCount) {
      issues.push("Focused pause/resume UI dogfood resumed with fewer cards than the paused checkpoint.");
    }
    if ((step.duplicateCardCount ?? 0) !== 0 || (step.duplicateCardRate ?? 0) !== 0) {
      issues.push(`Focused pause/resume UI dogfood reported duplicate-card rate ${step.duplicateCardRate ?? "missing"}.`);
    }
  }

  for (const name of ["running", "paused", "resumed"]) {
    const shot = screenshots[name];
    if (!shot || typeof shot !== "object") {
      issues.push(`Focused pause/resume UI dogfood did not capture ${name} screenshot evidence.`);
      continue;
    }
    if (!Number.isFinite(shot.width) || shot.width < 1200 || !Number.isFinite(shot.height) || shot.height < 800) {
      issues.push(`Focused pause/resume UI ${name} screenshot was too small (${shot.width ?? "missing"}x${shot.height ?? "missing"}).`);
    }
    if (!Number.isFinite(shot.nonBlackRatio) || shot.nonBlackRatio <= 0.5) {
      issues.push(`Focused pause/resume UI ${name} screenshot looked blank (nonBlackRatio ${shot.nonBlackRatio ?? "missing"}).`);
    }
    if (!Number.isFinite(shot.distinctColorCount) || shot.distinctColorCount <= 16) {
      issues.push(`Focused pause/resume UI ${name} screenshot had too few colors (${shot.distinctColorCount ?? "missing"}).`);
    }
  }

  return {
    passed: issues.length === 0,
    observed: true,
    required,
    issues,
    advisoryIssues,
    step,
    screenshotCount: screenshotEntries.length,
    screenshotPaths,
  };
}

function startFreshUiGateCheck(startFreshUi, input = {}) {
  const required = input.required === true;
  const issues = [];
  const advisoryIssues = [];
  if (!startFreshUi) {
    const message =
      "Focused Start Fresh UI dogfood has not run; run with --run-start-fresh-ui-live to capture abandoned-checkpoint, fresh Draft Inbox, and Superseded history evidence.";
    if (required) issues.push(message);
    else advisoryIssues.push(message);
    return { passed: issues.length === 0, observed: false, required, issues, advisoryIssues, screenshotCount: 0, screenshotPaths: [] };
  }

  const steps = Array.isArray(startFreshUi.steps) ? startFreshUi.steps : [];
  const step = steps.find((candidate) => candidate?.name === "start-fresh-planning-ui");
  const screenshots = step?.screenshots && typeof step.screenshots === "object" ? step.screenshots : {};
  const screenshotEntries = Object.entries(screenshots).filter(([, value]) => value && typeof value === "object");
  const screenshotPaths = screenshotEntries.map(([, value]) => value.path).filter((value) => typeof value === "string" && value.trim());

  if (startFreshUi.status !== "passed") issues.push(`Focused Start Fresh UI dogfood status was ${startFreshUi.status ?? "missing"}.`);
  if (startFreshUi.startFreshDogfoodMode !== true) issues.push("Focused Start Fresh UI dogfood was not run in Start Fresh mode.");
  if (!step) {
    issues.push("Focused Start Fresh UI dogfood did not report the start-fresh-planning-ui step.");
  } else {
    if (step.abandonedRunStatus !== "abandoned") {
      issues.push(`Focused Start Fresh UI abandoned run status was ${step.abandonedRunStatus ?? "missing"}.`);
    }
    if (!step.freshRunId || step.freshRunId === step.abandonedRunId) {
      issues.push("Focused Start Fresh UI dogfood did not start a distinct fresh run.");
    }
    if (step.retryOfRunId !== step.abandonedRunId) {
      issues.push(`Focused Start Fresh UI fresh run retryOfRunId ${step.retryOfRunId ?? "missing"} did not point at abandoned run ${step.abandonedRunId ?? "missing"}.`);
    }
    if (step.freshRunStatus === "failed") issues.push("Focused Start Fresh UI fresh run failed.");
    if (!Number.isFinite(step.abandonedCheckpointCardCount) || step.abandonedCheckpointCardCount <= 0) {
      issues.push("Focused Start Fresh UI dogfood did not capture cards before abandoning the paused checkpoint.");
    }
    if (!Number.isFinite(step.freshCardCount) || step.freshCardCount <= 0) {
      issues.push("Focused Start Fresh UI dogfood did not render fresh Draft Inbox cards.");
    }
    if ((step.duplicateCardCount ?? 0) !== 0 || (step.duplicateCardRate ?? 0) !== 0) {
      issues.push(`Focused Start Fresh UI dogfood reported duplicate-card rate ${step.duplicateCardRate ?? "missing"}.`);
    }
    if ((step.overlappingCardIdCount ?? 0) !== 0) {
      issues.push(`Focused Start Fresh UI dogfood reused ${step.overlappingCardIdCount} abandoned card id(s).`);
    }
    if ((step.overlappingSourceIdCount ?? 0) !== 0) {
      issues.push(`Focused Start Fresh UI dogfood reused ${step.overlappingSourceIdCount} abandoned source id(s) instead of a fresh namespace.`);
    }
    if (step.loadedPreviousRecords === true) {
      issues.push("Focused Start Fresh UI dogfood loaded previous progressive records into the fresh run.");
    }
    if (step.supersededHistoryVisible !== true || step.supersededHistoryIncludesAbandonedCard !== true) {
      issues.push("Focused Start Fresh UI dogfood did not show the Superseded history review with an abandoned checkpoint card.");
    }
  }

  for (const name of ["running", "paused", "fresh", "supersededHistory"]) {
    const shot = screenshots[name];
    if (!shot || typeof shot !== "object") {
      issues.push(`Focused Start Fresh UI dogfood did not capture ${name} screenshot evidence.`);
      continue;
    }
    if (!Number.isFinite(shot.width) || shot.width < 1200 || !Number.isFinite(shot.height) || shot.height < 800) {
      issues.push(`Focused Start Fresh UI ${name} screenshot was too small (${shot.width ?? "missing"}x${shot.height ?? "missing"}).`);
    }
    if (!Number.isFinite(shot.nonBlackRatio) || shot.nonBlackRatio <= 0.5) {
      issues.push(`Focused Start Fresh UI ${name} screenshot looked blank (nonBlackRatio ${shot.nonBlackRatio ?? "missing"}).`);
    }
    if (!Number.isFinite(shot.distinctColorCount) || shot.distinctColorCount <= 16) {
      issues.push(`Focused Start Fresh UI ${name} screenshot had too few colors (${shot.distinctColorCount ?? "missing"}).`);
    }
  }

  return {
    passed: issues.length === 0,
    observed: true,
    required,
    issues,
    advisoryIssues,
    step,
    screenshotCount: screenshotEntries.length,
    screenshotPaths,
  };
}

function pmReviewUiGateCheck(pmReviewUi, input = {}) {
  const required = input.required === true;
  const requiredWork = input.requireWork === true;
  const issues = [];
  const advisoryIssues = [];
  if (!pmReviewUi) {
    const message = requiredWork
      ? "Focused PM Review generated-card work dogfood has not run; run with --run-pm-review-work-live to capture ticketization and worker proof evidence."
      : "Focused PM Review UI dogfood has not run; run with --run-pm-review-ui-live to capture zero-card report, answer/update, and draft-board activation evidence.";
    if (required) issues.push(message);
    else advisoryIssues.push(message);
    return {
      passed: issues.length === 0,
      observed: false,
      required,
      requiredWork,
      workObserved: false,
      workPassed: !requiredWork,
      issues,
      advisoryIssues,
      screenshotCount: 0,
      screenshotPaths: [],
    };
  }

  const steps = Array.isArray(pmReviewUi.steps) ? pmReviewUi.steps : [];
  const step = steps.find((candidate) => candidate?.name === "pm-review-activation-ui");
  const workStep = steps.find((candidate) => candidate?.name === "pm-review-generated-card-work");
  const screenshots = step?.screenshots && typeof step.screenshots === "object" ? step.screenshots : {};
  const screenshotEntries = Object.entries(screenshots).filter(([, value]) => value && typeof value === "object");
  const screenshotPaths = screenshotEntries.map(([, value]) => value.path).filter((value) => typeof value === "string" && value.trim());
  const generatedCardCount = step
    ? Number(step.generatedActivationCardCount ?? step.generatedDraftCardCount ?? step.generatedProposalCardCount)
    : NaN;

  if (pmReviewUi.status !== "passed") issues.push(`Focused PM Review UI dogfood status was ${pmReviewUi.status ?? "missing"}.`);
  if (pmReviewUi.pmReviewActivationDogfoodMode !== true) issues.push("Focused PM Review UI dogfood was not run in PM Review activation mode.");
  if (!step) {
    issues.push("Focused PM Review UI dogfood did not report the pm-review-activation-ui step.");
  } else {
    const reportUiCoverage = step.reportUiCoverage && typeof step.reportUiCoverage === "object" ? step.reportUiCoverage : {};
    if (step.zeroCardReportObserved !== true) issues.push("Focused PM Review UI dogfood did not observe a zero-card lightweight report.");
    if (typeof step.sourceConfidence !== "string" || step.sourceConfidence === "unknown") {
      issues.push(`Focused PM Review UI dogfood source confidence was ${step.sourceConfidence ?? "missing"}.`);
    }
    if (!Number.isFinite(step.sourceConfidenceNoteCount) || step.sourceConfidenceNoteCount <= 0) {
      issues.push("Focused PM Review UI dogfood did not capture source-confidence note evidence.");
    }
    if (reportUiCoverage.sourceConfidence !== true) {
      issues.push("Focused PM Review UI dogfood did not show the source-confidence section in the renderer.");
    }
    if (typeof step.gitState !== "string" || step.gitState === "unknown") {
      issues.push(`Focused PM Review UI dogfood Git state was ${step.gitState ?? "missing"}.`);
    }
    if (!Number.isFinite(step.gitStateNoteCount) || step.gitStateNoteCount <= 0) {
      issues.push("Focused PM Review UI dogfood did not capture Git-state note evidence.");
    }
    if (reportUiCoverage.gitState !== true) {
      issues.push("Focused PM Review UI dogfood did not show the Git-state section in the renderer.");
    }
    if (step.recommendedActivationScopePresent !== true || reportUiCoverage.recommendedNextStep !== true) {
      issues.push("Focused PM Review UI dogfood did not show the recommended activation scope in the renderer.");
    }
    for (const [countKey, coverageKey, label] of [
      ["blockingQuestionCount", "blockingQuestions", "blocking questions"],
      ["riskCount", "risks", "risks"],
      ["sourceConflictCount", "sourceConflicts", "source conflicts"],
      ["sourceAuthorityNoteCount", "sourceAuthority", "source authority"],
      ["cardGenerationConstraintCount", "cardGenerationConstraints", "card-generation constraints"],
    ]) {
      if (Number(step[countKey]) > 0 && reportUiCoverage[coverageKey] !== true) {
        issues.push(`Focused PM Review UI dogfood did not show ${label} even though the report included them.`);
      }
    }
    if ((step.reviewQuestionCount ?? 0) > 0 && step.answerUpdateObserved !== true) {
      issues.push("Focused PM Review UI dogfood had review questions but did not exercise the answer/update loop.");
    }
    if ((step.reviewQuestionCount ?? 0) > 0 && (!Number.isFinite(step.answeredQuestionCount) || step.answeredQuestionCount < step.reviewQuestionCount)) {
      issues.push("Focused PM Review UI dogfood did not answer all lightweight review questions before updating.");
    }
    if (!step.activationRunId) issues.push("Focused PM Review UI dogfood did not start draft-board activation.");
    if (step.activationRunStatus === "failed") issues.push("Focused PM Review UI draft-board activation run failed.");
    if (step.activationSurface !== "draft_inbox") {
      issues.push(`Focused PM Review UI dogfood should materialize Generate Draft Board output in Draft Inbox, got ${step.activationSurface ?? "missing"}.`);
    }
    if (!Number.isFinite(step.generatedDraftCardCount) || step.generatedDraftCardCount <= 0) {
      issues.push("Focused PM Review UI dogfood did not render generated Draft Inbox cards.");
    } else if (!Number.isFinite(generatedCardCount) || generatedCardCount <= 0) {
      issues.push("Focused PM Review UI dogfood did not report generated activation cards.");
    }
    if ((step.duplicateCardCount ?? 0) !== 0 || (step.duplicateCardRate ?? 0) !== 0) {
      issues.push(`Focused PM Review UI dogfood reported duplicate-card rate ${step.duplicateCardRate ?? "missing"}.`);
    }
  }
  if (requiredWork) {
    if (!workStep) {
      issues.push("Focused PM Review generated-card work dogfood did not report the pm-review-generated-card-work step.");
    } else {
      if (!workStep.cardId || !workStep.taskId) issues.push("Focused PM Review generated-card work dogfood did not ticketize a generated Draft Inbox card.");
      if (!workStep.preparedRunId) issues.push("Focused PM Review generated-card work dogfood did not prepare a Local Task run.");
      if (!["completed", "failed", "stalled", "canceled"].includes(workStep.runStatus)) {
        issues.push(`Focused PM Review generated-card work run did not reach a terminal status, got ${workStep.runStatus ?? "missing"}.`);
      }
      if (!workStep.proofReview || typeof workStep.proofReview !== "object") {
        issues.push("Focused PM Review generated-card work dogfood did not record PM proof review.");
      }
      if (!Number.isFinite(workStep.meaningfulChangedPathCount) || workStep.meaningfulChangedPathCount <= 0) {
        issues.push("Focused PM Review generated-card work dogfood did not report meaningful workspace changes.");
      }
      if (!Number.isFinite(workStep.taskActions?.count) || workStep.taskActions.count <= 0) {
        issues.push("Focused PM Review generated-card work dogfood did not observe project-board task actions.");
      } else if (workStep.taskActions.protocolSatisfied === false) {
        const missing = Array.isArray(workStep.taskActions.protocolMissing) && workStep.taskActions.protocolMissing.length
          ? ` Missing: ${workStep.taskActions.protocolMissing.join(", ")}.`
          : "";
        issues.push(
          `Focused PM Review generated-card work observed task actions, but they did not satisfy the full progress/proof terminal protocol.${missing}`,
        );
      }
    }
  }

  for (const name of ["report", "generatedCards"]) {
    const shot = screenshots[name] ?? (name === "generatedCards" ? screenshots.draftInbox : undefined);
    if (!shot || typeof shot !== "object") {
      issues.push(`Focused PM Review UI dogfood did not capture ${name} screenshot evidence.`);
      continue;
    }
    if (!Number.isFinite(shot.width) || shot.width < 1200 || !Number.isFinite(shot.height) || shot.height < 800) {
      issues.push(`Focused PM Review UI ${name} screenshot was too small (${shot.width ?? "missing"}x${shot.height ?? "missing"}).`);
    }
    if (!Number.isFinite(shot.nonBlackRatio) || shot.nonBlackRatio <= 0.5) {
      issues.push(`Focused PM Review UI ${name} screenshot looked blank (nonBlackRatio ${shot.nonBlackRatio ?? "missing"}).`);
    }
    if (!Number.isFinite(shot.distinctColorCount) || shot.distinctColorCount <= 16) {
      issues.push(`Focused PM Review UI ${name} screenshot had too few colors (${shot.distinctColorCount ?? "missing"}).`);
    }
  }

  return {
    passed: issues.length === 0,
    observed: true,
    required,
    requiredWork,
    workObserved: Boolean(workStep),
    workPassed:
      !requiredWork ||
      Boolean(
        workStep?.cardId &&
          workStep?.taskId &&
          workStep?.preparedRunId &&
          ["completed", "failed", "stalled", "canceled"].includes(workStep?.runStatus) &&
          workStep?.proofReview &&
          Number(workStep?.meaningfulChangedPathCount) > 0 &&
          Number(workStep?.taskActions?.count) > 0,
      ),
    issues,
    advisoryIssues,
    step,
    workStep,
    screenshotCount: screenshotEntries.length,
    screenshotPaths,
  };
}

function sourceClassificationUiGateCheck(sourceClassificationUi, input = {}) {
  const required = input.required === true;
  const issues = [];
  const advisoryIssues = [];
  if (!sourceClassificationUi) {
    const message =
      "Focused source-classification UI dogfood has not run; run with --run-source-classification-ui-live to capture ignored-source refresh, reclassification, Add Cards eligibility, and PM Review activation evidence.";
    if (required) issues.push(message);
    else advisoryIssues.push(message);
    return {
      passed: issues.length === 0,
      observed: false,
      required,
      issues,
      advisoryIssues,
      screenshotCount: 0,
      screenshotPaths: [],
    };
  }

  const steps = Array.isArray(sourceClassificationUi.steps) ? sourceClassificationUi.steps : [];
  const step = steps.find((candidate) => candidate?.name === "source-classification-ui");
  const pmReviewStep = steps.find((candidate) => candidate?.name === "pm-review-activation-ui");
  const screenshots = step?.screenshots && typeof step.screenshots === "object" ? step.screenshots : {};
  const screenshotEntries = Object.entries(screenshots).filter(([, value]) => value && typeof value === "object");
  const screenshotPaths = screenshotEntries.map(([, value]) => value.path).filter((value) => typeof value === "string" && value.trim());

  if (sourceClassificationUi.status !== "passed") {
    issues.push(`Focused source-classification UI dogfood status was ${sourceClassificationUi.status ?? "missing"}.`);
  }
  if (sourceClassificationUi.sourceClassificationUiDogfoodMode !== true) {
    issues.push("Focused source-classification UI dogfood was not run in source-classification mode.");
  }
  if (!step) {
    issues.push("Focused source-classification UI dogfood did not report the source-classification-ui step.");
  } else {
    if (step.ignoredKind !== "ignored") {
      issues.push(`Focused source-classification UI dogfood did not classify the target as ignored, got ${step.ignoredKind ?? "missing"}.`);
    }
    if (step.ignoredClassifiedBy !== "user") {
      issues.push(`Focused source-classification UI dogfood did not preserve user classification ownership, got ${step.ignoredClassifiedBy ?? "missing"}.`);
    }
    if (step.ignoredIncludeInSynthesis !== false) {
      issues.push("Focused source-classification UI dogfood did not exclude the ignored source from synthesis.");
    }
    if (step.ignoredVisibleInReview !== true) {
      issues.push("Focused source-classification UI dogfood did not keep the ignored source visible in Source Review.");
    }
    if (step.ignoredFilterVisible !== true) {
      issues.push("Focused source-classification UI dogfood did not expose the ignored-source filter/count in Source Review.");
    }
    if (step.ignoredDetailExplainsExclusion !== true) {
      issues.push("Focused source-classification UI dogfood did not explain ignored-source exclusion in the Source Inspector.");
    }
    if (step.ignoredElaborateDisabled !== true) {
      issues.push("Focused source-classification UI dogfood did not disable Source Inspector Add Cards for the ignored source.");
    }
    if (step.refreshPreservedIgnored !== true) {
      issues.push("Focused source-classification UI dogfood did not preserve the ignored user classification after Refresh Sources.");
    }
    if (step.refreshTitleIncludesPreservation !== true && step.refreshCopyIncludesPreservation !== true) {
      issues.push("Focused source-classification UI dogfood did not show refresh copy explaining ignored/user classification preservation.");
    }
    if (typeof step.reclassifiedKind !== "string" || step.reclassifiedKind === "ignored") {
      issues.push(`Focused source-classification UI dogfood did not reclassify the target back into an included source kind, got ${step.reclassifiedKind ?? "missing"}.`);
    }
    if (step.reclassifiedIncludeInSynthesis === false) {
      issues.push("Focused source-classification UI dogfood kept the reclassified source excluded from synthesis.");
    }
    if (step.reclassifiedElaborateEnabled !== true) {
      issues.push("Focused source-classification UI dogfood did not re-enable Source Inspector Add Cards after reclassification.");
    }
    if (step.includedDetailExplainsEligibility !== true) {
      issues.push("Focused source-classification UI dogfood did not explain included-source Add Cards eligibility after reclassification.");
    }
    if (step.sourceRefreshSettledBeforePmReview !== true) {
      issues.push("Focused source-classification UI dogfood did not wait for source-refresh runs to settle before PM Review activation.");
    }
  }

  if (!pmReviewStep) {
    issues.push("Focused source-classification UI dogfood did not chain into PM Review activation evidence.");
  } else {
    if (pmReviewStep.activationSurface !== "draft_inbox") {
      issues.push(`Focused source-classification UI dogfood PM Review activation should materialize into Draft Inbox, got ${pmReviewStep.activationSurface ?? "missing"}.`);
    }
    if (!Number.isFinite(pmReviewStep.generatedDraftCardCount) || pmReviewStep.generatedDraftCardCount <= 0) {
      issues.push("Focused source-classification UI dogfood did not render generated Draft Inbox cards after reclassification.");
    }
    if ((pmReviewStep.duplicateCardCount ?? 0) !== 0 || (pmReviewStep.duplicateCardRate ?? 0) !== 0) {
      issues.push(`Focused source-classification UI dogfood reported duplicate-card rate ${pmReviewStep.duplicateCardRate ?? "missing"}.`);
    }
  }

  for (const name of ["initial", "ignored", "refreshed", "included"]) {
    const shot = screenshots[name];
    if (!shot || typeof shot !== "object") {
      issues.push(`Focused source-classification UI dogfood did not capture ${name} screenshot evidence.`);
      continue;
    }
    if (!Number.isFinite(shot.width) || shot.width < 1200 || !Number.isFinite(shot.height) || shot.height < 800) {
      issues.push(`Focused source-classification UI ${name} screenshot was too small (${shot.width ?? "missing"}x${shot.height ?? "missing"}).`);
    }
    if (!Number.isFinite(shot.nonBlackRatio) || shot.nonBlackRatio <= 0.5) {
      issues.push(`Focused source-classification UI ${name} screenshot looked blank (nonBlackRatio ${shot.nonBlackRatio ?? "missing"}).`);
    }
    if (!Number.isFinite(shot.distinctColorCount) || shot.distinctColorCount <= 16) {
      issues.push(`Focused source-classification UI ${name} screenshot had too few colors (${shot.distinctColorCount ?? "missing"}).`);
    }
  }

  return {
    passed: issues.length === 0,
    observed: true,
    required,
    issues,
    advisoryIssues,
    step,
    pmReviewStep,
    screenshotCount: screenshotEntries.length,
    screenshotPaths,
  };
}

function directHelperRetryGateCheck(report, input = {}) {
  const required = input.required === true;
  const issues = [];
  const advisoryIssues = [];
  if (!report) {
    const message =
      "Project-board direct-helper retry GMI live smoke has not run; run with --run-direct-helper-retry-live to capture source-classification, charter-summary, and proof-judgment UI retry recovery evidence.";
    if (required) issues.push(message);
    else advisoryIssues.push(message);
    return {
      passed: issues.length === 0,
      observed: false,
      required,
      issues,
      advisoryIssues,
      scenarioCount: 0,
      targets: [],
      sourceClassificationComplete: false,
      charterSummaryComplete: false,
      proofJudgmentComplete: false,
    };
  }

  const scenarios = normalizedDirectHelperRetryScenarios(report);
  const byScenario = new Map(scenarios.map((scenario) => [scenario.scenario, scenario]));
  const sourceClassification = byScenario.get("source-classification");
  const charterSummary = byScenario.get("charter-summary");
  const proofJudgment = byScenario.get("proof-judgment");
  if (report.status !== "passed") issues.push(`Project-board direct-helper retry smoke status was ${report.status ?? "missing"}.`);
  if (!sourceClassification) issues.push("Project-board direct-helper retry smoke did not report the source-classification scenario.");
  if (!charterSummary) issues.push("Project-board direct-helper retry smoke did not report the charter-summary scenario.");
  if (!proofJudgment) issues.push("Project-board direct-helper retry smoke did not report the proof-judgment scenario.");
  for (const scenario of [sourceClassification, charterSummary, proofJudgment].filter(Boolean)) {
    validateDirectHelperRetryScenario(scenario, issues);
  }

  return {
    passed: issues.length === 0,
    observed: true,
    required,
    issues,
    advisoryIssues,
    scenarioCount: scenarios.length,
    targets: scenarios.map((scenario) => scenario.scenario),
    sourceClassificationComplete: Boolean(sourceClassification) && directHelperRetryScenarioPassed(sourceClassification),
    charterSummaryComplete: Boolean(charterSummary) && directHelperRetryScenarioPassed(charterSummary),
    proofJudgmentComplete: Boolean(proofJudgment) && directHelperRetryScenarioPassed(proofJudgment),
    sourceClassification: summarizeDirectHelperRetryScenario(sourceClassification),
    charterSummary: summarizeDirectHelperRetryScenario(charterSummary),
    proofJudgment: summarizeDirectHelperRetryScenario(proofJudgment),
  };
}

function normalizedDirectHelperRetryScenarios(report) {
  if (Array.isArray(report.scenarios)) return report.scenarios.filter((scenario) => scenario && typeof scenario === "object");
  if (typeof report.scenario === "string") return [report];
  return [];
}

function validateDirectHelperRetryScenario(scenario, issues) {
  const label = scenario.scenario ?? "unknown";
  if (scenario.status !== "passed") issues.push(`Project-board direct-helper retry ${label} scenario status was ${scenario.status ?? "missing"}.`);
  if (scenario.failpointTriggered !== true) issues.push(`Project-board direct-helper retry ${label} scenario did not trigger the failpoint proxy.`);
  if (scenario.failpointClosedByClient !== true) issues.push(`Project-board direct-helper retry ${label} scenario did not close the stalled stream from the client side.`);
  if (!Number.isFinite(scenario.forwardedChatCompletionCount) || scenario.forwardedChatCompletionCount < 1) {
    issues.push(`Project-board direct-helper retry ${label} scenario did not forward a recovery chat-completion request.`);
  }
  const retry = scenario.retryEvent && typeof scenario.retryEvent === "object" ? scenario.retryEvent : {};
  if (retry.transientRetry !== true) issues.push(`Project-board direct-helper retry ${label} scenario did not record transient retry metadata.`);
  if (retry.aggressiveRetries !== true) issues.push(`Project-board direct-helper retry ${label} scenario did not run with aggressive retries enabled.`);
  if (retry.retryAttempt !== 1) issues.push(`Project-board direct-helper retry ${label} scenario retry attempt was ${retry.retryAttempt ?? "missing"}, expected 1.`);
  if (retry.maxRetries !== 10) issues.push(`Project-board direct-helper retry ${label} scenario max retries was ${retry.maxRetries ?? "missing"}, expected 10.`);
  if (retry.retryDelayMs !== 1000) issues.push(`Project-board direct-helper retry ${label} scenario first retry delay was ${retry.retryDelayMs ?? "missing"}, expected 1000ms.`);
  if (!String(retry.error ?? "").includes("without model content")) {
    issues.push(`Project-board direct-helper retry ${label} scenario did not capture the no-content stream-stall diagnostic.`);
  }
  if (label === "source-classification") {
    if (scenario.latestRunStatus !== "succeeded") {
      issues.push(`Project-board direct-helper retry source-classification scenario run status was ${scenario.latestRunStatus ?? "missing"}.`);
    }
    if (scenario.latestRunStage !== "sources_persisted") {
      issues.push(`Project-board direct-helper retry source-classification scenario run stage was ${scenario.latestRunStage ?? "missing"}.`);
    }
  }
  if (label === "charter-summary" && scenario.charterSummaryApplied !== true) {
    issues.push("Project-board direct-helper retry charter-summary scenario did not apply a recovered Pi charter summary.");
  }
  if (label === "proof-judgment") {
    if (scenario.proofJudgmentApplied !== true) {
      issues.push("Project-board direct-helper retry proof-judgment scenario did not apply a recovered Pi proof review.");
    }
    if (scenario.proofReviewReviewer !== "ambient_pi") {
      issues.push(`Project-board direct-helper retry proof-judgment scenario reviewer was ${scenario.proofReviewReviewer ?? "missing"}, expected ambient_pi.`);
    }
    if (!scenario.proofReviewStatus) {
      issues.push("Project-board direct-helper retry proof-judgment scenario did not report the proof review status.");
    }
    if (!scenario.proofReviewRecommendedAction) {
      issues.push("Project-board direct-helper retry proof-judgment scenario did not report the proof review recommended action.");
    }
  }
}

function directHelperRetryScenarioPassed(scenario) {
  const issues = [];
  validateDirectHelperRetryScenario(scenario, issues);
  return issues.length === 0;
}

function summarizeDirectHelperRetryScenario(scenario) {
  if (!scenario) return undefined;
  return {
    status: scenario.status,
    boardId: scenario.boardId,
    runRoot: scenario.runRoot,
    sourceCount: scenario.sourceCount,
    latestRunStatus: scenario.latestRunStatus,
    latestRunStage: scenario.latestRunStage,
    charterSummaryApplied: scenario.charterSummaryApplied,
    proofJudgmentApplied: scenario.proofJudgmentApplied,
    proofReviewReviewer: scenario.proofReviewReviewer,
    proofReviewStatus: scenario.proofReviewStatus,
    proofReviewRecommendedAction: scenario.proofReviewRecommendedAction,
    proofReviewEvidenceQuality: scenario.proofReviewEvidenceQuality,
    proofReviewConfidence: scenario.proofReviewConfidence,
    proofReviewSummary: scenario.proofReviewSummary,
    failpointTriggered: scenario.failpointTriggered,
    failpointLimit: scenario.failpointLimit,
    failpointTriggerCount: scenario.failpointTriggerCount,
    failpointClosedByClient: scenario.failpointClosedByClient,
    failpointChatCompletionCount: scenario.failpointChatCompletionCount,
    failpointChatCompletionCounts: scenario.failpointChatCompletionCounts,
    chatCompletionCount: scenario.chatCompletionCount,
    forwardedChatCompletionCount: scenario.forwardedChatCompletionCount,
    forwardedStreamChatCompletionCount: scenario.forwardedStreamChatCompletionCount,
    forwardedNonStreamChatCompletionCount: scenario.forwardedNonStreamChatCompletionCount,
    fallbackToNonStream: scenario.fallbackToNonStream,
    deterministicSetupChatCompletionCount: scenario.deterministicSetupChatCompletionCount,
    observedOperations: scenario.observedOperations,
    observedRequests: scenario.observedRequests,
    retryEvent: scenario.retryEvent,
    error: scenario.error,
    issues: scenario.issues,
  };
}

function releaseArtifactFreshnessCheck(input) {
  const now = parseDate(input.nowIso) ?? new Date();
  const currentSourceRevision = input.currentSourceRevision && typeof input.currentSourceRevision === "object" ? input.currentSourceRevision : {};
  if (input.skipProviderWorker === true) {
    const currentIssues = input.requireCurrentHead && currentSourceRevision.dirty === true
      ? ["Current worktree has tracked uncommitted changes; strict project-board release-gate freshness requires a clean source tree."]
      : [];
    return {
      status: currentIssues.length > 0 ? "attention" : "passed",
      requireCurrentHead: input.requireCurrentHead === true,
      maxArtifactAgeHours: Number.isFinite(input.maxArtifactAgeHours) ? input.maxArtifactAgeHours : undefined,
      currentSourceRevision,
      provider: { skipped: true, advisoryIssues: [], issues: [] },
      worker: { skipped: true, advisoryIssues: [], issues: [] },
      check: {
        passed: currentIssues.length === 0,
        issues: currentIssues,
        advisoryIssues: [],
      },
    };
  }
  const provider = artifactFreshness({
    label: "Provider",
    report: input.provider,
    currentSourceRevision,
    now,
    requireCurrentHead: input.requireCurrentHead,
    maxArtifactAgeHours: input.maxArtifactAgeHours,
  });
  const worker = artifactFreshness({
    label: "Worker",
    report: input.worker,
    currentSourceRevision,
    now,
    requireCurrentHead: input.requireCurrentHead,
    maxArtifactAgeHours: input.maxArtifactAgeHours,
  });
  const currentIssues = input.requireCurrentHead && currentSourceRevision.dirty === true
    ? ["Current worktree has tracked uncommitted changes; strict project-board release-gate freshness requires a clean source tree."]
    : [];
  const issues = [...currentIssues, ...provider.issues, ...worker.issues];
  const advisoryIssues = [...provider.advisoryIssues, ...worker.advisoryIssues];
  return {
    status: issues.length > 0 ? "attention" : advisoryIssues.length > 0 ? "passed_with_advisories" : "passed",
    requireCurrentHead: input.requireCurrentHead === true,
    maxArtifactAgeHours: Number.isFinite(input.maxArtifactAgeHours) ? input.maxArtifactAgeHours : undefined,
    currentSourceRevision,
    provider,
    worker,
    check: {
      passed: issues.length === 0,
      issues,
      advisoryIssues,
    },
  };
}

function artifactFreshness(input) {
  const report = input.report && typeof input.report === "object" ? input.report : {};
  const sourceRevision = report.sourceRevision && typeof report.sourceRevision === "object" ? report.sourceRevision : {};
  const currentGitHead = typeof input.currentSourceRevision.gitHead === "string" ? input.currentSourceRevision.gitHead : undefined;
  const artifactGitHead = typeof sourceRevision.gitHead === "string" ? sourceRevision.gitHead : undefined;
  const generatedAt = typeof report.generatedAt === "string" ? report.generatedAt : undefined;
  const generatedAtDate = parseDate(generatedAt);
  const ageHours = generatedAtDate ? Math.max(0, input.now.getTime() - generatedAtDate.getTime()) / 3_600_000 : undefined;
  const matchesCurrentHead = artifactGitHead && currentGitHead ? artifactGitHead === currentGitHead : undefined;
  const issues = [];
  const advisoryIssues = [];

  if (input.requireCurrentHead && !currentGitHead) {
    issues.push("Current git head was not available for strict project-board release-gate freshness.");
  }
  if (!artifactGitHead) {
    const message = `${input.label} matrix does not include sourceRevision.gitHead. Rerun its live matrix before relying on strict source freshness.`;
    if (input.requireCurrentHead) issues.push(message);
    else advisoryIssues.push(message);
  } else if (currentGitHead && artifactGitHead !== currentGitHead) {
    const message = `${input.label} matrix git head ${shortHead(artifactGitHead)} does not match current head ${shortHead(currentGitHead)}.`;
    if (input.requireCurrentHead) issues.push(message);
    else advisoryIssues.push(`${message} Rerun this live matrix if the changed files affect project-board behavior.`);
  }
  if (sourceRevision.dirty === true) {
    const message = `${input.label} matrix was generated from a dirty worktree.`;
    if (input.requireCurrentHead) issues.push(message);
    else advisoryIssues.push(message);
  }
  if (Number.isFinite(input.maxArtifactAgeHours)) {
    if (!Number.isFinite(ageHours)) {
      issues.push(`${input.label} matrix generatedAt timestamp is missing or invalid, so artifact age could not be checked.`);
    } else if (ageHours > input.maxArtifactAgeHours) {
      issues.push(`${input.label} matrix is ${ageHours.toFixed(1)}h old, exceeding the ${input.maxArtifactAgeHours}h freshness limit.`);
    }
  }

  return {
    generatedAt,
    ageHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(3)) : undefined,
    sourceRevision,
    matchesCurrentHead,
    issues,
    advisoryIssues,
  };
}

function parseDate(value) {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function shortHead(value) {
  return typeof value === "string" && value.length > 12 ? value.slice(0, 12) : value;
}
