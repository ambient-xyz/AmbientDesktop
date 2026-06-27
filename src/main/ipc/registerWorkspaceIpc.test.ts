import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { AmbientPermissionGrant } from "../../shared/permissionTypes";
import type {
  WorkspaceContextReference,
  WorkspaceDiff,
  WorkspaceFileContent,
  WorkspaceFileTree,
  WorkspaceGitStatus,
  WorkspaceOpenTarget,
  WorkspaceSearchInput,
  WorkspaceSearchResult,
} from "../../shared/workspaceTypes";
import {
  localFileActionIpcChannels,
  localFolderAllowlistIpcChannels,
  localFilePreviewIpcChannels,
  registerLocalFileActionIpc,
  registerLocalFolderAllowlistIpc,
  registerLocalFilePreviewIpc,
  registerWorkspaceFileIpc,
  registerWorkspaceGitStatusIpc,
  registerWorkspaceLifecycleIpc,
  registerWorkspacePathActionIpc,
  registerWorkspacePickContextIpc,
  registerWorkspaceSearchIpc,
  workspaceFileIpcChannels,
  workspaceGitStatusIpcChannels,
  workspaceLifecycleIpcChannels,
  workspacePathActionIpcChannels,
  workspacePickContextIpcChannels,
  workspaceSearchIpcChannels,
  type RegisterLocalFileActionIpcDependencies,
  type RegisterLocalFolderAllowlistIpcDependencies,
  type RegisterLocalFilePreviewIpcDependencies,
  type RegisterWorkspaceFileIpcDependencies,
  type RegisterWorkspaceGitStatusIpcDependencies,
  type RegisterWorkspaceLifecycleIpcDependencies,
  type RegisterWorkspacePathActionIpcDependencies,
  type RegisterWorkspacePickContextIpcDependencies,
  type RegisterWorkspaceSearchIpcDependencies,
  type WorkspaceFileContext,
  type WorkspaceGitStatusContext,
  type LocalFileActionContext,
  type WorkspacePathActionContext,
  type WorkspacePickContext,
} from "./registerWorkspaceIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerWorkspaceLifecycleIpc", () => {
  it("registers the workspace lifecycle channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...workspaceLifecycleIpcChannels]);
  });

  it("opens an existing workspace from the selected folder", async () => {
    const { deps, invoke } = registerWithFakes({
      dialogResult: { canceled: false, filePaths: ["/tmp/existing-workspace"] },
    });

    await expect(invoke("workspace:open")).resolves.toEqual(sampleDesktopState("/tmp/existing-workspace"));

    expect(deps.showOpenDialog).toHaveBeenCalledWith({
      title: "Use an existing folder",
      buttonLabel: "Open Project",
      properties: ["openDirectory", "createDirectory"],
    });
    expect(deps.createDirectory).not.toHaveBeenCalled();
    expect(deps.switchWorkspace).toHaveBeenCalledWith("/tmp/existing-workspace");
  });

  it("creates the selected folder before switching workspaces", async () => {
    const { deps, invoke } = registerWithFakes({
      dialogResult: { canceled: false, filePaths: ["/tmp/new-workspace"] },
    });

    await expect(invoke("workspace:create")).resolves.toEqual(sampleDesktopState("/tmp/new-workspace"));

    expect(deps.showOpenDialog).toHaveBeenCalledWith({
      title: "Start from scratch",
      buttonLabel: "Create Project",
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
    });
    expect(deps.createDirectory).toHaveBeenCalledWith("/tmp/new-workspace");
    expect(deps.switchWorkspace).toHaveBeenCalledWith("/tmp/new-workspace");
  });

  it("returns undefined when the workspace dialog is canceled", async () => {
    const { deps, invoke } = registerWithFakes({
      dialogResult: { canceled: true, filePaths: ["/tmp/ignored"] },
    });

    await expect(invoke("workspace:open")).resolves.toBeUndefined();
    await expect(invoke("workspace:create")).resolves.toBeUndefined();

    expect(deps.createDirectory).not.toHaveBeenCalled();
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
  });

  it("returns undefined when the workspace dialog has no file path", async () => {
    const { deps, invoke } = registerWithFakes({
      dialogResult: { canceled: false, filePaths: [] },
    });

    await expect(invoke("workspace:open")).resolves.toBeUndefined();
    await expect(invoke("workspace:create")).resolves.toBeUndefined();

    expect(deps.createDirectory).not.toHaveBeenCalled();
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
  });
});

describe("registerWorkspaceFileIpc", () => {
  it("registers the workspace file channels", () => {
    const { handlers } = registerWorkspaceFileWithFakes();

    expect([...handlers.keys()]).toEqual([...workspaceFileIpcChannels]);
  });

  it("lists files for the active workspace file context", async () => {
    const { deps, context, invoke, tree } = registerWorkspaceFileWithFakes();

    await expect(invoke("workspace:list-files")).resolves.toEqual(tree);

    expect(deps.activeWorkspaceFileContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.listWorkspaceFiles).toHaveBeenCalledWith(context.workspacePath);
  });

  it("reads a workspace file with the active workspace file context", async () => {
    const { deps, context, file, invoke } = registerWorkspaceFileWithFakes();

    await expect(invoke("workspace:read-file", "docs/plan.md")).resolves.toEqual(file);

    expect(deps.readActiveWorkspaceFile).toHaveBeenCalledWith("docs/plan.md", context);
    expect(deps.clearOfficePreviewRendererDiscovery).not.toHaveBeenCalled();
  });

  it("clears office preview renderer discovery before refreshing office previews", async () => {
    const { deps, context, file, invoke } = registerWorkspaceFileWithFakes();

    await expect(invoke("workspace:refresh-office-preview", "docs/brief.docx")).resolves.toEqual(file);

    expect(deps.activeWorkspaceFileContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.clearOfficePreviewRendererDiscovery.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readActiveWorkspaceFile.mock.invocationCallOrder[0],
    );
    expect(deps.readActiveWorkspaceFile).toHaveBeenCalledWith("docs/brief.docx", context);
  });
});

describe("registerLocalFilePreviewIpc", () => {
  it("registers the local file preview channels", () => {
    const { handlers } = registerLocalFilePreviewWithFakes();

    expect([...handlers.keys()]).toEqual([...localFilePreviewIpcChannels]);
  });

  it("previews a local file relative to the active workspace path", async () => {
    const { deps, context, file, invoke } = registerLocalFilePreviewWithFakes();

    await expect(invoke("local-file:preview", "/tmp/workspace/docs/brief.pdf")).resolves.toEqual(file);

    expect(deps.activeWorkspaceFileContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.readActiveLocalFilePreview).toHaveBeenCalledWith("/tmp/workspace/docs/brief.pdf", context);
    expect(deps.clearOfficePreviewRendererDiscovery).not.toHaveBeenCalled();
  });

  it("clears office preview renderer discovery before refreshing local previews", async () => {
    const { deps, context, file, invoke } = registerLocalFilePreviewWithFakes();

    await expect(invoke("local-file:refresh-office-preview", "/tmp/workspace/docs/brief.docx")).resolves.toEqual(file);

    expect(deps.activeWorkspaceFileContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.clearOfficePreviewRendererDiscovery.mock.invocationCallOrder[0]).toBeLessThan(
      deps.readActiveLocalFilePreview.mock.invocationCallOrder[0],
    );
    expect(deps.readActiveLocalFilePreview).toHaveBeenCalledWith("/tmp/workspace/docs/brief.docx", context);
  });
});

describe("registerLocalFileActionIpc", () => {
  it("registers the local file action channels", () => {
    const { handlers } = registerLocalFileActionWithFakes();

    expect([...handlers.keys()]).toEqual([...localFileActionIpcChannels]);
  });

  it("reveals a resolved local file path in the shell", async () => {
    const { context, deps, invoke, resolvedPath } = registerLocalFileActionWithFakes();

    await expect(invoke("local-file:reveal-path", "~/Downloads/brief.pdf")).resolves.toBeUndefined();

    expect(deps.resolveCanonicalLocalFilePath).toHaveBeenCalledWith("~/Downloads/brief.pdf");
    expect(deps.localPathVisibleToThread).toHaveBeenCalledWith(resolvedPath, context);
    expect(deps.showItemInFolder).toHaveBeenCalledWith(resolvedPath);
    expect(deps.openPath).not.toHaveBeenCalled();
  });

  it("rejects reveal when the local file is not visible to the active thread", async () => {
    const { deps, invoke } = registerLocalFileActionWithFakes({ visible: false });

    await expect(invoke("local-file:reveal-path", "~/Downloads/brief.pdf")).rejects.toThrow(
      "Reveal is limited to the current workspace or folders explicitly allowed for this thread.",
    );

    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });

  it("opens a resolved local file path and throws shell open errors", async () => {
    const { deps, invoke, resolvedPath } = registerLocalFileActionWithFakes({ openPathError: "No app can open this file." });

    await expect(invoke("local-file:open-path", "~/Downloads/brief.pdf")).rejects.toThrow("No app can open this file.");

    expect(deps.requestLocalFileOpenConfirmation).not.toHaveBeenCalled();
    expect(deps.openPath).toHaveBeenCalledWith(resolvedPath);
  });

  it("requires fresh confirmation before opening a local path outside the workspace", async () => {
    const { context, deps, invoke, resolvedPath } = registerLocalFileActionWithFakes({ insideWorkspace: false });

    await expect(invoke("local-file:open-path", "~/Downloads/brief.pdf")).resolves.toBeUndefined();

    expect(deps.requestLocalFileOpenConfirmation).toHaveBeenCalledWith(resolvedPath, context);
    expect(deps.openPath).toHaveBeenCalledWith(resolvedPath);
  });

  it("rejects local path opens when fresh confirmation is denied", async () => {
    const { deps, invoke } = registerLocalFileActionWithFakes({ insideWorkspace: false, openConfirmed: false });

    await expect(invoke("local-file:open-path", "~/Downloads/brief.pdf")).rejects.toThrow("Opening this local file was not approved.");

    expect(deps.openPath).not.toHaveBeenCalled();
  });

  it("opens a resolved local file path with the selected target", async () => {
    const { deps, invoke, resolvedPath } = registerLocalFileActionWithFakes();

    await expect(invoke("local-file:open-path-with", { path: "~/Downloads/brief.pdf", targetId: "vscode" })).resolves.toBeUndefined();

    expect(deps.resolveCanonicalLocalFilePath).toHaveBeenCalledWith("~/Downloads/brief.pdf");
    expect(deps.openWorkspaceTarget).toHaveBeenCalledWith(resolvedPath, "vscode");
  });

  it("rejects invalid open-with input", async () => {
    const { deps, invoke } = registerLocalFileActionWithFakes();

    await expect(invoke("local-file:open-path-with", { path: "", targetId: "vscode" })).rejects.toThrow();

    expect(deps.resolveCanonicalLocalFilePath).not.toHaveBeenCalled();
    expect(deps.openWorkspaceTarget).not.toHaveBeenCalled();
  });
});

describe("registerLocalFolderAllowlistIpc", () => {
  it("registers the local folder allowlist channel", () => {
    const { handlers } = registerLocalFolderAllowlistWithFakes();

    expect([...handlers.keys()]).toEqual([...localFolderAllowlistIpcChannels]);
  });

  it("creates a thread folder allowlist grant from a selected folder", async () => {
    const { context, deps, grant, invoke, resolvedPath } = registerLocalFolderAllowlistWithFakes();

    await expect(invoke("local-file:add-folder-allowlist")).resolves.toEqual(grant);

    expect(deps.showOpenDialog).toHaveBeenCalledWith({
      title: "Add Folder to Allow List for Thread",
      buttonLabel: "Add Folder",
      defaultPath: context.workspacePath,
      properties: ["openDirectory", "createDirectory"],
    });
    expect(deps.resolveCanonicalLocalFilePath).toHaveBeenCalledWith("/tmp/shared");
    expect(deps.createThreadLocalFolderAllowlistGrant).toHaveBeenCalledWith(resolvedPath, context);
  });

  it("returns undefined when the allowlist folder picker is canceled", async () => {
    const { deps, invoke } = registerLocalFolderAllowlistWithFakes({
      dialogResult: { canceled: true, filePaths: ["/tmp/shared"] },
    });

    await expect(invoke("local-file:add-folder-allowlist")).resolves.toBeUndefined();

    expect(deps.createThreadLocalFolderAllowlistGrant).not.toHaveBeenCalled();
  });
});

describe("registerWorkspacePickContextIpc", () => {
  it("registers the workspace context picker channel", () => {
    const { handlers } = registerWorkspacePickContextWithFakes();

    expect([...handlers.keys()]).toEqual([...workspacePickContextIpcChannels]);
  });

  it("picks files and allows external context only for full-access threads", async () => {
    const context = sampleWorkspacePickContext("full-access");
    const references = sampleWorkspaceContextReferences();
    const filePaths = ["/tmp/workspace/src/app.ts", "/tmp/outside/note.txt"];
    const { deps, invoke } = registerWorkspacePickContextWithFakes({
      context,
      dialogResult: { canceled: false, filePaths },
      references,
    });

    await expect(invoke("workspace:pick-context", { kind: "file", allowExternal: true })).resolves.toEqual(references);

    expect(deps.showOpenDialog).toHaveBeenCalledWith({
      title: "Add Files As Context",
      defaultPath: context.workspacePath,
      properties: ["openFile", "multiSelections"],
    });
    expect(deps.describeWorkspaceAbsoluteContextPaths).toHaveBeenCalledWith(context.workspacePath, filePaths, { allowExternal: true });
  });

  it("picks directories and blocks external context outside full-access threads", async () => {
    const context = sampleWorkspacePickContext("workspace");
    const references = sampleWorkspaceContextReferences();
    const filePaths = ["/tmp/workspace/src"];
    const { deps, invoke } = registerWorkspacePickContextWithFakes({
      context,
      dialogResult: { canceled: false, filePaths },
      references,
    });

    await expect(invoke("workspace:pick-context", { kind: "directory", allowExternal: true })).resolves.toEqual(references);

    expect(deps.showOpenDialog).toHaveBeenCalledWith({
      title: "Add Folders As Context",
      defaultPath: context.workspacePath,
      properties: ["openDirectory", "multiSelections"],
    });
    expect(deps.describeWorkspaceAbsoluteContextPaths).toHaveBeenCalledWith(context.workspacePath, filePaths, { allowExternal: false });
  });

  it("allows thread-visible external context in workspace-mode threads", async () => {
    const context = sampleWorkspacePickContext("workspace");
    const references = sampleWorkspaceContextReferences();
    const filePaths = ["/tmp/shared-link/allowed-note.md"];
    const canonicalFilePaths = ["/tmp/shared/allowed-note.md"];
    const { deps, invoke } = registerWorkspacePickContextWithFakes({
      context,
      dialogResult: { canceled: false, filePaths },
      references,
      resolveCanonicalLocalFilePath: (path) => path.replace("/tmp/shared-link/", "/tmp/shared/"),
      localPathInsideActiveWorkspace: (path) => path.startsWith("/tmp/workspace/"),
      localPathVisibleToThread: (path) => path.startsWith("/tmp/shared/"),
    });

    await expect(invoke("workspace:pick-context", { kind: "file" })).resolves.toEqual(references);

    expect(deps.describeWorkspaceAbsoluteContextPaths).toHaveBeenCalledWith(context.workspacePath, canonicalFilePaths, { allowExternal: true });
  });

  it("does not let one thread-visible external context path approve an unapproved sibling", async () => {
    const context = sampleWorkspacePickContext("workspace");
    const references = sampleWorkspaceContextReferences();
    const filePaths = ["/tmp/shared/allowed-note.md", "/tmp/private/secret-note.md"];
    const { deps, invoke } = registerWorkspacePickContextWithFakes({
      context,
      dialogResult: { canceled: false, filePaths },
      references,
      localPathInsideActiveWorkspace: (path) => path.startsWith("/tmp/workspace/"),
      localPathVisibleToThread: (path) => path.startsWith("/tmp/shared/"),
    });

    await expect(invoke("workspace:pick-context", { kind: "file" })).resolves.toEqual(references);

    expect(deps.describeWorkspaceAbsoluteContextPaths).toHaveBeenCalledWith(context.workspacePath, filePaths, { allowExternal: false });
  });

  it("returns an empty selection when the dialog is canceled", async () => {
    const { deps, invoke } = registerWorkspacePickContextWithFakes({
      dialogResult: { canceled: true, filePaths: ["/tmp/workspace/src/app.ts"] },
    });

    await expect(invoke("workspace:pick-context", { kind: "file" })).resolves.toEqual([]);

    expect(deps.describeWorkspaceAbsoluteContextPaths).not.toHaveBeenCalled();
  });

  it("rejects invalid picker input", async () => {
    const { invoke } = registerWorkspacePickContextWithFakes();

    await expect(invoke("workspace:pick-context", { kind: "link" })).rejects.toThrow();
  });
});

describe("registerWorkspaceSearchIpc", () => {
  it("registers the workspace search channel", () => {
    const { handlers } = registerWorkspaceSearchWithFakes();

    expect([...handlers.keys()]).toEqual([...workspaceSearchIpcChannels]);
  });

  it("searches with a raw string input", async () => {
    const { deps, invoke, results } = registerWorkspaceSearchWithFakes();

    await expect(invoke("workspace:search", "handoff")).resolves.toEqual(results);

    expect(deps.searchWorkspace).toHaveBeenCalledWith("handoff");
  });

  it("searches with structured search input", async () => {
    const input: WorkspaceSearchInput = {
      query: "handoff",
      scope: "all-projects",
      limit: 12,
    };
    const { deps, invoke, results } = registerWorkspaceSearchWithFakes();

    await expect(invoke("workspace:search", input)).resolves.toEqual(results);

    expect(deps.searchWorkspace).toHaveBeenCalledWith(input);
  });

  it("propagates search errors", () => {
    const error = new Error("search unavailable");
    const { deps, invoke } = registerWorkspaceSearchWithFakes({ error });

    expect(() => invoke("workspace:search", "handoff")).toThrow("search unavailable");

    expect(deps.searchWorkspace).toHaveBeenCalledWith("handoff");
  });
});

describe("registerWorkspacePathActionIpc", () => {
  it("registers the workspace path action channels", () => {
    const { handlers } = registerWorkspacePathActionWithFakes();

    expect([...handlers.keys()]).toEqual([...workspacePathActionIpcChannels]);
  });

  it("reveals a resolved workspace path in the shell", async () => {
    const { context, deps, invoke, resolvedPath } = registerWorkspacePathActionWithFakes();

    await expect(invoke("workspace:reveal-path", "docs/plan.md")).resolves.toBeUndefined();

    expect(deps.workspacePathForRelativeArtifactPath).toHaveBeenCalledWith("docs/plan.md", context.targetStore, context.workspacePath);
    expect(deps.resolveWorkspacePathForOpen).toHaveBeenCalledWith("/tmp/artifacts/docs/plan.md", "docs/plan.md");
    expect(deps.showItemInFolder).toHaveBeenCalledWith(resolvedPath.absolutePath);
    expect(deps.openPath).not.toHaveBeenCalled();
  });

  it("opens a resolved workspace path and throws shell open errors", async () => {
    const { deps, invoke, resolvedPath } = registerWorkspacePathActionWithFakes({ openPathError: "No app can open this file." });

    await expect(invoke("workspace:open-path", "docs/plan.md")).rejects.toThrow("No app can open this file.");

    expect(deps.openPath).toHaveBeenCalledWith(resolvedPath.realPath);
  });

  it("lists workspace open targets", async () => {
    const targets = sampleWorkspaceOpenTargets();
    const { deps, invoke } = registerWorkspacePathActionWithFakes({ targets });

    await expect(invoke("workspace:list-open-targets")).resolves.toEqual(targets);

    expect(deps.listWorkspaceOpenTargets).toHaveBeenCalledOnce();
    expect(deps.activeWorkspaceFileContextForProjectHost).not.toHaveBeenCalled();
  });

  it("opens a resolved workspace path with the selected target", async () => {
    const { deps, invoke, resolvedPath } = registerWorkspacePathActionWithFakes();

    await expect(invoke("workspace:open-path-with", { path: "docs/plan.md", targetId: "vscode" })).resolves.toBeUndefined();

    expect(deps.openWorkspaceTarget).toHaveBeenCalledWith(resolvedPath.realPath, "vscode");
  });

  it("rejects invalid open-with input", async () => {
    const { deps, invoke } = registerWorkspacePathActionWithFakes();

    await expect(invoke("workspace:open-path-with", { path: "", targetId: "vscode" })).rejects.toThrow();

    expect(deps.openWorkspaceTarget).not.toHaveBeenCalled();
  });
});

describe("registerWorkspaceGitStatusIpc", () => {
  it("registers the workspace git status channels", () => {
    const { handlers } = registerWorkspaceGitStatusWithFakes();

    expect([...handlers.keys()]).toEqual([...workspaceGitStatusIpcChannels]);
  });

  it("reads workspace diff for the active git context", async () => {
    const { context, deps, diff, invoke } = registerWorkspaceGitStatusWithFakes();

    await expect(invoke("workspace:diff")).resolves.toEqual(diff);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.getWorkspaceDiff).toHaveBeenCalledWith(context.workspacePath);
    expect(deps.getWorkspaceGitStatus).not.toHaveBeenCalled();
  });

  it("reads workspace git status for the active git context", async () => {
    const { context, deps, invoke, status } = registerWorkspaceGitStatusWithFakes();

    await expect(invoke("workspace:git-status")).resolves.toEqual(status);

    expect(deps.activeGitContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.getWorkspaceGitStatus).toHaveBeenCalledWith(context.workspacePath);
  });

  it("switches dirty repositories without creating a checkpoint", async () => {
    const status = sampleWorkspaceGitStatus({ branch: "main", dirtyCount: 2 });
    const switchedStatus = sampleWorkspaceGitStatus({ branch: "feature", dirtyCount: 0 });
    const { context, deps, invoke } = registerWorkspaceGitStatusWithFakes({ status, switchedStatus });

    await expect(invoke("workspace:switch-branch", "feature")).resolves.toEqual(switchedStatus);

    expect(deps.getWorkspaceGitStatus).not.toHaveBeenCalled();
    expect(deps.switchWorkspaceBranch).toHaveBeenCalledWith(context.workspacePath, "feature");
  });

  it("switches clean repositories without creating a checkpoint", async () => {
    const status = sampleWorkspaceGitStatus({ branch: "main", dirtyCount: 0 });
    const switchedStatus = sampleWorkspaceGitStatus({ branch: "feature", dirtyCount: 0 });
    const { deps, invoke } = registerWorkspaceGitStatusWithFakes({ status, switchedStatus });

    await expect(invoke("workspace:switch-branch", "feature")).resolves.toEqual(switchedStatus);

    expect(deps.getWorkspaceGitStatus).not.toHaveBeenCalled();
    expect(deps.switchWorkspaceBranch).toHaveBeenCalledWith("/tmp/workspace", "feature");
  });

  it("switches to the requested branch without pre-checkpointing", async () => {
    const status = sampleWorkspaceGitStatus({ branch: "main", dirtyCount: 3 });
    const { deps, invoke } = registerWorkspaceGitStatusWithFakes({ status });

    await expect(invoke("workspace:switch-branch", "main")).resolves.toEqual(status);

    expect(deps.getWorkspaceGitStatus).not.toHaveBeenCalled();
    expect(deps.switchWorkspaceBranch).toHaveBeenCalledWith("/tmp/workspace", "main");
  });

  it("rejects invalid branch input", async () => {
    const { deps, invoke } = registerWorkspaceGitStatusWithFakes();

    await expect(invoke("workspace:switch-branch", "")).rejects.toThrow();

    expect(deps.getWorkspaceGitStatus).not.toHaveBeenCalled();
    expect(deps.switchWorkspaceBranch).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  dialogResult = { canceled: false, filePaths: ["/tmp/workspace"] },
}: {
  dialogResult?: { canceled: boolean; filePaths: string[] };
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterWorkspaceLifecycleIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    showOpenDialog: vi.fn(async () => dialogResult),
    createDirectory: vi.fn(),
    switchWorkspace: vi.fn((workspacePath: string) => sampleDesktopState(workspacePath)),
  };
  registerWorkspaceLifecycleIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerWorkspaceFileWithFakes({
  context = { workspacePath: "/tmp/workspace" },
  tree = sampleWorkspaceFileTree(),
  file = sampleWorkspaceFileContent(),
}: {
  context?: WorkspaceFileContext;
  tree?: WorkspaceFileTree;
  file?: WorkspaceFileContent;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeWorkspaceFileContextForProjectHost: vi.fn(() => context),
    listWorkspaceFiles: vi.fn(async () => tree),
    readActiveWorkspaceFile: vi.fn(async () => file),
    clearOfficePreviewRendererDiscovery: vi.fn(),
  } satisfies RegisterWorkspaceFileIpcDependencies<WorkspaceFileContext>;
  registerWorkspaceFileIpc(deps);

  return {
    context,
    deps,
    file,
    handlers,
    tree,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerLocalFilePreviewWithFakes({
  context = { workspacePath: "/tmp/workspace" },
  file = sampleLocalFileContent(),
}: {
  context?: WorkspaceFileContext;
  file?: WorkspaceFileContent;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeWorkspaceFileContextForProjectHost: vi.fn(() => context),
    readActiveLocalFilePreview: vi.fn(async () => file),
    clearOfficePreviewRendererDiscovery: vi.fn(),
  } satisfies RegisterLocalFilePreviewIpcDependencies<WorkspaceFileContext>;
  registerLocalFilePreviewIpc(deps);

  return {
    context,
    deps,
    file,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerLocalFileActionWithFakes({
  resolvedPath = "/tmp/workspace/docs/brief.pdf",
  openPathError = "",
  visible = true,
  insideWorkspace = true,
  openConfirmed = true,
}: {
  resolvedPath?: string;
  openPathError?: string;
  visible?: boolean;
  insideWorkspace?: boolean;
  openConfirmed?: boolean;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const context: LocalFileActionContext = sampleLocalFileActionContext();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeWorkspaceFileContextForProjectHost: vi.fn(() => context),
    resolveCanonicalLocalFilePath: vi.fn(() => resolvedPath),
    localPathVisibleToThread: vi.fn(() => visible),
    localPathInsideActiveWorkspace: vi.fn(() => insideWorkspace),
    requestLocalFileOpenConfirmation: vi.fn(async () => ({ allowed: openConfirmed, mode: openConfirmed ? "allow_once" as const : "deny" as const })),
    showItemInFolder: vi.fn(),
    openPath: vi.fn(async () => openPathError),
    openWorkspaceTarget: vi.fn(async () => undefined),
  } satisfies RegisterLocalFileActionIpcDependencies<LocalFileActionContext>;
  registerLocalFileActionIpc(deps);

  return {
    context,
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
    resolvedPath,
  };
}

function registerLocalFolderAllowlistWithFakes({
  context = sampleLocalFileActionContext(),
  dialogResult = { canceled: false, filePaths: ["/tmp/shared"] },
  grant = samplePermissionGrant(),
  resolvedPath = "/tmp/shared-real",
}: {
  context?: LocalFileActionContext;
  dialogResult?: { canceled: boolean; filePaths: string[] };
  grant?: AmbientPermissionGrant;
  resolvedPath?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeWorkspaceFileContextForProjectHost: vi.fn(() => context),
    showOpenDialog: vi.fn(async () => dialogResult),
    resolveCanonicalLocalFilePath: vi.fn(() => resolvedPath),
    createThreadLocalFolderAllowlistGrant: vi.fn(async () => grant),
  } satisfies RegisterLocalFolderAllowlistIpcDependencies<LocalFileActionContext>;
  registerLocalFolderAllowlistIpc(deps);

  return {
    context,
    deps,
    grant,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    resolvedPath,
  };
}

function registerWorkspacePickContextWithFakes({
  context = sampleWorkspacePickContext("workspace"),
  dialogResult = { canceled: false, filePaths: ["/tmp/workspace/src/app.ts"] },
  references = sampleWorkspaceContextReferences(),
  resolveCanonicalLocalFilePath = (path: string) => path,
  localPathVisibleToThread = (path: string) => path.startsWith(`${context.workspacePath}/`) || path === context.workspacePath,
  localPathInsideActiveWorkspace = (path: string) => path.startsWith(`${context.workspacePath}/`) || path === context.workspacePath,
}: {
  context?: WorkspacePickContext;
  dialogResult?: { canceled: boolean; filePaths: string[] };
  references?: WorkspaceContextReference[];
  resolveCanonicalLocalFilePath?: (path: string) => string;
  localPathVisibleToThread?: (path: string, context: WorkspacePickContext) => boolean;
  localPathInsideActiveWorkspace?: (path: string, context: WorkspacePickContext) => boolean;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeWorkspaceFileContextForProjectHost: vi.fn(() => context),
    showOpenDialog: vi.fn(async () => dialogResult),
    resolveCanonicalLocalFilePath: vi.fn(resolveCanonicalLocalFilePath),
    localPathVisibleToThread: vi.fn(localPathVisibleToThread),
    localPathInsideActiveWorkspace: vi.fn(localPathInsideActiveWorkspace),
    describeWorkspaceAbsoluteContextPaths: vi.fn(async () => references),
  } satisfies RegisterWorkspacePickContextIpcDependencies<WorkspacePickContext>;
  registerWorkspacePickContextIpc(deps);

  return {
    context,
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    references,
  };
}

function registerWorkspaceSearchWithFakes({
  results = sampleWorkspaceSearchResults(),
  error,
}: {
  results?: WorkspaceSearchResult[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    searchWorkspace: vi.fn((raw: WorkspaceSearchInput | string) => {
      if (error) throw error;
      return results;
    }),
  } satisfies RegisterWorkspaceSearchIpcDependencies;
  registerWorkspaceSearchIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    results,
  };
}

function registerWorkspacePathActionWithFakes({
  context = sampleWorkspacePathActionContext(),
  resolvedPath = sampleResolvedWorkspacePath(),
  targets = sampleWorkspaceOpenTargets(),
  openPathError = "",
}: {
  context?: WorkspacePathActionContext<{ id: string }>;
  resolvedPath?: { absolutePath: string; realPath: string };
  targets?: WorkspaceOpenTarget[];
  openPathError?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeWorkspaceFileContextForProjectHost: vi.fn(() => context),
    workspacePathForRelativeArtifactPath: vi.fn((relativePath: string) => `/tmp/artifacts/${relativePath}`),
    resolveWorkspacePathForOpen: vi.fn(async () => resolvedPath),
    showItemInFolder: vi.fn(),
    openPath: vi.fn(async () => openPathError),
    listWorkspaceOpenTargets: vi.fn(async () => targets),
    openWorkspaceTarget: vi.fn(async () => undefined),
  } satisfies RegisterWorkspacePathActionIpcDependencies<WorkspacePathActionContext<{ id: string }>>;
  registerWorkspacePathActionIpc(deps);

  return {
    context,
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    resolvedPath,
    targets,
  };
}

function registerWorkspaceGitStatusWithFakes({
  context = sampleWorkspaceGitStatusContext(),
  diff = sampleWorkspaceDiff(),
  status = sampleWorkspaceGitStatus(),
  switchedStatus = status,
}: {
  context?: WorkspaceGitStatusContext<{ id: string }, { id: string; workspacePath: string }>;
  diff?: WorkspaceDiff;
  status?: WorkspaceGitStatus;
  switchedStatus?: WorkspaceGitStatus;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeGitContextForProjectHost: vi.fn(() => context),
    getWorkspaceDiff: vi.fn(async () => diff),
    getWorkspaceGitStatus: vi.fn(async () => status),
    switchWorkspaceBranch: vi.fn(async () => switchedStatus),
  } satisfies RegisterWorkspaceGitStatusIpcDependencies<WorkspaceGitStatusContext<{ id: string }, { id: string; workspacePath: string }>>;
  registerWorkspaceGitStatusIpc(deps);

  return {
    context,
    deps,
    diff,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    status,
    switchedStatus,
  };
}

function sampleDesktopState(workspacePath: string): DesktopState {
  return {
    workspace: { path: workspacePath },
    activeWorkspace: { path: workspacePath },
    activeThreadId: "thread-1",
  } as DesktopState;
}

function sampleWorkspaceFileTree(): WorkspaceFileTree {
  return {
    rootName: "workspace",
    entries: [
      {
        path: "docs",
        name: "docs",
        type: "directory",
        depth: 0,
      },
      {
        path: "docs/plan.md",
        name: "plan.md",
        type: "file",
        depth: 1,
        size: 42,
      },
    ],
    truncated: false,
  };
}

function sampleWorkspaceFileContent(): WorkspaceFileContent {
  return {
    path: "docs/plan.md",
    name: "plan.md",
    content: "# Plan",
    size: 6,
    truncated: false,
    binary: false,
    kind: "markdown",
    mimeType: "text/markdown",
  };
}

function sampleLocalFileContent(): WorkspaceFileContent {
  return {
    path: "/tmp/workspace/docs/brief.pdf",
    name: "brief.pdf",
    source: "local",
    absolutePath: "/tmp/workspace/docs/brief.pdf",
    fileUrl: "file:///tmp/workspace/docs/brief.pdf",
    content: "",
    size: 12,
    truncated: false,
    binary: true,
    kind: "pdf",
    mimeType: "application/pdf",
  };
}

function sampleWorkspacePickContext(permissionMode: WorkspacePickContext["thread"]["permissionMode"]): WorkspacePickContext {
  return {
    workspacePath: "/tmp/workspace",
    thread: { permissionMode },
  };
}

function sampleLocalFileActionContext(): LocalFileActionContext {
  return {
    threadId: "thread-1",
    workspacePath: "/tmp/workspace",
    thread: { permissionMode: "workspace" },
  };
}

function samplePermissionGrant(): AmbientPermissionGrant {
  return {
    id: "grant-1",
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "thread",
    threadId: "thread-1",
    workspacePath: "/tmp/workspace",
    actionKind: "file_content_read",
    targetKind: "path",
    targetHash: "hash",
    targetLabel: "/tmp/shared-real",
    source: "settings",
    reason: "test grant",
  };
}

function sampleWorkspaceContextReferences(): WorkspaceContextReference[] {
  return [
    {
      path: "src/app.ts",
      name: "app.ts",
      kind: "file",
      size: 12,
    },
  ];
}

function sampleWorkspaceSearchResults(): WorkspaceSearchResult[] {
  return [
    {
      id: "message-1",
      kind: "message",
      threadId: "thread-1",
      workspacePath: "/tmp/workspace",
      projectName: "workspace",
      title: "Phase handoff",
      excerpt: "Continue from the next incomplete phase.",
      createdAt: "2026-06-04T12:00:00.000Z",
      scope: "project",
    },
  ];
}

function sampleWorkspacePathActionContext(): WorkspacePathActionContext<{ id: string }> {
  return {
    workspacePath: "/tmp/workspace",
    targetStore: { id: "store-1" },
  };
}

function sampleResolvedWorkspacePath(): { absolutePath: string; realPath: string } {
  return {
    absolutePath: "/tmp/workspace/docs/plan.md",
    realPath: "/private/tmp/workspace/docs/plan.md",
  };
}

function sampleWorkspaceOpenTargets(): WorkspaceOpenTarget[] {
  return [
    {
      id: "vscode",
      label: "Visual Studio Code",
      kind: "editor",
      available: true,
    },
  ];
}

function sampleWorkspaceGitStatusContext(): WorkspaceGitStatusContext<{ id: string }, { id: string; workspacePath: string }> {
  return {
    workspacePath: "/tmp/workspace",
    targetStore: { id: "store-1" },
    thread: { id: "thread-1", workspacePath: "/tmp/workspace" },
  };
}

function sampleWorkspaceDiff(): WorkspaceDiff {
  return {
    isGitRepository: true,
    status: [" M src/main.ts"],
    files: [
      {
        path: "src/main.ts",
        status: " M",
        category: "modified",
      },
    ],
    diff: "diff --git a/src/main.ts b/src/main.ts",
    truncated: false,
  };
}

function sampleWorkspaceGitStatus({
  branch = "main",
  dirtyCount = 1,
  isGitRepository = true,
}: {
  branch?: string;
  dirtyCount?: number;
  isGitRepository?: boolean;
} = {}): WorkspaceGitStatus {
  return {
    isGitRepository,
    branch,
    branches: ["main", "feature"],
    ahead: 0,
    behind: 0,
    dirtyCount,
    counts: {
      added: 0,
      modified: dirtyCount,
      deleted: 0,
      renamed: 0,
      untracked: 0,
    },
  };
}
