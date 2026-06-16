import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/types";
import {
  createRuntimePromptLifecycleControls,
  type RuntimeActiveRunStatus,
} from "./runtimePromptLifecycleControls";

function harness(input: {
  active?: boolean;
  initialStatus?: RuntimeActiveRunStatus;
} = {}) {
  const emitted: DesktopEvent[] = [];
  const updateRunStatus = vi.fn();
  const controls = createRuntimePromptLifecycleControls({
    threadId: "thread-1",
    runId: "run-1",
    initialStatus: input.initialStatus ?? "starting",
    isRunStoreActive: () => input.active ?? true,
    updateRunStatus,
    emitRunEvent: (event) => {
      emitted.push(event);
    },
  });
  return { controls, emitted, updateRunStatus };
}

describe("createRuntimePromptLifecycleControls", () => {
  it("dedupes the initial run status", () => {
    const { controls, emitted, updateRunStatus } = harness();

    controls.setActiveRunStatus("starting");

    expect(updateRunStatus).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });

  it("persists and emits active run statuses when they change", () => {
    const { controls, emitted, updateRunStatus } = harness();

    controls.setActiveRunStatus("streaming");
    controls.setActiveRunStatus("streaming");
    controls.setActiveRunStatus("tool");

    expect(updateRunStatus).toHaveBeenCalledTimes(2);
    expect(updateRunStatus).toHaveBeenNthCalledWith(1, "run-1", "streaming");
    expect(updateRunStatus).toHaveBeenNthCalledWith(2, "run-1", "tool");
    expect(emitted).toEqual([
      { type: "run-status", threadId: "thread-1", status: "streaming" },
      { type: "run-status", threadId: "thread-1", status: "tool" },
    ]);
  });

  it("emits transient retrying and compacting statuses without persisting them", () => {
    const { controls, emitted, updateRunStatus } = harness();

    controls.setActiveRunStatus("retrying");
    controls.setActiveRunStatus("compacting");

    expect(updateRunStatus).not.toHaveBeenCalled();
    expect(emitted).toEqual([
      { type: "run-status", threadId: "thread-1", status: "retrying" },
      { type: "run-status", threadId: "thread-1", status: "compacting" },
    ]);
  });

  it("ignores run status updates when the run store is inactive", () => {
    const { controls, emitted, updateRunStatus } = harness({ active: false });

    controls.setActiveRunStatus("streaming");

    expect(updateRunStatus).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });

  it("signals stream timeout completion", async () => {
    const { controls } = harness();

    controls.signalStreamWatchdogTimeout();

    await expect(controls.streamWatchdogCompletion).resolves.toBe("stream-timeout");
  });

  it("signals tool execution timeout completion", async () => {
    const { controls } = harness();

    controls.signalToolExecutionTimeout();

    await expect(controls.streamWatchdogCompletion).resolves.toBe("tool-timeout");
  });

  it("signals parent-control abort completion", async () => {
    const { controls } = harness();

    controls.signalParentControlAbort();

    await expect(controls.streamWatchdogCompletion).resolves.toBe("parent-control-abort");
  });
});
