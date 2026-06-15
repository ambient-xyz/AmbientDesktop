import { describe, expect, it } from "vitest";

import type {
  AutomationFolderSummary,
  AutomationThreadSummary,
  ProjectSummary,
  ThreadSummary,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
} from "../../shared/types";
import {
  appSidebarSelectionModel,
  selectedAutomationFolderForId,
  selectedAutomationThreadForId,
  selectedWorkflowAgentFolderForId,
  selectedWorkflowAgentThreadForId,
  sidebarThreadsForProjects,
} from "./AppSidebarSelectionModel";
import type { SidebarOrganizeSettings } from "./AppSidebar";

describe("AppSidebarSelectionModel", () => {
  it("flattens organized project threads for chat-first sidebar rendering", () => {
    const projects = [
      project({ id: "project-1", threads: [thread({ id: "thread-1" }), thread({ id: "thread-2" })] }),
      project({ id: "project-2", threads: [thread({ id: "thread-3" })] }),
    ];

    expect(sidebarThreadsForProjects(projects).map((item) => item.id)).toEqual(["thread-1", "thread-2", "thread-3"]);
  });

  it("falls back to the first folder and selects threads across folders", () => {
    const automationFolders = [
      automationFolder({ id: "home", threads: [automationThread({ id: "auto-1", folderId: "home" })] }),
      automationFolder({ id: "later", threads: [automationThread({ id: "auto-2", folderId: "later" })] }),
    ];
    const workflowFolders = [
      workflowFolder({ id: "home", threads: [workflowThread({ id: "workflow-1", folderId: "home" })] }),
      workflowFolder({ id: "later", threads: [workflowThread({ id: "workflow-2", folderId: "later" })] }),
    ];

    expect(selectedAutomationFolderForId(automationFolders, "missing")?.id).toBe("home");
    expect(selectedAutomationThreadForId(automationFolders, "auto-2")?.folderId).toBe("later");
    expect(selectedWorkflowAgentFolderForId(workflowFolders, "missing")?.id).toBe("home");
    expect(selectedWorkflowAgentThreadForId(workflowFolders, "workflow-2")?.folderId).toBe("later");
  });

  it("keeps subagent child threads hidden when subagent UI is disabled", () => {
    const activeParent = thread({ id: "parent", kind: "chat" });
    const child = thread({ id: "child", kind: "subagent_child", parentThreadId: "parent" });
    const model = appSidebarSelectionModel({
      activeThreadId: activeParent.id,
      activeWorkspacePath: "/workspace",
      automationFolders: [],
      projects: [project({ threads: [activeParent, child] })],
      selectedAutomationFolderId: "home",
      selectedAutomationThreadId: undefined,
      selectedWorkflowAgentFolderId: "home",
      selectedWorkflowAgentThreadId: undefined,
      sidebarOrganize: defaultSidebarOrganize,
      subagentUiEnabled: false,
      workflowAgentFolders: [],
    });

    expect(model.sidebarThreads.map((item) => item.id)).toEqual(["parent"]);
    expect(model.selectedAutomationFolder).toBeUndefined();
    expect(model.selectedWorkflowAgentFolder).toBeUndefined();
  });
});

const defaultSidebarOrganize: SidebarOrganizeSettings = {
  organize: "project",
  sort: "updated",
  show: "all",
};

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: overrides.id ?? "project",
    name: overrides.name ?? "Project",
    path: overrides.path ?? "/workspace",
    statePath: overrides.statePath ?? "/workspace/.ambient/state.json",
    sessionPath: overrides.sessionPath ?? "/workspace/.ambient/session",
    threads: overrides.threads ?? [],
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: overrides.id ?? "thread",
    title: overrides.title ?? "Thread",
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    kind: overrides.kind,
    parentThreadId: overrides.parentThreadId,
    workspacePath: overrides.workspacePath ?? "/workspace",
    lastMessagePreview: overrides.lastMessagePreview ?? "",
    permissionMode: overrides.permissionMode ?? "workspace",
    collaborationMode: overrides.collaborationMode ?? "agent",
    model: overrides.model ?? "ambient",
    thinkingLevel: overrides.thinkingLevel ?? "medium",
    ...overrides,
  };
}

function automationFolder(overrides: Partial<AutomationFolderSummary> = {}): AutomationFolderSummary {
  return {
    id: overrides.id ?? "folder",
    name: overrides.name ?? "Folder",
    kind: overrides.kind ?? "custom",
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    threads: overrides.threads ?? [],
    ...overrides,
  };
}

function automationThread(overrides: Partial<AutomationThreadSummary> = {}): AutomationThreadSummary {
  return {
    id: overrides.id ?? "automation-thread",
    title: overrides.title ?? "Automation",
    folderId: overrides.folderId ?? "folder",
    kind: overrides.kind ?? "orchestration_task",
    sourceId: overrides.sourceId ?? "source",
    preview: overrides.preview ?? "Preview",
    status: overrides.status ?? "ready",
    projectName: overrides.projectName ?? "Project",
    projectPath: overrides.projectPath ?? "/workspace",
    badges: overrides.badges ?? [],
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function workflowFolder(overrides: Partial<WorkflowAgentFolderSummary> = {}): WorkflowAgentFolderSummary {
  return {
    id: overrides.id ?? "folder",
    name: overrides.name ?? "Folder",
    kind: overrides.kind ?? "custom",
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    threads: overrides.threads ?? [],
    ...overrides,
  };
}

function workflowThread(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: overrides.id ?? "workflow-thread",
    title: overrides.title ?? "Workflow",
    folderId: overrides.folderId ?? "folder",
    projectName: overrides.projectName ?? "Project",
    projectPath: overrides.projectPath ?? "/workspace",
    initialRequest: overrides.initialRequest ?? "Build a workflow",
    preview: overrides.preview ?? "Preview",
    status: overrides.status ?? "ready",
    traceMode: overrides.traceMode ?? "production",
    discoveryQuestions: overrides.discoveryQuestions ?? [],
    badges: overrides.badges ?? [],
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    phase: overrides.phase ?? "planned",
    ...overrides,
  };
}
