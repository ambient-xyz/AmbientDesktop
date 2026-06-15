import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, DesktopEvent } from "../../shared/types";
import {
  createRuntimeQueuedMessageController,
  type RuntimeQueuedMessageControllerInput,
  type RuntimeQueuedMessageSession,
  type RuntimeQueuedMessageSnapshot,
} from "./runtimeQueuedMessageController";

const createdAt = "2026-06-15T00:00:00.000Z";

function queuedMessage(
  overrides: Partial<RuntimeQueuedMessageSnapshot> = {},
): RuntimeQueuedMessageSnapshot {
  return {
    id: "queued-1",
    content: "Queued prompt",
    delivery: "steer",
    status: "queued",
    ...overrides,
  };
}

function chatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "queued-1",
    threadId: "thread-1",
    role: "user",
    content: "Queued prompt",
    createdAt,
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<RuntimeQueuedMessageControllerInput> = {},
): RuntimeQueuedMessageControllerInput & { emitted: DesktopEvent[]; runEventSeq: { value: number } } {
  const emitted: DesktopEvent[] = [];
  const runEventSeq = { value: 0 };
  return {
    threadId: "thread-1",
    workspacePath: "/workspace",
    isRunStoreActive: vi.fn(() => true),
    markRunActivity: vi.fn(() => true),
    getSession: vi.fn(() => undefined),
    isQueueReady: vi.fn(() => false),
    incrementRunEventSeq: vi.fn(() => {
      runEventSeq.value += 1;
    }),
    replaceMessage: vi.fn((messageId: string, content: string, metadata: Record<string, unknown>) =>
      chatMessage({ id: messageId, content, metadata })),
    emitRunEvent: vi.fn((event: DesktopEvent) => {
      emitted.push(event);
    }),
    emitted,
    runEventSeq,
    ...overrides,
  };
}

describe("createRuntimeQueuedMessageController", () => {
  it("queues messages locally when the session is not ready", async () => {
    const input = baseInput();
    const controller = createRuntimeQueuedMessageController(input);

    await controller.enqueue(queuedMessage());

    expect(controller.messages()).toEqual([queuedMessage()]);
    expect(input.incrementRunEventSeq).toHaveBeenCalledTimes(1);
    expect(input.markRunActivity).toHaveBeenCalledTimes(1);
    expect(input.emitted).toEqual([{
      type: "queue-updated",
      queue: { threadId: "thread-1", steering: ["Queued prompt"], followUp: [] },
    }]);
  });

  it("delivers queued messages immediately when the session is ready", async () => {
    const session: RuntimeQueuedMessageSession = {
      steer: vi.fn(async () => undefined),
      followUp: vi.fn(async () => undefined),
    };
    const input = baseInput({
      getSession: vi.fn(() => session),
      isQueueReady: vi.fn(() => true),
    });
    const controller = createRuntimeQueuedMessageController(input);

    await controller.enqueue(queuedMessage({ modelContent: "Model prompt" }));
    await controller.enqueue(queuedMessage({ id: "queued-2", delivery: "follow-up", imageInputs: [] }));

    expect(session.steer).toHaveBeenCalledWith("Model prompt", undefined);
    expect(session.followUp).toHaveBeenCalledWith("Queued prompt", []);
  });

  it("flushes pending queued messages once a session is available", async () => {
    let session: RuntimeQueuedMessageSession | undefined;
    const input = baseInput({
      getSession: vi.fn(() => session),
      isQueueReady: vi.fn(() => false),
    });
    const controller = createRuntimeQueuedMessageController(input);

    await controller.enqueue(queuedMessage());
    session = {
      steer: vi.fn(async () => undefined),
      followUp: vi.fn(async () => undefined),
    };
    await controller.flushPending();

    expect(session.steer).toHaveBeenCalledWith("Queued prompt", undefined);
  });

  it("marks failed deliveries and emits an error when still active", async () => {
    const session: RuntimeQueuedMessageSession = {
      steer: vi.fn(async () => {
        throw new Error("steer failed");
      }),
      followUp: vi.fn(async () => undefined),
    };
    const input = baseInput({
      getSession: vi.fn(() => session),
      isQueueReady: vi.fn(() => true),
    });
    const controller = createRuntimeQueuedMessageController(input);

    await controller.enqueue(queuedMessage());

    expect(input.replaceMessage).toHaveBeenCalledWith(
      "queued-1",
      "Queued prompt",
      expect.objectContaining({ status: "error", runtime: "pi" }),
    );
    expect(input.emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "message-updated" }),
      { type: "error", message: "steer failed", threadId: "thread-1", workspacePath: "/workspace" },
    ]));
  });

  it("reconciles queue snapshots and marks missing queued messages as sent", async () => {
    const input = baseInput();
    const controller = createRuntimeQueuedMessageController(input);
    await controller.enqueue(queuedMessage({ id: "steer-1", content: "Keep" }));
    await controller.enqueue(queuedMessage({ id: "steer-2", content: "Drop" }));

    controller.reconcileQueueUpdate(["Keep"], []);

    expect(controller.messages()).toEqual([
      queuedMessage({ id: "steer-1", content: "Keep" }),
      queuedMessage({ id: "steer-2", content: "Drop", status: "sent" }),
    ]);
    expect(input.replaceMessage).toHaveBeenCalledWith(
      "steer-2",
      "Drop",
      expect.objectContaining({ status: "sent", runtime: "pi" }),
    );
    expect(input.emitted.at(-1)).toEqual({
      type: "queue-updated",
      queue: { threadId: "thread-1", steering: ["Keep"], followUp: [] },
    });
  });

  it("marks queued messages aborted and emits an empty queue", async () => {
    const input = baseInput();
    const controller = createRuntimeQueuedMessageController(input);
    await controller.enqueue(queuedMessage({ id: "queued-1", status: "queued" }));
    await controller.enqueue(queuedMessage({ id: "sent-1", status: "sent" }));

    controller.markQueuedMessagesAborted();

    expect(controller.messages()).toEqual([
      queuedMessage({ id: "queued-1", status: "aborted" }),
      queuedMessage({ id: "sent-1", status: "sent" }),
    ]);
    expect(input.replaceMessage).toHaveBeenCalledWith(
      "queued-1",
      "Queued prompt",
      expect.objectContaining({ status: "aborted", runtime: "pi" }),
    );
    expect(input.emitted.at(-1)).toEqual({
      type: "queue-updated",
      queue: { threadId: "thread-1", steering: [], followUp: [] },
    });
  });

  it("reports queued or sent input for goal continuation gating", async () => {
    const controller = createRuntimeQueuedMessageController(baseInput());

    expect(controller.hasQueuedOrSentInput()).toBe(false);
    await controller.enqueue(queuedMessage({ status: "queued" }));
    expect(controller.hasQueuedOrSentInput()).toBe(true);
    controller.markQueuedMessagesAborted();
    expect(controller.hasQueuedOrSentInput()).toBe(false);
  });
});
