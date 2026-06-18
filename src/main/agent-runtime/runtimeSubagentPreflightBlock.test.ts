import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import {
  finalizeRuntimeSubagentPreflightBlock,
  type RuntimeSubagentPreflightBlockInput,
} from "./runtimeSubagentPreflightBlock";

const createdAt = "2026-06-15T00:00:00.000Z";

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "assistant-1",
    threadId: "thread-1",
    role: "assistant",
    content: "Subagents are unavailable.",
    createdAt,
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<RuntimeSubagentPreflightBlockInput> = {},
): RuntimeSubagentPreflightBlockInput & { emitted: DesktopEvent[] } {
  const emitted: DesktopEvent[] = [];
  const message = assistantMessage();
  return {
    threadId: "thread-1",
    workspacePath: "/workspace",
    message: "Subagents are unavailable.",
    reason: "Subagent tooling is disabled.",
    addAssistantMessage: vi.fn(() => message),
    startRun: vi.fn(() => ({ id: "run-1" })),
    setActiveRunId: vi.fn(),
    deleteActiveRunId: vi.fn(),
    finishPlannerFinalizationSources: vi.fn(),
    finishRun: vi.fn(),
    emitRunEvent: vi.fn((event: DesktopEvent) => {
      emitted.push(event);
    }),
    onActivity: vi.fn(),
    emitted,
    ...overrides,
  };
}

describe("finalizeRuntimeSubagentPreflightBlock", () => {
  it("persists and emits the blocked subagent preflight run", () => {
    const input = baseInput();

    const result = finalizeRuntimeSubagentPreflightBlock(input);

    expect(input.addAssistantMessage).toHaveBeenCalledWith({
      threadId: "thread-1",
      role: "assistant",
      content: "Subagents are unavailable.",
      metadata: {
        status: "error",
        runtime: "pi",
        provider: "ambient",
        preflightBlock: "subagent_unavailable",
      },
    });
    expect(input.startRun).toHaveBeenCalledWith({ threadId: "thread-1", assistantMessageId: "assistant-1" });
    expect(input.setActiveRunId).toHaveBeenCalledWith("thread-1", "run-1");
    expect(input.finishPlannerFinalizationSources).toHaveBeenCalledWith("failed", {
      error: "Subagent tooling is disabled.",
      workflowState: "failed",
    });
    expect(input.finishRun).toHaveBeenCalledWith("run-1", "error", "Subagent tooling is disabled.");
    expect(input.deleteActiveRunId).toHaveBeenCalledWith("thread-1");
    expect(input.emitted).toEqual([
      { type: "message-created", message: assistantMessage() },
      { type: "run-status", threadId: "thread-1", status: "error" },
      {
        type: "error",
        message: "Subagent tooling is disabled.",
        threadId: "thread-1",
        workspacePath: "/workspace",
      },
    ]);
    expect(input.onActivity).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ assistantMessage: assistantMessage(), runId: "run-1" });
  });
});
