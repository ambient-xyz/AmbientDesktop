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
import { isHiddenTranscriptMessage } from "../../shared/threadPreview";
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
import {
  MediaPreviewModal,
  ToolMessageCard,
  type MediaPreviewModalRequest,
} from "./AppToolMessages";

export const GOAL_COMPLETION_MESSAGE_KIND = "goal-completion";

export function MessageBubble({
  message,
  voiceState,
  voiceProviderLabels,
  streaming,
  workspacePath,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenUrl,
  onOpenBrowserUrl,
  onOpenBrowserPanel,
  onOpenMediaModal,
  generatedMediaAutoplay,
  voiceShouldAutoplay,
  activeVoiceMessageId,
  onActiveVoiceMessageChange,
  onRegenerateVoice,
  onRevealVoiceArtifact,
  onClearVoiceArtifact,
  artifactPathHints,
  plannerPlanArtifact,
  runActivityLines,
  runStatus,
  retryable,
  onRetry,
  toolActionDisabled = false,
  onSendTelegramSessionSetupPrompt,
  onSendRemoteSurfaceActivationPrompt,
  onImplementPlannerPlan,
  onRefinePlannerPlan,
  onRetryPlannerFinalization,
  onAddPlannerPlanToBoard,
  onGeneratePlannerDurableArtifact,
  onAnswerPlannerDecisionQuestion,
  hasProjectBoard,
  highlightQuery,
  contextRecoveryBusy = false,
  contextRecoveryCanRetry = false,
  onRecoverContext,
  onRecoverContextAndRetry,
  onDuplicateThreadFromTranscript,
}: {
  message: ChatMessage;
  voiceState?: MessageVoiceState;
  voiceProviderLabels: Record<string, string>;
  streaming: boolean;
  workspacePath: string;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenBrowserUrl: (url: string) => void;
  onOpenBrowserPanel: () => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
  generatedMediaAutoplay: boolean;
  voiceShouldAutoplay: boolean;
  activeVoiceMessageId?: string;
  onActiveVoiceMessageChange: (messageId?: string) => void;
  onRegenerateVoice: (messageId: string) => void | Promise<void>;
  onRevealVoiceArtifact: (messageId: string) => void | Promise<void>;
  onClearVoiceArtifact: (messageId: string) => void | Promise<void>;
  artifactPathHints: ArtifactPathHints;
  plannerPlanArtifact?: PlannerPlanArtifact;
  runActivityLines: RunActivityLine[];
  runStatus: RunStatus;
  retryable?: boolean;
  onRetry?: (message: ChatMessage) => void | Promise<void>;
  toolActionDisabled?: boolean;
  onSendTelegramSessionSetupPrompt?: (prompt: string) => void | Promise<void>;
  onSendRemoteSurfaceActivationPrompt?: (prompt: string) => void | Promise<void>;
  onImplementPlannerPlan: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onRefinePlannerPlan: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onRetryPlannerFinalization: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onAddPlannerPlanToBoard: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onGeneratePlannerDurableArtifact: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onAnswerPlannerDecisionQuestion: (
    artifact: PlannerPlanArtifact,
    questionId: string,
    answer: AnswerPlannerDecisionQuestionInput["answer"],
  ) => void | Promise<void>;
  hasProjectBoard: boolean;
  highlightQuery?: string;
  contextRecoveryBusy?: boolean;
  contextRecoveryCanRetry?: boolean;
  onRecoverContext?: () => void | Promise<void>;
  onRecoverContextAndRetry?: () => void | Promise<void>;
  onDuplicateThreadFromTranscript?: () => void | Promise<void>;
}) {
  const metaLabel = messageMetaLabel(message);
  const status = messageStatus(message);
  const context = contextReferencesFromMetadata(message.metadata?.context);
  const sttMetadata = sttMessageMetadataFromUnknown(message.metadata?.stt);
  const thinking = isThinkingMessage(message);
  const goalCompletion = isGoalCompletionMessage(message);
  const roleLabel = goalCompletion ? "Goal" : thinking ? "Thinking" : plannerPlanArtifact ? "Plan" : message.role === "assistant" ? "Ambient" : message.role;
  const diagnosticCard = messageDiagnosticCardModel(message);
  const diagnosticContent = diagnosticCard ? messageContentWithoutDiagnostic(message) : message.content;
  const diagnosticCopyText =
    diagnosticCard && message.role === "system" && message.metadata?.runtime === "ambient-recovery"
      ? message.content.trim() || diagnosticCard.details
      : undefined;
  const showVoiceState = message.role === "assistant" && !thinking && Boolean(voiceState);
  const [copied, setCopied] = useState(false);
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);
  const [diagnosticDismissed, setDiagnosticDismissed] = useState(false);
  const copyResetTimerRef = useRef<number | undefined>(undefined);
  const diagnosticCopyResetTimerRef = useRef<number | undefined>(undefined);
  const [durablePlanMenu, setDurablePlanMenu] = useState<LinkContextMenuState | undefined>();
  const [durablePlanOpenTargets, setDurablePlanOpenTargets] = useState<WorkspaceOpenTarget[]>([]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
      if (diagnosticCopyResetTimerRef.current) window.clearTimeout(diagnosticCopyResetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!durablePlanMenu?.artifactPath) {
      setDurablePlanOpenTargets([]);
      return;
    }
    let disposed = false;
    window.ambientDesktop
      .listWorkspaceOpenTargets()
      .then((targets) => {
        if (!disposed) setDurablePlanOpenTargets(targets);
      })
      .catch(() => {
        if (!disposed) setDurablePlanOpenTargets([]);
      });
    return () => {
      disposed = true;
    };
  }, [durablePlanMenu?.artifactPath]);

  useEffect(() => {
    if (!durablePlanMenu) return;
    const close = () => setDurablePlanMenu(undefined);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [durablePlanMenu]);

  const plannerPlanFinalizationRunning =
    plannerPlanArtifact?.workflowState === "finalizing" || plannerPlanArtifact?.finalizationAttempt?.status === "running";
  const plannerPlanReadyForActions = plannerPlanArtifact?.status === "ready" && !plannerPlanFinalizationRunning;
  const canImplementPlannerPlan = plannerPlanReadyForActions && plannerPlanArtifact
    ? plannerRequiredDecisionQuestionsAnswered(plannerPlanArtifact)
    : false;
  const canRefinePlannerPlan = plannerPlanArtifact && plannerPlanReadyForActions
    ? plannerCanRefineWithAdditionalFeedback(plannerPlanArtifact, plannerPlanFinalizationRunning)
    : false;
  const plannerDurableGenerating = plannerPlanArtifact?.workflowState === "durable_generating";
  const canGenerateDurablePlan = Boolean(plannerPlanArtifact && canImplementPlannerPlan && !plannerDurableGenerating);
  const copyKind = message.role === "user" ? "prompt" : "response";
  const canCopyMessage = (message.role === "assistant" || message.role === "user") && !thinking && !streaming && Boolean(renderableMessageContent(message));
  const canRetryMessage = message.role === "user" && Boolean(retryable) && !streaming && Boolean(renderableMessageContent(message));
  const showContextRecoveryActions = message.role === "assistant" && isSessionContextMissingError(message.content);
  const showMessageActions = canRetryMessage || canCopyMessage || (plannerPlanArtifact && plannerPlanArtifact.status === "ready");
  const streamingPlaceholder = streaming && !message.content ? messageStreamingPlaceholder(message, runActivityLines, runStatus) : undefined;
  const durablePlanPath = plannerPlanArtifact?.durableArtifactPath;
  const durablePlanMenuFilePath = durablePlanMenu?.artifactPath ? workspaceAbsoluteArtifactPath(durablePlanMenu.artifactPath, workspacePath) : undefined;
  const durablePlanPrimaryOpenTarget = durablePlanMenu?.artifactPath ? preferredWorkspaceOpenTarget(durablePlanOpenTargets) : undefined;
  const durablePlanChromeOpenTarget =
    durablePlanMenuFilePath && isHtmlArtifactPath(durablePlanMenuFilePath)
      ? durablePlanOpenTargets.find((target) => target.id === "chrome")
      : undefined;
  const durablePlanSecondaryOpenTargets =
    durablePlanMenu?.artifactPath && durablePlanPrimaryOpenTarget
      ? durablePlanOpenTargets.filter(
          (target) =>
            target.id !== durablePlanPrimaryOpenTarget.id &&
            target.id !== durablePlanChromeOpenTarget?.id &&
            target.kind !== "finder",
        )
      : [];
  const openDurablePlanMenuWith = (targetId?: string) => {
    if (!durablePlanMenu?.artifactPath) return;
    const path = targetId === "chrome" && durablePlanMenuFilePath ? durablePlanMenuFilePath : durablePlanMenu.artifactPath;
    void window.ambientDesktop.openWorkspacePathWith({ path, targetId }).catch(() => undefined);
  };
  const revealDurablePlanMenuFile = () => {
    if (!durablePlanMenu?.artifactPath) return;
    void window.ambientDesktop.revealWorkspacePath(durablePlanMenuFilePath ?? durablePlanMenu.artifactPath).catch(() => undefined);
  };

  async function copyMessageContent() {
    if (!canCopyMessage) return;
    await window.ambientDesktop.writeClipboardText(message.content);
    setCopied(true);
    if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = window.setTimeout(() => setCopied(false), 1400);
  }

  async function copyDiagnosticContent() {
    if (!diagnosticCopyText) return;
    await window.ambientDesktop.writeClipboardText(diagnosticCopyText);
    setDiagnosticCopied(true);
    if (diagnosticCopyResetTimerRef.current) window.clearTimeout(diagnosticCopyResetTimerRef.current);
    diagnosticCopyResetTimerRef.current = window.setTimeout(() => setDiagnosticCopied(false), 1400);
  }

  if (message.role === "tool") {
    return (
      <ToolMessageCard
        message={message}
        workspacePath={workspacePath}
        onPreviewPath={onPreviewPath}
        onPreviewLocalPath={onPreviewLocalPath}
        onOpenUrl={onOpenUrl}
        onOpenBrowserUrl={onOpenBrowserUrl}
        onOpenBrowserPanel={onOpenBrowserPanel}
        onOpenMediaModal={onOpenMediaModal}
        generatedMediaAutoplay={generatedMediaAutoplay}
        toolActionDisabled={toolActionDisabled}
        onSendTelegramSessionSetupPrompt={onSendTelegramSessionSetupPrompt}
        onSendRemoteSurfaceActivationPrompt={onSendRemoteSurfaceActivationPrompt}
      />
    );
  }
  if (diagnosticCard && diagnosticDismissed && !diagnosticContent.trim()) return null;
  return (
    <article className={`message ${message.role} ${thinking ? "thinking" : ""} ${plannerPlanArtifact ? "planner-plan" : ""} ${goalCompletion ? "goal-completion-message" : ""} ${diagnosticCard ? "diagnostic-message" : ""} ${status ? `status-${status}` : ""}`}>
      <div className="message-role">{roleLabel}</div>
      {diagnosticCard && !diagnosticDismissed ? (
        <MessageDiagnosticCard
          model={diagnosticCard}
          copied={diagnosticCopied}
          onCopy={diagnosticCopyText ? () => void copyDiagnosticContent() : undefined}
          onDismiss={() => setDiagnosticDismissed(true)}
        />
      ) : null}
      <div className="message-content">
        {diagnosticContent ? (
          <>
            <RichText
              content={diagnosticContent}
              compact={thinking}
              highlightQuery={highlightQuery}
              artifactPathHints={artifactPathHints}
              onPreviewPath={onPreviewPath}
              onPreviewLocalPath={onPreviewLocalPath}
              onOpenMediaModal={onOpenMediaModal}
              onOpenUrl={onOpenUrl}
              onOpenBrowserUrl={onOpenBrowserUrl}
              workspacePath={workspacePath}
            />
            {streaming && thinking && <span className="cursor thinking-cursor" />}
          </>
        ) : streamingPlaceholder ? (
          <span className="streaming-placeholder">
            <span>{streamingPlaceholder}</span>
            <span className="cursor" />
          </span>
        ) : null}
      </div>
      {plannerPlanArtifact?.warnings?.length ? (
        <div className="planner-plan-warnings" role="status" aria-label="Planner warnings">
          <AlertCircle size={14} />
          <div>
            <strong>Planner warning</strong>
            {plannerPlanArtifact.warnings.map((warning, index) => (
              <span key={`${index}:${warning}`}>{warning}</span>
            ))}
          </div>
        </div>
      ) : null}
      {plannerPlanArtifact?.durableArtifactValidation && !plannerPlanArtifact.durableArtifactValidation.ok ? (
        <div className="planner-plan-warnings" role="status" aria-label="Durable plan validation errors">
          <AlertCircle size={14} />
          <div>
            <strong>Durable plan validation failed</strong>
            {plannerPlanArtifact.durableArtifactValidation.errors.map((issue, index) => (
              <span key={`${issue.code}:${index}`}>{issue.section ? `${issue.section}: ${issue.message}` : issue.message}</span>
            ))}
          </div>
        </div>
      ) : null}
      {showContextRecoveryActions && (
        <SessionContextRecoveryInlineActions
          busy={contextRecoveryBusy}
          canRetry={contextRecoveryCanRetry}
          onRecover={onRecoverContext}
          onRecoverAndRetry={onRecoverContextAndRetry}
          onDuplicate={onDuplicateThreadFromTranscript}
        />
      )}
      {showVoiceState && voiceState && (
        <MessageVoiceStateStrip
          voiceState={voiceState}
          providerLabels={voiceProviderLabels}
          shouldAutoplay={voiceShouldAutoplay}
          activeVoiceMessageId={activeVoiceMessageId}
          onActiveVoiceMessageChange={onActiveVoiceMessageChange}
          onRegenerateVoice={onRegenerateVoice}
          onRevealVoiceArtifact={onRevealVoiceArtifact}
          onClearVoiceArtifact={onClearVoiceArtifact}
        />
      )}
      {message.role === "user" && sttMetadata && (
        <MessageSttMetadataStrip metadata={sttMetadata} onPreviewPath={onPreviewPath} />
      )}
      {showMessageActions && (
        <div className="message-actions">
          {durablePlanPath ? (
            <button
              type="button"
              className="message-action-button text"
              title="Preview durable plan"
              aria-label="Preview durable plan"
              onClick={() => onPreviewPath(durablePlanPath)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDurablePlanMenu({
                  url: durablePlanPath,
                  artifactPath: durablePlanPath,
                  x: clampNumber(event.clientX, 8, Math.max(8, window.innerWidth - 236)),
                  y: clampNumber(event.clientY, 8, Math.max(8, window.innerHeight - 320)),
                });
              }}
            >
              <FileText size={15} />
              Durable Plan
            </button>
          ) : plannerPlanArtifact && plannerPlanArtifact.status === "ready" ? (
            <button
              type="button"
              className="message-action-button text"
              title={canGenerateDurablePlan ? "Generate durable plan artifact" : "Answer required planner decisions first"}
              aria-label="Generate durable plan"
              disabled={!canGenerateDurablePlan}
              onClick={() => void onGeneratePlannerDurableArtifact(plannerPlanArtifact)}
            >
              <FileText size={15} />
              {plannerDurableGenerating ? "Generating" : "Durable Plan"}
            </button>
          ) : null}
          {plannerPlanArtifact && plannerPlanArtifact.status === "ready" && (
            <button
              type="button"
              className="message-action-button text"
              title={
                plannerPlanFinalizationRunning
                  ? "Plan finalization is already running"
                  : hasProjectBoard
                    ? "Add this plan to the project board"
                    : "Create a project board and add this plan"
              }
              aria-label="Add plan to board"
              disabled={!plannerPlanReadyForActions}
              onClick={() => void onAddPlannerPlanToBoard(plannerPlanArtifact)}
            >
              <Kanban size={15} />
              Add to Board
            </button>
          )}
          {plannerPlanArtifact && plannerPlanArtifact.status === "ready" && (
            <button
              type="button"
              className="message-action-button text"
              title={
                plannerPlanFinalizationRunning
                  ? "Plan finalization is already running"
                  : canRefinePlannerPlan
                    ? "Revise this plan with feedback"
                    : "Plan is not ready for revision"
              }
              aria-label="Revise with feedback"
              disabled={!canRefinePlannerPlan}
              onClick={() => void onRefinePlannerPlan(plannerPlanArtifact)}
            >
              <RefreshCw size={15} />
              Revise with feedback
            </button>
          )}
          {plannerPlanArtifact && plannerPlanArtifact.status === "ready" && (
            <button
              type="button"
              className="message-action-button text"
              title={
                plannerPlanFinalizationRunning
                  ? "Plan finalization is already running"
                  : canImplementPlannerPlan
                    ? "Implement this plan"
                    : "Answer required planner decisions first"
              }
              aria-label="Implement this plan"
              disabled={!canImplementPlannerPlan}
              onClick={() => void onImplementPlannerPlan(plannerPlanArtifact)}
            >
              <ClipboardPaste size={15} />
              Implement
            </button>
          )}
          {canRetryMessage && (
            <button
              type="button"
              className="message-action-button"
              title="Retry this prompt"
              aria-label="Retry this prompt"
              onClick={() => void onRetry?.(message)}
            >
              <RotateCcw size={15} />
            </button>
          )}
          {canCopyMessage && (
            <button
              type="button"
              className="message-action-button"
              title={copied ? `Copied ${copyKind}` : `Copy ${copyKind}`}
              aria-label={copied ? `Copied ${copyKind}` : `Copy ${copyKind}`}
              onClick={() => void copyMessageContent()}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          )}
          {durablePlanMenu?.artifactPath && (
            <div
              className="link-context-menu"
              role="menu"
              aria-label="Durable plan options"
              style={{ left: durablePlanMenu.x, top: durablePlanMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const path = durablePlanMenu.artifactPath!;
                  setDurablePlanMenu(undefined);
                  onPreviewPath(path);
                }}
              >
                <FileText size={13} />
                <span>{isHtmlArtifactPath(durablePlanMenu.artifactPath) ? "Preview HTML in Ambient" : "Preview in Ambient"}</span>
              </button>
              {durablePlanChromeOpenTarget && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setDurablePlanMenu(undefined);
                    openDurablePlanMenuWith(durablePlanChromeOpenTarget.id);
                  }}
                >
                  <OpenTargetIcon target={durablePlanChromeOpenTarget} />
                  <span>Open in Google Chrome</span>
                </button>
              )}
              {durablePlanPrimaryOpenTarget && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setDurablePlanMenu(undefined);
                    openDurablePlanMenuWith(durablePlanPrimaryOpenTarget.id);
                  }}
                >
                  <OpenTargetIcon target={durablePlanPrimaryOpenTarget} />
                  <span>
                    {durablePlanPrimaryOpenTarget.kind === "default"
                      ? "Open in default app"
                      : `Open in ${durablePlanPrimaryOpenTarget.label}`}
                  </span>
                </button>
              )}
              {durablePlanSecondaryOpenTargets.map((target) => (
                <button
                  type="button"
                  role="menuitem"
                  key={target.id}
                  onClick={() => {
                    setDurablePlanMenu(undefined);
                    openDurablePlanMenuWith(target.id);
                  }}
                >
                  <OpenTargetIcon target={target} />
                  <span>Open with {target.label}</span>
                </button>
              ))}
              <div className="link-context-menu-divider" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setDurablePlanMenu(undefined);
                  revealDurablePlanMenuFile();
                }}
              >
                <FolderOpen size={13} />
                <span>Reveal in Finder</span>
              </button>
            </div>
          )}
        </div>
      )}
      {plannerPlanArtifact && plannerPlanArtifact.status === "ready" && plannerPlanArtifact.decisionQuestions.length > 0 && (
        <PlannerDecisionPanel
          artifact={plannerPlanArtifact}
          runActivityLines={runActivityLines}
          runStatus={runStatus}
          onAnswerPlannerDecisionQuestion={onAnswerPlannerDecisionQuestion}
          onRetryPlannerFinalization={onRetryPlannerFinalization}
        />
      )}
      {message.role === "user" && <MessageContextList attachments={context} />}
      {metaLabel && <div className="message-meta">{metaLabel}</div>}
    </article>
  );
}

export function MessageSttMetadataStrip({
  metadata,
  onPreviewPath,
}: {
  metadata: SttMessageMetadata;
  onPreviewPath: (path: string) => void;
}) {
  return (
    <div className="message-stt-metadata">
      <Mic size={13} aria-hidden="true" />
      <span>{sttMetadataSummary(metadata)}</span>
      <SttArtifactLinks metadata={metadata} onPreviewPath={onPreviewPath} />
    </div>
  );
}

export function SttArtifactLinks({
  metadata,
  onPreviewPath,
  compact = false,
}: {
  metadata: SttMessageMetadata;
  onPreviewPath: (path: string) => void;
  compact?: boolean;
}) {
  const artifacts = sttMessageArtifactEntries(metadata);
  if (!artifacts.length) return null;
  const visibleArtifacts = compact ? artifacts.slice(0, 3) : artifacts;
  return (
    <div className={`stt-artifact-links ${compact ? "compact" : ""}`} aria-label="Speech artifact links">
      {visibleArtifacts.map((artifact) => (
        <button
          key={artifact.key}
          type="button"
          className="artifact-link"
          title={artifact.path}
          onClick={() => onPreviewPath(artifact.path)}
        >
          {artifact.label}
        </button>
      ))}
    </div>
  );
}

export function sttMetadataSummary(metadata: SttMessageMetadata): string {
  const labels = [
    "Speech",
    metadata.providerId ?? providerLabelFromCapability(metadata.providerCapabilityId),
    metadata.language,
    typeof metadata.durationMs === "number" ? formatDurationMs(metadata.durationMs) : undefined,
    typeof metadata.noSpeechGate?.rmsDbfs === "number" ? `${Math.round(metadata.noSpeechGate.rmsDbfs)} dBFS` : undefined,
  ].filter(Boolean);
  return labels.join(" · ");
}

export function providerLabelFromCapability(capabilityId: string | undefined): string | undefined {
  if (!capabilityId) return undefined;
  const command = capabilityId.split(":tool:").at(-1);
  return command?.replace(/[_-]+/g, " ");
}

export function MessageVoiceStateStrip({
  voiceState,
  providerLabels,
  shouldAutoplay,
  activeVoiceMessageId,
  onActiveVoiceMessageChange,
  onRegenerateVoice,
  onRevealVoiceArtifact,
  onClearVoiceArtifact,
}: {
  voiceState: MessageVoiceState;
  providerLabels: Record<string, string>;
  shouldAutoplay: boolean;
  activeVoiceMessageId?: string;
  onActiveVoiceMessageChange: (messageId?: string) => void;
  onRegenerateVoice: (messageId: string) => void | Promise<void>;
  onRevealVoiceArtifact: (messageId: string) => void | Promise<void>;
  onClearVoiceArtifact: (messageId: string) => void | Promise<void>;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const stripModel = messageVoiceStripModel(voiceState, { providerLabels });
  const canPlay = stripModel.canPlay;
  const canRegenerate = stripModel.canRegenerate;
  const isActiveVoice = activeVoiceMessageId === voiceState.messageId;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isActiveVoice) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
  }, [isActiveVoice]);

  useEffect(() => {
    if (!canPlay || !shouldAutoplay) return;
    void playVoice();
  }, [canPlay, shouldAutoplay, voiceState.mediaUrl, voiceState.updatedAt]);

  async function playVoice() {
    const audio = audioRef.current;
    if (!audio || !canPlay) return;
    onActiveVoiceMessageChange(voiceState.messageId);
    try {
      await audio.play();
    } catch {
      setPlaying(false);
      onActiveVoiceMessageChange(undefined);
    }
  }

  function pauseVoice() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
    if (isActiveVoice) onActiveVoiceMessageChange(undefined);
  }

  function stopVoice() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
    if (isActiveVoice) onActiveVoiceMessageChange(undefined);
  }

  return (
    <div className={`message-voice-state voice-${voiceState.status}`} title={stripModel.detailParts.join(" · ")}>
      {voiceState.status === "synthesizing" ? <LoaderCircle size={13} className="spin" /> : <Music size={13} />}
      <span>{stripModel.statusLabel}</span>
      <small>{stripModel.detailParts.join(" · ")}</small>
      {stripModel.canInspect && (
        <button
          type="button"
          className={`message-voice-action ${detailsOpen ? "active" : ""}`}
          title="Inspect voice details"
          aria-label="Inspect voice details"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <Info size={12} />
        </button>
      )}
      {canPlay && (
        <>
          <button
            type="button"
            className={`message-voice-action ${playing ? "active" : ""}`}
            title={playing ? "Pause voice" : "Play voice"}
            aria-label={playing ? "Pause voice" : "Play voice"}
            onClick={() => (playing ? pauseVoice() : void playVoice())}
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button type="button" className="message-voice-action" title="Stop voice" aria-label="Stop voice" onClick={stopVoice}>
            <Square size={12} />
          </button>
        </>
      )}
      {canRegenerate && (
        <button
          type="button"
          className="message-voice-action"
          title={stripModel.regenerateLabel}
          aria-label={stripModel.regenerateLabel}
          onClick={() => void onRegenerateVoice(voiceState.messageId)}
        >
          <RefreshCw size={12} />
        </button>
      )}
      {stripModel.canRevealArtifact && (
        <button
          type="button"
          className="message-voice-action"
          title="Reveal voice file"
          aria-label="Reveal voice file"
          onClick={() => void onRevealVoiceArtifact(voiceState.messageId)}
        >
          <FolderOpen size={12} />
        </button>
      )}
      {stripModel.canClearArtifact && (
        <button
          type="button"
          className="message-voice-action"
          title="Clear voice file"
          aria-label="Clear voice file"
          onClick={() => void onClearVoiceArtifact(voiceState.messageId)}
        >
          <Trash2 size={12} />
        </button>
      )}
      {canPlay && (
        <audio
          key={stripModel.audioKey}
          ref={audioRef}
          className="message-voice-audio"
          preload={shouldAutoplay ? "auto" : "metadata"}
          src={voiceState.mediaUrl}
          onPlay={() => {
            onActiveVoiceMessageChange(voiceState.messageId);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            if (activeVoiceMessageId === voiceState.messageId) onActiveVoiceMessageChange(undefined);
          }}
        >
          Voice playback is not supported by this Electron build.
        </audio>
      )}
      {detailsOpen && (
        <div className="message-voice-details" role="dialog" aria-label="Voice details">
          <dl>
            {stripModel.inspectRows.map((row) => (
              <div key={`${row.label}:${row.value}`}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          {stripModel.spokenTextPreview && (
            <pre>{stripModel.spokenTextPreview}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export function PlannerDecisionPanel({
  artifact,
  runActivityLines,
  runStatus,
  onAnswerPlannerDecisionQuestion,
  onRetryPlannerFinalization,
}: {
  artifact: PlannerPlanArtifact;
  runActivityLines: RunActivityLine[];
  runStatus: RunStatus;
  onAnswerPlannerDecisionQuestion: (
    artifact: PlannerPlanArtifact,
    questionId: string,
    answer: AnswerPlannerDecisionQuestionInput["answer"],
  ) => void | Promise<void>;
  onRetryPlannerFinalization: (artifact: PlannerPlanArtifact) => void | Promise<void>;
}) {
  const workflowLabel = plannerWorkflowStateLabel(artifact);
  const isFinalizing = artifact.workflowState === "finalizing" || artifact.finalizationAttempt?.status === "running";
  const finalizationFailed = artifact.workflowState === "failed" || artifact.finalizationAttempt?.status === "failed";
  const nextQuestion = isFinalizing ? undefined : plannerNextDecisionQuestion(artifact);
  const [customAnswer, setCustomAnswer] = useState("");
  const answeredQuestions = artifact.decisionQuestions.filter((question) => question.answer);
  const finalizationProgressText = isFinalizing ? plannerFinalizationProgressText(runActivityLines, runStatus) : undefined;
  const canRetryFinalization = finalizationFailed && artifact.status === "ready" && plannerRequiredDecisionQuestionsAnswered(artifact);

  useEffect(() => {
    setCustomAnswer("");
  }, [artifact.id, nextQuestion?.id]);

  async function answerOption(question: PlannerDecisionQuestion, optionId: string) {
    await onAnswerPlannerDecisionQuestion(artifact, question.id, { kind: "option", optionId });
  }

  async function answerCustom(question: PlannerDecisionQuestion) {
    const text = customAnswer.trim();
    if (!text) return;
    await onAnswerPlannerDecisionQuestion(artifact, question.id, { kind: "custom", customText: text });
    setCustomAnswer("");
  }

  return (
    <section className="planner-decisions" aria-label="Planner decisions">
      <div className="planner-decisions-header">
        <div>
          <div className="planner-decisions-title">Planner decisions</div>
          <div className="planner-decisions-subtitle">
            {plannerDecisionAnswerStatusLabel(artifact)} · {workflowLabel}
          </div>
        </div>
        {isFinalizing ? (
          <span className="planner-decision-complete" role="status" aria-live="polite">
            <RefreshCw size={13} className="spin" />
            Finalizing
          </span>
        ) : finalizationFailed ? (
          <span className="planner-decision-failed">
            <AlertCircle size={13} />
            Failed
          </span>
        ) : plannerDecisionQuestionsComplete(artifact) ? (
          <span className="planner-decision-complete">
            <Check size={13} />
            Complete
          </span>
        ) : null}
      </div>

      {nextQuestion ? (
        <div className="planner-decision-question">
          <div className="planner-decision-question-text">
            {nextQuestion.question}
            {nextQuestion.required && <span className="planner-decision-required">Required</span>}
          </div>
          <div className="planner-decision-options">
            {plannerSortedOptions(nextQuestion).map((option) => (
              <button
                key={option.id}
                type="button"
                className="planner-decision-option"
                onClick={() => void answerOption(nextQuestion, option.id)}
              >
                <span className="planner-decision-option-topline">
                  <span>{option.label}</span>
                  {option.id === nextQuestion.recommendedOptionId && <span className="planner-decision-recommended">Recommended</span>}
                </span>
                <span className="planner-decision-option-description">{option.description}</span>
              </button>
            ))}
          </div>
          <div className="planner-decision-custom">
            <textarea
              value={customAnswer}
              onChange={(event) => setCustomAnswer(event.target.value)}
              placeholder="Custom answer"
              rows={2}
            />
            <button type="button" disabled={!customAnswer.trim()} onClick={() => void answerCustom(nextQuestion)}>
              <MessageCircle size={14} />
              Use custom
            </button>
          </div>
        </div>
      ) : (
        <div className="planner-decision-summary">
          {answeredQuestions.map((question) => (
            <div key={question.id} className="planner-decision-summary-row">
              <span>{question.question}</span>
              <strong>{plannerDecisionAnswerText(question)}</strong>
            </div>
          ))}
        </div>
      )}

      {answeredQuestions.length > 0 && nextQuestion && (
        <div className="planner-decision-answered">
          {answeredQuestions.map((question) => (
            <div key={question.id}>
              <Check size={13} />
              <span>{plannerDecisionAnswerText(question)}</span>
            </div>
          ))}
        </div>
      )}

      {finalizationProgressText && (
        <div className="planner-decision-progress" role="status" aria-live="polite">
          <LoaderCircle size={14} className="spin" />
          <span>{finalizationProgressText}</span>
        </div>
      )}

      {canRetryFinalization && (
        <div className="planner-decision-failure">
          <AlertCircle size={14} />
          <span>Plan finalization did not complete.</span>
          <button type="button" onClick={() => void onRetryPlannerFinalization(artifact)}>
            <RotateCcw size={14} />
            Retry finalization
          </button>
        </div>
      )}

      {answeredQuestions.length > 0 && (
        <p className="planner-decision-action-note">
          Use the message actions above to refine the plan with additional feedback or start implementation.
        </p>
      )}
    </section>
  );
}

export function plannerFinalizationProgressText(lines: RunActivityLine[], status: RunStatus): string {
  const latest = [...lines].reverse().find((line) => line.text.trim());
  if (latest) return latest.text;
  if (status === "starting") return "Starting the planner Pi session.";
  if (status === "retrying") return "Retrying planner finalization.";
  if (status === "streaming") return "Waiting for Ambient to finalize the plan.";
  if (status === "tool") return "Ambient is checking context for the plan.";
  return "Plan finalization is queued.";
}

export function MessageContextList({ attachments }: { attachments: WorkspaceContextReference[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="message-context-list" aria-label="Attached context">
      {attachments.map((item) => (
        <span key={contextAttachmentKey(item)} title={item.path}>
          {item.kind === "directory" ? <FolderOpen size={12} /> : <FileText size={12} />}
          {item.path}
        </span>
      ))}
    </div>
  );
}

export function MessageDiagnosticCard({
  model,
  copied = false,
  onCopy,
  onDismiss,
}: {
  model: NonNullable<ReturnType<typeof messageDiagnosticCardModel>>;
  copied?: boolean;
  onCopy?: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className={`message-diagnostic-card ${model.tone}`} aria-label={model.title}>
      <div className="message-diagnostic-card-header">
        <div>
          <strong>{model.title}</strong>
          <span>{model.summary}</span>
        </div>
        <div className="message-diagnostic-actions">
          {onCopy ? (
            <button
              type="button"
              className="message-diagnostic-action"
              aria-label={copied ? `Copied ${model.title}` : `Copy ${model.title}`}
              title={copied ? "Copied" : "Copy"}
              onClick={onCopy}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          ) : null}
          {model.dismissible ? (
            <button type="button" className="message-diagnostic-action" aria-label={`Dismiss ${model.title}`} title="Dismiss" onClick={onDismiss}>
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>
      {model.details.trim() ? (
        <details className="message-diagnostic-details">
          <summary>Details</summary>
          <pre>{model.details}</pre>
        </details>
      ) : null}
    </section>
  );
}

export function messageStatus(message: ChatMessage): string | undefined {
  return typeof message.metadata?.status === "string" ? message.metadata.status : undefined;
}

export function visibleMessages(messages: ChatMessage[], _running: boolean, thinkingDisplayMode: ThinkingDisplayMode): ChatMessage[] {
  return visibleMessagesForThinkingDisplay(messages, thinkingDisplayMode);
}

export function retryableFailedPromptIds(messages: ChatMessage[]): Set<string> {
  const visible = messages.filter((message) => message.role !== "tool" && !isThinkingMessage(message));
  const latest = visible.at(-1);
  if (!latest || latest.role !== "assistant" || messageStatus(latest) !== "error") return new Set();
  if (assistantErrorBlocksWholePromptReplay(latest)) return new Set();
  const latestIndex = messages.findIndex((message) => message.id === latest.id);
  const user = messages
    .slice(0, latestIndex)
    .reverse()
    .find((message) => message.role === "user" && !isHiddenTranscriptMessage(message) && message.content.trim());
  return user ? new Set([user.id]) : new Set();
}

function assistantErrorBlocksWholePromptReplay(message: ChatMessage): boolean {
  const diagnostic = providerInterruptionDiagnosticMetadata(message);
  if (!diagnostic) return false;
  if (diagnostic.retryScheduled === true || diagnostic.replaySafe === true) return false;
  const interruptedToolCalls = Array.isArray(diagnostic.interruptedToolCalls) ? diagnostic.interruptedToolCalls.length : 0;
  return diagnostic.toolCallSeen === true ||
    positiveNumber(diagnostic.toolMessageCount) ||
    positiveNumber(diagnostic.completedToolMessageCount) ||
    interruptedToolCalls > 0;
}

function providerInterruptionDiagnosticMetadata(message: ChatMessage): Record<string, unknown> | undefined {
  const metadata = message.metadata?.piStreamInterruption ?? message.metadata?.piStreamTimeout;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : undefined;
}

function positiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function countTextMatches(text: string, query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  let count = 0;
  const haystack = text.toLowerCase();
  let cursor = haystack.indexOf(needle);
  while (cursor !== -1) {
    count += 1;
    cursor = haystack.indexOf(needle, cursor + needle.length);
  }
  return count;
}

export function messageIsStreaming(message: ChatMessage, messages: ChatMessage[], running: boolean): boolean {
  if (!running) return false;
  if (isThinkingMessage(message)) return messageStatus(message) === "thinking";
  if (message.role === "assistant" && messageStatus(message) === "streaming") return true;
  return message.id === streamingAssistantMessageId(messages, running);
}

export function messageIsStreamingForRender(message: ChatMessage, running: boolean, streamingAssistantId?: string): boolean {
  if (!running) return false;
  if (isThinkingMessage(message)) return messageStatus(message) === "thinking";
  if (message.role === "assistant" && messageStatus(message) === "streaming") return true;
  return message.id === streamingAssistantId;
}

export function streamingAssistantMessageId(messages: ChatMessage[], running: boolean): string | undefined {
  if (!running) return undefined;
  return [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && !isThinkingMessage(message) && !message.content.trim())?.id;
}

export function isGoalCompletionMessage(message: ChatMessage): boolean {
  return message.metadata?.kind === GOAL_COMPLETION_MESSAGE_KIND;
}

export function isThinkingMessage(message: ChatMessage): boolean {
  return isThinkingMessageForDisplay(message);
}

export function messageKindForActivity(message: ChatMessage): "assistant" | "thinking" | "tool" | "user" {
  if (isThinkingMessage(message)) return "thinking";
  if (message.role === "tool") return "tool";
  if (message.role === "assistant") return "assistant";
  return "user";
}

export function renderableMessageContent(message: ChatMessage): string {
  return message.content.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

export function messageStreamingPlaceholder(message: ChatMessage, runActivityLines: RunActivityLine[], runStatus: RunStatus): string {
  if (isThinkingMessage(message)) return "Receiving Ambient reasoning";
  const latest = [...runActivityLines].reverse().find((line) => line.kind !== "heartbeat");
  if (latest) return conciseStreamingActivityText(latest.text);
  if (runStatus === "retrying") return "Retrying provider request";
  if (runStatus === "tool") return "Preparing tool call";
  if (runStatus === "streaming") return "Connected; waiting for visible text";
  if (runStatus === "starting") return "Waiting for Ambient response";
  return "Waiting for Ambient";
}

export function conciseStreamingActivityText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (!normalized) return "Waiting for Ambient";
  if (/^Streaming response: 0 output chars\b/i.test(normalized)) return "Connected; waiting for visible text";
  if (/^Streaming response:/i.test(normalized)) return "Streaming response text";
  if (/^Ambient response channel opened/i.test(normalized)) return "Ambient connected; waiting for visible text";
  return normalized.length > 120 ? `${normalized.slice(0, 117).trimEnd()}...` : normalized;
}

export function messageMetaLabel(message: ChatMessage): string | undefined {
  const status = message.metadata?.status;
  const delivery = message.metadata?.delivery;
  if (message.role === "user" && status === "queued") {
    return delivery === "follow-up" ? "Queued follow-up" : "Queued steer";
  }
  if (message.role === "user" && status === "sent" && delivery) {
    return delivery === "follow-up" ? "Follow-up sent" : "Steer sent";
  }
  if (message.role === "user" && status === "aborted" && delivery) return "Queue aborted";
  if (message.role === "user" && status === "error" && delivery) return "Queue failed";
  if (message.metadata?.awaitingInputAfterTools === true || status === "awaiting-input") return "Awaiting input";
  if (status === "interrupted") return "Interrupted";
  if (status === "aborted") return "Stopped";
  return undefined;
}

export function contextReferencesFromMetadata(value: unknown): WorkspaceContextReference[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): WorkspaceContextReference | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      if (typeof record.path !== "string" || typeof record.name !== "string") return undefined;
      if (record.kind !== "file" && record.kind !== "directory") return undefined;
      return {
        path: record.path,
        name: record.name,
        kind: record.kind,
        ...(typeof record.size === "number" ? { size: record.size } : {}),
        ...(record.absolute === true ? { absolute: true } : {}),
      };
    })
    .filter((item): item is WorkspaceContextReference => Boolean(item));
}

export function isSessionContextMissingError(message: string | undefined): boolean {
  if (!message) return false;
  return /model context is not available for this chat/i.test(message) && /pi session file is (missing|unreadable|missing or unreadable)/i.test(message);
}

export function SessionContextRecoveryInlineActions({
  busy,
  canRetry,
  onRecover,
  onRecoverAndRetry,
  onDuplicate,
}: {
  busy: boolean;
  canRetry: boolean;
  onRecover?: () => void | Promise<void>;
  onRecoverAndRetry?: () => void | Promise<void>;
  onDuplicate?: () => void | Promise<void>;
}) {
  return (
    <div className="session-context-recovery-inline" role="group" aria-label="Chat context recovery actions">
      <div>
        <AlertCircle size={14} aria-hidden="true" />
        <span>The visible transcript can be used to recover this chat.</span>
      </div>
      <SessionContextRecoveryButtons
        busy={busy}
        disabled={false}
        canRetry={canRetry}
        onRecover={() => void onRecover?.()}
        onRecoverAndRetry={() => void onRecoverAndRetry?.()}
        onDuplicate={() => void onDuplicate?.()}
      />
    </div>
  );
}

export function SessionContextRecoveryButtons({
  busy,
  disabled,
  canRetry,
  onRecover,
  onRecoverAndRetry,
  onDuplicate,
}: {
  busy: boolean;
  disabled: boolean;
  canRetry: boolean;
  onRecover: () => void;
  onRecoverAndRetry: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="session-context-recovery-actions">
      <button type="button" disabled={disabled || busy} onClick={onRecover}>
        {busy ? "Rebuilding..." : "Rebuild context"}
      </button>
      <button type="button" disabled={disabled || busy || !canRetry} onClick={onRecoverAndRetry}>
        Rebuild and retry
      </button>
      <button type="button" disabled={disabled} onClick={onDuplicate}>
        Duplicate chat
      </button>
    </div>
  );
}
