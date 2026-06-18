import { readdir, rm, stat } from "node:fs/promises";
import { readdirSync, rmSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import type { MessageVoiceState, VoiceArtifactPruneResult, VoiceArtifactRetentionSummary } from "../../shared/localRuntimeTypes";
import { isPathInside } from "../session/sessionPaths";

const MANAGED_VOICE_ROOT = ".ambient/voice";
const VOICE_AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav"]);

export interface VoiceArtifactRetentionRequest {
  workspacePath: string;
  threadId: string;
  providerCapabilityId?: string;
  voiceStates: MessageVoiceState[];
}

interface ManagedVoiceFile {
  relativePath: string;
  absolutePath: string;
  size: number;
  mtimeMs: number;
}

export async function inspectVoiceArtifactRetention(
  input: VoiceArtifactRetentionRequest,
): Promise<VoiceArtifactRetentionSummary> {
  const workspacePath = resolve(input.workspacePath);
  const threadRoot = managedVoiceThreadRoot(workspacePath, input.threadId);
  const files = await listManagedVoiceFiles(threadRoot, threadRoot, workspacePath);
  return summarizeVoiceArtifacts(input, files);
}

export async function pruneVoiceArtifactOrphans(input: VoiceArtifactRetentionRequest): Promise<VoiceArtifactPruneResult> {
  const workspacePath = resolve(input.workspacePath);
  const threadRoot = managedVoiceThreadRoot(workspacePath, input.threadId);
  const files = await listManagedVoiceFiles(threadRoot, threadRoot, workspacePath);
  const summary = summarizeVoiceArtifacts(input, files);
  const orphanedPaths = new Set(summary.orphanedPreview);
  let deletedFileCount = 0;
  let deletedBytes = 0;
  const deletedPreview: string[] = [];

  for (const file of files) {
    if (!orphanedPaths.has(file.relativePath)) continue;
    if (!isPathInside(threadRoot, file.absolutePath)) {
      throw new Error("Refusing to prune a voice artifact outside the managed thread directory.");
    }
    await rm(file.absolutePath, { force: true });
    deletedFileCount += 1;
    deletedBytes += file.size;
    deletedPreview.push(file.relativePath);
  }

  return {
    ...summary,
    deletedFileCount,
    deletedBytes,
    deletedPreview,
  };
}

export async function clearManagedVoiceArtifacts(workspacePathInput: string): Promise<VoiceArtifactPruneResult> {
  const workspacePath = resolve(workspacePathInput);
  const root = managedVoiceRoot(workspacePath);
  const files = await listManagedVoiceFiles(root, root, workspacePath);
  return deleteManagedVoiceFiles({
    workspacePath,
    root,
    files,
    summaryRootPath: MANAGED_VOICE_ROOT,
  });
}

export function clearManagedVoiceArtifactsSync(workspacePathInput: string): string[] {
  const workspacePath = resolve(workspacePathInput);
  const root = managedVoiceRoot(workspacePath);
  const deletedPaths: string[] = [];
  try {
    const rootStat = statSync(root);
    if (!rootStat.isDirectory()) return deletedPaths;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return deletedPaths;
    throw error;
  }

  walk(root);
  return deletedPaths;

  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (!isPathInside(root, absolutePath)) continue;
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || !VOICE_AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      rmSync(absolutePath, { force: true });
      deletedPaths.push(relative(workspacePath, absolutePath).replace(/\\/g, "/"));
    }
  }
}

export async function pruneManagedVoiceArtifactsToBudget(input: {
  workspacePath: string;
  maxBytes: number;
}): Promise<VoiceArtifactPruneResult> {
  const workspacePath = resolve(input.workspacePath);
  const root = managedVoiceRoot(workspacePath);
  const files = await listManagedVoiceFiles(root, root, workspacePath);
  const managedBytes = sumBytes(files);
  const maxBytes = Math.max(0, Math.floor(input.maxBytes));
  if (managedBytes <= maxBytes) {
    return emptyPruneResult({
      rootPath: MANAGED_VOICE_ROOT,
      managedFileCount: files.length,
      managedBytes,
    });
  }

  let remainingBytes = managedBytes;
  const filesToDelete: ManagedVoiceFile[] = [];
  for (const file of [...files].sort((left, right) => left.mtimeMs - right.mtimeMs || left.relativePath.localeCompare(right.relativePath))) {
    if (remainingBytes <= maxBytes) break;
    filesToDelete.push(file);
    remainingBytes -= file.size;
  }

  return deleteManagedVoiceFiles({
    workspacePath,
    root,
    files: filesToDelete,
    summaryRootPath: MANAGED_VOICE_ROOT,
    managedFileCount: files.length,
    managedBytes,
  });
}

export function managedVoiceRoot(workspacePath: string): string {
  return resolve(workspacePath, MANAGED_VOICE_ROOT);
}

export function managedVoiceThreadRoot(workspacePath: string, threadId: string): string {
  const root = resolve(managedVoiceRoot(workspacePath), safeVoicePathSegment(threadId));
  if (!isPathInside(managedVoiceRoot(workspacePath), root)) {
    throw new Error("Managed voice thread path escaped the voice directory.");
  }
  return root;
}

export function safeVoicePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return sanitized || "voice";
}

async function listManagedVoiceFiles(root: string, safetyRoot: string, workspacePath: string): Promise<ManagedVoiceFile[]> {
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) return [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: ManagedVoiceFile[] = [];
  await walk(root);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (!isPathInside(safetyRoot, absolutePath)) continue;
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || !VOICE_AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      const file = await stat(absolutePath);
      files.push({
        absolutePath,
        relativePath: relative(workspacePath, absolutePath).replace(/\\/g, "/"),
        size: file.size,
        mtimeMs: file.mtimeMs,
      });
    }
  }
}

function summarizeVoiceArtifacts(
  input: VoiceArtifactRetentionRequest,
  files: ManagedVoiceFile[],
): VoiceArtifactRetentionSummary {
  const allReferencedPaths = new Set<string>();
  for (const state of input.voiceStates) {
    if (state.audioPath) allReferencedPaths.add(normalizeVoiceArtifactPath(state.audioPath));
    if (state.lastAudioPath) allReferencedPaths.add(normalizeVoiceArtifactPath(state.lastAudioPath));
  }

  const providerStates = input.providerCapabilityId
    ? input.voiceStates.filter((state) => state.providerCapabilityId === input.providerCapabilityId)
    : input.voiceStates;
  const providerReferencedPaths = new Set<string>();
  for (const state of providerStates) {
    if (state.audioPath) providerReferencedPaths.add(normalizeVoiceArtifactPath(state.audioPath));
    if (state.lastAudioPath) providerReferencedPaths.add(normalizeVoiceArtifactPath(state.lastAudioPath));
  }

  const referencedFiles = files.filter((file) => providerReferencedPaths.has(file.relativePath));
  const orphanedFiles = files.filter((file) => !allReferencedPaths.has(file.relativePath));

  return {
    threadId: input.threadId,
    providerCapabilityId: input.providerCapabilityId,
    rootPath: `${MANAGED_VOICE_ROOT}/${safeVoicePathSegment(input.threadId)}`,
    managedFileCount: files.length,
    managedBytes: sumBytes(files),
    referencedFileCount: referencedFiles.length,
    referencedBytes: sumBytes(referencedFiles),
    orphanedFileCount: orphanedFiles.length,
    orphanedBytes: sumBytes(orphanedFiles),
    referencedPreview: referencedFiles.map((file) => file.relativePath),
    orphanedPreview: orphanedFiles.map((file) => file.relativePath),
  };
}

function normalizeVoiceArtifactPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function sumBytes(files: ManagedVoiceFile[]): number {
  return files.reduce((total, file) => total + file.size, 0);
}

async function deleteManagedVoiceFiles(input: {
  workspacePath: string;
  root: string;
  files: ManagedVoiceFile[];
  summaryRootPath: string;
  managedFileCount?: number;
  managedBytes?: number;
}): Promise<VoiceArtifactPruneResult> {
  let deletedFileCount = 0;
  let deletedBytes = 0;
  const deletedPreview: string[] = [];

  for (const file of input.files) {
    if (!isPathInside(input.root, file.absolutePath)) {
      throw new Error("Refusing to prune a voice artifact outside the managed voice directory.");
    }
    await rm(file.absolutePath, { force: true });
    deletedFileCount += 1;
    deletedBytes += file.size;
    deletedPreview.push(file.relativePath);
  }

  return {
    threadId: "",
    rootPath: input.summaryRootPath,
    managedFileCount: input.managedFileCount ?? input.files.length,
    managedBytes: input.managedBytes ?? sumBytes(input.files),
    referencedFileCount: 0,
    referencedBytes: 0,
    orphanedFileCount: input.files.length,
    orphanedBytes: sumBytes(input.files),
    referencedPreview: [],
    orphanedPreview: input.files.map((file) => file.relativePath),
    deletedFileCount,
    deletedBytes,
    deletedPreview,
  };
}

function emptyPruneResult(input: {
  rootPath: string;
  managedFileCount: number;
  managedBytes: number;
}): VoiceArtifactPruneResult {
  return {
    threadId: "",
    rootPath: input.rootPath,
    managedFileCount: input.managedFileCount,
    managedBytes: input.managedBytes,
    referencedFileCount: 0,
    referencedBytes: 0,
    orphanedFileCount: 0,
    orphanedBytes: 0,
    referencedPreview: [],
    orphanedPreview: [],
    deletedFileCount: 0,
    deletedBytes: 0,
    deletedPreview: [],
  };
}
