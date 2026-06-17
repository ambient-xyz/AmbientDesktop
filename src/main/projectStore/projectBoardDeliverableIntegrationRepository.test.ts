import Database from "better-sqlite3";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import {
  ProjectStoreProjectBoardDeliverableIntegrationRepository,
  type ProjectBoardDeliverableIntegrationEventInput,
} from "./projectBoardDeliverableIntegrationRepository";

const NOW = "2026-06-16T00:00:00.000Z";

describe("ProjectStoreProjectBoardDeliverableIntegrationRepository", () => {
  let db: Database.Database;
  let tempRoot: string;
  let projectPath: string;
  let workspacePath: string;
  let run: OrchestrationRun;
  let events: ProjectBoardDeliverableIntegrationEventInput[];
  let repository: ProjectStoreProjectBoardDeliverableIntegrationRepository;

  beforeEach(async () => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    tempRoot = await mkdtemp(join(tmpdir(), "ambient-deliverable-integration-"));
    projectPath = join(tempRoot, "project");
    workspacePath = join(tempRoot, "run-workspace");
    await mkdir(projectPath, { recursive: true });
    await mkdir(workspacePath, { recursive: true });
    insertBoard(db, projectPath);
    run = orchestrationRun({ id: "run-1", taskId: "task-1", workspacePath, changedFiles: [] });
    events = [];
    repository = new ProjectStoreProjectBoardDeliverableIntegrationRepository(db, {
      getProjectBoard: (boardId) => (boardId === "board-1" ? projectBoard(projectPath) : undefined),
      getOrchestrationRun: (runId) => {
        if (runId !== run.id) throw new Error(`Unexpected run lookup: ${runId}`);
        return run;
      },
      appendProjectBoardEvent: (event) => {
        events.push(event);
      },
    });
  });

  afterEach(async () => {
    db.close();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("applies material deliverables, skips unavailable files, and records integration metadata", async () => {
    await mkdir(join(workspacePath, "src"), { recursive: true });
    await writeFile(join(workspacePath, "src", "timer.ts"), "export const minutes = 25;\n", "utf8");
    run = orchestrationRun({
      id: "run-apply",
      taskId: "task-1",
      workspacePath,
      changedFiles: ["src/timer.ts", "docs/missing.md", ".ambient/runtime.json", "node_modules/cache/index.js"],
      commands: ["pnpm test"],
      commits: ["abc123"],
      dependencyImports: ["date-fns"],
    });

    await repository.resolveProjectBoardDeliverableIntegration({
      boardId: "board-1",
      runId: run.id,
      action: "apply_to_root",
    });

    await expect(readFile(join(projectPath, "src", "timer.ts"), "utf8")).resolves.toContain("minutes");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      boardId: "board-1",
      kind: "deliverable_integration_resolved",
      entityId: "run-apply",
      metadata: expect.objectContaining({
        action: "apply_to_root",
        status: "integrated",
        materialFiles: ["src/timer.ts", "docs/missing.md"],
        excludedFiles: [".ambient/runtime.json", "node_modules/cache/index.js"],
        appliedFiles: ["src/timer.ts"],
        skippedFiles: ["docs/missing.md"],
        commands: ["pnpm test"],
        commits: ["abc123"],
        dependencyImports: ["date-fns"],
      }),
    });
    expect(boardUpdatedAt(db)).not.toBe(NOW);
  });

  it("exports deliverable bundles and records explicit defer decisions", async () => {
    await mkdir(join(workspacePath, "dist"), { recursive: true });
    await writeFile(join(workspacePath, "dist", "output.html"), "<main>Ready</main>\n", "utf8");
    run = orchestrationRun({
      id: "run-export",
      taskId: "task-1",
      workspacePath,
      changedFiles: ["dist/output.html"],
    });

    await repository.resolveProjectBoardDeliverableIntegration({
      boardId: "board-1",
      runId: run.id,
      action: "export_bundle",
    });

    const bundleRoot = join(projectPath, ".ambient", "project-board", "deliverable-bundles", run.id);
    await expect(readFile(join(bundleRoot, "files", "dist", "output.html"), "utf8")).resolves.toContain("Ready");
    const manifest = JSON.parse(await readFile(join(bundleRoot, "manifest.json"), "utf8")) as {
      integration?: { action?: string; filesRoot?: string };
      materialFiles?: Array<{ path?: string }>;
    };
    expect(manifest.integration).toMatchObject({
      action: "export_bundle",
      filesRoot: join(bundleRoot, "files"),
    });
    expect(manifest.materialFiles?.map((file) => file.path)).toEqual(["dist/output.html"]);

    run = orchestrationRun({
      id: "run-defer",
      taskId: "task-1",
      workspacePath,
      changedFiles: ["theme.css"],
    });
    await repository.resolveProjectBoardDeliverableIntegration({
      boardId: "board-1",
      runId: run.id,
      action: "defer",
      reason: "  Waiting for approval.  ",
    });

    expect(events.map((event) => event.metadata.status)).toEqual(["exported", "deferred"]);
    expect(events.find((event) => event.metadata.status === "exported")?.metadata.exportPath).toBe(bundleRoot);
    expect(events.find((event) => event.metadata.status === "deferred")?.metadata.reason).toBe("Waiting for approval.");
  });
});

function insertBoard(db: Database.Database, projectPath: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES ('board-1', ?, 'active', 'Project board', '', ?, ?)`,
  ).run(projectPath, NOW, NOW);
}

function boardUpdatedAt(db: Database.Database): string | undefined {
  return (db.prepare("SELECT updated_at FROM project_boards WHERE id = 'board-1'").get() as { updated_at?: string } | undefined)
    ?.updated_at;
}

function projectBoard(projectPath: string): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath,
    status: "active",
    title: "Project board",
    summary: "",
    cards: [projectCard()],
    sources: [],
    questions: [],
    proposals: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function projectCard(): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Implement timer",
    description: "Build the timer.",
    status: "review",
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: "local_task_import",
    sourceId: "task-1",
    orchestrationTaskId: "task-1",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function orchestrationRun(input: {
  id: string;
  taskId: string;
  workspacePath: string;
  changedFiles: string[];
  commands?: string[];
  commits?: string[];
  dependencyImports?: string[];
}): OrchestrationRun {
  return {
    id: input.id,
    taskId: input.taskId,
    attemptNumber: 1,
    status: "completed",
    workspacePath: input.workspacePath,
    startedAt: NOW,
    finishedAt: NOW,
    proofOfWork: {
      kind: "agent-run",
      changedFiles: input.changedFiles,
      commands: input.commands ?? [],
      commits: input.commits ?? [],
      dependencyImports: input.dependencyImports ?? [],
    },
  };
}
