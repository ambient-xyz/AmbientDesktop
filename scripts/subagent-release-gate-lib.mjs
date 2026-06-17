import {
  SUBAGENT_LIVE_EVIDENCE_DECISIONS,
} from "./subagent-live-evidence-lanes.mjs";
import {
  REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS,
} from "./subagent-live-history-report-lib.mjs";
import {
  REQUIRED_DESKTOP_DOGFOOD_SCENARIOS,
  REQUIRED_DESKTOP_MATURITY_ASSERTIONS,
  REQUIRED_DESKTOP_VISUAL_ASSERTIONS,
} from "./subagent-desktop-dogfood-evidence-contract.mjs";
import {
  buildSubagentReleaseGateSourceChecks,
} from "./subagent-release-gate-source-checks.mjs";

const DEFAULT_MAX_ARTIFACT_AGE_HOURS = 24;
const REQUIRED_LIVE_HISTORY_GRADUATION_RUNS = 25;
const REQUIRED_LIVE_HISTORY_MAX_FAILURE_RATE = 0.05;
const REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS = 25;
const REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_DOGFOOD_RUNS = 10;
const REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_PROMPT_VARIANTS = 120;
const REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_DETERMINISTIC_STRESS_UNITS = 1_000;
const REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_FAMILIES = ["browser", "connector", "document", "local", "model-only", "recovery"];
export const SUBAGENT_RELEASE_GATE_LIVE_HISTORY_SCHEMA_VERSION = "ambient-subagent-release-gate-live-history-v1";

const REQUIRED_SCRIPTS = [
  ["test:subagents:replay-diagnostics", "deterministic replay diagnostics"],
  ["test:subagents:replay-diagnostics:unit", "replay diagnostics unit tests"],
  ["test:callable-workflow-dogfood:proof", "callable workflow mutating child dogfood proof"],
  ["test:callable-workflow-rehydration:proof", "callable workflow restart rehydration proof"],
  ["test:subagents:lifecycle-edges:proof", "sub-agent lifecycle edge proof"],
  ["test:subagents:visual-ui", "sub-agent production UI visual proof"],
  ["test:subagents:integrated-ui", "sub-agent integrated production UI proof"],
  ["test:subagents:deterministic", "deterministic sub-agent contract suite"],
  ["test:subagents:release-gate", "sub-agent release gate"],
  ["test:subagents:release-gate:unit", "sub-agent release gate unit tests"],
  ["test:subagents:live-evidence-lanes:unit", "shared live evidence lane contract tests"],
  ["test:subagents:live-history-report:unit", "sub-agent live history report unit tests"],
  ["test:subagents:live", "live Ambient/Pi sub-agent smoke"],
  ["test:subagents:live:smoke", "focused live Ambient/Pi sub-agent smoke"],
  ["test:subagents:live:authority", "focused live child authority smoke suite"],
  ["test:subagents:live-confidence", "classified live confidence evidence runner"],
  ["test:subagents:live-confidence:authority", "classified child authority live confidence evidence runner"],
  ["test:subagents:live-confidence:workflow-prereqs", "workflow/Symphony live confidence prerequisite proofs"],
  ["test:subagents:live-confidence:workflow", "classified workflow/Symphony live confidence evidence runner"],
  ["test:subagents:live-confidence:workflow-broader-prereqs", "broader workflow/Symphony live confidence prerequisite proofs"],
  ["test:subagents:live-confidence:workflow-broader", "classified broader workflow/Symphony live confidence evidence runner"],
  ["test:subagents:live-confidence:local-runtime", "classified local runtime live confidence evidence runner"],
  ["test:subagents:live-confidence:restart-repair-prereqs", "restart repair live confidence prerequisite proofs"],
  ["test:subagents:live-confidence:restart-repair", "classified restart repair live confidence evidence runner"],
  ["test:subagents:live-confidence:lifecycle-edges", "classified lifecycle edge confidence evidence runner"],
  ["test:subagents:live-confidence:desktop-dogfood", "classified Desktop dogfood confidence evidence runner"],
  ["test:subagents:live-confidence:unit", "classified live confidence evidence unit tests"],
  ["subagents:desktop-dogfood-history-report", "Desktop dogfood repeated history report"],
  ["test:subagents:desktop-dogfood-history-report:unit", "Desktop dogfood repeated history report unit tests"],
  ["test:local-runtime-control:proof", "local runtime ownership and lifecycle proof suite"],
  ["test:local-runtime-control:proof-gate", "local runtime ownership and lifecycle proof gate"],
  ["test:local-runtime-control:proof-gate:unit", "local runtime proof gate unit tests"],
  ["test:subagents:desktop-dogfood", "automated Electron Desktop sub-agent dogfood"],
  ["test:subagents:desktop-dogfood:unit", "automated Electron Desktop dogfood unit tests"],
  ["test:subagents:desktop-dogfood-repeat", "repeated automated Electron Desktop dogfood"],
  ["test:subagents:desktop-dogfood-repeat:unit", "repeated Desktop dogfood unit tests"],
  ["test:subagents:release-gate:live", "live-required sub-agent release gate"],
  ["test:subagents:release-gate:graduation", "feature-flag graduation sub-agent release gate"],
  ["test:workflow-local-file:live", "focused GMI-backed workflow live dogfood"],
  ["test:workflow-ui-dogfood:phase1-live:credentialed", "credentialed phase-1 Workflow Agent UI dogfood"],
  ["test:workflow-jitter-matrix:release-profile", "workflow jitter release-profile matrix"],
  ["test:workflow-jitter-release-gate:release-profile", "workflow jitter release-profile gate"],
];

const DETERMINISTIC_SUITE_COMMAND = "pnpm run test:subagents:deterministic";
const LOCAL_RUNTIME_CONTROL_PROOF_COMMAND = "pnpm run test:local-runtime-control:proof";
const REQUIRED_LIVE_RELEASE_GATE_COMMANDS = [
  "pnpm run test:subagents:live-confidence -- --allow-blocked",
  "pnpm run test:subagents:live-confidence:authority -- --allow-blocked",
  "pnpm run test:subagents:live-confidence:workflow -- --allow-blocked",
  "pnpm run test:subagents:live-confidence:workflow-broader -- --allow-blocked",
  "pnpm run test:subagents:live-confidence:local-runtime -- --allow-blocked",
  "pnpm run test:subagents:live-confidence:restart-repair -- --allow-blocked",
  "pnpm run test:subagents:live-confidence:lifecycle-edges -- --allow-blocked",
  "pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked",
];
const REQUIRED_DETERMINISTIC_TEST_FILES = [
  "src/shared/featureFlags.test.ts",
  "src/shared/subagentLiveEvidenceLanes.test.ts",
  "src/shared/modelRuntimeSettings.test.ts",
  "src/shared/subagentContracts.test.ts",
  "src/shared/symphonyWorkflowRecipes.test.ts",
  "src/shared/callableWorkflowLaunchCards.test.ts",
  "src/shared/subagentCapacity.test.ts",
  "src/shared/subagentTurnBudget.test.ts",
  "src/main/callable-workflow/callableWorkflowRegistry.test.ts",
  "src/main/projectStore/projectStoreSymphonyWorkflowRecipe.test.ts",
  "src/main/callable-workflow/callableWorkflowPiTools.test.ts",
  "src/main/callable-workflow/callableWorkflowExecutionPlan.test.ts",
  "src/main/callable-workflow/callableWorkflowTaskQueue.test.ts",
  "src/main/callable-workflow/callableWorkflowRunner.test.ts",
  "src/main/callable-workflow/callableWorkflowDogfoodEvidence.test.ts",
  "src/main/callable-workflow/callableWorkflowRehydrationEvidence.test.ts",
  "src/main/subagents/subagentLifecycleEdgeEvidence.test.ts",
  "src/main/workflow-compiler/workflowCompilerService.test.ts",
  "src/main/agent-runtime/agentRuntimeCallableWorkflowBridge.test.ts",
  "src/main/agent-runtime/agentRuntimeCallableWorkflowTools.test.ts",
  "src/main/agent-runtime/ambient-workflow/agentRuntimeAmbientWorkflowReadOnlyTools.test.ts",
  "src/main/callable-workflow/callableWorkflowParentBlocking.test.ts",
  "src/main/agent-runtime/agentRuntimeFinalizationBlocking.test.ts",
  "src/main/workflow/workflowAgentRuntime.test.ts",
  "src/main/modelRuntimeRegistry.test.ts",
  "src/main/model-provider/modelProviderCapabilityProbe.test.ts",
  "src/main/model-provider/modelProviderCapabilityProbeRunner.test.ts",
  "src/main/model-provider/modelProviderEndpointProbeAdapter.test.ts",
  "src/main/model-provider/modelProviderEndpointProbeService.test.ts",
  "src/main/model-provider/modelProviderCredentialStore.test.ts",
  "src/main/model-provider/modelProviderSettingsInstall.test.ts",
  "src/main/subagents/subagentHardening.test.ts",
  "src/main/subagents/subagentInvariants.test.ts",
  "src/main/subagents/subagentObservability.test.ts",
  "src/main/subagents/subagentIdempotency.test.ts",
  "src/main/pi/piChildSessionAdapter.test.ts",
  "src/main/pi/piEventMapper.test.ts",
  "src/main/subagents/subagentRuntimeEventPersistence.test.ts",
  "src/main/subagents/subagentContextFilter.test.ts",
  "src/main/subagents/subagentPromptRuntime.test.ts",
  "src/main/subagents/subagentStructuredOutput.test.ts",
  "src/main/subagents/subagentCompletionGuard.test.ts",
  "src/main/subagents/subagentStartupReconciliation.test.ts",
  "src/main/subagents/subagentLifecycleParentMailbox.test.ts",
  "src/main/subagents/subagentRepair.test.ts",
  "src/main/subagents/subagentRetention.test.ts",
  "src/main/subagents/subagentLifecycleHooks.test.ts",
  "src/main/subagents/subagentApprovalBridge.test.ts",
  "src/main/subagents/subagentSupervisorRequest.test.ts",
  "src/main/subagents/subagentApprovalDecision.test.ts",
  "src/main/ipc/registerSubagentIpc.test.ts",
  "src/main/ipc/registerSettingsIpc.test.ts",
  "src/main/subagents/subagentReviewedMaturityEvidence.test.ts",
  "src/main/subagents/subagentLiveSmokeEvidence.test.ts",
  "src/main/chat-export/chatExport.test.ts",
  "src/main/subagents/subagentLiveHistoryEvidence.test.ts",
  "src/main/subagents/subagentLiveConfidenceEvidence.test.ts",
  "src/main/subagents/subagentLiveConfidenceMaturityEvidence.test.ts",
  "src/main/subagents/subagentMaturity.test.ts",
  "src/main/subagents/subagentThreatModel.test.ts",
  "src/main/projectStore/projectStoreSubagentFoundation.test.ts",
  "src/main/subagents/subagentPiTools.test.ts",
  "src/main/subagents/subagentPiToolInput.test.ts",
  "src/main/subagents/subagentPiToolResult.test.ts",
  "src/main/subagents/subagentSpawnPreRunPlanner.test.ts",
  "src/main/subagents/subagentSpawnPreflightResolver.test.ts",
  "src/main/subagents/subagentChildWorktreePreparer.test.ts",
  "src/main/subagents/subagentTargetResolver.test.ts",
  "src/main/subagents/subagentToolScopeRequest.test.ts",
  "src/main/subagents/subagentToolScopeLaunchPolicy.test.ts",
  "src/main/subagents/subagentSpawnBlockDecision.test.ts",
  "src/main/subagents/subagentPreRunSpawnFailureRecorder.test.ts",
  "src/main/subagents/subagentPostReservationSpawnFailureRecorder.test.ts",
  "src/main/subagents/subagentLaunchRejectionRecorder.test.ts",
  "src/main/subagents/subagentSpawnLaunchExecutor.test.ts",
  "src/main/subagents/subagentFailedSpawnWaitBarrier.test.ts",
  "src/main/subagents/subagentResultValidation.test.ts",
  "src/main/subagents/subagentWaitBarrierResolution.test.ts",
  "src/main/subagents/subagentWaitContextResolver.test.ts",
  "src/main/subagents/subagentWaitAgentExecutor.test.ts",
  "src/main/subagents/subagentTurnBudgetWrapUpRecorder.test.ts",
  "src/main/subagents/subagentWaitCompletionRecorder.test.ts",
  "src/main/subagents/subagentWaitBarrierAttentionRecorder.test.ts",
  "src/main/subagents/subagentSpawnFailure.test.ts",
  "src/main/subagents/subagentSpawnRequest.test.ts",
  "src/main/subagents/subagentMailbox.test.ts",
  "src/main/subagents/subagentMailboxRequest.test.ts",
  "src/main/subagents/subagentChildMailboxExecutor.test.ts",
  "src/main/subagents/subagentAgentStatus.test.ts",
  "src/main/subagents/subagentChildActiveTools.test.ts",
  "src/main/subagents/subagentGroupJoin.test.ts",
  "src/main/subagents/subagentGroupedCompletionRecorder.test.ts",
  "src/main/subagents/subagentToolScopeSnapshot.test.ts",
  "src/main/subagents/subagentParentPolicyResolution.test.ts",
  "src/main/subagents/subagentWaitBarrierEvaluation.test.ts",
  "src/main/subagents/subagentWaitMailbox.test.ts",
  "src/main/subagents/subagentBarrierDecision.test.ts",
  "src/main/subagents/subagentBarrierDecisionRecorder.test.ts",
  "src/main/subagents/subagentBarrierControl.test.ts",
  "src/main/subagents/subagentBarrierControlExecutor.test.ts",
  "src/main/subagents/subagentBarrierDecisionExecutor.test.ts",
  "src/main/subagents/subagentCancelAgent.test.ts",
  "src/main/subagents/subagentCancelAgentExecutor.test.ts",
  "src/main/subagents/subagentCloseAgent.test.ts",
  "src/main/subagents/subagentCloseAgentExecutor.test.ts",
  "src/main/subagents/subagentBatchJobs.test.ts",
  "src/main/local-runtime/localTextDelegation.test.ts",
  "src/main/local-runtime/localTextSubagentRuntime.test.ts",
  "src/main/local-runtime/localModelRuntimeManager.test.ts",
  "src/main/local-runtime/localRuntimeInventory.test.ts",
  "src/main/local-runtime/localModelRuntimeStatus.test.ts",
  "src/main/local-runtime/localModelRuntimeStart.test.ts",
  "src/main/local-runtime/localModelRuntimeStop.test.ts",
  "src/main/local-runtime/localModelRuntimeRestart.test.ts",
  "src/main/local-runtime/agentRuntimeLocalRuntimeTools.test.ts",
  "src/main/local-runtime/localModelResourceRegistry.test.ts",
  "src/main/local-runtime/localTextSubagentStartupConfig.test.ts",
  "src/main/diagnostics/diagnostics.test.ts",
  "src/main/diagnostics/diagnosticBundleImport.test.ts",
  "src/renderer/src/modelRuntimeCatalogUiModel.test.ts",
  "src/renderer/src/modelProviderOnboardingUiModel.test.ts",
  "src/renderer/src/symphonyWorkflowBuilderUiModel.test.ts",
  "src/renderer/src/SymphonyWorkflowBuilder.test.tsx",
  "src/renderer/src/subagentParentClusterUiModel.test.ts",
  "src/renderer/src/SubagentParentCluster.test.tsx",
  "src/renderer/src/subagentThreadInspectorUiModel.test.ts",
  "src/renderer/src/subagentRepairDiagnosticsUiModel.test.ts",
  "src/renderer/src/subagentMaturityUiModel.test.ts",
  "src/renderer/src/subagentReplayEvidenceUiModel.test.ts",
  "src/renderer/src/localRuntimeEvidenceUiModel.test.ts",
  "src/renderer/src/diagnosticExportHistoryUiModel.test.ts",
  "src/renderer/src/settingsLayout.test.ts",
  "src/renderer/src/diagnosticExportUiModel.test.ts",
  "scripts/subagent-desktop-dogfood.test.mjs",
  "scripts/subagent-desktop-dogfood-repeat.test.mjs",
];

export function buildSubagentReleaseGateReport(input = {}) {
  const now = input.now ? new Date(input.now) : new Date();
  const requireLive = input.requireLive === true;
  const requireMaturityHistory = input.requireMaturityHistory === true;
  const maxArtifactAgeHours = positiveNumber(input.maxArtifactAgeHours, DEFAULT_MAX_ARTIFACT_AGE_HOURS);
  const packageJson = objectValue(input.packageJson);
  const scripts = objectValue(packageJson.scripts);
  const files = objectValue(input.files);
  const artifacts = objectValue(input.artifacts);
  const checks = [
    ...buildSubagentReleaseGateCommandChecks(scripts),
    ...buildSubagentReleaseGateSourceChecks(files),
    ...buildSubagentReleaseGateArtifactChecks({ artifacts, now, maxArtifactAgeHours, requireLive, requireMaturityHistory }),
  ];
  const blockingIssues = checks.filter((check) => check.status === "failed").flatMap((check) => check.issues);
  const advisoryIssues = checks.filter((check) => check.status === "advisory").flatMap((check) => check.warnIssues);
  const status = blockingIssues.length ? "attention" : advisoryIssues.length ? "passed_with_advisories" : "passed";
  return {
    schemaVersion: "ambient-subagent-release-gate-v1",
    status,
    startedAt: input.startedAt ?? now.toISOString(),
    completedAt: input.completedAt ?? now.toISOString(),
    policy: {
      requireLive,
      requireMaturityHistory,
      maxArtifactAgeHours,
      featureFlag: "ambient.subagents",
      liveEvidencePath: artifacts.liveSmoke?.__artifactPath,
      liveConfidenceEvidencePath: artifacts.liveConfidence?.__artifactPath,
      liveAuthorityConfidenceEvidencePath: artifacts.liveAuthorityConfidence?.__artifactPath,
      liveWorkflowConfidenceEvidencePath: artifacts.liveWorkflowConfidence?.__artifactPath,
      liveWorkflowBroaderConfidenceEvidencePath: artifacts.liveWorkflowBroaderConfidence?.__artifactPath,
      liveLocalRuntimeConfidenceEvidencePath: artifacts.liveLocalRuntimeConfidence?.__artifactPath,
      liveRestartRepairConfidenceEvidencePath: artifacts.liveRestartRepairConfidence?.__artifactPath,
      liveLifecycleEdgeConfidenceEvidencePath: artifacts.liveLifecycleEdgeConfidence?.__artifactPath,
      liveDesktopDogfoodConfidenceEvidencePath: artifacts.liveDesktopDogfoodConfidence?.__artifactPath,
      liveNodeHarnessManifestPath: artifacts.liveNodeHarnessManifest?.__artifactPath,
      electronDogfoodHarnessManifestPath: artifacts.electronDogfoodHarnessManifest?.__artifactPath,
      desktopDogfoodPath: artifacts.desktopDogfood?.__artifactPath,
      liveHistoryReportPath: artifacts.liveHistoryReport?.__artifactPath,
      desktopDogfoodHistoryPath: artifacts.desktopDogfoodHistory?.__artifactPath,
      workflowJitterReleaseGatePath: artifacts.workflowJitterReleaseGate?.__artifactPath,
      replayDiagnosticsPath: artifacts.replayDiagnostics?.__artifactPath,
      callableWorkflowDogfoodPath: artifacts.callableWorkflowDogfood?.__artifactPath,
      callableWorkflowRehydrationPath: artifacts.callableWorkflowRehydration?.__artifactPath,
      lifecycleEdgesPath: artifacts.lifecycleEdges?.__artifactPath,
    },
    checks,
    releaseDecision: {
      ready: blockingIssues.length === 0,
      liveRequired: requireLive,
      liveSkipped: !isValidLiveSmokeArtifact(artifacts.liveSmoke).valid,
      liveConfidenceSkipped: !isValidLiveConfidenceArtifact(artifacts.liveConfidence).valid,
      liveAuthorityConfidenceSkipped: !isValidLiveConfidenceArtifact(artifacts.liveAuthorityConfidence).valid,
      liveWorkflowConfidenceSkipped: !isValidLiveConfidenceArtifact(artifacts.liveWorkflowConfidence).valid,
      liveWorkflowBroaderConfidenceSkipped: !isValidLiveConfidenceArtifact(artifacts.liveWorkflowBroaderConfidence).valid,
      liveLocalRuntimeConfidenceSkipped: !isValidLiveConfidenceArtifact(artifacts.liveLocalRuntimeConfidence).valid,
      liveRestartRepairConfidenceSkipped: !isValidLiveConfidenceArtifact(artifacts.liveRestartRepairConfidence).valid,
      liveLifecycleEdgeConfidenceSkipped: !isValidLiveConfidenceArtifact(artifacts.liveLifecycleEdgeConfidence).valid,
      liveDesktopDogfoodConfidenceSkipped: !isValidLiveConfidenceArtifact(artifacts.liveDesktopDogfoodConfidence).valid,
      liveNodeHarnessManifestSkipped: !isValidHarnessManifest(artifacts.liveNodeHarnessManifest).valid,
      electronDogfoodHarnessManifestSkipped: !isValidHarnessManifest(artifacts.electronDogfoodHarnessManifest).valid,
      desktopDogfoodSkipped: !isValidDesktopDogfoodArtifact(artifacts.desktopDogfood).valid,
      liveHistoryReportSkipped: !isValidSubagentLiveHistoryReport(artifacts.liveHistoryReport).valid,
      desktopDogfoodHistorySkipped: !isValidDesktopDogfoodHistoryReport(artifacts.desktopDogfoodHistory).valid,
      workflowJitterReleaseProfileSkipped: !isValidWorkflowJitterReleaseProfileArtifact(artifacts.workflowJitterReleaseGate).valid,
      blockingIssues,
      advisoryIssues,
      nextSlice: nextSlice({ blockingIssues, advisoryIssues, requireLive }),
    },
  };
}

function buildSubagentReleaseGateCommandChecks(scripts) {
  return [
    ...scriptChecks(scripts),
    deterministicSuiteCoverageCheck(scripts),
    liveHarnessRoutingCheck(scripts),
  ];
}

function buildSubagentReleaseGateArtifactChecks({ artifacts, now, maxArtifactAgeHours, requireLive, requireMaturityHistory }) {
  return [
    replayDiagnosticsArtifactCheck(artifacts.replayDiagnostics, { now, maxArtifactAgeHours }),
    callableWorkflowDogfoodArtifactCheck(artifacts.callableWorkflowDogfood, { now, maxArtifactAgeHours }),
    callableWorkflowRehydrationArtifactCheck(artifacts.callableWorkflowRehydration, { now, maxArtifactAgeHours }),
    lifecycleEdgeArtifactCheck(artifacts.lifecycleEdges, { now, maxArtifactAgeHours }),
    liveSmokeArtifactCheck(artifacts.liveSmoke, { now, maxArtifactAgeHours, requireLive }),
    harnessManifestCheck(artifacts.liveNodeHarnessManifest, {
      now,
      maxArtifactAgeHours,
      requireLive,
      id: "artifact.harness-live-node",
      label: "live Node harness manifest separates environment, provider, harness, and product status",
      missingPath: "test-results/harness/live-node-latest.manifest.json",
    }),
    liveConfidenceArtifactCheck(artifacts.liveConfidence, { now, maxArtifactAgeHours, requireLive }),
    liveConfidenceArtifactCheck(artifacts.liveAuthorityConfidence, {
      now,
      maxArtifactAgeHours,
      requireLive,
      expectedSliceKind: "child_authority",
      id: "artifact.live-authority-confidence",
      label: "child authority live confidence evidence is present when available",
      missingPath: "test-results/subagent-live-confidence/child-authority-latest.json",
      missingRequiredIssue: "Child authority live confidence evidence is required but missing.",
      missingSkippedIssue: "Child authority live confidence evidence was skipped for this deterministic gate run.",
      expectedMaturityAssertions: [{
        id: "child_long_context_authority",
        capabilities: [
          "delegated_tool_authority",
          "long_context_authority_roots",
          "document_root_inheritance",
          "secret_non_leakage",
        ],
      }, {
        id: "child_file_approval_authority",
        capabilities: [
          "parent_approval_forwarding",
          "child_approval_pause",
          "parent_blocking_resume",
          "child_scoped_approval",
          "secret_non_leakage",
        ],
      }, {
        id: "child_browser_approval_authority",
        capabilities: [
          "browser_authority",
          "parent_approval_forwarding",
          "child_approval_pause",
          "parent_blocking_resume",
          "child_scoped_approval",
          "browser_approval_resume",
        ],
      }],
    }),
    liveConfidenceArtifactCheck(artifacts.liveWorkflowConfidence, {
      now,
      maxArtifactAgeHours,
      requireLive,
      expectedSliceKind: "workflow_symphony",
      id: "artifact.live-workflow-confidence",
      label: "workflow/Symphony live confidence evidence is present when available",
      missingPath: "test-results/subagent-live-confidence/workflow-symphony-latest.json",
      missingRequiredIssue: "Workflow/Symphony live confidence evidence is required but missing.",
      missingSkippedIssue: "Workflow/Symphony live confidence evidence was skipped for this deterministic gate run.",
      expectedMaturityAssertions: [{
        id: "live_workflow_run",
        capabilities: ["workflow_launch", "ambient_runtime_call", "artifact_link", "checkpoint_output"],
      }, {
        id: "broader_workflow_ui_dogfood",
        capabilities: [
          "broader_live_workflow_runs",
          "workflow_agent_ui_dogfood",
          "workflow_output_evidence",
          "electron_workflow_dogfood",
        ],
      }, {
        id: "child_mutating_workflow",
        capabilities: [
          "mutating_child_workflow",
          "child_scoped_approval",
          "isolated_child_worktree",
          "parent_blocking_workflow",
          "denied_workflow_scope",
        ],
      }, {
        id: "workflow_task_artifact_rehydration",
        capabilities: ["workflow_task_rehydration", "artifact_link", "checkpoint_output"],
      }],
    }),
    liveConfidenceArtifactCheck(artifacts.liveWorkflowBroaderConfidence, {
      now,
      maxArtifactAgeHours,
      requireLive,
      expectedSliceKind: "workflow_symphony_broader",
      id: "artifact.live-workflow-broader-confidence",
      label: "broader workflow/Symphony live confidence evidence is present when available",
      missingPath: "test-results/subagent-live-confidence/workflow-symphony-broader-latest.json",
      missingRequiredIssue: "Broader Workflow/Symphony live confidence evidence is required but missing.",
      missingSkippedIssue: "Broader Workflow/Symphony live confidence evidence was skipped for this deterministic gate run.",
      expectedMaturityAssertions: [{
        id: "live_workflow_run",
        capabilities: ["workflow_launch", "ambient_runtime_call", "artifact_link", "checkpoint_output"],
      }, {
        id: "broader_workflow_ui_dogfood",
        capabilities: [
          "broader_live_workflow_runs",
          "workflow_agent_ui_dogfood",
          "workflow_output_evidence",
          "electron_workflow_dogfood",
        ],
      }, {
        id: "child_mutating_workflow",
        capabilities: [
          "mutating_child_workflow",
          "child_scoped_approval",
          "isolated_child_worktree",
          "parent_blocking_workflow",
          "denied_workflow_scope",
        ],
      }, {
        id: "workflow_task_artifact_rehydration",
        capabilities: ["workflow_task_rehydration", "artifact_link", "checkpoint_output"],
      }],
    }),
    liveConfidenceArtifactCheck(artifacts.liveLocalRuntimeConfidence, {
      now,
      maxArtifactAgeHours,
      requireLive,
      expectedSliceKind: "local_runtime",
      id: "artifact.live-local-runtime-confidence",
      label: "local runtime live confidence evidence is present when available",
      missingPath: "test-results/subagent-live-confidence/local-runtime-latest.json",
      missingRequiredIssue: "Local runtime live confidence evidence is required but missing.",
      missingSkippedIssue: "Local runtime live confidence evidence was skipped for this deterministic gate run.",
      expectedMaturityAssertions: [{
        id: "local_runtime_active_lease_stop_blocker",
        capabilities: ["local_runtime_lease_ownership", "lease_stop_blocker"],
      }, {
        id: "local_runtime_untracked_safety",
        capabilities: ["untracked_runtime_safety"],
      }, {
        id: "local_runtime_stale_lease_recovery",
        capabilities: ["stale_lease_recovery"],
      }, {
        id: "local_runtime_provider_lifecycle",
        capabilities: ["provider_lifecycle", "stopped_provider_display", "non_destructive_stop"],
      }, {
        id: "local_runtime_proof_gate",
        capabilities: ["proof_gate_clean"],
      }],
    }),
    liveConfidenceArtifactCheck(artifacts.liveRestartRepairConfidence, {
      now,
      maxArtifactAgeHours,
      requireLive,
      expectedSliceKind: "restart_repair",
      id: "artifact.live-restart-repair-confidence",
      label: "restart repair live confidence evidence is present when available",
      missingPath: "test-results/subagent-live-confidence/restart-repair-latest.json",
      missingRequiredIssue: "Restart repair live confidence evidence is required but missing.",
      missingSkippedIssue: "Restart repair live confidence evidence was skipped for this deterministic gate run.",
      expectedMaturityAssertions: [{
        id: "restart_repair_runtime_event_replay",
        capabilities: ["runtime_event_replay"],
      }, {
        id: "restart_repair_child_tree_repair",
        capabilities: ["restart_rehydration", "child_thread_repair", "wait_barrier_repair"],
      }, {
        id: "restart_repair_mailbox_rehydration",
        capabilities: ["parent_mailbox_replay", "mailbox_state_rehydration"],
      }, {
        id: "restart_repair_artifact_pointer_rehydration",
        capabilities: ["artifact_pointer_rehydration"],
      }, {
        id: "restart_repair_lifecycle_edge_coverage",
        capabilities: ["restart_edge", "stop_edge", "detach_edge", "cancel_edge", "retry_edge", "timeout_edge", "partial_result_edge"],
      }, {
        id: "restart_repair_synthesis_safety",
        capabilities: ["synthesis_safety"],
      }],
    }),
    liveConfidenceArtifactCheck(artifacts.liveLifecycleEdgeConfidence, {
      now,
      maxArtifactAgeHours,
      requireLive,
      expectedSliceKind: "lifecycle_edges",
      id: "artifact.live-lifecycle-edge-confidence",
      label: "lifecycle edge confidence evidence is present when available",
      missingPath: "test-results/subagent-live-confidence/lifecycle-edges-latest.json",
      missingRequiredIssue: "Lifecycle edge confidence evidence is required but missing.",
      missingSkippedIssue: "Lifecycle edge confidence evidence was skipped for this deterministic gate run.",
      expectedMaturityAssertions: [{
        id: "lifecycle_edge_restart",
        capabilities: ["restart_edge"],
      }, {
        id: "lifecycle_edge_stop",
        capabilities: ["stop_edge"],
      }, {
        id: "lifecycle_edge_detach",
        capabilities: ["detach_edge"],
      }, {
        id: "lifecycle_edge_cancel",
        capabilities: ["cancel_edge"],
      }, {
        id: "lifecycle_edge_retry",
        capabilities: ["retry_edge"],
      }, {
        id: "lifecycle_edge_timeout",
        capabilities: ["timeout_edge"],
      }, {
        id: "lifecycle_edge_partial_result",
        capabilities: ["partial_result_edge"],
      }, {
        id: "lifecycle_edge_synthesis_safety",
        capabilities: ["synthesis_safety"],
      }],
    }),
    liveConfidenceArtifactCheck(artifacts.liveDesktopDogfoodConfidence, {
      now,
      maxArtifactAgeHours,
      requireLive,
      expectedSliceKind: "desktop_dogfood",
      id: "artifact.live-desktop-dogfood-confidence",
      label: "Desktop dogfood confidence evidence is present when available",
      missingPath: "test-results/subagent-live-confidence/desktop-dogfood-latest.json",
      missingRequiredIssue: "Desktop dogfood confidence evidence is required but missing.",
      missingSkippedIssue: "Desktop dogfood confidence evidence was skipped for this deterministic gate run.",
      expectedMaturityAssertions: [{
        id: "desktop_dogfood_scenario_coverage",
        capabilities: [
          "electron_desktop_dogfood",
          "default_collapsed_state",
          "approval_parent_blocking",
          "workflow_execution_parent_blocking",
          "workflow_high_load_dogfood",
        ],
      }, {
        id: "desktop_dogfood_visual_layout",
        capabilities: ["production_ui_visibility", "layout_safety", "visual_layout_safety"],
      }, {
        id: "desktop_dogfood_lifecycle_edges",
        capabilities: ["lifecycle_edge_desktop_behavior", "timeout_edge", "partial_result_edge", "retry_edge", "detach_edge"],
      }, {
        id: "desktop_dogfood_runtime_and_operator_controls",
        capabilities: [
          "local_runtime_lease_ownership",
          "lease_stop_blocker",
          "untracked_runtime_safety",
          "operator_child_controls",
          "operator_control_behavior",
        ],
      }],
    }),
    harnessManifestCheck(artifacts.electronDogfoodHarnessManifest, {
      now,
      maxArtifactAgeHours,
      requireLive,
      id: "artifact.harness-electron-dogfood",
      label: "Electron dogfood harness manifest records headful random-port launch state",
      missingPath: "test-results/harness/electron-dogfood-latest.manifest.json",
    }),
    desktopDogfoodArtifactCheck(artifacts.desktopDogfood, { now, maxArtifactAgeHours, requireLive }),
    subagentLiveHistoryReportCheck(artifacts.liveHistoryReport, {
      now,
      maxArtifactAgeHours,
      requireMaturityHistory,
    }),
    desktopDogfoodHistoryReportCheck(artifacts.desktopDogfoodHistory, {
      now,
      maxArtifactAgeHours,
      requireMaturityHistory,
    }),
    workflowJitterReleaseProfileCheck(artifacts.workflowJitterReleaseGate, {
      now,
      maxArtifactAgeHours,
      requireMaturityHistory,
    })
  ];
}


export function subagentReleaseGatePassed(report, options = {}) {
  if (!report || report.releaseDecision?.ready !== true) return false;
  if (options.requireLive === true && skippedLiveEvidenceLabels(report.releaseDecision).length > 0) return false;
  if (options.requireMaturityHistory === true && report.releaseDecision?.liveHistoryReportSkipped !== false) return false;
  if (options.requireMaturityHistory === true && report.releaseDecision?.desktopDogfoodHistorySkipped !== false) return false;
  if (options.requireMaturityHistory === true && report.releaseDecision?.workflowJitterReleaseProfileSkipped !== false) return false;
  return report.status === "passed" || report.status === "passed_with_advisories";
}

export function renderSubagentReleaseGateMarkdown(report) {
  const skippedLiveEvidence = skippedLiveEvidenceLabels(report.releaseDecision);
  const lines = [
    "# Sub-Agent Release Gate",
    "",
    `Generated: ${report.completedAt}`,
    `Status: ${report.status}`,
    `Feature flag: ${report.policy?.featureFlag ?? "ambient.subagents"}`,
    "",
    "## Decision",
    "",
    `- Ready: ${report.releaseDecision.ready ? "yes" : "no"}`,
    `- Live required: ${report.releaseDecision.liveRequired ? "yes" : "no"}`,
    `- Maturity history required: ${report.policy?.requireMaturityHistory ? "yes" : "no"}`,
    `- Live evidence skipped: ${skippedLiveEvidence.length ? skippedLiveEvidence.join(", ") : "no"}`,
    `- Live release-gate maturity history: ${report.releaseDecision.liveHistoryReportSkipped === false ? "ready" : "skipped"}`,
    `- Desktop dogfood maturity history: ${report.releaseDecision.desktopDogfoodHistorySkipped === false ? "ready" : "skipped"}`,
    `- Workflow jitter release profile: ${report.releaseDecision.workflowJitterReleaseProfileSkipped === false ? "ready" : "skipped"}`,
    ...liveEvidenceDecisionLines(report.releaseDecision),
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

function skippedLiveEvidenceLabels(decision) {
  if (!decision || typeof decision !== "object") return SUBAGENT_LIVE_EVIDENCE_DECISIONS.map(([, label]) => label);
  return SUBAGENT_LIVE_EVIDENCE_DECISIONS
    .filter(([field]) => decision[field] !== false)
    .map(([, label]) => label);
}

function liveEvidenceDecisionLines(decision) {
  return SUBAGENT_LIVE_EVIDENCE_DECISIONS.map(([field, label]) =>
    `- ${label}: ${decision?.[field] === false ? "present" : "skipped"}`
  );
}

export function buildSubagentReleaseGateLiveHistoryEntry(report, options = {}) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const decision = report?.releaseDecision && typeof report.releaseDecision === "object"
    ? report.releaseDecision
    : {};
  const startedAt = report?.startedAt;
  const completedAt = report?.completedAt;
  return {
    schemaVersion: SUBAGENT_RELEASE_GATE_LIVE_HISTORY_SCHEMA_VERSION,
    runId: options.runId ?? liveHistoryRunId(completedAt),
    reportPath: options.reportPath,
    status: report?.status ?? "missing",
    ready: decision.ready === true,
    liveRequired: decision.liveRequired === true,
    startedAt,
    completedAt,
    durationMs: durationMs(startedAt, completedAt),
    checkCounts: checks.reduce((acc, check) => {
      const status = check?.status ?? "missing";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {}),
    liveEvidence: Object.fromEntries(SUBAGENT_LIVE_EVIDENCE_DECISIONS.map(([field, label]) => [
      label,
      decision[field] === false ? "present" : "skipped",
    ])),
    skippedLiveEvidence: skippedLiveEvidenceLabels(decision),
    blockingIssueCount: Array.isArray(decision.blockingIssues) ? decision.blockingIssues.length : 0,
    advisoryIssueCount: Array.isArray(decision.advisoryIssues) ? decision.advisoryIssues.length : 0,
    nextSlice: decision.nextSlice,
  };
}

function liveHistoryRunId(timestamp) {
  return nonEmptyString(timestamp)
    ? timestamp.replace(/[^a-zA-Z0-9._-]+/g, "-")
    : `unknown-${Date.now()}`;
}

function durationMs(startedAt, completedAt) {
  const started = Date.parse(startedAt ?? "");
  const completed = Date.parse(completedAt ?? "");
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return undefined;
  return Math.max(0, completed - started);
}

function scriptChecks(scripts) {
  return REQUIRED_SCRIPTS.map(([name, label]) => {
    const script = typeof scripts[name] === "string" ? scripts[name] : "";
    return check({
      id: `script.${name}`,
      area: "commands",
      status: script.trim() ? "passed" : "failed",
      label: `${label} command is registered`,
      evidence: script ? [`${name}: ${script}`] : [`missing package.json script ${name}`],
      issues: script.trim() ? [] : [`Missing package script ${name}.`],
    });
  });
}

function deterministicSuiteCoverageCheck(scripts) {
  const deterministicScript = typeof scripts["test:subagents:deterministic"] === "string"
    ? scripts["test:subagents:deterministic"]
    : "";
  const releaseGateScript = typeof scripts["test:subagents:release-gate"] === "string"
    ? scripts["test:subagents:release-gate"]
    : "";
  const liveReleaseGateScript = typeof scripts["test:subagents:release-gate:live"] === "string"
    ? scripts["test:subagents:release-gate:live"]
    : "";
  const graduationReleaseGateScript = typeof scripts["test:subagents:release-gate:graduation"] === "string"
    ? scripts["test:subagents:release-gate:graduation"]
    : "";
  const workflowJitterReleaseProfileGateScript = typeof scripts["test:workflow-jitter-release-gate:release-profile"] === "string"
    ? scripts["test:workflow-jitter-release-gate:release-profile"]
    : "";
  const missingTests = REQUIRED_DETERMINISTIC_TEST_FILES.filter((file) => !deterministicScript.includes(file));
  const missingDelegates = [
    ["test:subagents:release-gate", releaseGateScript],
    ["test:subagents:release-gate:live", liveReleaseGateScript],
    ["test:subagents:release-gate:graduation", graduationReleaseGateScript],
  ].filter(([, script]) => !script.includes(DETERMINISTIC_SUITE_COMMAND)).map(([name]) => name);
  const liveReleaseGateRunsDesktopDogfood = liveReleaseGateScript.includes("pnpm run test:subagents:desktop-dogfood")
    || liveReleaseGateScript.includes("pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked");
  const missingLiveDesktopDogfood = liveReleaseGateRunsDesktopDogfood
    ? []
    : ["test:subagents:release-gate:live must run Desktop dogfood directly or through pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked."];
  const missingLiveReleaseGateCommands = REQUIRED_LIVE_RELEASE_GATE_COMMANDS.filter((command) => !liveReleaseGateScript.includes(command));
  const missingGraduationReleaseGateCommands = [
    ...REQUIRED_LIVE_RELEASE_GATE_COMMANDS.filter((command) => !graduationReleaseGateScript.includes(command))
      .map((command) => `test:subagents:release-gate:graduation must run ${command}.`),
    ...(graduationReleaseGateScript.includes("pnpm run test:subagents:desktop-dogfood-repeat -- --require-ready")
      ? []
      : ["test:subagents:release-gate:graduation must run pnpm run test:subagents:desktop-dogfood-repeat -- --require-ready."]),
    ...(graduationReleaseGateScript.includes("pnpm run test:workflow-jitter-release-gate:release-profile")
      ? []
      : ["test:subagents:release-gate:graduation must run pnpm run test:workflow-jitter-release-gate:release-profile."]),
    ...(graduationReleaseGateScript.includes("pnpm run subagents:live-history-report -- --require-ready")
      ? []
      : ["test:subagents:release-gate:graduation must run pnpm run subagents:live-history-report -- --require-ready."]),
    ...(graduationReleaseGateScript.includes("node scripts/subagent-release-gate.mjs") &&
        graduationReleaseGateScript.includes("--require-live") &&
        graduationReleaseGateScript.includes("--require-maturity-history")
      ? []
      : ["test:subagents:release-gate:graduation must run the release gate with --require-live and --require-maturity-history."]),
  ];
  const missingLocalRuntimeControlProof = releaseGateScript.includes(LOCAL_RUNTIME_CONTROL_PROOF_COMMAND)
    ? []
    : [`test:subagents:release-gate must run ${LOCAL_RUNTIME_CONTROL_PROOF_COMMAND}.`];
  const missingWorkflowJitterReleaseProfileRunner = workflowJitterReleaseProfileGateScript.includes("scripts/workflow-jitter-release-profile-gate.mjs")
    ? []
    : [
        "test:workflow-jitter-release-gate:release-profile must use scripts/workflow-jitter-release-profile-gate.mjs so the release gate writes an artifact even when the matrix blocks.",
      ];
  const issues = [
    ...missingTests.map((file) => `Deterministic sub-agent suite is missing ${file}.`),
    ...missingDelegates.map((name) => `${name} must run ${DETERMINISTIC_SUITE_COMMAND}.`),
    ...missingLocalRuntimeControlProof,
    ...missingWorkflowJitterReleaseProfileRunner,
    ...missingLiveReleaseGateCommands.map((command) => `test:subagents:release-gate:live must run ${command}.`),
    ...missingLiveDesktopDogfood,
    ...missingGraduationReleaseGateCommands,
  ];
  return check({
    id: "script.test:subagents:deterministic:coverage",
    area: "commands",
    status: issues.length ? "failed" : "passed",
    label: "deterministic sub-agent release suite covers core contract tests",
    evidence: [
      `test files: ${REQUIRED_DETERMINISTIC_TEST_FILES.length - missingTests.length}/${REQUIRED_DETERMINISTIC_TEST_FILES.length}`,
      `release gate delegates: ${3 - missingDelegates.length}/3`,
      `local runtime control proof: ${missingLocalRuntimeControlProof.length ? "missing" : "present"}`,
      `workflow jitter release-profile runner: ${missingWorkflowJitterReleaseProfileRunner.length ? "missing" : "artifact-preserving"}`,
      `live confidence delegates: ${REQUIRED_LIVE_RELEASE_GATE_COMMANDS.length - missingLiveReleaseGateCommands.length}/${REQUIRED_LIVE_RELEASE_GATE_COMMANDS.length}`,
      `graduation gate: ${missingGraduationReleaseGateCommands.length ? "incomplete" : "requires live and repeated maturity history"}`,
      ...(issues.length ? [] : ["deterministic suite is wired into release gates"]),
    ],
    issues,
  });
}

function liveHarnessRoutingCheck(scripts) {
  const liveNodeScripts = [
    "test:subagents:live",
    "test:subagents:live:smoke",
    "test:subagents:live:long-context-authority",
    "test:subagents:live:approval-authority",
    "test:subagents:live:browser-approval",
    "test:subagents:scenario-dogfood",
  ];
  const issues = [];
  const evidence = [];
  for (const name of liveNodeScripts) {
    const script = typeof scripts[name] === "string" ? scripts[name] : "";
    const routed = script.includes("scripts/run-live-node-test.mjs");
    const directVitest = /pnpm exec vitest/.test(script);
    evidence.push(`${name}: ${routed ? "harnessed" : "unharnessed"}`);
    if (!routed || directVitest) {
      issues.push(`${name} must route live Vitest through scripts/run-live-node-test.mjs.`);
    }
  }
  const desktopScript = typeof scripts["test:subagents:desktop-dogfood"] === "string"
    ? scripts["test:subagents:desktop-dogfood"]
    : "";
  evidence.push(`test:subagents:desktop-dogfood: ${desktopScript.includes("scripts/run-electron-dogfood.mjs") ? "harnessed" : "unharnessed"}`);
  if (!desktopScript.includes("scripts/run-electron-dogfood.mjs")) {
    issues.push("test:subagents:desktop-dogfood must route through scripts/run-electron-dogfood.mjs.");
  }
  return check({
    id: "script.live-harness-routing",
    area: "commands",
    status: issues.length ? "failed" : "passed",
    label: "live sub-agent scripts route through harness supervisors",
    evidence,
    issues,
  });
}

function replayDiagnosticsArtifactCheck(artifact, options) {
  const issues = [];
  if (!artifact) {
    return check({
      id: "artifact.replay-diagnostics",
      area: "artifacts",
      status: "failed",
      label: "deterministic replay diagnostics artifact is green",
      evidence: ["missing test-results/subagent-replay-diagnostics/latest.json"],
      issues: ["Run pnpm run test:subagents:replay-diagnostics before the release gate."],
    });
  }
  if (artifact.schemaVersion !== "ambient-subagent-replay-diagnostics-v1") {
    issues.push(`Replay diagnostics schema is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") issues.push(`Replay diagnostics status is ${artifact.status ?? "missing"}.`);
  if (artifact.plan?.liveTokens !== false) issues.push("Replay diagnostics must declare liveTokens: false.");
  if ((artifact.vitest?.failedTests ?? 0) !== 0) issues.push(`${artifact.vitest?.failedTests} replay diagnostic tests failed.`);
  if ((artifact.vitest?.missingReplayTests ?? []).length) {
    issues.push(`Replay diagnostics missed required tests: ${artifact.vitest.missingReplayTests.join(", ")}.`);
  }
  const replayEvidence = validateReplayEvidenceArtifact(artifact.replayEvidence);
  issues.push(...replayEvidence.issues);
  const lifecycleEdgeEvidence = isValidLifecycleEdgeArtifact(artifact.lifecycleEdgeEvidence);
  if (!artifact.lifecycleEdgeEvidence) {
    issues.push("Replay diagnostics must include lifecycleEdgeEvidence.");
  } else {
    issues.push(...lifecycleEdgeEvidence.issues);
  }
  const freshness = artifactFreshness(artifact.completedAt, options);
  issues.push(...freshness.issues);
  return check({
    id: "artifact.replay-diagnostics",
    area: "artifacts",
    status: issues.length ? "failed" : "passed",
    label: "deterministic replay diagnostics artifact is green",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/subagent-replay-diagnostics/latest.json"}`,
      `status: ${artifact.status ?? "missing"}`,
      `tests: ${artifact.vitest?.passedTests ?? 0}/${artifact.vitest?.totalTests ?? 0}`,
      `runtime events: ${artifact.replayEvidence?.counts?.runtimeEvents ?? 0}`,
      `parent mailbox events: ${artifact.replayEvidence?.counts?.parentMailboxEvents ?? 0}`,
      `repair issues: ${artifact.replayEvidence?.counts?.restartRepairIssues ?? 0}`,
      `rehydrated artifact pointers: ${artifact.replayEvidence?.rehydration?.resultArtifactPointers?.length ?? 0}`,
      `lifecycle edges: ${(artifact.lifecycleEdgeEvidence?.summary?.coveredEdgeKinds ?? []).join(", ") || "missing"}`,
      ...freshness.evidence,
    ],
    issues,
  });
}

function validateReplayEvidenceArtifact(evidence) {
  const issues = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { issues: ["Replay diagnostics must include replayEvidence."] };
  }
  if (evidence.schemaVersion !== "ambient-subagent-replay-evidence-v1") {
    issues.push(`Replay evidence schema is ${evidence.schemaVersion ?? "missing"}.`);
  }
  if (evidence.liveTokens !== false) issues.push("Replay evidence must declare liveTokens: false.");
  if (!Array.isArray(evidence.runtimeEventTimeline) || evidence.runtimeEventTimeline.length === 0) {
    issues.push("Replay evidence must include a runtimeEventTimeline.");
  }
  if (!Array.isArray(evidence.persistedRunEventTimeline) || evidence.persistedRunEventTimeline.length === 0) {
    issues.push("Replay evidence must include a persistedRunEventTimeline.");
  }
  if (!Array.isArray(evidence.parentMailboxTimeline) || evidence.parentMailboxTimeline.length === 0) {
    issues.push("Replay evidence must include a parentMailboxTimeline.");
  }
  if ((typeof evidence.counts?.parentMailboxEvents === "number" ? evidence.counts.parentMailboxEvents : 0) <= 0) {
    issues.push("Replay evidence must include parent mailbox event counts.");
  }
  if (!Array.isArray(evidence.childThreads) || evidence.childThreads.length === 0) {
    issues.push("Replay evidence must include childThreads.");
  }
  const expectedIssueKinds = evidence.restartRepair?.expectedIssueKinds;
  const observedIssueKinds = evidence.restartRepair?.observedIssueKinds;
  if (!Array.isArray(expectedIssueKinds) || expectedIssueKinds.length === 0) {
    issues.push("Replay evidence must include expected restart repair issue kinds.");
  }
  if (!Array.isArray(observedIssueKinds) || observedIssueKinds.length === 0) {
    issues.push("Replay evidence must include observed restart repair issue kinds.");
  }
  if (Array.isArray(expectedIssueKinds) && Array.isArray(observedIssueKinds)) {
    const missingObserved = expectedIssueKinds.filter((kind) => !observedIssueKinds.includes(kind));
    if (missingObserved.length) issues.push(`Replay evidence did not observe expected issue kinds: ${missingObserved.join(", ")}.`);
  }
  validateReplayRehydrationProof(evidence.rehydration, issues);
  return { issues };
}

function validateReplayRehydrationProof(rehydration, issues) {
  if (!rehydration || typeof rehydration !== "object" || Array.isArray(rehydration)) {
    issues.push("Replay evidence must include restart rehydration proof.");
    return;
  }
  if (rehydration.schemaVersion !== "ambient-subagent-restart-rehydration-proof-v1") {
    issues.push(`Replay rehydration proof schema is ${rehydration.schemaVersion ?? "missing"}.`);
  }
  if (!nonEmptyStringArray(rehydration.childRunIds)) issues.push("Replay rehydration proof must include childRunIds.");
  if (!nonEmptyStringArray(rehydration.childThreadIds)) issues.push("Replay rehydration proof must include childThreadIds.");
  if (!nonEmptyStringArray(rehydration.parentMailboxEventIds)) issues.push("Replay rehydration proof must include parentMailboxEventIds.");
  const mailboxStates = Array.isArray(rehydration.parentMailboxStates) ? rehydration.parentMailboxStates : [];
  if (mailboxStates.length === 0) issues.push("Replay rehydration proof must include parentMailboxStates.");
  for (const state of mailboxStates) {
    if (!nonEmptyString(state?.id)) issues.push("Replay rehydration mailbox state is missing id.");
    if (!nonEmptyString(state?.parentThreadId)) issues.push(`Replay rehydration mailbox ${state?.id ?? "unknown"} is missing parentThreadId.`);
    if (!nonEmptyString(state?.parentRunId)) issues.push(`Replay rehydration mailbox ${state?.id ?? "unknown"} is missing parentRunId.`);
    if (!["queued", "delivered", "consumed", "failed", "cancelled"].includes(state?.deliveryState)) {
      issues.push(`Replay rehydration mailbox ${state?.id ?? "unknown"} has invalid deliveryState ${state?.deliveryState ?? "missing"}.`);
    }
    if (!nonEmptyStringArray(state?.childRunIds)) issues.push(`Replay rehydration mailbox ${state?.id ?? "unknown"} is missing childRunIds.`);
  }
  if (!nonEmptyStringArray(rehydration.transcriptThreadIds)) issues.push("Replay rehydration proof must include transcriptThreadIds.");
  const artifactPointers = Array.isArray(rehydration.resultArtifactPointers) ? rehydration.resultArtifactPointers : [];
  if (artifactPointers.length === 0) issues.push("Replay rehydration proof must include resultArtifactPointers.");
  for (const pointer of artifactPointers) {
    if (!nonEmptyString(pointer?.runId)) issues.push("Replay rehydration artifact pointer is missing runId.");
    if (!nonEmptyString(pointer?.childThreadId)) issues.push(`Replay rehydration artifact pointer ${pointer?.runId ?? "unknown"} is missing childThreadId.`);
    if (![pointer?.artifactPath, pointer?.fullOutputPath, pointer?.structuredOutputPath].some(nonEmptyString)) {
      issues.push(`Replay rehydration artifact pointer ${pointer?.runId ?? "unknown"} is missing artifact paths.`);
    }
  }
  if (!nonEmptyStringArray(rehydration.missingResultArtifactRunIds)) {
    issues.push("Replay rehydration proof must include missingResultArtifactRunIds.");
  }
  const integrity = rehydration.artifactPointerIntegrity ?? {};
  for (const field of [
    "allResultPointersHaveRunAndThread",
    "missingResultArtifactsDiagnosed",
    "parentMailboxChildRefsResolved",
    "transcriptChildRefsResolved",
  ]) {
    if (integrity[field] !== true) issues.push(`Replay rehydration integrity ${field} is not true.`);
  }
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

function callableWorkflowDogfoodArtifactCheck(artifact, options) {
  const validation = isValidCallableWorkflowDogfoodArtifact(artifact);
  const freshness = artifactFreshness(artifact?.createdAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    return check({
      id: "artifact.callable-workflow-dogfood",
      area: "artifacts",
      status: "failed",
      label: "callable workflow mutating child dogfood proof artifact is green",
      evidence: ["missing test-results/callable-workflow-dogfood/latest.json"],
      issues: ["Run pnpm run test:callable-workflow-dogfood:proof before the release gate."],
    });
  }
  return check({
    id: "artifact.callable-workflow-dogfood",
    area: "artifacts",
    status: issues.length ? "failed" : "passed",
    label: "callable workflow mutating child dogfood proof artifact is green",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/callable-workflow-dogfood/latest.json"}`,
      `task: ${artifact.task?.id ?? "missing"}`,
      `workflowRun: ${artifact.workflow?.runId ?? "missing"} ${artifact.workflow?.runStatus ?? "missing"}`,
      `child: ${artifact.childCaller?.threadId ?? "missing"} / ${artifact.childCaller?.subagentRunId ?? "missing"}`,
      `mutationOutput: ${artifact.mutationOutput?.kind ?? "missing"} ${artifact.mutationOutput?.stagedRelativePath ?? "missing"} parentUnchanged=${artifact.mutationOutput?.parentWorkspaceUnchanged === true}`,
      `parentBlocking: blocked=${artifact.parentBlocking?.blockedBeforeCompletion === true} unblocked=${artifact.parentBlocking?.unblockedAfterCompletion === true}`,
      `restartRepairObserved: ${artifact.restart?.terminalRepairObserved === true}`,
      `maturityAssertions: ${summarizeWorkflowMaturityAssertions(artifact.maturityAssertions, REQUIRED_CALLABLE_WORKFLOW_DOGFOOD_MATURITY_ASSERTIONS)}`,
      ...freshness.evidence,
    ],
    issues,
  });
}

function isValidCallableWorkflowDogfoodArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-callable-workflow-dogfood-evidence-v1") {
    issues.push(`Callable workflow dogfood schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.task?.status !== "succeeded") {
    issues.push(`Callable workflow dogfood task status is ${artifact.task?.status ?? "missing"}.`);
  }
  if (artifact.task?.blocking !== true) issues.push("Callable workflow dogfood task must be blocking.");
  if (!nonEmptyString(artifact.task?.workflowArtifactId)) issues.push("Callable workflow dogfood task is missing workflowArtifactId.");
  if (!nonEmptyString(artifact.task?.workflowRunId)) issues.push("Callable workflow dogfood task is missing workflowRunId.");
  if (artifact.launchCard?.present !== true) issues.push("Callable workflow dogfood launch card proof is missing.");
  if (!["low", "medium", "high"].includes(artifact.launchCard?.riskLevel)) {
    issues.push("Callable workflow dogfood launch card riskLevel is missing or invalid.");
  }
  for (const field of ["estimatedAgents", "maxFanout", "maxDepth", "estimatedTokenBudget", "estimatedLocalMemoryBytes"]) {
    if (!positiveInteger(artifact.launchCard?.[field])) issues.push(`Callable workflow dogfood launch card is missing ${field}.`);
  }
  if (artifact.launchCard?.defaultCollapsed !== true) issues.push("Callable workflow dogfood launch card must be default collapsed.");
  if (artifact.launchCard?.blocking !== true) issues.push("Callable workflow dogfood launch card must be blocking.");
  if (artifact.launchCard?.pauseResumeCancel !== true) {
    issues.push("Callable workflow dogfood task must expose pause/resume/cancel controls.");
  }
  if (!nonEmptyString(artifact.launchCard?.checkpointResume)) {
    issues.push("Callable workflow dogfood launch card is missing checkpoint/resume text.");
  }
  if (!nonEmptyString(artifact.launchCard?.approvalFailureHandling)) {
    issues.push("Callable workflow dogfood launch card is missing approval failure handling text.");
  }
  if (!nonEmptyStringArray(artifact.launchCard?.requirementIds)) {
    issues.push("Callable workflow dogfood launch card is missing requirementIds.");
  }
  if (!nonEmptyStringArray(artifact.launchCard?.metricTemplateIds)) {
    issues.push("Callable workflow dogfood launch card is missing metricTemplateIds.");
  }
  if (artifact.childCaller?.kind !== "subagent_child_thread") issues.push("Callable workflow dogfood must be child-originated.");
  for (const field of ["threadId", "runId", "subagentRunId", "canonicalTaskPath", "parentThreadId", "parentRunId"]) {
    if (!nonEmptyString(artifact.childCaller?.[field])) issues.push(`Callable workflow dogfood child caller is missing ${field}.`);
  }
  if (artifact.mutation?.mutationPolicy === "read_only") issues.push("Callable workflow dogfood must use a mutating artifact policy.");
  if (artifact.mutation?.approvalRequired !== true) issues.push("Callable workflow dogfood must prove approvalRequired.");
  if (artifact.mutation?.approvalSource !== "child_bridge_policy") issues.push("Callable workflow dogfood approvalSource must be child_bridge_policy.");
  if (artifact.mutation?.approvalScope !== "this_child_thread") issues.push("Callable workflow dogfood approvalScope must be this_child_thread.");
  if (artifact.mutation?.worktreeRequired !== true) issues.push("Callable workflow dogfood must require a worktree.");
  if (artifact.mutation?.worktreeIsolated !== true) issues.push("Callable workflow dogfood must use an isolated worktree.");
  if (artifact.mutation?.worktreeStatus !== "active") issues.push("Callable workflow dogfood worktreeStatus must be active.");
  if (artifact.mutation?.worktreePathPresent !== true) issues.push("Callable workflow dogfood must prove a worktree path was present.");
  if (artifact.mutation?.nestedFanoutRequired !== true) issues.push("Callable workflow dogfood must require nested fanout policy.");
  if (artifact.mutation?.nestedFanoutSource !== "child_bridge_policy") issues.push("Callable workflow dogfood nestedFanoutSource must be child_bridge_policy.");
  const mutationOutput = artifact.mutationOutput && typeof artifact.mutationOutput === "object"
    ? artifact.mutationOutput
    : {};
  if (mutationOutput.kind !== "staged_file") issues.push("Callable workflow dogfood mutation output must be staged_file.");
  if (!safeRelativePath(mutationOutput.stagedRelativePath)) {
    issues.push("Callable workflow dogfood mutation output is missing a safe stagedRelativePath.");
  }
  if (!sha256Hex(mutationOutput.stagedFileSha256)) {
    issues.push("Callable workflow dogfood mutation output is missing stagedFileSha256.");
  }
  if (!nonEmptyString(mutationOutput.fullArtifactPath)) {
    issues.push("Callable workflow dogfood mutation output is missing fullArtifactPath.");
  }
  if (!positiveInteger(mutationOutput.fullArtifactBytes)) {
    issues.push("Callable workflow dogfood mutation output is missing fullArtifactBytes.");
  }
  if (!sha256Hex(mutationOutput.fullArtifactSha256)) {
    issues.push("Callable workflow dogfood mutation output is missing fullArtifactSha256.");
  }
  if (!nonEmptyString(mutationOutput.boundedPreview) || mutationOutput.boundedPreview.length > 512) {
    issues.push("Callable workflow dogfood mutation output must include a boundedPreview.");
  }
  if (!positiveInteger(mutationOutput.previewBytes)) {
    issues.push("Callable workflow dogfood mutation output is missing previewBytes.");
  }
  if (mutationOutput.previewTruncated !== true) {
    issues.push("Callable workflow dogfood mutation output must prove previewTruncated.");
  }
  if (mutationOutput.parentWorkspaceUnchanged !== true) {
    issues.push("Callable workflow dogfood mutation output must prove parentWorkspaceUnchanged.");
  }
  if (!nonEmptyString(artifact.workflow?.workflowThreadId)) issues.push("Callable workflow dogfood is missing workflowThreadId.");
  if (artifact.workflow?.taskArtifactLinkMatches !== true) issues.push("Callable workflow dogfood artifact link must match the task.");
  if (artifact.workflow?.taskRunLinkMatches !== true) issues.push("Callable workflow dogfood run link must match the task.");
  if (artifact.workflow?.runStatus !== "succeeded") issues.push(`Callable workflow dogfood runStatus is ${artifact.workflow?.runStatus ?? "missing"}.`);
  if (artifact.taskEvents?.started !== true) issues.push("Callable workflow dogfood is missing task-started event proof.");
  if (artifact.taskEvents?.finished !== true) issues.push("Callable workflow dogfood is missing task-finished event proof.");
  if (artifact.parentBlocking?.blockedBeforeCompletion !== true) {
    issues.push("Callable workflow dogfood must prove parent synthesis was blocked before completion.");
  }
  if (artifact.parentBlocking?.unblockedAfterCompletion !== true) {
    issues.push("Callable workflow dogfood must prove parent synthesis unblocked after completion.");
  }
  if (!Array.isArray(artifact.parentBlocking?.waitingTaskIds) || artifact.parentBlocking.waitingTaskIds.length === 0) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing waitingTaskIds.");
  }
  const allowedChoices = Array.isArray(artifact.parentBlocking?.allowedUserChoiceIds)
    ? artifact.parentBlocking.allowedUserChoiceIds
    : [];
  if (!allowedChoices.includes("wait_again") || !allowedChoices.includes("cancel_parent")) {
    issues.push("Callable workflow dogfood parent-blocking proof is missing wait/cancel choices.");
  }
  if (artifact.deniedScope?.denied !== true) issues.push("Callable workflow dogfood must prove denied child workflow scope.");
  const deniedCategories = Array.isArray(artifact.deniedScope?.deniedCategoryIds) ? artifact.deniedScope.deniedCategoryIds : [];
  const deniedTools = Array.isArray(artifact.deniedScope?.deniedToolIds) ? artifact.deniedScope.deniedToolIds : [];
  if (!deniedCategories.includes("workflow.call")) issues.push("Callable workflow dogfood denied scope is missing workflow.call.");
  if (!deniedTools.some((id) => typeof id === "string" && id.startsWith("callable_workflow:ambient_workflow_"))) {
    issues.push("Callable workflow dogfood denied scope is missing exact callable workflow tool denial.");
  }
  const bridgeReasons = Array.isArray(artifact.deniedScope?.bridgeReasons) ? artifact.deniedScope.bridgeReasons : [];
  for (const reasonFragment of [
    "disabled by child role policy",
    "requires an active isolated child worktree",
    "nested fanout limit is exhausted",
  ]) {
    if (!bridgeReasons.some((reason) => typeof reason === "string" && reason.includes(reasonFragment))) {
      issues.push(`Callable workflow dogfood denied scope is missing bridge reason: ${reasonFragment}.`);
    }
  }
  if (artifact.restart?.terminalRepairObserved !== true) {
    issues.push("Callable workflow dogfood must observe terminal workflow restart repair.");
  }
  if (!Array.isArray(artifact.restart?.repairedTaskIds) || artifact.restart.repairedTaskIds.length === 0) {
    issues.push("Callable workflow dogfood restart proof is missing repaired task IDs.");
  }
  if (!Array.isArray(artifact.restart?.diagnosticTaskIds) || artifact.restart.diagnosticTaskIds.length === 0) {
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

function callableWorkflowRehydrationArtifactCheck(artifact, options) {
  const validation = isValidCallableWorkflowRehydrationArtifact(artifact);
  const freshness = artifactFreshness(artifact?.createdAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    return check({
      id: "artifact.callable-workflow-rehydration",
      area: "artifacts",
      status: "failed",
      label: "callable workflow restart rehydration proof artifact is green",
      evidence: ["missing test-results/callable-workflow-rehydration/latest.json"],
      issues: ["Run pnpm run test:callable-workflow-rehydration:proof before the release gate."],
    });
  }
  return check({
    id: "artifact.callable-workflow-rehydration",
    area: "artifacts",
    status: issues.length ? "failed" : "passed",
    label: "callable workflow restart rehydration proof artifact is green",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/callable-workflow-rehydration/latest.json"}`,
      `task: ${artifact.task?.id ?? "missing"}`,
      `workflowRun: ${artifact.workflowRun?.id ?? "missing"} ${artifact.workflowRun?.status ?? "missing"}`,
      `workflowThread: ${artifact.task?.workflowThreadId ?? "missing"}`,
      `artifactSourcePath: ${artifact.artifact?.sourcePath ?? "missing"}`,
      `artifactStatePath: ${artifact.artifact?.statePath ?? "missing"}`,
      `artifactMutationPolicy: ${artifact.artifact?.mutationPolicy ?? "missing"}`,
      `progressEvents: ${artifact.progressSnapshot?.eventCount ?? 0}`,
      `modelCalls: ${artifact.usageSnapshot?.modelCallCount ?? 0}`,
      `tokens: ${artifact.usageSnapshot?.tokenCount ?? 0}`,
      `maturityAssertions: ${summarizeWorkflowMaturityAssertions(artifact.maturityAssertions, REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS)}`,
      ...freshness.evidence,
    ],
    issues,
  });
}

function isValidCallableWorkflowRehydrationArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-callable-workflow-rehydration-evidence-v1") {
    issues.push(`Callable workflow rehydration schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.task?.status !== "running") issues.push(`Callable workflow rehydration task status is ${artifact.task?.status ?? "missing"}.`);
  if (artifact.task?.blocking !== true) issues.push("Callable workflow rehydration task must be blocking.");
  for (const field of ["workflowThreadId", "workflowArtifactId", "workflowRunId"]) {
    if (!nonEmptyString(artifact.task?.[field])) issues.push(`Callable workflow rehydration task is missing ${field}.`);
  }
  const rehydration = artifact.rehydration && typeof artifact.rehydration === "object" ? artifact.rehydration : {};
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
  if (artifact.childCaller?.kind !== "subagent_child_thread") {
    issues.push("Callable workflow rehydration must prove child-originated caller provenance.");
  }
  for (const field of ["threadId", "runId", "subagentRunId", "canonicalTaskPath", "parentThreadId", "parentRunId"]) {
    if (!nonEmptyString(artifact.childCaller?.[field])) issues.push(`Callable workflow rehydration child caller is missing ${field}.`);
  }
  if (artifact.artifact?.id !== artifact.task?.workflowArtifactId) {
    issues.push("Callable workflow rehydration task artifact link does not match artifact.");
  }
  if (!nonEmptyString(artifact.artifact?.workflowThreadId)) {
    issues.push("Callable workflow rehydration artifact is missing workflowThreadId.");
  }
  if (!nonEmptyString(artifact.artifact?.sourcePath)) {
    issues.push("Callable workflow rehydration artifact is missing sourcePath.");
  }
  if (!nonEmptyString(artifact.artifact?.statePath)) {
    issues.push("Callable workflow rehydration artifact is missing statePath.");
  }
  if (!isWorkflowMutationPolicy(artifact.artifact?.mutationPolicy)) {
    issues.push("Callable workflow rehydration artifact is missing mutationPolicy.");
  }
  if (!nonEmptyString(artifact.artifact?.specGoal)) {
    issues.push("Callable workflow rehydration artifact is missing specGoal.");
  }
  if (artifact.artifact?.workflowThreadId !== artifact.task?.workflowThreadId) {
    issues.push("Callable workflow rehydration workflowThreadId was not joined from the artifact.");
  }
  if (artifact.workflowRun?.id !== artifact.task?.workflowRunId) {
    issues.push("Callable workflow rehydration task run link does not match workflowRun.");
  }
  if (artifact.workflowRun?.artifactId !== artifact.task?.workflowArtifactId) {
    issues.push("Callable workflow rehydration workflow run does not point at the task artifact.");
  }
  if (artifact.workflowRun?.status !== "running") {
    issues.push(`Callable workflow rehydration workflow run status is ${artifact.workflowRun?.status ?? "missing"}.`);
  }
  if (!positiveNumber(artifact.progressSnapshot?.eventCount)) issues.push("Callable workflow rehydration progress is missing eventCount.");
  if (!positiveNumber(artifact.progressSnapshot?.modelCallCount)) issues.push("Callable workflow rehydration progress is missing modelCallCount.");
  if (!positiveNumber(artifact.progressSnapshot?.completedStepCount)) issues.push("Callable workflow rehydration progress is missing completedStepCount.");
  if (!nonEmptyString(artifact.progressSnapshot?.lastEventType)) issues.push("Callable workflow rehydration progress is missing lastEventType.");
  if (!positiveNumber(artifact.usageSnapshot?.modelCallCount)) issues.push("Callable workflow rehydration usage is missing modelCallCount.");
  if (!positiveNumber(artifact.usageSnapshot?.tokenCount)) issues.push("Callable workflow rehydration usage is missing tokenCount.");
  if (typeof artifact.usageSnapshot?.tokenCountEstimated !== "boolean") {
    issues.push("Callable workflow rehydration usage is missing tokenCountEstimated.");
  }
  if (!positiveNumber(artifact.usageSnapshot?.costMicros)) issues.push("Callable workflow rehydration usage is missing costMicros.");
  if (typeof artifact.usageSnapshot?.costEstimated !== "boolean") {
    issues.push("Callable workflow rehydration usage is missing costEstimated.");
  }
  if (artifact.taskEvents?.started !== true) issues.push("Callable workflow rehydration is missing task-started event proof.");
  const eventTypes = Array.isArray(artifact.taskEvents?.eventTypes) ? artifact.taskEvents.eventTypes : [];
  if (!eventTypes.includes("step.end")) issues.push("Callable workflow rehydration is missing persisted workflow progress event proof.");
  validateWorkflowMaturityAssertions(
    artifact.maturityAssertions,
    issues,
    "Callable workflow rehydration",
    REQUIRED_CALLABLE_WORKFLOW_REHYDRATION_MATURITY_ASSERTIONS,
  );
  return { valid: issues.length === 0, issues };
}

function summarizeWorkflowMaturityAssertions(maturityAssertions, expectedAssertions) {
  if (!maturityAssertions || typeof maturityAssertions !== "object" || Array.isArray(maturityAssertions)) return "missing";
  return expectedAssertions
    .map((expected) => `${expected.id}:${maturityAssertions[expected.id]?.status ?? "missing"}`)
    .join(", ");
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
    if (!nonEmptyStringArray(assertion.evidence)) {
      issues.push(`${label} maturity assertion ${expected.id} is missing readable evidence.`);
    } else if (!assertion.evidence.every((entry) => typeof entry === "string" && /^passed: .+/.test(entry))) {
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

function lifecycleEdgeArtifactCheck(artifact, options) {
  const validation = isValidLifecycleEdgeArtifact(artifact);
  const freshness = artifactFreshness(artifact?.createdAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    return check({
      id: "artifact.lifecycle-edges",
      area: "artifacts",
      status: "failed",
      label: "sub-agent lifecycle edge proof artifact is green",
      evidence: ["missing test-results/subagent-lifecycle-edges/latest.json"],
      issues: ["Run pnpm run test:subagents:lifecycle-edges:proof before the release gate."],
    });
  }
  return check({
    id: "artifact.lifecycle-edges",
    area: "artifacts",
    status: issues.length ? "failed" : "passed",
    label: "sub-agent lifecycle edge proof artifact is green",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/subagent-lifecycle-edges/latest.json"}`,
      `source: ${artifact.source ?? "missing"}`,
      `parent: ${artifact.parent?.threadId ?? "missing"} / ${artifact.parent?.runId ?? "missing"}`,
      `coveredEdges: ${(artifact.summary?.coveredEdgeKinds ?? []).join(", ") || "missing"}`,
      `unsafeEdges: ${(artifact.summary?.unsafeEdgeIds ?? []).join(", ") || "none"}`,
      ...freshness.evidence,
    ],
    issues,
  });
}

function isValidLifecycleEdgeArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-subagent-lifecycle-edge-evidence-v1") {
    issues.push(`Sub-agent lifecycle edge schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.featureFlagSnapshot?.ambientSubagentsEnabled !== true) {
    issues.push("Sub-agent lifecycle edge proof must prove ambient.subagents was enabled.");
  }
  if (!nonEmptyString(artifact.parent?.threadId) || !nonEmptyString(artifact.parent?.runId)) {
    issues.push("Sub-agent lifecycle edge proof is missing parent thread/run identity.");
  }
  const requiredKinds = ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"];
  if (!arrayIncludesAll(artifact.summary?.requiredEdgeKinds, requiredKinds)) {
    issues.push("Sub-agent lifecycle edge proof requiredEdgeKinds is incomplete.");
  }
  if (!arrayIncludesAll(artifact.summary?.coveredEdgeKinds, requiredKinds)) {
    issues.push("Sub-agent lifecycle edge proof coveredEdgeKinds is incomplete.");
  }
  if (Array.isArray(artifact.summary?.missingEdgeKinds) && artifact.summary.missingEdgeKinds.length > 0) {
    issues.push(`Sub-agent lifecycle edge proof reports missing edge kinds: ${artifact.summary.missingEdgeKinds.join(", ")}.`);
  }
  if (Array.isArray(artifact.summary?.unsafeEdgeIds) && artifact.summary.unsafeEdgeIds.length > 0) {
    issues.push(`Sub-agent lifecycle edge proof reports unsafe edge ids: ${artifact.summary.unsafeEdgeIds.join(", ")}.`);
  }
  const edges = Array.isArray(artifact.edges) ? artifact.edges : [];
  if (edges.length < requiredKinds.length) {
    issues.push(`Sub-agent lifecycle edge proof has ${edges.length} edges; expected at least ${requiredKinds.length}.`);
  }
  for (const edge of edges) validateLifecycleEdgeArtifactRow(edge, issues);
  return { valid: issues.length === 0, issues };
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

function harnessManifestCheck(artifact, options) {
  const validation = isValidHarnessManifest(artifact);
  const freshness = artifactFreshness(artifact?.generatedAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    const issue = options.requireLive
      ? `${options.label} is required but missing.`
      : `${options.label} was skipped for this deterministic gate run.`;
    return check({
      id: options.id,
      area: "artifacts",
      status: options.requireLive ? "failed" : "advisory",
      label: options.label,
      evidence: [`missing ${options.missingPath}`],
      issues: options.requireLive ? [issue] : [],
      warnIssues: options.requireLive ? [] : [issue],
    });
  }
  const status = artifact.result?.status ?? "missing";
  const failureIssues = status === "passed"
    ? []
    : [`Harness manifest ${artifact.__artifactPath ?? options.missingPath} ended with ${status}.`];
  const allIssues = [...issues, ...failureIssues];
  return check({
    id: options.id,
    area: "artifacts",
    status: allIssues.length ? (options.requireLive ? "failed" : "advisory") : "passed",
    label: options.label,
    evidence: [
      `path: ${artifact.__artifactPath ?? options.missingPath}`,
      `kind: ${artifact.run?.kind ?? "missing"}`,
      `status: ${status}`,
      `phase: ${artifact.result?.phase ?? "missing"}`,
      `provider: ${artifact.provider?.providerId ?? "missing"}`,
      `headful: ${artifact.desktop?.headful === true ? "yes" : artifact.desktop ? "no" : "n/a"}`,
      `cdpPort: ${artifact.desktop?.cdpPort ?? "n/a"}`,
      ...freshness.evidence,
    ],
    issues: options.requireLive ? allIssues : [],
    warnIssues: options.requireLive ? [] : allIssues,
  });
}

function isValidHarnessManifest(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-harness-manifest-v1") {
    issues.push(`Harness manifest schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  const status = artifact.result?.status;
  if (!["passed", "harness_environment_failed", "harness_failed", "provider_failed", "product_failed"].includes(status)) {
    issues.push(`Harness manifest result.status is ${status ?? "missing"}.`);
  }
  if (!artifact.run?.commitSha) issues.push("Harness manifest is missing commitSha.");
  if (!artifact.run?.cwd) issues.push("Harness manifest is missing checkout cwd.");
  if (artifact.run?.kind === "electron_dogfood") {
    if (artifact.desktop?.headful !== true) issues.push("Electron dogfood harness manifest must record headful: true.");
    if (!Number.isInteger(artifact.desktop?.cdpPort) || artifact.desktop.cdpPort <= 0) {
      issues.push("Electron dogfood harness manifest must record a random CDP port.");
    }
  }
  return { valid: issues.length === 0, issues };
}

function liveSmokeArtifactCheck(artifact, options) {
  const validation = isValidLiveSmokeArtifact(artifact);
  const freshness = artifactFreshness(artifact?.createdAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    const issue = options.requireLive
      ? "Live Ambient/Pi sub-agent smoke evidence is required but missing."
      : "Live Ambient/Pi sub-agent smoke evidence was skipped for this deterministic gate run.";
    return check({
      id: "artifact.live-smoke",
      area: "artifacts",
      status: options.requireLive ? "failed" : "advisory",
      label: "live Ambient/Pi child-session smoke evidence is present when required",
      evidence: ["missing test-results/subagent-live-smoke/latest.json"],
      issues: options.requireLive ? [issue] : [],
      warnIssues: options.requireLive ? [] : [issue],
    });
  }
  return check({
    id: "artifact.live-smoke",
    area: "artifacts",
    status: issues.length ? (options.requireLive ? "failed" : "advisory") : "passed",
    label: "live Ambient/Pi child-session smoke evidence is present when required",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/subagent-live-smoke/latest.json"}`,
      `provider: ${artifact.provider ?? "missing"}`,
      `run: ${artifact.run?.id ?? "missing"}`,
      `status: ${artifact.run?.status ?? "missing"}`,
      ...freshness.evidence,
    ],
    issues: options.requireLive ? issues : [],
    warnIssues: options.requireLive ? [] : issues,
  });
}

function isValidLiveSmokeArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
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

function desktopDogfoodArtifactCheck(artifact, options) {
  const validation = isValidDesktopDogfoodArtifact(artifact);
  const freshness = artifactFreshness(artifact?.generatedAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    const issue = options.requireLive
      ? "Automated Desktop dogfood evidence is required but missing."
      : "Automated Desktop dogfood evidence was skipped for this deterministic gate run.";
    return check({
      id: "artifact.desktop-dogfood",
      area: "artifacts",
      status: options.requireLive ? "failed" : "advisory",
      label: "automated Electron Desktop dogfood evidence is present when available",
      evidence: ["missing test-results/subagent-desktop-dogfood/latest.json"],
      issues: options.requireLive ? [issue] : [],
      warnIssues: options.requireLive ? [] : [issue],
    });
  }
  return check({
    id: "artifact.desktop-dogfood",
    area: "artifacts",
    status: issues.length ? (options.requireLive ? "failed" : "advisory") : "passed",
    label: "automated Electron Desktop dogfood evidence is present when available",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/subagent-desktop-dogfood/latest.json"}`,
      `status: ${artifact.status ?? "missing"}`,
      `classification: ${artifact.classification ?? "missing"}`,
      `provider: ${artifact.provider ?? "missing"}`,
      `model: ${artifact.model ?? "missing"}`,
      `headful: ${artifact.headful === true ? "yes" : "no"}`,
      `cdpPort: ${artifact.cdpPort ?? "missing"}`,
      `featureFlag: ${artifact.featureFlag ?? "missing"}`,
      `scenarios: ${(artifact.scenarios ?? []).join(", ") || "missing"}`,
      `approvalId: ${artifact.approvalId ?? "missing"}`,
      `cancelControlChildRunId: ${artifact.cancelControlChildRunId ?? "missing"}`,
      `localRuntimeLeaseId: ${artifact.localRuntimeLeaseId ?? "missing"}`,
      `localRuntimeId: ${artifact.localRuntimeId ?? "missing"}`,
      `workflowTaskId: ${artifact.workflowTaskId ?? "missing"}`,
      `workflowRunId: ${artifact.workflowRunId ?? "missing"}`,
      `workflowArtifactSourceRelativePath: ${artifact.workflowArtifactSourceRelativePath ?? "missing"}`,
      `workflowArtifactStateRelativePath: ${artifact.workflowArtifactStateRelativePath ?? "missing"}`,
      `visualAssertions: ${summarizeDesktopVisualAssertions(artifact.visualAssertions)}`,
      `maturityAssertions: ${summarizeDesktopMaturityAssertions(artifact.maturityAssertions)}`,
      ...freshness.evidence,
    ],
    issues: options.requireLive ? issues : [],
    warnIssues: options.requireLive ? [] : issues,
  });
}

function desktopDogfoodHistoryReportCheck(artifact, options) {
  const validation = isValidDesktopDogfoodHistoryReport(artifact);
  const freshness = artifactFreshness(artifact?.generatedAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    const issue = options.requireMaturityHistory
      ? "Repeated Desktop dogfood maturity history is required but missing."
      : "Repeated Desktop dogfood maturity history was not required for this gate run.";
    return check({
      id: "artifact.desktop-dogfood-history",
      area: "artifacts",
      status: options.requireMaturityHistory ? "failed" : "passed",
      label: "repeated Desktop dogfood maturity history is ready when required",
      evidence: [
        "missing test-results/subagent-desktop-dogfood-history-report/latest.json",
        options.requireMaturityHistory ? "requireMaturityHistory: true" : "requireMaturityHistory: false",
      ],
      issues: options.requireMaturityHistory ? [issue] : [],
    });
  }
  return check({
    id: "artifact.desktop-dogfood-history",
    area: "artifacts",
    status: issues.length ? (options.requireMaturityHistory ? "failed" : "advisory") : "passed",
    label: "repeated Desktop dogfood maturity history is ready when required",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/subagent-desktop-dogfood-history-report/latest.json"}`,
      `status: ${artifact.status ?? "missing"}`,
      `ready: ${artifact.ready === true ? "yes" : "no"}`,
      `readyRuns: ${artifact.summary?.readyRunCount ?? "missing"}/${artifact.criteria?.minDesktopDogfoodRuns ?? "missing"}`,
      `failureRate: ${artifact.summary?.failureRate ?? "missing"}`,
      `highLoadReadyRuns: ${artifact.summary?.highLoadReadyRunCount ?? "missing"}/${artifact.criteria?.minWorkflowHighLoadReadyRuns ?? "missing"}`,
      `blockedGateIds: ${(artifact.blockedGateIds ?? []).join(", ") || "none"}`,
      ...freshness.evidence,
    ],
    issues: options.requireMaturityHistory ? issues : [],
    warnIssues: options.requireMaturityHistory ? [] : issues,
  });
}

function workflowJitterReleaseProfileCheck(artifact, options) {
  const validation = isValidWorkflowJitterReleaseProfileArtifact(artifact);
  const freshness = artifactFreshness(artifact?.generatedAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    const issue = options.requireMaturityHistory
      ? "Workflow jitter release-profile evidence is required for maturity history but missing."
      : "Workflow jitter release-profile evidence was not required for this gate run.";
    return check({
      id: "artifact.workflow-jitter-release-profile",
      area: "artifacts",
      status: options.requireMaturityHistory ? "failed" : "passed",
      label: "workflow jitter release-profile evidence is ready when required",
      evidence: [
        "missing test-results/workflow-jitter-release-gate/latest.json",
        options.requireMaturityHistory ? "requireMaturityHistory: true" : "requireMaturityHistory: false",
      ],
      issues: options.requireMaturityHistory ? [issue] : [],
    });
  }
  return check({
    id: "artifact.workflow-jitter-release-profile",
    area: "artifacts",
    status: issues.length ? (options.requireMaturityHistory ? "failed" : "advisory") : "passed",
    label: "workflow jitter release-profile evidence is ready when required",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/workflow-jitter-release-gate/latest.json"}`,
      `status: ${artifact.status ?? "missing"}`,
      `ready: ${artifact.releaseDecision?.ready === true ? "yes" : "no"}`,
      `releaseProfile: ${artifact.releaseDecision?.releaseProfile === true ? "yes" : "no"}`,
      `liveSkipped: ${artifact.releaseDecision?.liveSkipped === true ? "yes" : "no"}`,
      `matrixProfile: ${artifact.matrix?.profile ?? "missing"}`,
      `liveDogfoodRuns: ${artifact.matrix?.liveDogfoodRunCount ?? "missing"}/10`,
      `liveFamilies: ${(artifact.matrix?.liveFamilies ?? []).join(", ") || "none"}`,
      ...freshness.evidence,
    ],
    issues: options.requireMaturityHistory ? issues : [],
    warnIssues: options.requireMaturityHistory ? [] : issues,
  });
}

function subagentLiveHistoryReportCheck(artifact, options) {
  const validation = isValidSubagentLiveHistoryReport(artifact);
  const freshness = artifactFreshness(artifact?.generatedAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    const issue = options.requireMaturityHistory
      ? "Sub-agent live history report is required for maturity history but missing."
      : "Sub-agent live history report was not required for this gate run.";
    return check({
      id: "artifact.live-history-report",
      area: "artifacts",
      status: options.requireMaturityHistory ? "failed" : "passed",
      label: "required-live release-gate history is ready when required",
      evidence: [
        "missing test-results/subagent-live-history-report/latest.json",
        options.requireMaturityHistory ? "requireMaturityHistory: true" : "requireMaturityHistory: false",
      ],
      issues: options.requireMaturityHistory ? [issue] : [],
    });
  }
  return check({
    id: "artifact.live-history-report",
    area: "artifacts",
    status: issues.length ? (options.requireMaturityHistory ? "failed" : "advisory") : "passed",
    label: "required-live release-gate history is ready when required",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/subagent-live-history-report/latest.json"}`,
      `status: ${artifact.status ?? "missing"}`,
      `ready: ${artifact.ready === true ? "yes" : "no"}`,
      `cleanRequiredRuns: ${artifact.summary?.cleanRequiredRunCount ?? "missing"}/${artifact.criteria?.minLiveDogfoodRuns ?? "missing"}`,
      `failureRate: ${artifact.summary?.failureRate ?? "missing"}`,
      `livePiSmoke: ${artifact.summary?.livePiSmokePassed === true ? "yes" : "no"}`,
      `blockedGateIds: ${(artifact.blockedGateIds ?? []).join(", ") || "none"}`,
      ...freshness.evidence,
    ],
    issues: options.requireMaturityHistory ? issues : [],
    warnIssues: options.requireMaturityHistory ? [] : issues,
  });
}

function isValidDesktopDogfoodArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-subagent-desktop-dogfood-v1") {
    issues.push(`Desktop dogfood artifact schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") {
    issues.push(`Desktop dogfood artifact status is ${artifact.status ?? "missing"}; expected passed.`);
  }
  if (artifact.classification !== "passed") {
    issues.push(`Desktop dogfood artifact classification is ${artifact.classification ?? "missing"}; expected passed.`);
  }
  if (!nonEmptyString(artifact.provider)) issues.push("Desktop dogfood artifact is missing provider.");
  if (artifact.headful !== true) issues.push("Desktop dogfood artifact must record headful: true.");
  if (!Number.isInteger(artifact.cdpPort) || artifact.cdpPort <= 0) {
    issues.push("Desktop dogfood artifact must record the random CDP port.");
  }
  if (artifact.featureFlag !== "ambient.subagents") {
    issues.push(`Desktop dogfood artifact featureFlag is ${artifact.featureFlag ?? "missing"}; expected ambient.subagents.`);
  }
  if (!nonEmptyString(artifact.parentThreadId)) issues.push("Desktop dogfood artifact is missing parentThreadId.");
  if (!nonEmptyString(artifact.parentMessageId)) issues.push("Desktop dogfood artifact is missing parentMessageId.");
  if (!allNonEmptyStrings(artifact.childRunIds)) issues.push("Desktop dogfood artifact is missing childRunIds.");
  if (!allNonEmptyStrings(artifact.childThreadIds)) issues.push("Desktop dogfood artifact is missing childThreadIds.");
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("approval_parent_blocking")) {
    issues.push("Desktop dogfood artifact must include approval_parent_blocking scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("workflow_execution_parent_blocking")) {
    issues.push("Desktop dogfood artifact must include workflow_execution_parent_blocking scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("mutating_worker_dogfood_behavior")) {
    issues.push("Desktop dogfood artifact must include mutating_worker_dogfood_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("workflow_high_load_dogfood")) {
    issues.push("Desktop dogfood artifact must include workflow_high_load_dogfood scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("denied_scope_explanation_behavior")) {
    issues.push("Desktop dogfood artifact must include denied_scope_explanation_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("approval_forwarding_behavior")) {
    issues.push("Desktop dogfood artifact must include approval_forwarding_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("restart_rehydration_behavior")) {
    issues.push("Desktop dogfood artifact must include restart_rehydration_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("workflow_rehydrated_navigation_behavior")) {
    issues.push("Desktop dogfood artifact must include workflow_rehydrated_navigation_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("workflow_artifact_rehydration_behavior")) {
    issues.push("Desktop dogfood artifact must include workflow_artifact_rehydration_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("local_runtime_ownership_ui")) {
    issues.push("Desktop dogfood artifact must include local_runtime_ownership_ui scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("untracked_runtime_safety_behavior")) {
    issues.push("Desktop dogfood artifact must include untracked_runtime_safety_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("lifecycle_edge_desktop_behavior")) {
    issues.push("Desktop dogfood artifact must include lifecycle_edge_desktop_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("operator_child_controls")) {
    issues.push("Desktop dogfood artifact must include operator_child_controls scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("operator_control_behavior")) {
    issues.push("Desktop dogfood artifact must include operator_control_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("multi_parent_cluster_stress")) {
    issues.push("Desktop dogfood artifact must include multi_parent_cluster_stress scenario evidence.");
  }
  if (!nonEmptyString(artifact.approvalRequestParentMailboxEventId)) {
    issues.push("Desktop dogfood artifact is missing approvalRequestParentMailboxEventId.");
  }
  if (!nonEmptyString(artifact.approvalId)) issues.push("Desktop dogfood artifact is missing approvalId.");
  if (!nonEmptyString(artifact.cancelControlChildRunId)) issues.push("Desktop dogfood artifact is missing cancelControlChildRunId.");
  if (!allNonEmptyStrings(artifact.closeControlChildRunIds)) issues.push("Desktop dogfood artifact is missing closeControlChildRunIds.");
  if (!nonEmptyString(artifact.localRuntimeLeaseId)) issues.push("Desktop dogfood artifact is missing localRuntimeLeaseId.");
  if (!nonEmptyString(artifact.localRuntimeId)) issues.push("Desktop dogfood artifact is missing localRuntimeId.");
  if (!Number.isInteger(artifact.localRuntimePid) || artifact.localRuntimePid <= 0) {
    issues.push("Desktop dogfood artifact is missing localRuntimePid.");
  }
  if (!nonEmptyString(artifact.untrackedRuntimeId)) issues.push("Desktop dogfood artifact is missing untrackedRuntimeId.");
  if (!Number.isInteger(artifact.untrackedRuntimePid) || artifact.untrackedRuntimePid <= 0) {
    issues.push("Desktop dogfood artifact is missing untrackedRuntimePid.");
  }
  if (!nonEmptyString(artifact.untrackedRuntimeEndpoint)) {
    issues.push("Desktop dogfood artifact is missing untrackedRuntimeEndpoint.");
  }
  if (!nonEmptyString(artifact.untrackedRuntimeModel) || !artifact.untrackedRuntimeModel.includes(".gguf")) {
    issues.push("Desktop dogfood artifact is missing untrackedRuntimeModel.");
  }
  if (!nonEmptyString(artifact.workflowTaskId)) issues.push("Desktop dogfood artifact is missing workflowTaskId.");
  if (!nonEmptyString(artifact.workflowArtifactId)) issues.push("Desktop dogfood artifact is missing workflowArtifactId.");
  if (!nonEmptyString(artifact.workflowArtifactSourceRelativePath)) {
    issues.push("Desktop dogfood artifact is missing workflowArtifactSourceRelativePath.");
  }
  if (!nonEmptyString(artifact.workflowArtifactStateRelativePath)) {
    issues.push("Desktop dogfood artifact is missing workflowArtifactStateRelativePath.");
  }
  if (!nonEmptyString(artifact.workflowArtifactSourceContent)) {
    issues.push("Desktop dogfood artifact is missing workflowArtifactSourceContent.");
  }
  if (!nonEmptyString(artifact.workflowRunId)) issues.push("Desktop dogfood artifact is missing workflowRunId.");
  if (!nonEmptyString(artifact.workflowThreadId)) issues.push("Desktop dogfood artifact is missing workflowThreadId.");
  if (!nonEmptyString(artifact.workflowParentMailboxEventId)) {
    issues.push("Desktop dogfood artifact is missing workflowParentMailboxEventId.");
  }
  if (!nonEmptyString(artifact.mutatingWorkflowTaskId)) issues.push("Desktop dogfood artifact is missing mutatingWorkflowTaskId.");
  if (!nonEmptyString(artifact.mutatingWorkflowArtifactId)) {
    issues.push("Desktop dogfood artifact is missing mutatingWorkflowArtifactId.");
  }
  if (!nonEmptyString(artifact.mutatingWorkflowRunId)) issues.push("Desktop dogfood artifact is missing mutatingWorkflowRunId.");
  if (!nonEmptyString(artifact.mutatingWorkflowThreadId)) {
    issues.push("Desktop dogfood artifact is missing mutatingWorkflowThreadId.");
  }
  if (!nonEmptyString(artifact.mutatingWorkflowChildRunId)) {
    issues.push("Desktop dogfood artifact is missing mutatingWorkflowChildRunId.");
  }
  if (!nonEmptyString(artifact.mutatingWorkflowChildThreadId)) {
    issues.push("Desktop dogfood artifact is missing mutatingWorkflowChildThreadId.");
  }
  if (!safeRelativePath(artifact.mutatingWorkflowStagedRelativePath)) {
    issues.push("Desktop dogfood artifact mutatingWorkflowStagedRelativePath must be a safe relative path.");
  }
  if (!safeRelativePath(artifact.mutatingWorkflowReportRelativePath)) {
    issues.push("Desktop dogfood artifact mutatingWorkflowReportRelativePath must be a safe relative path.");
  }
  if (!nonEmptyString(artifact.mutatingWorkflowProgressMessage) ||
      !artifact.mutatingWorkflowProgressMessage.includes("parent workspace unchanged")) {
    issues.push("Desktop dogfood artifact is missing readable mutatingWorkflowProgressMessage.");
  }
  if (artifact.mutatingWorkflowParentWorkspaceUnchanged !== true) {
    issues.push("Desktop dogfood artifact must prove mutatingWorkflowParentWorkspaceUnchanged.");
  }
  if (!allNonEmptyStrings(artifact.workflowHighLoadTaskIds) || artifact.workflowHighLoadTaskIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoadTaskIds.");
  }
  if (!allNonEmptyStrings(artifact.workflowHighLoadArtifactIds) || artifact.workflowHighLoadArtifactIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoadArtifactIds.");
  }
  if (!allNonEmptyStrings(artifact.workflowHighLoadRunIds) || artifact.workflowHighLoadRunIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoadRunIds.");
  }
  if (!allNonEmptyStrings(artifact.workflowHighLoadThreadIds) || artifact.workflowHighLoadThreadIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoadThreadIds.");
  }
  if (!allNonEmptyStrings(artifact.workflowHighLoadPatternLabels) || artifact.workflowHighLoadPatternLabels.length < 6) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoadPatternLabels.");
  }
  if (!nonEmptyString(artifact.deniedScopeParentMailboxEventId)) {
    issues.push("Desktop dogfood artifact is missing deniedScopeParentMailboxEventId.");
  }
  if (!nonEmptyString(artifact.deniedScopeChildRunId)) {
    issues.push("Desktop dogfood artifact is missing deniedScopeChildRunId.");
  }
  if (!nonEmptyString(artifact.deniedScopeChildThreadId)) {
    issues.push("Desktop dogfood artifact is missing deniedScopeChildThreadId.");
  }
  if (!nonEmptyString(artifact.lifecycleEdgeParentMessageId)) {
    issues.push("Desktop dogfood artifact is missing lifecycleEdgeParentMessageId.");
  }
  if (!allNonEmptyStrings(artifact.lifecycleEdgeChildRunIds) || artifact.lifecycleEdgeChildRunIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing lifecycleEdgeChildRunIds.");
  }
  if (!allNonEmptyStrings(artifact.lifecycleEdgeChildThreadIds) || artifact.lifecycleEdgeChildThreadIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing lifecycleEdgeChildThreadIds.");
  }
  if (!allNonEmptyStrings(artifact.lifecycleEdgeWaitBarrierIds) || artifact.lifecycleEdgeWaitBarrierIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing lifecycleEdgeWaitBarrierIds.");
  }
  if (!allNonEmptyStrings(artifact.stressParentMessageIds) || artifact.stressParentMessageIds.length < 2) {
    issues.push("Desktop dogfood artifact is missing stressParentMessageIds.");
  }
  if (!allNonEmptyStrings(artifact.stressChildRunIds) || artifact.stressChildRunIds.length < 6) {
    issues.push("Desktop dogfood artifact is missing stressChildRunIds.");
  }
  if (!allNonEmptyStrings(artifact.stressChildThreadIds) || artifact.stressChildThreadIds.length < 6) {
    issues.push("Desktop dogfood artifact is missing stressChildThreadIds.");
  }

  const artifacts = artifact.artifacts && typeof artifact.artifacts === "object" ? artifact.artifacts : {};
  for (const field of [
    "collapsedDesktopScreenshot",
    "expandedDesktopScreenshot",
    "approvalDialogScreenshot",
    "approvalForwardingDesktopScreenshot",
    "workflowExecutionDesktopScreenshot",
    "mutatingWorkerDogfoodDesktopScreenshot",
    "workflowHighLoadDesktopScreenshot",
    "deniedScopeExplanationDesktopScreenshot",
    "lifecycleEdgeVisibilityDesktopScreenshot",
    "multiClusterStressDesktopScreenshot",
    "restartRehydrationDesktopScreenshot",
    "workflowRehydratedNavigationDesktopScreenshot",
    "workflowArtifactRehydrationDesktopScreenshot",
    "localRuntimeOwnershipDesktopScreenshot",
    "expandedNarrowScreenshot",
    "operatorBehaviorDesktopScreenshot",
    "childTranscriptExpandedDesktopScreenshot",
    "completedChildTranscriptDesktopScreenshot",
    "patternGraphClickThroughDesktopScreenshot",
    "patternGraphCompletedClickThroughDesktopScreenshot",
    "accessibilitySnapshot",
  ]) {
    if (!safeRelativePath(artifacts[field])) {
      issues.push(`Desktop dogfood artifact ${field} must be a safe relative path.`);
    }
  }

  const checks = artifact.checks && typeof artifact.checks === "object" ? artifact.checks : {};
  const collapsed = checks.collapsed && typeof checks.collapsed === "object" ? checks.collapsed : {};
  if (collapsed.defaultCollapsed !== true) issues.push("Desktop dogfood collapsed state is not default-collapsed.");
  if (collapsed.clusterAfterParentMessage !== true) issues.push("Desktop dogfood collapsed state is not anchored after the parent message.");
  if (collapsed.horizontalOverflowFree !== true) issues.push("Desktop dogfood collapsed state has horizontal overflow.");
  requireLabels(collapsed.labels, ["Sub-agent threads", "2 children", "1 attention", "1 failed spawn", "Needs attention"], "collapsed", issues);
  requireLabels(collapsed.labels, ["6 workflow tasks", "1 blocking", "1 workflow blocked"], "collapsed", issues);

  const expanded = checks.expanded && typeof checks.expanded === "object" ? checks.expanded : {};
  if (expanded.defaultCollapsed !== false) issues.push("Desktop dogfood expanded state did not open the cluster.");
  if (!Number.isInteger(expanded.childRows) || expanded.childRows < 2) {
    issues.push(`Desktop dogfood expanded state reports ${expanded.childRows ?? "missing"} child rows.`);
  }
  if (expanded.horizontalOverflowFree !== true) issues.push("Desktop dogfood expanded state has horizontal overflow.");
  if (!Number.isInteger(expanded.warningToneCount) || expanded.warningToneCount < 1) {
    issues.push(`Desktop dogfood expanded state reports ${expanded.warningToneCount ?? "missing"} warning tone rows.`);
  }
  requireLabels(expanded.labels, [
    "Review worker",
    "Context summarizer",
    "Blocking: approval",
    "Approval requested",
    "Allow workspace write",
    "workspace.write",
    "This child thread",
    "Approve child",
    "Deny child",
    "Waiting on child",
    "Required all",
    "Ask user on failure",
    "Symphony Map-Reduce",
    "Symphony Adversarial Debate",
    "Symphony Imitate and Verify",
    "Symphony Pipeline",
    "Symphony Ensemble",
    "Symphony Self-Healing Loop",
    "Blocking: workflow work",
    "Workflow blocked",
    "Mutating child worker",
    "Staged mutation: src/feature.txt",
    "Parent workspace unchanged",
  ], "expanded", issues);
  validateDesktopApprovalFlow(expanded.approvalFlow, issues);
  validateDesktopWorkflowExecution(checks.workflowExecution, issues);
  validateDesktopMutatingWorkerDogfood(checks.mutatingWorkerDogfood, issues);
  validateDesktopWorkflowHighLoad(checks.workflowHighLoad, issues);
  validateDesktopDeniedScopeExplanation(checks.deniedScopeExplanation, issues);
  validateDesktopLifecycleEdgeVisibility(checks.lifecycleEdgeVisibility, issues);
  validateDesktopMultiClusterStress(checks.multiClusterStress, issues);
  validateDesktopApprovalForwarding(checks.approvalForwarding, issues);
  validateDesktopRestartRehydration(checks.restartRehydration, issues);
  validateDesktopWorkflowRehydratedNavigation(checks.workflowRehydratedNavigation, issues);
  validateDesktopWorkflowArtifactRehydration(checks.workflowArtifactRehydration, issues);
  validateDesktopLocalRuntimeOwnership(checks.localRuntimeOwnership, issues);
  validateDesktopOperatorControls(expanded.operatorControls, "expanded", issues);
  validateDesktopInlineChildTranscripts(checks, issues);

  const narrow = checks.narrow && typeof checks.narrow === "object" ? checks.narrow : {};
  if (narrow.horizontalOverflowFree !== true) issues.push("Desktop dogfood narrow view has horizontal overflow.");
  if (narrow.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood narrow view reports ${narrow.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
  if (narrow.clusterWithinViewport !== true) issues.push("Desktop dogfood narrow view cluster is outside the viewport.");
  validateDesktopOperatorControls(narrow.operatorControls, "narrow", issues);

  validateDesktopOperatorBehavior(checks.operatorBehavior, issues);
  validateDesktopVisualAssertions(artifact.visualAssertions, issues);
  validateDesktopMaturityAssertions(artifact.maturityAssertions, issues);

  if (artifact.error) issues.push("Desktop dogfood artifact includes an error.");
  const secretPaths = secretLikeStringPaths(artifact);
  if (secretPaths.length) {
    issues.push(`Desktop dogfood artifact appears to contain secret-like material at ${secretPaths.slice(0, 3).join(", ")}.`);
  }
  return { valid: issues.length === 0, issues };
}

function isValidDesktopDogfoodHistoryReport(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-subagent-desktop-dogfood-history-report-v1") {
    issues.push(`Desktop dogfood history report schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "ready_to_graduate") {
    issues.push(`Desktop dogfood history report status is ${artifact.status ?? "missing"}; expected ready_to_graduate.`);
  }
  if (artifact.ready !== true) issues.push("Desktop dogfood history report ready must be true.");
  if (!nonEmptyString(artifact.historyPath)) issues.push("Desktop dogfood history report is missing historyPath.");

  const criteria = artifact.criteria ?? {};
  const summary = artifact.summary ?? {};
  if (!positiveInteger(criteria.minDesktopDogfoodRuns)) {
    issues.push("Desktop dogfood history report criteria.minDesktopDogfoodRuns must be positive.");
  } else if (criteria.minDesktopDogfoodRuns < REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS) {
    issues.push(`Desktop dogfood history report criteria.minDesktopDogfoodRuns is ${criteria.minDesktopDogfoodRuns}; expected at least ${REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS} for graduation.`);
  }
  if (!positiveInteger(criteria.minWorkflowHighLoadReadyRuns)) {
    issues.push("Desktop dogfood history report criteria.minWorkflowHighLoadReadyRuns must be positive.");
  } else if (criteria.minWorkflowHighLoadReadyRuns < REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS) {
    issues.push(`Desktop dogfood history report criteria.minWorkflowHighLoadReadyRuns is ${criteria.minWorkflowHighLoadReadyRuns}; expected at least ${REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS} for graduation.`);
  }
  if (typeof criteria.maxDesktopDogfoodFailureRate !== "number" || criteria.maxDesktopDogfoodFailureRate < 0 || criteria.maxDesktopDogfoodFailureRate > 1) {
    issues.push("Desktop dogfood history report criteria.maxDesktopDogfoodFailureRate must be a rate.");
  }
  if (nonNegativeCount(summary.readyRunCount) < nonNegativeCount(criteria.minDesktopDogfoodRuns)) {
    issues.push(`Desktop dogfood history report has ${nonNegativeCount(summary.readyRunCount)} ready runs; expected ${nonNegativeCount(criteria.minDesktopDogfoodRuns)}.`);
  }
  if (nonNegativeCount(summary.highLoadReadyRunCount) < nonNegativeCount(criteria.minWorkflowHighLoadReadyRuns)) {
    issues.push(`Desktop dogfood history report has ${nonNegativeCount(summary.highLoadReadyRunCount)} high-load ready runs; expected ${nonNegativeCount(criteria.minWorkflowHighLoadReadyRuns)}.`);
  }
  if (typeof summary.failureRate !== "number" || summary.failureRate > criteria.maxDesktopDogfoodFailureRate) {
    issues.push(`Desktop dogfood history report failureRate is ${summary.failureRate ?? "missing"}; max is ${criteria.maxDesktopDogfoodFailureRate ?? "missing"}.`);
  }
  if (nonNegativeCount(summary.readyRowsWithCompleteVisuals) < nonNegativeCount(summary.readyRunCount)) {
    issues.push(`Desktop dogfood history report has ${nonNegativeCount(summary.readyRowsWithCompleteVisuals)}/${nonNegativeCount(summary.readyRunCount)} ready rows with complete visual assertions.`);
  }
  if (nonNegativeCount(summary.readyRowsWithCompleteMaturity) < nonNegativeCount(summary.readyRunCount)) {
    issues.push(`Desktop dogfood history report has ${nonNegativeCount(summary.readyRowsWithCompleteMaturity)}/${nonNegativeCount(summary.readyRunCount)} ready rows with complete maturity assertions.`);
  }
  if (nonNegativeCount(summary.screenshotRunCount) < nonNegativeCount(summary.readyRunCount)) {
    issues.push(`Desktop dogfood history report has ${nonNegativeCount(summary.screenshotRunCount)}/${nonNegativeCount(summary.readyRunCount)} ready rows with screenshot evidence.`);
  }
  if (!Number.isInteger(summary.visualFailureRunCount) || summary.visualFailureRunCount < 0) {
    issues.push("Desktop dogfood history report summary.visualFailureRunCount must be a non-negative integer.");
  }
  if (!Number.isInteger(summary.maturityFailureRunCount) || summary.maturityFailureRunCount < 0) {
    issues.push("Desktop dogfood history report summary.maturityFailureRunCount must be a non-negative integer.");
  }
  validateDesktopDogfoodHistoryScenarioCoverage(summary.requiredScenarioCoverage, criteria, issues);

  const blockedGateIds = Array.isArray(artifact.blockedGateIds) ? artifact.blockedGateIds : [];
  if (blockedGateIds.length) {
    issues.push(`Desktop dogfood history report has blocked gates: ${blockedGateIds.join(", ")}.`);
  }
  const gates = Array.isArray(artifact.gates) ? artifact.gates : [];
  if (!gates.length) issues.push("Desktop dogfood history report is missing gates.");
  const gateIds = gates.map((gate) => gate?.id).filter(nonEmptyString);
  for (const expectedGateId of REQUIRED_DESKTOP_DOGFOOD_HISTORY_GATE_IDS) {
    if (!gateIds.includes(expectedGateId)) {
      issues.push(`Desktop dogfood history report is missing gate ${expectedGateId}.`);
    }
  }
  for (const gate of gates) {
    if (gate?.status !== "passed") {
      issues.push(`Desktop dogfood history gate ${gate?.id ?? "unknown"} is ${gate?.status ?? "missing"}; expected passed.`);
    }
  }
  if (!Array.isArray(artifact.latestRuns) || artifact.latestRuns.length === 0) {
    issues.push("Desktop dogfood history report is missing latestRuns.");
  } else {
    for (const run of artifact.latestRuns.slice(0, 8)) {
      if (!nonEmptyString(run?.runId)) issues.push("Desktop dogfood history latestRuns entry is missing runId.");
      if (!nonEmptyString(run?.generatedAt)) issues.push(`Desktop dogfood history latest run ${run?.runId ?? "unknown"} is missing generatedAt.`);
      if (!nonEmptyString(run?.status)) issues.push(`Desktop dogfood history latest run ${run?.runId ?? "unknown"} is missing status.`);
      if (!safeRelativePath(run?.reportPath)) issues.push(`Desktop dogfood history latest run ${run?.runId ?? "unknown"} reportPath must be a safe relative path.`);
    }
  }
  return { valid: issues.length === 0, issues };
}

function isValidSubagentLiveHistoryReport(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-subagent-live-history-report-v1") {
    issues.push(`Sub-agent live history report schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "ready_to_graduate") {
    issues.push(`Sub-agent live history report status is ${artifact.status ?? "missing"}; expected ready_to_graduate.`);
  }
  if (artifact.ready !== true) issues.push("Sub-agent live history report ready must be true.");
  if (!nonEmptyString(artifact.historyPath)) issues.push("Sub-agent live history report is missing historyPath.");

  const criteria = artifact.criteria ?? {};
  const summary = artifact.summary ?? {};
  if (!positiveInteger(criteria.minLiveDogfoodRuns)) {
    issues.push("Sub-agent live history report criteria.minLiveDogfoodRuns must be positive.");
  } else if (criteria.minLiveDogfoodRuns < REQUIRED_LIVE_HISTORY_GRADUATION_RUNS) {
    issues.push(`Sub-agent live history report criteria.minLiveDogfoodRuns is ${criteria.minLiveDogfoodRuns}; expected at least ${REQUIRED_LIVE_HISTORY_GRADUATION_RUNS} for graduation.`);
  }
  if (typeof criteria.maxLiveDogfoodFailureRate !== "number" || criteria.maxLiveDogfoodFailureRate < 0 || criteria.maxLiveDogfoodFailureRate > 1) {
    issues.push("Sub-agent live history report criteria.maxLiveDogfoodFailureRate must be a rate.");
  } else if (criteria.maxLiveDogfoodFailureRate > REQUIRED_LIVE_HISTORY_MAX_FAILURE_RATE) {
    issues.push(`Sub-agent live history report criteria.maxLiveDogfoodFailureRate is ${criteria.maxLiveDogfoodFailureRate}; expected at most ${REQUIRED_LIVE_HISTORY_MAX_FAILURE_RATE} for graduation.`);
  }
  if (nonNegativeCount(summary.cleanRequiredRunCount) < nonNegativeCount(criteria.minLiveDogfoodRuns)) {
    issues.push(`Sub-agent live history report has ${nonNegativeCount(summary.cleanRequiredRunCount)} clean required-live runs; expected ${nonNegativeCount(criteria.minLiveDogfoodRuns)}.`);
  }
  if (typeof summary.failureRate !== "number" || summary.failureRate > criteria.maxLiveDogfoodFailureRate) {
    issues.push(`Sub-agent live history report failureRate is ${summary.failureRate ?? "missing"}; max is ${criteria.maxLiveDogfoodFailureRate ?? "missing"}.`);
  }
  if (summary.livePiSmokePassed !== true) {
    issues.push("Sub-agent live history report must include passing Ambient/Pi smoke evidence.");
  }
  if (nonNegativeCount(summary.skippedEvidenceRunCount) > 0 &&
      nonNegativeCount(summary.cleanRequiredRunCount) < REQUIRED_LIVE_HISTORY_GRADUATION_RUNS) {
    issues.push(`Sub-agent live history report has ${nonNegativeCount(summary.skippedEvidenceRunCount)} skipped-evidence row(s) before graduation volume is satisfied.`);
  }

  const gates = Array.isArray(artifact.gates) ? artifact.gates : [];
  for (const expectedGateId of REQUIRED_LIVE_HISTORY_GATE_IDS) {
    const gate = gates.find((item) => item?.id === expectedGateId);
    if (!gate) {
      issues.push(`Sub-agent live history report is missing gate ${expectedGateId}.`);
    } else if (gate.status !== "passed") {
      issues.push(`Sub-agent live history report gate ${expectedGateId} status is ${gate.status ?? "missing"}; expected passed.`);
    }
  }
  if (Array.isArray(artifact.blockedGateIds) && artifact.blockedGateIds.length > 0) {
    issues.push(`Sub-agent live history report has blocked gates: ${artifact.blockedGateIds.join(", ")}.`);
  }
  if (Array.isArray(artifact.invalidRows) && artifact.invalidRows.length > 0) {
    issues.push(`Sub-agent live history report has ${artifact.invalidRows.length} invalid row(s).`);
  }
  validateLiveHistoryEvidenceLanes(summary.evidenceLanes, nonNegativeCount(criteria.minLiveDogfoodRuns), issues);
  if (!Array.isArray(artifact.latestRequiredRuns) || artifact.latestRequiredRuns.length === 0) {
    issues.push("Sub-agent live history report is missing latestRequiredRuns.");
  }
  return { valid: issues.length === 0, issues };
}

function isValidWorkflowJitterReleaseProfileArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== 1) {
    issues.push(`Workflow jitter release-profile report schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") {
    issues.push(`Workflow jitter release-profile report status is ${artifact.status ?? "missing"}; expected passed.`);
  }
  const decision = objectValue(artifact.releaseDecision);
  if (decision.ready !== true) issues.push("Workflow jitter release-profile decision ready must be true.");
  if (decision.releaseProfile !== true) issues.push("Workflow jitter release-profile decision releaseProfile must be true.");
  if (decision.liveRequired !== true) issues.push("Workflow jitter release-profile decision liveRequired must be true.");
  if (decision.liveSkipped === true) issues.push("Workflow jitter release-profile decision must not skip live evidence.");
  if (Array.isArray(decision.blockingIssues) && decision.blockingIssues.length) {
    issues.push(`Workflow jitter release-profile has blocking issues: ${decision.blockingIssues.join(", ")}.`);
  }

  const matrix = objectValue(artifact.matrix);
  if (matrix.profile !== "release") {
    issues.push(`Workflow jitter release-profile matrix profile is ${matrix.profile ?? "missing"}; expected release.`);
  }
  if (nonNegativeCount(matrix.deterministicStressUnitCount) < REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_DETERMINISTIC_STRESS_UNITS) {
    issues.push(
      `Workflow jitter release-profile has ${nonNegativeCount(matrix.deterministicStressUnitCount)} deterministic stress unit(s); expected at least ${REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_DETERMINISTIC_STRESS_UNITS}.`,
    );
  }
  if (nonNegativeCount(matrix.livePromptVariantCount) < REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_PROMPT_VARIANTS) {
    issues.push(
      `Workflow jitter release-profile has ${nonNegativeCount(matrix.livePromptVariantCount)} live prompt variant(s); expected at least ${REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_PROMPT_VARIANTS}.`,
    );
  }
  if (nonNegativeCount(matrix.liveDogfoodRunCount) < REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_DOGFOOD_RUNS) {
    issues.push(
      `Workflow jitter release-profile has ${nonNegativeCount(matrix.liveDogfoodRunCount)} live UI dogfood run(s); expected at least ${REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_DOGFOOD_RUNS}.`,
    );
  }
  const liveFamilies = Array.isArray(matrix.liveFamilies) ? matrix.liveFamilies : [];
  for (const family of REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_FAMILIES) {
    if (!liveFamilies.includes(family)) {
      issues.push(`Workflow jitter release-profile is missing passed live family coverage: ${family}.`);
    }
  }
  if (nonNegativeCount(matrix.productOrTestFailureCount) > 0) {
    issues.push(`Workflow jitter release-profile has ${matrix.productOrTestFailureCount} product/test failure row(s).`);
  }
  if (nonNegativeCount(matrix.providerDegradedCount) > 0) {
    issues.push(`Workflow jitter release-profile has ${matrix.providerDegradedCount} provider-degraded row(s).`);
  }
  if (nonNegativeCount(matrix.environmentSkippedCount) > 0) {
    issues.push(`Workflow jitter release-profile has ${matrix.environmentSkippedCount} environment-skipped row(s).`);
  }
  if (nonNegativeCount(matrix.promotionCandidateCount) > 0) {
    issues.push(`Workflow jitter release-profile has ${matrix.promotionCandidateCount} promotion candidate(s).`);
  }
  const checks = Array.isArray(artifact.checks) ? artifact.checks : [];
  const releaseProfileCheck = checks.find((check) => check?.id === "matrix.release-profile");
  if (!releaseProfileCheck) {
    issues.push("Workflow jitter release-profile report is missing matrix.release-profile check.");
  } else if (releaseProfileCheck.status !== "pass") {
    issues.push(`Workflow jitter matrix.release-profile check is ${releaseProfileCheck.status ?? "missing"}; expected pass.`);
  }
  return { valid: issues.length === 0, issues };
}

const REQUIRED_LIVE_HISTORY_GATE_IDS = [
  "history_available",
  "history_parse",
  "live_dogfood_count",
  "live_dogfood_failure_rate",
  "live_smoke",
];

const REQUIRED_DESKTOP_DOGFOOD_HISTORY_GATE_IDS = [
  "history_available",
  "history_parse",
  "desktop_dogfood_count",
  "desktop_dogfood_failure_rate",
  "required_scenario_coverage",
  "visual_assertions",
  "maturity_assertions",
  "workflow_high_load_repetition",
];

function validateLiveHistoryEvidenceLanes(lanes, minPresentRuns, issues) {
  if (!Array.isArray(lanes)) {
    issues.push("Sub-agent live history report is missing evidenceLanes.");
    return;
  }
  for (const label of REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS) {
    const lane = lanes.find((item) => item?.label === label);
    if (!lane) {
      issues.push(`Sub-agent live history report is missing evidence lane ${label}.`);
      continue;
    }
    if (nonNegativeCount(lane.presentRunCount) < minPresentRuns) {
      issues.push(`Sub-agent live history report evidence lane ${label} has ${nonNegativeCount(lane.presentRunCount)} present row(s); expected ${minPresentRuns}.`);
    }
    if (lane.latestStatus !== "present") {
      issues.push(`Sub-agent live history report evidence lane ${label} latestStatus is ${lane.latestStatus ?? "missing"}; expected present.`);
    }
  }
}

function validateDesktopDogfoodHistoryScenarioCoverage(requiredScenarioCoverage, criteria, issues) {
  if (!Array.isArray(requiredScenarioCoverage)) {
    issues.push("Desktop dogfood history report is missing requiredScenarioCoverage.");
    return;
  }
  const byId = new Map(requiredScenarioCoverage.map((row) => [row?.id, row]));
  for (const scenarioId of REQUIRED_DESKTOP_DOGFOOD_SCENARIOS) {
    const row = byId.get(scenarioId);
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      issues.push(`Desktop dogfood history report is missing scenario coverage for ${scenarioId}.`);
      continue;
    }
    const readyRunCount = nonNegativeCount(row.readyRunCount);
    const runCount = nonNegativeCount(row.runCount);
    if (readyRunCount < nonNegativeCount(criteria.minDesktopDogfoodRuns)) {
      issues.push(`Desktop dogfood history scenario ${scenarioId} has ${readyRunCount} ready runs; expected ${nonNegativeCount(criteria.minDesktopDogfoodRuns)}.`);
    }
    if (runCount < readyRunCount) {
      issues.push(`Desktop dogfood history scenario ${scenarioId} has runCount ${runCount} below readyRunCount ${readyRunCount}.`);
    }
  }
}

function summarizeDesktopVisualAssertions(visualAssertions) {
  if (!visualAssertions || typeof visualAssertions !== "object" || Array.isArray(visualAssertions)) return "missing";
  return REQUIRED_DESKTOP_VISUAL_ASSERTIONS
    .map((id) => `${id}:${visualAssertions[id]?.status ?? "missing"}`)
    .join(", ");
}

function validateDesktopVisualAssertions(visualAssertions, issues) {
  if (!visualAssertions || typeof visualAssertions !== "object" || Array.isArray(visualAssertions)) {
    issues.push("Desktop dogfood artifact is missing semantic visual assertions.");
    return;
  }

  for (const id of REQUIRED_DESKTOP_VISUAL_ASSERTIONS) {
    const assertion = visualAssertions[id];
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      issues.push(`Desktop dogfood visual assertion ${id} is missing.`);
      continue;
    }
    if (assertion.id !== id) {
      issues.push(`Desktop dogfood visual assertion ${id} has mismatched id ${assertion.id ?? "missing"}.`);
    }
    if (assertion.status !== "passed") {
      issues.push(`Desktop dogfood visual assertion ${id} status is ${assertion.status ?? "missing"}; expected passed.`);
    }
    if (!nonEmptyStringArray(assertion.evidence)) {
      issues.push(`Desktop dogfood visual assertion ${id} is missing readable evidence.`);
    } else if (!assertion.evidence.every((entry) => typeof entry === "string" && /^passed: .+/.test(entry))) {
      issues.push(`Desktop dogfood visual assertion ${id} must record only passed evidence entries.`);
    }
    if (!Array.isArray(assertion.artifactRefs) || assertion.artifactRefs.length === 0) {
      issues.push(`Desktop dogfood visual assertion ${id} is missing artifactRefs.`);
    } else {
      for (const artifactRef of assertion.artifactRefs) {
        if (!safeRelativePath(artifactRef)) {
          issues.push(`Desktop dogfood visual assertion ${id} artifactRef must be a safe relative path.`);
          break;
        }
      }
    }
  }
}

function summarizeDesktopMaturityAssertions(maturityAssertions) {
  if (!maturityAssertions || typeof maturityAssertions !== "object" || Array.isArray(maturityAssertions)) return "missing";
  return REQUIRED_DESKTOP_MATURITY_ASSERTIONS
    .map((expected) => `${expected.id}:${maturityAssertions[expected.id]?.status ?? "missing"}`)
    .join(", ");
}

function validateDesktopMaturityAssertions(maturityAssertions, issues) {
  if (!maturityAssertions || typeof maturityAssertions !== "object" || Array.isArray(maturityAssertions)) {
    issues.push("Desktop dogfood artifact is missing maturityAssertions.");
    return;
  }

  for (const expected of REQUIRED_DESKTOP_MATURITY_ASSERTIONS) {
    const assertion = maturityAssertions[expected.id];
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} is missing.`);
      continue;
    }
    if (assertion.id !== expected.id) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} has mismatched id ${assertion.id ?? "missing"}.`);
    }
    if (assertion.status !== "passed") {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} status is ${assertion.status ?? "missing"}; expected passed.`);
    }
    if (!nonEmptyStringArray(assertion.evidence)) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} is missing readable evidence.`);
    } else if (!assertion.evidence.every((entry) => typeof entry === "string" && /^passed: .+/.test(entry))) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} must record only passed evidence entries.`);
    }
    if (!Array.isArray(assertion.artifactRefs) || assertion.artifactRefs.length === 0) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} is missing artifactRefs.`);
    } else {
      for (const artifactRef of assertion.artifactRefs) {
        if (!safeRelativePath(artifactRef)) {
          issues.push(`Desktop dogfood maturity assertion ${expected.id} artifactRef must be a safe relative path.`);
          break;
        }
      }
    }
    const capabilities = Array.isArray(assertion.capabilities) ? assertion.capabilities : [];
    if (!capabilities.some(nonEmptyString)) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} is missing capabilities.`);
    }
    for (const capability of expected.capabilities) {
      if (!capabilities.includes(capability)) {
        issues.push(`Desktop dogfood maturity assertion ${expected.id} is missing capability ${capability}.`);
      }
    }
  }
}

function validateDesktopApprovalFlow(approvalFlow, issues) {
  if (!approvalFlow || typeof approvalFlow !== "object" || Array.isArray(approvalFlow)) {
    issues.push("Desktop dogfood expanded state is missing approvalFlow proof.");
    return;
  }
  for (const field of [
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
  ]) {
    if (approvalFlow[field] !== true) {
      issues.push(`Desktop dogfood approvalFlow ${field} is not true.`);
    }
  }
  if (!Number.isInteger(approvalFlow.approvalButtons) || approvalFlow.approvalButtons < 2) {
    issues.push(`Desktop dogfood approvalFlow approvalButtons is ${approvalFlow.approvalButtons ?? "missing"}; expected at least 2.`);
  }
}

function validateDesktopApprovalForwarding(approvalForwarding, issues) {
  if (!approvalForwarding || typeof approvalForwarding !== "object" || Array.isArray(approvalForwarding)) {
    issues.push("Desktop dogfood artifact is missing approvalForwarding proof.");
    return;
  }
  for (const field of [
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
  ]) {
    if (approvalForwarding[field] !== true) {
      issues.push(`Desktop dogfood approvalForwarding ${field} is not true.`);
    }
  }
  if (approvalForwarding.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood approvalForwarding reports ${approvalForwarding.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopWorkflowExecution(workflowExecution, issues) {
  if (!workflowExecution || typeof workflowExecution !== "object" || Array.isArray(workflowExecution)) {
    issues.push("Desktop dogfood artifact is missing workflowExecution proof.");
    return;
  }
  for (const field of [
    "workflowSectionVisible",
    "taskVisible",
    "statusRunningVisible",
    "modeBlockingVisible",
    "sourceSymphonyVisible",
    "progressVisible",
    "telemetryVisible",
    "launchCardVisible",
    "parentThreadProvenanceVisible",
    "parentBlockerVisible",
    "mailboxBlockVisible",
    "taskIdVisible",
    "artifactIdVisible",
    "runIdVisible",
    "threadIdVisible",
    "pauseControlVisible",
    "cancelControlVisible",
    "openWorkflowThreadVisible",
    "horizontalOverflowFree",
  ]) {
    if (workflowExecution[field] !== true) {
      issues.push(`Desktop dogfood workflowExecution ${field} is not true.`);
    }
  }
  if (workflowExecution.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood workflowExecution reports ${workflowExecution.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopMutatingWorkerDogfood(mutatingWorkerDogfood, issues) {
  if (!mutatingWorkerDogfood || typeof mutatingWorkerDogfood !== "object" || Array.isArray(mutatingWorkerDogfood)) {
    issues.push("Desktop dogfood artifact is missing mutatingWorkerDogfood proof.");
    return;
  }
  for (const field of [
    "taskVisible",
    "statusSucceededVisible",
    "modeBackgroundVisible",
    "sourceSymphonyVisible",
    "childCallerVisible",
    "childRunVisible",
    "childThreadVisible",
    "approvalBridgeVisible",
    "isolatedWorktreeVisible",
    "nestedFanoutVisible",
    "mutatingWorkerLabelVisible",
    "stagedMutationVisible",
    "parentWorkspaceUnchangedVisible",
    "outputPreviewRetainedVisible",
    "artifactIdVisible",
    "runIdVisible",
    "threadIdVisible",
    "noPauseControlVisible",
    "noCancelControlVisible",
    "horizontalOverflowFree",
  ]) {
    if (mutatingWorkerDogfood[field] !== true) {
      issues.push(`Desktop dogfood mutatingWorkerDogfood ${field} is not true.`);
    }
  }
  if (mutatingWorkerDogfood.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood mutatingWorkerDogfood reports ${mutatingWorkerDogfood.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopWorkflowHighLoad(workflowHighLoad, issues) {
  if (!workflowHighLoad || typeof workflowHighLoad !== "object" || Array.isArray(workflowHighLoad)) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoad proof.");
    return;
  }
  for (const field of [
    "workflowSectionVisible",
    "expectedWorkflowRowCountVisible",
    "allPresetLabelsVisible",
    "highLoadTaskIdsVisible",
    "highLoadArtifactIdsVisible",
    "highLoadRunIdsVisible",
    "highLoadThreadIdsVisible",
    "backgroundRowsVisible",
    "completedRowsVisible",
    "highLoadRowsHaveNoPauseCancel",
    "horizontalOverflowFree",
  ]) {
    if (workflowHighLoad[field] !== true) {
      issues.push(`Desktop dogfood workflowHighLoad ${field} is not true.`);
    }
  }
  if (!Number.isInteger(workflowHighLoad.workflowRowCount) || workflowHighLoad.workflowRowCount < 6) {
    issues.push(`Desktop dogfood workflowHighLoad workflowRowCount is ${workflowHighLoad.workflowRowCount ?? "missing"}; expected at least 6.`);
  }
  if (workflowHighLoad.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood workflowHighLoad reports ${workflowHighLoad.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopDeniedScopeExplanation(deniedScopeExplanation, issues) {
  if (!deniedScopeExplanation || typeof deniedScopeExplanation !== "object" || Array.isArray(deniedScopeExplanation)) {
    issues.push("Desktop dogfood artifact is missing deniedScopeExplanation proof.");
    return;
  }
  for (const field of [
    "parentMailboxEventIdCaptured",
    "spawnFailureVisible",
    "approvalUnavailableVisible",
    "deniedCategoryVisible",
    "deniedToolVisible",
    "sourceChildVisible",
    "noInteractiveApprovalActions",
    "horizontalOverflowFree",
  ]) {
    if (deniedScopeExplanation[field] !== true) {
      issues.push(`Desktop dogfood deniedScopeExplanation ${field} is not true.`);
    }
  }
  if (deniedScopeExplanation.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood deniedScopeExplanation reports ${deniedScopeExplanation.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopLifecycleEdgeVisibility(lifecycleEdgeVisibility, issues) {
  if (!lifecycleEdgeVisibility || typeof lifecycleEdgeVisibility !== "object" || Array.isArray(lifecycleEdgeVisibility)) {
    issues.push("Desktop dogfood artifact is missing lifecycleEdgeVisibility proof.");
    return;
  }
  for (const field of [
    "parentMessageVisible",
    "clusterVisible",
    "clusterDefaultCollapsedBeforeOpen",
    "summaryVisible",
    "timeoutChildVisible",
    "partialChildVisible",
    "detachedChildVisible",
    "timeoutAttentionVisible",
    "timeoutChoicesVisible",
    "partialDecisionVisible",
    "partialSummaryVisible",
    "detachDecisionVisible",
    "detachedEffectVisible",
    "edgeIdentityCaptured",
    "horizontalOverflowFree",
  ]) {
    if (lifecycleEdgeVisibility[field] !== true) {
      issues.push(`Desktop dogfood lifecycleEdgeVisibility ${field} is not true.`);
    }
  }
  if (lifecycleEdgeVisibility.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood lifecycleEdgeVisibility reports ${lifecycleEdgeVisibility.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopMultiClusterStress(multiClusterStress, issues) {
  if (!multiClusterStress || typeof multiClusterStress !== "object" || Array.isArray(multiClusterStress)) {
    issues.push("Desktop dogfood artifact is missing multiClusterStress proof.");
    return;
  }
  for (const field of [
    "expectedClusterCountVisible",
    "allClustersDefaultCollapsed",
    "stressParentMessagesVisible",
    "stressSummariesVisible",
    "stressChildIdsCaptured",
    "stressClustersAfterParentMessages",
    "horizontalOverflowFree",
  ]) {
    if (multiClusterStress[field] !== true) {
      issues.push(`Desktop dogfood multiClusterStress ${field} is not true.`);
    }
  }
  if (!Number.isInteger(multiClusterStress.clusterCount) || multiClusterStress.clusterCount < 3) {
    issues.push(`Desktop dogfood multiClusterStress clusterCount is ${multiClusterStress.clusterCount ?? "missing"}; expected at least 3.`);
  }
  if (multiClusterStress.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood multiClusterStress reports ${multiClusterStress.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopRestartRehydration(restartRehydration, issues) {
  if (!restartRehydration || typeof restartRehydration !== "object" || Array.isArray(restartRehydration)) {
    issues.push("Desktop dogfood artifact is missing restartRehydration proof.");
    return;
  }
  for (const field of [
    "defaultCollapsedAfterRelaunch",
    "expandedAfterRelaunch",
    "parentMessageVisible",
    "approvalForwardedRehydrated",
    "approvalRequestRehydrated",
    "approvalActionsStillRemoved",
    "parentStillBlockedAfterRelaunch",
    "childBlockerRehydrated",
    "childRunIdRehydrated",
    "childThreadIdRehydrated",
    "completedChildResultSummaryRehydrated",
    "workflowTaskRehydrated",
    "workflowBlockerRehydrated",
    "workflowMailboxBlockRehydrated",
    "workflowArtifactRehydrated",
    "workflowRunRehydrated",
    "workflowThreadRehydrated",
    "mutatingWorkflowTaskRehydrated",
    "mutatingWorkflowArtifactRehydrated",
    "mutatingWorkflowRunRehydrated",
    "workflowHighLoadTasksRehydrated",
    "workflowHighLoadArtifactsRehydrated",
    "workflowHighLoadRunsRehydrated",
    "childRowsRehydrated",
    "horizontalOverflowFree",
  ]) {
    if (restartRehydration[field] !== true) {
      issues.push(`Desktop dogfood restartRehydration ${field} is not true.`);
    }
  }
  if (restartRehydration.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood restartRehydration reports ${restartRehydration.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopWorkflowRehydratedNavigation(workflowRehydratedNavigation, issues) {
  if (!workflowRehydratedNavigation || typeof workflowRehydratedNavigation !== "object" || Array.isArray(workflowRehydratedNavigation)) {
    issues.push("Desktop dogfood artifact is missing workflowRehydratedNavigation proof.");
    return;
  }
  for (const field of [
    "workflowAutomationPaneVisible",
    "workflowThreadHeaderVisible",
    "workflowThreadSidebarSelected",
    "workflowThreadTitleVisible",
    "workflowThreadFolderLinkPresent",
    "workflowThreadMatchesExpectedId",
    "legacyOrThreadPaneVisible",
    "navigationErrorAbsent",
    "horizontalOverflowFree",
  ]) {
    if (workflowRehydratedNavigation[field] !== true) {
      issues.push(`Desktop dogfood workflowRehydratedNavigation ${field} is not true.`);
    }
  }
  if (workflowRehydratedNavigation.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood workflowRehydratedNavigation reports ${workflowRehydratedNavigation.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopWorkflowArtifactRehydration(workflowArtifactRehydration, issues) {
  if (!workflowArtifactRehydration || typeof workflowArtifactRehydration !== "object" || Array.isArray(workflowArtifactRehydration)) {
    issues.push("Desktop dogfood artifact is missing workflowArtifactRehydration proof.");
    return;
  }
  for (const field of [
    "workflowBuildWorkspaceVisible",
    "sourcePanelSelected",
    "artifactTitleVisible",
    "activeWorkflowThreadVisible",
    "artifactIdMatchesLinkedThread",
    "runDetailLoaded",
    "sourcePathVisible",
    "statePathVisible",
    "sourceContentVisible",
    "sourceContentMatchesExpected",
    "noSourceReadError",
    "detailSourcePathMatches",
    "detailStatePathMatches",
    "horizontalOverflowFree",
  ]) {
    if (workflowArtifactRehydration[field] !== true) {
      issues.push(`Desktop dogfood workflowArtifactRehydration ${field} is not true.`);
    }
  }
  if (workflowArtifactRehydration.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood workflowArtifactRehydration reports ${workflowArtifactRehydration.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopLocalRuntimeOwnership(localRuntimeOwnership, issues) {
  if (!localRuntimeOwnership || typeof localRuntimeOwnership !== "object" || Array.isArray(localRuntimeOwnership)) {
    issues.push("Desktop dogfood artifact is missing localRuntimeOwnership proof.");
    return;
  }
  for (const field of [
    "settingsPanelVisible",
    "localModelsSectionVisible",
    "runtimeInventoryVisible",
    "activeLeaseVisible",
    "ownerLabelVisible",
    "managedRunningVisible",
    "localTextCapabilityVisible",
    "stopDisabledVisible",
    "restartDisabledVisible",
    "forceConsequenceVisible",
    "blockerLeaseVisible",
    "affectedSubagentVisible",
    "childRunIdVisible",
    "childThreadIdVisible",
    "runtimeIdVisible",
    "pidVisible",
    "endpointVisible",
    "ordinaryStopReasonVisible",
    "untrackedRuntimeVisible",
    "untrackedRuntimeIdVisible",
    "untrackedRuntimePidVisible",
    "untrackedRuntimeEndpointVisible",
    "untrackedRuntimeModelVisible",
    "untrackedStopDisabledVisible",
    "untrackedRestartDisabledVisible",
    "untrackedForceUnavailableVisible",
    "untrackedExternalStopGuidanceVisible",
    "untrackedGroupSafeVisible",
    "horizontalOverflowFree",
  ]) {
    if (localRuntimeOwnership[field] !== true) {
      issues.push(`Desktop dogfood localRuntimeOwnership ${field} is not true.`);
    }
  }
  if (localRuntimeOwnership.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood localRuntimeOwnership reports ${localRuntimeOwnership.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopOperatorControls(operatorControls, state, issues) {
  if (!operatorControls || typeof operatorControls !== "object" || Array.isArray(operatorControls)) {
    issues.push(`Desktop dogfood ${state} state is missing operatorControls proof.`);
    return;
  }
  for (const field of [
    "cancelActionVisible",
    "closeAttentionChildVisible",
    "closeCompletedChildVisible",
    "cancelScopedToAttentionChild",
    "noCancelForCompletedChild",
    "closeTitlesPreserveTranscripts",
    "controlsUseIconButtons",
    "controlsNameChild",
    "controlsNotDisabled",
  ]) {
    if (operatorControls[field] !== true) {
      issues.push(`Desktop dogfood ${state} operatorControls ${field} is not true.`);
    }
  }
  if (operatorControls.cancelButtons !== 1) {
    issues.push(`Desktop dogfood ${state} operatorControls cancelButtons is ${operatorControls.cancelButtons ?? "missing"}; expected 1.`);
  }
  if (operatorControls.closeButtons !== 2) {
    issues.push(`Desktop dogfood ${state} operatorControls closeButtons is ${operatorControls.closeButtons ?? "missing"}; expected 2.`);
  }
}

function validateDesktopOperatorBehavior(operatorBehavior, issues) {
  if (!operatorBehavior || typeof operatorBehavior !== "object" || Array.isArray(operatorBehavior)) {
    issues.push("Desktop dogfood artifact is missing operatorBehavior proof.");
    return;
  }
  for (const field of [
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
  ]) {
    if (operatorBehavior[field] !== true) {
      issues.push(`Desktop dogfood operatorBehavior ${field} is not true.`);
    }
  }
  if (operatorBehavior.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood operatorBehavior reports ${operatorBehavior.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

function validateDesktopInlineChildTranscripts(checks, issues) {
  validateDesktopRunningChildTranscript(objectValue(checks.childTranscript), issues);
  validateDesktopCompletedChildTranscript(objectValue(checks.completedChildTranscript), issues);
}

function validateDesktopRunningChildTranscript(childTranscript, issues) {
  for (const field of [
    "childExpanded",
    "transcriptPanelVisible",
    "liveTranscriptShellVisible",
    "liveTranscriptStreamVisible",
    "liveTranscriptStatusVisible",
    "liveTranscriptMessageCountVisible",
    "liveTranscriptRuntimeEventCountVisible",
    "liveTranscriptMessageCountMatchesBubbles",
    "liveTranscriptRuntimeEventCountPositive",
    "runtimeEventRailVisible",
    "runtimeEventRailHasRecentEvents",
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
  ]) {
    if (childTranscript[field] !== true) {
      issues.push(`Desktop dogfood childTranscript ${field} is not true.`);
    }
  }
  if (childTranscript.childTranscriptTerminal !== false) {
    issues.push("Desktop dogfood childTranscript childTranscriptTerminal must be false while the child is running.");
  }
  if (childTranscript.completionEndCapVisible !== false) {
    issues.push("Desktop dogfood childTranscript completionEndCapVisible must be false while the child is running.");
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
}

function validateDesktopCompletedChildTranscript(completedChildTranscript, issues) {
  for (const field of [
    "childExpanded",
    "transcriptPanelVisible",
    "liveTranscriptShellVisible",
    "liveTranscriptStreamVisible",
    "liveTranscriptStatusVisible",
    "liveTranscriptMessageCountVisible",
    "liveTranscriptMessageCountMatchesBubbles",
    "assistantMessageVisible",
    "siblingSummaryNotLeakedIntoTranscript",
    "childRunIdVisible",
    "childThreadIdVisible",
    "childTranscriptTerminal",
    "childTranscriptSynthesisSafe",
    "completionEndCapVisible",
    "completionEndCapAfterMessages",
    "completionSummaryDeferredWhileLive",
    "transcriptEndStateCorrect",
    "summaryNotObscuringTranscript",
    "horizontalOverflowFree",
  ]) {
    if (completedChildTranscript[field] !== true) {
      issues.push(`Desktop dogfood completedChildTranscript ${field} is not true.`);
    }
  }
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

function requireLabels(labels, expected, state, issues) {
  const labelMap = labels && typeof labels === "object" ? labels : {};
  for (const label of expected) {
    if (labelMap[label] !== true) {
      issues.push(`Desktop dogfood ${state} labels are missing ${label}.`);
    }
  }
}

function liveConfidenceArtifactCheck(artifact, options) {
  const validation = isValidLiveConfidenceArtifact(artifact);
  const freshness = artifactFreshness(artifact?.completedAt ?? artifact?.startedAt, options);
  const expectedSliceIssues = artifact && validation.valid && options.expectedSliceKind && artifact.sliceKind !== options.expectedSliceKind
    ? [`Live confidence artifact sliceKind is ${artifact.sliceKind}; expected ${options.expectedSliceKind}.`]
    : [];
  const maturityAssertionIssues = artifact && options.expectedMaturityAssertions
    ? liveConfidenceMaturityAssertionIssues(artifact, options.expectedMaturityAssertions)
    : [];
  const acceptanceIssues = artifact && validation.valid && artifact.status !== "passed"
    ? [`Live confidence artifact status is ${artifact.status}; acceptance is advisory_only.`]
    : [];
  const issues = [...validation.issues, ...expectedSliceIssues, ...maturityAssertionIssues, ...freshness.issues, ...acceptanceIssues];
  const id = options.id ?? "artifact.live-confidence";
  const label = options.label ?? "per-slice sub-agent live confidence evidence is present when available";
  const missingPath = options.missingPath ?? "test-results/subagent-live-confidence/latest.json";
  if (!artifact) {
    const issue = options.requireLive
      ? (options.missingRequiredIssue ?? "Sub-agent live confidence evidence is required but missing.")
      : (options.missingSkippedIssue ?? "Sub-agent live confidence evidence was skipped for this deterministic gate run.");
    return check({
      id,
      area: "artifacts",
      status: options.requireLive ? "failed" : "advisory",
      label,
      evidence: [`missing ${missingPath}`],
      issues: options.requireLive ? [issue] : [],
      warnIssues: options.requireLive ? [] : [issue],
    });
  }
  return check({
    id,
    area: "artifacts",
    status: issues.length ? (options.requireLive ? "failed" : "advisory") : "passed",
    label,
    evidence: [
      `path: ${artifact.__artifactPath ?? missingPath}`,
      `slice: ${artifact.sliceId ?? "missing"}`,
      `kind: ${artifact.sliceKind ?? "missing"}`,
      `status: ${artifact.status ?? "missing"}`,
      `confidenceDelta: ${artifact.confidenceDelta ?? "missing"}`,
      `closeoutAnswer: ${artifact.closeoutAnswer?.kind ?? "missing"}`,
      `provider: ${artifact.provider?.providerId ?? artifact.provider?.kind ?? "missing"}`,
      ...liveConfidenceMaturityAssertionEvidence(artifact, options.expectedMaturityAssertions),
      ...freshness.evidence,
    ],
    issues: options.requireLive ? issues : [],
    warnIssues: options.requireLive ? [] : issues,
  });
}

function liveConfidenceMaturityAssertionIssues(artifact, expectedAssertions) {
  const issues = [];
  const assertions = Array.isArray(artifact.maturityAssertions) ? artifact.maturityAssertions : [];
  if (!Array.isArray(artifact.maturityAssertions)) {
    issues.push("Live confidence artifact is missing maturityAssertions.");
  }
  const topLevelCapabilities = new Set(Array.isArray(artifact.capabilitiesObserved) ? artifact.capabilitiesObserved : []);
  for (const [index, assertion] of assertions.entries()) {
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      issues.push(`Live confidence maturity assertion ${index} must be an object.`);
      continue;
    }
    if (!nonEmptyString(assertion.id)) issues.push(`Live confidence maturity assertion ${index} is missing id.`);
    if (!nonEmptyString(assertion.label)) issues.push(`Live confidence maturity assertion ${assertion.id ?? index} is missing label.`);
    if (!["passed", "failed", "blocked", "skipped"].includes(assertion.status)) {
      issues.push(`Live confidence maturity assertion ${assertion.id ?? index} status is ${assertion.status ?? "missing"}.`);
    }
    if (!safeRelativePath(assertion.artifactPath)) {
      issues.push(`Live confidence maturity assertion ${assertion.id ?? index} artifactPath must be a safe relative path.`);
    }
    const evidence = Array.isArray(assertion.evidence) ? assertion.evidence : [];
    if (!evidence.some(nonEmptyString)) {
      issues.push(`Live confidence maturity assertion ${assertion.id ?? index} is missing readable evidence.`);
    }
    const capabilities = Array.isArray(assertion.capabilities) ? assertion.capabilities : [];
    if (!capabilities.some(nonEmptyString)) {
      issues.push(`Live confidence maturity assertion ${assertion.id ?? index} is missing capabilities.`);
    }
  }

  for (const expected of expectedAssertions) {
    const assertion = assertions.find((item) => item?.id === expected.id);
    if (!assertion) {
      issues.push(`Live confidence maturity assertion ${expected.id} is missing.`);
      continue;
    }
    if (assertion.status !== "passed") {
      issues.push(`Live confidence maturity assertion ${expected.id} status is ${assertion.status ?? "missing"}; expected passed.`);
    }
    const capabilities = new Set(Array.isArray(assertion.capabilities) ? assertion.capabilities : []);
    for (const capability of expected.capabilities ?? []) {
      if (!capabilities.has(capability)) {
        issues.push(`Live confidence maturity assertion ${expected.id} is missing capability ${capability}.`);
      }
      if (!topLevelCapabilities.has(capability)) {
        issues.push(`Live confidence artifact capabilitiesObserved is missing ${capability}.`);
      }
    }
  }
  return issues;
}

function liveConfidenceMaturityAssertionEvidence(artifact, expectedAssertions = []) {
  if (!expectedAssertions.length) return [];
  const assertions = Array.isArray(artifact?.maturityAssertions) ? artifact.maturityAssertions : [];
  return expectedAssertions.map((expected) => {
    const assertion = assertions.find((item) => item?.id === expected.id);
    return `maturityAssertion:${expected.id}:${assertion?.status ?? "missing"}`;
  });
}

function isValidLiveConfidenceArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-subagent-live-confidence-evidence-v3") {
    issues.push(`Live confidence artifact schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (!artifact.sliceId) issues.push("Live confidence artifact is missing sliceId.");
  const sliceKinds = ["pi_tool_prompt", "child_authority", "workflow_symphony", "workflow_symphony_broader", "local_runtime", "restart_repair", "lifecycle_edges", "desktop_dogfood", "deterministic_only"];
  if (!sliceKinds.includes(artifact.sliceKind)) {
    issues.push(`Live confidence artifact sliceKind is ${artifact.sliceKind ?? "missing"}.`);
  }
  const statuses = ["passed", "blocked", "failed", "skipped"];
  if (!statuses.includes(artifact.status)) {
    issues.push(`Live confidence artifact status is ${artifact.status ?? "missing"}.`);
  }
  if (!nonEmptyString(artifact.hypothesis)) issues.push("Live confidence artifact is missing hypothesis.");
  if (!nonEmptyString(artifact.expectedObservation)) issues.push("Live confidence artifact is missing expectedObservation.");
  if (!nonEmptyString(artifact.actualOutcome)) issues.push("Live confidence artifact is missing actualOutcome.");
  if (!["increased", "unchanged", "decreased", "not_applicable"].includes(artifact.confidenceDelta)) {
    issues.push(`Live confidence artifact confidenceDelta is ${artifact.confidenceDelta ?? "missing"}.`);
  }
  if (!nonEmptyString(artifact.followUp)) issues.push("Live confidence artifact is missing followUp.");
  const closeoutKind = artifact.closeoutAnswer?.kind;
  if (!["saw_live", "blocked", "no_live_surface"].includes(closeoutKind)) {
    issues.push(`Live confidence artifact closeoutAnswer.kind is ${closeoutKind ?? "missing"}.`);
  }
  if (!nonEmptyString(artifact.closeoutAnswer?.summary)) {
    issues.push("Live confidence artifact closeoutAnswer.summary is missing.");
  }
  const providerKind = artifact.provider?.kind;
  if (!["gmi-cloud", "ambient", "local", "custom", "none"].includes(providerKind)) {
    issues.push(`Live confidence artifact provider.kind is ${providerKind ?? "missing"}.`);
  }
  const nonDeterministic = artifact.sliceKind !== "deterministic_only";
  if (nonDeterministic && artifact.status === "passed" && artifact.featureFlagSnapshot?.ambientSubagentsEnabled !== true) {
    issues.push("Passed live confidence artifact must prove ambient.subagents was enabled.");
  }
  const artifacts = Array.isArray(artifact.artifacts) ? artifact.artifacts : [];
  if (["passed", "failed", "blocked"].includes(artifact.status) && artifacts.length === 0) {
    issues.push(`Live confidence artifact with status ${artifact.status} must include at least one artifact reference.`);
  }
  const classifiedBlockers = Array.isArray(artifact.classifiedBlockers) ? artifact.classifiedBlockers : [];
  if (artifact.status === "blocked" && classifiedBlockers.length === 0) {
    issues.push("Blocked live confidence artifact must include at least one classifiedBlocker.");
  }
  if (classifiedBlockers.some((blocker) => !blocker?.summary || typeof blocker?.classifiedAsEnvironmental !== "boolean")) {
    issues.push("Live confidence artifact classifiedBlockers must include summary and classifiedAsEnvironmental.");
  }
  const productIssues = Array.isArray(artifact.productIssues) ? artifact.productIssues : [];
  if (artifact.status === "failed" && productIssues.length === 0) {
    issues.push("Failed live confidence artifact must include at least one productIssue.");
  }
  if (artifact.status === "passed" && productIssues.some((issue) => issue?.severity === "p0" || issue?.severity === "p1")) {
    issues.push("Passed live confidence artifact cannot carry p0/p1 product issues.");
  }
  if (artifact.status === "skipped" && !artifact.skipReason) {
    issues.push("Skipped live confidence artifact must include skipReason.");
  }
  if (["passed", "failed"].includes(artifact.status) && closeoutKind && closeoutKind !== "saw_live") {
    issues.push(`Live confidence artifact status ${artifact.status} must use closeoutAnswer.kind saw_live.`);
  }
  if (artifact.status === "blocked" && closeoutKind && closeoutKind !== "blocked") {
    issues.push("Blocked live confidence artifact must use closeoutAnswer.kind blocked.");
  }
  if (artifact.status === "skipped" && closeoutKind && closeoutKind !== "no_live_surface") {
    issues.push("Skipped live confidence artifact must use closeoutAnswer.kind no_live_surface.");
  }
  const secretPaths = secretLikeStringPaths(artifact);
  if (secretPaths.length) {
    issues.push(`Live confidence artifact appears to contain secret-like material at ${secretPaths.slice(0, 3).join(", ")}.`);
  }
  return { valid: issues.length === 0, issues };
}

function secretLikeStringPaths(value) {
  const paths = [];
  const seen = new Set();
  visit(value, "$");
  return paths;

  function visit(current, path) {
    if (!current || paths.length >= 10) return;
    if (typeof current === "string") {
      if (looksSecretLike(current)) paths.push(path);
      return;
    }
    if (typeof current !== "object" || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      visit(child, `${path}.${key}`);
    }
  }
}

function looksSecretLike(value) {
  return /\b(?:GMI_CLOUD_API_KEY|GMI_API_KEY|AMBIENT_API_KEY)\b\s*[:=]\s*["']?[^"'\s$]{8,}/i.test(value) ||
    /\bapi[_-]?key\b\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i.test(value) ||
    /\bsk-[A-Za-z0-9_-]{16,}\b/.test(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.some(nonEmptyString);
}

function allNonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function arrayIncludesAll(value, expected) {
  return Array.isArray(value) && expected.every((item) => value.includes(item));
}

function isWorkflowMutationPolicy(value) {
  return value === "read_only" || value === "staged_until_approved" || value === "apply_after_approval";
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function nonNegativeCount(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function sha256Hex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function safeRelativePath(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.split("/").some((part) => part === "" || part === "..");
}

function artifactFreshness(timestamp, options) {
  if (!timestamp) return { evidence: ["ageHours: unknown"], issues: ["Artifact timestamp is missing."] };
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return { evidence: [`timestamp: ${timestamp}`], issues: [`Artifact timestamp is invalid: ${timestamp}.`] };
  }
  const ageHours = Math.round(((options.now.getTime() - parsed.getTime()) / 3_600_000) * 100) / 100;
  const issues = [];
  if (ageHours > options.maxArtifactAgeHours) {
    issues.push(`Artifact is stale: ${ageHours} hours old; max is ${options.maxArtifactAgeHours}.`);
  }
  if (ageHours < -0.1) {
    issues.push(`Artifact timestamp is from the future by ${Math.abs(ageHours)} hours.`);
  }
  return { evidence: [`ageHours: ${ageHours}`], issues };
}

function nextSlice({ blockingIssues, advisoryIssues, requireLive }) {
  if (blockingIssues.length) {
    return "Fix the blocking sub-agent release-gate issue(s), rerun deterministic replay diagnostics, and re-run the gate before merging more maturity-sensitive behavior.";
  }
  if (!requireLive && advisoryIssues.length) {
    return "Deterministic sub-agent release gate is green; run pnpm run test:subagents:release-gate:live before release-critical changes, and pnpm run test:subagents:release-gate:graduation before feature-flag graduation.";
  }
  return "Sub-agent maturity gate evidence is green for this policy; continue with the next scoped implementation phase from origin/main.";
}

function check(input) {
  return {
    id: input.id,
    area: input.area,
    status: input.status,
    label: input.label,
    evidence: input.evidence ?? [],
    issues: input.issues ?? [],
    warnIssues: input.warnIssues ?? [],
  };
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function positiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", "<br>");
}
