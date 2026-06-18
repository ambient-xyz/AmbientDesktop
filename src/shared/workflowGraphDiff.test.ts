import { describe, expect, it } from "vitest";
import type { WorkflowGraphSnapshot, WorkflowManifest } from "./workflowTypes";
import { diffWorkflowGraphs, workflowGraphDiffHasChanges, workflowGraphDiffSummary } from "./workflowGraphDiff";

const baseGraph: WorkflowGraphSnapshot = {
  id: "graph-current",
  workflowThreadId: "thread-1",
  version: 1,
  source: "compile",
  summary: "Current graph",
  createdAt: "2026-05-02T00:00:00.000Z",
  nodes: [
    { id: "request", type: "request", label: "Request", outputSummary: "Initial request", x: 0, y: 0 },
    { id: "model", type: "model_call", label: "Classify", modelRole: "Categorize", toolNames: ["ambient.responses"], retryPolicy: "same input" },
    { id: "output", type: "output", label: "Output", description: "Structured report" },
  ],
  edges: [
    { id: "request-model", source: "request", target: "model", type: "control_flow", label: "reason" },
    { id: "model-output", source: "model", target: "output", type: "data_flow", label: "produce" },
  ],
};

const baseManifest: WorkflowManifest = {
  tools: ["ambient.responses", "workspace.read"],
  mutationPolicy: "read_only",
  maxToolCalls: 4,
  maxModelCalls: 2,
  maxRunMs: 120_000,
  connectors: [
    {
      connectorId: "gmail",
      accountId: "primary",
      scopes: ["mail.read"],
      operations: ["search"],
      dataRetention: "redacted_audit",
    },
  ],
};

describe("workflow graph diff", () => {
  it("detects added, removed, and changed graph nodes and edges", () => {
    const proposed: WorkflowGraphSnapshot = {
      ...baseGraph,
      id: "graph-proposed",
      version: 2,
      source: "revision",
      nodes: [
        { id: "request", type: "request", label: "Request", outputSummary: "Expanded request", x: 300, y: 200, runState: "completed" },
        { id: "connector", type: "connector_call", label: "Read Gmail", connectorIds: ["gmail"], description: "Read message metadata." },
        { id: "model", type: "model_call", label: "Classify and summarize", modelRole: "Categorize and summarize", toolNames: ["ambient.responses"] },
      ],
      edges: [
        { id: "request-connector", source: "request", target: "connector", type: "data_flow", label: "read" },
        { id: "connector-model", source: "connector", target: "model", type: "control_flow", label: "classify" },
        { id: "request-model", source: "request", target: "model", type: "condition", label: "if messages exist" },
      ],
    };

    const diff = diffWorkflowGraphs({ current: baseGraph, proposed });

    expect(diff.addedNodes.map((node) => node.id)).toEqual(["connector"]);
    expect(diff.removedNodes.map((node) => node.id)).toEqual(["output"]);
    expect(diff.changedNodes.map((node) => [node.id, node.fieldChanges.map((change) => change.field)])).toEqual([
      ["model", ["label", "modelRole", "retryPolicy"]],
      ["request", ["outputSummary"]],
    ]);
    expect(diff.addedEdges.map((edge) => edge.id)).toEqual(["connector-model", "request-connector"]);
    expect(diff.removedEdges.map((edge) => edge.id)).toEqual(["model-output"]);
    expect(diff.changedEdges).toEqual([
      expect.objectContaining({
        id: "request-model",
        fieldChanges: expect.arrayContaining([expect.objectContaining({ field: "type" }), expect.objectContaining({ field: "label" })]),
      }),
    ]);
    expect(workflowGraphDiffSummary(diff)).toContain("1 node added");
    expect(workflowGraphDiffSummary(diff)).toContain("2 nodes changed");
  });

  it("ignores layout and run-state-only changes", () => {
    const proposed: WorkflowGraphSnapshot = {
      ...baseGraph,
      id: "graph-layout-only",
      nodes: baseGraph.nodes.map((node, index) => ({ ...node, x: index * 160, y: index * 40, width: 220, height: 90, runState: "active" })),
      edges: baseGraph.edges.map((edge) => ({ ...edge, runState: "active" })),
    };

    const diff = diffWorkflowGraphs({ current: baseGraph, proposed });

    expect(workflowGraphDiffHasChanges(diff)).toBe(false);
    expect(workflowGraphDiffSummary(diff)).toBe("No workflow graph or manifest changes.");
  });

  it("detects manifest tool, grant, plugin, policy, and limit changes", () => {
    const proposedManifest: WorkflowManifest = {
      ...baseManifest,
      tools: ["workspace.read", "ambient.responses", "browser.search"],
      mutationPolicy: "staged_until_approved",
      maxToolCalls: 8,
      connectors: [
        {
          connectorId: "gmail",
          accountId: "primary",
          scopes: ["mail.read", "labels.write"],
          operations: ["search", "label"],
          dataRetention: "redacted_audit",
        },
        {
          connectorId: "slack",
          scopes: ["channels.read"],
          operations: ["search"],
          dataRetention: "none",
        },
      ],
      pluginCapabilities: [
        {
          capabilityId: "browser-search",
          pluginId: "browser",
          pluginName: "Browser",
          serverName: "browser",
          toolName: "search",
          registeredName: "browser.search",
        },
      ],
      googleWorkspaceMethods: [
        {
          methodId: "drive.files.list",
          accountHint: "user@example.com",
          accountProvenance: "literal",
          service: "drive",
          resource: "files",
          method: "list",
          httpMethod: "GET",
          path: "drive/v3/files",
          scopes: ["https://www.googleapis.com/auth/drive.readonly"],
          sideEffect: "personal_content_read",
          dataRetention: "run_artifact",
          dryRunSupported: false,
          catalogVersion: "test",
        },
      ],
    };

    const diff = diffWorkflowGraphs({
      current: baseGraph,
      proposed: baseGraph,
      currentManifest: baseManifest,
      proposedManifest,
    });

    expect(diff.manifest.fieldChanges.map((change) => change.field)).toEqual(["mutationPolicy", "maxToolCalls", "tools"]);
    expect(diff.manifest.changedConnectors.map((grant) => grant.id)).toEqual(["gmail:primary"]);
    expect(diff.manifest.addedConnectors.map((grant) => grant.id)).toEqual(["slack:default"]);
    expect(diff.manifest.addedPluginCapabilities.map((grant) => grant.id)).toEqual(["browser:browser:search:browser.search"]);
    expect(diff.manifest.addedGoogleWorkspaceMethods.map((grant) => grant.id)).toEqual(["user@example.com:drive.files.list"]);
    expect(workflowGraphDiffSummary(diff)).toContain("3 limits/policies changed");
    expect(workflowGraphDiffSummary(diff)).toContain("1 connector grant added");
    expect(workflowGraphDiffSummary(diff)).toContain("1 Google method grant added");
  });
});
