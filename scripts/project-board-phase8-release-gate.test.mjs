import { describe, expect, it } from "vitest";
import {
  buildProjectBoardPhase8ReleaseGateReport,
  phase8ReleaseGatePassed,
} from "./project-board-phase8-release-gate-lib.mjs";

describe("project-board phase 8 release gate", () => {
  it("passes when provider and worker matrices are both green", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      providerReportPath: "/tmp/provider.json",
      workerReportPath: "/tmp/worker.json",
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision).toMatchObject({
      phase8InstrumentationComplete: true,
      objectiveHandoffComplete: true,
      advisoryProviderWarnings: ["external_dependency", "proof_scope_mismatch"],
      blockingIssues: [],
    });
    expect(report.provider.totalCards).toBe(16);
    expect(report.worker.runtimeBudgetSplitCount).toBe(1);
    expect(report.budget).toMatchObject({
      status: "passed",
      scenarioCount: 4,
      overBudgetBeforeCompactionObserved: true,
      compactionObserved: true,
      cacheReplayObserved: true,
    });
    expect(report.handoff).toMatchObject({
      status: "passed",
      exitCode: 0,
      objectiveGitHandoffObserved: true,
      sourcePathLineageObserved: true,
      cloneContinuationObserved: true,
      firstCloneApplyObserved: true,
    });
    expect(report.pauseResume).toMatchObject({
      status: "not_run",
      observed: false,
      required: false,
    });
    expect(report.pauseResumeUi).toMatchObject({
      status: "not_run",
      observed: false,
      required: false,
    });
    expect(report.startFreshUi).toMatchObject({
      status: "not_run",
      observed: false,
      required: false,
    });
    expect(report.pmReviewUi).toMatchObject({
      status: "not_run",
      observed: false,
      required: false,
    });
    expect(report.sourceClassificationUi).toMatchObject({
      status: "not_run",
      observed: false,
      required: false,
    });
    expect(report.directHelperRetry).toMatchObject({
      status: "not_run",
      observed: false,
      required: false,
    });
    expect(report.freshness.status).toBe("passed");
  });

  it("treats provider warnings as advisory but fails duplicate or timeout regressions", () => {
    const provider = passingProviderReport();
    provider.summary.duplicateTitleCount = 1;
    provider.summary.providerTimeoutObserved = true;
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider,
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Provider matrix reported 1 duplicate title(s).",
        "Provider matrix observed a provider timeout.",
      ]),
    );
  });

  it("fails when worker task actions or product runtime closure regress", () => {
    const worker = passingWorkerReport();
    worker.observations.taskActionProtocolObserved = false;
    worker.observations.productRuntimeBudgetClosureObserved = false;
    worker.gates.taskActionProtocolObserved = false;
    worker.gates.productRuntimeBudgetClosureObserved = false;
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker,
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Worker gate taskActionProtocolObserved was false.",
        "Worker gate productRuntimeBudgetClosureObserved was false.",
        "Worker product runtime-budget closure was not observed.",
        "Worker task-action protocol was not observed.",
      ]),
    );
  });

  it("surfaces stale artifact revision as advisory by default", () => {
    const provider = passingProviderReport();
    provider.sourceRevision.gitHead = "old-provider";
    const worker = passingWorkerReport();
    worker.sourceRevision.gitHead = "old-worker";
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider,
      worker,
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      currentSourceRevision: { gitHead: "new-current", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(report.freshness.status).toBe("passed_with_advisories");
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Provider matrix git head old-provider does not match current head new-current"),
        expect.stringContaining("Worker matrix git head old-worker does not match current head new-current"),
      ]),
    );
  });

  it("can require current-head artifacts for strict release sweeps", () => {
    const provider = passingProviderReport();
    provider.sourceRevision.gitHead = "old-provider";
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider,
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
      requireCurrentHead: true,
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Provider matrix git head old-provider does not match current head abc123456789.",
      ]),
    );
  });

  it("strict release sweeps require a clean current source tree", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      currentSourceRevision: { gitHead: "abc1234567890", dirty: true },
      requireCurrentHead: true,
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Current worktree has tracked uncommitted changes; strict project-board release-gate freshness requires a clean source tree.",
      ]),
    );
  });

  it("can enforce a maximum artifact age", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
      maxArtifactAgeHours: 1,
      completedAt: "2026-05-10T15:15:28.719Z",
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Provider matrix is 2.0h old, exceeding the 1h freshness limit.",
      ]),
    );
  });

  it("fails when prompt-budget compaction or cache replay regresses", () => {
    const budget = passingBudgetReport();
    budget.scenarios.find((scenario) => scenario.name === "large-ledger").plannerLedgerCompactionCount = 0;
    budget.scenarios.find((scenario) => scenario.name === "large-ledger-cache-replay").compactionPromptCount = 1;
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget,
      handoff: passingHandoffReport(),
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Budget gate large-ledger did not compact the prior-card ledger.",
        "Budget gate cache replay made 1 compaction prompt call(s).",
      ]),
    );
  });

  it("fails when objective handoff dogfood is missing or regresses", () => {
    const handoff = passingHandoffReport();
    handoff.exitCode = 1;
    handoff.status = "attention";
    handoff.observations.cloneContinuationObserved = false;
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision).toMatchObject({
      phase8InstrumentationComplete: false,
      objectiveHandoffComplete: false,
    });
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Objective handoff dogfood status was attention.",
        "Objective handoff dogfood exit code was 1.",
        "Objective handoff observation cloneContinuationObserved was false.",
      ]),
    );
  });

  it("can require the opt-in pause/resume live smoke", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      requirePauseResumeLive: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Pause/resume live smoke has not run; run with --run-pause-resume-live to capture no-duplicate-card evidence.",
      ]),
    );
  });

  it("passes the pause/resume lane when the live smoke observed no duplicate cards", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      pauseResume: passingPauseResumeReport(),
      requirePauseResumeLive: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.pauseResumeLiveComplete).toBe(true);
    expect(report.pauseResume).toMatchObject({
      status: "passed",
      required: true,
      observed: true,
      pauseObserved: true,
      resumeObserved: true,
      continuationPromptObserved: true,
      noDuplicateCardsObserved: true,
      pausedCardCount: 2,
      resumedCardCount: 4,
    });
  });

  it("can require focused in-app pause/resume UI evidence separately from worker proof", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      requirePauseResumeUi: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Focused pause/resume UI dogfood has not run; run with --run-pause-resume-ui-live to capture PM Review button and screenshot evidence.",
      ]),
    );
  });

  it("passes focused in-app pause/resume UI evidence without requiring worker proof in that dogfood report", () => {
    const ui = passingPauseResumeUiReport();
    ui.releaseGate.status = "attention";
    ui.releaseGate.notes = ["No worker proof outcome was observed in this focused pass."];
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      pauseResumeUi: ui,
      requirePauseResumeUi: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.pauseResumeUiComplete).toBe(true);
    expect(report.pauseResumeUi).toMatchObject({
      status: "passed",
      required: true,
      observed: true,
      dogfoodReleaseGateStatus: "attention",
      pausedRunStatus: "paused",
      resumedRunStatus: "paused",
      pausedCardCount: 3,
      resumedCardCount: 5,
      duplicateCardRate: 0,
      screenshotCount: 3,
    });
    expect(report.releaseDecision.blockingIssues).toEqual([]);
  });

  it("can require focused in-app Start Fresh UI evidence separately from worker proof", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      requireStartFreshUi: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Focused Start Fresh UI dogfood has not run; run with --run-start-fresh-ui-live to capture abandoned-checkpoint, fresh Draft Inbox, and Superseded history evidence.",
      ]),
    );
  });

  it("passes focused in-app Start Fresh UI evidence when abandoned records are not loaded into the fresh run", () => {
    const ui = passingStartFreshUiReport();
    ui.releaseGate.status = "attention";
    ui.releaseGate.notes = ["No worker proof outcome was observed in this focused pass."];
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      startFreshUi: ui,
      requireStartFreshUi: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.startFreshUiComplete).toBe(true);
    expect(report.startFreshUi).toMatchObject({
      status: "passed",
      required: true,
      observed: true,
      dogfoodReleaseGateStatus: "attention",
      abandonedRunStatus: "abandoned",
      freshRunStatus: "paused",
      abandonedCheckpointCardCount: 3,
      freshCardCount: 4,
      duplicateCardRate: 0,
      loadedPreviousRecords: false,
      supersededHistoryVisible: true,
      supersededHistoryIncludesAbandonedCard: true,
      screenshotCount: 4,
    });
    expect(report.releaseDecision.blockingIssues).toEqual([]);
  });

  it("strict focused UI promotion requires Phase 11, PM Review, and source-classification focused UI reports", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      pauseResumeUi: passingPauseResumeUiReport(),
      requirePauseResumeUi: true,
      requireStartFreshUi: true,
      requirePmReviewUi: true,
      requirePmReviewWork: true,
      requireSourceClassificationUi: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.pauseResumeUi).toMatchObject({ required: true, observed: true, status: "passed" });
    expect(report.startFreshUi).toMatchObject({ required: true, observed: false, status: "not_run" });
    expect(report.pmReviewUi).toMatchObject({ required: true, observed: false, status: "not_run", workRequired: true });
    expect(report.sourceClassificationUi).toMatchObject({ required: true, observed: false, status: "not_run" });
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Focused Start Fresh UI dogfood has not run; run with --run-start-fresh-ui-live to capture abandoned-checkpoint, fresh Draft Inbox, and Superseded history evidence.",
        "Focused PM Review generated-card work dogfood has not run; run with --run-pm-review-work-live to capture ticketization and worker proof evidence.",
        "Focused source-classification UI dogfood has not run; run with --run-source-classification-ui-live to capture ignored-source refresh, reclassification, Add Cards eligibility, and PM Review activation evidence.",
      ]),
    );
  });

  it("strict focused UI promotion passes with Phase 11, PM Review work, and source-classification reports", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      pmReviewProviderFixtures: passingPmReviewProviderFixturesReport(),
      handoff: passingHandoffReport(),
      pauseResumeUi: passingPauseResumeUiReport(),
      startFreshUi: passingStartFreshUiReport(),
      pmReviewUi: passingPmReviewUiReport({ includeWork: true }),
      sourceClassificationUi: passingSourceClassificationUiReport(),
      requirePmReviewProviderFixtures: true,
      requirePauseResumeUi: true,
      requireStartFreshUi: true,
      requirePmReviewUi: true,
      requirePmReviewWork: true,
      requireSourceClassificationUi: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.pauseResumeUi).toMatchObject({ required: true, observed: true, status: "passed" });
    expect(report.startFreshUi).toMatchObject({ required: true, observed: true, status: "passed" });
    expect(report.pmReviewUi).toMatchObject({ required: true, observed: true, status: "passed", workRequired: true, workPassed: true });
    expect(report.releaseDecision).toMatchObject({
      pauseResumeUiComplete: true,
      startFreshUiComplete: true,
      pmReviewUiComplete: true,
      pmReviewWorkComplete: true,
      pmReviewProviderFixturesComplete: true,
      sourceClassificationUiComplete: true,
      nextSlice:
        "Run the opt-in direct-helper retry GMI UI smoke with --run-direct-helper-retry-live --require-direct-helper-retry, then promote source-classification, charter-summary, and proof-judgment retry evidence once all three stay green.",
    });
    expect(report.releaseDecision.blockingIssues).toEqual([]);
  });

  it("focused UI-only gate passes without provider and worker matrix artifacts", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      budget: passingBudgetReport(),
      pmReviewProviderFixtures: passingPmReviewProviderFixturesReport(),
      pmReviewUiVariants: passingPmReviewUiVariantsReport(),
      handoff: passingHandoffReport(),
      pauseResumeUi: passingPauseResumeUiReport(),
      startFreshUi: passingStartFreshUiReport(),
      pmReviewUi: passingPmReviewUiReport({ includeWork: true }),
      sourceClassificationUi: passingSourceClassificationUiReport(),
      requirePmReviewProviderFixtures: true,
      requirePmReviewUiVariants: true,
      requirePauseResumeUi: true,
      requireStartFreshUi: true,
      requirePmReviewUi: true,
      requirePmReviewWork: true,
      requireSourceClassificationUi: true,
      skipProviderWorker: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.provider.status).toBe("not_required");
    expect(report.worker.status).toBe("not_required");
    expect(report.releaseDecision.providerWorkerSkipped).toBe(true);
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toEqual(
      expect.arrayContaining([
        "Provider matrix skipped for focused UI-only release gate.",
        "Worker matrix skipped for focused UI-only release gate.",
      ]),
    );
  });

  it("can require focused PM Review UI activation evidence", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      requirePmReviewUi: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Focused PM Review UI dogfood has not run; run with --run-pm-review-ui-live to capture zero-card report, answer/update, and draft-board activation evidence.",
      ]),
    );
  });

  it("passes focused PM Review UI activation evidence with report, answer/update, and generated cards", () => {
    const ui = passingPmReviewUiReport();
    ui.releaseGate.status = "attention";
    ui.releaseGate.notes = ["No worker proof outcome was observed in this focused pass."];
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      pmReviewUi: ui,
      requirePmReviewUi: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.pmReviewUiComplete).toBe(true);
    expect(report.pmReviewUi).toMatchObject({
      status: "passed",
      required: true,
      observed: true,
      dogfoodReleaseGateStatus: "attention",
      zeroCardReportObserved: true,
      answerUpdateObserved: true,
      reviewQuestionCount: 1,
      answeredQuestionCount: 1,
      sourceConfidence: "high",
      gitState: "git_no_remote",
      activationSurface: "draft_inbox",
      generatedActivationCardCount: 3,
      generatedProposalCardCount: 3,
      generatedDraftCardCount: 3,
      duplicateCardRate: 0,
      screenshotCount: 2,
    });
    expect(report.releaseDecision).toMatchObject({
      nextSlice: "Run the PM Review generated-card work dogfood with --run-pm-review-work-live --require-pm-review-work, then promote that evidence once the ticketize-and-work path stays green.",
    });
    expect(report.releaseDecision.blockingIssues).toEqual([]);
  });

  it("can require focused source-classification UI evidence", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      requireSourceClassificationUi: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.sourceClassificationUi).toMatchObject({ required: true, observed: false, status: "not_run" });
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Focused source-classification UI dogfood has not run; run with --run-source-classification-ui-live to capture ignored-source refresh, reclassification, Add Cards eligibility, and PM Review activation evidence.",
      ]),
    );
  });

  it("passes focused source-classification UI evidence with ignored refresh and PM Review activation", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      pmReviewProviderFixtures: passingPmReviewProviderFixturesReport({ includeLive: true }),
      pmReviewUiVariants: passingPmReviewUiVariantsReport(),
      handoff: passingHandoffReport(),
      pauseResumeUi: passingPauseResumeUiReport(),
      startFreshUi: passingStartFreshUiReport(),
      pmReviewUi: passingPmReviewUiReport({ includeWork: true }),
      sourceClassificationUi: passingSourceClassificationUiReport(),
      requirePauseResumeUi: true,
      requireStartFreshUi: true,
      requirePmReviewUi: true,
      requirePmReviewWork: true,
      requirePmReviewProviderFixtures: true,
      requirePmReviewProviderVariantsLive: true,
      requirePmReviewUiVariants: true,
      requireSourceClassificationUi: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.sourceClassificationUi).toMatchObject({
      status: "passed",
      required: true,
      observed: true,
      dogfoodReleaseGateStatus: "attention",
      targetPath: "docs/gameplay-notes.md",
      ignoredKind: "ignored",
      ignoredClassifiedBy: "user",
      ignoredIncludeInSynthesis: false,
      ignoredVisibleInReview: true,
      ignoredFilterVisible: true,
      ignoredDetailExplainsExclusion: true,
      ignoredElaborateDisabled: true,
      refreshPreservedIgnored: true,
      refreshTitleIncludesPreservation: true,
      refreshCopyIncludesPreservation: true,
      reclassifiedKind: "functional_spec",
      reclassifiedIncludeInSynthesis: true,
      reclassifiedElaborateEnabled: true,
      includedDetailExplainsEligibility: true,
      sourceRefreshSettledBeforePmReview: true,
      activationSurface: "draft_inbox",
      generatedDraftCardCount: 3,
      duplicateCardRate: 0,
      pmReviewTransientRetryCount: 0,
      screenshotCount: 4,
    });
    expect(report.releaseDecision).toMatchObject({
      sourceClassificationUiComplete: true,
      nextSlice:
        "Run the opt-in direct-helper retry GMI UI smoke with --run-direct-helper-retry-live --require-direct-helper-retry, then promote source-classification, charter-summary, and proof-judgment retry evidence once all three stay green.",
    });
    expect(report.releaseDecision.blockingIssues).toEqual([]);
  });

  it("can require project-board direct-helper retry GMI evidence", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      requireDirectHelperRetry: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.directHelperRetry).toMatchObject({ required: true, observed: false, status: "not_run" });
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Project-board direct-helper retry GMI live smoke has not run; run with --run-direct-helper-retry-live to capture source-classification, charter-summary, and proof-judgment UI retry recovery evidence.",
      ]),
    );
  });

  it("passes project-board direct-helper retry evidence for source classification, charter summary, and proof judgment", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      directHelperRetry: passingDirectHelperRetryReport(),
      requireDirectHelperRetry: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.directHelperRetry).toMatchObject({
      status: "passed",
      required: true,
      observed: true,
      scenarioCount: 3,
      sourceClassificationComplete: true,
      charterSummaryComplete: true,
      proofJudgmentComplete: true,
    });
    expect(report.directHelperRetry.sourceClassification.retryEvent).toMatchObject({
      retryAttempt: 1,
      maxRetries: 10,
      retryDelayMs: 1000,
      aggressiveRetries: true,
    });
    expect(report.releaseDecision).toMatchObject({
      directHelperRetryComplete: true,
      nextSlice:
        "Keep the aggressive-retry direct-helper GMI lane green as strict outage-period release proof, and use any future source, charter, or proof-judgment failures to drive the next hardening slice.",
    });
    expect(report.releaseDecision.blockingIssues).toEqual([]);
  });

  it("fails direct-helper retry evidence when the charter-summary scenario is missing", () => {
    const directHelperRetry = passingDirectHelperRetryReport();
    directHelperRetry.scenarios = directHelperRetry.scenarios.filter((scenario) => scenario.scenario !== "charter-summary");
    directHelperRetry.scenarioCount = directHelperRetry.scenarios.length;
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      directHelperRetry,
      requireDirectHelperRetry: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(report.directHelperRetry).toMatchObject({
      required: true,
      observed: true,
      sourceClassificationComplete: true,
      charterSummaryComplete: false,
      proofJudgmentComplete: true,
    });
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["Project-board direct-helper retry smoke did not report the charter-summary scenario."]),
    );
  });

  it("fails direct-helper retry evidence when the proof-judgment scenario is missing", () => {
    const directHelperRetry = passingDirectHelperRetryReport();
    directHelperRetry.scenarios = directHelperRetry.scenarios.filter((scenario) => scenario.scenario !== "proof-judgment");
    directHelperRetry.scenarioCount = directHelperRetry.scenarios.length;
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      directHelperRetry,
      requireDirectHelperRetry: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(report.directHelperRetry).toMatchObject({
      required: true,
      observed: true,
      sourceClassificationComplete: true,
      charterSummaryComplete: true,
      proofJudgmentComplete: false,
    });
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["Project-board direct-helper retry smoke did not report the proof-judgment scenario."]),
    );
  });

  it("requires PM Review generated-card ticketization/work evidence when requested", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      pmReviewUi: passingPmReviewUiReport(),
      requirePmReviewUi: true,
      requirePmReviewWork: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["Focused PM Review generated-card work dogfood did not report the pm-review-generated-card-work step."]),
    );
  });

  it("passes PM Review generated-card ticketization/work evidence when requested", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      pmReviewUi: passingPmReviewUiReport({ includeWork: true }),
      requirePmReviewUi: true,
      requirePmReviewWork: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.pmReviewWorkComplete).toBe(true);
    expect(report.pmReviewUi).toMatchObject({
      workRequired: true,
      workObserved: true,
      workPassed: true,
      workRunStatus: "completed",
      workProofReviewStatus: "done",
      workProofRecommendedAction: "close",
      workMeaningfulChangedPathCount: 2,
      workTaskActionCount: 3,
      workTaskActionProtocolSatisfied: true,
      workTaskActionTerminalActionCount: 2,
      workFollowUpCardCount: 0,
    });
    expect(report.releaseDecision).toMatchObject({
      nextSlice: "Run the full focused UI live sweep with strict PM Review terminal task-action enforcement, then move to the next recoverability slice outside focused UI hardening once it stays green.",
    });
    expect(report.releaseDecision.blockingIssues).toEqual([]);
  });

  it("blocks PM Review generated-card task actions that lack a terminal protocol action", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      pmReviewUi: passingPmReviewUiReport({
        includeWork: true,
        workTaskActions: {
          count: 2,
          countsByAction: { task_show: 1, task_heartbeat: 1 },
          heartbeatCount: 1,
          proofActionCount: 0,
          completeActionCount: 0,
          blockActionCount: 0,
          terminalActionCount: 0,
          terminalActionNames: [],
          onlyContextAndHeartbeat: true,
          protocolSatisfied: false,
          protocolMissing: ["terminal_task_action", "proof_block_complete_followup_or_handoff"],
        },
      }),
      requirePmReviewUi: true,
      requirePmReviewWork: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.pmReviewUi).toMatchObject({
      workTaskActionCount: 2,
      workTaskActionCountsByAction: { task_show: 1, task_heartbeat: 1 },
      workTaskActionProtocolSatisfied: false,
      workTaskActionProtocolMissing: ["terminal_task_action", "proof_block_complete_followup_or_handoff"],
      workTaskActionTerminalActionCount: 0,
    });
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("did not satisfy the full progress/proof terminal protocol"),
      ]),
    );
    expect(report.releaseDecision.advisoryIssues).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("did not satisfy the full progress/proof terminal protocol"),
      ]),
    );
    expect(report.releaseDecision.nextSlice).toBe(
      "Make PM Review generated-card workers reliably emit terminal task_report_proof/task_complete/task_block/task_create_followup/task_report_handoff actions, then make the focused work lane's terminal protocol check strict.",
    );
  });

  it("can require PM Review provider fixture gate coverage", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      requirePmReviewProviderFixtures: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.pmReviewProviderFixtures).toMatchObject({
      status: "not_run",
      required: true,
      deterministicScenarioCount: 0,
    });
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "PM Review provider fixture gate has not run; run test:project-board-pm-review-provider-fixtures-gate to capture constrained, conflict, ignored-source, and recommendation-scope coverage.",
      ]),
    );
  });

  it("reports PM Review provider fixture and live-variant coverage", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      pmReviewProviderFixtures: passingPmReviewProviderFixturesReport({ includeLive: true }),
      handoff: passingHandoffReport(),
      pauseResumeUi: passingPauseResumeUiReport(),
      startFreshUi: passingStartFreshUiReport(),
      pmReviewUi: passingPmReviewUiReport({ includeWork: true }),
      requirePauseResumeUi: true,
      requireStartFreshUi: true,
      requirePmReviewUi: true,
      requirePmReviewWork: true,
      requirePmReviewProviderFixtures: true,
      requirePmReviewProviderVariantsLive: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.pmReviewProviderFixtures).toMatchObject({
      status: "passed",
      required: true,
      deterministicStatus: "passed",
      deterministicScenarioCount: 4,
      constrainedReadiness: true,
      sourceConflict: true,
      ignoredSourceExclusion: true,
      recommendationScope: true,
      zeroCardContract: true,
      activationMetadata: true,
      liveStatus: "passed",
      liveObserved: true,
      liveRequired: true,
    });
    expect(report.releaseDecision).toMatchObject({
      pmReviewProviderFixturesComplete: true,
      pmReviewProviderLiveVariantsComplete: true,
      nextSlice: "Add focused in-app PM Review UI variant dogfood for constrained-readiness, source-conflict, ignored-source, and recommendation-scope reports.",
    });
    expect(report.releaseDecision.blockingIssues).toEqual([]);
  });

  it("can require PM Review UI variant renderer coverage", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      handoff: passingHandoffReport(),
      requirePmReviewUiVariants: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("attention");
    expect(phase8ReleaseGatePassed(report)).toBe(false);
    expect(report.pmReviewUiVariants).toMatchObject({
      status: "not_run",
      required: true,
      deterministicScenarioCount: 0,
    });
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "PM Review UI variant gate has not run; run test:project-board-pm-review-ui-variants-gate to verify constrained, conflict, ignored-source, and recommendation report rendering.",
      ]),
    );
  });

  it("reports PM Review UI variant renderer coverage after live provider variants", () => {
    const report = buildProjectBoardPhase8ReleaseGateReport({
      provider: passingProviderReport(),
      worker: passingWorkerReport(),
      budget: passingBudgetReport(),
      pmReviewProviderFixtures: passingPmReviewProviderFixturesReport({ includeLive: true }),
      pmReviewUiVariants: passingPmReviewUiVariantsReport(),
      handoff: passingHandoffReport(),
      pauseResumeUi: passingPauseResumeUiReport(),
      startFreshUi: passingStartFreshUiReport(),
      pmReviewUi: passingPmReviewUiReport({ includeWork: true }),
      requirePauseResumeUi: true,
      requireStartFreshUi: true,
      requirePmReviewUi: true,
      requirePmReviewWork: true,
      requirePmReviewProviderFixtures: true,
      requirePmReviewProviderVariantsLive: true,
      requirePmReviewUiVariants: true,
      currentSourceRevision: { gitHead: "abc1234567890", dirty: false },
    });

    expect(report.status).toBe("passed");
    expect(phase8ReleaseGatePassed(report)).toBe(true);
    expect(report.pmReviewUiVariants).toMatchObject({
      status: "passed",
      required: true,
      deterministicStatus: "passed",
      deterministicScenarioCount: 4,
      constrainedReadiness: true,
      sourceConflict: true,
      ignoredSourceExclusion: true,
      recommendationScope: true,
      rendererSections: true,
      recommendationBanner: true,
    });
    expect(report.releaseDecision).toMatchObject({
      pmReviewProviderLiveVariantsComplete: true,
      pmReviewUiVariantsComplete: true,
      nextSlice:
        "Run the focused source-classification UI dogfood with --run-source-classification-ui-live --require-source-classification-ui, then promote ignored-source refresh/reclassification evidence once it stays green.",
    });
    expect(report.releaseDecision.blockingIssues).toEqual([]);
  });
});

function passingProviderReport() {
  return {
    status: "passed_with_worker_pass_skipped",
    model: "zai-org/GLM-5.1-FP8",
    reasoning: "product-default",
    generatedAt: "2026-05-10T13:15:28.719Z",
    sourceRevision: { gitHead: "abc1234567890", dirty: false },
    scenarios: [
      { name: "short spaceship synthesis", status: "passed", durationMs: 65_418, cardCount: 5, proofReadyCardCount: 5, duplicateTitleCount: 0, clarificationQuestionCount: 4 },
      { name: "starship additive feature cards", status: "passed", durationMs: 110_779, cardCount: 4, proofReadyCardCount: 4, duplicateTitleCount: 0, clarificationQuestionCount: 7 },
      { name: "small simple project", status: "passed", durationMs: 79_018, cardCount: 7, proofReadyCardCount: 7, duplicateTitleCount: 0, clarificationQuestionCount: 6 },
    ],
    summary: {
      scenarioCount: 3,
      totalDurationMs: 255_215,
      totalCards: 16,
      totalProofReadyCards: 16,
      duplicateTitleCount: 0,
      warningCodes: ["external_dependency", "proof_scope_mismatch"],
      errorCodes: [],
      providerTimeoutObserved: false,
    },
  };
}

function passingWorkerReport() {
  return {
    status: "passed",
    generatedAt: "2026-05-10T13:36:29.120Z",
    sourceRevision: { gitHead: "abc1234567890", dirty: false },
    dogfoodExitCode: 0,
    observations: {
      dogfoodStatus: "passed",
      releaseGateStatus: "passed",
      runStatus: "completed",
      taskState: "needs_info",
      finalCardStatus: "blocked",
      ticketizedCardTitle: "Runtime split progress marker",
      proofReviewStatus: "needs_follow_up",
      proofRecommendedAction: "follow_up",
      proofEvidenceQuality: "mixed",
      proofConfidence: 0.95,
      proofActionIntegrityIssueCount: 0,
      taskActionProtocolObserved: true,
      taskActionCount: 2,
      taskActionCountsByAction: { task_heartbeat: 1, task_report_proof: 1 },
      meaningfulChangedPathCount: 2,
      runtimeBudgetExceeded: true,
      runtimeBudgetMaxMs: 60_000,
      runtimeBudgetElapsedMs: 60_994,
      harnessTimedOutFirst: false,
      productRuntimeBudgetClosureObserved: true,
      runtimeBudgetSplitCount: 1,
      runtimeSplitOutcomeActionable: true,
      splitDecisionObserved: true,
      splitDecisionAction: "approve_split",
      splitDecisionAfterStatus: "approved",
      followUpCardCount: 1,
      providerTimeoutObserved: false,
      notes: ["Worker execution stopped at a bounded runtime with partial proof for review."],
    },
    gates: {
      firstCardObserved: true,
      firstTicketizedTaskObserved: true,
      proofOutcomeObserved: true,
      proofOutcomeActionable: true,
      proofActionIntegrityAcceptable: true,
      taskActionProtocolObserved: true,
      runtimeSplitOutcomeActionable: true,
      productRuntimeBudgetClosureObserved: true,
      workerPartialProgressActionable: true,
    },
  };
}

function passingBudgetReport() {
  return {
    generatedAt: "2026-05-10T13:40:29.120Z",
    purpose: "Deterministic project-board planner prompt-budget regression gate.",
    scenarios: [
      {
        name: "small",
        expectedCompaction: false,
        expectedCacheHit: false,
        sourceCount: 1,
        resumeRecordCount: 0,
        promptBudgetStatus: "within_budget",
        promptBudgetWarningCount: 0,
        plannerLedgerCompactionCount: 0,
        plannerLedgerCompactionCacheHitCount: 0,
        compactionPromptCount: 0,
        plannerPromptCount: 1,
        maxPromptBudgetUtilization: 0.18,
        cardCount: 1,
      },
      {
        name: "medium",
        expectedCompaction: false,
        expectedCacheHit: false,
        sourceCount: 8,
        resumeRecordCount: 0,
        promptBudgetStatus: "within_budget",
        promptBudgetWarningCount: 0,
        plannerLedgerCompactionCount: 0,
        plannerLedgerCompactionCacheHitCount: 0,
        compactionPromptCount: 0,
        plannerPromptCount: 1,
        maxPromptBudgetUtilization: 0.42,
        cardCount: 1,
      },
      {
        name: "large-ledger",
        expectedCompaction: true,
        expectedCacheHit: false,
        sourceCount: 1,
        resumeRecordCount: 1500,
        promptBudgetStatus: "within_budget",
        rawPromptBudgetStatus: "soft_prompt_budget_exceeded",
        promptBudgetWarningCount: 0,
        plannerLedgerCompactionCount: 1,
        plannerLedgerCompactionCacheHitCount: 0,
        compactionPromptCount: 1,
        plannerPromptCount: 1,
        maxPromptBudgetUtilization: 0.34,
        cardCount: 1,
      },
      {
        name: "large-ledger-cache-replay",
        expectedCompaction: true,
        expectedCacheHit: true,
        sourceCount: 1,
        resumeRecordCount: 1501,
        promptBudgetStatus: "within_budget",
        rawPromptBudgetStatus: "soft_prompt_budget_exceeded",
        promptBudgetWarningCount: 0,
        plannerLedgerCompactionCount: 1,
        plannerLedgerCompactionCacheHitCount: 1,
        compactionPromptCount: 0,
        plannerPromptCount: 1,
        maxPromptBudgetUtilization: 0.34,
        cardCount: 1,
      },
    ],
  };
}

function passingPmReviewProviderFixturesReport(options = {}) {
  const scenarioNames = [
    "ready_with_constraints",
    "source_conflict_needs_answer",
    "ignored_source_excluded",
    "recommendation_scope_ready_for_activation",
  ];
  return {
    status: "passed",
    generatedAt: "2026-05-10T13:41:29.120Z",
    sourceRevision: { gitHead: "abc1234567890", dirty: false },
    deterministic: {
      status: "passed",
      command: "pnpm run test:project-board-pm-review-provider-fixtures",
      exitCode: 0,
      scenarioNames,
      coverage: {
        constrainedReadiness: true,
        sourceConflict: true,
        ignoredSourceExclusion: true,
        recommendationScope: true,
        zeroCardContract: true,
        activationMetadata: true,
      },
    },
    liveVariants: options.includeLive
      ? {
          status: "passed",
          required: true,
          command: "pnpm run test:project-board-pm-review-provider-variants:live",
          exitCode: 0,
          scenarioNames,
        }
      : {
          status: "not_run",
          required: false,
          scenarioNames,
        },
  };
}

function passingPmReviewUiVariantsReport() {
  const scenarioNames = [
    "ready_with_constraints",
    "source_conflict_needs_answer",
    "ignored_source_excluded",
    "recommendation_scope_ready_for_activation",
  ];
  return {
    status: "passed",
    generatedAt: "2026-05-10T13:45:29.120Z",
    sourceRevision: { gitHead: "abc1234567890", dirty: false },
    deterministic: {
      status: "passed",
      command: "pnpm run test:project-board-pm-review-ui-variants",
      exitCode: 0,
      scenarioNames,
      coverage: {
        constrainedReadiness: true,
        sourceConflict: true,
        ignoredSourceExclusion: true,
        recommendationScope: true,
        rendererSections: true,
        recommendationBanner: true,
      },
    },
  };
}

function passingHandoffReport() {
  return {
    status: "passed",
    generatedAt: "2026-05-10T13:42:29.120Z",
    durationMs: 1_850,
    command: "pnpm run test:project-board-two-clone",
    exitCode: 0,
    outputPath: "/tmp/latest-handoff.json",
    observations: {
      objectiveGitHandoffObserved: true,
      sourcePathLineageObserved: true,
      cloneContinuationObserved: true,
      firstCloneApplyObserved: true,
    },
  };
}

function passingPauseResumeReport() {
  return {
    status: "passed",
    generatedAt: "2026-05-10T13:45:29.120Z",
    durationMs: 98_250,
    model: "zai-org/GLM-5.1-FP8",
    fixture: "provider-level live Pi planner-batch pause/resume",
    observations: {
      pauseObserved: true,
      pauseCheckpointObserved: true,
      resumeObserved: true,
      continuationPromptObserved: true,
      noDuplicateCardsObserved: true,
      pausedCardCount: 2,
      resumedCardCount: 4,
      pausedCandidateRecordCount: 2,
      resumedCandidateRecordCount: 4,
      renderedCardDuplicateFilterCount: 0,
    },
  };
}

function passingPauseResumeUiReport() {
  return {
    status: "passed",
    completedAt: "2026-05-10T13:48:29.120Z",
    runRoot: "/tmp/project-board-dogfood/runs/focused-pause-resume",
    pauseResumeDogfoodMode: true,
    steps: [
      { name: "pause-resume-start", runId: "run-paused" },
      {
        name: "pause-resume-planning-ui",
        pausedRunId: "run-paused",
        resumedRunId: "run-resumed",
        retryOfRunId: "run-paused",
        pausedRunStatus: "paused",
        resumedRunStatus: "paused",
        pausedCardCount: 3,
        resumedCardCount: 5,
        duplicateCardCount: 0,
        duplicateCardRate: 0,
        screenshots: {
          running: readableScreenshot("screenshots/pause-resume-01-running.png"),
          paused: readableScreenshot("screenshots/pause-resume-02-paused.png"),
          resumed: readableScreenshot("screenshots/pause-resume-03-resumed-draft-inbox.png"),
        },
      },
    ],
    releaseGate: {
      status: "attention",
      notes: ["No worker proof outcome was observed in this focused pass."],
    },
  };
}

function passingStartFreshUiReport() {
  return {
    status: "passed",
    completedAt: "2026-05-10T13:52:29.120Z",
    runRoot: "/tmp/project-board-dogfood/runs/focused-start-fresh",
    startFreshDogfoodMode: true,
    steps: [
      { name: "start-fresh-start", runId: "run-abandoned" },
      {
        name: "start-fresh-planning-ui",
        abandonedRunId: "run-abandoned",
        freshRunId: "run-fresh",
        retryOfRunId: "run-abandoned",
        abandonedRunStatus: "abandoned",
        freshRunStatus: "paused",
        freshRunStatusBeforeCleanup: "running",
        abandonedCheckpointCardCount: 3,
        freshCardCount: 4,
        duplicateCardCount: 0,
        duplicateCardRate: 0,
        loadedPreviousRecords: false,
        abandonedProgressiveRecordCount: 8,
        freshProgressiveRecordCount: 5,
        overlappingCardIdCount: 0,
        overlappingSourceIdCount: 0,
        supersededHistoryVisible: true,
        supersededHistoryIncludesAbandonedCard: true,
        screenshots: {
          running: readableScreenshot("screenshots/start-fresh-01-running.png"),
          paused: readableScreenshot("screenshots/start-fresh-02-paused.png"),
          fresh: readableScreenshot("screenshots/start-fresh-03-fresh-draft-inbox.png"),
          supersededHistory: readableScreenshot("screenshots/start-fresh-04-superseded-history.png"),
        },
      },
    ],
    releaseGate: {
      status: "attention",
      notes: ["No worker proof outcome was observed in this focused pass."],
    },
  };
}

function passingPmReviewUiReport(options = {}) {
  const steps = [
    {
      name: "pm-review-activation-ui",
      boardId: "board-pm-review",
      reviewRunId: "run-review",
      reviewRunStatus: "succeeded",
      reviewProposalId: "proposal-review",
      zeroCardReportObserved: true,
      reviewQuestionCount: 1,
      answeredQuestionCount: 1,
      answerUpdateObserved: true,
      updateRunId: "run-review-updated",
      sourceConfidence: "high",
      sourceConfidenceNoteCount: 2,
      gitState: "git_no_remote",
      gitStateNoteCount: 1,
      readiness: "ready",
      blockingQuestionCount: 1,
      riskCount: 1,
      sourceConflictCount: 1,
      sourceAuthorityNoteCount: 1,
      cardGenerationConstraintCount: 1,
      recommendedActivationScopePresent: true,
      reportUiCoverage: {
        recommendedNextStep: true,
        sourceConfidence: true,
        gitState: true,
        blockingQuestions: true,
        risks: true,
        sourceConflicts: true,
        sourceAuthority: true,
        cardGenerationConstraints: true,
      },
      activationRunId: "run-activation",
      activationRunStatus: "paused",
      activationRunRetryOfRunId: "run-review-updated",
      activationSurface: "draft_inbox",
      generatedActivationCardCount: 3,
      generatedProposalCardCount: 3,
      generatedDraftCardCount: 3,
      duplicateCardCount: 0,
      duplicateCardRate: 0,
      screenshots: {
        report: readableScreenshot("screenshots/pm-review-01-lightweight-report.png"),
        generatedCards: readableScreenshot("screenshots/pm-review-02-generated-cards.png"),
      },
    },
  ];
  if (options.includeWork) {
    steps.push({
      name: "pm-review-generated-card-work",
      boardId: "board-pm-review",
      cardId: "card-generated-1",
      title: "Implement generated app shell",
      taskId: "task-generated-1",
      preparedRunId: "run-work-1",
      runId: "run-work-1",
      runStatus: "completed",
      taskState: "done",
      proofReview: {
        reviewer: "ambient_pi",
        status: "done",
        recommendedAction: "close",
        confidence: 0.88,
        evidenceQuality: "strong",
      },
      meaningfulChangedPathCount: 2,
      meaningfulChangedPaths: ["src/app.ts", "test/app.test.ts"],
      taskActions: options.workTaskActions ?? {
        count: 3,
        countsByAction: { task_heartbeat: 1, task_report_proof: 1, task_complete: 1 },
        heartbeatCount: 1,
        proofActionCount: 1,
        completeActionCount: 1,
        terminalActionCount: 2,
        terminalActionNames: ["task_report_proof", "task_complete"],
        protocolSatisfied: true,
        protocolMissing: [],
      },
      followUpCardCount: 0,
    });
  }
  return {
    status: "passed",
    completedAt: "2026-05-10T13:56:29.120Z",
    runRoot: "/tmp/project-board-dogfood/runs/focused-pm-review",
    pmReviewActivationDogfoodMode: true,
    pmReviewWorkCardDogfoodMode: Boolean(options.includeWork),
    steps,
    releaseGate: {
      status: "attention",
      notes: ["No worker proof outcome was observed in this focused pass."],
    },
  };
}

function passingSourceClassificationUiReport() {
  return {
    status: "passed",
    completedAt: "2026-05-10T14:06:29.120Z",
    runRoot: "/tmp/project-board-dogfood/runs/focused-source-classification-ui",
    sourceClassificationUiDogfoodMode: true,
    steps: [
      {
        name: "source-classification-ui",
        boardId: "board-source-classification",
        targetPath: "docs/gameplay-notes.md",
        originalKind: "functional_spec",
        ignoredKind: "ignored",
        ignoredClassifiedBy: "user",
        ignoredIncludeInSynthesis: false,
        ignoredVisibleInReview: true,
        ignoredFilterVisible: true,
        ignoredDetailExplainsExclusion: true,
        ignoredElaborateDisabled: true,
        refreshPreservedIgnored: true,
        refreshTitleIncludesPreservation: true,
        refreshCopyIncludesPreservation: true,
        reclassifiedKind: "functional_spec",
        reclassifiedIncludeInSynthesis: true,
        reclassifiedElaborateEnabled: true,
        includedDetailExplainsEligibility: true,
        sourceRefreshSettledBeforePmReview: true,
        latestSourceRunStatusBeforePmReview: "succeeded",
        latestSourceRunStageBeforePmReview: "sources_persisted",
        screenshots: {
          initial: readableScreenshot("screenshots/source-classification-01-initial.png"),
          ignored: readableScreenshot("screenshots/source-classification-02-ignored.png"),
          refreshed: readableScreenshot("screenshots/source-classification-03-refreshed.png"),
          included: readableScreenshot("screenshots/source-classification-04-included.png"),
        },
      },
      {
        name: "pm-review-activation-ui",
        boardId: "board-source-classification",
        activationRunId: "run-activation",
        activationRunStatus: "paused",
        activationSurface: "draft_inbox",
        generatedActivationCardCount: 3,
        generatedProposalCardCount: 3,
        generatedDraftCardCount: 3,
        duplicateCardCount: 0,
        duplicateCardRate: 0,
        transientRetryCount: 0,
        screenshots: {
          report: readableScreenshot("screenshots/source-classification-05-report.png"),
          generatedCards: readableScreenshot("screenshots/source-classification-06-generated-cards.png"),
        },
      },
    ],
    releaseGate: {
      status: "attention",
      notes: ["No worker proof outcome was observed in this focused pass."],
    },
  };
}

function passingDirectHelperRetryReport() {
  return {
    status: "passed",
    generatedAt: "2026-05-10T14:16:29.120Z",
    scenarioCount: 3,
    targets: ["source-classification", "charter-summary", "proof-judgment"],
    scenarios: [
      {
        status: "passed",
        scenario: "source-classification",
        providerId: "gmi-cloud",
        providerLabel: "GMI Cloud",
        model: "zai-org/GLM-5.1-FP8",
        boardId: "board-direct-helper-source",
        runRoot: "/tmp/project-board-direct-helper-retry/runs/source-classification",
        sourceCount: 5,
        latestRunStatus: "succeeded",
        latestRunStage: "sources_persisted",
        failpointTriggered: true,
        failpointClosedByClient: true,
        failpointChatCompletionCount: 1,
        chatCompletionCount: 3,
        forwardedChatCompletionCount: 2,
        observedOperations: ["source-classification", "source-classification", "source-classification"],
        retryEvent: passingDirectHelperRetryEvent("Retrying Pi source classification", "source_classification"),
      },
      {
        status: "passed",
        scenario: "charter-summary",
        providerId: "gmi-cloud",
        providerLabel: "GMI Cloud",
        model: "zai-org/GLM-5.1-FP8",
        boardId: "board-direct-helper-charter",
        runRoot: "/tmp/project-board-direct-helper-retry/runs/charter-summary",
        sourceCount: 5,
        latestRunStatus: "running",
        latestRunStage: "board_synthesis",
        charterSummaryApplied: true,
        failpointTriggered: true,
        failpointClosedByClient: true,
        failpointChatCompletionCount: 2,
        chatCompletionCount: 4,
        forwardedChatCompletionCount: 3,
        deterministicSetupChatCompletionCount: 1,
        observedOperations: ["source-classification", "charter-summary", "charter-summary", "unknown"],
        charterSummaryEvent: {
          title: "Applied Pi charter project summary",
          stage: "charter_summary",
          summary: "Updated the active charter project summary with Ambient/Pi grounded project-shape context.",
        },
        retryEvent: passingDirectHelperRetryEvent("Retrying Pi charter summary", "charter_summary"),
      },
      {
        status: "passed",
        scenario: "proof-judgment",
        providerId: "gmi-cloud",
        providerLabel: "GMI Cloud",
        model: "zai-org/GLM-5.1-FP8",
        boardId: "board-direct-helper-proof",
        cardId: "card-direct-helper-proof",
        runId: "run-direct-helper-proof",
        runRoot: "/tmp/project-board-direct-helper-retry/runs/proof-judgment",
        sourceCount: 0,
        proofJudgmentApplied: true,
        proofReviewReviewer: "ambient_pi",
        proofReviewStatus: "done",
        proofReviewRecommendedAction: "close",
        proofReviewEvidenceQuality: "strong",
        proofReviewConfidence: 0.91,
        failpointTriggered: true,
        failpointClosedByClient: true,
        failpointChatCompletionCount: 1,
        chatCompletionCount: 2,
        forwardedChatCompletionCount: 1,
        observedOperations: ["proof-judgment", "proof-judgment"],
        retryEvent: passingDirectHelperRetryEvent("Retrying Pi proof judgment", "card_run_progress"),
      },
    ],
  };
}

function passingDirectHelperRetryEvent(title, stage) {
  return {
    title,
    stage,
    summary: "Transient Ambient/Pi direct-helper failure; retrying attempt 1/10 after 1,000ms.",
    transientRetry: true,
    aggressiveRetries: true,
    retryAttempt: 1,
    maxRetries: 10,
    retryDelayMs: 1000,
    error: "Ambient project-board direct-helper stream stalled after 12,000ms without model content (0 response characters received).",
    responseCharCount: 0,
  };
}

function readableScreenshot(path) {
  return {
    path,
    width: 3440,
    height: 2240,
    nonBlackRatio: 0.99,
    distinctColorCount: 128,
  };
}
