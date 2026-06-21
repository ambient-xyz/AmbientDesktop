import { describe, expect, it } from "vitest";
import { isSubagentParentOnlyContextMessage, subagentParentContextForMessages } from "./subagentContextFilter";

describe("subagentContextFilter", () => {
  it("strips parent-only sub-agent control messages from child prompt context", () => {
    const context = subagentParentContextForMessages([
      { id: "safe-user", role: "user", content: "Please compare these files.", metadata: {} },
      { id: "tool-call", role: "assistant", content: "ambient_subagent completed", metadata: { toolName: "ambient_subagent" } },
      { id: "runtime-control", role: "assistant", content: "Child root/0:summarizer finished.", metadata: { runtime: "ambient-subagents" } },
      { id: "child-result", role: "assistant", content: "Stale child result", metadata: { subagentRunId: "child-run" } },
      {
        id: "hidden-goal-continuation",
        role: "user",
        content: "Continue working toward the active Ambient Desktop thread goal.",
        metadata: { hiddenFromTranscript: true, hiddenUserMessage: true },
      },
      { id: "tool-message", role: "tool", content: "raw tool payload", metadata: {} },
      { id: "safe-assistant", role: "assistant", content: "Use the visible diff only.", metadata: {} },
    ], "recent_turns");

    expect(context.inherited.map((item) => item.sourceMessageId)).toEqual(["safe-user", "safe-assistant"]);
    expect(context.stripped).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceMessageId: "tool-call", reason: "parent_only_subagent_control" }),
      expect.objectContaining({ sourceMessageId: "runtime-control", reason: "parent_only_subagent_control" }),
      expect.objectContaining({ sourceMessageId: "child-result", reason: "parent_only_subagent_control" }),
      expect.objectContaining({ sourceMessageId: "hidden-goal-continuation", reason: "hidden_internal_message" }),
      expect.objectContaining({ sourceMessageId: "tool-message", reason: "tool_message" }),
    ]));
    expect(context.inherited.map((item) => item.contentPreview).join("\n")).not.toContain("Continue working toward the active Ambient Desktop thread goal");
  });

  it("bounds recent-turn inheritance without leaking earlier parent context", () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({
      id: `user-${index}`,
      role: "user" as const,
      content: `message ${index}`,
      metadata: {},
    }));
    const context = subagentParentContextForMessages(messages, "recent_turns");

    expect(context.inherited.map((item) => item.sourceMessageId)).toEqual([
      "user-2",
      "user-3",
      "user-4",
      "user-5",
      "user-6",
      "user-7",
    ]);
    expect(context.stripped).toEqual([
      expect.objectContaining({ sourceMessageId: "user-0", reason: "outside_recent_context_window" }),
      expect.objectContaining({ sourceMessageId: "user-1", reason: "outside_recent_context_window" }),
    ]);
  });

  it("identifies parent-only sub-agent metadata", () => {
    expect(isSubagentParentOnlyContextMessage({ metadata: { canonicalTaskPath: "root/0:explorer" } })).toBe(true);
    expect(isSubagentParentOnlyContextMessage({ metadata: { toolName: "ambient_subagent" } })).toBe(true);
    expect(isSubagentParentOnlyContextMessage({ metadata: { toolName: "file_read" } })).toBe(false);
  });
});
