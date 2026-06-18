import {
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  isAmbientSubagentsEnabled,
  type AmbientFeatureFlagSnapshot,
} from "../../shared/featureFlags";
import { isSubagentCapacityLeaseSnapshot, type SubagentCapacityLeaseSnapshot } from "../../shared/subagentCapacity";
import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import { subagentResultCanBeSynthesized } from "../../shared/subagentProtocol";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ToolLargeOutputPreview } from "../../shared/threadTypes";

export type SubagentInvariantId =
  | "parent-child-linkage"
  | "feature-flag-enabled"
  | "safe-parent-synthesis"
  | "mutating-child-isolated"
  | "capacity-close-preserves-history"
  | "large-output-artifact-backed"
  | "child-event-attribution";

export interface SubagentInvariantViolation {
  id: SubagentInvariantId;
  message: string;
  runId?: string;
}

export interface LargeOutputPreviewMissingArtifactItem {
  label: string;
  chars: number;
  previewChars: number;
}

export interface SubagentRunInvariantInput {
  runId?: string;
  parentRunId?: string;
  parentThreadId?: string;
  childThreadId?: string;
  canonicalPath?: string;
  roleId?: string;
  featureFlags?: AmbientFeatureFlagSnapshot;
  capacityLeaseSnapshot?: SubagentCapacityLeaseSnapshot | unknown;
}

export function validateSubagentRunLinkage(input: SubagentRunInvariantInput): SubagentInvariantViolation[] {
  const violations: SubagentInvariantViolation[] = [];
  const missing = [
    ["parentRunId", input.parentRunId],
    ["parentThreadId", input.parentThreadId],
    ["childThreadId", input.childThreadId],
    ["canonicalPath", input.canonicalPath],
    ["featureFlags", input.featureFlags],
    ["capacityLeaseSnapshot", input.capacityLeaseSnapshot],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    violations.push({
      id: "parent-child-linkage",
      runId: input.runId,
      message: `Sub-agent run is missing required linkage fields: ${missing.map(([name]) => name).join(", ")}.`,
    });
  }

  if (input.featureFlags && !isAmbientSubagentsEnabled(input.featureFlags)) {
    violations.push({
      id: "feature-flag-enabled",
      runId: input.runId,
      message: `${AMBIENT_SUBAGENTS_FEATURE_FLAG} must be enabled in the run snapshot before creating a child run.`,
    });
  }

  const capacityLeaseSnapshot = input.capacityLeaseSnapshot;
  if (capacityLeaseSnapshot) {
    if (!isSubagentCapacityLeaseSnapshot(capacityLeaseSnapshot)) {
      violations.push({
        id: "parent-child-linkage",
        runId: input.runId,
        message: "Sub-agent run capacity lease snapshot must use schema ambient-subagent-capacity-lease-v1.",
      });
    } else {
      const mismatches = capacityLeaseLinkageMismatches(input, capacityLeaseSnapshot);
      if (mismatches.length > 0) {
        violations.push({
          id: "parent-child-linkage",
          runId: input.runId,
          message: `Sub-agent run capacity lease snapshot does not match linkage fields: ${mismatches.join("; ")}.`,
        });
      }
    }
  }

  return violations;
}

export function assertSubagentRunLinkage(input: SubagentRunInvariantInput): void {
  const violations = validateSubagentRunLinkage(input);
  if (violations.length > 0) {
    throw new Error(violations.map((violation) => violation.message).join(" "));
  }
}

function capacityLeaseLinkageMismatches(
  input: SubagentRunInvariantInput,
  lease: SubagentCapacityLeaseSnapshot,
): string[] {
  return [
    mismatch("parentThreadId", lease.parentThreadId, input.parentThreadId),
    mismatch("parentRunId", lease.parentRunId, input.parentRunId),
    mismatch("childRunId", lease.childRunId, input.runId),
    mismatch("childThreadId", lease.childThreadId, input.childThreadId),
    mismatch("canonicalTaskPath", lease.canonicalTaskPath, input.canonicalPath),
    mismatch("roleId", lease.roleId, input.roleId),
  ].filter((item): item is string => Boolean(item));
}

function mismatch(field: string, actual: string | undefined, expected: string | undefined): string | undefined {
  if (!expected || actual === expected) return undefined;
  return `lease ${field} ${String(actual)} does not match ${expected}`;
}

function retainedHistoryMismatch(field: string, actual: string | undefined, expected: string | undefined): string | undefined {
  if (!expected || actual === expected) return undefined;
  return `${field} ${String(actual)} does not match ${expected}`;
}

function jsonEquivalent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function validateParentSynthesisSafety(input: {
  runId?: string;
  status: SubagentRunStatus;
  partial?: boolean;
}): SubagentInvariantViolation[] {
  if (subagentResultCanBeSynthesized(input)) return [];
  return [
    {
      id: "safe-parent-synthesis",
      runId: input.runId,
      message: `Parent synthesis cannot consume child status ${input.status} unless it is explicitly marked as a partial result.`,
    },
  ];
}

export function validateLargeOutputArtifact(input: {
  runId?: string;
  previewBytes: number;
  fullOutputBytes: number;
  artifactPath?: string;
  previewLimitBytes: number;
}): SubagentInvariantViolation[] {
  if (input.fullOutputBytes <= input.previewLimitBytes) return [];
  if (input.artifactPath) return [];
  return [
    {
      id: "large-output-artifact-backed",
      runId: input.runId,
      message: `Large child output (${input.fullOutputBytes} bytes) needs a full artifact path beyond the ${input.previewLimitBytes} byte preview.`,
    },
  ];
}

export function largeOutputPreviewItemsMissingArtifacts(input: {
  preview: ToolLargeOutputPreview;
  artifactPath?: string;
}): LargeOutputPreviewMissingArtifactItem[] {
  const fallbackArtifactPath = input.artifactPath?.trim();
  return input.preview.items
    .filter((item) =>
      (item.truncated || item.previewChars < item.chars) &&
      !item.artifactPath?.trim() &&
      !fallbackArtifactPath
    )
    .map((item) => ({
      label: item.label,
      chars: item.chars,
      previewChars: item.previewChars,
    }));
}

export function validateLargeOutputPreviewArtifacts(input: {
  runId?: string;
  preview: ToolLargeOutputPreview;
  artifactPath?: string;
}): SubagentInvariantViolation[] {
  const missing = largeOutputPreviewItemsMissingArtifacts(input);
  if (missing.length === 0) return [];
  return [
    {
      id: "large-output-artifact-backed",
      runId: input.runId,
      message: `Large child output preview needs full artifact paths for truncated items: ${missing
        .map((item) => `${item.label} ${item.chars}/${item.previewChars}`)
        .join(", ")}.`,
    },
  ];
}

export function validateCapacityClosePreservesHistory(input: {
  before: SubagentRunSummary;
  after: SubagentRunSummary;
}): SubagentInvariantViolation[] {
  const violations: SubagentInvariantViolation[] = [];
  const identityMismatches = [
    retainedHistoryMismatch("runId", input.after.id, input.before.id),
    retainedHistoryMismatch("parentThreadId", input.after.parentThreadId, input.before.parentThreadId),
    retainedHistoryMismatch("parentRunId", input.after.parentRunId, input.before.parentRunId),
    retainedHistoryMismatch("childThreadId", input.after.childThreadId, input.before.childThreadId),
    retainedHistoryMismatch("canonicalTaskPath", input.after.canonicalTaskPath, input.before.canonicalTaskPath),
    retainedHistoryMismatch("roleId", input.after.roleId, input.before.roleId),
  ].filter((item): item is string => Boolean(item));

  if (identityMismatches.length > 0) {
    violations.push({
      id: "capacity-close-preserves-history",
      runId: input.before.id,
      message: `Closing a sub-agent must preserve run/thread history identity: ${identityMismatches.join("; ")}.`,
    });
  }

  if (!input.after.closedAt) {
    violations.push({
      id: "capacity-close-preserves-history",
      runId: input.before.id,
      message: "Closing a sub-agent must mark the run closed before capacity is considered released.",
    });
  }

  if (input.before.resultArtifact !== undefined && !jsonEquivalent(input.before.resultArtifact, input.after.resultArtifact)) {
    violations.push({
      id: "capacity-close-preserves-history",
      runId: input.before.id,
      message: "Closing a sub-agent must preserve the existing result artifact reference.",
    });
  }

  const capacityLeaseSnapshot = input.after.capacityLeaseSnapshot;
  if (!isSubagentCapacityLeaseSnapshot(capacityLeaseSnapshot)) {
    violations.push({
      id: "capacity-close-preserves-history",
      runId: input.before.id,
      message: "Closed sub-agent run capacity lease snapshot must use schema ambient-subagent-capacity-lease-v1.",
    });
    return violations;
  }

  if (capacityLeaseSnapshot.status !== "released" || !capacityLeaseSnapshot.releasedAt) {
    violations.push({
      id: "capacity-close-preserves-history",
      runId: input.before.id,
      message: "Closing a sub-agent must release its capacity lease while retaining transcript and artifact history.",
    });
  }

  const leaseMismatches = capacityLeaseLinkageMismatches({
    runId: input.after.id,
    parentRunId: input.after.parentRunId,
    parentThreadId: input.after.parentThreadId,
    childThreadId: input.after.childThreadId,
    canonicalPath: input.after.canonicalTaskPath,
    roleId: input.after.roleId,
  }, capacityLeaseSnapshot);
  if (leaseMismatches.length > 0) {
    violations.push({
      id: "capacity-close-preserves-history",
      runId: input.before.id,
      message: `Closed sub-agent capacity lease no longer matches retained run/thread history: ${leaseMismatches.join("; ")}.`,
    });
  }

  return violations;
}

export function assertCapacityClosePreservesHistory(input: {
  before: SubagentRunSummary;
  after: SubagentRunSummary;
}): void {
  const violations = validateCapacityClosePreservesHistory(input);
  if (violations.length > 0) {
    throw new Error(violations.map((violation) => violation.message).join(" "));
  }
}

export function validateChildEventAttribution(input: {
  runId?: string;
  eventType: string;
}): SubagentInvariantViolation[] {
  if (input.runId) return [];
  return [
    {
      id: "child-event-attribution",
      message: `Sub-agent event ${input.eventType} must identify the originating child run.`,
    },
  ];
}

export function validateSubagentRunEventAttribution(input: {
  runId?: string;
  eventType: string;
  preview?: unknown;
}): SubagentInvariantViolation[] {
  if (input.eventType === "subagent.approval_requested" || input.eventType === "subagent.child_approval_forwarded") {
    return validateSubagentApprovalRunEventAttribution(input);
  }
  if (input.eventType === "subagent.supervisor_request") {
    return validateSubagentSupervisorRunEventAttribution(input);
  }
  if (SUBAGENT_CHILD_CONTROL_RUN_EVENT_TYPES.includes(input.eventType as typeof SUBAGENT_CHILD_CONTROL_RUN_EVENT_TYPES[number])) {
    return validateSubagentChildControlRunEventAttribution(input);
  }
  if (SUBAGENT_WORKTREE_CHILD_RUN_EVENT_TYPES.includes(input.eventType as typeof SUBAGENT_WORKTREE_CHILD_RUN_EVENT_TYPES[number])) {
    return validateSubagentWorktreeRunEventAttribution(input);
  }
  if (SUBAGENT_LOCAL_TEXT_CHILD_RUN_EVENT_TYPES.includes(input.eventType as typeof SUBAGENT_LOCAL_TEXT_CHILD_RUN_EVENT_TYPES[number])) {
    return validateSubagentLocalTextRunEventAttribution(input);
  }
  if (input.eventType !== "subagent.runtime_event") return [];
  const preview = recordValue(input.preview);
  if (!preview) {
    return [
      {
        id: "child-event-attribution",
        runId: input.runId,
        message: "Sub-agent runtime event must include an attributed runtime preview.",
      },
    ];
  }
  if (preview.schemaVersion !== "ambient-subagent-runtime-event-v1") {
    return [
      {
        id: "child-event-attribution",
        runId: input.runId,
        message: "Sub-agent runtime event preview must use schema ambient-subagent-runtime-event-v1.",
      },
    ];
  }
  const previewRunId = stringField(preview, "runId") ?? stringField(preview, "childRunId");
  const missing = [
    ["runId", previewRunId],
    ["parentThreadId", stringField(preview, "parentThreadId")],
    ["parentRunId", stringField(preview, "parentRunId")],
    ["childThreadId", stringField(preview, "childThreadId")],
    ["canonicalTaskPath", stringField(preview, "canonicalTaskPath")],
  ].filter(([, value]) => !value);
  const violations: SubagentInvariantViolation[] = [];
  if (missing.length > 0) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent runtime event is missing attribution fields: ${missing.map(([name]) => name).join(", ")}.`,
    });
  }
  if (input.runId && previewRunId && previewRunId !== input.runId) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent runtime event runId ${previewRunId} does not match persisted child run ${input.runId}.`,
    });
  }
  return violations;
}

const SUBAGENT_CHILD_CONTROL_RUN_EVENT_TYPES = [
  "subagent.send_agent.queued",
  "subagent.followup_agent.queued",
  "subagent.followup_refused",
  "subagent.approval_response.refused",
  "subagent.child_runtime_refused",
  "subagent.cancel_requested",
  "subagent.close_requested",
] as const;

function validateSubagentChildControlRunEventAttribution(input: {
  runId?: string;
  eventType: string;
  preview?: unknown;
}): SubagentInvariantViolation[] {
  const preview = recordValue(input.preview);
  if (!preview) {
    return [
      {
        id: "child-event-attribution",
        runId: input.runId,
        message: `Sub-agent control event ${input.eventType} must include an attributed preview.`,
      },
    ];
  }
  const childRunId = stringField(preview, "childRunId") ?? stringField(preview, "runId");
  const missing = [
    ["childRunId", childRunId],
    ["childThreadId", stringField(preview, "childThreadId")],
    ["parentRunId", stringField(preview, "parentRunId")],
    ["parentThreadId", stringField(preview, "parentThreadId")],
    ["canonicalTaskPath", stringField(preview, "canonicalTaskPath")],
  ].filter(([, value]) => !value);
  const violations: SubagentInvariantViolation[] = [];
  if (missing.length > 0) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent control event ${input.eventType} is missing attribution fields: ${missing.map(([name]) => name).join(", ")}.`,
    });
  }
  if (input.runId && childRunId && childRunId !== input.runId) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent control event childRunId ${childRunId} does not match persisted child run ${input.runId}.`,
    });
  }
  return violations;
}

const SUBAGENT_WORKTREE_CHILD_RUN_EVENT_TYPES = [
  "subagent.worktree_prepared",
  "subagent.worktree_unavailable",
] as const;

function validateSubagentWorktreeRunEventAttribution(input: {
  runId?: string;
  eventType: string;
  preview?: unknown;
}): SubagentInvariantViolation[] {
  const preview = recordValue(input.preview);
  if (!preview) {
    return [
      {
        id: "child-event-attribution",
        runId: input.runId,
        message: `Sub-agent worktree event ${input.eventType} must include an attributed preview.`,
      },
    ];
  }
  const childRunId = stringField(preview, "childRunId") ?? stringField(preview, "runId");
  const missing = [
    ["childRunId", childRunId],
    ["childThreadId", stringField(preview, "childThreadId")],
    ["parentRunId", stringField(preview, "parentRunId")],
    ["parentThreadId", stringField(preview, "parentThreadId")],
    ["canonicalTaskPath", stringField(preview, "canonicalTaskPath")],
  ].filter(([, value]) => !value);
  const violations: SubagentInvariantViolation[] = [];
  if (missing.length > 0) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent worktree event ${input.eventType} is missing attribution fields: ${missing.map(([name]) => name).join(", ")}.`,
    });
  }
  if (input.runId && childRunId && childRunId !== input.runId) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent worktree event childRunId ${childRunId} does not match persisted child run ${input.runId}.`,
    });
  }
  return violations;
}

const SUBAGENT_LOCAL_TEXT_CHILD_RUN_EVENT_TYPES = [
  "subagent.local_text_preflight",
  "subagent.local_text_started",
  "subagent.local_text_completed",
  "subagent.local_text_failed",
  "subagent.local_text_runtime_failed",
  "subagent.local_text_release_after_failure",
  "subagent.local_text_release_after_cancel",
  "subagent.local_text_release_after_partial",
  "subagent.runtime_budget_exceeded",
  "subagent.runtime_hard_cap_exceeded",
  "subagent.runtime_idle_timeout",
] as const;

function validateSubagentLocalTextRunEventAttribution(input: {
  runId?: string;
  eventType: string;
  preview?: unknown;
}): SubagentInvariantViolation[] {
  const preview = recordValue(input.preview);
  if (!preview) {
    return [
      {
        id: "child-event-attribution",
        runId: input.runId,
        message: `Sub-agent local text event ${input.eventType} must include an attributed preview.`,
      },
    ];
  }
  const childRunId = stringField(preview, "childRunId") ?? stringField(preview, "runId");
  const missing = [
    ["childRunId", childRunId],
    ["childThreadId", stringField(preview, "childThreadId")],
  ].filter(([, value]) => !value);
  const violations: SubagentInvariantViolation[] = [];
  if (missing.length > 0) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent local text event ${input.eventType} is missing attribution fields: ${missing.map(([name]) => name).join(", ")}.`,
    });
  }
  if (input.runId && childRunId && childRunId !== input.runId) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent local text event childRunId ${childRunId} does not match persisted child run ${input.runId}.`,
    });
  }
  return violations;
}

function validateSubagentSupervisorRunEventAttribution(input: {
  runId?: string;
  eventType: string;
  preview?: unknown;
}): SubagentInvariantViolation[] {
  const preview = recordValue(input.preview);
  if (!preview) {
    return [
      {
        id: "child-event-attribution",
        runId: input.runId,
        message: "Sub-agent supervisor request event must include an attributed supervisor preview.",
      },
    ];
  }
  if (preview.schemaVersion !== "ambient-subagent-supervisor-request-v1") {
    return [
      {
        id: "child-event-attribution",
        runId: input.runId,
        message: "Sub-agent supervisor request event preview must use schema ambient-subagent-supervisor-request-v1.",
      },
    ];
  }
  const childRunId = stringField(preview, "childRunId") ?? stringField(preview, "runId");
  const missing = [
    ["childRunId", childRunId],
    ["childThreadId", stringField(preview, "childThreadId")],
    ["kind", stringField(preview, "kind")],
  ].filter(([, value]) => !value);
  const violations: SubagentInvariantViolation[] = [];
  if (missing.length > 0) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent supervisor request event is missing attribution fields: ${missing.map(([name]) => name).join(", ")}.`,
    });
  }
  if (input.runId && childRunId && childRunId !== input.runId) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent supervisor request event childRunId ${childRunId} does not match persisted child run ${input.runId}.`,
    });
  }
  return violations;
}

function validateSubagentApprovalRunEventAttribution(input: {
  runId?: string;
  eventType: string;
  preview?: unknown;
}): SubagentInvariantViolation[] {
  const preview = recordValue(input.preview);
  if (!preview) {
    return [
      {
        id: "child-event-attribution",
        runId: input.runId,
        message: `Sub-agent approval event ${input.eventType} must include an attributed approval preview.`,
      },
    ];
  }
  if (preview.schemaVersion !== "ambient-subagent-approval-bridge-v1") {
    return [
      {
        id: "child-event-attribution",
        runId: input.runId,
        message: "Sub-agent approval event preview must use schema ambient-subagent-approval-bridge-v1.",
      },
    ];
  }
  const childRunId = stringField(preview, "childRunId") ?? stringField(preview, "runId");
  const missing = [
    ["childRunId", childRunId],
    ["childThreadId", stringField(preview, "childThreadId")],
    ["approvalId", stringField(preview, "approvalId")],
  ].filter(([, value]) => !value);
  const violations: SubagentInvariantViolation[] = [];
  if (missing.length > 0) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent approval event ${input.eventType} is missing attribution fields: ${missing.map(([name]) => name).join(", ")}.`,
    });
  }
  if (input.runId && childRunId && childRunId !== input.runId) {
    violations.push({
      id: "child-event-attribution",
      runId: input.runId,
      message: `Sub-agent approval event childRunId ${childRunId} does not match persisted child run ${input.runId}.`,
    });
  }
  return violations;
}

export function assertSubagentRunEventAttribution(input: {
  runId?: string;
  eventType: string;
  preview?: unknown;
}): void {
  const violations = validateSubagentRunEventAttribution(input);
  if (violations.length > 0) {
    throw new Error(violations.map((violation) => violation.message).join(" "));
  }
}

export const SUBAGENT_CHILD_SCOPED_PARENT_MAILBOX_TYPES = [
  "subagent.child_approval_requested",
  "subagent.child_approval_forwarded",
  "subagent.child_supervisor_request",
  "subagent.lifecycle_interrupted",
  "subagent.wait_barrier_attention",
  "subagent.wait_barrier_decision",
  "subagent.grouped_completion",
  "subagent.cancellation_cascade",
  "subagent.parent_control_reconciled",
] as const;

export function validateSubagentParentMailboxEventAttribution(input: {
  parentRunId?: string;
  type: string;
  payload?: unknown;
}): SubagentInvariantViolation[] {
  if (!SUBAGENT_CHILD_SCOPED_PARENT_MAILBOX_TYPES.includes(input.type as typeof SUBAGENT_CHILD_SCOPED_PARENT_MAILBOX_TYPES[number])) {
    return [];
  }
  const childRunRefs = subagentChildRunRefsFromParentMailboxPayload(input.payload);
  if (childRunRefs.length > 0) return [];
  return [
    {
      id: "child-event-attribution",
      runId: input.parentRunId,
      message: `Sub-agent parent mailbox event ${input.type} must identify at least one originating child run.`,
    },
  ];
}

export function assertSubagentParentMailboxEventAttribution(input: {
  parentRunId?: string;
  type: string;
  payload?: unknown;
}): void {
  const violations = validateSubagentParentMailboxEventAttribution(input);
  if (violations.length > 0) {
    throw new Error(violations.map((violation) => violation.message).join(" "));
  }
}

function subagentChildRunRefsFromParentMailboxPayload(payload: unknown): string[] {
  const record = recordValue(payload);
  if (!record) return [];
  const refs = new Set<string>();
  addStringRef(refs, record, "childRunId");
  addStringRef(refs, record, "runId");
  addStringArrayRefs(refs, record, "childRunIds");
  addStringArrayRefs(refs, record, "cancelledRunIds");
  addStringArrayRefs(refs, record, "detachedRunIds");
  addStringArrayRefs(refs, record, "unchangedRunIds");
  addStringArrayRefs(refs, record, "stoppedChildRunIds");
  addRecordArrayRefs(refs, record.childRuns, ["runId", "childRunId", "id"]);
  addRecordArrayRefs(refs, record.childStatuses, ["childRunId", "runId"]);
  const waitBarrier = recordValue(record.waitBarrier);
  if (waitBarrier) addStringArrayRefs(refs, waitBarrier, "childRunIds");
  const parentResolution = recordValue(record.parentResolution);
  if (parentResolution) addStringRef(refs, parentResolution, "childRunId");
  return [...refs];
}

function addStringRef(refs: Set<string>, record: Record<string, unknown>, key: string): void {
  const value = stringField(record, key);
  if (value) refs.add(value);
}

function addStringArrayRefs(refs: Set<string>, record: Record<string, unknown>, key: string): void {
  const value = record[key];
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string" && item.trim()) refs.add(item.trim());
  }
}

function addRecordArrayRefs(refs: Set<string>, value: unknown, keys: string[]): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const record = recordValue(item);
    if (!record) continue;
    for (const key of keys) addStringRef(refs, record, key);
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
