import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { projectBoardArtifactExportFromSummary, writeProjectBoardArtifactExport } from "./projectBoardArtifactExport";
import { createOrAdoptProjectBoard } from "./projectBoardBootstrap";
import { ProjectStore } from "./projectBoardProjectStoreFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const execFileAsync = promisify(execFile);
let tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots = [];
});

describeNative("project board bootstrap", () => {
  it("initializes Git and creates a fresh board when no artifact projection exists", async () => {
    const workspacePath = await tempRoot("ambient-board-bootstrap-fresh-");
    const store = new ProjectStore();
    store.openWorkspace(workspacePath);

    try {
      const result = await createOrAdoptProjectBoard({
        workspacePath,
        title: "Launch board",
        summary: "Coordinate the launch.",
        getActiveBoard: () => store.getActiveProjectBoard(),
        createBoard: (input) => store.createProjectBoard(input),
        applyArtifactProjection: (projectPath, projection) => store.applyProjectBoardArtifactProjection(projectPath, projection),
      });

      expect(result.kind).toBe("created");
      expect(result.board).toMatchObject({ title: "Launch board", summary: "Coordinate the launch.", projectPath: workspacePath });
      expect(await git(workspacePath, "rev-parse", "--is-inside-work-tree")).toBe("true");
    } finally {
      store.close();
    }
  });

  it("adopts a valid .ambient/board projection before creating a blank board", async () => {
    const artifactWorkspacePath = await tempRoot("ambient-board-bootstrap-artifacts-");
    const targetWorkspacePath = await tempRoot("ambient-board-bootstrap-adopt-");
    const artifactStore = new ProjectStore();
    artifactStore.openWorkspace(artifactWorkspacePath);
    const sourceBoard = seedBoard(artifactStore);
    await writeProjectBoardArtifactExport(targetWorkspacePath, projectBoardArtifactExportFromSummary(sourceBoard));
    artifactStore.close();

    const targetStore = new ProjectStore();
    targetStore.openWorkspace(targetWorkspacePath);
    let createdFreshBoard = false;

    try {
      const result = await createOrAdoptProjectBoard({
        workspacePath: targetWorkspacePath,
        title: "Should not be used",
        getActiveBoard: () => targetStore.getActiveProjectBoard(),
        createBoard: (input) => {
          createdFreshBoard = true;
          return targetStore.createProjectBoard(input);
        },
        applyArtifactProjection: (projectPath, projection) => targetStore.applyProjectBoardArtifactProjection(projectPath, projection),
      });

      expect(result.kind).toBe("adopted");
      expect(createdFreshBoard).toBe(false);
      expect(result.board).toMatchObject({
        id: sourceBoard.id,
        title: "Imported board",
        summary: "Imported board summary.",
        projectPath: targetWorkspacePath,
      });
      expect(result.board.cards.map((card) => card.title)).toEqual(["Imported card"]);
      expect(await git(targetWorkspacePath, "rev-parse", "--is-inside-work-tree")).toBe("true");
    } finally {
      targetStore.close();
    }
  });

  it("reports stale freshness when adopted artifacts differ from the current source scan", async () => {
    const artifactWorkspacePath = await tempRoot("ambient-board-bootstrap-stale-artifacts-");
    const targetWorkspacePath = await tempRoot("ambient-board-bootstrap-stale-adopt-");
    const artifactStore = new ProjectStore();
    artifactStore.openWorkspace(artifactWorkspacePath);
    const sourceBoard = seedBoard(artifactStore);
    await writeProjectBoardArtifactExport(targetWorkspacePath, projectBoardArtifactExportFromSummary(sourceBoard));
    artifactStore.close();

    const targetStore = new ProjectStore();
    targetStore.openWorkspace(targetWorkspacePath);

    try {
      const result = await createOrAdoptProjectBoard({
        workspacePath: targetWorkspacePath,
        getActiveBoard: () => targetStore.getActiveProjectBoard(),
        createBoard: (input) => targetStore.createProjectBoard(input),
        applyArtifactProjection: (projectPath, projection) => targetStore.applyProjectBoardArtifactProjection(projectPath, projection),
        scanSources: async () => [
          { sourceKey: "file:NEW.md", contentHash: "new-source-hash", title: "New source" },
          { sourceKey: "file:SOURCE.md", contentHash: "changed-source-hash", title: "Changed source" },
        ],
      });

      expect(result.kind).toBe("adopted");
      expect(result.freshness).toMatchObject({
        status: "stale",
        newSourceCount: 1,
        changedSourceCount: 1,
        removedSourceCount: 0,
        newSourceKeys: ["file:NEW.md"],
        changedSourceKeys: ["file:SOURCE.md"],
      });
    } finally {
      targetStore.close();
    }
  });

  it("creates a fresh board when only planner workspace support artifacts exist under .ambient/board", async () => {
    const workspacePath = await tempRoot("ambient-board-bootstrap-planner-support-");
    await writeArtifact(workspacePath, ".ambient/board/planner-workspaces/run-1/manifest.json", JSON.stringify({ runId: "run-1" }));
    await writeArtifact(workspacePath, ".ambient/board/planner-workspaces/run-1/planner-ledger.json", JSON.stringify({ records: [] }));
    const store = new ProjectStore();
    store.openWorkspace(workspacePath);
    let appliedProjection = false;

    try {
      const result = await createOrAdoptProjectBoard({
        workspacePath,
        title: "Fresh board",
        getActiveBoard: () => store.getActiveProjectBoard(),
        createBoard: (input) => store.createProjectBoard(input),
        applyArtifactProjection: (projectPath, projection) => {
          appliedProjection = true;
          return store.applyProjectBoardArtifactProjection(projectPath, projection);
        },
      });

      expect(result.kind).toBe("created");
      expect(appliedProjection).toBe(false);
      expect(result.board).toMatchObject({ title: "Fresh board", projectPath: workspacePath });
      expect(await git(workspacePath, "rev-parse", "--is-inside-work-tree")).toBe("true");
    } finally {
      store.close();
    }
  });

  it("returns an existing board with artifact review pending instead of parsing artifacts during bootstrap", async () => {
    const workspacePath = await tempRoot("ambient-board-bootstrap-existing-artifacts-");
    await writeArtifact(workspacePath, ".ambient/board/board.config.json", "{");
    const store = new ProjectStore();
    store.openWorkspace(workspacePath);
    const board = store.createProjectBoard({ title: "Local board" });
    let createdFreshBoard = false;
    let appliedProjection = false;

    try {
      const result = await createOrAdoptProjectBoard({
        workspacePath,
        getActiveBoard: () => store.getActiveProjectBoard(),
        createBoard: (input) => {
          createdFreshBoard = true;
          return store.createProjectBoard(input);
        },
        applyArtifactProjection: (projectPath, projection) => {
          appliedProjection = true;
          return store.applyProjectBoardArtifactProjection(projectPath, projection);
        },
      });

      expect(result).toMatchObject({ kind: "existing_with_artifacts", board: expect.objectContaining({ id: board.id }), artifactFileCount: 1 });
      expect(createdFreshBoard).toBe(false);
      expect(appliedProjection).toBe(false);
    } finally {
      store.close();
    }
  });

  it("blocks fresh-board creation when board artifacts are present but invalid", async () => {
    const workspacePath = await tempRoot("ambient-board-bootstrap-invalid-");
    await writeArtifact(workspacePath, ".ambient/board/board.config.json", "{");
    const store = new ProjectStore();
    store.openWorkspace(workspacePath);
    let createdFreshBoard = false;

    try {
      await expect(
        createOrAdoptProjectBoard({
          workspacePath,
          getActiveBoard: () => store.getActiveProjectBoard(),
          createBoard: (input) => {
            createdFreshBoard = true;
            return store.createProjectBoard(input);
          },
          applyArtifactProjection: (projectPath, projection) => store.applyProjectBoardArtifactProjection(projectPath, projection),
        }),
      ).rejects.toThrow(/board\.config\.json/);
      expect(createdFreshBoard).toBe(false);
      expect(store.getActiveProjectBoard()).toBeUndefined();
      expect(await git(workspacePath, "rev-parse", "--is-inside-work-tree")).toBe("true");
    } finally {
      store.close();
    }
  });
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function seedBoard(store: ProjectStore) {
  const board = store.createProjectBoard({ title: "Imported board", summary: "Imported board summary." });
  store.replaceProjectBoardSources(board.id, [
    {
      kind: "functional_spec",
      title: "Imported source",
      summary: "Source summary.",
      excerpt: "Source excerpt.",
      path: "SOURCE.md",
      relevance: 95,
    },
  ]);
  store.createProjectBoardManualCard({ boardId: board.id, title: "Imported card", description: "Imported card description." });
  return store.getProjectBoard(board.id)!;
}

async function writeArtifact(workspacePath: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(workspacePath, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function git(workspacePath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", workspacePath, ...args]);
  return stdout.trim();
}
