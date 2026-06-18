import type { WorkflowManifest, WorkflowRunEvent, WorkflowRunLimitOverrides, WorkflowRunStatus } from "../../shared/workflowTypes";

export const DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS = 120_000;
export const DEFAULT_WORKFLOW_FOREGROUND_TOTAL_LIMIT_MODE: WorkflowRunTotalLimitMode = "disabled";
export const DEFAULT_WORKFLOW_SCHEDULE_TOTAL_LIMIT_MODE: WorkflowRunTotalLimitMode = "disabled";

export type WorkflowRunTotalLimitMode = "disabled" | "manifest";

export interface WorkflowRunLimitSettings {
  idleTimeoutMs: number;
  totalLimitMode: WorkflowRunTotalLimitMode;
}

export interface WorkflowRunLimitOption {
  value: number;
  label: string;
}

export interface WorkflowTotalRuntimePauseModel {
  eventId: string;
  message: string;
  idleTimeoutLabel: string;
  totalLimitLabel: string;
  sourceLabel: string;
}

export const workflowRunIdleTimeoutOptions: WorkflowRunLimitOption[] = [
  { value: 60_000, label: "1 min" },
  { value: 120_000, label: "2 min" },
  { value: 300_000, label: "5 min" },
  { value: 600_000, label: "10 min" },
];

export function workflowRunLimitOverridesForSettings(
  settings: WorkflowRunLimitSettings,
  manifest: Pick<WorkflowManifest, "maxRunMs">,
): WorkflowRunLimitOverrides {
  const idleTimeoutMs = normalizeRunLimitMs(settings.idleTimeoutMs, DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS);
  if (settings.totalLimitMode === "manifest" && manifest.maxRunMs !== undefined) return { idleTimeoutMs };
  return { idleTimeoutMs, maxRunMs: null };
}

export function workflowRunLimitSummary(settings: WorkflowRunLimitSettings, manifest: Pick<WorkflowManifest, "maxRunMs">): string {
  const idleTimeoutMs = normalizeRunLimitMs(settings.idleTimeoutMs, DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS);
  const total =
    settings.totalLimitMode === "manifest" && manifest.maxRunMs !== undefined
      ? `manifest total cap ${formatRunLimitDuration(manifest.maxRunMs)}`
      : "no total cap";
  return `Idle timeout ${formatRunLimitDuration(idleTimeoutMs)}; ${total}.`;
}

export function workflowExtendTotalRunLimitOverrides(settings: Pick<WorkflowRunLimitSettings, "idleTimeoutMs">, extensionMs = 600_000): WorkflowRunLimitOverrides {
  return {
    idleTimeoutMs: normalizeRunLimitMs(settings.idleTimeoutMs, DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS),
    maxRunMs: normalizeRunLimitMs(extensionMs, 600_000),
  };
}

export function workflowRemoveTotalRunLimitOverrides(settings: Pick<WorkflowRunLimitSettings, "idleTimeoutMs">): WorkflowRunLimitOverrides {
  return {
    idleTimeoutMs: normalizeRunLimitMs(settings.idleTimeoutMs, DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS),
    maxRunMs: null,
  };
}

export function workflowTotalRuntimePauseModel(status: WorkflowRunStatus, events: WorkflowRunEvent[]): WorkflowTotalRuntimePauseModel | undefined {
  if (status !== "paused") return undefined;
  const event = [...events]
    .reverse()
    .find((candidate) => candidate.type === "workflow.timeout" && candidate.data?.reason === "total_runtime_limit" && candidate.data?.recoverable !== false);
  if (!event) return undefined;
  const idleTimeoutMs = numberFromRecord(event.data, "idleTimeoutMs");
  const maxRunMs = numberFromRecord(event.data, "maxRunMs");
  const source = stringFromRecord(event.data, "totalRuntimeLimitSource");
  return {
    eventId: event.id,
    message: event.message ?? "The workflow reached its optional total runtime limit.",
    idleTimeoutLabel: idleTimeoutMs === undefined ? "default stream-idle timeout" : formatRunLimitDuration(idleTimeoutMs),
    totalLimitLabel: maxRunMs === undefined ? "the configured total cap" : formatRunLimitDuration(maxRunMs),
    sourceLabel: source === "manifest" ? "manifest cap" : source === "override" ? "run override" : "run limit",
  };
}

function normalizeRunLimitMs(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function formatRunLimitDuration(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000 && ms % 1_000 === 0) return `${Math.round(ms / 1_000)} sec`;
  return `${Math.round(ms)} ms`;
}

function numberFromRecord(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringFromRecord(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}
