import { describe, expect, it } from "vitest";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import { CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON } from "../../shared/callableWorkflowTaskGuards";
import { shouldCancelCallableWorkflowSymphonyLaunchChildren } from "./agentRuntimeCallableWorkflowSymphonyBridgeController";

describe("AgentRuntimeCallableWorkflowSymphonyBridgeController", () => {
  it("keeps pre-compile Symphony child-wait pauses eligible for child cleanup", () => {
    expect(shouldCancelCallableWorkflowSymphonyLaunchChildren(callableWorkflowTask({
      status: "paused",
      runnerDeferredReason: CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
      workflowArtifactId: undefined,
      workflowRunId: undefined,
      sourceKind: "symphony_recipe",
      patternGraphSnapshot: undefined,
    }))).toBe(true);
  });

  it("cleans compiling Symphony tasks only when child runs have been launched", () => {
    expect(shouldCancelCallableWorkflowSymphonyLaunchChildren(callableWorkflowTask({
      status: "compiling",
      sourceKind: "symphony_recipe",
      patternGraphSnapshot: {
        nodes: [{ childRunId: "child-1" }],
      } as CallableWorkflowTaskSummary["patternGraphSnapshot"],
    }))).toBe(true);
    expect(shouldCancelCallableWorkflowSymphonyLaunchChildren(callableWorkflowTask({
      status: "compiling",
      sourceKind: "recorded_workflow",
      patternGraphSnapshot: {
        nodes: [{ childRunId: "child-1" }],
      } as CallableWorkflowTaskSummary["patternGraphSnapshot"],
    }))).toBe(false);
  });
});

function callableWorkflowTask(
  input: Partial<CallableWorkflowTaskSummary>,
): CallableWorkflowTaskSummary {
  return {
    id: "task-1",
    status: "queued",
    sourceKind: "symphony_recipe",
    patternGraphSnapshot: undefined,
    ...input,
  } as CallableWorkflowTaskSummary;
}
