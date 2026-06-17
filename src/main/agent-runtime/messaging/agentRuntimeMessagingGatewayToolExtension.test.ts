import { describe, expect, it, vi } from "vitest";

import { createAgentRuntimeMessagingRuntimeBridge } from "./agentRuntimeMessagingGatewayToolExtension";

describe("agentRuntimeMessagingGatewayToolExtension", () => {
  it("forwards messaging runtime bridge callbacks through injected runtime state", async () => {
    const status = { providers: [] };
    const decoratedStatus = { providers: [], remoteSurfaceRuntimeEvents: [] };
    const runtimeEvent = { id: "runtime-event-1" };
    const remoteSurfaceRuntimeEvents = {
      status: vi.fn(() => decoratedStatus),
      markRelay: vi.fn(() => true),
      record: vi.fn(() => runtimeEvent),
    };
    const activeRuns = new Map<string, unknown>([["thread-1", {}]]);
    const pendingProjectSwitchByThreadId = new Map<string, unknown>();
    const completePendingProjectSwitch = vi.fn(async () => "completed");
    const projectSwitch = {
      runtimeEventId: "runtime-event-1",
      workspacePath: "/workspace-next",
      reason: "remote-surface-command",
    };

    const bridge = createAgentRuntimeMessagingRuntimeBridge({
      threadId: "thread-1",
      workspacePath: "/workspace",
      remoteSurfaceRuntimeEvents: remoteSurfaceRuntimeEvents as any,
      activeRuns,
      pendingProjectSwitchByThreadId: pendingProjectSwitchByThreadId as any,
      completePendingProjectSwitch,
    });

    expect(bridge.messagingGatewayStatusWithRemoteSurfaceEvents(status as any)).toBe(decoratedStatus);
    bridge.markRemoteSurfaceRuntimeEventRelay({
      applyStatus: "sent",
      providerId: "telegram-tdlib",
      delivery: {},
      runtimeEvent,
    } as any);
    expect(bridge.isRunActive()).toBe(true);
    expect(bridge.recordRuntimeEvent({ kind: "project-switch", title: "Switch project" } as any)).toBe(runtimeEvent);
    bridge.storePendingProjectSwitch(projectSwitch);
    await expect(bridge.completeProjectSwitch(projectSwitch)).resolves.toBe("completed");

    expect(remoteSurfaceRuntimeEvents.status).toHaveBeenCalledWith(status);
    expect(remoteSurfaceRuntimeEvents.markRelay).toHaveBeenCalledWith(expect.objectContaining({ providerId: "telegram-tdlib" }));
    expect(remoteSurfaceRuntimeEvents.record).toHaveBeenCalledWith({ kind: "project-switch", title: "Switch project" });
    expect(pendingProjectSwitchByThreadId.get("thread-1")).toBe(projectSwitch);
    expect(completePendingProjectSwitch).toHaveBeenCalledWith(projectSwitch, {
      threadId: "thread-1",
      workspacePath: "/workspace",
      throwOnFailure: true,
    });
  });
});
