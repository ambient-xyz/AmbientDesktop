import { FolderPlus } from "lucide-react";
import type { ReactNode } from "react";
import type {
  AutomationFolderSummary,
  AutomationThreadSummary,
  WorkflowAgentThreadSummary,
  WorkflowRecordingLibraryEntry,
} from "../../shared/types";
import { automationIndicatorKind } from "./AutomationsWorkflowUtilityViews";
import { InfoTooltip } from "./RightPanel";

export type AutomationWorkspaceTabId = "home" | "local_tasks" | "workflow_agent" | "workflow_lab" | "schedules" | "runs_reviews";
export type AutomationPane = AutomationWorkspaceTabId | "folder";

export type AutomationWorkspaceTab = {
  id: AutomationWorkspaceTabId;
  label: string;
  title: string;
};

export type AutomationProjectOption = {
  path: string;
  name: string;
};

export type AutomationWorkspacePaneTooltips = {
  home: string;
  folders: string;
  workflowAgent: string;
  localTasks: string;
  workflowLab: string;
  schedules: string;
  runsReviews: string;
};

export type AutomationWorkspacePaneCopy = {
  homeTitle: string;
  workflowAgentLabel: string;
  tooltips: AutomationWorkspacePaneTooltips;
};

export type AutomationWorkspaceProjectSelectionModel = {
  selectedProject: AutomationProjectOption;
  projectOptions: AutomationProjectOption[];
  selectedTaskProject: AutomationProjectOption;
  selectedTaskProjectPath: string;
};

export type AutomationWorkspaceHeaderDisplayModel = {
  kickerTitle: string;
  kickerLabel: string;
  title: string;
  titleTooltip: string;
  description: string;
};

export type AutomationWorkspaceHeaderStats = {
  total: number;
  running: number;
  attention: number;
  review: number;
};

export type AutomationWorkspaceHeaderModelInput = {
  selectedWorkflowRecording?: Pick<WorkflowRecordingLibraryEntry, "title" | "summary">;
  selectedWorkflowAgentThread?: Pick<WorkflowAgentThreadSummary, "title" | "preview">;
  selectedThread?: Pick<AutomationThreadSummary, "title" | "preview" | "kind">;
  selectedFolder?: Pick<AutomationFolderSummary, "name">;
  activePaneTitle: string;
  activePaneTooltip: string;
  legacyCompilerEnabled: boolean;
  totalThreadCount: number;
  folderCount: number;
};

export type AutomationWorkspaceShellModelInput = {
  activePane: AutomationPane;
  selectedFolder?: Pick<AutomationFolderSummary, "name">;
  selectedWorkflowRecording?: Pick<WorkflowRecordingLibraryEntry, "title" | "summary">;
  selectedWorkflowAgentThread?: Pick<WorkflowAgentThreadSummary, "title" | "preview">;
  selectedThread?: Pick<AutomationThreadSummary, "title" | "preview" | "kind">;
  allAutomationThreads: Array<Pick<AutomationThreadSummary, "status" | "needsReview">>;
  folders: Array<Pick<AutomationFolderSummary, "name">>;
  projects: AutomationProjectOption[];
  activeProjectName: string;
  activeProjectPath: string;
  taskProjectPath: string;
  legacyCompilerEnabled: boolean;
  paneCopy: AutomationWorkspacePaneCopy;
};

export type AutomationWorkspaceShellModel = {
  activePaneTitle: string;
  activePaneTooltip: string;
  header: AutomationWorkspaceHeaderDisplayModel;
  stats: AutomationWorkspaceHeaderStats;
  projectSelection: AutomationWorkspaceProjectSelectionModel;
};

export function automationWorkspaceShellModel(input: AutomationWorkspaceShellModelInput): AutomationWorkspaceShellModel {
  const activePaneTitle = automationWorkspacePaneTitle(input.activePane, input.selectedFolder, input.paneCopy);
  const activePaneTooltip = automationWorkspaceActivePaneTooltip(input.activePane, input.paneCopy.tooltips);
  const stats = automationWorkspaceHeaderStats(input.allAutomationThreads);
  return {
    activePaneTitle,
    activePaneTooltip,
    header: automationWorkspaceHeaderModel({
      selectedWorkflowRecording: input.selectedWorkflowRecording,
      selectedWorkflowAgentThread: input.selectedWorkflowAgentThread,
      selectedThread: input.selectedThread,
      selectedFolder: input.selectedFolder,
      activePaneTitle,
      activePaneTooltip,
      legacyCompilerEnabled: input.legacyCompilerEnabled,
      totalThreadCount: input.allAutomationThreads.length,
      folderCount: input.folders.length,
    }),
    stats,
    projectSelection: automationWorkspaceProjectSelectionModel({
      projects: input.projects,
      activeProjectPath: input.activeProjectPath,
      activeProjectName: input.activeProjectName,
      taskProjectPath: input.taskProjectPath,
    }),
  };
}

export function automationWorkspacePaneTitle(
  pane: AutomationPane,
  folder: Pick<AutomationFolderSummary, "name"> | undefined,
  copy: Pick<AutomationWorkspacePaneCopy, "homeTitle" | "workflowAgentLabel">,
): string {
  if (pane === "home") return copy.homeTitle;
  if (pane === "local_tasks") return "Local Tasks";
  if (pane === "workflow_agent") return copy.workflowAgentLabel;
  if (pane === "workflow_lab") return "Workflow Lab";
  if (pane === "schedules") return "Schedules";
  if (pane === "runs_reviews") return "Runs And Reviews";
  return folder?.name ? `${folder.name} Folder` : "Automation Folder";
}

export function automationWorkspaceActivePaneTooltip(pane: AutomationPane, tooltips: AutomationWorkspacePaneTooltips): string {
  if (pane === "home") return tooltips.home;
  if (pane === "local_tasks") return tooltips.localTasks;
  if (pane === "workflow_agent") return tooltips.workflowAgent;
  if (pane === "workflow_lab") return tooltips.workflowLab;
  if (pane === "schedules") return tooltips.schedules;
  if (pane === "runs_reviews") return tooltips.runsReviews;
  return tooltips.folders;
}

export function automationWorkspaceHeaderStats(threads: Array<Pick<AutomationThreadSummary, "status" | "needsReview">>): AutomationWorkspaceHeaderStats {
  return {
    total: threads.length,
    running: threads.filter((thread) => automationIndicatorKind(thread.status) === "running").length,
    attention: threads.filter((thread) => automationIndicatorKind(thread.status) === "error").length,
    review: threads.filter((thread) => thread.needsReview || ["paused", "needs_input", "ready_for_preview", "review"].includes(thread.status)).length,
  };
}

export function automationWorkspaceProjectSelectionModel({
  projects,
  activeProjectPath,
  activeProjectName,
  taskProjectPath,
}: {
  projects: AutomationProjectOption[];
  activeProjectPath: string;
  activeProjectName: string;
  taskProjectPath: string;
}): AutomationWorkspaceProjectSelectionModel {
  const selectedProject = projects.find((project) => project.path === activeProjectPath) ?? {
    path: activeProjectPath,
    name: activeProjectName,
  };
  const projectOptions = projects.some((project) => project.path === activeProjectPath)
    ? projects
    : [selectedProject, ...projects];
  const selectedTaskProject = projectOptions.find((project) => project.path === taskProjectPath) ?? selectedProject;
  return {
    selectedProject,
    projectOptions,
    selectedTaskProject,
    selectedTaskProjectPath: selectedTaskProject.path,
  };
}

export function automationWorkspaceHeaderModel({
  selectedWorkflowRecording,
  selectedWorkflowAgentThread,
  selectedThread,
  activePaneTitle,
  activePaneTooltip,
  legacyCompilerEnabled,
  totalThreadCount,
  folderCount,
}: AutomationWorkspaceHeaderModelInput): AutomationWorkspaceHeaderDisplayModel {
  if (selectedWorkflowRecording) {
    return {
      kickerTitle: "A saved Workflow Recorder playbook with confirmed intent, successful tool examples, versions, and package files.",
      kickerLabel: "Workflow Playbook",
      title: selectedWorkflowRecording.title,
      titleTooltip: selectedWorkflowRecording.title,
      description: selectedWorkflowRecording.summary,
    };
  }

  if (selectedWorkflowAgentThread) {
    return {
      kickerTitle: legacyCompilerEnabled
        ? "A Workflow Agent thread with discovery, graph, versions, runs, and audit history."
        : "A legacy workflow thread is hidden while Workflow Recorder is the default surface.",
      kickerLabel: legacyCompilerEnabled ? "Workflow Agent Thread" : "Workflow Recording",
      title: selectedWorkflowAgentThread.title,
      titleTooltip: selectedWorkflowAgentThread.title,
      description: selectedWorkflowAgentThread.preview,
    };
  }

  if (selectedThread) {
    const workflowArtifact = selectedThread.kind === "workflow_artifact";
    return {
      kickerTitle: workflowArtifact
        ? legacyCompilerEnabled
          ? "A legacy workflow-artifact entry point that opens the Workflow Agent thread."
          : "A legacy workflow-artifact entry point. Workflow Recorder is the default surface."
        : "A single automation thread with its run history and actions.",
      kickerLabel: workflowArtifact ? (legacyCompilerEnabled ? "Workflow Agent Thread" : "Workflow Recording") : "Automation Thread",
      title: selectedThread.title,
      titleTooltip: selectedThread.title,
      description: selectedThread.preview,
    };
  }

  return {
    kickerTitle: activePaneTooltip,
    kickerLabel: activePaneTitle,
    title: activePaneTitle,
    titleTooltip: activePaneTooltip,
    description: `${totalThreadCount} thread${totalThreadCount === 1 ? "" : "s"} across ${folderCount} folder${folderCount === 1 ? "" : "s"}.`,
  };
}

export function AutomationWorkspaceHeader({
  model,
  helpText,
  stats,
}: {
  model: AutomationWorkspaceHeaderDisplayModel;
  helpText: string;
  stats: AutomationWorkspaceHeaderStats;
}) {
  return (
    <header className="automation-workspace-header">
      <div>
        <span className="automation-kicker" title={model.kickerTitle}>
          {model.kickerLabel}
        </span>
        <div className="automation-title-row">
          <h1 title={model.titleTooltip}>{model.title}</h1>
          <InfoTooltip label="What is this?" text={helpText} className="automation-help-link" />
        </div>
        <p>{model.description}</p>
      </div>
      <div className="automation-stats">
        <span title="Every workflow or local task thread visible to the current workspace.">
          <strong>{stats.total}</strong>
          Total
        </span>
        <span title="Workflow and local task threads with work currently preparing, running, or claimed.">
          <strong>{stats.running}</strong>
          Running
        </span>
        <span title="Workflow and local task threads that need attention because the latest task or run failed.">
          <strong>{stats.attention}</strong>
          Attention
        </span>
        <span title="Workflow and local task threads waiting for preview, approval, or other review.">
          <strong>{stats.review}</strong>
          Review
        </span>
      </div>
    </header>
  );
}

export function AutomationWorkspaceTabs({
  homeTitle,
  tabs,
  activePane,
  selectedThreadActive,
  onSelectPane,
}: {
  homeTitle: string;
  tabs: AutomationWorkspaceTab[];
  activePane: string;
  selectedThreadActive: boolean;
  onSelectPane: (pane: AutomationWorkspaceTabId) => void;
}) {
  return (
    <nav className="workflow-agent-tabs" aria-label={`${homeTitle} views`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activePane === tab.id && !selectedThreadActive ? "active" : ""}
          title={tab.title}
          onClick={() => onSelectPane(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function AutomationProjectField({
  projects,
  selectedPath,
  tooltip,
  onProjectPathChange,
  onCreateProject,
}: {
  projects: AutomationProjectOption[];
  selectedPath: string;
  tooltip: string;
  onProjectPathChange: (path: string) => void;
  onCreateProject: () => void | Promise<void>;
}) {
  return (
    <label className="automation-field">
      <span>
        <strong>Project</strong>
        <InfoTooltip text={tooltip} className="heading-info-tooltip" />
      </span>
      <span className="automation-field-row">
        <select className="automation-select" value={selectedPath} onChange={(event) => onProjectPathChange(event.currentTarget.value)}>
          {projects.map((project) => (
            <option key={project.path} value={project.path}>
              {project.name}
            </option>
          ))}
        </select>
        <button type="button" className="panel-button mini" onClick={() => void onCreateProject()} title="Create a new project for this Local Task.">
          <FolderPlus size={13} />
          New project
        </button>
      </span>
      <small>{selectedPath}</small>
    </label>
  );
}

export type AutomationPaneRenderSlot = () => ReactNode;

export type AutomationPaneRouterProps = {
  activePane: AutomationPane;
  selectedWorkflowRecordingActive: boolean;
  renderWorkflowRecordingPlaybookPane: AutomationPaneRenderSlot;
  renderLocalTasksPane: AutomationPaneRenderSlot;
  renderWorkflowAgentPane: AutomationPaneRenderSlot;
  renderWorkflowLabHomePane: AutomationPaneRenderSlot;
  renderSchedulesPane: AutomationPaneRenderSlot;
  renderRunsReviewsPane: AutomationPaneRenderSlot;
  renderFolderPane: AutomationPaneRenderSlot;
  renderHomePane: AutomationPaneRenderSlot;
};

export function AutomationPaneRouter({
  activePane,
  selectedWorkflowRecordingActive,
  renderWorkflowRecordingPlaybookPane,
  renderLocalTasksPane,
  renderWorkflowAgentPane,
  renderWorkflowLabHomePane,
  renderSchedulesPane,
  renderRunsReviewsPane,
  renderFolderPane,
  renderHomePane,
}: AutomationPaneRouterProps) {
  if (selectedWorkflowRecordingActive) return <>{renderWorkflowRecordingPlaybookPane()}</>;
  if (activePane === "local_tasks") return <>{renderLocalTasksPane()}</>;
  if (activePane === "workflow_agent") return <>{renderWorkflowAgentPane()}</>;
  if (activePane === "workflow_lab") return <>{renderWorkflowLabHomePane()}</>;
  if (activePane === "schedules") return <>{renderSchedulesPane()}</>;
  if (activePane === "runs_reviews") return <>{renderRunsReviewsPane()}</>;
  if (activePane === "folder") return <>{renderFolderPane()}</>;
  return <>{renderHomePane()}</>;
}

export type WorkflowAgentPaneRouterProps = {
  legacyCompilerEnabled: boolean;
  selectedWorkflowRecordingActive: boolean;
  selectedWorkflowAgentThread?: Pick<WorkflowAgentThreadSummary, "activeArtifactId">;
  selectedDraftRevisionActive: boolean;
  renderWorkflowRecordingPlaybookPane: AutomationPaneRenderSlot;
  renderLegacyWorkflowHiddenPane: AutomationPaneRenderSlot;
  renderWorkflowRecorderStartPane: AutomationPaneRenderSlot;
  renderWorkflowDiscoveryThread: AutomationPaneRenderSlot;
  renderWorkflowThreadDetail: AutomationPaneRenderSlot;
  renderWorkflowAgentCompilerStartPane: AutomationPaneRenderSlot;
};

export function WorkflowAgentPaneRouter({
  legacyCompilerEnabled,
  selectedWorkflowRecordingActive,
  selectedWorkflowAgentThread,
  selectedDraftRevisionActive,
  renderWorkflowRecordingPlaybookPane,
  renderLegacyWorkflowHiddenPane,
  renderWorkflowRecorderStartPane,
  renderWorkflowDiscoveryThread,
  renderWorkflowThreadDetail,
  renderWorkflowAgentCompilerStartPane,
}: WorkflowAgentPaneRouterProps) {
  if (!legacyCompilerEnabled) {
    if (selectedWorkflowRecordingActive) return <>{renderWorkflowRecordingPlaybookPane()}</>;
    return <>{selectedWorkflowAgentThread ? renderLegacyWorkflowHiddenPane() : renderWorkflowRecorderStartPane()}</>;
  }
  if (selectedWorkflowAgentThread && selectedDraftRevisionActive) return <>{renderWorkflowDiscoveryThread()}</>;
  if (selectedWorkflowAgentThread && !selectedWorkflowAgentThread.activeArtifactId) return <>{renderWorkflowDiscoveryThread()}</>;
  if (selectedWorkflowAgentThread) return <>{renderWorkflowThreadDetail()}</>;
  return <>{renderWorkflowAgentCompilerStartPane()}</>;
}
