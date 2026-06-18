import type { WorkflowApprovalStatus, WorkflowApprovalSummary, WorkflowRunEvent } from "../../shared/workflowTypes";

export function workflowApprovalsFromEvents(events: WorkflowRunEvent[]): WorkflowApprovalSummary[] {
  const approvals = new Map<string, WorkflowApprovalSummary>();

  for (const event of events) {
    if (event.type === "approval.required" || event.type === "connector.review.required") {
      const id = approvalId(event);
      if (!id) continue;
      const changeSet = event.data?.changeSet;
      approvals.set(id, {
        id,
        status: "pending",
        createdAt: event.createdAt,
        changeSet,
        changeSetPreview: summarizeApprovalValue(changeSet),
      });
      continue;
    }

    const status = decisionStatus(event.type);
    if (!status) continue;
    const id = approvalId(event);
    if (!id) continue;
    const existing = approvals.get(id);
    if (!existing) {
      if (event.data?.changeSet === undefined) continue;
      approvals.set(id, {
        id,
        status,
        createdAt: event.createdAt,
        decidedAt: event.createdAt,
        changeSet: event.data.changeSet,
        changeSetPreview: summarizeApprovalValue(event.data.changeSet),
      });
      continue;
    }
    approvals.set(id, {
      ...existing,
      status,
      decidedAt: event.createdAt,
    });
  }

  return [...approvals.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function decisionStatus(type: string): WorkflowApprovalStatus | undefined {
  if (type === "approval.approved") return "approved";
  if (type === "approval.rejected") return "rejected";
  if (type === "connector.review.approved") return "approved";
  if (type === "connector.review.rejected") return "rejected";
  return undefined;
}

function approvalId(event: WorkflowRunEvent): string | undefined {
  const id = event.data?.id;
  return typeof id === "string" && id.trim() ? id : undefined;
}

function summarizeApprovalValue(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return "undefined";
    return json.length <= 300 ? json : `${json.slice(0, 297)}...`;
  } catch {
    return String(value);
  }
}
