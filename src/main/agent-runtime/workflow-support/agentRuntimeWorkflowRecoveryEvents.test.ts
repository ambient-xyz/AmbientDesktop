import { describe, expect, it } from "vitest";

import {
  agentRuntimeWorkflowRecoveryEventsForRemoteSurface,
  agentRuntimeWorkflowRecoveryEventsFromRunEvents,
  agentRuntimeWorkflowRecoveryEventsWithCommandExamples,
} from "./agentRuntimeWorkflowRecoveryEvents";

describe("agentRuntimeWorkflowRecoveryEvents", () => {
  it("collects recovery events from failed and stale workflow threads with active artifacts", () => {
    const eventsByRun = new Map([
      ["run-failed", [
        runEvent({
          id: "failed-event",
          runId: "run-failed",
          type: "collection.map.item.failed",
          data: { graphNodeId: "classify", itemKey: "row-7" },
        }),
      ]],
      ["run-stale", [
        runEvent({
          id: "stale-event",
          runId: "run-stale",
          type: "workflow.failed",
        }),
      ]],
      ["run-running", [
        runEvent({
          id: "running-event",
          runId: "run-running",
          type: "workflow.failed",
        }),
      ]],
    ]);

    const result = agentRuntimeWorkflowRecoveryEventsForRemoteSurface({
      workflowFolders: [
        {
          threads: [
            workflowThread({ latestRun: { id: "run-running", status: "running" }, activeArtifactId: "artifact-running" }),
            workflowThread({ latestRun: { id: "run-missing-artifact", status: "failed" } }),
            workflowThread({
              latestRun: { id: "run-failed", status: "failed" },
              activeArtifactId: "artifact-failed",
              graph: {
                nodes: [{
                  id: "classify",
                  type: "model_call",
                  label: "Classify",
                  retryPolicy: "Retry or skip failed items and continue with partial coverage.",
                }],
              },
            }),
            workflowThread({ latestRun: { id: "run-stale", status: "stale" }, activeArtifactId: "artifact-stale" }),
          ],
        },
      ],
      getWorkflowArtifact: (artifactId) => ({ statePath: `state-${artifactId}` }),
      listWorkflowRunEvents: (runId) => eventsByRun.get(runId) ?? [],
      readCheckpointSummaries: (statePath) => statePath === "state-artifact-failed" ? [{}] : [],
    });

    expect(result.map((event) => event.id)).toEqual(["failed-event", "stale-event"]);
    expect(result[0]).toMatchObject({
      graphNodeLabel: "Classify",
      itemKey: "row-7",
      retryEligible: true,
      resumeEligible: true,
      skipEligible: true,
    });
    expect(result[1]).toMatchObject({
      retryEligible: false,
      resumeEligible: false,
      skipEligible: false,
    });
  });

  it("projects workflow failure run events into recovery surface events with eligibility and commands", () => {
    const result = agentRuntimeWorkflowRecoveryEventsFromRunEvents({
      events: [
        runEvent({ id: "started", type: "workflow.started" }),
        runEvent({
          id: "failed",
          type: "collection.map.item.failed",
          message: "Classify failed for row 7.",
          data: { graphNodeId: "classify", itemKey: "row-7" },
        }),
      ],
      hasCheckpoint: true,
      nodeById: (graphNodeId) => graphNodeId === "classify"
        ? {
          id: "classify",
          type: "model_call",
          label: "Classify",
          retryPolicy: "Retry or skip failed items and continue with partial coverage.",
        }
        : undefined,
    });

    expect(result).toMatchObject([
      {
        id: "failed",
        runId: "run-1",
        type: "collection.map.item.failed",
        message: "Classify failed for row 7.",
        graphNodeId: "classify",
        graphNodeLabel: "Classify",
        graphNodeType: "model_call",
        itemKey: "row-7",
        retryEligible: true,
        retryLabel: "Retry failed item",
        resumeEligible: true,
        resumeLabel: "Resume from checkpoint",
        skipEligible: true,
        skipLabel: "Skip item",
        commandExamples: ["retry failed step", "resume checkpoint", "skip failed item"],
      },
    ]);
  });

  it("keeps only the latest three failure events in newest-first order", () => {
    const result = agentRuntimeWorkflowRecoveryEventsFromRunEvents({
      events: [
        runEvent({ id: "first", type: "workflow.failed" }),
        runEvent({ id: "noise", type: "workflow.started" }),
        runEvent({ id: "second", type: "workflow.failed" }),
        runEvent({ id: "third", type: "workflow.failed" }),
        runEvent({ id: "fourth", type: "workflow.failed" }),
      ],
      hasCheckpoint: false,
    });

    expect(result.map((event) => event.id)).toEqual(["fourth", "third", "second"]);
  });

  it("uses unnumbered command examples when only one event is eligible for each action", () => {
    const result = agentRuntimeWorkflowRecoveryEventsWithCommandExamples([
      recoveryEvent({ retryEligible: true, resumeEligible: true, skipEligible: true }),
    ]);

    expect(result[0]?.commandExamples).toEqual(["retry failed step", "resume checkpoint", "skip failed item"]);
  });

  it("numbers command examples by recovery candidate index when multiple candidates are eligible", () => {
    const result = agentRuntimeWorkflowRecoveryEventsWithCommandExamples([
      recoveryEvent({ retryEligible: false, resumeEligible: true, skipEligible: false }),
      recoveryEvent({ retryEligible: true, resumeEligible: true, skipEligible: true }),
      recoveryEvent({ retryEligible: true, resumeEligible: true, skipEligible: true }),
    ]);

    expect(result[1]?.commandExamples).toEqual(["retry failed event 2", "resume checkpoint 2", "skip failed item 2"]);
    expect(result[2]?.commandExamples).toEqual(["retry failed event 3", "resume checkpoint 3", "skip failed item 3"]);
  });

  it("omits command examples for ineligible actions", () => {
    const result = agentRuntimeWorkflowRecoveryEventsWithCommandExamples([
      recoveryEvent({ retryEligible: false, resumeEligible: false, skipEligible: false }),
    ]);

    expect(result[0]).toEqual(recoveryEvent({ retryEligible: false, resumeEligible: false, skipEligible: false }));
    expect(result[0]?.commandExamples).toBeUndefined();
  });
});

function recoveryEvent(overrides: {
  retryEligible: boolean;
  resumeEligible: boolean;
  skipEligible: boolean;
}) {
  return {
    id: "event-1",
    retryEligible: overrides.retryEligible,
    resumeEligible: overrides.resumeEligible,
    skipEligible: overrides.skipEligible,
  };
}

function runEvent(overrides: Partial<{
  id: string;
  runId: string;
  type: string;
  message: string;
  data: Record<string, unknown>;
}>) {
  return {
    id: "event-1",
    runId: "run-1",
    artifactId: "artifact-1",
    seq: 1,
    type: "workflow.failed",
    createdAt: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}

function workflowThread(overrides: Partial<{
  activeArtifactId: string;
  latestRun: {
    id: string;
    status: string;
  };
  graph: {
    nodes: Array<{
      id: string;
      type: "model_call";
      label: string;
      retryPolicy?: string;
    }>;
  };
}>) {
  return {
    ...overrides,
  };
}
