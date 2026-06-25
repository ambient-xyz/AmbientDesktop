import type { Dispatch, SetStateAction } from "react";

import type { AutomationFolderSummary, AutomationScheduleExceptionSummary, AutomationScheduleSummary } from "../../shared/automationTypes";
import type { CreateAmbientPermissionGrantInput } from "../../shared/permissionTypes";
import type {
  OrchestrationTask,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowRecordingLibraryEntry,
  WorkflowRunLimitOverrides,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import { googleWorkspaceGrantTargetIdentityCondition } from "../../shared/googleWorkspaceGrantTargets";
import {
  type AutomationScheduleTargetSources,
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

export interface AutomationScheduleSeriesActionsInput {
  activeThreadId?: string;
  workspacePath: string;
  createPermissionGrantTargetHash: (
    actionKind: CreateAmbientPermissionGrantInput["actionKind"],
    targetKind: CreateAmbientPermissionGrantInput["targetKind"],
    targetLabel: string,
  ) => Promise<string>;
  scheduleTargetType: ScheduleTargetKind;
  scheduleTargetId: string;
  schedulePreset: AutomationSchedulePreset;
  scheduleExpression: string;
  scheduleEnabled: boolean;
  scheduleRunIdleTimeoutMs: number;
  scheduleRunTotalLimitMode: WorkflowRunTotalLimitMode;
  automationSchedules: AutomationScheduleSummary[];
  focusedScheduleId?: string;
  scheduleEditScope: WorkflowScheduleEditScopeId;
  setScheduleTarget: (targetKind: ScheduleTargetKind, targetId: string) => void;
  setAutomationSchedules: Dispatch<SetStateAction<AutomationScheduleSummary[]>>;
  setAutomationScheduleExceptions: Dispatch<SetStateAction<AutomationScheduleExceptionSummary[]>>;
  setFocusedScheduleId: Dispatch<SetStateAction<string | undefined>>;
  setScheduleTargetType: Dispatch<SetStateAction<ScheduleTargetKind>>;
  setScheduleTargetId: Dispatch<SetStateAction<string>>;
  setSchedulePreset: Dispatch<SetStateAction<AutomationSchedulePreset>>;
  setScheduleExpression: Dispatch<SetStateAction<string>>;
  setScheduleEnabled: Dispatch<SetStateAction<boolean>>;
  setScheduleRunIdleTimeoutMs: Dispatch<SetStateAction<number>>;
  setScheduleRunTotalLimitMode: Dispatch<SetStateAction<WorkflowRunTotalLimitMode>>;
  setScheduleEditScope: Dispatch<SetStateAction<WorkflowScheduleEditScopeId>>;
  setScheduleOccurrenceEditor: Dispatch<SetStateAction<WorkflowScheduleOccurrenceEditorState | undefined>>;
  setWorkflowSchedulePanel: Dispatch<SetStateAction<WorkflowSchedulePanelId>>;
  setScheduleBusy: Dispatch<SetStateAction<boolean>>;
  setScheduleError: Dispatch<SetStateAction<string | undefined>>;
}

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

export function workflowScheduleRunLimitOverridesForArtifact(
  settings: { idleTimeoutMs: number; totalLimitMode: WorkflowRunTotalLimitMode },
  artifact: Pick<WorkflowArtifactSummary, "manifest">,
): WorkflowRunLimitOverrides {
  return workflowRunLimitOverridesForSettings(settings, artifact.manifest);
}

export function createAutomationScheduleSeriesActions({
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
}: AutomationScheduleSeriesActionsInput) {
  function scheduleRunLimitsForArtifact(artifact: Pick<WorkflowArtifactSummary, "manifest">): WorkflowRunLimitOverrides {
    return workflowScheduleRunLimitOverridesForArtifact(
      {
        idleTimeoutMs: scheduleRunIdleTimeoutMs,
        totalLimitMode: scheduleRunTotalLimitMode,
      },
      artifact,
    );
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

  async function createWorkflowReviewSchedule(
    targetKind: "workflow_thread" | "workflow_version",
    targetId: string,
    artifact?: Pick<WorkflowArtifactSummary, "manifest">,
  ) {
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

  async function saveWorkflowSchedule(
    targetKind: "workflow_thread" | "workflow_version",
    targetId: string,
    artifact: Pick<WorkflowArtifactSummary, "manifest">,
  ) {
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

  async function createWorkflowScheduleGrantAction(
    thread: WorkflowAgentThreadSummary,
    action: WorkflowThreadScheduleGrantAction | undefined,
  ) {
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
    scheduleRunLimitsForArtifact,
    createAutomationSchedule,
    createWorkflowReviewSchedule,
    saveWorkflowSchedule,
    editAutomationSchedule,
    duplicateAutomationSchedule,
    createWorkflowScheduleGrantAction,
    createWorkflowScheduleGrant,
    editOccurrenceSeriesScope,
  };
}
