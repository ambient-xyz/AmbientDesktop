import { createHash } from "node:crypto";
import type { WorkflowApprovalSummary, WorkflowArtifactSummary, WorkflowCheckpointSummary, WorkflowModelCallRecord, WorkflowRunEvent, WorkflowRunSummary } from "../../shared/workflowTypes";

export interface WorkflowAuditReportInput {
  artifact: WorkflowArtifactSummary;
  run: WorkflowRunSummary;
  events: WorkflowRunEvent[];
  modelCalls: WorkflowModelCallRecord[];
  checkpoints?: WorkflowCheckpointSummary[];
  approvals?: WorkflowApprovalSummary[];
  sourceHash?: string;
}

export function generateWorkflowAuditReport(input: WorkflowAuditReportInput): string {
  return [
    `# ${input.artifact.title} Audit Report`,
    "",
    "## Run",
    "",
    `- Workflow: ${input.artifact.id}`,
    `- Run: ${input.run.id}`,
    `- Status: ${input.run.status}`,
    `- Started: ${input.run.startedAt}`,
    input.run.completedAt ? `- Completed: ${input.run.completedAt}` : undefined,
    input.run.error ? `- Error: ${input.run.error}` : undefined,
    input.run.reportPath ? `- Report path: ${input.run.reportPath}` : undefined,
    `- Source path: ${input.artifact.sourcePath}`,
    input.sourceHash ? `- Source sha256: ${input.sourceHash}` : undefined,
    `- State path: ${input.artifact.statePath}`,
    "",
    "## Manifest",
    "",
    `- Mutation policy: ${input.artifact.manifest.mutationPolicy}`,
    `- Tools: ${input.artifact.manifest.tools.length > 0 ? input.artifact.manifest.tools.join(", ") : "none"}`,
    `- Connectors: ${connectorLines(input.artifact.manifest.connectors)}`,
    `- Ambient CLI capabilities: ${ambientCliCapabilityLines(input.artifact.manifest.ambientCliCapabilities)}`,
    input.artifact.manifest.maxToolCalls !== undefined ? `- Max tool calls: ${input.artifact.manifest.maxToolCalls}` : undefined,
    input.artifact.manifest.maxModelCalls !== undefined ? `- Max model calls: ${input.artifact.manifest.maxModelCalls}` : undefined,
    input.artifact.manifest.maxConnectorCalls !== undefined ? `- Max connector calls: ${input.artifact.manifest.maxConnectorCalls}` : undefined,
    "",
    "## Goal",
    "",
    input.artifact.spec.goal,
    ...successCriteriaLines(input.artifact.spec.successCriteria),
    "",
    "## Checkpoints",
    "",
    ...checkpointLines(input.checkpoints ?? []),
    "",
    "## Review Queue",
    "",
    ...approvalLines(input.approvals ?? []),
    "",
    "## Retention",
    "",
    ...retentionLines(input),
    "",
    "## Event Timeline",
    "",
    ...eventLines(input.events),
    "",
    "## Ambient Model Calls",
    "",
    ...modelCallLines(input.modelCalls),
    "",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function retentionLines(input: WorkflowAuditReportInput): string[] {
  const manifestRetention = retentionCounts((input.artifact.manifest.connectors ?? []).map((connector) => connector.dataRetention));
  const connectorEventRetention = retentionCounts(
    input.events
      .filter((event) => event.type === "connector.start" || event.type === "connector.end" || event.type === "connector.error")
      .map((event) => stringRecordValue(event.data)?.dataRetention)
      .filter((value): value is string => typeof value === "string"),
  );
  const compactedEvents = input.events.filter((event) => compactedPayload(event.data)).length;
  const compactedModelCalls = input.modelCalls.filter((call) => compactedPayload(call.input) || compactedPayload(call.output)).length;
  return [
    `- Manifest connector retention: omitted=${manifestRetention.none}, redacted=${manifestRetention.redacted_audit}, run_artifact=${manifestRetention.run_artifact}`,
    `- Connector call audit retention: omitted=${connectorEventRetention.none}, redacted=${connectorEventRetention.redacted_audit}, run_artifact=${connectorEventRetention.run_artifact}`,
    `- Expired payload compaction: events=${compactedEvents}, model_calls=${compactedModelCalls}`,
    "- Policy: retention=none omits connector values from audit output; retention=redacted_audit keeps redacted summaries; retention=run_artifact may retain raw connector values in run artifacts.",
  ];
}

export function hashWorkflowSource(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function successCriteriaLines(criteria: string[] | undefined): string[] {
  if (!criteria?.length) return [];
  return ["", "Success criteria:", ...criteria.map((item) => `- ${item}`)];
}

function connectorLines(connectors: WorkflowArtifactSummary["manifest"]["connectors"]): string {
  if (!connectors?.length) return "none";
  return connectors
    .map((connector) => {
      const account = connector.accountId ? ` account=${connector.accountId}` : "";
      const retention = ` retention=${connector.dataRetention}`;
      return `${connector.connectorId}${account} ops=${connector.operations.join("+") || "none"} scopes=${connector.scopes.join("+") || "none"}${retention}`;
    })
    .join("; ");
}

function ambientCliCapabilityLines(capabilities: WorkflowArtifactSummary["manifest"]["ambientCliCapabilities"]): string {
  if (!capabilities?.length) return "none";
  return capabilities
    .map((capability) => `${capability.packageName}:${capability.command} capability=${capability.capabilityId} plugin=${capability.registryPluginId}`)
    .join("; ");
}

function checkpointLines(checkpoints: WorkflowCheckpointSummary[]): string[] {
  if (checkpoints.length === 0) return ["No checkpoints were recorded."];
  return checkpoints.map((checkpoint, index) => {
    const updated = checkpoint.updatedAt ? ` (${checkpoint.updatedAt})` : "";
    return `${index + 1}. ${checkpoint.key}${updated}: ${checkpoint.valuePreview}`;
  });
}

function approvalLines(approvals: WorkflowApprovalSummary[]): string[] {
  if (approvals.length === 0) return ["No review items were recorded."];
  return approvals.map((approval, index) => {
    const decided = approval.decidedAt ? ` decided ${approval.decidedAt}` : "";
    return `${index + 1}. ${approval.id} - ${approval.status}${decided}: ${approval.changeSetPreview}`;
  });
}

function eventLines(events: WorkflowRunEvent[]): string[] {
  if (events.length === 0) return ["No workflow events were recorded."];
  return events.map((event) => {
    const message = event.message ? ` - ${event.message}` : "";
    const data = event.data ? ` ${inlineJson(event.data)}` : "";
    return `${event.seq}. ${event.createdAt} ${event.type}${message}${data}`;
  });
}

function modelCallLines(modelCalls: WorkflowModelCallRecord[]): string[] {
  if (modelCalls.length === 0) return ["No Ambient model calls were recorded."];
  return modelCalls.map((call, index) =>
    [
      `${index + 1}. ${call.task}`,
      `   - Status: ${call.status}`,
      call.model ? `   - Model: ${call.model}` : undefined,
      call.cacheKey ? `   - Cache key: ${call.cacheKey}` : undefined,
      `   - Latency: ${call.latencyMs}ms`,
      call.validationError ? `   - Validation error: ${call.validationError}` : undefined,
      `   - Input: ${inlineJson(call.input)}`,
      call.output !== undefined ? `   - Output: ${inlineJson(call.output)}` : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n"),
  );
}

function retentionCounts(values: string[]): { none: number; redacted_audit: number; run_artifact: number } {
  return {
    none: values.filter((value) => value === "none").length,
    redacted_audit: values.filter((value) => value === "redacted_audit").length,
    run_artifact: values.filter((value) => value === "run_artifact").length,
  };
}

function stringRecordValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function compactedPayload(value: unknown): boolean {
  const record = stringRecordValue(value);
  return record?.retention === "compacted" && record.reason === "workflow_trace_retention_expired";
}

function inlineJson(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json.length <= 500 ? json : `${json.slice(0, 497)}...`;
  } catch {
    return String(value);
  }
}
