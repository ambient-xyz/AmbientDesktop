import { isAbsolute, resolve } from "node:path";
import type { SubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentRunEventSummary, SubagentRunSummary } from "../../shared/types";
import { isPathInside } from "../session/sessionPaths";

export interface SubagentCompletionGuardValidation {
  valid: boolean;
  synthesisAllowed: boolean;
  required: boolean;
  reason?: string;
  structuredEvidenceCount: number;
  ambientEvidenceCount: number;
  isolatedWorktreeEvidenceCount: number;
  approvalEvidenceCount: number;
}

const MUTATING_TOOL_CATEGORIES = new Set([
  "workspace.write",
  "artifact.write",
  "browser.interactive",
  "connector.write",
  "mcp.direct",
]);

const MUTATING_EVENT_TYPES = new Set([
  "subagent.mutation_evidence",
  "subagent.workspace_write",
  "subagent.artifact_written",
  "subagent.tool_mutation",
]);

const APPROVAL_PROVENANCE_SOURCES = new Set([
  "permission_grant",
  "permission_audit",
  "permission_policy",
  "permission_prompt",
  "policy",
]);

export function validateSubagentCompletionGuard(input: {
  role: SubagentRoleProfile;
  run: SubagentRunSummary;
  events: readonly SubagentRunEventSummary[];
}): SubagentCompletionGuardValidation {
  if (!input.role.guardPolicy.implementationEvidenceRequired) {
    return {
      valid: true,
      synthesisAllowed: true,
      required: false,
      structuredEvidenceCount: 0,
      ambientEvidenceCount: 0,
      isolatedWorktreeEvidenceCount: 0,
      approvalEvidenceCount: 0,
    };
  }
  const artifact = objectRecord(input.run.resultArtifact);
  if (artifact?.status !== "completed" || artifact.partial !== false) {
    return {
      valid: true,
      synthesisAllowed: false,
      required: true,
      reason: "Implementation completion guard applies only to completed child artifacts.",
      structuredEvidenceCount: 0,
      ambientEvidenceCount: 0,
      isolatedWorktreeEvidenceCount: 0,
      approvalEvidenceCount: 0,
    };
  }
  const structuredEvidence = structuredMutationEvidence(artifact);
  const ambientEvidence = ambientMutationEvidence(input.run, input.events);
  if (structuredEvidence.length === 0) {
    return invalidCompletionGuard("Implementation roles require structured mutation evidence before completed synthesis.", 0, ambientEvidence.length);
  }
  if (ambientEvidence.length === 0) {
    return invalidCompletionGuard("Implementation roles require Ambient-recorded mutation evidence before completed synthesis.", structuredEvidence.length, 0);
  }
  if (!evidenceIntersects(structuredEvidence, ambientEvidence)) {
    return invalidCompletionGuard(
      "Implementation structured mutation evidence must match an Ambient-recorded mutation event.",
      structuredEvidence.length,
      ambientEvidence.length,
    );
  }
  if (input.role.mutationPolicy === "requires_isolated_worktree") {
    const matchingEvidence = matchingAmbientEvidence(structuredEvidence, ambientEvidence);
    const isolatedWorktreeEvidence = matchingEvidence.filter((evidence) => evidence.worktreeIsolated && Boolean(evidence.worktreePath));
    const approvalEvidence = isolatedWorktreeEvidence.filter((evidence) =>
      evidence.childRunId === input.run.id && recognizedApprovalProvenance(evidence)
    );
    if (approvalEvidence.length === 0) {
      return invalidCompletionGuard(
        "Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
        structuredEvidence.length,
        ambientEvidence.length,
        isolatedWorktreeEvidence.length,
        approvalEvidence.length,
      );
    }
  }
  return {
    valid: true,
    synthesisAllowed: true,
    required: true,
    structuredEvidenceCount: structuredEvidence.length,
    ambientEvidenceCount: ambientEvidence.length,
    isolatedWorktreeEvidenceCount: input.role.mutationPolicy === "requires_isolated_worktree"
      ? matchingAmbientEvidence(structuredEvidence, ambientEvidence).filter((evidence) => evidence.worktreeIsolated && Boolean(evidence.worktreePath)).length
      : 0,
    approvalEvidenceCount: input.role.mutationPolicy === "requires_isolated_worktree"
      ? matchingAmbientEvidence(structuredEvidence, ambientEvidence).filter((evidence) =>
        evidence.worktreeIsolated &&
        Boolean(evidence.worktreePath) &&
        evidence.childRunId === input.run.id &&
        recognizedApprovalProvenance(evidence)
      ).length
      : 0,
  };
}

function invalidCompletionGuard(
  reason: string,
  structuredEvidenceCount: number,
  ambientEvidenceCount: number,
  isolatedWorktreeEvidenceCount = 0,
  approvalEvidenceCount = 0,
): SubagentCompletionGuardValidation {
  return {
    valid: false,
    synthesisAllowed: false,
    required: true,
    reason,
    structuredEvidenceCount,
    ambientEvidenceCount,
    isolatedWorktreeEvidenceCount,
    approvalEvidenceCount,
  };
}

function structuredMutationEvidence(artifact: Record<string, unknown>): EvidenceRef[] {
  const structuredOutput = objectRecord(artifact.structuredOutput);
  const roleOutput = objectRecord(structuredOutput?.roleOutput);
  const evidence = Array.isArray(roleOutput?.mutationEvidence) ? roleOutput.mutationEvidence : [];
  return evidence.flatMap(evidenceRefsFromUnknown);
}

function ambientMutationEvidence(run: SubagentRunSummary, events: readonly SubagentRunEventSummary[]): EvidenceRef[] {
  return events.flatMap((event) => {
    if (event.runId !== run.id) return [];
    const preview = objectRecord(event.preview);
    const nestedEvent = objectRecord(preview?.event) ?? preview;
    const category = stringValue(nestedEvent?.category) ?? stringValue(nestedEvent?.toolCategory) ?? stringValue(nestedEvent?.toolCategoryId);
    const runtimeDetails = objectRecord(nestedEvent?.details);
    const detailsCategory = stringValue(runtimeDetails?.category) ?? stringValue(runtimeDetails?.toolCategory) ?? stringValue(runtimeDetails?.toolCategoryId);
    const mutatingCategory = category && MUTATING_TOOL_CATEGORIES.has(category)
      ? category
      : detailsCategory && MUTATING_TOOL_CATEGORIES.has(detailsCategory)
      ? detailsCategory
      : undefined;
    const mutatingType = MUTATING_EVENT_TYPES.has(event.type) || nestedEvent?.type === "tool_result" && Boolean(mutatingCategory);
    if (!mutatingType) return [];
    return evidenceRefsFromUnknown({
      childRunId: stringValue(nestedEvent?.childRunId) ?? stringValue(nestedEvent?.runId) ??
        stringValue(runtimeDetails?.childRunId) ?? stringValue(runtimeDetails?.runId) ?? event.runId,
      toolCallId: nestedEvent?.toolCallId ?? runtimeDetails?.toolCallId,
      artifactPath: event.artifactPath ?? nestedEvent?.artifactPath ?? runtimeDetails?.artifactPath,
      path: nestedEvent?.path ?? runtimeDetails?.path,
      category: mutatingCategory,
      worktreePath: nestedEvent?.worktreePath ?? runtimeDetails?.worktreePath,
      worktreeIsolated: nestedEvent?.worktreeIsolated ?? runtimeDetails?.worktreeIsolated,
      approvalId: nestedEvent?.approvalId ?? runtimeDetails?.approvalId,
      approvalGrantId: nestedEvent?.approvalGrantId ?? runtimeDetails?.approvalGrantId,
      permissionGrantId: nestedEvent?.permissionGrantId ?? runtimeDetails?.permissionGrantId,
      approvalSource: nestedEvent?.approvalSource ?? runtimeDetails?.approvalSource,
    }).map((evidence) => applyMutationLeaseIsolation(run, evidence));
  });
}

function applyMutationLeaseIsolation(run: SubagentRunSummary, evidence: EvidenceRef): EvidenceRef {
  const lease = run.symphonyMutationWorkspaceLease;
  if (!lease || !["active", "promoting", "released"].includes(lease.status)) return evidence;
  if (evidence.childRunId && evidence.childRunId !== run.id) return evidence;
  if (!evidence.category || !MUTATING_TOOL_CATEGORIES.has(evidence.category)) return evidence;
  if (!evidencePathWithinLease(evidence, lease)) return evidence;
  return {
    ...evidence,
    childRunId: evidence.childRunId ?? run.id,
    worktreeIsolated: true,
    worktreePath: evidence.worktreePath ?? lease.rootPath,
  };
}

function evidencePathWithinLease(
  evidence: EvidenceRef,
  lease: NonNullable<SubagentRunSummary["symphonyMutationWorkspaceLease"]>,
): boolean {
  const path = evidence.path ?? evidence.artifactPath;
  if (!path) return false;
  const candidate = isAbsolute(path) ? path : resolve(lease.rootPath, path);
  return lease.writableRoots.some((root) => isPathInside(root, candidate));
}

interface EvidenceRef {
  childRunId?: string;
  toolCallId?: string;
  artifactPath?: string;
  path?: string;
  category?: string;
  worktreePath?: string;
  worktreeIsolated?: boolean;
  approvalId?: string;
  approvalSource?: string;
}

function evidenceRefsFromUnknown(value: unknown): EvidenceRef[] {
  if (Array.isArray(value)) return value.flatMap(evidenceRefsFromUnknown);
  const record = objectRecord(value);
  if (!record) return [];
  const approvalGrantId = stringValue(record.approvalGrantId) ?? stringValue(record.permissionGrantId);
  const approvalId = stringValue(record.approvalId) ?? approvalGrantId;
  const approvalSource = normalizeApprovalSource(record.approvalSource) ?? (approvalGrantId ? "permission_grant" : undefined);
  const ref: EvidenceRef = {
    ...(stringValue(record.childRunId) ? { childRunId: stringValue(record.childRunId) } : {}),
    ...(stringValue(record.runId) ? { childRunId: stringValue(record.runId) } : {}),
    ...(stringValue(record.toolCallId) ? { toolCallId: stringValue(record.toolCallId) } : {}),
    ...(stringValue(record.artifactPath) ? { artifactPath: stringValue(record.artifactPath) } : {}),
    ...(stringValue(record.path) ? { path: stringValue(record.path) } : {}),
    ...(stringValue(record.filePath) ? { path: stringValue(record.filePath) } : {}),
    ...(stringValue(record.category) ? { category: stringValue(record.category) } : {}),
    ...(stringValue(record.toolCategory) ? { category: stringValue(record.toolCategory) } : {}),
    ...(stringValue(record.toolCategoryId) ? { category: stringValue(record.toolCategoryId) } : {}),
    ...(stringValue(record.worktreePath) ? { worktreePath: stringValue(record.worktreePath) } : {}),
    ...(booleanValue(record.worktreeIsolated) !== undefined ? { worktreeIsolated: booleanValue(record.worktreeIsolated) } : {}),
    ...(approvalId ? { approvalId } : {}),
    ...(approvalSource ? { approvalSource } : {}),
  };
  return Object.keys(ref).length ? [ref] : [];
}

function recognizedApprovalProvenance(evidence: EvidenceRef): boolean {
  return Boolean(evidence.approvalId && evidence.approvalSource && APPROVAL_PROVENANCE_SOURCES.has(evidence.approvalSource));
}

function evidenceIntersects(structured: EvidenceRef[], ambient: EvidenceRef[]): boolean {
  return matchingAmbientEvidence(structured, ambient).length > 0;
}

function matchingAmbientEvidence(structured: EvidenceRef[], ambient: EvidenceRef[]): EvidenceRef[] {
  return ambient.filter((right) => structured.some((left) => {
    if (left.childRunId && right.childRunId && left.childRunId !== right.childRunId) return false;
    if (left.category && right.category && left.category !== right.category) return false;
    if (left.toolCallId && right.toolCallId && left.toolCallId === right.toolCallId) return true;
    if (left.artifactPath && right.artifactPath && left.artifactPath === right.artifactPath) return true;
    if (left.path && right.path && left.path === right.path) return true;
    return false;
  }));
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeApprovalSource(value: unknown): string | undefined {
  const source = stringValue(value);
  return source ? source.toLowerCase().replace(/[\s-]+/g, "_") : undefined;
}
