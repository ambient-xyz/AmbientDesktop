import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { AmbientModelRuntimeProfile } from "../shared/ambientModels";
import type { LocalTextResultArtifact } from "../shared/localTextDelegation";
import type { SubagentResultArtifact, SubagentRunStatus } from "../shared/subagentProtocol";
import { getDefaultSubagentRoleProfile, type SubagentRoleId } from "../shared/subagentRoles";
import { compactSubagentTurnBudgetPolicyForPi } from "../shared/subagentTurnBudget";
import type {
  SubagentCapacityLocalMemorySnapshot,
  SubagentCapacityLocalRuntimeReservationSnapshot,
} from "../shared/subagentCapacity";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  LocalRuntimeLeaseRecord,
  SubagentRunEventSummary,
  SubagentRunSummary,
  ThreadSummary,
} from "../shared/types";
import type {
  LocalModelHostMemorySnapshot,
  LocalModelResourcePolicyDecision,
  LocalModelResourceRegistrySnapshot,
  LocalModelResourceRequestedLaunch,
  LocalModelResourceSettings,
} from "../shared/types";
import {
  isLocalModelRuntimeStartupError,
  type LocalModelRuntimeAcquisition,
  type LocalModelRuntimeAcquireInput,
  type LocalModelRuntimeReleaseResult,
  type LocalModelRuntimeStartupFailure,
  type LocalModelRuntimeState,
} from "./localModelRuntimeManager";
import type {
  SubagentChildRuntimeAdapter,
  SubagentChildRuntimeCancelInput,
  SubagentChildRuntimeStartInput,
  SubagentChildRuntimeStartResult,
  SubagentChildRuntimeLaunchPreflightInput,
  SubagentChildRuntimeWaitInput,
  SubagentChildRuntimeWaitResult,
} from "./piChildSessionAdapter";
import {
  completeLocalTextDelegation,
  isLocalTextDelegationRuntimeFailureError,
  prepareLocalTextDelegationRuntimePlan,
  validateLocalTextRuntimeLaunchDescriptor,
  type LocalTextDelegationRuntimeFailureEvidence,
  type LocalTextDelegationRuntimeAcquireResult,
  type LocalTextRuntimeLaunchReadiness,
  type LocalTextRuntimeLaunchDescriptor,
  type LocalTextRuntimeManagerLike,
} from "./localTextDelegation";
import {
  buildLocalModelResourceRegistry,
  localModelResourcePolicySnapshotValidationReason,
  localTextRequestedLaunch,
  validateLocalModelResourcePolicySnapshot,
} from "./localModelResourceRegistry";
import { subagentTranscriptPath } from "./subagentLifecycleHooks";
import { subagentStructuredOutputForLocalText } from "./subagentStructuredOutput";

export interface LocalTextSubagentRuntimeConfig {
  launch: LocalTextRuntimeLaunchDescriptor;
  completionUrl: string;
  artifactRootPath?: string;
  fullOutputPath?: string;
  maxInlineChars?: number;
  timeoutMs?: number;
  stateRootPath?: string;
}

export interface LocalTextSubagentRuntimeStore {
  getSubagentRun(runId: string): SubagentRunSummary;
  markSubagentRunStatus(runId: string, status: SubagentRunStatus, options?: { resultArtifact?: unknown; now?: string }): SubagentRunSummary;
  appendSubagentRunEvent(runId: string, input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string }): SubagentRunEventSummary;
  appendSubagentMailboxEvent(runId: string, input: {
    direction: "parent_to_child" | "child_to_parent";
    type: string;
    payload: unknown;
    deliveryState?: SubagentMailboxDeliveryState;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentMailboxEventSummary;
  addMessage(input: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }): unknown;
}

export interface CreateLocalTextSubagentRuntimeAdapterOptions {
  store: LocalTextSubagentRuntimeStore;
  runtimeManager: LocalTextRuntimeManagerLike;
  resolveRuntimeForLaunch?: (input: SubagentChildRuntimeLaunchPreflightInput) => LocalTextSubagentRuntimeConfig | undefined;
  resolveRuntime: (input: {
    parentThread: ThreadSummary;
    run: SubagentRunSummary;
    model: AmbientModelRuntimeProfile;
    task: string;
  }) => LocalTextSubagentRuntimeConfig | undefined;
  buildResourceRegistry?: (input: {
    parentThread: ThreadSummary;
    run: SubagentRunSummary;
    model: AmbientModelRuntimeProfile;
    config: LocalTextSubagentRuntimeConfig;
  }) => Promise<LocalModelResourceRegistrySnapshot> | LocalModelResourceRegistrySnapshot;
  buildResourceRegistryForLaunch?: (input: {
    parentThread: ThreadSummary;
    model: AmbientModelRuntimeProfile;
    config: LocalTextSubagentRuntimeConfig;
    launch: SubagentChildRuntimeLaunchPreflightInput;
  }) => Promise<LocalModelResourceRegistrySnapshot> | LocalModelResourceRegistrySnapshot;
  localModelResourceSettings?: LocalModelResourceSettings;
  localModelHostMemory?: () => LocalModelHostMemorySnapshot;
  approveResourceLimitExceed?: (decision: LocalModelResourcePolicyDecision) => Promise<boolean> | boolean;
  killLocalModelProcess?: (pid: number, signal?: NodeJS.Signals) => void;
  buildPrompt?: (input: SubagentChildRuntimeStartInput) => string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface LocalTextExecution {
  promise: Promise<void>;
  controller: AbortController;
  startedAt: string;
  startedAtMs: number;
}

const localTextSubagentRuntime = "ambient-local-text-subagent-runtime";
const localTextSubagentPhase = "phase-3-local-text-delegation";
const terminalStatuses = new Set<SubagentRunStatus>([
  "completed",
  "failed",
  "stopped",
  "cancelled",
  "timed_out",
  "detached",
  "aborted_partial",
]);

export function createLocalTextSubagentRuntimeAdapter(
  options: CreateLocalTextSubagentRuntimeAdapterOptions,
): SubagentChildRuntimeAdapter {
  const executions = new Map<string, LocalTextExecution>();

  const preflightChildLaunch = async (input: SubagentChildRuntimeLaunchPreflightInput) => {
    const model = input.model;
    if (model.locality !== "local") return undefined;
    if (!isLocalTextModel(model)) {
      return {
        schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1" as const,
        runtime: "local_text",
        allowed: false,
        blockers: [`Model ${model.modelId} is local but is not eligible for Phase 3 text-only local sub-agent execution.`],
        warnings: [],
        details: {
          model: {
            profileId: model.profileId,
            providerId: model.providerId,
            modelId: model.modelId,
            toolUse: model.toolUse,
            supportsVision: model.supportsVision,
            supportsAudio: model.supportsAudio,
          },
        },
      };
    }
    if (!options.resolveRuntimeForLaunch) return undefined;
    const config = options.resolveRuntimeForLaunch(input);
    if (!config) {
      return {
        schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1" as const,
        runtime: "local_text",
        allowed: false,
        blockers: [`Local text runtime is not configured for model ${model.modelId}; scheduler cannot reserve a local child.`],
        warnings: [],
        details: {
          model: {
            profileId: model.profileId,
            providerId: model.providerId,
            modelId: model.modelId,
          },
        },
      };
    }
    const launchReadiness = validateLocalTextRuntimeLaunchDescriptor({
      workspacePath: input.parentThread.workspacePath,
      stateRootPath: config.stateRootPath,
      model,
      launch: config.launch,
    });
    const capacity = await localTextLaunchCapacityForPreflight(options, {
      parentThread: input.parentThread,
      model,
      config,
      launch: input,
      launchReadiness,
    });
    const capacityBlockers = capacity && !capacity.localMemory.allowed ? [capacity.localMemory.reason] : [];
    const capacityWarnings = capacity?.localMemory.allowed && capacity.localMemory.outcome === "warn" ? [capacity.localMemory.reason] : [];
    return {
      schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1" as const,
      runtime: "local_text",
      allowed: launchReadiness.ready && capacityBlockers.length === 0,
      blockers: [...launchReadiness.blockers, ...capacityBlockers],
      warnings: [...launchReadiness.warnings, ...capacityWarnings],
      ...(capacity ? { capacity: { localMemory: capacity.localMemory } } : {}),
      details: {
        launchReadiness,
        ...(capacity ? { resourcePolicy: capacity.resourcePolicy } : {}),
      },
    };
  };

  const startChildRun = (input: SubagentChildRuntimeStartInput): SubagentChildRuntimeStartResult => {
    const current = options.store.getSubagentRun(input.run.id);
    if (current.closedAt || terminalStatuses.has(current.status)) {
      return {
        started: false,
        run: current,
        message: `Local text runtime was not started because the sub-agent is ${current.closedAt ? "closed" : current.status}.`,
      };
    }
    if (executions.has(current.id)) {
      return {
        started: false,
        run: current,
        message: "Local text runtime is already active for this sub-agent run.",
      };
    }
    const model = current.modelRuntimeSnapshot.profile;
    if (!isLocalTextModel(model)) {
      return {
        started: false,
        run: current,
        message: "Local text runtime skipped this run because the resolved model profile is not local text-only.",
      };
    }
    const config = options.resolveRuntime({ parentThread: input.parentThread, run: current, model, task: input.task });
    if (!config) {
      return {
        started: false,
        run: current,
        message: "Local text runtime skipped this run because no runtime launch descriptor is configured for the model.",
      };
    }

    const executionStartedAtMs = Date.now();
    const executionStartedAt = new Date(executionStartedAtMs).toISOString();
    const controller = new AbortController();
    const starting = options.store.markSubagentRunStatus(current.id, "starting", { now: nowIso(options) });
    input.emitEvent({
      type: "status",
      source: "child_runtime",
      status: "starting",
      message: "Local text runtime is starting.",
    });
    options.store.addMessage({
      threadId: starting.childThreadId,
      role: "system",
      content: `Local text sub-agent runtime starting.\n\nTask:\n${previewText(input.task, 1200)}`,
      metadata: {
        runtime: localTextSubagentRuntime,
        phase: localTextSubagentPhase,
        status: "starting",
        subagentRunId: starting.id,
        canonicalTaskPath: starting.canonicalTaskPath,
        turnBudgetPolicy: compactSubagentTurnBudgetPolicyForPi(input.turnBudgetPolicy),
      },
    });
    const promise = runLocalTextChild({ ...input, run: starting }, options, config, controller.signal)
      .finally(() => executions.delete(starting.id));
    executions.set(starting.id, { promise, controller, startedAt: executionStartedAt, startedAtMs: executionStartedAtMs });
    return {
      started: true,
      run: options.store.getSubagentRun(starting.id),
      message: "Local text runtime preflight started in the visible child thread.",
    };
  };

  const waitForChildRun = async (input: SubagentChildRuntimeWaitInput): Promise<SubagentChildRuntimeWaitResult> => {
    const execution = executions.get(input.run.id);
    if (!execution) {
      return { run: options.store.getSubagentRun(input.run.id), timedOut: false };
    }
    const remainingRuntimeBudgetMs = remainingLocalTextRuntimeBudgetMs(input.run, execution);
    if (remainingRuntimeBudgetMs !== undefined && remainingRuntimeBudgetMs <= 0) {
      return {
        run: settleLocalTextRuntimeBudgetExceeded(options, input, execution),
        timedOut: true,
      };
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = Symbol("local-text-subagent-wait-timeout");
    const timeoutMs = Math.max(
      0,
      remainingRuntimeBudgetMs === undefined ? input.timeoutMs : Math.min(input.timeoutMs, remainingRuntimeBudgetMs),
    );
    const timeoutPromise = new Promise<typeof timedOut>((resolveTimeout) => {
      timeout = setTimeout(() => resolveTimeout(timedOut), timeoutMs);
      if (typeof timeout === "object" && "unref" in timeout && typeof timeout.unref === "function") timeout.unref();
    });
    try {
      const result = await Promise.race([execution.promise.then(() => undefined), timeoutPromise]);
      const latest = options.store.getSubagentRun(input.run.id);
      const didTimeOut = result === timedOut;
      if (didTimeOut) {
        const latestRemainingRuntimeBudgetMs = remainingLocalTextRuntimeBudgetMs(latest, execution);
        if (latestRemainingRuntimeBudgetMs !== undefined && latestRemainingRuntimeBudgetMs <= 0) {
          return {
            run: settleLocalTextRuntimeBudgetExceeded(options, input, execution),
            timedOut: true,
          };
        }
        input.emitEvent({
          type: "status",
          status: latest.status,
          message: "wait_agent timed out before the local text child reached a terminal status.",
        });
      }
      return {
        run: latest,
        timedOut: didTimeOut,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  const cancelChildRun = (input: SubagentChildRuntimeCancelInput) => {
    const current = options.store.getSubagentRun(input.run.id);
    if (current.closedAt || terminalStatuses.has(current.status)) {
      return {
        run: current,
        cancelled: current.status === "cancelled",
      };
    }
    const resultArtifact = subagentTerminalArtifact({
      run: current,
      status: "cancelled",
      summary: input.reason,
    });
    const cancelled = options.store.markSubagentRunStatus(current.id, "cancelled", {
      now: nowIso(options),
      resultArtifact,
    });
    options.store.addMessage({
      threadId: cancelled.childThreadId,
      role: "system",
      content: `Local text sub-agent cancelled by parent.\n\nReason: ${input.reason}`,
      metadata: {
        runtime: localTextSubagentRuntime,
        phase: localTextSubagentPhase,
        status: "cancelled",
        subagentRunId: cancelled.id,
      },
    });
    input.emitEvent({
      type: "cancelled",
      source: "child_runtime",
      status: "cancelled",
      message: input.reason,
    });
    executions.get(current.id)?.controller.abort(new Error(input.reason));
    return {
      run: cancelled,
      cancelled: true,
    };
  };

  return {
    preflightChildLaunch,
    startChildRun,
    waitForChildRun,
    cancelChildRun,
  };
}

async function runLocalTextChild(
  input: SubagentChildRuntimeStartInput,
  options: CreateLocalTextSubagentRuntimeAdapterOptions,
  config: LocalTextSubagentRuntimeConfig,
  signal: AbortSignal,
): Promise<void> {
  try {
    const model = input.run.modelRuntimeSnapshot.profile;
    const artifactRootPath = resolve(config.artifactRootPath ?? join(input.parentThread.workspacePath, ".ambient/subagents", input.run.id));
    const resourceRegistry = await resourceRegistryForLocalTextRun(options, {
      parentThread: input.parentThread,
      run: input.run,
      model,
      config,
    });
    const prompt = options.buildPrompt?.(input) ?? defaultLocalTextPrompt(input);
    const plan = await prepareLocalTextDelegationRuntimePlan({
      workspacePath: input.parentThread.workspacePath,
      model,
      resourceRegistry,
      launch: config.launch,
      ownerThreadId: input.run.childThreadId,
      parentThreadId: input.parentThread.id,
      subagentThreadId: input.run.childThreadId,
      subagentRunId: input.run.id,
      ownerDisplayName: input.role.label,
      stateRootPath: config.stateRootPath,
      invocation: {
        prompt,
        requestedOutputTokens: model.maxOutputTokens,
        structuredOutputRequired: input.role.guardPolicy.structuredOutputRequired,
        requireModelNativeStructuredOutput: false,
        maxInlineChars: config.maxInlineChars,
      },
      approveResourceLimitExceed: options.approveResourceLimitExceed,
      killLocalModelProcess: options.killLocalModelProcess,
    });
    const preflight = plan.preflight;
    options.store.appendSubagentRunEvent(input.run.id, {
      type: "subagent.local_text_preflight",
      preview: localTextRunEventPreview(input.run, {
        allowed: preflight.allowed,
        blockers: preflight.blockers,
        warnings: preflight.warnings,
        resourcePolicy: preflight.resourcePolicy,
        launchReadiness: preflight.launchReadiness,
        resourcePolicyEnforcement: preflight.resourcePolicyEnforcement,
        invocationLimits: preflight.invocationLimits,
        turnBudgetPolicy: compactSubagentTurnBudgetPolicyForPi(input.turnBudgetPolicy),
      }),
    });
    if (!preflight.allowed) {
      throw new Error(`Local text delegation runtime preflight failed: ${preflight.blockers.join(" ")}`);
    }
    if (isRunTerminal(options.store.getSubagentRun(input.run.id))) return;
    const running = options.store.markSubagentRunStatus(input.run.id, "running", { now: nowIso(options) });
    input.emitEvent({
      type: "started",
      source: "child_runtime",
      status: "running",
      message: "Local text runtime accepted the child run after resource preflight.",
      localMemoryBytes: preflight.resourcePolicy.projectedEstimatedResidentMemoryBytes,
    });
    options.store.appendSubagentRunEvent(running.id, {
      type: "subagent.local_text_started",
      preview: localTextRunEventPreview(running, {
        runtimeId: config.launch.runtimeId ?? model.profileId,
        modelId: model.modelId,
        completionUrl: config.completionUrl,
        resourcePolicy: preflight.resourcePolicy,
        launchReadiness: preflight.launchReadiness,
        resourcePolicyEnforcement: preflight.resourcePolicyEnforcement,
        invocationLimits: preflight.invocationLimits,
      }),
    });
    const completion = await completeLocalTextDelegation({
      runtimeManager: options.runtimeManager,
      workspacePath: input.parentThread.workspacePath,
      ownerThreadId: running.childThreadId,
      model,
      resourceRegistry,
      launch: config.launch,
      stateRootPath: config.stateRootPath,
      preparedPlan: plan,
      completion: {
        runId: running.id,
        prompt,
        completionUrl: config.completionUrl,
        artifactRootPath,
        fullOutputPath: config.fullOutputPath,
        maxInlineChars: config.maxInlineChars,
        maxOutputTokens: plan.preflight.invocationLimits?.outputReserveTokens,
        structuredOutputRequired: input.role.guardPolicy.structuredOutputRequired,
        requireModelNativeStructuredOutput: false,
        timeoutMs: config.timeoutMs,
        signal,
      },
      onRuntimeAcquired: (acquired) => recordLocalTextRuntimeLeaseAcquired(options, input, running, acquired),
      fetchImpl: options.fetchImpl,
    });
    const afterCompletion = options.store.getSubagentRun(running.id);
    if (isRunTerminal(afterCompletion)) {
      appendTerminalLocalTextReleaseEvidence(options, afterCompletion, {
        completion: completion.completion,
        runtimeAcquisition: compactLocalModelRuntimeAcquisition(completion.runtimeAcquisition),
        runtimeState: compactLocalModelRuntimeState(completion.runtimeState),
        runtimeRelease: compactLocalModelRuntimeRelease(completion.runtimeRelease),
        outputValidation: completion.outputValidation,
        localTextResult: compactLocalTextResult(completion.artifact),
      });
      return;
    }
    const resultArtifact = await writeSubagentResultArtifact({
      artifactRootPath,
      run: running,
      localArtifact: completion.artifact,
      summary: completion.artifact.textPreview,
    });
    const completed = options.store.markSubagentRunStatus(running.id, "completed", {
      now: nowIso(options),
      resultArtifact,
    });
    options.store.addMessage({
      threadId: completed.childThreadId,
      role: "assistant",
      content: localTextAssistantMessage(completion.artifact),
      metadata: {
        runtime: localTextSubagentRuntime,
        phase: localTextSubagentPhase,
        status: "completed",
        subagentRunId: completed.id,
        resultArtifact,
        localTextResult: completion.artifact,
      },
    });
    options.store.appendSubagentRunEvent(completed.id, {
      type: "subagent.local_text_completed",
      preview: localTextRunEventPreview(completed, {
        completion: completion.completion,
        runtimeAcquisition: compactLocalModelRuntimeAcquisition(completion.runtimeAcquisition),
        runtimeState: compactLocalModelRuntimeState(completion.runtimeState),
        runtimeRelease: compactLocalModelRuntimeRelease(completion.runtimeRelease),
        outputValidation: completion.outputValidation,
        resultArtifact: compactSubagentResultArtifact(resultArtifact),
        localTextResult: compactLocalTextResult(completion.artifact),
      }),
      artifactPath: resultArtifact.artifactPath,
    });
    input.emitEvent({
      type: "assistant_delta",
      source: "child_runtime",
      textPreview: completion.artifact.textPreview,
      artifactPath: completion.artifact.fullOutputPath,
      localMemoryBytes: completion.runtimeState.actualResidentMemoryBytes ?? completion.runtimeState.estimatedResidentMemoryBytes,
    });
    input.emitEvent({
      type: "completed",
      source: "child_runtime",
      status: "completed",
      message: "Local text child completed with a result artifact.",
      artifactPath: resultArtifact.artifactPath,
      localMemoryBytes: completion.runtimeState.actualResidentMemoryBytes ?? completion.runtimeState.estimatedResidentMemoryBytes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const runtimeStartupFailure = localTextRuntimeStartupFailurePreview(error);
    const runtimeFailure = localTextDelegationFailurePreview(error);
    const current = options.store.getSubagentRun(input.run.id);
    if (isRunTerminal(current)) {
      if (runtimeStartupFailure) {
        options.store.appendSubagentRunEvent(current.id, {
          type: "subagent.local_text_runtime_failed",
          preview: localTextRunEventPreview(current, {
            ...runtimeStartupFailure,
            terminalStatus: current.status,
            summary: terminalLocalTextReleaseSummary(current.status),
          }),
        });
      }
      if (runtimeFailure) appendTerminalLocalTextReleaseEvidence(options, current, runtimeFailure);
      return;
    }
    const resultArtifact = subagentTerminalArtifact({
      run: input.run,
      status: "failed",
      summary: `Local text child failed: ${message}`,
    });
    if (runtimeStartupFailure) {
      options.store.appendSubagentRunEvent(input.run.id, {
        type: "subagent.local_text_runtime_failed",
        preview: localTextRunEventPreview(input.run, runtimeStartupFailure),
      });
    }
    if (runtimeFailure) {
      options.store.appendSubagentRunEvent(input.run.id, {
        type: "subagent.local_text_release_after_failure",
        preview: localTextRunEventPreview(input.run, runtimeFailure),
      });
    }
    const failed = options.store.markSubagentRunStatus(input.run.id, "failed", {
      now: nowIso(options),
      resultArtifact,
    });
    options.store.addMessage({
      threadId: failed.childThreadId,
      role: "system",
      content: `Local text sub-agent failed.\n\n${message}`,
      metadata: {
        runtime: localTextSubagentRuntime,
        phase: localTextSubagentPhase,
        status: "failed",
        subagentRunId: failed.id,
        ...(runtimeStartupFailure ? { runtimeStartupFailure } : {}),
        ...(runtimeFailure ? { localTextFailure: runtimeFailure } : {}),
      },
    });
    options.store.appendSubagentRunEvent(failed.id, {
      type: "subagent.local_text_failed",
      preview: localTextRunEventPreview(failed, {
        error: message,
        resultArtifact,
        ...(runtimeStartupFailure ? { runtimeStartupFailure } : {}),
        ...(runtimeFailure ? { localTextFailure: runtimeFailure } : {}),
      }),
    });
    const failureDetails = runtimeStartupFailure
      ? {
          reason: "runtime_startup_failed",
          runtime: "local_text",
          runtimeStartupFailure,
        }
      : runtimeFailure
        ? {
            reason: "local_text_completion_failed",
            runtime: "local_text",
            localTextFailure: runtimeFailure,
          }
        : undefined;
    input.emitEvent({
      type: "error",
      source: "child_runtime",
      status: "failed",
      message,
      ...(failureDetails ? { details: failureDetails } : {}),
    });
  }
}

function appendTerminalLocalTextReleaseEvidence(
  options: CreateLocalTextSubagentRuntimeAdapterOptions,
  run: SubagentRunSummary,
  preview: Record<string, unknown>,
): void {
  options.store.appendSubagentRunEvent(run.id, {
    type: terminalLocalTextReleaseEventType(run.status),
    preview: localTextRunEventPreview(run, {
      ...preview,
      schemaVersion: "ambient-local-text-terminal-release-v1",
      terminalStatus: run.status,
      summary: terminalLocalTextReleaseSummary(run.status),
    }),
  });
}

function terminalLocalTextReleaseEventType(status: SubagentRunStatus): string {
  if (status === "cancelled") return "subagent.local_text_release_after_cancel";
  if (status === "aborted_partial") return "subagent.local_text_release_after_partial";
  return "subagent.local_text_release_after_failure";
}

function terminalLocalTextReleaseSummary(status: SubagentRunStatus): string {
  if (status === "cancelled") return "Local text runtime lease released after the child was cancelled.";
  if (status === "aborted_partial") return "Local text runtime lease released after the child produced an aborted partial result.";
  return `Local text runtime lease released after the child reached ${status}.`;
}

function recordLocalTextRuntimeLeaseAcquired(
  options: CreateLocalTextSubagentRuntimeAdapterOptions,
  input: SubagentChildRuntimeStartInput,
  run: SubagentRunSummary,
  acquired: LocalTextDelegationRuntimeAcquireResult,
): void {
  const runtimeLease = acquired.lease.runtimeLease;
  const runtimeState = acquired.lease.state;
  options.store.appendSubagentRunEvent(run.id, {
    type: "subagent.local_runtime_lease_acquired",
    preview: localTextRunEventPreview(run, {
      schemaVersion: "ambient-local-text-runtime-lease-acquired-v1",
      runtimeAcquisition: compactLocalModelRuntimeAcquisition(acquired.lease.acquisition),
      runtimeState: compactLocalModelRuntimeState(runtimeState),
      runtimeLease: compactLocalRuntimeLeaseRecord(runtimeLease),
      requestedLaunch: compactLocalModelRequestedLaunch(acquired.plan.requestedLaunch),
      acquireInput: compactLocalModelRuntimeAcquireInput(acquired.plan.acquireInput),
    }),
  });
  input.emitEvent({
    type: "status",
    source: "child_runtime",
    status: "running",
    message: `Local text runtime lease ${runtimeLease.leaseId} acquired.`,
    localMemoryBytes:
      runtimeLease.actualResidentMemoryBytes ??
      runtimeLease.estimatedResidentMemoryBytes ??
      runtimeState.actualResidentMemoryBytes ??
      runtimeState.estimatedResidentMemoryBytes,
    details: {
      reason: "local_runtime_lease_acquired",
      runtime: "local_text",
      leaseId: runtimeLease.leaseId,
      runtimeId: runtimeState.runtimeId,
      providerId: runtimeState.providerId,
      modelId: runtimeState.modelId,
      ...(runtimeState.profileId ? { modelProfileId: runtimeState.profileId } : {}),
      parentThreadId: run.parentThreadId,
      subagentThreadId: run.childThreadId,
      subagentRunId: run.id,
      ...(runtimeLease.pid !== undefined ? { pid: runtimeLease.pid } : {}),
      ...(runtimeLease.endpoint ? { endpoint: runtimeLease.endpoint } : {}),
    },
  });
}

async function resourceRegistryForLocalTextRun(
  options: CreateLocalTextSubagentRuntimeAdapterOptions,
  input: {
    parentThread: ThreadSummary;
    run: SubagentRunSummary;
    model: AmbientModelRuntimeProfile;
    config: LocalTextSubagentRuntimeConfig;
  },
): Promise<LocalModelResourceRegistrySnapshot> {
  if (options.buildResourceRegistry) return options.buildResourceRegistry(input);
  return buildLocalModelResourceRegistry({
    workspacePath: input.parentThread.workspacePath,
    settings: options.localModelResourceSettings,
    ...(input.config.stateRootPath ? { residentDetection: { localTextStateRootPath: input.config.stateRootPath } } : {}),
    ...(options.localModelHostMemory ? { hostMemory: options.localModelHostMemory() } : {}),
    requestedLaunch: localTextRequestedLaunch({
      ownerThreadId: input.run.childThreadId,
      modelId: input.model.modelId,
      profileId: input.model.profileId,
      contextTokens: input.model.contextWindowTokens,
      estimatedResidentMemoryBytes: input.config.launch.estimatedResidentMemoryBytes,
    }),
    leases: localTextRuntimeManagerActiveLeases(options.runtimeManager),
  });
}

async function localTextLaunchCapacityForPreflight(
  options: CreateLocalTextSubagentRuntimeAdapterOptions,
  input: {
    parentThread: ThreadSummary;
    model: AmbientModelRuntimeProfile;
    config: LocalTextSubagentRuntimeConfig;
    launch: SubagentChildRuntimeLaunchPreflightInput;
    launchReadiness: LocalTextRuntimeLaunchReadiness;
  },
): Promise<{ localMemory: SubagentCapacityLocalMemorySnapshot; resourcePolicy: LocalModelResourcePolicyDecision } | undefined> {
  const requestedEstimatedResidentMemoryBytes = input.config.launch.estimatedResidentMemoryBytes ?? input.model.estimatedResidentMemoryBytes;
  const requestedLaunch = localTextRequestedLaunch({
    id: `${input.launch.idempotencyKey}:${input.launch.canonicalTaskPath}`,
    ownerThreadId: input.parentThread.id,
    modelId: input.model.modelId,
    profileId: input.model.profileId,
    contextTokens: input.model.contextWindowTokens,
    estimatedResidentMemoryBytes: requestedEstimatedResidentMemoryBytes,
  });
  const localRuntimeReservation = localRuntimeReservationForPreflight({
    parentThread: input.parentThread,
    model: input.model,
    launch: input.launch,
    launchReadiness: input.launchReadiness,
    requestedLaunch,
    estimatedResidentMemoryBytes: requestedEstimatedResidentMemoryBytes,
    memoryEstimateSource: input.config.launch.estimatedResidentMemoryBytes !== undefined
      ? "launch_descriptor"
      : input.model.estimatedResidentMemoryBytes !== undefined
        ? "model_profile"
        : "unknown",
  });
  const registry = options.buildResourceRegistryForLaunch
    ? await options.buildResourceRegistryForLaunch(input)
    : await buildLocalModelResourceRegistry({
      workspacePath: input.parentThread.workspacePath,
      settings: options.localModelResourceSettings,
      ...(input.config.stateRootPath ? { residentDetection: { localTextStateRootPath: input.config.stateRootPath } } : {}),
      ...(options.localModelHostMemory ? { hostMemory: options.localModelHostMemory() } : {}),
      requestedLaunch,
      leases: localTextRuntimeManagerActiveLeases(options.runtimeManager),
    });
  const validation = validateLocalModelResourcePolicySnapshot(registry);
  if (!validation.valid) {
    return {
      localMemory: invalidLocalMemorySnapshot({
        registry,
        reason: localModelResourcePolicySnapshotValidationReason(validation),
        localRuntimeReservation,
      }),
      resourcePolicy: registry.policyDecision,
    };
  }
  return {
    localMemory: localMemorySnapshotForPolicyDecision(registry.policyDecision, {
      localRuntimeReservation,
    }),
    resourcePolicy: registry.policyDecision,
  };
}

function localTextRuntimeManagerActiveLeases(
  runtimeManager: LocalTextRuntimeManagerLike,
): LocalRuntimeLeaseRecord[] {
  try {
    return runtimeManager.activeRuntimeLeases?.() ?? [];
  } catch {
    return [];
  }
}

function localRuntimeReservationForPreflight(input: {
  parentThread: ThreadSummary;
  model: AmbientModelRuntimeProfile;
  launch: SubagentChildRuntimeLaunchPreflightInput;
  launchReadiness: LocalTextRuntimeLaunchReadiness;
  requestedLaunch: LocalModelResourceRequestedLaunch;
  estimatedResidentMemoryBytes?: number;
  memoryEstimateSource: SubagentCapacityLocalRuntimeReservationSnapshot["memoryEstimateSource"];
}): SubagentCapacityLocalRuntimeReservationSnapshot {
  const descriptor = input.launchReadiness.descriptor;
  return {
    schemaVersion: "ambient-subagent-local-runtime-reservation-v1",
    status: "requested",
    runtimeId: descriptor.runtimeId,
    requestedLaunchId: input.requestedLaunch.id,
    capabilityKind: input.requestedLaunch.capability,
    providerId: input.model.providerId,
    modelId: input.model.modelId,
    ...(input.model.profileId ? { modelProfileId: input.model.profileId } : {}),
    parentThreadId: input.parentThread.id,
    ...(input.requestedLaunch.ownerThreadId ? { ownerThreadId: input.requestedLaunch.ownerThreadId } : {}),
    canonicalTaskPath: input.launch.canonicalTaskPath,
    idempotencyKey: input.launch.idempotencyKey,
    ...(descriptor.healthUrl ? { endpoint: descriptor.healthUrl } : {}),
    ...(descriptor.stateRootPath ? { stateRootPath: descriptor.stateRootPath } : {}),
    ...(input.model.contextWindowTokens !== undefined ? { contextTokens: input.model.contextWindowTokens } : {}),
    ...(input.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: input.estimatedResidentMemoryBytes } : {}),
    memoryEstimateSource: input.memoryEstimateSource,
  };
}

function invalidLocalMemorySnapshot(input: {
  registry: LocalModelResourceRegistrySnapshot;
  reason: string;
  localRuntimeReservation?: SubagentCapacityLocalRuntimeReservationSnapshot;
}): SubagentCapacityLocalMemorySnapshot {
  const decision = input.registry.policyDecision;
  return {
    outcome: "refuse",
    allowed: false,
    reason: input.reason,
    ...(decision.requestedEstimatedResidentMemoryBytes !== undefined
      ? { requestedEstimatedResidentMemoryBytes: decision.requestedEstimatedResidentMemoryBytes }
      : {}),
    activeEstimatedResidentMemoryBytes: input.registry.activeEstimatedResidentMemoryBytes,
    ...(input.registry.activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes: input.registry.activeActualResidentMemoryBytes } : {}),
    ...(decision.activeResidentMemoryBasis ? { activeResidentMemoryBasis: decision.activeResidentMemoryBasis } : {}),
    projectedEstimatedResidentMemoryBytes: decision.projectedEstimatedResidentMemoryBytes,
    ...(decision.projectedResidentMemoryBytes !== undefined ? { projectedResidentMemoryBytes: decision.projectedResidentMemoryBytes } : {}),
    ...(decision.projectedSystemMemoryUtilization !== undefined ? { projectedSystemMemoryUtilization: decision.projectedSystemMemoryUtilization } : {}),
    ...(decision.maxProjectedMemoryUtilization !== undefined ? { maxProjectedMemoryUtilization: decision.maxProjectedMemoryUtilization } : {}),
    ...(decision.projectedFreeMemoryBytes !== undefined ? { projectedFreeMemoryBytes: decision.projectedFreeMemoryBytes } : {}),
    ...(decision.projectedFreeMemoryRatio !== undefined ? { projectedFreeMemoryRatio: decision.projectedFreeMemoryRatio } : {}),
    ...(decision.minFreeMemoryRatioAfterLaunch !== undefined ? { minFreeMemoryRatioAfterLaunch: decision.minFreeMemoryRatioAfterLaunch } : {}),
    ...(decision.comfortableFreeMemoryRatio !== undefined ? { comfortableFreeMemoryRatio: decision.comfortableFreeMemoryRatio } : {}),
    ...(decision.maxResidentMemoryBytes !== undefined ? { maxResidentMemoryBytes: decision.maxResidentMemoryBytes } : {}),
    ...(decision.exceededByBytes !== undefined ? { exceededByBytes: decision.exceededByBytes } : {}),
    ...(decision.uncertaintyReasons ? { uncertaintyReasons: decision.uncertaintyReasons } : {}),
    ...(input.localRuntimeReservation ? { localRuntimeReservation: input.localRuntimeReservation } : {}),
    unloadCandidateIds: decision.unloadCandidateIds,
  };
}

function localMemorySnapshotForPolicyDecision(
  decision: LocalModelResourcePolicyDecision,
  options: { localRuntimeReservation?: SubagentCapacityLocalRuntimeReservationSnapshot } = {},
): SubagentCapacityLocalMemorySnapshot {
  const allowed = decision.outcome === "unlimited" || decision.outcome === "within-limit" || decision.outcome === "warn";
  return {
    outcome: decision.outcome,
    allowed,
    reason: decision.reason,
    ...(decision.requestedEstimatedResidentMemoryBytes !== undefined
      ? { requestedEstimatedResidentMemoryBytes: decision.requestedEstimatedResidentMemoryBytes }
      : {}),
    activeEstimatedResidentMemoryBytes: decision.activeEstimatedResidentMemoryBytes,
    ...(decision.activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes: decision.activeActualResidentMemoryBytes } : {}),
    ...(decision.activeResidentMemoryBasis ? { activeResidentMemoryBasis: decision.activeResidentMemoryBasis } : {}),
    projectedEstimatedResidentMemoryBytes: decision.projectedEstimatedResidentMemoryBytes,
    ...(decision.projectedResidentMemoryBytes !== undefined ? { projectedResidentMemoryBytes: decision.projectedResidentMemoryBytes } : {}),
    ...(decision.projectedSystemMemoryUtilization !== undefined ? { projectedSystemMemoryUtilization: decision.projectedSystemMemoryUtilization } : {}),
    ...(decision.maxProjectedMemoryUtilization !== undefined ? { maxProjectedMemoryUtilization: decision.maxProjectedMemoryUtilization } : {}),
    ...(decision.projectedFreeMemoryBytes !== undefined ? { projectedFreeMemoryBytes: decision.projectedFreeMemoryBytes } : {}),
    ...(decision.projectedFreeMemoryRatio !== undefined ? { projectedFreeMemoryRatio: decision.projectedFreeMemoryRatio } : {}),
    ...(decision.minFreeMemoryRatioAfterLaunch !== undefined ? { minFreeMemoryRatioAfterLaunch: decision.minFreeMemoryRatioAfterLaunch } : {}),
    ...(decision.comfortableFreeMemoryRatio !== undefined ? { comfortableFreeMemoryRatio: decision.comfortableFreeMemoryRatio } : {}),
    ...(decision.maxResidentMemoryBytes !== undefined ? { maxResidentMemoryBytes: decision.maxResidentMemoryBytes } : {}),
    ...(decision.exceededByBytes !== undefined ? { exceededByBytes: decision.exceededByBytes } : {}),
    ...(decision.uncertaintyReasons ? { uncertaintyReasons: decision.uncertaintyReasons } : {}),
    ...(options.localRuntimeReservation ? { localRuntimeReservation: options.localRuntimeReservation } : {}),
    unloadCandidateIds: decision.unloadCandidateIds,
  };
}

async function writeSubagentResultArtifact(input: {
  artifactRootPath: string;
  run: SubagentRunSummary;
  localArtifact: LocalTextResultArtifact;
  summary: string;
}): Promise<SubagentResultArtifact> {
  const artifactRootPath = resolve(input.artifactRootPath);
  const artifactPath = resolve(join(artifactRootPath, `${sanitizePathSegment(input.run.id)}.subagent-result.json`));
  if (!isInsidePath(artifactRootPath, artifactPath)) {
    throw new Error("Sub-agent result artifact path must stay inside the run artifact root.");
  }
  const resultArtifact: SubagentResultArtifact = {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: input.run.id,
    status: "completed",
    partial: false,
    summary: input.summary,
    childThreadId: input.run.childThreadId,
    artifactPath,
    ...(input.localArtifact.fullOutputPath ? { fullOutputPath: input.localArtifact.fullOutputPath } : {}),
  };
  resultArtifact.structuredOutput = subagentStructuredOutputForLocalText({
    role: subagentRoleProfileForRun(input.run),
    summary: input.summary,
    artifactPath,
    fullOutputPath: input.localArtifact.fullOutputPath,
  });
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(resultArtifact, null, 2)}\n`, "utf8");
  return resultArtifact;
}

function subagentTerminalArtifact(input: {
  run: SubagentRunSummary;
  status: Extract<SubagentRunStatus, "failed" | "cancelled" | "stopped" | "timed_out" | "detached" | "aborted_partial">;
  summary: string;
  artifactPath?: string;
}): SubagentResultArtifact {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: input.run.id,
    status: input.status,
    partial: input.status === "aborted_partial",
    summary: input.summary,
    childThreadId: input.run.childThreadId,
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
  };
}

function remainingLocalTextRuntimeBudgetMs(run: SubagentRunSummary, execution: Pick<LocalTextExecution, "startedAtMs">): number | undefined {
  const maxRuntimeMs = run.roleProfileSnapshot.guardPolicy.maxRuntimeMs;
  if (!Number.isFinite(maxRuntimeMs) || maxRuntimeMs < 0) return undefined;
  return Math.max(0, Math.floor(maxRuntimeMs) - Math.max(0, Date.now() - execution.startedAtMs));
}

function settleLocalTextRuntimeBudgetExceeded(
  options: CreateLocalTextSubagentRuntimeAdapterOptions,
  input: SubagentChildRuntimeWaitInput,
  execution: LocalTextExecution,
): SubagentRunSummary {
  const current = options.store.getSubagentRun(input.run.id);
  if (isRunTerminal(current)) return current;
  const partial = current.roleProfileSnapshot.guardPolicy.allowPartialResult;
  const status = partial ? "aborted_partial" : "failed";
  const maxRuntimeMs = current.roleProfileSnapshot.guardPolicy.maxRuntimeMs;
  const elapsedMs = Math.max(0, Date.now() - execution.startedAtMs);
  const transcriptPath = subagentTranscriptPath(current.childThreadId);
  const summary = partial
    ? `Local text child exceeded its ${maxRuntimeMs}ms role runtime budget before completing. Partial transcript is retained at ${transcriptPath}.`
    : `Local text child exceeded its ${maxRuntimeMs}ms role runtime budget and this role does not allow partial success. Transcript is retained at ${transcriptPath}.`;
  const resultArtifact = subagentTerminalArtifact({
    run: current,
    status,
    summary,
    artifactPath: transcriptPath,
  });
  const settled = options.store.markSubagentRunStatus(current.id, status, {
    now: nowIso(options),
    resultArtifact,
  });
  options.store.addMessage({
    threadId: settled.childThreadId,
    role: "system",
    content: `Local text sub-agent exceeded its runtime budget.\n\n${summary}`,
    metadata: {
      runtime: localTextSubagentRuntime,
      phase: localTextSubagentPhase,
      status,
      reason: "runtime_budget_exceeded",
      subagentRunId: settled.id,
      resultArtifact,
    },
  });
  input.emitEvent({
    type: partial ? "status" : "error",
    source: "child_runtime",
    status,
    message: summary,
    artifactPath: transcriptPath,
    details: {
      reason: "runtime_budget_exceeded",
      maxRuntimeMs,
      elapsedMs,
      startedAt: execution.startedAt,
      runtime: "local_text",
    },
  });
  options.store.appendSubagentMailboxEvent(settled.id, {
    direction: "child_to_parent",
    type: partial ? "subagent.result" : "subagent.failed",
    payload: {
      childRunId: settled.id,
      childThreadId: settled.childThreadId,
      status,
      partial,
      summary,
      artifactPath: transcriptPath,
      reason: "runtime_budget_exceeded",
      maxRuntimeMs,
      elapsedMs,
      runtime: "local_text",
    },
  });
  options.store.appendSubagentRunEvent(settled.id, {
    type: "subagent.runtime_budget_exceeded",
    preview: localTextRunEventPreview(settled, {
      status,
      partial,
      maxRuntimeMs,
      elapsedMs,
      startedAt: execution.startedAt,
      artifactPath: transcriptPath,
      runtime: "local_text",
    }),
  });
  execution.controller.abort(new Error("Local text sub-agent runtime budget exceeded."));
  return options.store.getSubagentRun(settled.id);
}

function isLocalTextModel(model: AmbientModelRuntimeProfile): boolean {
  return model.locality === "local" && model.toolUse === "none" && !model.supportsVision && !model.supportsAudio;
}

function isRunTerminal(run: SubagentRunSummary): boolean {
  return Boolean(run.closedAt) || terminalStatuses.has(run.status);
}

function localTextRunEventPreview(
  run: Pick<SubagentRunSummary, "id" | "childThreadId">,
  preview: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...preview,
    childRunId: run.id,
    childThreadId: run.childThreadId,
  };
}

function defaultLocalTextPrompt(input: SubagentChildRuntimeStartInput): string {
  return [
    `You are the ${input.role.label} local text sub-agent for Ambient Desktop.`,
    input.role.developerInstructions,
    "Work in text only. Do not claim to have used tools or modified files.",
    "Return a concise answer that the parent thread can synthesize.",
    "",
    "Task:",
    input.task,
  ].join("\n");
}

function localTextAssistantMessage(artifact: LocalTextResultArtifact): string {
  const lines = [artifact.textPreview];
  if (artifact.fullOutputPath) {
    lines.push("", `Full local text output: ${artifact.fullOutputPath}`);
  }
  return lines.join("\n");
}

function compactSubagentResultArtifact(artifact: SubagentResultArtifact): Record<string, unknown> {
  return {
    schemaVersion: artifact.schemaVersion,
    runId: artifact.runId,
    status: artifact.status,
    partial: artifact.partial,
    summary: previewText(artifact.summary, 1200),
    childThreadId: artifact.childThreadId,
    ...(artifact.artifactPath ? { artifactPath: artifact.artifactPath } : {}),
    ...(artifact.fullOutputPath ? { fullOutputPath: artifact.fullOutputPath } : {}),
    ...(artifact.structuredOutput ? { structuredOutput: compactStructuredOutput(artifact.structuredOutput) } : {}),
  };
}

function subagentRoleProfileForRun(run: SubagentRunSummary) {
  return getDefaultSubagentRoleProfile(run.roleId as SubagentRoleId);
}

function compactStructuredOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const output = value as Record<string, unknown>;
  return {
    schemaVersion: output.schemaVersion,
    roleId: output.roleId,
    status: output.status,
    summary: typeof output.summary === "string" ? previewText(output.summary, 500) : output.summary,
    evidenceCount: Array.isArray(output.evidence) ? output.evidence.length : undefined,
    artifactCount: Array.isArray(output.artifacts) ? output.artifacts.length : undefined,
    riskCount: Array.isArray(output.risks) ? output.risks.length : undefined,
    nextActionCount: Array.isArray(output.nextActions) ? output.nextActions.length : undefined,
  };
}

function compactLocalModelRuntimeState(state: LocalModelRuntimeState): Record<string, unknown> {
  return {
    schemaVersion: state.schemaVersion,
    runtimeId: state.runtimeId,
    providerId: state.providerId,
    modelId: state.modelId,
    ...(state.profileId ? { profileId: state.profileId } : {}),
    pid: state.pid,
    status: state.status,
    stateDir: state.stateDir,
    stdoutPath: state.stdoutPath,
    stderrPath: state.stderrPath,
    startedAt: state.startedAt,
    lastUsedAt: state.lastUsedAt,
    idleTimeoutMs: state.idleTimeoutMs,
    ...(state.healthUrl ? { healthUrl: state.healthUrl } : {}),
    ...(state.ownerThreadId ? { ownerThreadId: state.ownerThreadId } : {}),
    ...(state.parentThreadId ? { parentThreadId: state.parentThreadId } : {}),
    ...(state.subagentThreadId ? { subagentThreadId: state.subagentThreadId } : {}),
    ...(state.subagentRunId ? { subagentRunId: state.subagentRunId } : {}),
    ...(state.ownerDisplayName ? { ownerDisplayName: state.ownerDisplayName } : {}),
    ...(state.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: state.estimatedResidentMemoryBytes } : {}),
    ...(state.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: state.actualResidentMemoryBytes } : {}),
    ...(state.memorySampledAt ? { memorySampledAt: state.memorySampledAt } : {}),
  };
}

function compactLocalModelRuntimeAcquisition(acquisition: LocalModelRuntimeAcquisition): Record<string, unknown> {
  return {
    schemaVersion: acquisition.schemaVersion,
    source: acquisition.source,
    leaseId: acquisition.leaseId,
    runtimeId: acquisition.runtimeId,
    providerId: acquisition.providerId,
    modelId: acquisition.modelId,
    ...(acquisition.profileId ? { profileId: acquisition.profileId } : {}),
    pid: acquisition.pid,
    acquiredAt: acquisition.acquiredAt,
    activeLeases: acquisition.activeLeases,
    runtimeLease: compactLocalRuntimeLeaseRecord(acquisition.runtimeLease),
  };
}

function compactLocalModelRequestedLaunch(launch: LocalModelResourceRequestedLaunch): Record<string, unknown> {
  return {
    capability: launch.capability,
    id: launch.id,
    ...(launch.ownerThreadId ? { ownerThreadId: launch.ownerThreadId } : {}),
    ...(launch.modelId ? { modelId: launch.modelId } : {}),
    ...(launch.profileId ? { modelProfileId: launch.profileId } : {}),
    ...(launch.contextTokens !== undefined ? { contextTokens: launch.contextTokens } : {}),
    ...(launch.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: launch.estimatedResidentMemoryBytes } : {}),
  };
}

function compactLocalModelRuntimeAcquireInput(input: LocalModelRuntimeAcquireInput): Record<string, unknown> {
  return {
    runtimeId: input.runtimeId,
    ...(input.providerId ? { providerId: input.providerId } : {}),
    modelId: input.modelId,
    ...(input.profileId ? { modelProfileId: input.profileId } : {}),
    stateRootPath: input.stateRootPath,
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.healthUrl ? { healthUrl: input.healthUrl } : {}),
    ...(input.ownerThreadId ? { ownerThreadId: input.ownerThreadId } : {}),
    ...(input.parentThreadId ? { parentThreadId: input.parentThreadId } : {}),
    ...(input.subagentThreadId ? { subagentThreadId: input.subagentThreadId } : {}),
    ...(input.subagentRunId ? { subagentRunId: input.subagentRunId } : {}),
    ...(input.ownerDisplayName ? { ownerDisplayName: input.ownerDisplayName } : {}),
    ...(input.startupTimeoutMs !== undefined ? { startupTimeoutMs: input.startupTimeoutMs } : {}),
    ...(input.idleTimeoutMs !== undefined ? { idleTimeoutMs: input.idleTimeoutMs } : {}),
    ...(input.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: input.estimatedResidentMemoryBytes } : {}),
  };
}

function compactLocalModelRuntimeRelease(result: LocalModelRuntimeReleaseResult): Record<string, unknown> {
  return {
    schemaVersion: "ambient-local-model-runtime-release-v1",
    status: result.status,
    leaseId: result.leaseId,
    ...(result.pid !== undefined ? { pid: result.pid } : {}),
    ...(result.remainingLeases !== undefined ? { remainingLeases: result.remainingLeases } : {}),
    ...(result.releasedAt ? { releasedAt: result.releasedAt } : {}),
    ...(result.idleCleanupDueAt ? { idleCleanupDueAt: result.idleCleanupDueAt } : {}),
    ...(result.runtimeLease ? { runtimeLease: compactLocalRuntimeLeaseRecord(result.runtimeLease) } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}

function compactLocalRuntimeLeaseRecord(lease: LocalRuntimeLeaseRecord): Record<string, unknown> {
  return {
    schemaVersion: lease.schemaVersion,
    leaseId: lease.leaseId,
    ...(lease.parentThreadId ? { parentThreadId: lease.parentThreadId } : {}),
    ...(lease.subagentThreadId ? { subagentThreadId: lease.subagentThreadId } : {}),
    ...(lease.subagentRunId ? { subagentRunId: lease.subagentRunId } : {}),
    ...(lease.ownerDisplayName ? { ownerDisplayName: lease.ownerDisplayName } : {}),
    ...(lease.modelRuntimeId ? { modelRuntimeId: lease.modelRuntimeId } : {}),
    ...(lease.modelProfileId ? { modelProfileId: lease.modelProfileId } : {}),
    ...(lease.modelId ? { modelId: lease.modelId } : {}),
    ...(lease.providerId ? { providerId: lease.providerId } : {}),
    capabilityKind: lease.capabilityKind,
    ...(lease.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: lease.estimatedResidentMemoryBytes } : {}),
    ...(lease.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: lease.actualResidentMemoryBytes } : {}),
    ...(lease.pid !== undefined ? { pid: lease.pid } : {}),
    ...(lease.endpoint ? { endpoint: lease.endpoint } : {}),
    acquiredAt: lease.acquiredAt,
    lastHeartbeatAt: lease.lastHeartbeatAt,
    status: lease.status,
  };
}

function localTextDelegationFailurePreview(error: unknown): Record<string, unknown> | undefined {
  if (!isLocalTextDelegationRuntimeFailureError(error)) return undefined;
  return compactLocalTextDelegationFailure(error.evidence);
}

function compactLocalTextDelegationFailure(evidence: LocalTextDelegationRuntimeFailureEvidence): Record<string, unknown> {
  return {
    schemaVersion: evidence.schemaVersion,
    runtimeAcquisition: compactLocalModelRuntimeAcquisition(evidence.runtimeAcquisition),
    runtimeState: compactLocalModelRuntimeState(evidence.runtimeState),
    runtimeRelease: compactLocalModelRuntimeRelease(evidence.runtimeRelease),
    ...(evidence.completion ? { completion: evidence.completion } : {}),
    ...(evidence.outputValidation ? { outputValidation: evidence.outputValidation } : {}),
  };
}

function compactLocalTextResult(artifact: LocalTextResultArtifact): Record<string, unknown> {
  return {
    schemaVersion: artifact.schemaVersion,
    runId: artifact.runId,
    status: artifact.status,
    partial: artifact.partial,
    outputCharCount: artifact.outputCharCount,
    textPreview: previewText(artifact.textPreview, 1200),
    ...(artifact.fullOutputPath ? { fullOutputPath: artifact.fullOutputPath } : {}),
  };
}

function localTextRuntimeStartupFailurePreview(error: unknown): Record<string, unknown> | undefined {
  if (!isLocalModelRuntimeStartupError(error)) return undefined;
  return compactLocalModelRuntimeStartupFailure(error.failure);
}

function compactLocalModelRuntimeStartupFailure(failure: LocalModelRuntimeStartupFailure): Record<string, unknown> {
  return {
    schemaVersion: failure.schemaVersion,
    reason: failure.reason,
    message: previewText(failure.message, 1000),
    runtimeId: failure.runtimeId,
    providerId: failure.providerId,
    modelId: failure.modelId,
    ...(failure.profileId ? { profileId: failure.profileId } : {}),
    pid: failure.pid,
    startupTimeoutMs: failure.startupTimeoutMs,
    stateDir: failure.stateDir,
    stdoutPath: failure.stdoutPath,
    stderrPath: failure.stderrPath,
    health: compactLocalModelRuntimeHealth(failure.health),
  };
}

function compactLocalModelRuntimeHealth(health: LocalModelRuntimeStartupFailure["health"]): Record<string, unknown> {
  return {
    ok: health.ok,
    ...(health.healthUrl ? { healthUrl: health.healthUrl } : {}),
    ...(health.statusCode !== undefined ? { statusCode: health.statusCode } : {}),
    ...(health.latencyMs !== undefined ? { latencyMs: health.latencyMs } : {}),
    ...(health.textPreview ? { textPreview: previewText(health.textPreview, 1000) } : {}),
    ...(health.error ? { error: previewText(health.error, 1000) } : {}),
    ...(health.timedOut !== undefined ? { timedOut: health.timedOut } : {}),
  };
}

function nowIso(options: Pick<CreateLocalTextSubagentRuntimeAdapterOptions, "now">): string {
  return (options.now ?? (() => new Date()))().toISOString();
}

function previewText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "--").replace(/^[.-]+|[.-]+$/g, "") || "subagent-result";
}

function isInsidePath(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}
