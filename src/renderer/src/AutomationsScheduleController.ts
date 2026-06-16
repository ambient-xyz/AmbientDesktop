import { useState } from "react";

import type {
  AutomationFolderSummary,
  AutomationScheduleExceptionSummary,
  AutomationScheduleSummary,
  CreateAmbientPermissionGrantInput,
  OrchestrationTask,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowRecordingLibraryEntry,
  WorkflowRunLimitOverrides,
  WorkflowVersionSummary,
} from "../../shared/types";
import { googleWorkspaceGrantTargetIdentityCondition } from "../../shared/googleWorkspaceGrantTargets";
import {
  type AutomationScheduleTargetSources,
  defaultScheduleReplacementLocal,
  isoFromDatetimeLocalValue,
  scheduleTargetOptionsForType,
  type WorkflowScheduleOccurrenceEditorState,
} from "./AutomationsScheduleViews";
import type { AutomationSchedulePreset } from "./automationUiModel";
import {
  type WorkflowScheduleEditScopeId,
  type WorkflowSchedulePanelId,
  type WorkflowThreadScheduleGrantAction,
  type WorkflowThreadScheduleItem,
} from "./workflowReviewUiModel";
import {
  DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS,
  DEFAULT_WORKFLOW_SCHEDULE_TOTAL_LIMIT_MODE,
  type WorkflowRunTotalLimitMode,
  workflowRunLimitOverridesForSettings,
} from "./workflowRunLimitsUiModel";

type ScheduleTargetKind = AutomationScheduleSummary["targetKind"];

export type AutomationScheduleControllerTargetSourcesInput = {
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

export type AutomationScheduleEditFormState = {
  focusedScheduleId?: string;
  scheduleTargetType: ScheduleTargetKind;
  scheduleTargetId: string;
  schedulePreset: AutomationSchedulePreset;
  scheduleExpression: string;
  scheduleEnabled: boolean;
  scheduleRunIdleTimeoutMs: number;
  scheduleRunTotalLimitMode: WorkflowRunTotalLimitMode;
  scheduleEditScope: WorkflowScheduleEditScopeId;
  workflowSchedulePanel: WorkflowSchedulePanelId;
};

export function automationScheduleTargetSourcesModel({
  workflowRecordingLibrary,
  workflowArtifacts,
  workflowAgentFolders,
  folders,
  tasks,
}: AutomationScheduleControllerTargetSourcesInput): AutomationScheduleTargetSources {
  return {
    workflowRecordingLibrary,
    workflowArtifacts,
    workflowAgentFolders,
    folders,
    tasks,
  };
}

export function automationScheduleTotalLimitMode(schedule: Pick<AutomationScheduleSummary, "runLimits">): WorkflowRunTotalLimitMode {
  return schedule.runLimits?.maxRunMs === null ? "disabled" : "manifest";
}

export function automationScheduleEditFormState(schedule: AutomationScheduleSummary, duplicate = false): AutomationScheduleEditFormState {
  return {
    focusedScheduleId: duplicate ? undefined : schedule.id,
    scheduleTargetType: schedule.targetKind,
    scheduleTargetId: schedule.targetId,
    schedulePreset: schedule.preset,
    scheduleExpression: schedule.cronExpression ?? "0 9 * * *",
    scheduleEnabled: schedule.enabled,
    scheduleRunIdleTimeoutMs: schedule.runLimits?.idleTimeoutMs ?? DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS,
    scheduleRunTotalLimitMode: automationScheduleTotalLimitMode(schedule),
    scheduleEditScope: "all_occurrences",
    workflowSchedulePanel: "schedules-overview",
  };
}

export function workflowScheduleOccurrenceEditorForSchedule(schedule: AutomationScheduleSummary): WorkflowScheduleOccurrenceEditorState | undefined {
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

export function workflowScheduleRunLimitOverridesForArtifact(
  settings: { idleTimeoutMs: number; totalLimitMode: WorkflowRunTotalLimitMode },
  artifact: Pick<WorkflowArtifactSummary, "manifest">,
): WorkflowRunLimitOverrides {
  return workflowRunLimitOverridesForSettings(settings, artifact.manifest);
}

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
  const [scheduleRunTotalLimitMode, setScheduleRunTotalLimitMode] = useState<WorkflowRunTotalLimitMode>(DEFAULT_WORKFLOW_SCHEDULE_TOTAL_LIMIT_MODE);
  const [automationSchedules, setAutomationSchedules] = useState<AutomationScheduleSummary[]>([]);
  const [automationScheduleExceptions, setAutomationScheduleExceptions] = useState<AutomationScheduleExceptionSummary[]>([]);
  const [focusedScheduleId, setFocusedScheduleId] = useState<string | undefined>();
  const [scheduleEditScope, setScheduleEditScope] = useState<WorkflowScheduleEditScopeId>("all_occurrences");
  const [scheduleOccurrenceEditor, setScheduleOccurrenceEditor] = useState<WorkflowScheduleOccurrenceEditorState | undefined>();
  const [workflowSchedulePanel, setWorkflowSchedulePanel] = useState<WorkflowSchedulePanelId>("schedules-overview");
  const [expandedScheduleHistoryId, setExpandedScheduleHistoryId] = useState<string | undefined>();
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | undefined>();

  function scheduleRunLimitsForArtifact(artifact: Pick<WorkflowArtifactSummary, "manifest">): WorkflowRunLimitOverrides {
    return workflowScheduleRunLimitOverridesForArtifact(
      {
        idleTimeoutMs: scheduleRunIdleTimeoutMs,
        totalLimitMode: scheduleRunTotalLimitMode,
      },
      artifact,
    );
  }

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

  function applyScheduleFixture(input: { schedules?: AutomationScheduleSummary[]; scheduleExceptions?: AutomationScheduleExceptionSummary[] }) {
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

  async function createAutomationSchedule(targetSources: AutomationScheduleTargetSources) {
    const targetOptions = scheduleTargetOptionsForType(scheduleTargetType, targetSources);
    const selectedTarget = targetOptions.find((target) => target.id === scheduleTargetId) ?? targetOptions[0];
    if (!selectedTarget) {
      setScheduleError("Choose a schedule target before saving.");
      return;
    }
    setScheduleBusy(true);
    setScheduleError(undefined);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
      setAutomationSchedules(
        await window.ambientDesktop.createAutomationSchedule({
          targetKind: scheduleTargetType,
          targetId: selectedTarget.id,
          preset: schedulePreset,
          cronExpression: schedulePreset === "advanced" ? scheduleExpression : undefined,
          timezone,
          enabled: scheduleEnabled,
          skipIfActive: true,
        }),
      );
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function createWorkflowReviewSchedule(targetKind: "workflow_thread" | "workflow_version", targetId: string, artifact?: Pick<WorkflowArtifactSummary, "manifest">) {
    setScheduleBusy(true);
    setScheduleError(undefined);
    setScheduleTarget(targetKind, targetId);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
      setAutomationSchedules(
        await window.ambientDesktop.createAutomationSchedule({
          targetKind,
          targetId,
          preset: schedulePreset,
          cronExpression: schedulePreset === "advanced" ? scheduleExpression : undefined,
          timezone,
          enabled: scheduleEnabled,
          skipIfActive: true,
          runLimits: artifact ? scheduleRunLimitsForArtifact(artifact) : undefined,
        }),
      );
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function saveWorkflowSchedule(targetKind: "workflow_thread" | "workflow_version", targetId: string, artifact: Pick<WorkflowArtifactSummary, "manifest">) {
    setScheduleBusy(true);
    setScheduleError(undefined);
    setScheduleTarget(targetKind, targetId);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
      const input = {
        targetKind,
        targetId,
        preset: schedulePreset,
        cronExpression: schedulePreset === "advanced" ? scheduleExpression : undefined,
        timezone,
        enabled: scheduleEnabled,
        skipIfActive: true,
        runLimits: scheduleRunLimitsForArtifact(artifact),
      };
      const nextSchedules = focusedScheduleId
        ? await window.ambientDesktop.updateAutomationSchedule({
            id: focusedScheduleId,
            editScope: scheduleEditScope,
            occurrenceAt: automationSchedules.find((schedule) => schedule.id === focusedScheduleId)?.nextRunAt,
            ...input,
          })
        : await window.ambientDesktop.createAutomationSchedule(input);
      setAutomationSchedules(nextSchedules);
      setAutomationScheduleExceptions(await window.ambientDesktop.listAutomationScheduleExceptions());
      if (!focusedScheduleId) {
        const created = nextSchedules.find((schedule) => schedule.targetKind === targetKind && schedule.targetId === targetId);
        if (created) setFocusedScheduleId(created.id);
      }
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  function applyScheduleEditForm(state: AutomationScheduleEditFormState) {
    setFocusedScheduleId(state.focusedScheduleId);
    setScheduleTargetType(state.scheduleTargetType);
    setScheduleTargetId(state.scheduleTargetId);
    setSchedulePreset(state.schedulePreset);
    setScheduleExpression(state.scheduleExpression);
    setScheduleEnabled(state.scheduleEnabled);
    setScheduleRunIdleTimeoutMs(state.scheduleRunIdleTimeoutMs);
    setScheduleRunTotalLimitMode(state.scheduleRunTotalLimitMode);
    setScheduleEditScope(state.scheduleEditScope);
    setWorkflowSchedulePanel(state.workflowSchedulePanel);
  }

  function editAutomationSchedule(schedule: AutomationScheduleSummary) {
    applyScheduleEditForm(automationScheduleEditFormState(schedule));
  }

  function duplicateAutomationSchedule(schedule: AutomationScheduleSummary) {
    applyScheduleEditForm(automationScheduleEditFormState(schedule, true));
  }

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
      setAutomationScheduleExceptions(await window.ambientDesktop.listAutomationScheduleExceptions());
      setScheduleOccurrenceEditor((current) => (current?.scheduleId === schedule.id ? undefined : current));
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
      setAutomationScheduleExceptions(await window.ambientDesktop.listAutomationScheduleExceptions());
      setScheduleOccurrenceEditor((current) => (current?.scheduleId === schedule.id ? undefined : current));
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
      setAutomationScheduleExceptions(await window.ambientDesktop.listAutomationScheduleExceptions());
      setScheduleOccurrenceEditor(undefined);
    } catch (scheduleError) {
      setScheduleError(scheduleError instanceof Error ? scheduleError.message : String(scheduleError));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function updateWorkflowScheduleOccurrenceRunLimits(schedule: AutomationScheduleSummary, runLimits: WorkflowRunLimitOverrides, reason: string) {
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
      setAutomationScheduleExceptions(await window.ambientDesktop.listAutomationScheduleExceptions());
      setScheduleOccurrenceEditor((current) => (current?.scheduleId === schedule.id ? undefined : current));
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function createWorkflowScheduleGrantAction(thread: WorkflowAgentThreadSummary, action: WorkflowThreadScheduleGrantAction | undefined) {
    if (!action) return;
    setScheduleBusy(true);
    setScheduleError(undefined);
    try {
      const targetIdentity = action.targetIdentity ?? action.targetLabel;
      const targetHash = await createPermissionGrantTargetHash("connector_content_read", "connector", targetIdentity);
      const input: CreateAmbientPermissionGrantInput = {
        permissionModeAtCreation: "workspace",
        scopeKind: action.scopeKind,
        threadId: activeThreadId,
        workflowThreadId: thread.id,
        projectPath: thread.projectPath,
        workspacePath,
        actionKind: "connector_content_read",
        targetKind: "connector",
        targetHash,
        targetLabel: action.targetLabel,
        conditions: {
          scheduledWorkflow: true,
          connectorId: action.connectorId,
          operation: action.operation,
          accountId: action.accountId,
          ...(action.targetIdentity ? { [googleWorkspaceGrantTargetIdentityCondition]: action.targetIdentity } : {}),
        },
        source: "workflow_review",
        reason: action.reason,
      };
      await window.ambientDesktop.createPermissionGrant(input);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function createWorkflowScheduleGrant(thread: WorkflowAgentThreadSummary, schedule: WorkflowThreadScheduleItem) {
    await createWorkflowScheduleGrantAction(thread, schedule.grantAction);
  }

  function editOccurrenceSeriesScope(schedule: AutomationScheduleSummary, scope: WorkflowScheduleEditScopeId) {
    editAutomationSchedule(schedule);
    setScheduleEditScope(scope);
    setScheduleOccurrenceEditor(undefined);
  }

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
