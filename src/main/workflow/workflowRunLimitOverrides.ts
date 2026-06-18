import type { WorkflowRunLimitOverrides } from "../../shared/workflowTypes";

export function stringifyWorkflowRunLimitOverrides(value: WorkflowRunLimitOverrides | undefined): string | null {
  if (!value) return null;
  const normalized: WorkflowRunLimitOverrides = {};
  if (typeof value.idleTimeoutMs === "number" && Number.isFinite(value.idleTimeoutMs) && value.idleTimeoutMs > 0) {
    normalized.idleTimeoutMs = Math.floor(value.idleTimeoutMs);
  }
  if (value.maxRunMs === null) {
    normalized.maxRunMs = null;
  } else if (typeof value.maxRunMs === "number" && Number.isFinite(value.maxRunMs) && value.maxRunMs > 0) {
    normalized.maxRunMs = Math.floor(value.maxRunMs);
  }
  return Object.keys(normalized).length > 0 ? JSON.stringify(normalized) : null;
}
