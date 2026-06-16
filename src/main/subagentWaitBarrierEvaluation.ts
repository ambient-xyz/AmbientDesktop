import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentWaitBarrierSummary } from "../shared/types";

export const SUBAGENT_WAIT_BARRIER_EVALUATION_SCHEMA_VERSION = "ambient-subagent-wait-barrier-evaluation-v1" as const;

export const SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES = new Set<SubagentRunStatus>([
  "completed",
  "failed",
  "stopped",
  "cancelled",
  "timed_out",
  "detached",
  "aborted_partial",
]);

export interface SubagentWaitBarrierChildResult<ResultValidation = unknown> {
  childRunId: string;
  childThreadId: string;
  status: SubagentRunStatus;
  synthesisAllowed: boolean;
  partial: boolean;
  reason?: string;
  resultValidation: ResultValidation;
}

export type SubagentWaitBarrierTerminalEvidenceKind = "child_runtime_timeout";
export type SubagentWaitBarrierRuntimeTimeoutKind = "idle" | "hard_cap" | "budget" | "unknown";

export interface SubagentWaitBarrierTerminalEvidence {
  kind: SubagentWaitBarrierTerminalEvidenceKind;
  childRunId?: string;
  reason?: string;
  timeoutKind?: SubagentWaitBarrierRuntimeTimeoutKind;
  details?: Record<string, unknown>;
}

export interface SubagentWaitBarrierEvaluation<ResultValidation = unknown> {
  schemaVersion: typeof SUBAGENT_WAIT_BARRIER_EVALUATION_SCHEMA_VERSION;
  waitBarrierId: string;
  dependencyMode: SubagentWaitBarrierSummary["dependencyMode"];
  childRunIds: string[];
  childStatuses: Array<{ childRunId: string; status: SubagentRunStatus }>;
  quorumThreshold?: number;
  requiredSynthesisCount: number;
  validSynthesisCount: number;
  potentialSynthesisCount: number;
  synthesisAllowed: boolean;
  partial: boolean;
  timedOut: boolean;
  runtimeTimeoutKind?: SubagentWaitBarrierRuntimeTimeoutKind;
  terminalEvidence?: SubagentWaitBarrierTerminalEvidence;
  impossible: boolean;
  activeChildRunIds: string[];
  terminalUnsafeChildRunIds: string[];
  childResults: Array<SubagentWaitBarrierChildResult<ResultValidation>>;
  reason: string;
}

export function evaluateSubagentWaitBarrierForSynthesis<ResultValidation = unknown>(input: {
  barrier: SubagentWaitBarrierSummary;
  childResults: Array<SubagentWaitBarrierChildResult<ResultValidation>>;
  terminalEvidence?: SubagentWaitBarrierTerminalEvidence;
}): SubagentWaitBarrierEvaluation<ResultValidation> {
  const requiredSynthesisCount = requiredSynthesisCountForBarrier(input.barrier, input.childResults.length);
  const synthesisSafeChildren = input.childResults.filter((child) => child.synthesisAllowed);
  const nonPartialSafeCount = synthesisSafeChildren.filter((child) => !child.partial).length;
  const activeChildRunIds = input.childResults
    .filter((child) => !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(child.status))
    .map((child) => child.childRunId);
  const terminalUnsafeChildren = input.childResults.filter((child) =>
    SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(child.status) && !child.synthesisAllowed
  );
  const potentialSynthesisCount = synthesisSafeChildren.length + activeChildRunIds.length;
  const synthesisAllowed = synthesisSafeChildren.length >= requiredSynthesisCount;
  const impossible = !synthesisAllowed && potentialSynthesisCount < requiredSynthesisCount;
  const partial = synthesisAllowed && partialRequiredForBarrier({
    dependencyMode: input.barrier.dependencyMode,
    requiredSynthesisCount,
    synthesisSafeChildren,
    nonPartialSafeCount,
  });
  const terminalEvidence = input.terminalEvidence;
  const timedOut = terminalEvidence?.kind === "child_runtime_timeout";
  const runtimeTimeoutKind = timedOut
    ? terminalEvidence.timeoutKind ?? subagentRuntimeTimeoutKindFromReason(terminalEvidence.reason)
    : undefined;
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_EVALUATION_SCHEMA_VERSION,
    waitBarrierId: input.barrier.id,
    dependencyMode: input.barrier.dependencyMode,
    childRunIds: input.barrier.childRunIds,
    childStatuses: input.childResults.map((child) => ({ childRunId: child.childRunId, status: child.status })),
    ...(input.barrier.quorumThreshold !== undefined ? { quorumThreshold: input.barrier.quorumThreshold } : {}),
    requiredSynthesisCount,
    validSynthesisCount: synthesisSafeChildren.length,
    potentialSynthesisCount,
    synthesisAllowed,
    partial,
    timedOut,
    ...(runtimeTimeoutKind ? { runtimeTimeoutKind } : {}),
    ...(terminalEvidence ? { terminalEvidence } : {}),
    impossible,
    activeChildRunIds,
    terminalUnsafeChildRunIds: terminalUnsafeChildren.map((child) => child.childRunId),
    childResults: input.childResults,
    reason: waitBarrierEvaluationReason({
      dependencyMode: input.barrier.dependencyMode,
      requiredSynthesisCount,
      validSynthesisCount: synthesisSafeChildren.length,
      potentialSynthesisCount,
      synthesisAllowed,
      impossible,
      timedOut,
      activeCount: activeChildRunIds.length,
      terminalUnsafeCount: terminalUnsafeChildren.length,
    }),
  };
}

export function subagentRuntimeTimeoutKindFromReason(
  reason?: string,
): SubagentWaitBarrierRuntimeTimeoutKind {
  if (reason === "runtime_idle_timeout") return "idle";
  if (reason === "runtime_hard_cap_exceeded") return "hard_cap";
  if (reason === "runtime_budget_exceeded") return "budget";
  return "unknown";
}

export function requiredSynthesisCountForBarrier(
  barrier: Pick<SubagentWaitBarrierSummary, "dependencyMode" | "quorumThreshold">,
  childCount: number,
): number {
  if (childCount <= 0) return 1;
  if (barrier.dependencyMode === "required_any" || barrier.dependencyMode === "optional_background") return 1;
  if (barrier.dependencyMode === "quorum") {
    const threshold = barrier.quorumThreshold;
    if (typeof threshold === "number" && Number.isInteger(threshold)) {
      return Math.min(childCount, Math.max(1, threshold));
    }
    return Math.max(1, Math.ceil(childCount / 2));
  }
  return childCount;
}

export function waitBarrierStatusFromEvaluation(
  evaluation: Pick<
    SubagentWaitBarrierEvaluation,
    "synthesisAllowed" | "timedOut" | "impossible" | "terminalUnsafeChildRunIds" | "childResults"
  >,
): SubagentWaitBarrierSummary["status"] {
  if (evaluation.synthesisAllowed) return "satisfied";
  if (!evaluation.impossible) return "waiting_on_children";
  if (evaluation.timedOut) return "timed_out";
  const terminalUnsafeChildren = evaluation.childResults.filter((child) =>
    evaluation.terminalUnsafeChildRunIds.includes(child.childRunId)
  );
  return terminalUnsafeChildren.length > 0 && terminalUnsafeChildren.every((child) => child.status === "cancelled")
    ? "cancelled"
    : "failed";
}

export function waitBarrierEvaluationReason(input: {
  dependencyMode: SubagentWaitBarrierSummary["dependencyMode"];
  requiredSynthesisCount: number;
  validSynthesisCount: number;
  potentialSynthesisCount: number;
  synthesisAllowed: boolean;
  impossible: boolean;
  timedOut: boolean;
  activeCount: number;
  terminalUnsafeCount: number;
}): string {
  if (input.synthesisAllowed) {
    return `${input.dependencyMode} barrier has ${input.validSynthesisCount}/${input.requiredSynthesisCount} synthesis-safe child result${input.validSynthesisCount === 1 ? "" : "s"}.`;
  }
  if (input.timedOut && input.impossible) {
    return `${input.dependencyMode} barrier timed out with ${input.validSynthesisCount}/${input.requiredSynthesisCount} synthesis-safe child results.`;
  }
  if (input.impossible) {
    return `${input.dependencyMode} barrier cannot reach ${input.requiredSynthesisCount} synthesis-safe child results; ${input.terminalUnsafeCount} child result${input.terminalUnsafeCount === 1 ? "" : "s"} are terminal and unsafe for synthesis.`;
  }
  if (input.timedOut) {
    return `${input.dependencyMode} barrier recorded child timeout evidence but is still waiting for child work; ${input.validSynthesisCount}/${input.requiredSynthesisCount} synthesis-safe results are available and ${input.activeCount} child run${input.activeCount === 1 ? "" : "s"} may still finish.`;
  }
  return `${input.dependencyMode} barrier is still waiting for child work; ${input.validSynthesisCount}/${input.requiredSynthesisCount} synthesis-safe results are available and ${input.activeCount} child run${input.activeCount === 1 ? "" : "s"} may still finish.`;
}

function partialRequiredForBarrier(input: {
  dependencyMode: SubagentWaitBarrierSummary["dependencyMode"];
  requiredSynthesisCount: number;
  synthesisSafeChildren: Array<{ partial: boolean }>;
  nonPartialSafeCount: number;
}): boolean {
  if (!input.synthesisSafeChildren.length) return false;
  if (input.dependencyMode === "required_all") return input.synthesisSafeChildren.some((child) => child.partial);
  return input.nonPartialSafeCount < input.requiredSynthesisCount;
}
