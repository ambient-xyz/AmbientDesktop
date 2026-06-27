import { describe, expect, it, vi } from "vitest";
import type { ProjectBoardSummary, ProjectSummary } from "../../shared/projectBoardTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceSearchResult } from "../../shared/workspaceTypes";
import {
  createWorkspaceSearchDesktopService,
  type WorkspaceSearchHost,
  type WorkspaceSearchStore,
} from "./workspaceSearchDesktopService";

function thread(id: string, workspacePath = "/workspace/main"): ThreadSummary {
  return {
    id,
    title: id,
    workspacePath,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "example/model-id",
    thinkingLevel: "medium",
  };
}

function result(id: string, createdAt: string, workspacePath = "/workspace/main"): WorkspaceSearchResult {
  return {
    id,
    kind: "message",
    threadId: "thread-1",
    workspacePath,
    projectName: workspacePath.split("/").at(-1) || "project",
    title: id,
    excerpt: id,
    createdAt,
  };
}

function project(path: string): ProjectSummary {
  return {
    id: path.split("/").at(-1) || path,
    path,
    name: path.split("/").at(-1) || path,
    statePath: `${path}/.ambient`,
    sessionPath: `${path}/.ambient/session.json`,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    threads: [thread("thread-1", path)],
  };
}

function store(path: string, name = path.split("/").at(-1) || path): WorkspaceSearchStore {
  return {
    getWorkspace: vi.fn(() => ({ path, name, statePath: `${path}/.ambient`, sessionPath: `${path}/.ambient/session.json` })),
    listThreads: vi.fn(() => [thread("thread-1", path)]),
    searchWorkspace: vi.fn(() => [result("local-result", "2026-06-20T00:00:00.000Z", path)]),
  };
}

function createFixture(options: {
  activeStore?: WorkspaceSearchStore;
  threadStore?: WorkspaceSearchStore;
  projects?: ProjectSummary[];
  projectResults?: Record<string, WorkspaceSearchResult[]>;
} = {}) {
  const activeStore = options.activeStore ?? store("/workspace/main", "Main");
  const threadStore = options.threadStore ?? store("/workspace/thread", "Thread");
  const activeHost: WorkspaceSearchHost<WorkspaceSearchStore> = { store: activeStore };
  const threadHost: WorkspaceSearchHost<WorkspaceSearchStore> = { store: threadStore };
  const projectBoard: ProjectBoardSummary = {
    id: "board-thread",
    projectPath: "/workspace/main",
    status: "active",
    title: "Board",
    summary: "Board summary",
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
  };
  const activeProjectSummary = vi.fn((workspace: ReturnType<WorkspaceSearchStore["getWorkspace"]>) => ({
    ...project(workspace.path),
    name: workspace.name,
    board: projectBoard,
  }));
  const activeProjectBoardForState = vi.fn(() => projectBoard);
  const activeProjectBoardThreadIdForStore = vi.fn(() => "board-thread");
  const activeThreadIdForHost = vi.fn(() => "active-thread");
  const requireActiveProjectRuntimeHost = vi.fn(() => activeHost);
  const requireProjectRuntimeHostForThread = vi.fn(() => threadHost);
  const projectRegistry = {
    listProjects: vi.fn(() => options.projects ?? [project("/workspace/main"), project("/workspace/other")]),
  };
  const readProjectSearchResults = vi.fn((workspacePath: string, query: string, limit: number) =>
    options.projectResults?.[workspacePath] ?? [
      {
        ...result(`${workspacePath}-result`, "2026-06-20T00:00:00.000Z", workspacePath),
        excerpt: `${query}:${limit}`,
      },
    ],
  );
  const service = createWorkspaceSearchDesktopService({
    activeProjectBoardForState,
    activeProjectBoardThreadIdForStore,
    activeProjectSummary,
    activeThreadIdForHost,
    projectRegistry: () => projectRegistry,
    readProjectSearchResults,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThread,
  });
  return {
    activeProjectBoardForState,
    activeProjectBoardThreadIdForStore,
    activeProjectSummary,
    activeStore,
    activeThreadIdForHost,
    projectRegistry,
    readProjectSearchResults,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThread,
    service,
    threadStore,
  };
}

describe("createWorkspaceSearchDesktopService", () => {
  it("searches the active project for raw string input", () => {
    const { activeStore, activeThreadIdForHost, requireActiveProjectRuntimeHost, service } = createFixture();

    expect(service.searchWorkspace("handoff")).toEqual([
      result("local-result", "2026-06-20T00:00:00.000Z", "/workspace/main"),
    ]);

    expect(requireActiveProjectRuntimeHost).toHaveBeenCalled();
    expect(activeThreadIdForHost).toHaveBeenCalledWith({ store: activeStore });
    expect(activeStore.searchWorkspace).toHaveBeenCalledWith("handoff", {
      scope: "project",
      threadId: "active-thread",
      limit: 50,
      projectName: "Main",
      workspacePath: "/workspace/main",
    });
  });

  it("routes structured thread-scoped input to the matching project host", () => {
    const { requireActiveProjectRuntimeHost, requireProjectRuntimeHostForThread, service, threadStore } = createFixture();

    service.searchWorkspace({ query: "needle", scope: "chat", threadId: "thread-42", limit: 7 });

    expect(requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-42");
    expect(requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(threadStore.searchWorkspace).toHaveBeenCalledWith("needle", {
      scope: "chat",
      threadId: "thread-42",
      limit: 7,
      projectName: "Thread",
      workspacePath: "/workspace/thread",
    });
  });

  it("fans all-project searches through registered projects and sorts by recency", () => {
    const projectResults = {
      "/workspace/main": [
        result("main-old", "2026-06-20T00:00:01.000Z", "/workspace/main"),
        result("main-new", "2026-06-20T00:00:05.000Z", "/workspace/main"),
      ],
      "/workspace/other": [
        result("other-mid", "2026-06-20T00:00:03.000Z", "/workspace/other"),
      ],
    };
    const {
      activeProjectBoardForState,
      activeProjectBoardThreadIdForStore,
      activeProjectSummary,
      activeStore,
      projectRegistry,
      readProjectSearchResults,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForThread,
      service,
    } = createFixture({ projectResults });

    const results = service.searchWorkspace({ query: "handoff", scope: "all-projects", threadId: "ignored-thread", limit: 2 });

    expect(requireActiveProjectRuntimeHost).toHaveBeenCalled();
    expect(requireProjectRuntimeHostForThread).not.toHaveBeenCalled();
    expect(activeProjectBoardThreadIdForStore).toHaveBeenCalledWith(activeStore);
    expect(activeProjectBoardForState).toHaveBeenCalledWith(activeStore, "board-thread");
    expect(activeProjectSummary).toHaveBeenCalledWith(
      {
        path: "/workspace/main",
        name: "Main",
        statePath: "/workspace/main/.ambient",
        sessionPath: "/workspace/main/.ambient/session.json",
      },
      [thread("thread-1", "/workspace/main")],
      expect.objectContaining({ id: "board-thread" }),
    );
    expect(projectRegistry.listProjects).toHaveBeenCalledWith("/workspace/main", expect.objectContaining({
      path: "/workspace/main",
      board: expect.objectContaining({ id: "board-thread" }),
    }));
    expect(readProjectSearchResults).toHaveBeenCalledWith("/workspace/main", "handoff", 5);
    expect(readProjectSearchResults).toHaveBeenCalledWith("/workspace/other", "handoff", 5);
    expect(results.map((item) => item.id)).toEqual(["main-new", "other-mid"]);
  });

  it("splits all-project search limits across many projects", () => {
    const projects = Array.from({ length: 3 }, (_item, index) => project(`/workspace/project-${index}`));
    const { readProjectSearchResults, service } = createFixture({ projects });

    service.searchWorkspace({ query: "needle", scope: "all-projects", limit: 18 });

    expect(readProjectSearchResults).toHaveBeenCalledWith("/workspace/project-0", "needle", 6);
    expect(readProjectSearchResults).toHaveBeenCalledWith("/workspace/project-1", "needle", 6);
    expect(readProjectSearchResults).toHaveBeenCalledWith("/workspace/project-2", "needle", 6);
  });

  it("rejects invalid search input before reading stores", () => {
    const { requireActiveProjectRuntimeHost, service } = createFixture();

    expect(() => service.searchWorkspace({ query: "", scope: "project" })).toThrow();
    expect(() => service.searchWorkspace({ query: "needle", limit: 101 })).toThrow();
    expect(requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
  });
});
