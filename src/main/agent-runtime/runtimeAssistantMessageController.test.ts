import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import { createRuntimeAssistantMessageController } from "./runtimeAssistantMessageController";

function message(input: Partial<ChatMessage> & { id: string; content?: string }): ChatMessage {
  return {
    ...input,
    id: input.id,
    threadId: input.threadId ?? "thread-1",
    role: input.role ?? "assistant",
    content: input.content ?? "",
    createdAt: input.createdAt ?? "2026-06-15T00:00:00.000Z",
    metadata: input.metadata,
  };
}

function setup() {
  const messages = new Map<string, ChatMessage>();
  const initial = message({ id: "assistant-initial" });
  messages.set(initial.id, initial);
  const events: DesktopEvent[] = [];
  let nextId = 1;
  const controller = createRuntimeAssistantMessageController({
    threadId: "thread-1",
    initialAssistantMessage: initial,
    markRunActivity: vi.fn(() => true),
    resetAssistantStreamState: vi.fn(),
    resetThinkingStreamState: vi.fn(),
    listMessages: () => [...messages.values()],
    addAssistantMessage: vi.fn((input) => {
      const created = message({
        id: `created-${nextId}`,
        threadId: input.threadId,
        role: "assistant",
        content: input.content,
        metadata: input.metadata,
      });
      nextId += 1;
      messages.set(created.id, created);
      return created;
    }),
    appendToMessage: vi.fn((messageId, delta) => {
      const existing = messages.get(messageId);
      if (!existing) throw new Error(`Missing message ${messageId}`);
      const updated = { ...existing, content: existing.content + delta };
      messages.set(messageId, updated);
      return updated;
    }),
    replaceMessage: vi.fn((messageId, content, metadata) => {
      const existing = messages.get(messageId);
      if (!existing) throw new Error(`Missing message ${messageId}`);
      const updated = { ...existing, content, metadata };
      messages.set(messageId, updated);
      return updated;
    }),
    emitRunEvent: vi.fn((event) => {
      events.push(event);
    }),
  });
  return { controller, initial, messages, events };
}

describe("createRuntimeAssistantMessageController", () => {
  it("reuses the initial assistant message for the first assistant start", () => {
    const { controller, initial, events } = setup();

    controller.startAssistantMessage();

    expect(controller.currentAssistantMessageId()).toBe(initial.id);
    expect(controller.assistantStartCount()).toBe(1);
    expect(events).toEqual([]);
  });

  it("creates and emits subsequent assistant messages", () => {
    const { controller, events } = setup();

    controller.startAssistantMessage();
    controller.startAssistantMessage();
    controller.appendAssistantDelta("hello");

    expect(controller.currentAssistantMessageId()).toBe("created-1");
    expect(events).toContainEqual(expect.objectContaining({
      type: "message-created",
      message: expect.objectContaining({
        id: "created-1",
        metadata: expect.objectContaining({ status: "streaming", runtime: "pi", provider: "ambient" }),
      }),
    }));
    expect(events).toContainEqual({
      type: "message-delta",
      messageId: "created-1",
      delta: "hello",
      threadId: "thread-1",
    });
  });

  it("finishes the assistant message with stored content before falling back to streaming text", () => {
    const { controller, messages, events } = setup();
    messages.set("assistant-initial", message({ id: "assistant-initial", content: "stored answer" }));

    controller.finishCurrentAssistantMessage("done", "fallback answer");

    expect(messages.get("assistant-initial")).toMatchObject({
      content: "stored answer",
      metadata: expect.objectContaining({ status: "done", runtime: "pi", provider: "ambient" }),
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "message-updated",
      message: expect.objectContaining({ id: "assistant-initial", content: "stored answer" }),
    }));
  });

  it("starts a fresh thinking message after a prior thinking message finishes", () => {
    const { controller, events, messages } = setup();

    controller.appendThinkingDelta("step one");
    controller.finishCurrentThinkingMessage("done", "fallback thinking");
    controller.appendThinkingDelta("step two");

    expect(messages.get("created-1")).toMatchObject({
      content: "step one",
      metadata: expect.objectContaining({ status: "done", kind: "thinking" }),
    });
    expect(messages.get("created-2")).toMatchObject({
      content: "step two",
      metadata: expect.objectContaining({ status: "thinking", kind: "thinking" }),
    });
    expect(events.filter((event) => event.type === "message-created")).toHaveLength(2);
  });
});
