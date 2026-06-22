import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAppAutomationFolderControls } from "./AppAutomationFolderControls";
import { createAppAutomationSelectionControls } from "./AppAutomationSelectionControls";
import {
  createAppNavigationActionsForApp,
  type AppNavigationActionsForAppInput,
} from "./AppNavigationActions";
import { createAppProjectThreadActions } from "./AppProjectThreadActions";
import { createAppWorkflowComposerNavigation } from "./AppShellCommandActions";
import { createAppSidebarAreaControls } from "./AppSidebarAreaControls";
import { createAppWorkspaceNavigationControls } from "./AppWorkspaceNavigationControls";

vi.mock("./AppAutomationFolderControls", () => ({
  createAppAutomationFolderControls: vi.fn(),
}));

vi.mock("./AppAutomationSelectionControls", () => ({
  createAppAutomationSelectionControls: vi.fn(),
}));

vi.mock("./AppProjectThreadActions", () => ({
  createAppProjectThreadActions: vi.fn(),
}));

vi.mock("./AppShellCommandActions", () => ({
  createAppWorkflowComposerNavigation: vi.fn(),
}));

vi.mock("./AppSidebarAreaControls", () => ({
  createAppSidebarAreaControls: vi.fn(),
}));

vi.mock("./AppWorkspaceNavigationControls", () => ({
  createAppWorkspaceNavigationControls: vi.fn(),
}));

function createInput() {
  const focusEnd = vi.fn();
  const input = {
    automationShellState: {
      selectedAutomationFolderId: "automation-folder-1",
      selectedAutomationThreadId: "automation-thread-1",
      selectedWorkflowAgentFolderId: "workflow-folder-1",
      selectedWorkflowAgentThreadId: "workflow-thread-1",
      setAutomationFolders: vi.fn(),
      setAutomationNavigationError: vi.fn(),
      setAutomationPopover: vi.fn(),
      setSelectedAutomationFolderId: vi.fn(),
      setSelectedAutomationPane: vi.fn(),
      setSelectedAutomationThreadId: vi.fn(),
      setSelectedWorkflowAgentFolderId: vi.fn(),
      setSelectedWorkflowAgentThreadId: vi.fn(),
      setSidebarOrganize: vi.fn(),
      setWorkflowAgentFolders: vi.fn(),
      setWorkflowAgentNavigationError: vi.fn(),
    },
    closeProjectBoard: vi.fn(),
    composerShellState: {
      composerInputRef: { current: { focusEnd } },
      setComposerDraft: vi.fn(),
    },
    projectShellState: {
      projectActionDialog: { kind: "remove-project" },
      setProjectActionDialog: vi.fn(),
      setProjectContextMenu: vi.fn(),
      setProjectPopover: vi.fn(),
      setProjectsCollapsed: vi.fn(),
      setThreadActionDialog: vi.fn(),
      setThreadContextMenu: vi.fn(),
      threadActionDialog: { kind: "archive-thread" },
      threadContextMenu: { thread: { id: "thread-1" } },
    },
    rememberDesktopState: vi.fn(),
    rightPanelState: {
      setRightPanel: vi.fn(),
    },
    runActivityState: {
      setRunStatus: vi.fn(),
      setThreadRunStatuses: vi.fn(),
      threadRunStatuses: { "thread-1": "streaming" },
    },
    setSelectedWorkflowRecordingId: vi.fn(),
    setState: vi.fn(),
    shellUiState: {
      setError: vi.fn(),
      setSidebarArea: vi.fn(),
      sidebarArea: "projects",
    },
    state: {
      activeWorkspace: { path: "/repo" },
      projects: [{ id: "project-1", path: "/repo" }],
      workspace: { path: "/repo" },
    },
    workspaceShellState: {
      setWorkspaceRevision: vi.fn(),
    },
    applyCreatedThreadState: vi.fn(),
    applyProjectActionState: vi.fn(),
  } as unknown as AppNavigationActionsForAppInput;

  return { focusEnd, input };
}

describe("App navigation actions", () => {
  const archiveThread = vi.fn();
  const createThread = vi.fn();
  const createWorkflowAgentFolder = vi.fn();
  const loadAutomationFolders = vi.fn();
  const loadWorkflowAgentFolders = vi.fn();
  const openNewWorkflowComposer = vi.fn();
  const openSidebarArea = vi.fn();
  const projectIdForWorkspacePath = vi.fn();
  const selectThread = vi.fn();
  const selectWorkflowAgentThread = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    vi.mocked(createAppProjectThreadActions).mockReturnValue({
      archiveProjectChats: vi.fn(),
      archiveThread,
      copyThreadDeeplink: vi.fn(),
      copyThreadSessionId: vi.fn(),
      copyThreadWorkingDirectory: vi.fn(),
      createPermanentProjectWorktree: vi.fn(),
      forkThread: vi.fn(),
      markThreadUnread: vi.fn(),
      openProjectContextMenu: vi.fn(),
      openThreadContextMenu: vi.fn(),
      openThreadMiniWindow: vi.fn(),
      projectIdForWorkspacePath,
      removeProject: vi.fn(),
      renameProject: vi.fn(),
      renameThread: vi.fn(),
      revealProject: vi.fn(),
      revealThread: vi.fn(),
      threadActionInput: { projectId: "project-1", threadId: "thread-1" },
      toggleProjectPinned: vi.fn(),
      toggleThreadPinned: vi.fn(),
    } as unknown as ReturnType<typeof createAppProjectThreadActions>);
    vi.mocked(createAppAutomationFolderControls).mockReturnValue({
      createWorkflowAgentFolder,
      loadAutomationFolders,
      loadWorkflowAgentFolders,
    } as unknown as ReturnType<typeof createAppAutomationFolderControls>);
    vi.mocked(createAppWorkflowComposerNavigation).mockReturnValue({
      openNewWorkflowComposer,
    } as unknown as ReturnType<typeof createAppWorkflowComposerNavigation>);
    vi.mocked(createAppWorkspaceNavigationControls).mockReturnValue({
      createThread,
      createThreadInProject: vi.fn(),
      createWorkspace: vi.fn(),
      openWorkspace: vi.fn(),
      runPrimaryCreateAction: vi.fn(),
      selectProject: vi.fn(),
      selectThread,
    } as unknown as ReturnType<typeof createAppWorkspaceNavigationControls>);
    vi.mocked(createAppSidebarAreaControls).mockReturnValue({
      openSidebarArea,
      openWorkflowLabArea: vi.fn(),
      openWorkflowRecordingsArea: vi.fn(),
    } as unknown as ReturnType<typeof createAppSidebarAreaControls>);
    vi.mocked(createAppAutomationSelectionControls).mockReturnValue({
      selectWorkflowAgentFolder: vi.fn(),
      selectWorkflowAgentThread,
      selectWorkflowRecordingForSidebar: vi.fn(),
    } as unknown as ReturnType<typeof createAppAutomationSelectionControls>);
  });

  it("constructs navigation owners with App state owner dependencies", () => {
    const { input } = createInput();
    const owners = input;

    createAppNavigationActionsForApp(input);

    expect(createAppProjectThreadActions).toHaveBeenCalledWith(expect.objectContaining({
      applyProjectActionState: input.applyProjectActionState,
      projectActionDialog: owners.projectShellState.projectActionDialog,
      projects: owners.state?.projects,
      setError: owners.shellUiState.setError,
      setProjectActionDialog: owners.projectShellState.setProjectActionDialog,
      setProjectContextMenu: owners.projectShellState.setProjectContextMenu,
      setProjectPopover: owners.projectShellState.setProjectPopover,
      setThreadActionDialog: owners.projectShellState.setThreadActionDialog,
      setThreadContextMenu: owners.projectShellState.setThreadContextMenu,
      threadActionDialog: owners.projectShellState.threadActionDialog,
      threadContextMenu: owners.projectShellState.threadContextMenu,
    }));
    expect(createAppAutomationFolderControls).toHaveBeenCalledWith(expect.objectContaining({
      selectedAutomationFolderId: owners.automationShellState.selectedAutomationFolderId,
      selectedAutomationThreadId: owners.automationShellState.selectedAutomationThreadId,
      selectedWorkflowAgentFolderId: owners.automationShellState.selectedWorkflowAgentFolderId,
      selectedWorkflowAgentThreadId: owners.automationShellState.selectedWorkflowAgentThreadId,
      setAutomationFolders: owners.automationShellState.setAutomationFolders,
      setWorkflowAgentFolders: owners.automationShellState.setWorkflowAgentFolders,
    }));
    expect(createAppWorkflowComposerNavigation).toHaveBeenCalledWith(expect.objectContaining({
      loadWorkflowAgentFolders,
      setAutomationPopover: owners.automationShellState.setAutomationPopover,
      setProjectPopover: owners.projectShellState.setProjectPopover,
      setRightPanel: owners.rightPanelState.setRightPanel,
      setSelectedWorkflowRecordingId: owners.setSelectedWorkflowRecordingId,
      setSidebarArea: owners.shellUiState.setSidebarArea,
    }));
    expect(createAppWorkspaceNavigationControls).toHaveBeenCalledWith(expect.objectContaining({
      activeWorkspacePath: "/repo",
      applyCreatedThreadState: input.applyCreatedThreadState,
      closeProjectBoard: input.closeProjectBoard,
      currentWorkspacePath: "/repo",
      openNewWorkflowComposer,
      projectIdForWorkspacePath,
      rememberDesktopState: input.rememberDesktopState,
      setComposerDraft: owners.composerShellState.setComposerDraft,
      setProjectPopover: owners.projectShellState.setProjectPopover,
      setProjectsCollapsed: owners.projectShellState.setProjectsCollapsed,
      setRunStatus: owners.runActivityState.setRunStatus,
      setSidebarArea: owners.shellUiState.setSidebarArea,
      setState: owners.setState,
      setThreadRunStatuses: owners.runActivityState.setThreadRunStatuses,
      setWorkspaceRevision: owners.workspaceShellState.setWorkspaceRevision,
      sidebarArea: "projects",
      threadRunStatuses: owners.runActivityState.threadRunStatuses,
    }));
    expect(createAppSidebarAreaControls).toHaveBeenCalledWith(expect.objectContaining({
      loadAutomationFolders,
      setAutomationPopover: owners.automationShellState.setAutomationPopover,
      setRightPanel: owners.rightPanelState.setRightPanel,
      setSelectedWorkflowRecordingId: owners.setSelectedWorkflowRecordingId,
      setSidebarArea: owners.shellUiState.setSidebarArea,
      sidebarArea: "projects",
    }));
    expect(createAppAutomationSelectionControls).toHaveBeenCalledWith(expect.objectContaining({
      selectThread,
      setSelectedWorkflowRecordingId: owners.setSelectedWorkflowRecordingId,
      setSidebarArea: owners.shellUiState.setSidebarArea,
    }));
  });

  it("returns the flattened navigation action surface and preserves delayed composer focus", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout });
    const { focusEnd, input } = createInput();

    const actions = createAppNavigationActionsForApp(input);
    const workspaceInput = vi.mocked(createAppWorkspaceNavigationControls).mock.calls[0]?.[0];

    expect(actions.archiveThread).toBe(archiveThread);
    expect(actions.createThread).toBe(createThread);
    expect(actions.createWorkflowAgentFolder).toBe(createWorkflowAgentFolder);
    expect(actions.loadAutomationFolders).toBe(loadAutomationFolders);
    expect(actions.loadWorkflowAgentFolders).toBe(loadWorkflowAgentFolders);
    expect(actions.openNewWorkflowComposer).toBe(openNewWorkflowComposer);
    expect(actions.openSidebarArea).toBe(openSidebarArea);
    expect(actions.projectIdForWorkspacePath).toBe(projectIdForWorkspacePath);
    expect(actions.selectThread).toBe(selectThread);
    expect(actions.selectWorkflowAgentThread).toBe(selectWorkflowAgentThread);

    workspaceInput?.scheduleComposerFocusEnd();
    expect(focusEnd).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(focusEnd).toHaveBeenCalledTimes(1);
  });
});
