import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags, type AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import {
  fallbackSubagentCapacityLease,
  materializeSubagentCapacityLeaseForRun,
  releaseSubagentCapacityLease,
} from "../../shared/subagentCapacity";
import { AMBIENT_SUBAGENT_PROTOCOL_VERSION } from "../../shared/subagentProtocol";
import { getDefaultSubagentRoleProfile, type SubagentRoleId } from "../../shared/subagentRoles";
import { ProjectStoreSubagentRunRepository, type CreateReservedSubagentRunInput } from "./subagentRunRepository";

describe("ProjectStoreSubagentRunRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreSubagentRunRepository;

  const now = "2026-06-16T00:00:00.000Z";
  const featureFlagSnapshot: AmbientFeatureFlagSnapshot = resolveAmbientFeatureFlags({
    generatedAt: now,
    settings: { subagents: true },
  });

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE subagent_runs (
        id TEXT PRIMARY KEY,
        protocol_version TEXT NOT NULL,
        parent_thread_id TEXT NOT NULL,
        parent_run_id TEXT NOT NULL,
        parent_message_id TEXT,
        child_thread_id TEXT NOT NULL,
        canonical_task_path TEXT NOT NULL,
        role_id TEXT NOT NULL,
        role_profile_snapshot_json TEXT,
        effective_role_snapshot_json TEXT,
        dependency_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        feature_flag_snapshot_json TEXT NOT NULL,
        model_runtime_snapshot_json TEXT NOT NULL,
        capacity_lease_snapshot_json TEXT,
        symphony_launch_contract_json TEXT,
        symphony_mutation_lease_json TEXT,
        result_artifact_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        closed_at TEXT
      );
      CREATE TABLE subagent_spawn_edges (
        parent_run_id TEXT NOT NULL,
        child_run_id TEXT NOT NULL,
        parent_thread_id TEXT NOT NULL,
        child_thread_id TEXT NOT NULL,
        canonical_task_path TEXT NOT NULL,
        depth INTEGER NOT NULL,
        status TEXT NOT NULL,
        capacity_released_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE subagent_run_events (
        run_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        preview_json TEXT,
        artifact_path TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY(run_id, sequence)
      );
    `);
    repository = new ProjectStoreSubagentRunRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function createReservedRun(overrides: Partial<CreateReservedSubagentRunInput> = {}) {
    const runId = overrides.runId ?? "child-run";
    const parentThreadId = overrides.parentThreadId ?? "parent-thread";
    const parentRunId = overrides.parentRunId ?? "parent-run";
    const childThreadId = overrides.childThreadId ?? "child-thread";
    const canonicalTaskPath = overrides.canonicalTaskPath ?? "root/0:explorer";
    const roleId = (overrides.roleId ?? "explorer") as SubagentRoleId;
    const createdAt = overrides.createdAt ?? now;
    const modelRuntimeSnapshot = overrides.modelRuntimeSnapshot ?? createAmbientModelRuntimeSnapshot("moonshotai/kimi-k2.7-code", createdAt);
    const roleProfileSnapshot = overrides.roleProfileSnapshot ?? getDefaultSubagentRoleProfile(roleId);
    const capacityLeaseSnapshot = overrides.capacityLeaseSnapshot ?? materializeSubagentCapacityLeaseForRun(
      fallbackSubagentCapacityLease({
        parentThreadId,
        parentRunId,
        canonicalTaskPath,
        roleId,
        model: modelRuntimeSnapshot.profile,
        now: createdAt,
      }),
      {
        childRunId: runId,
        childThreadId,
        canonicalTaskPath,
        parentThreadId,
        parentRunId,
        roleId,
      },
    );

    return repository.createReservedSubagentRun({
      runId,
      parentThreadId,
      parentRunId,
      parentMessageId: overrides.parentMessageId ?? "parent-message",
      childThreadId,
      canonicalTaskPath,
      roleId,
      roleProfileSnapshot,
      effectiveRoleSnapshot: overrides.effectiveRoleSnapshot,
      dependencyMode: overrides.dependencyMode ?? "required",
      featureFlagSnapshot: overrides.featureFlagSnapshot ?? featureFlagSnapshot,
      modelRuntimeSnapshot,
      capacityLeaseSnapshot,
      createdAt,
    });
  }

  it("creates a reserved subagent run and spawn-edge linkage", () => {
    const modelRuntimeSnapshot = createAmbientModelRuntimeSnapshot("moonshotai/kimi-k2.7-code", now);
    const roleProfileSnapshot = getDefaultSubagentRoleProfile("explorer");
    const capacityLeaseSnapshot = materializeSubagentCapacityLeaseForRun(
      fallbackSubagentCapacityLease({
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        canonicalTaskPath: "root/0:explorer",
        roleId: "explorer",
        model: modelRuntimeSnapshot.profile,
        now,
      }),
      {
        childRunId: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        roleId: "explorer",
      },
    );

    const run = repository.createReservedSubagentRun({
      runId: "child-run",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:explorer",
      roleId: "explorer",
      roleProfileSnapshot,
      dependencyMode: "required",
      featureFlagSnapshot,
      modelRuntimeSnapshot,
      capacityLeaseSnapshot,
      createdAt: now,
    });

    expect(run).toMatchObject({
      id: "child-run",
      protocolVersion: AMBIENT_SUBAGENT_PROTOCOL_VERSION,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:explorer",
      roleId: "explorer",
      dependencyMode: "required",
      status: "reserved",
      createdAt: now,
      updatedAt: now,
      roleProfileSnapshotSource: "resolved",
      capacityLeaseSnapshot: expect.objectContaining({
        childRunId: "child-run",
        childThreadId: "child-thread",
        status: "reserved",
      }),
    });
    expect(repository.getSubagentRun("child-run").id).toBe("child-run");
    expect(repository.listSubagentRunsForParentThread("parent-thread").map((item) => item.id)).toEqual(["child-run"]);
    expect(repository.listAllSubagentRuns().map((item) => item.id)).toEqual(["child-run"]);
    expect(repository.listSubagentSpawnEdges()).toEqual([
      {
        parentRunId: "parent-run",
        childRunId: "child-run",
        parentThreadId: "parent-thread",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        depth: 1,
        status: "reserved",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  it("updates subagent run status fields and spawn-edge status", () => {
    const run = createReservedRun();
    const startedAt = "2026-06-16T00:01:00.000Z";
    const running = repository.updateSubagentRunStatus({
      runId: run.id,
      status: "running",
      startedAt,
      completedAt: null,
      updatedAt: startedAt,
    });

    expect(running).toMatchObject({
      id: run.id,
      status: "running",
      startedAt,
      completedAt: undefined,
      resultArtifact: undefined,
      updatedAt: startedAt,
    });
    expect(repository.listSubagentSpawnEdges()[0]).toMatchObject({
      childRunId: run.id,
      status: "running",
      updatedAt: startedAt,
    });

    const completedAt = "2026-06-16T00:02:00.000Z";
    const completed = repository.updateSubagentRunStatus({
      runId: run.id,
      status: "completed",
      startedAt,
      completedAt,
      resultArtifact: { artifactPath: "artifacts/result.json" },
      updatedAt: completedAt,
    });

    expect(completed).toMatchObject({
      id: run.id,
      status: "completed",
      startedAt,
      completedAt,
      updatedAt: completedAt,
      resultArtifact: { artifactPath: "artifacts/result.json" },
    });
    expect(repository.listSubagentSpawnEdges()[0]).toMatchObject({
      childRunId: run.id,
      status: "completed",
      updatedAt: completedAt,
    });
  });

  it("closes subagent runs and marks capacity released on the spawn edge", () => {
    const run = createReservedRun();
    const closedAt = "2026-06-16T00:03:00.000Z";
    const releasedCapacityLease = releaseSubagentCapacityLease(run.capacityLeaseSnapshot, {
      releasedAt: closedAt,
      reason: "Repository close test released capacity.",
    });

    const closed = repository.closeSubagentRun({
      runId: run.id,
      closedAt,
      capacityLeaseSnapshot: releasedCapacityLease,
    });

    expect(closed).toMatchObject({
      id: run.id,
      closedAt,
      updatedAt: closedAt,
      capacityLeaseSnapshot: expect.objectContaining({
        status: "released",
        releasedAt: closedAt,
        releaseReason: "Repository close test released capacity.",
      }),
    });
    expect(repository.listSubagentSpawnEdges()[0]).toMatchObject({
      childRunId: run.id,
      capacityReleasedAt: closedAt,
      updatedAt: closedAt,
    });
  });

  it("lists canonical-task runs and parent message ids for subagent repair checks", () => {
    const first = createReservedRun({
      runId: "child-run-a",
      childThreadId: "child-thread-a",
      parentMessageId: "parent-message-a",
      createdAt: "2026-06-16T00:00:00.000Z",
    });
    const second = createReservedRun({
      runId: "child-run-b",
      childThreadId: "child-thread-b",
      parentMessageId: "parent-message-b",
      createdAt: "2026-06-16T00:01:00.000Z",
    });
    createReservedRun({
      runId: "other-run",
      childThreadId: "other-thread",
      parentMessageId: "other-message",
      canonicalTaskPath: "root/1:explorer",
      roleId: "explorer",
    });

    expect(repository.listSubagentRunsForCanonicalTask({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:explorer",
    }).map((run) => run.id)).toEqual([first.id, second.id]);
    expect(repository.parentMessageIdForSubagentRun(first.id)).toBe("parent-message-a");
    expect(repository.parentMessageIdForSubagentRun("missing-run")).toBeUndefined();
  });

  it("repairs spawn-edge rows through insert, replace, and delete helpers", () => {
    const run = createReservedRun();
    const originalEdge = repository.listSubagentSpawnEdges()[0]!;

    repository.deleteSubagentSpawnEdgesForChild(run.id);
    expect(repository.listSubagentSpawnEdges()).toEqual([]);

    repository.insertSubagentSpawnEdge({
      ...originalEdge,
      status: "completed",
      capacityReleasedAt: "2026-06-16T00:04:00.000Z",
      updatedAt: "2026-06-16T00:04:00.000Z",
    });
    expect(repository.listSubagentSpawnEdges()).toEqual([
      expect.objectContaining({
        childRunId: run.id,
        status: "completed",
        capacityReleasedAt: "2026-06-16T00:04:00.000Z",
        updatedAt: "2026-06-16T00:04:00.000Z",
      }),
    ]);

    repository.replaceSubagentSpawnEdge({
      ...originalEdge,
      status: "failed",
      canonicalTaskPath: "root/0:explorer-repaired",
      updatedAt: "2026-06-16T00:05:00.000Z",
    });
    expect(repository.listSubagentSpawnEdges()).toEqual([
      expect.objectContaining({
        childRunId: run.id,
        status: "failed",
        canonicalTaskPath: "root/0:explorer-repaired",
        capacityReleasedAt: undefined,
        updatedAt: "2026-06-16T00:05:00.000Z",
      }),
    ]);
  });

  it("appends and lists subagent run events with stable sequence ownership", () => {
    const run = createReservedRun();
    const first = repository.appendSubagentRunEvent(run.id, {
      type: "subagent.status_changed",
      preview: { status: "running" },
      createdAt: "2026-06-16T00:06:00.000Z",
    });
    const second = repository.appendSubagentRunEvent(run.id, {
      type: "subagent.result_artifact_written",
      preview: { artifactPath: "artifacts/subagent-result.json" },
      artifactPath: "artifacts/subagent-result.json",
      createdAt: "2026-06-16T00:07:00.000Z",
    });

    expect(first).toEqual({
      runId: run.id,
      sequence: 1,
      type: "subagent.status_changed",
      preview: { status: "running" },
      createdAt: "2026-06-16T00:06:00.000Z",
    });
    expect(second).toEqual({
      runId: run.id,
      sequence: 2,
      type: "subagent.result_artifact_written",
      preview: { artifactPath: "artifacts/subagent-result.json" },
      artifactPath: "artifacts/subagent-result.json",
      createdAt: "2026-06-16T00:07:00.000Z",
    });
    expect(repository.listSubagentRunEvents(run.id)).toEqual([first, second]);
  });

  it("rejects invalid subagent run-event attribution before persistence", () => {
    const run = createReservedRun();

    expect(() => repository.appendSubagentRunEvent(run.id, {
      type: "subagent.runtime_event",
      createdAt: "2026-06-16T00:08:00.000Z",
    })).toThrow("Sub-agent runtime event must include an attributed runtime preview.");
    expect(repository.listSubagentRunEvents(run.id)).toEqual([]);
  });
});
