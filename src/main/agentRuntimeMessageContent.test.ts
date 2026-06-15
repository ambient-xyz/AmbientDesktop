import { describe, expect, it } from "vitest";

import { runtimeMessageContentOrFallback } from "./agentRuntimeMessageContent";

describe("agentRuntimeMessageContent", () => {
  it("returns stored content for the matching message", () => {
    expect(runtimeMessageContentOrFallback([
      { id: "assistant-1", content: "Stored assistant text" },
      { id: "thinking-1", content: "Stored thinking text" },
    ], "thinking-1", "Streaming fallback")).toBe("Stored thinking text");
  });

  it("falls back when the message is missing", () => {
    expect(runtimeMessageContentOrFallback([
      { id: "assistant-1", content: "Stored assistant text" },
    ], "missing", "Streaming fallback")).toBe("Streaming fallback");
  });

  it("falls back when the stored content is empty", () => {
    expect(runtimeMessageContentOrFallback([
      { id: "assistant-1", content: "" },
    ], "assistant-1", "Streaming fallback")).toBe("Streaming fallback");
  });

  it("preserves whitespace-only stored content like the inline runtime fallback did", () => {
    expect(runtimeMessageContentOrFallback([
      { id: "assistant-1", content: "   " },
    ], "assistant-1", "Streaming fallback")).toBe("   ");
  });
});
