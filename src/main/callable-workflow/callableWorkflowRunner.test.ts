import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  callableWorkflowToolName,
} from "./callableWorkflowRegistry";
import { buildCallableWorkflowExecutionPlan } from "./callableWorkflowExecutionPlan";
import {
  CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
  CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
} from "./callableWorkflowTaskQueue";
import {
  CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION,
  executeCallableWorkflowTask,
  validateCallableWorkflowRunnerExecutionBoundary,
} from "./callableWorkflowRunner";
import { ProjectStore } from "./callableWorkflowProjectStoreFacade";

const enabledFlags = resolveAmbientFeatureFlags({
  settings: { subagents: true },
  generatedAt: "2026-06-06T18:00:00.000Z",
});

describe("callable workflow runner bridge", () => {
  it("compiles queued callable workflow tasks into artifacts and starts workflow execution", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
        featureFlagSnapshot: enabledFlags,
      });
      const runnerCalls: string[] = [];

      const result = await executeCallableWorkflowTask({
        store,
        taskId: task.id,
        createWorkflowThread: (input) =>
          store.createWorkflowAgentThreadSummary({
            ...input,
            projectPath: workspacePath,
          }),
        compileWorkflowTask: async ({ handoffPlan, workflowThread, callableWorkflowInvocation }) => {
          runnerCalls.push(`compile:${handoffPlan.compiler.toolName}:${workflowThread.id}`);
          expect(callableWorkflowInvocation).toMatchObject({
            taskId: task.id,
            launchId: task.launchId,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            callerProvenance: {
              kind: "parent_thread",
              threadId: parent.id,
              runId: parentRun.id,
              worktree: {
                required: false,
                isolated: false,
              },
            },
            toolName: "ambient_workflow_symphony_map_reduce",
            sourceKind: "symphony_recipe",
            blocking: true,
            sourceContext: {
              kind: "symphony_recipe",
              recipeId: "map_reduce",
              invocationCustomization: {
                metricCriteria: [
                  expect.objectContaining({ templateId: "map_reduce-metric" }),
                ],
              },
            },
          });
          const artifact = store.createWorkflowArtifact({
            workflowThreadId: workflowThread.id,
            title: "Callable Map Reduce",
            status: "ready_for_preview",
            manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
            spec: { goal: "Summarize release notes.", summary: "Callable workflow artifact." },
            sourcePath: join(workspacePath, ".ambient-codex", "workflows", "callable-map-reduce", "main.ts"),
            statePath: join(workspacePath, ".ambient-codex", "workflows", "callable-map-reduce", "state.json"),
          });
          const previewRun = store.startWorkflowRun({ artifactId: artifact.id, status: "previewed" });
          return { artifacts: [artifact], runs: [previewRun] };
        },
        runWorkflowTask: async ({ artifact, onRunStarted }) => {
          runnerCalls.push(`run:${artifact.id}`);
          const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
          onRunStarted(run.id);
          const finished = store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true });
          return { artifacts: [artifact], runs: [finished] };
        },
      });

      expect(result).toMatchObject({
        schemaVersion: CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION,
        status: "succeeded",
        task: {
          id: task.id,
          status: "succeeded",
          statusLabel: "Succeeded",
          runnerDeferredReason: "workflow_run_succeeded",
          workflowArtifactId: result.artifact?.id,
          workflowRunId: result.run?.id,
        },
        workflowThread: {
          title: "Symphony Map-Reduce",
        },
        artifact: {
          title: "Callable Map Reduce",
          status: "ready_for_preview",
        },
        run: {
          status: "succeeded",
        },
      });
      expect(runnerCalls).toEqual([
        `compile:ambient_workflow_symphony_map_reduce:${result.workflowThread?.id}`,
        `run:${result.artifact?.id}`,
      ]);
      expect(result.handoffPlan?.compiler.userRequest).toContain("Callable workflow: Symphony Map-Reduce");
      expect(result.handoffPlan?.compiler.userRequest).toContain('"goal": "Summarize release notes"');
      const events = store.listWorkflowRunEvents(result.run!.id);
      expect(events.map((event) => event.type)).toEqual([
        CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
        CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
      ]);
      expect(events[1]).toMatchObject({
        type: CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
        data: {
          taskId: task.id,
          launchId: task.launchId,
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          toolName: "ambient_workflow_symphony_map_reduce",
          blocking: true,
          taskStatus: "succeeded",
          runStatus: "succeeded",
        },
      });
    } finally {
      store.close();
    }
  });

  it("passes child caller provenance through runner handoff to the workflow compiler", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const child = store.createThread("Child workflow caller");
      const assistant = store.addMessage({ threadId: child.id, role: "assistant", content: "" });
      const childRun = store.startRun({ threadId: child.id, assistantMessageId: assistant.id });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: executionPlanForParent(child.id, childRun.id, assistant.id, {
          kind: "subagent_child_thread",
          threadId: child.id,
          runId: childRun.id,
          messageId: assistant.id,
          subagentRunId: "subagent-run",
          canonicalTaskPath: "parent/1",
          parentThreadId: "parent-thread",
          parentRunId: "parent-run",
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
            workspacePath,
            worktreePath: workspacePath,
            branchName: "ambient/child",
          },
          nestedFanout: {
            required: true,
            source: "child_bridge_policy",
          },
        }),
        featureFlagSnapshot: enabledFlags,
      });

      const result = await executeCallableWorkflowTask({
        store,
        taskId: task.id,
        createWorkflowThread: (input) => store.createWorkflowAgentThreadSummary({ ...input, projectPath: workspacePath }),
        compileWorkflowTask: async ({ handoffPlan, workflowThread, callableWorkflowInvocation }) => {
          expect(handoffPlan.callerProvenance).toMatchObject({
            kind: "subagent_child_thread",
            subagentRunId: "subagent-run",
            canonicalTaskPath: "parent/1",
            worktree: {
              required: true,
              isolated: true,
              worktreePath: workspacePath,
            },
            approval: {
              required: true,
              source: "child_bridge_policy",
              scopeHint: "this_child_thread",
            },
          });
          expect(callableWorkflowInvocation).toMatchObject({
            callerProvenance: {
              kind: "subagent_child_thread",
              subagentRunId: "subagent-run",
              parentThreadId: "parent-thread",
              parentRunId: "parent-run",
              nestedFanout: {
                required: true,
                source: "child_bridge_policy",
              },
            },
          });
          expect(workflowThread.title).toBe("Symphony Map-Reduce");
          const artifact = store.createWorkflowArtifact({
            workflowThreadId: workflowThread.id,
            title: "Child Callable Map Reduce",
            status: "ready_for_preview",
            manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
            spec: { goal: "Summarize child findings.", summary: "Callable workflow artifact." },
            sourcePath: join(workspacePath, ".ambient-codex", "workflows", "child-callable-map-reduce", "main.ts"),
            statePath: join(workspacePath, ".ambient-codex", "workflows", "child-callable-map-reduce", "state.json"),
          });
          const previewRun = store.startWorkflowRun({ artifactId: artifact.id, status: "previewed" });
          return { artifacts: [artifact], runs: [previewRun] };
        },
        runWorkflowTask: async ({ artifact, onRunStarted }) => {
          const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
          onRunStarted(run.id);
          return { artifacts: [artifact], runs: [store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true })] };
        },
      });

      expect(result.status).toBe("succeeded");
    } finally {
      store.close();
    }
  });

  it("refuses child-originated mutating workflow artifacts without child approval and worktree isolation", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const child = store.createThread("Unsafe child workflow caller");
      const assistant = store.addMessage({ threadId: child.id, role: "assistant", content: "" });
      const childRun = store.startRun({ threadId: child.id, assistantMessageId: assistant.id });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: executionPlanForParent(child.id, childRun.id, assistant.id, {
          ...childCallerProvenance({
            workspacePath,
            threadId: child.id,
            runId: childRun.id,
            messageId: assistant.id,
          }),
          approval: {
            required: false,
            source: "launch_card",
            failureHandling: "approval not requested",
            scopeHint: "parent_thread",
          },
          worktree: {
            required: false,
            isolated: false,
            status: "shared",
            workspacePath,
          },
        }),
        featureFlagSnapshot: enabledFlags,
      });
      let runnerStarted = false;

      const result = await executeCallableWorkflowTask({
        store,
        taskId: task.id,
        createWorkflowThread: (input) => store.createWorkflowAgentThreadSummary({ ...input, projectPath: workspacePath }),
        compileWorkflowTask: async ({ workflowThread }) => {
          const artifact = store.createWorkflowArtifact({
            workflowThreadId: workflowThread.id,
            title: "Unsafe Child Mutation",
            status: "ready_for_preview",
            manifest: { tools: ["ambient.responses"], mutationPolicy: "apply_after_approval" },
            spec: { goal: "Mutate child workspace.", summary: "Callable workflow artifact." },
            sourcePath: join(workspacePath, ".ambient-codex", "workflows", "unsafe-child-mutation", "main.ts"),
            statePath: join(workspacePath, ".ambient-codex", "workflows", "unsafe-child-mutation", "state.json"),
          });
          return { artifacts: [artifact], runs: [] };
        },
        runWorkflowTask: async () => {
          runnerStarted = true;
          throw new Error("unsafe child mutating workflow should not start");
        },
      });

      expect(runnerStarted).toBe(false);
      expect(result).toMatchObject({
        status: "failed",
        task: {
          id: task.id,
          status: "failed",
          runnerDeferredReason: "failed",
          workflowArtifactId: expect.any(String),
          workflowRunId: undefined,
        },
      });
      expect(result.task.errorMessage).toContain("refused child-originated mutating workflow artifact");
      expect(result.task.errorMessage).toContain(`childThreadId=${child.id}`);
      expect(result.task.errorMessage).toContain(`childRunId=${childRun.id}`);
      expect(result.task.errorMessage).toContain("subagentRunId=subagent-run");
      expect(result.task.errorMessage).toContain("child bridge approval source");
      expect(result.task.errorMessage).toContain("isolated child worktree");
    } finally {
      store.close();
    }
  });

  it("allows child-originated mutating workflow artifacts with child-scoped approval and active isolated worktree evidence", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const child = store.createThread("Approved child workflow caller");
      const assistant = store.addMessage({ threadId: child.id, role: "assistant", content: "" });
      const childRun = store.startRun({ threadId: child.id, assistantMessageId: assistant.id });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: executionPlanForParent(child.id, childRun.id, assistant.id, childCallerProvenance({
          workspacePath,
          threadId: child.id,
          runId: childRun.id,
          messageId: assistant.id,
        })),
        featureFlagSnapshot: enabledFlags,
      });

      const result = await executeCallableWorkflowTask({
        store,
        taskId: task.id,
        createWorkflowThread: (input) => store.createWorkflowAgentThreadSummary({ ...input, projectPath: workspacePath }),
        compileWorkflowTask: async ({ workflowThread }) => {
          const artifact = store.createWorkflowArtifact({
            workflowThreadId: workflowThread.id,
            title: "Approved Child Mutation",
            status: "ready_for_preview",
            manifest: { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" },
            spec: { goal: "Stage child workspace mutation.", summary: "Callable workflow artifact." },
            sourcePath: join(workspacePath, ".ambient-codex", "workflows", "approved-child-mutation", "main.ts"),
            statePath: join(workspacePath, ".ambient-codex", "workflows", "approved-child-mutation", "state.json"),
          });
          return { artifacts: [artifact], runs: [] };
        },
        runWorkflowTask: async ({ artifact, onRunStarted }) => {
          const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
          onRunStarted(run.id);
          return { artifacts: [artifact], runs: [store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true })] };
        },
      });

      expect(result).toMatchObject({
        status: "succeeded",
        task: {
          id: task.id,
          status: "succeeded",
          workflowArtifactId: result.artifact?.id,
          workflowRunId: result.run?.id,
        },
        artifact: {
          manifest: {
            mutationPolicy: "staged_until_approved",
          },
        },
      });
    } finally {
      store.close();
    }
  });

  it("validates child mutating workflow boundaries with child identifiers before run handoff", () => {
    expect(() =>
      validateCallableWorkflowRunnerExecutionBoundary({
        task: {
          ...queuedTaskSummary(),
          id: "task-child-mutation",
        },
        handoffPlan: {
          ...compilerHandoffPlan(),
          callerProvenance: childCallerProvenance({
            workspacePath: "/repo/.ambient-codex/worktrees/child-thread",
            worktreePath: "",
          }),
        },
        artifact: {
          id: "artifact-mutating",
          title: "Mutating child artifact",
          status: "ready_for_preview",
          manifest: { tools: ["ambient.responses"], mutationPolicy: "apply_after_approval" },
          spec: { goal: "Mutate safely" },
          sourcePath: "/repo/.ambient-codex/workflows/mutate/main.ts",
          statePath: "/repo/.ambient-codex/workflows/mutate/state.json",
          createdAt: "2026-06-06T18:00:00.000Z",
          updatedAt: "2026-06-06T18:00:00.000Z",
        },
      })
    ).toThrow(/child worktree path/);
  });

  it("records compiler failure on the queued task without deleting launch evidence", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
        featureFlagSnapshot: enabledFlags,
      });

      const result = await executeCallableWorkflowTask({
        store,
        taskId: task.id,
        createWorkflowThread: (input) => store.createWorkflowAgentThreadSummary({ ...input, projectPath: workspacePath }),
        compileWorkflowTask: async () => {
          throw new Error("compiler unavailable");
        },
        runWorkflowTask: async () => {
          throw new Error("runner should not start");
        },
      });

      expect(result).toMatchObject({
        status: "failed",
        task: {
          id: task.id,
          launchId: task.launchId,
          status: "failed",
          statusLabel: "Failed",
          runnerDeferredReason: "failed",
          errorMessage: "compiler unavailable",
          workflowArtifactId: undefined,
          workflowRunId: undefined,
          executionPlan: expect.objectContaining({ launchId: task.launchId }),
        },
      });
    } finally {
      store.close();
    }
  });

  it("returns canceled when cancellation wins a later runner failure race", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
        featureFlagSnapshot: enabledFlags,
      });

      const result = await executeCallableWorkflowTask({
        store,
        taskId: task.id,
        createWorkflowThread: (input) => store.createWorkflowAgentThreadSummary({ ...input, projectPath: workspacePath }),
        compileWorkflowTask: async () => {
          store.cancelCallableWorkflowTask({
            id: task.id,
            reason: "User canceled while the compiler was still running.",
            createdAt: "2026-06-06T18:06:00.000Z",
          });
          throw new Error("compiler returned after cancellation");
        },
        runWorkflowTask: async () => {
          throw new Error("runner should not start after cancellation");
        },
      });

      expect(result).toMatchObject({
        status: "canceled",
        task: {
          id: task.id,
          launchId: task.launchId,
          status: "canceled",
          statusLabel: "Canceled",
          runnerDeferredReason: "callable_workflow_task_canceled",
          errorMessage: "User canceled while the compiler was still running.",
          workflowArtifactId: undefined,
          workflowRunId: undefined,
          executionPlan: expect.objectContaining({ launchId: task.launchId }),
        },
      });
      expect(store.getCallableWorkflowTask(task.id)).toMatchObject({
        status: "canceled",
        errorMessage: "User canceled while the compiler was still running.",
      });
    } finally {
      store.close();
    }
  });
});

async function tempWorkspace() {
  return mkdtemp(join(tmpdir(), "ambient-callable-workflow-runner-"));
}

function executionPlanForParent(
  parentThreadId: string,
  parentRunId: string,
  assistantMessageId: string,
  callerProvenance?: Parameters<typeof buildCallableWorkflowExecutionPlan>[0]["callerProvenance"],
) {
  const registry = buildCallableWorkflowRegistry({
    featureFlagSnapshot: enabledFlags,
  });
  const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
  if (!descriptor) throw new Error("Missing map-reduce descriptor");
  return buildCallableWorkflowExecutionPlan({
    descriptor,
    runPlan: buildCallableWorkflowRunPlan(descriptor, {
      goal: "Summarize release notes",
      blocking: true,
      metricCriteria: mapReduceMetricCriteria(),
    }),
    parent: {
      threadId: parentThreadId,
      runId: parentRunId,
      assistantMessageId,
    },
    toolCallId: "callable-tool-call",
    callerProvenance,
    createdAt: "2026-06-06T18:00:00.000Z",
  });
}

function mapReduceMetricCriteria(): Array<{ templateId: string; value: string }> {
  return [{ templateId: "map_reduce-metric", value: "Every mapped item has reducer evidence." }];
}

function childCallerProvenance(input: {
  workspacePath: string;
  threadId?: string;
  runId?: string;
  messageId?: string;
  worktreePath?: string;
}): NonNullable<Parameters<typeof buildCallableWorkflowExecutionPlan>[0]["callerProvenance"]> {
  const worktreePath = input.worktreePath ?? input.workspacePath;
  return {
    kind: "subagent_child_thread",
    threadId: input.threadId ?? "child-thread",
    runId: input.runId ?? "child-run",
    ...(input.messageId ? { messageId: input.messageId } : {}),
    subagentRunId: "subagent-run",
    canonicalTaskPath: "parent/1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
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
      workspacePath: input.workspacePath,
      ...(worktreePath ? { worktreePath } : {}),
      branchName: "ambient/child",
    },
    nestedFanout: {
      required: true,
      source: "child_bridge_policy",
    },
  };
}

function queuedTaskSummary(): Parameters<typeof validateCallableWorkflowRunnerExecutionBoundary>[0]["task"] {
  return {
    id: "task",
    launchId: "launch",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    toolCallId: "tool-call",
    toolId: "workflow-tool",
    toolName: "ambient_workflow_symphony_map_reduce",
    sourceKind: "symphony_recipe",
    title: "Symphony Map-Reduce",
    status: "queued",
    statusLabel: "Queued",
    blocking: true,
    defaultCollapsed: true,
    progressVisible: true,
    tokenCostTracking: true,
    pauseResumeCancel: true,
    cancelHandle: "callable-workflow-cancel:launch",
    runnerTarget: "workflowCompilerService",
    runnerDeferredReason: "callable_workflow_runner_not_connected",
    executionPlan: {},
    createdAt: "2026-06-06T18:00:00.000Z",
    updatedAt: "2026-06-06T18:00:00.000Z",
  };
}

function compilerHandoffPlan(): Parameters<typeof validateCallableWorkflowRunnerExecutionBoundary>[0]["handoffPlan"] {
  return {
    schemaVersion: "ambient-callable-workflow-compiler-handoff-v1",
    taskId: "task",
    launchId: "launch",
    createdAt: "2026-06-06T18:00:00.000Z",
    parent: {
      threadId: "parent-thread",
      runId: "parent-run",
      messageId: "parent-message",
    },
    callerProvenance: childCallerProvenance({ workspacePath: "/repo/.ambient-codex/worktrees/child-thread" }),
    compiler: {
      target: "workflowCompilerService",
      userRequest: "Compile workflow",
      workflowThreadTitle: "Symphony Map-Reduce",
      workflowThreadInitialRequest: "Compile workflow",
      sourceKind: "symphony_recipe",
      toolName: "ambient_workflow_symphony_map_reduce",
      toolId: "workflow-tool",
      input: {},
      blocking: true,
      launchCard: {
        schemaVersion: "ambient-callable-workflow-launch-card-v1",
        title: "Symphony Map-Reduce",
        sourceKind: "symphony_recipe",
        riskLevel: "medium",
        estimatedAgents: 2,
        maxFanout: 2,
        maxDepth: 1,
        estimatedTokenBudget: 60_000,
        tokenBudgetEstimated: true,
        estimatedLocalMemoryBytes: 0,
        localMemoryEstimated: true,
        costEstimateLabel: "Token budget up to 60k",
        toolMutationScope: "Recipe and user scope define allowed tools; mutating child actions require approval, child identifiers, and worktree isolation.",
        checkpointResume: "Checkpoint and resume are required for long-running callable workflows.",
        approvalFailureHandling: "Denied, unavailable, or non-interactive approvals leave the workflow blocked or needing attention; the parent must not synthesize it as complete.",
        defaultCollapsed: true,
        blocking: true,
        smallSliceRecommended: true,
        requireConfirmation: true,
        requirementIds: ["approval_failure_handling"],
        metricTemplateIds: ["map_reduce-metric"],
        policyWarnings: [],
      },
      requiredBeforeStart: [
        "compile_callable_workflow_to_artifact",
        "persist_workflow_run",
        "emit_workflow_run_started",
      ],
    },
    runStart: {
      mode: "compile_then_start_workflow_run",
      desktopEventType: "workflow-run-started",
      requiresArtifactBeforeRun: true,
      allowUnapprovedOneOff: true,
    },
  };
}
