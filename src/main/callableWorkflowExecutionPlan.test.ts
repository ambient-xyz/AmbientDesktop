import { describe, expect, it } from "vitest";
import { resolveAmbientFeatureFlags } from "../shared/featureFlags";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  parentPiVisibleCallableWorkflowTools,
} from "./callableWorkflowRegistry";
import {
  CALLABLE_WORKFLOW_EXECUTION_PLAN_SCHEMA_VERSION,
  buildCallableWorkflowExecutionPlan,
} from "./callableWorkflowExecutionPlan";

describe("callable workflow execution plan", () => {
  it("creates a visible queued background-task handoff with blocking and cancel metadata", () => {
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    });
    const tool = parentPiVisibleCallableWorkflowTools(registry)[0]!;
    const runPlan = buildCallableWorkflowRunPlan(tool, {
      goal: "Summarize release notes",
      blocking: true,
      metricCriteria: mapReduceMetricCriteria(),
    });
    const executionPlan = buildCallableWorkflowExecutionPlan({
      descriptor: tool,
      runPlan,
      parent: {
        threadId: "parent-thread",
        runId: "parent-run",
        assistantMessageId: "assistant-message",
      },
      callerProvenance: {
        kind: "parent_thread",
        threadId: "parent-thread",
        runId: "parent-run",
        messageId: "assistant-message",
        approval: {
          required: true,
          source: "launch_card",
          failureHandling: "Denied, unavailable, or non-interactive approvals leave the workflow blocked or needing attention; the parent must not synthesize it as complete.",
          scopeHint: "parent_thread",
        },
        worktree: {
          required: false,
          isolated: false,
          status: "unavailable",
        },
        nestedFanout: {
          required: false,
          source: "parent_policy",
        },
      },
      toolCallId: "tool-call-1",
      createdAt: "2026-06-06T18:00:00.000Z",
    });

    expect(executionPlan).toMatchObject({
      schemaVersion: CALLABLE_WORKFLOW_EXECUTION_PLAN_SCHEMA_VERSION,
      launchId: expect.stringMatching(/^callable-workflow:[a-f0-9]{20}$/),
      status: "queued_not_started",
      parent: {
        threadId: "parent-thread",
        runId: "parent-run",
        assistantMessageId: "assistant-message",
      },
      toolCallId: "tool-call-1",
      workflowRunPlan: {
        toolName: "ambient_workflow_symphony_map_reduce",
        blocking: true,
        sourceContext: {
          kind: "symphony_recipe",
          recipeId: "map_reduce",
          summary: expect.stringContaining("Fan out"),
        },
        launchCard: {
          schemaVersion: "ambient-callable-workflow-launch-card-v1",
          riskLevel: "high",
          estimatedAgents: 12,
          requireConfirmation: true,
        },
      },
      visibleTask: {
        kind: "callable_workflow_background_task",
        title: "Symphony Map-Reduce",
        statusLabel: "Queued",
        defaultCollapsed: true,
        blocking: true,
        progressVisible: true,
        tokenCostTracking: true,
        pauseResumeCancel: true,
        cancelHandle: expect.stringMatching(/^callable-workflow-cancel:callable-workflow:[a-f0-9]{20}$/),
        launchCard: {
          title: "Symphony Map-Reduce",
          blocking: true,
          smallSliceRecommended: true,
        },
      },
      runnerHandoff: {
        target: "workflowCompilerService",
        deferredReason: "callable_workflow_runner_not_connected",
        requiredBeforeStart: [
          "compile_callable_workflow_to_artifact",
          "persist_workflow_run",
          "emit_workflow_run_started",
        ],
      },
    });
  });

  it("preserves child caller provenance for runner handoff and approval/worktree evidence", () => {
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    });
    const tool = parentPiVisibleCallableWorkflowTools(registry)[0]!;
    const runPlan = buildCallableWorkflowRunPlan(tool, {
      goal: "Summarize child findings",
      blocking: true,
      metricCriteria: mapReduceMetricCriteria(),
    });
    const executionPlan = buildCallableWorkflowExecutionPlan({
      descriptor: tool,
      runPlan,
      parent: {
        threadId: "child-thread",
        runId: "child-run",
        assistantMessageId: "child-message",
      },
      callerProvenance: {
        kind: "subagent_child_thread",
        threadId: "child-thread",
        runId: "child-run",
        messageId: "child-message",
        subagentRunId: "subagent-run",
        canonicalTaskPath: "parent/1",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        approval: {
          required: true,
          source: "child_bridge_policy",
          failureHandling: "forward to parent",
          scopeHint: "this_child_thread",
        },
        worktree: {
          required: true,
          isolated: true,
          status: "active",
          workspacePath: "/tmp/worktree",
          worktreePath: "/tmp/worktree",
          branchName: "ambient/child",
        },
        nestedFanout: {
          required: true,
          source: "child_bridge_policy",
        },
      },
      toolCallId: "child-tool-call",
      createdAt: "2026-06-06T18:01:00.000Z",
    });

    expect(executionPlan.callerProvenance).toEqual({
      kind: "subagent_child_thread",
      threadId: "child-thread",
      runId: "child-run",
      messageId: "child-message",
      subagentRunId: "subagent-run",
      canonicalTaskPath: "parent/1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      approval: {
        required: true,
        source: "child_bridge_policy",
        failureHandling: "forward to parent",
        scopeHint: "this_child_thread",
      },
      worktree: {
        required: true,
        isolated: true,
        status: "active",
        workspacePath: "/tmp/worktree",
        worktreePath: "/tmp/worktree",
        branchName: "ambient/child",
      },
      nestedFanout: {
        required: true,
        source: "child_bridge_policy",
      },
    });
  });

  it("produces stable launch ids for the same parent run, tool call, tool, and input", () => {
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    });
    const tool = parentPiVisibleCallableWorkflowTools(registry)[0]!;
    const runPlan = buildCallableWorkflowRunPlan(tool, {
      blocking: false,
      scope: "docs",
      goal: "Summarize release notes",
      metricCriteria: mapReduceMetricCriteria(),
    });
    const first = buildCallableWorkflowExecutionPlan({
      descriptor: tool,
      runPlan,
      parent: { threadId: "parent-thread", runId: "parent-run" },
      toolCallId: "tool-call-1",
    });
    const second = buildCallableWorkflowExecutionPlan({
      descriptor: tool,
      runPlan: buildCallableWorkflowRunPlan(tool, {
        scope: "docs",
        goal: "Summarize release notes",
        blocking: false,
        metricCriteria: mapReduceMetricCriteria(),
      }),
      parent: { threadId: "parent-thread", runId: "parent-run" },
      toolCallId: "tool-call-1",
    });

    expect(second.launchId).toBe(first.launchId);
  });
});

function mapReduceMetricCriteria(): Array<{ templateId: string; value: string }> {
  return [{ templateId: "map_reduce-metric", value: "Every mapped item has reducer evidence." }];
}
