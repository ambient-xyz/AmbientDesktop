import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  RequestThreadPermissionModeChangeInput,
  UpdateThreadSettingsInput,
} from "../../shared/desktopTypes";
import type { PermissionAuditEntry } from "../../shared/permissionTypes";
import type {
  ChatMessage,
  ExportChatInput,
  ExportChatPdfInput,
  ExportChatPdfResult,
  ExportChatResult,
  ThreadGoal,
} from "../../shared/threadTypes";
import {
  registerThreadArchiveIpc,
  registerThreadCreateIpc,
  registerThreadExportChatIpc,
  registerThreadExportChatPdfIpc,
  registerThreadForkIpc,
  registerThreadGoalIpc,
  registerThreadMarkUnreadIpc,
  registerThreadOpenMiniWindowIpc,
  registerThreadPermissionModeChangeIpc,
  registerThreadRevealIpc,
  registerThreadSelectIpc,
  registerThreadUpdateSettingsIpc,
  registerThreadUpdateIpc,
  threadArchiveIpcChannels,
  threadCreateIpcChannels,
  threadExportChatIpcChannels,
  threadExportChatPdfIpcChannels,
  threadForkIpcChannels,
  threadGoalIpcChannels,
  threadMarkUnreadIpcChannels,
  threadOpenMiniWindowIpcChannels,
  threadPermissionModeChangeIpcChannels,
  threadRevealIpcChannels,
  threadSelectIpcChannels,
  threadUpdateSettingsIpcChannels,
  threadUpdateIpcChannels,
  type RegisterThreadArchiveIpcDependencies,
  type RegisterThreadCreateIpcDependencies,
  type RegisterThreadExportChatIpcDependencies,
  type RegisterThreadExportChatPdfIpcDependencies,
  type RegisterThreadForkIpcDependencies,
  type RegisterThreadGoalIpcDependencies,
  type RegisterThreadMarkUnreadIpcDependencies,
  type RegisterThreadOpenMiniWindowIpcDependencies,
  type RegisterThreadPermissionModeChangeIpcDependencies,
  type RegisterThreadRevealIpcDependencies,
  type RegisterThreadSelectIpcDependencies,
  type RegisterThreadUpdateSettingsIpcDependencies,
  type RegisterThreadUpdateIpcDependencies,
  type ThreadCreateStore,
  type ThreadCreateThread,
  type ThreadArchiveStore,
  type ThreadForkStore,
  type ThreadForkThread,
  type ThreadGoalRuntime,
  type ThreadGoalStore,
  type ThreadMarkUnreadStore,
  type ThreadMarkUnreadThread,
  type ThreadOpenMiniWindowStore,
  type ThreadOpenMiniWindowThread,
  type ThreadPermissionAuditInput,
  type ThreadPermissionModeStore,
  type ThreadPermissionModeThread,
  type ThreadPermissionModeUpdate,
  type ThreadRevealStore,
  type ThreadRevealThread,
  type ThreadUpdateSettingsStore,
  type ThreadUpdateSettingsThread,
  type ThreadUpdateStore,
  type ThreadUpdateThread,
} from "./registerThreadIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];
type FakeThreadSettingsUpdate = UpdateThreadSettingsInput | ThreadPermissionModeUpdate;

interface FakeHost {
  store: FakeStore;
  runtime: FakeRuntime;
  activeThreadId: string;
}

type FakeStore = ThreadCreateStore<FakeThread> & ThreadArchiveStore & ThreadGoalStore & ThreadMarkUnreadStore<FakeThread> & ThreadRevealStore<FakeThread> & ThreadUpdateStore<FakeThread> & {
  createThread: ReturnType<typeof vi.fn<(title?: string, workspacePath?: string, options?: unknown) => FakeThread>>;
  findReusableEmptyThread: ReturnType<typeof vi.fn<() => FakeThread | undefined>>;
  getWorkspace: ReturnType<typeof vi.fn<() => { path: string }>>;
  forkThread: ReturnType<typeof vi.fn<(threadId: string, workspacePath: string) => FakeThread>>;
  archiveThread: ReturnType<typeof vi.fn<(threadId: string) => void>>;
  markThreadUnread: ReturnType<typeof vi.fn<(threadId: string) => FakeThread>>;
  getThread: ReturnType<typeof vi.fn<(threadId: string) => FakeThread>>;
  listMessages: ReturnType<typeof vi.fn<(threadId: string) => FakeMessage[]>>;
  updateThreadSettings: ReturnType<typeof vi.fn<(threadId: string, input: FakeThreadSettingsUpdate) => FakeThread>>;
  updateThreadTitle: ReturnType<typeof vi.fn<(threadId: string, title: string) => FakeThread>>;
  setThreadPinned: ReturnType<typeof vi.fn<(threadId: string, pinned: boolean) => FakeThread>>;
  addPermissionAudit: ReturnType<typeof vi.fn<(input: ThreadPermissionAuditInput) => PermissionAuditEntry>>;
  getThreadGoal: ReturnType<typeof vi.fn<(threadId: string) => ThreadGoal | undefined>>;
  setThreadGoal: ReturnType<typeof vi.fn<(input: { threadId: string }) => ThreadGoal>>;
  clearThreadGoal: ReturnType<typeof vi.fn<(threadId: string, expectedGoalId?: string) => ThreadGoal | undefined>>;
} & ThreadForkStore<FakeThread> & ThreadOpenMiniWindowStore<FakeThread, FakeMessage> & ThreadPermissionModeStore<FakeThread> & ThreadUpdateSettingsStore<FakeThread>;

type FakeThread = ThreadCreateThread & ThreadForkThread & ThreadMarkUnreadThread & ThreadOpenMiniWindowThread & ThreadPermissionModeThread & ThreadRevealThread & ThreadUpdateSettingsThread & ThreadUpdateThread;
type FakeMessage = ChatMessage;
type FakeRuntime = ThreadGoalRuntime & {
  continueGoalIfIdle: ReturnType<typeof vi.fn<(threadId: string, goalId: string) => void>>;
  applyThreadMemorySettings: ReturnType<typeof vi.fn<(threadId: string) => void>>;
  applyThreadModelSettings: ReturnType<typeof vi.fn<(threadId: string) => Promise<void>>>;
};

describe("registerThreadCreateIpc", () => {
  it("registers the thread create channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...threadCreateIpcChannels]);
  });

  it("reuses an empty thread and prepares its worktree for the active workspace", async () => {
    const reusableThread = sampleThread("reusable-thread", "/tmp/workspace");
    const { deps, host, invoke } = registerWithFakes({ reusableThread });

    await expect(invoke("thread:create")).resolves.toEqual(sampleDesktopState("reusable-thread"));

    expect(host.store.findReusableEmptyThread).toHaveBeenCalledOnce();
    expect(host.store.createThread).not.toHaveBeenCalled();
    expect(deps.prepareWorktreeForThread).toHaveBeenCalledWith(reusableThread, host.store);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "reusable-thread");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "reusable-thread");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "reusable-thread");
  });

  it("creates a default thread when no reusable empty thread exists", async () => {
    const { deps, host, invoke } = registerWithFakes();

    await expect(invoke("thread:create")).resolves.toEqual(sampleDesktopState("created-1"));

    expect(host.store.findReusableEmptyThread).toHaveBeenCalledOnce();
    expect(host.store.createThread).toHaveBeenCalledWith();
    expect(deps.prepareWorktreeForThread).toHaveBeenCalledWith(sampleThread("created-1", "/tmp/workspace"), host.store);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "created-1");
  });

  it("creates a thread with explicit initial state without reusing an empty thread", async () => {
    const { deps, host, invoke } = registerWithFakes();
    const input = {
      permissionMode: "full-access",
      collaborationMode: "planner",
      model: "ambient-test-model",
      thinkingLevel: "high",
      workspacePath: "/tmp/other-workspace",
    };

    await expect(invoke("thread:create", input)).resolves.toEqual(sampleDesktopState("created-1"));

    expect(host.store.findReusableEmptyThread).not.toHaveBeenCalled();
    expect(host.store.createThread).toHaveBeenCalledWith("New chat", "/tmp/other-workspace", {
      permissionMode: "full-access",
      collaborationMode: "planner",
      model: "ambient-test-model",
      thinkingLevel: "high",
    });
    expect(deps.prepareWorktreeForThread).not.toHaveBeenCalled();
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "created-1");
  });

  it("does not prepare a worktree for a thread that already has one", async () => {
    const reusableThread = {
      ...sampleThread("worktree-thread", "/tmp/workspace"),
      gitWorktree: sampleThreadWorktree("worktree-thread", "/tmp/workspace"),
    };
    const { deps, host, invoke } = registerWithFakes({ reusableThread });

    await expect(invoke("thread:create")).resolves.toEqual(sampleDesktopState("worktree-thread"));

    expect(deps.prepareWorktreeForThread).not.toHaveBeenCalled();
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "worktree-thread");
  });

  it("rejects invalid thread create input before calling dependencies", async () => {
    const { deps, host, invoke } = registerWithFakes();

    await expect(invoke("thread:create", { permissionMode: "admin" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(host.store.createThread).not.toHaveBeenCalled();
  });
});

describe("registerThreadSelectIpc", () => {
  it("registers the thread select channel", () => {
    const { handlers } = registerSelectWithFakes();

    expect([...handlers.keys()]).toEqual([...threadSelectIpcChannels]);
  });

  it("selects the owning thread host and returns scoped desktop state", async () => {
    const { deps, host, invoke } = registerSelectWithFakes();

    await expect(invoke("thread:select", "thread-1")).resolves.toEqual(sampleDesktopState("thread-1"));

    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
    expect(host.activeThreadId).toBe("thread-1");
  });
});

describe("registerThreadUpdateIpc", () => {
  it("registers the thread update channel", () => {
    const { handlers } = registerUpdateWithFakes();

    expect([...handlers.keys()]).toEqual([...threadUpdateIpcChannels]);
  });

  it("updates title and pinned state on the owning active host", async () => {
    const { deps, activeHost, targetHost, invoke } = registerUpdateWithFakes({
      currentThread: sampleThread("thread-1", "/tmp/workspace", { title: "Before", pinned: false }),
    });

    await expect(invoke("thread:update", { threadId: "thread-1", title: "After", pinned: true })).resolves.toEqual(sampleDesktopState("thread-1"));

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith({ threadId: "thread-1", title: "After", pinned: true }, activeHost);
    expect(targetHost.store.getThread).toHaveBeenCalledWith("thread-1");
    expect(targetHost.store.updateThreadTitle).toHaveBeenCalledWith("thread-1", "After");
    expect(targetHost.store.setThreadPinned).toHaveBeenCalledWith("thread-1", true);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(targetHost);
    expect(deps.isActiveProjectRuntimeHost).toHaveBeenCalledWith(targetHost);
    expect(deps.emitThreadUpdated).not.toHaveBeenCalled();
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(targetHost);
  });

  it("does not update omitted fields", async () => {
    const { deps, targetHost, invoke } = registerUpdateWithFakes({
      currentThread: sampleThread("thread-1", "/tmp/workspace", { title: "Before", pinned: false }),
    });

    await expect(invoke("thread:update", { threadId: "thread-1" })).resolves.toEqual(sampleDesktopState("thread-1"));

    expect(targetHost.store.getThread).toHaveBeenCalledWith("thread-1");
    expect(targetHost.store.updateThreadTitle).not.toHaveBeenCalled();
    expect(targetHost.store.setThreadPinned).not.toHaveBeenCalled();
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(targetHost);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(targetHost);
  });

  it("emits a thread update when the owning host is inactive", async () => {
    const { deps, targetHost, invoke } = registerUpdateWithFakes({
      targetIsActive: false,
      currentThread: sampleThread("thread-2", "/tmp/other", { title: "Before", pinned: false }),
    });

    await expect(invoke("thread:update", { threadId: "thread-2", pinned: true })).resolves.toEqual(sampleDesktopState("thread-2"));

    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(targetHost);
    expect(deps.emitThreadUpdated).toHaveBeenCalledWith(sampleThread("thread-2", "/tmp/other", { title: "Before", pinned: true }));
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(targetHost);
  });

  it("rejects invalid thread update input before calling dependencies", () => {
    const { deps, targetHost, invoke } = registerUpdateWithFakes();

    expect(() => invoke("thread:update", { threadId: "" })).toThrow();
    expect(() => invoke("thread:update", { threadId: "thread-1", projectId: "" })).toThrow();
    expect(() => invoke("thread:update", { threadId: "thread-1", title: "x".repeat(161) })).toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(targetHost.store.getThread).not.toHaveBeenCalled();
  });
});

describe("registerThreadArchiveIpc", () => {
  it("registers the thread archive channel", () => {
    const { handlers } = registerArchiveWithFakes();

    expect([...handlers.keys()]).toEqual([...threadArchiveIpcChannels]);
  });

  it("archives an inactive thread and returns scoped desktop state", async () => {
    const { deps, activeHost, targetHost, invoke } = registerArchiveWithFakes({
      activeThreadId: "thread-active",
    });

    await expect(invoke("thread:archive", { threadId: "thread-archived", projectId: "project-1" })).resolves.toEqual(sampleDesktopState("thread-active"));

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith({ threadId: "thread-archived", projectId: "project-1" }, activeHost);
    expect(targetHost.store.archiveThread).toHaveBeenCalledWith("thread-archived");
    expect(deps.initialActiveThreadIdForStore).not.toHaveBeenCalled();
    expect(deps.setProjectHostActiveThreadId).not.toHaveBeenCalled();
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(targetHost);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(targetHost);
  });

  it("selects the initial thread when archiving the active thread", async () => {
    const { deps, targetHost, invoke } = registerArchiveWithFakes({
      activeThreadId: "thread-active",
      initialThreadId: "thread-next",
    });

    await expect(invoke("thread:archive", { threadId: "thread-active" })).resolves.toEqual(sampleDesktopState("thread-next"));

    expect(targetHost.store.archiveThread).toHaveBeenCalledWith("thread-active");
    expect(deps.initialActiveThreadIdForStore).toHaveBeenCalledWith(targetHost.store);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(targetHost, "thread-next");
    expect(targetHost.activeThreadId).toBe("thread-next");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(targetHost);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(targetHost);
  });

  it("rejects invalid thread archive input before calling dependencies", () => {
    const { deps, targetHost, invoke } = registerArchiveWithFakes();

    expect(() => invoke("thread:archive", { threadId: "" })).toThrow();
    expect(() => invoke("thread:archive", { threadId: "thread-1", projectId: "" })).toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(targetHost.store.archiveThread).not.toHaveBeenCalled();
  });
});

describe("registerThreadMarkUnreadIpc", () => {
  it("registers the thread mark unread channel", () => {
    const { handlers } = registerMarkUnreadWithFakes();

    expect([...handlers.keys()]).toEqual([...threadMarkUnreadIpcChannels]);
  });

  it("marks an inactive-host thread unread, emits the thread update, and returns global state", async () => {
    const unreadThread = sampleThread("thread-unread", "/tmp/other");
    const { deps, activeHost, targetHost, invoke } = registerMarkUnreadWithFakes({
      targetIsActive: false,
      unreadThread,
    });

    await expect(invoke("thread:mark-unread", { threadId: "thread-unread", projectId: "project-1" })).resolves.toEqual(sampleDesktopState("global-active"));

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith({ threadId: "thread-unread", projectId: "project-1" }, activeHost);
    expect(targetHost.store.markThreadUnread).toHaveBeenCalledWith("thread-unread");
    expect(deps.isActiveProjectRuntimeHost).toHaveBeenCalledWith(targetHost);
    expect(deps.emitThreadUpdated).toHaveBeenCalledWith(unreadThread);
    expect(deps.readState).toHaveBeenCalledWith();
    expect(deps.activeThreadIdForHost).not.toHaveBeenCalled();
    expect(deps.emitDesktopState).not.toHaveBeenCalled();
  });

  it("marks a non-active thread unread and emits active desktop state without preserving unread state", async () => {
    const { deps, targetHost, invoke } = registerMarkUnreadWithFakes({
      activeThreadId: "thread-active",
      unreadThread: sampleThread("thread-other", "/tmp/workspace"),
    });

    await expect(invoke("thread:mark-unread", { threadId: "thread-other" })).resolves.toEqual(sampleDesktopState("thread-active"));

    expect(targetHost.store.markThreadUnread).toHaveBeenCalledWith("thread-other");
    expect(deps.emitThreadUpdated).not.toHaveBeenCalled();
    expect(deps.activeThreadIdForHost).toHaveBeenCalledWith(targetHost);
    expect(deps.readState).toHaveBeenCalledWith("thread-active", { markActiveRead: true });
    expect(deps.emitDesktopState).toHaveBeenCalledWith(sampleDesktopState("thread-active"));
  });

  it("marks the active thread unread without marking it read again", async () => {
    const { deps, invoke } = registerMarkUnreadWithFakes({
      activeThreadId: "thread-active",
      unreadThread: sampleThread("thread-active", "/tmp/workspace"),
    });

    await expect(invoke("thread:mark-unread", { threadId: "thread-active" })).resolves.toEqual(sampleDesktopState("thread-active"));

    expect(deps.readState).toHaveBeenCalledWith("thread-active", { markActiveRead: false });
    expect(deps.emitDesktopState).toHaveBeenCalledWith(sampleDesktopState("thread-active"));
  });

  it("rejects invalid thread mark unread input before calling dependencies", () => {
    const { deps, targetHost, invoke } = registerMarkUnreadWithFakes();

    expect(() => invoke("thread:mark-unread", { threadId: "" })).toThrow();
    expect(() => invoke("thread:mark-unread", { threadId: "thread-1", projectId: "" })).toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(targetHost.store.markThreadUnread).not.toHaveBeenCalled();
  });
});

describe("registerThreadRevealIpc", () => {
  it("registers the thread reveal channel", () => {
    const { handlers } = registerRevealWithFakes();

    expect([...handlers.keys()]).toEqual([...threadRevealIpcChannels]);
  });

  it("opens the thread workspace directory", async () => {
    const thread = sampleThread("thread-1", "/tmp/workspace");
    const { deps, activeHost, targetHost, invoke } = registerRevealWithFakes({ thread });

    await expect(invoke("thread:reveal", { threadId: "thread-1", projectId: "project-1" })).resolves.toBeUndefined();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith({ threadId: "thread-1", projectId: "project-1" }, activeHost);
    expect(targetHost.store.getThread).toHaveBeenCalledWith("thread-1");
    expect(deps.threadWorkingDirectory).toHaveBeenCalledWith(thread);
    expect(deps.openPath).toHaveBeenCalledWith("/tmp/workspace");
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });

  it("opens the active worktree directory", async () => {
    const thread = {
      ...sampleThread("thread-worktree", "/tmp/workspace"),
      gitWorktree: sampleThreadWorktree("thread-worktree", "/tmp/project"),
    };
    const { deps, invoke } = registerRevealWithFakes({ thread });

    await expect(invoke("thread:reveal", { threadId: "thread-worktree" })).resolves.toBeUndefined();

    expect(deps.openPath).toHaveBeenCalledWith("/tmp/project/.ambient-worktree");
  });

  it("shows the directory in its folder when opening reports an error", async () => {
    const { deps, invoke } = registerRevealWithFakes({
      openPathError: "could not open",
    });

    await expect(invoke("thread:reveal", { threadId: "thread-1" })).resolves.toBeUndefined();

    expect(deps.openPath).toHaveBeenCalledWith("/tmp/workspace");
    expect(deps.showItemInFolder).toHaveBeenCalledWith("/tmp/workspace");
  });

  it("rejects invalid thread reveal input before calling dependencies", async () => {
    const { deps, targetHost, invoke } = registerRevealWithFakes();

    await expect(invoke("thread:reveal", { threadId: "" })).rejects.toThrow();
    await expect(invoke("thread:reveal", { threadId: "thread-1", projectId: "" })).rejects.toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(targetHost.store.getThread).not.toHaveBeenCalled();
    expect(deps.openPath).not.toHaveBeenCalled();
  });
});

describe("registerThreadForkIpc", () => {
  it("registers the thread fork channel", () => {
    const { handlers } = registerForkWithFakes();

    expect([...handlers.keys()]).toEqual([...threadForkIpcChannels]);
  });

  it("forks a local thread on the owning active host and returns scoped desktop state", async () => {
    const { deps, activeHost, targetHost, invoke } = registerForkWithFakes();
    const input = { threadId: "thread-1", mode: "local", projectId: "project-1" };

    await expect(invoke("thread:fork", input)).resolves.toEqual(sampleDesktopState("thread-1-fork"));

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith(input, activeHost);
    expect(targetHost.store.getWorkspace).toHaveBeenCalled();
    expect(targetHost.store.forkThread).toHaveBeenCalledWith("thread-1", "/tmp/workspace");
    expect(deps.prepareWorktreeForThread).not.toHaveBeenCalled();
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(targetHost, "thread-1-fork");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(targetHost, "thread-1-fork");
    expect(deps.isActiveProjectRuntimeHost).toHaveBeenCalledWith(targetHost);
    expect(deps.emitThreadUpdated).not.toHaveBeenCalled();
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(targetHost, "thread-1-fork");
    expect(targetHost.activeThreadId).toBe("thread-1-fork");
  });

  it("prepares a worktree when forking in worktree mode", async () => {
    const fork = sampleThread("thread-1-fork", "/tmp/workspace");
    const preparedThread = {
      ...fork,
      gitWorktree: sampleThreadWorktree("thread-1-fork", "/tmp/workspace"),
    };
    const { deps, targetHost, invoke } = registerForkWithFakes({ fork, preparedThread });

    await expect(invoke("thread:fork", { threadId: "thread-1", mode: "worktree" })).resolves.toEqual(sampleDesktopState("thread-1-fork"));

    expect(targetHost.store.forkThread).toHaveBeenCalledWith("thread-1", "/tmp/workspace");
    expect(deps.prepareWorktreeForThread).toHaveBeenCalledWith(fork, targetHost.store);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(targetHost, "thread-1-fork");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(targetHost, "thread-1-fork");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(targetHost, "thread-1-fork");
  });

  it("emits a thread update when the owning host is inactive", async () => {
    const { deps, targetHost, invoke } = registerForkWithFakes({
      targetIsActive: false,
      targetWorkspacePath: "/tmp/other",
    });

    await expect(invoke("thread:fork", { threadId: "thread-inactive", mode: "local" })).resolves.toEqual(sampleDesktopState("thread-inactive-fork"));

    expect(targetHost.store.forkThread).toHaveBeenCalledWith("thread-inactive", "/tmp/other");
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(targetHost, "thread-inactive-fork");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(targetHost, "thread-inactive-fork");
    expect(deps.isActiveProjectRuntimeHost).toHaveBeenCalledWith(targetHost);
    expect(deps.emitThreadUpdated).toHaveBeenCalledWith(sampleThread("thread-inactive-fork", "/tmp/other"));
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(targetHost, "thread-inactive-fork");
  });

  it("rejects invalid thread fork input before calling dependencies", async () => {
    const { deps, targetHost, invoke } = registerForkWithFakes();

    await expect(invoke("thread:fork", { threadId: "", mode: "local" })).rejects.toThrow();
    await expect(invoke("thread:fork", { threadId: "thread-1", projectId: "", mode: "local" })).rejects.toThrow();
    await expect(invoke("thread:fork", { threadId: "thread-1", mode: "remote" })).rejects.toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(targetHost.store.forkThread).not.toHaveBeenCalled();
    expect(deps.prepareWorktreeForThread).not.toHaveBeenCalled();
  });
});

describe("registerThreadOpenMiniWindowIpc", () => {
  it("registers the thread open mini window channel", () => {
    const { handlers } = registerOpenMiniWindowWithFakes();

    expect([...handlers.keys()]).toEqual([...threadOpenMiniWindowIpcChannels]);
  });

  it("opens a mini window for the owning thread host", async () => {
    const thread = sampleThread("thread-1", "/tmp/workspace");
    const messages = [sampleMessage("message-1", "thread-1")];
    const { deps, activeHost, targetHost, invoke } = registerOpenMiniWindowWithFakes({ thread, messages });
    const input = { threadId: "thread-1", projectId: "project-1" };

    await expect(invoke("thread:open-mini-window", input)).resolves.toBeUndefined();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith(input, activeHost);
    expect(targetHost.store.getThread).toHaveBeenCalledWith("thread-1");
    expect(targetHost.store.listMessages).toHaveBeenCalledWith("thread-1");
    expect(deps.threadWorkingDirectory).toHaveBeenCalledWith(thread);
    expect(deps.openThreadMiniWindow).toHaveBeenCalledWith(thread, messages, "/tmp/workspace");
  });

  it("passes the active worktree directory to the mini window opener", async () => {
    const thread = {
      ...sampleThread("thread-worktree", "/tmp/workspace"),
      gitWorktree: sampleThreadWorktree("thread-worktree", "/tmp/project"),
    };
    const messages = [sampleMessage("message-worktree", "thread-worktree")];
    const { deps, invoke } = registerOpenMiniWindowWithFakes({ thread, messages });

    await expect(invoke("thread:open-mini-window", { threadId: "thread-worktree" })).resolves.toBeUndefined();

    expect(deps.openThreadMiniWindow).toHaveBeenCalledWith(thread, messages, "/tmp/project/.ambient-worktree");
  });

  it("rejects invalid thread mini window input before calling dependencies", async () => {
    const { deps, targetHost, invoke } = registerOpenMiniWindowWithFakes();

    await expect(invoke("thread:open-mini-window", { threadId: "" })).rejects.toThrow();
    await expect(invoke("thread:open-mini-window", { threadId: "thread-1", projectId: "" })).rejects.toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(targetHost.store.getThread).not.toHaveBeenCalled();
    expect(targetHost.store.listMessages).not.toHaveBeenCalled();
    expect(deps.openThreadMiniWindow).not.toHaveBeenCalled();
  });
});

describe("registerThreadExportChatIpc", () => {
  it("registers the thread export chat channel", () => {
    const { handlers } = registerExportChatWithFakes();

    expect([...handlers.keys()]).toEqual([...threadExportChatIpcChannels]);
  });

  it("parses export chat input before exporting", async () => {
    const { deps, invoke, result } = registerExportChatWithFakes();

    await expect(
      invoke("thread:export-chat", {
        threadId: "thread-1",
        extra: "ignored",
      }),
    ).resolves.toEqual(result);

    expect(deps.exportChat).toHaveBeenCalledWith({ threadId: "thread-1" });
  });

  it("rejects invalid export chat input before calling the dependency", () => {
    const { deps, invoke } = registerExportChatWithFakes();

    expect(() => invoke("thread:export-chat", { threadId: "" })).toThrow();

    expect(deps.exportChat).not.toHaveBeenCalled();
  });

  it("propagates export chat errors", async () => {
    const error = new Error("chat export failed");
    const { deps, invoke } = registerExportChatWithFakes({ error });

    await expect(invoke("thread:export-chat", { threadId: "thread-1" })).rejects.toThrow("chat export failed");

    expect(deps.exportChat).toHaveBeenCalledWith({ threadId: "thread-1" });
  });
});

describe("registerThreadExportChatPdfIpc", () => {
  it("registers the thread export chat PDF channel", () => {
    const { handlers } = registerExportChatPdfWithFakes();

    expect([...handlers.keys()]).toEqual([...threadExportChatPdfIpcChannels]);
  });

  it("parses export chat PDF input before exporting", async () => {
    const { deps, invoke, result } = registerExportChatPdfWithFakes();

    await expect(
      invoke("thread:export-chat-pdf", {
        threadId: "thread-1",
        projectId: "project-1",
        extra: "ignored",
      }),
    ).resolves.toEqual(result);

    expect(deps.exportChatPdf).toHaveBeenCalledWith({ threadId: "thread-1", projectId: "project-1" });
  });

  it("rejects invalid export chat PDF input before calling the dependency", () => {
    const { deps, invoke } = registerExportChatPdfWithFakes();

    expect(() => invoke("thread:export-chat-pdf", { threadId: "" })).toThrow();

    expect(deps.exportChatPdf).not.toHaveBeenCalled();
  });

  it("propagates export chat PDF errors", async () => {
    const error = new Error("chat PDF export failed");
    const { deps, invoke } = registerExportChatPdfWithFakes({ error });

    await expect(invoke("thread:export-chat-pdf", { threadId: "thread-1" })).rejects.toThrow("chat PDF export failed");

    expect(deps.exportChatPdf).toHaveBeenCalledWith({ threadId: "thread-1" });
  });
});

describe("registerThreadUpdateSettingsIpc", () => {
  it("registers the thread update settings channel", () => {
    const { handlers } = registerUpdateSettingsWithFakes();

    expect([...handlers.keys()]).toEqual([...threadUpdateSettingsIpcChannels]);
  });

  it("parses settings input, resolves the owning host, and returns the updated thread", async () => {
    const parsedInput = {
      threadId: "thread-1",
      collaborationMode: "planner",
      model: "ambient-test-model",
      thinkingLevel: "high",
      memoryEnabled: true,
    } satisfies UpdateThreadSettingsInput;
    const updatedThread = sampleThread("thread-1", "/tmp/workspace");
    const rawInput = { ...parsedInput, ignoredByParser: true };
    const { deps, host, invoke } = registerUpdateSettingsWithFakes({ parsedInput, updatedThread });

    await expect(invoke("thread:update-settings", rawInput)).resolves.toEqual(updatedThread);

    expect(deps.parseThreadSettingsUpdate).toHaveBeenCalledWith(rawInput);
    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(host.store.updateThreadSettings).toHaveBeenCalledWith("thread-1", parsedInput);
    expect(host.runtime.applyThreadModelSettings).toHaveBeenCalledWith("thread-1");
    expect(host.runtime.applyThreadMemorySettings).toHaveBeenCalledWith("thread-1");
  });

  it("rejects invalid thread settings input before calling dependencies", async () => {
    const { deps, host, invoke } = registerUpdateSettingsWithFakes({
      parseError: new Error("Invalid thread settings"),
    });

    await expect(invoke("thread:update-settings", { threadId: "" })).rejects.toThrow("Invalid thread settings");
    expect(deps.requireProjectRuntimeHostForThread).not.toHaveBeenCalled();
    expect(host.store.updateThreadSettings).not.toHaveBeenCalled();
  });
});

describe("registerThreadPermissionModeChangeIpc", () => {
  it("registers the thread permission mode change channel", () => {
    const { handlers } = registerPermissionModeChangeWithFakes();

    expect([...handlers.keys()]).toEqual([...threadPermissionModeChangeIpcChannels]);
  });

  it("returns the current thread without audit side effects when the permission mode is unchanged", async () => {
    const currentThread = sampleThread("thread-1", "/tmp/workspace", { permissionMode: "workspace" });
    const parsedInput = {
      threadId: "thread-1",
      permissionMode: "workspace",
      reason: "Already scoped.",
    } satisfies RequestThreadPermissionModeChangeInput;
    const rawInput = { ...parsedInput, extra: true };
    const { deps, host, invoke } = registerPermissionModeChangeWithFakes({ currentThread, parsedInput });

    await expect(invoke("thread:request-permission-mode-change", rawInput)).resolves.toEqual(currentThread);

    expect(deps.parseThreadPermissionModeChange).toHaveBeenCalledWith(rawInput);
    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(host.store.getThread).toHaveBeenCalledWith("thread-1");
    expect(host.store.updateThreadSettings).not.toHaveBeenCalled();
    expect(deps.permissionModeChangeAuditDetail).not.toHaveBeenCalled();
    expect(host.store.addPermissionAudit).not.toHaveBeenCalled();
    expect(deps.emitPermissionAuditCreated).not.toHaveBeenCalled();
  });

  it("updates the permission mode, records an audit entry, emits it, and returns the updated thread", async () => {
    const currentThread = sampleThread("thread-1", "/tmp/workspace", { permissionMode: "workspace" });
    const updatedThread = sampleThread("thread-1", "/tmp/workspace", { permissionMode: "full-access" });
    const parsedInput = {
      threadId: "thread-1",
      permissionMode: "full-access",
      reason: "Debugging a local integration.",
    } satisfies RequestThreadPermissionModeChangeInput;
    const auditEntry = samplePermissionAudit("audit-1", parsedInput);
    const { deps, host, invoke } = registerPermissionModeChangeWithFakes({
      auditEntry,
      currentThread,
      parsedInput,
      updatedThread,
    });

    await expect(invoke("thread:request-permission-mode-change", parsedInput)).resolves.toEqual(updatedThread);

    expect(host.store.updateThreadSettings).toHaveBeenCalledWith("thread-1", { permissionMode: "full-access" });
    expect(deps.permissionModeChangeAuditDetail).toHaveBeenCalledWith({
      previousPermissionMode: "workspace",
      nextPermissionMode: "full-access",
      reason: "Debugging a local integration.",
    });
    expect(host.store.addPermissionAudit).toHaveBeenCalledWith({
      threadId: "thread-1",
      permissionMode: "full-access",
      toolName: "thread-permission-mode",
      risk: "permission-mode-change",
      decision: "allowed",
      detail: "workspace -> full-access; reason: Debugging a local integration.",
      reason: "Debugging a local integration.",
      decisionSource: "policy",
    });
    expect(deps.emitPermissionAuditCreated).toHaveBeenCalledWith(auditEntry, "/tmp/workspace");
  });

  it("uses the default audit reason when no reason is provided", async () => {
    const parsedInput = {
      threadId: "thread-1",
      permissionMode: "full-access",
    } satisfies RequestThreadPermissionModeChangeInput;
    const { host, invoke } = registerPermissionModeChangeWithFakes({ parsedInput });

    await expect(invoke("thread:request-permission-mode-change", parsedInput)).resolves.toEqual(
      sampleThread("thread-1", "/tmp/workspace", { permissionMode: "full-access" }),
    );

    expect(host.store.addPermissionAudit).toHaveBeenCalledWith(expect.objectContaining({
      reason: "User changed thread permission mode through dedicated settings control.",
      detail: "workspace -> full-access",
    }));
  });

  it("rejects invalid permission mode input before calling dependencies", () => {
    const { deps, host, invoke } = registerPermissionModeChangeWithFakes({
      parseError: new Error("Invalid permission mode"),
    });

    expect(() => invoke("thread:request-permission-mode-change", { threadId: "" })).toThrow("Invalid permission mode");
    expect(deps.requireProjectRuntimeHostForThread).not.toHaveBeenCalled();
    expect(host.store.getThread).not.toHaveBeenCalled();
    expect(host.store.updateThreadSettings).not.toHaveBeenCalled();
    expect(host.store.addPermissionAudit).not.toHaveBeenCalled();
  });
});

describe("registerThreadGoalIpc", () => {
  it("registers the thread goal channels", () => {
    const { handlers } = registerGoalWithFakes();

    expect([...handlers.keys()]).toEqual([...threadGoalIpcChannels]);
  });

  it("gets a thread goal from the owning thread host", async () => {
    const { deps, host, invoke } = registerGoalWithFakes({
      currentGoal: sampleThreadGoal({ status: "active" }),
    });

    await expect(invoke("thread-goal:get", { threadId: "thread-1" })).resolves.toEqual(sampleThreadGoal({ status: "active" }));

    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(host.store.getThreadGoal).toHaveBeenCalledWith("thread-1");
  });

  it("sets a thread goal and emits goal and state updates", async () => {
    const { deps, host, invoke } = registerGoalWithFakes();
    const input = {
      threadId: "thread-1",
      objective: "Ship the goal IPC extraction",
      status: "active",
      tokenBudget: 10_000,
      expectedGoalId: "goal-1",
      statusReason: "Ready",
    };

    await expect(invoke("thread-goal:set", input)).resolves.toEqual(sampleThreadGoal({
      objective: "Ship the goal IPC extraction",
      status: "active",
    }));

    expect(host.store.setThreadGoal).toHaveBeenCalledWith(input);
    expect(deps.emitProjectScopedEvent).toHaveBeenCalledWith(host, {
      type: "thread-goal-updated",
      goal: sampleThreadGoal({ objective: "Ship the goal IPC extraction", status: "active" }),
    });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
    expect(host.runtime.continueGoalIfIdle).not.toHaveBeenCalled();
  });

  it("continues a resumed goal when it transitions back to active", async () => {
    const { host, invoke } = registerGoalWithFakes({
      currentGoal: sampleThreadGoal({ status: "paused" }),
      nextGoal: sampleThreadGoal({ status: "active" }),
    });

    await expect(invoke("thread-goal:set", { threadId: "thread-1", status: "active" })).resolves.toEqual(sampleThreadGoal({ status: "active" }));

    expect(host.runtime.continueGoalIfIdle).toHaveBeenCalledWith("thread-1", "goal-1");
  });

  it("clears a thread goal and emits the cleared goal id", async () => {
    const { deps, host, invoke } = registerGoalWithFakes({
      currentGoal: sampleThreadGoal({ status: "active" }),
    });

    await expect(invoke("thread-goal:clear", { threadId: "thread-1", expectedGoalId: "goal-1" })).resolves.toBeUndefined();

    expect(host.store.clearThreadGoal).toHaveBeenCalledWith("thread-1", "goal-1");
    expect(deps.emitProjectScopedEvent).toHaveBeenCalledWith(host, {
      type: "thread-goal-cleared",
      threadId: "thread-1",
      goalId: "goal-1",
    });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
  });

  it("rejects invalid thread goal input before calling dependencies", () => {
    const { deps, host, invoke } = registerGoalWithFakes();

    expect(() => invoke("thread-goal:get", { threadId: "" })).toThrow();
    expect(() => invoke("thread-goal:set", { threadId: "thread-1", status: "unknown" })).toThrow();
    expect(() => invoke("thread-goal:clear", { threadId: "", expectedGoalId: "goal-1" })).toThrow();
    expect(deps.requireProjectRuntimeHostForThread).not.toHaveBeenCalled();
    expect(host.store.setThreadGoal).not.toHaveBeenCalled();
    expect(host.store.clearThreadGoal).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  workspacePath = "/tmp/workspace",
  reusableThread,
}: {
  workspacePath?: string;
  reusableThread?: FakeThread;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host = createFakeHost(workspacePath, reusableThread);
  const deps: RegisterThreadCreateIpcDependencies<FakeThread, FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    prepareWorktreeForThread: vi.fn(async (thread: FakeThread) => ({
      ...thread,
      gitWorktree: sampleThreadWorktree(thread.id, thread.workspacePath),
    })),
    setProjectHostActiveThreadId: vi.fn((targetHost: FakeHost, threadId: string) => {
      targetHost.activeThreadId = threadId;
    }),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn((_targetHost: FakeHost, threadId: string) => sampleDesktopState(threadId)),
  };
  registerThreadCreateIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerUpdateWithFakes({
  workspacePath = "/tmp/workspace",
  currentThread = sampleThread("thread-1", workspacePath, { title: "Thread 1" }),
  targetIsActive = true,
}: {
  workspacePath?: string;
  currentThread?: FakeThread;
  targetIsActive?: boolean;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const activeHost = createFakeHost(workspacePath, undefined);
  const targetHost = targetIsActive ? activeHost : createFakeHost(currentThread.workspacePath, undefined);
  targetHost.store.getThread.mockReturnValue(currentThread);
  targetHost.store.updateThreadTitle.mockImplementation((threadId: string, title: string) => ({
    ...currentThread,
    id: threadId,
    title,
  }));
  targetHost.store.setThreadPinned.mockImplementation((threadId: string, pinned: boolean) => ({
    ...currentThread,
    id: threadId,
    pinned,
  }));
  const deps: RegisterThreadUpdateIpcDependencies<FakeThread, FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => activeHost),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => targetHost),
    emitProjectStateIfActive: vi.fn(),
    isActiveProjectRuntimeHost: vi.fn((host: FakeHost) => host === activeHost),
    emitThreadUpdated: vi.fn(),
    readStateForProjectHostAction: vi.fn((host: FakeHost) => sampleDesktopState(host.store.getThread(currentThread.id).id)),
  };
  registerThreadUpdateIpc(deps);

  return {
    activeHost,
    deps,
    handlers,
    targetHost,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerArchiveWithFakes({
  workspacePath = "/tmp/workspace",
  activeThreadId = "thread-1",
  initialThreadId = "thread-initial",
  targetIsActive = true,
}: {
  workspacePath?: string;
  activeThreadId?: string;
  initialThreadId?: string;
  targetIsActive?: boolean;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const activeHost = createFakeHost(workspacePath, undefined, { activeThreadId });
  const targetHost = targetIsActive ? activeHost : createFakeHost(workspacePath, undefined, { activeThreadId });
  const deps: RegisterThreadArchiveIpcDependencies<FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => activeHost),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => targetHost),
    initialActiveThreadIdForStore: vi.fn(() => initialThreadId),
    setProjectHostActiveThreadId: vi.fn((host: FakeHost, threadId: string) => {
      host.activeThreadId = threadId;
    }),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn((host: FakeHost) => sampleDesktopState(host.activeThreadId ?? activeThreadId)),
  };
  registerThreadArchiveIpc(deps);

  return {
    activeHost,
    deps,
    handlers,
    targetHost,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerMarkUnreadWithFakes({
  workspacePath = "/tmp/workspace",
  activeThreadId = "thread-active",
  unreadThread = sampleThread("thread-unread", workspacePath),
  targetIsActive = true,
}: {
  workspacePath?: string;
  activeThreadId?: string;
  unreadThread?: FakeThread;
  targetIsActive?: boolean;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const activeHost = createFakeHost(workspacePath, undefined, { activeThreadId });
  const targetHost = targetIsActive ? activeHost : createFakeHost(unreadThread.workspacePath, undefined, { activeThreadId });
  targetHost.store.markThreadUnread.mockReturnValue(unreadThread);
  const deps: RegisterThreadMarkUnreadIpcDependencies<FakeThread, FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => activeHost),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => targetHost),
    isActiveProjectRuntimeHost: vi.fn((host: FakeHost) => host === activeHost),
    emitThreadUpdated: vi.fn(),
    activeThreadIdForHost: vi.fn((host: FakeHost) => host.activeThreadId),
    readState: vi.fn((threadId?: string) => sampleDesktopState(threadId ?? "global-active")),
    emitDesktopState: vi.fn(),
  };
  registerThreadMarkUnreadIpc(deps);

  return {
    activeHost,
    deps,
    handlers,
    targetHost,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRevealWithFakes({
  workspacePath = "/tmp/workspace",
  thread = sampleThread("thread-1", workspacePath),
  openPathError = "",
}: {
  workspacePath?: string;
  thread?: FakeThread;
  openPathError?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const activeHost = createFakeHost(workspacePath, undefined);
  const targetHost = createFakeHost(thread.workspacePath, undefined);
  targetHost.store.getThread.mockReturnValue(thread);
  const deps: RegisterThreadRevealIpcDependencies<FakeThread, FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => activeHost),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => targetHost),
    threadWorkingDirectory: vi.fn((targetThread: FakeThread) => (
      targetThread.gitWorktree?.status === "active" ? targetThread.gitWorktree.worktreePath : targetThread.workspacePath
    )),
    openPath: vi.fn(async () => openPathError),
    showItemInFolder: vi.fn(),
  };
  registerThreadRevealIpc(deps);

  return {
    activeHost,
    deps,
    handlers,
    targetHost,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerForkWithFakes({
  workspacePath = "/tmp/workspace",
  targetWorkspacePath = workspacePath,
  targetIsActive = true,
  fork,
  preparedThread,
}: {
  workspacePath?: string;
  targetWorkspacePath?: string;
  targetIsActive?: boolean;
  fork?: FakeThread;
  preparedThread?: FakeThread;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const activeHost = createFakeHost(workspacePath, undefined);
  const targetHost = targetIsActive ? activeHost : createFakeHost(targetWorkspacePath, undefined);
  if (fork) targetHost.store.forkThread.mockReturnValue(fork);
  const deps: RegisterThreadForkIpcDependencies<FakeThread, FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => activeHost),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => targetHost),
    prepareWorktreeForThread: vi.fn(async (thread: FakeThread) => preparedThread ?? {
      ...thread,
      gitWorktree: sampleThreadWorktree(thread.id, thread.workspacePath),
    }),
    setProjectHostActiveThreadId: vi.fn((host: FakeHost, threadId: string) => {
      host.activeThreadId = threadId;
    }),
    emitProjectStateIfActive: vi.fn(),
    isActiveProjectRuntimeHost: vi.fn((host: FakeHost) => host === activeHost),
    emitThreadUpdated: vi.fn(),
    readStateForProjectHostAction: vi.fn((_targetHost: FakeHost, threadId: string) => sampleDesktopState(threadId)),
  };
  registerThreadForkIpc(deps);

  return {
    activeHost,
    deps,
    handlers,
    targetHost,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerOpenMiniWindowWithFakes({
  workspacePath = "/tmp/workspace",
  thread = sampleThread("thread-1", workspacePath),
  messages = [sampleMessage("message-1", thread.id)],
}: {
  workspacePath?: string;
  thread?: FakeThread;
  messages?: FakeMessage[];
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const activeHost = createFakeHost(workspacePath, undefined);
  const targetHost = createFakeHost(thread.workspacePath, undefined);
  targetHost.store.getThread.mockReturnValue(thread);
  targetHost.store.listMessages.mockReturnValue(messages);
  const deps: RegisterThreadOpenMiniWindowIpcDependencies<FakeThread, FakeMessage, FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => activeHost),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => targetHost),
    threadWorkingDirectory: vi.fn((targetThread: FakeThread) => (
      targetThread.gitWorktree?.status === "active" ? targetThread.gitWorktree.worktreePath : targetThread.workspacePath
    )),
    openThreadMiniWindow: vi.fn(async () => undefined),
  };
  registerThreadOpenMiniWindowIpc(deps);

  return {
    activeHost,
    deps,
    handlers,
    targetHost,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerExportChatWithFakes({
  result = sampleExportChatResult(),
  error,
}: {
  result?: ExportChatResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterThreadExportChatIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    exportChat: vi.fn(async (_input: ExportChatInput) => {
      if (error) throw error;
      return result;
    }),
  };
  registerThreadExportChatIpc(deps);

  return {
    deps,
    handlers,
    result,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerExportChatPdfWithFakes({
  result = sampleExportChatPdfResult(),
  error,
}: {
  result?: ExportChatPdfResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterThreadExportChatPdfIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    exportChatPdf: vi.fn(async (_input: ExportChatPdfInput) => {
      if (error) throw error;
      return result;
    }),
  };
  registerThreadExportChatPdfIpc(deps);

  return {
    deps,
    handlers,
    result,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerUpdateSettingsWithFakes({
  workspacePath = "/tmp/workspace",
  parsedInput = { threadId: "thread-1", collaborationMode: "agent" },
  updatedThread = sampleThread(parsedInput.threadId, workspacePath),
  parseError,
}: {
  workspacePath?: string;
  parsedInput?: UpdateThreadSettingsInput;
  updatedThread?: FakeThread;
  parseError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host = createFakeHost(workspacePath, undefined);
  host.store.updateThreadSettings.mockReturnValue(updatedThread);
  const deps: RegisterThreadUpdateSettingsIpcDependencies<FakeThread, FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    parseThreadSettingsUpdate: vi.fn((_raw: unknown) => {
      if (parseError) throw parseError;
      return parsedInput;
    }),
    requireProjectRuntimeHostForThread: vi.fn(() => host),
  };
  registerThreadUpdateSettingsIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerPermissionModeChangeWithFakes({
  workspacePath = "/tmp/workspace",
  parsedInput = { threadId: "thread-1", permissionMode: "full-access" },
  currentThread = sampleThread(parsedInput.threadId, workspacePath, { permissionMode: "workspace" }),
  updatedThread = sampleThread(parsedInput.threadId, workspacePath, { permissionMode: parsedInput.permissionMode }),
  auditEntry = samplePermissionAudit("audit-1", parsedInput),
  parseError,
}: {
  workspacePath?: string;
  parsedInput?: RequestThreadPermissionModeChangeInput;
  currentThread?: FakeThread;
  updatedThread?: FakeThread;
  auditEntry?: PermissionAuditEntry;
  parseError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host = createFakeHost(workspacePath, undefined);
  host.store.getThread.mockReturnValue(currentThread);
  host.store.updateThreadSettings.mockReturnValue(updatedThread);
  host.store.addPermissionAudit.mockReturnValue(auditEntry);
  const deps: RegisterThreadPermissionModeChangeIpcDependencies<FakeThread, FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    parseThreadPermissionModeChange: vi.fn((_raw: unknown) => {
      if (parseError) throw parseError;
      return parsedInput;
    }),
    requireProjectRuntimeHostForThread: vi.fn(() => host),
    permissionModeChangeAuditDetail: vi.fn(({ previousPermissionMode, nextPermissionMode, reason }) => (
      reason ? `${previousPermissionMode} -> ${nextPermissionMode}; reason: ${reason}` : `${previousPermissionMode} -> ${nextPermissionMode}`
    )),
    emitPermissionAuditCreated: vi.fn(),
  };
  registerThreadPermissionModeChangeIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerGoalWithFakes({
  workspacePath = "/tmp/workspace",
  currentGoal,
  nextGoal,
}: {
  workspacePath?: string;
  currentGoal?: ThreadGoal;
  nextGoal?: ThreadGoal;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host = createFakeHost(workspacePath, undefined, { currentGoal, nextGoal });
  const deps: RegisterThreadGoalIpcDependencies<FakeStore, FakeRuntime, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForThread: vi.fn(() => host),
    emitProjectScopedEvent: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
  };
  registerThreadGoalIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerSelectWithFakes({
  workspacePath = "/tmp/workspace",
}: {
  workspacePath?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host = createFakeHost(workspacePath, undefined);
  const deps: RegisterThreadSelectIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForThread: vi.fn(() => host),
    setProjectHostActiveThreadId: vi.fn((targetHost: FakeHost, threadId: string) => {
      targetHost.activeThreadId = threadId;
    }),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn((_targetHost: FakeHost, threadId: string) => sampleDesktopState(threadId)),
  };
  registerThreadSelectIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function createFakeHost(
  workspacePath: string,
  reusableThread: FakeThread | undefined,
  options: { currentGoal?: ThreadGoal; nextGoal?: ThreadGoal; activeThreadId?: string } = {},
): FakeHost {
  let createdThreadCount = 0;
  const store: FakeStore = {
    getWorkspace: vi.fn(() => ({ path: workspacePath })),
    findReusableEmptyThread: vi.fn(() => reusableThread),
    createThread: vi.fn((_title?: string, threadWorkspacePath = workspacePath) => {
      createdThreadCount += 1;
      return sampleThread(`created-${createdThreadCount}`, threadWorkspacePath);
    }),
    forkThread: vi.fn((threadId: string, threadWorkspacePath: string) => sampleThread(`${threadId}-fork`, threadWorkspacePath)),
    archiveThread: vi.fn(),
    markThreadUnread: vi.fn((threadId: string) => sampleThread(threadId, workspacePath)),
    getThread: vi.fn((threadId: string) => sampleThread(threadId, workspacePath)),
    listMessages: vi.fn((threadId: string) => [sampleMessage(`${threadId}-message`, threadId)]),
    updateThreadSettings: vi.fn((threadId: string, input: FakeThreadSettingsUpdate) => sampleThread(threadId, workspacePath, {
      ...("permissionMode" in input ? { permissionMode: input.permissionMode } : {}),
    })),
    updateThreadTitle: vi.fn((threadId: string, title: string) => sampleThread(threadId, workspacePath, { title })),
    setThreadPinned: vi.fn((threadId: string, pinned: boolean) => sampleThread(threadId, workspacePath, { pinned })),
    addPermissionAudit: vi.fn((input: ThreadPermissionAuditInput) => samplePermissionAudit("audit-1", input)),
    getThreadGoal: vi.fn(() => options.currentGoal),
    setThreadGoal: vi.fn((input: { threadId: string; objective?: string; status?: ThreadGoal["status"] }) => options.nextGoal ?? sampleThreadGoal({
      threadId: input.threadId,
      objective: input.objective,
      status: input.status,
    })),
    clearThreadGoal: vi.fn(() => options.currentGoal),
  };
  return {
    store,
    runtime: {
      continueGoalIfIdle: vi.fn(),
      applyThreadMemorySettings: vi.fn(),
      applyThreadModelSettings: vi.fn(async () => undefined),
    },
    activeThreadId: options.activeThreadId ?? "thread-1",
  };
}

function sampleThread(
  id: string,
  workspacePath: string,
  overrides: Partial<Pick<FakeThread, "title" | "pinned" | "permissionMode">> = {},
): FakeThread {
  return {
    id,
    workspacePath,
    title: overrides.title ?? id,
    pinned: overrides.pinned,
    permissionMode: overrides.permissionMode ?? "workspace",
  };
}

function sampleMessage(id: string, threadId: string): FakeMessage {
  return {
    id,
    threadId,
    role: "user",
    content: id,
    createdAt: "2026-06-04T00:00:00.000Z",
  };
}

function samplePermissionAudit(id: string, input: Pick<PermissionAuditEntry, "threadId" | "permissionMode"> & Partial<PermissionAuditEntry>): PermissionAuditEntry {
  return {
    id,
    threadId: input.threadId,
    createdAt: "2026-06-04T00:00:00.000Z",
    permissionMode: input.permissionMode,
    toolName: input.toolName ?? "thread-permission-mode",
    risk: input.risk ?? "permission-mode-change",
    decision: input.decision ?? "allowed",
    reason: input.reason ?? "User changed thread permission mode through dedicated settings control.",
    ...(input.detail ? { detail: input.detail } : {}),
    ...(input.decisionSource ? { decisionSource: input.decisionSource } : {}),
  };
}

function sampleThreadWorktree(threadId: string, projectRoot: string): NonNullable<FakeThread["gitWorktree"]> {
  return {
    threadId,
    projectRoot,
    worktreePath: `${projectRoot}/.ambient-worktree`,
    branchName: `ambient/${threadId}`,
    status: "active",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function sampleExportChatResult(): ExportChatResult {
  return {
    path: "/tmp/thread-export.zip",
    bytes: 2048,
    createdAt: "2026-06-04T00:00:00.000Z",
    source: "pi-session",
  };
}

function sampleExportChatPdfResult(): ExportChatPdfResult {
  return {
    path: "/tmp/thread-export.pdf",
    bytes: 4096,
    createdAt: "2026-06-04T00:00:00.000Z",
    source: "visible-chat-pdf",
  };
}

function sampleThreadGoal({
  threadId = "thread-1",
  goalId = "goal-1",
  objective = "Ship the goal IPC extraction",
  status = "active",
}: {
  threadId?: string;
  goalId?: string;
  objective?: string;
  status?: ThreadGoal["status"];
} = {}): ThreadGoal {
  return {
    threadId,
    goalId,
    objective,
    status,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 0,
    noProgressTurns: 0,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function sampleDesktopState(threadId: string): DesktopState {
  return {
    activeThreadId: threadId,
  } as DesktopState;
}
