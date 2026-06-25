import type { CSSProperties, ReactNode } from "react";

import type { AutomationFolderSummary, AutomationScheduleExceptionSummary, AutomationScheduleSummary } from "../../shared/automationTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry, PermissionMode } from "../../shared/permissionTypes";
import type {
  OrchestrationTask,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowCompileProgress,
  WorkflowRecordingLibraryEntry,
  WorkflowRunDetail,
  WorkflowRunLimitOverrides,
  WorkflowRunSummary,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { formatTaskState, formatTimelineTime } from "./RightPanel";
import { InfoTooltip } from "./RightPanelStatusWidgets";
import { AutomationExplainer } from "./AutomationsWorkflowUtilityViews";
import { WorkflowSchedulesWorkspace } from "./AutomationsScheduleWorkspaceViews";
import type { WorkflowScheduleOccurrenceEditorState, WorkflowSchedulesWorkspaceProps } from "./AutomationsScheduleWorkspaceViews";
import { scheduleNextRunLabel, schedulePresetLabel, type AutomationSchedulePreset } from "./automationUiModel";
import { workflowPermissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import { workflowPersistentStatusModel } from "./workflowPersistentStatusUiModel";
import {
  workflowScheduleCreationModel,
  workflowScheduleGrantReadinessModel,
  workflowScheduleRunHistoryItems,
  workflowThreadScheduleState,
  type WorkflowScheduleEditScopeId,
  type WorkflowSchedulePanelId,
} from "./workflowReviewUiModel";
import type { WorkflowRunTotalLimitMode } from "./workflowRunLimitsUiModel";

export {
  WorkflowScheduleHistoryPanel,
  WorkflowScheduleOccurrenceEditor,
  WorkflowSchedulesWorkspace,
  datetimeLocalValueFromIso,
  defaultScheduleReplacementLocal,
  isoFromDatetimeLocalValue,
} from "./AutomationsScheduleWorkspaceViews";
export type { WorkflowScheduleOccurrenceEditorState, WorkflowSchedulesWorkspaceProps } from "./AutomationsScheduleWorkspaceViews";

export type AutomationScheduleTargetOption = {
  id: string;
  label: string;
};

export type AutomationScheduleTargetSources = {
  workflowRecordingLibrary: Pick<WorkflowRecordingLibraryEntry, "id" | "title" | "version" | "enabled">[];
  workflowArtifacts: Pick<WorkflowArtifactSummary, "id" | "title">[];
  workflowAgentFolders: Array<{
    threads: Array<{
      id: string;
      title: string;
      latestVersion?: Pick<WorkflowVersionSummary, "id" | "version" | "status">;
    }>;
  }>;
  folders: Pick<AutomationFolderSummary, "id" | "name">[];
  tasks: Pick<OrchestrationTask, "id" | "identifier" | "title">[];
};

export type WorkflowSchedulesPaneRouteModel = {
  focusedSchedule?: AutomationScheduleSummary;
  focusedWorkflowVersion?: WorkflowVersionSummary;
  focusedWorkflowArtifact?: WorkflowArtifactSummary;
  focusedWorkflowThread?: WorkflowAgentThreadSummary;
  workflowScheduleThread?: WorkflowAgentThreadSummary;
  workflowScheduleArtifact?: WorkflowArtifactSummary;
};

export type WorkflowSchedulesPaneRouteModelInput = {
  selectedWorkflowThread?: WorkflowAgentThreadSummary;
  selectedWorkflowArtifact?: WorkflowArtifactSummary;
  focusedScheduleId?: string;
  schedules: AutomationScheduleSummary[];
  workflowVersions: WorkflowVersionSummary[];
  artifactById: ReadonlyMap<string, WorkflowArtifactSummary>;
  workflowThreadById: ReadonlyMap<string, WorkflowAgentThreadSummary>;
  workflowThreadByArtifactId?: ReadonlyMap<string, WorkflowAgentThreadSummary>;
};

export function workflowSchedulesPaneRouteModel({
  selectedWorkflowThread,
  selectedWorkflowArtifact,
  focusedScheduleId,
  schedules,
  workflowVersions,
  artifactById,
  workflowThreadById,
  workflowThreadByArtifactId,
}: WorkflowSchedulesPaneRouteModelInput): WorkflowSchedulesPaneRouteModel {
  const workflowThreadForArtifact = (artifact?: WorkflowArtifactSummary): WorkflowAgentThreadSummary | undefined => {
    if (artifact?.workflowThreadId) return workflowThreadById.get(artifact.workflowThreadId);
    return artifact ? workflowThreadByArtifactId?.get(artifact.id) : undefined;
  };
  const focusedSchedule = focusedScheduleId ? schedules.find((schedule) => schedule.id === focusedScheduleId) : undefined;
  const focusedWorkflowVersion =
    focusedSchedule?.targetKind === "workflow_version"
      ? workflowVersions.find((version) => version.id === focusedSchedule.targetId)
      : undefined;
  const focusedWorkflowArtifact =
    focusedSchedule?.targetKind === "workflow_artifact"
      ? artifactById.get(focusedSchedule.targetId)
      : focusedWorkflowVersion
        ? artifactById.get(focusedWorkflowVersion.artifactId)
        : undefined;
  const focusedWorkflowThread =
    focusedSchedule?.targetKind === "workflow_thread"
      ? workflowThreadById.get(focusedSchedule.targetId)
      : workflowThreadForArtifact(focusedWorkflowArtifact);
  const workflowScheduleThread = selectedWorkflowThread ?? focusedWorkflowThread;
  const workflowScheduleArtifact =
    selectedWorkflowArtifact ??
    focusedWorkflowArtifact ??
    (workflowScheduleThread?.activeArtifactId ? artifactById.get(workflowScheduleThread.activeArtifactId) : undefined);

  return {
    focusedSchedule,
    focusedWorkflowVersion,
    focusedWorkflowArtifact,
    focusedWorkflowThread,
    workflowScheduleThread,
    workflowScheduleArtifact,
  };
}

export function scheduleTargetOptionsForType(
  targetType: AutomationScheduleSummary["targetKind"],
  sources: AutomationScheduleTargetSources,
): AutomationScheduleTargetOption[] {
  if (targetType === "workflow_playbook") {
    return sources.workflowRecordingLibrary
      .filter((playbook) => playbook.enabled)
      .map((playbook) => ({ id: playbook.id, label: `${playbook.title} - current v${playbook.version}` }));
  }
  if (targetType === "workflow_artifact") return sources.workflowArtifacts.map((artifact) => ({ id: artifact.id, label: artifact.title }));
  if (targetType === "workflow_thread") {
    return sources.workflowAgentFolders.flatMap((folder) =>
      folder.threads
        .filter((thread) => thread.latestVersion?.status === "approved")
        .map((thread) => ({
          id: thread.id,
          label: `${thread.title} - latest approved v${thread.latestVersion!.version}`,
        })),
    );
  }
  if (targetType === "workflow_version") {
    return sources.workflowAgentFolders.flatMap((folder) =>
      folder.threads
        .filter((thread) => thread.latestVersion?.status === "approved")
        .map((thread) => ({
          id: thread.latestVersion!.id,
          label: `${thread.title} - pinned v${thread.latestVersion!.version} (${formatTaskState(thread.latestVersion!.status)})`,
        })),
    );
  }
  if (targetType === "folder") return sources.folders.map((folder) => ({ id: folder.id, label: folder.name }));
  return sources.tasks.map((task) => ({ id: task.id, label: `${task.identifier}: ${task.title}` }));
}

export type AutomationSchedulesPaneProps = {
  projectField: ReactNode;
  autoDispatchToggle: ReactNode;
  autoDispatchStatus: ReactNode;
  scheduleTooltip: string;
  autoDispatchTooltip: string;
  schedules: AutomationScheduleSummary[];
  focusedSchedule?: AutomationScheduleSummary;
  focusedScheduleId?: string;
  scheduleTargetType: AutomationScheduleSummary["targetKind"];
  targetOptions: AutomationScheduleTargetOption[];
  selectedTarget?: AutomationScheduleTargetOption;
  schedulePreset: AutomationSchedulePreset;
  scheduleExpression: string;
  scheduleEnabled: boolean;
  scheduleBusy?: boolean;
  scheduleError?: string;
  expandedScheduleHistoryId?: string;
  workflowRuns: WorkflowRunSummary[];
  onScheduleTargetTypeChange: (targetType: AutomationScheduleSummary["targetKind"]) => void;
  onScheduleTargetIdChange: (targetId: string) => void;
  onSchedulePresetChange: (preset: AutomationSchedulePreset) => void;
  onScheduleExpressionChange: (expression: string) => void;
  onScheduleEnabledChange: (enabled: boolean) => void;
  onSaveSchedule: () => void;
  onRefreshSchedules: () => void;
  onClearFocusedSchedule: () => void;
  onToggleScheduleHistoryExpanded: (scheduleId: string | undefined) => void;
  onOpenRunThread: (threadId: string) => void;
  onOpenRunDetail: (runId: string) => void;
};

export type AutomationSchedulesFallbackPaneProps = Omit<
  AutomationSchedulesPaneProps,
  "focusedSchedule" | "targetOptions" | "selectedTarget"
> & {
  scheduleTargetId: string;
  targetSources: AutomationScheduleTargetSources;
};

export function AutomationSchedulesFallbackPane({
  targetSources,
  schedules,
  focusedScheduleId,
  scheduleTargetType,
  scheduleTargetId,
  ...paneProps
}: AutomationSchedulesFallbackPaneProps) {
  const focusedSchedule = focusedScheduleId ? schedules.find((schedule) => schedule.id === focusedScheduleId) : undefined;
  const targetOptions = scheduleTargetOptionsForType(scheduleTargetType, targetSources);
  const selectedTarget = targetOptions.find((target) => target.id === scheduleTargetId) ?? targetOptions[0];
  return (
    <AutomationSchedulesPane
      {...paneProps}
      schedules={schedules}
      focusedSchedule={focusedSchedule}
      focusedScheduleId={focusedScheduleId}
      scheduleTargetType={scheduleTargetType}
      targetOptions={targetOptions}
      selectedTarget={selectedTarget}
    />
  );
}

export function AutomationSchedulesPane({
  projectField,
  autoDispatchToggle,
  autoDispatchStatus,
  scheduleTooltip,
  autoDispatchTooltip,
  schedules,
  focusedSchedule,
  focusedScheduleId,
  scheduleTargetType,
  targetOptions,
  selectedTarget,
  schedulePreset,
  scheduleExpression,
  scheduleEnabled,
  scheduleBusy,
  scheduleError,
  expandedScheduleHistoryId,
  workflowRuns,
  onScheduleTargetTypeChange,
  onScheduleTargetIdChange,
  onSchedulePresetChange,
  onScheduleExpressionChange,
  onScheduleEnabledChange,
  onSaveSchedule,
  onRefreshSchedules,
  onClearFocusedSchedule,
  onToggleScheduleHistoryExpanded,
  onOpenRunThread,
  onOpenRunDetail,
}: AutomationSchedulesPaneProps) {
  const selectedScheduleTarget = selectedTarget ?? targetOptions[0];
  const visibleSchedules = focusedSchedule ? [focusedSchedule] : schedules;
  return (
    <div className="automation-pane-shell">
      <AutomationExplainer
        paragraphs={[
          "Schedules control when automation work is eligible to run. A schedule can target a Local Task, Workflow Playbook, legacy Workflow Agent target, or folder while still respecting project permissions, review gates, concurrency, and pause state.",
          "Workflow Playbook schedules run the current enabled recorded workflow by default in one dedicated chat thread per schedule series.",
        ]}
      />
      <section className="automation-section">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip={scheduleTooltip}>Schedules</AutomationHeadingLabel>
          <div className="task-heading-actions">
            {autoDispatchToggle}
            <InfoTooltip text={autoDispatchTooltip} className="heading-info-tooltip" />
          </div>
        </div>
        {autoDispatchStatus}
        <div className="automation-controls-grid">
          {projectField}
          <label className="automation-field">
            <span>
              <strong>Target type</strong>
            </span>
            <select
              className="automation-select"
              value={scheduleTargetType}
              onChange={(event) => onScheduleTargetTypeChange(event.target.value as AutomationScheduleSummary["targetKind"])}
            >
              <option value="local_task">Local Task</option>
              <option value="workflow_playbook">Workflow Playbook (current)</option>
              <option value="workflow_thread">Workflow Agent (latest approved)</option>
              <option value="workflow_version">Workflow Agent version (pinned)</option>
              <option value="workflow_artifact">Workflow Agent artifact</option>
              <option value="folder">Folder</option>
            </select>
          </label>
          <label className="automation-field wide">
            <span>
              <strong>Target</strong>
            </span>
            <select
              className="automation-select"
              value={selectedScheduleTarget?.id ?? ""}
              onChange={(event) => onScheduleTargetIdChange(event.target.value)}
            >
              {targetOptions.length > 0 ? (
                targetOptions.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))
              ) : (
                <option value="">No targets yet</option>
              )}
            </select>
          </label>
          <label className="automation-field">
            <span>
              <strong>Preset</strong>
            </span>
            <select
              className="automation-select"
              value={schedulePreset}
              onChange={(event) => onSchedulePresetChange(event.target.value as AutomationSchedulePreset)}
            >
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
              <input
                className="panel-input"
                value={scheduleExpression}
                onChange={(event) => onScheduleExpressionChange(event.target.value)}
                placeholder="0 9 * * *"
              />
            </label>
          )}
          <label className="automation-field">
            <span>
              <strong>Enabled</strong>
            </span>
            <select
              className="automation-select"
              value={scheduleEnabled ? "enabled" : "paused"}
              onChange={(event) => onScheduleEnabledChange(event.target.value === "enabled")}
            >
              <option value="enabled">Enabled</option>
              <option value="paused">Paused</option>
            </select>
          </label>
        </div>
        <div className="automation-schedule-card">
          <strong>{schedulePresetLabel(schedulePreset, scheduleExpression)}</strong>
          <span>{scheduleNextRunLabel(schedulePreset, scheduleExpression, scheduleEnabled)}</span>
          <code>{selectedScheduleTarget?.label ?? "No target selected"}</code>
        </div>
        <div className="task-heading-actions">
          <button type="button" className="panel-button" disabled={scheduleBusy || !selectedScheduleTarget} onClick={onSaveSchedule}>
            {scheduleBusy ? "Saving" : "Save schedule"}
          </button>
          <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={onRefreshSchedules}>
            Refresh schedules
          </button>
        </div>
        {scheduleError && <p className="panel-status error">{scheduleError}</p>}
        <section className="automation-section">
          <div className="panel-section-heading">
            <AutomationHeadingLabel tooltip="Persisted schedule records with target, cadence, pause state, and the next calculated run time.">
              Saved Schedules
            </AutomationHeadingLabel>
            {focusedScheduleId && (
              <div className="task-heading-actions">
                <span className="panel-note inline">{focusedSchedule ? "Focused from scheduled run" : "Focused schedule not found"}</span>
                <button type="button" className="panel-button mini" onClick={onClearFocusedSchedule}>
                  Clear focus
                </button>
              </div>
            )}
          </div>
          {schedules.length === 0 ? (
            <p className="panel-note">No saved schedules yet.</p>
          ) : (
            <div className="workflow-board">
              {visibleSchedules.map((schedule) => {
                const scheduleRunHistory = workflowScheduleRunHistoryItems(schedule.id, workflowRuns, 8);
                const historyExpanded = expandedScheduleHistoryId === schedule.id;
                const visibleScheduleRunHistory = historyExpanded ? scheduleRunHistory : scheduleRunHistory.slice(0, 2);
                return (
                  <section className={`task-row ${schedule.id === focusedScheduleId ? "focused" : ""}`} key={schedule.id}>
                    <div className="task-row-header">
                      <strong>{schedule.enabled ? "Active" : "Paused"}</strong>
                      <span>{formatTaskState(schedule.targetKind)}</span>
                    </div>
                    <h3>{schedule.targetLabel}</h3>
                    <div className="plugin-badges">
                      <span>{schedulePresetLabel(schedule.preset, schedule.cronExpression ?? "")}</span>
                      <span>{schedule.nextRunAt ? `Next ${formatTimelineTime(schedule.nextRunAt)}` : "No automatic next run"}</span>
                      {schedule.lastRunAt && <span>Last {formatTimelineTime(schedule.lastRunAt)}</span>}
                      <span>{schedule.timezone}</span>
                      <span>{schedule.skipIfActive ? "Skip if active" : "Concurrent starts allowed"}</span>
                      {schedule.targetKind === "workflow_playbook" && (
                        <span>{schedule.targetVersion ? `Pinned v${schedule.targetVersion}` : "Current version"}</span>
                      )}
                    </div>
                    {schedule.dedicatedThreadId && (
                      <div className="task-heading-actions">
                        <button type="button" className="panel-button mini" onClick={() => onOpenRunThread(schedule.dedicatedThreadId!)}>
                          Open schedule thread
                        </button>
                      </div>
                    )}
                    {scheduleRunHistory.length > 0 && (
                      <div className={`workflow-schedule-history-list ${historyExpanded ? "expanded" : ""}`}>
                        <div className="workflow-schedule-history-header">
                          <strong>Recent Workflow Agent runs</strong>
                          {scheduleRunHistory.length > 2 && (
                            <button
                              type="button"
                              className="panel-button mini"
                              onClick={() => onToggleScheduleHistoryExpanded(historyExpanded ? undefined : schedule.id)}
                            >
                              {historyExpanded ? "Collapse" : `View ${scheduleRunHistory.length}`}
                            </button>
                          )}
                        </div>
                        {visibleScheduleRunHistory.map((run) => (
                          <button
                            type="button"
                            className={`workflow-schedule-history-row ${run.tone}`}
                            key={run.id}
                            title={run.actionTitle}
                            onClick={() => onOpenRunDetail(run.id)}
                          >
                            <span>{run.statusLabel}</span>
                            <small>{run.detail}</small>
                            <em>{run.actionLabel}</em>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

export type WorkflowFocusedSchedulesPaneState = {
  activePanel: WorkflowSchedulePanelId;
  versions: WorkflowVersionSummary[];
  workflowRuns: WorkflowRunSummary[];
  selectedDetail?: WorkflowRunDetail;
  schedules: AutomationScheduleSummary[];
  scheduleExceptions: AutomationScheduleExceptionSummary[];
  permissionGrants: AmbientPermissionGrant[];
  permissionAudit: PermissionAuditEntry[];
  permissionMode: PermissionMode;
  auditThreadId?: string;
  workspacePath: string;
  scheduleTargetType: AutomationScheduleSummary["targetKind"];
  scheduleTargetId: string;
  schedulePreset: AutomationSchedulePreset;
  scheduleExpression: string;
  scheduleEnabled: boolean;
  scheduleRunIdleTimeoutMs: number;
  scheduleRunTotalLimitMode: WorkflowRunTotalLimitMode;
  scheduleRunLimits: WorkflowRunLimitOverrides;
  scheduleBusy?: boolean;
  scheduleError?: string;
  focusedScheduleId?: string;
  scheduleEditScope: WorkflowScheduleEditScopeId;
  expandedScheduleHistoryId?: string;
  occurrenceEditor?: WorkflowScheduleOccurrenceEditorState;
  workflowBusy?: string;
  workflowCompileThreadId?: string;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowDiscoveryBusy?: string;
};

export type WorkflowFocusedSchedulesPaneSlots = {
  layoutStyle: CSSProperties;
  splitHandle: ReactNode;
  diagramPane: ReactNode;
};

export type WorkflowFocusedSchedulesPaneActions = Pick<
  WorkflowSchedulesWorkspaceProps,
  | "onSetPanel"
  | "onCreateNewSeries"
  | "onSetScheduleTarget"
  | "onSetSchedulePreset"
  | "onSetScheduleExpression"
  | "onSetScheduleEnabled"
  | "onSetScheduleRunIdleTimeoutMs"
  | "onSetScheduleRunTotalLimitMode"
  | "onSetScheduleEditScope"
  | "onSaveSchedule"
  | "onRefreshSchedules"
  | "onSetExpandedScheduleHistoryId"
  | "onCreateScheduleGrant"
  | "onChangeOccurrenceEditor"
  | "onCloseOccurrenceEditor"
  | "onEditOccurrenceSeriesScope"
  | "onSaveOccurrenceEditor"
  | "onSkipOccurrence"
  | "onOpenOccurrenceEditor"
  | "onDeferOccurrence"
  | "onUpdateOccurrenceRunLimits"
  | "onEditSchedule"
  | "onDuplicateSchedule"
  | "onOpenRunDetail"
  | "onCreateGrantAction"
  | "onOpenPersistentStatusTarget"
>;

export type WorkflowFocusedSchedulesPaneProps = {
  thread: WorkflowAgentThreadSummary;
  artifact: WorkflowArtifactSummary;
  state: WorkflowFocusedSchedulesPaneState;
  slots: WorkflowFocusedSchedulesPaneSlots;
  actions: WorkflowFocusedSchedulesPaneActions;
};

export function WorkflowFocusedSchedulesPane({ thread, artifact, state, slots, actions }: WorkflowFocusedSchedulesPaneProps) {
  const selectedScheduleTargetKind = state.scheduleTargetType === "workflow_version" ? "workflow_version" : "workflow_thread";
  const creation = workflowScheduleCreationModel({
    thread,
    artifact,
    versions: state.versions,
    schedules: state.schedules,
    selectedTargetKind: selectedScheduleTargetKind,
    selectedTargetId: selectedScheduleTargetKind === "workflow_version" ? state.scheduleTargetId : thread.id,
    preset: state.schedulePreset,
    cronExpression: state.scheduleExpression,
    enabled: state.scheduleEnabled,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
    focusedScheduleId: state.focusedScheduleId,
    editScope: state.scheduleEditScope,
    runLimits: state.scheduleRunLimits,
  });
  const scheduleState = workflowThreadScheduleState({
    thread,
    artifact,
    versions: state.versions,
    schedules: state.schedules,
    permissionGrants: state.permissionGrants,
    permissionAudit: state.permissionAudit,
    permissionMode: state.permissionMode,
    auditThreadId: state.auditThreadId,
    workspacePath: state.workspacePath,
    runs: state.workflowRuns,
  });
  const grantReadiness = workflowScheduleGrantReadinessModel({
    artifact,
    permissionGrants: state.permissionGrants,
    permissionAudit: state.permissionAudit,
    permissionMode: state.permissionMode,
    workflowThreadId: thread.id,
    threadId: state.auditThreadId,
    projectPath: thread.projectPath,
    workspacePath: state.workspacePath,
    traceMode: thread.traceMode,
  });
  const workflowGrantRegistry = workflowPermissionGrantRegistryModel({
    grants: state.permissionGrants,
    auditEntries: state.permissionAudit,
    workflowThreadId: thread.id,
    projectPath: thread.projectPath,
    workspacePath: state.workspacePath,
    auditThreadId: state.auditThreadId,
  });
  const schedulableTarget = creation.selectedTarget && !creation.selectedTarget.disabled ? creation.selectedTarget : undefined;
  const schedulableTargetBlockReason =
    schedulableTarget?.targetKind === "workflow_thread"
      ? scheduleState.latestApprovedBlockReason
      : schedulableTarget?.targetKind === "workflow_version"
        ? scheduleState.pinCurrentBlockReason
        : undefined;
  const latestRun = state.workflowRuns.find((run) => run.artifactId === artifact.id);
  const detail = state.selectedDetail && state.selectedDetail.artifact.id === artifact.id ? state.selectedDetail : undefined;
  const persistentStatus = workflowPersistentStatusModel({
    thread,
    artifact,
    latestRun,
    detail,
    scheduleBlockReason: schedulableTargetBlockReason,
    compileActive: state.workflowBusy === "compile" && state.workflowCompileThreadId === thread.id,
    compileProgress: state.workflowCompileThreadId === thread.id ? state.workflowCompileProgress : [],
    discoveryBusy: state.workflowDiscoveryBusy,
  });

  return (
    <div className="automation-focused-grid workflow-discovery-layout" style={slots.layoutStyle}>
      <WorkflowSchedulesWorkspace
        threadId={thread.id}
        artifactManifest={artifact.manifest}
        creation={creation}
        scheduleState={scheduleState}
        grantReadiness={grantReadiness}
        workflowGrantRegistry={workflowGrantRegistry}
        persistentStatus={persistentStatus}
        activePanel={state.activePanel}
        focusedScheduleId={state.focusedScheduleId}
        schedulePreset={state.schedulePreset}
        scheduleExpression={state.scheduleExpression}
        scheduleEnabled={state.scheduleEnabled}
        scheduleRunIdleTimeoutMs={state.scheduleRunIdleTimeoutMs}
        scheduleRunTotalLimitMode={state.scheduleRunTotalLimitMode}
        scheduleBusy={state.scheduleBusy}
        scheduleError={state.scheduleError}
        schedules={state.schedules}
        scheduleExceptions={state.scheduleExceptions}
        expandedScheduleHistoryId={state.expandedScheduleHistoryId}
        workflowBusy={state.workflowBusy}
        occurrenceEditor={state.occurrenceEditor}
        {...actions}
      />
      {slots.splitHandle}
      {slots.diagramPane}
    </div>
  );
}
