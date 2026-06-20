import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createActiveWorkspaceFileService,
  type ActiveWorkspaceFileStore,
  type ActiveWorkspaceFileThread,
} from "./activeWorkspaceFileService";

interface FakeThread extends ActiveWorkspaceFileThread {
  id: string;
}

class FakeStore implements ActiveWorkspaceFileStore<FakeThread> {
  constructor(
    private readonly thread: FakeThread,
    private readonly artifactWorkspacePath: string,
  ) {}

  getThread(threadId: string): FakeThread {
    if (threadId !== this.thread.id) throw new Error(`Missing thread ${threadId}`);
    return this.thread;
  }

  getProjectArtifactWorkspacePath(): string {
    return this.artifactWorkspacePath;
  }
}

interface FakeHost {
  store: FakeStore;
}

function createHarness(input: {
  workspacePath?: string;
  artifactWorkspacePath?: string;
  specialPaths?: Partial<Record<"home" | "downloads" | "desktop" | "documents", string | Error>>;
  pathExists?: (path: string) => boolean;
} = {}) {
  const thread = {
    id: "thread-1",
    workspacePath: input.workspacePath ?? "/workspace",
  };
  const store = new FakeStore(thread, input.artifactWorkspacePath ?? "/workspace/.ambient-artifacts");
  const host = { store };
  const specialPaths = {
    home: "/Users/test",
    downloads: "/Users/test/Downloads",
    desktop: "/Users/test/Desktop",
    documents: "/Users/test/Documents",
    ...input.specialPaths,
  };
  const service = createActiveWorkspaceFileService<FakeThread, FakeStore, FakeHost>({
    activeHost: () => host,
    activeThreadIdForHost: () => thread.id,
    activeWorkspacePath: () => thread.workspacePath,
    defaultStore: () => store,
    getAppPath: (name) => {
      const value = specialPaths[name];
      if (value instanceof Error) throw value;
      return value;
    },
    normalizePath: (path) => path.replace(/\\/g, "/"),
    pathExists: input.pathExists ?? existsSync,
    createMediaUrl: (media) => `media:${media.relativePath}`,
    createOfficePreview: vi.fn(async () => undefined),
  });
  return { host, service, store, thread };
}

describe("activeWorkspaceFileService", () => {
  it("builds active workspace contexts and reads workspace files with artifact routing preserved", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-active-workspace-files-"));
    const artifactWorkspace = await mkdtemp(join(tmpdir(), "ambient-active-workspace-artifacts-"));
    try {
      await mkdir(join(workspace, "docs"));
      await writeFile(join(workspace, "docs", "note.md"), "# Note\n\nHello from workspace.\n", "utf8");
      const { host, service, thread } = createHarness({
        workspacePath: workspace,
        artifactWorkspacePath: artifactWorkspace,
      });

      expect(service.activeWorkspaceFileContextForProjectHost()).toEqual({
        host,
        targetStore: host.store,
        threadId: "thread-1",
        thread,
        workspacePath: workspace,
      });
      expect(service.workspacePathForRelativeArtifactPath(".ambient\\board\\plans\\plan.html", host.store, workspace)).toBe(
        artifactWorkspace,
      );

      await expect(service.readActiveWorkspaceFile("docs/note.md")).resolves.toMatchObject({
        path: "docs/note.md",
        content: "# Note\n\nHello from workspace.\n",
        source: "workspace",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(artifactWorkspace, { recursive: true, force: true });
    }
  });

  it("previews absolute local files after applying the local preview boundary", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-active-local-preview-"));
    try {
      await mkdir(join(workspace, "docs"));
      const localPath = join(workspace, "docs", "brief.md");
      await writeFile(localPath, "# Brief\n\nPreview me.\n", "utf8");
      const { service } = createHarness({ workspacePath: workspace });

      await expect(service.readActiveLocalFilePreview(localPath, workspace)).resolves.toMatchObject({
        path: localPath,
        absolutePath: localPath,
        source: "local",
        content: "# Brief\n\nPreview me.\n",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("normalizes file URLs and home-relative local file paths before existence checks", () => {
    const spacedPath = "/tmp/Ambient Path With Spaces.txt";
    const homePath = resolve("/Users/test", "Downloads/brief.pdf");
    const existing = new Set([spacedPath, homePath]);
    const { service } = createHarness({
      pathExists: (path) => existing.has(path),
    });

    expect(service.resolveLocalFilePath(` ${pathToFileURL(spacedPath).href} `)).toBe(spacedPath);
    expect(service.resolveLocalFilePath("~/Downloads/brief.pdf")).toBe(homePath);
    expect(() => service.resolveLocalFilePath("")).toThrow("Local file path is required.");
    expect(() => service.resolveLocalFilePath("relative/path.txt")).toThrow("Local file path must be absolute");
    expect(() => service.resolveLocalFilePath("/tmp/missing.txt")).toThrow("Local file does not exist");
  });

  it("allows previews inside workspace or safe user folders and rejects other local paths", () => {
    const { service } = createHarness({
      workspacePath: "/workspace",
      specialPaths: {
        desktop: new Error("desktop unavailable"),
      },
      pathExists: () => true,
    });

    expect(service.resolveLocalPreviewPath("/workspace/report.md", "/workspace")).toBe("/workspace/report.md");
    expect(service.resolveLocalPreviewPath("/Users/test/Downloads/report.pdf", "/workspace")).toBe("/Users/test/Downloads/report.pdf");
    expect(service.resolveLocalPreviewPath("/Users/test/Documents/report.pdf", "/workspace")).toBe("/Users/test/Documents/report.pdf");
    expect(() => service.resolveLocalPreviewPath("/private/secret.txt", "/workspace")).toThrow(
      "Local file preview is limited to the current workspace, Downloads, Desktop, and Documents.",
    );
  });
});
