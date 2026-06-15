import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../shared/ambientModels";
import { effectiveSubagentRoleSnapshot } from "../shared/subagentPatternGraph";
import { resolveAmbientFeatureFlags } from "../shared/featureFlags";
import type { WorkflowRecordingLibraryDescription } from "../shared/types";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  parentPiVisibleCallableWorkflowTools,
  recordedWorkflowToolName,
} from "./callableWorkflowRegistry";
import { buildCallableWorkflowExecutionPlan } from "./callableWorkflowExecutionPlan";
import {
  CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION,
  CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE,
  CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
  CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
  CALLABLE_WORKFLOW_TASK_QUEUE_SCHEMA_VERSION,
  analyzeCallableWorkflowTaskRestartState,
  buildCallableWorkflowCompilerHandoffPlan,
  callableWorkflowQueuedTaskDraftFromExecutionPlan,
} from "./callableWorkflowTaskQueue";
import { ProjectStore } from "./projectStore";

const roots: string[] = [];
const enabledFlags = resolveAmbientFeatureFlags({
  settings: { subagents: true },
  generatedAt: "2026-06-06T18:00:00.000Z",
});
const disabledFlags = resolveAmbientFeatureFlags({ generatedAt: "2026-06-06T18:00:00.000Z" });

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("callable workflow task queue", () => {
  it("persists queued visible background workflow tasks idempotently by launch id", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const executionPlan = executionPlanForParent(parent.id, parentRun.id, assistant.id);

      const task = enqueueTask(store, { executionPlan });
      const repeated = enqueueTask(store, { executionPlan });

      expect(CALLABLE_WORKFLOW_TASK_QUEUE_SCHEMA_VERSION).toBe("ambient-callable-workflow-task-queue-v1");
      expect(repeated.id).toBe(task.id);
      expect(task).toMatchObject({
        id: executionPlan.launchId,
        launchId: executionPlan.launchId,
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        toolCallId: "tool-call-1",
        toolName: "ambient_workflow_symphony_map_reduce",
        toolId: "symphony:map_reduce",
        sourceKind: "symphony_recipe",
        title: "Symphony Map-Reduce",
        status: "queued",
        statusLabel: "Queued",
        blocking: true,
        defaultCollapsed: true,
        progressVisible: true,
        tokenCostTracking: true,
        pauseResumeCancel: true,
        runnerTarget: "workflowCompilerService",
        runnerDeferredReason: "callable_workflow_runner_not_connected",
        launchCard: {
          schemaVersion: "ambient-callable-workflow-launch-card-v1",
          riskLevel: "high",
          estimatedAgents: 12,
          requireConfirmation: true,
        },
        executionPlan: expect.objectContaining({
          schemaVersion: "ambient-callable-workflow-execution-plan-v1",
          launchId: executionPlan.launchId,
          workflowRunPlan: expect.objectContaining({
            launchCard: expect.objectContaining({ title: "Symphony Map-Reduce" }),
          }),
        }),
      });
      expect(store.listCallableWorkflowTasksForParentRun(parentRun.id)).toEqual([task]);

      store.close();
      reopened.openWorkspace(workspacePath);
      expect(reopened.listCallableWorkflowTasksForParentThread(parent.id)).toEqual([
        expect.objectContaining({
          id: executionPlan.launchId,
          parentRunId: parentRun.id,
          status: "queued",
          launchCard: expect.objectContaining({
            schemaVersion: "ambient-callable-workflow-launch-card-v1",
            title: "Symphony Map-Reduce",
          }),
          executionPlan: expect.objectContaining({ launchId: executionPlan.launchId }),
        }),
      ]);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("refuses to enqueue callable workflow tasks while ambient.subagents is disabled", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const executionPlan = executionPlanForParent(parent.id, parentRun.id, assistant.id);

      expect(() =>
        store.enqueueCallableWorkflowTask({
          executionPlan,
          featureFlagSnapshot: disabledFlags,
        })
      ).toThrow("ambient.subagents is off");
      expect(store.listCallableWorkflowTasksForParentRun(parentRun.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("binds child runs into persisted callable workflow pattern graph snapshots", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Mapper child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
        effectiveRoleSnapshot: effectiveSubagentRoleSnapshot({
          baseRole: "explorer",
          patternRole: "mapper",
          overlayLabels: ["Source slice"],
          outputContract: "Return extracted evidence.",
        }),
      });

      const bound = store.bindCallableWorkflowTaskPatternGraphChild({
        workflowTaskId: task.id,
        roleNodeId: "mapper",
        childRunId: child.id,
        label: "Mapper child",
        updatedAt: "2026-06-06T18:05:00.000Z",
      });

      expect(bound.patternGraphSnapshot).toMatchObject({
        patternId: "map_reduce",
        parentThreadId: parent.id,
        parentMessageId: assistant.id,
        workflowTaskId: task.id,
        updatedAt: "2026-06-06T18:05:00.000Z",
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: `mapper:${child.id}`,
            label: "Mapper child",
            childRunId: child.id,
            childThreadId: child.childThreadId,
            status: "queued",
            blockingParent: true,
          }),
        ]),
      });
      expect(bound.patternGraphSnapshot?.edges.some((edge) => edge.from === `mapper:${child.id}` || edge.to === `mapper:${child.id}`)).toBe(true);

      store.close();
      reopened.openWorkspace(workspacePath);
      expect(reopened.getCallableWorkflowTask(task.id).patternGraphSnapshot?.nodes).toContainEqual(
        expect.objectContaining({
          id: `mapper:${child.id}`,
          childRunId: child.id,
          childThreadId: child.childThreadId,
        }),
      );
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("rejects pattern graph child bindings that target unrelated tasks or missing role nodes", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const otherParent = store.createThread("Other parent");
      const otherAssistant = store.addMessage({ threadId: otherParent.id, role: "assistant", content: "" });
      const otherRun = store.startRun({ threadId: otherParent.id, assistantMessageId: otherAssistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });
      const otherChild = store.createSubagentRun({
        parentThreadId: otherParent.id,
        parentRunId: otherRun.id,
        parentMessageId: otherAssistant.id,
        title: "Other child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(otherParent.model),
      });

      expect(() => store.bindCallableWorkflowTaskPatternGraphChild({
        workflowTaskId: task.id,
        roleNodeId: "mapper",
        childRunId: otherChild.id,
      })).toThrow(/does not belong to this parent thread\/run/);

      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Mapper child",
        roleId: "explorer",
        canonicalTaskPath: "root/1:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
      });
      expect(() => store.bindCallableWorkflowTaskPatternGraphChild({
        workflowTaskId: task.id,
        roleNodeId: "not-a-node",
        childRunId: child.id,
      })).toThrow(/Pattern graph role node not-a-node does not exist/);
    } finally {
      store.close();
    }
  });

  it("rejects callable workflow tasks whose parent run belongs to another thread", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const otherParent = store.createThread("Other parent");
      const otherAssistant = store.addMessage({ threadId: otherParent.id, role: "assistant", content: "" });
      const otherRun = store.startRun({ threadId: otherParent.id, assistantMessageId: otherAssistant.id });
      const executionPlan = executionPlanForParent(parent.id, otherRun.id, otherAssistant.id);

      await expect(() => enqueueTask(store, { executionPlan }))
        .toThrow(/different thread/);
      expect(store.listCallableWorkflowTasksForParentRun(otherRun.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("builds queue drafts directly from visible execution-plan metadata", () => {
    const executionPlan = executionPlanForParent("parent-thread", "parent-run", "assistant-message");

    expect(callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan)).toMatchObject({
      id: executionPlan.launchId,
      launchId: executionPlan.launchId,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      status: "queued",
      blocking: true,
      cancelHandle: expect.stringMatching(/^callable-workflow-cancel:callable-workflow:[a-f0-9]{20}$/),
      executionPlan,
    });
  });

  it("carries child caller provenance into the compiler handoff plan", () => {
    const executionPlan = executionPlanForParent("child-thread", "child-run", "child-message", {
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
        failureHandling: "forward approval to parent",
        scopeHint: "this_child_thread",
      },
      worktree: {
        required: true,
        isolated: true,
        status: "active",
        workspacePath: "/tmp/child-worktree",
        worktreePath: "/tmp/child-worktree",
      },
      nestedFanout: {
        required: true,
        source: "child_bridge_policy",
      },
    });
    const task = {
      ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan),
      createdAt: executionPlan.createdAt,
      updatedAt: executionPlan.createdAt,
    };

    const handoff = buildCallableWorkflowCompilerHandoffPlan({ task });

    expect(handoff.callerProvenance).toMatchObject({
      kind: "subagent_child_thread",
      threadId: "child-thread",
      runId: "child-run",
      subagentRunId: "subagent-run",
      canonicalTaskPath: "parent/1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      approval: {
        required: true,
        source: "child_bridge_policy",
        scopeHint: "this_child_thread",
      },
      worktree: {
        required: true,
        isolated: true,
        worktreePath: "/tmp/child-worktree",
      },
      nestedFanout: {
        required: true,
        source: "child_bridge_policy",
      },
    });
  });

  it("records child caller attribution on started, control, and finished workflow task events", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const child = store.createThread("Child workflow caller");
      const assistant = store.addMessage({ threadId: child.id, role: "assistant", content: "" });
      const childRun = store.startRun({ threadId: child.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(child.id, childRun.id, assistant.id, childCallerProvenance({
          threadId: child.id,
          runId: childRun.id,
          messageId: assistant.id,
          worktreePath: workspacePath,
        })),
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const artifact = workflowArtifact(store, workspacePath, "child-attribution");
      store.linkCallableWorkflowTaskArtifact({ id: task.id, workflowArtifactId: artifact.id });
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });

      store.markCallableWorkflowTaskRunStarted({
        id: task.id,
        workflowRunId: run.id,
        createdAt: "2026-06-06T18:03:00.000Z",
      });
      store.recordCallableWorkflowTaskControl({
        id: task.id,
        action: "pause_requested",
        reason: "Pause child workflow before parent synthesis.",
        createdAt: "2026-06-06T18:04:00.000Z",
      });
      store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true });
      store.markCallableWorkflowTaskRunFinished({
        id: task.id,
        workflowRunId: run.id,
        runStatus: "succeeded",
        createdAt: "2026-06-06T18:05:00.000Z",
      });

      const attributedEvents = store.listWorkflowRunEvents(run.id)
        .filter((event) =>
          event.type === CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE ||
          event.type === CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE ||
          event.type === CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE
        );
      expect(attributedEvents).toHaveLength(3);
      for (const event of attributedEvents) {
        expect(event.data).toMatchObject({
          taskId: task.id,
          launchId: task.launchId,
          callerKind: "subagent_child_thread",
          callerThreadId: child.id,
          callerRunId: childRun.id,
          childThreadId: child.id,
          childRunId: "subagent-run",
          childThreadRunId: childRun.id,
          subagentRunId: "subagent-run",
          canonicalTaskPath: "parent/1",
          childParentThreadId: "parent-thread",
          childParentRunId: "parent-run",
          approvalRequired: true,
          approvalSource: "child_bridge_policy",
          approvalScope: "this_child_thread",
          worktreeRequired: true,
          worktreeIsolated: true,
          worktreePath: workspacePath,
          nestedFanoutRequired: true,
          nestedFanoutSource: "child_bridge_policy",
        });
      }
    } finally {
      store.close();
    }
  });

  it("carries confirmed recorded playbook context into the compiler handoff prompt", () => {
    const playbook = workflowPlaybook({
      id: "release-triage",
      version: 4,
      title: "Release Triage",
      playbook: {
        intent: "Triage release notes against regression risk.",
        inputs: ["Release notes", "Known failing checks"],
        successfulExamples: [
          {
            toolName: "bash",
            inputPreview: "pnpm test",
            resultPreview: "Test failure summary",
          },
        ],
        doNot: [
          {
            toolName: "bash",
            status: "failed",
            reason: "Do not treat noisy raw stdout as structured results.",
          },
        ],
        validation: ["Every failing check has a triage status."],
        outputShape: ["Risk-ranked release triage with citations."],
      },
    });
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      recordedWorkflowPlaybooks: [playbook],
    });
    const tool = parentPiVisibleCallableWorkflowTools(registry)
      .find((candidate) => candidate.name === recordedWorkflowToolName(playbook));
    if (!tool) throw new Error("Missing recorded workflow tool");
    const runPlan = buildCallableWorkflowRunPlan(tool, {
      goal: "Triage the 2026.06.07 release notes.",
      input1: "docs/release-notes.md",
      input2: "test-results/latest.json",
      blocking: true,
    });
    const executionPlan = buildCallableWorkflowExecutionPlan({
      descriptor: tool,
      runPlan,
      parent: {
        threadId: "parent-thread",
        runId: "parent-run",
        assistantMessageId: "assistant-message",
      },
      toolCallId: "tool-call-recorded",
      createdAt: "2026-06-07T18:00:00.000Z",
    });
    const task = {
      ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan),
      createdAt: executionPlan.createdAt,
      updatedAt: executionPlan.createdAt,
    };

    const handoff = buildCallableWorkflowCompilerHandoffPlan({ task });

    expect(runPlan.sourceContext).toMatchObject({
      kind: "recorded_workflow",
      playbookId: "release-triage",
      playbookVersion: 4,
      intent: "Triage release notes against regression risk.",
      validation: ["Every failing check has a triage status."],
      outputShape: ["Risk-ranked release triage with citations."],
    });
    expect(handoff.compiler.userRequest).toContain("Source recipe context:");
    expect(handoff.compiler.userRequest).toContain("recorded workflow playbook (release-triage v4");
    expect(handoff.compiler.userRequest).toContain("Intent: Triage release notes against regression risk.");
    expect(handoff.compiler.userRequest).toContain(
      "Compact invocation artifact: ./workflow-invocation.json (ambient-workflow-recording-callable-invocation-v1, compact_callable_invocation; default compact)",
    );
    expect(handoff.compiler.userRequest).toContain(
      "Diagnostics trace artifact: ./diagnostics/full-trace.jsonl (diagnostics only; do not replay by default)",
    );
    expect(handoff.compiler.userRequest).toContain("Invocation input keys: goal, blocking, input_1");
    expect(handoff.compiler.userRequest).toContain("Input 1: Release notes");
    expect(handoff.compiler.userRequest).toContain("Successful example bash: pnpm test | Test failure summary");
    expect(handoff.compiler.userRequest).toContain("Avoid bash failed: Do not treat noisy raw stdout as structured results.");
    expect(handoff.compiler.userRequest).toContain("Validation 1: Every failing check has a triage status.");
    expect(handoff.compiler.userRequest).toContain("Do not replay stale recorded traces as if they were fresh results.");
  });

  it("carries Symphony builder selections and metric criteria into the compiler handoff prompt", () => {
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    });
    const tool = parentPiVisibleCallableWorkflowTools(registry)
      .find((candidate) => candidate.name === "ambient_workflow_symphony_map_reduce");
    if (!tool) throw new Error("Missing Symphony tool");
    const runPlan = buildCallableWorkflowRunPlan(tool, {
      goal: "Audit implementation evidence.",
      blocking: true,
      builderSelections: [
        {
          stepId: "pattern-scope",
          selectedChoiceId: "files",
          selectedChoiceLabel: "Files",
          selectedChoiceDescription: "Split across selected workspace files or search results.",
          resolvedText: "Files: Split across selected workspace files or search results.",
        },
        {
          stepId: "limits-and-policy",
          customText: "Read-only with a small slice first.",
          resolvedText: "Read-only with a small slice first.",
        },
      ],
      metricCriteria: [
        {
          templateId: "map_reduce-metric",
          value: "Every mapped implementation section has cited evidence.",
        },
      ],
    });
    const executionPlan = buildCallableWorkflowExecutionPlan({
      descriptor: tool,
      runPlan,
      parent: {
        threadId: "parent-thread",
        runId: "parent-run",
        assistantMessageId: "assistant-message",
      },
      toolCallId: "tool-call-symphony",
      createdAt: "2026-06-07T18:10:00.000Z",
    });
    const task = {
      ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan),
      createdAt: executionPlan.createdAt,
      updatedAt: executionPlan.createdAt,
    };

    const handoff = buildCallableWorkflowCompilerHandoffPlan({ task });

    expect(runPlan.sourceContext).toMatchObject({
      kind: "symphony_recipe",
      recipeId: "map_reduce",
      invocationCustomization: {
        schemaVersion: "ambient-callable-workflow-symphony-invocation-v1",
        stepSelections: [
          expect.objectContaining({ stepId: "pattern-scope", selectedChoiceId: "files" }),
          expect.objectContaining({ stepId: "limits-and-policy", customText: "Read-only with a small slice first." }),
        ],
        metricCriteria: [
          expect.objectContaining({
            templateId: "map_reduce-metric",
            value: "Every mapped implementation section has cited evidence.",
          }),
        ],
      },
    });
    expect(handoff.compiler.userRequest).toContain("Symphony invocation customization: ambient-callable-workflow-symphony-invocation-v1");
    expect(handoff.compiler.userRequest).toContain("Selected builder step pattern-scope: Files: Split across selected workspace files or search results.");
    expect(handoff.compiler.userRequest).toContain("Selected builder step limits-and-policy: Read-only with a small slice first.");
    expect(handoff.compiler.userRequest).toContain("Required objective_metric map_reduce-metric: Every mapped implementation section has cited evidence.");
  });

  it("transitions queued tasks through compiler handoff, artifact link, and started workflow run", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });

      const handoff = store.beginCallableWorkflowTaskCompilerHandoff(task.id, {
        createdAt: "2026-06-06T18:01:00.000Z",
      });

      expect(handoff.task).toMatchObject({
        id: task.id,
        status: "compiling",
        statusLabel: "Compiling",
        runnerDeferredReason: "workflow_artifact_not_compiled",
        startedAt: "2026-06-06T18:01:00.000Z",
      });
      expect(handoff.handoffPlan).toMatchObject({
        schemaVersion: CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION,
        taskId: task.id,
        launchId: task.launchId,
        parent: {
          threadId: parent.id,
          runId: parentRun.id,
          messageId: assistant.id,
        },
        compiler: {
          target: "workflowCompilerService",
          toolName: "ambient_workflow_symphony_map_reduce",
          input: { goal: "Summarize release notes", blocking: true },
          blocking: true,
          launchCard: expect.objectContaining({
            riskLevel: "high",
            estimatedAgents: 12,
            requireConfirmation: true,
          }),
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
      });
      expect(handoff.handoffPlan.compiler.userRequest).toContain("Callable workflow: Symphony Map-Reduce");
      expect(handoff.handoffPlan.compiler.userRequest).toContain('"goal": "Summarize release notes"');

      const artifact = workflowArtifact(store, workspacePath, "callable-map-reduce");
      const linked = store.linkCallableWorkflowTaskArtifact({
        id: task.id,
        workflowArtifactId: artifact.id,
        createdAt: "2026-06-06T18:02:00.000Z",
      });
      expect(linked).toMatchObject({
        status: "compiling",
        statusLabel: "Artifact ready",
        runnerDeferredReason: "workflow_run_not_started",
        workflowThreadId: artifact.workflowThreadId,
        workflowArtifactId: artifact.id,
      });

      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
      const running = store.markCallableWorkflowTaskRunStarted({
        id: task.id,
        workflowRunId: run.id,
        createdAt: "2026-06-06T18:03:00.000Z",
      });
      expect(running).toMatchObject({
        status: "running",
        statusLabel: "Running",
        runnerDeferredReason: "workflow_run_started",
        workflowThreadId: artifact.workflowThreadId,
        workflowArtifactId: artifact.id,
        workflowRunId: run.id,
      });
      const repeated = store.markCallableWorkflowTaskRunStarted({
        id: task.id,
        workflowRunId: run.id,
        createdAt: "2026-06-06T18:04:00.000Z",
      });
      expect(repeated.workflowRunId).toBe(run.id);
      const startedEvents = store.listWorkflowRunEvents(run.id)
        .filter((event) => event.type === CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE);
      expect(startedEvents).toHaveLength(1);
      expect(startedEvents[0]).toMatchObject({
        type: CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
        message: "Callable workflow task started: Symphony Map-Reduce.",
        data: {
          taskId: task.id,
          launchId: task.launchId,
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          toolName: "ambient_workflow_symphony_map_reduce",
          blocking: true,
        },
      });

      store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true });
      const finished = store.markCallableWorkflowTaskRunFinished({
        id: task.id,
        workflowRunId: run.id,
        runStatus: "succeeded",
        createdAt: "2026-06-06T18:05:00.000Z",
      });
      expect(finished).toMatchObject({
        status: "succeeded",
        statusLabel: "Succeeded",
        runnerDeferredReason: "workflow_run_succeeded",
        workflowArtifactId: artifact.id,
        workflowRunId: run.id,
        completedAt: "2026-06-06T18:05:00.000Z",
      });
      const finishedEvents = store.listWorkflowRunEvents(run.id)
        .filter((event) => event.type === CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE);
      expect(finishedEvents).toHaveLength(1);
      expect(finishedEvents[0]).toMatchObject({
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
      expect(handoff.handoffPlan.compiler.userRequest).toContain("Launch card:");
      expect(handoff.handoffPlan.compiler.userRequest).toContain("- Risk: high");
      expect(handoff.handoffPlan.compiler.userRequest).toContain("- Agents: up to 12 estimated, max fanout 12, max depth 2");
    } finally {
      store.close();
    }
  });

  it("hydrates linked workflow progress and usage snapshots on task summaries", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const artifact = workflowArtifact(store, workspacePath, "telemetry");
      store.linkCallableWorkflowTaskArtifact({ id: task.id, workflowArtifactId: artifact.id });
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
      store.markCallableWorkflowTaskRunStarted({ id: task.id, workflowRunId: run.id });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "step.start",
        message: "Inspect files",
        graphNodeId: "inspect",
      });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "step.end",
        message: "Inspect files complete",
        graphNodeId: "inspect",
        data: { usage: { costMicros: 9 } },
      });
      store.recordWorkflowModelCall({
        runId: run.id,
        task: "inspect.files",
        status: "succeeded",
        input: { goal: "Inspect files" },
        output: { summary: "Done" },
        cacheCheckpoint: {
          id: "callable-workflow-telemetry-cache",
          stage: "runtime_call",
          workflowThreadId: "workflow-thread-telemetry",
          stablePrefixHash: "stable-hash",
          stablePrefixChars: 120,
          stablePrefixEstimatedTokens: 30,
          mutableSuffixHash: "mutable-hash",
          mutableSuffixChars: 48,
          mutableSuffixEstimatedTokens: 12,
          requestHash: "request-hash",
          requestEstimatedTokens: 42,
          boundaryLabel: "Runtime boundary",
          createdAt: "2026-06-06T18:04:00.000Z",
        },
      });

      expect(store.getCallableWorkflowTask(task.id)).toMatchObject({
        progressSnapshot: {
          workflowRunStatus: "running",
          eventCount: 3,
          modelCallCount: 1,
          completedStepCount: 1,
          activeStepCount: 0,
          lastEventType: "step.end",
          lastEventMessage: "Inspect files complete",
        },
        usageSnapshot: {
          modelCallCount: 1,
          tokenCount: 42,
          tokenCountEstimated: true,
          costMicros: 9,
          costEstimated: false,
        },
      });
    } finally {
      store.close();
    }
  });

  it("analyzes callable workflow task restart state without mutating task evidence", () => {
    const executionPlan = executionPlanForParent("parent-thread", "parent-run", "assistant-message");
    const task = {
      ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan),
      status: "running" as const,
      statusLabel: "Running",
      runnerDeferredReason: "workflow_run_started",
      workflowArtifactId: "missing-artifact",
      workflowRunId: "missing-run",
      createdAt: executionPlan.createdAt,
      updatedAt: executionPlan.createdAt,
      startedAt: "2026-06-06T18:03:00.000Z",
    };

    const summary = analyzeCallableWorkflowTaskRestartState({
      tasks: [task],
      threads: [{ id: "parent-thread" }],
      parentRuns: [{ id: "parent-run", threadId: "parent-thread" }],
      workflowArtifacts: [],
      workflowRuns: [],
      createdAt: "2026-06-06T18:10:00.000Z",
    });

    expect(summary).toMatchObject({
      schemaVersion: "ambient-callable-workflow-task-restart-v1",
      createdAt: "2026-06-06T18:10:00.000Z",
      issueCount: 3,
      repairedTaskIds: [],
      diagnosticTaskIds: [task.id],
      staleWorkflowArtifactTaskIds: [task.id],
      staleWorkflowRunTaskIds: [task.id],
    });
    expect(summary.issues.map((issue) => issue.kind)).toEqual([
      "missing_workflow_artifact",
      "missing_workflow_run",
      "active_task_interrupted",
    ]);
  });

  it("includes child caller provenance on callable workflow restart issues", () => {
    const executionPlan = executionPlanForParent("child-thread", "child-run", "child-message", childCallerProvenance({
      threadId: "child-thread",
      runId: "child-run",
      messageId: "child-message",
      worktreePath: "/tmp/ambient-child-worktree",
    }));
    const task = {
      ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan),
      status: "running" as const,
      statusLabel: "Running",
      runnerDeferredReason: "workflow_run_started",
      workflowArtifactId: "missing-child-artifact",
      workflowRunId: "missing-child-run",
      createdAt: executionPlan.createdAt,
      updatedAt: executionPlan.createdAt,
      startedAt: "2026-06-06T18:03:00.000Z",
    };

    const summary = analyzeCallableWorkflowTaskRestartState({
      tasks: [task],
      threads: [{ id: "child-thread" }],
      parentRuns: [{ id: "child-run", threadId: "child-thread" }],
      workflowArtifacts: [],
      workflowRuns: [],
      createdAt: "2026-06-06T18:10:00.000Z",
    });

    expect(summary.issues.map((issue) => issue.kind)).toEqual([
      "missing_workflow_artifact",
      "missing_workflow_run",
      "active_task_interrupted",
    ]);
    for (const issue of summary.issues) {
      expect(issue).toMatchObject({
        taskId: task.id,
        taskStatus: "running",
        taskStatusLabel: "Running",
        blocking: true,
        runnerDeferredReason: "workflow_run_started",
        callerKind: "subagent_child_thread",
        callerThreadId: "child-thread",
        callerRunId: "child-run",
        childThreadId: "child-thread",
        childRunId: "child-run",
        subagentRunId: "subagent-run",
        canonicalTaskPath: "parent/1",
        childParentThreadId: "parent-thread",
        childParentRunId: "parent-run",
        approvalSource: "child_bridge_policy",
        approvalScope: "this_child_thread",
        worktreeRequired: true,
        worktreeIsolated: true,
        worktreeStatus: "active",
        nestedFanoutRequired: true,
        nestedFanoutSource: "child_bridge_policy",
      });
    }
  });

  it("reconciles callable workflow tasks whose linked run finished while the app was down", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const artifact = workflowArtifact(store, workspacePath, "restart-finished");
      store.linkCallableWorkflowTaskArtifact({ id: task.id, workflowArtifactId: artifact.id });
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
      store.markCallableWorkflowTaskRunStarted({ id: task.id, workflowRunId: run.id });
      store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true });
      store.close();

      reopened.openWorkspace(workspacePath);
      const summary = reopened.reconcileCallableWorkflowTaskRestartState({
        now: "2026-06-06T18:10:00.000Z",
      });

      expect(summary).toMatchObject({
        repairedTaskIds: [task.id],
        diagnosticTaskIds: [task.id],
        staleWorkflowArtifactTaskIds: [],
        staleWorkflowRunTaskIds: [],
      });
      expect(summary.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "workflow_run_terminal_task_unfinished",
          taskId: task.id,
          workflowArtifactId: artifact.id,
          workflowRunId: run.id,
        }),
      ]));
      expect(reopened.getCallableWorkflowTask(task.id)).toMatchObject({
        status: "succeeded",
        statusLabel: "Succeeded",
        runnerDeferredReason: "workflow_run_succeeded",
        workflowArtifactId: artifact.id,
        workflowThreadId: artifact.workflowThreadId,
        workflowRunId: run.id,
        completedAt: "2026-06-06T18:10:00.000Z",
      });
      expect(reopened.listWorkflowRunEvents(run.id)
        .filter((event) => event.type === CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE)).toHaveLength(1);

      const replay = reopened.reconcileCallableWorkflowTaskRestartState({
        now: "2026-06-06T18:11:00.000Z",
      });
      expect(replay.repairedTaskIds).toEqual([]);
      expect(reopened.listWorkflowRunEvents(run.id)
        .filter((event) => event.type === CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE)).toHaveLength(1);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("reports stale callable workflow artifact pointers without deleting task evidence", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const artifact = workflowArtifact(store, workspacePath, "missing-after-restart");
      store.linkCallableWorkflowTaskArtifact({ id: task.id, workflowArtifactId: artifact.id });
      const db = (store as unknown as {
        requireDb(): { prepare(sql: string): { run(...values: unknown[]): unknown } };
      }).requireDb();
      db.prepare("DELETE FROM workflow_artifacts WHERE id = ?").run(artifact.id);

      const summary = store.reconcileCallableWorkflowTaskRestartState({
        now: "2026-06-06T18:10:00.000Z",
      });

      expect(summary).toMatchObject({
        repairedTaskIds: [],
        diagnosticTaskIds: [task.id],
        staleWorkflowArtifactTaskIds: [task.id],
        staleWorkflowRunTaskIds: [],
      });
      expect(summary.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "missing_workflow_artifact",
          severity: "error",
          taskId: task.id,
          workflowArtifactId: artifact.id,
        }),
        expect.objectContaining({
          kind: "active_task_interrupted",
          severity: "warning",
          taskId: task.id,
        }),
      ]));
      expect(store.getCallableWorkflowTask(task.id)).toMatchObject({
        id: task.id,
        status: "compiling",
        workflowArtifactId: artifact.id,
        workflowThreadId: undefined,
        runnerDeferredReason: "workflow_run_not_started",
      });
    } finally {
      store.close();
    }
  });

  it("relinks paused callable workflow tasks to resumed workflow runs", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const artifact = workflowArtifact(store, workspacePath, "resume-paused");
      store.linkCallableWorkflowTaskArtifact({ id: task.id, workflowArtifactId: artifact.id });
      const pausedRun = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
      store.markCallableWorkflowTaskRunStarted({ id: task.id, workflowRunId: pausedRun.id });
      store.recordCallableWorkflowTaskControl({
        id: task.id,
        action: "pause_requested",
        reason: "User paused from parent cluster.",
        createdAt: "2026-06-06T18:04:00.000Z",
      });
      store.recordCallableWorkflowTaskControl({
        id: task.id,
        action: "pause_requested",
        reason: "Repeated pause should not duplicate evidence.",
        createdAt: "2026-06-06T18:04:30.000Z",
      });
      store.updateWorkflowRun({ id: pausedRun.id, status: "paused" });
      const paused = store.markCallableWorkflowTaskRunFinished({
        id: task.id,
        workflowRunId: pausedRun.id,
        runStatus: "paused",
      });
      store.recordCallableWorkflowTaskControl({
        id: task.id,
        action: "resume_requested",
        createdAt: "2026-06-06T18:05:00.000Z",
      });
      const resumedRun = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });

      const resumed = store.markCallableWorkflowTaskRunStarted({
        id: task.id,
        workflowRunId: resumedRun.id,
      });

      expect(paused).toMatchObject({
        status: "paused",
        statusLabel: "Paused",
        runnerDeferredReason: "workflow_run_paused",
        workflowRunId: pausedRun.id,
      });
      expect(resumed).toMatchObject({
        status: "running",
        statusLabel: "Running",
        runnerDeferredReason: "workflow_run_started",
        workflowArtifactId: artifact.id,
        workflowRunId: resumedRun.id,
      });
      const resumedStartedEvents = store.listWorkflowRunEvents(resumedRun.id)
        .filter((event) => event.type === CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE);
      expect(resumedStartedEvents).toHaveLength(1);
      expect(resumedStartedEvents[0]).toMatchObject({
        data: {
          taskId: task.id,
          launchId: task.launchId,
          parentRunId: parentRun.id,
          toolName: "ambient_workflow_symphony_map_reduce",
        },
      });
      const pausedControlEvents = store.listWorkflowRunEvents(pausedRun.id)
        .filter((event) => event.type === CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE);
      expect(pausedControlEvents).toHaveLength(2);
      expect(pausedControlEvents[0]).toMatchObject({
        type: CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE,
        message: "Callable workflow task pause requested: Symphony Map-Reduce.",
        data: {
          taskId: task.id,
          launchId: task.launchId,
          parentRunId: parentRun.id,
          toolName: "ambient_workflow_symphony_map_reduce",
          blocking: true,
          taskStatus: "running",
          action: "pause_requested",
          reason: "User paused from parent cluster.",
        },
      });
      expect(pausedControlEvents[1]).toMatchObject({
        type: CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE,
        message: "Callable workflow task resume requested: Symphony Map-Reduce.",
        data: {
          taskId: task.id,
          launchId: task.launchId,
          parentRunId: parentRun.id,
          toolName: "ambient_workflow_symphony_map_reduce",
          blocking: true,
          taskStatus: "paused",
          action: "resume_requested",
        },
      });
    } finally {
      store.close();
    }
  });

  it("cancels queued callable workflow tasks without deleting launch evidence", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });

      const canceled = store.cancelCallableWorkflowTask({
        id: task.id,
        reason: "User canceled from parent cluster.",
        createdAt: "2026-06-06T18:06:00.000Z",
      });
      const repeated = store.cancelCallableWorkflowTask({
        id: task.id,
        reason: "Second click should not duplicate evidence.",
        createdAt: "2026-06-06T18:07:00.000Z",
      });

      expect(canceled).toMatchObject({
        id: task.id,
        launchId: task.launchId,
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        status: "canceled",
        statusLabel: "Canceled",
        runnerDeferredReason: "callable_workflow_task_canceled",
        errorMessage: "User canceled from parent cluster.",
        workflowArtifactId: undefined,
        workflowRunId: undefined,
        completedAt: "2026-06-06T18:06:00.000Z",
        executionPlan: expect.objectContaining({ launchId: task.launchId }),
      });
      expect(repeated).toEqual(canceled);
      expect(store.listCallableWorkflowTasksForParentRun(parentRun.id)).toEqual([canceled]);
    } finally {
      store.close();
    }
  });

  it("cancels running callable workflow tasks and records one finished event", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const artifact = workflowArtifact(store, workspacePath, "cancel-running");
      store.linkCallableWorkflowTaskArtifact({ id: task.id, workflowArtifactId: artifact.id });
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
      store.markCallableWorkflowTaskRunStarted({ id: task.id, workflowRunId: run.id });

      const canceled = store.cancelCallableWorkflowTask({
        id: task.id,
        reason: "User canceled running workflow.",
        createdAt: "2026-06-06T18:08:00.000Z",
      });
      const repeated = store.cancelCallableWorkflowTask({
        id: task.id,
        reason: "Second click should not duplicate evidence.",
        createdAt: "2026-06-06T18:09:00.000Z",
      });

      expect(canceled).toMatchObject({
        status: "canceled",
        statusLabel: "Canceled",
        runnerDeferredReason: "callable_workflow_task_canceled",
        workflowArtifactId: artifact.id,
        workflowRunId: run.id,
        errorMessage: "User canceled running workflow.",
        completedAt: "2026-06-06T18:08:00.000Z",
      });
      expect(repeated).toEqual(canceled);
      expect(store.getWorkflowRun(run.id)).toMatchObject({
        status: "canceled",
        error: "User canceled running workflow.",
      });
      const controlEvents = store.listWorkflowRunEvents(run.id)
        .filter((event) => event.type === CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE);
      expect(controlEvents).toHaveLength(1);
      expect(controlEvents[0]).toMatchObject({
        type: CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE,
        message: "Callable workflow task cancel requested: Symphony Map-Reduce.",
        data: {
          taskId: task.id,
          launchId: task.launchId,
          parentRunId: parentRun.id,
          toolName: "ambient_workflow_symphony_map_reduce",
          blocking: true,
          taskStatus: "canceled",
          action: "cancel_requested",
          reason: "User canceled running workflow.",
        },
      });
      const finishedEvents = store.listWorkflowRunEvents(run.id)
        .filter((event) => event.type === CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE);
      expect(finishedEvents).toHaveLength(1);
      expect(finishedEvents[0]).toMatchObject({
        data: {
          taskId: task.id,
          launchId: task.launchId,
          taskStatus: "canceled",
          runStatus: "canceled",
          errorMessage: "User canceled running workflow.",
        },
      });
    } finally {
      store.close();
    }
  });

  it("rejects workflow run linkage when the run belongs to a different artifact", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const linkedArtifact = workflowArtifact(store, workspacePath, "linked");
      const otherArtifact = workflowArtifact(store, workspacePath, "other");
      store.linkCallableWorkflowTaskArtifact({ id: task.id, workflowArtifactId: linkedArtifact.id });
      const otherRun = store.startWorkflowRun({ artifactId: otherArtifact.id, status: "running" });

      expect(() => store.markCallableWorkflowTaskRunStarted({ id: task.id, workflowRunId: otherRun.id }))
        .toThrow(/different workflow artifact/);
    } finally {
      store.close();
    }
  });

  it("records failed compiler handoff state without deleting task evidence", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const task = enqueueTask(store, {
        executionPlan: executionPlanForParent(parent.id, parentRun.id, assistant.id),
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id, {
        createdAt: "2026-06-06T18:01:00.000Z",
      });

      const failed = store.failCallableWorkflowTask({
        id: task.id,
        errorMessage: "Compiler unavailable.",
        createdAt: "2026-06-06T18:02:00.000Z",
      });

      expect(failed).toMatchObject({
        id: task.id,
        status: "failed",
        statusLabel: "Failed",
        runnerDeferredReason: "failed",
        errorMessage: "Compiler unavailable.",
        startedAt: "2026-06-06T18:01:00.000Z",
        completedAt: "2026-06-06T18:02:00.000Z",
        executionPlan: expect.objectContaining({ launchId: task.launchId }),
      });
    } finally {
      store.close();
    }
  });
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ambient-callable-workflow-task-queue-"));
  roots.push(root);
  return join(root, "workspace");
}

function enqueueTask(
  store: ProjectStore,
  input: Omit<Parameters<ProjectStore["enqueueCallableWorkflowTask"]>[0], "featureFlagSnapshot">,
) {
  return store.enqueueCallableWorkflowTask({
    ...input,
    featureFlagSnapshot: enabledFlags,
  });
}

function executionPlanForParent(
  parentThreadId: string,
  parentRunId: string,
  assistantMessageId?: string,
  callerProvenance?: Parameters<typeof buildCallableWorkflowExecutionPlan>[0]["callerProvenance"],
) {
  const registry = buildCallableWorkflowRegistry({
    featureFlagSnapshot: enabledFlags,
  });
  const tool = parentPiVisibleCallableWorkflowTools(registry)[0]!;
  const runPlan = buildCallableWorkflowRunPlan(tool, {
    goal: "Summarize release notes",
    blocking: true,
    metricCriteria: mapReduceMetricCriteria(),
  });
  return buildCallableWorkflowExecutionPlan({
    descriptor: tool,
    runPlan,
    parent: {
      threadId: parentThreadId,
      runId: parentRunId,
      assistantMessageId,
    },
    toolCallId: "tool-call-1",
    callerProvenance,
    createdAt: "2026-06-06T18:00:00.000Z",
  });
}

function mapReduceMetricCriteria(): Array<{ templateId: string; value: string }> {
  return [{ templateId: "map_reduce-metric", value: "Every mapped item has reducer evidence." }];
}

function childCallerProvenance(input: {
  threadId: string;
  runId: string;
  messageId: string;
  worktreePath: string;
}): NonNullable<Parameters<typeof buildCallableWorkflowExecutionPlan>[0]["callerProvenance"]> {
  return {
    kind: "subagent_child_thread",
    threadId: input.threadId,
    runId: input.runId,
    messageId: input.messageId,
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
      workspacePath: input.worktreePath,
      worktreePath: input.worktreePath,
      branchName: "ambient/child",
    },
    nestedFanout: {
      required: true,
      source: "child_bridge_policy",
    },
  };
}

function workflowArtifact(store: ProjectStore, workspacePath: string, id: string) {
  return store.createWorkflowArtifact({
    id,
    title: `Callable ${id}`,
    status: "ready_for_preview",
    manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
    spec: { goal: `Run ${id}.`, summary: `Callable workflow artifact ${id}.` },
    sourcePath: join(workspacePath, ".ambient-codex", "workflows", id, "main.ts"),
    statePath: join(workspacePath, ".ambient-codex", "workflows", id, "state.json"),
  });
}

function workflowPlaybook(input: {
  id?: string;
  title?: string;
  version?: number;
  enabled?: boolean;
  archivedAt?: string;
  playbook?: Partial<NonNullable<WorkflowRecordingLibraryDescription["playbook"]>>;
} = {}): WorkflowRecordingLibraryDescription {
  const id = input.id ?? "recorded-workflow";
  return {
    id,
    title: input.title ?? "Recorded Workflow",
    version: input.version ?? 3,
    enabled: input.enabled ?? true,
    savedAt: "2026-06-06T18:00:00.000Z",
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
    threadId: `${id}-thread`,
    manifestPath: `/tmp/${id}/manifest.json`,
    markdownPath: `/tmp/${id}/workflow.md`,
    sidecarPath: `/tmp/${id}/workflow.json`,
    transcriptPath: `/tmp/${id}/transcript.jsonl`,
    markdownPreview: `# ${input.title ?? "Recorded Workflow"}\n\nCompact invocation preview.`,
    summary: input.playbook?.intent ?? "Run a recorded workflow playbook.",
    toolNames: [],
    outputShape: input.playbook?.outputShape ?? [],
    versions: [],
    playbook: {
      status: input.playbook?.status ?? "confirmed",
      source: "user_edit",
      generatedAt: "2026-06-06T17:50:00.000Z",
      confirmedAt: "2026-06-06T17:55:00.000Z",
      sourceCapturedAt: "2026-06-06T17:40:00.000Z",
      intent: input.playbook?.intent ?? "Run the reusable recorded workflow.",
      inputs: input.playbook?.inputs ?? ["Workflow target."],
      successfulExamples: input.playbook?.successfulExamples ?? [],
      doNot: input.playbook?.doNot ?? [],
      validation: input.playbook?.validation ?? ["Confirm the output is current."],
      outputShape: input.playbook?.outputShape ?? ["A concise result."],
      evidenceSummary: {
        messageCount: 3,
        toolResultCount: 1,
        successfulToolResultCount: 1,
        failedToolResultCount: 0,
        skippedToolResultCount: 0,
        permissionBlockedToolResultCount: 0,
        redactionCount: 0,
      },
      ...input.playbook,
    },
    callableInvocation: {
      schemaVersion: "ambient-workflow-recording-callable-invocation-v1",
      mode: "compact_callable_invocation",
      source: "workflow_recorder",
      workflowId: id,
      workflowVersion: input.version ?? 3,
      title: input.title ?? "Recorded Workflow",
      enabled: input.enabled ?? true,
      savedAt: "2026-06-06T18:00:00.000Z",
      input: {
        goal: input.playbook?.intent ?? "Run the reusable recorded workflow.",
        blocking: false,
        input_1: input.playbook?.inputs?.[0] ?? "Workflow target.",
      },
      inputSchemaHints: {
        required: ["goal"],
        properties: {
          goal: "Concrete goal for this recorded playbook invocation.",
          blocking: "Whether parent final synthesis must wait for this workflow run.",
          input_1: input.playbook?.inputs?.[0] ?? "Workflow target.",
        },
      },
      callableWorkflow: {
        defaultInvocation: "compact",
        invocation: "./workflow-invocation.json",
        diagnosticsTrace: "./diagnostics/full-trace.jsonl",
        recorderCompactInvocationByDefault: true,
        fullTraceArtifact: true,
      },
    },
  };
}
