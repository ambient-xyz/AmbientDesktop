import type { Edge, Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type {
  WorkflowCheckpointSummary,
  WorkflowDiscoveryQuestion,
  WorkflowArtifactStatus,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowGraphRunState,
  WorkflowGraphSnapshot,
  WorkflowManifest,
  WorkflowModelCallRecord,
  WorkflowRecoveryTargetKind,
  WorkflowRunEvent,
} from "../../shared/types";
import { diffWorkflowGraphs, type WorkflowGraphDiff } from "../../shared/workflowGraphDiff";
import {
  workflowResumeCheckpointEligibility,
  workflowRetryEligibility,
  workflowSkipItemEligibility,
  type WorkflowRetryEligibility,
} from "../../shared/workflowRetryEligibility";

const DEFAULT_NODE_WIDTH = 190;
const DEFAULT_NODE_HEIGHT = 74;
const MAX_EDGE_LABEL_LENGTH = 28;
const EDGE_LABEL_PADDING = 12;
const EDGE_LABEL_GAP = 18;
const EDGE_LABEL_NODE_CLEARANCE = 6;
const EDGE_LABEL_ESTIMATED_HEIGHT = 22;
const EDGE_LABEL_ESTIMATED_CHAR_WIDTH = 6.4;
const EDGE_LABEL_MAX_WIDTH = 168;
const EDGE_LABEL_MIN_BETWEEN_WIDTH = 64;
const SECTION_LABEL_WIDTH = 320;
const SECTION_LABEL_HEIGHT = 40;
const SECTION_LABEL_GAP = 38;
const SECTION_STACK_GAP = 118;
const DISCOVERY_NODE_IDS = new Set(["request", "scope", "data-sources", "llm-role", "review", "side-effects", "error-handling", "output"]);

export type WorkflowAgentDiagramNode = Node<{
  label: string;
  description?: string;
  nodeType: WorkflowGraphNode["type"];
  runState?: WorkflowGraphNode["runState"];
  draftState?: WorkflowGraphDraftState;
  draftLabel?: string;
  pulse?: boolean;
  sourceRangeCount?: number;
  section?: "discovery" | "workflow";
  isSectionLabel?: boolean;
}>;

export type WorkflowAgentDiagramEdge = Edge<{
  label?: string;
  edgeType: WorkflowGraphEdge["type"];
  runState?: WorkflowGraphEdge["runState"];
  draftState?: WorkflowGraphDraftState;
  labelPlacement?: WorkflowEdgeLabelPlacement;
}>;

export type WorkflowGraphDraftState = "provisional" | "changed";

export interface WorkflowGraphDraftOverlay {
  enabled: boolean;
  title: string;
  detail: string;
  badges: string[];
  nodeIds: string[];
  edgeIds: string[];
}

export interface WorkflowGraphDraftOverlayInput {
  snapshot?: WorkflowGraphSnapshot;
  unansweredQuestionCount?: number;
  pendingAccessRequestCount?: number;
  artifactStatus?: WorkflowArtifactStatus;
}

export interface WorkflowGraphChangeFocus {
  questionId?: string;
  nodeIds: string[];
  edgeIds: string[];
  summary?: string;
}

export interface WorkflowGraphToReactFlowOptions {
  selectedNodeId?: string;
  draftOverlay?: WorkflowGraphDraftOverlay;
  changeFocus?: WorkflowGraphChangeFocus;
}

export interface WorkflowEdgeLabelPlacement {
  x: number;
  y: number;
  maxWidth: number;
  callout: boolean;
}

export function workflowGraphToReactFlow(snapshot: WorkflowGraphSnapshot, options: WorkflowGraphToReactFlowOptions = {}): {
  nodes: WorkflowAgentDiagramNode[];
  edges: WorkflowAgentDiagramEdge[];
} {
  const projection = workflowGraphDiagramProjection(snapshot);
  const nodeBounds = new Map(projection.nodes.map((node, index) => [node.id, workflowGraphNodeBounds(node, index)]));
  const draftNodeIds = new Set(options.draftOverlay?.nodeIds ?? []);
  const draftEdgeIds = new Set(options.draftOverlay?.edgeIds ?? []);
  const changedNodeIds = new Set(options.changeFocus?.nodeIds ?? []);
  const changedEdgeIds = new Set(options.changeFocus?.edgeIds ?? []);
  return {
    nodes: projection.nodes.map((node, index) => {
      const changed = changedNodeIds.has(node.id);
      const provisional = draftNodeIds.has(node.id);
      const draftState = changed ? "changed" : provisional ? "provisional" : undefined;
      return {
        id: node.id,
        type: "workflowAgent",
        position: { x: node.x ?? index * 240, y: node.y ?? 0 },
        width: node.width ?? DEFAULT_NODE_WIDTH,
        height: node.height ?? DEFAULT_NODE_HEIGHT,
        selected: node.id === options.selectedNodeId,
        selectable: !node.isSectionLabel,
        draggable: !node.isSectionLabel,
        data: {
          label: node.label,
          description: node.description,
          nodeType: node.type,
          runState: node.runState,
          draftState,
          draftLabel: draftState === "changed" ? "Graph updated" : draftState === "provisional" ? "Draft" : undefined,
          pulse: changed,
          sourceRangeCount: node.sourceRanges?.length,
          section: node.section,
          isSectionLabel: node.isSectionLabel,
        },
      };
    }),
    edges: projection.edges.map((edge) => {
      const changed = changedEdgeIds.has(edge.id);
      const provisional = draftEdgeIds.has(edge.id);
      const draftState = changed ? "changed" : provisional ? "provisional" : undefined;
      return {
        id: edge.id,
        type: "workflowAgent",
        source: edge.source,
        target: edge.target,
        className: draftState ? `workflow-agent-edge-${draftState}` : undefined,
        style: {
          strokeWidth: changed ? 2.2 : 1.6,
          strokeDasharray: provisional && !changed ? "6 5" : undefined,
        },
        data: {
          label: compactWorkflowEdgeLabel(edge.label),
          edgeType: edge.type,
          runState: edge.runState,
          draftState,
          labelPlacement: workflowEdgeLabelPlacement(edge, nodeBounds),
        },
      };
    }),
  };
}

export function workflowGraphDraftOverlayModel(input: WorkflowGraphDraftOverlayInput): WorkflowGraphDraftOverlay | undefined {
  const snapshot = input.snapshot;
  if (!snapshot) return undefined;
  const pendingAccessRequestCount = Math.max(0, input.pendingAccessRequestCount ?? 0);
  const unansweredQuestionCount = Math.max(0, input.unansweredQuestionCount ?? 0);
  const artifactNeedsReview = Boolean(input.artifactStatus && input.artifactStatus !== "approved");
  const sourceIsDiscoveryDraft = snapshot.source === "discovery" && input.artifactStatus !== "approved";
  if (!sourceIsDiscoveryDraft && !artifactNeedsReview && unansweredQuestionCount === 0 && pendingAccessRequestCount === 0) return undefined;

  const projection = workflowGraphDiagramProjection(snapshot);
  const provisionalNodeIds = projection.nodes
    .filter((node) => !node.isSectionLabel)
    .filter((node) => artifactNeedsReview || node.section === "workflow" || (!isMixedDiscoveryGraph(snapshot) && !DISCOVERY_NODE_IDS.has(node.id)))
    .map((node) => node.id);
  const provisionalNodeIdSet = new Set(provisionalNodeIds);
  const provisionalEdgeIds = projection.edges
    .filter((edge) => provisionalNodeIdSet.has(edge.source) && provisionalNodeIdSet.has(edge.target))
    .map((edge) => edge.id);
  const badges = [
    unansweredQuestionCount ? `${unansweredQuestionCount} unanswered` : undefined,
    pendingAccessRequestCount ? `${pendingAccessRequestCount} access pending` : undefined,
    artifactNeedsReview ? `Artifact ${input.artifactStatus}` : undefined,
    snapshot.source === "discovery" ? "Discovery graph" : undefined,
  ].filter(Boolean) as string[];

  return {
    enabled: true,
    title: artifactNeedsReview ? "Workflow graph is awaiting review" : "Workflow graph is still provisional",
    detail:
      pendingAccessRequestCount > 0
        ? "Resolve discovery access requests before treating the proposed workflow path as executable."
        : unansweredQuestionCount > 0
          ? "Answer the remaining discovery questions before compiling a reviewable workflow artifact."
          : artifactNeedsReview
            ? "Review and approve the retained workflow artifact before running or scheduling it."
            : "Discovery has proposed workflow nodes, but no approved artifact has made them executable yet.",
    badges,
    nodeIds: provisionalNodeIds,
    edgeIds: provisionalEdgeIds,
  };
}

export function workflowLatestDiscoveryGraphChange(questions: WorkflowDiscoveryQuestion[]): WorkflowGraphChangeFocus | undefined {
  const withPatches = questions
    .filter((question) => Boolean(question.graphPatch))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const question = withPatches.at(-1);
  const patch = question?.graphPatch;
  if (!question || !patch) return undefined;
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  patch.upsertNodes?.forEach((node) => nodeIds.add(node.id));
  patch.removeNodeIds?.forEach((id) => nodeIds.add(id));
  patch.upsertEdges?.forEach((edge) => {
    edgeIds.add(edge.id);
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  });
  patch.removeEdgeIds?.forEach((id) => edgeIds.add(id));
  return {
    questionId: question.id,
    nodeIds: [...nodeIds],
    edgeIds: [...edgeIds],
    summary: patch.summary,
  };
}

export function workflowDiagramInitialViewportNodeIds(nodes: WorkflowAgentDiagramNode[]): string[] {
  const workflowNodeIds = nodes
    .filter((node) => node.data.section === "workflow" && !node.data.isSectionLabel)
    .map((node) => node.id);
  if (workflowNodeIds.length > 0) return workflowNodeIds;
  return nodes.filter((node) => !node.data.isSectionLabel).map((node) => node.id);
}

interface WorkflowGraphDiagramNode extends WorkflowGraphNode {
  section?: "discovery" | "workflow";
  isSectionLabel?: boolean;
}

function workflowGraphDiagramProjection(snapshot: WorkflowGraphSnapshot): {
  nodes: WorkflowGraphDiagramNode[];
  edges: WorkflowGraphEdge[];
} {
  if (!isMixedDiscoveryGraph(snapshot)) {
    return {
      nodes: snapshot.nodes.map((node) => ({ ...node })),
      edges: snapshot.edges,
    };
  }

  const discoveryNodes = snapshot.nodes
    .filter((node) => DISCOVERY_NODE_IDS.has(node.id))
    .map((node) => ({
      ...node,
      ...(node.id === "output"
        ? {
            label: "Proposed workflow",
            description: "Discovery output handed to the task-specific workflow below.",
          }
        : {}),
      section: "discovery" as const,
    }));
  const workflowNodes = snapshot.nodes
    .filter((node) => !DISCOVERY_NODE_IDS.has(node.id))
    .map((node) => ({
      ...node,
      section: "workflow" as const,
    }));
  const discoveryLayout = normalizeWorkflowSection(discoveryNodes);
  const workflowLayout = normalizeWorkflowSection(workflowNodes);
  const width = Math.max(SECTION_LABEL_WIDTH, discoveryLayout.width, workflowLayout.width);
  const discoveryOffsetX = (width - discoveryLayout.width) / 2;
  const workflowOffsetX = (width - workflowLayout.width) / 2;
  const discoveryNodeY = SECTION_LABEL_HEIGHT + SECTION_LABEL_GAP;
  const workflowLabelY = discoveryNodeY + discoveryLayout.height + SECTION_STACK_GAP;
  const workflowNodeY = workflowLabelY + SECTION_LABEL_HEIGHT + SECTION_LABEL_GAP;
  const discoveryNodeIds = new Set(discoveryNodes.map((node) => node.id));
  const workflowNodeIds = new Set(workflowNodes.map((node) => node.id));

  return {
    nodes: [
      sectionLabelNode({
        id: "__workflow-section-discovery",
        label: "General Discovery Flow",
        description: "Reusable scoping, policy, review, and recovery checks.",
        x: (width - SECTION_LABEL_WIDTH) / 2,
        y: 0,
      }),
      ...discoveryLayout.nodes.map((node) => ({
        ...node,
        x: node.x! + discoveryOffsetX,
        y: node.y! + discoveryNodeY,
      })),
      sectionLabelNode({
        id: "__workflow-section-task",
        label: "Proposed User Workflow",
        description: "Concrete task steps for this request.",
        x: (width - SECTION_LABEL_WIDTH) / 2,
        y: workflowLabelY,
      }),
      ...workflowLayout.nodes.map((node) => ({
        ...node,
        x: node.x! + workflowOffsetX,
        y: node.y! + workflowNodeY,
      })),
    ],
    edges: snapshot.edges.filter((edge) => {
      const discoveryEdge = discoveryNodeIds.has(edge.source) && discoveryNodeIds.has(edge.target);
      const workflowEdge = workflowNodeIds.has(edge.source) && workflowNodeIds.has(edge.target);
      return discoveryEdge || workflowEdge;
    }),
  };
}

function isMixedDiscoveryGraph(snapshot: WorkflowGraphSnapshot): boolean {
  if (snapshot.source !== "discovery") return false;
  const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
  const hasDiscoveryShape = nodeIds.has("request") && nodeIds.has("scope");
  const hasTaskSpecificNodes = snapshot.nodes.some((node) => !DISCOVERY_NODE_IDS.has(node.id));
  return hasDiscoveryShape && hasTaskSpecificNodes;
}

function normalizeWorkflowSection(nodes: WorkflowGraphDiagramNode[]): { nodes: WorkflowGraphDiagramNode[]; width: number; height: number } {
  if (nodes.length === 0) return { nodes: [], width: SECTION_LABEL_WIDTH, height: DEFAULT_NODE_HEIGHT };
  const bounds = nodes.map((node, index) => workflowGraphNodeBounds(node, index));
  const minX = Math.min(...bounds.map((bound) => bound.x));
  const minY = Math.min(...bounds.map((bound) => bound.y));
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height));
  return {
    nodes: nodes.map((node, index) => ({
      ...node,
      x: bounds[index].x - minX,
      y: bounds[index].y - minY,
      width: bounds[index].width,
      height: bounds[index].height,
    })),
    width: maxX - minX,
    height: maxY - minY,
  };
}

function sectionLabelNode(input: { id: string; label: string; description: string; x: number; y: number }): WorkflowGraphDiagramNode {
  return {
    id: input.id,
    type: "deterministic_step",
    label: input.label,
    description: input.description,
    x: input.x,
    y: input.y,
    width: SECTION_LABEL_WIDTH,
    height: SECTION_LABEL_HEIGHT,
    section: input.id === "__workflow-section-task" ? "workflow" : "discovery",
    isSectionLabel: true,
  };
}

function workflowGraphNodeBounds(node: WorkflowGraphNode, index: number): { x: number; y: number; width: number; height: number } {
  return {
    x: node.x ?? index * 240,
    y: node.y ?? 0,
    width: node.width ?? DEFAULT_NODE_WIDTH,
    height: node.height ?? DEFAULT_NODE_HEIGHT,
  };
}

export function workflowEdgeLabelPlacement(
  edge: Pick<WorkflowGraphEdge, "source" | "target" | "label">,
  nodes: Map<string, Pick<WorkflowGraphNode, "x" | "y" | "width" | "height">>,
): WorkflowEdgeLabelPlacement | undefined {
  return workflowEdgeLabelPlacementFromBounds(
    edge,
    new Map(
      Array.from(nodes.entries()).map(([id, node]) => [
        id,
        {
          x: node.x ?? 0,
          y: node.y ?? 0,
          width: node.width ?? DEFAULT_NODE_WIDTH,
          height: node.height ?? DEFAULT_NODE_HEIGHT,
        },
      ]),
    ),
  );
}

function workflowEdgeLabelPlacementFromBounds(
  edge: Pick<WorkflowGraphEdge, "source" | "target" | "label">,
  nodes: Map<string, { x: number; y: number; width: number; height: number }>,
): WorkflowEdgeLabelPlacement | undefined {
  const label = compactWorkflowEdgeLabel(edge.label);
  if (!label) return undefined;
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) return undefined;

  const sourceCenterX = source.x + source.width / 2;
  const targetCenterX = target.x + target.width / 2;
  const minCenterX = Math.min(sourceCenterX, targetCenterX);
  const maxCenterX = Math.max(sourceCenterX, targetCenterX);
  const centerSpan = maxCenterX - minCenterX;
  const estimatedWidth = Math.min(EDGE_LABEL_MAX_WIDTH, Math.max(EDGE_LABEL_MIN_BETWEEN_WIDTH, Math.ceil(label.length * EDGE_LABEL_ESTIMATED_CHAR_WIDTH) + 18));
  const betweenWidth = Math.max(0, centerSpan - EDGE_LABEL_PADDING * 2);
  const fitsBetweenCenters = betweenWidth >= estimatedWidth;
  const maxWidth = fitsBetweenCenters ? Math.min(EDGE_LABEL_MAX_WIDTH, Math.max(EDGE_LABEL_MIN_BETWEEN_WIDTH, betweenWidth)) : EDGE_LABEL_MAX_WIDTH;
  const sourceBottom = source.y + source.height;
  const targetBottom = target.y + target.height;
  const x = (sourceCenterX + targetCenterX) / 2;
  const placement = workflowEdgeLabelNonOverlappingY({
    x,
    initialY: Math.max(sourceBottom, targetBottom) + EDGE_LABEL_GAP,
    maxWidth,
    nodes,
  });

  return {
    x,
    y: placement.y,
    maxWidth,
    callout: !fitsBetweenCenters || placement.shifted,
  };
}

function workflowEdgeLabelNonOverlappingY(input: {
  x: number;
  initialY: number;
  maxWidth: number;
  nodes: Map<string, { x: number; y: number; width: number; height: number }>;
}): { y: number; shifted: boolean } {
  let y = input.initialY;
  let shifted = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const collision = [...input.nodes.values()]
      .filter((node) => workflowEdgeLabelIntersectsNode({ x: input.x, y, maxWidth: input.maxWidth }, node))
      .sort((left, right) => left.y + left.height - (right.y + right.height))[0];
    if (!collision) return { y, shifted };
    y = collision.y + collision.height + EDGE_LABEL_GAP;
    shifted = true;
  }
  return { y, shifted };
}

function workflowEdgeLabelIntersectsNode(
  label: { x: number; y: number; maxWidth: number },
  node: { x: number; y: number; width: number; height: number },
): boolean {
  const labelLeft = label.x - label.maxWidth / 2 - EDGE_LABEL_NODE_CLEARANCE;
  const labelRight = label.x + label.maxWidth / 2 + EDGE_LABEL_NODE_CLEARANCE;
  const labelTop = label.y - EDGE_LABEL_ESTIMATED_HEIGHT / 2 - EDGE_LABEL_NODE_CLEARANCE;
  const labelBottom = label.y + EDGE_LABEL_ESTIMATED_HEIGHT / 2 + EDGE_LABEL_NODE_CLEARANCE;
  const nodeLeft = node.x;
  const nodeRight = node.x + node.width;
  const nodeTop = node.y;
  const nodeBottom = node.y + node.height;
  return labelLeft < nodeRight && labelRight > nodeLeft && labelTop < nodeBottom && labelBottom > nodeTop;
}

function compactWorkflowEdgeLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const normalized = label.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_EDGE_LABEL_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_EDGE_LABEL_LENGTH - 1).trimEnd()}...`;
}

export async function layoutWorkflowGraph(snapshot: WorkflowGraphSnapshot): Promise<WorkflowGraphSnapshot> {
  const elk = new ELK();
  const graph = await elk.layout({
    id: snapshot.id,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "72",
    },
    children: snapshot.nodes.map((node) => ({
      id: node.id,
      width: node.width ?? DEFAULT_NODE_WIDTH,
      height: node.height ?? DEFAULT_NODE_HEIGHT,
    })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });
  const positions = new Map((graph.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      ...(positions.get(node.id) ?? {}),
    })),
  };
}

export function workflowGraphZoomLabel(value: number): string {
  const clamped = Math.max(10, Math.min(400, Math.round(value)));
  return `${clamped}%`;
}

export interface WorkflowGraphEventCard {
  id: string;
  runId: string;
  artifactId: string;
  graphNodeId?: string;
  graphEdgeId?: string;
  itemKey?: string;
  targetKind?: WorkflowRecoveryTargetKind;
  nodeLabel?: string;
  itemLabel?: string;
  timingLabel?: string;
  label: string;
  detail: string;
  state: WorkflowGraphRunState;
  summaries: WorkflowGraphTraceSummary[];
  recoveryContext?: string;
  retry?: WorkflowRetryEligibility;
  resume?: WorkflowRetryEligibility;
  skipItem?: WorkflowRetryEligibility;
}

export interface WorkflowGraphTraceSummary {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}

export interface WorkflowGraphEventCardTraceInput {
  modelCalls?: WorkflowModelCallRecord[];
  checkpoints?: WorkflowCheckpointSummary[];
  limit?: number;
}

export interface WorkflowGraphDiffCard {
  id: string;
  kind: "added" | "removed" | "changed";
  scope: "node" | "edge" | "manifest";
  label: string;
  detail: string;
}

export function workflowGraphWithRunEvents(snapshot: WorkflowGraphSnapshot, events: WorkflowRunEvent[] = []): WorkflowGraphSnapshot {
  if (events.length === 0) return snapshot;
  const nodeStates = new Map<string, WorkflowGraphRunState>();
  const nodesByType = new Map<WorkflowGraphNode["type"], WorkflowGraphNode[]>();
  for (const node of snapshot.nodes) nodesByType.set(node.type, [...(nodesByType.get(node.type) ?? []), node]);

  for (const event of events) {
    const explicitNodeId = event.graphNodeId ?? (typeof event.data?.graphNodeId === "string" ? event.data.graphNodeId : undefined);
    const nodeId = explicitNodeId ?? inferredGraphNodeId(event, nodesByType);
    if (!nodeId) continue;
    nodeStates.set(nodeId, runStateForEvent(event));
  }

  const terminal = [...events].reverse().find((event) => event.type === "workflow.succeeded" || event.type === "workflow.failed" || event.type === "workflow.canceled");
  if (terminal?.type === "workflow.succeeded") {
    for (const node of snapshot.nodes) {
      if (nodeStates.get(node.id) !== "failed" && nodeStates.get(node.id) !== "paused") nodeStates.set(node.id, "completed");
    }
  }
  if (terminal?.type === "workflow.failed") {
    const output = snapshot.nodes.find((node) => node.type === "output");
    if (output) nodeStates.set(output.id, "failed");
  }

  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      runState: nodeStates.get(node.id) ?? node.runState,
    })),
    edges: snapshot.edges.map((edge) => ({
      ...edge,
      runState:
        nodeStates.get(edge.target) === "completed"
          ? "completed"
          : nodeStates.get(edge.source) === "active"
            ? "active"
            : edge.runState,
    })),
  };
}

export function workflowLatestRuntimeGraphNodeId(events: WorkflowRunEvent[] = [], snapshot?: WorkflowGraphSnapshot): string | undefined {
  if (!snapshot || events.length === 0) return undefined;
  const graphNodeIds = new Set(snapshot.nodes.map((node) => node.id));
  for (const event of [...events].reverse()) {
    const nodeId = event.graphNodeId ?? (typeof event.data?.graphNodeId === "string" ? event.data.graphNodeId : undefined);
    if (nodeId && graphNodeIds.has(nodeId)) return nodeId;
  }

  const nodesByType = new Map<WorkflowGraphNode["type"], WorkflowGraphNode[]>();
  for (const node of snapshot.nodes) nodesByType.set(node.type, [...(nodesByType.get(node.type) ?? []), node]);
  for (const event of [...events].reverse()) {
    const nodeId = inferredGraphNodeId(event, nodesByType);
    if (nodeId && graphNodeIds.has(nodeId)) return nodeId;
  }
  return undefined;
}

export function workflowGraphEventCards(events: WorkflowRunEvent[] = [], snapshot?: WorkflowGraphSnapshot, trace: WorkflowGraphEventCardTraceInput = {}): WorkflowGraphEventCard[] {
  const nodes = new Map(snapshot?.nodes.map((node) => [node.id, node]) ?? []);
  return selectWorkflowGraphCardEvents(events, trace.limit ?? 5).map((event) => {
    const graphNodeId = event.graphNodeId ?? (typeof event.data?.graphNodeId === "string" ? event.data.graphNodeId : undefined);
    const graphEdgeId = event.graphEdgeId ?? (typeof event.data?.graphEdgeId === "string" ? event.data.graphEdgeId : undefined);
    const itemKey = event.itemKey ?? (typeof event.data?.itemKey === "string" ? event.data.itemKey : undefined);
    const targetKind = workflowRecoveryTargetKind(event);
    const retry = retryEligibilityForEvent(event, nodes);
    const matchedCalls = matchingModelCalls(event, trace.modelCalls ?? []).slice(0, 2);
    const checkpoint = relatedCheckpoint(event, trace.checkpoints ?? []);
    const resume = resumeCheckpointEligibilityForEvent(event, nodes, trace.checkpoints ?? []);
    const skipItem = skipItemEligibilityForEvent(event, nodes);
    const summaries = traceSummariesForEvent(event, matchedCalls, checkpoint);
    return {
      id: event.id,
      runId: event.runId,
      artifactId: event.artifactId,
      graphNodeId,
      graphEdgeId,
      itemKey,
      targetKind,
      nodeLabel: graphNodeId ? (nodes.get(graphNodeId)?.label ?? graphNodeId) : undefined,
      itemLabel: workflowRecoveryTargetLabel(targetKind, itemKey),
      timingLabel: matchedCalls[0] ? formatDuration(matchedCalls[0].latencyMs) : undefined,
      label: event.type,
      detail: workflowScheduleTraceDetail(event) ?? event.message ?? summarizeEventData(event.data) ?? `Event ${event.seq}`,
      state: runStateForEvent(event),
      summaries,
      recoveryContext: recoveryContextLabel(event, retry, resume, skipItem, matchedCalls, checkpoint),
      retry,
      resume,
      skipItem,
    };
  });
}

export function selectWorkflowGraphCardEvents(events: WorkflowRunEvent[] = [], limit = 5): WorkflowRunEvent[] {
  if (events.length <= limit) return events;
  const selected = events.slice(-limit);
  const selectedIds = new Set(selected.map((event) => event.id));
  const latestActionableFailure = [...events].reverse().find((event) => isFailureEvent(event) && actionableFailureEvent(event));
  const latestFailure = latestActionableFailure ?? [...events].reverse().find(isFailureEvent);
  if (!latestFailure || selectedIds.has(latestFailure.id)) return selected;

  const replaceIndex = selected.findIndex((event) => !isFailureEvent(event));
  const next = [...selected];
  next[replaceIndex >= 0 ? replaceIndex : 0] = latestFailure;
  return next.sort((left, right) => left.seq - right.seq);
}

function isFailureEvent(event: WorkflowRunEvent): boolean {
  return event.type === "workflow.failed" || event.type.endsWith(".failed") || event.type.endsWith(".error") || event.type.endsWith(".invalid");
}

function actionableFailureEvent(event: WorkflowRunEvent): boolean {
  return Boolean(
    event.graphNodeId ||
      event.graphEdgeId ||
      event.itemKey ||
      event.data?.graphNodeId ||
      event.data?.graphEdgeId ||
      event.data?.itemKey,
  );
}

function workflowRecoveryTargetKind(event: WorkflowRunEvent): WorkflowRecoveryTargetKind | undefined {
  const value = typeof event.data?.targetKind === "string" ? event.data.targetKind : undefined;
  if (value === "step" || value === "page" || value === "item" || value === "chunk") return value;
  if (event.type === "collection.page.error") return "page";
  if (event.itemKey || typeof event.data?.itemKey === "string") return "item";
  return undefined;
}

function workflowRecoveryTargetLabel(targetKind: WorkflowRecoveryTargetKind | undefined, itemKey: string | undefined): string | undefined {
  if (!itemKey) return undefined;
  if (targetKind === "page") return `Page ${itemKey.replace(/^page-/, "")}`;
  if (targetKind === "chunk") return `Chunk ${itemKey}`;
  return `Item ${itemKey}`;
}

export function workflowGraphRevisionDiffCards(input: {
  current: WorkflowGraphSnapshot;
  proposed: WorkflowGraphSnapshot;
  currentManifest?: WorkflowManifest;
  proposedManifest?: WorkflowManifest;
  limit?: number;
}): WorkflowGraphDiffCard[] {
  const diff = diffWorkflowGraphs(input);
  return workflowGraphDiffToCards(diff).slice(0, input.limit ?? 8);
}

export function workflowGraphDiffToCards(diff: WorkflowGraphDiff): WorkflowGraphDiffCard[] {
  return [
    ...diff.addedNodes.map((item) => ({
      id: `node-added:${item.id}`,
      kind: "added" as const,
      scope: "node" as const,
      label: item.after?.label ?? item.id,
      detail: `${formatNodeType(item.after?.type)} added`,
    })),
    ...diff.removedNodes.map((item) => ({
      id: `node-removed:${item.id}`,
      kind: "removed" as const,
      scope: "node" as const,
      label: item.before?.label ?? item.id,
      detail: `${formatNodeType(item.before?.type)} removed`,
    })),
    ...diff.changedNodes.map((item) => ({
      id: `node-changed:${item.id}`,
      kind: "changed" as const,
      scope: "node" as const,
      label: item.after?.label ?? item.before?.label ?? item.id,
      detail: changedFieldsLabel(item.fieldChanges.map((change) => change.field)),
    })),
    ...diff.addedEdges.map((item) => ({
      id: `edge-added:${item.id}`,
      kind: "added" as const,
      scope: "edge" as const,
      label: item.after?.label ?? item.id,
      detail: `${item.after?.source ?? "?"} to ${item.after?.target ?? "?"}`,
    })),
    ...diff.removedEdges.map((item) => ({
      id: `edge-removed:${item.id}`,
      kind: "removed" as const,
      scope: "edge" as const,
      label: item.before?.label ?? item.id,
      detail: `${item.before?.source ?? "?"} to ${item.before?.target ?? "?"}`,
    })),
    ...diff.changedEdges.map((item) => ({
      id: `edge-changed:${item.id}`,
      kind: "changed" as const,
      scope: "edge" as const,
      label: item.after?.label ?? item.before?.label ?? item.id,
      detail: changedFieldsLabel(item.fieldChanges.map((change) => change.field)),
    })),
    ...diff.manifest.fieldChanges.map((change) => ({
      id: `manifest-changed:${change.field}`,
      kind: "changed" as const,
      scope: "manifest" as const,
      label: formatTaskState(change.field),
      detail: "Manifest policy or limit changed",
    })),
    ...diff.manifest.addedConnectors.map((grant) => ({
      id: `connector-added:${grant.id}`,
      kind: "added" as const,
      scope: "manifest" as const,
      label: grant.id,
      detail: "Connector grant added",
    })),
    ...diff.manifest.removedConnectors.map((grant) => ({
      id: `connector-removed:${grant.id}`,
      kind: "removed" as const,
      scope: "manifest" as const,
      label: grant.id,
      detail: "Connector grant removed",
    })),
    ...diff.manifest.changedConnectors.map((grant) => ({
      id: `connector-changed:${grant.id}`,
      kind: "changed" as const,
      scope: "manifest" as const,
      label: grant.id,
      detail: "Connector grant changed",
    })),
    ...diff.manifest.addedPluginCapabilities.map((grant) => ({
      id: `plugin-added:${grant.id}`,
      kind: "added" as const,
      scope: "manifest" as const,
      label: grant.id,
      detail: "Plugin capability added",
    })),
    ...diff.manifest.removedPluginCapabilities.map((grant) => ({
      id: `plugin-removed:${grant.id}`,
      kind: "removed" as const,
      scope: "manifest" as const,
      label: grant.id,
      detail: "Plugin capability removed",
    })),
    ...diff.manifest.changedPluginCapabilities.map((grant) => ({
      id: `plugin-changed:${grant.id}`,
      kind: "changed" as const,
      scope: "manifest" as const,
      label: grant.id,
      detail: "Plugin capability changed",
    })),
  ];
}

function retryEligibilityForEvent(event: WorkflowRunEvent, nodes: Map<string, WorkflowGraphNode>): WorkflowRetryEligibility | undefined {
  if (runStateForEvent(event) !== "failed") return undefined;
  const nodeId = event.graphNodeId ?? (typeof event.data?.graphNodeId === "string" ? event.data.graphNodeId : undefined);
  return workflowRetryEligibility({ event, node: nodeId ? nodes.get(nodeId) : undefined });
}

function skipItemEligibilityForEvent(event: WorkflowRunEvent, nodes: Map<string, WorkflowGraphNode>): WorkflowRetryEligibility | undefined {
  if (runStateForEvent(event) !== "failed") return undefined;
  const nodeId = event.graphNodeId ?? (typeof event.data?.graphNodeId === "string" ? event.data.graphNodeId : undefined);
  return workflowSkipItemEligibility({ event, node: nodeId ? nodes.get(nodeId) : undefined });
}

function resumeCheckpointEligibilityForEvent(
  event: WorkflowRunEvent,
  nodes: Map<string, WorkflowGraphNode>,
  checkpoints: WorkflowCheckpointSummary[],
): WorkflowRetryEligibility | undefined {
  if (runStateForEvent(event) !== "failed") return undefined;
  const nodeId = event.graphNodeId ?? (typeof event.data?.graphNodeId === "string" ? event.data.graphNodeId : undefined);
  return workflowResumeCheckpointEligibility({
    event,
    node: nodeId ? nodes.get(nodeId) : undefined,
    hasCheckpoint: checkpoints.some((checkpoint) => !checkpoint.runId || checkpoint.runId === event.runId),
  });
}

function matchingModelCalls(event: WorkflowRunEvent, modelCalls: WorkflowModelCallRecord[]): WorkflowModelCallRecord[] {
  return modelCalls
    .map((call) => ({ call, score: modelCallMatchScore(event, call) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || Date.parse(right.call.completedAt) - Date.parse(left.call.completedAt))
    .map((match) => match.call);
}

function modelCallMatchScore(event: WorkflowRunEvent, call: WorkflowModelCallRecord): number {
  if (call.runId && call.runId !== event.runId) return 0;
  let score = call.runId === event.runId ? 1 : 0;
  const graphNodeId = event.graphNodeId ?? (typeof event.data?.graphNodeId === "string" ? event.data.graphNodeId : undefined);
  const graphEdgeId = event.graphEdgeId ?? (typeof event.data?.graphEdgeId === "string" ? event.data.graphEdgeId : undefined);
  const itemKey = event.itemKey ?? (typeof event.data?.itemKey === "string" ? event.data.itemKey : undefined);
  if (graphNodeId && call.graphNodeId === graphNodeId) score += 6;
  if (graphEdgeId && call.graphEdgeId === graphEdgeId) score += 4;
  if (itemKey && call.itemKey === itemKey) score += 5;
  if (event.message && call.task === event.message) score += 3;
  if (event.type.startsWith("ambient.call") && event.message && call.task === event.message) score += 4;
  if ((graphNodeId || graphEdgeId || itemKey || event.type.startsWith("ambient.call")) && score > 1) return score;
  return 0;
}

function relatedCheckpoint(event: WorkflowRunEvent, checkpoints: WorkflowCheckpointSummary[]): WorkflowCheckpointSummary | undefined {
  const key = event.type === "checkpoint.write" || event.type === "checkpoint.resume" ? event.message : undefined;
  if (key) return checkpoints.find((checkpoint) => checkpoint.key === key);
  return checkpoints.find((checkpoint) => checkpoint.runId === event.runId) ?? checkpoints[0];
}

function traceSummariesForEvent(
  event: WorkflowRunEvent,
  modelCalls: WorkflowModelCallRecord[],
  checkpoint: WorkflowCheckpointSummary | undefined,
): WorkflowGraphTraceSummary[] {
  const summaries: WorkflowGraphTraceSummary[] = [];
  if (event.type === "ambient.call.progress") {
    summaries.push(...ambientProgressSummaries(event.data));
  } else if (event.type === "workflow.schedule.started" || event.type === "workflow.schedule.skipped") {
    summaries.push(...workflowScheduleTraceSummaries(event.data));
  } else {
    const payload = summarizeEventPayload(event.data);
    if (payload) summaries.push({ label: "Event", value: payload });
  }
  if (checkpoint && (event.type === "checkpoint.resume" || event.type === "checkpoint.write")) {
    summaries.push({
      label: event.type === "checkpoint.resume" ? "Checkpoint resumed" : "Checkpoint saved",
      value: checkpoint.valuePreview,
      tone: event.type === "checkpoint.resume" ? "warning" : "success",
    });
  }
  for (const call of modelCalls) {
    summaries.push({ label: "Model", value: `${call.model ?? "Ambient"} · ${formatTaskState(call.status)}`, tone: toneForModelCall(call) });
    summaries.push({ label: "Input", value: previewJson(call.input) });
    if (call.output !== undefined) summaries.push({ label: "Output", value: previewJson(call.output), tone: "success" });
    if (call.validationError) summaries.push({ label: "Validation", value: call.validationError, tone: "danger" });
    summaries.push({ label: "Timing", value: formatDuration(call.latencyMs) });
    if (call.cacheKey) summaries.push({ label: "Cache key", value: call.cacheKey });
    if (call.cacheCheckpoint) {
      summaries.push({
        label: "Cache checkpoint",
        value: cacheCheckpointLabel(call.cacheCheckpoint),
      });
    }
  }
  return summaries.slice(0, 8);
}

function workflowScheduleTraceDetail(event: WorkflowRunEvent): string | undefined {
  if (event.type !== "workflow.schedule.started" && event.type !== "workflow.schedule.skipped") return undefined;
  const scheduleId = stringValue(event.data?.scheduleId) ?? event.message;
  const versionId = stringValue(event.data?.targetVersionId) ?? stringValue(event.data?.versionId);
  const grantDecisionSource = stringValue(event.data?.grantDecisionSource);
  const action = event.type === "workflow.schedule.started" ? "started" : "skipped";
  return [
    scheduleId ? `Schedule ${scheduleId}` : "Scheduled workflow",
    action,
    versionId ? `version ${versionId}` : undefined,
    grantDecisionSource ? `via ${formatGrantDecisionSource(grantDecisionSource)}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function workflowScheduleTraceSummaries(data: Record<string, unknown> | undefined): WorkflowGraphTraceSummary[] {
  const summaries: WorkflowGraphTraceSummary[] = [];
  const scheduleId = stringValue(data?.scheduleId);
  const targetKind = stringValue(data?.targetKind);
  const targetId = stringValue(data?.targetId);
  const targetVersionId = stringValue(data?.targetVersionId) ?? stringValue(data?.versionId);
  const createdTargetVersionId = stringValue(data?.createdTargetVersionId);
  const grantDecisionSource = stringValue(data?.grantDecisionSource);
  const grantTargets = stringArrayValue(data?.grantTargets);
  const connectorTargets = stringArrayValue(data?.connectorTargets);

  if (scheduleId) summaries.push({ label: "Schedule", value: scheduleId });
  if (targetKind) summaries.push({ label: "Target", value: `${formatTaskState(targetKind)}${targetId ? ` · ${targetId}` : ""}` });
  if (targetVersionId) summaries.push({ label: "Target version", value: targetVersionId, tone: "success" });
  if (createdTargetVersionId && createdTargetVersionId !== targetVersionId) summaries.push({ label: "Created at version", value: createdTargetVersionId, tone: "warning" });
  if (grantDecisionSource) summaries.push({ label: "Grant decision", value: formatGrantDecisionSource(grantDecisionSource), tone: grantDecisionSource === "none" ? "neutral" : "success" });
  if (grantTargets.length > 0) summaries.push({ label: "Grant targets", value: compactList(grantTargets) });
  if (grantTargets.length === 0 && connectorTargets.length > 0) summaries.push({ label: "Connector targets", value: compactList(connectorTargets) });
  return summaries;
}

function recoveryContextLabel(
  event: WorkflowRunEvent,
  retry: WorkflowRetryEligibility | undefined,
  resume: WorkflowRetryEligibility | undefined,
  skipItem: WorkflowRetryEligibility | undefined,
  modelCalls: WorkflowModelCallRecord[],
  checkpoint: WorkflowCheckpointSummary | undefined,
): string | undefined {
  const action = typeof event.data?.action === "string" ? event.data.action : undefined;
  const sourceEventId = typeof event.data?.sourceEventId === "string" ? event.data.sourceEventId : undefined;
  const itemKey = event.itemKey ?? (typeof event.data?.itemKey === "string" ? event.data.itemKey : undefined);
  const targetKind = workflowRecoveryTargetKind(event);
  if (event.type.startsWith("workflow.recovery") && action) {
    return sourceEventId ? `${formatTaskState(action)} from retained event ${sourceEventId.slice(0, 8)}` : formatTaskState(action);
  }
  if (retry?.eligible && modelCalls.length > 0) {
    const targetLabel = workflowRecoveryTargetLabel(targetKind, itemKey)?.toLowerCase();
    return `Retry uses retained ${modelCalls[0].task} input${targetLabel ? ` for ${targetLabel}` : ""}.`;
  }
  if (skipItem?.eligible && itemKey) {
    if (targetKind === "page") return `Continue can omit failed page ${itemKey.replace(/^page-/, "")} and keep retained partial results.`;
    if (targetKind === "chunk") return `Skip targets retained chunk ${itemKey}.`;
    return `Skip targets retained item ${itemKey}.`;
  }
  if (resume?.eligible && checkpoint) return `Resume can reuse checkpoint ${checkpoint.key}.`;
  if (retry && !retry.eligible) return retry.reasons[0];
  return undefined;
}

function inferredGraphNodeId(event: WorkflowRunEvent, nodesByType: Map<WorkflowGraphNode["type"], WorkflowGraphNode[]>): string | undefined {
  if (event.type.startsWith("exploration.")) return nodesByType.get("agent_exploration")?.[0]?.id;
  if (event.type.startsWith("connector.")) return nodesByType.get("connector_call")?.[0]?.id ?? nodesByType.get("data_source")?.[0]?.id;
  if (event.type.startsWith("approval.")) return nodesByType.get("review_gate")?.[0]?.id;
  if (event.type.startsWith("step.")) return nodesByType.get("deterministic_step")?.[0]?.id;
  if (event.type.startsWith("workflow.")) return nodesByType.get(event.type === "workflow.succeeded" || event.type === "workflow.failed" ? "output" : "request")?.[0]?.id;
  return undefined;
}

function runStateForEvent(event: WorkflowRunEvent): WorkflowGraphRunState {
  if (event.type === "workflow.recovery.start") return "retrying";
  if (event.type === "workflow.recovery.skipped_item") return "skipped";
  if (event.type.endsWith(".progress")) return "active";
  if (event.type.endsWith(".start") || event.type === "workflow.start") return "active";
  if (event.type.endsWith(".end") || event.type === "workflow.succeeded" || event.type === "checkpoint.write") return "completed";
  if (event.type === "approval.required" || event.type === "workflow.paused") return "paused";
  if (event.type === "workflow.failed" || event.type.endsWith(".failed") || event.type.endsWith(".error") || event.type.endsWith(".invalid")) return "failed";
  if (event.type === "workflow.canceled") return "skipped";
  if (event.type === "checkpoint.resume") return "retrying";
  return "completed";
}

function ambientProgressSummaries(data: Record<string, unknown> | undefined): WorkflowGraphTraceSummary[] {
  const stage = stringValue(data?.providerStage);
  const outputChars = numberValue(data?.outputChars);
  const thinkingChars = numberValue(data?.thinkingChars);
  const elapsedMs = numberValue(data?.providerElapsedMs);
  const idleElapsedMs = numberValue(data?.idleElapsedMs);
  const idleTimeoutMs = numberValue(data?.idleTimeoutMs);
  const absoluteTimeoutMs = numberValue(data?.absoluteTimeoutMs);
  const timeoutMode = stringValue(data?.timeoutMode);
  const summaries: WorkflowGraphTraceSummary[] = [{ label: "Stream", value: stage ? formatTaskState(stage) : "Waiting", tone: "neutral" }];
  if (outputChars !== undefined) summaries.push({ label: "Output", value: `${Math.max(0, Math.round(outputChars)).toLocaleString()} chars` });
  if (thinkingChars !== undefined) summaries.push({ label: "Thinking", value: `${Math.max(0, Math.round(thinkingChars)).toLocaleString()} chars` });
  if (idleElapsedMs !== undefined && idleTimeoutMs !== undefined) {
    summaries.push({
      label: "Idle watchdog",
      value: `${formatDuration(idleElapsedMs)} since stream update / ${formatDuration(idleTimeoutMs)} timeout`,
      tone: idleElapsedMs > idleTimeoutMs * 0.75 ? "warning" : "neutral",
    });
  }
  if (elapsedMs !== undefined) summaries.push({ label: "Elapsed", value: formatDuration(elapsedMs) });
  if (absoluteTimeoutMs !== undefined) summaries.push({ label: "Hard limit", value: formatDuration(absoluteTimeoutMs) });
  if (timeoutMode) summaries.push({ label: "Timeout mode", value: formatTimeoutMode(timeoutMode) });
  return summaries;
}

function summarizeEventData(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const text = JSON.stringify(redactValue(data));
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function formatTimeoutMode(value: string): string {
  if (value === "idle_watchdog") return "Idle watchdog";
  if (value === "elapsed_hard_limit") return "Elapsed hard limit";
  return formatTaskState(value);
}

function summarizeEventPayload(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const filtered = Object.fromEntries(
    Object.entries(data).filter(([key]) => !["graphNodeId", "graphEdgeId", "itemKey", "cacheCheckpoint"].includes(key)),
  );
  if (Object.keys(filtered).length === 0) return undefined;
  return previewJson(filtered);
}

function cacheCheckpointLabel(checkpoint: NonNullable<WorkflowModelCallRecord["cacheCheckpoint"]>): string {
  const tokenLabel =
    checkpoint.requestEstimatedTokens > 0
      ? `${checkpoint.stablePrefixEstimatedTokens}/${checkpoint.requestEstimatedTokens} estimated tokens stable`
      : `${checkpoint.stablePrefixChars}/${checkpoint.stablePrefixChars + checkpoint.mutableSuffixChars} chars stable`;
  return `${checkpoint.boundaryLabel}: ${tokenLabel}`;
}

function toneForModelCall(call: WorkflowModelCallRecord): WorkflowGraphTraceSummary["tone"] {
  if (call.status === "succeeded") return "success";
  if (call.status === "failed" || call.status === "invalid") return "danger";
  return "neutral";
}

function previewJson(value: unknown): string {
  const redacted = redactValue(value);
  const text = typeof redacted === "string" ? redacted : JSON.stringify(redacted);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compactList(values: string[], limit = 3): string {
  const visible = values.slice(0, limit);
  const suffix = values.length > visible.length ? ` +${values.length - visible.length} more` : "";
  return `${visible.join(", ")}${suffix}`;
}

function formatGrantDecisionSource(value: string): string {
  if (value === "persistent_grant") return "Persistent Grant";
  if (value === "full_access_bypass") return "Full Access bypass";
  if (value === "none") return "None required";
  return formatTaskState(value);
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, isSensitiveKey(key) ? "[redacted]" : redactValue(entry)]),
  );
}

function isSensitiveKey(key: string): boolean {
  return /api[-_]?key|authorization|credential|password|secret|token|cookie/i.test(key);
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
  return `${Math.round(ms / 60000)} min`;
}

function changedFieldsLabel(fields: string[]): string {
  if (fields.length === 0) return "Changed";
  if (fields.length === 1) return `Changed ${formatTaskState(fields[0])}`;
  return `Changed ${fields.map(formatTaskState).join(", ")}`;
}

function formatNodeType(type: WorkflowGraphNode["type"] | undefined): string {
  return type ? formatTaskState(type) : "Graph node";
}

function formatTaskState(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
