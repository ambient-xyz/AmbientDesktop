import { describe, expect, it } from "vitest";
import { queueStateFromSnapshots, reconcileQueuedMessages, resolveMessageDelivery } from "./messageDelivery";

describe("resolveMessageDelivery", () => {
  it("uses normal prompt delivery while idle", () => {
    expect(resolveMessageDelivery({ running: false })).toBe("prompt");
    expect(resolveMessageDelivery({ running: false, requested: "follow-up" })).toBe("prompt");
  });

  it("uses steering by default while a run is active", () => {
    expect(resolveMessageDelivery({ running: true })).toBe("steer");
    expect(resolveMessageDelivery({ running: true, requested: "prompt" })).toBe("steer");
  });

  it("uses follow-up delivery when requested during a run", () => {
    expect(resolveMessageDelivery({ running: true, followUpModifier: true })).toBe("follow-up");
    expect(resolveMessageDelivery({ running: true, requested: "follow-up" })).toBe("follow-up");
  });
});

describe("queueStateFromSnapshots", () => {
  it("projects only queued messages into queue state", () => {
    expect(
      queueStateFromSnapshots("thread-1", [
        { id: "1", content: "redirect", delivery: "steer", status: "queued" },
        { id: "2", content: "later", delivery: "follow-up", status: "queued" },
        { id: "3", content: "sent", delivery: "steer", status: "sent" },
      ]),
    ).toEqual({ threadId: "thread-1", steering: ["redirect"], followUp: ["later"] });
  });

  it("uses transport content for context-augmented queued messages", () => {
    expect(
      queueStateFromSnapshots("thread-1", [
        { id: "1", content: "plain", modelContent: "context\n\nplain", delivery: "steer", status: "queued" },
      ]),
    ).toEqual({ threadId: "thread-1", steering: ["context\n\nplain"], followUp: [] });
  });
});

describe("reconcileQueuedMessages", () => {
  it("marks messages sent when Pi no longer reports them in the queue", () => {
    expect(
      reconcileQueuedMessages(
        [
          { id: "1", content: "redirect", delivery: "steer", status: "queued" },
          { id: "2", content: "later", delivery: "follow-up", status: "queued" },
        ],
        { steering: [], followUp: ["later"] },
      ),
    ).toEqual([
      { id: "1", content: "redirect", delivery: "steer", status: "sent" },
      { id: "2", content: "later", delivery: "follow-up", status: "queued" },
    ]);
  });

  it("handles duplicate queued text with counted matching", () => {
    expect(
      reconcileQueuedMessages(
        [
          { id: "1", content: "same", delivery: "steer", status: "queued" },
          { id: "2", content: "same", delivery: "steer", status: "queued" },
        ],
        { steering: ["same"], followUp: [] },
      ),
    ).toEqual([
      { id: "1", content: "same", delivery: "steer", status: "queued" },
      { id: "2", content: "same", delivery: "steer", status: "sent" },
    ]);
  });

  it("matches queued messages by transport content when present", () => {
    expect(
      reconcileQueuedMessages(
        [{ id: "1", content: "plain", modelContent: "context\n\nplain", delivery: "steer", status: "queued" }],
        { steering: [], followUp: [] },
      ),
    ).toEqual([{ id: "1", content: "plain", modelContent: "context\n\nplain", delivery: "steer", status: "sent" }]);
  });
});
