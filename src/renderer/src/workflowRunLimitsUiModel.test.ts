import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS,
  DEFAULT_WORKFLOW_FOREGROUND_TOTAL_LIMIT_MODE,
  DEFAULT_WORKFLOW_SCHEDULE_TOTAL_LIMIT_MODE,
  workflowExtendTotalRunLimitOverrides,
  workflowRemoveTotalRunLimitOverrides,
  workflowRunLimitOverridesForSettings,
  workflowRunLimitSummary,
  workflowTotalRuntimePauseModel,
} from "./workflowRunLimitsUiModel";

describe("workflowRunLimitsUiModel", () => {
  it("defaults foreground and scheduled runs to stream-idle liveness without total caps", () => {
    expect(DEFAULT_WORKFLOW_FOREGROUND_TOTAL_LIMIT_MODE).toBe("disabled");
    expect(DEFAULT_WORKFLOW_SCHEDULE_TOTAL_LIMIT_MODE).toBe("disabled");
  });

  it("disables manifest total caps for foreground runs by default", () => {
    expect(
      workflowRunLimitOverridesForSettings(
        { idleTimeoutMs: 120_000, totalLimitMode: "disabled" },
        { maxRunMs: 60_000 },
      ),
    ).toEqual({ idleTimeoutMs: 120_000, maxRunMs: null });
  });

  it("can leave the manifest total cap active when requested", () => {
    expect(
      workflowRunLimitOverridesForSettings(
        { idleTimeoutMs: 300_000, totalLimitMode: "manifest" },
        { maxRunMs: 900_000 },
      ),
    ).toEqual({ idleTimeoutMs: 300_000 });
  });

  it("normalizes invalid idle values and summarizes user-visible limits", () => {
    expect(
      workflowRunLimitOverridesForSettings(
        { idleTimeoutMs: Number.NaN, totalLimitMode: "disabled" },
        {},
      ),
    ).toEqual({ idleTimeoutMs: DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS, maxRunMs: null });
    expect(workflowRunLimitSummary({ idleTimeoutMs: 300_000, totalLimitMode: "manifest" }, { maxRunMs: 900_000 })).toBe(
      "Idle timeout 5 min; manifest total cap 15 min.",
    );
  });

  it("builds extend and remove overrides for paused foreground runs", () => {
    expect(workflowExtendTotalRunLimitOverrides({ idleTimeoutMs: 120_000 })).toEqual({ idleTimeoutMs: 120_000, maxRunMs: 600_000 });
    expect(workflowRemoveTotalRunLimitOverrides({ idleTimeoutMs: Number.NaN })).toEqual({
      idleTimeoutMs: DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS,
      maxRunMs: null,
    });
  });

  it("models recoverable total runtime limit pauses", () => {
    expect(
      workflowTotalRuntimePauseModel("paused", [
        {
          id: "evt-1",
          runId: "run-1",
          artifactId: "artifact-1",
          seq: 1,
          type: "workflow.timeout",
          createdAt: "2026-05-09T00:00:00.000Z",
          message: "Workflow reached the total runtime limit (10 min).",
          data: {
            reason: "total_runtime_limit",
            recoverable: true,
            idleTimeoutMs: 120_000,
            maxRunMs: 600_000,
            totalRuntimeLimitSource: "override",
          },
        },
      ]),
    ).toEqual({
      eventId: "evt-1",
      message: "Workflow reached the total runtime limit (10 min).",
      idleTimeoutLabel: "2 min",
      totalLimitLabel: "10 min",
      sourceLabel: "run override",
    });

    expect(
      workflowTotalRuntimePauseModel("failed", [
        {
          id: "evt-2",
          runId: "run-1",
          artifactId: "artifact-1",
          seq: 1,
          type: "workflow.timeout",
          createdAt: "2026-05-09T00:00:00.000Z",
          data: { reason: "total_runtime_limit", recoverable: true },
        },
      ]),
    ).toBeUndefined();
  });
});
