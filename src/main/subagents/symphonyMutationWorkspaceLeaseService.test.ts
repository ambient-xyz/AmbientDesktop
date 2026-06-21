import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, afterEach } from "vitest";

import {
  SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION,
  type ChildLaunchPolicySnapshot,
  type MutationWorkspaceLease,
} from "../../shared/symphonyFineGrainedContracts";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { SubagentRunEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import {
  acquireSymphonyMutationWorkspaceLease,
} from "./symphonyMutationWorkspaceLeaseDefaultService";
import {
  buildSymphonyMutationPromotionBundle,
  heartbeatSymphonyMutationWorkspaceLease,
  releaseSymphonyMutationWorkspaceLease,
  SYMPHONY_MUTATION_PROMOTION_BUNDLE_SCHEMA_VERSION,
  SYMPHONY_MUTATION_WORKSPACE_LEASE_SERVICE_SCHEMA_VERSION,
} from "./symphonyMutationWorkspaceLeaseService";

const execFileAsync = promisify(execFile);

describe("symphonyMutationWorkspaceLeaseService", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("acquires and persists a git_worktree lease from an active child worktree", async () => {
    const parentRoot = tempRoot("ambient-symphony-git-lease-");
    const worktreeRoot = join(parentRoot, ".ambient-codex", "worktrees", "child-thread");
    await mkdir(worktreeRoot, { recursive: true });
    const store = new FakeLeaseStore(parentThread(parentRoot), childThread(parentRoot));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(parentRoot),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [parentRoot],
        writableRoots: [join(parentRoot, "generated")],
      }),
      childWorktree: worktree(parentRoot, worktreeRoot),
      requestedWriteRoots: [join(parentRoot, "generated")],
      now: "2026-06-17T01:00:00.000Z",
      isGitWorkspace: () => true,
    });

    expect(result.schemaVersion).toBe(SYMPHONY_MUTATION_WORKSPACE_LEASE_SERVICE_SCHEMA_VERSION);
    expect(result.acquired).toBe(true);
    expect(result.lease).toMatchObject({
      leaseId: "symphony-mutation:child-run",
      kind: "git_worktree",
      rootPath: worktreeRoot,
      declaredWritableRoots: [join(parentRoot, "generated")],
      writableRoots: [join(worktreeRoot, "generated")],
      status: "active",
    });
    expect(store.run.symphonyMutationWorkspaceLease).toEqual(result.lease);
    expect((await stat(join(worktreeRoot, "generated"))).isDirectory()).toBe(true);
    expect(store.threadWorkspaceUpdates).toEqual([
      { threadId: "child-thread", workspacePath: worktreeRoot },
    ]);
    expect(store.events).toEqual([
      expect.objectContaining({
        type: "symphony.mutation_lease_acquired",
        preview: expect.objectContaining({
          leaseId: "symphony-mutation:child-run",
          kind: "git_worktree",
          status: "active",
        }),
      }),
    ]);
  });

  it("allows a git_worktree lease whose writable root is exactly the child worktree root", async () => {
    const parentRoot = tempRoot("ambient-symphony-git-root-lease-");
    const worktreeRoot = join(parentRoot, ".ambient-codex", "worktrees", "child-thread");
    await mkdir(worktreeRoot, { recursive: true });
    const store = new FakeLeaseStore(parentThread(parentRoot), childThread(parentRoot));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(parentRoot),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [parentRoot],
        writableRoots: [parentRoot],
      }),
      childWorktree: worktree(parentRoot, worktreeRoot),
      requestedWriteRoots: [parentRoot],
      now: "2026-06-17T01:05:00.000Z",
      isGitWorkspace: () => true,
    });

    expect(result.acquired).toBe(true);
    expect(result.lease).toMatchObject({
      kind: "git_worktree",
      rootPath: worktreeRoot,
      declaredWritableRoots: [parentRoot],
      writableRoots: [worktreeRoot],
      status: "active",
    });
    expect(store.threadWorkspaceUpdates).toEqual([
      { threadId: "child-thread", workspacePath: worktreeRoot },
    ]);
  });

  it("sym-scratch-overlay-isolation creates a scratch_overlay lease and leaves root files untouched before promotion", async () => {
    const parentRoot = tempRoot("ambient-symphony-scratch-lease-");
    const scratchBase = tempRoot("ambient-symphony-scratch-base-");
    const store = new FakeLeaseStore(parentThread(parentRoot), childThread(parentRoot));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(parentRoot),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [parentRoot],
        writableRoots: [parentRoot],
      }),
      requestedWriteRoots: ["generated"],
      scratchRootBasePath: scratchBase,
      now: "2026-06-17T01:10:00.000Z",
      isGitWorkspace: () => false,
    });

    const lease = result.lease;
    if (!lease) throw new Error("Expected lease");
    expect(result.acquired).toBe(true);
    expect(lease).toMatchObject({
      kind: "scratch_overlay",
      rootPath: join(scratchBase, "child-run"),
      declaredWritableRoots: [join(parentRoot, "generated")],
      writableRoots: [join(scratchBase, "child-run", "generated")],
      readOnlyBaseRoots: [parentRoot],
      status: "active",
    });
    const scratchOutput = await stat(join(scratchBase, "child-run", "generated"));
    expect(scratchOutput.isDirectory()).toBe(true);
    await expect(stat(join(parentRoot, "generated"))).rejects.toThrow();
    expect(store.threadWorkspaceUpdates).toEqual([
      { threadId: "child-thread", workspacePath: join(scratchBase, "child-run") },
    ]);

    const promotion = buildSymphonyMutationPromotionBundle({
      lease,
      diffArtifactRefs: ["artifact://diffs/child-run.patch"],
      changedArtifactRefs: ["artifact://scratch/generated/menu.json"],
      checkRefs: ["check://verifier/pass"],
      createdAt: "2026-06-17T01:11:00.000Z",
    });
    expect(promotion).toMatchObject({
      schemaVersion: SYMPHONY_MUTATION_PROMOTION_BUNDLE_SCHEMA_VERSION,
      leaseId: lease.leaseId,
      declaredWritableRoots: [join(parentRoot, "generated")],
      writableRoots: [join(scratchBase, "child-run", "generated")],
      diffArtifactRefs: ["artifact://diffs/child-run.patch"],
      checkRefs: ["check://verifier/pass"],
    });
  });

  it("seeds scratch_overlay leases with readable source paths and writable source copies", async () => {
    const parentRoot = tempRoot("ambient-symphony-scratch-source-");
    await writeFile(join(parentRoot, "README.md"), "readable source\n");
    await mkdir(join(parentRoot, "src"), { recursive: true });
    await writeFile(join(parentRoot, "src", "config.json"), "{\"enabled\":true}\n");
    await mkdir(join(parentRoot, "generated"), { recursive: true });
    await writeFile(join(parentRoot, "generated", "existing.md"), "existing source\n");
    const outsideRoot = tempRoot("ambient-symphony-scratch-source-outside-");
    await writeFile(join(outsideRoot, "outside.txt"), "outside source\n");
    await symlink(join(outsideRoot, "outside.txt"), join(parentRoot, "outside-link.txt"));
    const scratchBase = tempRoot("ambient-symphony-scratch-source-base-");
    const store = new FakeLeaseStore(parentThread(parentRoot), childThread(parentRoot));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(parentRoot),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [parentRoot],
        writableRoots: [join(parentRoot, "generated")],
      }),
      requestedWriteRoots: [join(parentRoot, "generated")],
      scratchRootBasePath: scratchBase,
      now: "2026-06-17T01:12:00.000Z",
      isGitWorkspace: () => false,
    });

    const lease = result.lease;
    if (!lease) throw new Error("Expected lease");
    expect(result.acquired).toBe(true);
    expect(await readFile(join(lease.rootPath, "README.md"), "utf8")).toBe("readable source\n");
    expect(await readFile(join(lease.rootPath, "src", "config.json"), "utf8")).toBe("{\"enabled\":true}\n");
    expect(await readFile(join(lease.rootPath, "generated", "existing.md"), "utf8")).toBe("existing source\n");
    await expect(stat(join(lease.rootPath, "outside-link.txt"))).rejects.toThrow();

    await writeFile(join(lease.rootPath, "generated", "existing.md"), "scratch edit\n");
    expect(await readFile(join(parentRoot, "generated", "existing.md"), "utf8")).toBe("existing source\n");
  });

  it("fails closed for Git workspaces without a prepared child worktree", async () => {
    const parentRoot = tempRoot("ambient-symphony-git-missing-worktree-");
    const store = new FakeLeaseStore(parentThread(parentRoot), childThread(parentRoot));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(parentRoot),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [parentRoot],
        writableRoots: [join(parentRoot, "src")],
      }),
      now: "2026-06-17T01:20:00.000Z",
      isGitWorkspace: () => true,
    });

    expect(result.acquired).toBe(false);
    expect(result.lease).toMatchObject({
      kind: "git_worktree",
      status: "failed",
      failureReason: "Git workspace requires a prepared child worktree before mutation tools can launch.",
    });
    expect(store.threadWorkspaceUpdates).toEqual([]);
    expect(store.events[0]).toMatchObject({
      type: "symphony.mutation_lease_failed",
      preview: expect.objectContaining({
        reason: "Git workspace requires a prepared child worktree before mutation tools can launch.",
      }),
    });
  });

  it("fails closed for Git subdirectories without a prepared child worktree", async () => {
    const repoRoot = tempRoot("ambient-symphony-git-subdir-repo-");
    const nestedWorkspace = join(repoRoot, "packages", "app");
    await mkdir(nestedWorkspace, { recursive: true });
    await execFileAsync("git", ["init", repoRoot]);
    const store = new FakeLeaseStore(parentThread(nestedWorkspace), childThread(nestedWorkspace));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(nestedWorkspace),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [nestedWorkspace],
        writableRoots: [join(nestedWorkspace, "generated")],
      }),
      now: "2026-06-17T01:21:00.000Z",
    });

    expect(result.acquired).toBe(false);
    expect(result.lease).toMatchObject({
      kind: "git_worktree",
      status: "failed",
      failureReason: "Git workspace requires a prepared child worktree before mutation tools can launch.",
    });
    expect(store.threadWorkspaceUpdates).toEqual([]);
  });

  it("fails closed when a scratch_overlay base is a symlink", async () => {
    const parentRoot = tempRoot("ambient-symphony-scratch-symlink-parent-");
    const scratchLinkParent = tempRoot("ambient-symphony-scratch-symlink-link-");
    const scratchLink = join(scratchLinkParent, "scratch");
    const outsideRoot = tempRoot("ambient-symphony-scratch-symlink-outside-");
    await symlink(outsideRoot, scratchLink, "dir");
    const store = new FakeLeaseStore(parentThread(parentRoot), childThread(parentRoot));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(parentRoot),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [parentRoot],
        writableRoots: [join(parentRoot, "generated")],
      }),
      requestedWriteRoots: [join(parentRoot, "generated")],
      scratchRootBasePath: scratchLink,
      now: "2026-06-17T01:22:00.000Z",
      isGitWorkspace: () => false,
    });

    expect(result.acquired).toBe(false);
    expect(result.lease).toMatchObject({
      kind: "scratch_overlay",
      status: "failed",
      failureReason: expect.stringContaining("must not be a symlink"),
    });
    expect(store.threadWorkspaceUpdates).toEqual([]);
    expect(store.events[0]).toMatchObject({
      type: "symphony.mutation_lease_failed",
    });
  });

  it("fails closed before seeding source files through a scratch_overlay root symlink", async () => {
    const parentRoot = tempRoot("ambient-symphony-scratch-root-symlink-parent-");
    await writeFile(join(parentRoot, "README.md"), "do not copy through symlink\n");
    const scratchBase = tempRoot("ambient-symphony-scratch-root-symlink-base-");
    const outsideRoot = tempRoot("ambient-symphony-scratch-root-symlink-outside-");
    await symlink(outsideRoot, join(scratchBase, "child-run"), "dir");
    const store = new FakeLeaseStore(parentThread(parentRoot), childThread(parentRoot));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(parentRoot),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [parentRoot],
        writableRoots: [join(parentRoot, "generated")],
      }),
      requestedWriteRoots: [join(parentRoot, "generated")],
      scratchRootBasePath: scratchBase,
      now: "2026-06-17T01:23:00.000Z",
      isGitWorkspace: () => false,
    });

    expect(result.acquired).toBe(false);
    expect(result.lease).toMatchObject({
      kind: "scratch_overlay",
      status: "failed",
      failureReason: expect.stringContaining("resolves outside scratch lease base"),
    });
    await expect(stat(join(outsideRoot, "README.md"))).rejects.toThrow();
    expect(store.threadWorkspaceUpdates).toEqual([]);
  });

  it("fails closed when a git_worktree writable root resolves outside the child worktree", async () => {
    const parentRoot = tempRoot("ambient-symphony-git-symlink-parent-");
    const worktreeRoot = join(parentRoot, ".ambient-codex", "worktrees", "child-thread");
    const outsideRoot = tempRoot("ambient-symphony-git-symlink-outside-");
    await mkdir(worktreeRoot, { recursive: true });
    await symlink(outsideRoot, join(worktreeRoot, "generated"), "dir");
    const store = new FakeLeaseStore(parentThread(parentRoot), childThread(parentRoot));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(parentRoot),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [parentRoot],
        writableRoots: [join(parentRoot, "generated")],
      }),
      childWorktree: worktree(parentRoot, worktreeRoot),
      requestedWriteRoots: [join(parentRoot, "generated")],
      now: "2026-06-17T01:25:00.000Z",
      isGitWorkspace: () => true,
      mkdirp: () => undefined,
    });

    expect(result.acquired).toBe(false);
    expect(result.lease).toMatchObject({
      kind: "git_worktree",
      status: "failed",
      failureReason: expect.stringContaining("resolves outside child worktree"),
    });
    expect(store.threadWorkspaceUpdates).toEqual([]);
    expect(store.events[0]).toMatchObject({
      type: "symphony.mutation_lease_failed",
    });
  });

  it("fails closed before creating descendants through a git_worktree symlink prefix", async () => {
    const parentRoot = tempRoot("ambient-symphony-git-symlink-prefix-parent-");
    const worktreeRoot = join(parentRoot, ".ambient-codex", "worktrees", "child-thread");
    const outsideRoot = tempRoot("ambient-symphony-git-symlink-prefix-outside-");
    await mkdir(worktreeRoot, { recursive: true });
    await symlink(outsideRoot, join(worktreeRoot, "generated"), "dir");
    const store = new FakeLeaseStore(parentThread(parentRoot), childThread(parentRoot));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(parentRoot),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [parentRoot],
        writableRoots: [join(parentRoot, "generated")],
      }),
      childWorktree: worktree(parentRoot, worktreeRoot),
      requestedWriteRoots: [join(parentRoot, "generated", "out")],
      now: "2026-06-17T01:26:00.000Z",
      isGitWorkspace: () => true,
    });

    expect(result.acquired).toBe(false);
    expect(result.lease).toMatchObject({
      kind: "git_worktree",
      status: "failed",
      failureReason: expect.stringContaining("resolves outside child worktree"),
    });
    await expect(stat(join(outsideRoot, "out"))).rejects.toThrow();
    expect(store.threadWorkspaceUpdates).toEqual([]);
  });

  it("persists a failed scratch_overlay lease when the scratch directory cannot be created", async () => {
    const parentRoot = tempRoot("ambient-symphony-scratch-failed-");
    const store = new FakeLeaseStore(parentThread(parentRoot), childThread(parentRoot));
    const run = childRun();

    const result = await acquireSymphonyMutationWorkspaceLease({
      store,
      parentThread: parentThread(parentRoot),
      run,
      policy: launchPolicy({
        inheritedAuthorityRoots: [parentRoot],
        writableRoots: [join(parentRoot, "generated")],
      }),
      requestedWriteRoots: [join(parentRoot, "generated")],
      now: "2026-06-17T01:30:00.000Z",
      isGitWorkspace: () => false,
      mkdirp: () => {
        throw new Error("disk is read-only");
      },
    });

    expect(result.acquired).toBe(false);
    expect(result.lease).toMatchObject({
      kind: "scratch_overlay",
      status: "failed",
      failureReason: expect.stringContaining("disk is read-only"),
    });
    expect(store.run.symphonyMutationWorkspaceLease).toEqual(result.lease);
    expect(store.events[0]).toMatchObject({
      type: "symphony.mutation_lease_failed",
      preview: expect.objectContaining({
        kind: "scratch_overlay",
        status: "failed",
        reason: expect.stringContaining("disk is read-only"),
      }),
    });
  });

  it("heartbeats and releases active leases without losing ownership metadata", () => {
    const lease = leaseFixture("/workspace", "/scratch/child-run");
    const heartbeat = heartbeatSymphonyMutationWorkspaceLease(lease, "2026-06-17T02:00:00.000Z");
    const released = releaseSymphonyMutationWorkspaceLease(heartbeat, {
      now: "2026-06-17T02:10:00.000Z",
      promotionBundleId: "bundle-1",
    });

    expect(heartbeat).toMatchObject({
      leaseId: lease.leaseId,
      status: "active",
      lastHeartbeatAt: "2026-06-17T02:00:00.000Z",
    });
    expect(released).toMatchObject({
      leaseId: lease.leaseId,
      status: "released",
      promotionBundleId: "bundle-1",
      lastHeartbeatAt: "2026-06-17T02:10:00.000Z",
    });
  });

  it("does not release failed leases", () => {
    const failed = {
      ...leaseFixture("/workspace", "/scratch/child-run"),
      status: "failed" as const,
      writableRoots: [],
      failureReason: "Git workspace requires a prepared child worktree before mutation tools can launch.",
    };

    expect(releaseSymphonyMutationWorkspaceLease(failed, {
      now: "2026-06-17T02:30:00.000Z",
    })).toEqual(failed);
  });
});

function tempRoot(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(path);
  return path;
}

const tempRoots: string[] = [];

function parentThread(workspacePath: string): ThreadSummary {
  return {
    id: "parent-thread",
    title: "Parent",
    workspacePath,
    kind: "chat",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "<model>",
    thinkingLevel: "medium",
    canonicalTaskPath: "root",
  };
}

function childThread(workspacePath: string): ThreadSummary {
  return {
    ...parentThread(workspacePath),
    id: "child-thread",
    kind: "subagent_child",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    subagentRunId: "child-run",
    canonicalTaskPath: "root/0:worker",
  };
}

function childRun(): SubagentRunSummary {
  return {
    id: "child-run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:worker",
    roleId: "worker",
    roleProfileSnapshot: {} as SubagentRunSummary["roleProfileSnapshot"],
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "reserved",
    featureFlagSnapshot: resolveAmbientFeatureFlags({
      settings: { subagents: true },
      generatedAt: "2026-06-17T00:00:00.000Z",
    }),
    modelRuntimeSnapshot: {} as SubagentRunSummary["modelRuntimeSnapshot"],
    capacityLeaseSnapshot: {} as SubagentRunSummary["capacityLeaseSnapshot"],
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
  };
}

function worktree(parentRoot: string, worktreePath: string): ThreadWorktreeSummary {
  return {
    threadId: "child-thread",
    projectRoot: parentRoot,
    worktreePath,
    branchName: "ambient/child-thread",
    status: "active",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
  };
}

function launchPolicy(input: {
  inheritedAuthorityRoots: string[];
  writableRoots: string[];
}): ChildLaunchPolicySnapshot {
  return {
    schemaVersion: SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION,
    policyId: "policy-1",
    childRunId: "child-run",
    role: "worker",
    pattern: "self_healing_loop",
    inheritedAuthorityRoots: input.inheritedAuthorityRoots,
    writableRoots: input.writableRoots,
    allowedToolIds: ["workspace.write"],
    deniedToolIds: ["browser.interactive"],
    webProviderOrder: {
      search: [],
      staticFetchExtract: [],
      dynamicHeadlessBrowser: [],
      interactiveBrowser: {
        providers: [],
        fallback: "deny",
      },
    },
    mutation: "lease_required",
  };
}

function leaseFixture(parentRoot: string, scratchRoot: string): MutationWorkspaceLease {
  return {
    schemaVersion: "ambient-symphony-mutation-workspace-lease-v1",
    leaseId: "symphony-mutation:child-run",
    parentThreadId: "parent-thread",
    childThreadId: "child-thread",
    childRunId: "child-run",
    kind: "scratch_overlay",
    rootPath: scratchRoot,
    sourceRoots: [parentRoot],
    readOnlyBaseRoots: [parentRoot],
    declaredWritableRoots: [join(parentRoot, "out")],
    writableRoots: [join(scratchRoot, "out")],
    status: "active",
    acquiredAt: "2026-06-17T01:00:00.000Z",
    lastHeartbeatAt: "2026-06-17T01:00:00.000Z",
  };
}

class FakeLeaseStore {
  readonly events: SubagentRunEventSummary[] = [];
  readonly threadWorkspaceUpdates: Array<{ threadId: string; workspacePath: string }> = [];
  run: SubagentRunSummary;

  constructor(
    private readonly parent: ThreadSummary,
    private child: ThreadSummary,
  ) {
    this.run = childRun();
  }

  getThread(threadId: string): ThreadSummary {
    if (threadId === this.parent.id) return this.parent;
    if (threadId === this.child.id) return this.child;
    throw new Error(`Unknown thread: ${threadId}`);
  }

  updateThreadWorkspacePath(threadId: string, workspacePath: string): ThreadSummary {
    this.threadWorkspaceUpdates.push({ threadId, workspacePath });
    this.child = { ...this.getThread(threadId), workspacePath };
    return this.child;
  }

  updateSubagentRunMutationWorkspaceLease(runId: string, lease: MutationWorkspaceLease): SubagentRunSummary {
    if (runId !== this.run.id) throw new Error(`Unknown run: ${runId}`);
    this.run = {
      ...this.run,
      symphonyMutationWorkspaceLease: lease,
      updatedAt: lease.lastHeartbeatAt,
    };
    return this.run;
  }

  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary {
    const event: SubagentRunEventSummary = {
      runId,
      sequence: this.events.length + 1,
      type: input.type,
      createdAt: input.createdAt ?? "2026-06-17T00:00:00.000Z",
      ...(input.preview !== undefined ? { preview: input.preview } : {}),
      ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    };
    this.events.push(event);
    return event;
  }
}
