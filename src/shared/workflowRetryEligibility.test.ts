import { describe, expect, it } from "vitest";
import { workflowResumeCheckpointEligibility, workflowRetryEligibility, workflowSkipItemEligibility } from "./workflowRetryEligibility";

const failedEvent = { type: "step.error", graphNodeId: "step-1" };

describe("workflowRetryEligibility", () => {
  it("allows deterministic and model steps to retry with retained inputs", () => {
    expect(
      workflowRetryEligibility({
        event: failedEvent,
        node: { id: "step-1", type: "deterministic_step", label: "Inspect files" },
      }),
    ).toMatchObject({
      eligible: true,
      action: "retry_step",
      sameInputRequired: true,
    });

    expect(
      workflowRetryEligibility({
        event: { ...failedEvent, itemKey: "record-1" },
        node: { id: "model", type: "model_call", label: "Classify", retryPolicy: "Retry with same retained input." },
      }),
    ).toMatchObject({
      eligible: true,
      label: "Retry failed item",
    });
  });

  it("blocks unsafe connector and mutation retries", () => {
    expect(
      workflowRetryEligibility({
        event: { type: "connector.error", graphNodeId: "send" },
        node: { id: "send", type: "connector_call", label: "Send message" },
      }),
    ).toMatchObject({
      eligible: false,
      reasons: ["Connector retry needs a read-only operation or an idempotency guarantee."],
    });

    expect(
      workflowRetryEligibility({
        event: failedEvent,
        node: { id: "write", type: "mutation", label: "Write file" },
      }),
    ).toMatchObject({
      eligible: false,
      reasons: ["Mutation retry needs staged changes or an idempotency guarantee."],
    });
  });

  it("uses debug rewrite when the failed event has no graph mapping", () => {
    expect(workflowRetryEligibility({ event: { type: "workflow.failed" } })).toMatchObject({
      eligible: false,
      action: "debug_rewrite",
      label: "Ask Ambient to debug",
    });
  });

  it("allows skip item only for item failures with skip policy", () => {
    expect(
      workflowSkipItemEligibility({
        event: { type: "batch.item.failed", graphNodeId: "classify", itemKey: "record-1" },
        node: { id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry or skip failed items." },
      }),
    ).toMatchObject({
      eligible: true,
      action: "skip_item",
      label: "Skip item",
    });

    expect(
      workflowSkipItemEligibility({
        event: { type: "batch.item.failed", graphNodeId: "classify", itemKey: "record-1" },
        node: { id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry with same input." },
      }),
    ).toMatchObject({
      eligible: false,
      reasons: ["Skip requires a graph retry policy that allows skipping failed targets or continuing with partial results."],
    });
  });

  it("labels page and chunk recovery using explicit target coordinates", () => {
    expect(
      workflowRetryEligibility({
        event: { type: "collection.page.error", graphNodeId: "search", itemKey: "page-2", data: { targetKind: "page", targetIndex: 1 } },
        node: { id: "search", type: "connector_call", label: "Search", retryPolicy: "read-only bounded pagination; checkpointed page retry; continue with partial results" },
      }),
    ).toMatchObject({
      eligible: true,
      action: "retry_step",
      label: "Retry failed page",
    });

    expect(
      workflowSkipItemEligibility({
        event: { type: "collection.page.error", graphNodeId: "search", itemKey: "page-2", data: { targetKind: "page", targetIndex: 1 } },
        node: { id: "search", type: "connector_call", label: "Search", retryPolicy: "read-only bounded pagination; continue with partial results" },
      }),
    ).toMatchObject({
      eligible: true,
      action: "skip_item",
      label: "Continue without failed page",
    });

    expect(
      workflowSkipItemEligibility({
        event: { type: "batch.item.failed", graphNodeId: "classify", itemKey: "chunk-2", data: { targetKind: "chunk", targetIndex: 1 } },
        node: { id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry or skip failed chunks and continue with partial coverage." },
      }),
    ).toMatchObject({
      eligible: true,
      action: "skip_item",
      label: "Skip failed chunk",
    });
  });

  it("allows checkpoint resume for failed workflow steps when checkpoints are retained", () => {
    expect(
      workflowResumeCheckpointEligibility({
        event: failedEvent,
        node: { id: "step-1", type: "deterministic_step", label: "Inspect files" },
        hasCheckpoint: true,
      }),
    ).toMatchObject({
      eligible: true,
      action: "resume_checkpoint",
      label: "Resume from checkpoint",
      sameInputRequired: false,
    });

    expect(
      workflowResumeCheckpointEligibility({
        event: failedEvent,
        node: { id: "step-1", type: "deterministic_step", label: "Inspect files" },
        hasCheckpoint: false,
      }),
    ).toMatchObject({
      eligible: false,
      reasons: ["Resume from checkpoint requires at least one retained workflow checkpoint."],
    });
  });
});
