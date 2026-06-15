import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const LOCAL_PREVIEW_SERVER_TTL_MS = 10 * 60_000;

export interface LocalPreviewSession {
  id: string;
  url: string;
  port: number;
  status: "started" | "reused";
  rootPath: string;
  requestedPath: string;
  workspaceRelativeRoot: string;
  workspaceRelativeRequestedPath: string;
  expiresAt: string;
}

interface LocalPreviewServerRecord extends LocalPreviewSession {
  server: Server;
  timer: ReturnType<typeof setTimeout>;
  expiresAtMs: number;
}

export class LocalPreviewServerManager {
  private readonly records = new Map<string, LocalPreviewServerRecord>();

  async open(input: { workspacePath: string; path: string; ttlMs?: number }): Promise<LocalPreviewSession> {
    this.closeExpired();
    const targetPath = resolveWorkspacePath(input.workspacePath, input.path);
    const targetStat = await stat(targetPath).catch(() => undefined);
    if (!targetStat) throw new Error(`Local preview target was not found: ${workspaceRelativePath(input.workspacePath, targetPath)}`);
    if (!targetStat.isFile() && !targetStat.isDirectory()) {
      throw new Error(`Local preview target must be a file or directory: ${workspaceRelativePath(input.workspacePath, targetPath)}`);
    }

    const rootPath = targetStat.isDirectory() ? targetPath : dirname(targetPath);
    await mkdir(rootPath, { recursive: true });
    const initialPath = targetStat.isDirectory() ? "/" : `/${encodePathSegment(basename(targetPath))}`;
    const ttlMs = Math.max(1_000, Math.floor(input.ttlMs ?? LOCAL_PREVIEW_SERVER_TTL_MS));
    const existing = this.findOpenRecord(rootPath, targetPath);
    if (existing) {
      this.refreshRecord(existing, ttlMs);
      return publicSession(existing, "reused");
    }

    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const server = createServer((request, response) => {
      void serveWorkspaceFile(rootPath, request.url ?? "/", response);
    });
    await listen(server);
    server.unref?.();
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Local preview server did not bind a TCP port.");
    }
    const expiresAtMs = Date.now() + ttlMs;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const timer = setTimeout(() => {
      void this.close(id);
    }, ttlMs);
    timer.unref?.();
    const record: LocalPreviewServerRecord = {
      id,
      server,
      timer,
      expiresAtMs,
      status: "started",
      port: address.port,
      rootPath,
      requestedPath: targetPath,
      workspaceRelativeRoot: workspaceRelativePath(input.workspacePath, rootPath),
      workspaceRelativeRequestedPath: workspaceRelativePath(input.workspacePath, targetPath),
      url: `http://127.0.0.1:${address.port}${initialPath}`,
      expiresAt,
    };
    this.records.set(id, record);
    return publicSession(record, "started");
  }

  async close(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) return;
    this.records.delete(id);
    clearTimeout(record.timer);
    await new Promise<void>((resolve) => {
      record.server.close(() => resolve());
    });
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.records.keys()].map((id) => this.close(id)));
  }

  private closeExpired(): void {
    const now = Date.now();
    for (const record of [...this.records.values()]) {
      if (record.expiresAtMs <= now) void this.close(record.id);
    }
  }

  private findOpenRecord(rootPath: string, requestedPath: string): LocalPreviewServerRecord | undefined {
    const now = Date.now();
    for (const record of this.records.values()) {
      if (record.expiresAtMs <= now) continue;
      if (record.rootPath === rootPath && record.requestedPath === requestedPath) return record;
    }
    return undefined;
  }

  private refreshRecord(record: LocalPreviewServerRecord, ttlMs: number): void {
    clearTimeout(record.timer);
    record.expiresAtMs = Date.now() + ttlMs;
    record.expiresAt = new Date(record.expiresAtMs).toISOString();
    record.timer = setTimeout(() => {
      void this.close(record.id);
    }, ttlMs);
    record.timer.unref?.();
  }
}

export function localPreviewSummary(session: LocalPreviewSession): string {
  return [
    session.status === "reused" ? "Managed local preview reused." : "Managed local preview started.",
    `URL: ${session.url}`,
    `Session: ${session.id} (${session.status})`,
    `Target: ${session.workspaceRelativeRequestedPath}`,
    `Root: ${session.workspaceRelativeRoot}`,
    `Expires: ${session.expiresAt}`,
  ].join("\n");
}

function resolveWorkspacePath(workspacePath: string, inputPath: string): string {
  const workspace = resolve(workspacePath);
  const target = isAbsolute(inputPath) ? resolve(inputPath) : resolve(workspace, inputPath);
  if (!isPathInside(workspace, target)) throw new Error("Local preview path must stay inside the current workspace.");
  return target;
}

function workspaceRelativePath(workspacePath: string, targetPath: string): string {
  const relativePath = relative(resolve(workspacePath), resolve(targetPath));
  return relativePath || ".";
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
}

async function serveWorkspaceFile(rootPath: string, rawUrl: string, response: ServerResponse): Promise<void> {
  if (rawUrl.includes("\0")) {
    sendText(response, 400, "Bad request.");
    return;
  }
  let pathname = "/";
  try {
    pathname = new URL(rawUrl, "http://127.0.0.1").pathname;
  } catch {
    sendText(response, 400, "Bad request.");
    return;
  }

  let decoded = "";
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendText(response, 400, "Bad request.");
    return;
  }
  const relativeRequest = decoded.replace(/^\/+/, "");
  const targetPath = resolve(rootPath, relativeRequest || ".");
  if (!isPathInside(rootPath, targetPath)) {
    sendText(response, 403, "Forbidden.");
    return;
  }
  const filePath = await resolvePreviewFile(targetPath);
  if (!filePath || !isPathInside(rootPath, filePath)) {
    sendText(response, 404, "Not found.");
    return;
  }
  response.statusCode = 200;
  response.setHeader("content-type", contentTypeForPath(filePath));
  response.setHeader("cache-control", "no-store");
  createReadStream(filePath).on("error", () => sendText(response, 500, "Failed to read preview file.")).pipe(response);
}

async function resolvePreviewFile(targetPath: string): Promise<string | undefined> {
  const targetStat = await stat(targetPath).catch(() => undefined);
  if (!targetStat) return undefined;
  if (targetStat.isFile()) return targetPath;
  if (!targetStat.isDirectory()) return undefined;
  const indexPath = join(targetPath, "index.html");
  const indexStat = await stat(indexPath).catch(() => undefined);
  return indexStat?.isFile() ? indexPath : undefined;
}

function sendText(response: ServerResponse, statusCode: number, text: string): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(text);
}

function contentTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".md":
    case ".markdown":
      return "text/plain; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const root = resolve(rootPath);
  const target = resolve(targetPath);
  return target === root || target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

function encodePathSegment(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function publicSession(record: LocalPreviewServerRecord, status: LocalPreviewSession["status"]): LocalPreviewSession {
  return {
    id: record.id,
    url: record.url,
    port: record.port,
    status,
    rootPath: record.rootPath,
    requestedPath: record.requestedPath,
    workspaceRelativeRoot: record.workspaceRelativeRoot,
    workspaceRelativeRequestedPath: record.workspaceRelativeRequestedPath,
    expiresAt: record.expiresAt,
  };
}
