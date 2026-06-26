import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { SubagentResultArtifact } from "../../shared/subagentProtocol";
import { ProjectStore } from "./projectStore";
import { createSubagentBatchJobPlan, createSubagentBatchResultReport, type SubagentBatchJobPlan } from "./projectStoreSubagentsFacade";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ambient-store-subagent-diagnostics-"));
  roots.push(root);
  return join(root, "workspace");
}

function batchPlan(parentThreadId: string): SubagentBatchJobPlan {
  return createSubagentBatchJobPlan({
    parentThreadId,
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    canonicalTaskPath: "root/9:batch",
    createdAt: "2026-06-05T00:00:00.000Z",
    maxConcurrency: 2,
    items: [
      { itemId: "lint", roleId: "worker", task: "Run lint and fix scoped findings." },
      { itemId: "test", roleId: "reviewer", task: "Review test output." },
    ],
  });
}

function enabledSubagentFeatureFlags(generatedAt = "2026-06-05T00:00:00.000Z") {
  return resolveAmbientFeatureFlags({
    startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
    generatedAt,
  });
}

function upsertBatchJobPlan(store: ProjectStore, plan: SubagentBatchJobPlan) {
  return store.upsertSubagentBatchJobPlan(plan, {
    featureFlagSnapshot: enabledSubagentFeatureFlags(plan.createdAt),
  });
}

function batchArtifact(runId: string, status: SubagentResultArtifact["status"], childThreadId = `${runId}-thread`): SubagentResultArtifact {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status,
    partial: false,
    summary: `Result artifact for ${runId}.`,
    childThreadId,
  };
}

function waitBarrierResolutionArtifact(input: {
  childRunIds: string[];
  childStatuses?: Array<{ childRunId: string; status: string }>;
  synthesisAllowed: boolean;
  transitionKind: string;
  transitionSource?: string;
  reason?: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
    childRunIds: input.childRunIds,
    ...(input.childStatuses ? { childStatuses: input.childStatuses } : {}),
    synthesisAllowed: input.synthesisAllowed,
    transitionEvidence: {
      schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
      kind: input.transitionKind,
      source: input.transitionSource ?? "wait_agent",
      childRunIds: input.childRunIds,
      ...(input.childRunIds.length === 1 ? { childRunId: input.childRunIds[0] } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    },
    ...(input.extra ?? {}),
  };
}

describe("ProjectStore sub-agent diagnostics and observability", () => {
  it("builds bounded read-only sub-agent repair diagnostics from persisted state", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Completed without artifact",
        roleId: "reviewer",
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "completed", {
        now: "2026-06-05T00:00:10.000Z",
      });
      const eventCountBefore = store.listSubagentRunEvents(run.id).length;

      const report = store.getSubagentRepairDiagnostics({
        now: "2026-06-05T00:00:30.000Z",
        maxIssues: 1,
        maxMessageChars: 80,
      });

      expect(report).toMatchObject({
        schemaVersion: "ambient-subagent-repair-diagnostics-v1",
        createdAt: "2026-06-05T00:00:30.000Z",
        issueCount: 1,
        shownIssueCount: 1,
        truncatedIssues: false,
        warningCount: 1,
        actionCounts: {
          inspect_result_artifact: 1,
        },
        affectedRunIds: [run.id],
        affectedThreadIds: [run.childThreadId],
      });
      expect(report.issues).toEqual([
        expect.objectContaining({
          kind: "missing_result_artifact",
          action: "inspect_result_artifact",
          destructive: false,
          runId: run.id,
          threadId: run.childThreadId,
        }),
      ]);
      expect(store.getSubagentRun(run.id).status).toBe("completed");
      expect(store.listSubagentRunEvents(run.id)).toHaveLength(eventCountBefore);
    } finally {
      store.close();
    }
  });

  it("reports malformed persisted model and lease snapshots without crashing diagnostics", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Corrupted snapshot child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
      });
      const db = (store as unknown as { requireDb(): { prepare(sql: string): { run(...values: unknown[]): unknown } } }).requireDb();
      db.prepare("UPDATE subagent_runs SET model_runtime_snapshot_json = ?, capacity_lease_snapshot_json = ? WHERE id = ?").run(
        "null",
        "null",
        run.id,
      );

      const report = store.getSubagentRepairDiagnostics({
        now: "2026-06-05T00:00:30.000Z",
      });

      expect(report.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "missing_model_runtime_snapshot",
            action: "inspect_run_snapshot",
            runId: run.id,
          }),
          expect.objectContaining({
            kind: "missing_capacity_lease",
            action: "inspect_run_snapshot",
            runId: run.id,
          }),
        ]),
      );
      expect(report.diagnosticRunIds).toContain(run.id);
    } finally {
      store.close();
    }
  });

  it("rolls persisted sub-agent lifecycle records into observability summaries", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Explorer child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "reserved", {
        now: "2026-06-05T00:00:30.000Z",
      });
      const attentionRun = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Explorer needs attention",
        roleId: "explorer",
        canonicalTaskPath: "root/1:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(attentionRun.id, "needs_attention", {
        now: "2026-06-05T00:00:45.000Z",
      });
      store.appendSubagentRunEvent(attentionRun.id, {
        type: "subagent.needs_attention",
        preview: { summary: "Needs a parent decision." },
        createdAt: "2026-06-05T00:00:45.000Z",
      });
      store.recordSubagentToolScopeSnapshot(run.id, {
        scope: {
          schemaVersion: "ambient-subagent-tool-scope-v1",
          loadedCategories: ["workspace.read"],
          piVisibleCategories: ["workspace.read"],
          deniedCategories: [
            { id: "workspace.write", reason: "Mutating child requires an isolated worktree." },
            { id: "subagent.spawn", reason: "Nested fanout disabled." },
          ],
          loadedTools: [
            {
              source: "built_in",
              id: "workspace.read",
              categoryId: "workspace.read",
              piVisible: true,
              mutatesState: false,
              requiresApproval: false,
            },
          ],
          piVisibleTools: [
            {
              source: "built_in",
              id: "workspace.read",
              categoryId: "workspace.read",
              piVisible: true,
              mutatesState: false,
              requiresApproval: false,
            },
          ],
          deniedTools: [
            {
              source: "built_in",
              id: "workspace.write",
              categoryId: "workspace.write",
              reason: "Mutating child requires an isolated worktree.",
            },
            {
              source: "fanout",
              id: "subagent.spawn",
              categoryId: "subagent.spawn",
              reason: "Nested fanout disabled.",
            },
          ],
          approvalMode: "interactive",
          worktreeIsolated: false,
          fanoutAvailable: false,
        },
        createdAt: "2026-06-05T00:00:05.000Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.spawn_failed",
        preview: { reason: "provider capacity unavailable" },
        createdAt: "2026-06-05T00:00:06.000Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.runtime_event",
        preview: {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "usage",
          source: "child_runtime",
          runId: run.id,
          parentThreadId: run.parentThreadId,
          parentRunId: run.parentRunId,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          createdAt: "2026-06-05T00:00:07.000Z",
          tokenCount: 144,
          costMicros: 42,
          localMemoryBytes: 1024,
        },
        createdAt: "2026-06-05T00:00:07.000Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.restart_reconciled",
        preview: { reason: "desktop_restart" },
        createdAt: "2026-06-05T00:00:08.000Z",
      });
      const satisfied = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:10.000Z",
      });
      store.updateSubagentWaitBarrierStatus(satisfied.id, "satisfied", {
        now: "2026-06-05T00:00:14.000Z",
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [run.id],
          synthesisAllowed: true,
          transitionKind: "child_terminal",
          reason: "completed",
        }),
      });
      const cancelled = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:20.000Z",
      });
      store.updateSubagentWaitBarrierStatus(cancelled.id, "cancelled", {
        now: "2026-06-05T00:00:23.000Z",
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [run.id],
          childStatuses: [{ childRunId: run.id, status: "cancelled" }],
          synthesisAllowed: false,
          transitionKind: "child_cancelled",
          transitionSource: "barrier_controller",
          reason: "cancelled",
        }),
      });
      store.upsertSubagentGroupedCompletionNotification({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        child: {
          runId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          roleId: run.roleId,
          status: "completed",
          summary: "Done",
        },
        createdAt: "2026-06-05T00:00:25.000Z",
      });
      const batch = upsertBatchJobPlan(store, batchPlan(parent.id));
      store.applySubagentBatchResultReport(
        createSubagentBatchResultReport({
          plan: batch.plan,
          item: batch.plan.items[0],
          childRunId: "child-run-lint",
          status: "completed",
          summary: "Lint batch item completed.",
          createdAt: "2026-06-05T00:00:35.000Z",
          resultArtifact: batchArtifact("child-run-lint", "completed"),
        }),
      );

      expect(
        store.getSubagentObservabilitySummary({
          parentRunId: "parent-run",
          createdAt: "2026-06-05T00:01:00.000Z",
        }),
      ).toMatchObject({
        schemaVersion: "ambient-subagent-observability-summary-v1",
        createdAt: "2026-06-05T00:01:00.000Z",
        spawnAttempts: 2,
        failedSpawns: 1,
        waitDurations: {
          count: 2,
          totalMs: 7000,
          maxMs: 4000,
        },
        cancellationCascades: 1,
        toolDenials: {
          count: 2,
          byCategory: {
            "workspace.write": 1,
            "subagent.spawn": 1,
          },
        },
        usage: {
          tokenCount: 144,
          costMicros: 42,
        },
        localMemory: {
          eventCount: 1,
          peakBytes: 1024,
        },
        childIdle: {
          openRunCount: 2,
          totalMs: 45000,
          maxMs: 30000,
        },
        groupedCompletions: 1,
        batchProgress: {
          notificationCount: 1,
          jobCount: 1,
          itemCount: 2,
          acceptedReportCount: 1,
          pendingItemCount: 1,
          completedJobCount: 0,
        },
        needsAttentionRequests: 1,
        restartReconciliations: 1,
        statusCounts: {
          reserved: 1,
          needs_attention: 1,
        },
      });
    } finally {
      store.close();
    }
  });

  it("persists parent mailbox parent-message anchors for pre-run spawn failures", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const message = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const event = store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: message.id,
        type: "subagent.spawn_failed",
        payload: {
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "model_scope",
          reason: "Model denied before child creation.",
        },
        idempotencyKey: "spawn:pre-run-denied",
        createdAt: "2026-06-05T00:00:00.000Z",
      });
      const replay = store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: message.id,
        type: "subagent.spawn_failed",
        payload: { replay: true },
        idempotencyKey: "spawn:pre-run-denied",
        createdAt: "2026-06-05T00:00:01.000Z",
      });

      expect(replay.id).toBe(event.id);
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([
        expect.objectContaining({
          id: event.id,
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          parentMessageId: message.id,
          type: "subagent.spawn_failed",
          deliveryState: "queued",
        }),
      ]);
      expect(store.listSubagentParentMailboxEventsForParentThread(parent.id).map((item) => item.id)).toEqual([event.id]);

      store.close();
      reopened.openWorkspace(workspacePath);
      expect(reopened.listSubagentParentMailboxEventsForParentThread(parent.id)).toEqual([
        expect.objectContaining({
          id: event.id,
          parentMessageId: message.id,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-spawn-failure-v1",
            reason: "Model denied before child creation.",
          }),
        }),
      ]);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("rejects persisted child runtime and parent mailbox events without exact child attribution", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const enabledFlags = resolveAmbientFeatureFlags({
        startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: assistant.id,
        title: "Attributed child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });

      expect(() =>
        store.appendSubagentRunEvent(run.id, {
          type: "subagent.runtime_event",
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "tool_call",
            source: "child_runtime",
            runId: "other-child",
            parentThreadId: run.parentThreadId,
            parentRunId: run.parentRunId,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            createdAt: "2026-06-05T00:00:01.000Z",
          },
          createdAt: "2026-06-05T00:00:01.000Z",
        }),
      ).toThrow(`Sub-agent runtime event runId other-child does not match persisted child run ${run.id}`);

      const runtimeEvent = store.appendSubagentRunEvent(run.id, {
        type: "subagent.runtime_event",
        preview: {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "error",
          source: "child_runtime",
          runId: run.id,
          parentThreadId: run.parentThreadId,
          parentRunId: run.parentRunId,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          createdAt: "2026-06-05T00:00:02.000Z",
          message: "Child runtime failed before completion.",
        },
        createdAt: "2026-06-05T00:00:02.000Z",
      });
      expect(runtimeEvent.preview).toMatchObject({
        runId: run.id,
        parentThreadId: run.parentThreadId,
        parentRunId: run.parentRunId,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
      });

      expect(() =>
        store.appendSubagentParentMailboxEvent({
          parentThreadId: parent.id,
          parentRunId: run.parentRunId,
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: {
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            parentRunId: run.parentRunId,
            status: "failed",
          },
          createdAt: "2026-06-05T00:00:03.000Z",
        }),
      ).toThrow("Sub-agent parent mailbox event subagent.lifecycle_interrupted must identify at least one originating child run");

      const parentMailboxEvent = store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: run.parentRunId,
        parentMessageId: assistant.id,
        type: "subagent.lifecycle_interrupted",
        payload: {
          schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
          parentRunId: run.parentRunId,
          childRunId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          status: "failed",
          reason: "Child runtime failed before completion.",
        },
        createdAt: "2026-06-05T00:00:04.000Z",
      });
      expect(parentMailboxEvent.payload).toMatchObject({
        childRunId: run.id,
        childThreadId: run.childThreadId,
      });
    } finally {
      store.close();
    }
  });
});
