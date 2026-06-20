import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import type { GitCheckpointSummary, GitReviewSummary } from "../../shared/workspaceTypes";

export interface ThreadWorkspaceGitStore {
  getWorkspace(): {
    path: string;
    statePath: string;
  };
  getThread(threadId: string): ThreadSummary;
  setThreadWorktree(worktree: ThreadWorktreeSummary): ThreadWorktreeSummary;
  updateThreadWorkspacePath(threadId: string, workspacePath: string): ThreadSummary;
  updateThreadWorktreeCheckpoint(threadId: string, checkpointId: string): void;
}

export interface ThreadWorkspaceGitHost<Store extends ThreadWorkspaceGitStore> {
  store: Store;
}

export interface ThreadWorkspaceGitServiceDependencies<
  Host extends ThreadWorkspaceGitHost<Store>,
  Store extends ThreadWorkspaceGitStore,
> {
  activeThread(): ThreadSummary;
  activeStore(): Store;
  requireActiveProjectRuntimeHost(): Host;
  activeThreadIdForHost(host: Host): string;
  prepareThreadWorktree(projectRoot: string, thread: ThreadSummary): Promise<ThreadWorktreeSummary | undefined>;
  attachExistingThreadWorktree(projectRoot: string, worktreePath: string, thread: ThreadSummary): Promise<ThreadWorktreeSummary>;
  getWorkspaceGitStatus(workspacePath: string): Promise<Pick<GitReviewSummary, "isGitRepository" | "branch">>;
  createGitCheckpoint(input: {
    workspacePath: string;
    statePath: string;
    threadId: string;
    branchName: string;
    kind: GitCheckpointSummary["kind"];
    reason: string;
  }): Promise<GitCheckpointSummary | undefined>;
  latestGitCheckpoint(statePath: string, threadId: string): Promise<GitCheckpointSummary | undefined>;
  getGitReview(input: {
    workspacePath: string;
    projectRoot: string;
    worktree?: ThreadWorktreeSummary;
    latestCheckpoint?: GitCheckpointSummary;
  }): Promise<GitReviewSummary>;
}

export function createThreadWorkspaceGitService<
  Host extends ThreadWorkspaceGitHost<Store>,
  Store extends ThreadWorkspaceGitStore,
>(
  dependencies: ThreadWorkspaceGitServiceDependencies<Host, Store>,
) {
  async function prepareWorktreeForThread(
    thread = dependencies.activeThread(),
    targetStore: Store = dependencies.activeStore(),
  ): Promise<ThreadSummary> {
    const worktree = await dependencies.prepareThreadWorktree(targetStore.getWorkspace().path, thread);
    if (!worktree) return thread;
    targetStore.setThreadWorktree(worktree);
    if (worktree.status === "active") {
      return targetStore.updateThreadWorkspacePath(thread.id, worktree.worktreePath);
    }
    return targetStore.getThread(thread.id);
  }

  async function attachWorktreeForThread(
    worktreePath: string,
    thread = dependencies.activeThread(),
    targetStore: Store = dependencies.activeStore(),
  ): Promise<ThreadSummary> {
    const worktree = await dependencies.attachExistingThreadWorktree(targetStore.getWorkspace().path, worktreePath, thread);
    targetStore.setThreadWorktree(worktree);
    return targetStore.updateThreadWorkspacePath(thread.id, worktree.worktreePath);
  }

  async function createAndRecordCheckpoint(
    kind: GitCheckpointSummary["kind"],
    reason: string,
    thread = dependencies.activeThread(),
    targetStore: Store = dependencies.activeStore(),
  ): Promise<GitCheckpointSummary | undefined> {
    const review = await dependencies.getWorkspaceGitStatus(thread.workspacePath);
    if (!review.isGitRepository) return undefined;
    const checkpoint = await dependencies.createGitCheckpoint({
      workspacePath: thread.workspacePath,
      statePath: targetStore.getWorkspace().statePath,
      threadId: thread.id,
      branchName: review.branch,
      kind,
      reason,
    });
    if (checkpoint) targetStore.updateThreadWorktreeCheckpoint(thread.id, checkpoint.id);
    return checkpoint;
  }

  function activeGitContextForProjectHost(host: Host = dependencies.requireActiveProjectRuntimeHost()) {
    const threadId = dependencies.activeThreadIdForHost(host);
    const thread = host.store.getThread(threadId);
    return {
      host,
      targetStore: host.store,
      threadId,
      thread,
      workspacePath: thread.workspacePath,
    };
  }

  async function readGitReviewForProjectHost(
    host: Host = dependencies.requireActiveProjectRuntimeHost(),
    threadId = dependencies.activeThreadIdForHost(host),
  ): Promise<GitReviewSummary> {
    const thread = host.store.getThread(threadId);
    return dependencies.getGitReview({
      workspacePath: thread.workspacePath,
      projectRoot: host.store.getWorkspace().path,
      worktree: thread.gitWorktree,
      latestCheckpoint: await dependencies.latestGitCheckpoint(host.store.getWorkspace().statePath, thread.id),
    });
  }

  function threadWorkingDirectory(thread: ThreadSummary): string {
    return thread.gitWorktree?.status === "active" ? thread.gitWorktree.worktreePath : thread.workspacePath;
  }

  return {
    activeGitContextForProjectHost,
    attachWorktreeForThread,
    createAndRecordCheckpoint,
    prepareWorktreeForThread,
    readGitReviewForProjectHost,
    threadWorkingDirectory,
  };
}
