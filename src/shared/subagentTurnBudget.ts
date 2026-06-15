import type { SubagentRunStatus } from "./subagentProtocol";
import type { SubagentRoleProfile } from "./subagentRoles";
import type { SubagentRunEventSummary } from "./types";

export const SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION =
  "ambient-subagent-turn-budget-policy-v1" as const;

export interface SubagentTurnBudgetPolicy {
  schemaVersion: typeof SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION;
  roleId: string;
  maxTurns: number;
  wrapUpAtTurn: number;
  graceTurns: number;
  wrapUpMode: "single_steer_then_grace";
  exhaustionReason: "max_turns_exceeded";
  terminalStatusOnExhaustion: Extract<SubagentRunStatus, "aborted_partial" | "failed">;
  partialAllowed: boolean;
  transcriptRetained: true;
}

export type SubagentTurnBudgetStateKind = "within_budget" | "wrap_up_due" | "exhausted";

export interface SubagentTurnBudgetState {
  schemaVersion: "ambient-subagent-turn-budget-state-v1";
  policy: SubagentTurnBudgetPolicy;
  startedTurnCount: number;
  completedTurnCount: number;
  observedTurnCount: number;
  remainingTurns: number;
  state: SubagentTurnBudgetStateKind;
  shouldSteerWrapUp: boolean;
  exhausted: boolean;
  reason?: "max_turns_exceeded" | "wrap_up_turn_reached";
  instruction?: string;
}

export function resolveSubagentTurnBudgetPolicy(
  role: Pick<SubagentRoleProfile, "id" | "guardPolicy">,
): SubagentTurnBudgetPolicy {
  const maxTurns = normalizePositiveInteger(role.guardPolicy.maxTurns);
  const graceTurns = maxTurns > 1 ? 1 : 0;
  return {
    schemaVersion: SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION,
    roleId: role.id,
    maxTurns,
    wrapUpAtTurn: Math.max(1, maxTurns - graceTurns),
    graceTurns,
    wrapUpMode: "single_steer_then_grace",
    exhaustionReason: "max_turns_exceeded",
    terminalStatusOnExhaustion: role.guardPolicy.allowPartialResult ? "aborted_partial" : "failed",
    partialAllowed: role.guardPolicy.allowPartialResult,
    transcriptRetained: true,
  };
}

export function compactSubagentTurnBudgetPolicyForPi(
  policy: SubagentTurnBudgetPolicy,
): Record<string, unknown> {
  return {
    schemaVersion: policy.schemaVersion,
    roleId: policy.roleId,
    maxTurns: policy.maxTurns,
    wrapUpAtTurn: policy.wrapUpAtTurn,
    graceTurns: policy.graceTurns,
    wrapUpMode: policy.wrapUpMode,
    exhaustionReason: policy.exhaustionReason,
    terminalStatusOnExhaustion: policy.terminalStatusOnExhaustion,
    partialAllowed: policy.partialAllowed,
    transcriptRetained: policy.transcriptRetained,
  };
}

export function evaluateSubagentTurnBudgetForEvents(input: {
  role: Pick<SubagentRoleProfile, "id" | "guardPolicy">;
  events: readonly SubagentRunEventSummary[];
}): SubagentTurnBudgetState {
  const policy = resolveSubagentTurnBudgetPolicy(input.role);
  const startedTurnCount = input.events.filter(isTurnStartEvent).length;
  const completedTurnCount = input.events.filter(isTurnTerminalEvent).length;
  const observedTurnCount = Math.max(startedTurnCount, completedTurnCount);
  const remainingTurns = Math.max(0, policy.maxTurns - completedTurnCount);
  const exhausted = completedTurnCount >= policy.maxTurns;
  const shouldSteerWrapUp = !exhausted && observedTurnCount >= policy.wrapUpAtTurn;
  return {
    schemaVersion: "ambient-subagent-turn-budget-state-v1",
    policy,
    startedTurnCount,
    completedTurnCount,
    observedTurnCount,
    remainingTurns,
    state: exhausted ? "exhausted" : shouldSteerWrapUp ? "wrap_up_due" : "within_budget",
    shouldSteerWrapUp,
    exhausted,
    ...(exhausted ? { reason: "max_turns_exceeded" as const } : shouldSteerWrapUp ? { reason: "wrap_up_turn_reached" as const } : {}),
    ...(exhausted
      ? {
          instruction: policy.partialAllowed
            ? "Child turn budget is exhausted. Preserve the transcript and require an explicit partial result before parent synthesis."
            : "Child turn budget is exhausted. Preserve the transcript and fail this child unless a later policy explicitly retries it.",
        }
      : shouldSteerWrapUp
      ? { instruction: "Child is at its wrap-up turn. Steer it to finish with a schema-valid result instead of starting new work." }
      : {}),
  };
}

export function compactSubagentTurnBudgetStateForPi(
  state: SubagentTurnBudgetState,
): Record<string, unknown> {
  return {
    schemaVersion: state.schemaVersion,
    policy: compactSubagentTurnBudgetPolicyForPi(state.policy),
    startedTurnCount: state.startedTurnCount,
    completedTurnCount: state.completedTurnCount,
    observedTurnCount: state.observedTurnCount,
    remainingTurns: state.remainingTurns,
    state: state.state,
    shouldSteerWrapUp: state.shouldSteerWrapUp,
    exhausted: state.exhausted,
    ...(state.reason ? { reason: state.reason } : {}),
    ...(state.instruction ? { instruction: state.instruction } : {}),
  };
}

function isTurnStartEvent(event: SubagentRunEventSummary): boolean {
  const runtime = runtimeEventPreview(event.preview);
  return runtime?.type === "started" ||
    event.type === "subagent.local_text_started" ||
    event.type === "subagent.followup_child_session_started";
}

function isTurnTerminalEvent(event: SubagentRunEventSummary): boolean {
  const runtime = runtimeEventPreview(event.preview);
  return runtime?.type === "completed" ||
    runtime?.type === "error" ||
    runtime?.type === "cancelled" ||
    event.type === "subagent.local_text_completed" ||
    event.type === "subagent.local_text_failed" ||
    event.type === "subagent.runtime_budget_exceeded";
}

function runtimeEventPreview(value: unknown): { type?: unknown } | undefined {
  const direct = recordValue(value);
  const nested = recordValue(direct?.event);
  const candidate = nested ?? direct;
  return candidate && typeof candidate.type === "string" ? candidate : undefined;
}

function normalizePositiveInteger(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
