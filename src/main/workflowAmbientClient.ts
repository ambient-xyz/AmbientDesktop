import type { WorkflowPromptCacheCheckpoint } from "../shared/types";
import {
  DEFAULT_AMBIENT_RETRY_ATTEMPTS,
  ambientRetryPolicyFromLegacyOptions,
  isRetryableAmbientProviderError,
  retryDelayForAttempt,
  type AmbientRetryPolicy,
} from "./aggressiveRetries";
import { workflowPromptParts, type WorkflowPromptParts } from "./workflowPromptCache";
import type { WorkflowEventSink } from "./workflowAgentRuntime";
import type { WorkflowPiProgress } from "./workflowPiTransport";

export interface WorkflowAmbientSchema<T> {
  parse(value: unknown): T;
}

export interface WorkflowAmbientCallSpec<T> {
  task: string;
  input: unknown;
  schema: WorkflowAmbientSchema<T>;
  cacheKey?: string | unknown[];
  nodeId?: string;
  edgeId?: string;
  itemKey?: string;
  retry?: {
    maxAttempts?: number;
    onInvalid?: "fail" | "retry";
  };
}

export interface WorkflowAmbientProvider {
  call(input: {
    task: string;
    input: unknown;
    attempt: number;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    abortSignal?: AbortSignal;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> | unknown;
}

export interface WorkflowAmbientCache {
  get<T = unknown>(key: string): Promise<T | undefined> | T | undefined;
  set(key: string, value: unknown): Promise<void> | void;
}

export interface WorkflowAmbientClientOptions {
  provider: WorkflowAmbientProvider;
  eventSink?: WorkflowEventSink;
  cache?: WorkflowAmbientCache;
  abortSignal?: AbortSignal;
  retryPolicy?: AmbientRetryPolicy;
  transientProviderMaxAttempts?: number;
  transientRetryBaseDelayMs?: number;
  waitForRetry?: (delayMs: number, abortSignal: AbortSignal | undefined) => Promise<void>;
  cacheMetadata?: {
    workflowThreadId?: string;
    graphSnapshotId?: string;
    revisionId?: string;
    createdAt?: string;
  };
  onProgress?: (event: {
    spec: WorkflowAmbientCallSpec<unknown>;
    attempt: number;
    cacheCheckpoint: WorkflowPromptCacheCheckpoint;
    progress: WorkflowPiProgress;
  }) => void;
}

export interface WorkflowAmbientClient {
  call<T>(spec: WorkflowAmbientCallSpec<T>): Promise<T>;
}

export class MemoryWorkflowAmbientCache implements WorkflowAmbientCache {
  private readonly values = new Map<string, unknown>();

  get<T = unknown>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }
}

export function createWorkflowAmbientClient(options: WorkflowAmbientClientOptions): WorkflowAmbientClient {
  return {
    call: <T>(spec: WorkflowAmbientCallSpec<T>): Promise<T> => callAmbient(options, spec),
  };
}

async function callAmbient<T>(options: WorkflowAmbientClientOptions, spec: WorkflowAmbientCallSpec<T>): Promise<T> {
  const cacheKey = normalizedCacheKey(spec.cacheKey);
  if (cacheKey && options.cache) {
    const cached = await options.cache.get(cacheKey);
    if (cached !== undefined) {
      const parsed = spec.schema.parse(cached);
      const cacheCheckpoint = workflowAmbientCallCacheCheckpoint(spec, 1, options.cacheMetadata);
      await options.eventSink?.append({
        type: "ambient.call.cache_hit",
        message: spec.task,
        ...ambientTraceMetadata(spec, { cacheCheckpoint }),
      });
      return parsed;
    }
  }

  const maxInvalidAttempts = Math.max(1, spec.retry?.maxAttempts ?? DEFAULT_AMBIENT_RETRY_ATTEMPTS);
  const retryPolicy =
    options.retryPolicy ??
    ambientRetryPolicyFromLegacyOptions({
      maxAttempts: options.transientProviderMaxAttempts,
      baseDelayMs: options.transientRetryBaseDelayMs,
    });
  const transientProviderMaxAttempts = retryPolicy.maxRetries + 1;
  const maxProviderRequests =
    transientProviderMaxAttempts + (spec.retry?.onInvalid === "retry" ? Math.max(0, maxInvalidAttempts - 1) : 0);
  let lastError: unknown;
  let finalErrorAlreadyRecorded = false;
  let transientFailureCount = 0;
  let invalidAttemptCount = 0;
  let lastFailureKind: "provider" | "validation" | undefined;

  for (let attempt = 1; attempt <= maxProviderRequests; attempt += 1) {
    const cacheCheckpoint = workflowAmbientCallCacheCheckpoint(spec, attempt, options.cacheMetadata);
    await options.eventSink?.append({ type: "ambient.call.start", message: spec.task, ...ambientTraceMetadata(spec, { attempt, cacheCheckpoint }) });
    if (options.abortSignal?.aborted) throw new Error("Workflow run canceled.");
    let raw: unknown;
    try {
      raw = await options.provider.call({
        task: spec.task,
        input: workflowAmbientCallInputForAttempt(spec.input, attempt, lastError),
        attempt,
        cacheCheckpoint,
        abortSignal: options.abortSignal,
        onProgress: (progress) => options.onProgress?.({ spec: spec as WorkflowAmbientCallSpec<unknown>, attempt, cacheCheckpoint, progress }),
      });
    } catch (error) {
      lastError = error;
      lastFailureKind = "provider";
      const retryable = isRetryableAmbientProviderError(error);
      if (retryable) transientFailureCount += 1;
      const willRetry = retryable && retryPolicy.enabled && transientFailureCount <= retryPolicy.maxRetries && attempt < maxProviderRequests;
      const retryDelayMs = willRetry ? retryDelayForAttempt(retryPolicy, transientFailureCount) : 0;
      await options.eventSink?.append({
        type: "ambient.call.error",
        message: spec.task,
        ...ambientTraceMetadata(spec, {
          attempt,
          cacheCheckpoint,
          failureKind: "provider",
          error: ambientErrorMessage(error),
          retryable,
          willRetry,
          retryDelayMs,
          transientFailureCount,
          transientProviderMaxAttempts,
          transientProviderMaxRetries: retryPolicy.maxRetries,
        }),
      });
      finalErrorAlreadyRecorded = true;
      if (willRetry) {
        await (options.waitForRetry ?? waitForTransientRetry)(retryDelayMs, options.abortSignal);
        continue;
      }
      break;
    }
    try {
      const parsed = spec.schema.parse(raw);
      if (cacheKey && options.cache) await options.cache.set(cacheKey, raw);
      await options.eventSink?.append({ type: "ambient.call.end", message: spec.task, ...ambientTraceMetadata(spec, { attempt, cacheCheckpoint }) });
      return parsed;
    } catch (error) {
      lastError = error;
      lastFailureKind = "validation";
      invalidAttemptCount += 1;
      finalErrorAlreadyRecorded = false;
      await options.eventSink?.append({
        type: "ambient.call.invalid",
        message: spec.task,
        ...ambientTraceMetadata(spec, {
          attempt,
          cacheCheckpoint,
          failureKind: "validation",
          error: ambientErrorMessage(error),
          rawOutputPreview: previewUnknownValue(raw, 1_200),
          rawOutputChars: roughUnknownCharCount(raw),
          invalidAttemptCount,
          maxInvalidAttempts,
        }),
      });
      if (spec.retry?.onInvalid !== "retry" || invalidAttemptCount >= maxInvalidAttempts || attempt >= maxProviderRequests) break;
    }
  }

  if (!finalErrorAlreadyRecorded) {
    await options.eventSink?.append({
      type: "ambient.call.error",
      message: spec.task,
      ...ambientTraceMetadata(spec, {
        ...(lastFailureKind ? { failureKind: lastFailureKind } : {}),
        error: ambientErrorMessage(lastError),
      }),
    });
  }
  throw lastError instanceof Error ? lastError : new Error(ambientErrorMessage(lastError));
}

function workflowAmbientCallInputForAttempt(input: unknown, attempt: number, lastError: unknown): unknown {
  if (attempt <= 1 || lastError === undefined) return input;
  const retryFeedback = {
    attempt,
    previousError: ambientErrorMessage(lastError),
    instruction:
      "Return exactly the outputContract shape. Top-level property names must match exactly, with no extra spaces, aliases, or tokenizer artifacts.",
  };
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return { ...(input as Record<string, unknown>), retryFeedback };
  }
  return { value: input, retryFeedback };
}

export function workflowAmbientCallPromptParts(input: {
  task: string;
  input: unknown;
  attempt: number;
  workflowThreadId?: string;
  graphSnapshotId?: string;
  revisionId?: string;
  createdAt?: string;
}): WorkflowPromptParts {
  return workflowPromptParts({
    stage: "runtime_call",
    workflowThreadId: input.workflowThreadId,
    revisionId: input.revisionId,
    graphSnapshotId: input.graphSnapshotId,
    stablePrefix: [
      `Task: ${input.task}`,
      "",
      "Runtime contract:",
      "- Treat the Structured input as the sole source of truth for this workflow step.",
      "- Preserve concrete names, ids, paths, counts, and skipped/partial-coverage metadata from the input when they are relevant to the output contract.",
      "- Do not invent placeholder examples, generic files, sources, categories, or facts when the input provides concrete evidence.",
      "- If evidence is missing or insufficient, say so in the requested JSON fields instead of fabricating coverage.",
    ].join("\n"),
    mutableSuffix: [`Attempt: ${input.attempt}`, "", "Structured input:", JSON.stringify(input.input)].join("\n"),
    boundaryLabel: "Workflow runtime Ambient call cache checkpoint",
    createdAt: input.createdAt,
  });
}

export function workflowAmbientCallCacheCheckpoint<T>(
  spec: WorkflowAmbientCallSpec<T>,
  attempt: number,
  metadata: { workflowThreadId?: string; graphSnapshotId?: string; revisionId?: string; createdAt?: string } = {},
): WorkflowPromptCacheCheckpoint {
  return workflowAmbientCallPromptParts({
    task: spec.task,
    input: spec.input,
    attempt,
    ...metadata,
  }).cacheCheckpoint;
}

function ambientTraceMetadata<T>(spec: WorkflowAmbientCallSpec<T>, data: Record<string, unknown> = {}): Pick<import("./workflowAgentRuntime").WorkflowRuntimeEvent, "graphNodeId" | "graphEdgeId" | "itemKey" | "data"> {
  const enriched = { ...data };
  if (spec.nodeId) enriched.graphNodeId = spec.nodeId;
  if (spec.edgeId) enriched.graphEdgeId = spec.edgeId;
  if (spec.itemKey) enriched.itemKey = spec.itemKey;
  return {
    graphNodeId: spec.nodeId,
    graphEdgeId: spec.edgeId,
    itemKey: spec.itemKey,
    data: Object.keys(enriched).length > 0 ? enriched : undefined,
  };
}

function normalizedCacheKey(cacheKey: string | unknown[] | undefined): string | undefined {
  if (cacheKey === undefined) return undefined;
  return typeof cacheKey === "string" ? cacheKey : JSON.stringify(cacheKey);
}

function previewUnknownValue(value: unknown, maxChars: number): string {
  const text =
    typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2) ?? String(value);
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 1))}...`;
}

function roughUnknownCharCount(value: unknown): number {
  if (typeof value === "string") return value.length;
  return JSON.stringify(value)?.length ?? String(value).length;
}

function ambientErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return String(error);
}

async function waitForTransientRetry(delayMs: number, abortSignal: AbortSignal | undefined): Promise<void> {
  if (delayMs <= 0) return;
  if (abortSignal?.aborted) throw new Error("Workflow run canceled.");
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      abortSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      abortSignal?.removeEventListener("abort", onAbort);
      reject(new Error("Workflow run canceled."));
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}
