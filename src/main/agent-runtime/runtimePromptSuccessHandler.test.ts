import { describe, expect, it, vi } from "vitest";

import type {
  ChatMessage,
  DesktopEvent,
  PlannerPlanArtifact,
  SendMessageInput,
  ThreadSummary,
} from "../../shared/types";
import {
  handleRuntimePromptSuccess,
  type RuntimePromptSuccessHandlerInput,
} from "./runtimePromptSuccessHandler";

const createdAt = "2026-06-15T00:00:00.000Z";

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

function plannerArtifact(overrides: Partial<PlannerPlanArtifact> = {}): PlannerPlanArtifact {
  return {
    id: "artifact-1",
    threadId: "thread-1",
    sourceMessageId: "assistant-1",
    status: "ready",
    workflowState: "durable_ready",
    title: "Plan",
    summary: "Summary",
    content: "Steps",
    steps: [],
    openQuestions: [],
    risks: [],
    verification: [],
    decisionQuestions: [],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
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

function baseInput(
  overrides: Partial<RuntimePromptSuccessHandlerInput> = {},
): RuntimePromptSuccessHandlerInput & { events: DesktopEvent[] } {
  const events: DesktopEvent[] = [];
  const finalMessage = message();
  return {
    threadId: "thread-1",
    runId: "run-1",
    workspacePath: "/workspace",
    currentAssistantMessageId: "assistant-1",
    abortRequested: false,
    finalizedAfterToolIdle: false,
    currentThinkingFinalText: "thinking",
    currentAssistantFinalText: "Final answer",
    currentAssistantVisibleContent: "Final answer",
    receivedAnyText: true,
    activeToolMessageCount: 0,
    pendingEmptyResponseRetryDelayMs: 0,
    retrySourceUserMessageId: "user-1",
    sessionFile: "/tmp/current-session.jsonl",
    providerRetryBeforeVisibleOutput: false,
    providerRetryRecovered: false,
    providerRetryAttemptCount: 0,
    usesDedicatedReviewSession: false,
    currentThreadPiSessionFile: "/tmp/old-session.jsonl",
    hasPlannerFinalizationSources: false,
    assistantFinalizationRetryMaxRetries: 3,
    canScheduleEmptyAssistantRetry: true,
    emptyAssistantRetryAttemptsUsed: 0,
    emptyAssistantRetryNextAttempt: 1,
    consumeSubagentParentControlAbort: vi.fn(async () => undefined),
    finishCurrentThinkingMessage: vi.fn(),
    recordContextUsageSnapshot: vi.fn(),
    cleanupCurrentSession: vi.fn(),
    createEmptyAssistantRetry: vi.fn(() => followUp("empty retry")),
    clearThreadPiSessionFile: vi.fn(),
    commitThreadPiSessionFile: vi.fn(async () => undefined),
    createPlannerRepairFollowUp: vi.fn((prompt) => followUp(prompt)),
    resolveSubagentFinalizationBlock: vi.fn(() => undefined),
    resolveCallableWorkflowFinalizationBlock: vi.fn(() => undefined),
    recordSubagentFinalizationBlockedParentMailbox: vi.fn(() => []),
    recordCallableWorkflowFinalizationBlockedParentMailbox: vi.fn(),
    replaceAssistantMessage: vi.fn(() => finalMessage),
    createPlannerPlanArtifactFromMessage: vi.fn(async () => undefined),
    finishPlannerFinalizationSources: vi.fn(),
    finishParentRun: vi.fn(),
    recordVoiceDispatch: vi.fn(),
    getThread: vi.fn(() => ({ id: "thread-1" } as ThreadSummary)),
    emitRunEvent: vi.fn((event) => {
      events.push(event);
    }),
    events,
    ...overrides,
  };
}

describe("handleRuntimePromptSuccess", () => {
  it("commits changed session files and returns planner repair follow-ups after successful finalization", async () => {
    const plannerMessage = message({ id: "planner-message", content: "Planner final" });
    const input = baseInput({
      createPlannerPlanArtifactFromMessage: vi.fn(async () => ({
        message: plannerMessage,
        artifact: plannerArtifact(),
        eventType: "created" as const,
        repairPrompt: "Repair the durable plan.",
      })),
    });

    const result = await handleRuntimePromptSuccess(input);

    expect(input.consumeSubagentParentControlAbort).toHaveBeenCalledTimes(1);
    expect(input.finishCurrentThinkingMessage).toHaveBeenCalledWith("done", "thinking");
    expect(input.recordContextUsageSnapshot).toHaveBeenCalledTimes(1);
    expect(input.commitThreadPiSessionFile).toHaveBeenCalledWith({
      sessionFile: "/tmp/current-session.jsonl",
      currentPiSessionFile: "/tmp/old-session.jsonl",
      reason: "run-finished",
    });
    expect(input.clearThreadPiSessionFile).not.toHaveBeenCalled();
    expect(input.cleanupCurrentSession).not.toHaveBeenCalled();
    expect(input.replaceAssistantMessage).toHaveBeenCalledWith(
      "assistant-1",
      "Final answer",
      expect.objectContaining({ status: "done", runtime: "pi", provider: "ambient" }),
    );
    expect(input.finishParentRun).toHaveBeenCalledWith("done", undefined);
    expect(input.recordVoiceDispatch).toHaveBeenCalledWith(plannerMessage);
    expect(input.createPlannerRepairFollowUp).toHaveBeenCalledWith("Repair the durable plan.");
    expect(result.pendingPlannerRepairFollowUp).toMatchObject({ content: "Repair the durable plan." });
    expect(result.pendingEmptyResponseRetry).toBeUndefined();
  });

  it("schedules empty assistant retries, disposes the current session, and clears the persisted session pointer", async () => {
    const retry = followUp("retry after empty assistant");
    const input = baseInput({
      currentAssistantFinalText: "",
      currentAssistantVisibleContent: "",
      receivedAnyText: false,
      currentThreadPiSessionFile: "/tmp/current-session.jsonl",
      createEmptyAssistantRetry: vi.fn(() => retry),
    });

    const result = await handleRuntimePromptSuccess(input);

    expect(input.cleanupCurrentSession).toHaveBeenCalledTimes(1);
    expect(input.createEmptyAssistantRetry).toHaveBeenCalledTimes(1);
    expect(input.clearThreadPiSessionFile).toHaveBeenCalledTimes(1);
    expect(input.commitThreadPiSessionFile).not.toHaveBeenCalled();
    expect(input.replaceAssistantMessage).toHaveBeenCalledWith(
      "assistant-1",
      expect.stringContaining("Ambient/Pi returned no assistant text"),
      expect.objectContaining({
        status: "done",
        retryingEmptyAssistantResponse: true,
        piEmptyAssistantResponse: expect.objectContaining({
          retryScheduled: true,
          retryUsesFreshSession: true,
        }),
      }),
    );
    expect(input.recordVoiceDispatch).not.toHaveBeenCalled();
    expect(result).toEqual({
      pendingEmptyResponseRetry: retry,
      pendingPlannerRepairFollowUp: undefined,
    });
  });

  it("throws unfinalized runtime errors after parent-control abort consumption", async () => {
    const input = baseInput({
      runtimeError: "provider failed before finalization",
    });

    await expect(handleRuntimePromptSuccess(input)).rejects.toThrow("provider failed before finalization");
    expect(input.consumeSubagentParentControlAbort).toHaveBeenCalledTimes(1);
    expect(input.finishCurrentThinkingMessage).not.toHaveBeenCalled();
    expect(input.replaceAssistantMessage).not.toHaveBeenCalled();
  });
});
