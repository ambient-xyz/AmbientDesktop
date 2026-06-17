import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { SubagentToolScopeResolution } from "../../shared/subagentToolScope";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import type { CallableWorkflowTaskRestartReconciliationSummary, ThreadWorktreeSummary, WorkflowArtifactSummary } from "../../shared/types";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  callableWorkflowToolName,
} from "./callableWorkflowRegistry";
import { buildCallableWorkflowExecutionPlan } from "./callableWorkflowExecutionPlan";
import {
  CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
  CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
  callableWorkflowQueuedTaskDraftFromExecutionPlan,
} from "./callableWorkflowTaskQueue";
import {
  buildCallableWorkflowDogfoodEvidence,
  summarizeCallableWorkflowDogfoodEvidence,
  type CallableWorkflowDogfoodEvidence,
  validateCallableWorkflowDogfoodEvidence,
} from "./callableWorkflowDogfoodEvidence";
import { executeCallableWorkflowTask } from "./callableWorkflowRunner";
import { ProjectStore } from "../projectStore/projectStore";
import {
  resolveSubagentLaunchWorkspaceToolPolicy,
  resolveSubagentToolScopeLaunchDenial,
} from "../subagents/subagentToolScopeLaunchPolicy";

const roots: string[] = [];
const STAGED_MUTATION_RELATIVE_PATH = "src/feature.txt";
const PARENT_SENTINEL_CONTENT = "parent workspace original\n";
const DOGFOOD_PREVIEW_MAX_CHARS = 180;
const enabledFlags = resolveAmbientFeatureFlags({
  settings: { subagents: true },
  generatedAt: "2026-06-11T00:00:00.000Z",
});

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("callable workflow dogfood evidence", () => {
  it("builds mutating child workflow dogfood evidence with restart repair proof", async () => {
    const fixture = await tempDogfoodWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();
    let mutationOutput: Awaited<ReturnType<typeof stageMutatingWorkflowOutput>> | undefined;

    try {
      store.openWorkspace(fixture.parentWorkspacePath);
      const child = store.createThread("Dogfood child workflow caller");
      const assistant = store.addMessage({ threadId: child.id, role: "assistant", content: "" });
      const childRun = store.startRun({ threadId: child.id, assistantMessageId: assistant.id });
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: executionPlanForChild({
          parentWorkspacePath: fixture.parentWorkspacePath,
          childWorktreePath: fixture.childWorktreePath,
          threadId: child.id,
          runId: childRun.id,
          assistantMessageId: assistant.id,
          toolCallId: "dogfood-mutating-tool-call",
        }),
        featureFlagSnapshot: enabledFlags,
      });

      const result = await executeCallableWorkflowTask({
        store,
        taskId: task.id,
        createWorkflowThread: (input) =>
          store.createWorkflowAgentThreadSummary({
            ...input,
            projectPath: fixture.childWorktreePath,
          }),
        compileWorkflowTask: async ({ workflowThread }) => {
          const artifact = workflowArtifact(store, fixture.childWorktreePath, workflowThread.id, "mutating-child-dogfood");
          const previewRun = store.startWorkflowRun({ artifactId: artifact.id, status: "previewed" });
          return { artifacts: [artifact], runs: [previewRun] };
        },
        runWorkflowTask: async ({ artifact, onRunStarted }) => {
          mutationOutput = await stageMutatingWorkflowOutput(fixture);
          const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
          onRunStarted(run.id);
          return {
            artifacts: [artifact],
            runs: [store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true })],
          };
        },
      });
      if (!result.artifact || !result.run) throw new Error("Expected callable workflow execution result.");
      if (!mutationOutput) throw new Error("Expected staged mutation output proof.");

      const eventTypes = store.listWorkflowRunEvents(result.run.id).map((event) => event.type);
      const restartSummary = await buildRestartRepairSummary({
        store,
        reopened,
        parentWorkspacePath: fixture.parentWorkspacePath,
        childWorktreePath: fixture.childWorktreePath,
        threadId: child.id,
        runId: childRun.id,
        assistantMessageId: assistant.id,
      });
      const evidence = buildCallableWorkflowDogfoodEvidence({
        task: result.task,
        artifact: result.artifact,
        workflowRun: result.run,
        workflowRunEventTypes: eventTypes,
        restartSummary,
        mutationOutput,
        deniedWorkflowScopeProof: workflowDeniedScopeProof(),
        createdAt: proofArtifactCreatedAt("2026-06-11T00:05:00.000Z"),
      });

      expect(evidence).toMatchObject({
        schemaVersion: "ambient-callable-workflow-dogfood-evidence-v1",
        task: {
          id: task.id,
          status: "succeeded",
          blocking: true,
          workflowArtifactId: result.artifact.id,
          workflowRunId: result.run.id,
        },
        launchCard: {
          present: true,
          blocking: true,
          defaultCollapsed: true,
          pauseResumeCancel: true,
        },
        childCaller: {
          kind: "subagent_child_thread",
          threadId: child.id,
          runId: childRun.id,
          subagentRunId: "subagent-run",
          canonicalTaskPath: "parent/1",
        },
        mutation: {
          mutationPolicy: "staged_until_approved",
          approvalRequired: true,
          approvalSource: "child_bridge_policy",
          approvalScope: "this_child_thread",
          worktreeRequired: true,
          worktreeIsolated: true,
          worktreeStatus: "active",
          worktreePathPresent: true,
          nestedFanoutRequired: true,
          nestedFanoutSource: "child_bridge_policy",
        },
        mutationOutput: {
          kind: "staged_file",
          stagedRelativePath: STAGED_MUTATION_RELATIVE_PATH,
          fullArtifactPath: callableWorkflowDogfoodMutationReportPath(fixture.childWorktreePath),
          previewTruncated: true,
          parentWorkspaceUnchanged: true,
        },
        taskEvents: {
          started: true,
          finished: true,
          eventTypes: expect.arrayContaining([
            CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
            CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
          ]),
        },
        parentBlocking: {
          blockedBeforeCompletion: true,
          unblockedAfterCompletion: true,
          waitingTaskIds: [result.task.id],
          attentionTaskIds: [],
          allowedUserChoiceIds: ["wait_again", "cancel_parent"],
        },
        deniedScope: {
          denied: true,
          denialKinds: ["phase4_isolation_required"],
          explicitToolRequestObserved: true,
          deniedCategoryIds: ["workflow.call"],
          deniedToolIds: ["callable_workflow:ambient_workflow_symphony_map_reduce"],
          bridgeReasons: expect.arrayContaining([
            "Callable workflow child bridge is disabled by child role policy.",
            "Callable workflow child bridge requires an active isolated child worktree.",
            "Callable workflow child bridge is unavailable because the nested fanout limit is exhausted.",
          ]),
        },
        restart: {
          terminalRepairObserved: true,
          issueKinds: ["workflow_run_terminal_task_unfinished"],
        },
        maturityAssertions: {
          workflow_launch_card_bounds: {
            status: "passed",
            capabilities: expect.arrayContaining(["workflow_launch", "launch_card_bounds", "pause_resume_cancel"]),
          },
          workflow_mutating_child_worker: {
            status: "passed",
            capabilities: expect.arrayContaining([
              "mutating_child_workflow",
              "child_scoped_approval",
              "isolated_child_worktree",
            ]),
          },
          workflow_parent_blocking_completion: {
            status: "passed",
            capabilities: expect.arrayContaining(["parent_blocking_workflow", "workflow_launch"]),
          },
          workflow_denied_child_scope: {
            status: "passed",
            capabilities: expect.arrayContaining(["denied_workflow_scope", "child_workflow_scope"]),
          },
          workflow_restart_repair: {
            status: "passed",
            capabilities: expect.arrayContaining(["workflow_task_rehydration", "restart_repair"]),
          },
        },
      });
      expect(validateCallableWorkflowDogfoodEvidence(evidence)).toEqual({ valid: true, issues: [] });
      expect(summarizeCallableWorkflowDogfoodEvidence(evidence)).toEqual(expect.arrayContaining([
        expect.stringContaining("launchCard: risk="),
        "mutationPolicy: staged_until_approved",
        "approval: child_bridge_policy / this_child_thread",
        `mutationOutput: staged_file ${STAGED_MUTATION_RELATIVE_PATH} parentUnchanged=true`,
        `parentBlocking: blocked=true unblocked=true`,
        "deniedScope: workflow.call / callable_workflow:ambient_workflow_symphony_map_reduce",
        "restartRepairObserved: true",
        expect.stringContaining("maturityAssertions: workflow_launch_card_bounds:passed"),
        "valid: true",
      ]));
      await writeCallableWorkflowDogfoodEvidenceArtifact(evidence);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("rejects dogfood evidence that drops child-scoped approval, mutation output, or restart repair proof", () => {
    const evidence = callableWorkflowDogfoodEvidenceFixture();

    expect(validateCallableWorkflowDogfoodEvidence({
      ...evidence,
      launchCard: {
        ...evidence.launchCard,
        defaultCollapsed: false,
      },
    }).issues).toContain("Callable workflow dogfood launch card must be default collapsed.");
    expect(validateCallableWorkflowDogfoodEvidence({
      ...evidence,
      mutation: {
        ...evidence.mutation,
        approvalSource: "launch_card",
      },
    }).issues).toContain("Callable workflow dogfood approval source must be child_bridge_policy.");
    expect(validateCallableWorkflowDogfoodEvidence({
      ...evidence,
      mutationOutput: {
        ...evidence.mutationOutput,
        parentWorkspaceUnchanged: false,
      },
    }).issues).toContain("Callable workflow dogfood mutation output must prove the parent workspace was unchanged.");
    expect(validateCallableWorkflowDogfoodEvidence({
      ...evidence,
      restart: {
        ...evidence.restart,
        terminalRepairObserved: false,
        repairedTaskIds: [],
      },
    }).issues).toEqual(expect.arrayContaining([
      "Callable workflow dogfood restart proof must observe workflow_run_terminal_task_unfinished repair.",
      "Callable workflow dogfood restart proof is missing repaired task IDs.",
    ]));
    expect(validateCallableWorkflowDogfoodEvidence({
      ...evidence,
      parentBlocking: {
        ...evidence.parentBlocking,
        blockedBeforeCompletion: false,
      },
    }).issues).toContain("Callable workflow dogfood must prove parent synthesis was blocked before workflow completion.");
    expect(validateCallableWorkflowDogfoodEvidence({
      ...evidence,
      deniedScope: {
        ...evidence.deniedScope,
        bridgeReasons: [],
      },
    }).issues).toEqual(expect.arrayContaining([
      "Callable workflow dogfood denied-scope proof is missing disabled child role policy reason.",
      "Callable workflow dogfood denied-scope proof is missing isolated worktree reason.",
      "Callable workflow dogfood denied-scope proof is missing exhausted nested fanout reason.",
    ]));
    expect(validateCallableWorkflowDogfoodEvidence({
      ...evidence,
      maturityAssertions: {
        ...evidence.maturityAssertions,
        workflow_parent_blocking_completion: {
          ...evidence.maturityAssertions.workflow_parent_blocking_completion,
          status: "failed" as "passed",
        },
      },
    }).issues).toContain(
      "Callable workflow dogfood maturity assertion workflow_parent_blocking_completion status is failed; expected passed.",
    );
    const {
      workflow_denied_child_scope: _workflowDeniedChildScope,
      ...missingAssertion
    } = evidence.maturityAssertions;
    expect(validateCallableWorkflowDogfoodEvidence({
      ...evidence,
      maturityAssertions: missingAssertion,
    }).issues).toContain("Callable workflow dogfood maturity assertion workflow_denied_child_scope is missing.");
  });
});

async function buildRestartRepairSummary(input: {
  store: ProjectStore;
  reopened: ProjectStore;
  parentWorkspacePath: string;
  childWorktreePath: string;
  threadId: string;
  runId: string;
  assistantMessageId: string;
}): Promise<CallableWorkflowTaskRestartReconciliationSummary> {
  const task = input.store.enqueueCallableWorkflowTask({
    executionPlan: executionPlanForChild({
      parentWorkspacePath: input.parentWorkspacePath,
      childWorktreePath: input.childWorktreePath,
      threadId: input.threadId,
      runId: input.runId,
      assistantMessageId: input.assistantMessageId,
      toolCallId: "dogfood-restart-tool-call",
    }),
    featureFlagSnapshot: enabledFlags,
  });
  input.store.beginCallableWorkflowTaskCompilerHandoff(task.id);
  const workflowThread = input.store.createWorkflowAgentThreadSummary({
    title: "Restart Dogfood",
    initialRequest: "Compile restart dogfood workflow.",
    phase: "compiling",
    projectPath: input.childWorktreePath,
  });
  const artifact = workflowArtifact(input.store, input.childWorktreePath, workflowThread.id, "restart-dogfood");
  input.store.linkCallableWorkflowTaskArtifact({ id: task.id, workflowArtifactId: artifact.id });
  const run = input.store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
  input.store.markCallableWorkflowTaskRunStarted({ id: task.id, workflowRunId: run.id });
  input.store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true });
  input.store.close();

  input.reopened.openWorkspace(input.parentWorkspacePath);
  return input.reopened.reconcileCallableWorkflowTaskRestartState({
    now: "2026-06-11T00:04:00.000Z",
  });
}

async function writeCallableWorkflowDogfoodEvidenceArtifact(
  evidence: CallableWorkflowDogfoodEvidence,
): Promise<void> {
  const outputPath = process.env.AMBIENT_CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_OUT;
  if (!outputPath) return;
  const resolved = resolve(outputPath);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

function proofArtifactCreatedAt(fallback: string): string {
  return process.env.AMBIENT_CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_OUT ? new Date().toISOString() : fallback;
}

async function tempDogfoodWorkspace(): Promise<{
  root: string;
  parentWorkspacePath: string;
  childWorktreePath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "ambient-callable-workflow-dogfood-"));
  roots.push(root);
  const parentWorkspacePath = join(root, "parent-workspace");
  const childWorktreePath = join(root, "child-worktree");
  await mkdir(join(parentWorkspacePath, "src"), { recursive: true });
  await mkdir(join(childWorktreePath, "src"), { recursive: true });
  await writeFile(join(parentWorkspacePath, STAGED_MUTATION_RELATIVE_PATH), PARENT_SENTINEL_CONTENT, "utf8");
  await writeFile(join(childWorktreePath, STAGED_MUTATION_RELATIVE_PATH), PARENT_SENTINEL_CONTENT, "utf8");
  return { root, parentWorkspacePath, childWorktreePath };
}

async function stageMutatingWorkflowOutput(input: {
  parentWorkspacePath: string;
  childWorktreePath: string;
}) {
  const stagedPath = join(input.childWorktreePath, STAGED_MUTATION_RELATIVE_PATH);
  const stagedContent = [
    "child worktree staged change",
    "source: callable workflow mutating dogfood",
    "approval: child_bridge_policy",
    "scope: this_child_thread",
    "",
  ].join("\n");
  await writeFile(stagedPath, stagedContent, "utf8");

  const reportPath = join(input.childWorktreePath, ".ambient-codex", "workflows", "mutating-child-dogfood", "mutation-report.md");
  await mkdir(dirname(reportPath), { recursive: true });
  const reportContent = [
    "# Child staged mutation",
    "",
    `Staged relative path: ${STAGED_MUTATION_RELATIVE_PATH}`,
    "Approval source: child_bridge_policy",
    "Approval scope: this_child_thread",
    "Worktree isolation: active child worktree",
    "Parent workspace sentinel: unchanged",
    "",
    "This report is intentionally longer than the bounded preview so the proof demonstrates that callers keep a compact preview and a full artifact pointer instead of copying the entire mutating worker output into parent context.",
    "",
  ].join("\n");
  await writeFile(reportPath, reportContent, "utf8");

  const durableReportPath = callableWorkflowDogfoodMutationReportPath(input.childWorktreePath);
  if (durableReportPath !== reportPath) {
    await mkdir(dirname(durableReportPath), { recursive: true });
    await writeFile(durableReportPath, reportContent, "utf8");
  }

  const parentSentinel = await readFile(join(input.parentWorkspacePath, STAGED_MUTATION_RELATIVE_PATH), "utf8");
  const preview = reportContent.slice(0, DOGFOOD_PREVIEW_MAX_CHARS);
  return {
    kind: "staged_file" as const,
    stagedRelativePath: STAGED_MUTATION_RELATIVE_PATH,
    stagedFileSha256: sha256Hex(stagedContent),
    fullArtifactPath: durableReportPath,
    fullArtifactBytes: Buffer.byteLength(reportContent, "utf8"),
    fullArtifactSha256: sha256Hex(reportContent),
    boundedPreview: preview,
    previewBytes: Buffer.byteLength(preview, "utf8"),
    previewTruncated: preview.length < reportContent.length,
    parentWorkspaceUnchanged: parentSentinel === PARENT_SENTINEL_CONTENT,
  };
}

function callableWorkflowDogfoodMutationReportPath(childWorktreePath: string): string {
  const evidenceOutputPath = process.env.AMBIENT_CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_OUT;
  if (!evidenceOutputPath) {
    return join(childWorktreePath, ".ambient-codex", "workflows", "mutating-child-dogfood", "mutation-report.md");
  }
  return join(dirname(resolve(evidenceOutputPath)), "mutation-report.md");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function executionPlanForChild(input: {
  parentWorkspacePath: string;
  childWorktreePath: string;
  threadId: string;
  runId: string;
  assistantMessageId: string;
  toolCallId: string;
}) {
  const registry = buildCallableWorkflowRegistry({
    featureFlagSnapshot: enabledFlags,
  });
  const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
  if (!descriptor) throw new Error("Missing map-reduce descriptor");
  return buildCallableWorkflowExecutionPlan({
    descriptor,
    runPlan: buildCallableWorkflowRunPlan(descriptor, {
      goal: "Stage a child-originated mutating workflow dogfood proof.",
      blocking: true,
      metricCriteria: [{ templateId: "map_reduce-metric", value: "Mutation proof keeps child identity and worktree evidence." }],
    }),
    parent: {
      threadId: input.threadId,
      runId: input.runId,
      assistantMessageId: input.assistantMessageId,
    },
    toolCallId: input.toolCallId,
    callerProvenance: childCallerProvenance(input),
    createdAt: "2026-06-11T00:00:00.000Z",
  });
}

function childCallerProvenance(input: {
  parentWorkspacePath: string;
  childWorktreePath: string;
  threadId: string;
  runId: string;
  assistantMessageId: string;
}) {
  return {
    kind: "subagent_child_thread" as const,
    threadId: input.threadId,
    runId: input.runId,
    messageId: input.assistantMessageId,
    subagentRunId: "subagent-run",
    canonicalTaskPath: "parent/1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    approval: {
      required: true,
      source: "child_bridge_policy" as const,
      failureHandling: "forward approval to parent",
      scopeHint: "this_child_thread" as const,
    },
    worktree: {
      required: true,
      isolated: true,
      status: "active" as const,
      workspacePath: input.parentWorkspacePath,
      worktreePath: input.childWorktreePath,
      branchName: "ambient/child",
    },
    nestedFanout: {
      required: true,
      source: "child_bridge_policy" as const,
    },
  };
}

function workflowArtifact(
  store: ProjectStore,
  workspacePath: string,
  workflowThreadId: string,
  slug: string,
): WorkflowArtifactSummary {
  return store.createWorkflowArtifact({
    workflowThreadId,
    title: "Dogfood Child Mutation",
    status: "ready_for_preview",
    manifest: { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" },
    spec: { goal: "Stage child workspace mutation.", summary: "Callable workflow dogfood artifact." },
    sourcePath: join(workspacePath, ".ambient-codex", "workflows", slug, "main.ts"),
    statePath: join(workspacePath, ".ambient-codex", "workflows", slug, "state.json"),
  });
}

function callableWorkflowDogfoodEvidenceFixture() {
  const task = {
    ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlanForChild({
      parentWorkspacePath: "/tmp/parent-workspace",
      childWorktreePath: "/tmp/child-worktree",
      threadId: "child-thread",
      runId: "child-run",
      assistantMessageId: "child-message",
      toolCallId: "fixture-tool-call",
    })),
    status: "succeeded" as const,
    statusLabel: "Succeeded",
    runnerDeferredReason: "workflow_run_succeeded",
    workflowThreadId: "workflow-thread",
    workflowArtifactId: "artifact",
    workflowRunId: "workflow-run",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:02:00.000Z",
    startedAt: "2026-06-11T00:01:00.000Z",
    completedAt: "2026-06-11T00:02:00.000Z",
  };
  return buildCallableWorkflowDogfoodEvidence({
    task,
    artifact: {
      id: "artifact",
      workflowThreadId: "workflow-thread",
      title: "Dogfood Child Mutation",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" },
      spec: { goal: "Stage child workspace mutation." },
      sourcePath: "/tmp/worktree/.ambient-codex/workflows/dogfood/main.ts",
      statePath: "/tmp/worktree/.ambient-codex/workflows/dogfood/state.json",
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:02:00.000Z",
    },
    mutationOutput: {
      kind: "staged_file",
      stagedRelativePath: STAGED_MUTATION_RELATIVE_PATH,
      stagedFileSha256: sha256Hex("child worktree staged change\n"),
      fullArtifactPath: "/tmp/child-worktree/.ambient-codex/workflows/dogfood/mutation-report.md",
      fullArtifactBytes: 256,
      fullArtifactSha256: sha256Hex("full mutation report"),
      boundedPreview: "Child staged mutation preview.",
      previewBytes: 30,
      previewTruncated: true,
      parentWorkspaceUnchanged: true,
    },
    workflowRun: {
      id: "workflow-run",
      artifactId: "artifact",
      status: "succeeded",
      startedAt: "2026-06-11T00:01:00.000Z",
      updatedAt: "2026-06-11T00:02:00.000Z",
      completedAt: "2026-06-11T00:02:00.000Z",
    },
    workflowRunEventTypes: [
      CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
      CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
    ],
    restartSummary: {
      schemaVersion: "ambient-callable-workflow-task-restart-v1",
      createdAt: "2026-06-11T00:03:00.000Z",
      issueCount: 1,
      repairedTaskIds: ["restart-task"],
      diagnosticTaskIds: ["restart-task"],
      staleWorkflowArtifactTaskIds: [],
      staleWorkflowRunTaskIds: [],
      issues: [{
        id: "workflow_run_terminal_task_unfinished:restart-task",
        kind: "workflow_run_terminal_task_unfinished",
        severity: "warning",
        message: "Restart task was repaired.",
        taskId: "restart-task",
        parentThreadId: "child-thread",
        parentRunId: "child-run",
        workflowArtifactId: "artifact",
        workflowRunId: "workflow-run",
      }],
    },
    deniedWorkflowScopeProof: workflowDeniedScopeProof(),
    createdAt: "2026-06-11T00:05:00.000Z",
  });
}

function workflowDeniedScopeProof() {
  const disabled = resolveSubagentLaunchWorkspaceToolPolicy({
    parentThread: { permissionMode: "workspace", workspacePath: "/repo" },
    childWorktree: worktree("active"),
    expectedChildThreadId: "child-thread",
  });
  const missingWorktree = resolveSubagentLaunchWorkspaceToolPolicy({
    parentThread: { permissionMode: "workspace", workspacePath: "/repo" },
    childWorktree: worktree("missing"),
    expectedChildThreadId: "child-thread",
    childWorkflowPolicy: {
      allowCallableWorkflowTools: true,
      allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
      nestedFanoutLimit: 3,
    },
  });
  const exhausted = resolveSubagentLaunchWorkspaceToolPolicy({
    parentThread: { permissionMode: "workspace", workspacePath: "/repo" },
    childWorktree: worktree("active"),
    expectedChildThreadId: "child-thread",
    childWorkflowPolicy: {
      allowCallableWorkflowTools: true,
      allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
      nestedFanoutLimit: 1,
      usedFanoutCount: 1,
    },
  });
  const launchDenial = resolveSubagentToolScopeLaunchDenial({
    scope: scope({
      deniedCategories: [
        { id: "workflow.call", reason: "Callable workflow child bridge is unavailable." },
      ],
      deniedTools: [
        {
          source: "callable_workflow",
          id: "ambient_workflow_symphony_map_reduce",
          categoryId: "workflow.call",
          reason: "Callable workflow child bridge is unavailable.",
        },
      ],
    }),
    requestedToolScope: {
      requestedSources: [
        {
          source: "callable_workflow",
          id: "ambient_workflow_symphony_map_reduce",
          categoryId: "workflow.call",
          piVisible: true,
        },
      ],
    },
  });
  if (!launchDenial) throw new Error("Expected callable workflow launch denial proof.");
  const bridgeReasons = [
    disabled.callableWorkflowBridge?.reason,
    missingWorktree.callableWorkflowBridge?.reason,
    exhausted.callableWorkflowBridge?.reason,
  ].filter((reason): reason is string => typeof reason === "string");
  if (bridgeReasons.length !== 3) throw new Error("Expected all callable workflow bridge denial reasons.");
  return {
    launchDenials: [launchDenial],
    bridgeReasons,
  };
}

function worktree(
  status: ThreadWorktreeSummary["status"],
  overrides: Partial<ThreadWorktreeSummary> = {},
): ThreadWorktreeSummary {
  return {
    threadId: "child-thread",
    projectRoot: "/repo",
    worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
    branchName: "ambient/child",
    baseRef: "abc123",
    status,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

function scope(overrides: Partial<SubagentToolScopeResolution> = {}): SubagentToolScopeResolution {
  return {
    schemaVersion: "ambient-subagent-tool-scope-v1",
    loadedCategories: ["workspace.read"],
    piVisibleCategories: ["workspace.read"],
    deniedCategories: [],
    loadedTools: [],
    piVisibleTools: [],
    deniedTools: [],
    approvalMode: "interactive",
    worktreeIsolated: false,
    fanoutAvailable: false,
    ...overrides,
  };
}
