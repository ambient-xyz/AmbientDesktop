import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type {
  LocalDeepResearchInstallProgress,
  MiniCpmVisionRuntimeInstallResult,
  MiniCpmVisionRuntimeReleaseManifest,
} from "../shared/types";
import { installMiniCpmManagedRuntimeFromDownload } from "./miniCpmVisionProvider";
import {
  detectLocalDeepResearchManagedAssets,
  localDeepResearchModelCachePath,
  type LocalDeepResearchManagedAssetDetection,
} from "./localDeepResearchManagedAssets";
import {
  localDeepResearchProfileById,
  type LocalDeepResearchModelProfile,
  type LocalDeepResearchModelProfileId,
} from "./localDeepResearchModelProfiles";
import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { managedInstallWorkspacePath } from "./managedInstallPaths";
import { isPathInside } from "./sessionPaths";

export interface LocalDeepResearchModelInstallResult {
  attempted: boolean;
  status: "installed" | "already-installed" | "failed" | "skipped";
  profileId: LocalDeepResearchModelProfileId;
  filename: string;
  sourceUrl: string;
  cachePath: string;
  bytes?: number;
  sha256?: string;
  downloadStatus?: "downloaded" | "resumed" | "reused";
  downloadDurationMs?: number;
  error?: string;
  missingHints: string[];
}

export interface LocalDeepResearchInstallRequest {
  workspacePath: string;
  setup: LocalDeepResearchSetupContract;
  action?: "install" | "repair";
  installModel?: boolean;
  installRuntime?: boolean;
  runtimeManifest?: MiniCpmVisionRuntimeReleaseManifest;
  runtimeArtifactId?: string;
  modelDownloadPreResponseTimeoutMs?: number;
  modelDownloadIdleTimeoutMs?: number;
  runtimeDownloadPreResponseTimeoutMs?: number;
  runtimeDownloadIdleTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  runtimeInstaller?: (input: {
    workspacePath: string;
    runtimeArtifactId?: string;
    runtimeManifest?: MiniCpmVisionRuntimeReleaseManifest;
    preResponseTimeoutMs?: number;
    idleTimeoutMs?: number;
    now: () => Date;
    signal?: AbortSignal;
    onProgress?: (progress: LocalDeepResearchInstallProgress) => void;
  }) => Promise<MiniCpmVisionRuntimeInstallResult>;
  onProgress?: (progress: LocalDeepResearchInstallProgress) => void;
  now?: () => Date;
  signal?: AbortSignal;
}

const DEFAULT_MODEL_DOWNLOAD_PRE_RESPONSE_TIMEOUT_MS = 60_000;
const DEFAULT_MODEL_DOWNLOAD_IDLE_TIMEOUT_MS = 60_000;
const MODEL_DOWNLOAD_PROGRESS_INTERVAL_MS = 10_000;
const INSTALL_JOB_ROOT_RELATIVE_PATH = ".ambient/local-deep-research/install-jobs";
const INSTALL_JOB_SCHEMA_VERSION = "ambient-local-deep-research-install-job-v1" as const;

export interface LocalDeepResearchInstallServiceResult {
  schemaVersion: "ambient-local-deep-research-install-result-v1";
  status: "installed" | "already-installed" | "partial" | "failed" | "skipped";
  modelInstall?: LocalDeepResearchModelInstallResult;
  runtimeInstall?: MiniCpmVisionRuntimeInstallResult;
  managedAssets: LocalDeepResearchManagedAssetDetection;
  nextActions: string[];
}

export interface LocalDeepResearchInstallJobRecord {
  schemaVersion: typeof INSTALL_JOB_SCHEMA_VERSION;
  jobId: string;
  action: "install" | "repair";
  status: "running" | "completed" | "failed" | "interrupted";
  processId: number;
  workspacePath: string;
  startedAt: string;
  updatedAt: string;
  profileId: LocalDeepResearchModelProfileId;
  filename: string;
  runtimeArtifactId?: string;
  progress?: LocalDeepResearchInstallProgress;
  result?: LocalDeepResearchInstallServiceResult;
  error?: string;
  nextActions: string[];
}

export async function installLocalDeepResearchManagedAssets(
  input: LocalDeepResearchInstallRequest,
): Promise<LocalDeepResearchInstallServiceResult> {
  throwIfAborted(input.signal);
  const now = input.now ?? (() => new Date());
  const profile = localDeepResearchProfileById(input.setup.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId);
  const installModel = input.installModel !== false;
  const installRuntime = input.installRuntime !== false;
  const runtimeInstaller = input.runtimeInstaller ?? defaultRuntimeInstaller;
  const runtimeArtifactId = input.runtimeArtifactId ?? input.setup.runtime.selectedArtifactId;
  const installJob = await startLocalDeepResearchInstallJob(input.workspacePath, {
    action: input.action ?? "install",
    profile,
    runtimeArtifactId,
    now,
  });
  let latestProgress: LocalDeepResearchInstallProgress | undefined;
  const onProgress = (progress: LocalDeepResearchInstallProgress) => {
    latestProgress = progress;
    input.onProgress?.(progress);
    void updateLocalDeepResearchInstallJobProgress(input.workspacePath, installJob, progress).catch(() => undefined);
  };
  const progressBase = { action: input.action ?? "install", now, onProgress, jobId: installJob.jobId };

  emitProgress(progressBase, {
    component: "setup",
    phase: "preflight",
    status: "running",
    message: "Preparing Local Deep Research managed install.",
    profileId: profile.id,
    filename: profile.filename,
    ...(runtimeArtifactId ? { artifactId: runtimeArtifactId } : {}),
  });
  const modelInstall = installModel
    ? await installLocalDeepResearchModelProfile(input.workspacePath, profile, {
        fetchImpl: input.fetchImpl,
        now,
        signal: input.signal,
        progressAction: progressBase.action,
        onProgress,
        preResponseTimeoutMs: input.modelDownloadPreResponseTimeoutMs,
        idleTimeoutMs: input.modelDownloadIdleTimeoutMs,
      })
    : undefined;
  throwIfAborted(input.signal);
  let runtimeInstall: MiniCpmVisionRuntimeInstallResult | undefined;
  if (installRuntime) {
    emitProgress(progressBase, {
      component: "runtime",
      phase: "runtime-install-started",
      status: "running",
      message: "Installing shared llama.cpp runtime for Local Deep Research.",
      ...(runtimeArtifactId ? { artifactId: runtimeArtifactId } : {}),
    });
    runtimeInstall = await runtimeInstaller({
      workspacePath: input.workspacePath,
      runtimeArtifactId,
      runtimeManifest: input.runtimeManifest,
      preResponseTimeoutMs: input.runtimeDownloadPreResponseTimeoutMs,
      idleTimeoutMs: input.runtimeDownloadIdleTimeoutMs,
      now,
      signal: input.signal,
      onProgress,
    });
    emitProgress(progressBase, {
      component: "runtime",
      phase: runtimeInstall.status === "failed" || runtimeInstall.status === "unsupported" ? "failed" : "runtime-install-completed",
      status: runtimeInstall.status === "failed" || runtimeInstall.status === "unsupported" ? "failed" : "completed",
      message: runtimeInstall.status === "failed" || runtimeInstall.status === "unsupported"
        ? runtimeInstall.error ?? "Shared llama.cpp runtime install did not complete."
        : `Shared llama.cpp runtime ${runtimeInstall.status}.`,
      ...(runtimeInstall.artifactId ? { artifactId: runtimeInstall.artifactId } : {}),
    });
  }
  throwIfAborted(input.signal);

  const managedAssets = await detectLocalDeepResearchManagedAssets(input.workspacePath, {
    selectedProfileId: profile.id,
    runtimeManifest: input.runtimeManifest,
  });
  const installStatus = localDeepResearchInstallStatus({ modelInstall, runtimeInstall, installModel, installRuntime });
  const assetsPresent = managedAssets.model.status === "present" && managedAssets.runtime.status === "present";
  emitProgress(progressBase, {
    component: "validation",
    phase: "validation-ready",
    status: installStatus === "failed" ? "failed" : assetsPresent ? "completed" : "running",
    message: installStatus === "failed"
      ? "Local Deep Research install failed; validation will report remaining asset gaps."
      : assetsPresent
        ? "Local Deep Research managed assets are ready for validation."
        : "Local Deep Research install finished; validation will report remaining asset gaps.",
    profileId: profile.id,
    filename: profile.filename,
    ...(managedAssets.runtime.artifactId ? { artifactId: managedAssets.runtime.artifactId } : {}),
  });
  const result: LocalDeepResearchInstallServiceResult = {
    schemaVersion: "ambient-local-deep-research-install-result-v1",
    status: installStatus,
    ...(modelInstall ? { modelInstall } : {}),
    ...(runtimeInstall ? { runtimeInstall } : {}),
    managedAssets,
    nextActions: localDeepResearchInstallNextActions({ modelInstall, runtimeInstall, managedAssets }),
  };
  await finishLocalDeepResearchInstallJob(input.workspacePath, installJob, result, now, latestProgress);
  return result;
}

export async function readLocalDeepResearchInstallJob(workspacePath?: string): Promise<LocalDeepResearchInstallJobRecord | undefined> {
  try {
    return normalizeLocalDeepResearchInstallJob(JSON.parse(await readFile(localDeepResearchInstallLatestJobPath(workspacePath), "utf8")));
  } catch {
    return undefined;
  }
}

export async function reconcileLocalDeepResearchInstallJob(
  workspacePath?: string,
  options: { now?: () => Date } = {},
): Promise<LocalDeepResearchInstallJobRecord | undefined> {
  const record = await readLocalDeepResearchInstallJob(workspacePath);
  if (!record || record.status !== "running" || record.processId === process.pid) return record;
  const now = options.now ?? (() => new Date());
  const interrupted: LocalDeepResearchInstallJobRecord = {
    ...record,
    status: "interrupted",
    updatedAt: now().toISOString(),
    error: "Ambient Desktop stopped before this Local Deep Research install completed. Retry install or repair; partial downloads will be reused when possible.",
    nextActions: ["Retry Local Deep Research install or repair. Partial model downloads resume from Ambient-managed state."],
  };
  await writeLocalDeepResearchInstallJob(workspacePath, interrupted);
  return interrupted;
}

export function localDeepResearchInstallJobWarnings(record: LocalDeepResearchInstallJobRecord | undefined): string[] {
  if (!record) return [];
  if (record.status === "running") {
    return [`Local Deep Research ${record.action} job ${record.jobId} is running; latest phase: ${record.progress?.phase ?? "preflight"}.`];
  }
  if (record.status === "interrupted") {
    return [record.error ?? `Local Deep Research ${record.action} job ${record.jobId} was interrupted before completion; retry install or repair.`];
  }
  if (record.status === "failed") {
    return [record.error ?? `Local Deep Research ${record.action} job ${record.jobId} failed; retry install or repair after resolving blockers.`];
  }
  return [];
}

export async function installLocalDeepResearchModelProfile(
  workspacePath: string,
  profile: LocalDeepResearchModelProfile,
  options: {
    fetchImpl?: typeof fetch;
    now?: () => Date;
    signal?: AbortSignal;
    progressAction?: "install" | "repair";
    onProgress?: (progress: LocalDeepResearchInstallProgress) => void;
    preResponseTimeoutMs?: number;
    idleTimeoutMs?: number;
  } = {},
): Promise<LocalDeepResearchModelInstallResult> {
  const now = options.now ?? (() => new Date());
  const progressBase = { action: options.progressAction ?? "install", now, onProgress: options.onProgress };
  const managedRoot = managedInstallWorkspacePath(workspacePath);
  const cachePath = localDeepResearchModelCachePath(managedRoot, profile);
  const base = {
    attempted: true,
    profileId: profile.id,
    filename: profile.filename,
    sourceUrl: profile.sourceUrl,
    cachePath,
    missingHints: modelInstallHints(profile),
  };
  if (!isPathInside(managedRoot, cachePath)) {
    return {
      ...base,
      status: "failed",
      error: "Resolved Local Deep Research model cache path is outside Ambient-managed install state.",
    };
  }
  try {
    emitProgress(progressBase, {
      component: "model",
      phase: "model-cache-check",
      status: "running",
      message: `Checking Ambient-managed cache for ${profile.filename}.`,
      profileId: profile.id,
      filename: profile.filename,
      totalBytes: profile.sizeBytes,
      percent: 0,
    });
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(resolve(managedRoot, ".ambient/local-deep-research/models/.gitignore"), "*\n", "utf8");
    const existing = await existingModelInstall(profile, cachePath);
    if (existing) {
      emitProgress(progressBase, {
        component: "model",
        phase: "model-reused",
        status: "completed",
        message: `Reusing verified ${profile.filename} from the Ambient-managed model cache.`,
        profileId: profile.id,
        filename: profile.filename,
        bytesReceived: existing.bytes,
        totalBytes: profile.sizeBytes,
        percent: 100,
      });
      return existing;
    }
    const tempPath = partialModelDownloadPath(cachePath);
    const partialBytes = await existingPartialBytes(tempPath, profile.sizeBytes);
    const startedAt = Date.now();
    let download: Awaited<ReturnType<typeof downloadModelFile>> = { bytes: 0, resumed: false };
    try {
      emitProgress(progressBase, {
        component: "model",
        phase: "model-download-started",
        status: "running",
        message: partialBytes > 0
          ? `Resuming download for ${profile.filename}.`
          : `Downloading ${profile.filename}.`,
        profileId: profile.id,
        filename: profile.filename,
        bytesReceived: partialBytes,
        totalBytes: profile.sizeBytes,
        percent: progressPercent(partialBytes, profile.sizeBytes),
      });
      download = await downloadModelFile(profile, tempPath, {
        fetchImpl: options.fetchImpl ?? fetch,
        signal: options.signal,
        preResponseTimeoutMs: options.preResponseTimeoutMs,
        idleTimeoutMs: options.idleTimeoutMs,
        onProgress: (bytesReceived, totalBytes) => emitProgress(progressBase, {
          component: "model",
          phase: "model-download-progress",
          status: "running",
          message: `Downloading ${profile.filename}.`,
          profileId: profile.id,
          filename: profile.filename,
          bytesReceived,
          totalBytes,
          percent: progressPercent(bytesReceived, totalBytes),
        }),
      });
      const sha256 = await sha256File(tempPath);
      if (sha256 !== profile.sha256) {
        await rm(tempPath, { force: true }).catch(() => undefined);
        throw new Error(`LiteResearcher model SHA-256 mismatch for ${profile.id}: expected ${profile.sha256}, got ${sha256}.`);
      }
      emitProgress(progressBase, {
        component: "model",
        phase: "model-download-verified",
        status: "running",
        message: `Verified SHA-256 for ${profile.filename}.`,
        profileId: profile.id,
        filename: profile.filename,
        bytesReceived: download.bytes,
        totalBytes: profile.sizeBytes,
        percent: 100,
      });
      await rename(tempPath, cachePath);
      emitProgress(progressBase, {
        component: "model",
        phase: "model-installed",
        status: "completed",
        message: `Installed ${profile.filename} into Ambient-managed state.`,
        profileId: profile.id,
        filename: profile.filename,
        bytesReceived: download.bytes,
        totalBytes: profile.sizeBytes,
        percent: 100,
      });
      return {
        ...base,
        status: "installed",
        bytes: download.bytes,
        sha256,
        downloadStatus: download.resumed ? "resumed" : "downloaded",
        downloadDurationMs: Date.now() - startedAt,
        missingHints: [],
      };
    } catch (error) {
      throw error;
    }
  } catch (error) {
    emitProgress(progressBase, {
      component: "model",
      phase: "failed",
      status: "failed",
      message: errorMessage(error),
      profileId: profile.id,
      filename: profile.filename,
    });
    return {
      ...base,
      status: "failed",
      error: errorMessage(error),
    };
  }
}

export function localDeepResearchInstallText(result: LocalDeepResearchInstallServiceResult): string {
  return [
    `Local Deep Research install ${result.status}.`,
    result.modelInstall
      ? `Model ${result.modelInstall.profileId}: ${result.modelInstall.status}${result.modelInstall.bytes ? ` (${result.modelInstall.bytes} bytes)` : ""}.`
      : "Model install: skipped.",
    result.runtimeInstall
      ? `Runtime: ${result.runtimeInstall.status}${result.runtimeInstall.artifactId ? ` (${result.runtimeInstall.artifactId})` : ""}.`
      : "Runtime install: skipped.",
    `Managed model cache: ${result.managedAssets.model.status}.`,
    `Managed runtime cache: ${result.managedAssets.runtime.status}.`,
    ...sectionLines("Next actions", result.nextActions),
  ].join("\n");
}

async function defaultRuntimeInstaller(input: {
  workspacePath: string;
  runtimeArtifactId?: string;
  runtimeManifest?: MiniCpmVisionRuntimeReleaseManifest;
  preResponseTimeoutMs?: number;
  idleTimeoutMs?: number;
  now: () => Date;
  signal?: AbortSignal;
  onProgress?: (progress: LocalDeepResearchInstallProgress) => void;
}): Promise<MiniCpmVisionRuntimeInstallResult> {
  return installMiniCpmManagedRuntimeFromDownload(input.workspacePath, {
    artifactId: input.runtimeArtifactId,
    manifest: input.runtimeManifest,
    now: input.now,
    preResponseTimeoutMs: input.preResponseTimeoutMs,
    idleTimeoutMs: input.idleTimeoutMs,
    signal: input.signal,
  });
}

async function existingModelInstall(
  profile: LocalDeepResearchModelProfile,
  cachePath: string,
): Promise<LocalDeepResearchModelInstallResult | undefined> {
  if (!existsSync(cachePath)) return undefined;
  const details = await stat(cachePath);
  if (!details.isFile()) {
    await rm(cachePath, { recursive: true, force: true });
    return undefined;
  }
  if (details.size !== profile.sizeBytes) {
    await rm(cachePath, { force: true });
    return undefined;
  }
  const sha256 = await sha256File(cachePath);
  if (sha256 !== profile.sha256) {
    await rm(cachePath, { force: true });
    return undefined;
  }
  return {
    attempted: true,
    status: "already-installed",
    profileId: profile.id,
    filename: profile.filename,
    sourceUrl: profile.sourceUrl,
    cachePath,
    bytes: details.size,
    sha256,
    downloadStatus: "reused",
    downloadDurationMs: 0,
    missingHints: [],
  };
}

async function downloadModelFile(
  profile: LocalDeepResearchModelProfile,
  tempPath: string,
  options: {
    fetchImpl: typeof fetch;
    signal?: AbortSignal;
    preResponseTimeoutMs?: number;
    idleTimeoutMs?: number;
    onProgress?: (bytesReceived: number, totalBytes: number) => void;
  },
): Promise<{ bytes: number; resumed: boolean }> {
  throwIfAborted(options.signal);
  let resumeBytes = await existingPartialBytes(tempPath, profile.sizeBytes);
  let response = await fetchModelFileWithPreResponseTimeout(profile, {
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    preResponseTimeoutMs: options.preResponseTimeoutMs,
    rangeStart: resumeBytes > 0 ? resumeBytes : undefined,
  });
  if (resumeBytes > 0 && response.status !== 206) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    resumeBytes = 0;
    response = await fetchModelFileWithPreResponseTimeout(profile, {
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      preResponseTimeoutMs: options.preResponseTimeoutMs,
    });
  }
  if (!response.ok) {
    throw new Error(`LiteResearcher model download failed with HTTP ${response.status} ${response.statusText} for ${profile.filename}.`);
  }
  if (resumeBytes > 0) validatePartialContentRange(profile, response, resumeBytes);
  const contentLength = Number(response.headers.get("content-length") ?? "0") || undefined;
  const expectedResponseBytes = profile.sizeBytes - resumeBytes;
  if (contentLength && contentLength !== expectedResponseBytes) {
    throw new Error(`LiteResearcher model download size mismatch for ${profile.filename}: expected ${expectedResponseBytes}, got ${contentLength}.`);
  }
  if (!response.body) throw new Error(`LiteResearcher model download response did not include a body for ${profile.filename}.`);
  const reader = response.body.getReader();
  const file = await open(tempPath, resumeBytes > 0 ? "a" : "w");
  let bytes = resumeBytes;
  let lastProgressBytes = resumeBytes;
  let lastProgressPercent = progressPercent(resumeBytes, profile.sizeBytes) ?? 0;
  let lastProgressAt = Date.now();
  const progressByteThreshold = Math.max(1, Math.min(32 * 1024 ** 2, Math.floor(profile.sizeBytes / 100)));
  try {
    for (;;) {
      throwIfAborted(options.signal);
      const chunk = await readModelDownloadChunkWithIdleTimeout(reader, profile.filename, {
        signal: options.signal,
        idleTimeoutMs: options.idleTimeoutMs,
      });
      if (chunk.done) break;
      const value = Buffer.from(chunk.value);
      bytes += value.length;
      await file.write(value);
      const percent = progressPercent(bytes, profile.sizeBytes) ?? 0;
      const now = Date.now();
      if (
        bytes === profile.sizeBytes ||
        bytes - lastProgressBytes >= progressByteThreshold ||
        percent > lastProgressPercent ||
        now - lastProgressAt >= MODEL_DOWNLOAD_PROGRESS_INTERVAL_MS
      ) {
        options.onProgress?.(bytes, profile.sizeBytes);
        lastProgressBytes = bytes;
        lastProgressPercent = percent;
        lastProgressAt = now;
      }
    }
  } finally {
    await file.close();
  }
  if (bytes !== profile.sizeBytes) {
    throw new Error(`LiteResearcher model download incomplete for ${profile.filename}: expected ${profile.sizeBytes}, got ${bytes}. Partial download was kept for retry.`);
  }
  return { bytes, resumed: resumeBytes > 0 };
}

function partialModelDownloadPath(cachePath: string): string {
  return `${cachePath}.part`;
}

async function existingPartialBytes(tempPath: string, expectedBytes: number): Promise<number> {
  try {
    const details = await stat(tempPath);
    if (!details.isFile()) {
      await rm(tempPath, { recursive: true, force: true }).catch(() => undefined);
      return 0;
    }
    if (details.size <= 0 || details.size >= expectedBytes) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      return 0;
    }
    return details.size;
  } catch {
    return 0;
  }
}

async function fetchModelFileWithPreResponseTimeout(
  profile: LocalDeepResearchModelProfile,
  input: {
    fetchImpl: typeof fetch;
    signal?: AbortSignal;
    preResponseTimeoutMs?: number;
    rangeStart?: number;
  },
): Promise<Response> {
  const timeoutMs = Math.max(1, Math.floor(input.preResponseTimeoutMs ?? DEFAULT_MODEL_DOWNLOAD_PRE_RESPONSE_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`LiteResearcher model download did not start within ${timeoutMs}ms.`)), timeoutMs);
  const abort = () => controller.abort(input.signal?.reason instanceof Error ? input.signal.reason : new Error("LiteResearcher model download was canceled."));
  try {
    if (input.signal?.aborted) abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    const headers = input.rangeStart && input.rangeStart > 0 ? { Range: `bytes=${input.rangeStart}-` } : undefined;
    return await input.fetchImpl(profile.sourceUrl, { signal: controller.signal, ...(headers ? { headers } : {}) });
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof Error) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abort);
  }
}

async function readModelDownloadChunkWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  filename: string,
  input: { signal?: AbortSignal; idleTimeoutMs?: number },
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const timeoutMs = Math.max(1, Math.floor(input.idleTimeoutMs ?? DEFAULT_MODEL_DOWNLOAD_IDLE_TIMEOUT_MS));
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settle(() => {
        void reader.cancel().catch(() => undefined);
        reject(new Error(`LiteResearcher model download stalled after ${timeoutMs}ms without body activity for ${filename}.`));
      });
    }, timeoutMs);
    const abort = () => {
      settle(() => {
        void reader.cancel().catch(() => undefined);
        reject(input.signal?.reason instanceof Error ? input.signal.reason : new Error("LiteResearcher model download was canceled."));
      });
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", abort);
      callback();
    };
    if (input.signal?.aborted) {
      abort();
      return;
    }
    input.signal?.addEventListener("abort", abort, { once: true });
    reader.read().then(
      (chunk) => settle(() => resolve(chunk)),
      (error) => settle(() => reject(error)),
    );
  });
}

function validatePartialContentRange(
  profile: LocalDeepResearchModelProfile,
  response: Response,
  resumeBytes: number,
): void {
  const contentRange = response.headers.get("content-range");
  if (!contentRange) {
    throw new Error(`LiteResearcher model download resume did not include Content-Range for ${profile.filename}.`);
  }
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(contentRange.trim());
  if (!match) {
    throw new Error(`LiteResearcher model download resume returned invalid Content-Range for ${profile.filename}: ${contentRange}.`);
  }
  const start = Number(match[1]);
  const total = Number(match[3]);
  if (start !== resumeBytes || total !== profile.sizeBytes) {
    throw new Error(
      `LiteResearcher model download resume range mismatch for ${profile.filename}: expected start ${resumeBytes} and total ${profile.sizeBytes}, got ${contentRange}.`,
    );
  }
}

function emitProgress(
  input: {
    action: "install" | "repair";
    now: () => Date;
    jobId?: string;
    onProgress?: (progress: LocalDeepResearchInstallProgress) => void;
  },
  progress: Omit<LocalDeepResearchInstallProgress, "schemaVersion" | "action" | "recordedAt">,
): void {
  input.onProgress?.({
    schemaVersion: "ambient-local-deep-research-install-progress-v1",
    ...(input.jobId ? { jobId: input.jobId } : {}),
    action: input.action,
    recordedAt: input.now().toISOString(),
    ...progress,
  });
}

async function startLocalDeepResearchInstallJob(
  workspacePath: string,
  input: {
    action: "install" | "repair";
    profile: LocalDeepResearchModelProfile;
    runtimeArtifactId?: string;
    now: () => Date;
  },
): Promise<LocalDeepResearchInstallJobRecord> {
  const timestamp = input.now().toISOString();
  const record: LocalDeepResearchInstallJobRecord = {
    schemaVersion: INSTALL_JOB_SCHEMA_VERSION,
    jobId: `ldr-install-${randomUUID()}`,
    action: input.action,
    status: "running",
    processId: process.pid,
    workspacePath,
    startedAt: timestamp,
    updatedAt: timestamp,
    profileId: input.profile.id,
    filename: input.profile.filename,
    ...(input.runtimeArtifactId ? { runtimeArtifactId: input.runtimeArtifactId } : {}),
    nextActions: ["Wait for Local Deep Research managed install progress or retry repair if Ambient exits before completion."],
  };
  await writeLocalDeepResearchInstallJob(workspacePath, record);
  return record;
}

async function updateLocalDeepResearchInstallJobProgress(
  workspacePath: string,
  record: LocalDeepResearchInstallJobRecord,
  progress: LocalDeepResearchInstallProgress,
): Promise<void> {
  await writeLocalDeepResearchInstallJob(workspacePath, {
    ...record,
    status: progress.status === "failed" ? "failed" : "running",
    updatedAt: progress.recordedAt,
    progress,
    ...(progress.status === "failed" ? { error: progress.message } : {}),
    nextActions: progress.status === "failed"
      ? ["Retry Local Deep Research install or repair after resolving the reported error."]
      : record.nextActions,
  });
}

async function finishLocalDeepResearchInstallJob(
  workspacePath: string,
  record: LocalDeepResearchInstallJobRecord,
  result: LocalDeepResearchInstallServiceResult,
  now: () => Date,
  latestProgress?: LocalDeepResearchInstallProgress,
): Promise<void> {
  const failed = result.status === "failed" || result.status === "partial";
  const latest = await readLocalDeepResearchInstallJob(workspacePath).catch(() => undefined);
  await writeLocalDeepResearchInstallJob(workspacePath, {
    ...(latest ?? record),
    status: failed ? "failed" : "completed",
    updatedAt: now().toISOString(),
    ...(latestProgress ? { progress: latestProgress } : {}),
    result,
    ...(failed ? { error: localDeepResearchInstallFailureSummary(result) } : {}),
    nextActions: result.nextActions,
  });
}

async function writeLocalDeepResearchInstallJob(
  workspacePath: string | undefined,
  record: LocalDeepResearchInstallJobRecord,
): Promise<void> {
  const latestPath = localDeepResearchInstallLatestJobPath(workspacePath);
  const historyPath = localDeepResearchInstallHistoryJobPath(workspacePath, record.jobId);
  await mkdir(dirname(latestPath), { recursive: true });
  const json = `${JSON.stringify(record, null, 2)}\n`;
  await Promise.all([
    writeFile(latestPath, json, "utf8"),
    writeFile(historyPath, json, "utf8"),
  ]);
}

function localDeepResearchInstallLatestJobPath(workspacePath: string | undefined): string {
  return resolve(managedInstallWorkspacePath(workspacePath), INSTALL_JOB_ROOT_RELATIVE_PATH, "latest.json");
}

function localDeepResearchInstallHistoryJobPath(workspacePath: string | undefined, jobId: string): string {
  return resolve(managedInstallWorkspacePath(workspacePath), INSTALL_JOB_ROOT_RELATIVE_PATH, `${safeInstallJobId(jobId)}.json`);
}

function safeInstallJobId(jobId: string): string {
  return jobId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 160) || "unknown";
}

function normalizeLocalDeepResearchInstallJob(value: unknown): LocalDeepResearchInstallJobRecord | undefined {
  const record = objectRecord(value);
  const jobId = stringValue(record.jobId);
  const action = record.action === "repair" ? "repair" : record.action === "install" ? "install" : undefined;
  const status = record.status === "completed" || record.status === "failed" || record.status === "interrupted" || record.status === "running"
    ? record.status
    : undefined;
  const startedAt = stringValue(record.startedAt);
  const updatedAt = stringValue(record.updatedAt);
  const workspacePath = stringValue(record.workspacePath);
  const profileId = stringValue(record.profileId);
  const filename = stringValue(record.filename);
  if (!jobId || !action || !status || !startedAt || !updatedAt || !workspacePath || !profileId || !filename) return undefined;
  return {
    schemaVersion: INSTALL_JOB_SCHEMA_VERSION,
    jobId,
    action,
    status,
    processId: typeof record.processId === "number" && Number.isFinite(record.processId) ? Math.floor(record.processId) : -1,
    workspacePath,
    startedAt,
    updatedAt,
    profileId: profileId as LocalDeepResearchModelProfileId,
    filename,
    ...(stringValue(record.runtimeArtifactId) ? { runtimeArtifactId: stringValue(record.runtimeArtifactId) } : {}),
    ...(normalizeProgress(record.progress) ? { progress: normalizeProgress(record.progress)! } : {}),
    ...(objectRecord(record.result).schemaVersion === "ambient-local-deep-research-install-result-v1" ? { result: record.result as LocalDeepResearchInstallServiceResult } : {}),
    ...(stringValue(record.error) ? { error: stringValue(record.error) } : {}),
    nextActions: stringArray(record.nextActions),
  };
}

function normalizeProgress(value: unknown): LocalDeepResearchInstallProgress | undefined {
  const record = objectRecord(value);
  if (record.schemaVersion !== "ambient-local-deep-research-install-progress-v1") return undefined;
  const phase = stringValue(record.phase);
  const component = stringValue(record.component);
  const status = stringValue(record.status);
  const message = stringValue(record.message);
  const action = record.action === "repair" ? "repair" : record.action === "install" ? "install" : undefined;
  const recordedAt = stringValue(record.recordedAt);
  if (!phase || !component || !status || !message || !action || !recordedAt) return undefined;
  return record as unknown as LocalDeepResearchInstallProgress;
}

function localDeepResearchInstallFailureSummary(result: LocalDeepResearchInstallServiceResult): string {
  return result.modelInstall?.error
    ?? result.runtimeInstall?.error
    ?? "Local Deep Research managed install did not complete successfully.";
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function progressPercent(bytesReceived: number, totalBytes: number | undefined): number | undefined {
  if (!totalBytes || totalBytes <= 0) return undefined;
  return Math.max(0, Math.min(100, Math.round((bytesReceived / totalBytes) * 100)));
}

function localDeepResearchInstallStatus(input: {
  modelInstall?: LocalDeepResearchModelInstallResult;
  runtimeInstall?: MiniCpmVisionRuntimeInstallResult;
  installModel: boolean;
  installRuntime: boolean;
}): LocalDeepResearchInstallServiceResult["status"] {
  const statuses = [
    input.installModel ? input.modelInstall?.status : "skipped",
    input.installRuntime ? input.runtimeInstall?.status : "skipped",
  ];
  if (statuses.every((status) => status === "skipped")) return "skipped";
  if (statuses.some((status) => status === "failed" || status === "unsupported" || status === undefined)) return "failed";
  if (statuses.every((status) => status === "already-installed" || status === "skipped")) return "already-installed";
  if (statuses.every((status) => status === "installed" || status === "already-installed" || status === "skipped")) return "installed";
  return "partial";
}

function localDeepResearchInstallNextActions(input: {
  modelInstall?: LocalDeepResearchModelInstallResult;
  runtimeInstall?: MiniCpmVisionRuntimeInstallResult;
  managedAssets: LocalDeepResearchManagedAssetDetection;
}): string[] {
  const actions = [
    ...(input.modelInstall?.missingHints ?? []),
    ...(input.runtimeInstall?.missingHints ?? []),
  ];
  if (input.modelInstall?.status === "failed" && input.modelInstall.error) actions.push(input.modelInstall.error);
  if ((input.runtimeInstall?.status === "failed" || input.runtimeInstall?.status === "unsupported") && input.runtimeInstall.error) actions.push(input.runtimeInstall.error);
  if (input.managedAssets.model.status !== "present") actions.push("Retry Local Deep Research install after resolving the model cache issue.");
  if (input.managedAssets.runtime.status !== "present") actions.push("Retry Local Deep Research install after resolving the shared llama.cpp runtime issue.");
  if (!actions.length) actions.push("Run Local Deep Research setup status, then start a bounded validation research run.");
  return dedupe(actions);
}

function modelInstallHints(profile: LocalDeepResearchModelProfile): string[] {
  return [
    `Download ${profile.filename} from ${basename(profile.repoId)} into the Ambient-managed Local Deep Research model cache.`,
    "Ambient verifies model size and SHA-256 before marking the profile installed.",
  ];
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolveHash(hash.digest("hex"));
    });
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("Local Deep Research install was canceled.");
  error.name = "AbortError";
  throw error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sectionLines(title: string, values: string[]): string[] {
  if (!values.length) return [`${title}: none.`];
  return [`${title}:`, ...values.map((value) => `- ${value}`)];
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
