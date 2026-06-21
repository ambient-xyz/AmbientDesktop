import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../../shared/threadTypes";
import {
  contextReferencesFromMetadata,
  countTextMatches,
  isSessionContextMissingError,
  messageIsStreaming,
  messageIsStreamingForRender,
  messageKindForActivity,
  renderableMessageContent,
  retryableFailedPromptIds,
  streamingAssistantMessageId,
  visibleMessages,
} from "./AppMessages";

describe("message helpers", () => {
  it("classifies visible message activity kinds", () => {
    const assistant = message({ id: "m1", role: "assistant", content: "Hello" });
    const thinking = message({ id: "m2", role: "assistant", content: "Reasoning", metadata: { kind: "thinking" } });
    const tool = message({ id: "m3", role: "tool", content: "Done" });

    expect(messageKindForActivity(assistant)).toBe("assistant");
    expect(messageKindForActivity(thinking)).toBe("thinking");
    expect(messageKindForActivity(tool)).toBe("tool");
  });

  it("keeps renderable content and context metadata parsing stable", () => {
    const userMessage = message({ content: "  Hi\u200B there  " });
    expect(renderableMessageContent(userMessage)).toBe("Hi there");
    expect(
      contextReferencesFromMetadata([
        { path: "README.md", name: "README.md", kind: "file", size: 12 },
        { path: "src", name: "src", kind: "directory", absolute: true },
        { path: "bad", name: "bad", kind: "other" },
      ]),
    ).toEqual([
      { path: "README.md", name: "README.md", kind: "file", size: 12 },
      { path: "src", name: "src", kind: "directory", absolute: true },
    ]);
  });

  it("detects session context missing errors", () => {
    expect(isSessionContextMissingError("Model context is not available for this chat: Pi session file is missing.")).toBe(true);
    expect(isSessionContextMissingError("Network request failed.")).toBe(false);
  });

  it("filters visible messages through the thinking display mode", () => {
    const user = message({ id: "u1", role: "user", content: "Question" });
    const blankAssistant = message({ id: "a1", role: "assistant", content: "" });
    const thinking = message({
      id: "t1",
      role: "assistant",
      content: "Reasoning",
      metadata: { kind: "thinking", status: "thinking" },
    });
    const assistant = message({ id: "a2", role: "assistant", content: "Answer" });

    expect(visibleMessages([user, blankAssistant, thinking, assistant], false, "transient").map((item) => item.id)).toEqual(["u1", "a2"]);
    expect(visibleMessages([user, blankAssistant, thinking, assistant], false, "full").map((item) => item.id)).toEqual(["u1", "t1", "a2"]);
  });

  it("finds retryable failed prompts from the latest visible assistant error", () => {
    const firstUser = message({ id: "u1", role: "user", content: "First" });
    const latestUser = message({ id: "u2", role: "user", content: "Retry this" });
    const hiddenUser = message({
      id: "hidden",
      role: "user",
      content: "Continue working toward the active Ambient Desktop thread goal.",
      metadata: {
        runtime: "ambient-internal",
        kind: "hidden-user-message",
        hiddenFromTranscript: true,
        hiddenUserMessage: true,
      },
    });
    const thinking = message({ id: "t1", role: "assistant", content: "Thinking", metadata: { kind: "thinking" } });
    const tool = message({ id: "tool1", role: "tool", content: "Tool output" });
    const error = message({ id: "a1", role: "assistant", content: "Failed", metadata: { status: "error" } });

    expect(retryableFailedPromptIds([firstUser, latestUser, hiddenUser, thinking, tool, error])).toEqual(new Set(["u2"]));
    expect(retryableFailedPromptIds([firstUser, error, message({ id: "a2", role: "assistant", content: "Recovered" })])).toEqual(new Set());
  });

  it("does not offer whole-prompt retry after non-replay-safe provider interruptions with tool activity", () => {
    const user = message({ id: "u1", role: "user", content: "Build the app" });
    const tool = message({ id: "tool1", role: "tool", content: "Wrote calculator.html" });
    const error = message({
      id: "a1",
      role: "assistant",
      content: "Ambient/Pi stream interrupted after tool activity.",
      metadata: {
        status: "error",
        piStreamInterruption: {
          retryScheduled: false,
          replaySafe: false,
          toolCallSeen: true,
          toolMessageCount: 1,
          completedToolMessageCount: 1,
        },
      },
    });

    expect(retryableFailedPromptIds([user, tool, error])).toEqual(new Set());
  });

  it("counts case-insensitive non-overlapping text matches", () => {
    expect(countTextMatches("Banana banana", "ANA")).toBe(2);
    expect(countTextMatches("aaaa", "aa")).toBe(2);
    expect(countTextMatches("anything", "   ")).toBe(0);
  });

  it("detects streaming messages from status and the latest blank assistant", () => {
    const firstBlank = message({ id: "a1", role: "assistant", content: "" });
    const thinking = message({ id: "t1", role: "assistant", content: "Reasoning", metadata: { kind: "thinking", status: "thinking" } });
    const latestBlank = message({ id: "a2", role: "assistant", content: "" });
    const explicitStreaming = message({ id: "a3", role: "assistant", content: "Partial", metadata: { status: "streaming" } });
    const messages = [firstBlank, thinking, latestBlank];

    expect(streamingAssistantMessageId(messages, true)).toBe("a2");
    expect(streamingAssistantMessageId(messages, false)).toBeUndefined();
    expect(messageIsStreaming(firstBlank, messages, true)).toBe(false);
    expect(messageIsStreaming(latestBlank, messages, true)).toBe(true);
    expect(messageIsStreaming(thinking, messages, true)).toBe(true);
    expect(messageIsStreaming(explicitStreaming, messages, true)).toBe(true);
    expect(messageIsStreamingForRender(latestBlank, true, "a2")).toBe(true);
    expect(messageIsStreamingForRender(latestBlank, false, "a2")).toBe(false);
  });
});

function message(input: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message-id",
    threadId: "thread-id",
    role: "user",
    content: "",
    createdAt: "2026-06-04T00:00:00.000Z",
    ...input,
  } as ChatMessage;
}
