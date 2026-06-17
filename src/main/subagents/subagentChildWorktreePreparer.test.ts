import { describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshotFromProfile } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import type {
  SubagentRunEventSummary,
  SubagentRunSummary,
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../../shared/types";
import { getDefaultSubagentRoleProfile, type SubagentRoleProfile } from "../../shared/subagentRoles";
import { createDefaultModelRuntimeRegistry } from "../modelRuntimeRegistry";
import type { SubagentChildWorktreePrepareInput } from "../piChildSessionAdapter";
import {
  prepareSubagentChildWorktreeForLaunch,
  SUBAGENT_CHILD_WORKTREE_PREPARER_SCHEMA_VERSION,
  type SubagentChildWorktreePreparerStore,
} from "./subagentChildWorktreePreparer";

describe("subagentChildWorktreePreparer", () => {
  it("skips roles that cannot mutate and blocked capacity reservations", async () => {
    const store = new FakeWorktreeStore();
    const prepareChildWorktree = vi.fn();

    await expect(prepareSubagentChildWorktreeForLaunch({
      store,
      prepareChildWorktree,
      request: request({ role: getDefaultSubagentRoleProfile("summarizer") }),
    })).resolves.toBeUndefined();
    await expect(prepareSubagentChildWorktreeForLaunch({
      store,
      prepareChildWorktree,
      request: request({ run: run({ capacityStatus: "blocked" }) }),
    })).resolves.toBeUndefined();

    expect(SUBAGENT_CHILD_WORKTREE_PREPARER_SCHEMA_VERSION).toBe("ambient-subagent-child-worktree-preparer-v1");
    expect(prepareChildWorktree).not.toHaveBeenCalled();
    expect(store.runEventsFor("child-run")).toEqual([]);
  });

  it("records unavailable evidence when no child worktree preparer is configured", async () => {
    const store = new FakeWorktreeStore();

    await expect(prepareSubagentChildWorktreeForLaunch({
      store,
      request: request(),
    })).resolves.toBeUndefined();

    expect(store.runEventsFor("child-run")).toEqual([
      expect.objectContaining({
        type: "subagent.worktree_unavailable",
        preview: expect.objectContaining({
          childRunId: "child-run",
          childThreadId: "child-thread",
          parentRunId: "parent-run",
          parentThreadId: "parent-thread",
          canonicalTaskPath: "root/0:worker",
          reason: "Role requires an isolated worktree, but no child worktree preparer is configured.",
          requiredBy: "role",
          idempotencyKey: "spawn:key",
          roleId: "worker",
        }),
      }),
    ]);
  });

  it("rejects active worktrees that are not persisted on the child thread", async () => {
    const store = new FakeWorktreeStore();
    const prepared = worktree({ status: "active" });

    await expect(prepareSubagentChildWorktreeForLaunch({
      store,
      prepareChildWorktree: vi.fn(() => prepared),
      request: request(),
    })).resolves.toBeUndefined();

    expect(store.runEventsFor("child-run")).toEqual([
      expect.objectContaining({
        type: "subagent.worktree_unavailable",
        preview: expect.objectContaining({
          childRunId: "child-run",
          childThreadId: "child-thread",
          parentRunId: "parent-run",
          parentThreadId: "parent-thread",
          canonicalTaskPath: "root/0:worker",
          reason: "Prepared active worktree must be persisted on the child thread before mutating tools are enabled.",
          idempotencyKey: "spawn:key",
          roleId: "worker",
          worktree: expect.objectContaining({
            threadId: "child-thread",
            status: "active",
            worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
          }),
          childThread: {
            id: "child-thread",
            workspacePath: "/repo",
            gitWorktree: null,
          },
        }),
      }),
    ]);
  });

  it("records prepared evidence only when the active worktree is persisted on the child thread", async () => {
    const prepared = worktree({ status: "active" });
    const store = new FakeWorktreeStore({
      childThread: childThread({
        workspacePath: prepared.worktreePath,
        gitWorktree: prepared,
      }),
    });

    await expect(prepareSubagentChildWorktreeForLaunch({
      store,
      prepareChildWorktree: vi.fn(() => prepared),
      request: request(),
    })).resolves.toBe(prepared);

    expect(store.runEventsFor("child-run")).toEqual([
      expect.objectContaining({
        type: "subagent.worktree_prepared",
        preview: expect.objectContaining({
          childRunId: "child-run",
          childThreadId: "child-thread",
          parentRunId: "parent-run",
          parentThreadId: "parent-thread",
          canonicalTaskPath: "root/0:worker",
          idempotencyKey: "spawn:key",
          roleId: "worker",
          worktree: expect.objectContaining({
            threadId: "child-thread",
            status: "active",
            worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
          }),
        }),
      }),
    ]);
  });

  it("records failed, mismatched, empty, and thrown worktree preparation outcomes", async () => {
    await expect(singlePreparationResult(undefined)).resolves.toMatchObject({
      reason: "Role requires an isolated worktree, but worktree preparation returned no reservation.",
    });
    await expect(singlePreparationResult(worktree({ threadId: "other-child" }))).resolves.toMatchObject({
      reason: "Prepared worktree belongs to thread other-child, not child thread child-thread.",
      worktree: expect.objectContaining({ threadId: "other-child" }),
    });
    await expect(singlePreparationResult(worktree({ status: "failed", error: "git worktree add failed" }))).resolves.toMatchObject({
      reason: "git worktree add failed",
      worktree: expect.objectContaining({ status: "failed" }),
    });
    await expect(singlePreparationResult(new Error("preparer crashed"))).resolves.toMatchObject({
      reason: "preparer crashed",
    });
  });
});

async function singlePreparationResult(
  result: ThreadWorktreeSummary | Error | undefined,
): Promise<Record<string, unknown>> {
  const store = new FakeWorktreeStore();
  const prepareChildWorktree = vi.fn(() => {
    if (result instanceof Error) throw result;
    return result;
  });
  await prepareSubagentChildWorktreeForLaunch({
    store,
    prepareChildWorktree,
    request: request(),
  });
  const [event] = store.runEventsFor("child-run");
  return event?.preview as Record<string, unknown>;
}

function request(input: {
  role?: SubagentRoleProfile;
  run?: SubagentRunSummary;
} = {}): SubagentChildWorktreePrepareInput {
  return {
    parentThread: parentThread(),
    run: input.run ?? run(),
    role: input.role ?? getDefaultSubagentRoleProfile("worker"),
    task: "Implement the scoped fix.",
    idempotencyKey: "spawn:key",
  };
}

function parentThread(): ThreadSummary {
  return {
    id: "parent-thread",
    kind: "chat",
    title: "Parent",
    workspacePath: "/repo",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "glm-5.1",
    thinkingLevel: "medium",
    canonicalTaskPath: "root",
  };
}

function childThread(input: {
  workspacePath?: string;
  gitWorktree?: ThreadWorktreeSummary;
} = {}): ThreadSummary {
  return {
    ...parentThread(),
    id: "child-thread",
    kind: "subagent_child",
    parentThreadId: "parent-thread",
    subagentRunId: "child-run",
    canonicalTaskPath: "root/0:worker",
    workspacePath: input.workspacePath ?? "/repo",
    ...(input.gitWorktree ? { gitWorktree: input.gitWorktree } : {}),
  };
}

function run(input: { capacityStatus?: "reserved" | "blocked" } = {}): SubagentRunSummary {
  const role = getDefaultSubagentRoleProfile("worker");
  const model = createDefaultModelRuntimeRegistry().resolveProfile(role.defaultModelId);
  const capacityLeaseSnapshot = resolveSubagentCapacityLease({
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    canonicalTaskPath: "root/0:worker",
    roleId: role.id,
    model,
  });
  return {
    id: "child-run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:worker",
    roleId: role.id,
    roleProfileSnapshot: role,
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "optional_background",
    status: "reserved",
    featureFlagSnapshot: resolveAmbientFeatureFlags({
      generatedAt: "2026-06-06T00:00:00.000Z",
      settings: { subagents: true },
    }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshotFromProfile(model.modelId, model),
    capacityLeaseSnapshot: {
      ...capacityLeaseSnapshot,
      status: input.capacityStatus ?? "reserved",
    },
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  };
}

function worktree(input: {
  threadId?: string;
  status?: ThreadWorktreeSummary["status"];
  error?: string;
} = {}): ThreadWorktreeSummary {
  return {
    threadId: input.threadId ?? "child-thread",
    projectRoot: "/repo",
    worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
    branchName: "ambient/worker-child",
    baseRef: "abc1234",
    status: input.status ?? "active",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...(input.error ? { error: input.error } : {}),
  };
}

class FakeWorktreeStore implements SubagentChildWorktreePreparerStore {
  private readonly events = new Map<string, SubagentRunEventSummary[]>();
  private readonly threads = new Map<string, ThreadSummary>();

  constructor(input: { childThread?: ThreadSummary } = {}) {
    this.threads.set("parent-thread", parentThread());
    this.threads.set("child-thread", input.childThread ?? childThread());
  }

  getThread(threadId: string): ThreadSummary {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread: ${threadId}`);
    return thread;
  }

  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary {
    const existing = this.events.get(runId) ?? [];
    const event: SubagentRunEventSummary = {
      runId,
      sequence: existing.length + 1,
      type: input.type,
      createdAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
      ...(input.preview !== undefined ? { preview: input.preview } : {}),
      ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    };
    existing.push(event);
    this.events.set(runId, existing);
    return event;
  }

  runEventsFor(runId: string): SubagentRunEventSummary[] {
    return [...(this.events.get(runId) ?? [])];
  }
}
