import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputPath = resolve(repoRoot, "test-results", "subagent-replay-diagnostics", "latest.json");
const replayTestFiles = [
  "src/test/subagentFixtures.test.ts",
  "src/main/subagentRepair.test.ts",
  "src/main/subagentLifecycleEdgeEvidence.test.ts",
];
const requiredReplayTestNames = [
  "subagent test fixtures builds deterministic restart replay state with bounded transcripts and runtime events",
  "subagent test fixtures builds a compact deterministic replay evidence timeline",
  "subagentRepair replays the shared restart repair fixture without live Pi tokens",
  "subagent lifecycle edge evidence builds lifecycle edge evidence for restart, stop, detach, cancel, retry, timeout, and partial results",
];
const requiredLifecycleEdgeKinds = ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"];
const maxPreviewChars = 2_000;

export function buildSubagentReplayDiagnosticsPlan(input = {}) {
  const outputPath = input.outputPath === false ? defaultOutputPath : input.outputPath ?? defaultOutputPath;
  const outputDir = dirname(outputPath);
  const vitestOutputPath = input.vitestOutputPath ?? resolve(outputDir, "latest-vitest.json");
  const fixtureEvidencePath = input.fixtureEvidencePath ?? resolve(outputDir, "latest-fixture-evidence.json");
  const lifecycleEdgeEvidencePath = input.lifecycleEdgeEvidencePath ?? resolve(outputDir, "latest-lifecycle-edge-evidence.json");
  const command = input.command ?? pnpmCommand();
  const args = input.args ?? [
    "exec",
    "vitest",
    "run",
    ...replayTestFiles,
    "--reporter=json",
    `--outputFile=${vitestOutputPath}`,
  ];
  return {
    schemaVersion: "ambient-subagent-replay-diagnostics-plan-v1",
    command,
    args,
    cwd: input.cwd ?? repoRoot,
    outputPath,
    vitestOutputPath,
    fixtureEvidencePath,
    lifecycleEdgeEvidencePath,
    stdoutPath: input.stdoutPath ?? outputPath.replace(/\.json$/i, ".stdout.txt"),
    stderrPath: input.stderrPath ?? outputPath.replace(/\.json$/i, ".stderr.txt"),
    testFiles: replayTestFiles,
    fixture: "restart-repair-broken-child-tree",
    liveTokens: false,
  };
}

export function summarizeSubagentReplayVitestResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return {
      status: "missing",
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      totalSuites: 0,
      failedSuites: 0,
      replayTestsObserved: [],
      missingReplayTests: requiredReplayTestNames,
    };
  }
  const totalTests = numberValue(result.numTotalTests) ?? testCountFromSuites(result.testResults);
  const failedTests = numberValue(result.numFailedTests) ?? statusCountFromSuites(result.testResults, ["failed", "fail"]);
  const passedTests = numberValue(result.numPassedTests) ?? statusCountFromSuites(result.testResults, ["passed", "pass"]);
  const totalSuites = numberValue(result.numTotalTestSuites) ?? (Array.isArray(result.testResults) ? result.testResults.length : 0);
  const failedSuites = numberValue(result.numFailedTestSuites) ?? suiteStatusCount(result.testResults, ["failed", "fail"]);
  const replayTestsObserved = observedTestNames(result.testResults);
  const missingReplayTests = requiredReplayTestNames.filter((name) => !replayTestsObserved.includes(name));
  const success = result.success === true || (totalTests > 0 && failedTests === 0 && failedSuites === 0);
  return {
    status: success && missingReplayTests.length === 0 ? "passed" : "failed",
    totalTests,
    passedTests,
    failedTests,
    totalSuites,
    failedSuites,
    replayTestsObserved,
    missingReplayTests,
  };
}

export async function runSubagentReplayDiagnostics(input = {}) {
  const plan = buildSubagentReplayDiagnosticsPlan(input);
  const startedAt = input.startedAt ?? new Date().toISOString();
  const before = Date.now();
  const commandResult = await (input.runCommand ?? execFileCapture)({
    command: plan.command,
    args: plan.args,
    cwd: plan.cwd,
    env: {
      ...(input.env ?? process.env),
      AMBIENT_SUBAGENT_REPLAY_EVIDENCE_OUT: plan.fixtureEvidencePath,
      AMBIENT_SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_OUT: plan.lifecycleEdgeEvidencePath,
    },
  });
  const completedAt = input.completedAt ?? new Date().toISOString();
  const durationMs = input.durationMs ?? Math.max(0, Date.now() - before);
  const vitestResult = input.vitestResult ?? await readJsonIfPresent(plan.vitestOutputPath);
  const vitest = summarizeSubagentReplayVitestResult(vitestResult);
  const replayEvidence = input.replayEvidence ?? await readJsonIfPresent(plan.fixtureEvidencePath);
  const replayEvidenceValidation = validateSubagentReplayEvidence(replayEvidence);
  const lifecycleEdgeEvidence = input.lifecycleEdgeEvidence ?? await readJsonIfPresent(plan.lifecycleEdgeEvidencePath);
  const lifecycleEdgeEvidenceValidation = validateSubagentLifecycleEdgeEvidence(lifecycleEdgeEvidence);
  const blockingIssues = [
    commandResult.exitCode === 0 ? undefined : `Replay diagnostics command exited ${commandResult.exitCode}.`,
    vitest.status === "missing" ? `Vitest JSON output was not found at ${plan.vitestOutputPath}.` : undefined,
    vitest.failedTests > 0 ? `${vitest.failedTests} replay test${vitest.failedTests === 1 ? "" : "s"} failed.` : undefined,
    vitest.missingReplayTests.length ? `Replay diagnostics did not observe required tests: ${vitest.missingReplayTests.join(", ")}.` : undefined,
    replayEvidenceValidation.valid ? undefined : `Replay evidence artifact is invalid: ${replayEvidenceValidation.issues.join("; ")}.`,
    lifecycleEdgeEvidenceValidation.valid ? undefined : `Lifecycle edge evidence artifact is invalid: ${lifecycleEdgeEvidenceValidation.issues.join("; ")}.`,
  ].filter(Boolean);
  const status = blockingIssues.length ? "failed" : "passed";
  const report = {
    schemaVersion: "ambient-subagent-replay-diagnostics-v1",
    startedAt,
    completedAt,
    status,
    plan,
    commandResult: {
      exitCode: commandResult.exitCode,
      signal: commandResult.signal,
      durationMs,
      stdoutChars: commandResult.stdout?.length ?? 0,
      stderrChars: commandResult.stderr?.length ?? 0,
      stdoutPreview: preview(commandResult.stdout ?? ""),
      stderrPreview: preview(commandResult.stderr ?? ""),
      stdoutPath: plan.stdoutPath,
      stderrPath: plan.stderrPath,
      fixtureEvidencePath: plan.fixtureEvidencePath,
    },
    vitest,
    replayEvidence,
    lifecycleEdgeEvidence,
    diagnostics: {
      blockingIssues,
      nextAction: blockingIssues[0] ?? "Replay fixture diagnostics passed without live Ambient/Pi tokens.",
    },
  };
  if (input.outputPath !== false) await writeSubagentReplayDiagnosticsReport(report, commandResult, plan);
  return report;
}

export function renderSubagentReplayDiagnosticsMarkdown(report) {
  const lines = [
    "# Sub-Agent Replay Diagnostics",
    "",
    `Generated: ${report.completedAt}`,
    `Status: ${report.status}`,
    `Fixture: ${report.plan?.fixture ?? "missing"}`,
    `Live tokens: ${report.plan?.liveTokens ? "yes" : "no"}`,
    "",
    "## Replay Command",
    "",
    `- Command: \`${[report.plan?.command, ...(report.plan?.args ?? [])].filter(Boolean).join(" ")}\``,
    `- CWD: \`${report.plan?.cwd ?? "missing"}\``,
    `- Vitest JSON: \`${report.plan?.vitestOutputPath ?? "missing"}\``,
    `- Fixture evidence: \`${report.plan?.fixtureEvidencePath ?? "missing"}\``,
    `- Lifecycle edge evidence: \`${report.plan?.lifecycleEdgeEvidencePath ?? "missing"}\``,
    "",
    "## Result",
    "",
    `- Exit code: ${report.commandResult?.exitCode ?? "missing"}`,
    `- Tests: ${report.vitest?.passedTests ?? 0}/${report.vitest?.totalTests ?? 0} passed`,
    `- Failed tests: ${report.vitest?.failedTests ?? 0}`,
    `- Missing replay checks: ${(report.vitest?.missingReplayTests ?? []).join("; ") || "none"}`,
    `- Blocking issues: ${(report.diagnostics?.blockingIssues ?? []).join("; ") || "none"}`,
    "",
    "## Event Stream Evidence",
    "",
    `- Evidence schema: ${report.replayEvidence?.schemaVersion ?? "missing"}`,
    `- Runtime events: ${report.replayEvidence?.counts?.runtimeEvents ?? 0}`,
    `- Persisted run events: ${report.replayEvidence?.counts?.persistedRunEvents ?? 0}`,
    `- Parent mailbox events: ${report.replayEvidence?.counts?.parentMailboxEvents ?? 0}`,
    `- Child threads: ${report.replayEvidence?.counts?.childThreads ?? 0}`,
    `- Restart repair issues: ${report.replayEvidence?.counts?.restartRepairIssues ?? 0}`,
    `- Observed issue kinds: ${(report.replayEvidence?.restartRepair?.observedIssueKinds ?? []).join("; ") || "none"}`,
    `- Rehydrated mailbox states: ${report.replayEvidence?.rehydration?.parentMailboxStates?.length ?? 0}`,
    `- Result artifact pointers: ${report.replayEvidence?.rehydration?.resultArtifactPointers?.length ?? 0}`,
    `- Missing result artifacts: ${(report.replayEvidence?.rehydration?.missingResultArtifactRunIds ?? []).join("; ") || "none"}`,
    "",
    "## Lifecycle Edge Evidence",
    "",
    `- Evidence schema: ${report.lifecycleEdgeEvidence?.schemaVersion ?? "missing"}`,
    `- Source: ${report.lifecycleEdgeEvidence?.source ?? "missing"}`,
    `- Parent: ${report.lifecycleEdgeEvidence?.parent?.threadId ?? "missing"} / ${report.lifecycleEdgeEvidence?.parent?.runId ?? "missing"}`,
    `- Covered edges: ${(report.lifecycleEdgeEvidence?.summary?.coveredEdgeKinds ?? []).join("; ") || "missing"}`,
    `- Missing edges: ${(report.lifecycleEdgeEvidence?.summary?.missingEdgeKinds ?? []).join("; ") || "none"}`,
    `- Unsafe edges: ${(report.lifecycleEdgeEvidence?.summary?.unsafeEdgeIds ?? []).join("; ") || "none"}`,
    "",
    "## Artifacts",
    "",
    `- Stdout: \`${report.commandResult?.stdoutPath ?? "missing"}\``,
    `- Stderr: \`${report.commandResult?.stderrPath ?? "missing"}\``,
    `- Fixture evidence: \`${report.commandResult?.fixtureEvidencePath ?? report.plan?.fixtureEvidencePath ?? "missing"}\``,
    `- Lifecycle edge evidence: \`${report.plan?.lifecycleEdgeEvidencePath ?? "missing"}\``,
  ];
  return `${lines.join("\n").trim()}\n`;
}

async function writeSubagentReplayDiagnosticsReport(report, commandResult, plan) {
  await mkdir(dirname(plan.outputPath), { recursive: true });
  await writeFile(plan.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(plan.outputPath.replace(/\.json$/i, ".md"), renderSubagentReplayDiagnosticsMarkdown(report), "utf8");
  await writeFile(plan.stdoutPath, commandResult.stdout ?? "", "utf8");
  await writeFile(plan.stderrPath, commandResult.stderr ?? "", "utf8");
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

function execFileCapture(input) {
  return new Promise((resolveResult) => {
    execFile(input.command, input.args, { cwd: input.cwd, env: input.env, encoding: "utf8" }, (error, stdout, stderr) => {
      resolveResult({
        exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
        signal: error?.signal,
        stdout,
        stderr,
      });
    });
  });
}

function observedTestNames(testResults) {
  if (!Array.isArray(testResults)) return [];
  return testResults.flatMap((suite) => {
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : Array.isArray(suite.tests) ? suite.tests : [];
    return assertions
      .map((test) => String(test.fullName ?? test.name ?? test.title ?? "").trim())
      .filter(Boolean);
  });
}

function testCountFromSuites(testResults) {
  if (!Array.isArray(testResults)) return 0;
  return testResults.reduce((total, suite) => {
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : Array.isArray(suite.tests) ? suite.tests : [];
    return total + assertions.length;
  }, 0);
}

function statusCountFromSuites(testResults, statuses) {
  if (!Array.isArray(testResults)) return 0;
  const statusSet = new Set(statuses);
  return testResults.reduce((total, suite) => {
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : Array.isArray(suite.tests) ? suite.tests : [];
    return total + assertions.filter((test) => statusSet.has(String(test.status ?? test.result ?? "").toLowerCase())).length;
  }, 0);
}

function suiteStatusCount(testResults, statuses) {
  if (!Array.isArray(testResults)) return 0;
  const statusSet = new Set(statuses);
  return testResults.filter((suite) => statusSet.has(String(suite.status ?? "").toLowerCase())).length;
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function preview(value) {
  if (value.length <= maxPreviewChars) return value;
  return `${value.slice(0, maxPreviewChars)}\n[truncated ${value.length - maxPreviewChars} chars]`;
}

function validateSubagentReplayEvidence(evidence) {
  const issues = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { valid: false, issues: ["missing replay evidence JSON"] };
  }
  if (evidence.schemaVersion !== "ambient-subagent-replay-evidence-v1") {
    issues.push(`schemaVersion is ${evidence.schemaVersion ?? "missing"}`);
  }
  if (evidence.liveTokens !== false) issues.push("liveTokens must be false");
  if (!Array.isArray(evidence.runtimeEventTimeline) || evidence.runtimeEventTimeline.length === 0) {
    issues.push("runtimeEventTimeline is empty");
  }
  if (!Array.isArray(evidence.persistedRunEventTimeline) || evidence.persistedRunEventTimeline.length === 0) {
    issues.push("persistedRunEventTimeline is empty");
  }
  if (!Array.isArray(evidence.parentMailboxTimeline) || evidence.parentMailboxTimeline.length === 0) {
    issues.push("parentMailboxTimeline is empty");
  }
  if ((numberValue(evidence.counts?.parentMailboxEvents) ?? 0) <= 0) {
    issues.push("parent mailbox event count is missing");
  }
  if (!Array.isArray(evidence.childThreads) || evidence.childThreads.length === 0) {
    issues.push("childThreads are missing");
  }
  const observedIssueKinds = evidence.restartRepair?.observedIssueKinds;
  const expectedIssueKinds = evidence.restartRepair?.expectedIssueKinds;
  if (!Array.isArray(observedIssueKinds) || observedIssueKinds.length === 0) {
    issues.push("observed restart repair issue kinds are missing");
  }
  if (!Array.isArray(expectedIssueKinds) || expectedIssueKinds.length === 0) {
    issues.push("expected restart repair issue kinds are missing");
  }
  if (Array.isArray(observedIssueKinds) && Array.isArray(expectedIssueKinds)) {
    const missingObserved = expectedIssueKinds.filter((kind) => !observedIssueKinds.includes(kind));
    if (missingObserved.length) issues.push(`expected issue kinds were not observed: ${missingObserved.join(", ")}`);
  }
  validateReplayRehydrationProof(evidence.rehydration, issues);
  return { valid: issues.length === 0, issues };
}

function validateReplayRehydrationProof(rehydration, issues) {
  if (!rehydration || typeof rehydration !== "object" || Array.isArray(rehydration)) {
    issues.push("rehydration proof is missing");
    return;
  }
  if (rehydration.schemaVersion !== "ambient-subagent-restart-rehydration-proof-v1") {
    issues.push(`rehydration proof schemaVersion is ${rehydration.schemaVersion ?? "missing"}`);
  }
  if (!nonEmptyStringArray(rehydration.childRunIds)) issues.push("rehydration proof childRunIds are missing");
  if (!nonEmptyStringArray(rehydration.childThreadIds)) issues.push("rehydration proof childThreadIds are missing");
  if (!nonEmptyStringArray(rehydration.parentMailboxEventIds)) issues.push("rehydration proof parentMailboxEventIds are missing");
  const mailboxStates = Array.isArray(rehydration.parentMailboxStates) ? rehydration.parentMailboxStates : [];
  if (mailboxStates.length === 0) issues.push("rehydration proof parentMailboxStates are missing");
  for (const state of mailboxStates) {
    if (!nonEmptyString(state?.id)) issues.push("rehydration proof mailbox state is missing id");
    if (!nonEmptyString(state?.parentThreadId)) issues.push(`rehydration proof mailbox ${state?.id ?? "unknown"} is missing parentThreadId`);
    if (!nonEmptyString(state?.parentRunId)) issues.push(`rehydration proof mailbox ${state?.id ?? "unknown"} is missing parentRunId`);
    if (!["queued", "delivered", "consumed", "failed", "cancelled"].includes(state?.deliveryState)) {
      issues.push(`rehydration proof mailbox ${state?.id ?? "unknown"} has invalid deliveryState ${state?.deliveryState ?? "missing"}`);
    }
    if (!nonEmptyStringArray(state?.childRunIds)) issues.push(`rehydration proof mailbox ${state?.id ?? "unknown"} is missing childRunIds`);
  }
  if (!nonEmptyStringArray(rehydration.transcriptThreadIds)) issues.push("rehydration proof transcriptThreadIds are missing");
  const artifactPointers = Array.isArray(rehydration.resultArtifactPointers) ? rehydration.resultArtifactPointers : [];
  if (artifactPointers.length === 0) issues.push("rehydration proof resultArtifactPointers are missing");
  for (const pointer of artifactPointers) {
    if (!nonEmptyString(pointer?.runId)) issues.push("rehydration proof result artifact pointer is missing runId");
    if (!nonEmptyString(pointer?.childThreadId)) issues.push(`rehydration proof result artifact pointer ${pointer?.runId ?? "unknown"} is missing childThreadId`);
    if (![pointer?.artifactPath, pointer?.fullOutputPath, pointer?.structuredOutputPath].some(nonEmptyString)) {
      issues.push(`rehydration proof result artifact pointer ${pointer?.runId ?? "unknown"} is missing artifact paths`);
    }
  }
  if (!nonEmptyStringArray(rehydration.missingResultArtifactRunIds)) {
    issues.push("rehydration proof missingResultArtifactRunIds are missing");
  }
  const integrity = rehydration.artifactPointerIntegrity ?? {};
  for (const field of [
    "allResultPointersHaveRunAndThread",
    "missingResultArtifactsDiagnosed",
    "parentMailboxChildRefsResolved",
    "transcriptChildRefsResolved",
  ]) {
    if (integrity[field] !== true) issues.push(`rehydration proof integrity ${field} is not true`);
  }
}

function validateSubagentLifecycleEdgeEvidence(evidence) {
  const issues = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { valid: false, issues: ["missing lifecycle edge evidence JSON"] };
  }
  if (evidence.schemaVersion !== "ambient-subagent-lifecycle-edge-evidence-v1") {
    issues.push(`schemaVersion is ${evidence.schemaVersion ?? "missing"}`);
  }
  if (evidence.liveTokens !== false) issues.push("liveTokens must be false");
  if (evidence.featureFlagSnapshot?.ambientSubagentsEnabled !== true) {
    issues.push("ambient.subagents feature flag proof is missing");
  }
  if (!nonEmptyString(evidence.parent?.threadId) || !nonEmptyString(evidence.parent?.runId)) {
    issues.push("parent thread/run identity is missing");
  }
  if (!arrayIncludesAll(evidence.summary?.requiredEdgeKinds, requiredLifecycleEdgeKinds)) {
    issues.push("required lifecycle edge kinds are incomplete");
  }
  if (!arrayIncludesAll(evidence.summary?.coveredEdgeKinds, requiredLifecycleEdgeKinds)) {
    issues.push("covered lifecycle edge kinds are incomplete");
  }
  if (Array.isArray(evidence.summary?.missingEdgeKinds) && evidence.summary.missingEdgeKinds.length > 0) {
    issues.push(`missing lifecycle edge kinds: ${evidence.summary.missingEdgeKinds.join(", ")}`);
  }
  if (Array.isArray(evidence.summary?.unsafeEdgeIds) && evidence.summary.unsafeEdgeIds.length > 0) {
    issues.push(`unsafe lifecycle edge ids: ${evidence.summary.unsafeEdgeIds.join(", ")}`);
  }
  const edges = Array.isArray(evidence.edges) ? evidence.edges : [];
  if (edges.length < requiredLifecycleEdgeKinds.length) {
    issues.push(`expected at least ${requiredLifecycleEdgeKinds.length} lifecycle edge rows, got ${edges.length}`);
  }
  for (const edge of edges) {
    if (!requiredLifecycleEdgeKinds.includes(edge?.kind)) {
      issues.push(`unknown lifecycle edge kind: ${edge?.kind ?? "missing"}`);
      continue;
    }
    if (!nonEmptyString(edge.id)) issues.push(`lifecycle edge ${edge.kind} is missing id`);
    if (!nonEmptyString(edge.label)) issues.push(`lifecycle edge ${edge.id ?? edge.kind} is missing label`);
    if (!nonEmptyArray(edge.childRunIds)) issues.push(`lifecycle edge ${edge.id ?? edge.kind} is missing childRunIds`);
    if (!nonEmptyArray(edge.childThreadIds)) issues.push(`lifecycle edge ${edge.id ?? edge.kind} is missing childThreadIds`);
    if (!nonEmptyArray(edge.observedEventIds)) issues.push(`lifecycle edge ${edge.id ?? edge.kind} is missing observedEventIds`);
    const safety = edge.synthesisSafety ?? {};
    for (const field of [
      "parentDidNotSynthesizeUnsafeChild",
      "resultArtifactStateExplicit",
      "affectedChildrenNamed",
      "decisionOrEventAttributed",
      "visibleCollapsedThreadState",
    ]) {
      if (safety[field] !== true) issues.push(`lifecycle edge ${edge.id ?? edge.kind} is missing synthesis safety ${field}`);
    }
  }
  return { valid: issues.length === 0, issues };
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.some(nonEmptyString);
}

function arrayIncludesAll(value, expected) {
  return Array.isArray(value) && expected.every((item) => value.includes(item));
}

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}
