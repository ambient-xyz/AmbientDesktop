import { describe, expect, it } from "vitest";
import { buildPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import { CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON } from "../../shared/callableWorkflowTaskGuards";
import { subagentParentClusterModelsByMessageId } from "./subagentParentClusterUiModel";
import {
  barrier,
  callableWorkflowBlockingPayload,
  callableWorkflowLaunchCard,
  callableWorkflowTask,
  parentMailboxEvent,
  run,
  thread,
} from "./subagentParentClusterUiModelTestSupport";

describe("subagent parent cluster callable workflow UI model", () => {
  it("creates a parent cluster for anchored blocking workflow tasks without child runs", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [
        parentMailboxEvent({
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
        }),
      ],
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
          detail:
            "Parent final answer blocked because blocking callable workflow work is not safe for synthesis. | Choices: Wait again, Cancel parent run",
        },
      ],
    });
  });

  it("surfaces failed blocking workflow tasks as needs-attention mailbox activity", () => {
    const clusters = subagentParentClusterModelsByMessageId(
      [],
      [],
      [],
      [
        parentMailboxEvent({
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
        }),
      ],
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
      [
        parentMailboxEvent({
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
        }),
      ],
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
      [
        callableWorkflowTask({
          title: "Symphony Map-Reduce",
          sourceKind: "symphony_recipe",
          status: "queued",
          statusLabel: "Queued",
          blocking: true,
        }),
      ],
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
        thread({
          id: "mapper-thread-1",
          title: "Mapper 1 live",
          childOrder: 1,
          lastMessagePreview: "Mapper finished with extracted evidence.",
        }),
        thread({ id: "reducer-thread-1", title: "Reducer live", childOrder: 2, lastMessagePreview: "Reducer needs approval." }),
      ],
      [],
      [],
      [
        callableWorkflowTask({
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
        }),
      ],
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
      [
        callableWorkflowTask({
          launchCard: callableWorkflowLaunchCard(),
        }),
      ],
    );

    expect(clusters.get("message-1")?.workflowTasks[0]).toMatchObject({
      id: "callable-task-1",
      launchCardLabels: ["Risk: High", "Up to 12 agents", "Budget: 180,000 tokens", "Confirmation required", "Small slice recommended"],
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
      [
        callableWorkflowTask({
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
        }),
      ],
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
      detail: expect.stringContaining("Provenance: sub-agent child / thread child-thread-1 / run child-run-1 / path root/0:implementer"),
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
      [
        callableWorkflowTask({
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
        }),
      ],
    );

    expect(clusters.get("message-1")?.workflowTasks[0]).toMatchObject({
      status: "Succeeded",
      modeLabel: "Background",
      idLabels: ["Task: callable-task-1", "Artifact: workflow-artifact-1", "Run: workflow-run-1", "Thread: workflow-thread-1"],
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
      [
        callableWorkflowTask({
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
        }),
      ],
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
          detail:
            "Runner: workflowCompilerService / State: Workflow run started / Thread: workflow-thread-1 / Artifact: workflow-artifact-1 / Run: workflow-run-1",
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
          detail:
            "Runner: workflowCompilerService / State: Workflow run needs input / Artifact: workflow-artifact-2 / Run: workflow-run-input",
        }),
        expect.objectContaining({
          id: "callable-task-child-wait",
          progressLabel: "Child wait needs attention",
          canResume: true,
          canPause: false,
          canCancel: true,
          detail:
            "Runner: workflowCompilerService / State: Symphony Child Wait Needs Attention / Error: Symphony children are not synthesis-safe.",
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
      [
        barrier({
          id: "symphony-child-wait",
          childRunIds: ["drafter-run", "verifier-run"],
          ownerKind: "callable_workflow_symphony_launch_bridge",
          ownerId: "callable-task-child-wait",
          status: "failed",
          timeoutMs: 600_000,
        }),
      ],
      [],
      [
        callableWorkflowTask({
          id: "callable-task-child-wait",
          title: "Symphony Imitate and Verify",
          toolName: "ambient_workflow_symphony_imitate_and_verify",
          status: "paused",
          statusLabel: "Child wait needs attention",
          blocking: false,
          runnerDeferredReason: CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
          errorMessage: "Symphony children are not synthesis-safe.",
        }),
      ],
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
      [
        callableWorkflowTask({
          id: "callable-task-failed",
          title: "Recorded deploy workflow",
          sourceKind: "recorded_workflow",
          status: "failed",
          statusLabel: "Failed",
          blocking: false,
          runnerDeferredReason: "failed",
          errorMessage: "Workflow verifier failed.",
        }),
      ],
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
});
