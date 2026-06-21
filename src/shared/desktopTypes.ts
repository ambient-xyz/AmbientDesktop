import type { AmbientModelRuntimeCatalog } from "./ambientModels";
import type { AgentMemorySettings, UpdateAgentMemorySettingsInput } from "./agentMemorySettings";
import type { SearchRoutingSettings } from "./webResearchTypes";
export type * from "./webResearchTypes";
import type {
  BrokerNamedSecretUseInput,
  BrokerNamedSecretUseResult,
  DeleteNamedSecretInput,
  NamedSecretMetadataExport,
  NamedSecretSummary,
  SaveNamedSecretInput,
  UpdateNamedSecretInput,
} from "./namedSecretTypes";
import type { SecureStorageRepairGuidance, SecureStorageStatus } from "./secureStorageTypes";
import type {
  AgentMemoryClearResult,
  AgentMemoryClearInput,
  AgentMemoryEmbeddingLifecycleActionInput,
  AgentMemoryEmbeddingLifecycleActionResult,
  AgentMemoryStorageDiagnostics,
} from "./agentMemoryDiagnostics";
import type {
  AgentMemoryStarterDisableInput,
  AgentMemoryStarterEnableInput,
  AgentMemoryStarterOperationResult,
  AgentMemoryStarterRepairInput,
  AgentMemoryStarterStatus,
} from "./agentMemoryStarter";
import type {
  AutomationFolderSummary,
  AutomationScheduleExceptionSummary,
  AutomationScheduleOccurrenceActionInput,
  AutomationScheduleOccurrenceActionResult,
  AutomationScheduleSummary,
  CreateAutomationFolderInput,
  CreateAutomationScheduleInput,
  MoveAutomationThreadInput,
  UpdateAutomationScheduleInput,
} from "./automationTypes";
import type {
  BrowserCapabilityState,
  BrowserContentInput,
  BrowserCredentialSummary,
  BrowserKeypressInput,
  BrowserKeypressResult,
  BrowserLocalPreviewInput,
  BrowserLocalPreviewResult,
  BrowserNavigateInput,
  BrowserPageContent,
  BrowserPickInput,
  BrowserPickResult,
  BrowserRevealInput,
  BrowserRevealResult,
  BrowserScreenshotResult,
  BrowserSearchInput,
  BrowserSearchResult,
  BrowserStartInput,
  BrowserViewBoundsInput,
  DeleteBrowserCredentialInput,
  SaveBrowserCredentialInput,
} from "./browserTypes";
import type { DiagnosticExportResult } from "./diagnosticTypes";
import type { AmbientFeatureFlagSettings, AmbientFeatureFlagSnapshot, UpdateFeatureFlagSettingsInput } from "./featureFlags";
import type {
  LocalDeepResearchInstallProgress,
  LocalDeepResearchRunBudget,
  LocalDeepResearchRunHistoryInput,
  LocalDeepResearchRunHistoryResult,
  LocalDeepResearchSettings,
  LocalDeepResearchSetupInput,
  LocalDeepResearchSetupResult,
  LocalModelRuntimeLifecycleActionInput,
  LocalModelRuntimeLifecycleActionResult,
  MediaPlaybackSettings,
  MessageVoiceArtifactInput,
  MessageVoiceState,
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionAnalyzeInput,
  MiniCpmVisionSetupInput,
  MiniCpmVisionSetupResult,
  RefreshVoiceProviderVoicesInput,
  RefreshVoiceProviderVoicesResult,
  RegenerateMessageVoiceInput,
  SetSttTtsSpeakingInput,
  SttDiagnosticSummary,
  SttMessageMetadata,
  SttProviderCandidate,
  SttProviderSetupInput,
  SttProviderSetupResult,
  SttQueueState,
  SttSettings,
  SttTestAudioInput,
  SttTestAudioResult,
  SttTranscribeAudioInput,
  SttTranscribeAudioResult,
  VoiceArtifactPruneResult,
  VoiceArtifactRetentionInput,
  VoiceArtifactRetentionSummary,
  VoiceOnboardingHostFacts,
  VoiceProviderCandidate,
  VoiceSettings,
  VoiceSettingsAuditEntry,
} from "./localRuntimeTypes";
import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionAuditEntry,
  PermissionMode,
  PermissionPromptResponseMode,
  PermissionRequest,
  PrivilegedCredentialPromptResponseInput,
  PrivilegedCredentialRequest,
  RevokeAmbientPermissionGrantInput,
  SecureInputPromptResponseInput,
  SecureInputRequest,
} from "./permissionTypes";
import type {
  AnswerPlannerDecisionQuestionInput,
  GeneratePlannerDurableArtifactInput,
  PlannerPlanArtifact,
  PlannerPlanArtifactStatus,
  PlannerPlanWorkflowState,
  PlannerSettings,
} from "./plannerTypes";
import type {
  AddCodexMarketplaceInput,
  AmbientCliSecretSaveResult,
  AmbientMcpContainerRuntimeInstallLaunchInput,
  AmbientMcpContainerRuntimeInstallLaunchResult,
  AmbientMcpContainerRuntimeManagedInstallProgress,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  AmbientMcpDefaultCapabilityInstallProgress,
  AmbientMcpInstalledServerSummary,
  AmbientMcpInstallPreview,
  AmbientMcpServerDescribeInput,
  AmbientMcpServerInstallInput,
  AmbientMcpServerInstallResult,
  AmbientMcpServerSearchInput,
  AmbientMcpServerSearchResult,
  AmbientMcpServerUninstallInput,
  AmbientMcpServerUninstallResult,
  AmbientMcpToolReviewAcceptInput,
  AmbientMcpToolReviewAcceptResult,
  AmbientPluginAuthAccountSummary,
  AmbientPluginAuthStartResult,
  AmbientPluginCapabilityDiagnostics,
  AmbientPluginCapabilitySummary,
  AmbientPluginRegistry,
  CapabilityBuilderHistoryInput,
  CapabilityBuilderHistoryResult,
  CodexHostedMarketplaceReport,
  CodexPluginCatalog,
  CodexPluginDependencyInstallResult,
  CodexPluginMcpInspectionCatalog,
  CodexPluginSummary,
  CompletePluginAppAuthInput,
  FirstPartyGoogleIntegrationState,
  GetAmbientPluginCapabilityDiagnosticsInput,
  GoogleWorkspaceCliInstallState,
  GoogleWorkspaceOAuthClientImportInput,
  GoogleWorkspaceSetupInput,
  GoogleWorkspaceSetupState,
  GoogleWorkspaceValidationInput,
  GoogleWorkspaceValidationResult,
  ImportCodexPluginInput,
  InstallCodexPluginDependenciesInput,
  InstallPiExtensionSandboxPackageInput,
  InstallPiPackageInput,
  InstallPiPrivilegedPackageInput,
  ListAmbientPluginRuntimeCapabilitiesInput,
  ManagedDevServerSummary,
  ModelProviderCredentialSaveResult,
  PiExtensionSandboxCatalog,
  PiExtensionSandboxInstallPreview,
  PiPackageCatalog,
  PiPackageInstallPreview,
  PiPrivilegedCatalog,
  PiPrivilegedPackageActionInput,
  PiPrivilegedSecurityScan,
  PluginAuthAccountActionInput,
  PluginMcpRuntimeActionInput,
  PluginMcpRuntimeSnapshot,
  PreviewPiExtensionSandboxPackageInput,
  PreviewPiPackageInstallInput,
  ReadCodexPluginInput,
  RemoveCodexMarketplaceInput,
  SaveAmbientCliSecretInput,
  ScanPiPrivilegedPackageInput,
  SetCodexPluginEnabledInput,
  SetCodexPluginTrustedInput,
  SetPiPackageEnabledInput,
  StartPluginAppAuthInput,
  StopManagedDevServerInput,
  UninstallCodexPluginInput,
  UninstallPiExtensionSandboxPackageInput,
  UninstallPiPackageInput,
  UninstallPiPrivilegedPackageInput,
} from "./pluginTypes";
import type {
  AddProjectBoardCardRunFeedbackInput,
  AnswerProjectBoardQuestionInput,
  AnswerProjectBoardSynthesisProposalQuestionInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  ApplyProjectBoardSynthesisProposalInput,
  ApproveProjectBoardCardInput,
  AttachProjectBoardLocalTaskInput,
  CancelProjectBoardRevisionInput,
  CopyProjectBoardSessionToThreadInput,
  CreateProjectBoardCardInput,
  CreateProjectBoardInput,
  CreateReadyProjectBoardTasksInput,
  DeferProjectBoardSynthesisSectionsInput,
  FinalizeProjectBoardKickoffInput,
  PauseProjectBoardSynthesisInput,
  ProjectBoardCanonicalProjectionDogfoodResult,
  ProjectBoardDeliverableIntegrationDogfoodResult,
  ProjectBoardGitCardClaimInput,
  ProjectBoardGitCardClaimReleaseInput,
  ProjectBoardGitSyncInput,
  ProjectBoardGitSyncStatus,
  ProjectBoardProofJudgmentDogfoodResult,
  ProjectSummary,
  PromotePlannerPlanToBoardInput,
  RecomputeProjectBoardProofCoverageInput,
  RefineProjectBoardSynthesisInput,
  RefreshProjectBoardDecisionDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  RefreshProjectBoardSourcesInput,
  RegenerateProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardSourceDraftsInput,
  RerunProjectBoardProofInput,
  ResetProjectBoardInput,
  ResolveProjectBoardCardPiUpdateInput,
  ResolveProjectBoardDeliverableIntegrationInput,
  ResolveProjectBoardProofDecisionInput,
  ResolveProjectBoardSplitDecisionInput,
  RetryProjectBoardSynthesisInput,
  ReviewProjectBoardSynthesisProposalCardInput,
  ReviseProjectBoardInput,
  SeedProjectBoardCanonicalProjectionDogfoodInput,
  SeedProjectBoardDeliverableIntegrationDogfoodInput,
  SeedProjectBoardProofJudgmentDogfoodInput,
  SeedProjectBoardSemanticIdleDogfoodInput,
  SplitProjectBoardCardInput,
  SuggestProjectBoardClarificationDefaultsInput,
  SuggestProjectBoardKickoffDefaultsInput,
  SuggestProjectBoardProofInput,
  UpdateProjectBoardCardCandidateInput,
  UpdateProjectBoardCardInput,
  UpdateProjectBoardSourceInput,
  UpdateProjectBoardStatusInput,
} from "./projectBoardTypes";
import type {
  SendMessageSlashCommandComposerIntent,
  SlashCommandDescribeInput,
  SlashCommandDescription,
  SlashCommandSearchInput,
  SlashCommandSearchResponse,
} from "./slashCommandTypes";
import type { SubagentMaturityEvidence, SubagentMaturitySnapshot } from "./subagentMaturity";
import type {
  CancelSubagentRunInput,
  CloseSubagentRunInput,
  ResolveSubagentApprovalInput,
  ResolveSubagentWaitBarrierInput,
  SubagentApprovalResolutionResult,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRepairDiagnosticsReport,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierResolutionResult,
  SubagentWaitBarrierSummary,
} from "./subagentTypes";
import type { SymphonyWorkflowPatternId } from "./symphonyWorkflowRecipes";
import type {
  RequestTerminalStartInput,
  ResizeTerminalInput,
  StartTerminalInput,
  StopTerminalInput,
  SubmitTerminalCommandInput,
  TerminalControlInput,
  TerminalSession,
  TerminalStartIntent,
} from "./terminalTypes";
import type {
  AmbientCompactionSettings,
  ChatMessage,
  CollaborationMode,
  ContextUsageSnapshot,
  ExportChatInput,
  ExportChatPdfInput,
  ExportChatPdfResult,
  ExportChatResult,
  InstallModelProviderEndpointInput,
  InstallModelProviderEndpointResult,
  MessageDelivery,
  ModelRuntimeSettings,
  QueueState,
  RunStatus,
  RuntimeActivity,
  SaveModelProviderCredentialInput,
  ThinkingLevel,
  ThreadGoal,
  ThreadGoalClearInput,
  ThreadGoalGetInput,
  ThreadGoalSetInput,
  ThreadActionInput,
  ThreadSummary,
  ToolArgumentProgressPhase,
  ToolArgumentProgressSnapshot,
} from "./threadTypes";
export type { ThreadActionInput } from "./threadTypes";
import type {
  AdoptWorkflowLabVariantInput,
  AnswerWorkflowDiscoveryQuestionInput,
  ArchiveWorkflowRecordingInput,
  CallableWorkflowTaskSummary,
  CancelCallableWorkflowTaskInput,
  CancelOrchestrationRunInput,
  CancelWorkflowRunInput,
  CompileWorkflowDebugRewriteInput,
  CompileWorkflowPreviewInput,
  ConfirmWorkflowRecordingInput,
  CreateOrchestrationTaskInput,
  CreateWorkflowAgentFolderInput,
  CreateWorkflowAgentThreadInput,
  CreateWorkflowLabRunInput,
  CreateWorkflowRevisionInput,
  DescribeWorkflowDiscoveryCapabilityInput,
  DescribeWorkflowRecordingInput,
  GetWorkflowLabRunInput,
  InvokeWorkflowNativeToolInput,
  ListWorkflowAgentChatMessagesInput,
  ListWorkflowLabRunsInput,
  ListWorkflowRevisionsInput,
  ListWorkflowVersionsInput,
  MoveWorkflowAgentThreadInput,
  OrchestrationAutoDispatchStatus,
  OrchestrationBoard,
  OrchestrationPrepareResult,
  OrchestrationWorkflowImpactResolutionResult,
  OrchestrationWorkflowRawUpdateResult,
  OrchestrationWorkflowRepairResult,
  OrchestrationWorkflowSettingsUpdateResult,
  PauseCallableWorkflowTaskInput,
  RecoverWorkflowRunInput,
  RepairOrchestrationWorkflowInput,
  RequestWorkflowRecordingReviewInput,
  ResolveOrchestrationWorkflowImpactInput,
  ResolveWorkflowApprovalInput,
  ResolveWorkflowDiscoveryAccessRequestInput,
  ResolveWorkflowRevisionInput,
  RestoreWorkflowRecordingVersionInput,
  RestoreWorkflowVersionInput,
  ResumeCallableWorkflowTaskInput,
  RevalidateWorkflowArtifactInput,
  RevealOrchestrationWorkspaceInput,
  ReviewWorkflowArtifactInput,
  RunWorkflowArtifactInput,
  RunWorkflowThreadExplorationInput,
  SaveSymphonyWorkflowRecipeInput,
  SearchWorkflowDiscoveryCapabilitiesInput,
  SearchWorkflowRecordingsInput,
  SetOrchestrationAutoDispatchInput,
  SetWorkflowRecordingEnabledInput,
  StartOrchestrationRunInput,
  StartWorkflowDiscoveryInput,
  StartWorkflowLabRunInput,
  StartWorkflowRecordingInput,
  StartWorkflowRevisionDiscoveryInput,
  StopWorkflowLabRunInput,
  StopWorkflowRecordingInput,
  UnarchiveWorkflowRecordingInput,
  UpdateOrchestrationTaskInput,
  UpdateOrchestrationWorkflowRawInput,
  UpdateOrchestrationWorkflowSettingsInput,
  UpdateWorkflowArtifactSourceInput,
  UpdateWorkflowConnectorGrantInput,
  UpdateWorkflowRecordingPlaybookInput,
  UpdateWorkflowRecordingReviewInput,
  UpdateWorkflowRevisionInput,
  WorkflowAgentDiscoveryResult,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowCompileProgress,
  WorkflowDashboard,
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilitySearch,
  WorkflowDiscoveryProgress,
  WorkflowExplorationProgress,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
  WorkflowLabRun,
  WorkflowNativeToolInvocationResult,
  WorkflowRecordingEditContext,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRevisionSummary,
  WorkflowRunDetail,
  WorkflowRunDetailInput,
  WorkflowThreadExplorationResult,
  WorkflowVersionSummary,
} from "./workflowTypes";
import type {
  GitBranchInput,
  GitCommitInput,
  GitFileActionInput,
  GitReviewSummary,
  GitSimpleAction,
  OpenLocalPathInput,
  OpenWorkspacePathInput,
  PickWorkspaceContextInput,
  WorkspaceContextReference,
  WorkspaceDiff,
  WorkspaceFileContent,
  WorkspaceFileTree,
  WorkspaceGitStatus,
  WorkspaceOpenTarget,
  WorkspaceSearchInput,
  WorkspaceSearchResult,
  WorkspaceState,
} from "./workspaceTypes";

export interface SendMessageGoalMode {
  enabled: boolean;
  tokenBudget?: number | null;
}

export interface SendMessageLocalDeepResearchComposerIntent {
  kind: "local-deep-research";
  localDeepResearch: LocalDeepResearchRunBudget;
}

export type SendMessageSymphonyComposerAction = "run-once" | "save-recipe";

export interface SendMessageSymphonyComposerIntent {
  kind: "symphony-workflow";
  action: SendMessageSymphonyComposerAction;
  patternId: SymphonyWorkflowPatternId;
  blocking?: boolean;
  stepAnswers?: Record<string, { choiceId?: string; customText?: string }>;
  metricCustomizations?: Record<string, string>;
}

export type SendMessageComposerIntent =
  | SendMessageLocalDeepResearchComposerIntent
  | SendMessageSymphonyComposerIntent
  | SendMessageSlashCommandComposerIntent;

export interface ApplyWorkflowRecordingSummaryInput extends ThreadActionInput {
  messageId?: string;
}

export interface ProviderStatus {
  providerId: "ambient" | "gmi-cloud";
  providerLabel: string;
  debugOverride?: boolean;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  source: "saved" | "env" | "missing";
  storage: "os-encrypted" | "environment" | "none";
}

export interface AmbientApiKeyTestResult {
  ok: boolean;
  message: string;
}

export interface DesktopSettings {
  permissionMode: PermissionMode;
  collaborationMode: CollaborationMode;
  model: string;
  featureFlags: AmbientFeatureFlagSettings;
  memory: AgentMemorySettings;
  thinkingLevel: ThinkingLevel;
  thinkingDisplay: ThinkingDisplaySettings;
  modelRuntime: ModelRuntimeSettings;
  modelCatalog: AmbientModelRuntimeCatalog;
  compaction: AmbientCompactionSettings;
  media: MediaPlaybackSettings;
  planner: PlannerSettings;
  search: SearchRoutingSettings;
  localDeepResearch: LocalDeepResearchSettings;
  voice: VoiceSettings;
  stt: SttSettings;
}

export type ThinkingDisplayMode = "off" | "transient" | "full";

export interface ThinkingDisplaySettings {
  mode: ThinkingDisplayMode;
  showRunStatusCard: boolean;
}

export type ThemePreference = "system" | "light" | "dark";

export type ResolvedTheme = "light" | "dark";

export interface AppAppearance {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
}

export type DesktopUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "not-available"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

export type DesktopUpdateCheckReason = "startup" | "scheduled" | "manual";

export interface DesktopUpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface DesktopUpdateState {
  enabled: boolean;
  status: DesktopUpdateStatus;
  currentVersion: string;
  channel: string;
  feedUrl?: string;
  availableVersion?: string;
  releaseName?: string;
  releaseDate?: string;
  releaseNotes?: string;
  progress?: DesktopUpdateProgress;
  error?: string;
  disabledReason?: string;
  lastCheckedAt?: string;
  dismissedVersion?: string;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  isPackaged: boolean;
  platform: string;
  arch: string;
  build?: {
    channel?: string;
    commit?: string;
  };
  piVersions: {
    piAi: string;
    piCodingAgent: string;
  };
  update: DesktopUpdateState;
  thirdPartyCredits: AppThirdPartyCredit[];
}

export interface AppThirdPartyCredit {
  name: string;
  license: string;
  description: string;
  repository?: string;
  paper?: string;
  authors?: string;
  copyrightNotice?: string;
  licenseText?: string;
  licenseUrl?: string;
  notice?: string;
}

export interface DesktopState {
  stateRevision?: number;
  app: AppInfo;
  appearance: AppAppearance;
  workspace: WorkspaceState;
  activeWorkspace: WorkspaceState;
  providerCatalog: ProviderCatalogSettingsState;
  projects: ProjectSummary[];
  automationFolders: AutomationFolderSummary[];
  workflowAgentFolders: WorkflowAgentFolderSummary[];
  workflowRecordingLibrary: WorkflowRecordingLibraryEntry[];
  automationThreadChatIds: string[];
  threads: ThreadSummary[];
  activeThreadId: string;
  threadRunStatuses?: Record<string, RunStatus>;
  messages: ChatMessage[];
  childMessagesByThreadId?: Record<string, ChatMessage[]>;
  messageVoiceStates: Record<string, MessageVoiceState>;
  voiceSettingsAudit: VoiceSettingsAuditEntry[];
  plannerPlanArtifacts: PlannerPlanArtifact[];
  settings: DesktopSettings;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  subagentMaturity: SubagentMaturitySnapshot;
  subagentMaturityEvidence: SubagentMaturityEvidence[];
  subagentRuns: SubagentRunSummary[];
  subagentRunEvents: SubagentRunEventSummary[];
  subagentMailboxEvents: SubagentMailboxEventSummary[];
  subagentToolScopeSnapshots: SubagentToolScopeSnapshotSummary[];
  subagentWaitBarriers: SubagentWaitBarrierSummary[];
  subagentParentMailboxEvents: SubagentParentMailboxEventSummary[];
  callableWorkflowTasks: CallableWorkflowTaskSummary[];
  subagentRepairDiagnostics?: SubagentRepairDiagnosticsReport;
  provider: ProviderStatus;
  secureStorage: SecureStorageStatus;
  secureStorageRepair: SecureStorageRepairGuidance;
  namedSecrets: NamedSecretSummary[];
  queue: QueueState;
  sttQueue: SttQueueState;
  sttDiagnostics: SttDiagnosticSummary[];
  contextUsage?: ContextUsageSnapshot;
  activeThreadGoal?: ThreadGoal;
}

export interface ProviderCatalogSettingsState {
  catalogVersion: string;
  generatedAt: string;
  cards: ProviderCatalogSettingsCard[];
}

export interface ProviderCatalogInstallability {
  status: "installable" | "not-installable";
  reason: string;
  actionLabel?: string;
  actionTitle?: string;
}

export interface ProviderCatalogSettingsCard {
  id: string;
  displayName: string;
  capabilityArea: string;
  installerShape?: string;
  providerKind: string;
  sourceModel: string;
  recommendationTier: string;
  recommendationSummary: string;
  installability?: ProviderCatalogInstallability;
  deploymentRole?: string;
  recommendation?: string;
  bestFor: string[];
  tradeoffs: string[];
  avoidWhen: string[];
  platforms: string[];
  platformSupport?: Array<{
    platform: string;
    status: string;
    runtime: string;
    installMode: string;
    evidence: string[];
    caveats: string[];
  }>;
  hardwareFit: string[];
  firstPartyTemplate?: {
    available: boolean;
    templateId?: string;
    notes?: string;
  };
  capabilityBuilderDefaults?: {
    provider?: string;
    locality?: "local" | "network" | "either";
    outputFileArtifacts?: string[];
    responseFormats?: string[];
    envNames?: string[];
    networkHosts?: string[];
    modelAssets?: string[];
  };
  ambientContract: {
    commandContract?: string;
    descriptorRequirements: string[];
    artifactPolicy: string;
    validationTarget: string;
  };
  secrets: Array<{
    envName: string;
    required: boolean;
    capture: string;
  }>;
  networkHosts: string[];
  modelAssets: Array<{
    name: string;
    expectedSize?: string;
    licenseNote?: string;
    cachePolicy?: string;
  }>;
  localArtifactStatus?: string;
  minimumLocalSmokeTest?: string;
  runtimeState?: {
    externalService: boolean;
    serviceKind?: string;
    healthCheck?: string;
    updatePolicy?: string;
  };
  costPrivacyNotes: string[];
  maintenanceNotes: string[];
  safetyBoundaries: string[];
  knownQuirks: string[];
  researchStatus: string;
  docs: Array<{
    label: string;
    url: string;
    lastReviewed?: string;
  }>;
}

export interface SendMessageInput {
  threadId: string;
  content: string;
  permissionMode: PermissionMode;
  collaborationMode: CollaborationMode;
  model: string;
  thinkingLevel: ThinkingLevel;
  delivery?: MessageDelivery;
  context?: WorkspaceContextReference[];
  retryOfMessageId?: string;
  workflowThreadId?: string;
  workflowRecordingEditContext?: WorkflowRecordingEditContext;
  preserveActiveThread?: boolean;
  stt?: SttMessageMetadata;
  goalMode?: SendMessageGoalMode;
  composerIntent?: SendMessageComposerIntent;
}

export interface CreateThreadInput {
  permissionMode?: PermissionMode;
  collaborationMode?: CollaborationMode;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  workspacePath?: string;
}

export interface UpdateThreadSettingsInput {
  threadId: string;
  collaborationMode?: CollaborationMode;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  memoryEnabled?: boolean;
}

export interface RequestThreadPermissionModeChangeInput {
  threadId: string;
  permissionMode: PermissionMode;
  reason?: string;
}

export interface UpdatePlannerPlanArtifactInput {
  artifactId: string;
  status?: PlannerPlanArtifactStatus;
  workflowState?: PlannerPlanWorkflowState;
}

export interface SetThemePreferenceInput {
  themePreference: ThemePreference;
}

export interface UpdateMediaPlaybackSettingsInput {
  generatedMediaAutoplay: boolean;
}

export interface UpdateThinkingDisplaySettingsInput extends ThinkingDisplaySettings {}

export interface UpdateModelRuntimeSettingsInput extends Partial<ModelRuntimeSettings> {}

export interface UpdatePlannerSettingsInput extends PlannerSettings {}

export interface UpdateSearchRoutingSettingsInput extends SearchRoutingSettings {}

export interface UpdateLocalDeepResearchSettingsInput extends LocalDeepResearchSettings {}

export interface UpdateVoiceSettingsInput extends VoiceSettings {}

export interface UpdateSttSettingsInput extends SttSettings {}

export interface CompactThreadInput {
  threadId: string;
  customInstructions?: string;
}

export interface RecoverThreadContextInput {
  threadId: string;
  reason?: string;
}

export interface SelectProjectInput {
  projectId: string;
  threadId?: string;
}

export interface ProjectActionInput {
  projectId: string;
}

export interface UpdateProjectInput {
  projectId: string;
  name?: string;
  pinned?: boolean;
}

export interface UpdateThreadInput extends ThreadActionInput {
  title?: string;
  pinned?: boolean;
}

export interface ForkThreadInput extends ThreadActionInput {
  mode: "local" | "worktree";
}

export type MenuCommand =
  | "new-chat"
  | "open-folder"
  | "toggle-sidebar"
  | "toggle-terminal"
  | "toggle-file-tree"
  | "toggle-diff-panel"
  | "toggle-browser-panel"
  | "performance-trace"
  | "export-diagnostics";

export interface ToolEventDetails {
  source?: "plugin-mcp" | "first-party" | "pi-builtin";
  runtime?: "chat" | "workflow" | "automation";
  permissionMode?: PermissionMode;
  pluginId?: string;
  pluginName?: string;
  serverName?: string;
  toolName?: string;
  registeredName?: string;
  result?: "running" | "completed" | "error" | "canceled";
  toolPhase?: ToolArgumentProgressPhase;
  toolArgumentProgress?: ToolArgumentProgressSnapshot;
}

export type MediaArtifactKind = "image" | "audio" | "video";

export interface MediaArtifactResult {
  artifactPath: string;
  mediaKind: MediaArtifactKind;
  mimeType?: string;
  bytes: number;
  width?: number;
  height?: number;
  sourceUrl?: string;
  licenseNote?: string;
  inlinePreviewEligible?: true;
  renderedInline?: true;
  displayInstruction: string;
}

export type DesktopEvent =
  | { type: "state"; state: DesktopState }
  | { type: "appearance-updated"; appearance: AppAppearance }
  | { type: "message-created"; message: ChatMessage; workspacePath?: string }
  | { type: "message-delta"; messageId: string; delta: string; threadId?: string; workspacePath?: string }
  | { type: "message-updated"; message: ChatMessage; workspacePath?: string }
  | { type: "thread-updated"; thread: ThreadSummary; workspacePath?: string }
  | { type: "subagent-run-updated"; run: SubagentRunSummary; workspacePath?: string }
  | { type: "subagent-run-event-created"; run: SubagentRunSummary; event: SubagentRunEventSummary; workspacePath?: string }
  | { type: "subagent-mailbox-event-updated"; run: SubagentRunSummary; mailboxEvent: SubagentMailboxEventSummary; workspacePath?: string }
  | { type: "subagent-tool-scope-snapshot-recorded"; run: SubagentRunSummary; snapshot: SubagentToolScopeSnapshotSummary; workspacePath?: string }
  | { type: "subagent-wait-barrier-updated"; barrier: SubagentWaitBarrierSummary; workspacePath?: string }
  | { type: "subagent-parent-mailbox-event-updated"; mailboxEvent: SubagentParentMailboxEventSummary; workspacePath?: string }
  | { type: "callable-workflow-task-updated"; task: CallableWorkflowTaskSummary; workspacePath?: string }
  | { type: "provider-updated"; provider: ProviderStatus }
  | { type: "update-status"; update: DesktopUpdateState }
  | { type: "browser-updated"; state: BrowserCapabilityState; workspacePath?: string }
  | { type: "open-api-key-dialog" }
  | { type: "mcp-container-runtime-setup-needed"; capabilityId?: "scrapling"; reason?: string; workspacePath?: string }
  | {
      type: "ambient-cli-secret-requested";
      packageName: string;
      envName: string;
      packageId?: string;
      builderSourcePath?: string;
      mcpServerId?: string;
      mcpCandidateId?: string;
      mcpCandidateRef?: string;
    }
  | { type: "menu-command"; command: MenuCommand }
  | { type: "permission-request"; request: PermissionRequest; workspacePath?: string }
  | { type: "permission-resolved"; id: string; workspacePath?: string }
  | { type: "privileged-credential-request"; request: PrivilegedCredentialRequest; workspacePath?: string }
  | { type: "privileged-credential-resolved"; id: string; workspacePath?: string }
  | { type: "secure-input-request"; request: SecureInputRequest; workspacePath?: string }
  | { type: "secure-input-resolved"; id: string; workspacePath?: string }
  | { type: "permission-audit-created"; entry: PermissionAuditEntry; workspacePath?: string }
  | { type: "permission-grant-created"; grant: AmbientPermissionGrant; workspacePath?: string }
  | { type: "permission-grant-revoked"; grant: AmbientPermissionGrant; workspacePath?: string }
  | { type: "e2e-permission-fixture"; grants?: AmbientPermissionGrant[]; audit?: PermissionAuditEntry[] }
  | { type: "e2e-message-captured"; input: SendMessageInput }
  | { type: "plugin-catalog-updated"; workspacePath?: string }
  | { type: "pi-privileged-scan-updated"; source: string; scan: PiPrivilegedSecurityScan; fallback?: PiExtensionSandboxInstallPreview }
  | { type: "planner-plan-artifact-created"; artifact: PlannerPlanArtifact; workspacePath?: string }
  | { type: "planner-plan-artifact-updated"; artifact: PlannerPlanArtifact; workspacePath?: string }
  | { type: "thread-goal-updated"; goal: ThreadGoal; workspacePath?: string }
  | { type: "thread-goal-cleared"; threadId: string; goalId?: string; workspacePath?: string }
  | { type: "run-status"; threadId: string; status: RunStatus; workspacePath?: string }
  | { type: "queue-updated"; queue: QueueState; workspacePath?: string }
  | { type: "stt-queue-updated"; queue: SttQueueState; workspacePath?: string }
  | { type: "stt-diagnostic-recorded"; diagnostic: SttDiagnosticSummary; diagnostics: SttDiagnosticSummary[]; workspacePath?: string }
  | { type: "stt-stop-tts-requested"; workspacePath?: string }
  | { type: "runtime-activity"; activity: RuntimeActivity; workspacePath?: string }
  | { type: "mcp-container-runtime-install-progress"; progress: AmbientMcpContainerRuntimeManagedInstallProgress; workspacePath?: string }
  | { type: "mcp-default-capability-install-progress"; progress: AmbientMcpDefaultCapabilityInstallProgress; workspacePath?: string }
  | { type: "local-deep-research-install-progress"; progress: LocalDeepResearchInstallProgress; workspacePath?: string }
  | { type: "local-deep-research-setup-updated"; result: LocalDeepResearchSetupResult; workspacePath?: string }
  | { type: "context-usage-updated"; snapshot: ContextUsageSnapshot; workspacePath?: string }
  | { type: "tool-event"; threadId: string; label: string; status: "running" | "done" | "error"; artifactPath?: string; details?: ToolEventDetails; workspacePath?: string }
  | { type: "terminal-data"; terminalId: string; data: string; replace?: boolean; threadId?: string; workspacePath?: string }
  | { type: "terminal-exit"; terminalId: string; exitCode?: number; signal?: number; threadId?: string; workspacePath?: string }
  | { type: "orchestration-updated"; workspacePath?: string }
  | { type: "orchestration-auto-dispatch-updated"; status: OrchestrationAutoDispatchStatus; workspacePath?: string }
  | { type: "workflow-updated"; workspacePath?: string }
  | { type: "workflow-run-started"; runId: string; artifactId: string; workflowThreadId?: string; workspacePath?: string }
  | { type: "workflow-discovery-progress"; progress: WorkflowDiscoveryProgress; workspacePath?: string }
  | { type: "workflow-exploration-progress"; progress: WorkflowExplorationProgress; workspacePath?: string }
  | { type: "workflow-compile-progress"; progress: WorkflowCompileProgress; workspacePath?: string }
  | {
      type: "e2e-workflow-dashboard-fixture";
      dashboard: WorkflowDashboard;
      detail?: WorkflowRunDetail;
      versions?: WorkflowVersionSummary[];
      revisions?: WorkflowRevisionSummary[];
      schedules?: AutomationScheduleSummary[];
      scheduleExceptions?: AutomationScheduleExceptionSummary[];
    }
  | { type: "e2e-workflow-chat-fixture"; workflowThreadId: string; messages: ChatMessage[] }
  | { type: "error"; message: string; threadId?: string; workspacePath?: string };

export interface AmbientDesktopApi {
  bootstrap(): Promise<DesktopState>;
  setThemePreference(input: SetThemePreferenceInput): Promise<AppAppearance>;
  updateMediaPlaybackSettings(input: UpdateMediaPlaybackSettingsInput): Promise<MediaPlaybackSettings>;
  updateThinkingDisplaySettings(input: UpdateThinkingDisplaySettingsInput): Promise<ThinkingDisplaySettings>;
  updateModelRuntimeSettings(input: UpdateModelRuntimeSettingsInput): Promise<ModelRuntimeSettings>;
  saveModelProviderCredential(input: SaveModelProviderCredentialInput): Promise<ModelProviderCredentialSaveResult>;
  installModelProviderEndpoint(input: InstallModelProviderEndpointInput): Promise<InstallModelProviderEndpointResult>;
  runLocalModelRuntimeLifecycleAction(input: LocalModelRuntimeLifecycleActionInput): Promise<LocalModelRuntimeLifecycleActionResult>;
  updateFeatureFlagSettings(input: UpdateFeatureFlagSettingsInput): Promise<AmbientFeatureFlagSettings>;
  updateMemorySettings(input: UpdateAgentMemorySettingsInput): Promise<AgentMemorySettings>;
  getAgentMemoryStarterStatus(): Promise<AgentMemoryStarterStatus>;
  enableAgentMemoryStarter(input?: AgentMemoryStarterEnableInput): Promise<AgentMemoryStarterOperationResult>;
  repairAgentMemoryStarter(input?: AgentMemoryStarterRepairInput): Promise<AgentMemoryStarterOperationResult>;
  disableAgentMemoryStarter(input?: AgentMemoryStarterDisableInput): Promise<AgentMemoryStarterOperationResult>;
  getAgentMemoryDiagnostics(): Promise<AgentMemoryStorageDiagnostics>;
  runAgentMemoryEmbeddingLifecycleAction(input: AgentMemoryEmbeddingLifecycleActionInput): Promise<AgentMemoryEmbeddingLifecycleActionResult>;
  clearAgentMemory(input: AgentMemoryClearInput): Promise<AgentMemoryClearResult>;
  updatePlannerSettings(input: UpdatePlannerSettingsInput): Promise<PlannerSettings>;
  hydrateSearchRoutingSettings(): Promise<SearchRoutingSettings>;
  updateSearchRoutingSettings(input: UpdateSearchRoutingSettingsInput): Promise<SearchRoutingSettings>;
  updateLocalDeepResearchSettings(input: UpdateLocalDeepResearchSettingsInput): Promise<LocalDeepResearchSettings>;
  listVoiceProviders(): Promise<VoiceProviderCandidate[]>;
  listSttProviders(): Promise<SttProviderCandidate[]>;
  setupSttProvider(input: SttProviderSetupInput): Promise<SttProviderSetupResult>;
  setupMiniCpmVisionProvider(input: MiniCpmVisionSetupInput): Promise<MiniCpmVisionSetupResult>;
  analyzeMiniCpmVisionInput(input: MiniCpmVisionAnalyzeInput): Promise<MiniCpmVisionAnalysisResult>;
  setupLocalDeepResearch(input: LocalDeepResearchSetupInput): Promise<LocalDeepResearchSetupResult>;
  listLocalDeepResearchRuns(input?: LocalDeepResearchRunHistoryInput): Promise<LocalDeepResearchRunHistoryResult>;
  saveSttTestAudio(input: SttTestAudioInput): Promise<SttTestAudioResult>;
  transcribeSttAudio(input: SttTranscribeAudioInput): Promise<SttTranscribeAudioResult>;
  cancelSttTranscription(): Promise<SttQueueState>;
  setSttTtsSpeaking(input: SetSttTtsSpeakingInput): Promise<SttQueueState>;
  refreshVoiceProviderVoices(input: RefreshVoiceProviderVoicesInput): Promise<RefreshVoiceProviderVoicesResult>;
  getVoiceOnboardingHostFacts(): Promise<VoiceOnboardingHostFacts>;
  regenerateMessageVoice(input: RegenerateMessageVoiceInput): Promise<MessageVoiceState>;
  revealMessageVoiceArtifact(input: MessageVoiceArtifactInput): Promise<void>;
  clearMessageVoiceArtifact(input: MessageVoiceArtifactInput): Promise<MessageVoiceState>;
  inspectVoiceArtifacts(input?: VoiceArtifactRetentionInput): Promise<VoiceArtifactRetentionSummary>;
  pruneVoiceArtifacts(input?: VoiceArtifactRetentionInput): Promise<VoiceArtifactPruneResult>;
  updateVoiceSettings(input: UpdateVoiceSettingsInput): Promise<VoiceSettings>;
  updateSttSettings(input: UpdateSttSettingsInput): Promise<SttSettings>;
  openWorkspace(): Promise<DesktopState | undefined>;
  createWorkspace(): Promise<DesktopState | undefined>;
  createThread(input?: CreateThreadInput): Promise<DesktopState>;
  startWorkflowRecording(input: StartWorkflowRecordingInput): Promise<DesktopState>;
  stopWorkflowRecording(input: StopWorkflowRecordingInput): Promise<DesktopState>;
  requestWorkflowRecordingReview(input: RequestWorkflowRecordingReviewInput): Promise<void>;
  updateWorkflowRecordingReview(input: UpdateWorkflowRecordingReviewInput): Promise<DesktopState>;
  confirmWorkflowRecording(input: ConfirmWorkflowRecordingInput): Promise<DesktopState>;
  applyWorkflowRecordingSummary(input: ApplyWorkflowRecordingSummaryInput): Promise<DesktopState>;
  searchWorkflowRecordings(input?: SearchWorkflowRecordingsInput): Promise<WorkflowRecordingLibraryEntry[]>;
  describeWorkflowRecording(input: DescribeWorkflowRecordingInput): Promise<WorkflowRecordingLibraryDescription>;
  searchSlashCommands(input?: SlashCommandSearchInput): Promise<SlashCommandSearchResponse>;
  describeSlashCommand(input: SlashCommandDescribeInput): Promise<SlashCommandDescription>;
  setWorkflowRecordingEnabled(input: SetWorkflowRecordingEnabledInput): Promise<DesktopState>;
  updateWorkflowRecordingPlaybook(input: UpdateWorkflowRecordingPlaybookInput): Promise<DesktopState>;
  saveSymphonyWorkflowRecipe(input: SaveSymphonyWorkflowRecipeInput): Promise<DesktopState>;
  archiveWorkflowRecording(input: ArchiveWorkflowRecordingInput): Promise<DesktopState>;
  unarchiveWorkflowRecording(input: UnarchiveWorkflowRecordingInput): Promise<DesktopState>;
  restoreWorkflowRecordingVersion(input: RestoreWorkflowRecordingVersionInput): Promise<DesktopState>;
  createWorkflowLabRun(input: CreateWorkflowLabRunInput): Promise<WorkflowLabRun>;
  listWorkflowLabRuns(input?: ListWorkflowLabRunsInput): Promise<WorkflowLabRun[]>;
  getWorkflowLabRun(input: GetWorkflowLabRunInput): Promise<WorkflowLabRun>;
  startWorkflowLabRun(input: StartWorkflowLabRunInput): Promise<WorkflowLabRun>;
  stopWorkflowLabRun(input: StopWorkflowLabRunInput): Promise<WorkflowLabRun>;
  adoptWorkflowLabVariant(input: AdoptWorkflowLabVariantInput): Promise<DesktopState>;
  selectThread(threadId: string): Promise<DesktopState>;
  selectProject(input: SelectProjectInput): Promise<DesktopState>;
  updateProject(input: UpdateProjectInput): Promise<DesktopState>;
  removeProject(input: ProjectActionInput): Promise<DesktopState>;
  revealProject(input: ProjectActionInput): Promise<void>;
  createProjectBoard(input: CreateProjectBoardInput): Promise<DesktopState>;
  reviseProjectBoard(input: ReviseProjectBoardInput): Promise<DesktopState>;
  cancelProjectBoardRevision(input: CancelProjectBoardRevisionInput): Promise<DesktopState>;
  resetProjectBoard(input: ResetProjectBoardInput): Promise<DesktopState>;
  pauseProjectBoardSynthesis(input: PauseProjectBoardSynthesisInput): Promise<DesktopState>;
  retryProjectBoardSynthesis(input: RetryProjectBoardSynthesisInput): Promise<DesktopState>;
  abandonProjectBoardSynthesisRun(input: { boardId: string; runId: string; reason?: string }): Promise<DesktopState>;
  seedProjectBoardSemanticIdleDogfood(input: SeedProjectBoardSemanticIdleDogfoodInput): Promise<DesktopState>;
  seedProjectBoardProofJudgmentDogfood(input: SeedProjectBoardProofJudgmentDogfoodInput): Promise<ProjectBoardProofJudgmentDogfoodResult>;
  seedProjectBoardCanonicalProjectionDogfood(input: SeedProjectBoardCanonicalProjectionDogfoodInput): Promise<ProjectBoardCanonicalProjectionDogfoodResult>;
  seedProjectBoardDeliverableIntegrationDogfood(input: SeedProjectBoardDeliverableIntegrationDogfoodInput): Promise<ProjectBoardDeliverableIntegrationDogfoodResult>;
  deferProjectBoardSynthesisSections(input: DeferProjectBoardSynthesisSectionsInput): Promise<DesktopState>;
  updateProjectBoardStatus(input: UpdateProjectBoardStatusInput): Promise<DesktopState>;
  promotePlannerPlanToBoard(input: PromotePlannerPlanToBoardInput): Promise<DesktopState>;
  approveProjectBoardCard(input: ApproveProjectBoardCardInput): Promise<DesktopState>;
  resolveProjectBoardProofDecision(input: ResolveProjectBoardProofDecisionInput): Promise<DesktopState>;
  rerunProjectBoardProof(input: RerunProjectBoardProofInput): Promise<DesktopState>;
  resolveProjectBoardDeliverableIntegration(input: ResolveProjectBoardDeliverableIntegrationInput): Promise<DesktopState>;
  recomputeProjectBoardProofCoverage(input: RecomputeProjectBoardProofCoverageInput): Promise<DesktopState>;
  suggestProjectBoardProof(input: SuggestProjectBoardProofInput): Promise<DesktopState>;
  resolveProjectBoardSplitDecision(input: ResolveProjectBoardSplitDecisionInput): Promise<DesktopState>;
  createReadyProjectBoardTasks(input: CreateReadyProjectBoardTasksInput): Promise<DesktopState>;
  splitProjectBoardCard(input: SplitProjectBoardCardInput): Promise<DesktopState>;
  createProjectBoardCard(input: CreateProjectBoardCardInput): Promise<DesktopState>;
  attachProjectBoardLocalTask(input: AttachProjectBoardLocalTaskInput): Promise<DesktopState>;
  updateProjectBoardCard(input: UpdateProjectBoardCardInput): Promise<DesktopState>;
  updateProjectBoardCardCandidate(input: UpdateProjectBoardCardCandidateInput): Promise<DesktopState>;
  resolveProjectBoardCardPiUpdate(input: ResolveProjectBoardCardPiUpdateInput): Promise<DesktopState>;
  addProjectBoardCardRunFeedback(input: AddProjectBoardCardRunFeedbackInput): Promise<DesktopState>;
  copyProjectBoardSessionToThread(input: CopyProjectBoardSessionToThreadInput): Promise<DesktopState>;
  suggestProjectBoardClarificationDefaults(input: SuggestProjectBoardClarificationDefaultsInput): Promise<DesktopState>;
  suggestProjectBoardKickoffDefaults(input: SuggestProjectBoardKickoffDefaultsInput): Promise<DesktopState>;
  applyProjectBoardDecisionImpactFeedback(input: ApplyProjectBoardDecisionImpactFeedbackInput): Promise<DesktopState>;
  refreshProjectBoardDecisionDrafts(input: RefreshProjectBoardDecisionDraftsInput): Promise<DesktopState>;
  regenerateProjectBoardDecisionDrafts(input: RegenerateProjectBoardDecisionDraftsInput): Promise<DesktopState>;
  refreshProjectBoardSourceDrafts(input: RefreshProjectBoardSourceDraftsInput): Promise<DesktopState>;
  regenerateProjectBoardSourceDrafts(input: RegenerateProjectBoardSourceDraftsInput): Promise<DesktopState>;
  applyProjectBoardSourceImpactFeedback(input: ApplyProjectBoardSourceImpactFeedbackInput): Promise<DesktopState>;
  refreshProjectBoardSources(input: RefreshProjectBoardSourcesInput): Promise<DesktopState>;
  refineProjectBoardSynthesis(input: RefineProjectBoardSynthesisInput): Promise<DesktopState>;
  answerProjectBoardSynthesisProposalQuestion(input: AnswerProjectBoardSynthesisProposalQuestionInput): Promise<DesktopState>;
  reviewProjectBoardSynthesisProposalCard(input: ReviewProjectBoardSynthesisProposalCardInput): Promise<DesktopState>;
  applyProjectBoardSynthesisProposal(input: ApplyProjectBoardSynthesisProposalInput): Promise<DesktopState>;
  updateProjectBoardSource(input: UpdateProjectBoardSourceInput): Promise<DesktopState>;
  answerProjectBoardQuestion(input: AnswerProjectBoardQuestionInput): Promise<DesktopState>;
  finalizeProjectBoardKickoff(input: FinalizeProjectBoardKickoffInput): Promise<DesktopState>;
  getProjectBoardGitSyncStatus(input: ProjectBoardGitSyncInput): Promise<ProjectBoardGitSyncStatus>;
  exportProjectBoardGitArtifacts(input: ProjectBoardGitSyncInput): Promise<ProjectBoardGitSyncStatus>;
  commitProjectBoardGitArtifacts(input: ProjectBoardGitSyncInput): Promise<ProjectBoardGitSyncStatus>;
  pushProjectBoardGitArtifacts(input: ProjectBoardGitSyncInput): Promise<ProjectBoardGitSyncStatus>;
  pullProjectBoardGitArtifacts(input: ProjectBoardGitSyncInput): Promise<ProjectBoardGitSyncStatus>;
  applyPulledProjectBoardGitProjection(input: ProjectBoardGitSyncInput): Promise<DesktopState>;
  claimProjectBoardGitCard(input: ProjectBoardGitCardClaimInput): Promise<DesktopState>;
  releaseProjectBoardGitCardClaim(input: ProjectBoardGitCardClaimReleaseInput): Promise<DesktopState>;
  expireProjectBoardGitCardClaim(input: ProjectBoardGitCardClaimReleaseInput): Promise<DesktopState>;
  resolveProjectBoardGitCardClaimConflicts(input: ProjectBoardGitCardClaimReleaseInput): Promise<DesktopState>;
  archiveProjectChats(input: ProjectActionInput): Promise<DesktopState>;
  createPermanentProjectWorktree(input: ProjectActionInput): Promise<DesktopState | undefined>;
  updateThread(input: UpdateThreadInput): Promise<DesktopState>;
  archiveThread(input: ThreadActionInput): Promise<DesktopState>;
  markThreadUnread(input: ThreadActionInput): Promise<DesktopState>;
  revealThread(input: ThreadActionInput): Promise<void>;
  forkThread(input: ForkThreadInput): Promise<DesktopState>;
  openThreadMiniWindow(input: ThreadActionInput): Promise<void>;
  updateThreadSettings(input: UpdateThreadSettingsInput): Promise<ThreadSummary>;
  requestThreadPermissionModeChange(input: RequestThreadPermissionModeChangeInput): Promise<ThreadSummary>;
  updatePlannerPlanArtifact(input: UpdatePlannerPlanArtifactInput): Promise<PlannerPlanArtifact>;
  generatePlannerDurableArtifact(input: GeneratePlannerDurableArtifactInput): Promise<PlannerPlanArtifact>;
  answerPlannerDecisionQuestion(input: AnswerPlannerDecisionQuestionInput): Promise<PlannerPlanArtifact>;
  openAmbientKeys(): Promise<void>;
  openExternalUrl(url: string): Promise<void>;
  readClipboardText(): Promise<string>;
  writeClipboardText(text: string): Promise<void>;
  saveAmbientApiKey(apiKey: string): Promise<ProviderStatus>;
  clearAmbientApiKey(): Promise<ProviderStatus>;
  testAmbientApiKey(apiKey?: string): Promise<AmbientApiKeyTestResult>;
  refreshSecureStorageStatus(): Promise<{ status: SecureStorageStatus; guidance: SecureStorageRepairGuidance }>;
  saveNamedSecret(input: SaveNamedSecretInput): Promise<NamedSecretSummary[]>;
  updateNamedSecret(input: UpdateNamedSecretInput): Promise<NamedSecretSummary[]>;
  deleteNamedSecret(input: DeleteNamedSecretInput): Promise<NamedSecretSummary[]>;
  brokerNamedSecretToLocalFixture(input: BrokerNamedSecretUseInput): Promise<BrokerNamedSecretUseResult>;
  exportNamedSecretMetadata(): Promise<NamedSecretMetadataExport>;
  getUpdateState(): Promise<DesktopUpdateState>;
  checkForUpdates(reason?: DesktopUpdateCheckReason): Promise<DesktopUpdateState>;
  downloadUpdate(): Promise<DesktopUpdateState>;
  installUpdateAndRestart(): Promise<DesktopUpdateState>;
  dismissUpdateNotification(): Promise<DesktopUpdateState>;
  listWorkspaceFiles(): Promise<WorkspaceFileTree>;
  readWorkspaceFile(path: string): Promise<WorkspaceFileContent>;
  refreshOfficePreview(path: string): Promise<WorkspaceFileContent>;
  previewLocalFile(path: string): Promise<WorkspaceFileContent>;
  refreshLocalOfficePreview(path: string): Promise<WorkspaceFileContent>;
  pickWorkspaceContext(input: PickWorkspaceContextInput): Promise<WorkspaceContextReference[]>;
  revealWorkspacePath(path: string): Promise<void>;
  openWorkspacePath(path: string): Promise<void>;
  listWorkspaceOpenTargets(): Promise<WorkspaceOpenTarget[]>;
  openWorkspacePathWith(input: OpenWorkspacePathInput): Promise<void>;
  revealLocalPath(path: string): Promise<void>;
  openLocalPath(path: string): Promise<void>;
  openLocalPathWith(input: OpenLocalPathInput): Promise<void>;
  getWorkspaceDiff(): Promise<WorkspaceDiff>;
  getWorkspaceGitStatus(): Promise<WorkspaceGitStatus>;
  switchWorkspaceBranch(branch: string): Promise<WorkspaceGitStatus>;
  getGitReview(): Promise<GitReviewSummary>;
  gitStageFile(input: GitFileActionInput): Promise<GitReviewSummary>;
  gitUnstageFile(input: GitFileActionInput): Promise<GitReviewSummary>;
  gitStageAllFiles(): Promise<GitReviewSummary>;
  gitUnstageAllFiles(): Promise<GitReviewSummary>;
  gitDiscardFile(input: GitFileActionInput): Promise<GitReviewSummary>;
  gitCommit(input: GitCommitInput): Promise<GitReviewSummary>;
  gitCreateBranch(input: GitBranchInput): Promise<GitReviewSummary>;
  gitRunAction(action: GitSimpleAction): Promise<GitReviewSummary>;
  gitInitializeRepository(): Promise<GitReviewSummary>;
  gitCreateThreadWorktree(): Promise<GitReviewSummary>;
  gitAttachExistingWorktree(): Promise<GitReviewSummary | undefined>;
  createPullRequestUrl(): Promise<string | undefined>;
  searchWorkspace(input: WorkspaceSearchInput): Promise<WorkspaceSearchResult[]>;
  discoverCodexPlugins(): Promise<CodexPluginCatalog>;
  readCodexPlugin(input: ReadCodexPluginInput): Promise<CodexPluginSummary>;
  addCodexMarketplace(input: AddCodexMarketplaceInput): Promise<CodexPluginCatalog>;
  removeCodexMarketplace(input: RemoveCodexMarketplaceInput): Promise<CodexPluginCatalog>;
  setCodexPluginEnabled(input: SetCodexPluginEnabledInput): Promise<CodexPluginCatalog>;
  setCodexPluginTrusted(input: SetCodexPluginTrustedInput): Promise<CodexPluginCatalog>;
  importCodexPlugin(input: ImportCodexPluginInput): Promise<CodexPluginCatalog>;
  uninstallCodexPlugin(input: UninstallCodexPluginInput): Promise<CodexPluginCatalog>;
  installCodexPluginDependencies(input: InstallCodexPluginDependenciesInput): Promise<CodexPluginDependencyInstallResult>;
  inspectCodexHostedMarketplace(): Promise<CodexHostedMarketplaceReport>;
  inspectCodexPluginMcp(): Promise<CodexPluginMcpInspectionCatalog>;
  listPluginMcpRuntimeSnapshots(): Promise<PluginMcpRuntimeSnapshot[]>;
  restartPluginMcpRuntime(input: PluginMcpRuntimeActionInput): Promise<PluginMcpRuntimeSnapshot[]>;
  stopPluginMcpRuntime(input: PluginMcpRuntimeActionInput): Promise<PluginMcpRuntimeSnapshot[]>;
  listAmbientPluginRegistry(): Promise<AmbientPluginRegistry>;
  searchMcpRegistryServers(input?: AmbientMcpServerSearchInput): Promise<AmbientMcpServerSearchResult[]>;
  describeMcpRegistryServer(input: AmbientMcpServerDescribeInput): Promise<AmbientMcpInstallPreview>;
  listMcpInstalledServers(): Promise<AmbientMcpInstalledServerSummary[]>;
  getMcpContainerRuntimeStatus(): Promise<AmbientMcpContainerRuntimeStatus>;
  launchMcpContainerRuntimeInstaller(input?: AmbientMcpContainerRuntimeInstallLaunchInput): Promise<AmbientMcpContainerRuntimeInstallLaunchResult>;
  deferMcpContainerRuntimeSetup(): Promise<AmbientMcpContainerRuntimeStatus>;
  installMcpDefaultCapability(input: AmbientMcpDefaultCapabilityInstallInput): Promise<AmbientMcpServerInstallResult>;
  installMcpRegistryServer(input: AmbientMcpServerInstallInput): Promise<AmbientMcpServerInstallResult>;
  uninstallMcpServer(input: AmbientMcpServerUninstallInput): Promise<AmbientMcpServerUninstallResult>;
  acceptMcpToolDescriptorReview(input: AmbientMcpToolReviewAcceptInput): Promise<AmbientMcpToolReviewAcceptResult>;
  listManagedDevServers(): Promise<ManagedDevServerSummary[]>;
  stopManagedDevServer(input: StopManagedDevServerInput): Promise<ManagedDevServerSummary[]>;
  getCapabilityBuilderHistory(input?: CapabilityBuilderHistoryInput): Promise<CapabilityBuilderHistoryResult>;
  listAmbientPluginRuntimeCapabilities(input: ListAmbientPluginRuntimeCapabilitiesInput): Promise<AmbientPluginCapabilitySummary[]>;
  getAmbientPluginCapabilityDiagnostics(input: GetAmbientPluginCapabilityDiagnosticsInput): Promise<AmbientPluginCapabilityDiagnostics>;
  getFirstPartyGoogleIntegration(): Promise<FirstPartyGoogleIntegrationState>;
  installGoogleWorkspaceCli(): Promise<GoogleWorkspaceCliInstallState>;
  startGoogleWorkspaceSetup(input: GoogleWorkspaceSetupInput): Promise<GoogleWorkspaceSetupState>;
  cancelGoogleWorkspaceSetup(): Promise<GoogleWorkspaceSetupState>;
  importGoogleWorkspaceOAuthClient(input?: GoogleWorkspaceOAuthClientImportInput): Promise<GoogleWorkspaceSetupState>;
  validateGoogleWorkspace(input?: GoogleWorkspaceValidationInput): Promise<GoogleWorkspaceValidationResult>;
  disconnectGoogleWorkspace(input: GoogleWorkspaceValidationInput): Promise<FirstPartyGoogleIntegrationState>;
  startPluginAppAuth(input: StartPluginAppAuthInput): Promise<AmbientPluginAuthStartResult>;
  completePluginAppAuth(input: CompletePluginAppAuthInput): Promise<AmbientPluginAuthAccountSummary>;
  revokePluginAuthAccount(input: PluginAuthAccountActionInput): Promise<AmbientPluginAuthAccountSummary>;
  disconnectPluginAuthAccount(input: PluginAuthAccountActionInput): Promise<AmbientPluginAuthAccountSummary>;
  testPluginAuthAccount(input: PluginAuthAccountActionInput): Promise<AmbientPluginAuthAccountSummary>;
  inspectPiPackages(): Promise<PiPackageCatalog>;
  previewPiPackageInstall(input: PreviewPiPackageInstallInput): Promise<PiPackageInstallPreview>;
  installPiPackage(input: InstallPiPackageInput): Promise<PiPackageCatalog>;
  uninstallPiPackage(input: UninstallPiPackageInput): Promise<PiPackageCatalog>;
  setPiPackageEnabled(input: SetPiPackageEnabledInput): Promise<PiPackageCatalog>;
  inspectPiExtensionSandboxPackages(): Promise<PiExtensionSandboxCatalog>;
  previewPiExtensionSandboxPackage(input: PreviewPiExtensionSandboxPackageInput): Promise<PiExtensionSandboxInstallPreview>;
  installPiExtensionSandboxPackage(input: InstallPiExtensionSandboxPackageInput): Promise<PiExtensionSandboxCatalog>;
  uninstallPiExtensionSandboxPackage(input: UninstallPiExtensionSandboxPackageInput): Promise<PiExtensionSandboxCatalog>;
  clearPiExtensionSandboxHistory(): Promise<PiExtensionSandboxCatalog>;
  inspectPiPrivilegedPackages(): Promise<PiPrivilegedCatalog>;
  scanPiPrivilegedPackage(input: ScanPiPrivilegedPackageInput): Promise<PiPrivilegedSecurityScan>;
  installPiPrivilegedPackage(input: InstallPiPrivilegedPackageInput): Promise<PiPrivilegedCatalog>;
  disablePiPrivilegedPackage(input: PiPrivilegedPackageActionInput): Promise<PiPrivilegedCatalog>;
  uninstallPiPrivilegedPackage(input: UninstallPiPrivilegedPackageInput): Promise<PiPrivilegedCatalog>;
  clearPiPrivilegedPackageHistory(): Promise<PiPrivilegedCatalog>;
  listBrowserCredentials(): Promise<BrowserCredentialSummary[]>;
  saveBrowserCredential(input: SaveBrowserCredentialInput): Promise<BrowserCredentialSummary[]>;
  deleteBrowserCredential(input: DeleteBrowserCredentialInput): Promise<BrowserCredentialSummary[]>;
  getBrowserState(): Promise<BrowserCapabilityState>;
  startBrowser(input?: BrowserStartInput): Promise<BrowserCapabilityState>;
  stopBrowser(): Promise<BrowserCapabilityState>;
  revealBrowser(input?: BrowserRevealInput): Promise<BrowserRevealResult>;
  clearIsolatedBrowserProfile(): Promise<BrowserCapabilityState>;
  copyChromeProfile(): Promise<BrowserCapabilityState>;
  clearCopiedChromeProfile(): Promise<BrowserCapabilityState>;
  navigateBrowser(input: BrowserNavigateInput): Promise<BrowserPageContent>;
  previewLocalPathInBrowser(input: BrowserLocalPreviewInput): Promise<BrowserLocalPreviewResult>;
  searchBrowser(input: BrowserSearchInput): Promise<BrowserSearchResult[]>;
  readBrowserContent(input: BrowserContentInput): Promise<BrowserPageContent>;
  keypressBrowser(input: BrowserKeypressInput): Promise<BrowserKeypressResult>;
  screenshotBrowser(input?: BrowserStartInput): Promise<BrowserScreenshotResult>;
  pickBrowser(input: BrowserPickInput): Promise<BrowserPickResult>;
  cancelBrowserPick(): Promise<BrowserCapabilityState>;
  resumeBrowserUserAction(): Promise<BrowserCapabilityState>;
  cancelBrowserUserAction(): Promise<BrowserCapabilityState>;
  setBrowserViewBounds(input: BrowserViewBoundsInput): Promise<void>;
  listAutomationFolders(): Promise<AutomationFolderSummary[]>;
  createAutomationFolder(input: CreateAutomationFolderInput): Promise<AutomationFolderSummary[]>;
  moveAutomationThread(input: MoveAutomationThreadInput): Promise<AutomationFolderSummary[]>;
  listWorkflowAgentFolders(): Promise<WorkflowAgentFolderSummary[]>;
  createWorkflowAgentFolder(input: CreateWorkflowAgentFolderInput): Promise<WorkflowAgentFolderSummary[]>;
  moveWorkflowAgentThread(input: MoveWorkflowAgentThreadInput): Promise<WorkflowAgentFolderSummary[]>;
  createWorkflowAgentThread(input: CreateWorkflowAgentThreadInput): Promise<WorkflowAgentFolderSummary[]>;
  ensureWorkflowAgentChatThread(input: { workflowThreadId: string }): Promise<WorkflowAgentThreadSummary>;
  listWorkflowAgentChatMessages(input: ListWorkflowAgentChatMessagesInput): Promise<ChatMessage[]>;
  startWorkflowDiscovery(input: StartWorkflowDiscoveryInput): Promise<WorkflowAgentDiscoveryResult>;
  startWorkflowRevisionDiscovery(input: StartWorkflowRevisionDiscoveryInput): Promise<WorkflowAgentDiscoveryResult>;
  answerWorkflowDiscoveryQuestion(input: AnswerWorkflowDiscoveryQuestionInput): Promise<WorkflowAgentDiscoveryResult>;
  resolveWorkflowDiscoveryAccessRequest(input: ResolveWorkflowDiscoveryAccessRequestInput): Promise<WorkflowAgentDiscoveryResult>;
  searchWorkflowDiscoveryCapabilities(input: SearchWorkflowDiscoveryCapabilitiesInput): Promise<WorkflowDiscoveryCapabilitySearch>;
  describeWorkflowDiscoveryCapability(input: DescribeWorkflowDiscoveryCapabilityInput): Promise<WorkflowDiscoveryCapabilityDescription>;
  invokeWorkflowNativeTool(input: InvokeWorkflowNativeToolInput): Promise<WorkflowNativeToolInvocationResult>;
  listWorkflowGraphSnapshots(input: { workflowThreadId: string }): Promise<WorkflowGraphSnapshot[]>;
  listWorkflowExplorationTraces(input: { workflowThreadId: string }): Promise<WorkflowExplorationTraceSummary[]>;
  runWorkflowThreadExploration(input: RunWorkflowThreadExplorationInput): Promise<WorkflowThreadExplorationResult>;
  listWorkflowVersions(input: ListWorkflowVersionsInput): Promise<WorkflowVersionSummary[]>;
  restoreWorkflowVersion(input: RestoreWorkflowVersionInput): Promise<WorkflowDashboard>;
  listWorkflowRevisions(input: ListWorkflowRevisionsInput): Promise<WorkflowRevisionSummary[]>;
  createWorkflowRevision(input: CreateWorkflowRevisionInput): Promise<WorkflowRevisionSummary>;
  updateWorkflowRevision(input: UpdateWorkflowRevisionInput): Promise<WorkflowRevisionSummary>;
  resolveWorkflowRevision(input: ResolveWorkflowRevisionInput): Promise<WorkflowRevisionSummary>;
  listAutomationSchedules(): Promise<AutomationScheduleSummary[]>;
  createAutomationSchedule(input: CreateAutomationScheduleInput): Promise<AutomationScheduleSummary[]>;
  updateAutomationSchedule(input: UpdateAutomationScheduleInput): Promise<AutomationScheduleSummary[]>;
  listAutomationScheduleExceptions(input?: { scheduleId?: string }): Promise<AutomationScheduleExceptionSummary[]>;
  skipAutomationScheduleOccurrence(input: AutomationScheduleOccurrenceActionInput): Promise<AutomationScheduleOccurrenceActionResult>;
  rescheduleAutomationScheduleOccurrence(input: AutomationScheduleOccurrenceActionInput): Promise<AutomationScheduleOccurrenceActionResult>;
  updateAutomationScheduleOccurrenceRunLimits(input: AutomationScheduleOccurrenceActionInput): Promise<AutomationScheduleOccurrenceActionResult>;
  listOrchestrationBoard(): Promise<OrchestrationBoard>;
  createOrchestrationTask(input: CreateOrchestrationTaskInput): Promise<OrchestrationBoard>;
  updateOrchestrationTask(input: UpdateOrchestrationTaskInput): Promise<OrchestrationBoard>;
  prepareNextOrchestrationTasks(): Promise<OrchestrationPrepareResult>;
  resolveOrchestrationWorkflowImpact(input: ResolveOrchestrationWorkflowImpactInput): Promise<OrchestrationWorkflowImpactResolutionResult>;
  repairOrchestrationWorkflow(input: RepairOrchestrationWorkflowInput): Promise<OrchestrationWorkflowRepairResult>;
  updateOrchestrationWorkflowSettings(input: UpdateOrchestrationWorkflowSettingsInput): Promise<OrchestrationWorkflowSettingsUpdateResult>;
  updateOrchestrationWorkflowRaw(input: UpdateOrchestrationWorkflowRawInput): Promise<OrchestrationWorkflowRawUpdateResult>;
  startOrchestrationRun(input: StartOrchestrationRunInput): Promise<OrchestrationBoard>;
  cancelOrchestrationRun(input: CancelOrchestrationRunInput): Promise<OrchestrationBoard>;
  revealOrchestrationWorkspace(input: RevealOrchestrationWorkspaceInput): Promise<void>;
  getOrchestrationAutoDispatchStatus(): Promise<OrchestrationAutoDispatchStatus>;
  setOrchestrationAutoDispatchEnabled(input: SetOrchestrationAutoDispatchInput): Promise<OrchestrationAutoDispatchStatus>;
  listWorkflowDashboard(): Promise<WorkflowDashboard>;
  getWorkflowRunDetail(input: WorkflowRunDetailInput): Promise<WorkflowRunDetail>;
  createWorkflowSampleArtifact(): Promise<WorkflowDashboard>;
  compileWorkflowPreview(input: CompileWorkflowPreviewInput): Promise<WorkflowDashboard>;
  compileWorkflowDebugRewrite(input: CompileWorkflowDebugRewriteInput): Promise<WorkflowDashboard>;
  reviewWorkflowArtifact(input: ReviewWorkflowArtifactInput): Promise<WorkflowDashboard>;
  updateWorkflowConnectorGrant(input: UpdateWorkflowConnectorGrantInput): Promise<WorkflowDashboard>;
  revalidateWorkflowArtifact(input: RevalidateWorkflowArtifactInput): Promise<WorkflowDashboard>;
  updateWorkflowArtifactSource(input: UpdateWorkflowArtifactSourceInput): Promise<WorkflowDashboard>;
  runWorkflowArtifact(input: RunWorkflowArtifactInput): Promise<WorkflowDashboard>;
  recoverWorkflowRun(input: RecoverWorkflowRunInput): Promise<WorkflowDashboard>;
  cancelWorkflowRun(input: CancelWorkflowRunInput): Promise<WorkflowDashboard>;
  cancelCallableWorkflowTask(input: CancelCallableWorkflowTaskInput): Promise<CallableWorkflowTaskSummary>;
  pauseCallableWorkflowTask(input: PauseCallableWorkflowTaskInput): Promise<CallableWorkflowTaskSummary>;
  resumeCallableWorkflowTask(input: ResumeCallableWorkflowTaskInput): Promise<CallableWorkflowTaskSummary>;
  resolveWorkflowApproval(input: ResolveWorkflowApprovalInput): Promise<WorkflowRunDetail>;
  resolveSubagentApproval(input: ResolveSubagentApprovalInput): Promise<SubagentApprovalResolutionResult>;
  resolveSubagentWaitBarrier(input: ResolveSubagentWaitBarrierInput): Promise<SubagentWaitBarrierResolutionResult>;
  cancelSubagentRun(input: CancelSubagentRunInput): Promise<SubagentRunSummary>;
  closeSubagentRun(input: CloseSubagentRunInput): Promise<SubagentRunSummary>;
  exportDiagnosticBundle(): Promise<DiagnosticExportResult | undefined>;
  importDiagnosticBundle(): Promise<DiagnosticExportResult | undefined>;
  exportChat(input: ExportChatInput): Promise<ExportChatResult | undefined>;
  exportChatPdf(input: ExportChatPdfInput): Promise<ExportChatPdfResult | undefined>;
  listPermissionAudit(): Promise<PermissionAuditEntry[]>;
  listPermissionGrants(): Promise<AmbientPermissionGrant[]>;
  listPendingPermissionRequests(): Promise<PermissionRequest[]>;
  createPermissionGrant(input: CreateAmbientPermissionGrantInput): Promise<AmbientPermissionGrant>;
  revokePermissionGrant(input: RevokeAmbientPermissionGrantInput): Promise<AmbientPermissionGrant>;
  respondPermissionRequest(id: string, response: PermissionPromptResponseMode): Promise<void>;
  respondPrivilegedCredentialRequest(input: PrivilegedCredentialPromptResponseInput): Promise<void>;
  respondSecureInputRequest(input: SecureInputPromptResponseInput): Promise<void>;
  saveAmbientCliSecret(input: SaveAmbientCliSecretInput): Promise<AmbientCliSecretSaveResult>;
  requestTerminalStart(input: RequestTerminalStartInput): Promise<TerminalStartIntent>;
  startTerminal(input: StartTerminalInput): Promise<TerminalSession>;
  submitTerminalCommand(input: SubmitTerminalCommandInput): Promise<void>;
  sendTerminalControl(input: TerminalControlInput): Promise<void>;
  resizeTerminal(input: ResizeTerminalInput): Promise<void>;
  stopTerminal(input: StopTerminalInput): Promise<void>;
  sendMessage(input: SendMessageInput): Promise<void>;
  abortRun(threadId: string): Promise<void>;
  getThreadGoal(input: ThreadGoalGetInput): Promise<ThreadGoal | undefined>;
  setThreadGoal(input: ThreadGoalSetInput): Promise<ThreadGoal>;
  clearThreadGoal(input: ThreadGoalClearInput): Promise<void>;
  getContextUsage(threadId: string): Promise<ContextUsageSnapshot>;
  compactThread(input: CompactThreadInput): Promise<ContextUsageSnapshot>;
  recoverThreadContext(input: RecoverThreadContextInput): Promise<ContextUsageSnapshot>;
  onEvent(listener: (event: DesktopEvent) => void): () => void;
  emitE2eEvent?(event: DesktopEvent): Promise<void>;
}
