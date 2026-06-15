#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_JSON = "decision-report.json";
const DEFAULT_MARKDOWN = "decision-report.md";
const DEFAULT_BASELINE = "baseline";
const DEFAULT_MIN_IMPROVEMENT = 0.1;
const DEFAULT_MIN_TRIALS = 1;

export function parseReportArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    runRoot: env.AMBIENT_HARNESS_REPORT_RUN_ROOT,
    baseline: env.AMBIENT_HARNESS_REPORT_BASELINE || DEFAULT_BASELINE,
    outputJson: env.AMBIENT_HARNESS_REPORT_JSON || DEFAULT_JSON,
    outputMarkdown: env.AMBIENT_HARNESS_REPORT_MARKDOWN || DEFAULT_MARKDOWN,
    minImprovement: numberValue(env.AMBIENT_HARNESS_REPORT_MIN_IMPROVEMENT, DEFAULT_MIN_IMPROVEMENT, "AMBIENT_HARNESS_REPORT_MIN_IMPROVEMENT"),
    minTrials: positiveInteger(env.AMBIENT_HARNESS_REPORT_MIN_TRIALS, DEFAULT_MIN_TRIALS, "AMBIENT_HARNESS_REPORT_MIN_TRIALS"),
    cwd: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [flag, inlineValue] = raw.includes("=") ? raw.split(/=(.*)/s, 2) : [raw, undefined];
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= argv.length) throw new Error(`${flag} requires a value.`);
      return argv[index];
    };

    if (flag === "--run-root" || flag === "--run") options.runRoot = readValue();
    else if (flag === "--baseline") options.baseline = readValue();
    else if (flag === "--output-json") options.outputJson = readValue();
    else if (flag === "--output-md" || flag === "--output-markdown") options.outputMarkdown = readValue();
    else if (flag === "--min-improvement") options.minImprovement = numberValue(readValue(), DEFAULT_MIN_IMPROVEMENT, "--min-improvement");
    else if (flag === "--min-trials") options.minTrials = positiveInteger(readValue(), DEFAULT_MIN_TRIALS, "--min-trials");
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`Unknown harness-eval-report option: ${raw}`);
  }

  if (!options.help && !options.runRoot) throw new Error("Provide --run-root <test-results/harness-evals/run-id>.");
  return options;
}

export async function runHarnessReport(options, deps = {}) {
  const cwd = deps.cwd ?? options.cwd ?? process.cwd();
  const now = deps.now ?? (() => new Date());
  const runRoot = resolve(cwd, options.runRoot);
  const config = await readOptionalJson(join(runRoot, "config.json")) ?? { runId: basenameForReport(runRoot) };
  const results = await readResults(runRoot);
  const judgeRows = await readJudgeRows(runRoot);
  const report = buildDecisionReport({
    config,
    results,
    judgeRows,
    runRoot,
    baselineVariant: options.baseline,
    minImprovement: options.minImprovement,
    minTrials: options.minTrials,
    generatedAt: now().toISOString(),
  });

  await writeJson(join(runRoot, options.outputJson), report);
  await writeFile(join(runRoot, options.outputMarkdown), renderDecisionMarkdown(report), "utf8");
  return { runRoot, report };
}

export function buildDecisionReport(input) {
  const deterministic = aggregateDeterministic(input.results);
  const judge = aggregateJudge(input.judgeRows);
  const baseline = deterministic.get(input.baselineVariant);
  const baselineJudge = judge.get(input.baselineVariant);
  const coverageSpec = buildCoverageSpec(input.config, input.results, baseline);
  const variants = [...deterministic.values()].map((entry) => {
    const judgeEntry = judge.get(entry.variant);
    const comparison = compareToBaseline(entry, judgeEntry, baseline, baselineJudge);
    const coverage = buildCoverage(entry, coverageSpec);
    return {
      variant: entry.variant,
      role: entry.variant === input.baselineVariant ? "baseline" : "candidate",
      deterministic: entry,
      judge: judgeEntry,
      comparison,
      coverage,
      gate: decidePromotionGate({
        variant: entry.variant,
        baselineVariant: input.baselineVariant,
        deterministic: entry,
        judge: judgeEntry,
        baseline,
        baselineJudge,
        coverage,
        minImprovement: input.minImprovement,
        minTrials: input.minTrials,
      }),
    };
  });
  variants.sort((left, right) => {
    const rank = gateRank(left.gate.status) - gateRank(right.gate.status);
    if (rank !== 0) return rank;
    if ((right.judge?.medianScore ?? 0) !== (left.judge?.medianScore ?? 0)) return (right.judge?.medianScore ?? 0) - (left.judge?.medianScore ?? 0);
    if ((right.deterministic.passRate ?? 0) !== (left.deterministic.passRate ?? 0)) return (right.deterministic.passRate ?? 0) - (left.deterministic.passRate ?? 0);
    return left.variant.localeCompare(right.variant);
  });
  const candidates = variants.filter((variant) => variant.role !== "baseline");
  const recommended = candidates.find((variant) => variant.gate.status === "promote") ?? candidates.find((variant) => variant.gate.status === "needs-more-evidence") ?? variants.find((variant) => variant.role === "baseline");
  return {
    version: 1,
    runId: input.config.runId,
    generatedAt: input.generatedAt,
    runRoot: input.runRoot,
    baselineVariant: input.baselineVariant,
    thresholds: {
      minImprovement: input.minImprovement,
      minTrials: input.minTrials,
    },
    coverage: coverageSpec,
    recommendedVariant: recommended?.variant,
    recommendation: recommended?.gate,
    variants,
    failureClusters: buildFailureClusters(input.results),
    sourceFiles: {
      config: "config.json",
      results: "results.jsonl",
      frontier: existsSync(join(input.runRoot, "frontier.json")) ? "frontier.json" : undefined,
      judgeFrontier: existsSync(join(input.runRoot, "judge-frontier.json")) ? "judge-frontier.json" : undefined,
    },
  };
}

export function aggregateDeterministic(results) {
  const byVariant = new Map();
  for (const row of results) {
    const entry = byVariant.get(row.variant) ?? {
      variant: row.variant,
      trialCount: 0,
      evaluated: 0,
      passed: 0,
      failed: 0,
      passRate: null,
      medianElapsedMs: undefined,
      medianToolEventCount: undefined,
      tasks: {},
      elapsedMs: [],
      toolEventCounts: [],
      mutation: { checked: 0, passed: 0, failed: 0, unexpectedPaths: [] },
    };
    entry.trialCount += 1;
    if (row.status !== "planned") {
      entry.evaluated += 1;
      if (row.deterministic?.passed) entry.passed += 1;
      else entry.failed += 1;
    }
    if (typeof row.elapsedMs === "number") entry.elapsedMs.push(row.elapsedMs);
    if (typeof row.metrics?.toolEventCount === "number") entry.toolEventCounts.push(row.metrics.toolEventCount);
    addMutationAggregate(entry.mutation, row.deterministic?.mutation);

    const task = entry.tasks[row.taskId] ?? {
      taskId: row.taskId,
      trialCount: 0,
      evaluated: 0,
      passed: 0,
      failed: 0,
      passRate: null,
      medianElapsedMs: undefined,
      elapsedMs: [],
      mutation: { checked: 0, passed: 0, failed: 0, unexpectedPaths: [] },
    };
    task.trialCount += 1;
    if (row.status !== "planned") {
      task.evaluated += 1;
      if (row.deterministic?.passed) task.passed += 1;
      else task.failed += 1;
    }
    if (typeof row.elapsedMs === "number") task.elapsedMs.push(row.elapsedMs);
    addMutationAggregate(task.mutation, row.deterministic?.mutation);
    entry.tasks[row.taskId] = task;
    byVariant.set(row.variant, entry);
  }

  for (const entry of byVariant.values()) {
    entry.passRate = entry.evaluated ? entry.passed / entry.evaluated : null;
    entry.medianElapsedMs = median(entry.elapsedMs);
    entry.medianToolEventCount = median(entry.toolEventCounts);
    for (const task of Object.values(entry.tasks)) {
      task.passRate = task.evaluated ? task.passed / task.evaluated : null;
      task.medianElapsedMs = median(task.elapsedMs);
      delete task.elapsedMs;
    }
    delete entry.elapsedMs;
    delete entry.toolEventCounts;
  }
  return byVariant;
}

function addMutationAggregate(target, mutation) {
  if (!mutation?.evaluated && !mutation?.missingTrace) return;
  target.checked += 1;
  if (mutation.passed) target.passed += 1;
  else target.failed += 1;
  target.unexpectedPaths.push(...boundedStrings(mutation.unexpectedPaths ?? [], 20, 180));
  target.unexpectedPaths = [...new Set(target.unexpectedPaths)].slice(0, 20);
}

function buildCoverageSpec(config, results, baseline) {
  const configuredTasks = Array.isArray(config?.tasks) ? config.tasks.filter((task) => typeof task === "string" && task.trim()) : [];
  const baselineTasks = baseline ? Object.keys(baseline.tasks).sort() : [];
  const resultTasks = [...new Set(results.map((row) => row.taskId).filter((task) => typeof task === "string" && task.trim()))].sort();
  const tasks = configuredTasks.length ? [...new Set(configuredTasks)] : baselineTasks.length ? baselineTasks : resultTasks;
  const configuredTrials = Number.isInteger(config?.trials) && config.trials > 0 ? config.trials : undefined;
  const expectedTrialsByTask = Object.fromEntries(
    tasks.map((taskId) => {
      const baselineCount = baseline?.tasks?.[taskId]?.evaluated;
      return [taskId, configuredTrials ?? (typeof baselineCount === "number" && baselineCount > 0 ? baselineCount : 1)];
    }),
  );
  return {
    tasks,
    expectedTrialsByTask,
    expectedTrialCount: Object.values(expectedTrialsByTask).reduce((sum, count) => sum + count, 0),
  };
}

function buildCoverage(entry, spec) {
  const tasks = spec.tasks.map((taskId) => {
    const evaluated = entry.tasks[taskId]?.evaluated ?? 0;
    const expected = spec.expectedTrialsByTask[taskId] ?? 0;
    return {
      taskId,
      evaluated,
      expected,
      missing: Math.max(0, expected - evaluated),
    };
  });
  const evaluatedTrialCount = tasks.reduce((sum, task) => sum + Math.min(task.evaluated, task.expected), 0);
  const missingTrialCount = tasks.reduce((sum, task) => sum + task.missing, 0);
  return {
    expectedTrialCount: spec.expectedTrialCount,
    evaluatedTrialCount,
    missingTrialCount,
    complete: missingTrialCount === 0,
    tasks,
  };
}

export function aggregateJudge(judgeRows) {
  const byVariant = new Map();
  for (const row of judgeRows) {
    const entry = byVariant.get(row.variant) ?? {
      variant: row.variant,
      candidateLabel: row.candidateLabel,
      judged: 0,
      valid: 0,
      invalid: 0,
      deterministicPasses: 0,
      mergedPasses: 0,
      mergedPassRate: null,
      medianScore: undefined,
      riskCounts: { low: 0, medium: 0, high: 0 },
      concerns: [],
      scores: [],
    };
    entry.judged += 1;
    if (row.status === "valid" && row.judge) {
      entry.valid += 1;
      if (row.deterministicPassed) entry.deterministicPasses += 1;
      if (row.merged?.pass) entry.mergedPasses += 1;
      if (typeof row.merged?.score === "number") entry.scores.push(row.merged.score);
      if (row.judge.unrelatedMutationRisk in entry.riskCounts) entry.riskCounts[row.judge.unrelatedMutationRisk] += 1;
      entry.concerns.push(...boundedStrings(row.judge.concerns ?? [], 10, 220));
    } else {
      entry.invalid += 1;
    }
    byVariant.set(row.variant, entry);
  }
  for (const entry of byVariant.values()) {
    entry.mergedPassRate = entry.valid ? entry.mergedPasses / entry.valid : null;
    entry.medianScore = median(entry.scores);
    entry.concerns = [...new Set(entry.concerns)].slice(0, 10);
    delete entry.scores;
  }
  return byVariant;
}

export function decidePromotionGate(input) {
  if (input.variant === input.baselineVariant) {
    return { status: "baseline", severity: "info", reasons: ["Reference variant for comparisons."] };
  }
  if (!input.baseline) {
    return { status: "needs-more-evidence", severity: "warning", reasons: [`Baseline variant "${input.baselineVariant}" is missing.`] };
  }
  const reasons = [];
  const deterministic = input.deterministic;
  const baseline = input.baseline;
  const comparison = compareToBaseline(deterministic, input.judge, baseline, input.baselineJudge);
  let hasBlockingFailure = false;
  if (deterministic.evaluated < input.minTrials) reasons.push(`Only ${deterministic.evaluated} evaluated trial(s); minimum is ${input.minTrials}.`);
  if (input.coverage && !input.coverage.complete) {
    hasBlockingFailure = true;
    reasons.push(coverageFailureReason(input.coverage));
  }
  if ((deterministic.passRate ?? 0) < (baseline.passRate ?? 0)) {
    hasBlockingFailure = true;
    reasons.push(`Deterministic pass rate ${percent(deterministic.passRate)} is below baseline ${percent(baseline.passRate)}.`);
  }
  if ((deterministic.mutation?.failed ?? 0) > 0) {
    hasBlockingFailure = true;
    reasons.push(mutationFailureReason(deterministic.mutation));
  }
  if (input.judge?.invalid) {
    hasBlockingFailure = true;
    reasons.push(`${input.judge.invalid} invalid judge result(s).`);
  }
  if ((input.judge?.riskCounts?.high ?? 0) > 0) {
    hasBlockingFailure = true;
    reasons.push(`${input.judge.riskCounts.high} high-risk judge result(s).`);
  }
  if (input.baselineJudge && input.judge && (input.judge.mergedPassRate ?? 0) < (input.baselineJudge.mergedPassRate ?? 0)) {
    hasBlockingFailure = true;
    reasons.push(`Judge merged pass rate ${percent(input.judge.mergedPassRate)} is below baseline ${percent(input.baselineJudge.mergedPassRate)}.`);
  }
  if (hasBlockingFailure) return { status: "reject", severity: "error", reasons };
  if (reasons.length) return { status: "needs-more-evidence", severity: "warning", reasons };
  if ((comparison.elapsedReduction ?? 0) >= input.minImprovement || (comparison.toolEventReduction ?? 0) >= input.minImprovement) {
    return {
      status: "promote",
      severity: "success",
      reasons: [
        `Matches or exceeds baseline pass rate and improves elapsed time/tool events by at least ${percent(input.minImprovement)}.`,
      ],
    };
  }
  return {
    status: "needs-more-evidence",
    severity: "warning",
    reasons: [`No ${percent(input.minImprovement)} elapsed/tool-event improvement over baseline yet.`],
  };
}

export function compareToBaseline(entry, judgeEntry, baseline, baselineJudge) {
  if (!baseline) return {};
  return {
    passRateDelta: delta(entry.passRate, baseline.passRate),
    elapsedReduction: reduction(entry.medianElapsedMs, baseline.medianElapsedMs),
    toolEventReduction: reduction(entry.medianToolEventCount, baseline.medianToolEventCount),
    judgeMergedPassRateDelta: baselineJudge ? delta(judgeEntry?.mergedPassRate, baselineJudge.mergedPassRate) : undefined,
    judgeScoreDelta: baselineJudge ? delta(judgeEntry?.medianScore, baselineJudge.medianScore) : undefined,
  };
}

export function buildFailureClusters(results) {
  const clusters = new Map();
  for (const row of results) {
    if (row.status === "planned" || row.deterministic?.passed) continue;
    const category = row.deterministic?.failureCategory ?? row.status ?? "unknown";
    const key = `${row.taskId}:${category}`;
    const cluster = clusters.get(key) ?? {
      taskId: row.taskId,
      failureCategory: category,
      count: 0,
      variants: {},
      artifacts: [],
      evidence: [],
    };
    cluster.count += 1;
    cluster.variants[row.variant] = (cluster.variants[row.variant] ?? 0) + 1;
    if (row.artifactDir) cluster.artifacts.push(row.artifactDir);
    cluster.evidence.push(...boundedStrings(row.deterministic?.evidence ?? [], 4, 180));
    clusters.set(key, cluster);
  }
  return [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      artifacts: cluster.artifacts.slice(0, 8),
      evidence: [...new Set(cluster.evidence)].slice(0, 8),
    }))
    .sort((left, right) => right.count - left.count || left.taskId.localeCompare(right.taskId));
}

export function renderDecisionMarkdown(report) {
  const lines = [
    "# Meta-Harness Decision Report",
    "",
    `Run ID: \`${report.runId}\``,
    `Generated: \`${report.generatedAt}\``,
    `Baseline: \`${report.baselineVariant}\``,
    `Recommendation: \`${report.recommendedVariant ?? "none"}\` (${report.recommendation?.status ?? "unknown"})`,
    "",
    "## Variant Frontier",
    "",
    "| Variant | Gate | Det Pass | Judge Pass | Coverage | Mutation | Median Score | Elapsed Delta | Tool Delta | Notes |",
    "| --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | --- |",
    ...report.variants.map((variant) =>
      `| \`${variant.variant}\` | ${variant.gate.status} | ${percent(variant.deterministic.passRate)} | ${percent(variant.judge?.mergedPassRate)} | ${coverageSummary(variant.coverage)} | ${mutationSummary(variant.deterministic.mutation)} | ${score(variant.judge?.medianScore)} | ${percent(variant.comparison.elapsedReduction)} | ${percent(variant.comparison.toolEventReduction)} | ${escapePipe(variant.gate.reasons.join(" "))} |`,
    ),
    "",
    "## Coverage Breakdown",
    "",
    "| Variant | Task | Evaluated | Expected | Missing |",
    "| --- | --- | ---: | ---: | ---: |",
    ...report.variants.flatMap((variant) =>
      variant.coverage.tasks.map((task) =>
        `| \`${variant.variant}\` | \`${task.taskId}\` | ${task.evaluated} | ${task.expected} | ${task.missing} |`,
      ),
    ),
    "",
    "## Task Breakdown",
    "",
    "| Variant | Task | Trials | Pass Rate | Median Elapsed |",
    "| --- | --- | ---: | ---: | ---: |",
    ...report.variants.flatMap((variant) =>
      Object.values(variant.deterministic.tasks).map((task) =>
        `| \`${variant.variant}\` | \`${task.taskId}\` | ${task.evaluated} | ${percent(task.passRate)} | ${ms(task.medianElapsedMs)} |`,
      ),
    ),
    "",
    "## Failure Clusters",
    "",
    ...(report.failureClusters.length
      ? report.failureClusters.flatMap((cluster) => [
          `- \`${cluster.taskId}\` / \`${cluster.failureCategory}\`: ${cluster.count} trial(s), variants ${Object.entries(cluster.variants)
            .map(([variant, count]) => `${variant}=${count}`)
            .join(", ")}.`,
          ...cluster.evidence.map((evidence) => `  - ${evidence}`),
        ])
      : ["- No deterministic failures recorded."]),
    "",
    "## Gate Rules",
    "",
    `- Candidate must match or exceed baseline deterministic pass rate.`,
    `- Candidate must complete expected task/trial coverage before promotion.`,
    `- Candidate must have zero mutation-policy failures for evaluated trials.`,
    `- Candidate must not introduce high-risk or invalid judge results.`,
    `- Candidate should improve median elapsed time or tool events by at least ${percent(report.thresholds.minImprovement)} before promotion.`,
    "- Deterministic local facts remain authoritative over judge opinions.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function readResults(runRoot) {
  const path = join(runRoot, "results.jsonl");
  if (!existsSync(path)) throw new Error(`Missing results.jsonl in ${runRoot}`);
  return parseJsonl(await readFile(path, "utf8"));
}

async function readJudgeRows(runRoot) {
  const candidates = ["judge-results.jsonl", "judge-results.json"];
  for (const file of candidates) {
    const path = join(runRoot, file);
    if (!existsSync(path)) continue;
    const text = await readFile(path, "utf8");
    if (file.endsWith(".jsonl")) return parseJsonl(text);
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

async function readOptionalJson(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function boundedStrings(values, maxItems, maxChars) {
  return (Array.isArray(values) ? values : [])
    .filter((value) => typeof value === "string" && value.trim())
    .slice(0, maxItems)
    .map((value) => value.replace(/\s+/g, " ").trim().slice(0, maxChars));
}

function gateRank(status) {
  if (status === "promote") return 0;
  if (status === "baseline") return 1;
  if (status === "needs-more-evidence") return 2;
  if (status === "reject") return 3;
  return 4;
}

function delta(value, baseline) {
  if (typeof value !== "number" || typeof baseline !== "number") return undefined;
  return value - baseline;
}

function reduction(value, baseline) {
  if (typeof value !== "number" || typeof baseline !== "number" || baseline <= 0) return undefined;
  return (baseline - value) / baseline;
}

function median(values) {
  const sorted = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return undefined;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function numberValue(value, fallback, label) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number.`);
  return parsed;
}

function positiveInteger(value, fallback, label) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function percent(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a";
}

function score(value) {
  return typeof value === "number" ? value.toFixed(2) : "n/a";
}

function ms(value) {
  return typeof value === "number" ? `${Math.round(value)}ms` : "n/a";
}

function coverageSummary(coverage) {
  if (!coverage) return "n/a";
  if (coverage.complete) return `${coverage.evaluatedTrialCount}/${coverage.expectedTrialCount} ok`;
  return `${coverage.missingTrialCount}/${coverage.expectedTrialCount} missing`;
}

function coverageFailureReason(coverage) {
  const missingTasks = coverage.tasks
    .filter((task) => task.missing > 0)
    .slice(0, 8)
    .map((task) => `${task.taskId} missing ${task.missing}/${task.expected}`)
    .join(", ");
  return `Coverage incomplete: ${coverage.missingTrialCount}/${coverage.expectedTrialCount} expected trial(s) missing${missingTasks ? ` (${missingTasks})` : ""}.`;
}

function mutationSummary(mutation) {
  if (!mutation?.checked) return "n/a";
  if (mutation.failed) return `${mutation.failed}/${mutation.checked} failed`;
  return `${mutation.passed}/${mutation.checked} ok`;
}

function mutationFailureReason(mutation) {
  const unexpected = mutation.unexpectedPaths?.length
    ? ` Unexpected paths: ${mutation.unexpectedPaths.map((path) => `\`${path}\``).join(", ")}.`
    : "";
  return `${mutation.failed} mutation-policy failure(s).${unexpected}`;
}

function escapePipe(value) {
  return String(value).replace(/\|/g, "\\|");
}

function basenameForReport(path) {
  return path.replace(/\/+$/, "").split(/[\\/]/).pop() || "unknown-run";
}

function printUsage() {
  console.log(`Usage: node scripts/harness-eval-report.mjs --run-root test-results/harness-evals/<run-id> [options]

Options:
  --run-root <path>         Harness run directory.
  --baseline <variant>      Baseline variant. Default: baseline.
  --min-improvement <n>     Required elapsed/tool-event improvement. Default: 0.1.
  --min-trials <n>          Minimum evaluated trials per candidate. Default: 1.
  --output-json <file>      JSON report file under run root.
  --output-md <file>        Markdown report file under run root.
`);
}

async function main() {
  const options = parseReportArgs();
  if (options.help) {
    printUsage();
    return;
  }
  const result = await runHarnessReport(options);
  console.log(JSON.stringify({ runRoot: result.runRoot, recommendedVariant: result.report.recommendedVariant, recommendation: result.report.recommendation }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
