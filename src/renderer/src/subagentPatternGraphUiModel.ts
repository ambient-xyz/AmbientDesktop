import type {
  SubagentPatternGraphEdge,
  SubagentPatternGraphNode,
  SubagentPatternGraphOverflowChild,
  SubagentPatternGraphSnapshot,
  SubagentPatternGraphStatus,
} from "../../shared/subagentPatternGraph";
import { subagentPatternGraphEdgesWithRuntimeState } from "../../shared/subagentPatternGraph";
import type { SymphonyWorkflowPatternId } from "../../shared/symphonyWorkflowRecipes";
import type { SubagentParentClusterTone } from "./subagentParentClusterUiModel";

export interface SubagentPatternGraphRendererModel {
  schemaVersion: "ambient-subagent-pattern-graph-renderer-v1";
  id: string;
  patternId: SymphonyWorkflowPatternId;
  label: string;
  layout: SymphonyWorkflowPatternId;
  ariaLabel: string;
  summary: string;
  updatedAt: string;
  viewBox: string;
  nodes: SubagentPatternGraphNodeModel[];
  edges: SubagentPatternGraphEdgeModel[];
}

export interface SubagentPatternGraphNodeModel {
  id: string;
  label: string;
  subtitle: string;
  statusLabel: string;
  tone: SubagentParentClusterTone;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  blockingParent: boolean;
  approvalLabel?: string;
  overflowLabel?: string;
  overflowChildren?: SubagentPatternGraphOverflowChildModel[];
  canExpandOverflow: boolean;
  badges: SubagentPatternGraphNodeBadgeModel[];
  childRunId?: string;
  childThreadId?: string;
  workflowTaskId?: string;
  workflowRunId?: string;
  title: string;
  canOpen: boolean;
}

export interface SubagentPatternGraphOverflowChildModel {
  childRunId: string;
  childThreadId: string;
  label: string;
  statusLabel: string;
  tone: SubagentParentClusterTone;
  blockingParent: boolean;
  approvalLabel?: string;
  summary?: string;
  title: string;
  canOpen: boolean;
}

export interface SubagentPatternGraphNodeBadgeModel {
  key: string;
  label: string;
  tone: SubagentParentClusterTone;
}

export interface SubagentPatternGraphEdgeModel {
  id: string;
  from: string;
  to: string;
  label: string;
  tone: SubagentParentClusterTone;
  required: boolean;
  statusLabel: string;
  blockingParent: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 260;
const NODE_WIDTH = 118;
const NODE_HEIGHT = 66;

export function subagentPatternGraphRendererModel(
  snapshot: SubagentPatternGraphSnapshot,
): SubagentPatternGraphRendererModel {
  const positionedNodes = positionNodes(snapshot);
  const nodes = positionedNodes.map((node) => patternGraphNodeModel(node));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = subagentPatternGraphEdgesWithRuntimeState(snapshot.edges, snapshot.nodes)
    .map((edge) => patternGraphEdgeModel(edge, nodesById))
    .filter((edge): edge is SubagentPatternGraphEdgeModel => Boolean(edge));
  return {
    schemaVersion: "ambient-subagent-pattern-graph-renderer-v1",
    id: `${snapshot.parentThreadId}:${snapshot.parentMessageId ?? "parent"}:${snapshot.workflowTaskId ?? snapshot.patternId}`,
    patternId: snapshot.patternId,
    label: snapshot.label,
    layout: snapshot.layout,
    ariaLabel: `${snapshot.label} child thread pattern graph`,
    summary: patternGraphSummary(snapshot),
    updatedAt: snapshot.updatedAt,
    viewBox: `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`,
    nodes,
    edges,
  };
}

function patternGraphNodeModel(node: PositionedPatternGraphNode): SubagentPatternGraphNodeModel {
  const tone = statusTone(node.status, node.approvalState);
  const approvalLabel = node.approvalState !== "none" ? approvalStateLabel(node.approvalState) : undefined;
  const overflowLabel = node.overflowCount ? `${node.overflowCount} grouped` : undefined;
  const subtitle = [
    node.patternRole ? titleCase(node.patternRole) : undefined,
    node.baseRole ? titleCase(node.baseRole) : undefined,
  ].filter(Boolean).join(" / ");
  const title = [
    node.label,
    subtitle,
    node.statusLabel,
    node.blockingParent ? "Blocks parent" : undefined,
    approvalLabel,
    overflowLabel,
    node.summary,
  ].filter(Boolean).join(" / ");
  const overflowChildren = (node.overflowChildren ?? []).map((child) => patternGraphOverflowChildModel(child));
  const badges = patternGraphNodeBadges(node, approvalLabel, overflowLabel);
  return {
    id: node.id,
    label: node.label,
    subtitle,
    statusLabel: node.statusLabel,
    tone,
    x: node.x,
    y: node.y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    centerX: node.x + NODE_WIDTH / 2,
    centerY: node.y + NODE_HEIGHT / 2,
    blockingParent: node.blockingParent,
    ...(approvalLabel ? { approvalLabel } : {}),
    ...(overflowLabel ? { overflowLabel } : {}),
    ...(overflowChildren.length ? { overflowChildren } : {}),
    canExpandOverflow: overflowChildren.length > 0,
    badges,
    ...(node.childRunId ? { childRunId: node.childRunId } : {}),
    ...(node.childThreadId ? { childThreadId: node.childThreadId } : {}),
    ...(node.workflowTaskId ? { workflowTaskId: node.workflowTaskId } : {}),
    ...(node.workflowRunId ? { workflowRunId: node.workflowRunId } : {}),
    title,
    canOpen: Boolean(node.childThreadId || node.workflowTaskId || node.workflowRunId),
  };
}

function patternGraphOverflowChildModel(child: SubagentPatternGraphOverflowChild): SubagentPatternGraphOverflowChildModel {
  const approvalLabel = child.approvalState !== "none" ? approvalStateLabel(child.approvalState) : undefined;
  const title = [
    child.label,
    child.statusLabel,
    child.blockingParent ? "Blocks parent" : undefined,
    approvalLabel,
    child.summary,
    `Run ${child.childRunId}`,
    `Thread ${child.childThreadId}`,
  ].filter(Boolean).join(" / ");
  return {
    childRunId: child.childRunId,
    childThreadId: child.childThreadId,
    label: child.label,
    statusLabel: child.statusLabel,
    tone: statusTone(child.status, child.approvalState),
    blockingParent: child.blockingParent,
    ...(approvalLabel ? { approvalLabel } : {}),
    ...(child.summary ? { summary: child.summary } : {}),
    title,
    canOpen: Boolean(child.childThreadId),
  };
}

function patternGraphEdgeModel(
  edge: SubagentPatternGraphEdge,
  nodesById: Map<string, SubagentPatternGraphNodeModel>,
): SubagentPatternGraphEdgeModel | undefined {
  const from = nodesById.get(edge.from);
  const to = nodesById.get(edge.to);
  if (!from || !to) return undefined;
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    label: edge.label,
    tone: statusTone(edge.status),
    required: edge.required,
    statusLabel: edge.statusLabel,
    blockingParent: edge.blockingParent,
    x1: from.centerX,
    y1: from.centerY,
    x2: to.centerX,
    y2: to.centerY,
  };
}

function patternGraphNodeBadges(
  node: PositionedPatternGraphNode,
  approvalLabel: string | undefined,
  overflowLabel: string | undefined,
): SubagentPatternGraphNodeBadgeModel[] {
  return [
    node.blockingParent ? { key: "blocking", label: "Blocking", tone: "warning" as const } : undefined,
    approvalLabel ? { key: "approval", label: approvalLabel, tone: statusTone(node.status, node.approvalState) } : undefined,
    overflowLabel ? { key: "overflow", label: overflowLabel, tone: "neutral" as const } : undefined,
  ].filter((badge): badge is SubagentPatternGraphNodeBadgeModel => Boolean(badge));
}

type PositionedPatternGraphNode = SubagentPatternGraphNode & {
  x: number;
  y: number;
};

function positionNodes(snapshot: SubagentPatternGraphSnapshot): PositionedPatternGraphNode[] {
  if (snapshot.layout === "map_reduce") return mapReducePositions(snapshot.nodes);
  if (snapshot.layout === "adversarial_debate") return debatePositions(snapshot.nodes);
  if (snapshot.layout === "imitate_and_verify") return sequencePositions(snapshot.nodes, ["drafter", "verifier"]);
  if (snapshot.layout === "pipeline") return sequencePositions(snapshot.nodes, ["stage_runner", "gatekeeper"]);
  if (snapshot.layout === "ensemble") return ensemblePositions(snapshot.nodes);
  if (snapshot.layout === "self_healing_loop") return selfHealingPositions(snapshot.nodes);
  return sequencePositions(snapshot.nodes, []);
}

function mapReducePositions(nodes: SubagentPatternGraphNode[]): PositionedPatternGraphNode[] {
  const mappers = nodes.filter((node) => node.patternRole === "mapper" || node.kind === "overflow");
  const reducers = nodes.filter((node) => node.patternRole === "reducer");
  const validators = nodes.filter((node) => node.patternRole === "validator");
  return [
    ...stack(mappers, 36, 40),
    ...stack(reducers, 308, 102),
    ...stack(validators, 562, 102),
  ];
}

function debatePositions(nodes: SubagentPatternGraphNode[]): PositionedPatternGraphNode[] {
  const debaters = nodes.filter((node) => node.patternRole === "debater");
  const arbiters = nodes.filter((node) => node.patternRole === "arbiter");
  return [
    ...stack(debaters, 86, 58),
    ...stack(arbiters, 500, 102),
  ];
}

function ensemblePositions(nodes: SubagentPatternGraphNode[]): PositionedPatternGraphNode[] {
  const proposals = nodes.filter((node) => node.patternRole === "proposer" || node.kind === "overflow");
  const scorers = nodes.filter((node) => node.patternRole === "scorer");
  const synthesizers = nodes.filter((node) => node.patternRole === "synthesizer");
  return [
    ...stack(proposals, 38, 42),
    ...stack(scorers, 306, 82),
    ...stack(synthesizers, 560, 126),
  ];
}

function selfHealingPositions(nodes: SubagentPatternGraphNode[]): PositionedPatternGraphNode[] {
  return nodes.map((node, index) => {
    const key = node.id.split(":")[0];
    const position = key === "attempt"
      ? { x: 78, y: 72 }
      : key === "verify"
        ? { x: 308, y: 34 }
        : key === "repair"
          ? { x: 498, y: 134 }
          : key === "checkpoint"
            ? { x: 300, y: 164 }
            : { x: 80 + index * 140, y: 102 };
    return { ...node, ...position };
  });
}

function sequencePositions(nodes: SubagentPatternGraphNode[], preferredPatternRoles: string[]): PositionedPatternGraphNode[] {
  const ordered = [...nodes].sort((a, b) => {
    const aIndex = preferredPatternRoles.indexOf(a.patternRole ?? "");
    const bIndex = preferredPatternRoles.indexOf(b.patternRole ?? "");
    return normalizeOrder(aIndex) - normalizeOrder(bIndex) || a.id.localeCompare(b.id);
  });
  const gap = ordered.length > 1 ? Math.min(170, (VIEWBOX_WIDTH - NODE_WIDTH - 72) / (ordered.length - 1)) : 0;
  const startX = ordered.length > 1 ? 36 : (VIEWBOX_WIDTH - NODE_WIDTH) / 2;
  return ordered.map((node, index) => ({
    ...node,
    x: Math.round(startX + index * gap),
    y: 102,
  }));
}

function normalizeOrder(index: number): number {
  return index < 0 ? 999 : index;
}

function stack(nodes: SubagentPatternGraphNode[], x: number, y: number): PositionedPatternGraphNode[] {
  if (nodes.length <= 1) return nodes.map((node) => ({ ...node, x, y }));
  const spacing = Math.min(64, Math.max(44, (VIEWBOX_HEIGHT - NODE_HEIGHT - 28) / Math.max(1, nodes.length - 1)));
  const startY = Math.max(24, Math.round((VIEWBOX_HEIGHT - NODE_HEIGHT - spacing * (nodes.length - 1)) / 2));
  return nodes.map((node, index) => ({
    ...node,
    x,
    y: Math.round(startY + index * spacing),
  }));
}

function patternGraphSummary(snapshot: SubagentPatternGraphSnapshot): string {
  const running = snapshot.nodes.filter((node) => node.status === "running").length;
  const blocked = snapshot.nodes.filter((node) => node.status === "blocked" || node.status === "approval_needed").length;
  const completed = snapshot.nodes.filter((node) => node.status === "completed").length;
  const overflow = snapshot.nodes.reduce((sum, node) => sum + (node.overflowCount ?? 0), 0);
  return [
    `${snapshot.nodes.length} nodes`,
    running ? `${running} running` : undefined,
    blocked ? `${blocked} blocked` : undefined,
    completed ? `${completed} complete` : undefined,
    overflow ? `${overflow} grouped` : undefined,
  ].filter(Boolean).join(" · ");
}

function statusTone(
  status: SubagentPatternGraphStatus,
  approvalState: string = "none",
): SubagentParentClusterTone {
  if (approvalState === "pending") return "warning";
  if (status === "running" || status === "queued" || status === "blocked") return "active";
  if (status === "approval_needed" || status === "partial" || status === "timed_out") return "warning";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "completed") return "success";
  return "neutral";
}

function approvalStateLabel(state: string): string {
  if (state === "pending") return "Approval needed";
  if (state === "approved") return "Approval granted";
  if (state === "denied") return "Approval denied";
  return "No approval";
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
