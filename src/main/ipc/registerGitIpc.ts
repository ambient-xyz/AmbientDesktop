import { dirname } from "node:path";
import type { IpcMain, OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { z } from "zod";

import type {
  GitBranchInput,
  GitCommitInput,
  GitFileActionInput,
  GitReviewSummary,
  GitSimpleAction,
} from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const gitReviewIpcChannels = ["git:review"] as const;
export const gitInitializeIpcChannels = ["git:initialize"] as const;
export const gitCreateThreadWorktreeIpcChannels = ["git:create-thread-worktree"] as const;
export const gitAttachExistingWorktreeIpcChannels = ["git:attach-existing-worktree"] as const;
export const gitStageFileIpcChannels = ["git:stage-file"] as const;
export const gitUnstageFileIpcChannels = ["git:unstage-file"] as const;
export const gitStageAllFilesIpcChannels = ["git:stage-all-files"] as const;
export const gitUnstageAllFilesIpcChannels = ["git:unstage-all-files"] as const;
export const gitDiscardFileIpcChannels = ["git:discard-file"] as const;
export const gitCommitIpcChannels = ["git:commit"] as const;
export const gitCreateBranchIpcChannels = ["git:create-branch"] as const;
export const gitRunActionIpcChannels = ["git:run-action"] as const;
export const gitCreatePullRequestUrlIpcChannels = ["git:create-pr-url"] as const;

type GitAttachExistingWorktreeDialogResult = Pick<OpenDialogReturnValue, "canceled" | "filePaths">;

export const gitFileActionSchema = z.object({ path: z.string().min(1).max(4096) }) satisfies z.ZodType<GitFileActionInput>;
export const gitCommitSchema = z.object({ message: z.string().min(1).max(20_000) }) satisfies z.ZodType<GitCommitInput>;
export const gitCreateBranchSchema = z.object({
  name: z.string().min(1).max(256),
  checkout: z.boolean().optional(),
}) satisfies z.ZodType<GitBranchInput>;
export const gitSimpleActionSchema = z.enum(["fetch", "pull", "push", "restore-latest-checkpoint"]) satisfies z.ZodType<GitSimpleAction>;

export interface GitReviewContext<Host = unknown> {
  host: Host;
  threadId: string;
}

export interface GitWorkspaceActionContext<Host = unknown> extends GitReviewContext<Host> {
  workspacePath: string;
}

export interface GitInitializeContext<Host = unknown> extends GitWorkspaceActionContext<Host> {}

export interface GitThreadWorktreeContext<Host = unknown, Store = unknown, Thread = unknown> extends GitReviewContext<Host> {
  targetStore: Store;
  thread: Thread;
}

export interface GitAttachExistingWorktreeContext<Host = unknown, Store = unknown, Thread = unknown> extends GitThreadWorktreeContext<Host, Store, Thread> {
  workspacePath: string;
}

export interface GitCheckpointWorkspaceActionContext<Host = unknown, Store = unknown, Thread = unknown>
  extends GitWorkspaceActionContext<Host> {
  targetStore: Store;
  thread: Thread;
}

export interface GitRunActionTargetStore {
  getWorkspace(): {
    statePath: string;
  };
}

export interface GitRunActionContext<
  Host = unknown,
  Store extends GitRunActionTargetStore = GitRunActionTargetStore,
  Thread = unknown,
> extends GitCheckpointWorkspaceActionContext<Host, Store, Thread> {}

export interface GitCheckpointRestoreInput {
  workspacePath: string;
  statePath: string;
  threadId: string;
}

export interface GitThreadWorktreeSummary {
  id: string;
}

export interface RegisterGitReviewIpcDependencies<Context extends GitReviewContext = GitReviewContext> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitInitializeIpcDependencies<Context extends GitInitializeContext = GitInitializeContext> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  initializeGitRepository(workspacePath: string): MaybePromise<void>;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitCreateThreadWorktreeIpcDependencies<
  Context extends GitThreadWorktreeContext = GitThreadWorktreeContext,
> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  prepareWorktreeForThread(thread: Context["thread"], targetStore: Context["targetStore"]): MaybePromise<GitThreadWorktreeSummary>;
  setProjectHostActiveThreadId(host: Context["host"], threadId: string): void;
  emitProjectStateIfActive(host: Context["host"], threadId: string): void;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitAttachExistingWorktreeIpcDependencies<
  Context extends GitAttachExistingWorktreeContext = GitAttachExistingWorktreeContext,
> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  showOpenDialog(options: OpenDialogOptions): MaybePromise<GitAttachExistingWorktreeDialogResult>;
  normalizeWorkspacePath(workspacePath: string): string;
  attachWorktreeForThread(worktreePath: string, thread: Context["thread"], targetStore: Context["targetStore"]): MaybePromise<GitThreadWorktreeSummary>;
  setProjectHostActiveThreadId(host: Context["host"], threadId: string): void;
  emitProjectStateIfActive(host: Context["host"], threadId: string): void;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitStageFileIpcDependencies<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  stageGitFile(workspacePath: string, input: GitFileActionInput): MaybePromise<void>;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitUnstageFileIpcDependencies<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  unstageGitFile(workspacePath: string, input: GitFileActionInput): MaybePromise<void>;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitStageAllFilesIpcDependencies<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  stageAllGitFiles(workspacePath: string): MaybePromise<void>;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitUnstageAllFilesIpcDependencies<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  unstageAllGitFiles(workspacePath: string): MaybePromise<void>;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitDiscardFileIpcDependencies<
  Context extends GitCheckpointWorkspaceActionContext = GitCheckpointWorkspaceActionContext,
> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  createAndRecordPreGitActionCheckpoint(
    reason: string,
    thread: Context["thread"],
    targetStore: Context["targetStore"],
  ): MaybePromise<unknown>;
  discardGitFile(workspacePath: string, input: GitFileActionInput): MaybePromise<void>;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitCommitIpcDependencies<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  commitGit(workspacePath: string, input: GitCommitInput): MaybePromise<void>;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitCreateBranchIpcDependencies<
  Context extends GitCheckpointWorkspaceActionContext = GitCheckpointWorkspaceActionContext,
> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  createAndRecordPreGitActionCheckpoint(
    reason: string,
    thread: Context["thread"],
    targetStore: Context["targetStore"],
  ): MaybePromise<unknown>;
  createGitBranch(workspacePath: string, input: GitBranchInput): MaybePromise<void>;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitRunActionIpcDependencies<Context extends GitRunActionContext = GitRunActionContext> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  fetchGit(workspacePath: string): MaybePromise<void>;
  createAndRecordPreGitActionCheckpoint(
    reason: string,
    thread: Context["thread"],
    targetStore: Context["targetStore"],
  ): MaybePromise<unknown>;
  pullGit(workspacePath: string): MaybePromise<void>;
  pushGit(workspacePath: string): MaybePromise<void>;
  restoreLatestGitCheckpoint(input: GitCheckpointRestoreInput): MaybePromise<unknown>;
  readGitReviewForProjectHost(host: Context["host"], threadId: string): MaybePromise<GitReviewSummary>;
}

export interface RegisterGitCreatePullRequestUrlIpcDependencies<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  createPullRequestUrl(workspacePath: string): MaybePromise<string | undefined>;
  openAllowedExternalUrl(url: string, source: string): MaybePromise<unknown>;
}

export function registerGitReviewIpc<Context extends GitReviewContext = GitReviewContext>({
  handleIpc,
  activeGitContextForProjectHost,
  readGitReviewForProjectHost,
}: RegisterGitReviewIpcDependencies<Context>): void {
  handleIpc("git:review", async () => {
    const context = activeGitContextForProjectHost();
    return readGitReviewForProjectHost(context.host, context.threadId);
  });
}

export function registerGitStageFileIpc<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext>({
  handleIpc,
  activeGitContextForProjectHost,
  stageGitFile,
  readGitReviewForProjectHost,
}: RegisterGitStageFileIpcDependencies<Context>): void {
  handleIpc("git:stage-file", async (_event, raw: GitFileActionInput) => {
    const context = activeGitContextForProjectHost();
    await stageGitFile(context.workspacePath, gitFileActionSchema.parse(raw));
    return readGitReviewForProjectHost(context.host, context.threadId);
  });
}

export function registerGitUnstageFileIpc<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext>({
  handleIpc,
  activeGitContextForProjectHost,
  unstageGitFile,
  readGitReviewForProjectHost,
}: RegisterGitUnstageFileIpcDependencies<Context>): void {
  handleIpc("git:unstage-file", async (_event, raw: GitFileActionInput) => {
    const context = activeGitContextForProjectHost();
    await unstageGitFile(context.workspacePath, gitFileActionSchema.parse(raw));
    return readGitReviewForProjectHost(context.host, context.threadId);
  });
}

export function registerGitStageAllFilesIpc<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext>({
  handleIpc,
  activeGitContextForProjectHost,
  stageAllGitFiles,
  readGitReviewForProjectHost,
}: RegisterGitStageAllFilesIpcDependencies<Context>): void {
  handleIpc("git:stage-all-files", async () => {
    const context = activeGitContextForProjectHost();
    await stageAllGitFiles(context.workspacePath);
    return readGitReviewForProjectHost(context.host, context.threadId);
  });
}

export function registerGitUnstageAllFilesIpc<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext>({
  handleIpc,
  activeGitContextForProjectHost,
  unstageAllGitFiles,
  readGitReviewForProjectHost,
}: RegisterGitUnstageAllFilesIpcDependencies<Context>): void {
  handleIpc("git:unstage-all-files", async () => {
    const context = activeGitContextForProjectHost();
    await unstageAllGitFiles(context.workspacePath);
    return readGitReviewForProjectHost(context.host, context.threadId);
  });
}

export function registerGitDiscardFileIpc<Context extends GitCheckpointWorkspaceActionContext = GitCheckpointWorkspaceActionContext>({
  handleIpc,
  activeGitContextForProjectHost,
  createAndRecordPreGitActionCheckpoint,
  discardGitFile,
  readGitReviewForProjectHost,
}: RegisterGitDiscardFileIpcDependencies<Context>): void {
  handleIpc("git:discard-file", async (_event, raw: GitFileActionInput) => {
    const context = activeGitContextForProjectHost();
    await createAndRecordPreGitActionCheckpoint("Before discarding a file.", context.thread, context.targetStore);
    await discardGitFile(context.workspacePath, gitFileActionSchema.parse(raw));
    return readGitReviewForProjectHost(context.host, context.threadId);
  });
}

export function registerGitCommitIpc<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext>({
  handleIpc,
  activeGitContextForProjectHost,
  commitGit,
  readGitReviewForProjectHost,
}: RegisterGitCommitIpcDependencies<Context>): void {
  handleIpc("git:commit", async (_event, raw: GitCommitInput) => {
    const context = activeGitContextForProjectHost();
    await commitGit(context.workspacePath, gitCommitSchema.parse(raw));
    return readGitReviewForProjectHost(context.host, context.threadId);
  });
}

export function registerGitCreateBranchIpc<Context extends GitCheckpointWorkspaceActionContext = GitCheckpointWorkspaceActionContext>({
  handleIpc,
  activeGitContextForProjectHost,
  createAndRecordPreGitActionCheckpoint,
  createGitBranch,
  readGitReviewForProjectHost,
}: RegisterGitCreateBranchIpcDependencies<Context>): void {
  handleIpc("git:create-branch", async (_event, raw: GitBranchInput) => {
    const context = activeGitContextForProjectHost();
    await createAndRecordPreGitActionCheckpoint("Before creating or switching a branch.", context.thread, context.targetStore);
    await createGitBranch(context.workspacePath, gitCreateBranchSchema.parse(raw));
    return readGitReviewForProjectHost(context.host, context.threadId);
  });
}

export function registerGitRunActionIpc<Context extends GitRunActionContext = GitRunActionContext>({
  handleIpc,
  activeGitContextForProjectHost,
  fetchGit,
  createAndRecordPreGitActionCheckpoint,
  pullGit,
  pushGit,
  restoreLatestGitCheckpoint,
  readGitReviewForProjectHost,
}: RegisterGitRunActionIpcDependencies<Context>): void {
  handleIpc("git:run-action", async (_event, raw: GitSimpleAction) => {
    const context = activeGitContextForProjectHost();
    const action = gitSimpleActionSchema.parse(raw);
    if (action === "fetch") await fetchGit(context.workspacePath);
    if (action === "pull") {
      await createAndRecordPreGitActionCheckpoint("Before pulling from remote.", context.thread, context.targetStore);
      await pullGit(context.workspacePath);
    }
    if (action === "push") await pushGit(context.workspacePath);
    if (action === "restore-latest-checkpoint") {
      await restoreLatestGitCheckpoint({
        workspacePath: context.workspacePath,
        statePath: context.targetStore.getWorkspace().statePath,
        threadId: context.threadId,
      });
    }
    return readGitReviewForProjectHost(context.host, context.threadId);
  });
}

export function registerGitCreatePullRequestUrlIpc<Context extends GitWorkspaceActionContext = GitWorkspaceActionContext>({
  handleIpc,
  activeGitContextForProjectHost,
  createPullRequestUrl,
  openAllowedExternalUrl,
}: RegisterGitCreatePullRequestUrlIpcDependencies<Context>): void {
  handleIpc("git:create-pr-url", async () => {
    const context = activeGitContextForProjectHost();
    const url = await createPullRequestUrl(context.workspacePath);
    if (url) await openAllowedExternalUrl(url, "git-create-pr");
    return url;
  });
}

export function registerGitCreateThreadWorktreeIpc<Context extends GitThreadWorktreeContext = GitThreadWorktreeContext>({
  handleIpc,
  activeGitContextForProjectHost,
  prepareWorktreeForThread,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  readGitReviewForProjectHost,
}: RegisterGitCreateThreadWorktreeIpcDependencies<Context>): void {
  handleIpc("git:create-thread-worktree", async () => {
    const context = activeGitContextForProjectHost();
    const thread = await prepareWorktreeForThread(context.thread, context.targetStore);
    setProjectHostActiveThreadId(context.host, thread.id);
    emitProjectStateIfActive(context.host, thread.id);
    return readGitReviewForProjectHost(context.host, thread.id);
  });
}

export function registerGitAttachExistingWorktreeIpc<Context extends GitAttachExistingWorktreeContext = GitAttachExistingWorktreeContext>({
  handleIpc,
  activeGitContextForProjectHost,
  showOpenDialog,
  normalizeWorkspacePath,
  attachWorktreeForThread,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  readGitReviewForProjectHost,
}: RegisterGitAttachExistingWorktreeIpcDependencies<Context>): void {
  handleIpc("git:attach-existing-worktree", async () => {
    const context = activeGitContextForProjectHost();
    const result = await showOpenDialog({
      title: "Attach Existing Git Worktree",
      defaultPath: dirname(context.workspacePath),
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return undefined;
    const thread = await attachWorktreeForThread(normalizeWorkspacePath(result.filePaths[0]), context.thread, context.targetStore);
    setProjectHostActiveThreadId(context.host, thread.id);
    emitProjectStateIfActive(context.host, thread.id);
    return readGitReviewForProjectHost(context.host, thread.id);
  });
}

export function registerGitInitializeIpc<Context extends GitInitializeContext = GitInitializeContext>({
  handleIpc,
  activeGitContextForProjectHost,
  initializeGitRepository,
  readGitReviewForProjectHost,
}: RegisterGitInitializeIpcDependencies<Context>): void {
  handleIpc("git:initialize", async () => {
    const context = activeGitContextForProjectHost();
    await initializeGitRepository(context.workspacePath);
    return readGitReviewForProjectHost(context.host, context.threadId);
  });
}
