import { describe, expect, it } from "vitest";
import { applyWorkflowDiscoveryGraphPatch, validateWorkflowDiscoveryGraphPatch } from "./workflowDiscoveryGraphPatch";
import { workflowDiscoveryGraph } from "./workflowDiscovery";

describe("workflowDiscoveryGraphPatch", () => {
  it("validates and applies bounded discovery graph patches", () => {
    const baseGraph = workflowDiscoveryGraph({
      workflowThreadId: "workflow-thread-1",
      request: "Classify exported inbox records.",
      questions: [],
      createdAt: "2026-05-02T00:00:00.000Z",
    });
    const result = validateWorkflowDiscoveryGraphPatch(
      {
        summary: "Request through CSV export and classifier.",
        upsertNodes: [
          {
            id: "csv-export",
            type: "data_source",
            label: "CSV export",
            description: "Read safe metadata for exported inbox rows.",
          },
        ],
        upsertEdges: [{ id: "request-to-csv-export", source: "request", target: "csv-export", type: "data_flow" }],
      },
      { currentGraph: baseGraph },
    );

    expect(result.blockedReasons).toBeUndefined();
    expect(result.graphPatch).toBeTruthy();
    const patched = applyWorkflowDiscoveryGraphPatch({
      workflowThreadId: "workflow-thread-1",
      baseGraph,
      graphPatch: result.graphPatch,
    });
    expect(patched.summary).toBe("Request through CSV export and classifier.");
    expect(patched.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "csv-export", type: "data_source" })]));
    expect(patched.edges).toEqual(expect.arrayContaining([expect.objectContaining({ id: "request-to-csv-export", source: "request" })]));
  });

  it("rejects dangling edges and unknown connector claims without throwing", () => {
    const dangling = validateWorkflowDiscoveryGraphPatch({
      upsertEdges: [{ id: "bad-edge", source: "request", target: "missing-node", type: "control_flow" }],
    });
    expect(dangling.graphPatch).toBeUndefined();
    expect(dangling.blockedReasons).toEqual([expect.stringContaining("missing source or target")]);

    const unknownConnector = validateWorkflowDiscoveryGraphPatch(
      {
        upsertNodes: [{ id: "gmail-call", type: "connector_call", label: "Gmail", connectorIds: ["gmail"] }],
      },
      { allowedConnectorIds: ["drive"] },
    );
    expect(unknownConnector.graphPatch).toBeUndefined();
    expect(unknownConnector.blockedReasons).toEqual([expect.stringContaining("not present in discovery metadata")]);
  });
});
