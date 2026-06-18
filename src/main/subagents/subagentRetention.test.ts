import { describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { getDefaultSubagentRoleProfile, type SubagentRoleId } from "../../shared/subagentRoles";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { planSubagentRetention } from "./subagentRetention";

describe("subagentRetention", () => {
  it("marks only closed terminal children past the retention window as cleanup-eligible", () => {
    const now = "2026-06-05T00:10:00.000Z";
    const cleanupWindowMs = 60_000;
    const runs = [
      run({ id: "completed-old", childThreadId: "thread-completed-old", status: "completed", closedAt: "2026-06-05T00:00:00.000Z" }),
      run({ id: "completed-recent", childThreadId: "thread-completed-recent", status: "completed", closedAt: "2026-06-05T00:09:30.000Z" }),
      run({ id: "completed-open", childThreadId: "thread-completed-open", status: "completed" }),
      run({ id: "running", childThreadId: "thread-running", status: "running" }),
      run({ id: "failed", childThreadId: "thread-failed", status: "failed", closedAt: "2026-06-05T00:00:00.000Z" }),
      run({ id: "needs-attention", childThreadId: "thread-needs-attention", status: "needs_attention", closedAt: "2026-06-05T00:00:00.000Z" }),
      run({ id: "pinned", childThreadId: "thread-pinned", status: "completed", closedAt: "2026-06-05T00:00:00.000Z" }),
      run({ id: "archived", childThreadId: "thread-archived", status: "completed", closedAt: "2026-06-05T00:00:00.000Z" }),
    ];

    const plan = planSubagentRetention({
      runs,
      threads: [
        thread({ id: "thread-completed-old" }),
        thread({ id: "thread-completed-recent" }),
        thread({ id: "thread-completed-open" }),
        thread({ id: "thread-running" }),
        thread({ id: "thread-failed" }),
        thread({ id: "thread-needs-attention" }),
        thread({ id: "thread-pinned", pinned: true }),
        thread({ id: "thread-archived", archivedAt: "2026-06-05T00:02:00.000Z" }),
      ],
      now,
      cleanupWindowMs,
    });

    expect(plan).toMatchObject({
      schemaVersion: "ambient-subagent-retention-plan-v1",
      createdAt: now,
      cleanupWindowMs,
      eligibleRunIds: ["completed-old"],
      protectedRunIds: ["completed-recent", "completed-open", "running", "failed", "needs-attention", "pinned", "archived"],
    });
    expect(plan.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        runId: "completed-old",
        action: "eligible_for_cleanup",
        reason: "retention_window_elapsed",
        retentionDefault: "transient",
        eligibleAt: "2026-06-05T00:01:00.000Z",
        ageMs: 600_000,
        summaryRetained: true,
      }),
      expect.objectContaining({ runId: "completed-recent", action: "retain", reason: "retention_window_active", ageMs: 30_000 }),
      expect.objectContaining({ runId: "completed-open", action: "retain", reason: "child_not_closed" }),
      expect.objectContaining({ runId: "running", action: "retain", reason: "active_child" }),
      expect.objectContaining({ runId: "failed", action: "retain", reason: "failed_child" }),
      expect.objectContaining({ runId: "needs-attention", action: "retain", reason: "needs_attention" }),
      expect.objectContaining({ runId: "pinned", action: "retain", reason: "child_thread_pinned", pinned: true }),
      expect.objectContaining({ runId: "archived", action: "retain", reason: "child_thread_archived", archived: true }),
    ]));
  });

  it("fails closed when the child thread record is missing", () => {
    const plan = planSubagentRetention({
      runs: [run({ id: "orphan", childThreadId: "missing-child", status: "completed", closedAt: "2026-06-05T00:00:00.000Z" })],
      threads: [],
      now: "2026-06-05T01:00:00.000Z",
      cleanupWindowMs: 1,
    });

    expect(plan.decisions).toEqual([
      expect.objectContaining({
        runId: "orphan",
        action: "retain",
        reason: "missing_child_thread",
      }),
    ]);
    expect(plan.eligibleRunIds).toEqual([]);
  });

  it("collapses oldest completed eligible children when the per-parent retention cap is exceeded", () => {
    const plan = planSubagentRetention({
      runs: [
        run({ id: "oldest", childThreadId: "thread-oldest", status: "completed", closedAt: "2026-06-05T00:00:00.000Z" }),
        run({ id: "middle", childThreadId: "thread-middle", status: "completed", closedAt: "2026-06-05T00:01:00.000Z" }),
        run({ id: "newest", childThreadId: "thread-newest", status: "completed", closedAt: "2026-06-05T00:02:00.000Z" }),
        run({ id: "failed", childThreadId: "thread-failed", status: "failed", closedAt: "2026-06-05T00:00:00.000Z" }),
      ],
      threads: [
        thread({ id: "thread-oldest" }),
        thread({ id: "thread-middle" }),
        thread({ id: "thread-newest" }),
        thread({ id: "thread-failed" }),
      ],
      now: "2026-06-05T00:10:00.000Z",
      cleanupWindowMs: 60 * 60_000,
      maxRetainedChildrenPerParent: 2,
    });

    expect(plan.maxRetainedChildrenPerParent).toBe(2);
    expect(plan.eligibleRunIds).toEqual(["oldest", "middle"]);
    expect(plan.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ runId: "oldest", action: "eligible_for_cleanup", reason: "retention_cap_exceeded" }),
      expect.objectContaining({ runId: "middle", action: "eligible_for_cleanup", reason: "retention_cap_exceeded" }),
      expect.objectContaining({ runId: "newest", action: "retain", reason: "retention_window_active" }),
      expect.objectContaining({ runId: "failed", action: "retain", reason: "failed_child" }),
    ]));
  });

  it("protects currently parent-blocking children from cleanup windows and retained-child cap collapse", () => {
    const plan = planSubagentRetention({
      runs: [
        run({ id: "blocking", childThreadId: "thread-blocking", status: "completed", closedAt: "2026-06-05T00:00:00.000Z" }),
        run({ id: "old", childThreadId: "thread-old", status: "completed", closedAt: "2026-06-05T00:01:00.000Z" }),
        run({ id: "new", childThreadId: "thread-new", status: "completed", closedAt: "2026-06-05T00:02:00.000Z" }),
        run({ id: "optional-background", childThreadId: "thread-optional", status: "completed", closedAt: "2026-06-05T00:01:30.000Z" }),
      ],
      threads: [
        thread({ id: "thread-blocking" }),
        thread({ id: "thread-old" }),
        thread({ id: "thread-new" }),
        thread({ id: "thread-optional" }),
      ],
      waitBarriers: [
        waitBarrier({ id: "barrier-required", childRunIds: ["blocking"], status: "waiting_on_children" }),
        waitBarrier({ id: "barrier-optional", childRunIds: ["optional-background"], dependencyMode: "optional_background", status: "waiting_on_children" }),
      ],
      now: "2026-06-05T00:10:00.000Z",
      cleanupWindowMs: 60 * 60_000,
      maxRetainedChildrenPerParent: 2,
    });

    expect(plan.eligibleRunIds).toEqual(["old", "optional-background"]);
    expect(plan.protectedRunIds).toEqual(["blocking", "new"]);
    expect(plan.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        runId: "blocking",
        action: "retain",
        reason: "parent_blocking_child",
        parentBlockingWaitBarrierIds: ["barrier-required"],
      }),
      expect.objectContaining({
        runId: "old",
        action: "eligible_for_cleanup",
        reason: "retention_cap_exceeded",
        parentBlockingWaitBarrierIds: [],
      }),
      expect.objectContaining({
        runId: "new",
        action: "retain",
        reason: "retention_window_active",
      }),
      expect.objectContaining({
        runId: "optional-background",
        action: "eligible_for_cleanup",
        reason: "retention_cap_exceeded",
        parentBlockingWaitBarrierIds: [],
      }),
    ]));
  });

  it("honors role retention defaults before the cleanup age window", () => {
    const now = "2026-06-05T00:10:00.000Z";
    const cleanupWindowMs = 60_000;
    const keepUntilParent = run({
      id: "keep-until-parent",
      childThreadId: "thread-keep",
      roleId: "explorer",
      roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
      status: "completed",
      closedAt: "2026-06-05T00:00:00.000Z",
    });
    const rolePinned = run({
      id: "role-pinned",
      childThreadId: "thread-role-pinned",
      roleProfileSnapshot: {
        ...getDefaultSubagentRoleProfile("summarizer"),
        retentionDefault: "pinned",
      },
      status: "completed",
      closedAt: "2026-06-05T00:00:00.000Z",
    });

    const activeParentPlan = planSubagentRetention({
      runs: [keepUntilParent, rolePinned],
      threads: [
        parentThread({ id: "parent-thread" }),
        thread({ id: "thread-keep" }),
        thread({ id: "thread-role-pinned" }),
      ],
      now,
      cleanupWindowMs,
    });

    expect(activeParentPlan.eligibleRunIds).toEqual([]);
    expect(activeParentPlan.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        runId: "keep-until-parent",
        action: "retain",
        reason: "parent_thread_active",
        retentionDefault: "keep_until_parent_pruned",
        parentArchived: false,
      }),
      expect.objectContaining({
        runId: "role-pinned",
        action: "retain",
        reason: "role_retention_pinned",
        retentionDefault: "pinned",
      }),
    ]));

    const archivedParentPlan = planSubagentRetention({
      runs: [keepUntilParent],
      threads: [
        parentThread({ id: "parent-thread", archivedAt: "2026-06-05T00:05:00.000Z" }),
        thread({ id: "thread-keep" }),
      ],
      now,
      cleanupWindowMs,
    });

    expect(archivedParentPlan.eligibleRunIds).toEqual(["keep-until-parent"]);
    expect(archivedParentPlan.decisions).toEqual([
      expect.objectContaining({
        runId: "keep-until-parent",
        action: "eligible_for_cleanup",
        reason: "retention_window_elapsed",
        retentionDefault: "keep_until_parent_pruned",
        parentArchived: true,
        parentArchivedAt: "2026-06-05T00:05:00.000Z",
      }),
    ]);

    const missingParentPlan = planSubagentRetention({
      runs: [keepUntilParent],
      threads: [thread({ id: "thread-keep" })],
      now,
      cleanupWindowMs,
    });

    expect(missingParentPlan.eligibleRunIds).toEqual([]);
    expect(missingParentPlan.decisions).toEqual([
      expect.objectContaining({
        runId: "keep-until-parent",
        action: "retain",
        reason: "missing_parent_thread",
      }),
    ]);
  });
});

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread",
    title: "Child",
    workspacePath: "/workspace",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    messageCount: 0,
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient/glm-5.1",
    thinkingLevel: "minimal",
    kind: "subagent_child",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    subagentRunId: "run",
    collapsedByDefault: true,
    childStatus: "completed",
    ...overrides,
  } as ThreadSummary;
}

function parentThread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "parent-thread",
    title: "Parent",
    workspacePath: "/workspace",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    messageCount: 0,
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient/glm-5.1",
    thinkingLevel: "minimal",
    kind: "chat",
    ...overrides,
  } as ThreadSummary;
}

function run(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  const roleId = (overrides.roleId ?? "summarizer") as SubagentRoleId;
  return {
    id: "run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "thread",
    canonicalTaskPath: `root/0:${roleId}`,
    roleId,
    roleProfileSnapshot: getDefaultSubagentRoleProfile(roleId),
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "completed",
    featureFlagSnapshot: resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot("ambient/glm-5.1", "2026-06-05T00:00:00.000Z"),
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  } as SubagentRunSummary;
}

function waitBarrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}
