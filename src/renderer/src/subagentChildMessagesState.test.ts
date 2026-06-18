import { describe, expect, it } from "vitest";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { DesktopState } from "../../shared/desktopTypes";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import {
  applyChildThreadMessageDelta,
  childThreadIsVisibleUnderActiveParent,
  upsertChildThreadMessage,
} from "./subagentChildMessagesState";

describe("subagentChildMessagesState", () => {
  it("tracks direct child thread messages while the parent thread is active", () => {
    const state = desktopStateFixture();
    const message = messageFixture({ id: "child-message-1", content: "Child started" });

    const next = upsertChildThreadMessage(state, message);

    expect(next.childMessagesByThreadId?.["child-thread-1"]).toEqual([message]);
    expect(next.messages).toEqual(state.messages);
    expect(childThreadIsVisibleUnderActiveParent(next, "child-thread-1")).toBe(true);
  });

  it("applies streaming deltas to cached child messages without touching parent messages", () => {
    const state = desktopStateFixture({
      childMessagesByThreadId: {
        "child-thread-1": [messageFixture({ id: "child-message-1", content: "Child" })],
      },
    });

    const next = applyChildThreadMessageDelta(state, {
      threadId: "child-thread-1",
      messageId: "child-message-1",
      delta: " streamed",
    });

    expect(next.childMessagesByThreadId?.["child-thread-1"]?.[0]?.content).toBe("Child streamed");
    expect(next.messages).toEqual(state.messages);
  });

  it("uses the child thread parent edge when message events arrive before the run edge", () => {
    const state = desktopStateFixture({
      threads: [
        { id: "parent-thread", kind: "chat" } as ThreadSummary,
        {
          id: "child-thread-1",
          kind: "subagent_child",
          parentThreadId: "parent-thread",
          subagentRunId: "child-run-1",
        } as ThreadSummary,
      ],
      subagentRuns: [],
    });
    const message = messageFixture({ id: "early-child-message", content: "Early child stream" });

    const next = upsertChildThreadMessage(state, message);

    expect(childThreadIsVisibleUnderActiveParent(state, "child-thread-1")).toBe(true);
    expect(next.childMessagesByThreadId?.["child-thread-1"]).toEqual([message]);
  });

  it("ignores child messages when sub-agent UI is disabled or the active thread is itself a child", () => {
    const disabled = desktopStateFixture({ subagentsEnabled: false });
    const activeChild = desktopStateFixture({
      activeThreadId: "child-thread-1",
      threads: [{ id: "child-thread-1", kind: "subagent_child" } as ThreadSummary],
    });
    const message = messageFixture({ id: "child-message-1" });

    expect(upsertChildThreadMessage(disabled, message)).toBe(disabled);
    expect(upsertChildThreadMessage(activeChild, message)).toBe(activeChild);
  });
});

function desktopStateFixture(options: {
  activeThreadId?: string;
  threads?: ThreadSummary[];
  childMessagesByThreadId?: Record<string, ChatMessage[]>;
  subagentRuns?: SubagentRunSummary[];
  subagentsEnabled?: boolean;
} = {}): DesktopState {
  const activeThreadId = options.activeThreadId ?? "parent-thread";
  return {
    activeThreadId,
    threads: options.threads ?? [{ id: "parent-thread", kind: "chat" } as ThreadSummary],
    messages: [messageFixture({ id: "parent-message-1", threadId: "parent-thread", content: "Parent transcript" })],
    childMessagesByThreadId: options.childMessagesByThreadId,
    subagentRuns: options.subagentRuns ?? [
      {
        id: "child-run-1",
        parentThreadId: "parent-thread",
        childThreadId: "child-thread-1",
      } as SubagentRunSummary,
    ],
    featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: options.subagentsEnabled ?? true } }),
  } as DesktopState;
}

function messageFixture(options: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: options.id ?? "message-1",
    threadId: options.threadId ?? "child-thread-1",
    role: options.role ?? "assistant",
    content: options.content ?? "Child transcript",
    createdAt: options.createdAt ?? "2026-06-13T00:00:00.000Z",
    metadata: options.metadata,
  };
}
