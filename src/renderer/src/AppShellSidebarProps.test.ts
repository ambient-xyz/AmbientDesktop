import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkflowAgentFolderSummary, WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import {
  createAppShellSidebarProps,
  createAppShellSidebarPropsForApp,
  type AppShellSidebarPropsForAppInput,
  type AppShellSidebarPropsInput,
} from "./AppShellSidebarProps";
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "./sidebarLayout";

type DesktopStateInput = Omit<Partial<DesktopState>, "workspace"> & {
  workspace?: Partial<DesktopState["workspace"]>;
};

describe("App shell sidebar props", () => {
  it("derives shell values from desktop state and selected workflow folder", () => {
    const workflowRecordingLibrary = [workflowRecordingEntry({ id: "recording-1" })];
    const props = createAppShellSidebarProps(baseInput({
      selectedWorkflowAgentFolder: { id: "folder-1" },
      state: desktopState({
        activeThreadId: "thread-2",
        workflowRecordingLibrary,
        workspace: { path: "/workspace-root" },
      }),
    }));

    expect(props.minWidth).toBe(MIN_SIDEBAR_WIDTH);
    expect(props.maxWidth).toBe(MAX_SIDEBAR_WIDTH);
    expect(props.activeProjectPath).toBe("/workspace-root");
    expect(props.activeThreadId).toBe("thread-2");
    expect(props.workflowRecordingLibrary).toBe(workflowRecordingLibrary);
    expect(props.selectedWorkflowAgentFolderId).toBe("folder-1");
  });

  it("keeps primary sidebar callback adapters stable", () => {
    const sidebarOpen = stateSetter(true);
    const projectsCollapsed = stateSetter(false);
    const projectPopover = stateSetter<AppShellSidebarPropsInput["projectPopover"]>("add");
    const automationsCollapsed = stateSetter(false);
    const automationPopover = stateSetter<AppShellSidebarPropsInput["automationPopover"]>(undefined);
    const projectBoardOpen = stateSetter(true);
    const createWorkspace = vi.fn();
    const openWorkspace = vi.fn();
    const runPrimaryCreateAction = vi.fn();
    const loadWorkflowAgentFolders = vi.fn();
    const openNewWorkflowComposer = vi.fn();
    const project = { id: "project-1", path: "/project" };
    const projectBoardActions = {
      buildProjectBoard: vi.fn(),
      openProjectBoard: vi.fn(),
    };
    const props = createAppShellSidebarProps(baseInput({
      createWorkspace,
      loadWorkflowAgentFolders,
      openNewWorkflowComposer,
      openWorkspace,
      projectBoardActions,
      runPrimaryCreateAction,
      setAutomationPopover: automationPopover.set,
      setAutomationsCollapsed: automationsCollapsed.set,
      setProjectBoardOpen: projectBoardOpen.set,
      setProjectPopover: projectPopover.set,
      setProjectsCollapsed: projectsCollapsed.set,
      setSidebarOpen: sidebarOpen.set,
    }));

    props.onCloseSidebar();
    props.onPrimaryCreate();
    props.onToggleProjectsCollapsed();
    props.onToggleProjectPopover("add");
    props.onToggleProjectPopover("organize");
    expect(projectPopover.get()).toBe("organize");
    props.onCreateWorkspace();
    expect(projectPopover.get()).toBeUndefined();
    props.onOpenWorkspace();
    props.onBuildProjectBoard(project as Parameters<typeof props.onBuildProjectBoard>[0]);
    props.onCloseProjectBoard();
    props.onOpenProjectBoard(project as Parameters<typeof props.onOpenProjectBoard>[0]);
    props.onToggleAutomationsCollapsed();
    props.onToggleAutomationPopover("add");
    props.onRefreshWorkflowAgentFolders();
    props.onComposeInWorkflowAgentFolder("folder-2");

    expect(sidebarOpen.get()).toBe(false);
    expect(runPrimaryCreateAction).toHaveBeenCalled();
    expect(projectsCollapsed.get()).toBe(true);
    expect(createWorkspace).toHaveBeenCalled();
    expect(openWorkspace).toHaveBeenCalled();
    expect(projectBoardActions.buildProjectBoard).toHaveBeenCalledWith(project);
    expect(projectBoardOpen.get()).toBe(false);
    expect(projectBoardActions.openProjectBoard).toHaveBeenCalledWith(project);
    expect(automationsCollapsed.get()).toBe(true);
    expect(automationPopover.get()).toBe("add");
    expect(loadWorkflowAgentFolders).toHaveBeenCalled();
    expect(openNewWorkflowComposer).toHaveBeenCalledWith("folder-2");
  });

  it("clears the thread context menu when exporting a thread PDF", () => {
    const threadContextMenu = {
      thread: thread({ id: "thread-1", workspacePath: "/workspace" }),
      workspacePath: "/workspace",
      x: 20,
      y: 30,
    };
    const threadContextMenuState = stateSetter<AppShellSidebarPropsInput["threadContextMenu"]>(
      threadContextMenu as AppShellSidebarPropsInput["threadContextMenu"],
    );
    const threadActionInput = vi.fn(() => ({ threadId: "thread-1", workspacePath: "/workspace" }));
    const exportChatPdfThread = vi.fn();
    const props = createAppShellSidebarProps(baseInput({
      exportChatPdfThread,
      setThreadContextMenu: threadContextMenuState.set,
      threadActionInput,
      threadContextMenu: threadContextMenuState.get(),
    }));

    props.onExportThreadPdf();

    expect(threadActionInput).toHaveBeenCalledWith(threadContextMenu);
    expect(threadContextMenuState.get()).toBeUndefined();
    expect(exportChatPdfThread).toHaveBeenCalledWith({ threadId: "thread-1", workspacePath: "/workspace" });
  });

  it("packs App owner groups into sidebar props", () => {
    const workflowRecordingLibrary = [workflowRecordingEntry({ id: "recording-1" })];
    const sidebarProject = project({ id: "project-1", path: "/project" });
    const sidebarThread = thread({ id: "thread-2", workspacePath: "/workspace" });
    const setSidebarOpen = stateSetter(true);
    const openPanel = vi.fn();
    const selectThread = vi.fn();
    const updateSidebarOrganize = vi.fn();
    const selectWorkflowRecordingForSidebar = vi.fn();
    const props = createAppShellSidebarPropsForApp(forAppInput({
      automationShellState: {
        ...forAppInput().automationShellState,
        updateSidebarOrganize,
      } as AppShellSidebarPropsForAppInput["automationShellState"],
      navigationActions: {
        ...forAppInput().navigationActions,
        selectThread,
        selectWorkflowRecordingForSidebar,
      } as AppShellSidebarPropsForAppInput["navigationActions"],
      rightPanelState: { openPanel },
      selectionModel: {
        selectedAutomationFolder: undefined,
        selectedAutomationThread: undefined,
        selectedWorkflowAgentFolder: workflowAgentFolder({ id: "folder-1" }),
        selectedWorkflowAgentThread: undefined,
        sidebarProjects: [sidebarProject],
        sidebarThreads: [sidebarThread],
      },
      selectedWorkflowRecordingId: "recording-1",
      shellUiState: {
        sidebarArea: "automations",
        sidebarWidth: 312,
        setSidebarOpen: setSidebarOpen.set,
      },
      state: desktopState({
        activeThreadId: "thread-2",
        workflowRecordingLibrary,
        workspace: { path: "/workspace-root" },
      }),
    }));

    expect(props.width).toBe(312);
    expect(props.sidebarArea).toBe("automations");
    expect(props.activeProjectPath).toBe("/workspace-root");
    expect(props.activeThreadId).toBe("thread-2");
    expect(props.workflowRecordingLibrary).toBe(workflowRecordingLibrary);
    expect(props.selectedWorkflowAgentFolderId).toBe("folder-1");
    expect(props.selectedWorkflowRecordingId).toBe("recording-1");
    expect(props.sidebarProjects).toEqual([sidebarProject]);
    expect(props.sidebarThreads).toEqual([sidebarThread]);

    props.onCloseSidebar();
    props.onOpenPanel("browser");
    void props.onSelectThread("thread-2", "/workspace");
    props.onOrganizeChange({ sort: "created" });
    props.onSelectWorkflowRecording(workflowRecordingLibrary[0]);

    expect(setSidebarOpen.get()).toBe(false);
    expect(openPanel).toHaveBeenCalledWith("browser");
    expect(selectThread).toHaveBeenCalledWith("thread-2", "/workspace");
    expect(updateSidebarOrganize).toHaveBeenCalledWith({ sort: "created" });
    expect(selectWorkflowRecordingForSidebar).toHaveBeenCalledWith(workflowRecordingLibrary[0]);
  });
});

function stateSetter<T>(initial: T): {
  get: () => T;
  set: Dispatch<SetStateAction<T>>;
} {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
    },
  };
}

function baseInput(input: Partial<AppShellSidebarPropsInput> = {}): AppShellSidebarPropsInput {
  const noop = vi.fn();
  return {
    activeThreadSuppressesProjectBoard: false,
    automationPopover: undefined,
    automationsCollapsed: false,
    beginSidebarResize: noop,
    copyThreadDeeplink: noop,
    copyThreadSessionId: noop,
    copyThreadWorkingDirectory: noop,
    createPermanentProjectWorktree: noop,
    createThreadInProject: noop,
    createWorkflowAgentFolder: vi.fn(async () => undefined),
    createWorkspace: noop,
    exportChatPdfThread: noop,
    loadWorkflowAgentFolders: noop,
    markThreadUnread: noop,
    onArchiveProjectChats: noop,
    onArchiveThread: noop,
    onBeginResize: noop,
    onCreateThreadInProject: noop,
    onCreateWorkflowAgentFolder: vi.fn(async () => undefined),
    onForkThread: noop,
    onOpenPanel: noop,
    onOpenProjectContextMenu: noop,
    onOpenSidebarArea: noop,
    onOpenThreadContextMenu: noop,
    onOpenWorkflowLabArea: noop,
    onOpenWorkflowRecordingsArea: noop,
    onOrganizeChange: noop,
    onRemoveProject: noop,
    onRenameProject: noop,
    onRenameThread: noop,
    onSelectProject: noop,
    onSelectThread: noop,
    onSelectWorkflowAgentFolder: noop,
    onSelectWorkflowAgentThread: noop,
    onSelectWorkflowRecording: noop,
    openNewWorkflowComposer: noop,
    openThreadMiniWindow: noop,
    openWorkspace: noop,
    projectBoardActions: {
      buildProjectBoard: noop,
      openProjectBoard: noop,
    },
    projectBoardBusyProjectIds: new Set(),
    projectBoardOpen: false,
    projectContextMenu: undefined,
    projectPopover: undefined,
    projectsCollapsed: false,
    revealProject: noop,
    revealThread: noop,
    runPrimaryCreateAction: noop,
    selectedAutomationPane: "runs",
    selectedWorkflowAgentFolder: undefined,
    selectedWorkflowAgentThreadId: undefined,
    selectedWorkflowRecordingId: undefined,
    setAutomationPopover: noop,
    setAutomationsCollapsed: noop,
    setProjectBoardOpen: noop,
    setProjectPopover: noop,
    setProjectsCollapsed: noop,
    setSidebarOpen: noop,
    setThreadContextMenu: noop,
    sidebarAgeNow: 0,
    sidebarArea: "projects",
    sidebarOrganize: { organize: "recent" },
    sidebarProjects: [],
    sidebarThreads: [],
    state: desktopState(),
    threadActionInput: noop,
    threadContextMenu: undefined,
    threadRunStatuses: {},
    toggleProjectPinned: noop,
    toggleThreadPinned: noop,
    width: 280,
    workflowAgentFolders: [],
    workflowAgentNavigationError: undefined,
    ...input,
  } as AppShellSidebarPropsInput;
}

function forAppInput(input: Partial<AppShellSidebarPropsForAppInput> = {}): AppShellSidebarPropsForAppInput {
  const base = baseInput();
  const noop = vi.fn();
  const projectBoardOpen = stateSetter(false);
  return {
    automationShellState: {
      automationPopover: base.automationPopover,
      automationsCollapsed: base.automationsCollapsed,
      selectedAutomationPane: base.selectedAutomationPane,
      selectedWorkflowAgentThreadId: base.selectedWorkflowAgentThreadId,
      setAutomationPopover: base.setAutomationPopover,
      setAutomationsCollapsed: base.setAutomationsCollapsed,
      sidebarAgeNow: base.sidebarAgeNow,
      sidebarOrganize: base.sidebarOrganize,
      updateSidebarOrganize: base.onOrganizeChange,
      workflowAgentFolders: base.workflowAgentFolders,
      workflowAgentNavigationError: base.workflowAgentNavigationError,
    },
    beginSidebarResize: base.onBeginResize,
    exportChatPdfThread: base.exportChatPdfThread,
    navigationActions: {
      archiveProjectChats: base.onArchiveProjectChats,
      archiveThread: base.onArchiveThread,
      copyThreadDeeplink: base.copyThreadDeeplink,
      copyThreadSessionId: base.copyThreadSessionId,
      copyThreadWorkingDirectory: base.copyThreadWorkingDirectory,
      createPermanentProjectWorktree: base.createPermanentProjectWorktree,
      createThreadInProject: base.onCreateThreadInProject,
      createWorkflowAgentFolder: base.onCreateWorkflowAgentFolder,
      createWorkspace: base.createWorkspace,
      exportChatPdfThread: base.exportChatPdfThread,
      forkThread: base.onForkThread,
      loadWorkflowAgentFolders: base.loadWorkflowAgentFolders,
      markThreadUnread: base.markThreadUnread,
      openNewWorkflowComposer: base.openNewWorkflowComposer,
      openProjectContextMenu: base.onOpenProjectContextMenu,
      openSidebarArea: base.onOpenSidebarArea,
      openThreadContextMenu: base.onOpenThreadContextMenu,
      openThreadMiniWindow: base.openThreadMiniWindow,
      openWorkflowLabArea: base.onOpenWorkflowLabArea,
      openWorkflowRecordingsArea: base.onOpenWorkflowRecordingsArea,
      openWorkspace: base.openWorkspace,
      removeProject: base.onRemoveProject,
      renameProject: base.onRenameProject,
      renameThread: base.onRenameThread,
      revealProject: base.revealProject,
      revealThread: base.revealThread,
      runPrimaryCreateAction: base.runPrimaryCreateAction,
      selectProject: base.onSelectProject,
      selectThread: base.onSelectThread,
      selectWorkflowAgentFolder: base.onSelectWorkflowAgentFolder,
      selectWorkflowAgentThread: base.onSelectWorkflowAgentThread,
      selectWorkflowRecordingForSidebar: base.onSelectWorkflowRecording,
      threadActionInput: base.threadActionInput,
      toggleProjectPinned: base.toggleProjectPinned,
      toggleThreadPinned: base.toggleThreadPinned,
    },
    projectBoardControls: {
      activeThreadSuppressesProjectBoard: base.activeThreadSuppressesProjectBoard,
      projectBoardActions: base.projectBoardActions,
      projectBoardOpen: projectBoardOpen.get(),
      setProjectBoardOpen: projectBoardOpen.set,
    },
    projectShellState: {
      projectBoardBusyProjectIds: base.projectBoardBusyProjectIds,
      projectContextMenu: base.projectContextMenu,
      projectPopover: base.projectPopover,
      projectsCollapsed: base.projectsCollapsed,
      setProjectPopover: base.setProjectPopover,
      setProjectsCollapsed: base.setProjectsCollapsed,
      setThreadContextMenu: base.setThreadContextMenu,
      threadContextMenu: base.threadContextMenu,
    },
    rightPanelState: {
      openPanel: base.onOpenPanel,
    },
    runActivityState: {
      threadRunStatuses: base.threadRunStatuses,
    },
    selectionModel: {
      selectedAutomationFolder: undefined,
      selectedAutomationThread: undefined,
      selectedWorkflowAgentFolder: base.selectedWorkflowAgentFolder,
      selectedWorkflowAgentThread: undefined,
      sidebarProjects: base.sidebarProjects,
      sidebarThreads: base.sidebarThreads,
    },
    selectedWorkflowRecordingId: base.selectedWorkflowRecordingId,
    shellUiState: {
      sidebarArea: base.sidebarArea,
      sidebarWidth: base.width,
      setSidebarOpen: base.setSidebarOpen,
    },
    state: base.state,
    ...input,
  } as unknown as AppShellSidebarPropsForAppInput;
}

function desktopState(input: DesktopStateInput = {}): DesktopState {
  const {
    workspace,
    ...rest
  } = input;
  return {
    activeThreadId: "thread-1",
    workflowRecordingLibrary: [],
    workspace: {
      path: "/workspace",
      name: "workspace",
      statePath: "/workspace/.ambient/state",
      sessionPath: "/workspace/.ambient/session",
      ...workspace,
    },
    ...rest,
  } as DesktopState;
}

function workflowRecordingEntry(input: Partial<WorkflowRecordingLibraryEntry> & Pick<WorkflowRecordingLibraryEntry, "id">): WorkflowRecordingLibraryEntry {
  return {
    title: input.id,
    version: 1,
    enabled: true,
    savedAt: "2026-06-21T00:00:00.000Z",
    manifestPath: "/recording/manifest.json",
    markdownPath: "/recording/recording.md",
    sidecarPath: "/recording/sidecar.json",
    transcriptPath: "/recording/transcript.jsonl",
    summary: "",
    toolNames: [],
    outputShape: [],
    versions: [],
    ...input,
  };
}

function workflowAgentFolder(input: Partial<WorkflowAgentFolderSummary> & Pick<WorkflowAgentFolderSummary, "id">): WorkflowAgentFolderSummary {
  return {
    kind: "custom",
    name: input.id,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    threads: [],
    ...input,
  };
}

function project(input: Partial<ProjectSummary> & Pick<ProjectSummary, "id" | "path">): ProjectSummary {
  return {
    name: input.id,
    statePath: `${input.path}/.ambient/state`,
    sessionPath: `${input.path}/.ambient/session`,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    threads: [],
    ...input,
  };
}

function thread(input: Partial<ThreadSummary> & Pick<ThreadSummary, "id" | "workspacePath">): ThreadSummary {
  return {
    title: input.id,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "full-access",
    collaborationMode: "agent",
    model: "test-model",
    thinkingLevel: "medium",
    ...input,
  };
}
