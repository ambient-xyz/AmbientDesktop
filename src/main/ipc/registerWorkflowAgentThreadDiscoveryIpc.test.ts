import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowAgentDiscoveryResult, WorkflowAgentThreadSummary } from "../../shared/workflowTypes";
import {
  registerWorkflowAgentDiscoveryAnswerIpc,
  registerWorkflowAgentDiscoveryStartIpc,
  registerWorkflowAgentRevisionDiscoveryStartIpc,
  registerWorkflowAgentThreadIpc,
  workflowAgentDiscoveryAnswerIpcChannels,
  workflowAgentDiscoveryStartIpcChannels,
  workflowAgentRevisionDiscoveryStartIpcChannels,
  workflowAgentThreadIpcChannels,
  type RegisterWorkflowAgentDiscoveryAnswerIpcDependencies,
  type RegisterWorkflowAgentDiscoveryStartIpcDependencies,
  type RegisterWorkflowAgentRevisionDiscoveryStartIpcDependencies,
  type RegisterWorkflowAgentThreadIpcDependencies,
} from "./registerWorkflowIpc";
import {
  workflowAgentFolders,
  workflowAgentMessages,
  workflowAgentThread,
  workflowAgentThreadWithoutChat,
  workflowDiscoveryResult,
  type FakeWorkflowAgentDiscoveryAnswerContext,
  type FakeWorkflowAgentDiscoveryAnswerStore,
  type FakeWorkflowAgentDiscoveryStartContext,
  type FakeWorkflowAgentDiscoveryStartStore,
  type FakeWorkflowAgentRevisionDiscoveryStartContext,
  type FakeWorkflowAgentRevisionDiscoveryStartStore,
  type FakeWorkflowAgentThreadHost,
  type FakeWorkflowAgentThreadStore,
  type IpcListener,
} from "./registerWorkflowAgentIpcTestSupport";

describe("registerWorkflowAgentThreadIpc", () => {
  it("registers the workflow-agent thread channels", () => {
    const { handlers } = registerAgentThreadWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentThreadIpcChannels]);
  });

  it("creates workflow-agent folders and returns the global folder list", async () => {
    const { deps, invoke, store } = registerAgentThreadWithFakes();

    await expect(invoke("workflow-agents:create-folder", { name: "Review" })).resolves.toEqual(workflowAgentFolders);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(store.createWorkflowAgentFolder).toHaveBeenCalledWith({ name: "Review" });
    expect(deps.listGlobalWorkflowAgentFolders).toHaveBeenCalledOnce();
  });

  it("moves workflow-agent threads through the owning host", async () => {
    const { deps, invoke, store } = registerAgentThreadWithFakes();

    await expect(invoke("workflow-agents:move-thread", { threadId: "workflow-thread-1", folderId: "folder-2" })).resolves.toEqual(
      workflowAgentFolders,
    );

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.moveWorkflowAgentThread).toHaveBeenCalledWith({ threadId: "workflow-thread-1", folderId: "folder-2" });
    expect(deps.listGlobalWorkflowAgentFolders).toHaveBeenCalledOnce();
  });

  it("creates workflow-agent threads using the project IPC context path", async () => {
    const { deps, invoke, store } = registerAgentThreadWithFakes();

    await expect(
      invoke("workflow-agents:create-thread", {
        title: "Weekly summary",
        initialRequest: "Summarize weekly customer notes.",
        projectPath: "/requested-workspace",
        folderId: "folder-1",
        traceMode: "debug",
        phase: "discovery",
      }),
    ).resolves.toEqual(workflowAgentFolders);

    expect(deps.workflowProjectIpcContext).toHaveBeenCalledWith({
      title: "Weekly summary",
      initialRequest: "Summarize weekly customer notes.",
      projectPath: "/requested-workspace",
      folderId: "folder-1",
      traceMode: "debug",
      phase: "discovery",
    });
    expect(store.createWorkflowAgentThread).toHaveBeenCalledWith({
      title: "Weekly summary",
      initialRequest: "Summarize weekly customer notes.",
      projectPath: "/normalized-workspace",
      folderId: "folder-1",
      traceMode: "debug",
      phase: "discovery",
    });
  });

  it("ensures chat threads through the owning workflow host", async () => {
    const { deps, invoke, store } = registerAgentThreadWithFakes();

    await expect(invoke("workflow-agents:ensure-chat-thread", { workflowThreadId: "workflow-thread-1" })).resolves.toBe(
      workflowAgentThread,
    );

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.ensureWorkflowAgentChatThread).toHaveBeenCalledWith("workflow-thread-1");
  });

  it("lists chat messages only when the workflow has a chat thread", async () => {
    const withChat = registerAgentThreadWithFakes();

    await expect(withChat.invoke("workflow-agents:list-chat-messages", { workflowThreadId: "workflow-thread-1" })).resolves.toEqual(
      workflowAgentMessages,
    );
    expect(withChat.store.getWorkflowAgentThreadSummary).toHaveBeenCalledWith("workflow-thread-1");
    expect(withChat.store.getThread).toHaveBeenCalledWith("chat-thread-1");
    expect(withChat.store.listMessages).toHaveBeenCalledWith("chat-thread-1");

    const withoutChat = registerAgentThreadWithFakes({ threadSummary: workflowAgentThreadWithoutChat });

    await expect(
      withoutChat.invoke("workflow-agents:list-chat-messages", { workflowThreadId: "workflow-thread-no-chat" }),
    ).resolves.toEqual([]);
    expect(withoutChat.store.getThread).not.toHaveBeenCalled();
    expect(withoutChat.store.listMessages).not.toHaveBeenCalled();
  });

  it("rejects invalid thread input before resolving hosts", async () => {
    const { deps, invoke, store } = registerAgentThreadWithFakes();

    await expect(invoke("workflow-agents:move-thread", { threadId: "", folderId: "folder-1" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowThread).not.toHaveBeenCalled();
    expect(store.moveWorkflowAgentThread).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentDiscoveryStartIpc", () => {
  it("registers the workflow-agent discovery start channel", () => {
    const { handlers } = registerAgentDiscoveryStartWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentDiscoveryStartIpcChannels]);
  });

  it("starts discovery with the project IPC context path", async () => {
    const { context, deps, invoke } = registerAgentDiscoveryStartWithFakes();

    await expect(
      invoke("workflow-agents:start-discovery", {
        title: "Weekly summary",
        initialRequest: "Summarize weekly customer notes.",
        projectPath: "/requested-workspace",
        folderId: "folder-1",
        traceMode: "debug",
        ignored: true,
      }),
    ).resolves.toEqual(workflowDiscoveryResult);

    expect(deps.workflowProjectIpcContext).toHaveBeenCalledWith({
      title: "Weekly summary",
      initialRequest: "Summarize weekly customer notes.",
      projectPath: "/requested-workspace",
      folderId: "folder-1",
      traceMode: "debug",
    });
    expect(deps.startWorkflowDiscovery).toHaveBeenCalledWith(context, {
      title: "Weekly summary",
      initialRequest: "Summarize weekly customer notes.",
      projectPath: "/normalized-workspace",
      folderId: "folder-1",
      traceMode: "debug",
    });
  });

  it("rejects invalid start input before resolving the project context", async () => {
    const { deps, invoke } = registerAgentDiscoveryStartWithFakes();

    await expect(invoke("workflow-agents:start-discovery", { initialRequest: "" })).rejects.toThrow();

    expect(deps.workflowProjectIpcContext).not.toHaveBeenCalled();
    expect(deps.startWorkflowDiscovery).not.toHaveBeenCalled();
  });

  it("propagates discovery start failures", async () => {
    const error = new Error("provider unavailable");
    const { deps, invoke } = registerAgentDiscoveryStartWithFakes({ error });

    await expect(invoke("workflow-agents:start-discovery", { initialRequest: "Draft a workflow." })).rejects.toThrow(error);

    expect(deps.startWorkflowDiscovery).toHaveBeenCalledOnce();
  });
});

describe("registerWorkflowAgentRevisionDiscoveryStartIpc", () => {
  it("registers the workflow-agent revision discovery start channel", () => {
    const { handlers } = registerAgentRevisionDiscoveryStartWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentRevisionDiscoveryStartIpcChannels]);
  });

  it("starts revision discovery through the workflow thread context", async () => {
    const { context, deps, invoke } = registerAgentRevisionDiscoveryStartWithFakes();

    await expect(
      invoke("workflow-agents:start-revision-discovery", {
        workflowThreadId: "workflow-thread-1",
        artifactId: "artifact-1",
        requestedChange: "  Make the report more concise.  ",
        ignored: true,
      }),
    ).resolves.toEqual(workflowDiscoveryResult);

    expect(deps.workflowAgentIpcContextForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(deps.startWorkflowRevisionDiscovery).toHaveBeenCalledWith(context, {
      workflowThreadId: "workflow-thread-1",
      artifactId: "artifact-1",
      requestedChange: "Make the report more concise.",
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/normalized-workspace");
  });

  it("rejects invalid revision discovery input before resolving the workflow context", async () => {
    const { deps, invoke } = registerAgentRevisionDiscoveryStartWithFakes();

    await expect(invoke("workflow-agents:start-revision-discovery", { workflowThreadId: "", artifactId: "artifact-1" })).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.startWorkflowRevisionDiscovery).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });

  it("propagates revision discovery start failures without emitting updates", async () => {
    const error = new Error("provider unavailable");
    const { deps, invoke } = registerAgentRevisionDiscoveryStartWithFakes({ error });

    await expect(
      invoke("workflow-agents:start-revision-discovery", {
        workflowThreadId: "workflow-thread-1",
        artifactId: "artifact-1",
      }),
    ).rejects.toThrow(error);

    expect(deps.startWorkflowRevisionDiscovery).toHaveBeenCalledOnce();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentDiscoveryAnswerIpc", () => {
  it("registers the workflow-agent discovery answer channel", () => {
    const { handlers } = registerAgentDiscoveryAnswerWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentDiscoveryAnswerIpcChannels]);
  });

  it("answers discovery questions through the owning question context", async () => {
    const { context, deps, invoke } = registerAgentDiscoveryAnswerWithFakes();

    await expect(
      invoke("workflow-agents:answer-discovery-question", {
        questionId: "question-1",
        choiceId: "choice-1",
        freeform: "Use the compact report path.",
        ignored: true,
      }),
    ).resolves.toEqual(workflowDiscoveryResult);

    expect(deps.workflowAgentIpcContextForDiscoveryQuestion).toHaveBeenCalledWith("question-1");
    expect(deps.answerWorkflowDiscoveryQuestion).toHaveBeenCalledWith(context, {
      questionId: "question-1",
      choiceId: "choice-1",
      freeform: "Use the compact report path.",
    });
  });

  it("rejects invalid answer input before resolving the question context", async () => {
    const { deps, invoke } = registerAgentDiscoveryAnswerWithFakes();

    await expect(invoke("workflow-agents:answer-discovery-question", { questionId: "" })).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForDiscoveryQuestion).not.toHaveBeenCalled();
    expect(deps.answerWorkflowDiscoveryQuestion).not.toHaveBeenCalled();
  });

  it("propagates discovery answer failures", async () => {
    const error = new Error("provider unavailable");
    const { deps, invoke } = registerAgentDiscoveryAnswerWithFakes({ error });

    await expect(invoke("workflow-agents:answer-discovery-question", { questionId: "question-1", choiceId: "choice-1" })).rejects.toThrow(
      error,
    );

    expect(deps.answerWorkflowDiscoveryQuestion).toHaveBeenCalledOnce();
  });
});
function registerAgentThreadWithFakes(options: { threadSummary?: WorkflowAgentThreadSummary } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentThreadStore = {
    createWorkflowAgentFolder: vi.fn(() => workflowAgentFolders),
    moveWorkflowAgentThread: vi.fn(() => workflowAgentFolders),
    createWorkflowAgentThread: vi.fn(() => workflowAgentFolders),
    ensureWorkflowAgentChatThread: vi.fn(() => workflowAgentThread),
    getWorkflowAgentThreadSummary: vi.fn(() => options.threadSummary ?? workflowAgentThread),
    getThread: vi.fn(() => ({ id: "chat-thread-1" })),
    listMessages: vi.fn(() => workflowAgentMessages),
  };
  const host: FakeWorkflowAgentThreadHost = {
    store,
  };
  const deps: RegisterWorkflowAgentThreadIpcDependencies<FakeWorkflowAgentThreadStore, FakeWorkflowAgentThreadHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowThread: vi.fn(() => host),
    workflowProjectIpcContext: vi.fn(() => ({ targetStore: store, projectPath: "/normalized-workspace" })),
    listGlobalWorkflowAgentFolders: vi.fn(() => workflowAgentFolders),
  };
  registerWorkflowAgentThreadIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentDiscoveryStartWithFakes(
  options: {
    error?: Error;
    projectPath?: string;
    result?: WorkflowAgentDiscoveryResult;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentDiscoveryStartStore = {
    marker: "workflow-agent-discovery-start-store",
  };
  const context: FakeWorkflowAgentDiscoveryStartContext = {
    targetStore: store,
    thread: {
      id: "thread-1",
      permissionMode: "workspace",
    },
    projectPath: options.projectPath ?? "/normalized-workspace",
  };
  const deps: RegisterWorkflowAgentDiscoveryStartIpcDependencies<
    FakeWorkflowAgentDiscoveryStartStore,
    FakeWorkflowAgentDiscoveryStartContext
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowProjectIpcContext: vi.fn(() => context),
    startWorkflowDiscovery: vi.fn(() => {
      if (options.error) throw options.error;
      return options.result ?? workflowDiscoveryResult;
    }),
  };
  registerWorkflowAgentDiscoveryStartIpc(deps);

  return {
    context,
    deps,
    handlers,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentRevisionDiscoveryStartWithFakes(
  options: {
    error?: Error;
    projectPath?: string;
    result?: WorkflowAgentDiscoveryResult;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentRevisionDiscoveryStartStore = {
    marker: "workflow-agent-revision-discovery-start-store",
  };
  const context: FakeWorkflowAgentRevisionDiscoveryStartContext = {
    targetStore: store,
    thread: {
      id: "thread-1",
      permissionMode: "workspace",
    },
    workflowThread: {
      chatThreadId: "chat-thread-1",
    },
    projectPath: options.projectPath ?? "/normalized-workspace",
  };
  const deps: RegisterWorkflowAgentRevisionDiscoveryStartIpcDependencies<
    FakeWorkflowAgentRevisionDiscoveryStartStore,
    FakeWorkflowAgentRevisionDiscoveryStartContext
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForWorkflowThread: vi.fn(() => context),
    startWorkflowRevisionDiscovery: vi.fn(() => {
      if (options.error) throw options.error;
      return options.result ?? workflowDiscoveryResult;
    }),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowAgentRevisionDiscoveryStartIpc(deps);

  return {
    context,
    deps,
    handlers,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentDiscoveryAnswerWithFakes(
  options: {
    error?: Error;
    projectPath?: string;
    result?: WorkflowAgentDiscoveryResult;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentDiscoveryAnswerStore = {
    marker: "workflow-agent-discovery-answer-store",
  };
  const context: FakeWorkflowAgentDiscoveryAnswerContext = {
    targetStore: store,
    thread: {
      id: "thread-1",
      permissionMode: "workspace",
    },
    workflowThread: {
      chatThreadId: "chat-thread-1",
    },
    projectPath: options.projectPath ?? "/normalized-workspace",
  };
  const deps: RegisterWorkflowAgentDiscoveryAnswerIpcDependencies<
    FakeWorkflowAgentDiscoveryAnswerStore,
    FakeWorkflowAgentDiscoveryAnswerContext
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForDiscoveryQuestion: vi.fn(() => context),
    answerWorkflowDiscoveryQuestion: vi.fn(() => {
      if (options.error) throw options.error;
      return options.result ?? workflowDiscoveryResult;
    }),
  };
  registerWorkflowAgentDiscoveryAnswerIpc(deps);

  return {
    context,
    deps,
    handlers,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}
