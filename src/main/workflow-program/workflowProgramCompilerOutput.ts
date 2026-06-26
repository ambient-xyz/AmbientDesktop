import type { WorkflowProgramIR, WorkflowProgramNode } from "../../shared/workflowProgramIr";
import type { WorkflowGraphEdge, WorkflowGraphNode, WorkflowSpec } from "../../shared/workflowTypes";
import type { DesktopToolDescriptor } from "./workflowProgramDesktopToolFacade";
import type { WorkflowProgramAmbientCliCapability } from "./workflowProgramCapabilityResolver";
import { resolveWorkflowProgramManifest } from "./workflowProgramCapabilityResolver";
import { generateWorkflowProgramSource } from "./workflowProgramCodegen";
import type { WorkflowProgramLoweredOperationPlan } from "./workflowProgramLowering";
import type { WorkflowCompilerOutput } from "./workflowProgramWorkflowCompilerFacade";
import type { WorkflowConnectorDescriptor } from "./workflowProgramWorkflowFacade";

export function workflowCompilerOutputFromProgram(
  program: WorkflowProgramIR,
  loweredPlan: WorkflowProgramLoweredOperationPlan,
  toolDescriptors: DesktopToolDescriptor[],
  connectorDescriptors: WorkflowConnectorDescriptor[],
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[],
): WorkflowCompilerOutput {
  const orderedNodes = loweredPlan.operations.map((operation) => operation.node);
  const manifest = resolveWorkflowProgramManifest({
    nodes: orderedNodes,
    program,
    toolDescriptors,
    connectorDescriptors,
    ambientCliCapabilities,
  });
  const graph = workflowProgramGraph(program, orderedNodes);
  const source = generateWorkflowProgramSource({ nodes: orderedNodes, toolDescriptors, connectorDescriptors });
  const spec: WorkflowSpec = {
    goal: program.goal,
    summary: program.summary ?? program.goal,
    successCriteria: program.successCriteria,
    inputs: program.inputs,
  };
  return {
    title: program.title,
    spec,
    manifest,
    graph,
    source,
    previewSummary: program.summary ?? program.goal,
    dryRunStrategy:
      "Generated from validated WorkflowProgramIR and executed with mocked workflow/tools/ambient/connectors before preview persistence.",
    openQuestions: program.openQuestions ?? [],
  };
}

function workflowProgramGraph(
  program: WorkflowProgramIR,
  orderedNodes: WorkflowProgramNode[],
): { summary: string; nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } {
  const nodes: WorkflowGraphNode[] = [
    {
      id: "request",
      type: "request",
      label: "Request",
      description: program.goal,
      outputSummary: program.summary,
      x: 0,
      y: 0,
    },
    ...orderedNodes.map((node, index) => workflowGraphNodeForProgramNode(node, index)),
  ];
  const explicitEdges = program.edges ?? [];
  const edges: WorkflowGraphEdge[] = [
    ...orderedNodes
      .filter((node) => (node.dependsOn ?? []).length === 0)
      .map((node) => ({
        id: `request-to-${node.id}`,
        source: "request",
        target: node.id,
        type: "control_flow" as const,
      })),
    ...orderedNodes.flatMap((node) =>
      (node.dependsOn ?? []).map((dependencyId) => ({
        id: `${dependencyId}-to-${node.id}`,
        source: dependencyId,
        target: node.id,
        type: "data_flow" as const,
      })),
    ),
    ...explicitEdges.map((edge) => ({
      id: edge.id ?? `${edge.source}-to-${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: edge.type ?? ("data_flow" as const),
      label: edge.label,
    })),
  ];
  return {
    summary: program.summary ?? program.goal,
    nodes,
    edges: dedupeEdges(edges),
  };
}

function workflowGraphNodeForProgramNode(node: WorkflowProgramNode, index: number): WorkflowGraphNode {
  const base = {
    id: node.id,
    label: node.label ?? humanizeNodeId(node.id),
    description: node.description,
    inputSummary: (node.dependsOn ?? []).join(", ") || "workflow request",
    outputSummary: node.output?.type ?? workflowProgramNodeOutputSummary(node),
    x: 260 + index * 260,
    y: 0,
  };
  if (node.kind === "model.call") {
    return { ...base, type: "model_call", modelRole: node.task, toolNames: ["ambient.responses"], retryPolicy: "schema retry" };
  }
  if (node.kind === "model.map") {
    return {
      ...base,
      type: "model_call",
      modelRole: node.task,
      toolNames: ["ambient.responses"],
      retryPolicy: `bounded model fan-out, max ${node.maxItems} items; retry or skip failed chunks/items and continue with partial coverage`,
    };
  }
  if (node.kind === "model.reduce") {
    const reducePolicy =
      node.strategy === "tree"
        ? `tree reduce max ${node.maxInputItems} inputs, fan-in ${node.maxFanIn ?? 8}, levels ${node.maxLevels ?? 8}`
        : `schema retry over max ${node.maxInputItems} reduced inputs`;
    return { ...base, type: "model_call", modelRole: node.task, toolNames: ["ambient.responses"], retryPolicy: reducePolicy };
  }
  if (node.kind === "tool.paginate")
    return {
      ...base,
      type: toolGraphNodeType(node.tool),
      toolNames: [node.tool],
      retryPolicy: `read-only bounded tool pagination, max ${node.maxItems} items across ${node.maxPages} pages; checkpointed page retry; continue with partial results after failed page`,
    };
  if (node.kind === "checkpoint.write") return { ...base, type: "deterministic_step", retentionPolicy: "checkpoint" };
  if (node.kind === "review.input")
    return { ...base, type: "review_gate", reviewPolicy: "Pause for structured user input with workflow.askUser." };
  if (node.kind === "approval.required")
    return { ...base, type: "review_gate", reviewPolicy: "Pause until the user approves or rejects the proposed change set." };
  if (node.kind === "browser.intervention") {
    const loginIntervention = node.tool === "browser_login";
    return {
      ...base,
      type: "data_source",
      toolNames: node.screenshot && node.screenshot.enabled !== false ? [node.tool, "browser_screenshot"] : [node.tool],
      reviewPolicy: loginIntervention
        ? "Pause only if browser login reports CAPTCHA, MFA, passkey, consent, or another user-action state; then let downstream browser steps verify progress."
        : "Pause only if the browser reports CAPTCHA, login, MFA, consent, or another user-action state; then retry the same browser operation with the preserved userActionId.",
      retryPolicy: loginIntervention
        ? "user-confirmed handoff; downstream verification"
        : "single same-session retry after user confirmation",
    };
  }
  if (node.kind === "branch.if") return { ...base, type: "deterministic_step", retryPolicy: "deterministic branch selection" };
  if (node.kind === "loop.map") {
    const mapTool =
      node.map && typeof node.map === "object" && !Array.isArray(node.map) && (node.map as { kind?: unknown }).kind === "tool.call"
        ? (node.map as { tool?: unknown })
        : undefined;
    const toolName = typeof mapTool?.tool === "string" ? mapTool.tool : undefined;
    return toolName
      ? {
          ...base,
          type: toolGraphNodeType(toolName),
          toolNames: [toolName],
          retryPolicy: `bounded tool fan-out, max ${node.maxItems ?? 1000} items; retry or skip failed items and continue with partial coverage`,
        }
      : { ...base, type: "deterministic_step", retryPolicy: "deterministic bounded map" };
  }
  if (node.kind === "error.handle") return { ...base, type: "error_handler", retryPolicy: "fallback value on handled errors" };
  if (node.kind === "mutation.stage")
    return { ...base, type: "mutation", toolNames: [node.tool], reviewPolicy: "Stage mutation until explicit approval." };
  if (node.kind === "connector.call") return { ...base, type: "connector_call", connectorIds: [node.connectorId] };
  if (node.kind === "connector.paginate")
    return {
      ...base,
      type: "connector_call",
      connectorIds: [node.connectorId],
      retryPolicy: `read-only bounded pagination, max ${node.maxItems} items across ${node.maxPages} pages; checkpointed page retry; continue with partial results after failed page`,
    };
  if (node.kind === "connector.map")
    return {
      ...base,
      type: "connector_call",
      connectorIds: [node.connectorId],
      retryPolicy: `read-only bounded fan-out, max ${node.maxItems ?? 1000} items; retry or skip failed items`,
    };
  if (node.kind === "collection.map")
    return {
      ...base,
      type: "deterministic_step",
      retryPolicy: `deterministic bounded map, max ${node.maxItems} items; retry or skip failed items`,
    };
  if (node.kind === "collection.filter")
    return { ...base, type: "deterministic_step", retryPolicy: `deterministic bounded filter, max ${node.maxItems} retained items` };
  if (node.kind === "collection.dedupe")
    return {
      ...base,
      type: "deterministic_step",
      retryPolicy: `deterministic ${node.strategy ?? "url_canonical"} dedupe, max ${node.maxItems} retained items`,
    };
  if (node.kind === "collection.chunk")
    return { ...base, type: "deterministic_step", retryPolicy: `deterministic chunks, max ${node.maxChunks} chunks of ${node.chunkSize}` };
  if (node.kind === "document.render")
    return {
      ...base,
      type: "output",
      retryPolicy: `deterministic ${node.format} render`,
      retentionPolicy: "artifact content staged only by explicit mutation",
    };
  if (node.kind === "transform.template") return { ...base, type: "deterministic_step" };
  if (node.kind === "output.final") return { ...base, type: "output" };
  return {
    ...base,
    type: toolGraphNodeType(node.tool),
    toolNames: [node.tool],
  };
}

export function workflowProgramNodeOutputSummary(node: WorkflowProgramNode): string {
  if (node.kind === "model.call") return "schema-validated model output";
  if (node.kind === "model.map") return "bounded per-item schema-validated model outputs";
  if (node.kind === "model.reduce") return "schema-validated reduced model output";
  if (node.kind === "tool.call") return `${node.tool} result`;
  if (node.kind === "tool.paginate") return `${node.tool} paginated results`;
  if (node.kind === "connector.call") return `${node.connectorId}.${node.operation} result`;
  if (node.kind === "connector.paginate") return `${node.connectorId}.${node.operation} paginated results`;
  if (node.kind === "connector.map") return `${node.connectorId}.${node.operation} mapped results`;
  if (node.kind === "collection.map") return "deterministically mapped collection";
  if (node.kind === "collection.filter") return "deterministically filtered collection";
  if (node.kind === "collection.dedupe") return "deterministically deduplicated collection";
  if (node.kind === "collection.chunk") return "deterministically chunked collection";
  if (node.kind === "document.render") return "deterministically rendered document";
  if (node.kind === "mutation.stage") return `${node.tool} staged mutation result`;
  if (node.kind === "review.input") return "user input response";
  if (node.kind === "browser.intervention") return "browser result with optional user-action handoff";
  if (node.kind === "approval.required") return "approval decision";
  if (node.kind === "branch.if") return "conditional branch value";
  if (node.kind === "loop.map") return "mapped item values";
  if (node.kind === "error.handle") return "handled value or fallback";
  if (node.kind === "checkpoint.write") return "checkpoint value";
  if (node.kind === "transform.template") return "rendered template value";
  return "final workflow output";
}

function toolGraphNodeType(tool: string): WorkflowGraphNode["type"] {
  if (tool.startsWith("browser_")) return "data_source";
  if (
    tool === "file_read" ||
    tool === "local_directory_list" ||
    tool === "local_file_read" ||
    tool === "ambient_visual_analyze" ||
    tool === "google_workspace_call" ||
    tool === "google_workspace_status" ||
    tool === "google_workspace_search_methods"
  )
    return "data_source";
  if (tool === "file_write" || tool === "google_workspace_materialize_file") return "output";
  return "deterministic_step";
}

function dedupeEdges(edges: WorkflowGraphEdge[]): WorkflowGraphEdge[] {
  const byId = new Map<string, WorkflowGraphEdge>();
  for (const edge of edges) byId.set(edge.id, edge);
  return [...byId.values()];
}

function humanizeNodeId(id: string): string {
  return id
    .replace(/[-_.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
