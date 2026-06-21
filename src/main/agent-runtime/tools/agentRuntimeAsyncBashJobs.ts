import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

import {
  assertShellCommandHasNoTokenizerArtifacts,
  buildShellInvocation,
  killToolProcessTree,
  redactSensitiveTextWithMetadata,
  registeredSecretRedactionMaxLength,
  resolveToolExecutionTimeoutPolicy,
  waitForToolProcess,
  type ToolExecutionTimeoutPolicy,
  type ToolRunnerInvocation,
  type ToolRunnerPolicy,
} from "../agentRuntimeToolRuntimeFacade";

type NodePtyModule = typeof import("node-pty");
type NodePtyProcess = ReturnType<NodePtyModule["spawn"]>;

export type AsyncBashJobStatus =
  | "queued"
  | "running"
  | "exited"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "orphaned";

export type AsyncBashJobEventKind = "stdout" | "stderr" | "status";

export interface AsyncBashJobEvent {
  seq: number;
  at: string;
  kind: AsyncBashJobEventKind;
  text: string;
  truncated?: boolean;
}

export interface AsyncBashJobSnapshot {
  jobId: string;
  kind: "bash";
  threadId: string;
  runId?: string;
  command: string;
  cwd: string;
  status: AsyncBashJobStatus;
  tty: boolean;
  pid?: number;
  exitCode?: number | null;
  error?: string;
  timeoutReason?: AsyncBashTimeoutReason;
  idleTimeoutMs: number;
  maxRunMs?: number | null;
  artifactByteLimit: number;
  artifactLimitReached: boolean;
  startedAt?: string;
  completedAt?: string;
  latestSeq: number;
  firstAvailableSeq: number;
  nextSinceSeq: number;
  events: AsyncBashJobEvent[];
  eventsPruned: boolean;
  outputPreview: string;
  stdoutPreview: string;
  stderrPreview: string;
  outputTruncated: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  totalOutputChars: number;
  stdoutChars: number;
  stderrChars: number;
  artifacts: AsyncBashJobArtifacts;
  suggestedPollIntervalMs?: number;
}

export interface AsyncBashJobArtifacts {
  stdout?: AsyncBashJobArtifact;
  stderr?: AsyncBashJobArtifact;
  combined?: AsyncBashJobArtifact;
}

export interface AsyncBashJobArtifact {
  path: string;
  bytes?: number;
  totalChars: number;
  redacted: boolean;
}

interface AsyncBashLiveArtifactWriters {
  stdout: AsyncBashLiveArtifactWriter;
  stderr: AsyncBashLiveArtifactWriter;
  combined: AsyncBashLiveArtifactWriter;
}

interface AsyncBashLiveArtifactWriter {
  path: string;
  absolutePath: string;
  bytes: number;
  totalChars: number;
  redacted: boolean;
  redactionCount: number;
}

export interface AsyncBashStartInput {
  threadId: string;
  runId?: string;
  workspacePath: string;
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  policy: ToolRunnerPolicy;
  yieldMs?: number;
  idleTimeoutMs?: number;
  tty?: boolean;
  signal?: AbortSignal;
}

export interface AsyncBashSnapshotOptions {
  sinceSeq?: number;
  maxBytes?: number;
}

export interface AsyncBashPollOptions extends AsyncBashSnapshotOptions {
  waitMs?: number;
}

export interface AgentRuntimeAsyncBashJobsOptions {
  onSnapshot?: (snapshot: AsyncBashJobSnapshot) => void;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimeout?: (handle: NodeJS.Timeout) => void;
  artifactByteLimit?: number;
}

type AsyncBashTimeoutReason = "idle" | "max-run" | "output-limit";

interface AsyncBashJobRecord {
  jobId: string;
  kind: "bash";
  threadId: string;
  runId?: string;
  workspacePath: string;
  command: string;
  cwd: string;
  status: AsyncBashJobStatus;
  tty: boolean;
  invocation?: ToolRunnerInvocation;
  child?: ChildProcessWithoutNullStreams;
  pty?: NodePtyProcess;
  pid?: number;
  exitCode?: number | null;
  error?: string;
  timeoutReason?: AsyncBashTimeoutReason;
  timeoutPolicy: ToolExecutionTimeoutPolicy;
  artifactByteLimit: number;
  startedAt?: string;
  completedAt?: string;
  eventSeq: number;
  firstAvailableSeq: number;
  events: AsyncBashJobEvent[];
  eventChars: number;
  stdoutPreview: string;
  stderrPreview: string;
  combinedPreview: string;
  stdoutDecoder: StringDecoder;
  stderrDecoder: StringDecoder;
  stdoutRedactor: StreamingSensitiveTextRedactor;
  stderrRedactor: StreamingSensitiveTextRedactor;
  terminal: boolean;
  cancelling: boolean;
  idleTimeoutHandle?: NodeJS.Timeout;
  maxRunTimeoutHandle?: NodeJS.Timeout;
  cancelEscalationHandle?: NodeJS.Timeout;
  artifacts: AsyncBashJobArtifacts;
  artifactWriters: AsyncBashLiveArtifactWriters;
}

const DEFAULT_ASYNC_BASH_PREVIEW_BYTES = 12_000;
const MAX_ASYNC_BASH_POLL_WAIT_MS = 30_000;
const MAX_ASYNC_BASH_INITIAL_YIELD_MS = 10_000;
const MAX_ASYNC_BASH_PREVIEW_BYTES = 128_000;
const MAX_IN_MEMORY_OUTPUT_CHARS = 64_000;
const MAX_IN_MEMORY_EVENT_CHARS = 128_000;
const MAX_IN_MEMORY_EVENTS = 2000;
const OUTPUT_EVENT_CHARS = 4096;
const CANCEL_ESCALATION_MS = 1500;
const DEFAULT_ASYNC_BASH_ARTIFACT_BYTE_LIMIT = 25 * 1024 * 1024;
const MIN_ASYNC_BASH_ARTIFACT_BYTE_LIMIT = 1024;
const STREAM_REDACTION_PREFIX_CARRY_CHARS = 64;
const MAX_STREAM_REDACTION_CARRY_CHARS = 8192;

const terminalStatuses = new Set<AsyncBashJobStatus>([
  "exited",
  "failed",
  "cancelled",
  "timed_out",
  "orphaned",
]);

export class AgentRuntimeAsyncBashJobService {
  private readonly jobs = new Map<string, AsyncBashJobRecord>();
  private readonly waiters = new Map<string, Set<() => void>>();
  private readonly now: () => number;
  private readonly setTimeout: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  private readonly clearTimeout: (handle: NodeJS.Timeout) => void;

  constructor(private readonly options: AgentRuntimeAsyncBashJobsOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.setTimeout = options.setTimeout ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
    this.clearTimeout = options.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle));
  }

  async start(input: AsyncBashStartInput): Promise<AsyncBashJobSnapshot> {
    throwIfAborted(input.signal, "bash_start aborted before launch.");
    const command = input.command.trim();
    if (!command) throw new Error("bash_start requires a non-empty cmd string.");
    assertShellCommandHasNoTokenizerArtifacts(command);
    const cwd = normalizeCwd(input.workspacePath, input.cwd);
    const timeoutPolicy = resolveToolExecutionTimeoutPolicy({
      command,
      subject: input.policy.subject,
      override: input.idleTimeoutMs
        ? { idleTimeoutMs: normalizePositiveMs(input.idleTimeoutMs, 1000, 30 * 60_000) }
        : undefined,
    });
    const invocation = buildShellInvocation({
      command,
      cwd,
      env: input.env,
      policy: input.policy,
    });
    const jobId = randomUUID();
    const artifactWriters = createAsyncBashLiveArtifactWriters(input.workspacePath, jobId);
    const job: AsyncBashJobRecord = {
      jobId,
      kind: "bash",
      threadId: input.threadId,
      ...(input.runId ? { runId: input.runId } : {}),
      workspacePath: input.workspacePath,
      command,
      cwd,
      status: "queued",
      tty: input.tty === true,
      timeoutPolicy,
      artifactByteLimit: normalizeArtifactByteLimit(this.options.artifactByteLimit),
      eventSeq: 0,
      firstAvailableSeq: 1,
      events: [],
      eventChars: 0,
      stdoutPreview: "",
      stderrPreview: "",
      combinedPreview: "",
      stdoutDecoder: new StringDecoder("utf8"),
      stderrDecoder: new StringDecoder("utf8"),
      stdoutRedactor: new StreamingSensitiveTextRedactor(),
      stderrRedactor: new StreamingSensitiveTextRedactor(),
      terminal: false,
      cancelling: false,
      artifacts: artifactsFromLiveWriters(artifactWriters),
      artifactWriters,
    };
    this.jobs.set(job.jobId, job);
    const removeAbortListener = this.armStartAbort(job, input.signal);
    this.appendStatus(job, "queued");

    try {
      throwIfAborted(input.signal, `bash_start aborted before launching job ${job.jobId}.`);
      job.invocation = invocation;
      if (job.tty) await this.startPty(job, invocation);
      else this.startPipeProcess(job, invocation);
      const initialSeq = job.eventSeq;
      const yieldMs = normalizePositiveMs(input.yieldMs ?? 0, 0, MAX_ASYNC_BASH_INITIAL_YIELD_MS);
      if (yieldMs > 0) await this.waitForChange(job.jobId, initialSeq, yieldMs);
      if (input.signal?.aborted) {
        this.cancelJobForStartAbort(job);
        await this.waitForTerminal(job.jobId, CANCEL_ESCALATION_MS + 1000);
        throw new Error(`bash_start aborted before returning job ${job.jobId}; job was cancelled.`);
      }
      return this.snapshot(job.jobId);
    } finally {
      removeAbortListener?.();
    }
  }

  async pollForThread(threadId: string, jobId: string, options: AsyncBashPollOptions = {}): Promise<AsyncBashJobSnapshot> {
    const job = this.requireJobForThread(threadId, jobId);
    const sinceSeq = normalizeSeq(options.sinceSeq);
    const waitMs = normalizePositiveMs(options.waitMs ?? 0, 0, MAX_ASYNC_BASH_POLL_WAIT_MS);
    if (waitMs > 0 && job.eventSeq <= sinceSeq && !job.terminal) {
      await this.waitForChange(jobId, sinceSeq, waitMs);
    }
    return this.snapshot(jobId, options);
  }

  snapshot(jobId: string, options: AsyncBashSnapshotOptions = {}): AsyncBashJobSnapshot {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Async bash job not found: ${jobId}`);
    return snapshotForJob(job, options);
  }

  snapshotForThread(threadId: string, jobId: string, options: AsyncBashSnapshotOptions = {}): AsyncBashJobSnapshot {
    this.requireJobForThread(threadId, jobId);
    return this.snapshot(jobId, options);
  }

  async writeForThread(threadId: string, jobId: string, chars: string, waitMs = 0): Promise<AsyncBashJobSnapshot> {
    const job = this.requireJobForThread(threadId, jobId);
    if (job.terminal || job.status !== "running") {
      throw new Error(`Async bash job ${jobId} is not running.`);
    }
    if (!chars) throw new Error("bash_write requires non-empty chars.");
    const sinceSeq = job.eventSeq;
    if (job.pty) {
      job.pty.write(chars);
    } else if (job.child?.stdin.writable) {
      job.child.stdin.write(chars);
    } else {
      throw new Error(`Async bash job ${jobId} does not accept stdin.`);
    }
    this.appendStatus(job, `stdin write accepted (${Buffer.byteLength(chars, "utf8")} bytes).`);
    const waitSinceSeq = job.eventSeq;
    const normalizedWaitMs = normalizePositiveMs(waitMs, 0, MAX_ASYNC_BASH_POLL_WAIT_MS);
    if (normalizedWaitMs > 0 && !job.terminal) {
      await this.waitForChange(jobId, waitSinceSeq, normalizedWaitMs);
    }
    return this.snapshot(jobId, { sinceSeq });
  }

  async cancelForThread(threadId: string, jobId: string, reason?: string): Promise<AsyncBashJobSnapshot> {
    const job = this.requireJobForThread(threadId, jobId);
    if (job.terminal) return this.snapshot(jobId);
    job.cancelling = true;
    this.appendStatus(job, reason?.trim() ? `cancelling: ${reason.trim()}` : "cancelling");
    this.signalJob(job, "SIGTERM");
    job.cancelEscalationHandle = this.setTimeout(() => {
      if (job.terminal) return;
      this.appendStatus(job, "cancel escalation: SIGKILL");
      killToolProcessTree(job.pid);
      job.pty?.kill("SIGKILL");
    }, CANCEL_ESCALATION_MS);
    await this.waitForChange(jobId, job.eventSeq, CANCEL_ESCALATION_MS + 500);
    return this.snapshot(jobId);
  }

  private startPipeProcess(job: AsyncBashJobRecord, invocation: ToolRunnerInvocation): void {
    if (job.terminal || job.cancelling) return;
    try {
      const child = spawn(invocation.command, invocation.args, {
        cwd: invocation.cwd,
        env: invocation.env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
        windowsHide: true,
      });
      job.child = child;
      job.pid = child.pid;
      this.markRunning(job);
      child.stdout.on("data", (data: Buffer) => this.recordStdout(job, data));
      child.stderr.on("data", (data: Buffer) => this.recordStderr(job, data));
      waitForToolProcess(child)
        .then((exitCode) => void this.finishProcess(job, exitCode))
        .catch((error) => void this.failProcess(job, error));
    } catch (error) {
      void this.failProcess(job, error);
    }
  }

  private async startPty(job: AsyncBashJobRecord, invocation: ToolRunnerInvocation): Promise<void> {
    try {
      const pty = await import("node-pty");
      if (job.terminal || job.cancelling) return;
      const ptyProcess = pty.spawn(invocation.command, invocation.args, {
        name: "xterm-color",
        cols: 120,
        rows: 30,
        cwd: invocation.cwd,
        env: invocation.env as Record<string, string>,
      });
      job.pty = ptyProcess;
      job.pid = ptyProcess.pid;
      this.markRunning(job);
      ptyProcess.onData((data) => this.recordStdout(job, Buffer.from(data, "utf8")));
      ptyProcess.onExit(({ exitCode }) => void this.finishProcess(job, exitCode));
    } catch (error) {
      await this.failProcess(job, error);
    }
  }

  private markRunning(job: AsyncBashJobRecord): void {
    job.status = "running";
    job.startedAt = new Date(this.now()).toISOString();
    this.appendStatus(job, job.pid ? `running (pid ${job.pid})` : "running");
    this.armTimeouts(job);
  }

  private recordStdout(job: AsyncBashJobRecord, data: Buffer): void {
    const text = job.stdoutDecoder.write(data);
    this.recordOutput(job, "stdout", text);
  }

  private recordStderr(job: AsyncBashJobRecord, data: Buffer): void {
    const text = job.stderrDecoder.write(data);
    this.recordOutput(job, "stderr", text);
  }

  private recordOutput(job: AsyncBashJobRecord, kind: "stdout" | "stderr", text: string, final = false): void {
    if (job.terminal || job.timeoutReason === "output-limit") return;
    const rawOutputBytes = Buffer.byteLength(text, "utf8");
    if (rawOutputBytes > 0) this.resetIdleTimeout(job);
    const redactor = kind === "stdout" ? job.stdoutRedactor : job.stderrRedactor;
    const redaction = redactor.push(text, final);
    const safeText = redaction.text;
    if (!safeText) {
      if (rawOutputBytes > 0) this.appendStatus(job, `${kind} activity received (${rawOutputBytes} bytes buffered for redaction boundary)`);
      return;
    }
    const capped = takeUtf8Prefix(safeText, Math.max(0, job.artifactByteLimit - job.artifactWriters.combined.bytes));
    if (capped.text) {
      appendLiveArtifact(job.artifactWriters[kind], capped.text, redaction.replacementCount);
      appendLiveArtifact(job.artifactWriters.combined, capped.text, redaction.replacementCount);
    }
    job.artifacts = artifactsFromLiveWriters(job.artifactWriters);
    if (capped.text) {
      if (kind === "stdout") job.stdoutPreview = appendBoundedText(job.stdoutPreview, capped.text, MAX_IN_MEMORY_OUTPUT_CHARS);
      else job.stderrPreview = appendBoundedText(job.stderrPreview, capped.text, MAX_IN_MEMORY_OUTPUT_CHARS);
      job.combinedPreview = appendBoundedText(job.combinedPreview, capped.text, MAX_IN_MEMORY_OUTPUT_CHARS);
      this.resetIdleTimeout(job);
      for (let offset = 0; offset < capped.text.length; offset += OUTPUT_EVENT_CHARS) {
        this.appendEvent(job, kind, capped.text.slice(offset, offset + OUTPUT_EVENT_CHARS));
      }
    }
    if (capped.truncated || redaction.overflow) {
      this.timeoutJob(job, "output-limit");
    }
  }

  private armTimeouts(job: AsyncBashJobRecord): void {
    this.resetIdleTimeout(job);
    if (job.timeoutPolicy.maxRunMs !== null) {
      job.maxRunTimeoutHandle = this.setTimeout(() => this.timeoutJob(job, "max-run"), job.timeoutPolicy.maxRunMs);
    }
  }

  private resetIdleTimeout(job: AsyncBashJobRecord): void {
    if (job.idleTimeoutHandle) this.clearTimeout(job.idleTimeoutHandle);
    job.idleTimeoutHandle = this.setTimeout(() => this.timeoutJob(job, "idle"), job.timeoutPolicy.idleTimeoutMs);
  }

  private timeoutJob(job: AsyncBashJobRecord, reason: AsyncBashTimeoutReason): void {
    if (job.terminal || job.timeoutReason) return;
    job.timeoutReason = reason;
    this.appendStatus(job, timeoutMessage(job, reason));
    this.signalJob(job, "SIGTERM");
    this.setTimeout(() => {
      if (!job.terminal) killToolProcessTree(job.pid);
    }, CANCEL_ESCALATION_MS);
  }

  private signalJob(job: AsyncBashJobRecord, signal: NodeJS.Signals): void {
    if (job.pid) signalProcessTree(job.pid, signal);
    if (job.pty) {
      try {
        job.pty.kill(signal);
      } catch {
        // Process may already be gone.
      }
    }
  }

  private armStartAbort(job: AsyncBashJobRecord, signal: AbortSignal | undefined): (() => void) | undefined {
    if (!signal) return undefined;
    const abort = () => this.cancelJobForStartAbort(job);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    return () => signal.removeEventListener("abort", abort);
  }

  private cancelJobForStartAbort(job: AsyncBashJobRecord): void {
    if (job.terminal || job.cancelling) return;
    job.cancelling = true;
    this.appendStatus(job, "bash_start aborted before background handoff; cancelling");
    if (!job.pid && !job.child && !job.pty) {
      void this.finishJob(job, "cancelled", "cancelled before launch");
      return;
    }
    this.signalJob(job, "SIGTERM");
    job.cancelEscalationHandle = this.setTimeout(() => {
      if (job.terminal) return;
      this.appendStatus(job, "start abort escalation: SIGKILL");
      killToolProcessTree(job.pid);
      job.pty?.kill("SIGKILL");
    }, CANCEL_ESCALATION_MS);
  }

  private async finishProcess(job: AsyncBashJobRecord, exitCode: number | null): Promise<void> {
    const stdoutTail = job.stdoutDecoder.end();
    this.recordOutput(job, "stdout", stdoutTail, true);
    const stderrTail = job.stderrDecoder.end();
    this.recordOutput(job, "stderr", stderrTail, true);
    const status: AsyncBashJobStatus = job.timeoutReason ? "timed_out" : job.cancelling ? "cancelled" : "exited";
    job.exitCode = exitCode;
    await this.finishJob(job, status, status === "exited" ? `exited with code ${exitCode ?? "null"}` : status);
  }

  private async failProcess(job: AsyncBashJobRecord, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    job.error = message;
    await this.finishJob(job, "failed", `failed: ${message}`);
  }

  private async finishJob(job: AsyncBashJobRecord, status: AsyncBashJobStatus, message: string): Promise<void> {
    if (job.terminal) return;
    job.terminal = true;
    job.status = status;
    job.completedAt = new Date(this.now()).toISOString();
    this.clearJobTimeouts(job);
    this.appendStatus(job, message);
  }

  private clearJobTimeouts(job: AsyncBashJobRecord): void {
    for (const handle of [job.idleTimeoutHandle, job.maxRunTimeoutHandle, job.cancelEscalationHandle]) {
      if (handle) this.clearTimeout(handle);
    }
    job.idleTimeoutHandle = undefined;
    job.maxRunTimeoutHandle = undefined;
    job.cancelEscalationHandle = undefined;
  }

  private appendStatus(job: AsyncBashJobRecord, text: string): void {
    this.appendEvent(job, "status", text);
  }

  private appendEvent(job: AsyncBashJobRecord, kind: AsyncBashJobEventKind, text: string): void {
    job.eventSeq += 1;
    const event: AsyncBashJobEvent = {
      seq: job.eventSeq,
      at: new Date(this.now()).toISOString(),
      kind,
      text,
    };
    job.events.push(event);
    job.eventChars += Buffer.byteLength(text, "utf8");
    pruneJobEvents(job);
    this.notifyWaiters(job.jobId);
    this.options.onSnapshot?.(snapshotForJob(job, { maxBytes: DEFAULT_ASYNC_BASH_PREVIEW_BYTES }));
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

  private async waitForTerminal(jobId: string, waitMs: number): Promise<void> {
    const deadline = this.now() + waitMs;
    while (this.now() < deadline) {
      const job = this.jobs.get(jobId);
      if (!job || job.terminal) return;
      const remainingMs = Math.max(1, deadline - this.now());
      await this.waitForChange(jobId, job.eventSeq, Math.min(100, remainingMs));
    }
  }

  private notifyWaiters(jobId: string): void {
    const waiters = this.waiters.get(jobId);
    if (!waiters) return;
    for (const waiter of [...waiters]) waiter();
    if (waiters.size === 0) this.waiters.delete(jobId);
  }

  private requireJobForThread(threadId: string, jobId: string): AsyncBashJobRecord {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Async bash job not found: ${jobId}`);
    if (job.threadId !== threadId) throw new Error(`Async bash job ${jobId} does not belong to this thread.`);
    return job;
  }
}

export function asyncBashJobTerminal(status: AsyncBashJobStatus): boolean {
  return terminalStatuses.has(status);
}

export function formatAsyncBashSnapshotForTool(snapshot: AsyncBashJobSnapshot): string {
  const lines = [
    `job_id: ${snapshot.jobId}`,
    `status: ${snapshot.status}`,
    `cwd: ${snapshot.cwd}`,
    `cmd: ${snapshot.command}`,
    snapshot.pid ? `pid: ${snapshot.pid}` : undefined,
    snapshot.exitCode !== undefined ? `exit_code: ${snapshot.exitCode ?? "null"}` : undefined,
    snapshot.timeoutReason ? `timeout_reason: ${snapshot.timeoutReason}` : undefined,
    `artifact_byte_limit: ${snapshot.artifactByteLimit}`,
    snapshot.artifactLimitReached ? "artifact_limit_reached: true" : undefined,
    snapshot.error ? `error: ${snapshot.error}` : undefined,
    `latest_seq: ${snapshot.latestSeq}`,
    `first_available_seq: ${snapshot.firstAvailableSeq}`,
    `next_since_seq: ${snapshot.nextSinceSeq}`,
    snapshot.eventsPruned ? "events_pruned: true (older in-memory events were dropped; use artifacts for full output)" : undefined,
    snapshot.suggestedPollIntervalMs ? `suggested_poll_interval_ms: ${snapshot.suggestedPollIntervalMs}` : undefined,
    artifactLine("stdout_artifact", snapshot.artifacts.stdout),
    artifactLine("stderr_artifact", snapshot.artifacts.stderr),
    artifactLine("combined_artifact", snapshot.artifacts.combined),
    "",
    "events:",
    ...snapshot.events.map((event) => {
      const suffix = event.truncated ? " [truncated]" : "";
      return `[${event.seq}] ${event.kind}${suffix}: ${event.text}`;
    }),
  ].filter((line): line is string => line !== undefined);
  if (snapshot.outputTruncated) {
    lines.push("");
    lines.push("Output preview was bounded. Use bash_poll with since_seq/next_since_seq for incremental updates; use file_read or long_context_process on artifact paths after the job exits.");
  }
  return lines.join("\n");
}

export function asyncBashSnapshotDetails(snapshot: AsyncBashJobSnapshot): Record<string, unknown> {
  return {
    runtime: "ambient-async-bash",
    toolName: "bash_async",
    status: snapshot.status,
    jobId: snapshot.jobId,
    firstAvailableSeq: snapshot.firstAvailableSeq,
    latestSeq: snapshot.latestSeq,
    nextSinceSeq: snapshot.nextSinceSeq,
    eventsPruned: snapshot.eventsPruned,
    outputChars: snapshot.totalOutputChars,
    stdoutChars: snapshot.stdoutChars,
    stderrChars: snapshot.stderrChars,
    exitCode: snapshot.exitCode,
    timeoutReason: snapshot.timeoutReason,
    artifactByteLimit: snapshot.artifactByteLimit,
    artifactLimitReached: snapshot.artifactLimitReached,
    artifactPaths: {
      stdout: snapshot.artifacts.stdout?.path,
      stderr: snapshot.artifacts.stderr?.path,
      combined: snapshot.artifacts.combined?.path,
    },
  };
}

function snapshotForJob(job: AsyncBashJobRecord, options: AsyncBashSnapshotOptions = {}): AsyncBashJobSnapshot {
  const maxBytes = normalizePositiveMs(
    options.maxBytes ?? DEFAULT_ASYNC_BASH_PREVIEW_BYTES,
    0,
    MAX_ASYNC_BASH_PREVIEW_BYTES,
  );
  const sinceSeq = normalizeSeq(options.sinceSeq);
  const eventsPruned = sinceSeq > 0 && sinceSeq < job.firstAvailableSeq - 1;
  const events = boundedEvents(job.events.filter((event) => event.seq > sinceSeq), maxBytes);
  const nextSinceSeq = events.length > 0 ? events[events.length - 1]!.seq : job.eventSeq;
  const outputPreview = tailPreview(job.combinedPreview, maxBytes);
  const stdoutPreview = tailPreview(job.stdoutPreview, Math.floor(maxBytes / 2));
  const stderrPreview = tailPreview(job.stderrPreview, Math.floor(maxBytes / 2));
  return {
    jobId: job.jobId,
    kind: job.kind,
    threadId: job.threadId,
    ...(job.runId ? { runId: job.runId } : {}),
    command: job.command,
    cwd: job.cwd,
    status: job.status,
    tty: job.tty,
    ...(job.pid ? { pid: job.pid } : {}),
    ...(job.exitCode !== undefined ? { exitCode: job.exitCode } : {}),
    ...(job.error ? { error: job.error } : {}),
    ...(job.timeoutReason ? { timeoutReason: job.timeoutReason } : {}),
    idleTimeoutMs: job.timeoutPolicy.idleTimeoutMs,
    maxRunMs: job.timeoutPolicy.maxRunMs,
    artifactByteLimit: job.artifactByteLimit,
    artifactLimitReached: job.timeoutReason === "output-limit" || job.artifactWriters.combined.bytes >= job.artifactByteLimit,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    latestSeq: job.eventSeq,
    firstAvailableSeq: job.firstAvailableSeq,
    nextSinceSeq,
    events,
    eventsPruned,
    outputPreview: outputPreview.text,
    stdoutPreview: stdoutPreview.text,
    stderrPreview: stderrPreview.text,
    outputTruncated: outputPreview.truncated || job.artifactWriters.combined.totalChars > job.combinedPreview.length || events.some((event) => event.truncated),
    stdoutTruncated: stdoutPreview.truncated || job.artifactWriters.stdout.totalChars > job.stdoutPreview.length,
    stderrTruncated: stderrPreview.truncated || job.artifactWriters.stderr.totalChars > job.stderrPreview.length,
    totalOutputChars: job.artifactWriters.combined.totalChars,
    stdoutChars: job.artifactWriters.stdout.totalChars,
    stderrChars: job.artifactWriters.stderr.totalChars,
    artifacts: job.artifacts,
    ...(job.terminal ? {} : { suggestedPollIntervalMs: 1000 }),
  };
}

function createAsyncBashLiveArtifactWriters(workspacePath: string, jobId: string): AsyncBashLiveArtifactWriters {
  return {
    stdout: createAsyncBashLiveArtifactWriter(workspacePath, jobId, "stdout"),
    stderr: createAsyncBashLiveArtifactWriter(workspacePath, jobId, "stderr"),
    combined: createAsyncBashLiveArtifactWriter(workspacePath, jobId, "combined"),
  };
}

function createAsyncBashLiveArtifactWriter(
  workspacePath: string,
  jobId: string,
  stream: keyof AsyncBashJobArtifacts,
): AsyncBashLiveArtifactWriter {
  const date = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `.ambient/tool-outputs/${date}/${stamp}-async-bash-${jobId}-${stream}.txt`;
  const absolutePath = join(workspacePath, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, "", "utf8");
  return {
    path,
    absolutePath,
    bytes: 0,
    totalChars: 0,
    redacted: false,
    redactionCount: 0,
  };
}

function appendLiveArtifact(writer: AsyncBashLiveArtifactWriter, text: string, redactionCount: number): void {
  appendFileSync(writer.absolutePath, text, "utf8");
  writer.bytes += Buffer.byteLength(text, "utf8");
  writer.totalChars += text.length;
  writer.redactionCount += redactionCount;
  if (redactionCount > 0) writer.redacted = true;
}

function artifactsFromLiveWriters(writers: AsyncBashLiveArtifactWriters): AsyncBashJobArtifacts {
  return {
    stdout: artifactFromLiveWriter(writers.stdout),
    stderr: artifactFromLiveWriter(writers.stderr),
    combined: artifactFromLiveWriter(writers.combined),
  };
}

function artifactFromLiveWriter(writer: AsyncBashLiveArtifactWriter): AsyncBashJobArtifact {
  return {
    path: writer.path,
    bytes: writer.bytes,
    totalChars: writer.totalChars,
    redacted: writer.redacted,
  };
}

function appendBoundedText(current: string, text: string, maxChars: number): string {
  const next = `${current}${text}`;
  return next.length <= maxChars ? next : next.slice(-maxChars);
}

function timeoutMessage(job: AsyncBashJobRecord, reason: AsyncBashTimeoutReason): string {
  if (reason === "idle") return `timed out: ${job.timeoutPolicy.idleTimeoutMs}ms without output`;
  if (reason === "max-run") return `timed out: max run ${job.timeoutPolicy.maxRunMs ?? "none"}ms`;
  return `timed out: async artifact output exceeded ${job.artifactByteLimit} bytes`;
}

function takeUtf8Prefix(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (maxBytes <= 0) return { text: "", truncated: text.length > 0 };
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, truncated: false };
  let bytes = 0;
  let end = 0;
  for (const codePoint of text) {
    const nextBytes = Buffer.byteLength(codePoint, "utf8");
    if (bytes + nextBytes > maxBytes) break;
    bytes += nextBytes;
    end += codePoint.length;
  }
  return { text: text.slice(0, end), truncated: true };
}

interface StreamingSensitiveTextRedaction {
  text: string;
  replacementCount: number;
  overflow: boolean;
}

class StreamingSensitiveTextRedactor {
  private carry = "";

  push(text: string, final = false): StreamingSensitiveTextRedaction {
    const combined = `${this.carry}${text}`;
    if (!combined) return { text: "", replacementCount: 0, overflow: false };
    const flushChars = final ? combined.length : streamingRedactionFlushChars(combined);
    const candidate = combined.slice(0, flushChars);
    this.carry = combined.slice(flushChars);
    const overflow = !final && this.carry.length > MAX_STREAM_REDACTION_CARRY_CHARS;
    const overflowNotice = overflow
      ? `\n[REDACTED async output exceeded ${MAX_STREAM_REDACTION_CARRY_CHARS} chars while waiting for a secret boundary; terminating job]\n`
      : "";
    if (overflow) this.carry = this.carry.slice(-STREAM_REDACTION_PREFIX_CARRY_CHARS);
    if (!candidate) return { text: overflowNotice, replacementCount: overflow ? 1 : 0, overflow };
    const redaction = redactSensitiveTextWithMetadata(candidate);
    return {
      text: `${redaction.text}${overflowNotice}`,
      replacementCount: redaction.replacementCount + (overflow ? 1 : 0),
      overflow,
    };
  }
}

function streamingRedactionFlushChars(text: string): number {
  const lastLineBreak = Math.max(text.lastIndexOf("\n"), text.lastIndexOf("\r"));
  const suffixStart = lastLineBreak >= 0 ? lastLineBreak + 1 : 0;
  const suffix = text.slice(suffixStart);
  const exactSecretCarry = Math.min(Math.max(0, registeredSecretRedactionMaxLength() - 1), suffix.length);
  const exactSecretCarryStart = text.length - exactSecretCarry;
  const genericPrefixCarryStart = text.length - Math.min(STREAM_REDACTION_PREFIX_CARRY_CHARS, suffix.length);
  const pendingPatternStart = pendingSecretPatternStart(suffix);
  const patternCarryStart = pendingPatternStart === undefined
    ? genericPrefixCarryStart
    : suffixStart + pendingPatternStart;
  return Math.max(suffixStart, Math.min(exactSecretCarryStart, patternCarryStart));
}

function pendingSecretPatternStart(text: string): number | undefined {
  const patterns = [
    /\bBearer\s+\S*$/i,
    /\b(?:authorization)\s*[:=]\s*["']?\S*$/i,
    /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|pwd|secret|token|credential|auth[_-]?key)\s*[:=]\s*["']?\S*$/i,
    /\b(?:(?:sk|ak|pk|rk|zai|glm)-|ambient-(?!cli-)(?![a-z0-9-]+-v\d+\b))[A-Za-z0-9._-]*$/i,
    /\b(?:gh[pousr]_[A-Za-z0-9_]*|github_pat_[A-Za-z0-9_]*|(?:AKIA|ASIA)[A-Z0-9]*|AIza[A-Za-z0-9_-]*|ya29\.[A-Za-z0-9._-]*|xox[baprs]-[A-Za-z0-9-]*)$/,
  ];
  let start: number | undefined;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (!match) continue;
    start = start === undefined ? match.index : Math.min(start, match.index);
  }
  return start;
}

function pruneJobEvents(job: AsyncBashJobRecord): void {
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

function boundedEvents(events: AsyncBashJobEvent[], maxBytes: number): AsyncBashJobEvent[] {
  if (maxBytes <= 0) return [];
  const output: AsyncBashJobEvent[] = [];
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

function normalizeCwd(workspacePath: string, cwd: string | undefined): string {
  if (!cwd?.trim()) return workspacePath;
  return isAbsolute(cwd) ? cwd : resolve(workspacePath, cwd);
}

function normalizeSeq(value: number | undefined): number {
  if (!Number.isFinite(value ?? 0)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

function normalizePositiveMs(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeArtifactByteLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? DEFAULT_ASYNC_BASH_ARTIFACT_BYTE_LIMIT)) return DEFAULT_ASYNC_BASH_ARTIFACT_BYTE_LIMIT;
  return Math.max(MIN_ASYNC_BASH_ARTIFACT_BYTE_LIMIT, Math.floor(value ?? DEFAULT_ASYNC_BASH_ARTIFACT_BYTE_LIMIT));
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted) throw new Error(message);
}

function signalProcessTree(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === "win32") {
    if (signal === "SIGKILL") killToolProcessTree(pid);
    else {
      try {
        process.kill(pid, signal);
      } catch {
        // Process already exited.
      }
    }
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

function artifactLine(label: string, artifact: AsyncBashJobArtifact | undefined): string | undefined {
  if (!artifact) return undefined;
  const bytes = artifact.bytes === undefined ? "" : ` bytes=${artifact.bytes}`;
  const redacted = artifact.redacted ? " redacted=true" : "";
  return `${label}: ${artifact.path} chars=${artifact.totalChars}${bytes}${redacted}`;
}
