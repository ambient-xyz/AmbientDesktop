import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../../shared/threadTypes";
import { activeThreadHasRunningLocalDeepResearch } from "./AppLocalDeepResearchRunState";

describe("App Local Deep Research run state", () => {
  it("detects a running Local Deep Research tool message", () => {
    expect(activeThreadHasRunningLocalDeepResearch([
      message({ role: "user", metadata: undefined }),
      message({ role: "tool", metadata: { toolName: "ambient_local_deep_research_run", status: "running" } }),
    ])).toBe(true);
  });

  it("uses nested tool result details and ignores terminal statuses", () => {
    expect(activeThreadHasRunningLocalDeepResearch([
      message({
        role: "tool",
        metadata: {
          toolResultDetails: {
            toolName: "ambient_local_deep_research_run",
            status: "completed",
          },
        },
      }),
      message({
        role: "tool",
        metadata: {
          toolResultDetails: {
            toolName: "ambient_local_deep_research_run",
            status: "running",
          },
        },
      }),
    ])).toBe(true);
    expect(activeThreadHasRunningLocalDeepResearch([
      message({
        role: "tool",
        metadata: {
          toolResultDetails: {
            toolName: "ambient_local_deep_research_run",
            status: "completed",
          },
        },
      }),
    ])).toBe(false);
  });
});

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    role: "assistant",
    content: "",
    createdAt: "2026-06-16T12:00:00.000Z",
    ...overrides,
  };
}
