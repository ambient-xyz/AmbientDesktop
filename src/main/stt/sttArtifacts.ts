import { readdir, rm, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import type { SttTranscriptionState } from "../../shared/types";
import { isPathInside } from "../session/sessionPaths";

const MANAGED_STT_ROOT = ".ambient/stt";
const STT_ARTIFACT_EXTENSIONS = new Set([".json", ".txt", ".wav"]);

export interface SttArtifactPathSet {
  threadRoot: string;
  rawAudioPath: string;
  normalizedAudioPath: string;
  transcriptPath: string;
  jsonPath: string;
  relative: {
    threadRoot: string;
    rawAudioPath: string;
    normalizedAudioPath: string;
    transcriptPath: string;
    jsonPath: string;
  };
}

export interface SttArtifactRetentionRequest {
  workspacePath: string;
  threadId: string;
  states: SttTranscriptionState[];
}

export interface SttArtifactRetentionSummary {
  threadId: string;
  rootPath: string;
  managedFileCount: number;
  managedBytes: number;
  referencedFileCount: number;
  referencedBytes: number;
  orphanedFileCount: number;
  orphanedBytes: number;
  referencedPreview: string[];
  orphanedPreview: string[];
}

interface ManagedSttFile {
  relativePath: string;
  absolutePath: string;
  size: number;
}

export function managedSttThreadRoot(workspacePath: string, threadId: string): string {
  const root = resolve(workspacePath, MANAGED_STT_ROOT, safeSttPathSegment(threadId));
  if (!isPathInside(resolve(workspacePath, MANAGED_STT_ROOT), root)) {
    throw new Error("Managed STT thread path escaped the STT directory.");
  }
  return root;
}

export function sttUtteranceArtifactPaths(workspacePath: string, threadId: string, utteranceId: string): SttArtifactPathSet {
  const threadRoot = managedSttThreadRoot(workspacePath, threadId);
  const safeUtteranceId = safeSttPathSegment(utteranceId);
  const rawAudioPath = join(threadRoot, `${safeUtteranceId}.raw.wav`);
  const normalizedAudioPath = join(threadRoot, `${safeUtteranceId}.wav`);
  const transcriptPath = join(threadRoot, `${safeUtteranceId}.txt`);
  const jsonPath = join(threadRoot, `${safeUtteranceId}.json`);
  return {
    threadRoot,
    rawAudioPath,
    normalizedAudioPath,
    transcriptPath,
    jsonPath,
    relative: {
      threadRoot: toWorkspaceRelativePath(workspacePath, threadRoot),
      rawAudioPath: toWorkspaceRelativePath(workspacePath, rawAudioPath),
      normalizedAudioPath: toWorkspaceRelativePath(workspacePath, normalizedAudioPath),
      transcriptPath: toWorkspaceRelativePath(workspacePath, transcriptPath),
      jsonPath: toWorkspaceRelativePath(workspacePath, jsonPath),
    },
  };
}

export function resolveWorkspaceSttAudioPath(workspacePath: string, audioPath: string): string {
  const absolutePath = resolve(workspacePath, audioPath);
  if (!isPathInside(workspacePath, absolutePath)) {
    throw new Error("STT audio path must stay inside the workspace.");
  }
  if (extname(absolutePath).toLowerCase() !== ".wav") {
    throw new Error("STT provider input currently requires a WAV audio file.");
  }
  return absolutePath;
}

export async function inspectSttArtifactRetention(input: SttArtifactRetentionRequest): Promise<SttArtifactRetentionSummary> {
  const workspacePath = resolve(input.workspacePath);
  const threadRoot = managedSttThreadRoot(workspacePath, input.threadId);
  const files = await listManagedSttFiles(threadRoot, workspacePath);
  return summarizeSttArtifacts(input, files);
}

export async function pruneSttArtifactOrphans(input: SttArtifactRetentionRequest): Promise<SttArtifactRetentionSummary & { deletedFileCount: number; deletedBytes: number }> {
  const workspacePath = resolve(input.workspacePath);
  const threadRoot = managedSttThreadRoot(workspacePath, input.threadId);
  const files = await listManagedSttFiles(threadRoot, workspacePath);
  const summary = summarizeSttArtifacts(input, files);
  const orphanedPaths = new Set(summary.orphanedPreview);
  let deletedFileCount = 0;
  let deletedBytes = 0;

  for (const file of files) {
    if (!orphanedPaths.has(file.relativePath)) continue;
    if (!isPathInside(threadRoot, file.absolutePath)) {
      throw new Error("Refusing to prune an STT artifact outside the managed thread directory.");
    }
    await rm(file.absolutePath, { force: true });
    deletedFileCount += 1;
    deletedBytes += file.size;
  }

  return {
    ...summary,
    deletedFileCount,
    deletedBytes,
  };
}

export function safeSttPathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return sanitized || "stt";
}

export function toWorkspaceRelativePath(workspacePath: string, absolutePath: string): string {
  return relative(resolve(workspacePath), resolve(absolutePath)).replace(/\\/g, "/");
}

async function listManagedSttFiles(threadRoot: string, workspacePath: string): Promise<ManagedSttFile[]> {
  try {
    const rootStat = await stat(threadRoot);
    if (!rootStat.isDirectory()) return [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: ManagedSttFile[] = [];
  await walk(threadRoot);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (!isPathInside(threadRoot, absolutePath)) continue;
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || !STT_ARTIFACT_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      const file = await stat(absolutePath);
      files.push({
        absolutePath,
        relativePath: toWorkspaceRelativePath(workspacePath, absolutePath),
        size: file.size,
      });
    }
  }
}

function summarizeSttArtifacts(
  input: SttArtifactRetentionRequest,
  files: ManagedSttFile[],
): SttArtifactRetentionSummary {
  const referencedPaths = new Set<string>();
  for (const state of input.states) {
    addReferencedPath(referencedPaths, state.audioPath);
    addReferencedPath(referencedPaths, state.normalizedAudioPath);
    addReferencedPath(referencedPaths, state.transcriptPath);
    addReferencedPath(referencedPaths, state.jsonPath);
    addReferencedPath(referencedPaths, state.stdoutPath);
    addReferencedPath(referencedPaths, state.stderrPath);
  }

  const referencedFiles = files.filter((file) => referencedPaths.has(file.relativePath));
  const orphanedFiles = files.filter((file) => !referencedPaths.has(file.relativePath));
  return {
    threadId: input.threadId,
    rootPath: `${MANAGED_STT_ROOT}/${safeSttPathSegment(input.threadId)}`,
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

function addReferencedPath(paths: Set<string>, path: string | undefined): void {
  if (!path) return;
  paths.add(path.replace(/\\/g, "/").replace(/^\/+/, ""));
}

function sumBytes(files: ManagedSttFile[]): number {
  return files.reduce((total, file) => total + file.size, 0);
}
