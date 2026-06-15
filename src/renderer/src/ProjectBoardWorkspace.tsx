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
  CSSProperties,
  DragEvent as ReactDragEvent,
  FocusEvent as ReactFocusEvent,
  forwardRef,
  KeyboardEvent as ReactKeyboardEvent,
  memo,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
  startTransition,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
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
  projectBoardProjectionReview,
  projectBoardProjectionReviewResolutionState,
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
  type ProjectBoardCardClaimAction,
  type ProjectBoardSourceGroup,
  type ProjectBoardLiveSessionActivityLine,
} from "./projectBoardUiModel";
import {
  projectBoardDraftColumns,
} from "./projectBoardDraftInboxUiModel";
import { useProjectBoardWorkspaceNavigationController } from "./ProjectBoardWorkspaceNavigationController";
import { useProjectBoardWorkspaceRunController } from "./ProjectBoardWorkspaceRunController";
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
import type {
  AmbientPluginRegistry,
  AmbientGeneratedCapabilitySummary,
  AmbientMcpDefaultCapabilityInstallProgress,
  AmbientMcpContainerRuntimeManagedInstallProgress,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpInstallPreview,
  AmbientMcpInstalledServerSummary,
  AmbientMcpServerSearchResult,
  CapabilityBuilderHistoryEntry,
  CapabilityBuilderHistoryResult,
  AmbientPluginAuthAccountSummary,
  AmbientPluginAuthStartResult,
  AmbientPluginRuntime,
  AmbientPluginSourceKind,
  AmbientPluginCapabilityDiagnostics,
  BrowserCapabilityState,
  BrowserCredentialSummary,
  BrowserPickResult,
  BrowserProfileMode,
  BrowserScreenshotResult,
  BrowserRuntimeKind,
  BrowserUserActionState,
  FirstPartyGoogleIntegrationState,
  AutomationFolderSummary,
  AutomationScheduleExceptionSummary,
  AutomationScheduleSummary,
  AutomationThreadSummary,
  ChatMessage,
  CollaborationMode,
  CodexHostedMarketplaceReport,
  CodexPluginCatalog,
  CodexPluginCompatibilityTier,
  CodexMarketplaceSourceSummary,
  CodexPluginMcpInspectionCatalog,
  CodexPluginSummary,
  ContextUsageSnapshot,
  CopyProjectBoardSessionToThreadInput,
  CreateAmbientPermissionGrantInput,
  DesktopEvent,
  DesktopState,
  DiagnosticExportResult,
  DesktopUpdateState,
  ExportChatResult,
  MessageDelivery,
  MessageVoiceState,
  MiniCpmVisionAnalyzeInput,
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionDiagnosticItem,
  MiniCpmVisionSetupAction,
  MiniCpmVisionSetupResult,
  LocalDeepResearchInstallProgress,
  LocalDeepResearchRunHistoryEntry,
  LocalDeepResearchRunHistoryResult,
  ManagedDevServerSummary,
  SttProviderCandidate,
  SttMessageMetadata,
  SttProviderSetupResult,
  SttTestAudioResult,
  SttTranscriptionState,
  VoiceArtifactRetentionSummary,
  VoiceOnboardingHostFacts,
  VoiceProviderCandidate,
  VoiceProviderVoiceCandidate,
  MenuCommand,
  OrchestrationAutoDispatchStatus,
  OrchestrationRun,
  OrchestrationTask,
  AmbientPermissionGrant,
  PermissionAuditEntry,
  PermissionGrantScopeKind,
  PermissionMode,
  PermissionPromptResponseMode,
  AnswerPlannerDecisionQuestionInput,
  PlannerDecisionQuestion,
  PlannerPlanArtifact,
  PlannerPlanWorkflowState,
  PiPackageCatalog,
  PiExtensionSandboxCatalog,
  PiExtensionSandboxInstallPreview,
  PiExtensionSandboxPackageSummary,
  PiPackageInstallScope,
  PiPackageResourceKind,
  PiPrivilegedCatalog,
  PiPrivilegedInstallSummary,
  PiPrivilegedSecurityScan,
  PluginMcpRuntimeSnapshot,
  ProjectBoardCard,
  ProjectBoardAddCardsObjectiveProvenance,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardRunFeedbackSource,
  AddProjectBoardCardRunFeedbackInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  RefreshProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardSourceDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  ProjectBoardExecutionArtifact,
  ProjectBoardGitSyncStatus,
  ProjectBoardGitProjectionResolution,
  ProjectBoardProofDecisionAction,
  ResolveProjectBoardDeliverableIntegrationInput,
  ProjectBoardSplitDecisionAction,
  ResolveProjectBoardCardPiUpdateInput,
  SplitProjectBoardCardInput,
  UpdateProjectBoardCardInput,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSourceChangeState,
  ProjectBoardSourceKind,
  ProjectBoardSummary,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectBoardSynthesisRun,
  DeferProjectBoardSynthesisSectionsInput,
  RetryProjectBoardSynthesisInput,
  RefineProjectBoardSynthesisInput,
  ProjectSummary,
  PermissionRequest,
  PrivilegedCredentialRequest,
  ProviderCatalogSettingsCard,
  SecureInputRequest,
  ProviderStatus,
  RunStatus,
  SaveBrowserCredentialInput,
  RuntimeActivity,
  SendMessageComposerIntent,
  TerminalSession,
  ThemePreference,
  ThinkingDisplayMode,
  ThinkingLevel,
  AttachProjectBoardLocalTaskMode,
  CreateReadyProjectBoardTasksInput,
  RecomputeProjectBoardProofCoverageInput,
  RerunProjectBoardProofInput,
  SuggestProjectBoardClarificationDefaultsInput,
  SuggestProjectBoardKickoffDefaultsInput,
  SuggestProjectBoardProofInput,
  UpdateProjectBoardSourceInput,
  ThreadGoal,
  ThreadSummary,
  ToolLargeOutputPreview,
  ToolLongformInputPreview,
  WorkspaceContextReference,
  WorkspaceFileContent,
  FileTreeEntry,
  GitReviewFile,
  GitReviewSummary,
  GitSimpleAction,
  WorkflowConnectorManifestGrant,
  WorkflowConnectorDataRetention,
  WorkflowCompileAuditSummary,
  WorkflowCompileProgress,
  WorkflowDiscoveryProgress,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowDiscoveryAccessRequest,
  WorkflowExplorationProgress,
  WorkflowExplorationTraceSummary,
  WorkflowGraphNode,
  WorkflowModelCallRecord,
  WorkflowPluginCapabilityGrant,
  WorkflowArtifactSummary,
  WorkflowDashboard,
  WorkflowRevisionSummary,
  WorkflowRecoveryAction,
  WorkflowVersionSummary,
  WorkflowRunDetail,
  WorkflowRunEvent,
  WorkflowRunSummary,
  WorkflowRunLimitOverrides,
  WorkflowLabRun,
  WorkflowRecordingEditContext,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRecordingState,
  WorkflowUserInputResponse,
  WorkspaceFileTree,
  WorkspaceGitStatus,
  WorkspaceOpenTarget,
  WorkspaceSearchScope,
  WorkspaceSearchResult,
} from "../../shared/types";
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
  clampNumber,
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
  projectBoardProjectionResolutionLabel,
  projectBoardProjectionReviewActionLabel,
} from "./ProjectBoardCollaborationViews";
import { ProjectBoardBoardTab } from "./ProjectBoardBoardViews";

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

export type ProjectBoardTitleTooltip = {
  text: string;
  anchor: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  };
  left: number;
  top: number;
  arrowLeft: number;
  placement: "above" | "below";
  ready: boolean;
};


export function projectBoardTitleTooltipTrigger(target: EventTarget | null): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined;
  const trigger = target.closest<HTMLElement>("[data-project-board-tooltip], button[title]");
  if (!trigger) return undefined;
  return (trigger.dataset.projectBoardTooltip ?? trigger.getAttribute("title"))?.trim() ? trigger : undefined;
}


export function projectBoardTitleTooltipAnchor(trigger: HTMLElement): ProjectBoardTitleTooltip["anchor"] {
  const rect = trigger.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}


export function sameProjectBoardTitleTooltipAnchor(
  left: ProjectBoardTitleTooltip["anchor"],
  right: ProjectBoardTitleTooltip["anchor"],
): boolean {
  return (
    Math.abs(left.left - right.left) < 0.5 &&
    Math.abs(left.top - right.top) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5
  );
}

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
  const status = board ? projectBoardStatusLabel(board) : "No board";
  const isRevisionDraft = board?.status === "draft" && (board.charter?.version ?? 1) > 1;
  const draftColumns = projectBoardDraftColumns(board?.cards ?? [], { board });
  const boardSourceGroups = useMemo(() => projectBoardSourceGroups(board?.sources ?? []), [board?.sources]);
  const boardSourceChangeSummary = useMemo(
    () => projectBoardSourceChangeSummary(boardSourceGroups, board?.events ?? []),
    [board?.events, boardSourceGroups],
  );
  const [projectBoardCreateCardBusy, setProjectBoardCreateCardBusy] = useState(false);
  const [projectBoardGitStatus, setProjectBoardGitStatus] = useState<ProjectBoardGitSyncStatus | undefined>();
  const [projectBoardGitBusy, setProjectBoardGitBusy] = useState<"export" | "commit" | "push" | "pull" | "apply" | undefined>();
  const [projectBoardGitError, setProjectBoardGitError] = useState<string | undefined>();
  const [projectBoardProjectionResolutions, setProjectBoardProjectionResolutions] = useState<Record<string, ProjectBoardGitProjectionResolution | undefined>>({});
  const [projectBoardClaimBusy, setProjectBoardClaimBusy] = useState<string | undefined>();
  const [titleTooltip, setTitleTooltip] = useState<ProjectBoardTitleTooltip | undefined>();
  const projectBoardWorkspaceRef = useRef<HTMLElement>(null);
  const titleTooltipRef = useRef<HTMLDivElement>(null);
  const projectBoardNavigationController = useProjectBoardWorkspaceNavigationController({ board, finalizeBusy });
  const {
    activeCardInspectorRequest,
    activeTab,
    closeProjectBoardSourcePicker,
    draftInspectorMode,
    jumpProjectBoardToBlocker,
    openProjectBoardCardInspector,
    openProjectBoardInboxDetail,
    openProjectBoardSourcePicker,
    openProjectBoardSourceReview,
    revealProjectBoardDraftCard,
    selectProjectBoardActiveCard,
    selectProjectBoardDraftCard,
    selectedActiveCard,
    selectedActiveCardId,
    selectedDraftCard,
    selectedDraftCardId,
    setActiveTab,
    sourceReviewRequest,
  } = projectBoardNavigationController;
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
    addProjectBoardRunFeedback,
    applyProjectBoardOrchestration,
    attachProjectBoardTask,
    cancelProjectBoardRun,
    copyProjectBoardRunSession,
    createProjectBoardReadyTasks,
    openProjectBoardRunThread,
    prepareProjectBoardRuns,
    projectBoardCreateReadyTasksBusy,
    projectBoardDeliverableBusy,
    projectBoardOrchestration,
    projectBoardOrchestrationError,
    projectBoardRunBusy,
    projectBoardTaskImportBusy,
    recomputeProjectBoardProofCoverage,
    repairProjectBoardWorkflow,
    resolveProjectBoardDeliverableIntegration,
    resolveProjectBoardProofDecision,
    resolveProjectBoardSplitDecision,
    resolveProjectBoardWorkflowImpact,
    revealProjectBoardWorkspace,
    rerunProjectBoardProof,
    setProjectBoardOrchestrationError,
    startProjectBoardRun,
    suggestProjectBoardProof,
    updateProjectBoardWorkflowRaw,
    updateProjectBoardWorkflowSettings,
  } = projectBoardRunController;
  const columns = projectBoardColumns(board?.cards ?? [], projectBoardOrchestration);
  const tabs = board ? projectBoardTabs(board, projectBoardOrchestration) : [];
  const latestSynthesisRun = board ? projectBoardLatestVisibleSynthesisRun(board.synthesisRuns) : undefined;
  const complexityEstimate = useMemo(() => (board ? projectBoardComplexityEstimate(board) : undefined), [board]);
  const latestSynthesisRunIsKickoffDefaults = latestSynthesisRun?.stage === "kickoff_defaults";
  const runningSynthesisRun =
    latestSynthesisRun?.status === "running" || latestSynthesisRun?.status === "pause_requested" ? latestSynthesisRun : undefined;
  const pausableSynthesisRun = latestSynthesisRun?.status === "running" ? latestSynthesisRun : undefined;
  const pausedSynthesisRun = latestSynthesisRun?.status === "paused" ? latestSynthesisRun : undefined;
  const failedSynthesisRun = latestSynthesisRun?.status === "failed" && latestSynthesisRun.stage !== "kickoff_defaults" ? latestSynthesisRun : undefined;
  const showSynthesisActivity = Boolean(board && latestSynthesisRun);
  const projectionReview = projectBoardProjectionReview(projectBoardGitStatus, projectBoardGitError);
  const projectionResolutionState = projectBoardProjectionReviewResolutionState(projectionReview, projectBoardProjectionResolutions);
  const synthesisActivityAction = finalizeBusy
    ? "Applying board synthesis"
    : synthesisRetryBusy
      ? "Retrying board synthesis"
    : refineBusy && refineMode === "source_elaboration"
      ? "Elaborating source-scoped cards with Pi"
      : refineBusy && refineMode === "board_synthesis"
        ? "Generating draft board with Pi"
    : refineBusy
        ? "Reviewing charter with Pi"
      : latestSynthesisRunIsKickoffDefaults && latestSynthesisRun?.status === "running"
        ? "Suggesting kickoff defaults"
      : latestSynthesisRunIsKickoffDefaults && latestSynthesisRun?.status === "succeeded"
        ? "Latest kickoff defaults"
      : latestSynthesisRunIsKickoffDefaults && latestSynthesisRun?.status === "failed"
        ? "Kickoff defaults failed"
      : latestSynthesisRun?.status === "succeeded"
        ? "Latest board planning run"
        : latestSynthesisRun?.status === "paused"
          ? "Board planning paused"
        : latestSynthesisRun?.status === "pause_requested"
          ? "Pausing Ambient/Pi synthesis"
        : failedSynthesisRun
          ? "Board planning failed"
          : runningSynthesisRun
            ? "Running Ambient/Pi synthesis"
            : "Latest board planning run";
  const projectBoardReadinessRail = board
    ? projectBoardExecutionReadinessRail(board, projectBoardOrchestration?.tasks ?? [], projectBoardOrchestration?.runs ?? [], {
        runBusy: projectBoardRunBusy,
        orchestrationError: projectBoardOrchestrationError,
        workflowReadiness: projectBoardOrchestration?.workflowReadiness,
        gitStatus: projectBoardGitStatus,
        gitError: projectBoardGitError,
      })
    : undefined;
  const showProjectBoardReadinessRail = Boolean(projectBoardReadinessRail?.visible);

  useEffect(() => {
    setProjectBoardProjectionResolutions({});
  }, [
    projectBoardGitStatus?.projection?.valid,
    projectBoardGitStatus?.projection?.ok,
    projectBoardGitStatus?.projection?.differenceCount,
    projectBoardGitStatus?.projection?.changes?.map((change) => change.id).join("|"),
  ]);

  useEffect(() => {
    if (!board) {
      setProjectBoardGitStatus(undefined);
      setProjectBoardGitError(undefined);
      return;
    }
    const visualGitStatus = import.meta.env.DEV
      ? (window as Window & { __ambientVisualProjectBoardGitStatus?: ProjectBoardGitSyncStatus }).__ambientVisualProjectBoardGitStatus
      : undefined;
    if (visualGitStatus?.boardId === board.id) {
      setProjectBoardGitError(undefined);
      setProjectBoardGitStatus(visualGitStatus);
      return;
    }
    let disposed = false;
    setProjectBoardGitError(undefined);
    void window.ambientDesktop
      .getProjectBoardGitSyncStatus({ boardId: board.id })
      .then((next) => {
        if (!disposed) setProjectBoardGitStatus(next);
      })
      .catch((error) => {
        if (!disposed) setProjectBoardGitError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      disposed = true;
    };
  }, [board?.id, board?.updatedAt]);

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

  async function runProjectBoardGitAction(action: "export" | "commit" | "push" | "pull" | "apply") {
    if (!board) return;
    if (action === "apply") {
      const review = projectionReview;
      const resolutionState = projectBoardProjectionReviewResolutionState(review, projectBoardProjectionResolutions);
      if (!resolutionState.canApply) {
        setProjectBoardGitError(resolutionState.applyTitle);
        return;
      }
      const resolutionLines = review.rows
        .filter((row) => row.conflict)
        .map((row) => {
          const resolution = projectBoardProjectionResolutions[row.id];
          return `- ${row.label}: ${projectBoardProjectionResolutionLabel(resolution)}`;
        });
      const confirmed = window.confirm(
        [
          "Apply the pulled .ambient/board projection to this local board?",
          "",
          resolutionLines.length > 0
            ? `This will apply non-conflicting pulled changes for ${board.title} and use your card decisions below for conflicts.`
            : `This will replace local board cards, sources, charter, events, and synthesis records with the validated Git projection for ${board.title}.`,
          review.summary,
          resolutionState.applyImpact,
          resolutionLines.length > 0 ? "Conflict resolutions:" : "",
          ...resolutionLines,
          review.rows.length > 0 ? "" : "",
          ...review.rows.slice(0, 8).map((row) => `- ${projectBoardProjectionReviewActionLabel(row.action)} ${row.label}: ${row.detail}`),
          review.overflowCount > 0 ? `- Plus ${review.overflowCount} more projection difference${review.overflowCount === 1 ? "" : "s"}.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      if (!confirmed) return;
    }
    setProjectBoardGitBusy(action);
    setProjectBoardGitError(undefined);
    try {
      const resolutionInput = Object.entries(projectBoardProjectionResolutions)
        .filter((entry): entry is [string, Exclude<ProjectBoardGitProjectionResolution, "manual_resolution_required">] =>
          entry[1] === "apply_pulled" || entry[1] === "keep_local" || entry[1] === "defer",
        )
        .map(([changeId, resolution]) => {
          const row = projectionReview.rows.find((candidate) => candidate.id === changeId);
          return { changeId, entityId: row?.entityId, resolution };
        });
      const input = { boardId: board.id, ...(resolutionInput.length ? { resolutions: resolutionInput } : {}) };
      if (action === "apply") {
        await window.ambientDesktop.applyPulledProjectBoardGitProjection(input);
        setProjectBoardGitStatus(await window.ambientDesktop.getProjectBoardGitSyncStatus(input));
        setProjectBoardProjectionResolutions({});
      } else {
        const next =
          action === "export"
            ? await window.ambientDesktop.exportProjectBoardGitArtifacts(input)
            : action === "commit"
              ? await window.ambientDesktop.commitProjectBoardGitArtifacts(input)
              : action === "push"
                ? await window.ambientDesktop.pushProjectBoardGitArtifacts(input)
                : await window.ambientDesktop.pullProjectBoardGitArtifacts(input);
        setProjectBoardGitStatus(next);
      }
    } catch (error) {
      setProjectBoardGitError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBoardGitBusy(undefined);
    }
  }

  async function updateProjectBoardGitClaim(card: ProjectBoardCard, action: ProjectBoardCardClaimAction) {
    if (!board) return;
    if (action === "force_release") {
      const confirmed = window.confirm(
        [
          `Force-release the Git claim for "${card.title}"?`,
          "",
          "This records an audit event and makes the card available to this desktop. Use it only when the current owner is stale, blocked, or has explicitly handed off the card.",
        ].join("\n"),
      );
      if (!confirmed) return;
    } else if (action === "resolve_conflict") {
      const confirmed = window.confirm(
        [
          `Resolve competing Git claims for "${card.title}"?`,
          "",
          "This records expiry audit events for later conflicting claim attempts. The earliest still-active claim remains the owner, and normal claim/release controls decide who proceeds after the conflict is cleared.",
        ].join("\n"),
      );
      if (!confirmed) return;
    }
    setProjectBoardClaimBusy(`${action}:${card.id}`);
    setProjectBoardGitError(undefined);
    setProjectBoardOrchestrationError(undefined);
    const input = { boardId: board.id, cardId: card.id };
    try {
      if (action === "claim") {
        await window.ambientDesktop.claimProjectBoardGitCard(input);
      } else if (action === "expire") {
        await window.ambientDesktop.expireProjectBoardGitCardClaim({
          ...input,
          reason: "Expired claim recorded from Ambient Desktop before reclaim.",
        });
      } else if (action === "resolve_conflict") {
        await window.ambientDesktop.resolveProjectBoardGitCardClaimConflicts({
          ...input,
          reason: "Resolved competing claim events from Ambient Desktop.",
        });
      } else {
        await window.ambientDesktop.releaseProjectBoardGitCardClaim({
          ...input,
          force: action === "force_release",
          reason: action === "force_release" ? "Force release requested from Ambient Desktop." : "Released from Ambient Desktop.",
        });
      }
  setProjectBoardGitStatus(await window.ambientDesktop.getProjectBoardGitSyncStatus({ boardId: board.id }));
      applyProjectBoardOrchestration(await window.ambientDesktop.listOrchestrationBoard());
    } catch (error) {
      setProjectBoardGitError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBoardClaimBusy(undefined);
    }
  }

  const showProjectBoardTitleTooltip = (target: EventTarget | null) => {
    const button = projectBoardTitleTooltipTrigger(target);
    if (!button) return;
    const text = (button.dataset.projectBoardTooltip ?? button.getAttribute("title"))?.trim();
    if (!text) return;
    const anchor = projectBoardTitleTooltipAnchor(button);
    setTitleTooltip((current) =>
      current?.text === text && sameProjectBoardTitleTooltipAnchor(current.anchor, anchor)
        ? current
        : {
            text,
            anchor,
            left: anchor.left,
            top: anchor.bottom + 10,
            arrowLeft: Math.max(12, Math.min(anchor.width / 2, 320)),
            placement: "below",
            ready: false,
          },
    );
  };

  const hideProjectBoardTitleTooltip = () => setTitleTooltip(undefined);

  const handleProjectBoardTooltipMouseOver = (event: ReactMouseEvent<HTMLElement>) => {
    showProjectBoardTitleTooltip(event.target);
  };

  const handleProjectBoardTooltipMouseOut = (event: ReactMouseEvent<HTMLElement>) => {
    const nextButton = projectBoardTitleTooltipTrigger(event.relatedTarget);
    const currentButton = projectBoardTitleTooltipTrigger(event.target);
    if (nextButton && nextButton === currentButton) return;
    if (nextButton) {
      showProjectBoardTitleTooltip(nextButton);
      return;
    }
    hideProjectBoardTitleTooltip();
  };

  const handleProjectBoardTooltipFocus = (event: ReactFocusEvent<HTMLElement>) => {
    showProjectBoardTitleTooltip(event.target);
  };

  const handleProjectBoardTooltipBlur = (event: ReactFocusEvent<HTMLElement>) => {
    const nextButton = projectBoardTitleTooltipTrigger(event.relatedTarget);
    if (nextButton) showProjectBoardTitleTooltip(nextButton);
    else hideProjectBoardTitleTooltip();
  };

  useLayoutEffect(() => {
    if (!titleTooltip) return;
    const bubble = titleTooltipRef.current;
    if (!bubble) return;
    const margin = 12;
    const gap = 10;
    const bubbleRect = bubble.getBoundingClientRect();
    const bubbleWidth = Math.min(bubbleRect.width || 320, Math.max(120, window.innerWidth - margin * 2));
    const bubbleHeight = bubbleRect.height || 42;
    const triggerCenterX = titleTooltip.anchor.left + titleTooltip.anchor.width / 2;
    const left = clampNumber(triggerCenterX - bubbleWidth / 2, margin, Math.max(margin, window.innerWidth - bubbleWidth - margin));
    const belowTop = titleTooltip.anchor.bottom + gap;
    const aboveTop = titleTooltip.anchor.top - bubbleHeight - gap;
    const placement = belowTop + bubbleHeight <= window.innerHeight - margin || aboveTop < margin ? "below" : "above";
    const top =
      placement === "below"
        ? clampNumber(belowTop, margin, Math.max(margin, window.innerHeight - bubbleHeight - margin))
        : clampNumber(aboveTop, margin, Math.max(margin, window.innerHeight - bubbleHeight - margin));
    const arrowLeft = clampNumber(triggerCenterX - left, 14, Math.max(14, bubbleWidth - 14));
    setTitleTooltip((current) =>
      current && current.text === titleTooltip.text && sameProjectBoardTitleTooltipAnchor(current.anchor, titleTooltip.anchor)
        ? { ...current, left, top, arrowLeft, placement, ready: true }
        : current,
    );
  }, [titleTooltip?.anchor.bottom, titleTooltip?.anchor.height, titleTooltip?.anchor.left, titleTooltip?.anchor.top, titleTooltip?.anchor.width, titleTooltip?.text]);

  useEffect(() => {
    const handleDocumentMouseMove = (event: MouseEvent) => {
      const workspace = projectBoardWorkspaceRef.current;
      if (!workspace) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!target || !workspace.contains(target)) {
        setTitleTooltip(undefined);
        return;
      }
      const button = projectBoardTitleTooltipTrigger(target);
      if (button && workspace.contains(button)) showProjectBoardTitleTooltip(button);
      else setTitleTooltip(undefined);
    };
    document.addEventListener("mousemove", handleDocumentMouseMove);
    return () => document.removeEventListener("mousemove", handleDocumentMouseMove);
  }, []);

  const buildBoardTitle = busy
    ? "Project board creation is already running. Watch the progress feed for source scan and card generation activity."
    : "Create a project board, start the charter workflow, scan project sources, and ask Ambient/Pi to propose draft cards.";
  const resetBoardBlockReason = sourceBusy
    ? "Wait for source refresh to finish before resetting the board."
    : sourceImpactBusy
      ? "Wait for source draft refresh to finish before resetting the board."
      : kickoffDefaultsBusy
        ? "Wait for Ambient/Pi kickoff defaults to finish before resetting the board."
        : refineBusy
          ? "Wait for the active Ambient/Pi board review or source elaboration to finish before resetting."
          : finalizeBusy
            ? "Wait for charter activation or revision apply to finish before resetting."
            : synthesisRetryBusy
              ? "Wait for the synthesis retry to finish before resetting."
              : synthesisDeferBusy
                ? "Wait for section deferral to finish before resetting."
                : synthesisPauseBusy
                  ? "Wait for the planning pause request to finish before resetting."
                  : revisionBusy
                    ? "Wait for the revision draft to finish starting before resetting."
                    : proposalApplyBusy
                      ? "Wait for proposal apply to finish before resetting."
                      : undefined;
  const resetBoardDisabled = Boolean(board && resetBoardBlockReason);
  const resetBoardTitle = !board
    ? "No project board exists yet."
    : resetBoardDisabled
      ? (resetBoardBlockReason ?? "Wait for the active board operation to finish before resetting.")
      : "Reset this project board after confirmation. Project files, threads, and Local Task history are preserved.";

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
      <header className="project-board-header">
        <div className="project-board-title-block">
          <span className="project-board-kicker">Project board</span>
          <h2>{board?.title || `${project.name} board`}</h2>
          <p>{projectBoardEmptyMessage(board)}</p>
        </div>
        <div className="project-board-header-actions">
          <span className="project-board-status">{status}</span>
          {board && (
            <>
              <ProjectBoardGitSyncControls
                status={projectBoardGitStatus}
                error={projectBoardGitError}
                busy={projectBoardGitBusy}
                projectionResolutionState={projectionResolutionState}
                onAction={runProjectBoardGitAction}
              />
              {board.status !== "draft" && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onReviseBoard(board.id)}
                  disabled={revisionBusy}
                  title={revisionBusy ? "A draft charter revision is already starting." : "Start a draft charter revision using the current charter answers as the starting point."}
                >
                  <Pencil size={14} className={revisionBusy ? "spin" : ""} />
                  <span>{revisionBusy ? "Starting Revision" : "Revise Board"}</span>
                </button>
              )}
              <button
                type="button"
                className="secondary-button"
                onClick={() => onRefreshSources(board.id)}
                disabled={sourceBusy}
                title={sourceBusy ? "A source refresh is already scanning project material." : boardSourceChangeSummary.refreshTitle}
              >
                <RefreshCw size={14} className={sourceBusy ? "spin" : ""} />
                <span>{sourceBusy ? "Scanning" : "Refresh Sources"}</span>
              </button>
              <button
                type="button"
                className="secondary-button danger"
                onClick={onResetBoard}
                disabled={resetBoardDisabled}
                title={resetBoardTitle}
              >
                <Trash2 size={14} />
                <span>Reset Board</span>
              </button>
            </>
          )}
          {!board && (
            <button type="button" className="primary-button" onClick={onBuild} disabled={busy} title={buildBoardTitle}>
              <Kanban size={15} />
              <span>{busy ? "Building" : "Build Board"}</span>
            </button>
          )}
          <button type="button" className="icon-button" onClick={onClose} title="Close project board" aria-label="Close project board">
            <X size={16} />
          </button>
        </div>
      </header>

      {board && complexityEstimate && <ProjectBoardComplexityShadowPanel estimate={complexityEstimate} />}

      {isRevisionDraft && (
        <section className="project-board-revision-banner" aria-label="Project board revision status">
          <div>
            <span className="project-board-kicker">Revision draft active</span>
            <p>Review the prefilled charter answers below. Applying the revision will run live Ambient/Pi synthesis and replace unticketized draft candidates; canceling restores the previous active charter.</p>
          </div>
          <span className="project-board-status warning">Needs apply or cancel</span>
        </section>
      )}

      {board ? (
        <>
          <ProjectBoardCollaborationReadinessPanel status={projectBoardGitStatus} error={projectBoardGitError} />
          <ProjectBoardProjectionReviewPanel
            status={projectBoardGitStatus}
            error={projectBoardGitError}
            resolutions={projectBoardProjectionResolutions}
            onResolve={(changeId, resolution) =>
              setProjectBoardProjectionResolutions((current) => ({
                ...current,
                [changeId]: current[changeId] === resolution ? undefined : resolution,
              }))
            }
          />
          {showProjectBoardReadinessRail && projectBoardReadinessRail && (
            <ProjectBoardExecutionReadinessRailPanel
              rail={projectBoardReadinessRail}
              onSelectCard={openProjectBoardCardInspector}
              onSelectTab={setActiveTab}
              onOpenSourcePicker={openProjectBoardSourcePicker}
              onPrepareRuns={() => void prepareProjectBoardRuns()}
              onStartRun={(runId) => void startProjectBoardRun(runId)}
              runBusy={projectBoardRunBusy}
            />
          )}
          <ProjectBoardTabs tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />
          {showSynthesisActivity && (
            <ProjectBoardSynthesisActivity
              run={latestSynthesisRun}
              action={synthesisActivityAction}
              retryBusy={synthesisRetryBusy}
              pauseBusy={synthesisPauseBusy}
              onRetry={!latestSynthesisRunIsKickoffDefaults && failedSynthesisRun ? () => onRetrySynthesis(board.id, failedSynthesisRun.id) : undefined}
              onRetryStalledRun={
                !latestSynthesisRunIsKickoffDefaults && runningSynthesisRun ? () => onRetrySynthesis(board.id, runningSynthesisRun.id, "stalled_run") : undefined
              }
              onPause={!latestSynthesisRunIsKickoffDefaults && pausableSynthesisRun ? () => onPauseSynthesis(board.id, pausableSynthesisRun.id) : undefined}
              onResumePausedRun={
                !latestSynthesisRunIsKickoffDefaults && pausedSynthesisRun ? () => onRetrySynthesis(board.id, pausedSynthesisRun.id, "paused_run") : undefined
              }
            />
          )}
          {activeTab === "overview" && (
            <ProjectBoardOverviewTab
              board={board}
              orchestrationBoard={projectBoardOrchestration}
              gitStatus={projectBoardGitStatus}
              gitError={projectBoardGitError}
              onSelectTab={setActiveTab}
              onSelectCard={openProjectBoardCardInspector}
            />
          )}
          {activeTab === "board" && (
            <ProjectBoardBoardTab
              board={board}
              columns={columns}
              boardStatus={board.status}
              latestSynthesisRun={latestSynthesisRun}
              synthesisRetryBusy={synthesisRetryBusy}
              orchestrationBoard={projectBoardOrchestration}
              orchestrationError={projectBoardOrchestrationError}
              runActivityLinesByThread={runActivityLinesByThread}
              threadRunStatuses={threadRunStatuses}
              selectedCard={selectedActiveCard}
              selectedCardId={selectedActiveCardId}
              onSelectCard={selectProjectBoardActiveCard}
              onSelectTab={setActiveTab}
              onOpenSourcePicker={openProjectBoardSourcePicker}
              onJumpToBlocker={jumpProjectBoardToBlocker}
              onJumpToInbox={openProjectBoardInboxDetail}
              runBusy={projectBoardRunBusy}
              onPrepareRuns={() => void prepareProjectBoardRuns()}
              onResolveWorkflowImpact={(action, runIds) => void resolveProjectBoardWorkflowImpact(action, runIds)}
              onRepairWorkflow={(action) => void repairProjectBoardWorkflow(action)}
              onUpdateWorkflowSettings={(input) => void updateProjectBoardWorkflowSettings(input)}
              onUpdateWorkflowRaw={(input) => void updateProjectBoardWorkflowRaw(input)}
              onStartRun={(runId) => void startProjectBoardRun(runId)}
              onCancelRun={(runId) => void cancelProjectBoardRun(runId)}
              onRevealWorkspace={(workspacePath) => void revealProjectBoardWorkspace(workspacePath)}
              onOpenRunThread={(threadId, workspacePath) => void openProjectBoardRunThread(threadId, workspacePath)}
              onCopySessionToThread={(input) => void copyProjectBoardRunSession(input)}
              onResolveProofDecision={(cardId, action, reason) => void resolveProjectBoardProofDecision(cardId, action, reason)}
              onResolveSplitDecision={(cardId, action) => void resolveProjectBoardSplitDecision(cardId, action)}
              onAddRunFeedback={(input) => void addProjectBoardRunFeedback(input)}
              onRetrySynthesis={(retryOfRunId, mode) => onRetrySynthesis(board.id, retryOfRunId, mode)}
              synthesisDeferBusy={synthesisDeferBusy}
              onDeferSynthesisSections={(runId) => onDeferSynthesisSections(board.id, runId)}
              taskImportBusy={projectBoardTaskImportBusy}
              onAttachLocalTask={(taskId, mode) => void attachProjectBoardTask(taskId, mode)}
              gitStatus={projectBoardGitStatus}
              gitError={projectBoardGitError}
              claimBusy={projectBoardClaimBusy}
              onClaimAction={(card, action) => void updateProjectBoardGitClaim(card, action)}
              inspectorRequest={activeCardInspectorRequest}
            />
          )}
          {activeTab === "map" && <ProjectBoardMapTab board={board} onUpdateCard={onUpdateCard} onInspectCard={openProjectBoardCardInspector} />}
          {activeTab === "proof" && (
            <ProjectBoardProofTab
              board={board}
              orchestrationBoard={projectBoardOrchestration}
              runBusy={projectBoardRunBusy}
              onSelectCard={openProjectBoardCardInspector}
              onResolveProofDecision={(cardId, action, reason) => void resolveProjectBoardProofDecision(cardId, action, reason)}
              onRerunProof={(input) => void rerunProjectBoardProof(input)}
              onRecomputeProofCoverage={(boardId) => void recomputeProjectBoardProofCoverage(boardId)}
              onSuggestProof={(boardId, cardIds) => void suggestProjectBoardProof(boardId, cardIds)}
            />
          )}
          {activeTab === "integration" && (
            <ProjectBoardIntegrationTab
              board={board}
              orchestrationBoard={projectBoardOrchestration}
              busy={projectBoardDeliverableBusy}
              onResolve={(input) => void resolveProjectBoardDeliverableIntegration(input)}
            />
          )}
          {activeTab === "charter" && (
            <ProjectBoardCharterTab
              board={board}
              finalizeBusy={finalizeBusy}
              sourceBusy={sourceBusy}
              sourceImpactBusy={sourceImpactBusy}
              kickoffDefaultsBusy={kickoffDefaultsBusy}
              refineBusy={refineBusy}
              onAnswerQuestion={onAnswerQuestion}
              onFinalizeKickoff={onFinalizeKickoff}
              onCancelRevision={onCancelRevision}
              onRefreshSources={onRefreshSources}
              onSuggestKickoffDefaults={onSuggestKickoffDefaults}
              onRefreshSourceDrafts={onRefreshSourceDrafts}
              onRegenerateSourceDrafts={onRegenerateSourceDrafts}
              onApplySourceImpactFeedback={onApplySourceImpactFeedback}
              onRefineWithPi={onRefineWithPi}
              onElaborateSources={onElaborateSources}
              onUpdateSource={onUpdateSource}
              sourcePickerRequestId={sourceReviewRequest.requestId}
              sourceFocusSourceId={sourceReviewRequest.sourceId}
              onOpenSourceReview={openProjectBoardSourceReview}
              onInspectCard={openProjectBoardCardInspector}
            />
          )}
          {activeTab === "decisions" && (
            <ProjectBoardSynthesisProposalTab
              board={board}
              refineBusy={refineBusy}
              answerBusy={proposalAnswerBusy}
              cardReviewBusy={proposalCardReviewBusy}
              applyBusy={proposalApplyBusy}
              onRefineProposal={onRefineProposal}
              onAnswerQuestion={onAnswerProposalQuestion}
              onReviewCard={onReviewProposalCard}
              onApplyProposal={onApplyProposal}
              retryBusy={synthesisRetryBusy}
              deferBusy={synthesisDeferBusy}
              onRetrySynthesis={(runId, mode = "failed_sections") => onRetrySynthesis(board.id, runId, mode)}
              onDeferSynthesisSections={(runId) => onDeferSynthesisSections(board.id, runId)}
              onSelectCard={openProjectBoardCardInspector}
              onUpdateCard={onUpdateCard}
              onSuggestClarificationDefaults={onSuggestClarificationDefaults}
              onApplyDecisionImpactFeedback={onApplyDecisionImpactFeedback}
              onRefreshDecisionDrafts={onRefreshDecisionDrafts}
              onRegenerateDecisionDrafts={onRegenerateDecisionDrafts}
            />
          )}
          {activeTab === "history" && (
            <ProjectBoardHistoryTab
              board={board}
              orchestrationBoard={projectBoardOrchestration}
              gitStatus={projectBoardGitStatus}
              gitError={projectBoardGitError}
              retryBusy={synthesisRetryBusy}
              deferBusy={synthesisDeferBusy}
              onRetrySynthesis={(runId, mode) => onRetrySynthesis(board.id, runId, mode)}
              onDeferSynthesisSections={(runId) => onDeferSynthesisSections(board.id, runId)}
              onOpenSourceContext={() => openProjectBoardSourceReview()}
              onSelectTab={setActiveTab}
              onSelectCard={openProjectBoardCardInspector}
            />
          )}
          {activeTab === "draft_inbox" && (
            <ProjectBoardDraftInboxTab
              board={board}
              columns={draftColumns}
              selectedCard={selectedDraftCard}
              selectedCardId={selectedDraftCardId}
              inspectorMode={draftInspectorMode}
              refineBusy={refineBusy && refineMode === "source_elaboration"}
              sourceBusy={sourceBusy}
              sourceImpactBusy={sourceImpactBusy}
              onSelectCard={selectProjectBoardDraftCard}
              onCloseSourcePicker={closeProjectBoardSourcePicker}
              createCardBusy={projectBoardCreateCardBusy}
              createReadyTasksBusy={projectBoardCreateReadyTasksBusy}
              onCreateCard={(boardId) => void createProjectBoardDraftCard(boardId)}
              onCreateReadyTasks={(boardId) => void createProjectBoardReadyTasks(boardId)}
              onRefreshSources={onRefreshSources}
              onRefreshSourceDrafts={onRefreshSourceDrafts}
              onRegenerateSourceDrafts={onRegenerateSourceDrafts}
              onApplySourceImpactFeedback={onApplySourceImpactFeedback}
              onElaborateSources={onElaborateSources}
              onApproveCard={onApproveCard}
              onSplitCard={onSplitCard}
              onUpdateCard={onUpdateCard}
              onUpdateCardCandidate={onUpdateCardCandidate}
              onResolveCardPiUpdate={onResolveCardPiUpdate}
              onApplyDecisionImpactFeedback={onApplyDecisionImpactFeedback}
              onRefreshDecisionDrafts={onRefreshDecisionDrafts}
              onRegenerateDecisionDrafts={onRegenerateDecisionDrafts}
              onOpenSourcePicker={openProjectBoardSourcePicker}
              onReviewSources={() => openProjectBoardSourceReview()}
              onInspectSource={openProjectBoardSourceReview}
              latestSynthesisRun={latestSynthesisRun}
              gitStatus={projectBoardGitStatus}
              claimBusy={projectBoardClaimBusy}
              onClaimAction={(card, action) => void updateProjectBoardGitClaim(card, action)}
            />
          )}
        </>
      ) : (
        <div className="project-board-empty-panel">
          {busy && <ProjectBoardSynthesisActivity action="Creating project board and scanning sources" />}
          <Kanban size={28} />
          <h3>Build a board when the project is ready for formal execution.</h3>
          <p>
            The board starts with a kickoff charter. Later phases will scan threads and project markdown, ask targeted questions,
            and create executable cards only after the plan is clear.
          </p>
          <button type="button" className="primary-button" onClick={onBuild} disabled={busy} title={buildBoardTitle}>
            <Kanban size={15} />
            <span>{busy ? "Building" : "Build Board"}</span>
          </button>
        </div>
      )}
      {titleTooltip && (
        <div
          ref={titleTooltipRef}
          className={`project-board-title-tooltip ${titleTooltip.ready ? "visible" : ""} placement-${titleTooltip.placement}`}
          role="tooltip"
          style={{
            left: titleTooltip.left,
            top: titleTooltip.top,
            "--project-board-title-tooltip-arrow-left": `${titleTooltip.arrowLeft}px`,
          } as CSSProperties}
        >
          {titleTooltip.text}
        </div>
      )}
    </section>
  );
}
