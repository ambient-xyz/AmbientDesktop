import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSubagentReplayDiagnosticsPlan,
  renderSubagentReplayDiagnosticsMarkdown,
  runSubagentReplayDiagnostics,
  summarizeSubagentReplayVitestResult,
} from "./subagent-replay-diagnostics-lib.mjs";

describe("sub-agent replay diagnostics CLI", () => {
  it("builds a deterministic no-live-token replay plan", () => {
    const plan = buildSubagentReplayDiagnosticsPlan({
      outputPath: "/tmp/subagent-replay/latest.json",
    });

    expect(plan).toMatchObject({
      schemaVersion: "ambient-subagent-replay-diagnostics-plan-v1",
      fixture: "restart-repair-broken-child-tree",
      liveTokens: false,
      vitestOutputPath: "/tmp/subagent-replay/latest-vitest.json",
      fixtureEvidencePath: "/tmp/subagent-replay/latest-fixture-evidence.json",
      lifecycleEdgeEvidencePath: "/tmp/subagent-replay/latest-lifecycle-edge-evidence.json",
      stdoutPath: "/tmp/subagent-replay/latest.stdout.txt",
      stderrPath: "/tmp/subagent-replay/latest.stderr.txt",
      testFiles: [
        "src/test/subagentFixtures.test.ts",
        "src/main/subagents/subagentRepair.test.ts",
        "src/main/subagents/subagentLifecycleEdgeEvidence.test.ts",
      ],
    });
    expect(plan.args).toEqual(expect.arrayContaining([
      "src/test/subagentFixtures.test.ts",
      "src/main/subagents/subagentRepair.test.ts",
      "src/main/subagents/subagentLifecycleEdgeEvidence.test.ts",
      "--reporter=json",
      "--outputFile=/tmp/subagent-replay/latest-vitest.json",
    ]));
  });

  it("summarizes Vitest JSON and requires the replay fixture checks", () => {
    expect(summarizeSubagentReplayVitestResult(vitestResult())).toMatchObject({
      status: "passed",
      totalTests: 12,
      passedTests: 12,
      failedTests: 0,
      totalSuites: 2,
      failedSuites: 0,
      missingReplayTests: [],
    });

    const missing = summarizeSubagentReplayVitestResult(vitestResult({
      assertionResults: [{ fullName: "other test", status: "passed" }],
    }));
    expect(missing.status).toBe("failed");
    expect(missing.missingReplayTests).toEqual(expect.arrayContaining([
      "subagentRepair replays the shared restart repair fixture without live Pi tokens",
      "subagent lifecycle edge evidence builds lifecycle edge evidence for restart, stop, detach, cancel, retry, timeout, and partial results",
    ]));
  });

  it("writes JSON, Markdown, and full command output artifacts", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "subagent-replay-diagnostics-"));
    const outputPath = join(outputDir, "latest.json");

    const report = await runSubagentReplayDiagnostics({
      outputPath,
      startedAt: "2026-06-05T00:00:00.000Z",
      completedAt: "2026-06-05T00:00:01.000Z",
      durationMs: 1000,
      vitestResult: vitestResult(),
      replayEvidence: replayEvidence(),
      lifecycleEdgeEvidence: lifecycleEdgeEvidence(),
      runCommand: async () => ({
        exitCode: 0,
        stdout: "fixture replay ok",
        stderr: "",
      }),
    });

    expect(report).toMatchObject({
      schemaVersion: "ambient-subagent-replay-diagnostics-v1",
      status: "passed",
      diagnostics: {
        blockingIssues: [],
        nextAction: "Replay fixture diagnostics passed without live Ambient/Pi tokens.",
      },
    });
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
      status: "passed",
      vitest: {
        totalTests: 12,
        missingReplayTests: [],
      },
      replayEvidence: {
        schemaVersion: "ambient-subagent-replay-evidence-v1",
        counts: {
          runtimeEvents: 3,
          parentMailboxEvents: 1,
          restartRepairIssues: 7,
        },
      },
      lifecycleEdgeEvidence: {
        schemaVersion: "ambient-subagent-lifecycle-edge-evidence-v1",
        summary: {
          coveredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"],
          missingEdgeKinds: [],
          unsafeEdgeIds: [],
        },
      },
    });
    expect(await readFile(outputPath.replace(/\.json$/i, ".md"), "utf8")).toContain("Sub-Agent Replay Diagnostics");
    expect(await readFile(outputPath.replace(/\.json$/i, ".md"), "utf8")).toContain("Event Stream Evidence");
    expect(await readFile(outputPath.replace(/\.json$/i, ".md"), "utf8")).toContain("Lifecycle Edge Evidence");
    expect(await readFile(outputPath.replace(/\.json$/i, ".md"), "utf8")).toContain("Covered edges: restart; stop; detach; cancel; retry; timeout; partial_result");
    expect(await readFile(outputPath.replace(/\.json$/i, ".md"), "utf8")).toContain("Parent mailbox events: 1");
    expect(await readFile(outputPath.replace(/\.json$/i, ".md"), "utf8")).toContain("Result artifact pointers: 1");
    expect(await readFile(outputPath.replace(/\.json$/i, ".stdout.txt"), "utf8")).toBe("fixture replay ok");
  });

  it("fails when the command exits nonzero or required replay checks are absent", async () => {
    const report = await runSubagentReplayDiagnostics({
      outputPath: false,
      vitestResult: vitestResult({
        numFailedTests: 1,
        assertionResults: [{ fullName: "other test", status: "failed" }],
      }),
      replayEvidence: {
        schemaVersion: "ambient-subagent-replay-evidence-v1",
        liveTokens: true,
        runtimeEventTimeline: [],
        parentMailboxTimeline: [],
      },
      lifecycleEdgeEvidence: {
        schemaVersion: "ambient-subagent-lifecycle-edge-evidence-v1",
        liveTokens: false,
        featureFlagSnapshot: { ambientSubagentsEnabled: true },
        parent: { threadId: "parent-thread", runId: "parent-run" },
        edges: [],
        summary: {
          requiredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "partial_result"],
          coveredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "partial_result"],
          missingEdgeKinds: ["timeout"],
          unsafeEdgeIds: [],
        },
      },
      runCommand: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "boom",
      }),
    });

    expect(report.status).toBe("failed");
    expect(report.diagnostics.blockingIssues).toEqual(expect.arrayContaining([
      "Replay diagnostics command exited 1.",
      "1 replay test failed.",
    ]));
    expect(report.diagnostics.blockingIssues.join("\n")).toContain("Replay diagnostics did not observe required tests");
    expect(report.diagnostics.blockingIssues.join("\n")).toContain("Replay evidence artifact is invalid");
    expect(report.diagnostics.blockingIssues.join("\n")).toContain("Lifecycle edge evidence artifact is invalid");
  });

  it("renders Markdown with artifact pointers", () => {
    const markdown = renderSubagentReplayDiagnosticsMarkdown({
      completedAt: "2026-06-05T00:00:00.000Z",
      status: "passed",
      plan: buildSubagentReplayDiagnosticsPlan({ outputPath: "/tmp/subagent/latest.json" }),
      commandResult: { exitCode: 0, stdoutPath: "/tmp/subagent/latest.stdout.txt", stderrPath: "/tmp/subagent/latest.stderr.txt" },
      vitest: summarizeSubagentReplayVitestResult(vitestResult()),
      replayEvidence: replayEvidence(),
      lifecycleEdgeEvidence: lifecycleEdgeEvidence(),
      diagnostics: { blockingIssues: [] },
    });

    expect(markdown).toContain("Live tokens: no");
    expect(markdown).toContain("latest.stdout.txt");
    expect(markdown).toContain("Runtime events: 3");
    expect(markdown).toContain("Parent mailbox events: 1");
    expect(markdown).toContain("Covered edges: restart; stop; detach; cancel; retry; timeout; partial_result");
  });
});

function vitestResult(overrides = {}) {
  const assertionResults = overrides.assertionResults ?? [
    {
      fullName: "subagent test fixtures builds deterministic restart replay state with bounded transcripts and runtime events",
      status: "passed",
    },
    {
      fullName: "subagent test fixtures builds a compact deterministic replay evidence timeline",
      status: "passed",
    },
    {
      fullName: "subagentRepair replays the shared restart repair fixture without live Pi tokens",
      status: "passed",
    },
    {
      fullName: "subagent lifecycle edge evidence builds lifecycle edge evidence for restart, stop, detach, cancel, retry, timeout, and partial results",
      status: "passed",
    },
  ];
  return {
    success: overrides.numFailedTests ? false : true,
    numTotalTests: overrides.numTotalTests ?? 12,
    numPassedTests: overrides.numPassedTests ?? 12 - (overrides.numFailedTests ?? 0),
    numFailedTests: overrides.numFailedTests ?? 0,
    numTotalTestSuites: 2,
    numFailedTestSuites: overrides.numFailedTests ? 1 : 0,
    testResults: [
      {
        name: "src/test/subagentFixtures.test.ts",
        status: overrides.numFailedTests ? "failed" : "passed",
        assertionResults,
      },
    ],
  };
}

function lifecycleEdgeEvidence() {
  return {
    schemaVersion: "ambient-subagent-lifecycle-edge-evidence-v1",
    createdAt: "2026-06-05T00:00:00.000Z",
    source: "deterministic_fixture",
    liveTokens: false,
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    parent: {
      threadId: "parent-thread",
      runId: "parent-run",
      messageId: "parent-message",
    },
    summary: {
      requiredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"],
      coveredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"],
      missingEdgeKinds: [],
      unsafeEdgeIds: [],
      liveTokens: false,
    },
    edges: [
      lifecycleEdge({
        id: "edge-restart",
        kind: "restart",
        label: "Restart after active child",
        parentBlockingStateBefore: "waiting_on_child",
        parentBlockingStateAfter: "interrupted_repair_visible",
        childRunIds: ["run-active"],
        childThreadIds: ["child-active"],
        observedEventIds: ["runtime-event-started", "repair-diagnostic-active-run"],
      }),
      lifecycleEdge({
        id: "edge-child-stop",
        kind: "stop",
        label: "Stopped child while sibling keeps running",
        parentBlockingStateBefore: "waiting_on_two_children",
        parentBlockingStateAfter: "needs_decision_after_stopped_child",
        childRunIds: ["run-stopped"],
        childThreadIds: ["child-stopped"],
        observedEventIds: ["cancel-event-stopped"],
      }),
      lifecycleEdge({
        id: "edge-detach",
        kind: "detach",
        label: "Detached child from parent wait",
        parentBlockingStateBefore: "waiting_on_detachable_child",
        parentBlockingStateAfter: "unblocked_detached_child_visible",
        childRunIds: ["run-detached"],
        childThreadIds: ["child-detached"],
        observedEventIds: ["mailbox-detach-decision"],
      }),
      lifecycleEdge({
        id: "edge-parent-cancel",
        kind: "cancel",
        label: "Parent cancellation cascades to children",
        parentBlockingStateBefore: "waiting_on_children",
        parentBlockingStateAfter: "parent_cancelled_children_marked",
        childRunIds: ["run-cancel-a"],
        childThreadIds: ["child-cancel-a"],
        observedEventIds: ["parent-cancel-requested"],
      }),
      lifecycleEdge({
        id: "edge-retry-child",
        kind: "retry",
        label: "Retry failed required child while parent stays blocked",
        parentBlockingStateBefore: "failed_required_child_waiting_for_decision",
        parentBlockingStateAfter: "retry_requested_parent_still_blocked",
        childRunIds: ["run-retry"],
        childThreadIds: ["child-retry"],
        observedEventIds: ["mailbox-retry-decision", "runtime-retry-started", "retry-mailbox-consumed"],
        retry: {
          retryRequestedRunIds: ["run-retry"],
          retryAcceptedRunIds: ["run-retry"],
          retryMailboxEventIds: ["mailbox-retry"],
          parentRemainedBlocked: true,
          childSessionRestarted: true,
        },
      }),
      lifecycleEdge({
        id: "edge-timeout",
        kind: "timeout",
        label: "Timed-out required child blocks unsafe synthesis",
        parentBlockingStateBefore: "waiting_on_required_child",
        parentBlockingStateAfter: "timed_out_needs_user_choice",
        childRunIds: ["run-timeout"],
        childThreadIds: ["child-timeout"],
        observedEventIds: ["barrier-timeout-event"],
      }),
      lifecycleEdge({
        id: "edge-partial-result",
        kind: "partial_result",
        label: "User explicitly continues with partial result",
        parentBlockingStateBefore: "waiting_on_failed_child",
        parentBlockingStateAfter: "partial_result_synthesis_allowed",
        childRunIds: ["run-complete", "run-failed"],
        childThreadIds: ["child-complete", "child-failed"],
        observedEventIds: ["barrier-partial-decision"],
      }),
    ],
  };
}

function lifecycleEdge(edge) {
  return {
    ...edge,
    synthesisSafety: {
      parentDidNotSynthesizeUnsafeChild: true,
      resultArtifactStateExplicit: true,
      affectedChildrenNamed: true,
      decisionOrEventAttributed: true,
      visibleCollapsedThreadState: true,
    },
  };
}

function replayEvidence() {
  return {
    schemaVersion: "ambient-subagent-replay-evidence-v1",
    fixtureName: "restart-repair-broken-child-tree",
    createdAt: "2026-06-05T00:00:00.000Z",
    liveTokens: false,
    counts: {
      threads: 4,
      childThreads: 4,
      runs: 3,
      persistedRunEvents: 4,
      runtimeEvents: 3,
      parentMailboxEvents: 1,
      transcriptMessages: 3,
      restartRepairIssues: 7,
    },
    childThreads: [{ threadId: "child-active", runId: "run-active" }],
    runtimeEventTimeline: [{ sequence: 1, runId: "run-active", parentRunId: "parent-run", childThreadId: "child-active", createdAt: "2026-06-05T00:00:00.000Z", source: "spawn_agent", type: "started" }],
    persistedRunEventTimeline: [{ sequence: 1, runId: "run-active", parentRunId: "parent-run", childThreadId: "child-active", createdAt: "2026-06-05T00:00:00.000Z", source: "project_store", type: "subagent.lifecycle_started" }],
    parentMailboxTimeline: [{ sequence: 1, id: "parent-mailbox-grouped-completion", parentRunId: "parent-run", parentThreadId: "parent-thread", parentMessageId: "parent-message-2", createdAt: "2026-06-05T00:00:11.000Z", updatedAt: "2026-06-05T00:00:11.000Z", type: "subagent.grouped_completion", deliveryState: "queued", childRunIds: ["run-artifact", "run-terminal"], payloadPreview: "run-terminal: completed: Completed reviewer fixture without a result artifact." }],
    transcriptTimeline: [],
    rehydration: rehydrationProof(),
    restartRepair: {
      expectedIssueKinds: [
        "active_run_interrupted",
        "missing_lifecycle_stop",
      ],
      observedIssueKinds: [
        "active_run_interrupted",
        "missing_lifecycle_stop",
      ],
      repairedRunIds: ["run-active"],
      repairedBarrierIds: ["barrier-required"],
      repairedParentControlBarrierIds: [],
      repairableSpawnEdgeRunIds: ["run-terminal"],
      danglingSpawnEdgeRunIds: ["missing-run"],
      diagnosticRunIds: ["run-terminal"],
    },
  };
}

function rehydrationProof() {
  return {
    schemaVersion: "ambient-subagent-restart-rehydration-proof-v1",
    childRunIds: ["run-active", "run-artifact", "run-terminal"],
    childThreadIds: ["child-active", "child-artifact", "child-terminal", "orphan-child"],
    parentMailboxEventIds: ["parent-mailbox-grouped-completion"],
    parentMailboxStates: [{
      id: "parent-mailbox-grouped-completion",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message-2",
      deliveryState: "queued",
      childRunIds: ["run-artifact", "run-terminal"],
    }],
    transcriptChildRunIds: ["run-active"],
    transcriptThreadIds: ["child-active", "parent-thread"],
    resultArtifactPointers: [{
      runId: "run-artifact",
      childThreadId: "child-artifact",
      status: "completed",
      artifactPath: ".ambient-codex/subagents/run-artifact/result.json",
      fullOutputPath: ".ambient-codex/subagents/run-artifact/full-output.txt",
      structuredOutputPath: ".ambient-codex/subagents/run-artifact/structured.json",
    }],
    missingResultArtifactRunIds: ["run-terminal"],
    artifactPointerIntegrity: {
      allResultPointersHaveRunAndThread: true,
      missingResultArtifactsDiagnosed: true,
      parentMailboxChildRefsResolved: true,
      transcriptChildRefsResolved: true,
    },
  };
}
