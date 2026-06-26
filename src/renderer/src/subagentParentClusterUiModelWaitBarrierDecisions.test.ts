import { describe, expect, it } from "vitest";
import { subagentParentClusterModelsByMessageId } from "./subagentParentClusterUiModel";
import { barrier, barrierDecisionArtifact, run, thread } from "./subagentParentClusterUiModelTestSupport";

describe("subagent parent cluster UI model wait-barrier decisions", () => {
  it("surfaces explicit wait-barrier decisions on the parent cluster", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "completed" })],
      [thread({ id: "child-1" })],
      [
        barrier({
          status: "satisfied",
          resolvedAt: "2026-06-05T00:01:00.000Z",
          resolutionArtifact: barrierDecisionArtifact({
            decision: "continue_with_partial",
            userDecision: "Proceed with the completed evidence.",
            partialSummary: "Use the completed child summary and mark missing work as unavailable.",
          }),
        }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      barriers: [
        {
          status: "Satisfied",
          statusTone: "success",
          decisionLabel: "Partial approved",
          decisionSummary: "Use the completed child summary and mark missing work as unavailable.",
        },
      ],
    });
  });

  it("surfaces retry wait-barrier decisions as active parent-blocking lifecycle effects", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "running", updatedAt: "2026-06-05T00:01:30.000Z" })],
      [thread({ id: "child-1" })],
      [
        barrier({
          status: "waiting_on_children",
          resolutionArtifact: barrierDecisionArtifact({
            decision: "retry_child",
            userDecision: "Retry this child before parent synthesis.",
            retryRequestedRunIds: ["run-1"],
            retryAcceptedRunIds: ["run-1"],
            retryMailboxEventIds: ["mailbox-retry"],
          }),
        }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Waiting",
      barriers: [
        {
          status: "Waiting on child",
          statusTone: "active",
          decisionLabel: "Retry accepted",
          decisionSummary: "Retry this child before parent synthesis.",
          effectRows: [
            {
              key: "retry-requested-runs",
              label: "Retry requested 1 child",
              detail: "Runs: run-1",
              statusTone: "active",
            },
            {
              key: "retry-accepted-runs",
              label: "Retry accepted 1 child",
              detail: "Runs: run-1",
              statusTone: "active",
            },
            {
              key: "retry-mailbox-events",
              label: "1 retry mailbox event queued",
              detail: "Mailbox events: mailbox-retry",
              statusTone: "active",
            },
          ],
        },
      ],
      children: [
        {
          parentBlocker: {
            label: "Blocking: child running",
            statusTone: "active",
          },
        },
      ],
    });
  });

  it("keeps queued-only retry decisions distinguishable from runtime-accepted retries", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "failed" })],
      [thread({ id: "child-1" })],
      [
        barrier({
          status: "waiting_on_children",
          resolutionArtifact: barrierDecisionArtifact({
            decision: "retry_child",
            retryRequestedRunIds: ["run-1"],
            retryMailboxEventIds: ["mailbox-retry"],
          }),
        }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Needs attention",
      barriers: [
        {
          decisionLabel: "Retry requested",
          decisionSummary: "Retry requested 1 child / 1 retry mailbox event queued",
          effectRows: [
            {
              key: "retry-requested-runs",
              label: "Retry requested 1 child",
              detail: "Runs: run-1",
              statusTone: "active",
            },
            {
              key: "retry-mailbox-events",
              label: "1 retry mailbox event queued",
              detail: "Mailbox events: mailbox-retry",
              statusTone: "active",
            },
          ],
        },
      ],
    });
  });

  it("surfaces persisted detach and parent-cancel wait-barrier decisions on collapsed barriers", () => {
    const detachClusters = subagentParentClusterModelsByMessageId(
      [run({ status: "detached" })],
      [thread({ id: "child-1" })],
      [
        barrier({
          status: "failed",
          resolvedAt: "2026-06-05T00:01:00.000Z",
          resolutionArtifact: barrierDecisionArtifact({
            decision: "detach_child",
            detachedRunIds: ["run-1"],
          }),
        }),
      ],
    );

    expect(detachClusters.get("message-1")).toMatchObject({
      barriers: [
        {
          status: "Failed",
          statusTone: "danger",
          decisionLabel: "Child detached",
          decisionSummary: "Detached 1 child",
          effectRows: [
            {
              key: "detached-runs",
              label: "Detached 1 child",
              detail: "Runs: run-1",
              statusTone: "warning",
            },
          ],
        },
      ],
    });

    const cancelClusters = subagentParentClusterModelsByMessageId(
      [run({ status: "cancelled" })],
      [thread({ id: "child-1" })],
      [
        barrier({
          status: "cancelled",
          resolvedAt: "2026-06-05T00:01:00.000Z",
          resolutionArtifact: barrierDecisionArtifact({
            decision: "cancel_parent",
            cancelledRunIds: ["run-1"],
            unchangedRunIds: ["done-child"],
            cancelledWaitBarrierIds: ["barrier-2"],
            cancelledMailboxEventIds: ["mailbox-1"],
            parentCancellationRequested: true,
          }),
        }),
      ],
    );

    expect(cancelClusters.get("message-1")).toMatchObject({
      barriers: [
        {
          status: "Cancelled",
          statusTone: "warning",
          decisionLabel: "Parent cancelled",
          decisionSummary:
            "Cancelled 1 child / Unchanged 1 child / 1 wait barrier cancelled / Parent cancellation requested / 1 pending mailbox event cancelled",
          effectRows: [
            {
              key: "cancelled-runs",
              label: "Cancelled 1 child",
              detail: "Runs: run-1",
              statusTone: "danger",
            },
            {
              key: "unchanged-runs",
              label: "Unchanged 1 child",
              detail: "Runs: done-child",
              statusTone: "neutral",
            },
            {
              key: "cancelled-wait-barriers",
              label: "1 wait barrier cancelled",
              detail: "Wait barriers: barrier-2",
              statusTone: "warning",
            },
            {
              key: "parent-cancellation-requested",
              label: "Parent cancellation requested",
              detail: "Parent run cancellation was requested by the barrier decision.",
              statusTone: "danger",
            },
            {
              key: "cancelled-mailbox-events",
              label: "1 pending mailbox event cancelled",
              detail: "Mailbox events: mailbox-1",
              statusTone: "warning",
            },
          ],
        },
      ],
    });
  });
});
