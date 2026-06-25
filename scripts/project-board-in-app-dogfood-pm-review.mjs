import { snapshotHarnessWorkspace } from "./harness-trace-artifacts.mjs";
import {
  clickButton,
  clickProjectBoardReviewTab,
  delay,
  evaluate,
  invoke,
  invokeDetached,
  readSourceClassificationUiState,
  selectSourceInReview,
  setSourceKindFromUi,
  waitFor,
  waitForState,
} from "./project-board-in-app-dogfood-cdp-helpers.mjs";
import {
  collectVisualProofArtifacts,
  isReadableVisualProofArtifact,
  meaningfulProofChangedPaths,
  taskActionObservation,
} from "./project-board-in-app-dogfood-proof-helpers.mjs";
import {
  answerForSpaceshipQuestion,
  boardSynthesisCards,
  duplicateTitleMetrics,
  isTransientAmbientDogfoodError,
  projectBoardSourceKind,
  selectDogfoodExecutionCard,
  sourceForStableKey,
} from "./project-board-in-app-dogfood-scenario-helpers.mjs";
import { requiresVisualProof } from "./project-board-dogfood-proof.mjs";

export function createProjectBoardPmReviewDogfood(deps) {
  const {
    assert,
    captureDogfoodScreenshot,
    currentBoard,
    latestRunForBoard,
    observations,
    pauseRunningSynthesisFromUi,
    pmReviewWorkCardDogfoodMode,
    projectRoot,
    readOrchestrationBoardFromStore,
    requireTaskActions,
    setPreparedWorkspaceSnapshot,
    startAgentRun,
    startRefinement,
    waitForCardProofReview,
    waitForLatestPendingProposal,
    waitForPlanningRunStart,
    waitForPreparedOrStartedRun,
    waitForTerminalRun,
  } = deps;

  async function runPmReviewActivationDogfood(cdp, boardId) {
    const autoDispatch = await invoke(cdp, "setOrchestrationAutoDispatchEnabled", { enabled: false }).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    const transientRetries = [];
    await clickProjectBoardReviewTab(cdp);
    let board = await currentBoard(cdp);
    const previousRunId = latestRunForBoard(board, boardId)?.id;
    const previousProposalId = board.proposals.find((proposal) => proposal.status === "pending")?.id;
    const reviewResult = await startPmReviewRefinementWithTransientRetries(cdp, {
      boardId,
      mode: "charter_review",
      previousRunId,
      previousProposalId,
      startLabel: "lightweight PM Review charter-review start",
      proposalLabel: "lightweight PM Review report proposal",
      startTimeoutMs: Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PM_REVIEW_START_TIMEOUT_MS || 300_000),
      transientRetries,
    });
    const reviewStarted = reviewResult.started;
    let reportProposal = reviewResult.proposal;
    assert(reviewStarted.run?.id, "Expected focused PM Review dogfood to start a lightweight charter-review run.");
    assert(reportProposal.reviewReport, "Expected lightweight PM Review proposal to include a typed reviewReport.");
    assert(
      reportProposal.cards.length === 0,
      `Expected lightweight PM Review report to generate zero proposal cards, got ${reportProposal.cards.length}.`,
    );
    assert(
      reportProposal.reviewReport.sourceConfidence !== "unknown",
      "Expected live PM Review report to include non-unknown source confidence.",
    );
    assert(reportProposal.reviewReport.gitState !== "unknown", "Expected live PM Review report to include a concrete Git state.");
    const initialReviewQuestionCount = reportProposal.questions.length;

    await clickProjectBoardReviewTab(cdp);
    await waitFor(
      cdp,
      () =>
        document.body.innerText.includes("Source confidence:") &&
        document.body.innerText.includes("Git state:") &&
        [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Generate Draft Board") && !button.disabled),
      "lightweight PM Review report UI",
      90_000,
    );
    let reportUiCoverage = await evaluate(
      cdp,
      `(() => {
      const text = document.body.innerText || "";
      return {
        recommendedNextStep: text.includes("Recommended next step:"),
        sourceConfidence: text.includes("Source confidence:"),
        gitState: text.includes("Git state:"),
        blockingQuestions: text.includes("Blocking questions"),
        risks: text.includes("Risks"),
        sourceConflicts: text.includes("Source conflicts"),
        sourceAuthority: text.includes("Source authority"),
        cardGenerationConstraints: text.includes("Card generation constraints")
      };
    })()`,
    );
    const reportScreenshot = await captureDogfoodScreenshot(cdp, "pm-review-01-lightweight-report.png");

    let updatedProposal;
    let updateStarted;
    let answeredQuestionCount = 0;
    if (reportProposal.questions.length > 0) {
      for (const [index, question] of reportProposal.questions.entries()) {
        await invoke(cdp, "answerProjectBoardSynthesisProposalQuestion", {
          proposalId: reportProposal.id,
          questionIndex: index,
          answer: answerForSpaceshipQuestion(question),
        });
      }
      answeredQuestionCount = reportProposal.questions.length;
      await clickProjectBoardReviewTab(cdp);
      await waitFor(
        cdp,
        () =>
          [...document.querySelectorAll("button")].some(
            (button) => button.textContent?.includes("Update Charter Review") && !button.disabled,
          ),
        "Update Charter Review button after answering PM Review questions",
        60_000,
      );
      const beforeUpdateRunId = latestRunForBoard(await currentBoard(cdp), boardId)?.id;
      await clickButton(cdp, "Update Charter Review", 60_000);
      const updateResult = await startPmReviewRefinementWithTransientRetries(cdp, {
        boardId,
        proposalId: reportProposal.id,
        previousRunId: beforeUpdateRunId,
        previousProposalId: reportProposal.id,
        startLabel: "answer-updated lightweight PM Review start",
        proposalLabel: "answer-updated lightweight PM Review proposal",
        transientRetries,
        alreadyStarted: true,
      });
      updateStarted = updateResult.started;
      updatedProposal = updateResult.proposal;
      assert(updatedProposal.reviewReport, "Expected updated lightweight PM Review proposal to include a typed reviewReport.");
      assert(
        updatedProposal.cards.length === 0,
        `Expected updated lightweight PM Review report to keep zero proposal cards, got ${updatedProposal.cards.length}.`,
      );
      reportProposal = updatedProposal;
    }

    await clickProjectBoardReviewTab(cdp);
    await waitFor(
      cdp,
      () =>
        [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Generate Draft Board") && !button.disabled),
      "Generate Draft Board button",
      60_000,
    );
    reportUiCoverage = await evaluate(
      cdp,
      `(() => {
      const text = document.body.innerText || "";
      return {
        recommendedNextStep: text.includes("Recommended next step:"),
        sourceConfidence: text.includes("Source confidence:"),
        gitState: text.includes("Git state:"),
        blockingQuestions: text.includes("Blocking questions"),
        risks: text.includes("Risks"),
        sourceConflicts: text.includes("Source conflicts"),
        sourceAuthority: text.includes("Source authority"),
        cardGenerationConstraints: text.includes("Card generation constraints")
      };
    })()`,
    );
    const beforeActivationRunId = latestRunForBoard(await currentBoard(cdp), boardId)?.id;
    await clickButton(cdp, "Generate Draft Board", 60_000);
    const activationStarted = await waitForPlanningRunStart(
      cdp,
      boardId,
      beforeActivationRunId,
      "PM Review activation board-synthesis start",
    );
    assert(activationStarted.run?.id, "Expected Generate Draft Board to start a board-synthesis run.");

    const activationProgress = await waitForState(
      cdp,
      async () => {
        const next = await currentBoard(cdp);
        const run = next.synthesisRuns.find((candidate) => candidate.id === activationStarted.run.id) ?? latestRunForBoard(next, boardId);
        if (run?.status === "failed") {
          throw new Error(`PM Review activation synthesis failed: ${run.error || run.events?.at(-1)?.summary || "unknown error"}`);
        }
        const appliedProposal = [...(next.proposals ?? [])].find(
          (candidate) => candidate.id !== reportProposal.id && candidate.status === "applied" && candidate.cards.length > 0,
        );
        const cards = boardSynthesisCards(next);
        const terminal = run && run.status !== "running" && run.status !== "pause_requested";
        if (cards.length > 0 || terminal) return { board: next, run, proposal: appliedProposal, cards, terminal };
        return undefined;
      },
      "PM Review activation Draft Inbox rendering",
      Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PM_REVIEW_ACTIVATION_TIMEOUT_MS || 420_000),
    );
    const activationSurface = "draft_inbox";
    const generatedCards = activationProgress.cards;
    assert(generatedCards.length > 0, "Expected PM Review activation to render at least one generated Draft Inbox card.");
    assert(
      activationProgress.proposal?.status === "applied",
      "Expected PM Review activation proposal to be applied after Draft Inbox materialization.",
    );
    const duplicateMetrics = duplicateTitleMetrics(generatedCards);
    assert(
      duplicateMetrics.duplicateCardCount === 0,
      `Expected PM Review activation to avoid duplicate Draft Inbox cards, got ${JSON.stringify(duplicateMetrics.duplicateGroups)}.`,
    );

    const newestCard = generatedCards[0];
    await clickButton(cdp, "Draft Inbox");
    if (newestCard?.title) {
      await waitFor(
        cdp,
        new Function(`return document.body.innerText.includes(${JSON.stringify(newestCard.title)});`),
        "PM Review activation card visible in Draft Inbox",
        60_000,
      );
    }
    const generatedCardsScreenshot = await captureDogfoodScreenshot(cdp, "pm-review-02-generated-cards.png");

    board = activationProgress.board;
    let activationRun = activationProgress.run;
    let cleanupPause;
    if (activationRun?.status === "running" || activationRun?.status === "pause_requested") {
      cleanupPause = await pauseRunningSynthesisFromUi(cdp, boardId, activationRun.id).catch((error) => ({
        status: "not_paused",
        error: error instanceof Error ? error.message : String(error),
      }));
      board = await currentBoard(cdp);
      activationRun = board.synthesisRuns.find((candidate) => candidate.id === activationRun.id) ?? activationRun;
    }

    const activationStep = {
      name: "pm-review-activation-ui",
      boardId,
      autoDispatch,
      reviewRunId: reviewStarted.run.id,
      reviewRunStatus: reviewStarted.run.status,
      reviewProposalId: reportProposal.id,
      zeroCardReportObserved: true,
      reviewQuestionCount: initialReviewQuestionCount,
      answeredQuestionCount,
      answerUpdateObserved: Boolean(updatedProposal),
      updateRunId: updateStarted?.run?.id,
      transientRetryCount: transientRetries.length,
      transientRetries,
      sourceConfidence: reportProposal.reviewReport.sourceConfidence,
      sourceConfidenceNoteCount: reportProposal.reviewReport.sourceConfidenceNotes.length,
      gitState: reportProposal.reviewReport.gitState,
      gitStateNoteCount: reportProposal.reviewReport.gitStateNotes.length,
      readiness: reportProposal.reviewReport.readiness,
      blockingQuestionCount: reportProposal.reviewReport.blockingQuestions.length,
      riskCount: reportProposal.reviewReport.risks.length,
      sourceConflictCount: reportProposal.reviewReport.sourceConflicts.length,
      sourceAuthorityNoteCount: reportProposal.reviewReport.sourceAuthorityNotes.length,
      cardGenerationConstraintCount: reportProposal.reviewReport.cardGenerationConstraints.length,
      recommendedActivationScopePresent: Boolean(reportProposal.reviewReport.recommendedActivationScope.trim()),
      reportUiCoverage,
      activationRunId: activationRun?.id,
      activationRunStatus: activationRun?.status,
      activationRunRetryOfRunId: activationRun?.retryOfRunId,
      activationSurface,
      generatedActivationCardCount: generatedCards.length,
      generatedProposalCardCount: activationProgress.proposal?.cards.length ?? 0,
      generatedDraftCardCount: activationProgress.cards.length,
      duplicateCardRate: duplicateMetrics.duplicateCardRate,
      duplicateCardCount: duplicateMetrics.duplicateCardCount,
      cleanupPause,
      screenshots: {
        report: reportScreenshot,
        generatedCards: generatedCardsScreenshot,
      },
    };
    if (!pmReviewWorkCardDogfoodMode) return activationStep;
    const workStep = await runPmReviewGeneratedCardWorkDogfood(cdp, boardId, generatedCards);
    return [activationStep, workStep];
  }

  async function startPmReviewRefinementWithTransientRetries(
    cdp,
    {
      boardId,
      proposalId,
      mode,
      previousRunId,
      previousProposalId,
      startLabel,
      proposalLabel,
      startTimeoutMs,
      transientRetries,
      alreadyStarted = false,
    },
  ) {
    const maxAttempts = Math.max(1, Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PM_REVIEW_TRANSIENT_ATTEMPTS || 3));
    let lastRunId = previousRunId;
    let skipStart = alreadyStarted;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (!skipStart) await startRefinement(cdp, boardId, proposalId, mode);
        skipStart = false;
        const started = await waitForPlanningRunStart(
          cdp,
          boardId,
          lastRunId,
          `${startLabel}${attempt > 1 ? ` retry ${attempt}` : ""}`,
          startTimeoutMs,
        );
        const proposal = await waitForLatestPendingProposal(
          cdp,
          boardId,
          previousProposalId,
          `${proposalLabel}${attempt > 1 ? ` retry ${attempt}` : ""}`,
        );
        return { started, proposal };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt >= maxAttempts || !isTransientAmbientDogfoodError(message)) throw error;
        const board = await currentBoard(cdp).catch(() => undefined);
        const latest = board ? latestRunForBoard(board, boardId) : undefined;
        if (latest?.id) lastRunId = latest.id;
        transientRetries.push({
          stage: proposalLabel,
          attempt,
          nextAttempt: attempt + 1,
          runId: latest?.id,
          runStatus: latest?.status,
          error: message.slice(0, 500),
        });
        await delay(Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PM_REVIEW_TRANSIENT_RETRY_DELAY_MS || 8_000));
      }
    }
    throw new Error(`${proposalLabel} did not complete after ${maxAttempts} attempt(s).`);
  }

  async function runSourceClassificationUiDogfood(cdp, boardId) {
    await clickButton(cdp, "Charter");
    await waitFor(cdp, () => document.querySelector(".project-board-source-review") !== null, "Source Review panel", 30_000);
    let board = await currentBoard(cdp);
    const target =
      board.sources.find((source) => source.path === "docs/gameplay-notes.md") ??
      board.sources.find((source) => source.path === "TODO.md") ??
      board.sources.find((source) => source.path && projectBoardSourceKind(source) !== "ignored") ??
      board.sources.find((source) => projectBoardSourceKind(source) !== "ignored");
    assert(target, "Expected at least one non-ignored source to exercise source classification UI.");
    const originalKind = projectBoardSourceKind(target) || "functional_spec";
    const targetKeys = [
      target.path,
      target.title,
      target.sourceKey,
      target.threadId,
      target.artifactId,
      target.messageId,
      target.id,
    ].filter((value) => typeof value === "string" && value.trim());

    await selectSourceInReview(cdp, targetKeys);
    await waitFor(cdp, () => document.querySelector(".project-board-source-detail") !== null, "Source Inspector detail", 30_000);
    const initialUi = await readSourceClassificationUiState(cdp, targetKeys);
    const initialScreenshot = await captureDogfoodScreenshot(cdp, "source-classification-01-initial.png");

    await setSourceKindFromUi(cdp, targetKeys, "ignored");
    const ignoredState = await waitForState(
      cdp,
      async () => {
        const next = await currentBoard(cdp);
        const source = sourceForStableKey(next, target);
        if (projectBoardSourceKind(source) === "ignored" && source.includeInSynthesis === false) return { board: next, source };
        return undefined;
      },
      "source reclassified to Ignored",
      60_000,
    );
    await clickButton(cdp, "Charter");
    await selectSourceInReview(cdp, targetKeys);
    const ignoredUi = await readSourceClassificationUiState(cdp, targetKeys);
    assert(ignoredUi.sourceReviewVisible, "Expected ignored source to remain visible in Source Review.");
    assert(ignoredUi.ignoredFilterVisible, "Expected Source Review to expose an Ignored filter count.");
    assert(ignoredUi.detailElaborateDisabled === true, "Expected ignored source inspector Elaborate Cards control to be disabled.");
    assert(ignoredUi.detailText.includes("Ignored for synthesis"), "Expected Source Inspector to explain ignored synthesis state.");
    const ignoredScreenshot = await captureDogfoodScreenshot(cdp, "source-classification-02-ignored-visible.png");

    await clickButton(cdp, "Refresh Sources", 60_000);
    const refreshedState = await waitForState(
      cdp,
      async () => {
        const next = await currentBoard(cdp);
        const source = sourceForStableKey(next, target);
        if (projectBoardSourceKind(source) === "ignored" && source.classifiedBy === "user" && source.includeInSynthesis === false)
          return { board: next, source };
        return undefined;
      },
      "refresh preserving ignored user classification",
      Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SOURCE_REFRESH_TIMEOUT_MS || 180_000),
    );
    await clickButton(cdp, "Charter");
    await selectSourceInReview(cdp, targetKeys);
    await waitFor(
      cdp,
      () =>
        [...document.querySelectorAll("button")]
          .filter((button) => button.textContent?.includes("Refresh Sources"))
          .some((button) =>
            /Ignored sources stay visible|User source classifications are preserved/.test(button.getAttribute("title") || ""),
          ) || /User reclassified source|Refresh preserves user classifications/.test(document.body.innerText || ""),
      "refresh preservation copy after ignored-source refresh",
      30_000,
    );
    const refreshedUi = await readSourceClassificationUiState(cdp, targetKeys);
    assert(refreshedUi.sourceReviewVisible, "Expected ignored source to remain visible after Refresh Sources.");
    assert(refreshedUi.refreshCopyIncludesPreservation, "Expected refresh UI to explain ignored/user classification preservation.");
    const refreshedScreenshot = await captureDogfoodScreenshot(cdp, "source-classification-03-refresh-preserved.png");

    await setSourceKindFromUi(cdp, targetKeys, originalKind === "ignored" ? "functional_spec" : originalKind);
    const includedState = await waitForState(
      cdp,
      async () => {
        const next = await currentBoard(cdp);
        const source = sourceForStableKey(next, target);
        if (source && projectBoardSourceKind(source) !== "ignored" && source.includeInSynthesis !== false) return { board: next, source };
        return undefined;
      },
      "source reclassified back to included",
      60_000,
    );
    await clickButton(cdp, "Charter");
    await selectSourceInReview(cdp, targetKeys);
    const includedUi = await readSourceClassificationUiState(cdp, targetKeys);
    assert(
      includedUi.detailElaborateDisabled === false,
      "Expected reclassified source to be eligible for Add Cards from Source Inspector.",
    );
    assert(includedUi.detailText.includes("Included in synthesis"), "Expected Source Inspector to explain included synthesis state.");
    const includedScreenshot = await captureDogfoodScreenshot(cdp, "source-classification-04-reincluded.png");
    const settledBeforePmReview = await waitForState(
      cdp,
      async () => {
        const next = await currentBoard(cdp);
        const running = next.synthesisRuns.find(
          (run) => run.boardId === boardId && (run.status === "running" || run.status === "pause_requested"),
        );
        if (running) return undefined;
        return { board: next, latestRun: latestRunForBoard(next, boardId) };
      },
      "source refresh run settlement before PM Review activation",
      Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SOURCE_REFRESH_SETTLE_TIMEOUT_MS || 240_000),
    );

    const sourceStep = {
      name: "source-classification-ui",
      boardId,
      targetSourceId: target.id,
      targetSourceKey: target.sourceKey,
      targetPath: target.path,
      targetTitle: target.title,
      originalKind,
      initialUi,
      ignoredKind: projectBoardSourceKind(ignoredState.source),
      ignoredClassifiedBy: ignoredState.source.classifiedBy,
      ignoredIncludeInSynthesis: ignoredState.source.includeInSynthesis,
      ignoredVisibleInReview: ignoredUi.sourceReviewVisible,
      ignoredFilterVisible: ignoredUi.ignoredFilterVisible,
      ignoredDetailExplainsExclusion:
        ignoredUi.detailText.includes("Visible in source inventory") || ignoredUi.detailText.includes("Ignored for synthesis"),
      ignoredElaborateDisabled: ignoredUi.detailElaborateDisabled,
      refreshPreservedIgnored:
        projectBoardSourceKind(refreshedState.source) === "ignored" &&
        refreshedState.source.classifiedBy === "user" &&
        refreshedState.source.includeInSynthesis === false,
      refreshTitleIncludesPreservation: refreshedUi.refreshTitleIncludesPreservation || refreshedUi.refreshCopyIncludesPreservation,
      refreshCopyIncludesPreservation: refreshedUi.refreshCopyIncludesPreservation,
      reclassifiedKind: projectBoardSourceKind(includedState.source),
      reclassifiedIncludeInSynthesis: includedState.source.includeInSynthesis,
      reclassifiedElaborateEnabled: includedUi.detailElaborateDisabled === false,
      includedDetailExplainsEligibility: includedUi.detailText.includes("Included in synthesis"),
      sourceRefreshSettledBeforePmReview: true,
      latestSourceRunStatusBeforePmReview: settledBeforePmReview.latestRun?.status,
      latestSourceRunStageBeforePmReview: settledBeforePmReview.latestRun?.stage,
      screenshots: {
        initial: initialScreenshot,
        ignored: ignoredScreenshot,
        refreshed: refreshedScreenshot,
        included: includedScreenshot,
      },
    };

    const pmReviewSteps = await runPmReviewActivationDogfood(cdp, boardId);
    return [sourceStep, ...(Array.isArray(pmReviewSteps) ? pmReviewSteps : [pmReviewSteps])];
  }

  async function runPmReviewGeneratedCardWorkDogfood(cdp, boardId, generatedCards) {
    let board = await currentBoard(cdp);
    const generatedCardIds = new Set(generatedCards.map((card) => card.id));
    const generatedDraftCards = board.cards.filter(
      (card) =>
        generatedCardIds.has(card.id) || (card.sourceKind === "board_synthesis" && card.status === "draft" && !card.orchestrationTaskId),
    );
    const selected = selectDogfoodExecutionCard(generatedDraftCards);
    assert(selected, "Expected a generated PM Review Draft Inbox card suitable for ticketization.");

    await invoke(cdp, "updateProjectBoardCard", { cardId: selected.id, candidateStatus: "ready_to_create" });
    await invoke(cdp, "approveProjectBoardCard", { cardId: selected.id });
    board = await currentBoard(cdp);
    const ticketized = board.cards.find((card) => card.id === selected.id);
    assert(ticketized?.orchestrationTaskId, "Expected generated PM Review Draft Inbox card to ticketize into a Local Task.");

    await invokeDetached(cdp, "prepareNextOrchestrationTasks", undefined, "__projectBoardDogfoodPrepareError");
    const { board: orchestrationAfterPrepare, run: preparedRun } = await waitForPreparedOrStartedRun(
      cdp,
      ticketized.orchestrationTaskId,
      ticketized.title,
    );
    const preparedWorkspacePath = preparedRun.workspacePath;
    const preparedWorkspaceSnapshot = preparedWorkspacePath
      ? await snapshotHarnessWorkspace(preparedWorkspacePath).catch(() => undefined)
      : undefined;
    setPreparedWorkspaceSnapshot({ path: preparedWorkspacePath, snapshot: preparedWorkspaceSnapshot });
    const step = {
      name: "pm-review-generated-card-work",
      boardId,
      cardId: ticketized.id,
      title: ticketized.title,
      taskId: ticketized.orchestrationTaskId,
      candidateStatus: ticketized.candidateStatus,
      blockedBy: ticketized.blockedBy,
      acceptanceCriteria: ticketized.acceptanceCriteria,
      testPlan: ticketized.testPlan,
      preparedRunId: preparedRun.id,
      preparedRunStatus: preparedRun.status,
      preparedWorkspacePath: preparedRun.workspacePath,
      preparedCount: orchestrationAfterPrepare.runs.filter((run) => run.status === "prepared").length,
      runningCount: orchestrationAfterPrepare.runs.filter((run) => run.status === "running").length,
    };
    if (!startAgentRun) return { ...step, executionSkipped: true };

    if (preparedRun.status === "prepared") {
      await invokeDetached(cdp, "startOrchestrationRun", { runId: preparedRun.id }, "__projectBoardDogfoodRunStartError");
    }
    const terminalRun = await waitForTerminalRun(cdp, preparedRun.id);
    const reviewedCard = await waitForCardProofReview(cdp, ticketized.id);
    board = await currentBoard(cdp);
    const terminalOrchestrationBoard = await readOrchestrationBoardFromStore();
    const terminalTask = terminalOrchestrationBoard.tasks.find((task) => task.id === ticketized.orchestrationTaskId);
    const meaningfulChangedPaths = meaningfulProofChangedPaths(terminalRun.proofOfWork);
    const taskActions = taskActionObservation(terminalRun.proofOfWork);
    const visualProofRequired = requiresVisualProof(ticketized);
    const visualProofArtifacts = visualProofRequired ? await collectVisualProofArtifacts([projectRoot, preparedRun.workspacePath]) : [];
    const followUpIds = new Set([
      ...(reviewedCard?.proofReview?.followUpCardIds ?? []),
      ...(reviewedCard?.splitOutcome?.childCardIds ?? []),
    ]);
    const followUps = board.cards.filter(
      (card) => followUpIds.has(card.id) || (card.sourceKind === "run_follow_up" && card.blockedBy.includes(ticketized.id)),
    );
    if (requireTaskActions) {
      if (!taskActions.protocolSatisfied) {
        observations.loopBreaks.push(
          `PM Review generated-card worker did not emit the expected project-board task action protocol; observed ${JSON.stringify(taskActions.countsByAction)}; missing ${taskActions.protocolMissing.join(", ") || "unknown"}.`,
        );
      }
    }
    assert(meaningfulChangedPaths.length > 0, "Expected generated PM Review card execution to include meaningful workspace changes.");
    assert(reviewedCard?.proofReview, "Expected generated PM Review card execution to record a PM proof review.");
    assert(
      reviewedCard.proofReview.reviewer === "ambient_pi",
      `Expected live Ambient/Pi proof review, got ${reviewedCard.proofReview.reviewer ?? "missing reviewer"}.`,
    );
    if (visualProofRequired && !visualProofArtifacts.some(isReadableVisualProofArtifact)) {
      const proofReviewKeptOpen =
        reviewedCard.proofReview.status !== "done" &&
        reviewedCard.proofReview.recommendedAction !== "close" &&
        reviewedCard.proofReview.recommendedAction !== undefined;
      assert(
        proofReviewKeptOpen,
        "Expected generated visual-proof card execution to create a readable visual proof artifact or stay open in PM proof review.",
      );
    }

    return {
      ...step,
      runId: terminalRun.id,
      runStatus: terminalRun.status,
      runError: terminalRun.error,
      taskState: terminalTask?.state,
      proofReview: reviewedCard.proofReview,
      cardStatus: reviewedCard.status,
      splitOutcome: reviewedCard.splitOutcome,
      taskActions,
      meaningfulChangedPaths,
      meaningfulChangedPathCount: meaningfulChangedPaths.length,
      visualProofRequired,
      visualProofArtifacts,
      followUpCardCount: followUps.length,
      followUpCards: followUps.map((card) => ({
        id: card.id,
        title: card.title,
        candidateStatus: card.candidateStatus,
        blockedBy: card.blockedBy,
        clarificationQuestions: card.clarificationQuestions,
      })),
    };
  }

  return { runPmReviewActivationDogfood, runSourceClassificationUiDogfood };
}
