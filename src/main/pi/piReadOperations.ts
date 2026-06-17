import { constants } from "node:fs";
import type { Stats } from "node:fs";
import { access, lstat, open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import type {
  EditOperations,
  FindOperations,
  GrepOperations,
  LsOperations,
  ReadOperations,
  WriteOperations,
} from "@mariozechner/pi-coding-agent";
import type { OfficeTextExtraction, PdfTextExtraction } from "../../shared/types";
import { describeOfficeFileSupport } from "../office/officeFileSupport";
import { extractOfficeText } from "../office/officeTextExtraction";
import { extractPdfText } from "../pdfTextExtraction";
import {
  createWorkspaceDirectoryAtAbsolutePath,
  writeWorkspaceTextFileAtAbsolutePath,
} from "../workspace/workspaceFiles";
import { resolveWorkspaceAbsolutePathForRead } from "../workspace/workspacePathResolver";
import { isPathInside } from "../session/sessionPaths";

const MAX_PI_READ_OFFICE_CHARS = 500_000;
const MAX_PI_READ_PDF_CHARS = 500_000;

type PathListProvider = readonly string[] | (() => readonly string[]);

export interface AmbientFileAuthorityRequest {
  access: "read" | "write";
  toolName: string;
  requestedPath: string;
  absolutePath: string;
  reason: string;
}

export type AmbientFileAuthorityRequester = (request: AmbientFileAuthorityRequest) => Promise<boolean>;

export interface AmbientReadOperationOptions {
  readOnlyAllowedPaths?: PathListProvider;
  authorityRootPaths?: PathListProvider;
  includeWorkspaceRootAuthority?: boolean | (() => boolean);
  requestFileAuthority?: AmbientFileAuthorityRequester;
  toolName?: string;
}

export interface AmbientWriteOperationOptions {
  authorityRootPaths?: PathListProvider;
  includeWorkspaceRootAuthority?: boolean | (() => boolean);
  requestFileAuthority?: AmbientFileAuthorityRequester;
  toolName?: string;
}

interface ResolvedReadablePath {
  absolutePath: string;
  realPath: string;
  stat: Stats;
  symlink: boolean;
}

export function createAmbientReadOperations(workspacePath?: string, options: AmbientReadOperationOptions = {}): ReadOperations {
  return {
    access: async (absolutePath) => access(await readablePath(workspacePath, absolutePath, options), constants.R_OK),
    detectImageMimeType: async (absolutePath) => detectImageMimeTypeFromFile(await readablePath(workspacePath, absolutePath, options)),
    readFile: async (absolutePath) => {
      const accessPath = await readablePath(workspacePath, absolutePath, options);
      if (extname(accessPath).toLowerCase() === ".pdf") {
        const pdfText = await extractPdfText(accessPath, { maxExtractedChars: MAX_PI_READ_PDF_CHARS });
        return Buffer.from(formatPdfReadText(accessPath, pdfText), "utf8");
      }
      const support = describeOfficeFileSupport(accessPath);
      if (!support) return readFile(accessPath);
      if (support.status !== "supported") {
        return Buffer.from(unsupportedOfficeReadText(accessPath, support.reason), "utf8");
      }

      const officeText = await extractOfficeText(accessPath, { maxExtractedChars: MAX_PI_READ_OFFICE_CHARS });
      return Buffer.from(formatOfficeReadText(accessPath, officeText), "utf8");
    },
  };
}

export function createAmbientWriteOperations(workspacePath: string, options: AmbientWriteOperationOptions = {}): WriteOperations {
  return {
    mkdir: async (absolutePath) => {
      try {
        await createWorkspaceDirectoryAtAbsolutePath(workspacePath, absolutePath, {
          authorityRootPaths: currentPaths(options.authorityRootPaths),
          includeWorkspaceRootAuthority: currentIncludeWorkspaceRootAuthority(options),
        });
      } catch (error) {
        if (options.requestFileAuthority && isWorkspaceAuthorityError(error)) return;
        throw error;
      }
    },
    writeFile: async (absolutePath, content) => {
      await requestWritableAuthorityIfNeeded(workspacePath, absolutePath, options);
      await writeWorkspaceTextFileAtAbsolutePath(workspacePath, absolutePath, content, {
        authorityRootPaths: currentPaths(options.authorityRootPaths),
        includeWorkspaceRootAuthority: currentIncludeWorkspaceRootAuthority(options),
      });
    },
  };
}

function isWorkspaceAuthorityError(error: unknown): boolean {
  return error instanceof Error && /outside the current workspace authority/.test(error.message);
}

export function createAmbientEditOperations(
  workspacePath: string,
  options: AmbientReadOperationOptions & AmbientWriteOperationOptions = {},
): EditOperations {
  return {
    access: async (absolutePath) => access(await readablePath(workspacePath, absolutePath, options), constants.R_OK | constants.W_OK),
    readFile: async (absolutePath) => readFile(await readablePath(workspacePath, absolutePath, options)),
    writeFile: async (absolutePath, content) => {
      await requestWritableAuthorityIfNeeded(workspacePath, absolutePath, options);
      await writeWorkspaceTextFileAtAbsolutePath(workspacePath, absolutePath, content, {
        authorityRootPaths: currentPaths(options.authorityRootPaths),
        includeWorkspaceRootAuthority: currentIncludeWorkspaceRootAuthority(options),
      });
    },
  };
}

export function createAmbientGrepOperations(workspacePath: string, options: AmbientReadOperationOptions = {}): GrepOperations {
  return {
    isDirectory: async (absolutePath) => (await resolveReadablePathForRead(workspacePath, absolutePath, options)).stat.isDirectory(),
    readFile: async (absolutePath) => readFile(await readablePath(workspacePath, absolutePath, options), "utf8"),
  };
}

export function createAmbientFindOperations(workspacePath: string, readOptions: AmbientReadOperationOptions = {}): FindOperations {
  return {
    exists: async (absolutePath) => {
      try {
        await resolveReadablePathForRead(workspacePath, absolutePath, readOptions);
        return true;
      } catch {
        return false;
      }
    },
    glob: async (pattern, cwd, findOptions) => {
      const root = await resolveReadablePathForRead(workspacePath, cwd, readOptions);
      if (!root.stat.isDirectory()) return [];
      const matcher = globMatcher(pattern);
      const results: string[] = [];
      const visited = new Set<string>();
      await collectFindMatches({
        workspacePath,
        searchRoot: root.absolutePath,
        lexicalDirectory: root.absolutePath,
        realDirectory: root.realPath,
        matcher,
        ignore: findOptions.ignore,
        readOptions,
        limit: Math.max(1, findOptions.limit),
        results,
        visited,
      });
      return results;
    },
  };
}

export function createAmbientLsOperations(workspacePath: string, options: AmbientReadOperationOptions = {}): LsOperations {
  return {
    exists: async (absolutePath) => {
      try {
        await resolveReadablePathForRead(workspacePath, absolutePath, options);
        return true;
      } catch {
        return false;
      }
    },
    stat: async (absolutePath) => (await resolveReadablePathForRead(workspacePath, absolutePath, options)).stat,
    readdir: async (absolutePath) => readdir(await readablePath(workspacePath, absolutePath, options)),
  };
}

async function readablePath(workspacePath: string | undefined, absolutePath: string, options: AmbientReadOperationOptions = {}): Promise<string> {
  if (!workspacePath) return absolutePath;
  return (await resolveReadablePathForRead(workspacePath, absolutePath, options)).realPath;
}

async function resolveReadablePathForRead(
  workspacePath: string,
  absolutePath: string,
  options: AmbientReadOperationOptions = {},
): Promise<ResolvedReadablePath> {
  const workspace = resolve(workspacePath);
  const requested = resolve(absolutePath);
  const authorityRootPaths = currentPaths(options.authorityRootPaths);
  const includeWorkspaceRootAuthority = currentIncludeWorkspaceRootAuthority(options);
  if (
    (includeWorkspaceRootAuthority && isPathInside(workspace, requested)) ||
    authorityRootPaths.some((root) => isPathInside(resolve(root), requested))
  ) {
    return resolveWorkspaceAbsolutePathForRead(workspace, requested, {
      authorityRootPaths,
      includeWorkspaceRootAuthority,
    });
  }

  for (const allowedPath of currentPaths(options.readOnlyAllowedPaths)) {
    const allowedRoot = resolve(workspace, allowedPath.trim());
    if (!isPathInside(allowedRoot, requested)) continue;
    const allowedRealPath = await realpath(allowedRoot).catch(() => undefined);
    if (!allowedRealPath) continue;
    const linkStat = await lstat(requested);
    const targetRealPath = await realpath(requested);
    if (!isPathInside(allowedRealPath, targetRealPath)) {
      throw new Error("Path resolves outside the allowed read-only context.");
    }
    return {
      absolutePath: requested,
      realPath: targetRealPath,
      stat: await stat(targetRealPath),
      symlink: linkStat.isSymbolicLink(),
    };
  }

  if (await requestFileAuthorityIfNeeded({
    access: "read",
    workspacePath: workspace,
    requestedPath: absolutePath,
    absolutePath: requested,
    options,
    reason: "Path is outside the current workspace authority.",
  })) {
    return resolveWorkspaceAbsolutePathForRead(workspace, requested, {
      authorityRootPaths: currentPaths(options.authorityRootPaths),
      includeWorkspaceRootAuthority: currentIncludeWorkspaceRootAuthority(options),
    });
  }

  return resolveWorkspaceAbsolutePathForRead(workspace, requested, {
    authorityRootPaths,
    includeWorkspaceRootAuthority,
  });
}

async function requestWritableAuthorityIfNeeded(
  workspacePath: string,
  absolutePath: string,
  options: AmbientWriteOperationOptions = {},
): Promise<void> {
  const workspace = resolve(workspacePath);
  const requested = resolve(absolutePath);
  const authorityRootPaths = currentPaths(options.authorityRootPaths);
  const includeWorkspaceRootAuthority = currentIncludeWorkspaceRootAuthority(options);
  if (
    (includeWorkspaceRootAuthority && isPathInside(workspace, requested)) ||
    authorityRootPaths.some((root) => isPathInside(resolve(root), requested))
  ) {
    return;
  }
  await requestFileAuthorityIfNeeded({
    access: "write",
    workspacePath: workspace,
    requestedPath: absolutePath,
    absolutePath: requested,
    options,
    reason: "Path is outside the current workspace authority.",
  });
}

async function requestFileAuthorityIfNeeded(input: {
  access: "read" | "write";
  workspacePath: string;
  requestedPath: string;
  absolutePath: string;
  options: AmbientReadOperationOptions | AmbientWriteOperationOptions;
  reason: string;
}): Promise<boolean> {
  const requester = input.options.requestFileAuthority;
  if (!requester) return false;
  const approved = await requester({
    access: input.access,
    toolName: input.options.toolName ?? (input.access === "write" ? "write" : "read"),
    requestedPath: input.requestedPath,
    absolutePath: input.absolutePath,
    reason: input.reason,
  });
  return approved === true;
}

async function collectFindMatches(input: {
  workspacePath: string;
  searchRoot: string;
  lexicalDirectory: string;
  realDirectory: string;
  matcher: (relativePath: string) => boolean;
  ignore: string[];
  readOptions: AmbientReadOperationOptions;
  limit: number;
  results: string[];
  visited: Set<string>;
}): Promise<void> {
  if (input.results.length >= input.limit || input.visited.has(input.realDirectory)) return;
  input.visited.add(input.realDirectory);
  const entries = await readdir(input.realDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (input.results.length >= input.limit) return;
    const lexicalPath = join(input.lexicalDirectory, entry.name);
    const relativePath = toPosixPath(relative(input.searchRoot, lexicalPath));
    if (!relativePath || ignoredBy(relativePath, input.ignore)) continue;

    let resolved;
    try {
      resolved = await resolveReadablePathForRead(input.workspacePath, lexicalPath, input.readOptions);
    } catch {
      continue;
    }

    if (input.matcher(relativePath)) input.results.push(lexicalPath);
    if (resolved.stat.isDirectory() && !resolved.symlink) {
      await collectFindMatches({
        ...input,
        lexicalDirectory: lexicalPath,
        realDirectory: resolved.realPath,
      });
    }
  }
}

function globMatcher(pattern: string): (relativePath: string) => boolean {
  const normalized = toPosixPath(pattern);
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\0/g, ".*");
  const regex = new RegExp(`^${escaped}$`);
  if (normalized.includes("/")) return (relativePath) => regex.test(relativePath);
  return (relativePath) => regex.test(relativePath.split("/").pop() ?? relativePath);
}

function ignoredBy(relativePath: string, ignore: string[]): boolean {
  return ignore.some((pattern) => {
    if (pattern.includes("node_modules")) return relativePath === "node_modules" || relativePath.startsWith("node_modules/");
    if (pattern.includes(".git")) return relativePath === ".git" || relativePath.startsWith(".git/");
    return false;
  });
}

function toPosixPath(value: string): string {
  return value.split("\\").join("/");
}

function currentPaths(provider: PathListProvider | undefined): string[] {
  const paths = typeof provider === "function" ? provider() : provider;
  return [...new Set((paths ?? []).map((path) => path.trim()).filter(Boolean))];
}

function currentIncludeWorkspaceRootAuthority(options: {
  includeWorkspaceRootAuthority?: boolean | (() => boolean);
}): boolean {
  const value = typeof options.includeWorkspaceRootAuthority === "function"
    ? options.includeWorkspaceRootAuthority()
    : options.includeWorkspaceRootAuthority;
  return value !== false;
}

function formatOfficeReadText(absolutePath: string, result: OfficeTextExtraction): string {
  const name = basename(absolutePath);
  if (result.status !== "available") {
    return [`Office text unavailable for ${name}.`, result.error].filter(Boolean).join("\n");
  }

  const count = typeof result.unitCount === "number" ? `${result.unitCount} ${result.unitLabel}` : undefined;
  const metadata = [`Office document text extracted from ${name}.`, result.format, count, result.truncated ? "truncated" : undefined]
    .filter(Boolean)
    .join(" ");
  return [metadata, result.text ?? ""].filter(Boolean).join("\n\n");
}

function formatPdfReadText(absolutePath: string, result: PdfTextExtraction): string {
  const name = basename(absolutePath);
  if (result.status !== "available") {
    return [`PDF text unavailable for ${name}.`, result.error].filter(Boolean).join("\n");
  }

  const pageCount = typeof result.pages === "number" ? `${result.pages} ${result.pages === 1 ? "page" : "pages"}` : undefined;
  const metadata = [`PDF text extracted from ${name}.`, pageCount, result.truncated ? "truncated" : undefined].filter(Boolean).join(" ");
  return [metadata, result.text ?? ""].filter(Boolean).join("\n\n");
}

function unsupportedOfficeReadText(absolutePath: string, reason: "legacy-binary-format" | "spreadsheet-format" | "unknown-office-format"): string {
  const name = basename(absolutePath);
  if (reason === "legacy-binary-format") return `Office text unavailable for ${name}. Legacy .doc/.ppt files are not supported yet.`;
  if (reason === "spreadsheet-format") return `Office text unavailable for ${name}. Spreadsheet Office files are not supported by native read yet.`;
  return `Office text unavailable for ${name}. This Office file format is not supported yet.`;
}

async function detectImageMimeTypeFromFile(absolutePath: string): Promise<string | undefined> {
  const handle = await open(absolutePath, "r");
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
    return detectImageMimeType(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function detectImageMimeType(buffer: Buffer): string | undefined {
  if (buffer.byteLength >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  const gifHeader = buffer.toString("ascii", 0, 6);
  if (buffer.byteLength >= 10 && (gifHeader === "GIF87a" || gifHeader === "GIF89a")) return "image/gif";
  if (buffer.byteLength >= 16 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buffer.byteLength >= 16 && buffer.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(buffer.toString("ascii", 8, 12))) {
    return "image/avif";
  }
  return undefined;
}
