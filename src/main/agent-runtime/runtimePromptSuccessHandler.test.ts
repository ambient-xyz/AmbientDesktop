import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import {
  handleRuntimePromptSuccess,
  type RuntimePromptSuccessHandlerInput,
} from "./runtimePromptSuccessHandler";
import {
  CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
  CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
  type CallableWorkflowParentBlockingBlock,
} from "./agentRuntimeCallableWorkflowFacade";
import type { SubagentFinalizationBarrierBlock } from "./agentRuntimeFinalizationBlocking";

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

function callableWorkflowBlock(): CallableWorkflowParentBlockingBlock {
  return {
    schemaVersion: CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
    reason: CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
    message: "Workflow task is still running.",
    instruction: "Wait for workflow completion.",
    synthesisAllowed: false,
    parentFinalizationBlocked: true,
    taskIds: ["task-1"],
    launchIds: ["launch-1"],
    workflowArtifactIds: [],
    workflowRunIds: [],
    waitingTaskIds: ["task-1"],
    attentionTaskIds: [],
    tasks: [{
      id: "task-1",
      launchId: "launch-1",
      parentThreadId: "thread-1",
      parentRunId: "run-1",
      toolCallId: "tool-1",
      toolId: "tool-1",
      toolName: "ambient_workflow_symphony_imitate_and_verify",
      sourceKind: "symphony_recipe",
      title: "Imitate and Verify",
      status: "running",
      statusLabel: "Running",
      statusGroup: "waiting_on_workflow",
      blocking: true,
      runnerTarget: "workflow",
      runnerDeferredReason: "running",
      createdAt,
      updatedAt: createdAt,
    }],
  };
}

function subagentBlock(): SubagentFinalizationBarrierBlock {
  return {
    message: "A required child is still running.",
    barrierIds: ["barrier-1"],
    childRunIds: ["child-run-1"],
    childBlockers: [{
      childRunId: "child-run-1",
      childThreadId: "child-thread-1",
      canonicalTaskPath: "root/1:reviewer",
      roleId: "reviewer",
      status: "running",
      dependencyMode: "required_all",
      barrierIds: ["barrier-1"],
      lastActivityAt: createdAt,
      lastActivitySource: "run_event:assistant_delta",
    }],
    barriers: [{
      id: "barrier-1",
      dependencyMode: "required_all",
      status: "waiting_on_children",
      failurePolicy: "fail_parent",
      childRunIds: ["child-run-1"],
      childBlockers: [{
        childRunId: "child-run-1",
        childThreadId: "child-thread-1",
        canonicalTaskPath: "root/1:reviewer",
        roleId: "reviewer",
        status: "running",
        dependencyMode: "required_all",
        barrierIds: ["barrier-1"],
        lastActivityAt: createdAt,
        lastActivitySource: "run_event:assistant_delta",
      }],
    }],
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
    suppressAssistantMessagesExceptCurrent: vi.fn(),
    suppressCurrentThinkingMessage: vi.fn(),
    suppressCallableWorkflowParentAssistantMessages: vi.fn(),
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

  it("suppresses parent thinking and assistant text for unresolved callable workflow blockers", async () => {
    const block = callableWorkflowBlock();
    const input = baseInput({
      currentThinkingFinalText: "The callable workflow has launched, so I should explain it.",
      currentAssistantVisibleContent: "Premature launch explanation.",
      resolveCallableWorkflowFinalizationBlock: vi.fn(() => block),
      recordCallableWorkflowFinalizationBlockedParentMailbox: vi.fn(() => ({ id: "mailbox-1" } as any)),
    });

    await handleRuntimePromptSuccess(input);

    expect(input.finishCurrentThinkingMessage).toHaveBeenCalledWith(
      "done",
      "The callable workflow has launched, so I should explain it.",
    );
    expect(input.suppressAssistantMessagesExceptCurrent).toHaveBeenCalledWith("error");
    expect(input.suppressCurrentThinkingMessage).toHaveBeenCalledWith("done");
    expect(input.suppressCallableWorkflowParentAssistantMessages).toHaveBeenCalledWith(block, {
      preserveMessageId: "assistant-1",
    });
    expect(input.events).toContainEqual({
      type: "thread-updated",
      thread: { id: "thread-1" },
    });
    expect(input.replaceAssistantMessage).toHaveBeenCalledWith(
      "assistant-1",
      "",
      expect.objectContaining({
        status: "error",
        callableWorkflowFinalizationBlocked: expect.objectContaining({
          taskIds: ["task-1"],
          parentMailboxEventId: "mailbox-1",
        }),
      }),
    );
  });

  it("blocks empty post-workflow responses instead of scheduling empty-response retry", async () => {
    const block = callableWorkflowBlock();
    const retry = followUp("empty retry");
    const input = baseInput({
      currentThinkingFinalText: "Workflow launched; no chat response needed.",
      currentAssistantFinalText: "",
      currentAssistantVisibleContent: "",
      receivedAnyText: false,
      createEmptyAssistantRetry: vi.fn(() => retry),
      resolveCallableWorkflowFinalizationBlock: vi.fn(() => block),
      recordCallableWorkflowFinalizationBlockedParentMailbox: vi.fn(() => ({ id: "mailbox-1" } as any)),
    });

    const result = await handleRuntimePromptSuccess(input);

    expect(input.createEmptyAssistantRetry).not.toHaveBeenCalled();
    expect(input.suppressAssistantMessagesExceptCurrent).toHaveBeenCalledWith("error");
    expect(input.suppressCurrentThinkingMessage).toHaveBeenCalledWith("done");
    expect(input.suppressCallableWorkflowParentAssistantMessages).toHaveBeenCalledWith(block, {
      preserveMessageId: "assistant-1",
    });
    expect(input.replaceAssistantMessage).toHaveBeenCalledWith(
      "assistant-1",
      "",
      expect.objectContaining({
        status: "error",
        callableWorkflowFinalizationBlocked: expect.objectContaining({
          taskIds: ["task-1"],
          parentMailboxEventId: "mailbox-1",
        }),
      }),
    );
    const metadata = vi.mocked(input.replaceAssistantMessage).mock.calls.at(-1)?.[2] ?? {};
    expect(metadata).not.toHaveProperty("piEmptyAssistantResponse");
    expect(metadata).not.toHaveProperty("retryingEmptyAssistantResponse");
    expect(result.pendingEmptyResponseRetry).toBeUndefined();
  });

  it("suppresses parent thinking for mixed callable workflow and subagent blockers", async () => {
    const workflowBlock = callableWorkflowBlock();
    const childBlock = subagentBlock();
    const input = baseInput({
      currentThinkingFinalText: "The workflow and child are both blocked, so I should explain.",
      currentAssistantVisibleContent: "Premature mixed blocker explanation.",
      resolveSubagentFinalizationBlock: vi.fn(() => childBlock),
      resolveCallableWorkflowFinalizationBlock: vi.fn(() => workflowBlock),
      recordSubagentFinalizationBlockedParentMailbox: vi.fn(() => [{ id: "subagent-mailbox-1" } as any]),
      recordCallableWorkflowFinalizationBlockedParentMailbox: vi.fn(() => ({ id: "workflow-mailbox-1" } as any)),
    });

    await handleRuntimePromptSuccess(input);

    expect(input.suppressCurrentThinkingMessage).toHaveBeenCalledWith("done");
    expect(input.suppressAssistantMessagesExceptCurrent).toHaveBeenCalledWith("error");
    expect(input.suppressCallableWorkflowParentAssistantMessages).toHaveBeenCalledWith(workflowBlock, {
      preserveMessageId: "assistant-1",
    });
    expect(input.replaceAssistantMessage).toHaveBeenCalledWith(
      "assistant-1",
      "",
      expect.objectContaining({
        status: "error",
        subagentFinalizationBlocked: expect.objectContaining({
          parentMailboxEventIds: ["subagent-mailbox-1"],
        }),
        callableWorkflowFinalizationBlocked: expect.objectContaining({
          parentMailboxEventId: "workflow-mailbox-1",
        }),
      }),
    );
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
