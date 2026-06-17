import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type {
  MiniCpmVisionRuntimeInstallResult,
  MiniCpmVisionRuntimeReleaseManifest,
} from "../../../shared/types";
import { AmbientDownloadService } from "../../ambient/ambientDownloadService";
import { managedInstallWorkspacePath } from "../../managedInstallPaths";
import { installMiniCpmManagedRuntimeFromDownload } from "../../mini-cpm/miniCpmVisionProvider";
import { isPathInside } from "../../session/sessionPaths";
import {
  ambientMemoryEmbeddingModelCachePath,
  ambientMemoryEmbeddingModelProfile,
} from "./managedEmbeddingRuntimeMetadata";
import {
  detectAmbientMemoryEmbeddingAssets,
  type AmbientMemoryEmbeddingAssetDetection,
} from "./managedEmbeddingProvider";

export interface AmbientMemoryEmbeddingModelInstallResult {
  attempted: boolean;
  status: "installed" | "already-installed" | "failed" | "skipped";
  profileId: string;
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

export interface InstallAmbientMemoryEmbeddingAssetsInput {
  workspacePath: string;
  action?: "install" | "repair";
  installModel?: boolean;
  installRuntime?: boolean;
  runtimeArtifactId?: string;
  runtimeManifest?: MiniCpmVisionRuntimeReleaseManifest;
  modelProfile?: AmbientMemoryEmbeddingModelInstallProfile;
  modelDownloadPreResponseTimeoutMs?: number;
  modelDownloadIdleTimeoutMs?: number;
  runtimeDownloadPreResponseTimeoutMs?: number;
  runtimeDownloadIdleTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  downloadService?: AmbientDownloadService;
  runtimeInstaller?: (input: {
    workspacePath: string;
    runtimeArtifactId?: string;
    runtimeManifest?: MiniCpmVisionRuntimeReleaseManifest;
    preResponseTimeoutMs?: number;
    idleTimeoutMs?: number;
    now: () => Date;
    signal?: AbortSignal;
  }) => Promise<MiniCpmVisionRuntimeInstallResult>;
  now?: () => Date;
  signal?: AbortSignal;
}

export interface AmbientMemoryEmbeddingManagedInstallResult {
  schemaVersion: "ambient-memory-embedding-managed-install-result-v1";
  status: "installed" | "already-installed" | "partial" | "failed" | "skipped";
  modelInstall?: AmbientMemoryEmbeddingModelInstallResult;
  runtimeInstall?: MiniCpmVisionRuntimeInstallResult;
  managedAssets: AmbientMemoryEmbeddingAssetDetection;
  nextActions: string[];
}

export interface AmbientMemoryEmbeddingModelInstallProfile {
  id: string;
  repoId: string;
  revision: string;
  filename: string;
  sourceUrl: string;
  sizeBytes: number;
  sha256: string;
}

const MEMORY_EMBEDDING_MODEL_ROOT = ".ambient/memory/tencentdb/embeddings/models";
const activeMemoryEmbeddingModelInstalls = new Map<string, Promise<AmbientMemoryEmbeddingModelInstallResult>>();
const activeMemoryEmbeddingRuntimeInstalls = new Map<string, Promise<MiniCpmVisionRuntimeInstallResult>>();

export async function installAmbientMemoryEmbeddingAssets(
  input: InstallAmbientMemoryEmbeddingAssetsInput,
): Promise<AmbientMemoryEmbeddingManagedInstallResult> {
  throwIfAborted(input.signal);
  const now = input.now ?? (() => new Date());
  const installModel = input.installModel !== false;
  const installRuntime = input.installRuntime !== false;
  const modelInstall = installModel
    ? await installAmbientMemoryEmbeddingModel(input.workspacePath, {
        profile: input.modelProfile,
        fetchImpl: input.fetchImpl,
        downloadService: input.downloadService,
        preResponseTimeoutMs: input.modelDownloadPreResponseTimeoutMs,
        idleTimeoutMs: input.modelDownloadIdleTimeoutMs,
        now,
        signal: input.signal,
      })
    : skippedModelInstall(input.workspacePath, input.modelProfile);
  throwIfAborted(input.signal);

  const runtimeInstall = installRuntime
    ? await installAmbientMemoryEmbeddingRuntime({
        workspacePath: input.workspacePath,
        runtimeArtifactId: input.runtimeArtifactId,
        runtimeManifest: input.runtimeManifest,
        runtimeInstaller: input.runtimeInstaller ?? defaultRuntimeInstaller,
        preResponseTimeoutMs: input.runtimeDownloadPreResponseTimeoutMs,
        idleTimeoutMs: input.runtimeDownloadIdleTimeoutMs,
        now,
        signal: input.signal,
      })
    : undefined;
  throwIfAborted(input.signal);

  const managedAssets = await detectAmbientMemoryEmbeddingAssets(input.workspacePath);
  const status = memoryEmbeddingInstallStatus({ installModel, installRuntime, modelInstall, runtimeInstall, managedAssets });
  return {
    schemaVersion: "ambient-memory-embedding-managed-install-result-v1",
    status,
    modelInstall,
    ...(runtimeInstall ? { runtimeInstall } : {}),
    managedAssets,
    nextActions: memoryEmbeddingInstallNextActions({ status, modelInstall, runtimeInstall, managedAssets }),
  };
}

async function installAmbientMemoryEmbeddingRuntime(input: {
  workspacePath: string;
  runtimeArtifactId?: string;
  runtimeManifest?: MiniCpmVisionRuntimeReleaseManifest;
  runtimeInstaller: NonNullable<InstallAmbientMemoryEmbeddingAssetsInput["runtimeInstaller"]>;
  preResponseTimeoutMs?: number;
  idleTimeoutMs?: number;
  now: () => Date;
  signal?: AbortSignal;
}): Promise<MiniCpmVisionRuntimeInstallResult> {
  const managedRoot = managedInstallWorkspacePath(input.workspacePath);
  const installKey = `${managedRoot}:${input.runtimeArtifactId ?? "default"}`;
  const active = activeMemoryEmbeddingRuntimeInstalls.get(installKey);
  if (active) return active;
  const install = input.runtimeInstaller({
    workspacePath: input.workspacePath,
    runtimeArtifactId: input.runtimeArtifactId,
    runtimeManifest: input.runtimeManifest,
    preResponseTimeoutMs: input.preResponseTimeoutMs,
    idleTimeoutMs: input.idleTimeoutMs,
    now: input.now,
    signal: input.signal,
  });
  activeMemoryEmbeddingRuntimeInstalls.set(installKey, install);
  try {
    return await install;
  } finally {
    if (activeMemoryEmbeddingRuntimeInstalls.get(installKey) === install) {
      activeMemoryEmbeddingRuntimeInstalls.delete(installKey);
    }
  }
}

export async function installAmbientMemoryEmbeddingModel(
  workspacePath: string,
  input: {
    profile?: AmbientMemoryEmbeddingModelInstallProfile;
    fetchImpl?: typeof fetch;
    downloadService?: AmbientDownloadService;
    preResponseTimeoutMs?: number;
    idleTimeoutMs?: number;
    now?: () => Date;
    signal?: AbortSignal;
  } = {},
): Promise<AmbientMemoryEmbeddingModelInstallResult> {
  const profile = input.profile ?? ambientMemoryEmbeddingModelProfile;
  const managedRoot = managedInstallWorkspacePath(workspacePath);
  const cachePath = memoryEmbeddingModelCachePath(managedRoot, profile);
  const installKey = `${profile.sha256}:${cachePath}`;
  const active = activeMemoryEmbeddingModelInstalls.get(installKey);
  if (active) return active;
  const install = installAmbientMemoryEmbeddingModelLocked(workspacePath, {
    ...input,
    profile,
    managedRoot,
    cachePath,
  });
  activeMemoryEmbeddingModelInstalls.set(installKey, install);
  try {
    return await install;
  } finally {
    if (activeMemoryEmbeddingModelInstalls.get(installKey) === install) {
      activeMemoryEmbeddingModelInstalls.delete(installKey);
    }
  }
}

async function installAmbientMemoryEmbeddingModelLocked(
  workspacePath: string,
  input: {
    profile: AmbientMemoryEmbeddingModelInstallProfile;
    managedRoot: string;
    cachePath: string;
    fetchImpl?: typeof fetch;
    downloadService?: AmbientDownloadService;
    preResponseTimeoutMs?: number;
    idleTimeoutMs?: number;
    now?: () => Date;
    signal?: AbortSignal;
  },
): Promise<AmbientMemoryEmbeddingModelInstallResult> {
  const profile = input.profile;
  const now = input.now ?? (() => new Date());
  const managedRoot = input.managedRoot;
  const cachePath = input.cachePath;
  const base = modelInstallBase(profile, cachePath);
  if (!isPathInside(managedRoot, cachePath)) {
    return {
      ...base,
      status: "failed",
      error: "Resolved Agent Memory embedding model cache path is outside Ambient-managed install state.",
    };
  }
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(resolve(managedRoot, MEMORY_EMBEDDING_MODEL_ROOT, ".gitignore"), "*\n", "utf8");
    const existing = await existingMemoryEmbeddingModelInstall(profile, cachePath);
    if (existing) return existing;

    const destinationPath = relative(managedRoot, cachePath);
    const downloadService = input.downloadService ?? new AmbientDownloadService();
    const startedAt = Date.now();
    const job = downloadService.start({
      workspacePath,
      url: profile.sourceUrl,
      destinationKind: "managed-install",
      destinationPath,
      expectedBytes: profile.sizeBytes,
      sha256: profile.sha256,
      fetchImpl: input.fetchImpl,
      preResponseTimeoutMs: input.preResponseTimeoutMs,
      idleTimeoutMs: input.idleTimeoutMs,
      resume: true,
      now,
    });
    const completed = await downloadService.wait(job.jobId, { signal: input.signal });
    if (completed.status !== "completed") {
      throw new Error(completed.error ?? `Agent Memory embedding model download ${completed.status}.`);
    }
    return {
      ...base,
      status: "installed",
      bytes: completed.bytesReceived,
      sha256: completed.computedSha256 ?? profile.sha256,
      downloadStatus: completed.resumed ? "resumed" : "downloaded",
      downloadDurationMs: Date.now() - startedAt,
      missingHints: [],
    };
  } catch (error) {
    return {
      ...base,
      status: "failed",
      error: errorMessage(error),
    };
  }
}

async function defaultRuntimeInstaller(input: {
  workspacePath: string;
  runtimeArtifactId?: string;
  runtimeManifest?: MiniCpmVisionRuntimeReleaseManifest;
  preResponseTimeoutMs?: number;
  idleTimeoutMs?: number;
  now: () => Date;
  signal?: AbortSignal;
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

async function existingMemoryEmbeddingModelInstall(
  profile: AmbientMemoryEmbeddingModelInstallProfile,
  cachePath: string,
): Promise<AmbientMemoryEmbeddingModelInstallResult | undefined> {
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
    ...modelInstallBase(profile, cachePath),
    status: "already-installed",
    bytes: details.size,
    sha256,
    downloadStatus: "reused",
    downloadDurationMs: 0,
    missingHints: [],
  };
}

function memoryEmbeddingInstallStatus(input: {
  installModel: boolean;
  installRuntime: boolean;
  modelInstall: AmbientMemoryEmbeddingModelInstallResult;
  runtimeInstall?: MiniCpmVisionRuntimeInstallResult;
  managedAssets: AmbientMemoryEmbeddingAssetDetection;
}): AmbientMemoryEmbeddingManagedInstallResult["status"] {
  if (!input.installModel && !input.installRuntime) return "skipped";
  if (
    input.modelInstall.status === "failed" ||
    input.runtimeInstall?.status === "failed" ||
    input.runtimeInstall?.status === "unsupported"
  ) {
    return "failed";
  }
  const assetsReady = input.managedAssets.model.status === "present" && input.managedAssets.runtime.status === "present";
  if (!assetsReady) return "partial";
  if (input.modelInstall.status === "installed" || input.runtimeInstall?.status === "installed") return "installed";
  return "already-installed";
}

function memoryEmbeddingInstallNextActions(input: {
  status: AmbientMemoryEmbeddingManagedInstallResult["status"];
  modelInstall: AmbientMemoryEmbeddingModelInstallResult;
  runtimeInstall?: MiniCpmVisionRuntimeInstallResult;
  managedAssets: AmbientMemoryEmbeddingAssetDetection;
}): string[] {
  const actions: string[] = [];
  if (input.managedAssets.model.status !== "present" || input.modelInstall.status === "failed") {
    actions.push(input.modelInstall.error ?? "Retry Agent Memory repair to install the EmbeddingGemma model.");
  }
  if (input.managedAssets.runtime.status !== "present" || input.runtimeInstall?.status === "failed" || input.runtimeInstall?.status === "unsupported") {
    actions.push(input.runtimeInstall?.error ?? input.managedAssets.runtime.reason ?? "Retry Agent Memory repair to install the shared llama.cpp runtime.");
  }
  if (!actions.length && input.status !== "skipped") {
    actions.push("Start Agent Memory embeddings.");
  }
  return actions;
}

function skippedModelInstall(
  workspacePath: string,
  profile: AmbientMemoryEmbeddingModelInstallProfile | undefined,
): AmbientMemoryEmbeddingModelInstallResult {
  const selected = profile ?? ambientMemoryEmbeddingModelProfile;
  return {
    ...modelInstallBase(selected, memoryEmbeddingModelCachePath(managedInstallWorkspacePath(workspacePath), selected)),
    attempted: false,
    status: "skipped",
  };
}

function modelInstallBase(
  profile: AmbientMemoryEmbeddingModelInstallProfile,
  cachePath: string,
): Omit<AmbientMemoryEmbeddingModelInstallResult, "status"> {
  return {
    attempted: true,
    profileId: profile.id,
    filename: profile.filename,
    sourceUrl: profile.sourceUrl,
    cachePath,
    missingHints: modelInstallHints(profile),
  };
}

function memoryEmbeddingModelCachePath(
  managedRoot: string,
  profile: AmbientMemoryEmbeddingModelInstallProfile,
): string {
  if (
    profile.id === ambientMemoryEmbeddingModelProfile.id &&
    profile.repoId === ambientMemoryEmbeddingModelProfile.repoId &&
    profile.revision === ambientMemoryEmbeddingModelProfile.revision &&
    profile.filename === ambientMemoryEmbeddingModelProfile.filename
  ) {
    return ambientMemoryEmbeddingModelCachePath(managedRoot);
  }
  return resolve(managedRoot, MEMORY_EMBEDDING_MODEL_ROOT, sanitizePathSegment(profile.repoId), profile.revision, profile.filename);
}

function modelInstallHints(profile: AmbientMemoryEmbeddingModelInstallProfile): string[] {
  return [
    `Download ${profile.sourceUrl} to the Ambient-managed Agent Memory model cache.`,
    `Expected bytes: ${profile.sizeBytes}; SHA-256: ${profile.sha256}.`,
  ];
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

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "--");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Agent Memory embedding install was canceled.");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
