import { describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseByteRangeHeader, WorkspaceMediaServer } from "./workspaceMedia";

describe("parseByteRangeHeader", () => {
  it("parses full and partial byte ranges", () => {
    expect(parseByteRangeHeader(null, 100)).toEqual({ kind: "full", start: 0, end: 99 });
    expect(parseByteRangeHeader("bytes=10-19", 100)).toEqual({ kind: "partial", start: 10, end: 19 });
    expect(parseByteRangeHeader("bytes=90-", 100)).toEqual({ kind: "partial", start: 90, end: 99 });
    expect(parseByteRangeHeader("bytes=-10", 100)).toEqual({ kind: "partial", start: 90, end: 99 });
    expect(parseByteRangeHeader("bytes=95-120", 100)).toEqual({ kind: "partial", start: 95, end: 99 });
  });

  it("rejects invalid or unsatisfiable ranges", () => {
    expect(parseByteRangeHeader("items=0-1", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseByteRangeHeader("bytes=20-10", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseByteRangeHeader("bytes=100-120", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseByteRangeHeader("bytes=-0", 100)).toEqual({ kind: "unsatisfiable" });
  });
});

describe("WorkspaceMediaServer", () => {
  it("serves registered workspace media with range headers", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workspace-media-"));
    try {
      const mediaPath = join(workspace, "clip.webm");
      const bytes = Buffer.from("0123456789", "utf8");
      await writeFile(mediaPath, bytes);

      const server = availableWorkspaceMediaServer(workspace);
      const mediaUrl = server.createUrl({
        workspacePath: workspace,
        absolutePath: mediaPath,
        relativePath: "clip.webm",
        mimeType: "video/webm",
        size: bytes.length,
      });
      expect(mediaUrl).toMatch(/^ambient-media:\/\/workspace\/[^/]+\/clip\.webm$/);

      const response = await server.handleRequest(new Request(mediaUrl, { headers: { Range: "bytes=2-5" } }));
      expect(response.status).toBe(206);
      expect(response.headers.get("Content-Type")).toBe("video/webm");
      expect(response.headers.get("Accept-Ranges")).toBe("bytes");
      expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10");
      expect(response.headers.get("Content-Length")).toBe("4");
      expect(await response.text()).toBe("2345");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects media tokens when the owner workspace is unavailable", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workspace-media-"));
    const otherWorkspace = await mkdtemp(join(tmpdir(), "ambient-workspace-media-other-"));
    try {
      const mediaPath = join(workspace, "sound.mp3");
      await writeFile(mediaPath, Buffer.from("media", "utf8"));

      const server = availableWorkspaceMediaServer(otherWorkspace);
      const mediaUrl = server.createUrl({
        workspacePath: workspace,
        absolutePath: mediaPath,
        relativePath: "sound.mp3",
        mimeType: "audio/mpeg",
        size: 5,
      });

      const response = await server.handleRequest(new Request(mediaUrl));
      expect(response.status).toBe(403);
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(otherWorkspace, { recursive: true, force: true });
    }
  });

  it("serves media from any loaded owner workspace without depending on active workspace focus", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workspace-media-"));
    const otherWorkspace = await mkdtemp(join(tmpdir(), "ambient-workspace-media-other-"));
    try {
      const mediaPath = join(workspace, "sound.mp3");
      await writeFile(mediaPath, Buffer.from("media", "utf8"));

      const server = availableWorkspaceMediaServer(workspace, otherWorkspace);
      const mediaUrl = server.createUrl({
        workspacePath: workspace,
        absolutePath: mediaPath,
        relativePath: "sound.mp3",
        mimeType: "audio/mpeg",
        size: 5,
      });

      const response = await server.handleRequest(new Request(mediaUrl));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("media");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(otherWorkspace, { recursive: true, force: true });
    }
  });

  it("rejects workspace media when a symlink resolves outside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workspace-media-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-workspace-media-outside-"));
    try {
      const outsidePath = join(outside, "clip.webm");
      const bytes = Buffer.from("outside-media", "utf8");
      await writeFile(outsidePath, bytes);
      const mediaPath = join(workspace, "clip.webm");
      await symlink(outsidePath, mediaPath);

      const server = availableWorkspaceMediaServer(workspace);
      const mediaUrl = server.createUrl({
        workspacePath: workspace,
        absolutePath: mediaPath,
        relativePath: "clip.webm",
        mimeType: "video/webm",
        size: bytes.length,
      });

      const response = await server.handleRequest(new Request(mediaUrl));
      expect(response.status).toBe(403);
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("invalidates workspace media tokens when the target is replaced by an escaping symlink", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workspace-media-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-workspace-media-outside-"));
    try {
      const mediaPath = join(workspace, "clip.webm");
      const bytes = Buffer.from("0123456789", "utf8");
      await writeFile(mediaPath, bytes);
      const outsidePath = join(outside, "clip.webm");
      await writeFile(outsidePath, bytes);

      const server = availableWorkspaceMediaServer(workspace);
      const mediaUrl = server.createUrl({
        workspacePath: workspace,
        absolutePath: mediaPath,
        relativePath: "clip.webm",
        realPath: mediaPath,
        mimeType: "video/webm",
        size: bytes.length,
      });

      await rm(mediaPath);
      await symlink(outsidePath, mediaPath);

      const response = await server.handleRequest(new Request(mediaUrl));
      expect(response.status).toBe(403);
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("serves workspace media when a symlink resolves inside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workspace-media-"));
    try {
      const targetPath = join(workspace, "target.webm");
      const bytes = Buffer.from("0123456789", "utf8");
      await writeFile(targetPath, bytes);
      const mediaPath = join(workspace, "clip.webm");
      await symlink(targetPath, mediaPath);

      const server = availableWorkspaceMediaServer(workspace);
      const mediaUrl = server.createUrl({
        workspacePath: workspace,
        absolutePath: mediaPath,
        relativePath: "clip.webm",
        mimeType: "video/webm",
        size: bytes.length,
      });

      const response = await server.handleRequest(new Request(mediaUrl));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("0123456789");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("serves explicitly registered external cache files while the owner workspace is available", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workspace-media-"));
    const cache = await mkdtemp(join(tmpdir(), "ambient-workspace-media-cache-"));
    try {
      const mediaPath = join(cache, "preview.pdf");
      await writeFile(mediaPath, Buffer.from("pdf", "utf8"));

      const server = availableWorkspaceMediaServer(workspace);
      const mediaUrl = server.createUrl({
        workspacePath: workspace,
        absolutePath: mediaPath,
        relativePath: ".ambient-office-preview/preview.pdf",
        mimeType: "application/pdf",
        size: 3,
        allowExternal: true,
      });

      const response = await server.handleRequest(new Request(mediaUrl));
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/pdf");
      expect(await response.text()).toBe("pdf");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(cache, { recursive: true, force: true });
    }
  });

  it("returns 416 for unsatisfiable ranges", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workspace-media-"));
    try {
      const mediaPath = join(workspace, "sound.mp3");
      await writeFile(mediaPath, Buffer.from("media", "utf8"));

      const server = availableWorkspaceMediaServer(workspace);
      const mediaUrl = server.createUrl({
        workspacePath: workspace,
        absolutePath: mediaPath,
        relativePath: "sound.mp3",
        mimeType: "audio/mpeg",
        size: 5,
      });

      const response = await server.handleRequest(new Request(mediaUrl, { headers: { Range: "bytes=10-20" } }));
      expect(response.status).toBe(416);
      expect(response.headers.get("Content-Range")).toBe("bytes */5");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function availableWorkspaceMediaServer(...workspaces: string[]): WorkspaceMediaServer {
  const available = new Set(workspaces.map((workspace) => resolve(workspace)));
  return new WorkspaceMediaServer((workspacePath) => available.has(resolve(workspacePath)));
}
