import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  GitBranchInput,
  GitCommitInput,
  GitFileActionInput,
  GitReviewSummary,
  GitSimpleAction,
} from "../../shared/workspaceTypes";
import {
  gitAttachExistingWorktreeIpcChannels,
  gitCommitIpcChannels,
  gitCreateBranchIpcChannels,
  gitCreatePullRequestUrlIpcChannels,
  gitCreateThreadWorktreeIpcChannels,
  gitDiscardFileIpcChannels,
  gitStageFileIpcChannels,
  gitInitializeIpcChannels,
  gitReviewIpcChannels,
  gitRunActionIpcChannels,
  gitStageAllFilesIpcChannels,
  registerGitStageFileIpc,
  gitUnstageAllFilesIpcChannels,
  gitUnstageFileIpcChannels,
  registerGitAttachExistingWorktreeIpc,
  registerGitCommitIpc,
  registerGitCreateBranchIpc,
  registerGitCreatePullRequestUrlIpc,
  registerGitCreateThreadWorktreeIpc,
  registerGitDiscardFileIpc,
  registerGitInitializeIpc,
  registerGitReviewIpc,
  registerGitRunActionIpc,
  registerGitStageAllFilesIpc,
  registerGitUnstageAllFilesIpc,
  registerGitUnstageFileIpc,
  type GitAttachExistingWorktreeContext,
  type GitCheckpointWorkspaceActionContext,
  type GitInitializeContext,
  type GitReviewContext,
  type GitRunActionContext,
  type GitThreadWorktreeContext,
  type GitWorkspaceActionContext,
  type RegisterGitCommitIpcDependencies,
  type RegisterGitCreateBranchIpcDependencies,
  type RegisterGitCreatePullRequestUrlIpcDependencies,
  type RegisterGitDiscardFileIpcDependencies,
  type RegisterGitStageAllFilesIpcDependencies,
  type RegisterGitStageFileIpcDependencies,
  type RegisterGitUnstageAllFilesIpcDependencies,
  type RegisterGitUnstageFileIpcDependencies,
  type RegisterGitAttachExistingWorktreeIpcDependencies,
  type RegisterGitCreateThreadWorktreeIpcDependencies,
  type RegisterGitInitializeIpcDependencies,
  type RegisterGitReviewIpcDependencies,
  type RegisterGitRunActionIpcDependencies,
} from "./registerGitIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

interface TestHost {
  id: string;
}

interface TestStore {
  id: string;
}

interface TestRunActionStore extends TestStore {
  getWorkspace(): {
    statePath: string;
  };
}

interface TestThread {
  id: string;
}

type TestGitReviewContext = GitReviewContext<TestHost>;
type TestGitInitializeContext = GitInitializeContext<TestHost>;
type TestGitThreadWorktreeContext = GitThreadWorktreeContext<TestHost, TestStore, TestThread>;
type TestGitAttachExistingWorktreeContext = GitAttachExistingWorktreeContext<TestHost, TestStore, TestThread>;
type TestGitWorkspaceActionContext = GitWorkspaceActionContext<TestHost>;
type TestGitCheckpointWorkspaceActionContext = GitCheckpointWorkspaceActionContext<TestHost, TestStore, TestThread>;
type TestGitRunActionContext = GitRunActionContext<TestHost, TestRunActionStore, TestThread>;

describe("registerGitReviewIpc", () => {
  it("registers the git review channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...gitReviewIpcChannels]);
  });

  it("reads the git review for the active git context", async () => {
    const context = sampleGitReviewContext();
    const review = sampleGitReview();
    const { deps, invoke } = registerWithFakes({ context, review });

    await expect(invoke("git:review")).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
  });

  it("propagates git review read failures", async () => {
    const error = new Error("git review unavailable");
    const { deps, invoke } = registerWithFakes({ readGitReviewError: error });

    await expect(invoke("git:review")).rejects.toThrow(error);

    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledOnce();
  });
});

describe("registerGitInitializeIpc", () => {
  it("registers the git initialize channel", () => {
    const { handlers } = registerInitializeWithFakes();

    expect([...handlers.keys()]).toEqual([...gitInitializeIpcChannels]);
  });

  it("initializes the active workspace before reading the git review", async () => {
    const context = sampleGitInitializeContext();
    const review = sampleGitReview();
    const { deps, invoke } = registerInitializeWithFakes({ context, review });

    await expect(invoke("git:initialize")).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.initializeGitRepository).toHaveBeenCalledWith(context.workspacePath);
    expect(deps.initializeGitRepository.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
  });

  it("does not read the git review when initialization fails", async () => {
    const error = new Error("git initialization failed");
    const { deps, invoke } = registerInitializeWithFakes({ initializeGitError: error });

    await expect(invoke("git:initialize")).rejects.toThrow(error);

    expect(deps.initializeGitRepository).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitCreateThreadWorktreeIpc", () => {
  it("registers the git create thread worktree channel", () => {
    const { handlers } = registerThreadWorktreeWithFakes();

    expect([...handlers.keys()]).toEqual([...gitCreateThreadWorktreeIpcChannels]);
  });

  it("prepares a worktree for the active thread before reading the prepared thread git review", async () => {
    const context = sampleGitThreadWorktreeContext();
    const preparedThread = { id: "thread-worktree" };
    const review = sampleGitReview();
    const { deps, invoke } = registerThreadWorktreeWithFakes({ context, preparedThread, review });

    await expect(invoke("git:create-thread-worktree")).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.prepareWorktreeForThread).toHaveBeenCalledWith(context.thread, context.targetStore);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(context.host, preparedThread.id);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(context.host, preparedThread.id);
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, preparedThread.id);
    expect(deps.prepareWorktreeForThread.mock.invocationCallOrder[0]).toBeLessThan(
      deps.setProjectHostActiveThreadId.mock.invocationCallOrder[0],
    );
    expect(deps.setProjectHostActiveThreadId.mock.invocationCallOrder[0]).toBeLessThan(
      deps.emitProjectStateIfActive.mock.invocationCallOrder[0],
    );
    expect(deps.emitProjectStateIfActive.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("does not update project state or read the git review when worktree preparation fails", async () => {
    const error = new Error("worktree preparation failed");
    const { deps, invoke } = registerThreadWorktreeWithFakes({ prepareWorktreeError: error });

    await expect(invoke("git:create-thread-worktree")).rejects.toThrow(error);

    expect(deps.prepareWorktreeForThread).toHaveBeenCalledOnce();
    expect(deps.setProjectHostActiveThreadId).not.toHaveBeenCalled();
    expect(deps.emitProjectStateIfActive).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitAttachExistingWorktreeIpc", () => {
  it("registers the git attach existing worktree channel", () => {
    const { handlers } = registerAttachExistingWorktreeWithFakes();

    expect([...handlers.keys()]).toEqual([...gitAttachExistingWorktreeIpcChannels]);
  });

  it("attaches the selected worktree before reading the attached thread git review", async () => {
    const context = sampleGitAttachExistingWorktreeContext();
    const attachedThread = { id: "attached-thread" };
    const review = sampleGitReview();
    const { deps, invoke } = registerAttachExistingWorktreeWithFakes({ context, attachedThread, review });

    await expect(invoke("git:attach-existing-worktree")).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.showOpenDialog).toHaveBeenCalledWith({
      title: "Attach Existing Git Worktree",
      defaultPath: "/tmp",
      properties: ["openDirectory"],
    });
    expect(deps.normalizeWorkspacePath).toHaveBeenCalledWith("/tmp/existing-worktree");
    expect(deps.attachWorktreeForThread).toHaveBeenCalledWith("/normalized/existing-worktree", context.thread, context.targetStore);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(context.host, attachedThread.id);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(context.host, attachedThread.id);
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, attachedThread.id);
    expect(deps.showOpenDialog.mock.invocationCallOrder[0]).toBeLessThan(
      deps.attachWorktreeForThread.mock.invocationCallOrder[0],
    );
    expect(deps.attachWorktreeForThread.mock.invocationCallOrder[0]).toBeLessThan(
      deps.setProjectHostActiveThreadId.mock.invocationCallOrder[0],
    );
    expect(deps.setProjectHostActiveThreadId.mock.invocationCallOrder[0]).toBeLessThan(
      deps.emitProjectStateIfActive.mock.invocationCallOrder[0],
    );
    expect(deps.emitProjectStateIfActive.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("returns undefined without attaching a worktree when the dialog is canceled", async () => {
    const { deps, invoke } = registerAttachExistingWorktreeWithFakes({
      dialogResult: { canceled: true, filePaths: ["/tmp/ignored"] },
    });

    await expect(invoke("git:attach-existing-worktree")).resolves.toBeUndefined();

    expect(deps.normalizeWorkspacePath).not.toHaveBeenCalled();
    expect(deps.attachWorktreeForThread).not.toHaveBeenCalled();
    expect(deps.setProjectHostActiveThreadId).not.toHaveBeenCalled();
    expect(deps.emitProjectStateIfActive).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("returns undefined without attaching a worktree when no path is selected", async () => {
    const { deps, invoke } = registerAttachExistingWorktreeWithFakes({
      dialogResult: { canceled: false, filePaths: [] },
    });

    await expect(invoke("git:attach-existing-worktree")).resolves.toBeUndefined();

    expect(deps.normalizeWorkspacePath).not.toHaveBeenCalled();
    expect(deps.attachWorktreeForThread).not.toHaveBeenCalled();
    expect(deps.setProjectHostActiveThreadId).not.toHaveBeenCalled();
    expect(deps.emitProjectStateIfActive).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not update project state or read the git review when attaching fails", async () => {
    const error = new Error("attach worktree failed");
    const { deps, invoke } = registerAttachExistingWorktreeWithFakes({ attachWorktreeError: error });

    await expect(invoke("git:attach-existing-worktree")).rejects.toThrow(error);

    expect(deps.attachWorktreeForThread).toHaveBeenCalledOnce();
    expect(deps.setProjectHostActiveThreadId).not.toHaveBeenCalled();
    expect(deps.emitProjectStateIfActive).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitStageFileIpc", () => {
  it("registers the git stage file channel", () => {
    const { handlers } = registerStageFileWithFakes();

    expect([...handlers.keys()]).toEqual([...gitStageFileIpcChannels]);
  });

  it("stages a parsed file action for the active workspace before reading the git review", async () => {
    const context = sampleGitWorkspaceActionContext();
    const review = sampleGitReview();
    const input: GitFileActionInput = { path: "src/main/index.ts" };
    const { deps, invoke } = registerStageFileWithFakes({ context, review });

    await expect(invoke("git:stage-file", input)).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.stageGitFile).toHaveBeenCalledWith(context.workspacePath, input);
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.stageGitFile.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("rejects invalid file action input before staging", async () => {
    const { deps, invoke } = registerStageFileWithFakes();

    await expect(invoke("git:stage-file", { path: "" })).rejects.toThrow();

    expect(deps.stageGitFile).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not read the git review when staging fails", async () => {
    const error = new Error("stage failed");
    const { deps, invoke } = registerStageFileWithFakes({ stageGitFileError: error });

    await expect(invoke("git:stage-file", { path: "src/main/index.ts" })).rejects.toThrow(error);

    expect(deps.stageGitFile).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitUnstageFileIpc", () => {
  it("registers the git unstage file channel", () => {
    const { handlers } = registerUnstageFileWithFakes();

    expect([...handlers.keys()]).toEqual([...gitUnstageFileIpcChannels]);
  });

  it("unstages a parsed file action for the active workspace before reading the git review", async () => {
    const context = sampleGitWorkspaceActionContext();
    const review = sampleGitReview();
    const input: GitFileActionInput = { path: "src/main/index.ts" };
    const { deps, invoke } = registerUnstageFileWithFakes({ context, review });

    await expect(invoke("git:unstage-file", input)).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.unstageGitFile).toHaveBeenCalledWith(context.workspacePath, input);
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.unstageGitFile.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("rejects invalid file action input before unstaging", async () => {
    const { deps, invoke } = registerUnstageFileWithFakes();

    await expect(invoke("git:unstage-file", { path: "" })).rejects.toThrow();

    expect(deps.unstageGitFile).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not read the git review when unstaging fails", async () => {
    const error = new Error("unstage failed");
    const { deps, invoke } = registerUnstageFileWithFakes({ unstageGitFileError: error });

    await expect(invoke("git:unstage-file", { path: "src/main/index.ts" })).rejects.toThrow(error);

    expect(deps.unstageGitFile).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitStageAllFilesIpc", () => {
  it("registers the git stage all files channel", () => {
    const { handlers } = registerStageAllFilesWithFakes();

    expect([...handlers.keys()]).toEqual([...gitStageAllFilesIpcChannels]);
  });

  it("stages all files for the active workspace before reading the git review", async () => {
    const context = sampleGitWorkspaceActionContext();
    const review = sampleGitReview();
    const { deps, invoke } = registerStageAllFilesWithFakes({ context, review });

    await expect(invoke("git:stage-all-files")).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.stageAllGitFiles).toHaveBeenCalledWith(context.workspacePath);
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.stageAllGitFiles.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("does not read the git review when staging all files fails", async () => {
    const error = new Error("stage all failed");
    const { deps, invoke } = registerStageAllFilesWithFakes({ stageAllGitFilesError: error });

    await expect(invoke("git:stage-all-files")).rejects.toThrow(error);

    expect(deps.stageAllGitFiles).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitUnstageAllFilesIpc", () => {
  it("registers the git unstage all files channel", () => {
    const { handlers } = registerUnstageAllFilesWithFakes();

    expect([...handlers.keys()]).toEqual([...gitUnstageAllFilesIpcChannels]);
  });

  it("unstages all files for the active workspace before reading the git review", async () => {
    const context = sampleGitWorkspaceActionContext();
    const review = sampleGitReview();
    const { deps, invoke } = registerUnstageAllFilesWithFakes({ context, review });

    await expect(invoke("git:unstage-all-files")).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.unstageAllGitFiles).toHaveBeenCalledWith(context.workspacePath);
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.unstageAllGitFiles.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("does not read the git review when unstaging all files fails", async () => {
    const error = new Error("unstage all failed");
    const { deps, invoke } = registerUnstageAllFilesWithFakes({ unstageAllGitFilesError: error });

    await expect(invoke("git:unstage-all-files")).rejects.toThrow(error);

    expect(deps.unstageAllGitFiles).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitDiscardFileIpc", () => {
  it("registers the git discard file channel", () => {
    const { handlers } = registerDiscardFileWithFakes();

    expect([...handlers.keys()]).toEqual([...gitDiscardFileIpcChannels]);
  });

  it("records a pre-git-action checkpoint before discarding the file and reading the git review", async () => {
    const context = sampleGitCheckpointWorkspaceActionContext();
    const review = sampleGitReview();
    const input: GitFileActionInput = { path: "src/main/index.ts" };
    const { deps, invoke } = registerDiscardFileWithFakes({ context, review });

    await expect(invoke("git:discard-file", input)).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.createAndRecordPreGitActionCheckpoint).toHaveBeenCalledWith(
      "Before discarding a file.",
      context.thread,
      context.targetStore,
    );
    expect(deps.discardGitFile).toHaveBeenCalledWith(context.workspacePath, input);
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.createAndRecordPreGitActionCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(
      deps.discardGitFile.mock.invocationCallOrder[0],
    );
    expect(deps.discardGitFile.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("records the checkpoint before rejecting invalid file action input", async () => {
    const { deps, invoke } = registerDiscardFileWithFakes();

    await expect(invoke("git:discard-file", { path: "" })).rejects.toThrow();

    expect(deps.createAndRecordPreGitActionCheckpoint).toHaveBeenCalledOnce();
    expect(deps.discardGitFile).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not discard the file or read the git review when checkpointing fails", async () => {
    const error = new Error("checkpoint failed");
    const { deps, invoke } = registerDiscardFileWithFakes({ checkpointError: error });

    await expect(invoke("git:discard-file", { path: "src/main/index.ts" })).rejects.toThrow(error);

    expect(deps.createAndRecordPreGitActionCheckpoint).toHaveBeenCalledOnce();
    expect(deps.discardGitFile).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not read the git review when discarding fails", async () => {
    const error = new Error("discard failed");
    const { deps, invoke } = registerDiscardFileWithFakes({ discardGitFileError: error });

    await expect(invoke("git:discard-file", { path: "src/main/index.ts" })).rejects.toThrow(error);

    expect(deps.createAndRecordPreGitActionCheckpoint).toHaveBeenCalledOnce();
    expect(deps.discardGitFile).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitCommitIpc", () => {
  it("registers the git commit channel", () => {
    const { handlers } = registerCommitWithFakes();

    expect([...handlers.keys()]).toEqual([...gitCommitIpcChannels]);
  });

  it("commits a parsed message for the active workspace before reading the git review", async () => {
    const context = sampleGitWorkspaceActionContext();
    const review = sampleGitReview();
    const input: GitCommitInput = { message: "Extract git commit IPC" };
    const { deps, invoke } = registerCommitWithFakes({ context, review });

    await expect(invoke("git:commit", input)).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.commitGit).toHaveBeenCalledWith(context.workspacePath, input);
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.commitGit.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("rejects invalid commit input before committing", async () => {
    const { deps, invoke } = registerCommitWithFakes();

    await expect(invoke("git:commit", { message: "" })).rejects.toThrow();

    expect(deps.commitGit).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not read the git review when committing fails", async () => {
    const error = new Error("commit failed");
    const { deps, invoke } = registerCommitWithFakes({ commitGitError: error });

    await expect(invoke("git:commit", { message: "Commit this" })).rejects.toThrow(error);

    expect(deps.commitGit).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitCreateBranchIpc", () => {
  it("registers the git create branch channel", () => {
    const { handlers } = registerCreateBranchWithFakes();

    expect([...handlers.keys()]).toEqual([...gitCreateBranchIpcChannels]);
  });

  it("records a pre-git-action checkpoint before creating the branch and reading the git review", async () => {
    const context = sampleGitCheckpointWorkspaceActionContext();
    const review = sampleGitReview();
    const input: GitBranchInput = { name: "feature/extract-ipc", checkout: true };
    const { deps, invoke } = registerCreateBranchWithFakes({ context, review });

    await expect(invoke("git:create-branch", input)).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.createAndRecordPreGitActionCheckpoint).toHaveBeenCalledWith(
      "Before creating or switching a branch.",
      context.thread,
      context.targetStore,
    );
    expect(deps.createGitBranch).toHaveBeenCalledWith(context.workspacePath, input);
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.createAndRecordPreGitActionCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(
      deps.createGitBranch.mock.invocationCallOrder[0],
    );
    expect(deps.createGitBranch.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("records the checkpoint before rejecting invalid branch input", async () => {
    const { deps, invoke } = registerCreateBranchWithFakes();

    await expect(invoke("git:create-branch", { name: "" })).rejects.toThrow();

    expect(deps.createAndRecordPreGitActionCheckpoint).toHaveBeenCalledOnce();
    expect(deps.createGitBranch).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not create the branch or read the git review when checkpointing fails", async () => {
    const error = new Error("checkpoint failed");
    const { deps, invoke } = registerCreateBranchWithFakes({ checkpointError: error });

    await expect(invoke("git:create-branch", { name: "feature/extract-ipc" })).rejects.toThrow(error);

    expect(deps.createAndRecordPreGitActionCheckpoint).toHaveBeenCalledOnce();
    expect(deps.createGitBranch).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not read the git review when branch creation fails", async () => {
    const error = new Error("create branch failed");
    const { deps, invoke } = registerCreateBranchWithFakes({ createGitBranchError: error });

    await expect(invoke("git:create-branch", { name: "feature/extract-ipc" })).rejects.toThrow(error);

    expect(deps.createAndRecordPreGitActionCheckpoint).toHaveBeenCalledOnce();
    expect(deps.createGitBranch).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitRunActionIpc", () => {
  it("registers the git run action channel", () => {
    const { handlers } = registerRunActionWithFakes();

    expect([...handlers.keys()]).toEqual([...gitRunActionIpcChannels]);
  });

  it("fetches the active workspace before reading the git review", async () => {
    const context = sampleGitRunActionContext();
    const review = sampleGitReview();
    const { deps, invoke } = registerRunActionWithFakes({ context, review });

    await expect(invoke("fetch")).resolves.toEqual(review);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.fetchGit).toHaveBeenCalledWith(context.workspacePath);
    expect(deps.createAndRecordPreGitActionCheckpoint).not.toHaveBeenCalled();
    expect(deps.pullGit).not.toHaveBeenCalled();
    expect(deps.pushGit).not.toHaveBeenCalled();
    expect(deps.restoreLatestGitCheckpoint).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.fetchGit.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("records a pre-git-action checkpoint before pulling and reading the git review", async () => {
    const context = sampleGitRunActionContext();
    const review = sampleGitReview();
    const { deps, invoke } = registerRunActionWithFakes({ context, review });

    await expect(invoke("pull")).resolves.toEqual(review);

    expect(deps.createAndRecordPreGitActionCheckpoint).toHaveBeenCalledWith(
      "Before pulling from remote.",
      context.thread,
      context.targetStore,
    );
    expect(deps.pullGit).toHaveBeenCalledWith(context.workspacePath);
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.createAndRecordPreGitActionCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(
      deps.pullGit.mock.invocationCallOrder[0],
    );
    expect(deps.pullGit.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("pushes the active workspace before reading the git review", async () => {
    const context = sampleGitRunActionContext();
    const review = sampleGitReview();
    const { deps, invoke } = registerRunActionWithFakes({ context, review });

    await expect(invoke("push")).resolves.toEqual(review);

    expect(deps.pushGit).toHaveBeenCalledWith(context.workspacePath);
    expect(deps.createAndRecordPreGitActionCheckpoint).not.toHaveBeenCalled();
    expect(deps.fetchGit).not.toHaveBeenCalled();
    expect(deps.pullGit).not.toHaveBeenCalled();
    expect(deps.restoreLatestGitCheckpoint).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.pushGit.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("restores the latest checkpoint for the active workspace before reading the git review", async () => {
    const context = sampleGitRunActionContext();
    const review = sampleGitReview();
    const { deps, invoke } = registerRunActionWithFakes({ context, review });

    await expect(invoke("restore-latest-checkpoint")).resolves.toEqual(review);

    expect(deps.restoreLatestGitCheckpoint).toHaveBeenCalledWith({
      workspacePath: context.workspacePath,
      statePath: "/tmp/workspace/.ambient/state.json",
      threadId: context.threadId,
    });
    expect(deps.fetchGit).not.toHaveBeenCalled();
    expect(deps.createAndRecordPreGitActionCheckpoint).not.toHaveBeenCalled();
    expect(deps.pullGit).not.toHaveBeenCalled();
    expect(deps.pushGit).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).toHaveBeenCalledWith(context.host, context.threadId);
    expect(deps.restoreLatestGitCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readGitReviewForProjectHost.mock.invocationCallOrder[0],
    );
  });

  it("loads the active context before rejecting invalid action input", async () => {
    const { deps, invokeRaw } = registerRunActionWithFakes();

    await expect(invokeRaw("not-a-git-action")).rejects.toThrow();

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.fetchGit).not.toHaveBeenCalled();
    expect(deps.createAndRecordPreGitActionCheckpoint).not.toHaveBeenCalled();
    expect(deps.pullGit).not.toHaveBeenCalled();
    expect(deps.pushGit).not.toHaveBeenCalled();
    expect(deps.restoreLatestGitCheckpoint).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not pull or read the git review when checkpointing before pull fails", async () => {
    const error = new Error("checkpoint failed");
    const { deps, invoke } = registerRunActionWithFakes({ checkpointError: error });

    await expect(invoke("pull")).rejects.toThrow(error);

    expect(deps.createAndRecordPreGitActionCheckpoint).toHaveBeenCalledOnce();
    expect(deps.pullGit).not.toHaveBeenCalled();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not read the git review when a git action fails", async () => {
    const error = new Error("fetch failed");
    const { deps, invoke } = registerRunActionWithFakes({ fetchGitError: error });

    await expect(invoke("fetch")).rejects.toThrow(error);

    expect(deps.fetchGit).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });

  it("does not read the git review when checkpoint restore fails", async () => {
    const error = new Error("restore failed");
    const { deps, invoke } = registerRunActionWithFakes({ restoreLatestGitCheckpointError: error });

    await expect(invoke("restore-latest-checkpoint")).rejects.toThrow(error);

    expect(deps.restoreLatestGitCheckpoint).toHaveBeenCalledOnce();
    expect(deps.readGitReviewForProjectHost).not.toHaveBeenCalled();
  });
});

describe("registerGitCreatePullRequestUrlIpc", () => {
  it("registers the git create pull request URL channel", () => {
    const { handlers } = registerCreatePullRequestUrlWithFakes();

    expect([...handlers.keys()]).toEqual([...gitCreatePullRequestUrlIpcChannels]);
  });

  it("creates and opens the pull request URL for the active workspace", async () => {
    const context = sampleGitWorkspaceActionContext();
    const url = "https://github.com/ambient-xyz/AmbientDesktop/compare/main...feature";
    const { deps, invoke } = registerCreatePullRequestUrlWithFakes({ context, url });

    await expect(invoke()).resolves.toBe(url);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.createPullRequestUrl).toHaveBeenCalledWith(context.workspacePath);
    expect(deps.openAllowedExternalUrl).toHaveBeenCalledWith(url, "git-create-pr");
    expect(deps.createPullRequestUrl.mock.invocationCallOrder[0]).toBeLessThan(
      deps.openAllowedExternalUrl.mock.invocationCallOrder[0],
    );
  });

  it("returns undefined without opening an external URL when no pull request URL is available", async () => {
    const { deps, invoke } = registerCreatePullRequestUrlWithFakes({ url: undefined });

    await expect(invoke()).resolves.toBeUndefined();

    expect(deps.createPullRequestUrl).toHaveBeenCalledOnce();
    expect(deps.openAllowedExternalUrl).not.toHaveBeenCalled();
  });

  it("does not open an external URL when pull request URL creation fails", async () => {
    const error = new Error("pull request URL unavailable");
    const { deps, invoke } = registerCreatePullRequestUrlWithFakes({ createPullRequestUrlError: error });

    await expect(invoke()).rejects.toThrow(error);

    expect(deps.createPullRequestUrl).toHaveBeenCalledOnce();
    expect(deps.openAllowedExternalUrl).not.toHaveBeenCalled();
  });

  it("propagates external URL open failures", async () => {
    const error = new Error("external URL blocked");
    const url = "https://github.com/ambient-xyz/AmbientDesktop/compare/main...feature";
    const { deps, invoke } = registerCreatePullRequestUrlWithFakes({ url, openAllowedExternalUrlError: error });

    await expect(invoke()).rejects.toThrow(error);

    expect(deps.createPullRequestUrl).toHaveBeenCalledOnce();
    expect(deps.openAllowedExternalUrl).toHaveBeenCalledWith(url, "git-create-pr");
  });
});

function registerWithFakes({
  context = sampleGitReviewContext(),
  review = sampleGitReview(),
  readGitReviewError,
}: {
  context?: TestGitReviewContext;
  review?: GitReviewSummary;
  readGitReviewError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    readGitReviewForProjectHost: vi.fn(async () => {
      if (readGitReviewError) throw readGitReviewError;
      return review;
    }),
  } satisfies RegisterGitReviewIpcDependencies<TestGitReviewContext>;
  registerGitReviewIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerInitializeWithFakes({
  context = sampleGitInitializeContext(),
  review = sampleGitReview(),
  initializeGitError,
}: {
  context?: TestGitInitializeContext;
  review?: GitReviewSummary;
  initializeGitError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    initializeGitRepository: vi.fn(async () => {
      if (initializeGitError) throw initializeGitError;
    }),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitInitializeIpcDependencies<TestGitInitializeContext>;
  registerGitInitializeIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerThreadWorktreeWithFakes({
  context = sampleGitThreadWorktreeContext(),
  preparedThread = { id: "thread-worktree" },
  review = sampleGitReview(),
  prepareWorktreeError,
}: {
  context?: TestGitThreadWorktreeContext;
  preparedThread?: TestThread;
  review?: GitReviewSummary;
  prepareWorktreeError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    prepareWorktreeForThread: vi.fn(async () => {
      if (prepareWorktreeError) throw prepareWorktreeError;
      return preparedThread;
    }),
    setProjectHostActiveThreadId: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitCreateThreadWorktreeIpcDependencies<TestGitThreadWorktreeContext>;
  registerGitCreateThreadWorktreeIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerAttachExistingWorktreeWithFakes({
  context = sampleGitAttachExistingWorktreeContext(),
  dialogResult = { canceled: false, filePaths: ["/tmp/existing-worktree"] },
  normalizedWorktreePath = "/normalized/existing-worktree",
  attachedThread = { id: "attached-thread" },
  review = sampleGitReview(),
  attachWorktreeError,
}: {
  context?: TestGitAttachExistingWorktreeContext;
  dialogResult?: { canceled: boolean; filePaths: string[] };
  normalizedWorktreePath?: string;
  attachedThread?: TestThread;
  review?: GitReviewSummary;
  attachWorktreeError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    showOpenDialog: vi.fn(async () => dialogResult),
    normalizeWorkspacePath: vi.fn(() => normalizedWorktreePath),
    attachWorktreeForThread: vi.fn(async () => {
      if (attachWorktreeError) throw attachWorktreeError;
      return attachedThread;
    }),
    setProjectHostActiveThreadId: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitAttachExistingWorktreeIpcDependencies<TestGitAttachExistingWorktreeContext>;
  registerGitAttachExistingWorktreeIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerStageFileWithFakes({
  context = sampleGitWorkspaceActionContext(),
  review = sampleGitReview(),
  stageGitFileError,
}: {
  context?: TestGitWorkspaceActionContext;
  review?: GitReviewSummary;
  stageGitFileError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    stageGitFile: vi.fn(async () => {
      if (stageGitFileError) throw stageGitFileError;
    }),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitStageFileIpcDependencies<TestGitWorkspaceActionContext>;
  registerGitStageFileIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerUnstageFileWithFakes({
  context = sampleGitWorkspaceActionContext(),
  review = sampleGitReview(),
  unstageGitFileError,
}: {
  context?: TestGitWorkspaceActionContext;
  review?: GitReviewSummary;
  unstageGitFileError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    unstageGitFile: vi.fn(async () => {
      if (unstageGitFileError) throw unstageGitFileError;
    }),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitUnstageFileIpcDependencies<TestGitWorkspaceActionContext>;
  registerGitUnstageFileIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerStageAllFilesWithFakes({
  context = sampleGitWorkspaceActionContext(),
  review = sampleGitReview(),
  stageAllGitFilesError,
}: {
  context?: TestGitWorkspaceActionContext;
  review?: GitReviewSummary;
  stageAllGitFilesError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    stageAllGitFiles: vi.fn(async () => {
      if (stageAllGitFilesError) throw stageAllGitFilesError;
    }),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitStageAllFilesIpcDependencies<TestGitWorkspaceActionContext>;
  registerGitStageAllFilesIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerUnstageAllFilesWithFakes({
  context = sampleGitWorkspaceActionContext(),
  review = sampleGitReview(),
  unstageAllGitFilesError,
}: {
  context?: TestGitWorkspaceActionContext;
  review?: GitReviewSummary;
  unstageAllGitFilesError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    unstageAllGitFiles: vi.fn(async () => {
      if (unstageAllGitFilesError) throw unstageAllGitFilesError;
    }),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitUnstageAllFilesIpcDependencies<TestGitWorkspaceActionContext>;
  registerGitUnstageAllFilesIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerDiscardFileWithFakes({
  context = sampleGitCheckpointWorkspaceActionContext(),
  review = sampleGitReview(),
  checkpointError,
  discardGitFileError,
}: {
  context?: TestGitCheckpointWorkspaceActionContext;
  review?: GitReviewSummary;
  checkpointError?: Error;
  discardGitFileError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    createAndRecordPreGitActionCheckpoint: vi.fn(async () => {
      if (checkpointError) throw checkpointError;
    }),
    discardGitFile: vi.fn(async () => {
      if (discardGitFileError) throw discardGitFileError;
    }),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitDiscardFileIpcDependencies<TestGitCheckpointWorkspaceActionContext>;
  registerGitDiscardFileIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerCommitWithFakes({
  context = sampleGitWorkspaceActionContext(),
  review = sampleGitReview(),
  commitGitError,
}: {
  context?: TestGitWorkspaceActionContext;
  review?: GitReviewSummary;
  commitGitError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    commitGit: vi.fn(async () => {
      if (commitGitError) throw commitGitError;
    }),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitCommitIpcDependencies<TestGitWorkspaceActionContext>;
  registerGitCommitIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerCreateBranchWithFakes({
  context = sampleGitCheckpointWorkspaceActionContext(),
  review = sampleGitReview(),
  checkpointError,
  createGitBranchError,
}: {
  context?: TestGitCheckpointWorkspaceActionContext;
  review?: GitReviewSummary;
  checkpointError?: Error;
  createGitBranchError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    createAndRecordPreGitActionCheckpoint: vi.fn(async () => {
      if (checkpointError) throw checkpointError;
    }),
    createGitBranch: vi.fn(async () => {
      if (createGitBranchError) throw createGitBranchError;
    }),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitCreateBranchIpcDependencies<TestGitCheckpointWorkspaceActionContext>;
  registerGitCreateBranchIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRunActionWithFakes({
  context = sampleGitRunActionContext(),
  review = sampleGitReview(),
  fetchGitError,
  checkpointError,
  pullGitError,
  pushGitError,
  restoreLatestGitCheckpointError,
}: {
  context?: TestGitRunActionContext;
  review?: GitReviewSummary;
  fetchGitError?: Error;
  checkpointError?: Error;
  pullGitError?: Error;
  pushGitError?: Error;
  restoreLatestGitCheckpointError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    fetchGit: vi.fn(async () => {
      if (fetchGitError) throw fetchGitError;
    }),
    createAndRecordPreGitActionCheckpoint: vi.fn(async () => {
      if (checkpointError) throw checkpointError;
    }),
    pullGit: vi.fn(async () => {
      if (pullGitError) throw pullGitError;
    }),
    pushGit: vi.fn(async () => {
      if (pushGitError) throw pushGitError;
    }),
    restoreLatestGitCheckpoint: vi.fn(async () => {
      if (restoreLatestGitCheckpointError) throw restoreLatestGitCheckpointError;
    }),
    readGitReviewForProjectHost: vi.fn(async () => review),
  } satisfies RegisterGitRunActionIpcDependencies<TestGitRunActionContext>;
  registerGitRunActionIpc(deps);

  return {
    deps,
    handlers,
    invoke: (raw: GitSimpleAction) => {
      const handler = handlers.get("git:run-action");
      expect(handler).toBeDefined();
      if (!handler) throw new Error("Missing handler for git:run-action");
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    invokeRaw: (raw: unknown) => {
      const handler = handlers.get("git:run-action");
      expect(handler).toBeDefined();
      if (!handler) throw new Error("Missing handler for git:run-action");
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerCreatePullRequestUrlWithFakes(options: {
  context?: TestGitWorkspaceActionContext;
  url?: string;
  createPullRequestUrlError?: Error;
  openAllowedExternalUrlError?: Error;
} = {}) {
  const {
    context = sampleGitWorkspaceActionContext(),
    createPullRequestUrlError,
    openAllowedExternalUrlError,
  } = options;
  const url = "url" in options ? options.url : "https://github.com/ambient-xyz/AmbientDesktop/compare/main...feature";
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    createPullRequestUrl: vi.fn(async () => {
      if (createPullRequestUrlError) throw createPullRequestUrlError;
      return url;
    }),
    openAllowedExternalUrl: vi.fn(async () => {
      if (openAllowedExternalUrlError) throw openAllowedExternalUrlError;
    }),
  } satisfies RegisterGitCreatePullRequestUrlIpcDependencies<TestGitWorkspaceActionContext>;
  registerGitCreatePullRequestUrlIpc(deps);

  return {
    deps,
    handlers,
    invoke: () => {
      const handler = handlers.get("git:create-pr-url");
      expect(handler).toBeDefined();
      if (!handler) throw new Error("Missing handler for git:create-pr-url");
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function sampleGitReviewContext(): TestGitReviewContext {
  return {
    host: { id: "project-host-1" },
    threadId: "thread-1",
  };
}

function sampleGitInitializeContext(): TestGitInitializeContext {
  return {
    host: { id: "project-host-1" },
    threadId: "thread-1",
    workspacePath: "/tmp/workspace",
  };
}

function sampleGitThreadWorktreeContext(): TestGitThreadWorktreeContext {
  return {
    host: { id: "project-host-1" },
    targetStore: { id: "project-store-1" },
    threadId: "thread-1",
    thread: { id: "thread-1" },
  };
}

function sampleGitAttachExistingWorktreeContext(): TestGitAttachExistingWorktreeContext {
  return {
    host: { id: "project-host-1" },
    targetStore: { id: "project-store-1" },
    threadId: "thread-1",
    thread: { id: "thread-1" },
    workspacePath: "/tmp/workspace",
  };
}

function sampleGitWorkspaceActionContext(): TestGitWorkspaceActionContext {
  return {
    host: { id: "project-host-1" },
    threadId: "thread-1",
    workspacePath: "/tmp/workspace",
  };
}

function sampleGitCheckpointWorkspaceActionContext(): TestGitCheckpointWorkspaceActionContext {
  return {
    host: { id: "project-host-1" },
    targetStore: { id: "project-store-1" },
    threadId: "thread-1",
    thread: { id: "thread-1" },
    workspacePath: "/tmp/workspace",
  };
}

function sampleGitRunActionContext(): TestGitRunActionContext {
  return {
    host: { id: "project-host-1" },
    targetStore: {
      id: "project-store-1",
      getWorkspace: () => ({ statePath: "/tmp/workspace/.ambient/state.json" }),
    },
    threadId: "thread-1",
    thread: { id: "thread-1" },
    workspacePath: "/tmp/workspace",
  };
}

function sampleGitReview(): GitReviewSummary {
  return {
    isGitRepository: true,
    workspacePath: "/tmp/workspace",
    projectRoot: "/tmp/workspace",
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
  };
}
