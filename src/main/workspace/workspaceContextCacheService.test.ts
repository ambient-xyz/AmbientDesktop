import { describe, expect, it, vi } from "vitest";
import {
  createWorkspaceContextCacheService,
  type WorkspaceContextCacheHost,
  type WorkspaceContextCacheStore,
  type WorkspaceContextCacheThread,
  type WorkspaceContextCacheWorkspace,
} from "./workspaceContextCacheService";

interface FakeThread extends WorkspaceContextCacheThread {
  id: string;
}

class FakeStore implements WorkspaceContextCacheStore<FakeThread> {
  constructor(
    private readonly workspace: WorkspaceContextCacheWorkspace | undefined,
    private readonly threads: FakeThread[],
  ) {}

  getWorkspaceIfOpen(): WorkspaceContextCacheWorkspace | undefined {
    return this.workspace;
  }

  listThreads(): FakeThread[] {
    return this.threads;
  }
}

type FakeHost = WorkspaceContextCacheHost<FakeStore>;

function createStore(input: {
  workspacePath?: string;
  closed?: boolean;
  threadWorkspacePaths?: string[];
} = {}): FakeStore {
  const workspace = input.closed ? undefined : { path: input.workspacePath ?? "/workspace/project" };
  const threads = (input.threadWorkspacePaths ?? []).map((workspacePath, index) => ({
    id: `thread-${index + 1}`,
    workspacePath,
  }));
  return new FakeStore(workspace, threads);
}

function createHarness(input: {
  hosts?: FakeHost[];
  activeStore?: FakeStore;
  clearImportedWorkspaceContext?: (workspacePath: string) => Promise<void>;
  clearImportedWorkspaceContextSync?: (workspacePath: string) => void;
} = {}) {
  const warn = vi.fn();
  const clearImportedWorkspaceContext = vi.fn(
    input.clearImportedWorkspaceContext ?? (async () => undefined),
  );
  const clearImportedWorkspaceContextSync = vi.fn(
    input.clearImportedWorkspaceContextSync ?? (() => undefined),
  );
  const service = createWorkspaceContextCacheService<FakeHost, FakeStore>({
    projectRuntimeHostList: () => input.hosts ?? [],
    activeStore: () => input.activeStore,
    clearImportedWorkspaceContext,
    clearImportedWorkspaceContextSync,
    warn,
  });

  return {
    clearImportedWorkspaceContext,
    clearImportedWorkspaceContextSync,
    service,
    warn,
  };
}

describe("workspaceContextCacheService", () => {
  it("collects open host workspace and thread paths with stable de-duplication", () => {
    const hostA = {
      store: createStore({
        workspacePath: "/workspace/a",
        threadWorkspacePaths: ["/workspace/a", "/workspace/shared", "/workspace/thread-a"],
      }),
    };
    const hostB = {
      store: createStore({
        workspacePath: "/workspace/b",
        threadWorkspacePaths: ["/workspace/shared", "/workspace/thread-b"],
      }),
    };
    const closedHost = {
      store: createStore({
        closed: true,
        threadWorkspacePaths: ["/workspace/closed-thread"],
      }),
    };
    const { service } = createHarness({ hosts: [hostA, closedHost, hostB] });

    expect(service.knownWorkspaceContextPaths()).toEqual([
      "/workspace/a",
      "/workspace/shared",
      "/workspace/thread-a",
      "/workspace/b",
      "/workspace/thread-b",
    ]);
  });

  it("falls back to the active store when no project runtime hosts are loaded", () => {
    const activeStore = createStore({
      workspacePath: "/workspace/active",
      threadWorkspacePaths: ["/workspace/active-thread"],
    });
    const { service } = createHarness({ activeStore });

    expect(service.knownWorkspaceContextPaths()).toEqual([
      "/workspace/active",
      "/workspace/active-thread",
    ]);
  });

  it("clears imported workspace context asynchronously and warns without throwing on failures", async () => {
    const { clearImportedWorkspaceContext, service, warn } = createHarness({
      clearImportedWorkspaceContext: async (workspacePath) => {
        if (workspacePath === "/workspace/fail") throw new Error("clear failed");
      },
    });

    await expect(
      service.clearImportedWorkspaceContextCache("startup", [
        "/workspace/ok",
        "/workspace/fail",
      ]),
    ).resolves.toBeUndefined();

    expect(clearImportedWorkspaceContext).toHaveBeenCalledTimes(2);
    expect(clearImportedWorkspaceContext).toHaveBeenCalledWith("/workspace/ok");
    expect(clearImportedWorkspaceContext).toHaveBeenCalledWith("/workspace/fail");
    expect(warn).toHaveBeenCalledWith(
      "Failed to clear imported workspace context on startup: clear failed",
    );
  });

  it("clears imported workspace context synchronously and warns without throwing on failures", () => {
    const { clearImportedWorkspaceContextSync, service, warn } = createHarness({
      clearImportedWorkspaceContextSync: (workspacePath) => {
        if (workspacePath === "/workspace/fail") throw new Error("sync clear failed");
      },
    });

    expect(() =>
      service.clearImportedWorkspaceContextCacheSync("exit", [
        "/workspace/ok",
        "/workspace/fail",
      ]),
    ).not.toThrow();

    expect(clearImportedWorkspaceContextSync).toHaveBeenCalledTimes(2);
    expect(clearImportedWorkspaceContextSync).toHaveBeenCalledWith("/workspace/ok");
    expect(clearImportedWorkspaceContextSync).toHaveBeenCalledWith("/workspace/fail");
    expect(warn).toHaveBeenCalledWith(
      "Failed to clear imported workspace context on exit: sync clear failed",
    );
  });
});
