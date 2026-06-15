import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkflowArtifactSummary, WorkflowRunDetail, WorkflowRunSummary } from "../../shared/types";
import { WorkflowOutputsPanel } from "./AutomationsWorkflowOutputViews";

describe("Automations workflow output views", () => {
  it("renders the empty output panel with latest-run action state", () => {
    const markup = renderToStaticMarkup(
      <WorkflowOutputsPanel
        artifact={workflowArtifact()}
        latestRun={workflowRunSummary()}
        workflowBusy="run-1"
        onOpenRunDetail={() => undefined}
        onPreviewPath={() => undefined}
        onPreviewLocalPath={() => undefined}
        onOpenMediaModal={() => undefined}
      />,
    );

    expect(markup).toContain("Outputs");
    expect(markup).toContain("0 items");
    expect(markup).toContain("Open a run to inspect outputs");
    expect(markup).toContain("Opening");
  });

  it("renders retained run output cards without owning preview routing", () => {
    const markup = renderToStaticMarkup(
      <WorkflowOutputsPanel
        artifact={workflowArtifact()}
        latestRun={workflowRunSummary()}
        detail={workflowRunDetail()}
        onOpenRunDetail={() => undefined}
        onPreviewPath={() => undefined}
        onPreviewLocalPath={() => undefined}
        onOpenMediaModal={() => undefined}
      />,
    );

    expect(markup).toContain("Run report");
    expect(markup).toContain("/tmp/workflow-report.md");
    expect(markup).toContain("Checkpoint final_output");
    expect(markup).toContain("Couples picks");
    expect(markup).toContain("Output event");
    expect(markup).toContain("HTML preview paused");
    expect(markup).toContain("reports/classification-final.html");
    expect(markup).toContain("Source evidence screenshot");
    expect(markup).toContain("reports/source-evidence.png");
    expect(markup).toContain("Preview");
  });
});

function workflowArtifact(): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    title: "Output workflow",
    status: "approved",
    manifest: {
      tools: [],
      pluginCapabilities: [],
      ambientCliCapabilities: [],
      mutationPolicy: "read_only",
      maxToolCalls: 1,
      maxModelCalls: 1,
      maxConnectorCalls: 0,
      connectors: [],
    },
    spec: {
      goal: "Return a report.",
      summary: "Fixture",
    },
    sourcePath: "/tmp/main.ts",
    statePath: "/tmp/state.json",
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z",
  };
}

function workflowRunSummary(): WorkflowRunSummary {
  return {
    id: "run-1",
    artifactId: "artifact-1",
    status: "succeeded",
    startedAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:30.000Z",
  };
}

function workflowRunDetail(): WorkflowRunDetail {
  const artifact = workflowArtifact();
  return {
    artifact,
    run: {
      id: "run-1",
      artifactId: artifact.id,
      status: "succeeded",
      startedAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:30.000Z",
      reportPath: "/tmp/workflow-report.md",
    },
    events: [
      {
        id: "event-1",
        runId: "run-1",
        artifactId: artifact.id,
        seq: 1,
        type: "workflow.output.ready",
        createdAt: "2026-05-09T00:00:10.000Z",
        message: "Classification report ready.",
        graphNodeId: "output",
        data: {
          artifactPath: "reports/classification-final.html",
          html: "<div><h1>File classifications</h1><p>Planning notes</p></div>",
        },
      },
      {
        id: "event-2",
        runId: "run-1",
        artifactId: artifact.id,
        seq: 2,
        type: "workflow.output.screenshot",
        createdAt: "2026-05-09T00:00:12.000Z",
        message: "Source evidence captured.",
        data: {
          sourceEvidence: {
            screenshotArtifactPath: "reports/source-evidence.png",
            url: "https://example.test/source",
          },
        },
      },
    ],
    modelCalls: [],
    checkpoints: [
      {
        key: "final_output",
        updatedAt: "2026-05-09T00:00:20.000Z",
        valuePreview: JSON.stringify({
          markdown: "# Couples picks\n\n- Film A\n- Show B",
          artifactPath: "/tmp/couples-picks.md",
        }),
      },
    ],
    approvals: [],
    auditReport: "",
  };
}
