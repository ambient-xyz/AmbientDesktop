import type {
  ChildDecisionRequest,
  ChildDecisionOptionAction,
  SymphonyChildDecisionOption,
  SymphonyChildDecisionReason,
} from "./symphonyFineGrainedContracts";
import {
  assertValidChildDecisionRequest,
  SYMPHONY_CHILD_DECISION_REQUEST_SCHEMA_VERSION,
} from "./symphonyFineGrainedContracts";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "./subagentTypes";

const CAPTCHA_PATTERN = /\b(?:captcha|recaptcha|hcaptcha|unusual[-\s]?traffic|human verification|bot challenge|robot check)\b/i;

type SubagentDecisionChildState = Pick<SubagentRunSummary, "id" | "status">;
type SubagentDecisionChildContext = Pick<SubagentRunSummary, "symphonyLaunchContracts">;
type SubagentDecisionParentResolution = { action?: string; requiresExplicitPartial?: boolean } | Record<string, unknown>;

export function buildSubagentChildDecisionRequest(input: {
  barrier: SubagentWaitBarrierSummary;
  childRuns: readonly SubagentDecisionChildState[];
  parentResolution: SubagentDecisionParentResolution;
  requestId?: string;
  evidenceRefs?: readonly string[];
}): ChildDecisionRequest {
  const reason = subagentChildDecisionReason(input);
  const options = subagentChildDecisionOptions({
    reason,
    barrier: input.barrier,
    childRuns: input.childRuns,
    parentResolution: input.parentResolution,
  });
  const recommendedOption = subagentChildDecisionRecommendedOption(reason, options);
  return assertValidChildDecisionRequest({
    schemaVersion: SYMPHONY_CHILD_DECISION_REQUEST_SCHEMA_VERSION,
    requestId: input.requestId ?? subagentChildDecisionRequestId(input.barrier),
    barrierId: input.barrier.id,
    parentRunId: input.barrier.parentRunId,
    childRunIds: input.barrier.childRunIds,
    reason,
    options,
    recommendedOption,
    optionActions: subagentChildDecisionOptionActions(options),
    evidenceRefs: input.evidenceRefs?.length
      ? [...input.evidenceRefs]
      : subagentChildDecisionEvidenceRefs(input.barrier, input.childRuns),
  });
}

export function shouldBuildSubagentChildDecisionRequest(
  parentResolution: SubagentDecisionParentResolution | undefined,
  options: { childRuns?: readonly SubagentDecisionChildContext[] } = {},
): boolean {
  if (stringValue(recordValue(parentResolution)?.action) === "wait_for_child") return false;
  if (options.childRuns && !options.childRuns.some((run) => Boolean(run.symphonyLaunchContracts))) return false;
  return true;
}

export function subagentChildDecisionRequestId(
  barrier: Pick<SubagentWaitBarrierSummary, "id" | "parentRunId" | "updatedAt" | "status">,
): string {
  const updatedAt = barrier.updatedAt.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `symphony-child-decision:${barrier.parentRunId}:${barrier.id}:${barrier.status}:${updatedAt}`;
}

export function subagentChildDecisionReason(input: {
  barrier: SubagentWaitBarrierSummary;
  childRuns: readonly SubagentDecisionChildState[];
  parentResolution?: SubagentDecisionParentResolution;
}): SymphonyChildDecisionReason {
  const searchableText = [
    input.barrier.failurePolicy,
    input.barrier.status,
    trustedCaptchaEvidenceText(input.barrier.resolutionArtifact),
    trustedCaptchaEvidenceText(input.parentResolution),
  ].map(stableStringify).join("\n");
  if (CAPTCHA_PATTERN.test(searchableText)) return "captcha_blocked";
  if (hasStructuredToolScopeDenial(input.barrier.resolutionArtifact) || hasStructuredToolScopeDenial(input.parentResolution)) {
    return "tool_scope_denied";
  }
  if (input.barrier.status === "timed_out" || input.childRuns.some((run) => run.status === "timed_out")) {
    return "timed_out";
  }
  if (input.barrier.status === "cancelled") {
    return "cancelled";
  }
  if (input.barrier.status === "failed" || input.childRuns.some((run) => run.status === "failed" || run.status === "aborted_partial" || run.status === "detached")) {
    return "failed";
  }
  if (input.childRuns.some((run) => run.status === "cancelled" || run.status === "stopped")) return "cancelled";
  if (input.childRuns.some((run) => run.status === "needs_attention")) return "needs_approval";
  return "failed";
}

export function subagentChildDecisionOptions(input: {
  reason: SymphonyChildDecisionReason;
  barrier: SubagentWaitBarrierSummary;
  childRuns?: readonly SubagentDecisionChildState[];
  parentResolution?: SubagentDecisionParentResolution;
}): SymphonyChildDecisionOption[] {
  const options: SymphonyChildDecisionOption[] = [];
  const canRecover = subagentChildDecisionAllowsRecovery(input.parentResolution);
  const canRetry = canRecover && subagentChildDecisionHasRetryableState(input);
  if (canRetry) options.push("retry_child");
  if (subagentChildDecisionAllowsPartial(input)) {
    options.push("accept_partial");
  }
  options.push("cancel_group", "exit_symphony_mode");
  return uniqueOptions(options);
}

export function subagentChildDecisionOptionActions(
  options: readonly SymphonyChildDecisionOption[],
): ChildDecisionOptionAction[] {
  return options.flatMap((option): ChildDecisionOptionAction[] => {
    switch (option) {
      case "retry_child":
        return [{ option, toolAction: "resolve_barrier", decision: "retry_child" }];
      case "accept_partial":
        return [{
          option,
          toolAction: "resolve_barrier",
          decision: "continue_with_partial",
          requiresUserDecision: true,
          requiresPartialSummary: true,
        }];
      case "cancel_group":
        return [{ option, toolAction: "resolve_barrier", decision: "cancel_parent", requiresUserDecision: true }];
      case "exit_symphony_mode":
        return [{ option, toolAction: "resolve_barrier", decision: "fail_parent" }];
      case "grant_scope":
      case "retry_with_verifier":
        return [];
    }
  });
}

export function subagentChildDecisionRecommendedOption(
  reason: SymphonyChildDecisionReason,
  options: readonly SymphonyChildDecisionOption[],
): SymphonyChildDecisionOption {
  if ((reason === "needs_approval" || reason === "tool_scope_denied") && options.includes("grant_scope")) {
    return "grant_scope";
  }
  if (reason === "cancelled" && options.includes("cancel_group")) return "cancel_group";
  if (options.includes("retry_child")) return "retry_child";
  if (options.includes("accept_partial")) return "accept_partial";
  if (options.includes("exit_symphony_mode")) return "exit_symphony_mode";
  return options[0] ?? "cancel_group";
}

export function subagentChildDecisionOptionLabel(option: SymphonyChildDecisionOption): string {
  switch (option) {
    case "grant_scope":
      return "Grant or re-scope child authority";
    case "retry_child":
      return "Retry child";
    case "retry_with_verifier":
      return "Retry with verifier";
    case "accept_partial":
      return "Accept partial";
    case "cancel_group":
      return "Cancel group";
    case "exit_symphony_mode":
      return "Exit Symphony";
  }
}

function subagentChildDecisionEvidenceRefs(
  barrier: SubagentWaitBarrierSummary,
  childRuns: readonly SubagentDecisionChildState[],
): string[] {
  return [
    `wait-barrier:${barrier.id}`,
    ...childRuns.map((run) => `subagent-run:${run.id}`),
  ];
}

function uniqueOptions(options: SymphonyChildDecisionOption[]): SymphonyChildDecisionOption[] {
  return [...new Set(options)];
}

function subagentChildDecisionAllowsPartial(input: {
  barrier: SubagentWaitBarrierSummary;
  parentResolution?: SubagentDecisionParentResolution;
}): boolean {
  const parentResolution = recordValue(input.parentResolution);
  if (parentResolution?.requiresExplicitPartial === true) return true;
  const artifact = recordValue(input.barrier.resolutionArtifact);
  return artifact?.explicitPartial === true && artifact?.synthesisAllowed === true;
}

function subagentChildDecisionAllowsRecovery(
  parentResolution: SubagentDecisionParentResolution | undefined,
): boolean {
  const action = stringValue(recordValue(parentResolution)?.action);
  return action === "ask_user" || action === "retry_child";
}

function trustedCaptchaEvidenceText(value: unknown): Record<string, unknown> | string {
  const record = recordValue(value);
  if (!record) return typeof value === "string" ? value : "";
  const transitionEvidence = recordValue(record.transitionEvidence);
  return {
    kind: record.kind,
    source: record.source,
    reason: record.reason,
    instruction: record.instruction,
    barrierStatus: record.barrierStatus,
    failurePolicy: record.failurePolicy,
    failureStage: record.failureStage,
    ...(transitionEvidence ? {
      transitionEvidence: {
        kind: transitionEvidence.kind,
        source: transitionEvidence.source,
        reason: transitionEvidence.reason,
        timeoutKind: transitionEvidence.timeoutKind,
      },
    } : {}),
  };
}

function subagentChildDecisionHasRetryableState(input: {
  reason: SymphonyChildDecisionReason;
  barrier: SubagentWaitBarrierSummary;
  childRuns?: readonly SubagentDecisionChildState[];
}): boolean {
  if (input.reason === "needs_approval") return false;
  if (input.barrier.status === "failed" || input.barrier.status === "timed_out" || input.barrier.status === "cancelled") {
    return true;
  }
  return Boolean(input.childRuns?.some((run) =>
    run.status === "failed" ||
    run.status === "timed_out" ||
    run.status === "cancelled" ||
    run.status === "stopped" ||
    run.status === "aborted_partial" ||
    run.status === "detached"
  ));
}

function stableStringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasStructuredToolScopeDenial(value: unknown): boolean {
  const record = recordValue(value);
  if (!record) return false;
  if (hasDirectToolScopeDenial(record)) return true;
  const toolScopeSnapshot = recordValue(record.toolScopeSnapshot);
  return toolScopeSnapshot ? hasDirectToolScopeDenial(toolScopeSnapshot) : false;
}

function hasDirectToolScopeDenial(record: Record<string, unknown>): boolean {
  if (record.failureStage === "tool_scope") return true;
  if (record.approvalUnavailable === true || record.toolScopeDenied === true || record.scopeDenied === true) {
    return true;
  }
  for (const key of ["deniedTools", "deniedCategories"]) {
    const denied = record[key];
    if (Array.isArray(denied) && denied.length > 0) return true;
  }
  return false;
}
