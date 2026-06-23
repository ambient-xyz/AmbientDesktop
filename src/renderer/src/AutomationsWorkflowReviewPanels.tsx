import type { AmbientPluginAuthAccountSummary, AmbientPluginRegistry } from "../../shared/pluginTypes";
import type {
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowConnectorDataRetention,
  WorkflowConnectorManifestGrant,
  WorkflowPluginCapabilityGrant,
  WorkflowRunDetail,
  WorkflowRunLimitOverrides,
  WorkflowRunSummary,
} from "../../shared/workflowTypes";
import { workflowDiscoveryAnswerText } from "../../shared/workflowDiscovery";
import type { AutomationSchedulePreset } from "./automationUiModel";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import {
  WorkflowAmbientCliCallList,
  WorkflowConnectorCallList,
  WorkflowConnectorGrantList,
  WorkflowModelCallList,
  WorkflowPluginCapabilityList,
  WorkflowStepList,
} from "./AutomationsWorkflowEvidenceViews";
import { PermissionFullAccessReceiptList, formatTaskState } from "./RightPanel";
import type { PermissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import {
  workflowReviewActionLabel,
  workflowReviewActionTitle,
  type WorkflowReviewEvidenceItem,
  type WorkflowReviewWorkspaceModel,
  type WorkflowThreadScheduleItem,
  type WorkflowThreadScheduleState,
} from "./workflowReviewUiModel";
import {
  workflowRunIdleTimeoutOptions,
  workflowRunLimitSummary,
  type WorkflowRunTotalLimitMode,
} from "./workflowRunLimitsUiModel";

export function WorkflowReviewHero({
  artifactId,
  review,
}: {
  artifactId: string;
  review: WorkflowReviewWorkspaceModel;
}) {
  return (
    <div className="workflow-review-hero">
      <div>
        <span className={`workflow-review-state ${review.noticeTone}`}>{review.noticeTitle}</span>
        <h3>{review.title}</h3>
        <p>{review.summary}</p>
        <div className="plugin-badges">
          <span>{review.statusLabel}</span>
          <span>{review.phaseLabel}</span>
          {review.badges.map((badge) => (
            <span key={`${artifactId}-${badge}`}>{badge}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WorkflowReviewControlsSection({
  threadId,
  artifact,
  latestRun,
  review,
  runBlocked,
  runLimits,
  workflowRunIdleTimeoutMs,
  workflowRunTotalLimitMode,
  workflowBusy,
  onWorkflowRunIdleTimeoutMsChange,
  onWorkflowRunTotalLimitModeChange,
  onRevalidateArtifact,
  onRunArtifact,
  onOpenRunDetail,
  onReviewArtifact,
  onStartRevision,
  onScheduleThread,
  onCancelRun,
}: {
  threadId: string;
  artifact: WorkflowArtifactSummary;
  latestRun?: WorkflowRunSummary;
  review: WorkflowReviewWorkspaceModel;
  runBlocked: boolean;
  runLimits: WorkflowRunLimitOverrides;
  workflowRunIdleTimeoutMs: number;
  workflowRunTotalLimitMode: WorkflowRunTotalLimitMode;
  workflowBusy?: string;
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
}) {
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
  );
}

export function WorkflowReviewSchedulingSection({
  threadId,
  scheduleState,
  schedulePreset,
  scheduleExpression,
  scheduleEnabled,
  scheduleBusy,
  scheduleTargetType,
  scheduleError,
  expandedScheduleHistoryId,
  workflowBusy,
  onSchedulePresetChange,
  onScheduleExpressionChange,
  onScheduleEnabledChange,
  onCreateSchedule,
  onCreateScheduleGrant,
  onOpenRunDetail,
  onSetExpandedScheduleHistoryId,
}: {
  threadId: string;
  scheduleState: WorkflowThreadScheduleState;
  schedulePreset: AutomationSchedulePreset;
  scheduleExpression: string;
  scheduleEnabled: boolean;
  scheduleBusy?: boolean;
  scheduleTargetType?: string;
  scheduleError?: string;
  expandedScheduleHistoryId?: string;
  workflowBusy?: string;
  onSchedulePresetChange: (preset: AutomationSchedulePreset) => void;
  onScheduleExpressionChange: (expression: string) => void;
  onScheduleEnabledChange: (enabled: boolean) => void;
  onCreateSchedule: (targetKind: "workflow_thread" | "workflow_version", targetId: string) => void | Promise<void>;
  onCreateScheduleGrant: (schedule: WorkflowThreadScheduleItem) => void | Promise<void>;
  onOpenRunDetail: (runId: string) => void | Promise<void>;
  onSetExpandedScheduleHistoryId: (scheduleId: string | undefined) => void;
}) {
  return (
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
  );
}

export function WorkflowReviewDiscoverySummarySection({
  discoveryQuestions,
}: {
  discoveryQuestions: WorkflowAgentThreadSummary["discoveryQuestions"];
}) {
  return (
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
  );
}

export function WorkflowReviewCapabilitiesSection({
  artifact,
  workflowBusy,
  connectorAccounts,
  pluginRegistry,
  connectorGrantsTooltip,
  onConnectorAccountChange,
  onConnectorRetentionChange,
  onConnectorScopeRemove,
  onConnectorReject,
}: {
  artifact: WorkflowArtifactSummary;
  workflowBusy?: string;
  connectorAccounts?: Record<string, AmbientPluginAuthAccountSummary[]>;
  pluginRegistry?: AmbientPluginRegistry;
  connectorGrantsTooltip: string;
  onConnectorAccountChange: (connector: WorkflowConnectorManifestGrant, nextAccountId: string) => void | Promise<void>;
  onConnectorRetentionChange: (connector: WorkflowConnectorManifestGrant, dataRetention: WorkflowConnectorDataRetention) => void | Promise<void>;
  onConnectorScopeRemove: (connector: WorkflowConnectorManifestGrant, scope: string) => void | Promise<void>;
  onConnectorReject: (connector: WorkflowConnectorManifestGrant) => void | Promise<void>;
}) {
  if (!artifact.manifest.connectors?.length && !artifact.manifest.pluginCapabilities?.length) return null;

  return (
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
  );
}

export function WorkflowReviewGrantRegistrySection({
  threadId,
  workflowGrantRegistry,
  permissionGrantRevoking,
  onRevokePermissionGrantIds,
  onRevokePermissionGrant,
}: {
  threadId: string;
  workflowGrantRegistry: PermissionGrantRegistryModel;
  permissionGrantRevoking?: string;
  onRevokePermissionGrantIds: (grantIds: string[], busyId: string) => void | Promise<void>;
  onRevokePermissionGrant: (grantId: string) => void | Promise<void>;
}) {
  if (workflowGrantRegistry.groups.length === 0 && workflowGrantRegistry.fullAccessReceipts.length === 0) return null;

  return (
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
  );
}

export function WorkflowReviewAuditSection({
  latestRun,
  detail,
  workflowBusy,
  auditPreviewTooltip,
  reviewQueueTooltip,
  auditReportPreview,
  onOpenRunDetail,
  onResolveApproval,
}: {
  latestRun?: WorkflowRunSummary;
  detail?: WorkflowRunDetail;
  workflowBusy?: string;
  auditPreviewTooltip: string;
  reviewQueueTooltip: string;
  auditReportPreview: (value: string | undefined) => string;
  onOpenRunDetail: (runId: string) => void | Promise<void>;
  onResolveApproval: (runId: string, approvalId: string, decision: "approved" | "rejected") => void | Promise<void>;
}) {
  if (!latestRun) return null;

  return (
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
  );
}

function WorkflowApprovalQueue({
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
