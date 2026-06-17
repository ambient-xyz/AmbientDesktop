import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../shared/symphonyWorkflowRecipes";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  callableWorkflowToolName,
} from "./callable-workflow/callableWorkflowRegistry";
import { buildCallableWorkflowExecutionPlan } from "./callable-workflow/callableWorkflowExecutionPlan";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./projectStore";

const workflowServiceMocks = vi.hoisted(() => ({
  compileWorkflowArtifact: vi.fn(),
  runWorkflowArtifact: vi.fn(),
}));

vi.mock("./workflow-compiler/workflowCompilerService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./workflow-compiler/workflowCompilerService")>()),
  compileWorkflowArtifact: workflowServiceMocks.compileWorkflowArtifact,
}));

vi.mock("./workflowRunService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./workflowRunService")>()),
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
