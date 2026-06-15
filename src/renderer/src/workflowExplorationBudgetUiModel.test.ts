import { describe, expect, it } from "vitest";
import {
  normalizeWorkflowExplorationBudgets,
  workflowExplorationBudgetLabels,
  workflowExplorationBudgetWithField,
  workflowExplorationRunInput,
} from "./workflowExplorationBudgetUiModel";

describe("workflowExplorationBudgetUiModel", () => {
  it("normalizes default exploration operation budgets", () => {
    expect(normalizeWorkflowExplorationBudgets()).toEqual({
      maxModelTurns: 6,
      maxToolCalls: 4,
      maxConnectorCalls: 4,
      maxAmbientCalls: 2,
      maxElapsedMs: 180_000,
    });
  });

  it("applies field edits within the per-run IPC limits", () => {
    expect(workflowExplorationBudgetWithField({ maxConnectorCalls: 4 }, "maxConnectorCalls", "12")).toMatchObject({
      maxConnectorCalls: 12,
    });
    expect(workflowExplorationBudgetWithField({ maxConnectorCalls: 4 }, "maxConnectorCalls", 500)).toMatchObject({
      maxConnectorCalls: 200,
    });
  });

  it("formats budget labels for preflight and retained trace display", () => {
    expect(
      workflowExplorationBudgetLabels({
        maxModelTurns: 8,
        maxToolCalls: 6,
        maxConnectorCalls: 10,
        maxAmbientCalls: 3,
        maxElapsedMs: 600_000,
      }),
    ).toEqual(["8 Pi turns", "6 tool calls", "10 connector calls", "3 Ambient calls", "10m wall-clock cap"]);
  });

  it("builds the workflow exploration run input with custom overrides", () => {
    expect(
      workflowExplorationRunInput("workflow-thread-1", {
        maxModelTurns: 8,
        maxToolCalls: 6,
        maxConnectorCalls: 10,
        maxAmbientCalls: 3,
        maxElapsedMs: 600_000,
      }),
    ).toEqual({
      workflowThreadId: "workflow-thread-1",
      maxModelTurns: 8,
      maxToolCalls: 6,
      maxConnectorCalls: 10,
      maxAmbientCalls: 3,
      maxElapsedMs: 600_000,
    });
  });
});
