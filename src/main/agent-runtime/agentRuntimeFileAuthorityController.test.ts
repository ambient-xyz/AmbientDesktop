import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { PermissionRequest } from "../../shared/permissionTypes";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentToolScopeResolution } from "../../shared/subagentToolScope";
import { AgentRuntimeFileAuthorityController } from "./agentRuntimeFileAuthorityController";
import { createLocalFolderAllowlistGrantInput } from "./agentRuntimePermissionsFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

describe("AgentRuntimeFileAuthorityController", () => {
  it("denies non-interactive child file authority requests without prompting", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-file-authority-owner-"));
    const store = new ProjectStore();
    const events: unknown[] = [];
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with non-interactive child");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Child reader",
        roleId: "explorer",
        roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      const nonInteractiveScope: SubagentToolScopeResolution = {
        schemaVersion: "ambient-subagent-tool-scope-v1",
        loadedCategories: [],
        piVisibleCategories: [],
        deniedCategories: [],
        loadedTools: [],
        piVisibleTools: [],
        deniedTools: [],
        approvalMode: "non_interactive",
        worktreeIsolated: true,
        fanoutAvailable: false,
      };
      store.recordSubagentToolScopeSnapshot(running.id, {
        scope: nonInteractiveScope,
      });
      const requestPermission = vi.fn();
      const controller = new AgentRuntimeFileAuthorityController({
        store,
        transientRoots: new Map(),
        requestPermission: requestPermission as unknown as (
          request: Omit<PermissionRequest, "id">,
          options?: { onRequest?: (request: PermissionRequest) => void },
        ) => Promise<{ allowed: boolean; mode: "deny" }>,
        beginPermissionWait: vi.fn(),
        activeRunId: () => parentRun.id,
        emit: (event) => events.push(event),
      });
      const requestedPath = join(workspacePath, "needs-approval.txt");

      const approved = await controller.requestForThread(running.childThreadId, store.getWorkspace(), {
        access: "read",
        toolName: "read",
        requestedPath,
        absolutePath: requestedPath,
        reason: "Path is outside the current workspace authority.",
      });

      expect(approved).toBe(false);
      expect(requestPermission).not.toHaveBeenCalled();
      expect(events).toEqual([
        expect.objectContaining({
          type: "permission-audit-created",
          entry: expect.objectContaining({
            threadId: running.childThreadId,
            toolName: "read",
            decision: "denied",
            decisionSource: "denied_by_policy",
          }),
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not reuse folder allowlist grants for symlink escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-file-authority-allowlist-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const allowedDir = join(root, "allowed");
    const outsideDir = join(root, "outside");
    const outsideFile = join(outsideDir, "public-note.txt");
    const symlinkPath = join(allowedDir, "linked-note.txt");
    const store = new ProjectStore();
    const events: unknown[] = [];
    try {
      await mkdir(activeWorktree, { recursive: true });
      await mkdir(allowedDir, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      await writeFile(outsideFile, "outside\n", "utf8");
      await symlink(outsideFile, symlinkPath);
      const canonicalOutsideFile = await realpath(outsideFile);
      store.openWorkspace(projectRoot);
      const created = store.createThread("folder allowlist symlink escape", activeWorktree);
      const thread = store.updateThreadSettings(created.id, { permissionMode: "workspace" });
      store.createPermissionGrant(createLocalFolderAllowlistGrantInput({
        folderPath: allowedDir,
        threadId: thread.id,
        workspacePath: activeWorktree,
        permissionMode: "workspace",
      }));
      const requestPermission = vi.fn(async () => ({ allowed: false, mode: "deny" as const }));
      const controller = new AgentRuntimeFileAuthorityController({
        store,
        transientRoots: new Map(),
        requestPermission,
        beginPermissionWait: vi.fn(),
        activeRunId: () => undefined,
        emit: (event) => events.push(event),
      });

      const approved = await controller.requestForThread(thread.id, { ...store.getWorkspace(), path: activeWorktree }, {
        access: "read",
        toolName: "read",
        requestedPath: symlinkPath,
        absolutePath: symlinkPath,
        reason: "Path is outside the current workspace authority.",
      });

      expect(approved).toBe(false);
      expect(requestPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          grantActionKind: "file_content_read",
          grantTargetKind: "path",
          grantTargetLabel: canonicalOutsideFile,
          grantConditions: expect.objectContaining({
            path: canonicalOutsideFile,
            canonicalPath: canonicalOutsideFile,
            requestedPath: symlinkPath,
          }),
        }),
        expect.anything(),
      );
      expect(controller.rootPathsForThread(thread.id, "read")).not.toContain(allowedDir);
      expect(controller.rootPathsForThread(thread.id, "read")).not.toContain(symlinkPath);
      expect(controller.rootPathsForThread(thread.id, "read")).not.toContain(canonicalOutsideFile);
      expect(events).toContainEqual(expect.objectContaining({
        type: "permission-audit-created",
        entry: expect.objectContaining({
          decision: "denied",
          decisionSource: "denied_by_user",
          grantId: undefined,
        }),
      }));
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
