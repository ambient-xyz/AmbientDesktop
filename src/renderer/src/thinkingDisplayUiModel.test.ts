import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../shared/threadTypes";
import {
  shouldShowRunStatusCard,
  thinkingDisplayModeLabel,
  thinkingLevelLabel,
  thinkingOptions,
  transientThinkingActivityLinesForDisplay,
  visibleMessagesForThinkingDisplay,
  visibleRunActivityLinesForThinkingDisplay,
  visibleTextMatchCountForThinkingDisplay,
  type ThinkingDisplayRunActivityLine,
} from "./thinkingDisplayUiModel";

const messages: ChatMessage[] = [
  message("user-1", "user", "Build a dashboard."),
  message("think-1", "assistant", "Inspecting files for dashboard layout.", { kind: "thinking", status: "done" }),
  message("assistant-1", "assistant", "I built the dashboard."),
  message("think-2", "assistant", "Checking the final polish.", { kind: "thinking", status: "thinking" }),
];

const lines: ThinkingDisplayRunActivityLine[] = [
  line("activity-1", "Prompt sent to Ambient.", "state"),
  line("activity-2", "Inspecting files for dashboard layout.", "thinking"),
  line("activity-3", "Tool execution is in progress.", "tool"),
  line("activity-4", "Checking the final polish.", "thinking"),
];

describe("thinkingDisplayUiModel", () => {
  it("keeps thinking level options and labels stable for compact controls", () => {
    expect(thinkingOptions).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
    expect(thinkingOptions.map(thinkingLevelLabel)).toEqual(["Minimal", "Low", "Medium", "High", "Extra High"]);
  });

  it("labels thinking display modes for compact controls", () => {
    expect(thinkingDisplayModeLabel("off")).toBe("Off");
    expect(thinkingDisplayModeLabel("transient")).toBe("Transient");
    expect(thinkingDisplayModeLabel("full")).toBe("Full");
  });

  it("filters thinking messages by display mode", () => {
    expect(visibleMessagesForThinkingDisplay(messages, "full").map((item) => item.id)).toEqual([
      "user-1",
      "think-1",
      "assistant-1",
      "think-2",
    ]);
    expect(visibleMessagesForThinkingDisplay(messages, "transient").map((item) => item.id)).toEqual(["user-1", "assistant-1"]);
    expect(visibleMessagesForThinkingDisplay(messages, "off").map((item) => item.id)).toEqual(["user-1", "assistant-1"]);
  });

  it("filters hidden internal transcript anchors from display", () => {
    const messagesWithHiddenAnchor = [
      ...messages,
      {
        id: "hidden-goal-anchor",
        threadId: "thread-1",
        role: "user" as const,
        content: "Continue working toward the active Ambient Desktop thread goal.",
        createdAt: "2026-04-29T00:00:03.000Z",
        metadata: { hiddenFromTranscript: true, kind: "hidden-user-message" },
      },
    ];

    expect(visibleMessagesForThinkingDisplay(messagesWithHiddenAnchor, "full").map((item) => item.id)).not.toContain(
      "hidden-goal-anchor",
    );
  });

  it("matches chat find text only against visible messages", () => {
    expect(visibleTextMatchCountForThinkingDisplay({ messages, mode: "full", query: "dashboard" })).toBe(3);
    expect(visibleTextMatchCountForThinkingDisplay({ messages, mode: "transient", query: "dashboard" })).toBe(2);
    expect(visibleTextMatchCountForThinkingDisplay({ messages, mode: "full", query: "polish" })).toBe(1);
    expect(visibleTextMatchCountForThinkingDisplay({ messages, mode: "transient", query: "polish" })).toBe(0);
    expect(visibleTextMatchCountForThinkingDisplay({ messages, mode: "off", query: "polish" })).toBe(0);
  });

  it("filters thinking lines out of regular run activity except in full mode", () => {
    expect(visibleRunActivityLinesForThinkingDisplay(lines, "full").map((item) => item.id)).toEqual([
      "activity-1",
      "activity-2",
      "activity-3",
      "activity-4",
    ]);
    expect(visibleRunActivityLinesForThinkingDisplay(lines, "transient").map((item) => item.id)).toEqual(["activity-1", "activity-3"]);
    expect(visibleRunActivityLinesForThinkingDisplay(lines, "off").map((item) => item.id)).toEqual(["activity-1", "activity-3"]);
  });

  it("shows transient thinking lines only while the active run is streaming", () => {
    expect(
      transientThinkingActivityLinesForDisplay({
        lines,
        messages,
        mode: "transient",
        running: true,
        runStatus: "streaming",
      }).map((item) => item.id),
    ).toEqual([
      "activity-2",
      "activity-4",
    ]);
    expect(transientThinkingActivityLinesForDisplay({ lines, messages, mode: "off", running: true, runStatus: "streaming" })).toEqual([]);
    expect(transientThinkingActivityLinesForDisplay({ lines, messages, mode: "full", running: true, runStatus: "streaming" })).toEqual([]);
    expect(transientThinkingActivityLinesForDisplay({ lines, messages, mode: "transient", running: false, runStatus: "streaming" })).toEqual([]);
    expect(transientThinkingActivityLinesForDisplay({ lines, messages, mode: "transient", running: true, runStatus: "tool" })).toEqual([]);
    expect(
      transientThinkingActivityLinesForDisplay({
        assistantVisibleTextStreaming: true,
        lines,
        messages,
        mode: "transient",
        running: true,
        runStatus: "streaming",
      }),
    ).toEqual([]);
    expect(
      transientThinkingActivityLinesForDisplay({
        lines,
        messages: messages.map((item) => item.id === "think-2" ? { ...item, metadata: { ...item.metadata, status: "done" } } : item),
        mode: "transient",
        running: true,
        runStatus: "streaming",
      }),
    ).toEqual([
      lines[1],
      lines[3],
    ]);
  });

  it("keeps the run status card hidden unless the setting is enabled or compaction is active during a run", () => {
    expect(shouldShowRunStatusCard(undefined, true)).toBe(false);
    expect(shouldShowRunStatusCard({ showRunStatusCard: false }, true)).toBe(false);
    expect(shouldShowRunStatusCard({ showRunStatusCard: true }, false)).toBe(false);
    expect(shouldShowRunStatusCard({ showRunStatusCard: true }, true)).toBe(true);
    expect(shouldShowRunStatusCard({ showRunStatusCard: false }, true, "starting")).toBe(true);
    expect(shouldShowRunStatusCard({ showRunStatusCard: false }, true, "compacting")).toBe(true);
    expect(shouldShowRunStatusCard({ showRunStatusCard: false }, false, "compacting")).toBe(false);
  });
});

function message(
  id: string,
  role: ChatMessage["role"],
  content: string,
  metadata?: ChatMessage["metadata"],
): ChatMessage {
  return {
    id,
    threadId: "thread-1",
    role,
    content,
    createdAt: `2026-05-18T00:00:0${id.at(-1) ?? "0"}.000Z`,
    ...(metadata ? { metadata } : {}),
  };
}

function line(
  id: string,
  text: string,
  kind: ThinkingDisplayRunActivityLine["kind"],
): ThinkingDisplayRunActivityLine {
  return {
    id,
    text,
    kind,
    timestamp: Number(id.replace(/\D/g, "")),
  };
}
