import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";

import type {
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowCompileProgress,
  WorkflowLabRun,
  WorkflowRecordingLibraryEntry,
  WorkflowRevisionSummary,
} from "../../shared/workflowTypes";
import { WorkflowLabPlaybookLibrarySection, WorkflowRecordingPlaybookPane } from "./AutomationsWorkflowPlaybookViews";
import { WorkflowCompileActivity } from "./AutomationsWorkflowReviewViews";
import { WorkflowAgentCompilerStartPane, WorkflowLegacyHiddenPane, WorkflowRecorderStartPane } from "./AutomationsWorkflowUtilityViews";
import { WorkflowAgentPaneRouter, type AutomationPane } from "./AutomationsWorkspaceShellViews";
import { workflowCompileActionState } from "./automationUiModel";
import type { ApiKeyStatus } from "./RightPanel";
import { activeDraftWorkflowRevisionForThread } from "./AutomationsWorkflowDiscoveryController";
import type { WorkflowLabBusy } from "./AutomationsWorkflowLabViews";
import { workflowRecorderStartActionState } from "./workflowRecorderUiModel";

type WorkflowRecorderSurfaceForAgentPanes = {
  disabledStartTitle: string;
  legacyCompilerEnabled: boolean;
  legacyHidden: Parameters<typeof WorkflowLegacyHiddenPane>[0]["hidden"];
  primaryCreateLabel: string;
  startPane: Parameters<typeof WorkflowRecorderStartPane>[0]["recorder"];
  workflowAgentTooltip: string;
  workflowLabTooltip: string;
};

type AutomationsWorkflowAgentPaneLocalRenderers = {
  renderProjectField: () => ReactNode;
};

export type AutomationsWorkflowAgentPaneRenderersInput = {
  localTaskPaneRenderers: AutomationsWorkflowAgentPaneLocalRenderers;
  selectedWorkflowAgentArtifact?: WorkflowArtifactSummary;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  selectedWorkflowRecording?: WorkflowRecordingLibraryEntry;
  surface: WorkflowRecorderSurfaceForAgentPanes;
  workflowBusy?: string;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowDiscoveryBusy?: string;
  workflowError?: string;
  workflowLabBusy?: WorkflowLabBusy;
  workflowLabGoal: string;
  workflowLabRun?: WorkflowLabRun;
  workflowLabStatus?: ApiKeyStatus;
  workflowRecordingExportBusyThreadId?: string;
  workflowRecordingExportStatus?: ApiKeyStatus;
  workflowRecordingLibrary: WorkflowRecordingLibraryEntry[];
  workflowRequest: string;
  workflowRequestRef: RefObject<HTMLTextAreaElement | null>;
  workflowRevisions: WorkflowRevisionSummary[];
  workflowRevisionSource?: { title: string };
  clearFocusedSchedule: () => void;
  clearWorkflowRevisionDraft: () => void;
  compileWorkflowPreview: () => void | Promise<void>;
  copyWorkflowCompileFailureReport: (reportText: string) => void | Promise<void>;
  createWorkflowLabRunForPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void | Promise<void>;
  createWorkflowSample: () => void | Promise<void>;
  exportWorkflowRecordingPlaybookSession: (playbook: WorkflowRecordingLibraryEntry) => void | Promise<void>;
  focusWorkflowRequestEditor: () => void;
  loadWorkflowDashboard: () => void | Promise<void>;
  onArchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void | Promise<void>;
  onEditWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  openWorkflowCompileDiagnostics: (path: string) => void | Promise<void>;
  onPreviewLocalPath: (path: string) => void;
  onRestoreWorkflowRecordingVersion: (id: string, version: number) => void | Promise<void>;
  onSelectPane: (pane: AutomationPane) => void;
  onSelectWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onSetWorkflowRecordingEnabled: (id: string, enabled: boolean) => void | Promise<void>;
  onStartWorkflowRecording: (goal: string) => Promise<boolean>;
  onUnarchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void | Promise<void>;
  renderWorkflowDiscoveryThread: (thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) => ReactNode;
  renderWorkflowThreadDetail: (thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) => ReactNode;
  setScheduleTarget: (targetKind: "workflow_playbook", targetId: string) => void;
  setWorkflowBusy: Dispatch<SetStateAction<string | undefined>>;
  setWorkflowError: Dispatch<SetStateAction<string | undefined>>;
  setWorkflowLabGoal: (goal: string) => void;
  setWorkflowRequest: Dispatch<SetStateAction<string>>;
  startWorkflowDiscoveryFromRequest: () => void | Promise<void>;
  startWorkflowLabRun: () => void | Promise<void>;
  stopWorkflowLabRun: () => void | Promise<void>;
  adoptWorkflowLabBestVariant: () => void | Promise<void>;
};

export function createAutomationsWorkflowAgentPaneRenderers(input: AutomationsWorkflowAgentPaneRenderersInput) {
  function renderWorkflowRecorderStartPane() {
    const recorderStartBusy = input.workflowBusy === "recorder:start";
    const recorderStartAction = workflowRecorderStartActionState({
      request: input.workflowRequest,
      busy: recorderStartBusy,
      readyTitle: input.surface.disabledStartTitle,
    });
    const startRecordingFromPane = async () => {
      if (recorderStartAction.needsRequest) {
        input.setWorkflowError(recorderStartAction.title);
        input.workflowRequestRef.current?.focus();
        return;
      }
      input.setWorkflowBusy("recorder:start");
      input.setWorkflowError(undefined);
      try {
        const started = await input.onStartWorkflowRecording(input.workflowRequest);
        if (started) input.setWorkflowRequest("");
      } catch (err) {
        input.setWorkflowError(err instanceof Error ? err.message : String(err));
      } finally {
        input.setWorkflowBusy(undefined);
      }
    };
    return (
      <WorkflowRecorderStartPane
        recorder={input.surface.startPane}
        workflowAgentTooltip={input.surface.workflowAgentTooltip}
        workflowRequest={input.workflowRequest}
        workflowError={input.workflowError}
        recorderStartBusy={recorderStartBusy}
        recorderStartAction={recorderStartAction}
        projectField={input.localTaskPaneRenderers.renderProjectField()}
        requestTextareaRef={input.workflowRequestRef}
        onWorkflowRequestChange={input.setWorkflowRequest}
        onStartRecording={startRecordingFromPane}
      />
    );
  }

  function renderLegacyWorkflowHiddenPane(thread: WorkflowAgentThreadSummary) {
    return (
      <WorkflowLegacyHiddenPane
        thread={thread}
        hidden={input.surface.legacyHidden}
        primaryCreateLabel={input.surface.primaryCreateLabel}
        workflowAgentTooltip={input.surface.workflowAgentTooltip}
      />
    );
  }

  function renderWorkflowRecordingPlaybookPane(playbook: WorkflowRecordingLibraryEntry) {
    return (
      <WorkflowRecordingPlaybookPane
        playbook={playbook}
        workflowRecordingExportBusyThreadId={input.workflowRecordingExportBusyThreadId}
        workflowRecordingExportStatus={input.workflowRecordingExportStatus}
        workflowLabRun={input.workflowLabRun}
        workflowLabBusy={input.workflowLabBusy}
        workflowLabGoal={input.workflowLabGoal}
        workflowLabStatus={input.workflowLabStatus}
        onEditWorkflowRecordingPlaybook={input.onEditWorkflowRecordingPlaybook}
        onPreviewLocalPath={input.onPreviewLocalPath}
        onExportWorkflowRecordingPlaybookSession={input.exportWorkflowRecordingPlaybookSession}
        onRestoreWorkflowRecordingVersion={input.onRestoreWorkflowRecordingVersion}
        onSchedulePlaybook={(entry) => {
          input.clearFocusedSchedule();
          input.setScheduleTarget("workflow_playbook", entry.id);
          input.onSelectPane("schedules");
        }}
        onSetWorkflowRecordingEnabled={input.onSetWorkflowRecordingEnabled}
        onUnarchiveWorkflowRecordingPlaybook={input.onUnarchiveWorkflowRecordingPlaybook}
        onArchiveWorkflowRecordingPlaybook={input.onArchiveWorkflowRecordingPlaybook}
        onWorkflowLabGoalChange={input.setWorkflowLabGoal}
        onCreateWorkflowLabRun={(entry) => void input.createWorkflowLabRunForPlaybook(entry)}
        onStartWorkflowLabRun={() => void input.startWorkflowLabRun()}
        onStopWorkflowLabRun={() => void input.stopWorkflowLabRun()}
        onAdoptWorkflowLabBestVariant={() => void input.adoptWorkflowLabBestVariant()}
      />
    );
  }

  function renderWorkflowAgentCompilerStartPane() {
    const compileAction = workflowCompileActionState({
      request: input.workflowRequest,
      compiling: input.workflowBusy === "compile",
      blocked: Boolean(input.workflowBusy) && input.workflowBusy !== "compile",
    });
    const discoveryDisabled = !input.workflowRequest.trim() || Boolean(input.workflowDiscoveryBusy) || Boolean(input.workflowBusy);

    return (
      <WorkflowAgentCompilerStartPane
        workflowRequest={input.workflowRequest}
        workflowError={input.workflowError}
        workflowBusy={input.workflowBusy}
        workflowAgentTooltip={input.surface.workflowAgentTooltip}
        startDiscoveryBusy={input.workflowDiscoveryBusy === "start"}
        discoveryDisabled={discoveryDisabled}
        compileAction={compileAction}
        revisionSourceTitle={input.workflowRevisionSource?.title}
        projectField={input.localTaskPaneRenderers.renderProjectField()}
        compileActivity={
          <WorkflowCompileActivity
            active={input.workflowBusy === "compile"}
            progress={input.workflowCompileProgress}
            onRetrySameContext={() => void input.compileWorkflowPreview()}
            onOpenDiagnostics={(path) => void input.openWorkflowCompileDiagnostics(path)}
            onEditRequest={input.focusWorkflowRequestEditor}
            onReportUnsupported={(reportText) => void input.copyWorkflowCompileFailureReport(reportText)}
          />
        }
        requestTextareaRef={input.workflowRequestRef}
        onWorkflowRequestChange={input.setWorkflowRequest}
        onRefreshDashboard={input.loadWorkflowDashboard}
        onCreateSample={input.createWorkflowSample}
        onStartDiscovery={input.startWorkflowDiscoveryFromRequest}
        onCompile={input.compileWorkflowPreview}
        onClearRevision={input.clearWorkflowRevisionDraft}
      />
    );
  }

  function renderWorkflowAgentPane() {
    const selectedDraftRevision = activeDraftWorkflowRevisionForThread(input.workflowRevisions, input.selectedWorkflowAgentThread?.id);
    return (
      <WorkflowAgentPaneRouter
        legacyCompilerEnabled={input.surface.legacyCompilerEnabled}
        selectedWorkflowRecordingActive={Boolean(input.selectedWorkflowRecording)}
        selectedWorkflowAgentThread={input.selectedWorkflowAgentThread}
        selectedDraftRevisionActive={Boolean(selectedDraftRevision)}
        renderWorkflowRecordingPlaybookPane={() =>
          input.selectedWorkflowRecording ? renderWorkflowRecordingPlaybookPane(input.selectedWorkflowRecording) : null
        }
        renderLegacyWorkflowHiddenPane={() =>
          input.selectedWorkflowAgentThread ? renderLegacyWorkflowHiddenPane(input.selectedWorkflowAgentThread) : null
        }
        renderWorkflowRecorderStartPane={renderWorkflowRecorderStartPane}
        renderWorkflowDiscoveryThread={() =>
          input.selectedWorkflowAgentThread
            ? input.renderWorkflowDiscoveryThread(input.selectedWorkflowAgentThread, selectedDraftRevision)
            : null
        }
        renderWorkflowThreadDetail={() =>
          input.selectedWorkflowAgentThread
            ? input.renderWorkflowThreadDetail(input.selectedWorkflowAgentThread, input.selectedWorkflowAgentArtifact)
            : null
        }
        renderWorkflowAgentCompilerStartPane={renderWorkflowAgentCompilerStartPane}
      />
    );
  }

  function renderWorkflowLabHomePane() {
    return (
      <WorkflowLabPlaybookLibrarySection
        playbooks={input.workflowRecordingLibrary}
        headingTooltip={input.surface.workflowLabTooltip}
        onNewRecording={() => input.onSelectPane("workflow_agent")}
        onOpenPlaybook={input.onSelectWorkflowRecordingPlaybook}
        onPreviewLocalPath={input.onPreviewLocalPath}
      />
    );
  }

  return {
    renderLegacyWorkflowHiddenPane,
    renderWorkflowAgentCompilerStartPane,
    renderWorkflowAgentPane,
    renderWorkflowLabHomePane,
    renderWorkflowRecorderStartPane,
    renderWorkflowRecordingPlaybookPane,
  };
}
