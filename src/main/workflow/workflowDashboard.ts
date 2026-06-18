import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolveWorkflowApprovalInput, RevalidateWorkflowArtifactInput, ReviewWorkflowArtifactInput, UpdateWorkflowArtifactSourceInput, UpdateWorkflowConnectorGrantInput, WorkflowArtifactSourceProvenance, WorkflowArtifactSummary, WorkflowCompileAuditSummary, WorkflowConnectorDataRetention, WorkflowDashboard, WorkflowRunDetail, WorkflowRunEvent } from "../../shared/workflowTypes";
import { workflowGraphFromSpec } from "../../shared/workflowAgentGraph";
import type { ProjectStore } from "./workflowProjectStoreFacade";
import { generateWorkflowAuditReport, hashWorkflowSource } from "./workflowAuditReport";
import { assertWorkflowArtifactSourceEditable, validateWorkflowProgramIrArtifactFiles, workflowArtifactSourceProvenance } from "./workflowArtifactProvenance";
import { workflowApprovalsFromEvents } from "./workflowApprovals";
import { validateWorkflowSourceConnectorReferences, validateWorkflowSourceReferences } from "../workflow-compiler/workflowCompiler";
import { readWorkflowCheckpointSummaries } from "./workflowCheckpointStore";
import { workflowResumeChainEvents, workflowResumeChainModelCalls } from "./workflowRunChain";
import type { WorkflowConnectorDescriptor } from "./workflowConnectors";

export function readWorkflowDashboard(store: ProjectStore): WorkflowDashboard {
  return {
    artifacts: store.listWorkflowArtifacts().map(workflowArtifactWithCompileAudit),
    runs: store.listWorkflowRuns(),
  };
}

export function readWorkflowRunDetail(store: ProjectStore, runId: string): WorkflowRunDetail {
  const run = store.getWorkflowRun(runId);
  const artifact = store.getWorkflowArtifact(run.artifactId);
  const fullEvents = workflowResumeChainEvents(store, run.id);
  const events = compactWorkflowRunDetailEvents(fullEvents);
  const modelCalls = workflowResumeChainModelCalls(store, run.id);
  const checkpoints = readWorkflowCheckpointSummaries(artifact.statePath);
  const approvals = workflowApprovalsFromEvents(events);
  const sourceProvenance = workflowArtifactSourceProvenance(artifact);
  const compileAudit = readWorkflowCompileAudit(sourceProvenance);
  return {
    artifact: { ...artifact, compileAudit },
    run,
    events,
    modelCalls,
    checkpoints,
    approvals,
    auditReport: generateWorkflowAuditReport({
      artifact,
      run,
      events,
      modelCalls,
      checkpoints,
      approvals,
      sourceHash: readWorkflowSourceHash(artifact.sourcePath),
    }),
    sourceProvenance,
    compileAudit,
    ...readWorkflowSource(artifact.sourcePath),
  };
}

const WORKFLOW_RUN_DETAIL_EVENT_LIMIT = 420;
const WORKFLOW_RUN_DETAIL_EVENT_MESSAGE_PREVIEW_CHARS = 1_600;
const WORKFLOW_RUN_DETAIL_EVENT_DATA_PREVIEW_CHARS = 4_000;
const WORKFLOW_RUN_DETAIL_EVENT_DATA_PREVIEW_TOTAL_CHARS = 8_000;

const WORKFLOW_DETAIL_LOW_VALUE_EVENT_TYPES = new Set([
  "ambient.call.progress",
  "batch.item",
  "collection.map.item",
  "connector.start",
  "desktop-tool.start",
]);

export function compactWorkflowRunDetailEvents(
  events: WorkflowRunEvent[],
  limit = WORKFLOW_RUN_DETAIL_EVENT_LIMIT,
): WorkflowRunEvent[] {
  if (events.length <= limit) return compactWorkflowRunDetailEventPayloads(events);
  const boundedLimit = Math.max(10, Math.floor(limit));
  const omittedCounts = new Map<string, number>();
  let omitted = 0;
  let firstOmitted: WorkflowRunEvent | undefined;
  const projected: WorkflowRunEvent[] = [];
  let summaryInserted = false;

  for (const event of events) {
    if (isLowValueWorkflowRunDetailEvent(event)) {
      omitted += 1;
      omittedCounts.set(event.type, (omittedCounts.get(event.type) ?? 0) + 1);
      firstOmitted ??= event;
      if (!summaryInserted) {
        projected.push(compactedWorkflowRunEvent(events, event, omittedCounts, () => omitted));
        summaryInserted = true;
      }
      continue;
    }
    projected.push(event);
  }

  if (omitted === 0) return compactWorkflowRunDetailEventPayloads(capWorkflowRunDetailEvents(events, boundedLimit));
  if (projected.length <= boundedLimit) {
    return compactWorkflowRunDetailEventPayloads(projected.map((event) => refreshCompactionEvent(event, omittedCounts, omitted)));
  }

  return compactWorkflowRunDetailEventPayloads(
    capWorkflowRunDetailEvents(
      projected.map((event) => refreshCompactionEvent(event, omittedCounts, omitted)),
      boundedLimit,
      firstOmitted,
    ),
  );
}

function isLowValueWorkflowRunDetailEvent(event: WorkflowRunEvent): boolean {
  if (WORKFLOW_DETAIL_LOW_VALUE_EVENT_TYPES.has(event.type)) return true;
  return event.type === "ambient.call.progress" && event.data?.providerStage !== "completed";
}

function compactedWorkflowRunEvent(
  events: WorkflowRunEvent[],
  omittedAt: WorkflowRunEvent,
  omittedCounts: Map<string, number>,
  omittedCount: () => number,
): WorkflowRunEvent {
  return {
    id: `${omittedAt.runId}:workflow-events-compacted`,
    runId: omittedAt.runId,
    artifactId: omittedAt.artifactId,
    seq: omittedAt.seq,
    type: "workflow.events.compacted",
    createdAt: omittedAt.createdAt,
    message: "Compacted noisy run-detail events.",
    data: {
      totalEvents: events.length,
      omittedEvents: omittedCount(),
      omittedEventTypes: Object.fromEntries([...omittedCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
      retainedEventPolicy:
        "Run detail keeps approvals, failures, checkpoints, outputs, connector completions, and high-level stage boundaries while compacting successful per-item progress noise.",
    },
  };
}

function refreshCompactionEvent(event: WorkflowRunEvent, omittedCounts: Map<string, number>, omitted: number): WorkflowRunEvent {
  if (event.type !== "workflow.events.compacted") return event;
  return {
    ...event,
    data: {
      ...event.data,
      omittedEvents: omitted,
      omittedEventTypes: Object.fromEntries([...omittedCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    },
  };
}

function capWorkflowRunDetailEvents(
  events: WorkflowRunEvent[],
  limit: number,
  fallbackEvent?: WorkflowRunEvent,
): WorkflowRunEvent[] {
  if (events.length <= limit) return events;
  const priorityEvents = events.filter((event) => workflowRunDetailEventPriority(event) >= 90);
  if (priorityEvents.length <= limit) return priorityEvents;
  const keepHead = Math.max(1, Math.floor(limit * 0.2));
  const keepTail = Math.max(1, limit - keepHead - 1);
  const omittedAt = fallbackEvent ?? events[keepHead];
  const summary = {
    ...(fallbackEvent ?? events[0]),
    id: `${omittedAt.runId}:workflow-events-hard-cap`,
    seq: omittedAt.seq,
    type: "workflow.events.compacted",
    createdAt: omittedAt.createdAt,
    message: "Capped run-detail evidence after compaction.",
    data: {
      totalEvents: events.length,
      omittedEvents: events.length - keepHead - keepTail,
      retainedEventPolicy: "Run detail exceeded the hard UI evidence cap after semantic compaction; retained the head and tail evidence slices.",
    },
  };
  return [...events.slice(0, keepHead), summary, ...events.slice(-keepTail)];
}

function workflowRunDetailEventPriority(event: WorkflowRunEvent): number {
  if (/error|failed|rejected/i.test(event.type)) return 100;
  if (event.type === "workflow.output.ready") return 100;
  if (event.type.startsWith("approval.") || event.type.startsWith("workflow.input.")) return 100;
  if (event.type === "connector.end" || event.type === "desktop-tool.end" || event.type === "document.render.end") return 95;
  if (event.type.startsWith("workflow.recovery.") || event.type.startsWith("checkpoint.")) return 95;
  if (event.type.startsWith("workflow.") && !event.type.endsWith(".compacted")) return 90;
  if (/\.start$|\.end$|\.resume$/.test(event.type)) return 80;
  return 50;
}

function compactWorkflowRunDetailEventPayloads(events: WorkflowRunEvent[]): WorkflowRunEvent[] {
  return events.map(compactWorkflowRunDetailEventPayload);
}

function compactWorkflowRunDetailEventPayload(event: WorkflowRunEvent): WorkflowRunEvent {
  const message = compactWorkflowRunDetailEventMessage(event.message);
  const data =
    event.data && jsonCharCount(event.data) > WORKFLOW_RUN_DETAIL_EVENT_DATA_PREVIEW_TOTAL_CHARS
      ? (compactWorkflowRunDetailValue(event.data, 0) as Record<string, unknown>)
      : event.data;
  if (message === event.message && data === event.data) return event;
  return {
    ...event,
    ...(message !== undefined ? { message } : {}),
    ...(data ? { data } : {}),
  };
}

function compactWorkflowRunDetailEventMessage(message: string | undefined): string | undefined {
  if (!message || message.length <= WORKFLOW_RUN_DETAIL_EVENT_MESSAGE_PREVIEW_CHARS) return message;
  const headChars = Math.floor(WORKFLOW_RUN_DETAIL_EVENT_MESSAGE_PREVIEW_CHARS * 0.75);
  const tailChars = WORKFLOW_RUN_DETAIL_EVENT_MESSAGE_PREVIEW_CHARS - headChars;
  return `${message.slice(0, headChars)}\n[truncated ${message.length - WORKFLOW_RUN_DETAIL_EVENT_MESSAGE_PREVIEW_CHARS} chars in run-detail message preview]\n${message.slice(-tailChars)}`;
}

function compactWorkflowRunDetailValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    if (value.length <= WORKFLOW_RUN_DETAIL_EVENT_DATA_PREVIEW_CHARS) return value;
    const headChars = Math.floor(WORKFLOW_RUN_DETAIL_EVENT_DATA_PREVIEW_CHARS * 0.75);
    const tailChars = WORKFLOW_RUN_DETAIL_EVENT_DATA_PREVIEW_CHARS - headChars;
    return `${value.slice(0, headChars)}\n[truncated ${value.length - WORKFLOW_RUN_DETAIL_EVENT_DATA_PREVIEW_CHARS} chars in run-detail preview]\n${value.slice(-tailChars)}`;
  }
  if (Array.isArray(value)) {
    const selected = value.slice(0, 12).map((item) => compactWorkflowRunDetailValue(item, depth + 1));
    return value.length > selected.length
      ? { items: selected, totalItems: value.length, truncatedItems: value.length - selected.length }
      : selected;
  }
  if (!value || typeof value !== "object") return value;
  if (depth >= 4) {
    return {
      preview: JSON.stringify(value).slice(0, 800),
      truncated: true,
      originalJsonChars: jsonCharCount(value),
    };
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = compactWorkflowRunDetailValue(item, depth + 1);
  }
  output.__runDetailPreview = {
    truncated: true,
    originalJsonChars: jsonCharCount(value),
  };
  return output;
}

function jsonCharCount(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

export function resolveWorkflowApproval(store: ProjectStore, input: ResolveWorkflowApprovalInput): WorkflowRunDetail {
  const run = store.getWorkflowRun(input.runId);
  const approvals = workflowApprovalsFromEvents(store.listWorkflowRunEvents(run.id));
  const approval = approvals.find((item) => item.id === input.approvalId);
  if (!approval) throw new Error(`Workflow approval not found: ${input.approvalId}`);
  if (approval.status !== "pending") throw new Error(`Workflow approval is already ${approval.status}: ${input.approvalId}`);
  store.appendWorkflowRunEvent({
    runId: run.id,
    type: input.decision === "approved" ? "approval.approved" : "approval.rejected",
    message: input.approvalId,
    data: { id: input.approvalId },
  });
  return readWorkflowRunDetail(store, run.id);
}

export function reviewWorkflowArtifact(store: ProjectStore, input: ReviewWorkflowArtifactInput): WorkflowDashboard {
  const artifact = store.updateWorkflowArtifact({
    id: input.artifactId,
    status: input.decision,
  });
  store.updateWorkflowVersionStatusForArtifact(artifact.id, input.decision);
  const latestRun = store.listWorkflowRuns(artifact.id, 1)[0];
  if (latestRun) {
    store.appendWorkflowRunEvent({
      runId: latestRun.id,
      type: "workflow.artifact_review",
      message: input.decision,
      data: { artifactId: artifact.id, decision: input.decision },
    });
  }
  return readWorkflowDashboard(store);
}

export function updateWorkflowConnectorGrant(store: ProjectStore, input: UpdateWorkflowConnectorGrantInput): WorkflowDashboard {
  const artifact = store.getWorkflowArtifact(input.artifactId);
  if (artifact.status === "archived") throw new Error("Archived workflow artifacts cannot be edited.");
  const connectors = artifact.manifest.connectors ?? [];
  const connectorIndex = connectors.findIndex((connector) => connector.connectorId === input.connectorId && (connector.accountId ?? "") === (input.accountId ?? ""));
  if (connectorIndex < 0) throw new Error(`Workflow connector grant not found: ${input.connectorId}`);
  const current = connectors[connectorIndex];
  if ([input.decision, input.dataRetention, input.removeScope, input.nextAccountId].filter(Boolean).length !== 1) {
    throw new Error("Specify exactly one connector grant update action.");
  }
  if (input.decision === "rejected") {
    const updatedArtifact = store.updateWorkflowArtifact({ id: artifact.id, status: "rejected" });
    const latestRun = store.listWorkflowRuns(updatedArtifact.id, 1)[0];
    if (latestRun) {
      store.appendWorkflowRunEvent({
        runId: latestRun.id,
        type: "workflow.connector_grant_rejected",
        message: `${input.connectorId} rejected`,
        data: {
          artifactId: updatedArtifact.id,
          connectorId: input.connectorId,
          accountId: input.accountId,
          scopes: current.scopes,
          operations: current.operations,
          dataRetention: current.dataRetention,
          status: updatedArtifact.status,
        },
      });
    }
    return readWorkflowDashboard(store);
  }
  if (input.removeScope) {
    if (!current.scopes.includes(input.removeScope)) {
      throw new Error(`Workflow connector grant does not include scope: ${input.connectorId}/${input.removeScope}`);
    }
    const nextScopes = current.scopes.filter((scope) => scope !== input.removeScope);
    const updatedConnectors = connectors.map((connector, index) => (index === connectorIndex ? { ...connector, scopes: nextScopes } : connector));
    const updatedArtifact = store.updateWorkflowArtifact({
      id: artifact.id,
      status: "rejected",
      manifest: { ...artifact.manifest, connectors: updatedConnectors },
    });
    const latestRun = store.listWorkflowRuns(updatedArtifact.id, 1)[0];
    if (latestRun) {
      store.appendWorkflowRunEvent({
        runId: latestRun.id,
        type: "workflow.connector_grant_scope_removed",
        message: `${input.connectorId} scope removed: ${input.removeScope}`,
        data: {
          artifactId: updatedArtifact.id,
          connectorId: input.connectorId,
          accountId: input.accountId,
          removedScope: input.removeScope,
          previousScopes: current.scopes,
          scopes: nextScopes,
          operations: current.operations,
          dataRetention: current.dataRetention,
          status: updatedArtifact.status,
          reason: "Recompile required before this connector can run.",
        },
      });
    }
    return readWorkflowDashboard(store);
  }
  if (input.nextAccountId) {
    const previousAccountId = current.accountId;
    if (input.nextAccountId === (previousAccountId ?? "")) return readWorkflowDashboard(store);
    const updatedConnectors = connectors.map((connector, index) => (index === connectorIndex ? { ...connector, accountId: input.nextAccountId } : connector));
    const updatedArtifact = store.updateWorkflowArtifact({
      id: artifact.id,
      status: "ready_for_preview",
      manifest: { ...artifact.manifest, connectors: updatedConnectors },
    });
    const latestRun = store.listWorkflowRuns(updatedArtifact.id, 1)[0];
    if (latestRun) {
      store.appendWorkflowRunEvent({
        runId: latestRun.id,
        type: "workflow.connector_grant_account_selected",
        message: `${input.connectorId} account ${previousAccountId ?? "runtime"} -> ${input.nextAccountId}`,
        data: {
          artifactId: updatedArtifact.id,
          connectorId: input.connectorId,
          previousAccountId,
          accountId: input.nextAccountId,
          scopes: current.scopes,
          operations: current.operations,
          dataRetention: current.dataRetention,
          status: updatedArtifact.status,
        },
      });
    }
    return readWorkflowDashboard(store);
  }
  if (!input.dataRetention) throw new Error("Connector grant update requires an action.");
  const dataRetention = input.dataRetention;
  if (retentionRank(dataRetention) > retentionRank(current.dataRetention)) {
    throw new Error("Connector retention can only be downgraded from the generated preview.");
  }
  if (dataRetention === current.dataRetention) return readWorkflowDashboard(store);
  const updatedConnectors = connectors.map((connector, index) => (index === connectorIndex ? { ...connector, dataRetention } : connector));
  const updatedArtifact = store.updateWorkflowArtifact({
    id: artifact.id,
    status: "ready_for_preview",
    manifest: { ...artifact.manifest, connectors: updatedConnectors },
  });
  const latestRun = store.listWorkflowRuns(updatedArtifact.id, 1)[0];
  if (latestRun) {
    store.appendWorkflowRunEvent({
      runId: latestRun.id,
      type: "workflow.connector_grant_updated",
      message: `${input.connectorId} retention ${current.dataRetention} -> ${dataRetention}`,
      data: {
        artifactId: updatedArtifact.id,
        connectorId: input.connectorId,
        accountId: input.accountId,
        previousDataRetention: current.dataRetention,
        dataRetention,
        status: updatedArtifact.status,
      },
    });
  }
  return readWorkflowDashboard(store);
}

export function revalidateWorkflowArtifact(
  store: ProjectStore,
  input: RevalidateWorkflowArtifactInput,
  options: { connectorDescriptors?: WorkflowConnectorDescriptor[] } = {},
): WorkflowDashboard {
  const artifact = store.getWorkflowArtifact(input.artifactId);
  if (artifact.status === "archived") throw new Error("Archived workflow artifacts cannot be revalidated.");
  const latestRun = store.listWorkflowRuns(artifact.id, 1)[0];
  try {
    const provenance = validateWorkflowProgramIrArtifactFiles(artifact);
    const source = readFileSync(artifact.sourcePath, "utf8");
    validateWorkflowSourceReferences(source, artifact.manifest);
    validateWorkflowSourceConnectorReferences(source, artifact.manifest, options.connectorDescriptors ?? []);
    const updatedArtifact = store.updateWorkflowArtifact({ id: artifact.id, status: "ready_for_preview" });
    if (latestRun) {
      store.appendWorkflowRunEvent({
        runId: latestRun.id,
        type: "workflow.artifact_revalidated",
        message: provenance.validationMode === "program_ir_artifact" ? "program_ir_ready_for_preview" : "ready_for_preview",
        data: {
          artifactId: updatedArtifact.id,
          sourcePath: updatedArtifact.sourcePath,
          status: updatedArtifact.status,
          requiresApproval: true,
          validationMode: provenance.validationMode,
          sourceEditable: provenance.editable,
          loweredPlanPath: provenance.loweredPlanPath,
          repairHistoryPath: provenance.repairHistoryPath,
          validationReportPath: provenance.validationReportPath,
        },
      });
    }
  } catch (error) {
    const updatedArtifact = store.updateWorkflowArtifact({ id: artifact.id, status: "rejected" });
    if (latestRun) {
      store.appendWorkflowRunEvent({
        runId: latestRun.id,
        type: "workflow.artifact_revalidation_failed",
        message: errorMessage(error),
        data: {
          artifactId: updatedArtifact.id,
          sourcePath: updatedArtifact.sourcePath,
          status: updatedArtifact.status,
        },
      });
    }
  }
  return readWorkflowDashboard(store);
}

export function updateWorkflowArtifactSource(
  store: ProjectStore,
  input: UpdateWorkflowArtifactSourceInput,
  options: { connectorDescriptors?: WorkflowConnectorDescriptor[] } = {},
): WorkflowDashboard {
  const artifact = store.getWorkflowArtifact(input.artifactId);
  if (artifact.status === "archived") throw new Error("Archived workflow artifacts cannot be edited.");
  assertWorkflowArtifactSourceEditable(artifact);
  writeFileSync(artifact.sourcePath, input.source, "utf8");
  return revalidateWorkflowArtifact(store, { artifactId: input.artifactId }, options);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function retentionRank(retention: WorkflowConnectorDataRetention): number {
  if (retention === "none") return 0;
  if (retention === "redacted_audit") return 1;
  return 2;
}

export function createWorkflowSampleArtifact(store: ProjectStore, workspaceRoot: string): WorkflowDashboard {
  const id = `workflow-sample-${randomUUID()}`;
  const artifactRoot = join(workspaceRoot, ".ambient-codex", "workflows", id);
  const reportPath = join(artifactRoot, "reports", "preview.md");
  mkdirSync(join(artifactRoot, "reports"), { recursive: true });
  writeFileSync(
    join(artifactRoot, "main.ts"),
    `export default async function run({ workflow, connectors }) {
  await workflow.step("preview audit", async () => {
    const inventory = await connectors.call({ connectorId: "workspace.inventory", operation: "listFiles", input: { maxEntries: 25 } });
    await workflow.checkpoint("workspaceInventory", {
      rootName: inventory.rootName,
      count: inventory.entries.length,
      truncated: inventory.truncated
    });
    await workflow.requireApproval({ kind: "sample-review", summary: "Review the sample staged workflow evidence before applying mutations." });
    const sample = await workflow.resumePoint("sample", async () => {
      await workflow.emit({ type: "sample.preview", message: "Runnable sample workflow executed." });
      return { ok: true };
    });
    await workflow.emit({ type: "sample.result", message: sample.ok ? "ok" : "unknown" });
  });
}
`,
    "utf8",
  );
  writeFileSync(
    reportPath,
    [
      "# Workflow Agent Preview Audit",
      "",
      "The deterministic sample workflow compiled successfully and produced retained run evidence for UI review.",
      "",
      "## Evidence",
      "",
      "- Manifest tools, connector scopes, and mutation policy were registered before the run.",
      "- A compiler planning model call completed with high confidence.",
      "- The run reached `succeeded` and retained this report as an inspectable artifact.",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(artifactRoot, "manifest.json"), `${JSON.stringify(sampleManifest(), null, 2)}\n`, "utf8");
  writeFileSync(join(artifactRoot, "spec.json"), `${JSON.stringify(sampleSpec(), null, 2)}\n`, "utf8");
  const artifact = store.createWorkflowArtifact({
    id,
    title: "Workflow Agent tool bridge preview",
    status: "ready_for_preview",
    manifest: sampleManifest(),
    spec: sampleSpec(),
    sourcePath: join(artifactRoot, "main.ts"),
    statePath: join(artifactRoot, "state.json"),
  });
  if (artifact.workflowThreadId) {
    const graph = workflowGraphFromSpec({ title: artifact.title, spec: artifact.spec, manifest: artifact.manifest });
    const graphSnapshot = store.createWorkflowGraphSnapshot({
      workflowThreadId: artifact.workflowThreadId,
      source: "compile",
      summary: graph.summary,
      nodes: graph.nodes,
      edges: graph.edges,
      artifactPath: artifactRoot,
    });
    writeFileSync(join(artifactRoot, "graph.json"), `${JSON.stringify(graphSnapshot, null, 2)}\n`, "utf8");
  }
  const run = store.startWorkflowRun({ artifactId: artifact.id, status: "previewed" });
  store.appendWorkflowRunEvent({
    runId: run.id,
    type: "workflow.compile",
    message: "Generated deterministic workflow program from a user request.",
    data: { sourcePath: artifact.sourcePath },
  });
  store.appendWorkflowRunEvent({
    runId: run.id,
    type: "workflow.manifest",
    message: "Registered Desktop tool allowlist for the run.",
    data: { tools: artifact.manifest.tools, connectors: artifact.manifest.connectors, mutationPolicy: artifact.manifest.mutationPolicy },
  });
  store.recordWorkflowModelCall({
    runId: run.id,
    task: "compiler.plan",
    status: "succeeded",
    input: { request: "Build a local workflow preview artifact." },
    output: { programShape: "deterministic steps plus structured Ambient calls", confidence: 0.92 },
    cacheKey: "workflow-sample-preview",
    model: "ambient-preview",
    latencyMs: 240,
  });
  store.appendWorkflowRunEvent({
    runId: run.id,
    type: "workflow.audit",
    message: "Audit report is available for preview.",
    data: { reportPath },
  });
  store.updateWorkflowRun({
    id: run.id,
    status: "succeeded",
    reportPath,
    finish: true,
  });
  return readWorkflowDashboard(store);
}

function readWorkflowSourceHash(sourcePath: string): string | undefined {
  try {
    return hashWorkflowSource(readFileSync(sourcePath, "utf8"));
  } catch {
    return undefined;
  }
}

function readWorkflowSource(sourcePath: string): { sourceContent: string } | { sourceReadError: string } {
  try {
    return { sourceContent: readFileSync(sourcePath, "utf8") };
  } catch (error) {
    return { sourceReadError: error instanceof Error ? error.message : String(error) };
  }
}

function workflowArtifactWithCompileAudit(artifact: WorkflowArtifactSummary): WorkflowArtifactSummary {
  return {
    ...artifact,
    compileAudit: readWorkflowCompileAudit(workflowArtifactSourceProvenance(artifact)),
  };
}

function readWorkflowCompileAudit(provenance: WorkflowArtifactSourceProvenance): WorkflowCompileAuditSummary | undefined {
  const compileContext = readJsonRecord(provenance.compileContextPath);
  const promptAssembly = readJsonRecord(provenance.promptAssemblyPath) ?? asRecord(compileContext?.promptAssembly);
  const validationReport = readJsonRecord(provenance.validationReportPath);
  if (!compileContext && !promptAssembly && !validationReport) return undefined;

  const modules = arrayRecords(promptAssembly?.modules).map((module) => ({
    id: stringValue(module.id) ?? "unknown-module",
    layer: stringValue(module.layer),
    scope: stringValue(module.scope),
    reason: stringValue(module.reason),
    ruleIds: stringArray(module.ruleIds),
    selectedRecipeIds: stringArray(module.selectedRecipeIds),
    selectedToolNames: stringArray(module.selectedToolNames),
    selectedConnectorIds: stringArray(module.selectedConnectorIds),
  }));
  const recipeSelection = asRecord(compileContext?.recipeSelection);
  const recipeSelectionSummary = asRecord(recipeSelection?.summary);
  const selectedRecipes = arrayRecords(compileContext?.selectedRecipes);
  const selectedRecipeIds = uniqueStrings([
    ...stringArray(recipeSelectionSummary?.selectedRecipeIds),
    ...arrayRecords(recipeSelection?.selected).map((recipe) => stringValue(recipe.id)).filter((id): id is string => Boolean(id)),
    ...selectedRecipes.map((recipe) => stringValue(recipe.id)).filter((id): id is string => Boolean(id)),
    ...modules.flatMap((module) => module.selectedRecipeIds),
  ]);
  const rejectedRecipeIds = uniqueStrings([
    ...stringArray(recipeSelectionSummary?.rejectedRecipeIds),
    ...arrayRecords(recipeSelection?.rejected).map((recipe) => stringValue(recipe.id)).filter((id): id is string => Boolean(id)),
  ]);
  const policyImplicationIds = uniqueStrings(arrayRecords(recipeSelection?.policyImplications).map((implication) => stringValue(implication.id)).filter((id): id is string => Boolean(id)));
  const validators = arrayRecords(validationReport?.validators);
  const validationEvidence = asRecord(validationReport?.evidence);
  const diagnosticSummary = asRecord(validationReport?.diagnosticSummary);

  return {
    compilerMode: stringValue(compileContext?.compilerMode) ?? provenance.compilerMode,
    compileContextPath: provenance.compileContextPath,
    promptAssemblyPath: provenance.promptAssemblyPath,
    validationReportPath: provenance.validationReportPath,
    promptModuleCount: numberValue(asRecord(promptAssembly?.total)?.moduleCount) ?? modules.length,
    stablePrefixModuleCount: numberValue(asRecord(promptAssembly?.stablePrefix)?.moduleCount),
    mutableSuffixModuleCount: numberValue(asRecord(promptAssembly?.mutableSuffix)?.moduleCount),
    promptModules: modules,
    selectedRecipeIds,
    rejectedRecipeIds,
    policyImplicationIds,
    validatorIds: uniqueStrings(validators.map((validator) => stringValue(validator.id)).filter((id): id is string => Boolean(id))),
    failedValidatorIds: uniqueStrings(
      validators
        .filter((validator) => stringValue(validator.status) === "failed")
        .map((validator) => stringValue(validator.id))
        .filter((id): id is string => Boolean(id)),
    ),
    validationStatus: stringValue(validationReport?.status),
    diagnosticCount: numberValue(diagnosticSummary?.diagnosticCount),
    mutationPolicy: stringValue(validationEvidence?.mutationPolicy),
    connectorOperationCount: arrayRecords(validationEvidence?.connectorOperations).length,
    connectorWriteOperationCount: arrayRecords(validationEvidence?.connectorWriteOperations).length,
  };
}

function readJsonRecord(path: string | undefined): Record<string, unknown> | undefined {
  if (!path || !existsSync(path)) return undefined;
  try {
    return asRecord(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function stringValue(value: unknown, fallback?: string): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sampleManifest() {
  return {
    tools: ["bash", "browser_screenshot", "ambient.responses"],
    connectors: [
      {
        connectorId: "workspace.inventory",
        accountId: "workspace",
        scopes: ["workspace.files.read"],
        operations: ["listFiles"],
        dataRetention: "redacted_audit" as const,
      },
    ],
    mutationPolicy: "staged_until_approved" as const,
    maxToolCalls: 6,
    maxModelCalls: 2,
    maxConnectorCalls: 2,
    maxRunMs: 120_000,
    requiresReviewBelowConfidence: 0.75,
  };
}

function sampleSpec() {
  return {
    goal: "Demonstrate a deterministic workflow program that calls registered Ambient Desktop tools and records auditable Ambient model calls.",
    summary: "Local preview artifact for Workflow Agent dashboard, tool manifest, and audit report plumbing.",
    successCriteria: [
      "The workflow declares every desktop tool it may call.",
      "The workflow declares exact connector scopes and retention policy before connector calls run.",
      "The run log records deterministic steps and Ambient model calls.",
      "The audit report can be inspected before mutation-oriented workflows are enabled.",
    ],
    inputs: { connectorReview: "workspace inventory only; account connectors remain post-MVP" },
  };
}
