import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION } from "../subagents/subagentWaitBarrierResolution";
import {
  ProjectStoreSubagentWaitBarrierRepository,
  type SubagentWaitBarrierChildRun,
} from "./subagentWaitBarrierRepository";

describe("ProjectStoreSubagentWaitBarrierRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreSubagentWaitBarrierRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE subagent_runs (
        id TEXT PRIMARY KEY,
        parent_thread_id TEXT NOT NULL,
        parent_run_id TEXT NOT NULL
      );
      CREATE TABLE subagent_wait_barriers (
        id TEXT PRIMARY KEY,
        parent_thread_id TEXT NOT NULL,
        parent_run_id TEXT NOT NULL,
        child_run_ids_json TEXT NOT NULL,
        dependency_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        failure_policy TEXT NOT NULL,
        quorum_threshold INTEGER,
        timeout_ms INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution_artifact_json TEXT
      );
    `);
    repository = new ProjectStoreSubagentWaitBarrierRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates wait barriers with unique child ids, quorum metadata, and ordered reads", () => {
    insertChildRun(db, "child-a");
    insertChildRun(db, "child-b");
    insertChildRun(db, "child-c");
    const first = repository.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-a", "child-a", "child-b"],
      dependencyMode: "quorum",
      failurePolicy: "ask_user",
      quorumThreshold: 2,
      timeoutMs: 60_000,
      createdAt: "2026-06-16T01:00:00.000Z",
    });
    const second = repository.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-c"],
      dependencyMode: "required_all",
      failurePolicy: "fail_parent",
      createdAt: "2026-06-16T01:01:00.000Z",
    });

    expect(first).toEqual({
      id: expect.any(String),
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-a", "child-b"],
      dependencyMode: "quorum",
      status: "waiting_on_children",
      failurePolicy: "ask_user",
      quorumThreshold: 2,
      timeoutMs: 60_000,
      createdAt: "2026-06-16T01:00:00.000Z",
      updatedAt: "2026-06-16T01:00:00.000Z",
      resolvedAt: undefined,
      resolutionArtifact: undefined,
    });
    expect(repository.getSubagentWaitBarrier(first.id)).toEqual(first);
    expect(repository.listSubagentWaitBarriersForParentRun("parent-run")).toEqual([first, second]);
    expect(repository.listSubagentWaitBarriers().map((barrier) => barrier.id)).toEqual([first.id, second.id]);
  });

  it("validates child ownership and quorum inputs before inserting", () => {
    insertChildRun(db, "child-a", { parentThreadId: "other-thread" });
    expect(() => repository.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: [],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
    })).toThrow("requires at least one child run");
    expect(() => repository.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["missing-child"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
    })).toThrow("Sub-agent run not found: missing-child");
    expect(() => repository.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-a"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
    })).toThrow("does not belong to parent thread parent-thread");
    expect(() => repository.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["missing-child"],
      dependencyMode: "quorum",
      failurePolicy: "ask_user",
    })).toThrow("require an explicit integer quorumThreshold");
  });

  it("updates terminal status with durable transition evidence", () => {
    insertChildRun(db, "child-a");
    const barrier = repository.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-a"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
      createdAt: "2026-06-16T01:02:00.000Z",
    });
    const artifact = resolutionArtifact("child_terminal");

    const updated = repository.updateSubagentWaitBarrierStatus(barrier.id, "satisfied", {
      resolutionArtifact: artifact,
      now: "2026-06-16T01:03:00.000Z",
    });

    expect(updated).toMatchObject({
      id: barrier.id,
      status: "satisfied",
      updatedAt: "2026-06-16T01:03:00.000Z",
      resolvedAt: "2026-06-16T01:03:00.000Z",
      resolutionArtifact: artifact,
    });
  });

  it("rejects terminal updates without valid transition evidence", () => {
    insertChildRun(db, "child-a");
    const barrier = repository.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-a"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
      createdAt: "2026-06-16T01:04:00.000Z",
    });

    expect(() => repository.updateSubagentWaitBarrierStatus(barrier.id, "satisfied", {
      now: "2026-06-16T01:05:00.000Z",
    })).toThrow("requires a resolution artifact");
    expect(() => repository.updateSubagentWaitBarrierStatus(barrier.id, "satisfied", {
      resolutionArtifact: resolutionArtifact("progress_return"),
      now: "2026-06-16T01:05:00.000Z",
    })).toThrow("cannot use progress_return as terminal evidence");
  });

  it("finds unresolved required blockers for matching child runs", () => {
    insertChildRun(db, "child-a");
    const ignoredOptional = repository.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-a"],
      dependencyMode: "optional_background",
      failurePolicy: "degrade_partial",
      createdAt: "2026-06-16T01:06:00.000Z",
    });
    const blocker = repository.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-a"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
      createdAt: "2026-06-16T01:07:00.000Z",
    });

    const result = repository.findUnresolvedRequiredSubagentRunBlocker({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      matchingRuns: [childRun("child-a")],
    });

    expect(ignoredOptional.dependencyMode).toBe("optional_background");
    expect(result).toEqual({
      run: childRun("child-a"),
      barrier: blocker,
    });
  });
});

function insertChildRun(
  db: Database.Database,
  id: string,
  overrides: Partial<Omit<SubagentWaitBarrierChildRun, "id">> = {},
): void {
  const run = childRun(id, overrides);
  db.prepare("INSERT INTO subagent_runs (id, parent_thread_id, parent_run_id) VALUES (?, ?, ?)")
    .run(run.id, run.parentThreadId, run.parentRunId);
}

function childRun(
  id: string,
  overrides: Partial<SubagentWaitBarrierChildRun> = {},
): SubagentWaitBarrierChildRun {
  return {
    id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    ...overrides,
  };
}

function resolutionArtifact(kind: string): Record<string, unknown> {
  return {
    transitionEvidence: {
      schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
      kind,
      source: "repository-test",
      childRunIds: ["child-a"],
      idempotencyKey: `test:${kind}`,
    },
  };
}
