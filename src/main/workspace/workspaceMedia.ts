import { randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, resolve } from "node:path";
import { Readable } from "node:stream";
import type { Protocol } from "electron";
import { WORKSPACE_MEDIA_SCHEME, type WorkspaceMediaUrlInput } from "../../shared/workspaceMedia";
import { NOFOLLOW_OPEN_FLAG, resolveWorkspacePathForRead } from "./workspacePathResolver";

interface WorkspaceMediaRecord extends WorkspaceMediaUrlInput {
  token: string;
  createdAtMs: number;
}

export type ByteRange =
  | { kind: "full"; start: 0; end: number }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

export class WorkspaceMediaServer {
  private readonly records = new Map<string, WorkspaceMediaRecord>();

  constructor(private readonly isWorkspaceAvailable: (workspacePath: string) => boolean) {}

  createUrl(input: WorkspaceMediaUrlInput): string {
    const token = randomUUID();
    this.records.set(token, { ...input, token, createdAtMs: Date.now() });
    return `${WORKSPACE_MEDIA_SCHEME}://workspace/${token}/${encodeURIComponent(basename(input.absolutePath))}`;
  }

  async handleRequest(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const token = tokenFromMediaUrl(request.url);
    const record = token ? this.records.get(token) : undefined;
    if (!record) return new Response("Media token was not found.", { status: 404 });

    const recordWorkspace = resolve(record.workspacePath);
    if (!this.isWorkspaceAvailable(recordWorkspace)) {
      this.records.delete(record.token);
      return new Response("Media token is no longer valid for this workspace.", { status: 403 });
    }

    const targetPath = await this.resolveRecordTarget(record);
    if (!targetPath) {
      this.records.delete(record.token);
      return new Response("Media token is no longer valid for this workspace.", { status: 403 });
    }

    let handle: FileHandle;
    try {
      handle = await open(targetPath, fsConstants.O_RDONLY | NOFOLLOW_OPEN_FLAG);
    } catch {
      this.records.delete(record.token);
      return new Response("Media token is no longer valid for this workspace.", { status: 403 });
    }

    const current = await handle.stat();
    if (!current.isFile()) {
      await handle.close();
      return new Response("Media target is not a file.", { status: 404 });
    }
    if (current.size !== record.size || Math.trunc(current.mtimeMs) !== Math.trunc(record.mtimeMs ?? current.mtimeMs)) {
      await handle.close();
      this.records.delete(record.token);
      return new Response("Media file changed. Reload the preview.", { status: 409 });
    }

    const range = parseByteRangeHeader(request.headers.get("range"), current.size);
    if (range.kind === "unsatisfiable") {
      await handle.close();
      return new Response(null, {
        status: 416,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes */${current.size}`,
        },
      });
    }

    const headers = mediaHeaders(record, current.size, range);
    const body =
      request.method === "HEAD"
        ? null
        : (Readable.toWeb(handle.createReadStream({ start: range.start, end: range.end })) as unknown as BodyInit);
    if (request.method === "HEAD") await handle.close();
    return new Response(body, { status: range.kind === "partial" ? 206 : 200, headers });
  }

  private async resolveRecordTarget(record: WorkspaceMediaRecord): Promise<string | undefined> {
    if (record.allowExternal) return resolve(record.absolutePath);
    try {
      const resolvedPath = await resolveWorkspacePathForRead(record.workspacePath, record.relativePath);
      if (record.realPath && resolve(record.realPath) !== resolvedPath.realPath) return undefined;
      return resolvedPath.realPath;
    } catch {
      return undefined;
    }
  }
}

export function registerWorkspaceMediaProtocol(protocolApi: Protocol, server: WorkspaceMediaServer): void {
  protocolApi.handle(WORKSPACE_MEDIA_SCHEME, (request) => server.handleRequest(request));
}

export function parseByteRangeHeader(header: string | null, size: number): ByteRange {
  if (size <= 0) return { kind: "full", start: 0, end: 0 };
  if (!header) return { kind: "full", start: 0, end: size - 1 };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: "unsatisfiable" };

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return { kind: "unsatisfiable" };

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { kind: "unsatisfiable" };
    const start = Math.max(0, size - suffixLength);
    return { kind: "partial", start, end: size - 1 };
  }

  const start = Number(rawStart);
  const requestedEnd = rawEnd ? Number(rawEnd) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start > requestedEnd || start >= size) {
    return { kind: "unsatisfiable" };
  }

  return { kind: "partial", start, end: Math.min(requestedEnd, size - 1) };
}

function tokenFromMediaUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${WORKSPACE_MEDIA_SCHEME}:` || parsed.hostname !== "workspace") return undefined;
    return parsed.pathname.split("/").filter(Boolean)[0];
  } catch {
    return undefined;
  }
}

function mediaHeaders(record: WorkspaceMediaRecord, size: number, range: Exclude<ByteRange, { kind: "unsatisfiable" }>): Headers {
  const contentLength = Math.max(0, range.end - range.start + 1);
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Length": String(contentLength),
    "Content-Type": record.mimeType || "application/octet-stream",
  });
  if (range.kind === "partial") {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  }
  return headers;
}
