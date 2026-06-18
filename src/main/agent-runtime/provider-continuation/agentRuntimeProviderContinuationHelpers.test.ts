import { describe, expect, it } from "vitest";

import type { SendMessageInput } from "../../../shared/desktopTypes";
import type { ProviderContinuationState, ProviderContinuationToolState, ToolIntentSnapshot } from "../../../shared/threadTypes";
import {
  buildProviderInterruptionContinuationInput,
  buildProviderInterruptionContinuationNotice,
  buildProviderInterruptionContinuationPrompt,
  providerContinuationStatePromptView,
  providerToolPhaseLabel,
  runtimeProviderDiagnosticDisplayLines,
  toolIntentPromptLine,
  type ProviderInterruptionToolSnapshot,
} from "./agentRuntimeProviderContinuationHelpers";

const intent: ToolIntentSnapshot = {
  version: 1,
  toolCallId: "tool-call-1",
  toolName: "web_research_fetch",
  operationKind: "verify_specific_source",
  targetSummary: "https://example.com/source",
  declaredPurpose: "Verify this source.",
  materiality: "required_before_final_answer",
  substituteAllowed: true,
  createdAt: "2026-06-11T17:30:00.000Z",
};

const interruptedTool: ProviderInterruptionToolSnapshot = {
  toolCallId: "tool-call-1",
  toolName: "web_research_fetch",
  phase: "arguments_prepared_not_executed",
  certainty: "prepared_only",
  executionStarted: false,
  argumentComplete: true,
  inputChars: 1234,
  inputPreview: "{\"url\":\"https://example.com/source\"}",
  workspaceRelativeRecoveryArgumentPath: ".ambient-codex/interrupted-tool-calls/run-1/tool-call-1.prepared-args.txt",
  recoveryArgumentSha256: "abc123",
  recoveryArgumentParseStatus: "valid_json",
  intent,
};

const continuationTool: ProviderContinuationToolState = {
  version: 1,
  toolCallId: "tool-call-1",
  toolName: "web_research_fetch",
  status: "prepared",
  certainty: "prepared_only",
  phase: "argument_stream",
  executionStarted: false,
  mayHaveSideEffects: false,
  argumentComplete: true,
  inputChars: 1234,
  observedArgumentChars: 1234,
  workspaceRelativeRecoveryArgumentPath: ".ambient-codex/interrupted-tool-calls/run-1/tool-call-1.prepared-args.txt",
  intent,
};

const continuationState: ProviderContinuationState = {
  version: 1,
  stateId: "state-1",
  createdAt: "2026-06-11T17:31:00.000Z",
  runId: "run-1",
  threadId: "thread-1",
  assistantMessageId: "assistant-1",
  provider: "ambient",
  model: "ambient-model",
  failure: {
    kind: "stream_idle",
    message: "stream stalled",
  },
  retry: {
    scheduled: true,
    replaySafe: false,
    continuationSafe: true,
    attempt: 1,
    maxRetries: 2,
  },
  stream: {
    eventCount: 4,
    approximatePayloadBytes: 1024,
    preStreamTimeoutMs: 10000,
    streamIdleTimeoutMs: 30000,
    assistantOutputChars: 0,
    thinkingOutputChars: 0,
    currentAssistantFinalTextChars: 0,
    semanticOutputSeen: false,
    receivedAnyText: false,
  },
  assistant: {
    messageId: "assistant-1",
    hasVisibleOutput: false,
    outputChars: 0,
    thinkingChars: 0,
  },
  tools: {
    all: [continuationTool],
    open: [continuationTool],
    completed: [],
    interrupted: [continuationTool],
    mayHaveSideEffects: [],
    completedToolMessageCount: 2,
  },
  sessionFile: "sessions/thread-1.json",
};

describe("agentRuntimeProviderContinuationHelpers", () => {
  it("formats diagnostic lines without duplicating identical body/detail previews", () => {
    expect(runtimeProviderDiagnosticDisplayLines({
      name: "ProviderError",
      message: "stream stalled",
      status: 504,
      statusCode: "504",
      requestId: "request-1",
      detailPreview: "timeout detail",
      bodyPreview: "timeout detail",
      cause: { message: "socket idle" },
    })).toEqual([
      "Name: ProviderError",
      "Status: 504",
      "Status code: 504",
      "Request id: request-1",
      "Cause: socket idle",
      "Detail: timeout detail",
    ]);
  });

  it("builds continuation notices with tool phase and intent summaries", () => {
    const notice = buildProviderInterruptionContinuationNotice({
      message: "stream stalled",
      diagnostic: { message: "stream stalled", status: 504 },
      tools: [interruptedTool],
      completedToolMessageCount: 2,
      attempt: 1,
      maxRetries: 2,
    });

    expect(notice).toContain("Continuation attempt: 1/2");
    expect(notice).toContain("Status: 504");
    expect(notice).toContain("- web_research_fetch: arguments prepared; tool did not execute; certainty=prepared_only");
    expect(notice).toContain("exact args: .ambient-codex/interrupted-tool-calls/run-1/tool-call-1.prepared-args.txt");
    expect(notice).toContain("intent: verify_specific_source; required_before_final_answer; target=https://example.com/source; purpose=Verify this source.; substitute_allowed");
  });

  it("does not claim a continuation is starting when recovery stopped", () => {
    const notice = buildProviderInterruptionContinuationNotice({
      message: "stream stalled",
      diagnostic: { message: "stream stalled" },
      tools: [],
      completedToolMessageCount: 1,
      attempt: 2,
      maxRetries: 2,
      continuationScheduled: false,
    });

    expect(notice).toContain("Ambient stopped before replaying the original request");
    expect(notice).not.toContain("Ambient is starting a continuation turn");
  });

  it("builds continuation prompts with recovery tool inputs and durable state", () => {
    const prompt = buildProviderInterruptionContinuationPrompt({
      message: "stream stalled",
      diagnostic: { message: "stream stalled" },
      tools: [interruptedTool],
      completedToolMessageCount: 2,
      hadVisibleAssistantOutput: false,
      continuationState,
    });

    expect(prompt).toContain("Ambient/Pi provider stream was interrupted. Continue the same user request");
    expect(prompt).toContain("   - exact-args tool: recovery_read_interrupted_tool_call");
    expect(prompt).toContain('   - exact-args input: {"runId":"run-1","toolCallId":"tool-call-1","sha256":"abc123"}');
    expect(prompt).toContain("   - write-suffix tool: recovery_apply_interrupted_write_suffix");
    expect(prompt).toContain("   - normal write fallback:");
    expect(prompt).toContain('"recoveryMode":"interrupted_write_suffix"');
    expect(prompt).toContain("Do not use ambient_tool_search");
    expect(prompt).toContain("<only the missing suffix after the saved content prefix>");
    expect(prompt).toContain("Durable recovery state:");
    expect(prompt).toContain('"completedToolMessageCount": 2');
  });

  it("uses a suffix-tail boundary when the interrupted provider tool is recovery-apply", () => {
    const prompt = buildProviderInterruptionContinuationPrompt({
      message: "stream stalled",
      diagnostic: { message: "stream stalled" },
      tools: [{
        ...interruptedTool,
        toolCallId: "call-recovery",
        toolName: "recovery_apply_interrupted_write_suffix",
        workspaceRelativeRecoveryArgumentPath: ".ambient-codex/interrupted-tool-calls/run-1/call-recovery.partial-args.txt",
        recoveryArgumentSha256: "recovery-sha",
      }],
      completedToolMessageCount: 2,
      hadVisibleAssistantOutput: false,
      continuationState,
    });

    expect(prompt).toContain("interrupted recovery apply: pass only the missing tail after the saved recovery suffix prefix");
    expect(prompt).toContain("<only the missing tail after the saved recovery suffix prefix>");
    expect(prompt).toContain("<same target path from original saved write args>");
  });

  it("builds provider interruption continuation retry inputs", () => {
    const result = buildProviderInterruptionContinuationInput({
      baseInput: sendInput(),
      permissionMode: "full-access",
      retrySourceUserMessageId: "user-message-1",
      attempt: 2,
      maxRetries: 3,
      sessionRecovery: {
        kind: "provider_interruption_continuation",
        reason: "Continuing after Ambient/Pi provider interruption using the existing Pi session file when available.",
        previousSessionFile: "sessions/thread-1.json",
        previousSessionFileExists: true,
        providerContinuationStateId: "state-1",
      },
      message: "stream stalled",
      diagnostic: { message: "stream stalled", status: 504 },
      tools: [interruptedTool],
      completedToolMessageCount: 2,
      hadVisibleAssistantOutput: false,
      continuationState,
    });

    expect(result).toMatchObject({
      threadId: "thread-1",
      content: "Continue my research",
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: "ambient-model",
      thinkingLevel: "medium",
      context: [{ kind: "file", path: "/workspace/source.md", name: "source.md" }],
      internal: true,
      retryOfMessageId: "user-message-1",
      delivery: "prompt",
      preserveActiveThread: true,
      sessionRecovery: {
        kind: "provider_interruption_continuation",
        providerContinuationStateId: "state-1",
      },
      assistantFinalizationRetry: {
        sourceUserMessageId: "user-message-1",
        attempt: 2,
        maxRetries: 3,
        reason: "provider_interruption_continuation",
        recoveryStateId: "state-1",
      },
    });
    expect(result.modelContentOverride).toContain("Ambient/Pi provider stream was interrupted");
    expect(result.modelContentOverride).toContain('"stateId": "state-1"');
    expect(result.modelContentOverride).toContain('"completedToolMessageCount": 2');
  });

  it("builds compact durable-state prompt views and phase labels", () => {
    expect(providerContinuationStatePromptView(continuationState)).toMatchObject({
      stateId: "state-1",
      runId: "run-1",
      tools: {
        completedToolMessageCount: 2,
        open: [
          {
            toolCallId: "tool-call-1",
            recoveryArgumentPath: ".ambient-codex/interrupted-tool-calls/run-1/tool-call-1.prepared-args.txt",
            intent: {
              operationKind: "verify_specific_source",
              targetSummary: "https://example.com/source",
            },
          },
        ],
      },
      sessionFile: "sessions/thread-1.json",
    });
    expect(toolIntentPromptLine(intent)).toBe("verify_specific_source; required_before_final_answer; target=https://example.com/source; purpose=Verify this source.; substitute_allowed");
    expect(providerToolPhaseLabel({ ...interruptedTool, phase: "execution_started_unknown" })).toBe("execution started; completion unknown");
    expect(providerToolPhaseLabel({ ...interruptedTool, phase: "argument_stream_not_executed" })).toBe("arguments were still streaming; tool did not execute");
  });
});

function sendInput(): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "Continue my research",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-model",
    thinkingLevel: "medium",
    context: [{ kind: "file", path: "/workspace/source.md", name: "source.md" }],
  };
}
