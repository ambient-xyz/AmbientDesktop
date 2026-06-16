import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../shared/types";

export const SUBAGENT_PARENT_POLICY_RESOLUTION_SCHEMA_VERSION = "ambient-subagent-parent-policy-resolution-v1" as const;
export const SUBAGENT_BARRIER_DECISIONS = ["continue_with_partial", "fail_parent", "retry_child", "detach_child", "cancel_parent"] as const;

export type SubagentBarrierDecision = typeof SUBAGENT_BARRIER_DECISIONS[number];

export interface SubagentParentPolicyResolution {
  schemaVersion: typeof SUBAGENT_PARENT_POLICY_RESOLUTION_SCHEMA_VERSION;
  status: "ready" | "blocked";
  action:
    | "synthesize"
    | "continue_with_explicit_partial"
    | "wait_for_child"
    | "fail_parent"
    | "ask_user"
    | "retry_child"
    | "detach_child"
    | "cancel_parent";
  canSynthesize: boolean;
  requiresUserInput: boolean;
  requiresExplicitPartial: boolean;
  childRunId: string;
  childStatus: SubagentRunStatus;
  reason: string;
  instruction: string;
  waitBarrierId?: string;
  barrierStatus?: SubagentWaitBarrierSummary["status"];
  failurePolicy?: SubagentWaitBarrierSummary["failurePolicy"];
}

export function resolveSubagentParentPolicyForWait(input: {
  run: SubagentRunSummary;
  waitBarrier: SubagentWaitBarrierSummary;
  waitTimedOut: boolean;
  synthesisAllowed: boolean;
  partial: boolean;
  validationReason?: string;
}): SubagentParentPolicyResolution {
  const base = {
    schemaVersion: SUBAGENT_PARENT_POLICY_RESOLUTION_SCHEMA_VERSION,
    childRunId: input.run.id,
    childStatus: input.run.status,
    waitBarrierId: input.waitBarrier.id,
    barrierStatus: input.waitBarrier.status,
    failurePolicy: input.waitBarrier.failurePolicy,
  };
  const explicitDecision = explicitSubagentBarrierUserDecision(input.waitBarrier);
  if (
    input.waitBarrier.status === "satisfied" &&
    explicitDecision?.decision === "continue_with_partial" &&
    explicitDecision.synthesisAllowed
  ) {
    return {
      ...base,
      status: "ready",
      action: "continue_with_explicit_partial",
      canSynthesize: true,
      requiresUserInput: false,
      requiresExplicitPartial: true,
      reason: "User explicitly approved continuing with a partial parent answer for this barrier.",
      instruction: "You may proceed only if the parent answer clearly labels the result as partial and does not treat failed child work as completed evidence.",
    };
  }
  if (input.synthesisAllowed) {
    if (input.partial) {
      return {
        ...base,
        status: "ready",
        action: "continue_with_explicit_partial",
        canSynthesize: true,
      requiresUserInput: false,
      requiresExplicitPartial: true,
      reason: "Child produced a schema-valid explicit partial result artifact.",
      instruction: "You may synthesize only if you explicitly label the child result as partial, preserve its provenance, and carry forward relevant structuredEvidence, structuredRisks, and structuredNextActions.",
    };
  }
  return {
      ...base,
      status: "ready",
      action: "synthesize",
      canSynthesize: true,
    requiresUserInput: false,
    requiresExplicitPartial: false,
    reason: "Child produced a schema-valid completed result artifact.",
    instruction: "You may synthesize from this child result with provenance. Carry forward relevant structuredEvidence, structuredRisks, and structuredNextActions into the parent answer, especially verifier acceptance checks and required corrections.",
  };
}
  if (input.run.status === "needs_attention") {
    return {
      ...base,
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      requiresUserInput: true,
      requiresExplicitPartial: false,
      reason: "Child requested supervisor attention before it can continue.",
      instruction: "Do not synthesize child work. Ask the user for the requested steering, then send the decision to the child with send_agent or followup_agent.",
    };
  }
  if (input.waitBarrier.status === "waiting_on_children") {
    return {
      ...base,
      status: "blocked",
      action: "wait_for_child",
      canSynthesize: false,
      requiresUserInput: false,
      requiresExplicitPartial: false,
      reason: input.waitTimedOut
        ? "Child wait timed out before the barrier resolved."
        : input.validationReason ?? "Child is not terminal and has no synthesis-safe result artifact yet.",
      instruction: "Do not synthesize child work. Wait again, send follow-up guidance, or cancel the child explicitly.",
    };
  }
  const blockedReason = input.waitTimedOut
    ? "Child wait timed out before producing a synthesis-safe result."
    : input.validationReason ?? `Required child barrier resolved ${input.waitBarrier.status}.`;
  if (input.waitBarrier.failurePolicy === "fail_parent") {
    return {
      ...base,
      status: "blocked",
      action: "fail_parent",
      canSynthesize: false,
      requiresUserInput: false,
      requiresExplicitPartial: false,
      reason: blockedReason,
      instruction: "Do not synthesize child work. Fail or block the parent run and surface the child failure.",
    };
  }
  if (input.waitBarrier.failurePolicy === "retry_child") {
    return {
      ...base,
      status: "blocked",
      action: "retry_child",
      canSynthesize: false,
      requiresUserInput: false,
      requiresExplicitPartial: false,
      reason: blockedReason,
      instruction: "Do not synthesize child work. Retry the child or send a targeted follow-up before attempting a parent answer.",
    };
  }
  if (input.waitBarrier.failurePolicy === "degrade_partial") {
    return {
      ...base,
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      requiresUserInput: true,
      requiresExplicitPartial: true,
      reason: input.waitTimedOut
        ? blockedReason
        : input.validationReason ?? "Failure policy allows partial degradation, but this child did not produce a synthesis-safe explicit partial artifact.",
      instruction: "Do not synthesize child work. Ask the user whether to retry, cancel, or continue only after an explicit partial result is available.",
    };
  }
  return {
    ...base,
    status: "blocked",
    action: "ask_user",
    canSynthesize: false,
    requiresUserInput: true,
    requiresExplicitPartial: false,
    reason: blockedReason,
    instruction: "Do not synthesize child work. Ask the user whether to retry, detach, cancel, or stop the parent run.",
  };
}

export function resolveSubagentParentPolicyForBarrierDecision(
  barrier: SubagentWaitBarrierSummary,
  childRuns: SubagentRunSummary[],
  decision: SubagentBarrierDecision,
): SubagentParentPolicyResolution {
  const primaryRun = childRuns[0];
  const base = {
    schemaVersion: SUBAGENT_PARENT_POLICY_RESOLUTION_SCHEMA_VERSION,
    childRunId: primaryRun?.id ?? barrier.childRunIds[0] ?? "",
    childStatus: primaryRun?.status ?? "detached" as SubagentRunStatus,
    waitBarrierId: barrier.id,
    barrierStatus: barrier.status,
    failurePolicy: barrier.failurePolicy,
  };
  if (decision === "continue_with_partial" && barrier.status === "satisfied") {
    return {
      ...base,
      status: "ready",
      action: "continue_with_explicit_partial",
      canSynthesize: true,
      requiresUserInput: false,
      requiresExplicitPartial: true,
      reason: "User explicitly approved a partial parent continuation for this required barrier.",
      instruction: "Proceed only with a clearly partial parent answer. Do not present failed child output as completed work.",
    };
  }
  if (decision === "retry_child") {
    return {
      ...base,
      status: "blocked",
      action: "retry_child",
      canSynthesize: false,
      requiresUserInput: false,
      requiresExplicitPartial: false,
      reason: "User chose to retry the child work.",
      instruction: "Do not synthesize yet. Retry or respawn the child, then wait for a valid result.",
    };
  }
  if (decision === "detach_child") {
    return {
      ...base,
      status: "blocked",
      action: "detach_child",
      canSynthesize: false,
      requiresUserInput: false,
      requiresExplicitPartial: false,
      reason: "User detached the required child work from this parent barrier.",
      instruction: "Do not synthesize child work. Treat the detached child as separate inspectable work and stop, fail, or ask for a new parent direction.",
    };
  }
  if (decision === "cancel_parent") {
    return {
      ...base,
      status: "blocked",
      action: "cancel_parent",
      canSynthesize: false,
      requiresUserInput: false,
      requiresExplicitPartial: false,
      reason: "User chose to cancel the parent path while resolving this required child barrier.",
      instruction: "Do not synthesize child work. Stop or cancel the parent run; required child work for this barrier has been cancelled where still active.",
    };
  }
  return {
    ...base,
    status: "blocked",
    action: "fail_parent",
    canSynthesize: false,
    requiresUserInput: false,
    requiresExplicitPartial: false,
    reason: "User chose not to continue past this required barrier.",
    instruction: "Do not synthesize child work. Surface the failure to the user or stop the parent run.",
  };
}

export function explicitSubagentBarrierUserDecision(barrier: SubagentWaitBarrierSummary): {
  decision?: string;
  synthesisAllowed: boolean;
  explicitPartial: boolean;
} | undefined {
  const artifact = recordValue(barrier.resolutionArtifact);
  const decision = recordValue(artifact?.userDecision);
  if (decision?.schemaVersion !== "ambient-subagent-user-decision-v1") return undefined;
  return {
    decision: stringValue(decision.decision),
    synthesisAllowed: artifact?.synthesisAllowed === true,
    explicitPartial: artifact?.explicitPartial === true,
  };
}

export function allowedUserChoicesForSubagentWaitBarrier(
  parentResolution: SubagentParentPolicyResolution,
): Array<Record<string, unknown>> {
  if (parentResolution.action === "wait_for_child") {
    return [
      { id: "wait_again", label: "Wait again", toolAction: "wait_agent" },
      { id: "send_child_steering", label: "Send child steering", toolAction: "send_agent_or_followup_agent" },
      { id: "cancel_parent", label: "Cancel parent run", toolAction: "resolve_barrier", decision: "cancel_parent", parentControl: "cancel_parent_run" },
    ];
  }
  if (parentResolution.action === "retry_child") {
    return [
      { id: "retry_child", label: "Retry child", toolAction: "resolve_barrier", decision: "retry_child" },
      { id: "send_child_steering", label: "Send child steering", toolAction: "send_agent_or_followup_agent" },
      { id: "cancel_parent", label: "Cancel parent run", toolAction: "resolve_barrier", decision: "cancel_parent", parentControl: "cancel_parent_run" },
      { id: "fail_parent", label: "Fail parent", toolAction: "resolve_barrier", decision: "fail_parent" },
    ];
  }
  if (parentResolution.action === "fail_parent") {
    return [
      { id: "fail_parent", label: "Fail parent", toolAction: "resolve_barrier", decision: "fail_parent" },
      { id: "detach_child", label: "Detach child", toolAction: "resolve_barrier", decision: "detach_child", parentControl: "stop_parent_only_detach_child" },
      { id: "cancel_parent", label: "Cancel parent run", toolAction: "resolve_barrier", decision: "cancel_parent", parentControl: "cancel_parent_run" },
    ];
  }
  const partialChoice = parentResolution.requiresExplicitPartial
    ? [{
      id: "continue_with_partial",
      label: "Continue with partial",
      toolAction: "resolve_barrier",
      decision: "continue_with_partial",
      requiresUserDecision: true,
      requiresPartialSummary: true,
    }]
    : [];
  return [
    ...partialChoice,
    { id: "send_child_steering", label: "Send child steering", toolAction: "send_agent_or_followup_agent" },
    { id: "retry_child", label: "Retry child", toolAction: "resolve_barrier", decision: "retry_child" },
    { id: "detach_child", label: "Detach child", toolAction: "resolve_barrier", decision: "detach_child", parentControl: "stop_parent_only_detach_child" },
    { id: "cancel_parent", label: "Cancel parent run", toolAction: "resolve_barrier", decision: "cancel_parent", parentControl: "cancel_parent_run" },
    { id: "fail_parent", label: "Fail parent", toolAction: "resolve_barrier", decision: "fail_parent" },
  ];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
