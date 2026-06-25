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
    getMessage: (messageId) => messages.get(messageId),
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
    const { controller, initial, events, messages } = setup();

    controller.startAssistantMessage();

    expect(controller.currentAssistantMessageId()).toBe(initial.id);
    expect(controller.assistantStartCount()).toBe(1);
    expect(messages.get(initial.id)?.metadata).toEqual(expect.objectContaining({
      status: "streaming",
      promptCache: { status: "pending" },
    }));
    expect(events).toEqual([
      expect.objectContaining({
        type: "message-updated",
        message: expect.objectContaining({ id: initial.id }),
      }),
    ]);
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
        metadata: expect.objectContaining({
          status: "streaming",
          runtime: "pi",
          provider: "ambient",
          promptCache: { status: "pending" },
        }),
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

  it("suppresses prior assistant messages while preserving the current one", () => {
    const { controller, messages, events } = setup();

    controller.startAssistantMessage();
    controller.appendAssistantDelta("pre-tool parent chatter");
    controller.startAssistantMessage();
    controller.appendAssistantDelta("post-tool final blocker");

    const suppressed = controller.suppressAssistantMessagesExceptCurrent("error");

    expect(suppressed).toHaveLength(1);
    expect(messages.get("assistant-initial")).toMatchObject({
      content: "",
      metadata: expect.objectContaining({ status: "error", runtime: "pi" }),
    });
    expect(messages.get("created-1")).toMatchObject({
      content: "post-tool final blocker",
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "message-updated",
      message: expect.objectContaining({ id: "assistant-initial", content: "" }),
    }));
  });

  it("starts a fresh thinking message after a prior thinking message finishes", () => {
    const { controller, events, messages } = setup();

    controller.appendThinkingDelta("step one");
    controller.finishCurrentThinkingMessage("done", "fallback thinking");
    controller.appendThinkingDelta("step two");

    expect(messages.get("created-1")).toMatchObject({
      content: "step one",
      metadata: expect.objectContaining({ status: "done", kind: "thinking", promptCache: { status: "pending" } }),
    });
    expect(messages.get("created-2")).toMatchObject({
      content: "step two",
      metadata: expect.objectContaining({ status: "thinking", kind: "thinking", promptCache: { status: "pending" } }),
    });
    expect(events.filter((event) => event.type === "message-created")).toHaveLength(2);
  });

  it("applies final prompt cache telemetry to current assistant and completed thinking messages", () => {
    const { controller, messages, events } = setup();

    controller.startAssistantMessage();
    controller.appendThinkingDelta("internal");
    controller.finishCurrentThinkingMessage("done", "fallback");
    controller.appendAssistantDelta("answer");

    const updated = controller.applyPromptCacheTelemetry({
      status: "hit",
      usage: { input: 1200, output: 50, cacheRead: 900, cacheWrite: 0, totalTokens: 1250 },
    });

    expect(updated.map((message) => message.id).sort()).toEqual(["assistant-initial", "created-1"]);
    expect(messages.get("assistant-initial")?.metadata).toMatchObject({
      status: "streaming",
      promptCache: { status: "hit", usage: { cacheRead: 900 } },
    });
    expect(messages.get("created-1")?.metadata).toMatchObject({
      status: "done",
      kind: "thinking",
      promptCache: { status: "hit", usage: { cacheRead: 900 } },
    });
    expect(events.filter((event) =>
      event.type === "message-updated" &&
      event.message.metadata?.promptCache?.status === "hit"
    )).toHaveLength(2);
  });

  it("resets pending telemetry for a subsequent assistant request", () => {
    const { controller, messages } = setup();

    controller.startAssistantMessage();
    controller.applyPromptCacheTelemetry({ status: "hit", usage: { cacheRead: 100 } });
    controller.startAssistantMessage();
    controller.appendThinkingDelta("second request thinking");

    expect(messages.get("created-1")?.metadata).toMatchObject({
      status: "streaming",
      promptCache: { status: "pending" },
    });
    expect(messages.get("created-2")?.metadata).toMatchObject({
      status: "thinking",
      kind: "thinking",
      promptCache: { status: "pending" },
    });
    expect(controller.currentPromptCacheTelemetry()).toEqual({ status: "pending" });
  });

  it("preserves each assistant message prompt cache telemetry during suppression", () => {
    const { controller, messages } = setup();

    controller.startAssistantMessage();
    controller.appendAssistantDelta("first");
    controller.applyPromptCacheTelemetry({ status: "hit", usage: { cacheRead: 100 } });
    controller.startAssistantMessage();
    controller.appendAssistantDelta("second");
    controller.applyPromptCacheTelemetry({ status: "miss", usage: { cacheRead: 0 } });

    controller.suppressAssistantMessagesExceptCurrent("error");

    expect(messages.get("assistant-initial")?.metadata).toMatchObject({
      status: "error",
      promptCache: { status: "hit", usage: { cacheRead: 100 } },
    });
    expect(messages.get("created-1")?.metadata).toMatchObject({
      status: "streaming",
      promptCache: { status: "miss", usage: { cacheRead: 0 } },
    });
  });

  it("preserves each thinking message prompt cache telemetry during suppression", () => {
    const { controller, messages } = setup();

    controller.startAssistantMessage();
    controller.appendThinkingDelta("first thinking");
    controller.finishCurrentThinkingMessage("done", "first fallback");
    controller.applyPromptCacheTelemetry({ status: "hit", usage: { cacheRead: 100 } });
    controller.startAssistantMessage();
    controller.appendThinkingDelta("second thinking");
    controller.applyPromptCacheTelemetry({ status: "miss", usage: { cacheRead: 0 } });

    controller.suppressCurrentThinkingMessage("done");

    expect(messages.get("created-1")?.metadata).toMatchObject({
      status: "done",
      kind: "thinking",
      promptCache: { status: "hit", usage: { cacheRead: 100 } },
    });
    expect(messages.get("created-3")?.metadata).toMatchObject({
      status: "done",
      kind: "thinking",
      promptCache: { status: "miss", usage: { cacheRead: 0 } },
    });
  });

  it("only completes pending telemetry as unknown", () => {
    const { controller, messages } = setup();

    controller.startAssistantMessage();
    controller.completePromptCacheTelemetryIfPending({ status: "unknown" });
    controller.completePromptCacheTelemetryIfPending({ status: "miss", usage: { cacheRead: 0 } });

    expect(messages.get("assistant-initial")?.metadata).toMatchObject({
      promptCache: { status: "unknown" },
    });
    expect(controller.currentPromptCacheTelemetry()).toEqual({ status: "unknown" });
  });

  it("suppresses thinking messages without creating one", () => {
    const { controller, events, messages } = setup();

    expect(controller.suppressCurrentThinkingMessage("done")).toBeUndefined();
    controller.appendThinkingDelta("first internal status");
    controller.finishCurrentThinkingMessage("done", "first fallback");
    controller.appendThinkingDelta("second internal status");

    const suppressed = controller.suppressCurrentThinkingMessage("done");

    expect(suppressed).toMatchObject({
      id: "created-2",
      content: "",
      metadata: expect.objectContaining({ status: "done", kind: "thinking" }),
    });
    expect(messages.get("created-1")).toMatchObject({ content: "" });
    expect(messages.get("created-2")).toMatchObject({ content: "" });
    expect(events.filter((event) => event.type === "message-created")).toHaveLength(2);
  });
});
