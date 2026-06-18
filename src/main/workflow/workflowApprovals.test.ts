import { describe, expect, it } from "vitest";
import type { WorkflowRunEvent } from "../../shared/workflowTypes";
import { workflowApprovalsFromEvents } from "./workflowApprovals";

describe("workflowApprovalsFromEvents", () => {
  it("derives pending and decided review queue items from runtime events", () => {
    const events: WorkflowRunEvent[] = [
      approvalEvent("event-1", 1, "approval.required", "approval-1", { file: "src/app.ts", action: "edit" }),
      approvalEvent("event-2", 2, "approval.required", "approval-2", { command: "pnpm test" }),
      approvalEvent("event-3", 3, "approval.approved", "approval-1"),
    ];

    expect(workflowApprovalsFromEvents(events)).toEqual([
      expect.objectContaining({
        id: "approval-2",
        status: "pending",
        changeSetPreview: '{"command":"pnpm test"}',
      }),
      expect.objectContaining({
        id: "approval-1",
        status: "approved",
        decidedAt: "2026-04-30T00:00:03.000Z",
        changeSetPreview: '{"file":"src/app.ts","action":"edit"}',
      }),
    ]);
  });

  it("derives connector review queue items from connector review events", () => {
    const events: WorkflowRunEvent[] = [
      approvalEvent("event-1", 1, "connector.review.required", "connector-review-1", {
        kind: "connector-grant",
        connectorId: "personal.mail",
        scopes: ["mail.messages.read"],
        dataRetention: "redacted_audit",
      }),
      approvalEvent("event-2", 2, "connector.review.approved", "connector-review-1"),
    ];

    expect(workflowApprovalsFromEvents(events)).toEqual([
      expect.objectContaining({
        id: "connector-review-1",
        status: "approved",
        changeSetPreview: expect.stringContaining("personal.mail"),
      }),
    ]);
  });

  it("keeps approved connector review visible when a resumed run only records the approval event", () => {
    const events: WorkflowRunEvent[] = [
      approvalEvent("event-1", 1, "connector.review.approved", "connector-review-1", {
        kind: "connector-grant",
        connectorId: "personal.mail",
      }),
    ];

    expect(workflowApprovalsFromEvents(events)).toEqual([
      expect.objectContaining({
        id: "connector-review-1",
        status: "approved",
        decidedAt: "2026-04-30T00:00:01.000Z",
        changeSetPreview: expect.stringContaining("personal.mail"),
      }),
    ]);
  });
});

function approvalEvent(id: string, seq: number, type: string, approvalId: string, changeSet?: unknown): WorkflowRunEvent {
  return {
    id,
    runId: "run-1",
    artifactId: "artifact-1",
    seq,
    type,
    createdAt: `2026-04-30T00:00:0${seq}.000Z`,
    data: changeSet === undefined ? { id: approvalId } : { id: approvalId, changeSet },
  };
}
