export function buildPlannerModeReleaseGateReport(input = {}) {
  const packageJson = objectValue(input.packageJson);
  const scripts = objectValue(packageJson.scripts);
  const files = objectValue(input.files);
  const liveResults = Array.isArray(input.liveResults) ? input.liveResults : [];
  const requireLive = input.requireLive === true;
  const requireCurrentHead = input.requireCurrentHead === true;
  const checks = [
    ...scriptChecks(scripts),
    ...harnessChecks(files.plannerDogfoodTest ?? ""),
    ...runtimeChecks(files.agentRuntime ?? ""),
    ...decisionPersistenceChecks(files.agentRuntime ?? "", files.projectStore ?? ""),
    ...planChecks(files.planningModeEnhancements ?? ""),
    ...freshnessChecks(input.sourceRevision, requireCurrentHead),
    ...liveChecks(liveResults, requireLive),
  ];
  const blockingIssues = checks.filter((check) => check.status === "fail").flatMap((check) => check.issues);
  const advisoryIssues = checks.filter((check) => check.status === "warn").flatMap((check) => check.warnIssues);
  const liveSelected = liveResults.length > 0;
  const status = blockingIssues.length > 0 ? "attention" : liveSelected ? "passed" : "passed_with_live_skipped";
  return {
    version: 1,
    status,
    focus: "Planning Mode release gate: native decisions, durable HTML, repair/fallback, and live dogfood coverage.",
    generatedAt: input.completedAt ?? new Date().toISOString(),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    sourceRevision: input.sourceRevision,
    checks,
    live: {
      selected: liveSelected,
      required: requireLive,
      results: liveResults.map((result) => ({
        name: result.name,
        script: result.script,
        status: result.status,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        signal: result.signal,
      })),
    },
    releaseDecision: {
      ready: status === "passed" || status === "passed_with_live_skipped",
      liveDogfoodRequired: requireLive,
      liveDogfoodSkipped: !liveSelected,
      blockingIssues,
      advisoryIssues,
      nextSlice:
        blockingIssues.length > 0
          ? "Fix the blocking planner release-gate issue(s), then rerun the focused gate before treating Planning Mode as complete."
          : liveSelected
            ? "Planning Mode release gate is green with live dogfood evidence; use this gate when changing planner prompts, artifacts, validation, or runtime finalization."
            : "Static planner release gate is green; run with --run-live before release-critical planner/runtime changes.",
    },
  };
}

export function plannerModeReleaseGatePassed(report, options = {}) {
  if (!report || report.releaseDecision?.ready !== true) return false;
  if (options.requireLive === true && report.live?.selected !== true) return false;
  return report.status === "passed" || (!options.requireLive && report.status === "passed_with_live_skipped");
}

function scriptChecks(scripts) {
  const required = [
    ["test:planner-dogfood", "default planner dogfood harness"],
    ["test:planner-dogfood:live", "small one-decision live dogfood"],
    ["test:planner-dogfood:repair-live", "malformed-diagram repair live dogfood"],
    ["test:planner-dogfood:medium-live", "medium multi-decision live dogfood"],
    ["test:planner-release-gate", "planner release gate"],
    ["test:planner-release-gate:live", "planner release gate live sweep"],
    ["typecheck", "TypeScript typecheck"],
  ];
  return required.map(([name, label]) => {
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

function harnessChecks(text) {
  return [
    check({
      id: "harness.live-small",
      area: "dogfood",
      status: text.includes("AMBIENT_PLANNER_DOGFOOD_LIVE") && text.includes("question capture, answer finalization") ? "pass" : "fail",
      label: "small live planner dogfood remains wired",
      evidence: ["expects AMBIENT_PLANNER_DOGFOOD_LIVE and the one-decision durable flow"],
    }),
    check({
      id: "harness.live-repair",
      area: "dogfood",
      status: text.includes("AMBIENT_PLANNER_DOGFOOD_REPAIR_LIVE") && text.includes("dogfood-injected-malformed-diagram") ? "pass" : "fail",
      label: "repair live planner dogfood remains wired",
      evidence: ["expects malformed diagram injection and repair validation"],
    }),
    check({
      id: "harness.live-medium",
      area: "dogfood",
      status:
        text.includes("AMBIENT_PLANNER_DOGFOOD_MEDIUM_LIVE") &&
        text.includes("exactly two required questions") &&
        text.includes("plannerDogfoodMissingDiagramKinds")
          ? "pass"
          : "fail",
      label: "medium multi-decision live planner dogfood remains wired",
      evidence: ["expects two native required decisions and diagram-rich durable output"],
    }),
    check({
      id: "harness.diagnostics",
      area: "dogfood",
      status: text.includes("artifact before refinement") && text.includes("artifact after refinement") && text.includes("plannerRuntimeDiagnostic") ? "pass" : "fail",
      label: "live dogfood emits actionable planner diagnostics",
      evidence: ["artifact state logs and transcript/runtime diagnostics are present"],
    }),
  ];
}

function runtimeChecks(text) {
  return [
    check({
      id: "runtime.terminal-prompt-grace",
      area: "runtime",
      status: text.includes("ASSISTANT_TERMINAL_PROMPT_GRACE_MS") && text.includes("finalizeAssistantTerminalRun") ? "pass" : "fail",
      label: "runtime finalizes visible terminal assistant turns when prompt promises stall",
      evidence: ["ASSISTANT_TERMINAL_PROMPT_GRACE_MS", "finalizeAssistantTerminalRun"],
    }),
    check({
      id: "runtime.terminal-text-idle",
      area: "runtime",
      status: text.includes("ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS") && text.includes("scheduleAssistantTerminalCompletion(ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS)") ? "pass" : "fail",
      label: "runtime finalizes trailing assistant text streams without terminal events",
      evidence: ["ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS"],
    }),
    check({
      id: "runtime.continuation-steer",
      area: "runtime",
      status: text.includes("session.steer(postToolIdleContinuationPrompt") && text.includes("assistantTerminalCompletion") ? "pass" : "fail",
      label: "post-tool continuation steer participates in terminal-turn finalization",
      evidence: ["steer promise races assistant terminal completion"],
    }),
    check({
      id: "runtime.tool-cancels-terminal",
      area: "runtime",
      status: countOccurrences(text, "clearAssistantTerminalCompletion();") >= 4 ? "pass" : "fail",
      label: "tool activity cancels assistant terminal timers",
      evidence: [`clearAssistantTerminalCompletion occurrences: ${countOccurrences(text, "clearAssistantTerminalCompletion();")}`],
    }),
  ];
}

function decisionPersistenceChecks(agentRuntimeText, projectStoreText) {
  return [
    check({
      id: "decisions.finalization-merge",
      area: "planner-artifacts",
      status:
        agentRuntimeText.includes("plannerDecisionQuestionsForFinalArtifact") &&
        agentRuntimeText.includes("isPlannerFinalizationResponse") &&
        agentRuntimeText.includes("inheritedQuestions")
          ? "pass"
          : "fail",
      label: "finalization artifacts inherit answered native decisions",
      evidence: ["plannerDecisionQuestionsForFinalArtifact"],
    }),
    check({
      id: "decisions.copy-answers",
      area: "planner-artifacts",
      status:
        projectStoreText.includes("question.answer?.kind") &&
        projectStoreText.includes("question.answer?.kind === \"option\"") &&
        projectStoreText.includes("question.answer?.answeredAt")
          ? "pass"
          : "fail",
      label: "copied planner decision questions preserve answer columns",
      evidence: ["ProjectStore.createPlannerPlanArtifact answer persistence"],
    }),
  ];
}

function planChecks(text) {
  return [
    check({
      id: "plan.phase6-complete",
      area: "plan",
      status: text.includes("Phase 6 complete") && text.includes("Medium live dogfood passed") ? "pass" : "fail",
      label: "planningModeEnhancements records Phase 6 completion",
      evidence: ["Phase 6 completion and medium live dogfood progress are documented"],
    }),
    check({
      id: "plan.release-gate",
      area: "plan",
      status: text.includes("planner release gate") || text.includes("release gate") ? "pass" : "warn",
      label: "planningModeEnhancements records release-gate usage",
      evidence: ["release-gate language appears in the plan"],
      warnIssues: ["Planning Mode plan does not mention the planner release gate."],
    }),
  ];
}

function freshnessChecks(sourceRevision, requireCurrentHead) {
  const revision = objectValue(sourceRevision);
  if (!requireCurrentHead) return [];
  const issues = [];
  if (!revision.gitHead) issues.push("Current git head was not available for strict planner release-gate freshness.");
  if (revision.dirty) issues.push("Current worktree has tracked uncommitted changes; strict planner release-gate freshness requires a clean source tree.");
  return [
    check({
      id: "freshness.current-head",
      area: "freshness",
      status: issues.length ? "fail" : "pass",
      label: "strict planner release gate has a current clean source revision",
      evidence: [`gitHead: ${revision.gitHead ?? "missing"}`, `dirty: ${String(Boolean(revision.dirty))}`],
      issues,
    }),
  ];
}

function liveChecks(results, requireLive) {
  if (results.length === 0) {
    return [
      check({
        id: "live.selected",
        area: "live",
        status: requireLive ? "fail" : "warn",
        label: "live planner dogfoods were selected for this release gate",
        evidence: ["use --run-live, --run-small-live, --run-repair-live, or --run-medium-live"],
        issues: requireLive ? ["Live planner dogfoods were required but not selected."] : [],
        warnIssues: requireLive ? [] : ["Live planner dogfoods were skipped for this static gate run."],
      }),
    ];
  }
  return results.map((result) =>
    check({
      id: `live.${result.name}`,
      area: "live",
      status: result.status === "passed" ? "pass" : "fail",
      label: `${result.name} live planner dogfood passed`,
      evidence: [`script: ${result.script}`, `durationMs: ${result.durationMs ?? "unknown"}`, `exitCode: ${result.exitCode ?? "none"}`],
      issues: result.status === "passed" ? [] : [`${result.name} live dogfood failed with exit code ${result.exitCode ?? "none"}.`],
    }),
  );
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

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    index = text.indexOf(needle, index);
    if (index < 0) return count;
    count += 1;
    index += needle.length;
  }
}
