import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectStore } from "./projectBoardProjectStoreFacade";
import {
  configureProjectBoardProofDefaultsDesktopService,
  regenerateProjectBoardDecisionDrafts,
  suggestProjectBoardClarificationDefaults,
  suggestProjectBoardProof,
} from "./projectBoardProofDefaultsDesktopService";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("projectBoardProofDefaultsDesktopService", () => {
  it("stages an empty proof suggestion result when draft cards already have proof expectations", async () => {
    const { store } = await createHarness();
    try {
      const board = store.createProjectBoard({ title: "Covered proof board" });
      const card = store.updateProjectBoardCard({
        cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Already covered draft" }).id,
        testPlan: {
          unit: ["Assert the proof suggestion branch sees this as covered."],
          integration: [],
          visual: [],
          manual: [],
        },
      });

      await suggestProjectBoardProof({ boardId: board.id });

      const refreshed = store.getProjectBoard(board.id)!;
      expect(refreshed.cards.find((candidate) => candidate.id === card.id)?.pendingPiUpdate).toBeUndefined();
      const event = refreshed.events?.find((candidate) => candidate.title === "Proof expectations suggested");
      expect(event?.metadata.proofImpact).toMatchObject({
        targetCardIds: [],
        appliedCardIds: [],
        existingCardsRewritten: false,
        modelCallRequired: true,
      });
    } finally {
      store.close();
    }
  });

  it("stages an empty clarification default result when no cards need defaults", async () => {
    const { store } = await createHarness();
    try {
      const board = store.createProjectBoard({ title: "No default targets board" });
      const card = store.createProjectBoardManualCard({ boardId: board.id, title: "Ready draft" });

      await suggestProjectBoardClarificationDefaults({ boardId: board.id }, store);

      const refreshed = store.getProjectBoard(board.id)!;
      expect(refreshed.cards.find((candidate) => candidate.id === card.id)?.clarificationSuggestions).toEqual([]);
      const event = refreshed.events?.find((candidate) => candidate.title === "Clarification defaults suggested");
      expect(event?.metadata.clarificationDefaults).toMatchObject({
        targetCardIds: [],
        appliedCardIds: [],
        existingCardsRewritten: false,
        modelCallRequired: true,
      });
    } finally {
      store.close();
    }
  });

  it("rejects decision draft refresh after ticketization", async () => {
    const { store } = await createHarness();
    try {
      const board = store.createProjectBoard({ title: "Ticketized decision board" });
      const draft = store.updateProjectBoardCard({
        cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Choose keyboard behavior" }).id,
        candidateStatus: "ready_to_create",
        acceptanceCriteria: ["Keyboard behavior is decided."],
        testPlan: { unit: ["Check keyboard behavior."], integration: [], visual: [], manual: [] },
      });
      store.updateProjectBoardStatus(board.id, "active");
      const [approved] = store.createReadyProjectBoardTasks(board.id);
      expect(approved.id).toBe(draft.id);

      await expect(
        regenerateProjectBoardDecisionDrafts({
          cardId: approved.id,
          question: "Should keyboard shortcuts be enabled?",
          answer: "Enable documented keyboard shortcuts.",
        }, store),
      ).rejects.toThrow("Decision draft Pi refresh must start from a draft clarification card before ticketization.");
    } finally {
      store.close();
    }
  });
});

async function createHarness(): Promise<{ store: ProjectStore; emitDesktopState: ReturnType<typeof vi.fn> }> {
  const workspacePath = await mkdtemp(join(tmpdir(), "ambient-board-proof-defaults-service-"));
  tempRoots.push(workspacePath);
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  const emitDesktopState = vi.fn();
  configureProjectBoardProofDefaultsDesktopService({
    store: () => store,
    emitDesktopState,
  });
  return { store, emitDesktopState };
}
