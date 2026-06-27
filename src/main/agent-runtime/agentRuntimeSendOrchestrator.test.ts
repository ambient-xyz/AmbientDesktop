import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  runAgentRuntimeSendOrchestrator,
  type AgentRuntimeSendOrchestratorInput,
} from "./agentRuntimeSendOrchestrator";
import { prepareAgentRuntimeSendStartContext } from "./agentRuntimeSendStartContext";
import { createAgentRuntimeSendRunStateForRuntime } from "./agentRuntimeSendRunState";
import { runAgentRuntimeSendPromptRun, type AgentRuntimeSendPromptRunSession } from "./agentRuntimeSendPromptRun";

vi.mock("./agentRuntimeSendStartContext", () => ({
  prepareAgentRuntimeSendStartContext: vi.fn(),
}));

vi.mock("./agentRuntimeSendRunState", () => ({
  createAgentRuntimeSendRunStateForRuntime: vi.fn(),
}));

vi.mock("./agentRuntimeSendPromptRun", () => ({
  runAgentRuntimeSendPromptRun: vi.fn(),
}));

type TestSession = AgentRuntimeSendPromptRunSession & { sessionFile?: string };

const prepareSendStart = vi.mocked(prepareAgentRuntimeSendStartContext);
const createRunState = vi.mocked(createAgentRuntimeSendRunStateForRuntime);
const runPromptRun = vi.mocked(runAgentRuntimeSendPromptRun);

describe("runAgentRuntimeSendOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops before run materialization when send start handles active-run handoff", async () => {
    prepareSendStart.mockResolvedValue({ kind: "handled" });
    const input = baseInput();

    await runAgentRuntimeSendOrchestrator(input);

    expect(prepareSendStart).toHaveBeenCalledWith(expect.objectContaining({
      input: input.sendInput,
      hooks: {},
      activeRuns: input.activeRuns,
      activeRunHandoff: input.activeRunHandoff,
      sendPreparation: input.sendPreparation,
      sendPreflight: input.sendPreflight,
    }));
    expect(createRunState).not.toHaveBeenCalled();
    expect(runPromptRun).not.toHaveBeenCalled();
  });

  it("bridges send-start context through run-state materialization and prompt execution", async () => {
    const thread = threadSummary();
    const session = testSession("session-1");
    const getSession = vi.fn(async () => session);
    const abortSessionRun = vi.fn(async () => undefined);
    const createWorkflowRecordingReviewSession = vi.fn(async () => testSession("review-session"));
    const startContext = sendStartContext(thread);
    prepareSendStart.mockResolvedValue({
      kind: "continue",
      context: startContext,
    });
    createRunState.mockReturnValue({
      runId: "run-1",
      runGoalId: "goal-1",
      runGoalStartedAtMs: 42,
      sendPromptState: { promptState: true } as never,
      sendExecutionState: { executionState: true } as never,
    });
    runPromptRun.mockImplementation(async (promptRunInput) => {
      const createdSession = await promptRunInput.createSession();
      promptRunInput.setSession(createdSession);
      await promptRunInput.abortSessionRun(createdSession, thread.id);
      expect(promptRunInput.getMessages()).toEqual([{ id: "message-1" }]);
      expect(promptRunInput.getThread()).toEqual(thread);
    });
    const input = baseInput({
      getSession,
      abortSessionRun,
      createWorkflowRecordingReviewSession,
    });

    await runAgentRuntimeSendOrchestrator(input);

    expect(createRunState).toHaveBeenCalledWith(expect.objectContaining({
      sendInput: input.sendInput,
      thread,
      runWorkspacePath: "/workspace",
      visibleUserContent: "visible",
      promptContent: "prompt",
      activeRuns: input.activeRuns,
      activeRunIds: input.activeRunIds,
      sessions: input.sessions,
      permissionWaitControls: input.permissionWaitControls,
    }));
    expect(runPromptRun).toHaveBeenCalledWith(expect.objectContaining({
      sendInput: input.sendInput,
      thread,
      runId: "run-1",
      runGoalId: "goal-1",
      runGoalStartedAtMs: 42,
      promptContent: "prompt",
      images: ["image-1"],
      promptExecutions: input.promptExecutions,
      promptOutcomes: input.promptOutcomes,
    }));
    expect(getSession).toHaveBeenCalledWith(
      thread,
      startContext.runtimeInput.sessionRecovery,
      startContext.symphonyParentModePolicy,
      startContext.runtimeInput.symphonyParentModeVerifiedLaunch,
    );
    expect(createWorkflowRecordingReviewSession).not.toHaveBeenCalled();
    expect(abortSessionRun).toHaveBeenCalledWith(session, thread.id);
  });
});

function baseInput(
  overrides: Partial<AgentRuntimeSendOrchestratorInput<TestSession>> = {},
): AgentRuntimeSendOrchestratorInput<TestSession> {
  const thread = threadSummary();
  return {
    sendInput: sendMessageInput(),
    store: {
      getThread: vi.fn(() => thread),
      getWorkspace: vi.fn(),
      finishPlannerPlanFinalizationAttempt: vi.fn(),
      listMessages: vi.fn(() => [{ id: "message-1" }]),
    } as unknown as AgentRuntimeSendOrchestratorInput<TestSession>["store"],
    activeRuns: new Map(),
    activeRunIds: new Map(),
    sessions: {
      get: vi.fn(),
      delete: vi.fn(),
    } as unknown as AgentRuntimeSendOrchestratorInput<TestSession>["sessions"],
    permissionWaitControls: new Map(),
    permissions: {
      denyThread: vi.fn(),
    },
    activeRunHandoff: {
      handleSendActiveRunHandoff: vi.fn(),
    } as unknown as AgentRuntimeSendOrchestratorInput<TestSession>["activeRunHandoff"],
    sendPreparation: {
      prepareRuntimeSendLoopContext: vi.fn(),
    } as unknown as AgentRuntimeSendOrchestratorInput<TestSession>["sendPreparation"],
    sendPreflight: {
      runBeforePrompt: vi.fn(),
      sendInputWithSymphonyParentModeToolCapableModel: vi.fn(),
    } as unknown as AgentRuntimeSendOrchestratorInput<TestSession>["sendPreflight"],
    promptExecutions: {
      runPrompt: vi.fn(),
    } as unknown as AgentRuntimeSendOrchestratorInput<TestSession>["promptExecutions"],
    promptOutcomes: {
      finalizeSendAfterRun: vi.fn(),
      handlePromptFailure: vi.fn(),
      handlePromptSuccess: vi.fn(),
    } as unknown as AgentRuntimeSendOrchestratorInput<TestSession>["promptOutcomes"],
    subagentStopCascade: {
      cascadeSubagentsForStoppedParentRun: vi.fn(),
    },
    getFeatureFlagSnapshot: vi.fn(() => ({
      schemaVersion: 1,
      generatedAt: "2026-06-22T00:00:00.000Z",
      flags: {},
    })) as unknown as AgentRuntimeSendOrchestratorInput<TestSession>["getFeatureFlagSnapshot"],
    createWorkflowRecordingReviewSession: vi.fn(async () => testSession("review-session")),
    getSession: vi.fn(async () => testSession("session-1")),
    commitThreadPiSessionFile: vi.fn(async () => undefined),
    abortSessionRun: vi.fn(async () => undefined),
    emit: vi.fn<(event: DesktopEvent) => void>(),
    ...overrides,
  };
}

function sendStartContext(thread: ThreadSummary): any {
  return {
    runtimeInput: {
      threadId: thread.id,
      content: "hello",
      sessionRecovery: { sessionFile: "recovery.json" },
      symphonyParentModeVerifiedLaunch: { launchId: "launch-1" },
    },
    sendInputWithSymphonyParentModePolicy: sendMessageInput(),
    usesDedicatedReviewSession: false,
    visibleUserContent: "visible",
    hasWorkflowPlanEditIntent: false,
    thread,
    plannerFinalizationSources: [],
    runWorkspacePath: "/workspace",
    piPreStreamTimeoutMs: 1_000,
    piStreamIdleTimeoutMs: 2_000,
    defaultToolExecutionIdleTimeoutMs: 3_000,
    emptyAssistantStallTimeoutMs: 4_000,
    promptContent: "prompt",
    retrySourceUserMessageId: "message-1",
    assistantFinalizationRetryMaxRetries: 1,
    interruptedToolCallRecoveryMaxRetries: 3,
    interruptedToolCallRecoveryAttemptsUsed: 0,
    canScheduleInterruptedToolCallRecovery: true,
    symphonyParentModePolicy: { required: true },
    promptImageInputs: {
      images: ["image-1"],
      attachments: [],
    },
    runEventScope: {
      emitRunEvent: vi.fn(),
      finishPlannerFinalizationSources: vi.fn(),
      isRunStoreActive: vi.fn(() => true),
      markRunActivity: vi.fn(() => true),
      addActivityListener: vi.fn(() => () => undefined),
      detachFromWorkspace: vi.fn(),
    },
    runtimeModel: "example/model-id",
  };
}

function sendMessageInput(): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "hello",
    context: [],
  } as unknown as SendMessageInput;
}

function threadSummary(): ThreadSummary {
  return {
    id: "thread-1",
    kind: "chat",
    title: "Thread",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    lastMessagePreview: "hello",
    messages: [],
    runs: [],
    workspacePath: "/workspace",
    permissionMode: "workspace",
    model: "example/model-id",
  } as unknown as ThreadSummary;
}

function testSession(sessionFile: string): TestSession {
  return {
    sessionFile,
    dispose: vi.fn(),
    followUp: vi.fn(async () => undefined),
    steer: vi.fn(async () => undefined),
  } as unknown as TestSession;
}
