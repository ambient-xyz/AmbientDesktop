import { describe, expect, it, vi } from "vitest";
import type { ProjectBoardSummary, ProjectSummary } from "../../shared/projectBoardTypes";
import { projectIdFromWorkspacePath } from "../../shared/projectIdentity";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  activeProjectSummary,
  createProjectRuntimeIpcContextService,
  initialActiveThreadIdForStore,
  permanentWorktreeBranchName,
  workflowAgentControlThread,
  type ProjectRuntimeIpcStore,
} from "./projectRuntimeIpcContextService";

const createdAt = "2026-06-20T01:00:00.000Z";
const updatedAt = "2026-06-20T02:00:00.000Z";

function thread(input: Partial<ThreadSummary> & { id: string; workspacePath?: string }): ThreadSummary {
  const { id, workspacePath, ...rest } = input;
  return {
    id,
    title: input.title ?? input.id,
    workspacePath: workspacePath ?? "/workspace/project",
    createdAt: input.createdAt ?? createdAt,
    updatedAt: input.updatedAt ?? updatedAt,
    lastMessagePreview: input.lastMessagePreview ?? "",
    permissionMode: input.permissionMode ?? "workspace",
    collaborationMode: input.collaborationMode ?? "agent",
    model: input.model ?? "model",
    thinkingLevel: input.thinkingLevel ?? "medium",
    ...rest,
  };
}

class FakeStore implements ProjectRuntimeIpcStore {
  workspace = {
    path: "/workspace/project",
    name: "Project",
    statePath: "/workspace/project/.ambient/state",
    sessionPath: "/workspace/project/.ambient/session",
  };
  threads = [
    thread({ id: "thread-1", createdAt: "2026-06-20T01:00:00.000Z", updatedAt: "2026-06-20T02:00:00.000Z" }),
    thread({ id: "automation-chat", createdAt: "2026-06-20T03:00:00.000Z", updatedAt: "2026-06-20T04:00:00.000Z" }),
    thread({ id: "workflow-chat", createdAt: "2026-06-20T05:00:00.000Z", updatedAt: "2026-06-20T06:00:00.000Z" }),
  ];
  automationThreadIds = ["automation-chat"];
  workflowThreadIds = ["workflow-chat"];
  lastActiveThreadId: string | undefined = "thread-1";
  board: ProjectBoardSummary | undefined;
  workflowThreads = new Map([
    ["workflow-1", { id: "workflow-1", chatThreadId: "workflow-chat", projectPath: "/workspace/workflow-project" }],
  ]);
  questions = new Map([
    ["question-1", { workflowThreadId: "workflow-1" }],
  ]);
  artifacts = new Map([
    ["artifact-1", { workflowThreadId: "workflow-1" }],
    ["artifact-project", {}],
  ]);
  revisions = new Map([
    ["revision-1", { id: "revision-1", workflowThreadId: "workflow-1" }],
    ["revision-other", { id: "revision-other", workflowThreadId: "workflow-other" }],
  ]);

  getWorkspace() {
    return this.workspace;
  }

  listThreads() {
    return this.threads;
  }

  listAutomationThreadChatIds() {
    return this.automationThreadIds;
  }

  listWorkflowAgentThreadChatIds() {
    return this.workflowThreadIds;
  }

  getActiveProjectBoard() {
    return this.board;
  }

  getThread(threadId: string) {
    const found = this.threads.find((item) => item.id === threadId);
    if (!found) throw new Error(`Missing thread ${threadId}`);
    return found;
  }

  getLastActiveThreadId() {
    return this.lastActiveThreadId;
  }

  setLastActiveThreadId(threadId: string) {
    this.lastActiveThreadId = threadId;
  }

  getWorkflowAgentThreadSummary(workflowThreadId: string) {
    const found = this.workflowThreads.get(workflowThreadId);
    if (!found) throw new Error(`Missing workflow thread ${workflowThreadId}`);
    return found;
  }

  getWorkflowDiscoveryQuestion(questionId: string) {
    const found = this.questions.get(questionId);
    if (!found) throw new Error(`Missing question ${questionId}`);
    return found;
  }

  getWorkflowArtifact(artifactId: string) {
    const found = this.artifacts.get(artifactId);
    if (!found) throw new Error(`Missing artifact ${artifactId}`);
    return found;
  }

  getWorkflowRevision(revisionId: string) {
    const found = this.revisions.get(revisionId);
    if (!found) throw new Error(`Missing revision ${revisionId}`);
    return found;
  }
}

interface FakeHost {
  workspacePath: string;
  store: FakeStore;
  browserService: { id: string };
  activeThreadId: string;
}

function createHarness() {
  const store = new FakeStore();
  const host: FakeHost = {
    workspacePath: store.workspace.path,
    store,
    browserService: { id: "browser-1" },
    activeThreadId: "thread-1",
  };
  const workflowHost: FakeHost = {
    workspacePath: "/workspace/workflow-project",
    store,
    browserService: { id: "browser-workflow" },
    activeThreadId: "thread-1",
  };
  const projectRegistry = {
    resolveProjectId: vi.fn((projectId: string, fallbackWorkspacePath: string) =>
      projectId === "active-project" ? fallbackWorkspacePath : `/workspace/${projectId}`),
    register: vi.fn(),
    setDisplayName: vi.fn(),
    listProjects: vi.fn((_workspacePath: string, activeProject: ProjectSummary) => [activeProject]),
  };
  const createdStore = new FakeStore();
  createdStore.workspace = {
    path: "/workspace/child",
    name: "Child",
    statePath: "/workspace/child/.ambient/state",
    sessionPath: "/workspace/child/.ambient/session",
  };
  const emittedStates: Array<{ workspacePath: string }> = [];
  const service = createProjectRuntimeIpcContextService<FakeHost, FakeStore, FakeHost["browserService"], { workspacePath: string }, { workflowThreadId?: string }>({
    activeThreadId: () => host.activeThreadId,
    defaultStore: () => store,
    activeProjectRuntimeHost: () => host,
    requireActiveProjectRuntimeHost: () => host,
    ensureProjectRuntimeHostForWorkspacePath: vi.fn(() => workflowHost),
    requireProjectRuntimeHostForWorkflowArtifact: vi.fn(() => workflowHost),
    requireProjectRuntimeHostForWorkflowDiscoveryQuestion: vi.fn(() => workflowHost),
    requireProjectRuntimeHostForWorkflowRevision: vi.fn(() => workflowHost),
    requireProjectRuntimeHostForWorkflowRun: vi.fn(() => workflowHost),
    requireProjectRuntimeHostForWorkflowThread: vi.fn(() => workflowHost),
    activeThreadIdForHost: (targetHost) => targetHost.activeThreadId,
    setProjectHostActiveThreadId: (targetHost, threadId) => {
      targetHost.activeThreadId = threadId;
      return threadId;
    },
    activeProjectBoardForState: (targetStore) => targetStore.board,
    activeProjectBoardThreadIdForStore: () => "thread-1",
    buildWorkflowDebugRewriteContext: vi.fn((_targetStore, input) =>
      input.runId === "run-without-thread" ? {} : { workflowThreadId: "workflow-1" }),
    createProjectStore: () => ({
      store: createdStore,
      openWorkspace: () => createdStore.workspace,
      close: vi.fn(),
    }),
    emitState: (state) => emittedStates.push(state),
    ensureDirectory: vi.fn(),
    homePath: () => "/Users/test",
    normalizeWorkspacePath: (workspacePath) => workspacePath.replace(/\/+$/g, ""),
    projectRegistry: () => projectRegistry,
    switchWorkspace: vi.fn((workspacePath: string) => ({ workspacePath })),
    now: () => 42,
  });

  return { createdStore, emittedStates, host, projectRegistry, service, store, workflowHost };
}

describe("project runtime IPC context service", () => {
  it("builds active project summaries and picks the initial active thread deterministically", () => {
    const store = new FakeStore();
    store.lastActiveThreadId = "missing";

    expect(initialActiveThreadIdForStore(store)).toBe("thread-1");
    expect(store.lastActiveThreadId).toBe("thread-1");

    const summary = activeProjectSummary(store.getWorkspace(), [store.getThread("thread-1")]);
    expect(summary).toMatchObject({
      id: projectIdFromWorkspacePath("/workspace/project"),
      path: "/workspace/project",
      createdAt: "2026-06-20T01:00:00.000Z",
      updatedAt: "2026-06-20T02:00:00.000Z",
    });
  });

  it("lists, creates, switches, and names runtime projects with hidden threads filtered", () => {
    const { emittedStates, projectRegistry, service, store } = createHarness();

    const projects = service.listRuntimeProjects();
    expect(projects[0].threads.map((item) => item.id)).toEqual(["thread-1"]);
    expect(projectRegistry.listProjects).toHaveBeenCalledWith("/workspace/project", expect.objectContaining({ id: projectIdFromWorkspacePath("/workspace/project") }));

    expect(service.resolveHeadlessProjectWorkspacePath({ workspacePath: "~/child" })).toBe("/Users/test/child");
    expect(service.resolveHeadlessProjectWorkspacePath({ workspacePath: "./child" })).toBe("/workspace/child");
    expect(service.resolveHeadlessProjectWorkspacePath({ name: "New: Project" })).toBe("/workspace/New- Project");
    expect(permanentWorktreeBranchName("/workspace/My Project", 42)).toBe("codex/my-project-worktree-16");

    const created = service.createProjectWorkspaceForRuntime({ workspacePath: "./child", name: "Child", reason: "test" }, store);
    expect(created).toMatchObject({ path: "/workspace/child", name: "Child" });
    expect(projectRegistry.register).toHaveBeenCalledWith("/workspace/child");
    expect(projectRegistry.setDisplayName).toHaveBeenCalledWith("/workspace/child", "Child");

    service.switchProjectWorkspaceForRuntime({ workspacePath: "/workspace/next", reason: "test" });
    expect(emittedStates).toEqual([{ workspacePath: "/workspace/next" }]);
  });

  it("resolves active, project, workflow thread, discovery, and artifact contexts", () => {
    const { host, service, workflowHost } = createHarness();

    expect(service.activeProjectIpcContext()).toMatchObject({
      host,
      thread: { id: "thread-1" },
      targetBrowserService: { id: "browser-1" },
    });
    expect(service.workflowProjectIpcContext({ projectPath: "/workspace/workflow-project/" })).toMatchObject({
      host: workflowHost,
      projectPath: "/workspace/workflow-project",
      thread: { id: "thread-1" },
    });
    expect(service.workflowAgentIpcContextForWorkflowThread("workflow-1")).toMatchObject({
      host: workflowHost,
      workflowThread: { id: "workflow-1" },
      projectPath: "/workspace/workflow-project",
    });
    expect(service.workflowAgentIpcContextForDiscoveryQuestion("question-1")).toMatchObject({
      question: { workflowThreadId: "workflow-1" },
      workflowThread: { id: "workflow-1" },
    });
    expect(service.workflowArtifactIpcContext("artifact-1")).toMatchObject({
      artifact: { workflowThreadId: "workflow-1" },
      thread: { id: "workflow-chat", workspacePath: "/workspace/workflow-project" },
    });
    expect(service.workflowArtifactIpcContext("artifact-project")).toMatchObject({
      thread: { id: "thread-1", workspacePath: "/workspace/project" },
      projectPath: "/workspace/project",
    });
  });

  it("resolves compile/debug contexts and preserves validation failures", () => {
    const { service } = createHarness();

    expect(service.workflowCompileIpcContext({ workflowThreadId: "workflow-1", revisionId: "revision-1" })).toMatchObject({
      workflowThread: { id: "workflow-1" },
      thread: { id: "workflow-chat", workspacePath: "/workspace/workflow-project" },
    });
    expect(() => service.workflowCompileIpcContext({ workflowThreadId: "workflow-1", revisionId: "revision-other" }))
      .toThrow("does not belong to workflow thread workflow-1");
    expect(service.workflowCompileIpcContext({})).toMatchObject({
      thread: { id: "thread-1", workspacePath: "/workspace/project" },
      projectPath: "/workspace/project",
    });

    expect(service.workflowDebugRewriteIpcContext({ runId: "run-1" })).toMatchObject({
      debugContext: { workflowThreadId: "workflow-1" },
      thread: { id: "workflow-chat", workspacePath: "/workspace/workflow-project" },
    });
    expect(() => service.workflowDebugRewriteIpcContext({ runId: "run-without-thread" }))
      .toThrow("Debug rewrite requires the failed workflow to belong to a Workflow Agent thread.");
  });

  it("resolves registered project paths and workflow control threads", () => {
    const { host, service, store } = createHarness();
    expect(service.resolveRegisteredProjectPathForHost("active-project", host)).toBe("/workspace/project");
    expect(service.isActiveProjectRuntimeHost(host)).toBe(true);
    expect(workflowAgentControlThread(store, store.getThread("thread-1"), store.getWorkflowAgentThreadSummary("workflow-1"), "/workspace/workflow-project"))
      .toMatchObject({ id: "workflow-chat", workspacePath: "/workspace/workflow-project" });
  });
});
