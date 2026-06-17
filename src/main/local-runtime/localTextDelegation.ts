import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { AmbientModelRuntimeProfile } from "../../shared/ambientModels";
import {
  buildLocalTextResultArtifact,
  type LocalTextOutputValidation,
  type LocalTextResultArtifact,
  validateLocalTextOutput,
} from "../../shared/localTextDelegation";
import { estimateTokensFromText } from "../contextAccounting";
import type {
  LocalModelResourcePolicyDecision,
  LocalModelResourceRegistrySnapshot,
  LocalRuntimeLeaseRecord,
} from "../../shared/types";
import {
  type LocalModelRuntimeAcquireInput,
  type LocalModelRuntimeLease,
  type LocalModelRuntimeReleaseResult,
} from "./localModelRuntimeManager";
import { DEFAULT_LOCAL_RUNTIME_LEASE_HEARTBEAT_INTERVAL_MS } from "./localRuntimeInventory";
import {
  enforceLocalModelResourceLaunchPolicy,
  localModelResourcePolicySnapshotValidationReason,
  type LocalModelResourceLaunchPreflightResult,
  localTextRequestedLaunch,
  type LocalModelRequestedLaunch,
  validateLocalModelResourcePolicySnapshot,
} from "./localModelResourceRegistry";

export const LOCAL_TEXT_RUNTIME_STATE_ROOT = ".ambient/local-model-runtime";

export interface LocalTextDelegationPreflight {
  schemaVersion: "ambient-local-text-delegation-preflight-v1";
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  model: {
    profileId: string;
    providerId: string;
    modelId: string;
    locality: AmbientModelRuntimeProfile["locality"];
    toolUse: AmbientModelRuntimeProfile["toolUse"];
    selectableAsSubagent: boolean;
  };
  resourcePolicy: LocalModelResourcePolicyDecision;
  launchReadiness?: LocalTextRuntimeLaunchReadiness;
  resourcePolicyEnforcement?: LocalModelResourceLaunchPreflightResult;
  invocationLimits?: LocalTextDelegationInvocationLimits;
}

export interface LocalTextRuntimeLaunchDescriptor {
  runtimeId?: string;
  command: string;
  args?: string[];
  cwd?: string;
  healthUrl?: string;
  startupTimeoutMs?: number;
  idleTimeoutMs?: number;
  estimatedResidentMemoryBytes?: number;
}

export interface LocalTextRuntimeLaunchReadiness {
  schemaVersion: "ambient-local-text-runtime-launch-readiness-v1";
  ready: boolean;
  blockers: string[];
  warnings: string[];
  descriptor: {
    runtimeId: string;
    providerId: string;
    modelId: string;
    profileId?: string;
    command: string;
    args: string[];
    cwd: string;
    stateRootPath: string;
    healthUrl?: string;
    startupTimeoutMs?: number;
    idleTimeoutMs?: number;
    estimatedResidentMemoryBytes?: number;
  };
}

export interface LocalTextDelegationRuntimePlan {
  schemaVersion: "ambient-local-text-delegation-runtime-plan-v1";
  preflight: LocalTextDelegationPreflight;
  requestedLaunch: LocalModelRequestedLaunch;
  acquireInput: LocalModelRuntimeAcquireInput;
  resourcePolicyEnforcement?: LocalModelResourceLaunchPreflightResult;
}

export interface LocalTextDelegationRuntimeAcquireResult {
  schemaVersion: "ambient-local-text-delegation-runtime-acquire-v1";
  plan: LocalTextDelegationRuntimePlan;
  lease: LocalModelRuntimeLease;
}

export interface LocalTextRuntimeManagerLike {
  acquire: (input: LocalModelRuntimeAcquireInput) => Promise<LocalModelRuntimeLease>;
  activeRuntimeLeases?: () => LocalRuntimeLeaseRecord[];
}

export interface LocalTextDelegationResourcePolicyControls {
  approveResourceLimitExceed?: (decision: LocalModelResourcePolicyDecision) => Promise<boolean> | boolean;
  killLocalModelProcess?: (pid: number, signal?: NodeJS.Signals) => void;
}

export interface LocalTextDelegationInvocationRequest {
  prompt?: string;
  promptTokenEstimate?: number;
  requestedOutputTokens?: number;
  structuredOutputRequired?: boolean;
  requireModelNativeStructuredOutput?: boolean;
  maxInlineChars?: number;
}

export interface LocalTextDelegationInvocationLimits {
  schemaVersion: "ambient-local-text-delegation-invocation-limits-v1";
  tokenEstimateMethod: "chars_div_4";
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  promptTokenEstimate?: number;
  outputReserveTokens?: number;
  projectedContextTokens?: number;
  contextFits?: boolean;
  structuredOutputRequired: boolean;
  requireModelNativeStructuredOutput: boolean;
  structuredOutputSupport: AmbientModelRuntimeProfile["structuredOutput"];
  structuredOutputMode: "not_required" | "ambient_synthesized" | "model_native";
  maxInlineChars?: number;
}

export interface LocalTextCompletionRequest {
  runId: string;
  prompt: string;
  completionUrl: string;
  artifactRootPath: string;
  fullOutputPath?: string;
  maxInlineChars?: number;
  maxOutputTokens?: number;
  structuredOutputRequired?: boolean;
  requireModelNativeStructuredOutput?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  runtimeLeaseHeartbeatIntervalMs?: number;
}

export interface LocalTextCompletionHttpResult {
  statusCode: number;
  body: unknown;
  output: string;
  latencyMs: number;
}

export interface LocalTextDelegationCompletionResult {
  schemaVersion: "ambient-local-text-delegation-completion-v1";
  plan: LocalTextDelegationRuntimePlan;
  runtimeAcquisition: LocalModelRuntimeLease["acquisition"];
  runtimeState: LocalModelRuntimeLease["state"];
  runtimeRelease: LocalModelRuntimeReleaseResult;
  completion: {
    completionUrl: string;
    statusCode: number;
    latencyMs: number;
    outputCharCount: number;
  };
  outputValidation: LocalTextOutputValidation;
  artifact: LocalTextResultArtifact;
}

export interface LocalTextDelegationRuntimeFailureEvidence {
  schemaVersion: "ambient-local-text-delegation-failure-v1";
  plan: LocalTextDelegationRuntimePlan;
  runtimeAcquisition: LocalModelRuntimeLease["acquisition"];
  runtimeState: LocalModelRuntimeLease["state"];
  runtimeRelease: LocalModelRuntimeReleaseResult;
  completion?: LocalTextDelegationCompletionResult["completion"];
  outputValidation?: LocalTextOutputValidation;
}

export type LocalTextDelegationRuntimeAcquiredCallback = (
  result: LocalTextDelegationRuntimeAcquireResult,
) => Promise<void> | void;

export class LocalTextDelegationRuntimeFailureError extends Error {
  readonly evidence: LocalTextDelegationRuntimeFailureEvidence;
  readonly originalError: unknown;

  constructor(message: string, evidence: LocalTextDelegationRuntimeFailureEvidence, originalError: unknown) {
    super(message);
    this.name = "LocalTextDelegationRuntimeFailureError";
    this.evidence = evidence;
    this.originalError = originalError;
  }
}

export function isLocalTextDelegationRuntimeFailureError(error: unknown): error is LocalTextDelegationRuntimeFailureError {
  return error instanceof LocalTextDelegationRuntimeFailureError ||
    Boolean(error && typeof error === "object" &&
      (error as { name?: unknown }).name === "LocalTextDelegationRuntimeFailureError" &&
      (error as { evidence?: { schemaVersion?: unknown } }).evidence?.schemaVersion === "ambient-local-text-delegation-failure-v1");
}

export function preflightLocalTextDelegation(input: {
  model: AmbientModelRuntimeProfile;
  resourceRegistry: LocalModelResourceRegistrySnapshot;
  resourcePolicyEnforcement?: LocalModelResourceLaunchPreflightResult;
  invocation?: LocalTextDelegationInvocationRequest;
  launchReadiness?: LocalTextRuntimeLaunchReadiness;
  requireSubagentEligible?: boolean;
}): LocalTextDelegationPreflight {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const requireSubagentEligible = input.requireSubagentEligible ?? true;
  blockers.push(...localTextModelBlockers(input.model, requireSubagentEligible));
  const resourceDecision = input.resourceRegistry.policyDecision;
  const resourcePolicyValidation = validateLocalModelResourcePolicySnapshot(input.resourceRegistry);
  if (!resourcePolicyValidation.valid && !input.resourcePolicyEnforcement) {
    blockers.push(localModelResourcePolicySnapshotValidationReason(resourcePolicyValidation));
  }
  const resourceFindings = localTextResourcePolicyFindings(resourceDecision, input.resourcePolicyEnforcement);
  blockers.push(...resourceFindings.blockers);
  warnings.push(...resourceFindings.warnings);
  if (input.launchReadiness) {
    blockers.push(...input.launchReadiness.blockers);
    warnings.push(...input.launchReadiness.warnings);
  }
  const invocationFindings = localTextInvocationLimitFindings(input.model, input.invocation);
  blockers.push(...invocationFindings.blockers);
  warnings.push(...invocationFindings.warnings);
  return {
    schemaVersion: "ambient-local-text-delegation-preflight-v1",
    allowed: blockers.length === 0,
    blockers,
    warnings,
    model: {
      profileId: input.model.profileId,
      providerId: input.model.providerId,
      modelId: input.model.modelId,
      locality: input.model.locality,
      toolUse: input.model.toolUse,
      selectableAsSubagent: input.model.selectableAsSubagent,
    },
    resourcePolicy: resourceDecision,
    ...(input.launchReadiness ? { launchReadiness: input.launchReadiness } : {}),
    ...(input.resourcePolicyEnforcement ? { resourcePolicyEnforcement: input.resourcePolicyEnforcement } : {}),
    ...(invocationFindings.limits ? { invocationLimits: invocationFindings.limits } : {}),
  };
}

export function planLocalTextDelegationRuntime(input: {
  workspacePath: string;
  model: AmbientModelRuntimeProfile;
  resourceRegistry: LocalModelResourceRegistrySnapshot;
  launch: LocalTextRuntimeLaunchDescriptor;
  ownerThreadId?: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  ownerDisplayName?: string;
  stateRootPath?: string;
  resourcePolicyEnforcement?: LocalModelResourceLaunchPreflightResult;
  invocation?: LocalTextDelegationInvocationRequest;
  requireSubagentEligible?: boolean;
}): LocalTextDelegationRuntimePlan {
  const stateRootPath = resolve(input.stateRootPath ?? resolve(input.workspacePath, LOCAL_TEXT_RUNTIME_STATE_ROOT));
  const launchReadiness = validateLocalTextRuntimeLaunchDescriptor({
    workspacePath: input.workspacePath,
    stateRootPath,
    model: input.model,
    launch: input.launch,
  });
  const preflight = preflightLocalTextDelegation({
    model: input.model,
    resourceRegistry: input.resourceRegistry,
    resourcePolicyEnforcement: input.resourcePolicyEnforcement,
    invocation: input.invocation,
    launchReadiness,
    requireSubagentEligible: input.requireSubagentEligible,
  });
  const runtimeId = normalizeRuntimeId(input.launch.runtimeId, input.model);
  const requestedLaunch = localTextRequestedLaunch({
    ownerThreadId: input.ownerThreadId,
    modelId: input.model.modelId,
    profileId: input.model.profileId,
    contextTokens: input.model.contextWindowTokens,
    estimatedResidentMemoryBytes: input.launch.estimatedResidentMemoryBytes,
  });
  return {
    schemaVersion: "ambient-local-text-delegation-runtime-plan-v1",
    preflight,
    requestedLaunch,
    acquireInput: {
      runtimeId,
      providerId: input.model.providerId,
      modelId: input.model.modelId,
      profileId: input.model.profileId,
      stateRootPath,
      command: launchReadiness.descriptor.command,
      args: launchReadiness.descriptor.args,
      cwd: launchReadiness.descriptor.cwd,
      ...(launchReadiness.descriptor.healthUrl ? { healthUrl: launchReadiness.descriptor.healthUrl } : {}),
      ...(input.ownerThreadId ? { ownerThreadId: input.ownerThreadId } : {}),
      ...(input.parentThreadId ? { parentThreadId: input.parentThreadId } : {}),
      ...(input.subagentThreadId ? { subagentThreadId: input.subagentThreadId } : {}),
      ...(input.subagentRunId ? { subagentRunId: input.subagentRunId } : {}),
      ...(input.ownerDisplayName ? { ownerDisplayName: input.ownerDisplayName } : {}),
      ...(launchReadiness.descriptor.startupTimeoutMs !== undefined ? { startupTimeoutMs: launchReadiness.descriptor.startupTimeoutMs } : {}),
      ...(launchReadiness.descriptor.idleTimeoutMs !== undefined ? { idleTimeoutMs: launchReadiness.descriptor.idleTimeoutMs } : {}),
      ...(launchReadiness.descriptor.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: launchReadiness.descriptor.estimatedResidentMemoryBytes } : {}),
    },
    ...(input.resourcePolicyEnforcement ? { resourcePolicyEnforcement: input.resourcePolicyEnforcement } : {}),
  };
}

export async function prepareLocalTextDelegationRuntimePlan(input: {
  workspacePath: string;
  model: AmbientModelRuntimeProfile;
  resourceRegistry: LocalModelResourceRegistrySnapshot;
  launch: LocalTextRuntimeLaunchDescriptor;
  ownerThreadId?: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  ownerDisplayName?: string;
  stateRootPath?: string;
  invocation?: LocalTextDelegationInvocationRequest;
  requireSubagentEligible?: boolean;
} & LocalTextDelegationResourcePolicyControls): Promise<LocalTextDelegationRuntimePlan> {
  const requireSubagentEligible = input.requireSubagentEligible ?? true;
  const modelBlockers = localTextModelBlockers(input.model, requireSubagentEligible);
  if (modelBlockers.length > 0) {
    return planLocalTextDelegationRuntime(input);
  }
  const resourcePolicyEnforcement = await enforceLocalModelResourceLaunchPolicy({
    registry: input.resourceRegistry,
    approveExceed: input.approveResourceLimitExceed,
    killProcess: input.killLocalModelProcess,
  });
  return planLocalTextDelegationRuntime({
    ...input,
    resourcePolicyEnforcement,
  });
}

export async function acquirePreparedLocalTextDelegationRuntime(input: {
  runtimeManager: LocalTextRuntimeManagerLike;
  plan: LocalTextDelegationRuntimePlan;
}): Promise<LocalTextDelegationRuntimeAcquireResult> {
  if (!input.plan.preflight.allowed) {
    throw new Error(`Local text delegation runtime preflight failed: ${input.plan.preflight.blockers.join(" ")}`);
  }
  return {
    schemaVersion: "ambient-local-text-delegation-runtime-acquire-v1",
    plan: input.plan,
    lease: await input.runtimeManager.acquire(input.plan.acquireInput),
  };
}

export async function acquireLocalTextDelegationRuntime(input: {
  runtimeManager: LocalTextRuntimeManagerLike;
  workspacePath: string;
  model: AmbientModelRuntimeProfile;
  resourceRegistry: LocalModelResourceRegistrySnapshot;
  launch: LocalTextRuntimeLaunchDescriptor;
  ownerThreadId?: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  ownerDisplayName?: string;
  stateRootPath?: string;
  invocation?: LocalTextDelegationInvocationRequest;
  requireSubagentEligible?: boolean;
} & LocalTextDelegationResourcePolicyControls): Promise<LocalTextDelegationRuntimeAcquireResult> {
  return acquirePreparedLocalTextDelegationRuntime({
    runtimeManager: input.runtimeManager,
    plan: await prepareLocalTextDelegationRuntimePlan(input),
  });
}

export async function completeLocalTextDelegation(input: {
  runtimeManager: LocalTextRuntimeManagerLike;
  workspacePath: string;
  model: AmbientModelRuntimeProfile;
  resourceRegistry: LocalModelResourceRegistrySnapshot;
  launch: LocalTextRuntimeLaunchDescriptor;
  completion: LocalTextCompletionRequest;
  ownerThreadId?: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  ownerDisplayName?: string;
  stateRootPath?: string;
  requireSubagentEligible?: boolean;
  preparedPlan?: LocalTextDelegationRuntimePlan;
  onRuntimeAcquired?: LocalTextDelegationRuntimeAcquiredCallback;
  fetchImpl?: typeof fetch;
} & LocalTextDelegationResourcePolicyControls): Promise<LocalTextDelegationCompletionResult> {
  const completionInvocation = localTextInvocationRequestFromCompletion(input.model, input.completion);
  const acquired = input.preparedPlan
    ? await acquirePreparedLocalTextDelegationRuntime({
      runtimeManager: input.runtimeManager,
      plan: ensurePreparedLocalTextPlanCoversInvocation({
        plan: input.preparedPlan,
        model: input.model,
        resourceRegistry: input.resourceRegistry,
        invocation: completionInvocation,
        requireSubagentEligible: input.requireSubagentEligible,
      }),
    })
    : await acquireLocalTextDelegationRuntime({
      ...input,
      invocation: completionInvocation,
    });
  let result: Omit<LocalTextDelegationCompletionResult, "runtimeRelease"> | undefined;
  let completionSummary: LocalTextDelegationCompletionResult["completion"] | undefined;
  let outputValidation: LocalTextOutputValidation | undefined;
  let completionFailed = false;
  let completionError: unknown;
  try {
    await input.onRuntimeAcquired?.(acquired);
    const completion = await runWithLocalRuntimeLeaseHeartbeat(acquired.lease, () =>
      requestLocalTextCompletion({
        completionUrl: input.completion.completionUrl,
        modelId: input.model.modelId,
        prompt: input.completion.prompt,
        maxOutputTokens: acquired.plan.preflight.invocationLimits?.outputReserveTokens,
        timeoutMs: input.completion.timeoutMs,
        signal: input.completion.signal,
        fetchImpl: input.fetchImpl,
      }), {
      intervalMs: input.completion.runtimeLeaseHeartbeatIntervalMs,
    });
    completionSummary = {
      completionUrl: input.completion.completionUrl,
      statusCode: completion.statusCode,
      latencyMs: completion.latencyMs,
      outputCharCount: completion.output.length,
    };
    const validation = validateLocalTextOutput(completion.output, {
      maxInlineChars: input.completion.maxInlineChars,
    });
    outputValidation = validation;
    if (!validation.valid) throw new Error(validation.reason);
    const fullOutputPath = validation.requiresFullOutputArtifact
      ? await writeLocalTextFullOutput({
        output: completion.output,
        artifactRootPath: input.completion.artifactRootPath,
        fullOutputPath: input.completion.fullOutputPath,
        runId: input.completion.runId,
      })
      : undefined;
    result = {
      schemaVersion: "ambient-local-text-delegation-completion-v1",
      plan: acquired.plan,
      runtimeAcquisition: acquired.lease.acquisition,
      runtimeState: acquired.lease.state,
      completion: completionSummary,
      outputValidation: validation,
      artifact: buildLocalTextResultArtifact({
        runId: input.completion.runId,
        modelId: input.model.modelId,
        providerId: input.model.providerId,
        status: "completed",
        output: completion.output,
        fullOutputPath,
        maxInlineChars: input.completion.maxInlineChars,
      }),
    };
  } catch (error) {
    completionFailed = true;
    completionError = error;
  }
  const runtimeRelease = await releaseLocalTextRuntimeLease(acquired.lease);
  if (completionFailed) {
    throw new LocalTextDelegationRuntimeFailureError(localTextDelegationFailureMessage(completionError), {
      schemaVersion: "ambient-local-text-delegation-failure-v1",
      plan: acquired.plan,
      runtimeAcquisition: acquired.lease.acquisition,
      runtimeState: acquired.lease.state,
      runtimeRelease,
      ...(completionSummary ? { completion: completionSummary } : {}),
      ...(outputValidation ? { outputValidation } : {}),
    }, completionError);
  }
  if (!result) throw new Error("Local text delegation completed without a result.");
  return {
    ...result,
    runtimeRelease,
  };
}

function localTextDelegationFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function releaseLocalTextRuntimeLease(lease: LocalModelRuntimeLease): Promise<LocalModelRuntimeReleaseResult> {
  try {
    return await lease.release();
  } catch (error) {
    return {
      status: "failed",
      leaseId: lease.leaseId,
      pid: lease.state.pid,
      error: localTextDelegationFailureMessage(error),
    };
  }
}

async function runWithLocalRuntimeLeaseHeartbeat<T>(
  lease: LocalModelRuntimeLease,
  task: () => Promise<T>,
  options: { intervalMs?: number } = {},
): Promise<T> {
  const intervalMs = normalizeRuntimeLeaseHeartbeatIntervalMs(options.intervalMs);
  let stopped = false;
  let touching = false;
  const heartbeat = async () => {
    if (stopped || touching) return;
    touching = true;
    try {
      await lease.touch();
    } catch {
      // Lease heartbeats keep lifecycle policy fresh; completion/release owns failure reporting.
    } finally {
      touching = false;
    }
  };
  const timer = setInterval(() => void heartbeat(), intervalMs);
  if (typeof timer === "object" && "unref" in timer && typeof timer.unref === "function") timer.unref();
  try {
    return await task();
  } finally {
    stopped = true;
    clearInterval(timer);
  }
}

function normalizeRuntimeLeaseHeartbeatIntervalMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_LOCAL_RUNTIME_LEASE_HEARTBEAT_INTERVAL_MS;
  }
  return Math.max(1, Math.floor(value));
}

function localTextModelBlockers(model: AmbientModelRuntimeProfile, requireSubagentEligible: boolean): string[] {
  const blockers: string[] = [];
  if (model.locality !== "local") {
    blockers.push(`Model ${model.modelId} is ${model.locality}; local text delegation requires a local model profile.`);
  }
  if (!model.available) {
    blockers.push(model.unavailableReason ?? `Model ${model.modelId} is not available.`);
  }
  if (requireSubagentEligible && !model.selectableAsSubagent) {
    blockers.push(`Model ${model.modelId} is not selectable for sub-agent delegation.`);
  }
  if (!model.supportsStreaming) {
    blockers.push(`Model ${model.modelId} does not support streaming local text output.`);
  }
  if (model.toolUse !== "none") {
    blockers.push(`Model ${model.modelId} advertises tool use; Phase 3 local text delegation is text-only.`);
  }
  return blockers;
}

function localTextInvocationRequestFromCompletion(
  model: AmbientModelRuntimeProfile,
  completion: Pick<LocalTextCompletionRequest, "prompt" | "maxInlineChars" | "maxOutputTokens" | "structuredOutputRequired" | "requireModelNativeStructuredOutput">,
): LocalTextDelegationInvocationRequest {
  return {
    prompt: completion.prompt,
    requestedOutputTokens: completion.maxOutputTokens ?? model.maxOutputTokens,
    structuredOutputRequired: completion.structuredOutputRequired === true,
    requireModelNativeStructuredOutput: completion.requireModelNativeStructuredOutput === true,
    ...(completion.maxInlineChars !== undefined ? { maxInlineChars: completion.maxInlineChars } : {}),
  };
}

function ensurePreparedLocalTextPlanCoversInvocation(input: {
  plan: LocalTextDelegationRuntimePlan;
  model: AmbientModelRuntimeProfile;
  resourceRegistry: LocalModelResourceRegistrySnapshot;
  invocation: LocalTextDelegationInvocationRequest;
  requireSubagentEligible?: boolean;
}): LocalTextDelegationRuntimePlan {
  const preflight = preflightLocalTextDelegation({
    model: input.model,
    resourceRegistry: input.resourceRegistry,
    resourcePolicyEnforcement: input.plan.resourcePolicyEnforcement,
    invocation: input.invocation,
    launchReadiness: input.plan.preflight.launchReadiness,
    requireSubagentEligible: input.requireSubagentEligible,
  });
  return {
    ...input.plan,
    preflight,
  };
}

export function validateLocalTextRuntimeLaunchDescriptor(input: {
  workspacePath: string;
  stateRootPath?: string;
  model: AmbientModelRuntimeProfile;
  launch: LocalTextRuntimeLaunchDescriptor;
}): LocalTextRuntimeLaunchReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const runtimeId = normalizeRuntimeId(input.launch.runtimeId, input.model);
  const command = cleanString(input.launch.command);
  const args = normalizedLaunchArgs(input.launch.args, blockers);
  const cwd = resolve(cleanString(input.launch.cwd) || input.workspacePath);
  const stateRootPath = resolve(input.stateRootPath ?? resolve(input.workspacePath, LOCAL_TEXT_RUNTIME_STATE_ROOT));
  const healthUrl = cleanString(input.launch.healthUrl);
  const startupTimeoutMs = input.launch.startupTimeoutMs;
  const idleTimeoutMs = input.launch.idleTimeoutMs;
  const estimatedResidentMemoryBytes = input.launch.estimatedResidentMemoryBytes;

  if (!command) {
    blockers.push("Local text runtime launch descriptor requires a non-empty command before scheduler launch.");
  }
  if (containsNul(command)) {
    blockers.push("Local text runtime launch command must not contain NUL characters.");
  }
  if (!cleanString(input.workspacePath)) {
    blockers.push("Local text runtime launch descriptor requires a workspace path before scheduler launch.");
  }
  if (healthUrl && !isHttpUrl(healthUrl)) {
    blockers.push("Local text runtime healthUrl must be an absolute http(s) URL.");
  }
  if (startupTimeoutMs !== undefined && !isNonNegativeFiniteInteger(startupTimeoutMs)) {
    blockers.push("Local text runtime startupTimeoutMs must be a non-negative finite integer.");
  }
  if (healthUrl && startupTimeoutMs === 0) {
    blockers.push("Local text runtime startupTimeoutMs must be positive when healthUrl is configured.");
  }
  if (idleTimeoutMs !== undefined && !isNonNegativeFiniteInteger(idleTimeoutMs)) {
    blockers.push("Local text runtime idleTimeoutMs must be a non-negative finite integer.");
  }
  if (estimatedResidentMemoryBytes !== undefined && !isNonNegativeFiniteInteger(estimatedResidentMemoryBytes)) {
    blockers.push("Local text runtime estimatedResidentMemoryBytes must be a non-negative finite integer.");
  }
  if (!healthUrl) {
    warnings.push("Local text runtime launch descriptor has no healthUrl; scheduler readiness will rely on process liveness only.");
  }

  return {
    schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
    ready: blockers.length === 0,
    blockers,
    warnings,
    descriptor: {
      runtimeId,
      providerId: input.model.providerId,
      modelId: input.model.modelId,
      ...(input.model.profileId ? { profileId: input.model.profileId } : {}),
      command,
      args,
      cwd,
      stateRootPath,
      ...(healthUrl ? { healthUrl } : {}),
      ...(startupTimeoutMs !== undefined ? { startupTimeoutMs } : {}),
      ...(idleTimeoutMs !== undefined ? { idleTimeoutMs } : {}),
      ...(estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes } : {}),
    },
  };
}

function localTextInvocationLimitFindings(
  model: AmbientModelRuntimeProfile,
  invocation?: LocalTextDelegationInvocationRequest,
): { blockers: string[]; warnings: string[]; limits?: LocalTextDelegationInvocationLimits } {
  if (!invocation) return { blockers: [], warnings: [] };
  const blockers: string[] = [];
  const warnings: string[] = [];
  const structuredOutputRequired = invocation.structuredOutputRequired === true;
  const requireModelNativeStructuredOutput = invocation.requireModelNativeStructuredOutput === true;
  const promptTokenEstimate = invocation.promptTokenEstimate ?? (invocation.prompt !== undefined ? estimateTokensFromText(invocation.prompt) : undefined);
  const requestedOutputTokens = invocation.requestedOutputTokens ?? model.maxOutputTokens;
  const outputReserveTokens = normalizePositiveInteger(requestedOutputTokens);
  const contextWindowTokens = normalizePositiveInteger(model.contextWindowTokens);
  const maxOutputTokens = normalizePositiveInteger(model.maxOutputTokens);
  const projectedContextTokens = promptTokenEstimate !== undefined && outputReserveTokens !== undefined
    ? promptTokenEstimate + outputReserveTokens
    : undefined;
  const contextFits = projectedContextTokens !== undefined && contextWindowTokens !== undefined
    ? projectedContextTokens <= contextWindowTokens
    : undefined;

  if (contextWindowTokens === undefined) {
    blockers.push(`Model ${model.modelId} does not declare a context window for local text delegation.`);
  }
  if (maxOutputTokens === undefined) {
    blockers.push(`Model ${model.modelId} does not declare a max output token limit for local text delegation.`);
  }
  if (requestedOutputTokens !== undefined && outputReserveTokens === undefined) {
    blockers.push(`Requested local text output token limit must be a positive integer.`);
  }
  if (outputReserveTokens !== undefined && maxOutputTokens !== undefined && outputReserveTokens > maxOutputTokens) {
    blockers.push(`Requested local text output reserve ${outputReserveTokens.toLocaleString()} tokens exceeds model ${model.modelId} max output ${maxOutputTokens.toLocaleString()} tokens.`);
  }
  if (contextFits === false && projectedContextTokens !== undefined && contextWindowTokens !== undefined) {
    blockers.push(`Local text prompt is estimated at ${promptTokenEstimate?.toLocaleString() ?? "unknown"} tokens plus ${outputReserveTokens?.toLocaleString() ?? "unknown"} output tokens, exceeding model ${model.modelId} context window ${contextWindowTokens.toLocaleString()} tokens.`);
  } else if (projectedContextTokens !== undefined && contextWindowTokens !== undefined && projectedContextTokens / contextWindowTokens >= 0.9) {
    warnings.push(`Local text prompt is projected to use ${Math.round((projectedContextTokens / contextWindowTokens) * 100)}% of model ${model.modelId} context window.`);
  }
  if (requireModelNativeStructuredOutput && model.structuredOutput === "none") {
    blockers.push(`Model ${model.modelId} does not support model-native structured output required for this local text invocation.`);
  }

  return {
    blockers,
    warnings,
    limits: {
      schemaVersion: "ambient-local-text-delegation-invocation-limits-v1",
      tokenEstimateMethod: "chars_div_4",
      ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      ...(promptTokenEstimate !== undefined ? { promptTokenEstimate } : {}),
      ...(outputReserveTokens !== undefined ? { outputReserveTokens } : {}),
      ...(projectedContextTokens !== undefined ? { projectedContextTokens } : {}),
      ...(contextFits !== undefined ? { contextFits } : {}),
      structuredOutputRequired,
      requireModelNativeStructuredOutput,
      structuredOutputSupport: model.structuredOutput,
      structuredOutputMode: localTextStructuredOutputMode({
        structuredOutputRequired,
        requireModelNativeStructuredOutput,
        model,
      }),
      ...(invocation.maxInlineChars !== undefined ? { maxInlineChars: invocation.maxInlineChars } : {}),
    },
  };
}

function localTextStructuredOutputMode(input: {
  structuredOutputRequired: boolean;
  requireModelNativeStructuredOutput: boolean;
  model: AmbientModelRuntimeProfile;
}): LocalTextDelegationInvocationLimits["structuredOutputMode"] {
  if (!input.structuredOutputRequired) return "not_required";
  if (input.requireModelNativeStructuredOutput && input.model.structuredOutput !== "none") return "model_native";
  return "ambient_synthesized";
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function localTextResourcePolicyFindings(
  decision: LocalModelResourcePolicyDecision,
  enforcement?: LocalModelResourceLaunchPreflightResult,
): { blockers: string[]; warnings: string[] } {
  if (enforcement) {
    if (!enforcement.allowed) return { blockers: [enforcement.reason], warnings: [] };
    switch (enforcement.outcome) {
      case "warn":
      case "ask-to-exceed":
      case "unloaded-idle":
        return { blockers: [], warnings: [enforcement.reason] };
      case "unlimited":
      case "within-limit":
        return { blockers: [], warnings: [] };
      case "refuse":
      case "unload-idle":
        return { blockers: [enforcement.reason], warnings: [] };
    }
  }
  switch (decision.outcome) {
    case "refuse":
    case "ask-to-exceed":
    case "unload-idle":
      return { blockers: [decision.reason], warnings: [] };
    case "warn":
      return { blockers: [], warnings: [decision.reason] };
    case "unlimited":
    case "within-limit":
      return { blockers: [], warnings: [] };
  }
}

export async function requestLocalTextCompletion(input: {
  completionUrl: string;
  modelId: string;
  prompt: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<LocalTextCompletionHttpResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) {
    abortFromExternal();
  } else {
    input.signal?.addEventListener("abort", abortFromExternal, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 120_000);
  const started = Date.now();
  try {
    const response = await fetchImpl(input.completionUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.modelId,
        messages: [{ role: "user", content: input.prompt }],
        stream: false,
        ...(input.maxOutputTokens !== undefined ? { max_tokens: input.maxOutputTokens } : {}),
      }),
    });
    const text = await response.text();
    const body = parseJsonLenient(text) ?? text;
    if (!response.ok) {
      throw new Error(`Local text completion failed with HTTP ${response.status}: ${previewText(text, 1000)}`);
    }
    const output = extractLocalTextCompletionOutput(body);
    if (typeof output !== "string") {
      throw new Error("Local text completion response did not contain text output.");
    }
    return {
      statusCode: response.status,
      body,
      output,
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abortFromExternal);
  }
}

export function extractLocalTextCompletionOutput(body: unknown): string | undefined {
  if (typeof body === "string") return body;
  const record = recordValue(body);
  if (!record) return undefined;
  for (const key of ["output_text", "text", "content"]) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  for (const choice of choices) {
    const choiceRecord = recordValue(choice);
    const message = recordValue(choiceRecord?.message);
    if (typeof message?.content === "string") return message.content;
    if (typeof choiceRecord?.text === "string") return choiceRecord.text;
  }
  const output = Array.isArray(record.output) ? record.output : [];
  const outputText = output
    .flatMap((entry) => {
      const entryRecord = recordValue(entry);
      const content = Array.isArray(entryRecord?.content) ? entryRecord.content : [];
      return content.map((contentEntry) => recordValue(contentEntry)?.text).filter((value): value is string => typeof value === "string");
    })
    .join("");
  return outputText || undefined;
}

function normalizeRuntimeId(runtimeId: string | undefined, model: AmbientModelRuntimeProfile): string {
  const explicit = runtimeId?.trim();
  if (explicit) return explicit;
  return model.profileId || model.modelId;
}

function normalizedLaunchArgs(args: string[] | undefined, blockers: string[]): string[] {
  if (!args) return [];
  if (!Array.isArray(args)) {
    blockers.push("Local text runtime launch args must be an array of strings.");
    return [];
  }
  return args.map((arg, index) => {
    if (typeof arg !== "string") {
      blockers.push(`Local text runtime launch arg ${index} must be a string.`);
      return "";
    }
    if (containsNul(arg)) {
      blockers.push(`Local text runtime launch arg ${index} must not contain NUL characters.`);
    }
    return arg;
  });
}

function cleanString(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function containsNul(value: string): boolean {
  return value.includes("\0");
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isNonNegativeFiniteInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

async function writeLocalTextFullOutput(input: {
  output: string;
  artifactRootPath: string;
  fullOutputPath?: string;
  runId: string;
}): Promise<string> {
  const artifactRootPath = resolve(input.artifactRootPath);
  const fullOutputPath = resolve(input.fullOutputPath ?? join(artifactRootPath, `${sanitizePathSegment(input.runId)}.local-text.txt`));
  if (!isInsidePath(artifactRootPath, fullOutputPath)) {
    throw new Error("Local text full output path must stay inside the run artifact root.");
  }
  await mkdir(dirname(fullOutputPath), { recursive: true });
  await writeFile(fullOutputPath, input.output, "utf8");
  return fullOutputPath;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function parseJsonLenient(text: string): unknown {
  try {
    return text.trim() ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function previewText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "--").replace(/^[.-]+|[.-]+$/g, "") || "local-text-run";
}

function isInsidePath(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}
