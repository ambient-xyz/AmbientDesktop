import { describe, expect, it } from "vitest";

import type { OrchestrationAutoDispatchStatus, OrchestrationRun } from "../../shared/workflowTypes";
import {
  formatAutoDispatchStartedRun,
  formatDelay,
  formatOrchestrationRunStatus,
  formatRunDuration,
  isRestartInterruptedLocalTaskRun,
  orchestrationRunActionLabel,
  orchestrationTimelineEntries,
  terminalRunLabel,
} from "./AutomationsRunHistory";

describe("Automations run history", () => {
  it("formats durations and terminal run labels for run surfaces", () => {
    expect(formatDelay(250)).toBe("250 ms");
    expect(formatDelay(1000)).toBe("1s");
    expect(formatDelay(1250)).toBe("1.3s");
    expect(formatRunDuration("2026-06-14T10:00:00.000Z", "2026-06-14T10:00:02.500Z")).toBe("2.5s");
    expect(formatRunDuration("bad", "2026-06-14T10:00:02.500Z")).toBe("");
    expect(terminalRunLabel("completed")).toBe("Completed");
    expect(terminalRunLabel("needs_review")).toBe("Needs Review");
  });

  it("formats auto-dispatch started run summaries", () => {
    const run = {
      runId: "run-7",
      taskId: "task-7",
      identifier: "LOCAL-7",
      title: "Refresh evidence",
      priority: 4,
      dispatchKind: "prepared",
      dispatchRank: 2,
    } as OrchestrationAutoDispatchStatus["lastStartedRuns"][number];

    expect(formatAutoDispatchStartedRun(run)).toBe("#2 LOCAL-7 (P4) Refresh evidence");
    expect(formatAutoDispatchStartedRun({ ...run, dispatchKind: "restart_interrupted_resume", priority: undefined })).toBe(
      "Continued LOCAL-7 (no priority) Refresh evidence",
    );
  });

  it("labels interrupted restart runs as resumable actions", () => {
    const interrupted = run({
      status: "stalled",
      proofOfWork: {
        resumeAvailable: true,
        recovery: { type: "desktop-restart" },
      },
    });

    expect(isRestartInterruptedLocalTaskRun(interrupted)).toBe(true);
    expect(formatOrchestrationRunStatus(interrupted)).toBe("Interrupted");
    expect(orchestrationRunActionLabel(interrupted)).toBe("Continue run");
    expect(orchestrationRunActionLabel(run({ status: "prepared" }))).toBe("Start");
    expect(orchestrationRunActionLabel(run({ status: "stalled" }))).toBe("Recover");
  });

  it("builds run timeline entries in stable UI order", () => {
    const entries = orchestrationTimelineEntries(run({
      status: "completed",
      threadId: "thread-1",
      finishedAt: "2026-06-14T10:00:05.000Z",
    }));

    expect(entries.map((entry) => entry.label)).toEqual(["Run created", "Chat linked", "Completed"]);
    expect(entries.at(-1)).toMatchObject({ state: "done", detail: "5s" });
  });
});

function run(input: Partial<OrchestrationRun> = {}): OrchestrationRun {
  return {
    id: "run-1",
    taskId: "task-1",
    attemptNumber: 0,
    status: "running",
    workspacePath: "/tmp/workspace",
    startedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}
