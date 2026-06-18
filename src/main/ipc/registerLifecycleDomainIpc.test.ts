import type { IpcMain, IpcMainInvokeEvent, OpenDialogOptions } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  DesktopUpdateState,
} from "../../shared/desktopTypes";
import type { ThreadGoal } from "../../shared/threadTypes";
import {
  registerLifecycleDomainIpc,
  lifecycleDomainIpcChannels,
  type RegisterLifecycleDomainIpcDependencies,
} from "./registerLifecycleDomainIpc";
import {
  threadCreateIpcChannels,
  threadGoalIpcChannels,
} from "./registerThreadIpc";
import { updatesIpcChannels } from "./registerUpdatesIpc";
import { workspaceLifecycleIpcChannels } from "./registerWorkspaceIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

interface FakeThread {
  id: string;
  workspacePath: string;
  gitWorktree?: unknown;
}

interface FakeStore {
  getWorkspace: ReturnType<typeof vi.fn<() => { path: string }>>;
  findReusableEmptyThread: ReturnType<typeof vi.fn<() => FakeThread | undefined>>;
  createThread: ReturnType<typeof vi.fn<(title?: string, workspacePath?: string, options?: unknown) => FakeThread>>;
  getThreadGoal: ReturnType<typeof vi.fn<(threadId: string) => ThreadGoal | undefined>>;
  setThreadGoal: ReturnType<typeof vi.fn<(input: { threadId: string; objective?: string; status?: ThreadGoal["status"] }) => ThreadGoal>>;
  clearThreadGoal: ReturnType<typeof vi.fn<(threadId: string, expectedGoalId?: string) => ThreadGoal | undefined>>;
}

interface FakeHost {
  store: FakeStore;
  runtime: {
    continueGoalIfIdle: ReturnType<typeof vi.fn<(threadId: string, goalId: string) => void>>;
  };
  activeThreadId: string;
}

describe("registerLifecycleDomainIpc", () => {
  it("registers lifecycle channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...lifecycleDomainIpcChannels]);
    expect([...lifecycleDomainIpcChannels]).toEqual([
      ...updatesIpcChannels,
      ...workspaceLifecycleIpcChannels,
      ...threadCreateIpcChannels,
      ...threadGoalIpcChannels,
    ]);
  });

  it("routes update and workspace lifecycle actions through existing adapters", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("updates:check", "scheduled")).resolves.toEqual(sampleUpdateState("checking"));
    await expect(invoke("workspace:create")).resolves.toEqual(desktopState);

    expect(deps.desktopUpdateService.checkForUpdates).toHaveBeenCalledWith("scheduled");
    expect(deps.showWorkspaceDialog).toHaveBeenCalledWith({
      title: "Start from scratch",
      buttonLabel: "Create Project",
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
    });
    expect(deps.createWorkspaceDirectory).toHaveBeenCalledWith("/workspace/new");
    expect(deps.switchWorkspace).toHaveBeenCalledWith("/workspace/new");
  });

  it("routes thread creation through the active project host dependencies", async () => {
    const { deps, host, thread, invoke } = registerWithFakes();

    await expect(invoke("thread:create")).resolves.toBe(desktopState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(host.store.findReusableEmptyThread).toHaveBeenCalledOnce();
    expect(host.store.createThread).toHaveBeenCalledWith();
    expect(deps.prepareWorktreeForThread).toHaveBeenCalledWith(thread, host.store);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
  });

  it("routes thread goal updates through the owning thread host dependencies", async () => {
    const currentGoal = sampleThreadGoal({ status: "paused" });
    const nextGoal = sampleThreadGoal({ status: "active" });
    const { deps, host, invoke } = registerWithFakes({ currentGoal, nextGoal });

    await expect(invoke("thread-goal:set", { threadId: "thread-1", status: "active" })).resolves.toEqual(nextGoal);

    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(host.store.getThreadGoal).toHaveBeenCalledWith("thread-1");
    expect(host.store.setThreadGoal).toHaveBeenCalledWith({ threadId: "thread-1", status: "active" });
    expect(deps.emitProjectScopedEvent).toHaveBeenCalledWith(host, {
      type: "thread-goal-updated",
      goal: nextGoal,
    });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
    expect(host.runtime.continueGoalIfIdle).toHaveBeenCalledWith("thread-1", "goal-1");
  });
});

function registerWithFakes({
  currentGoal,
  nextGoal,
}: {
  currentGoal?: ThreadGoal;
  nextGoal?: ThreadGoal;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const thread = sampleThread("thread-1", "/workspace");
  const preparedThread = {
    ...thread,
    gitWorktree: { worktreePath: "/workspace/.ambient-worktree/thread-1" },
  };
  const host = createFakeHost({ currentGoal, nextGoal, thread });
  const deps: RegisterLifecycleDomainIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    desktopUpdateService: {
      getState: vi.fn(() => sampleUpdateState("idle")),
      checkForUpdates: vi.fn(async () => sampleUpdateState("checking")),
      downloadUpdate: vi.fn(async () => sampleUpdateState("downloading")),
      installUpdateAndRestart: vi.fn(() => sampleUpdateState("installing")),
      dismissUpdateNotification: vi.fn(() => sampleUpdateState("idle")),
    },
    showWorkspaceDialog: vi.fn(async (_options: OpenDialogOptions) => ({
      canceled: false,
      filePaths: ["/workspace/new"],
    })),
    createWorkspaceDirectory: vi.fn(),
    switchWorkspace: vi.fn(async () => desktopState),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    prepareWorktreeForThread: vi.fn(async () => preparedThread),
    setProjectHostActiveThreadId: vi.fn((targetHost: FakeHost, threadId: string) => {
      targetHost.activeThreadId = threadId;
    }),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => desktopState),
    requireProjectRuntimeHostForThread: vi.fn(() => host),
    emitProjectScopedEvent: vi.fn(),
  };
  registerLifecycleDomainIpc(deps);

  return {
    deps,
    handlers,
    host,
    thread,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function createFakeHost({
  currentGoal,
  nextGoal,
  thread,
}: {
  currentGoal?: ThreadGoal;
  nextGoal?: ThreadGoal;
  thread: FakeThread;
}): FakeHost {
  const store: FakeStore = {
    getWorkspace: vi.fn(() => ({ path: "/workspace" })),
    findReusableEmptyThread: vi.fn(() => undefined),
    createThread: vi.fn(() => thread),
    getThreadGoal: vi.fn(() => currentGoal),
    setThreadGoal: vi.fn((input) => nextGoal ?? sampleThreadGoal(input)),
    clearThreadGoal: vi.fn(() => currentGoal),
  };
  return {
    store,
    runtime: {
      continueGoalIfIdle: vi.fn(),
    },
    activeThreadId: "thread-0",
  };
}

function sampleThread(id: string, workspacePath: string): FakeThread {
  return {
    id,
    workspacePath,
  };
}

function sampleThreadGoal({
  threadId = "thread-1",
  goalId = "goal-1",
  objective = "Ship the lifecycle IPC extraction",
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
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
  };
}

function sampleUpdateState(status: DesktopUpdateState["status"]): DesktopUpdateState {
  return {
    enabled: true,
    status,
    currentVersion: "0.1.52",
    channel: "latest",
    canCheck: status !== "checking",
    canDownload: status === "available",
    canInstall: status === "downloaded",
  };
}

const desktopState = {
  activeThreadId: "thread-1",
} as DesktopState;
