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
  DiffOutput,
  formatPanelFileSize,
  LazyHtmlPreview,
  OpenTargetIcon,
  formatTimelineTime,
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



export type ProjectContextMenuState = {
  project: ProjectSummary;
  x: number;
  y: number;
};

export type ThreadContextMenuState = {
  thread: ThreadSummary;
  workspacePath: string;
  x: number;
  y: number;
};

export type ProjectActionDialogState =
  | { kind: "rename"; project: ProjectSummary; name: string; busy?: boolean }
  | { kind: "archive"; project: ProjectSummary; busy?: boolean }
  | { kind: "remove"; project: ProjectSummary; busy?: boolean };

export type ProjectBoardResetDialogState = {
  project: ProjectSummary;
  board: NonNullable<ProjectSummary["board"]>;
  error?: string;
  busy?: boolean;
};

export type PlannerRevisionDialogState = {
  artifact: PlannerPlanArtifact;
  initialFeedback: string;
  error?: string;
  busy?: boolean;
};

export type ThreadActionDialogState =
  | { kind: "rename"; thread: ThreadSummary; workspacePath: string; name: string; busy?: boolean }
  | { kind: "archive"; thread: ThreadSummary; workspacePath: string; busy?: boolean };


export function ProjectContextMenu({
  menu,
  onPin,
  onReveal,
  onCreateWorktree,
  onRename,
  onArchiveChats,
  onRemove,
}: {
  menu: ProjectContextMenuState;
  onPin: () => void;
  onReveal: () => void;
  onCreateWorktree: () => void;
  onRename: () => void;
  onArchiveChats: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="project-context-menu"
      role="menu"
      aria-label={`${menu.project.name} project actions`}
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={onPin}>
        <Pin size={17} />
        <span>{menu.project.pinned ? "Unpin project" : "Pin project"}</span>
      </button>
      <button type="button" role="menuitem" onClick={onReveal}>
        <FolderOpen size={17} />
        <span>Open in Finder</span>
      </button>
      <button type="button" role="menuitem" onClick={onCreateWorktree}>
        <GitBranch size={17} />
        <span>Create permanent worktree</span>
      </button>
      <button type="button" role="menuitem" onClick={onRename}>
        <Pencil size={17} />
        <span>Rename project</span>
      </button>
      <button type="button" role="menuitem" onClick={onArchiveChats}>
        <Archive size={17} />
        <span>Archive chats</span>
      </button>
      <button type="button" role="menuitem" onClick={onRemove}>
        <X size={17} />
        <span>Remove</span>
      </button>
    </div>
  );
}


export function ThreadContextMenu({
  menu,
  onPin,
  onRename,
  onArchive,
  onMarkUnread,
  onReveal,
  onCopyWorkingDirectory,
  onCopySessionId,
  onCopyDeeplink,
  onExportPdf,
  onForkLocal,
  onForkWorktree,
  onOpenMiniWindow,
}: {
  menu: ThreadContextMenuState;
  onPin: () => void;
  onRename: () => void;
  onArchive: () => void;
  onMarkUnread: () => void;
  onReveal: () => void;
  onCopyWorkingDirectory: () => void;
  onCopySessionId: () => void;
  onCopyDeeplink: () => void;
  onExportPdf: () => void;
  onForkLocal: () => void;
  onForkWorktree: () => void;
  onOpenMiniWindow: () => void;
}) {
  return (
    <div
      className="project-context-menu thread-context-menu"
      role="menu"
      aria-label={`${menu.thread.title} chat actions`}
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={onPin}>
        <Pin size={17} />
        <span>{menu.thread.pinned ? "Unpin chat" : "Pin chat"}</span>
      </button>
      <button type="button" role="menuitem" onClick={onRename}>
        <Pencil size={17} />
        <span>Rename chat</span>
      </button>
      <button type="button" role="menuitem" onClick={onArchive}>
        <Archive size={17} />
        <span>Archive chat</span>
      </button>
      <button type="button" role="menuitem" onClick={onMarkUnread}>
        <MessageCircle size={17} />
        <span>Mark as unread</span>
      </button>
      <div className="context-menu-separator" />
      <button type="button" role="menuitem" onClick={onReveal}>
        <FolderOpen size={17} />
        <span>Open in Finder</span>
      </button>
      <button type="button" role="menuitem" onClick={onCopyWorkingDirectory}>
        <Copy size={17} />
        <span>Copy working directory</span>
      </button>
      <button type="button" role="menuitem" onClick={onCopySessionId}>
        <Code2 size={17} />
        <span>Copy session ID</span>
      </button>
      <button type="button" role="menuitem" onClick={onCopyDeeplink}>
        <ExternalLink size={17} />
        <span>Copy deeplink</span>
      </button>
      <button type="button" role="menuitem" onClick={onExportPdf}>
        <FileText size={17} />
        <span>Export PDF</span>
      </button>
      <div className="context-menu-separator" />
      <button type="button" role="menuitem" onClick={onForkLocal}>
        <Home size={17} />
        <span>Fork into local</span>
      </button>
      <button type="button" role="menuitem" onClick={onForkWorktree}>
        <GitBranch size={17} />
        <span>Fork into new worktree</span>
      </button>
      <div className="context-menu-separator" />
      <button type="button" role="menuitem" onClick={onOpenMiniWindow}>
        <Maximize2 size={17} />
        <span>Open in mini window</span>
      </button>
    </div>
  );
}


export function ProjectActionDialogView({
  dialog,
  onChangeName,
  onCancel,
  onConfirm,
}: {
  dialog: ProjectActionDialogState;
  onChangeName: (name: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title =
    dialog.kind === "rename"
      ? "Rename project"
      : dialog.kind === "archive"
        ? "Archive project chats?"
        : "Remove project?";
  const message =
    dialog.kind === "rename"
      ? "Set the display name used in the sidebar. Files on disk are not renamed."
      : dialog.kind === "archive"
        ? `Archive all chats in ${dialog.project.name}. The project folder stays available.`
        : `Remove ${dialog.project.name} from the project list. Files on disk will not be deleted.`;
  const confirmLabel = dialog.kind === "rename" ? "Save" : dialog.kind === "archive" ? "Archive chats" : "Remove";
  const danger = dialog.kind !== "rename";
  const canConfirm = !dialog.busy && (dialog.kind !== "rename" || Boolean(dialog.name.trim()));
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !dialog.busy && onCancel()}>
      <div
        className="git-confirm-dialog project-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-action-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dialog.busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="permission-dialog-header">
          <div className={`dialog-icon ${danger ? "danger" : ""}`}>
            {dialog.kind === "rename" ? <Pencil size={20} /> : dialog.kind === "archive" ? <Archive size={20} /> : <X size={20} />}
          </div>
          <div>
            <h2 id="project-action-title">{title}</h2>
            <p>{message}</p>
          </div>
        </div>
        {dialog.kind === "rename" && (
          <label className="project-action-field">
            <span>Project name</span>
            <input
              autoFocus
              className="panel-input"
              value={dialog.name}
              disabled={dialog.busy}
              onChange={(event) => onChangeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canConfirm) {
                  event.preventDefault();
                  onConfirm();
                }
              }}
            />
          </label>
        )}
        <div className="permission-detail">
          <span>{dialog.kind === "rename" ? "Project folder" : "Project"}</span>
          <pre>{dialog.project.path}</pre>
        </div>
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={dialog.busy}>
            Cancel
          </button>
          <button type="button" className={`secondary-button ${danger ? "danger" : ""}`} onClick={onConfirm} disabled={!canConfirm}>
            {dialog.busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}


export function ProjectBoardResetDialogView({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: ProjectBoardResetDialogState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const impact = projectBoardResetImpact(dialog.board);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !dialog.busy && onCancel()}>
      <div
        className="git-confirm-dialog project-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-board-reset-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dialog.busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="permission-dialog-header">
          <div className="dialog-icon danger">
            <Trash2 size={20} />
          </div>
          <div>
            <h2 id="project-board-reset-title">Reset project board?</h2>
            <p>
              {impact.summary} Project files, threads, and Local Task history stay in place.
            </p>
          </div>
        </div>
        <div className="permission-detail">
          <span>Board</span>
          <pre>{dialog.board.title}</pre>
        </div>
        <section className="project-board-reset-impact" aria-label="Reset impact">
          <span className="project-board-kicker">Reset impact</span>
          <div className="project-board-reset-impact-grid">
            {impact.deleted.map((metric) => (
              <article key={metric.label}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
                <p>{metric.detail}</p>
              </article>
            ))}
          </div>
        </section>
        <div className="permission-detail">
          <span>Preserved</span>
          <pre>{impact.preserved.join("\n")}</pre>
        </div>
        {dialog.error && (
          <div className="permission-detail danger">
            <span>Reset failed</span>
            <pre>{dialog.error}</pre>
          </div>
        )}
        <div className="permission-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={dialog.busy}
            title={dialog.busy ? "Wait for the board reset to finish before closing this dialog." : "Cancel board reset and keep the current board unchanged."}
          >
            Cancel
          </button>
          <button
            type="button"
            className="secondary-button danger"
            onClick={onConfirm}
            disabled={dialog.busy}
            title="Delete this board's charter, cards, source review, PM review proposals, synthesis progress, and board history. Project files, threads, and Local Tasks are preserved."
          >
            {dialog.busy ? "Resetting..." : "Reset board"}
          </button>
        </div>
      </div>
    </div>
  );
}


export function PlannerRevisionDialogView({
  dialog,
  onChangeFeedback,
  onCancel,
  onConfirm,
}: {
  dialog: PlannerRevisionDialogState;
  onChangeFeedback: () => void;
  onCancel: () => void;
  onConfirm: (feedback: string) => void;
}) {
  const [feedback, setFeedback] = useState(dialog.initialFeedback);
  const canConfirm = !dialog.busy && Boolean(feedback.trim());
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !dialog.busy && onCancel()}>
      <div
        className="git-confirm-dialog project-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planner-revision-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dialog.busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="permission-dialog-header">
          <div className="dialog-icon">
            <RefreshCw size={20} />
          </div>
          <div>
            <h2 id="planner-revision-title">Revise plan with feedback</h2>
            <p>Ambient will rewrite the existing durable plan artifact and commit the revised file.</p>
          </div>
        </div>
        <div className="permission-detail">
          <span>Plan</span>
          <pre>{dialog.artifact.title}</pre>
        </div>
        {dialog.artifact.durableArtifactPath && (
          <div className="permission-detail">
            <span>Durable artifact</span>
            <pre>{dialog.artifact.durableArtifactPath}</pre>
          </div>
        )}
        <label className="project-action-field">
          <span>Feedback</span>
          <textarea
            autoFocus
            className="panel-textarea"
            value={feedback}
            disabled={dialog.busy}
            placeholder="Describe what should change in the current durable plan."
            onChange={(event) => {
              setFeedback(event.target.value);
              if (dialog.error) onChangeFeedback();
            }}
          />
        </label>
        {dialog.error && (
          <div className="permission-detail danger">
            <span>Revision failed</span>
            <pre>{dialog.error}</pre>
          </div>
        )}
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={dialog.busy}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={() => onConfirm(feedback)} disabled={!canConfirm}>
            {dialog.busy ? "Sending..." : "Revise plan"}
          </button>
        </div>
      </div>
    </div>
  );
}


export function ThreadActionDialogView({
  dialog,
  onChangeName,
  onCancel,
  onConfirm,
}: {
  dialog: ThreadActionDialogState;
  onChangeName: (name: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = dialog.kind === "rename" ? "Rename chat" : "Archive chat?";
  const message =
    dialog.kind === "rename"
      ? "Set the display name used in the sidebar."
      : `Archive ${dialog.thread.title}. The working directory and files stay on disk.`;
  const confirmLabel = dialog.kind === "rename" ? "Save" : "Archive chat";
  const danger = dialog.kind === "archive";
  const canConfirm = !dialog.busy && (dialog.kind !== "rename" || Boolean(dialog.name.trim()));
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !dialog.busy && onCancel()}>
      <div
        className="git-confirm-dialog project-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="thread-action-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dialog.busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="permission-dialog-header">
          <div className={`dialog-icon ${danger ? "danger" : ""}`}>
            {dialog.kind === "rename" ? <Pencil size={20} /> : <Archive size={20} />}
          </div>
          <div>
            <h2 id="thread-action-title">{title}</h2>
            <p>{message}</p>
          </div>
        </div>
        {dialog.kind === "rename" && (
          <label className="project-action-field">
            <span>Chat name</span>
            <input
              autoFocus
              className="panel-input"
              value={dialog.name}
              disabled={dialog.busy}
              onChange={(event) => onChangeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canConfirm) {
                  event.preventDefault();
                  onConfirm();
                }
              }}
            />
          </label>
        )}
        <div className="permission-detail">
          <span>Working directory</span>
          <pre>{dialog.thread.gitWorktree?.status === "active" ? dialog.thread.gitWorktree.worktreePath : dialog.thread.workspacePath}</pre>
        </div>
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={dialog.busy}>
            Cancel
          </button>
          <button type="button" className={`secondary-button ${danger ? "danger" : ""}`} onClick={onConfirm} disabled={!canConfirm}>
            {dialog.busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}


export function SidebarMenuLabel({ children }: { children: ReactNode }) {
  return <div className="sidebar-menu-label">{children}</div>;
}


export function SidebarMenuDivider() {
  return <div className="sidebar-menu-divider" />;
}


export function SidebarMenuItem({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sidebar-menu-item" onClick={onClick}>
      {icon}
      <span>{label}</span>
      {selected && <Check size={18} />}
    </button>
  );
}
