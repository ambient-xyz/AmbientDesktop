import type { SubagentCapacityLeaseSnapshot } from "../shared/subagentCapacity";
import {
  compactSubagentTurnBudgetPolicyForPi,
  resolveSubagentTurnBudgetPolicy,
  type SubagentTurnBudgetState,
} from "../shared/subagentTurnBudget";
import type { SubagentMailboxEventSummary, SubagentRunEventSummary, SubagentRunSummary, SubagentWaitBarrierSummary } from "../shared/types";
import type { SubagentParentPolicyResolution } from "./subagentParentPolicyResolution";

export const SUBAGENT_AGENT_STATUS_SCHEMA_VERSION = "ambient-subagent-agent-status-v1" as const;

export function compactSubagentCapacityLeaseForPi(lease: SubagentCapacityLeaseSnapshot): Record<string, unknown> {
  return {
    schemaVersion: lease.schemaVersion,
    leaseId: lease.leaseId,
    status: lease.status,
    canonicalTaskPath: lease.canonicalTaskPath,
    roleId: lease.roleId,
    provider: {
      providerId: lease.provider.providerId,
      modelId: lease.provider.modelId,
      locality: lease.provider.locality,
      profile: lease.provider.profile,
      openRunCount: lease.provider.openRunCount,
      projectedOpenRunCount: lease.provider.projectedOpenRunCount,
      ...(lease.provider.concurrencyLimit !== undefined ? { concurrencyLimit: lease.provider.concurrencyLimit } : {}),
      allowed: lease.provider.allowed,
      reason: lease.provider.reason,
    },
    depth: lease.depth,
    localMemory: lease.localMemory,
    blockingReasons: lease.blockingReasons,
    ...(lease.releasedAt ? { releasedAt: lease.releasedAt } : {}),
  };
}

export function compactSubagentRunForPi(run: SubagentRunSummary): Record<string, unknown> {
  return {
    schemaVersion: SUBAGENT_AGENT_STATUS_SCHEMA_VERSION,
    id: run.id,
    parentThreadId: run.parentThreadId,
    parentRunId: run.parentRunId,
    childThreadId: run.childThreadId,
    canonicalTaskPath: run.canonicalTaskPath,
    roleId: run.roleId,
    roleLabel: run.roleProfileSnapshot.label,
    roleProfileSnapshotSource: run.roleProfileSnapshotSource,
    ...(run.effectiveRoleSnapshot
      ? {
        effectiveRole: {
          schemaVersion: run.effectiveRoleSnapshot.schemaVersion,
          baseRole: run.effectiveRoleSnapshot.baseRole,
          patternRole: run.effectiveRoleSnapshot.patternRole,
          displayLabel: run.effectiveRoleSnapshot.displayLabel,
          roleOverlayIds: run.effectiveRoleSnapshot.roleOverlayIds,
          overlayLabels: run.effectiveRoleSnapshot.overlays.map((overlay) => overlay.label),
          nonWidening: run.effectiveRoleSnapshot.nonWidening,
          ...(run.effectiveRoleSnapshot.outputContract ? { outputContract: run.effectiveRoleSnapshot.outputContract } : {}),
        },
      }
      : {}),
    schedulingPolicy: run.roleProfileSnapshot.schedulingPolicy,
    dependencyMode: run.dependencyMode,
    status: run.status,
    capacityLease: compactSubagentCapacityLeaseForPi(run.capacityLeaseSnapshot),
    turnBudgetPolicy: compactSubagentTurnBudgetPolicyForPi(resolveSubagentTurnBudgetPolicy(run.roleProfileSnapshot)),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.closedAt ? { closedAt: run.closedAt } : {}),
  };
}

export function buildSubagentListAgentsText(runs: readonly SubagentRunSummary[]): string {
  if (!runs.length) return "No sub-agent runs exist for this parent thread.";
  return [
    `Sub-agent runs (${runs.length}):`,
    ...runs.map((run) => `- ${run.canonicalTaskPath}: ${run.status} childRunId=${run.id} childThreadId=${run.childThreadId}${run.closedAt ? " closed=true" : ""}`),
  ].join("\n");
}

export function buildSubagentStatusText(input: {
  run: SubagentRunSummary;
  events: readonly SubagentRunEventSummary[];
  mailboxEvents: readonly SubagentMailboxEventSummary[];
  notice?: string;
  parentResolution?: Pick<SubagentParentPolicyResolution, "action" | "canSynthesize" | "instruction">;
  waitBarrier?: Pick<SubagentWaitBarrierSummary, "id" | "status" | "dependencyMode" | "failurePolicy">;
  waitBarrierBlockers?: readonly {
    childRunId: string;
    childThreadId: string;
    canonicalTaskPath: string;
    status: string;
    blockingState: string;
    lastActivityAt: string;
    lastActivitySource: string;
    reason?: string;
  }[];
  turnBudgetState?: Pick<SubagentTurnBudgetState, "state" | "observedTurnCount" | "remainingTurns" | "shouldSteerWrapUp" | "exhausted" | "instruction">;
}): string {
  return [
    `Sub-agent ${input.run.canonicalTaskPath}`,
    `childRunId: ${input.run.id}`,
    `childThreadId: ${input.run.childThreadId}`,
    `status: ${input.run.status}`,
    input.run.closedAt ? `closedAt: ${input.run.closedAt}` : undefined,
    ...(input.parentResolution && !input.parentResolution.canSynthesize
      ? blockedSubagentResultPreviewLines(input.run)
      : subagentResultPreviewLines(input.run)),
    `events: ${input.events.length}`,
    `mailboxEvents: ${input.mailboxEvents.length}`,
    input.turnBudgetState ? `turnBudget: ${input.turnBudgetState.state} observed=${input.turnBudgetState.observedTurnCount} remaining=${input.turnBudgetState.remainingTurns}` : undefined,
    input.turnBudgetState?.shouldSteerWrapUp ? "turnBudgetAction: steer_wrap_up" : undefined,
    input.turnBudgetState?.exhausted ? "turnBudgetAction: exhausted" : undefined,
    input.turnBudgetState?.instruction ? `turnBudgetInstruction: ${input.turnBudgetState.instruction}` : undefined,
    ...waitBarrierStatusLines(input.waitBarrier, input.parentResolution),
    ...waitBarrierBlockerLines(input.waitBarrierBlockers),
    input.notice,
    input.parentResolution ? `parentAction: ${input.parentResolution.action}` : undefined,
    input.parentResolution ? `canSynthesize: ${input.parentResolution.canSynthesize}` : undefined,
    input.parentResolution ? `parentInstruction: ${input.parentResolution.instruction}` : undefined,
  ].filter(Boolean).join("\n");
}

function waitBarrierBlockerLines(
  blockers: readonly {
    childRunId: string;
    childThreadId: string;
    canonicalTaskPath: string;
    status: string;
    blockingState: string;
    lastActivityAt: string;
    lastActivitySource: string;
    reason?: string;
  }[] | undefined,
): string[] {
  if (!blockers?.length) return [];
  return [
    `waitBarrierBlockers: ${blockers.length}`,
    ...blockers.slice(0, 8).map((blocker) =>
      `waitBarrierBlocker: ${blocker.canonicalTaskPath} childRunId=${blocker.childRunId} childThreadId=${blocker.childThreadId} status=${blocker.status} state=${blocker.blockingState} lastActivityAt=${blocker.lastActivityAt} lastActivitySource=${blocker.lastActivitySource}${blocker.reason ? ` reason=${previewText(blocker.reason, 220)}` : ""}`
    ),
    blockers.length > 8 ? `waitBarrierBlockersOmitted: ${blockers.length - 8}` : undefined,
  ].filter((line): line is string => Boolean(line));
}

function waitBarrierStatusLines(
  waitBarrier: Pick<SubagentWaitBarrierSummary, "id" | "status" | "dependencyMode" | "failurePolicy"> | undefined,
  parentResolution: Pick<SubagentParentPolicyResolution, "action" | "canSynthesize"> | undefined,
): string[] {
  if (!waitBarrier) return [];
  const lines = [
    `waitBarrierId: ${waitBarrier.id}`,
    `waitBarrierStatus: ${waitBarrier.status}`,
    `waitBarrierDependencyMode: ${waitBarrier.dependencyMode}`,
    `waitBarrierFailurePolicy: ${waitBarrier.failurePolicy}`,
  ];
  if (parentResolution && !parentResolution.canSynthesize && waitBarrier.status !== "waiting_on_children") {
    lines.push(
      `waitBarrierRecovery: This barrier is terminal. To recover or retry, call ambient_subagent with action resolve_barrier, waitBarrierId ${waitBarrier.id}, and an explicit decision such as retry_child, fail_parent, detach_child, cancel_parent, or continue_with_partial when partial output is allowed. Do not spawn a separate replacement child manually; the original barrier will keep blocking final synthesis until resolve_barrier records the decision.`,
    );
  }
  return lines;
}

function blockedSubagentResultPreviewLines(run: SubagentRunSummary): string[] {
  const artifact = objectRecord(run.resultArtifact);
  if (!artifact) return [];
  const lines = [
    "resultPreviewBlocked: child result is not synthesis-safe; do not use its summary, role output, or artifacts until the wait barrier is resolved.",
  ];
  const status = stringValue(artifact.status);
  const partial = typeof artifact.partial === "boolean" ? artifact.partial : undefined;
  if (status) lines.push(`resultStatus: ${status}${partial !== undefined ? ` partial=${partial}` : ""}`);
  const explicitStatus = stringValue(artifact.explicitStatus);
  if (explicitStatus) lines.push(`resultExplicitStatus: ${explicitStatus}`);
  const guardReason = stringValue(artifact.guardReason);
  if (guardReason) lines.push(`resultGuardReason: ${guardReason}`);
  return lines;
}

function subagentResultPreviewLines(run: SubagentRunSummary): string[] {
  const artifact = objectRecord(run.resultArtifact);
  if (!artifact) return [];
  const lines: string[] = [];
  const status = stringValue(artifact.status);
  const partial = typeof artifact.partial === "boolean" ? artifact.partial : undefined;
  if (status) lines.push(`resultStatus: ${status}${partial !== undefined ? ` partial=${partial}` : ""}`);
  const summary = stringValue(artifact.summary);
  if (summary) lines.push(`resultSummaryPreview: ${previewText(summary, 1_200)}`);
  const explicitStatus = stringValue(artifact.explicitStatus);
  if (explicitStatus) lines.push(`resultExplicitStatus: ${explicitStatus}`);
  const guardReason = stringValue(artifact.guardReason);
  if (guardReason) lines.push(`resultGuardReason: ${guardReason}`);
  const structuredOutput = objectRecord(artifact.structuredOutput);
  if (structuredOutput) {
    const structuredStatus = stringValue(structuredOutput.status);
    if (structuredStatus) lines.push(`structuredStatus: ${structuredStatus}`);
    const structuredSummary = stringValue(structuredOutput.summary);
    if (structuredSummary && structuredSummary !== summary) {
      lines.push(`structuredSummaryPreview: ${previewText(structuredSummary, 800)}`);
    }
    const evidence = arrayOfStrings(structuredOutput.evidence);
    const risks = arrayOfStrings(structuredOutput.risks);
    const nextActions = arrayOfStrings(structuredOutput.nextActions);
    if (evidence?.length) lines.push(`structuredEvidence: ${previewText(evidence.join("; "), 1_600)}`);
    if (risks?.length) lines.push(`structuredRisks: ${previewText(risks.join("; "), 1_200)}`);
    if (nextActions?.length) lines.push(`structuredNextActions: ${previewText(nextActions.join("; "), 1_200)}`);
    const roleOutput = objectRecord(structuredOutput.roleOutput);
    lines.push(...roleOutputPreviewLines(run.roleId, roleOutput));
  }
  const artifacts = arrayOfStrings(artifact.artifacts) ?? arrayOfStrings(structuredOutput?.artifacts);
  if (artifacts?.length) lines.push(`resultArtifacts: ${artifacts.slice(0, 8).join(", ")}`);
  return lines;
}

function roleOutputPreviewLines(roleId: string, roleOutput: Record<string, unknown> | undefined): string[] {
  if (!roleOutput) return [];
  if (roleId === "drafter") {
    const draft = stringValue(roleOutput.draft);
    const constraintsChecked = stringListValue(roleOutput.constraintsChecked);
    const rationale = stringListValue(roleOutput.rationale);
    return [
      draft ? `draftPreview: ${previewText(draft, 3_600)}` : undefined,
      constraintsChecked?.length ? `constraintsChecked: ${previewText(constraintsChecked.join("; "), 1_000)}` : undefined,
      rationale?.length ? `draftRationale: ${previewText(rationale.join("; "), 700)}` : undefined,
    ].filter((line): line is string => Boolean(line));
  }
  if (roleId === "reviewer") {
    const verdict = stringValue(roleOutput.verdict);
    return [
      verdict ? `reviewVerdict: ${verdict}` : undefined,
      `reviewOutputPreview: ${previewText(JSON.stringify(roleOutput), 2_200)}`,
    ].filter((line): line is string => Boolean(line));
  }
  if (roleId === "summarizer") {
    const keyPoints = arrayOfStrings(roleOutput.keyPoints);
    if (keyPoints?.length) return [`keyPoints: ${previewText(keyPoints.join("; "), 1_600)}`];
  }
  if (roleId === "explorer") {
    return [`findingsPreview: ${previewText(JSON.stringify(roleOutput), 2_200)}`];
  }
  return [`roleOutputPreview: ${previewText(JSON.stringify(roleOutput), 2_200)}`];
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringListValue(value: unknown): string[] | undefined {
  const single = stringValue(value);
  if (single) return [single];
  return arrayOfStrings(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayOfStrings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function previewText(value: string, maxChars: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
