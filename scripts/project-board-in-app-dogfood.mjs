#!/usr/bin/env node
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import {
  diffHarnessWorkspaceSnapshot,
  snapshotHarnessWorkspace,
  writeHarnessTraceArtifacts,
} from "./harness-trace-artifacts.mjs";
import {
  latestSynthesisRunForBoard,
  latestPlanningSynthesisRunForBoard,
  projectBoardIncrementalSynthesisSnapshot,
  projectBoardDogfoodStateDbPath,
  planningStartIntentForBoard,
  readOrchestrationBoardSnapshot,
  readOrchestrationRunSnapshot,
  readProjectBoardSnapshot,
  readyPendingProjectBoardProposal,
  runningPlanningSynthesisRunForBoard,
  sqlString,
} from "./project-board-dogfood-store.mjs";
import { buildProjectBoardDogfoodReleaseGate } from "./project-board-dogfood-report.mjs";
import { shouldUseSqliteObserverFallback } from "./project-board-dogfood-observer.mjs";
import { requiresVisualProof } from "./project-board-dogfood-proof.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(process.env.AMBIENT_PROJECT_BOARD_FIXTURE || join(repoRoot, "fixtures", "project-board-spaceship"));
const outputRoot = resolve(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_OUT_DIR || join(repoRoot, "test-results", "project-board-dogfood"));
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const runRoot = join(outputRoot, "runs", runStamp);
const projectRoot = join(runRoot, basename(fixtureRoot));
const userData = join(runRoot, "user-data");
const port = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_CDP_PORT || 0) || (await findOpenPort());
const windowWidth = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_WINDOW_WIDTH || 1720);
const windowHeight = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_WINDOW_HEIGHT || 1120);
const startAgentRun = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SKIP_AGENT_RUN !== "1";
const mapSmoke = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_MAP_SMOKE === "1";
const requireTaskActions = startAgentRun && process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_REQUIRE_TASK_ACTIONS !== "0";
const cdpCommandTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_CDP_TIMEOUT_MS || 0) || 120_000;
const workerRunMaxElapsedMs =
  process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_RUN_MAX_TIMEOUT_MS === "0"
    ? 0
    : Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_RUN_MAX_TIMEOUT_MS || 0) || 1_500_000;
const refineAfterAnswers = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_REFINE_AFTER_ANSWERS === "1";
const executeFirstReadyDuringSynthesis = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_EXECUTE_FIRST_READY_DURING_SYNTHESIS !== "0";
const manualRuntimeSplitCard = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_MANUAL_RUNTIME_SPLIT_CARD === "1";
const forcedCardRuntimeBudgetMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_FORCE_CARD_RUNTIME_BUDGET_MS || 0) || 0;
const requireRuntimeSplit = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_REQUIRE_RUNTIME_SPLIT === "1";
const splitDecisionAction = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SPLIT_DECISION_ACTION || "";
const semanticIdleRecoveryMode = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SEMANTIC_IDLE_RECOVERY === "1";
const pauseResumeDogfoodMode = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PAUSE_RESUME === "1";
const startFreshDogfoodMode = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_START_FRESH === "1";
const pmReviewActivationDogfoodMode = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PM_REVIEW_ACTIVATION === "1";
const pmReviewWorkCardDogfoodMode = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PM_REVIEW_WORK_CARD === "1";
const sourceClassificationUiDogfoodMode = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SOURCE_CLASSIFICATION_UI === "1";
const outputPath = resolve(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_OUT || join(outputRoot, "latest.json"));
const output = [];
const children = new Set();
const observations = {
  startedAt: new Date().toISOString(),
  repoRoot,
  fixtureRoot,
  runRoot,
  projectRoot,
  port,
  window: { width: windowWidth, height: windowHeight },
  requireTaskActions,
  cdpCommandTimeoutMs,
  workerRunMaxElapsedMs,
  refineAfterAnswers,
  executeFirstReadyDuringSynthesis,
  manualRuntimeSplitCard,
  forcedCardRuntimeBudgetMs,
  requireRuntimeSplit,
  splitDecisionAction,
  semanticIdleRecoveryMode,
  pauseResumeDogfoodMode,
  startFreshDogfoodMode,
  pmReviewActivationDogfoodMode,
  pmReviewWorkCardDogfoodMode,
  sourceClassificationUiDogfoodMode,
  steps: [],
  loopBreaks: [],
};
let appInstance;
let projectRootSnapshot;
let preparedWorkspacePath;
let preparedWorkspaceSnapshot;

class BoundedWorkerRunTimeoutError extends Error {
  constructor(message, run, maxElapsedMs, elapsedMs) {
    super(message);
    this.name = "BoundedWorkerRunTimeoutError";
    this.run = run;
    this.maxElapsedMs = maxElapsedMs;
    this.elapsedMs = elapsedMs;
  }
}

class DogfoodCompletedEarly extends Error {
  constructor() {
    super("Dogfood completed early.");
    this.name = "DogfoodCompletedEarly";
  }
}

if (process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_ANALYZE_PNG) {
  const target = resolve(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_ANALYZE_PNG);
  console.log(JSON.stringify({ path: target, ...analyzePng(await readFile(target)) }, null, 2));
  process.exit(0);
}

try {
  const apiKey = await readAmbientApiKey();
  if (!apiKey) {
    throw new Error("Set AMBIENT_API_KEY, AMBIENT_AGENT_AMBIENT_API_KEY, AMBIENT_API_KEY_FILE, or place ambient_api_key.txt near the repo.");
  }
  const focusedModeCount = [
    semanticIdleRecoveryMode,
    pauseResumeDogfoodMode,
    startFreshDogfoodMode,
    pmReviewActivationDogfoodMode,
    sourceClassificationUiDogfoodMode,
  ].filter(Boolean).length;
  if (focusedModeCount > 1) {
    throw new Error("Project-board in-app dogfood supports only one focused synthesis mode per run.");
  }
  if (pmReviewWorkCardDogfoodMode && !pmReviewActivationDogfoodMode) {
    throw new Error("AMBIENT_PROJECT_BOARD_DOGFOOD_PM_REVIEW_WORK_CARD requires PM Review activation dogfood mode.");
  }

  await mkdir(runRoot, { recursive: true });
  await mkdir(userData, { recursive: true });
  await writeDogfoodWindowState(userData);
  await cp(fixtureRoot, projectRoot, { recursive: true });
  await initializeFixtureGit(projectRoot);
  projectRootSnapshot = await snapshotHarnessWorkspace(projectRoot);
  observations.loopBreaks.push("Fixture now carries WORKFLOW.md and the dogfood copy is initialized as git so ticketized cards can prepare real worktrees.");

  appInstance = await launchApp({ apiKey });
  const cdp = appInstance.cdp;
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "main shell");
  let board;
  let firstAutoTicketizedCardId;
  let forcedRuntimeBudgetApplied = false;

  await openProjectBoardSetup(cdp);
  await clickButton(cdp, "Build Board");
  await waitForState(cdp, () => currentBoard(cdp).catch(() => undefined), "project board creation", 20_000);
  board = await currentBoard(cdp);
  if (!semanticIdleRecoveryMode) {
    board = await waitForInitialProjectBoardSourceSnapshot(cdp, board.id);
  }
  if (semanticIdleRecoveryMode) {
    observations.steps.push({
      name: "build-board",
      boardId: board.id,
      initialCardCount: board.cards.length,
      sourceCount: board.sources.length,
      sourcePaths: board.sources.map((source) => source.path),
      questionCount: board.questions.length,
      skippedKickoffFinalize: true,
      reason: "Focused semantic-idle recovery dogfood seeds a controlled partial run and must not start live synthesis from kickoff finalization.",
    });
    observations.steps.push(await runSemanticIdleSectionRecoveryDogfood(cdp, board.id));
    await completeDogfoodSuccessfully();
    throw new DogfoodCompletedEarly();
  }
  await answerKickoff(cdp);
  board = await currentBoard(cdp);
  if (pmReviewActivationDogfoodMode) {
    observations.steps.push({
      name: "build-board",
      boardId: board.id,
      initialCardCount: board.cards.length,
      sourceCount: board.sources.length,
      sourcePaths: board.sources.map((source) => source.path),
      questionCount: board.questions.length,
      skippedKickoffFinalize: true,
      reason:
        "Focused PM Review activation dogfood reviews the answered draft charter before kickoff finalization so full board synthesis cannot race ahead of the lightweight report.",
    });
    observations.loopBreaks.push("Focused PM Review dogfood keeps the charter in draft while reviewing answers, then uses Generate Draft Board as the explicit activation handoff.");
    const pmReviewSteps = await runPmReviewActivationDogfood(cdp, board.id);
    observations.steps.push(...(Array.isArray(pmReviewSteps) ? pmReviewSteps : [pmReviewSteps]));
    await completeDogfoodSuccessfully();
    throw new DogfoodCompletedEarly();
  }
  if (sourceClassificationUiDogfoodMode) {
    observations.steps.push({
      name: "build-board",
      boardId: board.id,
      initialCardCount: board.cards.length,
      sourceCount: board.sources.length,
      sourcePaths: board.sources.map((source) => source.path),
      questionCount: board.questions.length,
      skippedKickoffFinalize: true,
      reason:
        "Focused source-classification UI dogfood verifies ignored-source visibility and Add Cards eligibility before using PM Review activation as the live synthesis handoff.",
    });
    observations.loopBreaks.push(
      "Focused source-classification dogfood keeps the charter in draft, exercises source classification UI semantics, then uses PM Review activation to prove the source state still supports Draft Inbox generation.",
    );
    const sourceSteps = await runSourceClassificationUiDogfood(cdp, board.id);
    observations.steps.push(...(Array.isArray(sourceSteps) ? sourceSteps : [sourceSteps]));
    await completeDogfoodSuccessfully();
    throw new DogfoodCompletedEarly();
  }
  if (board.status === "draft") {
    await invokeDetached(cdp, "finalizeProjectBoardKickoff", { boardId: board.id }, "__projectBoardDogfoodFinalizeError");
    board = await waitForActiveBoard(cdp);
  } else {
    await waitFor(cdp, () => document.querySelector(".project-board-workspace")?.textContent?.includes("Active board"), "active project board");
    board = await currentBoard(cdp);
  }
  observations.steps.push({
    name: "build-board",
    boardId: board.id,
    initialCardCount: board.cards.length,
    sourceCount: board.sources.length,
    sourcePaths: board.sources.map((source) => source.path),
    questionCount: board.questions.length,
  });
  if (board.cards.length === 0) observations.loopBreaks.push("Board activation now establishes the charter/source corpus first; PM Review proposal synthesis is responsible for creating executable candidate cards.");
  assert(board.sources.some((source) => source.path === "WORKFLOW.md"), "Expected Build Board source scan to include WORKFLOW.md.");

  if (pauseResumeDogfoodMode) {
    observations.steps.push(await runPauseResumePlanningDogfood(cdp, board.id));
    await completeDogfoodSuccessfully();
    throw new DogfoodCompletedEarly();
  }

  if (startFreshDogfoodMode) {
    observations.steps.push(await runStartFreshPlanningDogfood(cdp, board.id));
    await completeDogfoodSuccessfully();
    throw new DogfoodCompletedEarly();
  }

  if (forcedCardRuntimeBudgetMs > 0) {
    const forcedBudget = await forceProjectBoardRuntimeBudget(board.id, forcedCardRuntimeBudgetMs);
    forcedRuntimeBudgetApplied = true;
    observations.steps.push({
      name: "force-card-runtime-budget",
      boardId: board.id,
      charterId: forcedBudget.charterId,
      maxRuntimeMsPerCard: forcedBudget.budgetPolicy.maxRuntimeMsPerCard,
      timing: "before-planning-ticketization",
      reason: "Focused dogfood lowered the active charter runtime budget before PM synthesis can auto-ticketize the first card.",
    });
    board = await currentBoard(cdp);
  }

  if (manualRuntimeSplitCard) {
    const manualCard = await createRuntimeSplitManualCard(cdp, board.id);
    board = await currentBoard(cdp);
    observations.steps.push({
      name: "create-runtime-split-manual-card",
      cardId: manualCard.id,
      title: manualCard.title,
      acceptanceCriteria: manualCard.acceptanceCriteria,
      testPlan: manualCard.testPlan,
      reason: "Focused runtime-split dogfood bypassed full synthesis so the app can exercise the execution/split PM loop quickly.",
    });
  }

  const existingSynthesisRun = manualRuntimeSplitCard ? undefined : runningPlanningSynthesisRunForBoard(board, board.id);
  if (existingSynthesisRun) {
    observations.steps.push({
      name: "start-pi-refinement",
      reusedExistingRun: true,
      runId: existingSynthesisRun.id,
      stage: existingSynthesisRun.stage,
    });
    const observed = await observeInitialIncrementalSynthesis(cdp, board.id, existingSynthesisRun.id);
    firstAutoTicketizedCardId = observed.firstAutoTicketizedCardId;
    board = await currentBoard(cdp);
  } else if (!manualRuntimeSplitCard && board.cards.length === 0) {
    const startIntent = planningStartIntentForBoard(board, board.id);
    if (startIntent.shouldStartNewRun) {
      await startRefinement(cdp, board.id);
    }
    const started = await waitForPlanningRunStart(cdp, board.id, startIntent.previousRunId, "initial PM Review synthesis start");
    board = started.board;
    observations.steps.push({
      name: "start-pi-refinement",
      runId: started.run?.id,
      stage: started.run?.stage,
      status: started.run?.status,
      previousRunId: startIntent.previousRunId,
      explicitStart: startIntent.shouldStartNewRun,
      reusedInFlightRun: !startIntent.shouldStartNewRun,
    });
    if (started.run?.id) {
      const observed = await observeInitialIncrementalSynthesis(cdp, board.id, started.run.id);
      firstAutoTicketizedCardId = observed.firstAutoTicketizedCardId;
      board = await currentBoard(cdp);
    }
  } else {
    observations.steps.push({
      name: "initial-board-synthesis",
      reusedExistingCards: !manualRuntimeSplitCard,
      skipped: manualRuntimeSplitCard,
      reason: manualRuntimeSplitCard ? "Manual runtime-split card mode skips PM synthesis for this focused execution dogfood." : undefined,
      cardCount: board.cards.length,
    });
  }

  let proposal;
  if (manualRuntimeSplitCard) {
    observations.steps.push({
      name: "initial-pi-refinement",
      skipped: true,
      reason: "Manual runtime-split card mode focuses on product execution/runtime-budget split behavior.",
      draftCardCount: board.cards.filter((card) => card.status === "draft").length,
    });
  } else if (board.cards.length === 0) {
    proposal = await waitForLatestPendingProposal(cdp, board.id, undefined, "initial PM Review proposal");
    observations.steps.push(proposalObservation("initial-pi-refinement", proposal, await latestSynthesisRun(cdp, board.id)));
  } else {
    observations.steps.push({
      name: "initial-pi-refinement",
      skipped: true,
      reason: "Build Board already applied candidate cards directly, so no separate PM Review proposal was needed for this dogfood pass.",
      draftCardCount: board.cards.filter((card) => card.status === "draft").length,
    });
  }

  if (proposal) {
    for (const [index, question] of proposal.questions.entries()) {
      await invoke(cdp, "answerProjectBoardSynthesisProposalQuestion", {
        proposalId: proposal.id,
        questionIndex: index,
        answer: answerForSpaceshipQuestion(question),
      });
    }
    observations.steps.push({ name: "answer-pm-review", proposalId: proposal.id, answered: proposal.questions.length });
  } else {
    observations.steps.push({ name: "answer-pm-review", skipped: true, reason: "No pending PM Review proposal was created." });
  }

  if (proposal && proposal.questions.length > 0 && refineAfterAnswers) {
    const previousRunId = latestRunForBoard(board, board.id)?.id;
    await startRefinement(cdp, board.id, proposal.id);
    const started = await waitForPlanningRunStart(cdp, board.id, previousRunId, "answer-refined PM Review synthesis start");
    observations.steps.push({
      name: "answer-refined-pm-review-start",
      runId: started.run?.id,
      stage: started.run?.stage,
      status: started.run?.status,
      previousRunId,
    });
    proposal = await waitForLatestPendingProposal(cdp, board.id, proposal.id, "answer-refined PM Review proposal");
    observations.steps.push(proposalObservation("answer-refined-pi-proposal", proposal, await latestSynthesisRun(cdp, board.id)));
  } else if (proposal && proposal.questions.length > 0) {
    observations.steps.push({
      name: "answer-refined-pi-proposal",
      skipped: true,
      reason: "Skipped by default so the live task-action dogfood reaches card execution after the first Pi proposal.",
    });
  }

  if (proposal) {
    for (const card of proposal.cards) {
      await invoke(cdp, "reviewProjectBoardSynthesisProposalCard", {
        proposalId: proposal.id,
        sourceId: card.sourceId,
        reviewStatus: "accepted",
        reason: "In-app spaceship dogfood accepted this card to exercise proposal application.",
      });
    }
    board = boardFromState(await invoke(cdp, "applyProjectBoardSynthesisProposal", { proposalId: proposal.id, replaceExistingDraft: true }));
    observations.steps.push({
      name: "apply-proposal",
      proposalId: proposal.id,
      draftCardCount: board.cards.filter((card) => card.status === "draft").length,
      acceptedCardCount: proposal.cards.length,
    });
  } else {
    observations.steps.push({
      name: "apply-proposal",
      skipped: true,
      reason: "Build Board already applied draft cards.",
      draftCardCount: board.cards.filter((card) => card.status === "draft").length,
    });
  }
  if (mapSmoke) {
    observations.steps.push(await captureProjectBoardMapSmoke(cdp, board));
  }

  let ticketized = firstAutoTicketizedCardId ? board.cards.find((card) => card.id === firstAutoTicketizedCardId) : undefined;
  if (!ticketized?.orchestrationTaskId) {
    const selected = selectDogfoodExecutionCard(board.cards);
    assert(selected, "Expected an applied proposal card suitable for ticketization.");
    await invoke(cdp, "updateProjectBoardCard", { cardId: selected.id, candidateStatus: "ready_to_create" });
    await invoke(cdp, "approveProjectBoardCard", { cardId: selected.id });
    board = await currentBoard(cdp);
    ticketized = board.cards.find((card) => card.id === selected.id);
  }
  assert(ticketized?.orchestrationTaskId, `Expected selected card to ticketize into a Local Task.`);
  observations.steps.push({
    name: "ticketize-card",
    reusedAutoTicketizedCard: ticketized.id === firstAutoTicketizedCardId,
    cardId: ticketized.id,
    title: ticketized.title,
    taskId: ticketized.orchestrationTaskId,
    blockedBy: ticketized.blockedBy,
    acceptanceCriteria: ticketized.acceptanceCriteria,
    testPlan: ticketized.testPlan,
  });

  if (forcedCardRuntimeBudgetMs > 0 && !forcedRuntimeBudgetApplied) {
    const forcedBudget = await forceProjectBoardRuntimeBudget(board.id, forcedCardRuntimeBudgetMs);
    observations.steps.push({
      name: "force-card-runtime-budget",
      boardId: board.id,
      charterId: forcedBudget.charterId,
      maxRuntimeMsPerCard: forcedBudget.budgetPolicy.maxRuntimeMsPerCard,
      timing: "before-local-task-prepare",
      reason: "Focused dogfood lowered the active charter runtime budget before starting the Local Task so product close policy, not the outer harness timeout, drives the split.",
    });
    board = await currentBoard(cdp);
  }

  await invokeDetached(cdp, "prepareNextOrchestrationTasks", undefined, "__projectBoardDogfoodPrepareError");
  const { board: orchestrationAfterPrepare, run: preparedRun } = await waitForPreparedOrStartedRun(cdp, ticketized.orchestrationTaskId, ticketized.title);
  preparedWorkspacePath = preparedRun.workspacePath;
  preparedWorkspaceSnapshot = preparedWorkspacePath ? await snapshotHarnessWorkspace(preparedWorkspacePath).catch(() => undefined) : undefined;
  observations.steps.push({
    name: "prepare-local-task",
    preparedCount: orchestrationAfterPrepare.runs.filter((run) => run.status === "prepared").length,
    runningCount: orchestrationAfterPrepare.runs.filter((run) => run.status === "running").length,
    skippedCount: 0,
    runId: preparedRun.id,
    runStatus: preparedRun.status,
    workspacePath: preparedRun.workspacePath,
  });

  if (startAgentRun) {
    if (preparedRun.status === "prepared") {
      await invokeDetached(cdp, "startOrchestrationRun", { runId: preparedRun.id }, "__projectBoardDogfoodRunStartError");
    }
    let terminalRun;
    try {
      terminalRun = await waitForTerminalRun(cdp, preparedRun.id);
    } catch (error) {
      const boundedTimeout = error instanceof BoundedWorkerRunTimeoutError;
      if (boundedTimeout) {
        await invoke(cdp, "cancelOrchestrationRun", { runId: preparedRun.id }).catch(() => undefined);
        await delay(1500);
      }
      const boardSnapshot = await readOrchestrationBoardFromStore().catch(() => undefined);
      const partialRun = boardSnapshot?.runs?.find((candidate) => candidate.id === preparedRun.id) ?? (boundedTimeout ? error.run : undefined);
      const existingPartialProof = partialRun?.proofOfWork && typeof partialRun.proofOfWork === "object" ? partialRun.proofOfWork : {};
      const partialProof = boundedTimeout
        ? {
            ...existingPartialProof,
            projectBoardDogfoodHarnessBudget: {
              exceeded: true,
              maxRuntimeMs: error.maxElapsedMs,
              elapsedMs: error.elapsedMs,
              stoppedAt: new Date().toISOString(),
              recommendedNextAction:
                "The dogfood harness stopped waiting before the product closed the run. Review partial workspace changes and rerun with a longer harness cap or a shorter product runtime budget.",
            },
          }
        : partialRun?.proofOfWork;
      const gitStatus = await gitStatusForWorkspace(preparedRun.workspacePath).catch((statusError) => [
        `git status unavailable: ${statusError instanceof Error ? statusError.message : String(statusError)}`,
      ]);
      const proofChangedPaths = meaningfulProofChangedPaths(partialProof);
      observations.steps.push({
        name: "execute-local-task",
        status: boundedTimeout ? "bounded_timeout" : "timed_out",
        partial: boundedTimeout,
        runId: preparedRun.id,
        runStatus: partialRun?.status,
        taskState: boardSnapshot?.tasks?.find((task) => task.id === ticketized.orchestrationTaskId)?.state,
        lastEventAt: partialRun?.lastEventAt,
        workspacePath: preparedRun.workspacePath,
        proofOfWork: partialProof,
        taskActions: taskActionObservation(partialProof),
        meaningfulChangedPaths: proofChangedPaths.length ? proofChangedPaths : meaningfulPathsFromGitStatus(gitStatus),
        gitStatus,
        workerMaxElapsedMs: boundedTimeout ? error.maxElapsedMs : undefined,
        workerElapsedMs: boundedTimeout ? error.elapsedMs : undefined,
      });
      if (boundedTimeout) {
        observations.loopBreaks.push(
          `Worker run reached the bounded dogfood runtime after ${Math.round(error.elapsedMs / 1000)}s; partial proof was recorded for review instead of waiting indefinitely.`,
        );
      }
      throw error;
    }
    const reviewedCard = await waitForCardProofReview(cdp, ticketized.id);
    board = await currentBoard(cdp);
    const followUpIds = new Set([...(reviewedCard?.proofReview?.followUpCardIds ?? []), ...(reviewedCard?.splitOutcome?.childCardIds ?? [])]);
    const followUps = board.cards.filter(
      (card) => followUpIds.has(card.id) || (card.sourceKind === "run_follow_up" && card.blockedBy.includes(ticketized.id)),
    );
    const meaningfulChangedPaths = meaningfulProofChangedPaths(terminalRun.proofOfWork);
    const taskActions = taskActionObservation(terminalRun.proofOfWork);
    const visualProofRequired = requiresVisualProof(ticketized);
    const visualProofArtifacts = visualProofRequired ? await collectVisualProofArtifacts([projectRoot, preparedRun.workspacePath]) : [];
    const terminalOrchestrationBoard = await readOrchestrationBoardFromStore();
    const terminalTask = terminalOrchestrationBoard.tasks.find((task) => task.id === ticketized.orchestrationTaskId);
    observations.steps.push({
      name: "execute-local-task",
      runId: terminalRun.id,
      status: terminalRun.status,
      error: terminalRun.error,
      proofOfWork: terminalRun.proofOfWork,
      taskActions,
      meaningfulChangedPaths,
      visualProofRequired,
      visualProofArtifacts,
      cardStatus: reviewedCard?.status,
      proofReview: reviewedCard?.proofReview,
      splitOutcome: reviewedCard?.splitOutcome,
      taskState: terminalTask?.state,
      followUpCardCount: followUps.length,
      followUpCards: followUps.map((card) => ({
        id: card.id,
        title: card.title,
        candidateStatus: card.candidateStatus,
        blockedBy: card.blockedBy,
        missing: card.acceptanceCriteria,
        clarificationQuestions: card.clarificationQuestions,
      })),
    });
    if (requireRuntimeSplit) {
      assert(reviewedCard?.splitOutcome?.source === "runtime_budget", "Expected product runtime budget to create a runtime split outcome on the parent card.");
      assert(followUps.length > 0, "Expected runtime split to create at least one actionable follow-up card.");
    }
    if (splitDecisionAction && reviewedCard?.splitOutcome) {
      const beforeStatus = reviewedCard.splitOutcome.status;
      await invoke(cdp, "resolveProjectBoardSplitDecision", { cardId: ticketized.id, action: splitDecisionAction });
      board = await currentBoard(cdp);
      const resolvedParent = board.cards.find((card) => card.id === ticketized.id);
      const resolvedChildren = board.cards.filter((card) => new Set(resolvedParent?.splitOutcome?.childCardIds ?? []).has(card.id));
      observations.steps.push({
        name: "resolve-runtime-split",
        cardId: ticketized.id,
        action: splitDecisionAction,
        beforeStatus,
        afterStatus: resolvedParent?.splitOutcome?.status,
        parentStatus: resolvedParent?.status,
        childCards: resolvedChildren.map((card) => ({ id: card.id, title: card.title, candidateStatus: card.candidateStatus, status: card.status })),
      });
    }
    assert(["completed", "failed", "stalled", "canceled"].includes(terminalRun.status), `Unexpected run status ${terminalRun.status}.`);
    if (requireTaskActions) {
      const runtimeBudgetSplitObserved = reviewedCard?.splitOutcome?.source === "runtime_budget";
      const taskActionProtocolSatisfied =
        taskActions.count > 0 &&
        (terminalRun.status !== "completed" || runtimeBudgetSplitObserved || taskActions.proofActionCount > 0 || taskActions.completeActionCount > 0) &&
        (!runtimeBudgetSplitObserved || taskActions.heartbeatCount > 0 || taskActions.proofActionCount > 0 || taskActions.completeActionCount > 0) &&
        (terminalRun.status === "completed" || taskActions.blockActionCount > 0 || taskActions.proofActionCount > 0 || taskActions.completeActionCount > 0);
      if (!taskActionProtocolSatisfied) {
        observations.loopBreaks.push(
          `Live worker did not emit the expected project-board task action protocol; observed ${JSON.stringify(taskActions.countsByAction)}.`,
        );
      }
    }
    assert(meaningfulChangedPaths.length > 0, "Expected Local Task proof to include meaningful workspace changes outside node_modules/cache paths.");
    if (visualProofRequired) {
      const readableVisualProof = visualProofArtifacts.some(isReadableVisualProofArtifact);
      if (!readableVisualProof) {
        const visualProofIssue =
          visualProofArtifacts.length === 0
            ? "Expected visual-proof card execution to create at least one browser screenshot artifact."
            : `Expected at least one readable nonblank visual proof screenshot, got ${JSON.stringify(visualProofArtifacts)}`;
        const proofReviewKeptOpen =
          reviewedCard?.proofReview &&
          reviewedCard.proofReview.status !== "done" &&
          reviewedCard.proofReview.recommendedAction !== "close" &&
          reviewedCard.proofReview.recommendedAction !== undefined;
        observations.loopBreaks.push(
          proofReviewKeptOpen
            ? `${visualProofIssue} PM proof review kept the card open with ${reviewedCard.proofReview.recommendedAction}.`
            : visualProofIssue,
        );
        assert(proofReviewKeptOpen, visualProofIssue);
      }
    }
    assert(reviewedCard?.proofReview, "Expected the executed card to record a PM proof review.");
    assert(reviewedCard.proofReview.reviewer === "ambient_pi", `Expected live Ambient/Pi proof review, got ${reviewedCard.proofReview.reviewer ?? "missing reviewer"}.`);
    assert(["strong", "mixed", "weak"].includes(reviewedCard.proofReview.evidenceQuality), `Expected proof review evidence quality, got ${reviewedCard.proofReview.evidenceQuality}.`);
    assert(["close", "retry", "follow_up", "ask_user", "block"].includes(reviewedCard.proofReview.recommendedAction), `Expected proof review recommended action, got ${reviewedCard.proofReview.recommendedAction}.`);
    assert(typeof reviewedCard.proofReview.confidence === "number", "Expected proof review confidence from live Ambient/Pi judgment.");
    assert(
      reviewedCard.status === expectedCardStatusForReview(reviewedCard.proofReview.status),
      `Expected card status to match proof review: ${reviewedCard.proofReview.status} -> ${expectedCardStatusForReview(reviewedCard.proofReview.status)}, got ${reviewedCard.status}.`,
    );
    assert(
      terminalTask?.state === expectedTaskStateForReview(reviewedCard.proofReview.status),
      `Expected Local Task state to match proof review: ${reviewedCard.proofReview.status} -> ${expectedTaskStateForReview(reviewedCard.proofReview.status)}, got ${terminalTask?.state}.`,
    );
  } else {
    observations.steps.push({ name: "execute-local-task", skipped: true });
  }

  await completeDogfoodSuccessfully();
} catch (error) {
  if (!(error instanceof DogfoodCompletedEarly)) {
    const boardSnapshot = await readProjectBoardReleaseGateSnapshot().catch(() => undefined);
    const boundedWorkerTimeout = error instanceof BoundedWorkerRunTimeoutError;
    const productClosureMissed = boundedWorkerTimeout && requireRuntimeSplit;
    const sqliteFallback = shouldUseSqliteObserverFallback(error, boardSnapshot, { outputText: outputTail(4000) });
    observations.completedAt = new Date().toISOString();
    observations.status = productClosureMissed ? "failed" : boundedWorkerTimeout || sqliteFallback ? "attention" : "failed";
    observations.error = error instanceof Error ? error.message : String(error);
    observations.electronOutputTail = outputTail(4000);
    if (boundedWorkerTimeout) {
      observations.workerRuntimeBudget = {
        kind: "dogfood_harness_timeout",
        maxElapsedMs: error.maxElapsedMs,
        elapsedMs: error.elapsedMs,
        runId: error.run?.id,
        productClosureRequired: requireRuntimeSplit,
      };
      observations.releaseGate = buildProjectBoardDogfoodReleaseGate(observations, { board: boardSnapshot });
    } else if (sqliteFallback) {
      observations.observerFallback = {
        kind: "sqlite_after_cdp_failure",
        reason: observations.error,
        boardId: boardSnapshot?.id,
        cardCount: boardSnapshot?.cards?.length ?? 0,
        synthesisRunCount: boardSnapshot?.synthesisRuns?.length ?? 0,
      };
      observations.loopBreaks.push(
        "Dogfood observer fell back to the SQLite board snapshot after CDP/render-frame failure; release-gate metrics reflect persisted project-board state.",
      );
      observations.releaseGate = buildProjectBoardDogfoodReleaseGate(observations, { board: boardSnapshot });
    } else {
      await refreshReleaseGateSummary().catch(() => undefined);
    }
    await writeObservations().catch(() => undefined);
    if (boundedWorkerTimeout || sqliteFallback) {
      console.log(JSON.stringify(summaryForConsole(observations), null, 2));
      if (productClosureMissed) {
        console.error("Product runtime-budget closure was required, but the dogfood harness timeout fired first.");
        process.exitCode = 1;
      }
    } else {
      console.error(outputTail());
      throw error;
    }
  }
} finally {
  await writeProjectBoardHarnessTrace().catch(() => undefined);
  if (appInstance) {
    appInstance.cdp.close();
    await terminateProcessTree(appInstance.child);
  }
  for (const child of children) await terminateProcessTree(child);
  if (observations.status === "passed" && !process.exitCode) process.exit(0);
}

async function writeDogfoodWindowState(userDataPath) {
  const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  await writeFile(
    join(userDataPath, "window-state.json"),
    JSON.stringify({ width: windowWidth, height: windowHeight, maximized: false, appVersion: packageJson.version }, null, 2),
    "utf8",
  );
}

async function launchApp({ apiKey }) {
  const child = spawn("pnpm", ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`, "--remote-allow-origins=*"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AMBIENT_DESKTOP_WORKSPACE: projectRoot,
      AMBIENT_E2E: "1",
      AMBIENT_E2E_USER_DATA: userData,
      AMBIENT_API_KEY: apiKey,
      AMBIENT_AGENT_AMBIENT_API_KEY: apiKey,
      AMBIENT_PI_USER_SETTINGS_PATH: join(userData, "missing-pi-settings.json"),
      AMBIENT_CODEX_CURATED_MARKETPLACE_URL: "0",
      AMBIENT_E2E_SKIP_PROJECT_BOARD_SOURCE_REFRESH: semanticIdleRecoveryMode
        ? "1"
        : process.env.AMBIENT_E2E_SKIP_PROJECT_BOARD_SOURCE_REFRESH,
      AMBIENT_PROJECT_BOARD_DOGFOOD_SEMANTIC_IDLE_FAST_RETRY: semanticIdleRecoveryMode
        ? "1"
        : process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SEMANTIC_IDLE_FAST_RETRY,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  const target = await waitForTarget(port);
  await delay(750);
  const browserCdp = await connectCdpWithRetry(target.webSocketDebuggerUrl, "Electron browser CDP");
  const pageTarget = await waitForPageTarget(browserCdp);
  const attached = await browserCdp.send("Target.attachToTarget", {
    targetId: pageTarget.targetId,
    flatten: true,
  });
  const cdp = browserCdp.session(attached.sessionId);
  return { child, cdp };
}

function expectedCardStatusForReview(status) {
  if (status === "done") return "done";
  if (status === "ready_for_review") return "review";
  return "blocked";
}

function expectedTaskStateForReview(status) {
  if (status === "done") return "done";
  if (status === "ready_for_review") return "needs_review";
  if (status === "terminally_blocked") return "terminal_blocker";
  return "needs_info";
}

function isReadableVisualProofArtifact(artifact) {
  return artifact?.width >= 800 && artifact?.height >= 600 && artifact?.nonBlackPixels > 0 && artifact?.distinctColorCount > 1;
}

function taskActionObservation(proofOfWork) {
  const actions = [proofOfWork?.taskToolActions, proofOfWork?.taskActions, proofOfWork?.modelTaskActions]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter((action) => action && typeof action === "object" && typeof action.action === "string" && action.action.startsWith("task_"));
  const countsByAction = {};
  for (const action of actions) countsByAction[action.action] = (countsByAction[action.action] ?? 0) + 1;
  const terminalActionIndex = actions.findIndex((action) =>
    ["task_report_proof", "task_complete", "task_block", "task_create_followup", "task_report_handoff"].includes(action.action),
  );
  const heartbeatIndex = actions.findIndex((action) => action.action === "task_heartbeat");
  const terminalActions = actions.filter((action) =>
    ["task_report_proof", "task_complete", "task_block", "task_create_followup", "task_report_handoff"].includes(action.action),
  );
  const onlyContextAndHeartbeat = actions.length > 0 && actions.every((action) => action.action === "task_show" || action.action === "task_heartbeat");
  const protocolMissing = [];
  if (actions.length === 0) protocolMissing.push("any_task_action");
  if ((countsByAction.task_heartbeat ?? 0) <= 0) protocolMissing.push("task_heartbeat");
  if (terminalActions.length === 0) protocolMissing.push("terminal_task_action");
  if (onlyContextAndHeartbeat) protocolMissing.push("proof_block_complete_followup_or_handoff");
  return {
    count: actions.length,
    countsByAction,
    heartbeatCount: countsByAction.task_heartbeat ?? 0,
    proofActionCount: countsByAction.task_report_proof ?? 0,
    completeActionCount: countsByAction.task_complete ?? 0,
    blockActionCount: countsByAction.task_block ?? 0,
    followUpActionCount: countsByAction.task_create_followup ?? 0,
    handoffActionCount: countsByAction.task_report_handoff ?? 0,
    terminalActionCount: terminalActions.length,
    terminalActionNames: [...new Set(terminalActions.map((action) => action.action))],
    firstAction: actions[0]?.action,
    onlyContextAndHeartbeat,
    heartbeatBeforeTerminal: heartbeatIndex >= 0 && terminalActionIndex >= 0 && heartbeatIndex < terminalActionIndex,
    protocolSatisfied: protocolMissing.length === 0,
    protocolMissing,
    actions: actions.map((action) => ({
      actionId: action.actionId,
      action: action.action,
      createdAt: action.createdAt,
      summary: action.summary ?? action.reason ?? action.title,
      changedFiles: Array.isArray(action.changedFiles) ? action.changedFiles.length : 0,
      commands: Array.isArray(action.commands) ? action.commands.length : 0,
      screenshots: Array.isArray(action.screenshots) ? action.screenshots.length : 0,
      visualChecks: Array.isArray(action.visualChecks) ? action.visualChecks.length : 0,
      manualChecks: Array.isArray(action.manualChecks) ? action.manualChecks.length : 0,
    })),
  };
}

async function answerKickoff(cdp) {
  let board = await currentBoard(cdp);
  for (const question of board.questions.filter((candidate) => !candidate.answer)) {
    await invoke(cdp, "answerProjectBoardQuestion", {
      questionId: question.id,
      answer: answerForKickoffQuestion(question.question),
    });
    board = await currentBoard(cdp);
  }
  observations.steps.push({ name: "answer-kickoff", answered: board.questions.filter((question) => question.answer).length });
}

function answerForKickoffQuestion(question) {
  const normalized = question.toLowerCase();
  if (/\b(primary|outcome|optimize|goal)\b/.test(normalized)) {
    return "Ship a narrow playable WebGL spaceship vertical slice with a visible ship, hazards, score, restart loop, and traceable proof.";
  }
  if (/\b(source|authoritative|docs|threads)\b/.test(normalized)) {
    return "Treat README, architecture notes, gameplay notes, implementation plan, tests, and WORKFLOW.md as project-manager source material. TODO.md is low-authority scratch.";
  }
  if (/\b(judgment|decision|handle|executing)\b/.test(normalized)) {
    return "When sources conflict, ask targeted PM Review questions and prefer small reversible MVP choices.";
  }
  if (/\b(proof|review|test|done)\b/.test(normalized)) {
    return "Require acceptance criteria plus unit, integration, and visual/manual proof before closing project board cards.";
  }
  return answerForSpaceshipQuestion(question);
}

async function startRefinement(cdp, boardId, proposalId, mode) {
  const input = {
    boardId,
    ...(proposalId ? { proposalId } : {}),
    ...(mode ? { mode } : {}),
  };
  await evaluate(
    cdp,
    [
      "window.__projectBoardDogfoodRefineError = null;",
      "window.ambientDesktop.refineProjectBoardSynthesis(",
      JSON.stringify(input),
      ").catch((error) => { window.__projectBoardDogfoodRefineError = String(error && error.message ? error.message : error); });",
      "true;",
    ].join(""),
  );
}

async function waitForPlanningRunStart(cdp, boardId, previousRunId, label, timeoutMs) {
  return waitForState(
    cdp,
    async () => {
      const detachedError = await readDetachedDogfoodError(cdp);
      if (detachedError) throw new Error(`${label} failed before a planning run started: ${detachedError}`);
      const board = (await readProjectBoardWithSynthesisDetails().catch(() => undefined)) ?? (await currentBoard(cdp));
      const run = latestPlanningSynthesisRunForBoard(board, boardId, previousRunId);
      if (run) return { board, run };
      const latest = latestRunForBoard(board, boardId);
      if (latest && latest.id !== previousRunId && latest.status === "running") return { board, run: latest };
      if (board.cards.length > 0) return { board, run: undefined };
      return undefined;
    },
    label,
    timeoutMs ?? Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PLANNING_START_TIMEOUT_MS || 60_000),
  );
}

async function waitForInitialProjectBoardSourceSnapshot(cdp, boardId) {
  return waitForState(
    cdp,
    async () => {
      const board = await currentBoard(cdp);
      const latest = latestRunForBoard(board, boardId);
      if (latest?.status === "failed") throw new Error(`Initial project-board source snapshot failed: ${latest.error || "unknown error"}`);
      if (board.sources.length > 0 && latest && latest.status !== "running") return board;
      return undefined;
    },
    "initial project-board source snapshot",
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SOURCE_SNAPSHOT_TIMEOUT_MS || 300_000),
  );
}

async function readDetachedDogfoodError(cdp) {
  return evaluate(
    cdp,
    "(() => window.__projectBoardDogfoodFinalizeError || window.__projectBoardDogfoodRefineError || window.__manualRefineError || null)()",
  ).catch(() => null);
}

async function waitForLatestPendingProposal(cdp, boardId, previousProposalId, label) {
  return waitForState(
    cdp,
    async () => {
      const board = await currentBoard(cdp);
      const detachedError = await readDetachedDogfoodError(cdp);
      if (detachedError) throw new Error(`Pi refinement failed before producing a proposal: ${detachedError}`);
      const failed = latestRunForBoard(board, boardId)?.status === "failed" ? latestRunForBoard(board, boardId) : undefined;
      if (failed) throw new Error(`Pi refinement failed: ${failed.error || failed.events?.at(-1)?.summary || "unknown error"}`);
      return readyPendingProjectBoardProposal(board, previousProposalId);
    },
    label,
    900_000,
  );
}

async function waitForTerminalRun(cdp, runId) {
  const idleTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_RUN_IDLE_TIMEOUT_MS || process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_RUN_TIMEOUT_MS || 1_800_000);
  const maxElapsedMs = workerRunMaxElapsedMs;
  const startedAt = Date.now();
  let lastActivityAt = Date.now();
  let lastSignature = "";
  while (true) {
    const run = await readOrchestrationRunFromStore(runId);
    if (!run) throw new Error(`Orchestration run disappeared: ${runId}`);
    const signature = orchestrationRunProgressSignature(run);
    if (signature !== lastSignature) {
      lastSignature = signature;
      lastActivityAt = Date.now();
    }
    if (["completed", "failed", "stalled", "canceled"].includes(run.status)) return run;
    const idleMs = Date.now() - lastActivityAt;
    if (idleMs > idleTimeoutMs) {
      throw new Error(`Timed out waiting for terminal Local Task run; no run progress was observed for ${idleTimeoutMs.toLocaleString()}ms.`);
    }
    const elapsedMs = Date.now() - startedAt;
    if (maxElapsedMs > 0 && elapsedMs > maxElapsedMs) {
      throw new BoundedWorkerRunTimeoutError(
        `Timed out waiting for terminal Local Task run after ${maxElapsedMs.toLocaleString()}ms total elapsed.`,
        run,
        maxElapsedMs,
        elapsedMs,
      );
    }
    await delay(1000);
  }
}

function orchestrationRunProgressSignature(run) {
  const proof = run.proofOfWork && typeof run.proofOfWork === "object" ? run.proofOfWork : {};
  return [
    run.id,
    run.status,
    run.lastEventAt,
    run.finishedAt,
    run.error,
    proof.kind,
    proof.messageCount,
    proof.assistantMessageCount,
    proof.toolMessageCount,
    proof.runningToolMessageCount,
    proof.completedToolMessageCount,
    proof.outputCharCount,
    proof.assistantOutputCharCount,
    proof.toolOutputCharCount,
    proof.lastActivityAt,
    proof.lastAssistantText,
    taskActionObservation(proof).count,
  ].join("|");
}

async function waitForPreparedRun(cdp, taskId, title) {
  return waitForState(
    cdp,
    async () => {
      const board = await readOrchestrationBoardFromStore();
      const run = board.runs.find((candidate) => candidate.taskId === taskId && candidate.status === "prepared");
      return run ? { board, run } : undefined;
    },
    `prepared Local Task run for ${title}`,
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PREPARE_TIMEOUT_MS || 300_000),
  );
}

async function waitForPreparedOrStartedRun(cdp, taskId, title) {
  return waitForState(
    cdp,
    async () => {
      const board = await readOrchestrationBoardFromStore();
      const run = board.runs.find((candidate) => candidate.taskId === taskId && ["prepared", "running", "completed", "failed", "stalled", "canceled"].includes(candidate.status));
      return run ? { board, run } : undefined;
    },
    `prepared or started Local Task run for ${title}`,
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PREPARE_TIMEOUT_MS || 300_000),
  );
}

async function waitForActiveBoard(cdp) {
  return waitForState(
    cdp,
    async () => {
      const board = await currentBoard(cdp);
      return board.status === "active" ? board : undefined;
    },
    "active project board",
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_BOARD_TIMEOUT_MS || 300_000),
  );
}

async function waitForCardProofReview(cdp, cardId) {
  return waitForState(
    cdp,
    async () => {
      const board = await currentBoard(cdp);
      const card = board.cards.find((candidate) => candidate.id === cardId);
      return card?.proofReview ? card : undefined;
    },
    "card PM proof review",
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_REVIEW_TIMEOUT_MS || 180_000),
  );
}

async function currentBoard(cdp) {
  const board = await readProjectBoardFromStore();
  if (board) return board;
  const state = await invoke(cdp, "bootstrap");
  return boardFromState(state);
}

async function readProjectBoardFromStore() {
  return readProjectBoardSnapshot(projectRoot, { runCommand, includeProgressiveRecordCount: true });
}

async function readProjectBoardReleaseGateSnapshot() {
  return readProjectBoardSnapshot(projectRoot, { runCommand, includeProofScopeWarnings: true });
}

async function readProjectBoardWithSynthesisDetails() {
  return readProjectBoardSnapshot(projectRoot, {
    runCommand,
    includeProgressiveRecordCount: true,
    includeSynthesisEvents: true,
  });
}

async function readOrchestrationBoardFromStore() {
  return readOrchestrationBoardSnapshot(projectRoot, { runCommand });
}

async function readOrchestrationRunFromStore(runId) {
  return readOrchestrationRunSnapshot(projectRoot, runId, { runCommand });
}

function boardFromState(state) {
  const project = state.projects.find((candidate) => candidate.path === state.workspace.path);
  if (!project?.board) throw new Error("Expected active project to have a project board.");
  return project.board;
}

async function latestSynthesisRun(cdp, boardId) {
  const board = await currentBoard(cdp);
  return latestRunForBoard(board, boardId);
}

async function waitForTerminalSynthesisRun(cdp, boardId, runId, label) {
  const idleTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SYNTHESIS_TIMEOUT_MS || 1_800_000);
  let lastActivityAt = Date.now();
  let lastSignature = "";
  while (true) {
    const board = await currentBoard(cdp);
    const run = latestRunForBoard(board, boardId);
    if (run) {
      const signature = [
        run.id,
        run.status,
        run.stage,
        run.promptCharCount,
        run.responseCharCount,
        run.cardCount,
        run.questionCount,
        run.progressiveRecordCount,
        run.updatedAt,
        run.completedAt,
      ].join("|");
      if (signature !== lastSignature) {
        lastSignature = signature;
        lastActivityAt = Date.now();
      }
      if (!(run.id !== runId && run.status === "running") && run.status !== "running") return run;
    }
    if (Date.now() - lastActivityAt > idleTimeoutMs) {
      throw new Error(`Timed out waiting for ${label}; no synthesis progress was observed for ${idleTimeoutMs.toLocaleString()}ms.`);
    }
    await delay(1000);
  }
}

async function waitForFreshStartSynthesisCards(boardId, runId) {
  const idleTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_START_FRESH_PROGRESS_IDLE_TIMEOUT_MS || 360_000);
  let lastActivityAt = Date.now();
  let lastSignature = "";
  let lastRunSummary = "no run observed";
  while (true) {
    const board = await readProjectBoardWithSynthesisDetails();
    const run = board?.synthesisRuns.find((candidate) => candidate.id === runId) ?? latestRunForBoard(board, boardId);
    if (run) {
      const freshSourcePrefix = `start-fresh:${run.id}:`;
      const cards = boardSynthesisCards(board).filter((card) => String(card.sourceId ?? "").startsWith(freshSourcePrefix));
      const signature = [
        run.id,
        run.status,
        run.stage,
        run.promptCharCount,
        run.responseCharCount,
        run.cardCount,
        run.questionCount,
        progressiveRecordCount(run),
        run.updatedAt,
        run.completedAt,
        cards.length,
      ].join("|");
      lastRunSummary = `${run.status}/${run.stage ?? "no-stage"} responseChars=${run.responseCharCount ?? 0} records=${progressiveRecordCount(run)} cards=${cards.length}`;
      if (signature !== lastSignature) {
        lastSignature = signature;
        lastActivityAt = Date.now();
      }
      if (run.status === "failed") {
        throw new Error(`Start Fresh synthesis failed while waiting for fresh cards: ${run.error || run.events?.at(-1)?.summary || "unknown error"}`);
      }
      if (cards.length > 0) return { board, run, cards };
      if (run.status !== "running" && run.status !== "pause_requested") {
        throw new Error(`Start Fresh synthesis finished without rendering fresh cards (${lastRunSummary}).`);
      }
    }
    if (Date.now() - lastActivityAt > idleTimeoutMs) {
      throw new Error(
        `Timed out waiting for fresh PM Review synthesis progress after Start Fresh; no synthesis activity was observed for ${idleTimeoutMs.toLocaleString()}ms (${lastRunSummary}).`,
      );
    }
    await delay(1000);
  }
}

async function waitForIncrementalSynthesisMilestones(cdp, boardId, runId, label, options = {}) {
  const idleTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SYNTHESIS_TIMEOUT_MS || 1_800_000);
  const observedStartedAt = Date.now();
  let synthesisStartedAt = observedStartedAt;
  let lastActivityAt = Date.now();
  let lastSignature = "";
  let firstCard;
  let firstTicketizedCard;
  let maxCardCount = 0;
  let maxTicketizedCardCount = 0;
  const samples = [];

  while (true) {
    const board = await currentBoard(cdp);
    const snapshot = projectBoardIncrementalSynthesisSnapshot(board, boardId);
    const run = snapshot.run;
    maxCardCount = Math.max(maxCardCount, snapshot.boardSynthesisCardCount);
    maxTicketizedCardCount = Math.max(maxTicketizedCardCount, snapshot.ticketizedCardCount);

    if (run?.startedAt) synthesisStartedAt = timestampMs(run.startedAt) ?? synthesisStartedAt;
    if (!firstCard && snapshot.firstCard) {
      firstCard = {
        observedAt: new Date().toISOString(),
        elapsedMs: Date.now() - synthesisStartedAt,
        observedElapsedMs: Date.now() - observedStartedAt,
        cardCount: snapshot.boardSynthesisCardCount,
        card: snapshot.firstCard,
      };
    }
    if (!firstTicketizedCard && snapshot.firstTicketizedCard) {
      firstTicketizedCard = {
        observedAt: new Date().toISOString(),
        elapsedMs: Date.now() - synthesisStartedAt,
        observedElapsedMs: Date.now() - observedStartedAt,
        ticketizedCardCount: snapshot.ticketizedCardCount,
        card: snapshot.firstTicketizedCard,
      };
      if (options.returnOnFirstTicketized) {
        return {
          boardId,
          runId: run?.id ?? runId,
          terminalRun: undefined,
          returnedEarly: true,
          returnReason: "first_ticketized_card",
          firstCard,
          firstTicketizedCard,
          maxCardCount,
          maxTicketizedCardCount,
          sampleCount: samples.length,
          samples,
        };
      }
    }

    if (run) {
      const signature = [
        run.id,
        run.status,
        run.stage,
        run.promptCharCount,
        run.responseCharCount,
        run.cardCount,
        run.questionCount,
        progressiveRecordCount(run),
        run.updatedAt,
        run.completedAt,
        snapshot.boardSynthesisCardCount,
        snapshot.ticketizedCardCount,
      ].join("|");
      if (signature !== lastSignature) {
        lastSignature = signature;
        lastActivityAt = Date.now();
        if (samples.length < 80) {
          samples.push({
            observedAt: new Date().toISOString(),
            elapsedMs: Date.now() - synthesisStartedAt,
            status: run.status,
            stage: run.stage,
            promptCharCount: run.promptCharCount,
            responseCharCount: run.responseCharCount,
            runCardCount: run.cardCount,
            progressiveRecordCount: progressiveRecordCount(run),
            boardSynthesisCardCount: snapshot.boardSynthesisCardCount,
            ticketizedCardCount: snapshot.ticketizedCardCount,
          });
        }
      }
      if (!(run.id !== runId && run.status === "running") && run.status !== "running") {
        return {
          boardId,
          runId: run.id,
          terminalRun: run,
          firstCard,
          firstTicketizedCard,
          maxCardCount,
          maxTicketizedCardCount,
          sampleCount: samples.length,
          samples,
        };
      }
    }

    if (Date.now() - lastActivityAt > idleTimeoutMs) {
      throw new Error(`Timed out waiting for ${label}; no synthesis progress or incremental board mutation was observed for ${idleTimeoutMs.toLocaleString()}ms.`);
    }
    await delay(1000);
  }
}

async function observeInitialIncrementalSynthesis(cdp, boardId, runId) {
  const incremental = await waitForIncrementalSynthesisMilestones(cdp, boardId, runId, "initial board synthesis", {
    returnOnFirstTicketized: executeFirstReadyDuringSynthesis,
  });
  const settledRun = incremental.terminalRun;
  observations.steps.push({
    name: "initial-board-incremental-milestones",
    ...incrementalObservation(incremental),
  });
  if (settledRun) {
    observations.steps.push({
      name: "initial-board-synthesis",
      runId: settledRun.id,
      status: settledRun.status,
      stage: settledRun.stage,
      cardCount: settledRun.cardCount,
      questionCount: settledRun.questionCount,
      responseCharCount: settledRun.responseCharCount,
    });
  } else {
    observations.steps.push({
      name: "initial-board-synthesis",
      status: "still_running",
      reason: "Dogfood switched to the first auto-ticketized card before full board synthesis completed.",
      firstAutoTicketizedCardId: incremental.firstTicketizedCard?.card?.id,
    });
  }
  if (settledRun?.status === "failed") {
    throw new Error(`Initial board synthesis failed: ${settledRun.error || settledRun.events?.at(-1)?.summary || "unknown error"}`);
  }
  return { firstAutoTicketizedCardId: incremental.firstTicketizedCard?.card?.id };
}

function incrementalObservation(input) {
  const terminalRun = input.terminalRun;
  return {
    boardId: input.boardId,
    runId: input.runId,
    returnedEarly: input.returnedEarly,
    returnReason: input.returnReason,
    terminalStatus: terminalRun?.status,
    terminalStage: terminalRun?.stage,
    sourceCount: terminalRun?.sourceCount,
    includedSourceCount: terminalRun?.includedSourceCount,
    sourceCharCount: terminalRun?.sourceCharCount,
    promptCharCount: terminalRun?.promptCharCount,
    responseCharCount: terminalRun?.responseCharCount,
    terminalCardCount: terminalRun?.cardCount,
    progressiveRecordCount: progressiveRecordCount(terminalRun),
    timeToFirstCardMs: input.firstCard?.elapsedMs,
    timeToFirstTicketizedTaskMs: input.firstTicketizedCard?.elapsedMs,
    firstCard: input.firstCard,
    firstTicketizedCard: input.firstTicketizedCard,
    maxBoardSynthesisCardCount: input.maxCardCount,
    maxTicketizedCardCount: input.maxTicketizedCardCount,
    samples: input.samples,
  };
}

function timestampMs(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function progressiveRecordCount(run) {
  return run?.progressiveRecordCount ?? run?.progressiveRecords?.length ?? 0;
}

function latestRunForBoard(board, boardId) {
  return latestSynthesisRunForBoard(board, boardId);
}

function resumedSynthesisRunForBoard(board, boardId, pausedRunId) {
  return [...(board?.synthesisRuns ?? [])]
    .filter((run) => run.boardId === boardId && run.retryOfRunId === pausedRunId)
    .sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))[0];
}

function proposalObservation(name, proposal, run) {
  return {
    name,
    proposalId: proposal.id,
    cardCount: proposal.cards.length,
    questionCount: proposal.questions.length,
    proofCardCount: proposal.cards.filter((card) => card.acceptanceCriteria.length > 0 && Object.values(card.testPlan).some((items) => items.length > 0)).length,
    dependencyCardCount: proposal.cards.filter((card) => card.blockedBy.length > 0).length,
    model: proposal.model,
    durationMs: proposal.durationMs,
    run: run
      ? {
          id: run.id,
          status: run.status,
          stage: run.stage,
          sourceCount: run.sourceCount,
          includedSourceCount: run.includedSourceCount,
          sourceCharCount: run.sourceCharCount,
          promptCharCount: run.promptCharCount,
          responseCharCount: run.responseCharCount,
          cardCount: run.cardCount,
          questionCount: run.questionCount,
          error: run.error,
        }
      : undefined,
    questions: proposal.questions,
    cards: proposal.cards.map((card) => ({
      sourceId: card.sourceId,
      title: card.title,
      candidateStatus: card.candidateStatus,
      priority: card.priority,
      phase: card.phase,
      blockedBy: card.blockedBy,
      proofKinds: Object.entries(card.testPlan)
        .filter(([, items]) => Array.isArray(items) && items.length > 0)
        .map(([kind]) => kind),
    })),
  };
}

async function captureProjectBoardMapSmoke(cdp, board) {
  await clickButton(cdp, "Map");
  await waitFor(cdp, () => document.querySelector(".project-board-map-panel") !== null, "project board map panel", 10_000);
  await delay(500);
  const screenshotDir = join(runRoot, "screenshots");
  await mkdir(screenshotDir, { recursive: true });
  const screenshotPath = join(screenshotDir, "project-board-map.png");
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  const screenshotAnalysis = analyzePng(await readFile(screenshotPath));
  const dom = await evaluate(
    cdp,
    `(() => {
      const text = (selector) => [...document.querySelectorAll(selector)].map((node) => node.textContent?.replace(/\\s+/g, " ").trim()).filter(Boolean);
      const style = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const computed = getComputedStyle(node);
        return { borderColor: computed.borderColor, backgroundColor: computed.backgroundColor, color: computed.color };
      };
      return {
        activeTab: document.querySelector('[aria-selected="true"]')?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
        criticalPath: text(".project-board-critical-path"),
        phaseHeaders: text(".project-board-map-phase > header"),
        readinessBadges: text(".project-board-map-badges"),
        unblocks: text(".project-board-map-unblocks"),
        warnings: text(".project-board-map-warnings, .project-board-map-issues"),
        cardCount: document.querySelectorAll(".project-board-map-card").length,
        criticalCardCount: document.querySelectorAll(".project-board-map-card.critical-path").length,
        readyCardStyle: style(".project-board-map-card.ready_now"),
        criticalPathStyle: style(".project-board-critical-path"),
      };
    })()`,
  );
  assert(screenshotAnalysis.width >= 1200 && screenshotAnalysis.height >= 800, `Expected large map screenshot, got ${screenshotAnalysis.width}x${screenshotAnalysis.height}.`);
  assert(screenshotAnalysis.nonBlackRatio > 0.5 && screenshotAnalysis.distinctColorCount > 24, `Expected readable nonblank map screenshot, got ${JSON.stringify(screenshotAnalysis)}.`);
  assert(dom.cardCount >= 3, `Expected at least three map cards from the first staged planning batch, got ${dom.cardCount}.`);
  assert(dom.criticalPath.length > 0, "Expected the map smoke to render critical path copy.");
  assert(dom.phaseHeaders.length > 0, "Expected the map smoke to render phase groups.");
  return {
    name: "map-smoke",
    boardId: board.id,
    screenshotPath: screenshotPath.replace(`${runRoot}/`, ""),
    screenshot: screenshotAnalysis,
    dom,
  };
}

async function runSemanticIdleSectionRecoveryDogfood(cdp, boardId) {
  const seededState = await invoke(cdp, "seedProjectBoardSemanticIdleDogfood", { boardId });
  let board = boardFromState(seededState);
  const seededRun = latestRunForBoard(board, boardId);
  assert(seededRun, "Expected semantic-idle dogfood seed to create a synthesis run.");
  assert(seededRun.status === "succeeded", `Expected seeded semantic-idle run to be applied, got ${seededRun.status}.`);
  assert(seededRun.progressiveSummary?.semanticIdleSectionCount === 1, "Expected seeded run to record one semantic-idle stalled section.");
  assert(
    seededRun.progressiveSummary?.latestError?.includes("Combat stalled"),
    `Expected seeded run to preserve the Combat stall error, got ${seededRun.progressiveSummary?.latestError ?? "missing error"}.`,
  );
  assert(
    board.cards.some((card) => card.sourceId === "synthesis:dogfood-foundation-shell"),
    "Expected the partial dogfood run to apply the preserved Foundation card.",
  );
  assert((seededRun.questionCount ?? 0) >= 1, "Expected the partial dogfood run to preserve the stalled-section clarification question on the synthesis run.");

  await waitFor(cdp, () => document.body.innerText.includes("Retry Failed Sections"), "seeded semantic-idle ledger visible", 20_000);
  await clickButtonIn(cdp, ".project-board-tabs", "History");
  await waitFor(cdp, () => document.querySelector(".project-board-history-panel") !== null, "project board History panel", 20_000);
  await waitFor(
    cdp,
    () => {
      const text = document.body.innerText.toLowerCase();
      return (
        text.includes("recovery actions") &&
        text.includes("failed source sections need a decision") &&
        text.includes("retry failed sections now") &&
        text.includes("view progressive records")
      );
    },
    "semantic-idle History recovery actions",
    20_000,
  );
  await clickButton(cdp, "View progressive records");
  await waitFor(
    cdp,
    () => {
      const text = document.body.innerText.toLowerCase();
      return text.includes("stalled section 2/2") && text.includes("semantic_idle_timeout") && text.includes("dogfood/semantic-idle-combat.md");
    },
    "semantic-idle progressive record preview",
    20_000,
  );
  const beforeRetryScreenshot = await captureDogfoodScreenshot(cdp, "semantic-idle-before-retry.png");

  await clickButton(cdp, "Retry failed sections now");
  board = await waitForState(
    cdp,
    async () => {
      const next = boardFromState(await invoke(cdp, "bootstrap"));
      const retryRun = latestRunForBoard(next, boardId);
      if (
        retryRun?.retryOfRunId === seededRun.id &&
        retryRun.status === "succeeded" &&
        (retryRun.progressiveSummary?.sectionSkippedCount ?? 0) >= 1 &&
        (retryRun.progressiveSummary?.semanticIdleSectionCount ?? 0) === 0 &&
        next.cards.some((card) => card.sourceId === "synthesis:dogfood-combat-loop")
      ) {
        return next;
      }
      return undefined;
    },
    "semantic-idle retry through project-board UI",
    20_000,
  );
  await clickButton(cdp, "View progressive records");
  await waitFor(
    cdp,
    () => {
      const text = document.body.innerText.toLowerCase();
      return text.includes("combat was replanned during the retry") && text.includes("add the retried dogfood combat loop");
    },
    "semantic-idle retry progressive records",
    20_000,
  );
  const afterRetryScreenshot = await captureDogfoodScreenshot(cdp, "semantic-idle-after-retry.png");

  const retryRun = latestRunForBoard(board, boardId);
  const foundationCards = board.cards.filter((card) => card.sourceId === "synthesis:dogfood-foundation-shell");
  const combatCards = board.cards.filter((card) => card.sourceId === "synthesis:dogfood-combat-loop");
  assert(foundationCards.length === 1, `Expected one preserved Foundation card after retry, got ${foundationCards.length}.`);
  assert(combatCards.length === 1, `Expected one Combat card after retry, got ${combatCards.length}.`);
  assert(
    combatCards[0]?.blockedBy.includes("synthesis:dogfood-foundation-shell"),
    "Expected retried Combat card to remain blocked by the preserved Foundation card.",
  );

  return {
    name: "semantic-idle-section-recovery",
    boardId,
    runId: seededRun.id,
    retryRunId: retryRun?.id,
    status: retryRun?.status,
    cardCount: board.cards.length,
    questionCount: seededRun.questionCount,
    semanticIdleSectionCountBeforeRetry: seededRun.progressiveSummary?.semanticIdleSectionCount,
    semanticIdleSectionCountAfterRetry: retryRun?.progressiveSummary?.semanticIdleSectionCount ?? 0,
    skippedSectionCountAfterRetry: retryRun?.progressiveSummary?.sectionSkippedCount ?? 0,
    screenshots: {
      beforeRetry: beforeRetryScreenshot,
      afterRetry: afterRetryScreenshot,
    },
  };
}

async function runPauseResumePlanningDogfood(cdp, boardId) {
  const autoDispatch = await invoke(cdp, "setOrchestrationAutoDispatchEnabled", { enabled: false }).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
  await clickProjectBoardReviewTab(cdp);
  let board = await currentBoard(cdp);
  const startIntent = planningStartIntentForBoard(board, boardId);
  if (startIntent.shouldStartNewRun) {
    await startRefinement(cdp, boardId);
  }
  const started = await waitForPlanningRunStart(cdp, boardId, startIntent.previousRunId, "pause/resume PM Review synthesis start");
  assert(started.run?.id, "Expected pause/resume dogfood to start a live planning synthesis run.");
  observations.steps.push({
    name: "pause-resume-start",
    boardId,
    runId: started.run.id,
    previousRunId: startIntent.previousRunId,
    explicitStart: startIntent.shouldStartNewRun,
    status: started.run.status,
    stage: started.run.stage,
    autoDispatch,
  });

  await clickProjectBoardReviewTab(cdp);
  await waitFor(cdp, () => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Pause Planning") && !button.disabled), "PM Review Pause Planning button", 120_000);
  const runningScreenshot = await captureDogfoodScreenshot(cdp, "pause-resume-01-running.png");

  const readyToPause = await waitForState(
    cdp,
    async () => {
      const next = await currentBoard(cdp);
      const run = next.synthesisRuns.find((candidate) => candidate.id === started.run.id) ?? latestRunForBoard(next, boardId);
      if (run?.status === "failed") {
        throw new Error(`Pause/resume synthesis failed before pause: ${run.error || run.events?.at(-1)?.summary || "unknown error"}`);
      }
      if (run?.status !== "running") return undefined;
      const snapshot = projectBoardIncrementalSynthesisSnapshot(next, boardId);
      return snapshot.boardSynthesisCardCount > 0 ? { board: next, run, snapshot } : undefined;
    },
    "first rendered planning card before pause",
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PAUSE_FIRST_CARD_TIMEOUT_MS || 360_000),
  );

  await clickButton(cdp, "Pause Planning", 60_000);
  const paused = await waitForState(
    cdp,
    async () => {
      const next = await currentBoard(cdp);
      const run = next.synthesisRuns.find((candidate) => candidate.id === started.run.id) ?? latestRunForBoard(next, boardId);
      if (run?.status === "failed") {
        throw new Error(`Pause/resume synthesis failed while pausing: ${run.error || run.events?.at(-1)?.summary || "unknown error"}`);
      }
      return run?.status === "paused" ? { board: next, run } : undefined;
    },
    "paused PM Review synthesis run",
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PAUSE_TIMEOUT_MS || 180_000),
  );

  await clickProjectBoardReviewTab(cdp);
  await waitFor(
    cdp,
    () => {
      const activityResumeButton = document.querySelector(".project-board-synthesis-activity.run-activity-card button");
      return (
        document.body.innerText.includes("Planning is paused at a validated checkpoint") &&
        Boolean(activityResumeButton?.textContent?.includes("Resume Planning")) &&
        !activityResumeButton?.disabled &&
        Boolean(activityResumeButton.querySelector("svg.lucide-play")) &&
        !activityResumeButton.querySelector("svg.lucide-pause")
      );
    },
    "PM Review paused-run compact resume control",
    60_000,
  );
  const pausedScreenshot = await captureDogfoodScreenshot(cdp, "pause-resume-02-paused.png");
  const pausedCards = boardSynthesisCards(paused.board);
  const pausedDuplicates = duplicateTitleMetrics(pausedCards);
  assert(pausedCards.length > 0, "Expected at least one rendered card to be checkpointed before pausing.");
  assert(pausedDuplicates.duplicateCardCount === 0, `Expected no duplicate rendered cards at pause, got ${JSON.stringify(pausedDuplicates.duplicateGroups)}.`);

  await clickButton(cdp, "Resume Planning", 60_000);
  const resumedStart = await waitForState(
    cdp,
    async () => {
      const next = await currentBoard(cdp);
      const run = resumedSynthesisRunForBoard(next, boardId, paused.run.id);
      if (!run) return undefined;
      if (run.status === "failed") {
        throw new Error(`Pause/resume synthesis failed after resume: ${run.error || run.events?.at(-1)?.summary || "unknown error"}`);
      }
      return { board: next, run };
    },
    "resumed PM Review synthesis run",
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_RESUME_START_TIMEOUT_MS || 180_000),
  );

  const requireTerminalResume = process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PAUSE_RESUME_REQUIRE_TERMINAL === "1";
  const resumedProgress =
    requireTerminalResume && (resumedStart.run.status === "running" || resumedStart.run.status === "pause_requested")
      ? { board: await currentBoard(cdp), run: await waitForTerminalSynthesisRun(cdp, boardId, resumedStart.run.id, "resumed PM Review synthesis"), terminal: true }
      : await waitForState(
          cdp,
          async () => {
            const next = await currentBoard(cdp);
            const run = next.synthesisRuns.find((candidate) => candidate.id === resumedStart.run.id) ?? latestRunForBoard(next, boardId);
            if (!run) return undefined;
            if (run.status === "failed") {
              throw new Error(`Pause/resume synthesis failed after resume: ${run.error || run.events?.at(-1)?.summary || "unknown error"}`);
            }
            const cards = boardSynthesisCards(next);
            const terminal = run.status !== "running" && run.status !== "pause_requested";
            if (terminal || cards.length > pausedCards.length) return { board: next, run, terminal };
            return undefined;
          },
          "post-resume rendered planning progress",
          Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_RESUME_PROGRESS_TIMEOUT_MS || 360_000),
        );

  board = resumedProgress.board;
  let resumedRun = resumedProgress.run;
  if (requireTerminalResume) {
    assert(resumedRun.status === "succeeded", `Expected resumed synthesis to succeed, got ${resumedRun.status}: ${resumedRun.error ?? "no error"}`);
  }
  const resumedCards = boardSynthesisCards(board);
  const newestResumedCard = resumedCards.find((card) => !pausedCards.some((pausedCard) => pausedCard.id === card.id));
  await clickButton(cdp, "Draft Inbox");
  if (newestResumedCard?.title) {
    await waitFor(cdp, new Function(`return document.body.innerText.includes(${JSON.stringify(newestResumedCard.title)});`), "resumed card visible in Draft Inbox", 60_000);
  }
  const resumedScreenshot = await captureDogfoodScreenshot(cdp, "pause-resume-03-resumed-draft-inbox.png");
  const resumedDuplicates = duplicateTitleMetrics(resumedCards);
  assert(resumedCards.length >= pausedCards.length, `Expected resumed card count ${resumedCards.length} to preserve paused card count ${pausedCards.length}.`);
  assert(resumedDuplicates.duplicateCardCount === 0, `Expected no duplicate rendered cards after resume, got ${JSON.stringify(resumedDuplicates.duplicateGroups)}.`);

  let cleanupPause;
  if (!requireTerminalResume && (resumedRun.status === "running" || resumedRun.status === "pause_requested")) {
    cleanupPause = await pauseRunningSynthesisFromUi(cdp, boardId, resumedRun.id).catch((error) => ({
      status: "not_paused",
      error: error instanceof Error ? error.message : String(error),
    }));
    board = await currentBoard(cdp);
    resumedRun = board.synthesisRuns.find((candidate) => candidate.id === resumedRun.id) ?? resumedRun;
  }

  return {
    name: "pause-resume-planning-ui",
    boardId,
    pausedRunId: paused.run.id,
    resumedRunId: resumedRun.id,
    pausedRunStatus: paused.run.status,
    resumedRunStatus: resumedRun.status,
    resumedProgressTerminal: resumedProgress.terminal,
    firstCardBeforePause: readyToPause.snapshot.firstCard,
    pausedCardCount: pausedCards.length,
    resumedCardCount: resumedCards.length,
    duplicateCardRate: resumedDuplicates.duplicateCardRate,
    duplicateCardCount: resumedDuplicates.duplicateCardCount,
    retryOfRunId: resumedRun.retryOfRunId,
    progressiveRecordCountBeforePause: progressiveRecordCount(paused.run),
    progressiveRecordCountAfterResume: progressiveRecordCount(resumedRun),
    cleanupPause,
    screenshots: {
      running: runningScreenshot,
      paused: pausedScreenshot,
      resumed: resumedScreenshot,
    },
  };
}

async function startPlanningAndWaitForFirstRenderedCardWithTransientRetries(cdp, boardId, label) {
  const maxAttempts = Math.max(1, Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_START_FRESH_TRANSIENT_ATTEMPTS || 3));
  const transientRetries = [];
  let board = await currentBoard(cdp);
  let startIntent = planningStartIntentForBoard(board, boardId);
  let previousRunId = startIntent.previousRunId;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const shouldStartNewRun = attempt > 1 || startIntent.shouldStartNewRun;
    try {
      if (shouldStartNewRun) await startRefinement(cdp, boardId);
      const started = await waitForPlanningRunStart(
        cdp,
        boardId,
        previousRunId,
        `${label} PM Review synthesis start${attempt > 1 ? ` retry ${attempt}` : ""}`,
      );
      const readyToPause = await waitForFirstRenderedPlanningCard(
        cdp,
        boardId,
        started.run.id,
        `${label} first rendered planning card before pause${attempt > 1 ? ` retry ${attempt}` : ""}`,
      );
      return {
        started,
        readyToPause,
        previousRunId,
        explicitStart: shouldStartNewRun,
        transientRetries,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= maxAttempts || !isTransientAmbientDogfoodError(message)) throw error;
      board = (await readProjectBoardWithSynthesisDetails().catch(() => undefined)) ?? (await currentBoard(cdp).catch(() => undefined));
      const latest = latestRunForBoard(board, boardId);
      if (latest?.id) previousRunId = latest.id;
      transientRetries.push({
        stage: label,
        attempt,
        nextAttempt: attempt + 1,
        runId: latest?.id,
        runStatus: latest?.status,
        error: message.slice(0, 500),
      });
      await evaluate(cdp, "window.__projectBoardDogfoodFinalizeError = null; window.__projectBoardDogfoodRefineError = null; true;").catch(() => undefined);
      await delay(Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_START_FRESH_TRANSIENT_RETRY_DELAY_MS || 30_000));
      startIntent = { shouldStartNewRun: true, previousRunId, inFlightRun: undefined };
    }
  }
  throw new Error(`${label} did not render a planning card after ${maxAttempts} attempt(s).`);
}

async function waitForFirstRenderedPlanningCard(cdp, boardId, runId, label) {
  const idleTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PAUSE_FIRST_CARD_IDLE_TIMEOUT_MS || 360_000);
  let lastActivityAt = Date.now();
  let lastSignature = "";
  let lastRunSummary = "no run observed";
  while (true) {
    const next = (await readProjectBoardWithSynthesisDetails().catch(() => undefined)) ?? (await currentBoard(cdp));
    const run = next.synthesisRuns.find((candidate) => candidate.id === runId) ?? latestRunForBoard(next, boardId);
    if (run) {
      const snapshot = projectBoardIncrementalSynthesisSnapshot(next, boardId);
      const signature = [
        run.id,
        run.status,
        run.stage,
        run.promptCharCount,
        run.responseCharCount,
        run.cardCount,
        run.questionCount,
        progressiveRecordCount(run),
        run.updatedAt,
        run.completedAt,
        snapshot.boardSynthesisCardCount,
      ].join("|");
      lastRunSummary = `${run.status}/${run.stage ?? "no-stage"} responseChars=${run.responseCharCount ?? 0} records=${progressiveRecordCount(run)} cards=${snapshot.boardSynthesisCardCount}`;
      if (signature !== lastSignature) {
        lastSignature = signature;
        lastActivityAt = Date.now();
      }
      if (run.status === "failed") {
        throw new Error(`${label} failed: ${run.error || run.events?.at(-1)?.summary || "unknown error"}`);
      }
      if (snapshot.boardSynthesisCardCount > 0) return { board: next, run, snapshot };
      if (run.status !== "running" && run.status !== "pause_requested") {
        throw new Error(`${label} finished without rendering a planning card (${lastRunSummary}).`);
      }
    }
    if (Date.now() - lastActivityAt > idleTimeoutMs) {
      throw new Error(`Timed out waiting for ${label}; no synthesis activity was observed for ${idleTimeoutMs.toLocaleString()}ms (${lastRunSummary}).`);
    }
    await delay(1000);
  }
}

async function runStartFreshPlanningDogfood(cdp, boardId) {
  const autoDispatch = await invoke(cdp, "setOrchestrationAutoDispatchEnabled", { enabled: false }).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
  await clickProjectBoardReviewTab(cdp);
  const initialPlanning = await startPlanningAndWaitForFirstRenderedCardWithTransientRetries(cdp, boardId, "Start Fresh");
  const started = initialPlanning.started;
  assert(started.run?.id, "Expected Start Fresh dogfood to start a live planning synthesis run.");
  observations.steps.push({
    name: "start-fresh-start",
    boardId,
    runId: started.run.id,
    previousRunId: initialPlanning.previousRunId,
    explicitStart: initialPlanning.explicitStart,
    status: started.run.status,
    stage: started.run.stage,
    autoDispatch,
    transientRetryCount: initialPlanning.transientRetries.length,
    transientRetries: initialPlanning.transientRetries,
  });

  await clickProjectBoardReviewTab(cdp);
  await waitFor(cdp, () => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Pause Planning") && !button.disabled), "PM Review Pause Planning button", 120_000);
  const runningScreenshot = await captureDogfoodScreenshot(cdp, "start-fresh-01-running.png");

  await clickButton(cdp, "Pause Planning", 60_000);
  const paused = await waitForState(
    cdp,
    async () => {
      const next = await currentBoard(cdp);
      const run = next.synthesisRuns.find((candidate) => candidate.id === started.run.id) ?? latestRunForBoard(next, boardId);
      if (run?.status === "failed") {
        throw new Error(`Start Fresh synthesis failed while pausing: ${run.error || run.events?.at(-1)?.summary || "unknown error"}`);
      }
      return run?.status === "paused" ? { board: next, run } : undefined;
    },
    "paused PM Review synthesis run before Start Fresh",
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PAUSE_TIMEOUT_MS || 180_000),
  );

  await clickProjectBoardReviewTab(cdp);
  await waitFor(
    cdp,
    () =>
      document.body.innerText.includes("Planning is paused at a validated checkpoint") &&
      [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Resume Planning") && !button.disabled) &&
      [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Start Fresh") && !button.disabled),
    "PM Review paused-run Start Fresh controls",
    60_000,
  );
  const pausedScreenshot = await captureDogfoodScreenshot(cdp, "start-fresh-02-paused.png");
  const abandonedCheckpointCards = boardSynthesisCards(paused.board);
  const abandonedCheckpointDuplicates = duplicateTitleMetrics(abandonedCheckpointCards);
  assert(abandonedCheckpointCards.length > 0, "Expected at least one rendered card to exist before Start Fresh.");
  assert(
    abandonedCheckpointDuplicates.duplicateCardCount === 0,
    `Expected no duplicate rendered cards before Start Fresh, got ${JSON.stringify(abandonedCheckpointDuplicates.duplicateGroups)}.`,
  );

  await evaluate(
    cdp,
    `(() => {
      window.__projectBoardDogfoodOriginalConfirm = window.confirm;
      window.confirm = () => true;
      return true;
    })()`,
  );
  await clickButton(cdp, "Start Fresh", 60_000);
  await evaluate(
    cdp,
    `(() => {
      if (window.__projectBoardDogfoodOriginalConfirm) window.confirm = window.__projectBoardDogfoodOriginalConfirm;
      return true;
    })()`,
  ).catch(() => undefined);

  const freshStart = await waitForState(
    cdp,
    async () => {
      const next = await readProjectBoardWithSynthesisDetails();
      const abandonedRun = next?.synthesisRuns.find((candidate) => candidate.id === paused.run.id);
      const run = latestRunForBoard(next, boardId);
      if (run?.status === "failed") {
        throw new Error(`Start Fresh synthesis failed after fresh start: ${run.error || run.events?.at(-1)?.summary || "unknown error"}`);
      }
      if (abandonedRun?.status === "abandoned" && run?.id && run.id !== paused.run.id) {
        return { board: next, abandonedRun, run };
      }
      return undefined;
    },
    "fresh PM Review synthesis run after abandoning paused checkpoint",
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_START_FRESH_START_TIMEOUT_MS || 180_000),
  );

  const freshProgress = await waitForFreshStartSynthesisCards(boardId, freshStart.run.id);

  let board = freshProgress.board;
  let freshRun = freshProgress.run;
  const freshSourcePrefix = `start-fresh:${freshRun.id}:`;
  const allCardsAfterFresh = boardSynthesisCards(board);
  const freshCards = allCardsAfterFresh.filter((card) => String(card.sourceId ?? "").startsWith(freshSourcePrefix));
  const preservedVisibleCards = allCardsAfterFresh.filter((card) => !String(card.sourceId ?? "").startsWith(freshSourcePrefix));
  const freshDuplicates = duplicateTitleMetrics(freshCards);
  const loadedPreviousRecords = synthesisRunLoadedPreviousRecords(freshRun);
  assert(!loadedPreviousRecords, "Expected Start Fresh run not to load previous progressive records.");
  assert(freshCards.length > 0, "Expected Start Fresh run to render fresh Draft Inbox cards.");
  assert(freshDuplicates.duplicateCardCount === 0, `Expected no duplicate rendered cards after Start Fresh, got ${JSON.stringify(freshDuplicates.duplicateGroups)}.`);

  const newestFreshCard = freshCards.find((card) => !abandonedCheckpointCards.some((checkpointCard) => checkpointCard.id === card.id)) ?? freshCards[0];
  await clickButton(cdp, "Draft Inbox");
  if (newestFreshCard?.title) {
    await waitFor(cdp, new Function(`return document.body.innerText.includes(${JSON.stringify(newestFreshCard.title)});`), "Start Fresh card visible in Draft Inbox", 60_000);
  }
  const freshScreenshot = await captureDogfoodScreenshot(cdp, "start-fresh-03-fresh-draft-inbox.png");
  await clickButtonIn(cdp, ".project-board-tabs", "History");
  await waitFor(cdp, () => document.querySelector(".project-board-history-panel") !== null, "project board History panel", 30_000);
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Superseded") && !button.disabled),
    "Start Fresh Superseded history filter",
    60_000,
  );
  await clickButtonIn(cdp, ".project-board-history-filters", "Superseded");
  const abandonedHistoryTitles = abandonedCheckpointCards.map((card) => card.title).filter(Boolean);
  let supersededHistoryTextTail = "";
  const supersededHistory = await waitForState(
    cdp,
    async () => {
      const state = await evaluate(
        cdp,
        `(() => {
          const panel = document.querySelector(".project-board-superseded-review");
          const text = document.body.innerText || "";
          const normalizedText = text.replace(/\\s+/g, " ").trim().toLowerCase();
          const abandonedTitles = ${JSON.stringify(abandonedHistoryTitles)}.map((title) => String(title).replace(/\\s+/g, " ").trim().toLowerCase());
          return {
            hasPanel: Boolean(panel),
            hasReview: normalizedText.includes("start fresh review"),
            hasSupersededGroup:
              normalizedText.includes("superseded draft cards") ||
              normalizedText.includes("preserved for review") ||
              normalizedText.includes("protected cards kept"),
            hasAbandonedCard: abandonedTitles.length === 0 || abandonedTitles.some((title) => normalizedText.includes(title)),
            tail: text.slice(-2000),
          };
        })()`,
      );
      supersededHistoryTextTail = String(state?.tail ?? "");
      return state?.hasPanel && state?.hasReview && state?.hasSupersededGroup ? state : undefined;
    },
    "Start Fresh superseded-card history review",
    120_000,
  ).catch((error) => {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n\nBody tail:\n${supersededHistoryTextTail}`);
  });
  const supersededHistoryScreenshot = await captureDogfoodScreenshot(cdp, "start-fresh-04-superseded-history.png");

  const freshRunStatusBeforeCleanup = freshRun.status;
  let cleanupPause;
  if (freshRun.status === "running" || freshRun.status === "pause_requested") {
    cleanupPause = await pauseRunningSynthesisFromUi(cdp, boardId, freshRun.id).catch((error) => ({
      status: "not_paused",
      error: error instanceof Error ? error.message : String(error),
    }));
    board = await readProjectBoardWithSynthesisDetails();
    freshRun = board.synthesisRuns.find((candidate) => candidate.id === freshRun.id) ?? freshRun;
  }
  const abandonedRun = board.synthesisRuns.find((candidate) => candidate.id === paused.run.id) ?? freshStart.abandonedRun;
  const abandonedCardIds = new Set(abandonedCheckpointCards.map((card) => card.id));
  const abandonedSourceIds = new Set(abandonedCheckpointCards.map((card) => card.sourceId));
  const overlappingCardIdCount = freshCards.filter((card) => abandonedCardIds.has(card.id)).length;
  const overlappingSourceIdCount = freshCards.filter((card) => abandonedSourceIds.has(card.sourceId)).length;
  assert(overlappingCardIdCount === 0, `Expected Start Fresh cards to get new card ids, got ${overlappingCardIdCount} overlapping card id(s).`);
  assert(
    overlappingSourceIdCount === 0,
    `Expected Start Fresh cards to use a fresh source-id namespace, got ${overlappingSourceIdCount} overlapping source id(s).`,
  );

  return {
    name: "start-fresh-planning-ui",
    boardId,
    abandonedRunId: abandonedRun.id,
    freshRunId: freshRun.id,
    abandonedRunStatus: abandonedRun.status,
    freshRunStatus: freshRun.status,
    freshRunStatusBeforeCleanup,
    retryOfRunId: freshRun.retryOfRunId,
    firstCardBeforePause: initialPlanning.readyToPause.snapshot.firstCard,
    abandonedCheckpointCardCount: abandonedCheckpointCards.length,
    freshCardCount: freshCards.length,
    preservedVisibleCardCount: preservedVisibleCards.length,
    duplicateCardRate: freshDuplicates.duplicateCardRate,
    duplicateCardCount: freshDuplicates.duplicateCardCount,
    loadedPreviousRecords,
    abandonedProgressiveRecordCount: progressiveRecordCount(abandonedRun),
    freshProgressiveRecordCount: progressiveRecordCount(freshRun),
    overlappingCardIdCount,
    overlappingSourceIdCount,
    supersededHistoryVisible: supersededHistory.hasReview,
    supersededHistoryIncludesAbandonedCard: supersededHistory.hasAbandonedCard,
    cleanupPause,
    screenshots: {
      running: runningScreenshot,
      paused: pausedScreenshot,
      fresh: freshScreenshot,
      supersededHistory: supersededHistoryScreenshot,
    },
  };
}

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
  assert(reportProposal.cards.length === 0, `Expected lightweight PM Review report to generate zero proposal cards, got ${reportProposal.cards.length}.`);
  assert(reportProposal.reviewReport.sourceConfidence !== "unknown", "Expected live PM Review report to include non-unknown source confidence.");
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
      () => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Update Charter Review") && !button.disabled),
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
    assert(updatedProposal.cards.length === 0, `Expected updated lightweight PM Review report to keep zero proposal cards, got ${updatedProposal.cards.length}.`);
    reportProposal = updatedProposal;
  }

  await clickProjectBoardReviewTab(cdp);
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Generate Draft Board") && !button.disabled),
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
  const activationStarted = await waitForPlanningRunStart(cdp, boardId, beforeActivationRunId, "PM Review activation board-synthesis start");
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
  assert(activationProgress.proposal?.status === "applied", "Expected PM Review activation proposal to be applied after Draft Inbox materialization.");
  const duplicateMetrics = duplicateTitleMetrics(generatedCards);
  assert(duplicateMetrics.duplicateCardCount === 0, `Expected PM Review activation to avoid duplicate Draft Inbox cards, got ${JSON.stringify(duplicateMetrics.duplicateGroups)}.`);

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
      const started = await waitForPlanningRunStart(cdp, boardId, lastRunId, `${startLabel}${attempt > 1 ? ` retry ${attempt}` : ""}`, startTimeoutMs);
      const proposal = await waitForLatestPendingProposal(cdp, boardId, previousProposalId, `${proposalLabel}${attempt > 1 ? ` retry ${attempt}` : ""}`);
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

function isTransientAmbientDogfoodError(message) {
  return /\b(?:408|409|425|429|500|502|503|504)\b|rate limit|temporar|try again|timeout|timed out|upstream|econnreset|socket hang up/i.test(
    String(message ?? ""),
  );
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
  const targetKey = target.path || target.threadId || target.artifactId || target.title || target.id;
  const targetKeys = [target.path, target.title, target.sourceKey, target.threadId, target.artifactId, target.messageId, target.id].filter(
    (value) => typeof value === "string" && value.trim(),
  );

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
      if (projectBoardSourceKind(source) === "ignored" && source.classifiedBy === "user" && source.includeInSynthesis === false) return { board: next, source };
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
        .some((button) => /Ignored sources stay visible|User source classifications are preserved/.test(button.getAttribute("title") || "")) ||
      /User reclassified source|Refresh preserves user classifications/.test(document.body.innerText || ""),
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
  assert(includedUi.detailElaborateDisabled === false, "Expected reclassified source to be eligible for Add Cards from Source Inspector.");
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
    ignoredDetailExplainsExclusion: ignoredUi.detailText.includes("Visible in source inventory") || ignoredUi.detailText.includes("Ignored for synthesis"),
    ignoredElaborateDisabled: ignoredUi.detailElaborateDisabled,
    refreshPreservedIgnored:
      projectBoardSourceKind(refreshedState.source) === "ignored" && refreshedState.source.classifiedBy === "user" && refreshedState.source.includeInSynthesis === false,
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
    (card) => generatedCardIds.has(card.id) || (card.sourceKind === "board_synthesis" && card.status === "draft" && !card.orchestrationTaskId),
  );
  const selected = selectDogfoodExecutionCard(generatedDraftCards);
  assert(selected, "Expected a generated PM Review Draft Inbox card suitable for ticketization.");

  await invoke(cdp, "updateProjectBoardCard", { cardId: selected.id, candidateStatus: "ready_to_create" });
  await invoke(cdp, "approveProjectBoardCard", { cardId: selected.id });
  board = await currentBoard(cdp);
  const ticketized = board.cards.find((card) => card.id === selected.id);
  assert(ticketized?.orchestrationTaskId, "Expected generated PM Review Draft Inbox card to ticketize into a Local Task.");

  await invokeDetached(cdp, "prepareNextOrchestrationTasks", undefined, "__projectBoardDogfoodPrepareError");
  const { board: orchestrationAfterPrepare, run: preparedRun } = await waitForPreparedOrStartedRun(cdp, ticketized.orchestrationTaskId, ticketized.title);
  preparedWorkspacePath = preparedRun.workspacePath;
  preparedWorkspaceSnapshot = preparedWorkspacePath ? await snapshotHarnessWorkspace(preparedWorkspacePath).catch(() => undefined) : undefined;
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
  const followUpIds = new Set([...(reviewedCard?.proofReview?.followUpCardIds ?? []), ...(reviewedCard?.splitOutcome?.childCardIds ?? [])]);
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
  assert(reviewedCard.proofReview.reviewer === "ambient_pi", `Expected live Ambient/Pi proof review, got ${reviewedCard.proofReview.reviewer ?? "missing reviewer"}.`);
  if (visualProofRequired && !visualProofArtifacts.some(isReadableVisualProofArtifact)) {
    const proofReviewKeptOpen =
      reviewedCard.proofReview.status !== "done" &&
      reviewedCard.proofReview.recommendedAction !== "close" &&
      reviewedCard.proofReview.recommendedAction !== undefined;
    assert(proofReviewKeptOpen, "Expected generated visual-proof card execution to create a readable visual proof artifact or stay open in PM proof review.");
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

function synthesisRunLoadedPreviousRecords(run) {
  return (run?.events ?? []).some((event) => {
    const text = `${event?.title ?? ""}\n${event?.summary ?? ""}`;
    return /Loaded previous section records|Loaded planner-batch continuation checkpoint/i.test(text);
  });
}

async function pauseRunningSynthesisFromUi(cdp, boardId, runId) {
  await clickProjectBoardReviewTab(cdp);
  await clickButton(cdp, "Pause Planning", 30_000).catch((error) => {
    if (!String(error instanceof Error ? error.message : error).includes("Pause Planning")) throw error;
  });
  await invoke(cdp, "pauseProjectBoardSynthesis", {
    boardId,
    runId,
    reason: "Focused dogfood cleanup requested an exact-run pause after verifying rendered planning output.",
  });
  const paused = await waitForState(
    cdp,
    async () => {
      const next = await currentBoard(cdp);
      const run = next.synthesisRuns.find((candidate) => candidate.id === runId) ?? latestRunForBoard(next, boardId);
      if (!run) return undefined;
      if (run.status === "failed") {
        throw new Error(`Cleanup pause failed: ${run.error || run.events?.at(-1)?.summary || "unknown error"}`);
      }
      return run.status === "paused" ? { board: next, run } : undefined;
    },
    "cleanup pause for resumed PM Review synthesis run",
    Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_CLEANUP_PAUSE_TIMEOUT_MS || 120_000),
  );
  return {
    status: paused.run.status,
    runId: paused.run.id,
    progressiveRecordCount: progressiveRecordCount(paused.run),
  };
}

async function captureDogfoodScreenshot(cdp, filename) {
  const screenshotDir = join(runRoot, "screenshots");
  await mkdir(screenshotDir, { recursive: true });
  const screenshotPath = join(screenshotDir, filename);
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  const screenshotAnalysis = analyzePng(await readFile(screenshotPath));
  assert(screenshotAnalysis.width >= 1200 && screenshotAnalysis.height >= 800, `Expected large screenshot, got ${screenshotAnalysis.width}x${screenshotAnalysis.height}.`);
  assert(screenshotAnalysis.nonBlackRatio > 0.5 && screenshotAnalysis.distinctColorCount > 16, `Expected readable nonblank screenshot, got ${JSON.stringify(screenshotAnalysis)}.`);
  return {
    path: screenshotPath.replace(`${runRoot}/`, ""),
    ...screenshotAnalysis,
  };
}

function boardSynthesisCards(board) {
  return (board?.cards ?? []).filter((card) => card?.sourceKind === "board_synthesis" || card?.sourceKind === "project_board_synthesis");
}

function duplicateTitleMetrics(cards) {
  const groups = new Map();
  for (const card of cards.filter((candidate) => candidate.status !== "archived" && candidate.candidateStatus !== "duplicate")) {
    const key = normalizeCardTitle(card.title);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push({
      id: card.id,
      title: card.title,
      status: card.status,
      candidateStatus: card.candidateStatus,
    });
    groups.set(key, group);
  }
  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  const duplicateCardCount = duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);
  const totalCardCount = cards.length;
  return {
    totalCardCount,
    duplicateCardCount,
    duplicateGroupCount: duplicateGroups.length,
    duplicateCardRate: totalCardCount ? Number((duplicateCardCount / totalCardCount).toFixed(4)) : 0,
    duplicateGroups: duplicateGroups.slice(0, 10),
  };
}

function normalizeCardTitle(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function selectDogfoodExecutionCard(cards) {
  const draftCards = cards.filter((card) => card.status === "draft" && !card.orchestrationTaskId && hasProof(card));
  const unblocked = draftCards.filter((card) => card.blockedBy.length === 0);
  const candidates = unblocked.length ? unblocked : draftCards;
  const preferred = candidates.find((card) => /proof|test|verification|app shell|canvas|nonblank|non-blank/i.test(`${card.title}\n${card.description}`));
  return preferred ?? candidates[0];
}

function hasProof(card) {
  return card.acceptanceCriteria.length > 0 && Object.values(card.testPlan).some((items) => Array.isArray(items) && items.length > 0);
}

async function createRuntimeSplitManualCard(cdp, boardId) {
  const before = await currentBoard(cdp);
  const beforeIds = new Set(before.cards.map((card) => card.id));
  const state = await invoke(cdp, "createProjectBoardCard", {
    boardId,
    title: "Runtime split progress marker",
    description: "Create the first runtime split marker before expanding the broader dogfood scope.",
  });
  let board = boardFromState(state);
  const created = board.cards.find((card) => !beforeIds.has(card.id) && card.sourceKind === "manual");
  assert(created, "Expected manual runtime-split card creation to return a new manual candidate.");
  const description = [
    "Focused runtime-budget split dogfood card.",
    "",
    "First board action: call native `task_heartbeat` with the immediate plan and proof target before reading files, editing files, or running shell commands. If native task tools are unavailable, emit the same initial checkpoint through a fenced `task_actions` JSON block with fresh run-specific values.",
    "First implementation action after that checkpoint: use the shell or file tools to create `src/runtime-split-progress.ts` exporting a `runtimeSplitCheckpoint` string and add `test/runtime-split-progress.test.ts` proving the export is present.",
    "A suitable first command is: `mkdir -p src test docs && printf '%s\\n' 'export const runtimeSplitCheckpoint = \"runtime-split-dogfood-checkpoint\";' > src/runtime-split-progress.ts && printf '%s\\n' 'import { describe, expect, it } from \"vitest\";' 'import { runtimeSplitCheckpoint } from \"../src/runtime-split-progress\";' 'describe(\"runtimeSplitCheckpoint\", () => {' '  it(\"records a dogfood checkpoint\", () => {' '    expect(runtimeSplitCheckpoint).toBe(\"runtime-split-dogfood-checkpoint\");' '  });' '});' > test/runtime-split-progress.test.ts`.",
    "Then continue with broader cleanup only if time remains: document the checkpoint in `docs/runtime-split-notes.md`, run the narrow test, and report completed and remaining work through task actions using fresh run-specific action ids and real changedFiles/commands.",
    "Do not copy any sample task action values such as `unique-heartbeat-id`, `unique-proof-id`, `Describe actual progress from this run`, or `Name a concrete item actually completed`.",
    "The dogfood harness intentionally lowers the project-board runtime budget for this card, so partial progress should be preserved as a runtime split instead of waiting for a long terminal run.",
  ].join("\n");
  board = boardFromState(
    await invoke(cdp, "updateProjectBoardCard", {
      cardId: created.id,
      title: "Runtime split progress marker",
      description,
      candidateStatus: "ready_to_create",
      priority: 1,
      phase: "Runtime Split",
      labels: ["runtime-split", "dogfood", "proof"],
      blockedBy: [],
      acceptanceCriteria: [
        "Create `src/runtime-split-progress.ts` with a concrete exported checkpoint value.",
        "Add a focused test under `test/runtime-split-progress.test.ts` or clearly record why it remains unfinished.",
        "Report completed work and remaining scope using task actions before the runtime budget stops the run.",
      ],
      testPlan: {
        unit: ["Run or prepare a focused runtime-split progress test."],
        integration: [],
        visual: [],
        manual: ["Review the runtime-budget split child and parent split decision after the worker stops."],
      },
      clarificationQuestions: [],
    }),
  );
  return board.cards.find((card) => card.id === created.id) ?? created;
}

async function forceProjectBoardRuntimeBudget(boardId, maxRuntimeMsPerCard) {
  const dbPath = projectBoardDogfoodStateDbPath(projectRoot);
  const { stdout } = await runCommand(
    "sqlite3",
    [
      "-json",
      dbPath,
      [
        "select",
        "project_boards.charter_id as charterId,",
        "project_board_charters.budget_policy_json as budgetPolicyJson",
        "from project_boards",
        "join project_board_charters on project_board_charters.id = project_boards.charter_id",
        `where project_boards.id = ${sqlString(boardId)}`,
        "limit 1",
      ].join(" "),
    ],
    projectRoot,
  );
  const rows = stdout.trim() ? JSON.parse(stdout) : [];
  const row = rows[0];
  if (!row?.charterId) throw new Error(`Could not find active charter for project board ${boardId}.`);
  const existing = parseJsonObject(row.budgetPolicyJson, {});
  const budgetPolicy = {
    ...existing,
    maxPassesPerCard: Number.isFinite(Number(existing.maxPassesPerCard)) ? existing.maxPassesPerCard : 6,
    maxRuntimeMsPerCard,
    pauseOnTerminalBlocker: existing.pauseOnTerminalBlocker ?? true,
    runtimeSplitDogfood: true,
  };
  const now = new Date().toISOString();
  await runCommand(
    "sqlite3",
    [
      dbPath,
      [
        "update project_board_charters",
        `set budget_policy_json = ${sqlString(JSON.stringify(budgetPolicy))},`,
        `updated_at = ${sqlString(now)}`,
        `where id = ${sqlString(row.charterId)}`,
      ].join(" "),
    ],
    projectRoot,
  );
  return { charterId: row.charterId, budgetPolicy };
}

function parseJsonObject(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function collectVisualProofArtifacts(roots) {
  const rootList = Array.isArray(roots) ? roots : [roots];
  const fileMap = new Map();
  for (const root of rootList.filter(Boolean)) {
    const screenshotRoot = join(root, ".ambient-codex", "browser", "screenshots");
    for (const file of await listPngFiles(screenshotRoot)) {
      fileMap.set(file.path, { ...file, root });
    }
  }
  const files = [...fileMap.values()];
  const artifacts = [];
  for (const file of files) {
    try {
      artifacts.push({ path: file.path, mtimeMs: file.mtimeMs, ...analyzePng(await readFile(file.path)) });
    } catch (error) {
      artifacts.push({
        path: file.path,
        mtimeMs: file.mtimeMs,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return artifacts
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, 5)
    .map(({ mtimeMs, ...artifact }) => {
      const matchingRoot = rootList.find((root) => artifact.path.startsWith(`${root}/`));
      return { ...artifact, path: matchingRoot ? artifact.path.replace(`${matchingRoot}/`, "") : artifact.path };
    });
}

async function listPngFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listPngFiles(path)));
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) continue;
    const info = await stat(path);
    files.push({ path, mtimeMs: info.mtimeMs });
  }
  return files;
}

function analyzePng(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Not a PNG file.");
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const idatChunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height) throw new Error("PNG missing IHDR dimensions.");
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}.`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowStride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idatChunks));
  let rawOffset = 0;
  let previousRow = Buffer.alloc(rowStride);
  let nonBlackPixels = 0;
  const distinctColors = new Set();
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const row = Buffer.from(raw.subarray(rawOffset, rawOffset + rowStride));
    rawOffset += rowStride;
    unfilterPngRow(row, previousRow, bytesPerPixel, filter);
    for (let x = 0; x < rowStride; x += bytesPerPixel) {
      const red = row[x];
      const green = row[x + 1];
      const blue = row[x + 2];
      const alpha = bytesPerPixel === 4 ? row[x + 3] : 255;
      if (alpha > 0 && (red > 8 || green > 8 || blue > 8)) nonBlackPixels += 1;
      if (distinctColors.size < 128) distinctColors.add(`${red},${green},${blue},${alpha}`);
    }
    previousRow = row;
  }
  const totalPixels = width * height;
  return {
    width,
    height,
    colorType,
    totalPixels,
    nonBlackPixels,
    nonBlackRatio: Number((nonBlackPixels / totalPixels).toFixed(6)),
    distinctColorCount: distinctColors.size,
  };
}

function unfilterPngRow(row, previousRow, bytesPerPixel, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = previousRow[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previousRow[index - bytesPerPixel] : 0;
    if (filter === 0) {
      continue;
    } else if (filter === 1) {
      row[index] = (row[index] + left) & 0xff;
    } else if (filter === 2) {
      row[index] = (row[index] + up) & 0xff;
    } else if (filter === 3) {
      row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      row[index] = (row[index] + paethPredictor(left, up, upLeft)) & 0xff;
    } else {
      throw new Error(`Unsupported PNG row filter: ${filter}.`);
    }
  }
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function meaningfulProofChangedPaths(proof) {
  if (!proof || typeof proof !== "object") return [];
  const paths = [];
  const push = (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) paths.push(trimmed.replace(/^[MADRCU?! ]+\s+/, ""));
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    if (typeof value.path === "string") paths.push(value.path.trim());
    else if (typeof value.file === "string") paths.push(value.file.trim());
  };
  if (Array.isArray(proof.changedFiles)) proof.changedFiles.forEach(push);
  if (Array.isArray(proof.gitStatus)) proof.gitStatus.forEach(push);
  if (typeof proof.diff === "string") {
    for (const match of proof.diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) {
      paths.push(match[1], match[2]);
    }
  }
  return [...new Set(paths.filter(isMeaningfulChangedPath))];
}

async function gitStatusForWorkspace(workspacePath) {
  const { stdout } = await runCommand("git", ["status", "--short"], workspacePath);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function meaningfulPathsFromGitStatus(lines) {
  return [...new Set(lines.map((line) => line.replace(/^[MADRCU?! ]+\s+/, "")).filter(isMeaningfulChangedPath))];
}

function isMeaningfulChangedPath(path) {
  const normalized = path.replace(/\\/g, "/").replace(/^"+|"+$/g, "").replace(/^\.\/+/, "");
  if (!normalized) return false;
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) return false;
  if (normalized.includes("/.git/") || normalized.startsWith(".git/")) return false;
  if (normalized.includes("/.ambient/") || normalized.startsWith(".ambient/")) return false;
  if (normalized.includes("/.ambient-codex/") || normalized.startsWith(".ambient-codex/")) return false;
  if (normalized.includes("/.vite/") || normalized.startsWith(".vite/")) return false;
  if (/(^|\/)\.DS_Store$/.test(normalized)) return false;
  return true;
}

function answerForSpaceshipQuestion(question) {
  const normalized = question.toLowerCase();
  if (/\b(arcade|inertia|thrust|control)\b/.test(normalized)) {
    return "Use arcade keyboard controls for the MVP. Defer inertia-based thrust and touch support to later cards.";
  }
  if (/\b(wave|endless|spawn|pacing)\b/.test(normalized)) {
    return "Use discrete deterministic waves for MVP proof. Endless spawning can be a later tuning card.";
  }
  if (/\b(score|scoring|survival)\b/.test(normalized)) {
    return "Use survival time plus enemies destroyed for the first score model; skip multipliers and cargo-delivery scoring for now.";
  }
  if (/\b(collision|bounds|radius|hit)\b/.test(normalized)) {
    return "Use simple circle bounds for ship, hazards, enemies, and shots in the MVP.";
  }
  if (/\b(visual|asset|ship|primitive|vector|screenshot)\b/.test(normalized)) {
    return "Use primitive or vector-style geometry first, with a nonblank canvas screenshot/manual proof requirement.";
  }
  return "For the MVP, choose the smallest reversible option that produces a playable vertical slice with clear proof.";
}

async function invoke(cdp, method, input) {
  const args = input === undefined ? "()" : `(${JSON.stringify(input)})`;
  return evaluate(cdp, `window.ambientDesktop.${method}${args}`);
}

async function invokeDetached(cdp, method, input, errorSlot) {
  const args = input === undefined ? "()" : `(${JSON.stringify(input)})`;
  const slot = JSON.stringify(errorSlot);
  return evaluate(
    cdp,
    [
      `window[${slot}] = null;`,
      `Promise.resolve(window.ambientDesktop.${method}${args}).catch((error) => {`,
      `window[${slot}] = String(error && error.message ? error.message : error);`,
      "});",
      "true;",
    ].join(""),
  );
}

async function clickButton(cdp, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const clicked = await evaluate(
      cdp,
      `(() => {
        const label = ${JSON.stringify(label)}.toLowerCase();
        const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.toLowerCase().includes(label) && !item.disabled);
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (clicked) return;
    await delay(250);
  }
  const buttons = await evaluate(
    cdp,
    `[...document.querySelectorAll("button")].map((item) => item.textContent?.replace(/\\s+/g, " ").trim()).filter(Boolean).slice(0, 30)`,
  ).catch(() => []);
  throw new Error(`Could not find button: ${label}. Buttons: ${buttons.join(" | ")}`);
}

async function openProjectBoardSetup(cdp) {
  const alreadyOpen = await evaluate(cdp, `Boolean(document.querySelector(".project-board-workspace"))`);
  if (alreadyOpen) return;
  await clickButton(cdp, "Project Board");
  await waitFor(cdp, () => Boolean(document.querySelector(".project-board-workspace")), "project board setup opened");
}

async function clickProjectBoardReviewTab(cdp, timeoutMs = 15_000) {
  const labels = ["PM Review", "Decisions"];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const label of labels) {
      const clicked = await evaluate(
        cdp,
        `(() => {
          const label = ${JSON.stringify(label)}.toLowerCase();
          const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.toLowerCase().includes(label) && !item.disabled);
          if (!button) return false;
          button.click();
          return true;
        })()`,
      );
      if (clicked) return;
    }
    await delay(250);
  }
  const buttons = await evaluate(
    cdp,
    `[...document.querySelectorAll("button")].map((item) => item.textContent?.replace(/\\s+/g, " ").trim()).filter(Boolean).slice(0, 30)`,
  ).catch(() => []);
  throw new Error(`Could not find project board review tab (${labels.join(" / ")}). Buttons: ${buttons.join(" | ")}`);
}

async function clickButtonIn(cdp, selector, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const clicked = await evaluate(
      cdp,
      `(() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        if (!root) return false;
        const label = ${JSON.stringify(label)}.toLowerCase();
        const button = [...root.querySelectorAll("button")].find((item) => item.textContent?.toLowerCase().includes(label) && !item.disabled);
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (clicked) return;
    await delay(250);
  }
  const buttons = await evaluate(
    cdp,
    `(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      return root ? [...root.querySelectorAll("button")].map((item) => item.textContent?.replace(/\\s+/g, " ").trim()).filter(Boolean).slice(0, 30) : [];
    })()`,
  ).catch(() => []);
  throw new Error(`Could not find button ${label} inside ${selector}. Buttons: ${buttons.join(" | ")}`);
}

async function selectSourceInReview(cdp, sourceKeys, timeoutMs = 15_000) {
  const keys = Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const selected = await evaluate(
      cdp,
      `(() => {
        const keys = ${JSON.stringify(keys)};
        const review = document.querySelector(".project-board-source-review");
        if (!review) return false;
        const article = [...review.querySelectorAll(".project-board-source-item")].find((item) => keys.some((key) => item.innerText.includes(key)));
        if (!article) return false;
        article.click();
        return true;
      })()`,
    );
    if (selected) return;
    await delay(250);
  }
  const sources = await evaluate(
    cdp,
    `(() => {
      const review = document.querySelector(".project-board-source-review");
      return review ? [...review.querySelectorAll(".project-board-source-item")].map((item) => item.innerText.replace(/\\s+/g, " ").trim()).slice(0, 12) : [];
    })()`,
  ).catch(() => []);
  throw new Error(`Could not select source ${keys.join(" / ")}. Source Review items: ${sources.join(" | ")}`);
}

async function setSourceKindFromUi(cdp, sourceKeys, kind, timeoutMs = 15_000) {
  const keys = Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const updated = await evaluate(
      cdp,
      `(() => {
        const keys = ${JSON.stringify(keys)};
        const kind = ${JSON.stringify(kind)};
        const review = document.querySelector(".project-board-source-review");
        if (!review) return false;
        const article = [...review.querySelectorAll(".project-board-source-item")].find((item) => keys.some((key) => item.innerText.includes(key)));
        const select = article?.querySelector("select");
        if (!select) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        if (setter) setter.call(select, kind);
        else select.value = kind;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        article.click();
        return true;
      })()`,
    );
    if (updated) return;
    await delay(250);
  }
  throw new Error(`Could not reclassify source ${keys.join(" / ")} to ${kind} from Source Review UI.`);
}

async function readSourceClassificationUiState(cdp, sourceKeys) {
  const keys = Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys];
  return evaluate(
    cdp,
    `(() => {
      const keys = ${JSON.stringify(keys)};
      const review = document.querySelector(".project-board-source-review");
      const article = review ? [...review.querySelectorAll(".project-board-source-item")].find((item) => keys.some((key) => item.innerText.includes(key))) : null;
      const detail = document.querySelector(".project-board-source-detail");
      const refreshButtons = [...document.querySelectorAll("button")].filter((button) => button.textContent?.includes("Refresh Sources"));
      const detailElaborate = detail ? [...detail.querySelectorAll("button")].find((button) => button.textContent?.includes("Elaborate Cards")) : null;
      const refreshTitle = refreshButtons.map((button) => button.getAttribute("title") || "").find(Boolean) || "";
      const refreshTitleIncludesPreservation = refreshButtons.some((button) =>
        /Ignored sources stay visible|User source classifications are preserved/.test(button.getAttribute("title") || "")
      );
      const detailText = detail?.innerText ?? "";
      return {
        sourceReviewVisible: Boolean(article),
        itemText: article?.innerText ?? "",
        detailText,
        selectValue: article?.querySelector("select")?.value ?? null,
        ignoredFilterVisible: Boolean(
          review && [...review.querySelectorAll("button")].some((button) => /Ignored:\\s*[1-9]/.test(button.textContent || ""))
        ),
        refreshTitle,
        refreshTitleIncludesPreservation,
        refreshCopyIncludesPreservation:
          refreshTitleIncludesPreservation ||
          /User reclassified source|Refresh preserves user classifications|Ignored sources stay visible/.test(detailText),
        detailElaborateDisabled: detailElaborate ? detailElaborate.disabled === true : null,
      };
    })()`,
  );
}

async function fillInput(cdp, selector, value) {
  const filled = await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
      setter?.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
  );
  if (!filled) throw new Error(`Could not fill input: ${selector}`);
}

function sourceForStableKey(board, reference) {
  const keys = new Set(
    [reference.id, reference.sourceKey, reference.path, reference.threadId, reference.artifactId, reference.messageId, reference.title].filter(
      (value) => typeof value === "string" && value.trim(),
    ),
  );
  return board.sources.find((source) =>
    [source.id, source.sourceKey, source.path, source.threadId, source.artifactId, source.messageId, source.title].some((value) => keys.has(value)),
  );
}

function projectBoardSourceKind(source) {
  return source?.kind ?? source?.sourceKind;
}

function selectorTextIncludesPredicate(selector, text) {
  return new Function(`return document.querySelector(${JSON.stringify(selector)})?.textContent?.includes(${JSON.stringify(text)}) === true;`);
}

async function waitFor(cdp, predicate, label, timeoutMs = 15_000) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await delay(150);
  }
  const bodyTail = await evaluate(cdp, "document.body.innerText.slice(-2000)").catch(() => "");
  throw new Error(`Timed out waiting for ${label}.\n\nBody tail:\n${bodyTail}`);
}

async function waitForState(cdp, read, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  }
  return result.result?.value;
}

async function waitForTarget(cdpPort) {
  const targetTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_TARGET_TIMEOUT_MS || 0) || 120_000;
  const deadline = Date.now() + targetTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`http://127.0.0.1:${cdpPort}/json/version`, 2_000);
      const target = await response.json();
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // App not listening yet.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Electron browser CDP endpoint after ${targetTimeoutMs.toLocaleString()}ms.`);
}

async function waitForPageTarget(cdp) {
  const targetTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_TARGET_TIMEOUT_MS || 0) || 120_000;
  const deadline = Date.now() + targetTimeoutMs;
  while (Date.now() < deadline) {
    const targets = await cdp.send("Target.getTargets").catch(() => ({ targetInfos: [] }));
    const pageTarget =
      targets.targetInfos?.find((item) => item.type === "page" && !item.url.startsWith("devtools://")) ??
      targets.targetInfos?.find((item) => item.type === "page");
    if (pageTarget?.targetId) return pageTarget;
    await delay(250);
  }
  throw new Error(`Timed out waiting for Electron page CDP target after ${targetTimeoutMs.toLocaleString()}ms.`);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function connectCdpWithRetry(url, label) {
  const targetTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_TARGET_TIMEOUT_MS || 0) || 120_000;
  const deadline = Date.now() + targetTimeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    let cdp;
    try {
      cdp = await connectCdp(url);
      await cdp.send("Target.getTargets");
      return cdp;
    } catch (error) {
      lastError = error;
      cdp?.close();
      await delay(500);
    }
  }
  throw new Error(
    `Timed out connecting to ${label} after ${targetTimeoutMs.toLocaleString()}ms${
      lastError ? `: ${lastError.message}` : ""
    }.`,
  );
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    let opened = false;
    const rejectPending = (error) => {
      for (const entry of pending.values()) entry.reject(error);
      pending.clear();
    };
    const send = (method, params = {}, sessionId) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error(`CDP websocket is not open for ${method}.`));
      }
      const id = nextId++;
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      socket.send(JSON.stringify(message));
      return new Promise((innerResolve, innerReject) => {
        pending.set(id, { resolve: innerResolve, reject: innerReject });
        setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          innerReject(new Error(`Timed out waiting for CDP ${method}.`));
        }, cdpCommandTimeoutMs);
      });
    };
    socket.addEventListener("open", () => {
      opened = true;
      resolve({
        send,
        session(sessionId) {
          return {
            send(method, params = {}) {
              return send(method, params, sessionId);
            },
            close() {
              socket.close();
            },
          };
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message ?? "CDP error"));
      else entry.resolve(message.result);
    });
    socket.addEventListener("error", () => {
      const error = new Error("CDP websocket failed.");
      if (!opened) reject(error);
      rejectPending(error);
    });
    socket.addEventListener("close", () => {
      const error = new Error("CDP websocket closed.");
      if (!opened) reject(error);
      rejectPending(error);
    });
  });
}

async function initializeFixtureGit(root) {
  await runCommand("git", ["init"], root);
  await runCommand("git", ["add", "."], root);
  await runCommand("git", ["-c", "user.name=Ambient Dogfood", "-c", "user.email=dogfood@ambient.local", "commit", "-m", "Seed spaceship fixture"], root);
}

async function runCommand(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${code}: ${stderr || stdout}`));
    });
  });
}

async function findOpenPort() {
  return new Promise((resolvePromise, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const selected = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (selected) resolvePromise(selected);
        else reject(new Error("Could not allocate a CDP port."));
      });
    });
    server.on("error", reject);
  });
}

async function readAmbientApiKey() {
  const envKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
  if (envKey?.trim()) return envKey.trim();
  const candidates = [
    process.env.AMBIENT_API_KEY_FILE,
    join(repoRoot, "ambient_api_key.txt"),
    join(dirname(repoRoot), "ambient_api_key.txt"),
    join(dirname(dirname(repoRoot)), "ambient_api_key.txt"),
    join(homedir(), "ambient_api_key.txt"),
    "/path/to/AmbientDesktop/ambient_api_key.txt",
    "/path/to/project/ambient_api_key.txt",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const key = (await readFile(candidate, "utf8")).trim();
    if (key) return key;
  }
  return undefined;
}

async function writeObservations() {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(observations, null, 2), "utf8");
}

async function writeProjectBoardHarnessTrace() {
  if (!process.env.AMBIENT_HARNESS_TRACE_DIR) return;
  const workspaceDiff = await projectBoardHarnessWorkspaceDiff();
  await writeHarnessTraceArtifacts({
    workspaceDiff,
    summary: summaryForConsole(observations),
    events: observations.steps.map((step) => ({
      type: `project-board-dogfood.${step.name ?? "step"}`,
      data: step,
    })),
  });
}

async function projectBoardHarnessWorkspaceDiff() {
  const roots = [];
  const changes = [];
  await appendPrefixedWorkspaceDiff({ label: "project-root", before: projectRootSnapshot, root: projectRoot, roots, changes });
  await appendPrefixedWorkspaceDiff({ label: "task-workspace", before: preparedWorkspaceSnapshot, root: preparedWorkspacePath, roots, changes });
  return { root: runRoot, roots, changes };
}

async function appendPrefixedWorkspaceDiff({ label, before, root, roots, changes }) {
  if (!before || !root) return;
  const diff = await diffHarnessWorkspaceSnapshot(before, root).catch((error) => ({
    root,
    changes: [{ path: "__trace_error.txt", status: "error", error: error instanceof Error ? error.message : String(error) }],
    beforeOmitted: before.omitted,
    afterOmitted: undefined,
  }));
  roots.push({ label, root, beforeOmitted: diff.beforeOmitted, afterOmitted: diff.afterOmitted });
  changes.push(
    ...diff.changes.map((change) => ({
      ...change,
      path: `${label}/${change.path}`,
    })),
  );
}

async function refreshReleaseGateSummary() {
  const board = (await readProjectBoardReleaseGateSnapshot().catch(() => undefined)) ?? (appInstance ? await currentBoard(appInstance.cdp).catch(() => undefined) : undefined);
  observations.releaseGate = buildProjectBoardDogfoodReleaseGate(observations, { board });
}

async function completeDogfoodSuccessfully() {
  observations.completedAt = new Date().toISOString();
  observations.status = "passed";
  await refreshReleaseGateSummary();
  await writeObservations();
  console.log(JSON.stringify(summaryForConsole(observations), null, 2));
}

function summaryForConsole(value) {
  return {
    status: value.status,
    outputPath,
    runRoot: value.runRoot,
    releaseGate: value.releaseGate
      ? {
          status: value.releaseGate.status,
          timeToFirstCardMs: value.releaseGate.metrics.timeToFirstCardMs,
          timeToFirstTicketizedTaskMs: value.releaseGate.metrics.timeToFirstTicketizedTaskMs,
          duplicateCardRate: value.releaseGate.metrics.duplicateCards.duplicateCardRate,
          proofOutcome: value.releaseGate.metrics.proofOutcome.proofReviewStatus,
          proofActionIntegrityIssues: value.releaseGate.metrics.proofActionIntegrity?.issueCount,
          proofScopeWarningCount: value.releaseGate.metrics.proofScopeWarnings?.warningCount,
          proofScopeWarnedTicketizedWithoutAcknowledgement:
            value.releaseGate.metrics.proofScopeWarnings?.warnedTicketizedWithoutAcknowledgementCount,
          runtimeBudgetSplitCount: value.releaseGate.metrics.splitOutcomes?.runtimeBudgetSplitCount,
          runtimeSplitGate: value.releaseGate.gates.runtimeSplitOutcomeActionable,
          notes: value.releaseGate.notes,
        }
      : undefined,
    steps: value.steps.map((step) => ({
      name: step.name,
      cardCount: step.cardCount ?? step.deterministicCardCount ?? step.draftCardCount,
      questionCount: step.questionCount,
      status: step.status,
      title: step.title,
      runId: step.runId,
      abandonedRunId: step.abandonedRunId,
      freshRunId: step.freshRunId,
      activationRunId: step.activationRunId,
      screenshotPath: step.screenshotPath,
      duplicateCardRate: step.duplicateCardRate,
      loadedPreviousRecords: step.loadedPreviousRecords,
      zeroCardReportObserved: step.zeroCardReportObserved,
      sourceConfidence: step.sourceConfidence,
      gitState: step.gitState,
      activationSurface: step.activationSurface,
      generatedActivationCardCount: step.generatedActivationCardCount,
      generatedDraftCardCount: step.generatedDraftCardCount,
      ignoredVisibleInReview: step.ignoredVisibleInReview,
      ignoredElaborateDisabled: step.ignoredElaborateDisabled,
      refreshPreservedIgnored: step.refreshPreservedIgnored,
      reclassifiedElaborateEnabled: step.reclassifiedElaborateEnabled,
      proofReview: step.proofReview?.status,
      splitOutcome: step.splitOutcome?.status,
      splitDecisionAction: step.action,
      followUpCardCount: step.followUpCardCount,
    })),
  };
}

function outputTail(max = 8000) {
  return `Electron output tail:\n${output.join("").slice(-max)}`;
}

async function terminateProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    child.kill();
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await delay(750);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
