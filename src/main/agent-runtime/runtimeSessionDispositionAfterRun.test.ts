import { describe, expect, it } from "vitest";
import {
  finalizeRuntimeSessionDispositionAfterRun,
  type RuntimeSessionDispositionAfterRunInput,
} from "./runtimeSessionDispositionAfterRun";

function baseInput(
  overrides: Partial<RuntimeSessionDispositionAfterRunInput> = {},
): RuntimeSessionDispositionAfterRunInput {
  return {
    abortRequested: false,
    finalizedAfterToolIdle: false,
    currentAssistantVisibleContent: "Visible answer",
    receivedAnyText: true,
    currentAssistantFinalTextChars: 14,
    activeToolMessageCount: 0,
    canScheduleEmptyAssistantRetry: true,
    emptyAssistantRetryAttemptsUsed: 0,
    emptyAssistantRetryNextAttempt: 1,
    maxRetries: 10,
    retryDelayMs: 250,
    retrySourceUserMessageId: "user-1",
    sessionFile: "/tmp/session.jsonl",
    providerRetryBeforeVisibleOutput: false,
    providerRetryRecovered: false,
    usesDedicatedReviewSession: false,
    currentThreadPiSessionFile: "/tmp/previous-session.jsonl",
    ...overrides,
  };
}

describe("finalizeRuntimeSessionDispositionAfterRun", () => {
  it("plans a fresh-session empty assistant retry and clears the persisted session pointer", () => {
    const result = finalizeRuntimeSessionDispositionAfterRun(baseInput({
      currentAssistantVisibleContent: "",
      receivedAnyText: false,
      currentAssistantFinalTextChars: 0,
      sessionFile: "/tmp/current-session.jsonl",
      currentThreadPiSessionFile: "/tmp/current-session.jsonl",
    }));

    expect(result.emptyAssistantResponse).toBe(true);
    expect(result.retryEmptyAssistantResponse).toBe(true);
    expect(result.shouldCreateEmptyResponseRetry).toBe(true);
    expect(result.shouldDisposeSessionForEmptyResponseRetry).toBe(true);
    expect(result.emptyResponseRetryUsesFreshSession).toBe(true);
    expect(result.discardSessionFileAfterRun).toBe("/tmp/current-session.jsonl");
    expect(result.sessionFileDisposition).toEqual({
      kind: "clear",
      sessionFile: "/tmp/current-session.jsonl",
    });
    expect(result.emptyAssistantFinalization.metadata).toMatchObject({
      retryScheduled: true,
      retryUsesFreshSession: true,
      retryAttempt: 1,
      maxRetries: 10,
      retryReason: "empty_assistant_response",
    });
  });

  it("plans provider retry session discard without scheduling an empty-response retry", () => {
    const result = finalizeRuntimeSessionDispositionAfterRun(baseInput({
      providerRetryBeforeVisibleOutput: true,
      providerRetryRecovered: true,
      sessionFile: "/tmp/provider-retry-session.jsonl",
      currentThreadPiSessionFile: "/tmp/provider-retry-session.jsonl",
    }));

    expect(result.emptyAssistantResponse).toBe(false);
    expect(result.shouldCreateEmptyResponseRetry).toBe(false);
    expect(result.discardProviderRetrySession).toBe(true);
    expect(result.shouldDisposeSessionForProviderRetry).toBe(true);
    expect(result.discardSessionFileAfterRun).toBe("/tmp/provider-retry-session.jsonl");
    expect(result.sessionFileDisposition).toEqual({
      kind: "clear",
      sessionFile: "/tmp/provider-retry-session.jsonl",
    });
  });

  it("commits a changed normal session file", () => {
    const result = finalizeRuntimeSessionDispositionAfterRun(baseInput({
      sessionFile: "/tmp/current-session.jsonl",
      currentThreadPiSessionFile: "/tmp/old-session.jsonl",
    }));

    expect(result.emptyAssistantResponse).toBe(false);
    expect(result.discardProviderRetrySession).toBe(false);
    expect(result.sessionFileDisposition).toEqual({
      kind: "commit",
      sessionFile: "/tmp/current-session.jsonl",
      currentPiSessionFile: "/tmp/old-session.jsonl",
      reason: "run-finished",
    });
  });

  it("does not commit or clear dedicated review sessions", () => {
    const result = finalizeRuntimeSessionDispositionAfterRun(baseInput({
      usesDedicatedReviewSession: true,
      sessionFile: "/tmp/current-session.jsonl",
      currentThreadPiSessionFile: "/tmp/old-session.jsonl",
    }));

    expect(result.sessionFileDisposition).toBeUndefined();
  });

  it("does not schedule an empty-response retry without a retry source message", () => {
    const result = finalizeRuntimeSessionDispositionAfterRun(baseInput({
      currentAssistantVisibleContent: "",
      receivedAnyText: false,
      currentAssistantFinalTextChars: 0,
      retrySourceUserMessageId: undefined,
      sessionFile: "/tmp/current-session.jsonl",
      currentThreadPiSessionFile: "/tmp/current-session.jsonl",
    }));

    expect(result.emptyAssistantResponse).toBe(true);
    expect(result.retryEmptyAssistantResponse).toBe(true);
    expect(result.shouldCreateEmptyResponseRetry).toBe(false);
    expect(result.emptyResponseRetryUsesFreshSession).toBe(false);
    expect(result.discardSessionFileAfterRun).toBeUndefined();
    expect(result.sessionFileDisposition).toBeUndefined();
  });
});
