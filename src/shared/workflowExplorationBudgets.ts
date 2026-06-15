export interface WorkflowExplorationBudgets {
  maxModelTurns: number;
  maxToolCalls: number;
  maxConnectorCalls: number;
  maxAmbientCalls: number;
  maxElapsedMs: number;
}

export const DEFAULT_WORKFLOW_EXPLORATION_BUDGETS: WorkflowExplorationBudgets = {
  maxModelTurns: 6,
  maxToolCalls: 4,
  maxConnectorCalls: 4,
  maxAmbientCalls: 2,
  maxElapsedMs: 180_000,
};

export function defaultWorkflowExplorationBudgets(overrides: Partial<WorkflowExplorationBudgets> = {}): WorkflowExplorationBudgets {
  return {
    ...DEFAULT_WORKFLOW_EXPLORATION_BUDGETS,
    ...Object.fromEntries(
      Object.entries(overrides).filter((entry): entry is [keyof WorkflowExplorationBudgets, number] => {
        const value = entry[1];
        return typeof value === "number" && Number.isFinite(value) && value > 0;
      }),
    ),
  };
}
