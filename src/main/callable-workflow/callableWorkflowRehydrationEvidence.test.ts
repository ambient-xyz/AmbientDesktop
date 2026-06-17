import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  parentPiVisibleCallableWorkflowTools,
} from "./callableWorkflowRegistry";
import { buildCallableWorkflowExecutionPlan } from "./callableWorkflowExecutionPlan";
import {
  CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
  callableWorkflowQueuedTaskDraftFromExecutionPlan,
} from "./callableWorkflowTaskQueue";
import {
  buildCallableWorkflowRehydrationEvidence,
  summarizeCallableWorkflowRehydrationEvidence,
  type CallableWorkflowRehydrationEvidence,
  validateCallableWorkflowRehydrationEvidence,
} from "./callableWorkflowRehydrationEvidence";
import { ProjectStore } from "../projectStore";

const roots: string[] = [];
const enabledFlags = resolveAmbientFeatureFlags({
  settings: { subagents: true },
  generatedAt: "2026-06-11T03:00:00.000Z",
});

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("callable workflow rehydration evidence", () => {
  it("builds restart rehydration evidence for linked task artifacts, runs, progress, and usage", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const child = store.createThread("Child workflow rehydration caller");
      const assistant = store.addMessage({ threadId: child.id, role: "assistant", content: "" });
      const childRun = store.startRun({ threadId: child.id, assistantMessageId: assistant.id });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: executionPlanForChild({
          workspacePath,
          threadId: child.id,
          runId: childRun.id,
          assistantMessageId: assistant.id,
        }),
        featureFlagSnapshot: enabledFlags,
      });
      store.beginCallableWorkflowTaskCompilerHandoff(task.id);
      const artifact = store.createWorkflowArtifact({
        title: "Rehydration Workflow",
        status: "ready_for_preview",
        manifest: { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" },
        spec: { goal: "Keep callable workflow task links visible after restart." },
        sourcePath: join(workspacePath, ".ambient-codex", "workflows", "rehydration", "main.ts"),
        statePath: join(workspacePath, ".ambient-codex", "workflows", "rehydration", "state.json"),
      });
      store.linkCallableWorkflowTaskArtifact({ id: task.id, workflowArtifactId: artifact.id });
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
      store.markCallableWorkflowTaskRunStarted({
        id: task.id,
        workflowRunId: run.id,
        createdAt: "2026-06-11T03:01:00.000Z",
      });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "step.start",
        message: "Collect child workflow evidence",
        graphNodeId: "collect",
        createdAt: "2026-06-11T03:02:00.000Z",
      });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "step.end",
        message: "Collected child workflow evidence",
        graphNodeId: "collect",
        data: { usage: { tokenCount: 21, costMicros: 34 } },
        createdAt: "2026-06-11T03:03:00.000Z",
      });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "step.start",
        message: "Reduce rehydrated evidence",
        graphNodeId: "reduce",
        createdAt: "2026-06-11T03:04:00.000Z",
      });
      store.recordWorkflowModelCall({
        runId: run.id,
        task: "rehydrate.workflow.task",
        status: "succeeded",
        input: { goal: "Prove callable workflow task rehydration." },
        output: { summary: "Links and telemetry survived restart." },
        cacheCheckpoint: {
          id: "callable-workflow-rehydration-cache",
          stage: "runtime_call",
          workflowThreadId: artifact.workflowThreadId,
          stablePrefixHash: "stable-hash",
          stablePrefixChars: 240,
          stablePrefixEstimatedTokens: 60,
          mutableSuffixHash: "mutable-hash",
          mutableSuffixChars: 80,
          mutableSuffixEstimatedTokens: 20,
          requestHash: "request-hash",
          requestEstimatedTokens: 80,
          boundaryLabel: "Callable workflow rehydration boundary",
          createdAt: "2026-06-11T03:04:30.000Z",
        },
      });

      const beforeCloseTask = store.getCallableWorkflowTask(task.id);
      expect(beforeCloseTask).toMatchObject({
        workflowThreadId: artifact.workflowThreadId,
        workflowArtifactId: artifact.id,
        workflowRunId: run.id,
        progressSnapshot: {
          workflowRunStatus: "running",
          eventCount: 4,
          modelCallCount: 1,
          completedStepCount: 1,
        },
        usageSnapshot: {
          modelCallCount: 1,
          tokenCount: 21,
          tokenCountEstimated: false,
          costMicros: 34,
          costEstimated: false,
        },
      });
      store.close();

      reopened.openWorkspace(workspacePath);
      const reopenedTask = reopened.getCallableWorkflowTask(task.id);
      const reopenedArtifact = reopened.getWorkflowArtifact(artifact.id);
      const reopenedRun = reopened.getWorkflowRun(run.id);
      const eventTypes = reopened.listWorkflowRunEvents(run.id).map((event) => event.type);
      const evidence = buildCallableWorkflowRehydrationEvidence({
        beforeCloseTask,
        beforeCloseArtifact: artifact,
        reopenedTask,
        artifact: reopenedArtifact,
        workflowRun: reopenedRun,
        workflowRunEventTypes: eventTypes,
        createdAt: "2026-06-11T03:05:00.000Z",
      });

      expect(evidence).toMatchObject({
        schemaVersion: "ambient-callable-workflow-rehydration-evidence-v1",
        task: {
          id: task.id,
          status: "running",
          blocking: true,
          workflowThreadId: artifact.workflowThreadId,
          workflowArtifactId: artifact.id,
          workflowRunId: run.id,
        },
        rehydration: {
          sameTaskId: true,
          sameArtifactId: true,
          sameRunId: true,
          workflowThreadHydrated: true,
          artifactSourcePathHydrated: true,
          artifactStatePathHydrated: true,
          artifactMutationPolicyHydrated: true,
          artifactSpecHydrated: true,
          launchCardHydrated: true,
          executionPlanHydrated: true,
          progressHydrated: true,
          usageHydrated: true,
        },
        artifact: {
          id: artifact.id,
          title: "Rehydration Workflow",
          workflowThreadId: artifact.workflowThreadId,
          status: "ready_for_preview",
          sourcePath: artifact.sourcePath,
          statePath: artifact.statePath,
          mutationPolicy: "staged_until_approved",
          specGoal: "Keep callable workflow task links visible after restart.",
        },
        childCaller: {
          kind: "subagent_child_thread",
          threadId: child.id,
          runId: childRun.id,
          subagentRunId: "subagent-run",
          canonicalTaskPath: "parent/1",
        },
        progressSnapshot: {
          workflowRunStatus: "running",
          eventCount: 4,
          modelCallCount: 1,
          completedStepCount: 1,
          activeStepCount: 1,
          lastEventType: "step.start",
          lastEventMessage: "Reduce rehydrated evidence",
        },
        usageSnapshot: {
          modelCallCount: 1,
          tokenCount: 21,
          tokenCountEstimated: false,
          costMicros: 34,
          costEstimated: false,
        },
        taskEvents: {
          started: true,
          eventTypes: expect.arrayContaining([CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE, "step.end"]),
        },
        maturityAssertions: {
          workflow_rehydrated_task_links: {
            status: "passed",
            capabilities: expect.arrayContaining(["workflow_task_rehydration", "artifact_link"]),
          },
          workflow_rehydrated_artifact_payload: {
            status: "passed",
            capabilities: expect.arrayContaining(["artifact_link", "checkpoint_output"]),
          },
          workflow_rehydrated_progress_usage: {
            status: "passed",
            capabilities: expect.arrayContaining(["workflow_task_rehydration", "checkpoint_output"]),
          },
          workflow_rehydrated_child_provenance: {
            status: "passed",
            capabilities: expect.arrayContaining(["child_workflow_provenance", "workflow_task_rehydration"]),
          },
        },
      });
      expect(validateCallableWorkflowRehydrationEvidence(evidence)).toEqual({ valid: true, issues: [] });
      expect(summarizeCallableWorkflowRehydrationEvidence(evidence)).toEqual(expect.arrayContaining([
        `workflowThread: ${artifact.workflowThreadId}`,
        `workflowRun: ${run.id} running`,
        "rehydratedLinks: task=true artifact=true run=true",
        "artifact: source=true state=true mutation=staged_until_approved spec=true",
        "telemetry: events=4 modelCalls=1 tokens=21",
        expect.stringContaining("maturityAssertions: workflow_rehydrated_task_links:passed"),
        "valid: true",
      ]));
      await writeCallableWorkflowRehydrationEvidenceArtifact(evidence);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("rejects rehydration evidence without task links, artifact payloads, telemetry, or child provenance", () => {
    const evidence = callableWorkflowRehydrationEvidenceFixture();

    expect(validateCallableWorkflowRehydrationEvidence({
      ...evidence,
      rehydration: {
        ...evidence.rehydration,
        workflowThreadHydrated: false,
      },
    }).issues).toContain("Callable workflow rehydration proof is missing workflowThreadHydrated.");
    expect(validateCallableWorkflowRehydrationEvidence({
      ...evidence,
      rehydration: {
        ...evidence.rehydration,
        artifactSourcePathHydrated: false,
      },
    }).issues).toContain("Callable workflow rehydration proof is missing artifactSourcePathHydrated.");
    expect(validateCallableWorkflowRehydrationEvidence({
      ...evidence,
      childCaller: {
        ...evidence.childCaller,
        kind: "parent_thread",
      },
    }).issues).toContain("Callable workflow rehydration must prove child-originated caller provenance.");
    expect(validateCallableWorkflowRehydrationEvidence({
      ...evidence,
      usageSnapshot: {
        ...evidence.usageSnapshot,
        tokenCount: 0,
      },
    }).issues).toContain("Callable workflow rehydration usage is missing tokenCount.");
    expect(validateCallableWorkflowRehydrationEvidence({
      ...evidence,
      artifact: {
        ...evidence.artifact,
        statePath: "",
      },
    }).issues).toContain("Callable workflow rehydration artifact is missing statePath.");
    expect(validateCallableWorkflowRehydrationEvidence({
      ...evidence,
      artifact: {
        ...evidence.artifact,
        mutationPolicy: "unknown",
      },
    }).issues).toContain("Callable workflow rehydration artifact is missing mutationPolicy.");
    expect(validateCallableWorkflowRehydrationEvidence({
      ...evidence,
      artifact: {
        ...evidence.artifact,
        specGoal: "",
      },
    }).issues).toContain("Callable workflow rehydration artifact is missing specGoal.");
    expect(validateCallableWorkflowRehydrationEvidence({
      ...evidence,
      maturityAssertions: {
        ...evidence.maturityAssertions,
        workflow_rehydrated_progress_usage: {
          ...evidence.maturityAssertions.workflow_rehydrated_progress_usage,
          status: "failed" as "passed",
        },
      },
    }).issues).toContain(
      "Callable workflow rehydration maturity assertion workflow_rehydrated_progress_usage status is failed; expected passed.",
    );
    const {
      workflow_rehydrated_child_provenance: _workflowRehydratedChildProvenance,
      ...missingAssertion
    } = evidence.maturityAssertions;
    expect(validateCallableWorkflowRehydrationEvidence({
      ...evidence,
      maturityAssertions: missingAssertion,
    }).issues).toContain(
      "Callable workflow rehydration maturity assertion workflow_rehydrated_child_provenance is missing.",
    );
  });
});

async function writeCallableWorkflowRehydrationEvidenceArtifact(
  evidence: CallableWorkflowRehydrationEvidence,
): Promise<void> {
  const outputPath = process.env.AMBIENT_CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_OUT;
  if (!outputPath) return;
  const resolved = resolve(outputPath);
  const artifact = { ...evidence, createdAt: new Date().toISOString() };
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function tempWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ambient-callable-workflow-rehydration-"));
  roots.push(root);
  return root;
}

function executionPlanForChild(input: {
  workspacePath: string;
  threadId: string;
  runId: string;
  assistantMessageId: string;
}) {
  const registry = buildCallableWorkflowRegistry({
    featureFlagSnapshot: enabledFlags,
  });
  const tool = parentPiVisibleCallableWorkflowTools(registry)[0];
  if (!tool) throw new Error("Missing callable workflow tool");
  return buildCallableWorkflowExecutionPlan({
    descriptor: tool,
    runPlan: buildCallableWorkflowRunPlan(tool, {
      goal: "Prove callable workflow task rehydration after restart.",
      blocking: true,
      metricCriteria: [{ templateId: "map_reduce-metric", value: "Task, artifact, run, progress, and usage links survive reopen." }],
    }),
    parent: {
      threadId: input.threadId,
      runId: input.runId,
      assistantMessageId: input.assistantMessageId,
    },
    toolCallId: "rehydration-tool-call",
    callerProvenance: {
      kind: "subagent_child_thread",
      threadId: input.threadId,
      runId: input.runId,
      messageId: input.assistantMessageId,
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
        worktreePath: input.workspacePath,
        branchName: "ambient/child",
      },
      nestedFanout: {
        required: true,
        source: "child_bridge_policy",
      },
    },
    createdAt: "2026-06-11T03:00:00.000Z",
  });
}

function callableWorkflowRehydrationEvidenceFixture(): CallableWorkflowRehydrationEvidence {
  const executionPlan = executionPlanForChild({
    workspacePath: "/tmp/worktree",
    threadId: "child-thread",
    runId: "child-run",
    assistantMessageId: "child-message",
  });
  const task = {
    ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan),
    status: "running" as const,
    statusLabel: "Running",
    runnerDeferredReason: "workflow_run_started",
    workflowThreadId: "workflow-thread",
    workflowArtifactId: "artifact",
    workflowRunId: "workflow-run",
    progressSnapshot: {
      workflowRunStatus: "running" as const,
      eventCount: 4,
      modelCallCount: 1,
      completedStepCount: 1,
      activeStepCount: 1,
      lastEventType: "step.start",
      lastEventMessage: "Reduce rehydrated evidence",
      lastEventAt: "2026-06-11T03:04:00.000Z",
    },
    usageSnapshot: {
      modelCallCount: 1,
      tokenCount: 21,
      tokenCountEstimated: false,
      costMicros: 34,
      costEstimated: false,
    },
    createdAt: "2026-06-11T03:00:00.000Z",
    updatedAt: "2026-06-11T03:04:00.000Z",
    startedAt: "2026-06-11T03:01:00.000Z",
  };
  return buildCallableWorkflowRehydrationEvidence({
    beforeCloseTask: task,
    beforeCloseArtifact: {
      id: "artifact",
      workflowThreadId: "workflow-thread",
      title: "Rehydration Workflow",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" },
      spec: { goal: "Keep callable workflow task links visible after restart." },
      sourcePath: "/tmp/worktree/.ambient-codex/workflows/rehydration/main.ts",
      statePath: "/tmp/worktree/.ambient-codex/workflows/rehydration/state.json",
      createdAt: "2026-06-11T03:00:00.000Z",
      updatedAt: "2026-06-11T03:00:00.000Z",
    },
    reopenedTask: task,
    artifact: {
      id: "artifact",
      workflowThreadId: "workflow-thread",
      title: "Rehydration Workflow",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" },
      spec: { goal: "Keep callable workflow task links visible after restart." },
      sourcePath: "/tmp/worktree/.ambient-codex/workflows/rehydration/main.ts",
      statePath: "/tmp/worktree/.ambient-codex/workflows/rehydration/state.json",
      createdAt: "2026-06-11T03:00:00.000Z",
      updatedAt: "2026-06-11T03:00:00.000Z",
    },
    workflowRun: {
      id: "workflow-run",
      artifactId: "artifact",
      status: "running",
      startedAt: "2026-06-11T03:01:00.000Z",
      updatedAt: "2026-06-11T03:04:00.000Z",
    },
    workflowRunEventTypes: [CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE, "step.start", "step.end"],
    createdAt: "2026-06-11T03:05:00.000Z",
  });
}
