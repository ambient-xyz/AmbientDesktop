import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage, ThreadGoal, ThreadSummary } from "../../shared/threadTypes";
import type { AgentRuntimeSendExecutionStateSession } from "./agentRuntimeSendExecutionState";
import {
  createAgentRuntimeSendRunState,
  createAgentRuntimeSendRunStateForRuntime,
  type AgentRuntimeSendRunStateRuntimeAdapterInput,
  type AgentRuntimeSendRunStateInput,
} from "./agentRuntimeSendRunState";
import type { RuntimeRunEventScope } from "./runtimeRunEventScope";

interface TestSession extends AgentRuntimeSendExecutionStateSession {
  sessionFile?: string;
}

describe("createAgentRuntimeSendRunState", () => {
  it("materializes assistant/run state and registers active run controls", () => {
    const events: DesktopEvent[] = [];
    const messages: ChatMessage[] = [];
    const permissionWaitControls = new Map<string, unknown>();
    const input = baseInput({
      emit: (event) => events.push(event),
      listMessages: () => messages,
      setPermissionWaitControl: (threadId, control) => {
        permissionWaitControls.set(threadId, control);
      },
    });

    const state = createAgentRuntimeSendRunState(input);

    expect(state.runId).toBe("run-1");
    expect(state.runGoalId).toBe("goal-1");
    expect(state.runGoalStartedAtMs).toEqual(expect.any(Number));
    expect(input.addAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      content: "",
      metadata: expect.objectContaining({ status: "streaming" }),
    }));
    expect(input.startRun).toHaveBeenCalledWith({ threadId: "thread-1", assistantMessageId: "assistant-1" });
    expect(input.setActiveRunId).toHaveBeenCalledWith("thread-1", "run-1");
    expect(input.setActiveRun).toHaveBeenCalledWith("thread-1", state.sendExecutionState.activeRun);
    expect(events.map((event) => event.type)).toEqual(["message-created", "run-status"]);
    expect(permissionWaitControls.has("thread-1")).toBe(true);
  });

  it("omits inactive goals from prompt-run metadata", () => {
    const state = createAgentRuntimeSendRunState(baseInput({
      getThreadGoal: () => threadGoal("paused"),
    }));

    expect(state.runGoalId).toBeUndefined();
  });

  it("adapts runtime store and session callbacks for run materialization", () => {
    const events: DesktopEvent[] = [];
    const runEvents: DesktopEvent[] = [];
    const activeRunIds = new Map<string, string>();
    const activeRuns = new Map<string, unknown>();
    const permissionWaitControls = new Map<string, unknown>();
    const session: TestSession = {
      sessionFile: "session-file-1",
      dispose: vi.fn(),
      followUp: vi.fn(async () => undefined),
      steer: vi.fn(async () => undefined),
    };
    const sessions = {
      get: vi.fn(() => session),
      delete: vi.fn(() => true),
    };
    const runEventScope = runtimeRunEventScope({
      emitRunEvent: (event) => runEvents.push(event),
    });

    const state = createAgentRuntimeSendRunStateForRuntime({
      ...runtimeAdapterInput({
        activeRunIds,
        activeRuns,
        events,
        permissionWaitControls,
        runEventScope,
        sessions,
      }),
      sessionRef: { current: session },
    });

    expect(state.runId).toBe("run-1");
    expect(activeRunIds.get("thread-1")).toBe("run-1");
    expect(activeRuns.get("thread-1")).toBe(state.sendExecutionState.activeRun);
    expect(permissionWaitControls.get("thread-1")).toBe(state.sendExecutionState.permissionWaits);
    expect(events.map((event) => event.type)).toEqual(["message-created", "run-status"]);

    const cleanup = state.sendExecutionState.cleanupCurrentSession({
      clearPersistedSessionFileIfCurrent: true,
    });

    expect(cleanup).toMatchObject({
      removedActiveSession: true,
      disposedSession: true,
      clearedPersistedSessionFile: true,
    });
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(sessions.delete).toHaveBeenCalledWith("thread-1");
    expect(runEvents).toEqual([
      expect.objectContaining({
        type: "thread-updated",
        thread: expect.objectContaining({ piSessionFile: undefined }),
      }),
    ]);
  });
});

function baseInput(
  overrides: Partial<AgentRuntimeSendRunStateInput<TestSession>> = {},
): AgentRuntimeSendRunStateInput<TestSession> {
  const assistantMessage: ChatMessage = {
    id: "assistant-1",
    threadId: "thread-1",
    role: "assistant",
    content: "",
    createdAt: "2026-06-22T00:00:00.000Z",
    metadata: { status: "streaming" },
  };
  const runEventScope: RuntimeRunEventScope = {
    isRunStoreActive: () => true,
    emitRunEvent: vi.fn(),
    markRunActivity: vi.fn(() => true),
    finishPlannerFinalizationSources: vi.fn(),
    addActivityListener: vi.fn(() => () => undefined),
    detachFromWorkspace: vi.fn(),
  };
  return {
    threadId: "thread-1",
    runWorkspacePath: "/workspace",
    threadWorkspacePath: "/workspace",
    permissionMode: "workspace",
    visibleUserContent: "hello",
    baseInput: {
      threadId: "thread-1",
      content: "hello",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "model-1",
      thinkingLevel: "medium",
    },
    runtimeInput: {},
    usesDedicatedReviewSession: false,
    runtimeModel: "model-1",
    assistantFinalizationRetryMaxRetries: 1,
    interruptedToolCallRecoveryAttemptsUsed: 0,
    interruptedToolCallRecoveryMaxRetries: 3,
    piPreStreamTimeoutMs: 1_000,
    piStreamIdleTimeoutMs: 1_000,
    progressThrottleMs: 2_000,
    progressCharDelta: 250,
    recentEventLimit: 250,
    emptyResponseRetryDelayMs: 0,
    runEventScope,
    sessionRef: { current: undefined },
    getPromptContentLength: () => 5,
    startRun: vi.fn(() => ({ id: "run-1" })),
    getThreadGoal: vi.fn(() => threadGoal("active")),
    setActiveRunId: vi.fn(),
    setActiveRun: vi.fn(),
    addAssistantMessage: vi.fn(() => assistantMessage),
    addToolMessage: vi.fn((messageInput) => ({
      id: "tool-1",
      threadId: messageInput.threadId,
      role: "tool" as const,
      content: messageInput.content,
      createdAt: "2026-06-22T00:00:00.000Z",
      metadata: messageInput.metadata,
    })),
    appendToMessage: vi.fn((messageId, delta) => ({
      ...assistantMessage,
      id: messageId,
      content: delta,
    })),
    replaceMessage: vi.fn((messageId, content, metadata) => ({
      ...assistantMessage,
      id: messageId,
      content,
      metadata,
    })),
    listMessages: vi.fn(() => []),
    getMessage: vi.fn((messageId) => messageId === assistantMessage.id ? assistantMessage : undefined),
    updateRunStatus: vi.fn(),
    updateRunDiagnostics: vi.fn(),
    finishRun: vi.fn(),
    denyThread: vi.fn(),
    getPermissionMode: vi.fn((): "workspace" => "workspace"),
    getCurrentThreadPiSessionFile: vi.fn(() => undefined),
    getCurrentThreadModel: vi.fn(() => "model-1"),
    commitThreadPiSessionFile: vi.fn(async () => undefined),
    getWorkspaceStatePath: vi.fn(() => "/workspace/.ambient"),
    abortSessionRun: vi.fn(async () => undefined),
    markSubagentParentControlBarrierReconciled: vi.fn((reconcileInput) => ({
      id: reconcileInput.waitBarrierId,
      parentThreadId: "thread-1",
      parentRunId: "run-1",
      childRunIds: [],
      dependencyMode: "required_all" as const,
      status: "satisfied" as const,
      failurePolicy: "fail_parent" as const,
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
    })),
    cascadeSubagentsForStoppedParentRun: vi.fn(async () => undefined),
    setPermissionWaitControl: vi.fn(),
    getModel: vi.fn(() => "model-1"),
    clearThreadPiSessionFile: vi.fn(),
    removeActiveSessionIfCurrent: vi.fn(() => true),
    listCallableWorkflowTasksForParentRun: vi.fn(() => []),
    emit: vi.fn(),
    ...overrides,
  };
}

function runtimeAdapterInput(overrides: {
  activeRunIds?: Map<string, string>;
  activeRuns?: Map<string, unknown>;
  events?: DesktopEvent[];
  permissionWaitControls?: Map<string, unknown>;
  runEventScope?: RuntimeRunEventScope;
  sessions?: Pick<AgentRuntimeSendRunStateRuntimeAdapterInput<TestSession>["sessions"], "delete" | "get">;
} = {}): AgentRuntimeSendRunStateRuntimeAdapterInput<TestSession> {
  const thread = threadSummary({ piSessionFile: "session-file-1" });
  const events = overrides.events ?? [];
  const activeRunIds = overrides.activeRunIds ?? new Map<string, string>();
  const activeRuns = overrides.activeRuns ?? new Map<string, unknown>();
  const permissionWaitControls = overrides.permissionWaitControls ?? new Map<string, unknown>();
  const assistantMessage: ChatMessage = {
    id: "assistant-1",
    threadId: "thread-1",
    role: "assistant",
    content: "",
    createdAt: "2026-06-22T00:00:00.000Z",
    metadata: { status: "streaming" },
  };
  const store = {
    addMessage: vi.fn((messageInput: { threadId: string; role: ChatMessage["role"]; content: string; metadata?: Record<string, unknown> }) => ({
      id: messageInput.role === "assistant" ? "assistant-1" : "tool-1",
      threadId: messageInput.threadId,
      role: messageInput.role,
      content: messageInput.content,
      createdAt: "2026-06-22T00:00:00.000Z",
      metadata: messageInput.metadata,
    } as ChatMessage)),
    appendToMessage: vi.fn((messageId: string, delta: string) => ({
      ...assistantMessage,
      id: messageId,
      content: delta,
    })),
    finishRun: vi.fn(),
    getThread: vi.fn(() => thread),
    getThreadGoal: vi.fn(() => threadGoal("active")),
    getMessage: vi.fn((messageId: string) => messageId === assistantMessage.id ? assistantMessage : undefined),
    getWorkspace: vi.fn(() => ({
      path: "/workspace",
      statePath: "/workspace/.ambient",
    })),
    listCallableWorkflowTasksForParentRun: vi.fn(() => []),
    listMessages: vi.fn(() => []),
    markSubagentParentControlBarrierReconciled: vi.fn((reconcileInput: { waitBarrierId: string }) => ({
      id: reconcileInput.waitBarrierId,
      parentThreadId: "thread-1",
      parentRunId: "run-1",
      childRunIds: [],
      dependencyMode: "required_all" as const,
      status: "satisfied" as const,
      failurePolicy: "fail_parent" as const,
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
    })),
    replaceMessage: vi.fn((messageId: string, content: string, metadata?: Record<string, unknown>) => ({
      ...assistantMessage,
      id: messageId,
      content,
      metadata,
    })),
    startRun: vi.fn(() => ({ id: "run-1" })),
    updateRunDiagnostics: vi.fn(),
    updateRunStatus: vi.fn(),
    updateThreadSettings: vi.fn(() => ({
      ...thread,
      piSessionFile: undefined,
    })),
  } as unknown as AgentRuntimeSendRunStateRuntimeAdapterInput<TestSession>["store"];

  return {
    sendInput: {
      threadId: "thread-1",
      content: "hello",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "model-1",
      thinkingLevel: "medium",
    },
    thread,
    runWorkspacePath: "/workspace",
    visibleUserContent: "hello",
    sendInputWithSymphonyParentModePolicy: {
      threadId: "thread-1",
      content: "hello",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "model-1",
      thinkingLevel: "medium",
    },
    runtimeInput: {},
    usesDedicatedReviewSession: false,
    runtimeModel: "model-1",
    assistantFinalizationRetryMaxRetries: 1,
    interruptedToolCallRecoveryAttemptsUsed: 0,
    interruptedToolCallRecoveryMaxRetries: 3,
    piPreStreamTimeoutMs: 1_000,
    piStreamIdleTimeoutMs: 1_000,
    progressThrottleMs: 2_000,
    progressCharDelta: 250,
    recentEventLimit: 250,
    emptyResponseRetryDelayMs: 0,
    runEventScope: overrides.runEventScope ?? runtimeRunEventScope(),
    sessionRef: { current: undefined },
    promptContent: "hello",
    store,
    activeRunIds,
    activeRuns: activeRuns as unknown as AgentRuntimeSendRunStateRuntimeAdapterInput<TestSession>["activeRuns"],
    sessions: overrides.sessions ?? {
      get: vi.fn(() => undefined),
      delete: vi.fn(() => true),
    },
    permissions: {
      denyThread: vi.fn(),
    },
    permissionWaitControls: permissionWaitControls as unknown as AgentRuntimeSendRunStateRuntimeAdapterInput<TestSession>["permissionWaitControls"],
    commitThreadPiSessionFile: vi.fn(async () => undefined),
    abortSessionRun: vi.fn(async () => undefined),
    cascadeSubagentsForStoppedParentRun: vi.fn(async () => undefined),
    emit: (event) => events.push(event),
  };
}

function runtimeRunEventScope(overrides: Partial<RuntimeRunEventScope> = {}): RuntimeRunEventScope {
  return {
    isRunStoreActive: () => true,
    emitRunEvent: vi.fn(),
    markRunActivity: vi.fn(() => true),
    finishPlannerFinalizationSources: vi.fn(),
    addActivityListener: vi.fn(() => () => undefined),
    detachFromWorkspace: vi.fn(),
    ...overrides,
  };
}

function threadGoal(status: ThreadGoal["status"]): ThreadGoal {
  return {
    threadId: "thread-1",
    goalId: "goal-1",
    objective: "Ship it",
    status,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 0,
    noProgressTurns: 0,
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
  };
}

function threadSummary(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    workspacePath: "/workspace",
    kind: "chat",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    lastMessagePreview: "hello",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "model-1",
    thinkingLevel: "medium",
    ...overrides,
  };
}
