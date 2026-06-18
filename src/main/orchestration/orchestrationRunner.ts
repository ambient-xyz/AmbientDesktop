import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { SendMessageInput } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { AgentRuntime } from "../agent-runtime/agentRuntime";
import { defaultOrchestrationProjectPath, projectBoardDependencyArtifactPromptSection, type ProjectStore } from "./orchestrationProjectStoreFacade";
import { getWorkspaceDiff } from "../workspace/workspaceFiles";
import { loadWorkflowFile, renderWorkflowPrompt, type WorkflowConfig } from "./orchestrationWorkflowFacade";
import { runWorkflowHook } from "./orchestrationHooks";
import { isRestartInterruptedOrchestrationRun, restartInterruptedContinuationPrompt } from "./orchestrationRecovery";
import { isTaskBlockedByDependencies } from "./orchestrationScheduler";
import { configureTaskWorkspaceRuntimeExcludes } from "./orchestrationWorkspace";
import {
  type ProjectBoardTaskToolAction,
  projectBoardTaskToolActionDiagnostics,
  projectBoardTaskToolActionsFromTexts,
  projectBoardTaskToolActionIntegrityIssues,
  projectBoardTaskToolBrowserTraces,
  projectBoardTaskToolChangedFiles,
  projectBoardTaskToolCommands,
  projectBoardNativeTaskToolNames,
  projectBoardTaskToolPromptSection,
  projectBoardTaskToolProtocolMissing,
  projectBoardTaskToolScreenshots,
  projectBoardTaskToolVisualChecks,
  projectBoardTaskToolActionsFromProofOfWork,
  projectBoardTaskToolActionsForScope,
  type ProjectBoardTaskToolActionScope,
} from "../project-board/projectBoardTaskTools";

const execFileAsync = promisify(execFile);
const AUTO_COMMIT_EXCLUDED_PATH_PREFIXES = [".ambient/", ".ambient-codex/", ".git/", "node_modules/"];
const AUTO_COMMIT_EXCLUDED_PATHS = new Set([".ambient", ".ambient-codex", ".git", "node_modules"]);

function mergeProjectBoardTaskToolActions(actions: ProjectBoardTaskToolAction[]): ProjectBoardTaskToolAction[] {
  const byId = new Map<string, ProjectBoardTaskToolAction>();
  for (const action of actions) {
    const current = byId.get(action.actionId);
    if (!current) {
      byId.set(action.actionId, action);
      continue;
    }
    byId.set(action.actionId, {
      ...current,
      ...action,
      metadata: {
        ...current.metadata,
        ...action.metadata,
      },
    } as ProjectBoardTaskToolAction);
  }
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.actionId.localeCompare(right.actionId));
}

export function mergeProjectBoardTaskActionProof(
  proofOfWork: Record<string, unknown>,
  storedProofOfWork: Record<string, unknown> | undefined,
  scope?: ProjectBoardTaskToolActionScope,
): Record<string, unknown> {
  const taskToolActions = projectBoardTaskToolActionsForScope(mergeProjectBoardTaskToolActions([
    ...projectBoardTaskToolActionsFromProofOfWork(storedProofOfWork),
    ...projectBoardTaskToolActionsFromProofOfWork(proofOfWork),
  ]), scope);
  if (taskToolActions.length === 0) return proofOfWork;
  return {
    ...proofOfWork,
    taskToolActions,
    taskActionDiagnostics: projectBoardTaskToolActionDiagnostics(taskToolActions),
  };
}

export function orchestrationProofHasTrustworthyTaskCompletion(
  proofOfWork: Record<string, unknown> | undefined,
  scope?: ProjectBoardTaskToolActionScope,
): boolean {
  const taskActions = projectBoardTaskToolActionsForScope(projectBoardTaskToolActionsFromProofOfWork(proofOfWork), scope);
  if (!taskActions.some((action) => action.action === "task_complete")) return false;
  return projectBoardTaskToolActionIntegrityIssues(taskActions).length === 0;
}

export const SIMULATED_FINAL_RESPONSE_ERROR_AFTER_DURABLE_TASK_COMPLETE =
  "Simulated final provider error after durable task_complete.";

export function shouldSimulateFinalResponseErrorAfterDurableTaskComplete(input: {
  runId: string;
  proofOfWork?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
}): boolean {
  const env = input.env ?? process.env;
  if (env.AMBIENT_E2E !== "1") return false;
  const target = env.AMBIENT_E2E_PROJECT_BOARD_FINAL_ERROR_AFTER_TASK_COMPLETE?.trim();
  if (!target) return false;
  if (target !== "1" && target !== "true" && target !== input.runId) return false;
  return orchestrationProofHasTrustworthyTaskCompletion(input.proofOfWork, { runId: input.runId });
}

export interface StartOrchestrationRunResult {
  threadId: string;
}

export interface StartPreparedOrchestrationRunOptions {
  permissionMode?: PermissionMode;
}

export type OrchestrationTaskTerminalState = "needs_review" | "needs_info" | "budget_exhausted" | "terminal_blocker" | "canceled";

export interface OrchestrationFocusLoopDecision {
  action: "continue" | "finish";
  reason: string;
  missingProof: string[];
}

export interface OrchestrationClosePolicy {
  source: "workflow" | "project_board";
  maxPasses: number;
  maxRuntimeMs?: number;
  pauseOnTerminalBlocker: boolean;
  smallestSufficientProof: boolean;
  summary: string;
}

const DEFAULT_PROJECT_BOARD_CARD_MAX_RUNTIME_MS = 20 * 60 * 1000;

export async function startPreparedOrchestrationRun(
  projectRoot: string,
  store: ProjectStore,
  runtime: AgentRuntime,
  runId: string,
  onUpdate?: () => void,
  onFinishedRun?: (runId: string) => Promise<void>,
  options: StartPreparedOrchestrationRunOptions = {},
): Promise<StartOrchestrationRunResult> {
  const run = store.getOrchestrationRun(runId);
  if (run.status !== "prepared" && run.status !== "failed" && run.status !== "canceled" && run.status !== "stalled") {
    throw new Error(`Only prepared, failed, canceled, or stalled orchestration runs can be started. Current status: ${run.status}`);
  }

  let task = store.getOrchestrationTask(run.taskId);
  task = store.refreshProjectBoardTaskDescriptionForTask(task.id) ?? task;
  const taskProjectRoot = task.projectPath || defaultOrchestrationProjectPath(projectRoot);
  const workflow = await loadWorkflowFile(join(taskProjectRoot, "WORKFLOW.md"));
  if (workflow.config.workspace.strategy === "git-worktree") {
    await configureTaskWorkspaceRuntimeExcludes(run.workspacePath).catch(() => false);
  }
  if (isTaskBlockedByDependencies(task, store.listOrchestrationTasks(), workflow.config)) {
    throw new Error(`Local Task ${task.identifier} is blocked by unsatisfied dependencies.`);
  }
  const projectBoardCard = store.getProjectBoardCardForOrchestrationTask(task.id);
  const activeProjectBoard = projectBoardCard ? store.getActiveProjectBoard() : undefined;
  const projectBoard = activeProjectBoard?.id === projectBoardCard?.boardId ? activeProjectBoard : undefined;
  const closePolicy = orchestrationClosePolicyForRun({
    workflowMaxTurns: workflow.config.orchestration.maxTurns,
    projectBoardCard,
    budgetPolicy: projectBoard?.charter?.budgetPolicy,
  });
  const proofPolicy = orchestrationProofPolicyForRun(workflow.config.proofOfWork, projectBoardCard);
  const thread = run.threadId
    ? store.getThread(run.threadId)
    : (store.ensureProjectBoardCardExecutionThreadForTask({ taskId: task.id, workspacePath: run.workspacePath }) ??
      store.createThread(`${task.identifier}: ${task.title}`, run.workspacePath));
  const dependencyArtifacts = await store.importProjectBoardDependencyArtifactsForTask({
    taskId: task.id,
    workspacePath: run.workspacePath,
  });
  store.updateOrchestrationRun({
    id: run.id,
    status: "running",
    threadId: thread.id,
    error: null,
    proofOfWork: {
      ...(run.proofOfWork ?? {}),
      dependencyArtifacts,
    },
  });
  store.updateOrchestrationTask({ id: task.id, state: "in_progress" });
  store.beginProjectBoardCardRun({ runId: run.id });
  onUpdate?.();

  const prompt = isRestartInterruptedOrchestrationRun(run)
    ? restartInterruptedContinuationPrompt({ task, workspacePath: run.workspacePath })
    : renderWorkflowPrompt(workflow.promptTemplate || defaultTaskPrompt(), {
        task: {
          ...task,
          description: task.description ?? "",
          priority: task.priority ?? "",
          labels: task.labels ?? [],
          blockedBy: task.blockedBy ?? [],
          projectPath: task.projectPath ?? "",
          branchName: task.branchName ?? "",
          workspacePath: task.workspacePath ?? "",
        } as unknown as Record<string, unknown>,
        attempt: { number: run.attemptNumber },
        workspace: { path: run.workspacePath },
        workflow: workflow.config as unknown as Record<string, unknown>,
      });
  const input: SendMessageInput = {
    threadId: thread.id,
    content: [
      orchestrationWorkspaceScopePromptSection({
        projectRoot: taskProjectRoot,
        workspacePath: run.workspacePath,
        workspaceStrategy: workflow.config.workspace.strategy,
      }),
      projectBoardCard
        ? projectBoardTaskToolPromptSection(projectBoardCard, projectBoard?.charter?.projectSummary ? { charterProjectSummary: projectBoard.charter.projectSummary } : {})
        : "",
      projectBoardDependencyArtifactPromptSection(dependencyArtifacts),
      prompt,
      workflow.config.agent.extraInstructions,
    ]
      .filter(Boolean)
      .join("\n\n"),
    permissionMode: workflow.config.agent.permissionMode ?? options.permissionMode ?? thread.permissionMode,
    collaborationMode: "agent",
    model: workflow.config.agent.model ?? thread.model ?? AMBIENT_DEFAULT_MODEL,
    thinkingLevel: workflow.config.agent.thinkingLevel ?? thread.thinkingLevel,
    delivery: "prompt",
  };

  void runAndRecordCompletion({
    projectRoot: taskProjectRoot,
    store,
    runtime,
    runId: run.id,
    taskId: task.id,
    taskIdentifier: task.identifier,
    threadId: thread.id,
    workspacePath: run.workspacePath,
    runStartedAt: run.startedAt,
    workflowConfig: workflow.config,
    proofPolicy,
    stallTimeoutMs: workflow.config.orchestration.stallTimeoutMs,
    closePolicy,
    input,
    onUpdate,
    onFinishedRun,
  });
  return { threadId: thread.id };
}

async function runAndRecordCompletion(input: {
  projectRoot: string;
  store: ProjectStore;
  runtime: AgentRuntime;
  runId: string;
  taskId: string;
  taskIdentifier: string;
  threadId: string;
  workspacePath: string;
  runStartedAt: string;
  workflowConfig: WorkflowConfig;
  proofPolicy: WorkflowConfig["proofOfWork"];
  stallTimeoutMs: number;
  closePolicy: OrchestrationClosePolicy;
  input: SendMessageInput;
  onUpdate?: () => void;
  onFinishedRun?: (runId: string) => Promise<void>;
}): Promise<void> {
  let lastProgressSnapshotAt = 0;
  const recordRunningProgress = (force = false) => {
    const nowMs = Date.now();
    if (!force && lastProgressSnapshotAt > 0 && nowMs - lastProgressSnapshotAt < 1000) return;
    lastProgressSnapshotAt = nowMs;
    const storedProofOfWork = input.store.getOrchestrationRun(input.runId).proofOfWork;
    const proofScope = { runId: input.runId, taskId: input.taskId };
    input.store.updateOrchestrationRun({
      id: input.runId,
      status: "running",
      threadId: input.threadId,
      proofOfWork: mergeProjectBoardTaskActionProof(
        collectRunTranscriptProgress(input.store, input.threadId, input.runStartedAt, new Date(nowMs), proofScope),
        storedProofOfWork,
        proofScope,
      ),
    });
  };
  const proofScope = { runId: input.runId, taskId: input.taskId };
  const stallMonitor = createStallMonitor({
    timeoutMs: input.stallTimeoutMs,
    onStalled: async () => {
      await input.runtime.abort(input.threadId);
      input.store.updateOrchestrationRun({
        id: input.runId,
        status: "stalled",
        threadId: input.threadId,
        error: `No Ambient/Pi activity for ${input.stallTimeoutMs}ms.`,
        proofOfWork: await collectProofOfWork(input.projectRoot, input.workspacePath, input.store, input.threadId, {
          ...proofScope,
          runStartedAt: input.runStartedAt,
        })
          .then((proof) => mergeProjectBoardTaskActionProof(proof, input.store.getOrchestrationRun(input.runId).proofOfWork, proofScope))
          .catch((error) =>
            mergeProjectBoardTaskActionProof(
              {
                kind: "agent-run",
                error: error instanceof Error ? error.message : String(error),
              },
              input.store.getOrchestrationRun(input.runId).proofOfWork,
              proofScope,
            ),
          ),
        finish: true,
        reviewProjectBoardProof: true,
      });
      input.store.updateOrchestrationTask({ id: input.taskId, state: "terminal_blocker" });
      input.onUpdate?.();
      if (input.onFinishedRun) await input.onFinishedRun(input.runId);
      input.onUpdate?.();
    },
  });
  const runtimeBudgetMonitor = createElapsedBudgetMonitor({
    timeoutMs: input.closePolicy.maxRuntimeMs ?? 0,
    onElapsed: async () => {
      await input.runtime.abort(input.threadId);
      recordRunningProgress(true);
      input.onUpdate?.();
    },
  });
  let passNumber = 1;
  let nextInput = input.input;
  try {
    while (passNumber <= input.closePolicy.maxPasses) {
      try {
        await input.runtime.send(nextInput, {
          onActivity: () => {
            if (stallMonitor.stalled) return;
            stallMonitor.touch();
            recordRunningProgress();
            input.onUpdate?.();
          },
          awaitQueuedDeliveryCompletion: true,
        });
      } catch (error) {
        if (!runtimeBudgetMonitor.elapsed) throw error;
      }
      if (
        shouldSimulateFinalResponseErrorAfterDurableTaskComplete({
          runId: input.runId,
          proofOfWork: input.store.getOrchestrationRun(input.runId).proofOfWork,
        })
      ) {
        throw new Error(SIMULATED_FINAL_RESPONSE_ERROR_AFTER_DURABLE_TASK_COMPLETE);
      }
      if (stallMonitor.stalled) return;
      if (runtimeBudgetMonitor.elapsed) {
        await finishRuntimeBudgetExceeded(input, passNumber);
        return;
      }
      const thread = input.store.getThread(input.threadId);
      let proofOfWork = await runAfterRunHook(
        input.projectRoot,
        input.workspacePath,
        mergeProjectBoardTaskActionProof(
          await collectProofOfWork(input.projectRoot, input.workspacePath, input.store, input.threadId, {
            ...proofScope,
            runStartedAt: input.runStartedAt,
          }),
          input.store.getOrchestrationRun(input.runId).proofOfWork,
          proofScope,
        ),
      );
      proofOfWork = mergeProjectBoardTaskActionProof(proofOfWork, input.store.getOrchestrationRun(input.runId).proofOfWork, proofScope);
      const canceled = proofOfWork.lastAssistantStatus === "aborted";
      const failed = proofOfWork.lastAssistantStatus === "error";
      const status = canceled ? "canceled" : failed ? "failed" : "completed";
      const error = canceled ? "Canceled by user." : failed ? String(proofOfWork.lastAssistantText ?? "") : null;
      if (status === "completed" && input.workflowConfig.workspace.strategy === "git-worktree") {
        proofOfWork = await withTaskWorkspaceAutoCommit(input.workspacePath, input.taskIdentifier, proofOfWork);
      }
      const decision = orchestrationFocusDecisionAfterRun({
        status,
        proofOfWork,
        proofPolicy: input.proofPolicy,
        passNumber,
        maxTurns: input.closePolicy.maxPasses,
        closePolicy: input.closePolicy,
      });
      const proofWithFocus = withFocusLoopProof(proofOfWork, decision, passNumber, input.closePolicy);

      if (decision.action === "continue") {
        input.store.updateOrchestrationRun({
          id: input.runId,
          status: "running",
          threadId: input.threadId,
          piSessionFile: thread.piSessionFile ?? null,
          proofOfWork: proofWithFocus,
          error: null,
        });
        input.store.updateOrchestrationTask({ id: input.taskId, state: "in_progress" });
        input.onUpdate?.();
        passNumber += 1;
        nextInput = { ...input.input, content: focusLoopContinuationPrompt(decision, passNumber, input.closePolicy), delivery: "prompt" };
        continue;
      }

      input.store.updateOrchestrationRun({
        id: input.runId,
        status,
        threadId: input.threadId,
        piSessionFile: thread.piSessionFile ?? null,
        proofOfWork: proofWithFocus,
        error,
        finish: true,
        reviewProjectBoardProof: true,
      });
      input.store.updateOrchestrationTask({
        id: input.taskId,
        state:
          decision.reason === "max-turns-exhausted" || decision.reason === "max-passes-exhausted"
            ? "budget_exhausted"
            : orchestrationTaskStateAfterRun({ status, error, proofOfWork: proofWithFocus }),
      });
      input.onUpdate?.();
      if (input.onFinishedRun) await input.onFinishedRun(input.runId);
      input.onUpdate?.();
      return;
    }
  } catch (error) {
    if (stallMonitor.stalled) return;
    const message = error instanceof Error ? error.message : String(error);
    const thread = input.store.getThread(input.threadId);
    let proofOfWork = await runAfterRunHook(
      input.projectRoot,
      input.workspacePath,
      mergeProjectBoardTaskActionProof(
        await collectProofOfWork(input.projectRoot, input.workspacePath, input.store, input.threadId, {
          ...proofScope,
          runStartedAt: input.runStartedAt,
        }).catch((proofError) => ({
          ...collectRunTranscriptProgress(input.store, input.threadId, input.runStartedAt, new Date(), proofScope),
          error: proofError instanceof Error ? proofError.message : String(proofError),
        })),
        input.store.getOrchestrationRun(input.runId).proofOfWork,
        proofScope,
      ),
    ).catch((hookError) =>
      mergeProjectBoardTaskActionProof(
        {
          ...collectRunTranscriptProgress(input.store, input.threadId, input.runStartedAt, new Date(), proofScope),
          afterRunHook: { ok: false, error: hookError instanceof Error ? hookError.message : String(hookError) },
        },
        input.store.getOrchestrationRun(input.runId).proofOfWork,
        proofScope,
      ),
    );
    proofOfWork = mergeProjectBoardTaskActionProof(proofOfWork, input.store.getOrchestrationRun(input.runId).proofOfWork, proofScope);
    const durableTaskCompletion = orchestrationProofHasTrustworthyTaskCompletion(proofOfWork, proofScope);
    proofOfWork = durableTaskCompletion
      ? {
          ...proofOfWork,
          lastAssistantStatus: "done_after_task_complete",
          lastAssistantText: "Durable task_complete was recorded before the final assistant response failed.",
          finalResponseError: {
            message,
            recoveredBy: "durable_task_complete",
            occurredAt: new Date().toISOString(),
          },
        }
      : {
          ...proofOfWork,
          error: message,
        };
    const status = durableTaskCompletion ? "completed" : "failed";
    const runError = durableTaskCompletion ? null : message;
    if (durableTaskCompletion && input.workflowConfig.workspace.strategy === "git-worktree") {
      proofOfWork = await withTaskWorkspaceAutoCommit(input.workspacePath, input.taskIdentifier, proofOfWork);
    }
    const decision = orchestrationFocusDecisionAfterRun({
      status,
      proofOfWork,
      proofPolicy: input.proofPolicy,
      passNumber,
      maxTurns: input.closePolicy.maxPasses,
      closePolicy: input.closePolicy,
    });
    const proofWithFocus = withFocusLoopProof(proofOfWork, decision, passNumber, input.closePolicy);
    input.store.updateOrchestrationRun({
      id: input.runId,
      status,
      threadId: input.threadId,
      piSessionFile: thread.piSessionFile ?? null,
      proofOfWork: proofWithFocus,
      error: runError,
      finish: true,
      reviewProjectBoardProof: true,
    });
    input.store.updateOrchestrationTask({
      id: input.taskId,
      state:
        decision.reason === "max-turns-exhausted" || decision.reason === "max-passes-exhausted"
          ? "budget_exhausted"
          : durableTaskCompletion
            ? "needs_review"
            : orchestrationTaskStateAfterRun({ status, error: runError, proofOfWork: proofWithFocus }),
    });
    input.onUpdate?.();
    if (input.onFinishedRun) await input.onFinishedRun(input.runId);
    input.onUpdate?.();
  } finally {
    stallMonitor.stop();
    runtimeBudgetMonitor.stop();
  }
}

async function finishRuntimeBudgetExceeded(
  input: Parameters<typeof runAndRecordCompletion>[0],
  passNumber: number,
): Promise<void> {
  const thread = input.store.getThread(input.threadId);
  const proofScope = { runId: input.runId, taskId: input.taskId };
  const maxRuntimeMs = input.closePolicy.maxRuntimeMs ?? 0;
  const startedAtMs = Date.parse(input.runStartedAt);
  const elapsedMs = Number.isFinite(startedAtMs) ? Math.max(0, Date.now() - startedAtMs) : maxRuntimeMs;
  const runtimeBudget = {
    exceeded: true,
    maxRuntimeMs,
    elapsedMs,
    stoppedAt: new Date().toISOString(),
    recommendedNextAction: "Review partial workspace changes and retry the card, split it, or create a follow-up with a narrower proof target.",
  };
  const proofOfWork: Record<string, unknown> = await runAfterRunHook(
    input.projectRoot,
    input.workspacePath,
    mergeProjectBoardTaskActionProof(
      await collectProofOfWork(input.projectRoot, input.workspacePath, input.store, input.threadId, {
        ...proofScope,
        runStartedAt: input.runStartedAt,
      }),
      input.store.getOrchestrationRun(input.runId).proofOfWork,
      proofScope,
    ),
  ).catch((error) => ({
    ...mergeProjectBoardTaskActionProof(
      collectRunTranscriptProgress(input.store, input.threadId, input.runStartedAt, new Date(), proofScope),
      input.store.getOrchestrationRun(input.runId).proofOfWork,
      proofScope,
    ),
    error: error instanceof Error ? error.message : String(error),
  }));
  const lastAssistantStatus = typeof proofOfWork.lastAssistantStatus === "string" ? proofOfWork.lastAssistantStatus : undefined;
  const decision: OrchestrationFocusLoopDecision = {
    action: "finish",
    reason: "runtime-budget-exceeded",
    missingProof: [
      `Project-board runtime budget exceeded after ${formatRuntimeDuration(maxRuntimeMs)}.`,
      runtimeBudget.recommendedNextAction,
    ],
  };
  const proofWithRuntimeBudget = withFocusLoopProof(
    {
      ...proofOfWork,
      lastAssistantStatus: lastAssistantStatus === "aborted" ? "runtime_budget_exceeded" : lastAssistantStatus,
      projectBoardRuntimeBudget: runtimeBudget,
    },
    decision,
    passNumber,
    input.closePolicy,
  );

  input.store.updateOrchestrationRun({
    id: input.runId,
    status: "completed",
    threadId: input.threadId,
    piSessionFile: thread.piSessionFile ?? null,
    proofOfWork: proofWithRuntimeBudget,
    error: null,
    finish: true,
    reviewProjectBoardProof: true,
  });
  input.store.updateOrchestrationTask({ id: input.taskId, state: "budget_exhausted" });
  input.onUpdate?.();
  if (input.onFinishedRun) await input.onFinishedRun(input.runId);
  input.onUpdate?.();
}

export function orchestrationClosePolicyForRun(input: {
  workflowMaxTurns: number;
  projectBoardCard?: Pick<ProjectBoardCard, "id" | "title">;
  budgetPolicy?: Record<string, unknown>;
}): OrchestrationClosePolicy {
  const workflowMaxTurns = Number.isFinite(input.workflowMaxTurns) ? Math.max(1, Math.floor(input.workflowMaxTurns)) : 1;
  const projectBoardMaxPasses = readPositiveIntegerPolicy(input.budgetPolicy?.maxPassesPerCard);
  const projectBoardMaxRuntimeMs = readPositiveRuntimeMsPolicy(input.budgetPolicy) ?? DEFAULT_PROJECT_BOARD_CARD_MAX_RUNTIME_MS;
  const pauseOnTerminalBlocker = readBooleanPolicy(input.budgetPolicy?.pauseOnTerminalBlocker, true);
  const smallestSufficientProof = readBooleanPolicy(input.budgetPolicy?.smallestSufficientProof, true);

  if (input.projectBoardCard && projectBoardMaxPasses !== undefined) {
    const maxPasses = projectBoardMaxPasses;
    return {
      source: "project_board",
      maxPasses,
      maxRuntimeMs: projectBoardMaxRuntimeMs,
      pauseOnTerminalBlocker,
      smallestSufficientProof,
      summary: `Project-board card close policy: stop once the smallest sufficient proof is present, after ${maxPasses} pass${maxPasses === 1 ? "" : "es"}, or after ${formatRuntimeDuration(projectBoardMaxRuntimeMs)} of worker runtime.`,
    };
  }

  const maxPasses = workflowMaxTurns;
  return {
    source: "workflow",
    maxPasses,
    pauseOnTerminalBlocker: true,
    smallestSufficientProof: true,
    summary: `Workflow close policy: stop once required proof is present, or after ${maxPasses} turn${maxPasses === 1 ? "" : "s"}.`,
  };
}

export function orchestrationProofPolicyForRun(
  workflowPolicy: WorkflowConfig["proofOfWork"],
  projectBoardCard?: Pick<ProjectBoardCard, "testPlan">,
): WorkflowConfig["proofOfWork"] {
  if (!projectBoardCard) return workflowPolicy;
  const unitCount = projectBoardCard.testPlan.unit.length;
  const integrationCount = projectBoardCard.testPlan.integration.length;
  const visualCount = projectBoardCard.testPlan.visual.length;
  return {
    ...workflowPolicy,
    requireTests: workflowPolicy.requireTests || unitCount > 0 || integrationCount > 0,
    requireScreenshots: workflowPolicy.requireScreenshots || visualCount > 0,
  };
}

function readPositiveIntegerPolicy(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function readBooleanPolicy(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readPositiveRuntimeMsPolicy(policy: Record<string, unknown> | undefined): number | undefined {
  const fromMs = readPositiveIntegerPolicy(policy?.maxRuntimeMsPerCard);
  if (fromMs !== undefined) return fromMs;
  const fromMinutes = readPositiveNumberPolicy(policy?.maxRuntimeMinutesPerCard);
  if (fromMinutes !== undefined) return Math.max(1, Math.round(fromMinutes * 60 * 1000));
  return undefined;
}

function readPositiveNumberPolicy(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function formatRuntimeDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "the configured runtime budget";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
}

export function orchestrationTaskStateAfterRun(input: {
  status: string;
  error?: string | null;
  proofOfWork?: Record<string, unknown>;
}): OrchestrationTaskTerminalState {
  if (input.status === "canceled") return "canceled";
  if (input.status === "stalled") {
    return isRestartInterruptedOrchestrationRun({
      status: input.status,
      error: input.error ?? undefined,
      proofOfWork: input.proofOfWork,
    })
      ? "needs_info"
      : "terminal_blocker";
  }

  const evidence = orchestrationRunEvidenceText(input.error, input.proofOfWork);
  const pauseState = orchestrationPauseStateFromEvidence(evidence);
  if (pauseState) return pauseState;
  if (input.status === "completed") return "needs_review";
  return "terminal_blocker";
}

export function orchestrationFocusDecisionAfterRun(input: {
  status: string;
  proofOfWork?: Record<string, unknown>;
  proofPolicy: WorkflowConfig["proofOfWork"];
  passNumber: number;
  maxTurns: number;
  closePolicy?: OrchestrationClosePolicy;
}): OrchestrationFocusLoopDecision {
  const projectBoardTaskActionMissing = projectBoardTaskActionProtocolMissingProof(input.proofOfWork, input.closePolicy);
  if (input.status !== "completed") {
    if (
      input.status === "failed" &&
      input.passNumber < input.maxTurns &&
      input.closePolicy?.source === "project_board" &&
      shouldRecoverProjectBoardFailedRun(input.proofOfWork, projectBoardTaskActionMissing)
    ) {
      return {
        action: "continue",
        reason: "failed-missing-terminal-task-action",
        missingProof: projectBoardTaskActionMissing.length
          ? projectBoardTaskActionMissing
          : ["project-board task action protocol: inspect the partial workspace and report proof, a blocker, a follow-up, or a handoff"],
      };
    }
    return { action: "finish", reason: `run-${input.status}`, missingProof: [] };
  }

  const evidence = orchestrationRunEvidenceText(undefined, input.proofOfWork);
  const pauseState = orchestrationPauseStateFromEvidence(evidence);
  if (pauseState && (input.closePolicy?.pauseOnTerminalBlocker ?? true)) return { action: "finish", reason: pauseState, missingProof: [] };

  const missingProof = [...missingProofRequirements(input.proofOfWork, input.proofPolicy), ...projectBoardTaskActionMissing];
  if (missingProof.length === 0) return { action: "finish", reason: "proof-satisfied", missingProof };
  if (input.passNumber >= input.maxTurns) {
    return {
      action: "finish",
      reason: input.closePolicy?.source === "project_board" ? "max-passes-exhausted" : "max-turns-exhausted",
      missingProof,
    };
  }
  return { action: "continue", reason: "missing-proof", missingProof };
}

function projectBoardTaskActionProtocolMissingProof(
  proofOfWork: Record<string, unknown> | undefined,
  closePolicy: OrchestrationClosePolicy | undefined,
): string[] {
  if (closePolicy?.source !== "project_board") return [];
  return projectBoardTaskToolProtocolMissing(projectBoardTaskToolActionsFromProofOfWork(proofOfWork)).map((missing) => `project-board task action protocol: ${missing}`);
}

function shouldRecoverProjectBoardFailedRun(proofOfWork: Record<string, unknown> | undefined, taskActionMissing: string[]): boolean {
  if (!taskActionMissing.length) return false;
  const evidence = orchestrationRunEvidenceText(undefined, proofOfWork);
  if (/\brequest was aborted\b|\bruntime returned an error\b|\bstream stalled\b|\bdid not start streaming\b|\btimeout\b|\btemporar(?:y|ily)\b|\bnetwork\b/.test(evidence)) {
    return true;
  }
  return taskActionMissing.some((item) => item.includes("terminal_task_action")) && hasPartialProjectBoardWorkEvidence(proofOfWork);
}

function hasPartialProjectBoardWorkEvidence(proofOfWork: Record<string, unknown> | undefined): boolean {
  if (!proofOfWork) return false;
  return hasDiffEvidence(proofOfWork) ||
    hasVerificationEvidence(proofOfWork) ||
    hasScreenshotEvidence(proofOfWork) ||
    projectBoardTaskToolActionsFromProofOfWork(proofOfWork).length > 0;
}

function missingProofRequirements(proofOfWork: Record<string, unknown> | undefined, policy: WorkflowConfig["proofOfWork"]): string[] {
  const missing: string[] = [];
  const taskActionIntegrityIssues = projectBoardTaskToolActionIntegrityIssues(projectBoardTaskToolActionsFromProofOfWork(proofOfWork));
  if (taskActionIntegrityIssues.length > 0) missing.push(`non-placeholder task action proof (${taskActionIntegrityIssues[0]})`);
  if (policy.requireDiffSummary && !hasDiffEvidence(proofOfWork)) missing.push("diff summary or changed files");
  if (policy.requireTests && !hasVerificationEvidence(proofOfWork)) missing.push("test or command output");
  if (policy.requireScreenshots) {
    if (!hasScreenshotEvidence(proofOfWork)) {
      missing.push("screenshot evidence");
    } else {
      const browserEvidence = proofObject(proofOfWork?.browserEvidence);
      if (browserEvidence?.interactionEvidenceStatus === "weak_no_visual_change_after_input") {
        missing.push("changed visual evidence after browser input");
      }
    }
  }
  return missing;
}

function hasDiffEvidence(proofOfWork: Record<string, unknown> | undefined): boolean {
  if (!proofOfWork) return false;
  if (Array.isArray(proofOfWork.changedFiles) && proofOfWork.changedFiles.length > 0) return true;
  if (Array.isArray(proofOfWork.toolChangedFiles) && proofOfWork.toolChangedFiles.length > 0) return true;
  if (Array.isArray(proofOfWork.gitStatus) && proofOfWork.gitStatus.length > 0) return true;
  if (projectBoardTaskToolChangedFiles(projectBoardTaskToolActionsFromProofOfWork(proofOfWork)).length > 0) return true;
  return typeof proofOfWork.diff === "string" && proofOfWork.diff.trim().length > 0;
}

function hasVerificationEvidence(proofOfWork: Record<string, unknown> | undefined): boolean {
  if (!proofOfWork) return false;
  const taskActionCommands = projectBoardTaskToolCommands(projectBoardTaskToolActionsFromProofOfWork(proofOfWork));
  if (taskActionCommands.length > 0) return true;
  if (proofOfWork.afterRunHook && typeof proofOfWork.afterRunHook === "object") return true;
  if (Array.isArray(proofOfWork.commands) && proofOfWork.commands.some((command) => proofEvidenceText(command).match(verificationEvidencePattern()))) {
    return true;
  }
  if (Array.isArray(proofOfWork.testResults) && proofOfWork.testResults.length > 0) return true;
  if (typeof proofOfWork.testOutput === "string" && proofOfWork.testOutput.trim()) return true;
  const text = typeof proofOfWork.lastAssistantText === "string" ? proofOfWork.lastAssistantText.toLowerCase() : "";
  return verificationEvidencePattern().test(text);
}

function hasScreenshotEvidence(proofOfWork: Record<string, unknown> | undefined): boolean {
  if (!proofOfWork) return false;
  const taskActions = projectBoardTaskToolActionsFromProofOfWork(proofOfWork);
  if (projectBoardTaskToolScreenshots(taskActions).length > 0 || projectBoardTaskToolBrowserTraces(taskActions).length > 0) return true;
  if (projectBoardTaskToolVisualChecks(taskActions).length > 0) return true;
  if (Array.isArray(proofOfWork.screenshots) && proofOfWork.screenshots.length > 0) return true;
  if (Array.isArray(proofOfWork.visualChecks) && proofOfWork.visualChecks.length > 0) return true;
  const browserEvidence = proofObject(proofOfWork.browserEvidence);
  return Number(browserEvidence?.screenshotCount ?? 0) > 0 || Number(browserEvidence?.visualCheckCount ?? 0) > 0;
}

function proofObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function verificationEvidencePattern(): RegExp {
  return /\b(unit|vitest|jest|spec|tests?|passed|pnpm test|npm test|typecheck|tsc|build|smoke|playwright)\b/;
}

function proofEvidenceText(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object") return JSON.stringify(value).toLowerCase();
  return "";
}

function orchestrationRunEvidenceText(error: string | null | undefined, proofOfWork: Record<string, unknown> | undefined): string {
  return [
    error,
    typeof proofOfWork?.lastAssistantText === "string" ? proofOfWork.lastAssistantText : "",
    typeof proofOfWork?.error === "string" ? proofOfWork.error : "",
    Array.isArray(proofOfWork?.taskToolActions) ? JSON.stringify(proofOfWork.taskToolActions) : "",
    proofOfWork?.browserEvidence ? JSON.stringify(proofOfWork.browserEvidence) : "",
    Array.isArray(proofOfWork?.visualChecks) ? JSON.stringify(proofOfWork.visualChecks) : "",
    Array.isArray(proofOfWork?.browserTraces) ? JSON.stringify(proofOfWork.browserTraces) : "",
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function orchestrationPauseStateFromEvidence(evidence: string): OrchestrationTaskTerminalState | undefined {
  if (/\b(budget|token|tokens|limit|quota|rate limit|context window|maximum)\b/.test(evidence)) return "budget_exhausted";
  const userInputBlocker =
    /\b(?:need|needs|missing|requires|required|provide)\s+(?:an?\s+)?(?:api\s+)?(?:api key|credentials?|secret|permission|login|clarification|user input|access)\b/.test(evidence) ||
    /\b(?:api\s+)?(?:api key|credentials?|secret|permission|login|clarification|user input|access)\s+(?:is|are)\s+(?:missing|required|needed)\b/.test(evidence) ||
    /\bblocked\b.{0,80}\b(?:api\s+)?(?:api key|credentials?|secret|permission|login|clarification|user input|access)\b/.test(evidence) ||
    /\b(?:question|clarify)\s+(?:for|with|from)\s+(?:the\s+)?(?:user|operator|requester)\b/.test(evidence);
  if (userInputBlocker) {
    return "needs_info";
  }
  return undefined;
}

function withFocusLoopProof(
  proofOfWork: Record<string, unknown>,
  decision: OrchestrationFocusLoopDecision,
  passNumber: number,
  closePolicy: OrchestrationClosePolicy,
): Record<string, unknown> {
  return {
    ...proofOfWork,
    focusLoop: {
      passNumber,
      maxTurns: closePolicy.maxPasses,
      maxPasses: closePolicy.maxPasses,
      action: decision.action,
      reason: decision.reason,
      missingProof: decision.missingProof,
      closePolicy: {
        source: closePolicy.source,
        maxRuntimeMs: closePolicy.maxRuntimeMs,
        pauseOnTerminalBlocker: closePolicy.pauseOnTerminalBlocker,
        smallestSufficientProof: closePolicy.smallestSufficientProof,
        summary: closePolicy.summary,
      },
    },
  };
}

function focusLoopContinuationPrompt(decision: OrchestrationFocusLoopDecision, nextPassNumber: number, closePolicy: OrchestrationClosePolicy): string {
  const missing = decision.missingProof.length ? decision.missingProof.map((item) => `- ${item}`).join("\n") : "- proof required by the workflow";
  const guidance = focusLoopMissingProofGuidance(decision.missingProof);
  return [
    `Continue this orchestration task. This is focus-loop pass ${nextPassNumber} of ${closePolicy.maxPasses}.`,
    "The previous pass ended without the proof required to close the task.",
    closePolicy.smallestSufficientProof
      ? "Make the smallest sufficient change or proof packet needed to close the card; do not broaden scope."
      : "Continue improving the card until the requested scope and proof are complete.",
    "",
    "Missing proof:",
    missing,
    guidance.length ? ["", "Proof guidance:", ...guidance].join("\n") : "",
    "",
    closePolicy.summary,
    closePolicy.source === "project_board"
      ? [
          "",
          "Project-board terminal action requirement:",
          "- If you have changed files, run or inspect the smallest relevant verification and call task_report_proof with real changedFiles/commands/screenshots/manualChecks.",
          "- If the card is complete after proof, call task_complete. If it is not complete, call task_report_handoff, task_create_followup, or task_block with concrete remaining work.",
          "- Do not end this pass with only task_show/task_heartbeat or prose; Ambient needs a terminal task action to classify the run.",
        ].join("\n")
      : "",
    "",
    "Keep working in the same workspace. If the task is complete, collect the missing proof. If you are blocked, say exactly what information, budget, or terminal blocker prevents completion.",
  ].join("\n");
}

function focusLoopMissingProofGuidance(missingProof: string[]): string[] {
  const guidance: string[] = [];
  if (missingProof.some((item) => item.includes("test") || item.includes("command"))) {
    guidance.push("- Run the relevant verification command and include the exact command plus result in the proof packet.");
  }
  if (missingProof.some((item) => item.includes("screenshot"))) {
    guidance.push(
      "- Visual proof requires a real screenshot or structured visual-check artifact; a narrative claim that a canvas is nonblank is not sufficient.",
    );
    guidance.push(
      "- For local web apps, start the dev server from the prepared workspace, open the page with browser_nav, then capture proof with browser_screenshot.",
    );
    guidance.push(
      "- For interactive browser proof, use browser_keypress for real keyboard input before the post-interaction screenshot or state check.",
    );
    guidance.push(
      "- If browser_screenshot repeatedly returns an empty image, browser viewport metrics stay 0x0, or browser tooling is genuinely unavailable, say that as a terminal blocker instead of marking visual/manual proof complete.",
    );
  }
  return guidance;
}

export function createStallMonitor(input: { timeoutMs: number; onStalled: () => Promise<void> }): {
  readonly stalled: boolean;
  touch: () => void;
  stop: () => void;
} {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let stalled = false;
  const arm = () => {
    if (stopped || input.timeoutMs <= 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (stopped) return;
      stalled = true;
      stopped = true;
      void input.onStalled();
    }, input.timeoutMs);
  };
  arm();
  return {
    get stalled() {
      return stalled;
    },
    touch: arm,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

export function createElapsedBudgetMonitor(input: { timeoutMs: number; onElapsed: () => Promise<void> }): {
  readonly elapsed: boolean;
  stop: () => void;
} {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let elapsed = false;
  if (input.timeoutMs > 0) {
    timer = setTimeout(() => {
      if (stopped) return;
      elapsed = true;
      stopped = true;
      void input.onElapsed();
    }, input.timeoutMs);
  }
  return {
    get elapsed() {
      return elapsed;
    },
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

async function runAfterRunHook(
  projectRoot: string,
  workspacePath: string,
  proofOfWork: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const workflow = await loadWorkflowFile(join(projectRoot, "WORKFLOW.md"));
  const hook = await runWorkflowHook("afterRun", workflow.config.hooks.afterRun, workspacePath, {
    timeoutMs: workflow.config.hooks.timeoutMs,
    permissionMode: workflow.config.agent.permissionMode ?? "full-access",
    workspacePath,
  });
  return hook ? { ...proofOfWork, afterRunHook: hook } : proofOfWork;
}

async function withTaskWorkspaceAutoCommit(
  workspacePath: string,
  taskId: string,
  proofOfWork: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await autoCommitCompletedTaskWorkspaceChanges(workspacePath, taskId, proofOfWork);
  return result ? { ...proofOfWork, taskWorkspaceAutoCommit: result } : proofOfWork;
}

export interface TaskWorkspaceAutoCommitResult {
  status: "committed" | "skipped" | "failed";
  reason?: string;
  commit?: string;
  changedFiles: string[];
  excludedFiles?: string[];
  error?: string;
}

export async function autoCommitCompletedTaskWorkspaceChanges(
  workspacePath: string,
  taskId: string,
  proofOfWork: Record<string, unknown>,
): Promise<TaskWorkspaceAutoCommitResult | undefined> {
  const taskActions = projectBoardTaskToolActionsFromProofOfWork(proofOfWork);
  if (!taskActions.some((action) => action.action === "task_complete")) return undefined;

  const repo = await gitForAutoCommit(workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  if (!repo.ok || repo.stdout.trim() !== "true") return undefined;

  const candidatePaths = autoCommitCandidatePaths(proofOfWork, taskActions);
  const materialCandidatePaths = candidatePaths.filter((file) => !autoCommitExcludedPath(file));
  const excludedCandidatePaths = candidatePaths.filter(autoCommitExcludedPath);
  if (candidatePaths.length === 0 || materialCandidatePaths.length === 0) {
    return {
      status: "skipped",
      reason: "task_complete did not report material changed files",
      changedFiles: [],
      ...(excludedCandidatePaths.length ? { excludedFiles: excludedCandidatePaths } : {}),
    };
  }

  const statusBefore = await gitForAutoCommit(workspacePath, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    ...materialCandidatePaths,
  ]);
  if (!statusBefore.ok) {
    return {
      status: "failed",
      reason: "could not inspect task workspace changes",
      changedFiles: materialCandidatePaths,
      ...(excludedCandidatePaths.length ? { excludedFiles: excludedCandidatePaths } : {}),
      error: statusBefore.stderr || statusBefore.stdout,
    };
  }

  const statusPaths = parseGitStatusZPaths(statusBefore.stdout);
  const changedFiles = statusPaths.filter((file) => !autoCommitExcludedPath(file));
  const excludedFiles = [...new Set([...excludedCandidatePaths, ...statusPaths.filter(autoCommitExcludedPath)])].sort();
  if (changedFiles.length === 0) {
    return {
      status: "skipped",
      reason: "no material task changes were dirty",
      changedFiles: [],
      ...(excludedFiles.length ? { excludedFiles } : {}),
    };
  }

  const added = await gitForAutoCommit(workspacePath, ["add", "-A", "--", ...changedFiles]);
  if (!added.ok) {
    return {
      status: "failed",
      reason: "could not stage completed task changes",
      changedFiles,
      ...(excludedFiles.length ? { excludedFiles } : {}),
      error: added.stderr || added.stdout,
    };
  }

  const staged = await gitForAutoCommit(workspacePath, ["diff", "--cached", "--quiet", "--", ...changedFiles]);
  if (staged.ok) {
    return {
      status: "skipped",
      reason: "reported task files had no staged changes",
      changedFiles: [],
      ...(excludedFiles.length ? { excludedFiles } : {}),
    };
  }
  if (staged.code !== 1) {
    return {
      status: "failed",
      reason: "could not verify staged completed task changes",
      changedFiles,
      ...(excludedFiles.length ? { excludedFiles } : {}),
      error: staged.stderr || staged.stdout,
    };
  }

  const committed = await gitForAutoCommit(workspacePath, [
    "-c",
    "user.name=Ambient Local Task",
    "-c",
    "user.email=ambient-local-task@example.invalid",
    "commit",
    "--no-gpg-sign",
    "--no-verify",
    "-m",
    `Complete ${taskId}`,
    "--",
    ...changedFiles,
  ]);
  if (!committed.ok) {
    return {
      status: "failed",
      reason: "could not commit completed task changes",
      changedFiles,
      ...(excludedFiles.length ? { excludedFiles } : {}),
      error: committed.stderr || committed.stdout,
    };
  }

  const head = await gitForAutoCommit(workspacePath, ["rev-parse", "--short", "HEAD"]);
  return {
    status: "committed",
    commit: head.ok ? head.stdout.trim() : undefined,
    changedFiles,
    ...(excludedFiles.length ? { excludedFiles } : {}),
  };
}

function autoCommitCandidatePaths(proofOfWork: Record<string, unknown>, taskActions: ReturnType<typeof projectBoardTaskToolActionsFromProofOfWork>): string[] {
  const paths = new Set<string>();
  const collect = (value: unknown) => {
    const path = proofChangedFilePath(value);
    if (!path) return;
    paths.add(path);
  };
  if (Array.isArray(proofOfWork.changedFiles)) proofOfWork.changedFiles.forEach(collect);
  if (Array.isArray(proofOfWork.toolChangedFiles)) proofOfWork.toolChangedFiles.forEach(collect);
  projectBoardTaskToolChangedFiles(taskActions).forEach(collect);
  return [...paths].sort();
}

function proofChangedFilePath(value: unknown): string | undefined {
  const raw =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "path" in value && typeof (value as { path?: unknown }).path === "string"
        ? (value as { path: string }).path
        : undefined;
  if (!raw) return undefined;
  const normalized = raw.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.split("/").includes("..")) return undefined;
  return normalized;
}

function autoCommitExcludedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  return AUTO_COMMIT_EXCLUDED_PATHS.has(normalized) || AUTO_COMMIT_EXCLUDED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function parseGitStatusZPaths(output: string): string[] {
  const records = output.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.length < 4) continue;
    const status = record.slice(0, 2);
    const path = proofChangedFilePath(record.slice(3));
    if (path) paths.push(path);
    if (status.includes("R") || status.includes("C")) index += 1;
  }
  return [...new Set(paths)].sort();
}

async function gitForAutoCommit(workspacePath: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; code?: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", workspacePath, ...args], {
      timeout: 30_000,
      maxBuffer: 4_000_000,
    });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const code = error && typeof error === "object" && "code" in error ? Number((error as { code?: unknown }).code) : undefined;
    return { ok: false, stdout, stderr, code };
  }
}

export async function collectProofOfWork(
  projectRoot: string,
  workspacePath: string,
  store: Pick<ProjectStore, "listMessages">,
  threadId: string,
  scope: ProjectBoardTaskToolActionScope & { runStartedAt?: string } = {},
): Promise<Record<string, unknown>> {
  const messages = projectBoardRunScopedMessages(store.listMessages(threadId), scope.runStartedAt);
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const diff = await getWorkspaceDiff(workspacePath);
  const artifactEvidence = await collectStructuredProofArtifacts(projectRoot, workspacePath);
  const commandEvidence = collectCommandProofEvidence(messages);
  const taskToolActions = projectBoardTaskToolActionsForScope(projectBoardTaskToolActionsFromTexts(projectBoardTaskActionTranscriptTexts(messages)), scope);
  return withBrowserInteractionProofEvidence({
    kind: "agent-run",
    messageCount: messages.length,
    lastAssistantText: lastAssistant?.content ?? "",
    lastAssistantStatus:
      typeof lastAssistant?.metadata?.status === "string" ? lastAssistant.metadata.status : lastAssistant ? "done" : "missing",
    changedFiles: diff.files,
    gitStatus: diff.status,
    diffTruncated: diff.truncated,
    diff: diff.diff,
    ...commandEvidence,
    ...artifactEvidence,
    ...(taskToolActions.length > 0 ? { taskToolActions } : {}),
    ...(taskToolActions.length > 0 ? { taskActionDiagnostics: projectBoardTaskToolActionDiagnostics(taskToolActions) } : {}),
  }, messages);
}

export function collectRunTranscriptProgress(
  store: Pick<ProjectStore, "listMessages">,
  threadId: string,
  runStartedAt: string,
  now = new Date(),
  scope: ProjectBoardTaskToolActionScope = {},
): Record<string, unknown> {
  const messages = projectBoardRunScopedMessages(store.listMessages(threadId), runStartedAt);
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const toolMessages = messages.filter((message) => message.role === "tool");
  const lastAssistant = [...assistantMessages].reverse()[0];
  const taskToolActions = projectBoardTaskToolActionsForScope(projectBoardTaskToolActionsFromTexts(projectBoardTaskActionTranscriptTexts(messages)), scope);
  const assistantOutputCharCount = assistantMessages.reduce((total, message) => total + message.content.length, 0);
  const toolOutputCharCount = toolMessages.reduce((total, message) => total + message.content.length, 0);
  const outputCharCount = assistantOutputCharCount + toolOutputCharCount;
  const startedMs = new Date(runStartedAt).getTime();
  const elapsedMs = Number.isFinite(startedMs) ? Math.max(0, now.getTime() - startedMs) : 0;
  const runningToolMessages = toolMessages.filter((message) => message.metadata?.status === "running").length;
  const completedToolMessages = toolMessages.filter((message) => message.metadata?.status && message.metadata.status !== "running").length;

  return {
    kind: "agent-run-progress",
    messageCount: messages.length,
    assistantMessageCount: assistantMessages.length,
    toolMessageCount: toolMessages.length,
    runningToolMessageCount: runningToolMessages,
    completedToolMessageCount: completedToolMessages,
    assistantOutputCharCount,
    toolOutputCharCount,
    outputCharCount,
    elapsedMs,
    lastActivityAt: now.toISOString(),
    lastAssistantText: lastAssistant?.content ?? "",
    lastAssistantStatus: typeof lastAssistant?.metadata?.status === "string" ? lastAssistant.metadata.status : lastAssistant ? "streaming" : "missing",
    progress: {
      status: "running",
      elapsedMs,
      outputCharCount,
      assistantOutputCharCount,
      toolOutputCharCount,
      taskActionCount: taskToolActions.length,
      toolMessageCount: toolMessages.length,
      runningToolMessageCount: runningToolMessages,
      completedToolMessageCount: completedToolMessages,
      lastActivityAt: now.toISOString(),
    },
    ...(taskToolActions.length > 0 ? { taskToolActions } : {}),
    ...(taskToolActions.length > 0 ? { taskActionDiagnostics: projectBoardTaskToolActionDiagnostics(taskToolActions) } : {}),
  };
}

function projectBoardTaskActionTranscriptTexts(messages: ChatMessage[]): string[] {
  return messages
    .filter((message) => message.role === "assistant" || projectBoardTaskActionToolMessage(message))
    .map((message) => message.content);
}

function projectBoardRunScopedMessages(messages: ChatMessage[], runStartedAt: string | undefined): ChatMessage[] {
  if (!runStartedAt) return messages;
  const startedMs = Date.parse(runStartedAt);
  if (!Number.isFinite(startedMs)) return messages;
  return messages.filter((message) => {
    const messageMs = Date.parse(message.createdAt);
    return Number.isFinite(messageMs) && messageMs >= startedMs;
  });
}

function projectBoardTaskActionToolMessage(message: ChatMessage): boolean {
  if (message.role !== "tool") return false;
  const toolName = typeof message.metadata?.toolName === "string" ? message.metadata.toolName : "";
  return projectBoardNativeTaskToolNames.includes(toolName as (typeof projectBoardNativeTaskToolNames)[number]) ||
    message.content.includes("Project board task action captured.");
}

function collectCommandProofEvidence(messages: ChatMessage[]): Record<string, unknown> {
  const commands = messages
    .filter((message) => message.role === "tool")
    .slice(-20)
    .map((message) => ({
      toolName: typeof message.metadata?.toolName === "string" ? message.metadata.toolName : "tool",
      status: typeof message.metadata?.status === "string" ? message.metadata.status : undefined,
      output: message.content.slice(0, 4000),
    }))
    .filter((command) => command.output.trim());
  const verificationOutput = commands
    .filter((command) => verificationEvidencePattern().test(command.output.toLowerCase()))
    .map((command) => `[${command.toolName}] ${command.output}`)
    .join("\n\n")
    .slice(0, 12_000);
  const toolChangedFiles = collectToolChangedFiles(commands);
  return {
    ...(commands.length ? { commands } : {}),
    ...(toolChangedFiles.length ? { toolChangedFiles } : {}),
    ...(verificationOutput ? { testOutput: verificationOutput } : {}),
  };
}

function collectToolChangedFiles(commands: Array<{ toolName: string; output: string }>): string[] {
  const files = new Set<string>();
  for (const command of commands) {
    if (!["edit", "write", "tool"].includes(command.toolName)) continue;
    for (const match of command.output.matchAll(/Successfully (?:wrote|edited)(?: \d+ bytes to)? ([^\n\r]+)/gi)) {
      const file = match[1]?.trim();
      if (file) files.add(file);
    }
  }
  return [...files];
}

export async function collectStructuredProofArtifacts(projectRoot: string, workspacePath: string): Promise<Record<string, unknown>> {
  const roots = [
    { root: join(projectRoot, ".ambient-codex", "browser", "screenshots"), base: projectRoot, source: "project_browser_screenshots" },
    { root: join(workspacePath, ".ambient-codex", "browser", "screenshots"), base: workspacePath, source: "workspace_browser_screenshots" },
    { root: join(workspacePath, "test-results"), base: workspacePath, source: "test_results" },
    { root: join(workspacePath, "playwright-report"), base: workspacePath, source: "playwright_report" },
  ];
  const files = (await Promise.all(roots.map((root) => listProofArtifactFiles(root.root, root.base, root.source)))).flat();
  const screenshots = files
    .filter((file) => isScreenshotPath(file.path))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, 8);
  const traceFiles = files
    .filter((file) => isBrowserTracePath(file.path))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, 8);
  const visualChecks = (
    await Promise.all(
      screenshots.map(async (file) => {
        try {
          const buffer = await readFile(file.absolutePath);
          if (!file.path.toLowerCase().endsWith(".png")) return visualCheckForUnsupportedImage(file, buffer);
          return visualCheckForPng(file, buffer);
        } catch (error) {
          return {
            path: file.relativePath,
            absolutePath: file.absolutePath,
            source: file.source,
            bytes: file.bytes,
            result: "visual_check_failed",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    )
  ).filter((check): check is Record<string, unknown> => Boolean(check));
  const visualEvidence = summarizeVisualEvidence(visualChecks);
  const visualCheckByPath = new Map(
    visualChecks
      .map((check) => [typeof check.path === "string" ? check.path : "", check] as const)
      .filter(([path]) => path),
  );

  const result: Record<string, unknown> = {};
  if (screenshots.length > 0) {
    result.screenshots = screenshots.map((file) => ({
      path: file.relativePath,
      absolutePath: file.absolutePath,
      source: file.source,
      bytes: file.bytes,
      mtimeMs: Math.round(file.mtimeMs),
      sha256: visualCheckByPath.get(file.relativePath)?.sha256,
    }));
  }
  if (visualChecks.length > 0) result.visualChecks = visualChecks;
  if (traceFiles.length > 0) {
    result.browserTraces = traceFiles.map((file) => ({
      path: file.relativePath,
      absolutePath: file.absolutePath,
      source: file.source,
      bytes: file.bytes,
      mtimeMs: Math.round(file.mtimeMs),
    }));
  }
  if (screenshots.length > 0 || traceFiles.length > 0 || visualChecks.length > 0) {
    const nonblankChecks = visualChecks.filter((check) => {
      const record = check && typeof check === "object" ? (check as Record<string, unknown>) : {};
      return record.result === "nonblank_image_detected";
    });
    const largest = visualChecks
      .map((check) => (check && typeof check === "object" ? (check as Record<string, unknown>) : undefined))
      .filter((check): check is Record<string, unknown> => check !== undefined && typeof check.width === "number" && typeof check.height === "number")
      .sort((left, right) => Number(right.width) * Number(right.height) - Number(left.width) * Number(left.height))[0];
    result.browserEvidence = {
      screenshotCount: screenshots.length,
      traceCount: traceFiles.length,
      visualCheckCount: visualChecks.length,
      nonblankVisualCheckCount: nonblankChecks.length,
      pngVisualCheckCount: visualEvidence.pngVisualCheckCount,
      uniquePixelHashCount: visualEvidence.uniquePixelHashCount,
      unchangedScreenshotEvidence: visualEvidence.unchangedScreenshotEvidence,
      visualEvidenceStatus: visualEvidence.status,
      largestImage: largest ? `${largest.width}x${largest.height}` : undefined,
      summary: [
        screenshots.length ? `${screenshots.length} screenshot artifact${screenshots.length === 1 ? "" : "s"}` : undefined,
        nonblankChecks.length ? `${nonblankChecks.length} nonblank image check${nonblankChecks.length === 1 ? "" : "s"}` : undefined,
        visualEvidence.uniquePixelHashCount > 1 ? `${visualEvidence.uniquePixelHashCount} distinct screenshot pixel hashes` : undefined,
        traceFiles.length ? `${traceFiles.length} browser trace artifact${traceFiles.length === 1 ? "" : "s"}` : undefined,
      ]
        .filter(Boolean)
        .join("; "),
      ...(visualEvidence.warnings.length ? { visualWarnings: visualEvidence.warnings } : {}),
    };
  }
  return result;
}

interface ProofArtifactFile {
  path: string;
  relativePath: string;
  absolutePath: string;
  source: string;
  bytes: number;
  mtimeMs: number;
}

async function listProofArtifactFiles(root: string, base: string, source: string, depth = 0): Promise<ProofArtifactFile[]> {
  if (depth > 4 || !existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: ProofArtifactFile[] = [];
  for (const entry of entries) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listProofArtifactFiles(absolutePath, base, source, depth + 1)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isScreenshotPath(absolutePath) && !isBrowserTracePath(absolutePath)) continue;
    const info = await stat(absolutePath).catch(() => undefined);
    if (!info) continue;
    const relativePath = relative(base, absolutePath).replace(/\\/g, "/");
    files.push({
      path: absolutePath,
      relativePath,
      absolutePath,
      source,
      bytes: info.size,
      mtimeMs: info.mtimeMs,
    });
  }
  return files;
}

function isScreenshotPath(path: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(path);
}

function isBrowserTracePath(path: string): boolean {
  return /\.(zip|har|trace)$/i.test(path) && /\b(trace|browser|playwright|har)\b/i.test(path);
}

function visualCheckForUnsupportedImage(file: ProofArtifactFile, buffer: Buffer): Record<string, unknown> {
  return {
    path: file.relativePath,
    absolutePath: file.absolutePath,
    source: file.source,
    bytes: file.bytes,
    sha256: sha256Hex(buffer),
    result: "image_artifact_recorded",
    summary: "Image artifact recorded; pixel metrics are only computed for PNG screenshots.",
  };
}

function visualCheckForPng(file: ProofArtifactFile, buffer: Buffer): Record<string, unknown> {
  const analysis = analyzePngForProof(buffer);
  const result = analysis.nonTransparentPixels === 0
    ? "transparent_image_detected"
    : analysis.nonBlackPixels > 0
      ? "nonblank_image_detected"
      : "blank_or_low_detail_image_detected";
  return {
    path: file.relativePath,
    absolutePath: file.absolutePath,
    source: file.source,
    bytes: file.bytes,
    mtimeMs: Math.round(file.mtimeMs),
    sha256: sha256Hex(buffer),
    pixelHash: analysis.pixelHash,
    dominantColor: analysis.dominantColor,
    width: analysis.width,
    height: analysis.height,
    nonBlackPixels: analysis.nonBlackPixels,
    nonTransparentPixels: analysis.nonTransparentPixels,
    meaningfulNonBackgroundPixels: analysis.meaningfulNonBackgroundPixels,
    distinctColorCount: analysis.distinctColorCount,
    result,
    summary: `${analysis.width}x${analysis.height}; ${analysis.nonBlackPixels} nonblack pixels; ${analysis.distinctColorCount} distinct sampled colors; dominant ${analysis.dominantColor}.`,
  };
}

function analyzePngForProof(buffer: Buffer): {
  width: number;
  height: number;
  nonBlackPixels: number;
  nonTransparentPixels: number;
  meaningfulNonBackgroundPixels: number;
  distinctColorCount: number;
  dominantColor: string;
  pixelHash: string;
} {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Not a PNG file.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buffer.length) break;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height || bitDepth !== 8) throw new Error("Unsupported PNG dimensions or bit depth.");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`Unsupported PNG color type ${colorType}.`);
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset++];
    const row = raw.subarray(inputOffset, inputOffset + stride);
    inputOffset += stride;
    const outOffset = y * stride;
    const previousOffset = y > 0 ? (y - 1) * stride : -1;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[outOffset + x - channels] : 0;
      const up = previousOffset >= 0 ? pixels[previousOffset + x] : 0;
      const upLeft = previousOffset >= 0 && x >= channels ? pixels[previousOffset + x - channels] : 0;
      const value = row[x];
      pixels[outOffset + x] = (value + pngFilterDelta(filter, left, up, upLeft)) & 0xff;
    }
  }
  let nonBlackPixels = 0;
  let nonTransparentPixels = 0;
  let meaningfulNonBackgroundPixels = 0;
  const colors = new Map<string, number>();
  const total = width * height;
  const sampleEvery = Math.max(1, Math.floor(total / 2000));
  const background = pixelColorAt(pixels, channels, 0);
  for (let index = 0; index < total; index += 1) {
    const { red, green, blue, alpha } = pixelColorAt(pixels, channels, index);
    if (alpha > 0) nonTransparentPixels += 1;
    if (alpha > 0 && (red > 8 || green > 8 || blue > 8)) nonBlackPixels += 1;
    if (alpha > 0 && colorDistance({ red, green, blue }, background) > 24) meaningfulNonBackgroundPixels += 1;
    if (index % sampleEvery === 0 && alpha > 0) {
      const color = `${red},${green},${blue}`;
      if (colors.has(color) || colors.size < 4096) colors.set(color, (colors.get(color) ?? 0) + 1);
    }
  }
  return {
    width,
    height,
    nonBlackPixels,
    nonTransparentPixels,
    meaningfulNonBackgroundPixels,
    distinctColorCount: colors.size,
    dominantColor: dominantSampledColor(colors),
    pixelHash: sha256Hex(Buffer.concat([pngProofDimensionBuffer(width, height, channels), pixels])),
  };
}

function withBrowserInteractionProofEvidence(proofOfWork: Record<string, unknown>, messages: ChatMessage[]): Record<string, unknown> {
  const browserEvidence = proofObject(proofOfWork.browserEvidence);
  if (!browserEvidence) return proofOfWork;
  const browserKeypressCount = messages.filter((message) => message.role === "tool" && message.metadata?.toolName === "browser_keypress").length;
  if (browserKeypressCount <= 0) return proofOfWork;
  const warnings = Array.isArray(browserEvidence.visualWarnings) ? browserEvidence.visualWarnings.filter((warning): warning is string => typeof warning === "string") : [];
  let interactionEvidenceStatus = "browser_input_recorded";
  if (browserEvidence.unchangedScreenshotEvidence === true) {
    interactionEvidenceStatus = "weak_no_visual_change_after_input";
    warnings.push("browser_keypress was used, but the collected PNG screenshots have identical decoded pixels; capture a changed state screenshot, structured state probe, or terminal blocker before closing interactive visual proof.");
  } else if (Number(browserEvidence.uniquePixelHashCount ?? 0) > 1) {
    interactionEvidenceStatus = "visual_change_observed_after_input";
  }
  return {
    ...proofOfWork,
    browserEvidence: {
      ...browserEvidence,
      browserKeypressCount,
      interactionEvidenceStatus,
      ...(warnings.length ? { visualWarnings: [...new Set(warnings)] } : {}),
    },
  };
}

function summarizeVisualEvidence(visualChecks: Record<string, unknown>[]): {
  pngVisualCheckCount: number;
  uniquePixelHashCount: number;
  unchangedScreenshotEvidence: boolean;
  status: string;
  warnings: string[];
} {
  const pixelHashes = visualChecks
    .map((check) => (typeof check.pixelHash === "string" ? check.pixelHash : undefined))
    .filter((hash): hash is string => Boolean(hash));
  const uniquePixelHashCount = new Set(pixelHashes).size;
  const unchangedScreenshotEvidence = pixelHashes.length > 1 && uniquePixelHashCount === 1;
  const warnings = unchangedScreenshotEvidence
    ? ["Multiple PNG screenshot artifacts have identical decoded pixels; this is weak evidence for before/after or post-interaction visual proof."]
    : [];
  return {
    pngVisualCheckCount: pixelHashes.length,
    uniquePixelHashCount,
    unchangedScreenshotEvidence,
    status: unchangedScreenshotEvidence ? "weak_unchanged_screenshots" : uniquePixelHashCount > 1 ? "visual_change_observed" : pixelHashes.length > 0 ? "single_screenshot_recorded" : "no_png_screenshots",
    warnings,
  };
}

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function pngProofDimensionBuffer(width: number, height: number, channels: number): Buffer {
  const buffer = Buffer.alloc(12);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer.writeUInt32BE(channels, 8);
  return buffer;
}

function pixelColorAt(pixels: Buffer, channels: number, index: number): { red: number; green: number; blue: number; alpha: number } {
  const offset = index * channels;
  const red = pixels[offset] ?? 0;
  const green = channels === 1 ? red : pixels[offset + 1] ?? 0;
  const blue = channels === 1 ? red : pixels[offset + 2] ?? 0;
  const alpha = channels === 4 ? pixels[offset + 3] ?? 255 : 255;
  return { red, green, blue, alpha };
}

function colorDistance(left: { red: number; green: number; blue: number }, right: { red: number; green: number; blue: number }): number {
  return Math.abs(left.red - right.red) + Math.abs(left.green - right.green) + Math.abs(left.blue - right.blue);
}

function dominantSampledColor(colors: Map<string, number>): string {
  let dominant = "unknown";
  let count = 0;
  for (const [color, colorCount] of colors) {
    if (colorCount > count) {
      dominant = color;
      count = colorCount;
    }
  }
  return dominant;
}

function pngFilterDelta(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return pngPaeth(left, up, upLeft);
  throw new Error(`Unsupported PNG filter ${filter}.`);
}

function pngPaeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function defaultTaskPrompt(): string {
  return [
    "You are working on an Ambient Desktop local orchestration task.",
    "Complete the task in the prepared workspace, run relevant verification, and summarize proof of work.",
  ].join("\n");
}

export function orchestrationWorkspaceScopePromptSection(input: {
  projectRoot: string;
  workspacePath: string;
  workspaceStrategy?: WorkflowConfig["workspace"]["strategy"];
}): string {
  const projectRoot = input.projectRoot.trim();
  const workspacePath = input.workspacePath.trim();
  const separateProjectRoot = Boolean(projectRoot && workspacePath && projectRoot !== workspacePath);
  return [
    "Execution workspace contract",
    workspacePath ? `- Writable task workspace: ${workspacePath}` : "- Writable task workspace: the current Ambient thread workspace.",
    input.workspaceStrategy ? `- Workspace strategy: ${input.workspaceStrategy}.` : "",
    separateProjectRoot
      ? `- Owning project root: ${projectRoot}. Use it as read-only context only; do not create, modify, delete, stage, or commit files there during this run.`
      : "",
    "- Create, modify, delete, stage, and commit task files only inside the writable task workspace. Use paths relative to that workspace whenever possible.",
    "- Put scratch files, fixtures, generated reports, proof outputs, and temporary files inside the writable task workspace; do not write them to /tmp, /var/tmp, the owning project root, or sibling worktrees.",
    "- Do not stage or commit Ambient runtime support directories such as .ambient/, .ambient-codex/, or node_modules/; keep commits limited to material task deliverables.",
    "- If board source context mentions the owning project root or another sibling worktree, resolve the corresponding file inside the writable task workspace before editing.",
    "- Do not request outside-workspace file or shell permissions to mutate the owning project root. If the card cannot be completed from the prepared workspace, report a concrete blocker instead.",
  ]
    .filter(Boolean)
    .join("\n");
}
