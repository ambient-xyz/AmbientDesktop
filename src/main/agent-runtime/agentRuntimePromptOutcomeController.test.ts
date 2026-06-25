import { describe, expect, it, vi } from "vitest";

import type { SendMessageInput } from "../../shared/desktopTypes";
import type {
  ChatMessage,
  InterruptedToolCallRecoverySnapshot,
  ProviderContinuationState,
  ThreadSummary,
} from "../../shared/threadTypes";
import {
  AgentRuntimePromptOutcomeController,
  type HandleAgentRuntimePromptFailureInput,
  type AgentRuntimePromptOutcomeControllerOptions,
} from "./agentRuntimePromptOutcomeController";
import type { RuntimeAssistantMessageController } from "./runtimeAssistantMessageController";
import type { RuntimeQueuedMessageController } from "./runtimeQueuedMessageController";
import type { RuntimeToolMessageController } from "./runtimeToolMessageController";

const createdAt = "2026-06-19T00:00:00.000Z";
const streamIdleTimeoutKind = "stream_idle_timeout" as const;

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "assistant-1",
    threadId: "thread-1",
    role: "assistant",
    content: "Final answer",
    createdAt,
    ...overrides,
  };
}

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    createdAt,
    updatedAt: createdAt,
    model: "ambient-preview",
    thinkingLevel: "medium",
    permissionMode: "full-access",
    collaborationMode: "agent",
    workspacePath: "/workspace",
    piSessionFile: "/tmp/old-session.jsonl",
    memoryEnabled: false,
    ...overrides,
  } as ThreadSummary;
}

function followUp(content: string): SendMessageInput {
  return {
    threadId: "thread-1",
    content,
    permissionMode: "full-access",
    collaborationMode: "agent",
    model: "ambient-preview",
    thinkingLevel: "medium",
    delivery: "follow-up",
    preserveActiveThread: true,
  };
}

function runtimeMessages(): RuntimeAssistantMessageController {
  return {
    currentAssistantMessageId: vi.fn(() => "assistant-1"),
    currentMessageContent: vi.fn(() => "Final answer"),
    currentPromptCacheTelemetry: vi.fn(() => ({ status: "unknown" })),
    completePromptCacheTelemetryIfPending: vi.fn(() => []),
    finishCurrentThinkingMessage: vi.fn(),
    suppressAssistantMessagesExceptCurrent: vi.fn(),
    suppressCurrentThinkingMessage: vi.fn(),
  } as unknown as RuntimeAssistantMessageController;
}

function toolMessages(size = 0): RuntimeToolMessageController {
  return {
    size: vi.fn(() => size),
  } as unknown as RuntimeToolMessageController;
}

function queuedMessages(hasQueued = false): RuntimeQueuedMessageController {
  return {
    hasQueuedOrSentInput: vi.fn(() => hasQueued),
  } as unknown as RuntimeQueuedMessageController;
}

function failureRuntimeMessages(): RuntimeAssistantMessageController {
  return {
    currentAssistantMessageId: vi.fn(() => "assistant-1"),
    currentMessageContent: vi.fn((_, fallback) => fallback),
    currentPromptCacheTelemetry: vi.fn(() => ({ status: "unknown" })),
    completePromptCacheTelemetryIfPending: vi.fn(() => []),
    finishCurrentThinkingMessage: vi.fn(),
    suppressAssistantMessagesExceptCurrent: vi.fn(),
    suppressCurrentThinkingMessage: vi.fn(),
    replaceCurrentAssistant: vi.fn((content: string, metadata?: Record<string, unknown>) =>
      message({ id: "assistant-1", content, metadata })),
  } as unknown as RuntimeAssistantMessageController;
}

function failureToolMessages(): RuntimeToolMessageController {
  return {
    size: vi.fn(() => 1),
    messageId: vi.fn(() => "tool-message-1"),
    inputContent: vi.fn(() => "{\"path\":\"long.md\"}"),
    longformInputPreview: vi.fn(() => undefined),
    editInputPreview: vi.fn(() => undefined),
  } as unknown as RuntimeToolMessageController;
}

function interruptedRecoverySnapshot(): InterruptedToolCallRecoverySnapshot {
  return {
    version: 1,
    status: "recoverable",
    runId: "run-1",
    toolCallId: "call-write",
    toolName: "write",
    source: "raw_tool_input",
    thresholdChars: 16_000,
    capturedChars: 20_000,
    observedArgumentChars: 20_000,
    updatedAt: createdAt,
    argumentPath: "/workspace/.ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt",
    workspaceRelativeArgumentPath: ".ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt",
    argumentSha256: "abc123",
    parseStatus: "valid_json",
    suffixPreview: "{\"path\":\"long.md\"",
    writeTargetPath: "long.md",
    writeContentPrefixChars: 12_000,
    writeContentPrefixPreview: "section\nsection\n",
    resumeInstruction: "Continue the interrupted write argument.",
  };
}

function controllerOptions(overrides: Partial<AgentRuntimePromptOutcomeControllerOptions> = {}) {
  const options: AgentRuntimePromptOutcomeControllerOptions = {
    getThread: vi.fn(() => thread()),
    updateThreadSettings: vi.fn((_threadId, settings) => thread(settings)),
    replaceMessage: vi.fn(() => message()),
    commitThreadPiSessionFile: vi.fn(async () => thread()),
    recordContextUsageSnapshot: vi.fn(),
    createPlannerPlanArtifactFromMessage: vi.fn(async () => undefined),
    resolveSubagentFinalizationBlock: vi.fn(() => undefined),
    resolveCallableWorkflowFinalizationBlock: vi.fn(() => undefined),
    recordSubagentFinalizationBlockedParentMailbox: vi.fn(() => []),
    recordCallableWorkflowFinalizationBlockedParentMailbox: vi.fn(),
    suppressCallableWorkflowParentAssistantMessages: vi.fn(),
    recordVoiceDispatch: vi.fn(),
    clearActiveRun: vi.fn(),
    clearActiveRunId: vi.fn(),
    clearPermissionWaitControl: vi.fn(),
    clearWorkflowPlanEditIntent: vi.fn(),
    takePendingProjectSwitch: vi.fn(() => undefined),
    updateRuntimeEvent: vi.fn(),
    scheduleProjectSwitchCompletion: vi.fn(),
    getRunRecord: vi.fn(() => ({ status: "done" as const })),
    accountFinishedGoalRun: vi.fn(() => undefined),
    scheduleGoalContinuation: vi.fn(),
    schedulePlannerDurableRepairFollowUp: vi.fn(),
    send: vi.fn(async () => undefined),
    emitError: vi.fn(),
    ...overrides,
  };
  return options;
}

describe("AgentRuntimePromptOutcomeController", () => {
  it("routes prompt failure recovery through runtime callbacks", async () => {
    const options = controllerOptions({
      replaceMessage: vi.fn((messageId, content, metadata) => message({
        id: messageId,
        role: "tool",
        content,
        metadata,
      })),
    });
    const recoveryFollowUp = followUp("recover interrupted write");
    const createInterruptedToolCallRecoveryInput = vi.fn(() => recoveryFollowUp);
    const setPendingInterruptedToolCallRecoveryFollowUp = vi.fn();
    const snapshot = interruptedRecoverySnapshot();
    const symphonyParentModePolicy = {
      enabled: true,
      reason: "symphony-composer-run-once",
      launchRequirement: "required_this_turn",
      directExecutionPolicy: "deny_substantive_tools",
      expectedWorkflowToolName: "ambient_workflow_symphony_map_reduce",
      expectedWorkflowSourceKind: "symphony_recipe",
      expectedPatternId: "map_reduce",
    } as const;
    const symphonyParentModeVerifiedLaunch = {
      parentThreadId: "thread-1",
      parentRunId: "run-1",
      taskId: "task-1",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
    };

    await new AgentRuntimePromptOutcomeController(options).handlePromptFailure({
      error: new Error("Ambient/Pi stream stalled after 30000 ms without stream activity."),
      sendInput: followUp("user request"),
      runId: "run-1",
      runWorkspacePath: "/workspace",
      usesDedicatedReviewSession: false,
      assistantFinalizationRetryMaxRetries: 3,
      interruptedToolCallRecoveryAttemptsUsed: 0,
      interruptedToolCallRecoveryMaxRetries: 2,
      canScheduleInterruptedToolCallRecovery: true,
      pendingEmptyResponseRetryDelayMs: 0,
      retrySourceUserMessageId: "user-1",
      runtimeMessages: failureRuntimeMessages(),
      toolMessages: failureToolMessages(),
      toolArgumentProgress: { current: vi.fn(() => undefined) },
      interruptedToolCallRecovery: { recoverable: vi.fn(() => [snapshot]) },
      startedToolCallIds: new Set(),
      abortRequested: vi.fn(() => false),
      streamWatchdogTimedOut: vi.fn(() => true),
      currentPiStreamFailureKind: vi.fn(() => streamIdleTimeoutKind),
      currentAssistantFinalText: vi.fn(() => ""),
      currentThinkingFinalText: vi.fn(() => "thinking"),
      receivedAnyText: vi.fn(() => false),
      subagentParentControlAbortIntent: vi.fn(() => undefined),
      isRunStoreActive: vi.fn(() => true),
      consumeSubagentParentControlAbort: vi.fn(async () => undefined),
      persistPiStreamTrace: vi.fn(),
      canScheduleAssistantFinalizationRetryFor: vi.fn(() => false),
      assistantFinalizationRetryAttemptsUsedFor: vi.fn(() => 0),
      assistantFinalizationRetryNextAttemptFor: vi.fn(() => 1),
      sessionRecoveryForCurrentSession: vi.fn((kind, reason, providerContinuationStateId) => ({
        kind,
        reason,
        ...(providerContinuationStateId ? { providerContinuationStateId } : {}),
      })),
      createAssistantFinalizationRetryInput: vi.fn(() => followUp("retry")),
      createInterruptedToolCallRecoveryInput,
      collectOpenProviderInterruptionToolSnapshots: vi.fn(() => []),
      createProviderContinuationState: vi.fn(() => ({ stateId: "state-1" }) as ProviderContinuationState),
      persistProviderContinuationState: vi.fn((state) => state),
      persistCurrentSessionPointerForRetry: vi.fn(async () => undefined),
      createProviderInterruptionContinuationInput: vi.fn(() => followUp("continue")),
      setPendingEmptyResponseRetry: vi.fn(),
      setPendingInterruptedToolCallRecoveryFollowUp,
      setPendingProviderInterruptionContinuation: vi.fn(),
      providerRetryAttemptCount: vi.fn(() => 0),
      setProviderRetryAttemptCount: vi.fn(),
      setProviderRetryLastError: vi.fn(),
      cleanupCurrentSession: vi.fn(),
      markOpenToolMessagesFailed: vi.fn(),
      persistToolArgumentDiagnostics: vi.fn(),
      finishPlannerFinalizationSources: vi.fn(),
      finishParentRun: vi.fn(),
      getThread: vi.fn(() => thread()),
      symphonyParentModePolicy,
      symphonyParentModeVerifiedLaunch,
      chatStreamInterruptionDiagnostic: vi.fn((text) => ({
        kind: streamIdleTimeoutKind,
        message: text,
        retryScheduled: false,
        replaySafe: false,
        runStartedAt: createdAt,
        semanticOutputSeen: false,
        toolCallSeen: true,
        assistantOutputChars: 0,
        thinkingOutputChars: 0,
        toolMessageCount: 1,
        currentAssistantFinalTextChars: 0,
        streamEventCount: 1,
      })),
      chatStreamInterruptionNotice: vi.fn((text) => `interrupted: ${text}`),
      emitRunEvent: vi.fn(),
    } satisfies HandleAgentRuntimePromptFailureInput);

    expect(createInterruptedToolCallRecoveryInput).toHaveBeenCalledWith([snapshot]);
    expect(setPendingInterruptedToolCallRecoveryFollowUp).toHaveBeenCalledWith(expect.objectContaining({
      symphonyParentModePolicy,
      symphonyParentModeVerifiedLaunch,
    }));
    expect(options.replaceMessage).toHaveBeenCalledWith(
      "tool-message-1",
      expect.stringContaining("Stream interrupted before execution."),
      expect.objectContaining({ status: "error", toolCallId: "call-write" }),
    );
  });

  it("routes prompt success through runtime callbacks", async () => {
    const options = controllerOptions();
    const runtimeMessageController = runtimeMessages();
    const cleanupCurrentSession = vi.fn();

    const result = await new AgentRuntimePromptOutcomeController(options).handlePromptSuccess({
      sendInput: followUp("user request"),
      runId: "run-1",
      runWorkspacePath: "/workspace",
      startedInPlannerMode: true,
      session: { sessionFile: "/tmp/current-session.jsonl" },
      runtimeMessages: runtimeMessageController,
      toolMessages: toolMessages(),
      plannerFinalizationSources: [],
      abortRequested: false,
      finalizedAfterToolIdle: false,
      currentThinkingFinalText: "thinking",
      currentAssistantFinalText: "Final answer",
      receivedAnyText: true,
      pendingEmptyResponseRetryDelayMs: 0,
      retrySourceUserMessageId: "user-1",
      providerRetryBeforeVisibleOutput: false,
      providerRetryRecovered: false,
      providerRetryAttemptCount: 0,
      usesDedicatedReviewSession: false,
      assistantFinalizationRetryMaxRetries: 3,
      canScheduleAssistantFinalizationRetryFor: vi.fn(() => true),
      assistantFinalizationRetryAttemptsUsedFor: vi.fn(() => 0),
      assistantFinalizationRetryNextAttemptFor: vi.fn(() => 1),
      createAssistantFinalizationRetryInput: vi.fn(() => followUp("retry")),
      consumeSubagentParentControlAbort: vi.fn(async () => undefined),
      cleanupCurrentSession,
      finishPlannerFinalizationSources: vi.fn(),
      finishParentRun: vi.fn(),
      emitRunEvent: vi.fn(),
    });

    expect(options.recordContextUsageSnapshot).toHaveBeenCalledWith("thread-1", {
      sessionFile: "/tmp/current-session.jsonl",
    });
    expect(options.commitThreadPiSessionFile).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      sessionFile: "/tmp/current-session.jsonl",
      currentPiSessionFile: "/tmp/old-session.jsonl",
      reason: "run-finished",
    }));
    expect(runtimeMessageController.finishCurrentThinkingMessage).toHaveBeenCalledWith("done", "thinking");
    expect(runtimeMessageController.suppressAssistantMessagesExceptCurrent).not.toHaveBeenCalled();
    expect(runtimeMessageController.suppressCurrentThinkingMessage).not.toHaveBeenCalled();
    expect(options.replaceMessage).toHaveBeenCalledWith(
      "assistant-1",
      "Final answer",
      expect.objectContaining({ status: "done", runtime: "pi" }),
    );
    expect(options.createPlannerPlanArtifactFromMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "assistant-1" }),
      { startedInPlannerMode: true },
    );
    expect(cleanupCurrentSession).not.toHaveBeenCalled();
    expect(result.pendingEmptyResponseRetry).toBeUndefined();
  });

  it("routes after-run cleanup and queue state through runtime callbacks", async () => {
    const options = controllerOptions();
    const toolArgumentWatchdog = { clear: vi.fn() };
    const toolExecutionWatchdog = { clear: vi.fn() };
    const cleanupCurrentSession = vi.fn();
    const resolveActiveRunSettled = vi.fn();
    const emitRunEvent = vi.fn();

    await new AgentRuntimePromptOutcomeController(options).finalizeSendAfterRun({
      sendInput: followUp("user request"),
      hooks: {},
      runId: "run-1",
      runWorkspacePath: "/workspace",
      runGoalStartedAtMs: 100,
      promptContent: "prompt",
      currentAssistantFinalText: "Final answer",
      assistantOutputChars: 0,
      currentThinkingFinalText: "thinking",
      thinkingOutputChars: 0,
      abortRequested: false,
      pendingEmptyResponseRetryDelayMs: 0,
      usesDedicatedReviewSession: true,
      session: { sessionFile: "/tmp/current-session.jsonl" },
      hasWorkflowPlanEditIntent: true,
      isRunStoreActive: vi.fn(() => true),
      cleanupCurrentSession,
      emitRunEvent,
      toolArgumentWatchdog: toolArgumentWatchdog as never,
      toolExecutionWatchdog: toolExecutionWatchdog as never,
      queuedMessages: queuedMessages(),
      toolMessages: toolMessages(),
      resolveActiveRunSettled,
    });

    expect(options.clearActiveRun).toHaveBeenCalledWith("thread-1");
    expect(options.clearActiveRunId).toHaveBeenCalledWith("thread-1");
    expect(options.clearPermissionWaitControl).toHaveBeenCalledWith("thread-1");
    expect(options.clearWorkflowPlanEditIntent).toHaveBeenCalledWith("thread-1");
    expect(toolArgumentWatchdog.clear).toHaveBeenCalledTimes(1);
    expect(toolExecutionWatchdog.clear).toHaveBeenCalledTimes(1);
    expect(cleanupCurrentSession).toHaveBeenCalledTimes(1);
    expect(emitRunEvent).toHaveBeenCalledWith({
      type: "queue-updated",
      queue: { threadId: "thread-1", steering: [], followUp: [] },
    });
    expect(resolveActiveRunSettled).toHaveBeenCalledTimes(1);
  });
});
