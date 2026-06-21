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
import type { AutomationFolderSummary, AutomationScheduleExceptionSummary, AutomationScheduleSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type { BrowserCapabilityState, BrowserCredentialSummary, BrowserPickResult, BrowserProfileMode, BrowserRuntimeKind, BrowserScreenshotResult, BrowserUserActionState, SaveBrowserCredentialInput } from "../../shared/browserTypes";
import type { DesktopEvent, DesktopState, DesktopUpdateState, MenuCommand, ProviderCatalogSettingsCard, ProviderStatus, SendMessageComposerIntent, ThemePreference, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { DiagnosticExportResult } from "../../shared/diagnosticTypes";
import type { LocalDeepResearchInstallProgress, LocalDeepResearchRunHistoryEntry, LocalDeepResearchRunHistoryResult, MessageVoiceState, MiniCpmVisionAnalysisResult, MiniCpmVisionAnalyzeInput, MiniCpmVisionDiagnosticItem, MiniCpmVisionSetupAction, MiniCpmVisionSetupResult, SttMessageMetadata, SttProviderCandidate, SttProviderSetupResult, SttTestAudioResult, SttTranscriptionState, VoiceArtifactRetentionSummary, VoiceOnboardingHostFacts, VoiceProviderCandidate, VoiceProviderVoiceCandidate } from "../../shared/localRuntimeTypes";
import type { AmbientPermissionGrant, CreateAmbientPermissionGrantInput, PermissionAuditEntry, PermissionGrantScopeKind, PermissionMode, PermissionPromptResponseMode, PermissionRequest, PrivilegedCredentialRequest, SecureInputRequest } from "../../shared/permissionTypes";
import type { AnswerPlannerDecisionQuestionInput, PlannerDecisionQuestion, PlannerPlanArtifact, PlannerPlanWorkflowState } from "../../shared/plannerTypes";
import type { AmbientGeneratedCapabilitySummary, AmbientMcpContainerRuntimeManagedInstallProgress, AmbientMcpContainerRuntimeStatus, AmbientMcpDefaultCapabilityInstallProgress, AmbientMcpInstalledServerSummary, AmbientMcpInstallPreview, AmbientMcpServerSearchResult, AmbientPluginAuthAccountSummary, AmbientPluginAuthStartResult, AmbientPluginCapabilityDiagnostics, AmbientPluginRegistry, AmbientPluginRuntime, AmbientPluginSourceKind, CapabilityBuilderHistoryEntry, CapabilityBuilderHistoryResult, CodexHostedMarketplaceReport, CodexMarketplaceSourceSummary, CodexPluginCatalog, CodexPluginCompatibilityTier, CodexPluginMcpInspectionCatalog, CodexPluginSummary, FirstPartyGoogleIntegrationState, ManagedDevServerSummary, PiExtensionSandboxCatalog, PiExtensionSandboxInstallPreview, PiExtensionSandboxPackageSummary, PiPackageCatalog, PiPackageInstallScope, PiPackageResourceKind, PiPrivilegedCatalog, PiPrivilegedInstallSummary, PiPrivilegedSecurityScan, PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";
import type { AddProjectBoardCardRunFeedbackInput, ApplyProjectBoardDecisionImpactFeedbackInput, ApplyProjectBoardSourceImpactFeedbackInput, AttachProjectBoardLocalTaskMode, CopyProjectBoardSessionToThreadInput, CreateReadyProjectBoardTasksInput, DeferProjectBoardSynthesisSectionsInput, ProjectBoardAddCardsObjectiveProvenance, ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectBoardCardRunFeedbackSource, ProjectBoardEvent, ProjectBoardExecutionArtifact, ProjectBoardGitProjectionResolution, ProjectBoardGitSyncStatus, ProjectBoardProofDecisionAction, ProjectBoardQuestion, ProjectBoardSource, ProjectBoardSourceChangeState, ProjectBoardSourceKind, ProjectBoardSplitDecisionAction, ProjectBoardSummary, ProjectBoardSynthesisProposal, ProjectBoardSynthesisProposalCardReviewStatus, ProjectBoardSynthesisRun, ProjectBoardSynthesisRunProgressiveRecord, ProjectSummary, RecomputeProjectBoardProofCoverageInput, RefineProjectBoardSynthesisInput, RefreshProjectBoardDecisionDraftsInput, RefreshProjectBoardSourceDraftsInput, RegenerateProjectBoardDecisionDraftsInput, RegenerateProjectBoardSourceDraftsInput, RerunProjectBoardProofInput, ResolveProjectBoardCardPiUpdateInput, ResolveProjectBoardDeliverableIntegrationInput, RetryProjectBoardSynthesisInput, SplitProjectBoardCardInput, SuggestProjectBoardClarificationDefaultsInput, SuggestProjectBoardKickoffDefaultsInput, SuggestProjectBoardProofInput, UpdateProjectBoardCardInput, UpdateProjectBoardSourceInput } from "../../shared/projectBoardTypes";
import type { TerminalSession } from "../../shared/terminalTypes";
import type { ChatMessage, CollaborationMode, ContextUsageSnapshot, ExportChatResult, MessageDelivery, RunStatus, RuntimeActivity, ThinkingLevel, ThreadGoal, ThreadSummary, ToolLargeOutputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import type { OrchestrationAutoDispatchStatus, OrchestrationBoard, OrchestrationPrepareResult, OrchestrationRun, OrchestrationTask, RepairOrchestrationWorkflowAction, ResolveOrchestrationWorkflowImpactAction, UpdateOrchestrationWorkflowRawInput, UpdateOrchestrationWorkflowSettingsInput, WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowCompileAuditSummary, WorkflowCompileProgress, WorkflowConnectorDataRetention, WorkflowConnectorManifestGrant, WorkflowDashboard, WorkflowDiscoveryAccessRequest, WorkflowDiscoveryProgress, WorkflowExplorationProgress, WorkflowExplorationTraceSummary, WorkflowGraphNode, WorkflowLabRun, WorkflowModelCallRecord, WorkflowPluginCapabilityGrant, WorkflowRecordingEditContext, WorkflowRecordingLibraryEntry, WorkflowRecordingReviewDraftUpdate, WorkflowRecordingState, WorkflowRecoveryAction, WorkflowRevisionSummary, WorkflowRunDetail, WorkflowRunEvent, WorkflowRunLimitOverrides, WorkflowRunSummary, WorkflowUserInputResponse, WorkflowVersionSummary } from "../../shared/workflowTypes";
import type { FileTreeEntry, GitReviewFile, GitReviewSummary, GitSimpleAction, WorkspaceContextReference, WorkspaceFileContent, WorkspaceFileTree, WorkspaceGitStatus, WorkspaceOpenTarget, WorkspaceSearchResult, WorkspaceSearchScope } from "../../shared/workspaceTypes";
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
import { isHiddenTranscriptMessage } from "../../shared/threadPreview";
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



export type ProjectPopover = "add" | "organize";

export type AutomationPopover = "add" | "organize";

export type SidebarOrganizeMode = "project" | "chronological" | "chats-first";

export type SidebarSortMode = "created" | "updated";

export type SidebarShowMode = "all" | "relevant";

export type SidebarOrganizeSettings = {
  organize: SidebarOrganizeMode;
  sort: SidebarSortMode;
  show: SidebarShowMode;
};

export function userPromptHistory(messages: ChatMessage[]): string[] {
  return messages
    .filter((message) => message.role === "user" && !isHiddenTranscriptMessage(message) && message.content.trim())
    .map((message) => message.content)
    .reverse();
}

export function organizeSidebarProjects(
  projects: ProjectSummary[],
  settings: SidebarOrganizeSettings,
  activeThreadId?: string,
  activeWorkspacePath?: string,
  options: { includeSubagentChildren?: boolean } = {},
): ProjectSummary[] {
  const relevantCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const includeSubagentChildren = options.includeSubagentChildren ?? true;
  return projects
    .map((project) => {
      const featureVisibleThreads = includeSubagentChildren
        ? project.threads
        : project.threads.filter((thread) => thread.kind !== "subagent_child");
      const threads =
        settings.show === "all"
          ? featureVisibleThreads
          : featureVisibleThreads.filter((thread) => {
              if (thread.id === activeThreadId) return true;
              if (thread.lastMessagePreview.trim()) return true;
              return Date.parse(thread.updatedAt) >= relevantCutoff;
            });
      const sortedThreads = threads
        .map((thread, index) => ({ thread, index }))
        .sort((a, b) => compareSidebarThreads(a.thread, b.thread, a.index, b.index, settings))
        .map((item) => item.thread);
      return { ...project, threads: orderSidebarSubagentThreads(sortedThreads) };
    })
    .filter((project) => {
      if (settings.show === "all") return true;
      if (project.path === activeWorkspacePath) return true;
      if (project.threads.length > 0) return true;
      return Date.parse(project.updatedAt) >= relevantCutoff;
    })
    .map((project, index) => ({ project, index }))
    .sort((a, b) => {
      if (a.project.path === activeWorkspacePath) return -1;
      if (b.project.path === activeWorkspacePath) return 1;
      if (Boolean(a.project.pinned) !== Boolean(b.project.pinned)) return a.project.pinned ? -1 : 1;
      const key = settings.sort === "created" ? "createdAt" : "updatedAt";
      const byDate = b.project[key].localeCompare(a.project[key]);
      return byDate || a.index - b.index;
    })
    .map((item) => item.project);
}

export function orderSidebarSubagentThreads(threads: ThreadSummary[]): ThreadSummary[] {
  const childrenByParent = new Map<string, ThreadSummary[]>();
  const parentThreads: ThreadSummary[] = [];

  for (const thread of threads) {
    if (thread.kind === "subagent_child" && thread.parentThreadId) {
      const children = childrenByParent.get(thread.parentThreadId) ?? [];
      children.push(thread);
      childrenByParent.set(thread.parentThreadId, children);
    } else {
      parentThreads.push(thread);
    }
  }

  const ordered: ThreadSummary[] = [];
  for (const thread of parentThreads) {
    ordered.push(thread);
    const children = childrenByParent.get(thread.id);
    if (!children) continue;
    ordered.push(...children.sort((a, b) => (a.childOrder ?? 0) - (b.childOrder ?? 0) || a.updatedAt.localeCompare(b.updatedAt)));
    childrenByParent.delete(thread.id);
  }

  for (const children of childrenByParent.values()) {
    ordered.push(...children);
  }

  return ordered;
}

export function compareSidebarThreads(
  a: ThreadSummary,
  b: ThreadSummary,
  aIndex: number,
  bIndex: number,
  settings: SidebarOrganizeSettings,
): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  if (settings.organize === "chats-first") {
    const aHasChat = a.lastMessagePreview.trim() ? 0 : 1;
    const bHasChat = b.lastMessagePreview.trim() ? 0 : 1;
    if (aHasChat !== bHasChat) return aHasChat - bHasChat;
  }
  const key = settings.sort === "created" ? "createdAt" : "updatedAt";
  return b[key].localeCompare(a[key]) || aIndex - bIndex;
}

export function threadIndicator(thread: ThreadSummary, status?: RunStatus, active = false): { kind: ThreadIndicatorKind; label: string } {
  if (status && isRunStatusRunning(status)) return { kind: "running", label: "Running" };
  const unread = !active && threadHasUnreadWork(thread);
  if (status === "error" || (unread && /runtime returned an error|failed|upstream request failed/i.test(thread.lastMessagePreview))) {
    return { kind: "error", label: "Error" };
  }
  if (unread) {
    return { kind: "awaiting", label: "New work" };
  }
  return { kind: "idle", label: "Idle" };
}

export function threadHasUnreadWork(thread: ThreadSummary): boolean {
  if (!thread.lastMessagePreview || /run stopped|interrupted/i.test(thread.lastMessagePreview)) return false;
  if (!thread.lastReadAt) return false;
  return thread.updatedAt > thread.lastReadAt;
}

export function sidebarThreadAgeLabel(updatedAt: string, now = Date.now()): string | undefined {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return undefined;
  const elapsedMs = Math.max(0, now - timestamp);
  const hourMs = 60 * 60 * 1000;
  if (elapsedMs < hourMs) return undefined;
  const dayMs = 24 * hourMs;
  const days = Math.floor(elapsedMs / dayMs);
  if (days < 1) return `${Math.max(1, Math.floor(elapsedMs / hourMs))}h`;
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.max(1, Math.floor(days / 7))}w`;
  if (days < 365) return `${Math.max(1, Math.floor(days / 30))}mo`;
  return `${Math.max(1, Math.floor(days / 365))}y`;
}


export function AutomationPaneIcon({ pane }: { pane: AutomationPane }) {
  if (pane === "home") return <Home size={15} />;
  if (pane === "local_tasks") return <CalendarClock size={15} />;
  if (pane === "workflow_agent") return workflowRecorderSurface.legacyCompilerEnabled ? <Bot size={15} /> : <MessageCircle size={15} />;
  if (pane === "workflow_lab") return <Brain size={15} />;
  if (pane === "schedules") return <CalendarPlus size={15} />;
  if (pane === "runs_reviews") return <ListFilter size={15} />;
  return <Folder size={15} />;
}


export function ProjectsHeader({
  popover,
  collapsed,
  organize,
  onToggleCollapse,
  onTogglePopover,
  onCreateWorkspace,
  onOpenWorkspace,
  onOrganizeChange,
}: {
  popover?: ProjectPopover;
  collapsed: boolean;
  organize: SidebarOrganizeSettings;
  onToggleCollapse: () => void;
  onTogglePopover: (popover: ProjectPopover) => void;
  onCreateWorkspace: () => void;
  onOpenWorkspace: () => void;
  onOrganizeChange: (input: Partial<SidebarOrganizeSettings>) => void;
}) {
  return (
    <div className="projects-header-wrap">
      <div className="projects-header">
        <span>Projects</span>
        <div className="projects-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            title={collapsed ? "Expand all projects" : "Collapse all projects"}
            aria-label={collapsed ? "Expand all projects" : "Collapse all projects"}
            onClick={onToggleCollapse}
          >
            <Minimize2 size={16} />
          </button>
          <button
            type="button"
            className={`sidebar-icon-button ${popover === "organize" ? "active" : ""}`}
            title="Filter, sort, and organize chats"
            aria-label="Filter, sort, and organize chats"
            onClick={() => onTogglePopover("organize")}
          >
            <ListFilter size={16} />
          </button>
          <button
            type="button"
            className={`sidebar-icon-button ${popover === "add" ? "active" : ""}`}
            title="Add new project"
            aria-label="Add new project"
            onClick={() => onTogglePopover("add")}
          >
            <FolderPlus size={17} />
          </button>
        </div>
      </div>

      {popover === "add" && (
        <div className="sidebar-popover project-add-popover">
          <button type="button" className="sidebar-menu-item" onClick={onCreateWorkspace}>
            <Plus size={18} />
            <span>Start from scratch</span>
          </button>
          <button type="button" className="sidebar-menu-item" onClick={onOpenWorkspace}>
            <FolderOpen size={18} />
            <span>Use an existing folder</span>
          </button>
        </div>
      )}

      {popover === "organize" && (
        <div className="sidebar-popover organize-popover">
          <SidebarMenuLabel>Organize</SidebarMenuLabel>
          <SidebarMenuItem
            icon={<FolderOpen size={18} />}
            label="By project"
            selected={organize.organize === "project"}
            onClick={() => onOrganizeChange({ organize: "project" })}
          />
          <SidebarMenuItem
            icon={<Clock size={18} />}
            label="Chronological list"
            selected={organize.organize === "chronological"}
            onClick={() => onOrganizeChange({ organize: "chronological" })}
          />
          <SidebarMenuItem
            icon={<MessageCircle size={18} />}
            label="Chats first"
            selected={organize.organize === "chats-first"}
            onClick={() => onOrganizeChange({ organize: "chats-first" })}
          />
          <SidebarMenuDivider />
          <SidebarMenuLabel>Sort by</SidebarMenuLabel>
          <SidebarMenuItem
            icon={<CalendarPlus size={18} />}
            label="Created"
            selected={organize.sort === "created"}
            onClick={() => onOrganizeChange({ sort: "created" })}
          />
          <SidebarMenuItem
            icon={<RefreshCw size={18} />}
            label="Updated"
            selected={organize.sort === "updated"}
            onClick={() => onOrganizeChange({ sort: "updated" })}
          />
          <SidebarMenuDivider />
          <SidebarMenuLabel>Show</SidebarMenuLabel>
          <SidebarMenuItem
            icon={<MessageCircle size={18} />}
            label="All chats"
            selected={organize.show === "all"}
            onClick={() => onOrganizeChange({ show: "all" })}
          />
          <SidebarMenuItem
            icon={<Star size={18} />}
            label="Relevant"
            selected={organize.show === "relevant"}
            onClick={() => onOrganizeChange({ show: "relevant" })}
          />
        </div>
      )}
    </div>
  );
}


export function AutomationSidebar({
  folders,
  selectedPane,
  selectedFolderId,
  selectedThreadId,
  collapsed,
  popover,
  error,
  onToggleCollapse,
  onTogglePopover,
  onCreateFolder,
  onRefresh,
  onSelectPane,
  onSelectFolder,
  onSelectThread,
}: {
  folders: AutomationFolderSummary[];
  selectedPane: AutomationPane;
  selectedFolderId?: string;
  selectedThreadId?: string;
  collapsed: boolean;
  popover?: AutomationPopover;
  error?: string;
  onToggleCollapse: () => void;
  onTogglePopover: (popover: AutomationPopover) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRefresh: () => void;
  onSelectPane: (pane: AutomationPane) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectThread: (thread: AutomationThreadSummary) => void;
}) {
  const [folderName, setFolderName] = useState("");
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0];
  const paneItems: Array<{ id: AutomationPane; label: string; detail: string }> = [
    { id: "home", label: "Home", detail: "Dashboard" },
    { id: "local_tasks", label: "Local Tasks", detail: "Agent jobs" },
    { id: "workflow_agent", label: workflowRecorderSurface.newWorkflowLabel, detail: workflowRecorderSurface.newWorkflowDetail },
    { id: "workflow_lab", label: "Workflow Lab", detail: "Improve" },
    { id: "schedules", label: "Schedules", detail: "Timing" },
    { id: "runs_reviews", label: "Runs And Reviews", detail: "Audits" },
  ];
  return (
    <>
      <div className="workspace-block">
        <div className="projects-header-wrap">
          <div className="projects-header">
            <span className="automation-sidebar-title">
              Automations
              <InfoTooltip text={automationHelpText} className="heading-info-tooltip" />
            </span>
            <div className="projects-actions">
              <button
                type="button"
                className="sidebar-icon-button"
                title={collapsed ? "Expand automation folders" : "Collapse automation folders"}
                aria-label={collapsed ? "Expand automation folders" : "Collapse automation folders"}
                onClick={onToggleCollapse}
              >
                <Minimize2 size={16} />
              </button>
              <button
                type="button"
                className={`sidebar-icon-button ${popover === "organize" ? "active" : ""}`}
                title="Refresh automations"
                aria-label="Refresh automations"
                onClick={() => {
                  onRefresh();
                  onTogglePopover("organize");
                }}
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                className={`sidebar-icon-button ${popover === "add" ? "active" : ""}`}
                title="Add automation folder"
                aria-label="Add automation folder"
                onClick={() => onTogglePopover("add")}
              >
                <FolderPlus size={17} />
              </button>
            </div>
          </div>
          {popover === "add" && (
            <div className="sidebar-popover project-add-popover">
              <SidebarMenuLabel>New Folder</SidebarMenuLabel>
              <input
                className="sidebar-popover-input"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Folder name"
                maxLength={120}
              />
              <button
                type="button"
                className="sidebar-menu-item"
                onClick={() => {
                  void onCreateFolder(folderName);
                  setFolderName("");
                }}
              >
                <FolderPlus size={18} />
                <span>Create folder</span>
              </button>
            </div>
          )}
          {popover === "organize" && (
            <div className="sidebar-popover organize-popover">
              <SidebarMenuLabel>Automations</SidebarMenuLabel>
              <SidebarMenuItem icon={<RefreshCw size={18} />} label="Refresh" selected={false} onClick={onRefresh} />
            </div>
          )}
        </div>
      </div>
      <div className="project-list automation-folder-list">
        {error && <p className="sidebar-error">{error}</p>}
        <section className="automation-sidebar-system">
          <SidebarMenuLabel>Areas</SidebarMenuLabel>
          <div className="automation-pane-list">
            {paneItems.map((pane) => (
              <button
                key={pane.id}
                type="button"
                className={`workspace-button automation-pane-button ${selectedPane === pane.id && !selectedThreadId ? "active-project" : ""}`}
                onClick={() => onSelectPane(pane.id)}
                title={activePaneTooltip(pane.id)}
              >
                <AutomationPaneIcon pane={pane.id} />
                <span>{pane.label}</span>
                <small>{pane.detail}</small>
              </button>
            ))}
          </div>
        </section>
        <SidebarMenuLabel>Folders</SidebarMenuLabel>
        {folders.map((folder) => {
          const selected = selectedPane === "folder" && folder.id === selectedFolder?.id;
          return (
            <section className="project-group" key={folder.id}>
              <button
                type="button"
                className={`workspace-button automation-folder-button ${selected ? "active-project" : ""}`}
                onClick={() => onSelectFolder(folder.id)}
                title={`${folder.name} automation folder`}
              >
                {folder.kind === "home" ? <Home size={15} /> : <Folder size={15} />}
                <span>{folder.name}</span>
                <small>{folder.threads.length}</small>
                {!collapsed && folder.threads.length > 0 && <ChevronDown size={14} />}
              </button>
              {!collapsed &&
                (folder.threads.length > 0 ? (
                  <div className="thread-list nested">
                    {folder.threads.map((thread) => (
                      <button
                        key={thread.id}
                        type="button"
                        className={`thread-row automation-thread-row ${selectedThreadId === thread.id ? "active" : ""}`}
                        title={thread.title}
                        onClick={() => onSelectThread(thread)}
                      >
                        <span className="thread-row-main">
                          <span className="thread-title" title={thread.title}>
                            {thread.title}
                          </span>
                          <span className="thread-row-meta">
                            {thread.latestRun?.status === "running" && <LoaderCircle size={12} className="spin" />}
                            <span className={`thread-indicator ${automationIndicatorKind(thread.status)}`} title={formatTaskState(thread.status)}>
                              <ThreadIndicatorIcon kind={automationIndicatorKind(thread.status)} />
                            </span>
                          </span>
                        </span>
                        <span className="thread-preview">
                          {formatTaskState(thread.status)} · {thread.projectName}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <button type="button" className="no-chats-row" onClick={() => onSelectFolder(folder.id)}>
                    No automations
                  </button>
                ))}
            </section>
          );
        })}
      </div>
    </>
  );
}


export function WorkflowAgentSidebar({
  folders,
  workflowRecordingLibrary,
  selectedFolderId,
  selectedThreadId,
  selectedPlaybookId,
  collapsed,
  popover,
  error,
  onToggleCollapse,
  onTogglePopover,
  onCreateFolder,
  onRefresh,
  onComposeInFolder,
  onSelectFolder,
  onSelectThread,
  onSelectPlaybook,
}: {
  folders: WorkflowAgentFolderSummary[];
  workflowRecordingLibrary: WorkflowRecordingLibraryEntry[];
  selectedFolderId?: string;
  selectedThreadId?: string;
  selectedPlaybookId?: string;
  collapsed: boolean;
  popover?: AutomationPopover;
  error?: string;
  onToggleCollapse: () => void;
  onTogglePopover: (popover: AutomationPopover) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRefresh: () => void;
  onComposeInFolder: (folderId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectThread: (thread: WorkflowAgentThreadSummary) => void;
  onSelectPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
}) {
  const [folderName, setFolderName] = useState("");
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0];
  const playbookRows = workflowRecorderLibrarySidebarRows(workflowRecordingLibrary);
  const playbookById = new Map(workflowRecordingLibrary.map((playbook) => [playbook.id, playbook]));
  return (
    <>
      <div className="workspace-block">
        <div className="projects-header-wrap">
          <div className="projects-header">
            <span className="automation-sidebar-title">
              {workflowRecorderSurface.sidebarTitle}
              <InfoTooltip text={automationHelpText} className="heading-info-tooltip" />
            </span>
            <div className="projects-actions">
              <button
                type="button"
                className="sidebar-icon-button"
                title={collapsed ? "Expand workflow folders" : "Collapse workflow folders"}
                aria-label={collapsed ? "Expand workflow folders" : "Collapse workflow folders"}
                onClick={onToggleCollapse}
              >
                <Minimize2 size={16} />
              </button>
              <button
                type="button"
                className={`sidebar-icon-button ${popover === "organize" ? "active" : ""}`}
                title={workflowRecorderSurface.refreshLabel}
                aria-label={workflowRecorderSurface.refreshLabel}
                onClick={() => {
                  onRefresh();
                  onTogglePopover("organize");
                }}
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                className={`sidebar-icon-button ${popover === "add" ? "active" : ""}`}
                title="Add workflow folder"
                aria-label="Add workflow folder"
                onClick={() => onTogglePopover("add")}
              >
                <FolderPlus size={17} />
              </button>
            </div>
          </div>
          {popover === "add" && (
            <div className="sidebar-popover project-add-popover">
              <SidebarMenuLabel>{workflowRecorderSurface.newFolderLabel}</SidebarMenuLabel>
              <input
                className="sidebar-popover-input"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Folder name"
                maxLength={120}
              />
              <button
                type="button"
                className="sidebar-menu-item"
                onClick={() => {
                  void onCreateFolder(folderName);
                  setFolderName("");
                }}
              >
                <FolderPlus size={18} />
                <span>Create folder</span>
              </button>
            </div>
          )}
          {popover === "organize" && (
            <div className="sidebar-popover organize-popover">
              <SidebarMenuLabel>{workflowRecorderSurface.sidebarTitle}</SidebarMenuLabel>
              <SidebarMenuItem icon={<RefreshCw size={18} />} label="Refresh" selected={false} onClick={onRefresh} />
            </div>
          )}
        </div>
      </div>
      <div className="project-list automation-folder-list">
        {error && <p className="sidebar-error">{error}</p>}
        <SidebarMenuLabel>{workflowRecorderSurface.folderLabel}</SidebarMenuLabel>
        {folders.map((folder) => {
          const selected = folder.id === selectedFolder?.id;
          return (
            <section className="project-group" key={folder.id}>
              <div className="project-row-shell">
                <button
                  type="button"
                  className={`workspace-button automation-folder-button ${selected && !selectedThreadId && !selectedPlaybookId ? "active-project" : ""}`}
                  onClick={() => onSelectFolder(folder.id)}
                  title={`${folder.name} ${workflowRecorderSurface.legacyCompilerEnabled ? "workflow" : "recording"} folder`}
                >
                  {folder.kind === "home" ? <Home size={15} /> : <Folder size={15} />}
                  <span>{folder.name}</span>
                  <small>{folder.threads.length}</small>
                  {!collapsed && folder.threads.length > 0 && <ChevronDown size={14} />}
                </button>
                <div className="project-row-actions">
                  <button
                    type="button"
                    className="project-compose-icon-button"
                    title={`${workflowRecorderSurface.newWorkflowLabel} in ${folder.name}`}
                    aria-label={`${workflowRecorderSurface.newWorkflowLabel} in ${folder.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onComposeInFolder(folder.id);
                    }}
                  >
                    <SquarePen size={15} />
                  </button>
                </div>
              </div>
              {!collapsed &&
                (folder.threads.length > 0 ? (
                  <div className="thread-list nested">
                    {folder.threads.map((thread) => (
                      <button
                        key={thread.id}
                        type="button"
                        className={`thread-row automation-thread-row ${selectedThreadId === thread.id ? "active" : ""}`}
                        title={thread.title}
                        onClick={() => onSelectThread(thread)}
                      >
                        <span className="thread-row-main">
                          <span className="thread-title" title={thread.title}>
                            {thread.title}
                          </span>
                          <span className="thread-row-meta">
                            {thread.phase === "running" && <LoaderCircle size={12} className="spin" />}
                            <span className={`thread-indicator ${automationIndicatorKind(thread.status)}`} title={formatTaskState(thread.status)}>
                              <ThreadIndicatorIcon kind={automationIndicatorKind(thread.status)} />
                            </span>
                          </span>
                        </span>
                        <span className="thread-preview">
                          {formatTaskState(thread.phase)} · {thread.projectName}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <button type="button" className="no-chats-row" onClick={() => onSelectFolder(folder.id)}>
                    {workflowRecorderSurface.emptyFolderLabel}
                  </button>
                ))}
            </section>
          );
        })}
        {!workflowRecorderSurface.legacyCompilerEnabled && (
          <section className="project-group">
            <div className="project-row-shell">
              <button
                type="button"
                className={`workspace-button automation-folder-button ${selectedPlaybookId ? "active-project" : ""}`}
                onClick={() => {
                  const first = playbookRows[0] ? playbookById.get(playbookRows[0].id) : undefined;
                  if (first) onSelectPlaybook(first);
                  else onSelectFolder(selectedFolder?.id ?? "home");
                }}
                title="Saved workflow playbooks"
              >
                <Package size={15} />
                <span>Saved Playbooks</span>
                <small>{playbookRows.length}</small>
                {!collapsed && playbookRows.length > 0 && <ChevronDown size={14} />}
              </button>
            </div>
            {!collapsed &&
              (playbookRows.length > 0 ? (
                <div className="thread-list nested">
                  {playbookRows.map((row) => {
                    const playbook = playbookById.get(row.id);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        className={`thread-row automation-thread-row workflow-playbook-thread-row ${selectedPlaybookId === row.id ? "active" : ""}`}
                        title={row.title}
                        onClick={() => {
                          if (playbook) onSelectPlaybook(playbook);
                        }}
                      >
                        <span className="thread-row-main">
                          <span className="thread-title" title={row.title}>
                            {row.title}
                          </span>
                          <span className="thread-row-meta">
                            <span className={`thread-indicator ${row.enabled ? "awaiting" : "idle"}`} title={row.statusLabel}>
                              <ThreadIndicatorIcon kind={row.enabled ? "awaiting" : "idle"} />
                            </span>
                          </span>
                        </span>
                        <span className="thread-preview" title={`${row.statusLabel} · ${row.toolLabel}`} data-ui-allow-truncation="true">
                          {row.statusLabel} · {row.toolLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <button type="button" className="no-chats-row" onClick={() => onSelectFolder(selectedFolder?.id ?? "home")}>
                  No saved playbooks
                </button>
              ))}
          </section>
        )}
      </div>
    </>
  );
}


export function ThreadIndicatorIcon({ kind }: { kind: ThreadIndicatorKind }) {
  if (kind === "running") return <LoaderCircle size={12} className="spin" />;
  if (kind === "error") return <AlertCircle size={12} />;
  if (kind === "awaiting") return <span aria-hidden="true" />;
  return <span aria-hidden="true" />;
}
