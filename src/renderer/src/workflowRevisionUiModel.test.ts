import { describe, expect, it } from "vitest";
import type { WorkflowRevisionSummary } from "../../shared/workflowTypes";
import {
  workflowRevisionCards,
  workflowRevisionGraphDetails,
  workflowRevisionGraphSummary,
  workflowRevisionProposedLabel,
  workflowRevisionSourcePreview,
  workflowRevisionSourceSummary,
  workflowRevisionStatusLabel,
} from "./workflowRevisionUiModel";

const baseRevision: WorkflowRevisionSummary = {
  id: "revision-1",
  workflowThreadId: "thread-1",
  baseVersionId: "version-1",
  baseArtifactId: "artifact-1",
  proposedVersionId: "version-2",
  proposedArtifactId: "artifact-2",
  requestedChange: "Add a human review gate before sending the report.",
  status: "proposed",
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:10:00.000Z",
};

describe("workflow revision UI model", () => {
  it("builds sorted cards with status, base, graph, source, and age summaries", () => {
    const cards = workflowRevisionCards(
      [
        { ...baseRevision, id: "revision-old", status: "draft", updatedAt: "2026-05-02T00:05:00.000Z" },
        {
          ...baseRevision,
          id: "revision-new",
          graphDiff: {
            currentGraphId: "graph-1",
            proposedGraphId: "graph-2",
            addedNodes: [{ id: "review", after: { id: "review", type: "review_gate", label: "Review" }, fieldChanges: [] }],
            removedNodes: [],
            changedNodes: [],
            addedEdges: [],
            removedEdges: [],
            changedEdges: [],
            manifest: {
              fieldChanges: [],
              addedConnectors: [],
              removedConnectors: [],
              changedConnectors: [],
              addedPluginCapabilities: [],
              removedPluginCapabilities: [],
              changedPluginCapabilities: [],
            },
          },
          sourceDiff: "diff --git a/main.ts b/main.ts\n--- a/main.ts\n+++ b/main.ts\n-old()\n+new()\n+review()",
          updatedAt: "2026-05-02T00:10:00.000Z",
        },
      ],
      Date.parse("2026-05-02T00:15:00.000Z"),
    );

    expect(cards[0]).toMatchObject({
      id: "revision-new",
      statusLabel: "Proposed revision",
      requestedChange: "Add a human review gate before sending the report.",
      graphSummary: "1 node added",
      graphDetails: ["Added node: Review (Review Gate)."],
      hasGraphDiff: true,
      hasManifestDiff: false,
      sourceSummary: "2 lines added, 1 line removed, 1 file changed",
      sourcePreviewLines: [
        { kind: "removed", text: "-old()" },
        { kind: "added", text: "+new()" },
        { kind: "added", text: "+review()" },
      ],
      hasSourceDiff: true,
      baseLabel: "Based on saved version and artifact",
      proposedLabel: "Proposes saved version and artifact",
      updatedLabel: "Updated 5m ago",
      canApply: true,
      canReject: true,
    });
    expect(cards[1]).toMatchObject({ id: "revision-old", statusLabel: "Draft revision" });
  });

  it("labels terminal revision states", () => {
    expect(workflowRevisionStatusLabel("applied")).toBe("Applied revision");
    expect(workflowRevisionStatusLabel("rejected")).toBe("Rejected revision");
    expect(workflowRevisionCards([{ ...baseRevision, status: "applied" }])[0]).toMatchObject({ canApply: false, canReject: false });
  });

  it("handles missing or partial diff data", () => {
    expect(workflowRevisionGraphSummary(undefined)).toBe("No graph diff stored yet.");
    expect(workflowRevisionGraphDetails(undefined)).toEqual([]);
    expect(workflowRevisionSourceSummary(undefined)).toBe("No source diff stored yet.");
    expect(workflowRevisionSourcePreview(undefined)).toEqual([]);
    expect(workflowRevisionCards([{ ...baseRevision }])[0]).toMatchObject({ hasGraphDiff: false, hasManifestDiff: false, hasSourceDiff: false });
    expect(workflowRevisionSourceSummary("@@ -1 +1 @@\n unchanged")).toBe("Source diff stored.");
    expect(workflowRevisionProposedLabel({ ...baseRevision, proposedVersionId: undefined, proposedArtifactId: undefined })).toBe("No proposed version recorded");
  });

  it("builds readable graph and manifest diff details", () => {
    expect(
      workflowRevisionGraphDetails({
        currentGraphId: "graph-1",
        proposedGraphId: "graph-2",
        addedNodes: [],
        removedNodes: [],
        changedNodes: [
          {
            id: "summarize",
            before: { id: "summarize", type: "model_call", label: "Summarize" },
            after: { id: "summarize", type: "model_call", label: "Summarize papers" },
            fieldChanges: [{ field: "label", before: "Summarize", after: "Summarize papers" }],
          },
        ],
        addedEdges: [],
        removedEdges: [],
        changedEdges: [],
        manifest: {
          fieldChanges: [{ field: "maxModelCalls", before: 1, after: 3 }],
          addedConnectors: [],
          removedConnectors: [],
          changedConnectors: [],
          addedPluginCapabilities: [],
          removedPluginCapabilities: [],
          changedPluginCapabilities: [],
        },
      }),
    ).toEqual(["Changed node: Summarize papers (Model Call) (Label: Summarize -> Summarize papers).", "Manifest Max Model Calls: 1 -> 3."]);
  });
});
