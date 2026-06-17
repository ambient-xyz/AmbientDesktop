import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serializeBoardArtifact } from "./projectBoardArtifacts";
import { projectBoardArtifactExportFromSummary, type ProjectBoardArtifactFile } from "./projectBoardArtifactExport";
import { compareProjectBoardSummaryToArtifactProjection, projectBoardArtifactProjectionFromFiles } from "./projectBoardArtifactImport";
import { ProjectStore } from "../projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board artifact projection apply", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-board-apply-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("applies a no-op validated Git projection without dropping local kickoff questions", () => {
    const board = seedBoard();
    const original = store.getProjectBoard(board.id)!;
    const projection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(original).files);

    const applied = store.applyProjectBoardArtifactProjection(workspacePath, projection);

    expect(applied.id).toBe(original.id);
    expect(applied.title).toBe(original.title);
    expect(applied.cards.map((card) => card.title)).toEqual(original.cards.map((card) => card.title));
    expect(applied.sources.map((source) => source.title)).toEqual(original.sources.map((source) => source.title));
    expect(applied.questions.length).toBeGreaterThan(0);
  });

  it("applies paused synthesis run projections without turning them into failures", () => {
    const board = seedBoard();
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "ambient-test" });
    store.requestProjectBoardSynthesisRunPause({ boardId: board.id, runId: run.id, reason: "Review the draft before continuing." });
    store.markProjectBoardSynthesisRunPaused({
      boardId: board.id,
      runId: run.id,
      reason: "Planning paused after canceling the active Ambient/Pi stream.",
      metadata: { transportAbort: true, checkpointPolicy: "validated_progressive_records" },
    });
    const paused = store.getProjectBoard(board.id)!;
    const projection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(paused).files);

    const applied = store.applyProjectBoardArtifactProjection(workspacePath, projection);
    const appliedRun = applied.synthesisRuns?.find((candidate) => candidate.id === run.id);

    expect(appliedRun).toMatchObject({
      id: run.id,
      status: "paused",
      stage: "paused",
      model: "ambient-test",
    });
    expect(appliedRun?.events.map((event) => event.stage)).toContain("paused");
  });

  it("replaces board-owned cards and sources from a changed pulled projection", () => {
    const board = seedBoard();
    const exported = projectBoardArtifactExportFromSummary(store.getProjectBoard(board.id)!);
    const changed = mutateArtifactFile(
      mutateArtifactFile(
        mutateArtifactFile(exported.files, "board.config.json", (value) => ({
          ...value,
          title: "Pulled collaborator board",
          summary: "Imported from Git.",
        })),
        "sources/snapshots/current.json",
        (value) => ({
          ...value,
          sources: (value.sources as Array<Record<string, unknown>>).map((source) => ({
            ...source,
            summary: "Collaborator expanded the source summary.",
          })),
        }),
      ),
      "cards/",
      (value) => ({
        ...value,
        title: "Pulled implementation card",
        status: "ready",
        candidateStatus: "ready_to_create",
        acceptanceCriteria: ["Pulled criteria survives import."],
      }),
    );
    const projection = projectBoardArtifactProjectionFromFiles(changed);

    const applied = store.applyProjectBoardArtifactProjection(workspacePath, projection);

    expect(applied.title).toBe("Pulled collaborator board");
    expect(applied.summary).toBe("Imported from Git.");
    expect(applied.cards).toHaveLength(1);
    expect(applied.cards[0]).toMatchObject({
      title: "Pulled implementation card",
      status: "ready",
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Pulled criteria survives import."],
    });
    expect(applied.sources[0]).toMatchObject({ summary: "Collaborator expanded the source summary." });
  });

  it("projects pulled Local Task run artifacts without duplicating local orchestration runs", () => {
    const board = seedBoard();
    const original = store.getProjectBoard(board.id)!;
    const linked = {
      ...original,
      cards: original.cards.map((card) => ({
        ...card,
        status: "review" as const,
        orchestrationTaskId: "task-1",
      })),
    };
    const projection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(linked, { runtime: sampleRuntime() }).files);

    const applied = store.applyProjectBoardArtifactProjection(workspacePath, projection);

    expect(applied.cards[0]).toMatchObject({ orchestrationTaskId: "task-1", status: "review" });
    expect(applied.executionArtifacts).toHaveLength(1);
    expect(applied.executionArtifacts?.[0]).toMatchObject({
      id: "run-1",
      cardId: applied.cards[0].id,
      status: "completed",
      source: "git",
      piSessionId: "sessions/card-1.json",
      workspaceBranch: "board/card-1",
      proof: {
        summary: "Implemented the shell and captured proof.",
        commands: ["pnpm test"],
        changedFiles: ["src/App.tsx"],
      },
      handoff: {
        summary: "Shell work is ready for review.",
        completed: ["Mounted the game canvas."],
        remaining: ["Implement movement."],
      },
    });
    expect(applied.events?.map((event) => event.kind)).toEqual(expect.arrayContaining(["card_run_completed", "card_run_handoff_created"]));
    expect(store.listOrchestrationBoard().runs).toEqual([]);
    expect(compareProjectBoardSummaryToArtifactProjection(applied, projection)).toEqual({ ok: true, differences: [] });
  });

  it("materializes pulled run handoff follow-ups as stable draft inbox candidates", () => {
    const board = seedBoard();
    const original = store.getProjectBoard(board.id)!;
    const linked = {
      ...original,
      cards: original.cards.map((card) => ({
        ...card,
        status: "review" as const,
        orchestrationTaskId: "task-1",
      })),
    };
    const projection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(linked, { runtime: sampleRuntimeWithFollowUp() }).files);

    const applied = store.applyProjectBoardArtifactProjection(workspacePath, projection);
    const followUps = applied.cards.filter((card) => card.sourceKind === "run_follow_up");

    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      title: "Add resize regression coverage",
      status: "draft",
      candidateStatus: "needs_clarification",
      sourceId: "run-1#follow-up:1",
      blockedBy: [applied.cards.find((card) => card.sourceKind !== "run_follow_up")!.id],
      labels: expect.arrayContaining(["run-follow-up", "pulled-handoff"]),
      acceptanceCriteria: expect.arrayContaining(["Resolve follow-up: Add resize regression coverage"]),
      testPlan: { manual: ["Review the pulled run handoff, confirm the follow-up scope, and attach proof before closing."] },
    });
    expect(applied.events?.map((event) => event.kind)).toEqual(expect.arrayContaining(["run_follow_up_created"]));

    const reapplied = store.applyProjectBoardArtifactProjection(workspacePath, projection);
    const reappliedFollowUps = reapplied.cards.filter((card) => card.sourceKind === "run_follow_up");
    expect(reappliedFollowUps.map((card) => card.id)).toEqual(followUps.map((card) => card.id));

    const exportedWithFollowUp = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(reapplied).files);
    const appliedExported = store.applyProjectBoardArtifactProjection(workspacePath, exportedWithFollowUp);
    expect(appliedExported.cards.filter((card) => card.sourceKind === "run_follow_up")).toHaveLength(1);
  });

  it("preserves user-edit protection fields across an export/apply round trip", () => {
    const board = seedBoard();
    const draft = store.getProjectBoard(board.id)!.cards.find((card) => card.status === "draft")!;
    store.updateProjectBoardCard({ cardId: draft.id, title: "Locally edited draft" });
    const edited = store.getProjectBoard(board.id)!;
    const editedCard = edited.cards.find((card) => card.id === draft.id)!;
    expect(editedCard.userTouchedFields).toContain("title");
    expect(editedCard.userTouchedAt).toBeTruthy();

    const projection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(edited).files);
    const applied = store.applyProjectBoardArtifactProjection(workspacePath, projection);
    const appliedCard = applied.cards.find((card) => card.id === draft.id)!;

    expect(appliedCard.title).toBe("Locally edited draft");
    expect(appliedCard.userTouchedFields).toContain("title");
    expect(appliedCard.userTouchedAt).toBe(editedCard.userTouchedAt);
  });

  it("leaves current SQLite board state untouched when a pulled projection fails validation", () => {
    const board = seedBoard();
    const original = store.getProjectBoard(board.id)!;
    const badFiles = mutateArtifactFile(projectBoardArtifactExportFromSummary(original).files, "cards/", (value) => ({
      ...value,
      blockedBy: ["missing-card"],
    }));

    expect(() => projectBoardArtifactProjectionFromFiles(badFiles)).toThrow(/missing dependency missing-card/);
    expect(store.getProjectBoard(board.id)?.cards[0]?.title).toBe(original.cards[0]?.title);
  });

  function seedBoard() {
    const board = store.createProjectBoard({ title: "Local board", summary: "Local summary" });
    store.replaceProjectBoardSources(board.id, [
      {
        kind: "functional_spec",
        title: "Starship GDD",
        summary: "PixiJS shell and hybrid controls.",
        excerpt: "The game starts with a PixiJS shell and hybrid Newtonian controls.",
        path: "GAME_DESIGN_DOCUMENT.md",
        relevance: 95,
      },
    ]);
    store.createProjectBoardManualCard({ boardId: board.id, title: "Local draft", description: "Local draft card." });
    return store.getProjectBoard(board.id)!;
  }
});

function sampleRuntime() {
  const now = "2026-05-04T12:00:00.000Z";
  return {
    tasks: [
      {
        id: "task-1",
        identifier: "LOCAL-1",
        title: "Local draft",
        state: "needs_review",
        priority: 1,
        labels: ["project-board"],
        blockedBy: [],
        branchName: "board/card-1",
        workspacePath: "/project/starship",
        sourceKind: "project_board_card",
        createdAt: now,
        updatedAt: now,
      },
    ],
    runs: [
      {
        id: "run-1",
        taskId: "task-1",
        attemptNumber: 1,
        status: "completed",
        workspacePath: "/project/starship",
        piSessionFile: "sessions/card-1.json",
        startedAt: now,
        lastEventAt: now,
        finishedAt: now,
        proofOfWork: {
          summary: "Implemented the shell and captured proof.",
          commands: ["pnpm test"],
          changedFiles: ["/project/starship/src/App.tsx"],
          handoff: {
            summary: "Shell work is ready for review.",
            completed: ["Mounted the game canvas."],
            remaining: ["Implement movement."],
            risks: [],
          },
        },
      },
    ],
  };
}

function sampleRuntimeWithFollowUp() {
  const runtime = sampleRuntime();
  return {
    ...runtime,
    runs: runtime.runs.map((run) => ({
      ...run,
      proofOfWork: {
        ...run.proofOfWork,
        handoff: {
          ...(run.proofOfWork.handoff as Record<string, unknown>),
          followUps: [
            {
              title: "Add resize regression coverage",
              reason: "Resize behavior was manually checked but needs an automated regression before downstream UI work depends on it.",
              blockedBy: [],
            },
          ],
        },
      },
    })),
  };
}

function mutateArtifactFile(
  files: ProjectBoardArtifactFile[],
  pathToken: string,
  mutate: (value: Record<string, unknown>) => Record<string, unknown>,
): ProjectBoardArtifactFile[] {
  let mutated = false;
  return files.map((file) => {
    if (mutated || !file.path.includes(pathToken) || !file.path.endsWith(".json")) return file;
    mutated = true;
    return { ...file, content: serializeBoardArtifact(mutate(JSON.parse(file.content) as Record<string, unknown>)) };
  });
}
