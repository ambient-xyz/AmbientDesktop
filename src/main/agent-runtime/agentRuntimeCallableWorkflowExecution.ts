import type {
  CallableWorkflowTaskSummary,
  CancelCallableWorkflowTaskInput,
  PauseCallableWorkflowTaskInput,
  ResumeCallableWorkflowTaskInput,
} from "../../shared/workflowTypes";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { ambientRetryPolicyFromSettings } from "./agentRuntimeAmbientFacade";
import { pluginStateReaderFromStore } from "./agentRuntimePluginsFacade";
import {
  executeCallableWorkflowTask,
  latestCallableWorkflowRunForArtifact,
  type CallableWorkflowRunnerCompileInput,
  type CallableWorkflowRunnerStore,
  type CallableWorkflowSubagentLaunchResult,
} from "./agentRuntimeCallableWorkflowFacade";
import { resolvePermissionWithGrants, type PermissionPromptRequester } from "./agentRuntimePermissionsFacade";
import type { AmbientPluginHost, PluginMcpToolRegistration } from "./agentRuntimePluginsFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { getAmbientProviderStatus } from "./agentRuntimeProviderFacade";
import type { WorkflowConnectorAccountAuthorizer, WorkflowConnectorDescriptor, WorkflowConnectorRegistration } from "./agentRuntimeWorkflowFacade";
import { WorkflowManualPausedError } from "./agentRuntimeWorkflowFacade";
import { compileWorkflowArtifact } from "./agentRuntimeWorkflowCompilerFacade";
import { workflowToolDescriptorsFromPluginRegistry } from "./agentRuntimeWorkflowFacade";
import { runWorkflowArtifact, type RunWorkflowArtifactInput } from "./agentRuntimeWorkflowFacade";

export interface AgentRuntimeCallableWorkflowExecutionOptions {
  store: ProjectStore;
  browser: RunWorkflowArtifactInput["browser"];
  permissionRequester: PermissionPromptRequester;
  pluginHost: Pick<
    AmbientPluginHost,
    "enabledCodexPlugins" | "buildCodexPluginMcpToolRegistrations" | "listRegistry" | "callCodexPluginMcpTool"
  >;
  callableWorkflowStore: CallableWorkflowRunnerStore;
  connectorDescriptors?: () => WorkflowConnectorDescriptor[];
  connectorRegistrations?: () => WorkflowConnectorRegistration[];
  connectorAccountAuthorizer?: () => WorkflowConnectorAccountAuthorizer | undefined;
  readSearchRoutingSettings?: () => SearchRoutingSettings | undefined;
  ensurePluginMcpToolTrusted: (threadId: string, workspace: WorkspaceState, registration: PluginMcpToolRegistration) => Promise<boolean>;
  launchWorkflowSubagents?: (input: CallableWorkflowRunnerCompileInput) => Promise<CallableWorkflowSubagentLaunchResult | void>;
  setTaskAbortController: (taskId: string, controller: AbortController) => void;
  deleteTaskAbortController: (taskId: string) => void;
  setRunTaskId: (runId: string, taskId: string) => void;
  deleteRunTaskIdsForTask: (taskId: string) => void;
  emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
  emit: (event: DesktopEvent) => void;
}

export type AgentRuntimeCallableWorkflowRuntimeBridge = Pick<
  AgentRuntimeCallableWorkflowExecutionOptions,
  | "setTaskAbortController"
  | "deleteTaskAbortController"
  | "setRunTaskId"
  | "deleteRunTaskIdsForTask"
  | "emitCallableWorkflowTaskUpdated"
  | "emit"
>;

export interface AgentRuntimeCallableWorkflowRuntimeBridgeInput {
  taskAbortControllers: Map<string, AbortController>;
  runTaskIds: Map<string, string>;
  emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
  emit: (event: DesktopEvent) => void;
}

export type AgentRuntimeCallableWorkflowTaskControlStore = Pick<
  ProjectStore,
  "getCallableWorkflowTask" | "cancelCallableWorkflowTask" | "recordCallableWorkflowTaskControl"
>;

export interface AgentRuntimeCallableWorkflowTaskControlOptions {
  store: AgentRuntimeCallableWorkflowTaskControlStore;
  taskAbortControllers: Map<string, AbortController>;
  runTaskIds: Map<string, string>;
  emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
  emit: (event: DesktopEvent) => void;
}

export type AgentRuntimeCallableWorkflowTaskStarterStore = Pick<ProjectStore, "failCallableWorkflowTask">;

export interface AgentRuntimeCallableWorkflowTaskStarterOptions {
  store: AgentRuntimeCallableWorkflowTaskStarterStore;
  executeCallableWorkflowTaskForThread: (threadId: string, taskId: string, workspace: WorkspaceState) => Promise<void>;
  emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
  emit: (event: DesktopEvent) => void;
}

export type AgentRuntimeCallableWorkflowResumeOptions = Omit<
  AgentRuntimeCallableWorkflowExecutionOptions,
  "callableWorkflowStore" | "connectorDescriptors" | "readSearchRoutingSettings"
>;

export function callableWorkflowTaskAbortController(
  task: Pick<CallableWorkflowTaskSummary, "id" | "workflowRunId">,
  taskAbortControllers: Map<string, AbortController>,
  runTaskIds: Map<string, string>,
): AbortController | undefined {
  return taskAbortControllers.get(task.id) ??
    (task.workflowRunId ? taskAbortControllers.get(runTaskIds.get(task.workflowRunId) ?? "") : undefined);
}

export function createAgentRuntimeCallableWorkflowRuntimeBridge(
  input: AgentRuntimeCallableWorkflowRuntimeBridgeInput,
): AgentRuntimeCallableWorkflowRuntimeBridge {
  return {
    setTaskAbortController: (taskId, controller) =>
      input.taskAbortControllers.set(taskId, controller),
    deleteTaskAbortController: (taskId) =>
      input.taskAbortControllers.delete(taskId),
    setRunTaskId: (runId, taskId) =>
      input.runTaskIds.set(runId, taskId),
    deleteRunTaskIdsForTask: (taskId) => {
      for (const [runId, mappedTaskId] of [...input.runTaskIds.entries()]) {
        if (mappedTaskId === taskId) input.runTaskIds.delete(runId);
      }
    },
    emitCallableWorkflowTaskUpdated: input.emitCallableWorkflowTaskUpdated,
    emit: input.emit,
  };
}

export function createAgentRuntimeCallableWorkflowRunnerStore(
  store: CallableWorkflowRunnerStore,
  emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void,
): CallableWorkflowRunnerStore {
  return {
    getCallableWorkflowTask: (id) => store.getCallableWorkflowTask(id),
    beginCallableWorkflowTaskCompilerHandoff: (id, options) => {
      const result = store.beginCallableWorkflowTaskCompilerHandoff(id, options);
      emitCallableWorkflowTaskUpdated(result.task);
      return result;
    },
    linkCallableWorkflowTaskArtifact: (input) => {
      const task = store.linkCallableWorkflowTaskArtifact(input);
      emitCallableWorkflowTaskUpdated(task);
      return task;
    },
    markCallableWorkflowTaskRunStarted: (input) => {
      const task = store.markCallableWorkflowTaskRunStarted(input);
      emitCallableWorkflowTaskUpdated(task);
      return task;
    },
    markCallableWorkflowTaskRunFinished: (input) => {
      const task = store.markCallableWorkflowTaskRunFinished(input);
      emitCallableWorkflowTaskUpdated(task);
      return task;
    },
    pauseCallableWorkflowTask: (input) => {
      const task = store.pauseCallableWorkflowTask(input);
      emitCallableWorkflowTaskUpdated(task);
      return task;
    },
    failCallableWorkflowTask: (input) => {
      const task = store.failCallableWorkflowTask(input);
      emitCallableWorkflowTaskUpdated(task);
      return task;
    },
  };
}

export function cancelAgentRuntimeCallableWorkflowTask(
  input: CancelCallableWorkflowTaskInput,
  options: AgentRuntimeCallableWorkflowTaskControlOptions,
): CallableWorkflowTaskSummary {
  const current = options.store.getCallableWorkflowTask(input.taskId);
  const controller = callableWorkflowTaskAbortController(current, options.taskAbortControllers, options.runTaskIds);
  if (controller && !controller.signal.aborted) {
    controller.abort(new Error(input.reason?.trim() || "Callable workflow task canceled by user."));
  }
  const task = options.store.cancelCallableWorkflowTask({
    id: current.id,
    reason: input.reason,
  });
  options.emitCallableWorkflowTaskUpdated(task);
  options.emit({ type: "workflow-updated" });
  return task;
}

export function pauseAgentRuntimeCallableWorkflowTask(
  input: PauseCallableWorkflowTaskInput,
  options: AgentRuntimeCallableWorkflowTaskControlOptions,
): CallableWorkflowTaskSummary {
  const current = options.store.getCallableWorkflowTask(input.taskId);
  if (current.status === "paused") return current;
  if (current.status !== "running") {
    throw new Error(`Callable workflow task ${current.id} can pause only while running.`);
  }
  if (!current.workflowRunId) {
    throw new Error(`Callable workflow task ${current.id} cannot pause before a workflow run is linked.`);
  }
  const controller = callableWorkflowTaskAbortController(current, options.taskAbortControllers, options.runTaskIds);
  if (!controller || controller.signal.aborted) {
    throw new Error(`Callable workflow task ${current.id} is not attached to an active workflow runner that can be paused.`);
  }
  const reason = input.reason?.trim() || "Callable workflow task paused by user.";
  options.store.recordCallableWorkflowTaskControl({
    id: current.id,
    action: "pause_requested",
    reason,
    workflowRunId: current.workflowRunId,
  });
  controller.abort(new WorkflowManualPausedError(reason));
  options.emitCallableWorkflowTaskUpdated(current);
  options.emit({ type: "workflow-updated" });
  return current;
}

export function startAgentRuntimeCallableWorkflowTaskForThread(
  threadId: string,
  taskId: string,
  workspace: WorkspaceState,
  options: AgentRuntimeCallableWorkflowTaskStarterOptions,
): void {
  void options.executeCallableWorkflowTaskForThread(threadId, taskId, workspace)
    .catch((error) => {
      console.warn(`Callable workflow runner bridge failed for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
      try {
        const task = options.store.failCallableWorkflowTask({
          id: taskId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        options.emitCallableWorkflowTaskUpdated(task);
        options.emit({ type: "workflow-updated" });
      } catch {
        // Preserve the original background failure; the task may already be terminal.
      }
    });
}

export async function executeAgentRuntimeCallableWorkflowTaskForThread(
  threadId: string,
  taskId: string,
  workspace: WorkspaceState,
  options: AgentRuntimeCallableWorkflowExecutionOptions,
): Promise<void> {
  const thread = options.store.getThread(threadId);
  const workflowWorkspacePath = thread.workspacePath || workspace.path;
  const provider = getAmbientProviderStatus(thread.model);
  const modelRuntimeSettings = options.store.getModelRuntimeSettings();
  const retryPolicy = modelRuntimeSettings.aggressiveRetries
    ? ambientRetryPolicyFromSettings({ modelRuntime: modelRuntimeSettings })
    : undefined;
  const enabledPlugins = await options.pluginHost.enabledCodexPlugins(workflowWorkspacePath, pluginStateReaderFromStore(options.store));
  const pluginRegistrations = await options.pluginHost.buildCodexPluginMcpToolRegistrations(enabledPlugins, {
    permissionMode: thread.permissionMode,
    workspacePath: workflowWorkspacePath,
  });
  const pluginRegistry = await options.pluginHost.listRegistry(workflowWorkspacePath, pluginStateReaderFromStore(options.store));
  const result = await executeCallableWorkflowTask({
    store: options.callableWorkflowStore,
    taskId,
    createWorkflowThread: (input) =>
      options.store.createWorkflowAgentThreadSummary({
        ...input,
        projectPath: workflowWorkspacePath,
      }),
    ...(options.launchWorkflowSubagents ? { launchWorkflowSubagents: options.launchWorkflowSubagents } : {}),
    compileWorkflowTask: ({ handoffPlan, workflowThread, callableWorkflowInvocation }) =>
      compileWorkflowArtifact({
        store: options.store,
        userRequest: handoffPlan.compiler.userRequest,
        workflowThreadId: workflowThread.id,
        callableWorkflowInvocation,
        workspaceSummary: [
          `Workspace: ${workspace.name}`,
          `Path: ${workflowWorkspacePath}`,
          `Permission mode: ${thread.permissionMode}`,
          `Callable workflow task: ${taskId}`,
          `Parent thread: ${threadId}`,
          `Blocking: ${handoffPlan.compiler.blocking}`,
        ].join("\n"),
        toolDescriptors: workflowToolDescriptorsFromPluginRegistry(pluginRegistry, pluginRegistrations),
        pluginRegistrations,
        connectorDescriptors: options.connectorDescriptors?.() ?? [],
        stateRoot: options.store.getWorkspace().statePath,
        model: thread.model,
        permissionMode: thread.permissionMode,
        searchRoutingSettings: options.readSearchRoutingSettings?.(),
        baseUrl: provider.baseUrl,
        retryPolicy,
        onProgress: (progress) =>
          options.emit({
            type: "workflow-compile-progress",
            progress,
          }),
      }),
    runWorkflowTask: async ({ task, artifact, workflowThread, onRunStarted }) => {
      const abortController = new AbortController();
      options.setTaskAbortController(task.id, abortController);
      try {
        return await runWorkflowArtifact({
          store: options.store,
          artifactId: artifact.id,
          workspacePath: workflowWorkspacePath,
          permissionMode: thread.permissionMode,
          browser: options.browser,
          requestPermission: async (request) =>
            (
              await resolvePermissionWithGrants({
                store: options.store,
                requester: options.permissionRequester,
                request,
                context: {
                  permissionMode: thread.permissionMode,
                  threadId,
                  projectPath: options.store.getWorkspace().path,
                  workspacePath: workflowWorkspacePath,
                  workflowThreadId: workflowThread.id,
                },
              })
            ).allowed,
          pluginRegistrations,
          pluginRegistry,
          ensurePluginTrusted: (registration) =>
            options.ensurePluginMcpToolTrusted(threadId, { ...workspace, path: workflowWorkspacePath }, registration),
          pluginCaller: (plan, invocation, pluginOptions) => options.pluginHost.callCodexPluginMcpTool(plan, invocation, pluginOptions),
          connectorRegistrations: options.connectorRegistrations?.(),
          connectorAccountAuthorizer: options.connectorAccountAuthorizer?.(),
          model: thread.model,
          baseUrl: provider.baseUrl,
          mode: "execute",
          runtime: "workflow",
          abortSignal: abortController.signal,
          retryPolicy,
          onRunStarted: (runId) => {
            options.setRunTaskId(runId, task.id);
            onRunStarted(runId);
            options.emit({
              type: "workflow-run-started",
              runId,
              artifactId: artifact.id,
              workflowThreadId: workflowThread.id,
            });
            options.emit({ type: "workflow-updated" });
          },
          onEvent: () => {
            options.emit({ type: "workflow-updated" });
            try {
              options.emitCallableWorkflowTaskUpdated(options.store.getCallableWorkflowTask(task.id));
            } catch {
              // Workflow events should still flow even if the parent task was removed or repaired.
            }
          },
        });
      } finally {
        options.deleteTaskAbortController(task.id);
        options.deleteRunTaskIdsForTask(task.id);
      }
    },
  });
  if (result.status === "failed") {
    console.warn(`Callable workflow runner bridge failed task ${taskId}: ${result.task.errorMessage ?? "unknown error"}`);
  }
  options.emit({ type: "workflow-updated" });
}

export async function resumeAgentRuntimeCallableWorkflowTask(
  input: ResumeCallableWorkflowTaskInput,
  options: AgentRuntimeCallableWorkflowResumeOptions,
): Promise<CallableWorkflowTaskSummary> {
  const current = options.store.getCallableWorkflowTask(input.taskId);
  if (current.status !== "paused") {
    throw new Error(`Callable workflow task ${current.id} can resume only from a paused state.`);
  }
  if (!current.workflowArtifactId || !current.workflowRunId) {
    throw new Error(`Callable workflow task ${current.id} cannot resume without a linked workflow artifact and paused run.`);
  }
  options.store.recordCallableWorkflowTaskControl({
    id: current.id,
    action: "resume_requested",
    workflowRunId: current.workflowRunId,
  });
  const thread = options.store.getThread(current.parentThreadId);
  const workspace = options.store.getWorkspace();
  const workflowWorkspacePath = thread.workspacePath || workspace.path;
  const artifact = options.store.getWorkflowArtifact(current.workflowArtifactId);
  const provider = getAmbientProviderStatus(thread.model);
  const modelRuntimeSettings = options.store.getModelRuntimeSettings();
  const retryPolicy = modelRuntimeSettings.aggressiveRetries
    ? ambientRetryPolicyFromSettings({ modelRuntime: modelRuntimeSettings })
    : undefined;
  const enabledPlugins = await options.pluginHost.enabledCodexPlugins(workflowWorkspacePath, pluginStateReaderFromStore(options.store));
  const pluginRegistrations = await options.pluginHost.buildCodexPluginMcpToolRegistrations(enabledPlugins, {
    permissionMode: thread.permissionMode,
    workspacePath: workflowWorkspacePath,
  });
  const pluginRegistry = await options.pluginHost.listRegistry(workflowWorkspacePath, pluginStateReaderFromStore(options.store));
  const abortController = new AbortController();
  let resumedRunId: string | undefined;
  options.setTaskAbortController(current.id, abortController);
  try {
    const dashboard = await runWorkflowArtifact({
      store: options.store,
      artifactId: artifact.id,
      workspacePath: workflowWorkspacePath,
      permissionMode: thread.permissionMode,
      browser: options.browser,
      requestPermission: async (request) =>
        (
          await resolvePermissionWithGrants({
            store: options.store,
            requester: options.permissionRequester,
            request,
            context: {
              permissionMode: thread.permissionMode,
              threadId: thread.id,
              projectPath: workspace.path,
              workspacePath: workflowWorkspacePath,
              workflowThreadId: artifact.workflowThreadId,
            },
          })
        ).allowed,
      pluginRegistrations,
      pluginRegistry,
      ensurePluginTrusted: (registration) =>
        options.ensurePluginMcpToolTrusted(thread.id, { ...workspace, path: workflowWorkspacePath }, registration),
      pluginCaller: (plan, invocation, pluginOptions) => options.pluginHost.callCodexPluginMcpTool(plan, invocation, pluginOptions),
      connectorRegistrations: options.connectorRegistrations?.(),
      connectorAccountAuthorizer: options.connectorAccountAuthorizer?.(),
      model: thread.model,
      baseUrl: provider.baseUrl,
      mode: "execute",
      runtime: "workflow",
      resumeFromRunId: current.workflowRunId,
      runLimits: { maxRunMs: null },
      abortSignal: abortController.signal,
      retryPolicy,
      onRunStarted: (runId) => {
        resumedRunId = runId;
        options.setRunTaskId(runId, current.id);
        const task = options.store.markCallableWorkflowTaskRunStarted({
          id: current.id,
          workflowRunId: runId,
        });
        options.emitCallableWorkflowTaskUpdated(task);
        options.emit({
          type: "workflow-run-started",
          runId,
          artifactId: artifact.id,
          workflowThreadId: artifact.workflowThreadId,
        });
        options.emit({ type: "workflow-updated" });
      },
      onEvent: () => {
        options.emit({ type: "workflow-updated" });
        options.emitCallableWorkflowTaskUpdated(options.store.getCallableWorkflowTask(current.id));
      },
    });
    const run = latestCallableWorkflowRunForArtifact(dashboard, artifact.id, resumedRunId);
    if (run && ["paused", "needs_input", "succeeded", "failed", "canceled"].includes(run.status)) {
      const task = options.store.markCallableWorkflowTaskRunFinished({
        id: current.id,
        workflowRunId: run.id,
        runStatus: run.status,
        errorMessage: run.error,
      });
      options.emitCallableWorkflowTaskUpdated(task);
    }
    options.emit({ type: "workflow-updated" });
    return options.store.getCallableWorkflowTask(current.id);
  } catch (error) {
    const latest = options.store.getCallableWorkflowTask(current.id);
    if (latest.status === "canceled") return latest;
    throw error;
  } finally {
    options.deleteTaskAbortController(current.id);
    options.deleteRunTaskIdsForTask(current.id);
  }
}
