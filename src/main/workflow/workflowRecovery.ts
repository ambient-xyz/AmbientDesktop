import { workflowRetryEligibility, workflowSkipItemEligibility } from "../../shared/workflowRetryEligibility";
import { workflowRunLiveness, type WorkflowRunLivenessOptions } from "../../shared/workflowRunLiveness";
import type { RecoverWorkflowRunInput, WorkflowGraphNode, WorkflowRecoveryContext, WorkflowRecoveryTargetKind, WorkflowRunEvent } from "../../shared/workflowTypes";
import type { ProjectStore } from "../projectStore/projectStore";
import { readWorkflowCheckpointSummaries } from "./workflowCheckpointStore";

export interface WorkflowRecoveryPlan {
  artifactId: string;
  resumeFromRunId: string;
  recovery: WorkflowRecoveryContext;
}

export function buildWorkflowRecoveryPlan(
  store: ProjectStore,
  input: RecoverWorkflowRunInput,
  options: WorkflowRunLivenessOptions = {},
): WorkflowRecoveryPlan {
  const run = store.getWorkflowRun(input.runId);
  const events = store.listWorkflowRunEvents(run.id);
  if (run.status === "running") {
    const liveness = workflowRunLiveness(run, events, options);
    if (!liveness.stale) throw new Error(`Cannot recover a workflow run that is still running. ${liveness.summary}`);
  }
  const artifact = store.getWorkflowArtifact(run.artifactId);
  if (artifact.status === "archived" || artifact.status === "rejected") {
    throw new Error(`Workflow artifact is ${artifact.status} and cannot be recovered.`);
  }
  const event = selectedRecoveryEvent(events, input.eventId);
  const graphNodeId = input.graphNodeId ?? recoveryEventGraphNodeId(event);
  if (input.graphNodeId && recoveryEventGraphNodeId(event) && input.graphNodeId !== recoveryEventGraphNodeId(event)) {
    throw new Error(`Recovery graph node does not match selected event: ${input.graphNodeId}`);
  }
  const itemKey = input.itemKey ?? recoveryEventItemKey(event);
  if (input.itemKey && recoveryEventItemKey(event) && input.itemKey !== recoveryEventItemKey(event)) {
    throw new Error(`Recovery item key does not match selected event: ${input.itemKey}`);
  }
  const node = artifact.workflowThreadId && graphNodeId ? workflowGraphNodeForThread(store, artifact.workflowThreadId, graphNodeId) : undefined;

  if (input.action === "retry_step") {
    const eligibility = workflowRetryEligibility({ event, node });
    if (!eligibility.eligible || eligibility.action !== "retry_step") {
      throw new Error(`Retry step is not available: ${eligibility.reasons.join(" ")}`);
    }
  } else if (input.action === "resume_checkpoint") {
    const eligibility = workflowRetryEligibility({ event, node });
    if ((!eligibility.eligible || eligibility.action !== "resume_checkpoint") && readWorkflowCheckpointSummaries(artifact.statePath).length === 0) {
      throw new Error(`Resume from checkpoint is not available: ${eligibility.reasons.join(" ")}`);
    }
  } else if (input.action === "skip_item") {
    const eligibility = workflowSkipItemEligibility({ event, node });
    if (!eligibility.eligible) {
      throw new Error(`Skip item is not available: ${eligibility.reasons.join(" ")}`);
    }
  }

  return {
    artifactId: artifact.id,
    resumeFromRunId: run.id,
    recovery: {
      action: input.action,
      sourceRunId: run.id,
      sourceEventId: event.id,
      targetGraphNodeId: graphNodeId,
      targetGraphEdgeId: event.graphEdgeId ?? stringFromRecord(event.data, "graphEdgeId"),
      targetItemKey: itemKey,
      targetKind: recoveryEventTargetKind(event),
      targetIndex: numberFromRecord(event.data, "targetIndex"),
      targetCheckpointKey: stringFromRecord(event.data, "checkpointKey"),
      reason: recoveryReason(input.action, node, event),
      createdAt: new Date().toISOString(),
    },
  };
}

function selectedRecoveryEvent(events: WorkflowRunEvent[], eventId: string): WorkflowRunEvent {
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error(`Workflow recovery event not found: ${eventId}`);
  return event;
}

function workflowGraphNodeForThread(store: ProjectStore, workflowThreadId: string, graphNodeId: string): WorkflowGraphNode | undefined {
  return store.getWorkflowAgentThreadSummary(workflowThreadId).graph?.nodes.find((node) => node.id === graphNodeId);
}

function recoveryEventGraphNodeId(event: WorkflowRunEvent): string | undefined {
  return event.graphNodeId ?? stringFromRecord(event.data, "graphNodeId");
}

function recoveryEventItemKey(event: WorkflowRunEvent): string | undefined {
  return event.itemKey ?? stringFromRecord(event.data, "itemKey");
}

function recoveryEventTargetKind(event: WorkflowRunEvent): WorkflowRecoveryTargetKind | undefined {
  const value = stringFromRecord(event.data, "targetKind");
  return value === "step" || value === "page" || value === "item" || value === "chunk" ? value : undefined;
}

function stringFromRecord(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberFromRecord(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function recoveryReason(action: RecoverWorkflowRunInput["action"], node: WorkflowGraphNode | undefined, event: WorkflowRunEvent): string {
  const targetKind = recoveryEventTargetKind(event);
  if (action === "skip_item") {
    if (targetKind === "page") return `Continue without failed page ${recoveryEventItemKey(event) ?? "(unknown page)"}.`;
    if (targetKind === "chunk") return `Skip failed chunk ${recoveryEventItemKey(event) ?? "(unknown chunk)"}.`;
    return `Skip failed item ${recoveryEventItemKey(event) ?? "(unknown item)"}.`;
  }
  if (action === "resume_checkpoint") return "Resume from retained checkpoints and approval decisions.";
  if (targetKind === "page") return node?.retryPolicy || "Retry selected failed page with retained pagination checkpoints.";
  if (targetKind === "chunk") return node?.retryPolicy || "Retry selected failed chunk with retained model-map input.";
  return node?.retryPolicy || "Retry selected graph node with retained inputs or checkpoints.";
}
