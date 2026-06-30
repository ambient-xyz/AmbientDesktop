import type { SubagentRunStatus } from "./subagentProtocol";
import type { SubagentRoleId } from "./subagentRoles";
import type { SymphonyWorkflowPatternId } from "./symphonyWorkflowPatternTypes";

export const SUBAGENT_EFFECTIVE_ROLE_SNAPSHOT_SCHEMA_VERSION = "ambient-subagent-effective-role-v1" as const;
export const SUBAGENT_PATTERN_ROLE_GRAPH_SCHEMA_VERSION = "ambient-subagent-pattern-role-graph-v1" as const;
export const SUBAGENT_PATTERN_GRAPH_SNAPSHOT_SCHEMA_VERSION = "ambient-subagent-pattern-graph-v1" as const;

export const SUBAGENT_PATTERN_ROLE_IDS = [
  "mapper",
  "reducer",
  "validator",
  "debater",
  "arbiter",
  "drafter",
  "verifier",
  "stage_runner",
  "gatekeeper",
  "proposer",
  "scorer",
  "synthesizer",
  "repair_worker",
  "checkpoint_recorder",
] as const;

export type SubagentPatternRoleId = typeof SUBAGENT_PATTERN_ROLE_IDS[number];

export type SubagentPatternGraphNodeKind =
  | "child"
  | "reducer"
  | "arbiter"
  | "verifier"
  | "stage"
  | "proposal"
  | "scorer"
  | "synthesizer"
  | "repair"
  | "checkpoint"
  | "overflow";

export type SubagentPatternGraphEdgeKind =
  | "maps_to"
  | "reduces_to"
  | "debates_with"
  | "arbitrates"
  | "verifies"
  | "stage_handoff"
  | "scores"
  | "synthesizes"
  | "repairs"
  | "checkpoints"
  | "blocks_parent";

export type SubagentPatternGraphStatus =
  | "queued"
  | "running"
  | "blocked"
  | "approval_needed"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "completed"
  | "partial"
  | "idle";

export type SubagentPatternGraphApprovalState = "none" | "pending" | "approved" | "denied";

export interface SubagentRoleOverlaySnapshot {
  id: string;
  label: string;
  narrowsAuthority: true;
  widensAuthority: false;
  adds: string[];
}

export interface SubagentEffectiveRoleSnapshot {
  schemaVersion: typeof SUBAGENT_EFFECTIVE_ROLE_SNAPSHOT_SCHEMA_VERSION;
  baseRole: SubagentRoleId;
  patternRole: SubagentPatternRoleId;
  displayLabel: string;
  roleOverlayIds: string[];
  overlays: SubagentRoleOverlaySnapshot[];
  nonWidening: true;
  outputContract?: string;
}

export interface SubagentPatternRoleNode {
  id: string;
  label: string;
  baseRole: SubagentRoleId;
  patternRole: SubagentPatternRoleId;
  roleOverlayIds: string[];
  overlayLabels: string[];
  kind: SubagentPatternGraphNodeKind;
  required: boolean;
  maxInstances?: number;
}

export interface SubagentPatternRoleEdge {
  id: string;
  from: string;
  to: string;
  kind: SubagentPatternGraphEdgeKind;
  required: boolean;
  label: string;
}

export interface SubagentPatternRoleGraph {
  schemaVersion: typeof SUBAGENT_PATTERN_ROLE_GRAPH_SCHEMA_VERSION;
  patternId: SymphonyWorkflowPatternId;
  label: string;
  nodes: SubagentPatternRoleNode[];
  edges: SubagentPatternRoleEdge[];
}

export interface SubagentPatternGraphNode {
  id: string;
  label: string;
  kind: SubagentPatternGraphNodeKind;
  baseRole?: SubagentRoleId;
  patternRole?: SubagentPatternRoleId;
  roleOverlayIds?: string[];
  childRunId?: string;
  childThreadId?: string;
  workflowTaskId?: string;
  workflowRunId?: string;
  status: SubagentPatternGraphStatus;
  statusLabel: string;
  blockingParent: boolean;
  approvalState: SubagentPatternGraphApprovalState;
  overflowCount?: number;
  overflowChildren?: SubagentPatternGraphOverflowChild[];
  summary?: string;
}

export interface SubagentPatternGraphOverflowChild {
  childRunId: string;
  childThreadId: string;
  label: string;
  status: SubagentPatternGraphStatus;
  statusLabel: string;
  blockingParent: boolean;
  approvalState: SubagentPatternGraphApprovalState;
  summary?: string;
}

export interface SubagentPatternGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: SubagentPatternGraphEdgeKind;
  required: boolean;
  status: SubagentPatternGraphStatus;
  statusLabel: string;
  blockingParent: boolean;
  label: string;
}

export interface SubagentPatternGraphSnapshot {
  schemaVersion: typeof SUBAGENT_PATTERN_GRAPH_SNAPSHOT_SCHEMA_VERSION;
  version: 1;
  patternId: SymphonyWorkflowPatternId;
  label: string;
  layout: SymphonyWorkflowPatternId;
  parentThreadId: string;
  parentMessageId?: string;
  workflowTaskId?: string;
  workflowRunId?: string;
  updatedAt: string;
  nodes: SubagentPatternGraphNode[];
  edges: SubagentPatternGraphEdge[];
}

export interface SubagentPatternGraphChildBinding {
  roleNodeId: string;
  childRunId: string;
  childThreadId: string;
  label?: string;
  status?: SubagentRunStatus | SubagentPatternGraphStatus;
  approvalState?: SubagentPatternGraphApprovalState;
  blockingParent?: boolean;
  summary?: string;
}

export function effectiveSubagentRoleSnapshot(input: {
  baseRole: SubagentRoleId;
  patternRole: SubagentPatternRoleId;
  overlayLabels: readonly string[];
  outputContract?: string;
}): SubagentEffectiveRoleSnapshot {
  const roleOverlayIds = input.overlayLabels.map((label) => roleOverlayId(input.patternRole, label));
  return {
    schemaVersion: SUBAGENT_EFFECTIVE_ROLE_SNAPSHOT_SCHEMA_VERSION,
    baseRole: input.baseRole,
    patternRole: input.patternRole,
    displayLabel: `${titleCase(input.baseRole)} + ${titleCase(input.patternRole)}`,
    roleOverlayIds,
    overlays: input.overlayLabels.map((label, index) => ({
      id: roleOverlayIds[index]!,
      label,
      narrowsAuthority: true,
      widensAuthority: false,
      adds: [label],
    })),
    nonWidening: true,
    ...(input.outputContract ? { outputContract: input.outputContract } : {}),
  };
}

export function isSubagentEffectiveRoleSnapshot(
  value: unknown,
  expectedBaseRole?: string,
): value is SubagentEffectiveRoleSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<SubagentEffectiveRoleSnapshot>;
  if (record.schemaVersion !== SUBAGENT_EFFECTIVE_ROLE_SNAPSHOT_SCHEMA_VERSION) return false;
  if (typeof record.baseRole !== "string" || !record.baseRole.trim()) return false;
  if (expectedBaseRole && record.baseRole !== expectedBaseRole) return false;
  if (typeof record.patternRole !== "string" || !record.patternRole.trim()) return false;
  if (typeof record.displayLabel !== "string" || !record.displayLabel.trim()) return false;
  if (!Array.isArray(record.roleOverlayIds) || record.roleOverlayIds.some((id) => typeof id !== "string" || !id.trim())) {
    return false;
  }
  if (!Array.isArray(record.overlays)) return false;
  if (record.nonWidening !== true) return false;
  return record.overlays.every((overlay) =>
    overlay &&
    typeof overlay === "object" &&
    !Array.isArray(overlay) &&
    typeof overlay.id === "string" &&
    overlay.id.trim().length > 0 &&
    typeof overlay.label === "string" &&
    overlay.label.trim().length > 0 &&
    overlay.narrowsAuthority === true &&
    overlay.widensAuthority === false &&
    Array.isArray(overlay.adds) &&
    overlay.adds.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

export function buildDefaultSymphonyPatternRoleGraph(patternId: SymphonyWorkflowPatternId): SubagentPatternRoleGraph {
  const graph = DEFAULT_PATTERN_ROLE_GRAPHS[patternId];
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      roleOverlayIds: [...node.roleOverlayIds],
      overlayLabels: [...node.overlayLabels],
    })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}

export function buildPatternGraphSnapshot(input: {
  patternId: SymphonyWorkflowPatternId;
  parentThreadId: string;
  parentMessageId?: string;
  workflowTaskId?: string;
  workflowRunId?: string;
  updatedAt: string;
  childBindings?: SubagentPatternGraphChildBinding[];
  maxVisibleChildrenPerRole?: number;
}): SubagentPatternGraphSnapshot {
  const roleGraph = buildDefaultSymphonyPatternRoleGraph(input.patternId);
  const bindingsByRole = new Map<string, SubagentPatternGraphChildBinding[]>();
  for (const binding of input.childBindings ?? []) {
    const group = bindingsByRole.get(binding.roleNodeId) ?? [];
    group.push(binding);
    bindingsByRole.set(binding.roleNodeId, group);
  }

  const maxVisible = Math.max(1, input.maxVisibleChildrenPerRole ?? 6);
  const nodes: SubagentPatternGraphNode[] = [];
  const roleNodeIdToGraphNodeIds = new Map<string, string[]>();
  for (const roleNode of roleGraph.nodes) {
    const bindings = bindingsByRole.get(roleNode.id) ?? [];
    const visibleBindings = bindings.slice(0, maxVisible);
    const overflow = bindings.length - visibleBindings.length;
    const graphNodeIds: string[] = [];
    if (visibleBindings.length === 0) {
      const graphNode = roleGraphNodeToSnapshotNode(roleNode);
      nodes.push(graphNode);
      graphNodeIds.push(graphNode.id);
    } else {
      visibleBindings.forEach((binding) => {
        const graphNode = roleGraphNodeToSnapshotNode(roleNode, binding);
        nodes.push(graphNode);
        graphNodeIds.push(graphNode.id);
      });
    }
    if (overflow > 0) {
      const overflowChildren = bindings.slice(maxVisible).map((binding, index) =>
        overflowChildFromBinding(roleNode, binding, maxVisible + index)
      );
      const overflowStatus = aggregatePatternGraphOverflowStatus(overflowChildren);
      const overflowApprovalState = aggregatePatternGraphOverflowApprovalState(overflowChildren);
      const overflowBlocksParent = overflowChildren.some((child) =>
        child.blockingParent && child.status !== "completed" && child.status !== "idle"
      );
      const overflowNode: SubagentPatternGraphNode = {
        id: `${roleNode.id}:overflow`,
        label: `+${overflow} ${roleNode.label}`,
        kind: "overflow",
        baseRole: roleNode.baseRole,
        patternRole: roleNode.patternRole,
        roleOverlayIds: [...roleNode.roleOverlayIds],
        status: overflowStatus,
        statusLabel: overflowStatus === "idle" ? `${overflow} more` : `${overflow} ${graphStatusLabel(overflowStatus).toLowerCase()}`,
        blockingParent: overflowBlocksParent,
        approvalState: overflowApprovalState,
        overflowCount: overflow,
        overflowChildren,
        summary: `${overflow} additional ${roleNode.label} children are grouped for readability.`,
      };
      nodes.push(overflowNode);
      graphNodeIds.push(overflowNode.id);
    }
    roleNodeIdToGraphNodeIds.set(roleNode.id, graphNodeIds);
  }

  const edges = roleGraph.edges.flatMap((edge) => {
    const fromIds = roleNodeIdToGraphNodeIds.get(edge.from) ?? [edge.from];
    const toIds = roleNodeIdToGraphNodeIds.get(edge.to) ?? [edge.to];
    return fromIds.flatMap((from) => toIds.map((to) => ({
      id: `${edge.id}:${from}->${to}`,
      from,
      to,
      kind: edge.kind,
      required: edge.required,
      status: "idle" as const,
      statusLabel: "Idle",
      blockingParent: false,
      label: edge.label,
    })));
  });
  const runtimeEdges = subagentPatternGraphEdgesWithRuntimeState(edges, nodes);

  return {
    schemaVersion: SUBAGENT_PATTERN_GRAPH_SNAPSHOT_SCHEMA_VERSION,
    version: 1,
    patternId: roleGraph.patternId,
    label: roleGraph.label,
    layout: roleGraph.patternId,
    parentThreadId: input.parentThreadId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    ...(input.workflowTaskId ? { workflowTaskId: input.workflowTaskId } : {}),
    ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
    updatedAt: input.updatedAt,
    nodes,
    edges: runtimeEdges,
  };
}

export function subagentPatternGraphEdgesWithRuntimeState(
  edges: readonly SubagentPatternGraphEdge[],
  nodes: readonly SubagentPatternGraphNode[],
): SubagentPatternGraphEdge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) return edge;
    const status = graphEdgeStatus(edge, from, to);
    return {
      ...edge,
      status,
      statusLabel: graphStatusLabel(status),
      blockingParent: graphEdgeBlocksParent(edge, from, to, status),
    };
  });
}

export function validatePatternGraphSnapshot(snapshot: SubagentPatternGraphSnapshot): string[] {
  const issues: string[] = [];
  if (snapshot.schemaVersion !== SUBAGENT_PATTERN_GRAPH_SNAPSHOT_SCHEMA_VERSION) {
    issues.push(`Pattern graph snapshot schema must be ${SUBAGENT_PATTERN_GRAPH_SNAPSHOT_SCHEMA_VERSION}.`);
  }
  if (!snapshot.parentThreadId) issues.push("Pattern graph snapshot is missing parentThreadId.");
  if (!snapshot.updatedAt) issues.push("Pattern graph snapshot is missing updatedAt.");
  const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
  if (nodeIds.size !== snapshot.nodes.length) issues.push("Pattern graph snapshot contains duplicate node IDs.");
  for (const node of snapshot.nodes) {
    if (!node.label.trim()) issues.push(`Pattern graph node ${node.id} is missing a label.`);
    if (node.roleOverlayIds && node.roleOverlayIds.some((id) => !id.trim())) {
      issues.push(`Pattern graph node ${node.id} has an empty role overlay ID.`);
    }
    if (node.overflowCount !== undefined) {
      if (node.overflowCount < 1) issues.push(`Pattern graph overflow node ${node.id} must have a positive overflowCount.`);
      if (!node.overflowChildren?.length) {
        issues.push(`Pattern graph overflow node ${node.id} must preserve grouped child metadata.`);
      } else {
        if (node.overflowChildren.length !== node.overflowCount) {
          issues.push(`Pattern graph overflow node ${node.id} count does not match grouped child metadata.`);
        }
        for (const child of node.overflowChildren) {
          if (!child.childRunId || !child.childThreadId) {
            issues.push(`Pattern graph overflow node ${node.id} has grouped child metadata without child identity.`);
          }
          if (!child.label.trim()) issues.push(`Pattern graph overflow node ${node.id} has a grouped child without a label.`);
        }
      }
    }
  }
  for (const edge of snapshot.edges) {
    if (!nodeIds.has(edge.from)) issues.push(`Pattern graph edge ${edge.id} references missing from node ${edge.from}.`);
    if (!nodeIds.has(edge.to)) issues.push(`Pattern graph edge ${edge.id} references missing to node ${edge.to}.`);
  }
  return issues;
}

function overflowChildFromBinding(
  roleNode: SubagentPatternRoleNode,
  binding: SubagentPatternGraphChildBinding,
  index: number,
): SubagentPatternGraphOverflowChild {
  const status = graphStatusFromRunStatus(binding.status);
  return {
    childRunId: binding.childRunId,
    childThreadId: binding.childThreadId,
    label: binding.label ?? `${roleNode.label} ${index + 1}`,
    status,
    statusLabel: graphStatusLabel(status, binding.status),
    blockingParent: binding.blockingParent ?? roleNode.required,
    approvalState: binding.approvalState ?? "none",
    ...(binding.summary ? { summary: binding.summary } : {}),
  };
}

export function aggregatePatternGraphOverflowStatus(
  children: readonly SubagentPatternGraphOverflowChild[],
): SubagentPatternGraphStatus {
  if (children.length === 0) return "idle";
  const statuses = children.map((child) => child.status);
  const approvalPending = children.some((child) => child.approvalState === "pending") || statuses.includes("approval_needed");
  if (approvalPending) return "approval_needed";
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("timed_out")) return "timed_out";
  if (statuses.includes("cancelled")) return "cancelled";
  if (statuses.includes("partial")) return "partial";
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("running")) return "running";
  if (statuses.includes("queued")) return "queued";
  if (statuses.every((status) => status === "completed")) return "completed";
  return "idle";
}

export function aggregatePatternGraphOverflowApprovalState(
  children: readonly SubagentPatternGraphOverflowChild[],
): SubagentPatternGraphApprovalState {
  if (children.some((child) => child.approvalState === "pending")) return "pending";
  if (children.some((child) => child.approvalState === "denied")) return "denied";
  if (children.length > 0 && children.every((child) => child.approvalState === "approved")) return "approved";
  return "none";
}

function roleGraphNodeToSnapshotNode(
  roleNode: SubagentPatternRoleNode,
  binding?: SubagentPatternGraphChildBinding,
): SubagentPatternGraphNode {
  const status = graphStatusFromRunStatus(binding?.status);
  return {
    id: binding ? `${roleNode.id}:${binding.childRunId}` : roleNode.id,
    label: binding?.label ?? roleNode.label,
    kind: roleNode.kind,
    baseRole: roleNode.baseRole,
    patternRole: roleNode.patternRole,
    roleOverlayIds: [...roleNode.roleOverlayIds],
    ...(binding?.childRunId ? { childRunId: binding.childRunId } : {}),
    ...(binding?.childThreadId ? { childThreadId: binding.childThreadId } : {}),
    status,
    statusLabel: graphStatusLabel(status, binding?.status),
    blockingParent: binding?.blockingParent ?? roleNode.required,
    approvalState: binding?.approvalState ?? "none",
    ...(binding?.summary ? { summary: binding.summary } : {}),
  };
}

function graphStatusFromRunStatus(status: SubagentRunStatus | SubagentPatternGraphStatus | undefined): SubagentPatternGraphStatus {
  if (!status) return "queued";
  if (status === "reserved" || status === "starting") return "queued";
  if (status === "waiting" || status === "needs_attention") return "blocked";
  if (status === "aborted_partial" || status === "detached") return "partial";
  if (status === "stopped" || status === "cancelled") return "cancelled";
  if (status === "timed_out") return "timed_out";
  return status;
}

function graphStatusLabel(status: SubagentPatternGraphStatus, raw?: string): string {
  if (raw === "needs_attention") return "Needs attention";
  return titleCase(status);
}

function graphEdgeStatus(
  edge: SubagentPatternGraphEdge,
  from: SubagentPatternGraphNode,
  to: SubagentPatternGraphNode,
): SubagentPatternGraphStatus {
  const endpointStatuses = [from.status, to.status];
  const approvalPending = from.approvalState === "pending" || to.approvalState === "pending";
  if (approvalPending || endpointStatuses.includes("approval_needed")) return "approval_needed";
  if (endpointStatuses.includes("failed")) return "failed";
  if (endpointStatuses.includes("timed_out")) return "timed_out";
  if (endpointStatuses.includes("cancelled")) return "cancelled";
  if (endpointStatuses.includes("partial")) return "partial";
  if (endpointStatuses.includes("blocked")) return "blocked";
  if (endpointStatuses.includes("running")) return "running";
  if (endpointStatuses.includes("queued")) return edge.required ? "queued" : "idle";
  if (endpointStatuses.every((status) => status === "completed")) return "completed";
  if (endpointStatuses.includes("completed") && edge.required) return "running";
  return edge.required ? "running" : "idle";
}

function graphEdgeBlocksParent(
  edge: SubagentPatternGraphEdge,
  from: SubagentPatternGraphNode,
  to: SubagentPatternGraphNode,
  status: SubagentPatternGraphStatus,
): boolean {
  if (!edge.required) return false;
  if (!from.blockingParent && !to.blockingParent) return false;
  return status !== "completed" && status !== "idle";
}

function roleOverlayId(patternRole: SubagentPatternRoleId, label: string): string {
  return `${patternRole}.${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "")}`;
}

function node(
  id: string,
  label: string,
  baseRole: SubagentRoleId,
  patternRole: SubagentPatternRoleId,
  kind: SubagentPatternGraphNodeKind,
  overlayLabels: string[],
  required = true,
  maxInstances?: number,
): SubagentPatternRoleNode {
  return {
    id,
    label,
    baseRole,
    patternRole,
    kind,
    required,
    roleOverlayIds: overlayLabels.map((labelItem) => roleOverlayId(patternRole, labelItem)),
    overlayLabels,
    ...(maxInstances ? { maxInstances } : {}),
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  kind: SubagentPatternGraphEdgeKind,
  label: string,
  required = true,
): SubagentPatternRoleEdge {
  return { id, from, to, kind, required, label };
}

function graph(
  patternId: SymphonyWorkflowPatternId,
  label: string,
  nodes: SubagentPatternRoleNode[],
  edges: SubagentPatternRoleEdge[],
): SubagentPatternRoleGraph {
  return {
    schemaVersion: SUBAGENT_PATTERN_ROLE_GRAPH_SCHEMA_VERSION,
    patternId,
    label,
    nodes,
    edges,
  };
}

const DEFAULT_PATTERN_ROLE_GRAPHS: Record<SymphonyWorkflowPatternId, SubagentPatternRoleGraph> = {
  map_reduce: graph("map_reduce", "Map-Reduce", [
    node("mapper", "Mapper", "explorer", "mapper", "child", ["slice assignment", "extraction schema", "citation requirement", "no global synthesis"], true, 25),
    node("reducer", "Reducer", "summarizer", "reducer", "reducer", ["merge rules", "coverage validation", "conflict handling"], true, 1),
    node("validator", "Validator", "reviewer", "validator", "verifier", ["coverage check", "schema validation"], false, 1),
  ], [
    edge("mapper-to-reducer", "mapper", "reducer", "reduces_to", "mapped slices"),
    edge("reducer-to-validator", "reducer", "validator", "verifies", "validate reducer output", false),
  ]),
  adversarial_debate: graph("adversarial_debate", "Adversarial Debate", [
    node("debater-a", "Debater A", "reviewer", "debater", "child", ["assigned stance", "evidence burden", "rebuttal format"], true, 1),
    node("debater-b", "Debater B", "reviewer", "debater", "child", ["opposing stance", "evidence burden", "rebuttal format"], true, 1),
    node("arbiter", "Arbiter", "reviewer", "arbiter", "arbiter", ["rubric scoring", "convergence criteria", "dissent summary"], true, 1),
  ], [
    edge("debate-round", "debater-a", "debater-b", "debates_with", "challenge"),
    edge("debater-a-to-arbiter", "debater-a", "arbiter", "arbitrates", "stance A"),
    edge("debater-b-to-arbiter", "debater-b", "arbiter", "arbitrates", "stance B"),
  ]),
  imitate_and_verify: graph("imitate_and_verify", "Imitate and Verify", [
    node("drafter", "Drafter", "drafter", "drafter", "child", ["draft objective", "bounded output contract"], true, 1),
    node("verifier", "Verifier", "reviewer", "verifier", "verifier", ["independence", "acceptance checks", "pass fail report"], true, 1),
  ], [
    edge("draft-to-verify", "drafter", "verifier", "verifies", "independent check"),
  ]),
  pipeline: graph("pipeline", "Pipeline", [
    node("stage-1", "Stage 1", "explorer", "stage_runner", "stage", ["input schema", "output schema", "handoff artifact"], true, 1),
    node("stage-2", "Stage 2", "worker", "stage_runner", "stage", ["input schema", "output schema", "failure policy"], true, 1),
    node("gatekeeper", "Gatekeeper", "reviewer", "gatekeeper", "verifier", ["stage gate", "retry policy", "rollback rule"], false, 1),
    node("stage-3", "Stage 3", "summarizer", "stage_runner", "stage", ["final contract", "handoff validation"], true, 1),
  ], [
    edge("stage-1-to-stage-2", "stage-1", "stage-2", "stage_handoff", "handoff"),
    edge("stage-2-to-gatekeeper", "stage-2", "gatekeeper", "verifies", "gate", false),
    edge("gatekeeper-to-stage-3", "gatekeeper", "stage-3", "stage_handoff", "approved handoff", false),
    edge("stage-2-to-stage-3", "stage-2", "stage-3", "stage_handoff", "direct handoff"),
  ]),
  ensemble: graph("ensemble", "Ensemble", [
    node("proposal", "Proposal", "explorer", "proposer", "proposal", ["independent draft", "alternative preserved"], true, 8),
    node("scorer", "Scorer", "reviewer", "scorer", "scorer", ["rubric scoring", "comparison table"], true, 1),
    node("synthesizer", "Synthesizer", "summarizer", "synthesizer", "synthesizer", ["selected recommendation", "rationale", "runner up preservation"], true, 1),
  ], [
    edge("proposal-to-scorer", "proposal", "scorer", "scores", "score proposals"),
    edge("scorer-to-synthesizer", "scorer", "synthesizer", "synthesizes", "selected approach"),
  ]),
  self_healing_loop: graph("self_healing_loop", "Self-Healing Loop", [
    node("attempt", "Attempt", "worker", "repair_worker", "repair", ["mutation limit", "checkpoint rule", "max attempts"], true, 1),
    node("verify", "Verify", "reviewer", "verifier", "verifier", ["objective test", "pass fail report"], true, 1),
    node("repair", "Repair", "worker", "repair_worker", "repair", ["rollback rule", "stop conditions", "mutation safety"], true, 1),
    node("checkpoint", "Checkpoint", "summarizer", "checkpoint_recorder", "checkpoint", ["evidence bundle", "resume marker"], false, 1),
  ], [
    edge("attempt-to-verify", "attempt", "verify", "verifies", "measure"),
    edge("verify-to-repair", "verify", "repair", "repairs", "fix failure"),
    edge("repair-to-attempt", "repair", "attempt", "repairs", "retry"),
    edge("verify-to-checkpoint", "verify", "checkpoint", "checkpoints", "record evidence", false),
  ]),
};

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
