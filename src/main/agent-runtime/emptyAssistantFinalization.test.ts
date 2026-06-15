import { describe, expect, it } from "vitest";

import { emptyAssistantFinalizationModel } from "./emptyAssistantFinalization";

const baseInput = {
  abortRequested: false,
  finalizedAfterToolIdle: false,
  currentAssistantVisibleContent: "",
  receivedAnyText: false,
  currentAssistantFinalTextChars: 0,
  activeToolMessageCount: 0,
  canScheduleRetry: true,
  retryAttemptsUsed: 0,
  retryNextAttempt: 1,
  maxRetries: 10,
  retryDelayMs: 0,
};

describe("emptyAssistantFinalization", () => {
  it("models a retry with a fresh session before any visible output or tools", () => {
    expect(emptyAssistantFinalizationModel({
      ...baseInput,
      sessionFile: "/tmp/session.jsonl",
      lastAssistantTerminalEvent: {
        eventType: "message_end",
        finalTextChars: 0,
      },
    })).toEqual({
      currentAssistantHasVisibleText: false,
      awaitingInputAfterTools: false,
      emptyAssistantResponse: true,
      retryEmptyAssistantResponse: true,
      emptyResponseRetryUsesFreshSession: true,
      emptyResponseText: "Ambient/Pi returned no assistant text. Retrying assistant finalization attempt 1/10 with a fresh session.",
      metadata: {
        retryScheduled: true,
        retryUsesFreshSession: true,
        retryAttempt: 1,
        maxRetries: 10,
        retryReason: "empty_assistant_response",
        retryDelayMs: 0,
        receivedAnyText: false,
        currentAssistantFinalTextChars: 0,
        sessionFile: "/tmp/session.jsonl",
        lastAssistantTerminalEvent: {
          eventType: "message_end",
          finalTextChars: 0,
        },
      },
    });
  });

  it("models a retry after resetting the live session when prior text activity exists", () => {
    expect(emptyAssistantFinalizationModel({
      ...baseInput,
      receivedAnyText: true,
      retryNextAttempt: 2,
      retryDelayMs: 25,
      activeRetryReason: "provider_interruption_continuation",
    })).toMatchObject({
      retryEmptyAssistantResponse: true,
      emptyResponseRetryUsesFreshSession: false,
      emptyResponseText: "Ambient/Pi returned no assistant text. Retrying assistant finalization attempt 2/10 after resetting the live session.",
      metadata: {
        retryScheduled: true,
        retryUsesFreshSession: false,
        retryAttempt: 2,
        retryReason: "provider_interruption_continuation",
        retryDelayMs: 25,
        receivedAnyText: true,
      },
    });
  });

  it("models exhausted empty assistant retries", () => {
    expect(emptyAssistantFinalizationModel({
      ...baseInput,
      canScheduleRetry: false,
      retryAttemptsUsed: 10,
      retryNextAttempt: 11,
      sessionFile: "/tmp/session.jsonl",
    })).toMatchObject({
      emptyAssistantResponse: true,
      retryEmptyAssistantResponse: false,
      emptyResponseRetryUsesFreshSession: false,
      emptyResponseText: "Ambient/Pi returned no assistant text after 10/10 assistant finalization retries.",
      metadata: {
        retryScheduled: false,
        retryUsesFreshSession: false,
        retryAttempt: 10,
        retryDelayMs: 0,
        sessionFile: "/tmp/session.jsonl",
      },
    });
  });

  it("does not model an empty response when tool idle finalization is awaiting input", () => {
    expect(emptyAssistantFinalizationModel({
      ...baseInput,
      finalizedAfterToolIdle: true,
    })).toEqual({
      currentAssistantHasVisibleText: false,
      awaitingInputAfterTools: true,
      emptyAssistantResponse: false,
      retryEmptyAssistantResponse: false,
      emptyResponseRetryUsesFreshSession: false,
      emptyResponseText: "Ambient/Pi returned no assistant text after 0/10 assistant finalization retries.",
    });
  });
});
