import { describe, expect, it } from "vitest";
import { workflowGraphFromSpec } from "./workflowAgentGraph";

describe("workflowGraphFromSpec", () => {
  it("creates a deterministic graph with connector, model, review, and output nodes", () => {
    const graph = workflowGraphFromSpec({
      title: "Inbox triage",
      spec: {
        goal: "Classify unread mail.",
        summary: "Read inbox metadata, classify messages, and stage labels.",
        successCriteria: ["Labels are staged for approval."],
      },
      manifest: {
        tools: ["ambient.responses", "gmail.search"],
        mutationPolicy: "staged_until_approved",
        connectors: [
          {
            connectorId: "gmail",
            accountId: "primary",
            scopes: ["mail.read"],
            operations: ["search"],
            dataRetention: "redacted_audit",
          },
        ],
      },
    });

    expect(graph.summary).toBe("Read inbox metadata, classify messages, and stage labels.");
    expect(graph.nodes.map((node) => [node.id, node.type])).toEqual([
      ["request", "request"],
      ["plan", "deterministic_step"],
      ["data-sources", "data_source"],
      ["ambient-model", "model_call"],
      ["review-gate", "review_gate"],
      ["output", "output"],
    ]);
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}:${edge.type}`)).toEqual([
      "request->plan:control_flow",
      "plan->data-sources:data_flow",
      "data-sources->ambient-model:control_flow",
      "ambient-model->review-gate:control_flow",
      "review-gate->output:data_flow",
    ]);
  });

  it("omits optional connector and review nodes for read-only local workflows", () => {
    const graph = workflowGraphFromSpec({
      title: "Local report",
      spec: { goal: "Summarize markdown files." },
      manifest: {
        tools: ["workspace.read"],
        mutationPolicy: "read_only",
      },
    });

    expect(graph.nodes.map((node) => node.id)).toEqual(["request", "plan", "output"]);
    expect(graph.edges.map((edge) => edge.id)).toEqual(["request-to-plan", "plan-to-output"]);
  });
});

