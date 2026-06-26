import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectBoardSource } from "../../shared/projectBoardTypes";
import { validateProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { ProjectStore } from "./projectBoardProjectStoreFacade";
import type { ProjectBoardSynthesisDraft } from "./projectBoardSynthesis";
import {
  applyProjectBoardIncrementalSynthesisFromRun,
  configureProjectBoardSynthesisDesktopService,
  pauseProjectBoardSynthesisForProjectHost,
  recoverOrphanedProjectBoardSynthesisPauseRequests,
} from "./projectBoardSynthesisDesktopService";
import { classifyProjectBoardSourcesWithPi } from "./projectBoardSynthesisDesktopSourceRefresh";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("projectBoardSynthesisDesktopService", () => {
  it("finalizes orphaned pause requests without an attached planner stream", async () => {
    const { store, host } = await createHarness();
    try {
      const board = store.createProjectBoard({ title: "Pause board" });
      const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "ambient-test" });

      pauseProjectBoardSynthesisForProjectHost(host, {
        boardId: board.id,
        runId: run.id,
        reason: "Review before continuing.",
      });

      const paused = store.getProjectBoardSynthesisRun(run.id);
      expect(paused?.status).toBe("paused");
      expect(paused?.events.at(-1)?.metadata).toMatchObject({
        orphanedPauseRequest: true,
        recoverySource: "pause_request_without_active_controller",
      });
    } finally {
      store.close();
    }
  });

  it("recovers pause-requested runs during board state reads", async () => {
    const { store } = await createHarness();
    try {
      const board = store.createProjectBoard({ title: "Recovery board" });
      const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "ambient-test" });
      store.requestProjectBoardSynthesisRunPause({
        boardId: board.id,
        runId: run.id,
        reason: "Pause from renderer.",
      });

      const recovered = recoverOrphanedProjectBoardSynthesisPauseRequests(store.getProjectBoard(board.id), store);
      const recoveredRun = recovered?.synthesisRuns?.[0];

      expect(recoveredRun?.status).toBe("paused");
      expect(recoveredRun?.events.at(-1)?.metadata).toMatchObject({
        orphanedPauseRequest: true,
        recoverySource: "desktop_state_recovery",
      });
    } finally {
      store.close();
    }
  });

  it("applies persisted progressive card batches through the extracted owner", async () => {
    const { store } = await createHarness();
    try {
      const board = store.createProjectBoard({ title: "Incremental board" });
      const source = store.replaceProjectBoardSources(board.id, [
        {
          kind: "functional_spec",
          sourceKey: "test:source",
          title: "Functional Spec",
          summary: "Spec summary",
          excerpt: "Build a deterministic card.",
          relevance: 100,
          includeInSynthesis: true,
        },
      ])[0];
      const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "ambient-test" });
      store.recordProjectBoardSynthesisRunProgressiveRecords(
        run.id,
        [
          validateProposalJsonlRecordArtifact({
            type: "candidate_card",
            sourceId: "synthesis:test-card",
            title: "Build deterministic card",
            description: "Create a narrow deterministic card from the saved progressive record.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Foundation",
            labels: ["test"],
            blockedBy: [],
            sourceRefs: [{ sourceId: source.id, path: source.path, range: "lines:1-2" }],
            clarificationQuestions: ["Which deterministic behavior should this card prove?"],
            acceptanceCriteria: ["The card is created from progressive records."],
            testPlan: {
              unit: ["Assert progressive records create a draft card."],
              integration: [],
              visual: [],
              manual: [],
            },
          }),
        ],
        {
          summary: "Persisted one deterministic progressive card.",
        },
      );

      applyProjectBoardIncrementalSynthesisFromRun({
        boardId: board.id,
        runId: run.id,
        fallback: emptyDraft(),
        model: "ambient-test",
        startedAt: Date.now(),
        replaceExistingDraft: true,
        targetStore: store,
      });

      const refreshed = store.getProjectBoard(board.id);
      expect(refreshed?.cards.some((card) => card.title === "Build deterministic card")).toBe(true);
      expect(store.getProjectBoardSynthesisRun(run.id)?.events.at(-1)?.title).toBe("Applied incremental Pi card batch");
    } finally {
      store.close();
    }
  });

  it("keeps current user-classified sources without Ambient/Pi classification", async () => {
    const { store, host, emitProjectBoardState } = await createHarness();
    try {
      const board = store.createProjectBoard({ title: "Classified source board" });
      const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "ambient-test" });
      const source: ProjectBoardSource = {
        id: "source-1",
        boardId: board.id,
        kind: "functional_spec",
        sourceKey: "spec:classified",
        contentHash: "hash-1",
        changeState: "unchanged",
        title: "Classified spec",
        summary: "Already reviewed by the user.",
        excerpt: "No provider classification is needed.",
        classifiedBy: "user",
        authorityRole: "primary",
        includeInSynthesis: true,
        relevance: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const classified = await classifyProjectBoardSourcesWithPi(board.id, [source], {
        model: "ambient-test",
        runId: run.id,
        targetStore: store,
        host,
      });

      expect(classified).toEqual([source]);
      expect(store.getProjectBoardSynthesisRun(run.id)?.events.at(-1)?.title).toBe("Source classification already current");
      expect(emitProjectBoardState).toHaveBeenCalledWith(store, host);
    } finally {
      store.close();
    }
  });
});

async function createHarness(): Promise<{
  store: ProjectStore;
  host: { store: ProjectStore };
  emitProjectBoardState: ReturnType<typeof vi.fn>;
}> {
  const workspacePath = await mkdtemp(join(tmpdir(), "ambient-board-synthesis-service-"));
  tempRoots.push(workspacePath);
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  const emitProjectBoardState = vi.fn();
  configureProjectBoardSynthesisDesktopService({
    store: () => store,
    emitProjectBoardState,
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => ({}) as never),
  });
  return { store, host: { store }, emitProjectBoardState };
}

function emptyDraft(): ProjectBoardSynthesisDraft {
  return {
    summary: "Empty draft",
    goal: "Keep existing work stable.",
    currentState: "No generated cards yet.",
    targetUser: "Ambient developer",
    qualityBar: "Deterministic",
    assumptions: [],
    questions: [],
    sourceNotes: [],
    cards: [],
  };
}
