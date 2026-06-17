import type { SubagentDependencyMode, SubagentResultArtifact } from "../../shared/subagentProtocol";
import { buildSubagentCanonicalPath } from "../../shared/subagentProtocol";
import type { SubagentRoleId } from "../../shared/subagentRoles";
import { createSubagentIdempotencyKey, createSubagentPayloadFingerprint } from "./subagentIdempotency";

export const SUBAGENT_BATCH_JOB_SCHEMA_VERSION = "ambient-subagent-batch-job-v1" as const;
export const SUBAGENT_BATCH_RESULT_REPORT_SCHEMA_VERSION = "ambient-subagent-batch-result-report-v1" as const;
export const SUBAGENT_BATCH_RESULT_LEDGER_SCHEMA_VERSION = "ambient-subagent-batch-result-ledger-v1" as const;
export const SUBAGENT_BATCH_RESULT_LEDGER_VALIDATION_SCHEMA_VERSION = "ambient-subagent-batch-result-ledger-validation-v1" as const;
export const SUBAGENT_BATCH_PROGRESS_SCHEMA_VERSION = "ambient-subagent-batch-progress-v1" as const;
export const SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_SCHEMA_VERSION = "ambient-subagent-batch-progress-mailbox-v1" as const;
export const SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE = "subagent.batch_progress" as const;

export type SubagentBatchFailurePolicy = "fail_fast" | "collect_all" | "ask_parent";
export type SubagentBatchItemReportStatus = "completed" | "failed" | "cancelled" | "timed_out" | "aborted_partial";
export type SubagentBatchItemProgressStatus = "pending" | SubagentBatchItemReportStatus;
export type SubagentBatchReportApplyOutcome = "accepted" | "duplicate" | "rejected";
export type SubagentBatchReportRejectReason =
  | "unknown_item"
  | "child_run_mismatch"
  | "invalid_ledger"
  | "report_id_reused"
  | "item_already_reported"
  | "invalid_result_artifact";

export interface SubagentBatchJobItemInput {
  itemId: string;
  roleId: SubagentRoleId;
  task: string;
  dependencyMode?: SubagentDependencyMode;
  childRunId?: string;
  metadata?: Record<string, unknown>;
}

export interface SubagentBatchJobItem {
  itemId: string;
  childIndex: number;
  canonicalTaskPath: string;
  roleId: SubagentRoleId;
  task: string;
  dependencyMode: SubagentDependencyMode;
  spawnIdempotencyKey: string;
  payloadFingerprint: string;
  childRunId?: string;
  metadata?: Record<string, unknown>;
}

export interface SubagentBatchJobPlan {
  schemaVersion: typeof SUBAGENT_BATCH_JOB_SCHEMA_VERSION;
  jobId: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  canonicalTaskPath: string;
  createdAt: string;
  maxConcurrency: number;
  failurePolicy: SubagentBatchFailurePolicy;
  resultTimeoutMs?: number;
  items: SubagentBatchJobItem[];
}

export interface SubagentBatchJobRecord {
  plan: SubagentBatchJobPlan;
  ledger: SubagentBatchResultLedger;
  createdAt: string;
  updatedAt: string;
}

export interface SubagentBatchResultReport {
  schemaVersion: typeof SUBAGENT_BATCH_RESULT_REPORT_SCHEMA_VERSION;
  reportId: string;
  jobId: string;
  itemId: string;
  childRunId: string;
  status: SubagentBatchItemReportStatus;
  summary: string;
  createdAt: string;
  idempotencyKey: string;
  resultArtifact?: SubagentResultArtifact;
  artifactPath?: string;
}

export interface SubagentBatchAcceptedReport {
  reportId: string;
  itemId: string;
  childRunId: string;
  status: SubagentBatchItemReportStatus;
  summary: string;
  idempotencyKey: string;
  createdAt: string;
  resultArtifact?: SubagentResultArtifact;
  artifactPath?: string;
}

export interface SubagentBatchResultLedger {
  schemaVersion: typeof SUBAGENT_BATCH_RESULT_LEDGER_SCHEMA_VERSION;
  jobId: string;
  itemCount: number;
  acceptedReportCount: number;
  reportsByItemId: Record<string, SubagentBatchAcceptedReport>;
  reportIds: Record<string, string>;
  completedItemIds: string[];
  pendingItemIds: string[];
}

export interface SubagentBatchReportApplyResult {
  outcome: SubagentBatchReportApplyOutcome;
  ledger: SubagentBatchResultLedger;
  acceptedReport?: SubagentBatchAcceptedReport;
  existingReport?: SubagentBatchAcceptedReport;
  reason?: SubagentBatchReportRejectReason;
  message?: string;
}

export interface SubagentBatchResultLedgerValidation {
  schemaVersion: typeof SUBAGENT_BATCH_RESULT_LEDGER_VALIDATION_SCHEMA_VERSION;
  valid: boolean;
  issues: string[];
  expectedItemIds: string[];
  acceptedItemIds: string[];
  pendingItemIds: string[];
  reportIds: string[];
}

export interface SubagentBatchItemProgressPreview {
  itemId: string;
  childIndex: number;
  canonicalTaskPath: string;
  roleId: SubagentRoleId;
  dependencyMode: SubagentDependencyMode;
  status: SubagentBatchItemProgressStatus;
  childRunId?: string;
  reportId?: string;
  summaryPreview?: string;
  summaryTruncated?: boolean;
  artifactPath?: string;
  resultArtifactStatus?: SubagentResultArtifact["status"];
  reportedAt?: string;
}

export interface SubagentBatchJobProgressSummary {
  schemaVersion: typeof SUBAGENT_BATCH_PROGRESS_SCHEMA_VERSION;
  jobId: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  canonicalTaskPath: string;
  createdAt: string;
  updatedAt: string;
  maxConcurrency: number;
  failurePolicy: SubagentBatchFailurePolicy;
  resultTimeoutMs?: number;
  itemCount: number;
  acceptedReportCount: number;
  pendingCount: number;
  statusCounts: Record<SubagentBatchItemProgressStatus, number>;
  pendingItemIds: string[];
  completedItemIds: string[];
  itemPreviewCount: number;
  omittedItemCount: number;
  itemPreviews: SubagentBatchItemProgressPreview[];
}

export interface SubagentBatchProgressParentMailboxPayload {
  schemaVersion: typeof SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_SCHEMA_VERSION;
  summary: SubagentBatchJobProgressSummary;
}

export function createSubagentBatchJobPlan(input: {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  canonicalTaskPath: string;
  items: SubagentBatchJobItemInput[];
  jobId?: string;
  createdAt?: string;
  maxConcurrency?: number;
  failurePolicy?: SubagentBatchFailurePolicy;
  resultTimeoutMs?: number;
}): SubagentBatchJobPlan {
  if (!input.parentThreadId.trim()) throw new Error("Sub-agent batch job is missing parentThreadId.");
  if (!input.parentRunId.trim()) throw new Error("Sub-agent batch job is missing parentRunId.");
  if (!input.canonicalTaskPath.trim()) throw new Error("Sub-agent batch job is missing canonicalTaskPath.");
  if (input.items.length === 0) throw new Error("Sub-agent batch job needs at least one item.");
  const maxConcurrency = input.maxConcurrency ?? 1;
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error("Sub-agent batch job maxConcurrency must be a positive integer.");
  }
  const seenItemIds = new Set<string>();
  const seenCanonicalPaths = new Set<string>();
  const items = input.items.map((item, index) => {
    const itemId = item.itemId.trim();
    if (!itemId) throw new Error("Sub-agent batch item is missing itemId.");
    if (seenItemIds.has(itemId)) throw new Error(`Duplicate sub-agent batch itemId: ${itemId}`);
    seenItemIds.add(itemId);
    const task = item.task.trim();
    if (!task) throw new Error(`Sub-agent batch item ${itemId} is missing task.`);
    const canonicalTaskPath = buildSubagentCanonicalPath({
      parentPath: `${input.canonicalTaskPath}/batch`,
      roleId: item.roleId,
      spawnIndex: index,
    });
    if (seenCanonicalPaths.has(canonicalTaskPath)) throw new Error(`Duplicate sub-agent batch canonical path: ${canonicalTaskPath}`);
    seenCanonicalPaths.add(canonicalTaskPath);
    const payloadFingerprint = createSubagentPayloadFingerprint({
      itemId,
      roleId: item.roleId,
      task,
      dependencyMode: item.dependencyMode ?? "required",
      metadata: item.metadata ?? null,
    });
    return {
      itemId,
      childIndex: index,
      canonicalTaskPath,
      roleId: item.roleId,
      task,
      dependencyMode: item.dependencyMode ?? "required",
      spawnIdempotencyKey: createSubagentIdempotencyKey({
        operation: "spawn",
        parentRunId: input.parentRunId,
        canonicalPath: canonicalTaskPath,
        payloadFingerprint,
      }),
      payloadFingerprint,
      ...(item.childRunId ? { childRunId: item.childRunId } : {}),
      ...(item.metadata ? { metadata: item.metadata } : {}),
    } satisfies SubagentBatchJobItem;
  });
  const planFingerprint = createSubagentPayloadFingerprint({
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    parentMessageId: input.parentMessageId ?? null,
    canonicalTaskPath: input.canonicalTaskPath,
    maxConcurrency,
    failurePolicy: input.failurePolicy ?? "collect_all",
    resultTimeoutMs: input.resultTimeoutMs ?? null,
    itemFingerprints: items.map((item) => item.payloadFingerprint),
  });
  return {
    schemaVersion: SUBAGENT_BATCH_JOB_SCHEMA_VERSION,
    jobId: input.jobId ?? `subagent-batch:${planFingerprint.slice(0, 24)}`,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    canonicalTaskPath: input.canonicalTaskPath,
    createdAt: input.createdAt ?? new Date().toISOString(),
    maxConcurrency,
    failurePolicy: input.failurePolicy ?? "collect_all",
    ...(input.resultTimeoutMs !== undefined ? { resultTimeoutMs: input.resultTimeoutMs } : {}),
    items,
  };
}

export function createSubagentBatchResultLedger(plan: Pick<SubagentBatchJobPlan, "jobId" | "items">): SubagentBatchResultLedger {
  return {
    schemaVersion: SUBAGENT_BATCH_RESULT_LEDGER_SCHEMA_VERSION,
    jobId: plan.jobId,
    itemCount: plan.items.length,
    acceptedReportCount: 0,
    reportsByItemId: {},
    reportIds: {},
    completedItemIds: [],
    pendingItemIds: plan.items.map((item) => item.itemId),
  };
}

export function createSubagentBatchResultReport(input: {
  plan: Pick<SubagentBatchJobPlan, "jobId" | "parentRunId">;
  item: Pick<SubagentBatchJobItem, "itemId" | "canonicalTaskPath">;
  childRunId: string;
  status: SubagentBatchItemReportStatus;
  summary: string;
  reportId?: string;
  createdAt?: string;
  resultArtifact?: SubagentResultArtifact;
  artifactPath?: string;
}): SubagentBatchResultReport {
  const reportFingerprint = createSubagentPayloadFingerprint({
    jobId: input.plan.jobId,
    itemId: input.item.itemId,
    childRunId: input.childRunId,
    status: input.status,
    summary: input.summary,
    resultArtifact: input.resultArtifact ?? null,
    artifactPath: input.artifactPath ?? null,
  });
  return {
    schemaVersion: SUBAGENT_BATCH_RESULT_REPORT_SCHEMA_VERSION,
    reportId: input.reportId ?? `subagent-batch-report:${reportFingerprint.slice(0, 24)}`,
    jobId: input.plan.jobId,
    itemId: input.item.itemId,
    childRunId: input.childRunId,
    status: input.status,
    summary: input.summary,
    createdAt: input.createdAt ?? new Date().toISOString(),
    idempotencyKey: createSubagentIdempotencyKey({
      operation: "artifact_write",
      parentRunId: input.plan.parentRunId,
      childRunId: input.childRunId,
      canonicalPath: input.item.canonicalTaskPath,
      payloadFingerprint: reportFingerprint,
    }),
    ...(input.resultArtifact ? { resultArtifact: input.resultArtifact } : {}),
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
  };
}

export function applySubagentBatchResultReport(input: {
  plan: Pick<SubagentBatchJobPlan, "jobId" | "items">;
  ledger: SubagentBatchResultLedger;
  report: SubagentBatchResultReport;
}): SubagentBatchReportApplyResult {
  if (input.report.jobId !== input.plan.jobId || input.ledger.jobId !== input.plan.jobId) {
    return rejected(input.ledger, "unknown_item", `Result report ${input.report.reportId} targets a different batch job.`);
  }
  const ledgerValidation = validateSubagentBatchResultLedgerExactlyOnce({ plan: input.plan, ledger: input.ledger });
  if (!ledgerValidation.valid) {
    return rejected(input.ledger, "invalid_ledger", `Batch ledger violates exactly-once result reporting: ${ledgerValidation.issues.join("; ")}`);
  }
  const item = input.plan.items.find((candidate) => candidate.itemId === input.report.itemId);
  if (!item) return rejected(input.ledger, "unknown_item", `Result report ${input.report.reportId} targets unknown item ${input.report.itemId}.`);
  if (item.childRunId && item.childRunId !== input.report.childRunId) {
    return rejected(input.ledger, "child_run_mismatch", `Result report ${input.report.reportId} came from ${input.report.childRunId}, expected ${item.childRunId}.`);
  }
  const artifactIssue = resultArtifactIssue(input.report);
  if (artifactIssue) return rejected(input.ledger, "invalid_result_artifact", artifactIssue);
  const reportIdOwner = input.ledger.reportIds[input.report.reportId];
  if (reportIdOwner && reportIdOwner !== input.report.itemId) {
    return rejected(input.ledger, "report_id_reused", `Result report id ${input.report.reportId} was already used for item ${reportIdOwner}.`);
  }
  const existing = input.ledger.reportsByItemId[input.report.itemId];
  if (existing) {
    if (existing.reportId === input.report.reportId && existing.idempotencyKey === input.report.idempotencyKey) {
      return {
        outcome: "duplicate",
        ledger: input.ledger,
        existingReport: existing,
      };
    }
    return rejected(input.ledger, "item_already_reported", `Batch item ${input.report.itemId} already has an accepted result report.`);
  }
  const accepted = acceptedReportFromReport(input.report);
  const reportsByItemId = { ...input.ledger.reportsByItemId, [input.report.itemId]: accepted };
  const reportIds = { ...input.ledger.reportIds, [input.report.reportId]: input.report.itemId };
  const completedItemIds = [...input.ledger.completedItemIds, input.report.itemId];
  const completedSet = new Set(completedItemIds);
  return {
    outcome: "accepted",
    ledger: {
      ...input.ledger,
      acceptedReportCount: input.ledger.acceptedReportCount + 1,
      reportsByItemId,
      reportIds,
      completedItemIds,
      pendingItemIds: input.plan.items.map((candidate) => candidate.itemId).filter((itemId) => !completedSet.has(itemId)),
    },
    acceptedReport: accepted,
  };
}

export function validateSubagentBatchResultLedgerExactlyOnce(input: {
  plan: Pick<SubagentBatchJobPlan, "jobId" | "items">;
  ledger: SubagentBatchResultLedger;
}): SubagentBatchResultLedgerValidation {
  const expectedItemIds = input.plan.items.map((item) => item.itemId);
  const expectedItemSet = new Set(expectedItemIds);
  const issues: string[] = [];
  const reportEntries = Object.entries(input.ledger.reportsByItemId);
  const reportIdEntries = Object.entries(input.ledger.reportIds);
  const completedItemIds = input.ledger.completedItemIds;
  const pendingItemIds = input.ledger.pendingItemIds;

  if (input.ledger.schemaVersion !== SUBAGENT_BATCH_RESULT_LEDGER_SCHEMA_VERSION) {
    issues.push(`ledger schemaVersion must be ${SUBAGENT_BATCH_RESULT_LEDGER_SCHEMA_VERSION}.`);
  }
  if (input.ledger.jobId !== input.plan.jobId) {
    issues.push(`ledger jobId ${input.ledger.jobId} does not match plan jobId ${input.plan.jobId}.`);
  }
  if (input.ledger.itemCount !== expectedItemIds.length) {
    issues.push(`ledger itemCount ${input.ledger.itemCount} does not match plan item count ${expectedItemIds.length}.`);
  }
  if (input.ledger.acceptedReportCount !== reportEntries.length) {
    issues.push(`acceptedReportCount ${input.ledger.acceptedReportCount} does not match reportsByItemId count ${reportEntries.length}.`);
  }
  if (reportEntries.length !== reportIdEntries.length) {
    issues.push(`reportsByItemId count ${reportEntries.length} does not match reportIds count ${reportIdEntries.length}.`);
  }

  const reportIdsFromReports = new Set<string>();
  for (const [itemId, report] of reportEntries) {
    if (!expectedItemSet.has(itemId)) issues.push(`reportsByItemId contains unknown item ${itemId}.`);
    if (report.itemId !== itemId) issues.push(`accepted report ${report.reportId} is stored under ${itemId} but declares item ${report.itemId}.`);
    if (reportIdsFromReports.has(report.reportId)) issues.push(`accepted report id ${report.reportId} appears more than once.`);
    reportIdsFromReports.add(report.reportId);
    if (input.ledger.reportIds[report.reportId] !== itemId) {
      issues.push(`reportIds does not map accepted report ${report.reportId} back to item ${itemId}.`);
    }
  }

  for (const [reportId, itemId] of reportIdEntries) {
    if (!expectedItemSet.has(itemId)) issues.push(`reportIds maps ${reportId} to unknown item ${itemId}.`);
    const report = input.ledger.reportsByItemId[itemId];
    if (!report) {
      issues.push(`reportIds maps ${reportId} to ${itemId}, but reportsByItemId has no accepted report for that item.`);
    } else if (report.reportId !== reportId) {
      issues.push(`reportIds maps ${reportId} to ${itemId}, but the accepted report id is ${report.reportId}.`);
    }
  }

  const completedSet = uniqueSet(completedItemIds, "completedItemIds", issues);
  const pendingSet = uniqueSet(pendingItemIds, "pendingItemIds", issues);
  for (const itemId of completedItemIds) {
    if (!expectedItemSet.has(itemId)) issues.push(`completedItemIds contains unknown item ${itemId}.`);
    if (!input.ledger.reportsByItemId[itemId]) issues.push(`completed item ${itemId} has no accepted report.`);
  }
  for (const itemId of pendingItemIds) {
    if (!expectedItemSet.has(itemId)) issues.push(`pendingItemIds contains unknown item ${itemId}.`);
    if (input.ledger.reportsByItemId[itemId]) issues.push(`pending item ${itemId} already has an accepted report.`);
  }
  for (const itemId of expectedItemIds) {
    const completed = completedSet.has(itemId);
    const pending = pendingSet.has(itemId);
    if (completed && pending) issues.push(`item ${itemId} appears in both completedItemIds and pendingItemIds.`);
    if (!completed && !pending) issues.push(`item ${itemId} appears in neither completedItemIds nor pendingItemIds.`);
  }
  if (completedSet.size !== reportEntries.length) {
    issues.push(`completedItemIds count ${completedSet.size} does not match accepted report count ${reportEntries.length}.`);
  }

  return {
    schemaVersion: SUBAGENT_BATCH_RESULT_LEDGER_VALIDATION_SCHEMA_VERSION,
    valid: issues.length === 0,
    issues,
    expectedItemIds,
    acceptedItemIds: completedItemIds,
    pendingItemIds,
    reportIds: reportIdEntries.map(([reportId]) => reportId),
  };
}

export function summarizeSubagentBatchJobProgress(
  record: SubagentBatchJobRecord,
  options: { maxItems?: number; maxSummaryChars?: number } = {},
): SubagentBatchJobProgressSummary {
  const maxItems = normalizePositiveLimit(options.maxItems, 20);
  const maxSummaryChars = normalizePositiveLimit(options.maxSummaryChars, 500);
  const statusCounts = emptyProgressStatusCounts();
  const itemPreviews: SubagentBatchItemProgressPreview[] = [];

  for (const item of record.plan.items) {
    const report = record.ledger.reportsByItemId[item.itemId];
    const status: SubagentBatchItemProgressStatus = report?.status ?? "pending";
    statusCounts[status] += 1;
    if (itemPreviews.length >= maxItems) continue;
    const summary = report?.summary ? boundedPreview(report.summary, maxSummaryChars) : undefined;
    itemPreviews.push({
      itemId: item.itemId,
      childIndex: item.childIndex,
      canonicalTaskPath: item.canonicalTaskPath,
      roleId: item.roleId,
      dependencyMode: item.dependencyMode,
      status,
      ...(report?.childRunId ? { childRunId: report.childRunId } : {}),
      ...(report?.reportId ? { reportId: report.reportId } : {}),
      ...(summary ? { summaryPreview: summary.preview, summaryTruncated: summary.truncated } : {}),
      ...(report?.artifactPath ? { artifactPath: report.artifactPath } : {}),
      ...(report?.resultArtifact ? { resultArtifactStatus: report.resultArtifact.status } : {}),
      ...(report?.createdAt ? { reportedAt: report.createdAt } : {}),
    });
  }

  return {
    schemaVersion: SUBAGENT_BATCH_PROGRESS_SCHEMA_VERSION,
    jobId: record.plan.jobId,
    parentThreadId: record.plan.parentThreadId,
    parentRunId: record.plan.parentRunId,
    ...(record.plan.parentMessageId ? { parentMessageId: record.plan.parentMessageId } : {}),
    canonicalTaskPath: record.plan.canonicalTaskPath,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    maxConcurrency: record.plan.maxConcurrency,
    failurePolicy: record.plan.failurePolicy,
    ...(record.plan.resultTimeoutMs !== undefined ? { resultTimeoutMs: record.plan.resultTimeoutMs } : {}),
    itemCount: record.ledger.itemCount,
    acceptedReportCount: record.ledger.acceptedReportCount,
    pendingCount: record.ledger.pendingItemIds.length,
    statusCounts,
    pendingItemIds: record.ledger.pendingItemIds,
    completedItemIds: record.ledger.completedItemIds,
    itemPreviewCount: itemPreviews.length,
    omittedItemCount: Math.max(0, record.plan.items.length - itemPreviews.length),
    itemPreviews,
  };
}

export function createSubagentBatchProgressParentMailboxPayload(
  record: SubagentBatchJobRecord,
  options?: { maxItems?: number; maxSummaryChars?: number },
): SubagentBatchProgressParentMailboxPayload {
  return {
    schemaVersion: SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_SCHEMA_VERSION,
    summary: summarizeSubagentBatchJobProgress(record, options),
  };
}

export function createSubagentBatchProgressParentMailboxIdempotencyKey(jobId: string): string {
  const fingerprint = createSubagentPayloadFingerprint({ jobId, type: SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE });
  return `subagent:batch_progress:${fingerprint.slice(0, 24)}`;
}

function acceptedReportFromReport(report: SubagentBatchResultReport): SubagentBatchAcceptedReport {
  return {
    reportId: report.reportId,
    itemId: report.itemId,
    childRunId: report.childRunId,
    status: report.status,
    summary: report.summary,
    idempotencyKey: report.idempotencyKey,
    createdAt: report.createdAt,
    ...(report.resultArtifact ? { resultArtifact: report.resultArtifact } : {}),
    ...(report.artifactPath ? { artifactPath: report.artifactPath } : {}),
  };
}

function emptyProgressStatusCounts(): Record<SubagentBatchItemProgressStatus, number> {
  return {
    pending: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    timed_out: 0,
    aborted_partial: 0,
  };
}

function normalizePositiveLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.floor(value));
}

function boundedPreview(text: string, maxChars: number): { preview: string; truncated: boolean } {
  if (text.length <= maxChars) return { preview: text, truncated: false };
  const suffix = " [truncated]";
  const cutLength = Math.max(1, maxChars - suffix.length);
  return {
    preview: `${text.slice(0, cutLength)}${suffix}`,
    truncated: true,
  };
}

function uniqueSet(values: string[], field: string, issues: string[]): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) issues.push(`${field} contains duplicate item ${value}.`);
    seen.add(value);
  }
  return seen;
}

function resultArtifactIssue(report: SubagentBatchResultReport): string | undefined {
  if (report.status === "completed" && !report.resultArtifact) {
    return `Completed batch report ${report.reportId} is missing a result artifact.`;
  }
  if (!report.resultArtifact) return undefined;
  if (report.resultArtifact.runId !== report.childRunId) {
    return `Batch report ${report.reportId} result artifact runId does not match childRunId.`;
  }
  if (report.resultArtifact.status !== report.status) {
    return `Batch report ${report.reportId} result artifact status does not match report status.`;
  }
  if (report.resultArtifact.childThreadId.trim().length === 0 || report.resultArtifact.summary.trim().length === 0) {
    return `Batch report ${report.reportId} result artifact is missing childThreadId or summary.`;
  }
  return undefined;
}

function rejected(
  ledger: SubagentBatchResultLedger,
  reason: SubagentBatchReportRejectReason,
  message: string,
): SubagentBatchReportApplyResult {
  return {
    outcome: "rejected",
    ledger,
    reason,
    message,
  };
}
