import type { WorkflowRunEvent, WorkflowRunProviderHealthStatus, WorkflowRunSummary } from "./workflowTypes";

export const DEFAULT_WORKFLOW_RUN_STALE_MS = 5 * 60 * 1000;

export interface WorkflowRunLiveness {
  state: "not_running" | "active" | "stale";
  stale: boolean;
  idleMs: number;
  lastActivityAt?: string;
  latestEventType?: string;
  summary: string;
}

export interface WorkflowRunLivenessOptions {
  nowMs?: number;
  staleMs?: number;
}

type WorkflowRunLivenessRun = Pick<WorkflowRunSummary, "status" | "updatedAt" | "providerHealth">;
type WorkflowRunLivenessEvent = Pick<WorkflowRunEvent, "createdAt" | "type">;

export function workflowRunLiveness(
  run: WorkflowRunLivenessRun,
  events: WorkflowRunLivenessEvent[] = [],
  options: WorkflowRunLivenessOptions = {},
): WorkflowRunLiveness {
  const activity = latestActivity(events, run.updatedAt);
  if (run.status !== "running") {
    return {
      state: "not_running",
      stale: false,
      idleMs: 0,
      lastActivityAt: activity.iso,
      latestEventType: activity.eventType,
      summary: "Only running workflow runs are stale-recovery candidates.",
    };
  }

  const nowMs = options.nowMs ?? Date.now();
  const staleMs = options.staleMs ?? DEFAULT_WORKFLOW_RUN_STALE_MS;
  const idleMs = activity.ms === undefined ? 0 : Math.max(0, nowMs - activity.ms);
  const stale = activity.ms !== undefined && idleMs >= staleMs;
  const providerText = providerHealthText(run.providerHealth?.status);
  return {
    state: stale ? "stale" : "active",
    stale,
    idleMs,
    lastActivityAt: activity.iso,
    latestEventType: activity.eventType,
    summary: stale
      ? `No workflow run update has been recorded for ${formatWorkflowRunDelay(idleMs)}. Recovery can reuse retained graph events, checkpoints, and approval decisions.${providerText}`
      : `This workflow run is still receiving recent durable activity.${providerText}`,
  };
}

function latestActivity(events: WorkflowRunLivenessEvent[], runUpdatedAt?: string): { ms?: number; iso?: string; eventType?: string } {
  const candidates: { ms: number; iso?: string; eventType?: string }[] = [
    { iso: runUpdatedAt },
    ...events.map((event) => ({ iso: event.createdAt, eventType: event.type })),
  ]
    .map((candidate) => ({ ...candidate, ms: candidate.iso ? Date.parse(candidate.iso) : Number.NaN }))
    .filter((candidate) => Number.isFinite(candidate.ms));
  if (!candidates.length) return {};
  return candidates.reduce((latest, candidate) =>
    candidate.ms > latest.ms || (candidate.ms === latest.ms && Boolean(candidate.eventType) && !latest.eventType) ? candidate : latest,
  );
}

function providerHealthText(status: WorkflowRunProviderHealthStatus | undefined): string {
  if (status === "provider_degraded") return " Provider health was already degraded.";
  if (status === "product_failed") return " Last classified failure was product-side.";
  return "";
}

function formatWorkflowRunDelay(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000) return `${Math.round(ms / 1_000)} sec`;
  return `${Math.round(ms)} ms`;
}
