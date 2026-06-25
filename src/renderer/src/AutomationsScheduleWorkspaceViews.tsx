import type { Dispatch, SetStateAction } from "react";

import type { AutomationScheduleExceptionSummary, AutomationScheduleSummary } from "../../shared/automationTypes";
import type { WorkflowManifest, WorkflowRunLimitOverrides } from "../../shared/workflowTypes";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { AutomationExplainer } from "./AutomationsWorkflowUtilityViews";
import { WorkflowPersistentStatusView } from "./AutomationsWorkflowRuntimeViews";
import { PermissionFullAccessReceiptList, formatTimelineTime } from "./RightPanel";
import type { AutomationSchedulePreset } from "./automationUiModel";
import type { PermissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import type { WorkflowPersistentStatusModel, WorkflowPersistentStatusTarget } from "./workflowPersistentStatusUiModel";
import {
  type WorkflowScheduleCreationModel,
  workflowScheduleExceptionLedgerItems,
  type WorkflowScheduleEditScopeId,
  type WorkflowScheduleGrantReadinessModel,
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
  onUpdateOccurrenceRunLimits: (
    schedule: AutomationScheduleSummary,
    runLimits: WorkflowRunLimitOverrides,
    reason: string,
  ) => void | Promise<void>;
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
    {
      id: "schedules-history",
      label: "Run History",
      detail: `${scheduleState.schedules.length} schedule${scheduleState.schedules.length === 1 ? "" : "s"}`,
    },
    { id: "schedules-grants", label: "Grants", detail: grantReadiness.summary },
  ];

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
            <WorkflowScheduleOverviewPanel
              artifactManifest={artifactManifest}
              creation={creation}
              scheduleState={scheduleState}
              focusedScheduleId={focusedScheduleId}
              schedulePreset={schedulePreset}
              scheduleExpression={scheduleExpression}
              scheduleEnabled={scheduleEnabled}
              scheduleRunIdleTimeoutMs={scheduleRunIdleTimeoutMs}
              scheduleRunTotalLimitMode={scheduleRunTotalLimitMode}
              scheduleBusy={scheduleBusy}
              scheduleError={scheduleError}
              onCreateNewSeries={onCreateNewSeries}
              onSetScheduleTarget={onSetScheduleTarget}
              onSetSchedulePreset={onSetSchedulePreset}
              onSetScheduleExpression={onSetScheduleExpression}
              onSetScheduleEnabled={onSetScheduleEnabled}
              onSetScheduleRunIdleTimeoutMs={onSetScheduleRunIdleTimeoutMs}
              onSetScheduleRunTotalLimitMode={onSetScheduleRunTotalLimitMode}
              onSetScheduleEditScope={onSetScheduleEditScope}
              onSaveSchedule={(targetKind, targetId) => void onSaveSchedule(targetKind, targetId)}
              onRefreshSchedules={() => void onRefreshSchedules()}
            />
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
            <WorkflowScheduleGrantsPanel
              grantReadiness={grantReadiness}
              workflowGrantRegistry={workflowGrantRegistry}
              scheduleBusy={scheduleBusy}
              scheduleError={scheduleError}
              onCreateGrantAction={(action) => void onCreateGrantAction(action)}
            />
          )}
        </div>
      </div>
    </section>
  );
}

type WorkflowScheduleOverviewPanelProps = Pick<
  WorkflowSchedulesWorkspaceProps,
  | "artifactManifest"
  | "creation"
  | "scheduleState"
  | "focusedScheduleId"
  | "schedulePreset"
  | "scheduleExpression"
  | "scheduleEnabled"
  | "scheduleRunIdleTimeoutMs"
  | "scheduleRunTotalLimitMode"
  | "scheduleBusy"
  | "scheduleError"
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
>;

function WorkflowScheduleOverviewPanel({
  artifactManifest,
  creation,
  scheduleState,
  focusedScheduleId,
  schedulePreset,
  scheduleExpression,
  scheduleEnabled,
  scheduleRunIdleTimeoutMs,
  scheduleRunTotalLimitMode,
  scheduleBusy,
  scheduleError,
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
}: WorkflowScheduleOverviewPanelProps) {
  const schedulableTarget = creation.selectedTarget && !creation.selectedTarget.disabled ? creation.selectedTarget : undefined;
  const schedulableTargetBlockReason =
    schedulableTarget?.targetKind === "workflow_thread"
      ? scheduleState.latestApprovedBlockReason
      : schedulableTarget?.targetKind === "workflow_version"
        ? scheduleState.pinCurrentBlockReason
        : undefined;

  return (
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
          <select
            className="automation-select"
            value={schedulePreset}
            onChange={(event) => onSetSchedulePreset(event.target.value as AutomationSchedulePreset)}
          >
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
            <input
              className="panel-input"
              value={scheduleExpression}
              onChange={(event) => onSetScheduleExpression(event.target.value)}
              placeholder="0 9 * * *"
            />
          </label>
        )}
        <label className="automation-field">
          <span>
            <strong>State</strong>
          </span>
          <select
            className="automation-select"
            value={scheduleEnabled ? "enabled" : "paused"}
            onChange={(event) => onSetScheduleEnabled(event.target.value === "enabled")}
          >
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
        <label
          className="workflow-total-limit-toggle"
          title={
            artifactManifest.maxRunMs === undefined
              ? "This workflow manifest has no total runtime cap."
              : "Use the workflow's generated total runtime cap for unattended runs."
          }
        >
          <input
            type="checkbox"
            checked={scheduleRunTotalLimitMode === "manifest" && artifactManifest.maxRunMs !== undefined}
            disabled={scheduleBusy || artifactManifest.maxRunMs === undefined}
            onChange={(event) => onSetScheduleRunTotalLimitMode(event.target.checked ? "manifest" : "disabled")}
          />
          <span>{artifactManifest.maxRunMs === undefined ? "No total cap" : "Use manifest cap"}</span>
        </label>
        <small>
          {workflowRunLimitSummary(
            { idleTimeoutMs: scheduleRunIdleTimeoutMs, totalLimitMode: scheduleRunTotalLimitMode },
            artifactManifest,
          )}
        </small>
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
          onClick={() => schedulableTarget && onSaveSchedule(schedulableTarget.targetKind, schedulableTarget.targetId)}
        >
          {scheduleBusy ? "Saving" : creation.saveLabel}
        </button>
        <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={onRefreshSchedules}>
          Refresh
        </button>
      </div>
      {scheduleError && <p className="panel-status error">{scheduleError}</p>}
    </section>
  );
}

type WorkflowScheduleGrantsPanelProps = Pick<
  WorkflowSchedulesWorkspaceProps,
  "grantReadiness" | "workflowGrantRegistry" | "scheduleBusy" | "scheduleError" | "onCreateGrantAction"
>;

function WorkflowScheduleGrantsPanel({
  grantReadiness,
  workflowGrantRegistry,
  scheduleBusy,
  scheduleError,
  onCreateGrantAction,
}: WorkflowScheduleGrantsPanelProps) {
  return (
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
          <article
            className={`permission-log-row ${row.tone === "blocked" ? "denied" : "allowed"} workflow-schedule-grant-readiness-row`}
            key={row.id}
          >
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
              <button type="button" className="panel-button mini" disabled={scheduleBusy} onClick={() => onCreateGrantAction(row.action)}>
                {scheduleBusy ? "Saving grant" : row.action.label}
              </button>
            )}
          </article>
        ))}
      </div>
      <PermissionFullAccessReceiptList receipts={workflowGrantRegistry.fullAccessReceipts} limit={4} />
      {scheduleError && <p className="panel-status error">{scheduleError}</p>}
    </section>
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
              onChangeEditor((current) => (current?.scheduleId === schedule.id ? { ...current, reason: event.target.value } : current))
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

type WorkflowScheduleHistoryPanelProps = {
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
};

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
}: WorkflowScheduleHistoryPanelProps) {
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
            const historyExpanded = expandedScheduleHistoryId === schedule.id;
            return (
              <WorkflowScheduleHistoryCard
                key={schedule.id}
                schedule={schedule}
                rawSchedule={rawSchedule}
                scheduleExceptionItems={scheduleExceptionItems}
                historyExpanded={historyExpanded}
                scheduleBusy={scheduleBusy}
                workflowBusy={workflowBusy}
                scheduleRunIdleTimeoutMs={scheduleRunIdleTimeoutMs}
                occurrenceEditor={occurrenceEditor}
                onSetExpandedScheduleHistoryId={onSetExpandedScheduleHistoryId}
                onCreateGrant={onCreateGrant}
                onChangeOccurrenceEditor={onChangeOccurrenceEditor}
                onCloseOccurrenceEditor={onCloseOccurrenceEditor}
                onEditOccurrenceSeriesScope={onEditOccurrenceSeriesScope}
                onSaveOccurrenceEditor={onSaveOccurrenceEditor}
                onSkipOccurrence={onSkipOccurrence}
                onOpenOccurrenceEditor={onOpenOccurrenceEditor}
                onDeferOccurrence={onDeferOccurrence}
                onUpdateOccurrenceRunLimits={onUpdateOccurrenceRunLimits}
                onEditSchedule={onEditSchedule}
                onDuplicateSchedule={onDuplicateSchedule}
                onOpenRunDetail={onOpenRunDetail}
              />
            );
          })}
        </div>
      ) : (
        <p className="panel-note">
          No workflow schedules yet. Create one from the Create schedule panel after approving a workflow version.
        </p>
      )}
    </section>
  );
}

type WorkflowScheduleHistoryCardProps = Pick<
  WorkflowScheduleHistoryPanelProps,
  | "scheduleBusy"
  | "workflowBusy"
  | "scheduleRunIdleTimeoutMs"
  | "occurrenceEditor"
  | "onSetExpandedScheduleHistoryId"
  | "onCreateGrant"
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
> & {
  schedule: WorkflowThreadScheduleItem;
  rawSchedule?: AutomationScheduleSummary;
  scheduleExceptionItems: AutomationScheduleExceptionSummary[];
  historyExpanded: boolean;
};

function WorkflowScheduleHistoryCard({
  schedule,
  rawSchedule,
  scheduleExceptionItems,
  historyExpanded,
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
}: WorkflowScheduleHistoryCardProps) {
  return (
    <article className={`workflow-version-card workflow-schedule-series-card ${schedule.dispatchTone}`}>
      <div>
        <div className="task-row-header">
          <strong>{schedule.statusLabel}</strong>
          <span>
            {schedule.mode === "latest_approved" ? "Latest approved" : schedule.mode === "pinned_version" ? "Pinned version" : "Artifact"}
          </span>
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
        <WorkflowScheduleRunHistoryList
          schedule={schedule}
          historyExpanded={historyExpanded}
          onSetExpandedScheduleHistoryId={onSetExpandedScheduleHistoryId}
          onOpenRunDetail={onOpenRunDetail}
        />
        <WorkflowScheduleExceptionLedger scheduleExceptionItems={scheduleExceptionItems} />
      </div>
      <WorkflowScheduleSeriesActions
        schedule={schedule}
        rawSchedule={rawSchedule}
        scheduleBusy={scheduleBusy}
        workflowBusy={workflowBusy}
        scheduleRunIdleTimeoutMs={scheduleRunIdleTimeoutMs}
        onSkipOccurrence={onSkipOccurrence}
        onOpenOccurrenceEditor={onOpenOccurrenceEditor}
        onDeferOccurrence={onDeferOccurrence}
        onUpdateOccurrenceRunLimits={onUpdateOccurrenceRunLimits}
        onEditSchedule={onEditSchedule}
        onDuplicateSchedule={onDuplicateSchedule}
        onOpenRunDetail={onOpenRunDetail}
      />
    </article>
  );
}

function WorkflowScheduleRunHistoryList({
  schedule,
  historyExpanded,
  onSetExpandedScheduleHistoryId,
  onOpenRunDetail,
}: Pick<WorkflowScheduleHistoryPanelProps, "onSetExpandedScheduleHistoryId" | "onOpenRunDetail"> & {
  schedule: WorkflowThreadScheduleItem;
  historyExpanded: boolean;
}) {
  const visibleRuns = historyExpanded ? schedule.recentRuns : schedule.recentRuns.slice(0, 3);
  if (!visibleRuns.length) return <p className="panel-note">No scheduled occurrences have run yet.</p>;
  return (
    <div className={`workflow-schedule-history-list ${historyExpanded ? "expanded" : ""}`}>
      <div className="workflow-schedule-history-header">
        <strong>Recent occurrences</strong>
        {schedule.recentRuns.length > 3 && (
          <button
            type="button"
            className="panel-button mini"
            onClick={() => onSetExpandedScheduleHistoryId(historyExpanded ? undefined : schedule.id)}
          >
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
  );
}

function WorkflowScheduleExceptionLedger({ scheduleExceptionItems }: { scheduleExceptionItems: AutomationScheduleExceptionSummary[] }) {
  const exceptionLedgerItems = workflowScheduleExceptionLedgerItems(scheduleExceptionItems, 8);
  return (
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
  );
}

type WorkflowScheduleSeriesActionsProps = Pick<
  WorkflowScheduleHistoryPanelProps,
  | "scheduleBusy"
  | "workflowBusy"
  | "scheduleRunIdleTimeoutMs"
  | "onSkipOccurrence"
  | "onOpenOccurrenceEditor"
  | "onDeferOccurrence"
  | "onUpdateOccurrenceRunLimits"
  | "onEditSchedule"
  | "onDuplicateSchedule"
  | "onOpenRunDetail"
> & {
  schedule: WorkflowThreadScheduleItem;
  rawSchedule?: AutomationScheduleSummary;
};

function WorkflowScheduleSeriesActions({
  schedule,
  rawSchedule,
  scheduleBusy,
  workflowBusy,
  scheduleRunIdleTimeoutMs,
  onSkipOccurrence,
  onOpenOccurrenceEditor,
  onDeferOccurrence,
  onUpdateOccurrenceRunLimits,
  onEditSchedule,
  onDuplicateSchedule,
  onOpenRunDetail,
}: WorkflowScheduleSeriesActionsProps) {
  return (
    <div className="workflow-schedule-series-actions">
      <button
        type="button"
        className="panel-button mini"
        disabled={!rawSchedule?.nextRunAt || scheduleBusy}
        title={
          rawSchedule?.nextRunAt ? `Skip the next scheduled occurrence at ${rawSchedule.nextRunAt}.` : "No upcoming occurrence to skip."
        }
        onClick={() => rawSchedule && onSkipOccurrence(rawSchedule)}
      >
        Skip next
      </button>
      <button
        type="button"
        className="panel-button mini"
        disabled={!rawSchedule?.nextRunAt || scheduleBusy}
        title={
          rawSchedule?.nextRunAt
            ? `Choose a custom replacement date and time for ${rawSchedule.nextRunAt}.`
            : "No upcoming occurrence to reschedule."
        }
        onClick={() => rawSchedule && onOpenOccurrenceEditor(rawSchedule)}
      >
        Reschedule...
      </button>
      <button
        type="button"
        className="panel-button mini"
        disabled={!rawSchedule?.nextRunAt || scheduleBusy}
        title={
          rawSchedule?.nextRunAt
            ? `Move the next scheduled occurrence one hour later than ${rawSchedule.nextRunAt}.`
            : "No upcoming occurrence to defer."
        }
        onClick={() => rawSchedule && onDeferOccurrence(rawSchedule, 60)}
      >
        Defer 1h
      </button>
      <button
        type="button"
        className="panel-button mini"
        disabled={!rawSchedule?.nextRunAt || scheduleBusy}
        title={
          rawSchedule?.nextRunAt
            ? `Move the next scheduled occurrence one day later than ${rawSchedule.nextRunAt}.`
            : "No upcoming occurrence to defer."
        }
        onClick={() => rawSchedule && onDeferOccurrence(rawSchedule, 24 * 60)}
      >
        Defer 1d
      </button>
      <button
        type="button"
        className="panel-button mini"
        disabled={!rawSchedule?.nextRunAt || scheduleBusy}
        title={
          rawSchedule?.nextRunAt
            ? `Let the next occurrence at ${rawSchedule.nextRunAt} run without a total runtime cap.`
            : "No upcoming occurrence to edit."
        }
        onClick={() =>
          rawSchedule &&
          onUpdateOccurrenceRunLimits(
            rawSchedule,
            workflowRemoveTotalRunLimitOverrides({
              idleTimeoutMs: rawSchedule.runLimits?.idleTimeoutMs ?? scheduleRunIdleTimeoutMs,
            }),
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
        title={
          rawSchedule?.nextRunAt
            ? `Give the next occurrence at ${rawSchedule.nextRunAt} a fresh ten-minute total runtime cap.`
            : "No upcoming occurrence to edit."
        }
        onClick={() =>
          rawSchedule &&
          onUpdateOccurrenceRunLimits(
            rawSchedule,
            workflowExtendTotalRunLimitOverrides({
              idleTimeoutMs: rawSchedule.runLimits?.idleTimeoutMs ?? scheduleRunIdleTimeoutMs,
            }),
            "Extended total runtime cap for next scheduled occurrence.",
          )
        }
      >
        10 min cap next
      </button>
      <button
        type="button"
        className="panel-button mini"
        disabled={!rawSchedule}
        onClick={() => rawSchedule && onEditSchedule(rawSchedule)}
      >
        Edit
      </button>
      <button
        type="button"
        className="panel-button mini"
        disabled={!rawSchedule}
        onClick={() => rawSchedule && onDuplicateSchedule(rawSchedule)}
      >
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
          {workflowBusy === schedule.latestRunId ? "Opening" : (schedule.latestRunActionLabel ?? "Open latest run")}
        </button>
      )}
    </div>
  );
}
