import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkflowGraphSnapshot } from "../../shared/workflowTypes";
import { ProjectStoreWorkflowVersionRepository } from "./workflowVersionRepository";

describe("ProjectStoreWorkflowVersionRepository", () => {
  let db: Database.Database;
  let artifactLookups: string[];
  let graphSnapshotLookups: string[];
  let repository: ProjectStoreWorkflowVersionRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workflow_agent_threads (
        id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE workflow_versions (
        id TEXT PRIMARY KEY,
        workflow_thread_id TEXT NOT NULL,
        artifact_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        graph_snapshot_id TEXT,
        source_path TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        git_commit_hash TEXT,
        version_status TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(workflow_thread_id, version_number)
      );
    `);
    db.prepare("INSERT INTO workflow_agent_threads (id, updated_at) VALUES (?, ?)").run("workflow-thread-1", "2026-06-16T00:00:00.000Z");
    artifactLookups = [];
    graphSnapshotLookups = [];
    repository = new ProjectStoreWorkflowVersionRepository(db, {
      getWorkflowArtifact: (artifactId) => {
        artifactLookups.push(artifactId);
        return { id: artifactId };
      },
      tryGetWorkflowGraphSnapshot: (snapshotId) => {
        graphSnapshotLookups.push(snapshotId);
        return snapshotId === "graph-1" ? ({ id: snapshotId, workflowThreadId: "workflow-thread-1" } as WorkflowGraphSnapshot) : undefined;
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("creates versions with incrementing numbers and touches the workflow thread", () => {
    const first = repository.createWorkflowVersion({
      workflowThreadId: "workflow-thread-1",
      artifactId: "artifact-1",
      graphSnapshotId: "graph-1",
      sourcePath: "WORKFLOW.md",
      repoPath: "/tmp/repo",
      gitCommitHash: "abc123",
      status: "ready_for_review",
      createdBy: "compiler",
    });
    const second = repository.createWorkflowVersion({
      workflowThreadId: "workflow-thread-1",
      artifactId: "artifact-2",
      sourcePath: "WORKFLOW.md",
      repoPath: "/tmp/repo",
      status: "approved",
      createdBy: "workflow_revision",
    });

    expect(first).toMatchObject({
      workflowThreadId: "workflow-thread-1",
      artifactId: "artifact-1",
      version: 1,
      graphSnapshotId: "graph-1",
      sourcePath: "WORKFLOW.md",
      repoPath: "/tmp/repo",
      gitCommitHash: "abc123",
      status: "ready_for_review",
      createdBy: "compiler",
    });
    expect(second).toMatchObject({
      artifactId: "artifact-2",
      version: 2,
      status: "approved",
      createdBy: "workflow_revision",
    });
    expect(artifactLookups).toContain("artifact-1");
    expect(graphSnapshotLookups).toContain("graph-1");
    expect(threadUpdatedAt()).not.toBe("2026-06-16T00:00:00.000Z");
  });

  it("lists versions and latest approved versions in stable descending order", () => {
    const first = insertVersion({ id: "version-1", version: 1, status: "approved", createdAt: "2026-06-16T01:00:00.000Z" });
    const second = insertVersion({ id: "version-2", version: 2, status: "ready_for_review", createdAt: "2026-06-16T02:00:00.000Z" });
    const third = insertVersion({ id: "version-3", version: 3, status: "approved", createdAt: "2026-06-16T03:00:00.000Z" });

    expect(repository.listWorkflowVersions("workflow-thread-1").map((version) => version.id)).toEqual([third.id, second.id, first.id]);
    expect(repository.latestWorkflowVersionForThread("workflow-thread-1")?.id).toBe(third.id);
    expect(repository.getLatestApprovedWorkflowVersion("workflow-thread-1")?.id).toBe(third.id);
  });

  it("updates the latest version status for an artifact", () => {
    const first = insertVersion({ id: "version-1", artifactId: "artifact-1", version: 1, status: "ready_for_review" });
    const second = insertVersion({ id: "version-2", artifactId: "artifact-1", version: 2, status: "ready_for_review" });

    const updated = repository.updateWorkflowVersionStatusForArtifact("artifact-1", "approved");

    expect(updated).toMatchObject({ id: second.id, status: "approved" });
    expect(repository.getWorkflowVersion(first.id).status).toBe("ready_for_review");
    expect(artifactLookups).toContain("artifact-1");
  });

  it("returns undefined for absent optional lookups after preserving validation", () => {
    expect(repository.updateWorkflowVersionStatusForArtifact("artifact-without-version", "approved")).toBeUndefined();
    expect(repository.latestWorkflowVersionForThread("workflow-thread-1")).toBeUndefined();
    expect(repository.workflowVersionForGraphSnapshot(undefined)).toBeUndefined();
    expect(repository.workflowVersionForGraphSnapshot("missing-graph")).toBeUndefined();
    expect(artifactLookups).toContain("artifact-without-version");
  });

  it("preserves missing row and validation errors", () => {
    expect(() => repository.getWorkflowVersion("missing")).toThrow("Workflow version not found: missing");
    expect(() => repository.listWorkflowVersions("missing-thread")).toThrow("Workflow Agent thread not found: missing-thread");
    expect(() =>
      repository.createWorkflowVersion({
        workflowThreadId: "missing-thread",
        artifactId: "artifact-1",
        sourcePath: "WORKFLOW.md",
        repoPath: "/tmp/repo",
        status: "ready_for_review",
        createdBy: "compiler",
      }),
    ).toThrow("Workflow Agent thread not found: missing-thread");
    expect(() =>
      repository.createWorkflowVersion({
        workflowThreadId: "workflow-thread-1",
        artifactId: "artifact-1",
        graphSnapshotId: "missing-graph",
        sourcePath: "WORKFLOW.md",
        repoPath: "/tmp/repo",
        status: "ready_for_review",
        createdBy: "compiler",
      }),
    ).toThrow("Workflow graph snapshot not found: missing-graph");
  });

  function insertVersion(input: {
    id: string;
    artifactId?: string;
    graphSnapshotId?: string;
    version: number;
    status: "ready_for_review" | "approved" | "rejected" | "archived";
    createdAt?: string;
  }) {
    db.prepare(
      `INSERT INTO workflow_versions
       (id, workflow_thread_id, artifact_id, version_number, graph_snapshot_id, source_path, repo_path, git_commit_hash, version_status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      "workflow-thread-1",
      input.artifactId ?? `artifact-${input.version}`,
      input.version,
      input.graphSnapshotId ?? null,
      "WORKFLOW.md",
      "/tmp/repo",
      null,
      input.status,
      "compiler",
      input.createdAt ?? `2026-06-16T0${input.version}:00:00.000Z`,
    );
    return repository.getWorkflowVersion(input.id);
  }

  function threadUpdatedAt(): string {
    return (
      db.prepare("SELECT updated_at FROM workflow_agent_threads WHERE id = ?").get("workflow-thread-1") as {
        updated_at: string;
      }
    ).updated_at;
  }
});
