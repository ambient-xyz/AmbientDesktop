import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";

import type {
  AmbientPermissionGrant,
  AutomationFolderSummary,
  AutomationScheduleExceptionSummary,
  AutomationScheduleSummary,
  OrchestrationTask,
  PermissionAuditEntry,
  PermissionMode,
  WorkflowAgentThreadSummary,
  WorkflowCompileProgress,
  WorkflowManifest,
  WorkflowArtifactSummary,
  WorkflowRecordingLibraryEntry,
  WorkflowRunDetail,
  WorkflowRunSummary,
  WorkflowRunLimitOverrides,
  WorkflowVersionSummary,
} from "../../shared/types";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { PermissionFullAccessReceiptList, formatTaskState, formatTimelineTime } from "./RightPanel";
import { InfoTooltip } from "./RightPanelStatusWidgets";
import { WorkflowPersistentStatusView } from "./AutomationsWorkflowRuntimeViews";
import { AutomationExplainer } from "./AutomationsWorkflowUtilityViews";
import {
  scheduleNextRunLabel,
  schedulePresetLabel,
  type AutomationSchedulePreset,
} from "./automationUiModel";
import {
  workflowPermissionGrantRegistryModel,
  type PermissionGrantRegistryModel,
} from "./permissionGrantRegistryUiModel";
import {
  workflowPersistentStatusModel,
  type WorkflowPersistentStatusModel,
  type WorkflowPersistentStatusTarget,
} from "./workflowPersistentStatusUiModel";
import {
  type WorkflowScheduleCreationModel,
  workflowScheduleCreationModel,
  workflowScheduleExceptionLedgerItems,
  type WorkflowScheduleGrantReadinessModel,
  workflowScheduleGrantReadinessModel,
  workflowScheduleRunHistoryItems,
  workflowThreadScheduleState,
  type WorkflowScheduleEditScopeId,
  type WorkflowSchedulePanelId,
  type WorkflowThreadScheduleGrantAction,
  type WorkflowThreadScheduleItem,
  type WorkflowThreadScheduleState,
} from "./workflowReviewUiModel";
import {
  workflowExtendTotalRunLimitOverrides,
  workflowRunIdleTimeoutOptions,
  workflowRunLimitSummary,
  workflowRemoveTotalRunLimitOverrides,
  type WorkflowRunTotalLimitMode,
} from "./workflowRunLimitsUiModel";

export type WorkflowScheduleOccurrenceEditorState = {
  scheduleId: string;
  occurrenceAt: string;
  replacementLocal: string;
  reason: string;
};

export function datetimeLocalValueFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function isoFromDatetimeLocalValue(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function defaultScheduleReplacementLocal(occurrenceAt: string, offsetMinutes = 60): string {
  const date = new Date(occurrenceAt);
  if (Number.isNaN(date.getTime())) return "";
  return datetimeLocalValueFromIso(new Date(date.getTime() + offsetMinutes * 60_000).toISOString());
}

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
    focusedSchedule?.targetKind === "workflow_version" ? workflowVersions.find((version) => version.id === focusedSchedule.targetId) : undefined;
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

export type AutomationSchedulesFallbackPaneProps = Omit<AutomationSchedulesPaneProps, "focusedSchedule" | "targetOptions" | "selectedTarget"> & {
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
            <select className="automation-select" value={selectedScheduleTarget?.id ?? ""} onChange={(event) => onScheduleTargetIdChange(event.target.value)}>
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
              <strong>Enabled</strong>
            </span>
            <select className="automation-select" value={scheduleEnabled ? "enabled" : "paused"} onChange={(event) => onScheduleEnabledChange(event.target.value === "enabled")}>
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
            <AutomationHeadingLabel tooltip="Persisted schedule records with target, cadence, pause state, and the next calculated run time.">Saved Schedules</AutomationHeadingLabel>
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
                      {schedule.targetKind === "workflow_playbook" && <span>{schedule.targetVersion ? `Pinned v${schedule.targetVersion}` : "Current version"}</span>}
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
                            <button type="button" className="panel-button mini" onClick={() => onToggleScheduleHistoryExpanded(historyExpanded ? undefined : schedule.id)}>
                              {historyExpanded ? "Collapse" : `View ${scheduleRunHistory.length}`}
                            </button>
                          )}
                        </div>
                        {visibleScheduleRunHistory.map((run) => (
                          <button type="button" className={`workflow-schedule-history-row ${run.tone}`} key={run.id} title={run.actionTitle} onClick={() => onOpenRunDetail(run.id)}>
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

export type WorkflowSchedulesWorkspaceProps = {
  threadId: string;
  artifactManifest: Pick<WorkflowManifest, "maxRunMs">;
  creation: WorkflowScheduleCreationModel;
  scheduleState: WorkflowThreadScheduleState;
  grantReadiness: WorkflowScheduleGrantReadinessModel;
  workflowGrantRegistry: PermissionGrantRegistryModel;
  persistentStatus: WorkflowPersistentStatusModel;
  activePanel: WorkflowSchedulePanelId;
  focusedScheduleId?: string;
  schedulePreset: AutomationSchedulePreset;
  scheduleExpression: string;
  scheduleEnabled: boolean;
  scheduleRunIdleTimeoutMs: number;
  scheduleRunTotalLimitMode: WorkflowRunTotalLimitMode;
  scheduleBusy?: boolean;
  scheduleError?: string;
  schedules: AutomationScheduleSummary[];
  scheduleExceptions: AutomationScheduleExceptionSummary[];
  expandedScheduleHistoryId?: string;
  workflowBusy?: string;
  occurrenceEditor?: WorkflowScheduleOccurrenceEditorState;
  onSetPanel: (panel: WorkflowSchedulePanelId) => void;
  onCreateNewSeries: () => void;
  onSetScheduleTarget: (targetKind: "workflow_thread" | "workflow_version", targetId: string) => void;
  onSetSchedulePreset: (preset: AutomationSchedulePreset) => void;
  onSetScheduleExpression: (expression: string) => void;
  onSetScheduleEnabled: (enabled: boolean) => void;
  onSetScheduleRunIdleTimeoutMs: (idleTimeoutMs: number) => void;
  onSetScheduleRunTotalLimitMode: (mode: WorkflowRunTotalLimitMode) => void;
  onSetScheduleEditScope: (scope: WorkflowScheduleEditScopeId) => void;
  onSaveSchedule: (targetKind: "workflow_thread" | "workflow_version", targetId: string) => void | Promise<void>;
  onRefreshSchedules: () => void | Promise<void>;
  onSetExpandedScheduleHistoryId: (scheduleId: string | undefined) => void;
  onCreateScheduleGrant: (schedule: WorkflowThreadScheduleItem) => void | Promise<void>;
  onChangeOccurrenceEditor: Dispatch<SetStateAction<WorkflowScheduleOccurrenceEditorState | undefined>>;
  onCloseOccurrenceEditor: () => void;
  onEditOccurrenceSeriesScope: (schedule: AutomationScheduleSummary, scope: WorkflowScheduleEditScopeId) => void;
  onSaveOccurrenceEditor: () => void | Promise<void>;
  onSkipOccurrence: (schedule: AutomationScheduleSummary) => void | Promise<void>;
  onOpenOccurrenceEditor: (schedule: AutomationScheduleSummary) => void;
  onDeferOccurrence: (schedule: AutomationScheduleSummary, minutes: number) => void | Promise<void>;
  onUpdateOccurrenceRunLimits: (schedule: AutomationScheduleSummary, runLimits: WorkflowRunLimitOverrides, reason: string) => void | Promise<void>;
  onEditSchedule: (schedule: AutomationScheduleSummary) => void;
  onDuplicateSchedule: (schedule: AutomationScheduleSummary) => void;
  onOpenRunDetail: (runId: string) => void | Promise<void>;
  onCreateGrantAction: (action: WorkflowThreadScheduleGrantAction | undefined) => void | Promise<void>;
  onOpenPersistentStatusTarget: (workflowThreadId: string | undefined, target: WorkflowPersistentStatusTarget) => void;
};

export function WorkflowSchedulesWorkspace({
  threadId,
  artifactManifest,
  creation,
  scheduleState,
  grantReadiness,
  workflowGrantRegistry,
  persistentStatus,
  activePanel,
  focusedScheduleId,
  schedulePreset,
  scheduleExpression,
  scheduleEnabled,
  scheduleRunIdleTimeoutMs,
  scheduleRunTotalLimitMode,
  scheduleBusy,
  scheduleError,
  schedules,
  scheduleExceptions,
  expandedScheduleHistoryId,
  workflowBusy,
  occurrenceEditor,
  onSetPanel,
  onCreateNewSeries,
  onSetScheduleTarget,
  onSetSchedulePreset,
  onSetScheduleExpression,
  onSetScheduleEnabled,
  onSetScheduleRunIdleTimeoutMs,
  onSetScheduleRunTotalLimitMode,
  onSetScheduleEditScope,
  onSaveSchedule,
  onRefreshSchedules,
  onSetExpandedScheduleHistoryId,
  onCreateScheduleGrant,
  onChangeOccurrenceEditor,
  onCloseOccurrenceEditor,
  onEditOccurrenceSeriesScope,
  onSaveOccurrenceEditor,
  onSkipOccurrence,
  onOpenOccurrenceEditor,
  onDeferOccurrence,
  onUpdateOccurrenceRunLimits,
  onEditSchedule,
  onDuplicateSchedule,
  onOpenRunDetail,
  onCreateGrantAction,
  onOpenPersistentStatusTarget,
}: WorkflowSchedulesWorkspaceProps) {
  const schedulePanels: Array<{ id: WorkflowSchedulePanelId; label: string; detail: string }> = [
    { id: "schedules-overview", label: creation.title, detail: creation.recurrenceLabel },
    { id: "schedules-history", label: "Run History", detail: `${scheduleState.schedules.length} schedule${scheduleState.schedules.length === 1 ? "" : "s"}` },
    { id: "schedules-grants", label: "Grants", detail: grantReadiness.summary },
  ];
  const schedulableTarget = creation.selectedTarget && !creation.selectedTarget.disabled ? creation.selectedTarget : undefined;
  const schedulableTargetBlockReason =
    schedulableTarget?.targetKind === "workflow_thread" ? scheduleState.latestApprovedBlockReason : schedulableTarget?.targetKind === "workflow_version" ? scheduleState.pinCurrentBlockReason : undefined;

  return (
    <section className="automation-section automation-focus-primary workflow-schedules-workspace" data-mode="schedules">
      <AutomationExplainer
        paragraphs={[
          "Workflow schedules are edited in the context of this thread. Latest-approved schedules follow future approvals; pinned-version schedules keep running one approved version until edited.",
          "Scheduled runs must still satisfy workflow review, run-limit, concurrency, and persistent grant policy before unattended dispatch.",
        ]}
      />
      <WorkflowPersistentStatusView threadId={threadId} model={persistentStatus} onOpenTarget={onOpenPersistentStatusTarget} />
      <div className="workflow-schedules-shell">
        <nav className="workflow-build-rail workflow-schedules-rail" aria-label="Workflow schedule panels">
          {schedulePanels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              className={activePanel === panel.id ? "active" : ""}
              data-panel-target={panel.id}
              aria-controls={panel.id}
              onClick={() => onSetPanel(panel.id)}
            >
              <span>{panel.label}</span>
              <small>{panel.detail}</small>
            </button>
          ))}
        </nav>
        <div className="workflow-schedules-panel-body">
          {activePanel === "schedules-overview" && (
            <section id="schedules-overview" className="workflow-schedule-panel workflow-review-section">
              <div className="panel-section-heading">
                <div>
                  <AutomationHeadingLabel tooltip="Create a new workflow schedule or edit the selected schedule series with calendar-style target, repeat, and state controls.">
                    {creation.title}
                  </AutomationHeadingLabel>
                  <p className="panel-note">{creation.detail}</p>
                </div>
                {focusedScheduleId && (
                  <button type="button" className="panel-button mini" onClick={onCreateNewSeries}>
                    Create new series
                  </button>
                )}
              </div>
              <div className="workflow-schedule-target-grid" aria-label="Schedule target choices">
                {creation.targetChoices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={`workflow-schedule-choice ${choice.selected ? "selected" : ""}`}
                    disabled={choice.disabled}
                    title={choice.disabled ? choice.disabledReason : choice.detail}
                    onClick={() => onSetScheduleTarget(choice.targetKind, choice.targetId)}
                  >
                    <span>
                      <strong>{choice.label}</strong>
                      <small>{choice.detail}</small>
                    </span>
                    <em>{choice.badge}</em>
                  </button>
                ))}
              </div>
              <div className="automation-controls-grid compact">
                <label className="automation-field">
                  <span>
                    <strong>Repeats</strong>
                  </span>
                  <select className="automation-select" value={schedulePreset} onChange={(event) => onSetSchedulePreset(event.target.value as AutomationSchedulePreset)}>
                    <option value="manual">Does not repeat</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekdays">Every weekday</option>
                    <option value="weekly">Weekly</option>
                    <option value="advanced">Custom cron</option>
                  </select>
                </label>
                {schedulePreset === "advanced" && (
                  <label className="automation-field">
                    <span>
                      <strong>Cron</strong>
                    </span>
                    <input className="panel-input" value={scheduleExpression} onChange={(event) => onSetScheduleExpression(event.target.value)} placeholder="0 9 * * *" />
                  </label>
                )}
                <label className="automation-field">
                  <span>
                    <strong>State</strong>
                  </span>
                  <select className="automation-select" value={scheduleEnabled ? "enabled" : "paused"} onChange={(event) => onSetScheduleEnabled(event.target.value === "enabled")}>
                    <option value="enabled">Enabled</option>
                    <option value="paused">Paused</option>
                  </select>
                </label>
              </div>
              <div className="workflow-run-settings-inline" aria-label="Scheduled workflow run limits">
                <label title="Stop a scheduled run if no stream event, tool event, or workflow event arrives for this long.">
                  <span>Idle timeout</span>
                  <select
                    className="automation-select mini"
                    value={scheduleRunIdleTimeoutMs}
                    onChange={(event) => onSetScheduleRunIdleTimeoutMs(Number(event.target.value))}
                    disabled={scheduleBusy}
                  >
                    {workflowRunIdleTimeoutOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="workflow-total-limit-toggle" title={artifactManifest.maxRunMs === undefined ? "This workflow manifest has no total runtime cap." : "Use the workflow's generated total runtime cap for unattended runs."}>
                  <input
                    type="checkbox"
                    checked={scheduleRunTotalLimitMode === "manifest" && artifactManifest.maxRunMs !== undefined}
                    disabled={scheduleBusy || artifactManifest.maxRunMs === undefined}
                    onChange={(event) => onSetScheduleRunTotalLimitMode(event.target.checked ? "manifest" : "disabled")}
                  />
                  <span>{artifactManifest.maxRunMs === undefined ? "No total cap" : "Use manifest cap"}</span>
                </label>
                <small>{workflowRunLimitSummary({ idleTimeoutMs: scheduleRunIdleTimeoutMs, totalLimitMode: scheduleRunTotalLimitMode }, artifactManifest)}</small>
              </div>
              <div className="workflow-schedule-edit-scopes" aria-label="Calendar edit scope">
                {creation.editScopeChoices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={choice.selected ? "selected" : ""}
                    disabled={choice.disabled}
                    title={choice.detail}
                    onClick={() => onSetScheduleEditScope(choice.id)}
                  >
                    <strong>{choice.label}</strong>
                    <span>{choice.detail}</span>
                  </button>
                ))}
              </div>
              <div className="workflow-schedule-preview-grid">
                {creation.previewRows.map((row) => (
                  <div key={row.label} className={`workflow-review-tile ${row.tone}`}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                    <small>{row.detail}</small>
                  </div>
                ))}
              </div>
              <div className="task-heading-actions">
                <button
                  type="button"
                  className="panel-button primary"
                  disabled={scheduleBusy || !creation.canSave || !schedulableTarget || Boolean(schedulableTargetBlockReason)}
                  title={schedulableTargetBlockReason ?? creation.saveTitle}
                  onClick={() => schedulableTarget && void onSaveSchedule(schedulableTarget.targetKind, schedulableTarget.targetId)}
                >
                  {scheduleBusy ? "Saving" : creation.saveLabel}
                </button>
                <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={() => void onRefreshSchedules()}>
                  Refresh
                </button>
              </div>
              {scheduleError && <p className="panel-status error">{scheduleError}</p>}
            </section>
          )}
          {activePanel === "schedules-history" && (
            <WorkflowScheduleHistoryPanel
              schedules={scheduleState.schedules}
              rawSchedules={schedules}
              scheduleExceptions={scheduleExceptions}
              expandedScheduleHistoryId={expandedScheduleHistoryId}
              scheduleBusy={scheduleBusy}
              workflowBusy={workflowBusy}
              scheduleRunIdleTimeoutMs={scheduleRunIdleTimeoutMs}
              occurrenceEditor={occurrenceEditor}
              onSetExpandedScheduleHistoryId={onSetExpandedScheduleHistoryId}
              onCreateGrant={(schedule) => void onCreateScheduleGrant(schedule)}
              onChangeOccurrenceEditor={onChangeOccurrenceEditor}
              onCloseOccurrenceEditor={onCloseOccurrenceEditor}
              onEditOccurrenceSeriesScope={onEditOccurrenceSeriesScope}
              onSaveOccurrenceEditor={() => void onSaveOccurrenceEditor()}
              onSkipOccurrence={(schedule) => void onSkipOccurrence(schedule)}
              onOpenOccurrenceEditor={onOpenOccurrenceEditor}
              onDeferOccurrence={(schedule, minutes) => void onDeferOccurrence(schedule, minutes)}
              onUpdateOccurrenceRunLimits={(schedule, runLimits, reason) => void onUpdateOccurrenceRunLimits(schedule, runLimits, reason)}
              onEditSchedule={onEditSchedule}
              onDuplicateSchedule={onDuplicateSchedule}
              onOpenRunDetail={(runId) => void onOpenRunDetail(runId)}
              onRefreshSchedules={() => void onRefreshSchedules()}
            />
          )}
          {activePanel === "schedules-grants" && (
            <section id="schedules-grants" className="workflow-schedule-panel workflow-review-section">
              <div className="panel-section-heading">
                <div>
                  <AutomationHeadingLabel tooltip="Persistent grants required for unattended scheduled connector access and installed Ambient CLI command execution. Full Access receipts are shown separately from reusable grants.">
                    {grantReadiness.title}
                  </AutomationHeadingLabel>
                  <p className="panel-note">{grantReadiness.detail}</p>
                </div>
                <span className={`workflow-review-state ${grantReadiness.tone}`}>{grantReadiness.summary}</span>
              </div>
              <div className="workflow-schedule-preview-grid">
                {grantReadiness.tiles.map((tile) => (
                  <div key={tile.id} className={`workflow-review-tile ${tile.tone}`}>
                    <span>{tile.label}</span>
                    <strong>{tile.value}</strong>
                    <small>{tile.detail}</small>
                  </div>
                ))}
              </div>
              <div className="workflow-schedule-grant-readiness-list">
                {grantReadiness.rows.map((row) => (
                  <article className={`permission-log-row ${row.tone === "blocked" ? "denied" : "allowed"} workflow-schedule-grant-readiness-row`} key={row.id}>
                    <div>
                      <strong>{row.statusLabel}</strong>
                      <span>{row.detail}</span>
                    </div>
                    <small title={row.targetLabel}>
                      {row.targetLabel} · {row.accountLabel}
                    </small>
                    <code title={`${row.expiryLabel} · ${row.recentUseLabel} · ${row.riskLabel}`}>
                      {row.expiryLabel} · {row.recentUseLabel} · {row.riskLabel}
                    </code>
                    {row.action && (
                      <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={() => void onCreateGrantAction(row.action)}>
                        {scheduleBusy ? "Saving grant" : row.action.label}
                      </button>
                    )}
                  </article>
                ))}
              </div>
              <PermissionFullAccessReceiptList receipts={workflowGrantRegistry.fullAccessReceipts} limit={4} />
              {scheduleError && <p className="panel-status error">{scheduleError}</p>}
            </section>
          )}
        </div>
      </div>
    </section>
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
    schedulableTarget?.targetKind === "workflow_thread" ? scheduleState.latestApprovedBlockReason : schedulableTarget?.targetKind === "workflow_version" ? scheduleState.pinCurrentBlockReason : undefined;
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

export function WorkflowScheduleOccurrenceEditor({
  schedule,
  editor,
  scheduleBusy,
  onChangeEditor,
  onClose,
  onEditSeriesScope,
  onSave,
  onSkip,
}: {
  schedule: AutomationScheduleSummary;
  editor?: WorkflowScheduleOccurrenceEditorState;
  scheduleBusy?: boolean;
  onChangeEditor: Dispatch<SetStateAction<WorkflowScheduleOccurrenceEditorState | undefined>>;
  onClose: () => void;
  onEditSeriesScope: (schedule: AutomationScheduleSummary, scope: WorkflowScheduleEditScopeId) => void;
  onSave: () => void;
  onSkip: (schedule: AutomationScheduleSummary) => void;
}) {
  if (!schedule.nextRunAt || editor?.scheduleId !== schedule.id) return null;
  const replacementRunAt = isoFromDatetimeLocalValue(editor.replacementLocal);
  const replacementLabel = replacementRunAt ? formatTimelineTime(replacementRunAt) : "Choose date and time";
  return (
    <section className="workflow-schedule-occurrence-editor" aria-label="Reschedule next occurrence">
      <div className="workflow-schedule-occurrence-editor-heading">
        <div>
          <strong>Reschedule occurrence</strong>
          <span>Next occurrence: {formatTimelineTime(editor.occurrenceAt)}</span>
        </div>
        <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={onClose}>
          Close
        </button>
      </div>
      <div className="workflow-schedule-edit-scopes compact" aria-label="Calendar edit scope for occurrence editor">
        <button type="button" className="selected" disabled title="Create a one-off exception for only this upcoming scheduled run.">
          <strong>This occurrence</strong>
          <span>Save a one-off replacement time.</span>
        </button>
        <button
          type="button"
          title="Move to Create/Edit and apply target, repeat, state, and run-limit changes beginning with the next occurrence."
          onClick={() => onEditSeriesScope(schedule, "this_and_following")}
        >
          <strong>This and following</strong>
          <span>Edit future runs from this occurrence.</span>
        </button>
        <button
          type="button"
          title="Move to Create/Edit and apply target, repeat, state, and run-limit changes to the whole series."
          onClick={() => onEditSeriesScope(schedule, "all_occurrences")}
        >
          <strong>All occurrences</strong>
          <span>Edit the entire schedule series.</span>
        </button>
      </div>
      <div className="workflow-schedule-occurrence-fields">
        <label className="automation-field">
          <span>
            <strong>New date and time</strong>
          </span>
          <input
            className="panel-input"
            type="datetime-local"
            value={editor.replacementLocal}
            disabled={scheduleBusy}
            onChange={(event) =>
              onChangeEditor((current) =>
                current?.scheduleId === schedule.id ? { ...current, replacementLocal: event.target.value } : current,
              )
            }
          />
        </label>
        <label className="automation-field">
          <span>
            <strong>Reason</strong>
          </span>
          <input
            className="panel-input"
            value={editor.reason}
            disabled={scheduleBusy}
            onChange={(event) =>
              onChangeEditor((current) =>
                current?.scheduleId === schedule.id ? { ...current, reason: event.target.value } : current,
              )
            }
            placeholder="Optional audit note"
          />
        </label>
      </div>
      <div className="workflow-schedule-occurrence-preview">
        <div>
          <span>Original</span>
          <strong>{formatTimelineTime(editor.occurrenceAt)}</strong>
        </div>
        <div>
          <span>Replacement</span>
          <strong>{replacementLabel}</strong>
        </div>
        <div>
          <span>Audit</span>
          <strong>One-off exception</strong>
        </div>
      </div>
      <div className="task-heading-actions">
        <button type="button" className="panel-button primary" disabled={scheduleBusy || !replacementRunAt} onClick={onSave}>
          {scheduleBusy ? "Saving" : "Save one-off reschedule"}
        </button>
        <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={() => onSkip(schedule)}>
          Skip this occurrence
        </button>
        <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </section>
  );
}

export function WorkflowScheduleHistoryPanel({
  schedules,
  rawSchedules,
  scheduleExceptions,
  expandedScheduleHistoryId,
  scheduleBusy,
  workflowBusy,
  scheduleRunIdleTimeoutMs,
  occurrenceEditor,
  onSetExpandedScheduleHistoryId,
  onCreateGrant,
  onChangeOccurrenceEditor,
  onCloseOccurrenceEditor,
  onEditOccurrenceSeriesScope,
  onSaveOccurrenceEditor,
  onSkipOccurrence,
  onOpenOccurrenceEditor,
  onDeferOccurrence,
  onUpdateOccurrenceRunLimits,
  onEditSchedule,
  onDuplicateSchedule,
  onOpenRunDetail,
  onRefreshSchedules,
}: {
  schedules: WorkflowThreadScheduleItem[];
  rawSchedules: AutomationScheduleSummary[];
  scheduleExceptions: AutomationScheduleExceptionSummary[];
  expandedScheduleHistoryId?: string;
  scheduleBusy?: boolean;
  workflowBusy?: string;
  scheduleRunIdleTimeoutMs: number;
  occurrenceEditor?: WorkflowScheduleOccurrenceEditorState;
  onSetExpandedScheduleHistoryId: (scheduleId: string | undefined) => void;
  onCreateGrant: (schedule: WorkflowThreadScheduleItem) => void;
  onChangeOccurrenceEditor: Dispatch<SetStateAction<WorkflowScheduleOccurrenceEditorState | undefined>>;
  onCloseOccurrenceEditor: () => void;
  onEditOccurrenceSeriesScope: (schedule: AutomationScheduleSummary, scope: WorkflowScheduleEditScopeId) => void;
  onSaveOccurrenceEditor: () => void;
  onSkipOccurrence: (schedule: AutomationScheduleSummary) => void;
  onOpenOccurrenceEditor: (schedule: AutomationScheduleSummary) => void;
  onDeferOccurrence: (schedule: AutomationScheduleSummary, minutes: number) => void;
  onUpdateOccurrenceRunLimits: (schedule: AutomationScheduleSummary, runLimits: WorkflowRunLimitOverrides, reason: string) => void;
  onEditSchedule: (schedule: AutomationScheduleSummary) => void;
  onDuplicateSchedule: (schedule: AutomationScheduleSummary) => void;
  onOpenRunDetail: (runId: string) => void;
  onRefreshSchedules: () => void;
}) {
  return (
    <section id="schedules-history" className="workflow-schedule-panel workflow-review-section">
      <div className="panel-section-heading">
        <div>
          <AutomationHeadingLabel tooltip="Workflow schedule records and recent occurrences for this thread, grouped by schedule series.">
            Scheduled run history
          </AutomationHeadingLabel>
          <p className="panel-note">Edit or duplicate schedule series, then inspect recent scheduled runs from their audit trail.</p>
        </div>
        <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={onRefreshSchedules}>
          Refresh
        </button>
      </div>
      {schedules.length ? (
        <div className="workflow-version-list">
          {schedules.map((schedule) => {
            const rawSchedule = rawSchedules.find((candidate) => candidate.id === schedule.id);
            const scheduleExceptionItems = scheduleExceptions.filter((exception) => exception.scheduleId === schedule.id);
            const exceptionLedgerItems = workflowScheduleExceptionLedgerItems(scheduleExceptionItems, 8);
            const historyExpanded = expandedScheduleHistoryId === schedule.id;
            const visibleRuns = historyExpanded ? schedule.recentRuns : schedule.recentRuns.slice(0, 3);
            return (
              <article className={`workflow-version-card workflow-schedule-series-card ${schedule.dispatchTone}`} key={schedule.id}>
                <div>
                  <div className="task-row-header">
                    <strong>{schedule.statusLabel}</strong>
                    <span>{schedule.mode === "latest_approved" ? "Latest approved" : schedule.mode === "pinned_version" ? "Pinned version" : "Artifact"}</span>
                  </div>
                  <p>{schedule.targetLabel}</p>
                  <div className="plugin-badges">
                    <span>{schedule.cadenceLabel}</span>
                    <span>{schedule.nextRunLabel}</span>
                    <span>{schedule.versionLabel}</span>
                    <span className={`workflow-schedule-drift ${schedule.driftTone}`}>{schedule.driftLabel}</span>
                    <span className={`workflow-schedule-dispatch ${schedule.dispatchTone}`}>{schedule.dispatchLabel}</span>
                  </div>
                  {schedule.grantLabel && (
                    <div className={`workflow-schedule-grant ${schedule.grantAction ? "blocked" : "ready"}`}>
                      <div>
                        <strong>{schedule.grantLabel}</strong>
                        {schedule.grantDetail && <span>{schedule.grantDetail}</span>}
                      </div>
                      {schedule.grantAction && (
                        <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={() => onCreateGrant(schedule)}>
                          {scheduleBusy ? "Saving grant" : schedule.grantAction.label}
                        </button>
                      )}
                    </div>
                  )}
                  {rawSchedule && (
                    <WorkflowScheduleOccurrenceEditor
                      schedule={rawSchedule}
                      editor={occurrenceEditor}
                      scheduleBusy={scheduleBusy}
                      onChangeEditor={onChangeOccurrenceEditor}
                      onClose={onCloseOccurrenceEditor}
                      onEditSeriesScope={onEditOccurrenceSeriesScope}
                      onSave={onSaveOccurrenceEditor}
                      onSkip={onSkipOccurrence}
                    />
                  )}
                  {visibleRuns.length ? (
                    <div className={`workflow-schedule-history-list ${historyExpanded ? "expanded" : ""}`}>
                      <div className="workflow-schedule-history-header">
                        <strong>Recent occurrences</strong>
                        {schedule.recentRuns.length > 3 && (
                          <button type="button" className="panel-button mini" onClick={() => onSetExpandedScheduleHistoryId(historyExpanded ? undefined : schedule.id)}>
                            {historyExpanded ? "Collapse" : `View ${schedule.recentRuns.length}`}
                          </button>
                        )}
                      </div>
                      {visibleRuns.map((run) => (
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
                  ) : (
                    <p className="panel-note">No scheduled occurrences have run yet.</p>
                  )}
                  <div className="workflow-schedule-history-list compact workflow-schedule-exception-ledger">
                    <div className="workflow-schedule-history-header">
                      <strong>Exception ledger</strong>
                      <span>{exceptionLedgerItems.length ? `${exceptionLedgerItems.length} recent` : "No edits"}</span>
                    </div>
                    {exceptionLedgerItems.length > 0 ? (
                      exceptionLedgerItems.map((exception) => (
                        <div className={`workflow-schedule-history-row ${exception.tone}`} key={exception.id}>
                          <span>{exception.title}</span>
                          <small>
                            {exception.occurrenceLabel}
                            {exception.detail ? ` · ${exception.detail}` : ""}
                          </small>
                          <em>{exception.statusLabel}</em>
                        </div>
                      ))
                    ) : (
                      <p className="panel-note">No one-off skips, reschedules, run-limit overrides, or series edits yet.</p>
                    )}
                  </div>
                </div>
                <div className="workflow-schedule-series-actions">
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={!rawSchedule?.nextRunAt || scheduleBusy}
                    title={rawSchedule?.nextRunAt ? `Skip the next scheduled occurrence at ${rawSchedule.nextRunAt}.` : "No upcoming occurrence to skip."}
                    onClick={() => rawSchedule && onSkipOccurrence(rawSchedule)}
                  >
                    Skip next
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={!rawSchedule?.nextRunAt || scheduleBusy}
                    title={rawSchedule?.nextRunAt ? `Choose a custom replacement date and time for ${rawSchedule.nextRunAt}.` : "No upcoming occurrence to reschedule."}
                    onClick={() => rawSchedule && onOpenOccurrenceEditor(rawSchedule)}
                  >
                    Reschedule...
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={!rawSchedule?.nextRunAt || scheduleBusy}
                    title={rawSchedule?.nextRunAt ? `Move the next scheduled occurrence one hour later than ${rawSchedule.nextRunAt}.` : "No upcoming occurrence to defer."}
                    onClick={() => rawSchedule && onDeferOccurrence(rawSchedule, 60)}
                  >
                    Defer 1h
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={!rawSchedule?.nextRunAt || scheduleBusy}
                    title={rawSchedule?.nextRunAt ? `Move the next scheduled occurrence one day later than ${rawSchedule.nextRunAt}.` : "No upcoming occurrence to defer."}
                    onClick={() => rawSchedule && onDeferOccurrence(rawSchedule, 24 * 60)}
                  >
                    Defer 1d
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={!rawSchedule?.nextRunAt || scheduleBusy}
                    title={rawSchedule?.nextRunAt ? `Let the next occurrence at ${rawSchedule.nextRunAt} run without a total runtime cap.` : "No upcoming occurrence to edit."}
                    onClick={() =>
                      rawSchedule &&
                      onUpdateOccurrenceRunLimits(
                        rawSchedule,
                        workflowRemoveTotalRunLimitOverrides({ idleTimeoutMs: rawSchedule.runLimits?.idleTimeoutMs ?? scheduleRunIdleTimeoutMs }),
                        "Removed total runtime cap for next scheduled occurrence.",
                      )
                    }
                  >
                    No cap next
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={!rawSchedule?.nextRunAt || scheduleBusy}
                    title={rawSchedule?.nextRunAt ? `Give the next occurrence at ${rawSchedule.nextRunAt} a fresh ten-minute total runtime cap.` : "No upcoming occurrence to edit."}
                    onClick={() =>
                      rawSchedule &&
                      onUpdateOccurrenceRunLimits(
                        rawSchedule,
                        workflowExtendTotalRunLimitOverrides({ idleTimeoutMs: rawSchedule.runLimits?.idleTimeoutMs ?? scheduleRunIdleTimeoutMs }),
                        "Extended total runtime cap for next scheduled occurrence.",
                      )
                    }
                  >
                    10 min cap next
                  </button>
                  <button type="button" className="panel-button mini" disabled={!rawSchedule} onClick={() => rawSchedule && onEditSchedule(rawSchedule)}>
                    Edit
                  </button>
                  <button type="button" className="panel-button mini" disabled={!rawSchedule} onClick={() => rawSchedule && onDuplicateSchedule(rawSchedule)}>
                    Duplicate
                  </button>
                  {schedule.latestRunId && (
                    <button
                      type="button"
                      className="panel-button mini"
                      title={schedule.latestRunActionTitle}
                      disabled={workflowBusy === schedule.latestRunId}
                      onClick={() => onOpenRunDetail(schedule.latestRunId!)}
                    >
                      {workflowBusy === schedule.latestRunId ? "Opening" : schedule.latestRunActionLabel ?? "Open latest run"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="panel-note">No workflow schedules yet. Create one from the Create schedule panel after approving a workflow version.</p>
      )}
    </section>
  );
}
