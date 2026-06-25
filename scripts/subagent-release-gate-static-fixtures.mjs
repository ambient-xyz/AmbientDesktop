export function packageJson() {
  return {
    scripts: {
      "test:subagents:replay-diagnostics": "node scripts/subagent-replay-diagnostics.mjs",
      "test:subagents:replay-diagnostics:unit": "pnpm exec vitest run scripts/subagent-replay-diagnostics.test.mjs",
      "test:callable-workflow-dogfood:proof":
        'AMBIENT_CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_OUT=test-results/callable-workflow-dogfood/latest.json pnpm exec vitest run src/main/callable-workflow/callableWorkflowDogfoodEvidence.test.ts -t "builds mutating child workflow dogfood evidence with restart repair proof"',
      "test:callable-workflow-rehydration:proof":
        'AMBIENT_CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_OUT=test-results/callable-workflow-rehydration/latest.json pnpm exec vitest run src/main/callable-workflow/callableWorkflowRehydrationEvidence.test.ts -t "builds restart rehydration evidence for linked task artifacts, runs, progress, and usage"',
      "test:subagents:lifecycle-edges:proof":
        'AMBIENT_SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_OUT=test-results/subagent-lifecycle-edges/latest.json pnpm exec vitest run src/main/subagents/subagentLifecycleEdgeEvidence.test.ts -t "builds lifecycle edge evidence for restart, stop, detach, cancel, retry, timeout, and partial results"',
      "test:subagents:visual-ui": "pnpm exec vitest run src/renderer/src/SubagentParentCluster.visual.test.tsx",
      "test:subagents:integrated-ui": "pnpm exec vitest run src/renderer/src/SubagentIntegratedProductionUi.visual.test.tsx",
      "test:subagents:deterministic": deterministicSubagentTestScript(),
      "test:subagents:release-gate":
        "pnpm run test:callable-workflow-dogfood:proof && pnpm run test:callable-workflow-rehydration:proof && pnpm run test:subagents:lifecycle-edges:proof && pnpm run test:subagents:live-confidence:unit && pnpm run test:subagents:live-evidence-lanes:unit && pnpm run test:subagents:live-history-report:unit && pnpm run test:subagents:desktop-dogfood-history-report:unit && pnpm run test:local-runtime-control:proof && pnpm run test:subagents:deterministic && node scripts/subagent-release-gate.mjs",
      "test:subagents:release-gate:unit": "pnpm exec vitest run scripts/subagent-release-gate.test.mjs scripts/subagent-release-gate-maturity-history.test.mjs scripts/subagent-release-gate-package-scripts.test.mjs",
      "test:subagents:live-evidence-lanes:unit":
        "pnpm exec vitest run scripts/subagent-live-evidence-lanes.test.mjs src/shared/subagentLiveEvidenceLanes.test.ts",
      "subagents:live-history-report": "node scripts/subagent-live-history-report.mjs",
      "test:subagents:live-history-report:unit": "pnpm exec vitest run scripts/subagent-live-history-report.test.mjs",
      "subagents:desktop-dogfood-history-report": "node scripts/subagent-desktop-dogfood-history-report.mjs",
      "test:subagents:desktop-dogfood-history-report:unit":
        "pnpm exec vitest run scripts/subagent-desktop-dogfood-evidence-contract.test.mjs scripts/subagent-desktop-dogfood-history-report.test.mjs",
      "test:local-runtime-control:proof": "node scripts/local-runtime-control-proof-suite.mjs",
      "test:local-runtime-control:proof-gate": "node scripts/local-runtime-control-proof-gate.mjs",
      "test:local-runtime-control:proof-gate:unit": "pnpm exec vitest run scripts/local-runtime-control-proof-gate.test.mjs",
      "test:subagents:live":
        "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_SUBAGENT_LIVE=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentPiToolLiveSmoke.live.test.ts",
      "test:subagents:live:smoke":
        'AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_SUBAGENT_LIVE=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentPiToolLiveSmoke.live.test.ts -t "lets live Pi spawn a visible child thread with runtime events"',
      "test:subagents:live:authority":
        "pnpm run test:subagents:live:long-context-authority && pnpm run test:subagents:live:approval-authority && pnpm run test:subagents:live:browser-approval",
      "test:subagents:live:long-context-authority":
        'AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_SUBAGENT_LIVE=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentPiToolLiveSmoke.live.test.ts -t "lets a live child use long_context_process only on granted document roots"',
      "test:subagents:live:approval-authority":
        'AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_SUBAGENT_LIVE=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentPiToolLiveSmoke.live.test.ts -t "surfaces live child file authority approval requests to the parent"',
      "test:subagents:live:browser-approval":
        'AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_SUBAGENT_LIVE=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentPiToolLiveSmoke.live.test.ts -t "surfaces live child browser authority approval requests to the parent"',
      "test:subagents:live-confidence": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-live-confidence.mjs",
      "test:subagents:live-confidence:authority":
        "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-live-confidence.mjs --slice-kind=child_authority",
      "test:subagents:live-confidence:workflow-prereqs":
        "pnpm run test:workflow-local-file:live && pnpm run test:workflow-ui-dogfood:phase0-live && pnpm run test:callable-workflow-dogfood:proof && pnpm run test:callable-workflow-rehydration:proof",
      "test:subagents:live-confidence:workflow":
        "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-live-confidence.mjs --slice-kind=workflow_symphony",
      "test:subagents:live-confidence:workflow-broader-prereqs":
        "pnpm run test:workflow-local-file:live && pnpm run test:workflow-ui-dogfood:phase1-live:credentialed && pnpm run test:callable-workflow-dogfood:proof && pnpm run test:callable-workflow-rehydration:proof",
      "test:subagents:live-confidence:workflow-broader":
        "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-live-confidence.mjs --slice-kind=workflow_symphony_broader",
      "test:subagents:live-confidence:local-runtime":
        "node scripts/subagent-live-confidence.mjs --slice-kind=local_runtime --provider=local-runtime",
      "test:subagents:live-confidence:restart-repair-prereqs":
        "pnpm run test:subagents:replay-diagnostics && pnpm run test:subagents:lifecycle-edges:proof",
      "test:subagents:live-confidence:restart-repair":
        "node scripts/subagent-live-confidence.mjs --slice-kind=restart_repair --provider=replay-diagnostics",
      "test:subagents:live-confidence:lifecycle-edges":
        "node scripts/subagent-live-confidence.mjs --slice-kind=lifecycle_edges --provider=lifecycle-edge-proof",
      "test:subagents:live-confidence:desktop-dogfood":
        "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-live-confidence.mjs --slice-kind=desktop_dogfood",
      "test:subagents:live-confidence:unit":
        "pnpm exec vitest run scripts/harness-runtime.test.mjs scripts/subagent-live-confidence.test.mjs",
      "test:subagents:desktop-dogfood":
        "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/run-electron-dogfood.mjs --scenario=subagent-desktop-dogfood",
      "test:subagents:desktop-dogfood:unit": "pnpm exec vitest run scripts/subagent-desktop-dogfood.test.mjs",
      "test:subagents:desktop-dogfood-repeat":
        "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-desktop-dogfood-repeat.mjs",
      "test:subagents:desktop-dogfood-repeat:unit": "pnpm exec vitest run scripts/subagent-desktop-dogfood-repeat.test.mjs",
      "test:subagents:scenario-dogfood":
        "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_LIVE_MODEL=${AMBIENT_LIVE_MODEL:-moonshotai/kimi-k2.7-code} AMBIENT_SUBAGENT_SCENARIO_DOGFOOD=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentScenarioDogfood.live.test.ts",
      "test:subagents:release-gate:live":
        "pnpm run test:callable-workflow-dogfood:proof && pnpm run test:callable-workflow-rehydration:proof && pnpm run test:subagents:lifecycle-edges:proof && pnpm run test:subagents:live-confidence -- --allow-blocked && pnpm run test:subagents:live-confidence:authority -- --allow-blocked && pnpm run test:subagents:live-confidence:workflow -- --allow-blocked && pnpm run test:subagents:live-confidence:workflow-broader -- --allow-blocked && pnpm run test:subagents:live-confidence:local-runtime -- --allow-blocked && pnpm run test:subagents:live-confidence:restart-repair -- --allow-blocked && pnpm run test:subagents:live-confidence:lifecycle-edges -- --allow-blocked && pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked && pnpm run test:subagents:deterministic && node scripts/subagent-release-gate.mjs --require-live",
      "test:subagents:release-gate:graduation":
        "pnpm run test:callable-workflow-dogfood:proof && pnpm run test:callable-workflow-rehydration:proof && pnpm run test:subagents:lifecycle-edges:proof && pnpm run test:subagents:live-confidence -- --allow-blocked && pnpm run test:subagents:live-confidence:authority -- --allow-blocked && pnpm run test:subagents:live-confidence:workflow -- --allow-blocked && pnpm run test:subagents:live-confidence:workflow-broader -- --allow-blocked && pnpm run test:subagents:live-confidence:local-runtime -- --allow-blocked && pnpm run test:subagents:live-confidence:restart-repair -- --allow-blocked && pnpm run test:subagents:live-confidence:lifecycle-edges -- --allow-blocked && pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked && pnpm run test:subagents:desktop-dogfood-repeat -- --require-ready && pnpm run test:workflow-jitter-release-gate:release-profile && pnpm run subagents:live-history-report -- --require-ready && pnpm run test:subagents:deterministic && node scripts/subagent-release-gate.mjs --require-live --require-maturity-history",
      "test:workflow-local-file:live":
        'GMI_CLOUD_API_KEY_FILE=${GMI_CLOUD_API_KEY_FILE:-$(node scripts/resolve-gmi-cloud-key-file.mjs)} AMBIENT_PROVIDER=gmi-cloud AMBIENT_WORKFLOW_LIVE=1 bash scripts/test-node-native.sh src/main/workflow/workflowDogfood.test.ts -t "local-file report workflow with a live Ambient runtime call"',
      "test:workflow-ui-dogfood:phase1-live:credentialed":
        "pnpm run prepare:electron-native && AMBIENT_PROVIDER=gmi-cloud AMBIENT_WORKFLOW_UI_DOGFOOD_USE_SHARED_SNAPSHOT=1 node scripts/workflow-agent-thread-ui-dogfood-matrix.mjs --suite=phase1-live",
      "test:workflow-jitter-matrix:release-profile":
        "AMBIENT_PROVIDER=gmi-cloud node scripts/workflow-jitter-matrix.mjs --profile=release --require-live --promotion-gate --retries=1",
      "test:workflow-jitter-release-gate:release-profile":
        "AMBIENT_PROVIDER=gmi-cloud node scripts/workflow-jitter-release-profile-gate.mjs",
    },
  };
}

export function deterministicSubagentTestScript() {
  return [
    "pnpm run test:subagents:replay-diagnostics",
    "&&",
    "pnpm exec vitest run",
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
    "src/main/workflow-compiler/workflowCompilerService.test.ts", "src/main/workflow-compiler/workflowCompilerServicePromptTransport.test.ts",
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
    "src/main/subagents/subagentDesktopDogfoodEvidence.test.ts",
    "src/main/subagents/subagentLiveConfidenceEvidence.test.ts",
    "src/main/subagents/subagentLiveConfidenceMaturityEvidence.test.ts",
    "src/main/subagents/subagentMaturity.test.ts",
    "src/main/subagents/subagentThreatModel.test.ts",
    "src/main/projectStore/projectStoreSubagentFoundation.test.ts",
    "src/main/projectStore/projectStoreSubagentBatchFacade.test.ts",
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
    "src/main/subagents/subagentToolScopeSnapshot.test.ts",
    "src/main/subagents/subagentGroupJoin.test.ts",
    "src/main/subagents/subagentGroupedCompletionRecorder.test.ts",
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
  ].join(" ");
}
export function files() {
  return {
    packageJson:
      "subagents:live-history-report test:subagents:live-history-report:unit pnpm run test:subagents:live-history-report:unit subagents:desktop-dogfood-history-report test:subagents:desktop-dogfood-history-report:unit pnpm run test:subagents:desktop-dogfood-history-report:unit test:subagents:desktop-dogfood test:subagents:desktop-dogfood-repeat test:subagents:desktop-dogfood-repeat:unit test:symphony:sym-pattern-six-pack test:symphony:sym-parent-not-worker test:symphony:sym-web-capability-routing test:symphony:sym-scratch-overlay-isolation test:symphony:sym-barrier-decision-replay test:symphony:sym-live-ux-export test:symphony:canonical pnpm run test:symphony:canonical && SubagentChildTranscriptLive.test.tsx AppConversationMessages.test.tsx SubagentParentCluster.test.tsx subagentChildTranscriptUiModel.test.ts chatExport.test.ts",
    featureFlags: [
      'export const AMBIENT_SUBAGENTS_FEATURE_FLAG = "ambient.subagents" as const;',
      "const DEFAULT_AMBIENT_FEATURE_FLAG_SETTINGS = { subagents: false };",
      "function parseAmbientFeatureFlagLaunchArgs() { return ['--enable-feature=', '--disable-feature=']; }",
    ].join("\n"),
    mainIndex:
      "listSubagentParentMailboxEventsForParentThread(active) listCallableWorkflowTasksForParentThread(active) callableWorkflowTasks onParentMailboxEventUpdated defaultPayload.bundle.subagents.replayEvidence importDiagnosticBundleFromFile(filePath) requireProjectRuntimeHostForCallableWorkflowTask callable-workflow:cancel-task callable-workflow:pause-task callable-workflow:resume-task Callable workflow task controls are disabled while ambient.subagents is off. subagents:cancel-run subagents:close-run Sub-agent child controls are disabled because ambient.subagents is off.",
    ambientModels:
      "AmbientModelRuntimeProfile AmbientModelRuntimeCatalog selectableAsMain selectableAsSubagent ambientModelOptionsFromRuntimeProfiles ambientModelRuntimeCatalogFromProfiles selectableMainModelOptions",
    ambientModelsTest: "can derive future cloud or local main model options",
    modelRuntimeSettings:
      "MODEL_RUNTIME_INSTALLED_PROVIDER_SCHEMA_VERSION modelRuntimeProvidersFromSettings modelRuntimeProfilesFromSettings modelRuntimeSettingsWithInstalledProvider Installed provider is disabled in Settings.",
    modelRuntimeSettingsTest:
      "normalizes installed provider records while preserving exact custom provider and model ids keeps disabled installed providers visible as unavailable runtime profiles redacts secret-shaped diagnostic text before provider settings are persisted",
    sharedTypes:
      "modelCatalog parentMessageId?: string DiagnosticExportSubagentReplayEvidence DiagnosticExportCallableWorkflowReplayItem DiagnosticExportCallableWorkflowRestartIssueItem replayEvidence?: DiagnosticExportSubagentReplayEvidence parentMailboxTimeline parentMailboxEventCount callableWorkflowTaskTimeline callableWorkflowTaskIssues callableWorkflowTaskCount callableWorkflowTasks: number failureStage?: string approvalMode?: string approvalUnavailable?: boolean deniedCategoryIds?: string[] deniedToolIds?: string[] childIdleOpenRunCount childIdleTotalMs childIdleMaxMs importDiagnosticBundle CallableWorkflowTaskSummary CallableWorkflowTaskRestartReconciliationSummary CancelCallableWorkflowTaskInput PauseCallableWorkflowTaskInput ResumeCallableWorkflowTaskInput CancelSubagentRunInput CloseSubagentRunInput SubagentWaitBarrierDecision ResolveSubagentWaitBarrierInput SubagentWaitBarrierResolutionResult workflowThreadId?: string CallableWorkflowTaskProgressSnapshot CallableWorkflowTaskUsageSnapshot progressSnapshot usageSnapshot callableWorkflowTasks: CallableWorkflowTaskSummary[] callable-workflow-task-updated cancelCallableWorkflowTask(input: CancelCallableWorkflowTaskInput) pauseCallableWorkflowTask(input: PauseCallableWorkflowTaskInput) resumeCallableWorkflowTask(input: ResumeCallableWorkflowTaskInput) cancelSubagentRun(input: CancelSubagentRunInput) closeSubagentRun(input: CloseSubagentRunInput) resolveSubagentWaitBarrier(input: ResolveSubagentWaitBarrierInput)",
    preload:
      "cancelSubagentRun: (input: CancelSubagentRunInput) closeSubagentRun: (input: CloseSubagentRunInput) resolveSubagentWaitBarrier subagents:resolve-wait-barrier",
    subagentRoles: "schedulingPolicy live_parent_only automation_deferred",
    agentRoleRegistry: "schedulingPolicy live_parent_only automation_deferred",
    agentRoleRegistryTest: "schedulingPolicy live_parent_only reports invalid categories, scheduling policies",
    modelRuntimeRegistry: "createModelRuntimeCatalog listSelectableMainProfiles listSelectableSubagentProfiles unknownModelRuntimeProfile",
    modelRuntimeRegistryTest:
      "lists and resolves default model runtime profiles adds Settings-installed provider descriptors to runtime catalogs",
    modelProviderInstallTemplates:
      "MODEL_PROVIDER_INSTALL_TEMPLATES MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION generic-openai-compatible generic-anthropic-compatible ambient_cli_secret_request ambient_cli_env_bind buildModelProviderCapabilityProbePlan streaming context_window structured_json schema_output tool_use image_input latency error_shape health local_memory reliability",
    modelProviderCapabilityProbe:
      "MODEL_PROVIDER_INSTALL_TEMPLATES MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION generic-openai-compatible generic-anthropic-compatible ambient_cli_secret_request ambient_cli_env_bind buildModelProviderCapabilityProbePlan probeModelProviderCapabilityEligibility modelRuntimeProfileWithCapabilityProbeEligibility streaming context_window structured_json schema_output tool_use image_input latency error_shape health local_memory reliability",
    modelProviderCapabilityProbeTest:
      "defines known provider templates and generic endpoint installer shapes with Ambient-managed secret flows builds probe plans that preserve custom model ids exactly marks main and sub-agent eligibility only after required capability probes pass blocks local sub-agent eligibility without health, memory, and reliability evidence rejects stale capability reports from another template, provider, or model id",
    modelProviderCapabilityProbeRunner:
      "MODEL_PROVIDER_CAPABILITY_PROBE_RUNNER_SCHEMA_VERSION runModelProviderCapabilityProbePlan ModelProviderCapabilityProbeRunnerAdapter runCapabilityProbe MODEL_PROVIDER_CAPABILITY_PROBE_EVIDENCE_MAX_CHARS",
    modelProviderCapabilityProbeRunnerTest:
      "executes every planned probe and preserves the exact provider/model identity feeds eligibility only from actual probe observations records thrown probe failures without leaking secret-shaped evidence bounds large probe evidence before it enters the report",
    modelProviderEndpointProbeAdapter:
      "createModelProviderEndpointProbeAdapter ModelProviderEndpointProbeAdapterConfig openai-compatible anthropic-compatible Endpoint accepted a tiny image input request. Endpoint returned an event-stream style streaming response. Ambient-managed secret is required before probing this endpoint.",
    modelProviderEndpointProbeAdapterTest:
      "probes OpenAI-compatible endpoint capabilities through real HTTP request shapes probes Anthropic-compatible messages, streaming, tool use, and schema output fails safely when the endpoint adapter does not match the probe plan requires Ambient-managed secret material before endpoint probing",
    modelProviderEndpointProbeService:
      "MODEL_PROVIDER_ENDPOINT_PROBE_SERVICE_SCHEMA_VERSION runModelProviderEndpointProbeService candidateProfile modelRuntimeInstalledProviderFromEndpointProbeResult Exact provider and model ids were preserved before capability eligibility narrowing. Endpoint probe service cannot run local-text runtime templates; use local runtime probes instead.",
    modelProviderEndpointProbeServiceTest:
      "orchestrates OpenAI-compatible endpoint probes into an eligibility-narrowed runtime profile keeps endpoint models ineligible when required context-window evidence is unknown orchestrates Anthropic-compatible schema probes when the install flow requests them narrows sub-agent eligibility when endpoint tool-use probes fail but main probes pass rejects local runtime templates and missing managed secret material before endpoint probing",
    modelProviderCredentialStore:
      "MODEL_PROVIDER_CREDENTIAL_SAVE_SCHEMA_VERSION saveModelProviderCredentialForSettings ambient-model-provider-credential-owner-v1",
    modelProviderCredentialStoreTest:
      "saves model provider credentials as Ambient-managed refs without returning secret values uses known provider env names and endpoint identity when saving env-bound credentials rejects local and Ambient-managed templates before saving",
    modelProviderSettingsInstall:
      "MODEL_PROVIDER_SETTINGS_INSTALL_SCHEMA_VERSION installModelProviderEndpointForSettings credentialRef.managedSecretRef Settings endpoint provider install cannot run local-text runtime templates; use local runtime onboarding instead.",
    modelProviderSettingsInstallTest:
      "runs endpoint probes through an Ambient-managed secret resolver and saves a secret-free installed provider updates an existing installed provider record instead of duplicating it persists failed sub-agent eligibility as an installed but main-only profile rejects local runtime templates before resolving endpoint secrets",
    settingsIpc:
      "model-runtime:save-provider-credential model-runtime:install-endpoint-provider SaveModelProviderCredentialInput InstallModelProviderEndpointInput ModelProviderCredentialSaveResult credentialRef.managedSecretRef",
    settingsIpcTest:
      "saves model provider credentials as managed refs before endpoint install installs endpoint providers through managed credential references only rejects raw endpoint provider secret material before install",
    modelScopeResolver: "SubagentModelScopeCandidateDiagnostic candidateDiagnostics capabilityDiagnostics subagent_eligibility",
    modelScopeResolverTest: "candidateDiagnostics capabilityDiagnostics parent_fallback role_default",
    modelRuntimeCatalogUiModel:
      "modelRuntimeCatalogSettingsModel unavailableReason Runtime catalog modelProviderOnboardingSettingsModel blockerSummaryLabel forceConsequenceLabel",
    modelRuntimeCatalogUiModelTest: "configured local text runtime profiles",
    modelProviderOnboardingUiModel:
      "modelProviderOnboardingSettingsModel modelProviderCredentialSaveDraftModel modelProviderEndpointInstallDraftModel endpointInstallable credentialRef.managedSecretRef Desktop secret request Ignored env-bound secret file No chat secrets Ambient-managed credential Save credential Probe endpoint before eligibility Probe health and memory before eligibility",
    modelProviderOnboardingUiModelTest:
      "surfaces safe secret flows and real capability probes for generic endpoints marks GMI Cloud as an ignored env-bound secret flow keeps local runtimes health and memory gated before sub-agent eligibility does not ask users to paste API keys into chat builds a safe credential save request from provider endpoint fields builds a safe endpoint install request from a managed credential reference refuses local and managed templates for endpoint install requests",
    rightPanel:
      "saveModelProviderCredential installModelProviderEndpoint selectedDiagnosticExport?.subagents?.replayEvidence selectedDiagnosticExport?.localRuntimes?.evidence recordDiagnosticExportHistory diagnostics.export-history diagnostics.subagent-replay diagnostics.local-runtime-evidence Diagnostic export history Sub-agent replay Local runtime evidence diagnosticImportStatusMessage open diagnostic bundle readInitialDiagnosticExportHistory persistDiagnosticExportHistory Recent saved and imported diagnostic bundles from this app profile.",
    rightPanelSettingsCore: "model-mode.model-catalog Runtime catalog",
    rightPanelSettingsRuntime:
      "Runtime catalog Provider onboarding Endpoint probe Managed credential ref Ambient-managed credential Save credential function SubagentReplayEvidenceDiagnostics Callable workflow tasks function LocalRuntimeEvidenceDiagnostics function DiagnosticExportHistory Diagnostic export history Recent saved and imported diagnostic bundles from this app profile. Export diagnostics to inspect local runtime leases, blockers, and memory evidence. Export diagnostics to inspect child replay timelines.",
    sharedSubagentMaturity:
      "feature_flag_guarded live_dogfood_count live_dogfood_failure_rate desktop_dogfood_count desktop_dogfood_failure_rate workflow_jitter_release_profile live_smoke failure_rate maxLiveDogfoodFailureRate maxDesktopDogfoodFailureRate minDesktopDogfoodRuns restart_recovery completion_guard_visibility approval_routing_visibility production_ui_visibility event_attribution_integrity lifecycle_control_integrity retention_policy_integrity tool_scope_integrity unresolved_lifecycle_bugs unresolved_permission_bugs security_review",
    subagentLiveEvidenceLanesJson:
      "ambient-subagent-live-evidence-lanes-v1 liveAuthorityConfidenceSkipped Child authority confidence liveWorkflowBroaderConfidenceSkipped Broader Workflow/Symphony confidence liveDesktopDogfoodConfidenceSkipped Desktop dogfood confidence",
    subagentLiveEvidenceLanes:
      "SUBAGENT_LIVE_EVIDENCE_LANES SUBAGENT_LIVE_EVIDENCE_LABELS validateSubagentLiveEvidenceLaneDefinitions subagentLiveEvidenceLanes.json Child authority confidence Broader Workflow/Symphony confidence Desktop dogfood confidence",
    subagentLiveEvidenceLanesTest:
      "defines the release-gate lanes once, including child authority and Desktop dogfood confidence flags duplicate fields or labels before they can skew maturity history",
    subagentMaturity:
      "function evaluateSubagentMaturity() {} summarizeSubagentReleaseGateLiveHistory summarizeSubagentDesktopDogfoodHistory summarizeSubagentWorkflowJitterReleaseProfile liveReleaseGateHistory desktopDogfoodHistory cleanRequiredRunCount failedRequiredRunCount readyRunCount failedRunCount visualFailureRunCount maturityFailureRunCount feature_flag_guarded live_dogfood_count live_dogfood_failure_rate desktop_dogfood_count desktop_dogfood_failure_rate workflow_jitter_release_profile live_smoke failure_rate maxLiveDogfoodFailureRate maxDesktopDogfoodFailureRate minDesktopDogfoodRuns restart_recovery completion_guard_visibility approval_routing_visibility production_ui_visibility event_attribution_integrity lifecycle_control_integrity retention_policy_integrity tool_scope_integrity Completion guard visibility Approval routing visibility Production UI visibility Event attribution integrity Lifecycle control integrity Retention policy integrity Tool scope integrity unresolved_lifecycle_bugs unresolved_permission_bugs security_review SUBAGENT_LIVE_EVIDENCE_LABELS REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS",
    subagentMaturityTest:
      "blocks graduation when completion guard visibility evidence omits a required surface blocks graduation when approval routing visibility evidence omits a required surface blocks graduation when production UI visibility evidence omits a required surface blocks graduation when event attribution integrity evidence omits a required surface blocks graduation when lifecycle control integrity evidence omits a required surface blocks graduation when retention policy integrity evidence omits a required surface blocks graduation when tool scope integrity evidence omits a required surface",
    subagentLiveSmokeEvidence:
      "recordSubagentLiveSmokeEvidence recordSubagentLiveApprovalAuthorityEvidence live_dogfood_run live_pi_smoke validateSubagentResultArtifactForSynthesis runtimeStarted runtimeAssistantDelta runtimeCompleted parentReturned childTranscriptContainsSentinel childSummaryReturned SUBAGENT_LIVE_APPROVAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION ambient-subagent-live-approval-authority-evidence-v1 childPausedForApproval parentRemainedBlocked approvalForwardedToParent deniedContentLeaked",
    chatExport:
      "collectChildThreadBundles getChildThreadForExport listSubagentRunsForParentThread listSubagentParentMailboxEventsForParentThread listCallableWorkflowTasksForParentThread child-threads/index.json child-threads/evidence-summary.json child-threads/parent-mailbox-events.json child-threads/callable-workflow-tasks.json child-threads/pattern-graphs.json full-transcript.json full-transcript.md visible-transcript.md run-events.json mailbox-events.json tool-scope-snapshots.json wait-barriers.json childPiSessionCount childTranscriptLinks buildChildEvidenceSummaryIndex hiddenThinkingMessageCount hiddenEmptyAssistantMessageCount missing_full_child_transcript latestToolScopeSnapshot parentApprovalBridgeEventCount evidenceGaps missing_child_bundle",
    chatExportTest:
      "includes direct sub-agent child transcripts and runtime evidence child-threads/index.json child-threads/evidence-summary.json child-threads/parent-mailbox-events.json child-threads/callable-workflow-tasks.json child-threads/pattern-graphs.json full-transcript.json full-transcript.md visible-transcript.md run-events.json mailbox-events.json tool-scope-snapshots.json wait-barriers.json childPiSessionCount childTranscriptLinks CHILD_THINKING_ROUTE hiddenThinkingMessageCount hiddenEmptyAssistantMessageCount latestToolScopeSnapshot parentApprovalBridgeEventCount evidenceGaps child runtime events are exported parent mailbox approval evidence is exported",
    subagentLiveHistoryEvidence:
      "SUBAGENT_LIVE_HISTORY_EVIDENCE_SCHEMA_VERSION ambient-subagent-live-history-evidence-v1 recordSubagentReleaseGateLiveHistoryEvidence normalizeReleaseGateLiveHistoryEntry live_dogfood_run releaseGateHistoryEntry skippedLiveEvidence SUBAGENT_LIVE_EVIDENCE_LABELS",
    subagentLiveHistoryEvidenceTest:
      "records clean required-live release-gate history rows as live dogfood maturity evidence records failed maturity evidence when required-live history skips lanes or has advisories src/main/subagents/subagentLiveHistoryEvidence.test.ts",
    subagentDesktopDogfoodEvidence:
      "SUBAGENT_DESKTOP_DOGFOOD_EVIDENCE_SCHEMA_VERSION ambient-subagent-desktop-dogfood-evidence-v1 recordSubagentDesktopDogfoodEvidence buildSubagentDesktopDogfoodHistoryEntry desktop_dogfood_run desktopDogfoodHistoryEntry visualAssertionSummary maturityAssertionSummary workflowHighLoadPatternCount horizontalOverflowFree",
    subagentDesktopDogfoodEvidenceTest:
      "records passed Desktop dogfood artifacts as maturity evidence with a history entry records failed Desktop dogfood maturity evidence with actionable issues src/main/subagents/subagentDesktopDogfoodEvidence.test.ts",
    subagentLiveConfidenceEvidence:
      "SUBAGENT_LIVE_CONFIDENCE_EVIDENCE_SCHEMA_VERSION createSubagentLiveConfidenceEvidence validateSubagentLiveConfidenceEvidence summarizeSubagentLiveConfidenceEvidence pi_tool_prompt child_authority workflow_symphony workflow_symphony_broader local_runtime restart_repair lifecycle_edges desktop_dogfood deterministic_only featureFlagSnapshot maturityAssertions validateRestartRepairMaturityAssertions restart_repair_runtime_event_replay restart_repair_child_tree_repair restart_repair_mailbox_rehydration restart_repair_artifact_pointer_rehydration restart_repair_lifecycle_edge_coverage restart_repair_synthesis_safety validateLifecycleEdgeMaturityAssertions validateDesktopDogfoodMaturityAssertions lifecycle_edge_restart lifecycle_edge_stop lifecycle_edge_detach lifecycle_edge_cancel lifecycle_edge_retry lifecycle_edge_timeout lifecycle_edge_partial_result lifecycle_edge_synthesis_safety desktop_dogfood_scenario_coverage desktop_dogfood_visual_layout desktop_dogfood_lifecycle_edges desktop_dogfood_runtime_and_operator_controls hypothesis expectedObservation actualOutcome confidenceDelta followUp closeoutAnswer saw_live no_live_surface classifiedBlockers secret-like material",
    subagentLiveConfidenceEvidenceTest:
      "creates release-usable evidence for a GMI-backed Pi prompt/tool slice allows deterministic-only slices to document why live validation was skipped rejects secret-like material before it can enter live confidence artifacts",
    subagentLiveConfidenceMaturityEvidence:
      "SUBAGENT_LIVE_CONFIDENCE_MATURITY_EVIDENCE_SCHEMA_VERSION ambient-subagent-live-confidence-maturity-evidence-v1 recordSubagentLiveConfidenceMaturityEvidence restart_recovery lifecycle_control_integrity production_ui_visibility restart_repair_runtime_event_replay lifecycle_edge_retry childRetryRecovery lifecycle_edge_partial_result desktop_dogfood_runtime_and_operator_controls does not map directly to a maturity gate",
    subagentLiveConfidenceMaturityEvidenceTest:
      "records passed restart repair live confidence as restart recovery maturity evidence records lifecycle edge live confidence with the booleans consumed by maturity gates records Desktop dogfood live confidence as production UI visibility maturity evidence src/main/subagents/subagentLiveConfidenceMaturityEvidence.test.ts",
    subagentLiveConfidenceRunner:
      "SUBAGENT_LIVE_CONFIDENCE_RUNNER_SCHEMA_VERSION buildSubagentLiveConfidencePlan runSubagentLiveConfidence buildSubagentLiveConfidenceEvidence hypothesis expectedObservation actualOutcome confidenceDelta followUp closeoutAnswer saw_live blocked child_authority child_long_context_authority child_file_approval_authority child_browser_approval_authority validateChildAuthorityConfidenceArtifacts validateLongContextAuthorityArtifact validateApprovalAuthorityArtifact validateBrowserApprovalAuthorityArtifact DEFAULT_SUBAGENT_AUTHORITY_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_LIVE_LONG_CONTEXT_AUTHORITY_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_APPROVAL_AUTHORITY_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_BROWSER_APPROVAL_ARTIFACT_PATH validateLiveSmokeArtifact validateWorkflowDogfoodArtifact validateWorkflowUiDogfoodMatrixArtifact validateWorkflowSymphonyConfidenceArtifacts validateCallableWorkflowDogfoodConfidenceArtifact validateCallableWorkflowRehydrationConfidenceArtifact workflowSymphonyMaturityAssertions live_workflow_run broader_workflow_ui_dogfood workflow_agent_ui_dogfood child_mutating_workflow workflow_task_artifact_rehydration workflow_launch_card_bounds workflow_mutating_child_worker workflow_parent_blocking_completion workflow_denied_child_scope workflow_restart_repair workflow_rehydrated_task_links workflow_rehydrated_artifact_payload workflow_rehydrated_progress_usage workflow_rehydrated_child_provenance dogfoodMaturity rehydrationMaturity Callable workflow dogfood maturity assertion workflow_launch_card_bounds status is failed; expected passed. Callable workflow rehydration maturity assertion workflow_rehydrated_progress_usage must record only passed evidence entries. localRuntimeMaturityAssertions local_runtime_active_lease_stop_blocker local_runtime_untracked_safety local_runtime_stale_lease_recovery local_runtime_provider_lifecycle local_runtime_proof_gate restartRepairMaturityAssertions restart_repair_runtime_event_replay restart_repair_child_tree_repair restart_repair_mailbox_rehydration restart_repair_artifact_pointer_rehydration restart_repair_lifecycle_edge_coverage restart_repair_synthesis_safety lifecycleEdgeMaturityAssertions lifecycle_edge_restart lifecycle_edge_stop lifecycle_edge_detach lifecycle_edge_cancel lifecycle_edge_retry lifecycle_edge_timeout lifecycle_edge_partial_result lifecycle_edge_synthesis_safety desktopDogfoodMaturityAssertions desktop_dogfood_scenario_coverage desktop_dogfood_visual_layout desktop_dogfood_lifecycle_edges desktop_dogfood_runtime_and_operator_controls validateLocalRuntimeControlProofArtifact validateRepeatedUntrackedObservations validateSubagentRestartRepairArtifact validateSubagentRestartRepairConfidenceArtifacts validateSubagentLifecycleEdgeArtifact validateDesktopDogfoodConfidenceArtifact DEFAULT_SUBAGENT_WORKFLOW_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_WORKFLOW_BROADER_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_WORKFLOW_UI_DOGFOOD_ARTIFACT_PATH DEFAULT_SUBAGENT_LOCAL_RUNTIME_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_RESTART_REPAIR_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_LIFECYCLE_EDGE_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_LIVE_WORKFLOW_ARTIFACT_PATH DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_DOGFOOD_ARTIFACT_PATH DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_REHYDRATION_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_LOCAL_RUNTIME_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_LOCAL_RUNTIME_GATE_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_RESTART_REPAIR_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_RESTART_REPAIR_FIXTURE_ARTIFACT_PATH DEFAULT_SUBAGENT_LIFECYCLE_EDGE_ARTIFACT_PATH DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_ARTIFACT_PATH test:subagents:live:smoke test:subagents:live:authority test:subagents:live-confidence:authority test:subagents:live-confidence:workflow-prereqs test:subagents:live-confidence:workflow-broader-prereqs test:workflow-ui-dogfood:phase1-live:credentialed test:local-runtime-control:proof test:subagents:lifecycle-edges:proof test:subagents:live-confidence:restart-repair-prereqs test:subagents:desktop-dogfood workflow-local-file-run-dogfood workflow-agent-thread-ui-dogfood callable-workflow-dogfood callable-workflow-rehydration workflow_task_rehydration mutating_child_workflow workflow-symphony-latest workflow-symphony-broader-latest child-authority-latest long-context-authority-latest approval-authority-latest browser-approval-latest local-runtime-latest restart-repair-latest lifecycle-edges-latest desktop-dogfood-latest local-runtime-control-proof untracked-runtime-safety untracked_runtime_safety repeatedObservationCount repeatedObservations Untracked runtime repeated observation lifecycle_action_preview did not keep ordinaryStopAllowed=false. stale-lease-recovery stale_lease_recovery mailbox_state_rehydration artifact_pointer_rehydration ask-user-to-stop-untracked subagent-replay-diagnostics subagent-lifecycle-edges subagent-desktop-dogfood partial_result_edge retry_edge synthesis_safety renderSubagentLiveConfidenceMarkdown classifiedBlockersForRun credential_missing credentialed_snapshot_missing exceeded the configured timeout failed before release-usable evidence was produced sanitizeEvidenceText",
    subagentLiveConfidenceRunnerTest:
      "writes JSON, Markdown, and sanitized command output artifacts classifies missing GMI credentials as an environmental blocker without secret leakage classifies timeouts as retryable live environmental blockers child_authority workflow_symphony local_runtime restart_repair lifecycle_edges builds a focused child authority live confidence plan classifies completed child authority evidence as release-usable writes workflow/Symphony confidence to a stable slice-specific artifact by default writes local runtime confidence to a stable slice-specific artifact by default writes restart repair confidence to a stable slice-specific artifact by default writes lifecycle edge confidence to a stable slice-specific artifact by default validates workflow dogfood validates local runtime control proof validates stale lease recovery validates restart repair replay diagnostics restart rehydration proof validates lifecycle edge proof artifacts callable workflow dogfood artifact callable workflow rehydration artifact",
    subagentReleaseGateRunner: "appendFile live-history.jsonl --live-history= --no-live-history",
    subagentReleaseGateRunnerLib:
      "SUBAGENT_RELEASE_GATE_LIVE_HISTORY_SCHEMA_VERSION ambient-subagent-release-gate-live-history-v1 buildSubagentReleaseGateLiveHistoryEntry --require-maturity-history AMBIENT_SUBAGENT_RELEASE_GATE_REQUIRE_MATURITY_HISTORY subagentLiveHistoryReportCheck liveHistoryReportSkipped liveHistoryReportPath Sub-agent live history report is required for maturity history but missing. REQUIRED_LIVE_HISTORY_GRADUATION_RUNS REQUIRED_LIVE_HISTORY_MAX_FAILURE_RATE REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS validateLiveHistoryEvidenceLanes desktopDogfoodHistoryReportCheck desktopDogfoodHistorySkipped desktopDogfoodHistoryPath Repeated Desktop dogfood maturity history is required but missing. workflowJitterReleaseProfileCheck workflowJitterReleaseProfileSkipped workflowJitterReleaseGatePath Workflow jitter release-profile evidence is required for maturity history but missing. REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_DOGFOOD_RUNS validateDesktopDogfoodHistoryScenarioCoverage requiredScenarioCoverage readyRowsWithCompleteVisuals readyRowsWithCompleteMaturity screenshotRunCount latestRuns checkCounts skippedLiveEvidence blockingIssueCount SUBAGENT_LIVE_EVIDENCE_DECISIONS liveAuthorityConfidenceSkipped Child authority confidence liveWorkflowBroaderConfidenceSkipped Broader Workflow/Symphony confidence liveDesktopDogfoodConfidenceSkipped Desktop dogfood confidence",
    subagentReleaseGateRunnerTest: "passes the deterministic gate with a skipped-live advisory summarizes required-live release gate runs as append-only history rows fails when a required package script is missing",
    subagentLiveEvidenceLanesScript:
      "SUBAGENT_LIVE_EVIDENCE_LANES SUBAGENT_LIVE_EVIDENCE_LABELS SUBAGENT_LIVE_EVIDENCE_DECISIONS validateSubagentLiveEvidenceLaneDefinitions subagentLiveEvidenceLanes.json Child authority confidence Broader Workflow/Symphony confidence Desktop dogfood confidence",
    subagentLiveEvidenceLanesScriptTest:
      "exposes the same release-gate decision order used by live history rows Child authority confidence Broader Workflow/Symphony confidence Desktop dogfood confidence",
    subagentLiveHistoryReportRunner:
      "live-history.jsonl --require-ready --min-live-dogfood-runs= --max-failure-rate= subagentLiveHistoryReportPassed",
    subagentLiveHistoryReportRunnerLib:
      "SUBAGENT_LIVE_HISTORY_REPORT_SCHEMA_VERSION ambient-subagent-live-history-report-v1 parseSubagentLiveHistoryJsonl buildSubagentLiveHistoryReport renderSubagentLiveHistoryReportMarkdown subagentLiveHistoryReportPassed cleanRequiredRunCount failedRequiredRunCount live_dogfood_failure_rate invalidRows live-history.jsonl SUBAGENT_LIVE_EVIDENCE_LABELS REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS Child authority confidence Broader Workflow/Symphony confidence Desktop dogfood confidence",
    subagentLiveHistoryReportRunnerTest:
      "marks repeated clean required-live history ready for graduation accounting blocks graduation accounting for sparse, failed, or skipped-evidence history",
    subagentDesktopDogfoodHistoryReportRunner:
      "history.jsonl --append-latest= --append-latest-if-exists= --require-ready --min-desktop-dogfood-runs= --max-failure-rate= --min-workflow-high-load-ready-runs= subagentDesktopDogfoodHistoryReportPassed",
    subagentDesktopDogfoodEvidenceContract:
      "subagent-desktop-dogfood-evidence-contract.mjs REQUIRED_DESKTOP_DOGFOOD_SCENARIOS REQUIRED_DESKTOP_VISUAL_ASSERTIONS REQUIRED_DESKTOP_MATURITY_ASSERTIONS REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS workflow_execution_parent_blocking workflow_high_load_dogfood local_runtime_ownership_ui untracked_runtime_safety_behavior lifecycle_edge_desktop_behavior parent_stop_cascade_desktop_behavior parent_stop_cascade_visibility chat_export_child_bundle desktop_workflow_high_load desktop_local_runtime_ownership desktop_lifecycle_edges desktop_chat_export_child_bundle child_full_transcript_export",
    subagentDesktopDogfoodEvidenceContractTest:
      "keeps full-app scenario coverage in one shared release-gate contract requires visual assertions for workflow, runtime, lifecycle, and layout proof keeps release-gate maturity capabilities aligned with Desktop evidence rows",
    subagentDesktopDogfoodHistoryReportRunnerLib:
      "SUBAGENT_DESKTOP_DOGFOOD_HISTORY_ROW_SCHEMA_VERSION ambient-subagent-desktop-dogfood-history-v1 SUBAGENT_DESKTOP_DOGFOOD_HISTORY_REPORT_SCHEMA_VERSION ambient-subagent-desktop-dogfood-history-report-v1 parseSubagentDesktopDogfoodHistoryJsonl buildSubagentDesktopDogfoodHistoryEntry buildSubagentDesktopDogfoodHistoryReport renderSubagentDesktopDogfoodHistoryReportMarkdown subagentDesktopDogfoodHistoryReportPassed REQUIRED_DESKTOP_DOGFOOD_SCENARIOS REQUIRED_DESKTOP_VISUAL_ASSERTIONS REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS desktop_dogfood_failure_rate required_scenario_coverage workflow_high_load_repetition visualFailureRunCount maturityFailureRunCount history.jsonl",
    subagentDesktopDogfoodHistoryReportRunnerTest:
      "marks repeated ready Desktop dogfood rows ready for graduation accounting blocks sparse, failed, or incomplete visual and maturity evidence",
    subagentDesktopDogfoodRunner:
      "AMBIENT_SUBAGENT_DESKTOP_DOGFOOD AMBIENT_LEGACY_WORKFLOW_COMPILER src/main/subagents/subagentDesktopDogfoodSeed.test.ts src/main/subagents/subagentDesktopDogfood.e2e.test.ts scripts/llama-server-placeholder.mjs AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_PID AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ID AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ENDPOINT AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_MODEL AMBIENT_E2E_USER_DATA staleLatestArtifactPath await rm(staleLatestArtifactPath, { force: true }) scripts/subagent-desktop-dogfood-history-report.mjs --append-latest=test-results/subagent-desktop-dogfood/latest.json --append-latest-if-exists=test-results/subagent-desktop-dogfood/latest.json",
    subagentDesktopDogfoodRunnerTest:
      "test:subagents:desktop-dogfood scripts/run-electron-dogfood.mjs subagents:desktop-dogfood-history-report test:subagents:desktop-dogfood-history-report:unit scripts/subagent-desktop-dogfood-history-report.mjs --append-latest=test-results/subagent-desktop-dogfood/latest.json --append-latest-if-exists=test-results/subagent-desktop-dogfood/latest.json AMBIENT_SUBAGENT_DESKTOP_DOGFOOD AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_RUNTIME_PID AMBIENT_LEGACY_WORKFLOW_COMPILER src/main/subagents/subagentDesktopDogfoodSeed.test.ts AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED AMBIENT_E2E_USER_DATA test-results/subagent-desktop-dogfood headful: true cdpPort: port --remote-debugging-port --enable-feature=${AMBIENT_SUBAGENTS_FEATURE_FLAG} Accessibility.getFullAXTree .subagent-parent-cluster approval_parent_blocking Blocking: approval Approval requested approvalFlow approvalButtonsNameChild workflow_execution_parent_blocking workflowExecution workflow-execution-desktop.png mutating_worker_dogfood_behavior mutatingWorkerDogfood mutating-worker-dogfood-desktop.png Symphony Self-Healing Loop Mutating child worker Staged mutation: src/feature.txt Parent workspace unchanged desktop_mutating_worker_dogfood mutating_worker_evidence workflow_high_load_dogfood workflowHighLoad workflow-high-load-desktop.png Symphony Adversarial Debate Symphony Imitate and Verify Symphony Pipeline Symphony Ensemble desktop_workflow_high_load workflow_high_load denied_scope_explanation_behavior deniedScopeExplanation denied-scope-explanation-desktop.png Approval unavailable Connector App gmail.search desktop_denied_scope_explanations denied_scope_explanations Symphony Map-Reduce Blocking: workflow work Workflow blocked pauseControlVisible workflowTaskRehydrated approval_forwarding_behavior approvalForwarding approval-forwarding-dialog.png approval-forwarded-desktop.png parentStillBlockedAfterForward childReturnedToNeedsSteering approvalAuthorityContract requestExported forwardedExported requestedToolMatches parentBlockingResumeMatches forwardedParentBlockingResumeMatches waitBarrierMatches inline_child_transcript_behavior completed_child_terminal_transcript_behavior pattern_graph_completed_child_clickthrough_behavior completedChildTranscript completed-child-transcript-desktop.png patternGraphCompletedClickThrough pattern-graph-completed-click-through-desktop.png completedChildRunId completedChildThreadId restart_rehydration_behavior restartRehydration restart-rehydration-desktop.png defaultCollapsedAfterRelaunch completedChildResultSummaryRehydrated workflow_rehydrated_navigation_behavior workflowRehydratedNavigation workflow-rehydrated-navigation-desktop.png workflowThreadSidebarSelected workflowThreadMatchesExpectedId desktop_workflow_rehydrated_navigation workflow_artifact_rehydration_behavior workflowArtifactRehydration workflow-artifact-rehydration-desktop.png workflowArtifactSourceRelativePath workflowArtifactStateRelativePath sourceContentMatchesExpected desktop_workflow_artifact_rehydration local_runtime_ownership_ui localRuntimeOwnership local-runtime-ownership-desktop.png In use by sub-agent Review worker Stop disabled affectedSubagentVisible operator_child_controls operatorControls Cancel sub-agent Review worker Close sub-agent Context summarizer operator_control_behavior operatorBehavior completedChildClosed attentionChildCancelled operator-behavior-desktop.png multi_parent_cluster_stress multiClusterStress multi-cluster-stress-desktop.png stressClustersAfterParentMessages desktop_multi_cluster_stress chat_export_child_bundle exportChatAndInspectChildBundle desktop-chat-export.zip AMBIENT_E2E_CHAT_EXPORT_PATH desktop_chat_export_child_bundle child_transcript_export child_full_transcript_export policy_provenance_export pattern_graph_export_links childToolScopeSnapshotsIncluded childFullTranscriptsIncluded patternGraphLinksIncluded visualAssertions parent_child_placement default_collapsed_state inline_child_mini_thread_chrome blocking_attention_indicators approval_runtime_ownership_labels denied_scope_explanations workflow_artifact_rehydration layout_safety workflow_task_continuity maturityAssertions desktop_child_visibility desktop_approval_forwarding desktop_denied_scope_explanations desktop_workflow_execution desktop_workflow_artifact_rehydration desktop_restart_rehydration desktop_local_runtime_ownership desktop_operator_controls desktop_visual_layout_safety desktop_chat_export_child_bundle horizontalOverflowFree collapsed-desktop.png expanded-narrow.png",
    subagentDesktopDogfoodUntrackedPlaceholder:
      "scripts/llama-server-placeholder.mjs AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_PLACEHOLDER stopDisabledVisible untracked_runtime_safety_behavior untrackedRuntimeVisible untrackedStopDisabledVisible untrackedRestartDisabledVisible untrackedForceUnavailableVisible untrackedExternalStopGuidanceVisible",
    subagentDesktopDogfoodRepeatRunner:
      "parseSubagentDesktopDogfoodRepeatArgs buildSubagentDesktopDogfoodRepeatPlan buildSubagentDesktopDogfoodRepeatReport renderSubagentDesktopDogfoodRepeatReportMarkdown summarizeSubagentDesktopDogfoodRepeatRuns test-results/subagent-desktop-dogfood-repeat/latest.json scripts/run-electron-dogfood.mjs scripts/subagent-desktop-dogfood-history-report.mjs stopAfterFailures",
    subagentDesktopDogfoodRepeatRunnerLib:
      "DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS = 25 SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REPORT_SCHEMA_VERSION parseSubagentDesktopDogfoodRepeatArgs buildSubagentDesktopDogfoodRepeatPlan buildSubagentDesktopDogfoodRepeatReport renderSubagentDesktopDogfoodRepeatReportMarkdown summarizeSubagentDesktopDogfoodRepeatRuns AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REPORT_OUT test-results/subagent-desktop-dogfood-repeat/latest.json scripts/run-electron-dogfood.mjs scripts/subagent-desktop-dogfood-history-report.mjs --min-desktop-dogfood-runs= --min-workflow-high-load-ready-runs= --require-ready stopAfterFailures",
    subagentDesktopDogfoodRepeatRunnerTest:
      "test:subagents:desktop-dogfood-repeat test:subagents:desktop-dogfood-repeat:unit defaults to the graduation run count and final history thresholds accepts an explicit repeat closeout report path builds a strict graduation plan with pass-through dogfood arguments builds an auditable repeat closeout report with failed run and history gate details marks the repeat closeout ready when every run and the history report pass",
    workflowJitterMatrixRunner:
      "PROFILE_TASKS release ui-dogfood-vocabulary-quiz-repeat-2 ui-dogfood-local-file-classifier-repeat-2 ui-dogfood-public-source-browser-repeat-2 liveDogfoodRuns",
    workflowJitterReleaseGateRunner:
      "DEFAULT_REQUIRED_RELEASE_LIVE_FAMILIES DEFAULT_MIN_RELEASE_LIVE_DOGFOOD_RUNS matrixReleaseProfileCheck liveDogfoodRuns releaseProfile Workflow jitter release profile is green",
    workflowJitterReleaseGateTest:
      "makes release-profile coverage stricter than a normal live smoke pass liveDogfoodRuns: 10/10 releaseProfile",
    subagentDesktopDogfoodSeedTest:
      "visible child sub-agent state AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_RUNTIME_PID SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX stressParentMessageIds stressChildRunIds stressChildThreadIds subagent.child_approval_requested desktop-dogfood-approval-write cancelControlChildRunId closeControlChildRunIds SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_LEASE_ID runtime-leases.json seedDeniedScopeExplanation subagent.spawn_failed SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_RUN_ID SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_THREAD_ID seedCallableWorkflowTask seedMutatingWorkerWorkflowTask seedWorkflowHighLoadStress SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS workflowHighLoadTaskIds workflowHighLoadArtifactIds workflowHighLoadRunIds workflowHighLoadThreadIds workflowHighLoadPatternLabels CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_ARTIFACT_ID SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_STATE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_ARTIFACT_ID SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_REPORT_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE mutatingWorkflowTaskId mutatingWorkflowParentWorkspaceUnchanged seedParentStopCascadeCluster parentStopCascadeCancelledMailboxEventIds seedMultiClusterStress",
    subagentDesktopDogfoodScenario:
      "SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_CASCADE_PARENT_ASSISTANT_TEXT SubagentDesktopDogfoodSeedResult stressParentMessageIds stressChildRunIds stressChildThreadIds parentStopCascadeParentMessageId parentStopCascadeParentMailboxEventId parentStopCascadeCancelledMailboxEventIds SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ID SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_LEASE_ID SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_ARTIFACT_ID SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_TOOL_CALL_ID SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_STATE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_ARTIFACT_ID SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_TOOL_CALL_ID SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_SOURCE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_STATE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_REPORT_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS workflowHighLoadTaskIds workflowHighLoadArtifactIds workflowHighLoadRunIds workflowHighLoadThreadIds workflowHighLoadPatternLabels SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_RUN_ID SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_THREAD_ID deniedScopeParentMailboxEventId deniedScopeChildRunId deniedScopeChildThreadId workflowTaskId workflowArtifactSourceRelativePath workflowArtifactStateRelativePath workflowArtifactSourceContent workflowRunId mutatingWorkflowTaskId mutatingWorkflowArtifactId mutatingWorkflowRunId mutatingWorkflowThreadId mutatingWorkflowChildRunId mutatingWorkflowChildThreadId mutatingWorkflowStagedRelativePath mutatingWorkflowReportRelativePath mutatingWorkflowProgressMessage mutatingWorkflowParentWorkspaceUnchanged",
    subagentDesktopDogfoodE2eTest:
      "AMBIENT_SUBAGENT_DESKTOP_DOGFOOD AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARENT_ASSISTANT_TEXT seedLifecycleEdgeCluster test-results/subagent-desktop-dogfood --remote-debugging-port --enable-feature=${AMBIENT_SUBAGENTS_FEATURE_FLAG} Accessibility.getFullAXTree .subagent-parent-cluster approval_parent_blocking Blocking: approval Approval requested approvalFlow approvalButtonsNameChild workflow_execution_parent_blocking workflowExecution workflow-execution-desktop.png mutating_worker_dogfood_behavior mutatingWorkerDogfood mutating-worker-dogfood-desktop.png Symphony Self-Healing Loop Mutating child worker Staged mutation: src/feature.txt Parent workspace unchanged desktop_mutating_worker_dogfood mutating_worker_evidence workflow_high_load_dogfood workflowHighLoad workflow-high-load-desktop.png Symphony Adversarial Debate Symphony Imitate and Verify Symphony Pipeline Symphony Ensemble desktop_workflow_high_load workflow_high_load denied_scope_explanation_behavior deniedScopeExplanation denied-scope-explanation-desktop.png Approval unavailable Connector App gmail.search desktop_denied_scope_explanations denied_scope_explanations Symphony Map-Reduce Blocking: workflow work Workflow blocked pauseControlVisible workflowTaskRehydrated approval_forwarding_behavior approvalForwarding approval-forwarding-dialog.png approval-forwarded-desktop.png parentStillBlockedAfterForward childReturnedToNeedsSteering approvalAuthorityContract requestExported forwardedExported requestedToolMatches parentBlockingResumeMatches forwardedParentBlockingResumeMatches waitBarrierMatches inline_child_transcript_behavior completed_child_terminal_transcript_behavior pattern_graph_completed_child_clickthrough_behavior completedChildTranscript completed-child-transcript-desktop.png patternGraphCompletedClickThrough pattern-graph-completed-click-through-desktop.png completedChildRunId completedChildThreadId restart_rehydration_behavior restartRehydration restart-rehydration-desktop.png defaultCollapsedAfterRelaunch completedChildResultSummaryRehydrated workflow_rehydrated_navigation_behavior workflowRehydratedNavigation workflow-rehydrated-navigation-desktop.png workflowThreadSidebarSelected workflowThreadMatchesExpectedId desktop_workflow_rehydrated_navigation workflow_artifact_rehydration_behavior workflowArtifactRehydration workflow-artifact-rehydration-desktop.png workflowArtifactSourceRelativePath workflowArtifactStateRelativePath sourceContentMatchesExpected desktop_workflow_artifact_rehydration local_runtime_ownership_ui localRuntimeOwnership local-runtime-ownership-desktop.png In use by sub-agent Review worker Stop disabled affectedSubagentVisible lifecycle_edge_desktop_behavior inspectLifecycleEdgeVisibility lifecycle-edge-visibility-desktop.png Timeout edge worker Continue with partial Partial approved Retry edge worker Retry requested retry_edge Child detached lifecycle_edge_visibility parent_stop_cascade_desktop_behavior inspectParentStopCascadeVisibility parent-stop-cascade-desktop.png Parent-stop required worker Parent cancellation requested 2 pending mailbox events cancelled parent_stop_cascade_visibility desktop_lifecycle_edges operator_child_controls operatorControls Cancel sub-agent Review worker Close sub-agent Context summarizer operator_control_behavior operatorBehavior completedChildClosed attentionChildCancelled operator-behavior-desktop.png multi_parent_cluster_stress multiClusterStress multi-cluster-stress-desktop.png stressClustersAfterParentMessages desktop_multi_cluster_stress chat_export_child_bundle exportChatAndInspectChildBundle desktop-chat-export.zip AMBIENT_E2E_CHAT_EXPORT_PATH desktop_chat_export_child_bundle child_transcript_export child_full_transcript_export policy_provenance_export pattern_graph_export_links childToolScopeSnapshotsIncluded childFullTranscriptsIncluded patternGraphLinksIncluded visualAssertions parent_child_placement default_collapsed_state inline_child_mini_thread_chrome blocking_attention_indicators approval_runtime_ownership_labels denied_scope_explanations workflow_artifact_rehydration parent_stop_cascade_visibility layout_safety workflow_task_continuity maturityAssertions desktop_child_visibility desktop_approval_forwarding desktop_denied_scope_explanations desktop_workflow_execution desktop_workflow_artifact_rehydration desktop_restart_rehydration desktop_local_runtime_ownership desktop_operator_controls desktop_visual_layout_safety desktop_chat_export_child_bundle horizontalOverflowFree collapsed-desktop.png expanded-narrow.png",
    subagentDesktopDogfoodE2eSupport:
      "subagentDesktopDogfoodE2eSupport test-results/subagent-desktop-dogfood AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT --remote-debugging-port --enable-feature=${AMBIENT_SUBAGENTS_FEATURE_FLAG} Accessibility.getFullAXTree exportChatAndInspectChildBundle desktop-chat-export.zip AMBIENT_E2E_CHAT_EXPORT_PATH writeScreenshot writeReport captureFailureArtifacts dogfoodGitCommit dogfoodGitBranch",
    subagentDesktopDogfoodUiInspectors:
      "subagentDesktopDogfoodUiInspectors inspectSubagentUi inspectInlineChildTranscript inspectRestartRehydration inspectWorkflowArtifactRehydration inspectOperatorBehavior approvalFlow workflowExecution mutatingWorkerDogfood workflowHighLoad deniedScopeExplanation localRuntimeOwnership parentStopCascadeVisibility horizontalOverflowFree",
    subagentReviewedMaturityEvidence:
      "recordSubagentRestartRecoveryEvidence recordSubagentWorkflowJitterReleaseProfileEvidence recordSubagentCompletionGuardVisibilityEvidence recordSubagentApprovalRoutingVisibilityEvidence recordSubagentProductionUiVisibilityEvidence recordSubagentEventAttributionIntegrityEvidence recordSubagentLifecycleControlIntegrityEvidence recordSubagentRetentionPolicyIntegrityEvidence recordSubagentToolScopeIntegrityEvidence recordSubagentBugAuditEvidence recordSubagentSecurityReviewEvidence restart_recovery workflow_jitter_release_profile completion_guard_visibility approval_routing_visibility production_ui_visibility event_attribution_integrity lifecycle_control_integrity retention_policy_integrity tool_scope_integrity lifecycle_bug_audit permission_bug_audit security_review",
    subagentReviewedMaturityEvidenceTest:
      "recordSubagentWorkflowJitterReleaseProfileEvidence recordSubagentCompletionGuardVisibilityEvidence recordSubagentApprovalRoutingVisibilityEvidence recordSubagentProductionUiVisibilityEvidence recordSubagentEventAttributionIntegrityEvidence recordSubagentLifecycleControlIntegrityEvidence recordSubagentRetentionPolicyIntegrityEvidence recordSubagentToolScopeIntegrityEvidence Reviewed workflow jitter release profile is ready with release-profile live evidence. Reviewed completion guard visibility across child inspector, parent blockers, replay diagnostics, and diagnostic history. Reviewed child approval routing across attribution, scoped response persistence, parent wait resumption, non-interactive failures, and UI/replay visibility. Reviewed production UI visibility across collapsed parent clusters, blocking-child indicators, child inspector rows, repair/replay panels, and local runtime ownership controls. Reviewed sub-agent event attribution across runtime previews, parent mailbox events, tool/approval/error provenance, replay diagnostics, and large-output artifacts. Reviewed sub-agent lifecycle controls across parent-stop cascade, child-cancel isolation, close history retention, lifecycle hook artifacts, and restart interruption repair. Reviewed sub-agent retention policy across close-without-delete, oldest-eligible cap cleanup, protected-child retention, summary/artifact durability, and retained-state UI. Reviewed sub-agent tool scope across hard-deny precedence, role/task narrowing, exact tool/extension resolution, child fanout default blocking, and snapshot/inspector diagnostics.",
    subagentInvariants:
      "validateSubagentRunEventAttribution validateSubagentParentMailboxEventAttribution assertSubagentRunEventAttribution assertSubagentParentMailboxEventAttribution must identify the originating child run",
    subagentInvariantsTest:
      "validates linkage, feature-flag snapshots, and assertion errors before child runs validates parent synthesis safety and large output artifact backing validates runtime event and parent mailbox attribution to child runs",
    subagentObservability:
      "spawnAttempts failedSpawns validateSubagentObservabilityEventAttribution must identify the originating child run waitDurations childIdle cancellationCascades childRuntimeAborts toolDenials groupedCompletions needsAttentionRequests tokenCount costMicros localMemory restartReconciliations subagent.child_runtime_aborted subagent.needs_attention subagent.grouped_completion",
    subagentObservabilityTest:
      "requires child attribution for child-scoped observability events summarizes spawn, wait, usage, memory, idle, batch, and restart observability",
    diagnostics:
      'getSubagentObservabilitySummary createSubagentAttributionAudit Sub-agent attribution audit auditedRuntimeEventCount auditedParentMailboxEventCount issueSamples createSubagentDiagnosticReplayEvidence ambient-subagent-replay-evidence-v1 source: "diagnostic_export" runtimeEventTimeline persistedRunEventTimeline parentMailboxTimeline parentMailboxEventCount transcriptTimeline callableWorkflowTaskTimeline callableWorkflowTaskIssues callableWorkflowTaskCount listCallableWorkflowTasks workflowArtifactSourcePath workflowArtifactStatePath workflowArtifactMutationPolicy artifactLinkState runLinkState child_bridge_policy completionGuardSummary approvalSource approvalId worktreeIsolated worktreePath deniedCategoryIds deniedToolIds observability.childIdle.openRunCount observability.childIdle.totalMs observability.childIdle.maxMs childIdleOpenRunCount childIdleTotalMs childIdleMaxMs Sub-agent replay evidence captured Sub-agent replay evidence failed to collect',
    diagnosticsTest:
      "exports a bounded sub-agent attribution audit for malformed persisted event data exports sub-agent observability aggregates and diagnostic replay evidence exports tool-scope denial metadata in parent mailbox replay evidence exports completion guard metadata in parent mailbox replay evidence exports callable workflow task replay evidence with child caller and artifact links exports callable workflow restart issue provenance in replay repair evidence completionGuardSummary approval-worker connector_app:gmail.search workflow-task-1 workflow-artifact-1 workflowArtifactSourcePath workflowArtifactStatePath workflowArtifactMutationPolicy callableWorkflowTaskIssues childRuntimeAborts: 1 groupedCompletions: 1 needsAttentionRequests: 1",
    diagnosticsIpc: 'diagnosticsIpcChannels handleIpc("diagnostics:import" importDiagnosticBundle',
    diagnosticBundleImport:
      "diagnosticImportResultFromBundleJson importDiagnosticBundleFromFile completionGuardSummary callableWorkflowTaskTimeline artifactLinkState runLinkState",
    diagnosticBundleImportTest:
      "imports a diagnostic bundle into bounded summary and replay evidence only completionGuardSummary workflow-task-1 workflow-artifact-1 child_bridge_policy callableWorkflowTaskIssues",
    subagentRepair:
      "ambient-subagent-repair-diagnostics-v1 repair_spawn_edge inspect_run_snapshot missing_feature_flag_snapshot capacity_lease_mismatch missing_role_profile_snapshot role_profile_snapshot_mismatch missing_model_runtime_snapshot prompt_snapshot_mismatch tool_scope_snapshot_mismatch",
    subagentRepairTest:
      "detects malformed feature flag and capacity lease snapshots for persisted child runs detects role profile, model runtime, prompt, and tool-scope snapshot drift for persisted child runs",
    subagentRetention:
      "retentionDefault keep_until_parent_pruned parent_thread_active role_retention_pinned parentArchived DEFAULT_SUBAGENT_MAX_RETAINED_CHILDREN_PER_PARENT maxRetainedChildrenPerParent retention_cap_exceeded",
    subagentRetentionTest:
      "honors role retention defaults before the cleanup age window collapses oldest completed eligible children when the per-parent retention cap is exceeded",
    subagentIdempotency:
      "createSubagentIdempotencyKey createSubagentPayloadFingerprint findSubagentRunEventByIdempotencyKey subagentRunEventPreviewIdempotencyKey spawn-failed followup wait wait-barrier-attention approval-request approval-response supervisor-request close cancel barrier-decision grouped_completion_notification artifact_write",
    subagentIdempotencyTest:
      "fingerprints undefined payload fields deterministically ignores malformed idempotency previews when replaying retried operations",
    piChildSessionAdapter:
      "PI_CHILD_SESSION_ADAPTER_SCHEMA_VERSION SubagentChildRuntimeAdapter SubagentChildRuntimeLaunchPreflightInput SubagentChildRuntimeStartInput SubagentChildRuntimeWaitInput SubagentChildRuntimeCancelInput SubagentChildRuntimeFollowupInput SubagentChildRuntimeApprovalResponseInput SubagentChildRuntimeApprovalRequest SubagentChildRuntimeSupervisorRequest approvalRequests?: readonly SubagentChildRuntimeApprovalRequest[] supervisorRequests?: readonly SubagentChildRuntimeSupervisorRequest[] SUBAGENT_CHILD_RUNTIME_ADAPTER_METHODS resolveChildApprovalResponse canResolveApprovalResponses describeSubagentChildRuntimeAdapter ambient-subagent-child-runtime-launch-preflight-v1",
    piChildSessionAdapterTest: "fails closed when no runtime adapter is attached",
    piEventMapper:
      "PI_CHILD_EVENT_MAPPER_SCHEMA_VERSION mapPiChildRuntimeEvent piChildRuntimeEventUpdateDetails piChildRuntimeEventUpdateText childRunId parentRunId childThreadId artifactPath approvalSource approvalId worktreeIsolated worktreePath toolCategory validatePiChildRuntimeEventLargeOutputArtifact Large child runtime output would be clipped or truncated without a full artifact path do not copy raw details into parent update",
    piEventMapperTest:
      "clips long child runtime messages builds compact Pi updates that identify the child run for tool, approval, and error attribution approvalSource approvalId worktreeIsolated worktreePath toolCategory do not copy raw details into parent update",
    subagentRuntimeEventPersistence: "appendMappedSubagentRuntimeEvent preview: runtimeEvent",
    subagentRuntimeEventPersistenceTest:
      "persists mapped child runtime events with run-event attribution and artifact paths rejects large mapped runtime output when no full artifact path is available persists usage and local-memory runtime telemetry as child-attributed previews",
    subagentPromptRuntime:
      "buildSubagentChildPrompt buildSubagentFollowupPrompt buildSubagentPromptSnapshot classifySubagentAssistantResult Parent-only sub-agent orchestration instructions, prior sub-agent tool calls/results treat the transcript as authoritative Task instructions are subordinate to this Result contract SUBAGENT_RESULT_STATUS: needs_attention persistentMemory ambient-subagent-persistent-memory-snapshot-v1 persistent_memory_disabled_by_default",
    subagentPromptRuntimeTest:
      'builds a follow-up prompt that restates run identity and the structured result contract uses schema-valid structured JSON when the status marker is present but malformed memoryPolicy: "run_snapshot_only"',
    subagentCompletionGuard:
      "validateSubagentCompletionGuard requires_isolated_worktree implementationEvidenceRequired Implementation roles require structured mutation evidence before completed synthesis. Implementation roles require Ambient-recorded mutation evidence before completed synthesis. Implementation structured mutation evidence must match an Ambient-recorded mutation event. Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis. isolatedWorktreeEvidenceCount approvalEvidenceCount",
    subagentCompletionGuardTest:
      "rejects category-only forged mutation evidence without a specific Ambient match rejects mismatched child-run mutation evidence even when tool ids match rejects worker mutation evidence without isolated worktree provenance rejects isolated worker mutation evidence without approval provenance",
    subagentChildWorktreePreparer:
      "SUBAGENT_CHILD_WORKTREE_PREPARER_SCHEMA_VERSION ambient-subagent-child-worktree-preparer-v1 prepareSubagentChildWorktreeForLaunch Prepared active worktree must be persisted on the child thread before mutating tools are enabled.",
    subagentChildWorktreePreparerTest:
      "records prepared evidence only when the active worktree is persisted on the child thread records failed, mismatched, empty, and thrown worktree preparation outcomes",
    subagentStartupReconciliation:
      'reconcileSubagentsOnRuntimeStartup reconcileCallableWorkflowTaskRestartState runs callable workflow task restart reconciliation when the store supports it subagentLifecycleEventType("SubagentStop") latestStartupRepairEvents onParentMailboxEventUpdated subagent.restart_reconciled subagent.lifecycle_interrupted',
    subagentStartupReconciliationTest:
      "emits repaired child run, child thread, lifecycle stop, restart event, and wait barrier updates emits only the latest startup repair lifecycle and restart events for repaired runs",
    subagentLifecycleParentMailbox:
      'SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE ambient-subagent-lifecycle-interruption-v1 "direct_child_stop" "runtime_budget_exceeded"',
    subagentLifecycleParentMailboxTest:
      'builds child-attributed lifecycle interruption payloads for direct stops and runtime budgets bounds lifecycle result artifacts before parent mailbox delivery uses source and explicit idempotency keys for lifecycle parent mailbox dedupe "parent_cancel_request" "direct_child_stop" "desktop_restart" "runtime_budget_exceeded"',
    subagentLifecycleHooks:
      "SUBAGENT_LIFECYCLE_HOOK_SCHEMA_VERSION subagentLifecycleHookPreview subagentTranscriptPath subagent.lifecycle_started subagent.lifecycle_stopped subagent.lifecycle_closed parentTranscriptPath childTranscriptPath artifactPointers finalStatus",
    subagentLifecycleHooksTest:
      'records durable start transcript refs records stop artifact pointers and final status without copying result content records close time without deleting transcript refs not.toHaveProperty("summary") not.toHaveProperty("structuredOutput")',
    subagentApprovalBridge:
      'SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE resolveSubagentApprovalScope buildSubagentApprovalRequestBridgeDraft buildSubagentApprovalResponseBridgeDraft recordSubagentApprovalRequestBridgeIfNeeded recordSubagentApprovalResponseBridgeIfNeeded createSubagentApprovalRequestIdempotencyKey operation: "approval-request" operation: "approval-response" forward_child_approval_then_wait resumeParentBlocking: true Child always grants default to this child thread',
    subagentApprovalBridgeTest:
      "narrows child always grants to the child thread by default builds child-attributed approval requests that return the parent to a wait barrier builds scoped approval responses that are sent to the child while preserving parent blocking records approval responses into the child mailbox and parent audit event idempotently",
    subagentSupervisorRequest:
      'SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE SUBAGENT_SUPERVISOR_REQUEST_KINDS need_decision blocked progress_update marksChildComplete: false completionStatus: "not_complete" recordSubagentSupervisorRequestIfNeeded buildSubagentSupervisorRequestDraft createSubagentSupervisorRequestIdempotencyKey operation: "supervisor-request"',
    subagentSupervisorRequestTest:
      "builds child-attributed supervisor requests without marking the child complete records supervisor requests idempotently across child and parent mailbox events",
    subagentApprovalDecision:
      "SUBAGENT_APPROVAL_RESOLUTION_SCHEMA_VERSION resolveSubagentApprovalDecision updateSubagentParentMailboxEventDeliveryState",
    subagentApprovalDecisionTest: "records a UI approval response, consumes the parent request, and keeps the parent blocked",
    subagentIpc:
      "registerSubagentApprovalIpc subagents:resolve-approval subagents:resolve-wait-barrier subagents:cancel-run subagents:close-run requireProjectRuntimeHostForSubagentWaitBarrier Sub-agent child controls are disabled because ambient.subagents is off. ambient.subagents is off",
    subagentIpcTest: "resolves child approvals only when ambient.subagents is enabled",
    subagentCancelAgent:
      "SUBAGENT_PARENT_CANCEL_REQUEST_SOURCE SUBAGENT_CANCEL_REQUEST_EVENT_TYPE buildSubagentCancelAgentParentMailboxDraft buildSubagentCancelRequestedRunEventPreview shouldPreserveInitialTerminalSubagentCancelRun",
    subagentCancelAgentTest:
      "builds lifecycle parent mailbox drafts for parent cancel requests marks only active child runs as cancelled and preserves original terminal runs",
    subagentCancelAgentExecutor:
      "SUBAGENT_CANCEL_AGENT_EXECUTOR_SCHEMA_VERSION ambient-subagent-cancel-agent-executor-v1 executeSubagentCancelAgent cancelPendingParentToChildMailboxEvents",
    subagentCancelAgentExecutorTest:
      "cancels active children, parent-to-child mailbox work, wait barriers, and records parent lifecycle evidence preserves terminal initial runs when runtime state is stale",
    subagentCloseAgent:
      "SUBAGENT_CLOSE_REQUEST_EVENT_TYPE SUBAGENT_CLOSE_RETAINED_HISTORY_MESSAGE resolveSubagentCloseAgentRequest assertCanCloseSubagentRun buildSubagentCloseRequestedRunEventPreview CLOSE_BLOCKED_ACTIVE_STATUSES",
    subagentCloseAgentTest:
      "blocks active children from closing but allows inactive or already-closed children builds close messages that preserve transcript and artifact expectations",
    subagentCloseAgentExecutor:
      "SUBAGENT_CLOSE_AGENT_EXECUTOR_SCHEMA_VERSION ambient-subagent-close-agent-executor-v1 executeSubagentCloseAgent buildSubagentCloseRequestedRunEventPreview",
    subagentCloseAgentExecutorTest:
      "records close requests, releases capacity, and writes a retained-history child message replays existing close run events without repeating side effects",
    agentRuntime:
      'appendSubagentLifecycleInterruptionParentMailboxEvent recordSubagentFinalizationBlockedParentMailbox recordCallableWorkflowFinalizationBlockedParentMailbox callableWorkflowFinalizationBlock callableWorkflowFinalizationBlocked parentFinalizationBlocked emitCallableWorkflowTaskUpdated cancelCallableWorkflowTask pauseCallableWorkflowTask resumeCallableWorkflowTask resolveSubagentWaitBarrier(input: ResolveSubagentWaitBarrierInput) cancelSubagentRun(input: CancelSubagentRunInput) closeSubagentRun(input: CloseSubagentRunInput) executeSubagentBarrierDecision desktop-parent-cluster-resolve-barrier executeSubagentCancelAgent executeSubagentCloseAgent createDesktopSubagentCancelEventEmitter WorkflowManualPausedError callableWorkflowTaskAbortControllers callableWorkflowRunTaskIds callable-workflow-task-updated runtime_budget_exceeded resolveRuntimeForMain runtime: "local_text" Full local text output: availableExtensionToolNames subagent.approval_response.consumed pendingSubagentPermissionApprovalRequests native-permission-request',
    agentRuntimeCallableWorkflowExecution:
      "createAgentRuntimeCallableWorkflowRunnerStore options.emitCallableWorkflowTaskUpdated(options.store.getCallableWorkflowTask(task.id))",
    agentRuntimeTest:
      "blocks parent finalization while required sub-agent wait barriers are unresolved blocks parent finalization after required sub-agent wait barriers resolve unsafe blocks parent finalization while blocking callable workflow tasks are unresolved settles runtime-budget overruns as aborted partial results when the role allows partial output settles runtime-budget overruns as failures when the role forbids partial output runtime_budget_exceeded routes configured local text main chat through the local runtime without Pi surfaces native child permission prompts as parent-forwarded approval requests round-trips native child permission prompts through parent approval and child resume",
    agentRuntimeFinalizationBlocking:
      "recordSubagentFinalizationBlockedParentMailbox recordCallableWorkflowFinalizationBlockedParentMailbox subagentFinalizationBarrierBlock subagentFinalizationBlockParentResolution subagentFinalizationBlockUserChoices callableWorkflowFinalizationBlock callableWorkflowFinalizationBlocked parentFinalizationBlocked Parent final answer blocked because required sub-agent work is not safe for synthesis. Parent final answer blocked because blocking callable workflow work is not safe for synthesis.",
    agentRuntimeFinalizationBlockingTest:
      "agent runtime finalization blocking helpers builds subagent finalization barrier blocks from unresolved required barriers creates parent-resolution policy and allowed choices for subagent barriers records subagent finalization mailbox events with policy payloads plans and records callable workflow finalization blocks",
    subagentChildActiveTools:
      "resolveAgentRuntimeActiveToolNamesForThread resolveSubagentChildActiveToolNames resolveSubagentChildActiveToolActivation subagentChildCallableWorkflowToolNamesFromSnapshots isSubagentChildActivatableBuiltInTool CHILD_ACTIVE_TOOL_NAMES_BY_CATEGORY activeTools: [...new Set([...agentRuntimeActiveTools, ...transcriptRehydratedToolNames])] availableExtensionToolNames availableCallableWorkflowToolNames unavailableCallableWorkflowToolNames Requested callable workflow tool is not registered as child-visible for this launch. callableWorkflowToolNames",
    subagentChildActiveToolsTest:
      "does not inherit parent active tools for read-only child scopes does not let exact built-in grants widen beyond visible child categories exposes worker write tools only from a workspace.write snapshot uses the latest child tool-scope snapshot activates snapshotted extension tools only when registered for the child launch fails before launch when a visible extension tool is not registered does not activate callable workflow tools from child snapshots unless registered for the child launch activates exact callable workflow tools when the child launch catalog exposes them extracts latest exact callable workflow grants for child callable workflow registration",
    subagentDelegatedToolAuthority:
      "SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION ambient-subagent-delegated-tool-authority-audit-v1 validateSubagentDelegatedToolAuthorityAudit subagentDelegatedToolAuthorityNonChildToolNames workspace-read-file-tools long-context-read media-download-tools visual-runtime-tools media-download-boundary visual-runtime-boundary media_download ambient_visual_analyze ambient_visual_minicpm_setup ambient_local_model_runtime_start ambient_local_model_runtime_stop ambient_local_model_runtime_restart rootProvider approvalProvider childIdentityProvider exact_child_grant not_child_visible long_context_process delegated authority rootProvider must match native read",
    subagentDelegatedToolAuthorityTest:
      "pins long_context_process to the same read authority and approval route as native read records exact-grant and non-visible boundary surfaces instead of inheriting broad parent tools validates the delegated authority audit as an executable contract fails the audit when long_context_process drifts from native read authority fails the audit when a child-visible built-in tool is missing authority coverage fails the audit when exact-grant bridges do not declare their source boundary",
    projectStore:
      'cascadeSubagentParentRunStopped cancelPendingParentToChildMailboxEvents cancelledMailboxEventIds subagent.cancellation_cascade parent_message_id listSubagentParentMailboxEventsForParentThread record.plan.parentMessageId appendSubagentLifecycleInterruptionParentMailboxEvent "desktop_restart" repairSubagentSpawnEdges subagent.spawn_edge_repaired close_agent released live sub-agent capacity while preserving transcript history applySubagentRetentionCleanup maxRetainedChildrenPerParent transcriptRetained: true artifactsRetained: true upsertSubagentGroupedCompletionNotification enqueueCallableWorkflowTask getCallableWorkflowTask listCallableWorkflowTasksForParentRun listCallableWorkflowTasksForParentThread listCallableWorkflowTasks reconcileCallableWorkflowTaskRestartState cancelCallableWorkflowTask tryGetWorkflowArtifact(row.workflow_artifact_id)?.workflowThreadId hydrateCallableWorkflowTaskRunTelemetry callableWorkflowTaskProgressSnapshot callableWorkflowTaskUsageSnapshot callable_workflow_task_canceled',
    projectStoreSchema:
      "PRIMARY KEY(job_id, report_id) idx_subagent_batch_result_reports_job_item_once callable_workflow_tasks idx_callable_workflow_tasks_parent_run",
    projectStoreSubagentFoundationTest:
      'cascades a stopped parent run across dependent child runs, wait barriers, and pending mailbox work persists explicit quorum thresholds on wait barriers persists parent mailbox parent-message anchors for pre-run spawn failures rejects persisted child runtime and parent mailbox events without exact child attribution parentMessageId: "parent-message" repairs missing and mismatched spawn edges while pruning dangling edges subagent.closed subagent.lifecycle_closed archives cap-exceeded child threads before the cleanup window without touching protected children archives only retention-eligible child threads and records cleanup audit events persists sub-agent batch jobs and exactly-once result ledgers persists Settings-installed model providers and feeds the runtime catalog without secrets',
    subagentPiTools:
      'evaluateSubagentWaitBarrierForSynthesis requiredSynthesisCountForBarrier waitBarrierEvaluation quorumThreshold waitBarrierMode childRunIds recordSubagentWaitBarrierAttentionParentMailboxIfNeeded subagent.wait_barrier_decision detach_child cancel_parent runtime_launch_preflight Sub-agent capacity preflight failed failureStage: "capacity" failureStage: "scheduling_policy" failureStage: "tool_scope" approvalUnavailable parentRun.assistantMessageId run.parentMessageId "parent_cancel_request" explicit delegation names ambient_subagent call spawn_agent before giving a final answer do not substitute a prose plan pass those literal values in the tool arguments call wait_agent for that child before synthesizing the parent answer If wait_agent returns supervisorRequestRecords CLOSE_BLOCKED_ACTIVE_STATUSES Cannot close active sub-agent transcript and artifacts are retained scheduledSpawnFields cannot inherit live parent context Prepared active worktree must be persisted on the child thread before mutating tools are enabled. unavailableRequestedExtensionToolNames availableExtensionToolNames child-safe bridge recordSubagentGroupedCompletionNotificationIfNeeded compactSubagentToolScopeSnapshot resolveSubagentLaunchWorkspaceToolPolicy resolveSubagentToolScopeLaunchDenial resolveSubagentSpawnBlockDecision recordSubagentPreRunSpawnFailure recordScheduledSubagentSpawnPolicyFailure recordSubagentPostReservationSpawnFailure recordSubagentLaunchRejection resolveSubagentFailedSpawnWaitBarrier validateSubagentResultForRun evaluateSubagentWaitBarrierForStore resolveSubagentWaitBarrierForRun resolveActiveSubagentWaitBarriersForRun recordSubagentWaitCompletionMailboxIfNeeded executeSubagentBarrierControlDecision recordSubagentBarrierDecisionParentMailbox approvalRequestRecords supervisorRequestRecords supervisorRequestAcknowledgement supervisorRequestRecords: supervisorRequestRecords.map approvalResponseDeliveries resolveChildApprovalResponse followupChildRun compactSubagentTurnBudgetWrapUpSteeringRecord turnBudgetWrapUpSteering turnBudgetWrapUpDelivery turnBudgetExhaustionSettlement',
    subagentPiToolsTest:
      "records pre-run spawn failures for local runtime launch preflight denials records pre-run spawn failures for local runtime capacity preflight denials reports non-interactive approval-unavailable launch denials to the parent mailbox parentMessageId: assistant.id describes direct parent spawn and wait semantics for explicit delegation requests refuses to close actively executing children before releasing capacity closes needs-attention children as abandoned work without deleting history capacityLeaseSnapshot.status transcript and artifacts are retained rejects scheduled spawn requests before creating a live child thread rejects active worker worktrees that are not persisted on the child thread rejects unknown exact built-in child tools before reserving a child run accepts surfaced extension tools registered in the launch catalog rejects unavailable surfaced extension tools before reserving a child run records visible failed children for Pi-visible connector tools without child-safe bridges",
    subagentPiToolsWaitSynthesisTest:
      "keeps required_all barriers blocked until every child has a synthesis-safe result allows required_any barriers from one validated child while preserving unsafe sibling provenance uses persisted quorum thresholds instead of implicit majority defaults creates Pi-reachable aggregate wait barriers with explicit quorum thresholds records timed-out required wait barriers in the parent mailbox idempotently records detach and parent-cancel barrier decisions with child state changes requires Ambient-side mutation evidence before synthesizing completed implementation roles surfaces turn-budget wrap-up state in status_agent details surfaces turn-budget wrap-up steering evidence in wait_agent details surfaces turn-budget wrap-up runtime delivery evidence in wait_agent details settles exhausted turn budget as aborted_partial without fabricating synthesis-safe output settles exhausted turn budget as failed when the role forbids partial output surfaces turn-budget exhaustion settlement evidence in wait_agent details surfaces child approval-response delivery evidence from wait_agent exposes child supervisor request records from wait_agent as compact Pi-visible handles follow-supervisor-request",
    subagentPiToolInput:
      "SUBAGENT_PI_TOOL_INPUT_SCHEMA_VERSION ambient-subagent-pi-tool-input-v1 resolveSubagentPiToolInput resolveSubagentPiToolWaitTimeoutMs DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS MAX_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS",
    subagentPiToolInputTest:
      "clamps wait timeouts to the bounded Pi-visible wait contract normalizes optional and required string values with precise validation errors",
    subagentPiToolResult:
      "SUBAGENT_PI_TOOL_RESULT_SCHEMA_VERSION ambient-subagent-pi-tool-result-v1 subagentPiToolResult compactSubagentPiToolRunEvent compactSubagentPiToolMailboxEvent compactSubagentPiToolParentMailboxEvent previewSubagentPiToolText",
    subagentPiToolResultTest:
      "compacts run events with bounded handles and optional preview/artifact fields compacts mailbox and parent-mailbox events into Pi-visible handles compacts singular child approval mailbox attribution for Pi-visible handles compacts singular child supervisor mailbox attribution for Pi-visible handles normalizes and truncates Pi-visible preview text",
    subagentSpawnPreRunPlanner:
      "SUBAGENT_SPAWN_PRE_RUN_PLANNER_SCHEMA_VERSION ambient-subagent-spawn-pre-run-planner-v1 SUBAGENT_SPAWN_PLANNER_DEPENDENCY_MODES SUBAGENT_SPAWN_PLANNER_FORK_MODES SUBAGENT_SPAWN_PLANNER_PROMPT_MODES resolveSubagentSpawnPreRunPlan defaultSubagentChildTitle scheduledSpawnFields payloadFingerprint",
    subagentSpawnPreRunPlannerTest:
      "resolves default spawn plan fields and stable generated idempotency preserves explicit launch choices, tool scope, idempotency, and scheduled-spawn fields surfaces model-scope blockers before child run creation",
    subagentSpawnPreflightResolver:
      "SUBAGENT_SPAWN_PREFLIGHT_RESOLVER_SCHEMA_VERSION ambient-subagent-spawn-preflight-resolver-v1 buildSubagentSpawnRuntimePreflightInput resolveSubagentSpawnRuntimePreflight buildSubagentSpawnCapacityLeaseInput resolveSubagentSpawnCapacityLease shouldRecordSubagentPreRunCapacityFailure preflightChildLaunch localMemory",
    subagentSpawnPreflightResolverTest:
      "builds and executes runtime launch preflight inputs without inventing a runtime maps parent, model, existing run, and local-memory preflight data into capacity leases records pre-run capacity failures only for denied runtime local-memory preflights",
    subagentTargetResolver:
      "SUBAGENT_TARGET_RESOLVER_SCHEMA_VERSION ambient-subagent-target-resolver-v1 resolveSubagentTargetRun resolveSubagentTargetWaitBarrier assertSubagentRunOpenForAction childRunId, agentId, or canonicalTaskPath must identify an existing sub-agent run. does not belong to the current parent thread No sub-agent wait barrier exists for child run",
    subagentTargetResolverTest:
      "resolves target runs by childRunId, agentId, and canonical task path within the parent thread resolves explicit wait barriers and latest barriers for target child runs blocks actions against closed or terminal sub-agent runs",
    subagentToolScopeRequest:
      "SUBAGENT_TOOL_SCOPE_REQUEST_SCHEMA_VERSION resolveSubagentToolScopeRequest unavailableRequestedExtensionToolNames",
    subagentToolScopeRequestTest: "reports only unavailable Pi-visible surfaced extension tools",
    subagentToolScopeLaunchPolicy:
      "SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION ambient-subagent-tool-scope-launch-policy-v1 SUBAGENT_TOOL_SCOPE_LAUNCH_HARD_DENIED_CATEGORIES SubagentLaunchChildWorkflowPolicyInput resolveSubagentLaunchWorkspaceToolPolicy resolveSubagentToolScopeLaunchDenial subagentToolScopeRequestIsExplicit callableWorkflowBridge allowCallableWorkflowTools remainingFanout Callable workflow child bridge allowed by role policy parentPermissionMode phase4_isolation_required requested_scope_denied Sub-agent role/tool scope is not launchable in Phase 4 without additional isolation Requested sub-agent tool scope was denied",
    subagentToolScopeLaunchPolicyTest:
      "builds the launch workspace policy snapshot from parent mode and child worktree state enables callable workflow bridge only with isolated worktree and remaining fanout budget blocks Phase 4 mutation and nested fanout hard-denials before child launch only turns non-hard denials into launch failures when the task explicitly requested tool scope",
    subagentSpawnBlockDecision:
      "SUBAGENT_SPAWN_BLOCK_DECISION_SCHEMA_VERSION ambient-subagent-spawn-block-decision-v1 resolveSubagentSpawnBlockDecision Sub-agent capacity was unavailable. capacityBlocked toolScopeBlocked launchDenialKind",
    subagentSpawnBlockDecisionTest:
      "gives capacity blocks precedence over tool-scope denials after reservation uses the capacity fallback reason when a blocked lease has no specific blockers turns launch denials into tool-scope blocks with approval-unavailable metadata allows launch when capacity is reserved and no launch denial is present",
    subagentPreRunSpawnFailureRecorder:
      "SUBAGENT_PRE_RUN_SPAWN_FAILURE_RECORDER_SCHEMA_VERSION ambient-subagent-pre-run-spawn-failure-recorder-v1 recordSubagentPreRunSpawnFailure recordScheduledSubagentSpawnPolicyFailure buildSubagentPreRunSpawnFailureParentMailboxInput buildScheduledSubagentSpawnFailureParentMailboxInput",
    subagentPreRunSpawnFailureRecorderTest:
      "appends model-scope failures through the typed parent-mailbox builder preserves runtime preflight, capacity, and unavailable extension evidence appends scheduled-spawn policy failures before live child creation",
    subagentPostReservationSpawnFailureRecorder:
      "SUBAGENT_POST_RESERVATION_SPAWN_FAILURE_RECORDER_SCHEMA_VERSION ambient-subagent-post-reservation-spawn-failure-recorder-v1 recordSubagentPostReservationSpawnFailure buildSubagentPostReservationSpawnFailureParentMailboxInput",
    subagentPostReservationSpawnFailureRecorderTest:
      "appends visible failed-child evidence for tool-scope launch blocks appends capacity failures without deleting reserved child evidence",
    subagentLaunchRejectionRecorder:
      "SUBAGENT_LAUNCH_REJECTION_RECORDER_SCHEMA_VERSION ambient-subagent-launch-rejection-recorder-v1 recordSubagentLaunchRejection subagent.spawn_rejected recordSubagentPostReservationSpawnFailure",
    subagentLaunchRejectionRecorderTest:
      "records a visible failed child for tool-scope launch rejections preserves capacity blocking evidence when marking a reserved child failed",
    subagentSpawnLaunchExecutor:
      "SUBAGENT_SPAWN_LAUNCH_EXECUTOR_SCHEMA_VERSION ambient-subagent-spawn-launch-executor-v1 executeSubagentSpawnLaunch recordSubagentLaunchRejection resolveSubagentSpawnBlockDecision buildSubagentSpawnRequestedRunEventInput buildSubagentTaskMailboxEventInput turnBudgetPolicy",
    subagentSpawnLaunchExecutorTest:
      "materializes successful required launches with snapshots, mailbox work, wait barrier, and runtime start records blocked post-reservation launches and fails required wait barriers",
    symphonyMutationWorkspaceLeaseService:
      "acquireSymphonyMutationWorkspaceLease scratch_overlay readOnlyBaseRoots writableRoots releaseSymphonyMutationWorkspaceLease heartbeatSymphonyMutationWorkspaceLease",
    symphonyMutationWorkspaceLeaseServiceTest:
      "sym-scratch-overlay-isolation creates a scratch_overlay lease and leaves root files untouched before promotion",
    subagentChildDecisionRequest:
      "buildSymphonyChildDecisionRequest retry_child grant_scope accept_partial cancel_group exit_symphony needs_attention captcha",
    subagentChildDecisionRequestTest: "sym-barrier-decision-replay maps previous wait failures to durable Symphony decisions",
    subagentFailedSpawnWaitBarrier:
      "SUBAGENT_FAILED_SPAWN_WAIT_BARRIER_SCHEMA_VERSION ambient-subagent-failed-spawn-wait-barrier-v1 resolveSubagentFailedSpawnWaitBarrier buildSubagentFailedSpawnWaitBarrierResolutionArtifact synthesisAllowed: false",
    subagentFailedSpawnWaitBarrierTest:
      "marks waiting required barriers failed when a reserved child spawn fails leaves already resolved barriers unchanged and idempotent",
    subagentResultValidation:
      "SUBAGENT_RESULT_VALIDATION_SCHEMA_VERSION ambient-subagent-result-validation-v1 validateSubagentResultForRun validateSubagentResultArtifactForSynthesis validateSubagentStructuredResultArtifactForRole validateSubagentCompletionGuard",
    subagentResultValidationTest:
      "blocks failed child artifacts from parent synthesis blocks completed implementation results without matching Ambient mutation evidence allows completed implementation results when structured evidence matches Ambient events",
    subagentWaitBarrierResolution:
      "SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION ambient-subagent-wait-barrier-resolution-v1 evaluateSubagentWaitBarrierForStore resolveSubagentWaitBarrierForRun resolveActiveSubagentWaitBarriersForRun",
    subagentWaitBarrierResolutionTest:
      "keeps required barriers waiting while active children can still finish fails required barriers when terminal unsafe children make synthesis impossible marks active barriers timed out without fabricating child output",
    subagentWaitContextResolver:
      "SUBAGENT_WAIT_CONTEXT_RESOLVER_SCHEMA_VERSION ambient-subagent-wait-context-resolver-v1 resolveSubagentWaitContext findSubagentWaitBarrierForRuns",
    subagentWaitContextResolverTest:
      "reuses matching aggregate barriers and preserves explicit quorum policy rejects aggregate waits across parent runs or with unrelated primary handles",
    subagentWaitAgentExecutor:
      "SUBAGENT_WAIT_AGENT_EXECUTOR_SCHEMA_VERSION ambient-subagent-wait-agent-executor-v1 executeSubagentWaitAgent approvalRequestRecords supervisorRequestRecords approvalResponseDeliveries resolveChildApprovalResponse followupChildRun waitTimedOutResolvesBarrier turnBudgetState turnBudgetWrapUpSteering turnBudgetWrapUpDelivery recordSubagentTurnBudgetWrapUpSteeringIfNeeded Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child. Child requested supervisor attention; parent mailbox records the request and the parent remains blocked until the child is synthesis-safe. Child sent a supervisor progress update; parent mailbox records the update while the parent keeps monitoring the child. Child approval response was delivered to the child runtime; the parent remains blocked until the child reaches a synthesis-safe result.",
    subagentWaitAgentExecutorTest:
      "records completed waits after runtime completion and barrier resolution waits on the latest reservation state without fabricating output when no runtime is attached records durable turn-budget wrap-up steering while a required child is still running delivers turn-budget wrap-up steering to an attached child follow-up runtime keeps turn-budget wrap-up steering queued when the runtime cannot accept it yet reports exhausted turn budget without fabricating a child result records child approval requests and leaves the parent blocked on the child wait barrier records child supervisor requests without treating them as child completion delivers queued approval responses to the child runtime before waiting again leaves approval responses queued when no child approval-response resolver is attached",
    subagentTurnBudgetWrapUpRecorder:
      'SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION recordSubagentTurnBudgetWrapUpSteeringIfNeeded shouldRecordSubagentTurnBudgetWrapUpSteering SUBAGENT_TURN_BUDGET_WRAP_UP_STEERING_REASON buildSubagentTurnBudgetWrapUpSteeringMessage compactSubagentTurnBudgetWrapUpSteeringRecord operation: "turn-budget-wrap-up" subagent.followup_agent.queued',
    subagentTurnBudgetWrapUpRecorderTest:
      "queues one durable child follow-up when the turn budget reaches the wrap-up threshold replays existing wrap-up steering without duplicating mailbox or run events does not steer terminal, closed, non-due, or exhausted child runs builds explicit wrap-up instructions with partial-result semantics",
    subagentTurnBudgetExhaustionRecorder:
      "SUBAGENT_TURN_BUDGET_EXHAUSTION_RECORDER_SCHEMA_VERSION settleSubagentTurnBudgetExhaustionIfNeeded SUBAGENT_TURN_BUDGET_EXHAUSTED_EVENT_TYPE turn-budget-exhaustion",
    subagentWaitCompletionRecorder:
      "SUBAGENT_WAIT_COMPLETION_RECORDER_SCHEMA_VERSION ambient-subagent-wait-completion-recorder-v1 recordSubagentWaitCompletionMailboxIfNeeded nextSubagentWaitCompletionMailboxCreatedAt",
    subagentWaitCompletionRecorderTest:
      "records a delivered child-to-parent mailbox with matching run-event evidence returns existing mailbox evidence for idempotent replay does not record while a child and required wait barrier are still active",
    subagentWaitBarrierAttentionRecorder:
      "SUBAGENT_WAIT_BARRIER_ATTENTION_RECORDER_SCHEMA_VERSION ambient-subagent-wait-barrier-attention-recorder-v1 recordSubagentWaitBarrierAttentionParentMailboxIfNeeded buildSubagentWaitBarrierAttentionParentMailboxDraft",
    subagentWaitBarrierAttentionRecorderTest:
      "records queued parent attention for blocked required wait barriers records timed-out wait-for-child barriers so the parent can ask the user does not record optional background barriers",
    subagentSpawnFailure:
      'SUBAGENT_SPAWN_FAILURE_SCHEMA_VERSION SCHEDULED_SUBAGENT_AUTOMATION_DEFERRED_REASON buildSubagentPreRunSpawnFailureParentMailboxInput buildSubagentPostReservationSpawnFailureParentMailboxInput buildScheduledSubagentSpawnFailureParentMailboxInput compactSubagentRuntimeLaunchPreflightForPi compactSubagentModelScopeForPi compactSubagentParentMailboxForPi buildSubagentSpawnBlockedResultArtifact failureStage: "runtime_launch_preflight" failureStage: "capacity" failureStage: "tool_scope" scheduledSpawnFields cannot inherit live parent context',
    subagentSpawnFailureTest:
      "builds scheduled spawn failure mailbox payloads before live child creation builds post-reservation failed-child evidence without deleting the visible child thread compacts model, runtime, and capacity evidence for pre-run spawn failures",
    subagentSpawnRequest:
      "SUBAGENT_SPAWN_REQUEST_SCHEMA_VERSION SUBAGENT_TASK_MAILBOX_TYPE buildSubagentSpawnRequestedRunEventInput buildSubagentTaskMailboxEventInput ambient-subagent-spawn-request-v1 subagent.spawn_requested subagent.task childRunId parentThreadId toolScopeSnapshot turnBudgetPolicy wrapUpAtTurn single_steer_then_grace orchestrationStarted: false",
    subagentSpawnRequestTest:
      "builds schema-versioned spawn-request run events with bounded launch evidence builds schema-versioned task mailbox payloads with stable parent and child handles",
    subagentToolScopeSnapshot:
      "compactSubagentToolScopeSnapshot subagentToolScopeSnapshotDisplayMetadata callableWorkflowBridgeDisplayMetadata subagentToolScopeApprovalUnavailable deniedCategoryIdsFromSubagentToolScopeSnapshot deniedToolIdsFromSubagentToolScopeSnapshot callableWorkflowBridge ambient-subagent-tool-scope-display-metadata-v1 displayMetadata",
    subagentToolScopeSnapshotTest:
      "compacts exact launch scope and adds display metadata without dropping deny reasons adds callable workflow bridge display metadata from resolver inputs detects approval-unavailable state from persisted and compact snapshot shapes extracts unique denied ids from compact, persisted, and legacy payloads",
    subagentGroupJoin:
      "SUBAGENT_GROUPED_COMPLETION_PARENT_MAILBOX_TYPE SUBAGENT_GROUPED_COMPLETION_SCHEMA_VERSION buildSubagentGroupedCompletionNotificationDraft createSubagentGroupedCompletionPayloadFingerprint",
    subagentGroupJoinTest:
      "updates an existing child completion in place without creating duplicate child rows rebatches straggler completions into the latest queued parent notification",
    subagentGroupedCompletionRecorder:
      "SUBAGENT_GROUPED_COMPLETION_RECORDER_SCHEMA_VERSION ambient-subagent-grouped-completion-recorder-v1 recordSubagentGroupedCompletionNotificationIfNeeded subagentGroupedCompletionSummary",
    subagentGroupedCompletionRecorderTest:
      "records optional background completions with bounded artifact summaries does not record required, active, or unsafe completed children",
    subagentParentPolicyResolution:
      "SUBAGENT_PARENT_POLICY_RESOLUTION_SCHEMA_VERSION resolveSubagentParentPolicyForWait resolveSubagentParentPolicyForBarrierDecision allowedUserChoicesForSubagentWaitBarrier",
    subagentParentPolicyResolutionTest:
      "blocks parent synthesis while a required child barrier is still waiting requires user input before degrading a failed required barrier to partial keeps detach and cancel barrier decisions blocked and non-synthesizing",
    subagentWaitBarrierEvaluation:
      "SUBAGENT_WAIT_BARRIER_EVALUATION_SCHEMA_VERSION SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES evaluateSubagentWaitBarrierForSynthesis requiredSynthesisCountForBarrier waitBarrierStatusFromEvaluation",
    subagentWaitBarrierEvaluationTest:
      "uses explicit quorum thresholds and detects impossible quorum barriers resolves all-cancelled impossible barriers as cancelled resolves unsatisfied timed-out barriers as timed_out",
    subagentWaitMailbox:
      "SUBAGENT_WAIT_COMPLETION_SCHEMA_VERSION SUBAGENT_WAIT_BARRIER_ATTENTION_SCHEMA_VERSION buildSubagentWaitCompletionMailboxDraft buildSubagentWaitBarrierAttentionParentMailboxDraft shouldRecordSubagentWaitCompletion shouldRecordSubagentWaitBarrierAttention",
    subagentWaitMailboxTest:
      "builds stable delivered wait-completion mailbox and run-event drafts builds compact queued parent attention mailbox drafts with allowed choices",
    subagentBarrierDecision:
      "SUBAGENT_WAIT_BARRIER_DECISION_SCHEMA_VERSION SUBAGENT_USER_DECISION_SCHEMA_VERSION SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION buildSubagentBarrierDecisionParentMailboxDraft buildSubagentBarrierDecisionResolutionArtifact buildSubagentBarrierDecisionRunEventPreview subagentBarrierDecisionNextStatus",
    subagentBarrierDecisionTest:
      "builds explicit partial resolution artifacts with user decision provenance builds cancel-parent resolution artifacts with control-state provenance builds parent mailbox drafts and replays control state from existing artifacts",
    subagentBarrierDecisionRecorder:
      "SUBAGENT_BARRIER_DECISION_RECORDER_SCHEMA_VERSION ambient-subagent-barrier-decision-recorder-v1 recordSubagentBarrierDecisionParentMailbox buildSubagentBarrierDecisionParentMailboxDraft",
    subagentBarrierDecisionRecorderTest:
      "records a delivered parent mailbox event for explicit barrier control state replays persisted control state from the barrier resolution artifact",
    subagentBarrierControl:
      "SUBAGENT_BARRIER_CANCEL_PARENT_SOURCE buildSubagentBarrierControlPlan buildSubagentBarrierControlRunPlan shouldMarkSubagentBarrierControlRunStatus buildSubagentBarrierCancelledMailboxPayload",
    subagentBarrierControlTest:
      "plans cancel-parent runtime cancellation with stable idempotency and source metadata marks only active mismatched statuses after runtime cancellation returns",
    subagentBarrierControlExecutor:
      "SUBAGENT_BARRIER_CONTROL_EXECUTOR_SCHEMA_VERSION ambient-subagent-barrier-control-executor-v1 executeSubagentBarrierControlDecision cancelPendingParentToChildMailboxEvents",
    subagentBarrierControlExecutorTest:
      "cancels active children through the runtime and cancels pending parent-to-child mailbox work does not overwrite terminal runtime results during cancel-parent control",
    subagentBarrierDecisionExecutor:
      "SUBAGENT_BARRIER_DECISION_EXECUTOR_SCHEMA_VERSION ambient-subagent-barrier-decision-executor-v1 executeSubagentBarrierDecision executeSubagentBarrierControlDecision recordSubagentBarrierDecisionParentMailbox",
    subagentBarrierDecisionExecutorTest:
      "records partial barrier decisions across barrier, child, and parent mailbox evidence replays existing barrier decisions without repeating child side effects",
    subagentMailbox:
      "SUBAGENT_MAILBOX_DELIVERY_BATCH_SCHEMA_VERSION ambient-subagent-mailbox-delivery-batch-v1 listSubagentMailboxEventsForDelivery deliverQueuedParentToChildMailboxEvents consumeDeliveredParentToChildMailboxEvents cancelPendingParentToChildMailboxEvents",
    subagentMailboxTest:
      "delivers queued parent-to-child events idempotently consumes delivered events and cancels pending parent-to-child events without touching terminal mailbox state",
    subagentMailboxRequest:
      "SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION SUBAGENT_CHILD_MESSAGE_MAILBOX_TYPE SUBAGENT_CHILD_FOLLOWUP_MAILBOX_TYPE resolveSubagentChildMailboxRequest createSubagentChildMailboxRequestIdempotencyKey buildSubagentChildMailboxEventInput buildSubagentChildMailboxRunEventInput buildSubagentChildMailboxThreadMessage compactSubagentChildRuntimeFollowup supervisorRequestParentMailboxEventId supervisorChoiceId",
    subagentMailboxRequestTest:
      "maps send and followup actions to typed mailbox and run-event contracts links parent steering to a child supervisor request without raw parent payloads builds replay and runtime followup summaries without exposing raw payloads",
    subagentChildMailboxExecutor:
      "SUBAGENT_CHILD_MAILBOX_EXECUTOR_SCHEMA_VERSION ambient-subagent-child-mailbox-executor-v1 executeSubagentChildMailbox buildSubagentChildMailboxEventInput",
    subagentChildMailboxExecutorTest:
      "queues parent-to-child messages with matching run-event and child-thread evidence queues supervisor steering with matching child mailbox metadata hands followups to the runtime with delivery state callbacks and runtime event emitters",
    subagentTurnBudget:
      "SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION resolveSubagentTurnBudgetPolicy compactSubagentTurnBudgetPolicyForPi evaluateSubagentTurnBudgetForEvents compactSubagentTurnBudgetStateForPi turnBudgetPolicy turnBudgetState wrapUpAtTurn wrap_up_due max_turns_exceeded single_steer_then_grace",
    subagentTurnBudgetTest:
      "derives wrap-up and partial exhaustion policy from role guard limits compacts the policy for Pi-visible launch evidence",
    subagentAgentStatus:
      "SUBAGENT_AGENT_STATUS_SCHEMA_VERSION SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION compactSubagentRunForPi compactSubagentCapacityLeaseForPi compactSubagentTurnBudgetPolicyForPi buildSubagentListAgentsText buildSubagentStatusText",
    subagentAgentStatusTest:
      "lists child runs with canonical paths and close state builds status text with event counts and parent synthesis state",
    sharedSubagentToolScope:
      "UNSUPPORTED_CHILD_BRIDGE_PI_VISIBLE_SOURCES child-safe bridge Callable workflow tool is outside the child role policy allowlist.",
    sharedSubagentContractsTest: "denies Pi-visible direct MCP and connector sources until child-safe bridges exist",
    symphonyWorkflowRecipes:
      "SYMPHONY_WORKFLOW_RECIPE_SCHEMA_VERSION AMBIENT_SUBAGENTS_FEATURE_FLAG SYMPHONY_WORKFLOW_PATTERN_IDS map_reduce adversarial_debate imitate_and_verify pipeline ensemble self_healing_loop defaultCollapsedChildThreads diagramSvg allowCustom: true objective_metric rubric verifier_criteria estimated_agents token_cost_budget tool_mutation_scope checkpoint_resume approval_failure_handling parent_pi_visible_by_default child_role_policy_required json_schema_then_repair compactInvocationByDefault",
    symphonyWorkflowRecipesTest:
      "sym-pattern-six-pack defines all six planned Symphony patterns behind ambient.subagents requires conversational Custom choices and metric or rubric templates for every pattern keeps launch cards, callable workflow tools, and recorder policy aligned with the plan",
    callableWorkflowRegistry:
      "CALLABLE_WORKFLOW_REGISTRY_SCHEMA_VERSION CALLABLE_WORKFLOW_TOOL_SCHEMA_VERSION CALLABLE_WORKFLOW_RUN_PLAN_SCHEMA_VERSION CALLABLE_WORKFLOW_CATALOG_STATUS_SCHEMA_VERSION buildCallableWorkflowRegistry buildCallableWorkflowCatalogStatus compileSymphonyRecipeToCallableWorkflowTool compileRecordedWorkflowPlaybookToCallableWorkflowTool parentPiVisibleCallableWorkflowTools childVisibleCallableWorkflowTools validateCallableWorkflowToolInput repairCallableWorkflowToolInput buildCallableWorkflowRunPlan recordedWorkflowPlaybooks recordedWorkflowToolName catalogStatus excludedRecordedWorkflowCount recorded_workflow excluded_not_callable hidden_feature_disabled parent_pi_visible child_role_policy_required visible_background_task defaultCollapsedChildThreads tokenCostTracking pauseResumeCancel nestedFanoutLimitRequired recorded_playbook_confirmed input_schema_confirmed trace_diagnostics_artifact recorderCompactInvocationByDefault fullTraceArtifact json_schema_then_repair",
    callableWorkflowRegistryTest:
      "hides all Symphony workflow tools when ambient.subagents is off compiles Symphony presets into parent-visible callable workflow tools when enabled compiles confirmed recorded playbooks into gated callable workflow tools compiles one confirmed recorded playbook for compact recorder invocation previews builds callable workflow catalog status with child-gated tools and excluded recorded playbook reasons keeps child callable workflow tools blocked unless role policy and nested fanout limit allow them validates and deterministically repairs callable workflow input before building a run plan",
    callableWorkflowPiTools:
      "CALLABLE_WORKFLOW_PI_TOOLS_RUNTIME CALLABLE_WORKFLOW_PI_TOOLS_PHASE callableWorkflowActiveToolNamesForThread createCallableWorkflowPiToolDefinitions getChildCallableWorkflowToolNames childCallableWorkflowToolNames parentPiVisibleCallableWorkflowTools queued_not_started workflowRunPlan workflowExecutionPlan workflowTask startCallableWorkflowTask runnerBridgeStatus Cannot launch a callable workflow without an active parent run Cannot launch a callable workflow without a persistent workflow task queue Ambient queued a visible workflow background-task handoff Preparing callable workflow background task starts Ambient's workflow runner",
    callableWorkflowPiToolsTest:
      "exposes no parent-Pi workflow tools when ambient.subagents is off or the thread is a child exposes only exact child-granted callable workflow tools and queues them against the child run refuses stale child callable workflow tools after the child grant is revoked creates parent-visible Symphony and recorded workflow tools with run-plan execution contracts starts the configured runner bridge after queueing the persistent workflow task refuses launchable workflow calls without an active parent run refuses launchable workflow calls without a persistent task queue refuses stale workflow execution after the feature flag is disabled returns schema validation errors instead of executing irreparable workflow input",
    agentRuntimeCallableWorkflowTools: "childCallableWorkflowToolNames getChildCallableWorkflowToolNames",
    agentRuntimeCallableWorkflowToolsTest: "forwards child callable workflow grants to active-name checks and tool creation",
    agentRuntimeSymphonyParentMode:
      "activeToolNamesForSymphonyParentMode directExecutionPolicy deny_substantive_tools expectedWorkflowToolName ambient_workflow_symphony_map_reduce shouldRejectSymphonyParentModeActiveRunHandoff",
    agentRuntimeSymphonyParentModeTest:
      "sym-parent-not-worker keeps only conductor tools and strips parent-worker tools after recovery activation read bash edit write browser_search web_research_search",
    symphonyWebCapabilityRouter:
      "buildSymphonyWebCapabilityRoutePlan planSymphonyWebResearchProviderOrder dynamicHeadlessBrowser interactiveBrowserApproved childToolScopeAllowsInteractiveBrowserFallback",
    symphonyWebCapabilityRouterTest:
      "sym-web-capability-routing: prefers Brave search, fetches static before dynamic, and blocks child browser fallback ambient-brave-search dynamicHeadlessBrowser interactiveBrowser",
    agentRuntimeAmbientWorkflowReadOnlyTools:
      "ambient_workflows_callable_catalog ambient_workflows_callable_describe buildCallableWorkflowRegistry catalogStatus getFeatureFlagSnapshot getCallableWorkflowRecordedPlaybooks Callable workflow launch tools are not Pi-visible while ambient.subagents is disabled. visibleToolNames excludedEntryIds includeExcluded sourceKind query matchedEntryCount sourcePreviewIncluded visibleToolName",
    agentRuntimeAmbientWorkflowReadOnlyToolsTest:
      "reports callable catalog status without hidden launch tool names while subagents are disabled reports enabled callable catalog tool names, child policy gates, and excluded recorded workflow reasons searches callable catalog entries by query while preserving feature-gated tool visibility describes one callable workflow catalog entry with bounded source preview and visible launch name describes disabled callable catalog metadata without revealing hidden launch tool names",
    desktopToolRegistry:
      "ambient_workflows_callable_catalog ambient_workflows_callable_describe Inspect feature-flag-aware callable Symphony and recorded workflow catalog eligibility without launching workflows. Describe one callable Symphony or recorded workflow catalog entry with full bounded source preview",
    desktopToolRegistryTest: "ambient_workflows_callable_catalog ambient_workflows_callable_describe",
    callableWorkflowExecutionPlan:
      "CALLABLE_WORKFLOW_EXECUTION_PLAN_SCHEMA_VERSION buildCallableWorkflowExecutionPlan CallableWorkflowCallerProvenance callerProvenance queued_not_started callable_workflow_background_task workflowCompilerService callable_workflow_runner_not_connected compile_callable_workflow_to_artifact persist_workflow_run emit_workflow_run_started pauseResumeCancel tokenCostTracking",
    callableWorkflowExecutionPlanTest:
      "creates a visible queued background-task handoff with blocking and cancel metadata preserves child caller provenance for runner handoff and approval/worktree evidence produces stable launch ids for the same parent run, tool call, tool, and input",
    callableWorkflowTaskQueue:
      "CallableWorkflowTaskSummary CALLABLE_WORKFLOW_TASK_QUEUE_SCHEMA_VERSION CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE callableWorkflowQueuedTaskDraftFromExecutionPlan analyzeCallableWorkflowTaskRestartState buildCallableWorkflowCompilerHandoffPlan callerProvenance beginCallableWorkflowTaskCompilerHandoff linkCallableWorkflowTaskArtifact markCallableWorkflowTaskRunStarted markCallableWorkflowTaskRunFinished callableWorkflowTaskCallerProvenanceEventData callerKind childThreadId subagentRunId worktreeIsolated nestedFanoutSource childThreadRunId failCallableWorkflowTask workflow_run_terminal_task_unfinished missing_workflow_artifact staleWorkflowArtifactTaskIds workflow_artifact_not_compiled workflow_run_not_started workflow_run_started workflow_run_succeeded callable_workflow.task_started callable_workflow.task_finished compile_then_start_workflow_run workflowTask persistent workflow task queue includes child caller provenance on callable workflow restart issues",
    callableWorkflowTaskQueueTest:
      "persists queued visible background workflow tasks idempotently by launch id rejects callable workflow tasks whose parent run belongs to another thread builds queue drafts directly from visible execution-plan metadata carries child caller provenance into the compiler handoff plan records child caller attribution on started, control, and finished workflow task events transitions queued tasks through compiler handoff, artifact link, and started workflow run analyzes callable workflow task restart state without mutating task evidence reconciles callable workflow tasks whose linked run finished while the app was down reports stale callable workflow artifact pointers without deleting task evidence rejects workflow run linkage when the run belongs to a different artifact records failed compiler handoff state without deleting task evidence cancels queued callable workflow tasks without deleting launch evidence cancels running callable workflow tasks and records one finished event relinks paused callable workflow tasks to resumed workflow runs hydrates linked workflow progress and usage snapshots on task summaries",
    callableWorkflowRunner:
      "CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION executeCallableWorkflowTask validateCallableWorkflowRunnerExecutionBoundary refused child-originated mutating workflow artifact startCallableWorkflowTask runnerBridgeStatus",
    callableWorkflowRunnerTest:
      "compiles queued callable workflow tasks into artifacts and starts workflow execution passes child caller provenance through runner handoff to the workflow compiler refuses child-originated mutating workflow artifacts without child approval and worktree isolation allows child-originated mutating workflow artifacts with child-scoped approval and active isolated worktree evidence validates child mutating workflow boundaries with child identifiers before run handoff records compiler failure on the queued task without deleting launch evidence returns canceled when cancellation wins a later runner failure race",
    callableWorkflowDogfoodEvidence:
      "CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_SCHEMA_VERSION buildCallableWorkflowDogfoodEvidence validateCallableWorkflowDogfoodEvidence summarizeCallableWorkflowDogfoodEvidence launchCard workflow_launch_card_bounds workflow_mutating_child_worker workflow_parent_blocking_completion workflow_denied_child_scope workflow_restart_repair maturityAssertions subagent_child_thread child_bridge_policy this_child_thread staged_until_approved mutationOutput staged_file stagedRelativePath fullArtifactPath boundedPreview previewTruncated parentWorkspaceUnchanged Mutating worker dogfood wrote a concrete staged file parentBlocking blockedBeforeCompletion unblockedAfterCompletion CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION callableWorkflowParentBlockingIdempotencyKey deniedWorkflowScopeProof deniedScope SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION phase4_isolation_required workflow.call callable_workflow:ambient_workflow_symphony_map_reduce Callable workflow child bridge is disabled by child role policy. Callable workflow child bridge requires an active isolated child worktree. Callable workflow child bridge is unavailable because the nested fanout limit is exhausted. workflow_run_terminal_task_unfinished terminalRepairObserved maturityAssertions: workflow_launch_card_bounds:passed Callable workflow dogfood maturity assertion workflow_parent_blocking_completion status is failed; expected passed. secret-like material",
    callableWorkflowDogfoodEvidenceTest:
      "builds mutating child workflow dogfood evidence with restart repair proof AMBIENT_CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_OUT writeCallableWorkflowDogfoodEvidenceArtifact mutationOutput: staged_file parentBlocking: blocked=true unblocked=true deniedScope: workflow.call / callable_workflow:ambient_workflow_symphony_map_reduce rejects dogfood evidence that drops child-scoped approval, mutation output, or restart repair proof Callable workflow dogfood mutation output must prove the parent workspace was unchanged. Callable workflow dogfood must prove parent synthesis was blocked before workflow completion. Callable workflow dogfood denied-scope proof is missing disabled child role policy reason.",
    callableWorkflowRehydrationEvidence:
      "CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_SCHEMA_VERSION buildCallableWorkflowRehydrationEvidence validateCallableWorkflowRehydrationEvidence summarizeCallableWorkflowRehydrationEvidence workflow_rehydrated_task_links workflow_rehydrated_artifact_payload workflow_rehydrated_progress_usage workflow_rehydrated_child_provenance maturityAssertions sameTaskId sameArtifactId sameRunId workflowThreadHydrated artifactSourcePathHydrated artifactStatePathHydrated artifactMutationPolicyHydrated artifactSpecHydrated sourcePath statePath mutationPolicy specGoal progressHydrated usageHydrated progressSnapshot usageSnapshot subagent_child_thread child_bridge_policy callable_workflow.task_started step.end maturityAssertions: workflow_rehydrated_task_links:passed Callable workflow rehydration maturity assertion workflow_rehydrated_progress_usage status is failed; expected passed. secret-like material",
    callableWorkflowRehydrationEvidenceTest:
      "builds restart rehydration evidence for linked task artifacts, runs, progress, and usage AMBIENT_CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_OUT writeCallableWorkflowRehydrationEvidenceArtifact rehydratedLinks: task=true artifact=true run=true artifact: source=true state=true mutation=staged_until_approved spec=true telemetry: events=4 modelCalls=1 tokens=21 rejects rehydration evidence without task links, artifact payloads, telemetry, or child provenance Callable workflow rehydration proof is missing workflowThreadHydrated. Callable workflow rehydration proof is missing artifactSourcePathHydrated. Callable workflow rehydration must prove child-originated caller provenance.",
    subagentLifecycleEdgeEvidence:
      "SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_SCHEMA_VERSION SUBAGENT_LIFECYCLE_EDGE_KINDS buildSubagentLifecycleEdgeEvidence validateSubagentLifecycleEdgeEvidence summarizeSubagentLifecycleEdgeEvidence restart stop detach cancel retry timeout partial_result retryRequestedRunIds retryAcceptedRunIds retryMailboxEventIds parentRemainedBlocked childSessionRestarted parentDidNotSynthesizeUnsafeChild resultArtifactStateExplicit affectedChildrenNamed decisionOrEventAttributed visibleCollapsedThreadState restartRepairObserved structuredCancellationResult detachedChildrenExcludedFromSynthesis parentCancellationRequested noTimedOutChildSynthesis failedChildNotSynthesized",
    subagentLifecycleEdgeEvidenceTest:
      "builds lifecycle edge evidence for restart, stop, detach, cancel, retry, timeout, and partial results AMBIENT_SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_OUT writeSubagentLifecycleEdgeEvidenceArtifact coveredEdges: restart, stop, detach, cancel, retry, timeout, partial_result rejects missing edge coverage and unsafe synthesis states rejects edge-specific contract gaps and secret-like evidence",
    workflowCompilerService:
      "WorkflowCompilerCallableInvocationContext workflowCompilerCallableInvocationContextFromRunnerInput workflowCompilerCallableInvocationCallerLines callerProvenance",
    workflowCompilerServiceTest:
      "adds callable workflow invocation provenance to compiler prompt mutable context persists callable workflow invocation provenance through compiler artifacts and audit events",
    callableWorkflowParentBlocking:
      "CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON resolveCallableWorkflowParentBlocking callableWorkflowParentBlockingIdempotencyKey callableWorkflowParentBlockingAllowedUserChoices blocking_callable_workflow_not_synthesis_safe waiting_on_workflow needs_attention Parent final answer blocked because blocking callable workflow work is not safe for synthesis.",
    callableWorkflowParentBlockingTest:
      "blocks parent finalization while blocking callable workflow tasks are unresolved does not block when every blocking callable workflow task has succeeded",
    subagentBatchJobs:
      "parentMessageId?: string SUBAGENT_BATCH_RESULT_REPORT_SCHEMA_VERSION SUBAGENT_BATCH_RESULT_LEDGER_SCHEMA_VERSION SUBAGENT_BATCH_RESULT_LEDGER_VALIDATION_SCHEMA_VERSION validateSubagentBatchResultLedgerExactlyOnce invalid_ledger reportsByItemId reportIds",
    subagentBatchJobsTest:
      'parentMessageId: "parent-message" accepts each item result exactly once and treats identical replay as a duplicate no-op validates exactly-once ledger invariants before accepting new reports rejects conflicting reports for an already reported item',
    localTextDelegation:
      "prepareLocalTextDelegationRuntimePlan enforceLocalModelResourceLaunchPolicy validateLocalModelResourcePolicySnapshot ambient-local-model-resource-policy-validation-v1 requestedLaunch resourcePolicyEnforcement invocationLimits ambient-local-text-delegation-invocation-limits-v1 launchReadiness ambient-local-text-runtime-launch-readiness-v1 preflightChildLaunch ambient-subagent-child-runtime-launch-preflight-v1 killLocalModelProcess completeLocalTextDelegation max_tokens outputValidation ambient-local-text-output-validation-v1 requiresFullOutputArtifact ambient-local-model-runtime-acquisition-v1 runtimeAcquisition compactLocalModelRuntimeAcquisition compactLocalModelRuntimeState runtimeState compactLocalModelRuntimeRelease runtimeRelease ambient-local-model-runtime-release-v1 releaseLocalTextRuntimeLease LocalTextDelegationRuntimeFailureError ambient-local-text-delegation-failure-v1 appendTerminalLocalTextReleaseEvidence ambient-local-text-terminal-release-v1 localTextOutputValidationPreview localTextRuntimePreflightPreview localTextResourcePolicyEnforcementLabel localRuntimeRowsForRun",
    localTextDelegationTest:
      "blocks local invocations that cannot fit the model context window does not acquire a runtime when requested local output exceeds the model max output limit does not acquire a runtime when the local launch descriptor is malformed unloads idle local model runtimes before acquiring when memory policy requires cleanup unloaded-idle preserves local text output validation evidence with completion results records local text output validation evidence in completed run events reuses a healthy persisted runtime after manager recreation returns idle cleanup timing when the final lease is released but the runtime stays warm keeps a reused local runtime alive until the final lease is released records still-leased runtime evidence in completed local text events preserves completed local text output when runtime release fails records completed local text events when runtime release fails records runtime release evidence when local text completion fails after acquire does not let a late local completion overwrite parent cancellation",
    localTextSubagentRuntime:
      'createLocalTextSubagentRuntimeAdapter validateLocalModelResourcePolicySnapshot requestedLaunch resourcePolicyEnforcement invocationLimits launchReadiness ambient-local-text-runtime-launch-readiness-v1 preflightChildLaunch ambient-subagent-child-runtime-launch-preflight-v1 buildResourceRegistryForLaunch residentDetection localTextStateRootPath killLocalModelProcess subagent.local_text_runtime_failed Local runtime acquisition source: "persisted" source: "active" Local runtime release releasedAt idleCleanupDueAt localModelRuntimeIdleCleanupDueAt cleanup due still-leased status: "failed" release store unavailable subagent.local_text_release_after_failure subagent.local_text_release_after_cancel subagent.local_text_release_after_partial terminalStatus: "failed" Local text runtime lease released after the child reached failed. Local text runtime lease released after the child was cancelled. Text output valid full artifact required Context: Local runtime memory',
    localTextSubagentRuntimeTest:
      "preflights local launch readiness before runtime start preflights local memory capacity before runtime start preflights custom local text runtime state roots as active memory evidence blocks local launch capacity when the resource policy snapshot contradicts its memory ceiling fails before acquiring the runtime when the local prompt exceeds model context limits fails before acquiring the runtime when the local launch descriptor is malformed records structured runtime startup failure evidence in the visible child thread unloads idle local runtimes and records enforcement before the visible child runs unloaded-idle shows local runtime lease state rows from completed local text events shows still-leased local runtime release evidence in inspector rows shows local runtime release failures in inspector rows shows local runtime release evidence from failed local text events shows terminal local runtime release evidence from strict budget failures shows local runtime release evidence from cancelled local text events shows local text output validation evidence in recent events shows local text runtime preflight evidence in recent events",
    localModelRuntimeManager:
      "LocalModelRuntimeManager LocalModelRuntimeStartupError ambient-local-model-runtime-startup-failure-v1 probeLocalModelRuntimeHealth LocalModelRuntimeLeaseRecoverySummary ambient-local-runtime-lease-recovery-v1 readRepairedLocalModelRuntimeLeaseJournalsWithRecovery",
    localModelRuntimeManagerTest:
      "LocalModelRuntimeManager LocalModelRuntimeStartupError throws structured startup failure evidence when health never becomes ready probeLocalModelRuntimeHealth reports stale persisted lease recovery when a dead runtime pid is repaired to crashed",
    localRuntimeInventory:
      "buildLocalRuntimeInventory ambient-local-runtime-inventory-v1 buildLocalRuntimePolicyHandoff localRuntimeLifecycleDecision",
    localRuntimeInventoryTest:
      "joins active sub-agent leases to local runtime rows and blocks ordinary Stop treats active-looking sub-agent leases as stale only when a freshness window is supplied",
    localModelRuntimeStatus:
      "buildLocalModelRuntimeStatusSnapshot localModelRuntimeStatusText leaseRecovery Lease recovery: actions Stop disabled, Restart disabled, Start disabled, Unload disabled",
    localModelRuntimeStatusTest:
      "joins active sub-agent leases into read-only runtime inventory stop blockers surfaces stale lease evidence without blocking ordinary Stop repairs dead persisted runtime owner leases as crashed status evidence",
    localModelRuntimeStart: "planLocalModelRuntimeStart ambient-local-model-runtime-start-plan-v1 localModelRuntimeStartText",
    localModelRuntimeStartTest:
      "blocks active sub-agent leases and reports the load decision reason blocks Start when the target load violates local memory policy blocks untracked local model processes",
    localModelRuntimeStop: "planLocalModelRuntimeStop ambient-local-model-runtime-stop-plan-v1 localModelRuntimeStopText",
    localModelRuntimeStopTest:
      "blocks active sub-agent leases and explains force requirements blocks malformed active owner leases without offering forced Stop",
    localModelRuntimeRestart: "planLocalModelRuntimeRestart ambient-local-model-runtime-restart-plan-v1 localModelRuntimeRestartText",
    localModelRuntimeRestartTest:
      "blocks Restart when reloading a stopped runtime violates local memory policy blocks malformed active owner leases without offering forced Restart",
    agentRuntimeLocalRuntimeTools:
      "createLocalRuntimeToolExtension ambient_local_model_runtime_start ambient_local_model_runtime_stop ambient_local_model_runtime_restart localRuntimeOwnershipResolutionRequest localRuntimeOwnershipResolutionAfterInventoryRefresh",
    agentRuntimeLocalRuntimeToolsTest:
      "runs provider-declared Start, Stop, and Restart for voice runtime rows resolves forced provider-declared Stop ownership before stopping a sub-agent owned runtime",
    localRuntimeOwnershipResolution:
      "localRuntimeOwnershipResolutionRequest localRuntimeOwnershipResolutionAfterInventoryRefresh cancel-or-mark-affected-subagents",
    localModelResourceRegistry:
      "enforceLocalModelResourceLaunchPolicy validateLocalModelResourcePolicySnapshot ambient-local-model-resource-policy-validation-v1 requestedLaunch unloaded-idle residentDetection localTextStateRootPath",
    localModelResourceRegistryTest:
      "discovers Ambient-managed local text runtime state through detector options unloads idle candidates before launch when unload-idle behavior is configured validates local-memory policy snapshots before launch enforcement rejects policy decisions that understate snapshotted requested launch memory",
    localTextSubagentStartupConfig:
      "localTextSubagentStartupFeatureFromEnv resolveRuntimeForMain selectableAsMain: true AMBIENT_LOCAL_TEXT_SUBAGENT_COMMAND AMBIENT_LOCAL_TEXT_SUBAGENT_COMPLETION_URL",
    localTextSubagentStartupConfigTest:
      "builds an available local text profile and runtime descriptor from startup env does not enable local profiles for partial or invalid descriptors",
    subagentParentClusterUiModel:
      "subagentParentClusterModelsByMessageId barrierChildCountLabel barrierBlockingChildLabels blockingChildLabels quorumThreshold spawnFailureActivity toolScopeFailureDetail Approval unavailable childApprovalRequestActivity childApprovalForwardedActivity Approval requested Approval forwarded Approval needed parentBlocker withChildBlockerMeta metaLabels Elapsed: Latest: Blocking: approval Blocking: needs decision Blocking: completion guard Blocking: child queued Blocking: child starting Blocking: child running Blocking: child waiting Ready: child complete Blocking: child failed Blocking: child timed out Blocking: child cancelled waitBarrierAttentionActivity waitBarrierDecisionActivity SubagentParentClusterMailboxActionModel waitBarrierChoiceAction toolAction resolve_barrier actionLabels SubagentParentClusterApprovalActionModel approvalActions childApprovalRequestActions supervisorRequestActivity latestQueuedSupervisorRequestForRun Supervisor request Child progress Child detached Parent cancelled Parent cancellation requested Retry requested retry-requested-runs SubagentParentClusterLifecycleEffectModel lifecycleEffectRows barrierDecisionLifecycleEffectRows effectRows Cancelled 1 child SubagentParentClusterWorkflowTaskBlockerModel callableWorkflowParentBlockingActivity callableWorkflowTaskModel workflowTaskParentBlockers workflowTaskParentBlockerKind Blocking: workflow work Blocking: workflow attention callableWorkflowTaskCanCancel callableWorkflowTaskCanPause callableWorkflowTaskCanResume callableWorkflowTaskTelemetryLabels telemetryLabels provenanceLabels Caller: sub-agent child Approval: Child Bridge Policy Worktree: isolated Nested fanout: Child Bridge Policy workflowThreadId workflowThreadLabel Workflow thread: canOpenWorkflowThread openWorkflowThreadTitle Open workflow thread Workflow blocked Callable workflow background tasks subagent-parent-cluster-mailbox-action subagent-parent-cluster-lifecycle-effect subagent-parent-cluster-workflows subagent-parent-cluster-workflow-blocker sourceLabel Child source: Workflow source: cancelTitle pauseTitle resumeTitle canOpenThread openThreadTitle childThreadSummaryRetained Summary retained retentionTitle canCancelChildRun canCloseChildRun Cancel sub-agent Close sub-agent",
    subagentParentClusterUiModelTest:
      "surfaces unresolved required wait barriers on the parent cluster Reading repository context surfaces quorum thresholds on collapsed parent barriers surfaces persisted detach and parent-cancel wait-barrier decisions on collapsed barriers surfaces retry wait-barrier decisions as active parent-blocking lifecycle effects Retry requested retry-requested-runs surfaces wait-barrier attention from parent mailbox activity leaves non-resolution wait-barrier choices visible but not clickable Cancel parent run surfaces wait-barrier decisions from parent mailbox activity surfaces detach and cancel wait-barrier decisions from parent mailbox activity surfaces child-source labels for approval and lifecycle mailbox activity labels child approval requests and forwarded decisions in the collapsed cluster marks approval-blocked required children with warning blocker indicators Approve child approval returns approved children to ordinary wait-barrier blocking indicators surfaces queued child supervisor requests as parent-blocking attention surfaces child supervisor progress updates without parent-blocking actions marks active required children in waiting barriers with status-specific blockers Elapsed: 1m 30s Latest: running activity marks terminal unsafe children in waiting barriers with status-specific blockers marks completed children in waiting barriers as ready while siblings still block Blocking: completion guard Mutation evidence: structured 1 / Ambient 1 / isolated worktree 1 / approval 0 marks completed and attention children closeable while preserving closed labels surfaces summary-retained children without open or control affordances creates a parent cluster for anchored blocking workflow tasks without child runs surfaces failed blocking workflow tasks as needs-attention mailbox activity marks callable workflow task rows that are blocking parent finalization surfaces queued callable workflow tasks as visible background rows surfaces callable workflow caller provenance in collapsed parent clusters surfaces callable workflow task progress and usage telemetry Workflow thread: workflow-thread-1 Open workflow thread workflow-thread-1 Pause blocking workflow task marks paused callable workflow tasks resumeable only when the linked run can resume surfaces failed callable workflow tasks as needs-attention rows surfaces spawn-failure model diagnostics from parent mailbox activity surfaces tool-scope approval-unavailable details from parent mailbox activity creates a parent cluster for anchored batch progress without child runs creates a parent cluster for anchored grouped completions without child run models creates an attention cluster for anchored child lifecycle interruptions without child runs creates a partial cluster for anchored runtime budget partials without child runs surfaces anchored parent-stop cascades as parent mailbox activity creates a parent cluster for anchored spawn failures without child runs",
    subagentParentClusterComponent:
      "SubagentParentCluster SubagentParentClusterProps subagent-parent-cluster-child-row subagent-parent-cluster-child-blocker subagent-parent-cluster-barrier-child subagent-parent-cluster-lifecycle-effect subagent-parent-cluster-workflow-launch-card subagent-parent-cluster-workflow-provenance subagent-parent-cluster-workflow-action is-open is-pause is-resume subagent-parent-cluster-workflow-blocker Callable workflow background tasks subagent-parent-cluster-mailbox-action subagent-parent-cluster-mailbox-action is-button Open workflow thread for Cancel workflow task Pause workflow task Resume workflow task Cancel sub-agent Close sub-agent Summary retained",
    subagentParentClusterComponentTest:
      'renders production-visible child, barrier, workflow, provenance, and action surfaces Caller: sub-agent child Approval: Child Bridge Policy Worktree: isolated Nested fanout: Child Bridge Policy class="subagent-parent-cluster" class="subagent-parent-cluster-lifecycle-effect tone-danger" Cancelled 1 child Parent cancellation requested aria-label="Callable workflow background tasks" aria-label="Sub-agent wait barriers" aria-label="Sub-agent mailbox activity" aria-label="Cancel sub-agent Reviewer" aria-label="Close sub-agent Summarizer"',
    subagentChildTranscriptComponent: "SubagentChildTranscriptLive subagent-parent-cluster-child-transcript-live",
    subagentChildTranscriptComponentTest:
      "sym-live-ux-export renders a live child transcript shell with runtime event context subagent-parent-cluster-child-transcript-live completionSummaryDeferredWhileLive child transcript message stream is the primary live surface desktop_chat_export_child_bundle",
    subagentChildTranscriptUiModel:
      "subagentChildTranscriptState subagentChildTranscriptRuntimeEventRows subagentChildTranscriptMailboxEventRows",
    subagentChildTranscriptUiModelTest: "keeps running child transcripts live without a terminal summary",
    appConversationMessagesTest:
      'renders live child transcripts from subagent cluster state data-child-transcript-layout="transcript-first" data-child-blocker-panel="after-transcript"',
    subagentParentClusterFixture:
      "subagentParentClusterFixtureModel Caller: sub-agent child Approval: Child Bridge Policy Worktree: isolated Nested fanout: Child Bridge Policy Blocking: approval Blocking: workflow work Summary retained effectRows Cancelled 1 child Parent cancellation requested",
    subagentParentClusterComponentVisualTest:
      "captures browser-rendered collapsed, expanded, provenance, blocker, and narrow states collapsedInitially horizontalOverflowFree subagent-parent-cluster-visual analyzePng nonBlackRatio distinctColorCount Caller: sub-agent child Worktree: isolated lifecycleEffectChips Parent cancellation requested",
    subagentIntegratedProductionUiVisualTest:
      "captures chat clusters, child inspector, replay, repair, and local runtime ownership together subagent-integrated-production-ui Actual chat surface with sub-agent parent cluster SubagentThreadInspector LocalModelsRuntimeInventory SubagentReplayEvidenceDiagnostics LocalRuntimeEvidenceDiagnostics SubagentRepairDiagnostics DiagnosticExportHistory Local runtime evidence Runtime rows Active owners Memory evidence In use by sub-agent Review worker Stop disabled Ordinary Stop/Restart blocked by 1 active sub-agent lease: lease-review Parent cancellation requested Lifecycle Cancel Parent connector_app:gmail.search Workflow bridge Disabled / 0/0 nested fanout slots remaining / 0 allowed tools Callable workflow child bridge is disabled by child role policy. Workflow Call (workflow.call) ambient_workflow_symphony_map_reduce Callable workflow tasks Callable workflow Active Task Interrupted artifact linked run linked child_bridge_policy",
    subagentThreadInspectorComponent:
      "SubagentThreadInspector subagent-thread-inspector Sub-agent run details Sub-agent wait barrier Sub-agent tool scope Recent sub-agent events Sub-agent repair diagnostics",
    appModalHost:
      "subagentApprovalScopeOptions Approve child request Deny child request Approval scope This child thread Parent thread tree Project/workspace Resolve sub-agent barrier Blocking child Decision note Partial summary Resolve barrier",
    rendererApp:
      "subagent-parent-cluster-child-blocker subagent-parent-cluster-barrier-child subagent-parent-cluster-child-blocker-context subagent-parent-cluster-child-blocker-meta subagent-parent-cluster-child-action subagent-parent-cluster-child-thread subagent-parent-cluster-child-open subagent-parent-cluster-child-open is-retained subagent-parent-cluster-child-row cancelSubagentChild closeSubagentChild resolveSubagentBarrierAction submitSubagentBarrierDecisionDialog subagentBarrierDecisionDialog SubagentBarrierDecisionDialog Resolve sub-agent barrier Blocking child Decision note Partial summary Resolve barrier onResolveBarrierAction subagentBarrierActionBusy resolveSubagentWaitBarrier resolveSubagentApprovalAction submitSubagentApprovalDecisionDialog subagentApprovalDecisionDialog SubagentApprovalDecisionDialog subagentApprovalScopeOptions Approve child request Deny child request Approval scope This child thread Parent thread tree Project/workspace cancelSubagentRun closeSubagentRun Cancel sub-agent Close sub-agent Summary retained subagent-parent-cluster-workflow-blocker Callable workflow background tasks subagent-parent-cluster-mailbox-action subagent-parent-cluster-mailbox-action is-button subagent-parent-cluster-workflows workflowThreadLabel openCallableWorkflowThread ensureWorkflowAgentChatThread Open workflow thread for cancelCallableWorkflowTask pauseCallableWorkflowTask resumeCallableWorkflowTask Cancel workflow task Pause workflow task Resume workflow task subagent-parent-cluster-workflow-action is-open is-pause is-resume",
    rendererStyles:
      "subagent-approval-dialog subagent-approval-scope-list subagent-barrier-dialog subagent-barrier-dialog-field subagent-parent-cluster-child-blocker subagent-parent-cluster-barrier-child subagent-parent-cluster-lifecycle-effect subagent-parent-cluster-child-blocker-context subagent-parent-cluster-child-blocker-meta subagent-parent-cluster-child-action subagent-parent-cluster-child-thread subagent-parent-cluster-child-open subagent-parent-cluster-child-open is-retained subagent-parent-cluster-child-row subagent-parent-cluster-workflow-blocker subagent-parent-cluster-mailbox-action subagent-parent-cluster-mailbox-action.is-button subagent-parent-cluster-workflows subagent-parent-cluster-workflow-action is-open is-pause is-resume",
    subagentThreadInspectorUiModel:
      "waitBarrierEvaluationRows waitBarrierChildStateLabel waitBarrierDecisionEffectRows Completion guard Mutation evidence This child quorumThreshold modelScopeRows Snapshot repair memoryPolicyLabel localMemoryRowsForRun Local memory projected runtimeStartupFailurePreview worktreeRowsForSnapshot Worktree path retentionPolicyLabel schedulingPolicyLabel Fanout callableWorkflowBridgeRowsForSnapshot Workflow bridge",
    subagentThreadInspectorUiModelTest:
      "shows quorum thresholds and synthesis counts in child thread wait details labels active wait-barrier child states distinctly in child thread details shows this child's own wait-barrier state in child thread details shows blocked completion guard evidence in child thread wait details shows detach and parent-cancel barrier decision effects in child thread details shows resolved model scope candidate diagnostics in the child inspector shows local memory capacity details in the child inspector shows local runtime startup failure diagnostics in recent events shows prepared child worktree details from the launch snapshot shows unavailable child worktree diagnostics from the launch snapshot shows callable workflow bridge status and allowed tools in the child inspector shows disabled callable workflow bridge reasons in the child inspector badges snapshot repair diagnostics for the selected child thread Persistent memory disabled Transient; cleanup after close Automation deferred; no live parent context",
    subagentRepairDiagnosticsUiModel: "subagentRepairDiagnosticsModel issueGroups Snapshot integrity",
    subagentRepairDiagnosticsUiModelTest: "groups snapshot integrity issues for repair settings and search",
    subagentMaturityUiModel:
      "subagentMaturityLiveHistoryModel subagentMaturityDesktopDogfoodHistoryModel subagentMaturityWorkflowJitterReleaseProfileModel Clean required-live runs Latest required-live Ready Desktop dogfood runs Latest Desktop dogfood Workflow jitter release profile Desktop dogfood history live_dogfood_failure_rate desktop_dogfood_count desktop_dogfood_failure_rate workflow_jitter_release_profile live_smoke required-live history",
    subagentMaturityUiModelTest:
      "summarizes green required-live history for graduation diagnostics flags sparse, flaky, or skipped live history in diagnostics search text summarizes green Desktop dogfood history for graduation diagnostics flags sparse or visually failing Desktop dogfood history summarizes green workflow jitter release-profile evidence flags missing or non-release workflow jitter evidence in diagnostics search text",
    subagentReplayEvidenceUiModel:
      "subagentReplayEvidenceInspectorModel DiagnosticExportSubagentReplayEvidence runtimeEventRows persistedEventRows parentMailboxRows callableWorkflowRows transcriptRows lifecycleEdgeRows restartRepairRows Lifecycle edges Lifecycle Restart Repair Lifecycle Cancel Parent Callable workflow tasks Callable workflow Active Task Interrupted caller Subagent Child Thread completionGuardSummary approvalLabel worktree path searchText approval unavailable denied tools connector_app:gmail.search workflowArtifactSourcePath workflowArtifactStatePath workflowArtifactMutationPolicy artifactLinkState runLinkState child_bridge_policy",
    subagentReplayEvidenceUiModelTest:
      "surfaces unavailable or failed summaries even when evidence collection produced no bundle object marks bounded timelines and exposes full search text for saved diagnostic filtering surfaces tool-scope denial metadata in parent mailbox replay rows and search surfaces completion guard metadata in parent mailbox replay rows and search completion guard blocked / mutation evidence structured 1 / Ambient 1 / isolated worktree 1 / approval 0 approval Permission Grant (approval-worker) worktree isolated Parent mailbox events Lifecycle Restart Repair Lifecycle Cancel Parent Callable workflow tasks Callable workflow Active Task Interrupted caller Subagent Child Thread parent message parent-message-1 Grouped child completion notification. workflow-task-1 workflow-artifact-1 /repo/.ambient-codex/workflows/replay/main.ts staged_until_approved child_bridge_policy approval unavailable denied tools connector_app:gmail.search",
    localRuntimeEvidenceUiModel:
      "localRuntimeEvidenceInspectorModel DiagnosticExportLocalRuntimeEvidence runtimeRows ownerRows blockedActionRows nextSafeActionRows memoryRows searchText Untracked process; do not assume safe to stop Forced action must cancel or mark affected sub-agents Memory basis Actual RSS",
    localRuntimeEvidenceUiModelTest:
      "summarizes local runtime diagnostic evidence as inspectable rows marks untracked runtimes and memory uncertainty as unsafe to stop silently Export diagnostics to inspect local runtime leases, blockers, and memory evidence.",
    diagnosticExportHistoryUiModel:
      "recordDiagnosticExportHistory diagnosticExportHistoryModel selectedDiagnosticExportFromHistory DIAGNOSTIC_EXPORT_HISTORY_STORAGE_KEY encodeDiagnosticExportHistoryStorage decodeDiagnosticExportHistoryStorage callableWorkflowTaskTimeline",
    diagnosticExportHistoryUiModelTest:
      'records recent diagnostic exports newest first with stable de-duping persists sanitized diagnostic bundle history and selected replay evidence across restarts diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("completion guard") toContain("approval 0") approvalId: "approval-worker" approvalSource: "permission_grant" worktreeIsolated: true worktreePath: "/repo/.ambient-codex/worktrees/child-1" parentMessageId: "parent-message-1" taskId: "workflow-task-1" workflowArtifactId: "workflow-artifact-1" workflowRunId: "workflow-run-1" artifactLinkState: "linked" runLinkState: "linked" approvalSource: "child_bridge_policy" nestedFanoutSource: "child_bridge_policy" Grouped child completion notification. failureStage: "tool_scope" approvalMode: "non_interactive" approvalUnavailable: true deniedCategoryIds: ["connector.read"] deniedToolIds: ["connector_app:gmail.search"] toContain("approval-worker") toContain("/repo/.ambient-codex/worktrees/child-1") toContain("parent-message-1") toContain("workflow-task-1") toContain("workflow-artifact-1") toContain("child_bridge_policy") toContain("tool_scope") toContain("connector_app:gmail.search")',
    settingsLayoutTest:
      "function SubagentReplayEvidenceDiagnostics function LocalRuntimeEvidenceDiagnostics function DiagnosticExportHistory diagnostics.export-history diagnostics.subagent-replay diagnostics.local-runtime-evidence Diagnostic export history Sub-agent replay Local runtime evidence subagentMaturityDesktopDogfoodHistoryModel subagentMaturityWorkflowJitterReleaseProfileModel Desktop dogfood history: Workflow jitter release profile: Export diagnostics to inspect child replay timelines. Export diagnostics to inspect local runtime leases, blockers, and memory evidence.",
    subagentThreatModelTest:
      "prompt-injection privilege escalation malicious MCP and connector metadata stale approvals rejects stale approval evidence from another child run secret secret-shaped source ids appears to contain secret-like material broad MCP and connector grants exact connector.operation ids exact server/tool operation ids non-callable source types surface exact callable tools separately Capability requires interactive approval, but this launch is non-interactive. fails connector access in non-interactive launches instead of creating stale approvals nested fanout hides parent-facing sub-agent fanout tools rejects forged implementation evidence unless Ambient recorded matching mutation evidence",
    subagentPiToolLiveSmoke:
      "AMBIENT_SUBAGENT_LIVE recordSubagentLiveSmokeEvidence recordSubagentLiveApprovalAuthorityEvidence recordSubagentRestartRecoveryEvidence subagent-live-smoke ambient_subagent SUBAGENT_CHILD_DONE SUBAGENT_LIVE_DONE SUBAGENT_OPTIONAL_BACKGROUND_DONE SUBAGENT_TOOL_DENIAL_LIVE_DONE approval-authority-latest.json optional_background workspace.write deniedCategories reconcileSubagentsOnRuntimeStartup active_run_interrupted restart-reconciliation-latest.json subagent.grouped_completion",
    subagentReplayDiagnostics:
      "ambient-subagent-replay-diagnostics-v1 ambient-subagent-replay-evidence-v1 ambient-subagent-lifecycle-edge-evidence-v1 liveTokens: false AMBIENT_SUBAGENT_REPLAY_EVIDENCE_OUT AMBIENT_SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_OUT fixtureEvidencePath lifecycleEdgeEvidencePath lifecycleEdgeEvidence runtimeEventTimeline parentMailboxTimeline parentMailboxEvents rehydration resultArtifactPointers missingResultArtifactRunIds restartRepair src/test/subagentFixtures.test.ts src/main/subagents/subagentRepair.test.ts src/main/subagents/subagentLifecycleEdgeEvidence.test.ts Lifecycle Edge Evidence writeSubagentReplayDiagnosticsReport",
  };
}
