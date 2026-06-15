import type { WorkflowRunDetail, WorkflowRunEvent, WorkflowRunSummary } from "../../shared/types";
import { workflowRunLiveness } from "../../shared/workflowRunLiveness";

export type WorkflowRunsPanelId = "runs-live" | "runs-input" | "runs-outputs" | "runs-events" | "runs-model" | "runs-checkpoints" | "runs-report";

export interface WorkflowRunsPanelTab {
  id: WorkflowRunsPanelId;
  label: string;
  detail: string;
  badge?: string;
}

export interface WorkflowRunsPanelTabsInput {
  latestRun?: Pick<WorkflowRunSummary, "status" | "updatedAt" | "providerHealth">;
  detail?: Pick<WorkflowRunDetail, "run" | "events" | "modelCalls" | "checkpoints" | "auditReport">;
  inputCount?: number;
  outputCount?: number;
}

export function workflowRunsPanelTabs(input: WorkflowRunsPanelTabsInput): WorkflowRunsPanelTab[] {
  const detail = input.detail;
  const status = workflowRunsPanelStatus(detail?.run ?? input.latestRun, detail?.events ?? []);
  return [
    {
      id: "runs-live",
      label: "Live",
      detail: "Run console, status, resume controls, and recovery actions.",
      badge: status ? formatRunsPanelStatus(status) : undefined,
    },
    {
      id: "runs-input",
      label: "Input",
      detail: "Runtime questions, user feedback requests, and attached artifacts.",
      badge: input.inputCount ? `${input.inputCount} pending` : undefined,
    },
    {
      id: "runs-outputs",
      label: "Outputs",
      detail: "Rendered output cards, retained reports, paths, and checkpoint output.",
      badge: input.outputCount ? `${input.outputCount} item${input.outputCount === 1 ? "" : "s"}` : undefined,
    },
    {
      id: "runs-events",
      label: "Events",
      detail: "Bounded event stream with step, tool, stream, timeout, and output events.",
      badge: detail ? `${detail.events.length} events` : undefined,
    },
    {
      id: "runs-model",
      label: "Model Calls",
      detail: "Ambient/Pi calls, task labels, mapped graph nodes, and latency.",
      badge: detail ? `${detail.modelCalls.length} call${detail.modelCalls.length === 1 ? "" : "s"}` : undefined,
    },
    {
      id: "runs-checkpoints",
      label: "Checkpoints",
      detail: "Resume checkpoints and retained checkpoint previews.",
      badge: detail ? `${detail.checkpoints.length} saved` : undefined,
    },
    {
      id: "runs-report",
      label: "Report",
      detail: "Generated audit report for the selected run.",
      badge: detail?.auditReport ? "audit" : undefined,
    },
  ];
}

export function normalizeWorkflowRunsPanelId(requested: WorkflowRunsPanelId | undefined, tabs: WorkflowRunsPanelTab[]): WorkflowRunsPanelId {
  const fallback = "runs-live";
  if (!requested) return fallback;
  return tabs.some((tab) => tab.id === requested) ? requested : fallback;
}

function workflowRunsPanelStatus(
  run: Pick<WorkflowRunSummary, "status" | "updatedAt" | "providerHealth"> | undefined,
  events: Pick<WorkflowRunEvent, "createdAt" | "type">[],
): string | undefined {
  if (!run) return undefined;
  return workflowRunLiveness(run, events).stale ? "stale" : run.status;
}

function formatRunsPanelStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
