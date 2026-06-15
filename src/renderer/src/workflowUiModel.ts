import type { WorkflowManifest, WorkflowRunEvent } from "../../shared/types";

export interface WorkflowConnectorCallSummary {
  id: string;
  operationLabel: string;
  statusLabel: string;
  metadataLabels: string[];
  retentionSummary?: string;
  inputSummary?: string;
  outputSummary?: string;
  errorSummary?: string;
}

export interface WorkflowAmbientCliCallSummary {
  id: string;
  operationLabel: string;
  statusLabel: string;
  metadataLabels: string[];
  argsSummary?: string;
  commandSummary?: string;
  stdoutSummary?: string;
  stderrSummary?: string;
  artifactLabels: string[];
  errorSummary?: string;
}

export interface WorkflowAmbientCliCapabilityRow {
  id: string;
  operationLabel: string;
  metadataLabels: string[];
  grantLabel: string;
}

export interface WorkflowStepSummary {
  id: string;
  name: string;
  statusLabel: string;
  metadataLabels: string[];
}

export interface WorkflowRunEventSummaryCard {
  id: string;
  title: string;
  detail: string;
  tone: "neutral" | "running" | "success" | "warning" | "danger";
  metadataLabels: string[];
  payloadPreview?: string;
}

const EVENT_PAYLOAD_PREVIEW_FIELDS = 6;
const EVENT_PAYLOAD_PREVIEW_CHARS = 520;

export function workflowRunEventSummaryCards(events: WorkflowRunEvent[], limit = 10): WorkflowRunEventSummaryCard[] {
  return events.slice(-Math.max(1, limit)).map((event) => {
    const detailLabels = workflowRunEventDetailLabels(event);
    return {
      id: event.id,
      title: workflowRunEventTitle(event),
      detail: event.message?.trim() || workflowRunEventFallbackDetail(event),
      tone: workflowRunEventTone(event),
      metadataLabels: [
        `#${event.seq}`,
        event.graphNodeId ? `node ${event.graphNodeId}` : undefined,
        event.itemKey ? `item ${event.itemKey}` : undefined,
        ...detailLabels,
      ].filter((label): label is string => Boolean(label)).slice(0, 8),
      payloadPreview: workflowRunEventPayloadPreview(event.data, detailLabels),
    };
  });
}

export function workflowRunEventDetailLabels(event: Pick<WorkflowRunEvent, "type" | "data">): string[] {
  const data = recordValue(event.data);
  if (event.type === "ambient.call.progress") {
    const labels: string[] = [];
    const stage = stringValue(data?.providerStage);
    const outputChars = numberValue(data?.outputChars);
    const thinkingChars = numberValue(data?.thinkingChars);
    const elapsedMs = numberValue(data?.providerElapsedMs);
    const idleElapsedMs = numberValue(data?.idleElapsedMs);
    const idleTimeoutMs = numberValue(data?.idleTimeoutMs);
    const timeoutMode = stringValue(data?.timeoutMode);
    if (stage) labels.push(`stream ${formatLabelValue(stage)}`);
    if (outputChars !== undefined) labels.push(`output ${Math.max(0, Math.round(outputChars)).toLocaleString()} chars`);
    if (thinkingChars !== undefined) labels.push(`thinking ${Math.max(0, Math.round(thinkingChars)).toLocaleString()} chars`);
    if (idleElapsedMs !== undefined && idleTimeoutMs !== undefined) {
      labels.push(`idle ${formatDuration(idleElapsedMs)} / ${formatDuration(idleTimeoutMs)} timeout`);
    }
    if (elapsedMs !== undefined) labels.push(`elapsed ${formatDuration(elapsedMs)}`);
    if (timeoutMode) labels.push(`timeout ${formatTimeoutMode(timeoutMode)}`);
    return labels;
  }
  if (event.type === "ambient.call.error") {
    const labels: string[] = [];
    const attempt = numberValue(data?.attempt);
    const retryable = typeof data?.retryable === "boolean" ? data.retryable : undefined;
    const willRetry = typeof data?.willRetry === "boolean" ? data.willRetry : undefined;
    const error = stringValue(data?.error);
    if (attempt !== undefined) labels.push(`attempt ${Math.max(0, Math.round(attempt)).toLocaleString()}`);
    if (retryable !== undefined) labels.push(retryable ? "retryable provider error" : "not retryable");
    if (willRetry !== undefined) labels.push(willRetry ? "will retry" : "final attempt");
    if (error) labels.push(`error ${compactError(error)}`);
    return labels;
  }
  if (event.type === "workflow.run-limits") {
    const labels: string[] = [];
    const idleTimeoutMs = numberValue(data?.idleTimeoutMs);
    const maxRunMs = numberValue(data?.maxRunMs);
    const totalRuntimeLimitEnabled = typeof data?.totalRuntimeLimitEnabled === "boolean" ? data.totalRuntimeLimitEnabled : undefined;
    const totalRuntimeLimitSource = stringValue(data?.totalRuntimeLimitSource);
    if (idleTimeoutMs !== undefined) labels.push(`idle timeout ${formatDuration(idleTimeoutMs)}`);
    if (totalRuntimeLimitEnabled === false) labels.push("total runtime cap off");
    if (maxRunMs !== undefined) labels.push(`total cap ${formatDuration(maxRunMs)}`);
    if (totalRuntimeLimitSource) labels.push(`source ${formatLabelValue(totalRuntimeLimitSource)}`);
    return labels;
  }
  if (event.type === "workflow.schedule.started" || event.type === "workflow.schedule.skipped") return workflowScheduleEventDetailLabels(data);
  if (event.type !== "workflow.plugin-requirements") return [];
  const blockers = arrayValue(data?.blockers).map((blocker) => recordValue(blocker)).filter((blocker): blocker is Record<string, unknown> => Boolean(blocker));
  if (blockers.length > 0) {
    return blockers.map((blocker) => {
      const registeredName = stringValue(blocker.registeredName) ?? "plugin tool";
      const reason = stringValue(blocker.reason) ?? "Requirement is blocked.";
      const availability = stringValue(blocker.availability);
      return availability ? `${registeredName}: ${reason} (${availability})` : `${registeredName}: ${reason}`;
    });
  }
  const count = numberValue(data?.count);
  if (count !== undefined) return [`${count} plugin requirement${count === 1 ? "" : "s"} validated`];
  return [];
}

function workflowRunEventTitle(event: Pick<WorkflowRunEvent, "type">): string {
  if (event.type === "ambient.call.progress") return "Ambient stream progress";
  if (event.type === "ambient.call.error") return "Ambient provider error";
  if (event.type === "workflow.input.required" || event.type === "workflow.awaiting_input") return "Workflow needs input";
  if (event.type === "workflow.output.ready") return "Output ready";
  if (event.type === "workflow.review_ready" || event.type === "approval.required") return "Review required";
  if (event.type === "workflow.timeout") return "Runtime limit reached";
  if (event.type === "workflow.succeeded") return "Workflow succeeded";
  if (event.type === "workflow.failed") return "Workflow failed";
  if (event.type === "workflow.canceled") return "Workflow canceled";
  if (event.type === "checkpoint.write") return "Checkpoint saved";
  if (event.type === "step.start") return "Step started";
  if (event.type === "step.end") return "Step completed";
  if (event.type === "step.paused") return "Step paused";
  if (event.type === "step.error") return "Step failed";
  if (event.type === "connector.start") return "Connector call started";
  if (event.type === "connector.end") return "Connector call completed";
  if (event.type === "connector.error") return "Connector call failed";
  if (event.type.endsWith(".start")) return `${formatLabelValue(event.type.replace(/\.start$/, ""))} started`;
  if (event.type.endsWith(".end")) return `${formatLabelValue(event.type.replace(/\.end$/, ""))} completed`;
  if (event.type.endsWith(".error") || event.type.endsWith(".failed")) return `${formatLabelValue(event.type.replace(/\.(error|failed)$/, ""))} failed`;
  return formatLabelValue(event.type);
}

function workflowRunEventFallbackDetail(event: Pick<WorkflowRunEvent, "type" | "seq">): string {
  return `${formatLabelValue(event.type)} event ${event.seq}`;
}

function workflowRunEventTone(event: Pick<WorkflowRunEvent, "type">): WorkflowRunEventSummaryCard["tone"] {
  if (event.type === "workflow.failed" || event.type.endsWith(".failed") || event.type.endsWith(".error") || event.type.endsWith(".invalid")) return "danger";
  if (event.type === "workflow.timeout" || event.type === "workflow.input.required" || event.type === "workflow.awaiting_input" || event.type === "step.paused") return "warning";
  if (event.type === "ambient.call.progress" || event.type.endsWith(".start")) return "running";
  if (event.type === "workflow.succeeded" || event.type === "workflow.output.ready" || event.type.endsWith(".end") || event.type === "checkpoint.write") return "success";
  return "neutral";
}

function workflowRunEventPayloadPreview(value: unknown, detailLabels: string[]): string | undefined {
  if (detailLabels.length > 0) return undefined;
  const summary = compactWorkflowPayload(value);
  if (!summary || summary === "{}") return undefined;
  return summary.length > EVENT_PAYLOAD_PREVIEW_CHARS ? `${summary.slice(0, EVENT_PAYLOAD_PREVIEW_CHARS).trimEnd()}...` : summary;
}

function compactWorkflowPayload(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return compactText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "No items";
    const firstItems = value.slice(0, 3).map((item, index) => compactWorkflowPayloadListItem(item, index)).filter(Boolean);
    const suffix = value.length > firstItems.length ? `; +${value.length - firstItems.length} more` : "";
    return `${value.length} item${value.length === 1 ? "" : "s"}${firstItems.length ? `: ${firstItems.join("; ")}` : ""}${suffix}`;
  }
  if (typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const entries = Object.entries(record).filter(([, item]) => item !== undefined && typeof item !== "function");
  if (entries.length === 0) return undefined;
  const parts = entries.slice(0, EVENT_PAYLOAD_PREVIEW_FIELDS).map(([key, item]) => `${formatLabelValue(key)}: ${compactWorkflowPayloadValue(item)}`);
  const suffix = entries.length > EVENT_PAYLOAD_PREVIEW_FIELDS ? `; +${entries.length - EVENT_PAYLOAD_PREVIEW_FIELDS} more field${entries.length - EVENT_PAYLOAD_PREVIEW_FIELDS === 1 ? "" : "s"}` : "";
  return `${parts.join("; ")}${suffix}`;
}

function compactWorkflowPayloadListItem(value: unknown, index: number): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return compactWorkflowPayloadValue(value);
  const record = value as Record<string, unknown>;
  const title = stringValue(record.title) ?? stringValue(record.name) ?? stringValue(record.label) ?? stringValue(record.file) ?? stringValue(record.path) ?? `item ${index + 1}`;
  const summary = stringValue(record.summary) ?? stringValue(record.description) ?? stringValue(record.classification) ?? stringValue(record.status) ?? stringValue(record.reason);
  return summary ? `${title}: ${compactText(summary, 96)}` : compactText(title, 96);
}

function compactWorkflowPayloadValue(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "string") return compactText(value, isLikelyLargePayloadKey(value) ? 72 : 120);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const summary = stringValue(record.summary) ?? stringValue(record.description) ?? stringValue(record.textExcerpt) ?? stringValue(record.status) ?? stringValue(record.error);
    if (summary) return compactText(summary, 120);
    if (Object.keys(record).length <= 3) {
      const nested = compactWorkflowPayload(record);
      if (nested) return nested;
    }
    return `${Object.keys(record).length} field${Object.keys(record).length === 1 ? "" : "s"}`;
  }
  return String(value);
}

function compactText(value: string, limit = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trimEnd()}...` : normalized;
}

function isLikelyLargePayloadKey(value: string): boolean {
  return value.length > 500 || /^\s*<!doctype html/i.test(value) || /^\s*<html[\s>]/i.test(value) || /^\s{0,3}#/m.test(value);
}

function workflowScheduleEventDetailLabels(data: Record<string, unknown> | undefined): string[] {
  const labels: string[] = [];
  const scheduleId = stringValue(data?.scheduleId);
  const targetKind = stringValue(data?.targetKind);
  const targetVersionId = stringValue(data?.targetVersionId) ?? stringValue(data?.versionId);
  const createdTargetVersionId = stringValue(data?.createdTargetVersionId);
  const grantDecisionSource = stringValue(data?.grantDecisionSource);
  const grantTargets = arrayValue(data?.grantTargets).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const connectorTargets = arrayValue(data?.connectorTargets).filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (scheduleId) labels.push(`schedule ${scheduleId}`);
  if (targetKind) labels.push(`target ${formatLabelValue(targetKind)}`);
  if (targetVersionId) labels.push(`target version ${targetVersionId}`);
  if (createdTargetVersionId && createdTargetVersionId !== targetVersionId) labels.push(`created at version ${createdTargetVersionId}`);
  if (grantDecisionSource) labels.push(`grant ${formatGrantDecisionSource(grantDecisionSource)}`);
  if (grantTargets.length > 0) labels.push(`grant target${grantTargets.length === 1 ? "" : "s"} ${compactList(grantTargets)}`);
  if (grantTargets.length === 0 && connectorTargets.length > 0) labels.push(`connector target${connectorTargets.length === 1 ? "" : "s"} ${compactList(connectorTargets)}`);
  return labels;
}

export function workflowConnectorCallSummaries(events: Pick<WorkflowRunEvent, "id" | "type" | "message" | "data">[]): WorkflowConnectorCallSummary[] {
  return events
    .filter((event) => event.type === "connector.start" || event.type === "connector.end" || event.type === "connector.error")
    .map((event) => {
      const data = recordValue(event.data);
      const durationMs = numberValue(data?.durationMs);
      const dataRetention = stringValue(data?.dataRetention);
      const sideEffects = stringValue(data?.sideEffects);
      const personalData = typeof data?.personalData === "boolean" ? data.personalData : undefined;
      return {
        id: event.id,
        operationLabel: event.message?.trim() || "connector call",
        statusLabel: connectorEventStatusLabel(event.type),
        metadataLabels: [
          dataRetention ? `Retention ${dataRetention}` : undefined,
          sideEffects ? `Side effects ${sideEffects}` : undefined,
          personalData !== undefined ? `Personal data ${personalData ? "yes" : "no"}` : undefined,
          durationMs !== undefined ? `Duration ${Math.max(0, Math.round(durationMs)).toLocaleString()}ms` : undefined,
        ].filter((label): label is string => Boolean(label)),
        retentionSummary: connectorRetentionSummary(dataRetention),
        inputSummary: stringValue(data?.inputSummary),
        outputSummary: stringValue(data?.outputSummary),
        errorSummary: stringValue(data?.error),
      };
    });
}

export function workflowAmbientCliCallSummaries(events: Pick<WorkflowRunEvent, "id" | "type" | "message" | "data">[]): WorkflowAmbientCliCallSummary[] {
  return events
    .filter((event) => (event.type === "desktop-tool.start" || event.type === "desktop-tool.end" || event.type === "desktop-tool.error" || event.type === "desktop-tool.dry_run") && event.message === "ambient_cli")
    .map((event) => {
      const data = recordValue(event.data);
      const input = recordValue(data?.ambientCliInput) ?? parseJsonRecord(stringValue(data?.inputSummary));
      const output = recordValue(data?.ambientCliOutput) ?? parseJsonRecord(stringValue(data?.outputSummary));
      const stdout = recordValue(output?.stdout);
      const stderr = recordValue(output?.stderr);
      const durationMs = numberValue(data?.durationMs) ?? numberValue(output?.durationMs);
      const packageLabel = stringValue(output?.packageName) ?? stringValue(input?.packageName) ?? stringValue(output?.packageId) ?? stringValue(input?.packageId) ?? "ambient_cli";
      const commandLabel = stringValue(output?.commandName) ?? stringValue(input?.command);
      const command = arrayValue(output?.command).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      const args = arrayValue(input?.args).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      const source = stringValue(data?.source);
      const sideEffects = stringValue(data?.sideEffects);
      const cwd = stringValue(output?.cwd) ?? stringValue(input?.cwd);
      return {
        id: event.id,
        operationLabel: commandLabel ? `${packageLabel}:${commandLabel}` : packageLabel,
        statusLabel: ambientCliEventStatusLabel(event.type),
        metadataLabels: [
          durationMs !== undefined ? `Duration ${formatDuration(durationMs)}` : undefined,
          source ? `Source ${formatLabelValue(source)}` : undefined,
          sideEffects ? `Side effects ${formatLabelValue(sideEffects)}` : undefined,
          cwd ? `Cwd ${compactText(cwd, 96)}` : undefined,
        ].filter((label): label is string => Boolean(label)),
        argsSummary: args.length ? compactText(args.join(" "), 180) : undefined,
        commandSummary: command.length ? compactText(command.join(" "), 180) : undefined,
        stdoutSummary: materializedTextSummary("Stdout", stdout),
        stderrSummary: materializedTextSummary("Stderr", stderr),
        artifactLabels: [
          ...materializedTextArtifactLabels("Stdout", stdout),
          ...materializedTextArtifactLabels("Stderr", stderr),
        ],
        errorSummary: stringValue(data?.error),
      };
    });
}

export function workflowAmbientCliCapabilityRows(capabilities: WorkflowManifest["ambientCliCapabilities"]): WorkflowAmbientCliCapabilityRow[] {
  return (capabilities ?? []).map((capability) => ({
    id: capability.capabilityId,
    operationLabel: `${capability.packageName}:${capability.command}`,
    metadataLabels: [
      `Package ${capability.packageId}`,
      `Registry ${capability.registryPluginId}`,
      "Desktop tool ambient_cli",
    ],
    grantLabel: `Grant ${capability.capabilityId}`,
  }));
}

function ambientCliEventStatusLabel(type: string): string {
  if (type === "desktop-tool.end") return "Completed";
  if (type === "desktop-tool.error") return "Failed";
  if (type === "desktop-tool.dry_run") return "Dry run";
  return "Started";
}

function materializedTextSummary(label: string, output: Record<string, unknown> | undefined): string | undefined {
  const preview = stringValue(output?.preview);
  if (!preview) return undefined;
  const totalChars = numberValue(output?.totalChars);
  const truncated = typeof output?.truncated === "boolean" ? output.truncated : undefined;
  const prefix = truncated === true && totalChars !== undefined ? `${label} preview ${Math.round(totalChars).toLocaleString()} chars total` : label;
  return `${prefix}: ${compactText(preview, 280)}`;
}

function materializedTextArtifactLabels(label: string, output: Record<string, unknown> | undefined): string[] {
  const artifactPath = stringValue(output?.artifactPath);
  const artifactBytes = numberValue(output?.artifactBytes);
  const totalChars = numberValue(output?.totalChars);
  return [
    artifactPath ? `${label} artifact ${compactText(artifactPath, 120)}` : undefined,
    artifactBytes !== undefined ? `${label} artifact ${Math.round(artifactBytes).toLocaleString()} bytes` : undefined,
    totalChars !== undefined ? `${label} ${Math.round(totalChars).toLocaleString()} chars` : undefined,
  ].filter((item): item is string => Boolean(item));
}

function connectorRetentionSummary(retention: string | undefined): string | undefined {
  if (retention === "none") return "Retention proof: connector values are omitted after the call.";
  if (retention === "redacted_audit") return "Retention proof: only redacted connector summaries are kept in the audit trail.";
  if (retention === "run_artifact") return "Retention proof: raw connector values may be retained in run artifacts.";
  return undefined;
}

export function workflowStepSummaries(events: Pick<WorkflowRunEvent, "id" | "type" | "message" | "data">[]): WorkflowStepSummary[] {
  const byName = new Map<string, WorkflowStepSummary>();
  for (const event of events) {
    if (event.type !== "step.start" && event.type !== "step.end" && event.type !== "step.paused" && event.type !== "step.error") continue;
    const name = event.message?.trim() || "unnamed step";
    const existing = byName.get(name);
    byName.set(name, {
      id: existing?.id ?? event.id,
      name,
      statusLabel: stepEventStatusLabel(event.type),
      metadataLabels: stepEventMetadataLabels(event),
    });
  }
  return [...byName.values()];
}

function stepEventStatusLabel(type: string): string {
  if (type === "step.end") return "Completed";
  if (type === "step.paused") return "Paused";
  if (type === "step.error") return "Failed";
  return "Running";
}

function stepEventMetadataLabels(event: Pick<WorkflowRunEvent, "data">): string[] {
  const data = recordValue(event.data);
  return [stringValue(data?.approvalId) ? `Approval ${stringValue(data?.approvalId)}` : undefined, stringValue(data?.error) ? `Error ${stringValue(data?.error)}` : undefined].filter(
    (label): label is string => Boolean(label),
  );
}

function connectorEventStatusLabel(type: string): string {
  if (type === "connector.end") return "Completed";
  if (type === "connector.error") return "Failed";
  return "Started";
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseJsonRecord(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    return recordValue(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compactList(values: string[], limit = 3): string {
  const visible = values.slice(0, limit);
  const suffix = values.length > visible.length ? ` +${values.length - visible.length} more` : "";
  return `${visible.join(", ")}${suffix}`;
}

function compactError(value: string, limit = 96): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
}

function formatGrantDecisionSource(value: string): string {
  if (value === "persistent_grant") return "Persistent Grant";
  if (value === "full_access_bypass") return "Full Access bypass";
  if (value === "none") return "None required";
  return formatLabelValue(value);
}

function formatTimeoutMode(value: string): string {
  if (value === "idle_watchdog") return "Idle watchdog";
  if (value === "elapsed_hard_limit") return "Elapsed hard limit";
  return formatLabelValue(value);
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
  return `${Math.round(ms / 60000)} min`;
}

function formatLabelValue(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[_.\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
