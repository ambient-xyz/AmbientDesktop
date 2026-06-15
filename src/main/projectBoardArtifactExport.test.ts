import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectBoardSummary } from "../shared/types";
import {
  PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
  cardArtifactSchema,
  parseBoardArtifactJson,
  proposalManifestArtifactSchema,
  runHandoffArtifactSchema,
  runManifestArtifactSchema,
  runProofArtifactSchema,
  validateProjectBoardArtifactSet,
} from "./projectBoardArtifacts";
import { projectBoardArtifactExportFromSummary, writeProjectBoardArtifactExport } from "./projectBoardArtifactExport";

const now = "2026-05-04T12:00:00.000Z";
let tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots = [];
});

describe("project board artifact export", () => {
  it("exports current ProjectStore board state into a valid .ambient/board artifact tree", () => {
    const board = sampleBoard();
    const artifactExport = projectBoardArtifactExportFromSummary(board, { projectName: "Starship Dogfood", exportedAt: now });

    validateProjectBoardArtifactSet({
      config: artifactExport.config,
      charter: artifactExport.charter,
      sourceSnapshots: [artifactExport.sourceSnapshot],
      sourceClassifications: artifactExport.sourceClassifications,
      cards: artifactExport.cards,
      events: artifactExport.events,
    });

    expect(artifactExport.files.map((file) => file.path)).toEqual([
      ".ambient/board/board.config.json",
      ".ambient/board/cards/card-controls.json",
      ".ambient/board/cards/card-shell.json",
      ".ambient/board/charter/active.json",
      ".ambient/board/charter/active.md",
      ".ambient/board/events/2026/05/04/20260504T120000000Z-evt-board-created.json",
      ".ambient/board/events/2026/05/04/20260504T120000000Z-evt-ready-tasks.json",
      ".ambient/board/proposals/proposal-1/cards.partial.jsonl",
      ".ambient/board/proposals/proposal-1/dependency-edges.jsonl",
      ".ambient/board/proposals/proposal-1/proposal-final.jsonl",
      ".ambient/board/proposals/proposal-1/proposal.final.json",
      ".ambient/board/proposals/proposal-1/questions.jsonl",
      ".ambient/board/proposals/proposal-1/source-coverage.jsonl",
      ".ambient/board/proposals/proposal-1/warnings.jsonl",
      ".ambient/board/proposals/synthesis-run-1/cards.partial.jsonl",
      ".ambient/board/proposals/synthesis-run-1/dependency-edges.jsonl",
      ".ambient/board/proposals/synthesis-run-1/errors.jsonl",
      ".ambient/board/proposals/synthesis-run-1/manifest.json",
      ".ambient/board/proposals/synthesis-run-1/planner-actions.jsonl",
      ".ambient/board/proposals/synthesis-run-1/progress.jsonl",
      ".ambient/board/proposals/synthesis-run-1/questions.jsonl",
      ".ambient/board/proposals/synthesis-run-1/source-coverage.jsonl",
      ".ambient/board/proposals/synthesis-run-1/warnings.jsonl",
      ".ambient/board/sources/classifications/source-gdd.json",
      ".ambient/board/sources/snapshots/current.json",
    ]);
    expect(artifactExport.cards.find((card) => card.cardId === "card-controls")).toMatchObject({
      blockedBy: ["card-shell"],
      unresolvedBlockers: ["External art direction"],
    });
    expect(artifactExport.cards.find((card) => card.cardId === "card-shell")?.objectiveProvenance).toMatchObject({
      objective: "Add keyboard-accessible controls.",
      groundingMode: "source_scan",
      sourceRefCount: 1,
      weakGrounding: false,
    });
    expect(artifactExport.sourceClassifications[0]).toMatchObject({
      sourceId: "source-gdd",
      classifiedBy: "fallback_heuristic",
      effectiveKind: "functional_spec",
    });
    expect(artifactExport.charter?.projectSummary).toMatchObject({
      summary: "Build the MVP slice with a PixiJS shell and controls.",
      majorSystems: ["Shell", "Controls"],
      generator: "fallback_heuristic",
    });
  });

  it("writes deterministic files without touching git or runtime state", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-board-export-"));
    tempRoots.push(root);
    const artifactExport = projectBoardArtifactExportFromSummary(sampleBoard());

    await writeProjectBoardArtifactExport(root, artifactExport);

    const config = JSON.parse(await readFile(join(root, ".ambient/board/board.config.json"), "utf8"));
    expect(config).toMatchObject({ boardId: "board-1", title: "Starship board" });
    const card = parseBoardArtifactJson(
      await readFile(join(root, ".ambient/board/cards/card-shell.json"), "utf8"),
      cardArtifactSchema,
      "exported card",
    );
    expect(card.sourceRefs).toEqual([{ note: "Matched by source thread.", path: "GAME_DESIGN_DOCUMENT.md", sourceId: "source-gdd" }]);
    expect(card.objectiveProvenance).toMatchObject({
      objective: "Add keyboard-accessible controls.",
      groundingMode: "source_scan",
    });
    const manifest = parseBoardArtifactJson(
      await readFile(join(root, ".ambient/board/proposals/synthesis-run-1/manifest.json"), "utf8"),
      proposalManifestArtifactSchema,
      "exported manifest",
    );
    expect(manifest).toMatchObject({ proposalRunId: "synthesis-run-1", status: "succeeded", stage: "completed" });
  });

  it("exports parent split outcomes with card artifacts", () => {
    const board = sampleBoard();
    board.cards[0].splitOutcome = {
      status: "proposed",
      source: "runtime_budget",
      sourceRunId: "run-shell-1",
      reason: "Runtime budget exceeded after 90s.",
      partialProofSummary: "Created the shell before timeout.",
      completedCriteria: ["Canvas mounts."],
      remainingCriteria: ["Capture screenshot."],
      childCardIds: ["card-controls"],
      maxRuntimeMs: 90_000,
      elapsedMs: 95_000,
      createdAt: now,
      updatedAt: now,
    };

    const artifactExport = projectBoardArtifactExportFromSummary(board);

    expect(artifactExport.cards.find((card) => card.cardId === "card-shell")?.splitOutcome).toMatchObject({
      source: "runtime_budget",
      sourceRunId: "run-shell-1",
      childCardIds: ["card-controls"],
    });
  });

  it("exports Local Task run manifests, proof, handoffs, and lifecycle events when runtime state is provided", () => {
    const artifactExport = projectBoardArtifactExportFromSummary(sampleBoard(), { runtime: sampleRuntime(), exportedAt: now });

    expect(artifactExport.files.map((file) => file.path).filter((path) => path.includes("/runs/"))).toEqual([
      ".ambient/board/runs/run-shell-1/handoff.json",
      ".ambient/board/runs/run-shell-1/manifest.json",
      ".ambient/board/runs/run-shell-1/proof.json",
    ]);
    expect(artifactExport.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["board.created", "board.ready_tasks_created", "run.completed", "run.handoff_created"]),
    );

    const manifest = parseBoardArtifactJson(
      artifactExport.files.find((file) => file.path.endsWith("runs/run-shell-1/manifest.json"))!.content,
      runManifestArtifactSchema,
      "run manifest",
    );
    const proof = parseBoardArtifactJson(
      artifactExport.files.find((file) => file.path.endsWith("runs/run-shell-1/proof.json"))!.content,
      runProofArtifactSchema,
      "run proof",
    );
    const handoff = parseBoardArtifactJson(
      artifactExport.files.find((file) => file.path.endsWith("runs/run-shell-1/handoff.json"))!.content,
      runHandoffArtifactSchema,
      "run handoff",
    );

    expect(manifest).toMatchObject({
      runId: "run-shell-1",
      boardId: "board-1",
      cardId: "card-shell",
      status: "completed",
      workspaceBranch: "board/card-shell",
      piSessionId: "sessions/card-shell.json",
    });
    expect(proof).toMatchObject({
      summary: "Created the shell and captured proof.",
      commands: ["pnpm test", "pnpm run test:visual"],
      changedFiles: ["src/App.tsx", "src/game/shell.ts"],
      screenshots: ["test-results/shell.png"],
    });
    expect(handoff).toMatchObject({
      summary: "Shell is complete and ready for controls.",
      completed: ["Mounted PixiJS canvas."],
      remaining: ["Implement ship controls."],
      followUps: [{ title: "Tighten starfield resize proof", reason: "Resize proof was manual.", blockedBy: ["card-shell"] }],
    });
  });

  it("exports model-facing task tool actions as durable progress, proof, handoff, and follow-up artifacts", () => {
    const artifactExport = projectBoardArtifactExportFromSummary(sampleBoard(), { runtime: sampleTaskToolRuntime(), exportedAt: now });

    expect(artifactExport.events.map((event) => [event.type, event.payload.action])).toEqual(
      expect.arrayContaining([
        ["run.progress", "task_heartbeat"],
        ["run.progress", "task_report_proof"],
        ["card.followup_created", "task_create_followup"],
        ["run.handoff_created", "task_report_handoff"],
        ["run.completed", "task_complete"],
      ]),
    );

    const proof = parseBoardArtifactJson(
      artifactExport.files.find((file) => file.path.endsWith("runs/run-tool-1/proof.json"))!.content,
      runProofArtifactSchema,
      "run proof",
    );
    const handoff = parseBoardArtifactJson(
      artifactExport.files.find((file) => file.path.endsWith("runs/run-tool-1/handoff.json"))!.content,
      runHandoffArtifactSchema,
      "run handoff",
    );

    expect(proof).toMatchObject({
      summary: "Shell proof passed.",
      commands: ["pnpm test"],
      changedFiles: ["src/App.tsx"],
      screenshots: ["test-results/shell.png"],
      manualChecks: ["Opened the game locally."],
    });
    expect(handoff).toMatchObject({
      summary: "Shell is ready for controls.",
      completed: ["Mounted shell.", "Recorded final handoff."],
      remaining: ["Collect proof.", "Controls can start."],
      risks: ["Resize proof is still thin."],
      followUps: expect.arrayContaining([
        { title: "Add resize stress test", reason: "Resize proof was manual-only.", blockedBy: ["card-shell"] },
        { title: "Tune renderer lifecycle proof", reason: "Lifecycle proof should cover cleanup.", blockedBy: [] },
      ]),
    });
  });
});

function sampleRuntime() {
  return {
    tasks: [
      {
        id: "task-1",
        identifier: "LOCAL-1",
        title: "Create shell",
        description: "Create the PixiJS shell.",
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
          commands: ["pnpm test", { command: "pnpm run test:visual" }],
          changedFiles: ["/project/starship/src/App.tsx", "src/game/shell.ts"],
          screenshots: ["/project/starship/test-results/shell.png"],
          visualChecks: [{ name: "canvas", status: "passed" }],
          manualChecks: ["Resized the window."],
          handoff: {
            summary: "Shell is complete and ready for controls.",
            completed: ["Mounted PixiJS canvas."],
            remaining: ["Implement ship controls."],
            risks: [],
            followUps: [{ title: "Tighten starfield resize proof", reason: "Resize proof was manual.", blockedBy: ["card-shell"] }],
          },
        },
      },
    ],
  };
}

function sampleTaskToolRuntime() {
  return {
    tasks: [
      {
        id: "task-1",
        identifier: "LOCAL-1",
        title: "Create shell",
        description: "Create the PixiJS shell.",
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
        id: "run-tool-1",
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
          taskToolActions: [
            {
              actionId: "action-heartbeat",
              action: "task_heartbeat",
              createdAt: now,
              summary: "Shell scaffold is mounted.",
              completed: ["Mounted shell."],
              remaining: ["Collect proof."],
            },
            {
              actionId: "action-proof",
              action: "task_report_proof",
              createdAt: now,
              summary: "Shell proof passed.",
              commands: ["pnpm test"],
              changedFiles: ["/project/starship/src/App.tsx"],
              screenshots: ["/project/starship/test-results/shell.png"],
              manualChecks: ["Opened the game locally."],
            },
            {
              actionId: "action-follow-up",
              action: "task_create_followup",
              createdAt: now,
              title: "Add resize stress test",
              reason: "Resize proof was manual-only.",
              blockedBy: ["card-shell"],
            },
            {
              actionId: "action-complete",
              action: "task_complete",
              createdAt: now,
              summary: "Shell proof passed.",
              commands: [],
              completed: [],
              remaining: [],
              risks: [],
            },
            {
              actionId: "action-handoff",
              action: "task_report_handoff",
              createdAt: now,
              summary: "Shell is ready for controls.",
              completed: ["Recorded final handoff."],
              remaining: ["Controls can start."],
              risks: ["Resize proof is still thin."],
              followUps: [{ title: "Tune renderer lifecycle proof", reason: "Lifecycle proof should cover cleanup.", blockedBy: [] }],
            },
          ],
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
      projectSummary: {
        summary: "Build the MVP slice with a PixiJS shell and controls.",
        majorSystems: ["Shell", "Controls"],
        sourceCoverage: ["Game design document - functional_spec - primary authority"],
        risks: ["Controls require art direction."],
        dependencyHints: ["Create shell before controls."],
        unresolvedDecisions: ["Confirm input feel."],
        citations: ["GAME_DESIGN_DOCUMENT.md"],
        coverageGaps: [],
        sourceChecksumSet: ["source-gdd:aaaaaaaa"],
        charterAnswerChecksum: "bbbbbbbb",
        generatedAt: now,
        generator: "fallback_heuristic",
      },
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
      {
        id: "card-controls",
        boardId: "board-1",
        title: "Implement controls",
        description: "Implement the ship controls.",
        status: "draft",
        candidateStatus: "needs_clarification",
        priority: 2,
        phase: "Core Gameplay",
        labels: ["controls"],
        blockedBy: ["synthesis:shell", "External art direction"],
        acceptanceCriteria: ["Ship responds to input."],
        testPlan: { unit: ["Movement reducer tests."], integration: [], visual: [], manual: ["Try keyboard controls."] },
        sourceKind: "board_synthesis",
        sourceId: "synthesis:controls#split:1",
        sourceThreadId: "thread-1",
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
      {
        id: "evt-ready-tasks",
        boardId: "board-1",
        kind: "ready_tasks_created",
        title: "Ready tasks created",
        summary: "Created one task.",
        entityKind: "card",
        entityId: "card-shell",
        metadata: { cardIds: ["card-shell"] },
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
