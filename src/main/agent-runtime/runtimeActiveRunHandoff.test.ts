import { describe, expect, it, vi } from "vitest";
import type { SendMessageInput } from "../../shared/desktopTypes";
import {
  handleRuntimeActiveRunHandoff,
  type RuntimeActiveRunHandoffActiveRun,
} from "./runtimeActiveRunHandoff";

function sendInput(overrides: Partial<SendMessageInput> = {}): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "Continue this run.",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-preview",
    thinkingLevel: "medium",
    delivery: "prompt",
    context: [],
    ...overrides,
  };
}

function activeRun(
  overrides: Partial<RuntimeActiveRunHandoffActiveRun> = {},
): RuntimeActiveRunHandoffActiveRun {
  return {
    settled: Promise.resolve(),
    ...overrides,
  };
}

describe("handleRuntimeActiveRunHandoff", () => {
  it("continues when there is no active run", async () => {
    const queueDuringRun = vi.fn();
    const onActivity = vi.fn();

    await expect(handleRuntimeActiveRunHandoff({
      sendInput: sendInput(),
      queueDuringRun,
      hooks: { onActivity },
    })).resolves.toBe(false);

    expect(queueDuringRun).not.toHaveBeenCalled();
    expect(onActivity).not.toHaveBeenCalled();
  });

  it("queues a prompt as steering input and removes the activity listener", async () => {
    const removeActivityListener = vi.fn();
    const onActivity = vi.fn();
    const run = activeRun({
      addActivityListener: vi.fn(() => removeActivityListener),
    });
    const input = sendInput();
    const queueDuringRun = vi.fn(async () => undefined);

    await expect(handleRuntimeActiveRunHandoff({
      sendInput: input,
      activeRun: run,
      queueDuringRun,
      hooks: { onActivity },
    })).resolves.toBe(true);

    expect(run.addActivityListener).toHaveBeenCalledWith(onActivity);
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(queueDuringRun).toHaveBeenCalledWith(input, run, "steer");
    expect(removeActivityListener).toHaveBeenCalledTimes(1);
  });

  it("queues follow-up delivery and waits for queued completion when requested", async () => {
    let settleActiveRun!: () => void;
    const settled = new Promise<void>((resolve) => {
      settleActiveRun = resolve;
    });
    const run = activeRun({ settled });
    const queueDuringRun = vi.fn(async () => undefined);
    let resolved = false;

    const handoff = handleRuntimeActiveRunHandoff({
      sendInput: sendInput({ delivery: "follow-up" }),
      activeRun: run,
      queueDuringRun,
      hooks: { awaitQueuedDeliveryCompletion: true },
    }).then((handled) => {
      resolved = true;
      return handled;
    });

    await Promise.resolve();
    expect(queueDuringRun).toHaveBeenCalledWith(expect.objectContaining({ delivery: "follow-up" }), run, "follow-up");
    expect(resolved).toBe(false);
    settleActiveRun();
    await expect(handoff).resolves.toBe(true);
    expect(resolved).toBe(true);
  });

  it("removes the activity listener when queueing fails", async () => {
    const removeActivityListener = vi.fn();
    const run = activeRun({
      addActivityListener: vi.fn(() => removeActivityListener),
    });

    await expect(handleRuntimeActiveRunHandoff({
      sendInput: sendInput(),
      activeRun: run,
      queueDuringRun: vi.fn(async () => {
        throw new Error("queue failed");
      }),
      hooks: { onActivity: vi.fn() },
    })).rejects.toThrow("queue failed");

    expect(removeActivityListener).toHaveBeenCalledTimes(1);
  });

  it("blocks workflow recording review while a normal run is active", async () => {
    await expect(handleRuntimeActiveRunHandoff({
      sendInput: sendInput(),
      incomingDedicatedSessionKind: "workflow-recording-review",
      activeRun: activeRun(),
      queueDuringRun: vi.fn(),
    })).rejects.toThrow("Wait for the current Ambient run to finish before starting workflow recording review.");
  });

  it("allows workflow recording review handoff when the active run is also a review session", async () => {
    const run = activeRun({ dedicatedSessionKind: "workflow-recording-review" });
    const queueDuringRun = vi.fn(async () => undefined);

    await expect(handleRuntimeActiveRunHandoff({
      sendInput: sendInput(),
      incomingDedicatedSessionKind: "workflow-recording-review",
      activeRun: run,
      queueDuringRun,
    })).resolves.toBe(true);

    expect(queueDuringRun).toHaveBeenCalledWith(expect.any(Object), run, "steer");
  });
});
