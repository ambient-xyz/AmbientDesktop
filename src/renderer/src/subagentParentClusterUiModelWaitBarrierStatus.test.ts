import { describe, expect, it } from "vitest";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import { subagentParentClusterModelsByMessageId } from "./subagentParentClusterUiModel";
import {
  barrier,
  barrierChildToneForTest,
  callableWorkflowTask,
  parentMailboxEvent,
  run,
  thread,
} from "./subagentParentClusterUiModelTestSupport";

describe("subagent parent cluster UI model wait-barrier status", () => {
  it("surfaces unresolved required wait barriers on the parent cluster", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run()],
      [thread({ id: "child-1", title: "Required child", lastMessagePreview: "Reading repository context" })],
      [barrier()],
    );

    const cluster = clusters.get("message-1");
    expect(cluster).toMatchObject({
      summary: "1 child · 1 required · 1 waiting",
      status: "Waiting",
      statusTone: "active",
      barriers: [
        {
          id: "barrier-1",
          status: "Waiting on child",
          statusTone: "active",
          dependencyLabel: "Required all",
          childCountLabel: "1 child",
          blockingChildren: [
            {
              runId: "run-1",
              childThreadId: "child-1",
              title: "Required child",
              canonicalTaskPath: "root/0:summarizer",
              status: "Running",
              statusTone: "active",
              latestLabel: "Latest: Reading repository context",
              label: "Required child / root/0:summarizer / Running / Latest: Reading repository context",
              detail: "Required child / root/0:summarizer / Running / Latest: Reading repository context",
            },
          ],
          blockingChildLabels: ["Required child / root/0:summarizer / Running / Latest: Reading repository context"],
          failurePolicyLabel: "Ask user on failure",
          timeoutLabel: "30s timeout",
        },
      ],
    });
  });

  it("does not mark nonblocking callable-workflow bridge barriers as parent blockers", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ id: "run-1", status: "failed" })],
      [thread({ id: "child-1", title: "Background workflow child" })],
      [
        barrier({
          ownerKind: "callable_workflow_symphony_launch_bridge",
          ownerId: "callable-task-1",
        }),
      ],
      [],
      [callableWorkflowTask({ id: "callable-task-1", blocking: false })],
    );

    const cluster = clusters.get("message-1");
    expect(cluster?.parentBlocking).toBeUndefined();
    expect(cluster?.children[0]?.parentBlocker).toBeUndefined();
  });

  it("does not mark nonblocking callable-workflow bridge attention events as parent blockers", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ id: "run-1", status: "failed" })],
      [thread({ id: "child-1", title: "Background workflow child" })],
      [
        barrier({
          ownerKind: "callable_workflow_symphony_launch_bridge",
          ownerId: "callable-task-1",
          status: "timed_out",
        }),
      ],
      [
        parentMailboxEvent({
          type: "subagent.wait_barrier_attention",
          deliveryState: "queued",
          payload: {
            schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
            childRunId: "run-1",
            childThreadId: "child-1",
            waitBarrierId: "barrier-1",
            barrierStatus: "timed_out",
            dependencyMode: "required_all",
            parentResolution: {
              schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
              action: "ask_user",
              status: "blocked",
            },
            reason: "Background workflow bridge needs attention.",
          },
        }),
      ],
      [callableWorkflowTask({ id: "callable-task-1", blocking: false })],
    );

    const cluster = clusters.get("message-1");
    expect(cluster?.parentBlocking).toBeUndefined();
    expect(cluster?.children[0]?.parentBlocker).toBeUndefined();
  });

  it("marks approval-blocked required children with warning blocker indicators", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "needs_attention" })],
      [thread({ id: "child-1", title: "Workspace writer", lastMessagePreview: "Waiting for approval" })],
      [barrier()],
      [
        parentMailboxEvent({
          type: "subagent.child_approval_requested",
          deliveryState: "queued",
          payload: {
            schemaVersion: "ambient-subagent-approval-bridge-v1",
            childRunId: "run-1",
            childThreadId: "child-1",
            canonicalTaskPath: "root/0:summarizer",
            approvalId: "approval-worker-write",
            title: "Allow workspace write",
            prompt: "Child wants to edit files in an isolated worktree.",
            requestedToolCategory: "workspace.write",
            effectiveScope: "this_child_thread",
          },
        }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "1 child · 1 required · 1 attention · 1 approval blocked · 1 waiting",
      status: "Approval needed",
      statusTone: "warning",
      parentBlocking: {
        label: "Parent blocked on 1 child: approval needed",
        detail: "1 approval request / Workspace writer",
        statusTone: "warning",
        blockingChildren: [
          {
            runId: "run-1",
            childThreadId: "child-1",
            title: "Workspace writer",
            label: "Workspace writer: approval",
            detail:
              "Allow workspace write / workspace.write / This child thread / Child wants to edit files in an isolated worktree. / Child: Workspace writer / Path: root/0:summarizer / Status: Needs attention / Elapsed: <1s / Latest: Waiting for approval",
            statusTone: "warning",
            kind: "approval",
          },
        ],
      },
      children: [
        {
          runId: "run-1",
          status: "Needs attention",
          statusTone: "warning",
          parentBlocker: {
            kind: "approval",
            label: "Blocking: approval",
            statusTone: "warning",
            detail: "Allow workspace write / workspace.write / This child thread / Child wants to edit files in an isolated worktree.",
            metaLabels: [
              "Child: Workspace writer",
              "Path: root/0:summarizer",
              "Status: Needs attention",
              "Elapsed: <1s",
              "Latest: Waiting for approval",
            ],
          },
        },
      ],
      mailboxActivities: [
        {
          label: "Approval requested",
          statusTone: "active",
          summary: "Allow workspace write / workspace.write / This child thread",
          approvalActions: [
            {
              label: "Approve child",
              title:
                "Approve child approval approval-worker-write: Allow workspace write / Child source: root/0:summarizer / run run-1 / thread child-1",
              decision: "approved",
              childRunId: "run-1",
              childThreadId: "child-1",
              approvalId: "approval-worker-write",
              approvalRequestParentMailboxEventId: "parent-mailbox-1",
              effectiveScope: "this_child_thread",
              prompt: "Child wants to edit files in an isolated worktree.",
              toolLabel: "workspace.write",
              sourceLabel: "Child source: root/0:summarizer / run run-1 / thread child-1",
            },
            {
              label: "Deny child",
              title:
                "Deny child approval approval-worker-write: Allow workspace write / Child source: root/0:summarizer / run run-1 / thread child-1",
              decision: "denied",
              childRunId: "run-1",
              childThreadId: "child-1",
              approvalId: "approval-worker-write",
              approvalRequestParentMailboxEventId: "parent-mailbox-1",
              effectiveScope: "this_child_thread",
              prompt: "Child wants to edit files in an isolated worktree.",
              toolLabel: "workspace.write",
              sourceLabel: "Child source: root/0:summarizer / run run-1 / thread child-1",
            },
          ],
        },
      ],
    });
  });

  it("keeps child-thread scope visible when the current approval is action-scoped", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "needs_attention" })],
      [thread({ id: "child-1", title: "Workspace writer", lastMessagePreview: "Waiting for approval" })],
      [barrier()],
      [
        parentMailboxEvent({
          type: "subagent.child_approval_requested",
          deliveryState: "queued",
          payload: {
            schemaVersion: "ambient-subagent-approval-bridge-v1",
            childRunId: "run-1",
            childThreadId: "child-1",
            canonicalTaskPath: "root/0:summarizer",
            approvalId: "approval-worker-write",
            title: "Allow workspace write",
            prompt: "Child wants to edit files in an isolated worktree.",
            requestedToolCategory: "workspace.write",
            requestedScope: "this_action",
            effectiveScope: "this_action",
          },
        }),
      ],
    );

    const cluster = clusters.get("message-1");
    const blocker = cluster?.children[0]?.parentBlocker;
    expect(blocker?.detail).toContain("This action");
    expect(blocker?.metaLabels).toContain("Scope option: This child thread");
    expect(cluster?.parentBlocking?.blockingChildren[0]?.detail).toContain("Scope option: This child thread");
    expect(cluster?.mailboxActivities[0]?.summary).toBe("Allow workspace write / workspace.write / This action");
  });

  it("returns approved children to ordinary wait-barrier blocking indicators", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "running" })],
      [thread({ id: "child-1", title: "Workspace writer", lastMessagePreview: "Resuming after approval" })],
      [barrier()],
      [
        parentMailboxEvent({
          id: "approval-request",
          updatedAt: "2026-06-05T00:00:10.000Z",
          type: "subagent.child_approval_requested",
          deliveryState: "consumed",
          payload: {
            schemaVersion: "ambient-subagent-approval-bridge-v1",
            childRunId: "run-1",
            childThreadId: "child-1",
            canonicalTaskPath: "root/0:summarizer",
            approvalId: "approval-worker-write",
            title: "Allow workspace write",
            requestedToolCategory: "workspace.write",
            effectiveScope: "this_child_thread",
          },
        }),
        parentMailboxEvent({
          id: "approval-forwarded",
          updatedAt: "2026-06-05T00:00:11.000Z",
          type: "subagent.child_approval_forwarded",
          deliveryState: "delivered",
          payload: {
            schemaVersion: "ambient-subagent-approval-bridge-v1",
            childRunId: "run-1",
            childThreadId: "child-1",
            canonicalTaskPath: "root/0:summarizer",
            approvalId: "approval-worker-write",
            decision: "approved",
            effectiveScope: "this_child_thread",
          },
        }),
      ],
    );

    const cluster = clusters.get("message-1");
    expect(cluster).toMatchObject({
      summary: "1 child · 1 required · 1 waiting",
      status: "Waiting",
      statusTone: "active",
      parentBlocking: {
        label: "Parent waiting on 1 child",
        detail: "1 active child / Workspace writer",
        statusTone: "active",
        blockingChildren: [
          expect.objectContaining({
            runId: "run-1",
            label: "Workspace writer: child running",
            kind: "wait_barrier",
          }),
        ],
      },
      children: [
        {
          runId: "run-1",
          status: "Running",
          statusTone: "active",
          parentBlocker: {
            kind: "wait_barrier",
            label: "Blocking: child running",
            statusTone: "active",
            detail: "Waiting on child / Required all / Ask user on failure / 30s timeout",
          },
        },
      ],
    });
    expect(cluster?.mailboxActivities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "approval-forwarded",
          label: "Approval forwarded",
          statusTone: "success",
        }),
      ]),
    );
    expect(cluster?.mailboxActivities.find((activity) => activity.id === "approval-request")?.approvalActions).toBeUndefined();
  });

  it("surfaces queued child supervisor requests as parent-blocking attention", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "needs_attention" })],
      [thread({ id: "child-1", title: "Source chooser", lastMessagePreview: "Waiting for source choice" })],
      [barrier()],
      [
        parentMailboxEvent({
          type: "subagent.child_supervisor_request",
          deliveryState: "queued",
          payload: {
            schemaVersion: "ambient-subagent-supervisor-request-v1",
            childRunId: "run-1",
            childThreadId: "child-1",
            canonicalTaskPath: "root/0:summarizer",
            roleId: "summarizer",
            kind: "need_decision",
            title: "Choose source strategy",
            messagePreview: "The child can continue with docs only or inspect source before summarizing.",
            severity: "warning",
            parentRequiresAttention: true,
            marksChildComplete: false,
            requestedChoices: [
              { id: "docs-only", label: "Docs only", description: "Use the existing docs corpus." },
              { id: "inspect-source", label: "Inspect source", description: "Read code before synthesizing." },
            ],
          },
        }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "1 child · 1 required · 1 attention · 1 waiting · 1 supervisor request",
      status: "Needs attention",
      statusTone: "warning",
      children: [
        {
          runId: "run-1",
          parentBlocker: {
            kind: "attention",
            label: "Blocking: needs decision",
            statusTone: "warning",
            detail: "Needs decision / Choose source strategy / The child can continue with docs only or inspect source before summarizing.",
            metaLabels: [
              "Child: Source chooser",
              "Path: root/0:summarizer",
              "Status: Needs attention",
              "Elapsed: <1s",
              "Latest: Waiting for source choice",
            ],
          },
        },
      ],
      mailboxActivities: [
        {
          label: "Supervisor request",
          sourceLabel: "Child source: root/0:summarizer / run run-1 / thread child-1",
          statusTone: "warning",
          summary: "Choose source strategy / 2 choices",
          detail: "The child can continue with docs only or inspect source before summarizing. | Choices: Docs only, Inspect source",
          actionLabels: ["Docs only", "Inspect source"],
        },
      ],
    });
  });

  it("surfaces child supervisor progress updates without parent-blocking actions", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "running" })],
      [thread({ id: "child-1", title: "Explorer", lastMessagePreview: "Indexing files" })],
      [],
      [
        parentMailboxEvent({
          type: "subagent.child_supervisor_request",
          deliveryState: "delivered",
          payload: {
            schemaVersion: "ambient-subagent-supervisor-request-v1",
            childRunId: "run-1",
            childThreadId: "child-1",
            canonicalTaskPath: "root/0:explorer",
            roleId: "explorer",
            kind: "progress_update",
            title: "Repository indexed",
            messagePreview: "The child has indexed the repository and is moving to synthesis.",
            progressLabel: "2/3 stages",
            severity: "info",
            parentRequiresAttention: false,
            marksChildComplete: false,
          },
        }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "1 child · 1 required",
      status: "Running",
      statusTone: "active",
      children: [
        {
          runId: "run-1",
        },
      ],
      mailboxActivities: [
        {
          label: "Child progress",
          statusTone: "neutral",
          summary: "Repository indexed / 2/3 stages",
          detail: "The child has indexed the repository and is moving to synthesis.",
        },
      ],
    });
    expect(clusters.get("message-1")?.children[0]?.parentBlocker).toBeUndefined();
  });

  it("marks active required children in waiting barriers with status-specific blockers", () => {
    const activeStatuses: Array<[SubagentRunSummary["status"], string, string]> = [
      ["reserved", "Reserved", "Blocking: child queued"],
      ["starting", "Starting", "Blocking: child starting"],
      ["running", "Running", "Blocking: child running"],
      ["waiting", "Waiting", "Blocking: child waiting"],
    ];
    const clusters = subagentParentClusterModelsByMessageId(
      activeStatuses.map(([status], index) =>
        run({
          id: `run-${status}`,
          childThreadId: `child-${status}`,
          canonicalTaskPath: `root/${index}:${status}`,
          status,
          updatedAt: "2026-06-05T00:01:30.000Z",
        }),
      ),
      activeStatuses.map(([status], index) =>
        thread({
          id: `child-${status}`,
          title: `${status} child`,
          lastMessagePreview: `${status} activity`,
          childOrder: index + 1,
        }),
      ),
      [barrier({ childRunIds: activeStatuses.map(([status]) => `run-${status}`) })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Waiting",
      statusTone: "active",
      barriers: [
        {
          blockingChildren: activeStatuses.map(([status, statusLabel], index) => ({
            runId: `run-${status}`,
            childThreadId: `child-${status}`,
            title: `${status} child`,
            canonicalTaskPath: `root/${index}:${status}`,
            status: statusLabel,
            statusTone: barrierChildToneForTest(status),
            latestLabel: `Latest: ${status} activity`,
            label: `${status} child / root/${index}:${status} / ${statusLabel} / Latest: ${status} activity`,
            detail: `${status} child / root/${index}:${status} / ${statusLabel} / Latest: ${status} activity`,
          })),
          blockingChildLabels: activeStatuses.map(
            ([status, statusLabel]) =>
              `${status} child / root/${activeStatuses.findIndex(([candidate]) => candidate === status)}:${status} / ${statusLabel} / Latest: ${status} activity`,
          ),
        },
      ],
      children: activeStatuses.map(([status, statusLabel, blockerLabel]) => ({
        runId: `run-${status}`,
        status: statusLabel,
        parentBlocker: {
          kind: "wait_barrier",
          label: blockerLabel,
          statusTone: "active",
          detail: "Waiting on child / Required all / Ask user on failure / 30s timeout",
          metaLabels: [
            `Child: ${status} child`,
            `Path: root/${activeStatuses.findIndex(([candidate]) => candidate === status)}:${status}`,
            `Status: ${statusLabel}`,
            "Elapsed: 1m 30s",
            `Latest: ${status} activity`,
          ],
        },
      })),
    });
  });

  it("marks terminal unsafe children in waiting barriers with status-specific blockers", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [
        run({ id: "run-failed", childThreadId: "child-failed", status: "failed" }),
        run({ id: "run-timeout", childThreadId: "child-timeout", status: "timed_out" }),
        run({ id: "run-cancelled", childThreadId: "child-cancelled", status: "cancelled" }),
      ],
      [
        thread({ id: "child-failed", title: "Failed child", childOrder: 1 }),
        thread({ id: "child-timeout", title: "Timed-out child", childOrder: 2 }),
        thread({ id: "child-cancelled", title: "Cancelled child", childOrder: 3 }),
      ],
      [barrier({ childRunIds: ["run-failed", "run-timeout", "run-cancelled"] })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Needs attention",
      statusTone: "danger",
      children: [
        {
          runId: "run-failed",
          status: "Failed",
          statusTone: "danger",
          parentBlocker: {
            kind: "attention",
            label: "Blocking: child failed",
            statusTone: "danger",
            detail: "Failed / Required all / Ask user on failure / 30s timeout",
          },
        },
        {
          runId: "run-timeout",
          status: "Timed Out",
          statusTone: "warning",
          parentBlocker: {
            kind: "attention",
            label: "Blocking: child timed out",
            statusTone: "warning",
            detail: "Timed Out / Required all / Ask user on failure / 30s timeout",
          },
        },
        {
          runId: "run-cancelled",
          status: "Cancelled",
          statusTone: "danger",
          parentBlocker: {
            kind: "attention",
            label: "Blocking: child cancelled",
            statusTone: "danger",
            detail: "Cancelled / Required all / Ask user on failure / 30s timeout",
          },
        },
      ],
    });
  });

  it("marks completed children in waiting barriers as ready while siblings still block", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [
        run({ id: "run-completed", childThreadId: "child-completed", status: "completed" }),
        run({ id: "run-running", childThreadId: "child-running", status: "running" }),
      ],
      [
        thread({ id: "child-completed", title: "Completed child", childOrder: 1 }),
        thread({ id: "child-running", title: "Running child", childOrder: 2 }),
      ],
      [barrier({ childRunIds: ["run-completed", "run-running"] })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Waiting",
      statusTone: "active",
      children: [
        {
          runId: "run-completed",
          status: "Completed",
          statusTone: "success",
          parentBlocker: {
            kind: "wait_barrier",
            label: "Ready: child complete",
            statusTone: "success",
            detail: "Completed / Required all / Ask user on failure / 30s timeout",
          },
        },
        {
          runId: "run-running",
          status: "Running",
          statusTone: "active",
          parentBlocker: {
            kind: "wait_barrier",
            label: "Blocking: child running",
            statusTone: "active",
            detail: "Waiting on child / Required all / Ask user on failure / 30s timeout",
          },
        },
      ],
    });
  });

  it("prioritizes failed wait barriers as attention states", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "completed" })],
      [thread({ id: "child-1" })],
      [barrier({ status: "failed", resolvedAt: "2026-06-05T00:01:00.000Z" })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Needs attention",
      statusTone: "danger",
      barriers: [{ status: "Failed", statusTone: "danger" }],
    });
  });

  it("surfaces quorum thresholds on collapsed parent barriers", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [
        run({ id: "run-1", childThreadId: "child-1", status: "completed" }),
        run({ id: "run-2", childThreadId: "child-2", status: "completed" }),
        run({ id: "run-3", childThreadId: "child-3", status: "running" }),
      ],
      [thread({ id: "child-1" }), thread({ id: "child-2" }), thread({ id: "child-3" })],
      [
        barrier({
          childRunIds: ["run-1", "run-2", "run-3"],
          dependencyMode: "quorum",
          quorumThreshold: 2,
          status: "satisfied",
        }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      barriers: [
        {
          status: "Satisfied",
          dependencyLabel: "Quorum",
          childCountLabel: "3 children · quorum 2",
        },
      ],
    });
  });
});
