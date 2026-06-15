import type { WorkflowGraphNode, WorkflowRecoveryTargetKind, WorkflowRunEvent } from "./types";

export type WorkflowRetryAction = "retry_step" | "resume_checkpoint" | "skip_item" | "debug_rewrite" | "none";

export interface WorkflowRetryEligibility {
  eligible: boolean;
  action: WorkflowRetryAction;
  label: string;
  reasons: string[];
  sameInputRequired: boolean;
}

export function workflowRetryEligibility(input: {
  node?: WorkflowGraphNode;
  event?: Pick<WorkflowRunEvent, "type" | "data" | "graphNodeId" | "itemKey">;
  versionChanged?: boolean;
}): WorkflowRetryEligibility {
  if (!input.event || !isFailureEvent(input.event.type)) {
    return ineligible("No failed graph event is selected.");
  }
  if (!input.node) {
    return {
      eligible: false,
      action: "debug_rewrite",
      label: "Ask Ambient to debug",
      reasons: ["The failed event is not mapped to a workflow graph node."],
      sameInputRequired: false,
    };
  }
  if (input.versionChanged) {
    return ineligible("The workflow version changed after this event; retry from the old inputs is unsafe.");
  }

  const retryPolicy = (input.node.retryPolicy ?? "").toLowerCase();
  if (retryPolicy.includes("never") || retryPolicy.includes("do not retry")) {
    return ineligible(input.node.retryPolicy ?? "This node declares that retry is not allowed.");
  }

  if (input.node.type === "review_gate") {
    return {
      eligible: true,
      action: "resume_checkpoint",
      label: "Resume after review",
      reasons: ["The failed node is a review gate; recovery should resume after the approval decision is recorded."],
      sameInputRequired: false,
    };
  }

  if (input.node.type === "mutation") {
    const policy = `${input.node.retryPolicy ?? ""} ${input.node.reviewPolicy ?? ""}`.toLowerCase();
    if (!policy.includes("staged") && !policy.includes("idempotent")) {
      return ineligible("Mutation retry needs staged changes or an idempotency guarantee.");
    }
  }

  const targetKind = recoveryTargetKind(input.event);
  if (input.node.type === "connector_call") {
    const policy = `${input.node.retryPolicy ?? ""} ${input.node.description ?? ""}`.toLowerCase();
    if (!policy.includes("idempotent") && !policy.includes("same input") && !policy.includes("read") && !(targetKind === "page" && policy.includes("pagination"))) {
      return ineligible("Connector retry needs a read-only operation or an idempotency guarantee.");
    }
  }

  if (input.node.type === "output" || input.node.type === "request") {
    return {
      eligible: false,
      action: "debug_rewrite",
      label: "Ask Ambient to debug",
      reasons: ["The failed event maps to a boundary node rather than a retryable workflow step."],
      sameInputRequired: false,
    };
  }

  return {
    eligible: true,
    action: "retry_step",
    label: retryLabel(input.event),
    reasons: [retryReason(input.event)],
    sameInputRequired: true,
  };
}

export function workflowSkipItemEligibility(input: {
  node?: WorkflowGraphNode;
  event?: Pick<WorkflowRunEvent, "type" | "data" | "graphNodeId" | "itemKey">;
  versionChanged?: boolean;
}): WorkflowRetryEligibility {
  if (!input.event || !isFailureEvent(input.event.type)) {
    return ineligible("No failed graph event is selected.");
  }
  const itemKey = input.event.itemKey ?? (typeof input.event.data?.itemKey === "string" ? input.event.data.itemKey : undefined);
  const targetKind = recoveryTargetKind(input.event);
  if (!itemKey) {
    return ineligible("Skip requires a failed page, item, or chunk with a retained target key.");
  }
  if (!input.node) {
    return ineligible("Skip item requires a failed event mapped to a workflow graph node.");
  }
  if (input.versionChanged) {
    return ineligible("The workflow version changed after this event; skip from the old item is unsafe.");
  }
  if (input.node.type === "review_gate" || input.node.type === "mutation" || input.node.type === "request" || input.node.type === "output") {
    return ineligible("Skip is only available for retryable processing nodes.");
  }
  const policy = `${input.node.retryPolicy ?? ""} ${input.node.description ?? ""}`.toLowerCase();
  if (!policy.includes("skip") && !policy.includes("continue") && !policy.includes("partial")) {
    return ineligible("Skip requires a graph retry policy that allows skipping failed targets or continuing with partial results.");
  }
  return {
    eligible: true,
    action: "skip_item",
    label: skipLabel(targetKind),
    reasons: [skipReason(targetKind)],
    sameInputRequired: false,
  };
}

export function workflowResumeCheckpointEligibility(input: {
  node?: WorkflowGraphNode;
  event?: Pick<WorkflowRunEvent, "type" | "data" | "graphNodeId" | "itemKey">;
  hasCheckpoint: boolean;
  versionChanged?: boolean;
}): WorkflowRetryEligibility {
  if (!input.event || !isFailureEvent(input.event.type)) {
    return ineligible("No failed graph event is selected.");
  }
  if (input.versionChanged) {
    return ineligible("The workflow version changed after this event; checkpoint resume from the old inputs is unsafe.");
  }
  if (!input.hasCheckpoint) {
    return ineligible("Resume from checkpoint requires at least one retained workflow checkpoint.");
  }
  if (input.node?.type === "request" || input.node?.type === "output") {
    return ineligible("Resume from checkpoint targets workflow steps rather than boundary nodes.");
  }
  return {
    eligible: true,
    action: "resume_checkpoint",
    label: input.node?.type === "review_gate" ? "Resume after review" : "Resume from checkpoint",
    reasons: ["Recovery can resume from retained checkpoints and approval decisions."],
    sameInputRequired: false,
  };
}

function isFailureEvent(type: string): boolean {
  return type === "workflow.failed" || type.endsWith(".error") || type.endsWith(".failed") || type.endsWith(".invalid");
}

function recoveryTargetKind(event: Pick<WorkflowRunEvent, "type" | "data" | "itemKey">): WorkflowRecoveryTargetKind | undefined {
  const value = typeof event.data?.targetKind === "string" ? event.data.targetKind : undefined;
  if (value === "page" || value === "item" || value === "chunk" || value === "step") return value;
  if (event.type === "collection.page.error") return "page";
  if (event.type === "collection.map.item.failed" || event.type === "batch.item.failed") return event.itemKey ? "item" : undefined;
  return event.itemKey ? "item" : undefined;
}

function retryLabel(event: Pick<WorkflowRunEvent, "data" | "itemKey" | "type">): string {
  const targetKind = recoveryTargetKind(event);
  if (targetKind === "page") return "Retry failed page";
  if (targetKind === "chunk") return "Retry failed chunk";
  if (targetKind === "item" || event.itemKey) return "Retry failed item";
  return "Retry step";
}

function retryReason(event: Pick<WorkflowRunEvent, "data" | "itemKey" | "type">): string {
  const targetKind = recoveryTargetKind(event);
  if (targetKind === "page") return "Retry is eligible because prior pages are retained and the failed page can be fetched again with the same cursor or query.";
  if (targetKind === "chunk") return "Retry is eligible because the failed chunk input is retained by the model-map checkpoint.";
  if (targetKind === "item" || event.itemKey) return "Retry is eligible because the failed item input is retained or can be reconstructed from checkpoints.";
  return "Retry is eligible when the same input is retained or can be reconstructed from checkpoints.";
}

function skipLabel(targetKind: WorkflowRecoveryTargetKind | undefined): string {
  if (targetKind === "page") return "Continue without failed page";
  if (targetKind === "chunk") return "Skip failed chunk";
  return "Skip item";
}

function skipReason(targetKind: WorkflowRecoveryTargetKind | undefined): string {
  if (targetKind === "page") return "The failed page can be skipped by continuing with retained partial results or the next independent page query.";
  if (targetKind === "chunk") return "The failed chunk can be skipped because the graph policy allows continuing with partial coverage.";
  return "The failed item can be skipped because the graph policy allows continuing past item-level failures.";
}

function ineligible(reason: string): WorkflowRetryEligibility {
  return {
    eligible: false,
    action: "none",
    label: "Retry unavailable",
    reasons: [reason],
    sameInputRequired: false,
  };
}
