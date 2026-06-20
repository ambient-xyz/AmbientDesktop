import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionAuditEntry, PermissionRequest } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  OrchestrationAutoDispatchStartedRun,
  OrchestrationAutoDispatchStatus,
  SetOrchestrationAutoDispatchInput,
} from "../../shared/workflowTypes";
import { getAmbientProviderStatus } from "../provider/providerStatus";
import type { ProjectStore } from "../projectStore/projectStore";
import { runDueWorkflowPlaybookSchedules } from "../workflow/workflowPlaybookScheduleDispatch";
import { runWorkflowArtifact } from "../workflow/workflowRunService";
import { runDueWorkflowArtifactSchedules, workflowScheduleRunStartedEventData } from "../workflow/workflowScheduleDispatch";
import { loadWorkflowFile } from "../workflow/workflow";
import {
  ensureProjectBoardWorkflowForDispatch,
  listAutoContinuableRestartInterruptedRuns,
  listAutoStartablePreparedOrchestrationRuns,
  prepareAndRecordDueScheduledLocalTaskRuns,
  prepareAndRecordNextOrchestrationRuns,
} from "./orchestrationDispatch";
import { startPreparedOrchestrationRun } from "./orchestrationRunner";

export interface OrchestrationAutoDispatchState {
  enabled: boolean;
  inFlight: boolean;
  timer?: ReturnType<typeof setTimeout>;
  lastTickAt?: string;
  lastError?: string;
  lastStartedRunIds: string[];
  lastStartedRuns: OrchestrationAutoDispatchStartedRun[];
}

export interface OrchestrationAutoDispatchRuntimeHost {
  workspacePath: string;
  store: ProjectStore;
  runtime: {
    send(input: unknown, options?: unknown): Promise<unknown>;
  };
  browserService: unknown;
  autoDispatch: OrchestrationAutoDispatchState;
}

export interface OrchestrationAutoDispatchPermissionInput {
  thread?: ThreadSummary;
  permissionMode?: "full-access" | "workspace";
  workspacePath?: string;
  workflowThreadId?: string;
  store?: ProjectStore;
  requireFreshPrompt?: boolean;
}

export interface OrchestrationAutoDispatchServiceDependencies {
  activeThreadIdForHost(host: OrchestrationAutoDispatchRuntimeHost): string;
  callPluginMcpTool(plan: unknown, invocation: unknown, options?: unknown): Promise<unknown>;
  createAndRecordCheckpoint(reason: string, label: string, thread: ThreadSummary, store: ProjectStore): Promise<unknown>;
  emitDesktopEvent(event: DesktopEvent): void;
  emitPermissionAuditCreated(entry: PermissionAuditEntry, workspacePath: string): void;
  emitProjectScopedEvent(host: OrchestrationAutoDispatchRuntimeHost, event: DesktopEvent): void;
  emitProjectStateIfActive(host: OrchestrationAutoDispatchRuntimeHost, threadId?: string): void;
  ensureWorkflowPluginTrusted(thread: ThreadSummary, registration: unknown, store: ProjectStore): Promise<boolean> | boolean;
  firstPartyWorkflowConnectorAccountAuthorizer(): unknown;
  firstPartyWorkflowConnectorRegistrations(): unknown;
  forgetActiveWorkflowRun(runId: string): void;
  listPluginMcpRegistrationsForThread(thread: ThreadSummary, store: ProjectStore): Promise<unknown>;
  listPluginRegistry(workspacePath: string, store: ProjectStore): Promise<unknown>;
  prepareWorktreeForThread(thread: ThreadSummary, store: ProjectStore): Promise<ThreadSummary>;
  recordActiveProjectBoardExecutionReadinessBlocker(input: {
    source: "auto_dispatch" | "manual_prepare";
    blocker?: "missing_workflow" | "invalid_workflow" | "auto_dispatch_disabled" | "auto_dispatch_error" | "prepare_error";
    error?: unknown;
    title?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  }, store: ProjectStore): Promise<void>;
  rememberActiveWorkflowRun(runId: string, abortController: AbortController, workspacePath: string): void;
  requestPermissionWithGrantRegistry(
    request: Omit<PermissionRequest, "id">,
    input?: OrchestrationAutoDispatchPermissionInput,
  ): Promise<{ allowed: boolean }>;
  requireActiveProjectRuntimeHost(): OrchestrationAutoDispatchRuntimeHost;
  reviewFinishedProjectBoardRun(runId: string, store: ProjectStore, emitProjectState: () => void): Promise<unknown> | unknown;
}

let orchestrationAutoDispatchServices: OrchestrationAutoDispatchServiceDependencies | undefined;

export function configureOrchestrationAutoDispatchService(dependencies: OrchestrationAutoDispatchServiceDependencies): void {
  orchestrationAutoDispatchServices = dependencies;
}

function services(): OrchestrationAutoDispatchServiceDependencies {
  if (!orchestrationAutoDispatchServices) throw new Error("Orchestration auto-dispatch service has not been configured.");
  return orchestrationAutoDispatchServices;
}

function requireActiveProjectRuntimeHost(): OrchestrationAutoDispatchRuntimeHost {
  return services().requireActiveProjectRuntimeHost();
}

function activeThreadIdForHost(host: OrchestrationAutoDispatchRuntimeHost): string {
  return services().activeThreadIdForHost(host);
}

export function createAutoDispatchState(enabled: boolean): OrchestrationAutoDispatchState {
  return {
    enabled,
    inFlight: false,
    lastStartedRunIds: [],
    lastStartedRuns: [],
  };
}

export function workflowAutoDispatchDisabledMessage(workflowPath: string): string {
  return `${workflowPath} has orchestration.auto_dispatch set to false.`;
}

export async function readAutoDispatchStatus(
  host: OrchestrationAutoDispatchRuntimeHost = requireActiveProjectRuntimeHost(),
): Promise<OrchestrationAutoDispatchStatus> {
  const dispatch = host.autoDispatch;
  try {
    const workflow = await loadWorkflowFile(join(host.store.getWorkspace().path, "WORKFLOW.md"));
    const workflowAllows = workflow.config.orchestration.autoDispatch;
    return {
      enabled: dispatch.enabled,
      workflowAllows,
      pollIntervalMs: workflow.config.orchestration.pollIntervalMs,
      inFlight: dispatch.inFlight,
      lastTickAt: dispatch.lastTickAt,
      lastError: dispatch.lastError ?? (dispatch.enabled && !workflowAllows ? workflowAutoDispatchDisabledMessage(workflow.path) : undefined),
      lastStartedRunIds: dispatch.lastStartedRunIds,
      lastStartedRuns: dispatch.lastStartedRuns,
    };
  } catch (error) {
    return {
      enabled: dispatch.enabled,
      workflowAllows: true,
      inFlight: dispatch.inFlight,
      lastTickAt: dispatch.lastTickAt,
      lastError: dispatch.lastError ?? (dispatch.enabled ? (error instanceof Error ? error.message : String(error)) : undefined),
      lastStartedRunIds: dispatch.lastStartedRunIds,
      lastStartedRuns: dispatch.lastStartedRuns,
    };
  }
}

export function stopAutoDispatch(reason?: string, host: OrchestrationAutoDispatchRuntimeHost = requireActiveProjectRuntimeHost()): void {
  const dispatch = host.autoDispatch;
  dispatch.enabled = false;
  dispatch.inFlight = false;
  dispatch.lastStartedRunIds = [];
  dispatch.lastStartedRuns = [];
  if (reason) dispatch.lastError = reason;
  if (dispatch.timer) clearTimeout(dispatch.timer);
  dispatch.timer = undefined;
}

export function scheduleAutoDispatch(delayMs: number, host: OrchestrationAutoDispatchRuntimeHost = requireActiveProjectRuntimeHost()): void {
  const dispatch = host.autoDispatch;
  if (!dispatch.enabled) return;
  if (dispatch.timer) clearTimeout(dispatch.timer);
  dispatch.timer = setTimeout(() => void runAutoDispatchTick(host), Math.max(1_000, delayMs));
}

async function emitAutoDispatchStatus(host: OrchestrationAutoDispatchRuntimeHost = requireActiveProjectRuntimeHost()): Promise<void> {
  services().emitDesktopEvent({
    type: "orchestration-auto-dispatch-updated",
    status: await readAutoDispatchStatus(host),
    workspacePath: host.workspacePath,
  });
}

export async function setAutoDispatchEnabled(input: SetOrchestrationAutoDispatchInput): Promise<OrchestrationAutoDispatchStatus> {
  const host = requireActiveProjectRuntimeHost();
  const dispatch = host.autoDispatch;
  if (!input.enabled) {
    host.store.setAutomationAutoDispatchEnabled(false);
    stopAutoDispatch(undefined, host);
    dispatch.lastError = undefined;
    await emitAutoDispatchStatus(host);
    return readAutoDispatchStatus(host);
  }

  host.store.setAutomationAutoDispatchEnabled(true);
  dispatch.enabled = true;
  dispatch.lastError = undefined;
  scheduleAutoDispatch(1_000, host);
  await emitAutoDispatchStatus(host);
  return readAutoDispatchStatus(host);
}

function rememberAutoDispatchedRun(
  host: OrchestrationAutoDispatchRuntimeHost,
  runId: string,
  taskId: string,
  dispatchKind: OrchestrationAutoDispatchStartedRun["dispatchKind"],
  runProof?: Record<string, unknown>,
): void {
  const task = host.store.getOrchestrationTask(taskId);
  host.autoDispatch.lastStartedRunIds.push(runId);
  host.autoDispatch.lastStartedRuns.push({
    runId,
    taskId: task.id,
    identifier: task.identifier,
    title: task.title,
    priority: task.priority,
    dispatchRank: typeof runProof?.dispatchRank === "number" ? runProof.dispatchRank : undefined,
    dispatchKind,
  });
}

export async function runAutoDispatchTick(host: OrchestrationAutoDispatchRuntimeHost = requireActiveProjectRuntimeHost()): Promise<void> {
  const dispatch = host.autoDispatch;
  const hostStore = host.store;
  const workspacePath = hostStore.getWorkspace().path;
  if (!dispatch.enabled || dispatch.inFlight) return;

  dispatch.inFlight = true;
  dispatch.lastTickAt = new Date().toISOString();
  dispatch.lastStartedRunIds = [];
  dispatch.lastStartedRuns = [];
  await emitAutoDispatchStatus(host);

  try {
    const workflowBootstrap = await ensureProjectBoardWorkflowForDispatch(workspacePath, hostStore, "auto_dispatch");
    if (workflowBootstrap?.status === "created") {
      services().emitProjectStateIfActive(host);
    }
    const workflow = await loadWorkflowFile(join(workspacePath, "WORKFLOW.md"));
    if (!workflow.config.orchestration.autoDispatch) {
      dispatch.lastError = workflowAutoDispatchDisabledMessage(workflow.path);
      await services().recordActiveProjectBoardExecutionReadinessBlocker({
        source: "auto_dispatch",
        blocker: "auto_dispatch_disabled",
        error: dispatch.lastError,
      }, hostStore);
      scheduleAutoDispatch(workflow.config.orchestration.pollIntervalMs, host);
      return;
    }

    const emitOrchestrationUpdated = () => services().emitProjectScopedEvent(host, { type: "orchestration-updated" });
    const emitWorkflowUpdated = () => services().emitProjectScopedEvent(host, { type: "workflow-updated" });
    const emitFinishedRunReview = async (runId: string): Promise<void> => {
      await services().reviewFinishedProjectBoardRun(runId, hostStore, () => services().emitProjectStateIfActive(host));
    };
    const activePermissionMode = hostStore.getThread(activeThreadIdForHost(host)).permissionMode;

    const preparedStartCandidates = listAutoStartablePreparedOrchestrationRuns(hostStore, {
      workflowConfig: workflow.config,
    });
    for (const { run } of preparedStartCandidates) {
      await startPreparedOrchestrationRun(
        workspacePath,
        hostStore,
        host.runtime as never,
        run.id,
        emitOrchestrationUpdated,
        emitFinishedRunReview,
        { permissionMode: activePermissionMode },
      );
      rememberAutoDispatchedRun(host, run.id, run.taskId, "prepared", run.proofOfWork);
    }

    const restartInterruptedCandidates = listAutoContinuableRestartInterruptedRuns(hostStore, {
      maxConcurrentAgents: workflow.config.orchestration.maxConcurrentAgents,
    });
    for (const { run } of restartInterruptedCandidates) {
      if (!existsSync(run.workspacePath)) continue;
      if (!run.threadId) continue;
      try {
        hostStore.getThread(run.threadId);
      } catch {
        continue;
      }
      const resumedRun = hostStore.recordRestartInterruptedAutoContinueAttempt(run.id);
      await startPreparedOrchestrationRun(
        workspacePath,
        hostStore,
        host.runtime as never,
        resumedRun.id,
        emitOrchestrationUpdated,
        emitFinishedRunReview,
        { permissionMode: activePermissionMode },
      );
      rememberAutoDispatchedRun(host, resumedRun.id, resumedRun.taskId, "restart_interrupted_resume", resumedRun.proofOfWork);
    }

    const { runs } = await prepareAndRecordNextOrchestrationRuns(workspacePath, hostStore, "auto_dispatch");
    for (const run of runs) {
      await startPreparedOrchestrationRun(
        workspacePath,
        hostStore,
        host.runtime as never,
        run.id,
        emitOrchestrationUpdated,
        emitFinishedRunReview,
        { permissionMode: activePermissionMode },
      );
      rememberAutoDispatchedRun(host, run.id, run.taskId, "prepared", run.proofOfWork);
    }
    const scheduled = await prepareAndRecordDueScheduledLocalTaskRuns(workspacePath, hostStore);
    for (const run of scheduled.runs) {
      await startPreparedOrchestrationRun(
        workspacePath,
        hostStore,
        host.runtime as never,
        run.id,
        emitOrchestrationUpdated,
        emitFinishedRunReview,
        { permissionMode: activePermissionMode },
      );
      rememberAutoDispatchedRun(host, run.id, run.taskId, "scheduled", run.proofOfWork);
    }
    const hostActiveThreadId = activeThreadIdForHost(host);
    const schedulePermissionThread = hostStore.getThread(hostActiveThreadId);
    const scheduledWorkflowResults = await runDueWorkflowArtifactSchedules(hostStore, new Date(dispatch.lastTickAt!), async (scheduleInput) => {
      const { schedule, artifact } = scheduleInput;
      const thread = hostStore.getThread(hostActiveThreadId);
      const provider = getAmbientProviderStatus(thread.model);
      const abortController = new AbortController();
      let startedRunId: string | undefined;
      try {
        const pluginRegistrations = await services().listPluginMcpRegistrationsForThread(thread, hostStore);
        const pluginRegistry = await services().listPluginRegistry(thread.workspacePath, hostStore);
        await runWorkflowArtifact({
          store: hostStore,
          artifactId: artifact.id,
          workspacePath: thread.workspacePath,
          permissionMode: thread.permissionMode,
          browser: host.browserService as never,
          requestPermission: async (request) =>
            (
              await services().requestPermissionWithGrantRegistry(request, {
                thread,
                permissionMode: thread.permissionMode,
                workspacePath: thread.workspacePath,
                workflowThreadId: artifact.workflowThreadId,
                store: hostStore,
              })
            ).allowed,
          pluginRegistrations: pluginRegistrations as never,
          pluginRegistry: pluginRegistry as never,
          ensurePluginTrusted: async (registration) => services().ensureWorkflowPluginTrusted(thread, registration, hostStore),
          pluginCaller: ((
            plan: unknown,
            invocation: unknown,
            options?: unknown,
          ) => services().callPluginMcpTool(plan, invocation, options)) as never,
          connectorRegistrations: services().firstPartyWorkflowConnectorRegistrations() as never,
          connectorAccountAuthorizer: services().firstPartyWorkflowConnectorAccountAuthorizer() as never,
          scheduledConnectorGrantContext: {
            threadId: hostActiveThreadId,
            workflowThreadId: scheduleInput.workflowThreadId ?? artifact.workflowThreadId,
            projectPath: thread.workspacePath,
            workspacePath: thread.workspacePath,
            permissionGrants: hostStore.listPermissionGrants(),
          },
          model: thread.model,
          baseUrl: provider.baseUrl,
          mode: "execute",
          runtime: "automation",
          recoverableTimeouts: true,
          runLimits: scheduleInput.runLimits,
          abortSignal: abortController.signal,
          onRunStarted: (runId) => {
            startedRunId = runId;
            services().rememberActiveWorkflowRun(runId, abortController, host.workspacePath);
            hostStore.appendWorkflowRunEvent({
              runId,
              type: "workflow.schedule.started",
              message: schedule.id,
              data: workflowScheduleRunStartedEventData(scheduleInput),
            });
            emitWorkflowUpdated();
          },
          onEvent: emitWorkflowUpdated,
        });
      } finally {
        if (startedRunId) services().forgetActiveWorkflowRun(startedRunId);
      }
      return { runId: startedRunId };
    }, {
      permissionMode: schedulePermissionThread.permissionMode,
      threadId: hostActiveThreadId,
      workspacePath: schedulePermissionThread.workspacePath,
      onPermissionAuditCreated: (entry) => services().emitPermissionAuditCreated(entry, workspacePath),
    });
    const scheduledPlaybookResults = await runDueWorkflowPlaybookSchedules(hostStore, new Date(dispatch.lastTickAt!), async ({ thread, prompt }) => {
      let runThread = thread;
      if ((!runThread.gitWorktree || runThread.gitWorktree.status !== "active") && runThread.workspacePath === hostStore.getWorkspace().path) {
        runThread = await services().prepareWorktreeForThread(runThread, hostStore);
        services().emitProjectStateIfActive(host, hostActiveThreadId);
      }
      await services().createAndRecordCheckpoint("pre-run", "Before scheduled Workflow Playbook run.", runThread, hostStore);
      await host.runtime.send(
        {
          threadId: runThread.id,
          content: prompt,
          permissionMode: runThread.permissionMode,
          collaborationMode: "agent",
          model: runThread.model,
          thinkingLevel: runThread.thinkingLevel,
          delivery: "prompt",
          preserveActiveThread: true,
        },
        {
          onActivity: () => services().emitProjectStateIfActive(host, hostActiveThreadId),
          awaitQueuedDeliveryCompletion: true,
        },
      );
      return {};
    });
    if (scheduledWorkflowResults.length > 0 || scheduledPlaybookResults.length > 0) {
      emitWorkflowUpdated();
    }

    dispatch.lastError = undefined;
    emitOrchestrationUpdated();
    services().emitProjectStateIfActive(host);
    scheduleAutoDispatch(workflow.config.orchestration.pollIntervalMs, host);
  } catch (error) {
    dispatch.lastError = error instanceof Error ? error.message : String(error);
    await services().recordActiveProjectBoardExecutionReadinessBlocker({
      source: "auto_dispatch",
      error,
    }, hostStore);
    scheduleAutoDispatch(30_000, host);
  } finally {
    dispatch.inFlight = false;
    await emitAutoDispatchStatus(host);
  }
}
