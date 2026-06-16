import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { constants as fsConstants, existsSync, realpathSync, rmSync } from "node:fs";
import { copyFile, lstat, open, readdir, realpath, rm, stat } from "node:fs/promises";
import { basename, extname, join, parse, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type {
  FileTreeEntry,
  WorkspaceDiff,
  WorkspaceDiffCategory,
  WorkspaceDiffFile,
  WorkspaceContextReference,
  WorkspaceFileContent,
  WorkspaceFilePreviewKind,
  WorkspaceFileTree,
  OfficePreview,
} from "../shared/types";
import { officeMimeTypeForExtension } from "./officeFileSupport";
import { extractOfficeText } from "./officeTextExtraction";
import { extractPdfText } from "./pdfTextExtraction";
import { isPathInside } from "./sessionPaths";
import {
  NOFOLLOW_OPEN_FLAG,
  type WorkspacePathAuthorityOptions,
  prepareWorkspaceAbsolutePathForWrite,
  prepareWorkspaceDirectoryForCreate,
  prepareWorkspacePathForDelete,
  prepareWorkspacePathForWrite,
  resolveWorkspaceAbsolutePathForRead,
  resolveWorkspacePathForRead,
  resolveWorkspacePathLexical,
} from "./workspacePathResolver";

const execFileAsync = promisify(execFile);
const MAX_TREE_ENTRIES = 700;
const MAX_TREE_DEPTH = 6;
const MAX_DIFF_CHARS = 120_000;
const MAX_FILE_READ_BYTES = 300_000;
const MAX_BINARY_PREVIEW_BYTES = 8_000_000;
const MAX_OFFICE_EXTRACTED_CHARS = 500_000;
const MAX_PDF_EXTRACTED_CHARS = 500_000;
const IMPORTED_CONTEXT_ROOT = ".ambient/context";
const IGNORED_NAMES = new Set([
  ".ambient-codex",
  ".git",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "release",
]);
const IMAGE_MIME_TYPES = new Map([
  [".apng", "image/apng"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);
const AUDIO_MIME_TYPES = new Map([
  [".aac", "audio/aac"],
  [".flac", "audio/flac"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".oga", "audio/ogg"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".wav", "audio/wav"],
  [".weba", "audio/webm"],
]);
const VIDEO_MIME_TYPES = new Map([
  [".m4v", "video/mp4"],
  [".mov", "video/quicktime"],
  [".mp4", "video/mp4"],
  [".ogv", "video/ogg"],
  [".webm", "video/webm"],
]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const CODE_LANGUAGES = new Map([
  [".css", "css"],
  [".cjs", "javascript"],
  [".js", "javascript"],
  [".jsx", "jsx"],
  [".json", "json"],
  [".mjs", "javascript"],
  [".py", "python"],
  [".sh", "shell"],
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
  [".xml", "xml"],
  [".toml", "toml"],
  [".sql", "sql"],
]);

export async function listWorkspaceFiles(workspacePath: string): Promise<WorkspaceFileTree> {
  const workspace = resolve(workspacePath);
  const realWorkspace = await realpath(workspace);
  const entries: FileTreeEntry[] = [];
  let truncated = false;

  async function walk(directory: string, depth: number): Promise<void> {
    if (entries.length >= MAX_TREE_ENTRIES || depth > MAX_TREE_DEPTH) {
      truncated = true;
      return;
    }

    let dirents = await readdir(directory, { withFileTypes: true });
    dirents = dirents
      .filter((entry) => !shouldIgnoreWorkspaceEntry(entry.name))
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
        return left.name.localeCompare(right.name);
      });

    for (const dirent of dirents) {
      if (entries.length >= MAX_TREE_ENTRIES) {
        truncated = true;
        return;
      }

      const absolutePath = join(directory, dirent.name);
      const entry = await workspaceFileTreeEntry({
        workspacePath: workspace,
        realWorkspace,
        absolutePath,
        name: dirent.name,
        depth,
        direntDirectory: dirent.isDirectory(),
        direntFile: dirent.isFile(),
        direntSymlink: dirent.isSymbolicLink(),
      });
      entries.push(entry);

      if (dirent.isDirectory()) {
        await walk(absolutePath, depth + 1);
      }
    }
  }

  await walk(workspace, 0);
  return { rootName: basename(workspace) || workspace, entries, truncated };
}

export async function getWorkspaceDiff(workspacePath: string): Promise<WorkspaceDiff> {
  const repo = await git(workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  if (!repo.ok) {
    return {
      isGitRepository: false,
      status: [],
      files: [],
      diff: "",
      truncated: false,
      error: "This workspace is not a git repository.",
    };
  }

  const status = await gitRaw(workspacePath, ["status", "--short", "--", "."]);
  const stagedStat = await git(workspacePath, ["diff", "--cached", "--stat", "--", "."]);
  const stagedPatch = await gitRaw(workspacePath, ["diff", "--cached", "--", "."]);
  const unstagedStat = await git(workspacePath, ["diff", "--stat", "--", "."]);
  const unstagedPatch = await gitRaw(workspacePath, ["diff", "--", "."]);

  const parts = [
    formatDiffSection("Staged", stagedStat.output, stagedPatch.output),
    formatDiffSection("Unstaged", unstagedStat.output, unstagedPatch.output),
  ].filter(Boolean);
  const { text, truncated } = truncateText(parts.join("\n\n"), MAX_DIFF_CHARS);

  return {
    isGitRepository: true,
    status: status.output.split(/\r?\n/).filter(Boolean),
    files: parseGitStatus(status.output),
    diff: text,
    truncated,
  };
}

export interface ReadWorkspaceFileOptions {
  createMediaUrl?: (input: {
    workspacePath: string;
    absolutePath: string;
    relativePath: string;
    realPath?: string;
    allowExternal?: boolean;
    mimeType?: string;
    size: number;
    mtimeMs?: number;
  }) => string;
  createOfficePreview?: (input: {
    workspacePath: string;
    absolutePath: string;
    relativePath: string;
    mimeType?: string;
    size: number;
    mtimeMs?: number;
  }) => Promise<OfficePreview | undefined>;
}

export async function readWorkspaceFile(
  workspacePath: string,
  requestedPath: string,
  options: ReadWorkspaceFileOptions = {},
): Promise<WorkspaceFileContent> {
  const resolvedPath = await resolveWorkspacePathForRead(workspacePath, requestedPath);
  return readResolvedFile({
    workspacePath,
    absolutePath: resolvedPath.absolutePath,
    accessPath: resolvedPath.realPath,
    displayPath: resolvedPath.displayPath,
    initialStat: resolvedPath.stat,
    realPath: resolvedPath.realPath,
    source: "workspace",
    allowExternalMedia: false,
    options,
  });
}

export async function readLocalFilePreview(
  workspacePath: string,
  requestedAbsolutePath: string,
  options: ReadWorkspaceFileOptions = {},
): Promise<WorkspaceFileContent> {
  const absolutePath = resolve(requestedAbsolutePath);
  return readResolvedFile({
    workspacePath,
    absolutePath,
    displayPath: absolutePath,
    source: "local",
    allowExternalMedia: true,
    options,
  });
}

async function readResolvedFile(input: {
  workspacePath: string;
  absolutePath: string;
  accessPath?: string;
  displayPath: string;
  initialStat?: Stats;
  realPath?: string;
  source: "workspace" | "local";
  allowExternalMedia: boolean;
  options: ReadWorkspaceFileOptions;
}): Promise<WorkspaceFileContent> {
  const { workspacePath, absolutePath, displayPath, source, allowExternalMedia, options } = input;
  const accessPath = input.accessPath ?? absolutePath;
  const fileStat = input.initialStat ?? (await stat(accessPath));
  if (!fileStat.isFile()) throw new Error("Only files can be opened.");

  const extension = extname(absolutePath).toLowerCase();
  const preview = previewTypeForExtension(extension);
  if (preview.kind === "office") {
    const [officeText, officePreview] = await Promise.all([
      extractOfficeText(accessPath, { maxExtractedChars: MAX_OFFICE_EXTRACTED_CHARS }),
      options.createOfficePreview?.({
        workspacePath,
        absolutePath: accessPath,
        relativePath: displayPath,
        mimeType: preview.mimeType,
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
      }),
    ]);
    return {
      path: displayPath,
      name: basename(absolutePath),
      source,
      ...(source === "local" ? { absolutePath, fileUrl: pathToFileURL(accessPath).href } : {}),
      content: officeText.status === "available" ? officeText.text ?? "" : "",
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      truncated: officeText.status === "available" ? officeText.truncated === true : false,
      binary: true,
      kind: "office",
      mimeType: preview.mimeType,
      language: officeText.status === "available" ? "text" : undefined,
      officeText,
      ...(officePreview ? { officePreview } : {}),
    };
  }
  if (preview.kind === "audio" || preview.kind === "video") {
    return {
      path: displayPath,
      name: basename(absolutePath),
      source,
      ...(source === "local" ? { absolutePath, fileUrl: pathToFileURL(accessPath).href } : {}),
      content: "",
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      truncated: false,
      binary: true,
      kind: preview.kind,
      mimeType: preview.mimeType,
      mediaUrl:
        preview.kind === "audio" || preview.kind === "video"
          ? options.createMediaUrl?.({
              workspacePath,
              absolutePath,
              relativePath: displayPath,
              ...(input.realPath ? { realPath: input.realPath } : {}),
              allowExternal: allowExternalMedia,
              mimeType: preview.mimeType,
              size: fileStat.size,
              mtimeMs: fileStat.mtimeMs,
            })
          : undefined,
    };
  }
  const binaryPreview = preview.kind === "image" || preview.kind === "pdf";
  const pdfText = preview.kind === "pdf" ? await extractPdfText(accessPath, { maxExtractedChars: MAX_PDF_EXTRACTED_CHARS }) : undefined;
  const bytesToRead = Math.min(fileStat.size, binaryPreview ? MAX_BINARY_PREVIEW_BYTES : MAX_FILE_READ_BYTES);
  const handle = await open(accessPath, fsConstants.O_RDONLY | NOFOLLOW_OPEN_FLAG);
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
    const contentBuffer = buffer.subarray(0, bytesRead);
    const imagePreviewMismatch = preview.kind === "image" ? invalidImagePreview(contentBuffer, preview.mimeType) : undefined;
    const detectedImageMimeType = imagePreviewMismatch ? sniffRasterImageMimeType(contentBuffer) : undefined;
    const effectiveMimeType = detectedImageMimeType ?? preview.mimeType;
    const binary = imagePreviewMismatch ? isBinaryBuffer(contentBuffer) : binaryPreview || isBinaryBuffer(contentBuffer);
    const previewTruncated = fileStat.size > bytesToRead;
    const pdfContent = pdfText?.status === "available" ? pdfText.text ?? "" : "";
    const content = preview.kind === "pdf" ? pdfContent : binary ? "" : contentBuffer.toString("utf8");
    const truncated = preview.kind === "pdf" ? previewTruncated || pdfText?.truncated === true : previewTruncated;
    if (imagePreviewMismatch && detectedImageMimeType) {
      return {
        path: displayPath,
        name: basename(absolutePath),
        source,
        ...(source === "local" ? { absolutePath, fileUrl: pathToFileURL(accessPath).href } : {}),
        content: "",
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        truncated,
        binary: true,
        kind: "image",
        mimeType: detectedImageMimeType,
        dataUrl: !previewTruncated ? dataUrl(contentBuffer, detectedImageMimeType) : undefined,
        mediaUrl: options.createMediaUrl?.({
          workspacePath,
          absolutePath,
          relativePath: displayPath,
          ...(input.realPath ? { realPath: input.realPath } : {}),
          allowExternal: allowExternalMedia,
          mimeType: detectedImageMimeType,
          size: fileStat.size,
          mtimeMs: fileStat.mtimeMs,
        }),
      };
    }
    if (imagePreviewMismatch) {
      const detectedText = binary ? undefined : textPreviewForContent(content);
      return {
        path: displayPath,
        name: basename(absolutePath),
        source,
        ...(source === "local" ? { absolutePath, fileUrl: pathToFileURL(accessPath).href } : {}),
        content,
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        truncated,
        binary,
        kind: binary ? "binary" : detectedText?.kind ?? "text",
        mimeType: binary ? "application/octet-stream" : detectedText?.mimeType ?? "text/plain",
        language: detectedText?.language,
        previewUrl: detectedText?.kind === "html" ? pathToFileURL(accessPath).href : undefined,
      };
    }
    return {
      path: displayPath,
      name: basename(absolutePath),
      source,
      ...(source === "local" ? { absolutePath, fileUrl: pathToFileURL(accessPath).href } : {}),
      content,
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      truncated,
      binary,
      kind: binaryPreview ? preview.kind : binary ? "binary" : preview.kind,
      mimeType: effectiveMimeType,
      language: preview.kind === "pdf" && pdfText?.status === "available" ? "text" : preview.language,
      dataUrl: binaryPreview && !previewTruncated ? dataUrl(contentBuffer, effectiveMimeType) : undefined,
      ...(pdfText ? { pdfText } : {}),
      mediaUrl:
        preview.kind === "image"
          ? options.createMediaUrl?.({
              workspacePath,
              absolutePath,
              relativePath: displayPath,
              ...(input.realPath ? { realPath: input.realPath } : {}),
              allowExternal: allowExternalMedia,
              mimeType: effectiveMimeType,
              size: fileStat.size,
              mtimeMs: fileStat.mtimeMs,
            })
          : undefined,
      previewUrl: preview.kind === "html" ? pathToFileURL(accessPath).href : undefined,
    };
  } finally {
    await handle.close();
  }
}

export async function writeWorkspaceTextFile(
  workspacePath: string,
  requestedPath: string,
  content: string,
  authority: WorkspacePathAuthorityOptions = {},
): Promise<{ path: string; bytes: number }> {
  const resolvedPath = await prepareWorkspacePathForWrite(workspacePath, requestedPath, authority);
  return writePreparedWorkspaceTextFile(resolvedPath, content);
}

export async function writeWorkspaceTextFileAtAbsolutePath(
  workspacePath: string,
  requestedAbsolutePath: string,
  content: string,
  authority: WorkspacePathAuthorityOptions = {},
): Promise<{ path: string; bytes: number }> {
  const resolvedPath = await prepareWorkspaceAbsolutePathForWrite(workspacePath, requestedAbsolutePath, authority);
  return writePreparedWorkspaceTextFile(resolvedPath, content);
}

async function writePreparedWorkspaceTextFile(
  resolvedPath: Awaited<ReturnType<typeof prepareWorkspacePathForWrite>>,
  content: string,
): Promise<{ path: string; bytes: number }> {
  const handle = await open(
    resolvedPath.absolutePath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | NOFOLLOW_OPEN_FLAG,
    0o666,
  );
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
  return {
    path: resolvedPath.displayPath,
    bytes: Buffer.byteLength(content, "utf8"),
  };
}

export async function createWorkspaceDirectoryAtAbsolutePath(
  workspacePath: string,
  requestedAbsolutePath: string,
  authority: WorkspacePathAuthorityOptions = {},
): Promise<string> {
  return prepareWorkspaceDirectoryForCreate(workspacePath, requestedAbsolutePath, authority);
}

export async function clearImportedWorkspaceContext(workspacePath: string): Promise<void> {
  await rm(await prepareWorkspacePathForDelete(workspacePath, IMPORTED_CONTEXT_ROOT), { recursive: true, force: true });
}

export function clearImportedWorkspaceContextSync(workspacePath: string): void {
  const targetPath = resolveWorkspacePath(workspacePath, IMPORTED_CONTEXT_ROOT);
  if (existsSync(targetPath)) {
    const realWorkspace = realpathSync(resolve(workspacePath));
    const realTarget = realpathSync(targetPath);
    if (!isPathInside(realWorkspace, realTarget)) {
      throw new Error("Path resolves outside the current workspace.");
    }
  }
  rmSync(targetPath, { recursive: true, force: true });
}

export async function describeWorkspaceContextPath(
  workspacePath: string,
  requestedPath: string,
): Promise<WorkspaceContextReference> {
  const resolvedPath = await resolveWorkspacePathForRead(workspacePath, requestedPath);
  return describeResolvedWorkspaceContextPath(resolvedPath);
}

export async function describeWorkspaceContextPaths(
  workspacePath: string,
  requestedPaths: readonly string[],
): Promise<WorkspaceContextReference[]> {
  return uniqueContextReferences(
    await Promise.all(requestedPaths.map((requestedPath) => describeWorkspaceContextPath(workspacePath, requestedPath))),
  );
}

export async function describeWorkspaceAbsoluteContextPaths(
  workspacePath: string,
  absolutePaths: readonly string[],
  options: { allowExternal?: boolean } = {},
): Promise<WorkspaceContextReference[]> {
  return uniqueContextReferences(
    await Promise.all(absolutePaths.map((absolutePath) => describeWorkspaceAbsoluteContextPath(workspacePath, absolutePath, options))),
  );
}

export async function describeWorkspaceContextReferences(
  workspacePath: string,
  references: readonly Pick<WorkspaceContextReference, "path" | "absolute">[],
  options: { allowExternal?: boolean } = {},
): Promise<WorkspaceContextReference[]> {
  return uniqueContextReferences(
    await Promise.all(
      references.map((reference) =>
        reference.absolute
          ? describeWorkspaceAbsoluteContextPath(workspacePath, reference.path, options)
          : describeWorkspaceContextPath(workspacePath, reference.path),
      ),
    ),
  );
}

export function resolveWorkspacePath(workspacePath: string, requestedPath: string): string {
  return resolveWorkspacePathLexical(workspacePath, requestedPath);
}

export async function resolveWorkspacePathForOpen(
  workspacePath: string,
  requestedPath: string,
): Promise<{ absolutePath: string; realPath: string; displayPath: string; symlink: boolean }> {
  const resolvedPath = await resolveWorkspacePathForRead(workspacePath, requestedPath);
  return {
    absolutePath: resolvedPath.absolutePath,
    realPath: resolvedPath.realPath,
    displayPath: resolvedPath.displayPath,
    symlink: resolvedPath.symlink,
  };
}

export function parseGitStatus(output: string): WorkspaceDiffFile[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseGitStatusLine)
    .filter((entry): entry is WorkspaceDiffFile => Boolean(entry));
}

export function parseGitStatusLine(line: string): WorkspaceDiffFile | undefined {
  if (line.length < 4) return undefined;
  const status = line.slice(0, 2);
  const rawPath = line.slice(3).trim();
  if (!rawPath) return undefined;
  const renamed = rawPath.includes(" -> ");
  const [originalPath, nextPath] = renamed ? rawPath.split(" -> ") : [undefined, rawPath];
  return {
    path: nextPath,
    ...(originalPath ? { originalPath } : {}),
    status,
    category: gitStatusCategory(status, renamed),
  };
}

export function shouldIgnoreWorkspaceEntry(name: string): boolean {
  return IGNORED_NAMES.has(name) || name === ".DS_Store" || name.endsWith(".app");
}

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}\n\n... truncated ...`, truncated: true };
}

async function workspaceFileTreeEntry(input: {
  workspacePath: string;
  realWorkspace: string;
  absolutePath: string;
  name: string;
  depth: number;
  direntDirectory: boolean;
  direntFile: boolean;
  direntSymlink: boolean;
}): Promise<FileTreeEntry> {
  const base: FileTreeEntry = {
    path: relative(input.workspacePath, input.absolutePath),
    name: input.name,
    type: input.direntDirectory ? "directory" : "file",
    depth: input.depth,
  };

  if (!input.direntSymlink) {
    if (input.direntFile) base.size = await fileSize(input.absolutePath);
    return base;
  }

  try {
    const targetRealPath = await realpath(input.absolutePath);
    if (!isPathInside(input.realWorkspace, targetRealPath)) {
      return {
        ...base,
        symlink: true,
        symlinkStatus: "outside-workspace",
        blockedReason: "Symlink target resolves outside the current workspace.",
      };
    }
    const targetStat = await stat(targetRealPath);
    return {
      ...base,
      type: targetStat.isDirectory() ? "directory" : "file",
      size: targetStat.isFile() ? targetStat.size : undefined,
      symlink: true,
      symlinkStatus: "inside-workspace",
      symlinkTargetPath: relative(input.realWorkspace, targetRealPath) || ".",
      symlinkTargetKind: targetStat.isDirectory() ? "directory" : targetStat.isFile() ? "file" : "other",
    };
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    return {
      ...base,
      symlink: true,
      symlinkStatus: "broken",
      blockedReason: "Symlink target does not exist.",
    };
  }
}

async function fileSize(path: string): Promise<number | undefined> {
  try {
    const stats = await lstat(path);
    if (!stats.isFile()) return undefined;
    return stats.size;
  } catch {
    return undefined;
  }
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

async function git(workspacePath: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", workspacePath, ...args], {
      timeout: 8_000,
      maxBuffer: 2_000_000,
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const output =
      error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    return { ok: false, output: output.trim() };
  }
}

async function gitRaw(workspacePath: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", workspacePath, ...args], {
      timeout: 8_000,
      maxBuffer: 2_000_000,
    });
    return { ok: true, output: `${stdout}${stderr}` };
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const stdout =
      error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    return { ok: false, output: `${stdout}${stderr}` };
  }
}

function formatDiffSection(title: string, statOutput: string, patchOutput: string): string {
  if (!statOutput && !patchOutput) return "";
  return [`## ${title}`, statOutput, patchOutput].filter(Boolean).join("\n\n");
}

function isBinaryBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const sampleSize = Math.min(buffer.length, 8000);
  for (let index = 0; index < sampleSize; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

function previewTypeForExtension(extension: string): { kind: WorkspaceFilePreviewKind; mimeType?: string; language?: string } {
  if (IMAGE_MIME_TYPES.has(extension)) return { kind: "image", mimeType: IMAGE_MIME_TYPES.get(extension) };
  if (AUDIO_MIME_TYPES.has(extension)) return { kind: "audio", mimeType: AUDIO_MIME_TYPES.get(extension) };
  if (VIDEO_MIME_TYPES.has(extension)) return { kind: "video", mimeType: VIDEO_MIME_TYPES.get(extension) };
  if (extension === ".pdf") return { kind: "pdf", mimeType: "application/pdf" };
  if (MARKDOWN_EXTENSIONS.has(extension)) return { kind: "markdown", mimeType: "text/markdown", language: "markdown" };
  if (HTML_EXTENSIONS.has(extension)) return { kind: "html", mimeType: "text/html", language: "html" };
  const officeMimeType = officeMimeTypeForExtension(extension);
  if (officeMimeType) return { kind: "office", mimeType: officeMimeType };
  if (CODE_LANGUAGES.has(extension)) return { kind: "code", mimeType: "text/plain", language: CODE_LANGUAGES.get(extension) };
  return { kind: "text", mimeType: "text/plain" };
}

function invalidImagePreview(buffer: Buffer, expectedMimeType?: string): boolean {
  if (expectedMimeType === "image/png" || expectedMimeType === "image/apng") {
    return !buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }
  if (expectedMimeType === "image/jpeg") {
    return !(buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff);
  }
  if (expectedMimeType === "image/gif") {
    const header = buffer.toString("ascii", 0, 6);
    return header !== "GIF87a" && header !== "GIF89a";
  }
  if (expectedMimeType === "image/webp") {
    return !(buffer.byteLength >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP");
  }
  if (expectedMimeType === "image/avif") {
    return !(buffer.byteLength >= 12 && buffer.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(buffer.toString("ascii", 8, 12)));
  }
  if (expectedMimeType === "image/svg+xml") {
    const text = buffer.toString("utf8", 0, Math.min(buffer.byteLength, 2048)).trimStart().toLowerCase();
    return !text.startsWith("<svg") && !(text.startsWith("<?xml") && text.includes("<svg"));
  }
  return false;
}

function sniffRasterImageMimeType(buffer: Buffer): string | undefined {
  if (buffer.byteLength >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return "image/png";
  }
  if (buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.byteLength >= 6) {
    const header = buffer.toString("ascii", 0, 6);
    if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  }
  if (buffer.byteLength >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buffer.byteLength >= 12 && buffer.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(buffer.toString("ascii", 8, 12))) {
    return "image/avif";
  }
  return undefined;
}

function textPreviewForContent(content: string): { kind: WorkspaceFilePreviewKind; mimeType: string; language?: string } {
  if (/^\s*(?:<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(content)) {
    return { kind: "html", mimeType: "text/html", language: "html" };
  }
  return { kind: "text", mimeType: "text/plain" };
}

async function describeWorkspaceAbsoluteContextPath(
  workspacePath: string,
  absolutePath: string,
  options: { allowExternal?: boolean } = {},
): Promise<WorkspaceContextReference> {
  const workspace = resolve(workspacePath);
  const resolvedPath = resolve(absolutePath);
  const insideWorkspace = isPathInside(workspace, resolvedPath);
  if (!insideWorkspace && !options.allowExternal) {
    throw new Error("Context path is outside the current workspace.");
  }
  if (insideWorkspace) {
    return describeResolvedWorkspaceContextPath(await resolveWorkspaceAbsolutePathForRead(workspace, resolvedPath));
  }
  const pathStat = await stat(resolvedPath);
  if (!pathStat.isFile() && !pathStat.isDirectory()) {
    throw new Error("Only files and folders can be attached as context.");
  }
  if (pathStat.isFile()) {
    return materializeExternalContextFile(workspace, resolvedPath, pathStat);
  }
  return {
    path: resolvedPath,
    name: basename(resolvedPath) || resolvedPath,
    kind: pathStat.isDirectory() ? "directory" : "file",
    ...(pathStat.isFile() ? { size: pathStat.size } : {}),
    absolute: true,
  };
}

function describeResolvedWorkspaceContextPath(resolvedPath: {
  absolutePath: string;
  displayPath: string;
  stat: Stats;
}): WorkspaceContextReference {
  if (!resolvedPath.stat.isFile() && !resolvedPath.stat.isDirectory()) {
    throw new Error("Only files and folders can be attached as context.");
  }
  return {
    path: resolvedPath.displayPath,
    name: basename(resolvedPath.absolutePath) || resolvedPath.absolutePath,
    kind: resolvedPath.stat.isDirectory() ? "directory" : "file",
    ...(resolvedPath.stat.isFile() ? { size: resolvedPath.stat.size } : {}),
  };
}

async function materializeExternalContextFile(
  workspacePath: string,
  sourcePath: string,
  sourceStat: Stats,
): Promise<WorkspaceContextReference> {
  const relativePath = importedContextRelativePath(sourcePath, sourceStat);
  const destination = await prepareWorkspacePathForWrite(workspacePath, relativePath);
  const destinationPath = destination.absolutePath;
  await copyFile(sourcePath, destinationPath);
  const destinationStat = await stat(destinationPath);
  return {
    path: destination.displayPath,
    name: basename(sourcePath) || sourcePath,
    kind: "file",
    size: destinationStat.size,
  };
}

function importedContextRelativePath(sourcePath: string, sourceStat: Stats): string {
  const parsed = parse(sourcePath);
  const safeStem = sanitizeImportedContextStem(parsed.name);
  const safeExt = sanitizeImportedContextExtension(parsed.ext);
  const hash = createHash("sha256")
    .update(resolve(sourcePath))
    .update("\0")
    .update(String(sourceStat.size))
    .update("\0")
    .update(String(Math.trunc(sourceStat.mtimeMs)))
    .digest("hex")
    .slice(0, 10);
  return join(IMPORTED_CONTEXT_ROOT, `${safeStem}-${hash}${safeExt}`);
}

function sanitizeImportedContextStem(value: string): string {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+/, "")
    .slice(0, 80);
  return sanitized || "attachment";
}

function sanitizeImportedContextExtension(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 16);
  return sanitized.startsWith(".") ? sanitized : "";
}

function uniqueContextReferences(references: WorkspaceContextReference[]): WorkspaceContextReference[] {
  const seen = new Set<string>();
  const unique: WorkspaceContextReference[] = [];
  for (const reference of references) {
    const key = `${reference.absolute ? "absolute" : "workspace"}:${reference.kind}:${reference.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(reference);
  }
  return unique;
}

function dataUrl(buffer: Buffer, mimeType = "application/octet-stream"): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function gitStatusCategory(status: string, renamed: boolean): WorkspaceDiffCategory {
  if (status.includes("?")) return "untracked";
  if (renamed || status.includes("R")) return "renamed";
  if (status.includes("D")) return "deleted";
  if (status.includes("A")) return "added";
  return "modified";
}
