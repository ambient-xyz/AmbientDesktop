import { stat } from "node:fs/promises";
import { arch as hostArch, platform as hostPlatform } from "node:os";
import { resolve } from "node:path";
import type { MiniCpmVisionRuntimeReleaseManifest } from "../../shared/localRuntimeTypes";
import { managedInstallWorkspacePath } from "../setup/managedInstallPaths";
import { isPathInside } from "../session/sessionPaths";
import { selectLocalLlamaRuntimeArtifact } from "../local-llama/localLlamaRuntimeManifest";
import { miniCpmRuntimeReleaseManifestPrototype } from "../mini-cpm/miniCpmRuntimeManifest";
import {
  localDeepResearchProfileById,
  type LocalDeepResearchModelProfile,
  type LocalDeepResearchModelProfileId,
} from "./localDeepResearchModelProfiles";

const modelCacheRootPath = ".ambient/local-deep-research/models";
const sharedRuntimeCacheRootPath = ".ambient/vision/minicpm-v/runtime";
const sharedRuntimeReceiptName = "ambient-runtime-install.json";

export type LocalDeepResearchModelCacheStatus = "missing" | "present" | "mismatch";
export type LocalDeepResearchRuntimeCacheStatus = "missing" | "present" | "mismatch" | "unsupported";

export interface LocalDeepResearchModelCacheDetection {
  status: LocalDeepResearchModelCacheStatus;
  profileId: LocalDeepResearchModelProfileId;
  filename: string;
  cachePath: string;
  expectedSizeBytes: number;
  expectedSha256: string;
  sizeBytes?: number;
  verification: "not-run" | "size-matched" | "size-mismatch" | "path-invalid";
  reason?: string;
}

export interface LocalDeepResearchRuntimeCacheDetection {
  status: LocalDeepResearchRuntimeCacheStatus;
  source: "shared-llama-cpp-runtime";
  manifestId: string;
  artifactId?: string;
  cacheSubdir?: string;
  binaryPath?: string;
  receiptPath?: string;
  verification: "not-supported" | "binary-present" | "binary-missing" | "path-invalid";
  reason?: string;
}

export interface LocalDeepResearchManagedAssetDetection {
  schemaVersion: "ambient-local-deep-research-managed-assets-v1";
  managedRoot: string;
  model: LocalDeepResearchModelCacheDetection;
  runtime: LocalDeepResearchRuntimeCacheDetection;
  warnings: string[];
}

export interface DetectLocalDeepResearchManagedAssetsInput {
  selectedProfileId?: LocalDeepResearchModelProfileId;
  runtimeManifest?: MiniCpmVisionRuntimeReleaseManifest;
  platform?: string;
  arch?: string;
  env?: NodeJS.ProcessEnv;
}

export async function detectLocalDeepResearchManagedAssets(
  workspacePath: string,
  input: DetectLocalDeepResearchManagedAssetsInput = {},
): Promise<LocalDeepResearchManagedAssetDetection> {
  const profile = localDeepResearchProfileById(input.selectedProfileId ?? "literesearcher-4b-q4-k-m");
  const managedRoot = managedInstallWorkspacePath(workspacePath, input.env);
  const model = await detectModelCache(managedRoot, profile);
  const runtime = await detectSharedRuntimeCache(managedRoot, {
    manifest: input.runtimeManifest ?? miniCpmRuntimeReleaseManifestPrototype,
    platform: input.platform ?? hostPlatform(),
    arch: input.arch ?? hostArch(),
  });
  return {
    schemaVersion: "ambient-local-deep-research-managed-assets-v1",
    managedRoot,
    model,
    runtime,
    warnings: detectionWarnings(model, runtime),
  };
}

export function localDeepResearchModelCachePath(managedRoot: string, profile: LocalDeepResearchModelProfile): string {
  return resolve(managedRoot, modelCacheRootPath, sanitizePathSegment(profile.repoId), profile.revision, profile.filename);
}

async function detectModelCache(managedRoot: string, profile: LocalDeepResearchModelProfile): Promise<LocalDeepResearchModelCacheDetection> {
  const cachePath = localDeepResearchModelCachePath(managedRoot, profile);
  if (!isPathInside(managedRoot, cachePath)) {
    return modelDetection(profile, cachePath, "mismatch", "path-invalid", "Resolved Local Deep Research model cache path is outside Ambient-managed install state.");
  }
  const details = await stat(cachePath).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  });
  if (!details) return modelDetection(profile, cachePath, "missing", "not-run", "Selected LiteResearcher GGUF is not present in the Ambient-managed model cache.");
  if (!details.isFile()) return modelDetection(profile, cachePath, "mismatch", "path-invalid", "Selected LiteResearcher cache path exists but is not a file.");
  if (details.size !== profile.sizeBytes) {
    return modelDetection(profile, cachePath, "mismatch", "size-mismatch", `Selected LiteResearcher GGUF is ${details.size} bytes; expected ${profile.sizeBytes}.`, details.size);
  }
  return modelDetection(profile, cachePath, "present", "size-matched", undefined, details.size);
}

async function detectSharedRuntimeCache(
  managedRoot: string,
  input: { manifest: MiniCpmVisionRuntimeReleaseManifest; platform: string; arch: string },
): Promise<LocalDeepResearchRuntimeCacheDetection> {
  const artifact = selectLocalLlamaRuntimeArtifact(input.manifest.artifacts, {
    platform: input.platform,
    arch: input.arch,
  });
  if (!artifact) {
    return {
      status: "unsupported",
      source: "shared-llama-cpp-runtime",
      manifestId: input.manifest.manifestId,
      verification: "not-supported",
      reason: `No shared llama.cpp runtime artifact is declared for ${input.platform} ${input.arch}.`,
    };
  }
  const installRoot = resolve(managedRoot, sharedRuntimeCacheRootPath, artifact.cacheSubdir);
  const binaryPath = resolve(installRoot, artifact.binaryRelativePath);
  const receiptPath = resolve(installRoot, sharedRuntimeReceiptName);
  const base = {
    source: "shared-llama-cpp-runtime" as const,
    manifestId: input.manifest.manifestId,
    artifactId: artifact.id,
    cacheSubdir: artifact.cacheSubdir,
    binaryPath,
    receiptPath,
  };
  if (!isPathInside(managedRoot, binaryPath) || !isPathInside(managedRoot, receiptPath)) {
    return {
      ...base,
      status: "mismatch",
      verification: "path-invalid",
      reason: "Resolved shared llama.cpp runtime cache path is outside Ambient-managed install state.",
    };
  }
  const details = await stat(binaryPath).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  });
  if (!details) {
    return {
      ...base,
      status: "missing",
      verification: "binary-missing",
      reason: "Shared llama.cpp runtime binary is not present in the Ambient-managed runtime cache.",
    };
  }
  if (!details.isFile()) {
    return {
      ...base,
      status: "mismatch",
      verification: "path-invalid",
      reason: "Shared llama.cpp runtime cache path exists but is not a file.",
    };
  }
  return {
    ...base,
    status: "present",
    verification: "binary-present",
  };
}

function modelDetection(
  profile: LocalDeepResearchModelProfile,
  cachePath: string,
  status: LocalDeepResearchModelCacheStatus,
  verification: LocalDeepResearchModelCacheDetection["verification"],
  reason?: string,
  sizeBytes?: number,
): LocalDeepResearchModelCacheDetection {
  return {
    status,
    profileId: profile.id,
    filename: profile.filename,
    cachePath,
    expectedSizeBytes: profile.sizeBytes,
    expectedSha256: profile.sha256,
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    verification,
    ...(reason ? { reason } : {}),
  };
}

function detectionWarnings(
  model: LocalDeepResearchModelCacheDetection,
  runtime: LocalDeepResearchRuntimeCacheDetection,
): string[] {
  return [
    model.status === "mismatch" ? model.reason : undefined,
    runtime.status === "mismatch" || runtime.status === "unsupported" ? runtime.reason : undefined,
  ].filter((value): value is string => Boolean(value));
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "--");
}

function isErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === code);
}
