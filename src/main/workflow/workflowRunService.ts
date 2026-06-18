import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AMBIENT_DEFAULT_MODEL, normalizeAmbientModelId } from "../../shared/ambientModels";
import type { AmbientPermissionGrant, PermissionMode, PermissionRequest } from "../../shared/permissionTypes";
import type { AmbientPluginRegistry } from "../../shared/pluginTypes";
import type { WorkflowApprovalStatus, WorkflowDashboard, WorkflowExecutionMode, WorkflowManifest, WorkflowModelCallStatus, WorkflowRecoveryAction, WorkflowRecoveryContext, WorkflowRecoveryTargetKind, WorkflowRunEvent, WorkflowRunLimitOverrides, WorkflowRunProviderHealth, WorkflowRunRetryMetadata, WorkflowRunRuntime, WorkflowRunSummary, WorkflowUserInputResponse } from "../../shared/workflowTypes";
import { workflowScheduleMatchingConnectorGrantUse } from "../../shared/workflowSchedulePolicy";
import type { WorkflowBrowserAdapter, WorkflowDesktopToolBridgeOptions } from "./workflowDesktopTools";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import type { ProjectStore } from "./workflowProjectStoreFacade";
import { createWorkflowDesktopToolBridge } from "./workflowDesktopTools";
import {
  WorkflowAgentRuntime,
  WorkflowInputPausedError,
  WorkflowManualPausedError,
  isWorkflowPausedError,
  type WorkflowEventSink,
} from "./workflowAgentRuntime";
import { validateWorkflowSourceConnectorReferences, validateWorkflowSourceReferences } from "../workflow-compiler/workflowCompiler";
import { generateWorkflowAuditReport, hashWorkflowSource } from "./workflowAuditReport";
import { readWorkflowDashboard } from "./workflowDashboard";
import {
  validateWorkflowPluginCapabilityRequirements,
  workflowAutomationPluginRequirementBlockerMessage,
  workflowAutomationPluginRequirementBlockers,
} from "./workflowPluginCapabilities";
import { workflowApprovalsFromEvents } from "./workflowApprovals";
import { JsonWorkflowCheckpointStore, readWorkflowCheckpointSummaries } from "./workflowCheckpointStore";
import { workflowResumeChainEvents, workflowResumeChainModelCalls, workflowResumeChainRunIds } from "./workflowRunChain";
import { loadWorkflowProgramFromSource } from "../workflow-program/workflowProgramLoader";
import {
  createWorkflowAmbientClient,
  MemoryWorkflowAmbientCache,
  workflowAmbientCallCacheCheckpoint,
  type WorkflowAmbientCallSpec,
  type WorkflowAmbientProvider,
} from "./workflowAmbientClient";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import type { WorkflowPiProgress } from "./workflowPiTransport";
import type { ToolRunnerRunShellOptions } from "../tool-runtime/toolRunner";
import {
  createWorkflowConnectorBridge,
  validateWorkflowConnectorManifest,
  workspaceInventoryConnector,
  type WorkflowConnectorAccountAuthorizer,
  type WorkflowConnectorApprovalDecisionResolver,
  type WorkflowConnectorRegistration,
} from "./workflowConnectors";
import { ambientRetryPolicyFromSettings, type AmbientRetryPolicy } from "./workflowAmbientFacade";

const DEFAULT_WORKFLOW_RUNTIME_AMBIENT_IDLE_TIMEOUT_MS = 60_000;
const WORKFLOW_AMBIENT_PROGRESS_THROTTLE_MS = 2_000;
const WORKFLOW_AMBIENT_PROGRESS_CHAR_DELTA = 250;

export interface RunWorkflowArtifactInput {
  store: ProjectStore;
  artifactId: string;
  workspacePath: string;
  permissionMode: PermissionMode;
  browser?: WorkflowBrowserAdapter;
  requestPermission?: (request: Omit<PermissionRequest, "id">) => Promise<boolean>;
  ambientProvider?: WorkflowAmbientProvider;
  model?: string;
  baseUrl?: string;
  mode?: WorkflowExecutionMode;
  runtime?: WorkflowRunRuntime;
  resumeFromRunId?: string;
  recovery?: WorkflowRecoveryContext;
  runLimits?: WorkflowRunLimitOverrides;
  recoverableTimeouts?: boolean;
  userInputs?: WorkflowUserInputResponse[];
  abortSignal?: AbortSignal;
  shellRunner?: (options: ToolRunnerRunShellOptions) => Promise<{ exitCode: number | null }>;
  pluginRegistrations?: PluginMcpToolRegistration[];
  pluginRegistry?: AmbientPluginRegistry;
  ensurePluginTrusted?: (registration: PluginMcpToolRegistration) => Promise<boolean>;
  pluginCaller?: WorkflowDesktopToolBridgeOptions["pluginCaller"];
  vision?: WorkflowDesktopToolBridgeOptions["vision"];
  connectorRegistrations?: WorkflowConnectorRegistration[];
  connectorAccountAuthorizer?: WorkflowConnectorAccountAuthorizer;
  connectorApprovalDecision?: WorkflowConnectorApprovalDecisionResolver;
  scheduledConnectorGrantContext?: {
    threadId?: string;
    workflowThreadId?: string;
    projectPath?: string;
    workspacePath?: string;
    permissionGrants?: AmbientPermissionGrant[];
  };
  retryPolicy?: AmbientRetryPolicy;
  onRunStarted?: (runId: string) => void;
  onEvent?: () => void;
}

export async function runWorkflowArtifact(input: RunWorkflowArtifactInput): Promise<WorkflowDashboard> {
  const artifact = input.store.getWorkflowArtifact(input.artifactId);
  const resumeFromRun = input.resumeFromRunId ? validateResumeRun(input.store.getWorkflowRun(input.resumeFromRunId), artifact.id) : undefined;
  const approvalDecisions = resumeFromRun ? approvalDecisionsForResumeChain(input.store, resumeFromRun.id) : new Map<string, WorkflowApprovalStatus>();
  const userInputResponses = resumeFromRun ? userInputResponsesForResumeChain(input.store, resumeFromRun.id) : new Map<string, WorkflowUserInputResponse>();
  for (const response of input.userInputs ?? []) userInputResponses.set(response.requestId, response);
  const source = await readFile(artifact.sourcePath, "utf8");
  const connectorRegistrations = [workspaceInventoryConnector(input.workspacePath), ...(input.connectorRegistrations ?? [])];
  const connectorDescriptors = connectorRegistrations.map((registration) => registration.descriptor);
  const sourceHash = hashWorkflowSource(source);
  const manifestHash = hashWorkflowSource(stableStringify(artifact.manifest));
  if (resumeFromRun) validateResumeCompatibility(input.store, resumeFromRun.id, sourceHash, manifestHash);
  const mode = input.mode ?? "execute";
  const runtimeKind = input.runtime ?? "workflow";
  const graphSnapshotId = workflowRunGraphSnapshotId(input.store, artifact);
  const run = input.store.startWorkflowRun({
    artifactId: artifact.id,
    status: "running",
    graphSnapshotId,
    recoveryContext: input.recovery,
  });
  input.onRunStarted?.(run.id);
  const persistedEvents: WorkflowRunEvent[] = [];
  const eventSink: WorkflowEventSink = {
    append: (event) => {
      const persisted = input.store.appendWorkflowRunEvent({
        runId: run.id,
        type: event.type,
        message: event.message,
        graphNodeId: event.graphNodeId ?? stringFromRecord(event.data, "graphNodeId"),
        graphEdgeId: event.graphEdgeId ?? stringFromRecord(event.data, "graphEdgeId"),
        itemKey: event.itemKey ?? stringFromRecord(event.data, "itemKey"),
        data: event.data,
      });
      persistedEvents.push(persisted);
      if (shouldRefreshWorkflowRunDurability(persisted)) {
        input.store.updateWorkflowRunDurability({
          id: run.id,
          graphSnapshotId,
          providerHealth: workflowRunProviderHealthFromEvents(persistedEvents),
          retryMetadata: workflowRunRetryMetadataFromEvents(persistedEvents, input.recovery),
          recoveryContext: input.recovery,
        });
      }
      input.onEvent?.();
    },
  };
  await eventSink.append({
    type: "workflow.version",
    message: sourceHash,
    data: { sourceHash, manifestHash, artifactId: artifact.id },
  });
  await eventSink.append({ type: "workflow.mode", message: mode, data: { runtime: runtimeKind } });
  if (resumeFromRun) {
    await eventSink.append({
      type: "workflow.resume",
      message: resumeFromRun.id,
      data: {
        checkpointKeys: readWorkflowCheckpointSummaries(artifact.statePath).map((checkpoint) => checkpoint.key),
      },
    });
    if (resumeFromRun.scheduledBy?.scheduleId) {
      await eventSink.append({
        type: "workflow.schedule.started",
        message: resumeFromRun.scheduledBy.scheduleId,
        data: {
          scheduleId: resumeFromRun.scheduledBy.scheduleId,
          targetKind: resumeFromRun.scheduledBy.targetKind,
          targetId: resumeFromRun.scheduledBy.targetId,
          targetLabel: resumeFromRun.scheduledBy.targetLabel,
          targetVersionId: resumeFromRun.scheduledBy.targetVersionId,
          createdTargetVersionId: resumeFromRun.scheduledBy.createdTargetVersionId,
          grantDecisionSource: resumeFromRun.scheduledBy.grantDecisionSource,
          artifactId: artifact.id,
          workflowThreadId: artifact.workflowThreadId,
          resumeSourceRunId: resumeFromRun.id,
        },
      });
    }
  }
  if (input.recovery) {
    await eventSink.append({
      type: "workflow.recovery.start",
      message: input.recovery.action,
      graphNodeId: input.recovery.targetGraphNodeId,
      graphEdgeId: input.recovery.targetGraphEdgeId,
      itemKey: input.recovery.targetItemKey,
      data: {
        action: input.recovery.action,
        sourceRunId: input.recovery.sourceRunId,
        sourceEventId: input.recovery.sourceEventId,
        targetKind: input.recovery.targetKind,
        targetIndex: input.recovery.targetIndex,
        checkpointKey: input.recovery.targetCheckpointKey,
        reason: input.recovery.reason,
        createdAt: input.recovery.createdAt,
      },
    });
  }
  const runAbortController = new AbortController();
  let maxRuntimeExceeded = false;
  const onExternalAbort = () => runAbortController.abort(input.abortSignal?.reason);
  if (input.abortSignal) {
    if (input.abortSignal.aborted) onExternalAbort();
    else input.abortSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const runLimits = workflowRunLimitsForRun(artifact.manifest, input.runLimits);
  const timeoutRecoverable = runtimeKind === "workflow" || input.recoverableTimeouts === true;
  await eventSink.append({
    type: "workflow.run-limits",
    message: workflowRunLimitsMessage(runLimits),
    data: {
      idleTimeoutMs: runLimits.idleTimeoutMs,
      maxRunMs: runLimits.maxRunMs,
      totalRuntimeLimitEnabled: runLimits.maxRunMs !== undefined,
      totalRuntimeLimitSource: runLimits.totalRuntimeLimitSource,
    },
  });
  const maxRunMs = runLimits.maxRunMs;
  const timeout =
    typeof maxRunMs === "number" && maxRunMs > 0
      ? setTimeout(() => {
          maxRuntimeExceeded = true;
          runAbortController.abort();
        }, maxRunMs)
      : undefined;

  try {
    validateWorkflowSourceReferences(source, artifact.manifest);
    await validateWorkflowConnectorReadiness({
      source,
      manifest: artifact.manifest,
      connectorDescriptors,
      eventSink,
    });
    if (runtimeKind === "automation" && artifact.manifest.pluginCapabilities?.length) {
      if (!input.pluginRegistry) throw new Error("Automation plugin validation requires the plugin registry.");
      const blockers = workflowAutomationPluginRequirementBlockers(artifact.manifest, input.pluginRegistry);
      await eventSink.append({
        type: "workflow.plugin-requirements",
        message: blockers.length > 0 ? "Blocked automation plugin requirements." : "Validated automation plugin requirements.",
        data: {
          count: artifact.manifest.pluginCapabilities.length,
          runtime: runtimeKind,
          requirements: artifact.manifest.pluginCapabilities,
          blockers,
        },
      });
      if (blockers.length > 0) throw new Error(workflowAutomationPluginRequirementBlockerMessage(blockers));
    }
    validateWorkflowPluginCapabilityRequirements(artifact.manifest, input.pluginRegistrations);
    const bridge = createWorkflowDesktopToolBridge({
      manifest: artifact.manifest,
      workspace: { path: input.workspacePath },
      permissionMode: input.permissionMode,
      runtime: runtimeKind,
      model: input.model,
      baseUrl: input.baseUrl,
      runId: run.id,
      browser: input.browser,
      requestPermission: input.requestPermission,
      pluginRegistrations: input.pluginRegistrations,
      ensurePluginTrusted: input.ensurePluginTrusted,
      pluginCaller: input.pluginCaller,
      vision: input.vision,
      shellRunner: input.shellRunner,
      dryRun: mode === "dry_run",
      abortSignal: runAbortController.signal,
      eventSink,
    });
    const runtime = new WorkflowAgentRuntime({
      manifest: artifact.manifest,
      eventSink,
      abortSignal: runAbortController.signal,
      recovery: input.recovery,
      checkpointStore: new JsonWorkflowCheckpointStore(artifact.statePath, { runId: run.id }),
      approvalDecision: (approvalId) => approvedOrRejected(approvalDecisions.get(approvalId)),
      userInputResponse: (request) => userInputResponses.get(request.id),
      suppressFailureEvent: () => maxRuntimeExceeded && timeoutRecoverable,
    });
    const connectorBridge = createWorkflowConnectorBridge({
      manifest: artifact.manifest,
      registrations: connectorRegistrations,
      dryRun: mode === "dry_run",
      eventSink,
      accountAuthorizer: input.connectorAccountAuthorizer,
      connectorApprovalDecision: (approvalId, changeSet) => input.connectorApprovalDecision?.(approvalId, changeSet) ?? approvalDecisions.get(approvalId),
      connectorReviewGrantResolver: input.scheduledConnectorGrantContext
        ? ({ operation, grant }) => {
            const context = input.scheduledConnectorGrantContext!;
            const use = workflowScheduleMatchingConnectorGrantUse(
              { id: artifact.id, workflowThreadId: artifact.workflowThreadId, manifest: artifact.manifest },
              {
                permissionGrants: context.permissionGrants ?? input.store.listPermissionGrants(),
                threadId: context.threadId,
                workflowThreadId: context.workflowThreadId ?? artifact.workflowThreadId,
                projectPath: context.projectPath ?? input.workspacePath,
                workspacePath: context.workspacePath ?? input.workspacePath,
              },
              grant.connectorId,
              operation.name,
            );
            return use
              ? {
                  grantId: use.grant.id,
                  targetLabel: use.targetLabel,
                  reason: "Scheduled workflow connector review satisfied by a persistent connector grant.",
                }
              : undefined;
          }
        : undefined,
      approvalScope: { artifactId: artifact.id, sourceHash, manifestHash },
    });
    const model = normalizeAmbientModelId(input.model ?? AMBIENT_DEFAULT_MODEL);
    const retryPolicy = input.retryPolicy ?? ambientRetryPolicyFromSettings({ modelRuntime: input.store.getModelRuntimeSettings() });
    await runtime.run(loadWorkflowProgramFromSource(source), {
      tools: bridge.handlers,
      connectors: { call: (callInput) => connectorBridge.call(normalizeConnectorCallInput(callInput)) },
      ambient: createAmbientHandlers({
        store: input.store,
        runId: run.id,
        workflowThreadId: artifact.workflowThreadId,
        manifest: artifact.manifest,
        eventSink,
        provider:
          input.ambientProvider ??
          new AmbientWorkflowRunProvider({
            model,
            baseUrl: input.baseUrl,
            workflowThreadId: artifact.workflowThreadId,
            idleTimeoutMs: runLimits.idleTimeoutMs,
            absoluteTimeoutMs: runLimits.maxRunMs,
          }),
        model,
        abortSignal: runAbortController.signal,
        retryPolicy,
      }),
    });
    const pendingApproval = pendingApprovalForRun(input.store, run.id);
    if (pendingApproval) {
      if (input.recovery) {
        await eventSink.append({
          type: "workflow.recovery.paused",
          message: input.recovery.action,
          graphNodeId: input.recovery.targetGraphNodeId,
          graphEdgeId: input.recovery.targetGraphEdgeId,
          itemKey: input.recovery.targetItemKey,
          data: workflowRecoveryEventData(input.recovery),
        });
      }
      await eventSink.append({
        type: "workflow.paused",
        message: pendingApproval.id,
        data: {
          id: pendingApproval.id,
          changeSet: pendingApproval.changeSet,
          reason: "Workflow completed while an approval or connector review was still pending.",
        },
      });
      input.store.updateWorkflowRun({ id: run.id, status: "paused", finish: true });
      const reportPath = await writeAuditReport(input.store, artifact.id, run.id).catch(() => undefined);
      input.store.updateWorkflowRun({ id: run.id, status: "paused", reportPath, finish: true });
      return readWorkflowDashboard(input.store);
    }
    if (input.recovery) {
      await eventSink.append({
        type: "workflow.recovery.completed",
        message: input.recovery.action,
        graphNodeId: input.recovery.targetGraphNodeId,
        graphEdgeId: input.recovery.targetGraphEdgeId,
        itemKey: input.recovery.targetItemKey,
        data: workflowRecoveryEventData(input.recovery),
      });
    }
    input.store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true });
    const reportPath = await writeAuditReport(input.store, artifact.id, run.id);
    input.store.updateWorkflowRun({ id: run.id, status: "succeeded", reportPath });
  } catch (error) {
    if (isWorkflowPausedError(error)) {
      const pausedStatus = error instanceof WorkflowInputPausedError ? "needs_input" : "paused";
      if (input.recovery) {
        await eventSink.append({
          type: "workflow.recovery.paused",
          message: input.recovery.action,
          graphNodeId: input.recovery.targetGraphNodeId,
          graphEdgeId: input.recovery.targetGraphEdgeId,
          itemKey: input.recovery.targetItemKey,
          data: workflowRecoveryEventData(input.recovery),
        });
      }
      input.store.updateWorkflowRun({ id: run.id, status: pausedStatus, finish: true });
      const reportPath = await writeAuditReport(input.store, artifact.id, run.id).catch(() => undefined);
      input.store.updateWorkflowRun({ id: run.id, status: pausedStatus, reportPath, finish: true });
      return readWorkflowDashboard(input.store);
    }
    if (!maxRuntimeExceeded && isWorkflowManualPausedError(error, runAbortController.signal)) {
      const reason = workflowManualPauseReason(error, runAbortController.signal);
      if (!input.store.listWorkflowRunEvents(run.id).some((event) => event.type === "workflow.paused")) {
        await eventSink.append({
          type: "workflow.paused",
          message: reason,
          data: {
            reason: "manual_pause",
            detail: reason,
          },
        });
      }
      input.store.updateWorkflowRun({ id: run.id, status: "paused", error: reason, finish: true });
      const reportPath = await writeAuditReport(input.store, artifact.id, run.id).catch(() => undefined);
      input.store.updateWorkflowRun({ id: run.id, status: "paused", error: reason, reportPath, finish: true });
      return readWorkflowDashboard(input.store);
    }
    const canceled = !maxRuntimeExceeded && isWorkflowCanceledError(error, runAbortController.signal);
    const runError = maxRuntimeExceeded ? workflowTotalRuntimeLimitMessage(maxRunMs) : errorMessage(error);
    if (maxRuntimeExceeded) {
      const recoverable = timeoutRecoverable;
      await eventSink.append({
        type: "workflow.timeout",
        message: runError,
        data: {
          reason: "total_runtime_limit",
          recoverable,
          runtime: runtimeKind,
          idleTimeoutMs: runLimits.idleTimeoutMs,
          maxRunMs,
          totalRuntimeLimitSource: runLimits.totalRuntimeLimitSource,
          recommendedAction: recoverable ? "extend_run" : "inspect_run",
        },
      });
      if (recoverable) {
        await eventSink.append({
          type: "workflow.paused",
          message: runError,
          data: {
            reason: "total_runtime_limit",
            maxRunMs,
            totalRuntimeLimitSource: runLimits.totalRuntimeLimitSource,
          },
        });
        input.store.updateWorkflowRun({ id: run.id, status: "paused", error: runError, finish: true });
        const reportPath = await writeAuditReport(input.store, artifact.id, run.id).catch(() => undefined);
        input.store.updateWorkflowRun({ id: run.id, status: "paused", error: runError, reportPath, finish: true });
        return readWorkflowDashboard(input.store);
      }
    }
    if (canceled) await eventSink.append({ type: "workflow.canceled", message: "Canceled by user." });
    if (input.recovery) {
      await eventSink.append({
        type: "workflow.recovery.failed",
        message: runError,
        graphNodeId: input.recovery.targetGraphNodeId,
        graphEdgeId: input.recovery.targetGraphEdgeId,
        itemKey: input.recovery.targetItemKey,
        data: workflowRecoveryEventData(input.recovery),
      });
    }
    if (!canceled && !input.store.listWorkflowRunEvents(run.id).some((event) => event.type === "workflow.failed")) {
      await eventSink.append({ type: "workflow.failed", message: runError });
    }
    input.store.updateWorkflowRun({
      id: run.id,
      status: canceled ? "canceled" : "failed",
      error: runError,
      finish: true,
    });
    const reportPath = await writeAuditReport(input.store, artifact.id, run.id).catch(() => undefined);
    input.store.updateWorkflowRun({
      id: run.id,
      status: canceled ? "canceled" : "failed",
      error: runError,
      reportPath,
      finish: true,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    input.abortSignal?.removeEventListener("abort", onExternalAbort);
    input.onEvent?.();
  }

  return readWorkflowDashboard(input.store);
}

interface ResolvedWorkflowRunLimits {
  idleTimeoutMs: number;
  maxRunMs?: number;
  totalRuntimeLimitSource: "manifest" | "override" | "disabled";
}

function workflowRunLimitsForRun(
  manifest: { defaultIdleTimeoutMs?: number; maxRunMs?: number },
  overrides: WorkflowRunLimitOverrides | undefined,
): ResolvedWorkflowRunLimits {
  const idleTimeoutMs = positiveInteger(overrides?.idleTimeoutMs) ?? positiveInteger(manifest.defaultIdleTimeoutMs) ?? DEFAULT_WORKFLOW_RUNTIME_AMBIENT_IDLE_TIMEOUT_MS;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, "maxRunMs") && overrides.maxRunMs !== undefined) {
    if (overrides.maxRunMs === null) return { idleTimeoutMs, totalRuntimeLimitSource: "disabled" };
    const overrideMaxRunMs = positiveInteger(overrides.maxRunMs);
    if (overrideMaxRunMs !== undefined) return { idleTimeoutMs, maxRunMs: overrideMaxRunMs, totalRuntimeLimitSource: "override" };
    return { idleTimeoutMs, totalRuntimeLimitSource: "disabled" };
  }
  const manifestMaxRunMs = positiveInteger(manifest.maxRunMs);
  return manifestMaxRunMs !== undefined
    ? { idleTimeoutMs, maxRunMs: manifestMaxRunMs, totalRuntimeLimitSource: "manifest" }
    : { idleTimeoutMs, totalRuntimeLimitSource: "disabled" };
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function workflowRunLimitsMessage(limits: ResolvedWorkflowRunLimits): string {
  const idle = `stream idle timeout ${formatRunLimitDuration(limits.idleTimeoutMs)}`;
  if (limits.maxRunMs === undefined) return `${idle}; no total runtime limit`;
  return `${idle}; total runtime limit ${formatRunLimitDuration(limits.maxRunMs)} (${limits.totalRuntimeLimitSource})`;
}

function workflowRecoveryEventData(recovery: WorkflowRecoveryContext): Record<string, unknown> {
  return {
    action: recovery.action,
    sourceRunId: recovery.sourceRunId,
    sourceEventId: recovery.sourceEventId,
    targetKind: recovery.targetKind,
    targetIndex: recovery.targetIndex,
    checkpointKey: recovery.targetCheckpointKey,
  };
}

function workflowRunGraphSnapshotId(store: ProjectStore, artifact: { workflowThreadId?: string }): string | undefined {
  if (!artifact.workflowThreadId) return undefined;
  try {
    const thread = store.getWorkflowAgentThreadSummary(artifact.workflowThreadId);
    return thread.activeGraphSnapshotId ?? thread.latestVersion?.graphSnapshotId ?? thread.graph?.id;
  } catch {
    return undefined;
  }
}

function shouldRefreshWorkflowRunDurability(event: WorkflowRunEvent): boolean {
  return (
    event.type.startsWith("ambient.call") ||
    event.type.startsWith("workflow.recovery.") ||
    event.type === "workflow.timeout" ||
    event.type === "workflow.failed" ||
    event.type === "workflow.canceled" ||
    event.type === "workflow.paused" ||
    event.type === "workflow.succeeded"
  );
}

function workflowRunProviderHealthFromEvents(events: WorkflowRunEvent[]): WorkflowRunProviderHealth {
  const providerEvents = events.filter((event) => event.type.startsWith("ambient.call"));
  const providerProgressEvents = providerEvents.filter((event) => event.type === "ambient.call.progress");
  const validationErrorEvents = providerEvents.filter((event) => event.type === "ambient.call.invalid" || stringFromRecord(event.data, "failureKind") === "validation");
  const providerErrorEvents = providerEvents.filter((event) => event.type === "ambient.call.error" && isProviderAmbientCallErrorEvent(event));
  const latestProviderEvent = providerEvents.at(-1);
  const latestProviderError = providerErrorEvents.at(-1);
  const latestValidationError = validationErrorEvents.at(-1);
  const terminalFailure = [...events].reverse().find((event) => event.type === "workflow.failed" || event.type === "workflow.timeout");
  const providerError = stringFromRecord(latestProviderError?.data, "error") ?? latestProviderError?.message;
  const validationError = stringFromRecord(latestValidationError?.data, "error") ?? latestValidationError?.message;
  const terminalError = terminalFailure?.message ?? stringFromRecord(terminalFailure?.data, "error");
  const error = providerError ?? validationError ?? terminalError;
  const status: WorkflowRunProviderHealth["status"] =
    latestProviderError || (!latestValidationError && isProviderFailureMessage(error))
      ? "provider_degraded"
      : terminalFailure || latestValidationError
        ? "product_failed"
        : providerEvents.length > 0 || events.some((event) => event.type === "workflow.succeeded")
          ? "ok"
          : "unknown";
  return {
    status,
    providerEventCount: providerEvents.length,
    providerProgressEventCount: providerProgressEvents.length,
    providerErrorEventCount: providerErrorEvents.length,
    latestProviderEventType: latestProviderEvent?.type,
    latestProviderEventAt: latestProviderEvent?.createdAt,
    error,
  };
}

function isProviderAmbientCallErrorEvent(event: WorkflowRunEvent): boolean {
  const failureKind = stringFromRecord(event.data, "failureKind");
  if (failureKind === "provider") return true;
  if (failureKind === "validation") return false;
  return providerErrorEventCarriesRetryMetadata(event) || isProviderFailureMessage(stringFromRecord(event.data, "error") ?? event.message);
}

function workflowRunRetryMetadataFromEvents(events: WorkflowRunEvent[], recovery: WorkflowRecoveryContext | undefined): WorkflowRunRetryMetadata {
  const providerRetryMetadataEvents = events.filter((event) => event.type === "ambient.call.error" && providerErrorEventCarriesRetryMetadata(event));
  const providerRetryEvents = providerRetryMetadataEvents.filter((event) => event.data?.willRetry === true);
  const recoveryEvents = events.filter((event) => event.type.startsWith("workflow.recovery."));
  const retryEvents = [...providerRetryMetadataEvents, ...recoveryEvents].sort((left, right) => left.seq - right.seq);
  const latestRetryEvent = retryEvents.at(-1);
  const latestRecoveryEvent = recoveryEvents.at(-1);
  return {
    retryEventCount: retryEvents.length,
    providerRetryEventCount: providerRetryEvents.length,
    recoveryAttemptCount: recoveryEvents.filter((event) => event.type === "workflow.recovery.start").length,
    latestRetryEventType: latestRetryEvent?.type,
    latestRetryEventAt: latestRetryEvent?.createdAt,
    latestRecoveryAction: recovery?.action ?? workflowRecoveryActionFromString(stringFromRecord(latestRecoveryEvent?.data, "action")),
    sourceRunId: recovery?.sourceRunId ?? stringFromRecord(latestRecoveryEvent?.data, "sourceRunId"),
    sourceEventId: recovery?.sourceEventId ?? stringFromRecord(latestRecoveryEvent?.data, "sourceEventId"),
    targetKind: recovery?.targetKind ?? workflowRecoveryTargetKindFromString(stringFromRecord(latestRecoveryEvent?.data, "targetKind")),
    targetItemKey: recovery?.targetItemKey ?? stringFromRecord(latestRecoveryEvent?.data, "itemKey"),
  };
}

function providerErrorEventCarriesRetryMetadata(event: WorkflowRunEvent): boolean {
  const data = event.data;
  if (!data) return true;
  return (
    typeof data.attempt === "number" ||
    typeof data.retryable === "boolean" ||
    typeof data.willRetry === "boolean" ||
    typeof data.retryDelayMs === "number" ||
    typeof data.transientFailureCount === "number"
  );
}

function isProviderFailureMessage(message: string | undefined): boolean {
  return Boolean(
    message &&
      /\b(?:ambient|pi|gmi|provider|model|429|rate limit|upstream|timeout|timed out|stream|idle|network|socket|econnreset|terminated)\b/i.test(
        message,
      ),
  );
}

function workflowRecoveryActionFromString(value: string | undefined): WorkflowRecoveryAction | undefined {
  return value === "retry_step" || value === "resume_checkpoint" || value === "skip_item" ? value : undefined;
}

function workflowRecoveryTargetKindFromString(value: string | undefined): WorkflowRecoveryTargetKind | undefined {
  return value === "step" || value === "page" || value === "item" || value === "chunk" ? value : undefined;
}

function workflowTotalRuntimeLimitMessage(maxRunMs: number | undefined): string {
  return maxRunMs === undefined
    ? "Workflow reached the total runtime limit."
    : `Workflow reached the total runtime limit (${formatRunLimitDuration(maxRunMs)}).`;
}

async function validateWorkflowConnectorReadiness(input: {
  source: string;
  manifest: WorkflowManifest;
  connectorDescriptors: Array<WorkflowConnectorRegistration["descriptor"]>;
  eventSink: WorkflowEventSink;
}): Promise<void> {
  const manifestConnectors = input.manifest.connectors ?? [];
  const sourceUsesConnectors = /\bconnectors\s*\.\s*call\b/.test(input.source);
  if (!sourceUsesConnectors && manifestConnectors.length === 0) return;

  try {
    validateWorkflowSourceConnectorReferences(input.source, input.manifest, input.connectorDescriptors);
    validateWorkflowConnectorManifest(input.manifest, input.connectorDescriptors);
    await input.eventSink.append({
      type: "workflow.connector-preflight",
      message: manifestConnectors.length > 0 ? "Validated workflow connector readiness." : "No connector grants are required.",
      data: {
        status: "ready",
        connectorCount: manifestConnectors.length,
        connectors: workflowConnectorPreflightRows(input.manifest, input.connectorDescriptors),
      },
    });
  } catch (error) {
    await input.eventSink.append({
      type: "workflow.connector-preflight",
      message: "Blocked workflow connector readiness.",
      data: {
        status: "blocked",
        error: errorMessage(error),
        connectorCount: manifestConnectors.length,
        connectors: workflowConnectorPreflightRows(input.manifest, input.connectorDescriptors),
      },
    });
    throw error;
  }
}

function workflowConnectorPreflightRows(
  manifest: WorkflowManifest,
  connectorDescriptors: Array<WorkflowConnectorRegistration["descriptor"]>,
): Array<Record<string, unknown>> {
  const descriptorsById = new Map(connectorDescriptors.map((descriptor) => [descriptor.id, descriptor]));
  return (manifest.connectors ?? []).map((grant) => {
    const descriptor = descriptorsById.get(grant.connectorId);
    return {
      connectorId: grant.connectorId,
      accountId: grant.accountId,
      operations: grant.operations,
      scopes: grant.scopes,
      dataRetention: grant.dataRetention,
      authStatus: descriptor?.auth.status ?? "missing",
      availableAccounts: descriptor?.accounts.map((account) => account.id) ?? [],
    };
  });
}

function formatRunLimitDuration(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000 && ms % 1_000 === 0) return `${Math.round(ms / 1_000)}s`;
  return `${ms}ms`;
}

function stringFromRecord(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeConnectorCallInput(rawInput: unknown) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new Error("connectors.call input must be an object.");
  }
  const record = rawInput as Record<string, unknown>;
  if (typeof record.connectorId !== "string" || !record.connectorId.trim()) {
    throw new Error("connectors.call connectorId is required.");
  }
  if (typeof record.operation !== "string" || !record.operation.trim()) {
    throw new Error("connectors.call operation is required.");
  }
  return {
    connectorId: record.connectorId.trim(),
    operation: record.operation.trim(),
    input: record.input,
    accountId: typeof record.accountId === "string" && record.accountId.trim() ? record.accountId.trim() : undefined,
    idempotencyKey:
      typeof record.idempotencyKey === "string" && record.idempotencyKey.trim() ? record.idempotencyKey.trim() : undefined,
    nodeId: typeof record.nodeId === "string" && record.nodeId.trim() ? record.nodeId.trim() : undefined,
    edgeId: typeof record.edgeId === "string" && record.edgeId.trim() ? record.edgeId.trim() : undefined,
    itemKey: typeof record.itemKey === "string" && record.itemKey.trim() ? record.itemKey.trim() : undefined,
  };
}

function approvalDecisionsForRun(store: ProjectStore, runId: string): Map<string, WorkflowApprovalStatus> {
  return new Map(workflowApprovalsFromEvents(store.listWorkflowRunEvents(runId)).map((approval) => [approval.id, approval.status]));
}

function approvalDecisionsForResumeChain(store: ProjectStore, runId: string): Map<string, WorkflowApprovalStatus> {
  const decisions = new Map<string, WorkflowApprovalStatus>();
  for (const chainRunId of workflowResumeChainRunIds(store, runId)) {
    for (const [approvalId, status] of approvalDecisionsForRun(store, chainRunId)) decisions.set(approvalId, status);
  }
  return decisions;
}

function userInputResponsesForResumeChain(store: ProjectStore, runId: string): Map<string, WorkflowUserInputResponse> {
  const responses = new Map<string, WorkflowUserInputResponse>();
  for (const chainRunId of workflowResumeChainRunIds(store, runId)) {
    for (const event of store.listWorkflowRunEvents(chainRunId)) {
      if (event.type !== "workflow.input.received") continue;
      const requestId = stringFromRecord(event.data, "requestId") ?? event.message;
      if (!requestId) continue;
      const response: WorkflowUserInputResponse = {
        requestId,
        choiceId: stringFromRecord(event.data, "choiceId"),
        text: stringFromRecord(event.data, "text"),
        data: event.data?.data,
      };
      responses.set(requestId, response);
    }
  }
  return responses;
}

function approvedOrRejected(status: WorkflowApprovalStatus | undefined): "approved" | "rejected" | undefined {
  return status === "approved" || status === "rejected" ? status : undefined;
}

function pendingApprovalForRun(store: ProjectStore, runId: string) {
  return workflowApprovalsFromEvents(store.listWorkflowRunEvents(runId)).find((approval) => approval.status === "pending");
}

function validateResumeRun(run: WorkflowRunSummary, artifactId: string): WorkflowRunSummary {
  if (run.artifactId !== artifactId) {
    throw new Error(`Cannot resume workflow run ${run.id} for a different artifact.`);
  }
  return run;
}

function validateResumeCompatibility(store: ProjectStore, runId: string, sourceHash: string, manifestHash: string): void {
  const versionEvent = [...store.listWorkflowRunEvents(runId)]
    .reverse()
    .find((event) => event.type === "workflow.version");
  if (!versionEvent) return;
  const previousSourceHash = stringFromRecord(versionEvent.data, "sourceHash") ?? versionEvent.message;
  const previousManifestHash = stringFromRecord(versionEvent.data, "manifestHash");
  if (previousSourceHash !== sourceHash || (previousManifestHash && previousManifestHash !== manifestHash)) {
    throw new Error(`Cannot resume workflow run ${runId} because the workflow source or manifest changed. Start a fresh run or restore the prior workflow version before resuming.`);
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stableValue(record[key])]));
}

async function writeAuditReport(store: ProjectStore, artifactId: string, runId: string): Promise<string> {
  const artifact = store.getWorkflowArtifact(artifactId);
  const run = store.getWorkflowRun(runId);
  const events = workflowResumeChainEvents(store, runId);
  const modelCalls = workflowResumeChainModelCalls(store, runId);
  const checkpoints = readWorkflowCheckpointSummaries(artifact.statePath);
  const approvals = workflowApprovalsFromEvents(events);
  const sourceHash = await readFile(artifact.sourcePath, "utf8")
    .then(hashWorkflowSource)
    .catch(() => undefined);
  const reportPath = join(dirname(artifact.sourcePath), "reports", `${runId}.md`);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    generateWorkflowAuditReport({ artifact, run, events, modelCalls, checkpoints, approvals, sourceHash }),
    "utf8",
  );
  return reportPath;
}

function createAmbientHandlers(input: {
  store: ProjectStore;
  runId: string;
  workflowThreadId?: string;
  manifest: { tools: string[]; maxModelCalls?: number };
  eventSink: WorkflowEventSink;
  provider: WorkflowAmbientProvider;
  model: string;
  abortSignal?: AbortSignal;
  retryPolicy?: AmbientRetryPolicy;
}) {
  const appendProgressEvent = createAmbientProgressEventAppender(input.eventSink);
  const client = createWorkflowAmbientClient({
    provider: input.provider,
    eventSink: input.eventSink,
    cache: new MemoryWorkflowAmbientCache(),
    abortSignal: input.abortSignal,
    cacheMetadata: { workflowThreadId: input.workflowThreadId },
    onProgress: appendProgressEvent,
    retryPolicy: input.retryPolicy,
  });
  let calls = 0;
  return {
    call: async (rawSpec: unknown) => {
      if (!input.manifest.tools.includes("ambient.responses")) {
        throw new Error("Workflow manifest does not allow Ambient calls: ambient.responses");
      }
      calls += 1;
      if (input.manifest.maxModelCalls !== undefined && calls > input.manifest.maxModelCalls) {
        throw new Error(`Workflow exceeded max model calls (${input.manifest.maxModelCalls}).`);
      }

      const spec = normalizeAmbientSpec(rawSpec);
      const cacheCheckpoint = workflowAmbientCallCacheCheckpoint(spec, 1, { workflowThreadId: input.workflowThreadId });
      const startedAt = new Date().toISOString();
      try {
        const output = await client.call(spec);
        const completedAt = new Date().toISOString();
        input.store.recordWorkflowModelCall({
          runId: input.runId,
          task: spec.task,
          status: "succeeded",
          input: spec.input,
          output,
          cacheKey: normalizedCacheKey(spec.cacheKey),
          cacheCheckpoint,
          model: normalizeAmbientModelId(input.model),
          graphNodeId: spec.nodeId,
          graphEdgeId: spec.edgeId,
          itemKey: spec.itemKey,
          startedAt,
          completedAt,
        });
        return output;
      } catch (error) {
        const completedAt = new Date().toISOString();
        input.store.recordWorkflowModelCall({
          runId: input.runId,
          task: spec.task,
          status: modelCallStatus(error),
          input: spec.input,
          cacheKey: normalizedCacheKey(spec.cacheKey),
          cacheCheckpoint,
          model: normalizeAmbientModelId(input.model),
          graphNodeId: spec.nodeId,
          graphEdgeId: spec.edgeId,
          itemKey: spec.itemKey,
          validationError: errorMessage(error),
          startedAt,
          completedAt,
        });
        throw error;
      }
    },
  };
}

function createAmbientProgressEventAppender(eventSink: WorkflowEventSink): (input: {
  spec: WorkflowAmbientCallSpec<unknown>;
  attempt: number;
  cacheCheckpoint: ReturnType<typeof workflowAmbientCallCacheCheckpoint>;
  progress: WorkflowPiProgress;
}) => void {
  const progressByCall = new Map<
    string,
    { emittedAt: number; stage?: WorkflowPiProgress["stage"]; outputChars: number; thinkingChars: number }
  >();
  return ({ spec, attempt, cacheCheckpoint, progress }) => {
    const key = [cacheCheckpoint.id, attempt, spec.task, spec.nodeId ?? "", spec.edgeId ?? "", spec.itemKey ?? ""].join("|");
    const previous = progressByCall.get(key);
    const now = Date.now();
    const outputDelta = Math.abs(progress.outputChars - (previous?.outputChars ?? 0));
    const thinkingDelta = Math.abs(progress.thinkingChars - (previous?.thinkingChars ?? 0));
    const stageChanged = previous?.stage !== progress.stage;
    const staleEnough = !previous || now - previous.emittedAt >= WORKFLOW_AMBIENT_PROGRESS_THROTTLE_MS;
    const changedEnough = outputDelta >= WORKFLOW_AMBIENT_PROGRESS_CHAR_DELTA || thinkingDelta >= WORKFLOW_AMBIENT_PROGRESS_CHAR_DELTA;
    if (!stageChanged && !staleEnough && !changedEnough && progress.stage !== "completed") return;

    progressByCall.set(key, {
      emittedAt: now,
      stage: progress.stage,
      outputChars: progress.outputChars,
      thinkingChars: progress.thinkingChars,
    });
    const event = eventSink.append({
      type: "ambient.call.progress",
      message: spec.task,
      graphNodeId: spec.nodeId,
      graphEdgeId: spec.edgeId,
      itemKey: spec.itemKey,
      data: {
        attempt,
        providerStage: progress.stage,
        outputChars: progress.outputChars,
        responseChars: progress.outputChars,
        thinkingChars: progress.thinkingChars,
        providerElapsedMs: progress.elapsedMs,
        idleElapsedMs: progress.idleElapsedMs,
        idleTimeoutMs: progress.idleTimeoutMs,
        absoluteTimeoutMs: progress.absoluteTimeoutMs,
        timeoutMode: progress.timeoutMode,
        cacheCheckpoint,
        graphNodeId: spec.nodeId,
        graphEdgeId: spec.edgeId,
        itemKey: spec.itemKey,
      },
    });
    void Promise.resolve(event).catch(() => undefined);
  };
}

function normalizeAmbientSpec(rawSpec: unknown): WorkflowAmbientCallSpec<unknown> {
  if (!rawSpec || typeof rawSpec !== "object" || Array.isArray(rawSpec)) {
    throw new Error("ambient.call input must be an object.");
  }
  const record = rawSpec as Record<string, unknown>;
  const task = record.task;
  if (typeof task !== "string" || !task.trim()) throw new Error("ambient.call task is required.");
  const schema = record.schema;
  const baseSchema =
    schema && typeof schema === "object" && typeof (schema as { parse?: unknown }).parse === "function"
      ? (schema as WorkflowAmbientCallSpec<unknown>["schema"])
      : { parse: (value: unknown) => value };
  const outputContract = ambientOutputContractFromInput(record.input);
  return {
    task: task.trim(),
    input: record.input,
    schema: {
      parse: (value: unknown) => validateAmbientOutputContract(baseSchema.parse(value), outputContract),
    },
    cacheKey: typeof record.cacheKey === "string" || Array.isArray(record.cacheKey) ? record.cacheKey : undefined,
    nodeId: typeof record.nodeId === "string" && record.nodeId.trim() ? record.nodeId.trim() : undefined,
    edgeId: typeof record.edgeId === "string" && record.edgeId.trim() ? record.edgeId.trim() : undefined,
    itemKey: typeof record.itemKey === "string" && record.itemKey.trim() ? record.itemKey.trim() : undefined,
    retry:
      record.retry && typeof record.retry === "object" && !Array.isArray(record.retry)
        ? {
            maxAttempts:
              typeof (record.retry as Record<string, unknown>).maxAttempts === "number"
                ? ((record.retry as Record<string, unknown>).maxAttempts as number)
                : undefined,
            onInvalid:
              (record.retry as Record<string, unknown>).onInvalid === "retry" || (record.retry as Record<string, unknown>).onInvalid === "fail"
                ? ((record.retry as Record<string, unknown>).onInvalid as "retry" | "fail")
                : undefined,
          }
        : undefined,
  };
}

function ambientOutputContractFromInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const contract = (input as Record<string, unknown>).outputContract ?? (input as Record<string, unknown>).expectedOutput;
  return contract && typeof contract === "object" && !Array.isArray(contract) ? contract : undefined;
}

function validateAmbientOutputContract(value: unknown, contract: unknown): unknown {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("model output must be a JSON object");
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(contract as Record<string, unknown>)) {
    if (!(key in record)) throw new Error(`model output missing required field ${key}`);
    validateAmbientOutputContractField(record[key], schema, `$.${key}`);
    result[key] = record[key];
  }
  return result;
}

function validateAmbientOutputContractField(value: unknown, schema: unknown, path: string): void {
  const type = ambientOutputContractFieldType(schema);
  if (!type) return;
  if (type === "array") {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
    return;
  }
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
    return;
  }
  if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a number`);
    return;
  }
  if (type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${path} must be an integer`);
    return;
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${path} must be a boolean`);
    return;
  }
  if (type === "string" && typeof value !== "string") throw new Error(`${path} must be a string`);
}

function ambientOutputContractFieldType(schema: unknown): string | undefined {
  if (typeof schema === "string") return schema.toLowerCase();
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  const type = (schema as Record<string, unknown>).type;
  return typeof type === "string" ? type.toLowerCase() : undefined;
}

function normalizedCacheKey(cacheKey: string | unknown[] | undefined): string | undefined {
  if (cacheKey === undefined) return undefined;
  return typeof cacheKey === "string" ? cacheKey : JSON.stringify(cacheKey);
}

function modelCallStatus(error: unknown): WorkflowModelCallStatus {
  return /validation|invalid|expected|required|schema/i.test(errorMessage(error)) ? "invalid" : "failed";
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error:\s*/i, "");
}

function isWorkflowCanceledError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return /user (?:aborted|canceled|cancelled)|canceled by user|cancelled by user/i.test(errorMessage(error));
}

function isWorkflowManualPausedError(error: unknown, signal?: AbortSignal): boolean {
  return error instanceof WorkflowManualPausedError || signal?.reason instanceof WorkflowManualPausedError;
}

function workflowManualPauseReason(error: unknown, signal?: AbortSignal): string {
  const reason = error instanceof WorkflowManualPausedError
    ? error.reason
    : signal?.reason instanceof WorkflowManualPausedError
      ? signal.reason.reason
      : "Workflow paused by user.";
  return reason.trim() || "Workflow paused by user.";
}
