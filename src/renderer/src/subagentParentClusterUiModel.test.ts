import { describe, expect, it } from "vitest";
import type { AmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { buildPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import type { SubagentParentMailboxEventSummary, SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import { CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON } from "../../shared/callableWorkflowTaskGuards";
import { subagentParentClusterModelsByMessageId } from "./subagentParentClusterUiModel";

describe("subagent parent cluster UI model", () => {
  it("groups child runs by parent message and sorts by child order", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [
        run({ id: "run-2", childThreadId: "child-2", roleId: "reviewer", dependencyMode: "optional_background" }),
        run({ id: "run-1", childThreadId: "child-1", roleId: "summarizer" }),
      ],
      [
        thread({ id: "child-2", title: "Review branch", childOrder: 2, lastMessagePreview: "Reviewing..." }),
        thread({ id: "child-1", title: "Summarize plan", childOrder: 1, lastMessagePreview: "Reading plan" }),
      ],
    );

    const cluster = clusters.get("message-1");
    expect(cluster).toMatchObject({
      title: "Sub-agent threads",
      summary: "2 children · 1 required · 1 background",
      status: "Running",
      statusTone: "active",
      children: [
        {
          runId: "run-1",
          childThreadId: "child-1",
          title: "Summarize plan",
          status: "Running",
          dependencyLabel: "Required",
          runtimeLabel: "Local",
          preview: "Reading plan",
          canCancel: true,
          cancelTitle: "Cancel sub-agent root/0:summarizer",
          canClose: false,
        },
        {
          runId: "run-2",
          childThreadId: "child-2",
          title: "Review branch",
          dependencyLabel: "Background",
        },
      ],
    });
  });

  it("marks completed and attention children closeable while preserving closed labels", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [
        run({ id: "run-complete", childThreadId: "child-complete", status: "completed", canonicalTaskPath: "root/complete:reviewer" }),
        run({ id: "run-attention", childThreadId: "child-attention", status: "needs_attention", canonicalTaskPath: "root/attention:worker" }),
        run({
          id: "run-closed",
          childThreadId: "child-closed",
          status: "completed",
          canonicalTaskPath: "root/closed:summary",
          closedAt: "2026-06-05T00:03:00.000Z",
        }),
      ],
      [
        thread({ id: "child-complete", title: "Complete child", childOrder: 1 }),
        thread({ id: "child-attention", title: "Needs steering", childOrder: 2 }),
        thread({ id: "child-closed", title: "Closed child", childOrder: 3 }),
      ],
    );

    expect(clusters.get("message-1")?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: "run-complete",
          canCancel: false,
          canClose: true,
          closeTitle: "Close sub-agent root/complete:reviewer; transcript and artifacts are retained",
        }),
        expect.objectContaining({
          runId: "run-attention",
          canCancel: true,
          canClose: true,
          closeTitle: "Close sub-agent root/attention:worker; transcript and artifacts are retained",
        }),
        expect.objectContaining({
          runId: "run-closed",
          canCancel: false,
          canClose: false,
          closedLabel: "Closed",
        }),
      ]),
    );
  });

  it("surfaces summary-retained children without open or control affordances", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [
        run({
          id: "run-archived",
          childThreadId: "child-archived",
          status: "completed",
          closedAt: "2026-06-05T00:02:00.000Z",
          canonicalTaskPath: "root/archived:summarizer",
          resultArtifact: {
            summary: "Archived child retained a compact result summary.",
          },
        }),
        run({
          id: "run-summary-only",
          childThreadId: "child-summary-only",
          status: "completed",
          closedAt: "2026-06-05T00:03:00.000Z",
          canonicalTaskPath: "root/summary-only:reviewer",
          resultArtifact: {
            summary: "Summary-only child kept artifact metadata.",
          },
        }),
        run({
          id: "run-live",
          childThreadId: "child-live",
          status: "completed",
          canonicalTaskPath: "root/live:reviewer",
        }),
      ],
      [
        thread({
          id: "child-archived",
          title: "Archived child",
          childOrder: 1,
          archivedAt: "2026-06-05T00:10:00.000Z",
        }),
        thread({ id: "child-live", title: "Live child", childOrder: 3 }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "3 children · 3 required · 2 retained",
      children: expect.arrayContaining([
        expect.objectContaining({
          runId: "run-archived",
          canOpenThread: false,
          openThreadTitle: "Sub-agent root/archived:summarizer transcript was collapsed by retention; summary metadata remains.",
          canCancel: false,
          canClose: false,
          retentionLabel: "Summary retained",
          retentionTitle: "Sub-agent root/archived:summarizer transcript was collapsed by retention; result metadata and artifacts remain available.",
        }),
        expect.objectContaining({
          runId: "run-summary-only",
          canOpenThread: false,
          title: "Summarizer sub-agent",
          preview: "Summary-only child kept artifact metadata.",
          canCancel: false,
          canClose: false,
          retentionLabel: "Summary retained",
        }),
        expect.objectContaining({
          runId: "run-live",
          canOpenThread: true,
          openThreadTitle: "Open sub-agent root/live:reviewer",
          canClose: true,
        }),
      ]),
    });
  });

  it("omits runs that cannot be anchored under a parent message", () => {
    const clusters = subagentParentClusterModelsByMessageId([run({ parentMessageId: undefined })], []);

    expect(clusters.size).toBe(0);
  });

  it("surfaces failed children as needs-attention clusters", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "failed" })],
      [thread({ id: "child-1", title: "Broken child" })],
    );

    const cluster = clusters.get("message-1");
    expect(cluster).toMatchObject({
      status: "Needs attention",
      statusTone: "danger",
      children: [{ status: "Failed", statusTone: "danger" }],
    });
  });

  it("surfaces child supervisor requests as needs-attention clusters without marking them failed", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "needs_attention" })],
      [thread({ id: "child-1", title: "Blocked child" })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "1 child · 1 required · 1 attention",
      status: "Needs attention",
      statusTone: "warning",
      children: [{ status: "Needs attention", statusTone: "warning" }],
    });
  });

  it("labels supervisor-attention children separately from background work", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ dependencyMode: "supervisor_attention" })],
      [thread({ id: "child-1" })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "1 child · 1 attention",
      children: [{ dependencyLabel: "Needs attention" }],
    });
  });

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
          blockingChildLabels: [
            "Required child / root/0:summarizer / Running / Latest: Reading repository context",
          ],
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
      [barrier({
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: "callable-task-1",
      })],
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
      [barrier({
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: "callable-task-1",
        status: "timed_out",
      })],
      [parentMailboxEvent({
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
      })],
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
      [parentMailboxEvent({
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
      })],
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
            detail: "Allow workspace write / workspace.write / This child thread / Child wants to edit files in an isolated worktree. / Child: Workspace writer / Path: root/0:summarizer / Status: Needs attention / Elapsed: <1s / Latest: Waiting for approval",
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
              title: "Approve child approval approval-worker-write: Allow workspace write / Child source: root/0:summarizer / run run-1 / thread child-1",
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
              title: "Deny child approval approval-worker-write: Allow workspace write / Child source: root/0:summarizer / run run-1 / thread child-1",
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
      [parentMailboxEvent({
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
      })],
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
    expect(cluster?.mailboxActivities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "approval-forwarded",
        label: "Approval forwarded",
        statusTone: "success",
      }),
    ]));
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
      activeStatuses.map(([status], index) => run({
        id: `run-${status}`,
        childThreadId: `child-${status}`,
        canonicalTaskPath: `root/${index}:${status}`,
        status,
        updatedAt: "2026-06-05T00:01:30.000Z",
      })),
      activeStatuses.map(([status], index) => thread({
        id: `child-${status}`,
        title: `${status} child`,
        lastMessagePreview: `${status} activity`,
        childOrder: index + 1,
      })),
      [barrier({ childRunIds: activeStatuses.map(([status]) => `run-${status}`) })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Waiting",
      statusTone: "active",
      barriers: [{
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
        blockingChildLabels: activeStatuses.map(([status, statusLabel]) =>
          `${status} child / root/${activeStatuses.findIndex(([candidate]) => candidate === status)}:${status} / ${statusLabel} / Latest: ${status} activity`
        ),
      }],
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
      [
        thread({ id: "child-1" }),
        thread({ id: "child-2" }),
        thread({ id: "child-3" }),
      ],
      [barrier({
        childRunIds: ["run-1", "run-2", "run-3"],
        dependencyMode: "quorum",
        quorumThreshold: 2,
        status: "satisfied",
      })],
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

  it("surfaces explicit wait-barrier decisions on the parent cluster", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "completed" })],
      [thread({ id: "child-1" })],
      [barrier({
        status: "satisfied",
        resolvedAt: "2026-06-05T00:01:00.000Z",
        resolutionArtifact: barrierDecisionArtifact({
          decision: "continue_with_partial",
          userDecision: "Proceed with the completed evidence.",
          partialSummary: "Use the completed child summary and mark missing work as unavailable.",
        }),
      })],
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
      [barrier({
        status: "waiting_on_children",
        resolutionArtifact: barrierDecisionArtifact({
          decision: "retry_child",
          userDecision: "Retry this child before parent synthesis.",
          retryRequestedRunIds: ["run-1"],
          retryAcceptedRunIds: ["run-1"],
          retryMailboxEventIds: ["mailbox-retry"],
        }),
      })],
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
      [barrier({
        status: "waiting_on_children",
        resolutionArtifact: barrierDecisionArtifact({
          decision: "retry_child",
          retryRequestedRunIds: ["run-1"],
          retryMailboxEventIds: ["mailbox-retry"],
        }),
      })],
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
      [barrier({
        status: "failed",
        resolvedAt: "2026-06-05T00:01:00.000Z",
        resolutionArtifact: barrierDecisionArtifact({
          decision: "detach_child",
          detachedRunIds: ["run-1"],
        }),
      })],
    );

    expect(detachClusters.get("message-1")).toMatchObject({
      barriers: [
        {
          status: "Failed",
          statusTone: "danger",
          decisionLabel: "Child detached",
          decisionSummary: "Detached 1 child",
          effectRows: [{
            key: "detached-runs",
            label: "Detached 1 child",
            detail: "Runs: run-1",
            statusTone: "warning",
          }],
        },
      ],
    });

    const cancelClusters = subagentParentClusterModelsByMessageId(
      [run({ status: "cancelled" })],
      [thread({ id: "child-1" })],
      [barrier({
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
      })],
    );

    expect(cancelClusters.get("message-1")).toMatchObject({
      barriers: [
        {
          status: "Cancelled",
          statusTone: "warning",
          decisionLabel: "Parent cancelled",
          decisionSummary: "Cancelled 1 child / Unchanged 1 child / 1 wait barrier cancelled / Parent cancellation requested / 1 pending mailbox event cancelled",
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

  it("surfaces wait-barrier attention from parent mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        type: "subagent.wait_barrier_attention",
        payload: {
          schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
          childRunId: "run-1",
          childThreadId: "child-1",
          canonicalTaskPath: "root/0:summarizer",
          waitBarrierId: "barrier-1",
          dependencyMode: "required_all",
          barrierStatus: "timed_out",
          failurePolicy: "degrade_partial",
          reason: "Child wait timed out before producing a synthesis-safe result.",
          parentResolution: {
            schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
            action: "ask_user",
            status: "blocked",
          },
          allowedUserChoices: [
            { id: "continue_with_partial", label: "Continue with partial", toolAction: "resolve_barrier", decision: "continue_with_partial" },
            { id: "retry_child", label: "Retry child", toolAction: "resolve_barrier", decision: "retry_child" },
            { id: "detach_child", label: "Detach child", toolAction: "resolve_barrier", decision: "detach_child" },
            { id: "cancel_parent", label: "Cancel parent run", toolAction: "resolve_barrier", decision: "cancel_parent" },
          ],
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Partial",
      statusTone: "warning",
      mailboxActivities: [
        {
          label: "Barrier attention",
          sourceLabel: "Child source: root/0:summarizer / run run-1 / thread child-1",
          statusTone: "warning",
          summary: "Ask user / Timed Out / Required all",
          actionLabels: [
            "Continue with partial",
            "Retry child",
            "Detach child",
            "Cancel parent run",
          ],
          actions: [
            {
              label: "Continue with partial",
              title: "Continue with partial: resolve wait barrier barrier-1 with Partial approved",
              waitBarrierId: "barrier-1",
              decision: "continue_with_partial",
              requiresUserDecision: true,
              requiresPartialSummary: true,
              childRunIds: ["run-1"],
              sourceLabel: "Child source: root/0:summarizer / run run-1 / thread child-1",
            },
            {
              label: "Retry child",
              title: "Retry child: resolve wait barrier barrier-1 with Retry requested",
              waitBarrierId: "barrier-1",
              decision: "retry_child",
              requiresUserDecision: false,
              requiresPartialSummary: false,
              childRunIds: ["run-1"],
              sourceLabel: "Child source: root/0:summarizer / run run-1 / thread child-1",
            },
            {
              label: "Detach child",
              title: "Detach child: resolve wait barrier barrier-1 with Child detached",
              waitBarrierId: "barrier-1",
              decision: "detach_child",
              requiresUserDecision: true,
              requiresPartialSummary: false,
              childRunIds: ["run-1"],
              sourceLabel: "Child source: root/0:summarizer / run run-1 / thread child-1",
            },
            {
              label: "Cancel parent run",
              title: "Cancel parent run: resolve wait barrier barrier-1 with Parent cancelled",
              waitBarrierId: "barrier-1",
              decision: "cancel_parent",
              requiresUserDecision: true,
              requiresPartialSummary: false,
              childRunIds: ["run-1"],
              sourceLabel: "Child source: root/0:summarizer / run run-1 / thread child-1",
            },
          ],
          detail: "Child wait timed out before producing a synthesis-safe result. | Choices: Continue with partial, Retry child, Detach child, Cancel parent run",
        },
      ],
    });
  });

  it("surfaces Symphony decision request labels on wait-barrier attention cards", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        type: "subagent.wait_barrier_attention",
        payload: {
          schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
          childRunId: "run-1",
          childThreadId: "child-1",
          canonicalTaskPath: "root/0:researcher",
          waitBarrierId: "barrier-1",
          dependencyMode: "required_all",
          barrierStatus: "failed",
          failurePolicy: "degrade_partial",
          reason: "Child needs a scope decision before retry.",
          parentResolution: {
            schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
            action: "ask_user",
            status: "blocked",
          },
          childDecisionRequest: {
            schemaVersion: "ambient-symphony-child-decision-request-v1",
            requestId: "decision-1",
            barrierId: "barrier-1",
            parentRunId: "parent-run",
            childRunIds: ["run-1"],
            reason: "tool_scope_denied",
            options: ["grant_scope", "retry_child", "accept_partial", "cancel_group", "exit_symphony_mode"],
            recommendedOption: "grant_scope",
            evidenceRefs: ["wait-barrier:barrier-1", "subagent-run:run-1"],
          },
          allowedUserChoices: [
            { id: "retry_child", label: "Retry child", toolAction: "resolve_barrier", decision: "retry_child" },
          ],
        },
      })],
    );

    expect(clusters.get("message-1")?.mailboxActivities[0]).toMatchObject({
      label: "Barrier attention",
      detail: expect.stringContaining("Symphony options: Grant or re-scope child authority (recommended), Retry child, Accept partial, Cancel group, Exit Symphony"),
      actionLabels: [
        "Retry child",
        "Grant or re-scope child authority (recommended)",
        "Accept partial",
        "Cancel group",
        "Exit Symphony",
      ],
      actions: [
        expect.objectContaining({
          label: "Retry child",
          decision: "retry_child",
        }),
      ],
    });
  });

  it("keeps failed required barriers attached to the unsafe child after the barrier resolves", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [
        run({
          id: "run-failed",
          childThreadId: "child-failed",
          canonicalTaskPath: "root/0:reader",
          roleId: "explorer",
          status: "failed",
          updatedAt: "2026-06-05T00:01:00.000Z",
        }),
        run({
          id: "run-done",
          childThreadId: "child-done",
          canonicalTaskPath: "root/1:summarizer",
          status: "completed",
          updatedAt: "2026-06-05T00:01:10.000Z",
        }),
      ],
      [
        thread({
          id: "child-failed",
          title: "Reader",
          lastMessagePreview: "long_context_process failed",
        }),
        thread({
          id: "child-done",
          title: "Summarizer",
          lastMessagePreview: "Summary complete",
        }),
      ],
      [barrier({
        status: "failed",
        childRunIds: ["run-failed", "run-done"],
        failurePolicy: "ask_user",
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: ["run-failed", "run-done"],
          childStatuses: [
            { childRunId: "run-failed", status: "failed" },
            { childRunId: "run-done", status: "completed" },
          ],
          synthesisAllowed: false,
          resultArtifact: null,
          waitBarrierEvaluation: {
            schemaVersion: "ambient-subagent-wait-barrier-evaluation-v1",
            waitBarrierId: "barrier-1",
            dependencyMode: "required_all",
            childRunIds: ["run-failed", "run-done"],
            childStatuses: [
              { childRunId: "run-failed", status: "failed" },
              { childRunId: "run-done", status: "completed" },
            ],
            requiredSynthesisCount: 2,
            validSynthesisCount: 1,
            potentialSynthesisCount: 1,
            synthesisAllowed: false,
            partial: false,
            timedOut: false,
            impossible: true,
            activeChildRunIds: [],
            terminalUnsafeChildRunIds: ["run-failed"],
            childResults: [
              {
                childRunId: "run-failed",
                childThreadId: "child-failed",
                status: "failed",
                synthesisAllowed: false,
                partial: false,
                reason: "long_context_process failed",
                resultValidation: {
                  valid: false,
                  synthesisAllowed: false,
                  partial: false,
                  status: "failed",
                  reason: "long_context_process failed",
                },
              },
              {
                childRunId: "run-done",
                childThreadId: "child-done",
                status: "completed",
                synthesisAllowed: true,
                partial: false,
                resultValidation: {
                  valid: true,
                  synthesisAllowed: true,
                  partial: false,
                  status: "completed",
                },
              },
            ],
            reason: "required_all barrier cannot reach 2 synthesis-safe child results; 1 child result is terminal and unsafe for synthesis.",
          },
        },
      })],
    );

    const cluster = clusters.get("message-1");
    expect(cluster).toMatchObject({
      summary: "2 children · 2 required · 1 attention",
      status: "Needs attention",
      statusTone: "danger",
      parentBlocking: {
        label: "Parent blocked on 1 child: attention needed",
        blockingChildren: [
          {
            runId: "run-failed",
            title: "Reader",
            label: "Reader: child failed",
            detail: expect.stringContaining("Failed / Failed / long_context_process failed / Required all / Ask user on failure / 30s timeout"),
            statusTone: "danger",
            kind: "attention",
          },
        ],
      },
      barriers: [
        {
          status: "Failed",
          statusTone: "danger",
          blockingChildren: [
            {
              runId: "run-failed",
              title: "Reader",
              status: "Failed",
              statusTone: "danger",
              label: expect.stringContaining("Reader / root/0:reader / Failed / Latest: long_context_process failed"),
            },
          ],
        },
      ],
      children: [
        {
          runId: "run-failed",
          parentBlocker: {
            kind: "attention",
            label: "Blocking: child failed",
            detail: expect.stringContaining("long_context_process failed"),
          },
        },
        {
          runId: "run-done",
        },
      ],
    });
    expect(cluster?.children.find((child) => child.runId === "run-done")).not.toHaveProperty("parentBlocker");
  });

  it("marks completion-guard wait-barrier attention on the blocking child", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({
        status: "completed",
        updatedAt: "2026-06-05T00:01:30.000Z",
      })],
      [thread({
        id: "child-1",
        title: "Workspace writer",
        lastMessagePreview: "Implementation completed",
      })],
      [],
      [parentMailboxEvent({
        type: "subagent.wait_barrier_attention",
        payload: {
          schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
          childRunId: "run-1",
          childThreadId: "child-1",
          canonicalTaskPath: "root/0:summarizer",
          waitBarrierId: "barrier-1",
          dependencyMode: "required_all",
          barrierStatus: "failed",
          failurePolicy: "ask_user",
          reason: "Child result is not synthesis-safe.",
          resultValidation: {
            valid: false,
            synthesisAllowed: false,
            partial: false,
            status: "completed",
            reason: "Missing approval provenance.",
            completionGuardValidation: {
              valid: false,
              synthesisAllowed: false,
              required: true,
              structuredEvidenceCount: 1,
              ambientEvidenceCount: 1,
              isolatedWorktreeEvidenceCount: 1,
              approvalEvidenceCount: 0,
              reason: "Missing approval provenance.",
            },
          },
          parentResolution: {
            schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
            action: "ask_user",
            status: "blocked",
          },
          allowedUserChoices: [
            { id: "retry_child", label: "Retry child", toolAction: "resolve_barrier", decision: "retry_child" },
            { id: "detach_child", label: "Detach child", toolAction: "resolve_barrier", decision: "detach_child" },
          ],
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "1 child · 1 required · 1 attention",
      status: "Needs attention",
      statusTone: "danger",
      children: [
        {
          runId: "run-1",
          status: "Completed",
          statusTone: "success",
          parentBlocker: {
            kind: "attention",
            label: "Blocking: completion guard",
            statusTone: "danger",
            detail: expect.stringContaining("Completion guard blocked / Mutation evidence: structured 1 / Ambient 1 / isolated worktree 1 / approval 0 / Missing approval provenance."),
            metaLabels: [
              "Child: Workspace writer",
              "Path: root/0:summarizer",
              "Status: Completed",
              "Elapsed: 1m 30s",
              "Latest: Implementation completed",
            ],
          },
        },
      ],
      mailboxActivities: [
        {
          label: "Barrier attention",
          statusTone: "danger",
          summary: "Ask user / Failed / Required all",
          detail: expect.stringContaining("Completion guard blocked / Mutation evidence: structured 1 / Ambient 1 / isolated worktree 1 / approval 0 / Missing approval provenance."),
        },
      ],
    });
  });

  it("leaves non-resolution wait-barrier choices visible but not clickable", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        type: "subagent.wait_barrier_attention",
        payload: {
          schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
          childRunId: "run-1",
          waitBarrierId: "barrier-1",
          dependencyMode: "required_all",
          barrierStatus: "waiting",
          parentResolution: {
            schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
            action: "ask_user",
            status: "blocked",
          },
          allowedUserChoices: [
            { id: "send_child_steering", label: "Send child steering", toolAction: "send_child_steering" },
            { id: "wait_again", label: "Wait again", toolAction: "wait_agent" },
          ],
        },
      })],
    );

    expect(clusters.get("message-1")?.mailboxActivities[0]).toMatchObject({
      label: "Barrier attention",
      actionLabels: ["Send child steering", "Wait again"],
    });
    expect(clusters.get("message-1")?.mailboxActivities[0]?.actions).toBeUndefined();
  });

  it("surfaces wait-barrier decisions from parent mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        type: "subagent.wait_barrier_decision",
        payload: {
          schemaVersion: "ambient-subagent-wait-barrier-decision-v1",
          waitBarrierId: "barrier-1",
          barrierStatus: "satisfied",
          childRunIds: ["run-1"],
          decision: "continue_with_partial",
          userDecisionPreview: "Continue without the failed reviewer.",
          partialSummaryPreview: "Use verified parent context only.",
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Partial",
      statusTone: "warning",
      mailboxActivities: [
        {
          label: "Barrier decision",
          sourceLabel: "Child source: run run-1",
          statusTone: "warning",
          summary: "Partial approved / Satisfied",
          detail: "Use verified parent context only. | Continue without the failed reviewer.",
        },
      ],
    });
  });

  it("surfaces child-source labels for approval and lifecycle mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [
        parentMailboxEvent({
          id: "attention",
          updatedAt: "2026-06-05T00:00:11.000Z",
          type: "subagent.wait_barrier_attention",
          payload: {
            schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
            childRunId: "run-approval",
            childThreadId: "child-approval",
            canonicalTaskPath: "root/approval:worker",
            waitBarrierId: "barrier-approval",
            barrierStatus: "timed_out",
            dependencyMode: "required_all",
            parentResolution: {
              schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
              action: "ask_user",
              status: "blocked",
            },
            reason: "Child needs approval before using workspace.write.",
          },
        }),
        parentMailboxEvent({
          id: "interrupted",
          updatedAt: "2026-06-05T00:00:10.000Z",
          type: "subagent.lifecycle_interrupted",
          payload: {
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: "run-error",
            childThreadId: "child-error",
            canonicalTaskPath: "root/error:reviewer",
            roleId: "reviewer",
            status: "failed",
            source: "direct_child_stop",
            reason: "Child error surfaced to parent.",
          },
        }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      mailboxActivities: [
        {
          id: "attention",
          label: "Barrier attention",
          sourceLabel: "Child source: root/approval:worker / run run-approval / thread child-approval",
        },
        {
          id: "interrupted",
          label: "Child interrupted",
          sourceLabel: "Child source: root/error:reviewer / run run-error / thread child-error",
        },
      ],
    });
  });

  it("keeps lifecycle attention visible alongside retry, partial, detach, and restart rows", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [
        parentMailboxEvent({
          id: "restart-interruption",
          updatedAt: "2026-06-05T00:00:15.000Z",
          type: "subagent.lifecycle_interrupted",
          payload: {
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: "run-retry",
            childThreadId: "child-retry",
            canonicalTaskPath: "root/lifecycle:retry",
            roleId: "reviewer",
            status: "stopped",
            source: "run_startup_reconciliation",
            reason: "Ambient restarted before this child run finished.",
          },
        }),
        parentMailboxEvent({
          id: "detach-decision",
          updatedAt: "2026-06-05T00:00:14.000Z",
          type: "subagent.wait_barrier_decision",
          payload: waitBarrierDecisionPayload({
            waitBarrierId: "barrier-detach",
            decision: "detach_child",
            barrierStatus: "failed",
            childRunIds: ["run-detached"],
            detachedRunIds: ["run-detached"],
          }),
        }),
        parentMailboxEvent({
          id: "retry-decision",
          updatedAt: "2026-06-05T00:00:13.000Z",
          type: "subagent.wait_barrier_decision",
          payload: waitBarrierDecisionPayload({
            waitBarrierId: "barrier-retry",
            decision: "retry_child",
            barrierStatus: "waiting_on_children",
            childRunIds: ["run-retry"],
            retryRequestedRunIds: ["run-retry"],
            retryAcceptedRunIds: ["run-retry"],
            retryMailboxEventIds: ["mailbox-retry"],
          }),
        }),
        parentMailboxEvent({
          id: "partial-decision",
          updatedAt: "2026-06-05T00:00:12.000Z",
          type: "subagent.wait_barrier_decision",
          payload: waitBarrierDecisionPayload({
            waitBarrierId: "barrier-partial",
            decision: "continue_with_partial",
            barrierStatus: "satisfied",
            childRunIds: ["run-partial"],
            partialSummaryPreview: "Use partial evidence.",
          }),
        }),
        parentMailboxEvent({
          id: "timeout-attention",
          updatedAt: "2026-06-05T00:00:11.000Z",
          type: "subagent.wait_barrier_attention",
          payload: {
            schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
            childRunId: "run-timeout",
            childThreadId: "child-timeout",
            canonicalTaskPath: "root/lifecycle:timeout",
            waitBarrierId: "barrier-timeout",
            dependencyMode: "required_all",
            barrierStatus: "timed_out",
            failurePolicy: "degrade_partial",
            reason: "Child wait timed out before producing a synthesis-safe result.",
            parentResolution: {
              schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
              action: "ask_user",
              status: "blocked",
            },
            allowedUserChoices: [
              { id: "continue_with_partial", label: "Continue with partial", toolAction: "resolve_barrier", decision: "continue_with_partial" },
              { id: "retry_child", label: "Retry child", toolAction: "resolve_barrier", decision: "retry_child" },
              { id: "detach_child", label: "Detach child", toolAction: "resolve_barrier", decision: "detach_child" },
            ],
          },
        }),
      ],
    );

    expect(clusters.get("message-1")?.mailboxActivities.map((activity) => activity.id)).toEqual([
      "restart-interruption",
      "detach-decision",
      "retry-decision",
      "partial-decision",
      "timeout-attention",
    ]);
    expect(clusters.get("message-1")?.mailboxActivities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "timeout-attention", label: "Barrier attention" }),
      expect.objectContaining({ id: "retry-decision", summary: "Retry accepted / Waiting On Children" }),
      expect.objectContaining({ id: "restart-interruption", label: "Child interrupted" }),
    ]));
  });

  it("labels child approval requests and forwarded decisions in the collapsed cluster", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [
        parentMailboxEvent({
          id: "approval-request",
          updatedAt: "2026-06-05T00:00:10.000Z",
          type: "subagent.child_approval_requested",
          deliveryState: "consumed",
          payload: {
            schemaVersion: "ambient-subagent-approval-bridge-v1",
            childRunId: "run-approval",
            childThreadId: "child-approval",
            canonicalTaskPath: "root/approval:worker",
            approvalId: "approval-worker-write",
            title: "Allow workspace write",
            prompt: "Child wants to edit files in an isolated worktree.",
            requestedToolCategory: "workspace.write",
            requestedScope: "always",
            effectiveScope: "this_child_thread",
          },
        }),
        parentMailboxEvent({
          id: "approval-forwarded",
          updatedAt: "2026-06-05T00:00:11.000Z",
          type: "subagent.child_approval_forwarded",
          payload: {
            schemaVersion: "ambient-subagent-approval-bridge-v1",
            childRunId: "run-approval",
            childThreadId: "child-approval",
            canonicalTaskPath: "root/approval:worker",
            approvalId: "approval-worker-write",
            decision: "approved",
            requestedScope: "always",
            effectiveScope: "this_child_thread",
            childAlwaysDefaulted: true,
            scope: {
              reason: "Child always grants default to this child thread so approval does not silently widen to the parent tree or project.",
            },
            parentBlockingState: {
              action: "forward_child_approval_then_wait",
              resumeParentBlocking: true,
            },
            resumeParentBlocking: true,
            userDecisionPreview: "Approve writes for this child only.",
          },
        }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      mailboxActivities: [
        {
          id: "approval-forwarded",
          label: "Approval forwarded",
          sourceLabel: "Child source: root/approval:worker / run run-approval / thread child-approval",
          statusTone: "success",
          summary: "Approved / This child thread / approval-worker-write",
          detail: "Approve writes for this child only. | Always defaulted to this child thread. | Parent returned to waiting on this child.",
        },
        {
          id: "approval-request",
          label: "Approval requested",
          sourceLabel: "Child source: root/approval:worker / run run-approval / thread child-approval",
          statusTone: "neutral",
          summary: "Allow workspace write / workspace.write / This child thread",
          detail: "Child wants to edit files in an isolated worktree.",
        },
      ],
    });
  });

  it("surfaces detach and cancel wait-barrier decisions from parent mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [
        parentMailboxEvent({
          id: "parent-mailbox-detach",
          type: "subagent.wait_barrier_decision",
          updatedAt: "2026-06-05T00:00:10.000Z",
          payload: {
            schemaVersion: "ambient-subagent-wait-barrier-decision-v1",
            waitBarrierId: "barrier-1",
            barrierStatus: "failed",
            decision: "detach_child",
            userDecisionPreview: "Keep the child running separately.",
            childRunIds: ["run-1"],
            detachedRunIds: ["run-1"],
            unchangedRunIds: ["run-done"],
            cancelledWaitBarrierIds: ["barrier-detach"],
            cancelledMailboxEventIds: ["mailbox-detach"],
          },
        }),
        parentMailboxEvent({
          id: "parent-mailbox-cancel",
          type: "subagent.wait_barrier_decision",
          updatedAt: "2026-06-05T00:00:11.000Z",
          payload: {
            schemaVersion: "ambient-subagent-wait-barrier-decision-v1",
            waitBarrierId: "barrier-2",
            barrierStatus: "cancelled",
            decision: "cancel_parent",
            userDecisionPreview: "Cancel the parent instead of waiting.",
            childRunIds: ["run-2"],
            parentCancellationRequested: true,
            cancelledRunIds: ["run-2"],
            stoppedChildRunIds: ["run-stopped"],
            unchangedRunIds: ["run-completed"],
            cancelledWaitBarrierIds: ["barrier-cancel"],
            cancelledMailboxEventIds: ["mailbox-cancel-1", "mailbox-cancel-2"],
          },
        }),
      ],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Needs attention",
      statusTone: "danger",
      mailboxActivities: [
        {
          label: "Barrier decision",
          sourceLabel: "Child source: run run-2",
          statusTone: "danger",
          summary: "Parent cancelled / Cancelled",
          detail: "Cancel the parent instead of waiting. | Cancelled 1 child / Stopped 1 child / Unchanged 1 child / 1 wait barrier cancelled / Parent cancellation requested / 2 pending mailbox events cancelled",
          effectRows: [
            {
              key: "cancelled-runs",
              label: "Cancelled 1 child",
              detail: "Runs: run-2",
              statusTone: "danger",
            },
            {
              key: "stopped-runs",
              label: "Stopped 1 child",
              detail: "Runs: run-stopped",
              statusTone: "danger",
            },
            {
              key: "unchanged-runs",
              label: "Unchanged 1 child",
              detail: "Runs: run-completed",
              statusTone: "neutral",
            },
            {
              key: "cancelled-wait-barriers",
              label: "1 wait barrier cancelled",
              detail: "Wait barriers: barrier-cancel",
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
              label: "2 pending mailbox events cancelled",
              detail: "Mailbox events: mailbox-cancel-1, mailbox-cancel-2",
              statusTone: "warning",
            },
          ],
        },
        {
          label: "Barrier decision",
          sourceLabel: "Child source: run run-1",
          statusTone: "warning",
          summary: "Child detached / Failed",
          detail: "Keep the child running separately. | Detached 1 child / Unchanged 1 child / 1 wait barrier cancelled / 1 pending mailbox event cancelled",
          effectRows: [
            {
              key: "detached-runs",
              label: "Detached 1 child",
              detail: "Runs: run-1",
              statusTone: "warning",
            },
            {
              key: "unchanged-runs",
              label: "Unchanged 1 child",
              detail: "Runs: run-done",
              statusTone: "neutral",
            },
            {
              key: "cancelled-wait-barriers",
              label: "1 wait barrier cancelled",
              detail: "Wait barriers: barrier-detach",
              statusTone: "warning",
            },
            {
              key: "cancelled-mailbox-events",
              label: "1 pending mailbox event cancelled",
              detail: "Mailbox events: mailbox-detach",
              statusTone: "warning",
            },
          ],
        },
      ],
    });
  });

  it("surfaces parent mailbox batch progress on the collapsed cluster", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "completed" })],
      [thread({ id: "child-1" })],
      [],
      [parentMailboxEvent({
        type: "subagent.batch_progress",
        payload: {
          schemaVersion: "ambient-subagent-batch-progress-mailbox-v1",
          summary: {
            schemaVersion: "ambient-subagent-batch-progress-v1",
            jobId: "subagent-batch:implementation",
            itemCount: 3,
            acceptedReportCount: 2,
            pendingCount: 1,
          },
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "1 child · 1 required · 1 batch pending",
      status: "Running",
      statusTone: "active",
      mailboxActivities: [
        {
          label: "Batch progress",
          statusTone: "active",
          summary: "2/3 items reported",
          detail: "1 pending · subagent-batch:implementation",
        },
      ],
    });
  });

  it("surfaces grouped background completions from parent mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "completed", dependencyMode: "optional_background" })],
      [thread({ id: "child-1" })],
      [],
      [parentMailboxEvent({
        type: "subagent.grouped_completion",
        payload: {
          schemaVersion: "ambient-subagent-grouped-completion-v1",
          notificationCount: 2,
          childRuns: [
            { runId: "run-1", roleId: "worker", status: "completed" },
            { runId: "run-2", roleId: "reviewer", status: "completed" },
          ],
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      status: "Complete",
      statusTone: "success",
      mailboxActivities: [
        {
          label: "Background completions",
          statusTone: "success",
          summary: "2 children completed",
          detail: "Worker Completed, Reviewer Completed",
        },
      ],
    });
  });

  it("creates a parent cluster for anchored batch progress without child runs", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        parentMessageId: "message-1",
        type: "subagent.batch_progress",
        payload: {
          schemaVersion: "ambient-subagent-batch-progress-mailbox-v1",
          summary: {
            schemaVersion: "ambient-subagent-batch-progress-v1",
            jobId: "subagent-batch:implementation",
            itemCount: 3,
            acceptedReportCount: 2,
            pendingCount: 1,
          },
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      parentMessageId: "message-1",
      summary: "0 children · 1 batch pending",
      status: "Running",
      statusTone: "active",
      children: [],
      mailboxActivities: [
        {
          label: "Batch progress",
          statusTone: "active",
          summary: "2/3 items reported",
          detail: "1 pending · subagent-batch:implementation",
        },
      ],
    });
  });

  it("creates a parent cluster for anchored grouped completions without child run models", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        parentMessageId: "message-1",
        type: "subagent.grouped_completion",
        payload: {
          schemaVersion: "ambient-subagent-grouped-completion-v1",
          parentMessageId: "message-1",
          notificationCount: 2,
          childRuns: [
            { runId: "run-1", roleId: "worker", status: "completed" },
            { runId: "run-2", roleId: "reviewer", status: "completed" },
          ],
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      parentMessageId: "message-1",
      summary: "0 children",
      status: "Complete",
      statusTone: "success",
      children: [],
      mailboxActivities: [
        {
          label: "Background completions",
          statusTone: "success",
          summary: "2 children completed",
          detail: "Worker Completed, Reviewer Completed",
        },
      ],
    });
  });

  it("creates an attention cluster for anchored child lifecycle interruptions without child runs", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        parentMessageId: "message-1",
        type: "subagent.lifecycle_interrupted",
        payload: {
          schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
          parentMessageId: "message-1",
          childRunId: "run-1",
          childThreadId: "child-1",
          canonicalTaskPath: "root/0:explorer",
          roleId: "explorer",
          previousStatus: "running",
          status: "cancelled",
          source: "direct_child_stop",
          reason: "Sub-agent child thread stopped by user.",
          cancelledWaitBarrierIds: ["barrier-cancel"],
          resultArtifact: {
            status: "cancelled",
            partial: false,
            summary: "Sub-agent child thread stopped by user.",
          },
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      parentMessageId: "message-1",
      summary: "0 children · 1 interrupted",
      status: "Needs attention",
      statusTone: "danger",
      children: [],
      mailboxActivities: [
        {
          label: "Child interrupted",
          sourceLabel: "Child source: root/0:explorer / run run-1 / thread child-1",
          statusTone: "danger",
          summary: "Cancelled / Explorer / root/0:explorer",
          detail: "Stopped in child thread · Sub-agent child thread stopped by user. · 1 wait barrier cancelled",
          effectRows: [
            {
              key: "cancelled-wait-barriers",
              label: "1 wait barrier cancelled",
              detail: "Wait barriers: barrier-cancel",
              statusTone: "warning",
            },
          ],
        },
      ],
    });
  });

  it("creates a partial cluster for anchored runtime budget partials without child runs", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        parentMessageId: "message-1",
        type: "subagent.lifecycle_interrupted",
        payload: {
          schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
          parentMessageId: "message-1",
          childRunId: "run-1",
          childThreadId: "child-1",
          canonicalTaskPath: "root/0:explorer",
          roleId: "explorer",
          previousStatus: "running",
          status: "aborted_partial",
          source: "runtime_budget_exceeded",
          reason: "Child exceeded its role runtime budget before completing.",
          partialWaitBarrierIds: ["barrier-partial"],
          resultArtifact: {
            status: "aborted_partial",
            partial: true,
            summary: "Partial transcript retained.",
            artifactPath: "ambient://threads/child-1/transcript",
          },
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      parentMessageId: "message-1",
      summary: "0 children · 1 interrupted",
      status: "Partial",
      statusTone: "warning",
      children: [],
      mailboxActivities: [
        {
          label: "Child interrupted",
          sourceLabel: "Child source: root/0:explorer / run run-1 / thread child-1",
          statusTone: "warning",
          summary: "Aborted Partial / Explorer / root/0:explorer",
          detail: "Runtime budget exceeded · Child exceeded its role runtime budget before completing. · 1 partial wait barrier available",
          effectRows: [
            {
              key: "partial-wait-barriers",
              label: "1 partial wait barrier available",
              detail: "Wait barriers: barrier-partial",
              statusTone: "warning",
            },
          ],
        },
      ],
    });
  });

  it("surfaces anchored parent-stop cascades as parent mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        parentMessageId: "message-1",
        type: "subagent.cancellation_cascade",
        payload: {
          schemaVersion: "ambient-subagent-cancellation-cascade-v1",
          parentMessageId: "message-1",
          parentThreadId: "parent-1",
          parentRunId: "parent-run-1",
          reason: "Parent run stopped by user.",
          parentStopped: true,
          parentCancellationRequested: true,
          cancelledRunIds: ["run-1"],
          detachedRunIds: ["run-2"],
          unchangedRunIds: ["run-3"],
          cancelledWaitBarrierIds: ["barrier-1"],
          cancelledMailboxEventIds: ["mailbox-1"],
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      parentMessageId: "message-1",
      summary: "0 children · 1 interrupted",
      status: "Needs attention",
      statusTone: "danger",
      children: [],
      mailboxActivities: [
        {
          label: "Parent stopped",
          statusTone: "danger",
          summary: "1 cancelled · 1 detached · 1 unchanged · 1 wait barrier cancelled",
          detail: "Parent run stopped by user. · 1 pending mailbox event cancelled",
          effectRows: expect.arrayContaining([
            expect.objectContaining({
              key: "parent-cancellation-requested",
              label: "Parent cancellation requested",
              detail: "Parent run cancellation was requested by the parent-stop cascade.",
              statusTone: "danger",
            }),
          ]),
        },
      ],
    });
  });

  it("creates a parent cluster for anchored blocking workflow tasks without child runs", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        parentMessageId: "message-1",
        type: "callable_workflow.parent_finalization_blocked",
        payload: callableWorkflowBlockingPayload({
          tasks: [
            {
              id: "callable-task-1",
              launchId: "callable-workflow:launch-1",
              title: "Symphony Map-Reduce",
              status: "queued",
              statusLabel: "Queued",
              statusGroup: "waiting_on_workflow",
              runnerDeferredReason: "callable_workflow_runner_not_connected",
              workflowArtifactId: "workflow-artifact-1",
              workflowRunId: "workflow-run-1",
            },
          ],
          taskIds: ["callable-task-1"],
          waitingTaskIds: ["callable-task-1"],
          attentionTaskIds: [],
          workflowArtifactIds: ["workflow-artifact-1"],
          workflowRunIds: ["workflow-run-1"],
        }),
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      parentMessageId: "message-1",
      summary: "0 children · 1 workflow blocked",
      status: "Waiting",
      statusTone: "active",
      children: [],
      mailboxActivities: [
        {
          label: "Workflow blocked",
          sourceLabel: "Workflow source: task callable-task-1 / run workflow-run-1 / artifact workflow-artifact-1",
          statusTone: "active",
          summary: "1 blocking workflow / 1 waiting / Symphony Map-Reduce (Queued)",
          detail: "Parent final answer blocked because blocking callable workflow work is not safe for synthesis. | Choices: Wait again, Cancel parent run",
        },
      ],
    });
  });

  it("surfaces failed blocking workflow tasks as needs-attention mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        parentMessageId: "message-1",
        type: "callable_workflow.parent_finalization_blocked",
        payload: callableWorkflowBlockingPayload({
          tasks: [
            {
              id: "callable-task-failed",
              launchId: "callable-workflow:failed",
              title: "Imitate & Verify",
              status: "failed",
              statusLabel: "Failed",
              statusGroup: "needs_attention",
              runnerDeferredReason: "failed",
              errorMessage: "Workflow verifier failed.",
            },
          ],
          taskIds: ["callable-task-failed"],
          waitingTaskIds: [],
          attentionTaskIds: ["callable-task-failed"],
          workflowArtifactIds: [],
          workflowRunIds: [],
        }),
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      parentMessageId: "message-1",
      summary: "0 children · 1 workflow blocked",
      status: "Needs attention",
      statusTone: "danger",
      children: [],
      mailboxActivities: [
        {
          label: "Workflow blocked",
          sourceLabel: "Workflow source: task callable-task-failed",
          statusTone: "danger",
          summary: "1 blocking workflow / 1 attention / Imitate & Verify (Failed)",
        },
      ],
    });
  });

  it("marks callable workflow task rows that are blocking parent finalization", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        parentMessageId: "message-1",
        type: "callable_workflow.parent_finalization_blocked",
        payload: callableWorkflowBlockingPayload({
          tasks: [
            {
              id: "callable-task-1",
              launchId: "callable-workflow:launch-1",
              title: "Symphony Map-Reduce",
              status: "running",
              statusLabel: "Running",
              statusGroup: "waiting_on_workflow",
              runnerDeferredReason: "workflow_run_started",
              workflowArtifactId: "workflow-artifact-1",
              workflowRunId: "workflow-run-1",
            },
            {
              id: "callable-task-failed",
              launchId: "callable-workflow:failed",
              title: "Imitate & Verify",
              status: "failed",
              statusLabel: "Failed",
              statusGroup: "needs_attention",
              runnerDeferredReason: "failed",
              workflowArtifactId: "workflow-artifact-failed",
              errorMessage: "Workflow verifier failed.",
            },
          ],
          taskIds: ["callable-task-1", "callable-task-failed"],
          waitingTaskIds: ["callable-task-1"],
          attentionTaskIds: ["callable-task-failed"],
          workflowArtifactIds: ["workflow-artifact-1", "workflow-artifact-failed"],
          workflowRunIds: ["workflow-run-1"],
        }),
      })],
      [
        callableWorkflowTask({
          id: "callable-task-1",
          status: "running",
          statusLabel: "Running",
          runnerDeferredReason: "workflow_run_started",
          workflowArtifactId: "workflow-artifact-1",
          workflowRunId: "workflow-run-1",
        }),
        callableWorkflowTask({
          id: "callable-task-failed",
          title: "Imitate & Verify",
          sourceKind: "recorded_workflow",
          status: "failed",
          statusLabel: "Failed",
          runnerDeferredReason: "failed",
          workflowArtifactId: "workflow-artifact-failed",
          errorMessage: "Workflow verifier failed.",
        }),
      ],
    );

    expect(clusters.get("message-1")?.workflowTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "callable-task-1",
          parentBlocker: {
            kind: "waiting",
            label: "Blocking: workflow work",
            statusTone: "active",
            detail: expect.stringContaining("Symphony Map-Reduce / Running / Workflow run started"),
          },
        }),
        expect.objectContaining({
          id: "callable-task-failed",
          parentBlocker: {
            kind: "attention",
            label: "Blocking: workflow attention",
            statusTone: "danger",
            detail: expect.stringContaining("Workflow verifier failed."),
          },
        }),
      ]),
    );
  });

  it("surfaces queued callable workflow tasks as visible background rows", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [],
      [callableWorkflowTask({
        title: "Symphony Map-Reduce",
        sourceKind: "symphony_recipe",
        status: "queued",
        statusLabel: "Queued",
        blocking: true,
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      parentMessageId: "message-1",
      summary: "0 children · 1 workflow task · 1 blocking · 1 active",
      status: "Waiting",
      statusTone: "active",
      workflowTasks: [
        {
          id: "callable-task-1",
          title: "Symphony Map-Reduce",
          status: "Queued",
          statusTone: "active",
          modeLabel: "Blocking",
          sourceLabel: "Symphony recipe",
          progressLabel: "Queued",
          capabilityLabels: ["Progress visible", "Token/cost", "Pause/resume/cancel"],
          canCancel: true,
          cancelTitle: "Cancel blocking workflow task",
          detail: "Runner: workflowCompilerService / State: Waiting for workflow runner",
        },
      ],
      children: [],
      mailboxActivities: [],
    });
  });

  it("surfaces runtime-owned pattern graph snapshots attached to workflow tasks", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [
        run({ id: "mapper-run-1", childThreadId: "mapper-thread-1", roleId: "explorer", status: "completed" }),
        run({ id: "reducer-run-1", childThreadId: "reducer-thread-1", roleId: "summarizer", status: "needs_attention" }),
      ],
      [
        thread({ id: "mapper-thread-1", title: "Mapper 1 live", childOrder: 1, lastMessagePreview: "Mapper finished with extracted evidence." }),
        thread({ id: "reducer-thread-1", title: "Reducer live", childOrder: 2, lastMessagePreview: "Reducer needs approval." }),
      ],
      [],
      [],
      [callableWorkflowTask({
        id: "workflow-task-graph",
        workflowRunId: "workflow-run-graph",
        patternGraphSnapshot: buildPatternGraphSnapshot({
          patternId: "map_reduce",
          parentThreadId: "parent-1",
          parentMessageId: "message-1",
          workflowTaskId: "workflow-task-graph",
          workflowRunId: "workflow-run-graph",
          updatedAt: "2026-06-13T00:00:00.000Z",
          childBindings: [
            {
              roleNodeId: "mapper",
              childRunId: "mapper-run-1",
              childThreadId: "mapper-thread-1",
              label: "Mapper stale",
              status: "running",
              blockingParent: true,
              summary: "Stale mapper summary.",
            },
            {
              roleNodeId: "reducer",
              childRunId: "reducer-run-1",
              childThreadId: "reducer-thread-1",
              label: "Reducer stale",
              status: "running",
              approvalState: "pending",
              blockingParent: true,
              summary: "Stale reducer summary.",
            },
          ],
        }),
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "2 children · 2 required · 1 attention · 1 pattern graph · 1 workflow task · 1 blocking · 1 active",
      status: "Needs attention",
      statusTone: "warning",
      patternGraphs: [
        {
          patternId: "map_reduce",
          label: "Map-Reduce",
          nodes: expect.arrayContaining([
            expect.objectContaining({
              label: "Mapper 1 live",
              childRunId: "mapper-run-1",
              childThreadId: "mapper-thread-1",
              canOpen: true,
              statusLabel: "Completed",
              tone: "success",
              blockingParent: false,
              title: expect.stringContaining("Mapper finished with extracted evidence."),
            }),
            expect.objectContaining({
              label: "Reducer live",
              approvalLabel: "Approval needed",
              tone: "warning",
              statusLabel: "Needs attention",
              blockingParent: true,
              title: expect.stringContaining("Reducer needs approval."),
            }),
          ]),
        },
      ],
    });
  });

  it("surfaces callable workflow launch-card labels in collapsed parent clusters", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [],
      [callableWorkflowTask({
        launchCard: callableWorkflowLaunchCard(),
      })],
    );

    expect(clusters.get("message-1")?.workflowTasks[0]).toMatchObject({
      id: "callable-task-1",
      launchCardLabels: [
        "Risk: High",
        "Up to 12 agents",
        "Budget: 180,000 tokens",
        "Confirmation required",
        "Small slice recommended",
      ],
      detail: expect.stringContaining("Launch: high risk, up to 12 agents"),
    });
    expect(clusters.get("message-1")?.workflowTasks[0]?.detail).toContain("Local memory: 8 GiB");
  });

  it("surfaces callable workflow caller provenance in collapsed parent clusters", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [],
      [callableWorkflowTask({
        runnerTarget: "",
        runnerDeferredReason: "",
        executionPlan: {
          callerProvenance: {
            kind: "subagent_child_thread",
            threadId: "child-thread-1",
            runId: "child-run-1",
            subagentRunId: "child-run-1",
            canonicalTaskPath: "root/0:implementer",
            parentThreadId: "parent-1",
            parentRunId: "parent-run-1",
            approval: {
              required: true,
              source: "child_bridge_policy",
              failureHandling: "block_parent",
              scopeHint: "this_child_thread",
            },
            worktree: {
              required: true,
              isolated: true,
              status: "active",
              branchName: "child",
            },
            nestedFanout: {
              required: true,
              source: "child_bridge_policy",
            },
          },
        },
      })],
    );

    expect(clusters.get("message-1")?.workflowTasks[0]).toMatchObject({
      id: "callable-task-1",
      provenanceLabels: [
        "Caller: sub-agent child",
        "Child run: child-run-1",
        "Approval: Child Bridge Policy",
        "Worktree: isolated",
        "Nested fanout: Child Bridge Policy",
      ],
      detail: expect.stringContaining(
        "Provenance: sub-agent child / thread child-thread-1 / run child-run-1 / path root/0:implementer",
      ),
    });
    expect(clusters.get("message-1")?.workflowTasks[0]?.detail).toContain("approval child bridge policy required scope this child thread");
    expect(clusters.get("message-1")?.workflowTasks[0]?.detail).toContain("worktree isolated active branch child");
    expect(clusters.get("message-1")?.workflowTasks[0]?.detail).toContain("nested fanout required via child bridge policy");
  });

  it("surfaces child mutating workflow evidence from persisted provenance and progress", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [],
      [callableWorkflowTask({
        status: "succeeded",
        statusLabel: "Succeeded",
        blocking: false,
        runnerDeferredReason: "workflow_run_succeeded",
        workflowArtifactId: "workflow-artifact-1",
        workflowRunId: "workflow-run-1",
        workflowThreadId: "workflow-thread-1",
        launchCard: callableWorkflowLaunchCard(),
        progressSnapshot: {
          workflowRunStatus: "succeeded",
          eventCount: 4,
          modelCallCount: 1,
          completedStepCount: 1,
          activeStepCount: 0,
          lastEventType: "mutation.stage",
          lastEventMessage: "Staged mutation: src/feature.txt; output preview retained; parent workspace unchanged.",
          lastEventAt: "2026-06-05T00:02:30.000Z",
        },
        executionPlan: {
          callerProvenance: {
            kind: "subagent_child_thread",
            threadId: "child-thread-1",
            runId: "child-run-1",
            subagentRunId: "child-run-1",
            canonicalTaskPath: "root/0:implementer",
            parentThreadId: "parent-1",
            parentRunId: "parent-run-1",
            approval: {
              required: true,
              source: "child_bridge_policy",
              failureHandling: "forward approval to parent",
              scopeHint: "this_child_thread",
            },
            worktree: {
              required: true,
              isolated: true,
              status: "active",
              branchName: "child",
            },
            nestedFanout: {
              required: true,
              source: "child_bridge_policy",
            },
          },
        },
      })],
    );

    expect(clusters.get("message-1")?.workflowTasks[0]).toMatchObject({
      status: "Succeeded",
      modeLabel: "Background",
      idLabels: [
        "Task: callable-task-1",
        "Artifact: workflow-artifact-1",
        "Run: workflow-run-1",
        "Thread: workflow-thread-1",
      ],
      mutationEvidenceLabels: [
        "Mutating child worker",
        "Approval: child bridge policy",
        "Isolated worktree active",
        "Nested fanout granted",
        "Staged mutation: src/feature.txt",
        "Parent workspace unchanged",
        "Output preview retained",
      ],
    });
  });

  it("surfaces callable workflow task progress and usage telemetry", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [],
      [callableWorkflowTask({
        status: "running",
        statusLabel: "Running",
        workflowThreadId: "workflow-thread-1",
        workflowArtifactId: "workflow-artifact-1",
        workflowRunId: "workflow-run-1",
        runnerDeferredReason: "workflow_run_started",
        progressSnapshot: {
          workflowRunStatus: "running",
          eventCount: 3,
          modelCallCount: 1,
          completedStepCount: 1,
          activeStepCount: 0,
          lastEventType: "step.end",
          lastEventMessage: "Inspect files complete",
          lastEventAt: "2026-06-06T18:04:00.000Z",
        },
        usageSnapshot: {
          modelCallCount: 1,
          tokenCount: 42,
          tokenCountEstimated: true,
          costMicros: 9,
          costEstimated: false,
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "0 children · 1 workflow task · 1 blocking · 1 active",
      status: "Waiting",
      statusTone: "active",
      workflowTasks: [
        {
          id: "callable-task-1",
          status: "Running",
          progressLabel: "Inspect files complete",
          workflowThreadId: "workflow-thread-1",
          workflowThreadLabel: "Workflow thread: workflow-thread-1",
          canOpenWorkflowThread: true,
          openWorkflowThreadTitle: "Open workflow thread workflow-thread-1",
          telemetryLabels: ["3 events", "1 step done", "1 model call", "~42 tokens", "$0.000009"],
          canPause: true,
          pauseTitle: "Pause blocking workflow task",
          canCancel: true,
          detail: "Runner: workflowCompilerService / State: Workflow run started / Thread: workflow-thread-1 / Artifact: workflow-artifact-1 / Run: workflow-run-1",
        },
      ],
    });
  });

  it("marks paused callable workflow tasks resumeable only when a linked run or guarded pre-compile wait can resume", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [],
      [
        callableWorkflowTask({
          id: "callable-task-paused",
          status: "paused",
          statusLabel: "Paused",
          runnerDeferredReason: "workflow_run_paused",
          workflowArtifactId: "workflow-artifact-1",
          workflowRunId: "workflow-run-paused",
          progressSnapshot: {
            workflowRunStatus: "paused",
            eventCount: 2,
            modelCallCount: 0,
            completedStepCount: 1,
            activeStepCount: 0,
          },
        }),
        callableWorkflowTask({
          id: "callable-task-input",
          status: "paused",
          statusLabel: "Needs input",
          runnerDeferredReason: "workflow_run_needs_input",
          workflowArtifactId: "workflow-artifact-2",
          workflowRunId: "workflow-run-input",
          progressSnapshot: {
            workflowRunStatus: "needs_input",
            eventCount: 2,
            modelCallCount: 0,
            completedStepCount: 1,
            activeStepCount: 0,
          },
        }),
        callableWorkflowTask({
          id: "callable-task-child-wait",
          status: "paused",
          statusLabel: "Child wait needs attention",
          runnerDeferredReason: CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
          errorMessage: "Symphony children are not synthesis-safe.",
        }),
      ],
    );

    expect(clusters.get("message-1")?.workflowTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "callable-task-paused",
          progressLabel: "Paused",
          canResume: true,
          resumeTitle: "Resume blocking workflow task",
          canPause: false,
          canCancel: true,
          detail: "Runner: workflowCompilerService / State: Workflow run paused / Artifact: workflow-artifact-1 / Run: workflow-run-paused",
        }),
        expect.objectContaining({
          id: "callable-task-input",
          progressLabel: "Needs input",
          canResume: false,
          canPause: false,
          canCancel: true,
          detail: "Runner: workflowCompilerService / State: Workflow run needs input / Artifact: workflow-artifact-2 / Run: workflow-run-input",
        }),
        expect.objectContaining({
          id: "callable-task-child-wait",
          progressLabel: "Child wait needs attention",
          canResume: true,
          canPause: false,
          canCancel: true,
          detail: "Runner: workflowCompilerService / State: Symphony Child Wait Needs Attention / Error: Symphony children are not synthesis-safe.",
        }),
      ]),
    );
  });

  it("surfaces background Symphony child wait barriers on the workflow task row without parent-blocking children", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [
        run({
          id: "drafter-run",
          childThreadId: "drafter-thread",
          roleId: "drafter",
          status: "completed",
          canonicalTaskPath: "root/0:drafter",
        }),
        run({
          id: "verifier-run",
          childThreadId: "verifier-thread",
          roleId: "reviewer",
          status: "failed",
          canonicalTaskPath: "root/1:verifier",
        }),
      ],
      [
        thread({ id: "drafter-thread", title: "Drafter sub-agent", childOrder: 1 }),
        thread({ id: "verifier-thread", title: "Verifier sub-agent", childOrder: 2 }),
      ],
      [barrier({
        id: "symphony-child-wait",
        childRunIds: ["drafter-run", "verifier-run"],
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: "callable-task-child-wait",
        status: "failed",
        timeoutMs: 600_000,
      })],
      [],
      [callableWorkflowTask({
        id: "callable-task-child-wait",
        title: "Symphony Imitate and Verify",
        toolName: "ambient_workflow_symphony_imitate_and_verify",
        status: "paused",
        statusLabel: "Child wait needs attention",
        blocking: false,
        runnerDeferredReason: CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
        errorMessage: "Symphony children are not synthesis-safe.",
      })],
    );

    const cluster = clusters.get("message-1");
    expect(cluster).toMatchObject({
      summary: expect.stringContaining("Waiting on Drafter sub-agent: Completed, Verifier sub-agent: Failed"),
      status: "Needs attention",
      statusTone: "danger",
    });
    expect(cluster?.children.find((child) => child.runId === "verifier-run")?.parentBlocker).toBeUndefined();
    expect(cluster?.workflowTasks[0]).toMatchObject({
      id: "callable-task-child-wait",
      status: "Child wait needs attention",
      modeLabel: "Background",
      childWait: {
        label: "Waiting on Symphony children",
        statusTone: "danger",
        childLabels: ["Drafter sub-agent: Completed", "Verifier sub-agent: Failed"],
        detail: expect.stringContaining("Symphony Imitate and Verify / Failed / Required all / Ask user on failure / 10m timeout"),
      },
    });
  });

  it("surfaces failed callable workflow tasks as needs-attention rows", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [],
      [callableWorkflowTask({
        id: "callable-task-failed",
        title: "Recorded deploy workflow",
        sourceKind: "recorded_workflow",
        status: "failed",
        statusLabel: "Failed",
        blocking: false,
        runnerDeferredReason: "failed",
        errorMessage: "Workflow verifier failed.",
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "0 children · 1 workflow task · 1 workflow attention",
      status: "Needs attention",
      statusTone: "danger",
      workflowTasks: [
        {
          id: "callable-task-failed",
          title: "Recorded deploy workflow",
          status: "Failed",
          statusTone: "danger",
          modeLabel: "Background",
          sourceLabel: "Recorded workflow",
          progressLabel: "Failed",
          canCancel: false,
          cancelTitle: "Cancel background workflow task",
          detail: "Runner: workflowCompilerService / State: Workflow task failed / Error: Workflow verifier failed.",
        },
      ],
    });
  });

  it("surfaces spawn-failure model diagnostics from parent mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "completed" })],
      [thread({ id: "child-1" })],
      [],
      [parentMailboxEvent({
        type: "subagent.spawn_failed",
        payload: {
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "model_scope",
          parentThreadId: "parent-1",
          parentRunId: "parent-run-1",
          toolCallId: "spawn-bad-model",
          requestedRoleId: "explorer",
          roleId: "explorer",
          reason: "Selected model is not eligible for sub-agent runs (custom/unregistered-model): Model is not registered in this Ambient Desktop build.",
          modelScope: {
            schemaVersion: "ambient-subagent-model-scope-v1",
            source: "caller_override",
            requestedModelId: "custom/unregistered-model",
            roleDefaultModelId: "local/text-4b",
            selectedModelId: "custom/unregistered-model",
            profile: {
              profileId: "unknown:custom/unregistered-model",
              providerId: "unknown",
              modelId: "custom/unregistered-model",
              label: "Unknown model",
              locality: "cloud",
              toolUse: "none",
              structuredOutput: "none",
              available: false,
              selectableAsSubagent: false,
              supportsStreaming: false,
              unavailableReason: "Model is not registered in this Ambient Desktop build.",
            },
            warnings: [],
            blockingReasons: [
              "Model is not registered in this Ambient Desktop build.",
              "Model custom/unregistered-model is not selectable for sub-agent delegation.",
              "Model custom/unregistered-model does not support required sub-agent streaming.",
            ],
            candidateDiagnostics: [
              {
                schemaVersion: "ambient-subagent-model-scope-candidate-v1",
                source: "caller_override",
                modelId: "custom/unregistered-model",
                profileId: "unknown:custom/unregistered-model",
                providerId: "unknown",
                label: "Unknown model",
                selected: true,
                eligible: false,
                locality: "cloud",
                toolUse: "none",
                structuredOutput: "none",
                selectableAsSubagent: false,
                supportsStreaming: false,
                available: false,
                unavailableReason: "Model is not registered in this Ambient Desktop build.",
                capabilityDiagnostics: [
                  {
                    capability: "availability",
                    status: "fail",
                    required: "registered and available runtime profile",
                    actual: "unavailable",
                    reason: "Model is not registered in this Ambient Desktop build.",
                  },
                ],
                blockingReasons: ["Model is not registered in this Ambient Desktop build."],
              },
            ],
          },
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "1 child · 1 required · 1 failed spawn",
      status: "Needs attention",
      statusTone: "danger",
      mailboxActivities: [
        {
          label: "Spawn failed",
          statusTone: "danger",
          summary: "Model scope blocked / Explorer / Unknown model (custom/unregistered-model)",
          detail: "Selected model is not eligible for sub-agent runs (custom/unregistered-model): Model is not registered in this Ambient Desktop build. | Model blockers: Model is not registered in this Ambient Desktop build.; Model custom/unregistered-mod...",
        },
      ],
    });
  });

  it("surfaces tool-scope approval-unavailable details from parent mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "failed" })],
      [thread({ id: "child-1" })],
      [],
      [parentMailboxEvent({
        type: "subagent.spawn_failed",
        payload: {
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "tool_scope",
          approvalMode: "non_interactive",
          approvalUnavailable: true,
          parentThreadId: "parent-1",
          parentRunId: "parent-run-1",
          childRunId: "run-1",
          childThreadId: "child-1",
          canonicalTaskPath: "root/0:explorer",
          toolCallId: "spawn-noninteractive-approval",
          requestedRoleId: "explorer",
          roleId: "explorer",
          reason: "Requested sub-agent tool scope was denied.",
          toolScopeSnapshot: {
            schemaVersion: "ambient-subagent-tool-scope-v1",
            approvalMode: "non_interactive",
            deniedCategories: [
              {
                id: "connector.read",
                reason: "Capability requires interactive approval, but this launch is non-interactive.",
              },
            ],
            deniedTools: [
              {
                source: "connector_app",
                id: "gmail.search",
                categoryId: "connector.read",
                reason: "Capability requires interactive approval, but this launch is non-interactive.",
              },
            ],
          },
        },
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      summary: "1 child · 1 required · 1 failed spawn",
      status: "Needs attention",
      statusTone: "danger",
      mailboxActivities: [
        {
          label: "Spawn failed",
          sourceLabel: "Child source: root/0:explorer / run run-1 / thread child-1",
          statusTone: "danger",
          summary: "Approval unavailable / Explorer",
          detail: expect.stringContaining("Denied tools: Connector App gmail.search / Connector Read (connector.read)"),
        },
      ],
    });
    expect(clusters.get("message-1")?.mailboxActivities[0].detail).toContain(
      "Approval unavailable: non-interactive launch cannot surface required approval",
    );
    expect(clusters.get("message-1")?.mailboxActivities[0].detail).toContain("Denied categories: Connector Read (connector.read)");
  });

  it("surfaces callable workflow tool-scope denials with readable source and category labels", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "failed" })],
      [thread({ id: "child-1" })],
      [],
      [parentMailboxEvent({
        type: "subagent.spawn_failed",
        payload: {
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "tool_scope",
          approvalMode: "interactive",
          parentThreadId: "parent-1",
          parentRunId: "parent-run-1",
          childRunId: "run-1",
          childThreadId: "child-1",
          canonicalTaskPath: "root/0:explorer",
          requestedRoleId: "explorer",
          roleId: "explorer",
          reason: "Sub-agent role/tool scope is not launchable in Phase 4.",
          toolScopeSnapshot: {
            schemaVersion: "ambient-subagent-tool-scope-v1",
            approvalMode: "interactive",
            deniedCategories: [
              {
                id: "workflow.call",
                reason: "Callable workflow child bridge is unavailable.",
              },
            ],
            deniedTools: [
              {
                source: "callable_workflow",
                id: "ambient_workflow_symphony_map_reduce",
                categoryId: "workflow.call",
                reason: "Callable workflow child bridge is unavailable.",
              },
            ],
          },
        },
      })],
    );

    const detail = clusters.get("message-1")?.mailboxActivities[0].detail ?? "";
    expect(detail).toContain("Denied categories: Workflow Call (workflow.call)");
    expect(detail).toContain("Denied tools: Callable Workflow ambient_workflow_symphony_map_reduce / Workflow Call (workflow.call)");
  });

  it("creates a parent cluster for anchored spawn failures without child runs", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [parentMailboxEvent({
        parentMessageId: "message-1",
        type: "subagent.spawn_failed",
        payload: spawnFailurePayload(),
      })],
    );

    expect(clusters.get("message-1")).toMatchObject({
      parentMessageId: "message-1",
      summary: "0 children · 1 failed spawn",
      status: "Needs attention",
      statusTone: "danger",
      children: [],
      mailboxActivities: [
        {
          label: "Spawn failed",
          statusTone: "danger",
          summary: "Model scope blocked / Explorer / Unknown model (custom/unregistered-model)",
        },
      ],
    });
  });
});

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "child-1",
    title: "Child",
    workspacePath: "/workspace",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    messageCount: 0,
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "local/text-4b",
    thinkingLevel: "medium",
    kind: "subagent_child",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    subagentRunId: "run-1",
    collapsedByDefault: true,
    childStatus: "running",
    ...overrides,
  } as ThreadSummary;
}

function run(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "run-1",
    protocolVersion: "ambient-subagent-protocol-v1",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    parentMessageId: "message-1",
    childThreadId: "child-1",
    canonicalTaskPath: "root/0:summarizer",
    roleId: "summarizer",
    dependencyMode: "required",
    status: "running",
    featureFlagSnapshot: {
      schemaVersion: "ambient-feature-flags-v1",
      generatedAt: "2026-06-05T00:00:00.000Z",
      flags: {
        "ambient.subagents": {
          id: "ambient.subagents",
          enabled: true,
          source: "settings",
          defaultEnabled: false,
          settingsEnabled: true,
        },
      },
    },
    modelRuntimeSnapshot: modelRuntimeSnapshot(),
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  } as SubagentRunSummary;
}

function barrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    childRunIds: ["run-1"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    timeoutMs: 30_000,
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

function parentMailboxEvent(overrides: Partial<SubagentParentMailboxEventSummary> = {}): SubagentParentMailboxEventSummary {
  return {
    id: "parent-mailbox-1",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    parentMessageId: "message-1",
    type: "subagent.batch_progress",
    payload: {},
    deliveryState: "queued",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:10.000Z",
    ...overrides,
  };
}

function waitBarrierDecisionPayload(input: {
  waitBarrierId: string;
  decision: "continue_with_partial" | "retry_child" | "detach_child" | "cancel_parent" | "fail_parent";
  barrierStatus: string;
  childRunIds: string[];
  userDecisionPreview?: string;
  partialSummaryPreview?: string;
  retryRequestedRunIds?: string[];
  retryAcceptedRunIds?: string[];
  retryMailboxEventIds?: string[];
  detachedRunIds?: string[];
  cancelledRunIds?: string[];
  stoppedChildRunIds?: string[];
  unchangedRunIds?: string[];
  cancelledMailboxEventIds?: string[];
  parentCancellationRequested?: boolean;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-decision-v1",
    waitBarrierId: input.waitBarrierId,
    decision: input.decision,
    barrierStatus: input.barrierStatus,
    dependencyMode: "required_all",
    failurePolicy: "ask_user",
    childRunIds: input.childRunIds,
    childStatuses: input.childRunIds.map((childRunId) => ({ childRunId, status: "failed" })),
    ...(input.userDecisionPreview ? { userDecisionPreview: input.userDecisionPreview } : {}),
    ...(input.partialSummaryPreview ? { partialSummaryPreview: input.partialSummaryPreview } : {}),
    ...(input.retryRequestedRunIds?.length ? { retryRequestedRunIds: input.retryRequestedRunIds } : {}),
    ...(input.retryAcceptedRunIds?.length ? { retryAcceptedRunIds: input.retryAcceptedRunIds } : {}),
    ...(input.retryMailboxEventIds?.length ? { retryMailboxEventIds: input.retryMailboxEventIds } : {}),
    ...(input.detachedRunIds?.length ? { detachedRunIds: input.detachedRunIds } : {}),
    ...(input.cancelledRunIds?.length ? { cancelledRunIds: input.cancelledRunIds } : {}),
    ...(input.stoppedChildRunIds?.length ? { stoppedChildRunIds: input.stoppedChildRunIds } : {}),
    ...(input.unchangedRunIds?.length ? { unchangedRunIds: input.unchangedRunIds } : {}),
    ...(input.cancelledMailboxEventIds?.length ? { cancelledMailboxEventIds: input.cancelledMailboxEventIds } : {}),
    ...(input.parentCancellationRequested ? { parentCancellationRequested: true } : {}),
  };
}

function callableWorkflowTask(overrides: Partial<CallableWorkflowTaskSummary> = {}): CallableWorkflowTaskSummary {
  return {
    id: "callable-task-1",
    launchId: "callable-workflow:launch-1",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    parentMessageId: "message-1",
    toolCallId: "tool-call-1",
    toolId: "symphony.map_reduce",
    toolName: "symphony_map_reduce",
    sourceKind: "symphony_recipe",
    title: "Symphony Map-Reduce",
    status: "queued",
    statusLabel: "Queued",
    blocking: true,
    defaultCollapsed: true,
    progressVisible: true,
    tokenCostTracking: true,
    pauseResumeCancel: true,
    cancelHandle: "callable-workflow-task:callable-task-1",
    runnerTarget: "workflowCompilerService",
    runnerDeferredReason: "callable_workflow_runner_not_connected",
    executionPlan: {},
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

function callableWorkflowLaunchCard(): NonNullable<CallableWorkflowTaskSummary["launchCard"]> {
  return {
    schemaVersion: "ambient-callable-workflow-launch-card-v1",
    title: "Symphony Map-Reduce",
    sourceKind: "symphony_recipe",
    riskLevel: "high",
    estimatedAgents: 12,
    maxFanout: 12,
    maxDepth: 2,
    estimatedTokenBudget: 180_000,
    tokenBudgetEstimated: true,
    estimatedLocalMemoryBytes: 8 * 1024 * 1024 * 1024,
    localMemoryEstimated: true,
    costEstimateLabel: "Budgeted up to 180,000 tokens; provider dollar cost is estimated after runtime pricing is known.",
    toolMutationScope: "Recipe and user scope define allowed tools; mutating child actions require approval, child identifiers, and worktree isolation.",
    checkpointResume: "Compile to a persisted workflow artifact before running; visible runs must expose progress, pause/resume/cancel, and restart evidence.",
    approvalFailureHandling: "Denied, unavailable, or non-interactive approvals leave the workflow blocked or needing attention; the parent must not synthesize it as complete.",
    defaultCollapsed: true,
    blocking: true,
    smallSliceRecommended: true,
    requireConfirmation: true,
    requirementIds: [
      "estimated_agents",
      "token_cost_budget",
      "tool_mutation_scope",
      "checkpoint_resume",
      "approval_failure_handling",
    ],
    metricTemplateIds: ["map_reduce-metric"],
    policyWarnings: ["May fan out to as many as 12 child threads."],
  };
}

function callableWorkflowBlockingPayload(overrides: {
  tasks: Array<Record<string, unknown>>;
  taskIds: string[];
  waitingTaskIds: string[];
  attentionTaskIds: string[];
  workflowArtifactIds: string[];
  workflowRunIds: string[];
}) {
  return {
    schemaVersion: "ambient-callable-workflow-parent-blocking-v1",
    reason: "blocking_callable_workflow_not_synthesis_safe",
    message: "Parent final answer blocked because blocking callable workflow work is not safe for synthesis.",
    instruction: "Do not synthesize workflow work.",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    parentMessageId: "message-1",
    synthesisAllowed: false,
    parentFinalizationBlocked: true,
    launchIds: overrides.tasks.map((task) => String(task.launchId ?? task.id ?? "")),
    allowedUserChoices: [
      { id: "wait_again", label: "Wait again", action: "wait_for_workflow" },
      { id: "cancel_parent", label: "Cancel parent run", action: "cancel_parent_run" },
    ],
    ...overrides,
  };
}

function spawnFailurePayload() {
  return {
    schemaVersion: "ambient-subagent-spawn-failure-v1",
    failureStage: "model_scope",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    toolCallId: "spawn-bad-model",
    requestedRoleId: "explorer",
    roleId: "explorer",
    reason: "Selected model is not eligible for sub-agent runs (custom/unregistered-model): Model is not registered in this Ambient Desktop build.",
    modelScope: {
      schemaVersion: "ambient-subagent-model-scope-v1",
      source: "caller_override",
      requestedModelId: "custom/unregistered-model",
      roleDefaultModelId: "local/text-4b",
      selectedModelId: "custom/unregistered-model",
      profile: {
        profileId: "unknown:custom/unregistered-model",
        providerId: "unknown",
        modelId: "custom/unregistered-model",
        label: "Unknown model",
        locality: "cloud",
        toolUse: "none",
        structuredOutput: "none",
        available: false,
        selectableAsSubagent: false,
        supportsStreaming: false,
        unavailableReason: "Model is not registered in this Ambient Desktop build.",
      },
      warnings: [],
      blockingReasons: [
        "Model is not registered in this Ambient Desktop build.",
        "Model custom/unregistered-model is not selectable for sub-agent delegation.",
        "Model custom/unregistered-model does not support required sub-agent streaming.",
      ],
      candidateDiagnostics: [
        {
          schemaVersion: "ambient-subagent-model-scope-candidate-v1",
          source: "caller_override",
          modelId: "custom/unregistered-model",
          profileId: "unknown:custom/unregistered-model",
          providerId: "unknown",
          label: "Unknown model",
          selected: true,
          eligible: false,
          locality: "cloud",
          toolUse: "none",
          structuredOutput: "none",
          selectableAsSubagent: false,
          supportsStreaming: false,
          available: false,
          unavailableReason: "Model is not registered in this Ambient Desktop build.",
          capabilityDiagnostics: [
            {
              capability: "availability",
              status: "fail",
              required: "registered and available runtime profile",
              actual: "unavailable",
              reason: "Model is not registered in this Ambient Desktop build.",
            },
          ],
          blockingReasons: ["Model is not registered in this Ambient Desktop build."],
        },
      ],
    },
  };
}

function barrierDecisionArtifact(input: {
  decision: "continue_with_partial" | "retry_child" | "detach_child" | "cancel_parent" | "fail_parent";
  userDecision?: string;
  partialSummary?: string;
  retryRequestedRunIds?: string[];
  retryAcceptedRunIds?: string[];
  retryMailboxEventIds?: string[];
  detachedRunIds?: string[];
  cancelledRunIds?: string[];
  stoppedChildRunIds?: string[];
  unchangedRunIds?: string[];
  cancelledWaitBarrierIds?: string[];
  cancelledMailboxEventIds?: string[];
  parentCancellationRequested?: boolean;
}): NonNullable<SubagentWaitBarrierSummary["resolutionArtifact"]> {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
    childRunIds: ["run-1"],
    childStatuses: [{ childRunId: "run-1", status: "failed" }],
    synthesisAllowed: input.decision === "continue_with_partial",
    explicitPartial: input.decision === "continue_with_partial",
    resultArtifact: null,
    ...(input.retryRequestedRunIds?.length ? { retryRequestedRunIds: input.retryRequestedRunIds } : {}),
    ...(input.retryAcceptedRunIds?.length ? { retryAcceptedRunIds: input.retryAcceptedRunIds } : {}),
    ...(input.retryMailboxEventIds?.length ? { retryMailboxEventIds: input.retryMailboxEventIds } : {}),
    ...(input.detachedRunIds?.length ? { detachedRunIds: input.detachedRunIds } : {}),
    ...(input.cancelledRunIds?.length ? { cancelledRunIds: input.cancelledRunIds } : {}),
    ...(input.stoppedChildRunIds?.length ? { stoppedChildRunIds: input.stoppedChildRunIds } : {}),
    ...(input.unchangedRunIds?.length ? { unchangedRunIds: input.unchangedRunIds } : {}),
    ...(input.cancelledWaitBarrierIds?.length ? { cancelledWaitBarrierIds: input.cancelledWaitBarrierIds } : {}),
    ...(input.cancelledMailboxEventIds?.length ? { cancelledMailboxEventIds: input.cancelledMailboxEventIds } : {}),
    ...(input.parentCancellationRequested ? { parentCancellationRequested: true } : {}),
    userDecision: {
      schemaVersion: "ambient-subagent-user-decision-v1",
      decision: input.decision,
      userDecision: input.userDecision ?? null,
      partialSummary: input.partialSummary ?? null,
      decidedAt: "2026-06-05T00:01:00.000Z",
      toolCallId: "tool-call-1",
      idempotencyKey: "barrier-decision:test",
    },
  };
}

function barrierChildToneForTest(status: SubagentRunSummary["status"]) {
  if (status === "running" || status === "starting") return "active";
  if (status === "reserved") return "warning";
  if (status === "completed") return "success";
  if (status === "failed" || status === "stopped" || status === "cancelled") return "danger";
  return "neutral";
}

function modelRuntimeSnapshot(): AmbientModelRuntimeSnapshot {
  return {
    schemaVersion: "ambient-model-runtime-snapshot-v1",
    resolvedAt: "2026-06-05T00:00:00.000Z",
    requestedModelId: "local/text-4b",
    profile: {
      schemaVersion: "ambient-model-runtime-profile-v1",
      profileId: "local:local/text-4b:startup",
      providerId: "local",
      modelId: "local/text-4b",
      label: "Local Text startup runtime",
      selectableAsMain: false,
      selectableAsSubagent: true,
      available: true,
      contextWindowTokens: 8192,
      maxOutputTokens: 2048,
      supportsStreaming: true,
      toolUse: "none",
      structuredOutput: "none",
      supportsVision: false,
      supportsAudio: false,
      locality: "local",
      costClass: "local",
      trustClass: "local-user-managed",
      privacyLabel: "Local user-managed text runtime",
      memoryClass: "small-local",
      providerQuirks: [],
    },
  };
}
