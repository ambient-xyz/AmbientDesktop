import type { Dispatch, SetStateAction } from "react";

import type { AutomationScheduleExceptionSummary, AutomationScheduleSummary } from "../../shared/automationTypes";
import type { WorkflowRunLimitOverrides } from "../../shared/workflowTypes";
import {
  defaultScheduleReplacementLocal,
  isoFromDatetimeLocalValue,
  type WorkflowScheduleOccurrenceEditorState,
} from "./AutomationsScheduleViews";
import type { WorkflowSchedulePanelId } from "./workflowReviewUiModel";

interface AutomationScheduleOccurrenceActionsInput {
  scheduleOccurrenceEditor: WorkflowScheduleOccurrenceEditorState | undefined;
  setAutomationSchedules: Dispatch<SetStateAction<AutomationScheduleSummary[]>>;
  setAutomationScheduleExceptions: Dispatch<SetStateAction<AutomationScheduleExceptionSummary[]>>;
  setScheduleOccurrenceEditor: Dispatch<SetStateAction<WorkflowScheduleOccurrenceEditorState | undefined>>;
  setExpandedScheduleHistoryId: Dispatch<SetStateAction<string | undefined>>;
  setWorkflowSchedulePanel: Dispatch<SetStateAction<WorkflowSchedulePanelId>>;
  setScheduleBusy: Dispatch<SetStateAction<boolean>>;
  setScheduleError: Dispatch<SetStateAction<string | undefined>>;
}

export function workflowScheduleOccurrenceEditorForSchedule(
  schedule: AutomationScheduleSummary,
): WorkflowScheduleOccurrenceEditorState | undefined {
  if (!schedule.nextRunAt) return undefined;
  return {
    scheduleId: schedule.id,
    occurrenceAt: schedule.nextRunAt,
    replacementLocal: defaultScheduleReplacementLocal(schedule.nextRunAt, 60),
    reason: "Rescheduled from Workflow Agent schedule history.",
  };
}

export function workflowScheduleOccurrenceReplacementError(editor: WorkflowScheduleOccurrenceEditorState): string | undefined {
  const replacementRunAt = isoFromDatetimeLocalValue(editor.replacementLocal);
  if (!replacementRunAt) return "Choose a valid replacement date and time.";
  if (replacementRunAt === editor.occurrenceAt) return "Choose a replacement time that differs from the current occurrence.";
  return undefined;
}

export function createAutomationScheduleOccurrenceActions({
  scheduleOccurrenceEditor,
  setAutomationSchedules,
  setAutomationScheduleExceptions,
  setScheduleOccurrenceEditor,
  setExpandedScheduleHistoryId,
  setWorkflowSchedulePanel,
  setScheduleBusy,
  setScheduleError,
}: AutomationScheduleOccurrenceActionsInput) {
  const refreshScheduleExceptions = async () => {
    setAutomationScheduleExceptions(await window.ambientDesktop.listAutomationScheduleExceptions());
  };

  const clearScheduleOccurrenceEditorForSchedule = (scheduleId: string) => {
    setScheduleOccurrenceEditor((current) => (current?.scheduleId === scheduleId ? undefined : current));
  };

  async function skipWorkflowScheduleOccurrence(schedule: AutomationScheduleSummary) {
    setScheduleBusy(true);
    setScheduleError(undefined);
    try {
      const result = await window.ambientDesktop.skipAutomationScheduleOccurrence({
        scheduleId: schedule.id,
        occurrenceAt: schedule.nextRunAt,
        reason: "Skipped from Workflow Agent schedule history.",
      });
      setAutomationSchedules(result.schedules);
      await refreshScheduleExceptions();
      clearScheduleOccurrenceEditorForSchedule(schedule.id);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function deferWorkflowScheduleOccurrence(schedule: AutomationScheduleSummary, minutes: number) {
    if (!schedule.nextRunAt) return;
    const replacement = new Date(new Date(schedule.nextRunAt).getTime() + minutes * 60_000);
    setScheduleBusy(true);
    setScheduleError(undefined);
    try {
      const result = await window.ambientDesktop.rescheduleAutomationScheduleOccurrence({
        scheduleId: schedule.id,
        occurrenceAt: schedule.nextRunAt,
        replacementRunAt: replacement.toISOString(),
        reason: `Deferred ${minutes} minute${minutes === 1 ? "" : "s"} from Workflow Agent schedule history.`,
      });
      setAutomationSchedules(result.schedules);
      await refreshScheduleExceptions();
      clearScheduleOccurrenceEditorForSchedule(schedule.id);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  function openWorkflowScheduleOccurrenceEditor(schedule: AutomationScheduleSummary) {
    const editor = workflowScheduleOccurrenceEditorForSchedule(schedule);
    if (!editor) return;
    setScheduleOccurrenceEditor(editor);
    setExpandedScheduleHistoryId(schedule.id);
    setWorkflowSchedulePanel("schedules-history");
  }

  async function saveWorkflowScheduleOccurrenceEditor() {
    if (!scheduleOccurrenceEditor) return;
    const error = workflowScheduleOccurrenceReplacementError(scheduleOccurrenceEditor);
    if (error) {
      setScheduleError(error);
      return;
    }
    const replacementRunAt = isoFromDatetimeLocalValue(scheduleOccurrenceEditor.replacementLocal);
    if (!replacementRunAt) return;
    setScheduleBusy(true);
    setScheduleError(undefined);
    try {
      const result = await window.ambientDesktop.rescheduleAutomationScheduleOccurrence({
        scheduleId: scheduleOccurrenceEditor.scheduleId,
        occurrenceAt: scheduleOccurrenceEditor.occurrenceAt,
        replacementRunAt,
        reason: scheduleOccurrenceEditor.reason.trim() || "Rescheduled from Workflow Agent schedule history.",
      });
      setAutomationSchedules(result.schedules);
      await refreshScheduleExceptions();
      setScheduleOccurrenceEditor(undefined);
    } catch (scheduleError) {
      setScheduleError(scheduleError instanceof Error ? scheduleError.message : String(scheduleError));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function updateWorkflowScheduleOccurrenceRunLimits(
    schedule: AutomationScheduleSummary,
    runLimits: WorkflowRunLimitOverrides,
    reason: string,
  ) {
    if (!schedule.nextRunAt) return;
    setScheduleBusy(true);
    setScheduleError(undefined);
    try {
      const result = await window.ambientDesktop.updateAutomationScheduleOccurrenceRunLimits({
        scheduleId: schedule.id,
        occurrenceAt: schedule.nextRunAt,
        runLimits,
        reason,
      });
      setAutomationSchedules(result.schedules);
      await refreshScheduleExceptions();
      clearScheduleOccurrenceEditorForSchedule(schedule.id);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  return {
    skipWorkflowScheduleOccurrence,
    deferWorkflowScheduleOccurrence,
    openWorkflowScheduleOccurrenceEditor,
    saveWorkflowScheduleOccurrenceEditor,
    updateWorkflowScheduleOccurrenceRunLimits,
  };
}
