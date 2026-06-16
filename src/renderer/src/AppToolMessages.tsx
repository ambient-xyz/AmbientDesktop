import {
  AlertCircle,
  Archive,
  Bell,
  BookOpenText,
  Bot,
  Brain,
  CalendarPlus,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Clock,
  Code2,
  Command,
  Copy,
  Download,
  ExternalLink,
  Film,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderPlus,
  FolderOpen,
  GitBranch,
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
  Package,
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
  Shield,
  SquarePen,
  Square,
  Star,
  Sun,
  Target,
  Terminal,
  Trash2,
  X,
  Zap,
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
  projectBoardProofEvidenceModel,
  projectBoardProofFollowUpImpactModel,
  projectBoardProofInspectionNavigationModel,
  projectBoardProofCoverageForBoard,
  projectBoardProofReviewQueueSummary,
  projectBoardPmReviewReportUiModel,
  projectBoardProjectionReview,
  projectBoardProjectionReviewResolutionState,
  projectBoardResetImpact,
  projectBoardTaskActionEvidenceFromProof,
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
  OrchestrationBoard,
  OrchestrationPrepareResult,
  RepairOrchestrationWorkflowAction,
  ResolveOrchestrationWorkflowImpactAction,
  UpdateOrchestrationWorkflowRawInput,
  UpdateOrchestrationWorkflowSettingsInput,
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
  ProjectBoardEvent,
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
  ProjectBoardSynthesisRunProgressiveRecord,
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
  latestRunForTask,
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
import { isScrolledToBottom } from "./scrolling";
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
  artifactPreviewRoute,
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
  type ToolManagedFileArtifactPreviewData,
  type ToolMessagingConversationDirectorySetupPreviewData,
  type ToolMessagingRemoteSurfaceActivationPreviewData,
  type ToolProgressPreviewData,
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
  DiffOutput,
  formatPanelFileSize,
  LazyHtmlPreview,
  OpenTargetIcon,
  truncateUiText,
  formatTaskState,
} from "./RightPanel";
import {
  activePaneTooltip,
  automationHelpText,
  automationIndicatorKind,
  type AutomationPane,
  AutomationsWorkspace,
  chatExportStatusMessage,
  formatDelay,
  formatOrchestrationRunStatus,
  formatRunDuration,
  ProofEvidencePathLink,
  ProofOfWorkPreview,
  RunTimeline,
  type ThreadIndicatorKind,
  useRunningClock,
  workflowRecorderSurface
} from "./AutomationsWorkspace";
import {
  ProjectBoardWorkspace,
} from "./ProjectBoardWorkspace";
import {
  AmbientCliSecretDialog,
  type AmbientCliSecretDialogState,
  ApiKeyDialog,
  CommandPalette,
  type CommandPaletteItem,
  DesktopUpdateNotice,
  LocalDeepResearchFollowupDialog,
  PermissionDialog,
  PermissionFullAccessNote,
  PrivilegedCredentialDialog,
  SecureInputDialog,
} from "./AppDialogs";
import {
  type PlannerRevisionDialogState,
  PlannerRevisionDialogView,
  type ProjectActionDialogState,
  ProjectActionDialogView,
  type ProjectBoardResetDialogState,
  ProjectBoardResetDialogView,
  ProjectContextMenu,
  type ProjectContextMenuState,
  SidebarMenuDivider,
  SidebarMenuItem,
  SidebarMenuLabel,
  type ThreadActionDialogState,
  ThreadActionDialogView,
  ThreadContextMenu,
  type ThreadContextMenuState,
} from "./AppActionDialogs";
import {
  type AutomationPopover,
  AutomationSidebar,
  type ProjectPopover,
  ProjectsHeader,
  type SidebarOrganizeSettings,
  ThreadIndicatorIcon,
  WorkflowAgentSidebar,
} from "./AppSidebar";
import {
  EMPTY_RUN_ACTIVITY_LINES,
  RunActivityFeed,
  RUN_ACTIVITY_MAX_LINES,
  RUN_ACTIVITY_PLACEHOLDER,
  RUN_ACTIVITY_SCROLL_THRESHOLD,
  scheduleScrollToBottom,
  summarizeRunActivity,
  type RunActivityLine,
} from "./AppRunActivity";
import {
  BrowserUserActionChatCard,
  ChatFindBar,
  DismissibleErrorStrip,
  ThreadVoiceStatusBar,
  chatBrowserUserActionForThread,
  voiceThreadStatusDismissKey,
} from "./AppChatChrome";

export type MediaPreviewModalRequest = { path: string; mediaKind: "image" | "video" };

function messageStatus(message: ChatMessage): string | undefined {
  return typeof message.metadata?.status === "string" ? message.metadata.status : undefined;
}

export function ToolMessageCard({
  message,
  workspacePath,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenUrl,
  onOpenBrowserUrl,
  onOpenBrowserPanel,
  onOpenMediaModal,
  generatedMediaAutoplay,
  toolActionDisabled,
  onSendTelegramSessionSetupPrompt,
  onSendRemoteSurfaceActivationPrompt,
}: {
  message: ChatMessage;
  workspacePath: string;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenBrowserUrl: (url: string) => void;
  onOpenBrowserPanel: () => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
  generatedMediaAutoplay: boolean;
  toolActionDisabled?: boolean;
  onSendTelegramSessionSetupPrompt?: (prompt: string) => void | Promise<void>;
  onSendRemoteSurfaceActivationPrompt?: (prompt: string) => void | Promise<void>;
}) {
  const status = messageStatus(message);
  const toolName = typeof message.metadata?.toolName === "string" ? message.metadata.toolName : "Tool";
  const parsed = parseToolMessage(message.content, toolName, workspacePath, message.metadata);
  const injectedPlaybookChip = workflowRecorderInjectedPlaybookChip(message.metadata);
  const canPreviewArtifact = parsed.artifactPath && status !== "running";
  const browserTool = isBrowserToolName(toolName);
  const hasStructuredBodyPreview = Boolean(
    parsed.installRoutePreview ||
    parsed.longformInputPreview ||
    parsed.editPreview ||
    parsed.voicePreview ||
    parsed.sttPreview ||
    parsed.telegramSessionSetup ||
    parsed.messagingConversationDirectorySetup ||
    parsed.messagingRemoteSurfaceActivation,
  );
  const showProgressPreview = Boolean(parsed.progressPreview && !hasStructuredBodyPreview);
  return (
    <article className={`message tool status-${status ?? "done"}`}>
      <details className="tool-card" open={status === "running" || status === "error"}>
        <summary>
          <span className={`tool-status ${status ?? "done"}`}>
            <ToolStatusIcon status={status} />
          </span>
          <span className="tool-summary-body">
            <span className="tool-title-row">
              <strong>{toolName}</strong>
              {parsed.artifactPath && <span className="tool-artifact-pill">{fileBaseName(parsed.artifactPath)}</span>}
              {injectedPlaybookChip && (
                <span className="tool-workflow-playbook-chip" title={injectedPlaybookChip.tooltip}>
                  <Package size={12} />
                  <span>{injectedPlaybookChip.label}</span>
                </span>
              )}
              {browserTool && (
                <button
                  type="button"
                  className="tool-inline-action"
                  title="Show the Browser panel"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenBrowserPanel();
                  }}
                >
                  <Monitor size={12} />
                  <span>Show browser</span>
                </button>
              )}
            </span>
            <small>{parsed.summary}</small>
            {parsed.argumentStatus && <span className="tool-argument-status">{parsed.argumentStatus}</span>}
            {parsed.preview && (
              <span className="tool-command-preview">
                <span>{parsed.inputTitle}</span>
                <code>{parsed.preview}</code>
              </span>
            )}
            {parsed.resultPreview && (
              <span className="tool-result-preview">
                <span>Output</span>
                <code>{parsed.resultPreview}</code>
              </span>
            )}
          </span>
        </summary>
        {parsed.input || parsed.result || showProgressPreview || parsed.managedFileArtifacts.length > 0 ? (
          <div
            className="tool-output"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {showProgressPreview && parsed.progressPreview ? <ToolProgressPreviewView preview={parsed.progressPreview} /> : null}
            {parsed.installRoutePreview ? (
              <ToolInstallRoutePreview preview={parsed.installRoutePreview} />
            ) : parsed.longformInputPreview ? (
              <ToolLongformInputPreviewView preview={parsed.longformInputPreview} running={status === "running"} />
            ) : parsed.editPreview ? (
              <ToolEditPreview preview={parsed.editPreview} running={status === "running"} />
            ) : parsed.voicePreview ? (
              <ToolVoicePreview preview={parsed.voicePreview} running={status === "running"} onOpenUrl={onOpenUrl} />
            ) : parsed.sttPreview ? (
              <ToolSttPreview preview={parsed.sttPreview} running={status === "running"} onPreviewPath={onPreviewPath} />
            ) : parsed.telegramSessionSetup ? (
              <ToolTelegramSessionSetupCard
                card={parsed.telegramSessionSetup}
                running={status === "running"}
                actionDisabled={toolActionDisabled}
                onSendPrompt={onSendTelegramSessionSetupPrompt}
              />
            ) : parsed.messagingConversationDirectorySetup ? (
              <ToolMessagingConversationDirectorySetupCard
                card={parsed.messagingConversationDirectorySetup}
                running={status === "running"}
              />
            ) : parsed.messagingRemoteSurfaceActivation ? (
              <ToolMessagingRemoteSurfaceActivationCard
                card={parsed.messagingRemoteSurfaceActivation}
                running={status === "running"}
                actionDisabled={toolActionDisabled}
                onSendPrompt={onSendRemoteSurfaceActivationPrompt}
              />
            ) : parsed.input ? (
              <ToolSection
                title={parsed.inputTitle}
                content={parsed.input}
                workspacePath={workspacePath}
                onPreviewPath={onPreviewPath}
                onPreviewLocalPath={onPreviewLocalPath}
                onOpenUrl={onOpenUrl}
                onOpenBrowserUrl={onOpenBrowserUrl}
              />
            ) : null}
            {parsed.largeOutputPreview && <ToolLargeOutputPreviewView preview={parsed.largeOutputPreview} onPreviewPath={onPreviewPath} />}
            {parsed.managedFileArtifacts.length > 0 && (
              <ToolManagedFileArtifactsPreview
                artifacts={parsed.managedFileArtifacts}
                onPreviewPath={onPreviewPath}
                onPreviewLocalPath={onPreviewLocalPath}
              />
            )}
            {parsed.result && (
              <ToolSection
                title="Result"
                content={parsed.result}
                workspacePath={workspacePath}
                onPreviewPath={onPreviewPath}
                onPreviewLocalPath={onPreviewLocalPath}
                onOpenUrl={onOpenUrl}
                onOpenBrowserUrl={onOpenBrowserUrl}
              />
            )}
          </div>
        ) : (
          <p className="panel-note">No output.</p>
        )}
      </details>
      {canPreviewArtifact && (
        <ArtifactPreviewStrip
          artifactPath={parsed.artifactPath!}
          generatedMediaAutoplay={generatedMediaAutoplay}
          onPreviewPath={onPreviewPath}
          onPreviewLocalPath={onPreviewLocalPath}
          onOpenMediaModal={onOpenMediaModal}
        />
      )}
    </article>
  );
}

export function ToolManagedFileArtifactsPreview({
  artifacts,
  onPreviewPath,
  onPreviewLocalPath,
}: {
  artifacts: ToolManagedFileArtifactPreviewData[];
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
}) {
  return (
    <section className="tool-large-output-preview">
      <div className="tool-section-title">
        Managed files
        <code>{artifacts.length.toLocaleString()} {artifacts.length === 1 ? "artifact" : "artifacts"}</code>
      </div>
      <div className="tool-large-output-items">
        {artifacts.map((artifact, index) => {
          const previewPath = artifact.workspacePath ?? artifact.hostPath;
          const canPreviewWorkspace = Boolean(artifact.workspacePath);
          return (
            <div className="tool-large-output-item" key={`${artifact.filename}-${artifact.workspacePath ?? artifact.hostPath ?? artifact.containerPath ?? index}`}>
              <div className="tool-large-output-row">
                <span>{artifact.filename}</span>
                {artifact.bytes !== undefined && <code>{artifact.bytes.toLocaleString()} bytes</code>}
                {artifact.source && <code>{artifact.source}</code>}
              </div>
              {previewPath && (
                <button
                  type="button"
                  className="artifact-link"
                  onClick={() => canPreviewWorkspace ? onPreviewPath(artifact.workspacePath!) : onPreviewLocalPath(artifact.hostPath!)}
                  title={canPreviewWorkspace ? `Preview ${artifact.workspacePath}` : `Preview ${artifact.hostPath}`}
                >
                  <FileText size={13} />
                  <span>{canPreviewWorkspace ? artifact.workspacePath : artifact.hostPath}</span>
                </button>
              )}
              {artifact.containerPath && <p className="tool-large-output-note">Container path: {artifact.containerPath}</p>}
              {artifact.copySkippedReason && <p className="tool-large-output-note">{artifact.copySkippedReason}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ArtifactPreviewStrip({
  artifactPath,
  generatedMediaAutoplay,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenMediaModal,
}: {
  artifactPath: string;
  generatedMediaAutoplay: boolean;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
}) {
  const mediaKind = artifactMediaKindFromPath(artifactPath);
  const route = artifactPreviewRoute(artifactPath);
  const previewArtifact = () => {
    if (route.kind === "local-file") onPreviewLocalPath(artifactPath);
    else if (route.kind === "workspace-media") onOpenMediaModal(artifactPath, route.mediaKind);
    else onPreviewPath(artifactPath);
  };
  return (
    <div className={`artifact-strip ${mediaKind ? "media-artifact-strip" : ""}`} aria-label="Artifact">
      <div className="artifact-strip-header">
        <button type="button" className="artifact-link" onClick={previewArtifact} title={`Preview ${artifactPath}`}>
          {mediaKind === "image" ? <FileImage size={13} /> : mediaKind === "audio" ? <Music size={13} /> : mediaKind === "video" ? <Film size={13} /> : <FileText size={13} />}
          <span>Preview {fileBaseName(artifactPath)}</span>
        </button>
        <span>{artifactPath}</span>
      </div>
      {mediaKind && route.kind !== "local-file" && (
        <InlineArtifactMedia
          artifactPath={artifactPath}
          mediaKind={mediaKind}
          generatedMediaAutoplay={generatedMediaAutoplay}
          onPreviewPath={onPreviewPath}
          onOpenMediaModal={onOpenMediaModal}
        />
      )}
    </div>
  );
}

export function MediaPreviewModal({
  request,
  generatedMediaAutoplay,
  onClose,
  onOpenInFiles,
}: {
  request: MediaPreviewModalRequest;
  generatedMediaAutoplay: boolean;
  onClose: () => void;
  onOpenInFiles: (path: string) => void;
}) {
  const [file, setFile] = useState<WorkspaceFileContent | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [playbackError, setPlaybackError] = useState<string | undefined>();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFile(undefined);
    setError(undefined);
    setPlaybackError(undefined);
    window.ambientDesktop
      .readWorkspaceFile(request.path)
      .then((nextFile) => {
        if (cancelled) return;
        setFile(nextFile);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [request.path]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const title = file?.name ?? fileBaseName(request.path);
  const imageSrc = file?.kind === "image" ? file.dataUrl ?? file.mediaUrl : undefined;
  const canRenderImage = request.mediaKind === "image" && Boolean(imageSrc);
  const canRenderVideo = request.mediaKind === "video" && file?.kind === "video" && file.mediaUrl;

  return (
    <div className="modal-backdrop media-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="media-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="media-modal-header">
          <div>
            <h2 id="media-modal-title">{title}</h2>
            <span>{request.path}</span>
          </div>
          <div className="media-modal-actions">
            <button type="button" className="secondary-button" onClick={() => onOpenInFiles(request.path)}>
              Open in Files
            </button>
            <button ref={closeButtonRef} type="button" className="media-modal-close" onClick={onClose} aria-label="Close media preview">
              <X size={17} />
            </button>
          </div>
        </header>
        <div className="media-modal-stage">
          {error ? (
            <MediaModalError message={`Media preview failed. ${error}`} path={request.path} onOpenInFiles={onOpenInFiles} />
          ) : playbackError ? (
            <MediaModalError message={playbackError} path={request.path} onOpenInFiles={onOpenInFiles} />
          ) : !file ? (
            <div className="inline-media-loading">Loading media preview...</div>
          ) : canRenderImage && file?.kind === "image" && imageSrc ? (
            <img src={imageSrc} alt={file.name} onError={() => setPlaybackError(mediaPreviewUnavailableMessage("image"))} />
          ) : canRenderVideo ? (
            <video
              key={`${file.path}:${file.mtimeMs ?? file.size}`}
              controls
              preload="metadata"
              src={file.mediaUrl}
              autoPlay={generatedMediaAutoplay}
              muted={generatedMediaAutoplay}
              onError={() => setPlaybackError(mediaPreviewUnavailableMessage("video"))}
            >
              Video preview is not supported by this Electron build.
            </video>
          ) : (
            <MediaModalError message="Media preview is not available for this artifact." path={request.path} onOpenInFiles={onOpenInFiles} />
          )}
        </div>
      </section>
    </div>
  );
}

export function MediaModalError({
  message,
  path,
  onOpenInFiles,
}: {
  message: string;
  path: string;
  onOpenInFiles: (path: string) => void;
}) {
  return (
    <div className="media-modal-error">
      <AlertCircle size={20} />
      <strong>{message}</strong>
      <span>Ambient can still open the artifact in the Files panel or through the system default app.</span>
      <button type="button" className="secondary-button" onClick={() => onOpenInFiles(path)}>
        Open in Files
      </button>
    </div>
  );
}

export function ToolSection({
  title,
  content,
  workspacePath,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenUrl,
  onOpenBrowserUrl,
}: {
  title: string;
  content: string;
  workspacePath: string;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenBrowserUrl: (url: string) => void;
}) {
  return (
    <section className="tool-section">
      <div className="tool-section-title">{title}</div>
      <RichText
        content={content}
        compact
        workspacePath={workspacePath}
        onPreviewPath={onPreviewPath}
        onPreviewLocalPath={onPreviewLocalPath}
        onOpenUrl={onOpenUrl}
        onOpenBrowserUrl={onOpenBrowserUrl}
      />
    </section>
  );
}

export function ToolLongformInputPreviewView({
  preview,
  running,
}: {
  preview: ToolLongformInputPreview;
  running: boolean;
}) {
  const codeRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!running) return;
    codeRef.current?.scrollTo({ top: codeRef.current.scrollHeight });
  }, [preview.items, running]);

  return (
    <section className={`tool-longform-input-preview ${running ? "running" : ""}`}>
      <div className="tool-section-title">
        {running ? preview.runningTitle ?? preview.title ?? "Input" : preview.title ?? "Input"}
        <code>{toolLongformInputPreviewDisplaySummary(preview)}</code>
      </div>
      <div className="tool-longform-items">
        {preview.items.map((item, index) => (
          <div className="tool-longform-item" key={`${item.fieldPath}-${item.path ?? index}`}>
            <div className="tool-section-title">
              <span>{item.label}</span>
              {item.path && <code>{item.path}</code>}
              <code>{item.chars.toLocaleString()} chars{item.truncated ? " total" : ""}</code>
            </div>
            {item.note && <p className="tool-longform-note">{item.note}</p>}
            <pre className="tool-write-code" ref={index === preview.items.length - 1 ? codeRef : undefined}>
              {item.language && <span>{item.language}</span>}
              <code>{item.preview || "(empty)"}</code>
            </pre>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ToolProgressPreviewView({ preview }: { preview: ToolProgressPreviewData }) {
  return (
    <section className="tool-progress-preview">
      <div className="tool-section-title">
        {preview.title}
        <code>{preview.summary}</code>
      </div>
      <div className="tool-progress-rows">
        {preview.rows.map((row) => (
          <div className="tool-progress-row" key={row.key}>
            <span>{row.label}</span>
            <code>{row.value}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ToolLargeOutputPreviewView({
  preview,
  onPreviewPath,
}: {
  preview: ToolLargeOutputPreview;
  onPreviewPath: (path: string) => void;
}) {
  const model = toolLargeOutputPreviewViewModel(preview);
  return (
    <section className="tool-large-output-preview">
      <div className="tool-section-title">
        {model.title}
        <code>{model.summary}</code>
      </div>
      <div className="tool-large-output-items">
        {model.rows.map((item) => (
          <div className="tool-large-output-item" key={item.key}>
            <div className="tool-large-output-row">
              <span>{item.label}</span>
              <code>{item.charsLabel}</code>
              {item.previewCharsLabel && <code>{item.previewCharsLabel}</code>}
              {item.bytesLabel && <code>{item.bytesLabel}</code>}
            </div>
            {item.artifactPath && (
              <button type="button" className="artifact-link" onClick={() => onPreviewPath(item.artifactPath!)} title={`Preview ${item.artifactPath}`}>
                <FileText size={13} />
                <span>{item.artifactPath}</span>
              </button>
            )}
            {item.suggestedToolsLabel ? <p className="tool-large-output-note">{item.suggestedToolsLabel}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ToolInstallRoutePreview({ preview }: { preview: ToolInstallRoutePreviewData }) {
  const tone =
    preview.blockers.length > 0 || preview.lane === "unsupported"
      ? "blocked"
      : preview.approvalBoundary === "privileged-approval-required"
        ? "privileged"
        : "ready";
  const chips = [
    preview.confidence,
    preview.approvalBoundary,
    preview.validationKind,
    preview.requiresSecret ? preview.secretMechanism ?? "secret required" : undefined,
  ].filter((item): item is string => Boolean(item));
  const notes = preview.blockers.length ? preview.blockers : preview.warnings;
  return (
    <section className={`tool-install-route-preview ${tone}`}>
      <div className="tool-section-title">
        {tone === "ready" ? <ListFilter size={12} /> : <Shield size={12} />}
        Install route
        <code>{preview.lane}</code>
      </div>
      <p className="tool-install-route-reason">{preview.reason}</p>
      <div className="tool-install-route-chips">
        {chips.map((chip) => (
          <code key={chip}>{chip}</code>
        ))}
      </div>
      {preview.nextTools.length > 0 ? (
        <div className="tool-install-route-next">
          <span>Next</span>
          {preview.nextTools.map((tool) => (
            <code key={tool}>{tool}</code>
          ))}
        </div>
      ) : (
        <p className="tool-install-route-empty">No install tool should be called for this route.</p>
      )}
      {notes.length > 0 && (
        <ul className="tool-install-route-notes">
          {notes.slice(0, 3).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {preview.validationDescription && <p className="tool-install-route-validation">{preview.validationDescription}</p>}
    </section>
  );
}

export function ToolEditPreview({
  preview,
  running,
}: {
  preview: ToolEditPreviewData;
  running: boolean;
}) {
  const lineLabel = preview.firstChangedLine !== undefined ? `Line ${preview.firstChangedLine}` : undefined;
  return (
    <section className={`tool-edit-preview ${running ? "running" : ""}`}>
      <div className="tool-section-title">
        {preview.diff ? "Edit diff" : running ? "Editing" : "Edit input"}
        {preview.path && <code>{preview.path}</code>}
        {lineLabel && <code>{lineLabel}</code>}
      </div>
      {preview.diff ? (
        <DiffOutput diff={preview.diff} />
      ) : preview.edits.length > 0 ? (
        <div className="tool-edit-blocks">
          {preview.edits.map((edit, index) => {
            const oldCountLabel = editTextCountLabel(edit.oldTextChars, edit.oldText.length, edit.oldTextTruncated);
            const newCountLabel = editTextCountLabel(edit.newTextChars, edit.newText.length, edit.newTextTruncated);
            return (
              <div className="tool-edit-block" key={`${index}-${edit.oldText.slice(0, 18)}-${edit.newText.slice(0, 18)}`}>
                <div className="tool-edit-block-title">{preview.edits.length === 1 ? "Replacement" : `Replacement ${index + 1}`}</div>
                <div className="tool-edit-sides">
                  <div className="tool-edit-pane removed">
                    <span>
                      <span>Before</span>
                      {oldCountLabel && <code>{oldCountLabel}</code>}
                    </span>
                    <pre>{edit.oldText || "(empty text)"}</pre>
                  </div>
                  <div className="tool-edit-pane added">
                    <span>
                      <span>After</span>
                      {newCountLabel && <code>{newCountLabel}</code>}
                    </span>
                    <pre>{edit.newText || "(empty text)"}</pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="panel-note">No edit preview available.</p>
      )}
    </section>
  );
}

export function editTextCountLabel(chars: number | undefined, previewChars: number, truncated: boolean | undefined): string | undefined {
  if (chars === undefined) return undefined;
  if (truncated && previewChars < chars) {
    return `${chars.toLocaleString()} chars total · ${previewChars.toLocaleString()} preview`;
  }
  return `${chars.toLocaleString()} chars`;
}

export function ToolVoicePreview({
  preview,
  running,
  onOpenUrl,
}: {
  preview: ToolVoicePreviewData;
  running: boolean;
  onOpenUrl?: (url: string) => void;
}) {
  const title = preview.noOp
    ? "Voice already configured"
    : preview.action === "status"
      ? "Voice status"
      : preview.action === "select"
        ? "Voice selection"
        : preview.action === "policy"
          ? "Voice policy"
          : preview.action === "clone-status"
            ? "Voice clone status"
            : "Voice test";
  const warningRows = [
    preview.cacheStatus === "missing" ? { label: "Dynamic cache", value: "Missing cloned voice entry" } : undefined,
    preview.missingLocalArtifactPaths?.length ? { label: "Missing local artifacts", value: preview.missingLocalArtifactPaths.join(", ") } : undefined,
    preview.readyForSelection === false && preview.action === "clone-status" ? { label: "Selection blocked", value: "Do not select this voice until the warning is resolved" } : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row?.value));
  const rows = [
    preview.noOp ? { label: "Status", value: "Already configured" } : undefined,
    preview.previousProvider || preview.provider ? { label: preview.previousProvider ? "Provider" : "Selected provider", value: preview.previousProvider ? `${preview.previousProvider} -> ${preview.provider ?? "None"}` : preview.provider } : undefined,
    preview.previousVoice || preview.voice ? { label: preview.previousVoice ? "Voice" : "Selected voice", value: preview.previousVoice ? `${preview.previousVoice} -> ${preview.voice ?? "None"}` : preview.voice } : undefined,
    preview.providerCapabilityId ? { label: "Provider id", value: preview.providerCapabilityId } : undefined,
    preview.voiceId ? { label: "Voice id", value: preview.voiceId } : undefined,
    preview.enabled ? { label: "Enabled", value: preview.enabled } : undefined,
    preview.autoplay ? { label: "Autoplay", value: preview.autoplay } : undefined,
    preview.mode ? { label: "Mode", value: preview.mode } : undefined,
    preview.longReply ? { label: "Long reply", value: preview.longReply } : undefined,
    preview.maxChars ? { label: "Max chars", value: preview.maxChars } : undefined,
    preview.testStatus ? { label: "Test status", value: preview.testStatus } : undefined,
    preview.readiness ? { label: "Readiness", value: preview.readiness } : undefined,
    preview.readyForSelection !== undefined ? { label: "Ready for selection", value: String(preview.readyForSelection) } : undefined,
    preview.shouldRetryStatus !== undefined ? { label: "Retry status later", value: String(preview.shouldRetryStatus) } : undefined,
    preview.cacheStatus ? { label: "Dynamic cache", value: preview.cacheStatus } : undefined,
    preview.progressPercent !== undefined ? { label: "Progress", value: `${preview.progressPercent}%` } : undefined,
    preview.retryAfterSeconds !== undefined ? { label: "Retry after", value: `${preview.retryAfterSeconds}s` } : undefined,
    preview.failureReason ? { label: "Failure reason", value: preview.failureReason } : undefined,
    preview.dashboardUrl ? { label: "Provider dashboard", value: preview.dashboardUrl } : undefined,
    preview.verificationUrl ? { label: "Provider verification", value: preview.verificationUrl } : undefined,
    preview.localArtifactPaths?.length ? { label: "Local artifacts", value: preview.localArtifactPaths.join(", ") } : undefined,
    preview.mimeType ? { label: "MIME type", value: preview.mimeType } : undefined,
    preview.durationMs !== undefined ? { label: "Duration", value: `${preview.durationMs} ms` } : undefined,
    preview.audioPath ? { label: "Audio", value: preview.audioPath } : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row?.value));
  return (
    <section className={`tool-voice-preview ${running ? "running" : ""} ${preview.noOp ? "noop" : ""} ${warningRows.length ? "warning" : ""}`}>
      <div className="tool-section-title">
        {warningRows.length ? <AlertCircle size={12} /> : preview.noOp ? <CheckCircle2 size={12} /> : <Music size={12} />}
        {title}
      </div>
      {warningRows.length > 0 && (
        <dl className="tool-voice-reconcile">
          {warningRows.map((row) => (
            <div key={`${row.label}-${row.value}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(preview.verificationUrl || preview.dashboardUrl) && onOpenUrl && (
        <div className="tool-voice-actions">
          {preview.verificationUrl && (
            <button type="button" onClick={() => onOpenUrl(preview.verificationUrl!)}>
              <ExternalLink size={12} />
              Open verification
            </button>
          )}
          {preview.dashboardUrl && (
            <button type="button" onClick={() => onOpenUrl(preview.dashboardUrl!)}>
              <ExternalLink size={12} />
              Open dashboard
            </button>
          )}
        </div>
      )}
      {rows.length > 0 ? (
        <dl className="tool-voice-details">
          {rows.map((row) => (
            <div key={`${row.label}-${row.value}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="panel-note">No voice details available.</p>
      )}
    </section>
  );
}

export function ToolSttPreview({
  preview,
  running,
  onPreviewPath,
}: {
  preview: ToolSttPreviewData;
  running: boolean;
  onPreviewPath: (path: string) => void;
}) {
  const title = preview.noOp
    ? "Speech input already configured"
    : preview.action === "status"
      ? "Speech input status"
      : preview.action === "select"
        ? "Speech input selection"
        : preview.action === "policy"
          ? "Speech input policy"
          : "Speech input test";
  const providerCount =
    preview.providerCount !== undefined
      ? `${preview.availableProviderCount ?? 0}/${preview.providerCount} available`
      : undefined;
  const rows = [
    preview.noOp ? { label: "Status", value: "Already configured" } : undefined,
    providerCount ? { label: "Providers", value: providerCount } : undefined,
    preview.previousProvider || preview.provider ? { label: preview.previousProvider ? "Provider" : "Selected provider", value: preview.previousProvider ? `${preview.previousProvider} -> ${preview.provider ?? "None"}` : preview.provider } : undefined,
    preview.providerCapabilityId ? { label: "Provider id", value: preview.providerCapabilityId } : undefined,
    preview.previousLanguage || preview.language ? { label: preview.previousLanguage ? "Language" : "Language", value: preview.previousLanguage ? `${preview.previousLanguage} -> ${preview.language ?? "unspecified"}` : preview.language } : undefined,
    preview.enabled ? { label: "Enabled", value: preview.enabled } : undefined,
    preview.autoSendAfterTranscription ? { label: "Auto-send", value: preview.autoSendAfterTranscription } : undefined,
    preview.silenceFinalizeSeconds ? { label: "Silence", value: preview.silenceFinalizeSeconds } : undefined,
    preview.noSpeechGate ? { label: "No-speech gate", value: preview.noSpeechGate } : undefined,
    preview.noSpeechGateRmsThreshold ? { label: "RMS threshold", value: preview.noSpeechGateRmsThreshold } : undefined,
    preview.stopTtsOnSpeech ? { label: "Stop TTS on speech", value: preview.stopTtsOnSpeech } : undefined,
    preview.queueWhileAgentRuns ? { label: "Queue while agent runs", value: preview.queueWhileAgentRuns } : undefined,
    preview.pushToTalkShortcut ? { label: "Shortcut", value: preview.pushToTalkShortcut } : undefined,
    preview.testStatus ? { label: "Test status", value: preview.testStatus } : undefined,
    preview.durationMs !== undefined ? { label: "Provider elapsed", value: `${Math.round(preview.durationMs)} ms` } : undefined,
    preview.rmsDbfs !== undefined ? { label: "RMS", value: `${preview.rmsDbfs.toFixed(1)} dBFS` } : undefined,
    preview.noSpeechThresholdDbfs !== undefined ? { label: "No-speech threshold", value: `${preview.noSpeechThresholdDbfs} dBFS` } : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row?.value));
  const artifacts = [
    preview.audioPath ? { label: "Raw audio", path: preview.audioPath } : undefined,
    preview.normalizedAudioPath ? { label: "Normalized audio", path: preview.normalizedAudioPath } : undefined,
    preview.transcriptPath ? { label: "Transcript", path: preview.transcriptPath } : undefined,
    preview.jsonPath ? { label: "JSON", path: preview.jsonPath } : undefined,
    preview.stdoutPath ? { label: "stdout", path: preview.stdoutPath } : undefined,
    preview.stderrPath ? { label: "stderr", path: preview.stderrPath } : undefined,
  ].filter((artifact): artifact is { label: string; path: string } => Boolean(artifact?.path));
  return (
    <section className={`tool-voice-preview tool-stt-preview ${running ? "running" : ""} ${preview.noOp ? "noop" : ""}`}>
      <div className="tool-section-title">
        {preview.noOp ? <CheckCircle2 size={12} /> : <Mic size={12} />}
        {title}
      </div>
      {preview.transcript && (
        <blockquote className="tool-stt-transcript">
          <span>Transcript</span>
          <p>{preview.transcript}</p>
        </blockquote>
      )}
      {rows.length > 0 ? (
        <dl className="tool-voice-details">
          {rows.map((row) => (
            <div key={`${row.label}-${row.value}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="panel-note">No speech input details available.</p>
      )}
      {artifacts.length > 0 && (
        <div className="tool-stt-artifacts" aria-label="Speech input artifacts">
          {artifacts.map((artifact) => (
            <button type="button" className="artifact-link" key={`${artifact.label}-${artifact.path}`} onClick={() => onPreviewPath(artifact.path)} title={`Preview ${artifact.path}`}>
              {artifact.path.endsWith(".wav") ? <Music size={13} /> : <FileText size={13} />}
              <span>{artifact.label}: {artifact.path}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function ToolTelegramSessionSetupCard({
  card,
  running,
  actionDisabled,
  onSendPrompt,
}: {
  card: ToolTelegramSessionSetupPreviewData;
  running: boolean;
  actionDisabled?: boolean;
  onSendPrompt?: (prompt: string) => void | Promise<void>;
}) {
  const tone = telegramSessionSetupTone(card.status);
  const icon = card.status === "ready"
    ? <CheckCircle2 size={12} />
    : card.status === "needs_code" || card.status === "needs_password"
      ? <KeyRound size={12} />
      : card.status === "blocked"
        ? <AlertCircle size={12} />
        : <Shield size={12} />;
  const rows = [
    { label: "Provider", value: card.providerId },
    { label: "Profile", value: card.profileId },
    { label: "Action", value: card.action },
    { label: "State", value: telegramSessionSetupStatusLabel(card.status) },
    card.authState?.state ? { label: "Auth state", value: card.authState.state } : undefined,
    card.checkedAt ? { label: "Checked", value: card.checkedAt } : undefined,
    card.missingInputs.length ? { label: "Missing", value: card.missingInputs.join(", ") } : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row?.value));
  const actions = [card.primaryAction, ...card.secondaryActions].filter((action): action is NonNullable<typeof action> => Boolean(action));
  const buttonsDisabled = running || actionDisabled || !onSendPrompt;
  return (
    <section className={`tool-telegram-setup ${tone} ${running ? "running" : ""}`}>
      <div className="tool-section-title">
        {icon}
        {card.title}
      </div>
      <div className="tool-telegram-summary">
        <strong>{card.summary}</strong>
        <span>{card.detail}</span>
      </div>
      {actions.length > 0 && (
        <div className="tool-telegram-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={action.tone === "primary" ? "primary" : ""}
              title={action.title}
              disabled={buttonsDisabled}
              onClick={() => void onSendPrompt?.(action.prompt)}
            >
              {action.id === "refresh-status" ? <RefreshCw size={12} /> : <KeyRound size={12} />}
              {action.label}
            </button>
          ))}
        </div>
      )}
      <dl className="tool-telegram-details">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="tool-telegram-safety" aria-label="Telegram setup safety boundary">
        <span>No chat reads</span>
        <span>No sends</span>
        <span>No bindings</span>
        <span>No ingestion</span>
      </div>
    </section>
  );
}

export function ToolMessagingConversationDirectorySetupCard({
  card,
  running,
}: {
  card: ToolMessagingConversationDirectorySetupPreviewData;
  running: boolean;
}) {
  const view = toolMessagingConversationDirectorySetupCardViewModel(card);
  return (
    <section className={`tool-directory-setup ${view.tone} ${view.noteKind} ${running ? "running" : ""}`}>
      <div className="tool-section-title">
        {view.icon === "success" ? <CheckCircle2 size={12} /> : view.icon === "attention" ? <AlertCircle size={12} /> : <MessageCircle size={12} />}
        {view.title}
      </div>
      <div className="tool-directory-summary">
        <strong>{view.summary}</strong>
        <span>{view.detail}</span>
      </div>
      <dl className="tool-directory-details">
        {view.rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {view.conversationChips.length > 0 && (
        <div className="tool-directory-conversations" aria-label="Conversation directory metadata">
          {view.conversationChips.map((chip) => <span key={`${chip.title}-${chip.label}`} title={chip.title}>{chip.label}</span>)}
        </div>
      )}
      {view.notes.length > 0 && (
        <ul className="tool-directory-notes">
          {view.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
      <div className="tool-directory-safety" aria-label="Conversation directory safety boundary">
        {view.safetyChips.map((chip) => <span key={chip}>{chip}</span>)}
      </div>
    </section>
  );
}

export function ToolMessagingRemoteSurfaceActivationCard({
  card,
  running,
  actionDisabled,
  onSendPrompt,
}: {
  card: ToolMessagingRemoteSurfaceActivationPreviewData;
  running: boolean;
  actionDisabled?: boolean;
  onSendPrompt?: (prompt: string) => void | Promise<void>;
}) {
  const view = toolMessagingRemoteSurfaceActivationCardViewModel(card);
  const buttonsDisabled = running || actionDisabled || !onSendPrompt;
  return (
    <section className={`tool-remote-activation ${view.tone} ${running ? "running" : ""}`}>
      <div className="tool-section-title">
        {view.icon === "success" ? <CheckCircle2 size={12} /> : view.icon === "attention" ? <AlertCircle size={12} /> : <Plug size={12} />}
        {view.title}
      </div>
      <div className="tool-remote-activation-summary">
        <strong>{view.summary}</strong>
        <span>{view.detail}</span>
      </div>
      {view.actions.length > 0 && (
        <div className="tool-remote-activation-actions">
          {view.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={action.tone === "primary" ? "primary" : ""}
              title={action.title}
              disabled={buttonsDisabled}
              onClick={() => void onSendPrompt?.(action.prompt)}
            >
              {action.id === "continue" ? <Zap size={12} /> : action.id === "provider-onboarding" ? <Plug size={12} /> : <AlertCircle size={12} />}
              {action.label}
            </button>
          ))}
        </div>
      )}
      <dl className="tool-remote-activation-details">
        {view.rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {view.phaseChips.length > 0 && (
        <div className="tool-remote-activation-phases" aria-label="Remote surface activation phases">
          {view.phaseChips.map((chip) => <span className={chip.tone} key={`${chip.title}-${chip.label}`} title={chip.title}>{chip.label}</span>)}
        </div>
      )}
      {view.notes.length > 0 && (
        <ul className="tool-remote-activation-notes">
          {view.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
      <div className="tool-remote-activation-safety" aria-label="Remote surface activation safety boundary">
        {view.safetyChips.map((chip) => <span key={chip}>{chip}</span>)}
      </div>
    </section>
  );
}

export function telegramSessionSetupTone(status: ToolTelegramSessionSetupPreviewData["status"]): "success" | "warning" | "danger" | "info" {
  if (status === "ready") return "success";
  if (status === "needs_code" || status === "needs_password" || status === "pending") return "warning";
  if (status === "blocked") return "danger";
  return "info";
}

export function telegramSessionSetupStatusLabel(status: ToolTelegramSessionSetupPreviewData["status"]): string {
  if (status === "needs_code") return "Needs code";
  if (status === "needs_password") return "Needs password";
  return formatTaskState(status);
}

export function isBrowserToolName(toolName: string): boolean {
  return toolName.toLowerCase().startsWith("browser_");
}

export function fileBaseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function ToolStatusIcon({ status }: { status?: string }) {
  if (status === "running") return <LoaderCircle size={14} className="spin" />;
  if (status === "error") return <AlertCircle size={14} />;
  return <CheckCircle2 size={14} />;
}
