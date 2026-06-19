import {
  Archive,
  Bell,
  BookOpenText,
  Bot,
  ChevronDown,
  Code2,
  Command,
  Copy,
  Download,
  Film,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Home,
  Info,
  Kanban,
  KeyRound,
  Minimize2,
  Mic,
  Moon,
  Music,
  PanelLeft,
  PanelRight,
  Paperclip,
  Pause,
  Package,
  Pencil,
  Pin,
  Play,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Star,
  Sun,
  Target,
  Terminal,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  FormEvent,
  ClipboardEvent as ReactClipboardEvent,
  FocusEvent as ReactFocusEvent,
  forwardRef,
  KeyboardEvent as ReactKeyboardEvent,
  memo,
  ReactNode,
  RefObject,
  startTransition,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  projectBoardActionState,
  projectBoardActiveCardDetail,
  projectBoardActiveCardOverviewModel,
  projectBoardAddCardsSourceScope,
  projectBoardCardCanSplit,
  projectBoardCardCanMarkReady,
  projectBoardCardClaimBlocksLocalTicketization,
  projectBoardCardClaimActionState,
  projectBoardCardClaimLabel,
  projectBoardCardClaimTitle,
  projectBoardCardCanEditDependencies,
  projectBoardCardIsDraftInboxCandidate,
  projectBoardCardEditCanSave,
  projectBoardCardEditDraft,
  projectBoardCardEditHasChanges,
  projectBoardCardEditInput,
  projectBoardCardEditWithClarificationAnswerInput,
  projectBoardCanonicalCardProjection,
  projectBoardCardVisualTone,
  projectBoardCharterReviewActionState,
  projectBoardClarificationAnswerInput,
  projectBoardCandidateClarificationItems,
  projectBoardPlanningWarningActionTitle,
  projectBoardPlanningWarningsForCard,
  projectBoardSynthesisRunProofScopeWarnings,
  projectBoardSynthesisRunPromptBudgetAudit,
  projectBoardSynthesisRunPromptBudgetMetrics,
  projectBoardCardSourceBasis,
  projectBoardCardsForSourceGroup,
  projectBoardBoardTabShowsDraftCallout,
  projectBoardBoardTabShowsExecutionPanels,
  projectBoardBoardTabStatusLabel,
  projectBoardColumns,
  projectBoardCollaborationReadiness,
  projectBoardComplexityEstimate,
  projectBoardCandidateStatusForDraftColumn,
  projectBoardCreateReadyTasksState,
  projectBoardDependencyEditOptions,
  projectBoardDependencyChangeImpactPreview,
  projectBoardCardDependencyBadges,
  projectBoardDependencyHealth,
  projectBoardDependencyRows,
  projectBoardBoardDecisionImpactRail,
  projectBoardDecisionImpactPreview,
  projectBoardDecisionQueue,
  projectBoardDeliverableIntegrationQueue,
  projectBoardDraftInboxCreateReadyPreview,
  projectBoardDraftInboxFilterOptions,
  projectBoardDraftColumns,
  projectBoardDraftColumnMoveState,
  projectBoardPiUpdateReviewQueue,
  projectBoardEmptyMessage,
  projectBoardEventGroups,
  projectBoardEventHasSupersededCardReview,
  projectBoardEventKindLabel,
  projectBoardEventSummary,
  projectBoardHistoryCollaborationAudit,
  projectBoardHistoryImpactAudit,
  projectBoardHistoryRecoveryQueue,
  projectBoardLiveSessionPreviewModel,
  projectBoardOverviewModel,
  projectBoardExecutionControlModel,
  projectBoardExecutionOverview,
  projectBoardExecutionReadinessRail,
  projectBoardExecutionPmReview,
  projectBoardWorkflowImpactPreview,
  projectBoardPhaseGroups,
  projectBoardPendingClarificationDecisions,
  projectBoardPendingClarificationQuestions,
  projectBoardPlanningSnapshotTicketizationState,
  projectBoardPrimaryBlockingCard,
  projectBoardProofDecisionModel,
  projectBoardProofFollowUpImpactModel,
  projectBoardProofCoverageForBoard,
  projectBoardProofReviewQueueSummary,
  projectBoardPmReviewReportUiModel,
  projectBoardProjectionReview,
  projectBoardProjectionReviewResolutionState,
  projectBoardResetImpact,
  projectBoardSourceFilterItems,
  projectBoardSourceChangeDetail,
  projectBoardSourceChangeFilterItems,
  projectBoardSourceChangeSummary,
  projectBoardSourceGroups,
  projectBoardSourceGroupsForChangeFilter,
  projectBoardSourceGroupsForFilter,
  projectBoardSourceGroupCanElaborate,
  projectBoardSourceGroupIncludedSourceIds,
  projectBoardSourceImpactPreview,
  projectBoardSourceInclusion,
  projectBoardSourceKindText,
  projectBoardSourceObservationLabel,
  projectBoardStatusLabel,
  projectBoardSupersededCardReview,
  projectBoardSuppressedForWorkflowRecordingThread,
  projectBoardSynthesisRunControlState,
  projectBoardTabs,
  projectBoardTestSummaryForBoard,
  projectBoardThreadPlanActionState,
  projectBoardUiMockReviewPanelModel,
  projectBoardUiMockReviewBadges,
  projectBoardKickoffDefaultProviderErrorMessage,
  projectBoardKickoffDefaultAnswer,
  projectBoardUnattachedLocalTasks,
  defaultProjectBoardTab,
  type ProjectBoardCardEditDraft,
  type ProjectBoardCardClaimAction,
  type ProjectBoardComplexityEstimate,
  type ProjectBoardDecisionQueueAuditFilterId,
  type ProjectBoardDecisionQueueRow,
  type ProjectBoardPlanningWarning,
  type ProjectBoardSourceGroup,
  type ProjectBoardSourceChangeFilterKind,
  type ProjectBoardSourceFilterKind,
  type ProjectBoardSupersededCardReview,
  type ProjectBoardSupersededCardReviewKind,
  type ProjectBoardTabId,
  type ProjectBoardDecisionImpactPreview,
  type ProjectBoardDraftInboxCreateReadyPreview,
  type ProjectBoardDraftInboxFilterId,
  type ProjectBoardDraftInboxFilterOption,
  type ProjectBoardHistoryRecoveryAction,
  type ProjectBoardHistoryRecoveryActionId,
  type ProjectBoardHistoryRecoveryRun,
  type ProjectBoardLiveSessionActivityLine,
  type ProjectBoardPiUpdateReviewQueue,
} from "./projectBoardUiModel";
import {
  moveWebResearchProvider,
  resetWebResearchRole,
  setWebResearchBrowserFallback,
  setWebResearchProviderEnabled,
  webResearchProviderHealthBadge,
  webResearchProviderSetupAction,
  webResearchProvidersForRole,
  webResearchStackWithDefaults,
} from "./searchWebSettingsModel";
import {
  latestReadyVoiceAutoplayTarget,
  messageVoiceStripModel,
  nextVoiceAutoplayDecision,
  voiceSettingsAuditRows,
  voiceThreadStatusModel,
  voiceSettingsProviderModel,
  voiceProviderForCapabilityId,
  voiceProviderLabelMap,
  voiceStateMatchesSelectedProvider,
} from "./voiceUiModel";
import {
  projectBoardKickoffAnswerState,
  projectBoardRunBlocksPlanning,
  projectBoardRunIsKickoffDefaults,
} from "../../shared/projectBoardSynthesisGate";
import {
  queuedSpeechFollowUpCount,
  sttDraftMetadataForSubmit,
  sttInsertTranscriptIntoDraft,
  sttProviderForCapabilityId,
  sttProviderCacheChanges,
  sttQueuedCountLabel,
  sttRuntimeQueuedCount,
  sttSettingsProviderModel,
  sttDiagnosticsModel,
  sttSetupResultModel,
  sttTranscriptReadyAction,
  type SttDraftMetadataState,
} from "./sttUiModel";
import {
  miniCpmVisionSetupActions,
  miniCpmVisionSetupResultModel,
} from "./miniCpmVisionUiModel";
import {
  localDeepResearchInstallProgressModel,
  localDeepResearchSetupActions,
  localDeepResearchSetupResultModel,
  type LocalDeepResearchDiagnosticItem,
  type LocalDeepResearchSetupAction,
  type LocalDeepResearchSetupResult,
} from "./localDeepResearchUiModel";
import {
  shortcutFromKeyboardEvent,
  sttShortcutLabel,
  sttShortcutMatchesEvent,
  sttShortcutReleaseMatchesEvent,
} from "./sttShortcut";
import { advanceTrailingSilence, listSttMicrophoneDevices, startSttMicrophoneRecorder, type SttMicrophoneRecorder } from "./sttMicrophoneRecorder";
import type { SttMicrophoneDevice, SttMicrophoneLevel, SttTrailingSilenceState } from "./sttMicrophoneRecorder";
import { parseMarkdownBlocks } from "./markdownBlockParser";
import { richMarkdownTableIconLabel, type RichMarkdownIconLabel } from "./richMarkdownIcons";
import { canRefreshOfficePreview, isPreparedLocalTaskWorkspace } from "./workspaceUiModel";
import {
  desktopEventMatchesProject,
  workspaceProjectAliasesForState,
  type WorkspaceProjectAliases,
} from "./workspaceEventMatching";
import {
  miniCpmVisualAnalyzeInputForBrowserScreenshot,
  miniCpmVisualAnalyzeInputForContextAttachment,
  miniCpmVisualAnalyzeInputForWorkspaceFile,
  miniCpmVisualMediaKindFromPath,
} from "./miniCpmVisualActionUiModel";
import { miniCpmVisionDiagnosticsForFailure } from "../../shared/miniCpmVisionDiagnostics";
import { miniCpmRemoteEndpointReviewChecklistText } from "../../shared/miniCpmRemoteEndpointSecurity";
import type { AutomationFolderSummary, AutomationScheduleSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type { BrowserCapabilityState, BrowserCredentialSummary, BrowserPickResult, BrowserProfileMode, BrowserRuntimeKind, BrowserScreenshotResult, BrowserUserActionState, SaveBrowserCredentialInput } from "../../shared/browserTypes";
import type { DesktopEvent, DesktopState, DesktopUpdateState, MenuCommand, ProviderCatalogSettingsCard, ProviderStatus, SendMessageComposerIntent, ThemePreference, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { DiagnosticExportResult } from "../../shared/diagnosticTypes";
import type { LocalDeepResearchInstallProgress, LocalDeepResearchRunHistoryEntry, LocalDeepResearchRunHistoryResult, MessageVoiceState, MiniCpmVisionAnalysisResult, MiniCpmVisionAnalyzeInput, MiniCpmVisionDiagnosticItem, MiniCpmVisionSetupAction, MiniCpmVisionSetupResult, SttMessageMetadata, SttProviderCandidate, SttProviderSetupResult, SttTestAudioResult, SttTranscriptionState, VoiceArtifactRetentionSummary, VoiceOnboardingHostFacts, VoiceProviderCandidate, VoiceProviderVoiceCandidate } from "../../shared/localRuntimeTypes";
import type { AmbientPermissionGrant, CreateAmbientPermissionGrantInput, PermissionAuditEntry, PermissionGrantScopeKind, PermissionMode, PermissionRequest, PrivilegedCredentialRequest, SecureInputRequest } from "../../shared/permissionTypes";
import type { AnswerPlannerDecisionQuestionInput, PlannerDecisionQuestion, PlannerPlanArtifact, PlannerPlanWorkflowState } from "../../shared/plannerTypes";
import type { AmbientGeneratedCapabilitySummary, AmbientMcpContainerRuntimeManagedInstallProgress, AmbientMcpContainerRuntimeStatus, AmbientMcpDefaultCapabilityInstallProgress, AmbientMcpInstalledServerSummary, AmbientMcpInstallPreview, AmbientMcpServerSearchResult, AmbientPluginAuthStartResult, AmbientPluginCapabilityDiagnostics, AmbientPluginRuntime, AmbientPluginSourceKind, CapabilityBuilderHistoryEntry, CapabilityBuilderHistoryResult, CodexHostedMarketplaceReport, CodexMarketplaceSourceSummary, CodexPluginCatalog, CodexPluginCompatibilityTier, CodexPluginMcpInspectionCatalog, CodexPluginSummary, FirstPartyGoogleIntegrationState, ManagedDevServerSummary, PiExtensionSandboxCatalog, PiExtensionSandboxInstallPreview, PiExtensionSandboxPackageSummary, PiPackageCatalog, PiPackageInstallScope, PiPackageResourceKind, PiPrivilegedCatalog, PiPrivilegedInstallSummary, PiPrivilegedSecurityScan, PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";
import type { AddProjectBoardCardRunFeedbackInput, ApplyProjectBoardDecisionImpactFeedbackInput, ApplyProjectBoardSourceImpactFeedbackInput, AttachProjectBoardLocalTaskMode, CopyProjectBoardSessionToThreadInput, CreateReadyProjectBoardTasksInput, DeferProjectBoardSynthesisSectionsInput, ProjectBoardAddCardsObjectiveProvenance, ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectBoardCardRunFeedbackSource, ProjectBoardEvent, ProjectBoardExecutionArtifact, ProjectBoardGitProjectionResolution, ProjectBoardGitSyncStatus, ProjectBoardProofDecisionAction, ProjectBoardQuestion, ProjectBoardSource, ProjectBoardSourceChangeState, ProjectBoardSourceKind, ProjectBoardSplitDecisionAction, ProjectBoardSummary, ProjectBoardSynthesisProposal, ProjectBoardSynthesisProposalCardReviewStatus, ProjectBoardSynthesisRun, ProjectBoardSynthesisRunProgressiveRecord, ProjectSummary, RecomputeProjectBoardProofCoverageInput, RefineProjectBoardSynthesisInput, RefreshProjectBoardDecisionDraftsInput, RefreshProjectBoardSourceDraftsInput, RegenerateProjectBoardDecisionDraftsInput, RegenerateProjectBoardSourceDraftsInput, RerunProjectBoardProofInput, ResolveProjectBoardCardPiUpdateInput, ResolveProjectBoardDeliverableIntegrationInput, RetryProjectBoardSynthesisInput, SplitProjectBoardCardInput, SuggestProjectBoardClarificationDefaultsInput, SuggestProjectBoardKickoffDefaultsInput, SuggestProjectBoardProofInput, UpdateProjectBoardCardInput, UpdateProjectBoardSourceInput } from "../../shared/projectBoardTypes";
import type { TerminalSession } from "../../shared/terminalTypes";
import type { CollaborationMode, ContextUsageSnapshot, MessageDelivery, RunStatus, ThinkingLevel, ThreadGoal, ThreadSummary, ToolLargeOutputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import type { OrchestrationRun, OrchestrationTask, RepairOrchestrationWorkflowAction, ResolveOrchestrationWorkflowImpactAction, UpdateOrchestrationWorkflowRawInput, UpdateOrchestrationWorkflowSettingsInput, WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowCompileAuditSummary, WorkflowCompileProgress, WorkflowDiscoveryProgress, WorkflowExplorationProgress, WorkflowModelCallRecord, WorkflowPluginCapabilityGrant, WorkflowRecordingEditContext, WorkflowRecordingLibraryEntry, WorkflowRecordingReviewDraftUpdate, WorkflowRecordingState, WorkflowRevisionSummary, WorkflowRunDetail, WorkflowRunEvent, WorkflowRunSummary, WorkflowVersionSummary } from "../../shared/workflowTypes";
import type { FileTreeEntry, GitReviewFile, GitReviewSummary, GitSimpleAction, WorkspaceContextReference, WorkspaceFileTree, WorkspaceGitStatus, WorkspaceSearchResult, WorkspaceSearchScope } from "../../shared/workspaceTypes";
import {
  projectBoardProofCoverageDrift,
  projectBoardProofCoverageRecheck,
  projectBoardLatestProofCoverageRecheckEvent,
} from "../../shared/projectBoardProofImpact";
import {
  DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS,
  projectBoardSynthesisOutputCapRecovery,
  projectBoardSynthesisPartialStatus,
  projectBoardSynthesisSectionStatuses,
  projectBoardSynthesisStaleRecovery,
  sectionStatusLabel,
  type ProjectBoardSectionStatusView,
} from "../../shared/projectBoardSynthesisRecovery";
import { AMBIENT_MODEL_OPTIONS, ambientModelLabel } from "../../shared/ambientModels";
import { resolveMessageDelivery } from "../../shared/messageDelivery";
import {
  sttMessageArtifactEntries,
  sttMessageMetadataFromTranscription,
  sttMessageMetadataFromUnknown,
} from "../../shared/sttMessageMetadata";
import { isRunStatusRunning, RUN_ABORT_ARM_DELAY_MS } from "../../shared/runStatus";
import {
  workflowRunEventDetailLabels,
} from "./workflowUiModel";
import { findWorkflowGraphNodeReviewActionTarget } from "./workflowGraphNodeReviewRouting";
import type { WorkflowGraphNodeReviewAction } from "./workflowGraphNodeReviewUiModel";
import {
  workflowReviewArtifactRunBlocked,
  workflowReviewWorkspaceViewModel,
} from "./workflowReviewUiModel";
import { workflowExplorationGateForThread } from "./workflowExplorationGateUiModel";
import {
  automationWorkspaceSelectionModel,
} from "./automationWorkspaceSelectionModel";
import { workflowThreadTranscriptCards, type WorkflowThreadTranscriptCard } from "./workflowThreadTranscriptUiModel";
import { useAutomationsWorkflowThreadController } from "./AutomationsWorkflowThreadController";
import { useAutomationsWorkflowDashboardController } from "./AutomationsWorkflowDashboardController";
import { useAutomationsWorkflowArtifactController } from "./AutomationsWorkflowArtifactController";
import {
  activeDraftWorkflowRevisionForThread,
  latestWorkflowRunForArtifact,
  useAutomationsWorkflowDiscoveryController,
} from "./AutomationsWorkflowDiscoveryController";
import { useAutomationsWorkflowWorkspaceController } from "./AutomationsWorkflowWorkspaceController";
import { useAutomationsWorkflowRecordingLibraryController } from "./AutomationsWorkflowRecordingLibraryController";
import { useAutomationsWorkspaceSurfaceController } from "./AutomationsWorkspaceSurfaceController";
import { createAutomationsWorkflowNavigationController } from "./AutomationsWorkflowNavigationController";
import {
  workflowRecorderLegacyCompilerEnabled,
  workflowRecorderInjectedPlaybookChip,
  workflowRecorderLibrarySidebarRows,
  workflowRecorderReviewDraftUpdateFromEditorFields,
  workflowRecorderReviewEditorFieldsFromDraft,
  workflowRecorderReviewModel,
  workflowRecorderStartActionState,
  workflowRecorderSurfaceModel,
  type WorkflowRecorderReviewEditorFields,
} from "./workflowRecorderUiModel";
import {
  WorkflowSplitHandle,
} from "./AutomationsWorkflowPanelRouting";
import {
  DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS,
  DEFAULT_WORKFLOW_FOREGROUND_TOTAL_LIMIT_MODE,
  type WorkflowRunTotalLimitMode,
} from "./workflowRunLimitsUiModel";
import {
  workflowCompileActionState,
} from "./automationUiModel";
import {
  filterGitBranches,
  gitCommitActionState,
  gitCreateBranchActionState,
  gitPullRequestActionState,
  gitPullRequestReadiness,
  gitStatusDetail,
  gitWorkModeSummary,
} from "./gitUiModel";
import { isScrolledToBottom, scrollToBottom } from "./scrolling";
import { applyDocumentAppearance } from "./appearance";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  parseStoredSidebarWidth,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from "./sidebarLayout";
import {
  buildCapabilityBuilderPrompt,
  buildFirstRunCapabilityOnboardingPrompt,
  buildProviderCatalogCardOnboardingPrompt,
  buildRemoteSurfaceActivationPrompt,
  buildVoiceProviderCapabilityPrompt,
  buildCapabilityBuilderHistoryPreviewPrompt,
  buildCapabilityBuilderHistoryRepairPlanPrompt,
  buildCapabilityBuilderHistoryReregisterPrompt,
  buildGeneratedCapabilityRemovalPlanPrompt,
  buildGeneratedCapabilityUpdatePlanPrompt,
  buildGeneratedCapabilityValidationPrompt,
  capabilityBuilderHistoryPreviewActionState,
  capabilityBuilderHistoryRepairPlanActionState,
  capabilityBuilderHistoryReregisterActionState,
  capabilityBuilderHistorySourceActionState,
  capabilityDiagnosticsActionState,
  codexImportActionState,
  codexMarketplaceAddActionState,
  codexMarketplaceRemoveActionState,
  defaultCapabilityBuilderLauncherDraft,
  filterAmbientCapabilities,
  filterAmbientPluginsBySource,
  formatAmbientAvailability,
  formatAmbientCapabilityKind,
  formatAmbientPluginSourceKind,
  formatAmbientRuntimeSupport,
  formatPluginMcpLaunchCommand,
  formatPluginMcpRuntimeEvent,
  generatedCapabilityRemovalPlanActionState,
  generatedCapabilitySummaryFromHistoryEntry,
  generatedCapabilitySourceActionState,
  generatedCapabilityUpdatePlanActionState,
  generatedCapabilityValidationActionState,
  googleWorkspaceAccountRows,
  googleWorkspaceActionState,
  googleWorkspaceConnectorLabel,
  googleWorkspaceStatusItems,
  googleWorkspaceValidationButtonView,
  googleWorkspaceValidationFeedbackForAccount,
  groupCodexImportCandidates,
  mcpContainerRuntimeDetailRows,
  mcpContainerRuntimeDiagnosticsActionState,
  mcpContainerRuntimeInstallActionViews,
  mcpContainerRuntimePrimaryActionLabel,
  mcpContainerRuntimeSetupResumeRows,
  mcpContainerRuntimeShouldOpenStartupPanel,
  mcpContainerRuntimeStatusLabel,
  mcpContainerRuntimeTone,
  mcpDefaultCapabilityInstallActionState,
  mcpDefaultCapabilityRuntimeHandoffCandidate,
  mcpInstalledServerStatusLabel,
  mcpServerInstallActionState,
  mcpServerSearchResultSubtitle,
  mcpServerUninstallActionState,
  mcpToolReviewAcceptActionState,
  piExtensionSandboxUninstallActionState,
  type AmbientPluginRuntimeFilter,
  type AmbientPluginSourceFilter,
  type CapabilityBuilderLauncherDraft,
  type GoogleWorkspaceValidationFeedback,
  piPackageEnableActionState,
  piPackageInstallActionState,
  piPackageUninstallActionState,
  piPrivilegedDisableActionState,
  piPrivilegedUninstallActionState,
  pluginAuthCompleteActionState,
  pluginDetailsActionState,
  providerCatalogSettingsCardsForArea,
  providerCatalogSettingsCardView,
} from "./pluginUiModel";
import {
  welcomeCoreSetupSections,
  welcomeOnboardingPageKindForMessages,
  welcomeOnboardingPageShouldOpenAtTop,
  type WelcomeSetupSection,
} from "./welcomeSetupUiModel";
import { welcomeOnboardingPageKindFromMetadata, type WelcomeOnboardingPageKind } from "../../shared/welcomeOnboarding";
import { googleWorkspaceGrantReview } from "./googleWorkspaceGrantUiModel";
import { permissionGrantRegistryModel, permissionGrantRevocationImpact } from "./permissionGrantRegistryUiModel";
import {
  collectArtifactPathHints,
  mediaPreviewUnavailableMessage,
  parseToolMessage,
  resolveInlineArtifactPath,
  toolLargeOutputPreviewViewModel,
  toolLongformInputPreviewDisplaySummary,
  toolMessagingConversationDirectorySetupCardViewModel,
  toolMessagingRemoteSurfaceActivationCardViewModel,
  type ArtifactMediaKind,
  type ArtifactPathHints,
  type ToolEditPreviewData,
  type ToolInstallRoutePreviewData,
  type ToolMessagingConversationDirectorySetupPreviewData,
  type ToolMessagingRemoteSurfaceActivationPreviewData,
  type ToolSttPreviewData,
  type ToolTelegramSessionSetupPreviewData,
  type ToolVoicePreviewData,
} from "./toolMessageUiModel";
import {
  parseCollaborationSlashCommand,
  parseSecretSlashCommand,
  plannerCanRefineWithAdditionalFeedback,
  plannerDecisionAnswerStatusLabel,
  plannerDecisionAnswerText,
  plannerDecisionQuestionsComplete,
  plannerDurableRevisionPrompt,
  plannerImplementationGoalMode,
  plannerImplementationPrompt,
  plannerNextDecisionQuestion,
  plannerRefinementPrompt,
  plannerRequiredDecisionQuestionsAnswered,
  plannerShouldAutoFinalizeAfterAnswer,
  plannerSortedOptions,
  plannerWorkflowStateLabel,
} from "./plannerModeUiModel";
import {
  messageContentWithoutDiagnostic,
  messageDiagnosticCardModel,
} from "./messageDiagnosticUiModel";
import { mergeRunActivityLine, normalizeRunActivityLineText } from "./runActivityUiModel";
import {
  shouldClearTransientErrorForActiveScope,
  type TransientErrorScope,
} from "./transientErrorUiModel";
import {
  isThinkingMessageForDisplay,
  shouldShowRunStatusCard,
  thinkingDisplayModeLabel,
  transientThinkingActivityLinesForDisplay,
  visibleMessagesForThinkingDisplay,
  visibleRunActivityLinesForThinkingDisplay,
} from "./thinkingDisplayUiModel";
import "./styles.css";
import {
  thinkingDisplayOptions,
  ApiKeyStatus,
  UtilityPanel,
  SettingsFocusRequest,
  ArtifactPreviewRequest,
  GitPanelTabRequest,
  GitConfirmation,
  VoiceProviderCacheStatus,
  VoiceProviderCacheActivity,
  VoiceCatalogRefreshState,
  SttProviderCacheStatus,
  SttProviderCacheActivity,
  SttProviderSetupUiState,
  MiniCpmVisionSetupUiState,
  LocalDeepResearchSetupUiState,
  LocalDeepResearchRunHistoryUiState,
  SttMicTestUiState,
  InfoTooltip,
  ProviderCatalogSettingsCards,
  LocalDeepResearchDiagnosticsList,
  InlineArtifactMedia,
  ambientBrowserRuntimeForUrl,
  desktopUpdateStatusText,
  contextAttachmentKey,
  clampNumber,
  contextUsagePresentation,
  RightPanel,
  GitConfirmationDialog,
  DiffOutput,
  formatTimelineTime,
  formatTaskState,
} from "./RightPanel";
import {
  LocalTasksPane,
  LocalTaskBoard,
} from "./AutomationsLocalTaskBoard";
import { useAutomationsLocalTaskController } from "./AutomationsLocalTaskController";
import { AutomationSelectedThreadDetailView } from "./AutomationsThreadDetailViews";
import {
  AutomationPaneRouter,
  AutomationProjectField,
  AutomationWorkspaceHeader,
  AutomationWorkspaceTabs,
  WorkflowAgentPaneRouter,
  automationWorkspaceActivePaneTooltip,
  automationWorkspacePaneTitle,
  automationWorkspaceShellModel,
  type AutomationPane,
  type AutomationWorkspaceTab,
} from "./AutomationsWorkspaceShellViews";
import {
  AutomationSchedulesFallbackPane,
  WorkflowFocusedSchedulesPane,
  workflowSchedulesPaneRouteModel,
} from "./AutomationsScheduleViews";
import {
  automationScheduleTargetSourcesModel,
  useAutomationScheduleController,
} from "./AutomationsScheduleController";
import { useWorkflowLabController } from "./AutomationsWorkflowLabController";
import {
  WorkflowLabPlaybookLibrarySection,
  WorkflowRecordingPlaybookLibrarySection,
  WorkflowRecordingPlaybookPane,
} from "./AutomationsWorkflowPlaybookViews";
import {
  AutomationHomePane,
  AutomationFolderPane,
  AutomationRunsReviewsPane,
  AutomationThreadCardGrid,
  WorkflowAgentCompilerStartPane,
  WorkflowLegacyHiddenPane,
  WorkflowRecorderStartPane,
  WorkflowRuntimeBrowserScreenshotPreview,
  automationThreadStatusGroups,
} from "./AutomationsWorkflowUtilityViews";
import { WorkflowBuildWorkspace, workflowBuildWorkspaceViewModel } from "./AutomationsWorkflowBuildViews";
import {
  WorkflowFocusedRunsPane,
  WorkflowRunCards,
} from "./AutomationsWorkflowRuntimeViews";
import {
  AutoDispatchStatusView,
  AutoDispatchToggle,
  LocalTaskRunList,
  PrepareResultView,
} from "./AutomationsRunHistory";
import {
  WorkflowAmbientCliCapabilityList,
  workflowConnectorAccountsByConnector,
} from "./AutomationsWorkflowEvidenceViews";
import {
  WorkflowCompileActivity,
  WorkflowReviewWorkspace,
} from "./AutomationsWorkflowReviewViews";
import {
  WorkflowAgentDiagramPane,
} from "./AutomationsWorkflowDiagramViews";
import {
  WorkflowExplorationPanel,
} from "./AutomationsWorkflowExplorationViews";
import {
  WorkflowDiscoveryThreadWorkspace,
  WorkflowRequestEditor,
  workflowDiscoveryThreadWorkspaceViewModel,
} from "./AutomationsWorkflowDiscoveryViews";
import { WorkflowThreadComposerView } from "./AutomationsWorkflowThreadComposerViews";
import {
  workflowArtifactPanelRenderers,
} from "./AutomationsWorkflowArtifactInspectorViews";
import {
  ProofEvidencePathLink,
  ProofOfWorkPreview,
} from "./AutomationsProofPreviewViews";

export { AutomationHeadingLabel } from "./AutomationsHeading";
export { useRunningClock } from "./AutomationsRunningClock";
export { AutomationSelectedThreadDetailView } from "./AutomationsThreadDetailViews";
export {
  AutomationWorkspaceHeader,
  AutomationWorkspaceTabs,
  automationWorkspaceActivePaneTooltip,
  automationWorkspaceHeaderModel,
  automationWorkspacePaneTitle,
  automationWorkspaceProjectSelectionModel,
  automationWorkspaceShellModel,
  type AutomationPane,
  type AutomationWorkspaceTab,
} from "./AutomationsWorkspaceShellViews";
export {
  AutomationSchedulesPane,
  WorkflowScheduleHistoryPanel,
  WorkflowSchedulesWorkspace,
  WorkflowScheduleOccurrenceEditor,
  datetimeLocalValueFromIso,
  defaultScheduleReplacementLocal,
  isoFromDatetimeLocalValue,
  workflowSchedulesPaneRouteModel,
  type WorkflowScheduleOccurrenceEditorState,
} from "./AutomationsScheduleViews";
export {
  WorkflowLabPanel,
  workflowLabPanelModel,
  type WorkflowLabBusy,
} from "./AutomationsWorkflowLabViews";
export {
  WorkflowLabPlaybookLibrarySection,
  WorkflowRecordingPlaybookLibrarySection,
  WorkflowRecordingPlaybookPane,
  workflowRecordingPlaybookMatchesQuery,
} from "./AutomationsWorkflowPlaybookViews";
export {
  AutomationHomeStatusGrid,
  AutomationHomePane,
  AutomationFolderPane,
  AutomationRunsReviewsPane,
  AutomationThreadCardGrid,
  AutomationExplainer,
  WorkflowAgentCompilerStartPane,
  WorkflowLegacyHiddenPane,
  WorkflowRecorderStartPane,
  WorkflowRuntimeBrowserScreenshotPreview,
  WorkflowThreadTranscript,
  automationIndicatorKind,
  automationThreadStatusGroups,
  type ThreadIndicatorKind,
} from "./AutomationsWorkflowUtilityViews";
export { WorkflowBuildWorkspace } from "./AutomationsWorkflowBuildViews";
export {
  WorkflowFocusedRunsPane,
  WorkflowPersistentStatusView,
  WorkflowRunCards,
  WorkflowRunConsole,
  WorkflowThreadRunsWorkspace,
  WorkflowRuntimeInputPanel,
} from "./AutomationsWorkflowRuntimeViews";
export {
  WorkflowExplorationPanel,
  WorkflowExplorationPreflightView,
} from "./AutomationsWorkflowExplorationViews";
export {
  WorkflowDiscoveryActivity,
  WorkflowDiscoveryContextReview,
  WorkflowDiscoveryQuestionView,
  WorkflowDiscoverySummary,
  WorkflowDiscoveryThreadWorkspace,
  WorkflowRequestEditor,
  WorkflowRevisionPanel,
  discoveryAccessResponseLabel,
  formatDiscoveryCapability,
  formatWorkflowTimeoutMode,
  workflowDiscoveryLiveStatusSubtitle,
  workflowDiscoveryLiveStatusTitle,
  workflowDiscoveryProgressDetail,
} from "./AutomationsWorkflowDiscoveryViews";
export { WorkflowOutputsPanel } from "./AutomationsWorkflowOutputViews";
export { WorkflowThreadComposerView } from "./AutomationsWorkflowThreadComposerViews";
export {
  WorkflowManifestPanel,
  WorkflowPermissionsPanel,
  WorkflowVersionHistoryPanel,
} from "./AutomationsWorkflowArtifactInspectorViews";
export {
  compareKanbanTasks,
  LocalTasksPane,
  taskNextState,
  taskPauseStateOptions,
  taskPreviousState,
  taskPrimaryStateOptions,
  taskStateOptions,
  taskTriggerLabel,
  taskUserLabels,
} from "./AutomationsLocalTaskBoard";
export {
  AutoDispatchStatusView,
  AutoDispatchToggle,
  LocalTaskRunList,
  PrepareResultView,
  RunTimeline,
  formatAutoDispatchStartedRun,
  formatDelay,
  formatOrchestrationRunStatus,
  formatRunDuration,
  isRestartInterruptedLocalTaskRun,
  orchestrationRunActionLabel,
  orchestrationTimelineEntries,
  terminalRunLabel,
} from "./AutomationsRunHistory";
export {
  WorkflowAmbientCliCallList,
  WorkflowAmbientCliCapabilityList,
  WorkflowConnectorCallList,
  WorkflowConnectorGrantList,
  WorkflowEventList,
  WorkflowModelCallList,
  WorkflowPluginCapabilityList,
  WorkflowStepList,
  workflowConnectorAccountsByConnector,
} from "./AutomationsWorkflowEvidenceViews";
export {
  WorkflowCompileActivity,
  WorkflowCompileAuditInlineCard,
  WorkflowCompileAuditReview,
  WorkflowProgramInspector,
  WorkflowReviewEvidenceStrip,
  WorkflowReviewWorkspace,
  WorkflowReviewTile,
  formatWorkflowCompileAuditList,
  workflowCompileActionIcon,
  workflowCompileAuditRuleIds,
} from "./AutomationsWorkflowReviewViews";
export {
  WorkflowAgentDiagramCanvas,
  WorkflowAgentDiagramPane,
  WorkflowAgentEdge,
  WorkflowAgentNode,
  workflowAgentEdgeTypes,
  workflowAgentNodeTypes,
  workflowDiagramNodeBounds,
  workflowGraphSnapshotWithActiveNode,
  workflowRecoveryBusyLabel,
} from "./AutomationsWorkflowDiagramViews";
export {
  ProofEvidencePathLink,
  ProofOfWorkPreview,
  ProofPacketInspectionPanel,
  ProofPreviewImage,
  ProofRichText,
  ProofVisualEvidenceGallery,
  ProofVisualEvidenceIcon,
  proofCspRenderableImageSrc,
  proofEvidenceFileHref,
  proofEvidenceLinkTarget,
  proofPreviewImageLocalPath,
  type ProofEvidenceLinkTarget,
  type ProofPreviewImageState,
} from "./AutomationsProofPreviewViews";
export { chatExportStatusMessage } from "./AutomationsWorkflowRecordingLibraryController";



export const workflowRecorderSurface = workflowRecorderSurfaceModel({
  legacyCompilerEnabled: workflowRecorderLegacyCompilerEnabled(import.meta.env.AMBIENT_LEGACY_WORKFLOW_COMPILER),
});

export const automationHelpText = workflowRecorderSurface.helpText;

export const automationHeadingTooltips = {
  home: workflowRecorderSurface.homeTooltip,
  folders: workflowRecorderSurface.foldersTooltip,
  workflowAgent: workflowRecorderSurface.workflowTooltip,
  localTasks: "Local Tasks are project-scoped automation jobs. Prepare next creates runnable workspaces, and auto-dispatch starts eligible prepared runs.",
  workflowLab: "Choose a saved workflow playbook, state the improvement goal, and run bounded Workflow Lab variants.",
  schedules: "Schedules define whether automation work runs manually, through auto-dispatch, or on a cron-like cadence once scheduled execution is connected.",
  runsReviews: "Runs and Reviews collects active runs, failed runs, workflow approvals, checkpoints, run chats, workspaces, and audit reports.",
  project: "Project is the workspace whose workflow configuration and files the automation will use.",
  triggerMode: "Trigger mode tells Ambient whether this work is manual, auto-dispatched when eligible, or intended for a scheduled cadence.",
  autoDispatch: "Auto-dispatch checks for ready local tasks on a timer and starts eligible prepared runs. Use the switch to pause or resume it for this workspace.",
  runConsole: "Run Console shows the selected workflow run, including approvals, checkpoints, events, and the generated audit preview.",
  recentRuns: "Recent Runs lists the newest local task runs in the selected automation scope.",
  reviewQueue: "Review Queue contains workflow changes that need approval before an automation can continue.",
  checkpoints: "Checkpoints are resumable workflow state. They let a run skip completed deterministic work after a pause or retry.",
  auditPreview: "Audit Preview summarizes what ran, what tools and connectors were allowed, and the proof collected for the run.",
  connectorGrants: "Connector Grants show which external data sources, scopes, operations, and retention policy the workflow is allowed to use.",
} as const;


export function workflowArtifactRunBlocked(artifact: WorkflowArtifactSummary): boolean {
  return workflowReviewArtifactRunBlocked(artifact);
}


export function automationPaneTitle(pane: AutomationPane, folder?: AutomationFolderSummary): string {
  return automationWorkspacePaneTitle(pane, folder, {
    homeTitle: workflowRecorderSurface.homeTitle,
    workflowAgentLabel: workflowRecorderSurface.newWorkflowLabel,
  });
}


export function activePaneTooltip(pane: AutomationPane): string {
  return automationWorkspaceActivePaneTooltip(pane, automationHeadingTooltips);
}


export function AutomationsWorkspace({
  activePane,
  selectedFolder,
  selectedThread,
  selectedWorkflowAgentFolder,
  selectedWorkflowAgentThread,
  selectedWorkflowRecording,
  folders,
  workflowAgentFolders,
  workflowRecordingLibrary,
  activeProjectName,
  activeProjectPath,
  activeThreadId,
  projects,
  orchestrationRevision,
  orchestrationAutoRevision,
  workflowRevision,
  workflowCompileProgress,
  workflowDiscoveryProgress,
  workflowExplorationProgressByThreadId,
  onWorkflowExplorationProgressChanged,
  permissionGrants,
  permissionAudit,
  permissionMode,
  model,
  thinkingLevel,
  permissionGrantRevoking,
  workspacePath,
  onWorkflowCompileProgressReset,
  onWorkflowRevisionChanged,
  onFoldersChanged,
  onWorkflowAgentFoldersChanged,
  onRevokePermissionGrant,
  onRevokePermissionGrantIds,
  onCreateProject,
  onStartWorkflowRecording,
  onSetWorkflowRecordingEnabled,
  onEditWorkflowRecordingPlaybook,
  onArchiveWorkflowRecordingPlaybook,
  onUnarchiveWorkflowRecordingPlaybook,
  onRestoreWorkflowRecordingVersion,
  workflowLibraryIncludeArchived,
  onWorkflowLibraryIncludeArchivedChange,
  onRefreshWorkflowRecordingLibrary,
  onDesktopStateChanged,
  onSelectWorkflowRecordingPlaybook,
  onSelectWorkflowAgentThread,
  onMoveThread,
  onSelectPane,
  onSelectThread,
  onOpenRunThread,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenMediaModal,
}: {
  activePane: AutomationPane;
  selectedFolder?: AutomationFolderSummary;
  selectedThread?: AutomationThreadSummary;
  selectedWorkflowAgentFolder?: WorkflowAgentFolderSummary;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  selectedWorkflowRecording?: WorkflowRecordingLibraryEntry;
  folders: AutomationFolderSummary[];
  workflowAgentFolders: WorkflowAgentFolderSummary[];
  workflowRecordingLibrary: WorkflowRecordingLibraryEntry[];
  activeProjectName: string;
  activeProjectPath: string;
  activeThreadId?: string;
  projects: ProjectSummary[];
  orchestrationRevision: number;
  orchestrationAutoRevision: number;
  workflowRevision: number;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowDiscoveryProgress?: WorkflowDiscoveryProgress;
  workflowExplorationProgressByThreadId: Record<string, WorkflowExplorationProgress | undefined>;
  onWorkflowExplorationProgressChanged: (workflowThreadId: string, progress: WorkflowExplorationProgress) => void;
  permissionGrants: AmbientPermissionGrant[];
  permissionAudit: PermissionAuditEntry[];
  permissionMode: PermissionMode;
  model: string;
  thinkingLevel: ThinkingLevel;
  permissionGrantRevoking?: string;
  workspacePath: string;
  onWorkflowCompileProgressReset: () => void;
  onWorkflowRevisionChanged: () => void;
  onFoldersChanged: (folders: AutomationFolderSummary[]) => void;
  onWorkflowAgentFoldersChanged: (folders: WorkflowAgentFolderSummary[]) => void;
  onRevokePermissionGrant: (id: string) => Promise<void>;
  onRevokePermissionGrantIds: (ids: string[], busyId: string) => Promise<void>;
  onCreateProject: () => Promise<DesktopState | undefined>;
  onStartWorkflowRecording: (goal: string) => Promise<boolean>;
  onSetWorkflowRecordingEnabled: (id: string, enabled: boolean) => Promise<void>;
  onEditWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onArchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void>;
  onUnarchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void>;
  onRestoreWorkflowRecordingVersion: (id: string, version: number) => Promise<void>;
  workflowLibraryIncludeArchived: boolean;
  onWorkflowLibraryIncludeArchivedChange: (includeArchived: boolean) => void;
  onRefreshWorkflowRecordingLibrary: () => Promise<void>;
  onDesktopStateChanged: (state: DesktopState) => void;
  onSelectWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onSelectWorkflowAgentThread: (thread: WorkflowAgentThreadSummary) => void;
  onMoveThread: (threadId: string, folderId: string) => Promise<void>;
  onSelectPane: (pane: AutomationPane) => void;
  onSelectThread: (thread: AutomationThreadSummary) => void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => Promise<void>;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
}) {
  const [workflowError, setWorkflowError] = useState<string | undefined>();
  const workspaceSurfaceController = useAutomationsWorkspaceSurfaceController({
    onFoldersChanged,
    onWorkflowAgentFoldersChanged,
  });
  const {
    orchestrationBoard,
    setOrchestrationBoard,
    orchestrationError,
    setOrchestrationError,
    autoDispatchStatus,
    setAutoDispatchStatus,
    automationPluginRegistry,
    refreshAutomationFolders,
    loadAutomationPluginRegistry,
    loadOrchestrationBoard,
    loadAutoDispatchStatus,
  } = workspaceSurfaceController;
  const {
    workflowLabRun,
    workflowLabGoal,
    setWorkflowLabGoal,
    workflowLabBusy,
    workflowLabStatus,
    createRunForPlaybook: createWorkflowLabRunForPlaybook,
    startRun: startWorkflowLabRun,
    stopRun: stopWorkflowLabRun,
    adoptBestVariant: adoptWorkflowLabBestVariant,
  } = useWorkflowLabController({ selectedWorkflowRecording, onDesktopStateChanged });
  const [workflowBusy, setWorkflowBusy] = useState<string | undefined>();
  const [workflowRunIdleTimeoutMs, setWorkflowRunIdleTimeoutMs] = useState(DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS);
  const [workflowRunTotalLimitMode, setWorkflowRunTotalLimitMode] = useState<WorkflowRunTotalLimitMode>(DEFAULT_WORKFLOW_FOREGROUND_TOTAL_LIMIT_MODE);
  const workflowRecordingLibraryController = useAutomationsWorkflowRecordingLibraryController({
    onRefreshWorkflowRecordingLibrary,
    onWorkflowErrorChanged: setWorkflowError,
  });
  const {
    workflowLibraryQuery,
    setWorkflowLibraryQuery,
    workflowLibraryRefreshing,
    workflowRecordingExportStatus,
    workflowRecordingExportBusyThreadId,
    refreshWorkflowRecordingLibraryFromHome,
    exportWorkflowRecordingPlaybookSession,
  } = workflowRecordingLibraryController;
  const workflowWorkspaceController = useAutomationsWorkflowWorkspaceController({
    selectedWorkflowAgentThreadId: selectedWorkflowAgentThread?.id,
  });
  const {
    workflowArtifactPanelByThreadId,
    workflowRunsPanelByThreadId,
    selectedWorkflowGraphNodeId,
    setSelectedWorkflowGraphNodeId,
    workflowSplitPercent,
    setWorkflowSplitPercent,
    workflowDiscoveryLayoutStyle,
    workflowSourceDrafts,
    setWorkflowSourceDraft,
    clearWorkflowSourceDraft,
    setWorkflowArtifactPanel,
    setWorkflowRunsPanel,
    setWorkflowBuildPanel,
  } = workflowWorkspaceController;
  const [taskProjectPath, setTaskProjectPath] = useState(activeProjectPath);
  const scheduleController = useAutomationScheduleController({
    activeThreadId,
    workspacePath,
    createPermissionGrantTargetHash: rendererPermissionGrantTargetHash,
  });
  const localTaskController = useAutomationsLocalTaskController({
    refreshAutomationFolders,
    loadAutoDispatchStatus,
    onOrchestrationBoardChanged: setOrchestrationBoard,
    onOrchestrationErrorChanged: setOrchestrationError,
    onAutoDispatchStatusChanged: setAutoDispatchStatus,
  });
  const {
    autoDispatchBusy,
    taskTitle,
    setTaskTitle,
    taskDescription,
    setTaskDescription,
    taskPriority,
    setTaskPriority,
    taskLabels,
    setTaskLabels,
    taskInitialState,
    setTaskInitialState,
    taskTriggerMode,
    setTaskTriggerMode,
    taskSchedulePreset,
    setTaskSchedulePreset,
    taskScheduleExpression,
    setTaskScheduleExpression,
    taskEditId,
    taskEditTitle,
    setTaskEditTitle,
    taskEditDescription,
    setTaskEditDescription,
    taskEditBusyId,
    taskBlockerDrafts,
    draggingTaskId,
    taskBusy,
    prepareBusy,
    prepareResult,
    startingRunId,
    cancelingRunId,
  } = localTaskController;
  const {
    scheduleTargetType,
    scheduleTargetId,
    schedulePreset,
    scheduleExpression,
    scheduleEnabled,
    scheduleRunIdleTimeoutMs,
    scheduleRunTotalLimitMode,
    automationSchedules,
    automationScheduleExceptions,
    focusedScheduleId,
    scheduleEditScope,
    scheduleOccurrenceEditor,
    workflowSchedulePanel,
    expandedScheduleHistoryId,
    scheduleBusy,
    scheduleError,
  } = scheduleController;
  const workflowDashboardController = useAutomationsWorkflowDashboardController({
    selectedWorkflowAgentThread,
    workflowRevision,
    workspacePath,
    onWorkflowBusyChanged: setWorkflowBusy,
    onWorkflowErrorChanged: setWorkflowError,
    onWorkflowAgentFoldersChanged,
    onSelectWorkflowAgentThread,
    onWorkflowExplorationProgressChanged,
    onWorkflowArtifactPanelChanged: setWorkflowArtifactPanel,
    onWorkflowRunsPanelChanged: setWorkflowRunsPanel,
    onScheduleFixture: scheduleController.applyScheduleFixture,
  });
  const {
    workflowDashboard,
    setWorkflowDashboard,
    workflowDetail,
    setWorkflowDetail,
    workflowRevisions,
    workflowVersions,
    workflowExplorationTracesByThreadId,
    setWorkflowExplorationTracesByThreadId,
    workflowDetailRunIdRef,
    workflowRunConsoleRef,
    loadWorkflowDashboard,
    loadWorkflowRevisions,
    loadWorkflowVersions,
    loadWorkflowExplorationTraces,
    selectWorkflowAgentThreadForArtifact,
    openWorkflowRunDetail,
  } = workflowDashboardController;
  const workflowDiscoveryController = useAutomationsWorkflowDiscoveryController({
    activeProjectPath,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread,
    workflowAgentFolders,
    workflowRevisions,
    workflowBusy,
    onWorkflowBusyChanged: setWorkflowBusy,
    onWorkflowDashboardChanged: setWorkflowDashboard,
    onWorkflowErrorChanged: setWorkflowError,
    onWorkflowCompileProgressReset,
    refreshAutomationFolders,
    loadWorkflowRevisions,
    loadWorkflowVersions,
    loadWorkflowExplorationTraces,
    onWorkflowAgentFoldersChanged,
    onSelectWorkflowAgentThread,
    onSelectWorkflowAgentThreadForArtifact: selectWorkflowAgentThreadForArtifact,
    onOpenWorkflowRunDetail: openWorkflowRunDetail,
    onWorkflowExplorationTracesChanged: setWorkflowExplorationTracesByThreadId,
    onWorkflowArtifactPanelChanged: setWorkflowArtifactPanel,
  });
  const {
    workflowCompileThreadId,
    workflowDiscoveryBusy,
    workflowDiscoveryAnswers,
    setWorkflowDiscoveryAnswers,
    optimisticWorkflowDiscoveryAnswers,
    workflowRequest,
    setWorkflowRequest,
    workflowRequestRestartDrafts,
    setWorkflowRequestRestartDrafts,
    workflowExplorationSkippedByThreadId,
    workflowRevisionSource,
    workflowRequestRef,
    createWorkflowSample,
    compileWorkflowPreview,
    startWorkflowDiscoveryFromRequest,
    answerWorkflowDiscoveryQuestion,
    restartWorkflowDiscoveryThread,
    resolveWorkflowDiscoveryAccessRequest,
    workflowExplorationBudgetsForThread,
    updateWorkflowExplorationBudget,
    resetWorkflowExplorationBudget,
    runWorkflowExplorationForThread,
    skipWorkflowExplorationForThread,
    compileWorkflowThreadPreview,
    startWorkflowArtifactRevision,
    clearWorkflowRevisionDraft,
    focusWorkflowRequestEditor,
    openWorkflowCompileDiagnostics,
    copyWorkflowCompileFailureReport,
  } = workflowDiscoveryController;
  const workflowArtifactController = useAutomationsWorkflowArtifactController({
    selectedWorkflowAgentThread,
    workflowDetailRunIdRef,
    workflowRunIdleTimeoutMs,
    workflowRunTotalLimitMode,
    onWorkflowBusyChanged: setWorkflowBusy,
    onWorkflowErrorChanged: setWorkflowError,
    onWorkflowDashboardChanged: setWorkflowDashboard,
    onWorkflowDetailChanged: setWorkflowDetail,
    onWorkflowCompileProgressReset,
    refreshAutomationFolders,
    loadWorkflowDashboard,
    loadWorkflowVersions,
    loadWorkflowThreadChatMessages: loadWorkflowThreadChatMessagesForArtifactController,
    onWorkflowRevisionChanged,
    onSelectWorkflowAgentThread,
    onOpenWorkflowRunDetail: openWorkflowRunDetail,
    onWorkflowSourceDraftClear: clearWorkflowSourceDraft,
    workflowArtifactForRecovery,
  });
  const {
    runLimitsForArtifact: workflowRunLimitOverridesForArtifact,
    reviewWorkflowArtifact,
    updateWorkflowConnectorRetention,
    updateWorkflowConnectorAccount,
    rejectWorkflowConnectorGrant,
    removeWorkflowConnectorScope,
    revalidateWorkflowArtifactPreview,
    saveWorkflowArtifactSource,
    runWorkflowArtifact,
    answerWorkflowRuntimeInput,
    resumeWorkflowTotalRuntimePause,
    recoverWorkflowRun,
    debugRewriteWorkflowRun,
    resolveWorkflowRevisionProposal,
    restoreWorkflowVersionForReview,
    cancelWorkflowRun,
    resolveWorkflowApproval,
  } = workflowArtifactController;
  const workflowThreadController = useAutomationsWorkflowThreadController({
    selectedWorkflowAgentThread,
    workflowRevision,
    workflowBusy,
    workflowDiscoveryBusy,
    permissionMode,
    model,
    thinkingLevel,
    refreshAutomationFolders,
    loadWorkflowRevisions,
    loadWorkflowVersions,
    loadWorkflowDashboard,
    onWorkflowErrorChanged: setWorkflowError,
    onSelectWorkflowAgentThread,
    onWorkflowRevisionChanged,
    onAnswerWorkflowRuntimeInput: answerWorkflowRuntimeInput,
    onResumeWorkflowTotalRuntimePause: resumeWorkflowTotalRuntimePause,
    onRecoverWorkflowRun: recoverWorkflowRun,
    onDebugRewriteWorkflowRun: debugRewriteWorkflowRun,
  });
  const {
    workflowThreadComposerDrafts,
    setWorkflowThreadComposerDrafts,
    workflowThreadComposerBusy,
    workflowThreadSessionBusy,
    workflowThreadChatMessagesByThreadId,
    workflowThreadPlanEditActivityByThreadId,
    loadWorkflowThreadChatMessages,
    prepareWorkflowThreadSession,
    sendWorkflowThreadComposer,
  } = workflowThreadController;

  function renderWorkflowSplitHandle() {
    return <WorkflowSplitHandle splitPercent={workflowSplitPercent} onSplitPercentChange={setWorkflowSplitPercent} />;
  }

  useEffect(() => {
    void loadAutomationSurface();
  }, [orchestrationRevision, orchestrationAutoRevision, workflowRevision]);

  const automationSelection = automationWorkspaceSelectionModel({
    folders,
    selectedThread,
    activePane,
    selectedFolder,
    orchestrationBoard,
    workflowDashboard,
    selectedWorkflowAgentThread,
    workflowDetail,
    selectedWorkflowGraphNodeId,
    workflowAgentFolders,
  });
  const {
    allAutomationThreads,
    visibleThreads,
    visibleTasks,
    visibleTaskRuns,
    selectedArtifact,
    selectedTask,
    selectedWorkflowAgentArtifact,
    selectedWorkflowAgentDetail,
    selectedWorkflowAgentSourceNode,
    selectedAutomationRun,
    workflowRuns,
    allTaskRuns,
    artifactById,
    taskById,
    workflowAgentThreadById,
    workflowAgentThreadByArtifactId,
    selectedArtifactWorkflowThread,
    selectedArtifactThreadRoute,
  } = automationSelection;

  function workflowArtifactForRecovery(artifactId: string): WorkflowArtifactSummary | undefined {
    return selectedWorkflowAgentArtifact?.id === artifactId
      ? selectedWorkflowAgentArtifact
      : workflowDashboard?.artifacts.find((candidate) => candidate.id === artifactId);
  }

  function loadWorkflowThreadChatMessagesForArtifactController(threadId?: string) {
    return loadWorkflowThreadChatMessages(threadId);
  }

  const automationShellModel = automationWorkspaceShellModel({
    activePane,
    selectedFolder,
    selectedWorkflowRecording,
    selectedWorkflowAgentThread,
    selectedThread,
    allAutomationThreads,
    folders,
    projects,
    activeProjectName,
    activeProjectPath,
    taskProjectPath,
    legacyCompilerEnabled: workflowRecorderSurface.legacyCompilerEnabled,
    paneCopy: {
      homeTitle: workflowRecorderSurface.homeTitle,
      workflowAgentLabel: workflowRecorderSurface.newWorkflowLabel,
      tooltips: automationHeadingTooltips,
    },
  });
  const automationHeaderModel = automationShellModel.header;
  const { projectOptions, selectedTaskProjectPath } = automationShellModel.projectSelection;
  useEffect(() => {
    setTaskProjectPath(activeProjectPath);
  }, [activeProjectPath]);
  const workflowConnectorAccounts = useMemo(() => workflowConnectorAccountsByConnector(automationPluginRegistry), [automationPluginRegistry]);

  useEffect(() => {
    if (projectOptions.some((project) => project.path === taskProjectPath)) return;
    setTaskProjectPath(activeProjectPath);
  }, [activeProjectPath, projectOptions, taskProjectPath]);

  async function loadAutomationSurface() {
    await Promise.all([loadOrchestrationBoard(), loadAutoDispatchStatus(), loadWorkflowDashboard(), loadAutomationPluginRegistry(), scheduleController.loadAutomationSchedules(), refreshAutomationFolders()]);
  }

  const workflowNavigationController = createAutomationsWorkflowNavigationController({
    selection: automationSelection,
    actions: {
      onSelectPane,
      onSelectThread,
      onSelectWorkflowAgentThread,
      selectWorkflowAgentThreadForArtifact,
      setWorkflowArtifactPanel,
      setWorkflowBuildPanel,
      setWorkflowRunsPanel,
      setWorkflowSchedulePanel: scheduleController.setWorkflowSchedulePanel,
    },
  });
  const {
    automationThreadRouteDetail,
    openAutomationThreadCard,
    openWorkflowArtifactThread,
    openWorkflowPanelFromTranscript,
    openWorkflowPersistentStatusTarget,
    workflowAgentThreadForArtifact,
  } = workflowNavigationController;

  function automationScheduleTargetSources() {
    return automationScheduleTargetSourcesModel({
      workflowRecordingLibrary,
      workflowArtifacts: workflowDashboard?.artifacts ?? [],
      workflowAgentFolders,
      folders,
      tasks: orchestrationBoard?.tasks ?? [],
    });
  }

  async function createProjectForLocalTask() {
    setOrchestrationError(undefined);
    try {
      const next = await onCreateProject();
      if (next) setTaskProjectPath(next.workspace.path);
    } catch (error) {
      setOrchestrationError(error instanceof Error ? error.message : String(error));
    }
  }

  function renderProjectField() {
    return (
      <AutomationProjectField
        projects={projectOptions}
        selectedPath={selectedTaskProjectPath}
        tooltip={automationHeadingTooltips.project}
        onProjectPathChange={setTaskProjectPath}
        onCreateProject={createProjectForLocalTask}
      />
    );
  }

  function renderThreadCards(threads: AutomationThreadSummary[], emptyText: string) {
    return (
      <AutomationThreadCardGrid
        threads={threads}
        emptyText={emptyText}
        routeDetailForThread={automationThreadRouteDetail}
        onOpenThread={openAutomationThreadCard}
      />
    );
  }

  function renderAutoDispatchStatus() {
    return <AutoDispatchStatusView status={autoDispatchStatus} workflowReadiness={orchestrationBoard?.workflowReadiness} />;
  }

  function renderAutoDispatchToggle() {
    return <AutoDispatchToggle status={autoDispatchStatus} busy={autoDispatchBusy} tooltip={automationHeadingTooltips.autoDispatch} onChange={localTaskController.setAutoDispatch} />;
  }

  function renderPrepareResult() {
    return <PrepareResultView result={prepareResult} />;
  }

  function renderTaskRuns(runs: OrchestrationRun[], limit = 6) {
    return (
      <LocalTaskRunList
        runs={runs}
        limit={limit}
        taskById={taskById}
        startingRunId={startingRunId}
        cancelingRunId={cancelingRunId}
        onOpenRunThread={onOpenRunThread}
        onRevealWorkspace={localTaskController.revealOrchestrationWorkspace}
        onStartRun={localTaskController.startOrchestrationRun}
        onCancelRun={localTaskController.cancelOrchestrationRun}
        renderProofOfWorkPreview={(run) => <ProofOfWorkPreview run={run} />}
      />
    );
  }

  function renderWorkflowRunCards(runs: WorkflowRunSummary[], limit = 6) {
    return (
      <WorkflowRunCards
        runs={runs}
        limit={limit}
        artifactById={artifactById}
        workflowBusy={workflowBusy}
        onOpenRunDetail={(runId) => void openWorkflowRunDetail(runId, { focusConsole: true })}
        onOpenSchedule={(scheduleId) => {
          scheduleController.focusScheduleHistory(scheduleId);
          onSelectPane("schedules");
        }}
        onResumeRun={(run, artifact) =>
          void runWorkflowArtifact(artifact.id, "execute", {
            resumeFromRunId: run.id,
            allowUnapproved: artifact.status !== "approved",
            runLimits: workflowRunLimitOverridesForArtifact(artifact),
          })
        }
      />
    );
  }

  const workflowArtifactPanels = workflowArtifactPanelRenderers({
    state: {
      workflowBusy,
      workflowRunIdleTimeoutMs,
      workflowRunTotalLimitMode,
      permissionGrants,
      permissionAudit,
      activeThreadId,
      workspacePath,
      workflowConnectorAccounts,
      automationPluginRegistry,
      permissionGrantRevoking,
      workflowSourceDrafts,
      selectedWorkflowAgentArtifactId: selectedWorkflowAgentArtifact?.id,
      selectedWorkflowAgentSourceNode,
      selectedWorkflowAgentThreadNodes: selectedWorkflowAgentThread?.graph?.nodes,
      workflowVersions,
      workflowRevisions,
      runConsoleRef: workflowRunConsoleRef,
    },
    actions: {
      onWorkflowRunIdleTimeoutChange: setWorkflowRunIdleTimeoutMs,
      onWorkflowRunTotalLimitModeChange: setWorkflowRunTotalLimitMode,
      onWorkflowConnectorAccountChange: updateWorkflowConnectorAccount,
      onWorkflowConnectorRetentionChange: updateWorkflowConnectorRetention,
      onRemoveWorkflowConnectorScope: removeWorkflowConnectorScope,
      onRejectWorkflowConnectorGrant: rejectWorkflowConnectorGrant,
      onRevokePermissionGrantIds,
      onRevokePermissionGrant,
      onOpenRunDetail: openWorkflowRunDetail,
      onCancelRun: cancelWorkflowRun,
      onRunArtifact: runWorkflowArtifact,
      runLimitsForArtifact: workflowRunLimitOverridesForArtifact,
      onCloseRunConsole: () => {
        workflowDetailRunIdRef.current = undefined;
        setWorkflowDetail(undefined);
      },
      onResumeTotalRuntimePause: resumeWorkflowTotalRuntimePause,
      onSelectSourceNode: setSelectedWorkflowGraphNodeId,
      onSourceDraftChange: setWorkflowSourceDraft,
      onSourceDraftClear: clearWorkflowSourceDraft,
      onSourceSave: saveWorkflowArtifactSource,
      onResolveApproval: resolveWorkflowApproval,
      onAnswerRuntimeInput: answerWorkflowRuntimeInput,
      onRevealBrowser: (request) =>
        window.ambientDesktop.revealBrowser(request).catch((error) => {
          setWorkflowError(error instanceof Error ? error.message : String(error));
        }),
      onPreviewPath,
      onPreviewLocalPath,
      onOpenMediaModal,
      onStartRevision: startWorkflowArtifactRevision,
      onResolveRevision: resolveWorkflowRevisionProposal,
      onRestoreVersionForReview: restoreWorkflowVersionForReview,
    },
  });

  function renderWorkflowReviewWorkspace(thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) {
    const reviewModel = workflowReviewWorkspaceViewModel({
      thread,
      artifact,
      runs: workflowDashboard?.runs ?? [],
      detail: selectedWorkflowAgentDetail,
      versions: workflowVersions,
      schedules: automationSchedules,
      permissionGrants,
      permissionAudit,
      permissionMode,
      auditThreadId: activeThreadId,
      workspacePath,
      selectedWorkflowAgentThreadId: selectedWorkflowAgentThread?.id,
      selectedWorkflowAgentSourceNode,
      runLimits: workflowRunLimitOverridesForArtifact(artifact),
    });
    return (
      <WorkflowReviewWorkspace
        threadId={thread.id}
        discoveryQuestions={thread.discoveryQuestions}
        artifact={artifact}
        latestRun={reviewModel.latestRun}
        detail={reviewModel.detail}
        review={reviewModel.review}
        runBlocked={reviewModel.runBlocked}
        runLimits={reviewModel.runLimits}
        currentVersion={reviewModel.currentVersion}
        selectedSourceNode={reviewModel.selectedSourceNode}
        sourceNodes={reviewModel.sourceNodes}
        scheduleState={reviewModel.scheduleState}
        workflowGrantRegistry={reviewModel.workflowGrantRegistry}
        workflowRunIdleTimeoutMs={workflowRunIdleTimeoutMs}
        workflowRunTotalLimitMode={workflowRunTotalLimitMode}
        workflowBusy={workflowBusy}
        schedulePreset={schedulePreset}
        scheduleExpression={scheduleExpression}
        scheduleEnabled={scheduleEnabled}
        scheduleBusy={scheduleBusy}
        scheduleTargetType={scheduleTargetType}
        scheduleError={scheduleError}
        expandedScheduleHistoryId={expandedScheduleHistoryId}
        permissionGrantRevoking={permissionGrantRevoking}
        workflowSourceDraft={workflowSourceDrafts[artifact.id]}
        connectorAccounts={workflowConnectorAccounts}
        pluginRegistry={automationPluginRegistry}
        connectorGrantsTooltip={automationHeadingTooltips.connectorGrants}
        auditPreviewTooltip={automationHeadingTooltips.auditPreview}
        reviewQueueTooltip={automationHeadingTooltips.reviewQueue}
        renderVersionHistory={() => workflowArtifactPanels.renderVersionHistoryPanel(thread, artifact)}
        auditReportPreview={workflowAuditReportPreview}
        onOpenPanel={(panel) => openWorkflowPanelFromTranscript(thread.id, panel)}
        onWorkflowRunIdleTimeoutMsChange={setWorkflowRunIdleTimeoutMs}
        onWorkflowRunTotalLimitModeChange={setWorkflowRunTotalLimitMode}
        onRevalidateArtifact={(artifactId) => revalidateWorkflowArtifactPreview(artifactId)}
        onRunArtifact={(artifactId, mode, options) => runWorkflowArtifact(artifactId, mode, options)}
        onOpenRunDetail={(runId) => openWorkflowRunDetail(runId, { focusConsole: true })}
        onReviewArtifact={(artifactId, status) => reviewWorkflowArtifact(artifactId, status)}
        onStartRevision={startWorkflowArtifactRevision}
        onScheduleThread={(threadId) => {
          scheduleController.setScheduleTarget("workflow_thread", threadId);
          onSelectPane("schedules");
        }}
        onCancelRun={cancelWorkflowRun}
        onSchedulePresetChange={scheduleController.setSchedulePreset}
        onScheduleExpressionChange={scheduleController.setScheduleExpression}
        onScheduleEnabledChange={scheduleController.setScheduleEnabled}
        onCreateSchedule={(targetKind, targetId) => scheduleController.createWorkflowReviewSchedule(targetKind, targetId, selectedWorkflowAgentArtifact)}
        onCreateScheduleGrant={(schedule) => scheduleController.createWorkflowScheduleGrant(thread, schedule)}
        onSetExpandedScheduleHistoryId={scheduleController.setExpandedScheduleHistoryId}
        onConnectorAccountChange={(connector, nextAccountId) => updateWorkflowConnectorAccount(artifact.id, connector, nextAccountId)}
        onConnectorRetentionChange={(connector, dataRetention) => updateWorkflowConnectorRetention(artifact.id, connector, dataRetention)}
        onConnectorScopeRemove={(connector, scope) => removeWorkflowConnectorScope(artifact.id, connector, scope)}
        onConnectorReject={(connector) => rejectWorkflowConnectorGrant(artifact.id, connector)}
        onRevokePermissionGrantIds={onRevokePermissionGrantIds}
        onRevokePermissionGrant={onRevokePermissionGrant}
        onSelectSourceNode={setSelectedWorkflowGraphNodeId}
        onSourceDraftChange={(source) => setWorkflowSourceDraft(artifact.id, source)}
        onSourceDraftClear={() => clearWorkflowSourceDraft(artifact.id)}
        onSourceSave={(source) => saveWorkflowArtifactSource(artifact.id, source)}
        onResolveApproval={(runId, approvalId, decision) => resolveWorkflowApproval(runId, approvalId, decision)}
      />
    );
  }

  function renderLocalTaskBoard(tasks: OrchestrationTask[]) {
    return (
      <LocalTaskBoard
        loaded={Boolean(orchestrationBoard)}
        tasks={tasks}
        runs={orchestrationBoard?.runs ?? []}
        draggingTaskId={draggingTaskId}
        taskEditId={taskEditId}
        taskEditTitle={taskEditTitle}
        taskEditDescription={taskEditDescription}
        taskEditBusyId={taskEditBusyId}
        taskBlockerDrafts={taskBlockerDrafts}
        onAllowTaskDrop={localTaskController.allowTaskDrop}
        onDropTaskOnState={(event, state) => localTaskController.dropTaskOnState(event, state, orchestrationBoard?.tasks ?? [])}
        onStartTaskDrag={localTaskController.startTaskDrag}
        onTaskDragEnd={localTaskController.endTaskDrag}
        onUpdateTaskState={localTaskController.updateTaskState}
        onTaskEditTitleChange={setTaskEditTitle}
        onTaskEditDescriptionChange={setTaskEditDescription}
        onSaveTaskEdit={localTaskController.saveTaskEdit}
        onCancelTaskEdit={localTaskController.cancelTaskEdit}
        onStartTaskEdit={localTaskController.startTaskEdit}
        onUpdateTaskPriority={localTaskController.updateTaskPriority}
        onUpdateTaskLabels={localTaskController.updateTaskLabels}
        onUpdateTaskBlockers={localTaskController.updateTaskBlockers}
        onSetTaskBlockerDraft={localTaskController.setTaskBlockerDraft}
        onClearTaskBlockerDraft={localTaskController.clearTaskBlockerDraft}
        onOpenRunThread={onOpenRunThread}
        onRevealWorkspace={localTaskController.revealOrchestrationWorkspace}
      />
    );
  }

  function renderWorkflowRecorderStartPane() {
    const recorder = workflowRecorderSurface.startPane;
    const recorderStartBusy = workflowBusy === "recorder:start";
    const recorderStartAction = workflowRecorderStartActionState({
      request: workflowRequest,
      busy: recorderStartBusy,
      readyTitle: recorder.disabledStartTitle,
    });
    const startRecordingFromPane = async () => {
      if (recorderStartAction.needsRequest) {
        setWorkflowError(recorderStartAction.title);
        workflowRequestRef.current?.focus();
        return;
      }
      setWorkflowBusy("recorder:start");
      setWorkflowError(undefined);
      try {
        const started = await onStartWorkflowRecording(workflowRequest);
        if (started) setWorkflowRequest("");
      } catch (err) {
        setWorkflowError(err instanceof Error ? err.message : String(err));
      } finally {
        setWorkflowBusy(undefined);
      }
    };
    return (
      <WorkflowRecorderStartPane
        recorder={recorder}
        workflowAgentTooltip={automationHeadingTooltips.workflowAgent}
        workflowRequest={workflowRequest}
        workflowError={workflowError}
        recorderStartBusy={recorderStartBusy}
        recorderStartAction={recorderStartAction}
        projectField={renderProjectField()}
        requestTextareaRef={workflowRequestRef}
        onWorkflowRequestChange={setWorkflowRequest}
        onStartRecording={startRecordingFromPane}
      />
    );
  }

  function renderLegacyWorkflowHiddenPane(thread: WorkflowAgentThreadSummary) {
    const hidden = workflowRecorderSurface.legacyHidden;
    return (
      <WorkflowLegacyHiddenPane
        thread={thread}
        hidden={hidden}
        primaryCreateLabel={workflowRecorderSurface.primaryCreateLabel}
        workflowAgentTooltip={automationHeadingTooltips.workflowAgent}
      />
    );
  }

  function renderWorkflowRecordingPlaybookPane(playbook: WorkflowRecordingLibraryEntry) {
    return (
      <WorkflowRecordingPlaybookPane
        playbook={playbook}
        workflowRecordingExportBusyThreadId={workflowRecordingExportBusyThreadId}
        workflowRecordingExportStatus={workflowRecordingExportStatus}
        workflowLabRun={workflowLabRun}
        workflowLabBusy={workflowLabBusy}
        workflowLabGoal={workflowLabGoal}
        workflowLabStatus={workflowLabStatus}
        onEditWorkflowRecordingPlaybook={onEditWorkflowRecordingPlaybook}
        onPreviewLocalPath={onPreviewLocalPath}
        onExportWorkflowRecordingPlaybookSession={exportWorkflowRecordingPlaybookSession}
        onRestoreWorkflowRecordingVersion={onRestoreWorkflowRecordingVersion}
        onSchedulePlaybook={(entry) => {
          scheduleController.clearFocusedSchedule();
          scheduleController.setScheduleTarget("workflow_playbook", entry.id);
          onSelectPane("schedules");
        }}
        onSetWorkflowRecordingEnabled={onSetWorkflowRecordingEnabled}
        onUnarchiveWorkflowRecordingPlaybook={onUnarchiveWorkflowRecordingPlaybook}
        onArchiveWorkflowRecordingPlaybook={onArchiveWorkflowRecordingPlaybook}
        onWorkflowLabGoalChange={setWorkflowLabGoal}
        onCreateWorkflowLabRun={(entry) => void createWorkflowLabRunForPlaybook(entry)}
        onStartWorkflowLabRun={() => void startWorkflowLabRun()}
        onStopWorkflowLabRun={() => void stopWorkflowLabRun()}
        onAdoptWorkflowLabBestVariant={() => void adoptWorkflowLabBestVariant()}
      />
    );
  }

  function renderWorkflowAgentCompilerStartPane() {
    const compileAction = workflowCompileActionState({
      request: workflowRequest,
      compiling: workflowBusy === "compile",
      blocked: Boolean(workflowBusy) && workflowBusy !== "compile",
    });
    const discoveryDisabled = !workflowRequest.trim() || Boolean(workflowDiscoveryBusy) || Boolean(workflowBusy);

    return (
      <WorkflowAgentCompilerStartPane
        workflowRequest={workflowRequest}
        workflowError={workflowError}
        workflowBusy={workflowBusy}
        workflowAgentTooltip={automationHeadingTooltips.workflowAgent}
        startDiscoveryBusy={workflowDiscoveryBusy === "start"}
        discoveryDisabled={discoveryDisabled}
        compileAction={compileAction}
        revisionSourceTitle={workflowRevisionSource?.title}
        projectField={renderProjectField()}
        compileActivity={
          <WorkflowCompileActivity
            active={workflowBusy === "compile"}
            progress={workflowCompileProgress}
            onRetrySameContext={() => void compileWorkflowPreview()}
            onOpenDiagnostics={(path) => void openWorkflowCompileDiagnostics(path)}
            onEditRequest={focusWorkflowRequestEditor}
            onReportUnsupported={(reportText) => void copyWorkflowCompileFailureReport(reportText)}
          />
        }
        requestTextareaRef={workflowRequestRef}
        onWorkflowRequestChange={setWorkflowRequest}
        onRefreshDashboard={loadWorkflowDashboard}
        onCreateSample={createWorkflowSample}
        onStartDiscovery={startWorkflowDiscoveryFromRequest}
        onCompile={compileWorkflowPreview}
        onClearRevision={clearWorkflowRevisionDraft}
      />
    );
  }

  function renderWorkflowAgentPane() {
    const selectedDraftRevision = activeDraftWorkflowRevision(selectedWorkflowAgentThread?.id);
    return (
      <WorkflowAgentPaneRouter
        legacyCompilerEnabled={workflowRecorderSurface.legacyCompilerEnabled}
        selectedWorkflowRecordingActive={Boolean(selectedWorkflowRecording)}
        selectedWorkflowAgentThread={selectedWorkflowAgentThread}
        selectedDraftRevisionActive={Boolean(selectedDraftRevision)}
        renderWorkflowRecordingPlaybookPane={() => (selectedWorkflowRecording ? renderWorkflowRecordingPlaybookPane(selectedWorkflowRecording) : null)}
        renderLegacyWorkflowHiddenPane={() => (selectedWorkflowAgentThread ? renderLegacyWorkflowHiddenPane(selectedWorkflowAgentThread) : null)}
        renderWorkflowRecorderStartPane={renderWorkflowRecorderStartPane}
        renderWorkflowDiscoveryThread={() => (selectedWorkflowAgentThread ? renderWorkflowDiscoveryThread(selectedWorkflowAgentThread, selectedDraftRevision) : null)}
        renderWorkflowThreadDetail={() => (selectedWorkflowAgentThread ? renderWorkflowThreadDetail(selectedWorkflowAgentThread, selectedWorkflowAgentArtifact) : null)}
        renderWorkflowAgentCompilerStartPane={renderWorkflowAgentCompilerStartPane}
      />
    );
  }

  function renderWorkflowRequestEditor(thread: WorkflowAgentThreadSummary, ariaLabel = "Workflow request") {
    const requestDraft = workflowRequestRestartDrafts[thread.id] ?? thread.initialRequest;
    const requestChanged = requestDraft.trim() !== thread.initialRequest.trim();
    const restartBusy = workflowDiscoveryBusy === `restart:${thread.id}`;
    return (
      <WorkflowRequestEditor
        thread={thread}
        requestDraft={requestDraft}
        requestChanged={requestChanged}
        restartBusy={restartBusy}
        textareaRef={workflowRequestRef}
        ariaLabel={ariaLabel}
        onDraftChange={(threadId, value) => setWorkflowRequestRestartDrafts((current) => ({ ...current, [threadId]: value }))}
        onReset={(workflowThread) => setWorkflowRequestRestartDrafts((current) => ({ ...current, [workflowThread.id]: workflowThread.initialRequest }))}
        onRestart={(workflowThread) => void restartWorkflowDiscoveryThread(workflowThread)}
      />
    );
  }

  function workflowExplorationGate(thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) {
    return workflowExplorationGateForThread({
      thread,
      revision,
      chatMessages: workflowThreadChatMessagesByThreadId[thread.id],
      traces: workflowExplorationTracesByThreadId[thread.id],
      progress: workflowExplorationProgressByThreadId[thread.id],
      skipped: Boolean(workflowExplorationSkippedByThreadId[thread.id]),
    });
  }

  function renderWorkflowExplorationPanel(thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary, revision?: WorkflowRevisionSummary) {
    const traces = workflowExplorationTracesByThreadId[thread.id] ?? [];
    const gate = workflowExplorationGate(thread, revision);
    const explorationBudgets = workflowExplorationBudgetsForThread(thread.id);
    return (
      <WorkflowExplorationPanel
        thread={thread}
        artifact={artifact}
        revision={revision}
        traces={traces}
        progress={workflowExplorationProgressByThreadId[thread.id]}
        gate={gate}
        budgets={explorationBudgets}
        workflowBusy={workflowBusy}
        onRunExploration={(workflowThread) => void runWorkflowExplorationForThread(workflowThread)}
        onSkipExploration={skipWorkflowExplorationForThread}
        onCompile={(workflowThread, workflowRevision) => void compileWorkflowThreadPreview(workflowThread, workflowRevision)}
        onUpdateBudget={updateWorkflowExplorationBudget}
        onResetBudget={resetWorkflowExplorationBudget}
      />
    );
  }

  function handleWorkflowGraphNodeReviewAction(action: WorkflowGraphNodeReviewAction, artifact?: WorkflowArtifactSummary) {
    const workflowThreadId = artifact?.workflowThreadId ?? selectedWorkflowAgentThread?.id;
    if (action.targetSection === "source") setWorkflowArtifactPanel(workflowThreadId, "source");
    if (action.targetSection === "audit") setWorkflowArtifactPanel(workflowThreadId, "run_console");
    if (action.targetSection === "connectors") setWorkflowArtifactPanel(workflowThreadId, "permissions");
    if (action.targetSection === "mutation_policy") setWorkflowArtifactPanel(workflowThreadId, "manifest");
    if (action.id === "open_audit" && artifact) {
      const latestRun = workflowDashboard ? latestWorkflowRunForArtifact(workflowDashboard.runs, artifact.id) : undefined;
      if (latestRun && selectedWorkflowAgentDetail?.run.id !== latestRun.id) void openWorkflowRunDetail(latestRun.id);
    }
    requestAnimationFrame(() => {
      const target = findWorkflowGraphNodeReviewActionTarget(document, action);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderWorkflowThreadComposer(thread: WorkflowAgentThreadSummary, detail?: WorkflowRunDetail) {
    const draft = workflowThreadComposerDrafts[thread.id] ?? "";
    return (
      <WorkflowThreadComposerView
        thread={thread}
        detail={detail}
        draft={draft}
        workflowBusy={workflowBusy}
        workflowDiscoveryBusy={workflowDiscoveryBusy}
        composerBusy={workflowThreadComposerBusy === thread.id}
        onDraftChange={(threadId, value) => setWorkflowThreadComposerDrafts((current) => ({ ...current, [threadId]: value }))}
        onSend={(workflowThread, runDetail) => sendWorkflowThreadComposer(workflowThread, runDetail)}
      />
    );
  }

  function renderWorkflowBuildWorkspace(
    thread: WorkflowAgentThreadSummary,
    artifact: WorkflowArtifactSummary | undefined,
    transcriptCards: WorkflowThreadTranscriptCard[],
  ) {
    const buildModel = workflowBuildWorkspaceViewModel({
      thread,
      artifact,
      selectedDetail: selectedWorkflowAgentDetail,
      runs: workflowDashboard?.runs ?? [],
      versions: workflowVersions,
      explorationTraceCount: workflowExplorationTracesByThreadId[thread.id]?.length ?? 0,
      explorationGate: workflowExplorationGate(thread),
      selectedWorkflowAgentThreadId: selectedWorkflowAgentThread?.id,
      selectedWorkflowAgentSourceNode,
      workflowBusy,
      workflowCompileThreadId,
      workflowCompileProgress,
      workflowDiscoveryBusy,
      workflowThreadSessionBusy,
      workflowThreadComposerBusy,
      sourceDrafts: workflowSourceDrafts,
    });
    return (
      <WorkflowBuildWorkspace
        thread={thread}
        artifact={artifact}
        {...buildModel}
        transcriptCards={transcriptCards}
        requestedArtifactPanel={workflowArtifactPanelByThreadId[thread.id]}
        selectedNodeId={selectedWorkflowGraphNodeId}
        workflowBusy={workflowBusy}
        onOpenPersistentStatusTarget={openWorkflowPersistentStatusTarget}
        onSetBuildPanel={setWorkflowBuildPanel}
        onPrepareSession={(workflowThread) => void prepareWorkflowThreadSession(workflowThread)}
        onOpenTranscriptPanel={openWorkflowPanelFromTranscript}
        onResolveRevision={(revisionId, decision) => void resolveWorkflowRevisionProposal(revisionId, decision)}
        onRunExploration={(workflowThread) => void runWorkflowExplorationForThread(workflowThread)}
        onSkipExploration={skipWorkflowExplorationForThread}
        onCompile={(workflowThread) => void compileWorkflowThreadPreview(workflowThread)}
        onSelectSourceNode={setSelectedWorkflowGraphNodeId}
        onSourceDraftChange={setWorkflowSourceDraft}
        onSourceDraftClear={clearWorkflowSourceDraft}
        onSourceSave={(artifactId, source) => saveWorkflowArtifactSource(artifactId, source)}
        renderRequestEditor={renderWorkflowRequestEditor}
        renderThreadComposer={renderWorkflowThreadComposer}
        renderReviewWorkspace={renderWorkflowReviewWorkspace}
        renderExplorationPanel={renderWorkflowExplorationPanel}
        renderRunConsolePanel={workflowArtifactPanels.renderRunConsolePanel}
        renderRuntimeInputPanel={workflowArtifactPanels.renderRuntimeInputPanel}
        renderOutputsPanel={workflowArtifactPanels.renderOutputsPanel}
        renderManifestPanel={workflowArtifactPanels.renderManifestPanel}
        renderPermissionsPanel={workflowArtifactPanels.renderPermissionsPanel}
        renderVersionHistoryPanel={workflowArtifactPanels.renderVersionHistoryPanel}
      />
    );
  }

  function renderWorkflowPersistentDiagramPane(thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) {
    const detail = selectedWorkflowAgentDetail && (!artifact || selectedWorkflowAgentDetail.artifact.id === artifact.id) ? selectedWorkflowAgentDetail : undefined;
    return (
      <section className="automation-section workflow-persistent-diagram-pane" data-workflow-artifact-panel="diagram">
        <WorkflowAgentDiagramPane
          thread={thread}
          artifact={artifact}
          events={detail?.events}
          detail={detail}
          selectedNodeId={selectedWorkflowGraphNodeId}
          activeNodeIdOverride={workflowExplorationProgressByThreadId[thread.id]?.status === "running" ? "agent-exploration" : undefined}
          onSelectNode={setSelectedWorkflowGraphNodeId}
          onNodeReviewAction={(action) => handleWorkflowGraphNodeReviewAction(action, artifact)}
          debugRewriteBusyEventId={workflowBusy?.startsWith("debug-rewrite:") ? workflowBusy.slice("debug-rewrite:".length) : undefined}
          recoveryBusyKey={workflowBusy?.startsWith("recover:") ? workflowBusy.slice("recover:".length) : undefined}
          onRecover={(card, action) => void recoverWorkflowRun(card, action)}
          onDebugRewrite={(card) => void debugRewriteWorkflowRun(card)}
        />
      </section>
    );
  }

  function renderWorkflowThreadDetail(thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) {
    const threadRevisions = workflowRevisions.filter((revision) => revision.workflowThreadId === thread.id);
    const transcriptCards = workflowThreadTranscriptCards({
      thread,
      artifact,
      detail: selectedWorkflowAgentDetail,
      revisions: threadRevisions,
      chatMessages: workflowThreadChatMessagesByThreadId[thread.id],
      planEditActivity: workflowThreadPlanEditActivityByThreadId[thread.id],
      explorationProgress: workflowExplorationProgressByThreadId[thread.id],
      explorationTraces: workflowExplorationTracesByThreadId[thread.id],
      compileActive: workflowBusy === "compile" && workflowCompileThreadId === thread.id,
      compileProgress: workflowCompileThreadId === thread.id ? workflowCompileProgress : [],
      includeRequestCard: false,
    });
    return (
      <div className="automation-focused-grid workflow-discovery-layout" style={workflowDiscoveryLayoutStyle}>
        {renderWorkflowBuildWorkspace(thread, artifact, transcriptCards)}
        {renderWorkflowSplitHandle()}
        {renderWorkflowPersistentDiagramPane(thread, artifact)}
      </div>
    );
  }

  function renderWorkflowThreadRunsPane(thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) {
    return (
      <WorkflowFocusedRunsPane
        thread={thread}
        artifact={artifact}
        state={{
          dashboard: workflowDashboard,
          selectedDetail: selectedWorkflowAgentDetail,
          activePanelId: workflowRunsPanelByThreadId[thread.id],
          artifactById,
          workflowBusy,
          workflowCompileThreadId,
          workflowCompileProgress,
          workflowDiscoveryBusy,
        }}
        slots={{
          layoutStyle: workflowDiscoveryLayoutStyle,
          splitHandle: renderWorkflowSplitHandle(),
          diagramPane: renderWorkflowPersistentDiagramPane(thread, artifact),
        }}
        actions={{
          runLimitsForArtifact: workflowRunLimitOverridesForArtifact,
          isArtifactRunBlocked: workflowArtifactRunBlocked,
          auditReportPreview: workflowAuditReportPreview,
          onOpenPersistentStatusTarget: openWorkflowPersistentStatusTarget,
          onSelectPanel: setWorkflowRunsPanel,
          onRunArtifact: runWorkflowArtifact,
          onOpenRunDetail: openWorkflowRunDetail,
          onOpenSchedule: (scheduleId) => {
            scheduleController.focusScheduleHistory(scheduleId);
            onSelectPane("schedules");
          },
          renderRunConsole: workflowArtifactPanels.renderRunConsole,
          renderRuntimeInputPanel: workflowArtifactPanels.renderRuntimeInputPanel,
          renderOutputsPanel: workflowArtifactPanels.renderOutputsPanel,
        }}
      />
    );
  }

  function activeDraftWorkflowRevision(workflowThreadId?: string): WorkflowRevisionSummary | undefined {
    return activeDraftWorkflowRevisionForThread(workflowRevisions, workflowThreadId);
  }

  function renderWorkflowDiscoveryThread(thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) {
    const discoveryModel = workflowDiscoveryThreadWorkspaceViewModel({
      thread, revision, artifact: selectedWorkflowAgentArtifact,
      workflowBusy, workflowCompileThreadId, workflowCompileProgress, workflowDiscoveryBusy, workflowDiscoveryProgress,
    });
    return (
      <WorkflowDiscoveryThreadWorkspace
        thread={thread}
        revision={revision}
        layoutStyle={workflowDiscoveryLayoutStyle}
        splitHandle={renderWorkflowSplitHandle()}
        diagramPane={
          <section className="automation-section workflow-agent-diagram-section">
            <WorkflowAgentDiagramPane thread={thread} selectedNodeId={selectedWorkflowGraphNodeId} onSelectNode={setSelectedWorkflowGraphNodeId} />
          </section>
        }
        model={discoveryModel}
        workflowDiscoveryBusy={workflowDiscoveryBusy}
        workflowBusy={workflowBusy}
        workflowError={workflowError}
        workflowDiscoveryAnswers={workflowDiscoveryAnswers}
        optimisticWorkflowDiscoveryAnswers={optimisticWorkflowDiscoveryAnswers}
        workflowCompileProgress={workflowCompileProgress}
        revisions={workflowRevisions}
        onOpenPersistentStatusTarget={openWorkflowPersistentStatusTarget}
        renderRequestEditor={renderWorkflowRequestEditor}
        renderExplorationPanel={renderWorkflowExplorationPanel}
        onCustomValueChange={(questionId, value) => setWorkflowDiscoveryAnswers((current) => ({ ...current, [questionId]: value }))}
        onAnswer={(questionId, choiceId, freeform) => void answerWorkflowDiscoveryQuestion(questionId, choiceId, freeform)}
        onResolveAccessRequest={(questionId, accessRequestId, response) => void resolveWorkflowDiscoveryAccessRequest(questionId, accessRequestId, response)}
        onCompile={(workflowThread, workflowRevision) => void compileWorkflowThreadPreview(workflowThread, workflowRevision)}
        onOpenCompileDiagnostics={(path) => void openWorkflowCompileDiagnostics(path)}
        onEditRequest={focusWorkflowRequestEditor}
        onReportCompileUnsupported={(reportText) => void copyWorkflowCompileFailureReport(reportText)}
        onStartRevision={(artifact) => void startWorkflowArtifactRevision(artifact)}
        onResolveRevision={(revisionId, decision) => void resolveWorkflowRevisionProposal(revisionId, decision)}
      />
    );
  }

  function renderLocalTasksPane() {
    return (
      <LocalTasksPane
        tooltips={{
          localTasks: automationHeadingTooltips.localTasks,
          autoDispatch: automationHeadingTooltips.autoDispatch,
          triggerMode: automationHeadingTooltips.triggerMode,
          schedules: automationHeadingTooltips.schedules,
          recentRuns: automationHeadingTooltips.recentRuns,
        }}
        projectField={renderProjectField()}
        autoDispatchToggle={renderAutoDispatchToggle()}
        autoDispatchStatus={renderAutoDispatchStatus()}
        prepareResult={renderPrepareResult()}
        recentRuns={renderTaskRuns(visibleTaskRuns, 5)}
        taskBoard={renderLocalTaskBoard(visibleTasks)}
        taskTriggerMode={taskTriggerMode}
        taskInitialState={taskInitialState}
        taskSchedulePreset={taskSchedulePreset}
        taskScheduleExpression={taskScheduleExpression}
        taskTitle={taskTitle}
        taskDescription={taskDescription}
        taskPriority={taskPriority}
        taskLabels={taskLabels}
        prepareBusy={prepareBusy}
        taskBusy={taskBusy}
        orchestrationError={orchestrationError}
        onRefresh={loadAutomationSurface}
        onPrepareNext={localTaskController.prepareNextTasks}
        onCreateTask={() => localTaskController.createTask(selectedTaskProjectPath)}
        onTaskTriggerModeChange={setTaskTriggerMode}
        onTaskInitialStateChange={setTaskInitialState}
        onTaskSchedulePresetChange={setTaskSchedulePreset}
        onTaskScheduleExpressionChange={setTaskScheduleExpression}
        onTaskTitleChange={setTaskTitle}
        onTaskDescriptionChange={setTaskDescription}
        onTaskPriorityChange={setTaskPriority}
        onTaskLabelsChange={setTaskLabels}
      />
    );
  }

  function renderHomePane() {
    const threadGroups = automationThreadStatusGroups(allAutomationThreads);
    return (
      <AutomationHomePane
        homeExplainer={workflowRecorderSurface.homeExplainer}
        legacyCompilerEnabled={workflowRecorderSurface.legacyCompilerEnabled}
        newWorkflowLabel={workflowRecorderSurface.newWorkflowLabel}
        threadGroups={threadGroups}
        reviewTooltip={automationHeadingTooltips.reviewQueue}
        routeDetailForThread={automationThreadRouteDetail}
        onOpenThread={openAutomationThreadCard}
        onSelectPane={onSelectPane}
        playbookLibrary={
          !workflowRecorderSurface.legacyCompilerEnabled ? (
          <WorkflowRecordingPlaybookLibrarySection
            playbooks={workflowRecordingLibrary}
            query={workflowLibraryQuery}
            includeArchived={workflowLibraryIncludeArchived}
            refreshing={workflowLibraryRefreshing}
            exportBusyThreadId={workflowRecordingExportBusyThreadId}
            exportStatus={workflowRecordingExportStatus}
            onQueryChange={setWorkflowLibraryQuery}
            onIncludeArchivedChange={onWorkflowLibraryIncludeArchivedChange}
            onRefresh={refreshWorkflowRecordingLibraryFromHome}
            onEditPlaybook={onEditWorkflowRecordingPlaybook}
            onOpenPlaybook={onSelectWorkflowRecordingPlaybook}
            onPreviewLocalPath={onPreviewLocalPath}
            onExportPlaybookSession={exportWorkflowRecordingPlaybookSession}
            onRestoreVersion={onRestoreWorkflowRecordingVersion}
            onSetEnabled={onSetWorkflowRecordingEnabled}
            onUnarchivePlaybook={onUnarchiveWorkflowRecordingPlaybook}
            onArchivePlaybook={onArchiveWorkflowRecordingPlaybook}
          />
          ) : undefined
        }
      />
    );
  }

  function renderWorkflowLabHomePane() {
    return (
      <WorkflowLabPlaybookLibrarySection
        playbooks={workflowRecordingLibrary}
        headingTooltip={activePaneTooltip("workflow_lab")}
        onNewRecording={() => onSelectPane("workflow_agent")}
        onOpenPlaybook={onSelectWorkflowRecordingPlaybook}
        onPreviewLocalPath={onPreviewLocalPath}
      />
    );
  }

  function renderWorkflowSchedulesPane(thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) {
    return (
      <WorkflowFocusedSchedulesPane
        thread={thread}
        artifact={artifact}
        state={{
          activePanel: workflowSchedulePanel,
          versions: workflowVersions.filter((version) => version.workflowThreadId === thread.id),
          workflowRuns: workflowDashboard?.runs ?? [],
          selectedDetail: selectedWorkflowAgentDetail,
          schedules: automationSchedules,
          scheduleExceptions: automationScheduleExceptions,
          permissionGrants,
          permissionAudit,
          permissionMode,
          auditThreadId: activeThreadId,
          workspacePath,
          scheduleTargetType,
          scheduleTargetId,
          schedulePreset,
          scheduleExpression,
          scheduleEnabled,
          scheduleRunIdleTimeoutMs,
          scheduleRunTotalLimitMode,
          scheduleRunLimits: scheduleController.scheduleRunLimitsForArtifact(artifact),
          scheduleBusy,
          scheduleError,
          focusedScheduleId,
          scheduleEditScope,
          expandedScheduleHistoryId,
          occurrenceEditor: scheduleOccurrenceEditor,
          workflowBusy,
          workflowCompileThreadId,
          workflowCompileProgress,
          workflowDiscoveryBusy,
        }}
        slots={{
          layoutStyle: workflowDiscoveryLayoutStyle,
          splitHandle: renderWorkflowSplitHandle(),
          diagramPane: renderWorkflowPersistentDiagramPane(thread, artifact),
        }}
        actions={{
          onSetPanel: scheduleController.setWorkflowSchedulePanel,
          onCreateNewSeries: scheduleController.createNewWorkflowScheduleSeries,
          onSetScheduleTarget: scheduleController.setScheduleTarget,
          onSetSchedulePreset: scheduleController.setSchedulePreset,
          onSetScheduleExpression: scheduleController.setScheduleExpression,
          onSetScheduleEnabled: scheduleController.setScheduleEnabled,
          onSetScheduleRunIdleTimeoutMs: scheduleController.setScheduleRunIdleTimeoutMs,
          onSetScheduleRunTotalLimitMode: scheduleController.setScheduleRunTotalLimitMode,
          onSetScheduleEditScope: scheduleController.setScheduleEditScope,
          onSaveSchedule: (targetKind, targetId) => scheduleController.saveWorkflowSchedule(targetKind, targetId, artifact),
          onRefreshSchedules: scheduleController.loadAutomationSchedules,
          onSetExpandedScheduleHistoryId: scheduleController.setExpandedScheduleHistoryId,
          onCreateScheduleGrant: (schedule) => scheduleController.createWorkflowScheduleGrant(thread, schedule),
          onChangeOccurrenceEditor: scheduleController.setScheduleOccurrenceEditor,
          onCloseOccurrenceEditor: () => scheduleController.setScheduleOccurrenceEditor(undefined),
          onEditOccurrenceSeriesScope: scheduleController.editOccurrenceSeriesScope,
          onSaveOccurrenceEditor: scheduleController.saveWorkflowScheduleOccurrenceEditor,
          onSkipOccurrence: scheduleController.skipWorkflowScheduleOccurrence,
          onOpenOccurrenceEditor: scheduleController.openWorkflowScheduleOccurrenceEditor,
          onDeferOccurrence: scheduleController.deferWorkflowScheduleOccurrence,
          onUpdateOccurrenceRunLimits: scheduleController.updateWorkflowScheduleOccurrenceRunLimits,
          onEditSchedule: scheduleController.editAutomationSchedule,
          onDuplicateSchedule: scheduleController.duplicateAutomationSchedule,
          onOpenRunDetail: (runId) => openWorkflowRunDetail(runId, { focusConsole: true }),
          onCreateGrantAction: (action) => scheduleController.createWorkflowScheduleGrantAction(thread, action),
          onOpenPersistentStatusTarget: openWorkflowPersistentStatusTarget,
        }}
      />
    );
  }

  function renderSchedulesPane() {
    const { workflowScheduleThread, workflowScheduleArtifact } = workflowSchedulesPaneRouteModel({
      selectedWorkflowThread: selectedWorkflowAgentThread,
      selectedWorkflowArtifact: selectedWorkflowAgentArtifact,
      focusedScheduleId,
      schedules: automationSchedules,
      workflowVersions,
      artifactById,
      workflowThreadById: workflowAgentThreadById,
      workflowThreadByArtifactId: workflowAgentThreadByArtifactId,
    });
    if (workflowScheduleThread && workflowScheduleArtifact) {
      return renderWorkflowSchedulesPane(workflowScheduleThread, workflowScheduleArtifact);
    }
    const workflowRuns = workflowDashboard?.runs ?? [];
    return (
      <AutomationSchedulesFallbackPane
        projectField={renderProjectField()}
        autoDispatchToggle={renderAutoDispatchToggle()}
        autoDispatchStatus={renderAutoDispatchStatus()}
        scheduleTooltip={automationHeadingTooltips.schedules}
        autoDispatchTooltip={automationHeadingTooltips.autoDispatch}
        schedules={automationSchedules}
        focusedScheduleId={focusedScheduleId}
        scheduleTargetType={scheduleTargetType}
        scheduleTargetId={scheduleTargetId}
        targetSources={automationScheduleTargetSources()}
        schedulePreset={schedulePreset}
        scheduleExpression={scheduleExpression}
        scheduleEnabled={scheduleEnabled}
        scheduleBusy={scheduleBusy}
        scheduleError={scheduleError}
        expandedScheduleHistoryId={expandedScheduleHistoryId}
        workflowRuns={workflowRuns}
        onScheduleTargetTypeChange={scheduleController.setScheduleTargetTypeAndClearId}
        onScheduleTargetIdChange={scheduleController.setScheduleTargetId}
        onSchedulePresetChange={scheduleController.setSchedulePreset}
        onScheduleExpressionChange={scheduleController.setScheduleExpression}
        onScheduleEnabledChange={scheduleController.setScheduleEnabled}
        onSaveSchedule={() => void scheduleController.createAutomationSchedule(automationScheduleTargetSources())}
        onRefreshSchedules={() => void scheduleController.loadAutomationSchedules()}
        onClearFocusedSchedule={scheduleController.clearFocusedSchedule}
        onToggleScheduleHistoryExpanded={scheduleController.setExpandedScheduleHistoryId}
        onOpenRunThread={(threadId) => void onOpenRunThread(threadId)}
        onOpenRunDetail={(runId) => void openWorkflowRunDetail(runId, { focusConsole: true })}
      />
    );
  }

  function renderRunsReviewsPane() {
    if (selectedWorkflowAgentThread) {
      return workflowRecorderSurface.legacyCompilerEnabled
        ? renderWorkflowThreadRunsPane(selectedWorkflowAgentThread, selectedWorkflowAgentArtifact)
        : renderLegacyWorkflowHiddenPane(selectedWorkflowAgentThread);
    }
    const threadGroups = automationThreadStatusGroups(allAutomationThreads);
    return (
      <AutomationRunsReviewsPane
        threadGroups={threadGroups}
        reviewTooltip={automationHeadingTooltips.reviewQueue}
        localTaskRuns={renderTaskRuns(allTaskRuns, 8)}
        workflowRuns={renderWorkflowRunCards(workflowRuns, 8)}
        workflowConsole={workflowArtifactPanels.renderRunConsole(workflowDetail)}
        routeDetailForThread={automationThreadRouteDetail}
        onOpenThread={openAutomationThreadCard}
      />
    );
  }

  function renderFolderPane() {
    const folderName = selectedFolder?.name ?? "Folder";
    return (
      <AutomationFolderPane
        folderName={folderName}
        legacyCompilerEnabled={workflowRecorderSurface.legacyCompilerEnabled}
        localTasksTooltip={automationHeadingTooltips.localTasks}
        threads={visibleThreads}
        taskBoard={renderLocalTaskBoard(visibleTasks)}
        routeDetailForThread={automationThreadRouteDetail}
        onOpenThread={openAutomationThreadCard}
      />
    );
  }

  function renderAutomationPane() {
    return (
      <AutomationPaneRouter
        activePane={activePane}
        selectedWorkflowRecordingActive={Boolean(selectedWorkflowRecording)}
        renderWorkflowRecordingPlaybookPane={() => (selectedWorkflowRecording ? renderWorkflowRecordingPlaybookPane(selectedWorkflowRecording) : null)}
        renderLocalTasksPane={renderLocalTasksPane}
        renderWorkflowAgentPane={renderWorkflowAgentPane}
        renderWorkflowLabHomePane={renderWorkflowLabHomePane}
        renderSchedulesPane={renderSchedulesPane}
        renderRunsReviewsPane={renderRunsReviewsPane}
        renderFolderPane={renderFolderPane}
        renderHomePane={renderHomePane}
      />
    );
  }

  function renderWorkflowAgentTabs() {
    const tabs: AutomationWorkspaceTab[] = [
      { id: "home", label: "Home", title: workflowRecorderSurface.homeTooltip },
      { id: "local_tasks", label: "Local Tasks", title: automationHeadingTooltips.localTasks },
      { id: "workflow_agent", label: workflowRecorderSurface.newWorkflowLabel, title: automationHeadingTooltips.workflowAgent },
      { id: "workflow_lab", label: "Workflow Lab", title: activePaneTooltip("workflow_lab") },
      { id: "schedules", label: "Schedules", title: automationHeadingTooltips.schedules },
      { id: "runs_reviews", label: "Runs", title: automationHeadingTooltips.runsReviews },
    ];
    return (
      <AutomationWorkspaceTabs
        homeTitle={workflowRecorderSurface.homeTitle}
        tabs={tabs}
        activePane={activePane}
        selectedThreadActive={Boolean(selectedThread)}
        onSelectPane={onSelectPane}
      />
    );
  }

  return (
    <section className="automation-workspace">
      <AutomationWorkspaceHeader
        model={automationHeaderModel}
        helpText={automationHelpText}
        stats={automationShellModel.stats}
      />

      {renderWorkflowAgentTabs()}

      {selectedThread ? (
        <AutomationSelectedThreadDetailView
          selectedThread={selectedThread}
          folders={folders}
          selectedAutomationRun={selectedAutomationRun}
          selectedArtifact={selectedArtifact}
          selectedArtifactThreadRoute={selectedArtifactThreadRoute}
          selectedArtifactWorkflowThread={selectedArtifactWorkflowThread}
          selectedTask={selectedTask}
          visibleTaskRuns={visibleTaskRuns}
          startingRunId={startingRunId}
          workflowAgentTooltip={automationHeadingTooltips.workflowAgent}
          localTasksTooltip={automationHeadingTooltips.localTasks}
          recentRunsTooltip={automationHeadingTooltips.recentRuns}
          onMoveThread={onMoveThread}
          onOpenRunThread={onOpenRunThread}
          onRevealWorkspace={localTaskController.revealOrchestrationWorkspace}
          onOpenWorkflowArtifactThread={openWorkflowArtifactThread}
          onUpdateTaskState={localTaskController.updateTaskState}
          onUpdateTaskLabels={localTaskController.updateTaskLabels}
          onStartRun={localTaskController.startOrchestrationRun}
        />
      ) : (
        <>
          {renderAutomationPane()}
        </>
      )}
    </section>
  );
}

export type AutomationsWorkspaceProps = Parameters<typeof AutomationsWorkspace>[0];


export function workflowAuditReportPreview(value: string | undefined): string {
  const report = value || "No audit report was generated for this run.";
  if (report.length <= 12_000) return report;
  return `${report.slice(0, 11_400).trimEnd()}\n\n[Audit preview truncated ${report.length - 11_400} chars. Open the run evidence panels for bounded events, model calls, checkpoints, and outputs.]`;
}


export async function rendererPermissionGrantTargetHash(
  actionKind: CreateAmbientPermissionGrantInput["actionKind"],
  targetKind: CreateAmbientPermissionGrantInput["targetKind"],
  targetLabel: string,
): Promise<string> {
  const payload = `${actionKind}\0${targetKind}\0${targetLabel}`;
  if (!globalThis.crypto?.subtle) throw new Error("Browser crypto is unavailable; cannot create a persistent grant.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
