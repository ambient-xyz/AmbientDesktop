import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { AmbientPermissionGrant } from "../../shared/permissionTypes";
import {
  createActiveWorkspaceFileService,
  type ActiveWorkspaceFileStore,
  type ActiveWorkspaceFileThread,
} from "./activeWorkspaceFileService";
import { createLocalFolderAllowlistGrantInput } from "./workspacePermissionsFacade";

interface FakeThread extends ActiveWorkspaceFileThread {
  id: string;
  permissionMode: "workspace";
}

class FakeStore implements ActiveWorkspaceFileStore<FakeThread> {
  constructor(
    private readonly thread: FakeThread,
    private readonly artifactWorkspacePath: string,
    private readonly grants: AmbientPermissionGrant[] = [],
  ) {}

  getThread(threadId: string): FakeThread {
    if (threadId !== this.thread.id) throw new Error(`Missing thread ${threadId}`);
    return this.thread;
  }

  getProjectArtifactWorkspacePath(): string {
    return this.artifactWorkspacePath;
  }

  getWorkspace(): { path: string } {
    return { path: this.thread.workspacePath };
  }

  listPermissionGrants(): readonly AmbientPermissionGrant[] {
    return this.grants;
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
  realpath?: (path: string) => string;
  grants?: AmbientPermissionGrant[];
} = {}) {
  const thread = {
    id: "thread-1",
    workspacePath: input.workspacePath ?? "/workspace",
    permissionMode: "workspace" as const,
  };
  const store = new FakeStore(thread, input.artifactWorkspacePath ?? "/workspace/.ambient-artifacts", input.grants);
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
    realpath: input.realpath ?? ((path) => path),
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
      const context = service.activeWorkspaceFileContextForProjectHost();

      await expect(service.readActiveLocalFilePreview(localPath, context)).resolves.toMatchObject({
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

  it("allows previews inside workspace or thread-allowlisted folders and rejects other local paths", () => {
    const grant = localFolderGrant("/Users/test/Downloads", "thread-1", "/workspace");
    const { service } = createHarness({
      workspacePath: "/workspace",
      pathExists: () => true,
      grants: [grant],
    });
    const context = service.activeWorkspaceFileContextForProjectHost();

    expect(service.resolveLocalPreviewPath("/workspace/report.md", context)).toBe("/workspace/report.md");
    expect(service.resolveLocalPreviewPath("/Users/test/Downloads/report.pdf", context)).toBe("/Users/test/Downloads/report.pdf");
    expect(() => service.resolveLocalPreviewPath("/Users/test/Documents/report.pdf", context)).toThrow(
      "Local file preview is limited to the current workspace or folders explicitly allowed for this thread.",
    );
    expect(() => service.resolveLocalPreviewPath("/private/secret.txt", context)).toThrow(
      "Local file preview is limited to the current workspace or folders explicitly allowed for this thread.",
    );
  });

  it("does not let a thread folder allowlist grant preview symlink escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-active-local-allowlist-"));
    const workspace = join(root, "workspace");
    const allowed = join(root, "allowed");
    const outside = join(root, "outside");
    try {
      await mkdir(workspace);
      await mkdir(allowed);
      await mkdir(outside);
      await writeFile(join(outside, "secret.txt"), "not allowed\n", "utf8");
      await symlink(join(outside, "secret.txt"), join(allowed, "linked-secret.txt"));
      const { service } = createHarness({
        workspacePath: workspace,
        grants: [localFolderGrant(allowed, "thread-1", workspace)],
        realpath: (path) => resolve(path).includes("linked-secret.txt") ? join(outside, "secret.txt") : resolve(path),
      });

      expect(() => service.resolveLocalPreviewPath(join(allowed, "linked-secret.txt"))).toThrow(
        "Local file preview is limited to the current workspace or folders explicitly allowed for this thread.",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function localFolderGrant(folderPath: string, threadId: string, workspacePath: string): AmbientPermissionGrant {
  const input = createLocalFolderAllowlistGrantInput({
    folderPath,
    threadId,
    workspacePath,
    permissionMode: "workspace",
  });
  return {
    id: `grant:${folderPath}`,
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    ...input,
    createdBy: input.createdBy ?? "user",
    source: input.source ?? "settings",
  };
}
