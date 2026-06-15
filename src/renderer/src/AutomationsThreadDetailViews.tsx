import { LoaderCircle } from "lucide-react";

import type {
  AutomationFolderSummary,
  AutomationRunSummary,
  AutomationThreadSummary,
  OrchestrationRun,
  OrchestrationTask,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
} from "../../shared/types";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { ProofOfWorkPreview } from "./AutomationsProofPreviewViews";
import {
  formatOrchestrationRunStatus,
  orchestrationRunActionLabel,
  RunTimeline,
} from "./AutomationsRunHistory";
import { taskStateOptions, taskUserLabels } from "./AutomationsLocalTaskBoard";
import { formatTaskState } from "./RightPanel";
import type { WorkflowArtifactThreadRoute } from "./workflowThreadFirstUiModel";

export type AutomationSelectedThreadDetailViewProps = {
  selectedThread: AutomationThreadSummary;
  folders: AutomationFolderSummary[];
  selectedAutomationRun?: AutomationRunSummary;
  selectedArtifact?: WorkflowArtifactSummary;
  selectedArtifactThreadRoute?: WorkflowArtifactThreadRoute;
  selectedArtifactWorkflowThread?: WorkflowAgentThreadSummary;
  selectedTask?: OrchestrationTask;
  visibleTaskRuns: OrchestrationRun[];
  startingRunId?: string;
  workflowAgentTooltip: string;
  localTasksTooltip: string;
  recentRunsTooltip: string;
  onMoveThread: (threadId: string, folderId: string) => void | Promise<void>;
  onOpenRunThread: (threadId: string) => void | Promise<void>;
  onRevealWorkspace: (workspacePath: string) => void | Promise<void>;
  onOpenWorkflowArtifactThread: (artifact: WorkflowArtifactSummary) => void | Promise<void>;
  onUpdateTaskState: (taskId: string, state: string) => void | Promise<void>;
  onUpdateTaskLabels: (taskId: string, labels: string[]) => void | Promise<void>;
  onStartRun: (runId: string) => void | Promise<void>;
};

export function AutomationSelectedThreadDetailView({
  selectedThread,
  folders,
  selectedAutomationRun,
  selectedArtifact,
  selectedArtifactThreadRoute,
  selectedArtifactWorkflowThread,
  selectedTask,
  visibleTaskRuns,
  startingRunId,
  workflowAgentTooltip,
  localTasksTooltip,
  recentRunsTooltip,
  onMoveThread,
  onOpenRunThread,
  onRevealWorkspace,
  onOpenWorkflowArtifactThread,
  onUpdateTaskState,
  onUpdateTaskLabels,
  onStartRun,
}: AutomationSelectedThreadDetailViewProps) {
  return (
    <>
      <section className="automation-detail-strip">
        <div>
          <strong>{formatTaskState(selectedThread.status)}</strong>
          <span>{selectedThread.projectName}</span>
        </div>
        <select value={selectedThread.folderId} onChange={(event) => void onMoveThread(selectedThread.id, event.target.value)}>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        {selectedAutomationRun?.threadId && (
          <button
            type="button"
            className="panel-button mini"
            onClick={() => void onOpenRunThread(selectedAutomationRun.threadId!)}
          >
            Open run chat
          </button>
        )}
        {selectedAutomationRun?.workspacePath && (
          <button type="button" className="panel-button mini" onClick={() => void onRevealWorkspace(selectedAutomationRun.workspacePath!)}>
            Reveal workspace
          </button>
        )}
      </section>

      <div className="automation-focused-grid">
        {selectedArtifact && (
          <section className="automation-section automation-focus-primary">
            <div className="panel-section-heading">
              <AutomationHeadingLabel tooltip={workflowAgentTooltip}>Workflow Agent Thread</AutomationHeadingLabel>
              <div className="task-heading-actions">
                {selectedArtifactThreadRoute && (
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={selectedArtifactThreadRoute.disabled}
                    onClick={() => void onOpenWorkflowArtifactThread(selectedArtifact)}
                  >
                    {selectedArtifactThreadRoute.actionLabel}
                  </button>
                )}
              </div>
            </div>
            <section className="task-row workflow-artifact-row">
              <h3>{selectedArtifact.title}</h3>
              <p>{selectedArtifactThreadRoute?.detail}</p>
              <div className="plugin-badges">
                <span>{formatTaskState(selectedArtifact.status)}</span>
                {selectedArtifact.workflowThreadId && <span>Thread linked</span>}
                {selectedArtifactWorkflowThread && <span>{formatTaskState(selectedArtifactWorkflowThread.phase)}</span>}
              </div>
            </section>
          </section>
        )}

        {selectedTask && (
          <section className="automation-section automation-focus-primary">
            <div className="panel-section-heading">
              <AutomationHeadingLabel tooltip={localTasksTooltip}>Local Task</AutomationHeadingLabel>
              <div className="task-heading-actions">
                {selectedTask.workspacePath && (
                  <button type="button" className="panel-button mini" onClick={() => void onRevealWorkspace(selectedTask.workspacePath!)}>
                    Reveal workspace
                  </button>
                )}
              </div>
            </div>
            <section className="task-row">
              <div className="task-row-header">
                <strong>{selectedTask.identifier}</strong>
                <select value={selectedTask.state} onChange={(event) => void onUpdateTaskState(selectedTask.id, event.target.value)}>
                  {taskStateOptions.map((state) => (
                    <option key={state} value={state}>
                      {formatTaskState(state)}
                    </option>
                  ))}
                </select>
              </div>
              <h3>{selectedTask.title}</h3>
              {selectedTask.description && <p>{selectedTask.description}</p>}
              <div className="plugin-badges">
                <span>{formatTaskState(selectedTask.state)}</span>
                {selectedTask.priority !== undefined && <span>Priority {selectedTask.priority}</span>}
                {selectedTask.workspacePath && <span>Workspace ready</span>}
                {taskUserLabels(selectedTask.labels).map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              {taskUserLabels(selectedTask.labels).length > 0 && (
                <div className="task-row-actions">
                  {taskUserLabels(selectedTask.labels).map((label) => (
                    <button
                      type="button"
                      className="panel-button mini"
                      key={`${selectedTask.id}-${label}`}
                      onClick={() => void onUpdateTaskLabels(selectedTask.id, selectedTask.labels.filter((candidate) => candidate !== label))}
                    >
                      Remove label {label}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}

        {selectedTask && (
          <section className="automation-section">
            <div className="panel-section-heading">
              <AutomationHeadingLabel tooltip={recentRunsTooltip}>Runs</AutomationHeadingLabel>
            </div>
            {visibleTaskRuns.length > 0 ? (
              <div className="run-dashboard flush">
                {visibleTaskRuns.slice(0, 8).map((run) => (
                  <div className="run-card" key={run.id}>
                    <div className="run-card-header">
                      <span className="run-row-title">
                        {run.status === "running" && <LoaderCircle size={12} className="spin" />}
                        {selectedTask.identifier}
                      </span>
                      <strong className={`run-state ${run.status}`}>{formatOrchestrationRunStatus(run)}</strong>
                    </div>
                    <code className="run-workspace-path">{run.workspacePath}</code>
                    <RunTimeline run={run} />
                    <ProofOfWorkPreview run={run} />
                    <div className="run-actions">
                      {run.threadId && (
                        <button type="button" className="panel-button mini" onClick={() => void onOpenRunThread(run.threadId!)}>
                          Open run chat
                        </button>
                      )}
                      <button type="button" className="panel-button mini" onClick={() => void onRevealWorkspace(run.workspacePath)}>
                        Reveal workspace
                      </button>
                      {(run.status === "prepared" || run.status === "failed" || run.status === "canceled" || run.status === "stalled") && (
                        <button type="button" className="panel-button mini" disabled={startingRunId === run.id} onClick={() => void onStartRun(run.id)}>
                          {startingRunId === run.id ? "Starting" : orchestrationRunActionLabel(run)}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-note">No runs recorded for this automation thread.</p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
