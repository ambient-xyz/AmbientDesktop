import type { CSSProperties, ReactNode, RefObject } from "react";

import type { AutomationScheduleSummary } from "../../shared/automationTypes";
import type {
  AmbientPermissionGrant,
  PermissionAuditEntry,
  PermissionMode,
  PermissionPromptResponseMode,
} from "../../shared/permissionTypes";
import type { AmbientPluginRegistry } from "../../shared/pluginTypes";
import type { ChatMessage, RuntimeActivity } from "../../shared/threadTypes";
import type {
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowCompileProgress,
  WorkflowDashboard,
  WorkflowExecutionMode,
  WorkflowExplorationProgress,
  WorkflowExplorationTraceSummary,
  WorkflowGraphNode,
  WorkflowRecoveryAction,
  WorkflowRevisionSummary,
  WorkflowRunDetail,
  WorkflowRunLimitOverrides,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";
import type { WorkflowArtifactPanelRenderers } from "./AutomationsWorkflowArtifactInspectorViews";
import type { WorkflowDiscoveryThreadWorkspace } from "./AutomationsWorkflowDiscoveryViews";
import type { WorkflowReviewWorkspaceProps } from "./AutomationsWorkflowReviewViews";
import type { WorkflowArtifactPanelId, WorkflowBuildPanelId } from "./workflowArtifactPanelUiModel";
import type { WorkflowGraphEventCard } from "./workflowAgentGraphUiModel";
import type { WorkflowPersistentStatusTarget } from "./workflowPersistentStatusUiModel";
import type { WorkflowRunsPanelId } from "./workflowRunsPanelUiModel";

type WorkflowThreadPaneLayoutStyle = CSSProperties & { "--workflow-split-primary"?: string };

export type AutomationsWorkflowThreadPaneRenderersInput = {
  activeThreadId?: string;
  artifactById: ReadonlyMap<string, WorkflowArtifactSummary>;
  automationPluginRegistry?: AmbientPluginRegistry;
  automationSchedules: AutomationScheduleSummary[];
  expandedScheduleHistoryId?: string;
  focusedScheduleId?: string;
  getWorkflowArtifactPanels: () => WorkflowArtifactPanelRenderers;
  optimisticWorkflowDiscoveryAnswers: Record<string, true>;
  permissionAudit: PermissionAuditEntry[];
  permissionGrantRevoking?: string;
  permissionGrants: AmbientPermissionGrant[];
  permissionMode: PermissionMode;
  renderWorkflowSplitHandle: () => ReactNode;
  scheduleBusy?: boolean;
  scheduleEnabled: boolean;
  scheduleError?: string;
  scheduleExpression: string;
  schedulePreset: WorkflowReviewWorkspaceProps["schedulePreset"];
  scheduleTargetType?: string;
  selectedWorkflowAgentArtifact?: WorkflowArtifactSummary;
  selectedWorkflowAgentDetail?: WorkflowRunDetail;
  selectedWorkflowAgentSourceNode?: WorkflowGraphNode;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  selectedWorkflowGraphNodeId?: string;
  tooltips: {
    auditPreview: string;
    connectorGrants: string;
    reviewQueue: string;
  };
  workflowArtifactPanelByThreadId: Record<string, WorkflowArtifactPanelId | undefined>;
  workflowBusy?: string;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowCompileThreadId?: string;
  workflowConnectorAccounts?: WorkflowReviewWorkspaceProps["connectorAccounts"];
  workflowDashboard?: WorkflowDashboard;
  workflowDiscoveryAnswers: Record<string, string>;
  workflowDiscoveryBusy?: string;
  workflowDiscoveryLayoutStyle?: WorkflowThreadPaneLayoutStyle;
  workflowDiscoveryProgress?: Parameters<typeof WorkflowDiscoveryThreadWorkspace>[0]["workflowDiscoveryProgress"];
  workflowError?: string;
  workflowExplorationProgressByThreadId: Record<string, WorkflowExplorationProgress | undefined>;
  workflowExplorationSkippedByThreadId: Record<string, string | undefined>;
  workflowExplorationTracesByThreadId: Record<string, WorkflowExplorationTraceSummary[] | undefined>;
  workflowRequestRef: RefObject<HTMLTextAreaElement | null>;
  workflowRequestRestartDrafts: Record<string, string>;
  workflowRevisions: WorkflowRevisionSummary[];
  workflowRunIdleTimeoutMs: number;
  workflowRunsPanelByThreadId: Record<string, WorkflowRunsPanelId | undefined>;
  workflowRunTotalLimitMode: WorkflowReviewWorkspaceProps["workflowRunTotalLimitMode"];
  workflowSourceDrafts: Record<string, string>;
  workflowThreadChatMessagesByThreadId: Record<string, ChatMessage[] | undefined>;
  workflowThreadComposerBusy?: string;
  workflowThreadComposerDrafts: Record<string, string>;
  workflowThreadPlanEditActivityByThreadId: Record<string, RuntimeActivity | undefined>;
  workflowThreadSessionBusy?: string;
  workflowVersions: WorkflowVersionSummary[];
  workspacePath: string;
  actions: {
    answerWorkflowDiscoveryQuestion: (questionId: string, choiceId?: string, freeform?: string) => void | Promise<unknown>;
    cancelWorkflowRun: WorkflowReviewWorkspaceProps["onCancelRun"];
    clearWorkflowSourceDraft: (artifactId: string) => void;
    compileWorkflowThreadPreview: (thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) => void | Promise<unknown>;
    copyWorkflowCompileFailureReport: (reportText: string) => void | Promise<unknown>;
    debugRewriteWorkflowRun: (card: WorkflowGraphEventCard) => void | Promise<unknown>;
    focusScheduleHistory: (scheduleId: string) => void;
    focusWorkflowRequestEditor: () => void;
    openWorkflowCompileDiagnostics: (path: string) => void | Promise<unknown>;
    openWorkflowPanelFromTranscript: (workflowThreadId: string | undefined, panel: WorkflowArtifactPanelId) => void;
    openWorkflowPersistentStatusTarget: (workflowThreadId: string | undefined, target: WorkflowPersistentStatusTarget) => void;
    openWorkflowRunDetail: (runId: string, options?: { focusConsole?: boolean }) => void | Promise<unknown>;
    prepareWorkflowThreadSession: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
    recoverWorkflowRun: (card: WorkflowGraphEventCard, action: WorkflowRecoveryAction) => void | Promise<unknown>;
    rejectWorkflowConnectorGrant: (
      artifactId: string,
      connector: Parameters<WorkflowReviewWorkspaceProps["onConnectorReject"]>[0],
    ) => void | Promise<unknown>;
    removeWorkflowConnectorScope: (
      artifactId: string,
      connector: Parameters<WorkflowReviewWorkspaceProps["onConnectorScopeRemove"]>[0],
      scope: string,
    ) => void | Promise<unknown>;
    revalidateWorkflowArtifactPreview: WorkflowReviewWorkspaceProps["onRevalidateArtifact"];
    resetWorkflowExplorationBudget: (threadId: string) => void;
    resolveWorkflowApproval: WorkflowReviewWorkspaceProps["onResolveApproval"];
    resolveWorkflowDiscoveryAccessRequest: (
      questionId: string,
      accessRequestId: string,
      response: PermissionPromptResponseMode,
    ) => void | Promise<unknown>;
    resolveWorkflowRevisionProposal: (revisionId: string, decision: "applied" | "rejected") => void | Promise<unknown>;
    reviewWorkflowArtifact: WorkflowReviewWorkspaceProps["onReviewArtifact"];
    runWorkflowArtifact: (
      artifactId: string,
      mode: WorkflowExecutionMode,
      options?: { resumeFromRunId?: string; allowUnapproved?: boolean; runLimits?: WorkflowRunLimitOverrides },
    ) => void | Promise<unknown>;
    runWorkflowExplorationForThread: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
    saveWorkflowArtifactSource: (artifactId: string, source: string) => Promise<void>;
    sendWorkflowThreadComposer: (thread: WorkflowAgentThreadSummary, detail?: WorkflowRunDetail) => void | Promise<unknown>;
    setSelectedWorkflowGraphNodeId: (nodeId: string | undefined) => void;
    setWorkflowArtifactPanel: (workflowThreadId: string | undefined, panel: WorkflowArtifactPanelId) => void;
    setWorkflowBuildPanel: (workflowThreadId: string | undefined, panel: WorkflowBuildPanelId) => void;
    setWorkflowDiscoveryAnswers: (updater: (current: Record<string, string>) => Record<string, string>) => void;
    setWorkflowRunsPanel: (workflowThreadId: string | undefined, panel: WorkflowRunsPanelId) => void;
    setWorkflowRequestRestartDrafts: (updater: (current: Record<string, string>) => Record<string, string>) => void;
    setWorkflowSourceDraft: (artifactId: string, source: string) => void;
    setWorkflowThreadComposerDrafts: (updater: (current: Record<string, string>) => Record<string, string>) => void;
    skipWorkflowExplorationForThread: (thread: WorkflowAgentThreadSummary) => void;
    startWorkflowArtifactRevision: (artifact: WorkflowArtifactSummary) => void | Promise<unknown>;
    restartWorkflowDiscoveryThread: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
    updateWorkflowConnectorAccount: (
      artifactId: string,
      connector: Parameters<WorkflowReviewWorkspaceProps["onConnectorAccountChange"]>[0],
      nextAccountId: string,
    ) => void | Promise<unknown>;
    updateWorkflowConnectorRetention: (
      artifactId: string,
      connector: Parameters<WorkflowReviewWorkspaceProps["onConnectorRetentionChange"]>[0],
      dataRetention: Parameters<WorkflowReviewWorkspaceProps["onConnectorRetentionChange"]>[1],
    ) => void | Promise<unknown>;
    updateWorkflowExplorationBudget: (threadId: string, field: keyof WorkflowExplorationBudgets, value: unknown) => void;
    workflowAuditReportPreview: (value: string | undefined) => string;
    workflowArtifactRunBlocked: (artifact: WorkflowArtifactSummary) => boolean;
    workflowExplorationBudgetsForThread: (threadId: string) => WorkflowExplorationBudgets;
    workflowRunLimitOverridesForArtifact: (artifact: WorkflowArtifactSummary) => WorkflowRunLimitOverrides;
    onCreateWorkflowReviewSchedule: WorkflowReviewWorkspaceProps["onCreateSchedule"];
    onCreateWorkflowScheduleGrant: (
      thread: WorkflowAgentThreadSummary,
      schedule: Parameters<WorkflowReviewWorkspaceProps["onCreateScheduleGrant"]>[0],
    ) => void | Promise<unknown>;
    onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
    onRevokePermissionGrant: WorkflowReviewWorkspaceProps["onRevokePermissionGrant"];
    onRevokePermissionGrantIds: WorkflowReviewWorkspaceProps["onRevokePermissionGrantIds"];
    onScheduleExpressionChange: WorkflowReviewWorkspaceProps["onScheduleExpressionChange"];
    onSchedulePresetChange: WorkflowReviewWorkspaceProps["onSchedulePresetChange"];
    onScheduleEnabledChange: WorkflowReviewWorkspaceProps["onScheduleEnabledChange"];
    onSelectPane: (pane: "schedules") => void;
    onSetExpandedScheduleHistoryId: WorkflowReviewWorkspaceProps["onSetExpandedScheduleHistoryId"];
    onSetScheduleTarget: (targetKind: "workflow_thread", targetId: string) => void;
    onWorkflowRunIdleTimeoutMsChange: WorkflowReviewWorkspaceProps["onWorkflowRunIdleTimeoutMsChange"];
    onWorkflowRunTotalLimitModeChange: WorkflowReviewWorkspaceProps["onWorkflowRunTotalLimitModeChange"];
  };
};
