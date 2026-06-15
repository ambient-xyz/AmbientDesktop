import type { RunWorkflowThreadExplorationInput } from "../../shared/types";
import { defaultWorkflowExplorationBudgets, type WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";

export const workflowExplorationElapsedBudgetOptions = [
  { value: 60_000, label: "1 min" },
  { value: 180_000, label: "3 min" },
  { value: 300_000, label: "5 min" },
  { value: 600_000, label: "10 min" },
  { value: 900_000, label: "15 min" },
];

const budgetLimits: Record<keyof WorkflowExplorationBudgets, { min: number; max: number }> = {
  maxModelTurns: { min: 1, max: 20 },
  maxToolCalls: { min: 1, max: 50 },
  maxConnectorCalls: { min: 1, max: 200 },
  maxAmbientCalls: { min: 1, max: 20 },
  maxElapsedMs: { min: 1_000, max: 900_000 },
};

export function normalizeWorkflowExplorationBudgets(input: Partial<WorkflowExplorationBudgets> = {}): WorkflowExplorationBudgets {
  const defaults = defaultWorkflowExplorationBudgets(input);
  return {
    maxModelTurns: clampBudget("maxModelTurns", defaults.maxModelTurns),
    maxToolCalls: clampBudget("maxToolCalls", defaults.maxToolCalls),
    maxConnectorCalls: clampBudget("maxConnectorCalls", defaults.maxConnectorCalls),
    maxAmbientCalls: clampBudget("maxAmbientCalls", defaults.maxAmbientCalls),
    maxElapsedMs: clampBudget("maxElapsedMs", defaults.maxElapsedMs),
  };
}

export function workflowExplorationBudgetWithField(
  current: Partial<WorkflowExplorationBudgets>,
  field: keyof WorkflowExplorationBudgets,
  rawValue: unknown,
): WorkflowExplorationBudgets {
  return normalizeWorkflowExplorationBudgets({
    ...current,
    [field]: numericValue(rawValue),
  });
}

export function workflowExplorationRunInput(
  workflowThreadId: string,
  budgets: Partial<WorkflowExplorationBudgets>,
): RunWorkflowThreadExplorationInput {
  return {
    workflowThreadId,
    ...normalizeWorkflowExplorationBudgets(budgets),
  };
}

export function workflowExplorationBudgetLabels(budgets: WorkflowExplorationBudgets): string[] {
  return [
    `${budgets.maxModelTurns} Pi turns`,
    `${budgets.maxToolCalls} tool calls`,
    `${budgets.maxConnectorCalls} connector calls`,
    `${budgets.maxAmbientCalls} Ambient calls`,
    `${formatDuration(budgets.maxElapsedMs)} wall-clock cap`,
  ];
}

function clampBudget(field: keyof WorkflowExplorationBudgets, value: number): number {
  const limit = budgetLimits[field];
  return Math.min(limit.max, Math.max(limit.min, Math.floor(value)));
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function formatDuration(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${Math.round(ms / 60_000)}m`;
  if (ms >= 1_000 && ms % 1_000 === 0) return `${Math.round(ms / 1_000)}s`;
  return `${Math.round(ms)}ms`;
}
