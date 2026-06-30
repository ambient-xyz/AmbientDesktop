import { createHash } from "node:crypto";
import { opendir, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { isPathInside } from "./capabilityBuilderSessionFacade";
import type { ToolLargeOutputPreview, ToolLargeOutputPreviewItem } from "../../shared/threadTypes";
import { materializeTextOutput, type MaterializedTextOutput } from "./capabilityBuilderToolRuntimeFacade";
import type { CapabilityBuilderPreviewInput, CapabilityBuilderPreviewResult, CapabilityBuilderSourceRef } from "./capabilityBuilderTypes";

const builderListDefaultMaxEntries = 200;
const builderListMaxEntries = 1_000;
export const capabilityBuilderListInventoryArtifactMaxEntries = 20_000;
const builderListInventoryArtifactPreviewChars = 12_000;
const builderListDefaultMaxDepth = 12;
const builderListMaxDepth = 24;
const builderListMaxOmittedDirectories = 50;
const builderListOmittedSummaryMaxFiles = 1_000;
const builderListOmittedSummaryMaxDirectories = 250;
const builderListMaxCursorOffset = 50_000;
const builderListCursorVersion = 1;
const builderListSortOrder = "filesystem-stream-depth-first-v1";
const builderListGeneratedDirectoryNames = new Set([
  ".cache",
  ".mypy_cache",
  ".next",
  ".parcel-cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "env",
  "node_modules",
  "site-packages",
  "venv",
  "__pycache__",
]);

export interface CapabilityBuilderFileMetadata {
  sizeBytes: number;
  mtimeMs: number;
}

export interface CapabilityBuilderListFilesInput extends CapabilityBuilderPreviewInput {
  pathPrefix?: string;
  maxEntries?: number;
  maxDepth?: number;
  includeGenerated?: boolean;
  cursor?: string;
}

export interface CapabilityBuilderOmittedDirectorySummary {
  path: string;
  reason: "generated" | "maxDepth";
  fileCount: number;
  totalBytes: number;
  truncated: boolean;
}

export interface CapabilityBuilderListInventoryArtifact {
  path: string;
  bytes?: number;
  chars: number;
  previewChars: number;
  truncated: boolean;
  redacted: boolean;
  redactionCount: number;
  inventoryFileCount: number;
  inventoryFileCountTruncated: boolean;
  fileReadInput: {
    path: string;
  };
  longContextProcessInput: {
    taskType: "analysis";
    instruction: string;
    workspacePaths: string[];
    maxModelCalls: number;
  };
}

export interface CapabilityBuilderListFilesResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  sourceRef: CapabilityBuilderSourceRef;
  pathPrefix?: string;
  maxEntries: number;
  maxDepth: number;
  includeGenerated: boolean;
  totalFileCount: number;
  totalFileCountTruncated: boolean;
  omittedDirectoryCount: number;
  omittedDirectories: CapabilityBuilderOmittedDirectorySummary[];
  nextCursor?: string;
  inventoryArtifact?: CapabilityBuilderListInventoryArtifact;
  files: Array<{
    path: string;
    sizeBytes: number;
    mtimeMs: number;
  }>;
}

export type CapabilityBuilderListFilesNextPageInput = CapabilityBuilderListFilesInput & {
  sourcePath: string;
  cursor: string;
};

export function capabilityBuilderListFilesText(result: CapabilityBuilderListFilesResult): string {
  const inventoryArtifact = result.inventoryArtifact;
  const nextPageInput = capabilityBuilderListFilesNextPageInput(result);
  return [
    "Ambient Capability Builder files",
    `Package: ${result.packageName}`,
    `Canonical sourcePath: ${result.sourceRef.sourcePath}`,
    result.pathPrefix ? `Path prefix: ${result.pathPrefix}` : "Path prefix: package root",
    `Generated content: ${result.includeGenerated ? "included for this scoped request" : "omitted by default"}`,
    `Depth limit: ${result.maxDepth}`,
    result.totalFileCountTruncated
      ? `Files shown: ${result.files.length}; matched at least ${result.totalFileCount} files`
      : `Files shown: ${result.files.length} of ${result.totalFileCount}`,
    `Page size: ${result.maxEntries}`,
    result.nextCursor ? `Next cursor: ${result.nextCursor}` : undefined,
    "",
    ...result.files.map((file) => `- ${file.path} (${file.sizeBytes} bytes)`),
    result.omittedDirectories.length ? "" : undefined,
    result.omittedDirectories.length ? `Omitted directory summaries shown: ${result.omittedDirectories.length} of ${result.omittedDirectoryCount}` : undefined,
    ...result.omittedDirectories.map((directory) => `- ${directory.path}/ (${directory.reason}; ${directory.fileCount}${directory.truncated ? "+" : ""} files; ${directory.totalBytes}${directory.truncated ? "+ scanned" : ""} bytes)`),
    result.nextCursor ? "" : undefined,
    result.nextCursor ? "For the next page, call this tool again with the same selector/filter fields and the next cursor." : undefined,
    nextPageInput ? `Structured next page input: ${JSON.stringify(nextPageInput)}` : undefined,
    result.includeGenerated ? undefined : "",
    result.includeGenerated
      ? undefined
      : "Generated/dependency directories are summarized, not listed. To inspect one, use includeGenerated=true with a narrow pathPrefix plus bounded maxEntries/maxDepth.",
    inventoryArtifact ? "" : undefined,
    inventoryArtifact ? "Inventory artifact:" : undefined,
    inventoryArtifact ? `- Filtered inventory saved at: ${inventoryArtifact.path}` : undefined,
    inventoryArtifact
      ? `- Captured ${inventoryArtifact.inventoryFileCount}${inventoryArtifact.inventoryFileCountTruncated ? "+" : ""} files; artifact ${inventoryArtifact.chars} chars${inventoryArtifact.bytes === undefined ? "" : `, ${inventoryArtifact.bytes} bytes`}.`
      : undefined,
    inventoryArtifact?.inventoryFileCountTruncated ? "- Inventory hit the artifact cap; narrow pathPrefix/maxDepth for exhaustive coverage." : undefined,
    inventoryArtifact?.redacted ? `- Sensitive values redacted: ${inventoryArtifact.redactionCount}` : undefined,
    inventoryArtifact
      ? `- Use file_read with ${JSON.stringify(inventoryArtifact.fileReadInput)} for exact inventory text.`
      : undefined,
    inventoryArtifact
      ? `- Use long_context_process with ${JSON.stringify(inventoryArtifact.longContextProcessInput)} for summarization, extraction, or QA over the filtered inventory.`
      : undefined,
    inventoryArtifact
      ? `Structured next step: ${JSON.stringify(capabilityBuilderListInventoryStructuredNextStep(inventoryArtifact))}`
      : undefined,
    "",
    "Use ambient_capability_builder_read_file for exact file contents and ambient_capability_builder_write_file for approved Builder-managed edits.",
  ].filter((line) => line !== undefined).join("\n");
}

export function capabilityBuilderListFilesNextPageInput(
  result: CapabilityBuilderListFilesResult,
): CapabilityBuilderListFilesNextPageInput | undefined {
  if (!result.nextCursor) return undefined;
  return {
    sourcePath: result.sourceRef.sourcePath,
    ...(result.pathPrefix ? { pathPrefix: result.pathPrefix } : {}),
    maxEntries: result.maxEntries,
    maxDepth: result.maxDepth,
    includeGenerated: result.includeGenerated,
    cursor: result.nextCursor,
  };
}

export function capabilityBuilderListFilesOutputPreview(result: CapabilityBuilderListFilesResult): ToolLargeOutputPreview | undefined {
  const artifact = result.inventoryArtifact;
  if (!artifact) return undefined;
  const item: ToolLargeOutputPreviewItem = {
    label: `${result.packageName} filtered file inventory`,
    chars: artifact.chars,
    previewChars: artifact.previewChars,
    truncated: artifact.truncated || artifact.inventoryFileCountTruncated,
    artifactKind: "tool-output",
    artifactPath: artifact.path,
    ...(artifact.bytes === undefined ? {} : { artifactBytes: artifact.bytes }),
    suggestedTools: ["file_read", "long_context_process"],
  };
  return {
    kind: "large-output",
    summary: `Capability Builder filtered inventory artifact: ${artifact.path}`,
    items: [item],
  };
}

export async function materializeCapabilityBuilderListInventoryArtifact(
  workspace: string,
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath" | "gitSha">,
  listing: CapabilityBuilderSourceListing,
): Promise<CapabilityBuilderListInventoryArtifact | undefined> {
  const output = await materializeTextOutput(workspace, {
    label: `capability-builder-${preview.packageName}-filtered-inventory`,
    text: capabilityBuilderListInventoryArtifactText(preview, listing),
    maxPreviewChars: builderListInventoryArtifactPreviewChars,
    extension: "txt",
    alwaysWriteArtifact: true,
  });
  if (!output.artifactPath) return undefined;
  return capabilityBuilderListInventoryArtifactFromOutput(preview, listing, { ...output, artifactPath: output.artifactPath });
}

function capabilityBuilderListInventoryArtifactFromOutput(
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath">,
  listing: CapabilityBuilderSourceListing,
  output: MaterializedTextOutput & { artifactPath: string },
): CapabilityBuilderListInventoryArtifact {
  const instruction = [
    `Analyze the filtered Ambient Capability Builder file inventory for ${preview.packageName}.`,
    `Treat ${preview.relativeRootPath} as Builder-managed source.`,
    "The inventory follows the same generated-content filter policy as ambient_capability_builder_list_files.",
    listing.includeGenerated
      ? "Generated/dependency content is included only for the explicit pathPrefix in this artifact."
      : "Generated/dependency directories are summarized but not recursively listed.",
    listing.nextCursor
      ? "The inventory reached its artifact cap; use a narrower pathPrefix before claiming exhaustive file coverage."
      : "Use the inventory for exhaustive file-name QA within this filtered scope.",
  ].join(" ");
  return {
    path: output.artifactPath,
    ...(output.artifactBytes === undefined ? {} : { bytes: output.artifactBytes }),
    chars: output.totalChars,
    previewChars: output.previewChars,
    truncated: output.truncated,
    redacted: output.redacted,
    redactionCount: output.redactionCount,
    inventoryFileCount: listing.files.length,
    inventoryFileCountTruncated: listing.totalFileCountTruncated,
    fileReadInput: { path: output.artifactPath },
    longContextProcessInput: {
      taskType: "analysis",
      instruction,
      workspacePaths: [output.artifactPath],
      maxModelCalls: 4,
    },
  };
}

function capabilityBuilderListInventoryArtifactText(
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath" | "gitSha">,
  listing: CapabilityBuilderSourceListing,
): string {
  return [
    "Ambient Capability Builder filtered file inventory",
    `Package: ${preview.packageName}`,
    `Canonical sourcePath: ${preview.relativeRootPath}`,
    listing.pathPrefix ? `Path prefix: ${listing.pathPrefix}` : "Path prefix: package root",
    `Generated content: ${listing.includeGenerated ? "included for this scoped request" : "omitted by default"}`,
    `Depth limit: ${listing.maxDepth}`,
    `Inventory cap: ${listing.maxEntries}`,
    preview.gitSha ? `Git SHA: ${preview.gitSha}` : undefined,
    listing.totalFileCountTruncated
      ? `Files captured: ${listing.files.length}+; artifact cap reached, narrow pathPrefix/maxDepth before relying on exhaustive coverage`
      : `Files captured: ${listing.files.length} of ${listing.totalFileCount}`,
    `Omitted directories summarized: ${listing.omittedDirectories.length} of ${listing.omittedDirectoryCount}`,
    "",
    "Filter policy:",
    "- This artifact uses the same selector/filter policy as ambient_capability_builder_list_files.",
    "- Generated/dependency directories remain summarized unless includeGenerated=true is paired with a narrow pathPrefix.",
    "- Use ambient_capability_builder_read_file for exact file contents after choosing package-relative paths from this inventory.",
    listing.nextCursor
      ? "- This inventory hit its artifact cap. Narrow pathPrefix/maxDepth before relying on exhaustive coverage."
      : "- This inventory is complete for the filtered scope shown above.",
    "",
    "Files:",
    ...(listing.files.length ? listing.files.map((file) => `- ${file.path} (${file.sizeBytes} bytes)`) : ["- none"]),
    "",
    "Omitted directories:",
    ...(listing.omittedDirectories.length
      ? listing.omittedDirectories.map((directory) => `- ${directory.path}/ (${directory.reason}; ${directory.fileCount}${directory.truncated ? "+" : ""} files; ${directory.totalBytes}${directory.truncated ? "+ scanned" : ""} bytes)`)
      : ["- none"]),
  ].filter((line): line is string => line !== undefined).join("\n");
}

function capabilityBuilderListInventoryStructuredNextStep(artifact: CapabilityBuilderListInventoryArtifact) {
  return {
    artifactPath: artifact.path,
    chars: artifact.chars,
    previewChars: artifact.previewChars,
    truncated: artifact.truncated,
    inventoryFileCount: artifact.inventoryFileCount,
    inventoryFileCountTruncated: artifact.inventoryFileCountTruncated,
    recommendedNextTools: ["file_read", "long_context_process"],
    fileRead: artifact.fileReadInput,
    longContextProcess: artifact.longContextProcessInput,
  };
}

export interface CapabilityBuilderSourceListing {
  pathPrefix?: string;
  maxEntries: number;
  maxDepth: number;
  includeGenerated: boolean;
  totalFileCount: number;
  totalFileCountTruncated: boolean;
  omittedDirectoryCount: number;
  omittedDirectories: CapabilityBuilderOmittedDirectorySummary[];
  nextCursor?: string;
  files: Array<{
    path: string;
    sizeBytes: number;
    mtimeMs: number;
  }>;
}

interface CapabilityBuilderListCollection {
  files: CapabilityBuilderSourceListing["files"];
  omittedDirectories: CapabilityBuilderOmittedDirectorySummary[];
  omittedDirectoryCount: number;
  matchedFileCount: number;
  hasMoreFiles: boolean;
}

interface CapabilityBuilderListCursorScope {
  packageName: string;
  sourcePath: string;
  rootKey: string;
  pathPrefix: string;
  includeGenerated: boolean;
  maxEntries: number;
  maxDepth: number;
  sortOrder: string;
  gitSha: string;
  targetMtimeMs: number;
  targetKind: "file" | "directory";
}

interface CapabilityBuilderListPackageIdentity {
  packageName: string;
  sourcePath: string;
  gitSha?: string;
}

export async function listCapabilityBuilderSourceFiles(
  rootPath: string,
  input: CapabilityBuilderListFilesInput,
  identity: CapabilityBuilderListPackageIdentity,
  maxEntriesCap = builderListMaxEntries,
): Promise<CapabilityBuilderSourceListing> {
  const pathPrefix = normalizeCapabilityBuilderListPathPrefix(rootPath, input.pathPrefix);
  const maxEntries = boundedCapabilityBuilderListInteger(input.maxEntries, builderListDefaultMaxEntries, maxEntriesCap, "maxEntries");
  const maxDepth = boundedCapabilityBuilderListInteger(input.maxDepth, builderListDefaultMaxDepth, builderListMaxDepth, "maxDepth");
  const includeGenerated = input.includeGenerated === true;
  if (includeGenerated && !pathPrefix.path) {
    throw new Error("includeGenerated=true requires a narrow pathPrefix inside the Builder package.");
  }

  const targetStat = await stat(pathPrefix.absolutePath).catch(() => undefined);
  if (!targetStat) throw new Error(`Capability Builder list path does not exist: ${pathPrefix.path ?? "."}`);
  const targetKind = targetStat.isFile() ? "file" : targetStat.isDirectory() ? "directory" : undefined;
  if (!targetKind) throw new Error(`Capability Builder list path is not a file or directory: ${pathPrefix.path ?? "."}`);
  const cursorScope = capabilityBuilderListCursorScope(rootPath, identity, pathPrefix.path, includeGenerated, maxEntries, maxDepth, targetStat.mtimeMs, targetKind);
  const offset = decodeCapabilityBuilderListCursor(input.cursor, cursorScope);
  if (offset > builderListMaxCursorOffset) throw new Error(`Capability Builder list cursor is too deep; narrow pathPrefix or filters before continuing past ${builderListMaxCursorOffset} files.`);

  const collection: CapabilityBuilderListCollection = {
    files: [],
    omittedDirectories: [],
    omittedDirectoryCount: 0,
    matchedFileCount: 0,
    hasMoreFiles: false,
  };
  if (!includeGenerated && pathPrefix.path && capabilityBuilderGeneratedDirectoryRoot(pathPrefix.path)) {
    if (targetStat.isDirectory()) {
      await recordCapabilityBuilderOmittedDirectory(collection, pathPrefix.absolutePath, pathPrefix.path, "generated");
    }
    return {
      ...(pathPrefix.path ? { pathPrefix: pathPrefix.path } : {}),
      maxEntries,
      maxDepth,
      includeGenerated,
      totalFileCount: 0,
      totalFileCountTruncated: false,
      omittedDirectoryCount: collection.omittedDirectoryCount,
      omittedDirectories: collection.omittedDirectories,
      files: [],
    };
  }

  if (targetKind === "file") {
    appendCapabilityBuilderListedFile(collection, offset, maxEntries, {
      path: pathPrefix.path!,
      sizeBytes: targetStat.size,
      mtimeMs: targetStat.mtimeMs,
    });
  } else {
    await collectCapabilityBuilderListedFiles(rootPath, pathPrefix.absolutePath, maxDepth, includeGenerated, offset, maxEntries, collection);
  }

  collection.omittedDirectories.sort((left, right) => left.path.localeCompare(right.path));
  const nextOffset = offset + collection.files.length;
  return {
    ...(pathPrefix.path ? { pathPrefix: pathPrefix.path } : {}),
    maxEntries,
    maxDepth,
    includeGenerated,
    totalFileCount: collection.hasMoreFiles ? nextOffset + 1 : collection.matchedFileCount,
    totalFileCountTruncated: collection.hasMoreFiles,
    omittedDirectoryCount: collection.omittedDirectoryCount,
    omittedDirectories: collection.omittedDirectories.slice(0, builderListMaxOmittedDirectories),
    ...(collection.hasMoreFiles ? { nextCursor: encodeCapabilityBuilderListCursor(nextOffset, cursorScope) } : {}),
    files: collection.files,
  };
}

async function collectCapabilityBuilderListedFiles(
  rootPath: string,
  directory: string,
  maxDepth: number,
  includeGenerated: boolean,
  offset: number,
  maxEntries: number,
  collection: CapabilityBuilderListCollection,
  depth = 0,
): Promise<void> {
  if (collection.hasMoreFiles) return;
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (collection.hasMoreFiles) return;
    const absolutePath = join(directory, entry.name);
    const relativePath = normalizeCapabilityBuilderRelativePath(relative(rootPath, absolutePath));
    if (relativePath === ".git" || relativePath.startsWith(".git/")) continue;
    if (entry.isDirectory()) {
      const generatedRoot = capabilityBuilderGeneratedDirectoryRoot(relativePath);
      if (!includeGenerated && generatedRoot === relativePath) {
        await recordCapabilityBuilderOmittedDirectory(collection, absolutePath, relativePath, "generated");
        continue;
      }
      if (depth >= maxDepth) {
        await recordCapabilityBuilderOmittedDirectory(collection, absolutePath, relativePath, "maxDepth");
        continue;
      }
      await collectCapabilityBuilderListedFiles(rootPath, absolutePath, maxDepth, includeGenerated, offset, maxEntries, collection, depth + 1);
    } else if (entry.isFile()) {
      const file = await stat(absolutePath);
      appendCapabilityBuilderListedFile(collection, offset, maxEntries, { path: relativePath, sizeBytes: file.size, mtimeMs: file.mtimeMs });
    }
  }
}

function appendCapabilityBuilderListedFile(
  collection: CapabilityBuilderListCollection,
  offset: number,
  maxEntries: number,
  file: CapabilityBuilderSourceListing["files"][number],
): void {
  collection.matchedFileCount += 1;
  if (collection.matchedFileCount <= offset) return;
  if (collection.files.length < maxEntries) {
    collection.files.push(file);
    return;
  }
  collection.hasMoreFiles = true;
}

async function recordCapabilityBuilderOmittedDirectory(
  collection: CapabilityBuilderListCollection,
  absolutePath: string,
  relativePath: string,
  reason: CapabilityBuilderOmittedDirectorySummary["reason"],
): Promise<void> {
  collection.omittedDirectoryCount += 1;
  if (collection.omittedDirectories.length >= builderListMaxOmittedDirectories) return;
  collection.omittedDirectories.push(await summarizeCapabilityBuilderOmittedDirectory(absolutePath, relativePath, reason));
}

async function summarizeCapabilityBuilderOmittedDirectory(
  absolutePath: string,
  relativePath: string,
  reason: CapabilityBuilderOmittedDirectorySummary["reason"],
): Promise<CapabilityBuilderOmittedDirectorySummary> {
  let fileCount = 0;
  let totalBytes = 0;
  let directoryCount = 0;
  let truncated = false;
  async function visit(directory: string): Promise<void> {
    if (truncated) return;
    directoryCount += 1;
    if (directoryCount > builderListOmittedSummaryMaxDirectories) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await opendir(directory);
    } catch {
      return;
    }
    for await (const entry of entries) {
      if (truncated) return;
      const childPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(childPath);
      } else if (entry.isFile()) {
        if (fileCount >= builderListOmittedSummaryMaxFiles) {
          truncated = true;
          return;
        }
        const file = await stat(childPath).catch(() => undefined);
        if (!file) continue;
        fileCount += 1;
        totalBytes += file.size;
      }
    }
  }
  await visit(absolutePath);
  return { path: relativePath, reason, fileCount, totalBytes, truncated };
}

function normalizeCapabilityBuilderListPathPrefix(rootPath: string, pathPrefix: string | undefined): { path?: string; absolutePath: string } {
  const trimmed = pathPrefix?.trim();
  if (!trimmed || trimmed === ".") return { absolutePath: rootPath };
  if (trimmed.includes("\0")) throw new Error(`Capability Builder list path contains unsupported characters: ${trimmed}`);
  if (isAbsolute(trimmed)) throw new Error(`Capability Builder list path must be package-relative: ${trimmed}`);
  const absolutePath = resolve(rootPath, trimmed);
  const relativePath = relative(rootPath, absolutePath);
  if (!relativePath || relativePath === "." || relativePath.startsWith("..") || !isPathInside(rootPath, absolutePath)) {
    throw new Error(`Capability Builder list path escapes the package root: ${trimmed}`);
  }
  if (relativePath === ".git" || relativePath.startsWith(".git/")) {
    throw new Error(`Capability Builder file tools cannot access package Git metadata: ${trimmed}`);
  }
  return { path: normalizeCapabilityBuilderRelativePath(relativePath), absolutePath };
}

function capabilityBuilderGeneratedDirectoryRoot(relativePath: string): string | undefined {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  const rootSegments: string[] = [];
  for (const segment of segments) {
    rootSegments.push(segment);
    if (builderListGeneratedDirectoryNames.has(segment)) return rootSegments.join("/");
  }
  return undefined;
}

function normalizeCapabilityBuilderRelativePath(relativePath: string): string {
  return relativePath.split(/[\\/]+/).join("/");
}

function boundedCapabilityBuilderListInteger(value: number | undefined, defaultValue: number, maxValue: number, label: string): number {
  if (value === undefined) return defaultValue;
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  const integer = Math.floor(value);
  if (integer < 1) throw new Error(`${label} must be at least 1.`);
  return Math.min(integer, maxValue);
}

function capabilityBuilderListCursorScope(
  rootPath: string,
  identity: CapabilityBuilderListPackageIdentity,
  pathPrefix: string | undefined,
  includeGenerated: boolean,
  maxEntries: number,
  maxDepth: number,
  targetMtimeMs: number,
  targetKind: "file" | "directory",
): CapabilityBuilderListCursorScope {
  return {
    packageName: identity.packageName,
    sourcePath: identity.sourcePath,
    rootKey: createHash("sha256").update(resolve(rootPath)).digest("hex"),
    pathPrefix: pathPrefix ?? "",
    includeGenerated,
    maxEntries,
    maxDepth,
    sortOrder: builderListSortOrder,
    gitSha: identity.gitSha ?? "",
    targetMtimeMs,
    targetKind,
  };
}

function decodeCapabilityBuilderListCursor(cursor: string | undefined, expectedScope: CapabilityBuilderListCursorScope): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      v?: unknown;
      offset?: unknown;
      scope?: unknown;
    };
    if (parsed.v !== builderListCursorVersion) throw new Error("unsupported cursor version");
    if (typeof parsed.offset !== "number" || !Number.isInteger(parsed.offset) || parsed.offset < 0) throw new Error("invalid offset");
    if (JSON.stringify(parsed.scope) !== JSON.stringify(expectedScope)) throw new Error("cursor scope mismatch");
    return parsed.offset;
  } catch {
    throw new Error("Capability Builder list cursor is invalid or does not match the current package, pathPrefix, filters, sort order, or snapshot.");
  }
}

function encodeCapabilityBuilderListCursor(offset: number, scope: CapabilityBuilderListCursorScope): string {
  return Buffer.from(JSON.stringify({ v: builderListCursorVersion, offset, scope }), "utf8").toString("base64url");
}

export async function listPackageFiles(rootPath: string): Promise<Map<string, number>> {
  const metadata = await listPackageFileMetadata(rootPath);
  return new Map([...metadata.entries()].map(([path, file]) => [path, file.sizeBytes]));
}

export async function listPackageFileMetadata(rootPath: string): Promise<Map<string, CapabilityBuilderFileMetadata>> {
  const files = new Map<string, CapabilityBuilderFileMetadata>();
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(rootPath, absolutePath);
      if (relativePath === ".git" || relativePath.startsWith(".git/")) continue;
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        const file = await stat(absolutePath);
        files.set(relativePath, { sizeBytes: file.size, mtimeMs: file.mtimeMs });
      }
    }
  }
  await visit(rootPath);
  return files;
}
