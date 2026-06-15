#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSubagentReleaseGateLiveHistoryEntry,
  buildSubagentReleaseGateReport,
  renderSubagentReleaseGateMarkdown,
  subagentReleaseGatePassed,
} from "./subagent-release-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const outputPath = resolve(args.outputPath || process.env.AMBIENT_SUBAGENT_RELEASE_GATE_OUT || join(repoRoot, "test-results", "subagent-release-gate", "latest.json"));
const liveHistoryPath = args.liveHistoryPath === false
  ? undefined
  : resolve(args.liveHistoryPath || process.env.AMBIENT_SUBAGENT_RELEASE_GATE_LIVE_HISTORY || join(dirname(outputPath), "live-history.jsonl"));
const startedAt = new Date().toISOString();
const packageJson = await readJson(resolve(repoRoot, "package.json"));
const artifacts = {
  replayDiagnostics: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-replay-diagnostics", "latest.json")),
  callableWorkflowDogfood: await readJsonIfExists(resolve(repoRoot, "test-results", "callable-workflow-dogfood", "latest.json")),
  callableWorkflowRehydration: await readJsonIfExists(resolve(repoRoot, "test-results", "callable-workflow-rehydration", "latest.json")),
  lifecycleEdges: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-lifecycle-edges", "latest.json")),
  liveSmoke: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-live-smoke", "latest.json")),
  liveConfidence: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-live-confidence", "latest.json")),
  liveAuthorityConfidence: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-live-confidence", "child-authority-latest.json")),
  liveWorkflowConfidence: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-live-confidence", "workflow-symphony-latest.json")),
  liveWorkflowBroaderConfidence: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-live-confidence", "workflow-symphony-broader-latest.json")),
  liveLocalRuntimeConfidence: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-live-confidence", "local-runtime-latest.json")),
  liveRestartRepairConfidence: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-live-confidence", "restart-repair-latest.json")),
  liveLifecycleEdgeConfidence: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-live-confidence", "lifecycle-edges-latest.json")),
  liveDesktopDogfoodConfidence: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-live-confidence", "desktop-dogfood-latest.json")),
  liveNodeHarnessManifest: await readJsonIfExists(resolve(repoRoot, "test-results", "harness", "live-node-latest.manifest.json")),
  electronDogfoodHarnessManifest: await readJsonIfExists(resolve(repoRoot, "test-results", "harness", "electron-dogfood-latest.manifest.json")),
  desktopDogfood: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-desktop-dogfood", "latest.json")),
  liveHistoryReport: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-live-history-report", "latest.json")),
  desktopDogfoodHistory: await readJsonIfExists(resolve(repoRoot, "test-results", "subagent-desktop-dogfood-history-report", "latest.json")),
  workflowJitterReleaseGate: await readJsonIfExists(resolve(repoRoot, "test-results", "workflow-jitter-release-gate", "latest.json")),
};
const files = {
  packageJson: await readText("package.json"),
  featureFlags: await readText("src/shared/featureFlags.ts"),
  mainIndex: await readText("src/main/index.ts"),
  mainIpc: await readText("src/main/ipc/registerMainIpc.ts"),
  ambientModels: await readText("src/shared/ambientModels.ts"),
  ambientModelsTest: await readText("src/shared/ambientModels.test.ts"),
  modelRuntimeSettings: await readText("src/shared/modelRuntimeSettings.ts"),
  modelRuntimeSettingsTest: await readText("src/shared/modelRuntimeSettings.test.ts"),
  modelProviderInstallTemplates: await readText("src/shared/modelProviderInstallTemplates.ts"),
  sharedTypes: await readText("src/shared/types.ts"),
  sharedDesktopTypes: await readText("src/shared/desktopTypes.ts"),
  sharedWorkflowTypes: await readText("src/shared/workflowTypes.ts"),
  preload: await readText("src/preload/index.ts"),
  subagentRoles: await readText("src/shared/subagentRoles.ts"),
  subagentTurnBudget: await readText("src/shared/subagentTurnBudget.ts"),
  subagentTurnBudgetTest: await readText("src/shared/subagentTurnBudget.test.ts"),
  sharedSubagentToolScope: await readText("src/shared/subagentToolScope.ts"),
  sharedSubagentContractsTest: await readText("src/shared/subagentContracts.test.ts"),
  symphonyWorkflowRecipes: await readText("src/shared/symphonyWorkflowRecipes.ts"),
  symphonyWorkflowRecipesTest: await readText("src/shared/symphonyWorkflowRecipes.test.ts"),
  callableWorkflowRegistry: await readText("src/main/callableWorkflowRegistry.ts"),
  callableWorkflowRegistryTest: await readText("src/main/callableWorkflowRegistry.test.ts"),
  callableWorkflowPiTools: await readText("src/main/callableWorkflowPiTools.ts"),
  callableWorkflowPiToolsTest: await readText("src/main/callableWorkflowPiTools.test.ts"),
  agentRuntimeCallableWorkflowExecution: await readText("src/main/agentRuntimeCallableWorkflowExecution.ts"),
  agentRuntimeCallableWorkflowTools: await readText("src/main/agentRuntimeCallableWorkflowTools.ts"),
  agentRuntimeCallableWorkflowToolsTest: await readText("src/main/agentRuntimeCallableWorkflowTools.test.ts"),
  agentRuntimeAmbientWorkflowReadOnlyTools: await readText("src/main/agentRuntimeAmbientWorkflowReadOnlyTools.ts"),
  agentRuntimeAmbientWorkflowReadOnlyToolsTest: await readText("src/main/agentRuntimeAmbientWorkflowReadOnlyTools.test.ts"),
  desktopToolRegistry: await readText("src/main/desktopToolRegistry.ts"),
  desktopToolRegistryTest: await readText("src/main/desktopToolRegistry.test.ts"),
  callableWorkflowExecutionPlan: await readText("src/main/callableWorkflowExecutionPlan.ts"),
  callableWorkflowExecutionPlanTest: await readText("src/main/callableWorkflowExecutionPlan.test.ts"),
  callableWorkflowTaskQueue: await readText("src/main/callableWorkflowTaskQueue.ts"),
  callableWorkflowTaskQueueTest: await readText("src/main/callableWorkflowTaskQueue.test.ts"),
  callableWorkflowRunner: await readText("src/main/callableWorkflowRunner.ts"),
  callableWorkflowRunnerTest: await readText("src/main/callableWorkflowRunner.test.ts"),
  callableWorkflowDogfoodEvidence: await readText("src/main/callableWorkflowDogfoodEvidence.ts"),
  callableWorkflowDogfoodEvidenceTest: await readText("src/main/callableWorkflowDogfoodEvidence.test.ts"),
  callableWorkflowRehydrationEvidence: await readText("src/main/callableWorkflowRehydrationEvidence.ts"),
  callableWorkflowRehydrationEvidenceTest: await readText("src/main/callableWorkflowRehydrationEvidence.test.ts"),
  subagentLifecycleEdgeEvidence: await readText("src/main/subagentLifecycleEdgeEvidence.ts"),
  subagentLifecycleEdgeEvidenceTest: await readText("src/main/subagentLifecycleEdgeEvidence.test.ts"),
  workflowCompilerService: await readText("src/main/workflowCompilerService.ts"),
  workflowCompilerServiceTest: await readText("src/main/workflowCompilerService.test.ts"),
  callableWorkflowParentBlocking: await readText("src/main/callableWorkflowParentBlocking.ts"),
  callableWorkflowParentBlockingTest: await readText("src/main/callableWorkflowParentBlocking.test.ts"),
  agentRuntimeFinalizationBlocking: await readText("src/main/agentRuntimeFinalizationBlocking.ts"),
  agentRuntimeFinalizationBlockingTest: await readText("src/main/agentRuntimeFinalizationBlocking.test.ts"),
  agentRoleRegistry: await readText("src/main/agentRoleRegistry.ts"),
  agentRoleRegistryTest: await readText("src/main/agentRoleRegistry.test.ts"),
  modelRuntimeRegistry: await readText("src/main/modelRuntimeRegistry.ts"),
  modelRuntimeRegistryTest: await readText("src/main/modelRuntimeRegistry.test.ts"),
  modelProviderCapabilityProbe: await readText("src/main/modelProviderCapabilityProbe.ts"),
  modelProviderCapabilityProbeTest: await readText("src/main/modelProviderCapabilityProbe.test.ts"),
  modelProviderCapabilityProbeRunner: await readText("src/main/modelProviderCapabilityProbeRunner.ts"),
  modelProviderCapabilityProbeRunnerTest: await readText("src/main/modelProviderCapabilityProbeRunner.test.ts"),
  modelProviderEndpointProbeAdapter: await readText("src/main/modelProviderEndpointProbeAdapter.ts"),
  modelProviderEndpointProbeAdapterTest: await readText("src/main/modelProviderEndpointProbeAdapter.test.ts"),
  modelProviderEndpointProbeService: await readText("src/main/modelProviderEndpointProbeService.ts"),
  modelProviderEndpointProbeServiceTest: await readText("src/main/modelProviderEndpointProbeService.test.ts"),
  modelProviderCredentialStore: await readText("src/main/modelProviderCredentialStore.ts"),
  modelProviderCredentialStoreTest: await readText("src/main/modelProviderCredentialStore.test.ts"),
  modelProviderSettingsInstall: await readText("src/main/modelProviderSettingsInstall.ts"),
  modelProviderSettingsInstallTest: await readText("src/main/modelProviderSettingsInstall.test.ts"),
  settingsIpc: await readText("src/main/ipc/registerSettingsIpc.ts"),
  settingsIpcTest: await readText("src/main/ipc/registerSettingsIpc.test.ts"),
  modelScopeResolver: await readText("src/main/modelScopeResolver.ts"),
  modelScopeResolverTest: await readText("src/main/modelScopeResolver.test.ts"),
  modelRuntimeCatalogUiModel: await readText("src/renderer/src/modelRuntimeCatalogUiModel.ts"),
  modelRuntimeCatalogUiModelTest: await readText("src/renderer/src/modelRuntimeCatalogUiModel.test.ts"),
  modelProviderOnboardingUiModel: await readText("src/renderer/src/modelProviderOnboardingUiModel.ts"),
  modelProviderOnboardingUiModelTest: await readText("src/renderer/src/modelProviderOnboardingUiModel.test.ts"),
  rightPanel: await readText("src/renderer/src/RightPanel.tsx"),
  rightPanelSettingsCore: await readText("src/renderer/src/RightPanelSettingsCore.tsx"),
  rightPanelSettingsRuntime: await readText("src/renderer/src/RightPanelSettingsRuntime.tsx"),
  sharedSubagentMaturity: await readText("src/shared/subagentMaturity.ts"),
  subagentLiveEvidenceLanesJson: await readText("src/shared/subagentLiveEvidenceLanes.json"),
  subagentLiveEvidenceLanes: await readText("src/shared/subagentLiveEvidenceLanes.ts"),
  subagentLiveEvidenceLanesTest: await readText("src/shared/subagentLiveEvidenceLanes.test.ts"),
  subagentMaturity: await readText("src/main/subagentMaturity.ts"),
  subagentMaturityTest: await readText("src/main/subagentMaturity.test.ts"),
  subagentLiveSmokeEvidence: await readText("src/main/subagentLiveSmokeEvidence.ts"),
  chatExport: await readText("src/main/chatExport.ts"),
  chatExportTest: await readText("src/main/chatExport.test.ts"),
  subagentLiveHistoryEvidence: await readText("src/main/subagentLiveHistoryEvidence.ts"),
  subagentLiveHistoryEvidenceTest: await readText("src/main/subagentLiveHistoryEvidence.test.ts"),
  subagentDesktopDogfoodEvidence: await readText("src/main/subagentDesktopDogfoodEvidence.ts"),
  subagentDesktopDogfoodEvidenceTest: await readText("src/main/subagentDesktopDogfoodEvidence.test.ts"),
  subagentLiveConfidenceEvidence: await readText("src/main/subagentLiveConfidenceEvidence.ts"),
  subagentLiveConfidenceEvidenceTest: await readText("src/main/subagentLiveConfidenceEvidence.test.ts"),
  subagentLiveConfidenceMaturityEvidence: await readText("src/main/subagentLiveConfidenceMaturityEvidence.ts"),
  subagentLiveConfidenceMaturityEvidenceTest: await readText("src/main/subagentLiveConfidenceMaturityEvidence.test.ts"),
  subagentLiveConfidenceRunner: await readText("scripts/subagent-live-confidence-lib.mjs"),
  subagentLiveConfidenceRunnerTest: await readText("scripts/subagent-live-confidence.test.mjs"),
  subagentReleaseGateRunner: await readText("scripts/subagent-release-gate.mjs"),
  subagentReleaseGateRunnerLib: await readText("scripts/subagent-release-gate-lib.mjs"),
  subagentReleaseGateSourceChecks: await readText("scripts/subagent-release-gate-source-checks.mjs"),
  subagentReleaseGateRunnerTest: await readText("scripts/subagent-release-gate.test.mjs"),
  subagentLiveEvidenceLanesScript: await readText("scripts/subagent-live-evidence-lanes.mjs"),
  subagentLiveEvidenceLanesScriptTest: await readText("scripts/subagent-live-evidence-lanes.test.mjs"),
  subagentLiveHistoryReportRunner: await readText("scripts/subagent-live-history-report.mjs"),
  subagentLiveHistoryReportRunnerLib: await readText("scripts/subagent-live-history-report-lib.mjs"),
  subagentLiveHistoryReportRunnerTest: await readText("scripts/subagent-live-history-report.test.mjs"),
  subagentDesktopDogfoodHistoryReportRunner: await readText("scripts/subagent-desktop-dogfood-history-report.mjs"),
  subagentDesktopDogfoodEvidenceContract: await readText("scripts/subagent-desktop-dogfood-evidence-contract.mjs"),
  subagentDesktopDogfoodEvidenceContractTest: await readText("scripts/subagent-desktop-dogfood-evidence-contract.test.mjs"),
  subagentDesktopDogfoodHistoryReportRunnerLib: await readText("scripts/subagent-desktop-dogfood-history-report-lib.mjs"),
  subagentDesktopDogfoodHistoryReportRunnerTest: await readText("scripts/subagent-desktop-dogfood-history-report.test.mjs"),
  subagentDesktopDogfoodRunner: await readText("scripts/subagent-desktop-dogfood.mjs"),
  subagentDesktopDogfoodRunnerTest: await readText("scripts/subagent-desktop-dogfood.test.mjs"),
  subagentDesktopDogfoodUntrackedPlaceholder: await readText("scripts/llama-server-placeholder.mjs"),
  subagentDesktopDogfoodRepeatRunner: await readText("scripts/subagent-desktop-dogfood-repeat.mjs"),
  subagentDesktopDogfoodRepeatRunnerLib: await readText("scripts/subagent-desktop-dogfood-repeat-lib.mjs"),
  subagentDesktopDogfoodRepeatRunnerTest: await readText("scripts/subagent-desktop-dogfood-repeat.test.mjs"),
  workflowJitterMatrixRunner: await readText("scripts/workflow-jitter-matrix.mjs"),
  workflowJitterReleaseGateRunner: await readText("scripts/workflow-jitter-release-gate.mjs"),
  workflowJitterReleaseGateTest: await readText("scripts/workflow-jitter-release-gate.test.mjs"),
  subagentDesktopDogfoodSeedTest: await readText("src/main/subagentDesktopDogfoodSeed.test.ts"),
  subagentDesktopDogfoodScenario: await readText("src/main/subagentDesktopDogfoodScenario.ts"),
  subagentDesktopDogfoodE2eTest: await readText("src/main/subagentDesktopDogfood.e2e.test.ts"),
  subagentReviewedMaturityEvidence: await readText("src/main/subagentReviewedMaturityEvidence.ts"),
  subagentReviewedMaturityEvidenceTest: await readText("src/main/subagentReviewedMaturityEvidence.test.ts"),
  subagentInvariants: await readText("src/main/subagentInvariants.ts"),
  subagentInvariantsTest: await readText("src/main/subagentInvariants.test.ts"),
  subagentObservability: await readText("src/main/subagentObservability.ts"),
  subagentObservabilityTest: await readText("src/main/subagentObservability.test.ts"),
  diagnostics: await readText("src/main/diagnostics.ts"),
  diagnosticsTest: await readText("src/main/diagnostics.test.ts"),
  diagnosticsIpc: await readText("src/main/ipc/registerDiagnosticsIpc.ts"),
  diagnosticBundleImport: await readText("src/main/diagnosticBundleImport.ts"),
  diagnosticBundleImportTest: await readText("src/main/diagnosticBundleImport.test.ts"),
  subagentRepair: await readText("src/main/subagentRepair.ts"),
  subagentRepairTest: await readText("src/main/subagentRepair.test.ts"),
  subagentRetention: await readText("src/main/subagentRetention.ts"),
  subagentRetentionTest: await readText("src/main/subagentRetention.test.ts"),
  subagentIdempotency: await readText("src/main/subagentIdempotency.ts"),
  subagentIdempotencyTest: await readText("src/main/subagentIdempotency.test.ts"),
  piChildSessionAdapter: await readText("src/main/piChildSessionAdapter.ts"),
  piChildSessionAdapterTest: await readText("src/main/piChildSessionAdapter.test.ts"),
  piEventMapper: await readText("src/main/piEventMapper.ts"),
  piEventMapperTest: await readText("src/main/piEventMapper.test.ts"),
  subagentRuntimeEventPersistence: await readText("src/main/subagentRuntimeEventPersistence.ts"),
  subagentRuntimeEventPersistenceTest: await readText("src/main/subagentRuntimeEventPersistence.test.ts"),
  subagentPromptRuntime: await readText("src/main/subagentPromptRuntime.ts"),
  subagentPromptRuntimeTest: await readText("src/main/subagentPromptRuntime.test.ts"),
  subagentCompletionGuard: await readText("src/main/subagentCompletionGuard.ts"),
  subagentCompletionGuardTest: await readText("src/main/subagentCompletionGuard.test.ts"),
  subagentStartupReconciliation: await readText("src/main/subagentStartupReconciliation.ts"),
  subagentStartupReconciliationTest: await readText("src/main/subagentStartupReconciliation.test.ts"),
  subagentLifecycleParentMailbox: await readText("src/main/subagentLifecycleParentMailbox.ts"),
  subagentLifecycleParentMailboxTest: await readText("src/main/subagentLifecycleParentMailbox.test.ts"),
  subagentLifecycleHooks: await readText("src/main/subagentLifecycleHooks.ts"),
  subagentLifecycleHooksTest: await readText("src/main/subagentLifecycleHooks.test.ts"),
  subagentApprovalBridge: await readText("src/main/subagentApprovalBridge.ts"),
  subagentApprovalBridgeTest: await readText("src/main/subagentApprovalBridge.test.ts"),
  subagentSupervisorRequest: await readText("src/main/subagentSupervisorRequest.ts"),
  subagentSupervisorRequestTest: await readText("src/main/subagentSupervisorRequest.test.ts"),
  subagentApprovalDecision: await readText("src/main/subagentApprovalDecision.ts"),
  subagentApprovalDecisionTest: await readText("src/main/subagentApprovalDecision.test.ts"),
  subagentIpc: await readText("src/main/ipc/registerSubagentIpc.ts"),
  subagentIpcTest: await readText("src/main/ipc/registerSubagentIpc.test.ts"),
  agentRuntime: await readText("src/main/agentRuntime.ts"),
  agentRuntimeTest: await readText("src/main/agentRuntime.test.ts"),
  subagentChildActiveTools: await readText("src/main/subagentChildActiveTools.ts"),
  subagentChildActiveToolsTest: await readText("src/main/subagentChildActiveTools.test.ts"),
  projectStore: await readText("src/main/projectStore.ts"),
  projectStoreSchema: await readText("src/main/projectStoreSchema.ts"),
  projectStoreSubagentFoundationTest: await readText("src/main/projectStoreSubagentFoundation.test.ts"),
  subagentPiTools: await readText("src/main/subagentPiTools.ts"),
  subagentPiToolsTest: await readText("src/main/subagentPiTools.test.ts"),
  subagentPiToolInput: await readText("src/main/subagentPiToolInput.ts"),
  subagentPiToolInputTest: await readText("src/main/subagentPiToolInput.test.ts"),
  subagentPiToolResult: await readText("src/main/subagentPiToolResult.ts"),
  subagentPiToolResultTest: await readText("src/main/subagentPiToolResult.test.ts"),
  subagentSpawnPreRunPlanner: await readText("src/main/subagentSpawnPreRunPlanner.ts"),
  subagentSpawnPreRunPlannerTest: await readText("src/main/subagentSpawnPreRunPlanner.test.ts"),
  subagentSpawnPreflightResolver: await readText("src/main/subagentSpawnPreflightResolver.ts"),
  subagentSpawnPreflightResolverTest: await readText("src/main/subagentSpawnPreflightResolver.test.ts"),
  subagentChildWorktreePreparer: await readText("src/main/subagentChildWorktreePreparer.ts"),
  subagentChildWorktreePreparerTest: await readText("src/main/subagentChildWorktreePreparer.test.ts"),
  subagentTargetResolver: await readText("src/main/subagentTargetResolver.ts"),
  subagentTargetResolverTest: await readText("src/main/subagentTargetResolver.test.ts"),
  subagentToolScopeRequest: await readText("src/main/subagentToolScopeRequest.ts"),
  subagentToolScopeRequestTest: await readText("src/main/subagentToolScopeRequest.test.ts"),
  subagentToolScopeLaunchPolicy: await readText("src/main/subagentToolScopeLaunchPolicy.ts"),
  subagentToolScopeLaunchPolicyTest: await readText("src/main/subagentToolScopeLaunchPolicy.test.ts"),
  subagentDelegatedToolAuthority: await readText("src/main/subagentDelegatedToolAuthority.ts"),
  subagentDelegatedToolAuthorityTest: await readText("src/main/subagentDelegatedToolAuthority.test.ts"),
  subagentSpawnBlockDecision: await readText("src/main/subagentSpawnBlockDecision.ts"),
  subagentSpawnBlockDecisionTest: await readText("src/main/subagentSpawnBlockDecision.test.ts"),
  subagentPreRunSpawnFailureRecorder: await readText("src/main/subagentPreRunSpawnFailureRecorder.ts"),
  subagentPreRunSpawnFailureRecorderTest: await readText("src/main/subagentPreRunSpawnFailureRecorder.test.ts"),
  subagentPostReservationSpawnFailureRecorder: await readText("src/main/subagentPostReservationSpawnFailureRecorder.ts"),
  subagentPostReservationSpawnFailureRecorderTest: await readText("src/main/subagentPostReservationSpawnFailureRecorder.test.ts"),
  subagentLaunchRejectionRecorder: await readText("src/main/subagentLaunchRejectionRecorder.ts"),
  subagentLaunchRejectionRecorderTest: await readText("src/main/subagentLaunchRejectionRecorder.test.ts"),
  subagentSpawnLaunchExecutor: await readText("src/main/subagentSpawnLaunchExecutor.ts"),
  subagentSpawnLaunchExecutorTest: await readText("src/main/subagentSpawnLaunchExecutor.test.ts"),
  subagentFailedSpawnWaitBarrier: await readText("src/main/subagentFailedSpawnWaitBarrier.ts"),
  subagentFailedSpawnWaitBarrierTest: await readText("src/main/subagentFailedSpawnWaitBarrier.test.ts"),
  subagentResultValidation: await readText("src/main/subagentResultValidation.ts"),
  subagentResultValidationTest: await readText("src/main/subagentResultValidation.test.ts"),
  subagentWaitBarrierResolution: await readText("src/main/subagentWaitBarrierResolution.ts"),
  subagentWaitBarrierResolutionTest: await readText("src/main/subagentWaitBarrierResolution.test.ts"),
  subagentWaitContextResolver: await readText("src/main/subagentWaitContextResolver.ts"),
  subagentWaitContextResolverTest: await readText("src/main/subagentWaitContextResolver.test.ts"),
  subagentWaitAgentExecutor: await readText("src/main/subagentWaitAgentExecutor.ts"),
  subagentWaitAgentExecutorTest: await readText("src/main/subagentWaitAgentExecutor.test.ts"),
  subagentTurnBudgetWrapUpRecorder: await readText("src/main/subagentTurnBudgetWrapUpRecorder.ts"),
  subagentTurnBudgetWrapUpRecorderTest: await readText("src/main/subagentTurnBudgetWrapUpRecorder.test.ts"),
  subagentTurnBudgetExhaustionRecorder: await readText("src/main/subagentTurnBudgetExhaustionRecorder.ts"),
  subagentWaitCompletionRecorder: await readText("src/main/subagentWaitCompletionRecorder.ts"),
  subagentWaitCompletionRecorderTest: await readText("src/main/subagentWaitCompletionRecorder.test.ts"),
  subagentWaitBarrierAttentionRecorder: await readText("src/main/subagentWaitBarrierAttentionRecorder.ts"),
  subagentWaitBarrierAttentionRecorderTest: await readText("src/main/subagentWaitBarrierAttentionRecorder.test.ts"),
  subagentSpawnFailure: await readText("src/main/subagentSpawnFailure.ts"),
  subagentSpawnFailureTest: await readText("src/main/subagentSpawnFailure.test.ts"),
  subagentSpawnRequest: await readText("src/main/subagentSpawnRequest.ts"),
  subagentSpawnRequestTest: await readText("src/main/subagentSpawnRequest.test.ts"),
  subagentMailbox: await readText("src/main/subagentMailbox.ts"),
  subagentMailboxTest: await readText("src/main/subagentMailbox.test.ts"),
  subagentMailboxRequest: await readText("src/main/subagentMailboxRequest.ts"),
  subagentMailboxRequestTest: await readText("src/main/subagentMailboxRequest.test.ts"),
  subagentChildMailboxExecutor: await readText("src/main/subagentChildMailboxExecutor.ts"),
  subagentChildMailboxExecutorTest: await readText("src/main/subagentChildMailboxExecutor.test.ts"),
  subagentAgentStatus: await readText("src/main/subagentAgentStatus.ts"),
  subagentAgentStatusTest: await readText("src/main/subagentAgentStatus.test.ts"),
  subagentToolScopeSnapshot: await readText("src/main/subagentToolScopeSnapshot.ts"),
  subagentToolScopeSnapshotTest: await readText("src/main/subagentToolScopeSnapshot.test.ts"),
  subagentGroupJoin: await readText("src/main/subagentGroupJoin.ts"),
  subagentGroupJoinTest: await readText("src/main/subagentGroupJoin.test.ts"),
  subagentGroupedCompletionRecorder: await readText("src/main/subagentGroupedCompletionRecorder.ts"),
  subagentGroupedCompletionRecorderTest: await readText("src/main/subagentGroupedCompletionRecorder.test.ts"),
  subagentParentPolicyResolution: await readText("src/main/subagentParentPolicyResolution.ts"),
  subagentParentPolicyResolutionTest: await readText("src/main/subagentParentPolicyResolution.test.ts"),
  subagentWaitBarrierEvaluation: await readText("src/main/subagentWaitBarrierEvaluation.ts"),
  subagentWaitBarrierEvaluationTest: await readText("src/main/subagentWaitBarrierEvaluation.test.ts"),
  subagentWaitMailbox: await readText("src/main/subagentWaitMailbox.ts"),
  subagentWaitMailboxTest: await readText("src/main/subagentWaitMailbox.test.ts"),
  subagentBarrierDecision: await readText("src/main/subagentBarrierDecision.ts"),
  subagentBarrierDecisionTest: await readText("src/main/subagentBarrierDecision.test.ts"),
  subagentBarrierDecisionRecorder: await readText("src/main/subagentBarrierDecisionRecorder.ts"),
  subagentBarrierDecisionRecorderTest: await readText("src/main/subagentBarrierDecisionRecorder.test.ts"),
  subagentBarrierControl: await readText("src/main/subagentBarrierControl.ts"),
  subagentBarrierControlTest: await readText("src/main/subagentBarrierControl.test.ts"),
  subagentBarrierControlExecutor: await readText("src/main/subagentBarrierControlExecutor.ts"),
  subagentBarrierControlExecutorTest: await readText("src/main/subagentBarrierControlExecutor.test.ts"),
  subagentBarrierDecisionExecutor: await readText("src/main/subagentBarrierDecisionExecutor.ts"),
  subagentBarrierDecisionExecutorTest: await readText("src/main/subagentBarrierDecisionExecutor.test.ts"),
  subagentCancelAgent: await readText("src/main/subagentCancelAgent.ts"),
  subagentCancelAgentTest: await readText("src/main/subagentCancelAgent.test.ts"),
  subagentCancelAgentExecutor: await readText("src/main/subagentCancelAgentExecutor.ts"),
  subagentCancelAgentExecutorTest: await readText("src/main/subagentCancelAgentExecutor.test.ts"),
  subagentCloseAgent: await readText("src/main/subagentCloseAgent.ts"),
  subagentCloseAgentTest: await readText("src/main/subagentCloseAgent.test.ts"),
  subagentCloseAgentExecutor: await readText("src/main/subagentCloseAgentExecutor.ts"),
  subagentCloseAgentExecutorTest: await readText("src/main/subagentCloseAgentExecutor.test.ts"),
  subagentBatchJobs: await readText("src/main/subagentBatchJobs.ts"),
  subagentBatchJobsTest: await readText("src/main/subagentBatchJobs.test.ts"),
  localTextDelegation: await readText("src/main/localTextDelegation.ts"),
  localTextDelegationTest: await readText("src/main/localTextDelegation.test.ts"),
  localTextSubagentRuntime: await readText("src/main/localTextSubagentRuntime.ts"),
  localTextSubagentRuntimeTest: await readText("src/main/localTextSubagentRuntime.test.ts"),
  localModelRuntimeManager: await readText("src/main/localModelRuntimeManager.ts"),
  localModelRuntimeManagerTest: await readText("src/main/localModelRuntimeManager.test.ts"),
  localRuntimeInventory: await readText("src/main/localRuntimeInventory.ts"),
  localRuntimeInventoryTest: await readText("src/main/localRuntimeInventory.test.ts"),
  localModelRuntimeStatus: await readText("src/main/localModelRuntimeStatus.ts"),
  localModelRuntimeStatusTest: await readText("src/main/localModelRuntimeStatus.test.ts"),
  localModelRuntimeStart: await readText("src/main/localModelRuntimeStart.ts"),
  localModelRuntimeStartTest: await readText("src/main/localModelRuntimeStart.test.ts"),
  localModelRuntimeStop: await readText("src/main/localModelRuntimeStop.ts"),
  localModelRuntimeStopTest: await readText("src/main/localModelRuntimeStop.test.ts"),
  localModelRuntimeRestart: await readText("src/main/localModelRuntimeRestart.ts"),
  localModelRuntimeRestartTest: await readText("src/main/localModelRuntimeRestart.test.ts"),
  agentRuntimeLocalRuntimeTools: await readText("src/main/agentRuntimeLocalRuntimeTools.ts"),
  agentRuntimeLocalRuntimeToolsTest: await readText("src/main/agentRuntimeLocalRuntimeTools.test.ts"),
  localRuntimeOwnershipResolution: await readText("src/main/localRuntimeOwnershipResolution.ts"),
  localModelResourceRegistry: await readText("src/main/localModelResourceRegistry.ts"),
  localModelResourceRegistryTest: await readText("src/main/localModelResourceRegistry.test.ts"),
  localTextSubagentStartupConfig: await readText("src/main/localTextSubagentStartupConfig.ts"),
  localTextSubagentStartupConfigTest: await readText("src/main/localTextSubagentStartupConfig.test.ts"),
  subagentParentClusterUiModel: await readText("src/renderer/src/subagentParentClusterUiModel.ts"),
  subagentParentClusterUiModelTest: await readText("src/renderer/src/subagentParentClusterUiModel.test.ts"),
  subagentParentClusterComponent: await readText("src/renderer/src/SubagentParentCluster.tsx"),
  subagentParentClusterComponentTest: await readText("src/renderer/src/SubagentParentCluster.test.tsx"),
  subagentParentClusterFixture: await readText("src/renderer/src/SubagentParentCluster.fixture.ts"),
  subagentParentClusterComponentVisualTest: await readText("src/renderer/src/SubagentParentCluster.visual.test.tsx"),
  subagentIntegratedProductionUiVisualTest: await readText("src/renderer/src/SubagentIntegratedProductionUi.visual.test.tsx"),
  subagentThreadInspectorComponent: await readText("src/renderer/src/SubagentThreadInspector.tsx"),
  rendererApp: await readText("src/renderer/src/App.tsx"),
  appModalHost: await readText("src/renderer/src/AppModalHost.tsx"),
  rendererStyles: await readText("src/renderer/src/styles.css"),
  subagentThreadInspectorUiModel: await readText("src/renderer/src/subagentThreadInspectorUiModel.ts"),
  subagentThreadInspectorUiModelTest: await readText("src/renderer/src/subagentThreadInspectorUiModel.test.ts"),
  subagentRepairDiagnosticsUiModel: await readText("src/renderer/src/subagentRepairDiagnosticsUiModel.ts"),
  subagentRepairDiagnosticsUiModelTest: await readText("src/renderer/src/subagentRepairDiagnosticsUiModel.test.ts"),
  subagentMaturityUiModel: await readText("src/renderer/src/subagentMaturityUiModel.ts"),
  subagentMaturityUiModelTest: await readText("src/renderer/src/subagentMaturityUiModel.test.ts"),
  subagentReplayEvidenceUiModel: await readText("src/renderer/src/subagentReplayEvidenceUiModel.ts"),
  subagentReplayEvidenceUiModelTest: await readText("src/renderer/src/subagentReplayEvidenceUiModel.test.ts"),
  localRuntimeEvidenceUiModel: await readText("src/renderer/src/localRuntimeEvidenceUiModel.ts"),
  localRuntimeEvidenceUiModelTest: await readText("src/renderer/src/localRuntimeEvidenceUiModel.test.ts"),
  diagnosticExportHistoryUiModel: await readText("src/renderer/src/diagnosticExportHistoryUiModel.ts"),
  diagnosticExportHistoryUiModelTest: await readText("src/renderer/src/diagnosticExportHistoryUiModel.test.ts"),
  settingsLayoutTest: await readText("src/renderer/src/settingsLayout.test.ts"),
  subagentThreatModelTest: await readText("src/main/subagentThreatModel.test.ts"),
  subagentPiToolLiveSmoke: await readText("src/main/subagentPiToolLiveSmoke.live.test.ts"),
  subagentReplayDiagnostics: await readText("scripts/subagent-replay-diagnostics-lib.mjs"),
};
const report = buildSubagentReleaseGateReport({
  packageJson,
  files,
  artifacts,
  requireLive: args.requireLive,
  requireMaturityHistory: args.requireMaturityHistory,
  maxArtifactAgeHours: args.maxArtifactAgeHours,
  startedAt,
  completedAt: new Date().toISOString(),
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputPath.replace(/\.json$/i, ".md"), renderSubagentReleaseGateMarkdown(report), "utf8");
if (args.requireLive && liveHistoryPath) {
  await mkdir(dirname(liveHistoryPath), { recursive: true });
  await appendFile(liveHistoryPath, `${JSON.stringify(buildSubagentReleaseGateLiveHistoryEntry(report, {
    reportPath: relativePath(outputPath),
  }))}\n`, "utf8");
}

if (args.printJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  printHumanSummary(report);
  process.stdout.write(`Report: ${outputPath}\n`);
}

if (!subagentReleaseGatePassed(report, {
  requireLive: args.requireLive,
  requireMaturityHistory: args.requireMaturityHistory,
})) process.exitCode = 1;

async function readText(relativePath) {
  return readFile(resolve(repoRoot, relativePath), "utf8");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonIfExists(path) {
  try {
    const data = await readJson(path);
    return { ...data, __artifactPath: relativePath(path) };
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function relativePath(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

function parseArgs(argv) {
  const parsed = {
    outputPath: undefined,
    liveHistoryPath: undefined,
    printJson: false,
    requireLive: process.env.AMBIENT_SUBAGENT_RELEASE_GATE_REQUIRE_LIVE === "1",
    requireMaturityHistory: process.env.AMBIENT_SUBAGENT_RELEASE_GATE_REQUIRE_MATURITY_HISTORY === "1",
    maxArtifactAgeHours: undefined,
  };
  for (const arg of argv) {
    if (arg === "--json") {
      parsed.printJson = true;
    } else if (arg === "--require-live") {
      parsed.requireLive = true;
    } else if (arg === "--require-maturity-history") {
      parsed.requireMaturityHistory = true;
    } else if (arg.startsWith("--out=")) {
      parsed.outputPath = arg.slice("--out=".length);
    } else if (arg.startsWith("--live-history=")) {
      parsed.liveHistoryPath = arg.slice("--live-history=".length);
    } else if (arg === "--no-live-history") {
      parsed.liveHistoryPath = false;
    } else if (arg.startsWith("--max-artifact-age-hours=")) {
      parsed.maxArtifactAgeHours = Number(arg.slice("--max-artifact-age-hours=".length));
    } else {
      throw new Error(`Unknown sub-agent release gate argument: ${arg}`);
    }
  }
  return parsed;
}

function printHumanSummary(report) {
  const counts = report.checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] ?? 0) + 1;
    return acc;
  }, {});
  process.stdout.write(`Sub-agent release gate: ${report.status}\n`);
  process.stdout.write(`Checks: ${JSON.stringify(counts)}\n`);
  process.stdout.write(`Live: ${liveEvidenceSummary(report.releaseDecision)}${report.releaseDecision.liveRequired ? " (required)" : ""}\n`);
  process.stdout.write(`Live history report: ${report.releaseDecision.liveHistoryReportSkipped ? "skipped" : "ready"}${report.policy.requireMaturityHistory ? " (required)" : ""}\n`);
  process.stdout.write(`Maturity history: ${report.releaseDecision.desktopDogfoodHistorySkipped ? "skipped" : "ready"}${report.policy.requireMaturityHistory ? " (required)" : ""}\n`);
  process.stdout.write(`Workflow jitter release profile: ${report.releaseDecision.workflowJitterReleaseProfileSkipped ? "skipped" : "ready"}${report.policy.requireMaturityHistory ? " (required)" : ""}\n`);
  if (report.releaseDecision.blockingIssues.length) {
    process.stdout.write("\nBlocking issues:\n");
    for (const issue of report.releaseDecision.blockingIssues) process.stdout.write(`- ${issue}\n`);
  }
  if (report.releaseDecision.advisoryIssues.length) {
    process.stdout.write("\nAdvisories:\n");
    for (const issue of report.releaseDecision.advisoryIssues) process.stdout.write(`- ${issue}\n`);
  }
}

function liveEvidenceSummary(decision) {
  return [
    ["liveSkipped", "smoke"],
    ["liveConfidenceSkipped", "confidence"],
    ["liveWorkflowConfidenceSkipped", "workflow"],
    ["liveWorkflowBroaderConfidenceSkipped", "workflow-broader"],
    ["liveLocalRuntimeConfidenceSkipped", "local-runtime"],
    ["liveRestartRepairConfidenceSkipped", "restart-repair"],
    ["liveLifecycleEdgeConfidenceSkipped", "lifecycle-edges"],
    ["liveDesktopDogfoodConfidenceSkipped", "desktop-dogfood-confidence"],
    ["desktopDogfoodSkipped", "desktop-dogfood"],
  ].map(([field, label]) => `${label}=${decision?.[field] === false ? "present" : "skipped"}`).join(", ");
}
