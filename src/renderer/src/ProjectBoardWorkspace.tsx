import {
  Bell,
  BookOpenText,
  Bot,
  Brain,
  CalendarPlus,
  CalendarClock,
  ChevronDown,
  Clock,
  Code2,
  Command,
  Copy,
  ExternalLink,
  Film,
  FileCode2,
  FileImage,
  Folder,
  FolderPlus,
  Home,
  Info,
  Kanban,
  KeyRound,
  ListFilter,
  LoaderCircle,
  MessageCircle,
  Maximize2,
  Minimize2,
  Mic,
  Monitor,
  Moon,
  Music,
  PanelLeft,
  PanelRight,
  Paperclip,
  Pause,
  Pencil,
  Pin,
  Play,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  SquarePen,
  Square,
  Star,
  Sun,
  Terminal,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Background, BaseEdge, Controls, EdgeLabelRenderer, getBezierPath, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type EdgeProps } from "@xyflow/react";
import {
  FormEvent,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  forwardRef,
  KeyboardEvent as ReactKeyboardEvent,
  memo,
  ReactNode,
  RefObject,
  startTransition,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  projectBoardActionState,
  projectBoardCanonicalCardProjection,
  projectBoardCardsForSourceGroup,
  projectBoardColumns,
  projectBoardComplexityEstimate,
  projectBoardEmptyMessage,
  projectBoardExecutionReadinessRail,
  projectBoardPendingClarificationQuestions,
  projectBoardProofEvidenceModel,
  projectBoardProofInspectionNavigationModel,
  projectBoardProofCoverageForBoard,
  projectBoardProofReviewQueueSummary,
  projectBoardResetImpact,
  projectBoardTaskActionEvidenceFromProof,
  projectBoardSourceChangeDetail,
  projectBoardSourceChangeSummary,
  projectBoardSourceGroups,
  projectBoardSourceImpactPreview,
  projectBoardSourceInclusion,
  projectBoardSourceKindText,
  projectBoardSourceObservationLabel,
  projectBoardStatusLabel,
  projectBoardSuppressedForWorkflowRecordingThread,
  projectBoardSynthesisRunControlState,
  projectBoardTabs,
  projectBoardTestSummaryForBoard,
  projectBoardThreadPlanActionState,
  projectBoardUiMockReviewBadges,
  type ProjectBoardSourceGroup,
  type ProjectBoardLiveSessionActivityLine,
} from "./projectBoardUiModel";
import {
  projectBoardDraftColumns,
} from "./projectBoardDraftInboxUiModel";
import { useProjectBoardWorkspaceNavigationController } from "./ProjectBoardWorkspaceNavigationController";
import { useProjectBoardWorkspaceGitControls } from "./ProjectBoardWorkspaceGitControls";
import { useProjectBoardWorkspaceRunController } from "./ProjectBoardWorkspaceRunController";
import { useProjectBoardWorkspaceTitleTooltip } from "./ProjectBoardWorkspaceTitleTooltip";
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
import type { AutomationFolderSummary, AutomationScheduleExceptionSummary, AutomationScheduleSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type { BrowserCapabilityState, BrowserCredentialSummary, BrowserPickResult, BrowserProfileMode, BrowserRuntimeKind, BrowserScreenshotResult, BrowserUserActionState, SaveBrowserCredentialInput } from "../../shared/browserTypes";
import type { DesktopEvent, DesktopState, DesktopUpdateState, MenuCommand, ProviderCatalogSettingsCard, ProviderStatus, SendMessageComposerIntent, ThemePreference, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { DiagnosticExportResult } from "../../shared/diagnosticTypes";
import type { LocalDeepResearchInstallProgress, LocalDeepResearchRunHistoryEntry, LocalDeepResearchRunHistoryResult, MessageVoiceState, MiniCpmVisionAnalysisResult, MiniCpmVisionAnalyzeInput, MiniCpmVisionDiagnosticItem, MiniCpmVisionSetupAction, MiniCpmVisionSetupResult, SttMessageMetadata, SttProviderCandidate, SttProviderSetupResult, SttTestAudioResult, SttTranscriptionState, VoiceArtifactRetentionSummary, VoiceOnboardingHostFacts, VoiceProviderCandidate, VoiceProviderVoiceCandidate } from "../../shared/localRuntimeTypes";
import type { AmbientPermissionGrant, CreateAmbientPermissionGrantInput, PermissionAuditEntry, PermissionGrantScopeKind, PermissionMode, PermissionPromptResponseMode, PermissionRequest, PrivilegedCredentialRequest, SecureInputRequest } from "../../shared/permissionTypes";
import type { AnswerPlannerDecisionQuestionInput, PlannerDecisionQuestion, PlannerPlanArtifact, PlannerPlanWorkflowState } from "../../shared/plannerTypes";
import type { AmbientGeneratedCapabilitySummary, AmbientMcpContainerRuntimeManagedInstallProgress, AmbientMcpContainerRuntimeStatus, AmbientMcpDefaultCapabilityInstallProgress, AmbientMcpInstalledServerSummary, AmbientMcpInstallPreview, AmbientMcpServerSearchResult, AmbientPluginAuthAccountSummary, AmbientPluginAuthStartResult, AmbientPluginCapabilityDiagnostics, AmbientPluginRegistry, AmbientPluginRuntime, AmbientPluginSourceKind, CapabilityBuilderHistoryEntry, CapabilityBuilderHistoryResult, CodexHostedMarketplaceReport, CodexMarketplaceSourceSummary, CodexPluginCatalog, CodexPluginCompatibilityTier, CodexPluginMcpInspectionCatalog, CodexPluginSummary, FirstPartyGoogleIntegrationState, ManagedDevServerSummary, PiExtensionSandboxCatalog, PiExtensionSandboxInstallPreview, PiExtensionSandboxPackageSummary, PiPackageCatalog, PiPackageInstallScope, PiPackageResourceKind, PiPrivilegedCatalog, PiPrivilegedInstallSummary, PiPrivilegedSecurityScan, PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";
import type { AddProjectBoardCardRunFeedbackInput, ApplyProjectBoardDecisionImpactFeedbackInput, ApplyProjectBoardSourceImpactFeedbackInput, AttachProjectBoardLocalTaskMode, CopyProjectBoardSessionToThreadInput, CreateReadyProjectBoardTasksInput, DeferProjectBoardSynthesisSectionsInput, ProjectBoardAddCardsObjectiveProvenance, ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectBoardCardRunFeedbackSource, ProjectBoardExecutionArtifact, ProjectBoardProofDecisionAction, ProjectBoardQuestion, ProjectBoardSource, ProjectBoardSourceChangeState, ProjectBoardSourceKind, ProjectBoardSplitDecisionAction, ProjectBoardSummary, ProjectBoardSynthesisProposal, ProjectBoardSynthesisProposalCardReviewStatus, ProjectBoardSynthesisRun, ProjectSummary, RecomputeProjectBoardProofCoverageInput, RefineProjectBoardSynthesisInput, RefreshProjectBoardDecisionDraftsInput, RefreshProjectBoardSourceDraftsInput, RegenerateProjectBoardDecisionDraftsInput, RegenerateProjectBoardSourceDraftsInput, RerunProjectBoardProofInput, ResolveProjectBoardCardPiUpdateInput, ResolveProjectBoardDeliverableIntegrationInput, RetryProjectBoardSynthesisInput, SplitProjectBoardCardInput, SuggestProjectBoardClarificationDefaultsInput, SuggestProjectBoardKickoffDefaultsInput, SuggestProjectBoardProofInput, UpdateProjectBoardCardInput, UpdateProjectBoardSourceInput } from "../../shared/projectBoardTypes";
import type { TerminalSession } from "../../shared/terminalTypes";
import type { ChatMessage, CollaborationMode, ContextUsageSnapshot, ExportChatResult, MessageDelivery, RunStatus, RuntimeActivity, ThinkingLevel, ThreadGoal, ThreadSummary, ToolLargeOutputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import type { OrchestrationAutoDispatchStatus, OrchestrationRun, OrchestrationTask, WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowCompileAuditSummary, WorkflowCompileProgress, WorkflowConnectorDataRetention, WorkflowConnectorManifestGrant, WorkflowDashboard, WorkflowDiscoveryAccessRequest, WorkflowDiscoveryProgress, WorkflowExplorationProgress, WorkflowExplorationTraceSummary, WorkflowGraphNode, WorkflowLabRun, WorkflowModelCallRecord, WorkflowPluginCapabilityGrant, WorkflowRecordingEditContext, WorkflowRecordingLibraryEntry, WorkflowRecordingReviewDraftUpdate, WorkflowRecordingState, WorkflowRecoveryAction, WorkflowRevisionSummary, WorkflowRunDetail, WorkflowRunEvent, WorkflowRunLimitOverrides, WorkflowRunSummary, WorkflowUserInputResponse, WorkflowVersionSummary } from "../../shared/workflowTypes";
import type { FileTreeEntry, GitReviewFile, GitReviewSummary, GitSimpleAction, WorkspaceContextReference, WorkspaceFileContent, WorkspaceFileTree, WorkspaceGitStatus, WorkspaceOpenTarget, WorkspaceSearchResult, WorkspaceSearchScope } from "../../shared/workspaceTypes";
import {
  projectBoardProofCoverageDrift,
  projectBoardProofCoverageRecheck,
  projectBoardLatestProofCoverageRecheckEvent,
} from "../../shared/projectBoardProofImpact";
import { AMBIENT_MODEL_OPTIONS, ambientModelLabel } from "../../shared/ambientModels";
import { resolveMessageDelivery } from "../../shared/messageDelivery";
import {
  sttMessageArtifactEntries,
  sttMessageMetadataFromTranscription,
  sttMessageMetadataFromUnknown,
} from "../../shared/sttMessageMetadata";
import { isRunStatusRunning, RUN_ABORT_ARM_DELAY_MS } from "../../shared/runStatus";
import {
  workflowAmbientCliCallSummaries,
  workflowAmbientCliCapabilityRows,
  workflowConnectorCallSummaries,
  workflowRunEventDetailLabels,
  workflowRunEventSummaryCards,
  workflowStepSummaries,
} from "./workflowUiModel";
import {
  workflowDiagramInitialViewportNodeIds,
  workflowGraphDraftOverlayModel,
  workflowGraphEventCards,
  workflowLatestDiscoveryGraphChange,
  workflowLatestRuntimeGraphNodeId,
  workflowGraphToReactFlow,
  workflowGraphWithRunEvents,
  type WorkflowAgentDiagramEdge,
  type WorkflowAgentDiagramNode,
  type WorkflowGraphChangeFocus,
  type WorkflowGraphDraftOverlay,
  type WorkflowGraphEventCard,
} from "./workflowAgentGraphUiModel";
import { findWorkflowGraphNodeReviewActionTarget } from "./workflowGraphNodeReviewRouting";
import { workflowGraphNodeReviewModel, type WorkflowGraphNodeReviewAction } from "./workflowGraphNodeReviewUiModel";
import {
  workflowReviewActionLabel,
  workflowReviewActionTitle,
  workflowScheduleCreationModel,
  workflowScheduleExceptionLedgerItems,
  workflowScheduleGrantReadinessModel,
  workflowReviewWorkspaceModel,
  workflowScheduleRunHistoryItems,
  workflowThreadScheduleState,
  type WorkflowDiscoveryContextReviewModel,
  type WorkflowReviewEvidenceItem,
  type WorkflowReviewSection,
  type WorkflowSchedulePanelId,
  type WorkflowScheduleEditScopeId,
  type WorkflowThreadScheduleItem,
  type WorkflowThreadScheduleGrantAction,
} from "./workflowReviewUiModel";
import { workflowRevisionCards } from "./workflowRevisionUiModel";
import { workflowExplorationGateModel } from "./workflowExplorationGateUiModel";
import { workflowExplorationProgressCard, workflowExplorationTraceCards } from "./workflowExplorationUiModel";
import { workflowExplorationPreflightModel, type WorkflowExplorationPreflightModel } from "./workflowExplorationPreflightUiModel";
import {
  normalizeWorkflowExplorationBudgets,
  workflowExplorationBudgetWithField,
  workflowExplorationElapsedBudgetOptions,
  workflowExplorationRunInput,
} from "./workflowExplorationBudgetUiModel";
import { workflowCompileActivityModel, type WorkflowCompileActivityAction } from "./workflowCompileActivityUiModel";
import { workflowSourceHighlightModel, workflowSourceMappingRows } from "./workflowSourceHighlightUiModel";
import { workflowArtifactThreadRoute } from "./workflowThreadFirstUiModel";
import { workflowThreadTranscriptCards, type WorkflowThreadTranscriptCard } from "./workflowThreadTranscriptUiModel";
import { workflowThreadComposerModel } from "./workflowThreadComposerUiModel";
import { workflowThreadSessionUiModel } from "./workflowThreadSessionUiModel";
import {
  workflowRecorderLegacyCompilerEnabled,
  workflowRecorderEditWithAmbientModel,
  workflowRecorderInjectedPlaybookChip,
  workflowRecorderLibrarySidebarRows,
  workflowRecorderReviewDraftUpdateFromEditorFields,
  workflowRecorderReviewEditorFieldsFromDraft,
  workflowRecorderReviewModel,
  workflowRecorderStartActionState,
  workflowRecorderSurfaceModel,
  type WorkflowRecorderReviewEditorFields,
} from "./workflowRecorderUiModel";
import { workflowPersistentStatusModel, type WorkflowPersistentStatusModel, type WorkflowPersistentStatusTarget } from "./workflowPersistentStatusUiModel";
import { workflowRuntimeInputCards, type WorkflowRuntimeInputCard } from "./workflowRuntimeInputUiModel";
import { workflowRunOutputCards, type WorkflowRunOutputCard } from "./workflowRunOutputUiModel";
import { normalizeWorkflowRunsPanelId, workflowRunsPanelTabs, type WorkflowRunsPanelId } from "./workflowRunsPanelUiModel";
import {
  workflowDecisionRecoveryAction,
  workflowGraphRecoveryDecisionCard,
  workflowRuntimeInputDecisionCard,
  workflowTotalRuntimePauseDecisionCard,
  type WorkflowRuntimeDecisionAction,
} from "./workflowRuntimeDecisionUiModel";
import { workflowDiagramFollowToggle, workflowDiagramShouldAutoFit, workflowDiagramShouldFollowActiveNode } from "./workflowDiagramViewportUiModel";
import {
  normalizeWorkflowBuildPanelId,
  workflowArtifactPanelIdForBuildPanel,
  workflowBuildPanelIdForArtifactPanel,
  workflowBuildPanelTabs,
  type WorkflowArtifactPanelId,
  type WorkflowBuildPanelId,
} from "./workflowArtifactPanelUiModel";
import { workflowVersionHistoryModel } from "./workflowVersionHistoryUiModel";
import {
  DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS,
  DEFAULT_WORKFLOW_FOREGROUND_TOTAL_LIMIT_MODE,
  DEFAULT_WORKFLOW_SCHEDULE_TOTAL_LIMIT_MODE,
  workflowExtendTotalRunLimitOverrides,
  workflowRemoveTotalRunLimitOverrides,
  workflowRunIdleTimeoutOptions,
  workflowRunLimitOverridesForSettings,
  workflowRunLimitSummary,
  workflowTotalRuntimePauseModel,
  type WorkflowRunTotalLimitMode,
} from "./workflowRunLimitsUiModel";
import type { WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";
import { workflowDiscoveryAnswerText } from "../../shared/workflowDiscovery";
import {
  appendLocalTaskBlocker,
  localTaskCreateActionState,
  localTaskBlockerLabels,
  localTaskBlockerOptions,
  localTaskEditActionState,
  parseLocalTaskLabels,
  parseLocalTaskPriority,
  removeLocalTaskBlocker,
  sanitizeLocalTaskPriorityInput,
  scheduleNextRunLabel,
  schedulePresetLabel,
  stepLocalTaskPriority,
  taskTriggerLabels,
  triggerPreviewLabel,
  workflowArtifactRevisionRequest,
  workflowCompileActionState,
  workflowConnectorAccountOptions,
  workflowConnectorConsentSummary,
  decodeWorkflowSourceDrafts,
  encodeWorkflowSourceDrafts,
  workflowModelCallReviewSummary,
  workflowSourceEditDiffSummary,
  workflowSourceDraftStorageKey,
  type AutomationSchedulePreset,
  type AutomationTriggerMode,
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
  workflowPluginRequirementRows,
} from "./pluginUiModel";
import {
  welcomeCoreSetupSections,
  welcomeOnboardingPageKindForMessages,
  welcomeOnboardingPageShouldOpenAtTop,
  type WelcomeSetupSection,
} from "./welcomeSetupUiModel";
import { welcomeOnboardingPageKindFromMetadata, type WelcomeOnboardingPageKind } from "../../shared/welcomeOnboarding";
import { googleWorkspaceGrantReview } from "./googleWorkspaceGrantUiModel";
import { permissionGrantRegistryModel, permissionGrantRevocationImpact, workflowPermissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import {
  artifactMediaKindFromPath,
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
  LinkContextMenuState,
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
  formatDurationMs,
  formatBytes,
  InlineArtifactMedia,
  RichText,
  externalLinkMenuLabel,
  workspaceAbsoluteArtifactPath,
  isAbsoluteFilePath,
  isHtmlArtifactPath,
  stripLinkLineSuffix,
  preferredWorkspaceOpenTarget,
  ambientBrowserRuntimeForUrl,
  desktopUpdateStatusText,
  HTML_PREVIEW_AUTO_PAUSE_MS,
  formatHtmlPreviewAutoPauseLabel,
  contextAttachmentKey,
  contextUsagePresentation,
  PermissionFullAccessReceiptList,
  RightPanel,
  GitConfirmationDialog,
  formatPanelFileSize,
  LazyHtmlPreview,
  OpenTargetIcon,
  formatTimelineTime,
  truncateUiText,
} from "./RightPanel";
import {
  activePaneTooltip,
  automationHelpText,
  automationIndicatorKind,
  type AutomationPane,
  AutomationsWorkspace,
  chatExportStatusMessage,
  ProofEvidencePathLink,
  ProofOfWorkPreview,
  RunTimeline,
  type ThreadIndicatorKind,
  useRunningClock,
  workflowRecorderSurface
} from "./AutomationsWorkspace";
import { ProjectBoardIntegrationTab } from "./ProjectBoardIntegrationViews";
export { ProjectBoardIntegrationTab } from "./ProjectBoardIntegrationViews";
import {
  ProjectBoardCharterTab,
  ProjectBoardComplexityShadowPanel,
  ProjectBoardOverviewTab,
  ProjectBoardTabs,
} from "./ProjectBoardShellViews";
export {
  ProjectBoardCharterTab,
  ProjectBoardComplexityShadowPanel,
  ProjectBoardOverviewTab,
  ProjectBoardTabs,
} from "./ProjectBoardShellViews";
import { ProjectBoardProofTab } from "./ProjectBoardProofViews";
import {
  ProjectBoardClaimControls,
  projectBoardCardTouchedFieldLabel,
} from "./ProjectBoardActiveCardDetailViews";
import {
  ProjectBoardSourceImpactPreviewPanel,
  projectBoardSourceChangeStateLabel,
} from "./ProjectBoardSourceViews";
import { ProjectBoardDraftInboxTab } from "./ProjectBoardDraftInboxViews";
import {
  ProjectBoardExecutionReadinessRailPanel,
} from "./ProjectBoardExecutionViews";
import {
  ProjectBoardSynthesisActivity,
  ProjectBoardSynthesisProposalTab,
  projectBoardLatestVisibleSynthesisRun,
  projectBoardSynthesisRunStageLabel,
  projectBoardSynthesisRunStatusLabel,
} from "./ProjectBoardSynthesisViews";
import { ProjectBoardHistoryTab } from "./ProjectBoardHistoryViews";
import { ProjectBoardMapTab } from "./ProjectBoardMapViews";
import {
  ProjectBoardCollaborationReadinessPanel,
  ProjectBoardGitSyncControls,
  ProjectBoardProjectionReviewPanel,
} from "./ProjectBoardCollaborationViews";
import { ProjectBoardBoardTab } from "./ProjectBoardBoardViews";
import {
  ProjectBoardWorkspaceEmptyPanel,
  ProjectBoardWorkspaceHeader,
} from "./ProjectBoardWorkspaceChrome";
import { ProjectBoardWorkspaceBoardSurface } from "./ProjectBoardWorkspaceSurface";

export {
  ProjectBoardCardShell,
  ProjectBoardCardView,
  ProjectBoardColumn,
  ProjectBoardObjectiveProvenanceBlock,
  projectBoardCandidateStatusLabel,
  projectBoardCardSourceLabel,
  projectBoardColumnEmptyText,
  projectBoardDraftColumnEmptyText,
  projectBoardObjectiveGroundingLabel,
  projectBoardPhaseDisplayName,
} from "./ProjectBoardLaneViews";
export {
  ProjectBoardProofCard,
  ProjectBoardProofCoverageRecheckPanel,
  ProjectBoardProofFollowUpImpactPanel,
  ProjectBoardProofReviewQueue,
  ProjectBoardProofReviewQueueItem,
  ProjectBoardProofStat,
  ProjectBoardProofTab,
  projectBoardProofDriftCardLabel,
  projectBoardProofKindLabel,
  type ProjectBoardProofReviewQueueItemModel,
} from "./ProjectBoardProofViews";
export {
  ProjectBoardActiveCardDecisionAuditPanel,
  ProjectBoardActiveCardDetail,
  ProjectBoardActiveCardDetailTabs,
  ProjectBoardActiveCardOverviewPanel,
  ProjectBoardActiveCardSourceBasisPanel,
  ProjectBoardClaimControls,
  ProjectBoardExecutionControlPanel,
  ProjectBoardLivePiSessionPreview,
  ProjectBoardProtectedPiUpdatePanel,
  ProjectBoardRunFeedbackPanel,
  ProjectBoardUiMockReviewPanel,
  projectBoardCardTouchedFieldLabel,
  projectBoardProofRecommendedActionLabel,
  projectBoardProofReviewerLabel,
  projectBoardProofReviewStatusLabel,
  projectBoardRunFeedbackSourceLabel,
  type ProjectBoardActiveCardDetailTab,
  type ProjectBoardCardInspectorOptions,
  type ProjectBoardCardInspectorRequest,
} from "./ProjectBoardActiveCardDetailViews";
export {
  ProjectBoardCandidateDetail,
  ProjectBoardDecisionImpactSummary,
  ProjectBoardProofScopeWarningSummary,
} from "./ProjectBoardCandidateDetailViews";
export {
  ProjectBoardCharterPolicy,
  ProjectBoardCharterPreview,
  ProjectBoardSourceDetail,
  ProjectBoardSourceImpactPreviewPanel,
  ProjectBoardSourceItem,
  ProjectBoardSourceReview,
  projectBoardPolicyText,
  projectBoardSourceChangeStateLabel,
  projectBoardSourceKindOptions,
} from "./ProjectBoardSourceViews";
export {
  ProjectBoardDraftBoard,
  ProjectBoardDraftCardView,
  ProjectBoardDraftCreateReadyPreviewPanel,
  ProjectBoardDraftInboxTab,
  ProjectBoardDraftSourcePicker,
  ProjectBoardKickoffInterview,
  ProjectBoardPiUpdateReviewPanel,
  projectBoardKickoffDefaultDraftingStatus,
  projectBoardQuestionSectionLabel,
} from "./ProjectBoardDraftInboxViews";
export {
  ProjectBoardBoardDecisionImpactPanel,
  ProjectBoardExecutionOverviewPanel,
  ProjectBoardExecutionReadinessRailPanel,
  ProjectBoardUnattachedTasks,
  ProjectBoardWorkflowAdvancedEditor,
  ProjectBoardWorkflowImpactPanel,
  ProjectBoardWorkflowPrimer,
  ProjectBoardWorkflowRepairPreview,
  ProjectBoardWorkflowSettingsEditor,
} from "./ProjectBoardExecutionViews";
export {
  ProjectBoardDecisionQueuePanel,
  ProjectBoardExecutionPmReviewPanel,
  ProjectBoardPmReviewReport,
  ProjectBoardPromptBudgetAudit,
  ProjectBoardProposalCard,
  ProjectBoardSynthesisActivity,
  ProjectBoardSynthesisProposalTab,
  ProjectBoardSynthesisRunLedger,
  ProjectBoardSynthesisSectionStatusList,
  projectBoardKickoffDefaultsRunMetric,
  projectBoardKickoffDefaultsRunTargetCount,
  projectBoardLatestVisibleSynthesisRun,
  projectBoardPmReviewReadinessLabel,
  projectBoardProposalCardReviewLabel,
  projectBoardProposalReviewCounts,
  projectBoardProposalStatusLabel,
  projectBoardRenderedCardLedgerSummary,
  projectBoardSynthesisActivityEvents,
  projectBoardSynthesisRunPercent,
  projectBoardSynthesisRunStageLabel,
  projectBoardSynthesisRunStatusLabel,
  projectBoardSynthesisSectionMetric,
} from "./ProjectBoardSynthesisViews";
export {
  ProjectBoardHistoryCollaborationAuditPanel,
  ProjectBoardHistoryEvent,
  ProjectBoardHistoryImpactAuditPanel,
  ProjectBoardHistoryRecoveryPanel,
  ProjectBoardHistoryTab,
  ProjectBoardProgressiveRecordPreview,
  ProjectBoardSupersededCardsPanel,
  projectBoardEventTimeLabel,
  projectBoardHistoryRecoveryActionBusy,
  projectBoardHistoryRecoveryActionIcon,
  projectBoardHistoryRecoveryActionLabel,
  projectBoardHistoryRecoveryRetryMode,
  projectBoardImpactKindLabel,
  projectBoardProgressiveRecordDetail,
  projectBoardProgressiveRecordObject,
  projectBoardProgressiveRecordText,
  projectBoardProgressiveRecordTitle,
  projectBoardSupersededCardCategoryLabel,
  projectBoardSupersededCardDetail,
  projectBoardTabTitle,
} from "./ProjectBoardHistoryViews";
export {
  ProjectBoardCriticalPath,
  ProjectBoardDependencyChangeImpact,
  ProjectBoardDependencyIssues,
  ProjectBoardExecutionOrder,
  ProjectBoardMapCard,
  ProjectBoardMapTab,
  projectBoardDependencyCardForRef,
  projectBoardDependencyRefLabel,
} from "./ProjectBoardMapViews";
export {
  ProjectBoardCollaborationReadinessPanel,
  ProjectBoardGitSyncControls,
  ProjectBoardProjectionReviewPanel,
  projectBoardProjectionResolutionLabel,
  projectBoardProjectionResolutionTitle,
  projectBoardProjectionReviewActionLabel,
  projectBoardProjectionReviewKindLabel,
} from "./ProjectBoardCollaborationViews";
export { ProjectBoardBoardTab } from "./ProjectBoardBoardViews";
export {
  projectBoardTitleTooltipAnchor,
  projectBoardTitleTooltipTrigger,
  sameProjectBoardTitleTooltipAnchor,
} from "./ProjectBoardWorkspaceTitleTooltip";
export type { ProjectBoardTitleTooltip } from "./ProjectBoardWorkspaceTitleTooltip";

export type ProjectBoardWorkspaceProps = {
  project: ProjectSummary;
  busy: boolean;
  sourceBusy: boolean;
  sourceImpactBusy: boolean;
  kickoffDefaultsBusy: boolean;
  refineBusy: boolean;
  refineMode?: RefineProjectBoardSynthesisInput["mode"];
  proposalAnswerBusy?: string;
  proposalCardReviewBusy?: string;
  proposalApplyBusy: boolean;
  finalizeBusy: boolean;
  synthesisRetryBusy: boolean;
  synthesisDeferBusy: boolean;
  synthesisPauseBusy: boolean;
  revisionBusy: boolean;
  orchestrationRevision: number;
  runActivityLinesByThread: Record<string, ProjectBoardLiveSessionActivityLine[]>;
  threadRunStatuses: Record<string, RunStatus>;
  onBuild: () => void;
  onReviseBoard: (boardId: string) => void;
  onCancelRevision: (boardId: string) => void;
  onResetBoard: () => void;
  onApproveCard: (card: ProjectBoardCard) => void;
  onResolveProofDecision: (cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) => Promise<void> | void;
  onRerunProof: (input: RerunProjectBoardProofInput) => Promise<void> | void;
  onResolveDeliverableIntegration: (input: ResolveProjectBoardDeliverableIntegrationInput) => Promise<void> | void;
  onRecomputeProofCoverage: (boardId: string) => Promise<void> | void;
  onSuggestProof: (input: SuggestProjectBoardProofInput) => Promise<void> | void;
  onResolveSplitDecision: (cardId: string, action: ProjectBoardSplitDecisionAction) => Promise<void> | void;
  onCreateReadyTasks: (boardId: string) => void;
  onSplitCard: (cardId: string) => void;
  onCreateCard: (boardId: string) => Promise<DesktopState | undefined>;
  onAttachLocalTask: (taskId: string, mode: AttachProjectBoardLocalTaskMode) => Promise<void>;
  onUpdateCard: (input: UpdateProjectBoardCardInput) => void;
  onUpdateCardCandidate: (card: ProjectBoardCard, candidateStatus: ProjectBoardCardCandidateStatus) => void;
  onResolveCardPiUpdate: (input: ResolveProjectBoardCardPiUpdateInput) => void;
  onAddRunFeedback: (input: AddProjectBoardCardRunFeedbackInput) => Promise<void> | void;
  onCopySessionToThread: (input: CopyProjectBoardSessionToThreadInput) => Promise<void> | void;
  onSuggestClarificationDefaults: (input: SuggestProjectBoardClarificationDefaultsInput) => Promise<void> | void;
  onSuggestKickoffDefaults: (input: SuggestProjectBoardKickoffDefaultsInput) => Promise<void> | void;
  onApplyDecisionImpactFeedback: (input: ApplyProjectBoardDecisionImpactFeedbackInput) => Promise<void> | void;
  onRefreshDecisionDrafts: (input: RefreshProjectBoardDecisionDraftsInput) => Promise<void> | void;
  onRegenerateDecisionDrafts: (input: RegenerateProjectBoardDecisionDraftsInput) => Promise<void> | void;
  onRefreshSourceDrafts: (input: RefreshProjectBoardSourceDraftsInput) => Promise<void> | void;
  onRegenerateSourceDrafts: (input: RegenerateProjectBoardSourceDraftsInput) => Promise<void> | void;
  onApplySourceImpactFeedback: (input: ApplyProjectBoardSourceImpactFeedbackInput) => Promise<void> | void;
  onRefreshSources: (boardId: string) => void;
  onRefineWithPi: (boardId: string) => void;
  onRefineProposal: (boardId: string, proposalId: string, mode?: Extract<RefineProjectBoardSynthesisInput["mode"], "charter_review" | "board_synthesis">) => void;
  onElaborateSources: (boardId: string, sourceIds: string[], objective?: string) => void;
  onAnswerProposalQuestion: (proposalId: string, questionIndex: number, answer: string) => void;
  onReviewProposalCard: (
    proposalId: string,
    sourceId: string,
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus,
    reason?: string,
    mergeTargetCardId?: string,
  ) => void;
  onApplyProposal: (proposalId: string) => void;
  onUpdateSource: (input: UpdateProjectBoardSourceInput) => void;
  onAnswerQuestion: (question: ProjectBoardQuestion, answer: string) => void;
  onFinalizeKickoff: (boardId: string) => void;
  onPauseSynthesis: (boardId: string, runId: string) => void;
  onRetrySynthesis: (boardId: string, retryOfRunId?: string, mode?: RetryProjectBoardSynthesisInput["mode"]) => void;
  onDeferSynthesisSections: (boardId: string, runId: string) => void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => Promise<void>;
  onClose: () => void;
};

export function ProjectBoardWorkspace({
  project,
  busy,
  sourceBusy,
  sourceImpactBusy,
  kickoffDefaultsBusy,
  refineBusy,
  refineMode,
  proposalAnswerBusy,
  proposalCardReviewBusy,
  proposalApplyBusy,
  finalizeBusy,
  synthesisRetryBusy,
  synthesisDeferBusy,
  synthesisPauseBusy,
  revisionBusy,
  orchestrationRevision,
  runActivityLinesByThread,
  threadRunStatuses,
  onBuild,
  onReviseBoard,
  onCancelRevision,
  onResetBoard,
  onApproveCard,
  onResolveProofDecision,
  onRerunProof,
  onResolveDeliverableIntegration,
  onRecomputeProofCoverage,
  onSuggestProof,
  onResolveSplitDecision,
  onCreateReadyTasks,
  onSplitCard,
  onCreateCard,
  onAttachLocalTask,
  onUpdateCard,
  onUpdateCardCandidate,
  onResolveCardPiUpdate,
  onAddRunFeedback,
  onCopySessionToThread,
  onSuggestClarificationDefaults,
  onSuggestKickoffDefaults,
  onApplyDecisionImpactFeedback,
  onRefreshDecisionDrafts,
  onRegenerateDecisionDrafts,
  onRefreshSourceDrafts,
  onRegenerateSourceDrafts,
  onApplySourceImpactFeedback,
  onRefreshSources,
  onRefineWithPi,
  onRefineProposal,
  onElaborateSources,
  onAnswerProposalQuestion,
  onReviewProposalCard,
  onApplyProposal,
  onUpdateSource,
  onAnswerQuestion,
  onFinalizeKickoff,
  onPauseSynthesis,
  onRetrySynthesis,
  onDeferSynthesisSections,
  onOpenRunThread,
  onClose,
}: ProjectBoardWorkspaceProps) {
  const board = project.board;
  const [projectBoardCreateCardBusy, setProjectBoardCreateCardBusy] = useState(false);
  const {
    projectBoardWorkspaceRef,
    handleProjectBoardTooltipMouseOver,
    handleProjectBoardTooltipMouseOut,
    handleProjectBoardTooltipFocus,
    handleProjectBoardTooltipBlur,
    hideProjectBoardTitleTooltip,
    titleTooltipNode,
  } = useProjectBoardWorkspaceTitleTooltip();
  const projectBoardNavigationController = useProjectBoardWorkspaceNavigationController({ board, finalizeBusy });
  const { revealProjectBoardDraftCard } = projectBoardNavigationController;
  const projectBoardRunController = useProjectBoardWorkspaceRunController({
    board,
    orchestrationRevision,
    onAddRunFeedback,
    onAttachLocalTask,
    onCopySessionToThread,
    onCreateReadyTasks,
    onOpenRunThread,
    onRecomputeProofCoverage,
    onRerunProof,
    onResolveDeliverableIntegration,
    onResolveProofDecision,
    onResolveSplitDecision,
    onSuggestProof,
  });
  const {
    applyProjectBoardOrchestration,
    setProjectBoardOrchestrationError,
  } = projectBoardRunController;
  const projectBoardGitControls = useProjectBoardWorkspaceGitControls({
    applyProjectBoardOrchestration,
    board,
    setProjectBoardOrchestrationError,
  });

  async function createProjectBoardDraftCard(boardId: string) {
    setProjectBoardCreateCardBusy(true);
    setProjectBoardOrchestrationError(undefined);
    try {
      const previousCardIds = new Set(board?.cards.map((card) => card.id) ?? []);
      const next = await onCreateCard(boardId);
      const nextBoard = next?.projects.find((candidate) => candidate.path === project.path)?.board;
      const created = nextBoard?.cards.find((card) => !previousCardIds.has(card.id) && card.sourceKind === "manual");
      if (created) {
        revealProjectBoardDraftCard(created.id);
      }
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBoardCreateCardBusy(false);
    }
  }

  return (
    <section
      ref={projectBoardWorkspaceRef}
      className="project-board-workspace"
      aria-label="Project Kanban board"
      onMouseOver={handleProjectBoardTooltipMouseOver}
      onMouseOut={handleProjectBoardTooltipMouseOut}
      onFocusCapture={handleProjectBoardTooltipFocus}
      onBlurCapture={handleProjectBoardTooltipBlur}
      onClickCapture={hideProjectBoardTitleTooltip}
    >
      <ProjectBoardWorkspaceHeader
        project={project}
        board={board}
        busy={busy}
        sourceBusy={sourceBusy}
        sourceImpactBusy={sourceImpactBusy}
        kickoffDefaultsBusy={kickoffDefaultsBusy}
        refineBusy={refineBusy}
        finalizeBusy={finalizeBusy}
        synthesisRetryBusy={synthesisRetryBusy}
        synthesisDeferBusy={synthesisDeferBusy}
        synthesisPauseBusy={synthesisPauseBusy}
        revisionBusy={revisionBusy}
        proposalApplyBusy={proposalApplyBusy}
        gitControls={board ? projectBoardGitControls : undefined}
        onBuild={onBuild}
        onReviseBoard={onReviseBoard}
        onRefreshSources={onRefreshSources}
        onResetBoard={onResetBoard}
        onClose={onClose}
      />

      {board ? (
        <ProjectBoardWorkspaceBoardSurface
          board={board}
          gitControls={projectBoardGitControls}
          navigationController={projectBoardNavigationController}
          runController={projectBoardRunController}
          projectBoardCreateCardBusy={projectBoardCreateCardBusy}
          onCreateCard={(boardId) => void createProjectBoardDraftCard(boardId)}
          sourceBusy={sourceBusy}
          sourceImpactBusy={sourceImpactBusy}
          kickoffDefaultsBusy={kickoffDefaultsBusy}
          refineBusy={refineBusy}
          refineMode={refineMode}
          proposalAnswerBusy={proposalAnswerBusy}
          proposalCardReviewBusy={proposalCardReviewBusy}
          proposalApplyBusy={proposalApplyBusy}
          finalizeBusy={finalizeBusy}
          synthesisRetryBusy={synthesisRetryBusy}
          synthesisDeferBusy={synthesisDeferBusy}
          synthesisPauseBusy={synthesisPauseBusy}
          runActivityLinesByThread={runActivityLinesByThread}
          threadRunStatuses={threadRunStatuses}
          onApproveCard={onApproveCard}
          onSplitCard={onSplitCard}
          onUpdateCard={onUpdateCard}
          onUpdateCardCandidate={onUpdateCardCandidate}
          onResolveCardPiUpdate={onResolveCardPiUpdate}
          onSuggestClarificationDefaults={onSuggestClarificationDefaults}
          onSuggestKickoffDefaults={onSuggestKickoffDefaults}
          onApplyDecisionImpactFeedback={onApplyDecisionImpactFeedback}
          onRefreshDecisionDrafts={onRefreshDecisionDrafts}
          onRegenerateDecisionDrafts={onRegenerateDecisionDrafts}
          onRefreshSourceDrafts={onRefreshSourceDrafts}
          onRegenerateSourceDrafts={onRegenerateSourceDrafts}
          onApplySourceImpactFeedback={onApplySourceImpactFeedback}
          onRefreshSources={onRefreshSources}
          onRefineWithPi={onRefineWithPi}
          onRefineProposal={onRefineProposal}
          onElaborateSources={onElaborateSources}
          onAnswerProposalQuestion={onAnswerProposalQuestion}
          onReviewProposalCard={onReviewProposalCard}
          onApplyProposal={onApplyProposal}
          onUpdateSource={onUpdateSource}
          onAnswerQuestion={onAnswerQuestion}
          onFinalizeKickoff={onFinalizeKickoff}
          onCancelRevision={onCancelRevision}
          onRetrySynthesis={onRetrySynthesis}
          onPauseSynthesis={onPauseSynthesis}
          onDeferSynthesisSections={onDeferSynthesisSections}
        />
      ) : (
        <ProjectBoardWorkspaceEmptyPanel busy={busy} onBuild={onBuild} />
      )}
      {titleTooltipNode}
    </section>
  );
}
