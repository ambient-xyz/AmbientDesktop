import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectBoardSummary } from "../../shared/types";
import { serializeBoardArtifact } from "./projectBoardArtifacts";
import { projectBoardArtifactExportFromSummary, writeProjectBoardArtifactExport, type ProjectBoardArtifactFile } from "./projectBoardArtifactExport";
import {
  compareProjectBoardSummaryToArtifactProjection,
  projectBoardArtifactProjectionWithResolvedConflicts,
  projectBoardArtifactProjectionFromFiles,
  readProjectBoardArtifactFiles,
} from "./projectBoardArtifactImport";

const now = "2026-05-04T12:00:00.000Z";
let tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots = [];
});

describe("project board artifact import", () => {
  it("ignores planner workspace scratch files when reading Git projection artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-board-import-"));
    tempRoots.push(root);
    const plannerRoot = join(root, ".ambient", "board", "planner-workspaces", "planner-1");
    await mkdir(plannerRoot, { recursive: true });
    await writeFile(join(plannerRoot, "manifest.json"), JSON.stringify({ kind: "scratch" }), "utf8");
    await writeFile(join(plannerRoot, "planner-ledger.json"), JSON.stringify({ records: [] }), "utf8");

    await expect(readProjectBoardArtifactFiles(root)).resolves.toEqual([]);
  });

  it("rebuilds a projection from exported artifact files", () => {
    const board = sampleBoard();
    const artifactExport = projectBoardArtifactExportFromSummary(board);
    const projection = projectBoardArtifactProjectionFromFiles(artifactExport.files);
    const diff = compareProjectBoardSummaryToArtifactProjection(board, projection);

    expect(diff).toEqual({ ok: true, differences: [] });
    expect(projection.config).toMatchObject({ boardId: "board-1", title: "Starship board" });
    expect(projection.cards.map((card) => card.cardId)).toEqual(["card-shell"]);
    expect(projection.cards[0].objectiveProvenance).toMatchObject({
      objective: "Add keyboard-accessible controls.",
      groundingMode: "source_scan",
      sourceRefCount: 1,
      weakGrounding: false,
    });
    expect(projection.proposalRuns.map((run) => run.proposalPathId)).toEqual(["proposal-1", "synthesis-run-1"]);
    expect(projection.proposalRuns.find((run) => run.proposalPathId === "proposal-1")?.candidateCards).toHaveLength(1);
    expect(projection.proposalRuns.find((run) => run.proposalPathId === "proposal-1")?.sourceCoverage).toEqual([
      expect.objectContaining({ sourceId: "source-gdd", status: "covered", cardIds: ["synthesis:shell"] }),
    ]);
    expect(projection.proposalRuns.find((run) => run.proposalPathId === "proposal-1")?.proposalFinals[0]).toMatchObject({
      summary: "Proposal summary",
      goal: "Build the MVP",
      qualityBar: "Proof required",
    });
    expect(projection.proposalRuns.find((run) => run.proposalPathId === "synthesis-run-1")?.progress[0]).toMatchObject({
      title: "Received Ambient/Pi response",
    });
    expect(projection.proposalRuns.find((run) => run.proposalPathId === "synthesis-run-1")?.candidateCards[0]).toMatchObject({
      sourceId: "synthesis:shell",
      title: "Create shell",
    });
    expect(projection.proposalRuns.find((run) => run.proposalPathId === "synthesis-run-1")?.plannerActions.map((action) => action.action)).toEqual([
      "candidate_card_created",
      "question_created",
      "source_coverage_reported",
    ]);
    expect(projection.proposalRuns.find((run) => run.proposalPathId === "synthesis-run-1")?.sourceCoverage[0]).toMatchObject({
      sourceId: "source-gdd",
      status: "covered",
    });
    expect(projection.runArtifacts).toEqual([]);
  });

  it("round-trips paused synthesis runs through proposal artifacts", () => {
    const board = sampleBoard();
    const pausedBoard: ProjectBoardSummary = {
      ...board,
      synthesisRuns: board.synthesisRuns?.map((run) => ({
        ...run,
        status: "paused" as const,
        stage: "paused" as const,
        error: undefined,
        events: [
          ...run.events,
          {
            stage: "paused" as const,
            title: "Planning paused",
            summary: "Planning paused after canceling the active Ambient/Pi stream.",
            metadata: {
              decision: "planning_paused",
              transportAbort: true,
              checkpointPolicy: "validated_progressive_records",
            },
            createdAt: now,
          },
        ],
      })),
    };

    const artifactExport = projectBoardArtifactExportFromSummary(pausedBoard);
    const projection = projectBoardArtifactProjectionFromFiles(artifactExport.files);
    const diff = compareProjectBoardSummaryToArtifactProjection(pausedBoard, projection);
    const pausedRun = projection.proposalRuns.find((run) => run.proposalPathId === "synthesis-run-1");

    expect(diff).toEqual({ ok: true, differences: [] });
    expect(pausedRun?.manifest).toMatchObject({ proposalRunId: "synthesis-run-1", status: "paused", stage: "paused" });
    expect(pausedRun?.progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "paused",
          title: "Planning paused",
          metadata: expect.objectContaining({ transportAbort: true }),
        }),
      ]),
    );
  });

  it("round-trips abandoned paused synthesis checkpoints through proposal artifacts", () => {
    const board = sampleBoard();
    const abandonedBoard: ProjectBoardSummary = {
      ...board,
      synthesisRuns: board.synthesisRuns?.map((run) => ({
        ...run,
        status: "abandoned" as const,
        stage: "paused" as const,
        error: undefined,
        events: [
          ...run.events,
          {
            stage: "paused" as const,
            title: "Paused planning abandoned",
            summary: "Start Fresh requested instead of resuming this paused checkpoint.",
            metadata: {
              decision: "abandon_paused_planning",
              checkpointPolicy: "start_fresh",
              retryable: false,
            },
            createdAt: now,
          },
        ],
      })),
    };

    const artifactExport = projectBoardArtifactExportFromSummary(abandonedBoard);
    const projection = projectBoardArtifactProjectionFromFiles(artifactExport.files);
    const diff = compareProjectBoardSummaryToArtifactProjection(abandonedBoard, projection);
    const abandonedRun = projection.proposalRuns.find((run) => run.proposalPathId === "synthesis-run-1");

    expect(diff).toEqual({ ok: true, differences: [] });
    expect(abandonedRun?.manifest).toMatchObject({ proposalRunId: "synthesis-run-1", status: "abandoned", stage: "paused" });
    expect(abandonedRun?.progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "paused",
          title: "Paused planning abandoned",
          metadata: expect.objectContaining({ decision: "abandon_paused_planning", checkpointPolicy: "start_fresh" }),
        }),
      ]),
    );
  });

  it("rebuilds Local Task run artifacts and compares them through export options", () => {
    const board = sampleBoard();
    const runtime = sampleRuntime();
    const artifactExport = projectBoardArtifactExportFromSummary(board, { runtime });
    const projection = projectBoardArtifactProjectionFromFiles(artifactExport.files);
    const diff = compareProjectBoardSummaryToArtifactProjection(board, projection, { runtime });

    expect(diff).toEqual({ ok: true, differences: [] });
    expect(projection.runArtifacts).toHaveLength(1);
    expect(projection.runArtifacts[0]).toMatchObject({
      runPathId: "run-shell-1",
      runId: "run-shell-1",
      manifest: { runId: "run-shell-1", cardId: "card-shell", status: "completed" },
      proof: { summary: "Created the shell and captured proof.", changedFiles: ["src/App.tsx"] },
      handoff: { summary: "Shell is complete and ready for controls.", remaining: ["Implement controls."] },
    });
    expect(projection.events.map((event) => event.type)).toEqual(expect.arrayContaining(["run.completed", "run.handoff_created"]));
  });

  it("reads a .ambient/board tree from disk and compares it to the current board summary", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-board-import-"));
    tempRoots.push(root);
    const board = sampleBoard();
    await writeProjectBoardArtifactExport(root, projectBoardArtifactExportFromSummary(board));

    const files = await readProjectBoardArtifactFiles(root);
    const projection = projectBoardArtifactProjectionFromFiles(files);
    const diff = compareProjectBoardSummaryToArtifactProjection(board, projection);

    expect(files.some((file) => file.path.endsWith("charter/active.md"))).toBe(false);
    expect(files.some((file) => file.path.endsWith("board.config.json"))).toBe(true);
    expect(diff.ok).toBe(true);
  });

  it("summarizes pulled card conflicts with apply, keep-local, and defer consequences", () => {
    const localBoard = {
      ...sampleBoard(),
      cards: sampleBoard().cards.map((card) =>
        card.id === "card-shell"
          ? {
              ...card,
              title: "Create shell with local debugging",
              status: "in_progress" as const,
              updatedAt: "2026-05-04T12:10:00.000Z",
            }
          : card,
      ),
    };
    const pulledBoard = {
      ...sampleBoard(),
      cards: sampleBoard().cards.map((card) =>
        card.id === "card-shell"
          ? {
              ...card,
              title: "Create shell from collaborator",
              status: "ready" as const,
              updatedAt: "2026-05-04T12:01:00.000Z",
            }
          : card,
      ),
    };
    const projection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(pulledBoard).files);

    const diff = compareProjectBoardSummaryToArtifactProjection(localBoard, projection);

    expect(diff.ok).toBe(false);
    expect(diff.conflictCount).toBe(1);
    expect(diff.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "card",
          action: "update",
          entityId: "card-shell",
          title: "Create shell from collaborator",
          conflict: true,
          recommendedResolution: "manual_resolution_required",
          conflictReason: expect.stringContaining("in_progress"),
          changedFields: expect.arrayContaining(["title", "status", "updatedAt"]),
          applyConsequence: expect.stringContaining("Replace"),
          keepLocalConsequence: expect.stringContaining("exporting/committing"),
          deferConsequence: expect.stringContaining("unchanged"),
        }),
      ]),
    );
  });

  it("can overlay local cards for explicitly kept pulled-card conflicts", () => {
    const localBoard = {
      ...sampleBoard(),
      cards: sampleBoard().cards.map((card) =>
        card.id === "card-shell"
          ? {
              ...card,
              title: "Create shell with local debugging",
              status: "in_progress" as const,
              updatedAt: "2026-05-04T12:10:00.000Z",
            }
          : card,
      ),
    };
    const pulledBoard = {
      ...sampleBoard(),
      cards: sampleBoard().cards.map((card) =>
        card.id === "card-shell"
          ? {
              ...card,
              title: "Create shell from collaborator",
              status: "ready" as const,
              updatedAt: "2026-05-04T12:01:00.000Z",
            }
          : card,
      ),
    };
    const projection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(pulledBoard).files);
    const diff = compareProjectBoardSummaryToArtifactProjection(localBoard, projection);
    const conflict = diff.changes?.find((change) => change.conflict);

    const resolved = projectBoardArtifactProjectionWithResolvedConflicts(localBoard, projection, [
      { changeId: conflict?.id, entityId: "card-shell", resolution: "keep_local" },
    ]);

    expect(resolved.unresolvedConflicts).toEqual([]);
    expect(resolved.localOverlayCount).toBe(1);
    expect(resolved.projection.cards.find((card) => card.cardId === "card-shell")).toMatchObject({
      title: "Create shell with local debugging",
      status: "in_progress",
    });
    expect(resolved.diff.conflictCount ?? 0).toBe(0);
  });

  it("adds actionable pull-review details for source, event, and runtime artifacts", () => {
    const localRuntime = sampleRuntime();
    const pulledRuntime = {
      ...sampleRuntime(),
      runs: sampleRuntime().runs.map((run) => ({
        ...run,
        proofOfWork: {
          ...run.proofOfWork,
          summary: "Collaborator captured new shell proof.",
          taskToolActions: [
            {
              actionId: "collab-heartbeat",
              action: "task_heartbeat",
              createdAt: "2026-05-04T12:22:00.000Z",
              summary: "Collaborator started shell proof and resize verification.",
              completed: [],
              remaining: ["Capture proof and hand off controls."],
            },
          ],
        },
      })),
    };
    const pulledBoard = {
      ...sampleBoard(),
      sources: sampleBoard().sources.map((source) => ({
        ...source,
        summary: "Updated GDD summary from collaborator.",
        updatedAt: "2026-05-04T12:20:00.000Z",
      })),
      events: sampleBoard().events?.map((event) => ({
        ...event,
        summary: "Collaborator updated board history.",
      })),
    };
    const projection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(pulledBoard, { runtime: pulledRuntime }).files);

    const diff = compareProjectBoardSummaryToArtifactProjection(sampleBoard(), projection, { runtime: localRuntime });

    expect(diff.ok).toBe(false);
    expect(diff.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "source",
          title: expect.stringContaining("Source snapshot"),
          summary: expect.stringContaining("source corpus snapshot"),
          applyConsequence: expect.stringContaining("source review"),
          keepLocalConsequence: expect.stringContaining("source corpus"),
          deferConsequence: expect.stringContaining("source review corpus"),
        }),
        expect.objectContaining({
          kind: "event",
          title: expect.stringContaining("event"),
          summary: expect.stringContaining("audit/history event"),
          applyConsequence: expect.stringContaining("board history"),
          keepLocalConsequence: expect.stringContaining("local board history"),
        }),
        expect.objectContaining({
          kind: "event",
          title: "task_heartbeat task action",
          summary: expect.stringContaining("Pi worker task action task_heartbeat"),
          applyConsequence: expect.stringContaining("collaborator heartbeats"),
          deferConsequence: expect.stringContaining("progress/proof audit"),
        }),
        expect.objectContaining({
          kind: "runtime",
          title: "Run artifact run-shell-1",
          summary: expect.stringContaining("execution proof/handoff"),
          applyConsequence: expect.stringContaining("downstream dependency readiness"),
          deferConsequence: expect.stringContaining("proof/handoff"),
        }),
      ]),
    );
  });

  it("fails clearly when the board config artifact is missing", () => {
    const files = projectBoardArtifactExportFromSummary(sampleBoard()).files.filter((file) => !file.path.endsWith("board.config.json"));

    expect(() => projectBoardArtifactProjectionFromFiles(files)).toThrow(/\.ambient\/board\/board\.config\.json is required/);
  });

  it("rejects corrupt recognized artifacts before producing a projection", () => {
    const files = mutateArtifactFile(projectBoardArtifactExportFromSummary(sampleBoard()).files, "cards/card-shell.json", (value) => ({
      ...value,
      blockedBy: ["missing-card"],
    }));

    expect(() => projectBoardArtifactProjectionFromFiles(files)).toThrow(/card card-shell has missing dependency missing-card/);
  });

  it("rejects proposal artifacts that belong to another board", () => {
    const files = mutateArtifactFile(projectBoardArtifactExportFromSummary(sampleBoard()).files, "proposals/proposal-1/proposal.final.json", (value) => ({
      ...value,
      boardId: "other-board",
    }));

    expect(() => projectBoardArtifactProjectionFromFiles(files)).toThrow(/proposal run proposal-1 final proposal belongs to board other-board/);
  });

  it("rejects run artifacts that belong to another board", () => {
    const files = mutateArtifactFile(projectBoardArtifactExportFromSummary(sampleBoard(), { runtime: sampleRuntime() }).files, "runs/run-shell-1/proof.json", (value) => ({
      ...value,
      boardId: "other-board",
    }));

    expect(() => projectBoardArtifactProjectionFromFiles(files)).toThrow(/run run-shell-1 proof belongs to board other-board/);
  });
});

function mutateArtifactFile(
  files: ProjectBoardArtifactFile[],
  pathSuffix: string,
  mutate: (value: Record<string, unknown>) => Record<string, unknown>,
): ProjectBoardArtifactFile[] {
  return files.map((file) => {
    if (!file.path.endsWith(pathSuffix)) return file;
    return { ...file, content: serializeBoardArtifact(mutate(JSON.parse(file.content) as Record<string, unknown>)) };
  });
}

function sampleRuntime() {
  return {
    tasks: [
      {
        id: "task-1",
        identifier: "LOCAL-1",
        title: "Create shell",
        state: "needs_review",
        priority: 1,
        labels: ["foundation"],
        blockedBy: [],
        branchName: "board/card-shell",
        workspacePath: "/project/starship",
        sourceKind: "project_board_card",
        createdAt: now,
        updatedAt: now,
      },
    ],
    runs: [
      {
        id: "run-shell-1",
        taskId: "task-1",
        attemptNumber: 1,
        status: "completed",
        workspacePath: "/project/starship",
        threadId: "thread-run-1",
        piSessionFile: "sessions/card-shell.json",
        startedAt: now,
        lastEventAt: now,
        finishedAt: now,
        proofOfWork: {
          summary: "Created the shell and captured proof.",
          commands: ["pnpm test"],
          changedFiles: ["/project/starship/src/App.tsx"],
          handoff: {
            summary: "Shell is complete and ready for controls.",
            completed: ["Mounted PixiJS canvas."],
            remaining: ["Implement controls."],
            risks: [],
          },
        },
      },
    ],
  };
}

function sampleBoard(): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath: "/project/starship",
    status: "active",
    title: "Starship board",
    summary: "Dogfood board",
    charterId: "charter-1",
    charter: {
      id: "charter-1",
      boardId: "board-1",
      version: 1,
      status: "active",
      goal: "Build the MVP slice.",
      currentState: "The design doc exists.",
      targetUser: "Arcade space-game players.",
      nonGoals: [],
      qualityBar: "Proof every card.",
      testPolicy: {},
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "# Starship board\n",
      createdAt: now,
      updatedAt: now,
    },
    cards: [
      {
        id: "card-shell",
        boardId: "board-1",
        title: "Create shell",
        description: "Create the PixiJS shell.",
        status: "ready",
        candidateStatus: "ready_to_create",
        priority: 1,
        phase: "Foundation",
        labels: ["foundation"],
        blockedBy: [],
        acceptanceCriteria: ["Canvas mounts."],
        testPlan: { unit: [], integration: ["Run the app."], visual: ["Screenshot."], manual: [] },
        sourceKind: "board_synthesis",
        sourceId: "synthesis:shell",
        sourceThreadId: "thread-1",
        orchestrationTaskId: "task-1",
        executionSessionPolicy: "reuse_card_session",
        objectiveProvenance: {
          objective: "Add keyboard-accessible controls.",
          groundingMode: "source_scan",
          selectedSourceIds: [],
          sourceRefCount: 1,
          weakGrounding: false,
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    sources: [
      {
        id: "source-gdd",
        boardId: "board-1",
        kind: "functional_spec",
        title: "Game Design Document",
        summary: "Hybrid Newtonian movement and PixiJS shell.",
        excerpt: "The game uses PixiJS and hybrid Newtonian movement.",
        path: "GAME_DESIGN_DOCUMENT.md",
        threadId: "thread-1",
        relevance: 95,
        createdAt: now,
        updatedAt: now,
      },
    ],
    questions: [],
    proposals: [
      {
        id: "proposal-1",
        boardId: "board-1",
        status: "pending",
        summary: "Proposal summary",
        goal: "Build the MVP",
        currentState: "Design exists",
        targetUser: "Players",
        qualityBar: "Proof required",
        assumptions: [],
        questions: ["Should controls be Newtonian?"],
        answers: [],
        sourceNotes: ["GDD mentions PixiJS."],
        cards: [
          {
            sourceId: "synthesis:shell",
            title: "Create shell",
            description: "Create the shell.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["foundation"],
            blockedBy: [],
            acceptanceCriteria: ["Canvas mounts."],
            testPlan: { unit: [], integration: ["Run the app."], visual: ["Screenshot."], manual: [] },
            sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
            reviewStatus: "pending",
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    synthesisRuns: [
      {
        id: "synthesis-run-1",
        boardId: "board-1",
        proposalId: "proposal-1",
        status: "succeeded",
        stage: "proposal_created",
        model: "ambient-test",
        sourceCount: 1,
        includedSourceCount: 1,
        sourceCharCount: 48,
        promptCharCount: 1000,
        responseCharCount: 2000,
        cardCount: 1,
        questionCount: 1,
        warningCount: 0,
        progressiveRecordCount: 3,
        progressiveSummary: {
          recordCount: 3,
          candidateCardCount: 1,
          questionCount: 1,
          sourceCoverageCount: 1,
          dependencyEdgeCount: 0,
          warningCount: 0,
          errorCount: 0,
          latestCandidateCardTitle: "Create shell",
          latestQuestion: "Should controls be Newtonian?",
        },
        progressiveRecords: [
          {
            type: "candidate_card",
            sourceId: "synthesis:shell",
            title: "Create shell",
            description: "Create the shell.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["foundation"],
            blockedBy: [],
            sourceRefs: [{ sourceId: "source-gdd", path: "GAME_DESIGN_DOCUMENT.md" }],
            acceptanceCriteria: ["Canvas mounts."],
            testPlan: { unit: [], integration: ["Run the app."], visual: ["Screenshot."], manual: [] },
          },
          {
            type: "question",
            questionId: "question:controls",
            question: "Should controls be Newtonian?",
            required: true,
            createdAt: now,
          },
          {
            type: "source_coverage",
            sourceId: "source-gdd",
            status: "covered",
            cardIds: ["synthesis:shell"],
            updatedAt: now,
          },
        ],
        events: [
          {
            stage: "model_response",
            title: "Received Ambient/Pi response",
            summary: "Received 2,000 chars.",
            metadata: { responseCharCount: 2000 },
            createdAt: now,
          },
        ],
        startedAt: now,
        updatedAt: now,
        completedAt: now,
      },
    ],
    events: [
      {
        id: "evt-board-created",
        boardId: "board-1",
        kind: "board_created",
        title: "Board created",
        summary: "Created board.",
        entityKind: "board",
        entityId: "board-1",
        metadata: {},
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
