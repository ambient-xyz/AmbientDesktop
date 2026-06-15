import type { CSSProperties, ReactNode, Ref } from "react";
import { AlertCircle, Check, CheckCircle2, ExternalLink, Info, LoaderCircle, MessageCircle, Monitor } from "lucide-react";

import type {
  AmbientPluginAuthAccountSummary,
  AmbientPluginRegistry,
  WorkflowCompileProgress,
  WorkflowArtifactSummary,
  WorkflowAgentThreadSummary,
  WorkflowDashboard,
  WorkflowExecutionMode,
  WorkflowGraphNode,
  WorkflowRunLimitOverrides,
  WorkflowRunDetail,
  WorkflowRunSummary,
  WorkflowUserInputResponse,
  WorkflowVersionSummary,
} from "../../shared/types";
import { formatBytes, formatTaskState, formatTimelineTime, truncateUiText } from "./RightPanel";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import {
  WorkflowAmbientCliCallList,
  WorkflowConnectorCallList,
  WorkflowConnectorGrantList,
  WorkflowEventList,
  WorkflowModelCallList,
  WorkflowPluginCapabilityList,
  WorkflowStepList,
} from "./AutomationsWorkflowEvidenceViews";
import { WorkflowProgramInspector } from "./AutomationsWorkflowReviewViews";
import { AutomationExplainer, WorkflowRuntimeBrowserScreenshotPreview } from "./AutomationsWorkflowUtilityViews";
import {
  workflowPersistentStatusModel,
  type WorkflowPersistentStatusModel,
  type WorkflowPersistentStatusTarget,
} from "./workflowPersistentStatusUiModel";
import { workflowRuntimeInputDecisionCard, workflowTotalRuntimePauseDecisionCard } from "./workflowRuntimeDecisionUiModel";
import { workflowRuntimeInputCards, type WorkflowRuntimeInputCard } from "./workflowRuntimeInputUiModel";
import { workflowRunOutputCards } from "./workflowRunOutputUiModel";
import { workflowTotalRuntimePauseModel } from "./workflowRunLimitsUiModel";
import { normalizeWorkflowRunsPanelId, workflowRunsPanelTabs, type WorkflowRunsPanelId } from "./workflowRunsPanelUiModel";

type WorkflowTotalRuntimeAction = "extend_total_runtime" | "remove_total_runtime_cap";

export function WorkflowRunCards({
  runs,
  limit = 6,
  artifactById,
  workflowBusy,
  onOpenRunDetail,
  onOpenSchedule,
  onResumeRun,
}: {
  runs: WorkflowRunSummary[];
  limit?: number;
  artifactById: ReadonlyMap<string, WorkflowArtifactSummary>;
  workflowBusy?: string;
  onOpenRunDetail: (runId: string) => void | Promise<unknown>;
  onOpenSchedule: (scheduleId: string) => void;
  onResumeRun: (run: WorkflowRunSummary, artifact: WorkflowArtifactSummary) => void | Promise<unknown>;
}) {
  if (!runs.length) return <p className="panel-note">No workflow runs recorded yet.</p>;
  return (
    <div className="run-dashboard flush">
      {runs.slice(0, limit).map((run) => {
        const artifact = artifactById.get(run.artifactId);
        const scheduledBy = run.scheduledBy;
        return (
          <div className="run-card" key={run.id}>
            <div className="run-card-header">
              <span className="run-row-title">{artifact?.title ?? formatTimelineTime(run.startedAt)}</span>
              <strong className={`run-state ${run.status}`}>{formatTaskState(run.status)}</strong>
            </div>
            {scheduledBy && (
              <div className="plugin-badges">
                <span>{scheduledBy.outcome === "skipped" ? "Schedule skipped" : "Scheduled"}</span>
                <span>{scheduledBy.targetVersionId ? `Version ${scheduledBy.targetVersionId}` : scheduledBy.targetKind ? formatTaskState(scheduledBy.targetKind) : "Schedule target"}</span>
                {scheduledBy.grantDecisionSource && <span>{formatTaskState(scheduledBy.grantDecisionSource)}</span>}
              </div>
            )}
            {run.error && <p className="run-error">{run.error}</p>}
            <div className="run-actions">
              <button type="button" className="panel-button mini" disabled={workflowBusy === run.id} onClick={() => void onOpenRunDetail(run.id)}>
                {workflowBusy === run.id ? "Opening" : "Audit"}
              </button>
              {scheduledBy && (
                <button
                  type="button"
                  className="panel-button mini"
                  onClick={() => onOpenSchedule(scheduledBy.scheduleId)}
                  title={`Open schedule ${scheduledBy.scheduleId}`}
                >
                  Schedule
                </button>
              )}
              {artifact && (run.status === "paused" || run.status === "needs_input" || run.status === "failed") && (
                <button
                  type="button"
                  className="panel-button mini"
                  disabled={Boolean(workflowBusy)}
                  onClick={() => void onResumeRun(run, artifact)}
                >
                  Resume
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WorkflowThreadRunsWorkspace({
  thread,
  artifact,
  dashboard,
  selectedDetail,
  activePanelId,
  layoutStyle,
  splitHandle,
  diagramPane,
  artifactById,
  persistentStatus,
  workflowBusy,
  runLimitsForArtifact,
  isArtifactRunBlocked,
  auditReportPreview,
  onOpenPersistentStatusTarget,
  onSelectPanel,
  onRunArtifact,
  onOpenRunDetail,
  onOpenSchedule,
  renderRunConsole,
  renderRuntimeInputPanel,
  renderOutputsPanel,
}: {
  thread: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  dashboard?: WorkflowDashboard;
  selectedDetail?: WorkflowRunDetail;
  activePanelId?: WorkflowRunsPanelId;
  layoutStyle?: CSSProperties & { "--workflow-split-primary"?: string };
  splitHandle: ReactNode;
  diagramPane: ReactNode;
  artifactById: ReadonlyMap<string, WorkflowArtifactSummary>;
  persistentStatus: WorkflowPersistentStatusModel;
  workflowBusy?: string;
  runLimitsForArtifact: (artifact: WorkflowArtifactSummary) => WorkflowRunLimitOverrides;
  isArtifactRunBlocked: (artifact: WorkflowArtifactSummary) => boolean;
  auditReportPreview: (value: string | undefined) => string;
  onOpenPersistentStatusTarget: (workflowThreadId: string | undefined, target: WorkflowPersistentStatusTarget) => void;
  onSelectPanel: (workflowThreadId: string | undefined, panel: WorkflowRunsPanelId) => void;
  onRunArtifact: (
    artifactId: string,
    mode: WorkflowExecutionMode,
    options?: { resumeFromRunId?: string; allowUnapproved?: boolean; runLimits?: WorkflowRunLimitOverrides },
  ) => void | Promise<unknown>;
  onOpenRunDetail: (runId: string, options?: { focusConsole?: boolean }) => void | Promise<unknown>;
  onOpenSchedule: (scheduleId: string) => void;
  renderRunConsole: (detail: WorkflowRunDetail, compact?: boolean) => ReactNode;
  renderRuntimeInputPanel: (detail: WorkflowRunDetail | undefined) => ReactNode;
  renderOutputsPanel: (artifact: WorkflowArtifactSummary | undefined, latestRun: WorkflowRunSummary | undefined, detail: WorkflowRunDetail | undefined) => ReactNode;
}) {
  const threadArtifacts = dashboard?.artifacts.filter((item) => item.workflowThreadId === thread.id) ?? (artifact ? [artifact] : []);
  const threadArtifactIds = new Set(threadArtifacts.map((item) => item.id));
  const threadRuns = (dashboard?.runs ?? [])
    .filter((run) => threadArtifactIds.has(run.artifactId))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const latestRun = artifact ? latestWorkflowRunForArtifact(dashboard?.runs ?? [], artifact.id) : threadRuns[0];
  const detail = selectedDetail && threadArtifactIds.has(selectedDetail.artifact.id) ? selectedDetail : undefined;
  const inputCount = workflowRuntimeInputCards(detail).length;
  const outputCount = workflowRunOutputCards(detail).length;
  const tabs = workflowRunsPanelTabs({ latestRun, detail, inputCount, outputCount });
  const activePanel = normalizeWorkflowRunsPanelId(activePanelId, tabs);
  return (
    <div className="automation-focused-grid workflow-discovery-layout" style={layoutStyle}>
      <section className="automation-section automation-focus-primary workflow-runs-workspace" data-mode="runs">
        <AutomationExplainer
          paragraphs={[
            "Runs for this Workflow Agent thread stay attached to the workflow conversation, diagram, schedules, retained outputs, and recovery controls.",
            "Open a run to inspect live events, model calls, checkpoints, user-input requests, rendered outputs, and the audit report without jumping through the global run list.",
          ]}
        />
        <WorkflowPersistentStatusView threadId={thread.id} model={persistentStatus} onOpenTarget={onOpenPersistentStatusTarget} />
        <div className="workflow-build-shell workflow-runs-shell">
          <nav className="workflow-build-rail workflow-runs-rail" role="tablist" aria-label="Workflow Agent Runs panels">
            {tabs.map((tab) => (
              <button
                type="button"
                role="tab"
                aria-selected={activePanel === tab.id}
                className={activePanel === tab.id ? "active" : ""}
                key={tab.id}
                data-panel-target={tab.id}
                title={tab.detail}
                onClick={() => onSelectPanel(thread.id, tab.id)}
              >
                <span>{tab.label}</span>
                {tab.badge && <small>{tab.badge}</small>}
              </button>
            ))}
          </nav>
          <div className="workflow-runs-panel-body" data-workflow-runs-panel={activePanel}>
            <WorkflowThreadRunSummary
              thread={thread}
              artifact={artifact}
              artifactById={artifactById}
              runs={threadRuns}
              detail={detail}
              workflowBusy={workflowBusy}
              runLimitsForArtifact={runLimitsForArtifact}
              isArtifactRunBlocked={isArtifactRunBlocked}
              onRunArtifact={onRunArtifact}
              onOpenRunDetail={onOpenRunDetail}
              onOpenSchedule={onOpenSchedule}
              onSelectPanel={onSelectPanel}
            />
            <WorkflowRunsPanelContent
              panel={activePanel}
              artifact={artifact}
              latestRun={latestRun}
              detail={detail}
              workflowBusy={workflowBusy}
              auditReportPreview={auditReportPreview}
              onOpenRunDetail={onOpenRunDetail}
              renderRunConsole={renderRunConsole}
              renderRuntimeInputPanel={renderRuntimeInputPanel}
              renderOutputsPanel={renderOutputsPanel}
            />
          </div>
        </div>
      </section>
      {splitHandle}
      {diagramPane}
    </div>
  );
}

export type WorkflowFocusedRunsPaneState = {
  dashboard?: WorkflowDashboard;
  selectedDetail?: WorkflowRunDetail;
  activePanelId?: WorkflowRunsPanelId;
  artifactById: ReadonlyMap<string, WorkflowArtifactSummary>;
  workflowBusy?: string;
  workflowCompileThreadId?: string;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowDiscoveryBusy?: string;
};

export type WorkflowFocusedRunsPaneSlots = {
  layoutStyle?: CSSProperties & { "--workflow-split-primary"?: string };
  splitHandle: ReactNode;
  diagramPane: ReactNode;
};

export type WorkflowFocusedRunsPaneActions = Pick<
  Parameters<typeof WorkflowThreadRunsWorkspace>[0],
  | "runLimitsForArtifact"
  | "isArtifactRunBlocked"
  | "auditReportPreview"
  | "onOpenPersistentStatusTarget"
  | "onSelectPanel"
  | "onRunArtifact"
  | "onOpenRunDetail"
  | "onOpenSchedule"
  | "renderRunConsole"
  | "renderRuntimeInputPanel"
  | "renderOutputsPanel"
>;

export function WorkflowFocusedRunsPane({
  thread,
  artifact,
  state,
  slots,
  actions,
}: {
  thread: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  state: WorkflowFocusedRunsPaneState;
  slots: WorkflowFocusedRunsPaneSlots;
  actions: WorkflowFocusedRunsPaneActions;
}) {
  const threadArtifacts = state.dashboard?.artifacts.filter((item) => item.workflowThreadId === thread.id) ?? (artifact ? [artifact] : []);
  const threadArtifactIds = new Set(threadArtifacts.map((item) => item.id));
  const threadRuns = (state.dashboard?.runs ?? [])
    .filter((run) => threadArtifactIds.has(run.artifactId))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const latestRun = artifact ? latestWorkflowRunForArtifact(state.dashboard?.runs ?? [], artifact.id) : threadRuns[0];
  const detail = state.selectedDetail && threadArtifactIds.has(state.selectedDetail.artifact.id) ? state.selectedDetail : undefined;
  const persistentStatus = workflowPersistentStatusModel({
    thread,
    artifact,
    latestRun,
    detail,
    compileActive: state.workflowBusy === "compile" && state.workflowCompileThreadId === thread.id,
    compileProgress: state.workflowCompileThreadId === thread.id ? state.workflowCompileProgress : [],
    discoveryBusy: state.workflowDiscoveryBusy,
  });

  return (
    <WorkflowThreadRunsWorkspace
      thread={thread}
      artifact={artifact}
      dashboard={state.dashboard}
      selectedDetail={state.selectedDetail}
      activePanelId={state.activePanelId}
      layoutStyle={slots.layoutStyle}
      splitHandle={slots.splitHandle}
      diagramPane={slots.diagramPane}
      artifactById={state.artifactById}
      persistentStatus={persistentStatus}
      workflowBusy={state.workflowBusy}
      {...actions}
    />
  );
}

function WorkflowThreadRunSummary({
  thread,
  artifact,
  artifactById,
  runs,
  detail,
  workflowBusy,
  runLimitsForArtifact,
  isArtifactRunBlocked,
  onRunArtifact,
  onOpenRunDetail,
  onOpenSchedule,
  onSelectPanel,
}: {
  thread: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  artifactById: ReadonlyMap<string, WorkflowArtifactSummary>;
  runs: WorkflowRunSummary[];
  detail?: WorkflowRunDetail;
  workflowBusy?: string;
  runLimitsForArtifact: (artifact: WorkflowArtifactSummary) => WorkflowRunLimitOverrides;
  isArtifactRunBlocked: (artifact: WorkflowArtifactSummary) => boolean;
  onRunArtifact: (
    artifactId: string,
    mode: WorkflowExecutionMode,
    options?: { resumeFromRunId?: string; allowUnapproved?: boolean; runLimits?: WorkflowRunLimitOverrides },
  ) => void | Promise<unknown>;
  onOpenRunDetail: (runId: string, options?: { focusConsole?: boolean }) => void | Promise<unknown>;
  onOpenSchedule: (scheduleId: string) => void;
  onSelectPanel: (workflowThreadId: string | undefined, panel: WorkflowRunsPanelId) => void;
}) {
  const selectedRunId = detail?.run.id;
  return (
    <section className="workflow-runs-summary">
      <div className="panel-section-heading">
        <div>
          <AutomationHeadingLabel tooltip="Recent runs for this Workflow Agent thread. Opening a run keeps this thread and its diagram visible.">
            {thread.title}
          </AutomationHeadingLabel>
          <p className="panel-note">{runs.length ? `${runs.length} retained run${runs.length === 1 ? "" : "s"} for this workflow thread.` : "No runs are recorded for this workflow thread yet."}</p>
        </div>
        {artifact && (
          <div className="task-heading-actions">
            <button type="button" className="panel-button mini" disabled={Boolean(workflowBusy)} onClick={() => void onRunArtifact(artifact.id, "dry_run", { runLimits: runLimitsForArtifact(artifact) })}>
              Dry run
            </button>
            <button
              type="button"
              className={`panel-button mini ${artifact.status === "approved" ? "" : "danger"}`}
              disabled={Boolean(workflowBusy) || isArtifactRunBlocked(artifact)}
              onClick={() =>
                void onRunArtifact(artifact.id, "execute", {
                  allowUnapproved: artifact.status !== "approved",
                  runLimits: runLimitsForArtifact(artifact),
                })
              }
            >
              {artifact.status === "approved" ? "Run" : "Run unapproved"}
            </button>
          </div>
        )}
      </div>
      {runs.length > 0 && (
        <div className="workflow-thread-run-list" aria-label="Workflow thread runs">
          {runs.slice(0, 6).map((run) => {
            const runArtifact = artifactById.get(run.artifactId) ?? artifact;
            return (
              <article className={`workflow-thread-run-row ${run.id === selectedRunId ? "active" : ""}`} key={run.id}>
                <div>
                  <strong>{runArtifact?.title ?? formatTimelineTime(run.startedAt)}</strong>
                  <span>{formatTaskState(run.status)} · {formatTimelineTime(run.updatedAt)}</span>
                  {run.error && <small>{run.error}</small>}
                </div>
                <div className="plugin-badges">
                  {run.scheduledBy && <span>{run.scheduledBy.outcome === "skipped" ? "Schedule skipped" : "Scheduled"}</span>}
                  {run.scheduledBy?.targetVersionId && <span>{run.scheduledBy.targetVersionId}</span>}
                  {run.id === selectedRunId && <span>Open</span>}
                </div>
                <div className="run-actions">
                  <button type="button" className="panel-button mini" disabled={workflowBusy === run.id} onClick={() => void onOpenRunDetail(run.id, { focusConsole: true })}>
                    {workflowBusy === run.id ? "Opening" : "Open"}
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={workflowBusy === run.id}
                    onClick={() => {
                      onSelectPanel(thread.id, "runs-outputs");
                      void onOpenRunDetail(run.id);
                    }}
                  >
                    Outputs
                  </button>
                  {run.scheduledBy && (
                    <button type="button" className="panel-button mini" onClick={() => onOpenSchedule(run.scheduledBy!.scheduleId)}>
                      Schedule
                    </button>
                  )}
                  {runArtifact && (run.status === "paused" || run.status === "needs_input" || run.status === "failed") && (
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={Boolean(workflowBusy)}
                      onClick={() =>
                        void onRunArtifact(runArtifact.id, "execute", {
                          resumeFromRunId: run.id,
                          allowUnapproved: runArtifact.status !== "approved",
                          runLimits: runLimitsForArtifact(runArtifact),
                        })
                      }
                    >
                      Resume
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function WorkflowRunsPanelContent({
  panel,
  artifact,
  latestRun,
  detail,
  workflowBusy,
  auditReportPreview,
  onOpenRunDetail,
  renderRunConsole,
  renderRuntimeInputPanel,
  renderOutputsPanel,
}: {
  panel: WorkflowRunsPanelId;
  artifact?: WorkflowArtifactSummary;
  latestRun?: WorkflowRunSummary;
  detail?: WorkflowRunDetail;
  workflowBusy?: string;
  auditReportPreview: (value: string | undefined) => string;
  onOpenRunDetail: (runId: string, options?: { focusConsole?: boolean }) => void | Promise<unknown>;
  renderRunConsole: (detail: WorkflowRunDetail, compact?: boolean) => ReactNode;
  renderRuntimeInputPanel: (detail: WorkflowRunDetail | undefined) => ReactNode;
  renderOutputsPanel: (artifact: WorkflowArtifactSummary | undefined, latestRun: WorkflowRunSummary | undefined, detail: WorkflowRunDetail | undefined) => ReactNode;
}) {
  if (panel === "runs-live") {
    return (
      <section id="runs-live" className="workflow-runs-panel workflow-build-panel-section">
        {detail ? renderRunConsole(detail, true) : (
          <WorkflowRunEmptyPanel
            title="Run Console"
            latestRun={latestRun}
            workflowBusy={workflowBusy}
            latestRunDetail="Open the latest run to inspect events, model calls, checkpoints, approvals, and audit output."
            noRunDetail="No workflow runs are recorded for this artifact yet."
            showLatestRunAction={Boolean(artifact && latestRun)}
            onOpenRunDetail={onOpenRunDetail}
          />
        )}
      </section>
    );
  }
  if (panel === "runs-input") {
    return (
      <section id="runs-input" className="workflow-runs-panel workflow-build-panel-section">
        {renderRuntimeInputPanel(detail) ?? (
          <div className="workflow-artifact-empty-panel">
            <strong>No runtime input is pending</strong>
            <p>{latestRun ? "Open another run or use the Workflow Chat composer when a workflow asks for feedback." : "Run the workflow to create runtime input requests."}</p>
          </div>
        )}
      </section>
    );
  }
  if (panel === "runs-outputs") {
    return (
      <section id="runs-outputs" className="workflow-runs-panel workflow-build-panel-section">
        {renderOutputsPanel(artifact, latestRun, detail)}
      </section>
    );
  }
  if (panel === "runs-events") {
    return (
      <section id="runs-events" className="workflow-runs-panel workflow-build-panel-section">
        {detail ? (
          <div className="workflow-run-evidence-panel">
            <AutomationHeadingLabel tooltip="Bounded event stream for the selected run. Large payloads stay compacted into previews and artifacts.">
              Events
            </AutomationHeadingLabel>
            <WorkflowStepList events={detail.events} />
            <WorkflowAmbientCliCallList events={detail.events} />
            <WorkflowConnectorCallList events={detail.events} />
            <WorkflowEventList events={detail.events} />
          </div>
        ) : (
          <WorkflowRunEmptyPanel title="Open a run to inspect events" latestRun={latestRun} workflowBusy={workflowBusy} onOpenRunDetail={onOpenRunDetail} />
        )}
      </section>
    );
  }
  if (panel === "runs-model") {
    return (
      <section id="runs-model" className="workflow-runs-panel workflow-build-panel-section">
        {detail ? (
          <div className="workflow-run-evidence-panel">
            <AutomationHeadingLabel tooltip="Ambient/Pi model calls retained for the selected run.">
              Model Calls
            </AutomationHeadingLabel>
            <WorkflowModelCallList modelCalls={detail.modelCalls} />
          </div>
        ) : (
          <WorkflowRunEmptyPanel title="Open a run to inspect model calls" latestRun={latestRun} workflowBusy={workflowBusy} onOpenRunDetail={onOpenRunDetail} />
        )}
      </section>
    );
  }
  if (panel === "runs-checkpoints") {
    return (
      <section id="runs-checkpoints" className="workflow-runs-panel workflow-build-panel-section">
        {detail ? (
          <div className="workflow-run-evidence-panel workflow-checkpoint-list">
            <AutomationHeadingLabel tooltip="Checkpoints are retained state snapshots used for resume and audit.">Checkpoints</AutomationHeadingLabel>
            {detail.checkpoints.length ? (
              detail.checkpoints.slice(0, 12).map((checkpoint) => (
                <div key={`${checkpoint.key}-${checkpoint.updatedAt ?? ""}`}>
                  <span>{checkpoint.key}</span>
                  <code>{checkpoint.valuePreview}</code>
                </div>
              ))
            ) : (
              <p className="panel-note">No checkpoints were retained for this run.</p>
            )}
          </div>
        ) : (
          <WorkflowRunEmptyPanel title="Open a run to inspect checkpoints" latestRun={latestRun} workflowBusy={workflowBusy} onOpenRunDetail={onOpenRunDetail} />
        )}
      </section>
    );
  }
  return (
    <section id="runs-report" className="workflow-runs-panel workflow-build-panel-section">
      {detail ? (
        <div className="workflow-run-evidence-panel">
          <AutomationHeadingLabel tooltip="Audit Preview summarizes the selected workflow run and its retained evidence.">Audit Report</AutomationHeadingLabel>
          <pre>{auditReportPreview(detail.auditReport)}</pre>
        </div>
      ) : (
        <WorkflowRunEmptyPanel title="Open a run to inspect the audit report" latestRun={latestRun} workflowBusy={workflowBusy} onOpenRunDetail={onOpenRunDetail} />
      )}
    </section>
  );
}

function WorkflowRunEmptyPanel({
  title,
  latestRun,
  workflowBusy,
  latestRunDetail = "Open the latest run, or choose a retained run above, to load the selected evidence panel.",
  noRunDetail = "No workflow runs are recorded for this thread yet.",
  showLatestRunAction = true,
  onOpenRunDetail,
}: {
  title: string;
  latestRun?: WorkflowRunSummary;
  workflowBusy?: string;
  latestRunDetail?: string;
  noRunDetail?: string;
  showLatestRunAction?: boolean;
  onOpenRunDetail: (runId: string, options?: { focusConsole?: boolean }) => void | Promise<unknown>;
}) {
  return (
    <div className="workflow-artifact-empty-panel">
      <strong>{title}</strong>
      <p>{latestRun ? latestRunDetail : noRunDetail}</p>
      {latestRun && showLatestRunAction && (
        <button type="button" className="panel-button mini" disabled={workflowBusy === latestRun.id} onClick={() => void onOpenRunDetail(latestRun.id, { focusConsole: true })}>
          {workflowBusy === latestRun.id ? "Opening" : "Open latest run"}
        </button>
      )}
    </div>
  );
}

function latestWorkflowRunForArtifact(runs: WorkflowRunSummary[], artifactId: string): WorkflowRunSummary | undefined {
  return runs.find((run) => run.artifactId === artifactId);
}

export function WorkflowRunConsole({
  detail,
  compact = false,
  workflowBusy,
  runConsoleRef,
  connectorAccounts,
  pluginRegistry,
  sourceDraft,
  selectedSourceNode,
  sourceNodes,
  sourceVersion,
  onCancelRun,
  onResumeRun,
  onClose,
  onResumeTotalRuntimePause,
  onSelectSourceNode,
  onSourceDraftChange,
  onSourceDraftClear,
  onSourceSave,
  onResolveApproval,
}: {
  detail: WorkflowRunDetail;
  compact?: boolean;
  workflowBusy?: string;
  runConsoleRef?: Ref<HTMLElement>;
  connectorAccounts?: Record<string, AmbientPluginAuthAccountSummary[]>;
  pluginRegistry?: AmbientPluginRegistry;
  sourceDraft?: string;
  selectedSourceNode?: WorkflowGraphNode;
  sourceNodes?: WorkflowGraphNode[];
  sourceVersion?: WorkflowVersionSummary;
  onCancelRun: (runId: string) => void | Promise<unknown>;
  onResumeRun: (detail: WorkflowRunDetail) => void | Promise<unknown>;
  onClose: () => void;
  onResumeTotalRuntimePause: (detail: WorkflowRunDetail, action: WorkflowTotalRuntimeAction) => void | Promise<unknown>;
  onSelectSourceNode?: (nodeId: string) => void;
  onSourceDraftChange?: (source: string) => void;
  onSourceDraftClear?: () => void;
  onSourceSave?: (source: string) => void | Promise<void>;
  onResolveApproval: (runId: string, approvalId: string, decision: "approved" | "rejected") => void | Promise<unknown>;
}) {
  const totalRuntimePause = workflowTotalRuntimePauseModel(detail.run.status, detail.events);
  return (
    <section ref={runConsoleRef} className={`workflow-audit-preview ${compact ? "" : "automation-focus-wide"}`}>
      <div className="run-card-header">
        <AutomationHeadingLabel tooltip="Inspect workflow run events, model calls, checkpoints, approvals, and retained audit output.">Run Console</AutomationHeadingLabel>
        <div className="task-heading-actions">
          {detail.run.status === "running" && (
            <button
              type="button"
              className="panel-button mini danger"
              disabled={workflowBusy === `cancel:${detail.run.id}`}
              onClick={() => void onCancelRun(detail.run.id)}
            >
              {workflowBusy === `cancel:${detail.run.id}` ? "Canceling" : "Cancel"}
            </button>
          )}
          {detail.run.status !== "running" && (detail.run.status === "paused" || detail.run.status === "needs_input" || detail.checkpoints.length > 0) && (
            <button
              type="button"
              className="panel-button mini"
              disabled={Boolean(workflowBusy)}
              onClick={() => void onResumeRun(detail)}
            >
              {workflowBusy === `resume:${detail.run.id}` ? "Resuming" : "Resume"}
            </button>
          )}
          <button type="button" className="panel-button mini" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="plugin-badges">
        <span>{formatTaskState(detail.run.status)}</span>
        <span>{detail.events.length} events</span>
        <span>{detail.modelCalls.length} model calls</span>
        {detail.artifact.manifest.connectors?.length ? (
          <span>
            {detail.artifact.manifest.connectors.length} connector{detail.artifact.manifest.connectors.length === 1 ? "" : "s"}
          </span>
        ) : null}
        {detail.artifact.manifest.pluginCapabilities?.length ? (
          <span>
            {detail.artifact.manifest.pluginCapabilities.length} plugin requirement{detail.artifact.manifest.pluginCapabilities.length === 1 ? "" : "s"}
          </span>
        ) : null}
        <span>{detail.checkpoints.length} checkpoints</span>
        <span>{detail.approvals.length} review items</span>
      </div>
      {totalRuntimePause && (() => {
        const decision = workflowTotalRuntimePauseDecisionCard(totalRuntimePause);
        return (
          <div className={`workflow-runtime-decision-card ${decision.tone}`}>
            <div className="workflow-runtime-decision-header">
              <div>
                <strong>{decision.title}</strong>
                {decision.description && <span>{decision.description}</span>}
              </div>
              <span className="workflow-runtime-decision-status">{decision.statusLabel}</span>
            </div>
            {decision.badges.length > 0 && (
              <div className="plugin-badges">
                {decision.badges.map((badge) => (
                  <span key={`${decision.id}:${badge}`}>{badge}</span>
                ))}
              </div>
            )}
            <div className="workflow-runtime-decision-actions">
              {decision.actions.map((action) => (
                <button
                  type="button"
                  className={`workflow-runtime-decision-action ${action.tone}`}
                  title={action.description}
                  disabled={Boolean(workflowBusy)}
                  key={action.id}
                  onClick={() => {
                    if (action.id === "extend_total_runtime" || action.id === "remove_total_runtime_cap") void onResumeTotalRuntimePause(detail, action.id);
                  }}
                >
                  <span>
                    <strong>{workflowBusy === `resume:${detail.run.id}` ? "Resuming" : action.label}</strong>
                    {action.description && <small>{action.description}</small>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
      <WorkflowConnectorGrantList connectors={detail.artifact.manifest.connectors} connectorAccounts={connectorAccounts} />
      <WorkflowPluginCapabilityList capabilities={detail.artifact.manifest.pluginCapabilities} registry={pluginRegistry} />
      {compact ? (
        <div className="workflow-run-evidence-panel">
          <AutomationHeadingLabel tooltip="Generated program source is available from Build or Review. The compact Runs panel keeps source text collapsed.">
            Program
          </AutomationHeadingLabel>
          <p className="panel-note">
            {detail.artifact.title} · {detail.artifact.manifest.tools.length} tool{detail.artifact.manifest.tools.length === 1 ? "" : "s"} ·{" "}
            {detail.artifact.sourcePath ? "source retained" : "source unavailable"}
          </p>
          {detail.artifact.sourcePath && <code className="workflow-path">{detail.artifact.sourcePath}</code>}
        </div>
      ) : (
        <WorkflowProgramInspector
          artifact={detail.artifact}
          detail={detail}
          disabled={Boolean(workflowBusy)}
          sourceSaveBusy={workflowBusy === `source:${detail.artifact.id}`}
          persistedSourceDraft={sourceDraft}
          selectedSourceNode={selectedSourceNode}
          sourceNodes={sourceNodes}
          onSelectSourceNode={onSelectSourceNode}
          sourceVersion={sourceVersion}
          onSourceDraftChange={onSourceDraftChange}
          onSourceDraftClear={onSourceDraftClear}
          onSourceSave={onSourceSave}
        />
      )}
      <WorkflowStepList events={detail.events} />
      <WorkflowAmbientCliCallList events={detail.events} />
      <WorkflowConnectorCallList events={detail.events} />
      <WorkflowModelCallList modelCalls={detail.modelCalls} />
      {detail.approvals.length > 0 && (
        <div className="workflow-review-list">
          <AutomationHeadingLabel tooltip="Review Queue contains workflow changes that need an approve or reject decision before the run can continue.">Review Queue</AutomationHeadingLabel>
          {detail.approvals.slice(0, 5).map((approval) => (
            <div key={approval.id}>
              <span>{formatTaskState(approval.status)}</span>
              <code>{approval.changeSetPreview}</code>
              {approval.status === "pending" && (
                <span className="workflow-review-actions">
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={workflowBusy === `approval:${approval.id}`}
                    onClick={() => void onResolveApproval(detail.run.id, approval.id, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="panel-button mini danger"
                    disabled={workflowBusy === `approval:${approval.id}`}
                    onClick={() => void onResolveApproval(detail.run.id, approval.id, "rejected")}
                  >
                    Reject
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {detail.checkpoints.length > 0 && (
        <div className="workflow-checkpoint-list">
          <AutomationHeadingLabel tooltip="Checkpoints are retained state snapshots used for resume and audit.">Checkpoints</AutomationHeadingLabel>
          {detail.checkpoints.slice(0, 5).map((checkpoint) => (
            <div key={`${checkpoint.key}-${checkpoint.updatedAt ?? ""}`}>
              <span>{checkpoint.key}</span>
              <code>{compact ? truncateUiText(checkpoint.valuePreview, 1200) : checkpoint.valuePreview}</code>
            </div>
          ))}
        </div>
      )}
      <WorkflowEventList events={detail.events} />
      <AutomationHeadingLabel tooltip="Audit Preview summarizes the selected workflow run and its retained evidence.">Audit Preview</AutomationHeadingLabel>
      <pre>{compact ? truncateUiText(detail.auditReport || "No audit report was generated for this run.", 4000) : detail.auditReport}</pre>
    </section>
  );
}

export function WorkflowPersistentStatusView({
  threadId,
  model,
  onOpenTarget,
}: {
  threadId: string;
  model: WorkflowPersistentStatusModel;
  onOpenTarget: (workflowThreadId: string | undefined, target: WorkflowPersistentStatusTarget) => void;
}) {
  return (
    <section className={`workflow-persistent-status ${model.tone}`} aria-label="Workflow status" role={model.tone === "blocked" ? "alert" : "status"}>
      <div className="workflow-persistent-status-icon" aria-hidden="true">
        {model.tone === "blocked" ? (
          <AlertCircle size={16} />
        ) : model.tone === "warning" ? (
          <Info size={16} />
        ) : model.tone === "running" ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <CheckCircle2 size={16} />
        )}
      </div>
      <div className="workflow-persistent-status-copy">
        <strong>{model.title}</strong>
        <span>{model.detail}</span>
        <div className="plugin-badges">
          {model.badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      </div>
      {model.action && (
        <button type="button" className="panel-button mini" title={model.action.title} onClick={() => onOpenTarget(threadId, model.action!.target)}>
          {model.action.label}
        </button>
      )}
    </section>
  );
}

export function WorkflowRuntimeInputPanel({
  detail,
  cards,
  workflowBusy,
  onAnswerInput,
  onRevealBrowser,
  onPreviewPath,
  onOpenMediaModal,
}: {
  detail: WorkflowRunDetail;
  cards?: WorkflowRuntimeInputCard[];
  workflowBusy?: string;
  onAnswerInput: (
    detail: WorkflowRunDetail,
    card: WorkflowRuntimeInputCard,
    response: Omit<WorkflowUserInputResponse, "requestId">,
  ) => void | Promise<unknown>;
  onRevealBrowser: (request: { userActionId?: string; targetId?: string }) => void | Promise<unknown>;
  onPreviewPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
}) {
  const inputCards = cards ?? workflowRuntimeInputCards(detail);
  if (inputCards.length === 0) return null;

  return (
    <section className="workflow-runtime-input-panel" aria-label="Workflow runtime input">
      <div className="workflow-runtime-input-header">
        <div>
          <strong>Workflow needs input</strong>
          <span>Answer the paused runtime request to resume this workflow with the same run settings.</span>
        </div>
        <span className="workflow-runtime-input-count">
          <MessageCircle size={13} />
          {inputCards.length} pending
        </span>
      </div>
      {inputCards.map((card) => {
        const decision = workflowRuntimeInputDecisionCard(card);
        const browserPreview = card.browserIntervention?.preview;
        const browserPreviewArtifactPath = browserPreview?.screenshotArtifactPath;
        return (
          <article className={`workflow-runtime-decision-card ${decision.tone}`} key={card.id}>
            <div className="workflow-runtime-decision-header">
              <div>
                <strong>{decision.title}</strong>
                {decision.description && <span>{decision.description}</span>}
              </div>
              <span className="workflow-runtime-decision-status">{workflowBusy === `resume:${detail.run.id}` ? "Resuming" : decision.statusLabel}</span>
            </div>
            {decision.badges.length > 0 && (
              <div className="plugin-badges">
                {decision.badges.map((badge) => (
                  <span key={`${decision.id}:${badge}`}>{badge}</span>
                ))}
              </div>
            )}
            {card.browserIntervention && (
              <section className="workflow-runtime-browser-intervention" aria-label="Browser intervention">
                <div className="workflow-runtime-browser-intervention-header">
                  <div>
                    <strong>{card.browserIntervention.title}</strong>
                    <span>
                      {[
                        card.browserIntervention.kind,
                        card.browserIntervention.provider,
                        card.browserIntervention.toolName,
                        card.browserIntervention.profileMode,
                      ]
                        .filter(Boolean)
                        .join(" / ") || "Managed browser"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="panel-button mini icon-panel-button"
                    disabled={!card.browserIntervention.browserUserActionId}
                    title={
                      card.browserIntervention.browserUserActionId
                        ? "Open the managed browser at the page waiting for user action"
                        : "This workflow did not include a browser user-action id"
                    }
                    onClick={() =>
                      void onRevealBrowser({
                        userActionId: card.browserIntervention?.browserUserActionId,
                        targetId: card.browserIntervention?.targetId,
                      })
                    }
                  >
                    <Monitor size={13} />
                    Open managed browser
                  </button>
                </div>
                {card.browserIntervention.message && <p>{card.browserIntervention.message}</p>}
                {card.browserIntervention.url && (
                  <a href={card.browserIntervention.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={12} />
                    {card.browserIntervention.url}
                  </a>
                )}
                {browserPreview && (
                  <div className="workflow-runtime-browser-preview" aria-label="Browser intervention preview">
                    <div className="workflow-runtime-browser-preview-header">
                      <strong>{browserPreview.title ?? "Browser evidence"}</strong>
                      <span>
                        {[
                          browserPreview.detail,
                          browserPreview.screenshotWidth && browserPreview.screenshotHeight
                            ? `${browserPreview.screenshotWidth}x${browserPreview.screenshotHeight}`
                            : undefined,
                          browserPreview.screenshotBytes ? `${formatBytes(browserPreview.screenshotBytes)}` : undefined,
                        ]
                          .filter(Boolean)
                          .join(" / ") || "Screenshot and page excerpt"}
                      </span>
                    </div>
                    {browserPreviewArtifactPath && (
                      <WorkflowRuntimeBrowserScreenshotPreview
                        artifactPath={browserPreviewArtifactPath}
                        onPreviewPath={onPreviewPath}
                        onOpenMediaModal={onOpenMediaModal}
                      />
                    )}
                    {browserPreview.textExcerpt && <pre>{browserPreview.textExcerpt}</pre>}
                    {browserPreview.url && browserPreview.url !== card.browserIntervention.url && (
                      <a href={browserPreview.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} />
                        {browserPreview.url}
                      </a>
                    )}
                  </div>
                )}
                <p className="panel-note">
                  Review the browser warning. If it is real, complete it and choose <strong>I completed it</strong>; if it is wrong, choose a skip or correction option so the workflow can continue.
                </p>
              </section>
            )}
            {card.contextItems.length > 0 && (
              <div className="workflow-runtime-input-context-grid" aria-label="Runtime input context">
                {card.contextItems.map((item) => (
                  <article className={`workflow-runtime-input-context ${item.kind}`} key={item.id}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail ?? item.format}</span>
                    </div>
                    {item.artifactPath ? (
                      <code title={item.artifactPath}>{item.artifactPath}</code>
                    ) : item.format === "url" ? (
                      <a href={item.value} target="_blank" rel="noreferrer">
                        {item.value}
                      </a>
                    ) : null}
                    {item.value && item.value !== item.artifactPath && <pre>{item.value}</pre>}
                  </article>
                ))}
              </div>
            )}
            {decision.actions.length > 0 && (
              <div className="workflow-runtime-decision-actions">
                {decision.actions.map((action) => (
                  <button
                    type="button"
                    className={`workflow-runtime-decision-action ${action.tone}`}
                    key={action.id}
                    title={action.description}
                    disabled={Boolean(workflowBusy)}
                    onClick={() =>
                      void onAnswerInput(
                        detail,
                        card,
                        action.choiceId ? { choiceId: action.choiceId, text: action.label } : { text: action.label },
                      )
                    }
                  >
                    <span>
                      <strong>{action.label}</strong>
                      {action.description && <small>{action.description}</small>}
                    </span>
                    <Check size={14} />
                  </button>
                ))}
              </div>
            )}
            {decision.freeform ? (
              <p className="panel-note">Use the workflow composer below for freeform answers.</p>
            ) : decision.emptyState ? (
              <p className="panel-note">{decision.emptyState}</p>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
