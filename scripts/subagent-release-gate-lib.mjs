import { SUBAGENT_LIVE_EVIDENCE_DECISIONS } from "./subagent-live-evidence-lanes.mjs";
import { REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS } from "./subagent-live-history-report-lib.mjs";
import {
  desktopDogfoodArtifactCheck,
  desktopDogfoodHistoryReportCheck,
  isValidDesktopDogfoodArtifact,
  isValidDesktopDogfoodHistoryReport,
} from "./subagent-release-gate-desktop-artifacts.mjs";
import { buildSubagentReleaseGateSourceChecks } from "./subagent-release-gate-source-checks.mjs";
import {
  callableWorkflowDogfoodArtifactCheck,
  callableWorkflowRehydrationArtifactCheck,
  lifecycleEdgeArtifactCheck,
  replayDiagnosticsArtifactCheck,
} from "./subagent-release-gate-workflow-artifact-checks.mjs";
import {
  artifactFreshness,
  check,
  escapeMarkdownCell,
  nonEmptyString,
  nonNegativeCount,
  objectValue,
  positiveInteger,
  positiveNumber,
  safeRelativePath,
  secretLikeStringPaths,
} from "./subagent-release-gate-validation-helpers.mjs";

const DEFAULT_MAX_ARTIFACT_AGE_HOURS = 24;
const REQUIRED_LIVE_HISTORY_GRADUATION_RUNS = 25;
const REQUIRED_LIVE_HISTORY_MAX_FAILURE_RATE = 0.05;
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
  "src/main/workflow-compiler/workflowCompilerServicePromptTransport.test.ts",
  "src/main/agent-runtime/agentRuntimeCallableWorkflowBridge.test.ts",
  "src/main/agent-runtime/agentRuntimeCallableWorkflowTools.test.ts",
  "src/main/agent-runtime/ambient-workflow/agentRuntimeAmbientWorkflowReadOnlyTools.test.ts",
  "src/main/callable-workflow/callableWorkflowParentBlocking.test.ts",
  "src/main/agent-runtime/agentRuntimeFinalizationBlocking.test.ts",
  "src/main/workflow/workflowAgentRuntime.test.ts",
  "src/main/model-provider/modelRuntimeRegistry.test.ts",
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
  "src/main/projectStore/projectStoreSubagentCreationLifecycle.test.ts",
  "src/main/projectStore/projectStoreSubagentRetentionParentStop.test.ts",
  "src/main/subagents/subagentPiTools.test.ts",
  "src/main/subagents/subagentPiToolsWaitSynthesis.test.ts",
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
  return [...scriptChecks(scripts), deterministicSuiteCoverageCheck(scripts), liveHarnessRoutingCheck(scripts)];
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
      expectedMaturityAssertions: [
        {
          id: "child_long_context_authority",
          capabilities: ["delegated_tool_authority", "long_context_authority_roots", "document_root_inheritance", "secret_non_leakage"],
        },
        {
          id: "child_file_approval_authority",
          capabilities: [
            "parent_approval_forwarding",
            "child_approval_pause",
            "parent_blocking_resume",
            "child_scoped_approval",
            "secret_non_leakage",
          ],
        },
        {
          id: "child_browser_approval_authority",
          capabilities: [
            "browser_authority",
            "parent_approval_forwarding",
            "child_approval_pause",
            "parent_blocking_resume",
            "child_scoped_approval",
            "browser_approval_resume",
          ],
        },
      ],
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
      expectedMaturityAssertions: [
        {
          id: "live_workflow_run",
          capabilities: ["workflow_launch", "ambient_runtime_call", "artifact_link", "checkpoint_output"],
        },
        {
          id: "broader_workflow_ui_dogfood",
          capabilities: [
            "broader_live_workflow_runs",
            "workflow_agent_ui_dogfood",
            "workflow_output_evidence",
            "electron_workflow_dogfood",
          ],
        },
        {
          id: "child_mutating_workflow",
          capabilities: [
            "mutating_child_workflow",
            "child_scoped_approval",
            "isolated_child_worktree",
            "parent_blocking_workflow",
            "denied_workflow_scope",
          ],
        },
        {
          id: "workflow_task_artifact_rehydration",
          capabilities: ["workflow_task_rehydration", "artifact_link", "checkpoint_output"],
        },
      ],
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
      expectedMaturityAssertions: [
        {
          id: "live_workflow_run",
          capabilities: ["workflow_launch", "ambient_runtime_call", "artifact_link", "checkpoint_output"],
        },
        {
          id: "broader_workflow_ui_dogfood",
          capabilities: [
            "broader_live_workflow_runs",
            "workflow_agent_ui_dogfood",
            "workflow_output_evidence",
            "electron_workflow_dogfood",
          ],
        },
        {
          id: "child_mutating_workflow",
          capabilities: [
            "mutating_child_workflow",
            "child_scoped_approval",
            "isolated_child_worktree",
            "parent_blocking_workflow",
            "denied_workflow_scope",
          ],
        },
        {
          id: "workflow_task_artifact_rehydration",
          capabilities: ["workflow_task_rehydration", "artifact_link", "checkpoint_output"],
        },
      ],
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
      expectedMaturityAssertions: [
        {
          id: "local_runtime_active_lease_stop_blocker",
          capabilities: ["local_runtime_lease_ownership", "lease_stop_blocker"],
        },
        {
          id: "local_runtime_untracked_safety",
          capabilities: ["untracked_runtime_safety"],
        },
        {
          id: "local_runtime_stale_lease_recovery",
          capabilities: ["stale_lease_recovery"],
        },
        {
          id: "local_runtime_provider_lifecycle",
          capabilities: ["provider_lifecycle", "stopped_provider_display", "non_destructive_stop"],
        },
        {
          id: "local_runtime_proof_gate",
          capabilities: ["proof_gate_clean"],
        },
      ],
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
      expectedMaturityAssertions: [
        {
          id: "restart_repair_runtime_event_replay",
          capabilities: ["runtime_event_replay"],
        },
        {
          id: "restart_repair_child_tree_repair",
          capabilities: ["restart_rehydration", "child_thread_repair", "wait_barrier_repair"],
        },
        {
          id: "restart_repair_mailbox_rehydration",
          capabilities: ["parent_mailbox_replay", "mailbox_state_rehydration"],
        },
        {
          id: "restart_repair_artifact_pointer_rehydration",
          capabilities: ["artifact_pointer_rehydration"],
        },
        {
          id: "restart_repair_lifecycle_edge_coverage",
          capabilities: ["restart_edge", "stop_edge", "detach_edge", "cancel_edge", "retry_edge", "timeout_edge", "partial_result_edge"],
        },
        {
          id: "restart_repair_synthesis_safety",
          capabilities: ["synthesis_safety"],
        },
      ],
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
      expectedMaturityAssertions: [
        {
          id: "lifecycle_edge_restart",
          capabilities: ["restart_edge"],
        },
        {
          id: "lifecycle_edge_stop",
          capabilities: ["stop_edge"],
        },
        {
          id: "lifecycle_edge_detach",
          capabilities: ["detach_edge"],
        },
        {
          id: "lifecycle_edge_cancel",
          capabilities: ["cancel_edge"],
        },
        {
          id: "lifecycle_edge_retry",
          capabilities: ["retry_edge"],
        },
        {
          id: "lifecycle_edge_timeout",
          capabilities: ["timeout_edge"],
        },
        {
          id: "lifecycle_edge_partial_result",
          capabilities: ["partial_result_edge"],
        },
        {
          id: "lifecycle_edge_synthesis_safety",
          capabilities: ["synthesis_safety"],
        },
      ],
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
      expectedMaturityAssertions: [
        {
          id: "desktop_dogfood_scenario_coverage",
          capabilities: [
            "electron_desktop_dogfood",
            "default_collapsed_state",
            "approval_parent_blocking",
            "workflow_execution_parent_blocking",
            "workflow_high_load_dogfood",
          ],
        },
        {
          id: "desktop_dogfood_visual_layout",
          capabilities: ["production_ui_visibility", "layout_safety", "visual_layout_safety"],
        },
        {
          id: "desktop_dogfood_lifecycle_edges",
          capabilities: ["lifecycle_edge_desktop_behavior", "timeout_edge", "partial_result_edge", "retry_edge", "detach_edge"],
        },
        {
          id: "desktop_dogfood_runtime_and_operator_controls",
          capabilities: [
            "local_runtime_lease_ownership",
            "lease_stop_blocker",
            "untracked_runtime_safety",
            "operator_child_controls",
            "operator_control_behavior",
          ],
        },
      ],
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
    }),
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
    ...report.checks.map(
      (check) =>
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
  return SUBAGENT_LIVE_EVIDENCE_DECISIONS.filter(([field]) => decision[field] !== false).map(([, label]) => label);
}

function liveEvidenceDecisionLines(decision) {
  return SUBAGENT_LIVE_EVIDENCE_DECISIONS.map(([field, label]) => `- ${label}: ${decision?.[field] === false ? "present" : "skipped"}`);
}

export function buildSubagentReleaseGateLiveHistoryEntry(report, options = {}) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const decision = report?.releaseDecision && typeof report.releaseDecision === "object" ? report.releaseDecision : {};
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
    liveEvidence: Object.fromEntries(
      SUBAGENT_LIVE_EVIDENCE_DECISIONS.map(([field, label]) => [label, decision[field] === false ? "present" : "skipped"]),
    ),
    skippedLiveEvidence: skippedLiveEvidenceLabels(decision),
    blockingIssueCount: Array.isArray(decision.blockingIssues) ? decision.blockingIssues.length : 0,
    advisoryIssueCount: Array.isArray(decision.advisoryIssues) ? decision.advisoryIssues.length : 0,
    nextSlice: decision.nextSlice,
  };
}

function liveHistoryRunId(timestamp) {
  return nonEmptyString(timestamp) ? timestamp.replace(/[^a-zA-Z0-9._-]+/g, "-") : `unknown-${Date.now()}`;
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
  const deterministicScript = typeof scripts["test:subagents:deterministic"] === "string" ? scripts["test:subagents:deterministic"] : "";
  const releaseGateScript = typeof scripts["test:subagents:release-gate"] === "string" ? scripts["test:subagents:release-gate"] : "";
  const liveReleaseGateScript =
    typeof scripts["test:subagents:release-gate:live"] === "string" ? scripts["test:subagents:release-gate:live"] : "";
  const graduationReleaseGateScript =
    typeof scripts["test:subagents:release-gate:graduation"] === "string" ? scripts["test:subagents:release-gate:graduation"] : "";
  const workflowJitterReleaseProfileGateScript =
    typeof scripts["test:workflow-jitter-release-gate:release-profile"] === "string"
      ? scripts["test:workflow-jitter-release-gate:release-profile"]
      : "";
  const missingTests = REQUIRED_DETERMINISTIC_TEST_FILES.filter((file) => !deterministicScript.includes(file));
  const missingDelegates = [
    ["test:subagents:release-gate", releaseGateScript],
    ["test:subagents:release-gate:live", liveReleaseGateScript],
    ["test:subagents:release-gate:graduation", graduationReleaseGateScript],
  ]
    .filter(([, script]) => !script.includes(DETERMINISTIC_SUITE_COMMAND))
    .map(([name]) => name);
  const liveReleaseGateRunsDesktopDogfood =
    liveReleaseGateScript.includes("pnpm run test:subagents:desktop-dogfood") ||
    liveReleaseGateScript.includes("pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked");
  const missingLiveDesktopDogfood = liveReleaseGateRunsDesktopDogfood
    ? []
    : [
        "test:subagents:release-gate:live must run Desktop dogfood directly or through pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked.",
      ];
  const missingLiveReleaseGateCommands = REQUIRED_LIVE_RELEASE_GATE_COMMANDS.filter((command) => !liveReleaseGateScript.includes(command));
  const missingGraduationReleaseGateCommands = [
    ...REQUIRED_LIVE_RELEASE_GATE_COMMANDS.filter((command) => !graduationReleaseGateScript.includes(command)).map(
      (command) => `test:subagents:release-gate:graduation must run ${command}.`,
    ),
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
  const missingWorkflowJitterReleaseProfileRunner = workflowJitterReleaseProfileGateScript.includes(
    "scripts/workflow-jitter-release-profile-gate.mjs",
  )
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
  const desktopScript = typeof scripts["test:subagents:desktop-dogfood"] === "string" ? scripts["test:subagents:desktop-dogfood"] : "";
  evidence.push(
    `test:subagents:desktop-dogfood: ${desktopScript.includes("scripts/run-electron-dogfood.mjs") ? "harnessed" : "unharnessed"}`,
  );
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
  const failureIssues =
    status === "passed" ? [] : [`Harness manifest ${artifact.__artifactPath ?? options.missingPath} ended with ${status}.`];
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
  if (!runtimeEvents.some((event) => event?.type === "assistant_delta"))
    issues.push("Live smoke artifact is missing child assistant_delta stream event.");
  if (!runtimeEvents.some((event) => event?.type === "completed"))
    issues.push("Live smoke artifact is missing child runtime completed event.");
  if (!String(artifact.childAssistantText ?? "").includes("SUBAGENT_CHILD_DONE")) {
    issues.push("Live smoke artifact is missing the child completion sentinel.");
  }
  if (!String(artifact.assistantText ?? "").includes("SUBAGENT_LIVE_DONE")) {
    issues.push("Live smoke artifact is missing the parent completion sentinel.");
  }
  return { valid: issues.length === 0, issues };
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
    issues.push(
      `Sub-agent live history report criteria.minLiveDogfoodRuns is ${criteria.minLiveDogfoodRuns}; expected at least ${REQUIRED_LIVE_HISTORY_GRADUATION_RUNS} for graduation.`,
    );
  }
  if (
    typeof criteria.maxLiveDogfoodFailureRate !== "number" ||
    criteria.maxLiveDogfoodFailureRate < 0 ||
    criteria.maxLiveDogfoodFailureRate > 1
  ) {
    issues.push("Sub-agent live history report criteria.maxLiveDogfoodFailureRate must be a rate.");
  } else if (criteria.maxLiveDogfoodFailureRate > REQUIRED_LIVE_HISTORY_MAX_FAILURE_RATE) {
    issues.push(
      `Sub-agent live history report criteria.maxLiveDogfoodFailureRate is ${criteria.maxLiveDogfoodFailureRate}; expected at most ${REQUIRED_LIVE_HISTORY_MAX_FAILURE_RATE} for graduation.`,
    );
  }
  if (nonNegativeCount(summary.cleanRequiredRunCount) < nonNegativeCount(criteria.minLiveDogfoodRuns)) {
    issues.push(
      `Sub-agent live history report has ${nonNegativeCount(summary.cleanRequiredRunCount)} clean required-live runs; expected ${nonNegativeCount(criteria.minLiveDogfoodRuns)}.`,
    );
  }
  if (typeof summary.failureRate !== "number" || summary.failureRate > criteria.maxLiveDogfoodFailureRate) {
    issues.push(
      `Sub-agent live history report failureRate is ${summary.failureRate ?? "missing"}; max is ${criteria.maxLiveDogfoodFailureRate ?? "missing"}.`,
    );
  }
  if (summary.livePiSmokePassed !== true) {
    issues.push("Sub-agent live history report must include passing Ambient/Pi smoke evidence.");
  }
  if (
    nonNegativeCount(summary.skippedEvidenceRunCount) > 0 &&
    nonNegativeCount(summary.cleanRequiredRunCount) < REQUIRED_LIVE_HISTORY_GRADUATION_RUNS
  ) {
    issues.push(
      `Sub-agent live history report has ${nonNegativeCount(summary.skippedEvidenceRunCount)} skipped-evidence row(s) before graduation volume is satisfied.`,
    );
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
      issues.push(
        `Sub-agent live history report evidence lane ${label} has ${nonNegativeCount(lane.presentRunCount)} present row(s); expected ${minPresentRuns}.`,
      );
    }
    if (lane.latestStatus !== "present") {
      issues.push(
        `Sub-agent live history report evidence lane ${label} latestStatus is ${lane.latestStatus ?? "missing"}; expected present.`,
      );
    }
  }
}

function liveConfidenceArtifactCheck(artifact, options) {
  const validation = isValidLiveConfidenceArtifact(artifact);
  const freshness = artifactFreshness(artifact?.completedAt ?? artifact?.startedAt, options);
  const expectedSliceIssues =
    artifact && validation.valid && options.expectedSliceKind && artifact.sliceKind !== options.expectedSliceKind
      ? [`Live confidence artifact sliceKind is ${artifact.sliceKind}; expected ${options.expectedSliceKind}.`]
      : [];
  const maturityAssertionIssues =
    artifact && options.expectedMaturityAssertions
      ? liveConfidenceMaturityAssertionIssues(artifact, options.expectedMaturityAssertions)
      : [];
  const acceptanceIssues =
    artifact && validation.valid && artifact.status !== "passed"
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
  const sliceKinds = [
    "pi_tool_prompt",
    "child_authority",
    "workflow_symphony",
    "workflow_symphony_broader",
    "local_runtime",
    "restart_repair",
    "lifecycle_edges",
    "desktop_dogfood",
    "deterministic_only",
  ];
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

function nextSlice({ blockingIssues, advisoryIssues, requireLive }) {
  if (blockingIssues.length) {
    return "Fix the blocking sub-agent release-gate issue(s), rerun deterministic replay diagnostics, and re-run the gate before merging more maturity-sensitive behavior.";
  }
  if (!requireLive && advisoryIssues.length) {
    return "Deterministic sub-agent release gate is green; run pnpm run test:subagents:release-gate:live before release-critical changes, and pnpm run test:subagents:release-gate:graduation before feature-flag graduation.";
  }
  return "Sub-agent maturity gate evidence is green for this policy; continue with the next scoped implementation phase from origin/main.";
}
