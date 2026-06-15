const DEFAULT_RECOVERY_PRESSURE_THRESHOLD = 5;
const DEFAULT_REPEATED_PRESSURE_THRESHOLD = 2;

export function buildAggressiveRetriesGmiReleaseGateReport(input) {
  const runtimeToggle = buildRuntimeToggleLane(input.runtimeToggle);
  const directHelperRetry = buildDirectHelperRetryLane(input.directHelperRetry);
  const recoveryPressureThreshold = normalizePositiveInteger(
    input.recoveryPressureThreshold,
    DEFAULT_RECOVERY_PRESSURE_THRESHOLD,
  );
  const stabilitySignals = buildAggressiveRetriesStabilitySignals({
    runtimeToggle,
    directHelperRetry,
    recoveryPressureThreshold,
  });
  const repeatedPressureThreshold = normalizePositiveInteger(
    input.repeatedPressureThreshold,
    DEFAULT_REPEATED_PRESSURE_THRESHOLD,
  );
  const pressureTrend = buildAggressiveRetriesPressureTrend({
    stabilitySignals,
    pressureHistory: input.pressureHistory,
    repeatedPressureThreshold,
  });
  const pressureIssues = input.failOnRetryPressure === true ? stabilitySignals.advisoryIssues : [];
  const repeatedPressureIssues = input.failOnRepeatedPressure === true ? pressureTrend.advisoryIssues : [];
  const blockingIssues = [
    ...runtimeToggle.check.issues,
    ...directHelperRetry.check.issues,
    ...pressureIssues,
    ...repeatedPressureIssues,
  ];
  const advisoryIssues = uniqueStrings([...stabilitySignals.advisoryIssues, ...pressureTrend.advisoryIssues]);
  const completedAt = input.completedAt ?? new Date().toISOString();
  const report = {
    status: blockingIssues.length === 0 ? "passed" : "attention",
    generatedAt: completedAt,
    startedAt: input.startedAt,
    completedAt,
    durationMs: durationMs(input.startedAt, completedAt),
    outputRoot: input.outputRoot,
    runtimeToggle,
    directHelperRetry,
    releaseDecision: {
      ready: blockingIssues.length === 0,
      blockingIssues,
      advisoryIssues,
      recoveryPressureThreshold,
      failOnRetryPressure: input.failOnRetryPressure === true,
      stabilitySignals,
      pressureTrend,
      repeatedPressureThreshold,
      failOnRepeatedPressure: input.failOnRepeatedPressure === true,
      pressureHistoryPath: input.pressureHistoryPath,
      diagnosticArtifacts: diagnosticArtifacts(runtimeToggle, directHelperRetry),
      triagePath: input.triagePath,
      nextSlice:
        blockingIssues.length === 0
          ? "Keep this combined GMI release gate green and harden the next observed live failure instead of broadening retry scope preemptively."
          : "Fix the failing aggressive-retry release lane, rerun this combined GMI release gate, and only then expand retry coverage.",
    },
  };
  report.releaseDecision.failureTriage = buildAggressiveRetriesGateTriage(report);
  return report;
}

export function buildAggressiveRetriesPressureHistoryEntry(report) {
  const stabilitySignals =
    report?.releaseDecision?.stabilitySignals && typeof report.releaseDecision.stabilitySignals === "object"
      ? report.releaseDecision.stabilitySignals
      : buildAggressiveRetriesStabilitySignals({
          runtimeToggle: report?.runtimeToggle,
          directHelperRetry: report?.directHelperRetry,
          recoveryPressureThreshold: report?.releaseDecision?.recoveryPressureThreshold,
        });
  return {
    schemaVersion: 1,
    runId: report?.completedAt ?? report?.generatedAt,
    generatedAt: report?.generatedAt,
    startedAt: report?.startedAt,
    completedAt: report?.completedAt,
    status: report?.status,
    releaseReady: report?.releaseDecision?.ready === true,
    stabilityStatus: stabilitySignals.status,
    recoveryPressureThreshold: stabilitySignals.recoveryPressureThreshold,
    pressureScenarioCount: stabilitySignals.pressureScenarioCount,
    directHelperRetryScenarios: (stabilitySignals.directHelperRetryScenarios ?? []).map((scenario) => ({
      scenario: scenario.scenario,
      status: scenario.status,
      pressure: scenario.pressure === true,
      forwardedChatCompletionCount: scenario.forwardedChatCompletionCount,
      forwardedStreamChatCompletionCount: scenario.forwardedStreamChatCompletionCount,
      forwardedNonStreamChatCompletionCount: scenario.forwardedNonStreamChatCompletionCount,
      chatCompletionCount: scenario.chatCompletionCount,
      failpointLimit: scenario.failpointLimit,
      failpointTriggerCount: scenario.failpointTriggerCount,
      retryAttempt: scenario.retryAttempt,
      maxRetries: scenario.maxRetries,
      retryDelayMs: scenario.retryDelayMs,
      fallbackToNonStream: scenario.fallbackToNonStream === true,
    })),
  };
}

export function aggressiveRetriesGmiReleaseGatePassed(report) {
  return (
    report?.status === "passed" &&
    report?.runtimeToggle?.check?.passed === true &&
    report?.directHelperRetry?.check?.passed === true &&
    Array.isArray(report?.releaseDecision?.blockingIssues) &&
    report.releaseDecision.blockingIssues.length === 0
  );
}

export function buildAggressiveRetriesGateTriage(report) {
  const blockingIssues = Array.isArray(report?.releaseDecision?.blockingIssues) ? report.releaseDecision.blockingIssues : [];
  const releaseAdvisoryIssues = Array.isArray(report?.releaseDecision?.advisoryIssues) ? report.releaseDecision.advisoryIssues : [];
  const stabilitySignals =
    report?.releaseDecision?.stabilitySignals && typeof report.releaseDecision.stabilitySignals === "object"
      ? report.releaseDecision.stabilitySignals
      : buildAggressiveRetriesStabilitySignals({
          runtimeToggle: report?.runtimeToggle,
          directHelperRetry: report?.directHelperRetry,
          recoveryPressureThreshold: report?.releaseDecision?.recoveryPressureThreshold,
        });
  const pressureTrend =
    report?.releaseDecision?.pressureTrend && typeof report.releaseDecision.pressureTrend === "object"
      ? report.releaseDecision.pressureTrend
      : buildAggressiveRetriesPressureTrend({
          stabilitySignals,
          pressureHistory: [],
          repeatedPressureThreshold: report?.releaseDecision?.repeatedPressureThreshold,
        });
  const stabilityStatus = pressureTrend.status === "repeated_pressure" ? "repeated_pressure" : stabilitySignals.status;
  const advisoryIssues = uniqueStrings([
    ...releaseAdvisoryIssues,
    ...(stabilitySignals.advisoryIssues ?? []),
    ...(pressureTrend.advisoryIssues ?? []),
  ]);
  const lanes = [
    { label: "runtimeToggle", displayName: "runtime-toggle GMI smoke", lane: report?.runtimeToggle },
    { label: "directHelperRetry", displayName: "strict direct-helper retry GMI gate", lane: report?.directHelperRetry },
  ].filter((item) => item.lane && typeof item.lane === "object");
  const failingLanes = lanes.filter(({ lane }) => lane.status !== "passed" || lane.check?.passed === false || lane.timedOut === true);
  if (blockingIssues.length === 0 && failingLanes.length === 0) {
    const pressureCount = stabilitySignals.status === "pressure" ? stabilitySignals.pressureScenarioCount ?? 0 : 0;
    const repeatedPressureCount = pressureTrend.repeatedPressureScenarioCount ?? 0;
    return {
      status: "clear",
      focusLane: undefined,
      failureClass: "none",
      stabilityStatus,
      summary:
        repeatedPressureCount > 0
          ? `Aggregate aggressive-retries GMI release gate is green with repeated retry pressure in ${repeatedPressureCount} direct-helper scenario(s).`
          : pressureCount > 0
          ? `Aggregate aggressive-retries GMI release gate is green with retry pressure in ${pressureCount} direct-helper scenario(s).`
          : "Aggregate aggressive-retries GMI release gate is green.",
      nextAction:
        repeatedPressureCount > 0
          ? "Harden the repeated high-pressure direct-helper scenario(s) before broadening aggressive retry scope."
          : pressureCount > 0
          ? "Keep the aggregate GMI release gate green, but inspect the high-pressure recovery scenario(s) before broadening retry scope."
          : "Keep the aggregate GMI release gate green and use the next non-green report to drive targeted hardening.",
      evidence: {
        diagnosticArtifacts: report?.releaseDecision?.diagnosticArtifacts ?? [],
        advisoryIssues,
        stabilitySignals,
        pressureTrend,
      },
    };
  }

  if (blockingIssues.length > 0 && failingLanes.length === 0) {
    const classification = classifyReleaseDecisionFailure(blockingIssues);
    return {
      status: "attention",
      focusLane: "releaseDecision",
      failureClass: classification.failureClass,
      stabilityStatus,
      summary: `aggregate release decision needs attention: ${classification.summary}`,
      nextAction: classification.nextAction,
      evidence: {
        blockingIssues,
        advisoryIssues,
        diagnosticArtifacts: report?.releaseDecision?.diagnosticArtifacts ?? [],
        stabilitySignals,
        pressureTrend,
      },
    };
  }

  const primary = failingLanes[0] ?? lanes[0];
  const classification = classifyLaneFailure(primary.label, primary.lane, blockingIssues);
  return {
    status: "attention",
    focusLane: primary.label,
    failureClass: classification.failureClass,
    stabilityStatus,
    summary: `${primary.displayName} needs attention: ${classification.summary}`,
    nextAction: classification.nextAction,
    evidence: {
      blockingIssues,
      advisoryIssues,
      laneIssues: primary.lane?.check?.issues ?? [],
      diagnosticArtifacts: report?.releaseDecision?.diagnosticArtifacts ?? [],
      laneArtifact: laneArtifact(report, primary.label),
      stabilitySignals,
      pressureTrend,
      runtimeToggle: summarizeRuntimeToggleForTriage(report?.runtimeToggle),
      directHelperRetry: summarizeDirectHelperRetryForTriage(report?.directHelperRetry),
      stdoutTail: compactTail(primary.lane?.stdoutTail),
      stderrTail: compactTail(primary.lane?.stderrTail),
    },
  };
}

function buildAggressiveRetriesStabilitySignals(input = {}) {
  const recoveryPressureThreshold = normalizePositiveInteger(
    input.recoveryPressureThreshold,
    DEFAULT_RECOVERY_PRESSURE_THRESHOLD,
  );
  const runtimeToggle = input.runtimeToggle && typeof input.runtimeToggle === "object" ? input.runtimeToggle : {};
  const directHelperRetry = input.directHelperRetry && typeof input.directHelperRetry === "object" ? input.directHelperRetry : {};
  const directHelperRetryScenarios = directHelperScenarioSignals(directHelperRetry, recoveryPressureThreshold);
  const pressureScenarios = directHelperRetryScenarios.filter((scenario) => scenario.pressure === true);
  const advisoryIssues = pressureScenarios.map(
    (scenario) =>
      `Project-board direct-helper retry ${scenario.scenarioLabel} scenario recovered only after ${scenario.forwardedChatCompletionCount} forwarded GMI chat-completion request(s), meeting the retry-pressure threshold of ${recoveryPressureThreshold}.`,
  );
  return {
    status: advisoryIssues.length > 0 ? "pressure" : "nominal",
    recoveryPressureThreshold,
    pressureScenarioCount: pressureScenarios.length,
    laneSignals: [
      laneStabilitySignal("runtimeToggle", runtimeToggle),
      laneStabilitySignal("directHelperRetry", directHelperRetry),
    ],
    directHelperRetryScenarios,
    advisoryIssues,
  };
}

function buildAggressiveRetriesPressureTrend(input = {}) {
  const stabilitySignals = input.stabilitySignals && typeof input.stabilitySignals === "object" ? input.stabilitySignals : {};
  const repeatedPressureThreshold = normalizePositiveInteger(
    input.repeatedPressureThreshold,
    DEFAULT_REPEATED_PRESSURE_THRESHOLD,
  );
  const pressureHistory = Array.isArray(input.pressureHistory) ? input.pressureHistory : [];
  const scenarioTrends = (stabilitySignals.directHelperRetryScenarios ?? []).map((scenario) =>
    scenarioPressureTrend(scenario, pressureHistory, repeatedPressureThreshold),
  );
  const repeatedPressureScenarios = scenarioTrends.filter((trend) => trend.repeatedPressure === true);
  const advisoryIssues = repeatedPressureScenarios.map(
    (trend) =>
      `Project-board direct-helper retry ${trend.scenario} scenario met retry-pressure threshold in ${trend.consecutivePressureRuns} consecutive aggregate gate run(s).`,
  );
  return {
    status: repeatedPressureScenarios.length > 0 ? "repeated_pressure" : (stabilitySignals.status ?? "nominal"),
    repeatedPressureThreshold,
    historyRunCount: pressureHistory.length,
    repeatedPressureScenarioCount: repeatedPressureScenarios.length,
    scenarioTrends,
    repeatedPressureScenarios,
    advisoryIssues,
  };
}

function scenarioPressureTrend(scenario, pressureHistory, repeatedPressureThreshold) {
  const currentPressure = scenario.pressure === true;
  const previousSignals = pressureHistory
    .slice()
    .reverse()
    .map((entry) => historyScenarioFor(entry, scenario.scenario))
    .filter(Boolean);
  let previousConsecutivePressureRuns = 0;
  for (const signal of previousSignals) {
    if (signal.pressure !== true) break;
    previousConsecutivePressureRuns += 1;
  }
  const consecutivePressureRuns = currentPressure ? previousConsecutivePressureRuns + 1 : 0;
  return {
    scenario: scenario.scenario,
    currentPressure,
    currentForwardedChatCompletionCount: scenario.forwardedChatCompletionCount,
    consecutivePressureRuns,
    previousConsecutivePressureRuns,
    repeatedPressure: currentPressure && consecutivePressureRuns >= repeatedPressureThreshold,
    recentForwardedChatCompletionCounts: [
      scenario.forwardedChatCompletionCount,
      ...previousSignals.slice(0, Math.max(repeatedPressureThreshold - 1, 0)).map((signal) => signal.forwardedChatCompletionCount),
    ].filter((value) => value !== undefined),
  };
}

function historyScenarioFor(entry, scenarioName) {
  if (!entry || typeof entry !== "object") return undefined;
  const scenarios = Array.isArray(entry.directHelperRetryScenarios)
    ? entry.directHelperRetryScenarios
    : Array.isArray(entry.scenarios)
      ? entry.scenarios
      : [];
  return scenarios.find((scenario) => scenario?.scenario === scenarioName);
}

function directHelperScenarioSignals(lane = {}, recoveryPressureThreshold) {
  return [
    scenarioStabilitySignal("source-classification", lane.sourceClassification, recoveryPressureThreshold),
    scenarioStabilitySignal("charter-summary", lane.charterSummary, recoveryPressureThreshold),
    scenarioStabilitySignal("proof-judgment", lane.proofJudgment, recoveryPressureThreshold),
  ].filter(Boolean);
}

function laneStabilitySignal(label, lane = {}) {
  return {
    lane: label,
    status: lane.status,
    durationMs: lane.durationMs,
    stdoutBytes: lane.stdoutBytes ?? 0,
    stderrBytes: lane.stderrBytes ?? 0,
    timedOut: lane.timedOut === true,
  };
}

function scenarioStabilitySignal(scenarioLabel, scenario, recoveryPressureThreshold) {
  if (!scenario || typeof scenario !== "object") return undefined;
  const forwardedChatCompletionCount = finiteNumber(scenario.forwardedChatCompletionCount);
  const forwardedStreamChatCompletionCount = finiteNumber(scenario.forwardedStreamChatCompletionCount);
  const forwardedNonStreamChatCompletionCount = finiteNumber(scenario.forwardedNonStreamChatCompletionCount);
  const chatCompletionCount = finiteNumber(scenario.chatCompletionCount);
  return {
    scenario: scenarioLabel,
    scenarioLabel,
    status: scenario.status,
    failpointTriggered: scenario.failpointTriggered,
    failpointLimit: scenario.failpointLimit,
    failpointTriggerCount: scenario.failpointTriggerCount,
    failpointClosedByClient: scenario.failpointClosedByClient,
    chatCompletionCount,
    forwardedChatCompletionCount,
    forwardedStreamChatCompletionCount,
    forwardedNonStreamChatCompletionCount,
    retryAttempt: scenario.retryEvent?.retryAttempt,
    maxRetries: scenario.retryEvent?.maxRetries,
    retryDelayMs: scenario.retryEvent?.retryDelayMs,
    fallbackToNonStream:
      scenario.fallbackToNonStream === true ||
      scenario.retryEvent?.fallbackToNonStream === true ||
      (forwardedNonStreamChatCompletionCount ?? 0) > 0,
    pressure:
      forwardedChatCompletionCount !== undefined && forwardedChatCompletionCount >= recoveryPressureThreshold,
  };
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : undefined;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function buildRuntimeToggleLane(input = {}) {
  const report = input.report && typeof input.report === "object" ? input.report : undefined;
  const issues = [];
  validateCommandResult(input, "Aggressive retries runtime-toggle GMI smoke", issues);
  if (!report) {
    issues.push("Aggressive retries runtime-toggle GMI smoke did not produce a readable report.");
  } else {
    validateRuntimeToggleReport(report, issues);
  }

  return {
    status: issues.length === 0 ? "passed" : "attention",
    command: input.command,
    exitCode: input.exitCode,
    signal: input.signal,
    timedOut: input.timedOut === true,
    timeoutMs: input.timeoutMs,
    durationMs: input.durationMs,
    reportPath: input.reportPath,
    stdoutPath: input.stdoutPath,
    stderrPath: input.stderrPath,
    stdoutBytes: input.stdoutBytes ?? 0,
    stderrBytes: input.stderrBytes ?? 0,
    stdoutTail: input.stdoutTail,
    stderrTail: input.stderrTail,
    observed: Boolean(report),
    providerId: report?.providerId,
    providerLabel: report?.providerLabel,
    model: report?.model,
    threadId: report?.threadId,
    baselineTokenSeen: report?.baselineTokenSeen === true,
    toggledTokenSeen: report?.toggledTokenSeen === true,
    sessionFileBeforeToggleName: report?.sessionFileBeforeToggleName,
    sessionFileAfterToggleName: report?.sessionFileAfterToggleName,
    runtimeSettingsActivity: report?.runtimeSettingsActivity,
    check: {
      passed: issues.length === 0,
      issues,
    },
  };
}

function buildDirectHelperRetryLane(input = {}) {
  const report = input.report && typeof input.report === "object" ? input.report : undefined;
  const directHelperRetry = report?.directHelperRetry && typeof report.directHelperRetry === "object" ? report.directHelperRetry : undefined;
  const issues = [];
  validateCommandResult(input, "Project-board strict direct-helper retry GMI gate", issues);
  if (!report) {
    issues.push("Project-board strict direct-helper retry GMI gate did not produce a readable report.");
  } else {
    validateDirectHelperRetryGateReport(report, directHelperRetry, issues);
  }

  return {
    status: issues.length === 0 ? "passed" : "attention",
    command: input.command,
    exitCode: input.exitCode,
    signal: input.signal,
    timedOut: input.timedOut === true,
    timeoutMs: input.timeoutMs,
    durationMs: input.durationMs,
    reportPath: input.reportPath,
    stdoutPath: input.stdoutPath,
    stderrPath: input.stderrPath,
    stdoutBytes: input.stdoutBytes ?? 0,
    stderrBytes: input.stderrBytes ?? 0,
    stdoutTail: input.stdoutTail,
    stderrTail: input.stderrTail,
    observed: Boolean(report),
    gateStatus: report?.status,
    required: directHelperRetry?.required === true,
    directHelperRetryStatus: directHelperRetry?.status,
    directHelperRetryObserved: directHelperRetry?.observed === true,
    scenarioCount: directHelperRetry?.scenarioCount ?? 0,
    targets: directHelperRetry?.targets ?? [],
    sourceClassificationComplete: directHelperRetry?.sourceClassificationComplete === true,
    charterSummaryComplete: directHelperRetry?.charterSummaryComplete === true,
    proofJudgmentComplete: directHelperRetry?.proofJudgmentComplete === true,
    sourceClassification: directHelperRetry?.sourceClassification,
    charterSummary: directHelperRetry?.charterSummary,
    proofJudgment: directHelperRetry?.proofJudgment,
    releaseBlockingIssues: Array.isArray(report?.releaseDecision?.blockingIssues) ? report.releaseDecision.blockingIssues : [],
    check: {
      passed: issues.length === 0,
      issues,
    },
  };
}

function validateCommandResult(input, label, issues) {
  if (input.timedOut === true) {
    issues.push(`${label} timed out after ${input.timeoutMs ?? "unknown"}ms; see lane stdout/stderr artifacts for the last observed output.`);
  } else if (input.exitCode !== 0) {
    issues.push(`${label} exited with code ${input.exitCode ?? "none"}${input.signal ? ` signal ${input.signal}` : ""}.`);
  }
}

function validateRuntimeToggleReport(report, issues) {
  if (report.status !== "passed") issues.push(`Aggressive retries runtime-toggle smoke status was ${report.status ?? "missing"}.`);
  if (report.providerId !== "gmi-cloud") {
    issues.push(`Aggressive retries runtime-toggle smoke provider was ${report.providerId ?? "missing"}, expected gmi-cloud.`);
  }
  if (report.baselineTokenSeen !== true) {
    issues.push("Aggressive retries runtime-toggle smoke did not observe the baseline live-token response.");
  }
  if (report.toggledTokenSeen !== true) {
    issues.push("Aggressive retries runtime-toggle smoke did not observe the post-toggle live-token response.");
  }
  const activity = report.runtimeSettingsActivity && typeof report.runtimeSettingsActivity === "object" ? report.runtimeSettingsActivity : {};
  if (activity.status !== "applied") {
    issues.push(`Aggressive retries runtime-toggle activity status was ${activity.status ?? "missing"}, expected applied.`);
  }
  if (activity.aggressiveRetries !== true) {
    issues.push("Aggressive retries runtime-toggle activity did not confirm aggressiveRetries: true.");
  }
  if (activity.disposedSession !== true) {
    issues.push("Aggressive retries runtime-toggle activity did not confirm the idle Pi session was disposed.");
  }
}

function validateDirectHelperRetryGateReport(report, directHelperRetry, issues) {
  if (report.status !== "passed") {
    issues.push(`Project-board strict direct-helper retry gate status was ${report.status ?? "missing"}.`);
  }
  const releaseBlockingIssues = Array.isArray(report?.releaseDecision?.blockingIssues) ? report.releaseDecision.blockingIssues : [];
  issues.push(...releaseBlockingIssues.map((issue) => `Project-board strict direct-helper retry gate blocker: ${issue}`));
  if (!directHelperRetry) {
    issues.push("Project-board strict direct-helper retry gate did not include directHelperRetry evidence.");
    return;
  }
  if (directHelperRetry.required !== true) {
    issues.push("Project-board direct-helper retry evidence was not marked required by the strict gate.");
  }
  if (directHelperRetry.observed !== true) {
    issues.push("Project-board direct-helper retry evidence was not observed by the strict gate.");
  }
  if (directHelperRetry.status !== "passed") {
    issues.push(`Project-board direct-helper retry evidence status was ${directHelperRetry.status ?? "missing"}.`);
  }
  if (directHelperRetry.scenarioCount !== 3) {
    issues.push(`Project-board direct-helper retry evidence scenarioCount was ${directHelperRetry.scenarioCount ?? "missing"}, expected 3.`);
  }
  if (directHelperRetry.sourceClassificationComplete !== true) {
    issues.push("Project-board direct-helper retry source-classification recovery was incomplete.");
  }
  if (directHelperRetry.charterSummaryComplete !== true) {
    issues.push("Project-board direct-helper retry charter-summary recovery was incomplete.");
  }
  if (directHelperRetry.proofJudgmentComplete !== true) {
    issues.push("Project-board direct-helper retry proof-judgment recovery was incomplete.");
  }
}

function durationMs(startedAt, completedAt) {
  const start = Date.parse(startedAt ?? "");
  const end = Date.parse(completedAt ?? "");
  return Number.isFinite(start) && Number.isFinite(end) ? end - start : undefined;
}

function diagnosticArtifacts(runtimeToggle, directHelperRetry) {
  return [diagnosticArtifact("runtimeToggle", runtimeToggle), diagnosticArtifact("directHelperRetry", directHelperRetry)];
}

function diagnosticArtifact(label, lane) {
  return {
    lane: label,
    status: lane.status,
    timedOut: lane.timedOut,
    reportPath: lane.reportPath,
    stdoutPath: lane.stdoutPath,
    stderrPath: lane.stderrPath,
    stdoutBytes: lane.stdoutBytes,
    stderrBytes: lane.stderrBytes,
  };
}

function classifyLaneFailure(label, lane = {}, blockingIssues = []) {
  const text = [
    lane.stderrTail,
    lane.stdoutTail,
    ...(lane.check?.issues ?? []),
    ...blockingIssues,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  if (lane.timedOut === true) {
    return {
      failureClass: "lane_timeout",
      summary: `lane timed out after ${lane.timeoutMs ?? "unknown"}ms.`,
      nextAction:
        "Open the lane stdout/stderr artifacts, identify the last completed sub-step, and harden that path before raising the lane timeout.",
    };
  }
  if (/electron exited before exposing cdp|timed out waiting for electron cdp|timed out waiting for .*cdp target/.test(text)) {
    return {
      failureClass: "desktop_launch_cdp",
      summary: "Desktop launch or CDP target discovery failed.",
      nextAction:
        "Inspect the lane stderr artifact for Electron/Vite startup output, then harden the launch/CDP wait path or stale-process cleanup.",
    };
  }
  if (/configure .*snapshot|gmi cloud credential|api key/.test(text)) {
    return {
      failureClass: "environment_preflight",
      summary: "required GMI credential or snapshot environment was missing.",
      nextAction:
        "Rerun with the GMI key-file and snapshot environment from AGENTS.md; do not change retry behavior for an environment preflight failure.",
    };
  }
  if (label === "directHelperRetry" && /expected live ambient\/pi proof review after retry|got deterministic|proof review after retry/.test(text)) {
    return classifyDirectHelperRetryFailure(lane, text);
  }
  if (/did not produce a readable report|could not read/.test(text) || lane.observed === false) {
    return {
      failureClass: "missing_lane_report",
      summary: "the lane exited without a readable JSON report.",
      nextAction:
        "Use the lane stdout/stderr artifacts to find the failing sub-command, then make that sub-command fail with a structured report before broadening coverage.",
    };
  }
  if (label === "runtimeToggle") return classifyRuntimeToggleFailure(lane, text);
  if (label === "directHelperRetry") return classifyDirectHelperRetryFailure(lane, text);
  return {
    failureClass: "unknown",
    summary: "the aggregate gate reported a non-green lane.",
    nextAction: "Use diagnosticArtifacts and lane tails to classify the failure before changing product retry behavior.",
  };
}

function classifyReleaseDecisionFailure(blockingIssues = []) {
  const text = blockingIssues.filter(Boolean).join("\n").toLowerCase();
  if (/consecutive aggregate gate run/.test(text)) {
    return {
      failureClass: "repeated_recovery_pressure",
      summary: "green lanes repeatedly exceeded the forwarded-request pressure threshold.",
      nextAction:
        "Inspect releaseDecision.pressureTrend for the repeated high-pressure scenario, then harden that direct-helper path before broadening retry scope.",
    };
  }
  if (/retry-pressure threshold|forwarded gmi chat-completion/.test(text)) {
    return {
      failureClass: "recovery_pressure_threshold",
      summary: "green lanes exceeded the configured forwarded-request pressure threshold.",
      nextAction:
        "Inspect releaseDecision.stabilitySignals for the high-pressure scenario, then either harden that path or rerun with the advisory-only default.",
    };
  }
  return {
    failureClass: "release_decision_blocker",
    summary: "the aggregate release decision reported a blocker without a failed lane.",
    nextAction: "Inspect releaseDecision.blockingIssues and diagnosticArtifacts before changing retry behavior.",
  };
}

function classifyRuntimeToggleFailure(lane, text) {
  if (lane.providerId && lane.providerId !== "gmi-cloud") {
    return {
      failureClass: "runtime_provider_mismatch",
      summary: `runtime-toggle provider was ${lane.providerId}, expected gmi-cloud.`,
      nextAction: "Fix the GMI launch environment or provider selection before changing retry/session logic.",
    };
  }
  if (lane.runtimeSettingsActivity?.disposedSession !== true || /idle pi session was disposed/.test(text)) {
    return {
      failureClass: "runtime_session_reset_missing",
      summary: "aggressive-retry toggle did not prove idle Pi session disposal.",
      nextAction: "Inspect runtime-settings activity emission and AgentRuntime session disposal semantics for idle Pi sessions.",
    };
  }
  if (lane.baselineTokenSeen !== true || lane.toggledTokenSeen !== true) {
    return {
      failureClass: "runtime_live_turn_incomplete",
      summary: "baseline or post-toggle live token was not observed.",
      nextAction: "Inspect the runtime-toggle stdout/stderr artifacts and Pi transcript before changing direct-helper retry behavior.",
    };
  }
  return {
    failureClass: "runtime_toggle_gate_failure",
    summary: "runtime-toggle lane failed its gate assertions.",
    nextAction: "Start with runtime-toggle lane artifacts and harden the specific assertion that failed.",
  };
}

function classifyDirectHelperRetryFailure(lane, text) {
  if (/expected live ambient\/pi proof review after retry|got deterministic|proof review after retry/.test(text)) {
    return {
      failureClass: "direct_helper_proof_judgment",
      summary: "proof-judgment retry recovery completed with non-live proof-review evidence.",
      nextAction: "Inspect proof-judgment provider routing and deterministic fallback guards before changing source or charter retry paths.",
    };
  }
  if (lane.sourceClassificationComplete !== true) {
    return {
      failureClass: "direct_helper_source_classification",
      summary: "source-classification retry recovery was incomplete.",
      nextAction: "Inspect source-classification scenario output and failpoint proxy counts before changing charter/proof retry paths.",
    };
  }
  if (lane.charterSummaryComplete !== true) {
    return {
      failureClass: "direct_helper_charter_summary",
      summary: "charter-summary retry recovery was incomplete.",
      nextAction: "Inspect charter-summary operation detection, deterministic setup classification, and forwarded recovery counts.",
    };
  }
  if (lane.proofJudgmentComplete !== true) {
    return {
      failureClass: "direct_helper_proof_judgment",
      summary: "proof-judgment retry recovery was incomplete.",
      nextAction: "Inspect proof-judgment operation detection, proof review parsing, and provider timeout budget.",
    };
  }
  if (lane.scenarioCount !== 3) {
    return {
      failureClass: "direct_helper_incomplete_matrix",
      summary: `direct-helper scenario count was ${lane.scenarioCount ?? "missing"}, expected 3.`,
      nextAction: "Fix target selection or report aggregation so source, charter, and proof all run in the strict gate.",
    };
  }
  if (/stream stalled|without model content|did not start streaming/.test(text)) {
    return {
      failureClass: "direct_helper_stream_recovery",
      summary: "direct-helper stream recovery failed after a no-content or pre-stream stall.",
      nextAction: "Inspect retry metadata in the direct-helper report and harden the side-effect-free JSON helper retry path.",
    };
  }
  return {
    failureClass: "direct_helper_gate_failure",
    summary: "strict direct-helper retry lane failed its gate assertions.",
    nextAction: "Use the direct-helper phase report plus lane logs to identify whether source, charter, or proof failed first.",
  };
}

function laneArtifact(report, label) {
  return (report?.releaseDecision?.diagnosticArtifacts ?? []).find((artifact) => artifact?.lane === label);
}

function summarizeRuntimeToggleForTriage(lane = {}) {
  return {
    status: lane.status,
    providerId: lane.providerId,
    baselineTokenSeen: lane.baselineTokenSeen,
    toggledTokenSeen: lane.toggledTokenSeen,
    runtimeSettingsActivity: lane.runtimeSettingsActivity
      ? {
          status: lane.runtimeSettingsActivity.status,
          aggressiveRetries: lane.runtimeSettingsActivity.aggressiveRetries,
          disposedSession: lane.runtimeSettingsActivity.disposedSession,
          deferredSession: lane.runtimeSettingsActivity.deferredSession,
        }
      : undefined,
  };
}

function summarizeDirectHelperRetryForTriage(lane = {}) {
  return {
    status: lane.status,
    gateStatus: lane.gateStatus,
    required: lane.required,
    observed: lane.directHelperRetryObserved,
    scenarioCount: lane.scenarioCount,
    sourceClassificationComplete: lane.sourceClassificationComplete,
    charterSummaryComplete: lane.charterSummaryComplete,
    proofJudgmentComplete: lane.proofJudgmentComplete,
    sourceClassification: summarizeScenarioForTriage(lane.sourceClassification),
    charterSummary: summarizeScenarioForTriage(lane.charterSummary),
    proofJudgment: summarizeScenarioForTriage(lane.proofJudgment),
  };
}

function summarizeScenarioForTriage(scenario) {
  if (!scenario) return undefined;
  return {
    status: scenario.status,
    latestRunStatus: scenario.latestRunStatus,
    latestRunStage: scenario.latestRunStage,
    charterSummaryApplied: scenario.charterSummaryApplied,
    proofJudgmentApplied: scenario.proofJudgmentApplied,
    proofReviewReviewer: scenario.proofReviewReviewer,
    proofReviewStatus: scenario.proofReviewStatus,
    proofReviewRecommendedAction: scenario.proofReviewRecommendedAction,
    proofReviewSummary: scenario.proofReviewSummary,
    failpointTriggered: scenario.failpointTriggered,
    failpointLimit: scenario.failpointLimit,
    failpointTriggerCount: scenario.failpointTriggerCount,
    failpointClosedByClient: scenario.failpointClosedByClient,
    forwardedChatCompletionCount: scenario.forwardedChatCompletionCount,
    forwardedStreamChatCompletionCount: scenario.forwardedStreamChatCompletionCount,
    forwardedNonStreamChatCompletionCount: scenario.forwardedNonStreamChatCompletionCount,
    fallbackToNonStream: scenario.fallbackToNonStream === true,
    retryAttempt: scenario.retryEvent?.retryAttempt,
    maxRetries: scenario.retryEvent?.maxRetries,
    retryDelayMs: scenario.retryEvent?.retryDelayMs,
    error: scenario.error,
    issues: scenario.issues,
  };
}

function compactTail(text, limit = 3_000) {
  const value = String(text ?? "");
  return value.length > limit ? value.slice(-limit) : value;
}
