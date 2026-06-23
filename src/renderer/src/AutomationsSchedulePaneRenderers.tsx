import type { ReactNode } from "react";

import type { AutomationFolderSummary } from "../../shared/automationTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry, PermissionMode } from "../../shared/permissionTypes";
import type {
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowCompileProgress,
  WorkflowDashboard,
  WorkflowExecutionMode,
  WorkflowRunDetail,
  WorkflowRunLimitOverrides,
  WorkflowRunSummary,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { useAutomationScheduleController } from "./AutomationsScheduleController";
import { automationScheduleTargetSourcesModel } from "./AutomationsScheduleController";
import {
  AutomationSchedulesFallbackPane,
  WorkflowFocusedSchedulesPane,
  workflowSchedulesPaneRouteModel,
  type WorkflowFocusedSchedulesPaneActions,
  type WorkflowFocusedSchedulesPaneSlots,
} from "./AutomationsScheduleViews";
import { WorkflowRunCards } from "./AutomationsWorkflowRuntimeViews";
import type { AutomationPane } from "./AutomationsWorkspaceShellViews";

type AutomationsScheduleLocalTaskRenderers = {
  renderProjectField: () => ReactNode;
  renderAutoDispatchToggle: () => ReactNode;
  renderAutoDispatchStatus: () => ReactNode;
};

export type AutomationsScheduleControllerForRenderers = Pick<
  ReturnType<typeof useAutomationScheduleController>,
  | "automationSchedules"
  | "automationScheduleExceptions"
  | "clearFocusedSchedule"
  | "createAutomationSchedule"
  | "createNewWorkflowScheduleSeries"
  | "createWorkflowScheduleGrant"
  | "createWorkflowScheduleGrantAction"
  | "deferWorkflowScheduleOccurrence"
  | "duplicateAutomationSchedule"
  | "editAutomationSchedule"
  | "editOccurrenceSeriesScope"
  | "expandedScheduleHistoryId"
  | "focusScheduleHistory"
  | "focusedScheduleId"
  | "loadAutomationSchedules"
  | "openWorkflowScheduleOccurrenceEditor"
  | "saveWorkflowSchedule"
  | "saveWorkflowScheduleOccurrenceEditor"
  | "scheduleBusy"
  | "scheduleEditScope"
  | "scheduleEnabled"
  | "scheduleError"
  | "scheduleExpression"
  | "scheduleOccurrenceEditor"
  | "schedulePreset"
  | "scheduleRunIdleTimeoutMs"
  | "scheduleRunLimitsForArtifact"
  | "scheduleRunTotalLimitMode"
  | "scheduleTargetId"
  | "scheduleTargetType"
  | "setExpandedScheduleHistoryId"
  | "setScheduleEditScope"
  | "setScheduleEnabled"
  | "setScheduleExpression"
  | "setScheduleOccurrenceEditor"
  | "setSchedulePreset"
  | "setScheduleRunIdleTimeoutMs"
  | "setScheduleRunTotalLimitMode"
  | "setScheduleTarget"
  | "setScheduleTargetId"
  | "setScheduleTargetTypeAndClearId"
  | "setWorkflowSchedulePanel"
  | "skipWorkflowScheduleOccurrence"
  | "updateWorkflowScheduleOccurrenceRunLimits"
  | "workflowSchedulePanel"
>;

export type AutomationsSchedulePaneRenderersInput = {
  activeThreadId?: string;
  artifactById: ReadonlyMap<string, WorkflowArtifactSummary>;
  folders: AutomationFolderSummary[];
  localTaskPaneRenderers: AutomationsScheduleLocalTaskRenderers;
  orchestrationTasks: Parameters<typeof automationScheduleTargetSourcesModel>[0]["tasks"];
  permissionAudit: PermissionAuditEntry[];
  permissionGrants: AmbientPermissionGrant[];
  permissionMode: PermissionMode;
  renderWorkflowPersistentDiagramPane: (thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) => ReactNode;
  renderWorkflowSplitHandle: () => ReactNode;
  scheduleController: AutomationsScheduleControllerForRenderers;
  selectedWorkflowAgentArtifact?: WorkflowArtifactSummary;
  selectedWorkflowAgentDetail?: WorkflowRunDetail;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  tooltips: {
    autoDispatch: string;
    schedules: string;
  };
  workflowAgentFolders: WorkflowAgentFolderSummary[];
  workflowAgentThreadByArtifactId: ReadonlyMap<string, WorkflowAgentThreadSummary>;
  workflowAgentThreadById: ReadonlyMap<string, WorkflowAgentThreadSummary>;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowCompileThreadId?: string;
  workflowDashboard?: Pick<WorkflowDashboard, "artifacts" | "runs">;
  workflowDiscoveryBusy?: string;
  workflowDiscoveryLayoutStyle: WorkflowFocusedSchedulesPaneSlots["layoutStyle"];
  workflowRecordingLibrary: Parameters<typeof automationScheduleTargetSourcesModel>[0]["workflowRecordingLibrary"];
  workflowRunIdleTimeoutMs: number;
  workflowRunTotalLimitMode: Parameters<typeof WorkflowFocusedSchedulesPane>[0]["state"]["scheduleRunTotalLimitMode"];
  workflowBusy?: string;
  workflowVersions: WorkflowVersionSummary[];
  workspacePath: string;
  actions: {
    onOpenRunThread: (threadId: string, workspacePath?: string) => void | Promise<unknown>;
    onSelectPane: (pane: AutomationPane) => void;
    openWorkflowPersistentStatusTarget: WorkflowFocusedSchedulesPaneActions["onOpenPersistentStatusTarget"];
    openWorkflowRunDetail: (runId: string, options?: { focusConsole?: boolean }) => void | Promise<unknown>;
    runWorkflowArtifact: (
      artifactId: string,
      mode: WorkflowExecutionMode,
      options?: { resumeFromRunId?: string; allowUnapproved?: boolean; runLimits?: WorkflowRunLimitOverrides },
    ) => void | Promise<unknown>;
    workflowRunLimitOverridesForArtifact: (artifact: WorkflowArtifactSummary) => WorkflowRunLimitOverrides;
  };
};

export function createAutomationsSchedulePaneRenderers(input: AutomationsSchedulePaneRenderersInput) {
  const { scheduleController } = input;

  function automationScheduleTargetSources() {
    return automationScheduleTargetSourcesModel({
      workflowRecordingLibrary: input.workflowRecordingLibrary,
      workflowArtifacts: input.workflowDashboard?.artifacts ?? [],
      workflowAgentFolders: input.workflowAgentFolders,
      folders: input.folders,
      tasks: input.orchestrationTasks,
    });
  }

  function renderWorkflowRunCards(runs: WorkflowRunSummary[], limit = 6) {
    return (
      <WorkflowRunCards
        runs={runs}
        limit={limit}
        artifactById={input.artifactById}
        workflowBusy={input.workflowBusy}
        onOpenRunDetail={(runId) => void input.actions.openWorkflowRunDetail(runId, { focusConsole: true })}
        onOpenSchedule={(scheduleId) => {
          scheduleController.focusScheduleHistory(scheduleId);
          input.actions.onSelectPane("schedules");
        }}
        onResumeRun={(run, artifact) =>
          void input.actions.runWorkflowArtifact(artifact.id, "execute", {
            resumeFromRunId: run.id,
            allowUnapproved: artifact.status !== "approved",
            runLimits: input.actions.workflowRunLimitOverridesForArtifact(artifact),
          })
        }
      />
    );
  }

  function renderWorkflowSchedulesPane(thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) {
    return (
      <WorkflowFocusedSchedulesPane
        thread={thread}
        artifact={artifact}
        state={{
          activePanel: scheduleController.workflowSchedulePanel,
          versions: input.workflowVersions.filter((version) => version.workflowThreadId === thread.id),
          workflowRuns: input.workflowDashboard?.runs ?? [],
          selectedDetail: input.selectedWorkflowAgentDetail,
          schedules: scheduleController.automationSchedules,
          scheduleExceptions: scheduleController.automationScheduleExceptions,
          permissionGrants: input.permissionGrants,
          permissionAudit: input.permissionAudit,
          permissionMode: input.permissionMode,
          auditThreadId: input.activeThreadId,
          workspacePath: input.workspacePath,
          scheduleTargetType: scheduleController.scheduleTargetType,
          scheduleTargetId: scheduleController.scheduleTargetId,
          schedulePreset: scheduleController.schedulePreset,
          scheduleExpression: scheduleController.scheduleExpression,
          scheduleEnabled: scheduleController.scheduleEnabled,
          scheduleRunIdleTimeoutMs: scheduleController.scheduleRunIdleTimeoutMs,
          scheduleRunTotalLimitMode: scheduleController.scheduleRunTotalLimitMode,
          scheduleRunLimits: scheduleController.scheduleRunLimitsForArtifact(artifact),
          scheduleBusy: scheduleController.scheduleBusy,
          scheduleError: scheduleController.scheduleError,
          focusedScheduleId: scheduleController.focusedScheduleId,
          scheduleEditScope: scheduleController.scheduleEditScope,
          expandedScheduleHistoryId: scheduleController.expandedScheduleHistoryId,
          occurrenceEditor: scheduleController.scheduleOccurrenceEditor,
          workflowBusy: input.workflowBusy,
          workflowCompileThreadId: input.workflowCompileThreadId,
          workflowCompileProgress: input.workflowCompileProgress,
          workflowDiscoveryBusy: input.workflowDiscoveryBusy,
        }}
        slots={{
          layoutStyle: input.workflowDiscoveryLayoutStyle,
          splitHandle: input.renderWorkflowSplitHandle(),
          diagramPane: input.renderWorkflowPersistentDiagramPane(thread, artifact),
        }}
        actions={{
          onSetPanel: scheduleController.setWorkflowSchedulePanel,
          onCreateNewSeries: scheduleController.createNewWorkflowScheduleSeries,
          onSetScheduleTarget: scheduleController.setScheduleTarget,
          onSetSchedulePreset: scheduleController.setSchedulePreset,
          onSetScheduleExpression: scheduleController.setScheduleExpression,
          onSetScheduleEnabled: scheduleController.setScheduleEnabled,
          onSetScheduleRunIdleTimeoutMs: scheduleController.setScheduleRunIdleTimeoutMs,
          onSetScheduleRunTotalLimitMode: scheduleController.setScheduleRunTotalLimitMode,
          onSetScheduleEditScope: scheduleController.setScheduleEditScope,
          onSaveSchedule: (targetKind, targetId) => scheduleController.saveWorkflowSchedule(targetKind, targetId, artifact),
          onRefreshSchedules: scheduleController.loadAutomationSchedules,
          onSetExpandedScheduleHistoryId: scheduleController.setExpandedScheduleHistoryId,
          onCreateScheduleGrant: (schedule) => scheduleController.createWorkflowScheduleGrant(thread, schedule),
          onChangeOccurrenceEditor: scheduleController.setScheduleOccurrenceEditor,
          onCloseOccurrenceEditor: () => scheduleController.setScheduleOccurrenceEditor(undefined),
          onEditOccurrenceSeriesScope: scheduleController.editOccurrenceSeriesScope,
          onSaveOccurrenceEditor: scheduleController.saveWorkflowScheduleOccurrenceEditor,
          onSkipOccurrence: scheduleController.skipWorkflowScheduleOccurrence,
          onOpenOccurrenceEditor: scheduleController.openWorkflowScheduleOccurrenceEditor,
          onDeferOccurrence: scheduleController.deferWorkflowScheduleOccurrence,
          onUpdateOccurrenceRunLimits: scheduleController.updateWorkflowScheduleOccurrenceRunLimits,
          onEditSchedule: scheduleController.editAutomationSchedule,
          onDuplicateSchedule: scheduleController.duplicateAutomationSchedule,
          onOpenRunDetail: (runId) => void input.actions.openWorkflowRunDetail(runId, { focusConsole: true }),
          onCreateGrantAction: (action) => scheduleController.createWorkflowScheduleGrantAction(thread, action),
          onOpenPersistentStatusTarget: input.actions.openWorkflowPersistentStatusTarget,
        }}
      />
    );
  }

  function renderSchedulesPane() {
    const { workflowScheduleThread, workflowScheduleArtifact } = workflowSchedulesPaneRouteModel({
      selectedWorkflowThread: input.selectedWorkflowAgentThread,
      selectedWorkflowArtifact: input.selectedWorkflowAgentArtifact,
      focusedScheduleId: scheduleController.focusedScheduleId,
      schedules: scheduleController.automationSchedules,
      workflowVersions: input.workflowVersions,
      artifactById: input.artifactById,
      workflowThreadById: input.workflowAgentThreadById,
      workflowThreadByArtifactId: input.workflowAgentThreadByArtifactId,
    });
    if (workflowScheduleThread && workflowScheduleArtifact) {
      return renderWorkflowSchedulesPane(workflowScheduleThread, workflowScheduleArtifact);
    }
    return (
      <AutomationSchedulesFallbackPane
        projectField={input.localTaskPaneRenderers.renderProjectField()}
        autoDispatchToggle={input.localTaskPaneRenderers.renderAutoDispatchToggle()}
        autoDispatchStatus={input.localTaskPaneRenderers.renderAutoDispatchStatus()}
        scheduleTooltip={input.tooltips.schedules}
        autoDispatchTooltip={input.tooltips.autoDispatch}
        schedules={scheduleController.automationSchedules}
        focusedScheduleId={scheduleController.focusedScheduleId}
        scheduleTargetType={scheduleController.scheduleTargetType}
        scheduleTargetId={scheduleController.scheduleTargetId}
        targetSources={automationScheduleTargetSources()}
        schedulePreset={scheduleController.schedulePreset}
        scheduleExpression={scheduleController.scheduleExpression}
        scheduleEnabled={scheduleController.scheduleEnabled}
        scheduleBusy={scheduleController.scheduleBusy}
        scheduleError={scheduleController.scheduleError}
        expandedScheduleHistoryId={scheduleController.expandedScheduleHistoryId}
        workflowRuns={input.workflowDashboard?.runs ?? []}
        onScheduleTargetTypeChange={scheduleController.setScheduleTargetTypeAndClearId}
        onScheduleTargetIdChange={scheduleController.setScheduleTargetId}
        onSchedulePresetChange={scheduleController.setSchedulePreset}
        onScheduleExpressionChange={scheduleController.setScheduleExpression}
        onScheduleEnabledChange={scheduleController.setScheduleEnabled}
        onSaveSchedule={() => void scheduleController.createAutomationSchedule(automationScheduleTargetSources())}
        onRefreshSchedules={() => void scheduleController.loadAutomationSchedules()}
        onClearFocusedSchedule={scheduleController.clearFocusedSchedule}
        onToggleScheduleHistoryExpanded={scheduleController.setExpandedScheduleHistoryId}
        onOpenRunThread={(threadId) => void input.actions.onOpenRunThread(threadId)}
        onOpenRunDetail={(runId) => void input.actions.openWorkflowRunDetail(runId, { focusConsole: true })}
      />
    );
  }

  return {
    renderSchedulesPane,
    renderWorkflowRunCards,
    renderWorkflowSchedulesPane,
  };
}
