import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  plannerPlanAnswerQuestionIpcChannels,
  plannerPlanGenerateDurableArtifactIpcChannels,
  plannerPlanUpdateIpcChannels,
} from "./registerPlannerPlanIpc";
import {
  projectArchiveChatsIpcChannels,
  projectPermanentWorktreeIpcChannels,
  projectRemoveIpcChannels,
  projectRevealIpcChannels,
} from "./registerProjectIpc";
import {
  projectThreadDomainIpcChannels,
  registerProjectThreadDomainIpc,
} from "./registerProjectThreadDomainIpc";
import {
  threadArchiveIpcChannels,
  threadForkIpcChannels,
  threadMarkUnreadIpcChannels,
  threadMessageReadIpcChannels,
  threadOpenMiniWindowIpcChannels,
  threadPermissionModeChangeIpcChannels,
  threadRevealIpcChannels,
  threadUpdateIpcChannels,
  threadUpdateSettingsIpcChannels,
} from "./registerThreadIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerProjectThreadDomainIpc", () => {
  it("registers project/thread/planner channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...projectThreadDomainIpcChannels]);
    expect([...projectThreadDomainIpcChannels]).toEqual([
      ...projectRemoveIpcChannels,
      ...projectRevealIpcChannels,
      ...projectArchiveChatsIpcChannels,
      ...projectPermanentWorktreeIpcChannels,
      ...threadUpdateIpcChannels,
      ...threadArchiveIpcChannels,
      ...threadMarkUnreadIpcChannels,
      ...threadRevealIpcChannels,
      ...threadForkIpcChannels,
      ...threadOpenMiniWindowIpcChannels,
      ...threadMessageReadIpcChannels,
      ...threadUpdateSettingsIpcChannels,
      ...threadPermissionModeChangeIpcChannels,
      ...plannerPlanUpdateIpcChannels,
      ...plannerPlanGenerateDurableArtifactIpcChannels,
      ...plannerPlanAnswerQuestionIpcChannels,
    ]);
  });

  it("routes project removal through registry and runtime disposal dependencies", () => {
    const { deps, host, invoke, desktopState } = registerWithFakes();

    expect(invoke("project:remove", { projectId: "old-project" })).toBe(desktopState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.resolveRegisteredProjectPathForHost).toHaveBeenCalledWith("old-project", host);
    expect(deps.removeProject).toHaveBeenCalledWith("/workspace/old");
    expect(deps.disposeProjectRuntimeHost).toHaveBeenCalledWith(
      "/workspace/old",
      "Project runtime host disposed because the project was removed.",
    );
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host);
  });

  it("forks a thread into a worktree and selects the prepared fork", async () => {
    const { deps, host, invoke, preparedThread, desktopState } = registerWithFakes();

    await expect(invoke("thread:fork", { threadId: "thread-1", mode: "worktree" })).resolves.toBe(desktopState);

    expect(host.store.forkThread).toHaveBeenCalledWith("thread-1", "/workspace/project");
    expect(deps.prepareWorktreeForThread).toHaveBeenCalledWith(expect.objectContaining({ id: "thread-fork" }), host.store);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, preparedThread.id);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, preparedThread.id);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, preparedThread.id);
  });

  it("records thread permission-mode changes with audit details", () => {
    const { deps, host, invoke, permissionAudit, updatedThread } = registerWithFakes();

    expect(
      invoke("thread:request-permission-mode-change", {
        threadId: "thread-1",
        permissionMode: "full-access",
        reason: "Need broader shell access.",
      }),
    ).toBe(updatedThread);

    expect(deps.parseThreadPermissionModeChange).toHaveBeenCalledWith({
      threadId: "thread-1",
      permissionMode: "full-access",
      reason: "Need broader shell access.",
    });
    expect(host.store.updateThreadSettings).toHaveBeenCalledWith("thread-1", { permissionMode: "full-access" });
    expect(deps.permissionModeChangeAuditDetail).toHaveBeenCalledWith({
      previousPermissionMode: "workspace",
      nextPermissionMode: "full-access",
      reason: "Need broader shell access.",
    });
    expect(deps.emitPermissionAuditCreated).toHaveBeenCalledWith(permissionAudit, "/workspace/project");
  });

  it("routes bounded thread message page and detail reads through the owning project host", () => {
    const { deps, host, invoke, pageMessages } = registerWithFakes();

    expect(invoke("thread:messages-before", { threadId: "thread-1", beforeMessageId: "message-3", limit: 2 })).toEqual({
      threadId: "thread-1",
      beforeMessageId: "message-3",
      order: "ascending",
      limit: 2,
      messages: pageMessages,
      hasMoreBefore: true,
    });
    expect(invoke("thread:message-detail", { threadId: "thread-1", messageId: "message-2" })).toEqual({
      threadId: "thread-1",
      message: pageMessages[1],
    });

    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(host.store.listMessagesBefore).toHaveBeenCalledWith("thread-1", "message-3", 2);
    expect(host.store.getMessage).toHaveBeenCalledWith("message-2");
  });

  it("updates planner artifacts through their owning project host and emits artifact updates", () => {
    const { deps, host, invoke, plannerArtifact } = registerWithFakes();

    expect(
      invoke("planner-plan:update", {
        artifactId: "planner-1",
        status: "implemented",
      }),
    ).toBe(plannerArtifact);

    expect(deps.requireProjectRuntimeHostForPlannerPlanArtifact).toHaveBeenCalledWith("planner-1");
    expect(host.store.updatePlannerPlanArtifact).toHaveBeenCalledWith("planner-1", {
      status: "implemented",
      workflowState: undefined,
    });
    expect(deps.emitPlannerPlanArtifactUpdated).toHaveBeenCalledWith(plannerArtifact, host.store);
  });
});

function registerWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const desktopState = { activeThreadId: "thread-1", projects: [] };
  const thread = {
    id: "thread-1",
    title: "Thread",
    workspacePath: "/workspace/project",
    permissionMode: "workspace",
  };
  const updatedThread = {
    ...thread,
    permissionMode: "full-access",
  };
  const forkedThread = {
    id: "thread-fork",
    workspacePath: "/workspace/project",
  };
  const preparedThread = {
    ...forkedThread,
    id: "thread-fork-worktree",
    gitWorktree: { path: "/workspace/project-worktree" },
  };
  const permissionAudit = { id: "audit-1" };
  const plannerArtifact = { id: "planner-1", threadId: "thread-1", status: "implemented" };
  const pageMessages = [
    { id: "message-1", threadId: "thread-1", role: "user", content: "Older", createdAt: "2026-06-13T00:00:00.000Z" },
    { id: "message-2", threadId: "thread-1", role: "assistant", content: "Detail", createdAt: "2026-06-13T00:01:00.000Z" },
  ];
  const host = {
    activeThreadId: "thread-1",
    workspacePath: "/workspace/project",
    runtime: {
      applyThreadMemorySettings: vi.fn(),
    },
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project" })),
      archiveChats: vi.fn(),
      getThread: vi.fn(() => thread),
      updateThreadTitle: vi.fn(() => thread),
      setThreadPinned: vi.fn(() => thread),
      archiveThread: vi.fn(),
      markThreadUnread: vi.fn(() => thread),
      forkThread: vi.fn(() => forkedThread),
      listMessages: vi.fn(() => []),
      listMessagesBefore: vi.fn(() => ({ messages: pageMessages, hasMoreBefore: true })),
      getMessage: vi.fn((messageId: string) => pageMessages.find((message) => message.id === messageId) ?? pageMessages[0]),
      updateThreadSettings: vi.fn(() => updatedThread),
      addPermissionAudit: vi.fn(() => permissionAudit),
      updatePlannerPlanArtifact: vi.fn(() => plannerArtifact),
      answerPlannerDecisionQuestion: vi.fn(() => plannerArtifact),
    },
  };
  const deps = {
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    activeThreadIdForHost: vi.fn(() => "thread-1"),
    archiveProjectChats: vi.fn(),
    createPermanentWorktree: vi.fn(),
    disposeProjectRuntimeHost: vi.fn(),
    emitDesktopState: vi.fn(),
    emitPermissionAuditCreated: vi.fn(),
    emitPlannerPlanArtifactUpdated: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    emitThreadUpdated: vi.fn(),
    generatePlannerDurableArtifact: vi.fn(async () => plannerArtifact),
    initialActiveThreadIdForStore: vi.fn(() => "thread-1"),
    isActiveProjectRuntimeHost: vi.fn(() => true),
    listRegisteredProjectPaths: vi.fn(() => ["/workspace/project", "/workspace/old"]),
    normalizeWorkspacePath: vi.fn((workspacePath: string) => workspacePath),
    openPath: vi.fn(async () => ""),
    openThreadMiniWindow: vi.fn(),
    parseThreadPermissionModeChange: vi.fn((raw) => raw),
    parseThreadSettingsUpdate: vi.fn((raw) => raw),
    pathExists: vi.fn(() => true),
    permanentWorktreeBranchName: vi.fn(() => "permanent-worktree"),
    permissionModeChangeAuditDetail: vi.fn(() => "Permission changed from workspace to full access."),
    prepareWorktreeForThread: vi.fn(async () => preparedThread),
    projectRuntimeHostForWorkspacePath: vi.fn(() => host),
    readState: vi.fn(() => desktopState),
    readStateForProjectHostAction: vi.fn(() => desktopState),
    removeProject: vi.fn(),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForPlannerPlanArtifact: vi.fn(() => host),
    requireProjectRuntimeHostForThread: vi.fn(() => host),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => host),
    resolveRegisteredProjectPathForHost: vi.fn((projectId: string) =>
      projectId === "old-project" ? "/workspace/old" : "/workspace/project",
    ),
    setProjectHostActiveThreadId: vi.fn(),
    showItemInFolder: vi.fn(),
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    switchWorkspace: vi.fn(() => desktopState),
    threadWorkingDirectory: vi.fn(() => "/workspace/project"),
  };

  registerProjectThreadDomainIpc(deps);

  return {
    deps,
    desktopState,
    handlers,
    host,
    invoke: (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return handler({} as IpcMainInvokeEvent, ...args);
    },
    permissionAudit,
    pageMessages,
    plannerArtifact,
    preparedThread,
    updatedThread,
  };
}
