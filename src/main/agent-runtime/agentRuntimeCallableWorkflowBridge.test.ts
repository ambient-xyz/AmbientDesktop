import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  callableWorkflowToolName,
} from "./agentRuntimeCallableWorkflowFacade";
import { buildCallableWorkflowExecutionPlan } from "./agentRuntimeCallableWorkflowFacade";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON } from "../../shared/callableWorkflowTaskGuards";

const workflowServiceMocks = vi.hoisted(() => ({
  compileWorkflowArtifact: vi.fn(),
  runWorkflowArtifact: vi.fn(),
}));

vi.mock("./agentRuntimeWorkflowCompilerFacade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agentRuntimeWorkflowCompilerFacade")>()),
  compileWorkflowArtifact: workflowServiceMocks.compileWorkflowArtifact,
}));

vi.mock("./agentRuntimeWorkflowFacade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agentRuntimeWorkflowFacade")>()),
  runWorkflowArtifact: workflowServiceMocks.runWorkflowArtifact,
}));

describe("AgentRuntime callable workflow bridge", () => {
  it("passes callable workflow invocation context into the production compiler handoff", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-agent-runtime-callable-workflow-"));
    const store = new ProjectStore();
    const events: any[] = [];

    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Callable workflow parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const registry = buildCallableWorkflowRegistry({
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: "2026-06-07T18:00:00.000Z",
        }),
      });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
      if (!descriptor) throw new Error("Missing Map-Reduce callable workflow descriptor.");
      const executionPlan = buildCallableWorkflowExecutionPlan({
        descriptor,
        runPlan: buildCallableWorkflowRunPlan(descriptor, {
          goal: "Summarize release notes",
          blocking: true,
          metricCriteria: mapReduceMetricCriteria(),
        }),
        parent: {
          threadId: parent.id,
          runId: parentRun.id,
          assistantMessageId: assistant.id,
        },
        toolCallId: "callable-workflow-tool-call",
        createdAt: "2026-06-07T18:00:00.000Z",
      });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan,
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: "2026-06-07T18:00:00.000Z",
        }),
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => events.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                settings: store.getFeatureFlagSettings(),
                generatedAt: "2026-06-07T18:00:00.000Z",
              }),
          },
          search: {
            readSettings: () => undefined,
          },
          workflowNativeTools: {
            connectorDescriptors: () => [],
            connectorRegistrations: () => [],
          },
        } as any,
      );
      const childLaunches: any[] = [];
      (runtime as any).startResolvedSubagentChildRun = vi.fn((input: any) => {
        childLaunches.push(input);
        const running = store.markSubagentRunStatus(input.run.id, "running");
        return { started: true, run: running, message: "Stubbed child runtime started." };
      });
      (runtime as any).waitForResolvedSubagentChildRun = vi.fn((input: any) => {
        const completed = store.markSubagentRunStatus(input.run.id, "completed", {
          resultArtifact: subagentResultArtifactForRole(
            input.run.id,
            input.run.childThreadId,
            input.run.roleId,
            `${input.run.roleId} completed bridge work after wait.`,
          ),
        });
        return {
          run: completed,
          timedOut: false,
          outcome: { kind: "child_terminal" },
        };
      });
      (runtime as any).pluginHost = {
        enabledCodexPlugins: vi.fn(async () => []),
        buildCodexPluginMcpToolRegistrations: vi.fn(async () => []),
        listRegistry: vi.fn(async () => ({
          plugins: [],
          capabilities: [],
          sources: [],
          errors: [],
          sourceNotes: [],
        })),
        callCodexPluginMcpTool: vi.fn(),
      };

      workflowServiceMocks.compileWorkflowArtifact.mockImplementation(async (input: any) => {
        const artifactRoot = join(workspace.statePath, "workflows", "callable-map-reduce-test");
        await mkdir(artifactRoot, { recursive: true });
        const artifact = store.createWorkflowArtifact({
          workflowThreadId: input.workflowThreadId,
          title: "Callable Map-Reduce",
          status: "ready_for_preview",
          manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
          spec: { goal: "Summarize release notes.", summary: "Callable workflow artifact." },
          sourcePath: join(artifactRoot, "main.ts"),
          statePath: join(artifactRoot, "state.json"),
        });
        const previewRun = store.startWorkflowRun({ artifactId: artifact.id, status: "previewed" });
        return { artifacts: [artifact], runs: [previewRun] };
      });
      workflowServiceMocks.runWorkflowArtifact.mockImplementation(async (input: any) => {
        const artifact = store.getWorkflowArtifact(input.artifactId);
        const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
        input.onRunStarted?.(run.id);
        const finished = store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true });
        input.onEvent?.();
        return { artifacts: [artifact], runs: [finished] };
      });

      await (runtime as any).executeCallableWorkflowTaskForThread(parent.id, task.id, workspace);

      expect(childLaunches.map((launch) => launch.run.effectiveRoleSnapshot?.patternRole)).toEqual(["mapper", "reducer"]);
      const childRuns = store.listSubagentRunsForParentThread(parent.id);
      expect(childRuns).toHaveLength(2);
      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toContainEqual(expect.objectContaining({
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        status: "satisfied",
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: task.id,
        childRunIds: expect.arrayContaining(childRuns.map((run) => run.id)),
      }));
      expect(store.getCallableWorkflowTask(task.id).patternGraphSnapshot?.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ patternRole: "mapper", childRunId: expect.any(String), blockingParent: true }),
          expect.objectContaining({ patternRole: "reducer", childRunId: expect.any(String), blockingParent: true }),
        ]),
      );
      expect(workflowServiceMocks.compileWorkflowArtifact).toHaveBeenCalledTimes(1);
      expect(workflowServiceMocks.compileWorkflowArtifact.mock.calls[0]?.[0]).toMatchObject({
        store,
        workflowThreadId: expect.any(String),
        callableWorkflowInvocation: {
          taskId: task.id,
          launchId: task.launchId,
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
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
          launchBridgeContract: {
            schemaVersion: "ambient-callable-workflow-symphony-launch-bridge-v1",
            pattern: { id: "map_reduce" },
            childLaunches: [
              expect.objectContaining({ roleNodeId: "mapper", roleId: "explorer" }),
              expect.objectContaining({ roleNodeId: "reducer", roleId: "summarizer" }),
            ],
            wait: {
              mode: "required_all",
              failurePolicy: "ask_user",
              timeoutMs: 600000,
            },
          },
          launchBridgeEvidence: {
            schemaVersion: "ambient-callable-workflow-symphony-launch-bridge-evidence-v1",
            workflowTaskId: task.id,
            patternId: "map_reduce",
            childRunIds: expect.arrayContaining(childRuns.map((run) => run.id)),
            childResults: expect.arrayContaining([
              expect.objectContaining({
                status: "completed",
                resultArtifact: expect.objectContaining({
                  status: "completed",
                  summary: expect.stringContaining("completed bridge work"),
                }),
              }),
            ]),
            wait: expect.objectContaining({
              waitSatisfied: true,
              synthesisAllowed: true,
            }),
          },
        },
      });
      expect(workflowServiceMocks.runWorkflowArtifact).toHaveBeenCalledTimes(1);
      expect(store.getCallableWorkflowTask(task.id)).toMatchObject({
        status: "succeeded",
        workflowArtifactId: expect.any(String),
        workflowRunId: expect.any(String),
        runnerDeferredReason: "workflow_run_succeeded",
      });
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "callable-workflow-task-updated",
          task: expect.objectContaining({ id: task.id, status: "succeeded" }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "workflow-run-started",
          runId: expect.any(String),
          workflowThreadId: expect.any(String),
          workspacePath,
        }),
      ]));
    } finally {
      workflowServiceMocks.compileWorkflowArtifact.mockReset();
      workflowServiceMocks.runWorkflowArtifact.mockReset();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("stops launching Symphony children when the workflow task is canceled during spawn", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-agent-runtime-callable-workflow-spawn-cancel-"));
    const store = new ProjectStore();
    const events: any[] = [];

    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Callable workflow parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const registry = buildCallableWorkflowRegistry({
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: "2026-06-07T18:00:00.000Z",
        }),
      });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
      if (!descriptor) throw new Error("Missing Map-Reduce callable workflow descriptor.");
      const executionPlan = buildCallableWorkflowExecutionPlan({
        descriptor,
        runPlan: buildCallableWorkflowRunPlan(descriptor, {
          goal: "Cancel during child launch",
          blocking: false,
          metricCriteria: mapReduceMetricCriteria(),
        }),
        parent: {
          threadId: parent.id,
          runId: parentRun.id,
          assistantMessageId: assistant.id,
        },
        toolCallId: "callable-workflow-spawn-cancel-tool-call",
        createdAt: "2026-06-07T18:00:00.000Z",
      });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan,
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: "2026-06-07T18:00:00.000Z",
        }),
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => events.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                settings: store.getFeatureFlagSettings(),
                generatedAt: "2026-06-07T18:00:00.000Z",
              }),
          },
          search: {
            readSettings: () => undefined,
          },
          workflowNativeTools: {
            connectorDescriptors: () => [],
            connectorRegistrations: () => [],
          },
        } as any,
      );
      const childLaunches: any[] = [];
      (runtime as any).startResolvedSubagentChildRun = vi.fn((input: any) => {
        childLaunches.push(input);
        const running = store.markSubagentRunStatus(input.run.id, "running");
        store.cancelCallableWorkflowTask({
          id: task.id,
          reason: "Cancel while the Symphony launch bridge is still spawning children.",
        });
        return { started: true, run: running, message: "Stubbed child runtime started." };
      });
      (runtime as any).waitForResolvedSubagentChildRun = vi.fn();
      (runtime as any).cancelResolvedSubagentChildRun = vi.fn((input: any) => {
        const cancelled = store.markSubagentRunStatus(input.run.id, "cancelled");
        return { cancelled: true, run: cancelled };
      });
      (runtime as any).pluginHost = {
        enabledCodexPlugins: vi.fn(async () => []),
        buildCodexPluginMcpToolRegistrations: vi.fn(async () => []),
        listRegistry: vi.fn(async () => ({
          plugins: [],
          capabilities: [],
          sources: [],
          errors: [],
          sourceNotes: [],
        })),
        callCodexPluginMcpTool: vi.fn(),
      };

      await (runtime as any).executeCallableWorkflowTaskForThread(parent.id, task.id, workspace);

      const childRuns = store.listSubagentRunsForParentThread(parent.id);
      expect(childLaunches).toHaveLength(1);
      expect(childRuns).toHaveLength(1);
      expect(store.getSubagentRun(childRuns[0].id)).toMatchObject({ status: "cancelled" });
      expect((runtime as any).waitForResolvedSubagentChildRun).not.toHaveBeenCalled();
      expect(workflowServiceMocks.compileWorkflowArtifact).not.toHaveBeenCalled();
      expect(workflowServiceMocks.runWorkflowArtifact).not.toHaveBeenCalled();
      expect(store.getCallableWorkflowTask(task.id)).toMatchObject({
        status: "canceled",
        runnerDeferredReason: "callable_workflow_task_canceled",
        errorMessage: "Cancel while the Symphony launch bridge is still spawning children.",
      });
    } finally {
      workflowServiceMocks.compileWorkflowArtifact.mockReset();
      workflowServiceMocks.runWorkflowArtifact.mockReset();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks workflow compilation when the Symphony child wait is not synthesis-safe", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-agent-runtime-callable-workflow-unsafe-wait-"));
    const store = new ProjectStore();
    const events: any[] = [];

    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Callable workflow parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const registry = buildCallableWorkflowRegistry({
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: "2026-06-07T18:00:00.000Z",
        }),
      });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
      if (!descriptor) throw new Error("Missing Map-Reduce callable workflow descriptor.");
      const executionPlan = buildCallableWorkflowExecutionPlan({
        descriptor,
        runPlan: buildCallableWorkflowRunPlan(descriptor, {
          goal: "Summarize release notes",
          blocking: true,
          metricCriteria: mapReduceMetricCriteria(),
        }),
        parent: {
          threadId: parent.id,
          runId: parentRun.id,
          assistantMessageId: assistant.id,
        },
        toolCallId: "callable-workflow-tool-call",
        createdAt: "2026-06-07T18:00:00.000Z",
      });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan,
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: "2026-06-07T18:00:00.000Z",
        }),
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => events.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                settings: store.getFeatureFlagSettings(),
                generatedAt: "2026-06-07T18:00:00.000Z",
              }),
          },
          search: {
            readSettings: () => undefined,
          },
          workflowNativeTools: {
            connectorDescriptors: () => [],
            connectorRegistrations: () => [],
          },
        } as any,
      );
      (runtime as any).startResolvedSubagentChildRun = vi.fn((input: any) => {
        const failed = store.markSubagentRunStatus(input.run.id, "failed", {
          resultArtifact: subagentResultArtifactForRole(
            input.run.id,
            input.run.childThreadId,
            input.role.id,
            `${input.role.label} failed bridge work.`,
            { status: "failed", structuredStatus: "failed" },
          ),
        });
        return { started: true, run: failed, message: "Stubbed child runtime failed." };
      });
      (runtime as any).waitForResolvedSubagentChildRun = vi.fn((input: any) => ({
        run: store.getSubagentRun(input.run.id),
        timedOut: false,
        outcome: { kind: "child_terminal" },
      }));
      (runtime as any).pluginHost = {
        enabledCodexPlugins: vi.fn(async () => []),
        buildCodexPluginMcpToolRegistrations: vi.fn(async () => []),
        listRegistry: vi.fn(async () => ({
          plugins: [],
          capabilities: [],
          sources: [],
          errors: [],
          sourceNotes: [],
        })),
        callCodexPluginMcpTool: vi.fn(),
      };

      await (runtime as any).executeCallableWorkflowTaskForThread(parent.id, task.id, workspace);

      expect(workflowServiceMocks.compileWorkflowArtifact).not.toHaveBeenCalled();
      expect(workflowServiceMocks.runWorkflowArtifact).not.toHaveBeenCalled();
      expect(store.getCallableWorkflowTask(task.id)).toMatchObject({
        status: "paused",
        statusLabel: "Child wait needs attention",
        runnerDeferredReason: "symphony_child_wait_needs_attention",
        errorMessage: expect.stringContaining("Symphony children are not synthesis-safe"),
      });
      const failedBarrier = store.listSubagentWaitBarriersForParentRun(parentRun.id).find((barrier) =>
        barrier.failurePolicy === "ask_user" && barrier.status === "failed"
      );
      if (!failedBarrier) throw new Error("Expected failed wait barrier.");
      expect(failedBarrier).toMatchObject({
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        status: "failed",
      });
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "callable-workflow-task-updated",
          task: expect.objectContaining({
            id: task.id,
            status: "paused",
            statusLabel: "Child wait needs attention",
          }),
          workspacePath,
        }),
      ]));

      store.updateSubagentWaitBarrierStatus(failedBarrier.id, "cancelled", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          synthesisAllowed: false,
          explicitPartial: false,
          transitionEvidence: {
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "parent_stopped",
            source: "barrier_controller",
            childRunIds: failedBarrier.childRunIds,
            reason: "User chose to cancel the callable workflow parent path.",
            idempotencyKey: "resolve-barrier:cancel-parent",
          },
          userDecision: {
            schemaVersion: "ambient-subagent-user-decision-v1",
            decision: "cancel_parent",
            userDecision: "Stop this callable workflow instead of waiting on failed children.",
            partialSummary: null,
            decidedAt: "2026-06-07T18:00:01.000Z",
            toolCallId: "resolve-barrier-tool-call",
            idempotencyKey: "resolve-barrier:cancel-parent",
          },
        },
      });

      const cancelled = await runtime.resumeCallableWorkflowTask({ taskId: task.id });

      expect(cancelled).toMatchObject({
        id: task.id,
        status: "canceled",
        runnerDeferredReason: "callable_workflow_task_canceled",
        errorMessage: expect.stringContaining("cancel_parent"),
      });
    } finally {
      workflowServiceMocks.compileWorkflowArtifact.mockReset();
      workflowServiceMocks.runWorkflowArtifact.mockReset();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("routes pre-compile Symphony child-wait pauses back through callable workflow execution on resume", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-agent-runtime-callable-workflow-precompile-resume-"));
    const store = new ProjectStore();

    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Callable workflow parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const registry = buildCallableWorkflowRegistry({
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: "2026-06-07T18:00:00.000Z",
        }),
      });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
      if (!descriptor) throw new Error("Missing Map-Reduce callable workflow descriptor.");
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: buildCallableWorkflowExecutionPlan({
          descriptor,
          runPlan: buildCallableWorkflowRunPlan(descriptor, {
            goal: "Resume pre-compile child wait",
            blocking: true,
            metricCriteria: mapReduceMetricCriteria(),
          }),
          parent: {
            threadId: parent.id,
            runId: parentRun.id,
            assistantMessageId: assistant.id,
          },
          toolCallId: "callable-workflow-precompile-resume-tool-call",
          createdAt: "2026-06-07T18:00:00.000Z",
        }),
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: "2026-06-07T18:00:00.000Z",
        }),
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const paused = store.pauseCallableWorkflowTask({
        id: task.id,
        statusLabel: "Child wait needs attention",
        runnerDeferredReason: CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
        errorMessage: "Children need a user decision before synthesis.",
      });
      expect(paused).toMatchObject({
        status: "paused",
        workflowArtifactId: undefined,
        workflowRunId: undefined,
      });

      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: vi.fn(),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
        {} as any,
      );
      const execute = vi.spyOn(runtime as any, "executeCallableWorkflowTaskForThread")
        .mockImplementation(async () => {
          store.beginCallableWorkflowTaskCompilerHandoff(task.id);
        });

      const resumed = await runtime.resumeCallableWorkflowTask({ taskId: task.id });

      expect(execute).toHaveBeenCalledWith(parent.id, task.id, workspace);
      expect(resumed).toMatchObject({
        id: task.id,
        status: "compiling",
        runnerDeferredReason: "workflow_artifact_not_compiled",
        errorMessage: undefined,
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("cancels failed Symphony child waits before canceling a pre-compile callable workflow task", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-agent-runtime-callable-workflow-cancel-child-wait-"));
    const store = new ProjectStore();
    const events: any[] = [];

    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Callable workflow parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlagSnapshot = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-07T18:00:00.000Z",
      });
      const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName("map_reduce"));
      if (!descriptor) throw new Error("Missing Map-Reduce callable workflow descriptor.");
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: buildCallableWorkflowExecutionPlan({
          descriptor,
          runPlan: buildCallableWorkflowRunPlan(descriptor, {
            goal: "Cancel pre-compile child wait",
            blocking: true,
            metricCriteria: mapReduceMetricCriteria(),
          }),
          parent: {
            threadId: parent.id,
            runId: parentRun.id,
            assistantMessageId: assistant.id,
          },
          toolCallId: "callable-workflow-cancel-child-wait-tool-call",
          createdAt: "2026-06-07T18:00:00.000Z",
        }),
        featureFlagSnapshot,
      });
      const mapper = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Mapper sub-agent",
        roleId: "explorer",
        canonicalTaskPath: "root/0:mapper",
        featureFlagSnapshot,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-07T18:00:00.000Z"),
        dependencyMode: "required",
      });
      const reducer = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Reducer sub-agent",
        roleId: "summarizer",
        canonicalTaskPath: "root/1:reducer",
        featureFlagSnapshot,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-07T18:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(mapper.id, "running");
      store.markSubagentRunStatus(reducer.id, "running");
      store.bindCallableWorkflowTaskPatternGraphChild({
        workflowTaskId: task.id,
        roleNodeId: "mapper",
        childRunId: mapper.id,
        blockingParent: true,
      });
      store.bindCallableWorkflowTaskPatternGraphChild({
        workflowTaskId: task.id,
        roleNodeId: "reducer",
        childRunId: reducer.id,
        blockingParent: true,
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [mapper.id, reducer.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: task.id,
        timeoutMs: 600_000,
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "failed", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [mapper.id, reducer.id],
          childStatuses: [
            { childRunId: mapper.id, status: "running" },
            { childRunId: reducer.id, status: "running" },
          ],
          synthesisAllowed: false,
          explicitPartial: false,
          resultArtifact: null,
          transitionEvidence: {
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "child_terminal",
            source: "wait_agent",
            childRunIds: [mapper.id, reducer.id],
            reason: "Bridge wait failed before the user canceled the workflow task.",
            idempotencyKey: "failed-before-cancel",
          },
        },
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      store.pauseCallableWorkflowTask({
        id: task.id,
        statusLabel: "Child wait needs attention",
        runnerDeferredReason: CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
        errorMessage: "Children are still running.",
      });

      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => events.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
        {} as any,
      );

      const canceled = await runtime.cancelCallableWorkflowTask({
        taskId: task.id,
        reason: "Stop the callable workflow and its child wait.",
      });

      expect(canceled).toMatchObject({
        id: task.id,
        status: "canceled",
      });
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "cancelled",
        resolutionArtifact: expect.objectContaining({
          parentCancellationRequested: true,
          userDecision: expect.objectContaining({ decision: "cancel_parent" }),
        }),
      });
      expect(store.getSubagentRun(mapper.id)).toMatchObject({ status: "cancelled" });
      expect(store.getSubagentRun(reducer.id)).toMatchObject({ status: "cancelled" });
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "callable-workflow-task-updated",
          task: expect.objectContaining({ id: task.id, status: "canceled" }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("cancels background Symphony child waits without recording parent cancellation", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-agent-runtime-callable-workflow-background-cancel-"));
    const store = new ProjectStore();
    const events: any[] = [];

    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Callable workflow parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlagSnapshot = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-07T18:00:00.000Z",
      });
      const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName("map_reduce"));
      if (!descriptor) throw new Error("Missing Map-Reduce callable workflow descriptor.");
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: buildCallableWorkflowExecutionPlan({
          descriptor,
          runPlan: buildCallableWorkflowRunPlan(descriptor, {
            goal: "Cancel background child wait",
            blocking: false,
            metricCriteria: mapReduceMetricCriteria(),
          }),
          parent: {
            threadId: parent.id,
            runId: parentRun.id,
            assistantMessageId: assistant.id,
          },
          toolCallId: "callable-workflow-background-cancel-tool-call",
          createdAt: "2026-06-07T18:00:00.000Z",
        }),
        featureFlagSnapshot,
      });
      const mapper = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Mapper sub-agent",
        roleId: "explorer",
        canonicalTaskPath: "root/0:mapper",
        featureFlagSnapshot,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-07T18:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(mapper.id, "running");
      store.bindCallableWorkflowTaskPatternGraphChild({
        workflowTaskId: task.id,
        roleNodeId: "mapper",
        childRunId: mapper.id,
        blockingParent: true,
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [mapper.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: task.id,
        timeoutMs: 600_000,
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      store.pauseCallableWorkflowTask({
        id: task.id,
        statusLabel: "Child wait needs attention",
        runnerDeferredReason: CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
        errorMessage: "Background child is still running.",
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => events.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
        {} as any,
      );

      const canceled = await runtime.cancelCallableWorkflowTask({
        taskId: task.id,
        reason: "Stop only the background workflow task.",
      });

      const resolvedBarrier = store.getSubagentWaitBarrier(barrier.id);
      expect(canceled).toMatchObject({ id: task.id, status: "canceled" });
      expect(resolvedBarrier).toMatchObject({
        status: "cancelled",
        resolutionArtifact: expect.objectContaining({
          workflowTaskDecision: expect.objectContaining({
            decision: "cancel_workflow_task",
            workflowTaskId: task.id,
          }),
        }),
      });
      expect(resolvedBarrier.resolutionArtifact).not.toEqual(
        expect.objectContaining({ parentCancellationRequested: true }),
      );
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent-wait-barrier-updated",
          barrier: expect.objectContaining({
            id: barrier.id,
            status: "cancelled",
          }),
        }),
      ]));
      expect(store.getSubagentRun(mapper.id)).toMatchObject({ status: "cancelled" });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("cancels in-flight compiling Symphony launch children after marking the workflow task canceled", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-agent-runtime-callable-workflow-compiling-cancel-"));
    const store = new ProjectStore();
    const events: any[] = [];

    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Callable workflow parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlagSnapshot = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-07T18:00:00.000Z",
      });
      const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName("map_reduce"));
      if (!descriptor) throw new Error("Missing Map-Reduce callable workflow descriptor.");
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: buildCallableWorkflowExecutionPlan({
          descriptor,
          runPlan: buildCallableWorkflowRunPlan(descriptor, {
            goal: "Cancel compiling launch wait",
            blocking: false,
            metricCriteria: mapReduceMetricCriteria(),
          }),
          parent: {
            threadId: parent.id,
            runId: parentRun.id,
            assistantMessageId: assistant.id,
          },
          toolCallId: "callable-workflow-compiling-cancel-tool-call",
          createdAt: "2026-06-07T18:00:00.000Z",
        }),
        featureFlagSnapshot,
      });
      const compiling = store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const mapper = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Mapper sub-agent",
        roleId: "explorer",
        canonicalTaskPath: "root/0:mapper",
        featureFlagSnapshot,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-07T18:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      store.markSubagentRunStatus(mapper.id, "running");
      store.bindCallableWorkflowTaskPatternGraphChild({
        workflowTaskId: compiling.task.id,
        roleNodeId: "mapper",
        childRunId: mapper.id,
        blockingParent: false,
      });
      const spawnBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [mapper.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 600_000,
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [mapper.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: task.id,
        timeoutMs: 600_000,
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => events.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
        {} as any,
      );

      const canceled = await runtime.cancelCallableWorkflowTask({
        taskId: task.id,
        reason: "Cancel while the Symphony launch bridge is still waiting.",
      });

      expect(canceled).toMatchObject({ id: task.id, status: "canceled" });
      expect(store.getSubagentRun(mapper.id)).toMatchObject({ status: "cancelled" });
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({ status: "cancelled" });
      expect(store.getSubagentWaitBarrier(spawnBarrier.id).status).not.toBe("waiting_on_children");
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent-wait-barrier-updated",
          barrier: expect.objectContaining({ id: barrier.id, status: "cancelled" }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps workflow task cancellation durable when Symphony child cleanup fails", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-agent-runtime-callable-workflow-cancel-cleanup-fails-"));
    const store = new ProjectStore();
    const events: any[] = [];

    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Callable workflow parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlagSnapshot = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-07T18:00:00.000Z",
      });
      const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName("map_reduce"));
      if (!descriptor) throw new Error("Missing Map-Reduce callable workflow descriptor.");
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: buildCallableWorkflowExecutionPlan({
          descriptor,
          runPlan: buildCallableWorkflowRunPlan(descriptor, {
            goal: "Cancel compiling launch with a cleanup failure",
            blocking: false,
            metricCriteria: mapReduceMetricCriteria(),
          }),
          parent: {
            threadId: parent.id,
            runId: parentRun.id,
            assistantMessageId: assistant.id,
          },
          toolCallId: "callable-workflow-cleanup-failure-tool-call",
          createdAt: "2026-06-07T18:00:00.000Z",
        }),
        featureFlagSnapshot,
      });
      const compiling = store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const mapper = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Mapper sub-agent",
        roleId: "explorer",
        canonicalTaskPath: "root/0:mapper",
        featureFlagSnapshot,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-07T18:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      store.bindCallableWorkflowTaskPatternGraphChild({
        workflowTaskId: compiling.task.id,
        roleNodeId: "mapper",
        childRunId: mapper.id,
        blockingParent: false,
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => events.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
        {} as any,
      );
      const cleanup = vi.fn(async () => {
        throw new Error("cleanup failed");
      });
      (runtime as any).cancelCallableWorkflowSymphonyChildWait = cleanup;

      const canceled = await runtime.cancelCallableWorkflowTask({
        taskId: task.id,
        reason: "Cancel even if child cleanup is unhealthy.",
      });

      expect(canceled).toMatchObject({ id: task.id, status: "canceled" });
      expect(store.getCallableWorkflowTask(task.id)).toMatchObject({
        id: task.id,
        status: "canceled",
        errorMessage: "Cancel even if child cleanup is unhealthy.",
      });
      expect(cleanup).toHaveBeenCalledWith(
        expect.objectContaining({ id: task.id, status: "compiling" }),
        "Cancel even if child cleanup is unhealthy.",
      );
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "callable-workflow-task-updated",
          task: expect.objectContaining({ id: task.id, status: "canceled" }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("resumes paused callable workflow tasks through the production workflow runner", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-agent-runtime-callable-workflow-resume-"));
    const store = new ProjectStore();
    const events: any[] = [];

    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Callable workflow parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const registry = buildCallableWorkflowRegistry({
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: "2026-06-07T18:00:00.000Z",
        }),
      });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
      if (!descriptor) throw new Error("Missing Map-Reduce callable workflow descriptor.");
      const executionPlan = buildCallableWorkflowExecutionPlan({
        descriptor,
        runPlan: buildCallableWorkflowRunPlan(descriptor, {
          goal: "Resume release notes workflow",
          blocking: true,
          metricCriteria: mapReduceMetricCriteria(),
        }),
        parent: {
          threadId: parent.id,
          runId: parentRun.id,
          assistantMessageId: assistant.id,
        },
        toolCallId: "callable-workflow-resume-tool-call",
        createdAt: "2026-06-07T18:00:00.000Z",
      });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan,
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: "2026-06-07T18:00:00.000Z",
        }),
      });
      const workflowThread = store.createWorkflowAgentThreadSummary({
        initialRequest: "Resume release notes workflow",
        projectPath: workspacePath,
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const artifactRoot = join(workspace.statePath, "workflows", "callable-resume-test");
      await mkdir(artifactRoot, { recursive: true });
      const artifact = store.createWorkflowArtifact({
        workflowThreadId: workflowThread.id,
        title: "Callable Resume",
        status: "ready_for_preview",
        manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
        spec: { goal: "Resume release notes workflow.", summary: "Callable workflow resume artifact." },
        sourcePath: join(artifactRoot, "main.ts"),
        statePath: join(artifactRoot, "state.json"),
      });
      store.linkCallableWorkflowTaskArtifact({ id: task.id, workflowArtifactId: artifact.id });
      const pausedRun = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
      store.markCallableWorkflowTaskRunStarted({ id: task.id, workflowRunId: pausedRun.id });
      store.updateWorkflowRun({ id: pausedRun.id, status: "paused" });
      store.markCallableWorkflowTaskRunFinished({
        id: task.id,
        workflowRunId: pausedRun.id,
        runStatus: "paused",
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => events.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
        {
          workflowNativeTools: {
            connectorRegistrations: () => [],
          },
        } as any,
      );
      (runtime as any).pluginHost = {
        enabledCodexPlugins: vi.fn(async () => []),
        buildCodexPluginMcpToolRegistrations: vi.fn(async () => []),
        listRegistry: vi.fn(async () => ({
          plugins: [],
          capabilities: [],
          sources: [],
          errors: [],
          sourceNotes: [],
        })),
        callCodexPluginMcpTool: vi.fn(),
      };
      workflowServiceMocks.runWorkflowArtifact.mockImplementation(async (input: any) => {
        expect(input.resumeFromRunId).toBe(pausedRun.id);
        expect(input.runLimits).toEqual({ maxRunMs: null });
        const resumedRun = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
        input.onRunStarted?.(resumedRun.id);
        const finished = store.updateWorkflowRun({ id: resumedRun.id, status: "succeeded", finish: true });
        input.onEvent?.();
        return { artifacts: [artifact], runs: [finished] };
      });

      const resumed = await runtime.resumeCallableWorkflowTask({ taskId: task.id });

      expect(workflowServiceMocks.compileWorkflowArtifact).not.toHaveBeenCalled();
      expect(workflowServiceMocks.runWorkflowArtifact).toHaveBeenCalledTimes(1);
      expect(resumed).toMatchObject({
        id: task.id,
        status: "succeeded",
        workflowArtifactId: artifact.id,
        runnerDeferredReason: "workflow_run_succeeded",
      });
      expect(resumed.workflowRunId).not.toBe(pausedRun.id);
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "workflow-run-started",
          runId: resumed.workflowRunId,
          workflowThreadId: workflowThread.id,
          workspacePath,
        }),
        expect.objectContaining({
          type: "callable-workflow-task-updated",
          task: expect.objectContaining({ id: task.id, status: "succeeded" }),
          workspacePath,
        }),
      ]));
    } finally {
      workflowServiceMocks.compileWorkflowArtifact.mockReset();
      workflowServiceMocks.runWorkflowArtifact.mockReset();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function mapReduceMetricCriteria(): Array<{ templateId: string; value: string }> {
  return [{ templateId: "map_reduce-metric", value: "Every mapped item has reducer evidence." }];
}

function subagentResultArtifactForRole(
  runId: string,
  childThreadId: string,
  roleId: string,
  summary: string,
  options: { status?: "completed" | "failed"; structuredStatus?: "complete" | "failed"; partial?: boolean } = {},
) {
  const status = options.status ?? "completed";
  const structuredStatus = options.structuredStatus ?? "complete";
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status,
    partial: options.partial ?? false,
    summary,
    childThreadId,
    structuredOutput: {
      schemaVersion: "ambient-subagent-structured-result-v1",
      roleId,
      status: structuredStatus,
      summary,
      evidence: [`${childThreadId}:stubbed-result`],
      artifacts: [],
      risks: [],
      nextActions: [],
      roleOutput: subagentRoleOutput(roleId, summary, childThreadId),
    },
  };
}

function subagentRoleOutput(roleId: string, summary: string, childThreadId: string): Record<string, unknown> {
  if (roleId === "explorer") {
    return { findings: [{ summary, provenance: [`${childThreadId}:stubbed-result`] }], openQuestions: [] };
  }
  if (roleId === "summarizer") {
    return { keyPoints: [summary], sourceRefs: [`${childThreadId}:stubbed-result`] };
  }
  if (roleId === "reviewer") {
    return { verdict: "pass", findings: [{ summary, evidence: [`${childThreadId}:stubbed-result`] }] };
  }
  if (roleId === "drafter") {
    return { draft: summary, constraintsChecked: [], rationale: [] };
  }
  return { changes: [], validation: [], mutationEvidence: [{ summary, path: "stubbed", category: "test.run" }] };
}
