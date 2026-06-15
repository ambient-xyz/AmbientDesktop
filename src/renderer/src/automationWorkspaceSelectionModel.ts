import type {
  AutomationFolderSummary,
  AutomationThreadSummary,
  OrchestrationBoard,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowDashboard,
  WorkflowRunDetail,
} from "../../shared/types";
import type { AutomationPane } from "./AutomationsWorkspaceShellViews";
import { workflowArtifactThreadRoute } from "./workflowThreadFirstUiModel";

export type AutomationWorkspaceSelectionInput = {
  folders: AutomationFolderSummary[];
  selectedThread?: AutomationThreadSummary;
  activePane: AutomationPane;
  selectedFolder?: AutomationFolderSummary;
  orchestrationBoard?: OrchestrationBoard;
  workflowDashboard?: WorkflowDashboard;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  workflowDetail?: WorkflowRunDetail;
  selectedWorkflowGraphNodeId?: string;
  workflowAgentFolders: WorkflowAgentFolderSummary[];
};

export function automationWorkspaceSelectionModel({
  folders,
  selectedThread,
  activePane,
  selectedFolder,
  orchestrationBoard,
  workflowDashboard,
  selectedWorkflowAgentThread,
  workflowDetail,
  selectedWorkflowGraphNodeId,
  workflowAgentFolders,
}: AutomationWorkspaceSelectionInput) {
  const allAutomationThreads = folders.flatMap((folder) => folder.threads);
  const visibleThreads = selectedThread
    ? [selectedThread]
    : activePane === "folder"
      ? selectedFolder?.threads ?? []
      : activePane === "local_tasks"
        ? allAutomationThreads.filter((thread) => thread.kind === "orchestration_task")
        : activePane === "workflow_agent"
          ? allAutomationThreads.filter((thread) => thread.kind === "workflow_artifact")
          : allAutomationThreads;
  const visibleTaskIds = new Set(visibleThreads.filter((thread) => thread.kind === "orchestration_task").map((thread) => thread.sourceId));
  const visibleArtifactIds = new Set(visibleThreads.filter((thread) => thread.kind === "workflow_artifact").map((thread) => thread.sourceId));
  const visibleTasks = orchestrationBoard?.tasks.filter((task) => visibleTaskIds.has(task.id)) ?? [];
  const visibleArtifacts = workflowDashboard?.artifacts.filter((artifact) => visibleArtifactIds.has(artifact.id)) ?? [];
  const visibleTaskRuns = orchestrationBoard?.runs.filter((run) => visibleTaskIds.has(run.taskId)) ?? [];
  const selectedArtifact = selectedThread?.kind === "workflow_artifact" ? visibleArtifacts[0] : undefined;
  const selectedTask = selectedThread?.kind === "orchestration_task" ? visibleTasks[0] : undefined;
  const selectedWorkflowAgentArtifact = selectedWorkflowAgentThread?.activeArtifactId
    ? workflowDashboard?.artifacts.find((artifact) => artifact.id === selectedWorkflowAgentThread.activeArtifactId)
    : undefined;
  const selectedWorkflowAgentDetail =
    workflowDetail && selectedWorkflowAgentArtifact?.id === workflowDetail.artifact.id ? workflowDetail : undefined;
  const selectedWorkflowAgentSourceNode = selectedWorkflowAgentThread?.graph?.nodes.find((node) => node.id === selectedWorkflowGraphNodeId);
  const selectedAutomationRun = selectedThread?.latestRun;
  const workflowRuns = workflowDashboard?.runs ?? [];
  const allTaskRuns = orchestrationBoard?.runs ?? [];
  const artifactById = new Map((workflowDashboard?.artifacts ?? []).map((artifact) => [artifact.id, artifact]));
  const taskById = new Map((orchestrationBoard?.tasks ?? []).map((task) => [task.id, task]));
  const workflowAgentThreadById = new Map(workflowAgentFolders.flatMap((folder) => folder.threads).map((thread) => [thread.id, thread]));
  const workflowAgentThreadByArtifactId = new Map(
    workflowAgentFolders
      .flatMap((folder) => folder.threads)
      .filter((thread): thread is WorkflowAgentThreadSummary & { activeArtifactId: string } => Boolean(thread.activeArtifactId))
      .map((thread) => [thread.activeArtifactId, thread]),
  );
  const selectedArtifactWorkflowThread = selectedArtifact?.workflowThreadId
    ? workflowAgentThreadById.get(selectedArtifact.workflowThreadId)
    : selectedArtifact
      ? workflowAgentThreadByArtifactId.get(selectedArtifact.id)
      : undefined;
  const selectedArtifactThreadRoute = selectedArtifact
    ? workflowArtifactThreadRoute({ artifact: selectedArtifact, workflowThread: selectedArtifactWorkflowThread })
    : undefined;

  return {
    allAutomationThreads,
    visibleThreads,
    visibleTaskIds,
    visibleArtifactIds,
    visibleTasks,
    visibleArtifacts,
    visibleTaskRuns,
    selectedArtifact,
    selectedTask,
    selectedWorkflowAgentArtifact,
    selectedWorkflowAgentDetail,
    selectedWorkflowAgentSourceNode,
    selectedAutomationRun,
    workflowRuns,
    allTaskRuns,
    artifactById,
    taskById,
    workflowAgentThreadById,
    workflowAgentThreadByArtifactId,
    selectedArtifactWorkflowThread,
    selectedArtifactThreadRoute,
  };
}

export type AutomationWorkspaceSelectionModel = ReturnType<typeof automationWorkspaceSelectionModel>;

export function automationWorkspaceThreadForArtifact(
  model: Pick<AutomationWorkspaceSelectionModel, "workflowAgentThreadById" | "workflowAgentThreadByArtifactId">,
  artifact?: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId">,
  artifactId?: string,
): WorkflowAgentThreadSummary | undefined {
  if (artifact?.workflowThreadId) return model.workflowAgentThreadById.get(artifact.workflowThreadId);
  const activeArtifactId = artifact?.id ?? artifactId;
  return activeArtifactId ? model.workflowAgentThreadByArtifactId.get(activeArtifactId) : undefined;
}
