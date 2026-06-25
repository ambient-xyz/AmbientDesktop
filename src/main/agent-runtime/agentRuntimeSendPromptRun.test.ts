import { describe, expect, it, vi } from "vitest";

import type { SendMessageInput } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { RunAgentRuntimePromptExecutionResult } from "./agentRuntimePromptExecutionController";
import {
  runAgentRuntimeSendPromptRun,
  type AgentRuntimeSendPromptRunInput,
  type AgentRuntimeSendPromptRunSession,
} from "./agentRuntimeSendPromptRun";

type TestSession = AgentRuntimeSendPromptRunSession & { sessionFile?: string };

describe("runAgentRuntimeSendPromptRun", () => {
  it("runs the prompt, applies success follow-ups, and finalizes the send", async () => {
    const session = testSession("session-1");
    const input = baseInput({
      createSession: vi.fn(async () => session),
      promptExecutions: {
        runPrompt: vi.fn(async () => ({
          completed: true,
          promptRunState: promptRunState({ finalizedAfterToolIdle: true }),
        })),
      },
      promptOutcomes: {
        handlePromptFailure: vi.fn(async () => undefined),
        handlePromptSuccess: vi.fn(async () => ({
          pendingEmptyResponseRetry: sendMessageInput("retry"),
        })),
        finalizeSendAfterRun: vi.fn(async () => undefined),
      },
    });

    await runAgentRuntimeSendPromptRun(input);

    expect(input.createSession).toHaveBeenCalledOnce();
    expect(input.setSession).toHaveBeenCalledWith(session);
    expect(input.promptExecutions.runPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        session,
        preStreamTimeoutMs: 1_000,
        streamIdleTimeoutMs: 2_000,
      }),
    );
    expect(input.sendExecutionState.sendSessionLifecycle.assertRequiredSymphonyParentModeLaunch).toHaveBeenCalledWith({
      launchId: "launch-1",
    });
    expect(input.promptOutcomes.handlePromptSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        session,
        startedInPlannerMode: false,
        finalizedAfterToolIdle: true,
        providerRetryAttemptCount: 2,
      }),
    );
    expect(input.sendPromptState.pendingFollowUps.applyPromptSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingEmptyResponseRetry: expect.objectContaining({
          threadId: "thread-1",
        }),
      }),
    );
    expect(input.promptOutcomes.handlePromptFailure).not.toHaveBeenCalled();
    expect(input.promptOutcomes.finalizeSendAfterRun).toHaveBeenCalledWith(
      expect.objectContaining({
        session,
        promptContent: "Prompt",
        pendingEmptyResponseRetryDelayMs: 50,
      }),
    );
  });

  it("routes prompt execution failures through failure handling before finalization", async () => {
    const session = testSession("session-1");
    const error = new Error("provider failed");
    const input = baseInput({
      createSession: vi.fn(async () => session),
      promptExecutions: {
        runPrompt: vi.fn(async () => {
          throw error;
        }),
      },
    });

    await runAgentRuntimeSendPromptRun(input);

    expect(input.promptOutcomes.handlePromptFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error,
        symphonyParentModeVerifiedLaunch: { launchId: "refreshed-launch" },
      }),
    );
    expect(input.promptOutcomes.handlePromptSuccess).not.toHaveBeenCalled();
    expect(input.promptOutcomes.finalizeSendAfterRun).toHaveBeenCalledWith(expect.objectContaining({ session }));
  });

  it("finalizes without success or failure handling when prompt execution returns incomplete", async () => {
    const input = baseInput({
      promptExecutions: {
        runPrompt: vi.fn(async () => ({
          completed: false,
          promptRunState: promptRunState(),
        })),
      },
    });

    await runAgentRuntimeSendPromptRun(input);

    expect(input.promptOutcomes.handlePromptSuccess).not.toHaveBeenCalled();
    expect(input.promptOutcomes.handlePromptFailure).not.toHaveBeenCalled();
    expect(input.promptOutcomes.finalizeSendAfterRun).toHaveBeenCalledOnce();
  });
});

function baseInput(
  overrides: Partial<AgentRuntimeSendPromptRunInput<TestSession>> = {},
): AgentRuntimeSendPromptRunInput<TestSession> {
  const session = testSession("session-1");
  const sendPromptState = {
    assistantRetryPlanning: {
      assistantFinalizationRetryAttemptsUsedFor: vi.fn(() => 0),
      assistantFinalizationRetryNextAttemptFor: vi.fn(() => 1),
      canScheduleAssistantFinalizationRetryFor: vi.fn(() => true),
      createAssistantFinalizationRetryInput: vi.fn((reason) => sendMessageInput(reason)),
      createInterruptedToolCallRecoveryInput: vi.fn(() => sendMessageInput("recover")),
      persistCurrentSessionPointerForRetry: vi.fn(async () => undefined),
      sessionRecoveryForCurrentSession: vi.fn(() => undefined),
    },
    chatStreamInterruptionDiagnostic: vi.fn(() => undefined),
    chatStreamInterruptionNotice: vi.fn(() => undefined),
    currentPiStreamFailureKind: vi.fn(() => undefined),
    currentPiStreamTimeoutMessage: vi.fn(() => "timeout"),
    outputState: {
      assistantOutputChars: vi.fn(() => 7),
      currentAssistantFinalText: vi.fn(() => "assistant"),
      currentThinkingFinalText: vi.fn(() => "thinking"),
      receivedAnyText: vi.fn(() => true),
      thinkingOutputChars: vi.fn(() => 3),
    },
    pendingFollowUps: {
      applyPromptSuccess: vi.fn(),
      pendingEmptyResponseRetryDelayMs: vi.fn(() => 50),
      setPendingEmptyResponseRetry: vi.fn(),
      setPendingInterruptedToolCallRecoveryFollowUp: vi.fn(),
      setPendingProviderInterruptionContinuation: vi.fn(),
      snapshot: vi.fn(() => ({
        pendingEmptyResponseRetryDelayMs: 50,
      })),
    },
    persistPiStreamTrace: vi.fn(async () => undefined),
    piStreamActivity: {},
    promptControlState: {
      isStreamTimedOut: vi.fn(() => false),
    },
    promptLifecycleControls: {},
    providerRetryState: {
      providerRetryAttemptCount: vi.fn(() => 2),
      setProviderRetryAttemptCount: vi.fn(),
      setProviderRetryLastError: vi.fn(),
      snapshot: vi.fn(() => ({
        providerRetryAttemptCount: 2,
        providerRetryBeforeVisibleOutput: false,
        providerRetryRecovered: true,
        providerRetryLastError: "transient",
      })),
    },
    queuedMessages: {},
    recordPiStreamTraceEvent: vi.fn(),
    resolveActiveRunSettled: vi.fn(),
    runtimeMessages: {},
    setAssistantTerminalCompletion: vi.fn(),
    setEmptyAssistantStallWatchdog: vi.fn(),
    setStreamWatchdog: vi.fn(),
    streamTraceState: {},
  };
  const sendExecutionState = {
    cleanupCurrentSession: vi.fn(),
    collectOpenProviderInterruptionToolSnapshots: vi.fn(() => []),
    consumeSubagentParentControlAbort: vi.fn(async () => undefined),
    createProviderContinuationState: vi.fn(),
    createProviderInterruptionContinuationInput: vi.fn(() => sendMessageInput("continue")),
    currentSubagentParentControlAbortIntent: vi.fn(() => undefined),
    finishParentRun: vi.fn(),
    forceInterruptedToolCallRecovery: vi.fn(),
    interruptedToolCallRecovery: {},
    isAbortRequested: vi.fn(() => false),
    markOpenToolMessagesFailed: vi.fn(),
    permissionWaits: {},
    persistProviderContinuationState: vi.fn(),
    persistToolArgumentDiagnostics: vi.fn(),
    requestSubagentParentControlAbort: vi.fn(),
    sendSessionLifecycle: {
      assertRequiredSymphonyParentModeLaunch: vi.fn(),
      refreshStoredSymphonyParentModeVerifiedLaunch: vi.fn(() => ({ launchId: "refreshed-launch" })),
      resolveAndStoreCurrentSymphonyParentModeVerifiedLaunch: vi.fn(() => ({ launchId: "launch-1" })),
    },
    setMarkOpenToolMessagesFailed: vi.fn(),
    setToolArgumentWatchdog: vi.fn(),
    setToolExecutionWatchdog: vi.fn(),
    startedToolCallIds: new Set(),
    toolArgumentProgress: {},
    toolArgumentWatchdog: vi.fn(() => undefined),
    toolExecutionWatchdog: vi.fn(() => undefined),
    toolMessages: {
      size: vi.fn(() => 0),
    },
    toolRecovery: {},
  };
  const input = {
    abortGraceMs: 5_000,
    abortSessionRun: vi.fn(async () => undefined),
    assistantFinalizationRetryMaxRetries: 3,
    assistantTerminalGraceMs: 1_500,
    canScheduleInterruptedToolCallRecovery: true,
    createSession: vi.fn(async () => session),
    defaultToolExecutionIdleTimeoutMs: 3_000,
    emptyAssistantStallTimeoutMs: 4_000,
    getMessages: vi.fn(() => []),
    getThread: vi.fn(() => threadSummary()),
    hasWorkflowPlanEditIntent: false,
    hooks: {},
    images: [],
    interruptedToolCallRecoveryAttemptsUsed: 0,
    interruptedToolCallRecoveryMaxRetries: 2,
    piPreStreamTimeoutMs: 1_000,
    piStreamIdleTimeoutMs: 2_000,
    plannerFinalizationSources: [],
    postToolContinuationIdleMs: 100,
    postToolFinalizationIdleMs: 200,
    postToolFinalizationTickMs: 10,
    promptContent: "Prompt",
    promptExecutions: {
      runPrompt: vi.fn(async () => ({
        completed: true,
        promptRunState: promptRunState(),
      })),
    },
    promptOutcomes: {
      handlePromptFailure: vi.fn(async () => undefined),
      handlePromptSuccess: vi.fn(async () => ({})),
      finalizeSendAfterRun: vi.fn(async () => undefined),
    },
    runEventScope: {
      emitRunEvent: vi.fn(),
      finishPlannerFinalizationSources: vi.fn(),
      isRunStoreActive: vi.fn(() => true),
      markRunActivity: vi.fn(() => true),
    },
    runGoalStartedAtMs: 12,
    runId: "run-1",
    runWorkspacePath: "/workspace",
    sendExecutionState: sendExecutionState as unknown as AgentRuntimeSendPromptRunInput<TestSession>["sendExecutionState"],
    sendInput: sendMessageInput("Prompt"),
    sendPromptState: sendPromptState as unknown as AgentRuntimeSendPromptRunInput<TestSession>["sendPromptState"],
    setSession: vi.fn(),
    startedInPlannerMode: false,
    thread: threadSummary(),
    usesDedicatedReviewSession: false,
  } satisfies AgentRuntimeSendPromptRunInput<TestSession>;
  return {
    ...input,
    ...overrides,
  } as AgentRuntimeSendPromptRunInput<TestSession>;
}

function sendMessageInput(content: string): SendMessageInput {
  return {
    threadId: "thread-1",
    content,
    permissionMode: "full-access",
    collaborationMode: "agent",
    model: "model",
    thinkingLevel: "medium",
  };
}

function threadSummary(): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    workspacePath: "/workspace",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "full-access",
    collaborationMode: "agent",
    model: "model",
    thinkingLevel: "medium",
  };
}

function promptRunState(
  snapshot: Record<string, unknown> = {},
): RunAgentRuntimePromptExecutionResult["promptRunState"] {
  return {
    snapshot: vi.fn(() => ({
      assistantTerminalCleanupDiagnostic: undefined,
      finalizedAfterToolIdle: false,
      lastAssistantTerminalEvent: undefined,
      runtimeError: undefined,
      ...snapshot,
    })),
  } as unknown as RunAgentRuntimePromptExecutionResult["promptRunState"];
}

function testSession(sessionFile: string): TestSession {
  return {
    dispose: vi.fn(),
    followUp: vi.fn(async () => undefined),
    prompt: vi.fn(async () => undefined),
    sessionFile,
    steer: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
  };
}
