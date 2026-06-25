import type { ReactNode, Ref } from "react";

import type { AmbientPermissionGrant, PermissionAuditEntry } from "../../shared/permissionTypes";
import type { AmbientPluginAuthAccountSummary, AmbientPluginRegistry } from "../../shared/pluginTypes";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowConnectorDataRetention, WorkflowConnectorManifestGrant, WorkflowGraphNode, WorkflowRevisionSummary, WorkflowRunDetail, WorkflowRunLimitOverrides, WorkflowRunSummary, WorkflowUserInputResponse, WorkflowVersionSummary } from "../../shared/workflowTypes";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import {
  WorkflowAmbientCliCapabilityList,
  WorkflowConnectorGrantList,
  WorkflowPluginCapabilityList,
} from "./AutomationsWorkflowEvidenceViews";
import { WorkflowRevisionPanel } from "./AutomationsWorkflowDiscoveryViews";
import { WorkflowOutputsPanel } from "./AutomationsWorkflowOutputViews";
import {
  WorkflowRunConsole,
  WorkflowRuntimeInputPanel,
} from "./AutomationsWorkflowRuntimeViews";
import type { WorkflowRuntimeInputCard } from "./workflowRuntimeInputUiModel";
import { PermissionFullAccessReceiptList, formatDurationMs, formatTaskState, formatTimelineTime } from "./RightPanel";
import { workflowPermissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import { workflowVersionHistoryModel } from "./workflowVersionHistoryUiModel";
import {
  workflowRunIdleTimeoutOptions,
  workflowRunLimitSummary,
  type WorkflowRunTotalLimitMode,
} from "./workflowRunLimitsUiModel";

export type WorkflowManifestPanelProps = {
  artifact: WorkflowArtifactSummary;
  latestRun?: WorkflowRunSummary;
  workflowBusy?: string;
  workflowRunIdleTimeoutMs: number;
  workflowRunTotalLimitMode: WorkflowRunTotalLimitMode;
  onWorkflowRunIdleTimeoutChange: (idleTimeoutMs: number) => void;
  onWorkflowRunTotalLimitModeChange: (mode: WorkflowRunTotalLimitMode) => void;
};

export type WorkflowPermissionsPanelProps = {
  thread: WorkflowAgentThreadSummary;
  artifact: WorkflowArtifactSummary;
  permissionGrants: AmbientPermissionGrant[];
  permissionAudit: PermissionAuditEntry[];
  activeThreadId?: string;
  workspacePath: string;
  workflowConnectorAccounts?: Record<string, AmbientPluginAuthAccountSummary[]>;
  automationPluginRegistry?: AmbientPluginRegistry;
  workflowBusy?: string;
  permissionGrantRevoking?: string;
  onWorkflowConnectorAccountChange: (artifactId: string, connector: WorkflowConnectorManifestGrant, nextAccountId: string) => Promise<void> | void;
  onWorkflowConnectorRetentionChange: (artifactId: string, connector: WorkflowConnectorManifestGrant, dataRetention: WorkflowConnectorDataRetention) => Promise<void> | void;
  onRemoveWorkflowConnectorScope: (artifactId: string, connector: WorkflowConnectorManifestGrant, scope: string) => Promise<void> | void;
  onRejectWorkflowConnectorGrant: (artifactId: string, connector: WorkflowConnectorManifestGrant) => Promise<void> | void;
  onRevokePermissionGrantIds: (ids: string[], busyId: string) => Promise<void>;
  onRevokePermissionGrant: (id: string) => Promise<void>;
};

export type WorkflowVersionHistoryPanelProps = {
  thread: WorkflowAgentThreadSummary;
  artifact: WorkflowArtifactSummary;
  versions: WorkflowVersionSummary[];
  revisions: WorkflowRevisionSummary[];
  workflowBusy?: string;
  onStartRevision: (artifact: WorkflowArtifactSummary) => void;
  onResolveRevision: (revisionId: string, decision: "applied" | "rejected") => void | Promise<unknown>;
  onRestoreVersionForReview: (version: WorkflowVersionSummary, approve?: boolean) => Promise<void> | void;
};

type WorkflowTotalRuntimeAction = "extend_total_runtime" | "remove_total_runtime_cap";

export type WorkflowArtifactPanelRendererState = {
  workflowBusy?: string;
  workflowRunIdleTimeoutMs: number;
  workflowRunTotalLimitMode: WorkflowRunTotalLimitMode;
  permissionGrants: AmbientPermissionGrant[];
  permissionAudit: PermissionAuditEntry[];
  activeThreadId?: string;
  workspacePath: string;
  workflowConnectorAccounts?: Record<string, AmbientPluginAuthAccountSummary[]>;
  automationPluginRegistry?: AmbientPluginRegistry;
  permissionGrantRevoking?: string;
  workflowSourceDrafts: Record<string, string>;
  selectedWorkflowAgentArtifactId?: string;
  selectedWorkflowAgentSourceNode?: WorkflowGraphNode;
  selectedWorkflowAgentThreadNodes?: WorkflowGraphNode[];
  workflowVersions: WorkflowVersionSummary[];
  workflowRevisions: WorkflowRevisionSummary[];
  runConsoleRef?: Ref<HTMLElement>;
};

export type WorkflowArtifactPanelRendererActions = {
  onWorkflowRunIdleTimeoutChange: (idleTimeoutMs: number) => void;
  onWorkflowRunTotalLimitModeChange: (mode: WorkflowRunTotalLimitMode) => void;
  onWorkflowConnectorAccountChange: (artifactId: string, connector: WorkflowConnectorManifestGrant, nextAccountId: string) => Promise<void> | void;
  onWorkflowConnectorRetentionChange: (artifactId: string, connector: WorkflowConnectorManifestGrant, dataRetention: WorkflowConnectorDataRetention) => Promise<void> | void;
  onRemoveWorkflowConnectorScope: (artifactId: string, connector: WorkflowConnectorManifestGrant, scope: string) => Promise<void> | void;
  onRejectWorkflowConnectorGrant: (artifactId: string, connector: WorkflowConnectorManifestGrant) => Promise<void> | void;
  onRevokePermissionGrantIds: (ids: string[], busyId: string) => Promise<void>;
  onRevokePermissionGrant: (id: string) => Promise<void>;
  onOpenRunDetail: (runId: string, options?: { focusConsole?: boolean }) => void | Promise<void>;
  onCancelRun: (runId: string) => void | Promise<void>;
  onRunArtifact: (
    artifactId: string,
    mode: "execute",
    options?: { resumeFromRunId?: string; allowUnapproved?: boolean; runLimits?: WorkflowRunLimitOverrides },
  ) => void | Promise<unknown>;
  runLimitsForArtifact: (artifact: WorkflowArtifactSummary) => WorkflowRunLimitOverrides;
  onCloseRunConsole: () => void;
  onResumeTotalRuntimePause: (detail: WorkflowRunDetail, action: WorkflowTotalRuntimeAction) => void | Promise<unknown>;
  onSelectSourceNode: (nodeId: string) => void;
  onSourceDraftChange: (artifactId: string, source: string) => void;
  onSourceDraftClear: (artifactId: string) => void;
  onSourceSave: (artifactId: string, source: string) => void | Promise<void>;
  onResolveApproval: (runId: string, approvalId: string, decision: "approved" | "rejected") => void | Promise<void>;
  onAnswerRuntimeInput: (
    detail: WorkflowRunDetail,
    card: WorkflowRuntimeInputCard,
    response: Omit<WorkflowUserInputResponse, "requestId">,
  ) => void | Promise<unknown>;
  onRevealBrowser: (request: { userActionId?: string; targetId?: string }) => void | Promise<unknown>;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
  onStartRevision: (artifact: WorkflowArtifactSummary) => void;
  onResolveRevision: (revisionId: string, decision: "applied" | "rejected") => void | Promise<unknown>;
  onRestoreVersionForReview: (version: WorkflowVersionSummary, approve?: boolean) => Promise<void> | void;
};

export type WorkflowArtifactPanelRenderers = {
  renderRuntimeInputPanel: (detail: WorkflowRunDetail | undefined) => ReactNode;
  renderRunConsole: (detail: WorkflowRunDetail | undefined, compact?: boolean) => ReactNode;
  renderRunConsolePanel: (
    artifact: WorkflowArtifactSummary | undefined,
    latestRun: WorkflowRunSummary | undefined,
    detail: WorkflowRunDetail | undefined,
  ) => ReactNode;
  renderManifestPanel: (artifact: WorkflowArtifactSummary, latestRun: WorkflowRunSummary | undefined) => ReactNode;
  renderPermissionsPanel: (thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) => ReactNode;
  renderOutputsPanel: (
    artifact: WorkflowArtifactSummary | undefined,
    latestRun: WorkflowRunSummary | undefined,
    detail: WorkflowRunDetail | undefined,
  ) => ReactNode;
  renderVersionHistoryPanel: (thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) => ReactNode;
};

export function workflowArtifactPanelRenderers({
  state,
  actions,
}: {
  state: WorkflowArtifactPanelRendererState;
  actions: WorkflowArtifactPanelRendererActions;
}): WorkflowArtifactPanelRenderers {
  const renderRuntimeInputPanel = (detail: WorkflowRunDetail | undefined) => {
    if (!detail) return null;
    return (
      <WorkflowRuntimeInputPanel
        detail={detail}
        workflowBusy={state.workflowBusy}
        onAnswerInput={actions.onAnswerRuntimeInput}
        onRevealBrowser={actions.onRevealBrowser}
        onPreviewPath={actions.onPreviewPath}
        onOpenMediaModal={actions.onOpenMediaModal}
      />
    );
  };

  const renderRunConsole = (detail: WorkflowRunDetail | undefined, compact = false) => {
    if (!detail) return null;
    return (
      <WorkflowRunConsole
        detail={detail}
        compact={compact}
        workflowBusy={state.workflowBusy}
        runConsoleRef={state.runConsoleRef}
        connectorAccounts={state.workflowConnectorAccounts}
        pluginRegistry={state.automationPluginRegistry}
        sourceDraft={state.workflowSourceDrafts[detail.artifact.id]}
        selectedSourceNode={detail.artifact.id === state.selectedWorkflowAgentArtifactId ? state.selectedWorkflowAgentSourceNode : undefined}
        sourceNodes={state.selectedWorkflowAgentThreadNodes}
        sourceVersion={state.workflowVersions.find((version) => version.artifactId === detail.artifact.id)}
        onCancelRun={actions.onCancelRun}
        onResumeRun={(runDetail) =>
          actions.onRunArtifact(runDetail.artifact.id, "execute", {
            resumeFromRunId: runDetail.run.id,
            allowUnapproved: runDetail.artifact.status !== "approved",
            runLimits: actions.runLimitsForArtifact(runDetail.artifact),
          })
        }
        onClose={actions.onCloseRunConsole}
        onResumeTotalRuntimePause={actions.onResumeTotalRuntimePause}
        onSelectSourceNode={actions.onSelectSourceNode}
        onSourceDraftChange={(source) => actions.onSourceDraftChange(detail.artifact.id, source)}
        onSourceDraftClear={() => actions.onSourceDraftClear(detail.artifact.id)}
        onSourceSave={(source) => actions.onSourceSave(detail.artifact.id, source)}
        onResolveApproval={actions.onResolveApproval}
      />
    );
  };

  return {
    renderRuntimeInputPanel,
    renderRunConsole,
    renderRunConsolePanel(artifact, latestRun, detail) {
      if (detail) return renderRunConsole(detail, true);
      return (
        <section className="workflow-artifact-empty-panel">
          <strong>Run Console</strong>
          <p>{latestRun ? "Open the latest run to inspect events, model calls, checkpoints, approvals, and audit output." : "No workflow runs are recorded for this artifact yet."}</p>
          {artifact && latestRun && (
            <button
              type="button"
              className="panel-button mini"
              disabled={state.workflowBusy === latestRun.id}
              onClick={() => void actions.onOpenRunDetail(latestRun.id, { focusConsole: true })}
            >
              {state.workflowBusy === latestRun.id ? "Opening" : "Open latest run"}
            </button>
          )}
        </section>
      );
    },
    renderManifestPanel(artifact, latestRun) {
      return (
        <WorkflowManifestPanel
          artifact={artifact}
          latestRun={latestRun}
          workflowBusy={state.workflowBusy}
          workflowRunIdleTimeoutMs={state.workflowRunIdleTimeoutMs}
          workflowRunTotalLimitMode={state.workflowRunTotalLimitMode}
          onWorkflowRunIdleTimeoutChange={actions.onWorkflowRunIdleTimeoutChange}
          onWorkflowRunTotalLimitModeChange={actions.onWorkflowRunTotalLimitModeChange}
        />
      );
    },
    renderPermissionsPanel(thread, artifact) {
      return (
        <WorkflowPermissionsPanel
          thread={thread}
          artifact={artifact}
          permissionGrants={state.permissionGrants}
          permissionAudit={state.permissionAudit}
          activeThreadId={state.activeThreadId}
          workspacePath={state.workspacePath}
          workflowConnectorAccounts={state.workflowConnectorAccounts}
          automationPluginRegistry={state.automationPluginRegistry}
          workflowBusy={state.workflowBusy}
          permissionGrantRevoking={state.permissionGrantRevoking}
          onWorkflowConnectorAccountChange={actions.onWorkflowConnectorAccountChange}
          onWorkflowConnectorRetentionChange={actions.onWorkflowConnectorRetentionChange}
          onRemoveWorkflowConnectorScope={actions.onRemoveWorkflowConnectorScope}
          onRejectWorkflowConnectorGrant={actions.onRejectWorkflowConnectorGrant}
          onRevokePermissionGrantIds={actions.onRevokePermissionGrantIds}
          onRevokePermissionGrant={actions.onRevokePermissionGrant}
        />
      );
    },
    renderOutputsPanel(artifact, latestRun, detail) {
      return (
        <WorkflowOutputsPanel
          artifact={artifact}
          latestRun={latestRun}
          detail={detail}
          workflowBusy={state.workflowBusy}
          onOpenRunDetail={(runId) => void actions.onOpenRunDetail(runId, { focusConsole: true })}
          onPreviewPath={actions.onPreviewPath}
          onPreviewLocalPath={actions.onPreviewLocalPath}
          onOpenMediaModal={actions.onOpenMediaModal}
        />
      );
    },
    renderVersionHistoryPanel(thread, artifact) {
      return (
        <WorkflowVersionHistoryPanel
          thread={thread}
          artifact={artifact}
          versions={state.workflowVersions}
          revisions={state.workflowRevisions}
          workflowBusy={state.workflowBusy}
          onStartRevision={actions.onStartRevision}
          onResolveRevision={actions.onResolveRevision}
          onRestoreVersionForReview={actions.onRestoreVersionForReview}
        />
      );
    },
  };
}

export function WorkflowManifestPanel({
  artifact,
  latestRun,
  workflowBusy,
  workflowRunIdleTimeoutMs,
  workflowRunTotalLimitMode,
  onWorkflowRunIdleTimeoutChange,
  onWorkflowRunTotalLimitModeChange,
}: WorkflowManifestPanelProps) {
  const manifest = artifact.manifest;
  const runLimitSummary = workflowRunLimitSummary(
    {
      idleTimeoutMs: workflowRunIdleTimeoutMs,
      totalLimitMode: workflowRunTotalLimitMode,
    },
    manifest,
  );
  const facts = [
    { label: "Mutation policy", value: formatTaskState(manifest.mutationPolicy), detail: manifest.mutationPolicy === "read_only" ? "Runs can inspect and produce outputs without external writes." : "Mutations must follow this workflow's review policy." },
    { label: "Tools", value: `${manifest.tools.length}`, detail: manifest.tools.length ? manifest.tools.join(", ") : "No desktop tools declared." },
    { label: "Model budget", value: manifest.maxModelCalls === undefined ? "No cap" : String(manifest.maxModelCalls), detail: "Maximum Ambient model calls declared by the generated manifest." },
    { label: "Connector budget", value: manifest.maxConnectorCalls === undefined ? "No cap" : String(manifest.maxConnectorCalls), detail: "Maximum workflow connector calls declared by the generated manifest." },
    { label: "Total cap", value: manifest.maxRunMs === undefined ? "None" : formatDurationMs(manifest.maxRunMs), detail: "Optional manifest total runtime cap. Foreground and scheduled runs default to stream-idle liveness without a total cap." },
    { label: "Latest run", value: latestRun ? formatTaskState(latestRun.status) : "None", detail: latestRun ? formatTimelineTime(latestRun.updatedAt) : "Run or dry-run the workflow to produce runtime evidence." },
  ];
  return (
    <div className="workflow-manifest-panel">
      <div className="workflow-manifest-facts" data-workflow-review-section="mutation_policy">
        {facts.map((fact) => (
          <div className="workflow-manifest-fact" key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
            <small>{fact.detail}</small>
          </div>
        ))}
      </div>
      <section className="workflow-manifest-section">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip="Run limits use progress-based liveness by default. Total runtime caps are optional and can be enabled from the manifest cap when useful.">
            Run limits
          </AutomationHeadingLabel>
          <span className="panel-note inline">{runLimitSummary}</span>
        </div>
        <div className="workflow-run-settings-inline">
          <label>
            <span>Idle timeout</span>
            <select
              className="automation-select mini"
              value={workflowRunIdleTimeoutMs}
              onChange={(event) => onWorkflowRunIdleTimeoutChange(Number(event.target.value))}
              disabled={Boolean(workflowBusy)}
            >
              {workflowRunIdleTimeoutOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="workflow-total-limit-toggle" title={manifest.maxRunMs === undefined ? "This workflow manifest has no total runtime cap." : "Use the manifest total runtime cap for this run."}>
            <input
              type="checkbox"
              checked={workflowRunTotalLimitMode === "manifest" && manifest.maxRunMs !== undefined}
              disabled={Boolean(workflowBusy) || manifest.maxRunMs === undefined}
              onChange={(event) => onWorkflowRunTotalLimitModeChange(event.target.checked ? "manifest" : "disabled")}
            />
            <span>{manifest.maxRunMs === undefined ? "No total cap" : "Use manifest cap"}</span>
          </label>
          <small>{runLimitSummary}</small>
        </div>
      </section>
      <section className="workflow-manifest-section">
        <AutomationHeadingLabel tooltip="Declared capabilities are reviewed and granted from the Permissions tab.">
          Declared capabilities
        </AutomationHeadingLabel>
        <div className="plugin-badges">
          <span>{manifest.connectors?.length ?? 0} connectors</span>
          <span>{manifest.pluginCapabilities?.length ?? 0} plugin requirements</span>
          <span>{manifest.ambientCliCapabilities?.length ?? 0} Ambient CLI commands</span>
        </div>
        <WorkflowAmbientCliCapabilityList capabilities={manifest.ambientCliCapabilities} compact />
        <p className="panel-note">Open Permissions for account selection, retention controls, persistent grants, and Full Access receipts.</p>
      </section>
      <section className="workflow-manifest-section">
        <AutomationHeadingLabel tooltip="Generated workflow manifest JSON used for validation, review, run limits, and permission policy.">
          Manifest JSON
        </AutomationHeadingLabel>
        <pre>{JSON.stringify(manifest, null, 2)}</pre>
        <code className="workflow-path">{artifact.sourcePath}</code>
      </section>
    </div>
  );
}

export function WorkflowPermissionsPanel({
  thread,
  artifact,
  permissionGrants,
  permissionAudit,
  activeThreadId,
  workspacePath,
  workflowConnectorAccounts,
  automationPluginRegistry,
  workflowBusy,
  permissionGrantRevoking,
  onWorkflowConnectorAccountChange,
  onWorkflowConnectorRetentionChange,
  onRemoveWorkflowConnectorScope,
  onRejectWorkflowConnectorGrant,
  onRevokePermissionGrantIds,
  onRevokePermissionGrant,
}: WorkflowPermissionsPanelProps) {
  const manifest = artifact.manifest;
  const workflowGrantRegistry = workflowPermissionGrantRegistryModel({
    grants: permissionGrants,
    auditEntries: permissionAudit,
    workflowThreadId: thread.id,
    projectPath: thread.projectPath,
    workspacePath,
    auditThreadId: activeThreadId,
  });
  return (
    <div className="workflow-permissions-panel">
      <section className="workflow-manifest-section" data-workflow-review-section="connectors">
        <AutomationHeadingLabel tooltip="Connector Grants show which external data sources, scopes, operations, and retention policy the workflow is allowed to use.">Connector and plugin requirements</AutomationHeadingLabel>
        <WorkflowConnectorGrantList
          connectors={manifest.connectors}
          connectorAccounts={workflowConnectorAccounts}
          disabled={Boolean(workflowBusy) || artifact.status === "rejected"}
          onAccountChange={(connector, nextAccountId) => void onWorkflowConnectorAccountChange(artifact.id, connector, nextAccountId)}
          onRetentionChange={(connector, dataRetention) => void onWorkflowConnectorRetentionChange(artifact.id, connector, dataRetention)}
          onRemoveScope={(connector, scope) => void onRemoveWorkflowConnectorScope(artifact.id, connector, scope)}
          onReject={(connector) => void onRejectWorkflowConnectorGrant(artifact.id, connector)}
        />
        <WorkflowPluginCapabilityList capabilities={manifest.pluginCapabilities} registry={automationPluginRegistry} />
        <WorkflowAmbientCliCapabilityList capabilities={manifest.ambientCliCapabilities} />
        {!manifest.connectors?.length && !manifest.pluginCapabilities?.length && !manifest.ambientCliCapabilities?.length && <p className="panel-note">This manifest does not request connector, plugin, or Ambient CLI capability grants.</p>}
      </section>
      <section className="workflow-manifest-section workflow-review-grant-registry">
        <AutomationHeadingLabel tooltip="Persistent grants already available to this workflow through workflow, project, workspace, or trusted-plugin scope.">
          Persistent grants and receipts
        </AutomationHeadingLabel>
        <p className="panel-note">{workflowGrantRegistry.summary}</p>
        {workflowGrantRegistry.groups.length === 0 && workflowGrantRegistry.fullAccessReceipts.length === 0 ? (
          <p className="panel-note">No reusable grants or Full Access receipts are currently relevant to this workflow.</p>
        ) : (
          <div className="permission-grant-registry compact">
            {workflowGrantRegistry.groups.map((group) => {
              const busyId = `workflow-grant-scope:${thread.id}:${group.id}`;
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
                  {group.rows.slice(0, 6).map((row) => (
                    <div className={`permission-log-row ${row.tone === "blocked" ? "denied" : "allowed"} permission-grant-registry-row`} key={row.id}>
                      <div>
                        <strong>{row.actionLabel}</strong>
                        <span>{row.riskLabel}</span>
                      </div>
                      <small title={row.conditionLabel ? `${row.targetLabel}\n${row.conditionLabel}` : row.targetLabel}>
                        {row.targetLabel}
                        {row.conditionLabel ? ` · ${row.conditionLabel}` : ""}
                      </small>
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
            <PermissionFullAccessReceiptList receipts={workflowGrantRegistry.fullAccessReceipts} limit={6} />
          </div>
        )}
      </section>
    </div>
  );
}

export function WorkflowVersionHistoryPanel({
  thread,
  artifact,
  versions,
  revisions,
  workflowBusy,
  onStartRevision,
  onResolveRevision,
  onRestoreVersionForReview,
}: WorkflowVersionHistoryPanelProps) {
  const threadVersions = versions.filter((version) => version.workflowThreadId === thread.id);
  const history = workflowVersionHistoryModel({ thread, artifact, versions: threadVersions });
  const versionById = new Map(threadVersions.map((version) => [version.id, version]));
  return (
    <div className="workflow-version-history-stack">
      <WorkflowRevisionPanel
        thread={thread}
        artifact={artifact}
        revisions={revisions}
        workflowBusy={workflowBusy}
        onStartRevision={onStartRevision}
        onResolveRevision={onResolveRevision}
      />
      {threadVersions.length > 0 && (
        <section className="workflow-review-section workflow-version-panel" aria-label="Workflow version history">
          <div className="panel-section-heading">
            <AutomationHeadingLabel tooltip="Restore an earlier committed workflow version as a new review version, or restore and approve it as the latest version. The original version remains in history.">
              Version history
            </AutomationHeadingLabel>
            <span className="panel-note inline">
              {history.countLabel}
              {history.latestApprovedVersionLabel ? ` · latest approved ${history.latestApprovedVersionLabel}` : ""}
            </span>
          </div>
          <div className="workflow-version-list">
            {history.items.map((item) => {
              const version = versionById.get(item.id);
              if (!version) return null;
              const reviewBusy = workflowBusy === `restore-version:${item.id}:review`;
              const approveBusy = workflowBusy === `restore-version:${item.id}:approved`;
              return (
                <article className={`workflow-version-card ${item.isActive ? "active" : ""} ${item.isLatestApproved ? "latest-approved" : ""}`} key={item.id}>
                  <div>
                    <div className="task-row-header">
                      <strong>{item.versionLabel}</strong>
                      <span>{item.statusLabel}</span>
                    </div>
                    <p>
                      {item.createdByLabel} · {formatTimelineTime(item.createdAt)} · {item.commitLabel} · {item.nextRestoredVersionLabel}
                    </p>
                    {item.badges.length > 0 && (
                      <div className="plugin-badges compact">
                        {item.badges.map((badge) => (
                          <span key={`${item.id}-${badge}`}>{badge}</span>
                        ))}
                      </div>
                    )}
                    <div className="workflow-version-compare">
                      <strong>{item.comparisonTitle}</strong>
                      {item.comparisonDetails.map((detail) => (
                        <span key={`${item.id}-${detail}`}>{detail}</span>
                      ))}
                    </div>
                  </div>
                  <div className="workflow-version-actions">
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={Boolean(workflowBusy) || !item.canRestoreForReview}
                      title={item.canRestoreForReview ? "Restore this committed version as a new review candidate." : item.restoreBlockReason}
                      onClick={() => void onRestoreVersionForReview(version)}
                    >
                      {reviewBusy ? "Restoring" : "Restore for review"}
                    </button>
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={Boolean(workflowBusy) || !item.canRestoreAndApprove}
                      title={item.canRestoreAndApprove ? "Restore this committed version and mark the restored copy approved." : item.restoreBlockReason}
                      onClick={() => void onRestoreVersionForReview(version, true)}
                    >
                      {approveBusy ? "Approving" : "Restore + approve"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
