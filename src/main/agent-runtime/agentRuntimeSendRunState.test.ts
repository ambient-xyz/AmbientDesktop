import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage, ThreadGoal } from "../../shared/threadTypes";
import type { AgentRuntimeSendExecutionStateSession } from "./agentRuntimeSendExecutionState";
import {
  createAgentRuntimeSendRunState,
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
