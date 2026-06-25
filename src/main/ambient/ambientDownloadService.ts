import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, existsSync, lstatSync } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { managedInstallWorkspacePath } from "./ambientSetupFacade";
import { isPathInside } from "./ambientSessionFacade";
import {
  allowLocalDevUrlEgressFromEnv,
  assertAllowedUrlEgress,
  fetchWithUrlEgressPolicy,
  type UrlEgressResolveHostAddresses,
} from "../security/urlEgressPolicy";

export type AmbientDownloadDestinationKind = "workspace" | "managed-install" | "quarantine";
export type AmbientDownloadStatus = "queued" | "running" | "completed" | "failed" | "canceled";
export type AmbientDownloadIntegrityStatus = "unverified" | "pending-sha256" | "sha256-verified";

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
  allowLocalDevUrlEgress?: boolean;
  resolveEgressHostAddresses?: UrlEgressResolveHostAddresses;
  now?: () => Date;
}

export interface AmbientDownloadJobSnapshot {
  schemaVersion: "ambient-managed-download-job-v1";
  jobId: string;
  status: AmbientDownloadStatus;
  url: string;
  finalUrl?: string;
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
  integrityStatus: AmbientDownloadIntegrityStatus;
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
const QUARANTINE_DESTINATION_PREFIX = ".ambient/download-quarantine";
const MANAGED_DOWNLOAD_STATE_ERROR =
  "Downloads cannot target Ambient-managed package, plugin, or skill state, including Capability Builder packages. Use a typed installer for managed state or destinationKind=quarantine for unsigned assets.";

export class AmbientDownloadService {
  private readonly jobs = new Map<string, AmbientDownloadJob>();

  start(input: AmbientDownloadStartInput): AmbientDownloadJobSnapshot {
    const now = input.now ?? (() => new Date());
    const jobId = randomUUID();
    const requestedDestinationKind = input.destinationKind ?? "workspace";
    if (requestedDestinationKind === "managed-install" && !input.sha256) {
      throw new Error(
        "Managed-install downloads require a trusted sha256 checksum. Use destinationKind=quarantine for unsigned assets.",
      );
    }
    assertAllowedUrlEgress(input.url, managedDownloadUrlEgressPolicy(input.allowLocalDevUrlEgress));
    const destination = resolveDownloadDestination(input.workspacePath, input.url, {
      destinationKind: input.destinationKind,
      destinationPath: input.destinationPath,
    });
    assertDownloadDestinationPolicy(input.workspacePath, destination.kind, destination.absolutePath, `${destination.absolutePath}.part`);
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
      integrityStatus: input.sha256 ? "pending-sha256" : "unverified",
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
    const assertCurrentDestinationPolicy = () =>
      assertDownloadDestinationPolicy(input.workspacePath, job.snapshot.destinationKind, job.snapshot.absolutePath, job.snapshot.partPath);
    validateDownloadUrl(job.snapshot.url);
    assertCurrentDestinationPolicy();
    await mkdir(dirname(job.snapshot.absolutePath), { recursive: true });
    assertCurrentDestinationPolicy();
    if (input.overwrite) {
      assertCurrentDestinationPolicy();
      await rm(job.snapshot.absolutePath, { recursive: true, force: true }).catch(() => undefined);
      assertCurrentDestinationPolicy();
    }
    if (existsSync(job.snapshot.absolutePath)) {
      throw new Error(`Download destination already exists: ${job.snapshot.destinationPath}. Set overwrite=true or choose another path.`);
    }
    const retryCount = job.snapshot.retryCount;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      if (job.snapshot.status === "canceled") return;
      if (!job.snapshot.resumeEnabled) {
        assertCurrentDestinationPolicy();
        await rm(job.snapshot.partPath, { force: true }).catch(() => undefined);
        assertCurrentDestinationPolicy();
      }
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
    const assertCurrentDestinationPolicy = () =>
      assertDownloadDestinationPolicy(input.workspacePath, job.snapshot.destinationKind, job.snapshot.absolutePath, job.snapshot.partPath);
    const fetchImpl = input.fetchImpl ?? fetch;
    assertCurrentDestinationPolicy();
    let resumeBytes = job.snapshot.resumeEnabled
      ? await existingPartialBytes(job.snapshot.partPath, job.snapshot.expectedBytes)
      : 0;
    let fetched = await fetchWithPreResponseTimeout(job.snapshot.url, {
      fetchImpl,
      signal: job.controller.signal,
      preResponseTimeoutMs: input.preResponseTimeoutMs,
      rangeStart: resumeBytes > 0 ? resumeBytes : undefined,
      allowLocalDevUrlEgress: input.allowLocalDevUrlEgress,
      resolveEgressHostAddresses: input.resolveEgressHostAddresses,
    });
    try {
      let response = fetched.response;
      this.update(job, { finalUrl: fetched.finalUrl }, now);
      if (resumeBytes > 0 && response.status !== 206) {
        await fetched.cleanup?.();
        assertCurrentDestinationPolicy();
        await rm(job.snapshot.partPath, { force: true }).catch(() => undefined);
        assertCurrentDestinationPolicy();
        resumeBytes = 0;
        fetched = await fetchWithPreResponseTimeout(job.snapshot.url, {
          fetchImpl,
          signal: job.controller.signal,
          preResponseTimeoutMs: input.preResponseTimeoutMs,
          allowLocalDevUrlEgress: input.allowLocalDevUrlEgress,
          resolveEgressHostAddresses: input.resolveEgressHostAddresses,
        });
        response = fetched.response;
        this.update(job, { finalUrl: fetched.finalUrl }, now);
      }
      if (!response.ok) throw new Error(`Download failed with HTTP ${response.status} ${response.statusText}.`);
      if (resumeBytes > 0) validateContentRange(response, resumeBytes, job.snapshot.expectedBytes);
      assertCurrentDestinationPolicy();
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
      assertCurrentDestinationPolicy();
      const file = await open(job.snapshot.partPath, downloadPartOpenFlags(resumeBytes), 0o600);
      const startedAt = Date.now();
      try {
        assertCurrentDestinationPolicy();
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
    } finally {
      await fetched.cleanup?.();
    }
    if (job.snapshot.expectedBytes && job.snapshot.bytesReceived !== job.snapshot.expectedBytes) {
      throw new Error(`Download incomplete: expected ${job.snapshot.expectedBytes} bytes, got ${job.snapshot.bytesReceived}. Partial download was kept for retry.`);
    }
    assertCurrentDestinationPolicy();
    const computedSha256 = job.snapshot.sha256 ? await sha256File(job.snapshot.partPath) : undefined;
    if (job.snapshot.sha256 && computedSha256 !== job.snapshot.sha256) {
      assertCurrentDestinationPolicy();
      await rm(job.snapshot.partPath, { force: true }).catch(() => undefined);
      throw new Error(`Download SHA-256 mismatch: expected ${job.snapshot.sha256}, got ${computedSha256}.`);
    }
    assertCurrentDestinationPolicy();
    await rename(job.snapshot.partPath, job.snapshot.absolutePath);
    this.update(job, {
      status: "completed",
      computedSha256,
      integrityStatus: job.snapshot.sha256 ? "sha256-verified" : "unverified",
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
  const root =
    kind === "managed-install"
      ? managedInstallWorkspacePath(workspacePath)
      : kind === "quarantine"
        ? resolve(workspacePath, ".ambient", "download-quarantine")
        : workspacePath;
  const normalizedInputPath = normalizeRelativeDownloadPath(input.destinationPath ?? defaultDownloadPathFromUrl(url, kind));
  const normalizedPath = kind === "quarantine" ? quarantineRootRelativeDownloadPath(normalizedInputPath) : normalizedInputPath;
  const relativePath = kind === "quarantine"
    ? `${QUARANTINE_DESTINATION_PREFIX}/${normalizedPath}`
    : normalizedPath;
  const absolutePath = resolve(root, kind === "quarantine" ? normalizedPath : relativePath);
  if (!isPathInside(root, absolutePath)) throw new Error("Download destination must stay inside the selected Ambient destination root.");
  assertDownloadDestinationPolicy(workspacePath, kind, absolutePath, `${absolutePath}.part`);
  return { kind, relativePath, absolutePath };
}

function assertDownloadDestinationPolicy(
  workspacePath: string,
  kind: AmbientDownloadDestinationKind,
  absolutePath: string,
  partPath: string,
): void {
  if (kind === "quarantine") {
    assertQuarantineDestinationHasNoSymlinks(workspacePath, absolutePath, partPath);
    return;
  }
  if (kind === "managed-install") {
    assertManagedInstallDestinationHasNoSymlinks(managedInstallWorkspacePath(workspacePath), absolutePath, partPath);
    if (
      isManagedPackagePluginSkillStatePath(workspacePath, absolutePath) ||
      isManagedPackagePluginSkillParentRootPath(workspacePath, absolutePath)
    ) throw new Error(MANAGED_DOWNLOAD_STATE_ERROR);
    return;
  }
  if (
    isManagedInstallStatePath(workspacePath, absolutePath) ||
    isManagedPackagePluginSkillParentRootPath(workspacePath, absolutePath)
  ) throw new Error(MANAGED_DOWNLOAD_STATE_ERROR);
  assertWorkspaceDestinationHasNoSymlinks(workspacePath, absolutePath, partPath);
}

function assertWorkspaceDestinationHasNoSymlinks(workspacePath: string, absolutePath: string, partPath: string): void {
  const workspaceRoot = resolve(workspacePath);
  const destinationDirectory = dirname(resolve(absolutePath));
  assertNoSymlinkedExistingAncestor(workspaceRoot, destinationDirectory, "Workspace download destination");
  assertExistingDownloadEndpointIsSafe(absolutePath);
  assertExistingDownloadEndpointIsSafe(partPath);
}

function downloadPartOpenFlags(resumeBytes: number): number {
  const baseFlags = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW;
  return resumeBytes > 0 ? baseFlags | constants.O_APPEND : baseFlags | constants.O_EXCL;
}

function assertQuarantineDestinationHasNoSymlinks(workspacePath: string, absolutePath: string, partPath: string): void {
  const workspaceRoot = resolve(workspacePath);
  const destinationDirectory = dirname(resolve(absolutePath));
  assertNoSymlinkedExistingAncestor(workspaceRoot, destinationDirectory, "Quarantine download destination");
  assertExistingDownloadEndpointIsSafe(absolutePath);
  assertExistingDownloadEndpointIsSafe(partPath);
}

function assertManagedInstallDestinationHasNoSymlinks(rootPath: string, absolutePath: string, partPath: string): void {
  const managedRoot = resolve(rootPath);
  const destinationDirectory = dirname(resolve(absolutePath));
  assertNoSymlinkedExistingAncestor(managedRoot, destinationDirectory, "Managed-install download destination");
  assertExistingDownloadEndpointIsSafe(absolutePath);
  assertExistingDownloadEndpointIsSafe(partPath);
}

function isManagedInstallStatePath(workspacePath: string, absolutePath: string): boolean {
  const managedRootBases = Array.from(new Set([managedInstallWorkspacePath(workspacePath), resolve(workspacePath)]));
  const managedStateRoots = managedRootBases.flatMap((root) => [
    resolve(root, ".ambient"),
    resolve(root, ".ambient-codex"),
    resolve(root, ".agents", "plugins"),
    resolve(root, ".agents", "skills"),
    resolve(root, ".codex", "plugins"),
    resolve(root, ".codex", "skills"),
  ]);
  const insideManagedStateRoot =
    managedStateRoots.some((root) => isPathInside(root, absolutePath)) ||
    managedRootBases.some((root) => isManagedStateSegmentPath(root, absolutePath));
  if (!insideManagedStateRoot) return false;
  return !isPlainWorkspaceDownloadPath(workspacePath, absolutePath);
}

const managedStateSegmentPaths = [
  [".ambient"],
  [".ambient-codex"],
  [".agents", "plugins"],
  [".agents", "skills"],
  [".codex", "plugins"],
  [".codex", "skills"],
];

const managedPackagePluginSkillSegmentPaths = [
  [".ambient", "capability-builder"],
  [".ambient", "cli-packages"],
  [".ambient", "pi-packages"],
  [".ambient", "pi-extension-sandboxes"],
  [".ambient", "pi-privileged-installs"],
  [".ambient", "plugins"],
  [".ambient", "skills"],
  [".ambient-codex"],
  [".agents", "plugins"],
  [".agents", "skills"],
  [".codex", "plugins"],
  [".codex", "skills"],
];

function isManagedStateSegmentPath(rootPath: string, absolutePath: string): boolean {
  return isReservedSegmentPath(rootPath, absolutePath, managedStateSegmentPaths);
}

function isManagedPackagePluginSkillStatePath(workspacePath: string, absolutePath: string): boolean {
  const managedRootBases = Array.from(new Set([managedInstallWorkspacePath(workspacePath), resolve(workspacePath)]));
  return managedRootBases.some((root) => isReservedSegmentPath(root, absolutePath, managedPackagePluginSkillSegmentPaths));
}

function isManagedPackagePluginSkillParentRootPath(workspacePath: string, absolutePath: string): boolean {
  const managedRootBases = Array.from(new Set([managedInstallWorkspacePath(workspacePath), resolve(workspacePath)]));
  return managedRootBases.some((root) => isExactReservedSegmentPath(root, absolutePath, [
    [".ambient"],
    [".agents"],
    [".codex"],
  ]));
}

function isReservedSegmentPath(rootPath: string, absolutePath: string, reservedSegmentPaths: string[][]): boolean {
  const relativePath = relative(resolve(rootPath), resolve(absolutePath));
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) return false;
  const segments = relativePath.split(/[\\/]+/).filter(Boolean).map((segment) => segment.toLowerCase());
  return reservedSegmentPaths.some((managedSegments) =>
    managedSegments.every((managedSegment, index) => segments[index] === managedSegment),
  );
}

function isExactReservedSegmentPath(rootPath: string, absolutePath: string, reservedSegmentPaths: string[][]): boolean {
  const relativePath = relative(resolve(rootPath), resolve(absolutePath));
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) return false;
  const segments = relativePath.split(/[\\/]+/).filter(Boolean).map((segment) => segment.toLowerCase());
  return reservedSegmentPaths.some((managedSegments) =>
    segments.length === managedSegments.length &&
    managedSegments.every((managedSegment, index) => segments[index] === managedSegment),
  );
}

function isPlainWorkspaceDownloadPath(workspacePath: string, absolutePath: string): boolean {
  const workspaceRoot = resolve(workspacePath);
  const downloadRoot = resolve(workspaceRoot, ".ambient", "downloads");
  if (!isLexicallyPathInside(downloadRoot, absolutePath)) return false;
  try {
    assertNoSymlinkedExistingAncestor(workspaceRoot, dirname(resolve(absolutePath)));
    assertExistingDownloadEndpointIsSafe(absolutePath);
    assertExistingDownloadEndpointIsSafe(`${absolutePath}.part`);
    return true;
  } catch {
    return false;
  }
}

function isLexicallyPathInside(parentPath: string, childPath: string): boolean {
  const childRelativePath = relative(resolve(parentPath), resolve(childPath));
  return childRelativePath === "" || (!childRelativePath.startsWith("..") && !isAbsolute(childRelativePath));
}

function assertNoSymlinkedExistingAncestor(basePath: string, targetDirectory: string, label = "Download destination"): void {
  const base = resolve(basePath);
  const target = resolve(targetDirectory);
  const relativePath = relative(base, target);
  if (relativePath === "") return;
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`${label} must stay inside the selected root.`);
  }

  let current = base;
  for (const segment of relativePath.split(/[\\/]+/).filter(Boolean)) {
    current = resolve(current, segment);
    const details = lstatExisting(current);
    if (!details) continue;
    if (details.isSymbolicLink()) {
      throw new Error(`${label} cannot use symlinked directories.`);
    }
    if (!details.isDirectory()) {
      throw new Error(`${label} contains a non-directory ancestor.`);
    }
  }
}

function assertExistingDownloadEndpointIsSafe(path: string): void {
  const details = lstatExisting(path);
  if (details?.isSymbolicLink()) throw new Error("Ambient download destination cannot use symlinks.");
  if (details?.isFile() && details.nlink > 1) throw new Error("Ambient download destination cannot use hard-linked files.");
}

function lstatExisting(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function normalizeRelativeDownloadPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Download destination path is required.");
  if (isAbsolute(trimmed)) throw new Error("Download destination path must be relative.");
  const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Download destination path cannot traverse outside the destination root.");
  }
  return normalized;
}

function quarantineRootRelativeDownloadPath(path: string): string {
  if (path === QUARANTINE_DESTINATION_PREFIX) throw new Error("Download destination path cannot target the quarantine root.");
  const prefix = `${QUARANTINE_DESTINATION_PREFIX}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function defaultDownloadPathFromUrl(url: string, kind: AmbientDownloadDestinationKind = "workspace"): string {
  try {
    const parsed = new URL(url);
    const name = basename(parsed.pathname) || `download-${Date.now()}`;
    if (kind === "quarantine") return name;
    return `.ambient/downloads/${name}`;
  } catch {
    if (kind === "quarantine") return `download-${Date.now()}`;
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
    allowLocalDevUrlEgress?: boolean;
    resolveEgressHostAddresses?: UrlEgressResolveHostAddresses;
  },
): Promise<{ response: Response; finalUrl: string; cleanup?: () => Promise<void> }> {
  const timeoutMs = Math.max(1, Math.floor(input.preResponseTimeoutMs ?? DEFAULT_DOWNLOAD_PRE_RESPONSE_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Download did not start within ${timeoutMs}ms.`)), timeoutMs);
  const abort = () => controller.abort(input.signal.reason instanceof Error ? input.signal.reason : new Error("Download was canceled."));
  try {
    if (input.signal.aborted) abort();
    input.signal.addEventListener("abort", abort, { once: true });
    const headers = input.rangeStart && input.rangeStart > 0 ? { Range: `bytes=${input.rangeStart}-` } : undefined;
    return await fetchWithUrlEgressPolicy(url, { signal: controller.signal, ...(headers ? { headers } : {}) }, {
      ...managedDownloadUrlEgressPolicy(input.allowLocalDevUrlEgress),
      fetchImpl: input.fetchImpl,
      resolveHostAddresses: input.resolveEgressHostAddresses,
      dnsTimeoutMs: timeoutMs,
    });
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof Error) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    input.signal.removeEventListener("abort", abort);
  }
}

function managedDownloadUrlEgressPolicy(allowLocalDevUrlEgress: boolean | undefined) {
  return {
    useCase: "managed-download" as const,
    allowLocalDevLoopbackHttp: allowLocalDevUrlEgress ?? allowLocalDevUrlEgressFromEnv(),
  };
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
