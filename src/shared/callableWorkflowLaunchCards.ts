import type {
  CallableWorkflowLaunchCardRiskLevel,
  CallableWorkflowLaunchCardSummary,
  CallableWorkflowSourcePreview,
} from "./types";

export interface CallableWorkflowLaunchCardPolicyInput {
  launchCardRequirementIds: string[];
  metricTemplateIds: string[];
  maxFanout: number;
  maxDepth: number;
  maxTokenBudget: number;
  maxLocalMemoryBytes: number;
  defaultCollapsedChildThreads: boolean;
}

export interface BuildCallableWorkflowLaunchCardSummaryInput {
  title: string;
  sourceKind: string;
  policy: CallableWorkflowLaunchCardPolicyInput;
  input?: Record<string, unknown>;
  blocking: boolean;
  sourcePreview?: CallableWorkflowSourcePreview;
}

export function buildCallableWorkflowLaunchCardSummary(
  input: BuildCallableWorkflowLaunchCardSummaryInput,
): CallableWorkflowLaunchCardSummary {
  const policy = input.policy;
  const riskLevel = callableWorkflowLaunchRiskLevel(policy, input.blocking);
  const estimatedAgents = callableWorkflowEstimatedAgentCount(input.sourceKind, policy, input.input ?? {});
  return {
    schemaVersion: "ambient-callable-workflow-launch-card-v1",
    title: input.title,
    sourceKind: input.sourceKind,
    riskLevel,
    estimatedAgents,
    maxFanout: policy.maxFanout,
    maxDepth: policy.maxDepth,
    estimatedTokenBudget: policy.maxTokenBudget,
    tokenBudgetEstimated: true,
    estimatedLocalMemoryBytes: policy.maxLocalMemoryBytes,
    localMemoryEstimated: true,
    costEstimateLabel: `Budgeted up to ${formatCallableWorkflowLaunchCardInteger(policy.maxTokenBudget)} tokens; provider dollar cost is estimated after runtime pricing is known.`,
    toolMutationScope: callableWorkflowToolMutationScope(input.sourceKind),
    checkpointResume:
      "Compile to a persisted workflow artifact before running; visible runs must expose progress, pause/resume/cancel, and restart evidence.",
    approvalFailureHandling:
      "Denied, unavailable, or non-interactive approvals leave the workflow blocked or needing attention; the parent must not synthesize it as complete.",
    defaultCollapsed: policy.defaultCollapsedChildThreads,
    blocking: input.blocking,
    smallSliceRecommended: input.sourceKind === "symphony_recipe" && policy.maxFanout > 1,
    requireConfirmation: riskLevel === "high" || input.blocking,
    requirementIds: [...policy.launchCardRequirementIds],
    metricTemplateIds: [...policy.metricTemplateIds],
    ...(input.sourcePreview ? { sourcePreview: cloneCallableWorkflowSourcePreview(input.sourcePreview) } : {}),
    policyWarnings: callableWorkflowLaunchPolicyWarnings(policy, input.blocking),
  };
}

function cloneCallableWorkflowSourcePreview(preview: CallableWorkflowSourcePreview): CallableWorkflowSourcePreview {
  return {
    ...preview,
    searchTerms: [...preview.searchTerms],
  };
}

export function formatCallableWorkflowLaunchCardBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 bytes";
  const gib = value / (1024 * 1024 * 1024);
  if (gib >= 1) return `${formatDecimal(gib)} GiB`;
  const mib = value / (1024 * 1024);
  if (mib >= 1) return `${formatDecimal(mib)} MiB`;
  return `${formatCallableWorkflowLaunchCardInteger(value)} bytes`;
}

export function formatCallableWorkflowLaunchCardInteger(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString("en-US");
}

function callableWorkflowEstimatedAgentCount(
  sourceKind: string,
  policy: CallableWorkflowLaunchCardPolicyInput,
  input: Record<string, unknown>,
): number {
  const explicitLimit = numberFromInput(input, "maxAgents")
    ?? numberFromInput(input, "agentCount")
    ?? numberFromInput(input, "fanout");
  const maxFanout = Math.max(1, policy.maxFanout);
  if (explicitLimit !== undefined) return Math.max(1, Math.min(maxFanout, Math.floor(explicitLimit)));
  if (sourceKind === "recorded_workflow") return 1;
  return maxFanout;
}

function callableWorkflowLaunchRiskLevel(
  policy: CallableWorkflowLaunchCardPolicyInput,
  blocking: boolean,
): CallableWorkflowLaunchCardRiskLevel {
  if (
    policy.maxFanout >= 8 ||
    policy.maxDepth > 1 ||
    policy.maxTokenBudget >= 120_000 ||
    policy.maxLocalMemoryBytes >= 6 * 1024 * 1024 * 1024
  ) {
    return "high";
  }
  if (blocking || policy.maxFanout > 1 || policy.maxTokenBudget >= 60_000 || policy.maxLocalMemoryBytes >= 2 * 1024 * 1024 * 1024) {
    return "medium";
  }
  return "low";
}

function callableWorkflowToolMutationScope(sourceKind: string): string {
  if (sourceKind === "recorded_workflow") {
    return "Recorded playbook steps may include mutations; compilation must preserve step-level approvals and diagnostics before execution.";
  }
  return "Recipe and user scope define allowed tools; mutating child actions require approval, child identifiers, and worktree isolation.";
}

function callableWorkflowLaunchPolicyWarnings(
  policy: CallableWorkflowLaunchCardPolicyInput,
  blocking: boolean,
): string[] {
  return [
    policy.maxFanout > 1 ? `May fan out to as many as ${policy.maxFanout} child threads.` : undefined,
    policy.maxDepth > 1 ? `Nested workflow depth is capped at ${policy.maxDepth}; child access still requires explicit role policy.` : undefined,
    policy.maxTokenBudget >= 100_000 ? `Token budget is high: up to ${formatCallableWorkflowLaunchCardInteger(policy.maxTokenBudget)} tokens.` : undefined,
    policy.maxLocalMemoryBytes > 0 ? `Local model memory request is estimated: up to ${formatCallableWorkflowLaunchCardBytes(policy.maxLocalMemoryBytes)}.` : undefined,
    blocking ? "Parent final synthesis is blocked until this workflow reaches a synthesis-safe terminal state." : undefined,
  ].filter((warning): warning is string => Boolean(warning));
}

function numberFromInput(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
