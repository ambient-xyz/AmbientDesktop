import { describe, expect, it, vi } from "vitest";
import type {
  DesktopEvent,
  InterruptedToolCallRecoverySnapshot,
  SendMessageInput,
} from "../../shared/types";
import { createRuntimeAssistantRetryPlanning } from "./runtimeAssistantRetryPlanning";

function sendInput(overrides: Partial<SendMessageInput> = {}): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "Original prompt",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-preview",
    thinkingLevel: "medium",
    delivery: "prompt",
    context: [{ kind: "file", path: "README.md", name: "README.md" }],
    ...overrides,
  };
}

function snapshot(overrides: Partial<InterruptedToolCallRecoverySnapshot> = {}): InterruptedToolCallRecoverySnapshot {
  return {
    version: 1,
    status: "recoverable",
    runId: "run-1",
    toolCallId: "tool-1",
    toolName: "shell",
    source: "visible_tool_input",
    thresholdChars: 5,
    capturedChars: 10,
    observedArgumentChars: 10,
    updatedAt: "2026-06-15T00:00:01.000Z",
    argumentPath: "/workspace/.ambient-codex/interrupted-tool-calls/run-1/tool-1.partial-args.txt",
    workspaceRelativeArgumentPath: ".ambient-codex/interrupted-tool-calls/run-1/tool-1.partial-args.txt",
    argumentSha256: "tool-1-sha",
    parseStatus: "text",
    suffixPreview: "echo hello",
    resumeInstruction: "Use recovery_read_interrupted_tool_call before retrying the tool.",
    ...overrides,
  };
}

function planner(overrides: Partial<Parameters<typeof createRuntimeAssistantRetryPlanning>[0]> = {}) {
  return createRuntimeAssistantRetryPlanning({
    baseInput: sendInput(),
    threadId: "thread-1",
    usesDedicatedReviewSession: false,
    activeAssistantFinalizationRetry: undefined,
    assistantFinalizationRetryMaxRetries: 3,
    retrySourceUserMessageId: "user-1",
    interruptedToolCallRecoveryAttemptsUsed: 1,
    interruptedToolCallRecoveryMaxRetries: 4,
    getPermissionMode: () => "workspace",
    getCurrentSessionFile: () => "/tmp/pi-session.json",
    getCurrentThreadPiSessionFile: () => null,
    commitThreadPiSessionFile: vi.fn(),
    emit: vi.fn(),
    fileExists: () => true,
    ...overrides,
  });
}

describe("createRuntimeAssistantRetryPlanning", () => {
  it("tracks retry attempts, next attempts, and schedule eligibility", () => {
    const retryPlanning = planner({
      activeAssistantFinalizationRetry: {
        sourceUserMessageId: "user-1",
        attempt: 5,
        maxRetries: 5,
        reason: "provider_interruption_continuation",
        recoveryStateId: "state-1",
      },
      assistantFinalizationRetryMaxRetries: 3,
    });

    expect(retryPlanning.assistantFinalizationRetryAttemptsUsedFor("provider_interruption_continuation", "state-1")).toBe(3);
    expect(retryPlanning.assistantFinalizationRetryNextAttemptFor("provider_interruption_continuation", "state-1")).toBe(4);
    expect(retryPlanning.canScheduleAssistantFinalizationRetryFor("provider_interruption_continuation", "state-1")).toBe(false);
    expect(retryPlanning.assistantFinalizationRetryAttemptsUsedFor("provider_interruption_continuation", "state-2")).toBe(0);
    expect(retryPlanning.canScheduleAssistantFinalizationRetryFor("empty_assistant_response")).toBe(true);
  });

  it("blocks scheduling when there is no retry source user message", () => {
    const retryPlanning = planner({ retrySourceUserMessageId: undefined });

    expect(retryPlanning.assistantFinalizationRetryNextAttemptFor("empty_assistant_response")).toBe(1);
    expect(retryPlanning.canScheduleAssistantFinalizationRetryFor("empty_assistant_response")).toBe(false);
  });

  it("builds session recovery from the current session file", () => {
    const retryPlanning = planner({
      getCurrentSessionFile: () => "/tmp/current-session.json",
      fileExists: (path) => path === "/tmp/current-session.json",
    });

    expect(retryPlanning.sessionRecoveryForCurrentSession(
      "provider_interruption_continuation",
      "Continuing with the same session.",
      "state-1",
    )).toEqual({
      kind: "provider_interruption_continuation",
      reason: "Continuing with the same session.",
      previousSessionFile: "/tmp/current-session.json",
      previousSessionFileExists: true,
      providerContinuationStateId: "state-1",
    });
  });

  it("persists a changed current session pointer for retry", async () => {
    const commitThreadPiSessionFile = vi.fn(async () => undefined);
    const emit = vi.fn((event: DesktopEvent) => event);
    const retryPlanning = planner({
      getCurrentSessionFile: () => "/tmp/new-session.json",
      getCurrentThreadPiSessionFile: () => "/tmp/old-session.json",
      commitThreadPiSessionFile,
      emit,
    });

    await retryPlanning.persistCurrentSessionPointerForRetry("provider-continuation");

    expect(commitThreadPiSessionFile).toHaveBeenCalledWith({
      threadId: "thread-1",
      sessionFile: "/tmp/new-session.json",
      currentPiSessionFile: "/tmp/old-session.json",
      reason: "provider-continuation",
      emit,
    });
  });

  it("skips session pointer persistence for dedicated sessions, missing sessions, and unchanged pointers", async () => {
    const commitThreadPiSessionFile = vi.fn(async () => undefined);

    await planner({
      usesDedicatedReviewSession: true,
      commitThreadPiSessionFile,
    }).persistCurrentSessionPointerForRetry("provider-continuation");
    await planner({
      getCurrentSessionFile: () => undefined,
      commitThreadPiSessionFile,
    }).persistCurrentSessionPointerForRetry("provider-continuation");
    await planner({
      getCurrentSessionFile: () => "/tmp/session.json",
      getCurrentThreadPiSessionFile: () => "/tmp/session.json",
      commitThreadPiSessionFile,
    }).persistCurrentSessionPointerForRetry("provider-continuation");

    expect(commitThreadPiSessionFile).not.toHaveBeenCalled();
  });

  it("creates assistant finalization retry input with next attempt and recovery metadata", () => {
    const retryPlanning = planner({
      getPermissionMode: () => "full-access",
      activeAssistantFinalizationRetry: {
        sourceUserMessageId: "user-1",
        attempt: 1,
        maxRetries: 3,
        reason: "pre_output_stream_stall",
      },
    });
    const sessionRecovery = retryPlanning.sessionRecoveryForCurrentSession(
      "fresh_session_after_pre_output_stream_stall",
      "Retry with a fresh session.",
    );

    expect(retryPlanning.createAssistantFinalizationRetryInput(
      "pre_output_stream_stall",
      sessionRecovery,
    )).toMatchObject({
      threadId: "thread-1",
      internal: true,
      permissionMode: "full-access",
      retryOfMessageId: "user-1",
      delivery: "prompt",
      preserveActiveThread: true,
      sessionRecovery,
      assistantFinalizationRetry: {
        sourceUserMessageId: "user-1",
        attempt: 2,
        maxRetries: 3,
        reason: "pre_output_stream_stall",
      },
    });
  });

  it("creates interrupted tool-call recovery follow-up input", () => {
    const retryPlanning = planner({
      interruptedToolCallRecoveryAttemptsUsed: 2,
      interruptedToolCallRecoveryMaxRetries: 5,
    });

    const result = retryPlanning.createInterruptedToolCallRecoveryInput([snapshot(), snapshot({ toolCallId: "tool-2" })]);

    expect(result).toMatchObject({
      threadId: "thread-1",
      delivery: "follow-up",
      internal: true,
      preserveActiveThread: true,
      visibleUserContent: "Continue the interrupted tool call from the saved partial arguments.",
      sessionRecovery: {
        kind: "interrupted_tool_call_recovery",
        previousSessionFile: "/tmp/pi-session.json",
      },
      interruptedToolCallRecovery: {
        attempt: 3,
        maxRetries: 5,
        sourceToolCallIds: ["tool-1", "tool-2"],
      },
    });
    expect(result.modelContentOverride).toContain("tool-1");
  });
});
