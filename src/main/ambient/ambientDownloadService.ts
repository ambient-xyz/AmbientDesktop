import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { managedInstallWorkspacePath } from "../managedInstallPaths";
import { isPathInside } from "../session/sessionPaths";

export type AmbientDownloadDestinationKind = "workspace" | "managed-install";
export type AmbientDownloadStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface AmbientDownloadStartInput {
  workspacePath: string;
  url: string;
  destinationPath?: string;
  destinationKind?: AmbientDownloadDestinationKind;
  overwrite?: boolean;
  expectedBytes?: number;
  sha256?: string;
  resume?: boolean;
  preResponseTimeoutMs?: number;
  idleTimeoutMs?: number;
  retryCount?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface AmbientDownloadJobSnapshot {
  schemaVersion: "ambient-managed-download-job-v1";
  jobId: string;
  status: AmbientDownloadStatus;
  url: string;
  destinationKind: AmbientDownloadDestinationKind;
  destinationPath: string;
  absolutePath: string;
  partPath: string;
  bytesReceived: number;
  totalBytes?: number;
  percent?: number;
  speedBytesPerSecond?: number;
  expectedBytes?: number;
  sha256?: string;
  computedSha256?: string;
  resumeEnabled: boolean;
  resumed: boolean;
  attempt: number;
  retryCount: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface AmbientDownloadJob {
  snapshot: AmbientDownloadJobSnapshot;
  controller: AbortController;
  promise: Promise<void>;
}

const DEFAULT_DOWNLOAD_PRE_RESPONSE_TIMEOUT_MS = 60_000;
const DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_DOWNLOAD_RETRY_COUNT = 2;

export class AmbientDownloadService {
  private readonly jobs = new Map<string, AmbientDownloadJob>();

  start(input: AmbientDownloadStartInput): AmbientDownloadJobSnapshot {
    const now = input.now ?? (() => new Date());
    const jobId = randomUUID();
    const destination = resolveDownloadDestination(input.workspacePath, input.url, {
      destinationKind: input.destinationKind,
      destinationPath: input.destinationPath,
    });
    const createdAt = now().toISOString();
    const snapshot: AmbientDownloadJobSnapshot = {
      schemaVersion: "ambient-managed-download-job-v1",
      jobId,
      status: "queued",
      url: input.url,
      destinationKind: destination.kind,
      destinationPath: destination.relativePath,
      absolutePath: destination.absolutePath,
      partPath: `${destination.absolutePath}.part`,
      bytesReceived: 0,
      ...(validPositiveInteger(input.expectedBytes) ? { expectedBytes: Math.floor(input.expectedBytes!), totalBytes: Math.floor(input.expectedBytes!) } : {}),
      ...(input.sha256 ? { sha256: input.sha256.toLowerCase() } : {}),
      resumeEnabled: input.resume !== false,
      resumed: false,
      attempt: 0,
      retryCount: Math.max(0, Math.floor(input.retryCount ?? DEFAULT_DOWNLOAD_RETRY_COUNT)),
      createdAt,
      updatedAt: createdAt,
    };
    const controller = new AbortController();
    const job: AmbientDownloadJob = {
      snapshot,
      controller,
      promise: Promise.resolve(),
    };
    job.promise = this.runJob(job, input, now).catch((error) => {
      if (job.snapshot.status === "canceled") return;
      this.update(job, {
        status: "failed",
        error: errorMessage(error),
        completedAt: now().toISOString(),
      }, now);
    });
    this.jobs.set(jobId, job);
    return cloneSnapshot(snapshot);
  }

  status(jobId: string): AmbientDownloadJobSnapshot {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown Ambient download job: ${jobId}`);
    return cloneSnapshot(job.snapshot);
  }

  async wait(
    jobId: string,
    input: {
      signal?: AbortSignal;
      heartbeatMs?: number;
      onProgress?: (snapshot: AmbientDownloadJobSnapshot) => void;
    } = {},
  ): Promise<AmbientDownloadJobSnapshot> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown Ambient download job: ${jobId}`);
    const heartbeatMs = Math.max(1, Math.floor(input.heartbeatMs ?? 2_000));
    input.onProgress?.(cloneSnapshot(job.snapshot));
    if (isTerminalStatus(job.snapshot.status)) return cloneSnapshot(job.snapshot);
    return await new Promise((resolve, reject) => {
      let settled = false;
      const interval = setInterval(() => {
        input.onProgress?.(cloneSnapshot(job.snapshot));
        if (isTerminalStatus(job.snapshot.status)) settle(() => resolve(cloneSnapshot(job.snapshot)));
      }, heartbeatMs);
      const abort = () => settle(() => reject(input.signal?.reason instanceof Error ? input.signal.reason : new Error("Ambient download wait was canceled.")));
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearInterval(interval);
        input.signal?.removeEventListener("abort", abort);
        callback();
      };
      if (input.signal?.aborted) {
        abort();
        return;
      }
      input.signal?.addEventListener("abort", abort, { once: true });
      job.promise.finally(() => settle(() => resolve(cloneSnapshot(job.snapshot))));
    });
  }

  cancel(jobId: string, now: () => Date = () => new Date()): AmbientDownloadJobSnapshot {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown Ambient download job: ${jobId}`);
    if (!isTerminalStatus(job.snapshot.status)) {
      this.update(job, { status: "canceled", completedAt: now().toISOString() }, now);
      job.controller.abort(new Error(`Ambient download job ${jobId} was canceled.`));
    }
    return cloneSnapshot(job.snapshot);
  }

  cancelAll(): void {
    for (const jobId of this.jobs.keys()) this.cancel(jobId);
  }

  private async runJob(job: AmbientDownloadJob, input: AmbientDownloadStartInput, now: () => Date): Promise<void> {
    validateDownloadUrl(job.snapshot.url);
    await mkdir(dirname(job.snapshot.absolutePath), { recursive: true });
    if (input.overwrite) await rm(job.snapshot.absolutePath, { recursive: true, force: true }).catch(() => undefined);
    if (existsSync(job.snapshot.absolutePath)) {
      throw new Error(`Download destination already exists: ${job.snapshot.destinationPath}. Set overwrite=true or choose another path.`);
    }
    if (!job.snapshot.resumeEnabled) await rm(job.snapshot.partPath, { force: true }).catch(() => undefined);
    const retryCount = job.snapshot.retryCount;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      if (job.snapshot.status === "canceled") return;
      this.update(job, { status: "running", attempt: attempt + 1, error: undefined }, now);
      try {
        await this.downloadAttempt(job, input, now);
        return;
      } catch (error) {
        if (job.controller.signal.aborted) return;
        if (attempt >= retryCount || isAbortError(error)) throw error;
        this.update(job, { error: errorMessage(error) }, now);
        await delay(Math.min(5_000, 500 * (attempt + 1)));
      }
    }
  }

  private async downloadAttempt(job: AmbientDownloadJob, input: AmbientDownloadStartInput, now: () => Date): Promise<void> {
    const fetchImpl = input.fetchImpl ?? fetch;
    let resumeBytes = job.snapshot.resumeEnabled
      ? await existingPartialBytes(job.snapshot.partPath, job.snapshot.expectedBytes)
      : 0;
    let response = await fetchWithPreResponseTimeout(job.snapshot.url, {
      fetchImpl,
      signal: job.controller.signal,
      preResponseTimeoutMs: input.preResponseTimeoutMs,
      rangeStart: resumeBytes > 0 ? resumeBytes : undefined,
    });
    if (resumeBytes > 0 && response.status !== 206) {
      await rm(job.snapshot.partPath, { force: true }).catch(() => undefined);
      resumeBytes = 0;
      response = await fetchWithPreResponseTimeout(job.snapshot.url, {
        fetchImpl,
        signal: job.controller.signal,
        preResponseTimeoutMs: input.preResponseTimeoutMs,
      });
    }
    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status} ${response.statusText}.`);
    if (resumeBytes > 0) validateContentRange(response, resumeBytes, job.snapshot.expectedBytes);
    const contentLength = positiveIntegerFromHeader(response.headers.get("content-length"));
    const totalBytes = job.snapshot.expectedBytes ?? (contentLength ? resumeBytes + contentLength : undefined);
    if (job.snapshot.expectedBytes && contentLength && contentLength !== job.snapshot.expectedBytes - resumeBytes) {
      throw new Error(`Download size mismatch: expected ${job.snapshot.expectedBytes - resumeBytes} response bytes, got ${contentLength}.`);
    }
    if (!response.body) throw new Error("Download response did not include a body.");
    this.update(job, {
      bytesReceived: resumeBytes,
      totalBytes,
      resumed: resumeBytes > 0,
    }, now);
    const reader = response.body.getReader();
    const file = await open(job.snapshot.partPath, resumeBytes > 0 ? "a" : "w");
    const startedAt = Date.now();
    try {
      for (;;) {
        if (job.snapshot.status === "canceled") throw new Error(`Ambient download job ${job.snapshot.jobId} was canceled.`);
        const chunk = await readChunkWithIdleTimeout(reader, {
          signal: job.controller.signal,
          idleTimeoutMs: input.idleTimeoutMs,
        });
        if (chunk.done) break;
        const value = Buffer.from(chunk.value);
        await file.write(value);
        const bytesReceived = job.snapshot.bytesReceived + value.length;
        const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);
        this.update(job, {
          bytesReceived,
          totalBytes,
          speedBytesPerSecond: Math.round(Math.max(0, bytesReceived - resumeBytes) / elapsedSeconds),
        }, now);
      }
    } finally {
      await file.close();
    }
    if (job.snapshot.expectedBytes && job.snapshot.bytesReceived !== job.snapshot.expectedBytes) {
      throw new Error(`Download incomplete: expected ${job.snapshot.expectedBytes} bytes, got ${job.snapshot.bytesReceived}. Partial download was kept for retry.`);
    }
    const computedSha256 = job.snapshot.sha256 ? await sha256File(job.snapshot.partPath) : undefined;
    if (job.snapshot.sha256 && computedSha256 !== job.snapshot.sha256) {
      await rm(job.snapshot.partPath, { force: true }).catch(() => undefined);
      throw new Error(`Download SHA-256 mismatch: expected ${job.snapshot.sha256}, got ${computedSha256}.`);
    }
    await rename(job.snapshot.partPath, job.snapshot.absolutePath);
    this.update(job, {
      status: "completed",
      computedSha256,
      percent: 100,
      completedAt: now().toISOString(),
    }, now);
  }

  private update(job: AmbientDownloadJob, patch: Partial<AmbientDownloadJobSnapshot>, now: () => Date): void {
    const next = {
      ...job.snapshot,
      ...patch,
      updatedAt: now().toISOString(),
    };
    next.percent = progressPercent(next.bytesReceived, next.totalBytes);
    job.snapshot = next;
  }
}

function resolveDownloadDestination(
  workspacePath: string,
  url: string,
  input: { destinationKind?: AmbientDownloadDestinationKind; destinationPath?: string },
): { kind: AmbientDownloadDestinationKind; relativePath: string; absolutePath: string } {
  const kind = input.destinationKind ?? "workspace";
  const root = kind === "managed-install" ? managedInstallWorkspacePath(workspacePath) : workspacePath;
  const relativePath = normalizeRelativeDownloadPath(input.destinationPath ?? defaultDownloadPathFromUrl(url));
  const absolutePath = resolve(root, relativePath);
  if (!isPathInside(root, absolutePath)) throw new Error("Download destination must stay inside the selected Ambient destination root.");
  return { kind, relativePath, absolutePath };
}

function normalizeRelativeDownloadPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Download destination path is required.");
  if (isAbsolute(trimmed)) throw new Error("Download destination path must be relative.");
  const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.split("/").some((part) => part === "..")) {
    throw new Error("Download destination path cannot traverse outside the destination root.");
  }
  return normalized;
}

function defaultDownloadPathFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const name = basename(parsed.pathname) || `download-${Date.now()}`;
    return `.ambient/downloads/${name}`;
  } catch {
    return `.ambient/downloads/download-${Date.now()}`;
  }
}

function validateDownloadUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Ambient managed downloads only support http and https URLs.");
}

async function existingPartialBytes(partPath: string, expectedBytes: number | undefined): Promise<number> {
  try {
    const details = await stat(partPath);
    if (!details.isFile()) {
      await rm(partPath, { recursive: true, force: true }).catch(() => undefined);
      return 0;
    }
    if (details.size <= 0 || (expectedBytes !== undefined && details.size >= expectedBytes)) {
      await rm(partPath, { force: true }).catch(() => undefined);
      return 0;
    }
    return details.size;
  } catch {
    return 0;
  }
}

async function fetchWithPreResponseTimeout(
  url: string,
  input: {
    fetchImpl: typeof fetch;
    signal: AbortSignal;
    preResponseTimeoutMs?: number;
    rangeStart?: number;
  },
): Promise<Response> {
  const timeoutMs = Math.max(1, Math.floor(input.preResponseTimeoutMs ?? DEFAULT_DOWNLOAD_PRE_RESPONSE_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Download did not start within ${timeoutMs}ms.`)), timeoutMs);
  const abort = () => controller.abort(input.signal.reason instanceof Error ? input.signal.reason : new Error("Download was canceled."));
  try {
    if (input.signal.aborted) abort();
    input.signal.addEventListener("abort", abort, { once: true });
    const headers = input.rangeStart && input.rangeStart > 0 ? { Range: `bytes=${input.rangeStart}-` } : undefined;
    return await input.fetchImpl(url, { signal: controller.signal, ...(headers ? { headers } : {}) });
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof Error) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    input.signal.removeEventListener("abort", abort);
  }
}

async function readChunkWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  input: { signal: AbortSignal; idleTimeoutMs?: number },
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const timeoutMs = Math.max(1, Math.floor(input.idleTimeoutMs ?? DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS));
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settle(() => {
        void reader.cancel().catch(() => undefined);
        reject(new Error(`Download stalled after ${timeoutMs}ms without body activity.`));
      });
    }, timeoutMs);
    const abort = () => {
      settle(() => {
        void reader.cancel().catch(() => undefined);
        reject(input.signal.reason instanceof Error ? input.signal.reason : new Error("Download was canceled."));
      });
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      input.signal.removeEventListener("abort", abort);
      callback();
    };
    if (input.signal.aborted) {
      abort();
      return;
    }
    input.signal.addEventListener("abort", abort, { once: true });
    reader.read().then(
      (chunk) => settle(() => resolve(chunk)),
      (error) => settle(() => reject(error)),
    );
  });
}

function validateContentRange(response: Response, resumeBytes: number, expectedBytes: number | undefined): void {
  const contentRange = response.headers.get("content-range");
  if (!contentRange) throw new Error("Download resume response did not include Content-Range.");
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(contentRange.trim());
  if (!match) throw new Error(`Download resume response returned invalid Content-Range: ${contentRange}.`);
  const start = Number(match[1]);
  const total = match[3] === "*" ? undefined : Number(match[3]);
  if (start !== resumeBytes) throw new Error(`Download resume range mismatch: expected start ${resumeBytes}, got ${contentRange}.`);
  if (expectedBytes !== undefined && total !== expectedBytes) {
    throw new Error(`Download resume total mismatch: expected ${expectedBytes}, got ${contentRange}.`);
  }
}

async function sha256File(path: string): Promise<string> {
  return await new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

function progressPercent(bytesReceived: number, totalBytes: number | undefined): number | undefined {
  if (!totalBytes || totalBytes <= 0) return undefined;
  return Math.max(0, Math.min(100, Math.round((bytesReceived / totalBytes) * 100)));
}

function positiveIntegerFromHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function validPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isTerminalStatus(status: AmbientDownloadStatus): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && /cancel|abort/i.test(error.message);
}

function cloneSnapshot(snapshot: AmbientDownloadJobSnapshot): AmbientDownloadJobSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AmbientDownloadJobSnapshot;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
