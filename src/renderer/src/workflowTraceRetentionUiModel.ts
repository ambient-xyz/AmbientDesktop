import type { WorkflowModelCallRecord, WorkflowRunEvent, WorkflowTraceMode } from "../../shared/types";

export type WorkflowTraceRetentionTone = "ready" | "review" | "neutral";

export interface WorkflowTraceRetentionReviewModel {
  modeLabel: string;
  windowLabel: string;
  value: string;
  detail: string;
  tone: WorkflowTraceRetentionTone;
  retainedEvidenceCount: number;
  compactedPayloadCount: number;
}

export function workflowTraceRetentionReviewModel(input: {
  traceMode?: WorkflowTraceMode;
  events?: WorkflowRunEvent[];
  modelCalls?: WorkflowModelCallRecord[];
  debugRetentionDays?: number;
}): WorkflowTraceRetentionReviewModel {
  const traceMode = input.traceMode ?? "production";
  const debugRetentionDays = Math.max(1, Math.floor(input.debugRetentionDays ?? 30));
  const events = input.events ?? [];
  const modelCalls = input.modelCalls ?? [];
  const compactedEventCount = events.filter((event) => isCompactedPayload(event.data)).length;
  const compactedModelCallCount = modelCalls.filter((call) => isCompactedPayload(call.input) || isCompactedPayload(call.output)).length;
  const compactedPayloadCount = compactedEventCount + compactedModelCallCount;
  const retainedEvidenceCount = Math.max(0, events.length + modelCalls.length - compactedPayloadCount);
  const modeLabel = traceMode === "debug" ? "Debug trace" : "Production trace";
  const windowLabel = traceMode === "debug" ? `${debugRetentionDays}-day debug cleanup` : "Essentials retained";
  return {
    modeLabel,
    windowLabel,
    value: `${modeLabel}, ${windowLabel}`,
    detail: retentionDetail({ traceMode, debugRetentionDays, compactedPayloadCount, retainedEvidenceCount, hasEvidence: events.length + modelCalls.length > 0 }),
    tone: traceMode === "debug" || compactedPayloadCount ? "review" : retainedEvidenceCount ? "ready" : "neutral",
    retainedEvidenceCount,
    compactedPayloadCount,
  };
}

function retentionDetail(input: {
  traceMode: WorkflowTraceMode;
  debugRetentionDays: number;
  compactedPayloadCount: number;
  retainedEvidenceCount: number;
  hasEvidence: boolean;
}): string {
  if (input.compactedPayloadCount) {
    return `${input.compactedPayloadCount} expired payload${input.compactedPayloadCount === 1 ? "" : "s"} compacted; ${input.retainedEvidenceCount} audit evidence item${input.retainedEvidenceCount === 1 ? " remains" : "s remain"} visible.`;
  }
  if (!input.hasEvidence) {
    return input.traceMode === "debug"
      ? `Debug mode can retain richer inputs and outputs; cleanup compacts payloads after ${input.debugRetentionDays} days.`
      : "Production mode keeps essential audit data and minimizes retained payloads.";
  }
  if (input.traceMode === "debug") {
    return `${input.retainedEvidenceCount} retained evidence item${input.retainedEvidenceCount === 1 ? "" : "s"} available; debug payload cleanup runs after ${input.debugRetentionDays} days.`;
  }
  return `${input.retainedEvidenceCount} retained evidence item${input.retainedEvidenceCount === 1 ? "" : "s"} available; old batch-item payloads are compacted by the retention cleanup.`;
}

function isCompactedPayload(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return payload.retention === "compacted" && payload.reason === "workflow_trace_retention_expired";
}
