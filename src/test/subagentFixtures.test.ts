import { describe, expect, it } from "vitest";
import { validateSubagentResultArtifactForSynthesis } from "../shared/subagentProtocol";
import {
  subagentReplayEvidence,
  subagentFixtureResultArtifact,
  subagentFixtureRuntimeEvents,
  subagentFixtureRun,
  subagentRestartReplayFixture,
} from "./subagentFixtures";

describe("subagent test fixtures", () => {
  it("builds deterministic restart replay state with bounded transcripts and runtime events", () => {
    const fixture = subagentRestartReplayFixture();

    expect(subagentRestartReplayFixture()).toEqual(fixture);
    expect(fixture).toMatchObject({
      schemaVersion: "ambient-subagent-replay-fixture-v1",
      name: "restart-repair-broken-child-tree",
      expectedIssueKinds: [
        "active_run_interrupted",
        "missing_lifecycle_stop",
        "missing_spawn_edge",
        "missing_result_artifact",
        "dangling_spawn_edge",
        "orphan_child_thread",
        "dangling_wait_barrier_child",
      ],
    });
    expect(fixture.threads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "parent-thread", kind: "chat" }),
      expect.objectContaining({ id: "child-active", kind: "subagent_child", collapsedByDefault: true }),
      expect.objectContaining({ id: "orphan-child", subagentRunId: "missing-run" }),
    ]));
    expect(fixture.transcript.map((message) => message.content.length)).toEqual([51, 48, 56]);
    expect(fixture.runtimeEvents).toEqual([
      expect.objectContaining({
        schemaVersion: "ambient-subagent-runtime-event-v1",
        runId: "run-active",
        childThreadId: "child-active",
        type: "started",
      }),
      expect.objectContaining({
        runId: "run-active",
        type: "tool_call",
        toolName: "workspace_search",
      }),
      expect.objectContaining({
        runId: "run-active",
        type: "tool_result",
        textPreview: "Found fixture restart state.",
      }),
    ]);
    expect(fixture.parentMailboxEvents).toEqual([
      expect.objectContaining({
        id: "parent-mailbox-grouped-completion",
        type: "subagent.grouped_completion",
        parentMessageId: "parent-message-2",
        payload: expect.objectContaining({
          childRuns: expect.arrayContaining([
            expect.objectContaining({
              runId: "run-terminal",
              summary: "Completed reviewer fixture without a result artifact.",
            }),
            expect.objectContaining({
              runId: "run-artifact",
              summary: "Completed summarizer fixture with artifact pointers.",
            }),
          ]),
        }),
      }),
    ]);
  });

  it("builds a compact deterministic replay evidence timeline", () => {
    const fixture = subagentRestartReplayFixture();
    const evidence = subagentReplayEvidence({ fixture, maxPreviewChars: 24 });

    expect(subagentReplayEvidence({ fixture, maxPreviewChars: 24 })).toEqual(evidence);
    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-replay-evidence-v1",
      fixtureName: "restart-repair-broken-child-tree",
      liveTokens: false,
      counts: {
        childThreads: 4,
        runs: 3,
        persistedRunEvents: 5,
        runtimeEvents: 3,
        parentMailboxEvents: 1,
        transcriptMessages: 3,
        restartRepairIssues: 0,
      },
    });
    expect(evidence.childThreads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        threadId: "child-active",
        runId: "run-active",
        canonicalTaskPath: "root/0:explorer",
        collapsedByDefault: true,
      }),
    ]));
    expect(evidence.runtimeEventTimeline).toEqual([
      expect.objectContaining({
        sequence: 1,
        source: "spawn_agent",
        runId: "run-active",
        childThreadId: "child-active",
        canonicalTaskPath: "root/0:explorer",
        type: "started",
      }),
      expect.objectContaining({
        sequence: 2,
        source: "child_runtime",
        type: "tool_call",
        toolName: "workspace_search",
        textPreview: expect.stringContaining("[truncated"),
      }),
      expect.objectContaining({
        sequence: 3,
        source: "child_runtime",
        type: "tool_result",
        toolName: "workspace_search",
      }),
    ]);
    expect(evidence.persistedRunEventTimeline.map((event) => event.type)).toEqual([
      "subagent.lifecycle_started",
      "subagent.lifecycle_started",
      "subagent.lifecycle_started",
      "subagent.completed",
      "subagent.lifecycle_stopped",
    ]);
    expect(evidence.parentMailboxTimeline).toEqual([
      expect.objectContaining({
        id: "parent-mailbox-grouped-completion",
        parentMessageId: "parent-message-2",
        type: "subagent.grouped_completion",
        childRunIds: ["run-artifact", "run-terminal"],
        payloadPreview: expect.stringContaining("run-terminal"),
      }),
    ]);
    expect(evidence.rehydration).toMatchObject({
      schemaVersion: "ambient-subagent-restart-rehydration-proof-v1",
      childRunIds: ["run-active", "run-artifact", "run-terminal"],
      childThreadIds: ["child-active", "child-artifact", "child-terminal", "orphan-child"],
      parentMailboxEventIds: ["parent-mailbox-grouped-completion"],
      parentMailboxStates: [
        expect.objectContaining({
          id: "parent-mailbox-grouped-completion",
          deliveryState: "queued",
          childRunIds: ["run-artifact", "run-terminal"],
        }),
      ],
      resultArtifactPointers: [
        expect.objectContaining({
          runId: "run-artifact",
          childThreadId: "child-artifact",
          artifactPath: ".ambient-codex/subagents/run-artifact/result.json",
          fullOutputPath: ".ambient-codex/subagents/run-artifact/full-output.txt",
          structuredOutputPath: ".ambient-codex/subagents/run-artifact/structured.json",
        }),
      ],
      missingResultArtifactRunIds: ["run-terminal"],
      artifactPointerIntegrity: {
        allResultPointersHaveRunAndThread: true,
        missingResultArtifactsDiagnosed: false,
        parentMailboxChildRefsResolved: true,
        transcriptChildRefsResolved: true,
      },
    });
    expect(evidence.transcriptTimeline.every((message) => message.contentPreview.includes("[truncated"))).toBe(true);
  });

  it("creates realistic run snapshots and synthesizable result artifacts", () => {
    const run = subagentFixtureRun({
      id: "run-review",
      roleId: "reviewer",
      status: "completed",
      childThreadId: "child-review",
      canonicalTaskPath: "root/1:reviewer",
    });
    const artifact = subagentFixtureResultArtifact({
      runId: run.id,
      childThreadId: run.childThreadId,
      summary: "Reviewer fixture completed.",
    });

    expect(run).toMatchObject({
      protocolVersion: "ambient-subagent-v1",
      roleProfileSnapshot: { id: "reviewer" },
      featureFlagSnapshot: {
        flags: {
          "ambient.subagents": expect.objectContaining({ enabled: true, source: "startup_arg_enable" }),
        },
      },
      modelRuntimeSnapshot: {
        profile: expect.objectContaining({ modelId: "example/model-id" }),
      },
      capacityLeaseSnapshot: {
        schemaVersion: "ambient-subagent-capacity-lease-v1",
        status: "reserved",
        parentRunId: "parent-run",
      },
    });
    expect(validateSubagentResultArtifactForSynthesis(artifact)).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      partial: false,
      status: "completed",
    });
  });

  it("keeps generated runtime events attributed to the selected child run", () => {
    const run = subagentFixtureRun({
      id: "run-local",
      childThreadId: "child-local",
      status: "running",
    });

    expect(subagentFixtureRuntimeEvents(run).map((event) => ({
      source: event.source,
      runId: event.runId,
      parentRunId: event.parentRunId,
      childThreadId: event.childThreadId,
    }))).toEqual([
      { source: "spawn_agent", runId: "run-local", parentRunId: "parent-run", childThreadId: "child-local" },
      { source: "child_runtime", runId: "run-local", parentRunId: "parent-run", childThreadId: "child-local" },
      { source: "child_runtime", runId: "run-local", parentRunId: "parent-run", childThreadId: "child-local" },
    ]);
  });
});
