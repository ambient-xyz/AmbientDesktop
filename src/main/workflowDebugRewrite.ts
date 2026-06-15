import { readFileSync } from "node:fs";
import type { WorkflowGraphSnapshot, WorkflowModelCallRecord, WorkflowRevisionSummary, WorkflowRunEvent } from "../shared/types";
import { diffWorkflowGraphs } from "../shared/workflowGraphDiff";
import type { ProjectStore } from "./projectStore";
import { readWorkflowRunDetail } from "./workflowDashboard";

const MAX_SOURCE_CHARS = 80_000;
const MAX_AUDIT_CHARS = 30_000;
const MAX_EVENTS = 40;
const MAX_MODEL_CALLS = 12;

export interface WorkflowDebugRewriteContext {
  runId: string;
  artifactId: string;
  workflowThreadId?: string;
  title: string;
  goal: string;
  summary?: string;
  userNotes?: string;
  failedEvent?: CompactWorkflowRunEvent;
  recentEvents: CompactWorkflowRunEvent[];
  modelCalls: CompactWorkflowModelCall[];
  checkpointKeys: string[];
  graph?: WorkflowGraphSnapshot;
  source: string;
  auditReport: string;
}

interface CompactWorkflowRunEvent {
  id: string;
  seq: number;
  type: string;
  message?: string;
  graphNodeId?: string;
  graphEdgeId?: string;
  itemKey?: string;
  data?: Record<string, unknown>;
}

interface CompactWorkflowModelCall {
  id: string;
  task: string;
  status: string;
  graphNodeId?: string;
  graphEdgeId?: string;
  itemKey?: string;
  validationError?: string;
  inputSummary: string;
  outputSummary?: string;
  latencyMs: number;
}

export function buildWorkflowDebugRewriteContext(
  store: ProjectStore,
  input: { runId: string; eventId?: string; userNotes?: string },
): WorkflowDebugRewriteContext {
  const detail = readWorkflowRunDetail(store, input.runId);
  const workflowThreadId = detail.artifact.workflowThreadId;
  const graph = workflowThreadId ? store.getWorkflowAgentThreadSummary(workflowThreadId).graph : undefined;
  const source = detail.sourceContent ?? readFileSync(detail.artifact.sourcePath, "utf8");
  const failedEvent = selectDebugRewriteFailureEvent(detail.events, input.eventId);
  return {
    runId: detail.run.id,
    artifactId: detail.artifact.id,
    workflowThreadId,
    title: detail.artifact.title,
    goal: detail.artifact.spec.goal,
    summary: detail.artifact.spec.summary,
    userNotes: input.userNotes?.trim() || undefined,
    failedEvent: failedEvent ? compactEvent(failedEvent) : undefined,
    recentEvents: detail.events.slice(-MAX_EVENTS).map(compactEvent),
    modelCalls: detail.modelCalls.slice(-MAX_MODEL_CALLS).map(compactModelCall),
    checkpointKeys: detail.checkpoints.map((checkpoint) => checkpoint.key),
    graph,
    source: truncate(source, MAX_SOURCE_CHARS),
    auditReport: truncate(detail.auditReport, MAX_AUDIT_CHARS),
  };
}

function selectDebugRewriteFailureEvent(events: WorkflowRunEvent[], preferredEventId?: string): WorkflowRunEvent | undefined {
  const failures = events.filter((event) => isFailureEvent(event.type));
  if (preferredEventId) {
    const preferred = failures.find((event) => event.id === preferredEventId);
    if (preferred) return preferred;
  }
  return [...failures]
    .reverse()
    .find((event) => event.graphNodeId || event.graphEdgeId || event.itemKey || event.data?.graphNodeId || event.data?.graphEdgeId || event.data?.itemKey) ?? failures.at(-1);
}

export function buildWorkflowDebugRewritePromptSection(context: WorkflowDebugRewriteContext): string {
  return [
    "This is a debug rewrite request for an existing Ambient Desktop workflow.",
    "Preserve the workflow's intended behavior unless the failure context proves it needs to change.",
    "Create a new reviewable workflow artifact/version; do not assume the old version can be edited in place.",
    "Use the failed event, retained trace summaries, checkpoints, graph node ids, and audit report to diagnose the issue.",
    "Keep graph node ids stable where they still represent the same conceptual step, and add/change nodes only where the diagnosis requires it.",
    "If the failure is caused by missing node metadata, connector grants, model schema handling, checkpoint design, or retry policy, correct the generated source and graph.",
    "",
    JSON.stringify(
      {
        workflow: {
          runId: context.runId,
          artifactId: context.artifactId,
          workflowThreadId: context.workflowThreadId,
          title: context.title,
          goal: context.goal,
          summary: context.summary,
        },
        userNotes: context.userNotes,
        failedEvent: context.failedEvent,
        recentEvents: context.recentEvents,
        modelCalls: context.modelCalls,
        checkpointKeys: context.checkpointKeys,
        graph: context.graph
          ? {
              id: context.graph.id,
              version: context.graph.version,
              summary: context.graph.summary,
              nodes: context.graph.nodes,
              edges: context.graph.edges,
            }
          : undefined,
        source: context.source,
        auditReport: context.auditReport,
      },
      null,
      2,
    ),
  ].join("\n");
}

export function workflowDebugRewriteUserRequest(context: WorkflowDebugRewriteContext): string {
  return [
    `Debug and rewrite workflow "${context.title}" after failed run ${context.runId}.`,
    `Original goal: ${context.goal}`,
    context.failedEvent ? `Failed event: ${context.failedEvent.type}${context.failedEvent.graphNodeId ? ` on graph node ${context.failedEvent.graphNodeId}` : ""}.` : "No failed event was mapped; inspect the run trace and audit report.",
    context.userNotes ? `User notes: ${context.userNotes}` : undefined,
    "Return a corrected workflow artifact that can be reviewed, dry-run, and versioned.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function createWorkflowDebugRewriteRevision(
  store: ProjectStore,
  context: WorkflowDebugRewriteContext,
  input: { baseVersionId?: string; requestedChange?: string } = {},
): WorkflowRevisionSummary {
  if (!context.workflowThreadId) {
    throw new Error("Debug rewrite revision requires a workflow thread.");
  }
  const thread = store.getWorkflowAgentThreadSummary(context.workflowThreadId);
  if (!thread.activeArtifactId) {
    throw new Error("Debug rewrite did not produce an active workflow artifact.");
  }
  const baseArtifact = store.getWorkflowArtifact(context.artifactId);
  const proposedArtifact = store.getWorkflowArtifact(thread.activeArtifactId);
  const proposedGraph = thread.graph;
  const graphDiff =
    context.graph && proposedGraph
      ? diffWorkflowGraphs({
          current: context.graph,
          proposed: proposedGraph,
          currentManifest: baseArtifact.manifest,
          proposedManifest: proposedArtifact.manifest,
        })
      : undefined;
  return store.createWorkflowRevision({
    workflowThreadId: context.workflowThreadId,
    requestedChange: input.requestedChange ?? workflowDebugRewriteUserRequest(context),
    baseVersionId: input.baseVersionId,
    baseArtifactId: baseArtifact.id,
    proposedGraphSnapshotId: proposedGraph?.id,
    graphDiff,
    sourceDiff: buildWorkflowSourceDiff(
      readFileSync(baseArtifact.sourcePath, "utf8"),
      readFileSync(proposedArtifact.sourcePath, "utf8"),
      { beforeLabel: "base/main.ts", afterLabel: "proposed/main.ts" },
    ),
    status: "proposed",
  });
}

export function buildWorkflowSourceDiff(
  before: string,
  after: string,
  input: { beforeLabel?: string; afterLabel?: string } = {},
): string | undefined {
  if (before === after) return undefined;
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix + prefix < beforeLines.length &&
    suffix + prefix < afterLines.length &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const contextStart = Math.max(0, prefix - 3);
  const beforeChangeEnd = beforeLines.length - suffix;
  const afterChangeEnd = afterLines.length - suffix;
  const beforeContextEnd = Math.min(beforeLines.length, beforeChangeEnd + 3);
  const afterContextEnd = Math.min(afterLines.length, afterChangeEnd + 3);
  const beforeRemoved = beforeLines.slice(prefix, beforeChangeEnd);
  const afterAdded = afterLines.slice(prefix, afterChangeEnd);

  return [
    "diff --git a/main.ts b/main.ts",
    `--- a/${input.beforeLabel ?? "main.ts"}`,
    `+++ b/${input.afterLabel ?? "main.ts"}`,
    `@@ -${contextStart + 1},${beforeContextEnd - contextStart} +${contextStart + 1},${afterContextEnd - contextStart} @@`,
    ...beforeLines.slice(contextStart, prefix).map((line) => ` ${line}`),
    ...beforeRemoved.map((line) => `-${line}`),
    ...afterAdded.map((line) => `+${line}`),
    ...afterLines.slice(afterChangeEnd, afterContextEnd).map((line) => ` ${line}`),
  ].join("\n");
}

function compactEvent(event: WorkflowRunEvent): CompactWorkflowRunEvent {
  return {
    id: event.id,
    seq: event.seq,
    type: event.type,
    message: event.message,
    graphNodeId: event.graphNodeId,
    graphEdgeId: event.graphEdgeId,
    itemKey: event.itemKey,
    data: compactRecord(event.data),
  };
}

function compactModelCall(call: WorkflowModelCallRecord): CompactWorkflowModelCall {
  return {
    id: call.id,
    task: call.task,
    status: call.status,
    graphNodeId: call.graphNodeId,
    graphEdgeId: call.graphEdgeId,
    itemKey: call.itemKey,
    validationError: call.validationError,
    inputSummary: summarizeJson(call.input),
    outputSummary: call.output === undefined ? undefined : summarizeJson(call.output),
    latencyMs: call.latencyMs,
  };
}

function compactRecord(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!record) return undefined;
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, compactValue(value)]));
}

function compactValue(value: unknown): unknown {
  if (typeof value === "string") return truncate(value, 600);
  if (Array.isArray(value)) return value.slice(0, 12).map(compactValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, entry]) => [key, compactValue(entry)]));
}

function summarizeJson(value: unknown): string {
  try {
    return truncate(JSON.stringify(value), 1200);
  } catch {
    return truncate(String(value), 1200);
  }
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 3)}...`;
}

function isFailureEvent(type: string): boolean {
  return type === "workflow.failed" || type.endsWith(".error") || type.endsWith(".failed") || type.endsWith(".invalid");
}
