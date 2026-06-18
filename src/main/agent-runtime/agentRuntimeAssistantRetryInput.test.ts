import { describe, expect, it } from "vitest";

import type { SendMessageInput } from "../../shared/desktopTypes";
import {
  assistantFinalizationRetryAttemptsUsedForReason,
  buildAssistantFinalizationRetryInput,
  buildRuntimeSessionRecoveryContext,
  type AssistantFinalizationRetryState,
} from "./agentRuntimeAssistantRetryInput";

describe("assistantFinalizationRetryAttemptsUsedForReason", () => {
  it("counts attempts only for the matching retry reason", () => {
    const activeRetry: AssistantFinalizationRetryState = {
      sourceUserMessageId: "message-1",
      attempt: 3,
      maxRetries: 10,
      reason: "empty_assistant_response",
    };

    expect(assistantFinalizationRetryAttemptsUsedForReason(activeRetry, "empty_assistant_response", 10)).toBe(3);
    expect(assistantFinalizationRetryAttemptsUsedForReason(activeRetry, "pre_output_stream_stall", 10)).toBe(0);
    expect(assistantFinalizationRetryAttemptsUsedForReason(activeRetry, "provider_error_before_tool_execution", 10)).toBe(0);
  });

  it("caps attempts at max retries and honors recovery state ids", () => {
    const activeRetry: AssistantFinalizationRetryState = {
      sourceUserMessageId: "message-1",
      attempt: 5,
      maxRetries: 5,
      reason: "provider_interruption_continuation",
      recoveryStateId: "state-1",
    };

    expect(assistantFinalizationRetryAttemptsUsedForReason(
      activeRetry,
      "provider_interruption_continuation",
      2,
      "state-1",
    )).toBe(2);
    expect(assistantFinalizationRetryAttemptsUsedForReason(
      activeRetry,
      "provider_interruption_continuation",
      2,
      "state-2",
    )).toBe(0);
  });
});

describe("buildRuntimeSessionRecoveryContext", () => {
  it("includes previous session metadata when a session file is present", () => {
    expect(buildRuntimeSessionRecoveryContext({
      kind: "provider_interruption_continuation",
      reason: "Continue from the previous session.",
      previousSessionFile: "/workspace/.ambient/session.json",
      fileExists: (path) => path.endsWith("session.json"),
      providerContinuationStateId: "state-1",
    })).toEqual({
      kind: "provider_interruption_continuation",
      reason: "Continue from the previous session.",
      previousSessionFile: "/workspace/.ambient/session.json",
      previousSessionFileExists: true,
      providerContinuationStateId: "state-1",
    });
  });

  it("omits previous session metadata when there is no session file", () => {
    expect(buildRuntimeSessionRecoveryContext({
      kind: "interrupted_tool_call_recovery",
      reason: "Retry from saved tool arguments.",
      fileExists: () => true,
    })).toEqual({
      kind: "interrupted_tool_call_recovery",
      reason: "Retry from saved tool arguments.",
    });
  });
});

describe("buildAssistantFinalizationRetryInput", () => {
  it("builds an internal prompt retry while preserving the original request shape", () => {
    const result = buildAssistantFinalizationRetryInput({
      baseInput: sendInput(),
      permissionMode: "workspace",
      retrySourceUserMessageId: "message-1",
      attempt: 2,
      maxRetries: 4,
      reason: "empty_assistant_response",
    });

    expect(result).toMatchObject({
      threadId: "thread-1",
      content: "Summarize this file",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "ambient-preview",
      thinkingLevel: "medium",
      context: [{ kind: "file", path: "/workspace/notes.md", name: "notes.md" }],
      workflowThreadId: "workflow-thread-1",
      internal: true,
      retryOfMessageId: "message-1",
      delivery: "prompt",
      preserveActiveThread: true,
      assistantFinalizationRetry: {
        sourceUserMessageId: "message-1",
        attempt: 2,
        maxRetries: 4,
        reason: "empty_assistant_response",
      },
    });
  });

  it("includes optional session recovery and recovery state when provided", () => {
    const result = buildAssistantFinalizationRetryInput({
      baseInput: sendInput(),
      permissionMode: "full-access",
      retrySourceUserMessageId: "message-2",
      attempt: 1,
      maxRetries: 3,
      reason: "provider_interruption_continuation",
      recoveryStateId: "state-1",
      sessionRecovery: {
        kind: "provider_interruption_continuation",
        reason: "Continue after provider interruption.",
        previousSessionFile: "/workspace/.ambient/session.json",
        previousSessionFileExists: true,
        providerContinuationStateId: "state-1",
      },
    });

    expect(result.permissionMode).toBe("full-access");
    expect(result.sessionRecovery).toEqual({
      kind: "provider_interruption_continuation",
      reason: "Continue after provider interruption.",
      previousSessionFile: "/workspace/.ambient/session.json",
      previousSessionFileExists: true,
      providerContinuationStateId: "state-1",
    });
    expect(result.assistantFinalizationRetry).toMatchObject({
      sourceUserMessageId: "message-2",
      reason: "provider_interruption_continuation",
      recoveryStateId: "state-1",
    });
  });
});

function sendInput(): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "Summarize this file",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-preview",
    thinkingLevel: "medium",
    context: [{ kind: "file", path: "/workspace/notes.md", name: "notes.md" }],
    workflowThreadId: "workflow-thread-1",
  };
}
