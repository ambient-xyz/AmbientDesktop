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
  callableWorkflowRegistry: await readText("src/main/callable-workflow/callableWorkflowRegistry.ts"),
  callableWorkflowRegistryTest: await readText("src/main/callable-workflow/callableWorkflowRegistry.test.ts"),
  callableWorkflowPiTools: await readText("src/main/callable-workflow/callableWorkflowPiTools.ts"),
  callableWorkflowPiToolsTest: await readText("src/main/callable-workflow/callableWorkflowPiTools.test.ts"),
  agentRuntimeCallableWorkflowExecution: await readText("src/main/agent-runtime/agentRuntimeCallableWorkflowExecution.ts"),
  agentRuntimeCallableWorkflowTools: await readText("src/main/agent-runtime/agentRuntimeCallableWorkflowTools.ts"),
  agentRuntimeCallableWorkflowToolsTest: await readText("src/main/agent-runtime/agentRuntimeCallableWorkflowTools.test.ts"),
  agentRuntimeSymphonyParentMode: await readText("src/main/agent-runtime/agentRuntimeSymphonyParentMode.ts"),
  agentRuntimeSymphonyParentModeTest: await readText("src/main/agent-runtime/agentRuntimeSymphonyParentMode.test.ts"),
  symphonyWebCapabilityRouter: await readText("src/main/agent-runtime/web-research/symphonyWebCapabilityRouter.ts"),
  symphonyWebCapabilityRouterTest: await readText("src/main/agent-runtime/web-research/symphonyWebCapabilityRouter.test.ts"),
  agentRuntimeAmbientWorkflowReadOnlyTools: await readText("src/main/agent-runtime/ambient-workflow/agentRuntimeAmbientWorkflowReadOnlyTools.ts"),
  agentRuntimeAmbientWorkflowReadOnlyToolsTest: await readText("src/main/agent-runtime/ambient-workflow/agentRuntimeAmbientWorkflowReadOnlyTools.test.ts"),
  desktopToolRegistry: await readText("src/main/desktop-tools/desktopToolRegistry.ts"),
  desktopToolRegistryTest: await readText("src/main/desktop-tools/desktopToolRegistry.test.ts"),
  callableWorkflowExecutionPlan: await readText("src/main/callable-workflow/callableWorkflowExecutionPlan.ts"),
  callableWorkflowExecutionPlanTest: await readText("src/main/callable-workflow/callableWorkflowExecutionPlan.test.ts"),
  callableWorkflowTaskQueue: await readText("src/main/callable-workflow/callableWorkflowTaskQueue.ts"),
  callableWorkflowTaskQueueTest: await readText("src/main/callable-workflow/callableWorkflowTaskQueue.test.ts"),
  callableWorkflowRunner: await readText("src/main/callable-workflow/callableWorkflowRunner.ts"),
  callableWorkflowRunnerTest: await readText("src/main/callable-workflow/callableWorkflowRunner.test.ts"),
  callableWorkflowDogfoodEvidence: await readText("src/main/callable-workflow/callableWorkflowDogfoodEvidence.ts"),
  callableWorkflowDogfoodEvidenceTest: await readText("src/main/callable-workflow/callableWorkflowDogfoodEvidence.test.ts"),
  callableWorkflowRehydrationEvidence: await readText("src/main/callable-workflow/callableWorkflowRehydrationEvidence.ts"),
  callableWorkflowRehydrationEvidenceTest: await readText("src/main/callable-workflow/callableWorkflowRehydrationEvidence.test.ts"),
  subagentLifecycleEdgeEvidence: await readText("src/main/subagents/subagentLifecycleEdgeEvidence.ts"),
  subagentLifecycleEdgeEvidenceTest: await readText("src/main/subagents/subagentLifecycleEdgeEvidence.test.ts"),
  workflowCompilerService: await readText("src/main/workflow-compiler/workflowCompilerService.ts"),
  workflowCompilerServiceTest: await readText("src/main/workflow-compiler/workflowCompilerService.test.ts"),
  workflowCompilerServicePromptTransportTest: await readText("src/main/workflow-compiler/workflowCompilerServicePromptTransport.test.ts"),
  callableWorkflowParentBlocking: await readText("src/main/callable-workflow/callableWorkflowParentBlocking.ts"),
  callableWorkflowParentBlockingTest: await readText("src/main/callable-workflow/callableWorkflowParentBlocking.test.ts"),
  agentRuntimeFinalizationBlocking: await readText("src/main/agent-runtime/agentRuntimeFinalizationBlocking.ts"),
  agentRuntimeFinalizationBlockingTest: await readText("src/main/agent-runtime/agentRuntimeFinalizationBlocking.test.ts"),
  agentRoleRegistry: await readText("src/main/agent/agentRoleRegistry.ts"),
  agentRoleRegistryTest: await readText("src/main/agent/agentRoleRegistry.test.ts"),
  modelRuntimeRegistry: await readText("src/main/model-provider/modelRuntimeRegistry.ts"),
  modelRuntimeRegistryTest: await readText("src/main/model-provider/modelRuntimeRegistry.test.ts"),
  modelProviderCapabilityProbe: await readText("src/main/model-provider/modelProviderCapabilityProbe.ts"),
  modelProviderCapabilityProbeTest: await readText("src/main/model-provider/modelProviderCapabilityProbe.test.ts"),
  modelProviderCapabilityProbeRunner: await readText("src/main/model-provider/modelProviderCapabilityProbeRunner.ts"),
  modelProviderCapabilityProbeRunnerTest: await readText("src/main/model-provider/modelProviderCapabilityProbeRunner.test.ts"),
  modelProviderEndpointProbeAdapter: await readText("src/main/model-provider/modelProviderEndpointProbeAdapter.ts"),
  modelProviderEndpointProbeAdapterTest: await readText("src/main/model-provider/modelProviderEndpointProbeAdapter.test.ts"),
  modelProviderEndpointProbeService: await readText("src/main/model-provider/modelProviderEndpointProbeService.ts"),
  modelProviderEndpointProbeServiceTest: await readText("src/main/model-provider/modelProviderEndpointProbeService.test.ts"),
  modelProviderCredentialStore: await readText("src/main/model-provider/modelProviderCredentialStore.ts"),
  modelProviderCredentialStoreTest: await readText("src/main/model-provider/modelProviderCredentialStore.test.ts"),
  modelProviderSettingsInstall: await readText("src/main/model-provider/modelProviderSettingsInstall.ts"),
  modelProviderSettingsInstallTest: await readText("src/main/model-provider/modelProviderSettingsInstall.test.ts"),
  settingsIpc: await readText("src/main/ipc/registerSettingsIpc.ts"),
  settingsIpcTest: await readText("src/main/ipc/registerSettingsIpc.test.ts"),
  modelScopeResolver: await readText("src/main/model-provider/modelScopeResolver.ts"),
  modelScopeResolverTest: await readText("src/main/model-provider/modelScopeResolver.test.ts"),
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
  subagentMaturity: await readText("src/main/subagents/subagentMaturity.ts"),
  subagentMaturityTest: await readText("src/main/subagents/subagentMaturity.test.ts"),
  subagentLiveSmokeEvidence: await readText("src/main/subagents/subagentLiveSmokeEvidence.ts"),
  chatExport: await readText("src/main/chat-export/chatExport.ts"),
  chatExportTest: await readText("src/main/chat-export/chatExport.test.ts"),
  subagentLiveHistoryEvidence: await readText("src/main/subagents/subagentLiveHistoryEvidence.ts"),
  subagentLiveHistoryEvidenceTest: await readText("src/main/subagents/subagentLiveHistoryEvidence.test.ts"),
  subagentDesktopDogfoodEvidence: await readText("src/main/subagents/subagentDesktopDogfoodEvidence.ts"),
  subagentDesktopDogfoodEvidenceTest: await readText("src/main/subagents/subagentDesktopDogfoodEvidence.test.ts"),
  subagentLiveConfidenceEvidence: await readText("src/main/subagents/subagentLiveConfidenceEvidence.ts"),
  subagentLiveConfidenceEvidenceTest: await readText("src/main/subagents/subagentLiveConfidenceEvidence.test.ts"),
  subagentLiveConfidenceMaturityEvidence: await readText("src/main/subagents/subagentLiveConfidenceMaturityEvidence.ts"),
  subagentLiveConfidenceMaturityEvidenceTest: await readText("src/main/subagents/subagentLiveConfidenceMaturityEvidence.test.ts"),
  subagentLiveConfidenceRunner: [
    await readText("scripts/subagent-live-confidence-lib.mjs"),
    await readText("scripts/subagent-live-confidence-artifact-validators.mjs"),
    await readText("scripts/subagent-live-confidence-authority-validators.mjs"),
    await readText("scripts/subagent-live-confidence-workflow-validators.mjs"),
    await readText("scripts/subagent-live-confidence-runtime-validators.mjs"),
    await readText("scripts/subagent-live-confidence-validator-utils.mjs"),
  ].join("\n"),
  subagentLiveConfidenceRunnerTest: await readText("scripts/subagent-live-confidence.test.mjs"),
  subagentReleaseGateRunner: await readText("scripts/subagent-release-gate.mjs"),
  subagentReleaseGateRunnerLib: await readText("scripts/subagent-release-gate-lib.mjs"),
  subagentReleaseGateSourceChecks: [
    await readText("scripts/subagent-release-gate-source-checks.mjs"),
    await readText("scripts/subagent-release-gate-source-check-helpers.mjs"),
    await readText("scripts/subagent-release-gate-reviewed-evidence-source-checks.mjs"),
  ].join("\n"),
  subagentReleaseGateRunnerTest: [
    await readText("scripts/subagent-release-gate.test.mjs"),
    await readText("scripts/subagent-release-gate-maturity-history.test.mjs"),
    await readText("scripts/subagent-release-gate-package-scripts.test.mjs"),
  ].join("\n"),
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
  subagentDesktopDogfoodSeedTest: await readText("src/main/subagents/subagentDesktopDogfoodSeed.test.ts"),
  subagentDesktopDogfoodScenario: await readText("src/main/subagents/subagentDesktopDogfoodScenario.ts"),
  subagentDesktopDogfoodE2eTest: await readText("src/main/subagents/subagentDesktopDogfood.e2e.test.ts"),
  subagentDesktopDogfoodE2eSupport: await readText("src/main/subagents/subagentDesktopDogfoodE2eSupport.ts"),
  subagentDesktopDogfoodUiInspectors: await readText("src/main/subagents/subagentDesktopDogfoodUiInspectors.ts"),
  subagentReviewedMaturityEvidence: await readText("src/main/subagents/subagentReviewedMaturityEvidence.ts"),
  subagentReviewedMaturityEvidenceTest: await readText("src/main/subagents/subagentReviewedMaturityEvidence.test.ts"),
  subagentInvariants: await readText("src/main/subagents/subagentInvariants.ts"),
  subagentInvariantsTest: await readText("src/main/subagents/subagentInvariants.test.ts"),
  subagentObservability: await readText("src/main/subagents/subagentObservability.ts"),
  subagentObservabilityTest: await readText("src/main/subagents/subagentObservability.test.ts"),
  diagnostics: await readText("src/main/diagnostics/diagnostics.ts"),
  diagnosticsTest: await readText("src/main/diagnostics/diagnostics.test.ts"),
  diagnosticsIpc: await readText("src/main/ipc/registerDiagnosticsIpc.ts"),
  diagnosticBundleImport: await readText("src/main/diagnostics/diagnosticBundleImport.ts"),
  diagnosticBundleImportTest: await readText("src/main/diagnostics/diagnosticBundleImport.test.ts"),
  subagentRepair: await readText("src/main/subagents/subagentRepair.ts"),
  subagentRepairTest: await readText("src/main/subagents/subagentRepair.test.ts"),
  subagentRetention: await readText("src/main/subagents/subagentRetention.ts"),
  subagentRetentionTest: await readText("src/main/subagents/subagentRetention.test.ts"),
  subagentIdempotency: await readText("src/main/subagents/subagentIdempotency.ts"),
  subagentIdempotencyTest: await readText("src/main/subagents/subagentIdempotency.test.ts"),
  piChildSessionAdapter: await readText("src/main/pi/piChildSessionAdapter.ts"),
  piChildSessionAdapterTest: await readText("src/main/pi/piChildSessionAdapter.test.ts"),
  piEventMapper: await readText("src/main/pi/piEventMapper.ts"),
  piEventMapperTest: await readText("src/main/pi/piEventMapper.test.ts"),
  subagentRuntimeEventPersistence: await readText("src/main/subagents/subagentRuntimeEventPersistence.ts"),
  subagentRuntimeEventPersistenceTest: await readText("src/main/subagents/subagentRuntimeEventPersistence.test.ts"),
  subagentPromptRuntime: await readText("src/main/subagents/subagentPromptRuntime.ts"),
  subagentPromptRuntimeTest: await readText("src/main/subagents/subagentPromptRuntime.test.ts"),
  subagentCompletionGuard: await readText("src/main/subagents/subagentCompletionGuard.ts"),
  subagentCompletionGuardTest: await readText("src/main/subagents/subagentCompletionGuard.test.ts"),
  subagentStartupReconciliation: await readText("src/main/subagents/subagentStartupReconciliation.ts"),
  subagentStartupReconciliationTest: await readText("src/main/subagents/subagentStartupReconciliation.test.ts"),
  subagentLifecycleParentMailbox: await readText("src/main/subagents/subagentLifecycleParentMailbox.ts"),
  subagentLifecycleParentMailboxTest: await readText("src/main/subagents/subagentLifecycleParentMailbox.test.ts"),
  subagentLifecycleHooks: await readText("src/main/subagents/subagentLifecycleHooks.ts"),
  subagentLifecycleHooksTest: await readText("src/main/subagents/subagentLifecycleHooks.test.ts"),
  subagentApprovalBridge: await readText("src/main/subagents/subagentApprovalBridge.ts"),
  subagentApprovalBridgeTest: await readText("src/main/subagents/subagentApprovalBridge.test.ts"),
  subagentSupervisorRequest: await readText("src/main/subagents/subagentSupervisorRequest.ts"),
  subagentSupervisorRequestTest: await readText("src/main/subagents/subagentSupervisorRequest.test.ts"),
  subagentApprovalDecision: await readText("src/main/subagents/subagentApprovalDecision.ts"),
  subagentApprovalDecisionTest: await readText("src/main/subagents/subagentApprovalDecision.test.ts"),
  subagentIpc: await readText("src/main/ipc/registerSubagentIpc.ts"),
  subagentIpcTest: await readText("src/main/ipc/registerSubagentIpc.test.ts"),
  agentRuntime: await readText("src/main/agent-runtime/agentRuntime.ts"),
  agentRuntimeTest: [
    await readText("src/main/agent-runtime/agentRuntime.test.ts"),
    await readText("src/main/agent-runtime/agentRuntimeLocalTextRouting.test.ts"),
    await readText("src/main/agent-runtime/agentRuntimeSubagentWaitLiveness.test.ts"),
    await readText("src/main/agent-runtime/agentRuntimeSubagentNativeApproval.test.ts"),
    await readText("src/main/agent-runtime/agentRuntimeSubagentAuthorityRouting.test.ts"),
  ].join("\n"),
  subagentChildActiveTools: await readText("src/main/subagents/subagentChildActiveTools.ts"),
  subagentChildActiveToolsTest: await readText("src/main/subagents/subagentChildActiveTools.test.ts"),
  projectStore: await readText("src/main/projectStore/projectStore.ts"),
  projectStoreSchema: await readText("src/main/projectStore/projectStoreSchema.ts"),
  projectStoreSubagentFoundationTest: [
    await readText("src/main/projectStore/projectStoreSubagentFoundation.test.ts"),
    await readText("src/main/projectStore/projectStoreSubagentBatchFacade.test.ts"),
    await readText("src/main/projectStore/projectStoreSubagentRetentionParentStop.test.ts"),
  ].join("\n"),
  subagentPiTools: await readText("src/main/subagents/subagentPiTools.ts"),
  subagentPiToolsTest: await readText("src/main/subagents/subagentPiTools.test.ts"),
  subagentPiToolsWaitSynthesisTest: await readText("src/main/subagents/subagentPiToolsWaitSynthesis.test.ts"),
  subagentPiToolInput: await readText("src/main/subagents/subagentPiToolInput.ts"),
  subagentPiToolInputTest: await readText("src/main/subagents/subagentPiToolInput.test.ts"),
  subagentPiToolResult: await readText("src/main/subagents/subagentPiToolResult.ts"),
  subagentPiToolResultTest: await readText("src/main/subagents/subagentPiToolResult.test.ts"),
  subagentSpawnPreRunPlanner: await readText("src/main/subagents/subagentSpawnPreRunPlanner.ts"),
  subagentSpawnPreRunPlannerTest: await readText("src/main/subagents/subagentSpawnPreRunPlanner.test.ts"),
  subagentSpawnPreflightResolver: await readText("src/main/subagents/subagentSpawnPreflightResolver.ts"),
  subagentSpawnPreflightResolverTest: await readText("src/main/subagents/subagentSpawnPreflightResolver.test.ts"),
  subagentChildWorktreePreparer: await readText("src/main/subagents/subagentChildWorktreePreparer.ts"),
  subagentChildWorktreePreparerTest: await readText("src/main/subagents/subagentChildWorktreePreparer.test.ts"),
  subagentTargetResolver: await readText("src/main/subagents/subagentTargetResolver.ts"),
  subagentTargetResolverTest: await readText("src/main/subagents/subagentTargetResolver.test.ts"),
  subagentToolScopeRequest: await readText("src/main/subagents/subagentToolScopeRequest.ts"),
  subagentToolScopeRequestTest: await readText("src/main/subagents/subagentToolScopeRequest.test.ts"),
  subagentToolScopeLaunchPolicy: await readText("src/main/subagents/subagentToolScopeLaunchPolicy.ts"),
  subagentToolScopeLaunchPolicyTest: await readText("src/main/subagents/subagentToolScopeLaunchPolicy.test.ts"),
  subagentDelegatedToolAuthority: await readText("src/main/subagents/subagentDelegatedToolAuthority.ts"),
  subagentDelegatedToolAuthorityTest: await readText("src/main/subagents/subagentDelegatedToolAuthority.test.ts"),
  subagentSpawnBlockDecision: await readText("src/main/subagents/subagentSpawnBlockDecision.ts"),
  subagentSpawnBlockDecisionTest: await readText("src/main/subagents/subagentSpawnBlockDecision.test.ts"),
  subagentPreRunSpawnFailureRecorder: await readText("src/main/subagents/subagentPreRunSpawnFailureRecorder.ts"),
  subagentPreRunSpawnFailureRecorderTest: await readText("src/main/subagents/subagentPreRunSpawnFailureRecorder.test.ts"),
  subagentPostReservationSpawnFailureRecorder: await readText("src/main/subagents/subagentPostReservationSpawnFailureRecorder.ts"),
  subagentPostReservationSpawnFailureRecorderTest: await readText("src/main/subagents/subagentPostReservationSpawnFailureRecorder.test.ts"),
  subagentLaunchRejectionRecorder: await readText("src/main/subagents/subagentLaunchRejectionRecorder.ts"),
  subagentLaunchRejectionRecorderTest: await readText("src/main/subagents/subagentLaunchRejectionRecorder.test.ts"),
  subagentSpawnLaunchExecutor: await readText("src/main/subagents/subagentSpawnLaunchExecutor.ts"),
  subagentSpawnLaunchExecutorTest: await readText("src/main/subagents/subagentSpawnLaunchExecutor.test.ts"),
  symphonyMutationWorkspaceLeaseService: await readText("src/main/subagents/symphonyMutationWorkspaceLeaseService.ts"),
  symphonyMutationWorkspaceLeaseServiceTest: await readText("src/main/subagents/symphonyMutationWorkspaceLeaseService.test.ts"),
  subagentChildDecisionRequest: await readText("src/shared/subagentChildDecisionRequests.ts"),
  subagentChildDecisionRequestTest: await readText("src/main/subagents/subagentChildDecisionRequest.test.ts"),
  subagentFailedSpawnWaitBarrier: await readText("src/main/subagents/subagentFailedSpawnWaitBarrier.ts"),
  subagentFailedSpawnWaitBarrierTest: await readText("src/main/subagents/subagentFailedSpawnWaitBarrier.test.ts"),
  subagentResultValidation: await readText("src/main/subagents/subagentResultValidation.ts"),
  subagentResultValidationTest: await readText("src/main/subagents/subagentResultValidation.test.ts"),
  subagentWaitBarrierResolution: await readText("src/main/subagents/subagentWaitBarrierResolution.ts"),
  subagentWaitBarrierResolutionTest: await readText("src/main/subagents/subagentWaitBarrierResolution.test.ts"),
  subagentWaitContextResolver: await readText("src/main/subagents/subagentWaitContextResolver.ts"),
  subagentWaitContextResolverTest: await readText("src/main/subagents/subagentWaitContextResolver.test.ts"),
  subagentWaitAgentExecutor: await readText("src/main/subagents/subagentWaitAgentExecutor.ts"),
  subagentWaitAgentExecutorTest: await readText("src/main/subagents/subagentWaitAgentExecutor.test.ts"),
  subagentTurnBudgetWrapUpRecorder: await readText("src/main/subagents/subagentTurnBudgetWrapUpRecorder.ts"),
  subagentTurnBudgetWrapUpRecorderTest: await readText("src/main/subagents/subagentTurnBudgetWrapUpRecorder.test.ts"),
  subagentTurnBudgetExhaustionRecorder: await readText("src/main/subagents/subagentTurnBudgetExhaustionRecorder.ts"),
  subagentWaitCompletionRecorder: await readText("src/main/subagents/subagentWaitCompletionRecorder.ts"),
  subagentWaitCompletionRecorderTest: await readText("src/main/subagents/subagentWaitCompletionRecorder.test.ts"),
  subagentWaitBarrierAttentionRecorder: await readText("src/main/subagents/subagentWaitBarrierAttentionRecorder.ts"),
  subagentWaitBarrierAttentionRecorderTest: await readText("src/main/subagents/subagentWaitBarrierAttentionRecorder.test.ts"),
  subagentSpawnFailure: await readText("src/main/subagents/subagentSpawnFailure.ts"),
  subagentSpawnFailureTest: await readText("src/main/subagents/subagentSpawnFailure.test.ts"),
  subagentSpawnRequest: await readText("src/main/subagents/subagentSpawnRequest.ts"),
  subagentSpawnRequestTest: await readText("src/main/subagents/subagentSpawnRequest.test.ts"),
  subagentMailbox: await readText("src/main/subagents/subagentMailbox.ts"),
  subagentMailboxTest: await readText("src/main/subagents/subagentMailbox.test.ts"),
  subagentMailboxRequest: await readText("src/main/subagents/subagentMailboxRequest.ts"),
  subagentMailboxRequestTest: await readText("src/main/subagents/subagentMailboxRequest.test.ts"),
  subagentChildMailboxExecutor: await readText("src/main/subagents/subagentChildMailboxExecutor.ts"),
  subagentChildMailboxExecutorTest: await readText("src/main/subagents/subagentChildMailboxExecutor.test.ts"),
  subagentAgentStatus: await readText("src/main/subagents/subagentAgentStatus.ts"),
  subagentAgentStatusTest: await readText("src/main/subagents/subagentAgentStatus.test.ts"),
  subagentToolScopeSnapshot: await readText("src/main/subagents/subagentToolScopeSnapshot.ts"),
  subagentToolScopeSnapshotTest: await readText("src/main/subagents/subagentToolScopeSnapshot.test.ts"),
  subagentGroupJoin: await readText("src/main/subagents/subagentGroupJoin.ts"),
  subagentGroupJoinTest: await readText("src/main/subagents/subagentGroupJoin.test.ts"),
  subagentGroupedCompletionRecorder: await readText("src/main/subagents/subagentGroupedCompletionRecorder.ts"),
  subagentGroupedCompletionRecorderTest: await readText("src/main/subagents/subagentGroupedCompletionRecorder.test.ts"),
  subagentParentPolicyResolution: await readText("src/main/subagents/subagentParentPolicyResolution.ts"),
  subagentParentPolicyResolutionTest: await readText("src/main/subagents/subagentParentPolicyResolution.test.ts"),
  subagentWaitBarrierEvaluation: await readText("src/main/subagents/subagentWaitBarrierEvaluation.ts"),
  subagentWaitBarrierEvaluationTest: await readText("src/main/subagents/subagentWaitBarrierEvaluation.test.ts"),
  subagentWaitMailbox: await readText("src/main/subagents/subagentWaitMailbox.ts"),
  subagentWaitMailboxTest: await readText("src/main/subagents/subagentWaitMailbox.test.ts"),
  subagentBarrierDecision: await readText("src/main/subagents/subagentBarrierDecision.ts"),
  subagentBarrierDecisionTest: await readText("src/main/subagents/subagentBarrierDecision.test.ts"),
  subagentBarrierDecisionRecorder: await readText("src/main/subagents/subagentBarrierDecisionRecorder.ts"),
  subagentBarrierDecisionRecorderTest: await readText("src/main/subagents/subagentBarrierDecisionRecorder.test.ts"),
  subagentBarrierControl: await readText("src/main/subagents/subagentBarrierControl.ts"),
  subagentBarrierControlTest: await readText("src/main/subagents/subagentBarrierControl.test.ts"),
  subagentBarrierControlExecutor: await readText("src/main/subagents/subagentBarrierControlExecutor.ts"),
  subagentBarrierControlExecutorTest: await readText("src/main/subagents/subagentBarrierControlExecutor.test.ts"),
  subagentBarrierDecisionExecutor: await readText("src/main/subagents/subagentBarrierDecisionExecutor.ts"),
  subagentBarrierDecisionExecutorTest: await readText("src/main/subagents/subagentBarrierDecisionExecutor.test.ts"),
  subagentCancelAgent: await readText("src/main/subagents/subagentCancelAgent.ts"),
  subagentCancelAgentTest: await readText("src/main/subagents/subagentCancelAgent.test.ts"),
  subagentCancelAgentExecutor: await readText("src/main/subagents/subagentCancelAgentExecutor.ts"),
  subagentCancelAgentExecutorTest: await readText("src/main/subagents/subagentCancelAgentExecutor.test.ts"),
  subagentCloseAgent: await readText("src/main/subagents/subagentCloseAgent.ts"),
  subagentCloseAgentTest: await readText("src/main/subagents/subagentCloseAgent.test.ts"),
  subagentCloseAgentExecutor: await readText("src/main/subagents/subagentCloseAgentExecutor.ts"),
  subagentCloseAgentExecutorTest: await readText("src/main/subagents/subagentCloseAgentExecutor.test.ts"),
  subagentBatchJobs: await readText("src/main/subagents/subagentBatchJobs.ts"),
  subagentBatchJobsTest: await readText("src/main/subagents/subagentBatchJobs.test.ts"),
  localTextDelegation: await readText("src/main/local-runtime/localTextDelegation.ts"),
  localTextDelegationTest: await readText("src/main/local-runtime/localTextDelegation.test.ts"),
  localTextSubagentRuntime: await readText("src/main/local-runtime/localTextSubagentRuntime.ts"),
  localTextSubagentRuntimeTest: await readText("src/main/local-runtime/localTextSubagentRuntime.test.ts"),
  localModelRuntimeManager: await readText("src/main/local-runtime/localModelRuntimeManager.ts"),
  localModelRuntimeManagerTest: await readText("src/main/local-runtime/localModelRuntimeManager.test.ts"),
  localRuntimeInventory: await readText("src/main/local-runtime/localRuntimeInventory.ts"),
  localRuntimeInventoryTest: await readText("src/main/local-runtime/localRuntimeInventory.test.ts"),
  localModelRuntimeStatus: await readText("src/main/local-runtime/localModelRuntimeStatus.ts"),
  localModelRuntimeStatusTest: await readText("src/main/local-runtime/localModelRuntimeStatus.test.ts"),
  localModelRuntimeStart: await readText("src/main/local-runtime/localModelRuntimeStart.ts"),
  localModelRuntimeStartTest: await readText("src/main/local-runtime/localModelRuntimeStart.test.ts"),
  localModelRuntimeStop: await readText("src/main/local-runtime/localModelRuntimeStop.ts"),
  localModelRuntimeStopTest: await readText("src/main/local-runtime/localModelRuntimeStop.test.ts"),
  localModelRuntimeRestart: await readText("src/main/local-runtime/localModelRuntimeRestart.ts"),
  localModelRuntimeRestartTest: await readText("src/main/local-runtime/localModelRuntimeRestart.test.ts"),
  agentRuntimeLocalRuntimeTools: await readText("src/main/local-runtime/agentRuntimeLocalRuntimeTools.ts"),
  agentRuntimeLocalRuntimeToolsTest: await readText("src/main/local-runtime/agentRuntimeLocalRuntimeTools.test.ts"),
  localRuntimeOwnershipResolution: await readText("src/main/local-runtime/localRuntimeOwnershipResolution.ts"),
  localModelResourceRegistry: await readText("src/main/local-runtime/localModelResourceRegistry.ts"),
  localModelResourceRegistryTest: await readText("src/main/local-runtime/localModelResourceRegistry.test.ts"),
  localTextSubagentStartupConfig: await readText("src/main/local-runtime/localTextSubagentStartupConfig.ts"),
  localTextSubagentStartupConfigTest: await readText("src/main/local-runtime/localTextSubagentStartupConfig.test.ts"),
  subagentParentClusterUiModel: await readText("src/renderer/src/subagentParentClusterUiModel.ts"),
  subagentParentClusterUiModelTest: await readText("src/renderer/src/subagentParentClusterUiModel.test.ts"),
  subagentParentClusterComponent: await readText("src/renderer/src/SubagentParentCluster.tsx"),
  subagentParentClusterComponentTest: await readText("src/renderer/src/SubagentParentCluster.test.tsx"),
  subagentChildTranscriptComponent: await readText("src/renderer/src/SubagentChildTranscriptLive.tsx"),
  subagentChildTranscriptComponentTest: await readText("src/renderer/src/SubagentChildTranscriptLive.test.tsx"),
  subagentChildTranscriptUiModel: await readText("src/renderer/src/subagentChildTranscriptUiModel.ts"),
  subagentChildTranscriptUiModelTest: await readText("src/renderer/src/subagentChildTranscriptUiModel.test.ts"),
  appConversationMessagesTest: await readText("src/renderer/src/AppConversationMessages.test.tsx"),
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
  subagentThreatModelTest: await readText("src/main/subagents/subagentThreatModel.test.ts"),
  subagentPiToolLiveSmoke: await readText("src/main/subagents/subagentPiToolLiveSmoke.live.test.ts"),
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
