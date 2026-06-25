import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { nativeRebuildEnvironmentBlockerFromOutput } from "./native-rebuild-lock-lib.mjs";
import {
  REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS,
  REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS,
  REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS,
  REQUIRED_LIFECYCLE_EDGE_KINDS,
  REQUIRED_CALLABLE_WORKFLOW_DOGFOOD_MATURITY_ASSERTIONS,
  REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS,
  validateApprovalAuthorityArtifact,
  validateBrowserApprovalAuthorityArtifact,
  validateCallableWorkflowDogfoodConfidenceArtifact,
  validateCallableWorkflowRehydrationConfidenceArtifact,
  validateChildAuthorityConfidenceArtifacts,
  validateDesktopDogfoodConfidenceArtifact,
  validateLiveSmokeArtifact,
  validateLocalRuntimeControlProofArtifact,
  validateLongContextAuthorityArtifact,
  validateSubagentLifecycleEdgeArtifact,
  validateSubagentRestartRepairConfidenceArtifacts,
  validateWorkflowDogfoodArtifact,
  validateWorkflowSymphonyConfidenceArtifacts,
  validateWorkflowUiDogfoodMatrixArtifact,
  workflowUiDogfoodProfileForSliceKind,
  workflowUiDogfoodValidationOptions,
} from "./subagent-live-confidence-artifact-validators.mjs";
export {
  REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS,
  REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS,
  REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS,
  REQUIRED_LIFECYCLE_EDGE_KINDS,
  REQUIRED_CALLABLE_WORKFLOW_DOGFOOD_MATURITY_ASSERTIONS,
  REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS,
  validateApprovalAuthorityArtifact,
  validateBrowserApprovalAuthorityArtifact,
  validateCallableWorkflowDogfoodConfidenceArtifact,
  validateCallableWorkflowRehydrationConfidenceArtifact,
  validateChildAuthorityConfidenceArtifacts,
  validateDesktopDogfoodConfidenceArtifact,
  validateLiveSmokeArtifact,
  validateLocalRuntimeControlProofArtifact,
  validateLongContextAuthorityArtifact,
  validateSubagentLifecycleEdgeArtifact,
  validateSubagentRestartRepairArtifact,
  validateSubagentRestartRepairConfidenceArtifacts,
  validateWorkflowDogfoodArtifact,
  validateWorkflowSymphonyConfidenceArtifacts,
  validateWorkflowUiDogfoodMatrixArtifact,
  workflowUiDogfoodProfileForSliceKind,
  workflowUiDogfoodValidationOptions,
} from "./subagent-live-confidence-artifact-validators.mjs";
import { REQUIRED_DESKTOP_MATURITY_ASSERTIONS } from "./subagent-desktop-dogfood-evidence-contract.mjs";

export const SUBAGENT_LIVE_CONFIDENCE_RUNNER_SCHEMA_VERSION = "ambient-subagent-live-confidence-runner-v1";
export const SUBAGENT_LIVE_CONFIDENCE_EVIDENCE_SCHEMA_VERSION = "ambient-subagent-live-confidence-evidence-v3";
export const DEFAULT_SUBAGENT_LIVE_CONFIDENCE_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_SUBAGENT_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/latest.json";
export const DEFAULT_SUBAGENT_WORKFLOW_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/workflow-symphony-latest.json";
export const DEFAULT_SUBAGENT_WORKFLOW_BROADER_LIVE_CONFIDENCE_OUTPUT_PATH =
  "test-results/subagent-live-confidence/workflow-symphony-broader-latest.json";
export const DEFAULT_SUBAGENT_LOCAL_RUNTIME_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/local-runtime-latest.json";
export const DEFAULT_SUBAGENT_RESTART_REPAIR_LIVE_CONFIDENCE_OUTPUT_PATH =
  "test-results/subagent-live-confidence/restart-repair-latest.json";
export const DEFAULT_SUBAGENT_LIFECYCLE_EDGE_LIVE_CONFIDENCE_OUTPUT_PATH =
  "test-results/subagent-live-confidence/lifecycle-edges-latest.json";
export const DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_LIVE_CONFIDENCE_OUTPUT_PATH =
  "test-results/subagent-live-confidence/desktop-dogfood-latest.json";
export const DEFAULT_SUBAGENT_LIVE_SMOKE_ARTIFACT_PATH = "test-results/subagent-live-smoke/latest.json";
export const DEFAULT_SUBAGENT_AUTHORITY_LIVE_CONFIDENCE_OUTPUT_PATH = "test-results/subagent-live-confidence/child-authority-latest.json";
export const DEFAULT_SUBAGENT_LIVE_LONG_CONTEXT_AUTHORITY_ARTIFACT_PATH =
  "test-results/subagent-live-smoke/long-context-authority-latest.json";
export const DEFAULT_SUBAGENT_LIVE_APPROVAL_AUTHORITY_ARTIFACT_PATH = "test-results/subagent-live-smoke/approval-authority-latest.json";
export const DEFAULT_SUBAGENT_LIVE_BROWSER_APPROVAL_ARTIFACT_PATH = "test-results/subagent-live-smoke/browser-approval-latest.json";
export const DEFAULT_SUBAGENT_LIVE_WORKFLOW_ARTIFACT_PATH = "test-results/workflow-local-file-run-dogfood/latest.json";
export const DEFAULT_SUBAGENT_WORKFLOW_UI_DOGFOOD_ARTIFACT_PATH = "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json";
export const DEFAULT_SUBAGENT_WORKFLOW_BROADER_UI_DOGFOOD_ARTIFACT_PATH =
  "test-results/workflow-agent-thread-ui-dogfood/phase1-live-matrix-latest.json";
export const DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_DOGFOOD_ARTIFACT_PATH = "test-results/callable-workflow-dogfood/latest.json";
export const DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_REHYDRATION_ARTIFACT_PATH = "test-results/callable-workflow-rehydration/latest.json";
export const DEFAULT_SUBAGENT_LIVE_LOCAL_RUNTIME_ARTIFACT_PATH = "test-results/local-runtime-control-proof/latest.json";
export const DEFAULT_SUBAGENT_LIVE_LOCAL_RUNTIME_GATE_ARTIFACT_PATH = "test-results/local-runtime-control-proof-gate/latest.json";
export const DEFAULT_SUBAGENT_LIVE_RESTART_REPAIR_ARTIFACT_PATH = "test-results/subagent-replay-diagnostics/latest.json";
export const DEFAULT_SUBAGENT_LIVE_RESTART_REPAIR_FIXTURE_ARTIFACT_PATH =
  "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json";
export const DEFAULT_SUBAGENT_LIFECYCLE_EDGE_ARTIFACT_PATH = "test-results/subagent-lifecycle-edges/latest.json";
export const DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_ARTIFACT_PATH = "test-results/subagent-desktop-dogfood/latest.json";

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
    ...((input.liveSmokeArtifactPath ?? defaults.liveSmokeArtifactPath)
      ? { liveSmokeArtifactPath: input.liveSmokeArtifactPath ?? defaults.liveSmokeArtifactPath }
      : {}),
    ...((input.liveLongContextAuthorityArtifactPath ?? defaults.liveLongContextAuthorityArtifactPath)
      ? {
          liveLongContextAuthorityArtifactPath: input.liveLongContextAuthorityArtifactPath ?? defaults.liveLongContextAuthorityArtifactPath,
        }
      : {}),
    ...((input.liveApprovalAuthorityArtifactPath ?? defaults.liveApprovalAuthorityArtifactPath)
      ? { liveApprovalAuthorityArtifactPath: input.liveApprovalAuthorityArtifactPath ?? defaults.liveApprovalAuthorityArtifactPath }
      : {}),
    ...((input.liveBrowserApprovalArtifactPath ?? defaults.liveBrowserApprovalArtifactPath)
      ? { liveBrowserApprovalArtifactPath: input.liveBrowserApprovalArtifactPath ?? defaults.liveBrowserApprovalArtifactPath }
      : {}),
    ...((input.liveWorkflowArtifactPath ?? defaults.liveWorkflowArtifactPath)
      ? { liveWorkflowArtifactPath: input.liveWorkflowArtifactPath ?? defaults.liveWorkflowArtifactPath }
      : {}),
    ...((input.liveWorkflowUiDogfoodArtifactPath ?? defaults.liveWorkflowUiDogfoodArtifactPath)
      ? { liveWorkflowUiDogfoodArtifactPath: input.liveWorkflowUiDogfoodArtifactPath ?? defaults.liveWorkflowUiDogfoodArtifactPath }
      : {}),
    ...((input.liveCallableWorkflowDogfoodArtifactPath ?? defaults.liveCallableWorkflowDogfoodArtifactPath)
      ? {
          liveCallableWorkflowDogfoodArtifactPath:
            input.liveCallableWorkflowDogfoodArtifactPath ?? defaults.liveCallableWorkflowDogfoodArtifactPath,
        }
      : {}),
    ...((input.liveCallableWorkflowRehydrationArtifactPath ?? defaults.liveCallableWorkflowRehydrationArtifactPath)
      ? {
          liveCallableWorkflowRehydrationArtifactPath:
            input.liveCallableWorkflowRehydrationArtifactPath ?? defaults.liveCallableWorkflowRehydrationArtifactPath,
        }
      : {}),
    ...((input.liveLocalRuntimeArtifactPath ?? defaults.liveLocalRuntimeArtifactPath)
      ? { liveLocalRuntimeArtifactPath: input.liveLocalRuntimeArtifactPath ?? defaults.liveLocalRuntimeArtifactPath }
      : {}),
    ...((input.liveLocalRuntimeGateArtifactPath ?? defaults.liveLocalRuntimeGateArtifactPath)
      ? { liveLocalRuntimeGateArtifactPath: input.liveLocalRuntimeGateArtifactPath ?? defaults.liveLocalRuntimeGateArtifactPath }
      : {}),
    ...((input.liveRestartRepairArtifactPath ?? defaults.liveRestartRepairArtifactPath)
      ? { liveRestartRepairArtifactPath: input.liveRestartRepairArtifactPath ?? defaults.liveRestartRepairArtifactPath }
      : {}),
    ...((input.liveRestartRepairFixtureArtifactPath ?? defaults.liveRestartRepairFixtureArtifactPath)
      ? {
          liveRestartRepairFixtureArtifactPath: input.liveRestartRepairFixtureArtifactPath ?? defaults.liveRestartRepairFixtureArtifactPath,
        }
      : {}),
    ...((input.liveLifecycleEdgeArtifactPath ?? defaults.liveLifecycleEdgeArtifactPath)
      ? { liveLifecycleEdgeArtifactPath: input.liveLifecycleEdgeArtifactPath ?? defaults.liveLifecycleEdgeArtifactPath }
      : {}),
    ...((input.liveDesktopDogfoodArtifactPath ?? defaults.liveDesktopDogfoodArtifactPath)
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
  const liveSmokeArtifact =
    input.liveSmokeArtifact ?? (plan.liveSmokeArtifactPath ? await readJsonIfExists(plan.liveSmokeArtifactPath) : undefined);
  const liveLongContextAuthorityArtifact =
    input.liveLongContextAuthorityArtifact ??
    (plan.liveLongContextAuthorityArtifactPath ? await readJsonIfExists(plan.liveLongContextAuthorityArtifactPath) : undefined);
  const liveApprovalAuthorityArtifact =
    input.liveApprovalAuthorityArtifact ??
    (plan.liveApprovalAuthorityArtifactPath ? await readJsonIfExists(plan.liveApprovalAuthorityArtifactPath) : undefined);
  const liveBrowserApprovalArtifact =
    input.liveBrowserApprovalArtifact ??
    (plan.liveBrowserApprovalArtifactPath ? await readJsonIfExists(plan.liveBrowserApprovalArtifactPath) : undefined);
  const liveWorkflowArtifact =
    input.liveWorkflowArtifact ?? (plan.liveWorkflowArtifactPath ? await readJsonIfExists(plan.liveWorkflowArtifactPath) : undefined);
  const liveWorkflowUiDogfoodArtifact =
    input.liveWorkflowUiDogfoodArtifact ??
    (plan.liveWorkflowUiDogfoodArtifactPath ? await readJsonIfExists(plan.liveWorkflowUiDogfoodArtifactPath) : undefined);
  const liveCallableWorkflowDogfoodArtifact =
    input.liveCallableWorkflowDogfoodArtifact ??
    (plan.liveCallableWorkflowDogfoodArtifactPath ? await readJsonIfExists(plan.liveCallableWorkflowDogfoodArtifactPath) : undefined);
  const liveCallableWorkflowRehydrationArtifact =
    input.liveCallableWorkflowRehydrationArtifact ??
    (plan.liveCallableWorkflowRehydrationArtifactPath
      ? await readJsonIfExists(plan.liveCallableWorkflowRehydrationArtifactPath)
      : undefined);
  const liveLocalRuntimeArtifact =
    input.liveLocalRuntimeArtifact ??
    (plan.liveLocalRuntimeArtifactPath ? await readJsonIfExists(plan.liveLocalRuntimeArtifactPath) : undefined);
  const liveLocalRuntimeGateArtifact =
    input.liveLocalRuntimeGateArtifact ??
    (plan.liveLocalRuntimeGateArtifactPath ? await readJsonIfExists(plan.liveLocalRuntimeGateArtifactPath) : undefined);
  const liveRestartRepairArtifact =
    input.liveRestartRepairArtifact ??
    (plan.liveRestartRepairArtifactPath ? await readJsonIfExists(plan.liveRestartRepairArtifactPath) : undefined);
  const liveRestartRepairFixtureArtifact =
    input.liveRestartRepairFixtureArtifact ??
    (plan.liveRestartRepairFixtureArtifactPath ? await readJsonIfExists(plan.liveRestartRepairFixtureArtifactPath) : undefined);
  const liveLifecycleEdgeArtifact =
    input.liveLifecycleEdgeArtifact ??
    (plan.liveLifecycleEdgeArtifactPath ? await readJsonIfExists(plan.liveLifecycleEdgeArtifactPath) : undefined);
  const liveDesktopDogfoodArtifact =
    input.liveDesktopDogfoodArtifact ??
    (plan.liveDesktopDogfoodArtifactPath ? await readJsonIfExists(plan.liveDesktopDogfoodArtifactPath) : undefined);
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
  const status = livePassed ? "passed" : timedOut || interrupted || missingCredential || environmentBlocker ? "blocked" : "failed";
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
  artifacts.push(
    {
      label: "sanitized live confidence stdout",
      path: plan.stdoutPath,
      kind: "log",
    },
    {
      label: "sanitized live confidence stderr",
      path: plan.stderrPath,
      kind: "log",
    },
  );

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
    probes: [
      {
        label: probe.probeLabel,
        command: sanitizedCommandDisplay(plan.command.display),
        startedAt: input.startedAt,
        completedAt: input.completedAt,
      },
    ],
    artifacts,
    observations: probe.observations,
    classifiedBlockers:
      status === "blocked"
        ? classifiedBlockersForRun({
            timedOut,
            interrupted,
            interruptSignal: commandResult.interruptSignal,
            missingCredential,
            environmentBlocker,
            probe,
          })
        : [],
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
          ? [
              {
                label: validation.valid ? "child file approval authority proof" : "partial child file approval authority proof",
                path: input.plan.liveApprovalAuthorityArtifactPath,
                kind: "json",
              },
            ]
          : []),
        ...(input.plan.liveBrowserApprovalArtifactPath
          ? [
              {
                label: validation.valid ? "child browser approval authority proof" : "partial child browser approval authority proof",
                path: input.plan.liveBrowserApprovalArtifactPath,
                kind: "json",
              },
            ]
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
      subject:
        workflowUiDogfoodProfile === "broader"
          ? "Live Ambient/Pi broader workflow/Symphony dogfood"
          : "Live Ambient/Pi workflow/Symphony dogfood",
      probeLabel:
        workflowUiDogfoodProfile === "broader"
          ? "Ambient/Pi broader workflow/Symphony live dogfood"
          : "Ambient/Pi workflow/Symphony live dogfood",
      artifact: input.liveWorkflowArtifact,
      artifactPath: input.plan.liveWorkflowArtifactPath,
      additionalArtifacts: [
        ...(input.plan.liveCallableWorkflowDogfoodArtifactPath
          ? [
              {
                label: validation.valid
                  ? "callable workflow mutating child dogfood proof"
                  : "partial callable workflow mutating child dogfood proof",
                path: input.plan.liveCallableWorkflowDogfoodArtifactPath,
                kind: "json",
              },
            ]
          : []),
        ...(input.plan.liveWorkflowUiDogfoodArtifactPath
          ? [
              {
                label: validation.valid ? "Workflow Agent UI dogfood matrix proof" : "partial Workflow Agent UI dogfood matrix proof",
                path: input.plan.liveWorkflowUiDogfoodArtifactPath,
                kind: "json",
              },
            ]
          : []),
        ...(input.plan.liveCallableWorkflowRehydrationArtifactPath
          ? [
              {
                label: validation.valid ? "callable workflow task rehydration proof" : "partial callable workflow task rehydration proof",
                path: input.plan.liveCallableWorkflowRehydrationArtifactPath,
                kind: "json",
              },
            ]
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
        ? [
            {
              label: validation.valid ? "local runtime proof gate report" : "partial local runtime proof gate report",
              path: input.plan.liveLocalRuntimeGateArtifactPath,
              kind: "json",
            },
          ]
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
          ? [
              {
                label: validation.valid ? "restart repair fixture evidence" : "partial restart repair fixture evidence",
                path: input.plan.liveRestartRepairFixtureArtifactPath,
                kind: "json",
              },
            ]
          : []),
        ...(input.plan.liveLifecycleEdgeArtifactPath
          ? [
              {
                label: validation.valid ? "restart lifecycle edge proof" : "partial restart lifecycle edge proof",
                path: input.plan.liveLifecycleEdgeArtifactPath,
                kind: "json",
              },
            ]
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
      successSummary: (artifact) => `covered lifecycle edges ${(artifact?.summary?.coveredEdgeKinds ?? []).join(", ") || "none"}`,
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
          `- Missing: ${
            [
              ...evidence.desktopDogfoodContract.missingRequiredScenarios,
              ...evidence.desktopDogfoodContract.missingRequiredVisualAssertions,
              ...evidence.desktopDogfoodContract.missingRequiredMaturityAssertions,
              ...evidence.desktopDogfoodContract.missingRequiredChatExportCapabilities,
            ].join(", ") || "none"
          }`,
          "",
        ]
      : []),
    ...(Array.isArray(evidence.maturityAssertions) && evidence.maturityAssertions.length
      ? [
          "## Maturity Assertions",
          "",
          ...evidence.maturityAssertions.map((assertion) => {
            const evidenceText = Array.isArray(assertion.evidence) && assertion.evidence.length ? `; ${assertion.evidence.join("; ")}` : "";
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
    ...(evidence.productIssues.length ? evidence.productIssues.map((issue) => `- ${issue.severity}: ${issue.summary}`) : ["- none"]),
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
    const detail = input.environmentBlocker?.summary || input.probe.validation.issues.join(" ") || "no validation detail";
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
    return [
      {
        label: "live smoke artifact",
        result: "No live smoke artifact was produced.",
      },
    ];
  }
  return [
    {
      label: "live smoke artifact",
      result: validation.valid
        ? `Completed child run ${artifact.run?.id ?? "unknown"} for thread ${artifact.run?.childThreadId ?? "unknown"}.`
        : `Live smoke artifact was present but not release-usable: ${validation.issues.join(" ")}`,
    },
  ];
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

function workflowDogfoodObservations(artifact, validation) {
  if (!artifact) {
    return [
      {
        label: "live workflow dogfood artifact",
        result: "No live workflow dogfood artifact was produced.",
      },
    ];
  }
  return [
    {
      label: "live workflow dogfood artifact",
      result: validation.valid
        ? `Succeeded workflow run ${artifact.run?.id ?? "unknown"} for workflow thread ${artifact.artifact?.workflowThreadId ?? "unknown"}.`
        : `Live workflow dogfood artifact was present but not release-usable: ${validation.issues.join(" ")}`,
    },
  ];
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
  const observations = [...workflowDogfoodObservations(input.liveWorkflowArtifact, workflowValidation)];

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
      capabilities: ["broader_live_workflow_runs", "workflow_agent_ui_dogfood", "workflow_output_evidence", "electron_workflow_dogfood"],
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
  return (Array.isArray(artifact?.results) ? artifact.results : []).reduce(
    (total, result) => total + (positiveNumber(result?.runEvidence?.[field]) ? Number(result.runEvidence[field]) : 0),
    0,
  );
}

function workflowMaturityAssertionSummary(maturityAssertions, expectedAssertions) {
  if (!maturityAssertions || typeof maturityAssertions !== "object" || Array.isArray(maturityAssertions)) return "missing";
  return expectedAssertions.map((expected) => `${expected.id}:${maturityAssertions[expected.id]?.status ?? "missing"}`).join(",");
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
    return [
      {
        label: "local runtime control proof artifact",
        result: "No local runtime control proof artifact was produced.",
      },
    ];
  }
  const blocker = artifact.scenarios?.["active-subagent-stop-blocker"];
  const untracked = artifact.scenarios?.["untracked-runtime-safety"];
  const staleRecovery = artifact.scenarios?.["stale-lease-recovery"];
  const providerLifecycle = artifact.scenarios?.["provider-declared-lifecycle"];
  const owner = blocker?.affectedSubagents?.[0];
  const observations = [
    {
      label: "local runtime control proof artifact",
      result: validation.valid
        ? `Active lease ${owner?.leaseId ?? "unknown"} owned by ${owner?.displayName ?? owner?.subagentThreadId ?? "unknown sub-agent"} blocked ordinary Stop.`
        : `Local runtime proof artifact was present but not release-usable: ${validation.issues.join(" ")}`,
    },
  ];
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
      evidence:
        blocker?.status === "passed"
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
      evidence:
        untracked?.status === "passed"
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
      evidence:
        staleRecovery?.status === "passed"
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
      status:
        minicpm?.status === "passed" && stoppedDisplay?.status === "passed" && providerLifecycle?.status === "passed" ? "passed" : "failed",
      artifactPath: input.liveLocalRuntimeArtifactPath,
      capabilities: ["provider_lifecycle", "stopped_provider_display", "non_destructive_stop"],
      evidence:
        minicpm?.status === "passed" && stoppedDisplay?.status === "passed" && providerLifecycle?.status === "passed"
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
      status:
        positiveNumber(counts.runtimeEvents) &&
        positiveNumber(counts.persistedRunEvents) &&
        Array.isArray(replayEvidence.runtimeEventTimeline) &&
        replayEvidence.runtimeEventTimeline.length > 0 &&
        Array.isArray(replayEvidence.persistedRunEventTimeline) &&
        replayEvidence.persistedRunEventTimeline.length > 0
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
      status:
        nonEmptyStringArray(repair.repairedRunIds) &&
        nonEmptyStringArray(repair.repairedBarrierIds) &&
        nonEmptyStringArray(repair.repairableSpawnEdgeRunIds) &&
        nonEmptyStringArray(repair.diagnosticRunIds) &&
        childThreads.length > 0
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
      status:
        nonEmptyStringArray(rehydration.parentMailboxEventIds) &&
        mailboxStates.length > 0 &&
        integrity.parentMailboxChildRefsResolved === true
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
      status:
        resultPointers.length > 0 &&
        integrity.allResultPointersHaveRunAndThread === true &&
        integrity.missingResultArtifactsDiagnosed === true &&
        integrity.transcriptChildRefsResolved === true
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
      status:
        lifecycleValidation.valid &&
        lifecycleEdges.length > 0 &&
        lifecycleEdges.every(lifecycleEdgeHasSynthesisSafety) &&
        unsafeEdgeIds.length === 0
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
    ...REQUIRED_LIFECYCLE_EDGE_KINDS.map((kind) =>
      lifecycleEdgeMaturityAssertion({
        kind,
        edge: edgeByKind.get(kind),
        validation,
        artifactPath: input.liveLifecycleEdgeArtifactPath,
      }),
    ),
    maturityAssertion({
      id: "lifecycle_edge_synthesis_safety",
      label: "Lifecycle synthesis safety",
      status:
        validation.valid && edges.length > 0 && edges.every(lifecycleEdgeHasSynthesisSafety) && unsafeEdgeIds.length === 0
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
    return [
      {
        label: "restart repair replay diagnostics",
        result: "No restart repair replay diagnostics artifact was produced.",
      },
    ];
  }
  const evidence = artifact.replayEvidence ?? {};
  const repair = evidence.restartRepair ?? {};
  const rehydration = evidence.rehydration ?? {};
  const counts = evidence.counts ?? {};
  return [
    {
      label: "restart repair replay diagnostics",
      result: validation.valid
        ? `Observed ${(repair.observedIssueKinds ?? []).length} repair issue kinds with ${counts.runtimeEvents ?? 0} runtime events and ${counts.parentMailboxEvents ?? 0} parent mailbox events.`
        : `Restart repair replay diagnostics were present but not release-usable: ${validation.issues.join(" ")}`,
    },
    {
      label: "restart repaired objects",
      result: `Repaired runs ${(repair.repairedRunIds ?? []).join(", ") || "none"}; repaired barriers ${(repair.repairedBarrierIds ?? []).join(", ") || "none"}.`,
    },
    {
      label: "restart rehydration proof",
      result: `Rehydrated ${(rehydration.parentMailboxEventIds ?? []).length || 0} mailbox state row(s), ${(rehydration.resultArtifactPointers ?? []).length || 0} artifact pointer(s), and diagnosed missing result artifacts ${(rehydration.missingResultArtifactRunIds ?? []).join(", ") || "none"}.`,
    },
  ];
}

function lifecycleEdgeObservations(artifact, validation) {
  if (!artifact) {
    return [
      {
        label: "lifecycle edge proof artifact",
        result: "No lifecycle edge proof artifact was produced.",
      },
    ];
  }
  const covered = artifact.summary?.coveredEdgeKinds ?? [];
  const unsafe = artifact.summary?.unsafeEdgeIds ?? [];
  return [
    {
      label: "lifecycle edge proof artifact",
      result: validation.valid
        ? `Covered ${covered.join(", ")} with no unsafe edges.`
        : `Lifecycle edge proof artifact was present but not release-usable: ${validation.issues.join(" ")}`,
    },
    {
      label: "lifecycle synthesis safety",
      result: `Unsafe edge ids: ${unsafe.length ? unsafe.join(", ") : "none"}.`,
    },
  ];
}

function desktopDogfoodObservations(artifact, validation) {
  if (!artifact) {
    return [
      {
        label: "Desktop dogfood artifact",
        result: "No Desktop dogfood artifact was produced.",
      },
    ];
  }
  const visualCount = passedAssertionCount(artifact.visualAssertions);
  const maturityCount = passedAssertionCount(artifact.maturityAssertions);
  const screenshots = desktopDogfoodScreenshotArtifacts(artifact).length;
  const requiredScenarioPassCount = desktopDogfoodRequiredScenarioPassCount(artifact);
  return [
    {
      label: "Desktop dogfood artifact",
      result: validation.valid
        ? `Passed ${requiredScenarioPassCount}/${REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS.length} required scenario(s), observed ${(artifact.scenarios ?? []).length} total scenario(s), with ${visualCount} visual assertions, ${maturityCount} maturity assertions, and ${screenshots} screenshot/accessibility artifacts.`
        : `Desktop dogfood artifact was present but not release-usable: ${validation.issues.join(" ")}`,
    },
    {
      label: "Desktop visual layout",
      result: `Collapsed horizontal overflow: ${artifact.checks?.collapsed?.horizontalOverflowFree === true ? "none" : "reported"}; narrow critical overlaps: ${artifact.checks?.narrow?.criticalOverlapCount ?? "missing"}.`,
    },
    {
      label: "Desktop runtime ownership",
      result: `Runtime ${artifact.localRuntimeId ?? "unknown"} lease ${artifact.localRuntimeLeaseId ?? "unknown"} showed active sub-agent ownership; untracked runtime ${artifact.untrackedRuntimeId ?? "unknown"} stayed external-only.`,
    },
  ];
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
  const missingRequiredVisualAssertions = REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS.filter(
    (id) => visualAssertions[id]?.status !== "passed",
  );
  const missingRequiredMaturityAssertions = REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS.filter(
    (id) => maturityAssertions[id]?.status !== "passed",
  );
  const missingRequiredChatExportCapabilities = requiredChatExportCapabilities.filter(
    (capability) => !chatExportCapabilities.includes(capability),
  );
  const missingCount =
    missingRequiredScenarios.length +
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
  const assertion = REQUIRED_DESKTOP_MATURITY_ASSERTIONS.find((candidate) => candidate.id === "desktop_chat_export_child_bundle");
  return uniqueStrings(assertion?.capabilities);
}

function latestArrayItem(value) {
  return Array.isArray(value) && value.length > 0 ? value[value.length - 1] : undefined;
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
      evidence:
        missingScenarios.length === 0
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
      status:
        validation.valid &&
        REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS.every((id) => visualAssertions[id]?.status === "passed") &&
        checks.collapsed?.horizontalOverflowFree === true &&
        checks.expanded?.horizontalOverflowFree === true &&
        checks.narrow?.horizontalOverflowFree === true &&
        checks.narrow?.criticalOverlapCount === 0
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
      capabilities: [
        "lifecycle_edge_desktop_behavior",
        "timeout_edge",
        "partial_result_edge",
        "retry_edge",
        "detach_edge",
        "parent_stop_cascade",
      ],
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
      status:
        validation.valid &&
        maturityAssertions.desktop_local_runtime_ownership?.status === "passed" &&
        maturityAssertions.desktop_operator_controls?.status === "passed"
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
  return (
    normalizedPath.endsWith(".json") &&
    (normalizedKey.includes("accessibility") || normalizedKey.includes("snapshot") || normalizedKey.includes("dom"))
  );
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
    return [
      {
        kind: "harness_interrupted",
        summary: `${input.probe.subject} was interrupted by ${signal}; spawned process cleanup was requested before writing confidence evidence.`,
        classifiedAsEnvironmental: true,
        nextStep: "Rerun the live confidence command after confirming no stale Electron or test processes remain.",
      },
    ];
  }
  if (input.timedOut) {
    return [
      {
        kind: "network",
        summary: `${input.probe.subject} exceeded the configured timeout before completion.`,
        classifiedAsEnvironmental: true,
        nextStep:
          "Retry the live confidence run or inspect provider/test idle-timeout behavior before treating this as a product regression.",
      },
    ];
  }
  if (input.missingCredential) {
    return [
      {
        kind: "credential_missing",
        summary: `${input.probe.subject} could not start because the GMI Cloud credential was unavailable.`,
        classifiedAsEnvironmental: true,
        nextStep: "Bind GMI_CLOUD_API_KEY_FILE to an ignored local key file or provide an Ambient-managed secret before rerunning.",
      },
    ];
  }
  if (input.environmentBlocker) {
    return [
      {
        kind: input.environmentBlocker.kind,
        summary: `${input.probe.subject} could not complete because ${input.environmentBlocker.summary}`,
        classifiedAsEnvironmental: true,
        nextStep: input.environmentBlocker.nextStep,
      },
    ];
  }
  return [
    {
      kind: "environment",
      summary: `${input.probe.subject} was blocked before a release-usable result: ${input.probe.validation.issues.join(" ")}`,
      classifiedAsEnvironmental: true,
    },
  ];
}

function productIssuesForRun(input) {
  return [
    {
      severity: "p1",
      summary: `${input.probe.subject} failed before release-usable evidence was produced. Exit code: ${input.commandResult.exitCode}; ${input.probe.issueLabel}: ${input.probe.validation.issues.join(" ") || "none"}.`,
      owner: "subagents",
    },
  ];
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
    /environment\/snapshot issue/i.test(output) ||
    /Workflow connector is not available:/i.test(output) ||
    /Connect the requested account or launch with a credentialed snapshot/i.test(output) ||
    /Snapshot copy requested/i.test(output) ||
    /snapshot preflight failed/i.test(output) ||
    /snapshot root did not contain userData\/workspace directories/i.test(output)
  ) {
    return {
      kind: "credentialed_snapshot_missing",
      summary:
        "the live workflow dogfood profile did not have an available copied credentialed snapshot with the required first-party connector credentials.",
      nextStep:
        "Launch the workflow dogfood harness with a valid credentialed Ambient snapshot copy, or run connector-free scenarios before treating this as a product regression.",
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
