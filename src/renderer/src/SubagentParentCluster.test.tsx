import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SubagentParentCluster } from "./SubagentParentCluster";
import { subagentParentClusterFixtureModel } from "./SubagentParentCluster.fixture";
import { buildPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import { subagentPatternGraphRendererModel } from "./subagentPatternGraphUiModel";

describe("SubagentParentCluster", () => {
  it("renders production-visible child, barrier, workflow, provenance, and action surfaces", () => {
    const markup = renderToStaticMarkup(
      <SubagentParentCluster
        model={subagentParentClusterFixtureModel()}
        onOpenThread={vi.fn()}
        onCancelChild={vi.fn()}
        onCloseChild={vi.fn()}
        onOpenWorkflowThread={vi.fn()}
        onPauseWorkflowTask={vi.fn()}
        onResumeWorkflowTask={vi.fn()}
        onCancelWorkflowTask={vi.fn()}
        onResolveBarrierAction={vi.fn()}
        onResolveApprovalAction={vi.fn()}
        renderChildTranscript={(child) => (
          <div className="subagent-parent-cluster-child-transcript-live" data-child-message-count="1" data-child-runtime-event-count="2">
            <div className="subagent-parent-cluster-child-mini-thread-header">
              <div className="subagent-parent-cluster-child-mini-thread-title">
                <span className="subagent-parent-cluster-child-transcript-live-status tone-warning">Live</span>
                <strong>Child thread</strong>
                <span>{child.title}</span>
              </div>
              {child.canOpenThread && (
                <button type="button" className="subagent-parent-cluster-child-open-full-thread" aria-label={`Open full child thread ${child.title}`}>
                  Open full thread
                </button>
              )}
            </div>
            <div className="subagent-parent-cluster-child-transcript-live-header">
              <span>1 message</span>
              <span>2 runtime events</span>
            </div>
            <div className="subagent-parent-cluster-child-transcript-stream">
              <div className="test-child-transcript">Live transcript for {child.title}</div>
            </div>
            <div className="subagent-parent-cluster-child-runtime-events">
              <div className="subagent-parent-cluster-child-runtime-events-title">
                <strong>Runtime timeline</strong>
                <span>2 events</span>
              </div>
              <div className="subagent-parent-cluster-child-runtime-event tone-active">
                <span>Session Started</span>
                <small>Child Pi session is running in the visible child thread.</small>
              </div>
            </div>
            <div className="subagent-parent-cluster-child-transcript-live-marker tone-warning">
              <strong>Child is paused for parent action</strong>
              <span>Resolve the child request in the parent context.</span>
            </div>
          </div>
        )}
        pauseWorkflowTaskBusyId="workflow-task-1"
        approvalActionBusyId="child-run-1:approval-1"
      />,
    );

    expect(markup).toContain("class=\"subagent-parent-cluster\"");
    expect(markup).not.toContain("<details class=\"subagent-parent-cluster\" open");
    const childDetails = [...markup.matchAll(/<details class="subagent-parent-cluster-child-thread[^>]*>/g)].map((match) => match[0]);
    const reviewerDetails = childDetails.find((details) => details.includes("data-child-run-id=\"child-run-1\""));
    const summarizerDetails = childDetails.find((details) => details.includes("data-child-run-id=\"child-run-2\""));
    expect(reviewerDetails).toContain("open=\"\"");
    expect(reviewerDetails).toContain("data-child-default-expanded=\"true\"");
    expect(summarizerDetails).not.toContain("open=\"\"");
    expect(summarizerDetails).toContain("data-child-default-expanded=\"false\"");
    expect(markup.indexOf("class=\"subagent-parent-cluster-list\"")).toBeLessThan(
      markup.indexOf("class=\"subagent-parent-cluster-pattern-graphs\""),
    );
    expect(markup.indexOf("class=\"subagent-parent-cluster-child-transcript-live\"")).toBeLessThan(
      markup.indexOf("class=\"subagent-parent-cluster-pattern-graphs\""),
    );
    expect(markup).toContain("Parent waiting on sub-agents");
    expect(markup).toContain("2 children - 1 pattern graph - 1 workflow task - 1 blocking child");
    expect(markup).toContain("aria-label=\"Parent blocking child threads\"");
    expect(markup).toContain("Parent blocked on 1 child: approval needed");
    expect(markup).toContain("class=\"subagent-parent-cluster-parent-blocking-child tone-warning\"");
    expect(markup).toContain("Reviewer: approval");

    expect(markup).toContain("aria-label=\"Sub-agent wait barriers\"");
    expect(markup).toContain("class=\"subagent-parent-cluster-barrier-child tone-warning\"");
    expect(markup).toContain("Blocking child: reviewer");
    expect(markup).toContain("class=\"subagent-parent-cluster-lifecycle-effect tone-neutral\"");
    expect(markup).toContain("Unchanged 1 child");

    expect(markup).toContain("aria-label=\"Sub-agent pattern graphs\"");
    expect(markup).toContain("Imitate and Verify child thread pattern graph");
    expect(markup).toContain("Open Verifier thread from Imitate and Verify");
    expect(markup).toContain("Verifier: blocks parent / Approval needed");
    expect(markup).toContain("class=\"subagent-pattern-graph-node tone-warning blocking-parent can-open\"");
    expect(markup).toContain("role=\"button\"");
    expect(markup).toContain("tabindex=\"0\"");
    expect(markup).toContain("focusable=\"true\"");
    expect(markup).toContain("aria-keyshortcuts=\"Enter Space\"");
    expect(markup).toContain("data-keyboard-openable=\"true\"");
    expect(markup).toContain("data-node-badges=\"blocking,approval\"");
    expect(markup).toContain("data-approval-id=\"approval-1\"");
    expect(markup).toContain("data-approval-child-run-id=\"child-run-1\"");
    expect(markup).toContain("data-approval-child-thread-id=\"child-thread-1\"");
    expect(markup).toContain("data-approval-busy=\"true\"");
    expect(markup).toContain("data-edge-status=\"Approval Needed\"");
    expect(markup).toContain("data-blocking-parent=\"true\"");
    expect(markup).toContain("data-badge-key=\"approval\"");
    expect(markup).toContain(">Approval</text>");

    expect(markup).toContain("aria-label=\"Callable workflow background tasks\"");
    expect(markup).toContain("class=\"subagent-parent-cluster-workflow-launch-card\"");
    expect(markup).toContain("Risk: High");
    expect(markup).toContain("class=\"subagent-parent-cluster-workflow-provenance\"");
    expect(markup).toContain("Caller: sub-agent child");
    expect(markup).toContain("Approval: Child Bridge Policy");
    expect(markup).toContain("Worktree: isolated");
    expect(markup).toContain("Nested fanout: Child Bridge Policy");
    expect(markup).toContain("title=\"Pausing workflow task\"");
    expect(markup).toContain("aria-label=\"Open workflow thread for Imitate &amp; Verify\"");
    expect(markup).toContain("aria-label=\"Cancel workflow task Imitate &amp; Verify\"");

    expect(markup).toContain("aria-label=\"Sub-agent mailbox activity\"");
    expect(markup).toContain("class=\"subagent-parent-cluster-mailbox-action is-button is-approve\"");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("Approve child");
    expect(markup).toContain("Retry barrier");
    expect(markup).toContain("class=\"subagent-parent-cluster-lifecycle-effect tone-danger\"");
    expect(markup).toContain("Cancelled 1 child");
    expect(markup).toContain("Parent cancellation requested");

    expect(markup).toContain("class=\"subagent-parent-cluster-child-row\"");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-thread\"");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-thread is-retained\"");
    expect(markup).toContain("aria-label=\"Parent blocker for Reviewer\"");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-blocker-panel tone-warning\"");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-transcript-heading\"");
    expect(markup).toContain("Child transcript");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-transcript-live\"");
    expect(markup).toContain("Child thread");
    expect(markup).toContain("Open full thread");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-transcript-stream\"");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-runtime-events\"");
    expect(markup).toContain("Runtime timeline");
    expect(markup).toContain("approval-1");
    expect(markup).toContain("Live transcript for Reviewer");
    expect(markup).toContain("Live transcript for Summarizer");
    expect(markup).toContain("aria-label=\"Open child thread Reviewer\"");
    expect(markup).not.toContain("aria-label=\"Open child thread Summarizer\"");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-blocker tone-warning\"");
    expect(markup).toContain("Blocking: approval");
    expect(markup).toContain("Summary retained");
    expect(markup).toContain("Full transcript is retained until cleanup.");
    expect(markup).toContain("aria-label=\"Cancel sub-agent Reviewer\"");
    expect(markup).toContain("aria-label=\"Close sub-agent Summarizer\"");
    expect(occurrences(markup, "class=\"subagent-parent-cluster-child-transcript-heading\"")).toBe(2);
    expect(markup.indexOf("class=\"subagent-parent-cluster-child-transcript-live\"")).toBeLessThan(
      markup.indexOf("class=\"subagent-parent-cluster-child-blocker-panel tone-warning\""),
    );
  });

  it("renders approval graph badges as parent-scoped approval controls when available", () => {
    const markup = renderToStaticMarkup(
      <SubagentParentCluster
        model={subagentParentClusterFixtureModel()}
        onOpenThread={vi.fn()}
        onCancelChild={vi.fn()}
        onCloseChild={vi.fn()}
        onOpenWorkflowThread={vi.fn()}
        onPauseWorkflowTask={vi.fn()}
        onResumeWorkflowTask={vi.fn()}
        onCancelWorkflowTask={vi.fn()}
        onResolveBarrierAction={vi.fn()}
        onResolveApprovalAction={vi.fn()}
      />,
    );

    expect(markup).toContain("class=\"node-badge tone-warning can-open-approval\"");
    expect(markup).toContain("class=\"node-badge tone-warning can-open-approval\" role=\"button\"");
    expect(markup).toContain("aria-label=\"Open approval request approval-1 for Verifier from Imitate and Verify\"");
    expect(markup).toContain("aria-keyshortcuts=\"Enter Space\"");
    expect(markup).toContain("data-approval-openable=\"true\"");
    expect(markup).toContain("data-approval-busy=\"false\"");
    expect(markup).toContain("data-approval-child-run-id=\"child-run-1\"");
    expect(markup).toContain("data-approval-child-thread-id=\"child-thread-1\"");
  });

  it("keeps non-blocking completed children collapsed by default", () => {
    const model = subagentParentClusterFixtureModel();
    model.parentBlocking = undefined;
    model.children = model.children.map((child) => ({
      ...child,
      parentBlocker: undefined,
      runStatus: "completed",
      status: "Completed",
      statusTone: "success",
      isTerminal: true,
      isSynthesisSafe: true,
    }));

    const markup = renderToStaticMarkup(
      <SubagentParentCluster
        model={model}
        onOpenThread={vi.fn()}
        onCancelChild={vi.fn()}
        onCloseChild={vi.fn()}
        onOpenWorkflowThread={vi.fn()}
        onPauseWorkflowTask={vi.fn()}
        onResumeWorkflowTask={vi.fn()}
        onCancelWorkflowTask={vi.fn()}
        onResolveBarrierAction={vi.fn()}
        onResolveApprovalAction={vi.fn()}
      />,
    );

    const childDetails = [...markup.matchAll(/<details class="subagent-parent-cluster-child-thread[^>]*>/g)].map((match) => match[0]);
    expect(childDetails.length).toBe(2);
    expect(childDetails.every((details) => !details.includes("open=\"\""))).toBe(true);
    expect(childDetails.every((details) => details.includes("data-child-default-expanded=\"false\""))).toBe(true);
  });

  it("renders barrier recovery actions inside the expanded child blocker panel", () => {
    const model = subagentParentClusterFixtureModel();
    model.children[0] = {
      ...model.children[0]!,
      parentBlocker: {
        kind: "attention",
        label: "Blocking: child failed",
        detail: "Required child failed before producing a synthesis-safe result.",
        statusTone: "danger",
        metaLabels: ["Child: Reviewer", "Path: root/0:reviewer", "Status: Failed"],
      },
    };
    model.mailboxActivities[0] = {
      ...model.mailboxActivities[0]!,
      approvalActions: [],
      actions: [{
        label: "Retry child",
        title: "Retry child: resolve wait barrier barrier-1 with Retry requested",
        waitBarrierId: "barrier-1",
        decision: "retry_child",
        requiresUserDecision: false,
        requiresPartialSummary: false,
        childRunIds: ["child-run-1"],
      }],
      actionLabels: ["Retry child"],
    };

    const markup = renderToStaticMarkup(
      <SubagentParentCluster
        model={model}
        onOpenThread={vi.fn()}
        onCancelChild={vi.fn()}
        onCloseChild={vi.fn()}
        onOpenWorkflowThread={vi.fn()}
        onPauseWorkflowTask={vi.fn()}
        onResumeWorkflowTask={vi.fn()}
        onCancelWorkflowTask={vi.fn()}
        onResolveBarrierAction={vi.fn()}
        onResolveApprovalAction={vi.fn()}
      />,
    );

    expect(markup).toContain("aria-label=\"Parent blocker for Reviewer\"");
    expect(markup).toContain("Blocking: child failed");
    expect(markup).toContain("title=\"Retry child: resolve wait barrier barrier-1 with Retry requested\"");
    expect(occurrences(markup, ">Retry child</button>")).toBe(2);
  });

  it("deduplicates replayed barrier actions inside the expanded child blocker panel", () => {
    const model = subagentParentClusterFixtureModel();
    const retryAction = {
      label: "Retry child",
      title: "Retry child: resolve wait barrier barrier-1 with Retry requested",
      waitBarrierId: "barrier-1",
      decision: "retry_child" as const,
      requiresUserDecision: false,
      requiresPartialSummary: false,
      childRunIds: ["child-run-1"],
    };
    model.children[0] = {
      ...model.children[0]!,
      parentBlocker: {
        kind: "attention",
        label: "Blocking: child failed",
        detail: "Required child failed before producing a synthesis-safe result.",
        statusTone: "danger",
        metaLabels: ["Child: Reviewer", "Path: root/0:reviewer", "Status: Failed"],
      },
    };
    model.mailboxActivities = [
      {
        ...model.mailboxActivities[0]!,
        id: "mailbox-replay-1",
        approvalActions: [],
        actions: [retryAction],
        actionLabels: ["Retry child"],
      },
      {
        ...model.mailboxActivities[0]!,
        id: "mailbox-replay-2",
        approvalActions: [],
        actions: [{ ...retryAction }],
        actionLabels: ["Retry child"],
      },
    ];

    const markup = renderToStaticMarkup(
      <SubagentParentCluster
        model={model}
        onOpenThread={vi.fn()}
        onCancelChild={vi.fn()}
        onCloseChild={vi.fn()}
        onOpenWorkflowThread={vi.fn()}
        onPauseWorkflowTask={vi.fn()}
        onResumeWorkflowTask={vi.fn()}
        onCancelWorkflowTask={vi.fn()}
        onResolveBarrierAction={vi.fn()}
        onResolveApprovalAction={vi.fn()}
      />,
    );

    expect(markup).toContain("aria-label=\"Parent blocker for Reviewer\"");
    expect(occurrences(markup, ">Retry child</button>")).toBe(3);
  });

  it("renders grouped fanout overflow nodes as collapsed accessible expanders", () => {
    const model = {
      ...subagentParentClusterFixtureModel(),
      patternGraphs: [
        subagentPatternGraphRendererModel(buildPatternGraphSnapshot({
          patternId: "map_reduce",
          parentThreadId: "parent-thread-1",
          parentMessageId: "message-1",
          updatedAt: "2026-06-13T00:00:00.000Z",
          maxVisibleChildrenPerRole: 1,
          childBindings: [
            {
              roleNodeId: "mapper",
              childRunId: "child-run-1",
              childThreadId: "child-thread-1",
              label: "Visible mapper",
              status: "running",
              blockingParent: true,
            },
            {
              roleNodeId: "mapper",
              childRunId: "child-run-hidden",
              childThreadId: "child-thread-hidden",
              label: "Hidden mapper",
              status: "completed",
              blockingParent: false,
              summary: "Hidden mapper preserved for overflow expansion.",
            },
            {
              roleNodeId: "reducer",
              childRunId: "child-run-2",
              childThreadId: "child-thread-2",
              label: "Reducer",
              status: "completed",
              blockingParent: false,
            },
          ],
        })),
      ],
    };

    const markup = renderToStaticMarkup(
      <SubagentParentCluster
        model={model}
        onOpenThread={vi.fn()}
        onCancelChild={vi.fn()}
        onCloseChild={vi.fn()}
        onOpenWorkflowThread={vi.fn()}
        onPauseWorkflowTask={vi.fn()}
        onResumeWorkflowTask={vi.fn()}
        onCancelWorkflowTask={vi.fn()}
        onResolveBarrierAction={vi.fn()}
        onResolveApprovalAction={vi.fn()}
      />,
    );

    expect(markup).toContain("Map-Reduce child thread pattern graph");
    expect(markup).toContain("data-graph-node-id=\"mapper:overflow\"");
    expect(markup).toContain("data-overflow-expandable=\"true\"");
    expect(markup).toContain("data-overflow-expanded=\"false\"");
    expect(markup).toContain("data-overflow-count=\"1\"");
    expect(markup).toContain("aria-expanded=\"false\"");
    expect(markup).toContain("aria-label=\"Expand 1 grouped from Map-Reduce\"");
    expect(markup).toContain("role=\"button\"");
    expect(markup).toContain("data-keyboard-openable=\"true\"");
    expect(markup).not.toContain("class=\"subagent-pattern-graph-overflow-panel");
  });
});

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
