import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  WorkflowArtifactSummary,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import { ProjectStoreWorkflowRevisionRepository } from "./workflowRevisionRepository";

describe("ProjectStoreWorkflowRevisionRepository", () => {
  let db: Database.Database;
  let graphValidationCalls: Array<{ snapshotId: string | undefined; workflowThreadId: string }>;
  let versions: Map<string, WorkflowVersionSummary>;
  let versionsByGraph: Map<string, WorkflowVersionSummary>;
  let artifacts: Map<string, WorkflowArtifactSummary>;
  let repository: ProjectStoreWorkflowRevisionRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workflow_agent_threads (
        id TEXT PRIMARY KEY,
        active_artifact_id TEXT,
        active_graph_snapshot_id TEXT,
        phase TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE workflow_revisions (
        id TEXT PRIMARY KEY,
        workflow_thread_id TEXT NOT NULL,
        base_version_id TEXT,
        base_artifact_id TEXT,
        requested_change TEXT NOT NULL,
        proposed_graph_snapshot_id TEXT,
        graph_diff_json TEXT,
        source_diff TEXT,
        revision_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO workflow_agent_threads (id, active_artifact_id, active_graph_snapshot_id, phase, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("workflow-thread-1", "artifact-current", "graph-current", "planned", "2026-06-17T00:00:00.000Z");
    graphValidationCalls = [];
    versions = new Map([
      ["version-base", workflowVersion({ id: "version-base", artifactId: "artifact-base", graphSnapshotId: "graph-base" })],
      ["version-proposed", workflowVersion({ id: "version-proposed", artifactId: "artifact-proposed", graphSnapshotId: "graph-proposed" })],
      ["version-other-thread", workflowVersion({ id: "version-other-thread", workflowThreadId: "other-thread", artifactId: "artifact-other" })],
    ]);
    versionsByGraph = new Map([
      ["graph-proposed", versions.get("version-proposed") as WorkflowVersionSummary],
      ["graph-base", versions.get("version-base") as WorkflowVersionSummary],
    ]);
    artifacts = new Map([
      ["artifact-base", workflowArtifact({ id: "artifact-base", status: "approved" })],
      ["artifact-proposed", workflowArtifact({ id: "artifact-proposed", status: "ready_for_preview" })],
      ["artifact-other", workflowArtifact({ id: "artifact-other", workflowThreadId: "other-thread" })],
    ]);
    repository = new ProjectStoreWorkflowRevisionRepository(db, {
      getWorkflowVersion: (versionId) => required(versions.get(versionId), `version ${versionId}`),
      getWorkflowArtifact: (artifactId) => required(artifacts.get(artifactId), `artifact ${artifactId}`),
      requireWorkflowGraphSnapshotForThread: (snapshotId, workflowThreadId) => {
        graphValidationCalls.push({ snapshotId, workflowThreadId });
        return undefined;
      },
      workflowVersionForGraphSnapshot: (graphSnapshotId) => (graphSnapshotId ? versionsByGraph.get(graphSnapshotId) : undefined),
    });
  });

  afterEach(() => {
    db.close();
  });

  it("creates revisions with validated links and updates the thread phase", () => {
    const revision = repository.createWorkflowRevision({
      workflowThreadId: "workflow-thread-1",
      requestedChange: "  Add retries  ",
      baseVersionId: "version-base",
      baseArtifactId: "artifact-base",
      proposedGraphSnapshotId: "graph-proposed",
      graphDiff: { changed: true },
      sourceDiff: "diff",
      status: "proposed",
    });

    expect(revision).toMatchObject({
      id: expect.any(String),
      workflowThreadId: "workflow-thread-1",
      baseVersionId: "version-base",
      baseArtifactId: "artifact-base",
      proposedVersionId: "version-proposed",
      proposedArtifactId: "artifact-proposed",
      requestedChange: "Add retries",
      proposedGraphSnapshotId: "graph-proposed",
      graphDiff: { changed: true },
      sourceDiff: "diff",
      status: "proposed",
    });
    expect(graphValidationCalls).toEqual([{ snapshotId: "graph-proposed", workflowThreadId: "workflow-thread-1" }]);
    expect(threadRow("workflow-thread-1")).toMatchObject({ phase: "revision" });
  });

  it("preserves missing and cross-thread validation errors", () => {
    expect(() => repository.listWorkflowRevisions("missing-thread")).toThrow("Workflow Agent thread not found: missing-thread");
    expect(() => repository.getWorkflowRevision("missing-revision")).toThrow("Workflow revision not found: missing-revision");
    expect(() =>
      repository.createWorkflowRevision({
        workflowThreadId: "workflow-thread-1",
        requestedChange: "Use other version",
        baseVersionId: "version-other-thread",
      }),
    ).toThrow("Workflow version version-other-thread does not belong to workflow thread workflow-thread-1.");
    expect(() =>
      repository.createWorkflowRevision({
        workflowThreadId: "workflow-thread-1",
        requestedChange: "Use other artifact",
        baseArtifactId: "artifact-other",
      }),
    ).toThrow("Workflow artifact artifact-other does not belong to workflow thread workflow-thread-1.");
    expect(() =>
      repository.createWorkflowRevision({
        workflowThreadId: "workflow-thread-1",
        requestedChange: "   ",
      }),
    ).toThrow("Workflow revision requested change is required.");
  });

  it("updates revisions selectively and can clear graph and source fields", () => {
    const created = repository.createWorkflowRevision({
      workflowThreadId: "workflow-thread-1",
      requestedChange: "Initial change",
      proposedGraphSnapshotId: "graph-proposed",
      graphDiff: { before: true },
      sourceDiff: "before",
      status: "draft",
    });

    const updated = repository.updateWorkflowRevision({
      id: created.id,
      requestedChange: "  Updated change  ",
      proposedGraphSnapshotId: null,
      graphDiff: { after: true },
      sourceDiff: null,
      status: "applied",
    });

    expect(updated).toMatchObject({
      id: created.id,
      requestedChange: "Updated change",
      proposedGraphSnapshotId: undefined,
      graphDiff: { after: true },
      sourceDiff: undefined,
      status: "applied",
    });
    expect(graphValidationCalls.at(-1)).toEqual({ snapshotId: undefined, workflowThreadId: "workflow-thread-1" });
    expect(threadRow("workflow-thread-1")).toMatchObject({ phase: "planned" });
    expect(() => repository.updateWorkflowRevision({ id: created.id, requestedChange: " " })).toThrow("Workflow revision requested change is required.");
  });

  it("lists revisions by updated, created, and row order", () => {
    insertRevision({ id: "revision-old", updatedAt: "2026-06-17T00:00:00.000Z", createdAt: "2026-06-17T00:00:00.000Z" });
    insertRevision({ id: "revision-new-a", updatedAt: "2026-06-17T01:00:00.000Z", createdAt: "2026-06-17T01:00:00.000Z" });
    insertRevision({ id: "revision-new-b", updatedAt: "2026-06-17T01:00:00.000Z", createdAt: "2026-06-17T01:00:00.000Z" });

    expect(repository.listWorkflowRevisions("workflow-thread-1").map((revision) => revision.id)).toEqual([
      "revision-new-b",
      "revision-new-a",
      "revision-old",
    ]);
  });

  it("applies revisions by activating the proposed artifact and graph", () => {
    const revision = repository.createWorkflowRevision({
      workflowThreadId: "workflow-thread-1",
      requestedChange: "Apply proposed",
      proposedGraphSnapshotId: "graph-proposed",
      status: "proposed",
    });

    const applied = repository.resolveWorkflowRevision({ id: revision.id, decision: "applied" });

    expect(applied.status).toBe("applied");
    expect(threadRow("workflow-thread-1")).toMatchObject({
      active_artifact_id: "artifact-proposed",
      active_graph_snapshot_id: "graph-proposed",
      phase: "ready_for_review",
    });
    expect(repository.resolveWorkflowRevision({ id: revision.id, decision: "applied" })).toEqual(applied);
    expect(() => repository.resolveWorkflowRevision({ id: revision.id, decision: "rejected" })).toThrow("Workflow revision is already applied.");
  });

  it("rejects revisions back to the base version or existing active state", () => {
    const withBase = repository.createWorkflowRevision({
      workflowThreadId: "workflow-thread-1",
      requestedChange: "Reject to base",
      baseVersionId: "version-base",
      proposedGraphSnapshotId: "graph-proposed",
      status: "proposed",
    });
    repository.resolveWorkflowRevision({ id: withBase.id, decision: "rejected" });

    expect(threadRow("workflow-thread-1")).toMatchObject({
      active_artifact_id: "artifact-base",
      active_graph_snapshot_id: "graph-base",
      phase: "approved",
    });

    db.prepare("UPDATE workflow_agent_threads SET active_artifact_id = ?, active_graph_snapshot_id = ?, phase = ? WHERE id = ?")
      .run("artifact-current", "graph-current", "planned", "workflow-thread-1");
    const withoutBase = repository.createWorkflowRevision({
      workflowThreadId: "workflow-thread-1",
      requestedChange: "Reject without base",
      proposedGraphSnapshotId: "graph-proposed",
      status: "proposed",
    });
    repository.resolveWorkflowRevision({ id: withoutBase.id, decision: "rejected" });

    expect(threadRow("workflow-thread-1")).toMatchObject({
      active_artifact_id: "artifact-current",
      active_graph_snapshot_id: null,
      phase: "planned",
    });
  });

  it("fails applied resolution without a matching proposed version", () => {
    const revision = repository.createWorkflowRevision({
      workflowThreadId: "workflow-thread-1",
      requestedChange: "No proposed version",
      proposedGraphSnapshotId: "graph-missing-version",
      status: "proposed",
    });

    expect(() => repository.resolveWorkflowRevision({ id: revision.id, decision: "applied" })).toThrow(
      "Cannot apply workflow revision without a proposed workflow version.",
    );
  });

  function insertRevision(input: { id: string; updatedAt: string; createdAt: string }): void {
    db.prepare(
      `INSERT INTO workflow_revisions
        (id, workflow_thread_id, base_version_id, base_artifact_id, requested_change, proposed_graph_snapshot_id, graph_diff_json, source_diff, revision_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.id, "workflow-thread-1", null, null, input.id, null, null, null, "draft", input.createdAt, input.updatedAt);
  }

  function threadRow(threadId: string): { active_artifact_id: string | null; active_graph_snapshot_id: string | null; phase: string } {
    return db
      .prepare("SELECT active_artifact_id, active_graph_snapshot_id, phase FROM workflow_agent_threads WHERE id = ?")
      .get(threadId) as { active_artifact_id: string | null; active_graph_snapshot_id: string | null; phase: string };
  }
});

function workflowVersion(input: Partial<WorkflowVersionSummary> & { id: string; artifactId: string }): WorkflowVersionSummary {
  return {
    workflowThreadId: "workflow-thread-1",
    version: 1,
    sourcePath: "/workflow.ts",
    repoPath: "/repo",
    status: "approved",
    createdBy: "compiler",
    createdAt: "2026-06-17T00:00:00.000Z",
    ...input,
  };
}

function workflowArtifact(input: Partial<WorkflowArtifactSummary> & { id: string }): WorkflowArtifactSummary {
  return {
    workflowThreadId: "workflow-thread-1",
    title: input.id,
    status: "approved",
    manifest: { tools: [], mutationPolicy: "read_only" },
    spec: { goal: input.id, summary: input.id, successCriteria: [] },
    sourcePath: "/workflow.ts",
    statePath: "/state.json",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    ...input,
  };
}

function required<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}
