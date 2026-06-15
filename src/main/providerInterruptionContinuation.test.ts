import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_TOOL_ARGUMENT_CONTINUATION_MAX_RETRIES,
  providerInterruptionContinuationRetryBudget,
} from "./providerInterruptionContinuation";

describe("providerInterruptionContinuationRetryBudget", () => {
  it("uses the configured retry budget when arguments completed or execution started", () => {
    expect(providerInterruptionContinuationRetryBudget({
      configuredMaxRetries: 10,
      tools: [{ executionStarted: false, argumentComplete: true }],
    })).toEqual({
      maxRetries: 10,
      boundedByIncompleteToolArguments: false,
    });

    expect(providerInterruptionContinuationRetryBudget({
      configuredMaxRetries: 10,
      tools: [{ executionStarted: true, argumentComplete: false }],
    })).toEqual({
      maxRetries: 10,
      boundedByIncompleteToolArguments: false,
    });
  });

  it("bounds retries when the provider repeatedly stalls before tool arguments complete", () => {
    expect(providerInterruptionContinuationRetryBudget({
      configuredMaxRetries: 10,
      tools: [{ executionStarted: false, argumentComplete: false, inputChars: 4096 }],
    })).toEqual({
      maxRetries: INCOMPLETE_TOOL_ARGUMENT_CONTINUATION_MAX_RETRIES,
      boundedByIncompleteToolArguments: true,
      reason: "incomplete_tool_argument_stream",
    });
  });

  it("keeps the configured retry budget for short incomplete arguments that never executed", () => {
    expect(providerInterruptionContinuationRetryBudget({
      configuredMaxRetries: 10,
      tools: [{ executionStarted: false, argumentComplete: false, inputChars: 77 }],
    })).toEqual({
      maxRetries: 10,
      boundedByIncompleteToolArguments: false,
    });
  });

  it("does not raise a lower configured retry budget", () => {
    expect(providerInterruptionContinuationRetryBudget({
      configuredMaxRetries: 1,
      tools: [{ executionStarted: false, argumentComplete: false, inputChars: 4096 }],
    })).toEqual({
      maxRetries: 1,
      boundedByIncompleteToolArguments: true,
      reason: "incomplete_tool_argument_stream",
    });
  });
});
