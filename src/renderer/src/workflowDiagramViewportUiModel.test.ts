import { describe, expect, it } from "vitest";
import { workflowDiagramFollowToggle, workflowDiagramShouldAutoFit, workflowDiagramShouldFollowActiveNode } from "./workflowDiagramViewportUiModel";

describe("workflowDiagramViewportUiModel", () => {
  it("auto-fits a new graph only before the user adjusts the viewport", () => {
    expect(
      workflowDiagramShouldAutoFit({
        snapshotId: "graph-2",
        lastAutoFitSnapshotId: "graph-1",
        userAdjustedViewport: false,
      }),
    ).toBe(true);

    expect(
      workflowDiagramShouldAutoFit({
        snapshotId: "graph-2",
        lastAutoFitSnapshotId: "graph-1",
        userAdjustedViewport: true,
      }),
    ).toBe(false);

    expect(
      workflowDiagramShouldAutoFit({
        snapshotId: "graph-2",
        lastAutoFitSnapshotId: "graph-2",
        userAdjustedViewport: false,
      }),
    ).toBe(false);
  });

  it("follows active nodes only when follow mode and an active node are present", () => {
    expect(workflowDiagramShouldFollowActiveNode({ followExecution: false, activeNodeId: "model" })).toBe(false);
    expect(workflowDiagramShouldFollowActiveNode({ followExecution: true })).toBe(false);
    expect(workflowDiagramShouldFollowActiveNode({ followExecution: true, activeNodeId: "model" })).toBe(true);
  });

  it("centers the active node when follow is explicitly enabled", () => {
    expect(workflowDiagramFollowToggle({ followExecution: false, activeNodeId: "model" })).toEqual({
      nextFollowExecution: true,
      shouldCenterActiveNode: true,
    });
    expect(workflowDiagramFollowToggle({ followExecution: true, activeNodeId: "model" })).toEqual({
      nextFollowExecution: false,
      shouldCenterActiveNode: false,
    });
    expect(workflowDiagramFollowToggle({ followExecution: false })).toEqual({
      nextFollowExecution: false,
      shouldCenterActiveNode: false,
    });
  });
});
