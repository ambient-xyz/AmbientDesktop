import { AlertCircle, CheckCircle2, Copy, FileText, LoaderCircle, RefreshCw, SquarePen } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

import type {
  AmbientPluginAuthAccountSummary,
  AmbientPluginRegistry,
  WorkflowArtifactSummary,
  WorkflowAgentThreadSummary,
  WorkflowCompileAuditSummary,
  WorkflowCompileProgress,
  WorkflowConnectorDataRetention,
  WorkflowConnectorManifestGrant,
  WorkflowGraphNode,
  WorkflowPluginCapabilityGrant,
  WorkflowRunDetail,
  WorkflowRunLimitOverrides,
  WorkflowRunSummary,
  WorkflowVersionSummary,
} from "../../shared/types";
import { workflowDiscoveryAnswerText } from "../../shared/workflowDiscovery";
import { workflowSourceEditDiffSummary, type AutomationSchedulePreset } from "./automationUiModel";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { useRunningClock } from "./AutomationsRunningClock";
import { PermissionFullAccessReceiptList, formatTaskState } from "./RightPanel";
import { WorkflowDiscoveryContextReview } from "./AutomationsWorkflowDiscoveryViews";
import {
  WorkflowAmbientCliCallList,
  WorkflowConnectorCallList,
  WorkflowConnectorGrantList,
  WorkflowModelCallList,
  WorkflowPluginCapabilityList,
  WorkflowStepList,
} from "./AutomationsWorkflowEvidenceViews";
import type { PermissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import { workflowCompileActivityModel, type WorkflowCompileActivityAction } from "./workflowCompileActivityUiModel";
import {
  workflowReviewActionLabel,
  workflowReviewActionTitle,
  type WorkflowReviewWorkspaceModel,
  type WorkflowThreadScheduleItem,
  type WorkflowThreadScheduleState,
} from "./workflowReviewUiModel";
import { workflowRunIdleTimeoutOptions, workflowRunLimitSummary, type WorkflowRunTotalLimitMode } from "./workflowRunLimitsUiModel";
import { workflowSourceHighlightModel, workflowSourceMappingRows } from "./workflowSourceHighlightUiModel";
import type { WorkflowReviewEvidenceItem, WorkflowReviewSection } from "./workflowReviewUiModel";

export function WorkflowCompileActivity({
  active,
  progress,
  onRetrySameContext,
  onOpenDiagnostics,
  onEditRequest,
  onReportUnsupported,
}: {
  active: boolean;
  progress: WorkflowCompileProgress[];
  onRetrySameContext?: () => void;
  onOpenDiagnostics?: (path: string) => void;
  onEditRequest?: () => void;
  onReportUnsupported?: (reportText: string) => void;
}) {
  const now = useRunningClock(active);
  const model = workflowCompileActivityModel({ active, progress, nowMs: now });
  if (!model) return null;

  function actionDisabled(action: WorkflowCompileActivityAction): boolean {
    if (action.disabled) return true;
    if (action.id === "retry_same_context") return !onRetrySameContext;
    if (action.id === "open_diagnostics") return !onOpenDiagnostics || !model?.failureArtifactPath;
    if (action.id === "edit_request") return !onEditRequest;
    if (action.id === "report_unsupported") return !onReportUnsupported || !model?.failureReportText;
    return false;
  }

  function actionTitle(action: WorkflowCompileActivityAction): string {
    if (action.disabledReason) return action.disabledReason;
    if (action.id === "retry_same_context" && !onRetrySameContext) return "Retry is unavailable from this panel.";
    if (action.id === "open_diagnostics" && (!onOpenDiagnostics || !model?.failureArtifactPath)) return "No retained diagnostics artifact is available.";
    if (action.id === "edit_request" && !onEditRequest) return "Request editing is unavailable from this panel.";
    if (action.id === "report_unsupported" && (!onReportUnsupported || !model?.failureReportText)) return "No compiler failure report is available.";
    return action.title;
  }

  function runAction(action: WorkflowCompileActivityAction) {
    if (actionDisabled(action)) return;
    if (action.id === "retry_same_context") onRetrySameContext?.();
    if (action.id === "open_diagnostics") {
      const artifactPath = model?.failureArtifactPath;
      if (artifactPath) onOpenDiagnostics?.(artifactPath);
    }
    if (action.id === "edit_request") onEditRequest?.();
    if (action.id === "report_unsupported") {
      const reportText = model?.failureReportText;
      if (reportText) onReportUnsupported?.(reportText);
    }
  }

  return (
    <div className={`workflow-compile-activity run-activity-card ${model.tone}`} role="status" aria-live="polite" aria-label="Workflow compiler progress">
      <div className="run-activity-header">
        <div>
          <strong>{model.title}</strong>
          <span title={model.subtitle}>{model.subtitle}</span>
        </div>
        {model.tone === "failed" ? (
          <AlertCircle size={16} />
        ) : model.tone === "completed" ? (
          <CheckCircle2 size={16} />
        ) : (
          <LoaderCircle size={16} className="spin" />
        )}
      </div>
      <div className="workflow-compile-meter" aria-hidden="true">
        <span style={{ width: `${model.percent}%` }} />
      </div>
      {model.metrics.length > 0 && (
        <div className="run-activity-metrics workflow-compile-metrics">
          {model.metrics.map((metric) => (
            <span key={metric.label}>{metric.label}: {metric.value}</span>
          ))}
        </div>
      )}
      {model.actions.length > 0 && (
        <div className="workflow-compile-actions" aria-label="Workflow compile failure actions">
          {model.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`panel-button mini workflow-compile-action ${action.tone}`}
              disabled={actionDisabled(action)}
              title={actionTitle(action)}
              onClick={() => runAction(action)}
            >
              {workflowCompileActionIcon(action.id)}
              {action.label}
            </button>
          ))}
        </div>
      )}
      <div className="run-activity-lines">
        {model.steps.map((step) => {
          return (
            <div key={step.id} className={`run-activity-line thinking compile-step ${step.state}`}>
              <span />
              <p>
                {step.message}
                {step.detail && <small className="workflow-compile-detail">{step.detail}</small>}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export function workflowCompileActionIcon(actionId: WorkflowCompileActivityAction["id"]) {
  if (actionId === "retry_same_context") return <RefreshCw size={13} />;
  if (actionId === "open_diagnostics") return <FileText size={13} />;
  if (actionId === "edit_request") return <SquarePen size={13} />;
  return <Copy size={13} />;
}


export function WorkflowProgramInspector({
  artifact,
  detail,
  disabled = false,
  manifestOpen = true,
  sourceOpen,
  rootClassName = "workflow-program-inspector",
  sourceSaveBusy = false,
  persistedSourceDraft,
  selectedSourceNode,
  sourceNodes,
  onSelectSourceNode,
  sourceVersion,
  onSourceDraftChange,
  onSourceDraftClear,
  onSourceSave,
}: {
  artifact: WorkflowArtifactSummary;
  detail?: WorkflowRunDetail;
  disabled?: boolean;
  manifestOpen?: boolean;
  sourceOpen?: boolean;
  rootClassName?: string;
  sourceSaveBusy?: boolean;
  persistedSourceDraft?: string;
  selectedSourceNode?: WorkflowGraphNode;
  sourceNodes?: WorkflowGraphNode[];
  onSelectSourceNode?: (nodeId: string) => void;
  sourceVersion?: WorkflowVersionSummary;
  onSourceDraftChange?: (source: string) => void;
  onSourceDraftClear?: () => void;
  onSourceSave?: (source: string) => Promise<void> | void;
}) {
  const [editingSource, setEditingSource] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");
  const hasPersistedSourceDraft = detail?.sourceContent !== undefined && persistedSourceDraft !== undefined && persistedSourceDraft !== detail.sourceContent;
  useEffect(() => {
    if (!editingSource) setSourceDraft(hasPersistedSourceDraft ? persistedSourceDraft : (detail?.sourceContent ?? ""));
  }, [detail?.sourceContent, editingSource, hasPersistedSourceDraft, persistedSourceDraft]);
  const sourceDirty = detail?.sourceContent !== undefined && sourceDraft !== detail.sourceContent;
  const sourceDiff = detail?.sourceContent !== undefined ? workflowSourceEditDiffSummary(detail.sourceContent, sourceDraft) : undefined;
  const sourceHighlight = detail?.sourceContent ? workflowSourceHighlightModel({ source: detail.sourceContent, node: selectedSourceNode, version: sourceVersion }) : undefined;
  const sourceMappingRows = workflowSourceMappingRows(sourceNodes ?? (selectedSourceNode ? [selectedSourceNode] : undefined), 8);
  const selectedSourceMapping = sourceHighlight ? undefined : workflowSourceMappingRows(selectedSourceNode ? [selectedSourceNode] : undefined, 1)[0];
  const sourceEditable = detail?.sourceProvenance?.editable !== false;
  const sourceProgramLabel = detail?.sourceProvenance?.kind === "program_ir_generated" ? "Generated Program" : "Source Program";
  const updateSourceDraft = (source: string) => {
    setSourceDraft(source);
    onSourceDraftChange?.(source);
  };
  const startSourceEdit = () => {
    if (!sourceEditable) return;
    setSourceDraft(hasPersistedSourceDraft ? persistedSourceDraft! : (detail?.sourceContent ?? ""));
    setEditingSource(true);
  };
  const cancelSourceEdit = () => {
    onSourceDraftClear?.();
    setEditingSource(false);
  };

  return (
    <div className={rootClassName}>
      <details open={manifestOpen}>
        <summary>Manifest</summary>
        <pre>{JSON.stringify(artifact.manifest, null, 2)}</pre>
      </details>
      <details open={sourceOpen ?? Boolean(detail?.sourceContent)}>
        <summary>{sourceProgramLabel}</summary>
        {sourceHighlight ? (
          <div className="workflow-source-selection-proof">
            <strong>{sourceHighlight.nodeLabel}</strong>
            <span>{sourceHighlight.callKindLabel}</span>
            <span>{sourceHighlight.rangeLabel}</span>
            {sourceHighlight.versionLabel && <span>{sourceHighlight.versionLabel}</span>}
            {sourceHighlight.commitLabel && <span>Commit {sourceHighlight.commitLabel}</span>}
          </div>
        ) : selectedSourceMapping ? (
          <div className="workflow-source-selection-proof">
            <strong>{selectedSourceMapping.nodeLabel}</strong>
            <span>{selectedSourceMapping.kindLabel}</span>
            <span>{selectedSourceMapping.rangeLabel}</span>
            <span>Source body not loaded</span>
          </div>
        ) : null}
        {sourceMappingRows.length > 0 && (
          <div className="workflow-source-mapping-list">
            <AutomationHeadingLabel tooltip="Generated program ranges mapped back to workflow graph nodes. Select a graph node to highlight its corresponding generated range.">
              Program mappings
            </AutomationHeadingLabel>
            {sourceMappingRows.map((row) =>
              onSelectSourceNode ? (
                <button
                  type="button"
                  className="workflow-source-mapping-row interactive"
                  title={`Focus ${row.nodeLabel} in the workflow diagram`}
                  key={row.id}
                  onClick={() => onSelectSourceNode(row.nodeId)}
                >
                  <strong>{row.nodeLabel}</strong>
                  <span>{row.kindLabel}</span>
                  <span>{row.rangeLabel}</span>
                  <code>{row.snippet}</code>
                </button>
              ) : (
                <div className="workflow-source-mapping-row" key={row.id}>
                  <strong>{row.nodeLabel}</strong>
                  <span>{row.kindLabel}</span>
                  <span>{row.rangeLabel}</span>
                  <code>{row.snippet}</code>
                </div>
              ),
            )}
          </div>
        )}
        {detail?.sourceContent ? (
          <>
            <div className="workflow-source-actions">
              {editingSource ? (
                <>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={disabled || sourceSaveBusy || !sourceDirty || !sourceDraft.trim()}
                    onClick={() => {
                      void Promise.resolve(onSourceSave?.(sourceDraft)).then(() => setEditingSource(false));
                    }}
                  >
                    {sourceSaveBusy ? "Saving source" : "Save source"}
                  </button>
                  <button type="button" className="panel-button mini" disabled={sourceSaveBusy} onClick={cancelSourceEdit}>
                    Cancel source edit
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="panel-button mini"
                  disabled={disabled || !onSourceSave || !sourceEditable}
                  title={sourceEditable ? "Edit legacy workflow source." : (detail?.sourceProvenance?.reason ?? "Generated program is not editable.")}
                  onClick={startSourceEdit}
                >
                  {hasPersistedSourceDraft ? "Resume source edit" : "Edit source"}
                </button>
              )}
              {!sourceEditable && <span className="workflow-source-draft-note">IR-generated program; revise through Plan/Edit.</span>}
              {!editingSource && hasPersistedSourceDraft && <span className="workflow-source-draft-note">Unsaved source draft</span>}
            </div>
            {editingSource ? (
              <>
                {sourceDiff && (
                  <div className={`workflow-source-diff-preview${sourceDiff.changed ? "" : " clean"}`} aria-live="polite">
                    <strong>{sourceDiff.label}</strong>
                    {sourceDiff.previewLines.length > 0 && (
                      <div className="workflow-source-diff-lines">
                        {sourceDiff.previewLines.map((line, index) => (
                          <code className={line.kind} key={`${line.kind}-${index}`}>
                            {line.kind === "added" ? "+" : "-"} {line.text || "(blank line)"}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <textarea
                  className="panel-textarea workflow-source-editor"
                  value={sourceDraft}
                  onChange={(event) => updateSourceDraft(event.target.value)}
                  placeholder="Workflow source"
                  spellCheck={false}
                />
              </>
            ) : (
              <>
                <pre className={sourceHighlight ? "workflow-source-highlighted" : undefined}>
                  {sourceHighlight
                    ? sourceHighlight.chunks.map((chunk, index) =>
                        chunk.highlighted ? (
                          <mark key={index}>{chunk.text}</mark>
                        ) : (
                          <span key={index}>{chunk.text}</span>
                        ),
                      )
                    : detail.sourceContent}
                </pre>
              </>
            )}
          </>
        ) : detail?.sourceReadError ? (
          <p className="panel-status error">{detail.sourceReadError}</p>
        ) : (
          <p className="panel-note">Open the latest audit to load the generated program.</p>
        )}
      </details>
      <div className="workflow-artifact-paths" aria-label="Workflow artifact retained paths">
        <span>
          <strong>Source</strong>
          <code className="workflow-path">{artifact.sourcePath}</code>
        </span>
        <span>
          <strong>State</strong>
          <code className="workflow-path">{artifact.statePath}</code>
        </span>
      </div>
    </div>
  );
}


export function WorkflowReviewTile({ section }: { section: WorkflowReviewSection }) {
  return (
    <div className={`workflow-review-tile ${section.tone}`} data-workflow-review-tile={section.id}>
      <span>{section.label}</span>
      <strong>{section.value}</strong>
      <small>{section.detail}</small>
    </div>
  );
}


export function WorkflowReviewEvidenceStrip({
  items,
  onOpenPanel,
}: {
  items: WorkflowReviewEvidenceItem[];
  onOpenPanel: (panel: WorkflowReviewEvidenceItem["panel"]) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="workflow-review-section workflow-review-evidence-strip" data-workflow-review-section="overview_evidence">
      <div className="panel-section-heading">
        <AutomationHeadingLabel tooltip="Review evidence collects the important provenance that should be checked before approval: capability grants, program mappings, and retained run evidence.">
          Review evidence
        </AutomationHeadingLabel>
        <span className="panel-note inline">{items.length} item{items.length === 1 ? "" : "s"}</span>
      </div>
      <div className="workflow-review-evidence-grid">
        {items.map((item) => (
          <button
            type="button"
            className={`workflow-review-evidence-card ${item.tone}`}
            key={item.id}
            title={`${item.detail} ${item.actionLabel}.`}
            onClick={() => onOpenPanel(item.panel)}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
            <em>{item.actionLabel}</em>
          </button>
        ))}
      </div>
    </section>
  );
}


export type WorkflowReviewWorkspaceProps = {
  threadId: string;
  discoveryQuestions: WorkflowAgentThreadSummary["discoveryQuestions"];
  artifact: WorkflowArtifactSummary;
  latestRun?: WorkflowRunSummary;
  detail?: WorkflowRunDetail;
  review: WorkflowReviewWorkspaceModel;
  runBlocked: boolean;
  runLimits: WorkflowRunLimitOverrides;
  currentVersion?: WorkflowVersionSummary;
  selectedSourceNode?: WorkflowGraphNode;
  sourceNodes?: WorkflowGraphNode[];
  scheduleState: WorkflowThreadScheduleState;
  workflowGrantRegistry: PermissionGrantRegistryModel;
  workflowRunIdleTimeoutMs: number;
  workflowRunTotalLimitMode: WorkflowRunTotalLimitMode;
  workflowBusy?: string;
  schedulePreset: AutomationSchedulePreset;
  scheduleExpression: string;
  scheduleEnabled: boolean;
  scheduleBusy?: boolean;
  scheduleTargetType?: string;
  scheduleError?: string;
  expandedScheduleHistoryId?: string;
  permissionGrantRevoking?: string;
  workflowSourceDraft?: string;
  connectorAccounts?: Record<string, AmbientPluginAuthAccountSummary[]>;
  pluginRegistry?: AmbientPluginRegistry;
  connectorGrantsTooltip: string;
  auditPreviewTooltip: string;
  reviewQueueTooltip: string;
  renderVersionHistory: () => ReactNode;
  auditReportPreview: (value: string | undefined) => string;
  onOpenPanel: (panel: WorkflowReviewEvidenceItem["panel"]) => void;
  onWorkflowRunIdleTimeoutMsChange: (idleTimeoutMs: number) => void;
  onWorkflowRunTotalLimitModeChange: (mode: WorkflowRunTotalLimitMode) => void;
  onRevalidateArtifact: (artifactId: string) => void | Promise<void>;
  onRunArtifact: (
    artifactId: string,
    mode: "dry_run" | "execute",
    options?: { allowUnapproved?: boolean; runLimits?: WorkflowRunLimitOverrides },
  ) => void | Promise<unknown>;
  onOpenRunDetail: (runId: string) => void | Promise<void>;
  onReviewArtifact: (artifactId: string, status: "approved" | "rejected") => void | Promise<void>;
  onStartRevision: (artifact: WorkflowArtifactSummary) => void;
  onScheduleThread: (threadId: string) => void;
  onCancelRun: (runId: string) => void | Promise<void>;
  onSchedulePresetChange: (preset: AutomationSchedulePreset) => void;
  onScheduleExpressionChange: (expression: string) => void;
  onScheduleEnabledChange: (enabled: boolean) => void;
  onCreateSchedule: (targetKind: "workflow_thread" | "workflow_version", targetId: string) => void | Promise<void>;
  onCreateScheduleGrant: (schedule: WorkflowThreadScheduleItem) => void | Promise<void>;
  onSetExpandedScheduleHistoryId: (scheduleId: string | undefined) => void;
  onConnectorAccountChange: (connector: WorkflowConnectorManifestGrant, nextAccountId: string) => void | Promise<void>;
  onConnectorRetentionChange: (connector: WorkflowConnectorManifestGrant, dataRetention: WorkflowConnectorDataRetention) => void | Promise<void>;
  onConnectorScopeRemove: (connector: WorkflowConnectorManifestGrant, scope: string) => void | Promise<void>;
  onConnectorReject: (connector: WorkflowConnectorManifestGrant) => void | Promise<void>;
  onRevokePermissionGrantIds: (grantIds: string[], busyId: string) => void | Promise<void>;
  onRevokePermissionGrant: (grantId: string) => void | Promise<void>;
  onSelectSourceNode: (nodeId: string) => void;
  onSourceDraftChange: (source: string) => void;
  onSourceDraftClear: () => void;
  onSourceSave: (source: string) => void | Promise<void>;
  onResolveApproval: (runId: string, approvalId: string, decision: "approved" | "rejected") => void | Promise<void>;
};

export function WorkflowReviewWorkspace({
  threadId,
  discoveryQuestions,
  artifact,
  latestRun,
  detail,
  review,
  runBlocked,
  runLimits,
  currentVersion,
  selectedSourceNode,
  sourceNodes,
  scheduleState,
  workflowGrantRegistry,
  workflowRunIdleTimeoutMs,
  workflowRunTotalLimitMode,
  workflowBusy,
  schedulePreset,
  scheduleExpression,
  scheduleEnabled,
  scheduleBusy,
  scheduleTargetType,
  scheduleError,
  expandedScheduleHistoryId,
  permissionGrantRevoking,
  workflowSourceDraft,
  connectorAccounts,
  pluginRegistry,
  connectorGrantsTooltip,
  auditPreviewTooltip,
  reviewQueueTooltip,
  renderVersionHistory,
  auditReportPreview,
  onOpenPanel,
  onWorkflowRunIdleTimeoutMsChange,
  onWorkflowRunTotalLimitModeChange,
  onRevalidateArtifact,
  onRunArtifact,
  onOpenRunDetail,
  onReviewArtifact,
  onStartRevision,
  onScheduleThread,
  onCancelRun,
  onSchedulePresetChange,
  onScheduleExpressionChange,
  onScheduleEnabledChange,
  onCreateSchedule,
  onCreateScheduleGrant,
  onSetExpandedScheduleHistoryId,
  onConnectorAccountChange,
  onConnectorRetentionChange,
  onConnectorScopeRemove,
  onConnectorReject,
  onRevokePermissionGrantIds,
  onRevokePermissionGrant,
  onSelectSourceNode,
  onSourceDraftChange,
  onSourceDraftClear,
  onSourceSave,
  onResolveApproval,
}: WorkflowReviewWorkspaceProps) {
  const canApprove = artifact.status === "ready_for_preview";
  const runLimitSummary = workflowRunLimitSummary(
    { idleTimeoutMs: workflowRunIdleTimeoutMs, totalLimitMode: workflowRunTotalLimitMode },
    artifact.manifest,
  );
  const idleTimeoutTitle = "Stop the run if no stream event, tool event, or workflow event arrives for this long.";
  const totalLimitTitle =
    artifact.manifest.maxRunMs === undefined
      ? "This workflow manifest has no total runtime cap."
      : "Use the workflow's generated run limit instead of the value selected here.";
  const openAuditTitle = "Open the latest audit trail, including events, model calls, grants, checkpoints, and generated artifacts.";
  const reviseRequestTitle = "Ask Ambient to revise the workflow request, graph, or generated program before approval.";
  const scheduleTitle =
    artifact.status === "approved"
      ? "Create or update a schedule for the approved workflow version."
      : "Approve this workflow before scheduling it.";

  return (
    <section className={`workflow-review-workspace workflow-artifact-row ${review.noticeTone}`} aria-label="Workflow review workspace">
      <div className="workflow-review-hero">
        <div>
          <span className={`workflow-review-state ${review.noticeTone}`}>{review.noticeTitle}</span>
          <h3>{review.title}</h3>
          <p>{review.summary}</p>
          <div className="plugin-badges">
            <span>{review.statusLabel}</span>
            <span>{review.phaseLabel}</span>
            {review.badges.map((badge) => (
              <span key={`${artifact.id}-${badge}`}>{badge}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="workflow-review-notice">{review.noticeDetail}</p>
      <WorkflowReviewEvidenceStrip items={review.evidence} onOpenPanel={onOpenPanel} />
      <section className="workflow-review-section workflow-review-controls-card" data-workflow-review-section="review_controls">
        <div className="panel-section-heading">
          <div>
            <AutomationHeadingLabel tooltip="Validate, test, inspect, intentionally run, and then decide what happens to this workflow version.">
              Review controls
            </AutomationHeadingLabel>
            <p className="panel-note">Ordered by likely use: validate, dry run, inspect audit, run intentionally, then approve, revise, reject, or schedule.</p>
          </div>
          <span className={`workflow-review-state ${review.noticeTone}`}>{review.noticeTitle}</span>
        </div>
        <div className="plugin-badges workflow-review-control-badges" aria-label="Workflow review summary">
          <span>{review.statusLabel}</span>
          <span>{review.phaseLabel}</span>
          {review.badges.slice(0, 4).map((badge) => (
            <span key={`${artifact.id}-control-${badge}`}>{badge}</span>
          ))}
        </div>
        <div className="workflow-review-controls-layout">
          <div className="workflow-run-settings-inline" aria-label="Workflow run settings">
            <label title={idleTimeoutTitle}>
              <span>Idle timeout</span>
              <select
                className="automation-select mini"
                value={workflowRunIdleTimeoutMs}
                onChange={(event) => onWorkflowRunIdleTimeoutMsChange(Number(event.target.value))}
                disabled={Boolean(workflowBusy)}
                title={idleTimeoutTitle}
              >
                {workflowRunIdleTimeoutOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="workflow-total-limit-toggle" title={totalLimitTitle}>
              <input
                type="checkbox"
                checked={workflowRunTotalLimitMode === "manifest" && artifact.manifest.maxRunMs !== undefined}
                disabled={Boolean(workflowBusy) || artifact.manifest.maxRunMs === undefined}
                onChange={(event) => onWorkflowRunTotalLimitModeChange(event.target.checked ? "manifest" : "disabled")}
              />
              <span>{artifact.manifest.maxRunMs === undefined ? "No total cap" : "Use manifest cap"}</span>
            </label>
            <small>{runLimitSummary}</small>
          </div>
          <div className="workflow-review-action-grid" aria-label="Workflow review actions">
            <button
              type="button"
              className="panel-button mini"
              disabled={Boolean(workflowBusy)}
              title={workflowReviewActionTitle("revalidate")}
              onClick={() => void onRevalidateArtifact(artifact.id)}
            >
              {workflowReviewActionLabel("revalidate", workflowBusy === `revalidate:${artifact.id}`)}
            </button>
            <button
              type="button"
              className="panel-button mini"
              disabled={Boolean(workflowBusy) || runBlocked}
              title={workflowReviewActionTitle("dry_run")}
              onClick={() => void onRunArtifact(artifact.id, "dry_run", { runLimits })}
            >
              {workflowReviewActionLabel("dry_run", workflowBusy === `dry_run:${artifact.id}`)}
            </button>
            {latestRun && (
              <button
                type="button"
                className="panel-button mini"
                disabled={workflowBusy === latestRun.id}
                title={openAuditTitle}
                onClick={() => void onOpenRunDetail(latestRun.id)}
              >
                {workflowBusy === latestRun.id ? "Opening" : "Open audit"}
              </button>
            )}
            {artifact.status === "approved" ? (
              <button
                type="button"
                className="panel-button mini"
                disabled={Boolean(workflowBusy)}
                title={workflowReviewActionTitle("run")}
                onClick={() => void onRunArtifact(artifact.id, "execute", { runLimits })}
              >
                {workflowReviewActionLabel("run", workflowBusy === `execute:${artifact.id}`)}
              </button>
            ) : (
              <button
                type="button"
                className="panel-button mini danger"
                disabled={Boolean(workflowBusy) || runBlocked}
                title={workflowReviewActionTitle("run_unapproved")}
                onClick={() => void onRunArtifact(artifact.id, "execute", { allowUnapproved: true, runLimits })}
              >
                {workflowReviewActionLabel("run_unapproved", workflowBusy === `execute:${artifact.id}`)}
              </button>
            )}
            {canApprove && (
              <button
                type="button"
                className="panel-button mini"
                disabled={Boolean(workflowBusy)}
                title={workflowReviewActionTitle("approve")}
                onClick={() => void onReviewArtifact(artifact.id, "approved")}
              >
                {workflowReviewActionLabel("approve", workflowBusy === `review:${artifact.id}:approved`)}
              </button>
            )}
            <button type="button" className="panel-button mini" disabled={Boolean(workflowBusy)} title={reviseRequestTitle} onClick={() => onStartRevision(artifact)}>
              Revise request
            </button>
            {canApprove && (
              <button
                type="button"
                className="panel-button mini danger"
                disabled={Boolean(workflowBusy)}
                title={workflowReviewActionTitle("reject")}
                onClick={() => void onReviewArtifact(artifact.id, "rejected")}
              >
                {workflowReviewActionLabel("reject", workflowBusy === `review:${artifact.id}:rejected`)}
              </button>
            )}
            <button
              type="button"
              className="panel-button mini"
              disabled={Boolean(workflowBusy) || artifact.status !== "approved"}
              title={scheduleTitle}
              onClick={() => onScheduleThread(threadId)}
            >
              Schedule
            </button>
            {latestRun?.status === "running" && (
              <button
                type="button"
                className="panel-button mini danger"
                disabled={workflowBusy === `cancel:${latestRun.id}`}
                title="Cancel the currently running workflow run."
                onClick={() => void onCancelRun(latestRun.id)}
              >
                {workflowBusy === `cancel:${latestRun.id}` ? "Canceling" : "Cancel"}
              </button>
            )}
          </div>
        </div>
      </section>
      <section className="workflow-review-section">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip="Create schedules directly from this workflow thread. Latest-approved schedules follow future approvals; pinned schedules keep running one approved version.">
            Scheduling
          </AutomationHeadingLabel>
          <span className="panel-note inline">{scheduleState.schedules.length} schedule{scheduleState.schedules.length === 1 ? "" : "s"}</span>
        </div>
        <div className="automation-controls-grid compact">
          <label className="automation-field">
            <span>
              <strong>Cadence</strong>
            </span>
            <select className="automation-select" value={schedulePreset} onChange={(event) => onSchedulePresetChange(event.target.value as AutomationSchedulePreset)}>
              <option value="manual">Manual</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly</option>
              <option value="advanced">Advanced cron</option>
            </select>
          </label>
          {schedulePreset === "advanced" && (
            <label className="automation-field">
              <span>
                <strong>Cron</strong>
              </span>
              <input className="panel-input" value={scheduleExpression} onChange={(event) => onScheduleExpressionChange(event.target.value)} placeholder="0 9 * * *" />
            </label>
          )}
          <label className="automation-field">
            <span>
              <strong>State</strong>
            </span>
            <select className="automation-select" value={scheduleEnabled ? "enabled" : "paused"} onChange={(event) => onScheduleEnabledChange(event.target.value === "enabled")}>
              <option value="enabled">Enabled</option>
              <option value="paused">Paused</option>
            </select>
          </label>
        </div>
        <div className="task-heading-actions">
          <button
            type="button"
            className="panel-button mini"
            disabled={scheduleBusy || !scheduleState.canScheduleLatestApproved}
            title={scheduleState.canScheduleLatestApproved ? `Follow latest approved ${scheduleState.latestApprovedVersionLabel ?? "version"}.` : scheduleState.latestApprovedBlockReason}
            onClick={() => void onCreateSchedule("workflow_thread", threadId)}
          >
            {scheduleBusy && scheduleTargetType === "workflow_thread" ? "Scheduling" : "Schedule latest approved"}
          </button>
          <button
            type="button"
            className="panel-button mini"
            disabled={scheduleBusy || !scheduleState.canPinCurrentVersion || !scheduleState.currentVersionId}
            title={scheduleState.canPinCurrentVersion ? `Pin current ${scheduleState.currentVersionLabel ?? "version"}.` : scheduleState.pinCurrentBlockReason}
            onClick={() => scheduleState.currentVersionId && void onCreateSchedule("workflow_version", scheduleState.currentVersionId)}
          >
            {scheduleBusy && scheduleTargetType === "workflow_version" ? "Scheduling" : "Pin this version"}
          </button>
        </div>
        {scheduleError && <p className="panel-status error">{scheduleError}</p>}
        {scheduleState.schedules.length ? (
          <div className="workflow-version-list">
            {scheduleState.schedules.map((schedule) => (
              <article className="workflow-version-card" key={schedule.id}>
                <div>
                  <div className="task-row-header">
                    <strong>{schedule.statusLabel}</strong>
                    <span>{schedule.mode === "latest_approved" ? "Latest approved" : schedule.mode === "pinned_version" ? "Pinned version" : "Artifact"}</span>
                  </div>
                  <p>{schedule.targetLabel}</p>
                  {schedule.grantLabel && (
                    <div className={`workflow-schedule-grant ${schedule.grantAction ? "blocked" : "ready"}`}>
                      <div>
                        <strong>{schedule.grantLabel}</strong>
                        {schedule.grantDetail && <span>{schedule.grantDetail}</span>}
                      </div>
                      {schedule.grantAction && (
                        <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={() => void onCreateScheduleGrant(schedule)}>
                          {scheduleBusy ? "Saving grant" : schedule.grantAction.label}
                        </button>
                      )}
                    </div>
                  )}
                  {schedule.latestRunLabel && (
                    <div className={`workflow-schedule-grant ${schedule.latestRunTone ?? "neutral"}`}>
                      <div>
                        <strong>{schedule.latestRunLabel}</strong>
                        {schedule.latestRunDetail && <span>{schedule.latestRunDetail}</span>}
                      </div>
                      {schedule.latestRunId && (
                        <button type="button" className="panel-button mini" disabled={workflowBusy === schedule.latestRunId} onClick={() => void onOpenRunDetail(schedule.latestRunId!)}>
                          {workflowBusy === schedule.latestRunId ? "Opening" : "Audit run"}
                        </button>
                      )}
                    </div>
                  )}
                  {schedule.recentRuns.length > 1 && (
                    <div className={`workflow-schedule-grant neutral workflow-schedule-history-drawer ${expandedScheduleHistoryId === schedule.id ? "expanded" : ""}`}>
                      <div>
                        <div className="workflow-schedule-history-header">
                          <strong>Recent unattended runs</strong>
                          {schedule.recentRuns.length > 2 && (
                            <button type="button" className="panel-button mini" onClick={() => onSetExpandedScheduleHistoryId(expandedScheduleHistoryId === schedule.id ? undefined : schedule.id)}>
                              {expandedScheduleHistoryId === schedule.id ? "Collapse" : `View ${schedule.recentRuns.length}`}
                            </button>
                          )}
                        </div>
                        {(expandedScheduleHistoryId === schedule.id ? schedule.recentRuns : schedule.recentRuns.slice(0, 2)).map((run) => (
                          <span key={run.id}>{run.statusLabel} · {run.detail}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="plugin-badges">
                  <span>{schedule.cadenceLabel}</span>
                  <span>{schedule.nextRunLabel}</span>
                  <span>{schedule.versionLabel}</span>
                  <span className={`workflow-schedule-drift ${schedule.driftTone}`}>{schedule.driftLabel}</span>
                  <span className={`workflow-schedule-dispatch ${schedule.dispatchTone}`}>{schedule.dispatchLabel}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="panel-note">No schedules yet. Approved workflow versions can run on a cadence or stay manual.</p>
        )}
      </section>
      <div className="workflow-review-grid">
        {review.sections.map((section) => (
          <WorkflowReviewTile section={section} key={section.id} />
        ))}
      </div>
      <WorkflowCompileAuditReview audit={detail?.compileAudit ?? artifact.compileAudit} />
      <section className="workflow-review-section">
        <AutomationHeadingLabel tooltip="Discovery answers and the graph snapshot are the review context for this generated workflow version.">
          Discovery summary
        </AutomationHeadingLabel>
        {discoveryQuestions.length ? (
          <div className="planner-decision-summary compact">
            {discoveryQuestions.map((question) => (
              <div key={question.id} className="planner-decision-summary-row">
                <span>{question.question}</span>
                <strong>{workflowDiscoveryAnswerText(question)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-note">This workflow was compiled directly from the request.</p>
        )}
      </section>
      <WorkflowDiscoveryContextReview model={review.discoveryContext} />
      {Boolean(artifact.manifest.connectors?.length || artifact.manifest.pluginCapabilities?.length) && (
        <section className="workflow-review-section" data-workflow-review-section="connectors">
          <AutomationHeadingLabel tooltip={connectorGrantsTooltip}>Capabilities and grants</AutomationHeadingLabel>
          <WorkflowConnectorGrantList
            connectors={artifact.manifest.connectors}
            connectorAccounts={connectorAccounts}
            disabled={Boolean(workflowBusy) || artifact.status === "rejected"}
            onAccountChange={(connector, nextAccountId) => void onConnectorAccountChange(connector, nextAccountId)}
            onRetentionChange={(connector, dataRetention) => void onConnectorRetentionChange(connector, dataRetention)}
            onRemoveScope={(connector, scope) => void onConnectorScopeRemove(connector, scope)}
            onReject={(connector) => void onConnectorReject(connector)}
          />
          <WorkflowPluginCapabilityList capabilities={artifact.manifest.pluginCapabilities as WorkflowPluginCapabilityGrant[] | undefined} registry={pluginRegistry} />
        </section>
      )}
      {(workflowGrantRegistry.groups.length > 0 || workflowGrantRegistry.fullAccessReceipts.length > 0) && (
        <section className="workflow-review-section workflow-review-grant-registry">
          <AutomationHeadingLabel tooltip="Persistent grants already available to this workflow through workflow, project, workspace, or trusted-plugin scope.">
            Persistent grants and receipts
          </AutomationHeadingLabel>
          <p className="panel-note">{workflowGrantRegistry.summary}</p>
          <div className="permission-grant-registry compact">
            {workflowGrantRegistry.groups.map((group) => {
              const busyId = `workflow-grant-scope:${threadId}:${group.id}`;
              return (
                <div className={`permission-grant-scope ${group.tone}`} key={group.id}>
                  <div className="permission-grant-scope-header">
                    <div>
                      <strong>{group.scopeLabel}</strong>
                      <span>{group.summary}</span>
                    </div>
                    <button
                      type="button"
                      className="panel-button mini danger"
                      disabled={!group.revokeIds.length || Boolean(permissionGrantRevoking)}
                      title={`Revoke ${group.activeCount} active ${group.scopeLabel.toLowerCase()} grant${group.activeCount === 1 ? "" : "s"} relevant to this workflow.`}
                      onClick={() => void onRevokePermissionGrantIds(group.revokeIds, busyId)}
                    >
                      {permissionGrantRevoking === busyId ? "Revoking" : "Revoke Scope"}
                    </button>
                  </div>
                  {group.rows.slice(0, 4).map((row) => (
                    <div className={`permission-log-row ${row.tone === "blocked" ? "denied" : "allowed"} permission-grant-registry-row`} key={row.id}>
                      <div>
                        <strong>{row.actionLabel}</strong>
                        <span>{row.riskLabel}</span>
                      </div>
                      <small title={row.targetLabel}>{row.targetLabel}</small>
                      <code title={row.impactLabel}>
                        {row.statusLabel} · {row.expiryLabel} · {row.recentUseLabel} · {row.provenanceLabel}
                      </code>
                      <button
                        type="button"
                        className="panel-button mini danger"
                        disabled={permissionGrantRevoking === row.id || !row.active}
                        title={row.impactLabel}
                        onClick={() => void onRevokePermissionGrant(row.id)}
                      >
                        {permissionGrantRevoking === row.id ? "Revoking" : row.active ? "Revoke" : row.statusLabel}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
            <PermissionFullAccessReceiptList receipts={workflowGrantRegistry.fullAccessReceipts} limit={4} />
          </div>
        </section>
      )}
      {renderVersionHistory()}
      <section className="workflow-review-section" data-workflow-review-section="source">
        <AutomationHeadingLabel tooltip="Generated program and manifest remain inspectable. WorkflowProgramIR artifacts are revised through Plan/Edit instead of manual source edits.">
          Program and manifest
        </AutomationHeadingLabel>
        <WorkflowProgramInspector
          artifact={artifact}
          detail={detail}
          disabled={Boolean(workflowBusy)}
          manifestOpen={false}
          rootClassName="workflow-review-program-inspector"
          sourceOpen={Boolean(selectedSourceNode)}
          sourceSaveBusy={workflowBusy === `source:${artifact.id}`}
          persistedSourceDraft={workflowSourceDraft}
          selectedSourceNode={selectedSourceNode}
          sourceNodes={sourceNodes}
          onSelectSourceNode={onSelectSourceNode}
          sourceVersion={currentVersion}
          onSourceDraftChange={onSourceDraftChange}
          onSourceDraftClear={onSourceDraftClear}
          onSourceSave={onSourceSave}
        />
      </section>
      {latestRun && (
        <section className="workflow-review-section workflow-review-audit-section" data-workflow-review-section="audit">
          <div className="run-card-header">
            <AutomationHeadingLabel tooltip={auditPreviewTooltip}>Audit preview</AutomationHeadingLabel>
            <button
              type="button"
              className="panel-button mini"
              disabled={workflowBusy === latestRun.id}
              title="Open the latest audit trail, including events, model calls, grants, checkpoints, and generated artifacts."
              onClick={() => void onOpenRunDetail(latestRun.id)}
            >
              {workflowBusy === latestRun.id ? "Opening" : "Open audit"}
            </button>
          </div>
          {detail ? (
            <>
              <div className="plugin-badges">
                <span>{formatTaskState(detail.run.status)}</span>
                <span>{detail.events.length} events</span>
                <span>{detail.modelCalls.length} model calls</span>
                <span>{detail.checkpoints.length} checkpoints</span>
                <span>{detail.approvals.length} review items</span>
              </div>
              <WorkflowStepList events={detail.events} />
              <WorkflowAmbientCliCallList events={detail.events} />
              <WorkflowConnectorCallList events={detail.events} />
              <WorkflowModelCallList modelCalls={detail.modelCalls} />
              {detail.approvals.length > 0 && (
                <WorkflowApprovalQueue
                  detail={detail}
                  workflowBusy={workflowBusy}
                  reviewQueueTooltip={reviewQueueTooltip}
                  onResolveApproval={onResolveApproval}
                />
              )}
              <pre>{auditReportPreview(detail.auditReport)}</pre>
            </>
          ) : (
            <p className="panel-note">Open the latest audit to inspect events, model calls, approvals, checkpoints, and generated program.</p>
          )}
        </section>
      )}
    </section>
  );
}

export function WorkflowApprovalQueue({
  detail,
  workflowBusy,
  reviewQueueTooltip,
  onResolveApproval,
}: {
  detail: WorkflowRunDetail;
  workflowBusy?: string;
  reviewQueueTooltip: string;
  onResolveApproval: (runId: string, approvalId: string, decision: "approved" | "rejected") => void | Promise<void>;
}) {
  return (
    <div className="workflow-review-list">
      <AutomationHeadingLabel tooltip={reviewQueueTooltip}>Review Queue</AutomationHeadingLabel>
      {detail.approvals.slice(0, 5).map((approval) => (
        <div key={approval.id}>
          <span>{formatTaskState(approval.status)}</span>
          <code>{approval.changeSetPreview}</code>
          {approval.status === "pending" && (
            <span className="workflow-review-actions">
              <button type="button" className="panel-button mini" disabled={workflowBusy === `approval:${approval.id}`} onClick={() => void onResolveApproval(detail.run.id, approval.id, "approved")}>
                Approve
              </button>
              <button type="button" className="panel-button mini danger" disabled={workflowBusy === `approval:${approval.id}`} onClick={() => void onResolveApproval(detail.run.id, approval.id, "rejected")}>
                Reject
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function WorkflowCompileAuditReview({ audit }: { audit?: WorkflowCompileAuditSummary }) {
  if (!audit) return null;
  const ruleIds = workflowCompileAuditRuleIds(audit);
  const failedValidatorCount = audit.failedValidatorIds.length;
  const validatorTone = failedValidatorCount ? "blocked" : audit.validationStatus === "passed" ? "ready" : "review";
  const fileLabels = [
    audit.promptAssemblyPath ? "prompt-assembly.json" : undefined,
    audit.compileContextPath ? "compile-context.json" : undefined,
    audit.validationReportPath ? "validation-report.json" : undefined,
  ].filter((label): label is string => Boolean(label));
  return (
    <section className="workflow-review-section workflow-compile-audit-review" data-workflow-review-section="compile_audit">
      <div className="panel-section-heading">
        <div>
          <AutomationHeadingLabel tooltip="Compiler audit shows the exact prompt modules, recipes, policy snippets, and validators used to assemble this workflow version.">
            Compile audit
          </AutomationHeadingLabel>
          <p className="panel-note">Use this to verify that compiler behavior came from modules, recipes, and validators rather than hidden prompt text.</p>
        </div>
        <span className={`workflow-review-state ${validatorTone}`}>{audit.validationStatus ? formatTaskState(audit.validationStatus) : "Audit loaded"}</span>
      </div>
      <div className="workflow-review-grid">
        <div className="workflow-review-tile ready">
          <span>Prompt modules</span>
          <strong>{audit.promptModuleCount}</strong>
          <small>
            {audit.stablePrefixModuleCount ?? 0} stable prefix, {audit.mutableSuffixModuleCount ?? 0} mutable suffix.
          </small>
        </div>
        <div className={`workflow-review-tile ${audit.selectedRecipeIds.length ? "ready" : "neutral"}`}>
          <span>Recipes</span>
          <strong>{audit.selectedRecipeIds.length} selected</strong>
          <small>{formatWorkflowCompileAuditList(audit.selectedRecipeIds, "No recipes selected.")}</small>
        </div>
        <div className={`workflow-review-tile ${ruleIds.length || audit.policyImplicationIds.length ? "review" : "neutral"}`}>
          <span>Policy refs</span>
          <strong>{ruleIds.length + audit.policyImplicationIds.length}</strong>
          <small>{formatWorkflowCompileAuditList([...ruleIds, ...audit.policyImplicationIds], "No policy refs retained.")}</small>
        </div>
        <div className={`workflow-review-tile ${validatorTone}`}>
          <span>Validators</span>
          <strong>{audit.validatorIds.length}</strong>
          <small>{failedValidatorCount ? `${formatWorkflowCompileAuditList(audit.failedValidatorIds)} failed.` : `${audit.diagnosticCount ?? 0} diagnostics.`}</small>
        </div>
      </div>
      <div className="planner-decision-summary compact">
        <div className="planner-decision-summary-row">
          <span>Selected recipes</span>
          <strong>{formatWorkflowCompileAuditList(audit.selectedRecipeIds, "None")}</strong>
        </div>
        <div className="planner-decision-summary-row">
          <span>Rejected recipes</span>
          <strong>{formatWorkflowCompileAuditList(audit.rejectedRecipeIds, "None")}</strong>
        </div>
        <div className="planner-decision-summary-row">
          <span>Validator ids</span>
          <strong>{formatWorkflowCompileAuditList(audit.validatorIds, "None")}</strong>
        </div>
        <div className="planner-decision-summary-row">
          <span>Metadata files</span>
          <strong>{formatWorkflowCompileAuditList(fileLabels, "No metadata files loaded.", 3)}</strong>
        </div>
      </div>
      {audit.promptModules.length ? (
        <div className="workflow-version-list workflow-compile-audit-modules">
          {audit.promptModules.slice(0, 8).map((module) => (
            <article className="workflow-version-card" key={module.id}>
              <div>
                <div className="task-row-header">
                  <strong>{module.id}</strong>
                  <span>{[module.layer, module.scope].filter(Boolean).join(" / ") || "module"}</span>
                </div>
                <p>{module.reason || "No module reason retained."}</p>
              </div>
              <div className="plugin-badges">
                {module.ruleIds.length > 0 && <span>rules: {formatWorkflowCompileAuditList(module.ruleIds, "none", 2)}</span>}
                {module.selectedRecipeIds.length > 0 && <span>recipes: {formatWorkflowCompileAuditList(module.selectedRecipeIds, "none", 2)}</span>}
                {module.selectedToolNames.length > 0 && <span>tools: {formatWorkflowCompileAuditList(module.selectedToolNames, "none", 2)}</span>}
                {module.selectedConnectorIds.length > 0 && <span>connectors: {formatWorkflowCompileAuditList(module.selectedConnectorIds, "none", 2)}</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="panel-note">No prompt module summaries were retained for this artifact.</p>
      )}
    </section>
  );
}


export function WorkflowCompileAuditInlineCard({ audit }: { audit?: WorkflowCompileAuditSummary }) {
  if (!audit) return null;
  const failedValidatorCount = audit.failedValidatorIds.length;
  const tone = failedValidatorCount ? "blocked" : audit.validationStatus === "passed" ? "ready" : "review";
  const policyRefCount = workflowCompileAuditRuleIds(audit).length + audit.policyImplicationIds.length;
  return (
    <section className={`task-row workflow-compile-audit-inline-card ${tone}`} data-workflow-review-section="compile_audit">
      <div className="task-row-header">
        <div>
          <small className="workflow-request-label">Compile audit</small>
          <strong>{audit.promptModuleCount} prompt modules</strong>
        </div>
        <span>{audit.validationStatus ? formatTaskState(audit.validationStatus) : "Loaded"}</span>
      </div>
      <p>
        {audit.selectedRecipeIds.length} recipe{audit.selectedRecipeIds.length === 1 ? "" : "s"} selected, {policyRefCount} policy ref
        {policyRefCount === 1 ? "" : "s"}, {audit.validatorIds.length} validator{audit.validatorIds.length === 1 ? "" : "s"}
        {failedValidatorCount ? `, ${failedValidatorCount} failed` : ""}.
      </p>
      <div className="plugin-badges">
        <span>{audit.stablePrefixModuleCount ?? 0} stable</span>
        <span>{audit.mutableSuffixModuleCount ?? 0} dynamic</span>
        {audit.selectedRecipeIds.slice(0, 3).map((recipeId) => (
          <span key={recipeId}>{recipeId}</span>
        ))}
      </div>
    </section>
  );
}


export function workflowCompileAuditRuleIds(audit: WorkflowCompileAuditSummary): string[] {
  return Array.from(new Set(audit.promptModules.flatMap((module) => module.ruleIds)));
}


export function formatWorkflowCompileAuditList(items: string[], empty = "None", limit = 6): string {
  const normalized = items.map((item) => item.trim()).filter(Boolean);
  if (!normalized.length) return empty;
  const visible = normalized.slice(0, limit).join(", ");
  const extra = normalized.length > limit ? `, +${normalized.length - limit} more` : "";
  return `${visible}${extra}`;
}
