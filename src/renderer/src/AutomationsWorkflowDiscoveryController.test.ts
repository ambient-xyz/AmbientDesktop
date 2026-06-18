import { describe, expect, it } from "vitest";

import type { WorkflowExplorationTraceSummary, WorkflowRevisionSummary } from "../../shared/workflowTypes";
import {
  activeDraftWorkflowRevisionForThread,
  decodeWorkflowExplorationSkips,
  latestWorkflowRunForArtifact,
  workflowDiscoveryAnswersAfterAnswered,
  workflowDiscoveryOptimisticAnswersWithoutQuestion,
  workflowDiscoveryRestartDraftsAfterRestart,
  workflowDiscoveryRestartRequest,
  workflowExplorationBudgetsAfterReset,
  workflowExplorationBudgetsAfterUpdate,
  workflowExplorationSkipsAfterRunStart,
  workflowExplorationSkipsAfterSkip,
  workflowExplorationTracesAfterRunResult,
} from "./AutomationsWorkflowDiscoveryController";

describe("Automations workflow discovery controller", () => {
  it("selects restart requests from a draft before falling back to the original request", () => {
    const thread = { id: "thread-1", initialRequest: "  Original workflow  " };

    expect(workflowDiscoveryRestartRequest({}, thread)).toBe("Original workflow");
    expect(workflowDiscoveryRestartRequest({ "thread-1": "  Revised workflow  " }, thread)).toBe("Revised workflow");
    expect(workflowDiscoveryRestartDraftsAfterRestart({ "thread-1": "Revised", "thread-2": "Keep" }, "thread-1")).toEqual({
      "thread-2": "Keep",
    });
  });

  it("clears transient discovery answer state after the backend accepts an answer", () => {
    expect(workflowDiscoveryAnswersAfterAnswered({ "question-1": "custom value" }, "question-1")).toEqual({
      "question-1": "",
    });
    expect(workflowDiscoveryOptimisticAnswersWithoutQuestion({ "question-1": true, "question-2": true }, "question-1")).toEqual({
      "question-2": true,
    });
  });

  it("normalizes and resets per-thread exploration budgets", () => {
    const updated = workflowExplorationBudgetsAfterUpdate({}, "thread-1", "maxToolCalls", "500");

    expect(updated["thread-1"].maxToolCalls).toBe(50);
    expect(workflowExplorationBudgetsAfterReset(updated, "thread-1")).toEqual({});
    expect(workflowExplorationBudgetsAfterReset({}, "missing")).toEqual({});
  });

  it("persists valid exploration skips and clears a skip when exploration runs again", () => {
    expect(decodeWorkflowExplorationSkips('{"thread-1":"2026-06-15T00:00:00.000Z","ignored":5}')).toEqual({
      "thread-1": "2026-06-15T00:00:00.000Z",
    });
    const skipped = workflowExplorationSkipsAfterSkip({}, "thread-1", "2026-06-15T00:00:00.000Z");

    expect(skipped).toEqual({ "thread-1": "2026-06-15T00:00:00.000Z" });
    expect(workflowExplorationSkipsAfterRunStart({ ...skipped, "thread-2": "later" }, "thread-1")).toEqual({
      "thread-2": "later",
    });
  });

  it("replaces duplicate exploration traces while preserving newest-first order", () => {
    const oldTrace = traceSummary("trace-1", "old");
    const newTrace = traceSummary("trace-1", "new");
    const otherTrace = traceSummary("trace-2", "other");

    expect(workflowExplorationTracesAfterRunResult({ "thread-1": [oldTrace, otherTrace] }, "thread-1", newTrace)).toEqual({
      "thread-1": [newTrace, otherTrace],
    });
  });

  it("finds draft workflow revisions and latest artifact runs for controller routing", () => {
    const draft = workflowRevision("revision-1", "thread-1", "draft");
    const accepted = workflowRevision("revision-2", "thread-1", "applied");

    expect(activeDraftWorkflowRevisionForThread([accepted, draft], "thread-1")).toBe(draft);
    expect(activeDraftWorkflowRevisionForThread([draft], "missing")).toBeUndefined();
    expect(
      latestWorkflowRunForArtifact(
        [
          { id: "run-1", artifactId: "other" },
          { id: "run-2", artifactId: "artifact-1" },
        ] as never,
        "artifact-1",
      ),
    ).toEqual({ id: "run-2", artifactId: "artifact-1" });
  });
});

function traceSummary(id: string, request: string): WorkflowExplorationTraceSummary {
  return {
    id,
    workflowThreadId: "thread-1",
    explorationId: "exploration-1",
    explorationNodeId: "agent-exploration",
    request,
    capabilityManifest: {},
    observations: [],
    events: [],
    distillation: {},
    createdAt: "2026-06-15T00:00:00.000Z",
  };
}

function workflowRevision(id: string, workflowThreadId: string, status: WorkflowRevisionSummary["status"]): WorkflowRevisionSummary {
  return {
    id,
    workflowThreadId,
    requestedChange: "Revise workflow",
    status,
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
  };
}
