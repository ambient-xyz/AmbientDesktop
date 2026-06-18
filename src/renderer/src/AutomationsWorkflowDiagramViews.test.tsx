import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkflowAgentThreadSummary } from "../../shared/workflowTypes";
import {
  WorkflowAgentDiagramPane,
  workflowDiagramNodeBounds,
  workflowGraphSnapshotWithActiveNode,
  workflowRecoveryBusyLabel,
} from "./AutomationsWorkflowDiagramViews";

describe("Automations workflow diagram views", () => {
  it("renders the diagram empty state through the moved owner", () => {
    const markup = renderToStaticMarkup(<WorkflowAgentDiagramPane thread={threadWithoutGraph()} />);

    expect(markup).toContain("Workflow Diagram");
    expect(markup).toContain("Discovery graph pending");
    expect(markup).toContain("Classify inbox messages.");
  });

  it("marks the active graph node without mutating the original snapshot", () => {
    const snapshot = {
      id: "graph-1",
      workflowThreadId: "thread-1",
      version: 1,
      source: "compile",
      summary: "Classify inbox messages.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "model", type: "model_call", label: "Classify", runState: "pending" },
      ],
      edges: [],
      createdAt: "2026-06-14T10:00:00.000Z",
    } satisfies NonNullable<WorkflowAgentThreadSummary["graph"]>;

    const next = workflowGraphSnapshotWithActiveNode(snapshot, "model");

    expect(next.nodes.find((node) => node.id === "model")?.runState).toBe("active");
    expect(snapshot.nodes.find((node) => node.id === "model")?.runState).toBe("pending");
  });

  it("computes diagram bounds and recovery busy labels", () => {
    const nodes: Parameters<typeof workflowDiagramNodeBounds>[0] = [
      { id: "a", position: { x: 10, y: 20 }, width: 100, height: 50, data: {} as never },
      { id: "b", position: { x: 150, y: 90 }, width: 80, height: 40, data: {} as never },
    ];

    expect(workflowDiagramNodeBounds(nodes)).toEqual({ x: 10, y: 20, width: 220, height: 110 });
    expect(workflowRecoveryBusyLabel({ id: "resume_checkpoint" } as Parameters<typeof workflowRecoveryBusyLabel>[0])).toBe("Resuming");
    expect(workflowRecoveryBusyLabel({ id: "debug_rewrite" } as Parameters<typeof workflowRecoveryBusyLabel>[0])).toBe("Debugging");
  });
});

function threadWithoutGraph(): WorkflowAgentThreadSummary {
  return {
    id: "thread-1",
    folderId: "home",
    projectName: "Workspace",
    projectPath: "/tmp/workspace",
    title: "Inbox workflow",
    phase: "discovery",
    initialRequest: "Classify inbox messages.",
    preview: "Classify inbox messages.",
    status: "discovering",
    traceMode: "production",
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  };
}
