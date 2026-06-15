const REQUIRED_SCRIPTS = [
  ["test:workflow-recorder-jitter", "workflow recorder deterministic jitter gate"],
  ["test:workflow-recorder-release-gate", "workflow recorder release gate"],
  ["test:workflow-recorder-release-gate:unit", "workflow recorder release gate unit tests"],
  ["test:workflow-recorder:live", "workflow recorder live GMI smoke gate"],
];

const REQUIRED_DETERMINISTIC_TASKS = [
  "recorder-release-native",
  "recorder-ui-model",
  "recorder-tool-metadata",
  "recorder-html-plan-sanity",
];
const REQUIRED_LIVE_SCENARIO_IDS = [
  "web-research-date-night",
  "browser-navigation-proof",
  "gmail-summary-metadata",
  "local-file-classification",
  "ambient-cli-preflight",
];
const REQUIRED_LIVE_SCENARIO_COUNT = 5;

export function buildWorkflowRecorderReleaseGateReport(input = {}) {
  const now = input.now ? new Date(input.now) : new Date();
  const packageJson = objectValue(input.packageJson);
  const scripts = objectValue(packageJson.scripts);
  const jitterReport = objectValue(input.jitterReport);
  const jitterArchiveReport = input.jitterArchiveReport === undefined ? undefined : objectValue(input.jitterArchiveReport);
  const jitterArchiveReadError = stringValue(input.jitterArchiveReadError);
  const planHtml = typeof input.planHtml === "string" ? input.planHtml : "";
  const requireLive = input.requireLive === true;
  const maxAgeMinutes = nonNegativeNumber(input.maxAgeMinutes, 24 * 60);
  const checks = [
    ...scriptChecks(scripts),
    planCheck(planHtml),
    jitterSchemaCheck(jitterReport),
    jitterArchiveCheck(jitterReport, jitterArchiveReport, jitterArchiveReadError),
    sourceRevisionCheck(jitterReport, input.currentGitHead),
    sourceTrackedCleanCheck(jitterReport, input.currentTrackedStatusLines),
    jitterFreshnessCheck(jitterReport, now, maxAgeMinutes),
    deterministicTaskCheck(jitterReport),
    jitterOutcomeCheck(jitterReport),
    liveCheck(jitterReport, requireLive),
  ];
  const blockingIssues = checks.filter((check) => check.status === "fail").flatMap((check) => check.issues);
  const advisoryIssues = checks.filter((check) => check.status === "warn").flatMap((check) => check.warnIssues);
  const liveSkipped = Number(jitterReport.liveCount ?? 0) === 0;
  const status = blockingIssues.length > 0 ? "attention" : liveSkipped ? "passed_with_live_skipped" : "passed";
  const diagnosticArtifacts = diagnosticArtifactList({
    jitterReportPath: input.jitterReportPath,
    jitterArchivePath: stringValue(jitterReport.archivePath),
    outputPath: input.outputPath,
    markdownPath: input.markdownPath,
    releaseArchivePath: input.releaseArchivePath,
    releaseArchiveMarkdownPath: input.releaseArchiveMarkdownPath,
  });
  return {
    schemaVersion: 1,
    status,
    focus: "Workflow Recorder release gate: deterministic recorder path, jittered replay retrieval, visible injection, and live-smoke readiness.",
    generatedAt: input.generatedAt ?? now.toISOString(),
    jitterReportPath: input.jitterReportPath,
    policy: {
      maxAgeMinutes,
      requireLive,
      requiredDeterministicTasks: REQUIRED_DETERMINISTIC_TASKS,
      requiredLiveScenarioCount: REQUIRED_LIVE_SCENARIO_COUNT,
      requiredLiveScenarioIds: REQUIRED_LIVE_SCENARIO_IDS,
    },
    jitter: compactJitterReport(jitterReport),
    checks,
    releaseDecision: {
      ready: status === "passed" || status === "passed_with_live_skipped",
      liveRequired: requireLive,
      liveSkipped,
      blockingIssues,
      advisoryIssues,
      diagnosticArtifacts,
      nextSlice:
        blockingIssues.length > 0
          ? "Fix the blocking Workflow Recorder release-gate issue(s), rerun the deterministic jitter gate, and do not expand recorder scope until it is green."
          : liveSkipped
            ? "Deterministic Workflow Recorder release gate is green. The next Phase 6 slice should add and run the short live GMI recorder smoke profile."
            : "Workflow Recorder release gate is green with live GMI evidence; continue toward release signoff and regression monitoring.",
    },
  };
}

export function workflowRecorderReleaseGatePassed(report, options = {}) {
  if (!report || report.releaseDecision?.ready !== true) return false;
  if (options.requireLive === true && report.releaseDecision.liveSkipped === true) return false;
  return report.status === "passed" || (!options.requireLive && report.status === "passed_with_live_skipped");
}

export function workflowRecorderReleaseArtifactIntegrity(input = {}) {
  const report = objectValue(input.report);
  const expectedJson = `${JSON.stringify(report, null, 2)}\n`;
  const expectedMarkdown = renderWorkflowRecorderReleaseGateMarkdown(report);
  const artifacts = [
    { label: "release gate latest JSON", path: input.outputPath, expected: expectedJson, actual: input.outputJson },
    { label: "release gate latest Markdown", path: input.markdownPath, expected: expectedMarkdown, actual: input.markdownText },
    { label: "release gate archive JSON", path: input.releaseArchivePath, expected: expectedJson, actual: input.releaseArchiveJson },
    {
      label: "release gate archive Markdown",
      path: input.releaseArchiveMarkdownPath,
      expected: expectedMarkdown,
      actual: input.releaseArchiveMarkdownText,
    },
  ].filter((artifact) => artifact.path);
  const issues = artifacts.flatMap((artifact) => {
    if (typeof artifact.actual !== "string") return [`${artifact.label} was not read back from ${artifact.path}.`];
    if (artifact.actual !== artifact.expected) return [`${artifact.label} read-back content does not match the generated report.`];
    return [];
  });
  return {
    status: issues.length ? "fail" : "pass",
    issues,
    checkedArtifacts: artifacts.map((artifact) => ({ label: artifact.label, path: artifact.path })),
  };
}

export function renderWorkflowRecorderReleaseGateMarkdown(report) {
  const lines = [
    "# Workflow Recorder Release Gate",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Jitter report: ${report.jitterReportPath ?? "unknown"}`,
    "",
    "## Decision",
    "",
    `- Ready: ${report.releaseDecision.ready ? "yes" : "no"}`,
    `- Live required: ${report.releaseDecision.liveRequired ? "yes" : "no"}`,
    `- Live skipped: ${report.releaseDecision.liveSkipped ? "yes" : "no"}`,
    `- Next slice: ${report.releaseDecision.nextSlice}`,
    "",
    "## Artifacts",
    "",
    "| Artifact | Path |",
    "| --- | --- |",
    ...(report.releaseDecision.diagnosticArtifacts ?? []).map((artifact) =>
      `| ${escapeMarkdownCell(artifact.label)} | ${escapeMarkdownCell(artifact.path)} |`,
    ),
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
      issues: script ? [] : [`${label} command is registered.`],
    });
  });
}

function planCheck(planHtml) {
  const required = [
    "Phase 6: Dogfood and release gate",
    "workflow-recorder-jitter.mjs",
    "workflow-recorder-release-gate.mjs",
    "recorder release gate passes deterministic",
  ];
  const missing = required.filter((marker) => !planHtml.includes(marker));
  return check({
    id: "plan.phase6",
    area: "plan",
    status: missing.length ? "fail" : "pass",
    label: "workflowRecorder.html documents the Phase 6 release gate commands and status",
    evidence: missing.length ? [`missing markers: ${missing.join(", ")}`] : ["Phase 6 deterministic release gate markers are present."],
    issues: missing.map((marker) => `workflowRecorder.html is missing Phase 6 marker: ${marker}`),
  });
}

function jitterSchemaCheck(report) {
  const issues = [];
  if (report.schemaVersion !== 1) issues.push("Workflow Recorder jitter report schemaVersion must be 1.");
  if (!report.runId) issues.push("Workflow Recorder jitter report is missing runId.");
  if (!Array.isArray(report.tasks)) issues.push("Workflow Recorder jitter report is missing tasks.");
  return check({
    id: "jitter.schema",
    area: "jitter",
    status: issues.length ? "fail" : "pass",
    label: "workflow recorder jitter report has the expected schema",
    evidence: [`runId: ${report.runId ?? "missing"}`, `schemaVersion: ${report.schemaVersion ?? "missing"}`],
    issues,
  });
}

function jitterArchiveCheck(report, archiveReport, archiveReadError) {
  const archivePath = stringValue(report.archivePath);
  const runId = stringValue(report.runId);
  const issues = [];
  if (!archivePath) issues.push("Workflow Recorder jitter report is missing archivePath.");
  if (archivePath && runId && !archivePath.includes(runId)) {
    issues.push("Workflow Recorder jitter archivePath must include the jitter runId.");
  }
  if (archivePath && archiveReadError) {
    issues.push(`Workflow Recorder jitter archive could not be read: ${archiveReadError}`);
  }
  if (archivePath && !archiveReadError && archiveReport === undefined) {
    issues.push("Workflow Recorder jitter archive was not loaded for release-gate verification.");
  }
  if (archivePath && !archiveReadError && archiveReport !== undefined) {
    issues.push(...jitterArchiveContentIssues(report, archiveReport));
  }
  return check({
    id: "jitter.archive",
    area: "jitter",
    status: issues.length ? "fail" : "pass",
    label: "workflow recorder jitter evidence is archived by run id",
    evidence: [
      `archivePath: ${archivePath ?? "missing"}`,
      `archiveRunId: ${archiveReport?.runId ?? "not loaded"}`,
      `archiveTasks: ${Array.isArray(archiveReport?.tasks) ? archiveReport.tasks.length : "not loaded"}`,
    ],
    issues,
  });
}

function sourceRevisionCheck(report, currentGitHead) {
  const reportGitHead = stringValue(report.source?.gitHead);
  const expectedGitHead = stringValue(currentGitHead);
  const issues = [];
  if (expectedGitHead && !reportGitHead) {
    issues.push("Workflow Recorder jitter report is missing source.gitHead.");
  }
  if (expectedGitHead && reportGitHead && reportGitHead !== expectedGitHead) {
    issues.push(`Workflow Recorder jitter report was generated for git ${reportGitHead}; current git is ${expectedGitHead}.`);
  }
  return check({
    id: "source.git-head",
    area: "source",
    status: issues.length ? "fail" : "pass",
    label: "workflow recorder jitter evidence matches the current git revision",
    evidence: [`reportGitHead: ${reportGitHead ?? "missing"}`, `currentGitHead: ${expectedGitHead ?? "not checked"}`],
    issues,
  });
}

function sourceTrackedCleanCheck(report, currentTrackedStatusLines) {
  const reportLines = stringArrayValue(report.source?.trackedStatusLines);
  const currentLines = currentTrackedStatusLines === undefined ? undefined : stringArrayValue(currentTrackedStatusLines);
  const issues = [];
  if (currentLines && !Array.isArray(report.source?.trackedStatusLines)) {
    issues.push("Workflow Recorder jitter report is missing source.trackedStatusLines.");
  }
  if (reportLines.length > 0 || report.source?.trackedDirty === true) {
    issues.push(`Workflow Recorder jitter report was generated with tracked source changes: ${statusPreview(reportLines)}.`);
  }
  if (currentLines && currentLines.length > 0) {
    issues.push(`Workflow Recorder release gate is running with tracked source changes: ${statusPreview(currentLines)}.`);
  }
  return check({
    id: "source.tracked-clean",
    area: "source",
    status: issues.length ? "fail" : "pass",
    label: "workflow recorder release evidence uses a clean tracked source tree",
    evidence: [
      `reportTrackedChanges: ${reportLines.length}`,
      `currentTrackedChanges: ${currentLines ? currentLines.length : "not checked"}`,
      ...(reportLines.length ? [`reportTrackedPreview: ${statusPreview(reportLines)}`] : []),
      ...(currentLines?.length ? [`currentTrackedPreview: ${statusPreview(currentLines)}`] : []),
    ],
    issues,
  });
}

function jitterFreshnessCheck(report, now, maxAgeMinutes) {
  const generatedAt = report.generatedAt ? new Date(report.generatedAt) : undefined;
  const issues = [];
  let ageMinutes;
  if (!generatedAt || Number.isNaN(generatedAt.getTime())) {
    issues.push("Workflow Recorder jitter report has no valid generatedAt timestamp.");
  } else {
    ageMinutes = Math.round(((now.getTime() - generatedAt.getTime()) / 60_000) * 100) / 100;
    if (ageMinutes > maxAgeMinutes) issues.push(`Workflow Recorder jitter report is stale: ${ageMinutes} minutes old; max is ${maxAgeMinutes}.`);
    if (ageMinutes < -5) issues.push(`Workflow Recorder jitter report is from the future by ${Math.abs(ageMinutes)} minutes.`);
  }
  return check({
    id: "jitter.freshness",
    area: "jitter",
    status: issues.length ? "fail" : "pass",
    label: "workflow recorder jitter report is fresh enough for merge gating",
    evidence: [`generatedAt: ${report.generatedAt ?? "missing"}`, `ageMinutes: ${ageMinutes ?? "unknown"}`, `maxAgeMinutes: ${maxAgeMinutes}`],
    issues,
  });
}

function deterministicTaskCheck(report) {
  const tasks = Array.isArray(report.tasks) ? report.tasks : [];
  const passed = new Set(tasks.filter((task) => task.tier === "deterministic" && task.status === "passed").map((task) => task.id));
  const missing = REQUIRED_DETERMINISTIC_TASKS.filter((taskId) => !passed.has(taskId));
  return check({
    id: "jitter.deterministic-tasks",
    area: "jitter",
    status: missing.length ? "fail" : "pass",
    label: "deterministic recorder tasks passed",
    evidence: [`passed deterministic tasks: ${Array.from(passed).join(", ") || "none"}`],
    issues: missing.map((taskId) => `Workflow Recorder jitter report is missing passed deterministic task: ${taskId}.`),
  });
}

function jitterOutcomeCheck(report) {
  const tasks = Array.isArray(report.tasks) ? report.tasks : [];
  const failed = tasks.filter((task) => task.status !== "passed" && task.status !== "skipped");
  const issues = failed.map((task) => `${task.id} failed: ${task.message ?? "no failure message"}`);
  return check({
    id: "jitter.outcomes",
    area: "jitter",
    status: issues.length ? "fail" : "pass",
    label: "workflow recorder jitter tasks have no blocking failures",
    evidence: [`passed: ${report.passedCount ?? 0}/${report.taskCount ?? tasks.length}`, `failed: ${failed.length}`],
    issues,
  });
}

function liveCheck(report, requireLive) {
  const liveCount = Number(report.liveCount ?? 0);
  const liveScenarioCount = Number(report.liveScenarioCount ?? liveScenarioCountFromTasks(report.tasks));
  const liveScenarioIds = liveScenarioIdsFromTasks(report.tasks);
  const missingScenarioIds = REQUIRED_LIVE_SCENARIO_IDS.filter((id) => !liveScenarioIds.has(id));
  const issues = [];
  const warnIssues = [];
  if (requireLive && liveCount === 0) issues.push("Live Workflow Recorder rows are required but missing.");
  if (requireLive && liveCount > 0 && liveScenarioCount < REQUIRED_LIVE_SCENARIO_COUNT) {
    issues.push(
      `Live Workflow Recorder scenario coverage is too narrow: ${liveScenarioCount} scenario(s); required ${REQUIRED_LIVE_SCENARIO_COUNT}.`,
    );
  }
  if (requireLive && liveCount > 0 && missingScenarioIds.length > 0) {
    issues.push(`Live Workflow Recorder scenario ids are missing: ${missingScenarioIds.join(", ")}.`);
  }
  if (!requireLive && liveCount === 0) warnIssues.push("Live Workflow Recorder rows were skipped for this deterministic gate.");
  return check({
    id: "jitter.live",
    area: "live",
    status: issues.length ? "fail" : warnIssues.length ? "warn" : "pass",
    label: "workflow recorder live GMI smoke coverage",
    evidence: [
      `liveRows: ${liveCount}`,
      `liveScenarios: ${liveScenarioCount}`,
      `liveScenarioIds: ${Array.from(liveScenarioIds).join(", ") || "none"}`,
    ],
    issues,
    warnIssues,
  });
}

function compactJitterReport(report) {
  const tasks = Array.isArray(report.tasks) ? report.tasks : [];
  return {
    runId: report.runId,
    archivePath: report.archivePath,
    profile: report.profile,
    generatedAt: report.generatedAt,
    source: {
      gitHead: report.source?.gitHead,
      trackedDirty: report.source?.trackedDirty,
      trackedStatusCount: stringArrayValue(report.source?.trackedStatusLines).length,
    },
    taskCount: report.taskCount ?? tasks.length,
    passedCount: report.passedCount,
    liveCount: report.liveCount ?? 0,
    liveScenarioCount: report.liveScenarioCount ?? liveScenarioCountFromTasks(tasks),
    liveScenarioIds: Array.from(liveScenarioIdsFromTasks(tasks)),
    tasks: tasks.map((task) => ({
      id: task.id,
      tier: task.tier,
      status: task.status,
      durationMs: task.durationMs,
      ...(task.scenarioCount !== undefined ? { scenarioCount: task.scenarioCount } : {}),
      ...(Array.isArray(task.scenarioIds) ? { scenarioIds: task.scenarioIds } : {}),
    })),
  };
}

function liveScenarioCountFromTasks(tasks) {
  return Array.isArray(tasks)
    ? tasks
        .filter((task) => task?.tier === "live" && task?.status === "passed")
        .reduce((total, task) => total + Math.max(0, Math.floor(Number(task.scenarioCount ?? 0))), 0)
    : 0;
}

function liveScenarioIdsFromTasks(tasks) {
  const ids = new Set();
  if (!Array.isArray(tasks)) return ids;
  for (const task of tasks) {
    if (task?.tier !== "live" || task?.status !== "passed" || !Array.isArray(task.scenarioIds)) continue;
    for (const id of task.scenarioIds) {
      if (typeof id === "string" && id.trim()) ids.add(id.trim());
    }
  }
  return ids;
}

function jitterArchiveContentIssues(report, archiveReport) {
  const reportSignature = jitterEvidenceSignature(report);
  const archiveSignature = jitterEvidenceSignature(archiveReport);
  return reportSignature === archiveSignature
    ? []
    : ["Workflow Recorder jitter archive content must match the latest jitter report for the same run."];
}

function jitterEvidenceSignature(report) {
  const tasks = Array.isArray(report.tasks) ? report.tasks : [];
  return JSON.stringify({
    schemaVersion: report.schemaVersion,
    runId: report.runId,
    archivePath: report.archivePath,
    generatedAt: report.generatedAt,
    profile: report.profile,
    seedCount: report.seedCount,
    provider: report.provider,
    source: {
      gitHead: report.source?.gitHead,
      trackedDirty: report.source?.trackedDirty,
      trackedStatusLines: stringArrayValue(report.source?.trackedStatusLines),
    },
    taskCount: report.taskCount,
    passedCount: report.passedCount,
    liveCount: report.liveCount,
    liveScenarioCount: report.liveScenarioCount,
    tasks: tasks.map((task) => ({
      id: task.id,
      tier: task.tier,
      status: task.status,
      scenarioCount: task.scenarioCount,
      scenarioIds: Array.isArray(task.scenarioIds) ? [...task.scenarioIds] : undefined,
    })),
  });
}

function check(input) {
  return {
    id: input.id,
    area: input.area,
    label: input.label,
    status: input.status,
    evidence: input.evidence ?? [],
    issues: input.status === "fail" ? input.issues ?? [] : [],
    warnIssues: input.status === "warn" ? input.warnIssues ?? [] : [],
  };
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayValue(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function statusPreview(lines) {
  const visible = lines.slice(0, 8);
  const suffix = lines.length > visible.length ? `; +${lines.length - visible.length} more` : "";
  return `${visible.join("; ") || "none"}${suffix}`;
}

function nonNegativeNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function diagnosticArtifactList(input) {
  return [
    input.jitterReportPath ? { label: "jitter latest", path: input.jitterReportPath } : undefined,
    input.jitterArchivePath ? { label: "jitter archive", path: input.jitterArchivePath } : undefined,
    input.outputPath ? { label: "release gate latest", path: input.outputPath } : undefined,
    input.markdownPath ? { label: "release gate markdown", path: input.markdownPath } : undefined,
    input.releaseArchivePath ? { label: "release gate archive", path: input.releaseArchivePath } : undefined,
    input.releaseArchiveMarkdownPath ? { label: "release gate archive markdown", path: input.releaseArchiveMarkdownPath } : undefined,
  ].filter(Boolean);
}
