import { describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  DesktopEvent,
  PlannerPlanArtifact,
  SubagentParentMailboxEventSummary,
  ThreadSummary,
} from "../../shared/types";
import type { SubagentFinalizationBarrierBlock } from "../agent-runtime/agentRuntimeFinalizationBlocking";
import {
  finalizeSuccessfulRuntimeRun,
  type RuntimeSuccessfulRunFinalizationInput,
} from "./runtimeSuccessfulRunFinalization";

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

function subagentBlock(): SubagentFinalizationBarrierBlock {
  return {
    message: "A required sub-agent result is still blocked.",
    barrierIds: ["barrier-1"],
    childRunIds: ["child-run-1"],
    childBlockers: [{
      childRunId: "child-run-1",
      childThreadId: "child-thread-1",
      canonicalTaskPath: "root/1:explorer",
      roleId: "explorer",
      status: "running",
      dependencyMode: "required_all",
      barrierIds: ["barrier-1"],
      lastActivityAt: "2026-06-15T00:00:01.000Z",
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
        canonicalTaskPath: "root/1:explorer",
        roleId: "explorer",
        status: "running",
        dependencyMode: "required_all",
        barrierIds: ["barrier-1"],
        lastActivityAt: "2026-06-15T00:00:01.000Z",
        lastActivitySource: "run_event:assistant_delta",
      }],
    }],
  };
}

function baseInput(
  overrides: Partial<RuntimeSuccessfulRunFinalizationInput> = {},
): RuntimeSuccessfulRunFinalizationInput & { emitted: DesktopEvent[] } {
  const emitted: DesktopEvent[] = [];
  const finalMessage = message();
  const input: RuntimeSuccessfulRunFinalizationInput & { emitted: DesktopEvent[] } = {
    threadId: "thread-1",
    runId: "run-1",
    workspacePath: "/workspace",
    currentAssistantMessageId: "assistant-1",
    currentAssistantVisibleContent: "Final answer",
    abortRequested: false,
    abortMessage: "Run stopped.",
    receivedAnyText: true,
    finalizedAfterToolIdle: false,
    awaitingInputAfterTools: false,
    emptyAssistantResponse: false,
    retryEmptyAssistantResponse: false,
    emptyResponseText: "",
    assistantTerminalCleanupInterrupted: false,
    providerRetryBeforeVisibleOutput: false,
    providerRetryRecovered: false,
    providerRetryAttemptCount: 0,
    discardProviderRetrySession: false,
    hasPlannerFinalizationSources: false,
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
    emitRunEvent: vi.fn((event: DesktopEvent) => {
      emitted.push(event);
    }),
    emitted,
    ...overrides,
  };
  return input;
}

describe("finalizeSuccessfulRuntimeRun", () => {
  it("persists a successful final assistant message and planner artifact events", async () => {
    const plannerMessage = message({ id: "assistant-planner", content: "Planner final" });
    const artifact = plannerArtifact();
    const relatedArtifact = plannerArtifact({ id: "artifact-related" });
    const input = baseInput({
      createPlannerPlanArtifactFromMessage: vi.fn(async () => ({
        message: plannerMessage,
        artifact,
        relatedArtifacts: [relatedArtifact],
        repairPrompt: "Please repair the durable plan.",
        eventType: "created" as const,
      })),
    });

    const result = await finalizeSuccessfulRuntimeRun(input);

    expect(input.replaceAssistantMessage).toHaveBeenCalledWith(
      "assistant-1",
      "Final answer",
      expect.objectContaining({ status: "done", runtime: "pi", provider: "ambient" }),
    );
    expect(input.finishParentRun).toHaveBeenCalledWith("done", undefined);
    expect(input.finishPlannerFinalizationSources).not.toHaveBeenCalled();
    expect(input.recordVoiceDispatch).toHaveBeenCalledWith(plannerMessage);
    expect(result.visibleFinalMessage).toBe(plannerMessage);
    expect(result.plannerRepairPrompt).toBe("Please repair the durable plan.");
    expect(input.emitted).toEqual(expect.arrayContaining([
      { type: "planner-plan-artifact-updated", artifact: relatedArtifact },
      { type: "planner-plan-artifact-created", artifact },
      { type: "message-updated", message: plannerMessage },
      { type: "run-status", threadId: "thread-1", status: "idle" },
    ]));
  });

  it("blocks parent finalization without planner or voice side effects", async () => {
    const block = subagentBlock();
    const mailboxEvent = { id: "mailbox-1" } as SubagentParentMailboxEventSummary;
    const input = baseInput({
      resolveSubagentFinalizationBlock: vi.fn(() => block),
      recordSubagentFinalizationBlockedParentMailbox: vi.fn(() => [mailboxEvent]),
    });

    const result = await finalizeSuccessfulRuntimeRun(input);

    expect(input.createPlannerPlanArtifactFromMessage).not.toHaveBeenCalled();
    expect(input.recordVoiceDispatch).not.toHaveBeenCalled();
    expect(input.finishPlannerFinalizationSources).toHaveBeenCalledWith("failed", {
      error: block.message,
      workflowState: "failed",
    });
    expect(input.finishParentRun).toHaveBeenCalledWith("error", block.message);
    expect(input.replaceAssistantMessage).toHaveBeenCalledWith(
      "assistant-1",
      block.message,
      expect.objectContaining({
        status: "error",
        subagentFinalizationBlocked: expect.objectContaining({
          parentMailboxEventIds: ["mailbox-1"],
        }),
      }),
    );
    expect(result.parentFinalizationBlocked).toBe(true);
    expect(input.emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "runtime-activity" }),
      { type: "run-status", threadId: "thread-1", status: "error" },
      { type: "error", message: block.message, threadId: "thread-1", workspacePath: "/workspace" },
    ]));
  });

  it("keeps empty assistant retries successful while suppressing planner and voice work", async () => {
    const input = baseInput({
      currentAssistantVisibleContent: "",
      receivedAnyText: false,
      emptyAssistantResponse: true,
      retryEmptyAssistantResponse: true,
      emptyResponseText: "Ambient/Pi returned no assistant text. Retrying.",
      emptyAssistantResponseMetadata: {
        retryScheduled: true,
        retryUsesFreshSession: true,
        retryAttempt: 1,
        maxRetries: 2,
        retryReason: "empty_assistant_response",
        retryDelayMs: 250,
        receivedAnyText: false,
        currentAssistantFinalTextChars: 0,
      },
    });

    const result = await finalizeSuccessfulRuntimeRun(input);

    expect(input.createPlannerPlanArtifactFromMessage).not.toHaveBeenCalled();
    expect(input.recordVoiceDispatch).not.toHaveBeenCalled();
    expect(input.finishParentRun).toHaveBeenCalledWith("done", undefined);
    expect(input.replaceAssistantMessage).toHaveBeenCalledWith(
      "assistant-1",
      "Ambient/Pi returned no assistant text. Retrying.",
      expect.objectContaining({
        status: "done",
        piEmptyAssistantResponse: expect.objectContaining({ retryScheduled: true }),
        retryingEmptyAssistantResponse: true,
      }),
    );
    expect(result.finalStatus).toBe("done");
  });
});
