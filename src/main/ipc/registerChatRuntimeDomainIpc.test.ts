import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  contextCompactIpcChannels,
  contextRecoverIpcChannels,
  contextUsageIpcChannels,
} from "./registerContextIpc";
import {
  chatRuntimeDomainIpcChannels,
  registerChatRuntimeDomainIpc,
  type ChatRuntimeAgentRuntime,
  type ChatRuntimeDomainHost,
  type ChatRuntimeStore,
} from "./registerChatRuntimeDomainIpc";
import { messageSendIpcChannels } from "./registerMessageIpc";
import { runAbortIpcChannels } from "./registerRunIpc";
import type { SendMessageInput } from "../../shared/desktopTypes";
import type { SlashCommandSelection } from "../../shared/slashCommandTypes";
import type {
  ChatMessage,
  ContextUsageSnapshot,
  ThreadGoal,
  ThreadSummary,
} from "../../shared/threadTypes";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerChatRuntimeDomainIpc", () => {
  it("registers chat runtime channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...chatRuntimeDomainIpcChannels]);
    expect([...chatRuntimeDomainIpcChannels]).toEqual([
      ...messageSendIpcChannels,
      ...runAbortIpcChannels,
      ...contextUsageIpcChannels,
      ...contextCompactIpcChannels,
      ...contextRecoverIpcChannels,
    ]);
  });

  it("prepares worktrees, hydrates context, checkpoints, sends, and marks active threads read", async () => {
    const { deps, host, invoke, preparedThread, rawInput, resolvedContext, thread } = registerWithFakes();

    await expect(invoke("message:send", rawInput)).resolves.toBeUndefined();

    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(host.store.getThread).toHaveBeenCalledWith("thread-1");
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.prepareWorktreeForThread).toHaveBeenCalledWith(thread, host.store);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.describeWorkspaceContextReferences).toHaveBeenCalledWith(
      "/workspace",
      [{ path: "src/main/index.ts", absolute: false }],
      { allowExternal: true },
    );
    expect(deps.createAndRecordCheckpoint).toHaveBeenCalledWith(
      "pre-run",
      "Before Ambient run.",
      preparedThread,
      host.store,
    );
    expect(host.runtime.send).toHaveBeenCalledWith({
      ...sampleSendInput(),
      permissionMode: "full-access",
      context: resolvedContext,
    });
    expect(host.store.markThreadRead).toHaveBeenCalledWith("thread-1");
    expect(deps.emitThreadUpdated).toHaveBeenCalledWith(host.readThread);
  });

  it("allows thread-visible external directory context during send revalidation", async () => {
    const externalContext = [{ path: "/tmp/shared-link", absolute: true }];
    const canonicalExternalContext = [{ path: "/tmp/shared", absolute: true }];
    const { deps, host, invoke, resolvedContext } = registerWithFakes({
      resolveCanonicalLocalFilePath: (path) => path.replace("/tmp/shared-link", "/tmp/shared"),
      localPathInsideActiveWorkspace: (path) => path.startsWith("/workspace/"),
      localPathVisibleToThread: (path) => path === "/tmp/shared",
    });
    const input = {
      ...sampleSendInput(),
      permissionMode: "workspace",
      context: externalContext,
    };

    await expect(invoke("message:send", input)).resolves.toBeUndefined();

    expect(deps.describeWorkspaceContextReferences).toHaveBeenCalledWith("/workspace", canonicalExternalContext, { allowExternal: true });
    expect(host.runtime.send).toHaveBeenCalledWith({ ...input, context: resolvedContext });
  });

  it("does not let one thread-visible external context path approve an unapproved send-time sibling", async () => {
    const externalContext = [
      { path: "/tmp/shared", absolute: true },
      { path: "/tmp/private", absolute: true },
    ];
    const { deps, invoke } = registerWithFakes({
      localPathInsideActiveWorkspace: (path) => path.startsWith("/workspace/"),
      localPathVisibleToThread: (path) => path === "/tmp/shared",
    });
    const input = {
      ...sampleSendInput(),
      permissionMode: "workspace",
      context: externalContext,
    };

    await expect(invoke("message:send", input)).resolves.toBeUndefined();

    expect(deps.describeWorkspaceContextReferences).toHaveBeenCalledWith("/workspace", externalContext, { allowExternal: false });
  });

  it("preserves active-thread state for retries and resumes existing goals", async () => {
    const currentGoal = sampleThreadGoal({ goalId: "goal-existing", tokenBudget: 2000 });
    const { deps, host, invoke } = registerWithFakes({
      currentGoal,
      thread: sampleThread({ gitWorktree: sampleThreadWorktree() }),
    });
    const input = {
      ...sampleSendInput(),
      delivery: "steer",
      preserveActiveThread: true,
      retryOfMessageId: "message-1",
      goalMode: { enabled: true },
    } satisfies SendMessageInput;

    await expect(invoke("message:send", input)).resolves.toBeUndefined();

    expect(deps.setProjectHostActiveThreadId).not.toHaveBeenCalled();
    expect(deps.prepareWorktreeForThread).not.toHaveBeenCalled();
    expect(host.store.deleteMessagesAfter).toHaveBeenCalledWith("thread-1", "message-1");
    expect(host.store.setThreadGoal).toHaveBeenCalledWith({
      threadId: "thread-1",
      status: "active",
      expectedGoalId: "goal-existing",
      tokenBudget: 2000,
      statusReason: null,
    });
    expect(deps.emitProjectScopedEvent).toHaveBeenCalledWith(host, {
      type: "thread-goal-updated",
      goal: host.nextGoal,
    });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-active");
    expect(deps.createAndRecordCheckpoint).not.toHaveBeenCalled();
    expect(host.runtime.send).toHaveBeenCalledWith({ ...input, context: undefined });
    expect(host.store.markThreadRead).not.toHaveBeenCalled();
  });

  it("preserves transcript state when retries target hidden internal anchors", async () => {
    const hiddenAnchor = sampleChatMessage({
      id: "hidden-anchor",
      content: "Continue the active goal after the provider interruption.",
      metadata: {
        runtime: "ambient-internal",
        kind: "hidden-user-message",
        hiddenFromTranscript: true,
        hiddenUserMessage: true,
      },
    });
    const { deps, host, invoke } = registerWithFakes({
      messages: [
        hiddenAnchor,
        sampleChatMessage({ id: "assistant-after-anchor", role: "assistant", content: "Recovered state." }),
      ],
      thread: sampleThread({ gitWorktree: sampleThreadWorktree() }),
    });
    const input = {
      ...sampleSendInput(),
      delivery: "prompt",
      preserveActiveThread: true,
      retryOfMessageId: hiddenAnchor.id,
    } satisfies SendMessageInput;

    await expect(invoke("message:send", input)).resolves.toBeUndefined();

    expect(host.store.listMessages).toHaveBeenCalledWith("thread-1");
    expect(host.store.deleteMessagesAfter).not.toHaveBeenCalled();
    expect(deps.emitProjectStateIfActive).not.toHaveBeenCalled();
    expect(host.runtime.send).toHaveBeenCalledWith({ ...input, context: undefined });
  });

  it("captures E2E message sends without dispatching to the runtime", async () => {
    const { deps, host, invoke, rawInput } = registerWithFakes({
      env: { AMBIENT_E2E_CAPTURE_MESSAGES: "1" },
    });

    await expect(invoke("message:send", rawInput)).resolves.toBeUndefined();

    expect(deps.createAndRecordCheckpoint).toHaveBeenCalledOnce();
    expect(deps.emitDesktopEvent).toHaveBeenCalledWith({
      type: "e2e-message-captured",
      input: rawInput,
    });
    expect(host.runtime.send).not.toHaveBeenCalled();
    expect(host.store.markThreadRead).not.toHaveBeenCalled();
  });

  it("validates slash command composer intents before mutating send state", async () => {
    const selection = sampleSlashCommandSelection();
    const validateSlashCommandSelection = vi.fn(async () => {
      throw new Error("Selected slash command changed. Select it again before sending.");
    });
    const { deps, host, invoke } = registerWithFakes({ validateSlashCommandSelection });

    await expect(invoke("message:send", {
      ...sampleSendInput(),
      composerIntent: { kind: "slash-command", selection },
    })).rejects.toThrow("Selected slash command changed. Select it again before sending.");

    expect(validateSlashCommandSelection).toHaveBeenCalledWith(host, selection);
    expect(deps.setProjectHostActiveThreadId).not.toHaveBeenCalled();
    expect(deps.prepareWorktreeForThread).not.toHaveBeenCalled();
    expect(deps.createAndRecordCheckpoint).not.toHaveBeenCalled();
    expect(host.runtime.send).not.toHaveBeenCalled();
  });

  it("delegates run and context actions to the thread runtime host", async () => {
    const { contextSnapshot, host, invoke } = registerWithFakes();

    await expect(invoke("run:abort", "thread-1")).resolves.toBeUndefined();
    await expect(invoke("context:usage", "thread-1")).resolves.toEqual(contextSnapshot);
    await expect(invoke("context:compact", { threadId: "thread-1", customInstructions: "  Summarize now.  " }))
      .resolves.toEqual(contextSnapshot);
    await expect(invoke("context:recover", { threadId: "thread-1", reason: "  Rebuild context.  " }))
      .resolves.toEqual(contextSnapshot);

    expect(host.runtime.abort).toHaveBeenCalledWith("thread-1");
    expect(host.runtime.getContextUsage).toHaveBeenCalledWith("thread-1");
    expect(host.runtime.compactThread).toHaveBeenCalledWith({
      threadId: "thread-1",
      customInstructions: "Summarize now.",
    });
    expect(host.runtime.recoverThreadContext).toHaveBeenCalledWith({
      threadId: "thread-1",
      reason: "Rebuild context.",
    });
  });
});

function registerWithFakes({
  currentGoal,
  env = {},
  localPathInsideActiveWorkspace = (path: string) => path.startsWith("/workspace/") || path === "/workspace",
  localPathVisibleToThread = (path: string) => path.startsWith("/workspace/") || path === "/workspace",
  messages = [sampleChatMessage({ id: "message-1" })],
  resolveCanonicalLocalFilePath = (path: string) => path,
  thread = sampleThread(),
  validateSlashCommandSelection,
}: {
  currentGoal?: ThreadGoal;
  env?: NodeJS.ProcessEnv;
  localPathInsideActiveWorkspace?: (path: string) => boolean;
  localPathVisibleToThread?: (path: string) => boolean;
  messages?: ChatMessage[];
  resolveCanonicalLocalFilePath?: (path: string) => string;
  thread?: ThreadSummary;
  validateSlashCommandSelection?: (host: ChatRuntimeDomainHost, selection: SlashCommandSelection) => Promise<void>;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const preparedThread = { ...thread, gitWorktree: sampleThreadWorktree() };
  const readThread = { ...preparedThread, lastReadAt: "2026-06-16T00:00:00.000Z" };
  const nextGoal = sampleThreadGoal({ goalId: "goal-next", tokenBudget: currentGoal?.tokenBudget });
  const contextSnapshot = sampleContextUsageSnapshot();
  const resolvedContext: WorkspaceContextReference[] = [
    {
      path: "src/main/index.ts",
      name: "index.ts",
      kind: "file",
    },
  ];
  const store: ChatRuntimeStore = {
    getThread: vi.fn(() => thread),
    getWorkspace: vi.fn(() => ({ path: "/workspace" })),
    listMessages: vi.fn(() => messages),
    deleteMessagesAfter: vi.fn(),
    getThreadGoal: vi.fn(() => currentGoal),
    setThreadGoal: vi.fn(() => nextGoal),
    createThreadGoalIfAbsent: vi.fn(() => nextGoal),
    markThreadRead: vi.fn(() => readThread),
  };
  const runtime: ChatRuntimeAgentRuntime = {
    send: vi.fn(),
    abort: vi.fn(),
    getContextUsage: vi.fn(() => contextSnapshot),
    compactThread: vi.fn(() => contextSnapshot),
    recoverThreadContext: vi.fn(() => contextSnapshot),
  };
  const host = {
    store,
    runtime,
    nextGoal,
    readThread,
  };
  const deps = {
    activeHost: host,
    activeThreadId: "thread-1",
    activeThreadIdForHost: vi.fn(() => "thread-active"),
    createAndRecordCheckpoint: vi.fn(),
    describeWorkspaceContextReferences: vi.fn(() => resolvedContext),
    resolveCanonicalLocalFilePath: vi.fn(resolveCanonicalLocalFilePath),
    localPathVisibleToThread: vi.fn(localPathVisibleToThread),
    localPathInsideActiveWorkspace: vi.fn(localPathInsideActiveWorkspace),
    emitDesktopEvent: vi.fn(),
    emitProjectScopedEvent: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    emitThreadUpdated: vi.fn(),
    env,
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    isActiveProjectRuntimeHost: vi.fn(() => true),
    prepareWorktreeForThread: vi.fn(() => preparedThread),
    requireProjectRuntimeHostForThread: vi.fn(() => host),
    setProjectHostActiveThreadId: vi.fn(),
    ...(validateSlashCommandSelection ? { validateSlashCommandSelection } : {}),
  };
  const rawInput = {
    ...sampleSendInput(),
    permissionMode: "full-access",
    context: [{ path: "src/main/index.ts", absolute: false, label: "ignored" }],
    extra: "ignored",
  };

  registerChatRuntimeDomainIpc(deps);

  return {
    contextSnapshot,
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    preparedThread,
    rawInput,
    resolvedContext,
    thread,
  };
}

function sampleSendInput(): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "Build a tiny app.",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-test-model",
    thinkingLevel: "medium",
  };
}

function sampleChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    role: "user",
    content: "Build a tiny app.",
    createdAt: "2026-06-16T00:00:00.000Z",
    ...overrides,
  };
}

function sampleSlashCommandSelection(): SlashCommandSelection {
  return {
    schemaVersion: "ambient-slash-command-invocation-v1",
    entryId: "codex-plugin-skill:reviewer",
    command: "/reviewer",
    title: "reviewer",
    kind: "skill",
    sourceKind: "codex-plugin",
    invocationKind: "codex-plugin-skill",
    sourceId: "plugin-reviewer",
    sourceName: "reviewer",
    sourceVersion: "1.0.0",
    sourceFingerprint: "abc123",
  };
}

function sampleThread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread 1",
    workspacePath: "/workspace",
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-test-model",
    thinkingLevel: "medium",
    ...overrides,
  };
}

function sampleThreadWorktree() {
  return {
    threadId: "thread-1",
    projectRoot: "/workspace",
    worktreePath: "/workspace/.ambient/worktrees/thread-1",
    branchName: "ambient/thread-1",
    status: "active" as const,
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
  };
}

function sampleThreadGoal(overrides: Partial<ThreadGoal> = {}): ThreadGoal {
  return {
    threadId: "thread-1",
    goalId: "goal-1",
    objective: "Simplify the codebase.",
    status: "active",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 0,
    noProgressTurns: 0,
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
    ...overrides,
  };
}

function sampleContextUsageSnapshot(): ContextUsageSnapshot {
  return {
    threadId: "thread-1",
    source: "provider",
    compactionCount: 0,
    updatedAt: "2026-06-16T00:00:00.000Z",
  };
}
