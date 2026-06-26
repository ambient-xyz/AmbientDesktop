import { describe, expect, it, vi } from "vitest";

import {
  completeMessagingRemoteSurfaceCommandPendingProjectSwitch,
  finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun,
  messagingRemoteSurfaceCommandApplyProjectSwitch,
  messagingRemoteSurfaceCommandProjectSwitchPlan,
  messagingRemoteSurfaceCommandSwitchProjectCanceledPatch,
  messagingRemoteSurfaceCommandSwitchProjectCompletedPatch,
  messagingRemoteSurfaceCommandSwitchProjectFailedPatch,
  messagingRemoteSurfaceCommandSwitchProjectPendingEvent,
  messagingRemoteSurfaceCommandSwitchProjectUnavailableEvent,
  messagingRemoteSurfaceCommandSwitchProjectUnavailablePatch,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import {
  commandPreview,
  pendingProjectSwitch,
  switchProjectResult,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools.testHelpers";

describe("Remote Ambient Surface command apply project switching", () => {
  it("builds project-switch apply plans", () => {
    expect(
      messagingRemoteSurfaceCommandProjectSwitchPlan({
        preview: commandPreview(),
        threadId: "thread-1",
        switchProjectAvailable: true,
        deferProjectSwitch: false,
        failedAt: "2026-06-11T00:00:00.000Z",
      }),
    ).toEqual({ status: "none" });

    expect(
      messagingRemoteSurfaceCommandProjectSwitchPlan({
        preview: switchProjectResult(),
        threadId: "thread-1",
        switchProjectAvailable: false,
        deferProjectSwitch: false,
        failedAt: "2026-06-11T00:00:00.000Z",
      }),
    ).toMatchObject({
      status: "unavailable",
      message: "Ambient active project switching is not available in this runtime.",
      event: {
        kind: "active_project_switch",
        status: "failed",
        threadId: "thread-1",
        queuedProjectionId: "projection-switch",
        projectName: "Research project",
        failedAt: "2026-06-11T00:00:00.000Z",
        relaySuggested: true,
      },
    });

    expect(
      messagingRemoteSurfaceCommandProjectSwitchPlan({
        preview: switchProjectResult(),
        threadId: "thread-1",
        switchProjectAvailable: true,
        deferProjectSwitch: true,
        failedAt: "2026-06-11T00:00:00.000Z",
      }),
    ).toMatchObject({
      status: "pending",
      deferProjectSwitch: true,
      targetProject: {
        path: "/workspace/research",
        name: "Research project",
      },
      event: {
        kind: "active_project_switch",
        status: "pending",
        summary: "Active Ambient project switch to Research project is scheduled after the current Pi turn finishes.",
        relaySuggested: false,
      },
      projectSwitch: {
        workspacePath: "/workspace/research",
        reason: "remote-surface-command:switch_project",
        projectName: "Research project",
      },
    });
  });

  it("does not apply project switches when the project-switch plan has no work", async () => {
    const recordRuntimeEvent = vi.fn();
    const storePendingProjectSwitch = vi.fn();
    const completeProjectSwitch = vi.fn();

    await expect(
      messagingRemoteSurfaceCommandApplyProjectSwitch({
        projectSwitchPlan: { status: "none" },
        recordRuntimeEvent,
        storePendingProjectSwitch,
        completeProjectSwitch,
      }),
    ).resolves.toEqual({});

    expect(recordRuntimeEvent).not.toHaveBeenCalled();
    expect(storePendingProjectSwitch).not.toHaveBeenCalled();
    expect(completeProjectSwitch).not.toHaveBeenCalled();
  });

  it("records unavailable project-switch events and preserves the runtime error", async () => {
    const projectSwitchPlan = messagingRemoteSurfaceCommandProjectSwitchPlan({
      preview: switchProjectResult(),
      threadId: "thread-1",
      switchProjectAvailable: false,
      deferProjectSwitch: false,
      failedAt: "2026-06-11T00:00:00.000Z",
    });
    const recordRuntimeEvent = vi.fn(() => ({ id: "remote-surface-event-1" }));
    const storePendingProjectSwitch = vi.fn();
    const completeProjectSwitch = vi.fn();

    await expect(
      messagingRemoteSurfaceCommandApplyProjectSwitch({
        projectSwitchPlan,
        recordRuntimeEvent,
        storePendingProjectSwitch,
        completeProjectSwitch,
      }),
    ).rejects.toThrow("Ambient active project switching is not available in this runtime.");

    expect(recordRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "active_project_switch",
        status: "failed",
        threadId: "thread-1",
        queuedProjectionId: "projection-switch",
      }),
    );
    expect(storePendingProjectSwitch).not.toHaveBeenCalled();
    expect(completeProjectSwitch).not.toHaveBeenCalled();
  });

  it("queues deferred project switches after recording the pending runtime event", async () => {
    const projectSwitchPlan = messagingRemoteSurfaceCommandProjectSwitchPlan({
      preview: switchProjectResult(),
      threadId: "thread-1",
      switchProjectAvailable: true,
      deferProjectSwitch: true,
      failedAt: "2026-06-11T00:00:00.000Z",
    });
    const recordRuntimeEvent = vi.fn(() => ({ id: "remote-surface-event-1" }));
    const storePendingProjectSwitch = vi.fn();
    const completeProjectSwitch = vi.fn();

    await expect(
      messagingRemoteSurfaceCommandApplyProjectSwitch({
        projectSwitchPlan,
        recordRuntimeEvent,
        storePendingProjectSwitch,
        completeProjectSwitch,
      }),
    ).resolves.toEqual({});

    expect(recordRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "active_project_switch",
        status: "pending",
        summary: "Active Ambient project switch to Research project is scheduled after the current Pi turn finishes.",
      }),
    );
    expect(storePendingProjectSwitch).toHaveBeenCalledWith({
      workspacePath: "/workspace/research",
      reason: "remote-surface-command:switch_project",
      projectName: "Research project",
      runtimeEventId: "remote-surface-event-1",
    });
    expect(completeProjectSwitch).not.toHaveBeenCalled();
  });

  it("completes immediate project switches after recording the pending runtime event", async () => {
    const projectSwitchPlan = messagingRemoteSurfaceCommandProjectSwitchPlan({
      preview: switchProjectResult(),
      threadId: "thread-1",
      switchProjectAvailable: true,
      deferProjectSwitch: false,
      failedAt: "2026-06-11T00:00:00.000Z",
    });
    const recordRuntimeEvent = vi.fn(() => ({ id: "remote-surface-event-1" }));
    const storePendingProjectSwitch = vi.fn();
    const completeProjectSwitch = vi.fn(async () => undefined);

    await expect(
      messagingRemoteSurfaceCommandApplyProjectSwitch({
        projectSwitchPlan,
        recordRuntimeEvent,
        storePendingProjectSwitch,
        completeProjectSwitch,
      }),
    ).resolves.toEqual({
      completedProjectSwitch: switchProjectResult().targetProject,
    });

    expect(recordRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "active_project_switch",
        status: "pending",
        summary: "Active Ambient project switch to Research project is being applied now.",
      }),
    );
    expect(completeProjectSwitch).toHaveBeenCalledWith({
      workspacePath: "/workspace/research",
      reason: "remote-surface-command:switch_project",
      projectName: "Research project",
      runtimeEventId: "remote-surface-event-1",
    });
    expect(storePendingProjectSwitch).not.toHaveBeenCalled();
  });

  it("builds failed project-switch runtime events when project switching is unavailable", () => {
    expect(
      messagingRemoteSurfaceCommandSwitchProjectUnavailableEvent({
        preview: switchProjectResult(),
        threadId: "thread-1",
        message: "Ambient active project switching is not available in this runtime.",
        failedAt: "2026-06-11T00:00:00.000Z",
      }),
    ).toEqual({
      kind: "active_project_switch",
      status: "failed",
      title: "Switch to Research project",
      summary: "Ambient active project switching is not available in this runtime.",
      threadId: "thread-1",
      queuedProjectionId: "projection-switch",
      sourceEventId: "source-event-1",
      bindingId: "binding-1",
      projectName: "Research project",
      failedAt: "2026-06-11T00:00:00.000Z",
      error: "Ambient active project switching is not available in this runtime.",
      relaySuggested: true,
    });
  });

  it("builds pending project-switch runtime events for immediate and deferred switches", () => {
    expect(
      messagingRemoteSurfaceCommandSwitchProjectPendingEvent({
        preview: switchProjectResult(),
        threadId: "thread-1",
        deferProjectSwitch: false,
      }),
    ).toEqual({
      kind: "active_project_switch",
      status: "pending",
      title: "Switch to Research project",
      summary: "Active Ambient project switch to Research project is being applied now.",
      threadId: "thread-1",
      queuedProjectionId: "projection-switch",
      sourceEventId: "source-event-1",
      bindingId: "binding-1",
      projectName: "Research project",
      relaySuggested: false,
    });

    expect(
      messagingRemoteSurfaceCommandSwitchProjectPendingEvent({
        preview: switchProjectResult(),
        threadId: "thread-1",
        deferProjectSwitch: true,
      }),
    ).toMatchObject({
      status: "pending",
      summary: "Active Ambient project switch to Research project is scheduled after the current Pi turn finishes.",
      relaySuggested: false,
    });
  });

  it("builds project-switch completion runtime event patches", () => {
    expect(
      messagingRemoteSurfaceCommandSwitchProjectUnavailablePatch({
        message: "Ambient active project switching is not available in this runtime.",
        failedAt: "2026-06-11T00:00:00.000Z",
      }),
    ).toEqual({
      status: "failed",
      summary: "Active Ambient project switch failed because this runtime does not expose project switching.",
      failedAt: "2026-06-11T00:00:00.000Z",
      error: "Ambient active project switching is not available in this runtime.",
      relaySuggested: true,
    });

    expect(
      messagingRemoteSurfaceCommandSwitchProjectCompletedPatch({
        projectName: "Research project",
        completedAt: "2026-06-11T00:00:01.000Z",
      }),
    ).toEqual({
      status: "completed",
      summary: "Active Ambient project switched to Research project.",
      completedAt: "2026-06-11T00:00:01.000Z",
      relaySuggested: true,
    });

    expect(
      messagingRemoteSurfaceCommandSwitchProjectCompletedPatch({
        completedAt: "2026-06-11T00:00:02.000Z",
      }),
    ).toMatchObject({
      status: "completed",
      summary: "Active Ambient project switch completed.",
      relaySuggested: true,
    });

    expect(
      messagingRemoteSurfaceCommandSwitchProjectFailedPatch({
        projectName: "Research project",
        message: "Could not switch.",
        failedAt: "2026-06-11T00:00:03.000Z",
      }),
    ).toEqual({
      status: "failed",
      summary: "Active Ambient project switch to Research project failed.",
      failedAt: "2026-06-11T00:00:03.000Z",
      error: "Could not switch.",
      relaySuggested: true,
    });

    expect(
      messagingRemoteSurfaceCommandSwitchProjectCanceledPatch({
        canceledAt: "2026-06-11T00:00:04.000Z",
      }),
    ).toEqual({
      status: "canceled",
      summary:
        "Active Ambient project switch was canceled because the original runtime workspace was no longer active when the Pi turn finished.",
      canceledAt: "2026-06-11T00:00:04.000Z",
      relaySuggested: true,
    });
  });

  it("completes pending project switches with the runtime switch callback", async () => {
    const switchProject = vi.fn(async () => undefined);
    const patches: Array<{ eventId: string; patch: unknown }> = [];

    const result = await completeMessagingRemoteSurfaceCommandPendingProjectSwitch({
      projectSwitch: pendingProjectSwitch(),
      switchProject,
      updateRuntimeEvent: (eventId, patch) => patches.push({ eventId, patch }),
      now: () => "2026-06-11T00:00:01.000Z",
    });

    expect(result).toBe("completed");
    expect(switchProject).toHaveBeenCalledWith({
      workspacePath: "/workspace/research",
      reason: "remote-surface-command:switch_project",
    });
    expect(patches).toEqual([
      {
        eventId: "remote-surface-event-1",
        patch: {
          status: "completed",
          summary: "Active Ambient project switched to Research project.",
          completedAt: "2026-06-11T00:00:01.000Z",
          relaySuggested: true,
        },
      },
    ]);
  });

  it("marks pending project switches failed when project switching is unavailable", async () => {
    const patches: Array<{ eventId: string; patch: unknown }> = [];

    const result = await completeMessagingRemoteSurfaceCommandPendingProjectSwitch({
      projectSwitch: pendingProjectSwitch(),
      updateRuntimeEvent: (eventId, patch) => patches.push({ eventId, patch }),
      now: () => "2026-06-11T00:00:02.000Z",
    });

    expect(result).toBe("failed");
    expect(patches).toEqual([
      {
        eventId: "remote-surface-event-1",
        patch: {
          status: "failed",
          summary: "Active Ambient project switch failed because this runtime does not expose project switching.",
          failedAt: "2026-06-11T00:00:02.000Z",
          error: "Ambient active project switching is not available in this runtime.",
          relaySuggested: true,
        },
      },
    ]);
  });

  it("marks pending project switches failed, emits runtime errors, and can rethrow failures", async () => {
    const switchProject = vi.fn(async () => {
      throw new Error("Could not switch.");
    });
    const patches: Array<{ eventId: string; patch: unknown }> = [];
    const emittedErrors: Array<{ message: string; threadId: string; workspacePath: string }> = [];

    const result = await completeMessagingRemoteSurfaceCommandPendingProjectSwitch({
      projectSwitch: pendingProjectSwitch(),
      switchProject,
      threadId: "thread-1",
      workspacePath: "/workspace/current",
      updateRuntimeEvent: (eventId, patch) => patches.push({ eventId, patch }),
      emitError: (event) => emittedErrors.push(event),
      now: () => "2026-06-11T00:00:03.000Z",
    });

    expect(result).toBe("failed");
    expect(patches).toEqual([
      {
        eventId: "remote-surface-event-1",
        patch: {
          status: "failed",
          summary: "Active Ambient project switch to Research project failed.",
          failedAt: "2026-06-11T00:00:03.000Z",
          error: "Could not switch.",
          relaySuggested: true,
        },
      },
    ]);
    expect(emittedErrors).toEqual([
      {
        message: "Could not switch.",
        threadId: "thread-1",
        workspacePath: "/workspace/current",
      },
    ]);

    await expect(
      completeMessagingRemoteSurfaceCommandPendingProjectSwitch({
        projectSwitch: pendingProjectSwitch(),
        switchProject,
        updateRuntimeEvent: () => undefined,
        throwOnFailure: true,
        now: () => "2026-06-11T00:00:04.000Z",
      }),
    ).rejects.toThrow("Could not switch.");
  });

  it("ignores after-run project switch finalization when no switch is pending", () => {
    const updateRuntimeEvent = vi.fn();
    const scheduleCompletion = vi.fn();

    const result = finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun({
      shouldEmitQueueClear: true,
      updateRuntimeEvent,
      scheduleCompletion,
      now: () => "2026-06-11T00:00:05.000Z",
    });

    expect(result).toBe("none");
    expect(updateRuntimeEvent).not.toHaveBeenCalled();
    expect(scheduleCompletion).not.toHaveBeenCalled();
  });

  it("cancels pending project switches when a run does not clear the queue", () => {
    const patches: Array<{ eventId: string; patch: unknown }> = [];
    const scheduleCompletion = vi.fn();

    const result = finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun({
      projectSwitch: pendingProjectSwitch(),
      shouldEmitQueueClear: false,
      updateRuntimeEvent: (eventId, patch) => patches.push({ eventId, patch }),
      scheduleCompletion,
      now: () => "2026-06-11T00:00:05.000Z",
    });

    expect(result).toBe("canceled");
    expect(scheduleCompletion).not.toHaveBeenCalled();
    expect(patches).toEqual([
      {
        eventId: "remote-surface-event-1",
        patch: {
          status: "canceled",
          summary:
            "Active Ambient project switch was canceled because the original runtime workspace was no longer active when the Pi turn finished.",
          canceledAt: "2026-06-11T00:00:05.000Z",
          relaySuggested: true,
        },
      },
    ]);
  });

  it("schedules pending project switch completion after a queue-clearing run", () => {
    const updateRuntimeEvent = vi.fn();
    const scheduled: unknown[] = [];
    const projectSwitch = pendingProjectSwitch();

    const result = finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun({
      projectSwitch,
      shouldEmitQueueClear: true,
      updateRuntimeEvent,
      scheduleCompletion: (input) => scheduled.push(input),
      now: () => "2026-06-11T00:00:06.000Z",
    });

    expect(result).toBe("scheduled");
    expect(updateRuntimeEvent).not.toHaveBeenCalled();
    expect(scheduled).toEqual([projectSwitch]);
  });
});
