import {
  Bot,
  Brain,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  Clock,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  ListFilter,
  LoaderCircle,
  MessageCircle,
  Minimize2,
  Package,
  Plus,
  RefreshCw,
  SquarePen,
  Star,
} from "lucide-react";
import { useState } from "react";
import type { AutomationFolderSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import { isHiddenTranscriptMessage } from "../../shared/threadPreview";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import type { WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import { SidebarMenuDivider, SidebarMenuItem, SidebarMenuLabel } from "./AppActionDialogs";
import {
  activePaneTooltip,
  automationHelpText,
  automationIndicatorKind,
  workflowRecorderSurface,
  type AutomationPane,
} from "./AutomationsWorkspace";
import { ThreadIndicatorIcon } from "./AppSidebarThreadIndicators";
import { formatTaskState, InfoTooltip } from "./RightPanel";
import "./styles.css";
import { workflowRecorderLibrarySidebarRows } from "./workflowRecorderUiModel";

export { sidebarThreadAgeLabel, threadHasUnreadWork, threadIndicator, ThreadIndicatorIcon } from "./AppSidebarThreadIndicators";

export type ProjectPopover = "add" | "organize";

export type AutomationPopover = "add" | "organize";

export type SidebarOrganizeMode = "project" | "chronological" | "chats-first";

export type SidebarSortMode = "created" | "updated";

export type SidebarShowMode = "all" | "relevant";

export type SidebarOrganizeSettings = {
  organize: SidebarOrganizeMode;
  sort: SidebarSortMode;
  show: SidebarShowMode;
};

export function userPromptHistory(messages: ChatMessage[]): string[] {
  return messages
    .filter((message) => message.role === "user" && !isHiddenTranscriptMessage(message) && message.content.trim())
    .map((message) => message.content)
    .reverse();
}

export function organizeSidebarProjects(
  projects: ProjectSummary[],
  settings: SidebarOrganizeSettings,
  activeThreadId?: string,
  activeWorkspacePath?: string,
  options: { includeSubagentChildren?: boolean } = {},
): ProjectSummary[] {
  const relevantCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const includeSubagentChildren = options.includeSubagentChildren ?? true;
  return projects
    .map((project) => {
      const featureVisibleThreads = includeSubagentChildren
        ? project.threads
        : project.threads.filter((thread) => thread.kind !== "subagent_child");
      const threads =
        settings.show === "all"
          ? featureVisibleThreads
          : featureVisibleThreads.filter((thread) => {
              if (thread.id === activeThreadId) return true;
              if (thread.lastMessagePreview.trim()) return true;
              return Date.parse(thread.updatedAt) >= relevantCutoff;
            });
      const sortedThreads = threads
        .map((thread, index) => ({ thread, index }))
        .sort((a, b) => compareSidebarThreads(a.thread, b.thread, a.index, b.index, settings))
        .map((item) => item.thread);
      return { ...project, threads: orderSidebarSubagentThreads(sortedThreads) };
    })
    .filter((project) => {
      if (settings.show === "all") return true;
      if (project.path === activeWorkspacePath) return true;
      if (project.threads.length > 0) return true;
      return Date.parse(project.updatedAt) >= relevantCutoff;
    })
    .map((project, index) => ({ project, index }))
    .sort((a, b) => {
      if (a.project.path === activeWorkspacePath) return -1;
      if (b.project.path === activeWorkspacePath) return 1;
      if (Boolean(a.project.pinned) !== Boolean(b.project.pinned)) return a.project.pinned ? -1 : 1;
      const key = settings.sort === "created" ? "createdAt" : "updatedAt";
      const byDate = b.project[key].localeCompare(a.project[key]);
      return byDate || a.index - b.index;
    })
    .map((item) => item.project);
}

export function orderSidebarSubagentThreads(threads: ThreadSummary[]): ThreadSummary[] {
  const childrenByParent = new Map<string, ThreadSummary[]>();
  const parentThreads: ThreadSummary[] = [];

  for (const thread of threads) {
    if (thread.kind === "subagent_child" && thread.parentThreadId) {
      const children = childrenByParent.get(thread.parentThreadId) ?? [];
      children.push(thread);
      childrenByParent.set(thread.parentThreadId, children);
    } else {
      parentThreads.push(thread);
    }
  }

  const ordered: ThreadSummary[] = [];
  for (const thread of parentThreads) {
    ordered.push(thread);
    const children = childrenByParent.get(thread.id);
    if (!children) continue;
    ordered.push(...children.sort((a, b) => (a.childOrder ?? 0) - (b.childOrder ?? 0) || a.updatedAt.localeCompare(b.updatedAt)));
    childrenByParent.delete(thread.id);
  }

  for (const children of childrenByParent.values()) {
    ordered.push(...children);
  }

  return ordered;
}

export function compareSidebarThreads(
  a: ThreadSummary,
  b: ThreadSummary,
  aIndex: number,
  bIndex: number,
  settings: SidebarOrganizeSettings,
): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  if (settings.organize === "chats-first") {
    const aHasChat = a.lastMessagePreview.trim() ? 0 : 1;
    const bHasChat = b.lastMessagePreview.trim() ? 0 : 1;
    if (aHasChat !== bHasChat) return aHasChat - bHasChat;
  }
  const key = settings.sort === "created" ? "createdAt" : "updatedAt";
  return b[key].localeCompare(a[key]) || aIndex - bIndex;
}

export function AutomationPaneIcon({ pane }: { pane: AutomationPane }) {
  if (pane === "home") return <Home size={15} />;
  if (pane === "local_tasks") return <CalendarClock size={15} />;
  if (pane === "workflow_agent") return workflowRecorderSurface.legacyCompilerEnabled ? <Bot size={15} /> : <MessageCircle size={15} />;
  if (pane === "workflow_lab") return <Brain size={15} />;
  if (pane === "schedules") return <CalendarPlus size={15} />;
  if (pane === "runs_reviews") return <ListFilter size={15} />;
  return <Folder size={15} />;
}

export function ProjectsHeader({
  popover,
  collapsed,
  organize,
  onToggleCollapse,
  onTogglePopover,
  onCreateWorkspace,
  onOpenWorkspace,
  onOrganizeChange,
}: {
  popover?: ProjectPopover;
  collapsed: boolean;
  organize: SidebarOrganizeSettings;
  onToggleCollapse: () => void;
  onTogglePopover: (popover: ProjectPopover) => void;
  onCreateWorkspace: () => void;
  onOpenWorkspace: () => void;
  onOrganizeChange: (input: Partial<SidebarOrganizeSettings>) => void;
}) {
  return (
    <div className="projects-header-wrap">
      <div className="projects-header">
        <span>Projects</span>
        <div className="projects-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            title={collapsed ? "Expand all projects" : "Collapse all projects"}
            aria-label={collapsed ? "Expand all projects" : "Collapse all projects"}
            onClick={onToggleCollapse}
          >
            <Minimize2 size={16} />
          </button>
          <button
            type="button"
            className={`sidebar-icon-button ${popover === "organize" ? "active" : ""}`}
            title="Filter, sort, and organize chats"
            aria-label="Filter, sort, and organize chats"
            onClick={() => onTogglePopover("organize")}
          >
            <ListFilter size={16} />
          </button>
          <button
            type="button"
            className={`sidebar-icon-button ${popover === "add" ? "active" : ""}`}
            title="Add new project"
            aria-label="Add new project"
            onClick={() => onTogglePopover("add")}
          >
            <FolderPlus size={17} />
          </button>
        </div>
      </div>

      {popover === "add" && (
        <div className="sidebar-popover project-add-popover">
          <button type="button" className="sidebar-menu-item" onClick={onCreateWorkspace}>
            <Plus size={18} />
            <span>Start from scratch</span>
          </button>
          <button type="button" className="sidebar-menu-item" onClick={onOpenWorkspace}>
            <FolderOpen size={18} />
            <span>Use an existing folder</span>
          </button>
        </div>
      )}

      {popover === "organize" && (
        <div className="sidebar-popover organize-popover">
          <SidebarMenuLabel>Organize</SidebarMenuLabel>
          <SidebarMenuItem
            icon={<FolderOpen size={18} />}
            label="By project"
            selected={organize.organize === "project"}
            onClick={() => onOrganizeChange({ organize: "project" })}
          />
          <SidebarMenuItem
            icon={<Clock size={18} />}
            label="Chronological list"
            selected={organize.organize === "chronological"}
            onClick={() => onOrganizeChange({ organize: "chronological" })}
          />
          <SidebarMenuItem
            icon={<MessageCircle size={18} />}
            label="Chats first"
            selected={organize.organize === "chats-first"}
            onClick={() => onOrganizeChange({ organize: "chats-first" })}
          />
          <SidebarMenuDivider />
          <SidebarMenuLabel>Sort by</SidebarMenuLabel>
          <SidebarMenuItem
            icon={<CalendarPlus size={18} />}
            label="Created"
            selected={organize.sort === "created"}
            onClick={() => onOrganizeChange({ sort: "created" })}
          />
          <SidebarMenuItem
            icon={<RefreshCw size={18} />}
            label="Updated"
            selected={organize.sort === "updated"}
            onClick={() => onOrganizeChange({ sort: "updated" })}
          />
          <SidebarMenuDivider />
          <SidebarMenuLabel>Show</SidebarMenuLabel>
          <SidebarMenuItem
            icon={<MessageCircle size={18} />}
            label="All chats"
            selected={organize.show === "all"}
            onClick={() => onOrganizeChange({ show: "all" })}
          />
          <SidebarMenuItem
            icon={<Star size={18} />}
            label="Relevant"
            selected={organize.show === "relevant"}
            onClick={() => onOrganizeChange({ show: "relevant" })}
          />
        </div>
      )}
    </div>
  );
}

export function AutomationSidebar({
  folders,
  selectedPane,
  selectedFolderId,
  selectedThreadId,
  collapsed,
  popover,
  error,
  onToggleCollapse,
  onTogglePopover,
  onCreateFolder,
  onRefresh,
  onSelectPane,
  onSelectFolder,
  onSelectThread,
}: {
  folders: AutomationFolderSummary[];
  selectedPane: AutomationPane;
  selectedFolderId?: string;
  selectedThreadId?: string;
  collapsed: boolean;
  popover?: AutomationPopover;
  error?: string;
  onToggleCollapse: () => void;
  onTogglePopover: (popover: AutomationPopover) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRefresh: () => void;
  onSelectPane: (pane: AutomationPane) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectThread: (thread: AutomationThreadSummary) => void;
}) {
  const [folderName, setFolderName] = useState("");
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0];
  const paneItems: Array<{ id: AutomationPane; label: string; detail: string }> = [
    { id: "home", label: "Home", detail: "Dashboard" },
    { id: "local_tasks", label: "Local Tasks", detail: "Agent jobs" },
    { id: "workflow_agent", label: workflowRecorderSurface.newWorkflowLabel, detail: workflowRecorderSurface.newWorkflowDetail },
    { id: "workflow_lab", label: "Workflow Lab", detail: "Improve" },
    { id: "schedules", label: "Schedules", detail: "Timing" },
    { id: "runs_reviews", label: "Runs And Reviews", detail: "Audits" },
  ];
  return (
    <>
      <div className="workspace-block">
        <div className="projects-header-wrap">
          <div className="projects-header">
            <span className="automation-sidebar-title">
              Automations
              <InfoTooltip text={automationHelpText} className="heading-info-tooltip" />
            </span>
            <div className="projects-actions">
              <button
                type="button"
                className="sidebar-icon-button"
                title={collapsed ? "Expand automation folders" : "Collapse automation folders"}
                aria-label={collapsed ? "Expand automation folders" : "Collapse automation folders"}
                onClick={onToggleCollapse}
              >
                <Minimize2 size={16} />
              </button>
              <button
                type="button"
                className={`sidebar-icon-button ${popover === "organize" ? "active" : ""}`}
                title="Refresh automations"
                aria-label="Refresh automations"
                onClick={() => {
                  onRefresh();
                  onTogglePopover("organize");
                }}
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                className={`sidebar-icon-button ${popover === "add" ? "active" : ""}`}
                title="Add automation folder"
                aria-label="Add automation folder"
                onClick={() => onTogglePopover("add")}
              >
                <FolderPlus size={17} />
              </button>
            </div>
          </div>
          {popover === "add" && (
            <div className="sidebar-popover project-add-popover">
              <SidebarMenuLabel>New Folder</SidebarMenuLabel>
              <input
                className="sidebar-popover-input"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Folder name"
                maxLength={120}
              />
              <button
                type="button"
                className="sidebar-menu-item"
                onClick={() => {
                  void onCreateFolder(folderName);
                  setFolderName("");
                }}
              >
                <FolderPlus size={18} />
                <span>Create folder</span>
              </button>
            </div>
          )}
          {popover === "organize" && (
            <div className="sidebar-popover organize-popover">
              <SidebarMenuLabel>Automations</SidebarMenuLabel>
              <SidebarMenuItem icon={<RefreshCw size={18} />} label="Refresh" selected={false} onClick={onRefresh} />
            </div>
          )}
        </div>
      </div>
      <div className="project-list automation-folder-list">
        {error && <p className="sidebar-error">{error}</p>}
        <section className="automation-sidebar-system">
          <SidebarMenuLabel>Areas</SidebarMenuLabel>
          <div className="automation-pane-list">
            {paneItems.map((pane) => (
              <button
                key={pane.id}
                type="button"
                className={`workspace-button automation-pane-button ${selectedPane === pane.id && !selectedThreadId ? "active-project" : ""}`}
                onClick={() => onSelectPane(pane.id)}
                title={activePaneTooltip(pane.id)}
              >
                <AutomationPaneIcon pane={pane.id} />
                <span>{pane.label}</span>
                <small>{pane.detail}</small>
              </button>
            ))}
          </div>
        </section>
        <SidebarMenuLabel>Folders</SidebarMenuLabel>
        {folders.map((folder) => {
          const selected = selectedPane === "folder" && folder.id === selectedFolder?.id;
          return (
            <section className="project-group" key={folder.id}>
              <button
                type="button"
                className={`workspace-button automation-folder-button ${selected ? "active-project" : ""}`}
                onClick={() => onSelectFolder(folder.id)}
                title={`${folder.name} automation folder`}
              >
                {folder.kind === "home" ? <Home size={15} /> : <Folder size={15} />}
                <span>{folder.name}</span>
                <small>{folder.threads.length}</small>
                {!collapsed && folder.threads.length > 0 && <ChevronDown size={14} />}
              </button>
              {!collapsed &&
                (folder.threads.length > 0 ? (
                  <div className="thread-list nested">
                    {folder.threads.map((thread) => (
                      <button
                        key={thread.id}
                        type="button"
                        className={`thread-row automation-thread-row ${selectedThreadId === thread.id ? "active" : ""}`}
                        title={thread.title}
                        onClick={() => onSelectThread(thread)}
                      >
                        <span className="thread-row-main">
                          <span className="thread-title" title={thread.title}>
                            {thread.title}
                          </span>
                          <span className="thread-row-meta">
                            {thread.latestRun?.status === "running" && <LoaderCircle size={12} className="spin" />}
                            <span
                              className={`thread-indicator ${automationIndicatorKind(thread.status)}`}
                              title={formatTaskState(thread.status)}
                            >
                              <ThreadIndicatorIcon kind={automationIndicatorKind(thread.status)} />
                            </span>
                          </span>
                        </span>
                        <span className="thread-preview">
                          {formatTaskState(thread.status)} · {thread.projectName}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <button type="button" className="no-chats-row" onClick={() => onSelectFolder(folder.id)}>
                    No automations
                  </button>
                ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

export function WorkflowAgentSidebar({
  folders,
  workflowRecordingLibrary,
  selectedFolderId,
  selectedThreadId,
  selectedPlaybookId,
  collapsed,
  popover,
  error,
  onToggleCollapse,
  onTogglePopover,
  onCreateFolder,
  onRefresh,
  onComposeInFolder,
  onSelectFolder,
  onSelectThread,
  onSelectPlaybook,
}: {
  folders: WorkflowAgentFolderSummary[];
  workflowRecordingLibrary: WorkflowRecordingLibraryEntry[];
  selectedFolderId?: string;
  selectedThreadId?: string;
  selectedPlaybookId?: string;
  collapsed: boolean;
  popover?: AutomationPopover;
  error?: string;
  onToggleCollapse: () => void;
  onTogglePopover: (popover: AutomationPopover) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRefresh: () => void;
  onComposeInFolder: (folderId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectThread: (thread: WorkflowAgentThreadSummary) => void;
  onSelectPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
}) {
  const [folderName, setFolderName] = useState("");
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0];
  const playbookRows = workflowRecorderLibrarySidebarRows(workflowRecordingLibrary);
  const playbookById = new Map(workflowRecordingLibrary.map((playbook) => [playbook.id, playbook]));
  return (
    <>
      <div className="workspace-block">
        <div className="projects-header-wrap">
          <div className="projects-header">
            <span className="automation-sidebar-title">
              {workflowRecorderSurface.sidebarTitle}
              <InfoTooltip text={automationHelpText} className="heading-info-tooltip" />
            </span>
            <div className="projects-actions">
              <button
                type="button"
                className="sidebar-icon-button"
                title={collapsed ? "Expand workflow folders" : "Collapse workflow folders"}
                aria-label={collapsed ? "Expand workflow folders" : "Collapse workflow folders"}
                onClick={onToggleCollapse}
              >
                <Minimize2 size={16} />
              </button>
              <button
                type="button"
                className={`sidebar-icon-button ${popover === "organize" ? "active" : ""}`}
                title={workflowRecorderSurface.refreshLabel}
                aria-label={workflowRecorderSurface.refreshLabel}
                onClick={() => {
                  onRefresh();
                  onTogglePopover("organize");
                }}
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                className={`sidebar-icon-button ${popover === "add" ? "active" : ""}`}
                title="Add workflow folder"
                aria-label="Add workflow folder"
                onClick={() => onTogglePopover("add")}
              >
                <FolderPlus size={17} />
              </button>
            </div>
          </div>
          {popover === "add" && (
            <div className="sidebar-popover project-add-popover">
              <SidebarMenuLabel>{workflowRecorderSurface.newFolderLabel}</SidebarMenuLabel>
              <input
                className="sidebar-popover-input"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Folder name"
                maxLength={120}
              />
              <button
                type="button"
                className="sidebar-menu-item"
                onClick={() => {
                  void onCreateFolder(folderName);
                  setFolderName("");
                }}
              >
                <FolderPlus size={18} />
                <span>Create folder</span>
              </button>
            </div>
          )}
          {popover === "organize" && (
            <div className="sidebar-popover organize-popover">
              <SidebarMenuLabel>{workflowRecorderSurface.sidebarTitle}</SidebarMenuLabel>
              <SidebarMenuItem icon={<RefreshCw size={18} />} label="Refresh" selected={false} onClick={onRefresh} />
            </div>
          )}
        </div>
      </div>
      <div className="project-list automation-folder-list">
        {error && <p className="sidebar-error">{error}</p>}
        <SidebarMenuLabel>{workflowRecorderSurface.folderLabel}</SidebarMenuLabel>
        {folders.map((folder) => {
          const selected = folder.id === selectedFolder?.id;
          return (
            <section className="project-group" key={folder.id}>
              <div className="project-row-shell">
                <button
                  type="button"
                  className={`workspace-button automation-folder-button ${selected && !selectedThreadId && !selectedPlaybookId ? "active-project" : ""}`}
                  onClick={() => onSelectFolder(folder.id)}
                  title={`${folder.name} ${workflowRecorderSurface.legacyCompilerEnabled ? "workflow" : "recording"} folder`}
                >
                  {folder.kind === "home" ? <Home size={15} /> : <Folder size={15} />}
                  <span>{folder.name}</span>
                  <small>{folder.threads.length}</small>
                  {!collapsed && folder.threads.length > 0 && <ChevronDown size={14} />}
                </button>
                <div className="project-row-actions">
                  <button
                    type="button"
                    className="project-compose-icon-button"
                    title={`${workflowRecorderSurface.newWorkflowLabel} in ${folder.name}`}
                    aria-label={`${workflowRecorderSurface.newWorkflowLabel} in ${folder.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onComposeInFolder(folder.id);
                    }}
                  >
                    <SquarePen size={15} />
                  </button>
                </div>
              </div>
              {!collapsed &&
                (folder.threads.length > 0 ? (
                  <div className="thread-list nested">
                    {folder.threads.map((thread) => (
                      <button
                        key={thread.id}
                        type="button"
                        className={`thread-row automation-thread-row ${selectedThreadId === thread.id ? "active" : ""}`}
                        title={thread.title}
                        onClick={() => onSelectThread(thread)}
                      >
                        <span className="thread-row-main">
                          <span className="thread-title" title={thread.title}>
                            {thread.title}
                          </span>
                          <span className="thread-row-meta">
                            {thread.phase === "running" && <LoaderCircle size={12} className="spin" />}
                            <span
                              className={`thread-indicator ${automationIndicatorKind(thread.status)}`}
                              title={formatTaskState(thread.status)}
                            >
                              <ThreadIndicatorIcon kind={automationIndicatorKind(thread.status)} />
                            </span>
                          </span>
                        </span>
                        <span className="thread-preview">
                          {formatTaskState(thread.phase)} · {thread.projectName}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <button type="button" className="no-chats-row" onClick={() => onSelectFolder(folder.id)}>
                    {workflowRecorderSurface.emptyFolderLabel}
                  </button>
                ))}
            </section>
          );
        })}
        {!workflowRecorderSurface.legacyCompilerEnabled && (
          <section className="project-group">
            <div className="project-row-shell">
              <button
                type="button"
                className={`workspace-button automation-folder-button ${selectedPlaybookId ? "active-project" : ""}`}
                onClick={() => {
                  const first = playbookRows[0] ? playbookById.get(playbookRows[0].id) : undefined;
                  if (first) onSelectPlaybook(first);
                  else onSelectFolder(selectedFolder?.id ?? "home");
                }}
                title="Saved workflow playbooks"
              >
                <Package size={15} />
                <span>Saved Playbooks</span>
                <small>{playbookRows.length}</small>
                {!collapsed && playbookRows.length > 0 && <ChevronDown size={14} />}
              </button>
            </div>
            {!collapsed &&
              (playbookRows.length > 0 ? (
                <div className="thread-list nested">
                  {playbookRows.map((row) => {
                    const playbook = playbookById.get(row.id);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        className={`thread-row automation-thread-row workflow-playbook-thread-row ${selectedPlaybookId === row.id ? "active" : ""}`}
                        title={row.title}
                        onClick={() => {
                          if (playbook) onSelectPlaybook(playbook);
                        }}
                      >
                        <span className="thread-row-main">
                          <span className="thread-title" title={row.title}>
                            {row.title}
                          </span>
                          <span className="thread-row-meta">
                            <span className={`thread-indicator ${row.enabled ? "awaiting" : "idle"}`} title={row.statusLabel}>
                              <ThreadIndicatorIcon kind={row.enabled ? "awaiting" : "idle"} />
                            </span>
                          </span>
                        </span>
                        <span className="thread-preview" title={`${row.statusLabel} · ${row.toolLabel}`} data-ui-allow-truncation="true">
                          {row.statusLabel} · {row.toolLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <button type="button" className="no-chats-row" onClick={() => onSelectFolder(selectedFolder?.id ?? "home")}>
                  No saved playbooks
                </button>
              ))}
          </section>
        )}
      </div>
    </>
  );
}
