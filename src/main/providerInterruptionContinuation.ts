export const INCOMPLETE_TOOL_ARGUMENT_CONTINUATION_MAX_RETRIES = 2;
export const SHORT_INCOMPLETE_TOOL_ARGUMENT_CHAR_LIMIT = 512;

export interface ProviderInterruptionContinuationBudgetTool {
  executionStarted: boolean;
  argumentComplete: boolean;
  inputChars?: number;
}

export interface ProviderInterruptionContinuationBudget {
  maxRetries: number;
  boundedByIncompleteToolArguments: boolean;
  reason?: "incomplete_tool_argument_stream";
}

export function providerInterruptionContinuationRetryBudget(input: {
  configuredMaxRetries: number;
  tools: readonly ProviderInterruptionContinuationBudgetTool[];
}): ProviderInterruptionContinuationBudget {
  const configuredMaxRetries = Math.max(0, Math.floor(input.configuredMaxRetries));
  const incompleteToolArgumentStreams = input.tools.filter((tool) => !tool.executionStarted && !tool.argumentComplete);
  const hasIncompleteToolArgumentStream = incompleteToolArgumentStreams.length > 0;
  if (!hasIncompleteToolArgumentStream) {
    return {
      maxRetries: configuredMaxRetries,
      boundedByIncompleteToolArguments: false,
    };
  }
  const allIncompleteArgumentStreamsAreShort = incompleteToolArgumentStreams.every((tool) => {
    const inputChars = typeof tool.inputChars === "number" && Number.isFinite(tool.inputChars) ? Math.max(0, Math.floor(tool.inputChars)) : 0;
    return inputChars > 0 && inputChars <= SHORT_INCOMPLETE_TOOL_ARGUMENT_CHAR_LIMIT;
  });
  if (allIncompleteArgumentStreamsAreShort) {
    return {
      maxRetries: configuredMaxRetries,
      boundedByIncompleteToolArguments: false,
    };
  }
  return {
    maxRetries: Math.min(configuredMaxRetries, INCOMPLETE_TOOL_ARGUMENT_CONTINUATION_MAX_RETRIES),
    boundedByIncompleteToolArguments: true,
    reason: "incomplete_tool_argument_stream",
  };
}
