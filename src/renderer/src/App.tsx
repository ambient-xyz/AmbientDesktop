import {
  AlertCircle,
  Bell,
  BookOpenText,
  Bot,
  Brain,
  CalendarPlus,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Command,
  Copy,
  Film,
  FileCode2,
  FileImage,
  Folder,
  FolderPlus,
  FolderOpen,
  GitBranch,
  Home,
  Info,
  Kanban,
  KeyRound,
  ListFilter,
  Maximize2,
  Minimize2,
  Mic,
  Monitor,
  Moon,
  Music,
  PanelLeft,
  PanelRight,
  Paperclip,
  Pin,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  SquarePen,
  Star,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { Background, BaseEdge, Controls, EdgeLabelRenderer, getBezierPath, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type EdgeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  FormEvent,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  memo,
  MouseEvent as ReactMouseEvent,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import { resolveLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";
import {
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
  projectBoardSynthesisRunControlState,
  projectBoardTabs,
  projectBoardTestSummaryForBoard,
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
  messageVoiceStripModel,
  voiceSettingsAuditRows,
  voiceSettingsProviderModel,
} from "./voiceUiModel";
import {
  projectBoardKickoffAnswerState,
  projectBoardRunBlocksPlanning,
  projectBoardRunIsKickoffDefaults,
} from "../../shared/projectBoardSynthesisGate";
import {
  queuedSpeechFollowUpCount,
  sttProviderForCapabilityId,
  sttQueuedCountLabel,
  sttRuntimeQueuedCount,
  sttSettingsProviderModel,
  sttDiagnosticsModel,
  type SttDraftMetadataState,
} from "./sttUiModel";
import {
  miniCpmVisionSetupActions,
} from "./miniCpmVisionUiModel";
import {
  localDeepResearchInstallProgressModel,
  localDeepResearchSetupActions,
  type LocalDeepResearchDiagnosticItem,
} from "./localDeepResearchUiModel";
import {
  shortcutFromKeyboardEvent,
  sttShortcutLabel,
} from "./sttShortcut";
import type { SttMicrophoneDevice, SttMicrophoneRecorder, SttTrailingSilenceState } from "./sttMicrophoneRecorder";
import { parseMarkdownBlocks } from "./markdownBlockParser";
import { richMarkdownTableIconLabel, type RichMarkdownIconLabel } from "./richMarkdownIcons";
import { canRefreshOfficePreview } from "./workspaceUiModel";
import {
  type WorkspaceProjectAliases,
} from "./workspaceEventMatching";
import { createAppDesktopEventGuards } from "./AppDesktopEventGuards";
import { createAppDesktopStateAppliers } from "./AppDesktopStateAppliers";
import { createAppProjectThreadActions } from "./AppProjectThreadActions";
import { createAppWorkspaceNavigationControls } from "./AppWorkspaceNavigationControls";
import {
  miniCpmVisualAnalyzeInputForBrowserScreenshot,
  miniCpmVisualAnalyzeInputForContextAttachment,
  miniCpmVisualAnalyzeInputForWorkspaceFile,
  miniCpmVisualMediaKindFromPath,
} from "./miniCpmVisualActionUiModel";
import { miniCpmRemoteEndpointReviewChecklistText } from "../../shared/miniCpmRemoteEndpointSecurity";
import type { AgentMemoryEmbeddingLifecycleActionKind, AgentMemoryEmbeddingLifecycleActionResult, AgentMemoryStorageDiagnostics } from "../../shared/agentMemoryDiagnostics";
import type { AutomationFolderSummary, AutomationScheduleExceptionSummary, AutomationScheduleSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type { BrowserCredentialSummary, BrowserPickResult, BrowserProfileMode, BrowserRuntimeKind, BrowserScreenshotResult, BrowserUserActionState, SaveBrowserCredentialInput } from "../../shared/browserTypes";
import type { DesktopEvent, DesktopState, DesktopUpdateState, MenuCommand, ThemePreference, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { LocalDeepResearchEffort, LocalDeepResearchInstallProgress, LocalDeepResearchRunBudget, MiniCpmVisionAnalysisResult, MiniCpmVisionAnalyzeInput, SttProviderCandidate, SttProviderSetupResult, VoiceArtifactRetentionSummary, VoiceProviderCandidate, VoiceProviderVoiceCandidate } from "../../shared/localRuntimeTypes";
import type { AmbientPermissionGrant, CreateAmbientPermissionGrantInput, PermissionAuditEntry, PermissionMode, PermissionPromptResponseMode, PermissionRequest, PrivilegedCredentialRequest, SecureInputRequest } from "../../shared/permissionTypes";
import type { AmbientGeneratedCapabilitySummary, AmbientMcpContainerRuntimeManagedInstallProgress, AmbientMcpContainerRuntimeStatus, AmbientMcpDefaultCapabilityInstallProgress, AmbientMcpInstalledServerSummary, AmbientMcpInstallPreview, AmbientMcpServerSearchResult, AmbientPluginAuthAccountSummary, AmbientPluginAuthStartResult, AmbientPluginCapabilityDiagnostics, AmbientPluginRegistry, AmbientPluginRuntime, AmbientPluginSourceKind, CapabilityBuilderHistoryEntry, CapabilityBuilderHistoryResult, CodexHostedMarketplaceReport, CodexMarketplaceSourceSummary, CodexPluginCatalog, CodexPluginCompatibilityTier, CodexPluginMcpInspectionCatalog, CodexPluginSummary, FirstPartyGoogleIntegrationState, ManagedDevServerSummary, PiExtensionSandboxCatalog, PiExtensionSandboxInstallPreview, PiExtensionSandboxPackageSummary, PiPackageCatalog, PiPackageInstallScope, PiPackageResourceKind, PiPrivilegedCatalog, PiPrivilegedInstallSummary, PiPrivilegedSecurityScan, PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";
import type { AddProjectBoardCardRunFeedbackInput, ApplyProjectBoardDecisionImpactFeedbackInput, ApplyProjectBoardSourceImpactFeedbackInput, AttachProjectBoardLocalTaskMode, CopyProjectBoardSessionToThreadInput, CreateReadyProjectBoardTasksInput, DeferProjectBoardSynthesisSectionsInput, ProjectBoardAddCardsObjectiveProvenance, ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectBoardCardRunFeedbackSource, ProjectBoardEvent, ProjectBoardExecutionArtifact, ProjectBoardGitProjectionResolution, ProjectBoardGitSyncStatus, ProjectBoardProofDecisionAction, ProjectBoardQuestion, ProjectBoardSource, ProjectBoardSourceChangeState, ProjectBoardSourceKind, ProjectBoardSplitDecisionAction, ProjectBoardSummary, ProjectBoardSynthesisProposal, ProjectBoardSynthesisProposalCardReviewStatus, ProjectBoardSynthesisRun, ProjectBoardSynthesisRunProgressiveRecord, ProjectSummary, RecomputeProjectBoardProofCoverageInput, RefineProjectBoardSynthesisInput, RefreshProjectBoardDecisionDraftsInput, RefreshProjectBoardSourceDraftsInput, RegenerateProjectBoardDecisionDraftsInput, RegenerateProjectBoardSourceDraftsInput, RerunProjectBoardProofInput, ResolveProjectBoardCardPiUpdateInput, ResolveProjectBoardDeliverableIntegrationInput, RetryProjectBoardSynthesisInput, SplitProjectBoardCardInput, SuggestProjectBoardClarificationDefaultsInput, SuggestProjectBoardKickoffDefaultsInput, SuggestProjectBoardProofInput, UpdateProjectBoardCardInput, UpdateProjectBoardSourceInput } from "../../shared/projectBoardTypes";
import type { SlashCommandCatalogEntry, SlashCommandSelection } from "../../shared/slashCommandTypes";
import type { SubagentParentMailboxEventSummary, SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { TerminalSession } from "../../shared/terminalTypes";
import type { ChatMessage, MessageDelivery, RunStatus, RuntimeActivity, ThinkingLevel, ThreadSummary, ToolLargeOutputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import type { OrchestrationAutoDispatchStatus, OrchestrationBoard, OrchestrationPrepareResult, OrchestrationRun, OrchestrationTask, RepairOrchestrationWorkflowAction, ResolveOrchestrationWorkflowImpactAction, UpdateOrchestrationWorkflowRawInput, UpdateOrchestrationWorkflowSettingsInput, WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowCompileAuditSummary, WorkflowCompileProgress, WorkflowConnectorDataRetention, WorkflowConnectorManifestGrant, WorkflowDashboard, WorkflowDiscoveryAccessRequest, WorkflowDiscoveryProgress, WorkflowExplorationProgress, WorkflowExplorationTraceSummary, WorkflowGraphNode, WorkflowLabRun, WorkflowModelCallRecord, WorkflowPluginCapabilityGrant, WorkflowRecordingState, WorkflowRecoveryAction, WorkflowRevisionSummary, WorkflowRunDetail, WorkflowRunEvent, WorkflowRunLimitOverrides, WorkflowRunSummary, WorkflowUserInputResponse, WorkflowVersionSummary } from "../../shared/workflowTypes";
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
import {
  sttMessageArtifactEntries,
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
  workflowRecorderInjectedPlaybookChip,
  workflowRecorderLibrarySidebarRows,
  workflowRecorderStartActionState,
  workflowRecorderSurfaceModel,
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
import { applyDocumentAppearance } from "./appearance";
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  readInitialSidebarWidth,
} from "./sidebarLayout";
import {
  buildCapabilityBuilderPrompt,
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
  welcomeOnboardingPageKindForMessages,
} from "./welcomeSetupUiModel";
import { googleWorkspaceGrantReview } from "./googleWorkspaceGrantUiModel";
import { permissionGrantRegistryModel, workflowPermissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import {
  artifactMediaKindFromPath,
  mediaPreviewUnavailableMessage,
  parseToolMessage,
  resolveInlineArtifactPath,
  toolLargeOutputPreviewViewModel,
  toolLongformInputPreviewDisplaySummary,
  toolMessagingConversationDirectorySetupCardViewModel,
  toolMessagingRemoteSurfaceActivationCardViewModel,
  type ArtifactMediaKind,
  type ToolEditPreviewData,
  type ToolInstallRoutePreviewData,
  type ToolMessagingConversationDirectorySetupPreviewData,
  type ToolMessagingRemoteSurfaceActivationPreviewData,
  type ToolSttPreviewData,
  type ToolTelegramSessionSetupPreviewData,
  type ToolVoicePreviewData,
} from "./toolMessageUiModel";
import {
  messageContentWithoutDiagnostic,
  messageDiagnosticCardModel,
} from "./messageDiagnosticUiModel";
import {
  type TransientErrorScope,
} from "./transientErrorUiModel";
import {
  thinkingDisplayModeLabel,
  thinkingLevelLabel,
  thinkingOptions,
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
  desktopUpdateStatusText,
  HTML_PREVIEW_AUTO_PAUSE_MS,
  formatHtmlPreviewAutoPauseLabel,
  PermissionFullAccessReceiptList,
  DiffOutput,
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
  formatOrchestrationRunStatus,
  formatRunDuration,
  ProofEvidencePathLink,
  ProofOfWorkPreview,
  RunTimeline,
  useRunningClock,
  workflowRecorderSurface
} from "./AutomationsWorkspace";
import {
  type AmbientCliSecretDialogState,
  type CommandPaletteItem,
  DesktopUpdateNotice,
  PermissionFullAccessNote,
} from "./AppDialogs";
import {
  type PlannerRevisionDialogState,
  type ProjectActionDialogState,
  type ProjectBoardResetDialogState,
  type ProjectContextMenuState,
  SidebarMenuDivider,
  SidebarMenuItem,
  SidebarMenuLabel,
  type ThreadActionDialogState,
  type ThreadContextMenuState,
} from "./AppActionDialogs";
import {
  AppModalHost,
  type SubagentApprovalDecisionDialogState,
  type SubagentBarrierDecisionDialogState,
} from "./AppModalHost";
import { createAppModalHostProps } from "./AppModalHostProps";
import { AppRightPanelHost } from "./AppRightPanelHost";
import {
  AppShellSidebar,
  type SidebarArea,
} from "./AppShellSidebar";
import { createAppSidebarAreaControls } from "./AppSidebarAreaControls";
import {
  createAppAutomationSelectionControls,
} from "./AppAutomationSelectionControls";
import { createAppAutomationsWorkspaceProps } from "./AppAutomationsWorkspaceProps";
import {
  type AutomationPopover,
  type ProjectPopover,
  type SidebarOrganizeSettings,
} from "./AppSidebar";
import { useAppSidebarSelectionModel } from "./AppSidebarSelectionModel";
import {
  useAppSidebarLifecycleEffects,
} from "./AppSidebarLifecycleEffects";
import {
  EMPTY_RUN_ACTIVITY_LINES,
  formatRuntimeActivity,
  runRetryStatsFromActivity,
  useAppRunActivityControls,
  type RunRetryStats,
  type RunActivityLine,
} from "./AppRunActivity";
import {
  chatBrowserUserActionForThread,
} from "./AppChatChrome";
import { useAppShellGlobalEffects } from "./AppShellGlobalEffects";
import {
  beginAppRightPanelResize,
  beginAppSidebarResize,
  beginAppWorkflowRecorderReviewResize,
} from "./AppShellResize";
import { useAppStatusSubscriptions } from "./AppStatusSubscriptions";
import { AppWorkspaceRouter } from "./AppWorkspaceRouter";
import {
  type MediaPreviewModalRequest,
} from "./AppToolMessages";
import {
  isGoalCompletionMessage,
  messageKindForActivity,
} from "./AppMessages";
import {
  pendingSubmittedPromptHasPersistedMatch,
  useAppConversationDisplayModel,
  type PendingSubmittedPrompt,
} from "./AppConversationDisplayModel";
import { createAppConversationMessagesProps } from "./AppConversationMessagesProps";
import { useAppChatFindControls } from "./AppChatFindControls";
import { useAppVoiceThreadControls } from "./AppVoiceThreadControls";
import { useAppWorkflowRecordingLibraryControls } from "./AppWorkflowRecordingLibraryControls";
import { createAppWorkflowRecordingActions } from "./AppWorkflowRecordingActions";
import { createAppWorkflowRecordingPlaybookActions } from "./AppWorkflowRecordingPlaybookActions";
import { useAppWorkflowRecordingReviewControls } from "./AppWorkflowRecordingReviewControls";
import { createAppAutomationFolderControls } from "./AppAutomationFolderControls";
import { createAppBrowserActionControls } from "./AppBrowserActionControls";
import { createAppSettingsActions } from "./AppSettingsActions";
import { createAppGitActions } from "./AppGitActions";
import { createAppThreadMaintenanceActions } from "./AppThreadMaintenanceActions";
import { createAppProjectBoardActions } from "./AppProjectBoardActions";
import { useAppProjectBoardShellControls } from "./AppProjectBoardShellControls";
import { createAppProjectBoardWorkspaceProps } from "./AppProjectBoardWorkspaceProps";
import {
  createAppPermissionActions,
  selectActivePermissionRequest,
} from "./AppPermissionActions";
import { createAppSpeechProviderActions } from "./AppSpeechProviderActions";
import { createAppSttMicrophoneActions } from "./AppSttMicrophoneActions";
import { createAppSttComposerActions } from "./AppSttComposerActions";
import {
  createAppComposerSubmitActions,
  type PendingWorkflowRecordingEditContext,
} from "./AppComposerSubmitActions";
import { activeThreadHasRunningLocalDeepResearch } from "./AppLocalDeepResearchRunState";
import { createAppComposerRetryActions } from "./AppComposerRetryActions";
import { createAppMessageVoiceActions } from "./AppMessageVoiceActions";
import { createAppPromptHistoryControls } from "./AppPromptHistoryControls";
import { createAppContextAttachmentActions } from "./AppContextAttachmentActions";
import { useAppSubagentShellControls } from "./AppSubagentShellControls";
import {
  GOAL_COMPLETION_CELEBRATION_MS,
  runtimeActivityVisibleForThreadGoal,
} from "./AppGoalControls";
import { createAppGoalActions } from "./AppGoalActions";
import { AppTopbar } from "./AppTopbar";
import { createAppRightPanelControls } from "./AppRightPanelControls";
import {
  createComposerDraftStore,
  type ChatComposerInputHandle,
} from "./AppComposerControls";
import { useAppComposerModelPickerControls } from "./AppComposerModelPickerControls";
import {
  type SttComposerUiState,
} from "./AppComposerShell";
import { useAppWorkspaceProjectModel } from "./AppWorkspaceProjectModel";
import { createAppCommandPaletteItems } from "./AppCommandPaletteModel";
import { useAppMessageScrollControls } from "./AppMessageScrollControls";
import {
  rememberAppDesktopStateRefs,
  useAppThreadLifecycleEffects,
  type AppMessageActivityKind,
} from "./AppThreadLifecycleEffects";
import { useAppSttLifecycleEffects } from "./AppSttLifecycleEffects";
import {
  appBootstrapRunStatus,
  useAppStartupLifecycleEffects,
} from "./AppStartupLifecycleEffects";
import {
  localDeepResearchInstallProgressState,
  localDeepResearchSetupResultState,
  useAppLocalDeepResearchLifecycle,
} from "./AppLocalDeepResearchLifecycle";
import {
  slashCommandComposerCanSubmit,
  slashCommandDraftAfterSelection,
  slashCommandSelectionFromEntry,
} from "./slashCommandUiModel";
import {
  useAppComposerModeThreadLifecycleEffects,
  useAppLocalDeepResearchReadinessLifecycleEffect,
  useAppSpeechProviderLifecycleEffects,
  useAppUnmountCleanupLifecycleEffect,
  useAppWelcomePluginRegistryLifecycleEffect,
} from "./AppShellLifecycleEffects";
import {
  coalesceWorkflowCompileProgress,
} from "./AppWorkflowRecording";
import { createAppCredentialDialogActions } from "./AppCredentialDialogActions";
import {
  STATE_REDUCER_DESKTOP_EVENT_TYPES,
  upsertSortedDesktopEventItem,
} from "./AppDesktopEvents";
import {
  applyChildThreadMessageDelta,
  upsertChildThreadMessage,
} from "./subagentChildMessagesState";
import {
  type SymphonyWorkflowBuilderDraft,
} from "./symphonyWorkflowBuilderUiModel";
import { createAppSymphonyBuilderControls } from "./AppSymphonyBuilderControls";
import { createAppCapabilityPromptActions } from "./AppCapabilityPromptActions";
import { createAppPlannerActions } from "./AppPlannerActions";
import { createAppLocalRuntimeActions } from "./AppLocalRuntimeActions";
import { createAppSubagentParentClusterActions } from "./AppSubagentParentClusterActions";

function toolEventActivityMessage(details: unknown): string | undefined {
  const record = details && typeof details === "object" && !Array.isArray(details) ? details as Record<string, unknown> : undefined;
  const direct = typeof record?.activityMessage === "string" && record.activityMessage.trim() ? record.activityMessage.trim() : undefined;
  if (direct) return direct;
  const status = record?.localDeepResearchStatus && typeof record.localDeepResearchStatus === "object" && !Array.isArray(record.localDeepResearchStatus)
    ? record.localDeepResearchStatus as Record<string, unknown>
    : undefined;
  for (const key of ["activityMessage", "message"]) {
    const value = status?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function App() {
  const [state, setState] = useState<DesktopState | undefined>();
  const [composerCanSubmit, setComposerCanSubmit] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [threadRunStatuses, setThreadRunStatuses] = useState<Record<string, RunStatus>>({});
  const [activity, setActivity] = useState<RuntimeActivity | undefined>();
  const [abortArmed, setAbortArmed] = useState(false);
  const [retryStatsByThread, setRetryStatsByThread] = useState<Record<string, RunRetryStats>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialSidebarWidth);
  const [sidebarArea, setSidebarArea] = useState<SidebarArea>("projects");
  const [rightPanel, setRightPanel] = useState<UtilityPanel | undefined>();
  const [rightPanelWidth, setRightPanelWidth] = useState(520);
  const [workflowRecorderReviewPanelWidth, setWorkflowRecorderReviewPanelWidth] = useState(420);
  const [settingsFocusRequest, setSettingsFocusRequest] = useState<SettingsFocusRequest | undefined>();
  const [searchRoutingHydrating, setSearchRoutingHydrating] = useState(false);
  const [searchRoutingHydrationError, setSearchRoutingHydrationError] = useState<string | undefined>();
  const [agentMemoryDiagnostics, setAgentMemoryDiagnostics] = useState<AgentMemoryStorageDiagnostics | undefined>();
  const [agentMemoryDiagnosticsLoading, setAgentMemoryDiagnosticsLoading] = useState(false);
  const [agentMemoryDiagnosticsError, setAgentMemoryDiagnosticsError] = useState<string | undefined>();
  const [agentMemoryEmbeddingActionLoading, setAgentMemoryEmbeddingActionLoading] = useState<AgentMemoryEmbeddingLifecycleActionKind | undefined>();
  const [agentMemoryEmbeddingActionResult, setAgentMemoryEmbeddingActionResult] = useState<AgentMemoryEmbeddingLifecycleActionResult | undefined>();
  const [agentMemoryEmbeddingActionError, setAgentMemoryEmbeddingActionError] = useState<string | undefined>();
  const [artifactPreviewRequest, setArtifactPreviewRequest] = useState<ArtifactPreviewRequest | undefined>();
  const [localFilePreviewRequest, setLocalFilePreviewRequest] = useState<ArtifactPreviewRequest | undefined>();
  const [mediaPreviewModal, setMediaPreviewModal] = useState<MediaPreviewModalRequest | undefined>();
  const [gitPanelTabRequest, setGitPanelTabRequest] = useState<GitPanelTabRequest>({ tab: "summary", nonce: 0 });
  const {
    togglePanel,
    openPanel,
    openVoiceSettingsFromStatus,
    openMcpRuntimeSettings,
    openSearchWebSettings,
    openGitSummaryPanel,
    previewArtifact,
    previewLocalFile,
  } = createAppRightPanelControls({
    setRightPanel,
    setSettingsFocusRequest,
    setArtifactPreviewRequest,
    setLocalFilePreviewRequest,
    setGitPanelTabRequest,
  });
  const [runActivityLinesByThread, setRunActivityLinesByThread] = useState<Record<string, RunActivityLine[]>>({});
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus | undefined>();
  const [gitStatusError, setGitStatusError] = useState<string | undefined>();
  const [activeGitReview, setActiveGitReview] = useState<GitReviewSummary | undefined>();
  const [activeGitReviewError, setActiveGitReviewError] = useState<string | undefined>();
  const [gitConfirmation, setGitConfirmation] = useState<GitConfirmation | undefined>();
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [privilegedCredentialRequests, setPrivilegedCredentialRequests] = useState<PrivilegedCredentialRequest[]>([]);
  const [secureInputRequests, setSecureInputRequests] = useState<SecureInputRequest[]>([]);
  const [permissionAuditRevision, setPermissionAuditRevision] = useState(0);
  const [permissionAudit, setPermissionAudit] = useState<PermissionAuditEntry[]>([]);
  const [permissionGrants, setPermissionGrants] = useState<AmbientPermissionGrant[]>([]);
  const [permissionAuditError, setPermissionAuditError] = useState<string | undefined>();
  const [permissionGrantError, setPermissionGrantError] = useState<string | undefined>();
  const [permissionGrantRevoking, setPermissionGrantRevoking] = useState<string | undefined>();
  const [pluginCatalogRevision, setPluginCatalogRevision] = useState(0);
  const [welcomeAmbientPluginRegistry, setWelcomeAmbientPluginRegistry] = useState<AmbientPluginRegistry | undefined>();
  const [browserRevision, setBrowserRevision] = useState(0);
  const [chatBrowserUserAction, setChatBrowserUserAction] = useState<BrowserUserActionState | undefined>();
  const [chatBrowserUserActionBusy, setChatBrowserUserActionBusy] = useState<"resume" | "cancel" | undefined>();
  const [voiceProviders, setVoiceProviders] = useState<VoiceProviderCandidate[]>([]);
  const [voiceProvidersLoading, setVoiceProvidersLoading] = useState(false);
  const [voiceProvidersError, setVoiceProvidersError] = useState<string | undefined>();
  const [voiceProviderCacheStatus, setVoiceProviderCacheStatus] = useState<VoiceProviderCacheStatus>({ providerCount: 0 });
  const [voiceProviderCacheActivity, setVoiceProviderCacheActivity] = useState<VoiceProviderCacheActivity[]>([]);
  const [voiceCatalogRefresh, setVoiceCatalogRefresh] = useState<VoiceCatalogRefreshState | undefined>();
  const [sttProviders, setSttProviders] = useState<SttProviderCandidate[]>([]);
  const [sttProvidersLoading, setSttProvidersLoading] = useState(false);
  const [sttProvidersError, setSttProvidersError] = useState<string | undefined>();
  const [sttProviderCacheStatus, setSttProviderCacheStatus] = useState<SttProviderCacheStatus>({ providerCount: 0 });
  const [sttProviderCacheActivity, setSttProviderCacheActivity] = useState<SttProviderCacheActivity[]>([]);
  const [sttProviderSetup, setSttProviderSetup] = useState<SttProviderSetupUiState>({ status: "idle" });
  const [sttMicrophoneDevices, setSttMicrophoneDevices] = useState<SttMicrophoneDevice[]>([]);
  const [sttMicrophoneDevicesLoading, setSttMicrophoneDevicesLoading] = useState(false);
  const [sttMicrophoneDevicesError, setSttMicrophoneDevicesError] = useState<string | undefined>();
  const [miniCpmVisionSetup, setMiniCpmVisionSetup] = useState<MiniCpmVisionSetupUiState>({ status: "idle" });
  const [miniCpmVisionRuntimePath, setMiniCpmVisionRuntimePath] = useState("");
  const [miniCpmVisionEndpointUrl, setMiniCpmVisionEndpointUrl] = useState("");
  const [localDeepResearchSetup, setLocalDeepResearchSetup] = useState<LocalDeepResearchSetupUiState>({ status: "idle" });
  const [localDeepResearchQ8Override, setLocalDeepResearchQ8Override] = useState(false);
  const [localDeepResearchRunHistory, setLocalDeepResearchRunHistory] = useState<LocalDeepResearchRunHistoryUiState>({ status: "idle" });
  const [localDeepResearchFollowupOpen, setLocalDeepResearchFollowupOpen] = useState(false);
  const [sttMicTest, setSttMicTest] = useState<SttMicTestUiState>({ status: "idle" });
  const [sttComposer, setSttComposer] = useState<SttComposerUiState>({ status: "idle" });
  const [sttDraftMetadata, setSttDraftMetadata] = useState<SttDraftMetadataState | undefined>();
  const [orchestrationRevision, setOrchestrationRevision] = useState(0);
  const [orchestrationAutoRevision, setOrchestrationAutoRevision] = useState(0);
  const [workflowRevision, setWorkflowRevision] = useState(0);
  const [workflowCompileProgress, setWorkflowCompileProgress] = useState<WorkflowCompileProgress[]>([]);
  const [workflowDiscoveryProgress, setWorkflowDiscoveryProgress] = useState<WorkflowDiscoveryProgress | undefined>();
  const [workflowExplorationProgressByThreadId, setWorkflowExplorationProgressByThreadId] = useState<Record<string, WorkflowExplorationProgress | undefined>>({});
  const [error, setErrorState] = useState<string | undefined>();
  const [errorScope, setErrorScope] = useState<TransientErrorScope | undefined>();
  const [chatExportBusy, setChatExportBusy] = useState(false);
  const [chatExportStatus, setChatExportStatus] = useState<ApiKeyStatus | undefined>();
  const [contextRecoveryBusy, setContextRecoveryBusy] = useState(false);
  const [callableWorkflowTaskCancelBusy, setCallableWorkflowTaskCancelBusy] = useState<string | undefined>();
  const [callableWorkflowTaskPauseBusy, setCallableWorkflowTaskPauseBusy] = useState<string | undefined>();
  const [callableWorkflowTaskResumeBusy, setCallableWorkflowTaskResumeBusy] = useState<string | undefined>();
  const [subagentChildCancelBusy, setSubagentChildCancelBusy] = useState<string | undefined>();
  const [subagentChildCloseBusy, setSubagentChildCloseBusy] = useState<string | undefined>();
  const [subagentBarrierActionBusy, setSubagentBarrierActionBusy] = useState<string | undefined>();
  const [subagentBarrierDecisionDialog, setSubagentBarrierDecisionDialog] = useState<SubagentBarrierDecisionDialogState | undefined>();
  const [subagentApprovalActionBusy, setSubagentApprovalActionBusy] = useState<string | undefined>();
  const [subagentApprovalDecisionDialog, setSubagentApprovalDecisionDialog] = useState<SubagentApprovalDecisionDialogState | undefined>();
  const [contextAttachments, setContextAttachments] = useState<WorkspaceContextReference[]>([]);
  const [contextError, setContextError] = useState<string | undefined>();
  const [localDeepResearchModeArmed, setLocalDeepResearchModeArmedState] = useState(false);
  const [localDeepResearchBudgetOverride, setLocalDeepResearchBudgetOverride] = useState<Partial<Pick<LocalDeepResearchRunBudget, "effort" | "maxToolCalls" | "onExhausted">> | undefined>();
  const [symphonyBuilderDraft, setSymphonyBuilderDraft] = useState<SymphonyWorkflowBuilderDraft>({});
  const [symphonyBuilderActionBusy, setSymphonyBuilderActionBusy] = useState<"run-once" | "save-recipe" | undefined>();
  const [goalModeArmed, setGoalModeArmed] = useState(false);
  const [goalMenuOpen, setGoalMenuOpen] = useState(false);
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalCompletionCelebrationId, setGoalCompletionCelebrationId] = useState<string | undefined>();
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [clipboardCandidate, setClipboardCandidate] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | undefined>();
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [ambientCliSecretDialog, setAmbientCliSecretDialog] = useState<AmbientCliSecretDialogState | undefined>();
  const [updatePopoverOpen, setUpdatePopoverOpen] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [promptHistoryCursor, setPromptHistoryCursor] = useState<number | undefined>();
  const [draftBeforePromptHistory, setDraftBeforePromptHistory] = useState("");
  const [projectPopover, setProjectPopover] = useState<ProjectPopover | undefined>();
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState | undefined>();
  const [projectActionDialog, setProjectActionDialog] = useState<ProjectActionDialogState | undefined>();
  const [projectBoardResetDialog, setProjectBoardResetDialog] = useState<ProjectBoardResetDialogState | undefined>();
  const [plannerRevisionDialog, setPlannerRevisionDialog] = useState<PlannerRevisionDialogState | undefined>();
  const [projectBoardBusyProjectIds, setProjectBoardBusyProjectIds] = useState<Set<string>>(() => new Set());
  const [projectBoardSourceBusy, setProjectBoardSourceBusy] = useState(false);
  const [projectBoardSourceImpactBusy, setProjectBoardSourceImpactBusy] = useState(false);
  const [projectBoardKickoffDefaultsBusy, setProjectBoardKickoffDefaultsBusy] = useState(false);
  const [projectBoardRefineBusy, setProjectBoardRefineBusy] = useState(false);
  const [projectBoardRefineMode, setProjectBoardRefineMode] = useState<RefineProjectBoardSynthesisInput["mode"]>();
  const [projectBoardProposalAnswerBusy, setProjectBoardProposalAnswerBusy] = useState<string | undefined>();
  const [projectBoardProposalCardReviewBusy, setProjectBoardProposalCardReviewBusy] = useState<string | undefined>();
  const [projectBoardProposalApplyBusy, setProjectBoardProposalApplyBusy] = useState(false);
  const [projectBoardFinalizeBusy, setProjectBoardFinalizeBusy] = useState(false);
  const [projectBoardSynthesisRetryBusy, setProjectBoardSynthesisRetryBusy] = useState(false);
  const [projectBoardSynthesisDeferBusy, setProjectBoardSynthesisDeferBusy] = useState(false);
  const [projectBoardSynthesisPauseBusy, setProjectBoardSynthesisPauseBusy] = useState(false);
  const [projectBoardRevisionBusy, setProjectBoardRevisionBusy] = useState(false);
  const [threadContextMenu, setThreadContextMenu] = useState<ThreadContextMenuState | undefined>();
  const [threadActionDialog, setThreadActionDialog] = useState<ThreadActionDialogState | undefined>();
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [automationPopover, setAutomationPopover] = useState<AutomationPopover | undefined>();
  const [automationsCollapsed, setAutomationsCollapsed] = useState(false);
  const [automationFolders, setAutomationFolders] = useState<AutomationFolderSummary[]>([]);
  const [automationNavigationError, setAutomationNavigationError] = useState<string | undefined>();
  const [selectedAutomationPane, setSelectedAutomationPane] = useState<AutomationPane>("home");
  const [selectedAutomationFolderId, setSelectedAutomationFolderId] = useState("home");
  const [selectedAutomationThreadId, setSelectedAutomationThreadId] = useState<string | undefined>();
  const [workflowAgentFolders, setWorkflowAgentFolders] = useState<WorkflowAgentFolderSummary[]>([]);
  const [workflowAgentNavigationError, setWorkflowAgentNavigationError] = useState<string | undefined>();
  const [selectedWorkflowAgentFolderId, setSelectedWorkflowAgentFolderId] = useState("home");
  const [selectedWorkflowAgentThreadId, setSelectedWorkflowAgentThreadId] = useState<string | undefined>();
  const {
    applyRunStatusDesktopState,
    applyCreatedThreadState,
    applyProjectActionState,
    applyAutomationDesktopState,
  } = createAppDesktopStateAppliers({
    activeWorkspacePath: state?.activeWorkspace.path,
    closeProjectBoard,
    rememberDesktopState,
    setComposerDraft,
    setRunStatus,
    setSidebarArea,
    setState,
    setThreadRunStatuses,
    setWorkspaceRevision,
    threadRunStatuses,
  });
  const {
    workflowLibraryIncludeArchived,
    setWorkflowLibraryIncludeArchived,
    workflowRecordingLibrary,
    selectedWorkflowRecording,
    selectedWorkflowRecordingId,
    setSelectedWorkflowRecordingId,
    refreshWorkflowRecordingLibrary,
    refreshWorkflowRecordingLibraryOverride,
  } = useAppWorkflowRecordingLibraryControls({
    applyDesktopState: applyAutomationDesktopState,
    setError,
    state,
  });
  const {
    archiveProjectChats,
    archiveThread,
    confirmProjectActionDialog,
    confirmThreadActionDialog,
    copyThreadDeeplink,
    copyThreadSessionId,
    copyThreadWorkingDirectory,
    createPermanentProjectWorktree,
    forkThread,
    markThreadUnread,
    openProjectContextMenu,
    openThreadContextMenu,
    openThreadMiniWindow,
    projectIdForWorkspacePath,
    removeProject,
    renameProject,
    renameThread,
    revealProject,
    revealThread,
    threadActionInput,
    toggleProjectPinned,
    toggleThreadPinned,
  } = createAppProjectThreadActions({
    applyProjectActionState,
    projectActionDialog,
    projects: state?.projects,
    setError,
    setProjectActionDialog,
    setProjectContextMenu,
    setProjectPopover,
    setThreadActionDialog,
    setThreadContextMenu,
    threadActionDialog,
    threadContextMenu,
  });
  const {
    createThread,
    createThreadInProject,
    createWorkspace,
    openWorkspace,
    runPrimaryCreateAction,
    selectProject,
    selectThread,
  } = createAppWorkspaceNavigationControls({
    activeWorkspacePath: state?.activeWorkspace.path,
    applyCreatedThreadState,
    closeProjectBoard,
    currentWorkspacePath: state?.workspace.path,
    openNewWorkflowComposer,
    projectIdForWorkspacePath,
    rememberDesktopState,
    scheduleComposerFocusEnd: () => {
      window.setTimeout(() => composerInputRef.current?.focusEnd(), 0);
    },
    setComposerDraft,
    setProjectPopover,
    setProjectsCollapsed,
    setRunStatus,
    setSidebarArea,
    setState,
    setThreadRunStatuses,
    setWorkspaceRevision,
    sidebarArea,
    threadRunStatuses,
  });
  const [sidebarOrganize, setSidebarOrganize] = useState<SidebarOrganizeSettings>({
    organize: "project",
    sort: "updated",
    show: "all",
  });
  const {
    createAutomationFolder,
    createWorkflowAgentFolder,
    loadAutomationFolders,
    loadWorkflowAgentFolders,
    moveAutomationThread,
    moveWorkflowAgentThread,
  } = createAppAutomationFolderControls({
    selectedAutomationFolderId,
    selectedAutomationThreadId,
    selectedWorkflowAgentFolderId,
    selectedWorkflowAgentThreadId,
    setAutomationFolders,
    setAutomationNavigationError,
    setAutomationPopover,
    setSelectedAutomationFolderId,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId,
    setWorkflowAgentFolders,
    setWorkflowAgentNavigationError,
  });
  const {
    openSidebarArea,
    openWorkflowRecordingsArea,
    openWorkflowLabArea,
  } = createAppSidebarAreaControls({
    sidebarArea,
    setSidebarArea,
    setProjectPopover,
    setAutomationPopover,
    setSidebarOrganize,
    setRightPanel,
    setSelectedAutomationPane,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    loadAutomationFolders,
  });
  const {
    selectWorkflowAgentFolder,
    selectWorkflowAgentThread,
    selectWorkflowRecordingForSidebar,
    selectWorkflowRecordingForLab,
    selectAutomationPane,
    selectAutomationThread,
    openAutomationRunThread,
  } = createAppAutomationSelectionControls({
    setSidebarArea,
    setSelectedAutomationPane,
    setSelectedAutomationFolderId,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    selectThread,
  });
  const [sidebarAgeNow, setSidebarAgeNow] = useState(() => Date.now());
  const composerInputRef = useRef<ChatComposerInputHandle>(null);
  const composerDraftRef = useRef("");
  const composerDraftStore = useMemo(() => createComposerDraftStore(), []);
  const selectedSlashCommandRef = useRef<SlashCommandSelection | undefined>(undefined);
  const [selectedSlashCommand, setSelectedSlashCommandState] = useState<SlashCommandSelection | undefined>();
  const promptHistoryRef = useRef<string[]>([]);
  const localDeepResearchModeArmedRef = useRef(false);
  const localDeepResearchRunBudgetRef = useRef<LocalDeepResearchRunBudget>(resolveLocalDeepResearchRunBudget(undefined));
  const localRuntimeInventorySettingsRefreshKeyRef = useRef<string | undefined>(undefined);
  const [pendingSubmittedPrompts, setPendingSubmittedPrompts] = useState<PendingSubmittedPrompt[]>([]);
  const [pendingProjectComposerDraft, setPendingProjectComposerDraft] = useState<{ value: string; nonce: number } | undefined>();
  const [pendingWorkflowRecordingEditContext, setPendingWorkflowRecordingEditContext] = useState<PendingWorkflowRecordingEditContext | undefined>();
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const ambientCliSecretInputRef = useRef<HTMLInputElement>(null);
  const {
    clearSavedApiKey,
    openAmbientCliSecretDialog,
    openAmbientKeys,
    openApiKeyDialog,
    pasteAmbientCliSecret,
    pasteApiKey,
    saveAmbientCliSecret,
    saveApiKey,
    testApiKey,
    updateAmbientCliSecretDialog,
  } = createAppCredentialDialogActions({
    ambientCliSecretDialog,
    apiKeyDraft,
    focusAmbientCliSecretInput: (delayMs) => {
      window.setTimeout(() => ambientCliSecretInputRef.current?.focus(), delayMs);
    },
    focusApiKeyInput: (delayMs) => {
      window.setTimeout(() => apiKeyInputRef.current?.focus(), delayMs);
    },
    provider: state?.provider,
    setAmbientCliSecretDialog,
    setApiDialogOpen,
    setApiKeyBusy,
    setApiKeyDraft,
    setApiKeyStatus,
    setClipboardCandidate,
    setState,
  });
  const activeThreadIdRef = useRef<string | undefined>(undefined);
  const activeProjectRootRef = useRef<string | undefined>(undefined);
  const workspaceProjectAliasesRef = useRef<WorkspaceProjectAliases>({});
  const messageKindsRef = useRef<Record<string, AppMessageActivityKind>>({});
  const runActivityCounterRef = useRef(0);
  const runActivityLastEventAtRef = useRef(0);
  const runActivityHeartbeatIndexRef = useRef(0);
  const runActivityLinesByThreadRef = useRef<Record<string, RunActivityLine[]>>({});
  const thinkingDeltaBuffersRef = useRef<Record<string, string>>({});
  const voiceProviderRefreshTimerRef = useRef<number | undefined>(undefined);
  const voiceProviderRequestIdRef = useRef(0);
  const voiceProvidersRef = useRef<VoiceProviderCandidate[]>([]);
  const sttProviderRefreshTimerRef = useRef<number | undefined>(undefined);
  const sttProviderRequestIdRef = useRef(0);
  const sttProvidersRef = useRef<SttProviderCandidate[]>([]);
  const sttMicRecorderRef = useRef<SttMicrophoneRecorder | undefined>(undefined);
  const sttComposerRecorderRef = useRef<SttMicrophoneRecorder | undefined>(undefined);
  const sttComposerSilenceRef = useRef<SttTrailingSilenceState>({
    speechDetected: false,
    autoStopping: false,
  });
  const sttComposerShortcutActiveRef = useRef(false);
  const sttComposerOperationIdRef = useRef(0);
  const sttComposerThreadRef = useRef<string | undefined>(undefined);
  const previousRunningRef = useRef(false);
  const mcpContainerRuntimeStartupCheckRef = useRef(false);
  const goalCompletionCelebrationTimerRef = useRef<number | undefined>(undefined);
  const [mcpContainerRuntimeInstallProgress, setMcpContainerRuntimeInstallProgress] = useState<AmbientMcpContainerRuntimeManagedInstallProgress | undefined>();
  const [mcpDefaultCapabilityInstallProgress, setMcpDefaultCapabilityInstallProgress] = useState<AmbientMcpDefaultCapabilityInstallProgress | undefined>();
  const running = isRunStatusRunning(runStatus);
  const activeRunActivityLines = state?.activeThreadId ? runActivityLinesByThread[state.activeThreadId] ?? EMPTY_RUN_ACTIVITY_LINES : EMPTY_RUN_ACTIVITY_LINES;
  const thinkingDisplayMode = state?.settings.thinkingDisplay.mode ?? "transient";
  const {
    navigatePromptHistory,
    resetPromptHistory,
    shouldNavigatePromptHistory,
  } = createAppPromptHistoryControls({
    clearSttDraftMetadata: () => setSttDraftMetadata(undefined),
    draftBeforePromptHistory,
    getComposerDraft,
    getPromptHistory: () => promptHistoryRef.current,
    promptHistoryCursor,
    setComposerDraft,
    setDraftBeforePromptHistory,
    setPromptHistoryCursor,
  });
  const {
    voiceProviderLabels,
    latestReadyVoiceAutoplay,
    autoplayVoiceKey,
    activeVoiceMessageId,
    setActiveVoiceMessageId,
    activeThreadVoiceStatus,
    activeThreadVoiceStatusDismissKey,
    activeThreadVoiceStatusVisible,
    dismissActiveThreadVoiceStatus,
  } = useAppVoiceThreadControls({
    activeThreadId: state?.activeThreadId,
    messages: state?.messages,
    messageVoiceStates: state?.messageVoiceStates,
    settings: state?.settings.voice,
    voiceProviders,
  });
  const {
    chatFindOpen,
    setChatFindOpen,
    chatFindInputRef,
    chatFindQuery,
    chatFindCount,
    chatFindIndex,
    setChatFindQuery,
    onChatFindPrevious,
    onChatFindNext,
    onChatFindClose,
  } = useAppChatFindControls({
    activeThreadId: state?.activeThreadId,
    messages: state?.messages,
    running,
    thinkingDisplayMode,
  });
  const {
    modelPickerRef,
    modelPickerButtonRef,
    modelPickerOpen,
    setModelPickerOpen,
    composerModelOptions,
    selectedComposerModelOption,
    focusModelPickerOption,
  } = useAppComposerModelPickerControls({
    activeThreadId: state?.activeThreadId,
    catalogOptions: state?.settings.modelCatalog?.selectableMainModelOptions,
    selectedModelId: state?.settings.model,
  });

  const {
    loadSttProviders,
    loadVoiceProviders,
    refreshVoiceCatalog,
    scheduleSttProviderRefresh,
    scheduleVoiceProviderRefresh,
    setupSttProvider,
  } = createAppSpeechProviderActions({
    setState,
    setSttProviderCacheActivity,
    setSttProviderCacheStatus,
    setSttProviderSetup,
    setSttProviders,
    setSttProvidersError,
    setSttProvidersLoading,
    setVoiceCatalogRefresh,
    setVoiceProviderCacheActivity,
    setVoiceProviderCacheStatus,
    setVoiceProviders,
    setVoiceProvidersError,
    setVoiceProvidersLoading,
    state,
    sttProviderRefreshTimerRef,
    sttProviderRequestIdRef,
    sttProvidersRef,
    voiceProviderRefreshTimerRef,
    voiceProviderRequestIdRef,
    voiceProvidersRef,
  });

  const {
    cancelSttMicTest,
    loadSttMicrophoneDeviceList,
    startSttMicTest,
    stopSttMicTestAndValidate,
  } = createAppSttMicrophoneActions({
    setSttMicTest,
    setSttMicrophoneDevices,
    setSttMicrophoneDevicesError,
    setSttMicrophoneDevicesLoading,
    setupSttProvider,
    state,
    sttMicRecorderRef,
    sttProviderSetup,
  });

  const {
    loadLocalDeepResearchRunHistory,
    openLocalDeepResearchFollowupIfSetupNeeded,
    setupLocalDeepResearchFromSettings,
    setupMiniCpmVisionProviderFromSettings,
  } = createAppLocalRuntimeActions({
    localDeepResearchQ8Override,
    miniCpmVisionEndpointUrl,
    miniCpmVisionRuntimePath,
    setLocalDeepResearchFollowupOpen,
    setLocalDeepResearchRunHistory,
    setLocalDeepResearchSetup,
    setMiniCpmVisionSetup,
  });

  useAppLocalDeepResearchLifecycle({
    localDeepResearchSetup,
    localRuntimeInventorySettingsRefreshKeyRef,
    panel: rightPanel,
    setLocalDeepResearchSetup,
    setupLocalDeepResearchFromSettings,
    workspacePath: state?.workspace.path,
  });

  function appendSttRunActivityLine(line: string) {
    appendRunActivityLine(line);
  }

  function resetSttRunActivityLines(line: string) {
    resetRunActivityLines(line);
  }

  const {
    cancelSttComposerRecording,
    discardSttComposerResult,
    retrySttComposerTranscription,
    startSttComposerRecording,
    stopSttComposerRecording,
  } = createAppSttComposerActions({
    activeVoiceMessageId,
    appendRunActivityLine: appendSttRunActivityLine,
    getComposerDraft,
    resetPromptHistory,
    resetRunActivityLines: resetSttRunActivityLines,
    running,
    setActiveVoiceMessageId,
    setComposerDraft,
    setContextError,
    setError,
    setRunStatus,
    setSttComposer,
    setSttDraftMetadata,
    setThreadRunStatuses,
    state,
    sttComposer,
    sttComposerOperationIdRef,
    sttComposerRecorderRef,
    sttComposerShortcutActiveRef,
    sttComposerSilenceRef,
    sttComposerThreadRef,
    sttProvidersRef,
  });

  function rememberDesktopState(next: DesktopState) {
    rememberAppDesktopStateRefs(next, {
      activeProjectRootRef,
      activeThreadIdRef,
      workspaceProjectAliasesRef,
    });
  }

  function setError(message: string | undefined) {
    setErrorScope(undefined);
    setErrorState(message);
  }

  function setScopedError(message: string, scope: TransientErrorScope | undefined) {
    setErrorScope(scope);
    setErrorState(message);
  }

  function clearError() {
    setError(undefined);
  }

  const {
    loadPendingPermissionRequests,
    loadPermissionAudit,
    loadPermissionGrants,
    requestThreadPermissionModeChange,
    respondPermissionRequest,
    respondPrivilegedCredentialRequest,
    respondSecureInputRequest,
    revokePermissionGrant,
    revokePermissionGrantIds,
  } = createAppPermissionActions({
    permissionAudit,
    permissionGrants,
    setPermissionAudit,
    setPermissionAuditError,
    setPermissionGrantError,
    setPermissionGrantRevoking,
    setPermissionGrants,
    setPermissionRequests,
    setPrivilegedCredentialRequests,
    setSecureInputRequests,
    setState,
    state,
  });

  useAppStartupLifecycleEffects({
    loadPendingPermissionRequests,
    loadPermissionAudit,
    loadPermissionGrants,
    mcpContainerRuntimeStartupCheckRef,
    onBootstrapError: (err) => setError(String(err)),
    onBootstrapState: (next) => {
      applyDocumentAppearance(next.appearance);
      setThreadRunStatuses(next.threadRunStatuses ?? {});
      setRunStatus(appBootstrapRunStatus(next));
      rememberDesktopState(next);
      setState(next);
    },
    onDesktopEvent: handleEvent,
    openMcpRuntimeSettings,
    permissionAuditRevision,
    state,
  });

  useAppSpeechProviderLifecycleEffects({
    activeWorkspacePath: state?.activeWorkspace.path,
    loadSttMicrophoneDeviceList,
    loadSttProviders,
    loadVoiceProviders,
    pluginCatalogRevision,
    previousRunningRef,
    running,
    scheduleVoiceProviderRefresh,
    stateAvailable: Boolean(state),
  });

  useAppSttLifecycleEffects({
    cancelSttComposerRecording,
    loadSttMicrophoneDeviceList,
    running,
    startSttComposerRecording,
    state,
    stopSttComposerRecording,
    sttComposerRecorderRef,
    sttComposerShortcutActiveRef,
    sttComposerStatus: sttComposer.status,
    sttComposerThreadRef,
  });

  useAppComposerModeThreadLifecycleEffects({
    activeThreadId: state?.activeThreadId,
    collaborationMode: state?.settings.collaborationMode,
    setGoalMenuOpen,
    setGoalModeArmed,
    setLocalDeepResearchModeArmed,
  });

  useAppUnmountCleanupLifecycleEffect({
    goalCompletionCelebrationTimerRef,
    sttComposerRecorderRef,
    sttComposerShortcutActiveRef,
    sttMicRecorderRef,
    sttProviderRefreshTimerRef,
    voiceProviderRefreshTimerRef,
  });

  useAppShellGlobalEffects({
    chatFindInputRef,
    contextMenusOpen: Boolean(projectContextMenu || threadContextMenu),
    onCloseContextMenus: () => {
      setProjectContextMenu(undefined);
      setThreadContextMenu(undefined);
    },
    setChatFindOpen,
    setCommandPaletteOpen,
    setCommandPaletteQuery,
    setSidebarAgeNow,
    setSidebarWidth,
  });

  const activeWelcomeOnboardingPageKind = useMemo(() => welcomeOnboardingPageKindForMessages(state?.messages ?? []), [state?.messages]);
  const {
    handleMessagesScroll,
    jumpToLatestMessage,
    requestMessageTail,
    scrollRef,
    showScrollToBottom,
  } = useAppMessageScrollControls({
    activeRunActivityLines,
    activeThreadId: state?.activeThreadId,
    activeThreadIdRef,
    chatBrowserUserActionId: chatBrowserUserAction?.id,
    chatBrowserUserActionStatus: chatBrowserUserAction?.status,
    messages: state?.messages,
    welcomeOnboardingPageKind: activeWelcomeOnboardingPageKind,
  });

  useAppWelcomePluginRegistryLifecycleEffect({
    pageKind: activeWelcomeOnboardingPageKind,
    pluginCatalogRevision,
    setWelcomeAmbientPluginRegistry,
  });

  useAppThreadLifecycleEffects({
    activeProjectRootRef,
    activeThreadIdRef,
    errorScope,
    messageKindsRef,
    resetPromptHistory,
    setAutomationFolders,
    setContextAttachments,
    setContextError,
    setErrorScope,
    setErrorState,
    setWorkflowAgentFolders,
    state,
    thinkingDeltaBuffersRef,
    workspaceProjectAliasesRef,
  });

  const {
    appendRunActivityLine,
    appendThinkingDeltaLine,
    resetRunActivityLines,
  } = useAppRunActivityControls({
    activeThreadIdRef,
    requestMessageTail,
    runActivityCounterRef,
    runActivityHeartbeatIndexRef,
    runActivityLastEventAtRef,
    runActivityLinesByThreadRef,
    setRetryStatsByThread,
    setRunActivityLinesByThread,
    thinkingDeltaBuffersRef,
  });

  useAppStatusSubscriptions({
    state,
    running,
    threadRunStatuses,
    chatBrowserUserAction,
    browserRevision,
    workspaceRevision,
    abortArmDelayMs: RUN_ABORT_ARM_DELAY_MS,
    runActivityLastEventAtRef,
    runActivityHeartbeatIndexRef,
    setState,
    setRunStatus,
    setChatBrowserUserAction,
    setRightPanel,
    setAbortArmed,
    appendRunActivityLine,
    setGitStatus,
    setGitStatusError,
    setActiveGitReview,
    setActiveGitReviewError,
  });

  function triggerGoalCompletionCelebration(messageId: string) {
    if (goalCompletionCelebrationTimerRef.current) window.clearTimeout(goalCompletionCelebrationTimerRef.current);
    setGoalCompletionCelebrationId(messageId);
    goalCompletionCelebrationTimerRef.current = window.setTimeout(() => {
      setGoalCompletionCelebrationId((current) => (current === messageId ? undefined : current));
      goalCompletionCelebrationTimerRef.current = undefined;
    }, GOAL_COMPLETION_CELEBRATION_MS);
  }

  const {
    desktopEventMatchesWorkspace,
    desktopEventMatchesActiveProject,
    promptRequestMatchesActiveProject,
  } = createAppDesktopEventGuards({ activeProjectRootRef, workspaceProjectAliasesRef });

  function handleEvent(event: DesktopEvent) {
    if (event.type === "state") {
      applyDocumentAppearance(event.state.appearance);
      const nextRunStatuses = event.state.threadRunStatuses ?? {};
      setThreadRunStatuses((current) => {
        for (const [threadId, status] of Object.entries(nextRunStatuses)) {
          if (current[threadId] !== status) return { ...current, ...nextRunStatuses };
        }
        return current;
      });
      const nextRunStatus = nextRunStatuses[event.state.activeThreadId] ?? "idle";
      setRunStatus((current) => (current === nextRunStatus ? current : nextRunStatus));
      rememberDesktopState(event.state);
      // Full desktop snapshots can be large while board synthesis streams; keep them interruptible
      // so local input, scrolling, and close/tab clicks stay responsive.
      startTransition(() => setState(event.state));
      return;
    }
    if (event.type === "appearance-updated") {
      applyDocumentAppearance(event.appearance);
      setState((current) => (current ? { ...current, appearance: event.appearance } : current));
      return;
    }
    if (event.type === "run-status") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setThreadRunStatuses((statuses) => (
        statuses[event.threadId] === event.status ? statuses : { ...statuses, [event.threadId]: event.status }
      ));
      if (event.status === "starting") appendRunActivityLine("Starting Ambient session.", "state", {}, event.threadId);
      if (event.status === "streaming") appendRunActivityLine("Waiting for model output.", "state", {}, event.threadId);
      if (event.status === "tool") appendRunActivityLine("Tool execution is in progress.", "tool", {}, event.threadId);
      if (event.status === "compacting") appendRunActivityLine("Compacting context before continuing.", "state", {}, event.threadId);
      if (event.status === "retrying") appendRunActivityLine("Retrying after a recoverable model error.", "state", {}, event.threadId);
      if (event.threadId === activeThreadIdRef.current) {
        setRunStatus((current) => (current === event.status ? current : event.status));
        if (event.status === "idle" || event.status === "error") setActivity(undefined);
      }
      return;
    }
    if (event.type === "runtime-activity") {
      if (!desktopEventMatchesActiveProject(event)) return;
      if (event.activity.kind === "retry") {
        const retryActivity = event.activity;
        setRetryStatsByThread((current) => ({
          ...current,
          [retryActivity.threadId]: runRetryStatsFromActivity(current[retryActivity.threadId], retryActivity),
        }));
      }
      appendRunActivityLine(
        formatRuntimeActivity(event.activity),
        event.activity.kind === "retry" ||
          (event.activity.kind === "stream" && event.activity.status === "timeout") ||
          (event.activity.kind === "tool" && event.activity.status === "timeout")
          ? "error"
          : "state",
        {},
        event.activity.threadId,
      );
      if (event.activity.threadId === activeThreadIdRef.current) setActivity(event.activity);
      return;
    }
    if (event.type === "thread-goal-updated" && event.goal.threadId === activeThreadIdRef.current && event.goal.status !== "active") {
      setActivity((current) =>
        current?.kind === "goal" && current.goalId === event.goal.goalId ? undefined : current,
      );
    }
    if (event.type === "mcp-container-runtime-install-progress") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setMcpContainerRuntimeInstallProgress(event.progress);
      return;
    }
    if (event.type === "mcp-default-capability-install-progress") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setMcpDefaultCapabilityInstallProgress(event.progress);
      return;
    }
    if (event.type === "local-deep-research-install-progress") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setLocalDeepResearchSetup((current) => localDeepResearchInstallProgressState(current, event.progress));
      return;
    }
    if (event.type === "local-deep-research-setup-updated") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setLocalDeepResearchSetup((current) => localDeepResearchSetupResultState(event.result, current));
      return;
    }
    if (event.type === "context-usage-updated") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setState((current) =>
        current && current.activeThreadId === event.snapshot.threadId
          ? { ...current, contextUsage: event.snapshot }
          : current,
      );
      return;
    }
    if (event.type === "error") {
      if (event.threadId && event.threadId !== activeThreadIdRef.current) return;
      if (event.workspacePath && event.workspacePath !== activeProjectRootRef.current) return;
      setScopedError(
        event.message,
        event.threadId || event.workspacePath ? { threadId: event.threadId, workspacePath: event.workspacePath } : undefined,
      );
      return;
    }
    if (event.type === "open-api-key-dialog") {
      void openApiKeyDialog();
      return;
    }
    if (event.type === "mcp-container-runtime-setup-needed") {
      if (!desktopEventMatchesActiveProject(event)) return;
      openMcpRuntimeSettings();
      return;
    }
    if (event.type === "ambient-cli-secret-requested") {
      openAmbientCliSecretDialog({
        packageId: event.packageId,
        packageName: event.packageName,
        builderSourcePath: event.builderSourcePath,
        mcpServerId: event.mcpServerId,
        mcpCandidateId: event.mcpCandidateId,
        mcpCandidateRef: event.mcpCandidateRef,
        envName: event.envName,
      });
      return;
    }
    if (event.type === "menu-command") {
      void handleMenuCommand(event.command);
      return;
    }
    if (event.type === "permission-request") {
      const request = {
        ...event.request,
        ...(!event.request.workspacePath && event.workspacePath ? { workspacePath: event.workspacePath } : {}),
      };
      setPermissionRequests((requests) =>
        requests.some((existing) => existing.id === request.id) ? requests : [...requests, request],
      );
      return;
    }
    if (event.type === "permission-resolved") {
      setPermissionRequests((requests) => requests.filter((request) => request.id !== event.id));
      return;
    }
    if (event.type === "privileged-credential-request") {
      const request = {
        ...event.request,
        ...(!event.request.workspacePath && event.workspacePath ? { workspacePath: event.workspacePath } : {}),
      };
      setPrivilegedCredentialRequests((requests) =>
        requests.some((existing) => existing.id === request.id) ? requests : [...requests, request],
      );
      return;
    }
    if (event.type === "privileged-credential-resolved") {
      setPrivilegedCredentialRequests((requests) => requests.filter((request) => request.id !== event.id));
      return;
    }
    if (event.type === "secure-input-request") {
      const request = {
        ...event.request,
        ...(!event.request.workspacePath && event.workspacePath ? { workspacePath: event.workspacePath } : {}),
      };
      setSecureInputRequests((requests) =>
        requests.some((existing) => existing.id === request.id) ? requests : [...requests, request],
      );
      return;
    }
    if (event.type === "secure-input-resolved") {
      setSecureInputRequests((requests) => requests.filter((request) => request.id !== event.id));
      return;
    }
    if (event.type === "permission-audit-created") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setPermissionAuditRevision((revision) => revision + 1);
      return;
    }
    if (event.type === "permission-grant-created" || event.type === "permission-grant-revoked") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setPermissionAuditRevision((revision) => revision + 1);
      return;
    }
    if (event.type === "e2e-permission-fixture") {
      if (event.grants) setPermissionGrants(event.grants);
      if (event.audit) setPermissionAudit(event.audit);
      return;
    }
    if (event.type === "plugin-catalog-updated") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setPluginCatalogRevision((revision) => revision + 1);
      scheduleVoiceProviderRefresh(150, "plugin catalog updated");
      scheduleSttProviderRefresh(150, "plugin catalog updated");
      return;
    }
    if (event.type === "browser-updated") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setChatBrowserUserAction(chatBrowserUserActionForThread(event.state.userAction, activeThreadIdRef.current));
      setBrowserRevision((revision) => revision + 1);
      return;
    }
    if (event.type === "tool-event") {
      if (!desktopEventMatchesActiveProject(event)) return;
      const baseLabel = event.details?.pluginName && event.details.toolName ? `${event.details.pluginName}: ${event.details.toolName}` : event.label || "tool";
      const label = event.artifactPath ? `${baseLabel} for ${event.artifactPath}` : baseLabel;
      const argumentStatus = event.details?.toolArgumentProgress?.uiStatus;
      const toolActivityMessage = toolEventActivityMessage(event.details);
      if (event.status === "running") appendRunActivityLine(toolActivityMessage ?? argumentStatus ?? `Running ${label}.`, "tool", {}, event.threadId);
      if (event.status === "done") appendRunActivityLine(`${label} completed.`, "tool", {}, event.threadId);
      if (event.status === "error") appendRunActivityLine(`${label} failed.`, "error", {}, event.threadId);
      if (event.status === "done" || event.status === "error") {
        setWorkspaceRevision((revision) => revision + 1);
        scheduleVoiceProviderRefresh(500, `tool ${event.status}`);
        scheduleSttProviderRefresh(500, `tool ${event.status}`);
      }
      return;
    }
    if (event.type === "orchestration-updated") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setOrchestrationRevision((revision) => revision + 1);
      return;
    }
    if (event.type === "orchestration-auto-dispatch-updated") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setOrchestrationAutoRevision((revision) => revision + 1);
      return;
    }
    if (event.type === "workflow-updated") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setWorkflowRevision((revision) => revision + 1);
      return;
    }
    if (event.type === "workflow-discovery-progress") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setWorkflowDiscoveryProgress(event.progress);
      setSelectedWorkflowAgentThreadId((current) => current ?? event.progress.workflowThreadId);
      if (event.progress.phase !== "model" || event.progress.status !== "running") setWorkflowRevision((revision) => revision + 1);
      return;
    }
    if (event.type === "workflow-exploration-progress") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setWorkflowExplorationProgressByThreadId((current) => ({ ...current, [event.progress.workflowThreadId]: event.progress }));
      setSelectedWorkflowAgentThreadId((current) => current ?? event.progress.workflowThreadId);
      return;
    }
    if (event.type === "workflow-compile-progress") {
      if (!desktopEventMatchesActiveProject(event)) return;
      setWorkflowCompileProgress((current) => coalesceWorkflowCompileProgress(current, event.progress));
      return;
    }
    if (event.type === "workflow-run-started") {
      if (!desktopEventMatchesActiveProject(event)) return;
      if (event.workflowThreadId) setSelectedWorkflowAgentThreadId(event.workflowThreadId);
      setWorkflowRevision((revision) => revision + 1);
      return;
    }
    if (event.type === "message-created" && desktopEventMatchesActiveProject(event) && event.message.threadId === activeThreadIdRef.current) {
      messageKindsRef.current[event.message.id] = messageKindForActivity(event.message);
      if (isGoalCompletionMessage(event.message)) {
        appendRunActivityLine("Goal completed and cleared.", "state", { dedupe: false });
        triggerGoalCompletionCelebration(event.message.id);
      } else if (event.message.metadata?.kind === "thinking") appendRunActivityLine("Receiving Ambient reasoning.", "thinking");
      else if (event.message.role === "assistant" && !event.message.content.trim()) appendRunActivityLine("Ambient response channel opened.");
    }
    if (event.type === "message-delta") {
      if (!desktopEventMatchesActiveProject(event)) return;
      const kind = messageKindsRef.current[event.messageId];
      if (kind === "thinking") appendThinkingDeltaLine(event.messageId, event.delta);
      if (kind === "assistant") appendRunActivityLine("Streaming response text.");
    }
    if (event.type === "message-updated" && desktopEventMatchesActiveProject(event) && event.message.threadId === activeThreadIdRef.current) {
      messageKindsRef.current[event.message.id] = messageKindForActivity(event.message);
    }
    if (event.type === "stt-stop-tts-requested") {
      if (!event.workspacePath || event.workspacePath === activeProjectRootRef.current) setActiveVoiceMessageId(undefined);
      return;
    }
    if (!STATE_REDUCER_DESKTOP_EVENT_TYPES.has(event.type)) return;
    setState((current) => {
      if (!current) return current;
      if (event.type === "provider-updated") {
        return { ...current, provider: event.provider };
      }
      if (event.type === "update-status") {
        return { ...current, app: { ...current.app, update: event.update } };
      }
      if (event.type === "queue-updated") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (event.queue.threadId && event.queue.threadId !== current.activeThreadId) return current;
        return { ...current, queue: event.queue };
      }
      if (event.type === "stt-queue-updated") {
        if (event.workspacePath && event.workspacePath !== current.workspace.path) return current;
        return { ...current, sttQueue: event.queue };
      }
      if (event.type === "stt-diagnostic-recorded") {
        if (event.workspacePath && event.workspacePath !== current.workspace.path) return current;
        return { ...current, sttDiagnostics: event.diagnostics };
      }
      if (event.type === "message-created") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (event.message.threadId !== current.activeThreadId) return upsertChildThreadMessage(current, event.message);
        return { ...current, messages: [...current.messages, event.message] };
      }
      if (event.type === "message-delta") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (!current.messages.some((message) => message.id === event.messageId)) return applyChildThreadMessageDelta(current, event);
        return {
          ...current,
          messages: current.messages.map((message) =>
            message.id === event.messageId ? { ...message, content: message.content + event.delta } : message,
          ),
        };
      }
      if (event.type === "message-updated") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (event.message.threadId !== current.activeThreadId) return upsertChildThreadMessage(current, event.message);
        return {
          ...current,
          messages: current.messages.map((message) => (message.id === event.message.id ? event.message : message)),
        };
      }
      if (event.type === "planner-plan-artifact-created" || event.type === "planner-plan-artifact-updated") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (event.artifact.threadId !== current.activeThreadId) return current;
        const exists = current.plannerPlanArtifacts.some((artifact) => artifact.id === event.artifact.id);
        return {
          ...current,
          plannerPlanArtifacts: exists
            ? current.plannerPlanArtifacts.map((artifact) => (artifact.id === event.artifact.id ? event.artifact : artifact))
            : [event.artifact, ...current.plannerPlanArtifacts],
        };
      }
      if (event.type === "thread-goal-updated") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (event.goal.threadId !== current.activeThreadId) return current;
        return { ...current, activeThreadGoal: event.goal };
      }
      if (event.type === "thread-goal-cleared") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (event.threadId !== current.activeThreadId) return current;
        return { ...current, activeThreadGoal: undefined };
      }
      if (event.type === "thread-updated") {
        const upsertThread = (threads: ThreadSummary[]) =>
          threads.some((thread) => thread.id === event.thread.id)
            ? threads.map((thread) => (thread.id === event.thread.id ? event.thread : thread))
            : [...threads, event.thread];
        const projects = current.projects.map((project) =>
          desktopEventMatchesWorkspace(event, project.path)
            ? {
                ...project,
                threads: upsertThread(project.threads),
              }
            : project,
        );
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) {
          return { ...current, projects };
        }
        return {
          ...current,
          threads: upsertThread(current.threads),
          projects,
          settings:
            event.thread.id === current.activeThreadId
              ? {
                  ...current.settings,
                  permissionMode: event.thread.permissionMode,
                  collaborationMode: event.thread.collaborationMode,
                  model: event.thread.model,
                  thinkingLevel: event.thread.thinkingLevel,
                }
              : current.settings,
        };
      }
      if (event.type === "subagent-run-updated") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
        if (event.run.parentThreadId !== current.activeThreadId && event.run.childThreadId !== current.activeThreadId) return current;
        const subagentRuns = upsertSortedDesktopEventItem(
          current.subagentRuns,
          event.run,
          (run) => run.id,
          (left, right) => left.createdAt.localeCompare(right.createdAt),
        );
        return subagentRuns === current.subagentRuns ? current : { ...current, subagentRuns };
      }
      if (event.type === "subagent-run-event-created") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
        if (event.run.parentThreadId !== current.activeThreadId && event.run.childThreadId !== current.activeThreadId) return current;
        const subagentRuns = upsertSortedDesktopEventItem(
          current.subagentRuns,
          event.run,
          (run) => run.id,
          (left, right) => left.createdAt.localeCompare(right.createdAt),
        );
        const subagentRunEvents = upsertSortedDesktopEventItem(
          current.subagentRunEvents,
          event.event,
          (candidate) => `${candidate.runId}:${candidate.sequence}`,
          (left, right) => left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence,
        );
        return subagentRuns === current.subagentRuns && subagentRunEvents === current.subagentRunEvents
          ? current
          : { ...current, subagentRuns, subagentRunEvents };
      }
      if (event.type === "subagent-mailbox-event-updated") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
        if (event.run.parentThreadId !== current.activeThreadId && event.run.childThreadId !== current.activeThreadId) return current;
        const subagentRuns = upsertSortedDesktopEventItem(
          current.subagentRuns,
          event.run,
          (run) => run.id,
          (left, right) => left.createdAt.localeCompare(right.createdAt),
        );
        const subagentMailboxEvents = upsertSortedDesktopEventItem(
          current.subagentMailboxEvents,
          event.mailboxEvent,
          (mailboxEvent) => mailboxEvent.id,
          (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
        );
        return subagentRuns === current.subagentRuns && subagentMailboxEvents === current.subagentMailboxEvents
          ? current
          : { ...current, subagentRuns, subagentMailboxEvents };
      }
      if (event.type === "subagent-tool-scope-snapshot-recorded") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
        if (event.run.parentThreadId !== current.activeThreadId && event.run.childThreadId !== current.activeThreadId) return current;
        const subagentRuns = upsertSortedDesktopEventItem(
          current.subagentRuns,
          event.run,
          (run) => run.id,
          (left, right) => left.createdAt.localeCompare(right.createdAt),
        );
        const subagentToolScopeSnapshots = upsertSortedDesktopEventItem(
          current.subagentToolScopeSnapshots,
          event.snapshot,
          (snapshot) => `${snapshot.runId}:${snapshot.sequence}`,
          (left, right) => left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence,
        );
        return subagentRuns === current.subagentRuns && subagentToolScopeSnapshots === current.subagentToolScopeSnapshots
          ? current
          : { ...current, subagentRuns, subagentToolScopeSnapshots };
      }
      if (event.type === "subagent-wait-barrier-updated") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
        const activeRunIds = new Set(current.subagentRuns.map((run) => run.id));
        if (event.barrier.parentThreadId !== current.activeThreadId && !event.barrier.childRunIds.some((runId) => activeRunIds.has(runId))) {
          return current;
        }
        const subagentWaitBarriers = upsertSortedDesktopEventItem(
          current.subagentWaitBarriers,
          event.barrier,
          (barrier) => barrier.id,
          (left, right) => left.createdAt.localeCompare(right.createdAt),
        );
        return subagentWaitBarriers === current.subagentWaitBarriers ? current : { ...current, subagentWaitBarriers };
      }
      if (event.type === "subagent-parent-mailbox-event-updated") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
        const activeParentRunIds = new Set(current.subagentRuns.map((run) => run.parentRunId));
        if (event.mailboxEvent.parentThreadId !== current.activeThreadId && !activeParentRunIds.has(event.mailboxEvent.parentRunId)) return current;
        const subagentParentMailboxEvents = upsertSortedDesktopEventItem(
          current.subagentParentMailboxEvents,
          event.mailboxEvent,
          (mailboxEvent) => mailboxEvent.id,
          (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
        );
        return subagentParentMailboxEvents === current.subagentParentMailboxEvents
          ? current
          : { ...current, subagentParentMailboxEvents };
      }
      if (event.type === "callable-workflow-task-updated") {
        if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
        if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
        if (event.task.parentThreadId !== current.activeThreadId) return current;
        const callableWorkflowTasks = upsertSortedDesktopEventItem(
          current.callableWorkflowTasks,
          event.task,
          (task) => task.id,
          (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
        );
        return callableWorkflowTasks === current.callableWorkflowTasks ? current : { ...current, callableWorkflowTasks };
      }
      return current;
    });
  }

  const activeThread = useMemo(
    () => state?.threads.find((thread) => thread.id === state.activeThreadId),
    [state?.activeThreadId, state?.threads],
  );
  const {
    activeSubagentChildHiddenByFeatureFlag,
    activeSubagentInspector,
    subagentParentClustersByMessageId,
    subagentUiEnabled,
    symphonyBuilderModel,
  } = useAppSubagentShellControls({
    activeThread,
    setSubagentApprovalActionBusy,
    setSubagentApprovalDecisionDialog,
    setSubagentBarrierActionBusy,
    setSubagentBarrierDecisionDialog,
    setSubagentChildCancelBusy,
    setSubagentChildCloseBusy,
    setSymphonyBuilderDraft,
    state,
    symphonyBuilderDraft,
  });

  const {
    cancelCallableWorkflowTask,
    cancelSubagentChild,
    closeSubagentChild,
    openCallableWorkflowThread,
    pauseCallableWorkflowTask,
    resolveSubagentApprovalAction,
    resolveSubagentBarrierAction,
    resumeCallableWorkflowTask,
    submitSubagentApprovalDecisionDialog,
    submitSubagentBarrierDecisionDialog,
  } = createAppSubagentParentClusterActions({
    clearAutomationPopover: () => setAutomationPopover(undefined),
    clearProjectPopover: () => setProjectPopover(undefined),
    setCallableWorkflowTaskCancelBusy,
    setCallableWorkflowTaskPauseBusy,
    setCallableWorkflowTaskResumeBusy,
    setError,
    setSelectedAutomationPane,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    setSidebarArea,
    setState,
    setSubagentApprovalActionBusy,
    setSubagentApprovalDecisionDialog,
    setSubagentBarrierActionBusy,
    setSubagentBarrierDecisionDialog,
    setSubagentChildCancelBusy,
    setSubagentChildCloseBusy,
    setWorkflowAgentFolders,
    setWorkflowAgentNavigationError,
    subagentApprovalDecisionDialog,
    subagentBarrierDecisionDialog,
  });

  const {
    conversationReviewPanelDocked,
    runStatusCardVisible,
    workflowRecorderEmptyChatState,
    workflowRecordingReviewFeedbackActive,
    workflowRecordingReviewPanelOpen,
    setWorkflowRecordingReviewPanelOpen,
    workflowRecordingReviewRunning,
  } = useAppWorkflowRecordingReviewControls({
    activeThread,
    running,
    thinkingDisplay: state?.settings.thinkingDisplay,
    workflowRecorderSurface,
  });
  const {
    activeProject,
    activeWorkspaceIsPreparedLocalTask,
    errorNeedsSessionRecovery,
    latestDurablePlannerPlanArtifact,
    readyPlannerPlanArtifacts,
    sessionContextMissing,
  } = useAppWorkspaceProjectModel({
    activeWorkspacePath: state?.activeWorkspace.path,
    contextUsage: state?.contextUsage,
    error,
    plannerPlanArtifacts: state?.plannerPlanArtifacts,
    projects: state?.projects,
    workspacePath: state?.workspace.path,
  });
  const projectBoardActionsRef = useRef<ReturnType<typeof createAppProjectBoardActions> | undefined>(undefined);
  const {
    activeProjectBoardBusy,
    activeProjectBoardTopbarAction,
    activeThreadSuppressesProjectBoard,
    projectBoardOpen,
    setProjectBoardOpen,
    projectBoardPlanBusy,
    setProjectBoardPlanBusy,
    projectBoardPlanPickerOpen,
    setProjectBoardPlanPickerOpen,
    projectBoardThreadPlanAction,
    runProjectBoardThreadPlanAction,
  } = useAppProjectBoardShellControls({
    activeProject,
    activeThread,
    activeThreadId: state?.activeThreadId,
    activeWorkspacePath: state?.activeWorkspace.path,
    projectBoardBusyProjectIds,
    readyPlannerPlanArtifacts,
    workspaceName: state?.workspace.name,
    workspacePath: state?.workspace.path,
    onAddPlannerPlanToBoard: (artifact) => projectBoardActionsRef.current?.addPlannerPlanToBoard(artifact),
    onBuildProjectBoard: (project) => projectBoardActionsRef.current?.buildProjectBoard(project),
    onOpenProjectBoard: (project) => projectBoardActionsRef.current?.openProjectBoard(project),
  });
  const projectBoardActions = createAppProjectBoardActions({
    activeThread,
    activeWorkspacePath: state?.activeWorkspace.path,
    applyCreatedThreadState,
    applyProjectActionState,
    projectBoardBusyProjectIds,
    projectBoardKickoffDefaultsBusy,
    projectBoardResetDialog,
    previewArtifact,
    selectProject,
    selectThread,
    setError,
    setProjectBoardBusyProjectIds,
    setProjectBoardFinalizeBusy,
    setProjectBoardKickoffDefaultsBusy,
    setProjectBoardOpen,
    setProjectBoardPlanBusy,
    setProjectBoardPlanPickerOpen,
    setProjectBoardProposalAnswerBusy,
    setProjectBoardProposalApplyBusy,
    setProjectBoardProposalCardReviewBusy,
    setProjectBoardRefineBusy,
    setProjectBoardRefineMode,
    setProjectBoardResetDialog,
    setProjectBoardRevisionBusy,
    setProjectBoardSourceBusy,
    setProjectBoardSourceImpactBusy,
    setProjectBoardSynthesisDeferBusy,
    setProjectBoardSynthesisPauseBusy,
    setProjectBoardSynthesisRetryBusy,
    setSidebarArea,
    setState,
    state,
  });
  projectBoardActionsRef.current = projectBoardActions;
  function closeProjectBoard() {
    setProjectBoardOpen(false);
  }
  const localDeepResearchReady = localDeepResearchSetup.result?.setupStatus === "ready";
  const localDeepResearchRunActive = useMemo(
    () => activeThreadHasRunningLocalDeepResearch(state?.messages),
    [state?.messages],
  );
  const localDeepResearchRunBudget = useMemo(
    () => resolveLocalDeepResearchRunBudget(state?.settings.localDeepResearch.runBudget, localDeepResearchBudgetOverride),
    [
      state?.settings.localDeepResearch.runBudget.defaultEffort,
      state?.settings.localDeepResearch.runBudget.customMaxToolCalls,
      state?.settings.localDeepResearch.runBudget.onExhausted,
      localDeepResearchBudgetOverride,
    ],
  );
  localDeepResearchRunBudgetRef.current = localDeepResearchRunBudget;
  useAppLocalDeepResearchReadinessLifecycleEffect({
    localDeepResearchReady,
    setLocalDeepResearchModeArmed,
  });
  const {
    artifactPathHints,
    latestRecoveryPrompt,
    plannerArtifactByMessageId,
    promptHistory,
    retryableMessageIds,
    streamingAssistantId,
    transientThinkingActivityLines,
    visibleChatMessages,
    visibleRunActivityLines,
  } = useAppConversationDisplayModel({
    activeThreadId: state?.activeThreadId,
    activeRunActivityLines,
    activeWorkspacePath: state?.activeWorkspace.path,
    messages: state?.messages,
    pendingSubmittedPrompts,
    plannerPlanArtifacts: state?.plannerPlanArtifacts,
    running,
    thinkingDisplayMode,
    workspacePath: state?.workspace.path,
  });
  promptHistoryRef.current = promptHistory;

  useEffect(() => {
    if (!state) return;
    const now = Date.now();
    setPendingSubmittedPrompts((current) => {
      const next = current.filter((prompt) => {
        const createdAt = Date.parse(prompt.createdAt);
        if (Number.isFinite(createdAt) && now - createdAt > 5 * 60 * 1000) return false;
        if (prompt.threadId !== state.activeThreadId) return true;
        if (!running && pendingSubmittedPromptHasPersistedMatch(prompt, state.messages)) return false;
        return true;
      });
      return next.length === current.length ? current : next;
    });
  }, [running, state]);

  const {
    selectedAutomationFolder,
    selectedAutomationThread,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread,
    sidebarProjects,
    sidebarThreads,
  } = useAppSidebarSelectionModel({
    activeThreadId: state?.activeThreadId,
    activeWorkspacePath: state?.workspace.path,
    automationFolders,
    projects: state?.projects ?? [],
    selectedAutomationFolderId,
    selectedAutomationThreadId,
    selectedWorkflowAgentFolderId,
    selectedWorkflowAgentThreadId,
    sidebarOrganize,
    subagentUiEnabled,
    workflowAgentFolders,
  });
  useAppSidebarLifecycleEffects({
    activeThreadId: activeThread?.id,
    activeThreadKind: activeThread?.kind,
    activeThreadParentThreadId: activeThread?.parentThreadId,
    activeThreadWorkspacePath: activeThread?.workspacePath,
    loadAutomationFolders,
    loadWorkflowAgentFolders,
    orchestrationAutoRevision,
    orchestrationRevision,
    pendingProjectComposerDraft,
    selectThread,
    setComposerDraft,
    setError,
    setPendingProjectComposerDraft,
    sidebarArea,
    subagentUiEnabled,
    workflowRevision,
    workspacePath: state?.workspace.path,
  });

  const {
    applyLatestWorkflowRecordingSummary,
    archiveWorkflowRecordingPlaybook,
    confirmActiveWorkflowRecordingReview,
    restoreWorkflowRecordingVersion,
    setWorkflowRecordingEnabled,
    startWorkflowRecording,
    stopActiveWorkflowRecording,
    unarchiveWorkflowRecordingPlaybook,
    updateActiveWorkflowRecordingReview,
  } = createAppWorkflowRecordingActions({
    activeThread,
    applyCreatedThreadState,
    applyRunStatusDesktopState,
    closeProjectBoard,
    refreshWorkflowRecordingLibraryOverride,
    resetPromptHistory,
    resetRunActivityLines,
    scheduleComposerDraftFocus: (draft) => {
      window.setTimeout(() => {
        setComposerDraft(draft);
        composerInputRef.current?.focusEnd();
      }, 0);
    },
    sendWorkflowRecordingReviewPromptForState,
    setError,
    setRunStatus,
    setSelectedWorkflowRecordingId,
    setSidebarArea,
    setThreadRunStatuses,
    state,
    workflowLibraryIncludeArchived,
  });

  const {
    editWorkflowRecordingPlaybookInChat,
  } = createAppWorkflowRecordingPlaybookActions({
    closeProjectBoard,
    previewLocalFile,
    setAutomationPopover,
    setBrowserRevision,
    setError,
    setPendingProjectComposerDraft,
    setPendingWorkflowRecordingEditContext,
    setProjectPopover,
    setRightPanel,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    setSidebarArea,
  });

  function openNewWorkflowComposer(folderId?: string) {
    setSidebarArea("automations");
    setProjectPopover(undefined);
    setAutomationPopover(undefined);
    setSelectedAutomationPane("workflow_agent");
    if (folderId) setSelectedWorkflowAgentFolderId(folderId);
    setSelectedWorkflowAgentThreadId(undefined);
    setSelectedWorkflowRecordingId(undefined);
    setSelectedAutomationThreadId(undefined);
    setRightPanel((current) => (current === "search" || current === "settings" ? current : undefined));
    void loadWorkflowAgentFolders();
  }

  async function updateThreadSettings(
    input: Partial<Pick<ThreadSummary, "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled">>,
  ) {
    if (!state) return undefined;
    const thread = await window.ambientDesktop.updateThreadSettings({
      threadId: state.activeThreadId,
      ...input,
    });
    setState({
      ...state,
      threads: state.threads.map((item) => (item.id === thread.id ? thread : item)),
      settings: {
        ...state.settings,
        permissionMode: thread.permissionMode,
        collaborationMode: thread.collaborationMode,
        model: thread.model,
        thinkingLevel: thread.thinkingLevel,
      },
    });
    return thread;
  }

  async function updateThemePreference(themePreference: ThemePreference) {
    const appearance = await window.ambientDesktop.setThemePreference({ themePreference });
    applyDocumentAppearance(appearance);
    setState((current) => (current ? { ...current, appearance } : current));
  }

  async function handleMenuCommand(command: MenuCommand) {
    if (command === "new-chat") {
      await createThread();
      return;
    }
    if (command === "open-folder") {
      await openWorkspace();
      return;
    }
    if (command === "toggle-sidebar") {
      setSidebarOpen((open) => !open);
      return;
    }
    if (command === "toggle-terminal") {
      togglePanel("terminal");
      return;
    }
    if (command === "toggle-file-tree") {
      togglePanel("files");
      return;
    }
    if (command === "toggle-diff-panel") {
      togglePanel("diff");
      return;
    }
    if (command === "toggle-browser-panel") {
      togglePanel("browser");
      return;
    }
    if (command === "performance-trace") {
      openPanel("performance");
      return;
    }
    if (command === "export-diagnostics") {
      try {
        await exportDiagnostics();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  function beginSidebarResize(event: ReactMouseEvent<HTMLDivElement>) {
    beginAppSidebarResize(event, setSidebarWidth);
  }

  function beginRightPanelResize(event: ReactMouseEvent<HTMLDivElement>) {
    beginAppRightPanelResize(event, setRightPanelWidth);
  }

  function beginWorkflowRecorderReviewResize(event: ReactMouseEvent<HTMLDivElement>) {
    beginAppWorkflowRecorderReviewResize(event, setWorkflowRecorderReviewPanelWidth);
  }

  function openMediaPreviewModal(path: string, mediaKind: "image" | "video") {
    setMediaPreviewModal({ path, mediaKind });
  }

  const {
    clearAgentMemory,
    hydrateSearchRoutingSettingsForSettingsPanel,
    installModelProviderEndpoint,
    runLocalModelRuntimeLifecycleAction,
    saveModelProviderCredential,
    updateFeatureFlagSettings,
    updateLocalDeepResearchSettings,
    updateMediaPlaybackSettings,
    updateMemorySettings,
    updateModelRuntimeSettings,
    updatePlannerSettings,
    updateSearchRoutingSettings,
    updateSttSettings,
    updateThinkingDisplaySettings,
    updateVoiceSettings,
  } = createAppSettingsActions({
    setLocalDeepResearchSetup,
    setSearchRoutingHydrationError,
    setSearchRoutingHydrating,
    setState,
    state,
  });

  async function refreshAgentMemoryDiagnostics() {
    setAgentMemoryDiagnosticsError(undefined);
    setAgentMemoryDiagnosticsLoading(true);
    try {
      setAgentMemoryDiagnostics(await window.ambientDesktop.getAgentMemoryDiagnostics());
    } catch (err) {
      setAgentMemoryDiagnosticsError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentMemoryDiagnosticsLoading(false);
    }
  }

  async function runAgentMemoryEmbeddingLifecycleAction(action: AgentMemoryEmbeddingLifecycleActionKind) {
    setAgentMemoryEmbeddingActionError(undefined);
    setAgentMemoryEmbeddingActionLoading(action);
    try {
      const result = await window.ambientDesktop.runAgentMemoryEmbeddingLifecycleAction({ action });
      setAgentMemoryEmbeddingActionResult(result);
      setAgentMemoryDiagnostics(result.diagnostics);
    } catch (err) {
      setAgentMemoryEmbeddingActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentMemoryEmbeddingActionLoading(undefined);
    }
  }

  const {
    clearMessageVoiceArtifact,
    regenerateMessageVoice,
    revealMessageVoiceArtifact,
  } = createAppMessageVoiceActions({
    scheduleVoiceProviderRefresh,
    setError,
    setState,
  });

  const {
    cancelBrowserUserActionFromChat,
    continueAfterBrowserUserActionIfReady,
    openBrowserForUserAction,
    openExternalUrl,
    openUrlInAmbientBrowser,
    resumeBrowserUserActionFromChat,
  } = createAppBrowserActionControls({
    appendRunActivityLine,
    chatBrowserUserAction,
    resetRunActivityLines,
    running,
    setBrowserRevision,
    setChatBrowserUserAction,
    setChatBrowserUserActionBusy,
    setError,
    setRightPanel,
    setRunStatus,
    setThreadRunStatuses,
    state,
  });

  function updateSidebarOrganize(input: Partial<SidebarOrganizeSettings>) {
    setSidebarOrganize((current) => ({ ...current, ...input }));
  }

  const {
    retryFailedPrompt,
  } = createAppComposerRetryActions({
    resetPromptHistory,
    resetRunActivityLines,
    running,
    setContextAttachments,
    setContextError,
    setError,
    setRunStatus,
    setThreadRunStatuses,
    state,
  });

  const {
    compactActiveThread,
    duplicateActiveThreadFromTranscript,
    exportActiveChat,
    exportChatPdfThread,
    exportChatThread,
    exportDiagnostics,
    importDiagnostics,
    recoverActiveThreadContext,
    recoverActiveThreadContextAndRetryLatest,
  } = createAppThreadMaintenanceActions({
    applyProjectActionState,
    chatExportBusy,
    contextRecoveryBusy,
    latestRecoveryPrompt,
    projectIdForWorkspacePath,
    resetRunActivityLines,
    retryFailedPrompt,
    running,
    setChatExportBusy,
    setChatExportStatus,
    setContextRecoveryBusy,
    setError,
    setRunStatus,
    setState,
    setThreadRunStatuses,
    state,
  });

  function commandItems(): CommandPaletteItem[] {
    return createAppCommandPaletteItems({
      contextUsage: state?.contextUsage,
      handlers: {
        compactActiveThread,
        createThread,
        exportActiveChat: () => void exportActiveChat(),
        exportDiagnostics: async () => {
          await exportDiagnostics();
        },
        openApiKeyDialog,
        openMcpRuntimeSettings,
        openPanel,
        openWorkflowLabArea,
        openWorkflowRecordingsArea,
        openWorkspace,
        recoverActiveThreadContext: async () => {
          await recoverActiveThreadContext();
        },
        setSidebarOpen,
        togglePanel,
      },
      rightPanel,
      sidebarOpen,
      workflowRecorderNavLabel: workflowRecorderSurface.navLabel,
    });
  }

  async function runPaletteCommand(command: CommandPaletteItem) {
    setCommandPaletteOpen(false);
    setCommandPaletteQuery("");
    await command.run();
  }

  const {
    attachExistingWorktreeFromFooter,
    createBranchFromFooter,
    createThreadWorktreeFromFooter,
    switchBranch,
  } = createAppGitActions({
    activeWorkspacePath: state?.activeWorkspace.path,
    gitStatus,
    setActiveGitReview,
    setActiveGitReviewError,
    setGitConfirmation,
    setGitStatus,
    setGitStatusError,
    setWorkspaceRevision,
    workspacePath: state?.workspace.path,
  });

  const {
    addContextAttachments,
    attachComposerFiles,
    clearContextAttachments,
    removeContextAttachment,
  } = createAppContextAttachmentActions({
    allowExternalContext: state?.settings.permissionMode === "full-access",
    openAttachmentsPanel: () => openPanel("attachments"),
    setContextAttachments,
    setContextError,
  });

  function setLocalDeepResearchModeArmed(next: boolean) {
    localDeepResearchModeArmedRef.current = next;
    if (!next) setLocalDeepResearchBudgetOverride(undefined);
    setLocalDeepResearchModeArmedState(next);
  }

  const {
    clearActiveGoal,
    editActiveGoalObjective,
    pauseOrResumeActiveGoal,
    setActiveGoalBudget,
    toggleGoalMode,
  } = createAppGoalActions({
    goalModeArmed,
    setError,
    setGoalBusy,
    setGoalMenuOpen,
    setGoalModeArmed,
    setLocalDeepResearchModeArmed,
    setState,
    state,
  });

  function getComposerDraft() {
    return composerInputRef.current?.getValue() ?? composerDraftRef.current;
  }

  function setComposerDraft(value: string, options: { focusEnd?: boolean; clearSlashCommandSelection?: boolean } = {}) {
    const slashSelection = options.clearSlashCommandSelection ? undefined : selectedSlashCommandRef.current;
    if (options.clearSlashCommandSelection && selectedSlashCommandRef.current) {
      selectedSlashCommandRef.current = undefined;
      setSelectedSlashCommandState(undefined);
    }
    composerDraftRef.current = value;
    composerDraftStore.set(value);
    composerInputRef.current?.setValue(value);
    setComposerCanSubmit((current) => {
      const next = slashCommandComposerCanSubmit(value, slashSelection);
      return current === next ? current : next;
    });
    if (options.focusEnd) {
      window.setTimeout(() => composerInputRef.current?.focusEnd(), 0);
    }
  }

  function setSelectedSlashCommand(next: SlashCommandSelection | undefined): void {
    selectedSlashCommandRef.current = next;
    setSelectedSlashCommandState(next);
    setComposerCanSubmit((current) => {
      const canSubmit = slashCommandComposerCanSubmit(composerDraftRef.current, next);
      return current === canSubmit ? current : canSubmit;
    });
  }

  function selectSlashCommandEntry(entry: SlashCommandCatalogEntry, query: string, draft: string): void {
    if (entry.kind === "app") {
      setSelectedSlashCommand(undefined);
      setComposerDraft(slashCommandDraftAfterSelection(draft, entry), { focusEnd: true });
      return;
    }
    setSelectedSlashCommand(slashCommandSelectionFromEntry(entry, query));
    setComposerDraft(slashCommandDraftAfterSelection(draft, entry), { focusEnd: true });
    if (localDeepResearchModeArmedRef.current) setLocalDeepResearchModeArmed(false);
    setContextError(undefined);
  }

  function removeSlashCommandSelection(): void {
    setSelectedSlashCommand(undefined);
    window.setTimeout(() => composerInputRef.current?.focusEnd(), 0);
  }

  function showUnavailableSlashCommand(entry: SlashCommandCatalogEntry): void {
    setContextError(entry.availabilityReason ?? `${entry.title} is ${entry.availability}.`);
  }

  function registerPendingSubmittedPrompt(input: { threadId: string; content: string; delivery: MessageDelivery }): string | undefined {
    if (!input.content.trim()) return undefined;
    const id = `pending-submitted-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const prompt: PendingSubmittedPrompt = {
      id,
      threadId: input.threadId,
      content: input.content,
      delivery: input.delivery,
      createdAt: new Date().toISOString(),
      ...(state?.activeThreadId === input.threadId && state.messages.length > 0
        ? { afterMessageId: state.messages[state.messages.length - 1]?.id }
        : {}),
    };
    setPendingSubmittedPrompts((current) => [...current, prompt].slice(-10));
    return id;
  }

  function removePendingSubmittedPrompt(id: string | undefined): void {
    if (!id) return;
    setPendingSubmittedPrompts((current) => current.filter((prompt) => prompt.id !== id));
  }

  const {
    submitComposerDraft,
    submitDraft,
  } = createAppComposerSubmitActions({
    activeThreadWorkflowRecordingStopped: activeThread?.workflowRecording?.status === "stopped",
    appendRunActivityLine,
    compactActiveThread,
    contextAttachments,
    getComposerDraft,
    getSlashCommandSelection: () => selectedSlashCommandRef.current,
    goalModeArmed,
    localDeepResearchRunActive,
    localDeepResearchModeArmedRef,
    localDeepResearchRunBudgetRef,
    openAmbientCliSecretDialog,
    registerPendingSubmittedPrompt,
    pendingWorkflowRecordingEditContext,
    resetPromptHistory,
    removePendingSubmittedPrompt,
    resetRunActivityLines,
    running,
    setComposerDraft,
    setContextAttachments,
    setContextError,
    setError,
    setGoalModeArmed,
    setLocalDeepResearchModeArmed,
    setPendingWorkflowRecordingEditContext,
    setRunStatus,
    setSlashCommandSelection: setSelectedSlashCommand,
    setSttDraftMetadata,
    setThreadRunStatuses,
    state,
    sttDraftMetadata,
    updateThreadSettings,
    workflowRecordingReviewFeedbackActive,
  });

  const {
    sendRemoteSurfaceActivationPrompt,
    sendTelegramSessionSetupPrompt,
    startCapabilityBuilderPrompt,
    startWelcomeFirstRunCapabilityOnboarding,
    startWelcomeProviderCatalogCardOnboarding,
    startWelcomeRemoteSurfaceActivation,
  } = createAppCapabilityPromptActions({
    applyCreatedThreadState,
    resetPromptHistory,
    resetRunActivityLines,
    running,
    setContextAttachments,
    setContextError,
    setError,
    setRunStatus,
    setThreadRunStatuses,
    state,
  });

  const {
    answerPlannerDecisionQuestion,
    finalizePlannerPlan,
    implementPlannerPlan,
    openPlannerRevisionDialog,
    sendPlannerDurableRevision,
    submitPlannerRevisionDialog,
  } = createAppPlannerActions({
    getComposerDraft,
    plannerRevisionDialog,
    resetRunActivityLines,
    running,
    setComposerDraft,
    setContextError,
    setError,
    setPlannerRevisionDialog,
    setRunStatus,
    setState,
    setThreadRunStatuses,
    state,
    updateThreadSettings,
  });

  const {
    changeSymphonyBlocking,
    changeSymphonyMetric,
    changeSymphonyStepCustomText,
    selectSymphonyPattern,
    selectSymphonyStepChoice,
    submitSymphonyBuilderAction,
    toggleSymphonyBuilder,
  } = createAppSymphonyBuilderControls({
    appendRunActivityLine,
    focusComposerEnd: () => composerInputRef.current?.focusEnd(),
    getComposerDraft,
    rememberDesktopState,
    refreshWorkflowRecordingLibraryOverride,
    setError,
    setLocalDeepResearchModeArmed,
    setState,
    setSymphonyBuilderActionBusy,
    setSymphonyBuilderDraft,
    state,
    submitDraft,
    subagentUiEnabled,
    symphonyBuilderActionBusy,
    symphonyBuilderDraft,
    symphonyBuilderModel,
  });

  function toggleLocalDeepResearchMode() {
    if (!state || !localDeepResearchReady || state.settings.collaborationMode === "planner") {
      return;
    }
    setContextError(undefined);
    const next = !localDeepResearchModeArmedRef.current;
    setLocalDeepResearchModeArmed(next);
    if (next) setGoalModeArmed(false);
    window.setTimeout(() => composerInputRef.current?.focusEnd(), 0);
  }

  function selectLocalDeepResearchEffort(effort: LocalDeepResearchEffort) {
    setLocalDeepResearchBudgetOverride({ effort });
  }

  function setLocalDeepResearchCustomMaxToolCalls(maxToolCalls: number) {
    setLocalDeepResearchBudgetOverride({ effort: "custom", maxToolCalls });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void submitComposerDraft("prompt");
  }

  function handleComposerChange(value: string) {
    composerDraftRef.current = value;
    composerDraftStore.set(value);
    setComposerCanSubmit((current) => {
      const next = slashCommandComposerCanSubmit(value, selectedSlashCommandRef.current);
      return current === next ? current : next;
    });
    if (pendingWorkflowRecordingEditContext && !value.startsWith(pendingWorkflowRecordingEditContext.draftPrefix)) {
      setPendingWorkflowRecordingEditContext(undefined);
    }
    if (sttDraftMetadata && value.trim() !== sttDraftMetadata.content.trim()) setSttDraftMetadata(undefined);
    resetPromptHistory();
  }

  function handleComposerPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const currentDraft = textarea.value;
    const start = textarea.selectionStart ?? currentDraft.length;
    const end = textarea.selectionEnd ?? currentDraft.length;
    const next = `${currentDraft.slice(0, start)}${text}${currentDraft.slice(end)}`;
    setComposerDraft(next);
    handleComposerChange(next);
    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + text.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    const plainArrow = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (plainArrow && event.key === "ArrowUp" && shouldNavigatePromptHistory(event.currentTarget, "older")) {
      event.preventDefault();
      navigatePromptHistory("older");
      return;
    }
    if (plainArrow && event.key === "ArrowDown" && shouldNavigatePromptHistory(event.currentTarget, "newer")) {
      event.preventDefault();
      navigatePromptHistory("newer");
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitComposerDraft("prompt", event.altKey);
    }
  }

  async function sendWorkflowRecordingReviewPrompt(recording = activeThread?.workflowRecording) {
    if (!state || !recording || recording.status === "recording" || !recording.review?.draft) {
      setError("Stop the workflow recording before asking Ambient to review the draft playbook.");
      return;
    }
    await sendWorkflowRecordingReviewPromptForState(state.activeThreadId, recording);
  }

  async function sendWorkflowRecordingReviewPromptForState(
    threadId: string,
    recording: WorkflowRecordingState,
    options: { force?: boolean; activityLine?: string } = {},
  ) {
    if (!recording || recording.status === "recording" || !recording.review?.draft) {
      setError("Workflow recording stopped, but no review draft was available to send to Ambient.");
      return;
    }
    if (running && !options.force) return;
    setError(undefined);
    setContextError(undefined);
    setContextAttachments([]);
    resetPromptHistory();
    resetRunActivityLines(options.activityLine ?? "Workflow recording stopped; dedicated review sent to Ambient.", threadId);
    setRunStatus("starting");
    setThreadRunStatuses((statuses) => ({ ...statuses, [threadId]: "starting" }));
    await window.ambientDesktop
      .requestWorkflowRecordingReview({ threadId })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setRunStatus("error");
      });
  }

  async function retryWorkflowRecordingReview(recording: WorkflowRecordingState) {
    if (!state?.activeThreadId || !abortArmed) return;
    setError(undefined);
    let aborted = true;
    await window.ambientDesktop.abortRun(state.activeThreadId).catch((err) => {
      aborted = false;
      setError(err instanceof Error ? err.message : String(err));
    });
    if (!aborted) return;
    await sendWorkflowRecordingReviewPromptForState(state.activeThreadId, recording, {
      force: true,
      activityLine: "Workflow recording review retry sent to a fresh Ambient session.",
    });
  }

  async function runUpdateAction(action: "check" | "download" | "install" | "dismiss") {
    setUpdateBusy(true);
    setError(undefined);
    try {
      const update =
        action === "check"
          ? await window.ambientDesktop.checkForUpdates("manual")
          : action === "download"
            ? await window.ambientDesktop.downloadUpdate()
            : action === "install"
              ? await window.ambientDesktop.installUpdateAndRestart()
              : await window.ambientDesktop.dismissUpdateNotification();
      setState((current) => (current ? { ...current, app: { ...current.app, update } } : current));
      if (action === "dismiss") setUpdatePopoverOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdateBusy(false);
    }
  }

  if (!state || !activeThread || activeSubagentChildHiddenByFeatureFlag) {
    return <div className="boot">Ambient</div>;
  }

  const isMac = navigator.platform.toLowerCase().includes("mac");
  const activeActivity =
    activity?.threadId === state.activeThreadId && runtimeActivityVisibleForThreadGoal(activity, state.activeThreadGoal)
      ? activity
      : undefined;
  const composerSttProvider = sttProviderForCapabilityId(sttProviders, state.settings.stt.providerCapabilityId);
  const sttComposerRecording = sttComposer.status === "recording";
  const sttComposerBusy = sttComposer.status === "saving" || sttComposer.status === "transcribing";
  const sttComposerDisabled =
    sttComposerBusy || (!sttComposerRecording && (!state.settings.stt.enabled || !state.settings.stt.providerCapabilityId || !composerSttProvider?.available));
  const sttComposerShortcutLabel = state.settings.stt.pushToTalkShortcut
    ? sttShortcutLabel(state.settings.stt.pushToTalkShortcut)
    : undefined;
  const sttRuntimeQueueCount = sttRuntimeQueuedCount(state.sttQueue);
  const sttSpeechFollowUpCount = queuedSpeechFollowUpCount(state.messages);
  const sttQueuedSpeechCount = sttRuntimeQueueCount + sttSpeechFollowUpCount;
  const sttQueuedSpeechLabel = sttQueuedCountLabel(sttQueuedSpeechCount);
  const showSttComposerStrip = (sttComposer.status !== "idle" && Boolean(sttComposer.message)) || sttQueuedSpeechCount > 0;
  const sttComposerStripStatus = sttComposer.status === "idle" && sttQueuedSpeechCount > 0 ? "queued" : sttComposer.status;
  const sttComposerTitle = sttComposerRecording
    ? "Stop recording and transcribe"
    : !state.settings.stt.enabled || !state.settings.stt.providerCapabilityId || !composerSttProvider?.available
      ? "Enable speech input and select an available STT provider in Settings"
      : sttComposerBusy
        ? sttComposer.message ?? "Processing speech"
        : `Push to talk${sttComposerShortcutLabel ? ` (${sttComposerShortcutLabel})` : ""}`;
  const activeChatBrowserUserAction = chatBrowserUserActionForThread(chatBrowserUserAction, state.activeThreadId);
  const activePermissionRequest = selectActivePermissionRequest(
    permissionRequests.filter(promptRequestMatchesActiveProject),
    state.activeThreadId,
    threadRunStatuses,
  );
  const activePrivilegedCredentialRequest = privilegedCredentialRequests.find(promptRequestMatchesActiveProject);
  const activeSecureInputRequest = secureInputRequests.find(promptRequestMatchesActiveProject);
  const modalHostProps = createAppModalHostProps({
    activePermissionRequest,
    activePrivilegedCredentialRequest,
    activeSecureInputRequest,
    ambientCliSecretDialog,
    ambientCliSecretInputRef,
    apiDialogOpen,
    apiKeyBusy,
    apiKeyDraft,
    apiKeyInputRef,
    apiKeyStatus,
    clearSavedApiKey,
    clipboardCandidate,
    commandItems,
    commandPaletteOpen,
    commandPaletteQuery,
    confirmProjectActionDialog,
    confirmProjectBoardReset: projectBoardActions.confirmProjectBoardReset,
    confirmThreadActionDialog,
    gitConfirmation,
    localDeepResearchFollowupOpen,
    localDeepResearchQ8Override,
    localDeepResearchSetup,
    mediaPreviewModal,
    onApiKeyChange: setApiKeyDraft,
    onCommandPaletteQueryChange: setCommandPaletteQuery,
    onLocalDeepResearchQ8OverrideChange: setLocalDeepResearchQ8Override,
    openAmbientKeys,
    openSearchWebSettings,
    pasteAmbientCliSecret,
    pasteApiKey,
    plannerRevisionDialog,
    previewArtifact,
    projectActionDialog,
    projectBoardResetDialog,
    requestThreadPermissionModeChange,
    respondPermissionRequest,
    respondPrivilegedCredentialRequest,
    respondSecureInputRequest,
    runPaletteCommand,
    saveAmbientCliSecret,
    saveApiKey,
    setAmbientCliSecretDialog,
    setApiDialogOpen,
    setCommandPaletteOpen,
    setGitConfirmation,
    setLocalDeepResearchFollowupOpen,
    setMediaPreviewModal,
    setPlannerRevisionDialog,
    setProjectActionDialog,
    setProjectBoardResetDialog,
    setSubagentApprovalDecisionDialog,
    setSubagentBarrierDecisionDialog,
    setThreadActionDialog,
    setupLocalDeepResearchFromSettings,
    state,
    subagentApprovalDecisionDialog,
    subagentBarrierDecisionDialog,
    subagentUiEnabled,
    submitPlannerRevisionDialog,
    submitSubagentApprovalDecisionDialog,
    submitSubagentBarrierDecisionDialog,
    testApiKey,
    threadActionDialog,
    updateAmbientCliSecretDialog,
  });
  const automationsWorkspaceProps = createAppAutomationsWorkspaceProps({
    folders: automationFolders,
    onArchiveWorkflowRecordingPlaybook: archiveWorkflowRecordingPlaybook,
    onCreateProject: createWorkspace,
    onDesktopStateChanged: applyAutomationDesktopState,
    onEditWorkflowRecordingPlaybook: editWorkflowRecordingPlaybookInChat,
    onFoldersChanged: setAutomationFolders,
    onMoveThread: moveAutomationThread,
    onOpenMediaModal: openMediaPreviewModal,
    onOpenRunThread: openAutomationRunThread,
    onPreviewLocalPath: previewLocalFile,
    onPreviewPath: previewArtifact,
    onRestoreWorkflowRecordingVersion: restoreWorkflowRecordingVersion,
    onRevokePermissionGrant: revokePermissionGrant,
    onRevokePermissionGrantIds: revokePermissionGrantIds,
    onSelectPane: selectAutomationPane,
    onSelectThread: selectAutomationThread,
    onSelectWorkflowAgentThread: selectWorkflowAgentThread,
    onSelectWorkflowRecordingPlaybook: selectWorkflowRecordingForLab,
    onSetWorkflowRecordingEnabled: setWorkflowRecordingEnabled,
    onStartWorkflowRecording: startWorkflowRecording,
    onUnarchiveWorkflowRecordingPlaybook: unarchiveWorkflowRecordingPlaybook,
    onWorkflowAgentFoldersChanged: setWorkflowAgentFolders,
    orchestrationAutoRevision,
    orchestrationRevision,
    permissionAudit,
    permissionGrantRevoking,
    permissionGrants,
    refreshWorkflowRecordingLibrary,
    selectedAutomationPane,
    selectedFolder: selectedAutomationFolder,
    selectedThread: selectedAutomationThread,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread,
    selectedWorkflowRecording,
    setWorkflowCompileProgress,
    setWorkflowExplorationProgressByThreadId,
    setWorkflowRevision,
    state,
    workflowAgentFolders,
    workflowCompileProgress,
    workflowDiscoveryProgress,
    workflowExplorationProgressByThreadId,
    workflowLibraryIncludeArchived,
    workflowRecordingLibrary,
    workflowRevision,
    onWorkflowLibraryIncludeArchivedChange: setWorkflowLibraryIncludeArchived,
  });
  const projectBoardWorkspaceProps = createAppProjectBoardWorkspaceProps({
    actions: projectBoardActions,
    activeProject,
    activeThreadSuppressesProjectBoard,
    busy: activeProjectBoardBusy,
    sourceBusy: projectBoardSourceBusy,
    sourceImpactBusy: projectBoardSourceImpactBusy,
    kickoffDefaultsBusy: projectBoardKickoffDefaultsBusy,
    refineBusy: projectBoardRefineBusy,
    refineMode: projectBoardRefineMode,
    proposalAnswerBusy: projectBoardProposalAnswerBusy,
    proposalCardReviewBusy: projectBoardProposalCardReviewBusy,
    proposalApplyBusy: projectBoardProposalApplyBusy,
    finalizeBusy: projectBoardFinalizeBusy,
    synthesisRetryBusy: projectBoardSynthesisRetryBusy,
    synthesisDeferBusy: projectBoardSynthesisDeferBusy,
    synthesisPauseBusy: projectBoardSynthesisPauseBusy,
    revisionBusy: projectBoardRevisionBusy,
    orchestrationRevision,
    projectBoardOpen,
    runActivityLinesByThread,
    threadRunStatuses,
    onClose: closeProjectBoard,
  });
  const conversationMessagesProps = createAppConversationMessagesProps({
    goalCompletionCelebrationId,
    chatFindOpen,
    chatFindInputRef,
    chatFindQuery,
    chatFindCount,
    chatFindIndex,
    onChatFindQueryChange: setChatFindQuery,
    onChatFindPrevious,
    onChatFindNext,
    onChatFindClose,
    activeThreadVoiceStatusVisible,
    activeThreadVoiceStatus,
    activeThreadVoiceStatusDismissKey,
    onDismissActiveThreadVoiceStatus: dismissActiveThreadVoiceStatus,
    activeSubagentInspector,
    activeThread,
    activeProjectHasBoard: Boolean(activeProject?.board),
    workflowRecordingReviewRunning,
    running,
    abortArmed,
    activeRunActivityLines,
    runStatus,
    retryStats: retryStatsByThread[state.activeThreadId],
    chatExportBusy,
    onRetryWorkflowRecordingReview: retryWorkflowRecordingReview,
    onStopWorkflowRecording: stopActiveWorkflowRecording,
    onExportActiveChat: exportActiveChat,
    scrollRef,
    onMessagesScroll: handleMessagesScroll,
    visibleChatMessages,
    activeChatBrowserUserAction,
    workflowRecorderEmptyChatState,
    welcomeAmbientPluginRegistry,
    onOpenAmbientKeys: openAmbientKeys,
    onOpenApiKeyDialog: openApiKeyDialog,
    onStartWelcomeFirstRunCapabilityOnboarding: startWelcomeFirstRunCapabilityOnboarding,
    onStartWelcomeProviderCatalogCardOnboarding: startWelcomeProviderCatalogCardOnboarding,
    onStartWelcomeRemoteSurfaceActivation: startWelcomeRemoteSurfaceActivation,
    onOpenPanel: openPanel,
    voiceProviderLabels,
    streamingAssistantId,
    retryableMessageIds,
    onRetryMessage: retryFailedPrompt,
    onSendTelegramSessionSetupPrompt: sendTelegramSessionSetupPrompt,
    onSendRemoteSurfaceActivationPrompt: sendRemoteSurfaceActivationPrompt,
    onPreviewPath: previewArtifact,
    onPreviewLocalPath: previewLocalFile,
    onOpenMediaModal: openMediaPreviewModal,
    latestReadyVoiceAutoplay,
    autoplayVoiceKey,
    activeVoiceMessageId,
    onActiveVoiceMessageChange: setActiveVoiceMessageId,
    onRegenerateVoice: regenerateMessageVoice,
    onRevealVoiceArtifact: revealMessageVoiceArtifact,
    onClearVoiceArtifact: clearMessageVoiceArtifact,
    onOpenUrl: openExternalUrl,
    onOpenBrowserUrl: openUrlInAmbientBrowser,
    artifactPathHints,
    plannerArtifactByMessageId,
    onImplementPlannerPlan: implementPlannerPlan,
    onRefinePlannerPlan: openPlannerRevisionDialog,
    onRetryPlannerFinalization: finalizePlannerPlan,
    projectBoardActions,
    onAnswerPlannerDecisionQuestion: answerPlannerDecisionQuestion,
    contextRecoveryBusy,
    canRetryContextRecovery: Boolean(latestRecoveryPrompt),
    onRecoverActiveThreadContext: recoverActiveThreadContext,
    onRecoverAndRetryLatest: recoverActiveThreadContextAndRetryLatest,
    onDuplicateActiveThreadFromTranscript: duplicateActiveThreadFromTranscript,
    threadRunStatuses,
    thinkingDisplayMode,
    runActivityLinesByThread,
    subagentParentClustersByMessageId,
    onSelectThread: selectThread,
    onCancelSubagentChild: cancelSubagentChild,
    onCloseSubagentChild: closeSubagentChild,
    onOpenCallableWorkflowThread: openCallableWorkflowThread,
    onPauseCallableWorkflowTask: pauseCallableWorkflowTask,
    onResumeCallableWorkflowTask: resumeCallableWorkflowTask,
    onCancelCallableWorkflowTask: cancelCallableWorkflowTask,
    onResolveSubagentBarrierAction: resolveSubagentBarrierAction,
    onResolveSubagentApprovalAction: resolveSubagentApprovalAction,
    subagentChildCancelBusy,
    subagentChildCloseBusy,
    callableWorkflowTaskPauseBusy,
    callableWorkflowTaskResumeBusy,
    callableWorkflowTaskCancelBusy,
    subagentBarrierActionBusy,
    subagentApprovalActionBusy,
    chatBrowserUserActionBusy,
    onResumeBrowserUserAction: resumeBrowserUserActionFromChat,
    onCancelBrowserUserAction: cancelBrowserUserActionFromChat,
    onOpenBrowserForUserAction: openBrowserForUserAction,
    transientThinkingActivityLines,
    visibleRunActivityLines,
    runStatusCardVisible,
    showScrollToBottom,
    onJumpToLatestMessage: jumpToLatestMessage,
    errorNeedsSessionRecovery,
    error,
    onDismissError: clearError,
    activeWorkspaceIsPreparedLocalTask,
    activeActivity,
    state,
  });
  return (
    <div className={`app-shell ${isMac ? "platform-macos" : ""}`}>
      <DesktopUpdateNotice
        update={state.app.update}
        open={updatePopoverOpen}
        busy={updateBusy}
        onToggle={() => setUpdatePopoverOpen((open) => !open)}
        onCheck={() => void runUpdateAction("check")}
        onDownload={() => void runUpdateAction("download")}
        onInstall={() => void runUpdateAction("install")}
        onDismiss={() => void runUpdateAction("dismiss")}
      />
      {sidebarOpen && (
        <AppShellSidebar
          width={sidebarWidth}
          minWidth={MIN_SIDEBAR_WIDTH}
          maxWidth={MAX_SIDEBAR_WIDTH}
          sidebarArea={sidebarArea}
          selectedAutomationPane={selectedAutomationPane}
          projectPopover={projectPopover}
          projectsCollapsed={projectsCollapsed}
          sidebarOrganize={sidebarOrganize}
          sidebarProjects={sidebarProjects}
          sidebarThreads={sidebarThreads}
          activeProjectPath={state.workspace.path}
          activeThreadId={state.activeThreadId}
          activeThreadSuppressesProjectBoard={activeThreadSuppressesProjectBoard}
          projectBoardBusyProjectIds={projectBoardBusyProjectIds}
          projectBoardOpen={projectBoardOpen}
          threadRunStatuses={threadRunStatuses}
          sidebarAgeNow={sidebarAgeNow}
          workflowAgentFolders={workflowAgentFolders}
          workflowRecordingLibrary={state.workflowRecordingLibrary}
          selectedWorkflowAgentFolderId={selectedWorkflowAgentFolder?.id}
          selectedWorkflowAgentThreadId={selectedWorkflowAgentThreadId}
          selectedWorkflowRecordingId={selectedWorkflowRecordingId}
          automationsCollapsed={automationsCollapsed}
          automationPopover={automationPopover}
          workflowAgentNavigationError={workflowAgentNavigationError}
          projectContextMenu={projectContextMenu}
          threadContextMenu={threadContextMenu}
          onCloseSidebar={() => setSidebarOpen(false)}
          onPrimaryCreate={() => void runPrimaryCreateAction()}
          onOpenSidebarArea={openSidebarArea}
          onOpenPanel={openPanel}
          onOpenWorkflowRecordingsArea={openWorkflowRecordingsArea}
          onOpenWorkflowLabArea={openWorkflowLabArea}
          onToggleProjectsCollapsed={() => setProjectsCollapsed((collapsed) => !collapsed)}
          onToggleProjectPopover={(popover) => setProjectPopover((current) => (current === popover ? undefined : popover))}
          onCreateWorkspace={() => {
            setProjectPopover(undefined);
            void createWorkspace();
          }}
          onOpenWorkspace={() => {
            setProjectPopover(undefined);
            void openWorkspace();
          }}
          onOrganizeChange={updateSidebarOrganize}
          onSelectProject={(projectPath) => selectProject(projectPath)}
          onOpenProjectContextMenu={openProjectContextMenu}
          onBuildProjectBoard={(project) => void projectBoardActions.buildProjectBoard(project)}
          onCloseProjectBoard={() => setProjectBoardOpen(false)}
          onOpenProjectBoard={(project) => void projectBoardActions.openProjectBoard(project)}
          onCreateThreadInProject={(projectPath) => createThreadInProject(projectPath)}
          onSelectThread={(threadId, workspacePath) => selectThread(threadId, workspacePath)}
          onOpenThreadContextMenu={openThreadContextMenu}
          onToggleAutomationsCollapsed={() => setAutomationsCollapsed((collapsed) => !collapsed)}
          onToggleAutomationPopover={(popover) => setAutomationPopover((current) => (current === popover ? undefined : popover))}
          onCreateWorkflowAgentFolder={createWorkflowAgentFolder}
          onRefreshWorkflowAgentFolders={() => void loadWorkflowAgentFolders()}
          onComposeInWorkflowAgentFolder={(folderId) => openNewWorkflowComposer(folderId)}
          onSelectWorkflowAgentFolder={selectWorkflowAgentFolder}
          onSelectWorkflowAgentThread={selectWorkflowAgentThread}
          onSelectWorkflowRecording={selectWorkflowRecordingForSidebar}
          onToggleProjectPinned={(project) => void toggleProjectPinned(project)}
          onRevealProject={(project) => void revealProject(project)}
          onCreatePermanentProjectWorktree={(project) => void createPermanentProjectWorktree(project)}
          onRenameProject={renameProject}
          onArchiveProjectChats={archiveProjectChats}
          onRemoveProject={removeProject}
          onToggleThreadPinned={() => void toggleThreadPinned()}
          onRenameThread={renameThread}
          onArchiveThread={archiveThread}
          onMarkThreadUnread={() => void markThreadUnread()}
          onRevealThread={() => void revealThread()}
          onCopyThreadWorkingDirectory={() => void copyThreadWorkingDirectory()}
          onCopyThreadSessionId={() => void copyThreadSessionId()}
          onCopyThreadDeeplink={() => void copyThreadDeeplink()}
          onExportThreadPdf={() => {
            const input = threadActionInput(threadContextMenu);
            setThreadContextMenu(undefined);
            void exportChatPdfThread(input);
          }}
          onForkThread={(mode) => void forkThread(mode)}
          onOpenThreadMiniWindow={() => void openThreadMiniWindow()}
          onBeginResize={beginSidebarResize}
        />
      )}

      <main className="main">
        <AppTopbar
          sidebarOpen={sidebarOpen}
          title={
            sidebarArea === "automations"
              ? selectedWorkflowAgentThread?.title || selectedWorkflowAgentFolder?.name || workflowRecorderSurface.homeTitle
              : activeThread.title
          }
          providerHasApiKey={state.provider.hasApiKey}
          providerLabel={state.provider.providerLabel}
          projectBoardAction={activeProjectBoardTopbarAction}
          gitReview={activeGitReview}
          gitReviewError={activeGitReviewError}
          rightPanel={rightPanel}
          onShowSidebar={() => setSidebarOpen(true)}
          onOpenApiKey={() => void openApiKeyDialog()}
          onOpenGitSummary={openGitSummaryPanel}
          onTogglePanel={togglePanel}
        />

          <div className="content-row">
            <AppWorkspaceRouter
              sidebarArea={sidebarArea}
              automationsProps={automationsWorkspaceProps}
              projectBoardProps={projectBoardWorkspaceProps}
              conversationReviewPanelDocked={conversationReviewPanelDocked}
              workflowRecorderReviewPanelWidth={workflowRecorderReviewPanelWidth}
              onBeginWorkflowRecorderReviewResize={beginWorkflowRecorderReviewResize}
              conversationMessagesProps={conversationMessagesProps}
              composerProps={{
                state: state,
                composerInputRef: composerInputRef,
                composerDraftStore: composerDraftStore,
                composerCanSubmit: composerCanSubmit,
                selectedSlashCommand: selectedSlashCommand,
                running: running,
                abortArmed: abortArmed,
                workflowRecordingReviewFeedbackActive: workflowRecordingReviewFeedbackActive,
                symphonyBuilderModel: symphonyBuilderModel,
                symphonyBuilderDraft: symphonyBuilderDraft,
                symphonyBuilderActionBusy: symphonyBuilderActionBusy,
                contextAttachments: contextAttachments,
                contextError: contextError,
                sessionContextMissing: sessionContextMissing,
                contextRecoveryBusy: contextRecoveryBusy,
                canRetryContextRecovery: Boolean(latestRecoveryPrompt),
                chatExportStatus: chatExportStatus,
                chatExportBusy: chatExportBusy,
                showSttComposerStrip: showSttComposerStrip,
                sttComposer: sttComposer,
                sttQueuedSpeechLabel: sttQueuedSpeechLabel,
                sttComposerStripStatus: sttComposerStripStatus,
                sttComposerRecording: sttComposerRecording,
                sttComposerBusy: sttComposerBusy,
                sttComposerDisabled: sttComposerDisabled,
                sttComposerShortcutLabel: sttComposerShortcutLabel,
                sttComposerTitle: sttComposerTitle,
                localDeepResearchReady: localDeepResearchReady,
                localDeepResearchRunActive: localDeepResearchRunActive,
                localDeepResearchModeArmed: localDeepResearchModeArmed,
                localDeepResearchRunBudget: localDeepResearchRunBudget,
                goalModeArmed: goalModeArmed,
                goalBusy: goalBusy,
                showRevisePlanControl: Boolean(latestDurablePlannerPlanArtifact),
                activeThreadSuppressesProjectBoard: activeThreadSuppressesProjectBoard,
                projectBoardThreadPlanAction: projectBoardThreadPlanAction,
                projectBoardPlanPickerOpen: projectBoardPlanPickerOpen,
                readyPlannerPlanArtifacts: readyPlannerPlanArtifacts,
                modelPickerRef: modelPickerRef,
                modelPickerButtonRef: modelPickerButtonRef,
                modelPickerOpen: modelPickerOpen,
                composerModelOptions: composerModelOptions,
                selectedComposerModelOption: selectedComposerModelOption,
                activeGitReview: activeGitReview,
                activeGitReviewError: activeGitReviewError,
                gitStatus: gitStatus,
                gitStatusError: gitStatusError,
                goalMenuOpen: goalMenuOpen,
                onSubmit: submit,
                onComposerChange: handleComposerChange,
                onComposerPaste: handleComposerPaste,
                onComposerKeyDown: handleComposerKeyDown,
                onSelectSlashCommandEntry: selectSlashCommandEntry,
                onRemoveSlashCommand: removeSlashCommandSelection,
                onUnavailableSlashCommand: showUnavailableSlashCommand,
                onSelectSymphonyPattern: selectSymphonyPattern,
                onSelectSymphonyStepChoice: selectSymphonyStepChoice,
                onChangeSymphonyStepCustomText: changeSymphonyStepCustomText,
                onChangeSymphonyMetric: changeSymphonyMetric,
                onChangeSymphonyBlocking: changeSymphonyBlocking,
                onRunSymphonyOnce: () => void submitSymphonyBuilderAction("run-once"),
                onSaveSymphonyRecipe: () => void submitSymphonyBuilderAction("save-recipe"),
                onRemoveContextAttachment: removeContextAttachment,
                onClearContextAttachments: clearContextAttachments,
                onRecoverActiveThreadContext: () => void recoverActiveThreadContext(),
                onRecoverAndRetryLatest: () => void recoverActiveThreadContextAndRetryLatest(),
                onDuplicateActiveThreadFromTranscript: () => void duplicateActiveThreadFromTranscript(),
                onDismissChatExportStatus: () => setChatExportStatus(undefined),
                onPreviewSttArtifact: previewArtifact,
                onCancelSttComposerRecording: cancelSttComposerRecording,
                onRetrySttComposerTranscription: () => void retrySttComposerTranscription(),
                onDiscardSttComposerResult: discardSttComposerResult,
                onAttachComposerFiles: () => void attachComposerFiles(),
                onToggleSymphonyBuilder: toggleSymphonyBuilder,
                onToggleLocalDeepResearchMode: toggleLocalDeepResearchMode,
                onSelectLocalDeepResearchEffort: selectLocalDeepResearchEffort,
                onLocalDeepResearchCustomMaxToolCallsChange: setLocalDeepResearchCustomMaxToolCalls,
                onCompactActiveThread: () => void compactActiveThread(),
                onExportActiveChat: () => void exportActiveChat(),
                onCollaborationModeChange: (collaborationMode) => void updateThreadSettings({ collaborationMode }),
                onToggleGoalMode: () => void toggleGoalMode(),
                onPermissionModeChange: (permissionMode) => void requestThreadPermissionModeChange(permissionMode),
                onReviseLatestPlannerPlan: () => {
                  if (!latestDurablePlannerPlanArtifact) return;
                  const feedback = getComposerDraft().trim();
                  if (feedback) {
                    void sendPlannerDurableRevision(latestDurablePlannerPlanArtifact, feedback, { clearComposer: true }).catch(() => undefined);
                  } else {
                    openPlannerRevisionDialog(latestDurablePlannerPlanArtifact);
                  }
                },
                onRunProjectBoardThreadPlanAction: runProjectBoardThreadPlanAction,
                onAddPlannerPlanToBoard: (artifact) => void projectBoardActions.addPlannerPlanToBoard(artifact),
                onThinkingDisplayModeChange: (mode) => void updateThinkingDisplaySettings({ ...state.settings.thinkingDisplay, mode }),
                onThinkingLevelChange: (thinkingLevel) => void updateThreadSettings({ thinkingLevel }),
                setModelPickerOpen: setModelPickerOpen,
                onFocusModelPickerOption: focusModelPickerOption,
                onSelectComposerModel: (model) => void updateThreadSettings({ model }),
                onStartSttComposerRecording: () => void startSttComposerRecording(),
                onStopSttComposerRecording: () => void stopSttComposerRecording(),
                onAbortRun: () => void window.ambientDesktop.abortRun(state.activeThreadId),
                onCreateThreadWorktree: createThreadWorktreeFromFooter,
                onAttachExistingWorktree: () => void attachExistingWorktreeFromFooter(),
                onOpenGitSummary: openGitSummaryPanel,
                onSwitchBranch: (branch) => void switchBranch(branch),
                onCreateBranch: (name) => createBranchFromFooter(name),
                onToggleGoalMenu: () => setGoalMenuOpen((open) => !open),
                onPauseResumeGoal: () => void pauseOrResumeActiveGoal(),
                onEditGoalObjective: () => void editActiveGoalObjective(),
                onSetGoalBudget: () => void setActiveGoalBudget(),
                onClearGoal: () => void clearActiveGoal(),
              }}
              workflowReviewPanelProps={{
                recording: activeThread.workflowRecording,
                open: workflowRecordingReviewPanelOpen,
                running: running,
                onClose: () => setWorkflowRecordingReviewPanelOpen(false),
                onRetryReview: sendWorkflowRecordingReviewPrompt,
                onApplyLatestSummary: applyLatestWorkflowRecordingSummary,
                onSaveReviewEdit: updateActiveWorkflowRecordingReview,
                onDraftValidationError: setError,
                onFocusFeedback: () => {
                  if (workflowRecordingReviewFeedbackActive) composerInputRef.current?.focusEnd();
                },
                onConfirmReview: confirmActiveWorkflowRecordingReview,
              }}
            />

            <AppRightPanelHost
              panel={rightPanel}
              onBeginResize={beginRightPanelResize}
              panelWidth={rightPanelWidth}
              state={state}
              workspaceRevision={workspaceRevision}
              pluginCatalogRevision={pluginCatalogRevision}
              permissionAuditRevision={permissionAuditRevision}
              browserRevision={browserRevision}
              orchestrationRevision={orchestrationRevision}
              orchestrationAutoRevision={orchestrationAutoRevision}
              workflowRevision={workflowRevision}
              artifactPreviewRequest={artifactPreviewRequest}
              localFilePreviewRequest={localFilePreviewRequest}
              gitPanelTabRequest={gitPanelTabRequest}
              settingsFocusRequest={settingsFocusRequest}
              contextAttachments={contextAttachments}
              permissionAudit={permissionAudit}
              permissionGrants={permissionGrants}
              permissionAuditError={permissionAuditError}
              permissionGrantError={permissionGrantError}
              permissionGrantRevoking={permissionGrantRevoking}
              voiceProviders={voiceProviders}
              voiceProvidersLoading={voiceProvidersLoading}
              voiceProvidersError={voiceProvidersError}
              voiceProviderCacheStatus={voiceProviderCacheStatus}
              voiceProviderCacheActivity={voiceProviderCacheActivity}
              voiceCatalogRefresh={voiceCatalogRefresh}
              sttProviders={sttProviders}
              sttProvidersLoading={sttProvidersLoading}
              sttProvidersError={sttProvidersError}
              sttProviderCacheStatus={sttProviderCacheStatus}
              sttProviderCacheActivity={sttProviderCacheActivity}
              sttProviderSetup={sttProviderSetup}
              sttMicrophoneDevices={sttMicrophoneDevices}
              sttMicrophoneDevicesLoading={sttMicrophoneDevicesLoading}
              sttMicrophoneDevicesError={sttMicrophoneDevicesError}
              miniCpmVisionSetup={miniCpmVisionSetup}
              miniCpmVisionRuntimePath={miniCpmVisionRuntimePath}
              miniCpmVisionEndpointUrl={miniCpmVisionEndpointUrl}
              localDeepResearchSetup={localDeepResearchSetup}
              localDeepResearchQ8Override={localDeepResearchQ8Override}
              localDeepResearchRunHistory={localDeepResearchRunHistory}
              sttMicTest={sttMicTest}
              mcpContainerRuntimeInstallProgress={mcpContainerRuntimeInstallProgress}
              mcpDefaultCapabilityInstallProgress={mcpDefaultCapabilityInstallProgress}
              searchRoutingHydrating={searchRoutingHydrating}
              searchRoutingHydrationError={searchRoutingHydrationError}
              agentMemoryDiagnostics={agentMemoryDiagnostics}
              agentMemoryDiagnosticsLoading={agentMemoryDiagnosticsLoading}
              agentMemoryDiagnosticsError={agentMemoryDiagnosticsError}
              agentMemoryEmbeddingActionLoading={agentMemoryEmbeddingActionLoading}
              agentMemoryEmbeddingActionResult={agentMemoryEmbeddingActionResult}
              agentMemoryEmbeddingActionError={agentMemoryEmbeddingActionError}
              updateBusy={updateBusy}
              running={running}
              onLoadPermissionAudit={loadPermissionAudit}
              onLoadPermissionGrants={loadPermissionGrants}
              onRevokePermissionGrant={revokePermissionGrant}
              onRevokePermissionGrantIds={revokePermissionGrantIds}
              onOpenApiKey={() => void openApiKeyDialog()}
              onCheckUpdates={() => void runUpdateAction("check")}
              onThemePreferenceChange={(themePreference) => updateThemePreference(themePreference)}
              onMediaPlaybackSettingsChange={(media) => void updateMediaPlaybackSettings(media)}
              onThinkingDisplaySettingsChange={(thinkingDisplay) => void updateThinkingDisplaySettings(thinkingDisplay)}
              onModelRuntimeSettingsChange={(modelRuntime) => void updateModelRuntimeSettings(modelRuntime)}
              onSaveModelProviderCredential={(input) => saveModelProviderCredential(input)}
              onInstallModelProviderEndpoint={(input) => installModelProviderEndpoint(input)}
              onRunLocalModelRuntimeLifecycleAction={(input) => runLocalModelRuntimeLifecycleAction(input)}
              onFeatureFlagSettingsChange={(featureFlags) => void updateFeatureFlagSettings(featureFlags)}
              onMemorySettingsChange={(memory) => void updateMemorySettings(memory)}
              onActiveThreadMemoryEnabledChange={(memoryEnabled) => void updateThreadSettings({ memoryEnabled })}
              onRefreshAgentMemoryDiagnostics={() => void refreshAgentMemoryDiagnostics()}
              onRunAgentMemoryEmbeddingLifecycleAction={(action) => void runAgentMemoryEmbeddingLifecycleAction(action)}
              onClearAgentMemory={() => void clearAgentMemory()}
              onPlannerSettingsChange={(planner) => void updatePlannerSettings(planner)}
              onHydrateSearchRoutingSettings={() => void hydrateSearchRoutingSettingsForSettingsPanel()}
              onSearchRoutingSettingsChange={(search) => void updateSearchRoutingSettings(search)}
              onLocalDeepResearchSettingsChange={(localDeepResearch) => void updateLocalDeepResearchSettings(localDeepResearch)}
              onOpenAmbientCliSecretDialog={openAmbientCliSecretDialog}
              onVoiceSettingsChange={(voice) => void updateVoiceSettings(voice)}
              onLoadVoiceProviders={loadVoiceProviders}
              onRefreshVoiceCatalog={(providerCapabilityId) => void refreshVoiceCatalog(providerCapabilityId)}
              onSttSettingsChange={(stt) => void updateSttSettings(stt)}
              onLoadSttProviders={loadSttProviders}
              onLoadSttMicrophoneDevices={(requestPermission) => void loadSttMicrophoneDeviceList({ requestPermission })}
              onSetupSttProvider={(action) => void setupSttProvider(action)}
              onSetupMiniCpmVisionProvider={(action) => void setupMiniCpmVisionProviderFromSettings(action)}
              onMiniCpmVisionRuntimePathChange={setMiniCpmVisionRuntimePath}
              onMiniCpmVisionEndpointUrlChange={setMiniCpmVisionEndpointUrl}
              onSetupLocalDeepResearch={(action) => void setupLocalDeepResearchFromSettings(action)}
              onLocalDeepResearchQ8OverrideChange={setLocalDeepResearchQ8Override}
              onLoadLocalDeepResearchRunHistory={() => void loadLocalDeepResearchRunHistory()}
              onStartSttMicTest={() => void startSttMicTest()}
              onStopSttMicTest={() => void stopSttMicTestAndValidate()}
              onCancelSttMicTest={cancelSttMicTest}
              onClearMcpContainerRuntimeInstallProgress={() => setMcpContainerRuntimeInstallProgress(undefined)}
              onClearMcpDefaultCapabilityInstallProgress={() => setMcpDefaultCapabilityInstallProgress(undefined)}
              onExportDiagnostics={() => exportDiagnostics()}
              onImportDiagnostics={() => importDiagnostics()}
              onSelectThread={(threadId, workspacePath) => selectThread(threadId, workspacePath)}
              onAddContext={addContextAttachments}
              onRemoveContext={removeContextAttachment}
              onClearContext={clearContextAttachments}
              onContextError={setContextError}
              onGitReviewChanged={setActiveGitReview}
              onWorkspaceChanged={() => setWorkspaceRevision((revision) => revision + 1)}
              onStartCapabilityBuilder={(prompt, newChat, activityLine) => startCapabilityBuilderPrompt(prompt, newChat, activityLine)}
              onOpenPluginCapabilities={() => setRightPanel("plugins")}
              onOpenMcpRuntimeSettings={openMcpRuntimeSettings}
              onDefaultCapabilityInstalled={() => {
                void openLocalDeepResearchFollowupIfSetupNeeded();
              }}
              onBrowserUserActionCompleted={(action, browserState) => continueAfterBrowserUserActionIfReady(action, browserState)}
              onClose={() => setRightPanel(undefined)}
            />
        </div>
      </main>

      <AppModalHost {...modalHostProps} />
    </div>
  );
}
