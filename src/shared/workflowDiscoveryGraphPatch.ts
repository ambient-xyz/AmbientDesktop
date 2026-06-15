import type {
  WorkflowDiscoveryGraphPatch,
  WorkflowGraphEdge,
  WorkflowGraphEdgeType,
  WorkflowGraphNode,
  WorkflowGraphNodeType,
  WorkflowGraphSnapshot,
  WorkflowGraphSnapshotSource,
} from "./types";

const GRAPH_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const NODE_TYPES: WorkflowGraphNodeType[] = [
  "request",
  "data_source",
  "deterministic_step",
  "agent_exploration",
  "model_call",
  "connector_call",
  "review_gate",
  "mutation",
  "output",
  "error_handler",
];
const EDGE_TYPES: WorkflowGraphEdgeType[] = ["data_flow", "control_flow", "condition", "retry", "resume"];
const DISCOVERY_BASE_NODE_IDS = ["request", "scope", "data-sources", "llm-role", "review", "side-effects", "error-handling", "output"];
const DISCOVERY_BASE_EDGE_IDS = [
  "request-to-scope",
  "scope-to-data",
  "data-to-model",
  "model-to-review",
  "review-to-side-effects",
  "side-effects-to-errors",
  "errors-to-output",
  "review-to-output",
];

export interface WorkflowDiscoveryGraphPatchValidationInput {
  currentGraph?: Pick<WorkflowGraphSnapshot, "nodes" | "edges">;
  allowedConnectorIds?: string[];
}

export interface WorkflowDiscoveryGraphPatchValidationResult {
  graphPatch?: WorkflowDiscoveryGraphPatch;
  blockedReasons?: string[];
}

export function validateWorkflowDiscoveryGraphPatch(
  raw: unknown,
  input: WorkflowDiscoveryGraphPatchValidationInput = {},
): WorkflowDiscoveryGraphPatchValidationResult {
  if (raw === undefined || raw === null) return {};
  try {
    const object = requireRecord(raw, "graphPatch");
    const currentNodeIds = new Set([...DISCOVERY_BASE_NODE_IDS, ...(input.currentGraph?.nodes ?? []).map((node) => node.id)]);
    const currentEdgeIds = new Set([...DISCOVERY_BASE_EDGE_IDS, ...(input.currentGraph?.edges ?? []).map((edge) => edge.id)]);
    const allowedConnectorIds = new Set((input.allowedConnectorIds ?? []).map((id) => id.trim()).filter(Boolean));
    const removeNodeIds = normalizeIdArray(object.removeNodeIds, "removeNodeIds");
    const removeEdgeIds = normalizeIdArray(object.removeEdgeIds, "removeEdgeIds");

    for (const id of removeNodeIds) {
      if (!currentNodeIds.has(id)) throw new Error(`graphPatch.removeNodeIds references unknown node id: ${id}`);
    }
    for (const id of removeEdgeIds) {
      if (!currentEdgeIds.has(id)) throw new Error(`graphPatch.removeEdgeIds references unknown edge id: ${id}`);
    }

    const upsertNodes = normalizeNodes(object.upsertNodes, allowedConnectorIds);
    const finalNodeIds = new Set([...currentNodeIds].filter((id) => !removeNodeIds.includes(id)));
    for (const node of upsertNodes) finalNodeIds.add(node.id);
    const upsertEdges = normalizeEdges(object.upsertEdges, finalNodeIds);
    const patch: WorkflowDiscoveryGraphPatch = {
      summary: optionalString(object.summary),
      upsertNodes: upsertNodes.length ? upsertNodes : undefined,
      upsertEdges: upsertEdges.length ? upsertEdges : undefined,
      removeNodeIds: removeNodeIds.length ? removeNodeIds : undefined,
      removeEdgeIds: removeEdgeIds.length ? removeEdgeIds : undefined,
      blockedReasons: normalizeStringArray(object.blockedReasons),
    };
    return hasGraphPatchContent(patch) ? { graphPatch: patch } : {};
  } catch (error) {
    return {
      blockedReasons: [`Ignored invalid discovery graph patch: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export function applyWorkflowDiscoveryGraphPatch(input: {
  workflowThreadId: string;
  baseGraph: Omit<WorkflowGraphSnapshot, "id" | "version"> | WorkflowGraphSnapshot;
  graphPatch?: WorkflowDiscoveryGraphPatch;
  source?: WorkflowGraphSnapshotSource;
  createdAt?: string;
}): Omit<WorkflowGraphSnapshot, "id" | "version"> {
  const patch = input.graphPatch;
  if (!patch || !hasGraphPatchContent(patch)) {
    return {
      workflowThreadId: input.workflowThreadId,
      source: input.source ?? input.baseGraph.source,
      summary: input.baseGraph.summary,
      nodes: input.baseGraph.nodes,
      edges: input.baseGraph.edges,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
  }
  const removeNodeIds = new Set(patch.removeNodeIds ?? []);
  const removeEdgeIds = new Set(patch.removeEdgeIds ?? []);
  const nodesById = new Map(input.baseGraph.nodes.filter((node) => !removeNodeIds.has(node.id)).map((node) => [node.id, node]));
  for (const node of patch.upsertNodes ?? []) nodesById.set(node.id, { ...nodesById.get(node.id), ...node });
  const edgesById = new Map(
    input.baseGraph.edges
      .filter((edge) => !removeEdgeIds.has(edge.id) && !removeNodeIds.has(edge.source) && !removeNodeIds.has(edge.target))
      .map((edge) => [edge.id, edge]),
  );
  for (const edge of patch.upsertEdges ?? []) {
    if (nodesById.has(edge.source) && nodesById.has(edge.target)) edgesById.set(edge.id, edge);
  }
  return {
    workflowThreadId: input.workflowThreadId,
    source: input.source ?? input.baseGraph.source,
    summary: patch.summary ?? input.baseGraph.summary,
    nodes: [...nodesById.values()],
    edges: [...edgesById.values()],
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

function normalizeNodes(raw: unknown, allowedConnectorIds: Set<string>): WorkflowGraphNode[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("graphPatch.upsertNodes must be an array.");
  return raw.slice(0, 40).map((item, index) => {
    const object = requireRecord(item, `graphPatch.upsertNodes[${index}]`);
    const id = requiredGraphId(object.id, `graphPatch.upsertNodes[${index}].id`);
    const type = requiredEnum<WorkflowGraphNodeType>(object.type, NODE_TYPES, `graphPatch.upsertNodes[${index}].type`);
    const connectorIds = normalizeStringArray(object.connectorIds);
    if (connectorIds?.some((connectorId) => !allowedConnectorIds.has(connectorId))) {
      throw new Error(`graphPatch node ${id} references connector ids that were not present in discovery metadata.`);
    }
    return {
      id,
      type,
      label: requiredString(object.label, `graphPatch.upsertNodes[${index}].label`).slice(0, 240),
      description: optionalString(object.description, 4000),
      modelRole: optionalString(object.modelRole, 2000),
      dataSummary: optionalString(object.dataSummary, 2000),
      inputSummary: optionalString(object.inputSummary, 2000),
      outputSummary: optionalString(object.outputSummary, 2000),
      toolNames: normalizeStringArray(object.toolNames),
      connectorIds,
      retryPolicy: optionalString(object.retryPolicy, 2000),
      retentionPolicy: optionalString(object.retentionPolicy, 2000),
      reviewPolicy: optionalString(object.reviewPolicy, 2000),
      x: optionalNumber(object.x),
      y: optionalNumber(object.y),
      width: optionalPositiveNumber(object.width),
      height: optionalPositiveNumber(object.height),
    };
  });
}

function normalizeEdges(raw: unknown, nodeIds: Set<string>): WorkflowGraphEdge[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("graphPatch.upsertEdges must be an array.");
  return raw.slice(0, 80).map((item, index) => {
    const object = requireRecord(item, `graphPatch.upsertEdges[${index}]`);
    const id = requiredGraphId(object.id, `graphPatch.upsertEdges[${index}].id`);
    const source = requiredGraphId(object.source, `graphPatch.upsertEdges[${index}].source`);
    const target = requiredGraphId(object.target, `graphPatch.upsertEdges[${index}].target`);
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      throw new Error(`graphPatch edge ${id} references a missing source or target node.`);
    }
    return {
      id,
      source,
      target,
      type: requiredEnum<WorkflowGraphEdgeType>(object.type, EDGE_TYPES, `graphPatch.upsertEdges[${index}].type`),
      label: optionalString(object.label, 240),
      dataSummary: optionalString(object.dataSummary, 2000),
    };
  });
}

function hasGraphPatchContent(patch: WorkflowDiscoveryGraphPatch): boolean {
  return Boolean(
    patch.summary ||
      patch.upsertNodes?.length ||
      patch.upsertEdges?.length ||
      patch.removeNodeIds?.length ||
      patch.removeEdgeIds?.length ||
      patch.blockedReasons?.length,
  );
}

function requireRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label} must be an object.`);
  return raw as Record<string, unknown>;
}

function requiredGraphId(raw: unknown, label: string): string {
  const value = requiredString(raw, label);
  if (!GRAPH_ID_RE.test(value)) throw new Error(`${label} must be a stable graph id.`);
  return value;
}

function requiredString(raw: unknown, label: string): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function requiredEnum<T extends string>(raw: unknown, values: readonly T[], label: string): T {
  const value = requiredString(raw, label) as T;
  if (!values.includes(value)) throw new Error(`${label} must be one of: ${values.join(", ")}.`);
  return value;
}

function normalizeIdArray(raw: unknown, label: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error(`graphPatch.${label} must be an array.`);
  return [...new Set(raw.map((item) => requiredGraphId(item, `graphPatch.${label}`)))].slice(0, 80);
}

function normalizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 80);
  return values.length ? [...new Set(values)] : undefined;
}

function optionalString(raw: unknown, maxLength = 10_000): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, maxLength) : undefined;
}

function optionalNumber(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function optionalPositiveNumber(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : undefined;
}
