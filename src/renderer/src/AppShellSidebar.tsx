import {
  Bell,
  Brain,
  ChevronDown,
  FolderOpen,
  GitBranch,
  Kanban,
  Monitor,
  PanelLeft,
  Pin,
  Plug,
  Plus,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { RunStatus, ThreadSummary } from "../../shared/threadTypes";
import type { WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import {
  ProjectContextMenu,
  type ProjectContextMenuState,
  ThreadContextMenu,
  type ThreadContextMenuState,
} from "./AppActionDialogs";
import { ambientMiniLogoUrl } from "./AppBranding";
import {
  type AutomationPopover,
  type ProjectPopover,
  ProjectsHeader,
  sidebarThreadAgeLabel,
  type SidebarOrganizeSettings,
  threadIndicator,
  ThreadIndicatorIcon,
  WorkflowAgentSidebar,
} from "./AppSidebar";
import { workflowRecorderSurface } from "./AutomationsWorkspace";
import { projectBoardActionState } from "./projectBoardUiModel";
import type { UtilityPanel } from "./RightPanel";

export type SidebarArea = "projects" | "automations";

type AppShellSidebarProps = {
  width: number;
  minWidth: number;
  maxWidth: number;
  sidebarArea: SidebarArea;
  selectedAutomationPane: string;
  projectPopover?: ProjectPopover;
  projectsCollapsed: boolean;
  sidebarOrganize: SidebarOrganizeSettings;
  sidebarProjects: ProjectSummary[];
  sidebarThreads: ThreadSummary[];
  activeProjectPath: string;
  activeThreadId: string;
  activeThreadSuppressesProjectBoard: boolean;
  projectBoardBusyProjectIds: Set<string>;
  projectBoardOpen: boolean;
  threadRunStatuses: Record<string, RunStatus>;
  sidebarAgeNow: number;
  workflowAgentFolders: WorkflowAgentFolderSummary[];
  workflowRecordingLibrary: WorkflowRecordingLibraryEntry[];
  selectedWorkflowAgentFolderId?: string;
  selectedWorkflowAgentThreadId?: string;
  selectedWorkflowRecordingId?: string;
  automationsCollapsed: boolean;
  automationPopover?: AutomationPopover;
  workflowAgentNavigationError?: string;
  projectContextMenu?: ProjectContextMenuState;
  threadContextMenu?: ThreadContextMenuState;
  onCloseSidebar: () => void;
  onPrimaryCreate: () => void;
  onOpenSidebarArea: (area: SidebarArea) => void;
  onOpenPanel: (panel: UtilityPanel) => void;
  onOpenWorkflowRecordingsArea: () => void;
  onOpenWorkflowLabArea: () => void;
  onToggleProjectsCollapsed: () => void;
  onToggleProjectPopover: (popover: ProjectPopover) => void;
  onCreateWorkspace: () => void;
  onOpenWorkspace: () => void;
  onOrganizeChange: (input: Partial<SidebarOrganizeSettings>) => void;
  onSelectProject: (projectPath: string) => void | Promise<void>;
  onOpenProjectContextMenu: (event: ReactMouseEvent<HTMLElement>, project: ProjectSummary) => void;
  onBuildProjectBoard: (project: ProjectSummary) => void;
  onCloseProjectBoard: () => void;
  onOpenProjectBoard: (project: ProjectSummary) => void;
  onCreateThreadInProject: (projectPath: string) => void | Promise<void>;
  onSelectThread: (threadId: string, workspacePath: string) => void | Promise<void>;
  onOpenThreadContextMenu: (event: ReactMouseEvent<HTMLElement>, thread: ThreadSummary, workspacePath: string) => void;
  onToggleAutomationsCollapsed: () => void;
  onToggleAutomationPopover: (popover: AutomationPopover) => void;
  onCreateWorkflowAgentFolder: (name: string) => Promise<void>;
  onRefreshWorkflowAgentFolders: () => void;
  onComposeInWorkflowAgentFolder: (folderId: string) => void;
  onSelectWorkflowAgentFolder: (folderId: string) => void;
  onSelectWorkflowAgentThread: (thread: WorkflowAgentThreadSummary) => void;
  onSelectWorkflowRecording: (playbook: WorkflowRecordingLibraryEntry) => void;
  onToggleProjectPinned: (project: ProjectSummary) => void;
  onRevealProject: (project: ProjectSummary) => void;
  onCreatePermanentProjectWorktree: (project: ProjectSummary) => void;
  onRenameProject: (project: ProjectSummary) => void;
  onArchiveProjectChats: (project: ProjectSummary) => void;
  onRemoveProject: (project: ProjectSummary) => void;
  onToggleThreadPinned: () => void;
  onRenameThread: () => void;
  onArchiveThread: () => void;
  onMarkThreadUnread: () => void;
  onRevealThread: () => void;
  onCopyThreadWorkingDirectory: () => void;
  onCopyThreadSessionId: () => void;
  onCopyThreadDeeplink: () => void;
  onExportThreadPdf: () => void;
  onForkThread: (mode: "local" | "worktree") => void;
  onOpenThreadMiniWindow: () => void;
  onBeginResize: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function AppShellSidebar({
  width,
  minWidth,
  maxWidth,
  sidebarArea,
  selectedAutomationPane,
  projectPopover,
  projectsCollapsed,
  sidebarOrganize,
  sidebarProjects,
  sidebarThreads,
  activeProjectPath,
  activeThreadId,
  activeThreadSuppressesProjectBoard,
  projectBoardBusyProjectIds,
  projectBoardOpen,
  threadRunStatuses,
  sidebarAgeNow,
  workflowAgentFolders,
  workflowRecordingLibrary,
  selectedWorkflowAgentFolderId,
  selectedWorkflowAgentThreadId,
  selectedWorkflowRecordingId,
  automationsCollapsed,
  automationPopover,
  workflowAgentNavigationError,
  projectContextMenu,
  threadContextMenu,
  onCloseSidebar,
  onPrimaryCreate,
  onOpenSidebarArea,
  onOpenPanel,
  onOpenWorkflowRecordingsArea,
  onOpenWorkflowLabArea,
  onToggleProjectsCollapsed,
  onToggleProjectPopover,
  onCreateWorkspace,
  onOpenWorkspace,
  onOrganizeChange,
  onSelectProject,
  onOpenProjectContextMenu,
  onBuildProjectBoard,
  onCloseProjectBoard,
  onOpenProjectBoard,
  onCreateThreadInProject,
  onSelectThread,
  onOpenThreadContextMenu,
  onToggleAutomationsCollapsed,
  onToggleAutomationPopover,
  onCreateWorkflowAgentFolder,
  onRefreshWorkflowAgentFolders,
  onComposeInWorkflowAgentFolder,
  onSelectWorkflowAgentFolder,
  onSelectWorkflowAgentThread,
  onSelectWorkflowRecording,
  onToggleProjectPinned,
  onRevealProject,
  onCreatePermanentProjectWorktree,
  onRenameProject,
  onArchiveProjectChats,
  onRemoveProject,
  onToggleThreadPinned,
  onRenameThread,
  onArchiveThread,
  onMarkThreadUnread,
  onRevealThread,
  onCopyThreadWorkingDirectory,
  onCopyThreadSessionId,
  onCopyThreadDeeplink,
  onExportThreadPdf,
  onForkThread,
  onOpenThreadMiniWindow,
  onBeginResize,
}: AppShellSidebarProps) {
  const sidebarGroupedByProject = sidebarOrganize.organize === "project";
  return (
    <>
      <aside className="sidebar" style={{ width }}>
        <div className="sidebar-top">
          <button className="brand-button" onClick={onCloseSidebar} title="Toggle sidebar">
            <img className="ambient-mark" src={ambientMiniLogoUrl} alt="" />
            <span>Ambient</span>
            <PanelLeft size={16} />
          </button>
          <button className="primary-row" onClick={onPrimaryCreate}>
            <Plus size={16} />
            <span>{sidebarArea === "automations" ? workflowRecorderSurface.primaryCreateLabel : "New chat"}</span>
          </button>
          <button className={`nav-row ${sidebarArea === "projects" ? "active" : ""}`} onClick={() => onOpenSidebarArea("projects")}>
            <FolderOpen size={16} />
            <span>Projects</span>
          </button>
          <button className="nav-row" onClick={() => onOpenPanel("search")}>
            <Search size={16} />
            <span>Search</span>
          </button>
          <button className="nav-row" onClick={() => onOpenPanel("browser")}>
            <Monitor size={16} />
            <span>Browser</span>
          </button>
          <button className="nav-row" onClick={() => onOpenPanel("plugins")}>
            <Plug size={16} />
            <span>Plugins</span>
          </button>
          <button
            className={`nav-row ${sidebarArea === "automations" && selectedAutomationPane !== "workflow_lab" ? "active" : ""}`}
            onClick={onOpenWorkflowRecordingsArea}
          >
            <Bell size={16} />
            <span>{workflowRecorderSurface.navLabel}</span>
          </button>
          <button
            className={`nav-row ${sidebarArea === "automations" && selectedAutomationPane === "workflow_lab" ? "active" : ""}`}
            onClick={onOpenWorkflowLabArea}
          >
            <Brain size={16} />
            <span>Workflow Lab</span>
          </button>
        </div>

        {sidebarArea === "projects" ? (
          <>
            <div className="workspace-block">
              <ProjectsHeader
                popover={projectPopover}
                collapsed={projectsCollapsed}
                organize={sidebarOrganize}
                onToggleCollapse={onToggleProjectsCollapsed}
                onTogglePopover={onToggleProjectPopover}
                onCreateWorkspace={onCreateWorkspace}
                onOpenWorkspace={onOpenWorkspace}
                onOrganizeChange={onOrganizeChange}
              />
            </div>

            {sidebarGroupedByProject ? (
              <div className="project-list">
                {sidebarProjects.map((project) => {
                  const isActiveProject = project.path === activeProjectPath;
                  const boardAction = projectBoardActionState(
                    project,
                    activeProjectPath,
                    projectBoardBusyProjectIds.has(project.id),
                    projectBoardOpen && isActiveProject,
                  );
                  return (
                    <section className="project-group" key={project.path}>
                      <div className="project-row-shell">
                        <button
                          type="button"
                          className={`workspace-button ${isActiveProject ? "active-project" : ""}`}
                          onClick={() => void onSelectProject(project.path)}
                          onContextMenu={(event) => onOpenProjectContextMenu(event, project)}
                          title={project.path}
                        >
                          <FolderOpen size={15} />
                          {project.pinned && <Pin size={12} className="project-pin-indicator" />}
                          <span>{project.name}</span>
                          {!projectsCollapsed && project.threads.length > 0 && <ChevronDown size={14} />}
                        </button>
                        <div className="project-row-actions">
                          {!activeThreadSuppressesProjectBoard && (
                            <button
                              type="button"
                              className={`project-board-icon-button ${project.board ? "ready" : ""}`}
                              title={boardAction.title}
                              aria-label={boardAction.title}
                              disabled={boardAction.disabled}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (boardAction.kind === "build") onBuildProjectBoard(project);
                                else if (boardAction.kind === "close") onCloseProjectBoard();
                                else onOpenProjectBoard(project);
                              }}
                            >
                              <Kanban size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="project-compose-icon-button"
                            title={`New chat in ${project.name}`}
                            aria-label={`New chat in ${project.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onCreateThreadInProject(project.path);
                            }}
                          >
                            <SquarePen size={15} />
                          </button>
                        </div>
                      </div>
                      {!projectsCollapsed &&
                        (project.threads.length > 0 ? (
                          <div className="thread-list nested">
                            {project.threads.map((thread) => {
                              const isActiveThread = thread.id === activeThreadId && isActiveProject;
                              const indicator = threadIndicator(thread, threadRunStatuses[thread.id], isActiveThread);
                              const ageLabel = sidebarThreadAgeLabel(thread.updatedAt, sidebarAgeNow);
                              const previewText = thread.lastMessagePreview || project.name;
                              return (
                                <button
                                  key={`${project.path}:${thread.id}`}
                                  className={`thread-row ${thread.kind === "subagent_child" ? "subagent-child" : ""} ${isActiveThread ? "active" : ""}`}
                                  title={thread.title}
                                  onClick={() => void onSelectThread(thread.id, project.path)}
                                  onContextMenu={(event) => onOpenThreadContextMenu(event, thread, project.path)}
                                >
                                  <span className="thread-row-main">
                                    <span className="thread-title-wrap">
                                      {thread.kind === "subagent_child" && <GitBranch size={11} className="thread-child-indicator" />}
                                      {thread.pinned && <Pin size={12} className="thread-pin-indicator" />}
                                      <span className="thread-title" title={thread.title}>
                                        {thread.title}
                                      </span>
                                    </span>
                                    <span className="thread-row-meta">
                                      {ageLabel && <span className="thread-age">{ageLabel}</span>}
                                      <span className={`thread-indicator ${indicator.kind}`} title={indicator.label}>
                                        <ThreadIndicatorIcon kind={indicator.kind} />
                                      </span>
                                    </span>
                                  </span>
                                  <span className="thread-preview" title={previewText} data-ui-allow-truncation="true">
                                    {previewText}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <button type="button" className="no-chats-row" onClick={() => void onSelectProject(project.path)}>
                            No chats
                          </button>
                        ))}
                    </section>
                  );
                })}
              </div>
            ) : (
              !projectsCollapsed && (
                <div className="thread-list flat">
                  {sidebarThreads.map((thread) => {
                    const project = sidebarProjects.find((item) => item.threads.some((candidate) => candidate.id === thread.id));
                    const threadProjectPath = project?.path ?? thread.workspacePath;
                    const isActiveThread = thread.id === activeThreadId;
                    const indicator = threadIndicator(thread, threadRunStatuses[thread.id], isActiveThread);
                    const ageLabel = sidebarThreadAgeLabel(thread.updatedAt, sidebarAgeNow);
                    const previewText = project?.name || thread.workspacePath;
                    return (
                      <button
                        key={`${thread.workspacePath}:${thread.id}`}
                        className={`thread-row ${thread.kind === "subagent_child" ? "subagent-child" : ""} ${isActiveThread ? "active" : ""}`}
                        title={thread.title}
                        onClick={() => void onSelectThread(thread.id, threadProjectPath)}
                        onContextMenu={(event) => onOpenThreadContextMenu(event, thread, threadProjectPath)}
                      >
                        <span className="thread-row-main">
                          <span className="thread-title-wrap">
                            {thread.kind === "subagent_child" && <GitBranch size={11} className="thread-child-indicator" />}
                            {thread.pinned && <Pin size={12} className="thread-pin-indicator" />}
                            <span className="thread-title" title={thread.title}>
                              {thread.title}
                            </span>
                          </span>
                          <span className="thread-row-meta">
                            {ageLabel && <span className="thread-age">{ageLabel}</span>}
                            <span className={`thread-indicator ${indicator.kind}`} title={indicator.label}>
                              <ThreadIndicatorIcon kind={indicator.kind} />
                            </span>
                          </span>
                        </span>
                        <span className="thread-preview" title={previewText} data-ui-allow-truncation="true">
                          {previewText}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </>
        ) : (
          <WorkflowAgentSidebar
            folders={workflowAgentFolders}
            workflowRecordingLibrary={workflowRecordingLibrary}
            selectedFolderId={selectedWorkflowAgentFolderId}
            selectedThreadId={selectedWorkflowAgentThreadId}
            selectedPlaybookId={selectedWorkflowRecordingId}
            collapsed={automationsCollapsed}
            popover={automationPopover}
            error={workflowAgentNavigationError}
            onToggleCollapse={onToggleAutomationsCollapsed}
            onTogglePopover={onToggleAutomationPopover}
            onCreateFolder={onCreateWorkflowAgentFolder}
            onRefresh={onRefreshWorkflowAgentFolders}
            onComposeInFolder={onComposeInWorkflowAgentFolder}
            onSelectFolder={onSelectWorkflowAgentFolder}
            onSelectThread={onSelectWorkflowAgentThread}
            onSelectPlaybook={onSelectWorkflowRecording}
          />
        )}
        {projectContextMenu && (
          <ProjectContextMenu
            menu={projectContextMenu}
            onPin={() => onToggleProjectPinned(projectContextMenu.project)}
            onReveal={() => onRevealProject(projectContextMenu.project)}
            onCreateWorktree={() => onCreatePermanentProjectWorktree(projectContextMenu.project)}
            onRename={() => onRenameProject(projectContextMenu.project)}
            onArchiveChats={() => onArchiveProjectChats(projectContextMenu.project)}
            onRemove={() => onRemoveProject(projectContextMenu.project)}
          />
        )}
        {threadContextMenu && (
          <ThreadContextMenu
            menu={threadContextMenu}
            onPin={onToggleThreadPinned}
            onRename={onRenameThread}
            onArchive={onArchiveThread}
            onMarkUnread={onMarkThreadUnread}
            onReveal={onRevealThread}
            onCopyWorkingDirectory={onCopyThreadWorkingDirectory}
            onCopySessionId={onCopyThreadSessionId}
            onCopyDeeplink={onCopyThreadDeeplink}
            onExportPdf={onExportThreadPdf}
            onForkLocal={() => onForkThread("local")}
            onForkWorktree={() => onForkThread("worktree")}
            onOpenMiniWindow={onOpenThreadMiniWindow}
          />
        )}

        <div className="sidebar-footer">
          <button className="icon-text" onClick={() => onOpenPanel("settings")}>
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>
      </aside>
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        onMouseDown={onBeginResize}
      />
    </>
  );
}
