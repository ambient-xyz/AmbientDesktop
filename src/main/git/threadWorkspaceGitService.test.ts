import { describe, expect, it, vi } from "vitest";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import type { GitCheckpointSummary, GitReviewSummary } from "../../shared/workspaceTypes";
import {
  createThreadWorkspaceGitService,
  type ThreadWorkspaceGitStore,
} from "./threadWorkspaceGitService";

class FakeStore implements ThreadWorkspaceGitStore {
  readonly workspace = { path: "/project", statePath: "/state" };
  readonly threads = new Map<string, ThreadSummary>();
  readonly worktreeUpdates: ThreadWorktreeSummary[] = [];
  readonly checkpointUpdates: Array<{ threadId: string; checkpointId: string }> = [];

  constructor(thread: ThreadSummary = sampleThread()) {
    this.threads.set(thread.id, thread);
  }

  getWorkspace() {
    return this.workspace;
  }

  getThread(threadId: string): ThreadSummary {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread ${threadId}`);
    return thread;
  }

  setThreadWorktree(worktree: ThreadWorktreeSummary): ThreadWorktreeSummary {
    this.worktreeUpdates.push(worktree);
    const thread = this.getThread(worktree.threadId);
    this.threads.set(thread.id, { ...thread, gitWorktree: worktree });
    return worktree;
  }

  updateThreadWorkspacePath(threadId: string, workspacePath: string): ThreadSummary {
    const thread = this.getThread(threadId);
    const updated = { ...thread, workspacePath };
    this.threads.set(threadId, updated);
    return updated;
  }

  updateThreadWorktreeCheckpoint(threadId: string, checkpointId: string): void {
    this.checkpointUpdates.push({ threadId, checkpointId });
    const thread = this.getThread(threadId);
    if (!thread.gitWorktree) return;
    this.threads.set(threadId, {
      ...thread,
      gitWorktree: { ...thread.gitWorktree, lastCheckpointId: checkpointId },
    });
  }
}

function createFixture(thread: ThreadSummary = sampleThread()) {
  const store = new FakeStore(thread);
  const host = { store };
  const dependencies = {
    activeThread: vi.fn(() => store.getThread(thread.id)),
    activeStore: vi.fn(() => store),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    activeThreadIdForHost: vi.fn(() => thread.id),
    prepareThreadWorktree: vi.fn<(_: string, __: ThreadSummary) => Promise<ThreadWorktreeSummary | undefined>>(),
    attachExistingThreadWorktree: vi.fn<(_: string, __: string, ___: ThreadSummary) => Promise<ThreadWorktreeSummary>>(),
    getWorkspaceGitStatus: vi.fn<(_: string) => Promise<Pick<GitReviewSummary, "isGitRepository" | "branch">>>(),
    createGitCheckpoint: vi.fn<(_: {
      workspacePath: string;
      statePath: string;
      threadId: string;
      branchName: string;
      kind: GitCheckpointSummary["kind"];
      reason: string;
    }) => Promise<GitCheckpointSummary | undefined>>(),
    latestGitCheckpoint: vi.fn<(_: string, __: string) => Promise<GitCheckpointSummary | undefined>>(),
    getGitReview: vi.fn<(_: {
      workspacePath: string;
      projectRoot: string;
      worktree?: ThreadWorktreeSummary;
      latestCheckpoint?: GitCheckpointSummary;
    }) => Promise<GitReviewSummary>>(),
  };
  const service = createThreadWorkspaceGitService(dependencies);
  return { dependencies, host, service, store, thread };
}

describe("thread workspace Git service", () => {
  it("returns the current thread unchanged when no git worktree can be prepared", async () => {
    const fixture = createFixture();
    fixture.dependencies.prepareThreadWorktree.mockResolvedValue(undefined);

    await expect(fixture.service.prepareWorktreeForThread()).resolves.toBe(fixture.thread);

    expect(fixture.dependencies.prepareThreadWorktree).toHaveBeenCalledWith("/project", fixture.thread);
    expect(fixture.store.worktreeUpdates).toEqual([]);
    expect(fixture.store.getThread(fixture.thread.id).workspacePath).toBe("/project");
  });

  it("records an active prepared worktree and moves the thread workspace path", async () => {
    const fixture = createFixture();
    const worktree = sampleWorktree({ worktreePath: "/project/.ambient-codex/worktrees/thread-1" });
    fixture.dependencies.prepareThreadWorktree.mockResolvedValue(worktree);

    await expect(fixture.service.prepareWorktreeForThread()).resolves.toMatchObject({
      id: "thread-1",
      workspacePath: "/project/.ambient-codex/worktrees/thread-1",
    });

    expect(fixture.store.worktreeUpdates).toEqual([worktree]);
    expect(fixture.store.getThread("thread-1").gitWorktree).toEqual(worktree);
  });

  it("records a non-active prepared worktree without changing the thread workspace path", async () => {
    const fixture = createFixture();
    const worktree = sampleWorktree({ status: "shared", worktreePath: "/project" });
    fixture.dependencies.prepareThreadWorktree.mockResolvedValue(worktree);

    await expect(fixture.service.prepareWorktreeForThread()).resolves.toMatchObject({
      id: "thread-1",
      workspacePath: "/project",
      gitWorktree: worktree,
    });

    expect(fixture.store.worktreeUpdates).toEqual([worktree]);
  });

  it("attaches an existing worktree and moves the thread workspace path", async () => {
    const fixture = createFixture();
    const worktree = sampleWorktree({ branchName: "feature", worktreePath: "/other/worktree" });
    fixture.dependencies.attachExistingThreadWorktree.mockResolvedValue(worktree);

    await expect(fixture.service.attachWorktreeForThread("/other/worktree")).resolves.toMatchObject({
      id: "thread-1",
      workspacePath: "/other/worktree",
    });

    expect(fixture.dependencies.attachExistingThreadWorktree).toHaveBeenCalledWith("/project", "/other/worktree", fixture.thread);
    expect(fixture.store.getThread("thread-1").gitWorktree).toEqual(worktree);
  });

  it("skips checkpoint creation when the thread workspace is not a git repository", async () => {
    const fixture = createFixture();
    fixture.dependencies.getWorkspaceGitStatus.mockResolvedValue({ isGitRepository: false, branch: "" });

    await expect(fixture.service.createAndRecordCheckpoint("pre-run", "Before run")).resolves.toBeUndefined();

    expect(fixture.dependencies.createGitCheckpoint).not.toHaveBeenCalled();
    expect(fixture.store.checkpointUpdates).toEqual([]);
  });

  it("creates a checkpoint and records its id on the thread worktree", async () => {
    const thread = sampleThread({ gitWorktree: sampleWorktree() });
    const fixture = createFixture(thread);
    const checkpoint = sampleCheckpoint();
    fixture.dependencies.getWorkspaceGitStatus.mockResolvedValue({ isGitRepository: true, branch: "main" });
    fixture.dependencies.createGitCheckpoint.mockResolvedValue(checkpoint);

    await expect(fixture.service.createAndRecordCheckpoint("pre-run", "Before run")).resolves.toEqual(checkpoint);

    expect(fixture.dependencies.createGitCheckpoint).toHaveBeenCalledWith({
      workspacePath: "/project",
      statePath: "/state",
      threadId: "thread-1",
      branchName: "main",
      kind: "pre-run",
      reason: "Before run",
    });
    expect(fixture.store.checkpointUpdates).toEqual([{ threadId: "thread-1", checkpointId: "checkpoint-1" }]);
    expect(fixture.store.getThread("thread-1").gitWorktree?.lastCheckpointId).toBe("checkpoint-1");
  });

  it("returns the active Git context for the requested host", () => {
    const fixture = createFixture();

    expect(fixture.service.activeGitContextForProjectHost(fixture.host)).toEqual({
      host: fixture.host,
      targetStore: fixture.store,
      threadId: "thread-1",
      thread: fixture.thread,
      workspacePath: "/project",
    });
  });

  it("reads Git review with thread worktree and latest checkpoint context", async () => {
    const worktree = sampleWorktree({ worktreePath: "/worktree" });
    const fixture = createFixture(sampleThread({ workspacePath: "/worktree", gitWorktree: worktree }));
    const checkpoint = sampleCheckpoint();
    const review = sampleGitReview({ workspacePath: "/worktree", worktree, latestCheckpoint: checkpoint });
    fixture.dependencies.latestGitCheckpoint.mockResolvedValue(checkpoint);
    fixture.dependencies.getGitReview.mockResolvedValue(review);

    await expect(fixture.service.readGitReviewForProjectHost(fixture.host, "thread-1")).resolves.toEqual(review);

    expect(fixture.dependencies.latestGitCheckpoint).toHaveBeenCalledWith("/state", "thread-1");
    expect(fixture.dependencies.getGitReview).toHaveBeenCalledWith({
      workspacePath: "/worktree",
      projectRoot: "/project",
      worktree,
      latestCheckpoint: checkpoint,
    });
  });

  it("uses an active worktree as the thread working directory", () => {
    const fixture = createFixture();

    expect(fixture.service.threadWorkingDirectory(sampleThread({ gitWorktree: sampleWorktree({ worktreePath: "/worktree" }) }))).toBe(
      "/worktree",
    );
    expect(fixture.service.threadWorkingDirectory(sampleThread({ gitWorktree: sampleWorktree({ status: "failed" }) }))).toBe(
      "/project",
    );
    expect(fixture.service.threadWorkingDirectory(sampleThread())).toBe("/project");
  });
});

function sampleThread(input: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    title: "Feature",
    workspacePath: "/project",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "kimi",
    thinkingLevel: "medium",
    ...input,
  };
}

function sampleWorktree(input: Partial<ThreadWorktreeSummary> = {}): ThreadWorktreeSummary {
  return {
    threadId: "thread-1",
    projectRoot: "/project",
    worktreePath: "/project/.ambient-codex/worktrees/thread-1",
    branchName: "ambient/feature-thread-1",
    baseRef: "abc1234",
    status: "active",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...input,
  };
}

function sampleCheckpoint(input: Partial<GitCheckpointSummary> = {}): GitCheckpointSummary {
  return {
    id: "checkpoint-1",
    threadId: "thread-1",
    workspacePath: "/project",
    branchName: "main",
    kind: "pre-run",
    reason: "Before run",
    createdAt: "2026-06-20T00:00:00.000Z",
    trackedPatchBytes: 0,
    stagedPatchBytes: 0,
    untrackedFiles: [],
    ...input,
  };
}

function sampleGitReview(input: Partial<GitReviewSummary> = {}): GitReviewSummary {
  return {
    isGitRepository: true,
    workspacePath: "/project",
    projectRoot: "/project",
    branch: "main",
    branches: ["main"],
    ahead: 0,
    behind: 0,
    dirtyCount: 0,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
    additions: 0,
    deletions: 0,
    files: [],
    ...input,
  };
}
