import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { SubagentToolScopeSnapshotSummary } from "../../shared/subagentTypes";
import type { AmbientPermissionGrant } from "../../shared/permissionTypes";
import { createLocalFolderAllowlistGrantInput } from "../permissions/localFolderAllowlistGrants";
import {
  childAuthorityFileRootPathsFromSnapshot,
  childAuthorityFileRootPathsForThread,
  fileAuthorityPathFromGrant,
  fileAuthorityRootPathsForThread,
  includeDefaultWorkspaceAuthorityRoots,
  nearestExistingDirectoryForAuthority,
  recordTransientFileAuthorityForAllowedTool,
  recordTransientFileAuthorityFromPermissionRequest,
  runtimeFileAuthorityRootPathsForThread,
  transientFileAuthorityRootPathsForThread,
  transientFileAuthorityRootFromAllowedTool,
  transientFileAuthorityRootFromPermissionRequest,
  transientFileAuthorityRootsForAccess,
  transientFileAuthorityRootsWithAddedRoot,
  type TransientFileAuthorityRoot,
} from "./agentRuntimeFileAuthority";

describe("agentRuntimeFileAuthority", () => {
  it("builds read and write roots from workspace, project, dependencies, grants, and transient roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-file-authority-roots-"));
    try {
      const projectPath = join(root, "project");
      const workspacePath = join(root, "worktree");
      const dependencyPath = join(root, "dependency");
      const outsideDir = join(root, "outside");
      const outsideFile = join(outsideDir, "approved.txt");
      await mkdir(outsideDir, { recursive: true });

      const thread = { id: "thread-1", workspacePath };
      const permissionGrants = [
        grant({
          scopeKind: "thread",
          threadId: "thread-1",
          actionKind: "local_file_write",
          targetLabel: outsideFile,
          conditions: { path: outsideFile },
        }),
      ];

      expect(fileAuthorityRootPathsForThread({
        thread,
        projectPath,
        access: "read",
        dependencyWorkspacePaths: [dependencyPath],
        permissionGrants,
        transientRootPaths: [join(root, "transient-read")],
      })).toEqual([
        workspacePath,
        projectPath,
        dependencyPath,
        outsideFile,
        join(root, "transient-read"),
      ]);
      expect(fileAuthorityRootPathsForThread({
        thread,
        projectPath,
        access: "write",
        dependencyWorkspacePaths: [dependencyPath],
        permissionGrants,
        transientRootPaths: [join(root, "transient-write")],
      })).toEqual([
        workspacePath,
        projectPath,
        outsideDir,
        join(root, "transient-write"),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not expose retargeted folder allowlist grants as runtime authority roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-file-authority-retarget-"));
    const workspacePath = join(root, "workspace");
    const allowedPath = join(root, "allowed");
    const outsidePath = join(root, "outside");
    try {
      await mkdir(workspacePath, { recursive: true });
      await mkdir(allowedPath, { recursive: true });
      await mkdir(outsidePath, { recursive: true });
      const input = createLocalFolderAllowlistGrantInput({
        folderPath: allowedPath,
        threadId: "thread-1",
        workspacePath,
        permissionMode: "workspace",
      });
      const folderGrant = grant({
        ...input,
        id: "folder-grant",
        createdBy: input.createdBy ?? "user",
        source: input.source ?? "settings",
      });
      await rm(allowedPath, { recursive: true, force: true });
      await symlink(outsidePath, allowedPath);

      expect(fileAuthorityPathFromGrant(folderGrant, { id: "thread-1", workspacePath }, root, "read")).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("extracts read and write roots from the latest child authority profile snapshot", () => {
    const staleReadRoot = "/tmp/stale-read";
    const readRoot = "/Users/travis/Downloads/report.pdf";
    const writeRoot = "/tmp/ambient-child-worktree";
    const snapshots = [
      childAuthoritySnapshot({
        sequence: 1,
        readDecision: "allow",
        readRoots: [staleReadRoot],
        writeDecision: "deny",
        writeRoots: ["/tmp/stale-write"],
      }),
      childAuthoritySnapshot({
        sequence: 2,
        readDecision: "allow",
        readRoots: [readRoot, " "],
        writeDecision: "allow_isolated_worktree",
        writeRoots: [writeRoot],
      }),
    ];

    expect(childAuthorityFileRootPathsForThread(
      { subagentRunId: "run-1" },
      "read",
      (runId) => runId === "run-1" ? snapshots : [],
    )).toEqual([readRoot]);
    expect(childAuthorityFileRootPathsForThread(
      { subagentRunId: "run-1" },
      "write",
      (runId) => runId === "run-1" ? snapshots : [],
    )).toEqual([writeRoot]);
    expect(childAuthorityFileRootPathsForThread({ subagentRunId: undefined }, "read", () => snapshots)).toEqual([]);
  });

  it("does not turn ask-parent or denied child authority profile paths into execution roots", () => {
    const snapshot = childAuthoritySnapshot({
      sequence: 1,
      readDecision: "ask_parent",
      readRoots: ["/tmp/needs-approval"],
      writeDecision: "deny",
      writeRoots: ["/tmp/denied-write"],
    });

    expect(childAuthorityFileRootPathsFromSnapshot(snapshot, "read")).toEqual([]);
    expect(childAuthorityFileRootPathsFromSnapshot(snapshot, "write")).toEqual([]);
  });

  it("does not grant default workspace, project, or dependency roots to child sessions", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-child-authority-runtime-roots-"));
    try {
      const projectPath = join(root, "project");
      const workspacePath = join(root, "child-workspace");
      const dependencyPath = join(root, "dependency");
      const approvedRead = join(root, "downloads", "brief.pdf");
      const approvedWrite = join(root, "isolated-worktree");
      const thread = {
        id: "child-thread-1",
        workspacePath,
        kind: "subagent_child" as const,
        subagentRunId: "child-run-1",
      };
      const store = {
        getThread: () => thread,
        getWorkspace: () => ({ path: projectPath }),
        getProjectBoardDependencyWorkspacePathsForExecutionThread: () => [],
        listPermissionGrants: () => [],
        listSubagentToolScopeSnapshots: (runId: string) => runId === "child-run-1"
          ? [childAuthoritySnapshot({
            sequence: 1,
            readDecision: "allow",
            readRoots: [approvedRead],
            writeDecision: "allow_isolated_worktree",
            writeRoots: [approvedWrite],
          })]
          : [],
      };

      expect(runtimeFileAuthorityRootPathsForThread("child-thread-1", "read", {
        store,
        transientRoots: new Map(),
      })).toEqual([approvedRead]);
      expect(runtimeFileAuthorityRootPathsForThread("child-thread-1", "write", {
        store,
        transientRoots: new Map(),
      })).toEqual([approvedWrite]);
      expect(fileAuthorityRootPathsForThread({
        thread,
        projectPath,
        access: "read",
        dependencyWorkspacePaths: [dependencyPath],
      })).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps default workspace authority for normal threads only", () => {
    expect(includeDefaultWorkspaceAuthorityRoots({ kind: undefined })).toBe(true);
    expect(includeDefaultWorkspaceAuthorityRoots({ kind: "chat" })).toBe(true);
    expect(includeDefaultWorkspaceAuthorityRoots({ kind: "subagent_child" })).toBe(false);
  });

  it("filters grants by expiration, scope, target kind, and action", () => {
    const now = Date.parse("2026-06-12T06:00:00.000Z");
    const thread = { id: "thread-1", workspacePath: "/workspace" };
    const projectPath = "/project";

    expect(fileAuthorityPathFromGrant(grant({ targetLabel: "/approved/read.txt" }), thread, projectPath, "read", now)).toBe("/approved/read.txt");
    expect(fileAuthorityPathFromGrant(grant({ actionKind: "shell_command", targetKind: "risk" }), thread, projectPath, "read", now)).toBeUndefined();
    expect(fileAuthorityPathFromGrant(grant({ revokedAt: "2026-06-12T05:00:00.000Z" }), thread, projectPath, "read", now)).toBeUndefined();
    expect(fileAuthorityPathFromGrant(grant({ expiresAt: "2026-06-12T05:59:59.000Z" }), thread, projectPath, "read", now)).toBeUndefined();
    expect(fileAuthorityPathFromGrant(grant({ scopeKind: "thread", threadId: "other-thread" }), thread, projectPath, "read", now)).toBeUndefined();
    expect(fileAuthorityPathFromGrant(grant({ scopeKind: "project", projectPath: "/other-project" }), thread, projectPath, "read", now)).toBeUndefined();
    expect(fileAuthorityPathFromGrant(grant({ scopeKind: "workspace", workspacePath: "/other-workspace" }), thread, projectPath, "read", now)).toBeUndefined();
    expect(fileAuthorityPathFromGrant(grant({ scopeKind: "workflow_thread" }), thread, projectPath, "read", now)).toBeUndefined();
    expect(fileAuthorityPathFromGrant(grant({ scopeKind: "global_plugin" }), thread, projectPath, "read", now)).toBeUndefined();
    expect(fileAuthorityPathFromGrant(grant({ actionKind: "file_content_read", targetLabel: "/approved/read.txt" }), thread, projectPath, "write", now)).toBeUndefined();
    expect(fileAuthorityPathFromGrant(grant({ targetLabel: "relative/path.txt" }), thread, projectPath, "read", now)).toBeUndefined();
  });

  it("returns active transient roots and write-compatible root paths", () => {
    const now = 10_000;
    const entries: TransientFileAuthorityRoot[] = [
      { rootPath: "/read", actionKind: "file_content_read", expiresAt: now + 1, reason: "read" },
      { rootPath: "/write", actionKind: "local_file_write", expiresAt: now + 1, reason: "write" },
      { rootPath: "/expired", actionKind: "local_file_write", expiresAt: now, reason: "expired" },
    ];

    expect(transientFileAuthorityRootsForAccess(entries, "read", now)).toEqual({
      activeEntries: entries.slice(0, 2),
      rootPaths: ["/read", "/write"],
    });
    expect(transientFileAuthorityRootsForAccess(entries, "write", now)).toEqual({
      activeEntries: entries.slice(0, 2),
      rootPaths: ["/write"],
    });
  });

  it("returns transient root paths for a thread while pruning expired entries", () => {
    const now = 10_000;
    const activeRead = { rootPath: "/read", actionKind: "file_content_read", expiresAt: now + 1, reason: "read" } satisfies TransientFileAuthorityRoot;
    const activeWrite = { rootPath: "/write", actionKind: "local_file_write", expiresAt: now + 1, reason: "write" } satisfies TransientFileAuthorityRoot;
    const roots = new Map<string, TransientFileAuthorityRoot[]>([
      ["thread-1", [
        activeRead,
        activeWrite,
        { rootPath: "/expired", actionKind: "local_file_write", expiresAt: now, reason: "expired" },
      ]],
    ]);

    expect(transientFileAuthorityRootPathsForThread("thread-1", "read", roots, now)).toEqual(["/read", "/write"]);
    expect(roots.get("thread-1")).toEqual([activeRead, activeWrite]);
    expect(transientFileAuthorityRootPathsForThread("thread-1", "write", roots, now)).toEqual(["/write"]);
  });

  it("builds runtime authority roots from the store and transient roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-file-authority-runtime-roots-"));
    try {
      const projectPath = join(root, "project");
      const workspacePath = join(root, "worktree");
      const dependencyPath = join(root, "dependency");
      const outsideDir = join(root, "outside");
      const outsideFile = join(outsideDir, "approved.txt");
      const transientWrite = join(root, "transient-write");
      await mkdir(outsideDir, { recursive: true });

      const thread = { id: "thread-1", workspacePath };
      const roots = new Map<string, TransientFileAuthorityRoot[]>([
        ["thread-1", [
          { rootPath: transientWrite, actionKind: "local_file_write", expiresAt: 10_001, reason: "write" },
          { rootPath: join(root, "expired"), actionKind: "local_file_write", expiresAt: 10_000, reason: "expired" },
        ]],
      ]);
      const store = {
        getThread: () => thread,
        getWorkspace: () => ({ path: projectPath }),
        getProjectBoardDependencyWorkspacePathsForExecutionThread: () => [dependencyPath],
        listPermissionGrants: () => [grant({
          actionKind: "local_file_write",
          targetLabel: outsideFile,
          conditions: { path: outsideFile },
        })],
      };

      expect(runtimeFileAuthorityRootPathsForThread("thread-1", "read", {
        store,
        transientRoots: roots,
        now: 10_000,
      })).toEqual([
        workspacePath,
        projectPath,
        dependencyPath,
        outsideFile,
        transientWrite,
      ]);
      expect(roots.get("thread-1")).toEqual([
        { rootPath: transientWrite, actionKind: "local_file_write", expiresAt: 10_001, reason: "write" },
      ]);
      expect(runtimeFileAuthorityRootPathsForThread("thread-1", "write", {
        store,
        transientRoots: roots,
        now: 10_000,
      })).toEqual([
        workspacePath,
        projectPath,
        outsideDir,
        transientWrite,
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates transient roots from allowed file tools", async () => {
    await expect(transientFileAuthorityRootFromAllowedTool({
      workspacePath: "/workspace",
      toolName: "file_read",
      toolInput: { path: "README.md" },
      reason: "allowed read",
    }, {
      fileToolAccess: (toolName) => toolName === "file_read" ? "read" : undefined,
      pathForTool: (_toolName, requestedPath) => `/policy/${requestedPath}`,
      resolvePolicyPath: async (_workspacePath, requestedPath) => ({
        absolutePath: `/absolute${requestedPath}`,
        canonicalPath: `/canonical${requestedPath}`,
        insideWorkspace: false,
      }),
    })).resolves.toEqual({
      path: "/canonical/policy/README.md",
      actionKind: "file_content_read",
      reason: "allowed read",
    });

    await expect(transientFileAuthorityRootFromAllowedTool({
      workspacePath: "/workspace",
      toolName: "edit",
      toolInput: { path: "src/app.ts" },
      reason: "allowed edit",
    }, {
      fileToolAccess: (toolName) => toolName === "edit" ? "edit" : undefined,
      pathForTool: (_toolName, requestedPath) => requestedPath,
      resolvePolicyPath: async (_workspacePath, requestedPath) => ({
        absolutePath: `/workspace/${requestedPath}`,
        canonicalPath: `/workspace/${requestedPath}`,
        insideWorkspace: true,
      }),
    })).resolves.toEqual({
      path: "/workspace/src/app.ts",
      actionKind: "local_file_write",
      reason: "allowed edit",
    });

    await expect(transientFileAuthorityRootFromAllowedTool({
      workspacePath: "/workspace",
      toolName: "bash",
      toolInput: { command: "cat README.md" },
      reason: "no file path",
    }, {
      fileToolAccess: () => undefined,
      pathForTool: (_toolName, requestedPath) => requestedPath,
      resolvePolicyPath: async (_workspacePath, requestedPath) => ({
        absolutePath: requestedPath,
        canonicalPath: requestedPath,
        insideWorkspace: false,
      }),
    })).resolves.toBeUndefined();
  });

  it("creates transient roots from enriched permission requests", () => {
    expect(transientFileAuthorityRootFromPermissionRequest({
      threadId: "thread-1",
      toolName: "write",
      title: "Allow file?",
      message: "Allow file.",
      risk: "outside-workspace",
      grantTargetKind: "path",
      grantActionKind: "local_file_write",
      grantTargetLabel: "/fallback/path.txt",
      grantConditions: { path: "/conditions/path.txt", canonicalPath: "/canonical/path.txt" },
    }, "allowed once")).toEqual({
      path: "/canonical/path.txt",
      actionKind: "local_file_write",
      reason: "allowed once",
    });
    expect(transientFileAuthorityRootFromPermissionRequest({
      threadId: "thread-1",
      toolName: "file_read",
      title: "Allow file?",
      message: "Allow file.",
      risk: "outside-workspace",
      grantTargetKind: "path",
      grantActionKind: "file_content_read",
      grantTargetLabel: "/read/path.txt",
    }, "allowed once")).toEqual({
      path: "/read/path.txt",
      actionKind: "file_content_read",
      reason: "allowed once",
    });
    expect(transientFileAuthorityRootFromPermissionRequest({
      threadId: "thread-1",
      toolName: "plugin_tool",
      title: "Allow tool?",
      message: "Allow tool.",
      risk: "plugin-tool",
      grantTargetKind: "tool",
      grantActionKind: "plugin_tool_execute",
      grantTargetLabel: "tool",
    }, "allowed once")).toBeUndefined();
  });

  it("adds transient roots with expiry while pruning expired entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-file-authority-add-"));
    try {
      const outsideDir = join(root, "outside");
      const outsideFile = join(outsideDir, "approved.txt");
      await mkdir(outsideDir, { recursive: true });
      const now = 20_000;
      expect(transientFileAuthorityRootsWithAddedRoot([
        { rootPath: "/expired", actionKind: "local_file_write", expiresAt: now, reason: "expired" },
        { rootPath: "/active", actionKind: "file_content_read", expiresAt: now + 1, reason: "active" },
      ], {
        path: outsideFile,
        actionKind: "local_file_write",
        reason: "new",
      }, now)).toEqual([
        { rootPath: "/active", actionKind: "file_content_read", expiresAt: now + 1, reason: "active" },
        { rootPath: outsideDir, actionKind: "local_file_write", expiresAt: now + 120_000, reason: "new" },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records transient roots for allowed file tools", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-file-authority-record-tool-"));
    try {
      const outsideDir = join(root, "outside");
      const outsideFile = join(outsideDir, "approved.txt");
      await mkdir(outsideDir, { recursive: true });
      const roots = new Map<string, TransientFileAuthorityRoot[]>();

      await recordTransientFileAuthorityForAllowedTool({
        threadId: "thread-1",
        workspacePath: "/workspace",
        toolName: "edit",
        toolInput: { path: "approved.txt" },
        reason: "allowed edit",
      }, {
        roots,
        fileToolAccess: (toolName) => toolName === "edit" ? "edit" : undefined,
        pathForTool: (_toolName, requestedPath) => requestedPath,
        resolvePolicyPath: async () => ({
          absolutePath: outsideFile,
          canonicalPath: outsideFile,
          insideWorkspace: false,
        }),
      });

      expect(roots.get("thread-1")).toEqual([
        expect.objectContaining({
          rootPath: outsideDir,
          actionKind: "local_file_write",
          reason: "allowed edit",
        }),
      ]);
      expect(roots.get("thread-1")?.[0]?.expiresAt).toBeGreaterThan(Date.now());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records transient roots from permission requests", () => {
    const roots = new Map<string, TransientFileAuthorityRoot[]>();

    recordTransientFileAuthorityFromPermissionRequest({
      threadId: "thread-1",
      thread: {
        permissionMode: "workspace",
        workspacePath: "/workspace",
      },
      projectPath: "/project",
      request: {
        threadId: "thread-1",
        toolName: "file_read",
        title: "Allow file?",
        message: "Allow file.",
        risk: "outside-workspace",
        grantTargetKind: "path",
        grantActionKind: "file_content_read",
        grantTargetLabel: "/approved/read.txt",
      },
      reason: "allowed once",
    }, {
      roots,
    });

    expect(roots.get("thread-1")).toEqual([
      expect.objectContaining({
        rootPath: "/approved/read.txt",
        actionKind: "file_content_read",
        reason: "allowed once",
      }),
    ]);
  });

  it("walks up to the nearest existing directory for write grants", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-file-authority-nearest-"));
    try {
      const existingDir = join(root, "existing");
      await mkdir(existingDir, { recursive: true });
      await writeFile(join(existingDir, "file.txt"), "not a directory");

      expect(nearestExistingDirectoryForAuthority(join(existingDir, "missing", "child.txt"))).toBe(existingDir);
      expect(nearestExistingDirectoryForAuthority(join(existingDir, "file.txt", "child.txt"))).toBe(existingDir);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function grant(overrides: Partial<AmbientPermissionGrant> = {}): AmbientPermissionGrant {
  return {
    id: "grant-1",
    createdAt: "2026-06-12T05:00:00.000Z",
    updatedAt: "2026-06-12T05:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "thread",
    threadId: "thread-1",
    actionKind: "file_content_read",
    targetKind: "path",
    targetHash: "hash",
    targetLabel: "/approved/read.txt",
    source: "permission_prompt",
    reason: "test",
    ...overrides,
  };
}

function childAuthoritySnapshot(input: {
  sequence: number;
  readDecision: "allow" | "ask_parent" | "deny";
  readRoots: string[];
  writeDecision: "allow" | "ask_parent" | "deny" | "allow_isolated_worktree";
  writeRoots: string[];
}): SubagentToolScopeSnapshotSummary {
  return {
    runId: "child-run-1",
    sequence: input.sequence,
    createdAt: "2026-06-13T00:00:00.000Z",
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: [],
      piVisibleCategories: [],
      deniedCategories: [],
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [],
      approvalMode: "interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
    },
    resolverInputs: {
      childAuthorityProfile: {
        schemaVersion: "ambient-subagent-child-authority-profile-v1",
        resourceScopes: {
          filesystem: {
            readRoots: input.readRoots,
            writeRoots: input.writeRoots,
            deniedWriteRoots: [],
            readDecision: input.readDecision,
            writeDecision: input.writeDecision,
          },
        },
      },
    },
  };
}
