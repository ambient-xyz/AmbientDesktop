import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type {
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { AgentRuntimeSubagentStopCascadeController } from "./agentRuntimeSubagentStopCascadeController";

describe("AgentRuntimeSubagentStopCascadeController", () => {
  it("emits parent-stop cascade updates and aborts active cancelled children", async () => {
    const cancelledRun = subagentRun({
      id: "child-run",
      childThreadId: "child-thread",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    });
    const detachedRun = subagentRun({
      id: "detached-run",
      childThreadId: "detached-thread",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    });
    const barrier = { id: "barrier" } as SubagentWaitBarrierSummary;
    const parentMailboxEvent = { id: "mailbox" };
    const store = {
      listAllSubagentRuns: vi.fn(() => [cancelledRun, detachedRun]),
      cascadeSubagentParentRunStopped: vi.fn(() => ({
        cancelledRunIds: [cancelledRun.id],
        detachedRunIds: [detachedRun.id],
        cancelledWaitBarrierIds: [barrier.id],
        parentMailboxEventId: parentMailboxEvent.id,
      })),
      getSubagentRun: vi.fn((runId: string) => {
        if (runId === cancelledRun.id) return cancelledRun;
        if (runId === detachedRun.id) return detachedRun;
        throw new Error(`Unexpected run ${runId}`);
      }),
      getSubagentWaitBarrier: vi.fn(() => barrier),
      getSubagentParentMailboxEvent: vi.fn(() => parentMailboxEvent),
      appendSubagentRunEvent: vi.fn(),
    } as unknown as ProjectStore;
    const emitted: DesktopEvent[] = [];
    const emitSubagentRunAndChildThreadUpdated = vi.fn();
    const emitSubagentRunEventsSince = vi.fn();
    const emitSubagentWaitBarrierUpdated = vi.fn();
    const emitSubagentParentMailboxEventUpdated = vi.fn();
    const abortChildThread = vi.fn(async () => undefined);
    const featureFlagSnapshot = {
      ambientSubagents: true,
    } as unknown as AmbientFeatureFlagSnapshot;
    const controller = new AgentRuntimeSubagentStopCascadeController({
      store,
      activeRuns: new Map([[cancelledRun.childThreadId, {}]]),
      currentFeatureFlagSnapshot: () => featureFlagSnapshot,
      abortChildThread,
      latestSubagentRunEventSequence: vi.fn(() => 7),
      emit: (event) => emitted.push(event),
      emitSubagentRunAndChildThreadUpdated,
      emitSubagentRunEventsSince,
      emitSubagentWaitBarrierUpdated,
      emitSubagentParentMailboxEventUpdated,
    });

    await controller.cascadeSubagentsForStoppedParentRun(
      "parent-thread",
      "parent-run",
      "Parent run stopped by user.",
    );

    expect(store.cascadeSubagentParentRunStopped).toHaveBeenCalledWith({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      reason: "Parent run stopped by user.",
      featureFlagSnapshot,
    });
    expect(emitSubagentRunAndChildThreadUpdated).toHaveBeenCalledWith(cancelledRun);
    expect(emitSubagentRunAndChildThreadUpdated).toHaveBeenCalledWith(detachedRun);
    expect(emitSubagentWaitBarrierUpdated).toHaveBeenCalledWith(barrier);
    expect(emitSubagentParentMailboxEventUpdated).toHaveBeenCalledWith(parentMailboxEvent);
    expect(abortChildThread).toHaveBeenCalledWith(cancelledRun.childThreadId);
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith(cancelledRun.id, {
      type: "subagent.child_runtime_aborted",
      preview: {
        reason: "Parent run stopped by user.",
        childThreadId: cancelledRun.childThreadId,
        source: "parent_stop_cascade",
      },
    });
    expect(emitSubagentRunEventsSince).toHaveBeenCalledWith(cancelledRun, 7);
    expect(emitted).toEqual([
      expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({
          threadId: "parent-thread",
          message: "Stopped parent run cascaded to 1 cancelled and 1 detached sub-agent child threads.",
        }),
      }),
    ]);
  });
});

function subagentRun(input: {
  id: string;
  childThreadId: string;
  parentThreadId: string;
  parentRunId: string;
}): SubagentRunSummary {
  return {
    id: input.id,
    childThreadId: input.childThreadId,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
  } as SubagentRunSummary;
}
