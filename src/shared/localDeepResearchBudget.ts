import type {
  LocalDeepResearchBudgetExhaustionBehavior,
  LocalDeepResearchBudgetSource,
  LocalDeepResearchEffort,
  LocalDeepResearchRunBudget,
  LocalDeepResearchRunBudgetSettings,
  LocalDeepResearchToolBudgetState,
} from "./localRuntimeTypes";

export const LOCAL_DEEP_RESEARCH_RUN_BUDGET_SCHEMA_VERSION = "ambient-local-deep-research-run-budget-v1" as const;
export const LOCAL_DEEP_RESEARCH_TOOL_BUDGET_SCHEMA_VERSION = "ambient-local-deep-research-tool-budget-v1" as const;

export const LOCAL_DEEP_RESEARCH_EFFORT_PRESETS: Record<Exclude<LocalDeepResearchEffort, "custom">, {
  label: string;
  maxToolCalls: number;
}> = {
  quick: { label: "Quick", maxToolCalls: 10 },
  balanced: { label: "Balanced", maxToolCalls: 25 },
  deep: { label: "Deep", maxToolCalls: 60 },
  exhaustive: { label: "Exhaustive", maxToolCalls: 120 },
};

export const LOCAL_DEEP_RESEARCH_EFFORT_ORDER = ["quick", "balanced", "deep", "exhaustive"] as const;
export const DEFAULT_LOCAL_DEEP_RESEARCH_EFFORT: LocalDeepResearchEffort = "balanced";
export const DEFAULT_LOCAL_DEEP_RESEARCH_ON_EXHAUSTED: LocalDeepResearchBudgetExhaustionBehavior = "ask_to_continue";
export const LOCAL_DEEP_RESEARCH_MIN_TOOL_CALLS = 1;
export const LOCAL_DEEP_RESEARCH_MAX_TOOL_CALLS = 500;

const efforts = new Set<LocalDeepResearchEffort>(["quick", "balanced", "deep", "exhaustive", "custom"]);
const exhaustionBehaviors = new Set<LocalDeepResearchBudgetExhaustionBehavior>(["summarize", "ask_to_continue"]);
const budgetSources = new Set<LocalDeepResearchBudgetSource>(["user_default", "run_override", "tool_input"]);

export function localDeepResearchEffortLabel(effort: LocalDeepResearchEffort): string {
  return effort === "custom" ? "Custom" : LOCAL_DEEP_RESEARCH_EFFORT_PRESETS[effort].label;
}

export function localDeepResearchMaxToolCallsForEffort(
  effort: LocalDeepResearchEffort,
  customMaxToolCalls?: number,
): number {
  if (effort === "custom") return boundedToolCalls(customMaxToolCalls ?? LOCAL_DEEP_RESEARCH_EFFORT_PRESETS.balanced.maxToolCalls);
  return LOCAL_DEEP_RESEARCH_EFFORT_PRESETS[effort].maxToolCalls;
}

export function normalizeLocalDeepResearchRunBudgetSettings(value: unknown): LocalDeepResearchRunBudgetSettings {
  const record = objectRecord(value);
  const defaultEffort = normalizeLocalDeepResearchEffort(record.defaultEffort, DEFAULT_LOCAL_DEEP_RESEARCH_EFFORT);
  const customMaxToolCalls = optionalBoundedToolCalls(record.customMaxToolCalls ?? record.maxToolCalls);
  return {
    schemaVersion: LOCAL_DEEP_RESEARCH_RUN_BUDGET_SCHEMA_VERSION,
    defaultEffort,
    ...(customMaxToolCalls !== undefined ? { customMaxToolCalls } : {}),
    onExhausted: normalizeLocalDeepResearchBudgetExhaustionBehavior(record.onExhausted, DEFAULT_LOCAL_DEEP_RESEARCH_ON_EXHAUSTED),
  };
}

export function resolveLocalDeepResearchRunBudget(
  settings: unknown,
  override?: Partial<Pick<LocalDeepResearchRunBudget, "effort" | "maxToolCalls" | "onExhausted">>,
): LocalDeepResearchRunBudget {
  const normalized = normalizeLocalDeepResearchRunBudgetSettings(settings);
  const effort = normalizeLocalDeepResearchEffort(override?.effort, normalized.defaultEffort);
  const overrideMaxToolCalls = optionalBoundedToolCalls(override?.maxToolCalls);
  const maxToolCalls = overrideMaxToolCalls ?? localDeepResearchMaxToolCallsForEffort(effort, normalized.customMaxToolCalls);
  return {
    schemaVersion: LOCAL_DEEP_RESEARCH_RUN_BUDGET_SCHEMA_VERSION,
    enabled: true,
    effort,
    maxToolCalls,
    source: override ? "run_override" : "user_default",
    onExhausted: normalizeLocalDeepResearchBudgetExhaustionBehavior(override?.onExhausted, normalized.onExhausted),
  };
}

export function normalizeLocalDeepResearchRunBudget(
  value: unknown,
  fallback?: Partial<Pick<LocalDeepResearchRunBudget, "effort" | "maxToolCalls" | "source" | "onExhausted">>,
): LocalDeepResearchRunBudget {
  const record = objectRecord(value);
  const effort = normalizeLocalDeepResearchEffort(record.effort, fallback?.effort ?? "custom");
  const maxToolCalls = boundedToolCalls(record.maxToolCalls ?? fallback?.maxToolCalls ?? localDeepResearchMaxToolCallsForEffort(effort));
  return {
    schemaVersion: LOCAL_DEEP_RESEARCH_RUN_BUDGET_SCHEMA_VERSION,
    enabled: true,
    effort,
    maxToolCalls,
    source: normalizeLocalDeepResearchBudgetSource(record.source, fallback?.source ?? "tool_input"),
    onExhausted: normalizeLocalDeepResearchBudgetExhaustionBehavior(record.onExhausted, fallback?.onExhausted ?? DEFAULT_LOCAL_DEEP_RESEARCH_ON_EXHAUSTED),
  };
}

export function localDeepResearchToolBudgetState(
  budget: LocalDeepResearchRunBudget,
  usedToolCalls: number,
): LocalDeepResearchToolBudgetState {
  const used = Math.max(0, Math.floor(usedToolCalls));
  const remaining = Math.max(0, budget.maxToolCalls - used);
  return {
    schemaVersion: LOCAL_DEEP_RESEARCH_TOOL_BUDGET_SCHEMA_VERSION,
    effort: budget.effort,
    maxToolCalls: budget.maxToolCalls,
    usedToolCalls: used,
    remainingToolCalls: remaining,
    exhausted: remaining <= 0,
    source: budget.source,
    onExhausted: budget.onExhausted,
  };
}

export function normalizeLocalDeepResearchEffort(value: unknown, fallback: LocalDeepResearchEffort = DEFAULT_LOCAL_DEEP_RESEARCH_EFFORT): LocalDeepResearchEffort {
  return typeof value === "string" && efforts.has(value as LocalDeepResearchEffort)
    ? value as LocalDeepResearchEffort
    : fallback;
}

export function normalizeLocalDeepResearchBudgetExhaustionBehavior(
  value: unknown,
  fallback: LocalDeepResearchBudgetExhaustionBehavior = DEFAULT_LOCAL_DEEP_RESEARCH_ON_EXHAUSTED,
): LocalDeepResearchBudgetExhaustionBehavior {
  return typeof value === "string" && exhaustionBehaviors.has(value as LocalDeepResearchBudgetExhaustionBehavior)
    ? value as LocalDeepResearchBudgetExhaustionBehavior
    : fallback;
}

function normalizeLocalDeepResearchBudgetSource(value: unknown, fallback: LocalDeepResearchBudgetSource): LocalDeepResearchBudgetSource {
  return typeof value === "string" && budgetSources.has(value as LocalDeepResearchBudgetSource)
    ? value as LocalDeepResearchBudgetSource
    : fallback;
}

function optionalBoundedToolCalls(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? boundedToolCalls(value)
    : undefined;
}

function boundedToolCalls(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : LOCAL_DEEP_RESEARCH_EFFORT_PRESETS.balanced.maxToolCalls;
  return Math.max(LOCAL_DEEP_RESEARCH_MIN_TOOL_CALLS, Math.min(LOCAL_DEEP_RESEARCH_MAX_TOOL_CALLS, parsed));
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
