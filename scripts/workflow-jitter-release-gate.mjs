#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWorkflowJitterReplayCandidateBundle } from "./workflow-jitter-replay-candidate.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MATRIX_REPORT = join(repoRoot, "test-results", "workflow-jitter-matrix", "latest.json");
const DEFAULT_OUTPUT_PATH = join(repoRoot, "test-results", "workflow-jitter-release-gate", "latest.json");
const DEFAULT_MAX_AGE_MINUTES = 24 * 60;
const DEFAULT_REQUIRED_AXES = ["prompt", "ir", "compiler", "ui_state"];
const DEFAULT_REQUIRED_RELEASE_LIVE_FAMILIES = ["model-only", "local", "browser", "connector", "document", "recovery"];
const DEFAULT_MIN_RELEASE_DETERMINISTIC_STRESS_UNITS = 1_000;
const DEFAULT_MIN_RELEASE_LIVE_PROMPT_VARIANTS = 120;
const DEFAULT_MIN_RELEASE_LIVE_DOGFOOD_RUNS = 10;
const REQUIRED_SCRIPTS = [
  ["test:workflow-jitter-matrix", "deterministic workflow jitter matrix"],
  ["test:workflow-jitter-matrix:unit", "workflow jitter matrix unit tests"],
  ["test:workflow-jitter-matrix:live", "live workflow jitter matrix"],
  ["test:workflow-jitter-matrix:release-profile", "release-profile workflow jitter matrix"],
  ["test:workflow-jitter-release-gate", "workflow jitter release gate"],
  ["test:workflow-jitter-release-gate:unit", "workflow jitter release gate unit tests"],
  ["test:workflow-jitter-release-gate:live", "live workflow jitter release gate"],
  ["test:workflow-jitter-release-gate:release-profile", "release-profile workflow jitter release gate"],
  ["test:workflow-jitter-replay-candidate:unit", "workflow jitter replay candidate unit tests"],
];

export function buildWorkflowJitterReleaseGateReport(input = {}) {
  const now = input.now ? new Date(input.now) : new Date();
  const matrix = objectValue(input.matrixReport);
  const packageJson = objectValue(input.packageJson);
  const scripts = objectValue(packageJson.scripts);
  const releaseProfile = input.releaseProfile === true;
  const requireLive = input.requireLive === true || releaseProfile;
  const maxAgeMinutes = nonNegativeNumber(input.maxAgeMinutes, DEFAULT_MAX_AGE_MINUTES);
  const minDeterministicTasks = nonNegativeNumber(input.minDeterministicTasks, 5);
  const requiredAxes = Array.isArray(input.requiredAxes) && input.requiredAxes.length ? input.requiredAxes : DEFAULT_REQUIRED_AXES;
  const releaseProfilePolicy = releaseProfilePolicyFromInput(input);
  const checks = [
    ...scriptChecks(scripts),
    matrixSchemaCheck(matrix),
    matrixFreshnessCheck(matrix, now, maxAgeMinutes),
    matrixDeterministicCoverageCheck(matrix, { minDeterministicTasks, requiredAxes }),
    matrixOutcomeCheck(matrix),
    matrixPromotionDebtCheck(matrix),
    matrixPromotionReplayBundleCheck(matrix),
    matrixLiveCheck(matrix, requireLive),
    matrixEnvironmentBlockerCheck(matrix, requireLive),
    matrixReleaseProfileCheck(matrix, releaseProfilePolicy),
    matrixSourceRevisionCheck(matrix, input.sourceRevision, input.requireCurrentHead === true),
    sourceFreshnessCheck(input.sourceRevision, input.requireCurrentHead === true),
  ];
  const blockingIssues = checks.filter((check) => check.status === "fail").flatMap((check) => check.issues);
  const advisoryIssues = checks.filter((check) => check.status === "warn").flatMap((check) => check.warnIssues);
  const liveSelected = Number(matrix.liveCount ?? 0) > 0;
  const status = blockingIssues.length > 0 ? "attention" : liveSelected ? "passed" : "passed_with_live_skipped";
  return {
    schemaVersion: 1,
    status,
    focus: "Workflow engine release gate: current jitter matrix evidence, deterministic coverage, live evidence, and promotion debt.",
    generatedAt: input.generatedAt ?? now.toISOString(),
    matrixReportPath: input.matrixReportPath,
    sourceRevision: input.sourceRevision,
    policy: {
      maxAgeMinutes,
      minDeterministicTasks,
      requiredAxes,
      requireLive,
      releaseProfile,
      releaseProfilePolicy,
      requireCurrentHead: input.requireCurrentHead === true,
    },
    matrix: compactMatrix(matrix),
    checks,
    releaseDecision: {
      ready: status === "passed" || status === "passed_with_live_skipped",
      liveRequired: requireLive,
      releaseProfile,
      liveSkipped: !liveSelected,
      blockingIssues,
      advisoryIssues,
      nextSlice:
        blockingIssues.length > 0
          ? "Fix the blocking workflow jitter release-gate issue(s), rerun the matrix locally, and only then merge broad workflow compiler changes."
          : releaseProfile
            ? "Workflow jitter release profile is green: deterministic stress, live prompt variants, dogfood run count, live families, and promotion debt are all satisfied."
            : liveSelected
              ? "Workflow jitter release gate is green with live GMI evidence; use release-profile mode before release-tag workflow compiler changes."
              : "Workflow jitter release gate is green for deterministic smoke evidence; run the live or release-profile gate before release-critical workflow compiler changes.",
    },
  };
}

export function workflowJitterReleaseGatePassed(report, options = {}) {
  if (!report || report.releaseDecision?.ready !== true) return false;
  if (options.requireLive === true && report.releaseDecision.liveSkipped === true) return false;
  return report.status === "passed" || (!options.requireLive && report.status === "passed_with_live_skipped");
}

export function renderWorkflowJitterReleaseGateMarkdown(report) {
  const lines = [
    "# Workflow Jitter Release Gate",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Matrix report: ${report.matrixReportPath ?? "unknown"}`,
    `Matrix run: ${report.matrix?.runId ?? "missing"}`,
    "",
    "## Decision",
    "",
    `- Ready: ${report.releaseDecision.ready ? "yes" : "no"}`,
    `- Live required: ${report.releaseDecision.liveRequired ? "yes" : "no"}`,
    `- Release profile: ${report.releaseDecision.releaseProfile ? "yes" : "no"}`,
    `- Live skipped: ${report.releaseDecision.liveSkipped ? "yes" : "no"}`,
    `- Next slice: ${report.releaseDecision.nextSlice}`,
    "",
    "## Checks",
    "",
    "| Check | Status | Evidence | Issues |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((check) =>
      `| ${[
        escapeMarkdownCell(check.label),
        check.status,
        escapeMarkdownCell((check.evidence ?? []).join("; ")),
        escapeMarkdownCell([...(check.issues ?? []), ...(check.warnIssues ?? [])].join("; ")),
      ].join(" | ")} |`,
    ),
    "",
  ];
  return `${lines.join("\n").trim()}\n`;
}

function scriptChecks(scripts) {
  return REQUIRED_SCRIPTS.map(([name, label]) => {
    const script = typeof scripts[name] === "string" ? scripts[name] : "";
    return check({
      id: `script.${name}`,
      area: "commands",
      status: script.trim() ? "pass" : "fail",
      label: `${label} command is registered`,
      evidence: script ? [`${name}: ${script}`] : [`missing package.json script ${name}`],
    });
  });
}

function matrixSchemaCheck(matrix) {
  const issues = [];
  if (matrix.schemaVersion !== 1) issues.push("Workflow jitter matrix report schemaVersion must be 1.");
  if (!matrix.runId) issues.push("Workflow jitter matrix report is missing runId.");
  if (!Array.isArray(matrix.tasks)) issues.push("Workflow jitter matrix report is missing tasks.");
  return check({
    id: "matrix.schema",
    area: "matrix",
    status: issues.length ? "fail" : "pass",
    label: "workflow jitter matrix report has the expected schema",
    evidence: [`runId: ${matrix.runId ?? "missing"}`, `schemaVersion: ${matrix.schemaVersion ?? "missing"}`],
    issues,
  });
}

function matrixFreshnessCheck(matrix, now, maxAgeMinutes) {
  const generatedAt = matrix.generatedAt ? new Date(matrix.generatedAt) : undefined;
  const issues = [];
  let ageMinutes;
  if (!generatedAt || Number.isNaN(generatedAt.getTime())) {
    issues.push("Workflow jitter matrix report has no valid generatedAt timestamp.");
  } else {
    ageMinutes = Math.round(((now.getTime() - generatedAt.getTime()) / 60_000) * 100) / 100;
    if (ageMinutes > maxAgeMinutes) issues.push(`Workflow jitter matrix report is stale: ${ageMinutes} minutes old; max is ${maxAgeMinutes}.`);
    if (ageMinutes < -5) issues.push(`Workflow jitter matrix report is from the future by ${Math.abs(ageMinutes)} minutes.`);
  }
  return check({
    id: "matrix.freshness",
    area: "freshness",
    status: issues.length ? "fail" : "pass",
    label: "workflow jitter matrix report is fresh enough for merge gating",
    evidence: [`generatedAt: ${matrix.generatedAt ?? "missing"}`, `ageMinutes: ${ageMinutes ?? "unknown"}`, `maxAgeMinutes: ${maxAgeMinutes}`],
    issues,
  });
}

function matrixDeterministicCoverageCheck(matrix, input) {
  const tasks = Array.isArray(matrix.tasks) ? matrix.tasks : [];
  const deterministicTasks = tasks.filter((task) => task.tier === "deterministic");
  const passedAxes = new Set(deterministicTasks.filter((task) => task.status === "passed").map((task) => task.axis));
  const missingAxes = input.requiredAxes.filter((axis) => !passedAxes.has(axis));
  const issues = [];
  if (deterministicTasks.length < input.minDeterministicTasks) {
    issues.push(`Workflow jitter matrix has ${deterministicTasks.length} deterministic rows; expected at least ${input.minDeterministicTasks}.`);
  }
  if (missingAxes.length) issues.push(`Workflow jitter matrix is missing passed deterministic axes: ${missingAxes.join(", ")}.`);
  return check({
    id: "matrix.deterministic-coverage",
    area: "matrix",
    status: issues.length ? "fail" : "pass",
    label: "deterministic matrix covers required workflow axes",
    evidence: [`deterministicRows: ${deterministicTasks.length}`, `passedAxes: ${Array.from(passedAxes).join(", ") || "none"}`],
    issues,
  });
}

function matrixOutcomeCheck(matrix) {
  const tasks = Array.isArray(matrix.tasks) ? matrix.tasks : [];
  const failedDeterministic = tasks.filter((task) => task.tier === "deterministic" && task.status !== "passed");
  const issues = [];
  if (Number(matrix.productOrTestFailureCount ?? 0) > 0) issues.push(`Workflow jitter matrix has ${matrix.productOrTestFailureCount} product/test failure row(s).`);
  if (failedDeterministic.length) issues.push(`Deterministic matrix rows are not green: ${failedDeterministic.map((task) => task.id).join(", ")}.`);
  return check({
    id: "matrix.outcomes",
    area: "matrix",
    status: issues.length ? "fail" : "pass",
    label: "workflow jitter matrix has no blocking product or deterministic failures",
    evidence: [
      `passed: ${matrix.passedCount ?? 0}/${matrix.taskCount ?? 0}`,
      `productOrTestFailureCount: ${matrix.productOrTestFailureCount ?? 0}`,
      `failedDeterministic: ${failedDeterministic.length}`,
    ],
    issues,
  });
}

function matrixPromotionDebtCheck(matrix) {
  const candidates = Array.isArray(matrix.promotionCandidates) ? matrix.promotionCandidates : [];
  const promoted = candidates.filter((candidate) => candidate.priority === "promote");
  return check({
    id: "matrix.promotion-debt",
    area: "matrix",
    status: promoted.length ? "fail" : candidates.length ? "warn" : "pass",
    label: "workflow jitter matrix has no recurring failure promotion debt",
    evidence: [`promotionCandidates: ${candidates.length}`, `promote: ${promoted.length}`],
    issues: promoted.map((candidate) => `Recurring workflow failure ${candidate.id} must be promoted into ${candidate.suggestedFixture ?? "a deterministic fixture"}.`),
    warnIssues: promoted.length ? [] : candidates.map((candidate) => `Watch workflow failure candidate ${candidate.id}; promote if it recurs.`),
  });
}

function matrixPromotionReplayBundleCheck(matrix) {
  const candidates = Array.isArray(matrix.promotionCandidates) ? matrix.promotionCandidates : [];
  const issues = [];
  let replayable = 0;
  for (const candidate of candidates) {
    const validation = validateWorkflowJitterReplayCandidateBundle({
      schemaVersion: 1,
      generatedAt: matrix.generatedAt,
      runId: matrix.runId,
      sourceRevision: matrix.sourceRevision,
      candidate,
    });
    if (validation.status === "fail") {
      issues.push(...validation.issues.map((issue) => `Promotion candidate ${candidate.id ?? "missing"} replay bundle is invalid: ${issue}`));
    } else {
      replayable += 1;
    }
  }
  return check({
    id: "matrix.promotion-replay-bundles",
    area: "matrix",
    status: issues.length ? "fail" : "pass",
    label: "workflow jitter promotion candidates have executable replay bundles",
    evidence: [`promotionCandidates: ${candidates.length}`, `replayable: ${replayable}`],
    issues,
  });
}

function matrixLiveCheck(matrix, requireLive) {
  const tasks = Array.isArray(matrix.tasks) ? matrix.tasks : [];
  const liveTasks = tasks.filter((task) => task.tier === "live");
  const nonPassingLive = liveTasks.filter((task) => task.status !== "passed");
  const issues = [];
  const warnIssues = [];
  if (requireLive && !liveTasks.length) issues.push("Live workflow jitter rows are required but missing.");
  if (requireLive && nonPassingLive.length) issues.push(`Live workflow jitter rows are not green: ${nonPassingLive.map((task) => task.id).join(", ")}.`);
  if (!requireLive && !liveTasks.length) warnIssues.push("Live workflow jitter rows were skipped for this deterministic gate.");
  if (!requireLive && nonPassingLive.length) warnIssues.push(`Live workflow jitter rows were non-green but advisory: ${nonPassingLive.map((task) => task.id).join(", ")}.`);
  return check({
    id: "matrix.live",
    area: "live",
    status: issues.length ? "fail" : warnIssues.length ? "warn" : "pass",
    label: "live workflow jitter rows satisfy the selected policy",
    evidence: [`liveRows: ${liveTasks.length}`, `nonPassingLiveRows: ${nonPassingLive.length}`, `requireLive: ${String(requireLive)}`],
    issues,
    warnIssues,
  });
}

function matrixEnvironmentBlockerCheck(matrix, requireLive) {
  const blockers = Array.isArray(matrix.environmentBlockers) ? matrix.environmentBlockers : [];
  const issues = blockers.map((blocker) => {
    const taskList = Array.isArray(blocker.taskIds) && blocker.taskIds.length ? ` (${blocker.taskIds.join(", ")})` : "";
    return `${blocker.kind ?? "environment"}${taskList}: ${blocker.summary ?? "workflow jitter live task was blocked by the local environment."}`;
  });
  return check({
    id: "matrix.environment-blockers",
    area: "environment",
    status: blockers.length ? (requireLive ? "fail" : "warn") : "pass",
    label: "workflow jitter environment blockers are explicit and actionable",
    evidence: blockers.length
      ? blockers.map((blocker) =>
          [
            `kind: ${blocker.kind ?? "missing"}`,
            `tasks: ${blocker.affectedTaskCount ?? blocker.taskIds?.length ?? 0}`,
            `preflight: ${blocker.preflight?.status ?? "missing"}`,
            `source: ${blocker.preflight?.selectedRootSource ?? "missing"}`,
            `label: ${blocker.preflight?.snapshotRootLabel ?? "missing"}`,
          ].join("; "),
        )
      : ["environmentBlockers: 0"],
    issues: requireLive ? issues : [],
    warnIssues: requireLive ? [] : issues,
  });
}

function matrixReleaseProfileCheck(matrix, policy) {
  if (!policy.enabled) {
    return check({
      id: "matrix.release-profile",
      area: "release-profile",
      status: "pass",
      label: "strict release-profile coverage is not required for this gate",
      evidence: ["releaseProfile: false"],
    });
  }
  const tasks = Array.isArray(matrix.tasks) ? matrix.tasks : [];
  const passedTasks = tasks.filter((task) => task.status === "passed");
  const deterministicStressUnits = sumTaskUnits(passedTasks.filter((task) => task.tier === "deterministic"), "deterministicStressUnits");
  const livePromptVariants = sumTaskUnits(passedTasks.filter((task) => task.tier === "live"), "livePromptVariantUnits");
  const liveDogfoodRuns = sumTaskUnits(passedTasks.filter((task) => task.tier === "live"), "liveDogfoodRunUnits");
  const liveFamilies = new Set(passedTasks.filter((task) => task.tier === "live").map((task) => task.liveFamily).filter(Boolean));
  const missingFamilies = policy.requiredLiveFamilies.filter((family) => !liveFamilies.has(family));
  const issues = [];
  if (matrix.profile !== "release") issues.push(`Workflow jitter matrix profile is ${matrix.profile ?? "missing"}; strict release profile requires release.`);
  if (deterministicStressUnits < policy.minDeterministicStressUnits) {
    issues.push(
      `Workflow jitter matrix has ${deterministicStressUnits} passed deterministic stress unit(s); strict release profile requires at least ${policy.minDeterministicStressUnits}.`,
    );
  }
  if (livePromptVariants < policy.minLivePromptVariants) {
    issues.push(`Workflow jitter matrix has ${livePromptVariants} passed live prompt variant(s); strict release profile requires at least ${policy.minLivePromptVariants}.`);
  }
  if (liveDogfoodRuns < policy.minLiveDogfoodRuns) {
    issues.push(`Workflow jitter matrix has ${liveDogfoodRuns} passed live UI dogfood run(s); strict release profile requires at least ${policy.minLiveDogfoodRuns}.`);
  }
  if (missingFamilies.length) issues.push(`Workflow jitter matrix is missing passed live family coverage: ${missingFamilies.join(", ")}.`);
  return check({
    id: "matrix.release-profile",
    area: "release-profile",
    status: issues.length ? "fail" : "pass",
    label: "strict release-profile coverage satisfies Phase 8 release bars",
    evidence: [
      `profile: ${matrix.profile ?? "missing"}`,
      `deterministicStressUnits: ${deterministicStressUnits}/${policy.minDeterministicStressUnits}`,
      `livePromptVariants: ${livePromptVariants}/${policy.minLivePromptVariants}`,
      `liveDogfoodRuns: ${liveDogfoodRuns}/${policy.minLiveDogfoodRuns}`,
      `liveFamilies: ${Array.from(liveFamilies).sort().join(", ") || "none"}`,
    ],
    issues,
  });
}

function matrixSourceRevisionCheck(matrix, sourceRevision, requireCurrentHead) {
  const matrixRevision = objectValue(matrix.sourceRevision);
  const currentRevision = objectValue(sourceRevision);
  const issues = [];
  const warnIssues = [];
  if (!matrixRevision.gitHead) {
    const message = "Workflow jitter matrix report is missing source revision provenance.";
    if (requireCurrentHead) issues.push(message);
    else warnIssues.push(message);
  }
  if (matrixRevision.dirty) {
    const message = "Workflow jitter matrix was produced from a tracked-dirty worktree.";
    if (requireCurrentHead) issues.push(message);
    else warnIssues.push(message);
  }
  if (requireCurrentHead && !currentRevision.gitHead) {
    issues.push("Current git head was not available for matrix source-revision matching.");
  }
  if (matrixRevision.gitHead && currentRevision.gitHead && matrixRevision.gitHead !== currentRevision.gitHead) {
    const message = `Workflow jitter matrix was produced from ${matrixRevision.gitHead}, but current git head is ${currentRevision.gitHead}.`;
    if (requireCurrentHead) issues.push(message);
    else warnIssues.push(message);
  }
  return check({
    id: "matrix.source-revision",
    area: "freshness",
    status: issues.length ? "fail" : warnIssues.length ? "warn" : "pass",
    label: "workflow jitter matrix source revision matches the selected freshness policy",
    evidence: [
      `matrixGitHead: ${matrixRevision.gitHead ?? "missing"}`,
      `matrixDirty: ${String(Boolean(matrixRevision.dirty))}`,
      `currentGitHead: ${currentRevision.gitHead ?? "missing"}`,
      `requireCurrentHead: ${String(requireCurrentHead)}`,
    ],
    issues,
    warnIssues,
  });
}

function sourceFreshnessCheck(sourceRevision, requireCurrentHead) {
  if (!requireCurrentHead) return check({
    id: "freshness.current-head",
    area: "freshness",
    status: "pass",
    label: "current git head freshness is not required for this gate",
    evidence: ["requireCurrentHead: false"],
  });
  const revision = objectValue(sourceRevision);
  const issues = [];
  if (!revision.gitHead) issues.push("Current git head was not available for strict workflow jitter release-gate freshness.");
  if (revision.dirty) issues.push("Current worktree has tracked uncommitted changes; strict workflow jitter release-gate freshness requires a clean source tree.");
  return check({
    id: "freshness.current-head",
    area: "freshness",
    status: issues.length ? "fail" : "pass",
    label: "strict workflow jitter release gate has a current clean source revision",
    evidence: [`gitHead: ${revision.gitHead ?? "missing"}`, `dirty: ${String(Boolean(revision.dirty))}`],
    issues,
  });
}

function check(input) {
  const issues = input.status === "fail" ? input.issues?.length ? input.issues : [`${input.label}.`] : [];
  const warnIssues = input.status === "warn" ? input.warnIssues?.length ? input.warnIssues : [`${input.label}.`] : [];
  return {
    id: input.id,
    area: input.area,
    status: input.status,
    label: input.label,
    evidence: input.evidence ?? [],
    issues,
    warnIssues,
  };
}

function compactMatrix(matrix) {
  return {
    runId: matrix.runId,
    generatedAt: matrix.generatedAt,
    profile: matrix.profile,
    sourceRevision: objectValue(matrix.sourceRevision),
    taskCount: matrix.taskCount,
    deterministicCount: matrix.deterministicCount,
    liveCount: matrix.liveCount,
    deterministicStressUnitCount: matrix.deterministicStressUnitCount,
    livePromptVariantCount: matrix.livePromptVariantCount,
    liveDogfoodRunCount: matrix.liveDogfoodRunCount,
    liveFamilies: Array.isArray(matrix.liveFamilies) ? matrix.liveFamilies : [],
    passedCount: matrix.passedCount,
    providerDegradedCount: matrix.providerDegradedCount,
    environmentSkippedCount: matrix.environmentSkippedCount,
    productOrTestFailureCount: matrix.productOrTestFailureCount,
    promotionCandidateCount: Array.isArray(matrix.promotionCandidates) ? matrix.promotionCandidates.length : 0,
    environmentBlockers: Array.isArray(matrix.environmentBlockers)
      ? matrix.environmentBlockers.map((blocker) => ({
          kind: blocker.kind,
          summary: blocker.summary,
          affectedTaskCount: blocker.affectedTaskCount,
          taskIds: Array.isArray(blocker.taskIds) ? blocker.taskIds : [],
          preflight: blocker.preflight
            ? {
                status: blocker.preflight.status,
                selectedRootSource: blocker.preflight.selectedRootSource,
                snapshotRootLabel: blocker.preflight.snapshotRootLabel,
                snapshotRootPathDigest: blocker.preflight.snapshotRootPathDigest,
                candidateCount: Array.isArray(blocker.preflight.candidateRoots) ? blocker.preflight.candidateRoots.length : 0,
              }
            : undefined,
        }))
      : [],
    taskIds: Array.isArray(matrix.tasks) ? matrix.tasks.map((task) => task.id) : [],
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
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

function parseCliArgs(args) {
  const parsed = {
    matrixReportPath: process.env.AMBIENT_WORKFLOW_JITTER_RELEASE_GATE_MATRIX || DEFAULT_MATRIX_REPORT,
    outputPath: process.env.AMBIENT_WORKFLOW_JITTER_RELEASE_GATE_OUT || DEFAULT_OUTPUT_PATH,
    requireLive: process.env.AMBIENT_WORKFLOW_JITTER_RELEASE_GATE_REQUIRE_LIVE === "1",
    releaseProfile: process.env.AMBIENT_WORKFLOW_JITTER_RELEASE_GATE_RELEASE_PROFILE === "1",
    requireCurrentHead: process.env.AMBIENT_WORKFLOW_JITTER_RELEASE_GATE_REQUIRE_CURRENT_HEAD === "1",
    maxAgeMinutes: nonNegativeNumber(process.env.AMBIENT_WORKFLOW_JITTER_RELEASE_GATE_MAX_AGE_MINUTES, DEFAULT_MAX_AGE_MINUTES),
    minReleaseDeterministicStressUnits: nonNegativeNumber(
      process.env.AMBIENT_WORKFLOW_JITTER_RELEASE_GATE_MIN_DETERMINISTIC_STRESS_UNITS,
      DEFAULT_MIN_RELEASE_DETERMINISTIC_STRESS_UNITS,
    ),
    minReleaseLivePromptVariants: nonNegativeNumber(
      process.env.AMBIENT_WORKFLOW_JITTER_RELEASE_GATE_MIN_LIVE_PROMPT_VARIANTS,
      DEFAULT_MIN_RELEASE_LIVE_PROMPT_VARIANTS,
    ),
    minReleaseLiveDogfoodRuns: nonNegativeNumber(
      process.env.AMBIENT_WORKFLOW_JITTER_RELEASE_GATE_MIN_LIVE_DOGFOOD_RUNS,
      DEFAULT_MIN_RELEASE_LIVE_DOGFOOD_RUNS,
    ),
    requiredReleaseLiveFamilies: DEFAULT_REQUIRED_RELEASE_LIVE_FAMILIES,
    json: false,
    help: false,
  };
  for (const arg of args) {
    if (arg === "--require-live") parsed.requireLive = true;
    else if (arg === "--release-profile") parsed.releaseProfile = true;
    else if (arg === "--require-current-head") parsed.requireCurrentHead = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg.startsWith("--matrix=")) parsed.matrixReportPath = arg.slice("--matrix=".length);
    else if (arg.startsWith("--out=")) parsed.outputPath = arg.slice("--out=".length);
    else if (arg.startsWith("--max-age-minutes=")) parsed.maxAgeMinutes = nonNegativeIntArg(arg, "--max-age-minutes=");
    else if (arg.startsWith("--min-deterministic-stress-units=")) {
      parsed.minReleaseDeterministicStressUnits = nonNegativeIntArg(arg, "--min-deterministic-stress-units=");
    } else if (arg.startsWith("--min-live-prompt-variants=")) {
      parsed.minReleaseLivePromptVariants = nonNegativeIntArg(arg, "--min-live-prompt-variants=");
    } else if (arg.startsWith("--min-live-dogfood-runs=")) {
      parsed.minReleaseLiveDogfoodRuns = nonNegativeIntArg(arg, "--min-live-dogfood-runs=");
    } else if (arg.startsWith("--required-live-family=")) {
      parsed.requiredReleaseLiveFamilies = normalizeListArg(arg.slice("--required-live-family=".length));
    }
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else throw new Error(`Unknown option ${arg}. Run with --help for usage.`);
  }
  parsed.matrixReportPath = resolve(repoRoot, parsed.matrixReportPath);
  parsed.outputPath = resolve(repoRoot, parsed.outputPath);
  return parsed;
}

function usage() {
  return `Usage: node scripts/workflow-jitter-release-gate.mjs [options]

Options:
  --matrix=PATH              Workflow jitter matrix latest.json path.
  --out=PATH                 Release-gate JSON output path.
  --require-live             Fail unless live matrix rows are present and green.
  --release-profile          Enforce release-scale deterministic stress, live prompt variants, dogfood run count, and live families.
  --require-current-head     Fail if tracked files are dirty.
  --max-age-minutes=N        Maximum accepted matrix report age. Default: ${DEFAULT_MAX_AGE_MINUTES}.
  --min-deterministic-stress-units=N  Strict release-profile deterministic unit minimum. Default: ${DEFAULT_MIN_RELEASE_DETERMINISTIC_STRESS_UNITS}.
  --min-live-prompt-variants=N        Strict release-profile live prompt variant minimum. Default: ${DEFAULT_MIN_RELEASE_LIVE_PROMPT_VARIANTS}.
  --min-live-dogfood-runs=N           Strict release-profile UI dogfood run minimum. Default: ${DEFAULT_MIN_RELEASE_LIVE_DOGFOOD_RUNS}.
  --required-live-family=A,B          Strict release-profile live families. Default: ${DEFAULT_REQUIRED_RELEASE_LIVE_FAMILIES.join(",")}.
  --json                     Print the full report JSON.
`;
}

function printHumanSummary(report, outputPath) {
  const counts = report.checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    JSON.stringify(
      {
        status: report.status,
        checks: counts,
        matrix: report.matrix,
        blockingIssues: report.releaseDecision.blockingIssues,
        advisoryIssues: report.releaseDecision.advisoryIssues,
        nextSlice: report.releaseDecision.nextSlice,
        outputPath,
      },
      null,
      2,
    ),
  );
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function nonNegativeIntArg(arg, prefix) {
  const value = Number(arg.slice(prefix.length));
  if (!Number.isFinite(value) || value < 0) throw new Error(`Expected a non-negative integer for ${prefix.slice(0, -1)}`);
  return Math.floor(value);
}

function releaseProfilePolicyFromInput(input) {
  return {
    enabled: input.releaseProfile === true,
    minDeterministicStressUnits: nonNegativeNumber(input.minReleaseDeterministicStressUnits, DEFAULT_MIN_RELEASE_DETERMINISTIC_STRESS_UNITS),
    minLivePromptVariants: nonNegativeNumber(input.minReleaseLivePromptVariants, DEFAULT_MIN_RELEASE_LIVE_PROMPT_VARIANTS),
    minLiveDogfoodRuns: nonNegativeNumber(input.minReleaseLiveDogfoodRuns, DEFAULT_MIN_RELEASE_LIVE_DOGFOOD_RUNS),
    requiredLiveFamilies:
      Array.isArray(input.requiredReleaseLiveFamilies) && input.requiredReleaseLiveFamilies.length
        ? input.requiredReleaseLiveFamilies
        : DEFAULT_REQUIRED_RELEASE_LIVE_FAMILIES,
  };
}

function sumTaskUnits(tasks, field) {
  return tasks.reduce((total, task) => total + (Number(task[field]) || 0), 0);
}

function normalizeListArg(value) {
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }
    const report = buildWorkflowJitterReleaseGateReport({
      packageJson: await readJson(join(repoRoot, "package.json")),
      matrixReport: await readJson(options.matrixReportPath),
      matrixReportPath: options.matrixReportPath,
      requireLive: options.requireLive,
      releaseProfile: options.releaseProfile,
      requireCurrentHead: options.requireCurrentHead,
      maxAgeMinutes: options.maxAgeMinutes,
      minReleaseDeterministicStressUnits: options.minReleaseDeterministicStressUnits,
      minReleaseLivePromptVariants: options.minReleaseLivePromptVariants,
      minReleaseLiveDogfoodRuns: options.minReleaseLiveDogfoodRuns,
      requiredReleaseLiveFamilies: options.requiredReleaseLiveFamilies,
      sourceRevision: await readSourceRevision(repoRoot),
    });
    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(options.outputPath.replace(/\.json$/i, ".md"), renderWorkflowJitterReleaseGateMarkdown(report), "utf8");
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHumanSummary(report, options.outputPath);
    if (!workflowJitterReleaseGatePassed(report, { requireLive: options.requireLive })) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
