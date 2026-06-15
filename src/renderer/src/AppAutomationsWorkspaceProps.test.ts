import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  AutomationThreadSummary,
  DesktopState,
  WorkflowCompileProgress,
  WorkflowExplorationProgress,
} from "../../shared/types";
import {
  createAppAutomationsWorkspaceProps,
  type AppAutomationsWorkspacePropsInput,
} from "./AppAutomationsWorkspaceProps";

describe("App automations workspace props", () => {
  it("derives automation route state from the active desktop state", () => {
    const project = { id: "project-1", name: "Project", path: "/repo" };
    const props = createAppAutomationsWorkspaceProps(baseInput({
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
    }));

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
    const props = createAppAutomationsWorkspaceProps(baseInput({
      refreshWorkflowRecordingLibrary,
      setWorkflowCompileProgress: compile.set,
      setWorkflowExplorationProgressByThreadId: exploration.set,
      setWorkflowRevision: revision.set,
    }));
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
    onStartWorkflowRecording: vi.fn(async () => undefined),
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
