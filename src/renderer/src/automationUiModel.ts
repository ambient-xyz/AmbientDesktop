import type { OrchestrationRun } from "../../shared/types";

export interface LocalTaskCreateActionInput {
  title: string;
  priorityInput: string;
  busy: boolean;
}

export interface LocalTaskCreateActionState {
  label: string;
  disabled: boolean;
  title?: string;
}

export interface LocalTaskEditActionInput {
  title: string;
  dirty: boolean;
  busy: boolean;
}

export interface LocalTaskReference {
  id: string;
  identifier: string;
  title: string;
}

export interface LocalTaskBlockerOption {
  value: string;
  label: string;
  fullLabel?: string;
}

export interface WorkflowCompileActionInput {
  request: string;
  compiling: boolean;
  blocked: boolean;
}

export type AutomationTriggerMode = "manual" | "auto_dispatch" | "scheduled";
export type AutomationSchedulePreset = "manual" | "hourly" | "daily" | "weekdays" | "weekly" | "advanced";
export type WorkflowConnectorDataRetention = "none" | "redacted_audit" | "run_artifact";

export interface WorkflowConnectorConsentGrant {
  connectorId: string;
  accountId?: string;
  scopes: string[];
  operations: string[];
  dataRetention: WorkflowConnectorDataRetention;
}

export interface WorkflowArtifactRevisionRequestInput {
  title: string;
  status: string;
  goal: string;
  summary?: string;
  successCriteria?: string[];
}

export interface WorkflowSourceEditDiffSummary {
  added: number;
  removed: number;
  unchanged: number;
  changed: boolean;
  label: string;
  previewLines: Array<{ kind: "added" | "removed"; text: string }>;
}

export interface WorkflowModelCallReviewInput {
  task: string;
  status: string;
  input: unknown;
  output?: unknown;
  cacheKey?: string;
  model?: string;
  validationError?: string;
  latencyMs: number;
}

export interface WorkflowModelCallReviewSummary {
  taskLabel: string;
  statusLabel: string;
  metadataLabels: string[];
  inputPreview: string;
  outputPreview?: string;
}

export type WorkflowSourceDraftMap = Record<string, string>;

export const workflowSourceDraftStorageKey = "ambient.workflowSourceDrafts.v1";

export interface WorkflowConnectorConsentSummary {
  connectorId: string;
  connectorLabel: string;
  accountLabel: string;
  accountStatusLabel: string;
  authStatusLabel: string;
  scopeLabel: string;
  operationLabel: string;
  sideEffectLabel: string;
  retentionLabel: string;
  rateLimitLabel: string;
  syncPolicyLabel: string;
  samplePreviewLabel: string;
  dataHandlingLabel: string;
  reviewPolicyLabel: string;
  retentionDowngradeOptions: Array<{ value: WorkflowConnectorDataRetention; label: string }>;
  scopeRemovalOptions: Array<{ value: string; label: string }>;
  rejectActionLabel: string;
}

export interface WorkflowConnectorAccountSummary {
  accountId: string;
  label: string;
  email?: string;
  status: string;
}

export interface ParsedLocalTaskPriority {
  priority?: number;
  error?: string;
}

export function sanitizeLocalTaskPriorityInput(value: string): string {
  return value.replace(/[^\d]/g, "").slice(0, 3);
}

export function parseLocalTaskPriority(value: string): ParsedLocalTaskPriority {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (!/^\d+$/.test(trimmed)) return { error: "Priority must be a number from 0 to 999." };
  const priority = Number(trimmed);
  if (!Number.isInteger(priority) || priority < 0 || priority > 999) {
    return { error: "Priority must be a number from 0 to 999." };
  }
  return { priority };
}

export function parseLocalTaskLabels(value: string): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const rawLabel of value.split(",")) {
    const label = rawLabel.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length >= 20) break;
  }
  return labels;
}

export function stepLocalTaskPriority(current: number, direction: "higher" | "lower"): number {
  return direction === "higher" ? Math.max(0, current - 1) : Math.min(999, current + 1);
}

export function latestRunForTask(runs: OrchestrationRun[], taskId: string): OrchestrationRun | undefined {
  return runs.find((run) => run.taskId === taskId);
}

export function localTaskBlockerOptions(taskId: string, blockedBy: string[], tasks: LocalTaskReference[]): LocalTaskBlockerOption[] {
  const existing = new Set(blockedBy);
  return tasks
    .filter((task) => task.id !== taskId && !existing.has(task.id) && !existing.has(task.identifier))
    .map((task) => {
      const fullLabel = localTaskBlockerFullLabel(task);
      return { value: task.identifier, label: compactLocalTaskBlockerLabel(task), fullLabel };
    });
}

export function localTaskBlockerLabels(blockedBy: string[], tasks: LocalTaskReference[]): LocalTaskBlockerOption[] {
  return blockedBy.map((blockerRef) => {
    const match = tasks.find((task) => task.id === blockerRef || task.identifier === blockerRef);
    return { value: blockerRef, label: match ? localTaskBlockerFullLabel(match) : blockerRef };
  });
}

export function compactLocalTaskBlockerLabel(task: LocalTaskReference): string {
  const identifier = task.identifier.trim() || task.id.trim() || "Task";
  const normalizedTitle = task.title.trim().replace(/\s+/g, " ");
  if (!normalizedTitle) return identifier;
  const maxTitleLength = 21;
  const title = normalizedTitle.length > maxTitleLength ? `${compactTitlePrefix(normalizedTitle, maxTitleLength - 3)}...` : normalizedTitle;
  return `${identifier}: ${title}`;
}

function compactTitlePrefix(title: string, maxLength: number): string {
  const prefix = title.slice(0, maxLength).trimEnd();
  const lastSpace = prefix.lastIndexOf(" ");
  return lastSpace >= Math.ceil(maxLength * 0.7) ? prefix.slice(0, lastSpace) : prefix;
}

function localTaskBlockerFullLabel(task: LocalTaskReference): string {
  const identifier = task.identifier.trim() || task.id.trim() || "Task";
  const normalizedTitle = task.title.trim().replace(/\s+/g, " ");
  return normalizedTitle ? `${identifier}: ${normalizedTitle}` : identifier;
}

export function appendLocalTaskBlocker(blockedBy: string[], blockerRef: string): string[] {
  const nextRef = blockerRef.trim();
  if (!nextRef || blockedBy.includes(nextRef) || blockedBy.length >= 50) return blockedBy;
  return [...blockedBy, nextRef];
}

export function removeLocalTaskBlocker(blockedBy: string[], blockerRef: string): string[] {
  return blockedBy.filter((candidate) => candidate !== blockerRef);
}

export function localTaskCreateActionState(input: LocalTaskCreateActionInput): LocalTaskCreateActionState {
  if (input.busy) return { label: "Adding", disabled: true, title: "Task creation is already in progress." };
  if (!input.title.trim()) return { label: "Add task", disabled: true, title: "Enter a task title." };
  const priority = parseLocalTaskPriority(input.priorityInput);
  if (priority.error) return { label: "Add task", disabled: true, title: priority.error };
  return { label: "Add task", disabled: false };
}

export function localTaskEditActionState(input: LocalTaskEditActionInput): LocalTaskCreateActionState {
  if (input.busy) return { label: "Saving", disabled: true, title: "Task update is already in progress." };
  if (!input.title.trim()) return { label: "Save card", disabled: true, title: "Enter a task title." };
  if (!input.dirty) return { label: "Save card", disabled: true, title: "No task changes to save." };
  return { label: "Save card", disabled: false, title: "Save task title and description." };
}

export function workflowCompileActionState(input: WorkflowCompileActionInput): LocalTaskCreateActionState {
  if (input.compiling) return { label: "Compiling", disabled: true, title: "Workflow preview compilation is in progress." };
  if (input.blocked) return { label: "Skip discovery and compile", disabled: true, title: "Another workflow action is in progress." };
  if (!input.request.trim()) return { label: "Skip discovery and compile", disabled: true, title: "Describe the workflow request first." };
  return { label: "Skip discovery and compile", disabled: false, title: "Compile this request into a reviewable workflow preview without discovery questions." };
}

export function workflowArtifactRevisionRequest(input: WorkflowArtifactRevisionRequestInput): string {
  const lines = [
    "Revise this workflow preview.",
    "",
    `Artifact: ${input.title.trim() || "Untitled workflow"}`,
    `Current status: ${input.status.trim() || "unknown"}`,
    "",
    "Original goal:",
    input.goal.trim() || "(no goal recorded)",
  ];
  const summary = input.summary?.trim();
  if (summary) lines.push("", "Current summary:", summary);
  const criteria = input.successCriteria?.map((item) => item.trim()).filter(Boolean) ?? [];
  if (criteria.length > 0) lines.push("", "Success criteria:", ...criteria.map((item) => `- ${item}`));
  lines.push("", "Requested changes:", "- ");
  return lines.join("\n");
}

export function workflowSourceEditDiffSummary(original: string, draft: string): WorkflowSourceEditDiffSummary {
  const originalLines = splitSourceLines(original);
  const draftLines = splitSourceLines(draft);
  let prefix = 0;
  while (prefix < originalLines.length && prefix < draftLines.length && originalLines[prefix] === draftLines[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < originalLines.length - prefix &&
    suffix < draftLines.length - prefix &&
    originalLines[originalLines.length - 1 - suffix] === draftLines[draftLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = originalLines.length - prefix - suffix;
  const added = draftLines.length - prefix - suffix;
  const unchanged = prefix + suffix;
  const changed = added > 0 || removed > 0;
  const removedPreview = originalLines.slice(prefix, originalLines.length - suffix).slice(0, 3).map((text) => ({ kind: "removed" as const, text }));
  const addedPreview = draftLines.slice(prefix, draftLines.length - suffix).slice(0, 3).map((text) => ({ kind: "added" as const, text }));
  return {
    added,
    removed,
    unchanged,
    changed,
    label: changed ? `Source diff +${added} -${removed} (${unchanged} unchanged)` : `No source changes (${pluralizeLine(originalLines.length)})`,
    previewLines: changed ? [...removedPreview, ...addedPreview] : [],
  };
}

export function workflowModelCallReviewSummary(call: WorkflowModelCallReviewInput): WorkflowModelCallReviewSummary {
  return {
    taskLabel: call.task.trim() || "Untitled model call",
    statusLabel: `Status ${call.status.trim() || "unknown"}`,
    metadataLabels: [
      call.model ? `Model ${call.model}` : undefined,
      call.cacheKey ? `Replay ${call.cacheKey}` : undefined,
      `Latency ${Math.max(0, Math.round(call.latencyMs)).toLocaleString()}ms`,
      call.validationError ? `Validation ${call.validationError}` : undefined,
    ].filter((label): label is string => Boolean(label)),
    inputPreview: `Input ${jsonPreview(call.input)}`,
    outputPreview: call.output !== undefined ? `Output ${jsonPreview(call.output)}` : undefined,
  };
}

export function normalizeWorkflowSourceDrafts(value: unknown): WorkflowSourceDraftMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: WorkflowSourceDraftMap = {};
  const entries: Array<[string, string]> = [];
  for (const [artifactId, source] of Object.entries(value as Record<string, unknown>)) {
    if (isSafeWorkflowSourceDraftKey(artifactId) && typeof source === "string") entries.push([artifactId, source]);
  }
  for (const [artifactId, source] of entries.sort(([left], [right]) => left.localeCompare(right)).slice(0, 50)) {
    result[artifactId] = source.length > 500_000 ? source.slice(0, 500_000) : source;
  }
  return result;
}

export function encodeWorkflowSourceDrafts(drafts: WorkflowSourceDraftMap): string {
  return JSON.stringify(normalizeWorkflowSourceDrafts(drafts));
}

export function decodeWorkflowSourceDrafts(raw: string | null): WorkflowSourceDraftMap {
  if (!raw) return {};
  try {
    return normalizeWorkflowSourceDrafts(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

function isSafeWorkflowSourceDraftKey(value: string): boolean {
  if (!value.trim() || value.length > 200) return false;
  return value !== "__proto__" && value !== "prototype" && value !== "constructor";
}

function jsonPreview(value: unknown): string {
  let preview: string;
  try {
    preview = JSON.stringify(value);
  } catch {
    preview = String(value);
  }
  if (preview === undefined) preview = "undefined";
  return preview.length > 240 ? `${preview.slice(0, 237)}...` : preview;
}

export function taskTriggerLabels(mode: AutomationTriggerMode, preset: AutomationSchedulePreset, expression: string): string[] {
  if (mode === "manual") return ["trigger:manual"];
  if (mode === "auto_dispatch") return ["trigger:auto-dispatch"];
  const schedule = preset === "advanced" ? expression.trim() || "custom" : preset;
  return ["trigger:scheduled", `schedule:${schedule}`];
}

function splitSourceLines(value: string): string[] {
  return value.split(/\r\n|\n|\r/);
}

function pluralizeLine(count: number): string {
  return `${count} line${count === 1 ? "" : "s"}`;
}

export function schedulePresetLabel(preset: AutomationSchedulePreset, expression: string): string {
  if (preset === "manual") return "Manual only";
  if (preset === "hourly") return "Hourly";
  if (preset === "daily") return "Daily at 9:00";
  if (preset === "weekdays") return "Weekdays at 9:00";
  if (preset === "weekly") return "Weekly on Monday at 9:00";
  return expression.trim() ? `Cron ${expression.trim()}` : "Advanced cron";
}

export function scheduleNextRunLabel(preset: AutomationSchedulePreset, expression: string, enabled = true): string {
  if (!enabled) return "Paused";
  if (preset === "manual") return "Only when started manually";
  if (preset === "hourly") return "Next eligible hourly window";
  if (preset === "daily") return "Next eligible 9:00 AM window";
  if (preset === "weekdays") return "Next weekday 9:00 AM window";
  if (preset === "weekly") return "Next Monday 9:00 AM window";
  return expression.trim() ? `Next run follows ${expression.trim()}` : "Enter a cron expression";
}

export function triggerPreviewLabel(mode: AutomationTriggerMode, preset: AutomationSchedulePreset, expression: string): string {
  if (mode === "manual") return "Runs only when started manually.";
  if (mode === "auto_dispatch") return "Eligible when Auto-dispatch is on.";
  return scheduleNextRunLabel(preset, expression);
}

export function workflowConnectorConsentSummary(grant: WorkflowConnectorConsentGrant): WorkflowConnectorConsentSummary {
  const descriptor = workflowConnectorConsentDescriptors[grant.connectorId];
  return {
    connectorId: grant.connectorId,
    connectorLabel: descriptor ? `${descriptor.label} (${grant.connectorId})` : grant.connectorId,
    accountLabel: grant.accountId ? `Account ${formatConnectorAccount(descriptor, grant.accountId)}` : "Account selected at run time",
    accountStatusLabel: grant.accountId
      ? descriptor?.accounts[grant.accountId]?.statusLabel ?? "Account status not declared in preview."
      : "Account status selected at run time.",
    authStatusLabel: descriptor?.authStatusLabel ?? "Auth status not declared in preview.",
    scopeLabel: `Scopes ${grant.scopes.length > 0 ? grant.scopes.map((scope) => formatConnectorScope(descriptor, scope)).join(", ") : "none"}`,
    operationLabel: `Operations ${grant.operations.length > 0 ? grant.operations.map((operation) => formatConnectorOperation(descriptor, operation)).join(", ") : "none"}`,
    sideEffectLabel: `Side effects ${connectorOperationSummaries(descriptor, grant.operations, "sideEffect").join(", ") || "not declared"}`,
    retentionLabel: `Retention ${formatConnectorRetention(grant.dataRetention)}`,
    rateLimitLabel: descriptor?.rateLimitLabel ?? "Rate limit not declared in preview.",
    syncPolicyLabel: descriptor?.syncPolicyLabel ?? "Sync policy not declared in preview.",
    samplePreviewLabel: descriptor?.samplePreviewLabel ?? "Sample preview not available for this connector.",
    dataHandlingLabel: connectorDataHandlingLabel(grant.dataRetention),
    reviewPolicyLabel:
      grant.dataRetention === "run_artifact"
        ? "Review policy: raw connector values require approval."
        : "Review policy: personal-data or mutation calls pause for approval.",
    retentionDowngradeOptions: workflowConnectorRetentionDowngradeOptions(grant.dataRetention),
    scopeRemovalOptions: grant.scopes.map((scope) => ({ value: scope, label: `Remove scope ${scope}` })),
    rejectActionLabel: "Reject connector",
  };
}

interface WorkflowConnectorConsentDescriptor {
  label: string;
  authStatusLabel: string;
  accounts: Record<string, { label: string; statusLabel: string }>;
  scopes: Record<string, string>;
  operations: Record<string, { label: string; sideEffect: string }>;
  rateLimitLabel: string;
  syncPolicyLabel: string;
  samplePreviewLabel: string;
}

const workflowConnectorConsentDescriptors: Record<string, WorkflowConnectorConsentDescriptor> = {
  "workspace.inventory": {
    label: "Workspace Inventory",
    authStatusLabel: "Auth No OAuth required for the local workspace.",
    accounts: {
      workspace: {
        label: "Local workspace",
        statusLabel: "Account status available",
      },
    },
    scopes: {
      "workspace.files.read": "Read workspace file inventory",
    },
    operations: {
      listFiles: {
        label: "List files",
        sideEffect: "Read-only workspace metadata",
      },
    },
    rateLimitLabel: "Rate limit 300/min burst 30",
    syncPolicyLabel: "Sync One bounded page; no sync cursor",
    samplePreviewLabel: "Sample preview entries include path, type, size, and truncation flags; file contents are not read.",
  },
};

function formatConnectorAccount(descriptor: WorkflowConnectorConsentDescriptor | undefined, accountId: string): string {
  const label = descriptor?.accounts[accountId]?.label;
  return label ? `${label} (${accountId})` : accountId;
}

function formatConnectorScope(descriptor: WorkflowConnectorConsentDescriptor | undefined, scope: string): string {
  const label = descriptor?.scopes[scope];
  return label ? `${label} (${scope})` : scope;
}

function formatConnectorOperation(descriptor: WorkflowConnectorConsentDescriptor | undefined, operation: string): string {
  const label = descriptor?.operations[operation]?.label;
  return label ? `${label} (${operation})` : operation;
}

function connectorOperationSummaries(
  descriptor: WorkflowConnectorConsentDescriptor | undefined,
  operations: string[],
  field: "sideEffect",
): string[] {
  return [...new Set(operations.map((operation) => descriptor?.operations[operation]?.[field]).filter((value): value is string => Boolean(value)))];
}

export function workflowConnectorRetentionDowngradeOptions(retention: WorkflowConnectorDataRetention): Array<{ value: WorkflowConnectorDataRetention; label: string }> {
  if (retention === "run_artifact") {
    return [
      { value: "redacted_audit", label: "Use redacted audit" },
      { value: "none", label: "Use no retention" },
    ];
  }
  if (retention === "redacted_audit") return [{ value: "none", label: "Use no retention" }];
  return [];
}

export function workflowConnectorAccountOptions(accounts: WorkflowConnectorAccountSummary[]): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string }> = [];
  for (const account of accounts) {
    if (account.status !== "available" || seen.has(account.accountId)) continue;
    seen.add(account.accountId);
    options.push({ value: account.accountId, label: account.email ? `${account.label} <${account.email}>` : `${account.label} (${account.accountId})` });
  }
  return options;
}

function formatConnectorRetention(retention: WorkflowConnectorDataRetention): string {
  if (retention === "none") return "None";
  if (retention === "redacted_audit") return "Redacted audit";
  return "Run artifact";
}

function connectorDataHandlingLabel(retention: WorkflowConnectorDataRetention): string {
  if (retention === "none") return "No connector values are retained after the call.";
  if (retention === "redacted_audit") return "Only redacted summaries are kept in the audit trail.";
  return "Raw connector values may be stored with the run artifact.";
}
