import type { WorkflowExplorationProgress, WorkflowExplorationTraceSummary } from "../../shared/types";
import { normalizeWorkflowExplorationBudgets, workflowExplorationBudgetLabels } from "./workflowExplorationBudgetUiModel";

export interface WorkflowExplorationTraceCard {
  id: string;
  title: string;
  createdLabel: string;
  modelLabel: string;
  request: string;
  summary: string;
  observationLabel: string;
  budgetLabels: string[];
  observedCallLabels: string[];
  requiredGrantLabels: string[];
  dataShapeLabels: string[];
  successfulPatternLabels: string[];
  unresolvedQuestionLabels: string[];
  graphSummary: string;
  deterministicSourceStrategy: string;
}

export interface WorkflowExplorationProgressCard {
  title: string;
  detail: string;
  tone: "running" | "ready" | "blocked";
  labels: string[];
  graphNodeId?: string;
}

export function workflowExplorationProgressCard(progress: WorkflowExplorationProgress | undefined): WorkflowExplorationProgressCard | undefined {
  if (!progress) return undefined;
  const labels = [
    formatLabelValue(progress.phase),
    progress.turn !== undefined ? `turn ${progress.turn}` : undefined,
    progress.outputChars !== undefined ? `output ${Math.max(0, Math.round(progress.outputChars)).toLocaleString()} chars` : undefined,
    progress.thinkingChars !== undefined ? `thinking ${Math.max(0, Math.round(progress.thinkingChars)).toLocaleString()} chars` : undefined,
    progress.idleElapsedMs !== undefined && progress.idleTimeoutMs !== undefined
      ? `idle ${formatDuration(progress.idleElapsedMs)} / ${formatDuration(progress.idleTimeoutMs)}`
      : undefined,
  ].filter((label): label is string => Boolean(label));
  return {
    title: progress.status === "running" ? "Exploration running" : progress.status === "failed" ? "Exploration failed" : "Exploration updated",
    detail: progress.message,
    tone: progress.status === "failed" ? "blocked" : progress.status === "succeeded" ? "ready" : "running",
    labels,
    graphNodeId: progress.graphNodeId,
  };
}

export function workflowExplorationTraceCards(
  traces: WorkflowExplorationTraceSummary[],
  now = Date.now(),
): WorkflowExplorationTraceCard[] {
  return [...traces]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    .map((trace, index) => workflowExplorationTraceCard(trace, index, now));
}

function workflowExplorationTraceCard(trace: WorkflowExplorationTraceSummary, index: number, now: number): WorkflowExplorationTraceCard {
  const distillation = explorationDistillationModel(trace.distillation);
  const observedCalls = distillation.observedCalls.length
    ? distillation.observedCalls
    : trace.observations.flatMap((observation) => observationCallLabel(observation));
  const status = trace.status ?? "succeeded";
  return {
    id: trace.id,
    title: explorationTraceTitle(status, index),
    createdLabel: relativeCreatedLabel(trace.updatedAt ?? trace.createdAt, now),
    modelLabel: trace.model ? `Model ${trace.model}` : "Model not recorded",
    request: trace.request,
    summary: explorationTraceSummary(trace, distillation.summary),
    observationLabel: countLabel(trace.observations.length, "observation", "observations"),
    budgetLabels: [explorationTraceStatusLabel(status), ...traceBudgetLabels(trace.capabilityManifest)],
    observedCallLabels: observedCalls.slice(0, 6),
    requiredGrantLabels: distillation.requiredGrants.slice(0, 6),
    dataShapeLabels: distillation.dataShapes.slice(0, 6),
    successfulPatternLabels: distillation.successfulPatterns.slice(0, 6),
    unresolvedQuestionLabels: distillation.unresolvedQuestions.slice(0, 6),
    graphSummary: distillation.graphSummary,
    deterministicSourceStrategy: distillation.deterministicSourceStrategy || "No deterministic source strategy was recorded.",
  };
}

function explorationTraceTitle(status: WorkflowExplorationTraceSummary["status"], index: number): string {
  if (status === "running") return index === 0 ? "Running exploration trace" : `Running exploration trace ${index + 1}`;
  if (status === "failed") return index === 0 ? "Failed exploration trace" : `Failed exploration trace ${index + 1}`;
  if (status === "canceled") return index === 0 ? "Canceled exploration trace" : `Canceled exploration trace ${index + 1}`;
  if (status === "fallback") return index === 0 ? "Fallback exploration trace" : `Fallback exploration trace ${index + 1}`;
  return index === 0 ? "Latest exploration trace" : `Exploration trace ${index + 1}`;
}

function explorationTraceSummary(trace: WorkflowExplorationTraceSummary, summary: string): string {
  if (trace.status === "running") return summary || "Exploration is running; partial events are retained for recovery.";
  if (trace.status === "failed") return trace.error ? `Exploration failed: ${trace.error}` : summary || "Exploration failed before producing a final distillation.";
  if (trace.status === "canceled") return trace.error ? `Exploration canceled: ${trace.error}` : summary || "Exploration was canceled before producing a final distillation.";
  if (trace.status === "fallback") return summary || "Exploration used a fallback path; review retained evidence before compiling.";
  return summary || "Exploration finished without a written summary.";
}

function explorationTraceStatusLabel(status: WorkflowExplorationTraceSummary["status"]): string {
  if (status === "running") return "Running";
  if (status === "failed") return "Failed";
  if (status === "canceled") return "Canceled";
  if (status === "fallback") return "Fallback";
  return "Succeeded";
}

function traceBudgetLabels(capabilityManifest: unknown): string[] {
  if (!isRecord(capabilityManifest) || !isRecord(capabilityManifest.budgets)) return [];
  const budgets = capabilityManifest.budgets;
  return workflowExplorationBudgetLabels(
    normalizeWorkflowExplorationBudgets({
      maxModelTurns: numberValue(budgets.maxModelTurns),
      maxToolCalls: numberValue(budgets.maxToolCalls),
      maxConnectorCalls: numberValue(budgets.maxConnectorCalls),
      maxAmbientCalls: numberValue(budgets.maxAmbientCalls),
      maxElapsedMs: numberValue(budgets.maxElapsedMs),
    }),
  );
}

function explorationDistillationModel(raw: unknown) {
  const record = isRecord(raw) ? raw : {};
  const recommendedGraph = isRecord(record.recommendedGraph) ? record.recommendedGraph : undefined;
  return {
    summary: stringValue(record.summary),
    observedCalls: arrayValue(record.observedCalls).flatMap(observedCallLabel),
    successfulPatterns: stringArray(record.successfulPatterns),
    dataShapes: stringArray(record.dataShapes),
    requiredGrants: stringArray(record.requiredGrants),
    unresolvedQuestions: stringArray(record.unresolvedQuestions),
    graphSummary: stringValue(recommendedGraph?.summary) || "No recommended graph summary was recorded.",
    deterministicSourceStrategy: stringValue(record.deterministicSourceStrategy),
  };
}

function observedCallLabel(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  const kind = stringValue(raw.kind);
  const name = stringValue(raw.name);
  const status = stringValue(raw.status);
  if (!name) return [];
  return [`${kind ? `${kind}: ` : ""}${name}${status ? ` (${status})` : ""}`];
}

function observationCallLabel(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  const action = stringValue(raw.action);
  const name = stringValue(raw.name);
  const status = stringValue(raw.status);
  if (!name) return [];
  return [`${action ? `${action}: ` : ""}${name}${status ? ` (${status})` : ""}`];
}

function relativeCreatedLabel(createdAt: string, now: number): string {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return "Created recently";
  const elapsedMs = Math.max(0, now - created);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (elapsedMs < minuteMs) return "Created just now";
  if (elapsedMs < hourMs) return `Created ${Math.floor(elapsedMs / minuteMs)}m ago`;
  if (elapsedMs < dayMs) return `Created ${Math.floor(elapsedMs / hourMs)}h ago`;
  return `Created ${Math.floor(elapsedMs / dayMs)}d ago`;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms >= 1_000) return `${Math.round(ms / 1_000)}s`;
  return `${Math.round(ms)}ms`;
}

function formatLabelValue(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function stringArray(raw: unknown): string[] {
  return arrayValue(raw).flatMap((value) => {
    const string = stringValue(value);
    return string ? [string] : [];
  });
}

function arrayValue(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function stringValue(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function numberValue(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return Boolean(raw && typeof raw === "object" && !Array.isArray(raw));
}
