import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureProjectBoardDogfoodDesktopService,
  projectBoardSemanticIdleDogfoodFastRetryEnabled,
  requireProjectBoardDogfoodTestHook,
  seedProjectBoardSemanticIdleDogfoodRetry,
  seedProjectBoardSemanticIdleDogfoodRun,
} from "./projectBoardDogfoodDesktopService";
import { ProjectStore } from "./projectBoardProjectStoreFacade";

const tempRoots: string[] = [];

afterEach(async () => {
  delete process.env.AMBIENT_E2E;
  delete process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_ENABLE_TEST_HOOKS;
  delete process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SEMANTIC_IDLE_FAST_RETRY;
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("projectBoardDogfoodDesktopService", () => {
  it("gates dogfood hooks behind E2E or explicit test-hook enablement", () => {
    expect(() => requireProjectBoardDogfoodTestHook("project-board:dogfood-test")).toThrow(
      "project-board:dogfood-test is only available in Ambient E2E dogfood runs.",
    );

    process.env.AMBIENT_E2E = "1";
    expect(() => requireProjectBoardDogfoodTestHook("project-board:dogfood-test")).not.toThrow();
    expect(projectBoardSemanticIdleDogfoodFastRetryEnabled()).toBe(false);

    process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SEMANTIC_IDLE_FAST_RETRY = "1";
    expect(projectBoardSemanticIdleDogfoodFastRetryEnabled()).toBe(true);
  });

  it("seeds semantic-idle project-board dogfood runs through the extracted owner", async () => {
    process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_ENABLE_TEST_HOOKS = "1";
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-board-dogfood-service-"));
    tempRoots.push(workspacePath);
    const store = new ProjectStore();
    store.openWorkspace(workspacePath);
    const applyProjectBoardIncrementalSynthesisFromRun = vi.fn();
    configureProjectBoardDogfoodDesktopService({
      applyProjectBoardIncrementalSynthesisFromRun,
      emitProjectStateIfActive: vi.fn(),
      readStateForProjectHostAction: vi.fn(() => ({}) as never),
      requireProjectBoardForAction: (boardId, targetStore) => {
        const board = targetStore.getProjectBoard(boardId);
        if (!board) throw new Error(`Project board not found: ${boardId}`);
        return board;
      },
      reviewFinishedProjectBoardRun: vi.fn(),
    });

    try {
      const board = store.createProjectBoard({ title: "Semantic idle board" });
      const seeded = seedProjectBoardSemanticIdleDogfoodRun(board.id, store);
      const retry = seedProjectBoardSemanticIdleDogfoodRetry(board.id, seeded.id, store);
      const refreshedBoard = store.getProjectBoard(board.id);

      expect(seeded.status).toBe("succeeded");
      expect(seeded.stage).toBe("board_applied");
      expect(seeded.cardCount).toBe(1);
      expect(retry.status).toBe("succeeded");
      expect(retry.retryOfRunId).toBe(seeded.id);
      expect(refreshedBoard?.sources.map((source) => source.sourceKey)).toEqual([
        "dogfood:semantic-idle-foundation",
        "dogfood:semantic-idle-combat",
      ]);
      expect(applyProjectBoardIncrementalSynthesisFromRun).toHaveBeenNthCalledWith(1, expect.objectContaining({
        boardId: board.id,
        runId: seeded.id,
        model: "dogfood-semantic-idle",
        replaceExistingDraft: true,
        targetStore: store,
      }));
      expect(applyProjectBoardIncrementalSynthesisFromRun).toHaveBeenNthCalledWith(2, expect.objectContaining({
        boardId: board.id,
        runId: retry.id,
        model: "dogfood-semantic-idle-retry",
        replaceExistingDraft: true,
        targetStore: store,
      }));
    } finally {
      store.close();
    }
  });
});
