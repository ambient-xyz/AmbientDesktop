#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildProjectBoardPhase8ReleaseGateReport,
  phase8ReleaseGatePassed,
} from "./project-board-phase8-release-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(process.env.AMBIENT_PROJECT_BOARD_PHASE8_GATE_OUT_DIR || join(repoRoot, "test-results", "project-board-release-matrix"));
const providerReportPath = resolve(process.env.AMBIENT_PROJECT_BOARD_PHASE8_PROVIDER_REPORT || join(outputRoot, "latest.json"));
const workerReportPath = resolve(process.env.AMBIENT_PROJECT_BOARD_PHASE8_WORKER_REPORT || join(outputRoot, "latest-worker.json"));
const budgetReportPath = resolve(
  process.env.AMBIENT_PROJECT_BOARD_PHASE8_BUDGET_REPORT ||
    process.env.AMBIENT_PROJECT_BOARD_BUDGET_GATE_OUT ||
    join(repoRoot, "test-results", "project-board-budget-regression-gate", "latest.json"),
);
const handoffReportPath = resolve(process.env.AMBIENT_PROJECT_BOARD_HANDOFF_GATE_OUT || join(outputRoot, "latest-handoff.json"));
const pauseResumeReportPath = resolve(process.env.AMBIENT_PROJECT_BOARD_PAUSE_RESUME_GATE_OUT || join(outputRoot, "latest-pause-resume.json"));
const pauseResumeUiReportPath = resolve(process.env.AMBIENT_PROJECT_BOARD_PAUSE_RESUME_UI_GATE_OUT || join(outputRoot, "latest-pause-resume-ui.json"));
const startFreshUiReportPath = resolve(process.env.AMBIENT_PROJECT_BOARD_START_FRESH_UI_GATE_OUT || join(outputRoot, "latest-start-fresh-ui.json"));
const pmReviewUiReportPath = resolve(process.env.AMBIENT_PROJECT_BOARD_PM_REVIEW_UI_GATE_OUT || join(outputRoot, "latest-pm-review-ui.json"));
const sourceClassificationUiReportPath = resolve(
  process.env.AMBIENT_PROJECT_BOARD_SOURCE_CLASSIFICATION_UI_GATE_OUT || join(outputRoot, "latest-source-classification-ui.json"),
);
const directHelperRetryReportPath = resolve(
  process.env.AMBIENT_PROJECT_BOARD_DIRECT_HELPER_RETRY_GATE_OUT || join(outputRoot, "latest-direct-helper-retry.json"),
);
const pmReviewProviderFixturesReportPath = resolve(
  process.env.AMBIENT_PROJECT_BOARD_PM_REVIEW_PROVIDER_FIXTURES_GATE_OUT || join(outputRoot, "latest-pm-review-provider-fixtures.json"),
);
const pmReviewUiVariantsReportPath = resolve(
  process.env.AMBIENT_PROJECT_BOARD_PM_REVIEW_UI_VARIANTS_GATE_OUT || join(outputRoot, "latest-pm-review-ui-variants.json"),
);
const outputPath = resolve(process.env.AMBIENT_PROJECT_BOARD_PHASE8_GATE_OUT || join(outputRoot, "latest-phase8.json"));
const runLive = process.argv.includes("--run-live");
const runPauseResumeLive =
  process.argv.includes("--run-pause-resume-live") || process.env.AMBIENT_PROJECT_BOARD_PHASE11_PAUSE_RESUME_LIVE === "1";
const requirePauseResumeLive =
  process.argv.includes("--require-pause-resume-live") || process.env.AMBIENT_PROJECT_BOARD_PHASE11_REQUIRE_PAUSE_RESUME_LIVE === "1";
const runFocusedUiLive =
  process.argv.includes("--run-focused-ui-live") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE8_FOCUSED_UI_LIVE === "1" ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE11_FOCUSED_UI_LIVE === "1";
const requireFocusedUi =
  process.argv.includes("--require-focused-ui") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE8_REQUIRE_FOCUSED_UI === "1" ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE11_REQUIRE_FOCUSED_UI === "1";
const focusedUiOnly =
  process.argv.includes("--focused-ui-only") || process.env.AMBIENT_PROJECT_BOARD_PHASE8_FOCUSED_UI_ONLY === "1";
const runPauseResumeUiLive =
  runFocusedUiLive ||
  process.argv.includes("--run-pause-resume-ui-live") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE11_PAUSE_RESUME_UI_LIVE === "1";
const requirePauseResumeUi =
  requireFocusedUi ||
  process.argv.includes("--require-pause-resume-ui") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE11_REQUIRE_PAUSE_RESUME_UI === "1";
const runStartFreshUiLive =
  runFocusedUiLive ||
  process.argv.includes("--run-start-fresh-ui-live") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE11_START_FRESH_UI_LIVE === "1";
const requireStartFreshUi =
  requireFocusedUi ||
  process.argv.includes("--require-start-fresh-ui") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE11_REQUIRE_START_FRESH_UI === "1";
const runPmReviewUiLive =
  runFocusedUiLive ||
  process.argv.includes("--run-pm-review-ui-live") ||
  process.argv.includes("--run-pm-review-work-live") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE10_PM_REVIEW_UI_LIVE === "1";
const runPmReviewWorkLive =
  runFocusedUiLive ||
  process.argv.includes("--run-pm-review-work-live") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE10_PM_REVIEW_WORK_LIVE === "1";
const requirePmReviewUi =
  requireFocusedUi ||
  process.argv.includes("--require-pm-review-ui") ||
  process.argv.includes("--require-pm-review-work") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE10_REQUIRE_PM_REVIEW_UI === "1";
const requirePmReviewWork =
  requireFocusedUi ||
  process.argv.includes("--require-pm-review-work") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE10_REQUIRE_PM_REVIEW_WORK === "1";
const runSourceClassificationUiLive =
  runFocusedUiLive ||
  process.argv.includes("--run-source-classification-ui-live") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE10_SOURCE_CLASSIFICATION_UI_LIVE === "1";
const requireSourceClassificationUi =
  requireFocusedUi ||
  process.argv.includes("--require-source-classification-ui") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE10_REQUIRE_SOURCE_CLASSIFICATION_UI === "1";
const runDirectHelperRetryLive =
  process.argv.includes("--run-direct-helper-retry-live") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE12_DIRECT_HELPER_RETRY_LIVE === "1";
const requireDirectHelperRetry =
  process.argv.includes("--require-direct-helper-retry") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE12_REQUIRE_DIRECT_HELPER_RETRY === "1";
const runPmReviewProviderVariantsLive =
  process.argv.includes("--run-pm-review-provider-variants-live") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE10_PM_REVIEW_PROVIDER_VARIANTS_LIVE === "1";
const requirePmReviewProviderVariantsLive =
  process.argv.includes("--require-pm-review-provider-variants-live") ||
  process.env.AMBIENT_PROJECT_BOARD_PHASE10_REQUIRE_PM_REVIEW_PROVIDER_VARIANTS_LIVE === "1";
const requireCurrentHead = process.argv.includes("--require-current-head") || process.env.AMBIENT_PROJECT_BOARD_PHASE8_REQUIRE_CURRENT_HEAD === "1";
const maxArtifactAgeHours = readMaxArtifactAgeHours();
const startedAt = new Date().toISOString();

await runCommand("pnpm", ["run", "test:project-board-budget-gate"], {
  cwd: repoRoot,
  env: { ...process.env, AMBIENT_PROJECT_BOARD_BUDGET_GATE_OUT: budgetReportPath },
});
await runCommand(
  "node",
  [
    "scripts/project-board-pm-review-provider-fixtures-gate.mjs",
    ...(runPmReviewProviderVariantsLive ? ["--run-live"] : []),
    ...(requirePmReviewProviderVariantsLive ? ["--require-live"] : []),
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      AMBIENT_PROJECT_BOARD_PM_REVIEW_PROVIDER_FIXTURES_GATE_OUT: pmReviewProviderFixturesReportPath,
    },
  },
);
await runCommand("node", ["scripts/project-board-pm-review-ui-variants-gate.mjs"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    AMBIENT_PROJECT_BOARD_PM_REVIEW_UI_VARIANTS_GATE_OUT: pmReviewUiVariantsReportPath,
  },
});
const handoff = await runObjectiveHandoffDogfood(handoffReportPath);

if (runLive) {
  await runCommand("pnpm", ["run", "test:project-board-release-matrix:live"], { cwd: repoRoot, env: process.env });
  await runCommand("pnpm", ["run", "test:project-board-release-matrix:worker-live"], { cwd: repoRoot, env: process.env });
}
if (runPauseResumeLive) {
  await runCommand("pnpm", ["run", "test:project-board-pause-resume:live"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AMBIENT_PROJECT_BOARD_PAUSE_RESUME_GATE_OUT: pauseResumeReportPath,
    },
  });
}
if (runPauseResumeUiLive) {
  await runCommand("pnpm", ["run", "test:project-board-pause-resume-ui-dogfood"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AMBIENT_PROJECT_BOARD_DOGFOOD_OUT: pauseResumeUiReportPath,
    },
  });
}
if (runStartFreshUiLive) {
  await runCommand("pnpm", ["run", "test:project-board-start-fresh-ui-dogfood"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AMBIENT_PROJECT_BOARD_DOGFOOD_OUT: startFreshUiReportPath,
    },
  });
}
if (runPmReviewUiLive) {
  await runCommand("pnpm", ["run", "test:project-board-pm-review-ui-dogfood"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AMBIENT_PROJECT_BOARD_DOGFOOD_OUT: pmReviewUiReportPath,
      AMBIENT_PROJECT_BOARD_DOGFOOD_PM_REVIEW_WORK_CARD: runPmReviewWorkLive ? "1" : process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PM_REVIEW_WORK_CARD,
    },
  });
}
if (runSourceClassificationUiLive) {
  await runCommand("pnpm", ["run", "test:project-board-source-classification-ui-dogfood"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AMBIENT_PROJECT_BOARD_DOGFOOD_OUT: sourceClassificationUiReportPath,
    },
  });
}
if (runDirectHelperRetryLive) {
  try {
    await runCommand("pnpm", ["run", "test:project-board-direct-helper-retry-gmi-live"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AMBIENT_PROJECT_BOARD_DIRECT_HELPER_RETRY_OUT: directHelperRetryReportPath,
        AMBIENT_PROJECT_BOARD_DIRECT_HELPER_RETRY_TARGETS: process.env.AMBIENT_PROJECT_BOARD_DIRECT_HELPER_RETRY_TARGETS || "all",
      },
    });
  } catch (error) {
    console.error(
      `Project-board direct-helper retry live smoke failed; continuing to write release-gate report from ${directHelperRetryReportPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

const provider = focusedUiOnly ? (await readOptionalJson(providerReportPath)) : await readJson(providerReportPath, "provider release matrix");
const worker = focusedUiOnly ? (await readOptionalJson(workerReportPath)) : await readJson(workerReportPath, "worker release matrix");
const budget = await readJson(budgetReportPath, "budget regression gate");
const pmReviewProviderFixtures = await readJson(pmReviewProviderFixturesReportPath, "PM Review provider fixture gate");
const pmReviewUiVariants = await readJson(pmReviewUiVariantsReportPath, "PM Review UI variant gate");
const pauseResume = await readOptionalJson(pauseResumeReportPath);
const pauseResumeUi = await readOptionalJson(pauseResumeUiReportPath);
const startFreshUi = await readOptionalJson(startFreshUiReportPath);
const pmReviewUi = await readOptionalJson(pmReviewUiReportPath);
const sourceClassificationUi = await readOptionalJson(sourceClassificationUiReportPath);
const directHelperRetry = await readOptionalJson(directHelperRetryReportPath);
const completedAt = new Date().toISOString();
const report = buildProjectBoardPhase8ReleaseGateReport({
  provider,
  worker,
  budget,
  pmReviewProviderFixtures,
  pmReviewUiVariants,
  handoff,
  pauseResume,
  pauseResumeUi,
  startFreshUi,
  pmReviewUi,
  sourceClassificationUi,
  directHelperRetry,
  providerReportPath,
  workerReportPath,
  budgetReportPath,
  handoffReportPath,
  pauseResumeReportPath,
  pauseResumeUiReportPath,
  startFreshUiReportPath,
  pmReviewUiReportPath,
  sourceClassificationUiReportPath,
  directHelperRetryReportPath,
  pmReviewProviderFixturesReportPath,
  pmReviewUiVariantsReportPath,
  requirePmReviewProviderFixtures: true,
  requirePmReviewUiVariants: true,
  requirePmReviewProviderVariantsLive,
  requirePauseResumeLive,
  requirePauseResumeUi,
  requireStartFreshUi,
  requirePmReviewUi,
  requirePmReviewWork,
  requireSourceClassificationUi,
  requireDirectHelperRetry,
  skipProviderWorker: focusedUiOnly,
  currentSourceRevision: await readSourceRevision(repoRoot),
  requireCurrentHead,
  maxArtifactAgeHours,
  startedAt,
  completedAt,
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      status: report.status,
      outputPath,
      provider: {
        status: report.provider.status,
        scenarios: report.provider.scenarioCount,
        cards: report.provider.totalCards,
        proofReadyCards: report.provider.totalProofReadyCards,
        duplicateTitleCount: report.provider.duplicateTitleCount,
        warningCodes: report.provider.warningCodes,
        providerTimeoutObserved: report.provider.providerTimeoutObserved,
      },
      worker: {
        status: report.worker.status,
        releaseGateStatus: report.worker.releaseGateStatus,
        taskActionProtocolObserved: report.worker.taskActionProtocolObserved,
        proofReviewStatus: report.worker.proofReviewStatus,
        proofRecommendedAction: report.worker.proofRecommendedAction,
        runtimeBudgetSplitCount: report.worker.runtimeBudgetSplitCount,
        productRuntimeBudgetClosureObserved: report.worker.productRuntimeBudgetClosureObserved,
      },
      budget: {
        status: report.budget.status,
        scenarioCount: report.budget.scenarioCount,
        overBudgetBeforeCompactionObserved: report.budget.overBudgetBeforeCompactionObserved,
        compactionObserved: report.budget.compactionObserved,
        cacheReplayObserved: report.budget.cacheReplayObserved,
      },
      handoff: {
        status: report.handoff.status,
        exitCode: report.handoff.exitCode,
        durationMs: report.handoff.durationMs,
        objectiveGitHandoffObserved: report.handoff.objectiveGitHandoffObserved,
        sourcePathLineageObserved: report.handoff.sourcePathLineageObserved,
        cloneContinuationObserved: report.handoff.cloneContinuationObserved,
        firstCloneApplyObserved: report.handoff.firstCloneApplyObserved,
      },
      pauseResume: {
        status: report.pauseResume.status,
        required: report.pauseResume.required,
        observed: report.pauseResume.observed,
        pauseObserved: report.pauseResume.pauseObserved,
        resumeObserved: report.pauseResume.resumeObserved,
        noDuplicateCardsObserved: report.pauseResume.noDuplicateCardsObserved,
        pausedCardCount: report.pauseResume.pausedCardCount,
        resumedCardCount: report.pauseResume.resumedCardCount,
      },
      pauseResumeUi: {
        status: report.pauseResumeUi.status,
        required: report.pauseResumeUi.required,
        observed: report.pauseResumeUi.observed,
        dogfoodReleaseGateStatus: report.pauseResumeUi.dogfoodReleaseGateStatus,
        pausedRunStatus: report.pauseResumeUi.pausedRunStatus,
        resumedRunStatus: report.pauseResumeUi.resumedRunStatus,
        pausedCardCount: report.pauseResumeUi.pausedCardCount,
        resumedCardCount: report.pauseResumeUi.resumedCardCount,
        duplicateCardRate: report.pauseResumeUi.duplicateCardRate,
        screenshotCount: report.pauseResumeUi.screenshotCount,
      },
      startFreshUi: {
        status: report.startFreshUi.status,
        required: report.startFreshUi.required,
        observed: report.startFreshUi.observed,
        dogfoodReleaseGateStatus: report.startFreshUi.dogfoodReleaseGateStatus,
        abandonedRunStatus: report.startFreshUi.abandonedRunStatus,
        freshRunStatus: report.startFreshUi.freshRunStatus,
        abandonedCheckpointCardCount: report.startFreshUi.abandonedCheckpointCardCount,
        freshCardCount: report.startFreshUi.freshCardCount,
        duplicateCardRate: report.startFreshUi.duplicateCardRate,
        loadedPreviousRecords: report.startFreshUi.loadedPreviousRecords,
        screenshotCount: report.startFreshUi.screenshotCount,
      },
      pmReviewUi: {
        status: report.pmReviewUi.status,
        required: report.pmReviewUi.required,
        observed: report.pmReviewUi.observed,
        dogfoodReleaseGateStatus: report.pmReviewUi.dogfoodReleaseGateStatus,
        zeroCardReportObserved: report.pmReviewUi.zeroCardReportObserved,
        answerUpdateObserved: report.pmReviewUi.answerUpdateObserved,
        sourceConfidence: report.pmReviewUi.sourceConfidence,
        gitState: report.pmReviewUi.gitState,
        blockingQuestionCount: report.pmReviewUi.blockingQuestionCount,
        riskCount: report.pmReviewUi.riskCount,
        sourceConflictCount: report.pmReviewUi.sourceConflictCount,
        sourceAuthorityNoteCount: report.pmReviewUi.sourceAuthorityNoteCount,
        cardGenerationConstraintCount: report.pmReviewUi.cardGenerationConstraintCount,
        recommendedActivationScopePresent: report.pmReviewUi.recommendedActivationScopePresent,
        activationSurface: report.pmReviewUi.activationSurface,
        generatedActivationCardCount: report.pmReviewUi.generatedActivationCardCount,
        generatedDraftCardCount: report.pmReviewUi.generatedDraftCardCount,
        duplicateCardRate: report.pmReviewUi.duplicateCardRate,
        workRequired: report.pmReviewUi.workRequired,
        workObserved: report.pmReviewUi.workObserved,
        workRunStatus: report.pmReviewUi.workRunStatus,
        workProofReviewStatus: report.pmReviewUi.workProofReviewStatus,
        workMeaningfulChangedPathCount: report.pmReviewUi.workMeaningfulChangedPathCount,
        workTaskActionCount: report.pmReviewUi.workTaskActionCount,
        workSplitOutcomeStatus: report.pmReviewUi.workSplitOutcomeStatus,
        workFollowUpCardCount: report.pmReviewUi.workFollowUpCardCount,
        screenshotCount: report.pmReviewUi.screenshotCount,
      },
      sourceClassificationUi: {
        status: report.sourceClassificationUi.status,
        required: report.sourceClassificationUi.required,
        observed: report.sourceClassificationUi.observed,
        dogfoodReleaseGateStatus: report.sourceClassificationUi.dogfoodReleaseGateStatus,
        targetPath: report.sourceClassificationUi.targetPath,
        ignoredVisibleInReview: report.sourceClassificationUi.ignoredVisibleInReview,
        ignoredElaborateDisabled: report.sourceClassificationUi.ignoredElaborateDisabled,
        refreshPreservedIgnored: report.sourceClassificationUi.refreshPreservedIgnored,
        refreshTitleIncludesPreservation: report.sourceClassificationUi.refreshTitleIncludesPreservation,
        refreshCopyIncludesPreservation: report.sourceClassificationUi.refreshCopyIncludesPreservation,
        reclassifiedElaborateEnabled: report.sourceClassificationUi.reclassifiedElaborateEnabled,
        sourceRefreshSettledBeforePmReview: report.sourceClassificationUi.sourceRefreshSettledBeforePmReview,
        activationSurface: report.sourceClassificationUi.activationSurface,
        generatedDraftCardCount: report.sourceClassificationUi.generatedDraftCardCount,
        duplicateCardRate: report.sourceClassificationUi.duplicateCardRate,
        pmReviewTransientRetryCount: report.sourceClassificationUi.pmReviewTransientRetryCount,
        screenshotCount: report.sourceClassificationUi.screenshotCount,
      },
      directHelperRetry: {
        status: report.directHelperRetry.status,
        required: report.directHelperRetry.required,
        observed: report.directHelperRetry.observed,
        scenarioCount: report.directHelperRetry.scenarioCount,
        sourceClassificationComplete: report.directHelperRetry.sourceClassificationComplete,
        charterSummaryComplete: report.directHelperRetry.charterSummaryComplete,
        proofJudgmentComplete: report.directHelperRetry.proofJudgmentComplete,
      },
      pmReviewProviderFixtures: {
        status: report.pmReviewProviderFixtures.status,
        deterministicStatus: report.pmReviewProviderFixtures.deterministicStatus,
        deterministicScenarioCount: report.pmReviewProviderFixtures.deterministicScenarioCount,
        constrainedReadiness: report.pmReviewProviderFixtures.constrainedReadiness,
        sourceConflict: report.pmReviewProviderFixtures.sourceConflict,
        ignoredSourceExclusion: report.pmReviewProviderFixtures.ignoredSourceExclusion,
        recommendationScope: report.pmReviewProviderFixtures.recommendationScope,
        zeroCardContract: report.pmReviewProviderFixtures.zeroCardContract,
        activationMetadata: report.pmReviewProviderFixtures.activationMetadata,
        liveStatus: report.pmReviewProviderFixtures.liveStatus,
        liveObserved: report.pmReviewProviderFixtures.liveObserved,
        liveRequired: report.pmReviewProviderFixtures.liveRequired,
      },
      pmReviewUiVariants: {
        status: report.pmReviewUiVariants.status,
        required: report.pmReviewUiVariants.required,
        deterministicStatus: report.pmReviewUiVariants.deterministicStatus,
        deterministicScenarioCount: report.pmReviewUiVariants.deterministicScenarioCount,
        constrainedReadiness: report.pmReviewUiVariants.constrainedReadiness,
        sourceConflict: report.pmReviewUiVariants.sourceConflict,
        ignoredSourceExclusion: report.pmReviewUiVariants.ignoredSourceExclusion,
        recommendationScope: report.pmReviewUiVariants.recommendationScope,
        rendererSections: report.pmReviewUiVariants.rendererSections,
        recommendationBanner: report.pmReviewUiVariants.recommendationBanner,
      },
      freshness: report.freshness,
      blockingIssues: report.releaseDecision.blockingIssues,
      advisoryIssues: report.releaseDecision.advisoryIssues,
      nextSlice: report.releaseDecision.nextSlice,
    },
    null,
    2,
  ),
);

if (!phase8ReleaseGatePassed(report)) process.exitCode = 1;

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

function runCommand(command, args, options) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
    });
    child.on("error", rejectRun);
    child.on("close", (code, signal) => {
      if (code === 0) resolveRun({ code, signal });
      else rejectRun(new Error(`${command} ${args.join(" ")} failed with code=${code ?? "none"} signal=${signal ?? "none"}`));
    });
  });
}

async function runObjectiveHandoffDogfood(outputPath) {
  const startedAt = new Date();
  const command = "pnpm run test:project-board-two-clone";
  const result = await runObservedCommand("pnpm", ["run", "test:project-board-two-clone"], {
    cwd: repoRoot,
    env: process.env,
  });
  const completedAt = new Date();
  const report = {
    status: result.code === 0 ? "passed" : "attention",
    generatedAt: completedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    command,
    exitCode: result.code,
    signal: result.signal,
    outputPath,
    observations: {
      objectiveGitHandoffObserved: result.code === 0,
      sourcePathLineageObserved: result.code === 0,
      cloneContinuationObserved: result.code === 0,
      firstCloneApplyObserved: result.code === 0,
    },
    stdout: result.stdout,
    stderr: result.stderr,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  return report;
}

function runObservedCommand(command, args, options) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      stderr += `${error instanceof Error ? error.message : String(error)}\n`;
      resolveRun({ code: 1, signal: undefined, stdout, stderr });
    });
    child.on("close", (code, signal) => {
      resolveRun({ code: code ?? 1, signal: signal ?? undefined, stdout, stderr });
    });
  });
}

function readMaxArtifactAgeHours() {
  const flag = process.argv.find((arg) => arg.startsWith("--max-artifact-age-hours="));
  const raw = flag?.split("=", 2)[1] ?? process.env.AMBIENT_PROJECT_BOARD_PHASE8_MAX_ARTIFACT_AGE_HOURS;
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function readSourceRevision(cwd) {
  try {
    const [gitHead, status] = await Promise.all([
      execFileText("git", ["rev-parse", "HEAD"], cwd),
      execFileText("git", ["status", "--short", "--untracked-files=no"], cwd),
    ]);
    return { gitHead: gitHead.trim(), dirty: status.trim().length > 0 };
  } catch {
    return {};
  }
}

function execFileText(commandName, args, cwd) {
  return new Promise((resolveText, rejectText) => {
    execFile(commandName, args, { cwd, encoding: "utf8" }, (error, stdout) => {
      if (error) rejectText(error);
      else resolveText(stdout);
    });
  });
}
