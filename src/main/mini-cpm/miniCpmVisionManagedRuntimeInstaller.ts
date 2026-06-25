import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import JSZip from "jszip";
import type { MiniCpmVisionRuntimeInstallResult, MiniCpmVisionRuntimeMacosSecurity, MiniCpmVisionRuntimeReleaseArtifact, MiniCpmVisionRuntimeReleaseManifest, MiniCpmVisionRuntimeReleaseManifestVerification } from "../../shared/localRuntimeTypes";
import { allowLocalDevUrlEgressFromEnv, fetchWithUrlEgressPolicy } from "../security/urlEgressPolicy";
import { localLlamaManagedRuntimeDownloadEligibility, selectLocalLlamaRuntimeArtifact } from "./miniCpmLocalLlamaFacade";
import { miniCpmRuntimeReleaseManifestPrototype, verifyMiniCpmRuntimeReleaseManifest } from "./miniCpmRuntimeManifest";
import { isPathInside } from "./miniCpmSessionFacade";
import { managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "./miniCpmSetupFacade";
import { assessMacosManagedRuntimeSecurity, macosQuarantineStatus } from "./miniCpmVisionManagedRuntimeSecurity";
import { errorMessage } from "./miniCpmVisionProviderValueReaders";

const provider = "minicpm-v" as const;
const packageName = "ambient-minicpm-v-vision";
export const runtimeDownloadRootPath = ".ambient/vision/minicpm-v/runtime";
const runtimeDownloadArchiveRoot = ".downloads";

export async function miniCpmManagedRuntimeWorkspace(workspacePath: string): Promise<string> {
  await migrateWorkspaceManagedInstallPath(workspacePath, runtimeDownloadRootPath);
  return managedInstallWorkspacePath(workspacePath);
}

interface MiniCpmManagedRuntimeDownloadRecord {
  url: string;
  status: "downloaded" | "reused";
  archivePath: string;
  bytes: number;
  durationMs: number;
  preResponseTimeoutMs: number;
  idleTimeoutMs: number;
}

export async function installMiniCpmManagedRuntimeFromDownload(
  workspacePath: string,
  input: {
    artifactId?: string;
    manifest?: MiniCpmVisionRuntimeReleaseManifest;
    now: () => Date;
    preResponseTimeoutMs?: number;
    idleTimeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<MiniCpmVisionRuntimeInstallResult> {
  const manifest = input.manifest ?? miniCpmRuntimeReleaseManifestPrototype;
  const selectedArtifact = selectMiniCpmRuntimeInstallArtifact(manifest, input.artifactId);
  const attemptedBase = {
    attempted: true,
    source: "managed-download" as const,
    ...(selectedArtifact ? { artifactId: selectedArtifact.id, downloadUrl: selectedArtifact.sourceUrl } : {}),
    missingHints: managedRuntimeInstallHints(),
  };
  if (!selectedArtifact) {
    return {
      ...attemptedBase,
      status: "unsupported",
      error: `No pinned MiniCPM-V runtime artifact is declared for ${platform()} ${arch()}.`,
    };
  }
  const downloadCheck = managedRuntimeDownloadEligibility(manifest, selectedArtifact);
  if (downloadCheck) {
    return {
      ...attemptedBase,
      status: "unsupported",
      cacheSubdir: selectedArtifact.cacheSubdir,
      error: downloadCheck,
    };
  }
  try {
    const download = await downloadMiniCpmManagedRuntimeArchive(workspacePath, selectedArtifact, {
      preResponseTimeoutMs: input.preResponseTimeoutMs,
      idleTimeoutMs: input.idleTimeoutMs,
      signal: input.signal,
      now: input.now,
    });
    return await installMiniCpmManagedRuntimeFromArchive(workspacePath, {
      archivePath: download.archivePath,
      artifactId: selectedArtifact.id,
      manifest,
      source: "managed-download",
      download,
      now: input.now,
    });
  } catch (error) {
    return {
      ...attemptedBase,
      status: "failed",
      cacheSubdir: selectedArtifact.cacheSubdir,
      error: errorMessage(error),
    };
  }
}

export async function installMiniCpmManagedRuntimeFromArchive(
  workspacePath: string,
  input: {
    archivePath: string;
    artifactId?: string;
    manifest?: MiniCpmVisionRuntimeReleaseManifest;
    source?: MiniCpmVisionRuntimeInstallResult["source"];
    download?: MiniCpmManagedRuntimeDownloadRecord;
    now: () => Date;
  },
): Promise<MiniCpmVisionRuntimeInstallResult> {
  const manifest = input.manifest ?? miniCpmRuntimeReleaseManifestPrototype;
  const archivePath = resolveRuntimeArchivePath(workspacePath, input.archivePath);
  const selectedArtifact = selectMiniCpmRuntimeInstallArtifact(manifest, input.artifactId);
  const runtimeWorkspacePath = await miniCpmManagedRuntimeWorkspace(workspacePath);
  const source = input.source ?? "local-archive";
  const attemptedBase = {
    attempted: true,
    source,
    ...(selectedArtifact ? { artifactId: selectedArtifact.id } : {}),
    ...(input.download ? downloadInstallFields(input.download) : {}),
    archivePath: source === "managed-download"
      ? toWorkspaceRelativePath(workspacePath, archivePath) ?? basename(archivePath)
      : basename(archivePath),
    missingHints: managedRuntimeInstallHints(),
  };

  if (!selectedArtifact) {
    return {
      ...attemptedBase,
      status: "unsupported",
      error: `No pinned MiniCPM-V runtime artifact is declared for ${platform()} ${arch()}.`,
    };
  }
  if (selectedArtifact.archiveFormat !== "tar.gz" && selectedArtifact.archiveFormat !== "tgz" && selectedArtifact.archiveFormat !== "zip") {
    return {
      ...attemptedBase,
      status: "unsupported",
      artifactId: selectedArtifact.id,
      error: `MiniCPM-V managed runtime archive format is not implemented yet: ${selectedArtifact.archiveFormat}.`,
    };
  }

  let stagingRoot: string | undefined;
  let backupRoot: string | undefined;
  const installRoot = resolve(runtimeWorkspacePath, runtimeDownloadRootPath, selectedArtifact.cacheSubdir);
  const runtimeRoot = resolve(runtimeWorkspacePath, runtimeDownloadRootPath);
  try {
    if (!isPathInside(runtimeWorkspacePath, installRoot) || !isPathInside(runtimeWorkspacePath, runtimeRoot)) {
      throw new Error("Resolved MiniCPM-V runtime install path is outside Ambient-managed install state.");
    }
    const archiveDetails = await stat(archivePath);
    if (!archiveDetails.isFile()) throw new Error(`MiniCPM-V runtime archive is not a file: ${archivePath}`);
    const archiveSha256 = await sha256FileAsync(archivePath);
    const archiveOnlyVerification = verifyMiniCpmRuntimeReleaseManifest({
      manifest,
      platform: selectedArtifact.platform,
      arch: selectedArtifact.arch,
      artifactId: selectedArtifact.id,
      archivePath,
    });
    const archiveCheck = archiveOnlyVerification.checks.find((check) => check.id === "local-archive-checksum");
    if (archiveCheck?.status !== "passed") {
      throw new Error(archiveCheck?.detail ?? "MiniCPM-V runtime archive checksum did not pass.");
    }

    const existingBinaryPath = resolve(installRoot, selectedArtifact.binaryRelativePath);
    if (existsSync(existingBinaryPath)) {
      const existingVerification = verifyMiniCpmRuntimeReleaseManifest({
        manifest,
        platform: selectedArtifact.platform,
        arch: selectedArtifact.arch,
        artifactId: selectedArtifact.id,
        archivePath,
        binaryPath: existingBinaryPath,
      });
      const binaryCheck = existingVerification.checks.find((check) => check.id === "local-binary-checksum");
      if (binaryCheck?.status === "passed") {
        await chmod(existingBinaryPath, 0o755).catch(() => undefined);
        const macosSecurity = assessMacosManagedRuntimeSecurity(existingBinaryPath);
        const receiptPath = resolve(installRoot, "ambient-runtime-install.json");
        const receipt = runtimeInstallReceipt({
          workspacePath: runtimeWorkspacePath,
          status: "already-installed",
          source,
          download: input.download,
          artifact: selectedArtifact,
          archivePath,
          archiveSha256,
          binaryPath: existingBinaryPath,
          binarySha256: existingVerification.verifiedBinarySha256,
          installRoot,
          receiptPath,
          rollback: "not-needed",
          macosSecurity,
          manifestVerification: runtimeInstallManifestVerificationForRecord(runtimeWorkspacePath, existingVerification),
          now: input.now,
        });
        await writeRuntimeInstallReceipt(runtimeWorkspacePath, receiptPath, receipt);
        return {
          ...attemptedBase,
          status: "already-installed",
          artifactId: selectedArtifact.id,
          archiveSha256,
          binaryPath: existingBinaryPath,
          binarySha256: existingVerification.verifiedBinarySha256,
          cacheSubdir: selectedArtifact.cacheSubdir,
          installRoot: toWorkspaceRelativePath(runtimeWorkspacePath, installRoot),
          receiptPath: toWorkspaceRelativePath(runtimeWorkspacePath, receiptPath),
          rollback: "not-needed",
          macosQuarantine: macosSecurity?.quarantineAfter ?? macosQuarantineStatus(existingBinaryPath),
          ...(macosSecurity ? { macosSecurity } : {}),
          manifestVerification: runtimeInstallManifestVerificationForRecord(runtimeWorkspacePath, existingVerification),
          missingHints: [],
        };
      }
    }

    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(join(runtimeRoot, ".gitignore"), "*\n", "utf8");
    const stamp = input.now().toISOString().replace(/[:.]/g, "-");
    stagingRoot = resolve(runtimeRoot, `.staging-${safePathSegment(selectedArtifact.id)}-${stamp}`);
    backupRoot = resolve(runtimeRoot, `.rollback-${safePathSegment(selectedArtifact.id)}-${stamp}`);
    if (!isPathInside(runtimeWorkspacePath, stagingRoot) || !isPathInside(runtimeWorkspacePath, backupRoot)) {
      throw new Error("Resolved MiniCPM-V runtime staging path is outside Ambient-managed install state.");
    }
    await rm(stagingRoot, { recursive: true, force: true });
    await mkdir(stagingRoot, { recursive: true });
    await extractMiniCpmRuntimeArchive(archivePath, stagingRoot, selectedArtifact.archiveFormat, runtimeWorkspacePath);

    const stagedBinaryPath = resolve(stagingRoot, selectedArtifact.binaryRelativePath);
    const installedBinaryPath = resolve(installRoot, selectedArtifact.binaryRelativePath);
    const finalVerification = verifyMiniCpmRuntimeReleaseManifest({
      manifest,
      platform: selectedArtifact.platform,
      arch: selectedArtifact.arch,
      artifactId: selectedArtifact.id,
      archivePath,
      binaryPath: stagedBinaryPath,
    });
    const binaryCheck = finalVerification.checks.find((check) => check.id === "local-binary-checksum");
    if (binaryCheck?.status !== "passed") {
      throw new Error(binaryCheck?.detail ?? "MiniCPM-V extracted runtime binary checksum did not pass.");
    }
    await chmod(stagedBinaryPath, 0o755).catch(() => undefined);

    if (existsSync(installRoot)) {
      await rm(backupRoot, { recursive: true, force: true });
      await rename(installRoot, backupRoot);
    }
    await mkdir(dirname(installRoot), { recursive: true });
    try {
      await rename(stagingRoot, installRoot);
      stagingRoot = undefined;
    } catch (error) {
      if (backupRoot && existsSync(backupRoot) && !existsSync(installRoot)) {
        await rename(backupRoot, installRoot).catch(() => undefined);
      }
      throw error;
    }
    if (backupRoot && existsSync(backupRoot)) {
      await rm(backupRoot, { recursive: true, force: true });
      backupRoot = undefined;
    }

    const installedVerification = verifyMiniCpmRuntimeReleaseManifest({
      manifest,
      platform: selectedArtifact.platform,
      arch: selectedArtifact.arch,
      artifactId: selectedArtifact.id,
      archivePath,
      binaryPath: installedBinaryPath,
    });
    const macosSecurity = assessMacosManagedRuntimeSecurity(installedBinaryPath);
    const receiptPath = resolve(installRoot, "ambient-runtime-install.json");
    const receipt = runtimeInstallReceipt({
      workspacePath: runtimeWorkspacePath,
      status: "installed",
      source,
      download: input.download,
      artifact: selectedArtifact,
      archivePath,
      archiveSha256,
      binaryPath: installedBinaryPath,
      binarySha256: installedVerification.verifiedBinarySha256,
      installRoot,
      receiptPath,
      rollback: "not-needed",
      macosSecurity,
      manifestVerification: runtimeInstallManifestVerificationForRecord(runtimeWorkspacePath, installedVerification),
      now: input.now,
    });
    await writeRuntimeInstallReceipt(runtimeWorkspacePath, receiptPath, receipt);
    return {
      ...attemptedBase,
      status: "installed",
      artifactId: selectedArtifact.id,
      archiveSha256,
      binaryPath: installedBinaryPath,
      binarySha256: installedVerification.verifiedBinarySha256,
      cacheSubdir: selectedArtifact.cacheSubdir,
      installRoot: toWorkspaceRelativePath(runtimeWorkspacePath, installRoot),
      receiptPath: toWorkspaceRelativePath(runtimeWorkspacePath, receiptPath),
      rollback: "not-needed",
      macosQuarantine: macosSecurity?.quarantineAfter ?? macosQuarantineStatus(installedBinaryPath),
      ...(macosSecurity ? { macosSecurity } : {}),
      manifestVerification: runtimeInstallManifestVerificationForRecord(runtimeWorkspacePath, installedVerification),
      missingHints: [],
    };
  } catch (error) {
    let rollback: MiniCpmVisionRuntimeInstallResult["rollback"] = "not-needed";
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    if (backupRoot && existsSync(backupRoot)) {
      if (!existsSync(installRoot)) {
        await rename(backupRoot, installRoot)
          .then(() => {
            rollback = "restored-previous-install";
          })
          .catch(() => {
            rollback = "failed";
          });
      } else {
        await rm(backupRoot, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    return {
      ...attemptedBase,
      status: "failed",
      artifactId: selectedArtifact.id,
      cacheSubdir: selectedArtifact.cacheSubdir,
      installRoot: toWorkspaceRelativePath(runtimeWorkspacePath, installRoot),
      rollback,
      error: errorMessage(error),
    };
  }
}

function resolveRuntimeArchivePath(workspacePath: string, archivePath: string): string {
  return isAbsolute(archivePath) ? resolve(archivePath) : resolve(workspacePath, archivePath);
}

export function selectMiniCpmRuntimeInstallArtifact(
  manifest: MiniCpmVisionRuntimeReleaseManifest,
  artifactId: string | undefined,
): MiniCpmVisionRuntimeReleaseArtifact | undefined {
  return selectLocalLlamaRuntimeArtifact(manifest.artifacts, {
    platform: platform(),
    arch: arch(),
    ...(artifactId ? { artifactId } : {}),
  });
}

function managedRuntimeDownloadEligibility(
  manifest: MiniCpmVisionRuntimeReleaseManifest,
  artifact: MiniCpmVisionRuntimeReleaseArtifact,
): string | undefined {
  return localLlamaManagedRuntimeDownloadEligibility({
    capabilityLabel: "MiniCPM-V",
    manifest,
    artifact,
    platform: platform(),
    arch: arch(),
    extraPolicyBlocker: (candidate) => candidate.platform === "win32"
      ? "MiniCPM-V Windows managed runtime download remains disabled until a real Windows lifecycle smoke passes."
      : undefined,
  });
}

function downloadInstallFields(
  download: MiniCpmManagedRuntimeDownloadRecord,
): Pick<
  MiniCpmVisionRuntimeInstallResult,
  "downloadUrl" | "downloadStatus" | "downloadBytes" | "downloadDurationMs" | "downloadPreResponseTimeoutMs" | "downloadIdleTimeoutMs"
> {
  return {
    downloadUrl: download.url,
    downloadStatus: download.status,
    downloadBytes: download.bytes,
    downloadDurationMs: download.durationMs,
    downloadPreResponseTimeoutMs: download.preResponseTimeoutMs,
    downloadIdleTimeoutMs: download.idleTimeoutMs,
  };
}

async function downloadMiniCpmManagedRuntimeArchive(
  workspacePath: string,
  artifact: MiniCpmVisionRuntimeReleaseArtifact,
  options: {
    preResponseTimeoutMs?: number;
    idleTimeoutMs?: number;
    signal?: AbortSignal;
    now: () => Date;
  },
): Promise<MiniCpmManagedRuntimeDownloadRecord> {
  const preResponseTimeoutMs = Math.max(1000, options.preResponseTimeoutMs ?? 60_000);
  const idleTimeoutMs = Math.max(1000, options.idleTimeoutMs ?? 60_000);
  const runtimeWorkspacePath = await miniCpmManagedRuntimeWorkspace(workspacePath);
  const archiveDir = resolve(runtimeWorkspacePath, runtimeDownloadRootPath, runtimeDownloadArchiveRoot, artifact.cacheSubdir);
  const archivePath = resolve(archiveDir, artifact.archiveName);
  if (!isPathInside(runtimeWorkspacePath, archiveDir) || !isPathInside(runtimeWorkspacePath, archivePath)) {
    throw new Error("Resolved MiniCPM-V runtime download path is outside Ambient-managed install state.");
  }
  await mkdir(archiveDir, { recursive: true });
  await writeFile(resolve(runtimeWorkspacePath, runtimeDownloadRootPath, ".gitignore"), "*\n", "utf8");

  if (existsSync(archivePath)) {
    const existing = verifyMiniCpmRuntimeReleaseManifest({
      manifest: {
        ...miniCpmRuntimeReleaseManifestPrototype,
        artifacts: [artifact],
        blockers: [],
      },
      platform: artifact.platform,
      arch: artifact.arch,
      artifactId: artifact.id,
      archivePath,
    });
    const archiveCheck = existing.checks.find((check) => check.id === "local-archive-checksum");
    if (archiveCheck?.status === "passed") {
      const details = await stat(archivePath);
      return {
        url: artifact.sourceUrl,
        status: "reused",
        archivePath,
        bytes: details.size,
        durationMs: 0,
        preResponseTimeoutMs,
        idleTimeoutMs,
      };
    }
    await rm(archivePath, { force: true });
  }

  const startedAt = Date.now();
  const tempPath = `${archivePath}.download-${options.now().toISOString().replace(/[:.]/g, "-")}`;
  await rm(tempPath, { force: true });
  const fetched = await fetchWithPreResponseTimeout(artifact.sourceUrl, {
    preResponseTimeoutMs,
    signal: options.signal,
  });
  let bytes = 0;
  try {
    const response = fetched.response;
    if (!response.ok) {
      throw new Error(`MiniCPM-V runtime download failed with HTTP ${response.status} ${response.statusText} for ${artifact.archiveName}.`);
    }
    const expectedSize = artifact.archiveSizeBytes;
    const contentLength = Number(response.headers.get("content-length") ?? "0") || undefined;
    if (expectedSize && contentLength && contentLength !== expectedSize) {
      throw new Error(`MiniCPM-V runtime download size mismatch for ${artifact.archiveName}: expected ${expectedSize}, got ${contentLength}.`);
    }
    bytes = await writeResponseBodyWithIdleTimeout(response, tempPath, {
      idleTimeoutMs,
      signal: options.signal,
      expectedSize,
      artifactName: artifact.archiveName,
    });
    const actualSha256 = await sha256FileAsync(tempPath);
    if (actualSha256 !== artifact.archiveSha256) {
      throw new Error(`MiniCPM-V runtime download SHA-256 mismatch for ${artifact.id}: expected ${artifact.archiveSha256}, got ${actualSha256}.`);
    }
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await fetched.cleanup?.();
  }
  await rename(tempPath, archivePath);
  return {
    url: artifact.sourceUrl,
    status: "downloaded",
    archivePath,
    bytes,
    durationMs: Date.now() - startedAt,
    preResponseTimeoutMs,
    idleTimeoutMs,
  };
}

async function fetchWithPreResponseTimeout(
  url: string,
  options: { preResponseTimeoutMs: number; signal?: AbortSignal },
): Promise<{ response: Response; finalUrl: string; cleanup?: () => Promise<void> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.preResponseTimeoutMs);
  const abort = () => controller.abort();
  try {
    throwIfAborted(options.signal);
    options.signal?.addEventListener("abort", abort, { once: true });
    return await fetchWithUrlEgressPolicy(url, { signal: controller.signal }, {
      useCase: "managed-download",
      allowLocalDevLoopbackHttp: allowLocalDevUrlEgressFromEnv(),
      dnsTimeoutMs: options.preResponseTimeoutMs,
    });
  } catch (error) {
    if (options.signal?.aborted) throw new Error("MiniCPM-V runtime download was canceled.");
    if ((error instanceof Error && error.name === "AbortError") || controller.signal.aborted) {
      throw new Error(`MiniCPM-V runtime download did not start within ${options.preResponseTimeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

async function writeResponseBodyWithIdleTimeout(
  response: Response,
  path: string,
  options: {
    idleTimeoutMs: number;
    signal?: AbortSignal;
    expectedSize?: number;
    artifactName: string;
  },
): Promise<number> {
  if (!response.body) throw new Error(`MiniCPM-V runtime download response did not include a body for ${options.artifactName}.`);
  const file = await open(path, "w");
  const reader = response.body.getReader();
  let bytes = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let idleExpired = false;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleExpired = true;
      void reader.cancel("idle-timeout").catch(() => undefined);
    }, options.idleTimeoutMs);
  };
  const abort = () => {
    void reader.cancel("aborted").catch(() => undefined);
  };
  try {
    throwIfAborted(options.signal);
    options.signal?.addEventListener("abort", abort, { once: true });
    resetIdleTimer();
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (idleExpired) throw new Error(`MiniCPM-V runtime download stalled after ${options.idleTimeoutMs} ms without body activity.`);
        throw error;
      }
      if (idleExpired) throw new Error(`MiniCPM-V runtime download stalled after ${options.idleTimeoutMs} ms without body activity.`);
      throwIfAborted(options.signal);
      if (chunk.done) break;
      resetIdleTimer();
      const value = Buffer.from(chunk.value);
      bytes += value.length;
      await file.write(value);
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    options.signal?.removeEventListener("abort", abort);
    await file.close();
  }
  if (options.expectedSize && bytes !== options.expectedSize) {
    throw new Error(`MiniCPM-V runtime download size mismatch for ${options.artifactName}: expected ${options.expectedSize}, got ${bytes}.`);
  }
  return bytes;
}

async function sha256FileAsync(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function extractMiniCpmRuntimeArchive(
  archivePath: string,
  stagingRoot: string,
  archiveFormat: MiniCpmVisionRuntimeReleaseArtifact["archiveFormat"],
  workspacePath: string,
): Promise<void> {
  if (archiveFormat === "tar.gz" || archiveFormat === "tgz") {
    const extract = spawnSync("tar", ["-xzf", archivePath, "-C", stagingRoot], { encoding: "utf8", timeout: 120_000 });
    if (extract.error) throw new Error(`MiniCPM-V runtime archive extraction failed: ${extract.error.message}`);
    if (extract.status !== 0) {
      const detail = [extract.stderr?.trim(), extract.stdout?.trim()].filter(Boolean).join("\n");
      throw new Error(`MiniCPM-V runtime archive extraction failed${detail ? `: ${detail}` : "."}`);
    }
    return;
  }
  if (archiveFormat === "zip") {
    await extractMiniCpmRuntimeZip(archivePath, stagingRoot, workspacePath);
    return;
  }
  throw new Error(`MiniCPM-V managed runtime archive format is not implemented yet: ${archiveFormat}.`);
}

async function extractMiniCpmRuntimeZip(archivePath: string, stagingRoot: string, workspacePath: string): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(archivePath));
  const entries = Object.values(zip.files);
  if (entries.length > 500) throw new Error(`MiniCPM-V runtime zip has too many entries: ${entries.length}.`);
  for (const entry of entries) {
    const unsafeOriginalName = (entry as { unsafeOriginalName?: unknown }).unsafeOriginalName;
    const entryName = (typeof unsafeOriginalName === "string" ? unsafeOriginalName : entry.name).replace(/\\/g, "/");
    const normalizedEntryName = entryName.replace(/\/+$/g, "");
    if (
      !normalizedEntryName ||
      normalizedEntryName.startsWith("/") ||
      /^[A-Za-z]:/.test(normalizedEntryName) ||
      normalizedEntryName.split("/").includes("..")
    ) {
      throw new Error(`MiniCPM-V runtime zip contains an unsafe entry path: ${entryName}`);
    }
    const destination = resolve(stagingRoot, normalizedEntryName);
    if (!isPathInside(workspacePath, destination) || !isPathInside(stagingRoot, destination)) {
      throw new Error(`MiniCPM-V runtime zip entry resolves outside the managed runtime cache: ${entryName}`);
    }
    if (entry.dir) {
      await mkdir(destination, { recursive: true });
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    const bytes = await entry.async("nodebuffer");
    await writeFile(destination, bytes);
  }
}

function runtimeInstallReceipt(input: {
  workspacePath: string;
  status: "installed" | "already-installed";
  source: MiniCpmVisionRuntimeInstallResult["source"];
  download?: MiniCpmManagedRuntimeDownloadRecord;
  artifact: MiniCpmVisionRuntimeReleaseArtifact;
  archivePath: string;
  archiveSha256: string;
  binaryPath: string;
  binarySha256?: string;
  installRoot: string;
  receiptPath: string;
  rollback: MiniCpmVisionRuntimeInstallResult["rollback"];
  macosSecurity?: MiniCpmVisionRuntimeMacosSecurity;
  manifestVerification: MiniCpmVisionRuntimeReleaseManifestVerification;
  now: () => Date;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-minicpm-v-runtime-install-receipt-v1",
    provider,
    packageName,
    status: input.status,
    source: input.source,
    installedAt: input.now().toISOString(),
    artifactId: input.artifact.id,
    releaseTag: input.artifact.releaseTag,
    sourceUrl: input.artifact.sourceUrl,
    archiveName: input.artifact.archiveName,
    archivePath: input.source === "managed-download"
      ? workspaceRelativeArtifactPath(input.workspacePath, input.archivePath) ?? basename(input.archivePath)
      : basename(input.archivePath),
    archiveSha256: input.archiveSha256,
    ...(input.download
      ? {
          download: {
            url: input.download.url,
            status: input.download.status,
            bytes: input.download.bytes,
            durationMs: input.download.durationMs,
            preResponseTimeoutMs: input.download.preResponseTimeoutMs,
            idleTimeoutMs: input.download.idleTimeoutMs,
          },
        }
      : {}),
    binaryRelativePath: input.artifact.binaryRelativePath,
    binaryPath: workspaceRelativeArtifactPath(input.workspacePath, input.binaryPath) ?? basename(input.binaryPath),
    binarySha256: input.binarySha256,
    installRoot: workspaceRelativeArtifactPath(input.workspacePath, input.installRoot) ?? input.installRoot,
    cacheSubdir: input.artifact.cacheSubdir,
    rollback: input.rollback,
    macosQuarantine: input.macosSecurity?.quarantineAfter ?? macosQuarantineStatus(input.binaryPath),
    ...(input.macosSecurity ? { macosSecurity: input.macosSecurity } : {}),
    ownership: {
      runtimeCacheRoot: runtimeDownloadRootPath,
      ambientOwned: true,
      userManagedRuntimesPreserved: true,
      modelCachesPreserved: true,
    },
    manifestVerification: input.manifestVerification,
  };
}

function runtimeInstallManifestVerificationForRecord(
  workspacePath: string,
  verification: MiniCpmVisionRuntimeReleaseManifestVerification,
): MiniCpmVisionRuntimeReleaseManifestVerification {
  return {
    ...verification,
    ...(verification.verifiedArchivePath ? { verifiedArchivePath: basename(verification.verifiedArchivePath) } : {}),
    ...(verification.verifiedBinaryPath
      ? { verifiedBinaryPath: workspaceRelativeArtifactPath(workspacePath, verification.verifiedBinaryPath) ?? basename(verification.verifiedBinaryPath) }
      : {}),
  };
}

async function writeRuntimeInstallReceipt(workspacePath: string, receiptPath: string, receipt: Record<string, unknown>): Promise<void> {
  if (!isPathInside(workspacePath, receiptPath)) throw new Error("Resolved MiniCPM-V runtime install receipt path is outside the workspace.");
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

function managedRuntimeInstallHints(): string[] {
  return [
    "Use the default managed MiniCPM-V runtime download on macOS arm64/Linux x64, or provide a pinned llama.cpp b9122 archive for the current platform lane.",
    "Ambient verifies the archive SHA-256 and extracted llama-server SHA-256 before binding the runtime.",
    "Windows default download remains disabled until separate Windows runtime evidence is supplied.",
  ];
}

function workspaceRelativeArtifactPath(workspacePath: string, artifactPath: string): string | undefined {
  const resolved = isAbsolute(artifactPath) ? resolve(artifactPath) : resolve(workspacePath, artifactPath);
  if (!isPathInside(workspacePath, resolved)) return undefined;
  return toWorkspaceRelativePath(workspacePath, resolved);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw abortError();
}

function abortError(): Error {
  const error = new Error("MiniCPM-V provider setup was canceled before activation.");
  error.name = "AbortError";
  return error;
}

function toWorkspaceRelativePath(workspacePath: string, absolutePath: string): string {
  return relative(resolve(workspacePath), resolve(absolutePath)).split(sep).join("/");
}

function safePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return sanitized || "image";
}
