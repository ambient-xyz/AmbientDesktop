import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { nativeRebuildEnvironmentBlockerFromOutput } from "./native-rebuild-lock-lib.mjs";
import {
  REQUIRED_DESKTOP_DOGFOOD_SCENARIOS,
  REQUIRED_DESKTOP_MATURITY_ASSERTIONS,
  REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS,
  REQUIRED_DESKTOP_VISUAL_ASSERTIONS,
} from "./subagent-desktop-dogfood-evidence-contract.mjs";

export const SUBAGENT_LIVE_CONFIDENCE_RUNNER_SCHEMA_VERSION = "ambient-subagent-live-confidence-runner-v1";
export const SUBAGENT_LIVE_CONFIDENCE_EVIDENCE_SCHEMA_VERSION = "ambient-subagent-live-confidence-evidence-v3";
export const DEFAULT_SUBAGENT_LIVE_CONFIDENCE_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_SUBAGENT_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/latest.json";
export const DEFAULT_SUBAGENT_WORKFLOW_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/workflow-symphony-latest.json";
export const DEFAULT_SUBAGENT_WORKFLOW_BROADER_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/workflow-symphony-broader-latest.json";
export const DEFAULT_SUBAGENT_LOCAL_RUNTIME_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/local-runtime-latest.json";
export const DEFAULT_SUBAGENT_RESTART_REPAIR_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/restart-repair-latest.json";
export const DEFAULT_SUBAGENT_LIFECYCLE_EDGE_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/lifecycle-edges-latest.json";
export const DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/desktop-dogfood-latest.json";
export const DEFAULT_SUBAGENT_LIVE_SMOKE_ARTIFACT_PATH = "test-results/subagent-live-smoke/latest.json";
export const DEFAULT_SUBAGENT_AUTHORITY_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/child-authority-latest.json";
export const DEFAULT_SUBAGENT_LIVE_LONG_CONTEXT_AUTHORITY_ARTIFACT_PATH = "test-results/subagent-live-smoke/long-context-authority-latest.json";
export const DEFAULT_SUBAGENT_LIVE_APPROVAL_AUTHORITY_ARTIFACT_PATH = "test-results/subagent-live-smoke/approval-authority-latest.json";
export const DEFAULT_SUBAGENT_LIVE_BROWSER_APPROVAL_ARTIFACT_PATH = "test-results/subagent-live-smoke/browser-approval-latest.json";
export const DEFAULT_SUBAGENT_LIVE_WORKFLOW_ARTIFACT_PATH = "test-results/workflow-local-file-run-dogfood/latest.json";
export const DEFAULT_SUBAGENT_WORKFLOW_UI_DOGFOOD_ARTIFACT_PATH = "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json";
export const DEFAULT_SUBAGENT_WORKFLOW_BROADER_UI_DOGFOOD_ARTIFACT_PATH = "test-results/workflow-agent-thread-ui-dogfood/phase1-live-matrix-latest.json";
export const DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_DOGFOOD_ARTIFACT_PATH = "test-results/callable-workflow-dogfood/latest.json";
export const DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_REHYDRATION_ARTIFACT_PATH = "test-results/callable-workflow-rehydration/latest.json";
export const DEFAULT_SUBAGENT_LIVE_LOCAL_RUNTIME_ARTIFACT_PATH = "test-results/local-runtime-control-proof/latest.json";
export const DEFAULT_SUBAGENT_LIVE_LOCAL_RUNTIME_GATE_ARTIFACT_PATH = "test-results/local-runtime-control-proof-gate/latest.json";
export const DEFAULT_SUBAGENT_LIVE_RESTART_REPAIR_ARTIFACT_PATH = "test-results/subagent-replay-diagnostics/latest.json";
export const DEFAULT_SUBAGENT_LIVE_RESTART_REPAIR_FIXTURE_ARTIFACT_PATH = "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json";
export const DEFAULT_SUBAGENT_LIFECYCLE_EDGE_ARTIFACT_PATH = "test-results/subagent-lifecycle-edges/latest.json";
export const DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_ARTIFACT_PATH = "test-results/subagent-desktop-dogfood/latest.json";

const REQUIRED_BASELINE_WORKFLOW_UI_DOGFOOD_SCENARIOS = ["vocabulary-quiz", "local-file-classifier"];
const REQUIRED_BROADER_WORKFLOW_UI_DOGFOOD_SCENARIOS = [
  "gmail-20-metadata-readonly-validation",
  "downloads-document-categorization",
  "public-source-browser",
  "current-web-recipe-report",
];

export function buildSubagentLiveConfidencePlan(input = {}) {
  const sliceKind = input.sliceKind ?? "pi_tool_prompt";
  const defaults = liveConfidenceDefaultsForSliceKind(sliceKind);
  const outputPath = input.outputPath ?? defaults.outputPath ?? DEFAULT_SUBAGENT_LIVE_CONFIDENCE_OUTPUT_PATH;
  const timeoutMs = positiveInteger(input.timeoutMs, DEFAULT_SUBAGENT_LIVE_CONFIDENCE_TIMEOUT_MS);
  return {
    schemaVersion: SUBAGENT_LIVE_CONFIDENCE_RUNNER_SCHEMA_VERSION,
    sliceId: input.sliceId ?? defaults.sliceId,
    sliceKind,
    providerId: input.providerId ?? defaults.providerId ?? "ambient",
    hypothesis: input.hypothesis ?? defaults.hypothesis,
    expectedObservation: input.expectedObservation ?? defaults.expectedObservation,
    outputPath,
    ...(input.liveSmokeArtifactPath ?? defaults.liveSmokeArtifactPath
      ? { liveSmokeArtifactPath: input.liveSmokeArtifactPath ?? defaults.liveSmokeArtifactPath }
      : {}),
    ...(input.liveLongContextAuthorityArtifactPath ?? defaults.liveLongContextAuthorityArtifactPath
      ? { liveLongContextAuthorityArtifactPath: input.liveLongContextAuthorityArtifactPath ?? defaults.liveLongContextAuthorityArtifactPath }
      : {}),
    ...(input.liveApprovalAuthorityArtifactPath ?? defaults.liveApprovalAuthorityArtifactPath
      ? { liveApprovalAuthorityArtifactPath: input.liveApprovalAuthorityArtifactPath ?? defaults.liveApprovalAuthorityArtifactPath }
      : {}),
    ...(input.liveBrowserApprovalArtifactPath ?? defaults.liveBrowserApprovalArtifactPath
      ? { liveBrowserApprovalArtifactPath: input.liveBrowserApprovalArtifactPath ?? defaults.liveBrowserApprovalArtifactPath }
      : {}),
    ...(input.liveWorkflowArtifactPath ?? defaults.liveWorkflowArtifactPath
      ? { liveWorkflowArtifactPath: input.liveWorkflowArtifactPath ?? defaults.liveWorkflowArtifactPath }
      : {}),
    ...(input.liveWorkflowUiDogfoodArtifactPath ?? defaults.liveWorkflowUiDogfoodArtifactPath
      ? { liveWorkflowUiDogfoodArtifactPath: input.liveWorkflowUiDogfoodArtifactPath ?? defaults.liveWorkflowUiDogfoodArtifactPath }
      : {}),
    ...(input.liveCallableWorkflowDogfoodArtifactPath ?? defaults.liveCallableWorkflowDogfoodArtifactPath
      ? { liveCallableWorkflowDogfoodArtifactPath: input.liveCallableWorkflowDogfoodArtifactPath ?? defaults.liveCallableWorkflowDogfoodArtifactPath }
      : {}),
    ...(input.liveCallableWorkflowRehydrationArtifactPath ?? defaults.liveCallableWorkflowRehydrationArtifactPath
      ? { liveCallableWorkflowRehydrationArtifactPath: input.liveCallableWorkflowRehydrationArtifactPath ?? defaults.liveCallableWorkflowRehydrationArtifactPath }
      : {}),
    ...(input.liveLocalRuntimeArtifactPath ?? defaults.liveLocalRuntimeArtifactPath
      ? { liveLocalRuntimeArtifactPath: input.liveLocalRuntimeArtifactPath ?? defaults.liveLocalRuntimeArtifactPath }
      : {}),
    ...(input.liveLocalRuntimeGateArtifactPath ?? defaults.liveLocalRuntimeGateArtifactPath
      ? { liveLocalRuntimeGateArtifactPath: input.liveLocalRuntimeGateArtifactPath ?? defaults.liveLocalRuntimeGateArtifactPath }
      : {}),
    ...(input.liveRestartRepairArtifactPath ?? defaults.liveRestartRepairArtifactPath
      ? { liveRestartRepairArtifactPath: input.liveRestartRepairArtifactPath ?? defaults.liveRestartRepairArtifactPath }
      : {}),
    ...(input.liveRestartRepairFixtureArtifactPath ?? defaults.liveRestartRepairFixtureArtifactPath
      ? { liveRestartRepairFixtureArtifactPath: input.liveRestartRepairFixtureArtifactPath ?? defaults.liveRestartRepairFixtureArtifactPath }
      : {}),
    ...(input.liveLifecycleEdgeArtifactPath ?? defaults.liveLifecycleEdgeArtifactPath
      ? { liveLifecycleEdgeArtifactPath: input.liveLifecycleEdgeArtifactPath ?? defaults.liveLifecycleEdgeArtifactPath }
      : {}),
    ...(input.liveDesktopDogfoodArtifactPath ?? defaults.liveDesktopDogfoodArtifactPath
      ? { liveDesktopDogfoodArtifactPath: input.liveDesktopDogfoodArtifactPath ?? defaults.liveDesktopDogfoodArtifactPath }
      : {}),
    stdoutPath: outputPath.replace(/\.json$/i, ".stdout.txt"),
    stderrPath: outputPath.replace(/\.json$/i, ".stderr.txt"),
    timeoutMs,
    command: input.command ?? defaults.command,
  };
}

function liveConfidenceDefaultsForSliceKind(sliceKind) {
  if (sliceKind === "child_authority") {
    return {
      providerId: "ambient",
      sliceId: "subagent-child-authority-live-dogfood",
      hypothesis:
        "Live child sessions inherit the parent's authority roots, narrow them by launch policy, route delegated long-context reads through the same root and approval boundary as native read, and pause child file/browser actions for parent approval without leaking denied content.",
      expectedObservation:
        "The authority confidence report includes a passed long_context_process document-root proof, a parent-forwarded child file approval proof, and a parent-forwarded child browser approval proof with child ids, blocking state, scoped approvals, and no denied-content leakage.",
      outputPath: DEFAULT_SUBAGENT_AUTHORITY_LIVE_CONFIDENCE_OUTPUT_PATH,
      liveLongContextAuthorityArtifactPath: DEFAULT_SUBAGENT_LIVE_LONG_CONTEXT_AUTHORITY_ARTIFACT_PATH,
      liveApprovalAuthorityArtifactPath: DEFAULT_SUBAGENT_LIVE_APPROVAL_AUTHORITY_ARTIFACT_PATH,
      liveBrowserApprovalArtifactPath: DEFAULT_SUBAGENT_LIVE_BROWSER_APPROVAL_ARTIFACT_PATH,
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:live:authority"],
        display: "pnpm run test:subagents:live:authority",
      },
    };
  }
  if (sliceKind === "workflow_symphony_broader") {
    return {
      providerId: "ambient",
      sliceId: "workflow-symphony-broader-live-dogfood",
      hypothesis:
        "A real Ambient/Pi workflow run plus phase-1 Workflow Agent UI dogfood can exercise broader live workflow/Symphony surfaces, including connector-shaped readonly validation, document categorization, browser-backed source gathering, and current-web recipe reporting.",
      expectedObservation:
        "The broader workflow confidence report includes a succeeded live workflow run, a passed phase1-live Workflow Agent UI dogfood matrix with all broader scenarios, child-originated mutating callable workflow dogfood with parent blocking and denied-scope proof, and callable workflow task/artifact/run/progress/usage rehydration evidence.",
      outputPath: DEFAULT_SUBAGENT_WORKFLOW_BROADER_LIVE_CONFIDENCE_OUTPUT_PATH,
      liveWorkflowArtifactPath: DEFAULT_SUBAGENT_LIVE_WORKFLOW_ARTIFACT_PATH,
      liveWorkflowUiDogfoodArtifactPath: DEFAULT_SUBAGENT_WORKFLOW_BROADER_UI_DOGFOOD_ARTIFACT_PATH,
      liveCallableWorkflowDogfoodArtifactPath: DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_DOGFOOD_ARTIFACT_PATH,
      liveCallableWorkflowRehydrationArtifactPath: DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_REHYDRATION_ARTIFACT_PATH,
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:live-confidence:workflow-broader-prereqs"],
        display: "pnpm run test:subagents:live-confidence:workflow-broader-prereqs",
      },
    };
  }
  if (sliceKind === "workflow_symphony") {
    return {
      providerId: "ambient",
      sliceId: "workflow-symphony-live-dogfood",
      hypothesis:
        "A real Ambient/Pi workflow run plus baseline Workflow Agent UI dogfood and callable workflow proof artifacts can execute safe workflow paths, preserve workflow thread/artifact/run links, prove child-originated mutating workers stay scoped, and rehydrate task/artifact telemetry after restart.",
      expectedObservation:
        "The workflow confidence report includes a succeeded live workflow run, a passed phase0-live Workflow Agent UI dogfood matrix, child-originated mutating callable workflow dogfood with parent blocking and denied-scope proof, and callable workflow task/artifact/run/progress/usage rehydration evidence.",
      outputPath: DEFAULT_SUBAGENT_WORKFLOW_LIVE_CONFIDENCE_OUTPUT_PATH,
      liveWorkflowArtifactPath: DEFAULT_SUBAGENT_LIVE_WORKFLOW_ARTIFACT_PATH,
      liveWorkflowUiDogfoodArtifactPath: DEFAULT_SUBAGENT_WORKFLOW_UI_DOGFOOD_ARTIFACT_PATH,
      liveCallableWorkflowDogfoodArtifactPath: DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_DOGFOOD_ARTIFACT_PATH,
      liveCallableWorkflowRehydrationArtifactPath: DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_REHYDRATION_ARTIFACT_PATH,
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:live-confidence:workflow-prereqs"],
        display: "pnpm run test:subagents:live-confidence:workflow-prereqs",
      },
    };
  }
  if (sliceKind === "local_runtime") {
    return {
      providerId: "local-runtime",
      sliceId: "local-runtime-control-proof",
      hypothesis:
        "A local runtime proof run can show sub-agent-owned leases block ordinary Stop, stale sub-agent leases recover into ordinary lifecycle controls, unknown local processes stay untracked and not stoppable, stopped providers remain visible as stopped, and provider-declared lifecycle commands run safely.",
      expectedObservation:
        "The local runtime proof report includes passed active sub-agent Stop blocker, stale lease recovery, untracked runtime safety, non-destructive MiniCPM stop, stopped-provider display, and provider-declared lifecycle scenarios, with no blocking proof-gate issues.",
      outputPath: DEFAULT_SUBAGENT_LOCAL_RUNTIME_LIVE_CONFIDENCE_OUTPUT_PATH,
      liveLocalRuntimeArtifactPath: DEFAULT_SUBAGENT_LIVE_LOCAL_RUNTIME_ARTIFACT_PATH,
      liveLocalRuntimeGateArtifactPath: DEFAULT_SUBAGENT_LIVE_LOCAL_RUNTIME_GATE_ARTIFACT_PATH,
      command: {
        executable: "pnpm",
        args: ["run", "test:local-runtime-control:proof"],
        display: "pnpm run test:local-runtime-control:proof",
      },
    };
  }
  if (sliceKind === "restart_repair") {
    return {
      providerId: "replay-diagnostics",
      sliceId: "subagent-restart-repair-replay",
      hypothesis:
        "A deterministic replay probe can rehydrate a broken child tree after restart, preserve parent mailbox and runtime event evidence, and prove restart, stop, detach, cancel, retry, timeout, and partial-result lifecycle edges without live tokens.",
      expectedObservation:
        "The replay diagnostics report passes with the restart-repair-broken-child-tree fixture, observes expected restart repair issue kinds, records repaired run/barrier/thread/mailbox/runtime evidence, and the lifecycle-edge report proves all seven planned edge kinds without unsafe synthesis.",
      outputPath: DEFAULT_SUBAGENT_RESTART_REPAIR_LIVE_CONFIDENCE_OUTPUT_PATH,
      liveRestartRepairArtifactPath: DEFAULT_SUBAGENT_LIVE_RESTART_REPAIR_ARTIFACT_PATH,
      liveRestartRepairFixtureArtifactPath: DEFAULT_SUBAGENT_LIVE_RESTART_REPAIR_FIXTURE_ARTIFACT_PATH,
      liveLifecycleEdgeArtifactPath: DEFAULT_SUBAGENT_LIFECYCLE_EDGE_ARTIFACT_PATH,
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:live-confidence:restart-repair-prereqs"],
        display: "pnpm run test:subagents:live-confidence:restart-repair-prereqs",
      },
    };
  }
  if (sliceKind === "lifecycle_edges") {
    return {
      providerId: "lifecycle-edge-proof",
      sliceId: "subagent-lifecycle-edge-proof",
      hypothesis:
        "A deterministic lifecycle-edge proof can represent restart, stop, detach, cancel, retry, timeout, and partial-result behavior as explicit parent-visible evidence without allowing unsafe parent synthesis.",
      expectedObservation:
        "The lifecycle-edge report covers all seven planned edge kinds, names affected children and source events, proves synthesis safety for each edge, and records no missing or unsafe edge summaries.",
      outputPath: DEFAULT_SUBAGENT_LIFECYCLE_EDGE_LIVE_CONFIDENCE_OUTPUT_PATH,
      liveLifecycleEdgeArtifactPath: DEFAULT_SUBAGENT_LIFECYCLE_EDGE_ARTIFACT_PATH,
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:lifecycle-edges:proof"],
        display: "pnpm run test:subagents:lifecycle-edges:proof",
      },
    };
  }
  if (sliceKind === "desktop_dogfood") {
    return {
      providerId: "ambient",
      sliceId: "desktop-dogfood-live-confidence",
      hypothesis:
        "The full Ambient Desktop Electron dogfood can prove visible default-collapsed sub-agent clusters, parent blocking, approval forwarding, workflow visibility, local runtime ownership, lifecycle edges, operator controls, and visual layout safety in the real app shell.",
      expectedObservation:
        "The Desktop dogfood artifact passes, covers all planned scenarios, records screenshot/accessibility evidence, proves lifecycle and local-runtime ownership UI, and contributes a classified confidence closeout for the feature flag maturity program.",
      outputPath: DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_LIVE_CONFIDENCE_OUTPUT_PATH,
      liveDesktopDogfoodArtifactPath: DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_ARTIFACT_PATH,
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:desktop-dogfood"],
        display: "pnpm run test:subagents:desktop-dogfood",
      },
    };
  }
  return {
    providerId: "ambient",
    sliceId: "subagent-live-smoke",
    hypothesis:
      "A real Ambient/Pi-compatible sub-agent loop can start a child session, stream events, return structured completion, and preserve a release-usable artifact.",
    expectedObservation:
      "The live smoke report includes a completed child run, child thread id, completed result artifact, started/assistant_delta/completed runtime events, and parent/child completion sentinels.",
    liveSmokeArtifactPath: DEFAULT_SUBAGENT_LIVE_SMOKE_ARTIFACT_PATH,
    command: {
      executable: "pnpm",
      args: ["run", "test:subagents:live:smoke"],
      display: "pnpm run test:subagents:live:smoke",
    },
  };
}

export async function runSubagentLiveConfidence(input = {}) {
  const plan = buildSubagentLiveConfidencePlan(input);
  const startedAt = input.startedAt ?? new Date().toISOString();
  const runCommand = input.runCommand ?? runBoundedCommand;
  const result = await runCommand(plan.command, {
    timeoutMs: plan.timeoutMs,
    abortSignal: input.abortSignal,
  });
  const completedAt = input.completedAt ?? new Date().toISOString();
  const liveSmokeArtifact = input.liveSmokeArtifact ?? (plan.liveSmokeArtifactPath
    ? await readJsonIfExists(plan.liveSmokeArtifactPath)
    : undefined);
  const liveLongContextAuthorityArtifact = input.liveLongContextAuthorityArtifact ?? (plan.liveLongContextAuthorityArtifactPath
    ? await readJsonIfExists(plan.liveLongContextAuthorityArtifactPath)
    : undefined);
  const liveApprovalAuthorityArtifact = input.liveApprovalAuthorityArtifact ?? (plan.liveApprovalAuthorityArtifactPath
    ? await readJsonIfExists(plan.liveApprovalAuthorityArtifactPath)
    : undefined);
  const liveBrowserApprovalArtifact = input.liveBrowserApprovalArtifact ?? (plan.liveBrowserApprovalArtifactPath
    ? await readJsonIfExists(plan.liveBrowserApprovalArtifactPath)
    : undefined);
  const liveWorkflowArtifact = input.liveWorkflowArtifact ?? (plan.liveWorkflowArtifactPath
    ? await readJsonIfExists(plan.liveWorkflowArtifactPath)
    : undefined);
  const liveWorkflowUiDogfoodArtifact = input.liveWorkflowUiDogfoodArtifact ?? (plan.liveWorkflowUiDogfoodArtifactPath
    ? await readJsonIfExists(plan.liveWorkflowUiDogfoodArtifactPath)
    : undefined);
  const liveCallableWorkflowDogfoodArtifact = input.liveCallableWorkflowDogfoodArtifact ?? (plan.liveCallableWorkflowDogfoodArtifactPath
    ? await readJsonIfExists(plan.liveCallableWorkflowDogfoodArtifactPath)
    : undefined);
  const liveCallableWorkflowRehydrationArtifact = input.liveCallableWorkflowRehydrationArtifact ?? (plan.liveCallableWorkflowRehydrationArtifactPath
    ? await readJsonIfExists(plan.liveCallableWorkflowRehydrationArtifactPath)
    : undefined);
  const liveLocalRuntimeArtifact = input.liveLocalRuntimeArtifact ?? (plan.liveLocalRuntimeArtifactPath
    ? await readJsonIfExists(plan.liveLocalRuntimeArtifactPath)
    : undefined);
  const liveLocalRuntimeGateArtifact = input.liveLocalRuntimeGateArtifact ?? (plan.liveLocalRuntimeGateArtifactPath
    ? await readJsonIfExists(plan.liveLocalRuntimeGateArtifactPath)
    : undefined);
  const liveRestartRepairArtifact = input.liveRestartRepairArtifact ?? (plan.liveRestartRepairArtifactPath
    ? await readJsonIfExists(plan.liveRestartRepairArtifactPath)
    : undefined);
  const liveRestartRepairFixtureArtifact = input.liveRestartRepairFixtureArtifact ?? (plan.liveRestartRepairFixtureArtifactPath
    ? await readJsonIfExists(plan.liveRestartRepairFixtureArtifactPath)
    : undefined);
  const liveLifecycleEdgeArtifact = input.liveLifecycleEdgeArtifact ?? (plan.liveLifecycleEdgeArtifactPath
    ? await readJsonIfExists(plan.liveLifecycleEdgeArtifactPath)
    : undefined);
  const liveDesktopDogfoodArtifact = input.liveDesktopDogfoodArtifact ?? (plan.liveDesktopDogfoodArtifactPath
    ? await readJsonIfExists(plan.liveDesktopDogfoodArtifactPath)
    : undefined);
  const evidence = buildSubagentLiveConfidenceEvidence({
    plan,
    startedAt,
    completedAt,
    commandResult: result,
    liveSmokeArtifact,
    liveLongContextAuthorityArtifact,
    liveApprovalAuthorityArtifact,
    liveBrowserApprovalArtifact,
    liveWorkflowArtifact,
    liveWorkflowUiDogfoodArtifact,
    liveCallableWorkflowDogfoodArtifact,
    liveCallableWorkflowRehydrationArtifact,
    liveLocalRuntimeArtifact,
    liveLocalRuntimeGateArtifact,
    liveRestartRepairArtifact,
    liveRestartRepairFixtureArtifact,
    liveLifecycleEdgeArtifact,
    liveDesktopDogfoodArtifact,
  });

  if (input.outputPath !== false) {
    await writeEvidenceArtifacts({
      outputPath: plan.outputPath,
      evidence,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  return evidence;
}

export function buildSubagentLiveConfidenceEvidence(input) {
  const {
    plan,
    commandResult,
    liveSmokeArtifact,
    liveLongContextAuthorityArtifact,
    liveApprovalAuthorityArtifact,
    liveBrowserApprovalArtifact,
    liveWorkflowArtifact,
    liveWorkflowUiDogfoodArtifact,
    liveCallableWorkflowDogfoodArtifact,
    liveCallableWorkflowRehydrationArtifact,
    liveLocalRuntimeArtifact,
    liveLocalRuntimeGateArtifact,
    liveRestartRepairArtifact,
    liveRestartRepairFixtureArtifact,
    liveLifecycleEdgeArtifact,
    liveDesktopDogfoodArtifact,
  } = input;
  const probe = liveConfidenceProbeForPlan({
    plan,
    liveSmokeArtifact,
    liveLongContextAuthorityArtifact,
    liveApprovalAuthorityArtifact,
    liveBrowserApprovalArtifact,
    liveWorkflowArtifact,
    liveWorkflowUiDogfoodArtifact,
    liveCallableWorkflowDogfoodArtifact,
    liveCallableWorkflowRehydrationArtifact,
    liveLocalRuntimeArtifact,
    liveLocalRuntimeGateArtifact,
    liveRestartRepairArtifact,
    liveRestartRepairFixtureArtifact,
    liveLifecycleEdgeArtifact,
    liveDesktopDogfoodArtifact,
  });
  const sanitizedCombinedOutput = sanitizeEvidenceText(`${commandResult.stdout ?? ""}\n${commandResult.stderr ?? ""}`);
  const missingCredential = credentialMissingFromOutput(sanitizedCombinedOutput);
  const environmentBlocker = environmentBlockerFromOutput(sanitizedCombinedOutput);
  const timedOut = commandResult.timedOut === true;
  const interrupted = commandResult.interrupted === true;
  const livePassed = commandResult.exitCode === 0 && probe.validation.valid;
  const status = livePassed
    ? "passed"
    : (timedOut || interrupted || missingCredential || environmentBlocker ? "blocked" : "failed");
  const artifacts = [];
  if (probe.artifact) {
    artifacts.push({
      label: probe.validation.valid ? probe.validArtifactLabel : probe.partialArtifactLabel,
      path: probe.artifactPath,
      kind: "json",
    });
  }
  for (const artifactRef of probe.additionalArtifacts ?? []) {
    artifacts.push(artifactRef);
  }
  artifacts.push({
    label: "sanitized live confidence stdout",
    path: plan.stdoutPath,
    kind: "log",
  }, {
    label: "sanitized live confidence stderr",
    path: plan.stderrPath,
    kind: "log",
  });

  return {
    schemaVersion: SUBAGENT_LIVE_CONFIDENCE_EVIDENCE_SCHEMA_VERSION,
    sliceId: plan.sliceId,
    sliceKind: plan.sliceKind,
    status,
    hypothesis: sanitizeEvidenceText(plan.hypothesis),
    expectedObservation: sanitizeEvidenceText(plan.expectedObservation),
    actualOutcome: actualOutcomeForRun({ status, probe, commandResult }),
    confidenceDelta: confidenceDeltaForStatus(status),
    followUp: followUpForStatus(status),
    closeoutAnswer: closeoutAnswerForRun({ status, probe, commandResult, environmentBlocker }),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    provider: {
      kind: providerKindForPlan(plan),
      providerId: plan.providerId,
      usingGmiOverride: plan.providerId === "gmi-cloud",
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    capabilitiesObserved: capabilitiesObservedForProbe(probe),
    ...(probe.desktopDogfoodContract ? { desktopDogfoodContract: probe.desktopDogfoodContract } : {}),
    ...(probe.maturityAssertions ? { maturityAssertions: probe.maturityAssertions } : {}),
    probes: [{
      label: probe.probeLabel,
      command: sanitizedCommandDisplay(plan.command.display),
      startedAt: input.startedAt,
      completedAt: input.completedAt,
    }],
    artifacts,
    observations: probe.observations,
    classifiedBlockers: status === "blocked" ? classifiedBlockersForRun({
      timedOut,
      interrupted,
      interruptSignal: commandResult.interruptSignal,
      missingCredential,
      environmentBlocker,
      probe,
    }) : [],
    productIssues: status === "failed" ? productIssuesForRun({ commandResult, probe }) : [],
    notes: livePassed
      ? `${probe.subject} completed and produced release-usable confidence evidence.`
      : `${probe.subject} did not complete release-usably; this artifact classifies the blocker or product issue without exposing secrets.`,
  };
}

function capabilitiesObservedForProbe(probe) {
  const declaredCapabilities = Array.isArray(probe.capabilitiesObserved) ? probe.capabilitiesObserved : [];
  if (probe.validation.valid) return uniqueStrings(declaredCapabilities);

  const passedCapabilities = new Set();
  for (const assertion of Array.isArray(probe.maturityAssertions) ? probe.maturityAssertions : []) {
    if (assertion?.status !== "passed") continue;
    for (const capability of Array.isArray(assertion.capabilities) ? assertion.capabilities : []) {
      if (typeof capability === "string" && capability.length > 0) passedCapabilities.add(capability);
    }
  }

  const ordered = declaredCapabilities.filter((capability) => passedCapabilities.has(capability));
  for (const capability of passedCapabilities) {
    if (!ordered.includes(capability)) ordered.push(capability);
  }
  return ordered;
}

function liveConfidenceProbeForPlan(input) {
  if (input.plan.sliceKind === "child_authority") {
    const validation = validateChildAuthorityConfidenceArtifacts({
      longContextArtifact: input.liveLongContextAuthorityArtifact,
      approvalAuthorityArtifact: input.liveApprovalAuthorityArtifact,
      browserApprovalArtifact: input.liveBrowserApprovalArtifact,
    });
    return {
      subject: "Live child authority proof",
      probeLabel: "Ambient/Pi child authority live dogfood",
      artifact: input.liveLongContextAuthorityArtifact,
      artifactPath: input.plan.liveLongContextAuthorityArtifactPath,
      additionalArtifacts: [
        ...(input.plan.liveApprovalAuthorityArtifactPath
          ? [{
              label: validation.valid ? "child file approval authority proof" : "partial child file approval authority proof",
              path: input.plan.liveApprovalAuthorityArtifactPath,
              kind: "json",
            }]
          : []),
        ...(input.plan.liveBrowserApprovalArtifactPath
          ? [{
              label: validation.valid ? "child browser approval authority proof" : "partial child browser approval authority proof",
              path: input.plan.liveBrowserApprovalArtifactPath,
              kind: "json",
            }]
          : []),
      ],
      validation,
      validArtifactLabel: "child authority confidence proof set",
      partialArtifactLabel: "partial child authority confidence proof set",
      capabilitiesObserved: [
        "delegated_tool_authority",
        "long_context_authority_roots",
        "document_root_inheritance",
        "native_pdf_office_read",
        "parent_approval_forwarding",
        "child_approval_pause",
        "parent_blocking_resume",
        "child_scoped_approval",
        "browser_authority",
        "browser_approval_resume",
        "secret_non_leakage",
        "least_privilege_child_policy",
      ],
      observations: childAuthorityObservations({
        longContextArtifact: input.liveLongContextAuthorityArtifact,
        approvalAuthorityArtifact: input.liveApprovalAuthorityArtifact,
        browserApprovalArtifact: input.liveBrowserApprovalArtifact,
        validation,
      }),
      maturityAssertions: childAuthorityMaturityAssertions({
        longContextArtifact: input.liveLongContextAuthorityArtifact,
        longContextArtifactPath: input.plan.liveLongContextAuthorityArtifactPath,
        approvalAuthorityArtifact: input.liveApprovalAuthorityArtifact,
        approvalAuthorityArtifactPath: input.plan.liveApprovalAuthorityArtifactPath,
        browserApprovalArtifact: input.liveBrowserApprovalArtifact,
        browserApprovalArtifactPath: input.plan.liveBrowserApprovalArtifactPath,
      }),
      issueLabel: "child authority validation issues",
      successSummary: () =>
        `proved long_context_process authority for ${input.liveLongContextAuthorityArtifact?.run?.id ?? "unknown"}, child file approval ${input.liveApprovalAuthorityArtifact?.run?.id ?? "unknown"}, and child browser approval ${input.liveBrowserApprovalArtifact?.run?.id ?? "unknown"}`,
    };
  }
  if (input.plan.sliceKind === "workflow_symphony" || input.plan.sliceKind === "workflow_symphony_broader") {
    const workflowUiDogfoodProfile = workflowUiDogfoodProfileForSliceKind(input.plan.sliceKind);
    const validation = validateWorkflowSymphonyConfidenceArtifacts({
      liveWorkflowArtifact: input.liveWorkflowArtifact,
      workflowUiDogfoodArtifact: input.liveWorkflowUiDogfoodArtifact,
      callableWorkflowDogfoodArtifact: input.liveCallableWorkflowDogfoodArtifact,
      callableWorkflowRehydrationArtifact: input.liveCallableWorkflowRehydrationArtifact,
      workflowUiDogfoodProfile,
    });
    const workflowUiCoverageLabel = workflowUiDogfoodProfile === "broader" ? "broader phase-1" : "baseline";
    return {
      subject: workflowUiDogfoodProfile === "broader"
        ? "Live Ambient/Pi broader workflow/Symphony dogfood"
        : "Live Ambient/Pi workflow/Symphony dogfood",
      probeLabel: workflowUiDogfoodProfile === "broader"
        ? "Ambient/Pi broader workflow/Symphony live dogfood"
        : "Ambient/Pi workflow/Symphony live dogfood",
      artifact: input.liveWorkflowArtifact,
      artifactPath: input.plan.liveWorkflowArtifactPath,
      additionalArtifacts: [
        ...(input.plan.liveCallableWorkflowDogfoodArtifactPath
          ? [{
              label: validation.valid ? "callable workflow mutating child dogfood proof" : "partial callable workflow mutating child dogfood proof",
              path: input.plan.liveCallableWorkflowDogfoodArtifactPath,
              kind: "json",
            }]
          : []),
        ...(input.plan.liveWorkflowUiDogfoodArtifactPath
          ? [{
              label: validation.valid ? "Workflow Agent UI dogfood matrix proof" : "partial Workflow Agent UI dogfood matrix proof",
              path: input.plan.liveWorkflowUiDogfoodArtifactPath,
              kind: "json",
            }]
          : []),
        ...(input.plan.liveCallableWorkflowRehydrationArtifactPath
          ? [{
              label: validation.valid ? "callable workflow task rehydration proof" : "partial callable workflow task rehydration proof",
              path: input.plan.liveCallableWorkflowRehydrationArtifactPath,
              kind: "json",
            }]
          : []),
      ],
      validation,
      validArtifactLabel: "workflow/Symphony confidence proof set",
      partialArtifactLabel: "partial workflow/Symphony confidence proof set",
      capabilitiesObserved: [
        "workflow_launch",
        "ambient_runtime_call",
        "artifact_link",
        "checkpoint_output",
        "mutating_child_workflow",
        "child_scoped_approval",
        "isolated_child_worktree",
        "parent_blocking_workflow",
        "denied_workflow_scope",
        "launch_card_bounds",
        "pause_resume_cancel",
        "child_workflow_scope",
        "restart_repair",
        "workflow_task_rehydration",
        "child_workflow_provenance",
        "broader_live_workflow_runs",
        "workflow_agent_ui_dogfood",
        "workflow_output_evidence",
        "electron_workflow_dogfood",
        ...(workflowUiDogfoodProfile === "broader" ? ["phase1_workflow_ui_dogfood"] : []),
      ],
      observations: workflowSymphonyObservations({
        liveWorkflowArtifact: input.liveWorkflowArtifact,
        workflowUiDogfoodArtifact: input.liveWorkflowUiDogfoodArtifact,
        callableWorkflowDogfoodArtifact: input.liveCallableWorkflowDogfoodArtifact,
        callableWorkflowRehydrationArtifact: input.liveCallableWorkflowRehydrationArtifact,
        workflowUiDogfoodProfile,
      }),
      maturityAssertions: workflowSymphonyMaturityAssertions({
        liveWorkflowArtifact: input.liveWorkflowArtifact,
        liveWorkflowArtifactPath: input.plan.liveWorkflowArtifactPath,
        workflowUiDogfoodArtifact: input.liveWorkflowUiDogfoodArtifact,
        workflowUiDogfoodArtifactPath: input.plan.liveWorkflowUiDogfoodArtifactPath,
        callableWorkflowDogfoodArtifact: input.liveCallableWorkflowDogfoodArtifact,
        callableWorkflowDogfoodArtifactPath: input.plan.liveCallableWorkflowDogfoodArtifactPath,
        callableWorkflowRehydrationArtifact: input.liveCallableWorkflowRehydrationArtifact,
        callableWorkflowRehydrationArtifactPath: input.plan.liveCallableWorkflowRehydrationArtifactPath,
        workflowUiDogfoodProfile,
      }),
      issueLabel: "workflow validation issues",
      successSummary: () =>
        `succeeded workflow run ${input.liveWorkflowArtifact?.run?.id ?? "unknown"} for workflow thread ${input.liveWorkflowArtifact?.artifact?.workflowThreadId ?? "unknown"}; Workflow Agent UI dogfood covered ${(input.liveWorkflowUiDogfoodArtifact?.results ?? []).length} ${workflowUiCoverageLabel} scenario(s); callable workflow task ${input.liveCallableWorkflowDogfoodArtifact?.task?.id ?? "unknown"} proved mutating child dogfood and rehydrated task/artifact/run telemetry`,
    };
  }
  if (input.plan.sliceKind === "local_runtime") {
    const validation = validateLocalRuntimeControlProofArtifact(input.liveLocalRuntimeArtifact, input.liveLocalRuntimeGateArtifact);
    return {
      subject: "Local runtime sub-agent ownership proof",
      probeLabel: "local runtime control proof",
      artifact: input.liveLocalRuntimeArtifact,
      artifactPath: input.plan.liveLocalRuntimeArtifactPath,
      additionalArtifacts: input.plan.liveLocalRuntimeGateArtifactPath
        ? [{
            label: validation.valid ? "local runtime proof gate report" : "partial local runtime proof gate report",
            path: input.plan.liveLocalRuntimeGateArtifactPath,
            kind: "json",
          }]
        : [],
      validation,
      validArtifactLabel: "local runtime control proof report",
      partialArtifactLabel: "partial local runtime control proof report",
      capabilitiesObserved: [
        "local_runtime_lease_ownership",
        "lease_stop_blocker",
        "stale_lease_recovery",
        "untracked_runtime_safety",
        "provider_lifecycle",
        "stopped_provider_display",
        "non_destructive_stop",
        "proof_gate_clean",
      ],
      observations: localRuntimeControlProofObservations(input.liveLocalRuntimeArtifact, input.liveLocalRuntimeGateArtifact, validation),
      maturityAssertions: localRuntimeMaturityAssertions({
        liveLocalRuntimeArtifact: input.liveLocalRuntimeArtifact,
        liveLocalRuntimeArtifactPath: input.plan.liveLocalRuntimeArtifactPath,
        liveLocalRuntimeGateArtifact: input.liveLocalRuntimeGateArtifact,
        liveLocalRuntimeGateArtifactPath: input.plan.liveLocalRuntimeGateArtifactPath,
      }),
      issueLabel: "local runtime proof validation issues",
      successSummary: (artifact) => {
        const blocker = artifact?.scenarios?.["active-subagent-stop-blocker"];
        const untracked = artifact?.scenarios?.["untracked-runtime-safety"];
        const staleRecovery = artifact?.scenarios?.["stale-lease-recovery"];
        const displayName = blocker?.affectedSubagents?.[0]?.displayName ?? "unknown sub-agent";
        const leaseIds = Array.isArray(blocker?.blockerLeaseIds) ? blocker.blockerLeaseIds.join(", ") : "unknown lease";
        const staleLeaseIds = Array.isArray(staleRecovery?.staleLeaseIds) ? staleRecovery.staleLeaseIds.join(", ") : "unknown stale lease";
        return `proved ordinary Stop is blocked by ${leaseIds} for ${displayName}, stale lease ${staleLeaseIds} no longer blocked Stop/Restart, and untracked runtime ${untracked?.runtimeEntryId ?? "unknown"} stayed external-only`;
      },
    };
  }
  if (input.plan.sliceKind === "restart_repair") {
    const validation = validateSubagentRestartRepairConfidenceArtifacts(
      input.liveRestartRepairArtifact,
      input.liveRestartRepairFixtureArtifact,
      input.liveLifecycleEdgeArtifact,
    );
    return {
      subject: "Sub-agent restart repair replay proof",
      probeLabel: "sub-agent restart repair replay diagnostics",
      artifact: input.liveRestartRepairArtifact,
      artifactPath: input.plan.liveRestartRepairArtifactPath,
      additionalArtifacts: [
        ...(input.plan.liveRestartRepairFixtureArtifactPath
          ? [{
              label: validation.valid ? "restart repair fixture evidence" : "partial restart repair fixture evidence",
              path: input.plan.liveRestartRepairFixtureArtifactPath,
              kind: "json",
            }]
          : []),
        ...(input.plan.liveLifecycleEdgeArtifactPath
          ? [{
              label: validation.valid ? "restart lifecycle edge proof" : "partial restart lifecycle edge proof",
              path: input.plan.liveLifecycleEdgeArtifactPath,
              kind: "json",
            }]
          : []),
      ],
      validation,
      validArtifactLabel: "restart repair and lifecycle edge proof set",
      partialArtifactLabel: "partial restart repair and lifecycle edge proof set",
      capabilitiesObserved: [
        "restart_rehydration",
        "runtime_event_replay",
        "parent_mailbox_replay",
        "mailbox_state_rehydration",
        "artifact_pointer_rehydration",
        "child_thread_repair",
        "wait_barrier_repair",
        "restart_edge",
        "stop_edge",
        "detach_edge",
        "cancel_edge",
        "retry_edge",
        "timeout_edge",
        "partial_result_edge",
        "synthesis_safety",
      ],
      observations: [
        ...restartRepairObservations(input.liveRestartRepairArtifact, validation.parts.restartRepair),
        ...lifecycleEdgeObservations(input.liveLifecycleEdgeArtifact, validation.parts.lifecycleEdges),
      ],
      maturityAssertions: restartRepairMaturityAssertions({
        liveRestartRepairArtifact: input.liveRestartRepairArtifact,
        liveRestartRepairArtifactPath: input.plan.liveRestartRepairArtifactPath,
        liveRestartRepairFixtureArtifact: input.liveRestartRepairFixtureArtifact,
        liveRestartRepairFixtureArtifactPath: input.plan.liveRestartRepairFixtureArtifactPath,
        liveLifecycleEdgeArtifact: input.liveLifecycleEdgeArtifact,
        liveLifecycleEdgeArtifactPath: input.plan.liveLifecycleEdgeArtifactPath,
      }),
      issueLabel: "restart repair validation issues",
      successSummary: () => {
        const repair = input.liveRestartRepairArtifact?.replayEvidence?.restartRepair ?? {};
        const rehydration = input.liveRestartRepairArtifact?.replayEvidence?.rehydration ?? {};
        const coveredEdges = input.liveLifecycleEdgeArtifact?.summary?.coveredEdgeKinds ?? [];
        return `repaired runs ${(repair.repairedRunIds ?? []).join(", ") || "none"} and barriers ${(repair.repairedBarrierIds ?? []).join(", ") || "none"}, rehydrated ${(rehydration.parentMailboxEventIds ?? []).length || 0} mailbox state and ${(rehydration.resultArtifactPointers ?? []).length || 0} artifact pointer; covered lifecycle edges ${coveredEdges.join(", ") || "none"}`;
      },
    };
  }
  if (input.plan.sliceKind === "lifecycle_edges") {
    const validation = validateSubagentLifecycleEdgeArtifact(input.liveLifecycleEdgeArtifact);
    return {
      subject: "Sub-agent lifecycle edge proof",
      probeLabel: "sub-agent lifecycle edge proof",
      artifact: input.liveLifecycleEdgeArtifact,
      artifactPath: input.plan.liveLifecycleEdgeArtifactPath,
      validation,
      validArtifactLabel: "lifecycle edge proof report",
      partialArtifactLabel: "partial lifecycle edge proof report",
      capabilitiesObserved: [
        "restart_edge",
        "stop_edge",
        "detach_edge",
        "cancel_edge",
        "retry_edge",
        "timeout_edge",
        "partial_result_edge",
        "synthesis_safety",
      ],
      observations: lifecycleEdgeObservations(input.liveLifecycleEdgeArtifact, validation),
      maturityAssertions: lifecycleEdgeMaturityAssertions({
        liveLifecycleEdgeArtifact: input.liveLifecycleEdgeArtifact,
        liveLifecycleEdgeArtifactPath: input.plan.liveLifecycleEdgeArtifactPath,
      }),
      issueLabel: "lifecycle edge validation issues",
      successSummary: (artifact) =>
        `covered lifecycle edges ${(artifact?.summary?.coveredEdgeKinds ?? []).join(", ") || "none"}`,
    };
  }
  if (input.plan.sliceKind === "desktop_dogfood") {
    const validation = validateDesktopDogfoodConfidenceArtifact(input.liveDesktopDogfoodArtifact);
    return {
      subject: "Full Ambient Desktop sub-agent dogfood",
      probeLabel: "Electron/CDP Desktop sub-agent dogfood",
      artifact: input.liveDesktopDogfoodArtifact,
      artifactPath: input.plan.liveDesktopDogfoodArtifactPath,
      additionalArtifacts: desktopDogfoodScreenshotArtifacts(input.liveDesktopDogfoodArtifact),
      validation,
      validArtifactLabel: "Desktop dogfood live confidence proof",
      partialArtifactLabel: "partial Desktop dogfood live confidence proof",
      capabilitiesObserved: [
        "electron_desktop_dogfood",
        "production_ui_visibility",
        "default_collapsed_state",
        "approval_parent_blocking",
        "approval_forwarding_behavior",
        "parent_blocking_workflow",
        "workflow_execution_parent_blocking",
        "mutating_worker_dogfood_behavior",
        "workflow_high_load_dogfood",
        "denied_scope_explanation_behavior",
        "restart_rehydration_behavior",
        "workflow_artifact_rehydration_behavior",
        "local_runtime_lease_ownership",
        "lease_stop_blocker",
        "untracked_runtime_safety",
        "operator_child_controls",
        "operator_control_behavior",
        "lifecycle_edge_desktop_behavior",
        "timeout_edge",
        "partial_result_edge",
        "retry_edge",
        "detach_edge",
        "parent_stop_cascade",
        "layout_safety",
        "visual_layout_safety",
        "multi_parent_cluster_stress",
      ],
      observations: desktopDogfoodObservations(input.liveDesktopDogfoodArtifact, validation),
      desktopDogfoodContract: desktopDogfoodContractSummary(input.liveDesktopDogfoodArtifact, validation),
      maturityAssertions: desktopDogfoodMaturityAssertions({
        liveDesktopDogfoodArtifact: input.liveDesktopDogfoodArtifact,
        liveDesktopDogfoodArtifactPath: input.plan.liveDesktopDogfoodArtifactPath,
      }),
      issueLabel: "Desktop dogfood validation issues",
      successSummary: (artifact) => {
        const visualCount = passedAssertionCount(artifact?.visualAssertions);
        const maturityCount = passedAssertionCount(artifact?.maturityAssertions);
        return `passed ${desktopDogfoodRequiredScenarioPassCount(artifact)}/${REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS.length} required scenario(s), observed ${(artifact?.scenarios ?? []).length} total scenario(s), with ${visualCount}/${REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS.length} visual assertion(s), ${maturityCount}/${REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS.length} maturity assertion(s), and ${desktopDogfoodScreenshotArtifacts(artifact).length} screenshot/accessibility artifact(s)`;
      },
    };
  }
  const validation = validateLiveSmokeArtifact(input.liveSmokeArtifact);
  return {
    subject: "Live Ambient/Pi sub-agent smoke",
    probeLabel: "Ambient/Pi sub-agent live smoke",
    artifact: input.liveSmokeArtifact,
    artifactPath: input.plan.liveSmokeArtifactPath,
    validation,
    validArtifactLabel: "live sub-agent smoke report",
    partialArtifactLabel: "partial live sub-agent smoke report",
    capabilitiesObserved: ["streaming", "tool_calling", "structured_json"],
    observations: liveSmokeObservations(input.liveSmokeArtifact, validation),
    issueLabel: "smoke validation issues",
    successSummary: (artifact) =>
      `completed child run ${artifact?.run?.id ?? "unknown"} for thread ${artifact?.run?.childThreadId ?? "unknown"}`,
  };
}

export function validateLiveSmokeArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Live smoke artifact is missing."] };
  if (!artifact.provider) issues.push("Live smoke artifact is missing provider.");
  if (artifact.run?.status !== "completed") issues.push(`Live smoke child run status is ${artifact.run?.status ?? "missing"}.`);
  if (!artifact.run?.childThreadId) issues.push("Live smoke artifact is missing childThreadId.");
  if (!artifact.run?.resultArtifact || artifact.run.resultArtifact.status !== "completed") {
    issues.push("Live smoke artifact is missing a completed child result artifact.");
  }
  const runtimeEvents = Array.isArray(artifact.run?.runtimeEvents) ? artifact.run.runtimeEvents : [];
  if (!runtimeEvents.some((event) => event?.type === "started")) issues.push("Live smoke artifact is missing child runtime started event.");
  if (!runtimeEvents.some((event) => event?.type === "assistant_delta")) issues.push("Live smoke artifact is missing child assistant_delta stream event.");
  if (!runtimeEvents.some((event) => event?.type === "completed")) issues.push("Live smoke artifact is missing child runtime completed event.");
  if (!String(artifact.childAssistantText ?? "").includes("SUBAGENT_CHILD_DONE")) {
    issues.push("Live smoke artifact is missing the child completion sentinel.");
  }
  if (!String(artifact.assistantText ?? "").includes("SUBAGENT_LIVE_DONE")) {
    issues.push("Live smoke artifact is missing the parent completion sentinel.");
  }
  return { valid: issues.length === 0, issues };
}

export function validateChildAuthorityConfidenceArtifacts(input = {}) {
  const longContext = validateLongContextAuthorityArtifact(input.longContextArtifact);
  const approvalAuthority = validateApprovalAuthorityArtifact(input.approvalAuthorityArtifact);
  const browserApproval = validateBrowserApprovalAuthorityArtifact(input.browserApprovalArtifact);
  const issues = [
    ...prefixIssues("Long-context child authority", longContext.issues),
    ...prefixIssues("Child file approval authority", approvalAuthority.issues),
    ...prefixIssues("Child browser approval authority", browserApproval.issues),
  ];
  return {
    valid: issues.length === 0,
    issues,
    parts: { longContext, approvalAuthority, browserApproval },
  };
}

export function validateLongContextAuthorityArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["artifact is missing."] };
  if (!artifact.provider) issues.push("artifact is missing provider.");
  const run = objectValue(artifact.run);
  if (run.status !== "completed") issues.push(`child run status is ${run.status ?? "missing"}; expected completed.`);
  if (!nonEmptyString(run.childThreadId)) issues.push("artifact is missing childThreadId.");
  if (objectValue(run.resultArtifact).status !== "completed") {
    issues.push("artifact is missing a completed child result artifact.");
  }
  const childToolNames = Array.isArray(artifact.childToolNames) ? artifact.childToolNames : [];
  if (!childToolNames.includes("read")) issues.push("child tools are missing native read.");
  if (!childToolNames.includes("long_context_process")) issues.push("child tools are missing long_context_process.");
  const transcript = String(artifact.childTranscript ?? "");
  for (const marker of ["TEXT_AUTHORITY_OK", "PDF_AUTHORITY_OK", "OFFICE_AUTHORITY_OK"]) {
    if (!transcript.includes(marker)) issues.push(`child transcript is missing granted-content marker ${marker}.`);
  }
  if (!transcript.includes("outside the current workspace authority")) {
    issues.push("child transcript is missing the denied long_context_process authority explanation.");
  }
  if (artifact.deniedContentLeaked !== false || transcript.includes("DENIED_SIBLING_SECRET_TOKEN")) {
    issues.push("denied sibling content leaked into the child transcript.");
  }
  const latestScope = latestArrayItem(run.toolScopeSnapshots);
  const filesystem = objectValue(objectValue(objectValue(objectValue(latestScope?.resolverInputs).childAuthorityProfile).resourceScopes).filesystem);
  if (!Array.isArray(filesystem.readRoots) || filesystem.readRoots.length < 3) {
    issues.push("latest child authority profile is missing the three explicit read roots.");
  }
  if (Array.isArray(filesystem.writeRoots) && filesystem.writeRoots.length > 0) {
    issues.push("latest child authority profile unexpectedly grants write roots.");
  }
  if (filesystem.readDecision !== "allow") issues.push(`readDecision is ${filesystem.readDecision ?? "missing"}; expected allow.`);
  if (filesystem.writeDecision !== "deny") issues.push(`writeDecision is ${filesystem.writeDecision ?? "missing"}; expected deny.`);
  return { valid: issues.length === 0, issues };
}

export function validateApprovalAuthorityArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["artifact is missing."] };
  if (!artifact.provider) issues.push("artifact is missing provider.");
  const run = objectValue(artifact.run);
  if (run.status !== "needs_attention") issues.push(`child run status is ${run.status ?? "missing"}; expected needs_attention.`);
  if (!nonEmptyString(run.childThreadId)) issues.push("artifact is missing childThreadId.");
  const waitDetails = objectValue(artifact.waitDetails);
  if (waitDetails.status !== "needs_attention" || waitDetails.waitSatisfied !== false || waitDetails.synthesisAllowed !== false) {
    issues.push("wait_agent did not leave the parent blocked on a non-synthesizable child approval request.");
  }
  const pendingPermissions = Array.isArray(artifact.pendingPermissions) ? artifact.pendingPermissions : [];
  const permission = pendingPermissions.find((candidate) =>
    candidate?.threadId === run.childThreadId &&
    candidate?.toolName === "read" &&
    candidate?.grantActionKind === "file_content_read"
  );
  if (!permission) issues.push("artifact is missing a pending read permission scoped to the child thread.");
  const approvalEvent = parentApprovalEventForArtifact(artifact, {
    childRunId: run.id,
    childThreadId: run.childThreadId,
    approvalId: permission?.id,
    requestedToolId: "read",
    requestedAction: "file_content_read",
  });
  if (!approvalEvent) issues.push("artifact is missing the queued child approval request in the parent mailbox.");
  const evidenceDetails = objectValue(objectValue(objectValue(artifact.evidence).dogfoodRunEvidence).details);
  if (evidenceDetails.schemaVersion !== "ambient-subagent-live-approval-authority-evidence-v1") {
    issues.push("artifact is missing recorded live approval authority evidence.");
  }
  if (evidenceDetails.childPausedForApproval !== true) issues.push("recorded evidence does not prove childPausedForApproval.");
  if (evidenceDetails.parentRemainedBlocked !== true) issues.push("recorded evidence does not prove parentRemainedBlocked.");
  if (evidenceDetails.approvalForwardedToParent !== true) issues.push("recorded evidence does not prove approvalForwardedToParent.");
  if (artifact.deniedContentLeaked !== false || String(artifact.childTranscript ?? "").includes("APPROVAL_SECRET_TOKEN_SHOULD_NOT_LEAK")) {
    issues.push("denied approval content leaked into the child transcript.");
  }
  return { valid: issues.length === 0, issues };
}

export function validateBrowserApprovalAuthorityArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["artifact is missing."] };
  if (!artifact.provider) issues.push("artifact is missing provider.");
  if (artifact.parentPermissionMode !== "full-access") {
    issues.push(`parentPermissionMode is ${artifact.parentPermissionMode ?? "missing"}; expected full-access.`);
  }
  const run = objectValue(artifact.run);
  if (run.status !== "running") {
    issues.push(`post-approval child run status is ${run.status ?? "missing"}; expected running.`);
  }
  if (!nonEmptyString(run.childThreadId)) issues.push("artifact is missing childThreadId.");
  const waitDetails = objectValue(artifact.waitDetails);
  if (waitDetails.status !== "needs_attention" || waitDetails.waitSatisfied !== false || waitDetails.synthesisAllowed !== false) {
    issues.push("wait_agent did not leave the parent blocked on a child browser approval request.");
  }
  const preApprovalRun = objectValue(waitDetails.run);
  if (preApprovalRun.status !== undefined && preApprovalRun.status !== "needs_attention") {
    issues.push(`pre-approval child run status is ${preApprovalRun.status}; expected needs_attention.`);
  }
  const pendingBeforeApproval = Array.isArray(artifact.pendingBeforeApproval) ? artifact.pendingBeforeApproval : [];
  const permission = pendingBeforeApproval.find((candidate) =>
    candidate?.threadId === run.childThreadId &&
    candidate?.toolName === "browser_content" &&
    candidate?.grantActionKind === "browser_network" &&
    candidate?.grantTargetKind === "browser_origin" &&
    objectValue(candidate.grantConditions).childRunId === run.id
  );
  if (!permission) issues.push("artifact is missing a pending browser permission scoped to the child run.");
  const approvalEvent = parentApprovalEventForArtifact(artifact, {
    childRunId: run.id,
    childThreadId: run.childThreadId,
    approvalId: permission?.id,
    requestedToolId: "browser_content",
    requestedAction: "browser_network",
    deliveryState: "consumed",
  });
  if (!approvalEvent) issues.push("artifact is missing the parent mailbox browser approval request.");
  const consumedEvent = (Array.isArray(artifact.parentMailboxEvents) ? artifact.parentMailboxEvents : [])
    .find((event) => event?.type === "subagent.child_approval_requested" && event?.deliveryState === "consumed");
  if (!consumedEvent) issues.push("artifact is missing consumed parent mailbox approval after parent decision.");
  const responses = Array.isArray(artifact.permissionResponses) ? artifact.permissionResponses : [];
  if (!responses.some((response) => response?.id === permission?.id && response?.response === "always_thread")) {
    issues.push("artifact is missing child-thread scoped browser approval response.");
  }
  const resumeDetails = objectValue(artifact.resumeDetails);
  if (resumeDetails.status !== undefined && resumeDetails.status !== "running") {
    issues.push(`post-approval wait status is ${resumeDetails.status}; expected running.`);
  }
  if (resumeDetails.synthesisAllowed !== false) {
    issues.push("resume wait should keep parent synthesis blocked until the child reaches a synthesis-safe result.");
  }
  const runEventTypes = (Array.isArray(run.runEvents) ? run.runEvents : []).map((event) => event?.type);
  for (const expected of ["subagent.approval_requested", "subagent.child_approval_forwarded", "subagent.approval_response.consumed"]) {
    if (!runEventTypes.includes(expected)) issues.push(`artifact is missing run event ${expected}.`);
  }
  return { valid: issues.length === 0, issues };
}

const REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS = REQUIRED_DESKTOP_DOGFOOD_SCENARIOS;
const REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS = REQUIRED_DESKTOP_VISUAL_ASSERTIONS;
const REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS = REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS;

export function validateDesktopDogfoodConfidenceArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Desktop dogfood artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-subagent-desktop-dogfood-v1") {
    issues.push(`Desktop dogfood artifact schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") issues.push(`Desktop dogfood artifact status is ${artifact.status ?? "missing"}; expected passed.`);
  if (artifact.classification !== "passed") {
    issues.push(`Desktop dogfood artifact classification is ${artifact.classification ?? "missing"}; expected passed.`);
  }
  if (!nonEmptyString(artifact.provider)) issues.push("Desktop dogfood artifact is missing provider.");
  if (artifact.featureFlag !== "ambient.subagents") {
    issues.push(`Desktop dogfood artifact featureFlag is ${artifact.featureFlag ?? "missing"}; expected ambient.subagents.`);
  }
  for (const field of ["parentThreadId", "parentMessageId", "approvalId", "localRuntimeLeaseId", "localRuntimeId", "workflowTaskId", "workflowRunId"]) {
    if (!nonEmptyString(artifact[field])) issues.push(`Desktop dogfood artifact is missing ${field}.`);
  }
  if (!nonEmptyStringArray(artifact.childRunIds)) issues.push("Desktop dogfood artifact is missing childRunIds.");
  if (!nonEmptyStringArray(artifact.childThreadIds)) issues.push("Desktop dogfood artifact is missing childThreadIds.");
  for (const scenario of REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS) {
    if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes(scenario)) {
      issues.push(`Desktop dogfood artifact must include ${scenario} scenario evidence.`);
    }
  }

  const checks = objectValue(artifact.checks);
  const collapsed = objectValue(checks.collapsed);
  const expanded = objectValue(checks.expanded);
  const narrow = objectValue(checks.narrow);
  if (collapsed.defaultCollapsed !== true) issues.push("Desktop dogfood collapsed state is not default-collapsed.");
  if (collapsed.horizontalOverflowFree !== true) issues.push("Desktop dogfood collapsed state has horizontal overflow.");
  if (expanded.defaultCollapsed !== false) issues.push("Desktop dogfood expanded state did not open the cluster.");
  if (expanded.horizontalOverflowFree !== true) issues.push("Desktop dogfood expanded state has horizontal overflow.");
  if (narrow.horizontalOverflowFree !== true) issues.push("Desktop dogfood narrow view has horizontal overflow.");
  if (narrow.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood narrow view reports ${narrow.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
  validateDesktopInlineChildTranscriptChecks(checks, issues);
  requireTrueFields(checks.expanded?.approvalFlow, "Desktop dogfood approvalFlow", [
    "approvalRequested",
    "approvalBlockedChild",
    "parentStillBlocked",
    "childIdentifierVisible",
    "toolScopeVisible",
    "approvalScopeVisible",
    "approvalPromptVisible",
    "approveButtonVisible",
    "denyButtonVisible",
    "approvalButtonsNameChild",
  ], issues);
  requireTrueFields(checks.approvalDialog, "Desktop dogfood approvalDialog", [
    "dialogOpened",
    "dialogNamesApproval",
    "dialogNamesChildRun",
    "dialogNamesChildThread",
    "dialogNamesBlockingChild",
    "dialogShowsParentWaitState",
    "dialogShowsPrompt",
    "dialogShowsStandardScopes",
    "initialScopeThisAction",
  ], issues);
  requireTrueFields(checks.workflowExecution, "Desktop dogfood workflowExecution", [
    "workflowSectionVisible",
    "parentBlockerVisible",
    "taskIdVisible",
    "artifactIdVisible",
    "horizontalOverflowFree",
  ], issues);
  requireTrueFields(checks.approvalForwarding, "Desktop dogfood approvalForwarding", [
    "forwardedVisible",
    "approvedDecisionVisible",
    "childThreadScopeVisible",
    "forwardedNamesChild",
    "forwardedNamesApproval",
    "forwardedMatchesApprovalChild",
    "approvalRequestMatchesApprovalChild",
    "forwardedAndRequestSameChild",
    "approvalRequestStillVisible",
    "approvalRequestActionsRemoved",
    "parentStillBlockedAfterForward",
    "childRowDataMatchesApprovalChild",
    "childRowStillBlocksApprovalChild",
    "childReturnedToNeedsSteering",
    "waitBarrierStillVisible",
    "horizontalOverflowFree",
  ], issues);
  requireTrueFields(checks.chatExport?.approvalAuthorityContract, "Desktop dogfood approvalAuthorityContract", [
    "requestExported",
    "forwardedExported",
    "eventIdMatches",
    "schemaMatches",
    "childIdentityMatches",
    "requestedToolMatches",
    "requestedScopeThisAction",
    "requestEffectiveScopeNarrow",
    "forwardedEffectiveScopeChildThread",
    "parentBlockingResumeMatches",
    "forwardedParentBlockingResumeMatches",
    "waitBarrierMatches",
    "instructionPreservesBlocking",
  ], issues);
  requireTrueFields(checks.localRuntimeOwnership, "Desktop dogfood localRuntimeOwnership", [
    "runtimeInventoryVisible",
    "activeLeaseVisible",
    "ownerLabelVisible",
    "stopDisabledVisible",
    "affectedSubagentVisible",
    "untrackedRuntimeVisible",
    "untrackedStopDisabledVisible",
    "untrackedRestartDisabledVisible",
    "untrackedExternalStopGuidanceVisible",
    "horizontalOverflowFree",
  ], issues);
  requireTrueFields(checks.lifecycleEdgeVisibility, "Desktop dogfood lifecycleEdgeVisibility", [
    "clusterVisible",
    "clusterDefaultCollapsedBeforeOpen",
    "timeoutChildVisible",
    "partialChildVisible",
    "detachedChildVisible",
    "timeoutChoicesVisible",
    "partialDecisionVisible",
    "partialSummaryVisible",
    "detachDecisionVisible",
    "horizontalOverflowFree",
  ], issues);
  requireTrueFields(checks.parentStopCascadeVisibility, "Desktop dogfood parentStopCascadeVisibility", [
    "parentMessageVisible",
    "clusterVisible",
    "clusterDefaultCollapsedBeforeOpen",
    "summaryVisible",
    "requiredChildCancelledVisible",
    "optionalChildDetachedVisible",
    "completedChildUnchangedVisible",
    "parentStoppedMailboxVisible",
    "parentCancellationRequestedVisible",
    "cancelledWaitBarrierVisible",
    "cancelledMailboxEventsVisible",
    "cascadeReasonVisible",
    "cascadeIdentityCaptured",
    "horizontalOverflowFree",
  ], issues);
  requireTrueFields(checks.operatorBehavior, "Desktop dogfood operatorBehavior", [
    "completedChildClosed",
    "completedChildStillVisible",
    "completedChildControlsReleased",
    "attentionChildCancelled",
    "attentionChildStillVisible",
    "attentionCancelControlRemoved",
    "siblingStatePreserved",
    "lifecycleInterruptionVisible",
    "typedBarrierConsequenceVisible",
    "rowsStillInspectable",
    "horizontalOverflowFree",
  ], issues);
  if (checks.workflowHighLoad?.workflowRowCount < 6) {
    issues.push(`Desktop dogfood workflowHighLoad workflowRowCount is ${checks.workflowHighLoad?.workflowRowCount ?? "missing"}; expected at least 6.`);
  }
  for (const field of [
    "collapsedDesktopScreenshot",
    "expandedDesktopScreenshot",
    "approvalDialogScreenshot",
    "approvalForwardingDesktopScreenshot",
    "workflowHighLoadDesktopScreenshot",
    "lifecycleEdgeVisibilityDesktopScreenshot",
    "parentStopCascadeDesktopScreenshot",
    "localRuntimeOwnershipDesktopScreenshot",
    "expandedNarrowScreenshot",
    "operatorBehaviorDesktopScreenshot",
    "childTranscriptExpandedDesktopScreenshot",
    "completedChildTranscriptDesktopScreenshot",
    "deniedScopeExplanationDesktopScreenshot",
    "effectiveRoleSnapshotDesktopScreenshot",
    "multiClusterStressDesktopScreenshot",
    "mutatingWorkerDogfoodDesktopScreenshot",
    "patternGraphClickThroughDesktopScreenshot",
    "patternGraphCompletedClickThroughDesktopScreenshot",
    "restartRehydrationDesktopScreenshot",
    "workflowArtifactRehydrationDesktopScreenshot",
    "workflowExecutionDesktopScreenshot",
    "workflowRehydratedNavigationDesktopScreenshot",
    "chatExportZip",
    "accessibilitySnapshot",
  ]) {
    if (!safeRelativePath(artifact.artifacts?.[field])) {
      issues.push(`Desktop dogfood artifact ${field} must be a safe relative path.`);
    }
  }
  validatePassedAssertionObject(artifact.visualAssertions, REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS, "Desktop dogfood visual assertion", issues);
  validatePassedAssertionObject(artifact.maturityAssertions, REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS, "Desktop dogfood maturity assertion", issues);
  return { valid: issues.length === 0, issues };
}

function validateDesktopInlineChildTranscriptChecks(checks, issues) {
  const childTranscript = objectValue(checks.childTranscript);
  const completedChildTranscript = objectValue(checks.completedChildTranscript);
  requireTrueFields(childTranscript, "Desktop dogfood childTranscript", [
    "childExpanded",
    "transcriptPanelVisible",
    "liveTranscriptShellVisible",
    "liveTranscriptStreamVisible",
    "liveTranscriptStatusVisible",
    "miniThreadHeaderVisible",
    "miniThreadHeaderNamesChild",
    "openFullThreadActionVisible",
    "openFullThreadActionNamesChild",
    "liveTranscriptMessageCountVisible",
    "liveTranscriptRuntimeEventCountVisible",
    "liveTranscriptMessageCountMatchesBubbles",
    "liveTranscriptRuntimeEventCountPositive",
    "liveTranscriptModeLabelVisible",
    "runtimeEventRailVisible",
    "runtimeEventRailHasRecentEvents",
    "runtimeTimelineVisible",
    "runtimeTimelineCountVisible",
    "runtimeTimelineRenderedCountMatchesRows",
    "runtimeTimelineOmittedCountConsistent",
    "userMessageVisible",
    "assistantMessageVisible",
    "siblingSummaryNotLeakedIntoTranscript",
    "childRunIdVisible",
    "childThreadIdVisible",
    "liveContinuationMarkerVisible",
    "completionSummaryDeferredWhileLive",
    "transcriptEndStateCorrect",
    "summaryNotObscuringTranscript",
    "horizontalOverflowFree",
  ], issues);
  if (childTranscript.childTranscriptTerminal !== false) {
    issues.push("Desktop dogfood childTranscript childTranscriptTerminal must be false while running.");
  }
  if (childTranscript.completionEndCapVisible !== false) {
    issues.push("Desktop dogfood childTranscript completionEndCapVisible must be false while running.");
  }
  if (!Number.isInteger(childTranscript.messageBubbleCount) || childTranscript.messageBubbleCount < 2) {
    issues.push(`Desktop dogfood childTranscript messageBubbleCount is ${childTranscript.messageBubbleCount ?? "missing"}; expected at least 2.`);
  }
  if (!Number.isInteger(childTranscript.runtimeEventRows) || childTranscript.runtimeEventRows < 1) {
    issues.push(`Desktop dogfood childTranscript runtimeEventRows is ${childTranscript.runtimeEventRows ?? "missing"}; expected at least 1.`);
  }
  if (childTranscript.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood childTranscript reports ${childTranscript.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }

  requireTrueFields(completedChildTranscript, "Desktop dogfood completedChildTranscript", [
    "childExpanded",
    "transcriptPanelVisible",
    "liveTranscriptShellVisible",
    "liveTranscriptStreamVisible",
    "liveTranscriptStatusVisible",
    "miniThreadHeaderVisible",
    "miniThreadHeaderNamesChild",
    "openFullThreadActionVisible",
    "openFullThreadActionNamesChild",
    "liveTranscriptMessageCountVisible",
    "liveTranscriptMessageCountMatchesBubbles",
    "liveTranscriptModeLabelVisible",
    "runtimeEventRailVisible",
    "runtimeEventRailHasRecentEvents",
    "runtimeTimelineVisible",
    "runtimeTimelineCountVisible",
    "runtimeTimelineRenderedCountMatchesRows",
    "runtimeTimelineOmittedCountConsistent",
    "assistantMessageVisible",
    "siblingSummaryNotLeakedIntoTranscript",
    "childRunIdVisible",
    "childThreadIdVisible",
    "childTranscriptTerminal",
    "childTranscriptSynthesisSafe",
    "completionEndCapVisible",
    "completionEndCapLabelVisible",
    "completionEndCapAfterMessages",
    "completionSummaryDeferredWhileLive",
    "transcriptEndStateCorrect",
    "summaryNotObscuringTranscript",
    "horizontalOverflowFree",
  ], issues);
  if (completedChildTranscript.liveContinuationMarkerVisible !== false) {
    issues.push("Desktop dogfood completedChildTranscript liveContinuationMarkerVisible must be false after completion.");
  }
  if (!Number.isInteger(completedChildTranscript.messageBubbleCount) || completedChildTranscript.messageBubbleCount < 1) {
    issues.push(`Desktop dogfood completedChildTranscript messageBubbleCount is ${completedChildTranscript.messageBubbleCount ?? "missing"}; expected at least 1.`);
  }
  if (completedChildTranscript.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood completedChildTranscript reports ${completedChildTranscript.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
  if (!nonEmptyString(completedChildTranscript.completionEndCapText) ||
      !completedChildTranscript.completionEndCapText.includes("Completion summary")) {
    issues.push("Desktop dogfood completedChildTranscript completionEndCapText must include Completion summary.");
  }
}

function requireTrueFields(value, label, fields, issues) {
  const object = objectValue(value);
  for (const field of fields) {
    if (object[field] !== true) issues.push(`${label} ${field} is not true.`);
  }
}

function validatePassedAssertionObject(value, expectedIds, label, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${label}s are missing.`);
    return;
  }
  for (const id of expectedIds) {
    const assertion = value[id];
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      issues.push(`${label} ${id} is missing.`);
      continue;
    }
    if (assertion.status !== "passed") {
      issues.push(`${label} ${id} status is ${assertion.status ?? "missing"}; expected passed.`);
    }
    if (!nonEmptyStringArray(assertion.evidence)) {
      issues.push(`${label} ${id} is missing readable evidence.`);
    }
  }
}

export function validateWorkflowDogfoodArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Live workflow dogfood artifact is missing."] };
  if (artifact.run?.status !== "succeeded") {
    issues.push(`Live workflow dogfood run status is ${artifact.run?.status ?? "missing"}.`);
  }
  if (!artifact.run?.id) issues.push("Live workflow dogfood artifact is missing run id.");
  if (!artifact.artifact?.id) issues.push("Live workflow dogfood artifact is missing workflow artifact id.");
  if (!artifact.artifact?.workflowThreadId) issues.push("Live workflow dogfood artifact is missing workflowThreadId.");
  if (!positiveNumber(artifact.events)) issues.push("Live workflow dogfood artifact is missing runtime event evidence.");
  if ("fileReads" in artifact && !positiveNumber(artifact.fileReads)) {
    issues.push("Live workflow dogfood artifact is missing file_read tool evidence.");
  }
  const modelCalls = Array.isArray(artifact.modelCalls) ? artifact.modelCalls : [];
  if (!modelCalls.some((call) => call?.status === "succeeded")) {
    issues.push("Live workflow dogfood artifact is missing a succeeded Ambient model call.");
  }
  if (!artifact.checkpoint) issues.push("Live workflow dogfood artifact is missing checkpoint output.");
  return { valid: issues.length === 0, issues };
}

export function validateWorkflowSymphonyConfidenceArtifacts(input = {}) {
  const workflow = validateWorkflowDogfoodArtifact(input.liveWorkflowArtifact);
  const workflowUiDogfood = validateWorkflowUiDogfoodMatrixArtifact(
    input.workflowUiDogfoodArtifact,
    workflowUiDogfoodValidationOptions(input.workflowUiDogfoodProfile),
  );
  const callableDogfood = validateCallableWorkflowDogfoodConfidenceArtifact(input.callableWorkflowDogfoodArtifact);
  const callableRehydration = validateCallableWorkflowRehydrationConfidenceArtifact(input.callableWorkflowRehydrationArtifact);
  const issues = [
    ...workflow.issues,
    ...workflowUiDogfood.issues,
    ...callableDogfood.issues,
    ...callableRehydration.issues,
  ];
  return {
    valid: issues.length === 0,
    issues,
    parts: {
      workflow,
      workflowUiDogfood,
      callableDogfood,
      callableRehydration,
    },
  };
}

export function validateWorkflowUiDogfoodMatrixArtifact(artifact, options = {}) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Workflow Agent UI dogfood matrix artifact is missing."] };
  const expectedSuite = options.expectedSuite ?? "phase0-live";
  const requiredScenarios = options.requiredScenarios ?? REQUIRED_BASELINE_WORKFLOW_UI_DOGFOOD_SCENARIOS;
  if (artifact.ok !== true) issues.push("Workflow Agent UI dogfood matrix did not pass.");
  if (artifact.preflight?.requested === true && artifact.preflight?.ok !== true) {
    const preflightIssues = Array.isArray(artifact.preflight.issues) && artifact.preflight.issues.length > 0
      ? artifact.preflight.issues.join(" ")
      : `status=${artifact.preflight.status ?? "unknown"}`;
    issues.push(`Workflow Agent UI dogfood matrix preflight failed: ${preflightIssues}`);
  }
  if (artifact.suite && artifact.suite !== expectedSuite) {
    issues.push(`Workflow Agent UI dogfood matrix suite is ${artifact.suite}; expected ${expectedSuite}.`);
  }
  const scenarios = Array.isArray(artifact.scenarios) ? artifact.scenarios : [];
  for (const required of requiredScenarios) {
    if (!scenarios.includes(required)) issues.push(`Workflow Agent UI dogfood matrix is missing scenario ${required}.`);
  }
  const results = Array.isArray(artifact.results) ? artifact.results : [];
  const expectedResultCount = Math.max(requiredScenarios.length, scenarios.length, 2);
  if (results.length < expectedResultCount) {
    issues.push(`Workflow Agent UI dogfood matrix has ${results.length} result(s); expected at least ${expectedResultCount}.`);
  }
  for (const result of results) {
    const scenario = result?.scenario ?? "unknown";
    if (result?.ok !== true) issues.push(`Workflow Agent UI dogfood scenario ${scenario} did not pass.`);
    if (result?.exitCode !== 0) issues.push(`Workflow Agent UI dogfood scenario ${scenario} exitCode is ${result?.exitCode ?? "missing"}.`);
    if (result?.runStatus !== "succeeded") issues.push(`Workflow Agent UI dogfood scenario ${scenario} runStatus is ${result?.runStatus ?? "missing"}.`);
    if (!nonEmptyString(result?.reportPath)) issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing reportPath.`);
    if (result?.scenarioAssertions?.passed !== true) {
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing passed scenario assertions.`);
    }
    const runEvidence = result?.runEvidence ?? {};
    if (!positiveNumber(runEvidence.events)) issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing runtime event evidence.`);
    if (!positiveNumber(runEvidence.modelCalls)) issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing model call evidence.`);
    if (!positiveNumber(runEvidence.checkpoints)) issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing checkpoint evidence.`);
    if (!positiveNumber(runEvidence.outputSignals)) issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing output signal evidence.`);
    const finalOutput = result?.finalOutput ?? result?.scenarioAssertions?.finalOutput ?? {};
    if (!positiveNumber(finalOutput.charCount)) {
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing final output evidence.`);
    }
    if (!Array.isArray(result?.screenshots) || result.screenshots.length === 0) {
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} is missing screenshot evidence.`);
    }
    if (options.requiredLaunchWorkspaceMode && result?.launch?.workspaceMode !== options.requiredLaunchWorkspaceMode) {
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} launch workspaceMode is ${result?.launch?.workspaceMode ?? "missing"}; expected ${options.requiredLaunchWorkspaceMode}.`);
    }
    if (options.requiredGoogleWorkspaceStatus && result?.launch?.googleWorkspace?.status !== options.requiredGoogleWorkspaceStatus) {
      issues.push(`Workflow Agent UI dogfood scenario ${scenario} Google Workspace status is ${result?.launch?.googleWorkspace?.status ?? "missing"}; expected ${options.requiredGoogleWorkspaceStatus}.`);
    }
  }
  return { valid: issues.length === 0, issues };
}

function workflowUiDogfoodProfileForSliceKind(sliceKind) {
  return sliceKind === "workflow_symphony_broader" ? "broader" : "baseline";
}

function workflowUiDogfoodValidationOptions(profile) {
  if (profile === "broader") {
    return {
      expectedSuite: "phase1-live",
      requiredScenarios: REQUIRED_BROADER_WORKFLOW_UI_DOGFOOD_SCENARIOS,
      requiredLaunchWorkspaceMode: "shared-snapshot-temp-copy",
      requiredGoogleWorkspaceStatus: "configured",
    };
  }
  return {
    expectedSuite: "phase0-live",
    requiredScenarios: REQUIRED_BASELINE_WORKFLOW_UI_DOGFOOD_SCENARIOS,
  };
}

const REQUIRED_CALLABLE_WORKFLOW_DOGFOOD_MATURITY_ASSERTIONS = [{
  id: "workflow_launch_card_bounds",
  capabilities: ["workflow_launch", "launch_card_bounds", "pause_resume_cancel"],
}, {
  id: "workflow_mutating_child_worker",
  capabilities: ["mutating_child_workflow", "child_scoped_approval", "isolated_child_worktree"],
}, {
  id: "workflow_parent_blocking_completion",
  capabilities: ["parent_blocking_workflow", "workflow_launch"],
}, {
  id: "workflow_denied_child_scope",
  capabilities: ["denied_workflow_scope", "child_workflow_scope"],
}, {
  id: "workflow_restart_repair",
  capabilities: ["workflow_task_rehydration", "restart_repair"],
}];

const REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS = [{
  id: "workflow_rehydrated_task_links",
  capabilities: ["workflow_task_rehydration", "artifact_link"],
}, {
  id: "workflow_rehydrated_artifact_payload",
  capabilities: ["artifact_link", "checkpoint_output"],
}, {
  id: "workflow_rehydrated_progress_usage",
  capabilities: ["workflow_task_rehydration", "checkpoint_output"],
}, {
  id: "workflow_rehydrated_child_provenance",
  capabilities: ["child_workflow_provenance", "workflow_task_rehydration"],
}];

export function validateCallableWorkflowDogfoodConfidenceArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Callable workflow dogfood artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-callable-workflow-dogfood-evidence-v1") {
    issues.push(`Callable workflow dogfood schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  const task = objectValue(artifact.task);
  if (task.status !== "succeeded") issues.push(`Callable workflow dogfood task status is ${task.status ?? "missing"}.`);
  if (task.blocking !== true) issues.push("Callable workflow dogfood task must be blocking.");
  for (const field of ["id", "workflowArtifactId", "workflowRunId"]) {
    if (!nonEmptyString(task[field])) issues.push(`Callable workflow dogfood task is missing ${field}.`);
  }

  const launchCard = objectValue(artifact.launchCard);
  if (launchCard.present !== true) issues.push("Callable workflow dogfood launch card proof is missing.");
  if (!["low", "medium", "high"].includes(launchCard.riskLevel)) {
    issues.push("Callable workflow dogfood launch card riskLevel is missing or invalid.");
  }
  for (const field of ["estimatedAgents", "maxFanout", "maxDepth", "estimatedTokenBudget", "estimatedLocalMemoryBytes"]) {
    if (!positiveNumber(launchCard[field])) issues.push(`Callable workflow dogfood launch card is missing ${field}.`);
  }
  if (launchCard.defaultCollapsed !== true) issues.push("Callable workflow dogfood launch card must be default collapsed.");
  if (launchCard.blocking !== true) issues.push("Callable workflow dogfood launch card must be blocking.");
  if (launchCard.pauseResumeCancel !== true) {
    issues.push("Callable workflow dogfood task must expose pause/resume/cancel controls.");
  }
  if (!nonEmptyString(launchCard.checkpointResume)) {
    issues.push("Callable workflow dogfood launch card is missing checkpoint/resume text.");
  }
  if (!nonEmptyString(launchCard.approvalFailureHandling)) {
    issues.push("Callable workflow dogfood launch card is missing approval failure handling text.");
  }
  if (!nonEmptyStringArray(launchCard.requirementIds)) {
    issues.push("Callable workflow dogfood launch card is missing requirementIds.");
  }
  if (!nonEmptyStringArray(launchCard.metricTemplateIds)) {
    issues.push("Callable workflow dogfood launch card is missing metricTemplateIds.");
  }

  const childCaller = objectValue(artifact.childCaller);
  if (childCaller.kind !== "subagent_child_thread") issues.push("Callable workflow dogfood must be child-originated.");
  for (const field of ["threadId", "runId", "subagentRunId", "canonicalTaskPath", "parentThreadId", "parentRunId"]) {
    if (!nonEmptyString(childCaller[field])) issues.push(`Callable workflow dogfood child caller is missing ${field}.`);
  }

  const mutation = objectValue(artifact.mutation);
  if (mutation.mutationPolicy === "read_only") issues.push("Callable workflow dogfood must use a mutating artifact policy.");
  if (mutation.approvalRequired !== true) issues.push("Callable workflow dogfood must prove approvalRequired.");
  if (mutation.approvalSource !== "child_bridge_policy") issues.push("Callable workflow dogfood approvalSource must be child_bridge_policy.");
  if (mutation.approvalScope !== "this_child_thread") issues.push("Callable workflow dogfood approvalScope must be this_child_thread.");
  if (mutation.worktreeRequired !== true) issues.push("Callable workflow dogfood must require a worktree.");
  if (mutation.worktreeIsolated !== true) issues.push("Callable workflow dogfood must use an isolated worktree.");
  if (mutation.worktreeStatus !== "active") issues.push("Callable workflow dogfood worktreeStatus must be active.");
  if (mutation.worktreePathPresent !== true) issues.push("Callable workflow dogfood must prove a worktree path was present.");
  if (mutation.nestedFanoutRequired !== true) issues.push("Callable workflow dogfood must require nested fanout policy.");
  if (mutation.nestedFanoutSource !== "child_bridge_policy") issues.push("Callable workflow dogfood nestedFanoutSource must be child_bridge_policy.");

  const mutationOutput = objectValue(artifact.mutationOutput);
  if (mutationOutput.kind !== "staged_file") issues.push("Callable workflow dogfood mutation output must be staged_file.");
  if (!safeRelativePath(mutationOutput.stagedRelativePath)) {
    issues.push("Callable workflow dogfood mutation output is missing a safe stagedRelativePath.");
  }
  if (!sha256Hex(mutationOutput.stagedFileSha256)) issues.push("Callable workflow dogfood mutation output is missing stagedFileSha256.");
  if (!nonEmptyString(mutationOutput.fullArtifactPath)) issues.push("Callable workflow dogfood mutation output is missing fullArtifactPath.");
  if (!positiveNumber(mutationOutput.fullArtifactBytes)) issues.push("Callable workflow dogfood mutation output is missing fullArtifactBytes.");
  if (!sha256Hex(mutationOutput.fullArtifactSha256)) issues.push("Callable workflow dogfood mutation output is missing fullArtifactSha256.");
  if (!nonEmptyString(mutationOutput.boundedPreview) || mutationOutput.boundedPreview.length > 512) {
    issues.push("Callable workflow dogfood mutation output must include a boundedPreview.");
  }
  if (!positiveNumber(mutationOutput.previewBytes)) issues.push("Callable workflow dogfood mutation output is missing previewBytes.");
  if (mutationOutput.previewTruncated !== true) issues.push("Callable workflow dogfood mutation output must prove previewTruncated.");
  if (mutationOutput.parentWorkspaceUnchanged !== true) {
    issues.push("Callable workflow dogfood mutation output must prove parentWorkspaceUnchanged.");
  }

  const workflow = objectValue(artifact.workflow);
  if (!nonEmptyString(workflow.workflowThreadId)) issues.push("Callable workflow dogfood is missing workflowThreadId.");
  if (workflow.taskArtifactLinkMatches !== true) issues.push("Callable workflow dogfood artifact link must match the task.");
  if (workflow.taskRunLinkMatches !== true) issues.push("Callable workflow dogfood run link must match the task.");
  if (workflow.runStatus !== "succeeded") issues.push(`Callable workflow dogfood runStatus is ${workflow.runStatus ?? "missing"}.`);

  const taskEvents = objectValue(artifact.taskEvents);
  if (taskEvents.started !== true) issues.push("Callable workflow dogfood is missing task-started event proof.");
  if (taskEvents.finished !== true) issues.push("Callable workflow dogfood is missing task-finished event proof.");

  const parentBlocking = objectValue(artifact.parentBlocking);
  if (parentBlocking.blockedBeforeCompletion !== true) {
    issues.push("Callable workflow dogfood must prove parent synthesis was blocked before completion.");
  }
  if (parentBlocking.unblockedAfterCompletion !== true) {
    issues.push("Callable workflow dogfood must prove parent synthesis unblocked after completion.");
  }
  if (!Array.isArray(parentBlocking.waitingTaskIds) || parentBlocking.waitingTaskIds.length === 0) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing waitingTaskIds.");
  }
  const allowedChoices = Array.isArray(parentBlocking.allowedUserChoiceIds) ? parentBlocking.allowedUserChoiceIds : [];
  if (!allowedChoices.includes("wait_again") || !allowedChoices.includes("cancel_parent")) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing wait/cancel choices.");
  }
  if (!String(parentBlocking.idempotencyKey ?? "").startsWith("callable-workflow:parent-finalization-blocked:")) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing a stable idempotency key.");
  }

  const deniedScope = objectValue(artifact.deniedScope);
  if (deniedScope.denied !== true) issues.push("Callable workflow dogfood must prove denied child workflow scope.");
  const deniedCategories = Array.isArray(deniedScope.deniedCategoryIds) ? deniedScope.deniedCategoryIds : [];
  const deniedTools = Array.isArray(deniedScope.deniedToolIds) ? deniedScope.deniedToolIds : [];
  if (!deniedCategories.includes("workflow.call")) issues.push("Callable workflow dogfood denied scope is missing workflow.call.");
  if (!deniedTools.some((id) => typeof id === "string" && id.startsWith("callable_workflow:ambient_workflow_"))) {
    issues.push("Callable workflow dogfood denied scope is missing exact callable workflow tool denial.");
  }
  const bridgeReasons = Array.isArray(deniedScope.bridgeReasons) ? deniedScope.bridgeReasons : [];
  for (const reasonFragment of [
    "disabled by child role policy",
    "requires an active isolated child worktree",
    "nested fanout limit is exhausted",
  ]) {
    if (!bridgeReasons.some((reason) => typeof reason === "string" && reason.includes(reasonFragment))) {
      issues.push(`Callable workflow dogfood denied scope is missing bridge reason: ${reasonFragment}.`);
    }
  }

  const restart = objectValue(artifact.restart);
  if (restart.terminalRepairObserved !== true) {
    issues.push("Callable workflow dogfood must observe terminal workflow restart repair.");
  }
  if (!Array.isArray(restart.repairedTaskIds) || restart.repairedTaskIds.length === 0) {
    issues.push("Callable workflow dogfood restart proof is missing repaired task IDs.");
  }
  if (!Array.isArray(restart.diagnosticTaskIds) || restart.diagnosticTaskIds.length === 0) {
    issues.push("Callable workflow dogfood restart proof is missing diagnostic task IDs.");
  }
  validateWorkflowMaturityAssertions(
    artifact.maturityAssertions,
    issues,
    "Callable workflow dogfood",
    REQUIRED_CALLABLE_WORKFLOW_DOGFOOD_MATURITY_ASSERTIONS,
  );
  return { valid: issues.length === 0, issues };
}

export function validateCallableWorkflowRehydrationConfidenceArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Callable workflow rehydration artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-callable-workflow-rehydration-evidence-v1") {
    issues.push(`Callable workflow rehydration schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }

  const task = objectValue(artifact.task);
  if (task.status !== "running") issues.push(`Callable workflow rehydration task status is ${task.status ?? "missing"}.`);
  if (task.blocking !== true) issues.push("Callable workflow rehydration task must be blocking.");
  for (const field of ["id", "workflowThreadId", "workflowArtifactId", "workflowRunId"]) {
    if (!nonEmptyString(task[field])) issues.push(`Callable workflow rehydration task is missing ${field}.`);
  }

  const rehydration = objectValue(artifact.rehydration);
  for (const field of [
    "sameTaskId",
    "sameArtifactId",
    "sameRunId",
    "workflowThreadHydrated",
    "artifactSourcePathHydrated",
    "artifactStatePathHydrated",
    "artifactMutationPolicyHydrated",
    "artifactSpecHydrated",
    "launchCardHydrated",
    "executionPlanHydrated",
    "progressHydrated",
    "usageHydrated",
  ]) {
    if (rehydration[field] !== true) issues.push(`Callable workflow rehydration proof is missing ${field}.`);
  }

  const childCaller = objectValue(artifact.childCaller);
  if (childCaller.kind !== "subagent_child_thread") {
    issues.push("Callable workflow rehydration must prove child-originated caller provenance.");
  }
  for (const field of ["threadId", "runId", "subagentRunId", "canonicalTaskPath", "parentThreadId", "parentRunId"]) {
    if (!nonEmptyString(childCaller[field])) issues.push(`Callable workflow rehydration child caller is missing ${field}.`);
  }

  const workflowArtifact = objectValue(artifact.artifact);
  if (workflowArtifact.id !== task.workflowArtifactId) {
    issues.push("Callable workflow rehydration task artifact link does not match artifact.");
  }
  if (!nonEmptyString(workflowArtifact.workflowThreadId)) issues.push("Callable workflow rehydration artifact is missing workflowThreadId.");
  if (!nonEmptyString(workflowArtifact.sourcePath)) issues.push("Callable workflow rehydration artifact is missing sourcePath.");
  if (!nonEmptyString(workflowArtifact.statePath)) issues.push("Callable workflow rehydration artifact is missing statePath.");
  if (!nonEmptyString(workflowArtifact.mutationPolicy)) issues.push("Callable workflow rehydration artifact is missing mutationPolicy.");
  if (!nonEmptyString(workflowArtifact.specGoal)) issues.push("Callable workflow rehydration artifact is missing specGoal.");
  if (workflowArtifact.workflowThreadId !== task.workflowThreadId) {
    issues.push("Callable workflow rehydration workflowThreadId was not joined from the artifact.");
  }

  const workflowRun = objectValue(artifact.workflowRun);
  if (workflowRun.id !== task.workflowRunId) issues.push("Callable workflow rehydration task run link does not match workflowRun.");
  if (workflowRun.artifactId !== task.workflowArtifactId) {
    issues.push("Callable workflow rehydration workflow run does not point at the task artifact.");
  }
  if (workflowRun.status !== "running") {
    issues.push(`Callable workflow rehydration workflow run status is ${workflowRun.status ?? "missing"}.`);
  }

  const progress = objectValue(artifact.progressSnapshot);
  if (!positiveNumber(progress.eventCount)) issues.push("Callable workflow rehydration progress is missing eventCount.");
  if (!positiveNumber(progress.modelCallCount)) issues.push("Callable workflow rehydration progress is missing modelCallCount.");
  if (!positiveNumber(progress.completedStepCount)) issues.push("Callable workflow rehydration progress is missing completedStepCount.");
  if (!nonEmptyString(progress.lastEventType)) issues.push("Callable workflow rehydration progress is missing lastEventType.");

  const usage = objectValue(artifact.usageSnapshot);
  if (!positiveNumber(usage.modelCallCount)) issues.push("Callable workflow rehydration usage is missing modelCallCount.");
  if (!positiveNumber(usage.tokenCount)) issues.push("Callable workflow rehydration usage is missing tokenCount.");
  if (typeof usage.tokenCountEstimated !== "boolean") issues.push("Callable workflow rehydration usage is missing tokenCountEstimated.");
  if (!positiveNumber(usage.costMicros)) issues.push("Callable workflow rehydration usage is missing costMicros.");
  if (typeof usage.costEstimated !== "boolean") issues.push("Callable workflow rehydration usage is missing costEstimated.");

  const taskEvents = objectValue(artifact.taskEvents);
  if (taskEvents.started !== true) issues.push("Callable workflow rehydration is missing task-started event proof.");
  const eventTypes = Array.isArray(taskEvents.eventTypes) ? taskEvents.eventTypes : [];
  if (!eventTypes.includes("step.end")) issues.push("Callable workflow rehydration is missing persisted workflow progress event proof.");
  validateWorkflowMaturityAssertions(
    artifact.maturityAssertions,
    issues,
    "Callable workflow rehydration",
    REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS,
  );
  return { valid: issues.length === 0, issues };
}

function validateWorkflowMaturityAssertions(maturityAssertions, issues, label, expectedAssertions) {
  if (!maturityAssertions || typeof maturityAssertions !== "object" || Array.isArray(maturityAssertions)) {
    issues.push(`${label} evidence is missing maturityAssertions.`);
    return;
  }

  for (const expected of expectedAssertions) {
    const assertion = maturityAssertions[expected.id];
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      issues.push(`${label} maturity assertion ${expected.id} is missing.`);
      continue;
    }
    if (assertion.id !== expected.id) {
      issues.push(`${label} maturity assertion ${expected.id} has mismatched id ${assertion.id ?? "missing"}.`);
    }
    if (assertion.status !== "passed") {
      issues.push(`${label} maturity assertion ${expected.id} status is ${assertion.status ?? "missing"}; expected passed.`);
    }
    const evidence = Array.isArray(assertion.evidence) ? assertion.evidence : [];
    if (!evidence.some(nonEmptyString)) {
      issues.push(`${label} maturity assertion ${expected.id} is missing readable evidence.`);
    } else if (!evidence.every((entry) => typeof entry === "string" && /^passed: .+/.test(entry))) {
      issues.push(`${label} maturity assertion ${expected.id} must record only passed evidence entries.`);
    }
    const capabilities = Array.isArray(assertion.capabilities) ? assertion.capabilities : [];
    if (!capabilities.some(nonEmptyString)) {
      issues.push(`${label} maturity assertion ${expected.id} is missing capabilities.`);
    }
    for (const capability of expected.capabilities) {
      if (!capabilities.includes(capability)) {
        issues.push(`${label} maturity assertion ${expected.id} is missing capability ${capability}.`);
      }
    }
  }
}

export function validateLocalRuntimeControlProofArtifact(artifact, gateArtifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Local runtime control proof artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-local-runtime-control-proof-v1") {
    issues.push(`Local runtime control proof schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  const scenarios = artifact.scenarios && typeof artifact.scenarios === "object" ? artifact.scenarios : {};
  const minicpm = scenarios["minicpm-nondestructive-stop"];
  const blocker = scenarios["active-subagent-stop-blocker"];
  const untracked = scenarios["untracked-runtime-safety"];
  const staleRecovery = scenarios["stale-lease-recovery"];
  const stoppedDisplay = scenarios["stopped-provider-display"];
  const providerLifecycle = scenarios["provider-declared-lifecycle"];

  requirePassedScenario(minicpm, "minicpm-nondestructive-stop", issues);
  if (minicpm) {
    if (minicpm.stopped !== true) issues.push("MiniCPM proof did not prove stopped=true.");
    if (minicpm.uninstalled === true) issues.push("MiniCPM proof reported uninstalled=true.");
    if (minicpm.packageStatePreserved !== true) issues.push("MiniCPM proof did not prove provider package state was preserved.");
  }

  requirePassedScenario(blocker, "active-subagent-stop-blocker", issues);
  if (blocker) {
    if (blocker.ordinaryStopAllowed !== false) issues.push("Sub-agent stop-blocker proof did not prove ordinaryStopAllowed=false.");
    if (!positiveNumber(blocker.activeLeaseCount)) issues.push("Sub-agent stop-blocker proof did not prove an active local runtime lease.");
    if (!Array.isArray(blocker.affectedSubagents) || blocker.affectedSubagents.length < 1) {
      issues.push("Sub-agent stop-blocker proof did not list affected sub-agents.");
    } else {
      const owner = blocker.affectedSubagents[0];
      for (const field of ["leaseId", "parentThreadId", "subagentThreadId", "modelRuntimeId", "modelProfileId", "providerId", "capabilityKind"]) {
        if (!owner?.[field]) issues.push(`Sub-agent stop-blocker proof affected sub-agent is missing ${field}.`);
      }
    }
    if (blocker.forceRequiresSubagentCancellation !== true) {
      issues.push("Sub-agent stop-blocker proof did not prove forced termination requires sub-agent cancellation.");
    }
  }

  requirePassedScenario(untracked, "untracked-runtime-safety", issues);
  if (untracked) {
    if (untracked.trackingStatus !== "untracked") issues.push("Untracked runtime proof did not prove trackingStatus=untracked.");
    if (untracked.ordinaryStopAllowed !== false) issues.push("Untracked runtime proof did not prove ordinaryStopAllowed=false.");
    if (untracked.ordinaryRestartAllowed !== false) issues.push("Untracked runtime proof did not prove ordinaryRestartAllowed=false.");
    if (untracked.forceTerminationAllowed !== false) issues.push("Untracked runtime proof did not prove forceTerminationAllowed=false.");
    if (untracked.untracked !== true) issues.push("Untracked runtime proof did not preserve untracked=true.");
    const untrackedRuntimeIds = Array.isArray(untracked.untrackedRuntimeIds) ? untracked.untrackedRuntimeIds : [];
    if (!untrackedRuntimeIds.includes(untracked.runtimeEntryId)) {
      issues.push("Untracked runtime proof did not include the runtime in untrackedRuntimeIds.");
    }
    const nextSafeActions = Array.isArray(untracked.nextSafeActions) ? untracked.nextSafeActions : [];
    const mutationToolNames = nextSafeActions
      .map((action) => typeof action?.toolName === "string" ? action.toolName : "")
      .filter((toolName) => localRuntimeLifecycleMutationTools.has(toolName));
    if (mutationToolNames.length > 0) {
      issues.push(`Untracked runtime proof exposed lifecycle mutation tools: ${mutationToolNames.join(", ")}.`);
    }
    if (!nextSafeActions.some((action) => action?.action === "ask-user-to-stop-untracked" && action?.safety === "external")) {
      issues.push("Untracked runtime proof did not offer external ask-user-to-stop-untracked guidance.");
    }
    validateRepeatedUntrackedObservations(untracked, issues);
  }

  requirePassedScenario(staleRecovery, "stale-lease-recovery", issues);
  if (staleRecovery) {
    if (staleRecovery.ordinaryStopAllowed !== true) issues.push("Stale lease recovery proof did not prove ordinaryStopAllowed=true.");
    if (staleRecovery.ordinaryRestartAllowed !== true) issues.push("Stale lease recovery proof did not prove ordinaryRestartAllowed=true.");
    if (staleRecovery.forceRequiresSubagentCancellation !== false) {
      issues.push("Stale lease recovery proof did not prove forced lifecycle avoids sub-agent cancellation.");
    }
    if (staleRecovery.activeLeaseCount !== 0) issues.push("Stale lease recovery proof did not prove activeLeaseCount=0.");
    if (staleRecovery.activeOwnerCount !== 0) issues.push("Stale lease recovery proof did not prove activeOwnerCount=0.");
    const staleLeaseIds = Array.isArray(staleRecovery.staleLeaseIds) ? staleRecovery.staleLeaseIds : [];
    if (!staleLeaseIds.includes("lease-stale")) {
      issues.push("Stale lease recovery proof did not preserve lease-stale in staleLeaseIds.");
    }
    const blockerLeaseIds = Array.isArray(staleRecovery.blockerLeaseIds) ? staleRecovery.blockerLeaseIds : [];
    if (blockerLeaseIds.length > 0) issues.push("Stale lease recovery proof still reports blockerLeaseIds.");
    if (Array.isArray(staleRecovery.affectedSubagents) && staleRecovery.affectedSubagents.length > 0) {
      issues.push("Stale lease recovery proof still reports affected sub-agents.");
    }
    const nextSafeActions = Array.isArray(staleRecovery.nextSafeActions) ? staleRecovery.nextSafeActions : [];
    if (!nextSafeActions.some((action) => action?.action === "stop-runtime" && action?.toolName === "ambient_local_model_runtime_stop")) {
      issues.push("Stale lease recovery proof did not offer an ordinary Stop preview action.");
    }
    if (!nextSafeActions.some((action) => action?.action === "restart-runtime" && action?.toolName === "ambient_local_model_runtime_restart")) {
      issues.push("Stale lease recovery proof did not offer an ordinary Restart preview action.");
    }
    if (nextSafeActions.some((action) => action?.action === "force-stop-runtime" || action?.action === "force-restart-runtime")) {
      issues.push("Stale lease recovery proof still offered forced ownership resolution actions.");
    }
  }

  requirePassedScenario(stoppedDisplay, "stopped-provider-display", issues);
  if (stoppedDisplay) {
    if (stoppedDisplay.minicpmDisplayedStopped !== true) issues.push("Stopped-provider display proof did not prove MiniCPM displayed stopped.");
    if (stoppedDisplay.voiceDisplayedStopped !== true) issues.push("Stopped-provider display proof did not prove voice provider displayed stopped.");
  }

  requirePassedScenario(providerLifecycle, "provider-declared-lifecycle", issues);
  if (providerLifecycle) {
    const actions = new Set(Array.isArray(providerLifecycle.actions) ? providerLifecycle.actions : []);
    for (const action of ["start", "stop", "restart"]) {
      if (!actions.has(action)) issues.push(`Provider-declared lifecycle proof did not prove ${action}.`);
    }
    if (providerLifecycle.usedGenericLifecycle === true) issues.push("Provider-declared lifecycle proof reported generic lifecycle use.");
  }

  if (!gateArtifact) {
    issues.push("Local runtime control proof gate artifact is missing.");
  } else {
    if (gateArtifact.schemaVersion !== "ambient-local-runtime-control-proof-gate-v1") {
      issues.push(`Local runtime control proof gate schemaVersion is ${gateArtifact.schemaVersion ?? "missing"}.`);
    }
    if (gateArtifact.status === "attention") {
      issues.push("Local runtime control proof gate reported attention status.");
    }
    const blockingIssues = Array.isArray(gateArtifact.releaseDecision?.blockingIssues)
      ? gateArtifact.releaseDecision.blockingIssues
      : [];
    if (blockingIssues.length > 0) {
      issues.push(`Local runtime control proof gate reported blocking issues: ${blockingIssues.join(" ")}`);
    }
    const failedChecks = (Array.isArray(gateArtifact.checks) ? gateArtifact.checks : [])
      .filter((check) => check?.status === "failed")
      .map((check) => check.id ?? "unknown");
    if (failedChecks.length > 0) {
      issues.push(`Local runtime control proof gate has failed checks: ${failedChecks.join(", ")}`);
    }
  }
  return { valid: issues.length === 0, issues };
}

const localRuntimeLifecycleMutationTools = new Set([
  "ambient_local_model_runtime_start",
  "ambient_local_model_runtime_stop",
  "ambient_local_model_runtime_restart",
]);

const REQUIRED_LIFECYCLE_EDGE_KINDS = ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"];

export function validateSubagentRestartRepairArtifact(artifact, fixtureArtifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Sub-agent restart repair diagnostics artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-subagent-replay-diagnostics-v1") {
    issues.push(`Sub-agent restart repair diagnostics schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") {
    issues.push(`Sub-agent restart repair diagnostics status is ${artifact.status ?? "missing"}.`);
  }
  if (artifact.plan?.fixture !== "restart-repair-broken-child-tree") {
    issues.push(`Sub-agent restart repair fixture is ${artifact.plan?.fixture ?? "missing"}.`);
  }
  if (artifact.plan?.liveTokens !== false) {
    issues.push("Sub-agent restart repair replay diagnostics must not require live tokens.");
  }
  if (artifact.commandResult?.exitCode !== 0) {
    issues.push(`Sub-agent restart repair command exit code is ${artifact.commandResult?.exitCode ?? "missing"}.`);
  }
  if (artifact.vitest?.status !== "passed") {
    issues.push(`Sub-agent restart repair vitest status is ${artifact.vitest?.status ?? "missing"}.`);
  }
  if (Array.isArray(artifact.vitest?.missingReplayTests) && artifact.vitest.missingReplayTests.length > 0) {
    issues.push(`Sub-agent restart repair is missing replay tests: ${artifact.vitest.missingReplayTests.join(", ")}`);
  }
  const replayEvidence = artifact.replayEvidence;
  validateRestartRepairReplayEvidence(replayEvidence, issues);
  if (fixtureArtifact) validateRestartRepairReplayEvidence(fixtureArtifact, issues, "fixture ");
  return { valid: issues.length === 0, issues };
}

export function validateSubagentRestartRepairConfidenceArtifacts(restartRepairArtifact, fixtureArtifact, lifecycleEdgeArtifact) {
  const restartRepair = validateSubagentRestartRepairArtifact(restartRepairArtifact, fixtureArtifact);
  const lifecycleEdges = validateSubagentLifecycleEdgeArtifact(lifecycleEdgeArtifact);
  const issues = [...restartRepair.issues, ...lifecycleEdges.issues];
  return {
    valid: issues.length === 0,
    issues,
    parts: {
      restartRepair,
      lifecycleEdges,
    },
  };
}

export function validateSubagentLifecycleEdgeArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Sub-agent lifecycle edge artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-subagent-lifecycle-edge-evidence-v1") {
    issues.push(`Sub-agent lifecycle edge schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.featureFlagSnapshot?.ambientSubagentsEnabled !== true) {
    issues.push("Sub-agent lifecycle edge proof must prove ambient.subagents was enabled.");
  }
  if (!artifact.parent?.threadId || !artifact.parent?.runId) {
    issues.push("Sub-agent lifecycle edge proof is missing parent thread/run identity.");
  }
  const coveredKinds = Array.isArray(artifact.summary?.coveredEdgeKinds) ? artifact.summary.coveredEdgeKinds : [];
  const missingKinds = REQUIRED_LIFECYCLE_EDGE_KINDS.filter((kind) => !coveredKinds.includes(kind));
  if (missingKinds.length > 0) {
    issues.push(`Sub-agent lifecycle edge proof is missing edge kinds: ${missingKinds.join(", ")}.`);
  }
  if (Array.isArray(artifact.summary?.missingEdgeKinds) && artifact.summary.missingEdgeKinds.length > 0) {
    issues.push(`Sub-agent lifecycle edge proof summary reports missing edge kinds: ${artifact.summary.missingEdgeKinds.join(", ")}.`);
  }
  if (Array.isArray(artifact.summary?.unsafeEdgeIds) && artifact.summary.unsafeEdgeIds.length > 0) {
    issues.push(`Sub-agent lifecycle edge proof summary reports unsafe edges: ${artifact.summary.unsafeEdgeIds.join(", ")}.`);
  }
  const edges = Array.isArray(artifact.edges) ? artifact.edges : [];
  if (edges.length < REQUIRED_LIFECYCLE_EDGE_KINDS.length) {
    issues.push(`Sub-agent lifecycle edge proof has ${edges.length} edge rows; expected at least ${REQUIRED_LIFECYCLE_EDGE_KINDS.length}.`);
  }
  for (const edge of edges) validateLifecycleEdgeArtifactRow(edge, issues);
  return { valid: issues.length === 0, issues };
}

export async function runBoundedCommand(command, options) {
  return new Promise((resolve) => {
    const child = spawn(command.executable, command.args, {
      detached: process.platform !== "win32",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let interrupted = false;
    let interruptSignal;
    let settled = false;
    let killTimer;
    let abortListener;
    const terminate = (signal = "SIGTERM") => {
      terminateProcessTree(child, signal);
      if (!killTimer) {
        killTimer = setTimeout(() => {
          terminateProcessTree(child, "SIGKILL");
        }, 5000);
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeoutMs);
    if (options.abortSignal) {
      abortListener = () => {
        if (settled) return;
        interrupted = true;
        interruptSignal = abortSignalReasonName(options.abortSignal);
        terminate();
      };
      if (options.abortSignal.aborted) {
        abortListener();
      } else {
        options.abortSignal.addEventListener("abort", abortListener, { once: true });
      }
    }
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (exitCode, signal) => {
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      if (abortListener) options.abortSignal?.removeEventListener("abort", abortListener);
      resolve({
        exitCode: typeof exitCode === "number" ? exitCode : 1,
        signal: signal ?? undefined,
        timedOut,
        interrupted,
        ...(interruptSignal ? { interruptSignal } : {}),
        stdout,
        stderr,
      });
    });
    child.on("error", (error) => {
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      if (abortListener) options.abortSignal?.removeEventListener("abort", abortListener);
      resolve({
        exitCode: 1,
        timedOut,
        interrupted,
        ...(interruptSignal ? { interruptSignal } : {}),
        stdout,
        stderr: `${stderr}\n${error.message}`,
      });
    });
  });
}

function abortSignalReasonName(signal) {
  const reason = signal?.reason;
  if (reason && typeof reason === "object" && typeof reason.signal === "string") return reason.signal;
  if (typeof reason === "string" && reason) return reason;
  return "abort";
}

function terminateProcessTree(child, signal = "SIGTERM") {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Best-effort cleanup; the command result still records timeout state.
    }
  }
}

export function renderSubagentLiveConfidenceMarkdown(evidence) {
  return [
    "# Sub-Agent Live Confidence",
    "",
    `Generated: ${evidence.completedAt}`,
    `Slice: ${evidence.sliceId}`,
    `Kind: ${evidence.sliceKind}`,
    `Status: ${evidence.status}`,
    `Provider: ${evidence.provider.providerId ?? evidence.provider.kind}`,
    "",
    "## Hypothesis",
    "",
    `- Hypothesis: ${evidence.hypothesis}`,
    `- Expected: ${evidence.expectedObservation}`,
    `- Actual: ${evidence.actualOutcome}`,
    `- Confidence delta: ${evidence.confidenceDelta}`,
    `- Follow-up: ${evidence.followUp}`,
    `- Closeout: ${evidence.closeoutAnswer.kind} - ${evidence.closeoutAnswer.summary}`,
    "",
    "## Observations",
    "",
    ...evidence.observations.map((observation) => `- ${observation.label}: ${observation.result}`),
    "",
    ...(evidence.desktopDogfoodContract
      ? [
          "## Desktop Dogfood Contract",
          "",
          `- Scenarios: ${evidence.desktopDogfoodContract.requiredScenarioPassCount}/${evidence.desktopDogfoodContract.requiredScenarioCount} required, ${evidence.desktopDogfoodContract.scenarioIds.length} observed`,
          `- Visual assertions: ${evidence.desktopDogfoodContract.visualAssertionIds.length}/${evidence.desktopDogfoodContract.requiredVisualAssertionCount} passed`,
          `- Maturity assertions: ${evidence.desktopDogfoodContract.maturityAssertionIds.length}/${evidence.desktopDogfoodContract.requiredMaturityAssertionCount} passed`,
          `- Chat export capabilities: ${evidence.desktopDogfoodContract.chatExportCapabilities.length}/${evidence.desktopDogfoodContract.requiredChatExportCapabilities.length} passed`,
          `- Missing: ${[
            ...evidence.desktopDogfoodContract.missingRequiredScenarios,
            ...evidence.desktopDogfoodContract.missingRequiredVisualAssertions,
            ...evidence.desktopDogfoodContract.missingRequiredMaturityAssertions,
            ...evidence.desktopDogfoodContract.missingRequiredChatExportCapabilities,
          ].join(", ") || "none"}`,
          "",
        ]
      : []),
    ...(Array.isArray(evidence.maturityAssertions) && evidence.maturityAssertions.length
      ? [
          "## Maturity Assertions",
          "",
          ...evidence.maturityAssertions.map((assertion) => {
            const evidenceText = Array.isArray(assertion.evidence) && assertion.evidence.length
              ? `; ${assertion.evidence.join("; ")}`
              : "";
            return `- ${assertion.id}: ${assertion.status}${evidenceText}`;
          }),
          "",
        ]
      : []),
    "## Blockers",
    "",
    ...(evidence.classifiedBlockers.length
      ? evidence.classifiedBlockers.map((blocker) => `- ${blocker.kind}: ${blocker.summary}`)
      : ["- none"]),
    "",
    "## Product Issues",
    "",
    ...(evidence.productIssues.length
      ? evidence.productIssues.map((issue) => `- ${issue.severity}: ${issue.summary}`)
      : ["- none"]),
  ].join("\n");
}

function actualOutcomeForRun(input) {
  const summary = input.probe.validation.valid
    ? input.probe.successSummary(input.probe.artifact)
    : `${input.probe.issueLabel}: ${input.probe.validation.issues.join(" ") || "none"}`;
  if (input.status === "passed") return `Passed: ${summary}.`;
  if (input.status === "blocked") return `Blocked before release-usable confidence evidence: ${summary}.`;
  return `Failed before release-usable confidence evidence. Exit code ${input.commandResult.exitCode}; ${summary}.`;
}

function closeoutAnswerForRun(input) {
  if (input.status === "blocked") {
    const detail = input.environmentBlocker?.summary
      || input.probe.validation.issues.join(" ")
      || "no validation detail";
    return {
      kind: "blocked",
      summary: `I was blocked from reaching release-usable ${input.probe.subject} evidence: ${detail}.`,
    };
  }
  if (input.status === "failed") {
    return {
      kind: "saw_live",
      summary: `I saw ${input.probe.subject} reach the harness, but it failed before release-usable evidence; exit code ${input.commandResult.exitCode}.`,
    };
  }
  return {
    kind: "saw_live",
    summary: `I saw ${input.probe.subject} produce ${input.probe.validArtifactLabel}.`,
  };
}

function confidenceDeltaForStatus(status) {
  if (status === "passed") return "increased";
  if (status === "failed") return "decreased";
  return "unchanged";
}

function followUpForStatus(status) {
  if (status === "passed") {
    return "Keep the artifact with the slice evidence and turn any surprising live behavior into deterministic regression coverage.";
  }
  if (status === "blocked") {
    return "Resolve the classified environmental blocker and rerun live confidence before using this slice as release-usable live evidence.";
  }
  return "Fix or split the product issue and rerun live confidence before treating the slice as live-validated.";
}

async function writeEvidenceArtifacts(input) {
  await mkdir(dirname(input.outputPath), { recursive: true });
  await writeFile(input.outputPath, `${JSON.stringify(input.evidence, null, 2)}\n`, "utf8");
  await writeFile(input.outputPath.replace(/\.json$/i, ".md"), `${renderSubagentLiveConfidenceMarkdown(input.evidence)}\n`, "utf8");
  await writeFile(input.outputPath.replace(/\.json$/i, ".stdout.txt"), sanitizeEvidenceText(input.stdout ?? ""), "utf8");
  await writeFile(input.outputPath.replace(/\.json$/i, ".stderr.txt"), sanitizeEvidenceText(input.stderr ?? ""), "utf8");
}

function liveSmokeObservations(artifact, validation) {
  if (!artifact) {
    return [{
      label: "live smoke artifact",
      result: "No live smoke artifact was produced.",
    }];
  }
  return [{
    label: "live smoke artifact",
    result: validation.valid
      ? `Completed child run ${artifact.run?.id ?? "unknown"} for thread ${artifact.run?.childThreadId ?? "unknown"}.`
      : `Live smoke artifact was present but not release-usable: ${validation.issues.join(" ")}`,
  }];
}

function childAuthorityObservations(input) {
  const observations = [];
  const longContextValidation = input.validation.parts.longContext;
  const approvalValidation = input.validation.parts.approvalAuthority;
  const browserValidation = input.validation.parts.browserApproval;
  observations.push({
    label: "long-context child authority",
    result: longContextValidation.valid
      ? `Completed child run ${input.longContextArtifact?.run?.id ?? "unknown"} with native read plus long_context_process over granted text/PDF/Office roots and denied sibling leakage.`
      : `Long-context authority proof was not release-usable: ${longContextValidation.issues.join(" ")}`,
  });
  observations.push({
    label: "child file approval authority",
    result: approvalValidation.valid
      ? `Child run ${input.approvalAuthorityArtifact?.run?.id ?? "unknown"} paused on read approval, queued a child-labeled parent mailbox request, and kept the parent blocked.`
      : `Child file approval proof was not release-usable: ${approvalValidation.issues.join(" ")}`,
  });
  observations.push({
    label: "child browser approval authority",
    result: browserValidation.valid
      ? `Child run ${input.browserApprovalArtifact?.run?.id ?? "unknown"} paused browser_content, received a child-thread scoped approval response, and kept parent synthesis blocked.`
      : `Child browser approval proof was not release-usable: ${browserValidation.issues.join(" ")}`,
  });
  return observations;
}

function childAuthorityMaturityAssertions(input) {
  const longContextValidation = validateLongContextAuthorityArtifact(input.longContextArtifact);
  const approvalValidation = validateApprovalAuthorityArtifact(input.approvalAuthorityArtifact);
  const browserValidation = validateBrowserApprovalAuthorityArtifact(input.browserApprovalArtifact);
  return [
    maturityAssertion({
      id: "child_long_context_authority",
      label: "Child long-context authority",
      status: longContextValidation.valid ? "passed" : "failed",
      artifactPath: input.longContextArtifactPath,
      capabilities: [
        "delegated_tool_authority",
        "long_context_authority_roots",
        "document_root_inheritance",
        "native_pdf_office_read",
        "secret_non_leakage",
        "least_privilege_child_policy",
      ],
      evidence: longContextValidation.valid
        ? [
            `runId: ${input.longContextArtifact?.run?.id ?? "unknown"}`,
            `childThreadId: ${input.longContextArtifact?.run?.childThreadId ?? "unknown"}`,
            `childTools: ${(input.longContextArtifact?.childToolNames ?? []).join(", ")}`,
            `readRoots: ${latestArrayItem(input.longContextArtifact?.run?.toolScopeSnapshots)?.resolverInputs?.childAuthorityProfile?.resourceScopes?.filesystem?.readRoots?.length ?? 0}`,
            `deniedContentLeaked: ${input.longContextArtifact?.deniedContentLeaked === true ? "true" : "false"}`,
          ]
        : longContextValidation.issues,
    }),
    maturityAssertion({
      id: "child_file_approval_authority",
      label: "Child file approval authority",
      status: approvalValidation.valid ? "passed" : "failed",
      artifactPath: input.approvalAuthorityArtifactPath,
      capabilities: [
        "parent_approval_forwarding",
        "child_approval_pause",
        "parent_blocking_resume",
        "child_scoped_approval",
        "secret_non_leakage",
        "least_privilege_child_policy",
      ],
      evidence: approvalValidation.valid
        ? [
            `runId: ${input.approvalAuthorityArtifact?.run?.id ?? "unknown"}`,
            `childThreadId: ${input.approvalAuthorityArtifact?.run?.childThreadId ?? "unknown"}`,
            `pendingPermissions: ${(input.approvalAuthorityArtifact?.pendingPermissions ?? []).length}`,
            `parentMailboxEvents: ${(input.approvalAuthorityArtifact?.parentMailboxEvents ?? []).length}`,
            `deniedContentLeaked: ${input.approvalAuthorityArtifact?.deniedContentLeaked === true ? "true" : "false"}`,
          ]
        : approvalValidation.issues,
    }),
    maturityAssertion({
      id: "child_browser_approval_authority",
      label: "Child browser approval authority",
      status: browserValidation.valid ? "passed" : "failed",
      artifactPath: input.browserApprovalArtifactPath,
      capabilities: [
        "browser_authority",
        "parent_approval_forwarding",
        "child_approval_pause",
        "parent_blocking_resume",
        "child_scoped_approval",
        "browser_approval_resume",
        "least_privilege_child_policy",
      ],
      evidence: browserValidation.valid
        ? [
            `runId: ${input.browserApprovalArtifact?.run?.id ?? "unknown"}`,
            `childThreadId: ${input.browserApprovalArtifact?.run?.childThreadId ?? "unknown"}`,
            `parentPermissionMode: ${input.browserApprovalArtifact?.parentPermissionMode ?? "unknown"}`,
            `pendingBeforeApproval: ${(input.browserApprovalArtifact?.pendingBeforeApproval ?? []).length}`,
            `permissionResponses: ${(input.browserApprovalArtifact?.permissionResponses ?? []).map((response) => response?.response).join(", ")}`,
          ]
        : browserValidation.issues,
    }),
  ];
}

function validateRepeatedUntrackedObservations(artifact, issues) {
  const observations = Array.isArray(artifact.repeatedObservations) ? artifact.repeatedObservations : [];
  if (!Number.isInteger(artifact.repeatedObservationCount) || artifact.repeatedObservationCount < 2) {
    issues.push("Untracked runtime proof did not prove repeatedObservationCount>=2.");
    return;
  }
  if (observations.length !== artifact.repeatedObservationCount) {
    issues.push("Untracked runtime proof repeatedObservations length does not match repeatedObservationCount.");
    return;
  }
  const seenKinds = new Set();
  for (const [index, observation] of observations.entries()) {
    const label = observation?.observationKind ?? `#${index}`;
    if (observation?.runtimeEntryId !== artifact.runtimeEntryId) {
      issues.push(`Untracked runtime repeated observation ${label} did not match runtimeEntryId.`);
    }
    if (observation?.trackingStatus !== "untracked") {
      issues.push(`Untracked runtime repeated observation ${label} did not preserve trackingStatus=untracked.`);
    }
    if (observation?.ordinaryStopAllowed !== false) {
      issues.push(`Untracked runtime repeated observation ${label} did not keep ordinaryStopAllowed=false.`);
    }
    if (observation?.ordinaryRestartAllowed !== false) {
      issues.push(`Untracked runtime repeated observation ${label} did not keep ordinaryRestartAllowed=false.`);
    }
    if (observation?.forceTerminationAllowed !== false) {
      issues.push(`Untracked runtime repeated observation ${label} did not keep forceTerminationAllowed=false.`);
    }
    if (observation?.untracked !== true) {
      issues.push(`Untracked runtime repeated observation ${label} did not preserve untracked=true.`);
    }
    if (observation?.nextSafeAction !== "ask-user-to-stop-untracked" || observation?.nextSafeActionSafety !== "external") {
      issues.push(`Untracked runtime repeated observation ${label} did not keep external ask-user guidance.`);
    }
    if (typeof observation?.observationKind === "string" && observation.observationKind.length > 0) {
      seenKinds.add(observation.observationKind);
    }
  }
  if (seenKinds.size < 2) {
    issues.push("Untracked runtime proof did not prove at least two distinct repeated observation kinds.");
  }
}

function workflowDogfoodObservations(artifact, validation) {
  if (!artifact) {
    return [{
      label: "live workflow dogfood artifact",
      result: "No live workflow dogfood artifact was produced.",
    }];
  }
  return [{
    label: "live workflow dogfood artifact",
    result: validation.valid
      ? `Succeeded workflow run ${artifact.run?.id ?? "unknown"} for workflow thread ${artifact.artifact?.workflowThreadId ?? "unknown"}.`
      : `Live workflow dogfood artifact was present but not release-usable: ${validation.issues.join(" ")}`,
  }];
}

function workflowSymphonyObservations(input) {
  const workflowValidation = validateWorkflowDogfoodArtifact(input.liveWorkflowArtifact);
  const workflowUiCoverageLabel = input.workflowUiDogfoodProfile === "broader" ? "broader phase-1" : "baseline";
  const workflowUiValidation = validateWorkflowUiDogfoodMatrixArtifact(
    input.workflowUiDogfoodArtifact,
    workflowUiDogfoodValidationOptions(input.workflowUiDogfoodProfile),
  );
  const dogfoodValidation = validateCallableWorkflowDogfoodConfidenceArtifact(input.callableWorkflowDogfoodArtifact);
  const rehydrationValidation = validateCallableWorkflowRehydrationConfidenceArtifact(input.callableWorkflowRehydrationArtifact);
  const observations = [
    ...workflowDogfoodObservations(input.liveWorkflowArtifact, workflowValidation),
  ];

  if (!input.workflowUiDogfoodArtifact) {
    observations.push({
      label: "Workflow Agent UI dogfood matrix artifact",
      result: "No Workflow Agent UI dogfood matrix artifact was produced.",
    });
  } else {
    const artifact = input.workflowUiDogfoodArtifact;
    observations.push({
      label: "Workflow Agent UI dogfood matrix artifact",
      result: workflowUiValidation.valid
        ? `Passed ${artifact.results?.length ?? 0} ${workflowUiCoverageLabel} Workflow Agent UI scenario(s): ${(artifact.scenarios ?? []).join(", ")}.`
        : `Workflow Agent UI dogfood matrix artifact was present but not release-usable: ${workflowUiValidation.issues.join(" ")}`,
    });
  }

  if (!input.callableWorkflowDogfoodArtifact) {
    observations.push({
      label: "callable workflow mutating child dogfood artifact",
      result: "No callable workflow mutating child dogfood artifact was produced.",
    });
  } else {
    const artifact = input.callableWorkflowDogfoodArtifact;
    observations.push({
      label: "callable workflow mutating child dogfood artifact",
      result: dogfoodValidation.valid
        ? `Child ${artifact.childCaller?.subagentRunId ?? "unknown"} ran blocking task ${artifact.task?.id ?? "unknown"}, staged ${artifact.mutationOutput?.stagedRelativePath ?? "unknown"}, blocked parent synthesis until ${artifact.workflow?.runId ?? "unknown"} completed, and proved denied workflow scope.`
        : `Callable workflow dogfood artifact was present but not release-usable: ${dogfoodValidation.issues.join(" ")}`,
    });
  }

  if (!input.callableWorkflowRehydrationArtifact) {
    observations.push({
      label: "callable workflow task rehydration artifact",
      result: "No callable workflow task rehydration artifact was produced.",
    });
  } else {
    const artifact = input.callableWorkflowRehydrationArtifact;
    observations.push({
      label: "callable workflow task rehydration artifact",
      result: rehydrationValidation.valid
        ? `Rehydrated task ${artifact.task?.id ?? "unknown"} with artifact ${artifact.task?.workflowArtifactId ?? "unknown"}, run ${artifact.task?.workflowRunId ?? "unknown"}, ${artifact.progressSnapshot?.eventCount ?? 0} progress events, and ${artifact.usageSnapshot?.tokenCount ?? 0} tokens.`
        : `Callable workflow rehydration artifact was present but not release-usable: ${rehydrationValidation.issues.join(" ")}`,
    });
  }

  return observations;
}

function workflowSymphonyMaturityAssertions(input) {
  const workflowValidation = validateWorkflowDogfoodArtifact(input.liveWorkflowArtifact);
  const workflowUiValidation = validateWorkflowUiDogfoodMatrixArtifact(
    input.workflowUiDogfoodArtifact,
    workflowUiDogfoodValidationOptions(input.workflowUiDogfoodProfile),
  );
  const dogfoodValidation = validateCallableWorkflowDogfoodConfidenceArtifact(input.callableWorkflowDogfoodArtifact);
  const rehydrationValidation = validateCallableWorkflowRehydrationConfidenceArtifact(input.callableWorkflowRehydrationArtifact);

  return [
    maturityAssertion({
      id: "live_workflow_run",
      label: "Live workflow run",
      status: workflowValidation.valid ? "passed" : "failed",
      artifactPath: input.liveWorkflowArtifactPath,
      capabilities: ["workflow_launch", "ambient_runtime_call", "artifact_link", "checkpoint_output"],
      evidence: workflowValidation.valid
        ? [
            `workflowRunId: ${input.liveWorkflowArtifact?.run?.id ?? "unknown"}`,
            `workflowThreadId: ${input.liveWorkflowArtifact?.artifact?.workflowThreadId ?? "unknown"}`,
            `checkpoint: ${input.liveWorkflowArtifact?.checkpoint ? "present" : "missing"}`,
            `succeededModelCalls: ${(input.liveWorkflowArtifact?.modelCalls ?? []).filter((call) => call?.status === "succeeded").length}`,
          ]
        : workflowValidation.issues,
    }),
    maturityAssertion({
      id: "broader_workflow_ui_dogfood",
      label: "Broader Workflow Agent UI dogfood",
      status: workflowUiValidation.valid ? "passed" : "failed",
      artifactPath: input.workflowUiDogfoodArtifactPath,
      capabilities: [
        "broader_live_workflow_runs",
        "workflow_agent_ui_dogfood",
        "workflow_output_evidence",
        "electron_workflow_dogfood",
      ],
      evidence: workflowUiValidation.valid
        ? [
            `suite: ${input.workflowUiDogfoodArtifact?.suite ?? "unknown"}`,
            `scenarios: ${(input.workflowUiDogfoodArtifact?.scenarios ?? []).join(", ")}`,
            `passedScenarios: ${(input.workflowUiDogfoodArtifact?.results ?? []).filter((result) => result?.ok === true).length}`,
            `totalModelCalls: ${sumWorkflowUiDogfoodResultField(input.workflowUiDogfoodArtifact, "modelCalls")}`,
            `totalOutputSignals: ${sumWorkflowUiDogfoodResultField(input.workflowUiDogfoodArtifact, "outputSignals")}`,
          ]
        : workflowUiValidation.issues,
    }),
    maturityAssertion({
      id: "child_mutating_workflow",
      label: "Child-originated mutating workflow",
      status: dogfoodValidation.valid ? "passed" : "failed",
      artifactPath: input.callableWorkflowDogfoodArtifactPath,
      capabilities: [
        "mutating_child_workflow",
        "child_scoped_approval",
        "isolated_child_worktree",
        "parent_blocking_workflow",
        "denied_workflow_scope",
        "launch_card_bounds",
        "pause_resume_cancel",
        "child_workflow_scope",
        "restart_repair",
      ],
      evidence: dogfoodValidation.valid
        ? [
            `taskId: ${input.callableWorkflowDogfoodArtifact?.task?.id ?? "unknown"}`,
            `subagentRunId: ${input.callableWorkflowDogfoodArtifact?.childCaller?.subagentRunId ?? "unknown"}`,
            `approvalScope: ${input.callableWorkflowDogfoodArtifact?.mutation?.approvalScope ?? "unknown"}`,
            `worktreeStatus: ${input.callableWorkflowDogfoodArtifact?.mutation?.worktreeStatus ?? "unknown"}`,
            `stagedRelativePath: ${input.callableWorkflowDogfoodArtifact?.mutationOutput?.stagedRelativePath ?? "unknown"}`,
            `launchCardRisk: ${input.callableWorkflowDogfoodArtifact?.launchCard?.riskLevel ?? "unknown"}`,
            `dogfoodMaturity: ${workflowMaturityAssertionSummary(input.callableWorkflowDogfoodArtifact?.maturityAssertions, REQUIRED_CALLABLE_WORKFLOW_DOGFOOD_MATURITY_ASSERTIONS)}`,
            "deniedScope: workflow.call",
          ]
        : dogfoodValidation.issues,
    }),
    maturityAssertion({
      id: "workflow_task_artifact_rehydration",
      label: "Workflow task and artifact rehydration",
      status: rehydrationValidation.valid ? "passed" : "failed",
      artifactPath: input.callableWorkflowRehydrationArtifactPath,
      capabilities: ["workflow_task_rehydration", "artifact_link", "checkpoint_output", "child_workflow_provenance"],
      evidence: rehydrationValidation.valid
        ? [
            `taskId: ${input.callableWorkflowRehydrationArtifact?.task?.id ?? "unknown"}`,
            `workflowArtifactId: ${input.callableWorkflowRehydrationArtifact?.task?.workflowArtifactId ?? "unknown"}`,
            `workflowRunId: ${input.callableWorkflowRehydrationArtifact?.task?.workflowRunId ?? "unknown"}`,
            `workflowThreadId: ${input.callableWorkflowRehydrationArtifact?.task?.workflowThreadId ?? "unknown"}`,
            `progressEvents: ${input.callableWorkflowRehydrationArtifact?.progressSnapshot?.eventCount ?? 0}`,
            `tokenCount: ${input.callableWorkflowRehydrationArtifact?.usageSnapshot?.tokenCount ?? 0}`,
            `rehydrationMaturity: ${workflowMaturityAssertionSummary(input.callableWorkflowRehydrationArtifact?.maturityAssertions, REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS)}`,
          ]
        : rehydrationValidation.issues,
    }),
  ];
}

function sumWorkflowUiDogfoodResultField(artifact, field) {
  return (Array.isArray(artifact?.results) ? artifact.results : [])
    .reduce((total, result) => total + (positiveNumber(result?.runEvidence?.[field]) ? Number(result.runEvidence[field]) : 0), 0);
}

function workflowMaturityAssertionSummary(maturityAssertions, expectedAssertions) {
  if (!maturityAssertions || typeof maturityAssertions !== "object" || Array.isArray(maturityAssertions)) return "missing";
  return expectedAssertions
    .map((expected) => `${expected.id}:${maturityAssertions[expected.id]?.status ?? "missing"}`)
    .join(",");
}

function maturityAssertion(input) {
  return {
    id: input.id,
    label: input.label,
    status: input.status,
    artifactPath: input.artifactPath,
    capabilities: [...new Set(input.capabilities ?? [])],
    evidence: (input.evidence ?? []).map((entry) => sanitizeEvidenceText(String(entry))).filter(nonEmptyString),
  };
}

function localRuntimeControlProofObservations(artifact, gateArtifact, validation) {
  if (!artifact) {
    return [{
      label: "local runtime control proof artifact",
      result: "No local runtime control proof artifact was produced.",
    }];
  }
  const blocker = artifact.scenarios?.["active-subagent-stop-blocker"];
  const untracked = artifact.scenarios?.["untracked-runtime-safety"];
  const staleRecovery = artifact.scenarios?.["stale-lease-recovery"];
  const providerLifecycle = artifact.scenarios?.["provider-declared-lifecycle"];
  const owner = blocker?.affectedSubagents?.[0];
  const observations = [{
    label: "local runtime control proof artifact",
    result: validation.valid
      ? `Active lease ${owner?.leaseId ?? "unknown"} owned by ${owner?.displayName ?? owner?.subagentThreadId ?? "unknown sub-agent"} blocked ordinary Stop.`
      : `Local runtime proof artifact was present but not release-usable: ${validation.issues.join(" ")}`,
  }];
  if (untracked?.status === "passed") {
    observations.push({
      label: "untracked runtime safety",
      result: `Untracked runtime ${untracked.runtimeEntryId ?? "unknown"} stayed external-only with ordinary Stop/Restart disabled.`,
    });
  }
  if (staleRecovery?.status === "passed") {
    const staleLeaseIds = Array.isArray(staleRecovery.staleLeaseIds) ? staleRecovery.staleLeaseIds.join(", ") : "unknown";
    observations.push({
      label: "stale lease recovery",
      result: `Stale leases ${staleLeaseIds} stayed visible while ordinary Stop/Restart were allowed.`,
    });
  }
  if (providerLifecycle?.status === "passed") {
    observations.push({
      label: "provider-declared lifecycle",
      result: `Provider lifecycle actions proved: ${(providerLifecycle.actions ?? []).join(", ") || "none"}.`,
    });
  }
  if (gateArtifact) {
    observations.push({
      label: "local runtime proof gate",
      result: `Gate status ${gateArtifact.status ?? "missing"} with ${(gateArtifact.releaseDecision?.blockingIssues ?? []).length} blocking issues.`,
    });
  }
  return observations;
}

function localRuntimeMaturityAssertions(input) {
  const artifact = input.liveLocalRuntimeArtifact;
  const gateArtifact = input.liveLocalRuntimeGateArtifact;
  const scenarios = artifact?.scenarios && typeof artifact.scenarios === "object" ? artifact.scenarios : {};
  const blocker = scenarios["active-subagent-stop-blocker"];
  const untracked = scenarios["untracked-runtime-safety"];
  const staleRecovery = scenarios["stale-lease-recovery"];
  const minicpm = scenarios["minicpm-nondestructive-stop"];
  const stoppedDisplay = scenarios["stopped-provider-display"];
  const providerLifecycle = scenarios["provider-declared-lifecycle"];
  const owner = Array.isArray(blocker?.affectedSubagents) ? blocker.affectedSubagents[0] : undefined;
  const gateBlockingIssues = Array.isArray(gateArtifact?.releaseDecision?.blockingIssues)
    ? gateArtifact.releaseDecision.blockingIssues
    : [];
  const gateChecks = Array.isArray(gateArtifact?.checks) ? gateArtifact.checks : [];

  return [
    maturityAssertion({
      id: "local_runtime_active_lease_stop_blocker",
      label: "Active sub-agent lease Stop blocker",
      status: blocker?.status === "passed" ? "passed" : "failed",
      artifactPath: input.liveLocalRuntimeArtifactPath,
      capabilities: ["local_runtime_lease_ownership", "lease_stop_blocker"],
      evidence: blocker?.status === "passed"
        ? [
            `leaseId: ${owner?.leaseId ?? "unknown"}`,
            `subagentThreadId: ${owner?.subagentThreadId ?? "unknown"}`,
            `modelRuntimeId: ${owner?.modelRuntimeId ?? "unknown"}`,
            `modelProfileId: ${owner?.modelProfileId ?? "unknown"}`,
            `ordinaryStopAllowed: ${blocker.ordinaryStopAllowed}`,
            `forceRequiresSubagentCancellation: ${blocker.forceRequiresSubagentCancellation}`,
          ]
        : [`active-subagent-stop-blocker status: ${blocker?.status ?? "missing"}`],
    }),
    maturityAssertion({
      id: "local_runtime_untracked_safety",
      label: "Untracked runtime safety",
      status: untracked?.status === "passed" ? "passed" : "failed",
      artifactPath: input.liveLocalRuntimeArtifactPath,
      capabilities: ["untracked_runtime_safety"],
      evidence: untracked?.status === "passed"
        ? [
            `runtimeEntryId: ${untracked.runtimeEntryId ?? "unknown"}`,
            `trackingStatus: ${untracked.trackingStatus ?? "unknown"}`,
            `ordinaryStopAllowed: ${untracked.ordinaryStopAllowed}`,
            `ordinaryRestartAllowed: ${untracked.ordinaryRestartAllowed}`,
            `forceTerminationAllowed: ${untracked.forceTerminationAllowed}`,
            `repeatedObservationCount: ${untracked.repeatedObservationCount ?? 0}`,
            `nextSafeAction: ${untracked.nextSafeActions?.[0]?.action ?? "unknown"}`,
          ]
        : [`untracked-runtime-safety status: ${untracked?.status ?? "missing"}`],
    }),
    maturityAssertion({
      id: "local_runtime_stale_lease_recovery",
      label: "Stale lease recovery",
      status: staleRecovery?.status === "passed" ? "passed" : "failed",
      artifactPath: input.liveLocalRuntimeArtifactPath,
      capabilities: ["stale_lease_recovery"],
      evidence: staleRecovery?.status === "passed"
        ? [
            `staleLeaseIds: ${(staleRecovery.staleLeaseIds ?? []).join(", ") || "none"}`,
            `activeLeaseCount: ${staleRecovery.activeLeaseCount ?? "unknown"}`,
            `activeOwnerCount: ${staleRecovery.activeOwnerCount ?? "unknown"}`,
            `ordinaryStopAllowed: ${staleRecovery.ordinaryStopAllowed}`,
            `ordinaryRestartAllowed: ${staleRecovery.ordinaryRestartAllowed}`,
            `forceRequiresSubagentCancellation: ${staleRecovery.forceRequiresSubagentCancellation}`,
          ]
        : [`stale-lease-recovery status: ${staleRecovery?.status ?? "missing"}`],
    }),
    maturityAssertion({
      id: "local_runtime_provider_lifecycle",
      label: "Provider lifecycle and stopped display",
      status: minicpm?.status === "passed" && stoppedDisplay?.status === "passed" && providerLifecycle?.status === "passed" ? "passed" : "failed",
      artifactPath: input.liveLocalRuntimeArtifactPath,
      capabilities: ["provider_lifecycle", "stopped_provider_display", "non_destructive_stop"],
      evidence: minicpm?.status === "passed" && stoppedDisplay?.status === "passed" && providerLifecycle?.status === "passed"
        ? [
            `minicpmStopped: ${minicpm.stopped}`,
            `packageStatePreserved: ${minicpm.packageStatePreserved}`,
            `minicpmDisplayedStopped: ${stoppedDisplay.minicpmDisplayedStopped}`,
            `voiceDisplayedStopped: ${stoppedDisplay.voiceDisplayedStopped}`,
            `providerActions: ${(providerLifecycle.actions ?? []).join(", ") || "none"}`,
            `usedGenericLifecycle: ${providerLifecycle.usedGenericLifecycle}`,
          ]
        : [
            `minicpm-nondestructive-stop status: ${minicpm?.status ?? "missing"}`,
            `stopped-provider-display status: ${stoppedDisplay?.status ?? "missing"}`,
            `provider-declared-lifecycle status: ${providerLifecycle?.status ?? "missing"}`,
          ],
    }),
    maturityAssertion({
      id: "local_runtime_proof_gate",
      label: "Local runtime proof gate",
      status: gateArtifact && gateArtifact.status !== "attention" && gateBlockingIssues.length === 0 ? "passed" : "failed",
      artifactPath: input.liveLocalRuntimeGateArtifactPath,
      capabilities: ["proof_gate_clean"],
      evidence: gateArtifact
        ? [
            `gateStatus: ${gateArtifact.status ?? "missing"}`,
            `blockingIssues: ${gateBlockingIssues.length}`,
            `failedChecks: ${gateChecks.filter((check) => check?.status === "failed").length}`,
          ]
        : ["local runtime proof gate artifact missing"],
    }),
  ];
}

function restartRepairMaturityAssertions(input) {
  const artifact = input.liveRestartRepairArtifact;
  const lifecycleArtifact = input.liveLifecycleEdgeArtifact;
  const replayEvidence = artifact?.replayEvidence ?? {};
  const repair = replayEvidence.restartRepair ?? {};
  const rehydration = replayEvidence.rehydration ?? {};
  const counts = replayEvidence.counts ?? {};
  const integrity = rehydration.artifactPointerIntegrity ?? {};
  const childThreads = Array.isArray(replayEvidence.childThreads) ? replayEvidence.childThreads : [];
  const mailboxStates = Array.isArray(rehydration.parentMailboxStates) ? rehydration.parentMailboxStates : [];
  const resultPointers = Array.isArray(rehydration.resultArtifactPointers) ? rehydration.resultArtifactPointers : [];
  const coveredKinds = Array.isArray(lifecycleArtifact?.summary?.coveredEdgeKinds) ? lifecycleArtifact.summary.coveredEdgeKinds : [];
  const lifecycleValidation = validateSubagentLifecycleEdgeArtifact(lifecycleArtifact);
  const lifecycleEdges = Array.isArray(lifecycleArtifact?.edges) ? lifecycleArtifact.edges : [];
  const unsafeEdgeIds = Array.isArray(lifecycleArtifact?.summary?.unsafeEdgeIds) ? lifecycleArtifact.summary.unsafeEdgeIds : [];

  return [
    maturityAssertion({
      id: "restart_repair_runtime_event_replay",
      label: "Restart runtime event replay",
      status: positiveNumber(counts.runtimeEvents) && positiveNumber(counts.persistedRunEvents)
        && Array.isArray(replayEvidence.runtimeEventTimeline) && replayEvidence.runtimeEventTimeline.length > 0
        && Array.isArray(replayEvidence.persistedRunEventTimeline) && replayEvidence.persistedRunEventTimeline.length > 0
        ? "passed"
        : "failed",
      artifactPath: input.liveRestartRepairArtifactPath,
      capabilities: ["runtime_event_replay"],
      evidence: [
        `runtimeEvents: ${counts.runtimeEvents ?? 0}`,
        `persistedRunEvents: ${counts.persistedRunEvents ?? 0}`,
        `runtimeTimelineRows: ${Array.isArray(replayEvidence.runtimeEventTimeline) ? replayEvidence.runtimeEventTimeline.length : 0}`,
        `persistedTimelineRows: ${Array.isArray(replayEvidence.persistedRunEventTimeline) ? replayEvidence.persistedRunEventTimeline.length : 0}`,
      ],
    }),
    maturityAssertion({
      id: "restart_repair_child_tree_repair",
      label: "Restart child tree and wait barrier repair",
      status: nonEmptyStringArray(repair.repairedRunIds)
        && nonEmptyStringArray(repair.repairedBarrierIds)
        && nonEmptyStringArray(repair.repairableSpawnEdgeRunIds)
        && nonEmptyStringArray(repair.diagnosticRunIds)
        && childThreads.length > 0
        ? "passed"
        : "failed",
      artifactPath: input.liveRestartRepairArtifactPath,
      capabilities: ["restart_rehydration", "child_thread_repair", "wait_barrier_repair"],
      evidence: [
        `repairedRunIds: ${(repair.repairedRunIds ?? []).join(", ") || "none"}`,
        `repairedBarrierIds: ${(repair.repairedBarrierIds ?? []).join(", ") || "none"}`,
        `repairableSpawnEdgeRunIds: ${(repair.repairableSpawnEdgeRunIds ?? []).join(", ") || "none"}`,
        `diagnosticRunIds: ${(repair.diagnosticRunIds ?? []).join(", ") || "none"}`,
        `childThreads: ${childThreads.length}`,
      ],
    }),
    maturityAssertion({
      id: "restart_repair_mailbox_rehydration",
      label: "Restart parent mailbox rehydration",
      status: nonEmptyStringArray(rehydration.parentMailboxEventIds)
        && mailboxStates.length > 0
        && integrity.parentMailboxChildRefsResolved === true
        ? "passed"
        : "failed",
      artifactPath: input.liveRestartRepairFixtureArtifactPath ?? input.liveRestartRepairArtifactPath,
      capabilities: ["parent_mailbox_replay", "mailbox_state_rehydration"],
      evidence: [
        `parentMailboxEventIds: ${(rehydration.parentMailboxEventIds ?? []).join(", ") || "none"}`,
        `parentMailboxStates: ${mailboxStates.length}`,
        `parentMailboxChildRefsResolved: ${integrity.parentMailboxChildRefsResolved === true}`,
      ],
    }),
    maturityAssertion({
      id: "restart_repair_artifact_pointer_rehydration",
      label: "Restart artifact pointer rehydration",
      status: resultPointers.length > 0
        && integrity.allResultPointersHaveRunAndThread === true
        && integrity.missingResultArtifactsDiagnosed === true
        && integrity.transcriptChildRefsResolved === true
        ? "passed"
        : "failed",
      artifactPath: input.liveRestartRepairFixtureArtifactPath ?? input.liveRestartRepairArtifactPath,
      capabilities: ["artifact_pointer_rehydration"],
      evidence: [
        `resultArtifactPointers: ${resultPointers.length}`,
        `missingResultArtifactRunIds: ${(rehydration.missingResultArtifactRunIds ?? []).join(", ") || "none"}`,
        `allResultPointersHaveRunAndThread: ${integrity.allResultPointersHaveRunAndThread === true}`,
        `missingResultArtifactsDiagnosed: ${integrity.missingResultArtifactsDiagnosed === true}`,
        `transcriptChildRefsResolved: ${integrity.transcriptChildRefsResolved === true}`,
      ],
    }),
    maturityAssertion({
      id: "restart_repair_lifecycle_edge_coverage",
      label: "Restart repair lifecycle edge coverage",
      status: lifecycleValidation.valid && arrayIncludesAll(coveredKinds, REQUIRED_LIFECYCLE_EDGE_KINDS) ? "passed" : "failed",
      artifactPath: input.liveLifecycleEdgeArtifactPath,
      capabilities: REQUIRED_LIFECYCLE_EDGE_KINDS.map(lifecycleEdgeCapability),
      evidence: [
        `coveredEdgeKinds: ${coveredKinds.join(", ") || "none"}`,
        `missingEdgeKinds: ${REQUIRED_LIFECYCLE_EDGE_KINDS.filter((kind) => !coveredKinds.includes(kind)).join(", ") || "none"}`,
      ],
    }),
    maturityAssertion({
      id: "restart_repair_synthesis_safety",
      label: "Restart repair synthesis safety",
      status: lifecycleValidation.valid && lifecycleEdges.length > 0 && lifecycleEdges.every(lifecycleEdgeHasSynthesisSafety) && unsafeEdgeIds.length === 0
        ? "passed"
        : "failed",
      artifactPath: input.liveLifecycleEdgeArtifactPath,
      capabilities: ["synthesis_safety"],
      evidence: [
        `unsafeEdgeIds: ${unsafeEdgeIds.join(", ") || "none"}`,
        `safeEdgeRows: ${lifecycleEdges.filter(lifecycleEdgeHasSynthesisSafety).length}`,
        `edgeRows: ${lifecycleEdges.length}`,
      ],
    }),
  ];
}

function lifecycleEdgeMaturityAssertions(input) {
  const artifact = input.liveLifecycleEdgeArtifact;
  const validation = validateSubagentLifecycleEdgeArtifact(artifact);
  const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
  const edgeByKind = new Map(edges.map((edge) => [edge?.kind, edge]));
  const unsafeEdgeIds = Array.isArray(artifact?.summary?.unsafeEdgeIds) ? artifact.summary.unsafeEdgeIds : [];

  return [
    ...REQUIRED_LIFECYCLE_EDGE_KINDS.map((kind) => lifecycleEdgeMaturityAssertion({
      kind,
      edge: edgeByKind.get(kind),
      validation,
      artifactPath: input.liveLifecycleEdgeArtifactPath,
    })),
    maturityAssertion({
      id: "lifecycle_edge_synthesis_safety",
      label: "Lifecycle synthesis safety",
      status: validation.valid && edges.length > 0 && edges.every(lifecycleEdgeHasSynthesisSafety) && unsafeEdgeIds.length === 0
        ? "passed"
        : "failed",
      artifactPath: input.liveLifecycleEdgeArtifactPath,
      capabilities: ["synthesis_safety"],
      evidence: [
        `unsafeEdgeIds: ${unsafeEdgeIds.join(", ") || "none"}`,
        `safeEdgeRows: ${edges.filter(lifecycleEdgeHasSynthesisSafety).length}`,
        `edgeRows: ${edges.length}`,
      ],
    }),
  ];
}

function lifecycleEdgeMaturityAssertion(input) {
  const edge = input.edge;
  return maturityAssertion({
    id: `lifecycle_edge_${input.kind}`,
    label: `Lifecycle ${input.kind.replace("_", " ")} edge`,
    status: input.validation.valid && edge ? "passed" : "failed",
    artifactPath: input.artifactPath,
    capabilities: [lifecycleEdgeCapability(input.kind)],
    evidence: edge
      ? [
          `edgeId: ${edge.id ?? "unknown"}`,
          `childRunIds: ${(edge.childRunIds ?? []).join(", ") || "none"}`,
          `childThreadIds: ${(edge.childThreadIds ?? []).join(", ") || "none"}`,
          `parentBlockingStateBefore: ${edge.parentBlockingStateBefore ?? "missing"}`,
          `parentBlockingStateAfter: ${edge.parentBlockingStateAfter ?? "missing"}`,
          ...lifecycleEdgeSpecificEvidence(edge),
        ]
      : [`edge kind ${input.kind} missing`],
  });
}

function lifecycleEdgeCapability(kind) {
  return `${kind}_edge`;
}

function lifecycleEdgeHasSynthesisSafety(edge) {
  const safety = edge?.synthesisSafety ?? {};
  return [
    "parentDidNotSynthesizeUnsafeChild",
    "resultArtifactStateExplicit",
    "affectedChildrenNamed",
    "decisionOrEventAttributed",
    "visibleCollapsedThreadState",
  ].every((field) => safety[field] === true);
}

function lifecycleEdgeSpecificEvidence(edge) {
  if (edge?.kind === "restart") {
    return [
      `interruptedRunIds: ${(edge.restart?.interruptedRunIds ?? []).join(", ") || "none"}`,
      `diagnosticRunIds: ${(edge.restart?.diagnosticRunIds ?? []).join(", ") || "none"}`,
      `restartRepairObserved: ${edge.restart?.restartRepairObserved === true}`,
    ];
  }
  if (edge?.kind === "stop") {
    return [
      `stoppedRunIds: ${(edge.stop?.stoppedRunIds ?? []).join(", ") || "none"}`,
      `siblingRunIdsUnaffected: ${(edge.stop?.siblingRunIdsUnaffected ?? []).join(", ") || "none"}`,
      `capacityReleased: ${edge.stop?.capacityReleased === true}`,
    ];
  }
  if (edge?.kind === "detach") {
    return [
      `detachedRunIds: ${(edge.detach?.detachedRunIds ?? []).join(", ") || "none"}`,
      `detachedChildrenExcludedFromSynthesis: ${edge.detach?.detachedChildrenExcludedFromSynthesis === true}`,
      `parentUnblockedAfterDecision: ${edge.detach?.parentUnblockedAfterDecision === true}`,
    ];
  }
  if (edge?.kind === "cancel") {
    return [
      `cancelledRunIds: ${(edge.cancel?.cancelledRunIds ?? []).join(", ") || "none"}`,
      `parentCancellationRequested: ${edge.cancel?.parentCancellationRequested === true}`,
      `cancellationCascadeRecorded: ${edge.cancel?.cancellationCascadeRecorded === true}`,
    ];
  }
  if (edge?.kind === "retry") {
    return [
      `retryRequestedRunIds: ${(edge.retry?.retryRequestedRunIds ?? []).join(", ") || "none"}`,
      `retryAcceptedRunIds: ${(edge.retry?.retryAcceptedRunIds ?? []).join(", ") || "none"}`,
      `retryMailboxEventIds: ${(edge.retry?.retryMailboxEventIds ?? []).join(", ") || "none"}`,
      `parentRemainedBlocked: ${edge.retry?.parentRemainedBlocked === true}`,
      `childSessionRestarted: ${edge.retry?.childSessionRestarted === true}`,
    ];
  }
  if (edge?.kind === "timeout") {
    return [
      `barrierStatus: ${edge.timeout?.barrierStatus ?? "missing"}`,
      `failurePolicy: ${edge.timeout?.failurePolicy ?? "missing"}`,
      `allowedUserChoiceIds: ${(edge.timeout?.allowedUserChoiceIds ?? []).join(", ") || "none"}`,
      `noTimedOutChildSynthesis: ${edge.timeout?.noTimedOutChildSynthesis === true}`,
    ];
  }
  if (edge?.kind === "partial_result") {
    return [
      `decision: ${edge.partialResult?.decision ?? "missing"}`,
      `omittedChildRunIds: ${(edge.partialResult?.omittedChildRunIds ?? []).join(", ") || "none"}`,
      `failedChildNotSynthesized: ${edge.partialResult?.failedChildNotSynthesized === true}`,
      `parentMarkedPartial: ${edge.partialResult?.parentMarkedPartial === true}`,
    ];
  }
  return [];
}

function restartRepairObservations(artifact, validation) {
  if (!artifact) {
    return [{
      label: "restart repair replay diagnostics",
      result: "No restart repair replay diagnostics artifact was produced.",
    }];
  }
  const evidence = artifact.replayEvidence ?? {};
  const repair = evidence.restartRepair ?? {};
  const rehydration = evidence.rehydration ?? {};
  const counts = evidence.counts ?? {};
  return [{
    label: "restart repair replay diagnostics",
    result: validation.valid
      ? `Observed ${(repair.observedIssueKinds ?? []).length} repair issue kinds with ${counts.runtimeEvents ?? 0} runtime events and ${counts.parentMailboxEvents ?? 0} parent mailbox events.`
      : `Restart repair replay diagnostics were present but not release-usable: ${validation.issues.join(" ")}`,
  }, {
    label: "restart repaired objects",
    result: `Repaired runs ${(repair.repairedRunIds ?? []).join(", ") || "none"}; repaired barriers ${(repair.repairedBarrierIds ?? []).join(", ") || "none"}.`,
  }, {
    label: "restart rehydration proof",
    result: `Rehydrated ${(rehydration.parentMailboxEventIds ?? []).length || 0} mailbox state row(s), ${(rehydration.resultArtifactPointers ?? []).length || 0} artifact pointer(s), and diagnosed missing result artifacts ${(rehydration.missingResultArtifactRunIds ?? []).join(", ") || "none"}.`,
  }];
}

function lifecycleEdgeObservations(artifact, validation) {
  if (!artifact) {
    return [{
      label: "lifecycle edge proof artifact",
      result: "No lifecycle edge proof artifact was produced.",
    }];
  }
  const covered = artifact.summary?.coveredEdgeKinds ?? [];
  const unsafe = artifact.summary?.unsafeEdgeIds ?? [];
  return [{
    label: "lifecycle edge proof artifact",
    result: validation.valid
      ? `Covered ${covered.join(", ")} with no unsafe edges.`
      : `Lifecycle edge proof artifact was present but not release-usable: ${validation.issues.join(" ")}`,
  }, {
    label: "lifecycle synthesis safety",
    result: `Unsafe edge ids: ${unsafe.length ? unsafe.join(", ") : "none"}.`,
  }];
}

function desktopDogfoodObservations(artifact, validation) {
  if (!artifact) {
    return [{
      label: "Desktop dogfood artifact",
      result: "No Desktop dogfood artifact was produced.",
    }];
  }
  const visualCount = passedAssertionCount(artifact.visualAssertions);
  const maturityCount = passedAssertionCount(artifact.maturityAssertions);
  const screenshots = desktopDogfoodScreenshotArtifacts(artifact).length;
  const requiredScenarioPassCount = desktopDogfoodRequiredScenarioPassCount(artifact);
  return [{
    label: "Desktop dogfood artifact",
    result: validation.valid
      ? `Passed ${requiredScenarioPassCount}/${REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS.length} required scenario(s), observed ${(artifact.scenarios ?? []).length} total scenario(s), with ${visualCount} visual assertions, ${maturityCount} maturity assertions, and ${screenshots} screenshot/accessibility artifacts.`
      : `Desktop dogfood artifact was present but not release-usable: ${validation.issues.join(" ")}`,
  }, {
    label: "Desktop visual layout",
    result: `Collapsed horizontal overflow: ${artifact.checks?.collapsed?.horizontalOverflowFree === true ? "none" : "reported"}; narrow critical overlaps: ${artifact.checks?.narrow?.criticalOverlapCount ?? "missing"}.`,
  }, {
    label: "Desktop runtime ownership",
    result: `Runtime ${artifact.localRuntimeId ?? "unknown"} lease ${artifact.localRuntimeLeaseId ?? "unknown"} showed active sub-agent ownership; untracked runtime ${artifact.untrackedRuntimeId ?? "unknown"} stayed external-only.`,
  }];
}

function desktopDogfoodContractSummary(artifact, validation) {
  const scenarios = Array.isArray(artifact?.scenarios) ? artifact.scenarios.filter(nonEmptyString) : [];
  const visualAssertions = objectValue(artifact?.visualAssertions);
  const maturityAssertions = objectValue(artifact?.maturityAssertions);
  const visualAssertionIds = passedAssertionIds(visualAssertions, REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS);
  const maturityAssertionIds = passedAssertionIds(maturityAssertions, REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS);
  const requiredChatExportCapabilities = requiredDesktopChatExportCapabilities();
  const chatExportAssertion = objectValue(maturityAssertions.desktop_chat_export_child_bundle);
  const chatExportCapabilities = uniqueStrings(chatExportAssertion.capabilities);
  const missingRequiredScenarios = REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS.filter((scenario) => !scenarios.includes(scenario));
  const missingRequiredVisualAssertions = REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS
    .filter((id) => visualAssertions[id]?.status !== "passed");
  const missingRequiredMaturityAssertions = REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS
    .filter((id) => maturityAssertions[id]?.status !== "passed");
  const missingRequiredChatExportCapabilities = requiredChatExportCapabilities
    .filter((capability) => !chatExportCapabilities.includes(capability));
  const missingCount = missingRequiredScenarios.length +
    missingRequiredVisualAssertions.length +
    missingRequiredMaturityAssertions.length +
    missingRequiredChatExportCapabilities.length;

  return {
    schemaVersion: "ambient-subagent-desktop-dogfood-contract-summary-v1",
    status: validation.valid && missingCount === 0 ? "passed" : "failed",
    scenarioIds: scenarios,
    requiredScenarioCount: REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS.length,
    requiredScenarioPassCount: REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS.length - missingRequiredScenarios.length,
    missingRequiredScenarios,
    visualAssertionIds,
    requiredVisualAssertionCount: REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS.length,
    missingRequiredVisualAssertions,
    maturityAssertionIds,
    requiredMaturityAssertionCount: REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS.length,
    missingRequiredMaturityAssertions,
    requiredChatExportCapabilities,
    chatExportCapabilities,
    missingRequiredChatExportCapabilities,
    screenshotArtifactCount: desktopDogfoodScreenshotArtifacts(artifact).length,
    ...(nonEmptyString(artifact?.gitCommit) ? { gitCommit: artifact.gitCommit } : {}),
  };
}

function requiredDesktopChatExportCapabilities() {
  const assertion = REQUIRED_DESKTOP_MATURITY_ASSERTIONS.find((candidate) =>
    candidate.id === "desktop_chat_export_child_bundle",
  );
  return uniqueStrings(assertion?.capabilities);
}

function prefixIssues(label, issues) {
  return (Array.isArray(issues) ? issues : [])
    .map((issue) => `${label}: ${issue}`);
}

function latestArrayItem(value) {
  return Array.isArray(value) && value.length > 0 ? value[value.length - 1] : undefined;
}

function parentApprovalEventForArtifact(artifact, expected) {
  const deliveryState = expected.deliveryState ?? "queued";
  return (Array.isArray(artifact?.parentMailboxEvents) ? artifact.parentMailboxEvents : [])
    .find((event) => {
      if (event?.type !== "subagent.child_approval_requested") return false;
      const payload = objectValue(event.payload);
      const parentBlockingState = objectValue(payload.parentBlockingState);
      return event.deliveryState === deliveryState &&
        payload.childRunId === expected.childRunId &&
        payload.childThreadId === expected.childThreadId &&
        payload.approvalId === expected.approvalId &&
        payload.requestedToolId === expected.requestedToolId &&
        payload.requestedAction === expected.requestedAction &&
        parentBlockingState.action === "forward_child_approval_then_wait" &&
        parentBlockingState.childRunId === expected.childRunId &&
        parentBlockingState.childThreadId === expected.childThreadId &&
        parentBlockingState.resumeParentBlocking === true;
    });
}

function passedAssertionIds(assertions, expectedIds) {
  const object = objectValue(assertions);
  const passedIds = Object.keys(object).filter((id) => objectValue(object[id]).status === "passed");
  return [
    ...expectedIds.filter((id) => passedIds.includes(id)),
    ...passedIds.filter((id) => !expectedIds.includes(id)).sort((left, right) => left.localeCompare(right)),
  ];
}

function desktopDogfoodMaturityAssertions(input) {
  const artifact = input.liveDesktopDogfoodArtifact;
  const validation = validateDesktopDogfoodConfidenceArtifact(artifact);
  const scenarios = Array.isArray(artifact?.scenarios) ? artifact.scenarios : [];
  const missingScenarios = REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS.filter((scenario) => !scenarios.includes(scenario));
  const visualAssertions = objectValue(artifact?.visualAssertions);
  const maturityAssertions = objectValue(artifact?.maturityAssertions);
  const checks = objectValue(artifact?.checks);

  return [
    maturityAssertion({
      id: "desktop_dogfood_scenario_coverage",
      label: "Desktop dogfood scenario coverage",
      status: validation.valid && missingScenarios.length === 0 ? "passed" : "failed",
      artifactPath: input.liveDesktopDogfoodArtifactPath,
      capabilities: [
        "electron_desktop_dogfood",
        "default_collapsed_state",
        "approval_parent_blocking",
        "workflow_execution_parent_blocking",
        "workflow_high_load_dogfood",
      ],
      evidence: missingScenarios.length === 0
        ? [
            `scenarios: ${scenarios.length}`,
            `parentThreadId: ${artifact?.parentThreadId ?? "unknown"}`,
            `childRunIds: ${(artifact?.childRunIds ?? []).join(", ") || "none"}`,
            `workflowHighLoadRows: ${artifact?.checks?.workflowHighLoad?.workflowRowCount ?? "unknown"}`,
          ]
        : [`missingScenarios: ${missingScenarios.join(", ")}`],
    }),
    maturityAssertion({
      id: "desktop_dogfood_visual_layout",
      label: "Desktop visual layout safety",
      status: validation.valid
        && REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS.every((id) => visualAssertions[id]?.status === "passed")
        && checks.collapsed?.horizontalOverflowFree === true
        && checks.expanded?.horizontalOverflowFree === true
        && checks.narrow?.horizontalOverflowFree === true
        && checks.narrow?.criticalOverlapCount === 0
        ? "passed"
        : "failed",
      artifactPath: input.liveDesktopDogfoodArtifactPath,
      capabilities: ["production_ui_visibility", "layout_safety", "visual_layout_safety"],
      evidence: [
        `visualAssertionsPassed: ${passedAssertionCount(artifact?.visualAssertions)}`,
        `collapsedHorizontalOverflowFree: ${checks.collapsed?.horizontalOverflowFree === true}`,
        `expandedHorizontalOverflowFree: ${checks.expanded?.horizontalOverflowFree === true}`,
        `narrowHorizontalOverflowFree: ${checks.narrow?.horizontalOverflowFree === true}`,
        `narrowCriticalOverlapCount: ${checks.narrow?.criticalOverlapCount ?? "missing"}`,
        `childTranscriptMessageBubbles: ${checks.childTranscript?.messageBubbleCount ?? "missing"}`,
        `childTranscriptRuntimeEvents: ${checks.childTranscript?.runtimeEventRows ?? "missing"}`,
        `childTranscriptMiniThreadHeader: ${checks.childTranscript?.miniThreadHeaderVisible === true}`,
        `childTranscriptOpenFullThread: ${checks.childTranscript?.openFullThreadActionVisible === true}`,
        `childTranscriptRuntimeTimeline: ${checks.childTranscript?.runtimeTimelineVisible === true}`,
        `completedChildEndCapAfterMessages: ${checks.completedChildTranscript?.completionEndCapAfterMessages === true}`,
        `completedChildMiniThreadHeader: ${checks.completedChildTranscript?.miniThreadHeaderVisible === true}`,
      ],
    }),
    maturityAssertion({
      id: "desktop_dogfood_lifecycle_edges",
      label: "Desktop lifecycle edge visibility",
      status: validation.valid && maturityAssertions.desktop_lifecycle_edges?.status === "passed" ? "passed" : "failed",
      artifactPath: input.liveDesktopDogfoodArtifactPath,
      capabilities: ["lifecycle_edge_desktop_behavior", "timeout_edge", "partial_result_edge", "retry_edge", "detach_edge", "parent_stop_cascade"],
      evidence: [
        `lifecycleParentMessageId: ${artifact?.lifecycleEdgeParentMessageId ?? "unknown"}`,
        `lifecycleChildRunIds: ${(artifact?.lifecycleEdgeChildRunIds ?? []).join(", ") || "none"}`,
        `timeoutChildVisible: ${checks.lifecycleEdgeVisibility?.timeoutChildVisible === true}`,
        `partialChildVisible: ${checks.lifecycleEdgeVisibility?.partialChildVisible === true}`,
        `retryChildVisible: ${checks.lifecycleEdgeVisibility?.retryChildVisible === true}`,
        `retryDecisionVisible: ${checks.lifecycleEdgeVisibility?.retryDecisionVisible === true}`,
        `detachedChildVisible: ${checks.lifecycleEdgeVisibility?.detachedChildVisible === true}`,
        `parentStopCascadeParentMessageId: ${artifact?.parentStopCascadeParentMessageId ?? "unknown"}`,
        `parentStopCascadeChildRunIds: ${(artifact?.parentStopCascadeChildRunIds ?? []).join(", ") || "none"}`,
        `parentStopCascadeVisible: ${checks.parentStopCascadeVisibility?.parentStoppedMailboxVisible === true}`,
        `parentStopCancellationRequestedVisible: ${checks.parentStopCascadeVisibility?.parentCancellationRequestedVisible === true}`,
        `parentStopCancelledMailboxEventsVisible: ${checks.parentStopCascadeVisibility?.cancelledMailboxEventsVisible === true}`,
      ],
    }),
    maturityAssertion({
      id: "desktop_dogfood_runtime_and_operator_controls",
      label: "Desktop runtime ownership and operator controls",
      status: validation.valid
        && maturityAssertions.desktop_local_runtime_ownership?.status === "passed"
        && maturityAssertions.desktop_operator_controls?.status === "passed"
        ? "passed"
        : "failed",
      artifactPath: input.liveDesktopDogfoodArtifactPath,
      capabilities: [
        "local_runtime_lease_ownership",
        "lease_stop_blocker",
        "untracked_runtime_safety",
        "operator_child_controls",
        "operator_control_behavior",
      ],
      evidence: [
        `localRuntimeLeaseId: ${artifact?.localRuntimeLeaseId ?? "unknown"}`,
        `localRuntimeId: ${artifact?.localRuntimeId ?? "unknown"}`,
        `untrackedRuntimeId: ${artifact?.untrackedRuntimeId ?? "unknown"}`,
        `ownerLabelVisible: ${checks.localRuntimeOwnership?.ownerLabelVisible === true}`,
        `activeLeaseVisible: ${checks.localRuntimeOwnership?.activeLeaseVisible === true}`,
        `stopDisabledVisible: ${checks.localRuntimeOwnership?.stopDisabledVisible === true}`,
        `completedChildClosed: ${checks.operatorBehavior?.completedChildClosed === true}`,
        `attentionChildCancelled: ${checks.operatorBehavior?.attentionChildCancelled === true}`,
        `typedBarrierConsequenceVisible: ${checks.operatorBehavior?.typedBarrierConsequenceVisible === true}`,
        `siblingStatePreserved: ${checks.operatorBehavior?.siblingStatePreserved === true}`,
      ],
    }),
  ];
}

function desktopDogfoodRequiredScenarioPassCount(artifact) {
  const scenarios = Array.isArray(artifact?.scenarios) ? artifact.scenarios : [];
  return REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS.filter((scenario) => scenarios.includes(scenario)).length;
}

function desktopDogfoodScreenshotArtifacts(artifact) {
  const artifacts = objectValue(artifact?.artifacts);
  return Object.entries(artifacts)
    .filter(([key, path]) => isDesktopDogfoodVisualArtifact(key, path))
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, path]) => ({
      label: desktopDogfoodArtifactLabel(key, path),
      path,
      kind: path.endsWith(".json") ? "json" : "screenshot",
    }));
}

function isDesktopDogfoodVisualArtifact(key, path) {
  if (!safeRelativePath(path)) return false;
  const normalizedKey = key.toLowerCase();
  const normalizedPath = path.toLowerCase();
  if (/\.(png|jpe?g|webp)$/.test(normalizedPath)) return true;
  return normalizedPath.endsWith(".json") &&
    (normalizedKey.includes("accessibility") || normalizedKey.includes("snapshot") || normalizedKey.includes("dom"));
}

function desktopDogfoodArtifactLabel(key, path) {
  if (path.endsWith(".json")) return `${camelCaseWords(key)} JSON artifact`;
  return `${camelCaseWords(key)} screenshot`;
}

function camelCaseWords(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function passedAssertionCount(assertions) {
  if (!assertions || typeof assertions !== "object" || Array.isArray(assertions)) return 0;
  return Object.values(assertions).filter((assertion) => assertion?.status === "passed").length;
}

function classifiedBlockersForRun(input) {
  if (input.interrupted) {
    const signal = input.interruptSignal ?? "abort";
    return [{
      kind: "harness_interrupted",
      summary: `${input.probe.subject} was interrupted by ${signal}; spawned process cleanup was requested before writing confidence evidence.`,
      classifiedAsEnvironmental: true,
      nextStep: "Rerun the live confidence command after confirming no stale Electron or test processes remain.",
    }];
  }
  if (input.timedOut) {
    return [{
      kind: "network",
      summary: `${input.probe.subject} exceeded the configured timeout before completion.`,
      classifiedAsEnvironmental: true,
      nextStep: "Retry the live confidence run or inspect provider/test idle-timeout behavior before treating this as a product regression.",
    }];
  }
  if (input.missingCredential) {
    return [{
      kind: "credential_missing",
      summary: `${input.probe.subject} could not start because the GMI Cloud credential was unavailable.`,
      classifiedAsEnvironmental: true,
      nextStep: "Bind GMI_CLOUD_API_KEY_FILE to an ignored local key file or provide an Ambient-managed secret before rerunning.",
    }];
  }
  if (input.environmentBlocker) {
    return [{
      kind: input.environmentBlocker.kind,
      summary: `${input.probe.subject} could not complete because ${input.environmentBlocker.summary}`,
      classifiedAsEnvironmental: true,
      nextStep: input.environmentBlocker.nextStep,
    }];
  }
  return [{
    kind: "environment",
    summary: `${input.probe.subject} was blocked before a release-usable result: ${input.probe.validation.issues.join(" ")}`,
    classifiedAsEnvironmental: true,
  }];
}

function productIssuesForRun(input) {
  return [{
    severity: "p1",
    summary: `${input.probe.subject} failed before release-usable evidence was produced. Exit code: ${input.commandResult.exitCode}; ${input.probe.issueLabel}: ${input.probe.validation.issues.join(" ") || "none"}.`,
    owner: "subagents",
  }];
}

function credentialMissingFromOutput(output) {
  return /Set GMI_CLOUD_API_KEY, GMI_API_KEY, GMI_CLOUD_API_KEY_FILE, or provide gmicloud-api-key\.txt/.test(output);
}

function environmentBlockerFromOutput(output) {
  const nativeRebuildBlocker = nativeRebuildEnvironmentBlockerFromOutput(output);
  if (nativeRebuildBlocker) return nativeRebuildBlocker;
  if (dependencyMissingFromOutput(output)) {
    return {
      kind: "dependency_missing",
      summary: "the checkout is missing local package dependencies or test runner binaries.",
      nextStep: "Install dependencies in the worktree, for example with pnpm install --frozen-lockfile, then rerun live confidence.",
    };
  }
  if (
    /environment\/snapshot issue/i.test(output)
    || /Workflow connector is not available:/i.test(output)
    || /Connect the requested account or launch with a credentialed snapshot/i.test(output)
    || /Snapshot copy requested/i.test(output)
    || /snapshot preflight failed/i.test(output)
    || /snapshot root did not contain userData\/workspace directories/i.test(output)
  ) {
    return {
      kind: "credentialed_snapshot_missing",
      summary: "the live workflow dogfood profile did not have an available copied credentialed snapshot with the required first-party connector credentials.",
      nextStep: "Launch the workflow dogfood harness with a valid credentialed Ambient snapshot copy, or run connector-free scenarios before treating this as a product regression.",
    };
  }
  if (/((pnpm|node|npm): command not found|spawn (pnpm|node|npm) ENOENT)/i.test(output)) {
    return {
      kind: "tooling_missing",
      summary: "required local package-manager tooling was unavailable.",
      nextStep: "Restore the local Node/pnpm toolchain for this worktree and rerun live confidence.",
    };
  }
  return undefined;
}

function dependencyMissingFromOutput(output) {
  return [
    /Local package\.json exists, but node_modules missing/i,
    /Command ["']?vitest["']? not found/i,
    /vitest: command not found/i,
    /Cannot find module ['"][^'"]*vitest[^'"]*['"]/i,
    /ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL[\s\S]*Command ["'][^"']+["'] not found/i,
  ].some((pattern) => pattern.test(output));
}

function providerKindForPlan(plan) {
  if (plan.providerId === "gmi-cloud") return "gmi-cloud";
  if (plan.providerId === "ambient") return "ambient";
  if (plan.providerId === "local-runtime" || plan.sliceKind === "local_runtime") return "local";
  return "custom";
}

function requirePassedScenario(scenario, id, issues) {
  if (!scenario) {
    issues.push(`Local runtime control proof is missing ${id} scenario.`);
  } else if (scenario.status !== "passed") {
    issues.push(`Local runtime control proof ${id} scenario status is ${scenario.status ?? "missing"}.`);
  }
}

function validateLifecycleEdgeArtifactRow(edge, issues) {
  const id = nonEmptyString(edge?.id) ? edge.id : "unknown";
  const requiredKinds = ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"];
  if (!requiredKinds.includes(edge?.kind)) {
    issues.push(`Sub-agent lifecycle edge ${id} has unknown kind ${edge?.kind ?? "missing"}.`);
    return;
  }
  for (const field of ["label", "parentBlockingStateBefore", "parentBlockingStateAfter"]) {
    if (!nonEmptyString(edge?.[field])) issues.push(`Sub-agent lifecycle edge ${id} is missing ${field}.`);
  }
  for (const field of ["childRunIds", "childThreadIds", "observedEventIds"]) {
    if (!nonEmptyStringArray(edge?.[field])) issues.push(`Sub-agent lifecycle edge ${id} is missing ${field}.`);
  }
  const safety = edge?.synthesisSafety ?? {};
  for (const field of [
    "parentDidNotSynthesizeUnsafeChild",
    "resultArtifactStateExplicit",
    "affectedChildrenNamed",
    "decisionOrEventAttributed",
    "visibleCollapsedThreadState",
  ]) {
    if (safety[field] !== true) issues.push(`Sub-agent lifecycle edge ${id} is missing synthesis safety ${field}.`);
  }
  if (edge.kind === "restart") {
    const restart = edge.restart ?? {};
    if (!nonEmptyStringArray(restart.interruptedRunIds)) issues.push(`Sub-agent lifecycle restart edge ${id} is missing interruptedRunIds.`);
    if (!nonEmptyStringArray(restart.diagnosticRunIds)) issues.push(`Sub-agent lifecycle restart edge ${id} is missing diagnosticRunIds.`);
    if (restart.restartRepairObserved !== true) issues.push(`Sub-agent lifecycle restart edge ${id} did not observe restart repair.`);
    if (restart.nonResumableMarkedInterrupted !== true) issues.push(`Sub-agent lifecycle restart edge ${id} did not mark non-resumable children interrupted.`);
  }
  if (edge.kind === "stop") {
    const stop = edge.stop ?? {};
    if (!nonEmptyStringArray(stop.stoppedRunIds)) issues.push(`Sub-agent lifecycle stop edge ${id} is missing stoppedRunIds.`);
    if (!nonEmptyStringArray(stop.siblingRunIdsUnaffected)) issues.push(`Sub-agent lifecycle stop edge ${id} is missing siblingRunIdsUnaffected.`);
    if (stop.structuredCancellationResult !== true) issues.push(`Sub-agent lifecycle stop edge ${id} is missing structuredCancellationResult.`);
    if (stop.capacityReleased !== true) issues.push(`Sub-agent lifecycle stop edge ${id} did not release capacity.`);
  }
  if (edge.kind === "detach") {
    const detach = edge.detach ?? {};
    if (!nonEmptyStringArray(detach.detachedRunIds)) issues.push(`Sub-agent lifecycle detach edge ${id} is missing detachedRunIds.`);
    if (detach.detachedChildrenExcludedFromSynthesis !== true) issues.push(`Sub-agent lifecycle detach edge ${id} did not exclude detached children from synthesis.`);
    if (detach.parentUnblockedAfterDecision !== true) issues.push(`Sub-agent lifecycle detach edge ${id} did not unblock parent after decision.`);
    if (detach.mailboxCleanupRecorded !== true) issues.push(`Sub-agent lifecycle detach edge ${id} did not record mailbox cleanup.`);
  }
  if (edge.kind === "cancel") {
    const cancel = edge.cancel ?? {};
    if (cancel.parentCancellationRequested !== true) issues.push(`Sub-agent lifecycle cancel edge ${id} is missing parentCancellationRequested.`);
    if (!nonEmptyStringArray(cancel.cancelledRunIds)) issues.push(`Sub-agent lifecycle cancel edge ${id} is missing cancelledRunIds.`);
    if (cancel.cancellationCascadeRecorded !== true) issues.push(`Sub-agent lifecycle cancel edge ${id} did not record cancellation cascade.`);
    if (cancel.parentReturnedCancelledState !== true) issues.push(`Sub-agent lifecycle cancel edge ${id} did not return parent cancelled state.`);
  }
  if (edge.kind === "retry") {
    const retry = edge.retry ?? {};
    if (!nonEmptyStringArray(retry.retryRequestedRunIds)) issues.push(`Sub-agent lifecycle retry edge ${id} is missing retryRequestedRunIds.`);
    if (!nonEmptyStringArray(retry.retryAcceptedRunIds)) issues.push(`Sub-agent lifecycle retry edge ${id} is missing retryAcceptedRunIds.`);
    if (!nonEmptyStringArray(retry.retryMailboxEventIds)) issues.push(`Sub-agent lifecycle retry edge ${id} is missing retryMailboxEventIds.`);
    if (retry.parentRemainedBlocked !== true) issues.push(`Sub-agent lifecycle retry edge ${id} did not keep parent blocked.`);
    if (retry.childSessionRestarted !== true) issues.push(`Sub-agent lifecycle retry edge ${id} did not restart the child session.`);
  }
  if (edge.kind === "timeout") {
    const timeout = edge.timeout ?? {};
    if (timeout.barrierStatus !== "timed_out") issues.push(`Sub-agent lifecycle timeout edge ${id} barrierStatus is ${timeout.barrierStatus ?? "missing"}.`);
    if (!nonEmptyString(timeout.failurePolicy)) issues.push(`Sub-agent lifecycle timeout edge ${id} is missing failurePolicy.`);
    if (!arrayIncludesAll(timeout.allowedUserChoiceIds, ["wait_again", "cancel_parent"])) {
      issues.push(`Sub-agent lifecycle timeout edge ${id} is missing wait_again/cancel_parent choices.`);
    }
    if (timeout.noTimedOutChildSynthesis !== true) issues.push(`Sub-agent lifecycle timeout edge ${id} allowed timed-out child synthesis.`);
  }
  if (edge.kind === "partial_result") {
    const partial = edge.partialResult ?? {};
    if (partial.decision !== "continue_with_partial") issues.push(`Sub-agent lifecycle partial-result edge ${id} decision is ${partial.decision ?? "missing"}.`);
    if (partial.partialSummaryIncluded !== true) issues.push(`Sub-agent lifecycle partial-result edge ${id} is missing partialSummaryIncluded.`);
    if (!nonEmptyStringArray(partial.omittedChildRunIds)) issues.push(`Sub-agent lifecycle partial-result edge ${id} is missing omittedChildRunIds.`);
    if (partial.failedChildNotSynthesized !== true) issues.push(`Sub-agent lifecycle partial-result edge ${id} did not exclude failed child output.`);
    if (partial.parentMarkedPartial !== true) issues.push(`Sub-agent lifecycle partial-result edge ${id} did not mark parent partial.`);
  }
}

function validateRestartRepairReplayEvidence(evidence, issues, labelPrefix = "") {
  if (!evidence || typeof evidence !== "object") {
    issues.push(`Sub-agent restart repair ${labelPrefix}replay evidence is missing.`);
    return;
  }
  if (evidence.schemaVersion !== "ambient-subagent-replay-evidence-v1") {
    issues.push(`Sub-agent restart repair ${labelPrefix}replay evidence schemaVersion is ${evidence.schemaVersion ?? "missing"}.`);
  }
  if (evidence.fixtureName !== "restart-repair-broken-child-tree") {
    issues.push(`Sub-agent restart repair ${labelPrefix}fixtureName is ${evidence.fixtureName ?? "missing"}.`);
  }
  if (evidence.liveTokens !== false) {
    issues.push(`Sub-agent restart repair ${labelPrefix}replay evidence must not require live tokens.`);
  }
  if (!positiveNumber(evidence.counts?.runtimeEvents)) {
    issues.push(`Sub-agent restart repair ${labelPrefix}runtime event evidence is missing.`);
  }
  if (!positiveNumber(evidence.counts?.persistedRunEvents)) {
    issues.push(`Sub-agent restart repair ${labelPrefix}persisted run event evidence is missing.`);
  }
  if (!positiveNumber(evidence.counts?.parentMailboxEvents)) {
    issues.push(`Sub-agent restart repair ${labelPrefix}parent mailbox evidence is missing.`);
  }
  if (!positiveNumber(evidence.counts?.childThreads)) {
    issues.push(`Sub-agent restart repair ${labelPrefix}child thread evidence is missing.`);
  }
  if (!Array.isArray(evidence.runtimeEventTimeline) || evidence.runtimeEventTimeline.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}runtimeEventTimeline is empty.`);
  }
  if (!Array.isArray(evidence.persistedRunEventTimeline) || evidence.persistedRunEventTimeline.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}persistedRunEventTimeline is empty.`);
  }
  if (!Array.isArray(evidence.parentMailboxTimeline) || evidence.parentMailboxTimeline.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}parentMailboxTimeline is empty.`);
  }
  if (!Array.isArray(evidence.childThreads) || evidence.childThreads.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}childThreads are missing.`);
  }
  const repair = evidence.restartRepair ?? {};
  const expectedIssueKinds = Array.isArray(repair.expectedIssueKinds) ? repair.expectedIssueKinds : [];
  const observedIssueKinds = Array.isArray(repair.observedIssueKinds) ? repair.observedIssueKinds : [];
  if (expectedIssueKinds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}expected issue kinds are missing.`);
  }
  if (observedIssueKinds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}observed issue kinds are missing.`);
  }
  const missingKinds = expectedIssueKinds.filter((kind) => !observedIssueKinds.includes(kind));
  if (missingKinds.length > 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}did not observe expected issue kinds: ${missingKinds.join(", ")}`);
  }
  if (!Array.isArray(repair.repairedRunIds) || repair.repairedRunIds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}repaired run ids are missing.`);
  }
  if (!Array.isArray(repair.repairedBarrierIds) || repair.repairedBarrierIds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}repaired barrier ids are missing.`);
  }
  if (!Array.isArray(repair.repairableSpawnEdgeRunIds) || repair.repairableSpawnEdgeRunIds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}repairable spawn-edge run ids are missing.`);
  }
  if (!Array.isArray(repair.danglingSpawnEdgeRunIds) || repair.danglingSpawnEdgeRunIds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}dangling spawn-edge run ids are missing.`);
  }
  if (!Array.isArray(repair.diagnosticRunIds) || repair.diagnosticRunIds.length === 0) {
    issues.push(`Sub-agent restart repair ${labelPrefix}diagnostic run ids are missing.`);
  }
  validateRestartRepairRehydrationProof(evidence.rehydration, issues, labelPrefix);
}

function validateRestartRepairRehydrationProof(rehydration, issues, labelPrefix = "") {
  if (!rehydration || typeof rehydration !== "object") {
    issues.push(`Sub-agent restart repair ${labelPrefix}rehydration proof is missing.`);
    return;
  }
  if (rehydration.schemaVersion !== "ambient-subagent-restart-rehydration-proof-v1") {
    issues.push(`Sub-agent restart repair ${labelPrefix}rehydration proof schemaVersion is ${rehydration.schemaVersion ?? "missing"}.`);
  }
  if (!nonEmptyStringArray(rehydration.childRunIds)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration childRunIds are missing.`);
  if (!nonEmptyStringArray(rehydration.childThreadIds)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration childThreadIds are missing.`);
  if (!nonEmptyStringArray(rehydration.parentMailboxEventIds)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration parentMailboxEventIds are missing.`);
  const mailboxStates = Array.isArray(rehydration.parentMailboxStates) ? rehydration.parentMailboxStates : [];
  if (mailboxStates.length === 0) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration parentMailboxStates are missing.`);
  for (const state of mailboxStates) {
    if (!nonEmptyString(state?.id)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration mailbox state is missing id.`);
    if (!nonEmptyString(state?.parentThreadId)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration mailbox ${state?.id ?? "unknown"} is missing parentThreadId.`);
    if (!nonEmptyString(state?.parentRunId)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration mailbox ${state?.id ?? "unknown"} is missing parentRunId.`);
    if (!["queued", "delivered", "consumed", "failed", "cancelled"].includes(state?.deliveryState)) {
      issues.push(`Sub-agent restart repair ${labelPrefix}rehydration mailbox ${state?.id ?? "unknown"} has invalid deliveryState ${state?.deliveryState ?? "missing"}.`);
    }
    if (!nonEmptyStringArray(state?.childRunIds)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration mailbox ${state?.id ?? "unknown"} is missing childRunIds.`);
  }
  if (!nonEmptyStringArray(rehydration.transcriptThreadIds)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration transcriptThreadIds are missing.`);
  const artifactPointers = Array.isArray(rehydration.resultArtifactPointers) ? rehydration.resultArtifactPointers : [];
  if (artifactPointers.length === 0) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration resultArtifactPointers are missing.`);
  for (const pointer of artifactPointers) {
    if (!nonEmptyString(pointer?.runId)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration artifact pointer is missing runId.`);
    if (!nonEmptyString(pointer?.childThreadId)) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration artifact pointer ${pointer?.runId ?? "unknown"} is missing childThreadId.`);
    if (![pointer?.artifactPath, pointer?.fullOutputPath, pointer?.structuredOutputPath].some(nonEmptyString)) {
      issues.push(`Sub-agent restart repair ${labelPrefix}rehydration artifact pointer ${pointer?.runId ?? "unknown"} is missing artifact paths.`);
    }
  }
  if (!nonEmptyStringArray(rehydration.missingResultArtifactRunIds)) {
    issues.push(`Sub-agent restart repair ${labelPrefix}rehydration missingResultArtifactRunIds are missing.`);
  }
  const integrity = rehydration.artifactPointerIntegrity ?? {};
  for (const field of [
    "allResultPointersHaveRunAndThread",
    "missingResultArtifactsDiagnosed",
    "parentMailboxChildRefsResolved",
    "transcriptChildRefsResolved",
  ]) {
    if (integrity[field] !== true) issues.push(`Sub-agent restart repair ${labelPrefix}rehydration integrity ${field} is not true.`);
  }
}

export function sanitizeEvidenceText(value) {
  return String(value)
    .replace(/\b(GMI_CLOUD_API_KEY|GMI_API_KEY|AMBIENT_API_KEY)\b\s*[:=]\s*["']?[^"'\s]+/gi, "$1=<redacted>")
    .replace(/\b(api[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}/gi, "$1=<redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-<redacted>");
}

function sanitizedCommandDisplay(display) {
  return sanitizeEvidenceText(display).replace(/GMI_CLOUD_API_KEY_FILE=[^\s]+/g, "GMI_CLOUD_API_KEY_FILE=<ignored-local-key-file>");
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function objectValue(value) {
  return value && typeof value === "object" ? value : {};
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.some(nonEmptyString);
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(nonEmptyString))];
}

function arrayIncludesAll(value, expected) {
  return Array.isArray(value) && expected.every((item) => value.includes(item));
}

function safeRelativePath(value) {
  return nonEmptyString(value) && !value.startsWith("/") && !value.split("/").includes("..");
}

function sha256Hex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}
