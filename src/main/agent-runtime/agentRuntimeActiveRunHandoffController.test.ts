import { describe, expect, it, vi } from "vitest";
import type { SendMessageInput } from "../../shared/desktopTypes";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { ThreadSummary } from "../../shared/threadTypes";
import { SYMPHONY_PARENT_MODE_ACTIVE_RUN_HANDOFF_ERROR } from "./agentRuntimeSymphonyParentMode";
import {
  AgentRuntimeActiveRunHandoffController,
  type AgentRuntimeActiveRunHandoffControllerOptions,
  type AgentRuntimeActiveRunHandoffActiveRun,
} from "./agentRuntimeActiveRunHandoffController";

describe("AgentRuntimeActiveRunHandoffController", () => {
  it("does not downgrade the active thread permission mode when queuing a stale follow-up", async () => {
    let thread = threadSummary({
      id: "thread-queued-stale-permission",
      permissionMode: "full-access",
    });
    const store = {
      getThread: vi.fn(() => thread),
      updateThreadSettings: vi.fn((_threadId: string, update: Record<string, unknown>) => {
        expect(update).not.toHaveProperty("permissionMode");
        thread = { ...thread, ...update };
        return thread;
      }),
      addMessage: vi.fn((message: Record<string, unknown>) => ({ id: "message-queued", createdAt: new Date().toISOString(), ...message })),
      markThreadRead: vi.fn(() => thread),
    };
    const run = createActiveRun();
    const controller = controllerWithStore(store);

    await expect(controller.handleSendActiveRunHandoff(sendInput(thread.id, {
      content: "continue this card",
      permissionMode: "workspace",
      delivery: "follow-up",
    }), run)).resolves.toBe(true);

    expect(thread.permissionMode).toBe("full-access");
    expect(store.updateThreadSettings).toHaveBeenCalledWith(thread.id, {
      collaborationMode: "agent",
      model: "ambient-preview",
      thinkingLevel: "medium",
    });
    expect(run.queue).toHaveBeenCalledWith(expect.objectContaining({
      id: "message-queued",
      content: "continue this card",
      modelContent: "model:continue this card",
      delivery: "follow-up",
      status: "queued",
    }));
  });

  it("does not write thread settings when queuing an internal active-run retry", async () => {
    const thread = threadSummary({
      id: "thread-queued-internal-retry",
      permissionMode: "full-access",
    });
    const store = {
      getThread: vi.fn(() => thread),
      updateThreadSettings: vi.fn(() => thread),
      addMessage: vi.fn((message: Record<string, unknown>) => ({ id: "message-queued", createdAt: new Date().toISOString(), ...message })),
      markThreadRead: vi.fn(() => thread),
    };
    const run = createActiveRun();
    const controller = controllerWithStore(store);

    await expect(controller.handleSendActiveRunHandoff({
      ...sendInput(thread.id, {
        content: "continue after provider interruption",
        permissionMode: "workspace",
        collaborationMode: "planner",
        model: "stale-model",
        thinkingLevel: "minimal",
        delivery: "follow-up",
      }),
      internal: true,
    } as SendMessageInput & { internal: true }, run)).resolves.toBe(true);

    expect(store.updateThreadSettings).not.toHaveBeenCalled();
    expect(thread).toMatchObject({
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: "ambient-preview",
      thinkingLevel: "medium",
    });
  });

  it("forwards queued active-run activity to awaiting callers", async () => {
    const thread = threadSummary({ id: "thread-queued-activity" });
    const store = {
      getThread: vi.fn(() => thread),
      updateThreadSettings: vi.fn(() => thread),
      addMessage: vi.fn((message: Record<string, unknown>) => ({ id: "message-queued", createdAt: new Date().toISOString(), ...message })),
      markThreadRead: vi.fn(() => thread),
    };
    let settleActiveRun!: () => void;
    const settled = new Promise<void>((resolve) => {
      settleActiveRun = resolve;
    });
    let activeRunActivityListener: (() => void) | undefined;
    const removeActivityListener = vi.fn();
    const run = createActiveRun({
      settled,
      addActivityListener: vi.fn((listener: () => void) => {
        activeRunActivityListener = listener;
        return removeActivityListener;
      }),
    });
    const controller = controllerWithStore(store);
    const onActivity = vi.fn();

    const sendPromise = controller.handleSendActiveRunHandoff(
      sendInput(thread.id, { content: "continue this card" }),
      run,
      { awaitQueuedDeliveryCompletion: true, onActivity },
    );

    await Promise.resolve();
    expect(onActivity).toHaveBeenCalledTimes(1);
    activeRunActivityListener?.();
    expect(onActivity).toHaveBeenCalledTimes(2);

    settleActiveRun();
    await sendPromise;
    expect(removeActivityListener).toHaveBeenCalledTimes(1);
  });

  it("rejects Symphony parent-mode handoff into an unrestricted active run", async () => {
    const thread = threadSummary({ id: "thread-symphony-active-run" });
    const controller = controllerWithStore({
      getThread: vi.fn(() => thread),
      updateThreadSettings: vi.fn(() => thread),
      addMessage: vi.fn(),
      markThreadRead: vi.fn(() => thread),
    });

    await expect(controller.handleSendActiveRunHandoff({
      ...sendInput(thread.id, {
        composerIntent: {
          kind: "symphony-workflow",
          action: "run-once",
          patternId: "map_reduce",
        },
      }),
    }, createActiveRun())).rejects.toThrow(SYMPHONY_PARENT_MODE_ACTIVE_RUN_HANDOFF_ERROR);
  });
});

function controllerWithStore(store: {
  getThread: () => ThreadSummary;
  updateThreadSettings: (threadId: string, update: Record<string, unknown>) => ThreadSummary;
  addMessage: (message: Record<string, unknown>) => Record<string, unknown>;
  markThreadRead: (threadId: string) => ThreadSummary;
}): AgentRuntimeActiveRunHandoffController {
  return new AgentRuntimeActiveRunHandoffController({
    store: store as unknown as AgentRuntimeActiveRunHandoffControllerOptions["store"],
    getFeatureFlagSnapshot: () =>
      resolveAmbientFeatureFlags({
        settings: {
          subagents: true,
        },
      }),
    applyThreadModelSettings: vi.fn(async () => undefined),
    modelContentForSendInput: (input) => `model:${input.content}`,
    emit: vi.fn(),
  });
}

function createActiveRun(
  overrides: Partial<AgentRuntimeActiveRunHandoffActiveRun> = {},
): AgentRuntimeActiveRunHandoffActiveRun {
  return {
    queue: vi.fn(async () => undefined),
    settled: Promise.resolve(),
    ...overrides,
  };
}

function threadSummary(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    workspacePath: "/tmp/ambient-active-run-workspace",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-preview",
    thinkingLevel: "medium",
    ...overrides,
  } as ThreadSummary;
}

function sendInput(threadId: string, overrides: Partial<SendMessageInput> = {}): SendMessageInput {
  return {
    threadId,
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
