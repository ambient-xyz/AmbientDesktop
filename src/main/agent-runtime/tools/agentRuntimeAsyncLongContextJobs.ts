import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  executeLambdaRlmToolExecution,
  type CreateLambdaRlmToolOptions,
  type LambdaRlmToolExecutionContext,
  type LambdaRlmToolResult,
  type LambdaRlmToolUpdate,
} from "../agentRuntimeToolRuntimeFacade";

export type AsyncLongContextJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "orphaned";
export type AsyncLongContextJobEventKind = "status" | "progress" | "result";

export interface AsyncLongContextJobEvent {
  seq: number;
  at: string;
  kind: AsyncLongContextJobEventKind;
  text: string;
  truncated?: boolean;
  details?: Record<string, unknown>;
}

export interface AsyncLongContextJobSnapshot {
  jobId: string;
  kind: "long_context";
  threadId: string;
  runId?: string;
  status: AsyncLongContextJobStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  latestSeq: number;
  firstAvailableSeq: number;
  nextSinceSeq: number;
  events: AsyncLongContextJobEvent[];
  eventsPruned: boolean;
  resultPreview: string;
  resultTruncated: boolean;
  resultChars: number;
  inputSources: Array<Record<string, unknown>>;
  taskType?: string;
  composeOp?: string;
  inputLength?: number;
  chunkCount?: number;
  leafCount?: number;
  modelCalls?: number;
  elapsedMs?: number;
  artifacts: AsyncLongContextJobArtifacts;
  suggestedPollIntervalMs?: number;
}

export interface AsyncLongContextJobArtifacts {
  result?: AsyncLongContextJobArtifact;
  metadata?: AsyncLongContextJobArtifact;
}

export interface AsyncLongContextJobArtifact {
  path: string;
  bytes: number;
  totalChars: number;
}

export interface AsyncLongContextStartInput {
  threadId: string;
  runId?: string;
  workspacePath: string;
  toolOptions: CreateLambdaRlmToolOptions;
  params: unknown;
  ctx?: LambdaRlmToolExecutionContext;
  yieldMs?: number;
  pollHintMs?: number;
  signal?: AbortSignal;
}

export interface AsyncLongContextSnapshotOptions {
  sinceSeq?: number;
  maxBytes?: number;
}

export interface AsyncLongContextPollOptions extends AsyncLongContextSnapshotOptions {
  waitMs?: number;
}

export interface AgentRuntimeAsyncLongContextJobsOptions {
  onSnapshot?: (snapshot: AsyncLongContextJobSnapshot) => void;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimeout?: (handle: NodeJS.Timeout) => void;
}

interface AsyncLongContextJobRecord {
  jobId: string;
  kind: "long_context";
  threadId: string;
  runId?: string;
  workspacePath: string;
  status: AsyncLongContextJobStatus;
  abortController: AbortController;
  terminal: boolean;
  cancelling: boolean;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  eventSeq: number;
  firstAvailableSeq: number;
  events: AsyncLongContextJobEvent[];
  eventChars: number;
  resultText: string;
  resultDetails?: Record<string, unknown>;
  artifacts: AsyncLongContextJobArtifacts;
  suggestedPollIntervalMs: number;
}

const DEFAULT_ASYNC_LONG_CONTEXT_PREVIEW_BYTES = 12_000;
const MAX_ASYNC_LONG_CONTEXT_PREVIEW_BYTES = 128_000;
const MAX_ASYNC_LONG_CONTEXT_POLL_WAIT_MS = 30_000;
const MAX_ASYNC_LONG_CONTEXT_INITIAL_YIELD_MS = 10_000;
const MAX_IN_MEMORY_EVENT_CHARS = 128_000;
const MAX_IN_MEMORY_EVENTS = 2000;
const MAX_RESULT_PREVIEW_CHARS = 64_000;

const terminalStatuses = new Set<AsyncLongContextJobStatus>([
  "completed",
  "failed",
  "cancelled",
  "orphaned",
]);

export class AgentRuntimeAsyncLongContextJobService {
  private readonly jobs = new Map<string, AsyncLongContextJobRecord>();
  private readonly waiters = new Map<string, Set<() => void>>();
  private readonly now: () => number;
  private readonly setTimeout: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  private readonly clearTimeout: (handle: NodeJS.Timeout) => void;

  constructor(private readonly options: AgentRuntimeAsyncLongContextJobsOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.setTimeout = options.setTimeout ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
    this.clearTimeout = options.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle));
  }

  async start(input: AsyncLongContextStartInput): Promise<AsyncLongContextJobSnapshot> {
    throwIfAborted(input.signal, "long_context_start aborted before launch.");
    const job: AsyncLongContextJobRecord = {
      jobId: randomUUID(),
      kind: "long_context",
      threadId: input.threadId,
      ...(input.runId ? { runId: input.runId } : {}),
      workspacePath: input.workspacePath,
      status: "queued",
      abortController: new AbortController(),
      terminal: false,
      cancelling: false,
      eventSeq: 0,
      firstAvailableSeq: 1,
      events: [],
      eventChars: 0,
      resultText: "",
      artifacts: {},
      suggestedPollIntervalMs: normalizePositiveMs(input.pollHintMs ?? 1000, 250, 60_000),
    };
    this.jobs.set(job.jobId, job);
    const removeAbortListener = this.armStartAbort(job, input.signal);
    this.appendStatus(job, "queued");

    try {
      throwIfAborted(input.signal, `long_context_start aborted before launching job ${job.jobId}.`);
      this.markRunning(job);
      void this.runJob(job, input).catch((error) => void this.failJob(job, error));
      const initialSeq = job.eventSeq;
      const yieldMs = normalizePositiveMs(input.yieldMs ?? 0, 0, MAX_ASYNC_LONG_CONTEXT_INITIAL_YIELD_MS);
      if (yieldMs > 0) await this.waitForChange(job.jobId, initialSeq, yieldMs);
      if (input.signal?.aborted) {
        this.cancelJobForStartAbort(job);
        throw new Error(`long_context_start aborted before returning job ${job.jobId}; job was cancelled.`);
      }
      return this.snapshot(job.jobId);
    } finally {
      removeAbortListener?.();
    }
  }

  async pollForThread(threadId: string, jobId: string, options: AsyncLongContextPollOptions = {}): Promise<AsyncLongContextJobSnapshot> {
    const job = this.requireJobForThread(threadId, jobId);
    const sinceSeq = normalizeSeq(options.sinceSeq);
    const waitMs = normalizePositiveMs(options.waitMs ?? 0, 0, MAX_ASYNC_LONG_CONTEXT_POLL_WAIT_MS);
    if (waitMs > 0 && job.eventSeq <= sinceSeq && !job.terminal) {
      await this.waitForChange(jobId, sinceSeq, waitMs);
    }
    return this.snapshot(jobId, options);
  }

  snapshot(jobId: string, options: AsyncLongContextSnapshotOptions = {}): AsyncLongContextJobSnapshot {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Async long-context job not found: ${jobId}`);
    return snapshotForJob(job, options);
  }

  snapshotForThread(threadId: string, jobId: string, options: AsyncLongContextSnapshotOptions = {}): AsyncLongContextJobSnapshot {
    this.requireJobForThread(threadId, jobId);
    return this.snapshot(jobId, options);
  }

  async cancelForThread(threadId: string, jobId: string, reason?: string): Promise<AsyncLongContextJobSnapshot> {
    const job = this.requireJobForThread(threadId, jobId);
    if (job.terminal) return this.snapshot(jobId);
    job.cancelling = true;
    this.appendStatus(job, reason?.trim() ? `cancelling: ${reason.trim()}` : "cancelling");
    job.abortController.abort();
    await this.waitForChange(jobId, job.eventSeq, 500);
    return this.snapshot(jobId);
  }

  private async runJob(job: AsyncLongContextJobRecord, input: AsyncLongContextStartInput): Promise<void> {
    const result = await executeLambdaRlmToolExecution(
      input.toolOptions,
      input.params,
      job.abortController.signal,
      (update) => this.recordProgress(job, update),
      input.ctx,
      "long_context_start",
    );
    if (job.terminal) return;
    this.recordResult(job, result.toolResult, result.rawResponse);
    await this.finishJob(job, "completed", "completed");
  }

  private markRunning(job: AsyncLongContextJobRecord): void {
    job.status = "running";
    job.startedAt = new Date(this.now()).toISOString();
    this.appendStatus(job, "running");
  }

  private recordProgress(job: AsyncLongContextJobRecord, update: LambdaRlmToolUpdate): void {
    if (job.terminal) return;
    const text = update.content.map((part) => part.text).join("\n").trim() || "Lambda-RLM progress update.";
    this.appendEvent(job, "progress", text, update.details);
  }

  private recordResult(job: AsyncLongContextJobRecord, result: LambdaRlmToolResult, rawResponse: string): void {
    const resultText = rawResponse.trim() || result.content.map((part) => part.text).join("\n").trim();
    job.resultText = resultText;
    job.resultDetails = result.details;
    job.artifacts = writeAsyncLongContextArtifacts(job, resultText, result.details);
    this.appendEvent(job, "result", "result artifact written", result.details);
  }

  private async failJob(job: AsyncLongContextJobRecord, error: unknown): Promise<void> {
    if (job.terminal) return;
    const message = error instanceof Error ? error.message : String(error);
    job.error = message;
    await this.finishJob(job, job.cancelling || job.abortController.signal.aborted ? "cancelled" : "failed", message);
  }

  private async finishJob(job: AsyncLongContextJobRecord, status: AsyncLongContextJobStatus, message: string): Promise<void> {
    if (job.terminal) return;
    job.terminal = true;
    job.status = status;
    job.completedAt = new Date(this.now()).toISOString();
    this.appendStatus(job, message);
  }

  private armStartAbort(job: AsyncLongContextJobRecord, signal: AbortSignal | undefined): (() => void) | undefined {
    if (!signal) return undefined;
    const abort = () => this.cancelJobForStartAbort(job);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    return () => signal.removeEventListener("abort", abort);
  }

  private cancelJobForStartAbort(job: AsyncLongContextJobRecord): void {
    if (job.terminal || job.cancelling) return;
    job.cancelling = true;
    this.appendStatus(job, "long_context_start aborted before background handoff; cancelling");
    job.abortController.abort();
  }

  private appendStatus(job: AsyncLongContextJobRecord, text: string): void {
    this.appendEvent(job, "status", text);
  }

  private appendEvent(
    job: AsyncLongContextJobRecord,
    kind: AsyncLongContextJobEventKind,
    text: string,
    details?: Record<string, unknown>,
  ): void {
    job.eventSeq += 1;
    const event: AsyncLongContextJobEvent = {
      seq: job.eventSeq,
      at: new Date(this.now()).toISOString(),
      kind,
      text,
      ...(details ? { details } : {}),
    };
    job.events.push(event);
    job.eventChars += Buffer.byteLength(text, "utf8");
    pruneJobEvents(job);
    this.notifyWaiters(job.jobId);
    this.options.onSnapshot?.(snapshotForJob(job, { maxBytes: DEFAULT_ASYNC_LONG_CONTEXT_PREVIEW_BYTES }));
  }

  private waitForChange(jobId: string, sinceSeq: number, waitMs: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.eventSeq > sinceSeq || job.terminal || waitMs <= 0) return Promise.resolve();
    return new Promise((resolveWait) => {
      const waiters = this.waiters.get(jobId) ?? new Set<() => void>();
      this.waiters.set(jobId, waiters);
      let timeoutHandle: NodeJS.Timeout | undefined;
      const done = () => {
        if (timeoutHandle) this.clearTimeout(timeoutHandle);
        waiters.delete(done);
        resolveWait();
      };
      waiters.add(done);
      timeoutHandle = this.setTimeout(done, waitMs);
    });
  }

  private notifyWaiters(jobId: string): void {
    const waiters = this.waiters.get(jobId);
    if (!waiters) return;
    for (const waiter of [...waiters]) waiter();
    if (waiters.size === 0) this.waiters.delete(jobId);
  }

  private requireJobForThread(threadId: string, jobId: string): AsyncLongContextJobRecord {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Async long-context job not found: ${jobId}`);
    if (job.threadId !== threadId) throw new Error(`Async long-context job ${jobId} does not belong to this thread.`);
    return job;
  }
}

export function asyncLongContextJobTerminal(status: AsyncLongContextJobStatus): boolean {
  return terminalStatuses.has(status);
}

export function formatAsyncLongContextSnapshotForTool(snapshot: AsyncLongContextJobSnapshot): string {
  const lines = [
    `job_id: ${snapshot.jobId}`,
    "job_kind: long_context",
    `status: ${snapshot.status}`,
    snapshot.error ? `error: ${snapshot.error}` : undefined,
    `latest_seq: ${snapshot.latestSeq}`,
    `first_available_seq: ${snapshot.firstAvailableSeq}`,
    `next_since_seq: ${snapshot.nextSinceSeq}`,
    snapshot.eventsPruned ? "events_pruned: true (older in-memory events were dropped; use artifacts for final output)" : undefined,
    snapshot.suggestedPollIntervalMs ? `suggested_poll_interval_ms: ${snapshot.suggestedPollIntervalMs}` : undefined,
    snapshot.taskType ? `task_type: ${snapshot.taskType}` : undefined,
    snapshot.composeOp ? `reducer: ${snapshot.composeOp}` : undefined,
    snapshot.inputLength !== undefined ? `input_characters: ${snapshot.inputLength}` : undefined,
    snapshot.chunkCount !== undefined ? `chunks: ${snapshot.chunkCount}` : undefined,
    snapshot.leafCount !== undefined ? `leaves: ${snapshot.leafCount}` : undefined,
    snapshot.modelCalls !== undefined ? `model_calls: ${snapshot.modelCalls}` : undefined,
    snapshot.elapsedMs !== undefined ? `elapsed_ms: ${Math.round(snapshot.elapsedMs)}` : undefined,
    `input_sources: ${snapshot.inputSources.length}`,
    artifactLine("result_artifact", snapshot.artifacts.result),
    artifactLine("metadata_artifact", snapshot.artifacts.metadata),
    "",
    "events:",
    ...snapshot.events.map((event) => {
      const suffix = event.truncated ? " [truncated]" : "";
      return `[${event.seq}] ${event.kind}${suffix}: ${event.text}`;
    }),
  ].filter((line): line is string => line !== undefined);
  if (snapshot.resultPreview) {
    lines.push("");
    lines.push("result_preview:");
    lines.push(snapshot.resultPreview);
    if (snapshot.resultTruncated) lines.push("Result preview was bounded. Use file_read on result_artifact for exact text.");
  }
  return lines.join("\n");
}

export function formatAsyncLongContextOrphanedSnapshotForTool(threadId: string, jobId: string): string {
  return [
    `job_id: ${jobId}`,
    "job_kind: long_context",
    "status: orphaned",
    `thread_id: ${threadId}`,
    "The async long-context job is unavailable in this process. Treat it as orphaned unless long_context_poll can still find it, and report the limitation clearly.",
  ].join("\n");
}

export function asyncLongContextSnapshotDetails(snapshot: AsyncLongContextJobSnapshot): Record<string, unknown> {
  return {
    runtime: "ambient-async-long-context",
    toolName: "long_context_async",
    status: snapshot.status,
    jobId: snapshot.jobId,
    firstAvailableSeq: snapshot.firstAvailableSeq,
    latestSeq: snapshot.latestSeq,
    nextSinceSeq: snapshot.nextSinceSeq,
    eventsPruned: snapshot.eventsPruned,
    resultChars: snapshot.resultChars,
    taskType: snapshot.taskType,
    composeOp: snapshot.composeOp,
    inputLength: snapshot.inputLength,
    chunkCount: snapshot.chunkCount,
    leafCount: snapshot.leafCount,
    modelCalls: snapshot.modelCalls,
    elapsedMs: snapshot.elapsedMs,
    artifactPaths: {
      result: snapshot.artifacts.result?.path,
      metadata: snapshot.artifacts.metadata?.path,
    },
  };
}

function snapshotForJob(job: AsyncLongContextJobRecord, options: AsyncLongContextSnapshotOptions = {}): AsyncLongContextJobSnapshot {
  const maxBytes = normalizePositiveMs(
    options.maxBytes ?? DEFAULT_ASYNC_LONG_CONTEXT_PREVIEW_BYTES,
    0,
    MAX_ASYNC_LONG_CONTEXT_PREVIEW_BYTES,
  );
  const sinceSeq = normalizeSeq(options.sinceSeq);
  const eventsPruned = sinceSeq > 0 && sinceSeq < job.firstAvailableSeq - 1;
  const events = boundedEvents(job.events.filter((event) => event.seq > sinceSeq), maxBytes);
  const nextSinceSeq = events.length > 0 ? events[events.length - 1]!.seq : job.eventSeq;
  const resultPreview = tailPreview(job.resultText, Math.min(maxBytes, MAX_RESULT_PREVIEW_CHARS));
  const resultDetails = job.resultDetails ?? {};
  return {
    jobId: job.jobId,
    kind: job.kind,
    threadId: job.threadId,
    ...(job.runId ? { runId: job.runId } : {}),
    status: job.status,
    ...(job.error ? { error: job.error } : {}),
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    latestSeq: job.eventSeq,
    firstAvailableSeq: job.firstAvailableSeq,
    nextSinceSeq,
    events,
    eventsPruned,
    resultPreview: resultPreview.text,
    resultTruncated: resultPreview.truncated || events.some((event) => event.truncated),
    resultChars: job.resultText.length,
    inputSources: Array.isArray(resultDetails.inputSources) ? resultDetails.inputSources as Array<Record<string, unknown>> : [],
    taskType: optionalString(resultDetails.taskType),
    composeOp: optionalString(resultDetails.composeOp),
    inputLength: optionalNumber(resultDetails.inputLength),
    chunkCount: optionalNumber(resultDetails.chunkCount),
    leafCount: optionalNumber(resultDetails.leafCount),
    modelCalls: optionalNumber(resultDetails.modelCalls),
    elapsedMs: optionalNumber(resultDetails.elapsedMs),
    artifacts: job.artifacts,
    ...(job.terminal ? {} : { suggestedPollIntervalMs: job.suggestedPollIntervalMs }),
  };
}

function writeAsyncLongContextArtifacts(
  job: AsyncLongContextJobRecord,
  resultText: string,
  details: Record<string, unknown>,
): AsyncLongContextJobArtifacts {
  const date = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const basePath = `.ambient/tool-outputs/${date}/${stamp}-async-long-context-${job.jobId}`;
  const resultPath = `${basePath}-result.txt`;
  const metadataPath = `${basePath}-metadata.json`;
  const resultAbsolutePath = join(job.workspacePath, resultPath);
  const metadataAbsolutePath = join(job.workspacePath, metadataPath);
  mkdirSync(dirname(resultAbsolutePath), { recursive: true });
  writeFileSync(resultAbsolutePath, resultText, "utf8");
  const metadataText = JSON.stringify({
    jobId: job.jobId,
    threadId: job.threadId,
    status: "completed",
    completedAt: new Date().toISOString(),
    details,
  }, null, 2);
  writeFileSync(metadataAbsolutePath, metadataText, "utf8");
  return {
    result: {
      path: resultPath,
      bytes: Buffer.byteLength(resultText, "utf8"),
      totalChars: resultText.length,
    },
    metadata: {
      path: metadataPath,
      bytes: Buffer.byteLength(metadataText, "utf8"),
      totalChars: metadataText.length,
    },
  };
}

function pruneJobEvents(job: AsyncLongContextJobRecord): void {
  while (
    job.events.length > MAX_IN_MEMORY_EVENTS ||
    (job.eventChars > MAX_IN_MEMORY_EVENT_CHARS && job.events.length > 1)
  ) {
    const removed = job.events.shift();
    if (!removed) break;
    job.eventChars -= Buffer.byteLength(removed.text, "utf8");
    job.firstAvailableSeq = job.events[0]?.seq ?? job.eventSeq + 1;
  }
}

function boundedEvents(events: AsyncLongContextJobEvent[], maxBytes: number): AsyncLongContextJobEvent[] {
  if (maxBytes <= 0) return [];
  const output: AsyncLongContextJobEvent[] = [];
  let used = 0;
  for (const event of events) {
    const bytes = Buffer.byteLength(event.text, "utf8");
    if (used + bytes <= maxBytes) {
      output.push(event);
      used += bytes;
      continue;
    }
    const remaining = maxBytes - used;
    if (remaining > 0) {
      output.push({
        ...event,
        text: Buffer.from(event.text).subarray(0, remaining).toString("utf8"),
        truncated: true,
      });
    }
    break;
  }
  return output;
}

function tailPreview(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (maxChars <= 0) return { text: "", truncated: text.length > 0 };
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(-maxChars), truncated: true };
}

function normalizeSeq(value: number | undefined): number {
  if (!Number.isFinite(value ?? 0)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

function normalizePositiveMs(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted) throw new Error(message);
}

function artifactLine(label: string, artifact: AsyncLongContextJobArtifact | undefined): string | undefined {
  if (!artifact) return undefined;
  return `${label}: ${artifact.path} bytes=${artifact.bytes} chars=${artifact.totalChars}`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
