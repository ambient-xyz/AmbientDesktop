import type {
  WorkflowCheckpointSummary,
  WorkflowGraphNode,
  WorkflowManifest,
  WorkflowModelCallRecord,
  WorkflowRunEvent,
} from "../../shared/types";
import { workflowTraceRetentionReviewModel } from "./workflowTraceRetentionUiModel";

export type WorkflowGraphNodeReviewTone = "ready" | "review" | "blocked" | "neutral";

export interface WorkflowGraphNodeReviewFact {
  label: string;
  value: string;
  detail: string;
  tone: WorkflowGraphNodeReviewTone;
}

export interface WorkflowGraphNodeSourceMapping {
  label: string;
  detail: string;
  snippet: string;
}

export type WorkflowGraphNodeReviewActionId = "open_source" | "open_audit" | "review_connector_grants" | "review_mutation_policy";
export type WorkflowGraphNodeReviewTargetSection = "source" | "audit" | "connectors" | "mutation_policy";

export interface WorkflowGraphNodeReviewAction {
  id: WorkflowGraphNodeReviewActionId;
  label: string;
  detail: string;
  tone: WorkflowGraphNodeReviewTone;
  targetSection: WorkflowGraphNodeReviewTargetSection;
}

export interface WorkflowGraphNodeReviewModel {
  title: string;
  typeLabel: string;
  description?: string;
  badges: string[];
  facts: WorkflowGraphNodeReviewFact[];
  sourceMappings: WorkflowGraphNodeSourceMapping[];
  actions: WorkflowGraphNodeReviewAction[];
}

export interface WorkflowGraphNodeReviewInput {
  node: WorkflowGraphNode;
  manifest?: WorkflowManifest;
  traceMode?: "production" | "debug";
  events?: WorkflowRunEvent[];
  modelCalls?: WorkflowModelCallRecord[];
  checkpoints?: WorkflowCheckpointSummary[];
}

export function workflowGraphNodeReviewModel(input: WorkflowGraphNodeReviewInput): WorkflowGraphNodeReviewModel {
  const { node } = input;
  const nodeEvents = (input.events ?? []).filter((event) => event.graphNodeId === node.id || event.data?.graphNodeId === node.id);
  const nodeModelCalls = (input.modelCalls ?? []).filter((call) => call.graphNodeId === node.id);
  const facts = [
    requirementFact(input),
    traceRetentionFact(input, nodeEvents, nodeModelCalls),
    sourceMappingFact(node),
    runtimeEvidenceFact(nodeEvents, nodeModelCalls, input.checkpoints ?? []),
    policyFact(input),
  ].filter((fact): fact is WorkflowGraphNodeReviewFact => Boolean(fact));
  return {
    title: node.label,
    typeLabel: formatNodeType(node.type),
    description: node.description,
    badges: nodeBadges(input, nodeEvents, nodeModelCalls),
    facts,
    sourceMappings: (node.sourceRanges ?? []).map((range) => ({
      label: `${formatNodeType(range.kind)} lines ${range.startLine}-${range.endLine}`,
      detail: `${range.end - range.start} chars mapped from generated program.`,
      snippet: range.snippet,
    })),
    actions: reviewActions(input, nodeEvents, nodeModelCalls),
  };
}

function requirementFact(input: WorkflowGraphNodeReviewInput): WorkflowGraphNodeReviewFact {
  const { node, manifest } = input;
  if (node.type === "model_call") {
    const allowed = Boolean(manifest?.tools.includes("ambient.responses"));
    return {
      label: "Model requirement",
      value: allowed ? "Ambient call allowed" : "Missing ambient.responses",
      detail: allowed ? modelBudgetLabel(manifest) : "The manifest must include ambient.responses before this node can call Ambient.",
      tone: allowed ? "ready" : "blocked",
    };
  }
  if (node.type === "connector_call" || node.type === "data_source") {
    const connectorIds = node.connectorIds?.length ? node.connectorIds : (manifest?.connectors ?? []).map((grant) => grant.connectorId);
    const missing = connectorIds.filter((id) => !(manifest?.connectors ?? []).some((grant) => grant.connectorId === id));
    return {
      label: "Connector grants",
      value: connectorIds.length ? `${connectorIds.length} connector${connectorIds.length === 1 ? "" : "s"}` : "No connectors declared",
      detail: missing.length ? `Missing grants: ${missing.join(", ")}` : connectorRetentionDetail(manifest, connectorIds) || "This node does not name a connector yet.",
      tone: missing.length ? "blocked" : connectorIds.length ? "review" : "neutral",
    };
  }
  if (node.type === "mutation") {
    const policy = manifest?.mutationPolicy ?? "read_only";
    return {
      label: "Mutation policy",
      value: formatNodeType(policy),
      detail: node.reviewPolicy ?? (policy === "read_only" ? "Manifest is read-only; mutation nodes need an explicit staged policy." : "Mutation must follow manifest review policy."),
      tone: policy === "read_only" ? "blocked" : "review",
    };
  }
  if (node.type === "review_gate") {
    return {
      label: "Review gate",
      value: "Approval required",
      detail: node.reviewPolicy ?? "Runtime pauses until the user approves or rejects this gate.",
      tone: "review",
    };
  }
  if (node.type === "agent_exploration") {
    return {
      label: "Exploration",
      value: "Manual trace source",
      detail: "Exploratory nodes are evidence for compile and are not scheduled as production steps by default.",
      tone: "review",
    };
  }
  const tools = node.toolNames ?? [];
  return {
    label: "Tool requirements",
    value: tools.length ? `${tools.length} tool${tools.length === 1 ? "" : "s"}` : "No tools declared",
    detail: tools.length ? tools.join(", ") : "This node appears deterministic or internal.",
    tone: tools.length ? "review" : "neutral",
  };
}

function traceRetentionFact(
  input: WorkflowGraphNodeReviewInput,
  events: WorkflowRunEvent[],
  modelCalls: WorkflowModelCallRecord[],
): WorkflowGraphNodeReviewFact {
  const mode = input.traceMode ?? "production";
  const retention = workflowTraceRetentionReviewModel({ traceMode: mode, events, modelCalls });
  return {
    label: "Trace retention",
    value: input.node.retentionPolicy ?? retention.value,
    detail: input.node.retentionPolicy ? `${input.node.retentionPolicy}. ${retention.detail}` : retention.detail,
    tone: retention.tone,
  };
}

function sourceMappingFact(node: WorkflowGraphNode): WorkflowGraphNodeReviewFact {
  const count = node.sourceRanges?.length ?? 0;
  return {
    label: "Program mapping",
    value: count ? `${count} mapped range${count === 1 ? "" : "s"}` : "No program map",
    detail: count ? "Generated program includes explicit node mapping for this graph item." : "Compile should map executable graph nodes back to the generated program before approval.",
    tone: count ? "ready" : executableNode(node) ? "blocked" : "neutral",
  };
}

function runtimeEvidenceFact(
  events: WorkflowRunEvent[],
  modelCalls: WorkflowModelCallRecord[],
  checkpoints: WorkflowCheckpointSummary[],
): WorkflowGraphNodeReviewFact {
  const failures = events.filter((event) => event.type.endsWith(".failed") || event.type.endsWith(".error") || event.type === "workflow.failed").length;
  const successes = modelCalls.filter((call) => call.status === "succeeded").length;
  return {
    label: "Latest trace",
    value: `${events.length} event${events.length === 1 ? "" : "s"}, ${modelCalls.length} model call${modelCalls.length === 1 ? "" : "s"}`,
    detail: failures
      ? `${failures} failure event${failures === 1 ? "" : "s"} retained for this node.`
      : successes
        ? `${successes} successful model call${successes === 1 ? "" : "s"} retained.`
        : checkpoints.length
          ? `${checkpoints.length} workflow checkpoint${checkpoints.length === 1 ? "" : "s"} available in the run detail.`
          : "No retained run evidence for this node yet.",
    tone: failures ? "blocked" : events.length || modelCalls.length || checkpoints.length ? "ready" : "neutral",
  };
}

function policyFact(input: WorkflowGraphNodeReviewInput): WorkflowGraphNodeReviewFact | undefined {
  const policy = input.node.retryPolicy ?? input.node.reviewPolicy;
  if (!policy) return undefined;
  return {
    label: input.node.retryPolicy ? "Retry policy" : "Review policy",
    value: input.node.retryPolicy ? "Recovery-aware" : "Review-aware",
    detail: policy,
    tone: "review",
  };
}

function nodeBadges(
  input: WorkflowGraphNodeReviewInput,
  events: WorkflowRunEvent[],
  modelCalls: WorkflowModelCallRecord[],
): string[] {
  return [
    formatNodeType(input.node.type),
    input.traceMode === "debug" ? "Debug traces" : "Production traces",
    input.manifest?.mutationPolicy ? formatNodeType(input.manifest.mutationPolicy) : undefined,
    events.length ? `${events.length} events` : undefined,
    modelCalls.length ? `${modelCalls.length} model calls` : undefined,
  ].filter((item): item is string => Boolean(item));
}

function reviewActions(
  input: WorkflowGraphNodeReviewInput,
  events: WorkflowRunEvent[],
  modelCalls: WorkflowModelCallRecord[],
): WorkflowGraphNodeReviewAction[] {
  const { node, manifest } = input;
  const actions: WorkflowGraphNodeReviewAction[] = [];
  if (node.sourceRanges?.length) {
    actions.push({
      id: "open_source",
      label: "Open mapped program",
      detail: "Show the generated program section with this graph node selected.",
      tone: "ready",
      targetSection: "source",
    });
  }
  if (events.length || modelCalls.length) {
    actions.push({
      id: "open_audit",
      label: "Open audit evidence",
      detail: "Show latest run evidence for this graph node.",
      tone: events.some((event) => event.type.endsWith(".failed") || event.type.endsWith(".error") || event.type === "workflow.failed") ? "blocked" : "ready",
      targetSection: "audit",
    });
  }
  if (node.type === "connector_call" || node.type === "data_source") {
    const connectorIds = node.connectorIds?.length ? node.connectorIds : (manifest?.connectors ?? []).map((grant) => grant.connectorId);
    const missing = connectorIds.filter((id) => !(manifest?.connectors ?? []).some((grant) => grant.connectorId === id));
    if (connectorIds.length || missing.length) {
      actions.push({
        id: "review_connector_grants",
        label: missing.length ? "Resolve connector grants" : "Review connector grants",
        detail: missing.length ? `Missing manifest grants for ${missing.join(", ")}.` : "Inspect connector accounts, scopes, operations, and retention policy.",
        tone: missing.length ? "blocked" : "review",
        targetSection: "connectors",
      });
    }
  }
  if (node.type === "mutation" || node.type === "review_gate") {
    const blocked = node.type === "mutation" && (manifest?.mutationPolicy ?? "read_only") === "read_only";
    actions.push({
      id: "review_mutation_policy",
      label: node.type === "review_gate" ? "Review gate policy" : blocked ? "Resolve mutation policy" : "Review mutation policy",
      detail: blocked ? "This graph node mutates external state, but the manifest is read-only." : "Inspect the workflow mutation and review-gate policy.",
      tone: blocked ? "blocked" : "review",
      targetSection: "mutation_policy",
    });
  }
  return actions;
}

function modelBudgetLabel(manifest: WorkflowManifest | undefined): string {
  if (!manifest) return "No manifest loaded for budget review.";
  return manifest.maxModelCalls === undefined ? "No model-call limit recorded." : `${manifest.maxModelCalls} max model call${manifest.maxModelCalls === 1 ? "" : "s"}.`;
}

function connectorRetentionDetail(manifest: WorkflowManifest | undefined, connectorIds: string[]): string {
  const grants = connectorIds
    .map((id) => manifest?.connectors?.find((grant) => grant.connectorId === id))
    .filter((grant): grant is NonNullable<WorkflowManifest["connectors"]>[number] => Boolean(grant));
  if (!grants.length) return connectorIds.join(", ");
  return grants
    .map((grant) => `${grant.connectorId}: ${formatConnectorRetention(grant.dataRetention)} - ${connectorRetentionSummary(grant.dataRetention)}`)
    .join("; ");
}

function formatConnectorRetention(retention: string): string {
  if (retention === "none") return "no retention";
  if (retention === "redacted_audit") return "redacted audit";
  if (retention === "run_artifact") return "run artifact";
  return formatNodeType(retention);
}

function connectorRetentionSummary(retention: string): string {
  if (retention === "none") return "connector values are omitted after the call";
  if (retention === "redacted_audit") return "only redacted summaries are retained";
  if (retention === "run_artifact") return "raw connector values may be retained in artifacts";
  return "retention policy needs review";
}

function executableNode(node: WorkflowGraphNode): boolean {
  return !["request", "output", "error_handler"].includes(node.type);
}

function formatNodeType(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
