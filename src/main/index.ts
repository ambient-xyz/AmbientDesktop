import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  protocol,
  screen,
  safeStorage,
  shell,
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import electronUpdater from "electron-updater";
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { rm, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import packageJson from "../../package.json";
import {
  AgentRuntime,
  RUNTIME_RESET_INTERRUPTED_RUN_MESSAGE,
  type AgentRuntimeFeatures,
} from "./agent-runtime/agentRuntime";
import {
  createAgentRuntimeFeatureFactory,
  type AgentRuntimeFeatureFactoryContext,
} from "./agent-runtime/agentRuntimeFeatureFactory";
import {
  archiveAmbientWorkflowPlaybook,
  describeAmbientWorkflowPlaybook,
  injectAmbientWorkflowPlaybook,
  restoreAmbientWorkflowPlaybookVersion,
  unarchiveAmbientWorkflowPlaybook,
  updateAmbientWorkflowPlaybook,
} from "./ambient/ambientWorkflows";
import { AmbientWorkflowLabJudgeProvider, runWorkflowLab } from "./workflow/workflowLab";
import { ambientRetryPolicyFromSettings } from "./ambient/aggressiveRetries";
import { getAppLogs, installAppLogCapture } from "./diagnostics/appLogs";
import { parseAmbientLaunchArgs } from "./desktop-shell/launchArgs";
import { localTextSubagentStartupFeatureFromEnv } from "./local-runtime/localTextSubagentStartupConfig";
import { AMBIENT_KEYS_URL } from "../shared/ambientUrls";
import { isAmbientSubagentsEnabled, resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { resolveSubagentApprovalDecision } from "./subagents/subagentApprovalDecision";
import { reconcileSubagentsOnRuntimeStartup } from "./subagents/subagentStartupReconciliation";
import { installAppMenu } from "./desktop-shell/menu";
import { createDesktopAppLifecycleService } from "./desktop-shell/desktopAppLifecycleService";
import { repairProjectBoardWorkflow, updateProjectBoardWorkflowRaw, updateProjectBoardWorkflowSettings } from "./project-board/projectBoardWorkflowBootstrap";
import {
  activeProjectBoardForState,
  activeProjectBoardThreadIdForStore,
  configureProjectBoardDesktopContextService,
  emitProjectBoardState,
  recordActiveProjectBoardExecutionReadinessBlocker,
} from "./project-board/projectBoardDesktopContextService";
import { createMainWindowBootstrapService } from "./desktop-shell/mainWindowBootstrapService";
import { createMainWindowRendererDiagnosticsService } from "./desktop-shell/mainWindowRendererDiagnosticsService";
import { createThreadMiniWindowService, isThreadMiniWindowRendererUrl } from "./desktop-shell/threadMiniWindowService";
import { createProjectBoardDesktopIpcDependencies } from "./project-board/projectBoardDesktopIpcDependencies";
import { createProjectRuntimeHostResolver } from "./project-runtime/projectRuntimeHostResolver";
import { createProjectRuntimeHostActivationService } from "./project-runtime/projectRuntimeHostActivationService";
import { createProjectRuntimeHostFactory } from "./project-runtime/projectRuntimeHostFactory";
import { createProjectRuntimeLifecycleService } from "./project-runtime/projectRuntimeLifecycleService";
import { createProjectRuntimeWorkspaceSwitchService } from "./project-runtime/projectRuntimeWorkspaceSwitchService";
import {
  applyProjectBoardIncrementalSynthesisFromRun,
  configureProjectBoardSynthesisDesktopService,
  requireProjectBoardForAction,
} from "./project-board/projectBoardSynthesisDesktopService";
import {
  configureProjectBoardProofDefaultsDesktopService,
  reviewFinishedProjectBoardRun,
} from "./project-board/projectBoardProofDefaultsDesktopService";
import { ProjectStore } from "./projectStore/projectStore";
import { configureProjectBoardDogfoodDesktopService } from "./project-board/projectBoardDogfoodDesktopService";
import { createWorkflowRecordingGlobalLibraryDesktopService } from "./workflow-recording/workflowRecordingGlobalLibraryDesktopService";
import { ProjectRegistry, archiveProjectChats, normalizeWorkspacePath, projectIdFromWorkspacePath, readProjectSearchResults } from "./workspace/projectRegistry";
import { ensureWelcomeOnboardingProject, resolveWelcomeOnboardingAssetsPath } from "./workspace/welcomeOnboarding";
import { providerCatalogSettingsState } from "./provider/providerCatalog";
import { getAmbientProviderStatus } from "./provider/providerStatus";
import { saveModelProviderCredentialForSettings } from "./model-provider/modelProviderCredentialStore";
import { installModelProviderEndpointForSettings } from "./model-provider/modelProviderSettingsInstall";
import { DesktopUpdateService, desktopUpdateConfigFromEnv } from "./desktop-shell/updateService";
import { createAppMenuUpdateService } from "./desktop-shell/appMenuUpdateService";
import { createExternalNavigationService } from "./security/externalNavigationService";
import { createSettingsRuntimeService } from "./settings/settingsRuntimeService";
import { createDesktopStateEventService } from "./desktop-shell/desktopStateEventService";
import { createDesktopStateSnapshotService } from "./desktop-shell/desktopStateSnapshotService";
import { LocalPreviewServerManager } from "./browser/localPreviewServer";
import { redactSensitiveText } from "./security/secretRedaction";
import { readSecretReference } from "./security/secretReferenceStore";
import { saveMcpServerEnvSecret } from "./mcp/mcpSecretReferences";
import { selectStartupWorkspacePath } from "./workspace/workspaceDefaults";
import { shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate } from "../shared/agentMemorySettings";
import type { AppThirdPartyCredit, DesktopEvent, DesktopState, ThemePreference, ThinkingDisplaySettings, ThreadActionInput, UpdateSttSettingsInput, UpdateVoiceSettingsInput } from "../shared/desktopTypes";
import type { EmbeddingProviderCandidate, LocalDeepResearchRunHistoryInput, LocalDeepResearchRunHistoryResult, LocalDeepResearchSettings, LocalDeepResearchSetupInput as LocalDeepResearchSetupIpcInput, LocalDeepResearchSetupResult, LocalModelResourcePolicyDecision, MessageVoiceArtifactInput, MiniCpmVisionAnalyzeInput, MiniCpmVisionSetupInput, RegenerateMessageVoiceInput, SetSttTtsSpeakingInput, SttProviderSetupInput, SttQueueState, SttSettings, SttTestAudioInput, SttTranscribeAudioInput, VoiceArtifactRetentionInput, VoiceProviderCandidate, VoiceSettings, VoiceSettingsAuditChange, VoiceSettingsAuditEntry, VoiceSettingsAuditSource } from "../shared/localRuntimeTypes";
import type { PermissionRequest } from "../shared/permissionTypes";
import type { GeneratePlannerDurableArtifactInput, PlannerPlanArtifact, PlannerSettings } from "../shared/plannerTypes";
import type { AmbientPluginRegistry, CodexHostedMarketplaceReport, CodexPluginCatalog, FirstPartyGoogleIntegrationState } from "../shared/pluginTypes";
import type { ProjectSummary } from "../shared/projectBoardTypes";
import type { ThreadSummary } from "../shared/threadTypes";
import type { SearchRoutingSettings } from "../shared/webResearchTypes";
import type { ResolveWorkflowRevisionInput, WorkflowAmbientCliCapabilityGrant, WorkflowRevisionSummary } from "../shared/workflowTypes";
import type { GitReviewSummary, OfficePreview, WorkspaceSearchInput } from "../shared/workspaceTypes";
import { emptyQueueState } from "../shared/messageDelivery";
import {
  clearImportedWorkspaceContext,
  clearImportedWorkspaceContextSync,
  describeWorkspaceAbsoluteContextPaths,
  describeWorkspaceContextReferences,
  getWorkspaceDiff,
  listWorkspaceFiles,
  resolveWorkspacePath,
  resolveWorkspacePathForOpen,
} from "./workspace/workspaceFiles";
import { createActiveWorkspaceFileService } from "./workspace/activeWorkspaceFileService";
import { registerWorkspaceMediaProtocol, WorkspaceMediaServer } from "./workspace/workspaceMedia";
import { OfficePreviewService, type OfficePreviewRenderResult } from "./office/officePreviewService";
import {
  commitGit,
  commitGitPaths,
  createGitBranch,
  createPullRequestUrl,
  discardGitFile,
  fetchGit,
  getGitReview,
  getWorkspaceGitStatus,
  initializeGitRepository,
  pullGit,
  pushGit,
  stageAllGitFiles,
  stageGitFile,
  switchWorkspaceBranch,
  unstageAllGitFiles,
  unstageGitFile,
} from "./workspace/workspaceGit";
import { createGitCheckpoint, latestGitCheckpoint, restoreLatestGitCheckpoint } from "./git/gitCheckpoints";
import { attachExistingThreadWorktree, createPermanentWorktree, prepareThreadWorktree } from "./git/gitWorktrees";
import { TerminalService } from "./terminal/terminalService";
import { listManagedDevServers, stopManagedDevServer } from "./tool-runtime/toolRuntimeMainContract";
import { TerminalStartTokenStore } from "./terminal/terminalSessionTokens";
import { PermissionPromptService } from "./permissions/permissionPrompts";
import { PrivilegedCredentialPromptService } from "./privileged-action/privilegedCredentialPrompts";
import { SecureInputPromptService } from "./security/secureInputPrompts";
import { permissionGrantTargetHash, resolvePermissionWithGrants } from "./permissions/permissionGrants";
import { classifyToolPermission } from "./permissions/permissionPolicy";
import {
  parseThreadPermissionModeChange,
  parseThreadSettingsUpdate,
  permissionModeChangeAuditDetail,
} from "./thread/threadSettingsAuthority";
import {
  AmbientPluginHost,
  codexPluginTrustFingerprint,
  type PluginMcpRuntimeSnapshot,
  type PluginMcpToolRegistration,
} from "./plugins/pluginHost";
import {
  acceptMcpToolDescriptorReviewForDesktop,
  ambientMcpInstallPreview,
  configureDesktopMcpInstallService,
  createMcpInstallCatalog,
  installMcpDefaultCapabilityForDesktop,
  installMcpRegistryServerForDesktop,
  mcpContainerRuntimeSetupStatePath,
  probeAmbientMcpContainerRuntimeStatus,
  reconcileMcpContainerRuntimeOnStartup,
  uninstallMcpServerForDesktop,
} from "./mcp/mcpDesktopInstallService";
import { probeContainerRuntime } from "./container-runtime/containerRuntimeProbeService";
import {
  buildContainerRuntimeInstallPlanFromProbe,
  launchContainerRuntimeInstallAction,
} from "./container-runtime/containerRuntimeInstallLauncher";
import { executeContainerRuntimeManagedInstallAction } from "./container-runtime/containerRuntimeManagedInstaller";
import { createPrivilegedActionAdapter, privilegedActionAdapterSelectionFromEnv } from "./privileged-action/privilegedActionAdapter";
import { writeContainerRuntimeManagedInstallRedactedLog, writePrivilegedActionRedactedLog } from "./privileged-action/privilegedActionLogs";
import {
  recordContainerRuntimeDeferred,
  recordContainerRuntimeInstallLaunched,
} from "./container-runtime/containerRuntimeSetupState";
import { McpToolBridge } from "./mcp/mcpToolBridge";
import {
  clearPiExtensionSandboxHistory,
  discoverPiExtensionSandboxPackages,
  installPiExtensionSandboxPackage,
  previewPiExtensionSandboxInstall,
  uninstallPiExtensionSandboxPackage,
  type PiExtensionSandboxInstallPreview,
} from "./agent-runtime/pi-package-tools/piExtensionSandboxPackages";
import { clearPiPrivilegedPackageHistory, disablePiPrivilegedPackage, discoverPiPrivilegedPackages, installPiPrivilegedPackage, scanPiPrivilegedPackage, uninstallPiPrivilegedPackage, type PiPrivilegedSecurityScan } from "./agent-runtime/pi-package-tools/piPrivilegedPackages";
import { PluginAuthService } from "./plugins/pluginAuthService";
import {
  configureOrchestrationAutoDispatchService,
  createAutoDispatchState,
  readAutoDispatchStatus,
  scheduleAutoDispatch,
  setAutoDispatchEnabled,
  stopAutoDispatch,
  workflowAutoDispatchDisabledMessage,
  type OrchestrationAutoDispatchState,
} from "./orchestration/orchestrationAutoDispatchService";
import {
  prepareAndRecordNextOrchestrationRuns,
} from "./orchestration/orchestrationDispatch";
import { startPreparedOrchestrationRun } from "./orchestration/orchestrationRunner";
import { readOrchestrationBoardWithWorkflowReadiness, readOrchestrationWorkflowReadiness } from "./orchestration/orchestrationWorkflowReadiness";
import {
  createWorkflowSampleArtifact,
  readWorkflowDashboard,
  readWorkflowRunDetail,
  resolveWorkflowApproval,
  reviewWorkflowArtifact,
  revalidateWorkflowArtifact,
  updateWorkflowArtifactSource,
  updateWorkflowConnectorGrant,
} from "./workflow/workflowDashboard";
import { createDiagnosticBundle, type DiagnosticDataSource } from "./diagnostics/diagnostics";
import { importDiagnosticBundleFromFile } from "./diagnostics/diagnosticBundleImport";
import {
  agentMemoryDefaultManagedEmbeddingAutoStartEnabled,
  agentMemoryDefaultManagedEmbeddingAutoStartEnabledForFeature,
  clearAgentMemory,
  configureAgentMemoryDesktopService,
  disableAgentMemoryStarter,
  enableAgentMemoryStarter,
  getAgentMemoryDiagnostics,
  getAgentMemoryStarterStatus,
  releaseAgentMemoryEmbeddingRuntimeForHost,
  repairAgentMemoryStarter,
  runAgentMemoryEmbeddingLifecycleAction,
  startAgentMemoryManagedEmbeddingsAfterSettingsUpdate,
  stopAgentMemoryManagedEmbeddingsAfterSettingsUpdate,
} from "./memory/agentMemoryDesktopService";
import { discoverAmbientMemoryEmbeddingProviders } from "./memory/tencentdb/managedEmbeddingProvider";
import { createChatExportBundle } from "./chat-export/chatExport";
import { createChatPdfExport, createElectronPrintToPdfRenderer } from "./chat-export/chatPdfExport";
import { listWorkspaceOpenTargets, openWorkspaceTarget } from "./desktop-shell/externalEditors";
import { BrowserService, managedChromeRevealBoundsForWorkArea, type ManagedChromeWindowBounds } from "./browser/browserService";
import { createBrowserDesktopStateService } from "./browser/browserDesktopStateService";
import { BrowserCredentialStore } from "./browser/browserCredentialStore";
import { InternalBrowserHost } from "./browser/internalBrowserHost";
import { compileWorkflowArtifact } from "./workflow-compiler/workflowCompilerService";
import { createWorkflowActiveRunRegistry } from "./workflow/workflowActiveRunRegistry";
import {
  buildWorkflowDebugRewriteContext,
  buildWorkflowDebugRewritePromptSection,
  createWorkflowDebugRewriteRevision,
  workflowDebugRewriteUserRequest,
} from "./workflow/workflowDebugRewrite";
import {
  answerWorkflowDiscoveryQuestion,
  resolveWorkflowDiscoveryAccessRequest,
  startWorkflowDiscovery,
  startWorkflowRevisionDiscovery,
} from "./workflow-discovery/workflowDiscoveryService";
import { AmbientWorkflowDiscoveryProvider } from "./workflow-discovery/workflowDiscoveryProvider";
import { describeWorkflowDiscoveryCapability, searchWorkflowDiscoveryCapabilities } from "./workflow-discovery/workflowDiscoveryCapabilitySearch";
import { buildWorkflowDiscoveryPolicyContext } from "./workflow-discovery/workflowDiscoveryPolicy";
import { workspaceInventoryConnector, workspaceInventoryConnectorDescriptor } from "./workflow/workflowConnectors";
import { AmbientWorkflowExplorationProvider, runWorkflowThreadExploration } from "./workflow/workflowExplorationService";
import { workflowToolDescriptorsFromPluginRegistry } from "./workflow/workflowPluginCapabilities";
import { invokeWorkflowNativeTool } from "./workflow/workflowNativeTools";
import { discoverCapabilityBuilderHistory, saveCapabilityBuilderEnvSecret } from "./capability-builder/capabilityBuilderMainContract";
import { runWorkflowArtifact } from "./workflow/workflowRunService";
import { buildWorkflowRecoveryPlan } from "./workflow/workflowRecovery";
import { markStaleWorkflowRunForRecoveryIfNeeded } from "./workflow/workflowStaleRunRecovery";
import { createWorkflowTraceRetentionService } from "./workflow/workflowTraceRetention";
import {
  createWorkflowRuntimeFeatureActionsService,
} from "./workflow/workflowRuntimeFeatureActionsService";
import { SafeStorageWorkflowConnectorTokenVault } from "./workflow/workflowConnectorAuth";
import { googleWorkspaceOAuthProvidersFromEnv } from "./google-workspace/googleOAuthProvider";
import { googleWorkspaceConnectorDescriptors, googleWorkspaceConnectorRegistrations, type GoogleWorkspaceConnectorDescriptorOptions } from "./google-workspace/googleWorkspaceConnectors";
import { GoogleSidecarSupervisor } from "./google-workspace/googleSidecarSupervisor";
import { GoogleWorkspaceCliAdapter } from "./google-workspace/googleWorkspaceCliAdapter";
import { GoogleWorkspaceCliInstaller } from "./google-workspace/googleWorkspaceCliInstaller";
import { GoogleWorkspaceSetupService } from "./google-workspace/googleWorkspaceSetupService";
import { GoogleWorkspaceMethodBroker } from "./google-workspace/googleWorkspaceMethodBroker";
import { restoreWorkflowVersion } from "./workflow/workflowVersionRestore";
import {
  clearSavedAmbientApiKey,
  readAmbientApiKey,
  saveAmbientApiKey,
  testAmbientApiKey,
} from "./security/credentialStore";
import {
  LAMBDA_RLM_SOURCE_COMMIT,
  LAMBDA_RLM_SOURCE_PAPER,
  LAMBDA_RLM_SOURCE_REPOSITORY,
} from "./tool-runtime/lambdaRlm";
import {
  createWindowStateService,
} from "./desktop-shell/windowState";
import {
  appearanceBackgroundColor,
  normalizePlannerSettings,
  normalizeLocalDeepResearchAppSettings,
  normalizeSearchRoutingSettings,
  normalizeThinkingDisplaySettings,
  readPlannerSettings,
  readThemePreference,
  readMediaPlaybackSettings,
  readLocalDeepResearchSettings,
  readSearchRoutingSettings,
  readSttSettings,
  readThinkingDisplaySettings,
  readVoiceSettings,
  resolveAppearance,
  writeMediaPlaybackSettings,
  writeLocalDeepResearchSettings,
  writePlannerSettings,
  writeSearchRoutingSettings,
  writeSttSettings,
  writeThinkingDisplaySettings,
  writeThemePreference,
  writeVoiceSettings,
  DEFAULT_VOICE_SETTINGS,
} from "./desktop-shell/appAppearanceDefaultPreferences";
import { ambientLegacyUserDataPaths, hasRestorableWorkspaceState, migrateAmbientUserData } from "./desktop-shell/userDataMigration";
import { renderThreadMiniWindowHtml } from "./thread/threadMiniWindowHtml";
import {
  discoverAmbientCliPackages,
  discoverAmbientCliEmbeddingProviders,
  discoverAmbientCliSttProviders,
  discoverAmbientCliVoiceProviders,
  runAmbientCliPackageCommand,
  saveAmbientCliPackageEnvSecret,
  searchAmbientCliCapabilities,
  type AmbientCliPackageSummary,
} from "./ambient-cli/ambientCliPackages";
import { hydrateWebResearchSettings } from "./web-research/webResearchSettingsHydration";
import { regenerateMessageVoiceState } from "./voice/voiceRuntime";
import {
  clearManagedVoiceArtifacts,
  clearManagedVoiceArtifactsSync,
  inspectVoiceArtifactRetention,
  pruneManagedVoiceArtifactsToBudget,
  pruneVoiceArtifactOrphans,
} from "./voice/voiceArtifacts";
import { collectVoiceOnboardingHostFacts } from "./voice/voiceOnboardingHostFacts";
import { mergeVoiceProvidersWithCachedVoices, readVoiceDiscoveryCache, refreshVoiceProviderVoices } from "./voice/voiceDiscoveryCache";
import { mergeSttProvidersWithValidation, readQwen3AsrValidationMetadata, setupQwen3AsrProvider } from "./stt/sttProviderInstaller";
import { analyzeMiniCpmVisionInput, setupMiniCpmVisionProvider } from "./mini-cpm/miniCpmVisionProvider";
import { detectLocalDeepResearchManagedAssets } from "./local-deep-research/localDeepResearchManagedAssets";
import {
  installLocalDeepResearchManagedAssets,
  localDeepResearchInstallJobWarnings,
  reconcileLocalDeepResearchInstallJob,
  type LocalDeepResearchInstallServiceResult,
} from "./local-deep-research/localDeepResearchInstallService";
import { listLocalDeepResearchRunHistory } from "./local-deep-research/localDeepResearchRunService";
import { runLocalDeepResearchRealAssetSmoke } from "./local-deep-research/localDeepResearchSmoke";
import { detectLocalLlamaResidentProcesses } from "./local-llama/localLlamaResidencyPolicy";
import { localDeepResearchRequestedLaunch, sampleLocalModelHostMemorySnapshot } from "./local-runtime/localModelResourceRegistry";
import { buildLocalModelRuntimeStatusSnapshot } from "./local-runtime/localModelRuntimeStatus";
import { type LocalDeepResearchModelProfileId } from "./local-deep-research/localDeepResearchModelProfiles";
import {
  buildLocalDeepResearchSetupContract,
  type LocalDeepResearchSetupContract,
  type LocalDeepResearchSetupInput as LocalDeepResearchSetupContractInput,
} from "./local-deep-research/localDeepResearchSetup";
import { validateLocalDeepResearchSetup } from "./local-deep-research/localDeepResearchValidation";
import { webResearchSettingsWithDynamicProviderCatalogs } from "./web-research/searchSettingsTools";
import { saveSttTestAudio } from "./stt/sttTestAudio";
import { SttRuntime } from "./stt/sttRuntime";
import { SttDiagnosticRecorder, sttSetupDiagnosticSummary, sttTranscriptionDiagnosticSummary } from "./stt/sttDiagnostics";
import { validatePlannerDurableHtmlFileInBrowser } from "./planner/plannerDurableBrowserValidation";
import { PlannerDurableHtmlValidationError, writePlannerDurableHtmlArtifact } from "./planner/plannerDurableHtml";
import { plannerDurableFallbackWarnings } from "./planner/plannerDurableRepair";
import { registerMainIpc } from "./ipc/registerMainIpc";

installAppLogCapture();

const { autoUpdater } = electronUpdater;

const projectIdSchema = z.string().min(1).max(128);
const threadActionSchema = z.object({
  threadId: z.string().min(1),
  projectId: projectIdSchema.optional(),
});
const workspaceSearchSchema = z.union([
  z.string().min(1).max(500),
  z.object({
    query: z.string().min(1).max(500),
    scope: z.enum(["chat", "project", "all-projects"]).optional(),
    threadId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
]);
const terminalIdSchema = z.string().min(1);
const terminalSessionTokenSchema = z.string().min(1).max(200);
function formatPiResourceCountsForPermission(counts: Record<"extension" | "skill" | "prompt" | "theme", number>): string {
  return `extensions ${counts.extension}, skills ${counts.skill}, prompts ${counts.prompt}, themes ${counts.theme}`;
}

function formatPiPrivilegedInstallApprovalDetail(scan: PiPrivilegedSecurityScan): string {
  const findings = scan.findings.length
    ? scan.findings.map((finding) => `- [${finding.severity}] ${finding.category}: ${finding.message}`).join("\n")
    : "- No high-risk patterns found by the heuristic scan.";
  return [
    `Workspace: ${store.getWorkspace().path}`,
    `Package: ${scan.packageName}`,
    scan.version ? `Version: ${scan.version}` : undefined,
    `Source: ${scan.source}`,
    `Scan origin: ${scan.scanOrigin}`,
    `Fingerprint: ${scan.fingerprint}`,
    `Recommendation: ${scan.recommendation}`,
    `Findings: ${scan.findings.length}`,
    findings,
    "Effect: copy package into Ambient-managed privileged Pi install state as disabled.",
    "Alpha does not activate hooks, MCP servers, commands, background processes, or Pi settings changes.",
    scan.caveat,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function formatPiExtensionSandboxInstallApprovalDetail(preview: PiExtensionSandboxInstallPreview): string {
  const tools = preview.candidate?.tools.map((tool) => tool.name).join(", ") || "none";
  return [
    `Workspace: ${store.getWorkspace().path}`,
    `Source: ${preview.source}`,
    preview.resolvedSource ? `Repository: ${preview.resolvedSource}` : undefined,
    preview.packagePath ? `Package path: ${preview.packagePath}` : undefined,
    preview.sha ? `SHA: ${preview.sha}` : undefined,
    preview.packageName ? `Package: ${preview.packageName}` : undefined,
    preview.version ? `Version: ${preview.version}` : undefined,
    preview.entrypoint ? `Entrypoint: ${preview.entrypoint}` : undefined,
    `Allowed network hosts: ${preview.allowedNetworkHosts.join(", ") || "none"}`,
    `Tools: ${tools}`,
    "Host policy: filesystem, process, env, eval, Function, unsupported imports, and undeclared network hosts are denied.",
    "Effect: copy the package into Ambient-managed Pi extension sandbox state.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}
let mainWindow: BrowserWindow | undefined;
let themePreference: ThemePreference = "system";
let mediaPlaybackSettings = { generatedMediaAutoplay: false };
let thinkingDisplaySettings: ThinkingDisplaySettings = { mode: "transient", showRunStatusCard: false };
let plannerSettings: PlannerSettings = { autoFinalize: true };
let localDeepResearchSettings: LocalDeepResearchSettings = normalizeLocalDeepResearchAppSettings(undefined);
let searchRoutingSettings: SearchRoutingSettings = {};

function emitMainWindowDesktopEvent(event: DesktopEvent): void {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return;
  const webContents = window.webContents;
  if (webContents.isDestroyed() || webContents.isCrashed()) return;
  try {
    webContents.send("desktop:event", event);
  } catch (error) {
    console.warn(`Dropped desktop event after renderer became unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let voiceSettings: VoiceSettings = {
  enabled: false,
  mode: "assistant-final" as const,
  autoplay: false,
  maxChars: 1500,
  longReply: "summarize" as const,
  format: "mp3" as const,
  artifactCacheMaxMb: 30,
};
let sttSettings: SttSettings = {
  enabled: false,
  spokenLanguage: "English",
  microphone: {},
  mode: "push-to-talk" as const,
  autoSendAfterTranscription: true,
  silenceFinalizeSeconds: 0.8,
  noSpeechGate: {
    enabled: true,
    rmsThresholdDbfs: -55,
  },
  bargeIn: {
    stopTtsOnSpeech: true,
    queueWhileAgentRuns: true,
  },
};
const sttRuntimes = new Map<string, SttRuntime>();
const sttDiagnostics = new SttDiagnosticRecorder();
let voiceSettingsAudit: VoiceSettingsAuditEntry[] = [];
const workspaceMediaServer = new WorkspaceMediaServer((workspacePath) => Boolean(projectRuntimeHostForKnownWorkspacePath(workspacePath)));
let officePreviewService: OfficePreviewService | undefined;

let projectRegistry: ProjectRegistry;
const permissions = new PermissionPromptService(() => mainWindow);
const privilegedCredentials = new PrivilegedCredentialPromptService(() => mainWindow);
const secureInputs = new SecureInputPromptService(() => mainWindow);
const browserLoginBrokerEnabled = process.env.AMBIENT_BROWSER_LOGIN_BROKER !== "0";
const ambientLaunchArgs = parseAmbientLaunchArgs(process.argv.slice(1));
const localTextSubagentStartup = localTextSubagentStartupFeatureFromEnv(process.env);
for (const warning of localTextSubagentStartup.warnings) {
  console.warn(`[startup] Local text sub-agent runtime disabled: ${warning}`);
}
let pluginHost: AmbientPluginHost;
let pluginAuthService: PluginAuthService;
let googleSidecarSupervisor: GoogleSidecarSupervisor | undefined;
let googleWorkspaceCliAdapter: GoogleWorkspaceCliAdapter;
let googleWorkspaceCliInstaller: GoogleWorkspaceCliInstaller;
let googleWorkspaceSetupService: GoogleWorkspaceSetupService;
let googleWorkspaceMethodBroker: GoogleWorkspaceMethodBroker;
let googleWorkspaceConnectorMode: "disabled" | "gws" | "ambient_oauth" = "disabled";
let googleWorkspaceConnectorsEnabled = false;
let activeThreadId = "";
const desktopUpdateService = new DesktopUpdateService(
  autoUpdater,
  desktopUpdateConfigFromEnv({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    releaseChannel: process.env.AMBIENT_RELEASE_CHANNEL,
  }),
  (update) => emitMainWindowDesktopEvent({ type: "update-status", update }),
);
const appMenuUpdateService = createAppMenuUpdateService<BrowserWindow>({
  checkForUpdates: () => desktopUpdateService.checkForUpdates("manual"),
  getWindow: () => mainWindow,
  showMessageBox: async (window, options) => {
    if (window) {
      await dialog.showMessageBox(window, options);
      return;
    }
    await dialog.showMessageBox(options);
  },
});
const windowStateService = createWindowStateService<BrowserWindow>({
  appVersion: () => app.getVersion(),
  userDataPath: () => app.getPath("userData"),
  displayWorkAreas: () => screen.getAllDisplays().map((display) => display.workArea),
  primaryDisplayWorkArea: () => screen.getPrimaryDisplay().workArea,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timeout) => clearTimeout(timeout),
  warn: (message) => console.warn(message),
});
const projectRuntimeHostFactory = createProjectRuntimeHostFactory({
  createProjectStore: () => new ProjectStore(),
  createInternalBrowserHost: (hostStore: ProjectStore) => new InternalBrowserHost(() => hostStore.getWorkspace(), () => mainWindow),
  createBrowserService: (hostStore: ProjectStore, hostInternalBrowser: InternalBrowserHost, onStateChanged) =>
    new BrowserService(() => hostStore.getWorkspace(), hostInternalBrowser, {
      browserLoginBrokerAvailable: browserLoginBrokerEnabled,
      managedChromeRevealBounds: managedChromeRevealBoundsForAmbientWindow,
      onStateChanged,
    }),
  onBrowserServiceStateChanged: (hostBrowser: BrowserService) => {
    if (activeHost?.browserService === hostBrowser) emitBrowserState();
  },
  createBrowserCredentialStore: (hostStore: ProjectStore) => new BrowserCredentialStore(() => hostStore.getWorkspace(), safeStorage),
  createTerminalService: (workspacePath: string) => new TerminalService(() => mainWindow, workspacePath),
  initialActiveThreadIdForStore: (hostStore: ProjectStore) => initialActiveThreadIdForStore(hostStore),
  createRuntime: ({ store: hostStore, browserService: hostBrowser, browserCredentialStore: hostBrowserCredentials, activeThreadId }) =>
    new AgentRuntime(
      hostStore,
      hostBrowser,
      hostBrowserCredentials,
      () => mainWindow,
      {
        request: (request) => permissions.request(request),
        denyThread: (threadId) => permissions.denyThread(threadId),
        listPending: () => permissions.listPending(),
        respond: (id, response) => permissions.respond(id, response),
      },
      createAgentRuntimeFeatures({
        store: hostStore,
        browserService: hostBrowser,
        activeThreadId,
      }),
    ),
  createAutoDispatchState: (enabled: boolean) => createAutoDispatchState(enabled),
  createHost: ({
    workspace,
    store: hostStore,
    internalBrowserHost: hostInternalBrowser,
    browserService: hostBrowser,
    browserCredentialStore: hostBrowserCredentials,
    runtime: hostRuntime,
    terminals: hostTerminals,
    activeThreadId: initialHostThreadId,
    autoDispatch,
  }) => ({
    workspacePath: workspace.path,
    store: hostStore,
    internalBrowserHost: hostInternalBrowser,
    browserService: hostBrowser,
    browserCredentialStore: hostBrowserCredentials,
    runtime: hostRuntime,
    terminals: hostTerminals,
    activeThreadId: initialHostThreadId,
    autoDispatch,
  }),
});
const projectRuntimeHostActivationService = createProjectRuntimeHostActivationService<ProjectRuntimeHost>({
  normalizeWorkspacePath,
  createProjectRuntimeHost: (workspacePath, options) => projectRuntimeHostFactory.createProjectRuntimeHost(workspacePath, options),
  runStartupReconciliation: (reason, host) => runSubagentRuntimeStartupReconciliation(reason, host),
  registerProjectWorkspacePath: (workspacePath) => projectRegistry.register(workspacePath),
  onActiveHostChanged: (host) => syncActiveProjectRuntimeHost(host),
});
const {
  activateProjectRuntimeHost,
  ensureProjectRuntimeHostForWorkspacePath,
  projectRuntimeHostForWorkspacePath,
  projectRuntimeHostList,
} = projectRuntimeHostActivationService;
const projectRuntimeHostResolver = createProjectRuntimeHostResolver<ProjectRuntimeHost, ProjectStore>({
  normalizeWorkspacePath,
  projectRuntimeHostList: () => projectRuntimeHostList(),
  activeProjectRuntimeHost: () => projectRuntimeHostActivationService.activeProjectRuntimeHost(),
  requireActiveProjectRuntimeHost: () => requireActiveProjectRuntimeHost(),
  ensureProjectRuntimeHostForWorkspacePath: (workspacePath) => ensureProjectRuntimeHostForWorkspacePath(workspacePath),
  listRegisteredProjectPaths: () => projectRegistry.listRegisteredPaths(),
  existsSync,
  createProjectStore: () => {
    const targetStore = new ProjectStore();
    return {
      store: targetStore,
      openWorkspace: (workspacePath, options) => targetStore.openWorkspace(workspacePath, options),
      close: () => targetStore.close(),
    };
  },
});
const {
  projectRuntimeHostForTerminal,
  projectRuntimeHostForThread,
  requireProjectRuntimeHostForThread,
  requireProjectRuntimeHostForStoreRecord,
  requireProjectRuntimeHostForWorkflowThread,
  requireProjectRuntimeHostForWorkflowRecording,
  requireProjectRuntimeHostForWorkflowLabRun,
  requireProjectRuntimeHostForWorkflowDiscoveryQuestion,
  requireProjectRuntimeHostForWorkflowVersion,
  projectRuntimeHostForKnownWorkspacePath,
  requireProjectRuntimeHostForPermissionGrantInput,
  requireProjectRuntimeHostForPermissionGrant,
  requireProjectRuntimeHostForAutomationThread,
  requireProjectRuntimeHostForAutomationSchedule,
  requireProjectRuntimeHostForAutomationScheduleTarget,
  requireProjectRuntimeHostForWorkflowRevision,
  requireProjectRuntimeHostForWorkflowArtifact,
  requireProjectRuntimeHostForPlannerPlanArtifact,
  requireProjectRuntimeHostForMessageVoiceState,
  projectRuntimeHostForWorkflowRun,
  requireProjectRuntimeHostForWorkflowRun,
  requireProjectRuntimeHostForCallableWorkflowTask,
  requireProjectRuntimeHostForSubagentRun,
  requireProjectRuntimeHostForSubagentWaitBarrier,
  requireProjectRuntimeHostForOrchestrationTask,
  requireProjectRuntimeHostForOrchestrationRun,
  requireProjectRuntimeHostForOrchestrationWorkspace,
} = projectRuntimeHostResolver;
const projectRuntimeLifecycleService = createProjectRuntimeLifecycleService<ProjectRuntimeHost>({
  defaultRuntimeResetReason: RUNTIME_RESET_INTERRUPTED_RUN_MESSAGE,
  normalizeWorkspacePath,
  projectRuntimeHostList: () => projectRuntimeHostList(),
  activeProjectRuntimeHost: () => projectRuntimeHostActivationService.activeProjectRuntimeHost(),
  projectRuntimeHostForWorkspacePath: (workspacePath) => projectRuntimeHostForWorkspacePath(workspacePath),
  removeProjectRuntimeHost: (workspacePath) => projectRuntimeHostActivationService.removeProjectRuntimeHost(workspacePath),
  clearProjectRuntimeHosts: () => projectRuntimeHostActivationService.clearProjectRuntimeHosts(),
  clearSttRuntimes: () => {
    sttRuntimes.clear();
  },
  clearActiveProjectRuntimeHost: () => projectRuntimeHostActivationService.clearActiveProjectRuntimeHost(),
  stopAutoDispatch: (reason, host) => stopAutoDispatch(reason, host),
  disposeSttRuntimeForWorkspace,
  releaseAgentMemoryEmbeddingRuntimeForHost: (host, reason) => releaseAgentMemoryEmbeddingRuntimeForHost(host, reason),
  shutdownPluginMcpServers: () => pluginHost?.shutdownPluginMcpServers(),
  shutdownPluginMcpServersForWorkspace: (workspacePath) => pluginHost.shutdownPluginMcpServersForWorkspace(workspacePath),
  warn: (message) => console.warn(message),
});
const {
  resetRuntimeAndPluginServers,
  resetProjectRuntimeAndPluginServers,
  disposeProjectRuntimeHost,
  disposeAllProjectRuntimeHosts,
} = projectRuntimeLifecycleService;
const desktopStateSnapshotService = createDesktopStateSnapshotService<ProjectStore>({
  activeThreadId: () => activeThreadId,
  setActiveThreadId: (threadId) => {
    setActiveThreadId(threadId);
  },
  store: () => store,
  appInfo: () => ({
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    build: {
      channel: process.env.AMBIENT_RELEASE_CHANNEL || (app.isPackaged ? "release" : "development"),
      ...(process.env.AMBIENT_BUILD_COMMIT ? { commit: process.env.AMBIENT_BUILD_COMMIT } : {}),
    },
    piVersions: {
      piAi: packageVersion("@mariozechner/pi-ai"),
      piCodingAgent: packageVersion("@mariozechner/pi-coding-agent"),
    },
    update: desktopUpdateService.getState(),
    thirdPartyCredits: thirdPartyCredits(),
  }),
  appearance: () => currentAppearance(),
  workspaceStateForThread: (thread, targetStore) => workspaceStateForThread(thread, targetStore),
  currentFeatureFlagSnapshot: (targetStore) => currentFeatureFlagSnapshot(targetStore),
  isSubagentUiEnabled: (featureFlagSnapshot) => isAmbientSubagentsEnabled(featureFlagSnapshot),
  providerCatalog: () => providerCatalogSettingsState(),
  activeProjectBoardForState: (targetStore, threadId) => activeProjectBoardForState(targetStore, threadId),
  activeProjectSummary: (workspace, threads, board) => activeProjectSummary(workspace, threads, board),
  listProjects: (workspacePath, activeProject) => projectRegistry.listProjects(workspacePath, activeProject),
  listGlobalWorkflowAgentFolders: () => listGlobalWorkflowAgentFolders(),
  listGlobalWorkflowRecordingLibrary: (input) => listGlobalWorkflowRecordingLibrary(input),
  settingsSlots: () => ({
    voiceSettingsAudit,
    thinkingDisplay: thinkingDisplaySettings,
    media: mediaPlaybackSettings,
    planner: plannerSettings,
    search: searchRoutingSettings,
    localDeepResearch: localDeepResearchSettings,
    voice: voiceSettings,
    stt: sttSettings,
  }),
  currentModelRuntimeCatalog: (generatedAt, targetStore) => currentModelRuntimeCatalog(generatedAt, targetStore),
  providerStatus: (model) => getAmbientProviderStatus(model),
  queueState: (threadId) => emptyQueueState(threadId),
  sttQueueState: (workspacePath) => currentSttQueueState(workspacePath),
  sttDiagnostics: (workspacePath) => sttDiagnostics.list(workspacePath),
});
const desktopStateEventService = createDesktopStateEventService<ProjectStore, ProjectRuntimeHost>({
  activeThreadId: () => activeThreadId,
  activeWorkspacePath: () => activeWorkspacePath(),
  defaultStore: () => store,
  emitDesktopEvent: emitMainWindowDesktopEvent,
  isActiveProjectRuntimeHost: (host) => isActiveProjectRuntimeHost(host),
  readState: (threadId, options) => readState(threadId, options),
});
const {
  emitDesktopState,
  emitOrchestrationUpdated,
  emitPermissionAuditCreated,
  emitPermissionGrantCreated,
  emitPermissionGrantRevoked,
  emitPlannerPlanArtifactUpdated,
  emitPluginCatalogUpdated,
  emitProjectScopedEvent,
  emitProjectStateIfActive,
  emitThreadUpdated,
  emitWorkflowEvent,
  emitWorkflowRecordingLibraryStateChanged,
  emitWorkflowUpdated,
  permissionGrantWorkspacePath,
  readStateForProjectHostAction,
} = desktopStateEventService;
const browserDesktopStateService = createBrowserDesktopStateService<
  ThreadSummary,
  ReturnType<ProjectStore["addPermissionAudit"]>,
  Awaited<ReturnType<BrowserService["getState"]>>,
  ProjectStore,
  ProjectRuntimeHost
>({
  activeHost: () => requireActiveProjectRuntimeHost(),
  activeThreadIdForHost,
  emitDesktopEvent: emitMainWindowDesktopEvent,
  emitPermissionAuditCreated,
});
const {
  emitBrowserState,
  emitBrowserStateForHost,
  recordBrowserControlAudit,
  recordBrowserProfileAudit,
  withBrowserState,
} = browserDesktopStateService;
const workflowTraceRetentionService = createWorkflowTraceRetentionService<ProjectRuntimeHost>({
  projectRuntimeHostList: () => projectRuntimeHostList(),
  emitWorkflowUpdated,
  setTimeout,
  clearTimeout,
  log: (message) => console.log(message),
  warn: (message) => console.warn(message),
});
const {
  stopWorkflowTraceRetentionSweep,
  scheduleWorkflowTraceRetentionSweep,
  runWorkflowTraceRetentionSweep,
} = workflowTraceRetentionService;
const projectRuntimeWorkspaceSwitchService = createProjectRuntimeWorkspaceSwitchService<ProjectRuntimeHost, DesktopState>({
  activateProjectRuntimeHost: (workspacePath) => activateProjectRuntimeHost(workspacePath),
  clearImportedWorkspaceContextCacheSync: (reason) => clearImportedWorkspaceContextCacheSync(reason),
  runWorkflowTraceRetentionSweep: (reason, host) => runWorkflowTraceRetentionSweep(reason, host),
  scheduleWorkflowTraceRetentionSweep,
  scheduleAutoDispatch: (delayMs, host) => scheduleAutoDispatch(delayMs, host),
  registerProjectWorkspacePath: (workspacePath) => projectRegistry.register(workspacePath),
  initialActiveThreadId: () => initialActiveThreadId(),
  setActiveThreadId: (threadId) => setActiveThreadId(threadId),
  readState: (threadId) => readState(threadId),
});
const { switchWorkspace } = projectRuntimeWorkspaceSwitchService;
const mainWindowRendererDiagnosticsService = createMainWindowRendererDiagnosticsService<ProjectRuntimeHost, BrowserWindow>({
  activeProjectRuntimeHost: () => projectRuntimeHostActivationService.activeProjectRuntimeHost(),
  activeThreadIdForHost: (host) => activeThreadIdForHost(host),
  userDataPath: () => app.getPath("userData"),
  rendererUrl: () => process.env.ELECTRON_RENDERER_URL,
  rendererIndexPath: () => resolveBuiltOutputPath("renderer", "index.html"),
  redactSensitiveText,
  now: () => new Date(),
  nowMs: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  log: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
});
const {
  recordRendererDiagnosticBreadcrumb,
  installMainWindowDiagnostics,
  loadMainWindowRenderer,
} = mainWindowRendererDiagnosticsService;
const externalNavigationService = createExternalNavigationService<ProjectRuntimeHost>({
  platform: process.platform,
  openExternal: (url) => shell.openExternal(url),
  openMacApplication: (args) => runMacOpen(args),
  recordRendererDiagnosticBreadcrumb,
  requireActiveProjectRuntimeHost: () => requireActiveProjectRuntimeHost(),
  activeThreadIdForHost: (host) => activeThreadIdForHost(host),
  navigateLocalUrlInAmbientBrowser: (host, url) => withBrowserState(host, host.browserService.navigate({ url, profileMode: "isolated" })),
  revealActiveBrowser: (host) => host.browserService.revealActiveBrowser(),
  recordBrowserControlAudit,
  emitBrowserStateForHost,
  log: (message) => console.log(message),
  warn: (message) => console.warn(message),
});
const {
  installExternalNavigationGuards,
  isGoogleWorkspaceSetupUrl,
  isLoopbackWebUrl,
  openAllowedExternalUrl,
  openGoogleWorkspaceUrl,
  openRendererLocalUrlInAmbientBrowser,
  parseExternalOpenUrl,
} = externalNavigationService;
const settingsRuntimeService = createSettingsRuntimeService<ProjectRuntimeHost>({
  appearancePreferencesPath: () => appearancePreferencesPath(),
  setThemePreferenceState: (preference) => applyThemePreference(preference),
  publishAppearanceUpdated,
  requireActiveProjectRuntimeHost: () => requireActiveProjectRuntimeHost(),
  currentFeatureFlagSnapshot: (targetStore) => currentFeatureFlagSnapshot(targetStore),
  emitDesktopState,
  emitProjectStateIfActive: (host) => emitProjectStateIfActive(host),
  memoryLifecycle: {
    defaultManagedEmbeddingAutoStartEnabled: (settings, targetStore) => agentMemoryDefaultManagedEmbeddingAutoStartEnabled(settings, targetStore),
    defaultManagedEmbeddingAutoStartEnabledForFeature: (settings, featureEnabled) =>
      agentMemoryDefaultManagedEmbeddingAutoStartEnabledForFeature(settings, featureEnabled),
    shouldStartManagedEmbeddingsAfterSettingsUpdate: (previous, next) =>
      shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate(previous, next),
    startManagedEmbeddingsAfterSettingsUpdate: (host, targetStore) =>
      startAgentMemoryManagedEmbeddingsAfterSettingsUpdate(host, targetStore),
    stopManagedEmbeddingsAfterSettingsUpdate: (host, targetStore) =>
      stopAgentMemoryManagedEmbeddingsAfterSettingsUpdate(host, targetStore),
  },
  mediaPlaybackSettings: {
    get: () => mediaPlaybackSettings,
    set: (value) => {
      mediaPlaybackSettings = value;
    },
  },
  thinkingDisplaySettings: {
    get: () => thinkingDisplaySettings,
    set: (value) => {
      thinkingDisplaySettings = value;
    },
  },
  plannerSettings: {
    get: () => plannerSettings,
    set: (value) => {
      plannerSettings = value;
    },
  },
  searchRoutingSettings: {
    get: () => searchRoutingSettings,
    set: (value) => {
      searchRoutingSettings = value;
    },
  },
  localDeepResearchSettings: {
    get: () => localDeepResearchSettings,
    set: (value) => {
      localDeepResearchSettings = value;
    },
  },
  normalizeThinkingDisplaySettings,
  normalizePlannerSettings,
  normalizeSearchRoutingSettings,
  normalizeLocalDeepResearchAppSettings,
  writeThemePreference,
  writeMediaPlaybackSettings,
  writeThinkingDisplaySettings,
  writePlannerSettings,
  writeSearchRoutingSettings,
  writeLocalDeepResearchSettings,
  saveModelProviderCredentialForSettingsImpl: saveModelProviderCredentialForSettings,
  installModelProviderEndpointForSettingsImpl: installModelProviderEndpointForSettings,
  readSecretReferenceImpl: readSecretReference,
  discoverAmbientCliCatalogForSearchRouting: (workspacePath) => discoverAmbientCliPackages(workspacePath, { includeHealth: true }),
  discoverMcpToolsForSearchRouting: async (workspacePath) => {
    const { toolHive, catalog } = createMcpInstallCatalog();
    const bridge = new McpToolBridge({
      catalog,
      toolHive,
      workspacePath,
    });
    return bridge.searchTools({ limit: 50, refresh: false });
  },
  hydrateWebResearchSettingsImpl: (input) => hydrateWebResearchSettings(input as Parameters<typeof hydrateWebResearchSettings>[0]),
});
const {
  hydrateSearchRoutingSettingsForActiveWorkspace,
  installModelProviderEndpoint,
  runLocalModelRuntimeLifecycleAction,
  saveModelProviderCredential,
  setThemePreference,
  updateFeatureFlagSettings,
  updateLocalDeepResearchSettings,
  updateMediaPlaybackSettings,
  updateMemorySettings,
  updateModelRuntimeSettings,
  updatePlannerSettings,
  updateSearchRoutingSettings,
  updateThinkingDisplaySettings,
} = settingsRuntimeService;
const mainWindowBootstrapService = createMainWindowBootstrapService<ProjectRuntimeHost, BrowserWindow>({
  isDarwin: process.platform === "darwin",
  startupWorkspacePath: () => startupWorkspacePath(),
  activateProjectRuntimeHost: (workspacePath) => activateProjectRuntimeHost(workspacePath),
  clearManagedVoiceArtifactCache: (reason, workspacePath, targetStore) =>
    clearManagedVoiceArtifactCache(reason, workspacePath, targetStore),
  clearImportedWorkspaceContextCache: (reason) => clearImportedWorkspaceContextCache(reason),
  runWorkflowTraceRetentionSweep: (reason, host) => runWorkflowTraceRetentionSweep(reason, host),
  scheduleWorkflowTraceRetentionSweep,
  scheduleAutoDispatch: (delayMs, host) => scheduleAutoDispatch(delayMs, host),
  registerProjectWorkspacePath: (workspacePath) => projectRegistry.register(workspacePath),
  ensureWelcomeOnboardingProject: () => ensureWelcomeOnboardingProject({
    userDataPath: app.getPath("userData"),
    projectRegistry,
    createProjectStore: () => new ProjectStore(),
    assetsSourcePath: resolveWelcomeOnboardingAssetsPath([
      process.resourcesPath ? join(process.resourcesPath, "welcome-onboarding") : undefined,
      join(app.getAppPath(), "resources", "welcome-onboarding"),
      join(process.cwd(), "resources", "welcome-onboarding"),
    ]),
  }),
  resolveAppIconPath,
  readWindowState: () => windowStateService.readWindowState(),
  setDockIcon,
  currentBackgroundColor: () => appearanceBackgroundColor(currentAppearance().resolvedTheme),
  preloadPath: () => resolveBuiltOutputPath("preload", "index.cjs"),
  createBrowserWindow: (options) => new BrowserWindow(options),
  setMainWindow: (window) => {
    mainWindow = window;
  },
  mainWindow: () => mainWindow,
  ensureWindowVisible: (window) => windowStateService.ensureWindowVisible(window),
  trackWindowState: (window) => windowStateService.trackWindowState(window),
  installExternalNavigationGuards: (window) => installExternalNavigationGuards(window, {
    source: "main-window",
    allowNavigation: isTrustedRendererUrl,
  }),
  installMainWindowDiagnostics,
  loadMainWindowRenderer,
});
const {
  createWindow,
  showOrCreateMainWindow,
} = mainWindowBootstrapService;
const threadMiniWindowService = createThreadMiniWindowService<BrowserWindow>({
  platform: process.platform,
  currentTheme: () => currentAppearance().resolvedTheme,
  thinkingDisplayMode: () => thinkingDisplaySettings.mode,
  renderThreadMiniWindowHtml,
  resolveAppIconPath,
  currentBackgroundColor: () => appearanceBackgroundColor(currentAppearance().resolvedTheme),
  createBrowserWindow: (options) => new BrowserWindow(options),
  installExternalNavigationGuards: (window) => installExternalNavigationGuards(window, {
    source: "thread-mini-window",
    allowNavigation: isThreadMiniWindowRendererUrl,
  }),
});
const {
  openThreadMiniWindow,
} = threadMiniWindowService;
const desktopAppLifecycleService = createDesktopAppLifecycleService({
  app,
  isDarwin: process.platform === "darwin",
  startDesktopUpdateService: () => desktopUpdateService.start(),
  disposeDesktopUpdateService: () => desktopUpdateService.dispose(),
  installAppMenu: () => installAppMenu(() => mainWindow, {
    onCheckForUpdates: () => {
      void appMenuUpdateService.checkForUpdatesFromAppMenu();
    },
  }),
  showOrCreateMainWindow: () => showOrCreateMainWindow(),
  reconcileMcpContainerRuntimeOnStartup,
  reconcileLocalDeepResearchInstallJob: () => reconcileLocalDeepResearchInstallJob(undefined),
  clearManagedVoiceArtifactCaches: (reason) => clearManagedVoiceArtifactCachesForRuntimeHostsSync(reason),
  clearImportedWorkspaceContextCache: (reason) => clearImportedWorkspaceContextCacheSync(reason),
  closeLocalPreviewServers: () => rendererLocalPreviewServers.closeAll(),
  stopWorkflowTraceRetentionSweep,
  disposeAllProjectRuntimeHosts,
  shutdownPluginMcpServers: () => pluginHost?.shutdownPluginMcpServers(),
  disposeGoogleSidecarSupervisor: () => googleSidecarSupervisor?.dispose(),
  denyAllPermissions: () => permissions.denyAll(),
  quitApp: () => app.quit(),
  warn: (message) => console.warn(message),
});
const {
  startPostWindowStartupLifecycle,
  installShutdownHandlers,
} = desktopAppLifecycleService;
const workflowRecordingGlobalLibraryDesktopService = createWorkflowRecordingGlobalLibraryDesktopService<ProjectRuntimeHost, ProjectStore>({
  normalizeWorkspacePath,
  projectRuntimeHostList: () => projectRuntimeHostList(),
  activeProjectRuntimeHost: () => projectRuntimeHostActivationService.activeProjectRuntimeHost(),
  activeStore: () => store,
  listRegisteredProjectPaths: () => projectRegistry.listRegisteredPaths(),
  existsSync,
  createProjectStore: () => {
    const targetStore = new ProjectStore();
    return {
      store: targetStore,
      openWorkspace: (workspacePath, options) => targetStore.openWorkspace(workspacePath, options),
      close: () => targetStore.close(),
    };
  },
  requireProjectRuntimeHostForWorkflowRecording,
  emitWorkflowRecordingLibraryStateChanged,
  describeAmbientWorkflowPlaybook,
  injectAmbientWorkflowPlaybook,
  updateAmbientWorkflowPlaybook,
  archiveAmbientWorkflowPlaybook,
  unarchiveAmbientWorkflowPlaybook,
  restoreAmbientWorkflowPlaybookVersion,
  warn: (message) => console.warn(message),
});
const {
  listGlobalWorkflowRecordingLibrary,
  listGlobalWorkflowAgentFolders,
  searchGlobalAmbientWorkflowPlaybooks,
  describeGlobalAmbientWorkflowPlaybook,
  injectGlobalAmbientWorkflowPlaybook,
  updateGlobalAmbientWorkflowPlaybook,
  archiveGlobalAmbientWorkflowPlaybook,
  unarchiveGlobalAmbientWorkflowPlaybook,
  restoreGlobalAmbientWorkflowPlaybookVersion,
} = workflowRecordingGlobalLibraryDesktopService;
const activeWorkflowRunRegistry = createWorkflowActiveRunRegistry<ProjectRuntimeHost>({
  normalizeWorkspacePath,
  projectRuntimeHostForKnownWorkspacePath,
  projectRuntimeHostForWorkspacePath,
});
const workflowRuntimeFeatureActionsService = createWorkflowRuntimeFeatureActionsService<ProjectStore, BrowserService>({
  defaultContext: () => activeRuntimeFeatureHostContext(),
  activeWorkflowRunController: activeWorkflowRunRegistry.activeWorkflowRunController,
  ambientCliCapabilityGrantsForWorkflowRequest,
  buildWorkflowRecoveryPlan,
  compileWorkflowArtifact,
  connectorAccountAuthorizer: () => firstPartyWorkflowConnectorAccountAuthorizer(),
  connectorDescriptors: () => firstPartyWorkflowConnectorDescriptors(),
  connectorRegistrations: () => firstPartyWorkflowConnectorRegistrations(),
  createExplorationProvider: ({ apiKey, baseUrl, retryPolicy }) => new AmbientWorkflowExplorationProvider({
    apiKey,
    baseUrl,
    retryPolicy,
  }),
  emitDesktopEvent: emitMainWindowDesktopEvent,
  emitWorkflowEvent,
  emitWorkflowUpdated,
  ensureWorkflowPluginTrusted,
  forgetActiveWorkflowRunsForController: activeWorkflowRunRegistry.forgetActiveWorkflowRunsForController,
  listPluginMcpRegistrationsForThread: pluginMcpRegistrationsForThread,
  listPluginRegistry: (workspacePath, targetStore) => pluginHost.listRegistry(workspacePath, pluginStateReaderForStore(targetStore)),
  markStaleWorkflowRunForRecoveryIfNeeded,
  pluginCaller: (plan, invocation, options) => pluginHost.callCodexPluginMcpTool(plan, invocation, options),
  providerStatus: (model) => getAmbientProviderStatus(model),
  readAmbientApiKey,
  rememberActiveWorkflowRun: activeWorkflowRunRegistry.rememberActiveWorkflowRun,
  requestPermissionWithGrantRegistry,
  retryPolicy: (targetStore) => ambientRetryPolicyFromCurrentSettings(targetStore),
  reviewWorkflowArtifact,
  runWorkflowArtifact,
  runWorkflowThreadExploration,
  searchRoutingSettings: () => searchRoutingSettings,
  toolDescriptorsFromPluginRegistry: workflowToolDescriptorsFromPluginRegistry,
  workspaceInventoryConnector,
  workspaceStateForThread: (thread, targetStore) => workspaceStateForThread(thread, targetStore),
});
configureDesktopMcpInstallService({
  activeThreadIdForHost: (host) => activeThreadIdForHost(host as ProjectRuntimeHost),
  emitMainWindowDesktopEvent,
  emitPluginCatalogUpdated,
  getAppVersion: () => packageJson.version,
  getUserDataPath: () => app.getPath("userData"),
  permissionGrantTargetHash,
  requestPermissionWithGrantRegistry: (request, input) =>
    requestPermissionWithGrantRegistry(request, input as Parameters<typeof requestPermissionWithGrantRegistry>[1]),
});
configureAgentMemoryDesktopService({
  activeThreadIdForHost: (host) => activeThreadIdForHost(host as ProjectRuntimeHost),
  currentFeatureFlagSnapshot: (targetStore) => currentFeatureFlagSnapshot(targetStore as ProjectStore),
  emitProjectStateIfActive: (host, threadId) => emitProjectStateIfActive(host as ProjectRuntimeHost, threadId),
  normalizeWorkspacePath,
  requireActiveProjectRuntimeHost: () => requireActiveProjectRuntimeHost(),
  updateFeatureFlagSettings: (input, host, options) =>
    updateFeatureFlagSettings(input, host as ProjectRuntimeHost, options),
  updateMemorySettings: (input, host, options) =>
    updateMemorySettings(input, host as ProjectRuntimeHost, options),
});
configureOrchestrationAutoDispatchService({
  activeThreadIdForHost: (host) => activeThreadIdForHost(host as ProjectRuntimeHost),
  callPluginMcpTool: (plan, invocation, options) => pluginHost.callCodexPluginMcpTool(plan as never, invocation as never, options as never),
  createAndRecordCheckpoint,
  emitDesktopEvent: (event) => mainWindow?.webContents.send("desktop:event", event),
  emitPermissionAuditCreated,
  emitProjectScopedEvent: (host, event) => emitProjectScopedEvent(host as ProjectRuntimeHost, event),
  emitProjectStateIfActive: (host, threadId) => emitProjectStateIfActive(host as ProjectRuntimeHost, threadId),
  ensureWorkflowPluginTrusted: (thread, registration, targetStore) =>
    ensureWorkflowPluginTrusted(thread, registration as never, targetStore),
  firstPartyWorkflowConnectorAccountAuthorizer,
  firstPartyWorkflowConnectorRegistrations,
  forgetActiveWorkflowRun: activeWorkflowRunRegistry.forgetActiveWorkflowRun,
  listPluginMcpRegistrationsForThread: pluginMcpRegistrationsForThread,
  listPluginRegistry: (workspacePath, targetStore) => pluginHost.listRegistry(workspacePath, pluginStateReaderForStore(targetStore)),
  prepareWorktreeForThread,
  recordActiveProjectBoardExecutionReadinessBlocker,
  rememberActiveWorkflowRun: activeWorkflowRunRegistry.rememberActiveWorkflowRun,
  requestPermissionWithGrantRegistry,
  requireActiveProjectRuntimeHost: () => requireActiveProjectRuntimeHost(),
  reviewFinishedProjectBoardRun,
});
configureProjectBoardDesktopContextService({
  store: () => store,
  activeThreadId: () => activeThreadId,
  activeThreadIdForHost: (host) => activeThreadIdForHost(host as ProjectRuntimeHost),
  projectRuntimeHostForStore: (targetStore) => projectRuntimeHostForStore(targetStore as ProjectStore),
  requireProjectRuntimeHostForStoreRecord: (assertRecordExists) => requireProjectRuntimeHostForStoreRecord(assertRecordExists),
  requireActiveProjectRuntimeHost: () => requireActiveProjectRuntimeHost(),
  ensureProjectRuntimeHostForWorkspacePath: (workspacePath) => ensureProjectRuntimeHostForWorkspacePath(workspacePath),
  resolveRegisteredProjectPathForHost: (projectId, host) => resolveRegisteredProjectPathForHost(projectId, host as ProjectRuntimeHost),
  emitDesktopState,
  emitProjectStateIfActive: (host) => emitProjectStateIfActive(host as ProjectRuntimeHost),
  emitOrchestrationUpdated,
  readState: () => readState(),
  readStateForProjectHostAction: (host) => readStateForProjectHostAction(host as ProjectRuntimeHost),
  readOrchestrationWorkflowReadiness,
  workflowAutoDispatchDisabledMessage,
});
configureProjectBoardSynthesisDesktopService({
  store: () => store,
  emitProjectBoardState: (targetStore, host) => emitProjectBoardState(targetStore, host as ProjectRuntimeHost | undefined),
  emitProjectStateIfActive: (host) => emitProjectStateIfActive(host as ProjectRuntimeHost),
  readStateForProjectHostAction: (host) => readStateForProjectHostAction(host as ProjectRuntimeHost),
});
configureProjectBoardProofDefaultsDesktopService({
  store: () => store,
  emitDesktopState,
});
configureProjectBoardDogfoodDesktopService({
  applyProjectBoardIncrementalSynthesisFromRun,
  emitProjectStateIfActive: (host) => emitProjectStateIfActive(host as ProjectRuntimeHost),
  readStateForProjectHostAction: (host) => readStateForProjectHostAction(host as ProjectRuntimeHost),
  requireProjectBoardForAction,
  reviewFinishedProjectBoardRun,
});

const agentRuntimeFeatureFactory = createAgentRuntimeFeatureFactory<ProjectStore, BrowserService>({
  browserLoginBrokerEnabled,
  defaultStore: () => store,
  emitRuntimeFeatureStateUpdated,
  readFeatureFlagSnapshot: (targetStore) => currentFeatureFlagSnapshot(targetStore),
  userDataPath: () => app.getPath("userData"),
  appVersion: packageJson.version,
  env: process.env,
  localModelHostMemory: () => sampleLocalModelHostMemorySnapshot(),
  googleWorkspace: {
    readIntegration: () => readFirstPartyGoogleIntegration(),
    installCli: async () => {
      const install = await googleWorkspaceCliInstaller.install();
      refreshGoogleWorkspaceConnectorMode();
      return install;
    },
    startSetup: (input) => googleWorkspaceSetupService.start(input),
    importOAuthClient: (input) => googleWorkspaceSetupService.importOAuthClientConfig(input),
    cancelSetup: () => googleWorkspaceSetupService.cancel(),
    validate: (input) => googleWorkspaceSetupService.validate(input),
    searchMethods: (input) => googleWorkspaceMethodBroker.searchMethods(input),
    describeMethod: (input) => googleWorkspaceMethodBroker.describeMethod(input),
    resolveAccountHint: (accountHint) => googleWorkspaceSetupService.resolveAccountHintForCall(accountHint),
    call: (input) => googleWorkspaceMethodBroker.call(input),
    materializeFile: (input) => googleWorkspaceMethodBroker.materializeFile(input),
  },
  workflowNativeTools: {
    connectorDescriptors: () => firstPartyWorkflowConnectorDescriptors(),
    connectorRegistrations: () => firstPartyWorkflowConnectorRegistrations(),
    connectorAccountAuthorizer: () => firstPartyWorkflowConnectorAccountAuthorizer(),
  },
  localTextSubagents: localTextSubagentStartup.feature
    ? {
      resolveModelRuntimeProfile: localTextSubagentStartup.feature.resolveModelRuntimeProfile,
      resolveRuntimeForMain: localTextSubagentStartup.feature.resolveRuntimeForMain,
      resolveRuntimeForLaunch: localTextSubagentStartup.feature.resolveRuntimeForLaunch,
      resolveRuntime: localTextSubagentStartup.feature.resolveRuntime,
    }
    : undefined,
  readSearchSettings: () => searchRoutingSettings,
  updateSearchSettings: (input, options) => updateSearchRoutingSettings(input, options),
  readLocalDeepResearchSettings: () => localDeepResearchSettings,
  updateLocalDeepResearchSettings: (input, options) => updateLocalDeepResearchSettings(input, options),
  readMediaPlaybackSettings: () => mediaPlaybackSettings,
  updateMediaPlaybackSettings: (input, options) => updateMediaPlaybackSettings(input, options),
  readPlannerSettings: () => plannerSettings,
  updatePlannerSettings: (input, options) => updatePlannerSettings(input, options),
  listProjects: (targetStore) => listRuntimeProjects(targetStore),
  createProject: (input, targetStore) => createProjectWorkspaceForRuntime(input, targetStore),
  switchProject: (input) => switchProjectWorkspaceForRuntime(input),
  workflowAgents: {
    runExploration: (input, context) => workflowRuntimeFeatureActionsService.runExploration(input, context),
    compilePreview: (input, context) => workflowRuntimeFeatureActionsService.compilePreview(input, context),
    reviewArtifact: (input, context) => workflowRuntimeFeatureActionsService.reviewArtifact(input, context),
    cancelRun: (input, context) => workflowRuntimeFeatureActionsService.cancelRun(input, context),
    recoverRun: (input, context) => workflowRuntimeFeatureActionsService.recoverRun(input, context),
  },
  workflowRecordings: {
    search: (input) => searchGlobalAmbientWorkflowPlaybooks(input),
    describe: (input) => describeGlobalAmbientWorkflowPlaybook(input),
    inject: (input) => injectGlobalAmbientWorkflowPlaybook(input),
    update: (input) => updateGlobalAmbientWorkflowPlaybook(input),
    archive: (input) => archiveGlobalAmbientWorkflowPlaybook(input),
    unarchive: (input) => unarchiveGlobalAmbientWorkflowPlaybook(input),
    restoreVersion: (input) => restoreGlobalAmbientWorkflowPlaybookVersion(input),
  },
  readVoiceSettings: () => voiceSettings,
  updateVoiceSettings: (input, audit, options) => updateVoiceSettings(input, audit, options),
  listVoiceProviders: (workspacePath) => discoverAmbientCliVoiceProviders(workspacePath),
  enforceVoiceArtifactBudget: (workspacePath, targetStore) => enforceVoiceArtifactBudget(workspacePath, targetStore),
  createMediaUrl: (input) => workspaceMediaServer.createUrl(input),
  readSttSettings: () => sttSettings,
  updateSttSettings: (input, options) => updateSttSettings(input, options),
  listSttProviders: (workspacePath) => listSttProvidersWithValidation(workspacePath),
  privilegedCredentials: {
    request: (input) => privilegedCredentials.request(input),
  },
  secureInputs: {
    request: (input) => secureInputs.request(input),
  },
});

export interface ProjectRuntimeHost {
  workspacePath: string;
  store: ProjectStore;
  internalBrowserHost: InternalBrowserHost;
  browserService: BrowserService;
  browserCredentialStore: BrowserCredentialStore;
  runtime: AgentRuntime;
  terminals: TerminalService;
  activeThreadId: string;
  autoDispatch: OrchestrationAutoDispatchState;
  agentMemoryEmbeddingRuntimeLeaseId?: string;
  agentMemoryEmbeddingRuntimeRelease?: () => Promise<void>;
  disposed?: boolean;
}

type RuntimeFeatureHostContext = AgentRuntimeFeatureFactoryContext<ProjectStore, BrowserService>;

let activeHost: ProjectRuntimeHost | undefined;
let store: ProjectStore;
let internalBrowserHost: InternalBrowserHost;
let browserService: BrowserService;
let browserCredentialStore: BrowserCredentialStore;
let runtime: AgentRuntime;
let terminals: TerminalService;
const rendererLocalPreviewServers = new LocalPreviewServerManager();
const activeWorkspaceFileService = createActiveWorkspaceFileService<ThreadSummary, ProjectStore, ProjectRuntimeHost>({
  activeHost: () => requireActiveProjectRuntimeHost(),
  activeThreadIdForHost,
  activeWorkspacePath: () => activeWorkspacePath(),
  defaultStore: () => store,
  getAppPath: (name) => app.getPath(name),
  normalizePath: normalizeWorkspacePath,
  pathExists: existsSync,
  createMediaUrl: (input) => workspaceMediaServer.createUrl(input),
  createOfficePreview: (input) => createOfficePreview(input),
});
const {
  activeWorkspaceFileContextForProjectHost,
  readActiveLocalFilePreview,
  readActiveWorkspaceFile,
  resolveLocalFilePath,
  workspacePathForRelativeArtifactPath,
} = activeWorkspaceFileService;

function currentFeatureFlagSnapshot(targetStore: ProjectStore = store) {
  return resolveAmbientFeatureFlags({
    settings: targetStore.getFeatureFlagSettings(),
    startup: ambientLaunchArgs.featureFlags,
  });
}

function currentModelRuntimeCatalog(generatedAt: string, targetStore: ProjectStore = store) {
  return targetStore.getModelRuntimeCatalog(
    generatedAt,
    localTextSubagentStartup.feature ? [localTextSubagentStartup.feature.profile] : [],
  );
}

function setActiveThreadId(threadId: string): string {
  activeThreadId = threadId;
  if (activeHost?.store === store) activeHost.activeThreadId = threadId;
  store.setLastActiveThreadId(threadId);
  return threadId;
}

function setProjectHostActiveThreadId(host: ProjectRuntimeHost, threadId: string): string {
  host.activeThreadId = threadId;
  host.store.setLastActiveThreadId(threadId);
  if (activeHost === host) activeThreadId = threadId;
  return threadId;
}

function activeRuntimeFeatureHostContext(): RuntimeFeatureHostContext {
  return {
    store,
    browserService,
    activeThreadId: () => activeThreadId,
  };
}

function syncActiveProjectRuntimeHost(host: ProjectRuntimeHost | undefined): void {
  activeHost = host;
  if (!host) return;
  store = host.store;
  internalBrowserHost = host.internalBrowserHost;
  browserService = host.browserService;
  browserCredentialStore = host.browserCredentialStore;
  runtime = host.runtime;
  terminals = host.terminals;
  setActiveThreadId(host.activeThreadId);
}

function createAgentRuntimeFeatures(context?: RuntimeFeatureHostContext): AgentRuntimeFeatures {
  return agentRuntimeFeatureFactory(context);
}

function managedChromeRevealBoundsForAmbientWindow(): ManagedChromeWindowBounds {
  const display =
    mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return managedChromeRevealBoundsForWorkArea(display.workArea);
}

function runSubagentRuntimeStartupReconciliation(reason: "project-runtime-created", host: ProjectRuntimeHost): void {
  const featureFlagSnapshot = currentFeatureFlagSnapshot(host.store);
  const summary = reconcileSubagentsOnRuntimeStartup({
    store: host.store,
    featureFlagSnapshot,
    emit: {
      onRunUpdated: (run) => emitProjectScopedEvent(host, { type: "subagent-run-updated", run }),
      onThreadUpdated: (thread) => emitProjectScopedEvent(host, { type: "thread-updated", thread }),
      onRunEventCreated: (run, event) => emitProjectScopedEvent(host, { type: "subagent-run-event-created", run, event }),
      onParentMailboxEventUpdated: (mailboxEvent) =>
        emitProjectScopedEvent(host, { type: "subagent-parent-mailbox-event-updated", mailboxEvent }),
      onWaitBarrierUpdated: (barrier) => emitProjectScopedEvent(host, { type: "subagent-wait-barrier-updated", barrier }),
    },
  });
  if (summary.issueCount || summary.repairedRunIds.length || summary.repairedBarrierIds.length || summary.diagnosticRunIds.length) {
    console.warn(
      `[subagents] ${reason} restart reconciliation issues=${summary.issueCount} repairedRuns=${summary.repairedRunIds.length} repairedBarriers=${summary.repairedBarrierIds.length} diagnosticRuns=${summary.diagnosticRunIds.length}`,
    );
  }
}

function projectRuntimeHostForStore(targetStore: ProjectStore): ProjectRuntimeHost | undefined {
  return projectRuntimeHostList().find((host) => host.store === targetStore);
}

function emitRuntimeFeatureStateUpdated(targetStore: ProjectStore): void {
  const host = projectRuntimeHostForStore(targetStore);
  if (host) {
    if (isActiveProjectRuntimeHost(host)) emitProjectStateIfActive(host, activeThreadIdForHost(host));
    return;
  }
  if (targetStore === store) emitDesktopState();
}

function projectRuntimeMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[] {
  return projectRuntimeHostList().flatMap((host) => host.runtime.pluginMcpRuntimeSnapshots());
}

function allPluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[] {
  return [...pluginHost.pluginMcpRuntimeSnapshots(), ...projectRuntimeMcpRuntimeSnapshots()];
}

async function restartProjectRuntimeMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
  for (const host of projectRuntimeHostList()) {
    const snapshots = await host.runtime.restartPluginMcpRuntime(key);
    if (snapshots) return allPluginMcpRuntimeSnapshots();
  }
  return undefined;
}

async function stopProjectRuntimeMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
  for (const host of projectRuntimeHostList()) {
    const snapshots = await host.runtime.stopPluginMcpRuntime(key);
    if (snapshots) return allPluginMcpRuntimeSnapshots();
  }
  return undefined;
}

const terminalStartTokens = new TerminalStartTokenStore();

function assertTrustedMainWindowIpc(event: IpcMainInvokeEvent, channel = "Main-process IPC"): void {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error(`${channel} is limited to the main application window.`);
  }
  const frameUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isTrustedRendererUrl(frameUrl)) {
    throw new Error(`${channel} rejected from an untrusted renderer frame.`);
  }
}

function handleIpc(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedMainWindowIpc(event, `IPC channel "${channel}"`);
    return listener(event, ...args);
  });
}

function isTrustedRendererUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const trustedUrl = trustedMainRendererUrl();
    if (!trustedUrl) return false;
    if (trustedUrl.protocol === "file:") return url.protocol === "file:" && url.href === trustedUrl.href;
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === trustedUrl.origin && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

function trustedMainRendererUrl(): URL | undefined {
  const devRendererUrl = process.env.ELECTRON_RENDERER_URL?.trim();
  if (devRendererUrl) {
    try {
      const url = new URL(devRendererUrl);
      if ((url.protocol === "http:" || url.protocol === "https:") && isLoopbackHost(url.hostname)) return url;
    } catch {
      return undefined;
    }
    return undefined;
  }
  return pathToFileURL(resolveBuiltOutputPath("renderer", "index.html"));
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

async function readCodexPluginCatalog(targetStore: ProjectStore = store): Promise<CodexPluginCatalog> {
  return pluginHost.readCodexPluginCatalog(targetStore.getWorkspace().path, pluginStateReaderForStore(targetStore));
}

async function readCodexHostedMarketplaceReport(targetStore: ProjectStore = store): Promise<CodexHostedMarketplaceReport> {
  return pluginHost.inspectHostedCodexMarketplace(targetStore.getWorkspace().path, pluginStateReaderForStore(targetStore));
}

async function readAmbientPluginRegistry(targetStore: ProjectStore = store): Promise<AmbientPluginRegistry> {
  return pluginHost.listRegistry(targetStore.getWorkspace().path, pluginStateReaderForStore(targetStore));
}

async function readCurrentOrchestrationBoard(targetStore: ProjectStore = store) {
  return readOrchestrationBoardWithWorkflowReadiness(targetStore.getWorkspace().path, targetStore.listOrchestrationBoard());
}

function createMainDiagnosticSource(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()): DiagnosticDataSource {
  const targetStore = host.store;
  const targetRuntime = host.runtime;
  return {
    getWorkspace: () => targetStore.getWorkspace(),
    listThreads: () => targetStore.listThreads(),
    listMessages: (threadId) => targetStore.listMessages(threadId),
    listPermissionAudit: (limit) => targetStore.listPermissionAudit(limit),
    listPermissionGrants: (input) => targetStore.listPermissionGrants(input),
    listContextUsageSnapshots: (limit) => targetStore.listContextUsageSnapshots(limit),
    getContextDiagnostics: () => ({ tokenizer: targetRuntime.tokenizerStatus() }),
    listOrchestrationBoard: () => targetStore.listOrchestrationBoard(),
    getFeatureFlagSnapshot: () => currentFeatureFlagSnapshot(targetStore),
    getAgentMemoryDiagnostics: () => getAgentMemoryDiagnostics(host),
    getAgentMemoryStarterStatus: () => getAgentMemoryStarterStatus(host),
    getSubagentRepairDiagnostics: (options) => targetStore.getSubagentRepairDiagnostics(options),
    getLocalModelRuntimeStatus: () => targetRuntime.readLocalModelRuntimeStatus(targetStore.getWorkspace().path),
    getPluginDiagnostics: async () => {
      const errors: string[] = [];
      const workspacePath = targetStore.getWorkspace().path;
      const [registry, codexCatalog, hostedMarketplace, piPackages, ambientCliPackages, appAuth] = await Promise.all([
        readDiagnosticSection("ambient plugin registry", () => readAmbientPluginRegistry(targetStore), errors),
        readDiagnosticSection("Codex plugin catalog", () => readCodexPluginCatalog(targetStore), errors),
        readDiagnosticSection("hosted Codex marketplace", () => readCodexHostedMarketplaceReport(targetStore), errors),
        readDiagnosticSection("Pi package catalog", () => pluginHost.inspectPiPackages(workspacePath, pluginStateReaderForStore(targetStore)), errors),
        readDiagnosticSection("Ambient CLI package catalog", () => pluginHost.inspectAmbientCliPackages(workspacePath, { includeHealth: true }), errors),
        readDiagnosticSection("plugin app auth", () => pluginHost.listPluginAppAuth(workspacePath, pluginStateReaderForStore(targetStore)), errors),
      ]);
      return {
        registry,
        codexCatalog,
        hostedMarketplace,
        piPackages,
        ambientCliPackages,
        appAuth,
        mcpRuntimes: allPluginMcpRuntimeSnapshots(),
        errors,
      };
    },
  };
}

async function readDiagnosticSection<T>(label: string, read: () => Promise<T>, errors: string[]): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function pluginStateReaderForStore(targetStore: ProjectStore) {
  return {
    isPluginEnabled: (pluginId: string) => targetStore.isPluginEnabled(pluginId),
    isPluginTrusted: (pluginId: string, pluginFingerprint?: string) => targetStore.isPluginTrusted(pluginId, pluginFingerprint),
    isPiPackageEnabled: (packageId: string) => targetStore.isPiPackageEnabled(packageId),
  };
}

function pluginStateReader() {
  return pluginStateReaderForStore(store);
}

function revokePluginGrantsForLabels(labelPrefixes: string[], targetStore: ProjectStore = store): number {
  let revoked = 0;
  for (const grant of targetStore.listPermissionGrants()) {
    if (grant.actionKind !== "plugin_tool_execute") continue;
    if (!labelPrefixes.some((prefix) => grant.targetLabel === prefix || grant.targetLabel.startsWith(prefix))) continue;
    targetStore.revokePermissionGrant(grant.id);
    revoked += 1;
  }
  return revoked;
}

async function pluginMcpRegistrationsForThread(
  thread: ThreadSummary,
  targetStore: ProjectStore = store,
): Promise<PluginMcpToolRegistration[]> {
  const enabledPlugins = await pluginHost.enabledCodexPlugins(thread.workspacePath, pluginStateReaderForStore(targetStore));
  return pluginHost.buildCodexPluginMcpToolRegistrations(enabledPlugins, {
    permissionMode: thread.permissionMode,
    workspacePath: thread.workspacePath,
  });
}

async function ambientCliCapabilityGrantsForWorkflowRequest(
  workspacePath: string,
  request: string,
): Promise<WorkflowAmbientCliCapabilityGrant[]> {
  try {
    const search = await searchAmbientCliCapabilities(workspacePath, {
      query: request,
      kind: "command",
      limit: 6,
      includeHealth: false,
    });
    return search.results.flatMap((result) =>
      result.commands.map((command) => ({
        capabilityId: command.capabilityId,
        registryPluginId: result.registryPluginId,
        packageId: result.packageId,
        packageName: result.packageName,
        command: command.name,
      })),
    );
  } catch {
    return [];
  }
}

function createWorkflowDiscoveryProvider(
  providerStatus: ReturnType<typeof getAmbientProviderStatus>,
  targetStore: ProjectStore = store,
): AmbientWorkflowDiscoveryProvider {
  return new AmbientWorkflowDiscoveryProvider({
    apiKey: readAmbientApiKey(),
    baseUrl: providerStatus.baseUrl,
    model: providerStatus.model,
    retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
  });
}

function ambientRetryPolicyFromCurrentSettings(targetStore: ProjectStore = store) {
  const modelRuntimeSettings = targetStore.getModelRuntimeSettings();
  return modelRuntimeSettings.aggressiveRetries ? ambientRetryPolicyFromSettings({ modelRuntime: modelRuntimeSettings }) : undefined;
}

async function workflowDiscoveryPolicyContextForCapabilityLookup(input: {
  workflowThreadId?: string;
  projectPath?: string;
}, context = activeProjectIpcContext()) {
  const targetStore = context.targetStore;
  const thread = context.thread;
  const workflowThread = input.workflowThreadId
    ? targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId)
    : undefined;
  const projectPath = input.projectPath ?? workflowThread?.projectPath ?? thread.workspacePath ?? targetStore.getWorkspace().path;
  const pluginThread = { ...thread, workspacePath: projectPath };
  const pluginRegistrations = await pluginMcpRegistrationsForThread(pluginThread, targetStore);
  return buildWorkflowDiscoveryPolicyContext({
    projectPath,
    workspacePath: thread.workspacePath,
    permissionMode: thread.permissionMode,
    stage: "initial_discovery",
    workflowThreadId: input.workflowThreadId,
    threadId: thread.id,
    grants: targetStore.listPermissionGrants(),
    connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
    pluginRegistrations,
    searchRoutingSettings,
  });
}

function readFirstPartyGoogleIntegration(): FirstPartyGoogleIntegrationState {
  const connectorIds = ["google.gmail", "google.calendar", "google.drive"];
  const gwsStatus = googleWorkspaceCliAdapter?.status();
  const sidecar = googleWorkspaceConnectorMode === "gws" && gwsStatus
    ? gwsStatus
    : {
        adapter: "ambient-go" as const,
        ...(googleSidecarSupervisor?.status() ?? {
          state: "missing" as const,
          binaryPath: "",
          pending: 0,
        }),
      };
  return {
    enabled: googleWorkspaceConnectorsEnabled,
    authMode: googleWorkspaceConnectorMode,
    connectors: connectorIds.map((connectorId) => googleAppAuthState(connectorId)),
    install: googleWorkspaceCliInstaller?.state(),
    setup: redactGoogleWorkspaceSetupState(googleWorkspaceSetupService?.state()),
    sidecar,
    ...(googleWorkspaceConnectorsEnabled
      ? {}
      : {
          unavailableReason:
            gwsStatus?.unavailableReason ??
            "Install Google Workspace CLI (`gws`) or set AMBIENT_GOOGLE_CLIENT_ID before starting Ambient Desktop to enable Google integrations.",
        }),
  };
}

function redactGoogleWorkspaceSetupState(
  setup: FirstPartyGoogleIntegrationState["setup"],
): FirstPartyGoogleIntegrationState["setup"] {
  if (!setup) return undefined;
  const { authUrl: _authUrl, ...safeSetup } = setup;
  return structuredClone(safeSetup);
}

async function openContainerRuntimeApplication(applicationNames: string[]): Promise<boolean> {
  const names = applicationNames.map((name) => name.trim()).filter(Boolean).slice(0, 3);
  if (!names.length) return false;
  if (process.platform === "darwin") {
    for (const name of names) {
      if (await runMacOpen(["-a", name])) {
        console.log(`[mcp-container-runtime] opened application ${name}`);
        return true;
      }
    }
  }
  if (process.platform === "win32") {
    for (const name of names) {
      if (await runWindowsStartApplication(name)) {
        console.log(`[mcp-container-runtime] opened application ${name}`);
        return true;
      }
    }
  }
  return false;
}

function runMacOpen(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/open", args, { stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

function runWindowsStartApplication(applicationName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("cmd.exe", ["/c", "start", "", applicationName], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

function refreshGoogleWorkspaceConnectorMode(): void {
  const gwsStatus = googleWorkspaceCliAdapter?.status();
  const googleOAuthProviders = googleWorkspaceOAuthProvidersFromEnv(process.env);
  if (gwsStatus && gwsStatus.state !== "missing") {
    googleWorkspaceConnectorMode = "gws";
    googleWorkspaceConnectorsEnabled = true;
    return;
  }
  if (googleOAuthProviders.length > 0) {
    googleWorkspaceConnectorMode = "ambient_oauth";
    googleWorkspaceConnectorsEnabled = true;
    return;
  }
  googleWorkspaceConnectorMode = "gws";
  googleWorkspaceConnectorsEnabled = false;
}

function firstPartyWorkflowConnectorDescriptors() {
  const descriptors = [workspaceInventoryConnectorDescriptor()];
  if (!googleWorkspaceConnectorsEnabled) return descriptors;
  const options = firstPartyGoogleConnectorDescriptorOptions();
  return [
    ...descriptors,
    ...googleWorkspaceConnectorDescriptors(options),
  ];
}

function firstPartyWorkflowConnectorRegistrations() {
  if (!googleWorkspaceConnectorsEnabled) return [];
  if (googleWorkspaceConnectorMode === "gws") {
    return googleWorkspaceConnectorRegistrations(
      {
        sidecar: googleWorkspaceCliAdapter,
      },
      firstPartyGoogleConnectorDescriptorOptions(),
    );
  }
  return googleWorkspaceConnectorRegistrations({
    auth: pluginAuthService,
    sidecar: googleSidecarSupervisor!,
  }, firstPartyGoogleConnectorDescriptorOptions());
}

function firstPartyWorkflowConnectorAccountAuthorizer() {
  return googleWorkspaceConnectorMode === "gws" ? undefined : pluginAuthService.connectorAccountAuthorizer();
}

function firstPartyGoogleConnectorDescriptorOptions(): GoogleWorkspaceConnectorDescriptorOptions {
  const adapter = googleWorkspaceConnectorMode === "gws" ? "gws" : "ambient-oauth";
  return {
    adapter,
    states: Object.fromEntries(
      ["google.gmail", "google.calendar", "google.drive"].map((connectorId) => {
        const authState = googleAppAuthState(connectorId);
        return [
          connectorId,
          {
            status: authState.status,
            accounts: authState.accounts.map((account) => ({
              id: account.accountId,
              label: account.email ?? account.label,
            })),
          },
        ];
      }),
    ),
  };
}

function googleAppAuthState(connectorId: string) {
  if (googleWorkspaceConnectorMode !== "gws") return pluginAuthService.appAuthState(connectorId);
  const status = googleWorkspaceCliAdapter.status();
  const accounts = googleWorkspaceSetupService.accountSummaries();
  const setup = googleWorkspaceSetupService.state();
  const authStatus = status.state === "missing"
    ? "unavailable" as const
    : accounts.some((account) => account.status === "available")
      ? "available" as const
      : setup.status === "running" || setup.status === "validating"
        ? "connecting" as const
        : accounts.some((account) => account.status === "error")
          ? "error" as const
          : "not_configured" as const;
  return {
    connectorId,
    providerId: "google.workspace.cli",
    providerLabel: "Google Workspace CLI",
    status: authStatus,
    accounts: status.state === "missing" ? [] : accounts,
    ...(status.state === "missing" ? { unavailableReason: status.unavailableReason } : {}),
  };
}

async function ensureWorkflowPluginTrusted(
  thread: ThreadSummary,
  registration: PluginMcpToolRegistration,
  targetStore: ProjectStore = store,
): Promise<boolean> {
  if (targetStore.isPluginTrusted(registration.tool.pluginId, registration.launchPlan.pluginFingerprint)) return true;
  const response = await permissions.request({
    threadId: thread.id,
    toolName: registration.registeredName,
    title: `Trust Codex plugin "${registration.tool.pluginName}"?`,
    message: "Ambient wants to run a local MCP tool from this plugin in a workflow. Trusting it allows future tool calls from this plugin without another first-use prompt.",
    detail: [
      `Workspace: ${thread.workspacePath}`,
      `Plugin: ${registration.tool.pluginName}`,
      `MCP server: ${registration.tool.serverName}`,
      `Tool: ${registration.originalName}`,
      `Registered as: ${registration.registeredName}`,
    ].join("\n"),
    risk: "plugin-tool",
  });
  const allowed = response.allowed;
  if (allowed) targetStore.setPluginTrusted(registration.tool.pluginId, true, registration.launchPlan.pluginFingerprint);
  return allowed;
}

function startupWorkspacePath(): string {
  return selectStartupWorkspacePath({
    explicitWorkspace: process.env.AMBIENT_DESKTOP_WORKSPACE,
    cwd: process.cwd(),
    isPackaged: app.isPackaged,
    userDataPath: app.getPath("userData"),
    registeredWorkspacePaths: projectRegistry.listRegisteredPaths().filter((workspacePath) => existsSync(workspacePath)),
    hasRestorableWorkspaceState,
  });
}

function readState(threadId = activeThreadId, options: { markActiveRead?: boolean } = {}): DesktopState {
  return desktopStateSnapshotService.readState(threadId, options);
}

function packageVersion(name: string): string {
  const dependencies = (packageJson as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> });
  return dependencies.dependencies?.[name] ?? dependencies.devDependencies?.[name] ?? "unknown";
}

const MIT_PERMISSION_NOTICE =
  "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files " +
  '(the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, ' +
  "distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, " +
  "subject to the following conditions:\n\n" +
  "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.";

const MIT_WARRANTY_NOTICE =
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF ' +
  "MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY " +
  "CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE " +
  "SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.";

function mitLicenseText(copyrightNotice: string): string {
  return ["MIT License", copyrightNotice, MIT_PERMISSION_NOTICE, MIT_WARRANTY_NOTICE].join("\n\n");
}

const APACHE_2_LICENSE_TEXT = [
  "Apache License",
  "Version 2.0, January 2004",
  "https://www.apache.org/licenses/",
  "",
  "Licensed under the Apache License, Version 2.0 (the \"License\"); you may not use this file except in compliance with the License.",
  "You may obtain a copy of the License at https://www.apache.org/licenses/LICENSE-2.0",
  "Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.",
  "See the License for the specific language governing permissions and limitations under the License.",
].join("\n");

function thirdPartyCredits(): AppThirdPartyCredit[] {
  const piCopyrightNotice = "Copyright (c) 2025 Mario Zechner";
  const lambdaRlmCopyrightNotice = "Copyright (c) 2026 Lambda-RLM Contributors";
  const toolHiveCopyrightNotice = "Copyright ToolHive contributors";
  const tencentMemoryCopyrightNotice = "Copyright (C) 2026 Tencent. All rights reserved.";

  return [
    {
      name: "Pi Agent",
      license: "MIT",
      repository: "https://github.com/earendil-works/pi",
      licenseUrl: "https://github.com/earendil-works/pi/blob/main/LICENSE",
      authors: "Mario Zechner and Pi contributors",
      copyrightNotice: piCopyrightNotice,
      licenseText: mitLicenseText(piCopyrightNotice),
      description: "Ambient integrates Pi's coding agent and LLM abstraction packages.",
      notice: "Published packages currently include @mariozechner/pi-ai and @mariozechner/pi-coding-agent.",
    },
    {
      name: "Lambda-RLM",
      license: "MIT",
      repository: LAMBDA_RLM_SOURCE_REPOSITORY,
      paper: LAMBDA_RLM_SOURCE_PAPER,
      licenseUrl: `${LAMBDA_RLM_SOURCE_REPOSITORY}/blob/main/LICENSE`,
      authors: "Lambda-RLM Contributors; Amartya Roy, Rasul Tutunov, Xiaotong Ji, Matthieu Zimmer, Haitham Bou-Ammar",
      copyrightNotice: lambdaRlmCopyrightNotice,
      licenseText: mitLicenseText(lambdaRlmCopyrightNotice),
      description: "TypeScript port/adaptation of the Lambda-RLM long-context reasoning runtime.",
      notice: `Adapted from lambda-calculus-LLM/lambda-RLM at commit ${LAMBDA_RLM_SOURCE_COMMIT}.`,
    },
    {
      name: "TencentDB Agent Memory",
      license: "MIT",
      repository: "https://github.com/TencentCloud/TencentDB-Agent-Memory",
      licenseUrl: "https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/LICENSE",
      authors: "TencentDB Agent Memory Team and TencentDB Agent Memory contributors",
      copyrightNotice: tencentMemoryCopyrightNotice,
      licenseText: mitLicenseText(tencentMemoryCopyrightNotice),
      description: "Ambient adapts TencentDB Agent Memory for the experimental local agent memory system.",
      notice:
        "Reviewed vendor subtree under vendor/tencentdb-agent-memory, pinned from TencentCloud/TencentDB-Agent-Memory at commit a21ef3f66aebd549dcccc63084c572231b62d245 with Ambient package-boundary patches documented in AMBIENT_PATCHES.md.",
    },
    {
      name: "ToolHive",
      license: "Apache-2.0",
      repository: "https://github.com/stacklok/toolhive",
      licenseUrl: "https://github.com/stacklok/toolhive/blob/main/LICENSE",
      authors: "ToolHive contributors",
      copyrightNotice: toolHiveCopyrightNotice,
      licenseText: APACHE_2_LICENSE_TEXT,
      description: "Ambient bundles ToolHive's thv runtime binary for MCP server containment and lifecycle management.",
      notice: "Bundled under resources/toolhive with license and notice files under resources/third-party-notices/toolhive.",
    },
  ];
}

function thirdPartyCreditAboutText(credit: AppThirdPartyCredit): string {
  return [
    credit.name,
    credit.description,
    credit.authors ? `Authors: ${credit.authors}` : undefined,
    credit.copyrightNotice,
    `License: ${credit.license}`,
    credit.repository ? `Repository: ${credit.repository}` : undefined,
    credit.paper ? `Paper: ${credit.paper}` : undefined,
    credit.licenseUrl ? `License URL: ${credit.licenseUrl}` : undefined,
    credit.notice,
    credit.licenseText ? `\n${credit.licenseText}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function workspaceStateForThread(thread = store.getThread(activeThreadId), targetStore: ProjectStore = store) {
  const workspace = targetStore.getWorkspace();
  return {
    path: thread.workspacePath,
    name: thread.workspacePath === workspace.path ? workspace.name : `${workspace.name} worktree`,
    statePath: workspace.statePath,
    sessionPath: workspace.sessionPath,
  };
}

function threadActionWorkspacePath(input: ThreadActionInput, fallbackHost: ProjectRuntimeHost): string {
  if (!input.projectId) return fallbackHost.workspacePath;
  return normalizeWorkspacePath(resolveRegisteredProjectPathForHost(input.projectId, fallbackHost));
}

function requireProjectRuntimeHostForThreadAction(input: ThreadActionInput, fallbackHost: ProjectRuntimeHost = requireActiveProjectRuntimeHost()): ProjectRuntimeHost {
  const host = projectRuntimeHostForThread(input.threadId) ?? ensureProjectRuntimeHostForWorkspacePath(threadActionWorkspacePath(input, fallbackHost));
  host.store.getThread(input.threadId);
  return host;
}

function threadWorkingDirectory(thread: ThreadSummary): string {
  return thread.gitWorktree?.status === "active" ? thread.gitWorktree.worktreePath : thread.workspacePath;
}

function activeWorkspacePath(): string {
  return store.getThread(activeThreadId).workspacePath;
}

async function createOfficePreview(input: {
  workspacePath: string;
  absolutePath: string;
  relativePath: string;
  mimeType?: string;
  size: number;
  mtimeMs?: number;
}): Promise<OfficePreview | undefined> {
  const result = await officePreviewService?.renderPreview(input.absolutePath);
  if (!result) return undefined;
  const preview = publicOfficePreview(result);
  if (result.status !== "available" || !result.pdfPath) return preview;

  const pdfStat =
    result.pdfBytes !== undefined && result.pdfMtimeMs !== undefined
      ? { size: result.pdfBytes, mtimeMs: result.pdfMtimeMs }
      : await stat(result.pdfPath);
  return {
    ...preview,
    pdfUrl: workspaceMediaServer.createUrl({
      workspacePath: input.workspacePath,
      absolutePath: result.pdfPath,
      relativePath: `.ambient-office-preview/${result.cacheKey ?? "preview"}.pdf`,
      mimeType: "application/pdf",
      size: pdfStat.size,
      mtimeMs: pdfStat.mtimeMs,
      allowExternal: true,
    }),
  };
}

function publicOfficePreview(result: OfficePreviewRenderResult): OfficePreview {
  const { pdfPath: _pdfPath, pdfBytes: _pdfBytes, pdfMtimeMs: _pdfMtimeMs, ...preview } = result;
  return preview;
}

function selectAmbientCliPackageForSecret(
  packages: AmbientCliPackageSummary[],
  selector: { packageId?: string; packageName?: string },
): AmbientCliPackageSummary {
  if (selector.packageId) {
    const pkg = packages.find((candidate) => candidate.id === selector.packageId);
    if (!pkg) throw new Error(`Ambient CLI package "${selector.packageId}" was not found.`);
    return pkg;
  }
  if (selector.packageName) {
    const matches = packages.filter((candidate) => candidate.name === selector.packageName);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Ambient CLI package name "${selector.packageName}" matched multiple packages. Specify packageId.`);
    throw new Error(`Ambient CLI package "${selector.packageName}" was not found.`);
  }
  throw new Error("packageId or packageName is required.");
}

async function requestPermissionWithGrantRegistry(
  request: Omit<PermissionRequest, "id">,
  input: {
    thread?: ThreadSummary;
    permissionMode?: "full-access" | "workspace";
    workspacePath?: string;
    workflowThreadId?: string;
    store?: ProjectStore;
    requireFreshPrompt?: boolean;
  } = {},
) {
  const targetStore = input.store ?? store;
  const host = projectRuntimeHostForStore(targetStore);
  const fallbackThreadId = host ? activeThreadIdForHost(host) : targetStore === store ? activeThreadId : initialActiveThreadIdForStore(targetStore);
  const thread = input.thread ?? targetStore.getThread(request.threadId || fallbackThreadId);
  const resolution = await resolvePermissionWithGrants({
    store: targetStore,
    requester: permissions,
    request,
    context: {
      permissionMode: input.permissionMode ?? thread.permissionMode,
      threadId: request.threadId || thread.id,
      workflowThreadId: request.workflowThreadId ?? input.workflowThreadId,
      projectPath: targetStore.getWorkspace().path,
      workspacePath: request.workspacePath ?? input.workspacePath ?? thread.workspacePath,
    },
    requireFreshPrompt: input.requireFreshPrompt,
  });
  if (resolution.grant && resolution.decisionSource !== "persistent_grant") {
    mainWindow?.webContents.send("desktop:event", {
      type: "permission-grant-created",
      grant: resolution.grant,
      workspacePath: targetStore.getWorkspace().path,
    });
  }
  return resolution;
}

function searchWorkspace(raw: WorkspaceSearchInput | string) {
  const parsed = workspaceSearchSchema.parse(raw);
  const input: WorkspaceSearchInput = typeof parsed === "string" ? { query: parsed, scope: "project" } : parsed;
  const scope = input.scope ?? "project";
  const limit = input.limit ?? 50;
  const host = scope !== "all-projects" && input.threadId ? requireProjectRuntimeHostForThread(input.threadId) : requireActiveProjectRuntimeHost();
  const targetStore = host.store;
  if (scope === "all-projects") {
    const activeProject = activeProjectSummary(
      targetStore.getWorkspace(),
      targetStore.listThreads(),
      activeProjectBoardForState(targetStore, activeProjectBoardThreadIdForStore(targetStore)),
    );
    const projects = projectRegistry.listProjects(targetStore.getWorkspace().path, activeProject);
    const perProjectLimit = Math.max(5, Math.ceil(limit / Math.max(projects.length, 1)));
    return projects
      .flatMap((project) => readProjectSearchResults(project.path, input.query, perProjectLimit))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  return targetStore.searchWorkspace(input.query, {
    scope,
    threadId: input.threadId ?? activeThreadIdForHost(host),
    limit,
    projectName: targetStore.getWorkspace().name,
    workspacePath: targetStore.getWorkspace().path,
  });
}

async function prepareWorktreeForThread(thread = store.getThread(activeThreadId), targetStore: ProjectStore = store) {
  const worktree = await prepareThreadWorktree(targetStore.getWorkspace().path, thread);
  if (!worktree) return thread;
  targetStore.setThreadWorktree(worktree);
  if (worktree.status === "active") {
    return targetStore.updateThreadWorkspacePath(thread.id, worktree.worktreePath);
  }
  return targetStore.getThread(thread.id);
}

async function attachWorktreeForThread(worktreePath: string, thread = store.getThread(activeThreadId), targetStore: ProjectStore = store) {
  const worktree = await attachExistingThreadWorktree(targetStore.getWorkspace().path, worktreePath, thread);
  targetStore.setThreadWorktree(worktree);
  return targetStore.updateThreadWorkspacePath(thread.id, worktree.worktreePath);
}

async function createAndRecordCheckpoint(
  kind: Parameters<typeof createGitCheckpoint>[0]["kind"],
  reason: string,
  thread = store.getThread(activeThreadId),
  targetStore: ProjectStore = store,
) {
  const review = await getWorkspaceGitStatus(thread.workspacePath);
  if (!review.isGitRepository) return undefined;
  const checkpoint = await createGitCheckpoint({
    workspacePath: thread.workspacePath,
    statePath: targetStore.getWorkspace().statePath,
    threadId: thread.id,
    branchName: review.branch,
    kind,
    reason,
  });
  if (checkpoint) targetStore.updateThreadWorktreeCheckpoint(thread.id, checkpoint.id);
  return checkpoint;
}

function activeGitContextForProjectHost(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()) {
  const threadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(threadId);
  return {
    host,
    targetStore: host.store,
    threadId,
    thread,
    workspacePath: thread.workspacePath,
  };
}

async function readGitReviewForProjectHost(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost(), threadId = activeThreadIdForHost(host)): Promise<GitReviewSummary> {
  const thread = host.store.getThread(threadId);
  return getGitReview({
    workspacePath: thread.workspacePath,
    projectRoot: host.store.getWorkspace().path,
    worktree: thread.gitWorktree,
    latestCheckpoint: await latestGitCheckpoint(host.store.getWorkspace().statePath, thread.id),
  });
}

function activeProjectSummary(
  workspace: ReturnType<ProjectStore["getWorkspace"]>,
  threads: ProjectSummary["threads"],
  board?: ProjectSummary["board"],
): ProjectSummary {
  const timestamps = threads.flatMap((thread) => [thread.createdAt, thread.updatedAt]).filter(Boolean);
  const fallbackTime = new Date(0).toISOString();
  return {
    id: projectIdFromWorkspacePath(workspace.path),
    ...workspace,
    createdAt: timestamps.length ? timestamps.reduce((earliest, item) => (item < earliest ? item : earliest)) : fallbackTime,
    updatedAt: timestamps.length ? timestamps.reduce((latest, item) => (item > latest ? item : latest)) : fallbackTime,
    board,
    threads,
  };
}

function resolveRegisteredProjectPath(projectId: string): string {
  return projectRegistry.resolveProjectId(projectId, store.getWorkspace().path);
}

function resolveRegisteredProjectPathForHost(projectId: string, host: ProjectRuntimeHost): string {
  return projectRegistry.resolveProjectId(projectId, host.workspacePath);
}

function listRuntimeProjects(targetStore: ProjectStore = store): ProjectSummary[] {
  const workspace = targetStore.getWorkspace();
  const hiddenThreadIds = new Set([...targetStore.listAutomationThreadChatIds(), ...targetStore.listWorkflowAgentThreadChatIds()]);
  const projectThreads = targetStore.listThreads().filter((thread) => !hiddenThreadIds.has(thread.id));
  const activeProject = activeProjectSummary(workspace, projectThreads, activeProjectBoardForState(targetStore, activeProjectBoardThreadIdForStore(targetStore)));
  return projectRegistry.listProjects(workspace.path, activeProject);
}

function createProjectWorkspaceForRuntime(input: { name?: string; workspacePath?: string; reason: string }, targetStore: ProjectStore = store): ProjectSummary {
  const workspacePath = resolveHeadlessProjectWorkspacePath(input, targetStore.getWorkspace().path);
  mkdirSync(workspacePath, { recursive: true });
  const projectStore = new ProjectStore();
  let summary: ProjectSummary;
  try {
    const workspace = projectStore.openWorkspace(workspacePath);
    summary = activeProjectSummary(workspace, projectStore.listThreads(), projectStore.getActiveProjectBoard(initialActiveThreadIdForStore(projectStore)));
  } finally {
    projectStore.close();
  }
  projectRegistry.register(workspacePath);
  if (input.name?.trim()) projectRegistry.setDisplayName(workspacePath, input.name.trim());
  return listRuntimeProjects(targetStore).find((project) => project.path === workspacePath) ?? summary;
}

function switchProjectWorkspaceForRuntime(input: { workspacePath: string; reason: string }): void {
  const state = switchWorkspace(input.workspacePath);
  mainWindow?.webContents.send("desktop:event", { type: "state", state });
}

function resolveHeadlessProjectWorkspacePath(input: { name?: string; workspacePath?: string }, baseWorkspacePath = store.getWorkspace().path): string {
  const requestedPath = input.workspacePath?.trim();
  if (requestedPath) {
    if (requestedPath.startsWith("~/")) return normalizeWorkspacePath(join(app.getPath("home"), requestedPath.slice(2)));
    if (requestedPath.startsWith(".")) return normalizeWorkspacePath(resolve(dirname(baseWorkspacePath), requestedPath));
    return normalizeWorkspacePath(requestedPath);
  }
  const rawName = input.name?.trim() || "New Ambient Project";
  const directoryName = rawName.replace(/[/:\\]/g, "-").replace(/\s+/g, " ").trim() || "New Ambient Project";
  return normalizeWorkspacePath(join(dirname(baseWorkspacePath), directoryName));
}

function permanentWorktreeBranchName(projectPath: string): string {
  const slug = (basename(projectPath) || "project")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `codex/${slug || "project"}-worktree-${Date.now().toString(36)}`;
}

function initialActiveThreadIdForStore(targetStore: ProjectStore): string {
  const threads = targetStore.listThreads();
  const persistedThreadId = targetStore.getLastActiveThreadId();
  if (persistedThreadId && threads.some((thread) => thread.id === persistedThreadId)) return persistedThreadId;
  const active = threads[0]?.id;
  if (!active) throw new Error("No active thread");
  targetStore.setLastActiveThreadId(active);
  return active;
}

function initialActiveThreadId(): string {
  return initialActiveThreadIdForStore(store);
}

function requireActiveProjectRuntimeHost(): ProjectRuntimeHost {
  const host = projectRuntimeHostActivationService.activeProjectRuntimeHost();
  if (!host) throw new Error("No active project runtime host.");
  return host;
}

function activeProjectIpcContext() {
  const host = requireActiveProjectRuntimeHost();
  const targetStore = host.store;
  const thread = targetStore.getThread(activeThreadIdForHost(host));
  return { host, targetStore, targetBrowserService: host.browserService, thread };
}

function workflowProjectIpcContext(input: { projectPath?: string }) {
  const host = input.projectPath ? ensureProjectRuntimeHostForWorkspacePath(input.projectPath) : requireActiveProjectRuntimeHost();
  const targetStore = host.store;
  const thread = targetStore.getThread(activeThreadIdForHost(host));
  const projectPath = normalizeWorkspacePath(input.projectPath ?? targetStore.getWorkspace().path);
  return { host, targetStore, targetBrowserService: host.browserService, thread, projectPath };
}

function workflowAgentIpcContextForWorkflowThread(workflowThreadId: string) {
  const host = requireProjectRuntimeHostForWorkflowThread(workflowThreadId);
  const targetStore = host.store;
  const thread = targetStore.getThread(activeThreadIdForHost(host));
  const workflowThread = targetStore.getWorkflowAgentThreadSummary(workflowThreadId);
  const projectPath = normalizeWorkspacePath(workflowThread.projectPath || targetStore.getWorkspace().path);
  return { host, targetStore, targetBrowserService: host.browserService, thread, workflowThread, projectPath };
}

function workflowAgentIpcContextForDiscoveryQuestion(questionId: string) {
  const host = requireProjectRuntimeHostForWorkflowDiscoveryQuestion(questionId);
  const targetStore = host.store;
  const thread = targetStore.getThread(activeThreadIdForHost(host));
  const question = targetStore.getWorkflowDiscoveryQuestion(questionId);
  const workflowThread = targetStore.getWorkflowAgentThreadSummary(question.workflowThreadId);
  const projectPath = normalizeWorkspacePath(workflowThread.projectPath || targetStore.getWorkspace().path);
  return { host, targetStore, targetBrowserService: host.browserService, thread, workflowThread, question, projectPath };
}

function workflowAgentControlThread(
  targetStore: ProjectStore,
  fallbackThread: ThreadSummary,
  workflowThread: ReturnType<ProjectStore["getWorkflowAgentThreadSummary"]>,
  projectPath: string,
): ThreadSummary {
  const baseThread = workflowThread.chatThreadId ? targetStore.getThread(workflowThread.chatThreadId) : fallbackThread;
  return { ...baseThread, workspacePath: projectPath };
}

function workflowArtifactIpcContextForHost(host: ProjectRuntimeHost, artifactId: string) {
  const targetStore = host.store;
  const activeThread = targetStore.getThread(activeThreadIdForHost(host));
  const artifact = targetStore.getWorkflowArtifact(artifactId);
  const workflowThread = artifact.workflowThreadId ? targetStore.getWorkflowAgentThreadSummary(artifact.workflowThreadId) : undefined;
  const projectPath = normalizeWorkspacePath(workflowThread?.projectPath || targetStore.getWorkspace().path);
  const thread = workflowThread
    ? workflowAgentControlThread(targetStore, activeThread, workflowThread, projectPath)
    : { ...activeThread, workspacePath: projectPath };
  return { host, targetStore, targetBrowserService: host.browserService, thread, artifact, workflowThread, projectPath };
}

function workflowArtifactIpcContext(artifactId: string) {
  return workflowArtifactIpcContextForHost(requireProjectRuntimeHostForWorkflowArtifact(artifactId), artifactId);
}

function workflowCompileIpcContext(input: { workflowThreadId?: string; revisionId?: string }) {
  if (input.workflowThreadId) {
    const context = workflowAgentIpcContextForWorkflowThread(input.workflowThreadId);
    if (input.revisionId) {
      const revision = context.targetStore.getWorkflowRevision(input.revisionId);
      if (revision.workflowThreadId !== input.workflowThreadId) {
        throw new Error(`Workflow revision ${revision.id} does not belong to workflow thread ${input.workflowThreadId}.`);
      }
    }
    return {
      ...context,
      thread: workflowAgentControlThread(context.targetStore, context.thread, context.workflowThread, context.projectPath),
    };
  }
  if (input.revisionId) {
    const host = requireProjectRuntimeHostForWorkflowRevision(input.revisionId);
    const revision = host.store.getWorkflowRevision(input.revisionId);
    const context = workflowAgentIpcContextForWorkflowThread(revision.workflowThreadId);
    return {
      ...context,
      thread: workflowAgentControlThread(context.targetStore, context.thread, context.workflowThread, context.projectPath),
    };
  }
  const context = activeProjectIpcContext();
  const projectPath = normalizeWorkspacePath(context.thread.workspacePath || context.targetStore.getWorkspace().path);
  return { ...context, projectPath, thread: { ...context.thread, workspacePath: projectPath } };
}

function workflowDebugRewriteIpcContext(input: { runId: string; eventId?: string; userNotes?: string }) {
  const host = requireProjectRuntimeHostForWorkflowRun(input.runId);
  const targetStore = host.store;
  const debugContext = buildWorkflowDebugRewriteContext(targetStore, input);
  if (!debugContext.workflowThreadId) {
    throw new Error("Debug rewrite requires the failed workflow to belong to a Workflow Agent thread.");
  }
  const workflowThread = targetStore.getWorkflowAgentThreadSummary(debugContext.workflowThreadId);
  const projectPath = normalizeWorkspacePath(workflowThread.projectPath || targetStore.getWorkspace().path);
  const activeThread = targetStore.getThread(activeThreadIdForHost(host));
  const thread = workflowAgentControlThread(targetStore, activeThread, workflowThread, projectPath);
  return { host, targetStore, targetBrowserService: host.browserService, thread, workflowThread, debugContext, projectPath };
}

function isActiveProjectRuntimeHost(host: ProjectRuntimeHost): boolean {
  return projectRuntimeHostActivationService.activeProjectRuntimeHost() === host;
}

function activeThreadIdForHost(host: ProjectRuntimeHost): string {
  try {
    host.store.getThread(host.activeThreadId);
    return host.activeThreadId;
  } catch {
    return setProjectHostActiveThreadId(host, initialActiveThreadIdForStore(host.store));
  }
}

function resolveBuiltOutputPath(...segments: string[]): string {
  return join(app.getAppPath(), "out", ...segments);
}

function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(process.cwd(), "build", "icon.png"),
    join(process.resourcesPath, "icon.png"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function appearancePreferencesPath(): string {
  return join(app.getPath("userData"), "preferences.json");
}

function currentAppearance() {
  return resolveAppearance(themePreference, nativeTheme.shouldUseDarkColors);
}

function applyThemePreference(preference: ThemePreference) {
  themePreference = preference;
  nativeTheme.themeSource = preference;
  return currentAppearance();
}

function publishAppearanceUpdated(): void {
  const appearance = currentAppearance();
  mainWindow?.setBackgroundColor(appearanceBackgroundColor(appearance.resolvedTheme));
  mainWindow?.webContents.send("desktop:event", { type: "appearance-updated", appearance } satisfies DesktopEvent);
}

interface VoiceSettingsAuditContext {
  source: VoiceSettingsAuditSource;
  toolName?: string;
  threadId?: string;
  summary?: string;
}

interface SettingsUpdateStateOptions {
  onStateUpdated?: () => void;
}

interface VoiceSettingsUpdateOptions extends SettingsUpdateStateOptions {
  providerStore?: ProjectStore;
  workspacePath?: string;
}

function activeVoiceSttContextForProjectHost(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()) {
  const threadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(threadId);
  return {
    host,
    targetStore: host.store,
    threadId,
    thread,
    workspacePath: thread.workspacePath,
  };
}

async function updateVoiceSettings(
  input: UpdateVoiceSettingsInput,
  audit: VoiceSettingsAuditContext = { source: "settings-ui" },
  options: VoiceSettingsUpdateOptions = {},
) {
  const selectedProviderAvailable = input.providerCapabilityId
    ? (await listVoiceProvidersWithCachedVoices(options.providerStore ?? store)).some(
      (provider) => provider.capabilityId === input.providerCapabilityId && provider.available,
    )
    : false;
  const firstProviderSetup = selectedProviderAvailable && !voiceSettings.providerCapabilityId;
  const previousSettings = voiceSettings;
  const preferredVoicesByProvider = {
    ...(voiceSettings.preferredVoicesByProvider ?? {}),
    ...(input.preferredVoicesByProvider ?? {}),
    ...(input.providerCapabilityId && input.voiceId ? { [input.providerCapabilityId]: input.voiceId } : {}),
  };
  voiceSettings = {
    enabled: selectedProviderAvailable && (input.enabled || firstProviderSetup),
    mode: input.mode,
    autoplay: selectedProviderAvailable && (input.autoplay || firstProviderSetup),
    ...(input.providerCapabilityId ? { providerCapabilityId: input.providerCapabilityId } : {}),
    ...(input.voiceId ? { voiceId: input.voiceId } : {}),
    ...(Object.keys(preferredVoicesByProvider).length ? { preferredVoicesByProvider } : {}),
    maxChars: input.maxChars,
    longReply: input.longReply,
    format: input.format,
    artifactCacheMaxMb: input.artifactCacheMaxMb,
  };
  recordVoiceSettingsAudit(previousSettings, voiceSettings, audit);
  await writeVoiceSettings(appearancePreferencesPath(), voiceSettings);
  await enforceVoiceArtifactBudget(options.workspacePath ?? activeWorkspacePath(), options.providerStore ?? store);
  if (options.onStateUpdated) options.onStateUpdated();
  else emitDesktopState();
  return voiceSettings;
}

async function updateSttSettings(input: UpdateSttSettingsInput, options: SettingsUpdateStateOptions = {}) {
  sttSettings = {
    enabled: input.enabled && Boolean(input.providerCapabilityId),
    ...(input.providerCapabilityId ? { providerCapabilityId: input.providerCapabilityId } : {}),
    spokenLanguage: input.spokenLanguage,
    ...(input.pushToTalkShortcut ? { pushToTalkShortcut: input.pushToTalkShortcut } : {}),
    microphone: {
      ...(input.microphone?.deviceId ? { deviceId: input.microphone.deviceId } : {}),
      ...(input.microphone?.label ? { label: input.microphone.label } : {}),
    },
    mode: input.mode,
    autoSendAfterTranscription: input.autoSendAfterTranscription,
    silenceFinalizeSeconds: input.silenceFinalizeSeconds,
    noSpeechGate: input.noSpeechGate,
    bargeIn: input.bargeIn,
  };
  await writeSttSettings(appearancePreferencesPath(), sttSettings);
  for (const runtime of sttRuntimes.values()) runtime.updateSettings(sttSettings);
  if (options.onStateUpdated) options.onStateUpdated();
  else emitDesktopState();
  return sttSettings;
}

async function listVoiceProvidersWithCachedVoices(targetStore: ProjectStore = store) {
  const providers: VoiceProviderCandidate[] = [];
  const seen = new Set<string>();
  for (const workspacePath of voiceProviderWorkspacePaths(targetStore)) {
    const workspaceProviders = await discoverAmbientCliVoiceProviders(workspacePath);
    const cache = await readVoiceDiscoveryCache(workspacePath);
    for (const provider of mergeVoiceProvidersWithCachedVoices(workspaceProviders, cache)) {
      if (seen.has(provider.capabilityId)) continue;
      seen.add(provider.capabilityId);
      providers.push(provider);
    }
  }
  return providers;
}

async function listEmbeddingProvidersForSettings(targetStore: ProjectStore = store) {
  const providers: EmbeddingProviderCandidate[] = [];
  const seen = new Set<string>();
  for (const workspacePath of voiceProviderWorkspacePaths(targetStore)) {
    const workspaceProviders = [
      ...await discoverAmbientMemoryEmbeddingProviders(workspacePath).catch(() => []),
      ...await discoverAmbientCliEmbeddingProviders(workspacePath).catch(() => []),
    ];
    for (const provider of workspaceProviders) {
      if (seen.has(provider.capabilityId)) continue;
      seen.add(provider.capabilityId);
      providers.push(provider);
    }
  }
  return providers;
}

function voiceProviderWorkspacePaths(targetStore: ProjectStore = store): string[] {
  return Array.from(new Set([
    targetStore.getWorkspace().path,
    ...targetStore.listThreads().map((thread) => thread.workspacePath),
  ]));
}

async function resolveVoiceProviderWorkspacePath(
  providerCapabilityId: string | undefined,
  targetStore: ProjectStore = store,
): Promise<string> {
  if (!providerCapabilityId) return targetStore.getWorkspace().path;
  for (const workspacePath of voiceProviderWorkspacePaths(targetStore)) {
    const providers = await discoverAmbientCliVoiceProviders(workspacePath);
    if (providers.some((provider) => provider.capabilityId === providerCapabilityId)) return workspacePath;
  }
  return targetStore.getWorkspace().path;
}

async function listSttProvidersWithValidation(workspacePath = activeWorkspacePath()) {
  const providers = await discoverAmbientCliSttProviders(workspacePath);
  const validation = await readQwen3AsrValidationMetadata(workspacePath);
  return mergeSttProvidersWithValidation(providers, validation);
}

async function setupSttProvider(input: SttProviderSetupInput, context = activeVoiceSttContextForProjectHost()) {
  const { workspacePath } = context;
  const startedAt = Date.now();
  const result = await setupQwen3AsrProvider(workspacePath, input, sttProviderSetupOptions());
  const selectedProvider = result.selectedProvider;
  if (input.selectProvider && selectedProvider) {
    await updateSttSettings({
      ...sttSettings,
      enabled: Boolean(input.enable) && selectedProvider.available && result.status === "ready",
      providerCapabilityId: selectedProvider.capabilityId,
      spokenLanguage: input.spokenLanguage?.trim() || selectedProvider.defaultLanguage || sttSettings.spokenLanguage,
    }, {
      onStateUpdated: () => emitRuntimeFeatureStateUpdated(context.targetStore),
    });
  }
  await recordSttDiagnostic(workspacePath, sttSetupDiagnosticSummary({ result, durationMs: Date.now() - startedAt }));
  return {
    ...result,
    providers: await listSttProvidersWithValidation(workspacePath),
  };
}

function sttProviderSetupOptions() {
  if (process.env.AMBIENT_E2E !== "1") return {};
  return {
    disableRuntimeAutoDetect: process.env.AMBIENT_E2E_STT_DISABLE_RUNTIME_AUTODETECT === "1",
    disableRuntimeInstall: process.env.AMBIENT_E2E_STT_DISABLE_RUNTIME_INSTALL === "1",
  };
}

function miniCpmVisionProviderOptions() {
  if (process.env.AMBIENT_E2E !== "1") return {};
  return {
    disableRuntimeAutoDetect: process.env.AMBIENT_E2E_MINICPM_DISABLE_RUNTIME_AUTODETECT === "1",
  };
}

async function setupMiniCpmVision(input: MiniCpmVisionSetupInput, workspacePath = activeVoiceSttContextForProjectHost().workspacePath) {
  return setupMiniCpmVisionProvider(workspacePath, input, miniCpmVisionProviderOptions());
}

async function analyzeMiniCpmVision(input: MiniCpmVisionAnalyzeInput, workspacePath = activeVoiceSttContextForProjectHost().workspacePath) {
  return analyzeMiniCpmVisionInput(workspacePath, input, miniCpmVisionProviderOptions());
}

async function setupLocalDeepResearch(
  input: LocalDeepResearchSetupIpcInput,
  workspacePath = activeVoiceSttContextForProjectHost().workspacePath,
): Promise<LocalDeepResearchSetupResult> {
  const action = input.action ?? "status";
  const setupInput: LocalDeepResearchSetupContractInput = {
    q8Override: input.q8Override,
  };
  const initial = await readLocalDeepResearchReadinessForSettings(workspacePath, setupInput);
  let installResult: LocalDeepResearchInstallServiceResult | undefined;
  if (action === "install" || action === "repair") {
    installResult = await installLocalDeepResearchManagedAssets({
      workspacePath,
      setup: initial.contract,
      action,
      installModel: input.installModel !== false,
      installRuntime: input.installRuntime !== false,
      ...(input.runtimeArtifactId ? { runtimeArtifactId: input.runtimeArtifactId } : {}),
      onProgress: (progress) => emitMainWindowDesktopEvent({
        type: "local-deep-research-install-progress",
        progress,
        workspacePath,
      }),
    });
  }
  const { contract, managedAssets } = installResult
    ? await readLocalDeepResearchReadinessForSettings(workspacePath, setupInput)
    : initial;
  const validation = action === "validate"
    ? await validateLocalDeepResearchSetup({ workspacePath, setup: contract, managedAssets })
    : undefined;
  const smoke = action === "smoke"
    ? await runLocalDeepResearchRealAssetSmoke({
        workspacePath,
        setup: contract,
        managedAssets,
        approveResourceLimitExceed: confirmLocalModelResourceLimitExceed,
      })
    : undefined;
  const result = localDeepResearchSetupResultFromContract(action, contract, managedAssets, installResult, validation, smoke);
  emitMainWindowDesktopEvent({
    type: "local-deep-research-setup-updated",
    result,
    workspacePath,
  });
  return result;
}

async function confirmLocalModelResourceLimitExceed(decision: LocalModelResourcePolicyDecision): Promise<boolean> {
  const detail = [
    decision.exceededByBytes !== undefined
      ? `Projected resident memory exceeds the configured ceiling by ${formatLocalModelResourceBytes(decision.exceededByBytes)}.`
      : "Projected resident memory exceeds the configured ceiling.",
    `Ceiling: ${decision.maxResidentMemoryBytes !== undefined ? formatLocalModelResourceBytes(decision.maxResidentMemoryBytes) : "not configured"}.`,
    `Active estimate: ${formatLocalModelResourceBytes(decision.activeEstimatedResidentMemoryBytes)}.`,
    `Requested estimate: ${decision.requestedEstimatedResidentMemoryBytes !== undefined ? formatLocalModelResourceBytes(decision.requestedEstimatedResidentMemoryBytes) : "unknown"}.`,
    `Projected estimate: ${formatLocalModelResourceBytes(decision.projectedEstimatedResidentMemoryBytes)}.`,
    decision.activeActualResidentMemoryBytes !== undefined
      ? `Actual sampled resident memory: ${formatLocalModelResourceBytes(decision.activeActualResidentMemoryBytes)}.`
      : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");
  const options = {
    type: "warning" as const,
    buttons: ["Continue", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Exceed Local Model Memory Ceiling?",
    message: "Starting this local model would exceed your configured memory ceiling.",
    detail,
  };
  const response = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  return response.response === 0;
}

async function readLocalDeepResearchReadinessForSettings(
  workspacePath: string,
  input: LocalDeepResearchSetupContractInput,
): Promise<{
  contract: LocalDeepResearchSetupContract;
  managedAssets: Awaited<ReturnType<typeof detectLocalDeepResearchManagedAssets>>;
}> {
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
  const mcpTools = await discoverWebResearchMcpProviderToolsForWorkspace(workspacePath);
  const searchSettings = webResearchSettingsWithDynamicProviderCatalogs(searchRoutingSettings, { ambientCliCatalog: catalog, mcpTools });
  const residentProcesses = await detectLocalLlamaResidentProcesses(workspacePath).catch(() => []);
  const machineFacts = {
    ...input.machineFacts,
    activeLocalModelCount: residentProcesses.length,
    activeLocalModelEstimatedResidentMemoryBytes: residentProcesses.reduce((sum, resident) => sum + Math.max(0, resident.estimatedResidentMemoryBytes ?? 0), 0),
  };
  const preliminaryContract = buildLocalDeepResearchSetupContract({
    ...input,
    localDeepResearchSettings,
    machineFacts,
    searchSettings,
  });
  const managedAssets = await detectLocalDeepResearchManagedAssets(workspacePath, {
    selectedProfileId: preliminaryContract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
  });
  const installJob = await reconcileLocalDeepResearchInstallJob(workspacePath).catch(() => undefined);
  const localRuntimeStatus = await buildLocalModelRuntimeStatusSnapshot({
    workspacePath,
    settings: localDeepResearchSettings.localModelResources,
    residentProcesses,
    hostMemory: sampleLocalModelHostMemorySnapshot(),
    voiceProviders: await listVoiceProvidersWithCachedVoices().catch(() => []),
    embeddingProviders: await listEmbeddingProvidersForSettings().catch(() => []),
    requestedLaunch: localDeepResearchRequestedLaunch({
      modelId: preliminaryContract.modelInstall.filename,
      profileId: preliminaryContract.modelInstall.selectedProfileId,
      contextTokens: preliminaryContract.modelInstall.contextTokens,
      estimatedResidentMemoryBytes: preliminaryContract.installerShape.memory.estimatedResidentMemoryBytes,
    }),
  });
  const localModelResources = localRuntimeStatus.registry;
  const setupInput: LocalDeepResearchSetupContractInput = {
    ...input,
    localDeepResearchSettings,
    machineFacts,
    searchSettings,
    localModelResources,
    localRuntimeInventory: localRuntimeStatus.inventory,
    modelInstallState: managedAssets.model.status === "present" ? "installed" : "missing",
    runtimeInstalled: managedAssets.runtime.status === "present",
    ...(managedAssets.runtime.artifactId ? { runtimeArtifactId: managedAssets.runtime.artifactId } : {}),
    ...(managedAssets.runtime.status === "present" && managedAssets.runtime.binaryPath ? { runtimeBinaryPath: managedAssets.runtime.binaryPath } : {}),
    assetWarnings: [
      ...managedAssets.warnings,
      ...localDeepResearchInstallJobWarnings(installJob),
    ],
  };
  const contract = buildLocalDeepResearchSetupContract(setupInput);
  return { contract, managedAssets };
}

function formatLocalModelResourceBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const gib = bytes / (1024 ** 3);
  if (gib >= 1) return `${gib.toFixed(1)} GiB`;
  return `${(bytes / (1024 ** 2)).toFixed(0)} MiB`;
}

async function discoverWebResearchMcpProviderToolsForWorkspace(workspacePath: string) {
  try {
    const { toolHive, catalog } = createMcpInstallCatalog();
    const bridge = new McpToolBridge({
      catalog,
      toolHive,
      workspacePath,
    });
    return bridge.searchTools({ limit: 50, refresh: false });
  } catch {
    return [];
  }
}

function localDeepResearchSetupResultFromContract(
  action: LocalDeepResearchSetupIpcInput["action"],
  contract: LocalDeepResearchSetupContract,
  managedAssets: Awaited<ReturnType<typeof detectLocalDeepResearchManagedAssets>>,
  installResult?: LocalDeepResearchInstallServiceResult,
  validation?: Awaited<ReturnType<typeof validateLocalDeepResearchSetup>>,
  smoke?: Awaited<ReturnType<typeof runLocalDeepResearchRealAssetSmoke>>,
): LocalDeepResearchSetupResult {
  return {
    schemaVersion: "ambient-local-deep-research-setup-result-v1",
    action: action ?? "status",
    capabilityId: contract.capabilityId,
    setupStatus: contract.status,
    modelSelection: contract.modelSelection,
    modelInstall: {
      ...contract.modelInstall,
      selectedProfileId: contract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    },
    llamaRuntime: contract.runtime,
    installerShape: contract.installerShape,
    localModelResources: contract.localModelResources,
    localRuntimeInventory: contract.localRuntimeInventory,
    providerSnapshot: contract.providerSnapshot,
    managedAssets,
    ...(installResult ? { installResult } : {}),
    ...(validation ? { validation } : {}),
    ...(smoke ? { smoke } : {}),
    warnings: contract.warnings,
    blockers: contract.blockers,
    nextActions: contract.nextActions,
  };
}

async function listLocalDeepResearchRunsForSettings(
  input: LocalDeepResearchRunHistoryInput | undefined,
  workspacePath = activeVoiceSttContextForProjectHost().workspacePath,
): Promise<LocalDeepResearchRunHistoryResult> {
  return listLocalDeepResearchRunHistory(workspacePath, input);
}

async function transcribeSttAudio(input: SttTranscribeAudioInput, host = requireProjectRuntimeHostForThread(input.threadId)) {
  if (!sttSettings.enabled || !sttSettings.providerCapabilityId) {
    throw new Error("Enable speech input and select an available STT provider before transcribing speech.");
  }
  const targetStore = host.store;
  const thread = targetStore.getThread(input.threadId);
  const workspacePath = thread.workspacePath;
  const runtime = getSttRuntime(workspacePath);
  runtime.updateSettings(sttSettings);
  runtime.setAgentRunning(isThreadRunActive(input.threadId, targetStore));
  const startedAt = Date.now();
  const state = await runtime.enqueueUtterance({
    threadId: input.threadId,
    utteranceId: input.utteranceId ?? `stt-${Date.now().toString(36)}`,
    audioPath: input.audioPath,
  });
  runtime.drainReadyToSend();
  const queue = runtime.getQueueState();
  await recordSttDiagnostic(
    workspacePath,
    sttTranscriptionDiagnosticSummary({ state, elapsedMs: Date.now() - startedAt, queue }),
  );
  return {
    state,
    queue,
  };
}

async function setSttTtsSpeaking(input: SetSttTtsSpeakingInput, workspacePath = activeVoiceSttContextForProjectHost().workspacePath): Promise<SttQueueState> {
  const runtime = getSttRuntime(workspacePath);
  runtime.updateSettings(sttSettings);
  return runtime.setTtsSpeaking(input.speaking);
}

async function cancelSttTranscription(workspacePath = activeVoiceSttContextForProjectHost().workspacePath): Promise<SttQueueState> {
  const runtime = getSttRuntime(workspacePath);
  runtime.updateSettings(sttSettings);
  return runtime.cancelTranscription();
}

function getSttRuntime(workspacePath: string): SttRuntime {
  const normalized = normalizeWorkspacePath(workspacePath);
  let runtime = sttRuntimes.get(normalized);
  if (!runtime) {
    runtime = new SttRuntime({
      workspacePath: normalized,
      settings: sttSettings,
      runner: runAmbientCliPackageCommand,
      onQueueStateChanged: (queue) => {
        emitMainWindowDesktopEvent({ type: "stt-queue-updated", queue, workspacePath: normalized });
      },
      onStopSpeakingRequested: () => {
        emitMainWindowDesktopEvent({ type: "stt-stop-tts-requested", workspacePath: normalized });
      },
    });
    sttRuntimes.set(normalized, runtime);
  }
  return runtime;
}

function idleSttQueueState(): SttQueueState {
  return { phase: "idle" as const, queuedUtteranceIds: [] };
}

function currentSttQueueState(workspacePath = activeWorkspacePath()): SttQueueState {
  return sttRuntimes.get(normalizeWorkspacePath(workspacePath))?.getQueueState() ?? idleSttQueueState();
}

function disposeSttRuntimeForWorkspace(workspacePath: string, reason: string): void {
  const normalized = normalizeWorkspacePath(workspacePath);
  const runtime = sttRuntimes.get(normalized);
  if (!runtime) return;
  runtime.dispose(reason);
  sttRuntimes.delete(normalized);
}

async function recordSttDiagnostic(workspacePath: string, diagnostic: ReturnType<typeof sttSetupDiagnosticSummary> | ReturnType<typeof sttTranscriptionDiagnosticSummary>): Promise<void> {
  const diagnostics = await sttDiagnostics.record(workspacePath, diagnostic);
  mainWindow?.webContents.send("desktop:event", {
    type: "stt-diagnostic-recorded",
    diagnostic,
    diagnostics,
    workspacePath,
  } satisfies DesktopEvent);
}

function isThreadRunActive(threadId: string, targetStore: ProjectStore = store): boolean {
  return targetStore
    .listActiveRuns()
    .some((run) => run.threadId === threadId && (run.status === "starting" || run.status === "streaming" || run.status === "tool"));
}

async function refreshVoiceProviderCatalog(input: { providerCapabilityId: string }, targetStore: ProjectStore = store) {
  const workspacePath = await resolveVoiceProviderWorkspacePath(input.providerCapabilityId, targetStore);
  const providers = await discoverAmbientCliVoiceProviders(workspacePath);
  const result = await refreshVoiceProviderVoices(workspacePath, providers, input, runAmbientCliPackageCommand);
  return {
    providerCapabilityId: result.provider.capabilityId,
    providerLabel: result.provider.label,
    ...(result.entry.source ? { source: result.entry.source } : {}),
    refreshedAt: result.entry.refreshedAt,
    ...(result.entry.expiresAt ? { expiresAt: result.entry.expiresAt } : {}),
    voiceCount: result.entry.voiceCount,
    durationMs: result.durationMs,
    ...(result.stdoutArtifactPath ? { stdoutArtifactPath: result.stdoutArtifactPath } : {}),
    ...(result.stderrArtifactPath ? { stderrArtifactPath: result.stderrArtifactPath } : {}),
  };
}

function recordVoiceSettingsAudit(previous: VoiceSettings, next: VoiceSettings, audit: VoiceSettingsAuditContext): void {
  const changes = voiceSettingsChanges(previous, next);
  if (changes.length === 0) return;
  const entry: VoiceSettingsAuditEntry = {
    id: `voice-settings-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    source: audit.source,
    summary: audit.summary ?? voiceSettingsAuditSummary(audit.source, changes),
    changes,
    ...(audit.toolName ? { toolName: audit.toolName } : {}),
    ...(audit.threadId ? { threadId: audit.threadId } : {}),
  };
  voiceSettingsAudit = [entry, ...voiceSettingsAudit].slice(0, 20);
}

function voiceSettingsChanges(previous: VoiceSettings, next: VoiceSettings): VoiceSettingsAuditChange[] {
  const fields: Array<keyof VoiceSettings> = [
    "enabled",
    "mode",
    "autoplay",
    "providerCapabilityId",
    "voiceId",
    "preferredVoicesByProvider",
    "maxChars",
    "longReply",
    "format",
    "artifactCacheMaxMb",
  ];
  return fields.flatMap((field) => {
    const previousValue = previous[field];
    const nextValue = next[field];
    if (previousValue === nextValue) return [];
    return [{
      field,
      ...(previousValue !== undefined ? { previous: String(previousValue) } : {}),
      ...(nextValue !== undefined ? { next: String(nextValue) } : {}),
    }];
  });
}

function voiceSettingsAuditSummary(source: VoiceSettingsAuditSource, changes: VoiceSettingsAuditChange[]): string {
  const fieldList = changes.map((change) => change.field).join(", ");
  return source === "chat-tool"
    ? `Chat updated voice settings: ${fieldList}.`
    : source === "settings-ui"
      ? `Settings updated voice settings: ${fieldList}.`
      : `Ambient updated voice settings: ${fieldList}.`;
}

async function regenerateMessageVoice(input: RegenerateMessageVoiceInput) {
  const host = requireProjectRuntimeHostForMessageVoiceState(input.messageId);
  const targetStore = host.store;
  const result = await regenerateMessageVoiceState({
    messageId: input.messageId,
    packageWorkspacePath: await resolveVoiceProviderWorkspacePath(voiceSettings.providerCapabilityId, targetStore),
    settings: voiceSettings,
    store: targetStore,
    runner: runAmbientCliPackageCommand,
    createMediaUrl: (mediaInput) => workspaceMediaServer.createUrl(mediaInput),
    summaryForThread: (thread) => {
      const provider = getAmbientProviderStatus(thread.model);
      return {
        model: thread.model,
        apiKey: readAmbientApiKey(),
        baseUrl: provider.baseUrl,
      };
    },
    onStateUpdated: () => emitProjectStateIfActive(host),
  });
  await enforceVoiceArtifactBudget(targetStore.getThread(result.threadId).workspacePath, targetStore);
  emitProjectStateIfActive(host);
  return result;
}

function resolveManagedVoiceArtifactPath(audioPath: string, workspacePath = activeWorkspacePath()): string {
  const normalized = audioPath.replace(/\\/g, "/");
  if (!normalized.startsWith(".ambient/voice/")) {
    throw new Error("Voice artifact is not in Ambient's managed voice directory.");
  }
  return resolveWorkspacePath(workspacePath, normalized);
}

function revealMessageVoiceArtifact(input: MessageVoiceArtifactInput): void {
  const host = requireProjectRuntimeHostForMessageVoiceState(input.messageId);
  const voiceState = host.store.getMessageVoiceState(input.messageId);
  if (!voiceState?.audioPath) throw new Error(`Voice artifact not found for message: ${input.messageId}`);
  shell.showItemInFolder(resolveManagedVoiceArtifactPath(voiceState.audioPath, host.store.getWorkspace().path));
}

async function clearMessageVoiceArtifact(input: MessageVoiceArtifactInput) {
  const host = requireProjectRuntimeHostForMessageVoiceState(input.messageId);
  const voiceState = host.store.getMessageVoiceState(input.messageId);
  if (!voiceState?.audioPath) throw new Error(`Voice artifact not found for message: ${input.messageId}`);
  await rm(resolveManagedVoiceArtifactPath(voiceState.audioPath, host.store.getWorkspace().path), { force: true });
  const cleared = host.store.clearMessageVoiceArtifact(input.messageId);
  emitProjectStateIfActive(host);
  return cleared;
}

async function generatePlannerDurableArtifact(input: GeneratePlannerDurableArtifactInput) {
  const host = requireProjectRuntimeHostForPlannerPlanArtifact(input.artifactId);
  const targetStore = host.store;
  const current = targetStore.getPlannerPlanArtifact(input.artifactId);
  if (current.status !== "ready") throw new Error("Only ready planner plans can generate durable artifacts.");
  if (current.decisionQuestions.some((question) => question.required && !question.answer)) {
    throw new Error("Answer required planner decisions before generating a durable plan.");
  }
  const thread = targetStore.getThread(current.threadId);
  const projectArtifactWorkspacePath = targetStore.getProjectArtifactWorkspacePath();
  let artifact = targetStore.updatePlannerPlanArtifact(input.artifactId, { workflowState: "durable_generating" });
  emitPlannerPlanArtifactUpdated(artifact, targetStore);
  try {
    const durable = await writePlannerDurableHtmlArtifact({
      artifact,
      threadTitle: thread.title,
      workspacePath: projectArtifactWorkspacePath,
      browserValidator: validatePlannerDurableHtmlFileInBrowser,
    });
    artifact = targetStore.setPlannerPlanDurableArtifact(artifact.id, {
      path: durable.relativePath,
      generatedAt: durable.generatedAt,
      validation: durable.validation,
    });
    targetStore.promotePlannerDurableArtifactToBoardSource(artifact.id);
    await commitPlannerDurableArtifact(projectArtifactWorkspacePath, artifact, durable.manifestRelativePath, "Add durable plan");
    emitPlannerPlanArtifactUpdated(artifact, targetStore);
    emitProjectStateIfActive(host);
    return artifact;
  } catch (error) {
    if (error instanceof PlannerDurableHtmlValidationError) {
      try {
        const fallback = await writePlannerDurableHtmlArtifact({
          artifact,
          threadTitle: thread.title,
          workspacePath: projectArtifactWorkspacePath,
          browserValidator: validatePlannerDurableHtmlFileInBrowser,
          diagramMode: "deterministic",
          validationWarnings: plannerDurableFallbackWarnings(error.validation),
        });
        artifact = targetStore.setPlannerPlanDurableArtifact(artifact.id, {
          path: fallback.relativePath,
          generatedAt: fallback.generatedAt,
          validation: fallback.validation,
          workflowState: "durable_ready_with_fallbacks",
        });
        targetStore.promotePlannerDurableArtifactToBoardSource(artifact.id);
        await commitPlannerDurableArtifact(projectArtifactWorkspacePath, artifact, fallback.manifestRelativePath, "Add durable plan");
        emitPlannerPlanArtifactUpdated(artifact, targetStore);
        emitProjectStateIfActive(host);
        return artifact;
      } catch (fallbackError) {
        const failed =
          fallbackError instanceof PlannerDurableHtmlValidationError
            ? targetStore.setPlannerPlanDurableArtifactValidation(artifact.id, fallbackError.validation, "failed")
            : targetStore.updatePlannerPlanArtifact(artifact.id, { workflowState: "failed" });
        emitPlannerPlanArtifactUpdated(failed, targetStore);
        emitProjectStateIfActive(host);
        throw fallbackError;
      }
    }
    const failed = targetStore.updatePlannerPlanArtifact(artifact.id, { workflowState: "failed" });
    emitPlannerPlanArtifactUpdated(failed, targetStore);
    emitProjectStateIfActive(host);
    throw error;
  }
}

async function commitPlannerDurableArtifact(
  workspacePath: string,
  artifact: PlannerPlanArtifact,
  manifestRelativePath: string,
  action: "Add durable plan" | "Revise durable plan",
): Promise<void> {
  if (!artifact.durableArtifactPath) return;
  const title = artifact.title.trim() || "Planner durable artifact";
  try {
    await commitGitPaths(workspacePath, {
      paths: [artifact.durableArtifactPath, manifestRelativePath],
      message: `${action}: ${title}`.slice(0, 180),
      force: true,
    });
  } catch (error) {
    console.warn(`[planner] Failed to commit durable plan artifact: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function voiceArtifactRetentionInput(input: VoiceArtifactRetentionInput = {}, host = input.threadId ? requireProjectRuntimeHostForThread(input.threadId) : requireActiveProjectRuntimeHost()) {
  const targetStore = host.store;
  const threadId = input.threadId ?? activeThreadIdForHost(host);
  const thread = targetStore.getThread(threadId);
  return {
    workspacePath: thread.workspacePath,
    threadId,
    providerCapabilityId: input.providerCapabilityId,
    voiceStates: targetStore.listMessageVoiceStates(threadId),
  };
}

function inspectVoiceArtifacts(input: VoiceArtifactRetentionInput = {}, host = input.threadId ? requireProjectRuntimeHostForThread(input.threadId) : requireActiveProjectRuntimeHost()) {
  return inspectVoiceArtifactRetention(voiceArtifactRetentionInput(input, host));
}

async function pruneVoiceArtifacts(input: VoiceArtifactRetentionInput = {}, host = input.threadId ? requireProjectRuntimeHostForThread(input.threadId) : requireActiveProjectRuntimeHost()) {
  const pruned = await pruneVoiceArtifactOrphans(voiceArtifactRetentionInput(input, host));
  clearVoiceStatesForDeletedArtifacts(pruned.deletedPreview, "Voice artifact cache removed this audio file.", host.store);
  emitProjectStateIfActive(host);
  return pruned;
}

function voiceArtifactCacheMaxBytes(): number {
  return Math.max(0, Math.floor(voiceSettings.artifactCacheMaxMb ?? DEFAULT_VOICE_SETTINGS.artifactCacheMaxMb) * 1024 * 1024);
}

async function clearManagedVoiceArtifactCache(reason: string, workspacePath = activeWorkspacePath(), targetStore: ProjectStore = store): Promise<void> {
  try {
    const result = await clearManagedVoiceArtifacts(workspacePath);
    clearVoiceStatesForDeletedArtifacts(result.deletedPreview, `Voice artifact cache cleared on ${reason}.`, targetStore);
    if (result.deletedFileCount > 0 && mainWindow && activeThreadId) emitRuntimeFeatureStateUpdated(targetStore);
  } catch (error) {
    console.warn(`Failed to clear managed voice artifact cache on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function clearImportedWorkspaceContextCache(reason: string, workspacePaths = knownWorkspaceContextPaths()): Promise<void> {
  await Promise.all(
    workspacePaths.map(async (workspacePath) => {
      try {
        await clearImportedWorkspaceContext(workspacePath);
      } catch (error) {
        console.warn(`Failed to clear imported workspace context on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
  );
}

function clearImportedWorkspaceContextCacheSync(reason: string, workspacePaths = knownWorkspaceContextPaths()): void {
  for (const workspacePath of workspacePaths) {
    try {
      clearImportedWorkspaceContextSync(workspacePath);
    } catch (error) {
      console.warn(`Failed to clear imported workspace context on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function knownWorkspaceContextPaths(): string[] {
  const stores = projectRuntimeHostList().map((host) => host.store);
  if (stores.length === 0 && store) stores.push(store);
  return Array.from(
    new Set(
      stores.flatMap((targetStore) => {
        const workspace = targetStore.getWorkspaceIfOpen();
        if (!workspace) return [];
        return [
          workspace.path,
          ...targetStore.listThreads().map((thread) => thread.workspacePath),
        ];
      }),
    ),
  );
}

function clearManagedVoiceArtifactCacheSync(reason: string, workspacePath: string, targetStore: ProjectStore = store): void {
  try {
    const deletedPaths = clearManagedVoiceArtifactsSync(workspacePath);
    clearVoiceStatesForDeletedArtifacts(deletedPaths, `Voice artifact cache cleared on ${reason}.`, targetStore);
  } catch (error) {
    console.warn(`Failed to clear managed voice artifact cache on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function clearManagedVoiceArtifactCachesForRuntimeHostsSync(reason: string): void {
  const hosts = projectRuntimeHostList();
  if (hosts.length === 0) {
    const workspacePath = store?.getWorkspaceIfOpen()?.path;
    if (workspacePath) clearManagedVoiceArtifactCacheSync(reason, workspacePath, store);
    return;
  }
  for (const host of hosts) clearManagedVoiceArtifactCacheSync(reason, host.workspacePath, host.store);
}

async function enforceVoiceArtifactBudget(workspacePath = activeWorkspacePath(), targetStore: ProjectStore = store): Promise<void> {
  try {
    const result = await pruneManagedVoiceArtifactsToBudget({ workspacePath, maxBytes: voiceArtifactCacheMaxBytes() });
    clearVoiceStatesForDeletedArtifacts(result.deletedPreview, "Voice artifact cache limit removed this audio file.", targetStore);
    if (result.deletedFileCount > 0 && mainWindow && activeThreadId) emitRuntimeFeatureStateUpdated(targetStore);
  } catch (error) {
    console.warn(`Failed to enforce managed voice artifact cache budget: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function clearVoiceStatesForDeletedArtifacts(deletedPaths: string[], error: string, targetStore: ProjectStore = store): void {
  if (deletedPaths.length === 0) return;
  const deleted = new Set(deletedPaths.map(normalizeManagedVoiceArtifactReference));
  for (const thread of targetStore.listThreads()) {
    for (const voiceState of targetStore.listMessageVoiceStates(thread.id)) {
      if (!voiceState.audioPath || !deleted.has(normalizeManagedVoiceArtifactReference(voiceState.audioPath))) continue;
      targetStore.clearMessageVoiceArtifact(voiceState.messageId, error);
    }
  }
}

function normalizeManagedVoiceArtifactReference(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function recordWorkflowRevisionDecisionInChat(
  revision: WorkflowRevisionSummary,
  decision: ResolveWorkflowRevisionInput["decision"],
  targetStore: ProjectStore = store,
): void {
  const thread = targetStore.getWorkflowAgentThreadSummary(revision.workflowThreadId);
  if (!thread.chatThreadId) return;
  const versionLabel = thread.latestVersion ? `version ${thread.latestVersion.version}` : "the current workflow version";
  const content =
    decision === "applied"
      ? `Applied workflow revision ${revision.id}. The active workflow now points at ${versionLabel}.`
      : `Rejected workflow revision ${revision.id}. The workflow remains on ${versionLabel}.`;
  targetStore.addMessage({
    threadId: thread.chatThreadId,
    role: "system",
    content,
    metadata: {
      workflowThreadId: revision.workflowThreadId,
      workflowMode: "plan-edit",
      kind: "workflow_revision_decision",
      status: "done",
      revisionId: revision.id,
      decision,
      versionId: thread.latestVersion?.id,
      version: thread.latestVersion?.version,
    },
  });
}

function registerIpc(): void {
  registerMainIpc({
    AMBIENT_KEYS_URL,
    AmbientWorkflowExplorationProvider,
    AmbientWorkflowLabJudgeProvider,
    acceptMcpToolDescriptorReviewForDesktop,
    activeGitContextForProjectHost,
    activeHost,
    activeThreadId,
    activeThreadIdForHost,
    activeVoiceSttContextForProjectHost,
    activeWorkflowRunController: activeWorkflowRunRegistry.activeWorkflowRunController,
    activeWorkflowRunHost: activeWorkflowRunRegistry.activeWorkflowRunHost,
    activeWorkspaceFileContextForProjectHost,
    allPluginMcpRuntimeSnapshots,
    ambientCliCapabilityGrantsForWorkflowRequest,
    ambientMcpInstallPreview,
    ambientRetryPolicyFromCurrentSettings,
    ambientRetryPolicyFromSettings,
    analyzeMiniCpmVision,
    answerWorkflowDiscoveryQuestion,
    app,
    archiveProjectChats,
    assertTrustedMainWindowIpc,
    attachWorktreeForThread,
    browserLoginBrokerEnabled,
    buildContainerRuntimeInstallPlanFromProbe,
    buildWorkflowDebugRewriteContext,
    buildWorkflowDebugRewritePromptSection,
    buildWorkflowRecoveryPlan,
    cancelSttTranscription,
    classifyToolPermission,
    clearAgentMemory,
    disableAgentMemoryStarter,
    enableAgentMemoryStarter,
    getAgentMemoryDiagnostics,
    getAgentMemoryStarterStatus,
    repairAgentMemoryStarter,
    runAgentMemoryEmbeddingLifecycleAction,
    clearMessageVoiceArtifact,
    clearPiExtensionSandboxHistory,
    clearPiPrivilegedPackageHistory,
    clearSavedAmbientApiKey,
    clipboard,
    codexPluginTrustFingerprint,
    collectVoiceOnboardingHostFacts,
    commitGit,
    compileWorkflowArtifact,
    createAndRecordCheckpoint,
    createChatExportBundle,
    createChatPdfExport: (
      store: ProjectStore,
      threadId: string,
      options: { appName: string; appVersion: string },
    ) => createChatPdfExport(store, threadId, {
      ...options,
      renderHtmlToPdf: createElectronPrintToPdfRenderer(BrowserWindow),
    }),
    createDiagnosticBundle,
    createGitBranch,
    createMainDiagnosticSource,
    createMcpInstallCatalog,
    createPermanentWorktree,
    createPrivilegedActionAdapter,
    createPullRequestUrl,
    createWorkflowDebugRewriteRevision,
    createWorkflowDiscoveryProvider,
    createWorkflowSampleArtifact,
    currentFeatureFlagSnapshot,
    describeWorkflowDiscoveryCapability,
    describeWorkspaceAbsoluteContextPaths,
    describeWorkspaceContextReferences,
    desktopUpdateService,
    dialog,
    disablePiPrivilegedPackage,
    discardGitFile,
    discoverAmbientCliPackages,
    discoverCapabilityBuilderHistory,
    discoverPiExtensionSandboxPackages,
    discoverPiPrivilegedPackages,
    disposeProjectRuntimeHost,
    emitBrowserStateForHost,
    emitMainWindowDesktopEvent,
    emitOrchestrationUpdated,
    emitPermissionAuditCreated,
    emitPermissionGrantCreated,
    emitPermissionGrantRevoked,
    emitPlannerPlanArtifactUpdated,
    emitPluginCatalogUpdated,
    emitProjectScopedEvent,
    emitProjectStateIfActive,
    emitRuntimeFeatureStateUpdated,
    emitThreadUpdated,
    emitWorkflowEvent,
    emitWorkflowRecordingLibraryStateChanged,
    emitWorkflowUpdated,
    ensureProjectRuntimeHostForWorkspacePath,
    ensureWorkflowPluginTrusted,
    executeContainerRuntimeManagedInstallAction,
    existsSync,
    fetchGit,
    firstPartyWorkflowConnectorAccountAuthorizer,
    firstPartyWorkflowConnectorDescriptors,
    firstPartyWorkflowConnectorRegistrations,
    forgetActiveWorkflowRunsForController: activeWorkflowRunRegistry.forgetActiveWorkflowRunsForController,
    formatPiExtensionSandboxInstallApprovalDetail,
    formatPiPrivilegedInstallApprovalDetail,
    formatPiResourceCountsForPermission,
    generatePlannerDurableArtifact,
    getAmbientProviderStatus,
    getAppLogs,
    getWorkspaceDiff,
    getWorkspaceGitStatus,
    googleWorkspaceCliInstaller,
    googleWorkspaceSetupService,
    handleIpc,
    hydrateSearchRoutingSettingsForActiveWorkspace,
    importDiagnosticBundleFromFile,
    initialActiveThreadIdForStore,
    initializeGitRepository,
    inspectVoiceArtifacts,
    installMcpDefaultCapabilityForDesktop,
    installMcpRegistryServerForDesktop,
    installModelProviderEndpoint,
    installPiExtensionSandboxPackage,
    installPiPrivilegedPackage,
    invokeWorkflowNativeTool,
    isActiveProjectRuntimeHost,
    isGoogleWorkspaceSetupUrl,
    isLoopbackWebUrl,
    join,
    launchContainerRuntimeInstallAction,
    listGlobalWorkflowAgentFolders,
    listGlobalWorkflowRecordingLibrary,
    listLocalDeepResearchRunsForSettings,
    listManagedDevServers,
    listSttProvidersWithValidation,
    listVoiceProvidersWithCachedVoices,
    listWorkspaceFiles,
    listWorkspaceOpenTargets,
    mainWindow,
    markStaleWorkflowRunForRecoveryIfNeeded,
    mcpContainerRuntimeSetupStatePath,
    mkdirSync,
    normalizeWorkspacePath,
    officePreviewService,
    openAllowedExternalUrl,
    openContainerRuntimeApplication,
    openGoogleWorkspaceUrl,
    openRendererLocalUrlInAmbientBrowser,
    openThreadMiniWindow,
    openWorkspaceTarget,
    packageJson,
    parseExternalOpenUrl,
    parseThreadPermissionModeChange,
    parseThreadSettingsUpdate,
    permanentWorktreeBranchName,
    permissionGrantTargetHash,
    permissionGrantWorkspacePath,
    permissionModeChangeAuditDetail,
    permissions,
    pluginHost,
    pluginMcpRegistrationsForThread,
    pluginStateReaderForStore,
    prepareAndRecordNextOrchestrationRuns,
    prepareWorktreeForThread,
    previewPiExtensionSandboxInstall,
    privilegedActionAdapterSelectionFromEnv,
    privilegedCredentials,
    probeAmbientMcpContainerRuntimeStatus,
    probeContainerRuntime,
    projectRegistry,
    projectBoardDesktopIpcDependencies: createProjectBoardDesktopIpcDependencies({
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      requireProjectRuntimeHostForOrchestrationTask,
      requireProjectRuntimeHostForPlannerPlanArtifact,
      scheduleAutoDispatch,
      setProjectHostActiveThreadId,
    }),
    projectRuntimeHostForTerminal,
    projectRuntimeHostForWorkflowRun,
    projectRuntimeHostForWorkspacePath,
    pruneVoiceArtifacts,
    pullGit,
    pushGit,
    readActiveLocalFilePreview,
    readActiveWorkspaceFile,
    readAmbientApiKey,
    readAmbientPluginRegistry,
    readAutoDispatchStatus,
    readCodexHostedMarketplaceReport,
    readCodexPluginCatalog,
    readCurrentOrchestrationBoard,
    readFirstPartyGoogleIntegration,
    readGitReviewForProjectHost,
    readOrchestrationWorkflowReadiness,
    readState,
    readStateForProjectHostAction,
    readWorkflowDashboard,
    readWorkflowRunDetail,
    recordActiveProjectBoardExecutionReadinessBlocker,
    recordBrowserControlAudit,
    recordBrowserProfileAudit,
    recordContainerRuntimeDeferred,
    recordContainerRuntimeInstallLaunched,
    recordWorkflowRevisionDecisionInChat,
    redactGoogleWorkspaceSetupState,
    refreshGoogleWorkspaceConnectorMode,
    refreshVoiceProviderCatalog,
    regenerateMessageVoice,
    rememberActiveWorkflowRun: activeWorkflowRunRegistry.rememberActiveWorkflowRun,
    rendererLocalPreviewServers,
    repairProjectBoardWorkflow,
    requestPermissionWithGrantRegistry,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForAutomationSchedule,
    requireProjectRuntimeHostForAutomationScheduleTarget,
    requireProjectRuntimeHostForAutomationThread,
    requireProjectRuntimeHostForCallableWorkflowTask,
    requireProjectRuntimeHostForOrchestrationRun,
    requireProjectRuntimeHostForOrchestrationTask,
    requireProjectRuntimeHostForOrchestrationWorkspace,
    requireProjectRuntimeHostForPermissionGrant,
    requireProjectRuntimeHostForPermissionGrantInput,
    requireProjectRuntimeHostForPlannerPlanArtifact,
    requireProjectRuntimeHostForSubagentRun,
    requireProjectRuntimeHostForSubagentWaitBarrier,
    requireProjectRuntimeHostForThread,
    requireProjectRuntimeHostForThreadAction,
    requireProjectRuntimeHostForWorkflowArtifact,
    requireProjectRuntimeHostForWorkflowLabRun,
    requireProjectRuntimeHostForWorkflowRecording,
    requireProjectRuntimeHostForWorkflowRevision,
    requireProjectRuntimeHostForWorkflowRun,
    requireProjectRuntimeHostForWorkflowThread,
    requireProjectRuntimeHostForWorkflowVersion,
    resetProjectRuntimeAndPluginServers,
    resetRuntimeAndPluginServers,
    resolveLocalFilePath,
    resolveRegisteredProjectPathForHost,
    resolveSubagentApprovalDecision,
    resolveWorkflowApproval,
    resolveWorkflowDiscoveryAccessRequest,
    resolveWorkspacePathForOpen,
    restartProjectRuntimeMcpRuntime,
    restoreLatestGitCheckpoint,
    restoreWorkflowVersion,
    revalidateWorkflowArtifact,
    revealMessageVoiceArtifact,
    reviewFinishedProjectBoardRun,
    reviewWorkflowArtifact,
    revokePluginGrantsForLabels,
    runLocalModelRuntimeLifecycleAction,
    runWorkflowArtifact,
    runWorkflowLab,
    runWorkflowThreadExploration,
    saveAmbientApiKey,
    saveAmbientCliPackageEnvSecret,
    saveCapabilityBuilderEnvSecret,
    saveMcpServerEnvSecret,
    saveModelProviderCredential,
    saveSttTestAudio,
    scanPiPrivilegedPackage,
    searchRoutingSettings,
    searchWorkflowDiscoveryCapabilities,
    searchWorkspace,
    secureInputs,
    selectAmbientCliPackageForSecret,
    setAutoDispatchEnabled,
    setProjectHostActiveThreadId,
    setSttTtsSpeaking,
    setThemePreference,
    setupLocalDeepResearch,
    setupMiniCpmVision,
    setupSttProvider,
    shell,
    stageAllGitFiles,
    stageGitFile,
    startPreparedOrchestrationRun,
    startWorkflowDiscovery,
    startWorkflowRevisionDiscovery,
    stopManagedDevServer,
    stopProjectRuntimeMcpRuntime,
    store,
    switchWorkspace,
    switchWorkspaceBranch,
    terminalStartTokens,
    testAmbientApiKey,
    threadWorkingDirectory,
    transcribeSttAudio,
    uninstallMcpServerForDesktop,
    uninstallPiExtensionSandboxPackage,
    uninstallPiPrivilegedPackage,
    unstageAllGitFiles,
    unstageGitFile,
    updateFeatureFlagSettings,
    updateMemorySettings,
    updateLocalDeepResearchSettings,
    updateMediaPlaybackSettings,
    updateModelRuntimeSettings,
    updatePlannerSettings,
    updateProjectBoardWorkflowRaw,
    updateProjectBoardWorkflowSettings,
    updateSearchRoutingSettings,
    updateSttSettings,
    updateThinkingDisplaySettings,
    updateVoiceSettings,
    updateWorkflowArtifactSource,
    updateWorkflowConnectorGrant,
    withBrowserState,
    workflowAgentControlThread,
    workflowAgentIpcContextForDiscoveryQuestion,
    workflowAgentIpcContextForWorkflowThread,
    workflowArtifactIpcContext,
    workflowArtifactIpcContextForHost,
    workflowCompileIpcContext,
    workflowDebugRewriteIpcContext,
    workflowDebugRewriteUserRequest,
    workflowDiscoveryPolicyContextForCapabilityLookup,
    workflowProjectIpcContext,
    workflowToolDescriptorsFromPluginRegistry,
    workspaceInventoryConnector,
    workspacePathForRelativeArtifactPath,
    workspaceStateForThread,
    writeContainerRuntimeManagedInstallRedactedLog,
    writeFile,
    writePrivilegedActionRedactedLog,
  });
}

function setDockIcon(iconPath: string | undefined): void {
  if (process.platform === "darwin" && iconPath) {
    app.dock?.setIcon(iconPath);
  }
}

app.setName("Ambient Desktop");
if (process.env.AMBIENT_E2E_USER_DATA && !app.isReady()) {
  mkdirSync(process.env.AMBIENT_E2E_USER_DATA, { recursive: true });
  app.setPath("userData", process.env.AMBIENT_E2E_USER_DATA);
}

export async function startAmbientDesktopApp(): Promise<void> {
  await startApp();
}

async function startApp(): Promise<void> {
  const userDataPath = app.getPath("userData");
  const migration = migrateAmbientUserData({
    currentUserDataPath: userDataPath,
    legacyUserDataPaths: ambientLegacyUserDataPaths(userDataPath),
  });
  if (migration.importedProjectPaths.length > 0 || migration.copiedFiles.length > 0) {
    console.log(
      `[startup] Migrated Ambient Desktop user data: ${migration.importedProjectPaths.length} project path(s), ${migration.copiedFiles.length} file(s).`,
    );
  }
  applyThemePreference(await readThemePreference(appearancePreferencesPath()));
  mediaPlaybackSettings = await readMediaPlaybackSettings(appearancePreferencesPath());
  thinkingDisplaySettings = await readThinkingDisplaySettings(appearancePreferencesPath());
  plannerSettings = await readPlannerSettings(appearancePreferencesPath());
  localDeepResearchSettings = await readLocalDeepResearchSettings(appearancePreferencesPath());
  searchRoutingSettings = await readSearchRoutingSettings(appearancePreferencesPath());
  voiceSettings = await readVoiceSettings(appearancePreferencesPath());
  sttSettings = await readSttSettings(appearancePreferencesPath());
  nativeTheme.on("updated", publishAppearanceUpdated);
  const googleOAuthProviders = googleWorkspaceOAuthProvidersFromEnv(process.env);
  googleWorkspaceCliInstaller = new GoogleWorkspaceCliInstaller({
    toolsRoot: join(userDataPath, "tools"),
  });
  officePreviewService = new OfficePreviewService({
    cacheRoot: join(userDataPath, "office-previews"),
    env: process.env,
  });
  googleWorkspaceCliAdapter = new GoogleWorkspaceCliAdapter({
    appUserDataPath: userDataPath,
    env: process.env,
    managedBinaryPath: () => googleWorkspaceCliInstaller.binaryPath(),
    onDiagnostic: (entry) => {
      const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
      console[entry.level === "error" ? "error" : entry.level === "warning" ? "warn" : "log"](`[google-gws] ${entry.message}${details}`);
    },
  });
  refreshGoogleWorkspaceConnectorMode();
  googleWorkspaceSetupService = new GoogleWorkspaceSetupService({
    adapter: googleWorkspaceCliAdapter,
    accountsPath: join(userDataPath, "google-workspace-cli", "accounts.json"),
    env: process.env,
    openExternal: openGoogleWorkspaceUrl,
  });
  await googleWorkspaceSetupService.loadAccounts();
  googleWorkspaceMethodBroker = new GoogleWorkspaceMethodBroker(googleWorkspaceCliAdapter, {
    resolveAccountHint: (accountHint) => googleWorkspaceSetupService.resolveAccountHintForCall(accountHint),
  });
  pluginAuthService = new PluginAuthService({
    providers: googleOAuthProviders,
    tokenVault: new SafeStorageWorkflowConnectorTokenVault(join(userDataPath, "plugin-auth", "tokens.json"), safeStorage),
  });
  if (googleWorkspaceConnectorMode === "ambient_oauth") {
    googleSidecarSupervisor = new GoogleSidecarSupervisor({
      appRoot: process.cwd(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      onDiagnostic: (entry) => {
        const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
        console[entry.level === "error" ? "error" : entry.level === "warning" ? "warn" : "log"](`[google-sidecar] ${entry.message}${details}`);
      },
    });
  }
  pluginHost = new AmbientPluginHost({
    pluginAuth: pluginAuthService,
  });
  app.setAboutPanelOptions({
    applicationName: "Ambient Desktop",
    applicationVersion: app.getVersion(),
    version: `Electron ${process.versions.electron ?? "unknown"}`,
    website: "https://ambient.xyz",
    credits: thirdPartyCredits()
      .map(thirdPartyCreditAboutText)
      .join("\n\n"),
  });
  projectRegistry = new ProjectRegistry(join(userDataPath, "projects.json"));
  setDockIcon(resolveAppIconPath());
  registerIpc();
  registerWorkspaceMediaProtocol(protocol, workspaceMediaServer);
  await createWindow();
  startPostWindowStartupLifecycle();
}

installShutdownHandlers();
