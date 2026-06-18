import type { WorkflowGraphEdge, WorkflowGraphNode, WorkflowManifest, WorkflowSpec } from "./workflowTypes";

export function workflowGraphFromSpec(input: {
  title: string;
  spec: WorkflowSpec;
  manifest: WorkflowManifest;
}): { summary: string; nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } {
  const usesModel = input.manifest.tools.includes("ambient.responses");
  const connectorIds = input.manifest.connectors?.map((connector) => connector.connectorId) ?? [];
  const hasMutation = input.manifest.mutationPolicy !== "read_only";
  const nodes: WorkflowGraphNode[] = [
    {
      id: "request",
      type: "request",
      label: "Request",
      description: input.spec.goal,
      outputSummary: input.spec.summary,
      x: 0,
      y: 0,
    },
    {
      id: "plan",
      type: "deterministic_step",
      label: "Workflow plan",
      description: input.spec.summary || input.title,
      toolNames: input.manifest.tools,
      retentionPolicy: "production",
      x: 260,
      y: 0,
    },
  ];
  const edges: WorkflowGraphEdge[] = [
    {
      id: "request-to-plan",
      source: "request",
      target: "plan",
      type: "control_flow",
      label: "compile",
    },
  ];

  let previous = "plan";
  if (connectorIds.length > 0) {
    nodes.push({
      id: "data-sources",
      type: "data_source",
      label: "Data sources",
      description: connectorIds.join(", "),
      connectorIds,
      retentionPolicy: "metadata allowed; content requires grants",
      x: 520,
      y: -80,
    });
    edges.push({ id: "plan-to-data-sources", source: previous, target: "data-sources", type: "data_flow", label: "read" });
    previous = "data-sources";
  }

  if (usesModel) {
    nodes.push({
      id: "ambient-model",
      type: "model_call",
      label: "Ambient model call",
      description: "Schema-validated Ambient reasoning inside the workflow.",
      modelRole: "categorize, extract, decide, or summarize as declared by the generated program",
      toolNames: ["ambient.responses"],
      retryPolicy: "retry only when the saved input and schema are still valid",
      x: 520,
      y: connectorIds.length > 0 ? 100 : 0,
    });
    edges.push({ id: `${previous}-to-ambient-model`, source: previous, target: "ambient-model", type: "control_flow", label: "reason" });
    previous = "ambient-model";
  }

  if (hasMutation) {
    nodes.push({
      id: "review-gate",
      type: "review_gate",
      label: "Review gate",
      description: "Approve staged mutations before the workflow applies changes.",
      reviewPolicy: input.manifest.mutationPolicy,
      x: 780,
      y: 0,
    });
    edges.push({ id: `${previous}-to-review-gate`, source: previous, target: "review-gate", type: "control_flow", label: "approval" });
    previous = "review-gate";
  }

  nodes.push({
    id: "output",
    type: "output",
    label: "Output",
    description: input.spec.successCriteria?.join("; ") || "Audit report and workflow result.",
    inputSummary: "step outputs, model results, connector summaries",
    x: 1040,
    y: 0,
  });
  edges.push({ id: `${previous}-to-output`, source: previous, target: "output", type: "data_flow", label: "produce" });

  return {
    summary: input.spec.summary || input.spec.goal || input.title,
    nodes,
    edges,
  };
}

