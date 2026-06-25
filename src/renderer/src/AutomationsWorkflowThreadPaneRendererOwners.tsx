import { WorkflowBuildWorkspace, workflowBuildWorkspaceViewModel } from "./AutomationsWorkflowBuildViews";
import { WorkflowAgentDiagramPane } from "./AutomationsWorkflowDiagramViews";
import { latestWorkflowRunForArtifact } from "./AutomationsWorkflowDiscoveryController";
import {
  WorkflowDiscoveryThreadWorkspace,
  workflowDiscoveryThreadWorkspaceViewModel,
  WorkflowRequestEditor,
} from "./AutomationsWorkflowDiscoveryViews";
import { WorkflowExplorationPanel } from "./AutomationsWorkflowExplorationViews";
import type { WorkflowArtifactPanelRenderers } from "./AutomationsWorkflowArtifactInspectorViews";
import { WorkflowReviewWorkspace } from "./AutomationsWorkflowReviewViews";
import { WorkflowFocusedRunsPane } from "./AutomationsWorkflowRuntimeViews";
import { WorkflowThreadComposerView } from "./AutomationsWorkflowThreadComposerViews";
import type { AutomationsWorkflowThreadPaneRenderersInput } from "./AutomationsWorkflowThreadPaneRenderers";
import { findWorkflowGraphNodeReviewActionTarget } from "./workflowGraphNodeReviewRouting";
import type { WorkflowGraphNodeReviewAction } from "./workflowGraphNodeReviewUiModel";
import { workflowExplorationGateForThread } from "./workflowExplorationGateUiModel";
import { workflowReviewWorkspaceViewModel } from "./workflowReviewUiModel";
import { workflowThreadTranscriptCards, type WorkflowThreadTranscriptCard } from "./workflowThreadTranscriptUiModel";
import type {
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowRevisionSummary,
  WorkflowRunDetail,
} from "../../shared/workflowTypes";

export function createWorkflowThreadPaneRendererOwners(input: AutomationsWorkflowThreadPaneRenderersInput) {
  const getWorkflowArtifactPanels = () => input.getWorkflowArtifactPanels();
  return {
    renderWorkflowDiscoveryThread: (thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) =>
      renderWorkflowDiscoveryThreadForPane(input, thread, revision),
    renderWorkflowPersistentDiagramPane: (thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) =>
      renderWorkflowPersistentDiagramPaneForPane(input, thread, artifact),
    renderWorkflowRequestEditor: (thread: WorkflowAgentThreadSummary, ariaLabel?: string) =>
      renderWorkflowRequestEditorForPane(input, thread, ariaLabel),
    renderWorkflowReviewWorkspace: (thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) =>
      renderWorkflowReviewWorkspaceForPane(input, getWorkflowArtifactPanels, thread, artifact),
    renderWorkflowThreadDetail: (thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) =>
      renderWorkflowThreadDetailForPane(input, getWorkflowArtifactPanels, thread, artifact),
    renderWorkflowThreadRunsPane: (thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) =>
      renderWorkflowThreadRunsPaneForPane(input, getWorkflowArtifactPanels, thread, artifact),
  };
}

function workflowExplorationGateForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  thread: WorkflowAgentThreadSummary,
  revision?: WorkflowRevisionSummary,
) {
  return workflowExplorationGateForThread({
    thread,
    revision,
    chatMessages: input.workflowThreadChatMessagesByThreadId[thread.id],
    traces: input.workflowExplorationTracesByThreadId[thread.id],
    progress: input.workflowExplorationProgressByThreadId[thread.id],
    skipped: Boolean(input.workflowExplorationSkippedByThreadId[thread.id]),
  });
}

function renderWorkflowReviewWorkspaceForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  getWorkflowArtifactPanels: () => WorkflowArtifactPanelRenderers,
  thread: WorkflowAgentThreadSummary,
  artifact: WorkflowArtifactSummary,
) {
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
      renderVersionHistory={() => getWorkflowArtifactPanels().renderVersionHistoryPanel(thread, artifact)}
      auditReportPreview={input.actions.workflowAuditReportPreview}
      onOpenPanel={(panel) => input.actions.openWorkflowPanelFromTranscript(thread.id, panel)}
      onWorkflowRunIdleTimeoutMsChange={input.actions.onWorkflowRunIdleTimeoutMsChange}
      onWorkflowRunTotalLimitModeChange={input.actions.onWorkflowRunTotalLimitModeChange}
      onRevalidateArtifact={input.actions.revalidateWorkflowArtifactPreview}
      onRunArtifact={(artifactId, mode, options) => input.actions.runWorkflowArtifact(artifactId, mode, options)}
      onOpenRunDetail={(runId) => void input.actions.openWorkflowRunDetail(runId, { focusConsole: true })}
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
      onCreateScheduleGrant={(schedule) => void input.actions.onCreateWorkflowScheduleGrant(thread, schedule)}
      onSetExpandedScheduleHistoryId={input.actions.onSetExpandedScheduleHistoryId}
      onConnectorAccountChange={(connector, nextAccountId) =>
        void input.actions.updateWorkflowConnectorAccount(artifact.id, connector, nextAccountId)
      }
      onConnectorRetentionChange={(connector, dataRetention) =>
        void input.actions.updateWorkflowConnectorRetention(artifact.id, connector, dataRetention)
      }
      onConnectorScopeRemove={(connector, scope) => void input.actions.removeWorkflowConnectorScope(artifact.id, connector, scope)}
      onConnectorReject={(connector) => void input.actions.rejectWorkflowConnectorGrant(artifact.id, connector)}
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

function renderWorkflowRequestEditorForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  thread: WorkflowAgentThreadSummary,
  ariaLabel = "Workflow request",
) {
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

function renderWorkflowExplorationPanelForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  thread: WorkflowAgentThreadSummary,
  artifact?: WorkflowArtifactSummary,
  revision?: WorkflowRevisionSummary,
) {
  const traces = input.workflowExplorationTracesByThreadId[thread.id] ?? [];
  return (
    <WorkflowExplorationPanel
      thread={thread}
      artifact={artifact}
      revision={revision}
      traces={traces}
      progress={input.workflowExplorationProgressByThreadId[thread.id]}
      gate={workflowExplorationGateForPane(input, thread, revision)}
      budgets={input.actions.workflowExplorationBudgetsForThread(thread.id)}
      workflowBusy={input.workflowBusy}
      onRunExploration={(workflowThread) => void input.actions.runWorkflowExplorationForThread(workflowThread)}
      onSkipExploration={input.actions.skipWorkflowExplorationForThread}
      onCompile={(workflowThread, workflowRevision) => void input.actions.compileWorkflowThreadPreview(workflowThread, workflowRevision)}
      onUpdateBudget={input.actions.updateWorkflowExplorationBudget}
      onResetBudget={input.actions.resetWorkflowExplorationBudget}
    />
  );
}

function handleWorkflowGraphNodeReviewActionForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  action: WorkflowGraphNodeReviewAction,
  artifact?: WorkflowArtifactSummary,
) {
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

function renderWorkflowThreadComposerForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  thread: WorkflowAgentThreadSummary,
  detail?: WorkflowRunDetail,
) {
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

function renderWorkflowBuildWorkspaceForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  getWorkflowArtifactPanels: () => WorkflowArtifactPanelRenderers,
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
    explorationGate: workflowExplorationGateForPane(input, thread),
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
      renderRequestEditor={(workflowThread, ariaLabel) => renderWorkflowRequestEditorForPane(input, workflowThread, ariaLabel)}
      renderThreadComposer={(workflowThread, detail) => renderWorkflowThreadComposerForPane(input, workflowThread, detail)}
      renderReviewWorkspace={(workflowThread, workflowArtifact) =>
        renderWorkflowReviewWorkspaceForPane(input, getWorkflowArtifactPanels, workflowThread, workflowArtifact)
      }
      renderExplorationPanel={(workflowThread, workflowArtifact) =>
        renderWorkflowExplorationPanelForPane(input, workflowThread, workflowArtifact)
      }
      renderRunConsolePanel={getWorkflowArtifactPanels().renderRunConsolePanel}
      renderRuntimeInputPanel={getWorkflowArtifactPanels().renderRuntimeInputPanel}
      renderOutputsPanel={getWorkflowArtifactPanels().renderOutputsPanel}
      renderManifestPanel={getWorkflowArtifactPanels().renderManifestPanel}
      renderPermissionsPanel={getWorkflowArtifactPanels().renderPermissionsPanel}
      renderVersionHistoryPanel={getWorkflowArtifactPanels().renderVersionHistoryPanel}
    />
  );
}

function renderWorkflowPersistentDiagramPaneForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  thread: WorkflowAgentThreadSummary,
  artifact?: WorkflowArtifactSummary,
) {
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
        activeNodeIdOverride={
          input.workflowExplorationProgressByThreadId[thread.id]?.status === "running" ? "agent-exploration" : undefined
        }
        onSelectNode={input.actions.setSelectedWorkflowGraphNodeId}
        onNodeReviewAction={(action) => handleWorkflowGraphNodeReviewActionForPane(input, action, artifact)}
        debugRewriteBusyEventId={
          input.workflowBusy?.startsWith("debug-rewrite:") ? input.workflowBusy.slice("debug-rewrite:".length) : undefined
        }
        recoveryBusyKey={input.workflowBusy?.startsWith("recover:") ? input.workflowBusy.slice("recover:".length) : undefined}
        onRecover={(card, action) => void input.actions.recoverWorkflowRun(card, action)}
        onDebugRewrite={(card) => void input.actions.debugRewriteWorkflowRun(card)}
      />
    </section>
  );
}

function renderWorkflowThreadDetailForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  getWorkflowArtifactPanels: () => WorkflowArtifactPanelRenderers,
  thread: WorkflowAgentThreadSummary,
  artifact?: WorkflowArtifactSummary,
) {
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
      {renderWorkflowBuildWorkspaceForPane(input, getWorkflowArtifactPanels, thread, artifact, transcriptCards)}
      {input.renderWorkflowSplitHandle()}
      {renderWorkflowPersistentDiagramPaneForPane(input, thread, artifact)}
    </div>
  );
}

function renderWorkflowThreadRunsPaneForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  getWorkflowArtifactPanels: () => WorkflowArtifactPanelRenderers,
  thread: WorkflowAgentThreadSummary,
  artifact?: WorkflowArtifactSummary,
) {
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
        diagramPane: renderWorkflowPersistentDiagramPaneForPane(input, thread, artifact),
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
        renderRunConsole: getWorkflowArtifactPanels().renderRunConsole,
        renderRuntimeInputPanel: getWorkflowArtifactPanels().renderRuntimeInputPanel,
        renderOutputsPanel: getWorkflowArtifactPanels().renderOutputsPanel,
      }}
    />
  );
}

function renderWorkflowDiscoveryThreadForPane(
  input: AutomationsWorkflowThreadPaneRenderersInput,
  thread: WorkflowAgentThreadSummary,
  revision?: WorkflowRevisionSummary,
) {
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
      renderRequestEditor={(workflowThread, ariaLabel) => renderWorkflowRequestEditorForPane(input, workflowThread, ariaLabel)}
      renderExplorationPanel={(workflowThread, workflowArtifact, workflowRevision) =>
        renderWorkflowExplorationPanelForPane(input, workflowThread, workflowArtifact, workflowRevision)
      }
      onCustomValueChange={(questionId, value) =>
        input.actions.setWorkflowDiscoveryAnswers((current) => ({ ...current, [questionId]: value }))
      }
      onAnswer={(questionId, choiceId, freeform) => void input.actions.answerWorkflowDiscoveryQuestion(questionId, choiceId, freeform)}
      onResolveAccessRequest={(questionId, accessRequestId, response) =>
        void input.actions.resolveWorkflowDiscoveryAccessRequest(questionId, accessRequestId, response)
      }
      onCompile={(workflowThread, workflowRevision) => void input.actions.compileWorkflowThreadPreview(workflowThread, workflowRevision)}
      onOpenCompileDiagnostics={(path) => void input.actions.openWorkflowCompileDiagnostics(path)}
      onEditRequest={input.actions.focusWorkflowRequestEditor}
      onReportCompileUnsupported={(reportText) => void input.actions.copyWorkflowCompileFailureReport(reportText)}
      onStartRevision={(workflowArtifact) => void input.actions.startWorkflowArtifactRevision(workflowArtifact)}
      onResolveRevision={(revisionId, decision) => void input.actions.resolveWorkflowRevisionProposal(revisionId, decision)}
    />
  );
}
