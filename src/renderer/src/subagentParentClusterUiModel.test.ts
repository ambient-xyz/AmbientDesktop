import { describe, expect, it } from "vitest";
import { subagentParentClusterModelsByMessageId } from "./subagentParentClusterUiModel";
import {
  barrier,
  parentMailboxEvent,
  run,
  spawnFailurePayload,
  thread,
  waitBarrierDecisionPayload,
} from "./subagentParentClusterUiModelTestSupport";

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
        run({
          id: "run-attention",
          childThreadId: "child-attention",
          status: "needs_attention",
          canonicalTaskPath: "root/attention:worker",
        }),
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
          retentionTitle:
            "Sub-agent root/archived:summarizer transcript was collapsed by retention; result metadata and artifacts remain available.",
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
    const clusters = subagentParentClusterModelsByMessageId([run({ dependencyMode: "supervisor_attention" })], [thread({ id: "child-1" })]);

    expect(clusters.get("message-1")).toMatchObject({
      summary: "1 child · 1 attention",
      children: [{ dependencyLabel: "Needs attention" }],
    });
  });

  it("surfaces wait-barrier attention from parent mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [
        parentMailboxEvent({
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
              {
                id: "continue_with_partial",
                label: "Continue with partial",
                toolAction: "resolve_barrier",
                decision: "continue_with_partial",
              },
              { id: "retry_child", label: "Retry child", toolAction: "resolve_barrier", decision: "retry_child" },
              { id: "detach_child", label: "Detach child", toolAction: "resolve_barrier", decision: "detach_child" },
              { id: "cancel_parent", label: "Cancel parent run", toolAction: "resolve_barrier", decision: "cancel_parent" },
            ],
          },
        }),
      ],
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
          actionLabels: ["Continue with partial", "Retry child", "Detach child", "Cancel parent run"],
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
          detail:
            "Child wait timed out before producing a synthesis-safe result. | Choices: Continue with partial, Retry child, Detach child, Cancel parent run",
        },
      ],
    });
  });

  it("surfaces Symphony decision request labels on wait-barrier attention cards", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [
        parentMailboxEvent({
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
            allowedUserChoices: [{ id: "retry_child", label: "Retry child", toolAction: "resolve_barrier", decision: "retry_child" }],
          },
        }),
      ],
    );

    expect(clusters.get("message-1")?.mailboxActivities[0]).toMatchObject({
      label: "Barrier attention",
      detail: expect.stringContaining(
        "Symphony options: Grant or re-scope child authority (recommended), Retry child, Accept partial, Cancel group, Exit Symphony",
      ),
      actionLabels: ["Retry child", "Grant or re-scope child authority (recommended)", "Accept partial", "Cancel group", "Exit Symphony"],
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
      [
        barrier({
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
              reason:
                "required_all barrier cannot reach 2 synthesis-safe child results; 1 child result is terminal and unsafe for synthesis.",
            },
          },
        }),
      ],
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
            detail: expect.stringContaining(
              "Failed / Failed / long_context_process failed / Required all / Ask user on failure / 30s timeout",
            ),
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
      [
        run({
          status: "completed",
          updatedAt: "2026-06-05T00:01:30.000Z",
        }),
      ],
      [
        thread({
          id: "child-1",
          title: "Workspace writer",
          lastMessagePreview: "Implementation completed",
        }),
      ],
      [],
      [
        parentMailboxEvent({
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
        }),
      ],
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
            detail: expect.stringContaining(
              "Completion guard blocked / Mutation evidence: structured 1 / Ambient 1 / isolated worktree 1 / approval 0 / Missing approval provenance.",
            ),
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
          detail: expect.stringContaining(
            "Completion guard blocked / Mutation evidence: structured 1 / Ambient 1 / isolated worktree 1 / approval 0 / Missing approval provenance.",
          ),
        },
      ],
    });
  });

  it("leaves non-resolution wait-barrier choices visible but not clickable", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [
        parentMailboxEvent({
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
        }),
      ],
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
      [
        parentMailboxEvent({
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
        }),
      ],
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
              {
                id: "continue_with_partial",
                label: "Continue with partial",
                toolAction: "resolve_barrier",
                decision: "continue_with_partial",
              },
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
    expect(clusters.get("message-1")?.mailboxActivities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "timeout-attention", label: "Barrier attention" }),
        expect.objectContaining({ id: "retry-decision", summary: "Retry accepted / Waiting On Children" }),
        expect.objectContaining({ id: "restart-interruption", label: "Child interrupted" }),
      ]),
    );
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
          detail:
            "Approve writes for this child only. | Always defaulted to this child thread. | Parent returned to waiting on this child.",
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
          detail:
            "Cancel the parent instead of waiting. | Cancelled 1 child / Stopped 1 child / Unchanged 1 child / 1 wait barrier cancelled / Parent cancellation requested / 2 pending mailbox events cancelled",
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
          detail:
            "Keep the child running separately. | Detached 1 child / Unchanged 1 child / 1 wait barrier cancelled / 1 pending mailbox event cancelled",
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
      [
        parentMailboxEvent({
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
        }),
      ],
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
      [
        parentMailboxEvent({
          type: "subagent.grouped_completion",
          payload: {
            schemaVersion: "ambient-subagent-grouped-completion-v1",
            notificationCount: 2,
            childRuns: [
              { runId: "run-1", roleId: "worker", status: "completed" },
              { runId: "run-2", roleId: "reviewer", status: "completed" },
            ],
          },
        }),
      ],
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
      [
        parentMailboxEvent({
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
        }),
      ],
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
      [
        parentMailboxEvent({
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
        }),
      ],
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
      [
        parentMailboxEvent({
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
        }),
      ],
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
      [
        parentMailboxEvent({
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
        }),
      ],
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
      [
        parentMailboxEvent({
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
        }),
      ],
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

  it("surfaces spawn-failure model diagnostics from parent mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "completed" })],
      [thread({ id: "child-1" })],
      [],
      [
        parentMailboxEvent({
          type: "subagent.spawn_failed",
          payload: {
            schemaVersion: "ambient-subagent-spawn-failure-v1",
            failureStage: "model_scope",
            parentThreadId: "parent-1",
            parentRunId: "parent-run-1",
            toolCallId: "spawn-bad-model",
            requestedRoleId: "explorer",
            roleId: "explorer",
            reason:
              "Selected model is not eligible for sub-agent runs (custom/unregistered-model): Model is not registered in this Ambient Desktop build.",
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
        }),
      ],
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
          detail:
            "Selected model is not eligible for sub-agent runs (custom/unregistered-model): Model is not registered in this Ambient Desktop build. | Model blockers: Model is not registered in this Ambient Desktop build.; Model custom/unregistered-mod...",
        },
      ],
    });
  });

  it("surfaces tool-scope approval-unavailable details from parent mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [run({ status: "failed" })],
      [thread({ id: "child-1" })],
      [],
      [
        parentMailboxEvent({
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
        }),
      ],
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
      [
        parentMailboxEvent({
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
        }),
      ],
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
      [
        parentMailboxEvent({
          parentMessageId: "message-1",
          type: "subagent.spawn_failed",
          payload: spawnFailurePayload(),
        }),
      ],
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
