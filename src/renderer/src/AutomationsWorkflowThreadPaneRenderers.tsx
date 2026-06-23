import type { CSSProperties, ReactNode, RefObject } from "react";

import type { AutomationScheduleSummary } from "../../shared/automationTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry, PermissionMode, PermissionPromptResponseMode } from "../../shared/permissionTypes";
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
  WorkflowRunSummary,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";
import { WorkflowBuildWorkspace, workflowBuildWorkspaceViewModel } from "./AutomationsWorkflowBuildViews";
import { WorkflowAgentDiagramPane } from "./AutomationsWorkflowDiagramViews";
import { latestWorkflowRunForArtifact } from "./AutomationsWorkflowDiscoveryController";
import {
  WorkflowDiscoveryThreadWorkspace,
  workflowDiscoveryThreadWorkspaceViewModel,
  WorkflowRequestEditor,
} from "./AutomationsWorkflowDiscoveryViews";
import { WorkflowExplorationPanel } from "./AutomationsWorkflowExplorationViews";
import { type WorkflowArtifactPanelRenderers } from "./AutomationsWorkflowArtifactInspectorViews";
import { WorkflowReviewWorkspace, type WorkflowReviewWorkspaceProps } from "./AutomationsWorkflowReviewViews";
import { WorkflowFocusedRunsPane } from "./AutomationsWorkflowRuntimeViews";
import { WorkflowThreadComposerView } from "./AutomationsWorkflowThreadComposerViews";
import { findWorkflowGraphNodeReviewActionTarget } from "./workflowGraphNodeReviewRouting";
import type { WorkflowGraphNodeReviewAction } from "./workflowGraphNodeReviewUiModel";
import type { WorkflowArtifactPanelId } from "./workflowArtifactPanelUiModel";
import type { WorkflowGraphEventCard } from "./workflowAgentGraphUiModel";
import { workflowExplorationGateForThread } from "./workflowExplorationGateUiModel";
import type { WorkflowPersistentStatusTarget } from "./workflowPersistentStatusUiModel";
import { workflowReviewWorkspaceViewModel } from "./workflowReviewUiModel";
import type { WorkflowBuildPanelId } from "./workflowArtifactPanelUiModel";
import type { WorkflowRunsPanelId } from "./workflowRunsPanelUiModel";
import { workflowThreadTranscriptCards, type WorkflowThreadTranscriptCard } from "./workflowThreadTranscriptUiModel";

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
    rejectWorkflowConnectorGrant: (artifactId: string, connector: Parameters<WorkflowReviewWorkspaceProps["onConnectorReject"]>[0]) => void | Promise<unknown>;
    removeWorkflowConnectorScope: (artifactId: string, connector: Parameters<WorkflowReviewWorkspaceProps["onConnectorScopeRemove"]>[0], scope: string) => void | Promise<unknown>;
    revalidateWorkflowArtifactPreview: WorkflowReviewWorkspaceProps["onRevalidateArtifact"];
    resetWorkflowExplorationBudget: (threadId: string) => void;
    resolveWorkflowApproval: WorkflowReviewWorkspaceProps["onResolveApproval"];
    resolveWorkflowDiscoveryAccessRequest: (questionId: string, accessRequestId: string, response: PermissionPromptResponseMode) => void | Promise<unknown>;
    resolveWorkflowRevisionProposal: (revisionId: string, decision: "applied" | "rejected") => void | Promise<unknown>;
    reviewWorkflowArtifact: WorkflowReviewWorkspaceProps["onReviewArtifact"];
    runWorkflowArtifact: (
      artifactId: string,
      mode: WorkflowExecutionMode,
      options?: { resumeFromRunId?: string; allowUnapproved?: boolean; runLimits?: WorkflowRunLimitOverrides },
    ) => void | Promise<unknown>;
    runWorkflowExplorationForThread: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
    saveWorkflowArtifactSource: (artifactId: string, source: string) => void | Promise<void>;
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
    updateWorkflowConnectorAccount: (artifactId: string, connector: Parameters<WorkflowReviewWorkspaceProps["onConnectorAccountChange"]>[0], nextAccountId: string) => void | Promise<unknown>;
    updateWorkflowConnectorRetention: (artifactId: string, connector: Parameters<WorkflowReviewWorkspaceProps["onConnectorRetentionChange"]>[0], dataRetention: Parameters<WorkflowReviewWorkspaceProps["onConnectorRetentionChange"]>[1]) => void | Promise<unknown>;
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

export function createAutomationsWorkflowThreadPaneRenderers(input: AutomationsWorkflowThreadPaneRenderersInput) {
  function workflowArtifactPanels() {
    return input.getWorkflowArtifactPanels();
  }

  function workflowExplorationGate(thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) {
    return workflowExplorationGateForThread({
      thread,
      revision,
      chatMessages: input.workflowThreadChatMessagesByThreadId[thread.id],
      traces: input.workflowExplorationTracesByThreadId[thread.id],
      progress: input.workflowExplorationProgressByThreadId[thread.id],
      skipped: Boolean(input.workflowExplorationSkippedByThreadId[thread.id]),
    });
  }

  function renderWorkflowReviewWorkspace(thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) {
    const reviewModel = workflowReviewWorkspaceViewModel({
      thread,
      artifact,
      runs: input.workflowDashboard?.runs ?? [],
      detail: input.selectedWorkflowAgentDetail,
      versions: input.workflowVersions,
      schedules: input.automationSchedules,
      permissionGrants: input.permissionGrants,
      permissionAudit: input.permissionAudit,
      permissionMode: input.permissionMode,
      auditThreadId: input.activeThreadId,
      workspacePath: input.workspacePath,
      selectedWorkflowAgentThreadId: input.selectedWorkflowAgentThread?.id,
      selectedWorkflowAgentSourceNode: input.selectedWorkflowAgentSourceNode,
      runLimits: input.actions.workflowRunLimitOverridesForArtifact(artifact),
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
        workflowRunIdleTimeoutMs={input.workflowRunIdleTimeoutMs}
        workflowRunTotalLimitMode={input.workflowRunTotalLimitMode}
        workflowBusy={input.workflowBusy}
        schedulePreset={input.schedulePreset}
        scheduleExpression={input.scheduleExpression}
        scheduleEnabled={input.scheduleEnabled}
        scheduleBusy={input.scheduleBusy}
        scheduleTargetType={input.scheduleTargetType}
        scheduleError={input.scheduleError}
        expandedScheduleHistoryId={input.expandedScheduleHistoryId}
        permissionGrantRevoking={input.permissionGrantRevoking}
        workflowSourceDraft={input.workflowSourceDrafts[artifact.id]}
        connectorAccounts={input.workflowConnectorAccounts}
        pluginRegistry={input.automationPluginRegistry}
        connectorGrantsTooltip={input.tooltips.connectorGrants}
        auditPreviewTooltip={input.tooltips.auditPreview}
        reviewQueueTooltip={input.tooltips.reviewQueue}
        renderVersionHistory={() => workflowArtifactPanels().renderVersionHistoryPanel(thread, artifact)}
        auditReportPreview={input.actions.workflowAuditReportPreview}
        onOpenPanel={(panel) => input.actions.openWorkflowPanelFromTranscript(thread.id, panel)}
        onWorkflowRunIdleTimeoutMsChange={input.actions.onWorkflowRunIdleTimeoutMsChange}
        onWorkflowRunTotalLimitModeChange={input.actions.onWorkflowRunTotalLimitModeChange}
        onRevalidateArtifact={input.actions.revalidateWorkflowArtifactPreview}
        onRunArtifact={(artifactId, mode, options) => input.actions.runWorkflowArtifact(artifactId, mode, options)}
        onOpenRunDetail={(runId) => {
          void input.actions.openWorkflowRunDetail(runId, { focusConsole: true });
        }}
        onReviewArtifact={input.actions.reviewWorkflowArtifact}
        onStartRevision={input.actions.startWorkflowArtifactRevision}
        onScheduleThread={(threadId) => {
          input.actions.onSetScheduleTarget("workflow_thread", threadId);
          input.actions.onSelectPane("schedules");
        }}
        onCancelRun={input.actions.cancelWorkflowRun}
        onSchedulePresetChange={input.actions.onSchedulePresetChange}
        onScheduleExpressionChange={input.actions.onScheduleExpressionChange}
        onScheduleEnabledChange={input.actions.onScheduleEnabledChange}
        onCreateSchedule={input.actions.onCreateWorkflowReviewSchedule}
        onCreateScheduleGrant={(schedule) => {
          void input.actions.onCreateWorkflowScheduleGrant(thread, schedule);
        }}
        onSetExpandedScheduleHistoryId={input.actions.onSetExpandedScheduleHistoryId}
        onConnectorAccountChange={(connector, nextAccountId) => {
          void input.actions.updateWorkflowConnectorAccount(artifact.id, connector, nextAccountId);
        }}
        onConnectorRetentionChange={(connector, dataRetention) => {
          void input.actions.updateWorkflowConnectorRetention(artifact.id, connector, dataRetention);
        }}
        onConnectorScopeRemove={(connector, scope) => {
          void input.actions.removeWorkflowConnectorScope(artifact.id, connector, scope);
        }}
        onConnectorReject={(connector) => {
          void input.actions.rejectWorkflowConnectorGrant(artifact.id, connector);
        }}
        onRevokePermissionGrantIds={input.actions.onRevokePermissionGrantIds}
        onRevokePermissionGrant={input.actions.onRevokePermissionGrant}
        onSelectSourceNode={input.actions.setSelectedWorkflowGraphNodeId}
        onSourceDraftChange={(source) => input.actions.setWorkflowSourceDraft(artifact.id, source)}
        onSourceDraftClear={() => input.actions.clearWorkflowSourceDraft(artifact.id)}
        onSourceSave={(source) => input.actions.saveWorkflowArtifactSource(artifact.id, source)}
        onResolveApproval={input.actions.resolveWorkflowApproval}
      />
    );
  }

  function renderWorkflowRequestEditor(thread: WorkflowAgentThreadSummary, ariaLabel = "Workflow request") {
    const requestDraft = input.workflowRequestRestartDrafts[thread.id] ?? thread.initialRequest;
    const requestChanged = requestDraft.trim() !== thread.initialRequest.trim();
    const restartBusy = input.workflowDiscoveryBusy === `restart:${thread.id}`;
    return (
      <WorkflowRequestEditor
        thread={thread}
        requestDraft={requestDraft}
        requestChanged={requestChanged}
        restartBusy={restartBusy}
        textareaRef={input.workflowRequestRef}
        ariaLabel={ariaLabel}
        onDraftChange={(threadId, value) => input.actions.setWorkflowRequestRestartDrafts((current) => ({ ...current, [threadId]: value }))}
        onReset={(workflowThread) =>
          input.actions.setWorkflowRequestRestartDrafts((current) => ({ ...current, [workflowThread.id]: workflowThread.initialRequest }))
        }
        onRestart={(workflowThread) => void input.actions.restartWorkflowDiscoveryThread(workflowThread)}
      />
    );
  }

  function renderWorkflowExplorationPanel(
    thread: WorkflowAgentThreadSummary,
    artifact?: WorkflowArtifactSummary,
    revision?: WorkflowRevisionSummary,
  ) {
    const traces = input.workflowExplorationTracesByThreadId[thread.id] ?? [];
    const gate = workflowExplorationGate(thread, revision);
    const explorationBudgets = input.actions.workflowExplorationBudgetsForThread(thread.id);
    return (
      <WorkflowExplorationPanel
        thread={thread}
        artifact={artifact}
        revision={revision}
        traces={traces}
        progress={input.workflowExplorationProgressByThreadId[thread.id]}
        gate={gate}
        budgets={explorationBudgets}
        workflowBusy={input.workflowBusy}
        onRunExploration={(workflowThread) => void input.actions.runWorkflowExplorationForThread(workflowThread)}
        onSkipExploration={input.actions.skipWorkflowExplorationForThread}
        onCompile={(workflowThread, workflowRevision) => void input.actions.compileWorkflowThreadPreview(workflowThread, workflowRevision)}
        onUpdateBudget={input.actions.updateWorkflowExplorationBudget}
        onResetBudget={input.actions.resetWorkflowExplorationBudget}
      />
    );
  }

  function handleWorkflowGraphNodeReviewAction(action: WorkflowGraphNodeReviewAction, artifact?: WorkflowArtifactSummary) {
    const workflowThreadId = artifact?.workflowThreadId ?? input.selectedWorkflowAgentThread?.id;
    if (action.targetSection === "source") input.actions.setWorkflowArtifactPanel(workflowThreadId, "source");
    if (action.targetSection === "audit") input.actions.setWorkflowArtifactPanel(workflowThreadId, "run_console");
    if (action.targetSection === "connectors") input.actions.setWorkflowArtifactPanel(workflowThreadId, "permissions");
    if (action.targetSection === "mutation_policy") input.actions.setWorkflowArtifactPanel(workflowThreadId, "manifest");
    if (action.id === "open_audit" && artifact) {
      const latestRun = input.workflowDashboard ? latestWorkflowRunForArtifact(input.workflowDashboard.runs, artifact.id) : undefined;
      if (latestRun && input.selectedWorkflowAgentDetail?.run.id !== latestRun.id) void input.actions.openWorkflowRunDetail(latestRun.id);
    }
    requestAnimationFrame(() => {
      const target = findWorkflowGraphNodeReviewActionTarget(document, action);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderWorkflowThreadComposer(thread: WorkflowAgentThreadSummary, detail?: WorkflowRunDetail) {
    const draft = input.workflowThreadComposerDrafts[thread.id] ?? "";
    return (
      <WorkflowThreadComposerView
        thread={thread}
        detail={detail}
        draft={draft}
        workflowBusy={input.workflowBusy}
        workflowDiscoveryBusy={input.workflowDiscoveryBusy}
        composerBusy={input.workflowThreadComposerBusy === thread.id}
        onDraftChange={(threadId, value) => input.actions.setWorkflowThreadComposerDrafts((current) => ({ ...current, [threadId]: value }))}
        onSend={(workflowThread, runDetail) => input.actions.sendWorkflowThreadComposer(workflowThread, runDetail)}
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
      selectedDetail: input.selectedWorkflowAgentDetail,
      runs: input.workflowDashboard?.runs ?? [],
      versions: input.workflowVersions,
      explorationTraceCount: input.workflowExplorationTracesByThreadId[thread.id]?.length ?? 0,
      explorationGate: workflowExplorationGate(thread),
      selectedWorkflowAgentThreadId: input.selectedWorkflowAgentThread?.id,
      selectedWorkflowAgentSourceNode: input.selectedWorkflowAgentSourceNode,
      workflowBusy: input.workflowBusy,
      workflowCompileThreadId: input.workflowCompileThreadId,
      workflowCompileProgress: input.workflowCompileProgress,
      workflowDiscoveryBusy: input.workflowDiscoveryBusy,
      workflowThreadSessionBusy: input.workflowThreadSessionBusy,
      workflowThreadComposerBusy: input.workflowThreadComposerBusy,
      sourceDrafts: input.workflowSourceDrafts,
    });
    return (
      <WorkflowBuildWorkspace
        thread={thread}
        artifact={artifact}
        {...buildModel}
        transcriptCards={transcriptCards}
        requestedArtifactPanel={input.workflowArtifactPanelByThreadId[thread.id]}
        selectedNodeId={input.selectedWorkflowGraphNodeId}
        workflowBusy={input.workflowBusy}
        onOpenPersistentStatusTarget={input.actions.openWorkflowPersistentStatusTarget}
        onSetBuildPanel={input.actions.setWorkflowBuildPanel}
        onPrepareSession={(workflowThread) => void input.actions.prepareWorkflowThreadSession(workflowThread)}
        onOpenTranscriptPanel={input.actions.openWorkflowPanelFromTranscript}
        onResolveRevision={(revisionId, decision) => void input.actions.resolveWorkflowRevisionProposal(revisionId, decision)}
        onRunExploration={(workflowThread) => void input.actions.runWorkflowExplorationForThread(workflowThread)}
        onSkipExploration={input.actions.skipWorkflowExplorationForThread}
        onCompile={(workflowThread) => void input.actions.compileWorkflowThreadPreview(workflowThread)}
        onSelectSourceNode={input.actions.setSelectedWorkflowGraphNodeId}
        onSourceDraftChange={input.actions.setWorkflowSourceDraft}
        onSourceDraftClear={input.actions.clearWorkflowSourceDraft}
        onSourceSave={(artifactId, source) => input.actions.saveWorkflowArtifactSource(artifactId, source)}
        renderRequestEditor={renderWorkflowRequestEditor}
        renderThreadComposer={renderWorkflowThreadComposer}
        renderReviewWorkspace={renderWorkflowReviewWorkspace}
        renderExplorationPanel={renderWorkflowExplorationPanel}
        renderRunConsolePanel={workflowArtifactPanels().renderRunConsolePanel}
        renderRuntimeInputPanel={workflowArtifactPanels().renderRuntimeInputPanel}
        renderOutputsPanel={workflowArtifactPanels().renderOutputsPanel}
        renderManifestPanel={workflowArtifactPanels().renderManifestPanel}
        renderPermissionsPanel={workflowArtifactPanels().renderPermissionsPanel}
        renderVersionHistoryPanel={workflowArtifactPanels().renderVersionHistoryPanel}
      />
    );
  }

  function renderWorkflowPersistentDiagramPane(thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) {
    const detail =
      input.selectedWorkflowAgentDetail && (!artifact || input.selectedWorkflowAgentDetail.artifact.id === artifact.id)
        ? input.selectedWorkflowAgentDetail
        : undefined;
    return (
      <section className="automation-section workflow-persistent-diagram-pane" data-workflow-artifact-panel="diagram">
        <WorkflowAgentDiagramPane
          thread={thread}
          artifact={artifact}
          events={detail?.events}
          detail={detail}
          selectedNodeId={input.selectedWorkflowGraphNodeId}
          activeNodeIdOverride={input.workflowExplorationProgressByThreadId[thread.id]?.status === "running" ? "agent-exploration" : undefined}
          onSelectNode={input.actions.setSelectedWorkflowGraphNodeId}
          onNodeReviewAction={(action) => handleWorkflowGraphNodeReviewAction(action, artifact)}
          debugRewriteBusyEventId={input.workflowBusy?.startsWith("debug-rewrite:") ? input.workflowBusy.slice("debug-rewrite:".length) : undefined}
          recoveryBusyKey={input.workflowBusy?.startsWith("recover:") ? input.workflowBusy.slice("recover:".length) : undefined}
          onRecover={(card, action) => void input.actions.recoverWorkflowRun(card, action)}
          onDebugRewrite={(card) => void input.actions.debugRewriteWorkflowRun(card)}
        />
      </section>
    );
  }

  function renderWorkflowThreadDetail(thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) {
    const threadRevisions = input.workflowRevisions.filter((revision) => revision.workflowThreadId === thread.id);
    const transcriptCards = workflowThreadTranscriptCards({
      thread,
      artifact,
      detail: input.selectedWorkflowAgentDetail,
      revisions: threadRevisions,
      chatMessages: input.workflowThreadChatMessagesByThreadId[thread.id],
      planEditActivity: input.workflowThreadPlanEditActivityByThreadId[thread.id],
      explorationProgress: input.workflowExplorationProgressByThreadId[thread.id],
      explorationTraces: input.workflowExplorationTracesByThreadId[thread.id],
      compileActive: input.workflowBusy === "compile" && input.workflowCompileThreadId === thread.id,
      compileProgress: input.workflowCompileThreadId === thread.id ? input.workflowCompileProgress : [],
      includeRequestCard: false,
    });
    return (
      <div className="automation-focused-grid workflow-discovery-layout" style={input.workflowDiscoveryLayoutStyle}>
        {renderWorkflowBuildWorkspace(thread, artifact, transcriptCards)}
        {input.renderWorkflowSplitHandle()}
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
          dashboard: input.workflowDashboard,
          selectedDetail: input.selectedWorkflowAgentDetail,
          activePanelId: input.workflowRunsPanelByThreadId[thread.id],
          artifactById: input.artifactById,
          workflowBusy: input.workflowBusy,
          workflowCompileThreadId: input.workflowCompileThreadId,
          workflowCompileProgress: input.workflowCompileProgress,
          workflowDiscoveryBusy: input.workflowDiscoveryBusy,
        }}
        slots={{
          layoutStyle: input.workflowDiscoveryLayoutStyle,
          splitHandle: input.renderWorkflowSplitHandle(),
          diagramPane: renderWorkflowPersistentDiagramPane(thread, artifact),
        }}
        actions={{
          runLimitsForArtifact: input.actions.workflowRunLimitOverridesForArtifact,
          isArtifactRunBlocked: input.actions.workflowArtifactRunBlocked,
          auditReportPreview: input.actions.workflowAuditReportPreview,
          onOpenPersistentStatusTarget: input.actions.openWorkflowPersistentStatusTarget,
          onSelectPanel: input.actions.setWorkflowRunsPanel,
          onRunArtifact: input.actions.runWorkflowArtifact,
          onOpenRunDetail: input.actions.openWorkflowRunDetail,
          onOpenSchedule: (scheduleId) => {
            input.actions.focusScheduleHistory(scheduleId);
            input.actions.onSelectPane("schedules");
          },
          renderRunConsole: workflowArtifactPanels().renderRunConsole,
          renderRuntimeInputPanel: workflowArtifactPanels().renderRuntimeInputPanel,
          renderOutputsPanel: workflowArtifactPanels().renderOutputsPanel,
        }}
      />
    );
  }

  function renderWorkflowDiscoveryThread(thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) {
    const discoveryModel = workflowDiscoveryThreadWorkspaceViewModel({
      thread,
      revision,
      artifact: input.selectedWorkflowAgentArtifact,
      workflowBusy: input.workflowBusy,
      workflowCompileThreadId: input.workflowCompileThreadId,
      workflowCompileProgress: input.workflowCompileProgress,
      workflowDiscoveryBusy: input.workflowDiscoveryBusy,
      workflowDiscoveryProgress: input.workflowDiscoveryProgress,
    });
    return (
      <WorkflowDiscoveryThreadWorkspace
        thread={thread}
        revision={revision}
        layoutStyle={input.workflowDiscoveryLayoutStyle}
        splitHandle={input.renderWorkflowSplitHandle()}
        diagramPane={
          <section className="automation-section workflow-agent-diagram-section">
            <WorkflowAgentDiagramPane
              thread={thread}
              selectedNodeId={input.selectedWorkflowGraphNodeId}
              onSelectNode={input.actions.setSelectedWorkflowGraphNodeId}
            />
          </section>
        }
        model={discoveryModel}
        workflowDiscoveryBusy={input.workflowDiscoveryBusy}
        workflowBusy={input.workflowBusy}
        workflowError={input.workflowError}
        workflowDiscoveryAnswers={input.workflowDiscoveryAnswers}
        optimisticWorkflowDiscoveryAnswers={input.optimisticWorkflowDiscoveryAnswers}
        workflowCompileProgress={input.workflowCompileProgress}
        revisions={input.workflowRevisions}
        onOpenPersistentStatusTarget={input.actions.openWorkflowPersistentStatusTarget}
        renderRequestEditor={renderWorkflowRequestEditor}
        renderExplorationPanel={renderWorkflowExplorationPanel}
        onCustomValueChange={(questionId, value) => input.actions.setWorkflowDiscoveryAnswers((current) => ({ ...current, [questionId]: value }))}
        onAnswer={(questionId, choiceId, freeform) => void input.actions.answerWorkflowDiscoveryQuestion(questionId, choiceId, freeform)}
        onResolveAccessRequest={(questionId, accessRequestId, response) =>
          void input.actions.resolveWorkflowDiscoveryAccessRequest(questionId, accessRequestId, response)
        }
        onCompile={(workflowThread, workflowRevision) => void input.actions.compileWorkflowThreadPreview(workflowThread, workflowRevision)}
        onOpenCompileDiagnostics={(path) => void input.actions.openWorkflowCompileDiagnostics(path)}
        onEditRequest={input.actions.focusWorkflowRequestEditor}
        onReportCompileUnsupported={(reportText) => void input.actions.copyWorkflowCompileFailureReport(reportText)}
        onStartRevision={(artifact) => void input.actions.startWorkflowArtifactRevision(artifact)}
        onResolveRevision={(revisionId, decision) => void input.actions.resolveWorkflowRevisionProposal(revisionId, decision)}
      />
    );
  }

  return {
    renderWorkflowDiscoveryThread,
    renderWorkflowPersistentDiagramPane,
    renderWorkflowRequestEditor,
    renderWorkflowReviewWorkspace,
    renderWorkflowThreadDetail,
    renderWorkflowThreadRunsPane,
  };
}
