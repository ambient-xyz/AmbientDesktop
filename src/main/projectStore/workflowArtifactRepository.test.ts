import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CreateWorkflowAgentThreadInput } from "../../shared/types";
import { mapWorkflowArtifactRow } from "./workflowArtifactMappers";
import { ProjectStoreWorkflowArtifactRepository } from "./workflowArtifactRepository";
import { mapWorkflowArtifactRow as legacyMapWorkflowArtifactRow } from "./projectStoreWorkflowMappers";

describe("ProjectStoreWorkflowArtifactRepository", () => {
  let db: Database.Database;
  let createdThreads: CreateWorkflowAgentThreadInput[];
  let repository: ProjectStoreWorkflowArtifactRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workflow_agent_threads (
        id TEXT PRIMARY KEY,
        active_artifact_id TEXT,
        phase TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE workflow_artifacts (
        id TEXT PRIMARY KEY,
        workflow_thread_id TEXT,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        spec_json TEXT NOT NULL,
        source_path TEXT NOT NULL,
        state_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO workflow_agent_threads (id, active_artifact_id, phase, updated_at) VALUES (?, ?, ?, ?)")
      .run("workflow-thread-1", null, "planned", "2026-06-17T00:00:00.000Z");
    db.prepare("INSERT INTO workflow_agent_threads (id, active_artifact_id, phase, updated_at) VALUES (?, ?, ?, ?)")
      .run("workflow-thread-2", null, "planned", "2026-06-17T00:00:00.000Z");
    createdThreads = [];
    repository = new ProjectStoreWorkflowArtifactRepository(db, {
      createWorkflowAgentThreadRecord: (input) => {
        createdThreads.push(input);
        const id = `created-thread-${createdThreads.length}`;
        db.prepare("INSERT INTO workflow_agent_threads (id, active_artifact_id, phase, updated_at) VALUES (?, ?, ?, ?)")
          .run(id, null, input.phase ?? "discovery", "2026-06-17T00:00:00.000Z");
        return { id };
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("keeps the legacy workflow mapper import path as a re-export", () => {
    expect(legacyMapWorkflowArtifactRow).toBe(mapWorkflowArtifactRow);
  });

  it("persists workflow artifacts and preserves mapper fallback behavior", () => {
    const artifact = repository.createWorkflowArtifact({
      id: "workflow-artifact-1",
      workflowThreadId: "workflow-thread-1",
      title: "  Daily report workflow  ",
      status: "ready_for_preview",
      manifest: {
        tools: ["file_read", "file_write"],
        mutationPolicy: "staged_until_approved",
        maxToolCalls: 12,
      },
      spec: {
        goal: "Generate a daily report",
        summary: "Collects status and writes the report.",
      },
      sourcePath: "/tmp/workflow/main.ts",
      statePath: "/tmp/workflow/state.json",
    });

    expect(artifact).toMatchObject({
      id: "workflow-artifact-1",
      workflowThreadId: "workflow-thread-1",
      title: "Daily report workflow",
      status: "ready_for_preview",
      manifest: { tools: ["file_read", "file_write"], mutationPolicy: "staged_until_approved", maxToolCalls: 12 },
      spec: { goal: "Generate a daily report", summary: "Collects status and writes the report." },
      sourcePath: "/tmp/workflow/main.ts",
      statePath: "/tmp/workflow/state.json",
    });
    expect(repository.listWorkflowArtifacts()).toEqual([artifact]);
    expect(threadRow("workflow-thread-1")).toMatchObject({
      active_artifact_id: "workflow-artifact-1",
      phase: "ready_for_review",
      updated_at: artifact.updatedAt,
    });

    db.prepare("UPDATE workflow_artifacts SET workflow_thread_id = NULL, manifest_json = ?, spec_json = ? WHERE id = ?").run(
      "[]",
      "not-json",
      artifact.id,
    );
    expect(repository.getWorkflowArtifact(artifact.id)).toMatchObject({
      workflowThreadId: undefined,
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "" },
    });
  });

  it("creates a workflow agent thread when no workflow thread id is supplied", () => {
    const artifact = repository.createWorkflowArtifact({
      title: "  New workflow  ",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Build a new workflow." },
      sourcePath: "/tmp/workflow/new.ts",
      statePath: "/tmp/workflow/new-state.json",
    });

    expect(createdThreads).toEqual([
      {
        title: "  New workflow  ",
        initialRequest: "Build a new workflow.",
        phase: "approved",
      },
    ]);
    expect(artifact.workflowThreadId).toBe("created-thread-1");
    expect(threadRow("created-thread-1")).toMatchObject({
      active_artifact_id: artifact.id,
      phase: "approved",
      updated_at: artifact.updatedAt,
    });
  });

  it("touches but does not activate the workflow thread when activation is disabled", () => {
    const artifact = repository.createWorkflowArtifact({
      workflowThreadId: "workflow-thread-1",
      title: "Draft workflow",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Draft only." },
      sourcePath: "/tmp/workflow/draft.ts",
      statePath: "/tmp/workflow/draft-state.json",
      activate: false,
    });

    expect(threadRow("workflow-thread-1")).toMatchObject({
      active_artifact_id: null,
      phase: "planned",
      updated_at: artifact.updatedAt,
    });
  });

  it("updates workflow artifacts without losing existing fields", () => {
    const artifact = repository.createWorkflowArtifact({
      workflowThreadId: "workflow-thread-1",
      title: "Classify failures",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Classify test failures." },
      sourcePath: ".ambient-codex/workflows/classify/main.ts",
      statePath: ".ambient-codex/workflows/classify/state.sqlite",
    });
    db.prepare("UPDATE workflow_agent_threads SET active_artifact_id = ?, phase = ?, updated_at = ? WHERE id = ?")
      .run(null, "planned", "2026-06-17T00:00:00.000Z", "workflow-thread-1");

    const updated = repository.updateWorkflowArtifact({
      id: artifact.id,
      status: "approved",
      title: "   ",
      spec: { ...artifact.spec, summary: "Group failures by cause." },
    });

    expect(updated).toMatchObject({
      id: artifact.id,
      workflowThreadId: "workflow-thread-1",
      title: "Classify failures",
      status: "approved",
      manifest: artifact.manifest,
      spec: { goal: "Classify test failures.", summary: "Group failures by cause." },
      sourcePath: artifact.sourcePath,
      statePath: artifact.statePath,
    });
    expect(updated.updatedAt >= artifact.updatedAt).toBe(true);
    expect(threadRow("workflow-thread-1")).toMatchObject({
      active_artifact_id: artifact.id,
      phase: "approved",
      updated_at: updated.updatedAt,
    });
  });

  it("activates an explicitly reassigned workflow thread on update", () => {
    const artifact = repository.createWorkflowArtifact({
      workflowThreadId: "workflow-thread-1",
      title: "Move workflow",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Move artifact." },
      sourcePath: "/tmp/workflow/move.ts",
      statePath: "/tmp/workflow/move-state.json",
    });

    const updated = repository.updateWorkflowArtifact({
      id: artifact.id,
      workflowThreadId: "workflow-thread-2",
      status: "draft",
    });

    expect(updated.workflowThreadId).toBe("workflow-thread-2");
    expect(threadRow("workflow-thread-2")).toMatchObject({
      active_artifact_id: artifact.id,
      phase: "request",
      updated_at: updated.updatedAt,
    });
  });

  it("repairs missing workflow thread links for existing artifacts", () => {
    insertArtifact({
      id: "valid-artifact",
      workflowThreadId: "workflow-thread-1",
      title: "Already linked",
      status: "approved",
      goal: "Already linked goal.",
      updatedAt: "2026-06-17T00:01:00.000Z",
    });
    insertArtifact({
      id: "stale-thread-artifact",
      workflowThreadId: "missing-thread",
      title: "Stale thread artifact",
      status: "rejected",
      summary: "Use summary fallback.",
      updatedAt: "2026-06-17T00:02:00.000Z",
    });
    insertArtifact({
      id: "orphan-artifact",
      workflowThreadId: null,
      title: "Orphan artifact",
      status: "approved",
      goal: "Orphan goal.",
      updatedAt: "2026-06-17T00:03:00.000Z",
    });

    repository.ensureWorkflowAgentThreadLinks();

    expect(createdThreads).toEqual([
      {
        title: "Orphan artifact",
        initialRequest: "Orphan goal.",
        phase: "approved",
      },
      {
        title: "Stale thread artifact",
        initialRequest: "Use summary fallback.",
        phase: "revision",
      },
    ]);
    expect(repository.getWorkflowArtifact("orphan-artifact").workflowThreadId).toBe("created-thread-1");
    expect(repository.getWorkflowArtifact("stale-thread-artifact").workflowThreadId).toBe("created-thread-2");
    expect(repository.getWorkflowArtifact("valid-artifact").workflowThreadId).toBe("workflow-thread-1");
    expect(threadRow("created-thread-1")).toMatchObject({ active_artifact_id: "orphan-artifact", phase: "approved" });
    expect(threadRow("created-thread-2")).toMatchObject({ active_artifact_id: "stale-thread-artifact", phase: "revision" });
    expect(threadRow("workflow-thread-1")).toMatchObject({ active_artifact_id: null, phase: "planned" });
  });

  it("reports missing workflow artifacts", () => {
    expect(repository.tryGetWorkflowArtifact("missing-artifact")).toBeUndefined();
    expect(() => repository.getWorkflowArtifact("missing-artifact")).toThrow("Workflow artifact not found: missing-artifact");
    expect(() => repository.updateWorkflowArtifact({ id: "missing-artifact", status: "approved" })).toThrow(
      "Workflow artifact not found: missing-artifact",
    );
  });

  function insertArtifact(input: {
    id: string;
    workflowThreadId: string | null;
    title: string;
    status: string;
    goal?: string;
    summary?: string;
    updatedAt: string;
  }): void {
    db.prepare(
      `INSERT INTO workflow_artifacts
        (id, workflow_thread_id, title, status, manifest_json, spec_json, source_path, state_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.workflowThreadId,
      input.title,
      input.status,
      JSON.stringify({ tools: [], mutationPolicy: "read_only" }),
      JSON.stringify({ goal: input.goal ?? "", summary: input.summary }),
      `/tmp/${input.id}.ts`,
      `/tmp/${input.id}.json`,
      input.updatedAt,
      input.updatedAt,
    );
  }

  function threadRow(threadId: string): { active_artifact_id: string | null; phase: string; updated_at: string } {
    const row = db.prepare("SELECT active_artifact_id, phase, updated_at FROM workflow_agent_threads WHERE id = ?").get(threadId) as
      | { active_artifact_id: string | null; phase: string; updated_at: string }
      | undefined;
    if (!row) throw new Error(`Missing workflow thread ${threadId}`);
    return row;
  }
});
