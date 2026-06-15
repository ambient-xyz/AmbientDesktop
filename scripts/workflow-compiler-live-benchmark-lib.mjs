import { spawn } from "node:child_process";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 900_000;
const DEFAULT_RETRY_BASE_MS = 5_000;

const PROVIDER_DEGRADED_PATTERNS = [
  { id: "rate_limit", pattern: /\b429\b|rate limit/i, reason: "Ambient provider rate limited the request." },
  { id: "upstream", pattern: /upstream|GPU forwarding/i, reason: "Ambient provider reported an upstream failure." },
  {
    id: "stream_idle",
    pattern: /stream stalled|without stream activity|idle timeout|idle watchdog|did not start streaming|before assistant output/i,
    reason: "Ambient/Pi stream did not produce usable output within the idle window.",
  },
  {
    id: "pre_output_thinking",
    pattern: /thinking without emitting workflow JSON output|0 output chars/i,
    reason: "Ambient/Pi failed before returning usable compiler output.",
  },
  {
    id: "live_test_timeout",
    pattern: /(?:Test timed out in \d+ms[\s\S]*(?:live Ambient|real Google wrapper|provider-inclusive|Workflow Agent dogfood)|(?:live Ambient|real Google wrapper|provider-inclusive|Workflow Agent dogfood)[\s\S]*Test timed out in \d+ms)/i,
    reason: "A live provider-backed dogfood exceeded its test timeout before returning a product-level failure.",
  },
  {
    id: "provider_absolute_timeout",
    pattern: /Ambient\/Pi workflow request exceeded the \d+ms absolute timeout|elapsed_hard_limit/i,
    reason: "Ambient/Pi exceeded the bounded per-request live provider timeout before returning usable output.",
  },
  { id: "transient_http", pattern: /\b(?:408|409|425|500|502|503|504)\b|service unavailable|temporar(?:y|ily)|try again/i, reason: "Provider returned a transient service error." },
  { id: "network", pattern: /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|socket hang up|network.*timeout/i, reason: "Network transport failed before product validation could complete." },
];

const ENVIRONMENT_SKIPPED_PATTERNS = [
  {
    id: "missing_provider_key",
    pattern: /Set (?:AMBIENT_API_KEY|AMBIENT_AGENT_AMBIENT_API_KEY|AMBIENT_API_KEY_FILE|GMI_CLOUD_API_KEY|GMI_API_KEY|GMI_CLOUD_API_KEY_FILE)|(?:ambient_api_key|gmicloud-api-key)\.txt/i,
    reason: "Live Ambient-compatible provider credentials are unavailable.",
  },
  {
    id: "native_rebuild",
    pattern: /Rebuild Failed|node-gyp failed to rebuild|electron-rebuild|error opening '\.\/Release\/\.deps/i,
    reason: "Native dependency rebuild failed in the test harness environment.",
  },
  {
    id: "missing_google_auth",
    pattern:
      /(?:Set|Missing|No|unavailable|not configured|not authenticated|failed to resolve).*(?:Google|gws).*(?:credential|account|auth|login)|(?:Google|gws).*(?:credential|account|auth|login).*(?:missing|unavailable|not configured|not authenticated|not found)/i,
    reason: "Live Google Workspace credentials are unavailable.",
  },
  {
    id: "credentialed_snapshot_missing",
    pattern:
      /environment\/snapshot issue|Snapshot copy requested|credentialed snapshot|snapshot root did not contain userData\/workspace directories|selected snapshot root does not exist/i,
    reason: "The credentialed Ambient snapshot required for live workflow dogfood is unavailable.",
  },
];

const PRODUCT_FAILURE_PATTERNS = [
  {
    id: "provenance_gate",
    pattern: /generated source failed provenance gates|expected .* provenance|prompt assembly module .* forbidden fragment|compile context .* selected recipe/i,
    reason: "Workflow source or compile metadata failed a deterministic provenance gate.",
  },
  {
    id: "desktop_tool_timeout",
    pattern: /Desktop tool timed out after \d+ms: [a-z0-9_.-]+/i,
    reason: "A selected Desktop workflow tool timed out at the product runtime boundary.",
  },
  {
    id: "compile_repair_user_choice",
    pattern: /user-choice-required|WorkflowProgramIR repair path does not exist|repair response failed deterministic validation|compile workflow preview failed/i,
    reason: "Workflow compile or repair failed deterministic validation and requires a compiler/runtime fix or explicit user choice.",
  },
  {
    id: "evidence_assertion",
    pattern: /Scenario evidence assertions failed|expected final output to include|expected connector .* to run|expected desktop tool .* to run/i,
    reason: "Workflow run completed far enough for evidence inspection but failed the dogfood evidence contract.",
  },
];

export function defaultWorkflowCompilerLiveBenchmarkTasks() {
  return [
    {
      id: "pi-transport-tool-call",
      label: "Pi transport forced tool call",
      description: "Direct live Ambient/Pi transport smoke with one forced tool call and one tool result continuation.",
      command: "pnpm",
      args: ["exec", "vitest", "run", "src/main/workflowPiTransport.live.test.ts", "--reporter=dot"],
      env: { AMBIENT_WORKFLOW_PI_TRANSPORT_LIVE: "1" },
      timeoutMs: 180_000,
    },
    {
      id: "browser-qa-live-compile",
      label: "Browser QA live compile",
      description: "Compiles a local browser QA workflow through live Ambient/Pi and validates the IR artifact.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "compiles a browser QA workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 540_000,
    },
    {
      id: "graph-first-live-review",
      label: "Graph-first live review",
      description: "Compiles through live Ambient/Pi and validates graph-first review metadata.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "dogfoods graph-first review"],
      env: { AMBIENT_WORKFLOW_LIVE: "1" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 540_000,
    },
    {
      id: "scottsdale-live-compile",
      label: "Scottsdale live compile",
      description: "Compiles the canonical Scottsdale workflow through live Ambient/Pi.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "canonical Scottsdale weekend activities workflow"],
      env: { AMBIENT_WORKFLOW_LIVE: "1" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 540_000,
    },
    {
      id: "local-downloads-live-compile-run",
      label: "Local Downloads live compile/run",
      description: "Compiles and runs a local filesystem Downloads-classification workflow through live Ambient/Pi using a temp fixture.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "local Downloads classification workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "local-downloads-images-live-compile-run",
      label: "Local Downloads image live compile/run",
      description: "Compiles and runs a local Downloads image categorization workflow through live Ambient/Pi, verifying MiniCPM visual-tool routing with a fixture runner.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "local Downloads image categorization workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "document-render-pdf-live-compile",
      label: "Document render PDF live compile",
      description: "Compiles a workflow through live Ambient/Pi that uses document.render format pdf followed by staged file_write.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "document render PDF workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "browser-intervention-recovery-live",
      label: "Browser intervention recovery live run",
      description: "Runs the browser user-action pause/resume recovery flow with live Ambient/Pi runtime synthesis.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "browser user intervention pause and resume"],
      env: { AMBIENT_WORKFLOW_LIVE: "1" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "real-managed-browser-live",
      label: "Real managed-browser live run",
      description: "Runs the IR managed-browser intervention flow with live Ambient/Pi runtime synthesis.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "real managed-browser intervention and reveal"],
      env: { AMBIENT_WORKFLOW_LIVE: "1" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "external-managed-browser-live",
      label: "External managed-browser live run",
      description: "Runs the external managed-browser source workflow with live Ambient/Pi runtime synthesis.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "external-site managed-browser"],
      env: { AMBIENT_WORKFLOW_LIVE: "1" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "google-calendar-read-live",
      label: "Google Calendar read-only live run",
      description: "Runs a read-only Calendar workflow through the real Google wrapper.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "Calendar upcoming-events brief workflow through the real Google wrapper"],
      env: { AMBIENT_WORKFLOW_GWS_RUN_LIVE: "1", AMBIENT_WORKFLOW_GWS_PROVIDER_REQUEST_TIMEOUT_MS: "120000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "google-drive-read-live",
      label: "Google Drive read-only live run",
      description: "Runs a read-only Drive evidence workflow through the real Google wrapper.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "Drive file-evidence report workflow through the real Google wrapper"],
      env: { AMBIENT_WORKFLOW_GWS_RUN_LIVE: "1", AMBIENT_WORKFLOW_GMAIL_RUN_TIMEOUT_MS: "600000", AMBIENT_WORKFLOW_GWS_PROVIDER_REQUEST_TIMEOUT_MS: "120000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 660_000,
    },
    {
      id: "google-gmail-read-live",
      label: "Google Gmail read-only live run",
      description: "Compiles and runs a read-only Gmail last-100-emails categorization workflow through the real Google wrapper and Ambient model.call.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "Gmail last-100-emails categorization workflow through the real Google wrapper"],
      env: {
        AMBIENT_WORKFLOW_GMAIL_RUN_LIVE: "1",
        AMBIENT_WORKFLOW_GMAIL_RUN_TIMEOUT_MS: "900000",
        AMBIENT_WORKFLOW_GWS_PROVIDER_REQUEST_TIMEOUT_MS: "120000",
      },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 960_000,
    },
    {
      id: "gmail-300-pagination-live-compile",
      label: "Gmail 300 pagination live compile",
      description: "Compiles a read-only Gmail 300-message workflow through live Ambient/Pi and requires connector.paginate lowering.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "Gmail 300-message pagination workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "gmail-300-chunked-categorization-live-compile",
      label: "Gmail 300 chunked categorization live compile",
      description: "Compiles a read-only Gmail 300-message categorization workflow and requires pagination, connector fan-out, deterministic chunking, model.map, and model.reduce lowering.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "Gmail 300-message chunked categorization workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "gmail-1000-metadata-live-compile",
      label: "Gmail 1000 metadata-first live compile",
      description: "Compiles a read-only Gmail 1000-message categorization workflow that stays under the connector-call ceiling by using search metadata instead of same-run thread-detail fan-out.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "Gmail 1000-message metadata-first categorization workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "google-transcript-pagination-live-compile",
      label: "Google transcript pagination live compile",
      description: "Compiles a read-only Google Drive plus Calendar transcript-discovery workflow and requires descriptor-inferred connector.paginate lowering for both connectors.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "Google Drive and Calendar transcript pagination workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "google-transcript-action-items-live-compile",
      label: "Google transcript action-items live compile",
      description: "Compiles a read-only Google Drive plus Calendar workflow that paginates two weeks of meetings, reads bounded transcript files, routes long evidence through long_context_process, and shapes action items through Ambient.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "Google meeting transcript action-item extraction workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "tree-reduce-live-compile",
      label: "Tree model-reduce live compile",
      description: "Compiles a read-only large-collection workflow and requires model.reduce strategy tree with bounded fan-in and levels.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "tree model-reduce workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "browser-search-pagination-live-compile",
      label: "Browser search pagination/dedupe live compile",
      description: "Compiles a read-only browser_search source-collection workflow and requires tool.paginate query fan-out, collection.dedupe URL canonicalization, chunking, tree reduction, and PDF rendering.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "browser_search pagination collection workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "movie-night-current-data-live-compile",
      label: "Movie-night current-data live compile",
      description: "Compiles a read-only current movie recommendation workflow that requires dated browser_search evidence, URL dedupe, chunked option extraction, preference review, and tree reduction.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "movie-night current-data recommendation workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "scottsdale-100-source-pdf-live-compile",
      label: "Scottsdale 100-source PDF live compile",
      description: "Compiles the full Scottsdale real-estate challenge workflow at 100 source candidates with URL dedupe, chunked extraction, tree synthesis, PDF rendering, and staged Documents file output.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "Scottsdale 100-source PDF workflow with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
    {
      id: "long-context-routing-live-compile",
      label: "Long-field RLM routing live compile",
      description: "Compiles a read-only long-field connector workflow and requires long_context_process preprocessing before the final Ambient model.call.",
      command: "bash",
      args: ["scripts/test-node-native.sh", "src/main/workflowDogfood.test.ts", "-t", "long-field connector workflow through long_context_process with live Ambient"],
      env: { AMBIENT_WORKFLOW_LIVE: "1", AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS: "900000" },
      exclusiveGroup: "native-workflow-vitest",
      timeoutMs: 900_000,
    },
  ];
}

export function selectWorkflowCompilerLiveBenchmarkTasks(tasks, selectedIds = []) {
  const ids = selectedIds.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
  if (!ids.length) return tasks;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const selected = [];
  const missing = [];
  for (const id of ids) {
    const task = byId.get(id);
    if (task) selected.push(task);
    else missing.push(id);
  }
  if (missing.length) {
    throw new Error(`Unknown workflow compiler live benchmark task(s): ${missing.join(", ")}. Known tasks: ${tasks.map((task) => task.id).join(", ")}`);
  }
  return selected;
}

export function classifyWorkflowCompilerLiveBenchmarkAttempt(input) {
  const text = `${input.stdout ?? ""}\n${input.stderr ?? ""}\n${input.error ?? ""}`;
  if (input.exitCode === 0 && !input.timedOut) {
    return {
      status: "passed",
      providerHealth: "healthy",
      retryable: false,
      reason: "Command completed successfully.",
    };
  }
  for (const candidate of ENVIRONMENT_SKIPPED_PATTERNS) {
    if (candidate.pattern.test(text)) {
      return {
        status: "skipped",
        providerHealth: "unknown",
        retryable: false,
        reason: candidate.reason,
        matchedPattern: candidate.id,
      };
    }
  }
  for (const candidate of PROVIDER_DEGRADED_PATTERNS) {
    if (candidate.pattern.test(text)) {
      return {
        status: "provider_degraded",
        providerHealth: "degraded",
        retryable: candidate.id !== "live_test_timeout",
        reason: candidate.reason,
        matchedPattern: candidate.id,
      };
    }
  }
  for (const candidate of PRODUCT_FAILURE_PATTERNS) {
    if (candidate.pattern.test(text)) {
      return {
        status: "product_or_test_failure",
        providerHealth: "healthy",
        retryable: false,
        reason: candidate.reason,
        matchedPattern: candidate.id,
      };
    }
  }
  if (input.timedOut) {
    return {
      status: "product_or_test_failure",
      providerHealth: "unknown",
      retryable: false,
      reason: "The command timed out without a recognized provider-health signature.",
      matchedPattern: "command_timeout",
    };
  }
  return {
    status: "product_or_test_failure",
    providerHealth: "unknown",
    retryable: false,
    reason: "The command failed without a recognized provider-health or environment signature.",
  };
}

export async function runWorkflowCompilerLiveBenchmarks(input = {}) {
  const tasks = input.tasks ?? defaultWorkflowCompilerLiveBenchmarkTasks();
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const runId = input.runId ? safeFilePart(input.runId) : liveBenchmarkRunId({ generatedAt });
  const concurrency = clampConcurrency(input.concurrency ?? 1);
  const retries = Math.max(0, Math.floor(input.retries ?? 0));
  const startedAtMs = nowMs();
  const results = new Array(tasks.length);
  const pending = tasks.map((task, index) => ({ task, index }));
  const activeGroups = new Set();
  const waiters = [];
  let completed = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, tasks.length)) }, async () => {
      for (;;) {
        const item = takeRunnableTask(pending, activeGroups);
        if (!item) {
          if (completed >= tasks.length) return;
          await waitForTaskSlot(waiters);
          continue;
        }
        const group = item.task.exclusiveGroup;
        if (group) activeGroups.add(group);
        try {
          results[item.index] = await runWorkflowCompilerLiveBenchmarkTask(item.task, {
            ...input,
            retries,
            generatedAt,
            runId,
          });
        } finally {
          if (group) activeGroups.delete(group);
          completed += 1;
          notifyTaskSlot(waiters);
        }
      }
    }),
  );

  const taskResults = results.filter(Boolean);
  const summary = {
    schemaVersion: 1,
    runId,
    generatedAt,
    totalWallClockMs: roundMs(nowMs() - startedAtMs),
    concurrency,
    retryLimit: retries,
    taskCount: taskResults.length,
    passedCount: taskResults.filter((result) => result.status === "passed").length,
    providerDegradedCount: taskResults.filter((result) => result.status === "provider_degraded").length,
    skippedCount: taskResults.filter((result) => result.status === "skipped").length,
    productOrTestFailureCount: taskResults.filter((result) => result.status === "product_or_test_failure").length,
    tasks: taskResults,
  };
  const paths = input.outputDir ? await writeWorkflowCompilerLiveBenchmarkReport(summary, input.outputDir) : undefined;
  return { summary, paths };
}

function takeRunnableTask(pending, activeGroups) {
  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    const group = item.task.exclusiveGroup;
    if (group && activeGroups.has(group)) continue;
    pending.splice(index, 1);
    return item;
  }
  return undefined;
}

function waitForTaskSlot(waiters) {
  return new Promise((resolve) => waiters.push(resolve));
}

function notifyTaskSlot(waiters) {
  const queued = waiters.splice(0);
  for (const resolve of queued) resolve();
}

export async function writeWorkflowCompilerLiveBenchmarkReport(summary, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, "live-latest.json");
  const markdownPath = join(outputDir, "live-latest.md");
  const runId = liveBenchmarkRunId(summary);
  const runMarkdown = renderWorkflowCompilerLiveBenchmarkMarkdown(summary);
  const runJson = `${JSON.stringify(summary, null, 2)}\n`;
  const runPaths = await writeImmutableLiveBenchmarkReport(outputDir, runId, runJson, runMarkdown);
  const historyPath = join(outputDir, "live-history.jsonl");
  const logDirPath = join(outputDir, "live-logs", safeFilePart(summary.runId ?? runPaths.runId));
  await Promise.all([
    writeFile(jsonPath, runJson, "utf8"),
    writeFile(markdownPath, runMarkdown, "utf8"),
    appendFile(historyPath, `${JSON.stringify(liveBenchmarkHistoryEntry(summary, { ...runPaths, jsonPath, markdownPath, logDirPath }))}\n`, "utf8"),
  ]);
  return { jsonPath, markdownPath, historyPath, logDirPath, ...runPaths };
}

export function renderWorkflowCompilerLiveBenchmarkMarkdown(summary) {
  const lines = [
    "# Workflow Compiler Live Benchmark",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    `Tasks: ${summary.passedCount}/${summary.taskCount} passed`,
    `Provider-degraded/inconclusive: ${summary.providerDegradedCount}`,
    `Skipped/environment: ${summary.skippedCount}`,
    `Product or test failures: ${summary.productOrTestFailureCount}`,
    "",
    "| Task | Status | Provider health | Attempts | Total ms | Reason | Logs |",
    "| --- | --- | --- | ---: | ---: | --- | --- |",
    ...summary.tasks.map((task) =>
      `| ${[
        escapeMarkdownCell(task.label),
        task.status,
        task.providerHealth,
        String(task.attempts.length),
        formatMs(task.totalWallClockMs),
        escapeMarkdownCell(task.reason),
        task.attempts.map((attempt) => attempt.logPath).filter(Boolean).map((logPath) => `\`${logPath}\``).join("<br>"),
      ].join(" | ")} |`,
    ),
    "",
    "## Task Details",
    "",
  ];
  for (const task of summary.tasks) {
    lines.push(`### ${task.label}`, "", `- id: ${task.id}`, `- command: \`${[task.command, ...task.args].join(" ")}\``, `- status: ${task.status}`, `- provider health: ${task.providerHealth}`, `- reason: ${task.reason}`, "");
    for (const attempt of task.attempts) {
      lines.push(
        `- attempt ${attempt.attempt}: ${attempt.classification.status}; exit=${attempt.exitCode ?? "signal"}; duration=${formatMs(attempt.durationMs)} ms; stdout=${attempt.stdoutChars}; stderr=${attempt.stderrChars}${attempt.logPath ? `; log=\`${attempt.logPath}\`` : ""}`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function workflowCompilerLiveBenchmarkExitCode(summary, options = {}) {
  if (summary.productOrTestFailureCount > 0) return 1;
  if (options.requireLive && (summary.providerDegradedCount > 0 || summary.skippedCount > 0 || summary.passedCount < summary.taskCount)) return 1;
  return 0;
}

async function runWorkflowCompilerLiveBenchmarkTask(task, input) {
  const startedAtMs = nowMs();
  const attempts = [];
  const maxAttempts = (input.retries ?? 0) + 1;
  let finalClassification;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    input.log?.(`[live-benchmark] ${task.id} attempt ${attempt}/${maxAttempts} started`);
    const attemptResult = await runLiveCommandAttempt(task, { ...input, attempt });
    attempts.push(attemptResult);
    finalClassification = attemptResult.classification;
    input.log?.(`[live-benchmark] ${task.id} attempt ${attempt}/${maxAttempts} ${finalClassification.status}: ${finalClassification.reason}`);
    if (!finalClassification.retryable || attempt >= maxAttempts) break;
    await (input.sleep ?? sleep)(retryDelayMs(attempt, input.retryBaseMs));
  }
  const classification = finalClassification ?? {
    status: "product_or_test_failure",
    providerHealth: "unknown",
    retryable: false,
    reason: "No attempt result was recorded.",
  };
  return {
    id: task.id,
    label: task.label,
    description: task.description,
    command: task.command,
    args: task.args,
    status: classification.status,
    providerHealth: classification.providerHealth,
    reason: classification.reason,
    matchedPattern: classification.matchedPattern,
    totalWallClockMs: roundMs(nowMs() - startedAtMs),
    attempts,
  };
}

async function runLiveCommandAttempt(task, input) {
  const startedAtMs = nowMs();
  const runCommand = input.runCommand ?? runCommandCapture;
  const commandResult = await runCommand({
    command: task.command,
    args: task.args,
    cwd: input.cwd ?? process.cwd(),
    env: { ...process.env, ...(input.env ?? {}), ...(task.env ?? {}) },
    timeoutMs: task.timeoutMs ?? input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  const durationMs = roundMs(nowMs() - startedAtMs);
  const classification = classifyWorkflowCompilerLiveBenchmarkAttempt(commandResult);
  const logPath = input.outputDir
    ? await writeAttemptLog({
        outputDir: input.outputDir,
        runId: input.runId,
        task,
        attempt: input.attempt,
        commandResult,
        classification,
      })
    : undefined;
  return {
    attempt: input.attempt,
    exitCode: commandResult.exitCode,
    signal: commandResult.signal,
    timedOut: Boolean(commandResult.timedOut),
    durationMs,
    stdoutChars: commandResult.stdout?.length ?? 0,
    stderrChars: commandResult.stderr?.length ?? 0,
    classification,
    logPath,
  };
}

async function runCommandCapture(input) {
  return new Promise((resolve) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    timer.unref();
    child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        signal: undefined,
        timedOut,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        error: error instanceof Error ? error.message : String(error),
      });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        timedOut,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

async function writeAttemptLog(input) {
  const runId = safeFilePart(input.runId ?? "manual-run");
  const logDir = join(input.outputDir, "live-logs", runId);
  await mkdir(logDir, { recursive: true });
  const logPath = join(logDir, `${safeFilePart(input.task.id)}-attempt-${input.attempt}.log`);
  const commandLine = [input.task.command, ...input.task.args].join(" ");
  await writeFile(
    logPath,
    [
      `runId: ${runId}`,
      `task: ${input.task.id}`,
      `attempt: ${input.attempt}`,
      `command: ${commandLine}`,
      `status: ${input.classification.status}`,
      `providerHealth: ${input.classification.providerHealth}`,
      `reason: ${input.classification.reason}`,
      `exitCode: ${input.commandResult.exitCode ?? ""}`,
      `signal: ${input.commandResult.signal ?? ""}`,
      `timedOut: ${Boolean(input.commandResult.timedOut)}`,
      "",
      "----- stdout -----",
      input.commandResult.stdout ?? "",
      "",
      "----- stderr -----",
      input.commandResult.stderr ?? "",
      input.commandResult.error ? `\n----- error -----\n${input.commandResult.error}\n` : "",
    ].join("\n"),
    "utf8",
  );
  return logPath;
}

function retryDelayMs(attempt, retryBaseMs = DEFAULT_RETRY_BASE_MS) {
  return Math.min(60_000, Math.max(0, retryBaseMs) * 2 ** Math.max(0, attempt - 1));
}

function clampConcurrency(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(4, Math.max(1, numeric));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  return Math.max(0, Math.round(value * 100) / 100);
}

function formatMs(value) {
  return Number(value).toFixed(2);
}

async function writeImmutableLiveBenchmarkReport(outputDir, runId, json, markdown) {
  const runDir = join(outputDir, "live-runs");
  await mkdir(runDir, { recursive: true });
  for (let collision = 0; collision < 1_000; collision += 1) {
    const suffix = collision === 0 ? "" : `-${collision + 1}`;
    const candidateRunId = `${runId}${suffix}`;
    const runJsonPath = join(runDir, `${candidateRunId}.json`);
    const runMarkdownPath = join(runDir, `${candidateRunId}.md`);
    try {
      await writeFile(runJsonPath, json, { encoding: "utf8", flag: "wx" });
      try {
        await writeFile(runMarkdownPath, markdown, { encoding: "utf8", flag: "wx" });
      } catch (error) {
        await rm(runJsonPath, { force: true });
        if (error?.code === "EEXIST") continue;
        throw error;
      }
      return { runId: candidateRunId, runJsonPath, runMarkdownPath };
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error(`Unable to allocate a unique live benchmark report id for ${runId}`);
}

function liveBenchmarkHistoryEntry(summary, paths) {
  return {
    schemaVersion: 1,
    generatedAt: summary.generatedAt,
    runId: paths.runId,
    taskCount: summary.taskCount,
    passedCount: summary.passedCount,
    providerDegradedCount: summary.providerDegradedCount,
    skippedCount: summary.skippedCount,
    productOrTestFailureCount: summary.productOrTestFailureCount,
    retryLimit: summary.retryLimit,
    concurrency: summary.concurrency,
    totalWallClockMs: summary.totalWallClockMs,
    jsonPath: paths.runJsonPath,
    markdownPath: paths.runMarkdownPath,
    logDirPath: paths.logDirPath,
    latestJsonPath: paths.jsonPath,
    latestMarkdownPath: paths.markdownPath,
  };
}

function liveBenchmarkRunId(summary) {
  if (summary.runId) return safeFilePart(summary.runId);
  const generatedAt = summary.generatedAt ? String(summary.generatedAt) : new Date().toISOString();
  return safeFilePart(generatedAt.replace(/[:]/g, "-"));
}

function safeFilePart(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "task";
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
