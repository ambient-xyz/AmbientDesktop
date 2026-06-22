import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AutomationThreadSummary } from "../../shared/automationTypes";
import type { DesktopState } from "../../shared/desktopTypes";
import type { WorkflowCompileProgress, WorkflowExplorationProgress } from "../../shared/workflowTypes";
import {
  createAppAutomationsWorkspaceProps,
  createAppAutomationsWorkspacePropsForApp,
  type AppAutomationsWorkspacePropsInput,
  type AppAutomationsWorkspacePropsForAppInput,
} from "./AppAutomationsWorkspaceProps";

describe("App automations workspace props", () => {
  it("derives automation route state from the active desktop state", () => {
    const project = { id: "project-1", name: "Project", path: "/repo" };
    const props = createAppAutomationsWorkspaceProps(
      baseInput({
        selectedAutomationPane: "workflow_agent",
        selectedThread: { id: "automation-thread-1" } as AutomationThreadSummary,
        state: desktopState({
          activeThreadId: "thread-2",
          projects: [project],
          settings: {
            model: "ambient-model",
            permissionMode: "full-access",
            thinkingLevel: "high",
          },
          workspace: { name: "Active Project", path: "/active-project" },
        }),
      }),
    );

    expect(props.activePane).toBe("folder");
    expect(props.activeProjectName).toBe("Active Project");
    expect(props.activeProjectPath).toBe("/active-project");
    expect(props.activeThreadId).toBe("thread-2");
    expect(props.projects).toEqual([project]);
    expect(props.permissionMode).toBe("full-access");
    expect(props.model).toBe("ambient-model");
    expect(props.thinkingLevel).toBe("high");
    expect(props.workspacePath).toBe("/active-project");
  });

  it("keeps automation workspace callback adapters stable", async () => {
    const exploration = statefulSetter<Record<string, WorkflowExplorationProgress | undefined>>({});
    const compile = statefulSetter<WorkflowCompileProgress[]>([{ message: "Compiling" } as WorkflowCompileProgress]);
    const revision = statefulSetter(4);
    const refreshWorkflowRecordingLibrary = vi.fn(async () => undefined);
    const props = createAppAutomationsWorkspaceProps(
      baseInput({
        refreshWorkflowRecordingLibrary,
        setWorkflowCompileProgress: compile.set,
        setWorkflowExplorationProgressByThreadId: exploration.set,
        setWorkflowRevision: revision.set,
      }),
    );
    const progress = { status: "running" } as WorkflowExplorationProgress;

    props.onWorkflowExplorationProgressChanged("workflow-thread-1", progress);
    props.onWorkflowCompileProgressReset();
    props.onWorkflowRevisionChanged();
    await props.onRefreshWorkflowRecordingLibrary();

    expect(exploration.value).toEqual({ "workflow-thread-1": progress });
    expect(compile.value).toEqual([]);
    expect(revision.value).toBe(5);
    expect(refreshWorkflowRecordingLibrary).toHaveBeenCalledOnce();
  });

  it("packs App automation owner groups into automation workspace props", async () => {
    const folders = [{ id: "folder-1" }];
    const workflowAgentFolders = [{ id: "agent-folder-1" }];
    const setAutomationFolders = vi.fn();
    const setWorkflowAgentFolders = vi.fn();
    const automationFolderControls = {
      moveAutomationThread: vi.fn(async () => undefined),
    };
    const automationSelectionControls = {
      openAutomationRunThread: vi.fn(async () => undefined),
      selectAutomationPane: vi.fn(),
      selectAutomationThread: vi.fn(),
      selectWorkflowAgentThread: vi.fn(),
      selectWorkflowRecordingForLab: vi.fn(),
    };
    const permissionActions = {
      revokePermissionGrant: vi.fn(async () => undefined),
      revokePermissionGrantIds: vi.fn(async () => undefined),
    };
    const previewActions = {
      onOpenMediaModal: vi.fn(),
      onPreviewLocalPath: vi.fn(),
      onPreviewPath: vi.fn(),
    };
    const projectActions = {
      onCreateProject: vi.fn(async () => undefined),
      onDesktopStateChanged: vi.fn(),
    };
    const workflowRecordingActions = {
      archiveWorkflowRecordingPlaybook: vi.fn(),
      restoreWorkflowRecordingVersion: vi.fn(async () => undefined),
      setWorkflowRecordingEnabled: vi.fn(async () => undefined),
      startWorkflowRecording: vi.fn(async () => true),
      unarchiveWorkflowRecordingPlaybook: vi.fn(),
    };
    const refreshWorkflowRecordingLibrary = vi.fn(async () => undefined);
    const setWorkflowLibraryIncludeArchived = vi.fn();
    const workflowRecordingLibraryControls = {
      refreshWorkflowRecordingLibrary,
      setWorkflowLibraryIncludeArchived,
      workflowLibraryIncludeArchived: true,
      workflowRecordingLibrary: [{ id: "recording-1" }],
    };
    const workflowRecordingPlaybookActions = {
      editWorkflowRecordingPlaybookInChat: vi.fn(),
    };
    const compile = statefulSetter<WorkflowCompileProgress[]>([{ message: "Compiling" } as WorkflowCompileProgress]);
    const exploration = statefulSetter<Record<string, WorkflowExplorationProgress | undefined>>({});
    const revision = statefulSetter(6);
    const workflowRuntimeState = {
      orchestrationAutoRevision: 7,
      orchestrationRevision: 8,
      setWorkflowCompileProgress: compile.set,
      setWorkflowExplorationProgressByThreadId: exploration.set,
      setWorkflowRevision: revision.set,
      workflowCompileProgress: [{ message: "Compiling" }],
      workflowDiscoveryProgress: { threadId: "workflow-thread-1" },
      workflowExplorationProgressByThreadId: {},
      workflowRevision: 9,
    };

    const props = createAppAutomationsWorkspacePropsForApp({
      automationFolderControls,
      automationSelectionControls,
      automationShellState: {
        automationFolders: folders,
        selectedAutomationPane: "workflow_agent",
        setAutomationFolders,
        setWorkflowAgentFolders,
        workflowAgentFolders,
      },
      permissionActions,
      permissions: {
        permissionAudit: [],
        permissionGrantRevoking: "grant-1",
        permissionGrants: [{ id: "grant-1" }],
      },
      previewActions,
      projectActions,
      selected: {
        selectedFolder: { id: "folder-1" },
        selectedThread: undefined,
        selectedWorkflowAgentFolder: { id: "agent-folder-1" },
        selectedWorkflowAgentThread: undefined,
        selectedWorkflowRecording: { id: "recording-1" },
      },
      state: desktopState({ activeThreadId: "active-thread-1" }),
      workflowRecordingActions,
      workflowRecordingLibraryControls,
      workflowRecordingPlaybookActions,
      workflowRuntimeState,
    } as unknown as AppAutomationsWorkspacePropsForAppInput);
    const progress = { status: "running" } as WorkflowExplorationProgress;

    expect(props.folders).toBe(folders);
    expect(props.workflowAgentFolders).toBe(workflowAgentFolders);
    expect(props.onFoldersChanged).toBe(setAutomationFolders);
    expect(props.onWorkflowAgentFoldersChanged).toBe(setWorkflowAgentFolders);
    expect(props.onMoveThread).toBe(automationFolderControls.moveAutomationThread);
    expect(props.onOpenRunThread).toBe(automationSelectionControls.openAutomationRunThread);
    expect(props.onSelectPane).toBe(automationSelectionControls.selectAutomationPane);
    expect(props.onSelectThread).toBe(automationSelectionControls.selectAutomationThread);
    expect(props.onSelectWorkflowAgentThread).toBe(automationSelectionControls.selectWorkflowAgentThread);
    expect(props.onSelectWorkflowRecordingPlaybook).toBe(automationSelectionControls.selectWorkflowRecordingForLab);
    expect(props.onRevokePermissionGrant).toBe(permissionActions.revokePermissionGrant);
    expect(props.onRevokePermissionGrantIds).toBe(permissionActions.revokePermissionGrantIds);
    expect(props.onPreviewPath).toBe(previewActions.onPreviewPath);
    expect(props.onCreateProject).toBe(projectActions.onCreateProject);
    expect(props.onDesktopStateChanged).toBe(projectActions.onDesktopStateChanged);
    expect(props.onArchiveWorkflowRecordingPlaybook).toBe(workflowRecordingActions.archiveWorkflowRecordingPlaybook);
    expect(props.onStartWorkflowRecording).toBe(workflowRecordingActions.startWorkflowRecording);
    expect(props.onEditWorkflowRecordingPlaybook).toBe(workflowRecordingPlaybookActions.editWorkflowRecordingPlaybookInChat);
    expect(props.onWorkflowLibraryIncludeArchivedChange).toBe(setWorkflowLibraryIncludeArchived);
    expect(props.workflowLibraryIncludeArchived).toBe(true);
    expect(props.activePane).toBe("workflow_agent");
    expect(props.activeThreadId).toBe("active-thread-1");

    props.onWorkflowExplorationProgressChanged("workflow-thread-1", progress);
    props.onWorkflowCompileProgressReset();
    props.onWorkflowRevisionChanged();
    await props.onRefreshWorkflowRecordingLibrary();

    expect(exploration.value).toEqual({ "workflow-thread-1": progress });
    expect(compile.value).toEqual([]);
    expect(revision.value).toBe(7);
    expect(refreshWorkflowRecordingLibrary).toHaveBeenCalledOnce();
  });
});

function baseInput(input: Partial<AppAutomationsWorkspacePropsInput> = {}): AppAutomationsWorkspacePropsInput {
  const noop = vi.fn();
  const compile = statefulSetter<WorkflowCompileProgress[]>([]);
  const exploration = statefulSetter<Record<string, WorkflowExplorationProgress | undefined>>({});
  const revision = statefulSetter(1);
  return {
    folders: [],
    onArchiveWorkflowRecordingPlaybook: noop,
    onCreateProject: vi.fn(async () => undefined),
    onDesktopStateChanged: noop,
    onEditWorkflowRecordingPlaybook: noop,
    onFoldersChanged: noop,
    onMoveThread: vi.fn(async () => undefined),
    onOpenMediaModal: noop,
    onOpenRunThread: vi.fn(async () => undefined),
    onPreviewLocalPath: noop,
    onPreviewPath: noop,
    onRestoreWorkflowRecordingVersion: vi.fn(async () => undefined),
    onRevokePermissionGrant: vi.fn(async () => undefined),
    onRevokePermissionGrantIds: vi.fn(async () => undefined),
    onSelectPane: noop,
    onSelectThread: noop,
    onSelectWorkflowAgentThread: noop,
    onSelectWorkflowRecordingPlaybook: noop,
    onSetWorkflowRecordingEnabled: vi.fn(async () => undefined),
    onStartWorkflowRecording: vi.fn(async () => true),
    onUnarchiveWorkflowRecordingPlaybook: noop,
    onWorkflowAgentFoldersChanged: noop,
    onWorkflowLibraryIncludeArchivedChange: noop,
    orchestrationAutoRevision: 2,
    orchestrationRevision: 1,
    permissionAudit: [],
    permissionGrantRevoking: undefined,
    permissionGrants: [],
    refreshWorkflowRecordingLibrary: vi.fn(async () => undefined),
    selectedAutomationPane: "home",
    selectedFolder: undefined,
    selectedThread: undefined,
    selectedWorkflowAgentFolder: undefined,
    selectedWorkflowAgentThread: undefined,
    selectedWorkflowRecording: undefined,
    setWorkflowCompileProgress: compile.set,
    setWorkflowExplorationProgressByThreadId: exploration.set,
    setWorkflowRevision: revision.set,
    state: desktopState(),
    workflowAgentFolders: [],
    workflowCompileProgress: [],
    workflowDiscoveryProgress: undefined,
    workflowExplorationProgressByThreadId: {},
    workflowLibraryIncludeArchived: false,
    workflowRecordingLibrary: [],
    workflowRevision: 3,
    ...input,
  } as unknown as AppAutomationsWorkspacePropsInput;
}

function desktopState(input: Record<string, unknown> = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    projects: [],
    settings: {
      model: "default-model",
      permissionMode: "workspace",
      thinkingLevel: "medium",
    },
    workspace: { name: "Project", path: "/project" },
    ...input,
  } as unknown as DesktopState;
}

function statefulSetter<T>(initial: T): {
  readonly value: T;
  set: Dispatch<SetStateAction<T>>;
} {
  let value = initial;
  const set: Dispatch<SetStateAction<T>> = vi.fn((next) => {
    value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
  }) as Dispatch<SetStateAction<T>>;
  return {
    get value() {
      return value;
    },
    set,
  };
}
