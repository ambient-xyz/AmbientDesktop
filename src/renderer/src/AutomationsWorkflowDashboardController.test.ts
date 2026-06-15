import { describe, expect, it } from "vitest";

import type {
  WorkflowAgentFolderSummary,
  WorkflowArtifactSummary,
  WorkflowDashboard,
  WorkflowExplorationProgress,
  WorkflowExplorationTraceSummary,
  WorkflowRunSummary,
} from "../../shared/types";
import {
  retainedWorkflowExplorationProgress,
  workflowAgentThreadForArtifactFromFolders,
  workflowRunDetailPanelTarget,
} from "./AutomationsWorkflowDashboardController";

describe("Automations workflow dashboard controller", () => {
  it("routes focused run detail panes to the run artifact thread when available", () => {
    const dashboard = dashboardSummary({
      artifacts: [artifactSummary("artifact-1", "thread-1")],
      runs: [runSummary("run-1", "artifact-1")],
    });

    expect(
      workflowRunDetailPanelTarget({
        dashboard,
        runId: "run-1",
        selectedWorkflowAgentThreadId: "selected-thread",
      }),
    ).toEqual({
      workflowThreadId: "thread-1",
      artifactPanel: "run_console",
      runsPanel: "runs-live",
    });
  });

  it("falls back to the selected workflow thread when the run artifact is not loaded", () => {
    expect(
      workflowRunDetailPanelTarget({
        dashboard: dashboardSummary({ artifacts: [], runs: [runSummary("run-1", "missing-artifact")] }),
        runId: "run-1",
        selectedWorkflowAgentThreadId: "selected-thread",
      }),
    ).toEqual({
      workflowThreadId: "selected-thread",
      artifactPanel: "run_console",
      runsPanel: "runs-live",
    });
  });

  it("retains live or terminal failed exploration progress from loaded traces", () => {
    const runningProgress = { workflowThreadId: "thread-1", explorationId: "exploration-1", eventType: "tool", phase: "tool", status: "running", message: "Searching" } as WorkflowExplorationProgress;
    const failedProgress = { workflowThreadId: "thread-1", explorationId: "exploration-2", eventType: "failed", phase: "failed", status: "failed", message: "Stopped" } as WorkflowExplorationProgress;

    expect(
      retainedWorkflowExplorationProgress([
        trace("trace-1", "succeeded", undefined),
        trace("trace-2", "running", runningProgress),
        trace("trace-3", "failed", failedProgress),
      ]),
    ).toBe(runningProgress);

    expect(retainedWorkflowExplorationProgress([trace("trace-1", "succeeded", undefined)])).toBeUndefined();
  });

  it("finds the workflow thread that owns an artifact across folders", () => {
    const folders = [
      { id: "folder-1", name: "First", threads: [{ id: "thread-1" }] },
      { id: "folder-2", name: "Second", threads: [{ id: "thread-2" }] },
    ] as WorkflowAgentFolderSummary[];

    expect(workflowAgentThreadForArtifactFromFolders(folders, { workflowThreadId: "thread-2" })?.id).toBe("thread-2");
    expect(workflowAgentThreadForArtifactFromFolders(folders, { workflowThreadId: "missing" })).toBeUndefined();
    expect(workflowAgentThreadForArtifactFromFolders(folders, undefined)).toBeUndefined();
  });
});

function trace(
  id: string,
  status: WorkflowExplorationTraceSummary["status"],
  latestProgress: WorkflowExplorationProgress | undefined,
): Pick<WorkflowExplorationTraceSummary, "status" | "latestProgress"> {
  return { id, status, latestProgress } as Pick<WorkflowExplorationTraceSummary, "status" | "latestProgress">;
}

function dashboardSummary(input: Pick<WorkflowDashboard, "artifacts" | "runs">): WorkflowDashboard {
  return input;
}

function artifactSummary(id: string, workflowThreadId: string): WorkflowArtifactSummary {
  return {
    id,
    workflowThreadId,
    title: id,
    status: "approved",
    manifest: {} as never,
    spec: {} as never,
    sourcePath: `${id}.ts`,
    statePath: `${id}.json`,
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
  };
}

function runSummary(id: string, artifactId: string): WorkflowRunSummary {
  return {
    id,
    artifactId,
    status: "succeeded",
    startedAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
  };
}
