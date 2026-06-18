import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import type { ToolHiveInstalledServerState, ToolHiveRunVolume } from "./mcpToolRuntimeFacade";

export const MCP_MANAGED_FILE_EXCHANGE_PURPOSE = "ambient-mcp-file-exchange";
export const MCP_MANAGED_FILE_EXCHANGE_CONTAINER_PATH = "/ambient/mcp-files";
export const MCP_MANAGED_FILE_EXCHANGE_DIRECTORY_MODE = 0o1777;
export const MCP_MANAGED_FILE_EXCHANGE_INPUT_FILE_MODE = 0o644;
export const MCP_MANAGED_FILE_EXCHANGE_OUTPUT_FILE_MODE = 0o666;

const maxInlineFileInputBytes = 2 * 1024 * 1024;
const maxManagedFileArtifacts = 8;
const maxManagedFileArtifactCopyBytes = 50 * 1024 * 1024;

export interface McpManagedFileExchange {
  purpose: typeof MCP_MANAGED_FILE_EXCHANGE_PURPOSE;
  hostPath: string;
  containerPath: string;
  mode: "rw";
}

export interface McpToolCallFileInput {
  argumentPath: string;
  content: string;
  filename?: string;
}

export interface McpManagedFileExchangeStagedFile {
  source: "explicit-inline" | "inline-argument" | "workspace-file" | "output-path";
  argumentPath: string;
  filename: string;
  hostPath: string;
  containerPath: string;
  bytes?: number;
}

export interface McpManagedFileExchangePreparation {
  arguments: Record<string, unknown>;
  stagedFiles: McpManagedFileExchangeStagedFile[];
  exchange?: McpManagedFileExchange;
}

export interface McpManagedFileExchangeArtifact {
  containerPath: string;
  hostPath: string;
  filename: string;
  bytes: number;
  source: "result-reference" | "output-path";
  workspacePath?: string;
  copySkippedReason?: string;
}

export function mcpManagedFileExchangeForWorkload(stateRoot: string, workloadName: string): McpManagedFileExchange {
  return {
    purpose: MCP_MANAGED_FILE_EXCHANGE_PURPOSE,
    hostPath: join(stateRoot, "file-exchange", safeFileSegment(workloadName)),
    containerPath: MCP_MANAGED_FILE_EXCHANGE_CONTAINER_PATH,
    mode: "rw",
  };
}

export function mcpManagedFileExchangeVolume(exchange: McpManagedFileExchange): ToolHiveRunVolume {
  return {
    hostPath: exchange.hostPath,
    containerPath: exchange.containerPath,
    mode: exchange.mode,
    purpose: MCP_MANAGED_FILE_EXCHANGE_PURPOSE,
  };
}

export function mcpManagedFileExchangePermissionMount(exchange: McpManagedFileExchange): Record<string, unknown> {
  return {
    source: MCP_MANAGED_FILE_EXCHANGE_PURPOSE,
    path: `${exchange.containerPath}/*`,
    containerPath: exchange.containerPath,
    mode: "read-write",
  };
}

export function managedFileExchangeFromVolumes(volumes: ToolHiveRunVolume[] | undefined): McpManagedFileExchange | undefined {
  const volume = volumes?.find((candidate) => candidate.purpose === MCP_MANAGED_FILE_EXCHANGE_PURPOSE);
  if (!volume || volume.mode !== "rw") return undefined;
  return {
    purpose: MCP_MANAGED_FILE_EXCHANGE_PURPOSE,
    hostPath: volume.hostPath,
    containerPath: volume.containerPath,
    mode: "rw",
  };
}

export async function ensureMcpManagedFileExchangeHostPath(exchange: Pick<McpManagedFileExchange, "hostPath">): Promise<void> {
  await mkdir(exchange.hostPath, { recursive: true, mode: MCP_MANAGED_FILE_EXCHANGE_DIRECTORY_MODE });
  await chmod(exchange.hostPath, MCP_MANAGED_FILE_EXCHANGE_DIRECTORY_MODE).catch(() => undefined);
}

export async function validateMcpManagedFileExchangeHostAccess(exchange: Pick<McpManagedFileExchange, "hostPath" | "containerPath">): Promise<{ ok: true } | { ok: false; message: string }> {
  await ensureMcpManagedFileExchangeHostPath(exchange);
  const info = await stat(exchange.hostPath);
  if (!info.isDirectory()) {
    return { ok: false, message: `Managed MCP file exchange host path is not a directory: ${exchange.hostPath}` };
  }
  const mode = info.mode & 0o7777;
  if ((mode & 0o007) !== 0o007) {
    return {
      ok: false,
      message: `Managed MCP file exchange ${exchange.containerPath} is mounted from a host directory with mode ${mode.toString(8)}; container users must be able to read, write, and traverse it.`,
    };
  }
  return { ok: true };
}

export async function materializeMcpManagedFileExchangeArtifacts(input: {
  exchange?: McpManagedFileExchange;
  workspacePath: string;
  workloadName: string;
  text: string;
  stagedFiles: McpManagedFileExchangeStagedFile[];
}): Promise<McpManagedFileExchangeArtifact[]> {
  if (!input.exchange) return [];
  const candidates = new Map<string, "result-reference" | "output-path">();
  for (const file of input.stagedFiles) {
    if (file.source === "output-path") candidates.set(file.containerPath, "output-path");
  }
  for (const containerPath of referencedManagedContainerPaths(input.text, input.exchange.containerPath)) {
    if (!candidates.has(containerPath)) candidates.set(containerPath, "result-reference");
  }

  const artifacts: McpManagedFileExchangeArtifact[] = [];
  for (const [containerPath, source] of candidates) {
    if (artifacts.length >= maxManagedFileArtifacts) break;
    const hostPath = managedContainerPathToHostPath(input.exchange, containerPath);
    if (!hostPath) continue;
    let bytes: number;
    try {
      const info = await stat(hostPath);
      if (!info.isFile()) continue;
      bytes = info.size;
    } catch {
      continue;
    }
    const artifact: McpManagedFileExchangeArtifact = {
      containerPath,
      hostPath,
      filename: basename(hostPath),
      bytes,
      source,
    };
    if (bytes <= maxManagedFileArtifactCopyBytes) {
      const workspaceArtifactPath = managedExchangeWorkspaceArtifactPath(input.workloadName, hostPath, bytes);
      const absoluteWorkspaceArtifactPath = join(input.workspacePath, workspaceArtifactPath);
      await mkdir(dirname(absoluteWorkspaceArtifactPath), { recursive: true });
      await copyFile(hostPath, absoluteWorkspaceArtifactPath);
      await chmod(absoluteWorkspaceArtifactPath, MCP_MANAGED_FILE_EXCHANGE_INPUT_FILE_MODE).catch(() => undefined);
      artifact.workspacePath = workspaceArtifactPath;
    } else {
      artifact.copySkippedReason = `File is ${bytes} bytes, above the ${maxManagedFileArtifactCopyBytes} byte managed MCP artifact copy limit.`;
    }
    artifacts.push(artifact);
  }
  return artifacts;
}

export async function prepareMcpManagedFileExchangeArguments(input: {
  arguments: Record<string, unknown>;
  fileInputs?: McpToolCallFileInput[];
  workspacePath: string;
  server?: ToolHiveInstalledServerState;
}): Promise<McpManagedFileExchangePreparation> {
  const exchange = input.server?.managedFileExchange;
  if (!exchange) {
    return { arguments: input.arguments, stagedFiles: [] };
  }
  await ensureMcpManagedFileExchangeHostPath(exchange);
  const stagedFiles: McpManagedFileExchangeStagedFile[] = [];
  let nextArguments: Record<string, unknown> = { ...input.arguments };

  for (const fileInput of input.fileInputs ?? []) {
    const staged = await stageInlineContent({
      exchange,
      argumentPath: fileInput.argumentPath,
      content: fileInput.content,
      filename: fileInput.filename,
      source: "explicit-inline",
    });
    nextArguments = setJsonArgumentPath(nextArguments, fileInput.argumentPath, staged.containerPath);
    stagedFiles.push(staged);
  }

  nextArguments = await stageImplicitArgumentFiles({
    value: nextArguments,
    path: [],
    workspacePath: input.workspacePath,
    exchange,
    stagedFiles,
  }) as Record<string, unknown>;

  return { arguments: nextArguments, stagedFiles, exchange };
}

async function stageImplicitArgumentFiles(input: {
  value: unknown;
  path: string[];
  workspacePath: string;
  exchange: McpManagedFileExchange;
  stagedFiles: McpManagedFileExchangeStagedFile[];
}): Promise<unknown> {
  if (typeof input.value === "string") {
    const argumentPath = input.path.join(".");
    const key = input.path[input.path.length - 1] ?? "";
    const staged = await maybeStageStringArgument({
      key,
      value: input.value,
      argumentPath,
      workspacePath: input.workspacePath,
      exchange: input.exchange,
    });
    if (staged) {
      input.stagedFiles.push(staged);
      return staged.containerPath;
    }
    return input.value;
  }
  if (Array.isArray(input.value)) {
    return Promise.all(input.value.map((entry, index) => stageImplicitArgumentFiles({
      ...input,
      value: entry,
      path: [...input.path, String(index)],
    })));
  }
  if (isPlainObject(input.value)) {
    const entries = await Promise.all(Object.entries(input.value).map(async ([key, entry]) => [
      key,
      await stageImplicitArgumentFiles({
        ...input,
        value: entry,
        path: [...input.path, key],
      }),
    ] as const));
    return Object.fromEntries(entries);
  }
  return input.value;
}

async function maybeStageStringArgument(input: {
  key: string;
  value: string;
  argumentPath: string;
  workspacePath: string;
  exchange: McpManagedFileExchange;
}): Promise<McpManagedFileExchangeStagedFile | undefined> {
  if (!input.argumentPath || input.value.startsWith(`${input.exchange.containerPath}/`)) return undefined;
  if (looksInlineFileContent(input.key, input.value)) {
    return stageInlineContent({
      exchange: input.exchange,
      argumentPath: input.argumentPath,
      content: input.value,
      filename: suggestedInlineFilename(input.key, input.value),
      source: "inline-argument",
    });
  }
  const resolvedPath = resolveWorkspaceFileArgument(input.value, input.workspacePath);
  if (resolvedPath) {
    try {
      const info = await stat(resolvedPath);
      if (info.isFile()) {
        return stageWorkspaceFile({
          exchange: input.exchange,
          argumentPath: input.argumentPath,
          path: resolvedPath,
          filename: basename(resolvedPath),
          bytes: info.size,
        });
      }
    } catch {
      // Not an existing workspace file; fall through to output-path handling.
    }
  }
  if (looksOutputPathArgument(input.key, input.value)) {
    const filename = safeFileName(basename(input.value) || `${safeFileSegment(input.key)}.out`);
    const hostPath = join(input.exchange.hostPath, uniqueFileName(input.argumentPath, filename, ""));
    await ensureMcpManagedFileExchangeHostPath(input.exchange);
    await writeFile(hostPath, "", { encoding: "utf8", flag: "a", mode: MCP_MANAGED_FILE_EXCHANGE_OUTPUT_FILE_MODE });
    await chmod(hostPath, MCP_MANAGED_FILE_EXCHANGE_OUTPUT_FILE_MODE).catch(() => undefined);
    return {
      source: "output-path",
      argumentPath: input.argumentPath,
      filename,
      hostPath,
      containerPath: `${input.exchange.containerPath}/${basename(hostPath)}`,
      bytes: 0,
    };
  }
  return undefined;
}

async function stageInlineContent(input: {
  exchange: McpManagedFileExchange;
  argumentPath: string;
  content: string;
  filename: string | undefined;
  source: "explicit-inline" | "inline-argument";
}): Promise<McpManagedFileExchangeStagedFile> {
  const bytes = Buffer.byteLength(input.content, "utf8");
  if (bytes > maxInlineFileInputBytes) {
    throw new Error(`MCP staged file input for ${input.argumentPath} is too large (${bytes} bytes). Write it to the workspace and pass a workspace-relative path instead.`);
  }
  const filename = safeFileName(input.filename ?? suggestedInlineFilename(input.argumentPath, input.content));
  const hostPath = join(input.exchange.hostPath, uniqueFileName(input.argumentPath, filename, input.content));
  await ensureMcpManagedFileExchangeHostPath(input.exchange);
  await writeFile(hostPath, input.content, { encoding: "utf8", mode: MCP_MANAGED_FILE_EXCHANGE_INPUT_FILE_MODE });
  await chmod(hostPath, MCP_MANAGED_FILE_EXCHANGE_INPUT_FILE_MODE).catch(() => undefined);
  return {
    source: input.source,
    argumentPath: input.argumentPath,
    filename,
    hostPath,
    containerPath: `${input.exchange.containerPath}/${basename(hostPath)}`,
    bytes,
  };
}

async function stageWorkspaceFile(input: {
  exchange: McpManagedFileExchange;
  argumentPath: string;
  path: string;
  filename: string;
  bytes: number;
}): Promise<McpManagedFileExchangeStagedFile> {
  const filename = safeFileName(input.filename);
  const hostPath = join(input.exchange.hostPath, uniqueFileName(input.argumentPath, filename, input.path));
  await ensureMcpManagedFileExchangeHostPath(input.exchange);
  await copyFile(input.path, hostPath);
  await chmod(hostPath, MCP_MANAGED_FILE_EXCHANGE_INPUT_FILE_MODE).catch(() => undefined);
  return {
    source: "workspace-file",
    argumentPath: input.argumentPath,
    filename,
    hostPath,
    containerPath: `${input.exchange.containerPath}/${basename(hostPath)}`,
    bytes: input.bytes,
  };
}

function resolveWorkspaceFileArgument(value: string, workspacePath: string): string | undefined {
  if (value.includes("\n") || looksUrlLike(value) || value.startsWith("~/")) return undefined;
  if (!looksPathLike(value)) return undefined;
  const workspaceRoot = resolve(workspacePath);
  const resolved = isAbsolute(value) ? resolve(value) : resolve(workspaceRoot, value);
  const workspaceRelative = relative(workspaceRoot, resolved);
  if (workspaceRelative === "" || workspaceRelative.startsWith("..") || isAbsolute(workspaceRelative)) return undefined;
  return resolved;
}

function setJsonArgumentPath(root: Record<string, unknown>, argumentPath: string, value: unknown): Record<string, unknown> {
  const parts = argumentPath.split(".").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error("MCP staged file argumentPath must name at least one argument field.");
  const next = { ...root };
  let cursor: Record<string, unknown> = next;
  for (const part of parts.slice(0, -1)) {
    const existing = cursor[part];
    const child = isPlainObject(existing) ? { ...existing } : {};
    cursor[part] = child;
    cursor = child;
  }
  cursor[parts[parts.length - 1]!] = value;
  return next;
}

function looksInlineFileContent(key: string, value: string): boolean {
  if (!value.includes("\n")) return false;
  if (looksSecretLike(value)) return false;
  return keyHasPart(key, ["file", "path", "csv", "tsv", "jsonl", "json", "input", "dataset", "spreadsheet", "content"]);
}

function looksOutputPathArgument(key: string, value: string): boolean {
  if (!keyHasPart(key, ["output", "out", "dest", "destination", "save", "target", "write"])) return false;
  if (value.includes("\n") || looksUrlLike(value) || value.startsWith("/")) return false;
  return looksPathLike(value);
}

function keyHasPart(key: string, parts: string[]): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => parts.includes(token));
}

function looksPathLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 1_000 || looksSecretLike(trimmed)) return false;
  if (trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.startsWith("/")) return true;
  if (trimmed.includes("/")) return true;
  return /\.(?:csv|tsv|json|jsonl|txt|xml|html|htm|md|parquet|xlsx?)$/i.test(trimmed);
}

function looksUrlLike(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function suggestedInlineFilename(key: string, content: string): string {
  const extension = keyHasPart(key, ["csv"]) || looksCsvLike(content)
    ? "csv"
    : keyHasPart(key, ["jsonl"])
      ? "jsonl"
      : keyHasPart(key, ["json"])
        ? "json"
        : "txt";
  return `${safeFileSegment(key || "input")}.${extension}`;
}

function looksCsvLike(content: string): boolean {
  const lines = content.trim().split(/\r?\n/).slice(0, 3);
  return lines.length >= 2 && lines.every((line) => line.includes(","));
}

function uniqueFileName(argumentPath: string, filename: string, seed: string): string {
  const extension = extname(filename);
  const stem = safeFileSegment(filename.slice(0, filename.length - extension.length) || filename);
  const hash = sha256Hex(`${argumentPath}\0${filename}\0${seed}`).slice(0, 12);
  return `${stem}-${hash}${extension || ".dat"}`;
}

function safeFileName(value: string): string {
  const normalized = value.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "input.dat";
  const extension = extname(normalized).replace(/[^A-Za-z0-9.]/g, "").slice(0, 16);
  const stem = safeFileSegment(normalized.slice(0, normalized.length - extension.length) || "input");
  return `${stem}${extension || ".dat"}`;
}

function safeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "mcp-file";
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function referencedManagedContainerPaths(text: string, containerRoot: string): string[] {
  const escapedRoot = containerRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedRoot}/[^\\s"'<>),;]+`, "g");
  const matches = text.match(pattern) ?? [];
  return [...new Set(matches.map((match) => match.replace(/[.]+$/, "")))];
}

function managedContainerPathToHostPath(exchange: McpManagedFileExchange, containerPath: string): string | undefined {
  const prefix = `${exchange.containerPath}/`;
  if (!containerPath.startsWith(prefix)) return undefined;
  const relativeContainerPath = containerPath.slice(prefix.length);
  if (!relativeContainerPath || relativeContainerPath.includes("/") || relativeContainerPath.includes("\\")) return undefined;
  if (relativeContainerPath === "." || relativeContainerPath === ".." || relativeContainerPath.includes("..")) return undefined;
  return join(exchange.hostPath, relativeContainerPath);
}

function managedExchangeWorkspaceArtifactPath(workloadName: string, hostPath: string, bytes: number): string {
  const date = new Date().toISOString().slice(0, 10);
  const filename = safeFileName(basename(hostPath));
  const extension = extname(filename);
  const stem = safeFileSegment(filename.slice(0, filename.length - extension.length) || filename);
  const hash = sha256Hex(`${hostPath}\0${bytes}`).slice(0, 12);
  return join(".ambient", "mcp-outputs", date, `${safeFileSegment(workloadName)}-${stem}-${hash}${extension || ".dat"}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function looksSecretLike(value: string): boolean {
  return /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,})\b/i.test(value);
}
