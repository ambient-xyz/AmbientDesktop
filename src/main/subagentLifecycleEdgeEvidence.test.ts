import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSubagentLifecycleEdgeEvidence,
  summarizeSubagentLifecycleEdgeEvidence,
  type SubagentLifecycleEdgeCase,
  type SubagentLifecycleEdgeEvidence,
  validateSubagentLifecycleEdgeEvidence,
} from "./subagentLifecycleEdgeEvidence";

describe("subagent lifecycle edge evidence", () => {
  it("builds lifecycle edge evidence for restart, stop, detach, cancel, retry, timeout, and partial results", async () => {
    const evidence = buildSubagentLifecycleEdgeEvidence(lifecycleEdgeEvidenceInput());

    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-lifecycle-edge-evidence-v1",
      source: "deterministic_fixture",
      liveTokens: false,
      featureFlagSnapshot: {
        ambientSubagentsEnabled: true,
        source: "test_override",
      },
      parent: {
        threadId: "parent-thread",
        runId: "parent-run",
      },
      summary: {
        requiredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"],
        coveredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"],
        missingEdgeKinds: [],
        unsafeEdgeIds: [],
        liveTokens: false,
      },
    });
    expect(evidence.edges).toHaveLength(7);
    expect(evidence.edges.map((edge) => edge.kind)).toEqual([
      "restart",
      "stop",
      "detach",
      "cancel",
      "retry",
      "timeout",
      "partial_result",
    ]);
    expect(validateSubagentLifecycleEdgeEvidence(evidence)).toEqual({ valid: true, issues: [] });
    expect(summarizeSubagentLifecycleEdgeEvidence(evidence)).toEqual(expect.arrayContaining([
      "coveredEdges: restart, stop, detach, cancel, retry, timeout, partial_result",
      "missingEdges: none",
      "unsafeEdges: none",
      "valid: true",
    ]));
    await writeSubagentLifecycleEdgeEvidenceArtifact(evidence);
  });

  it("rejects missing edge coverage and unsafe synthesis states", () => {
    const input = lifecycleEdgeEvidenceInput();
    const evidence = buildSubagentLifecycleEdgeEvidence(input);
    const unsafe = {
      ...evidence,
      edges: evidence.edges
        .filter((edge) => edge.kind !== "timeout")
        .map((edge) => edge.kind === "partial_result"
          ? {
              ...edge,
              synthesisSafety: {
                ...edge.synthesisSafety,
                parentDidNotSynthesizeUnsafeChild: false,
              },
            }
          : edge),
      summary: {
        ...evidence.summary,
        coveredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "partial_result"],
        missingEdgeKinds: ["timeout"],
        unsafeEdgeIds: ["edge-partial-result"],
      },
    };

    expect(validateSubagentLifecycleEdgeEvidence(unsafe).issues).toEqual(expect.arrayContaining([
      "Sub-agent lifecycle edge evidence is missing timeout.",
      "Sub-agent lifecycle edge edge-partial-result is missing synthesis-safety proof.",
      "Sub-agent lifecycle edge summary.coveredEdgeKinds is incomplete.",
      "Sub-agent lifecycle edge summary has missing edge kinds: timeout.",
      "Sub-agent lifecycle edge summary has unsafe edge ids: edge-partial-result.",
    ]));
  });

  it("rejects edge-specific contract gaps and secret-like evidence", () => {
    const evidence = buildSubagentLifecycleEdgeEvidence(lifecycleEdgeEvidenceInput());
    const broken = {
      ...evidence,
      edges: evidence.edges.map((edge) => {
        if (edge.kind !== "cancel") return edge;
        return {
          ...edge,
          label: "cancel edge GMI_CLOUD_API_KEY=sk-should-not-appear",
          cancel: {
            ...edge.cancel,
            cancellationCascadeRecorded: false,
            cancelledRunIds: [],
          },
        };
      }),
    };

    expect(validateSubagentLifecycleEdgeEvidence(broken).issues).toEqual(expect.arrayContaining([
      "Sub-agent lifecycle cancel edge edge-parent-cancel cancelledRunIds are missing.",
      "Sub-agent lifecycle cancel edge edge-parent-cancel must record the cancellation cascade.",
      "Sub-agent lifecycle edge evidence appears to contain secret-like material at $.edges[3].label.",
    ]));
  });
});

async function writeSubagentLifecycleEdgeEvidenceArtifact(
  evidence: SubagentLifecycleEdgeEvidence,
): Promise<void> {
  const outputPath = process.env.AMBIENT_SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_OUT;
  if (!outputPath) return;
  const resolved = resolve(outputPath);
  const artifact = { ...evidence, createdAt: new Date().toISOString() };
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

function lifecycleEdgeEvidenceInput() {
  return {
    createdAt: "2026-06-11T04:00:00.000Z",
    source: "deterministic_fixture" as const,
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
        restart: {
          interruptedRunIds: ["run-active"],
          diagnosticRunIds: ["run-active"],
          restartRepairObserved: true,
          nonResumableMarkedInterrupted: true,
        },
      }),
      lifecycleEdge({
        id: "edge-child-stop",
        kind: "stop",
        label: "Stopped child while sibling keeps running",
        parentBlockingStateBefore: "waiting_on_two_children",
        parentBlockingStateAfter: "needs_decision_after_stopped_child",
        childRunIds: ["run-stopped", "run-sibling"],
        childThreadIds: ["child-stopped", "child-sibling"],
        observedEventIds: ["cancel-event-stopped", "capacity-release-stopped"],
        stop: {
          stoppedRunIds: ["run-stopped"],
          siblingRunIdsUnaffected: ["run-sibling"],
          structuredCancellationResult: true,
          capacityReleased: true,
        },
      }),
      lifecycleEdge({
        id: "edge-detach",
        kind: "detach",
        label: "Detached child from parent wait",
        parentBlockingStateBefore: "waiting_on_detachable_child",
        parentBlockingStateAfter: "unblocked_detached_child_visible",
        childRunIds: ["run-detached"],
        childThreadIds: ["child-detached"],
        observedEventIds: ["mailbox-detach-decision", "mailbox-detach-cleanup"],
        detach: {
          detachedRunIds: ["run-detached"],
          detachedChildrenExcludedFromSynthesis: true,
          parentUnblockedAfterDecision: true,
          mailboxCleanupRecorded: true,
        },
      }),
      lifecycleEdge({
        id: "edge-parent-cancel",
        kind: "cancel",
        label: "Parent cancellation cascades to children",
        parentBlockingStateBefore: "waiting_on_children",
        parentBlockingStateAfter: "parent_cancelled_children_marked",
        childRunIds: ["run-cancel-a", "run-cancel-b"],
        childThreadIds: ["child-cancel-a", "child-cancel-b"],
        observedEventIds: ["parent-cancel-requested", "cancel-cascade-event"],
        cancel: {
          parentCancellationRequested: true,
          cancelledRunIds: ["run-cancel-a", "run-cancel-b"],
          cancellationCascadeRecorded: true,
          parentReturnedCancelledState: true,
        },
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
        observedEventIds: ["barrier-timeout-event", "mailbox-timeout-attention"],
        timeout: {
          barrierStatus: "timed_out",
          failurePolicy: "ask_user",
          allowedUserChoiceIds: ["wait_again", "cancel_parent", "continue_with_partial"],
          noTimedOutChildSynthesis: true,
        },
      }),
      lifecycleEdge({
        id: "edge-partial-result",
        kind: "partial_result",
        label: "User explicitly continues with partial result",
        parentBlockingStateBefore: "waiting_on_failed_child",
        parentBlockingStateAfter: "partial_result_synthesis_allowed",
        childRunIds: ["run-complete", "run-failed"],
        childThreadIds: ["child-complete", "child-failed"],
        observedEventIds: ["barrier-partial-decision", "partial-summary-artifact"],
        partialResult: {
          decision: "continue_with_partial",
          partialSummaryIncluded: true,
          omittedChildRunIds: ["run-failed"],
          failedChildNotSynthesized: true,
          parentMarkedPartial: true,
        },
      }),
    ],
  };
}

function lifecycleEdge(edge: Omit<SubagentLifecycleEdgeCase, "synthesisSafety">): SubagentLifecycleEdgeCase {
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
