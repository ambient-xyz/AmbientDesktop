import { describe, expect, it } from "vitest";
import type { WorkflowRunDetail } from "../../shared/workflowTypes";
import { normalizeWorkflowRunsPanelId, workflowRunsPanelTabs } from "./workflowRunsPanelUiModel";

describe("workflowRunsPanelTabs", () => {
  it("summarizes loaded run evidence without requiring the global runs pane", () => {
    const tabs = workflowRunsPanelTabs({
      latestRun: { status: "paused", updatedAt: "2026-05-12T00:00:10.000Z" },
      detail: detail({ status: "paused" }),
      inputCount: 1,
      outputCount: 2,
    });

    expect(tabs.map((tab) => tab.id)).toEqual([
      "runs-live",
      "runs-input",
      "runs-outputs",
      "runs-events",
      "runs-model",
      "runs-checkpoints",
      "runs-report",
    ]);
    expect(tabs.find((tab) => tab.id === "runs-live")).toMatchObject({ label: "Live", badge: "Paused" });
    expect(tabs.find((tab) => tab.id === "runs-input")).toMatchObject({ badge: "1 pending" });
    expect(tabs.find((tab) => tab.id === "runs-outputs")).toMatchObject({ badge: "2 items" });
    expect(tabs.find((tab) => tab.id === "runs-events")).toMatchObject({ badge: "2 events" });
    expect(tabs.find((tab) => tab.id === "runs-model")).toMatchObject({ badge: "1 call" });
    expect(tabs.find((tab) => tab.id === "runs-checkpoints")).toMatchObject({ badge: "1 saved" });
    expect(tabs.find((tab) => tab.id === "runs-report")).toMatchObject({ badge: "audit" });
  });

  it("falls back to Live when a requested panel is unknown", () => {
    const tabs = workflowRunsPanelTabs({});

    expect(normalizeWorkflowRunsPanelId("runs-model", tabs)).toBe("runs-model");
    expect(normalizeWorkflowRunsPanelId(undefined, tabs)).toBe("runs-live");
    expect(normalizeWorkflowRunsPanelId("not-a-panel" as never, tabs)).toBe("runs-live");
  });

  it("labels stale running run evidence from durable activity", () => {
    const tabs = workflowRunsPanelTabs({
      latestRun: { status: "running", updatedAt: "2026-05-12T00:00:00.000Z" },
      detail: detail({ status: "running", updatedAt: "2026-05-12T00:00:00.000Z" }),
    });

    expect(tabs.find((tab) => tab.id === "runs-live")).toMatchObject({ badge: "Stale" });
  });
});

function detail(patch: Partial<WorkflowRunDetail["run"]> = {}): WorkflowRunDetail {
  return {
    run: {
      id: "run-1",
      artifactId: "artifact-1",
      status: "succeeded",
      startedAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:10.000Z",
      ...patch,
    },
    artifact: {
      id: "artifact-1",
      title: "Workflow",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Run the workflow." },
      sourcePath: "/tmp/main.ts",
      statePath: "/tmp/state.json",
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    },
    events: [
      { id: "event-1", runId: "run-1", artifactId: "artifact-1", seq: 1, type: "workflow.start", createdAt: "2026-05-12T00:00:00.000Z" },
      { id: "event-2", runId: "run-1", artifactId: "artifact-1", seq: 2, type: "workflow.output.ready", createdAt: "2026-05-12T00:00:10.000Z" },
    ],
    approvals: [],
    modelCalls: [
      {
        id: "call-1",
        runId: "run-1",
        task: "summarize",
        status: "succeeded",
        input: { text: "hello" },
        output: { summary: "hello" },
        startedAt: "2026-05-12T00:00:03.000Z",
        completedAt: "2026-05-12T00:00:08.000Z",
        latencyMs: 5000,
      },
    ],
    checkpoints: [{ key: "final_output", valuePreview: "ready", runId: "run-1", updatedAt: "2026-05-12T00:00:09.000Z" }],
    auditReport: "# Audit\n\nReady.",
    sourceContent: "export default async function run() {}",
  };
}
