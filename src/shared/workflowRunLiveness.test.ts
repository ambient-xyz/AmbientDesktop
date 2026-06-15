import { describe, expect, it } from "vitest";
import { workflowRunLiveness } from "./workflowRunLiveness";
import type { WorkflowRunSummary } from "./types";

const runningRun: WorkflowRunSummary = {
  id: "run-1",
  artifactId: "artifact-1",
  status: "running",
  startedAt: "2026-05-18T00:00:00.000Z",
  updatedAt: "2026-05-18T00:01:00.000Z",
};

describe("workflowRunLiveness", () => {
  it("classifies a running run as active when durable activity is recent", () => {
    expect(
      workflowRunLiveness(runningRun, [{ createdAt: "2026-05-18T00:04:30.000Z", type: "workflow.progress" }], {
        nowMs: Date.parse("2026-05-18T00:05:00.000Z"),
        staleMs: 60_000,
      }),
    ).toMatchObject({
      state: "active",
      stale: false,
      idleMs: 30_000,
      latestEventType: "workflow.progress",
    });
  });

  it("classifies a running run as stale from the latest durable activity", () => {
    expect(
      workflowRunLiveness(
        {
          ...runningRun,
          providerHealth: {
            status: "provider_degraded",
            providerEventCount: 1,
            providerProgressEventCount: 0,
            providerErrorEventCount: 1,
          },
        },
        [{ createdAt: "2026-05-18T00:02:00.000Z", type: "ambient.call.error" }],
        {
          nowMs: Date.parse("2026-05-18T00:10:00.000Z"),
          staleMs: 5 * 60_000,
        },
      ),
    ).toMatchObject({
      state: "stale",
      stale: true,
      idleMs: 8 * 60_000,
      latestEventType: "ambient.call.error",
      summary: expect.stringContaining("Provider health was already degraded"),
    });
  });

  it("does not report terminal or paused runs as stale candidates", () => {
    expect(workflowRunLiveness({ ...runningRun, status: "failed" }, [], { nowMs: Date.parse("2026-05-18T01:00:00.000Z") })).toMatchObject({
      state: "not_running",
      stale: false,
      summary: "Only running workflow runs are stale-recovery candidates.",
    });
  });
});
