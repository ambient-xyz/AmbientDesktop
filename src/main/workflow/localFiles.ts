import { homedir } from "node:os";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { OfficeTextExtraction, PdfTextExtraction } from "../../shared/workspaceTypes";
import { isEnvTemplatePath } from "../../shared/pathSensitivity";

const DEFAULT_MAX_LOCAL_DIRECTORY_ENTRIES = 200;
const MAX_LOCAL_DIRECTORY_ENTRIES = 500;
const DEFAULT_LOCAL_DIRECTORY_DEPTH = 1;
const MAX_LOCAL_DIRECTORY_DEPTH = 4;
const MAX_LOCAL_DIRECTORY_SKIPPED = 80;
const SECRET_LIKE_LOCAL_FILE_PATTERN = /(^\.env($|\.)|id_rsa|id_dsa|\.pem$|\.p12$|\.pfx$|secret|token|credential|password)/i;

export interface LocalDirectoryListInput {
  path: string;
  maxEntries?: number;
  maxDepth?: number;
  includeHidden?: boolean;
}

export interface LocalDirectoryEntry {
  path: string;
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  depth: number;
  absolutePath: string;
  fileUrl?: string;
  extension?: string;
  size?: number;
  mtimeMs?: number;
  symlinkTargetKind?: "file" | "directory" | "other" | "missing";
}

export interface LocalDirectoryListResult {
  rootPath: string;
  rootName: string;
  entries: LocalDirectoryEntry[];
  truncated: boolean;
  totalKnownEntries: number;
  skipped: Array<{ path: string; reason: string }>;
}

export interface LocalFileReadResult {
  path: string;
  absolutePath: string;
  fileUrl?: string;
  content: string;
  truncated: boolean;
  kind: string;
  language?: string;
  size?: number;
  mtimeMs?: number;
  pdfText?: Omit<PdfTextExtraction, "text">;
  officeText?: Omit<OfficeTextExtraction, "text">;
}

interface LocalFilePreview {
  path: string;
  absolutePath?: string;
  fileUrl?: string;
  content: string;
  truncated: boolean;
  kind: string;
  language?: string;
  size?: number;
  mtimeMs?: number;
  binary?: boolean;
  pdfText?: PdfTextExtraction;
  officeText?: OfficeTextExtraction;
}

export type LocalFilePreviewReader = (workspacePath: string, absolutePath: string) => Promise<LocalFilePreview>;

export async function listLocalDirectory(input: LocalDirectoryListInput): Promise<LocalDirectoryListResult> {
  const rootPath = expandUserPath(input.path);
  const rootStat = await lstat(rootPath);
  if (!rootStat.isDirectory() && !rootStat.isSymbolicLink()) throw new Error(`local_directory_list path is not a directory: ${rootPath}`);
  const realRootPath = await realpath(rootPath);
  const realRootStat = await stat(realRootPath);
  if (!realRootStat.isDirectory()) throw new Error(`local_directory_list path is not a directory: ${rootPath}`);

  const maxEntries = clampInteger(input.maxEntries, DEFAULT_MAX_LOCAL_DIRECTORY_ENTRIES, 1, MAX_LOCAL_DIRECTORY_ENTRIES);
  const maxDepth = clampInteger(input.maxDepth, DEFAULT_LOCAL_DIRECTORY_DEPTH, 1, MAX_LOCAL_DIRECTORY_DEPTH);
  const includeHidden = input.includeHidden === true;
  const entries: LocalDirectoryEntry[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  let truncated = false;
  let totalKnownEntries = 0;

  const noteSkipped = (entryPath: string, reason: string) => {
    if (skipped.length >= MAX_LOCAL_DIRECTORY_SKIPPED) {
      truncated = true;
      return;
    }
    skipped.push({ path: entryPath, reason });
  };

  const walk = async (directory: string, depth: number): Promise<void> => {
    if (entries.length >= maxEntries) {
      truncated = true;
      return;
    }
    let dirents;
    try {
      dirents = await readdir(directory, { withFileTypes: true });
    } catch {
      noteSkipped(displayLocalPath(realRootPath, directory), "directory could not be read");
      return;
    }
    dirents = dirents.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
      return left.name.localeCompare(right.name);
    });

    for (const dirent of dirents) {
      const absolutePath = join(directory, dirent.name);
      const displayPath = displayLocalPath(realRootPath, absolutePath);
      const envTemplate = isEnvTemplatePath(dirent.name) || isEnvTemplatePath(absolutePath);
      if (!includeHidden && dirent.name.startsWith(".") && !envTemplate) {
        noteSkipped(displayPath, "hidden path skipped");
        continue;
      }
      if (!envTemplate && (SECRET_LIKE_LOCAL_FILE_PATTERN.test(dirent.name) || SECRET_LIKE_LOCAL_FILE_PATTERN.test(absolutePath))) {
        noteSkipped(displayPath, "secret-like path skipped");
        continue;
      }
      if (entries.length >= maxEntries) {
        truncated = true;
        return;
      }
      totalKnownEntries += 1;
      const entry = await localDirectoryEntry(realRootPath, absolutePath, dirent.name, depth);
      entries.push(entry);
      if (entry.type === "directory" && depth + 1 < maxDepth) {
        await walk(absolutePath, depth + 1);
      }
    }
  };

  await walk(realRootPath, 0);
  return {
    rootPath: realRootPath,
    rootName: basename(realRootPath) || realRootPath,
    entries,
    truncated,
    totalKnownEntries,
    skipped,
  };
}

export async function readLocalTextFile(
  workspacePath: string,
  requestedPath: string,
  readLocalFilePreview: LocalFilePreviewReader,
): Promise<LocalFileReadResult> {
  const absolutePath = expandUserPath(requestedPath);
  const file = await readLocalFilePreview(workspacePath, absolutePath);
  if (file.kind === "office" && file.officeText?.status !== "available") {
    throw new Error(`local_file_read could not extract Office text from ${file.path}: ${file.officeText?.error ?? file.officeText?.status ?? "unsupported"}`);
  }
  if (file.kind === "pdf" && file.pdfText && file.pdfText.status !== "available" && file.pdfText.status !== "no-text") {
    throw new Error(`local_file_read could not extract PDF text from ${file.path}: ${file.pdfText.error ?? file.pdfText.status}`);
  }
  if (file.binary && file.kind !== "office" && file.kind !== "pdf") {
    throw new Error(`local_file_read only supports text files, PDFs, or supported Office documents: ${file.path}`);
  }
  return {
    path: file.path,
    absolutePath: file.absolutePath ?? absolutePath,
    fileUrl: file.fileUrl,
    content: file.content,
    truncated: file.truncated,
    kind: file.kind,
    language: file.language,
    size: file.size,
    mtimeMs: file.mtimeMs,
    ...(file.pdfText ? { pdfText: pdfTextMetadata(file.pdfText) } : {}),
    ...(file.officeText ? { officeText: officeTextMetadata(file.officeText) } : {}),
  };
}

export function expandUserPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return resolve(homedir(), trimmed.slice(2));
  if (trimmed === "Downloads" || trimmed.startsWith("Downloads/")) return resolve(homedir(), trimmed);
  if (trimmed === "Desktop" || trimmed.startsWith("Desktop/")) return resolve(homedir(), trimmed);
  if (trimmed === "Documents" || trimmed.startsWith("Documents/")) return resolve(homedir(), trimmed);
  return resolve(trimmed);
}

async function localDirectoryEntry(rootPath: string, absolutePath: string, name: string, depth: number): Promise<LocalDirectoryEntry> {
  const entryStat = await lstat(absolutePath);
  const base: LocalDirectoryEntry = {
    path: displayLocalPath(rootPath, absolutePath),
    name,
    type: entryType(entryStat),
    depth,
    absolutePath,
    fileUrl: pathToFileURL(absolutePath).href,
    mtimeMs: entryStat.mtimeMs,
  };
  if (entryStat.isFile()) {
    base.size = entryStat.size;
    const extension = extname(name).toLowerCase();
    if (extension) base.extension = extension;
  }
  if (entryStat.isSymbolicLink()) {
    base.symlinkTargetKind = await symlinkTargetKind(absolutePath);
  }
  return base;
}

async function symlinkTargetKind(path: string): Promise<LocalDirectoryEntry["symlinkTargetKind"]> {
  try {
    const targetPath = await realpath(path);
    const targetStat = await stat(targetPath);
    if (targetStat.isDirectory()) return "directory";
    if (targetStat.isFile()) return "file";
    return "other";
  } catch {
    return "missing";
  }
}

function entryType(entryStat: Awaited<ReturnType<typeof lstat>>): LocalDirectoryEntry["type"] {
  if (entryStat.isSymbolicLink()) return "symlink";
  if (entryStat.isDirectory()) return "directory";
  if (entryStat.isFile()) return "file";
  return "other";
}

function displayLocalPath(rootPath: string, absolutePath: string): string {
  return relative(rootPath, absolutePath) || ".";
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(min, Math.min(number, max));
}

function officeTextMetadata(officeText: OfficeTextExtraction): Omit<OfficeTextExtraction, "text"> {
  const { text: _text, ...metadata } = officeText;
  return metadata;
}

function pdfTextMetadata(pdfText: PdfTextExtraction): Omit<PdfTextExtraction, "text"> {
  const { text: _text, ...metadata } = pdfText;
  return metadata;
}
