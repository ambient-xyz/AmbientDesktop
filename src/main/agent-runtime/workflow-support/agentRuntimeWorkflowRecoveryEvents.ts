import type { RuntimeSurfaceWorkflowRecoveryEvent } from "../../../shared/messagingGateway";
import type { WorkflowGraphNode, WorkflowRunEvent } from "../../../shared/types";
import { workflowResumeCheckpointEligibility, workflowRetryEligibility, workflowSkipItemEligibility } from "../../../shared/workflowRetryEligibility";
import { readWorkflowCheckpointSummaries } from "../../workflow/workflowCheckpointStore";

interface AgentRuntimeWorkflowRecoveryCommandEvent {
  retryEligible: boolean;
  resumeEligible: boolean;
  skipEligible: boolean;
  commandExamples?: string[];
}

interface AgentRuntimeWorkflowRecoveryThread {
  activeArtifactId?: string;
  latestRun?: {
    id: string;
    status: string;
  };
  graph?: {
    nodes: WorkflowGraphNode[];
  };
}

interface AgentRuntimeWorkflowRecoveryFolder {
  threads: readonly AgentRuntimeWorkflowRecoveryThread[];
}

interface AgentRuntimeWorkflowRecoveryArtifact {
  statePath: string;
}

export function agentRuntimeWorkflowRecoveryEventsForRemoteSurface(input: {
  workflowFolders: readonly AgentRuntimeWorkflowRecoveryFolder[];
  getWorkflowArtifact: (artifactId: string) => AgentRuntimeWorkflowRecoveryArtifact;
  listWorkflowRunEvents: (runId: string) => readonly WorkflowRunEvent[];
  readCheckpointSummaries?: (statePath: string) => readonly unknown[];
}): RuntimeSurfaceWorkflowRecoveryEvent[] {
  const readCheckpointSummaries = input.readCheckpointSummaries ?? readWorkflowCheckpointSummaries;
  const result: RuntimeSurfaceWorkflowRecoveryEvent[] = [];
  for (const workflowThread of input.workflowFolders.flatMap((folder) => folder.threads)) {
    const run = workflowThread.latestRun;
    if (!run || (run.status !== "failed" && run.status !== "stale")) continue;
    if (!workflowThread.activeArtifactId) continue;
    const artifact = input.getWorkflowArtifact(workflowThread.activeArtifactId);
    const hasCheckpoint = readCheckpointSummaries(artifact.statePath).length > 0;
    result.push(...agentRuntimeWorkflowRecoveryEventsFromRunEvents({
      events: input.listWorkflowRunEvents(run.id),
      hasCheckpoint,
      nodeById: (graphNodeId) => workflowGraphNodeById(workflowThread, graphNodeId),
    }));
  }
  return result;
}

export function agentRuntimeWorkflowRecoveryEventsFromRunEvents(input: {
  events: readonly WorkflowRunEvent[];
  hasCheckpoint: boolean;
  nodeById?: (graphNodeId: string) => WorkflowGraphNode | undefined;
}): RuntimeSurfaceWorkflowRecoveryEvent[] {
  const recoveryCandidates = input.events
    .filter((event) => isAgentRuntimeWorkflowFailureEvent(event.type))
    .slice(-3)
    .reverse()
    .map((event) => agentRuntimeWorkflowRecoveryEventFromRunEvent({
      event,
      hasCheckpoint: input.hasCheckpoint,
      nodeById: input.nodeById,
    }));
  return agentRuntimeWorkflowRecoveryEventsWithCommandExamples(recoveryCandidates);
}

export function agentRuntimeWorkflowRecoveryEventsWithCommandExamples<Event extends AgentRuntimeWorkflowRecoveryCommandEvent>(
  events: readonly Event[],
): Array<Event & { commandExamples?: string[] }> {
  const retryableCount = events.filter((event) => event.retryEligible).length;
  const resumableCount = events.filter((event) => event.resumeEligible).length;
  const skippableCount = events.filter((event) => event.skipEligible).length;
  return events.map((event, index) => {
    const commandExamples = agentRuntimeWorkflowRecoveryCommandExamples({
      event,
      index,
      retryableCount,
      resumableCount,
      skippableCount,
    });
    return {
      ...event,
      ...(commandExamples.length ? { commandExamples } : {}),
    };
  });
}

function agentRuntimeWorkflowRecoveryEventFromRunEvent(input: {
  event: WorkflowRunEvent;
  hasCheckpoint: boolean;
  nodeById?: (graphNodeId: string) => WorkflowGraphNode | undefined;
}): RuntimeSurfaceWorkflowRecoveryEvent {
  const graphNodeId = input.event.graphNodeId ?? stringFromRecord(input.event.data, "graphNodeId");
  const itemKey = input.event.itemKey ?? stringFromRecord(input.event.data, "itemKey");
  const node = graphNodeId ? input.nodeById?.(graphNodeId) : undefined;
  const eventForEligibility: WorkflowRunEvent = {
    ...input.event,
    ...(graphNodeId ? { graphNodeId } : {}),
    ...(itemKey ? { itemKey } : {}),
  };
  const retry = workflowRetryEligibility({ event: eventForEligibility, node });
  const resume = workflowResumeCheckpointEligibility({ event: eventForEligibility, node, hasCheckpoint: input.hasCheckpoint });
  const skip = workflowSkipItemEligibility({ event: eventForEligibility, node });
  return {
    id: input.event.id,
    runId: input.event.runId,
    type: input.event.type,
    ...(input.event.message ? { message: input.event.message } : {}),
    ...(graphNodeId ? { graphNodeId } : {}),
    ...(node?.label ? { graphNodeLabel: node.label } : {}),
    ...(node?.type ? { graphNodeType: node.type } : {}),
    ...(itemKey ? { itemKey } : {}),
    createdAt: input.event.createdAt,
    retryEligible: retry.eligible && retry.action === "retry_step",
    retryLabel: retry.label,
    retryReasons: retry.reasons,
    resumeEligible: resume.eligible && resume.action === "resume_checkpoint",
    resumeLabel: resume.label,
    resumeReasons: resume.reasons,
    skipEligible: skip.eligible && skip.action === "skip_item",
    skipLabel: skip.label,
    skipReasons: skip.reasons,
  };
}

function isAgentRuntimeWorkflowFailureEvent(type: string): boolean {
  return type === "workflow.failed" || type.endsWith(".error") || type.endsWith(".failed") || type.endsWith(".invalid");
}

function workflowGraphNodeById(thread: AgentRuntimeWorkflowRecoveryThread, graphNodeId: string): WorkflowGraphNode | undefined {
  return thread.graph?.nodes.find((node) => node.id === graphNodeId);
}

function agentRuntimeWorkflowRecoveryCommandExamples(input: {
  event: AgentRuntimeWorkflowRecoveryCommandEvent;
  index: number;
  retryableCount: number;
  resumableCount: number;
  skippableCount: number;
}): string[] {
  const commandExamples: string[] = [];
  if (input.event.retryEligible) {
    commandExamples.push(input.retryableCount === 1 ? "retry failed step" : `retry failed event ${input.index + 1}`);
  }
  if (input.event.resumeEligible) {
    commandExamples.push(input.resumableCount === 1 ? "resume checkpoint" : `resume checkpoint ${input.index + 1}`);
  }
  if (input.event.skipEligible) {
    commandExamples.push(input.skippableCount === 1 ? "skip failed item" : `skip failed item ${input.index + 1}`);
  }
  return commandExamples;
}

function stringFromRecord(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
