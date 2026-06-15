#!/usr/bin/env node
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const TASK_CATALOG = {
  "live-smoke": {
    id: "live-smoke",
    label: "Live file smoke",
    split: "search",
    family: "core-loop",
    cost: "low",
    packageScript: "test:ambient-live",
    portEnv: "AMBIENT_LIVE_CDP_PORT",
    timeoutMs: 420_000,
    successText: "Live Ambient E2E smoke passed.",
    mutationPolicy: {
      requireTrace: true,
      allowedPathPatterns: ["ambient-live-smoke.txt"],
    },
    searchSplit: true,
  },
  "node-benchmark": {
    id: "node-benchmark",
    label: "Node coding benchmark",
    split: "search",
    family: "coding",
    cost: "medium",
    packageScript: "test:ambient-benchmark",
    portEnv: "AMBIENT_BENCHMARK_CDP_PORT",
    timeoutMs: 540_000,
    successText: "Live Ambient coding benchmark passed.",
    mutationPolicy: {
      requireTrace: true,
      allowedPathPatterns: ["README.md", "src/textStats.js", "test/textStats.test.js"],
    },
    searchSplit: true,
  },
  "long-context-qa": {
    id: "long-context-qa",
    label: "Long-context QA",
    split: "search",
    family: "context-routing",
    cost: "medium",
    packageScript: "test:ambient-rlm",
    portEnv: "AMBIENT_RLM_CDP_PORT",
    timeoutMs: 420_000,
    successText: "Live Ambient Lambda-RLM E2E passed.",
    mutationPolicy: {
      requireTrace: true,
      allowedPathPatterns: [],
    },
    searchSplit: true,
  },
  "plugin-arxiv": {
    id: "plugin-arxiv",
    label: "Plugin arXiv install/uninstall lane",
    split: "search",
    family: "capability-onboarding",
    cost: "high",
    packageScript: "test:e2e:plugins:chat-refresh:live:arxiv",
    portEnv: "AMBIENT_PLUGIN_CHAT_REFRESH_CDP_PORT",
    timeoutMs: 720_000,
    successText: "Live plugin chat refresh smoke passed.",
    mutationPolicy: {
      requireTrace: true,
      allowedPathPatterns: [],
    },
    searchSplit: true,
  },
  "app-build-html-calculator": {
    id: "app-build-html-calculator",
    label: "HTML app build benchmark",
    split: "search",
    family: "app-build",
    cost: "high",
    packageScript: "test:ambient-app-builds",
    portEnv: "AMBIENT_APP_BUILDS_CDP_PORT",
    timeoutMs: 720_000,
    successText: "Live Ambient app-build benchmark passed.",
    env: {
      AMBIENT_APP_BUILDS_SCENARIOS: "html-calculator",
    },
    mutationPolicy: {
      requireTrace: true,
      allowedPathPatterns: ["package.json", "index.html", "src/**", "test/**", "style.css", "styles.css", "script.js", "app.js", "main.js"],
    },
    searchSplit: true,
  },
  "workflow-graph-review": {
    id: "workflow-graph-review",
    label: "Workflow graph review dogfood",
    split: "holdout",
    family: "workflow",
    cost: "high",
    packageScript: "test:workflow-graph-review:live",
    timeoutMs: 720_000,
    mutationPolicy: {
      requireTrace: true,
      allowedPathPatterns: [],
    },
    holdoutSplit: true,
  },
  "project-board-dogfood": {
    id: "project-board-dogfood",
    label: "Project-board in-app dogfood",
    split: "late-holdout",
    family: "project-board",
    cost: "very-high",
    packageScript: "test:project-board-dogfood:live",
    portEnv: "AMBIENT_PROJECT_BOARD_DOGFOOD_CDP_PORT",
    timeoutMs: 1_800_000,
    summaryStatus: "passed",
    mutationPolicy: {
      requireTrace: true,
      ignoredPathPatterns: ["project-root/.ambient-codex/**", "task-workspace/.ambient-codex/**"],
      allowedPathPatterns: [
        "task-workspace/src/runtime-split-progress.ts",
        "task-workspace/test/runtime-split-progress.test.ts",
        "task-workspace/docs/runtime-split-notes.md",
      ],
    },
    holdoutSplit: true,
  },
};

export const VARIANT_IDS = ["baseline", "bootstrap-min", "bootstrap-scripts", "bootstrap-tools", "bootstrap-full"];
export const TASK_PROFILES = {
  quick: ["live-smoke"],
  search: taskIdsForSplit("search"),
  holdout: taskIdsForSplit("holdout"),
  "late-holdout": taskIdsForSplit("late-holdout"),
  full: [...taskIdsForSplit("search"), ...taskIdsForSplit("holdout"), ...taskIdsForSplit("late-holdout")],
};

const DEFAULT_TASKS = ["live-smoke", "node-benchmark"];
const DEFAULT_VARIANTS = ["baseline", "bootstrap-scripts"];
const DEFAULT_OUTPUT_DIR = "test-results/harness-evals";
const DEFAULT_BASE_PORT = 9600;
const DEFAULT_MUTATION_IGNORED_PATH_PATTERNS = [
  ".ambient/cli-packages/imported/pi-arxiv-*",
  ".ambient/cli-packages/imported/youtube-transcript-*",
  ".ambient/cli-packages/packages.json",
  ".ambient/tool-outputs/**",
];

export function parseHarnessEvalArgs(argv = process.argv.slice(2), env = process.env, now = () => new Date()) {
  const options = {
    tasks: taskListFromEnv(env.AMBIENT_HARNESS_TASKS, env.AMBIENT_HARNESS_TASK_PROFILE, DEFAULT_TASKS),
    variants: listFromValue(env.AMBIENT_HARNESS_VARIANTS, DEFAULT_VARIANTS),
    trials: positiveInteger(env.AMBIENT_HARNESS_TRIALS, 1, "AMBIENT_HARNESS_TRIALS"),
    outputDir: env.AMBIENT_HARNESS_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    runId: env.AMBIENT_HARNESS_RUN_ID || buildRunId(now()),
    basePort: positiveInteger(env.AMBIENT_HARNESS_BASE_PORT, DEFAULT_BASE_PORT, "AMBIENT_HARNESS_BASE_PORT"),
    dryRun: false,
    resume: false,
    failFast: false,
    list: false,
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

    if (flag === "--tasks") options.tasks = expandTaskSelectors(listFromValue(readValue(), []));
    else if (flag === "--profile" || flag === "--task-profile") options.tasks = tasksForProfile(readValue());
    else if (flag === "--variants") options.variants = listFromValue(readValue(), []);
    else if (flag === "--trials") options.trials = positiveInteger(readValue(), 1, "--trials");
    else if (flag === "--output-dir") options.outputDir = readValue();
    else if (flag === "--run-id") options.runId = readValue();
    else if (flag === "--base-port") options.basePort = positiveInteger(readValue(), DEFAULT_BASE_PORT, "--base-port");
    else if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--resume") options.resume = true;
    else if (flag === "--fail-fast") options.failFast = true;
    else if (flag === "--list") options.list = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`Unknown harness-eval option: ${raw}`);
  }

  validateOptions(options);
  return options;
}

export async function runHarnessEval(options, deps = {}) {
  const cwd = deps.cwd ?? options.cwd ?? process.cwd();
  const now = deps.now ?? (() => new Date());
  const spawnImpl = deps.spawn ?? spawn;
  const runRoot = resolve(cwd, options.outputDir, options.runId);
  const startedAt = now().toISOString();
  const config = {
    version: 1,
    runId: options.runId,
    createdAt: startedAt,
    cwd,
    dryRun: options.dryRun,
    tasks: options.tasks,
    variants: options.variants,
    trials: options.trials,
    basePort: options.basePort,
    resume: options.resume,
    outputLayout: "test-results/harness-evals/<run-id>",
  };

  await mkdir(runRoot, { recursive: true });
  await writeJson(join(runRoot, "config.json"), config);
  await Promise.all(
    options.variants.map(async (variant) => {
      await mkdir(join(runRoot, "variants", variant), { recursive: true });
      await writeJson(join(runRoot, "variants", variant, "variant.json"), {
        id: variant,
        enabledHooks: variant === "baseline" ? [] : ["chat_first_turn_bootstrap"],
      });
    }),
  );

  if (options.dryRun) {
    const planned = plannedTrialRows({ ...options, runRoot });
    const frontier = buildFrontier(planned);
    await writeResultRows(join(runRoot, "results.jsonl"), planned);
    await writeJson(join(runRoot, "frontier.json"), frontier);
    const resume = { enabled: false, expected: planned.length, existing: 0, skipped: 0, executed: 0 };
    await writeSummaryMarkdown(join(runRoot, "summary.md"), { config, frontier, results: planned, dryRun: true, resume });
    return { runRoot, config, results: planned, frontier, resume };
  }

  const resultsPath = join(runRoot, "results.jsonl");
  const planned = plannedTrialRows({ ...options, runRoot });
  const existingRows = options.resume ? await readResultRows(resultsPath) : [];
  const existingByKey = completedRowsByKey(existingRows);
  const results = [];
  let executed = 0;
  let skipped = 0;
  if (!options.resume) await writeResultRows(resultsPath, []);

  for (const [index, plannedRow] of planned.entries()) {
    const existing = existingByKey.get(trialKey(plannedRow));
    if (existing) {
      skipped += 1;
      results.push(existing);
      continue;
    }

    const result = await runTrial({
      cwd,
      runRoot,
      runId: options.runId,
      variant: plannedRow.variant,
      task: TASK_CATALOG[plannedRow.taskId],
      trial: plannedRow.trial,
      ordinal: index + 1,
      basePort: options.basePort,
      now,
      spawnImpl,
    });
    results.push(result);
    executed += 1;
    await appendFile(resultsPath, `${JSON.stringify(result)}\n`, "utf8");
    if (options.failFast && !result.deterministic.passed) {
      const frontier = buildFrontier(results);
      await writeJson(join(runRoot, "frontier.json"), frontier);
      const resume = { enabled: options.resume, expected: planned.length, existing: existingByKey.size, skipped, executed };
      await writeResultRows(resultsPath, results);
      await writeSummaryMarkdown(join(runRoot, "summary.md"), { config, frontier, results, dryRun: false, resume });
      throw new Error(`Harness trial failed and --fail-fast is enabled: ${plannedRow.variant}/${plannedRow.taskId}/trial-${plannedRow.trial}`);
    }
  }

  const frontier = buildFrontier(results);
  const resume = { enabled: options.resume, expected: planned.length, existing: existingByKey.size, skipped, executed };
  await writeResultRows(resultsPath, results);
  await writeJson(join(runRoot, "frontier.json"), frontier);
  await writeSummaryMarkdown(join(runRoot, "summary.md"), { config, frontier, results, dryRun: false, resume });
  return { runRoot, config, results, frontier, resume };
}

export async function runTrial({ cwd, runRoot, runId, variant, task, trial, ordinal, basePort, now, spawnImpl }) {
  const traceDir = join(runRoot, "traces", variant, task.id, `trial-${trial}`);
  await rm(traceDir, { recursive: true, force: true });
  await mkdir(traceDir, { recursive: true });

  const port = basePort + ordinal;
  const envOverrides = {
    AMBIENT_HARNESS_VARIANT: variant,
    AMBIENT_HARNESS_RUN_ID: runId,
    AMBIENT_HARNESS_TASK_ID: task.id,
    AMBIENT_HARNESS_TRIAL: String(trial),
    AMBIENT_HARNESS_TRACE_DIR: traceDir,
    ...(task.env ?? {}),
    ...(task.portEnv ? { [task.portEnv]: String(port) } : {}),
  };
  const startedAt = now().toISOString();
  const command = "pnpm";
  const args = ["run", task.packageScript];
  const resultPath = join(traceDir, "result.json");
  const stdoutPath = join(traceDir, "stdout.log");
  const stderrPath = join(traceDir, "stderr.log");
  const redactor = createArtifactRedactor(process.env);

  await writeJson(join(traceDir, "trial.json"), {
    version: 1,
    startedAt,
    variant,
    taskId: task.id,
    trial,
    command,
    args,
    envOverrides,
    timeoutMs: task.timeoutMs,
    mutationPolicy: task.mutationPolicy,
    artifactProtocol: {
      traceDir,
      files: ["messages.jsonl", "events.jsonl", "tool-transcript.txt", "changed-files.json", "trace-preview.json"],
    },
  });

  const childResult = await runChildProcess({
    command,
    args,
    cwd,
    env: { ...process.env, ...envOverrides },
    timeoutMs: task.timeoutMs,
    spawnImpl,
    redactor,
    stdoutPath,
    stderrPath,
  });
  const completedAt = now().toISOString();
  const elapsedMs = childResult.elapsedMs;
  const parsedSummary = extractLastJsonObject(childResult.stdout);
  const changedFiles = await readOptionalJson(join(traceDir, "changed-files.json"));
  const mutation = evaluateMutationPolicy(task.mutationPolicy, changedFiles);
  const deterministic = scoreTaskResult(task, childResult, parsedSummary, mutation);
  const row = {
    version: 1,
    runId,
    variant,
    taskId: task.id,
    trial,
    status: childResult.timedOut ? "timeout" : childResult.exitCode === 0 ? "succeeded" : "failed",
    startedAt,
    completedAt,
    elapsedMs,
    exitCode: childResult.exitCode,
    signal: childResult.signal,
    timedOut: childResult.timedOut,
    artifactDir: traceDir,
    command: `${command} ${args.join(" ")}`,
    envOverrides,
    metrics: {
      ...metricsFromSummary(parsedSummary),
      mutation: mutationMetrics(mutation),
    },
    deterministic,
    artifacts: undefined,
  };

  if (parsedSummary) await writeJson(join(traceDir, "summary.json"), parsedSummary);
  await writeJson(join(traceDir, "deterministic-score.json"), deterministic);
  await writeJson(resultPath, row);
  const artifactIndex = await buildTrialArtifactIndex(traceDir, runRoot);
  await writeJson(join(traceDir, "artifact-index.json"), artifactIndex);
  row.artifacts = artifactIndex.files;
  await writeJson(resultPath, row);
  return row;
}

export async function buildTrialArtifactIndex(traceDir, runRoot = dirname(traceDir)) {
  const files = [];
  for (const name of await readdir(traceDir).catch(() => [])) {
    const path = join(traceDir, name);
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile()) continue;
    files.push({
      path: name,
      relativePath: runRoot ? relative(resolve(runRoot), path) : name,
      bytes: info.size,
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    traceDir,
    files,
  };
}

export function scoreTaskResult(task, childResult, summary, mutation) {
  const evidence = [];
  if (childResult.exitCode === 0) evidence.push("child process exited with code 0");
  else evidence.push(`child process exited with code ${childResult.exitCode}`);
  if (childResult.timedOut) evidence.push(`harness timeout after ${childResult.elapsedMs}ms`);
  if (task.successText && childResult.stdout.includes(task.successText)) evidence.push(`stdout contained ${task.successText}`);
  if (task.summaryStatus && summary?.status === task.summaryStatus) evidence.push(`summary.status matched ${task.summaryStatus}`);
  else if (task.summaryStatus) evidence.push(`summary.status did not match ${task.summaryStatus}`);
  if (summary) evidence.push("parsed script JSON summary");
  else evidence.push("no script JSON summary parsed");
  if (mutation?.evaluated) {
    evidence.push(`mutation policy checked ${mutation.changedCount} changed path(s): ${mutation.allowedCount} allowed, ${mutation.ignoredCount} ignored, ${mutation.unexpectedPaths.length} unexpected`);
    if (mutation.unexpectedPaths.length) evidence.push(`unexpected changed paths: ${mutation.unexpectedPaths.slice(0, 8).join(", ")}`);
  } else if (mutation?.missingTrace) {
    evidence.push("mutation policy could not run because changed-files.json was missing");
  }

  const passed =
    childResult.exitCode === 0 &&
    !childResult.timedOut &&
    (!task.successText || childResult.stdout.includes(task.successText)) &&
    (!task.summaryStatus || summary?.status === task.summaryStatus) &&
    (!mutation?.blocking || mutation.passed);
  return {
    passed,
    failureCategory: passed
      ? null
      : childResult.timedOut
        ? "timeout"
        : mutation?.blocking && mutation.missingTrace
          ? "mutation-trace-missing"
          : mutation?.blocking && !mutation.passed
            ? "unexpected-mutation"
        : task.summaryStatus && summary?.status !== task.summaryStatus
          ? "summary-status-mismatch"
          : childResult.exitCode === 0
            ? "missing-success-marker"
            : "script-failed",
    evidence,
    mutation,
  };
}

export function evaluateMutationPolicy(policy, changedFiles) {
  if (!policy) return undefined;
  const blocking = policy.blocking !== false;
  if (!changedFiles || typeof changedFiles !== "object" || !Array.isArray(changedFiles.changes)) {
    return {
      evaluated: false,
      missingTrace: true,
      blocking: Boolean(policy.requireTrace && blocking),
      passed: !policy.requireTrace,
      changedCount: 0,
      allowedCount: 0,
      ignoredCount: 0,
      unexpectedPaths: [],
      allowedPaths: [],
      ignoredPaths: [],
    };
  }

  const allowedPatterns = policy.allowedPathPatterns ?? [];
  const ignoredPatterns = [...DEFAULT_MUTATION_IGNORED_PATH_PATTERNS, ...(policy.ignoredPathPatterns ?? [])];
  const changedPaths = changedFiles.changes
    .map((change) => (change && typeof change.path === "string" ? change.path : undefined))
    .filter(Boolean)
    .sort();
  const allowedPaths = [];
  const ignoredPaths = [];
  const unexpectedPaths = [];
  for (const path of changedPaths) {
    if (matchesAnyPathPattern(path, ignoredPatterns)) ignoredPaths.push(path);
    else if (matchesAnyPathPattern(path, allowedPatterns)) allowedPaths.push(path);
    else unexpectedPaths.push(path);
  }

  return {
    evaluated: true,
    missingTrace: false,
    blocking,
    passed: unexpectedPaths.length === 0,
    changedCount: changedPaths.length,
    allowedCount: allowedPaths.length,
    ignoredCount: ignoredPaths.length,
    unexpectedPaths,
    allowedPaths,
    ignoredPaths,
  };
}

function mutationMetrics(mutation) {
  if (!mutation) return undefined;
  return {
    evaluated: mutation.evaluated,
    passed: mutation.passed,
    changedCount: mutation.changedCount,
    allowedCount: mutation.allowedCount,
    ignoredCount: mutation.ignoredCount,
    unexpectedCount: mutation.unexpectedPaths.length,
  };
}

export function metricsFromSummary(summary) {
  if (!summary || typeof summary !== "object") return {};
  return {
    model: stringOrUndefined(summary.model),
    messageDeltaCount: numberOrUndefined(summary.messageDeltaCount),
    toolEventCount: numberOrUndefined(summary.toolEventCount),
    toolMessageCount: numberOrUndefined(summary.toolMessageCount),
    expectedFileBytes: numberOrUndefined(summary.expectedFileBytes),
    status: stringOrUndefined(summary.status),
    passed: numberOrUndefined(summary.passed),
    failed: numberOrUndefined(summary.failed),
    total: numberOrUndefined(summary.total),
    pluginCatalogUpdatedCount: numberOrUndefined(summary.pluginCatalogUpdatedCount),
    privilegedScanUpdatedCount: numberOrUndefined(summary.privilegedScanUpdatedCount),
    createdFiles: Array.isArray(summary.createdFiles) ? summary.createdFiles.filter((value) => typeof value === "string") : undefined,
    scenarios: Array.isArray(summary.scenarios) ? [...new Set(summary.scenarios.filter((value) => typeof value === "string"))] : undefined,
    toolNames: Array.isArray(summary.toolNames) ? [...new Set(summary.toolNames.filter((value) => typeof value === "string"))] : undefined,
  };
}

export function extractLastJsonObject(text) {
  let last;
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    const end = matchingObjectEnd(text, start);
    if (end === -1) continue;
    try {
      last = JSON.parse(text.slice(start, end + 1));
      start = end;
    } catch {
      // Continue scanning after non-JSON braces in logs.
    }
  }
  return last;
}

export function buildFrontier(results) {
  const byVariant = new Map();
  for (const result of results) {
    const entry = byVariant.get(result.variant) ?? {
      variant: result.variant,
      trialCount: 0,
      evaluated: 0,
      planned: 0,
      passed: 0,
      failed: 0,
      passRate: null,
      medianElapsedMs: undefined,
      medianToolEventCount: undefined,
      tasks: {},
    };
    entry.trialCount += 1;
    if (result.status === "planned") entry.planned += 1;
    else {
      entry.evaluated += 1;
      if (result.deterministic?.passed) entry.passed += 1;
      else entry.failed += 1;
    }
    const task = entry.tasks[result.taskId] ?? { trialCount: 0, evaluated: 0, planned: 0, passed: 0, failed: 0, elapsedMs: [], toolEventCounts: [] };
    task.trialCount += 1;
    if (result.status === "planned") task.planned += 1;
    else {
      task.evaluated += 1;
      if (result.deterministic?.passed) task.passed += 1;
      else task.failed += 1;
    }
    if (typeof result.elapsedMs === "number") task.elapsedMs.push(result.elapsedMs);
    if (typeof result.metrics?.toolEventCount === "number") task.toolEventCounts.push(result.metrics.toolEventCount);
    entry.tasks[result.taskId] = task;
    byVariant.set(result.variant, entry);
  }

  const variants = [...byVariant.values()].map((entry) => {
    const elapsed = [];
    const toolEvents = [];
    const tasks = Object.fromEntries(
      Object.entries(entry.tasks).map(([taskId, task]) => {
        elapsed.push(...task.elapsedMs);
        toolEvents.push(...task.toolEventCounts);
        return [
          taskId,
          {
            trialCount: task.trialCount,
            evaluated: task.evaluated,
            planned: task.planned,
            passed: task.passed,
            failed: task.failed,
            passRate: task.evaluated ? task.passed / task.evaluated : null,
            medianElapsedMs: median(task.elapsedMs),
            medianToolEventCount: median(task.toolEventCounts),
          },
        ];
      }),
    );
    return {
      variant: entry.variant,
      trialCount: entry.trialCount,
      evaluated: entry.evaluated,
      planned: entry.planned,
      passed: entry.passed,
      failed: entry.failed,
      passRate: entry.evaluated ? entry.passed / entry.evaluated : null,
      medianElapsedMs: median(elapsed),
      medianToolEventCount: median(toolEvents),
      tasks,
    };
  });

  variants.sort((left, right) => {
    if (left.passRate === null && right.passRate !== null) return 1;
    if (left.passRate !== null && right.passRate === null) return -1;
    if (left.passRate === null && right.passRate === null) return left.variant.localeCompare(right.variant);
    if (right.passRate !== left.passRate) return right.passRate - left.passRate;
    if ((left.medianElapsedMs ?? Infinity) !== (right.medianElapsedMs ?? Infinity)) {
      return (left.medianElapsedMs ?? Infinity) - (right.medianElapsedMs ?? Infinity);
    }
    return left.variant.localeCompare(right.variant);
  });

  return {
    version: 1,
    variantCount: variants.length,
    trialCount: results.length,
    recommendedVariant: variants[0]?.variant,
    variants,
  };
}

export function createArtifactRedactor(env = process.env) {
  const secretValues = [env.AMBIENT_API_KEY, env.AMBIENT_AGENT_AMBIENT_API_KEY]
    .filter((value) => typeof value === "string" && value.length >= 8)
    .sort((left, right) => right.length - left.length);
  return (text) => redactArtifactText(text, secretValues);
}

export function redactArtifactText(text, secretValues = []) {
  let next = String(text);
  for (const value of secretValues) next = next.split(value).join("[redacted secret]");
  next = next.replace(/([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*=)([^\s"';&]+)/gi, "$1[redacted]");
  next = next.replace(/(Authorization:\s*Bearer\s+)([A-Za-z0-9._~+/-]+)/gi, "$1[redacted]");
  return next;
}

function plannedTrialRows(options) {
  const rows = [];
  let ordinal = 0;
  for (const variant of options.variants) {
    for (const taskId of options.tasks) {
      for (let trial = 1; trial <= options.trials; trial += 1) {
        ordinal += 1;
        const task = TASK_CATALOG[taskId];
        const traceDir = join(options.runRoot, "traces", variant, taskId, `trial-${trial}`);
        rows.push({
          version: 1,
          runId: options.runId,
          variant,
          taskId,
          trial,
          status: "planned",
          elapsedMs: undefined,
          artifactDir: traceDir,
          command: `pnpm run ${task.packageScript}`,
          envOverrides: {
            AMBIENT_HARNESS_VARIANT: variant,
            AMBIENT_HARNESS_RUN_ID: options.runId,
            AMBIENT_HARNESS_TASK_ID: taskId,
            AMBIENT_HARNESS_TRIAL: String(trial),
            AMBIENT_HARNESS_TRACE_DIR: traceDir,
            ...(task.env ?? {}),
            ...(task.portEnv ? { [task.portEnv]: String(options.basePort + ordinal) } : {}),
          },
          metrics: {},
          deterministic: { passed: false, failureCategory: "dry-run", evidence: ["dry run only"] },
        });
      }
    }
  }
  return rows;
}

async function runChildProcess({ command, args, cwd, env, timeoutMs, spawnImpl, redactor, stdoutPath, stderrPath }) {
  const started = Date.now();
  const child = spawnImpl(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    terminateProcessTree(child);
  }, timeoutMs);

  child.stdout?.on("data", (chunk) => {
    const text = redactor(chunk.toString("utf8"));
    stdout += text;
    appendFile(stdoutPath, text, "utf8").catch(() => undefined);
  });
  child.stderr?.on("data", (chunk) => {
    const text = redactor(chunk.toString("utf8"));
    stderr += text;
    appendFile(stderrPath, text, "utf8").catch(() => undefined);
  });

  const close = await new Promise((resolve) => {
    child.on("error", (error) => {
      stderr += redactor(String(error));
      resolve({ exitCode: 1, signal: null });
    });
    child.on("close", (exitCode, signal) => resolve({ exitCode: exitCode ?? 1, signal }));
  });
  clearTimeout(timeout);
  await Promise.all([writeFile(stdoutPath, stdout, "utf8"), writeFile(stderrPath, stderr, "utf8")]);
  return {
    ...close,
    timedOut,
    elapsedMs: Date.now() - started,
    stdout,
    stderr,
  };
}

async function terminateProcessTree(proc) {
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return;
  try {
    if (process.platform === "win32") proc.kill("SIGTERM");
    else process.kill(-proc.pid, "SIGTERM");
  } catch {
    try {
      proc.kill("SIGTERM");
    } catch {
      // Process already exited.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  try {
    if (process.platform === "win32") proc.kill("SIGKILL");
    else process.kill(-proc.pid, "SIGKILL");
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch {
      // Process already exited.
    }
  }
}

async function writeSummaryMarkdown(path, { config, frontier, results, dryRun, resume }) {
  const lines = [
    "# Meta-Harness Eval Summary",
    "",
    `Run ID: \`${config.runId}\``,
    `Created: \`${config.createdAt}\``,
    `Mode: ${dryRun ? "dry run" : "live run"}`,
    resume?.enabled ? `Resume: skipped ${resume.skipped}/${resume.expected} completed trial(s), executed ${resume.executed}.` : undefined,
    "",
    "| Variant | Trials | Pass Rate | Median Elapsed | Median Tool Events |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...frontier.variants.map((variant) =>
      `| \`${variant.variant}\` | ${variant.trialCount} | ${percent(variant.passRate)} | ${ms(variant.medianElapsedMs)} | ${variant.medianToolEventCount ?? "n/a"} |`,
    ),
    "",
    "## Trials",
    "",
    "| Variant | Task | Trial | Status | Passed | Artifact |",
    "| --- | --- | ---: | --- | --- | --- |",
    ...results.map((result) =>
      `| \`${result.variant}\` | \`${result.taskId}\` | ${result.trial} | ${result.status} | ${result.deterministic?.passed ? "yes" : "no"} | \`${result.artifactDir}\` |`,
    ),
    "",
  ].filter((line) => line !== undefined);
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

async function readResultRows(path) {
  try {
    const text = await readFile(path, "utf8");
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeResultRows(path, rows) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

function completedRowsByKey(rows) {
  const completed = new Map();
  for (const row of rows) {
    if (!row || row.status === "planned") continue;
    const key = trialKey(row);
    if (key) completed.set(key, row);
  }
  return completed;
}

function trialKey(row) {
  if (!row?.variant || !row?.taskId || !row?.trial) return undefined;
  return `${row.variant}\0${row.taskId}\0${row.trial}`;
}

function matchingObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function validateOptions(options) {
  if (!options.tasks.length) throw new Error("At least one task is required.");
  if (!options.variants.length) throw new Error("At least one variant is required.");
  for (const task of options.tasks) {
    if (!TASK_CATALOG[task]) throw new Error(`Unknown harness task "${task}". Valid tasks: ${Object.keys(TASK_CATALOG).join(", ")}`);
  }
  for (const variant of options.variants) {
    if (!VARIANT_IDS.includes(variant)) throw new Error(`Unknown harness variant "${variant}". Valid variants: ${VARIANT_IDS.join(", ")}`);
  }
}

export function expandTaskSelectors(selectors) {
  const expanded = [];
  for (const selector of selectors) {
    if (TASK_CATALOG[selector]) expanded.push(selector);
    else if (TASK_PROFILES[selector]) expanded.push(...TASK_PROFILES[selector]);
    else throw new Error(`Unknown harness task or profile "${selector}". Valid tasks: ${Object.keys(TASK_CATALOG).join(", ")}. Valid profiles: ${Object.keys(TASK_PROFILES).join(", ")}`);
  }
  return [...new Set(expanded)];
}

export function tasksForProfile(profile) {
  const tasks = TASK_PROFILES[profile];
  if (!tasks) throw new Error(`Unknown harness task profile "${profile}". Valid profiles: ${Object.keys(TASK_PROFILES).join(", ")}`);
  return [...tasks];
}

function taskListFromEnv(taskValue, profileValue, fallback) {
  if (profileValue) return tasksForProfile(profileValue);
  return expandTaskSelectors(listFromValue(taskValue, fallback));
}

function taskIdsForSplit(split) {
  return Object.values(TASK_CATALOG)
    .filter((task) => task.split === split)
    .map((task) => task.id);
}

function matchesAnyPathPattern(path, patterns) {
  return patterns.some((pattern) => matchesPathPattern(path, pattern));
}

function matchesPathPattern(path, pattern) {
  if (!pattern) return false;
  if (pattern.startsWith("re:")) return new RegExp(pattern.slice(3)).test(path);
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (!pattern.includes("*")) return path === pattern;
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(path);
}

function listFromValue(value, fallback) {
  if (!value) return [...fallback];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function positiveInteger(value, fallback, label) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function buildRunId(date) {
  return `meta-harness-${date.toISOString().replace(/[:.]/g, "-")}`;
}

function stringOrUndefined(value) {
  return typeof value === "string" ? value : undefined;
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function median(values) {
  const sorted = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return undefined;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function percent(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a";
}

function ms(value) {
  return typeof value === "number" ? `${Math.round(value)}ms` : "n/a";
}

function printUsage() {
  console.log(`Usage: node scripts/harness-eval.mjs [options]

Options:
  --tasks live-smoke,node-benchmark,long-context-qa
  --profile quick|search|holdout|late-holdout|full
  --variants baseline,bootstrap-min,bootstrap-scripts,bootstrap-tools,bootstrap-full
  --trials 1
  --output-dir test-results/harness-evals
  --run-id meta-harness-manual
  --base-port 9600
  --dry-run
  --resume
  --fail-fast
  --list
`);
}

function printList() {
  console.log(JSON.stringify({ tasks: TASK_CATALOG, taskProfiles: TASK_PROFILES, variants: VARIANT_IDS }, null, 2));
}

async function main() {
  const options = parseHarnessEvalArgs();
  if (options.help) {
    printUsage();
    return;
  }
  if (options.list) {
    printList();
    return;
  }
  const result = await runHarnessEval(options);
  console.log(JSON.stringify({ runRoot: result.runRoot, frontier: result.frontier, resume: result.resume }, null, 2));
  if (result.results.some((row) => !row.deterministic?.passed) && !options.dryRun) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
