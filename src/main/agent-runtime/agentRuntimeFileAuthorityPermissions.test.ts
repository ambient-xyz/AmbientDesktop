import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { PermissionRequest } from "../../shared/permissionTypes";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

describe("AgentRuntime file authority permissions", () => {
  it("routes child file authority misses through the permission broker and records transient roots", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-child-file-authority-request-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with child file authority request");
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
      const requestedPath = join(workspacePath, "needs-approval.txt");
      const requestPermission = vi.fn(async (
        input: Omit<PermissionRequest, "id">,
        options?: { onRequest?: (request: PermissionRequest) => void },
      ) => {
        options?.onRequest?.({ ...input, id: "permission-child-read" });
        return { allowed: true, mode: "allow_once" as const };
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: requestPermission,
          denyThread: () => undefined,
          listPending: () => [],
        },
      );

      const approved = await (runtime as any).requestFileAuthorityForThread(running.childThreadId, store.getWorkspace(), {
        access: "read",
        toolName: "read",
        requestedPath,
        absolutePath: requestedPath,
        reason: "Path is outside the current workspace authority.",
      });

      expect(approved).toBe(true);
      expect(requestPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: running.childThreadId,
          toolName: "read",
          title: "Allow read to read needs-approval.txt?",
          grantActionKind: "file_content_read",
          grantTargetKind: "path",
          grantTargetLabel: requestedPath,
          grantConditions: expect.objectContaining({ path: requestedPath, access: "read" }),
        }),
        expect.anything(),
      );
      expect((runtime as any).fileAuthorityRootPathsForThread(running.childThreadId, "read")).toContain(requestedPath);
      expect(store.listPermissionAudit(10)).toEqual([
        expect.objectContaining({
          threadId: running.childThreadId,
          toolName: "read",
          decision: "allowed",
          decisionSource: "prompt_allow_once",
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps non-interactive child file authority misses as policy denials", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-child-file-authority-noninteractive-"));
    const store = new ProjectStore();
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
      store.recordSubagentToolScopeSnapshot(running.id, {
        scope: { approvalMode: "non_interactive" } as any,
      });
      const requestPermission = vi.fn();
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: requestPermission,
          denyThread: () => undefined,
          listPending: () => [],
        },
      );
      const requestedPath = join(workspacePath, "needs-approval.txt");

      const approved = await (runtime as any).requestFileAuthorityForThread(running.childThreadId, store.getWorkspace(), {
        access: "read",
        toolName: "read",
        requestedPath,
        absolutePath: requestedPath,
        reason: "Path is outside the current workspace authority.",
      });

      expect(approved).toBe(false);
      expect(requestPermission).not.toHaveBeenCalled();
      expect(store.listPermissionAudit(10)).toEqual([
        expect.objectContaining({
          threadId: running.childThreadId,
          toolName: "read",
          decision: "denied",
          decisionSource: "denied_by_policy",
          reason: expect.stringContaining("non-interactive"),
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("includes approved path grants in thread file authority roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-grant-authority-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const outsideFile = join(root, "outside", "approved.txt");
    const store = new ProjectStore();
    try {
      await mkdir(activeWorktree, { recursive: true });
      await mkdir(join(root, "outside"), { recursive: true });
      store.openWorkspace(projectRoot);
      const thread = store.createThread("grant authority", activeWorktree);
      store.createPermissionGrant({
        permissionModeAtCreation: "workspace",
        scopeKind: "thread",
        threadId: thread.id,
        actionKind: "local_file_write",
        targetKind: "path",
        targetHash: "test",
        targetLabel: outsideFile,
        conditions: { path: outsideFile },
        reason: "test grant",
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      expect((runtime as any).fileAuthorityRootPathsForThread(thread.id, "read")).toContain(outsideFile);
      expect((runtime as any).fileAuthorityRootPathsForThread(thread.id, "write")).toContain(join(root, "outside"));
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds transient file authority for one-shot outside workspace approvals", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-transient-authority-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const outsideDir = join(root, "outside");
    const outsideFile = join(outsideDir, "approved-once.txt");
    const store = new ProjectStore();
    try {
      await mkdir(activeWorktree, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      store.openWorkspace(projectRoot);
      const created = store.createThread("transient authority", activeWorktree);
      const thread = store.updateThreadSettings(created.id, { permissionMode: "workspace" });
      const requester = vi.fn(async (_request: any) => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });
      const workspace = { ...store.getWorkspace(), path: activeWorktree };

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "write", {
        path: outsideFile,
        content: "approved once\n",
      })).resolves.toBeUndefined();

      expect(requester).toHaveBeenCalledTimes(1);
      const requestedPermission = requester.mock.calls.at(0)?.[0];
      expect(requestedPermission).toMatchObject({
        title: "Allow outside-workspace file access?",
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
      });
      expect(requestedPermission.detail).toContain(outsideFile);
      expect(requestedPermission.detail).toContain("Approved path:");
      expect(store.listPermissionGrants()).toEqual([]);
      expect((runtime as any).fileAuthorityRootPathsForThread(thread.id, "write")).toContain(outsideDir);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds transient file authority for one-shot outside workspace Bash approvals", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-bash-transient-authority-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const outsideDir = join(root, "outside");
    const outsideFile = join(outsideDir, "bash-approved-once.txt");
    const store = new ProjectStore();
    try {
      await mkdir(activeWorktree, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      store.openWorkspace(projectRoot);
      const created = store.createThread("bash transient authority", activeWorktree);
      const thread = store.updateThreadSettings(created.id, { permissionMode: "workspace" });
      const requester = vi.fn(async (_request: any) => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });
      const workspace = { ...store.getWorkspace(), path: activeWorktree };

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: `printf hi > ${outsideFile}`,
      })).resolves.toBeUndefined();

      expect(requester).toHaveBeenCalledTimes(1);
      const requestedPermission = requester.mock.calls.at(0)?.[0];
      expect(requestedPermission).toMatchObject({
        risk: "outside-workspace",
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
        grantTargetLabel: outsideFile,
        grantConditions: expect.objectContaining({
          operation: "bash",
          path: outsideFile,
        }),
      });
      expect(requestedPermission.detail).toContain("Approved path:");
      expect(store.listPermissionGrants()).toEqual([]);
      expect((runtime as any).fileAuthorityRootPathsForThread(thread.id, "write")).toContain(outsideDir);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds audited full-access file authority for outside workspace writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-full-access-authority-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const outsideDir = join(root, "outside");
    const outsideFile = join(outsideDir, "power-user.txt");
    const store = new ProjectStore();
    try {
      await mkdir(activeWorktree, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      store.openWorkspace(projectRoot);
      const created = store.createThread("full access authority", activeWorktree);
      const thread = store.updateThreadSettings(created.id, { permissionMode: "full-access" });
      const requester = vi.fn(async () => {
        throw new Error("Unexpected permission prompt.");
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });
      const workspace = { ...store.getWorkspace(), path: activeWorktree };

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "write", {
        path: outsideFile,
        content: "power user\n",
      })).resolves.toBeUndefined();

      expect(requester).not.toHaveBeenCalled();
      expect((runtime as any).fileAuthorityRootPathsForThread(thread.id, "write")).toContain(outsideDir);
      expect(store.listPermissionAudit(10)).toEqual([
        expect.objectContaining({
          threadId: thread.id,
          toolName: "write",
          risk: "outside-workspace",
          decision: "allowed",
          detail: outsideFile,
          decisionSource: "allowed_by_full_access",
        }),
      ]);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
