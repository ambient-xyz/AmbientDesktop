import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  registerWorkspaceGitDomainIpc,
  workspaceGitDomainIpcChannels,
  type RegisterWorkspaceGitDomainIpcDependencies,
} from "./registerWorkspaceGitDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerWorkspaceGitDomainIpc", () => {
  it("registers the workspace/Git domain channel table", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...workspaceGitDomainIpcChannels]);
  });

  it("routes workspace file listing through the active workspace context", async () => {
    const { deps, invoke, workspaceContext, workspaceTree } = registerWithFakes();

    await expect(invoke("workspace:list-files")).resolves.toBe(workspaceTree);

    expect(deps.activeWorkspaceFileContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.listWorkspaceFiles).toHaveBeenCalledWith(workspaceContext.workspacePath);
  });

  it("resolves workspace artifact paths before opening with a selected target", async () => {
    const { deps, invoke, resolvedPath, workspaceContext } = registerWithFakes();

    await expect(invoke("workspace:open-path-with", {
      path: "artifacts/report.html",
      targetId: "browser",
    })).resolves.toBeUndefined();

    expect(deps.workspacePathForRelativeArtifactPath).toHaveBeenCalledWith(
      "artifacts/report.html",
      workspaceContext.targetStore,
      workspaceContext.workspacePath,
    );
    expect(deps.resolveWorkspacePathForOpen).toHaveBeenCalledWith(
      "/tmp/workspace/artifacts/report.html",
      "artifacts/report.html",
    );
    expect(deps.openWorkspaceTarget).toHaveBeenCalledWith(resolvedPath.realPath, "browser");
  });

  it("routes manual checkpoint creation through the Git run action", async () => {
    const { deps, gitContext, gitReview, invoke } = registerWithFakes();

    await expect(invoke("git:run-action", "create-checkpoint")).resolves.toBe(gitReview);

    expect(deps.createAndRecordCheckpoint).toHaveBeenCalledWith(
      "manual",
      "Manual checkpoint.",
      gitContext.thread,
      gitContext.targetStore,
    );
    expect(deps.createGitBranch).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(gitContext.host, gitContext.threadId);
  });

  it("opens created pull request URLs through the allowed external URL boundary", async () => {
    const { deps, gitContext, invoke, pullRequestUrl } = registerWithFakes();

    await expect(invoke("git:create-pr-url")).resolves.toBe(pullRequestUrl);

    expect(deps.createPullRequestUrl).toHaveBeenCalledWith(gitContext.workspacePath);
    expect(deps.openAllowedExternalUrl).toHaveBeenCalledWith(pullRequestUrl, "git-create-pr");
  });
});

function registerWithFakes(): {
  deps: RegisterWorkspaceGitDomainIpcDependencies;
  gitContext: {
    host: { id: string };
    targetStore: { id: string; getWorkspace: ReturnType<typeof vi.fn> };
    thread: { id: string };
    threadId: string;
    workspacePath: string;
  };
  gitReview: { branch: string };
  handlers: Map<string, IpcListener>;
  invoke(channel: string, raw?: unknown): Promise<unknown>;
  pullRequestUrl: string;
  resolvedPath: { absolutePath: string; realPath: string };
  workspaceContext: {
    targetStore: { id: string; getWorkspace: ReturnType<typeof vi.fn>; createPermissionGrant: ReturnType<typeof vi.fn>; listPermissionGrants: ReturnType<typeof vi.fn> };
    threadId: string;
    thread: { permissionMode: string };
    workspacePath: string;
  };
  workspaceTree: { entries: unknown[] };
} {
  const handlers = new Map<string, IpcListener>();
  const workspaceTree = { entries: [] };
  const gitReview = { branch: "main" };
  const pullRequestUrl = "https://github.test/example/repo/pull/new/feature";
  const resolvedPath = {
    absolutePath: "/tmp/workspace/artifacts/report.html",
    realPath: "/private/tmp/workspace/artifacts/report.html",
  };
  const workspaceContext = {
    workspacePath: "/tmp/workspace",
    threadId: "thread-1",
    targetStore: {
      id: "store-1",
      getWorkspace: vi.fn(() => ({ path: "/tmp/workspace" })),
      createPermissionGrant: vi.fn(),
      listPermissionGrants: vi.fn(() => []),
    },
    thread: { permissionMode: "full-access" },
  };
  const gitContext = {
    host: { id: "host-1" },
    threadId: "thread-1",
    workspacePath: "/tmp/workspace",
    targetStore: {
      id: "store-1",
      getWorkspace: vi.fn(() => ({ statePath: "/tmp/workspace/.ambient/state.json" })),
    },
    thread: { id: "thread-1" },
  };
  const deps: RegisterWorkspaceGitDomainIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => gitContext),
    activeWorkspaceFileContextForProjectHost: vi.fn(() => workspaceContext),
    attachWorktreeForThread: vi.fn(),
    commitGit: vi.fn(),
    createAndRecordCheckpoint: vi.fn(),
    createGitBranch: vi.fn(),
    createPullRequestUrl: vi.fn(() => pullRequestUrl),
    describeWorkspaceAbsoluteContextPaths: vi.fn(() => []),
    discardGitFile: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    fetchGit: vi.fn(),
    getWorkspaceDiff: vi.fn(() => ({ files: [] })),
    getWorkspaceGitStatus: vi.fn(() => ({ isGitRepository: true, branch: "main", dirtyCount: 0 })),
    initializeGitRepository: vi.fn(),
    listWorkspaceFiles: vi.fn(() => workspaceTree),
    listWorkspaceOpenTargets: vi.fn(() => []),
    normalizeWorkspacePath: vi.fn((workspacePath: string) => workspacePath),
    openAllowedExternalUrl: vi.fn(),
    openWorkspaceTarget: vi.fn(),
    prepareWorktreeForThread: vi.fn(() => ({ id: "prepared-thread" })),
    pullGit: vi.fn(),
    pushGit: vi.fn(),
    readActiveLocalFilePreview: vi.fn(),
    readActiveWorkspaceFile: vi.fn(),
    readGitReviewForProjectHost: vi.fn(() => gitReview),
    rendererOfficePreviewService: { clearRendererDiscovery: vi.fn() },
    resolveCanonicalLocalFilePath: vi.fn((requestedPath: string) => requestedPath),
    resolveWorkspacePathForOpen: vi.fn(() => resolvedPath),
    requestPermissionWithGrantRegistry: vi.fn(async () => ({ allowed: true, mode: "allow_once" })),
    createThreadLocalFolderAllowlistGrant: vi.fn(() => ({
      id: "grant-1",
      createdAt: "2026-06-23T00:00:00.000Z",
      updatedAt: "2026-06-23T00:00:00.000Z",
      createdBy: "user",
      permissionModeAtCreation: "workspace",
      scopeKind: "thread",
      threadId: "thread-1",
      actionKind: "file_content_read",
      targetKind: "path",
      targetHash: "hash",
      targetLabel: "/tmp/workspace",
      source: "settings",
      reason: "test",
    })),
    localPathVisibleToThread: vi.fn(() => true),
    localPathInsideActiveWorkspace: vi.fn(() => true),
    restoreLatestGitCheckpoint: vi.fn(),
    searchWorkspace: vi.fn(() => []),
    setProjectHostActiveThreadId: vi.fn(),
    shell: {
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    },
    showOpenDialog: vi.fn(() => ({ canceled: false, filePaths: ["/tmp/workspace"] })),
    stageAllGitFiles: vi.fn(),
    stageGitFile: vi.fn(),
    switchWorkspaceBranch: vi.fn(),
    unstageAllGitFiles: vi.fn(),
    unstageGitFile: vi.fn(),
    workspacePathForRelativeArtifactPath: vi.fn(() => "/tmp/workspace/artifacts/report.html"),
  };

  registerWorkspaceGitDomainIpc(deps);

  return {
    deps,
    gitContext,
    gitReview,
    handlers,
    invoke: (channel, raw) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
    pullRequestUrl,
    resolvedPath,
    workspaceContext,
    workspaceTree,
  };
}
