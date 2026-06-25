import { useState } from "react";

import type { AutomationScheduleExceptionSummary, AutomationScheduleSummary } from "../../shared/automationTypes";
import type { CreateAmbientPermissionGrantInput } from "../../shared/permissionTypes";
import { createAutomationScheduleOccurrenceActions } from "./AutomationsScheduleOccurrenceActions";
import { createAutomationScheduleSeriesActions } from "./AutomationsScheduleSeriesActions";
import type { WorkflowScheduleOccurrenceEditorState } from "./AutomationsScheduleViews";
import type { AutomationSchedulePreset } from "./automationUiModel";
import type { WorkflowScheduleEditScopeId, WorkflowSchedulePanelId } from "./workflowReviewUiModel";
import {
  DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS,
  DEFAULT_WORKFLOW_SCHEDULE_TOTAL_LIMIT_MODE,
  type WorkflowRunTotalLimitMode,
} from "./workflowRunLimitsUiModel";

export {
  workflowScheduleOccurrenceEditorForSchedule,
  workflowScheduleOccurrenceReplacementError,
} from "./AutomationsScheduleOccurrenceActions";
export {
  automationScheduleEditFormState,
  type AutomationScheduleControllerTargetSourcesInput,
  type AutomationScheduleEditFormState,
  automationScheduleTargetSourcesModel,
  automationScheduleTotalLimitMode,
  workflowScheduleRunLimitOverridesForArtifact,
} from "./AutomationsScheduleSeriesActions";

type ScheduleTargetKind = AutomationScheduleSummary["targetKind"];

export function useAutomationScheduleController({
  activeThreadId,
  workspacePath,
  createPermissionGrantTargetHash,
}: {
  activeThreadId?: string;
  workspacePath: string;
  createPermissionGrantTargetHash: (
    actionKind: CreateAmbientPermissionGrantInput["actionKind"],
    targetKind: CreateAmbientPermissionGrantInput["targetKind"],
    targetLabel: string,
  ) => Promise<string>;
}) {
  const [scheduleTargetType, setScheduleTargetType] = useState<ScheduleTargetKind>("local_task");
  const [scheduleTargetId, setScheduleTargetId] = useState("");
  const [schedulePreset, setSchedulePreset] = useState<AutomationSchedulePreset>("daily");
  const [scheduleExpression, setScheduleExpression] = useState("0 9 * * *");
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleRunIdleTimeoutMs, setScheduleRunIdleTimeoutMs] = useState(DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS);
  const [scheduleRunTotalLimitMode, setScheduleRunTotalLimitMode] = useState<WorkflowRunTotalLimitMode>(
    DEFAULT_WORKFLOW_SCHEDULE_TOTAL_LIMIT_MODE,
  );
  const [automationSchedules, setAutomationSchedules] = useState<AutomationScheduleSummary[]>([]);
  const [automationScheduleExceptions, setAutomationScheduleExceptions] = useState<AutomationScheduleExceptionSummary[]>([]);
  const [focusedScheduleId, setFocusedScheduleId] = useState<string | undefined>();
  const [scheduleEditScope, setScheduleEditScope] = useState<WorkflowScheduleEditScopeId>("all_occurrences");
  const [scheduleOccurrenceEditor, setScheduleOccurrenceEditor] = useState<WorkflowScheduleOccurrenceEditorState | undefined>();
  const [workflowSchedulePanel, setWorkflowSchedulePanel] = useState<WorkflowSchedulePanelId>("schedules-overview");
  const [expandedScheduleHistoryId, setExpandedScheduleHistoryId] = useState<string | undefined>();
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | undefined>();

  async function loadAutomationSchedules() {
    setScheduleError(undefined);
    try {
      const [schedules, exceptions] = await Promise.all([
        window.ambientDesktop.listAutomationSchedules(),
        window.ambientDesktop.listAutomationScheduleExceptions(),
      ]);
      setAutomationSchedules(schedules);
      setAutomationScheduleExceptions(exceptions);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    }
  }

  function applyScheduleFixture(input: {
    schedules?: AutomationScheduleSummary[];
    scheduleExceptions?: AutomationScheduleExceptionSummary[];
  }) {
    if (input.schedules) setAutomationSchedules(input.schedules);
    if (input.scheduleExceptions) setAutomationScheduleExceptions(input.scheduleExceptions);
  }

  function createNewWorkflowScheduleSeries() {
    setFocusedScheduleId(undefined);
    setScheduleEditScope("all_occurrences");
    setScheduleRunIdleTimeoutMs(DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS);
    setScheduleRunTotalLimitMode(DEFAULT_WORKFLOW_SCHEDULE_TOTAL_LIMIT_MODE);
  }

  function setScheduleTarget(targetKind: ScheduleTargetKind, targetId: string) {
    setScheduleTargetType(targetKind);
    setScheduleTargetId(targetId);
  }

  function setScheduleTargetTypeAndClearId(targetKind: ScheduleTargetKind) {
    setScheduleTargetType(targetKind);
    setScheduleTargetId("");
  }

  function focusScheduleHistory(scheduleId: string) {
    setFocusedScheduleId(scheduleId);
    setWorkflowSchedulePanel("schedules-history");
  }

  function clearFocusedSchedule() {
    setFocusedScheduleId(undefined);
  }

  const {
    scheduleRunLimitsForArtifact,
    createAutomationSchedule,
    createWorkflowReviewSchedule,
    saveWorkflowSchedule,
    editAutomationSchedule,
    duplicateAutomationSchedule,
    createWorkflowScheduleGrantAction,
    createWorkflowScheduleGrant,
    editOccurrenceSeriesScope,
  } = createAutomationScheduleSeriesActions({
    activeThreadId,
    workspacePath,
    createPermissionGrantTargetHash,
    scheduleTargetType,
    scheduleTargetId,
    schedulePreset,
    scheduleExpression,
    scheduleEnabled,
    scheduleRunIdleTimeoutMs,
    scheduleRunTotalLimitMode,
    automationSchedules,
    focusedScheduleId,
    scheduleEditScope,
    setScheduleTarget,
    setAutomationSchedules,
    setAutomationScheduleExceptions,
    setFocusedScheduleId,
    setScheduleTargetType,
    setScheduleTargetId,
    setSchedulePreset,
    setScheduleExpression,
    setScheduleEnabled,
    setScheduleRunIdleTimeoutMs,
    setScheduleRunTotalLimitMode,
    setScheduleEditScope,
    setScheduleOccurrenceEditor,
    setWorkflowSchedulePanel,
    setScheduleBusy,
    setScheduleError,
  });

  const {
    skipWorkflowScheduleOccurrence,
    deferWorkflowScheduleOccurrence,
    openWorkflowScheduleOccurrenceEditor,
    saveWorkflowScheduleOccurrenceEditor,
    updateWorkflowScheduleOccurrenceRunLimits,
  } = createAutomationScheduleOccurrenceActions({
    scheduleOccurrenceEditor,
    setAutomationSchedules,
    setAutomationScheduleExceptions,
    setScheduleOccurrenceEditor,
    setExpandedScheduleHistoryId,
    setWorkflowSchedulePanel,
    setScheduleBusy,
    setScheduleError,
  });

  return {
    scheduleTargetType,
    scheduleTargetId,
    schedulePreset,
    scheduleExpression,
    scheduleEnabled,
    scheduleRunIdleTimeoutMs,
    scheduleRunTotalLimitMode,
    automationSchedules,
    automationScheduleExceptions,
    focusedScheduleId,
    scheduleEditScope,
    scheduleOccurrenceEditor,
    workflowSchedulePanel,
    expandedScheduleHistoryId,
    scheduleBusy,
    scheduleError,
    setScheduleTargetId,
    setSchedulePreset,
    setScheduleExpression,
    setScheduleEnabled,
    setScheduleRunIdleTimeoutMs,
    setScheduleRunTotalLimitMode,
    setScheduleEditScope,
    setWorkflowSchedulePanel,
    setExpandedScheduleHistoryId,
    setScheduleOccurrenceEditor,
    loadAutomationSchedules,
    applyScheduleFixture,
    createNewWorkflowScheduleSeries,
    setScheduleTarget,
    setScheduleTargetTypeAndClearId,
    focusScheduleHistory,
    clearFocusedSchedule,
    createAutomationSchedule,
    createWorkflowReviewSchedule,
    saveWorkflowSchedule,
    scheduleRunLimitsForArtifact,
    editAutomationSchedule,
    duplicateAutomationSchedule,
    skipWorkflowScheduleOccurrence,
    deferWorkflowScheduleOccurrence,
    openWorkflowScheduleOccurrenceEditor,
    saveWorkflowScheduleOccurrenceEditor,
    updateWorkflowScheduleOccurrenceRunLimits,
    createWorkflowScheduleGrantAction,
    createWorkflowScheduleGrant,
    editOccurrenceSeriesScope,
  };
}
