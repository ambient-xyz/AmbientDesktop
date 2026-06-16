import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mapWorkflowArtifactRow } from "./workflowArtifactMappers";
import { ProjectStoreWorkflowArtifactRepository } from "./workflowArtifactRepository";
import { mapWorkflowArtifactRow as legacyMapWorkflowArtifactRow } from "../projectStoreWorkflowMappers";

describe("ProjectStoreWorkflowArtifactRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreWorkflowArtifactRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
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
    repository = new ProjectStoreWorkflowArtifactRepository(db);
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

  it("updates workflow artifacts without losing existing fields", () => {
    const artifact = repository.createWorkflowArtifact({
      workflowThreadId: "workflow-thread-1",
      title: "Classify failures",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Classify test failures." },
      sourcePath: ".ambient-codex/workflows/classify/main.ts",
      statePath: ".ambient-codex/workflows/classify/state.sqlite",
    });

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
  });

  it("reports missing workflow artifacts", () => {
    expect(repository.tryGetWorkflowArtifact("missing-artifact")).toBeUndefined();
    expect(() => repository.getWorkflowArtifact("missing-artifact")).toThrow("Workflow artifact not found: missing-artifact");
    expect(() => repository.updateWorkflowArtifact({ id: "missing-artifact", status: "approved" })).toThrow(
      "Workflow artifact not found: missing-artifact",
    );
  });
});
