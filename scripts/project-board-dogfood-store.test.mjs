import { describe, expect, it } from "vitest";
import {
  hasProjectBoardPlanningShape,
  isSourceRefreshOnlySynthesisRun,
  latestPlanningSynthesisRunForBoard,
  latestSynthesisRunForBoard,
  planningStartIntentForBoard,
  projectBoardIncrementalSynthesisSnapshot,
  readOrchestrationBoardSnapshot,
  readOrchestrationRunSnapshot,
  readProjectBoardSnapshot,
  readyPendingProjectBoardProposal,
  runningPlanningSynthesisRunForBoard,
  runningSynthesisRunForBoard,
  sqlString,
} from "./project-board-dogfood-store.mjs";

describe("project-board dogfood store readers", () => {
  it("reads board, proposal, and proof-review state without renderer IPC", async () => {
    const projectRoot = "/tmp/ambient project";
    const calls = [];
    const runCommand = async (command, args, cwd) => {
      calls.push({ command, args, cwd });
      const sql = args.at(-1);
      if (sql.includes("from project_boards")) {
        return {
          stdout: JSON.stringify([
            {
              id: "board-1",
              projectPath: projectRoot,
              status: "active",
              title: "Starship board",
              summary: "Ready.",
              charterId: "charter-1",
              activeDraftId: null,
              createdAt: "2026-05-05T00:00:00.000Z",
              updatedAt: "2026-05-05T00:01:00.000Z",
            },
          ]),
          stderr: "",
        };
      }
      if (sql.includes("from project_board_cards")) {
        return {
          stdout: JSON.stringify([
            {
              id: "card-1",
              boardId: "board-1",
              title: "Create game shell",
              description: "Render a nonblank canvas.",
              status: "review",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labelsJson: JSON.stringify(["webgl"]),
              blockedByJson: "[]",
              acceptanceCriteriaJson: JSON.stringify(["Canvas is nonblank."]),
              testPlanJson: JSON.stringify({ unit: [], integration: ["Run app."], visual: ["Screenshot."], manual: [] }),
              clarificationQuestionsJson: JSON.stringify(["What renderer proof is required?"]),
              sourceKind: "project_board_synthesis",
              sourceId: "synthesis:shell",
              sourceThreadId: null,
              sourceMessageId: null,
              orchestrationTaskId: "task-1",
              executionThreadId: null,
              executionSessionPolicy: "reuse_card_session",
              proofReviewJson: JSON.stringify({ status: "ready_for_review", reviewer: "ambient_pi", confidence: 0.81 }),
              splitOutcomeJson: JSON.stringify({ status: "proposed", source: "runtime_budget", childCardIds: ["card-2"] }),
              createdAt: "2026-05-05T00:00:00.000Z",
              updatedAt: "2026-05-05T00:02:00.000Z",
            },
          ]),
          stderr: "",
        };
      }
      if (sql.includes("from project_board_sources")) {
        return { stdout: JSON.stringify([{ id: "source-1", boardId: "board-1", sourceKind: "markdown", title: "GDD", summary: "Spec.", path: "GDD.md", relevance: 99, includeInSynthesis: 1 }]), stderr: "" };
      }
      if (sql.includes("from project_board_questions")) {
        return { stdout: JSON.stringify([{ id: "q-1", boardId: "board-1", questionOrder: 0, question: "Goal?", required: 1, answer: "MVP", createdAt: "t", updatedAt: "t" }]), stderr: "" };
      }
      if (sql.includes("from project_board_synthesis_proposals")) {
        return {
          stdout: JSON.stringify([
            {
              id: "proposal-1",
              boardId: "board-1",
              status: "pending",
              summary: "Proposal.",
              goal: "MVP.",
              currentState: "",
              targetUser: "",
              qualityBar: "",
              assumptionsJson: "[]",
              questionsJson: JSON.stringify(["Controls?"]),
              answersJson: "[]",
              sourceNotesJson: "[]",
              cardsJson: JSON.stringify([{ sourceId: "synthesis:shell", title: "Create game shell", acceptanceCriteria: ["Canvas is nonblank."], testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] }, blockedBy: [] }]),
              model: "zai-org/GLM-5.1-FP8",
              durationMs: 1234,
              createdAt: "t",
              updatedAt: "t",
              appliedAt: null,
            },
          ]),
          stderr: "",
        };
      }
      if (sql.includes("from project_board_synthesis_runs")) {
        return { stdout: JSON.stringify([{ id: "run-1", boardId: "board-1", status: "running", stage: "model_response", sourceCount: 1, includedSourceCount: 1, sourceCharCount: 500, warningCount: 0, eventsJson: "[]", progressiveRecordsJson: "[]", startedAt: "t", updatedAt: "t" }]), stderr: "" };
      }
      return { stdout: "[]", stderr: "" };
    };

    const board = await readProjectBoardSnapshot(projectRoot, { runCommand });

    expect(board.status).toBe("active");
    expect(board.cards[0]).toMatchObject({
      id: "card-1",
      labels: ["webgl"],
      proofReview: { status: "ready_for_review", reviewer: "ambient_pi", confidence: 0.81 },
      splitOutcome: { status: "proposed", source: "runtime_budget", childCardIds: ["card-2"] },
      testPlan: { integration: ["Run app."], visual: ["Screenshot."] },
      clarificationQuestions: ["What renderer proof is required?"],
    });
    expect(board.sources[0].path).toBe("GDD.md");
    expect(board.questions[0]).toMatchObject({ question: "Goal?", answer: "MVP" });
    expect(board.proposals[0]).toMatchObject({ id: "proposal-1", cards: [{ title: "Create game shell" }] });
    expect(board.synthesisRuns[0]).toMatchObject({ id: "run-1", stage: "model_response", progressiveRecordCount: 0, eventCount: 0 });
    expect(calls.every((call) => call.command === "sqlite3" && call.cwd === projectRoot)).toBe(true);
    expect(calls.find((call) => call.args.at(-1).includes("from project_board_synthesis_runs"))?.args.at(-1)).toContain("0 as progressiveRecordCount");
    expect(calls.find((call) => call.args.at(-1).includes("from project_board_synthesis_runs"))?.args.at(-1)).toContain("null as eventsJson");
    expect(calls.find((call) => call.args.at(-1).includes("from project_board_synthesis_runs"))?.args.at(-1)).toContain("json_array_length(events_json)");
    expect(calls.find((call) => call.args.at(-1).includes("from project_board_synthesis_runs"))?.args.at(-1)).not.toContain("progressive_records_json as progressiveRecordsJson");
    expect(calls.find((call) => call.args.at(-1).includes("from project_board_synthesis_runs"))?.args.at(-1)).not.toContain("json_array_length(progressive_records_json)");
    expect(calls.find((call) => call.args.at(-1).includes("from project_board_synthesis_runs"))?.args.at(-1)).not.toContain("events_json as eventsJson");
  });

  it("can opt into full synthesis event payloads for narrow diagnostics", async () => {
    const projectRoot = "/tmp/ambient project";
    const calls = [];
    const runCommand = async (_command, args) => {
      calls.push(args.at(-1));
      const sql = args.at(-1);
      if (sql.includes("from project_boards")) {
        return {
          stdout: JSON.stringify([{ id: "board-1", projectPath: projectRoot, status: "active", title: "Board", createdAt: "t", updatedAt: "t" }]),
          stderr: "",
        };
      }
      if (sql.includes("from project_board_synthesis_runs")) {
        return {
          stdout: JSON.stringify([
            {
              id: "run-1",
              boardId: "board-1",
              status: "running",
              stage: "model_response",
              eventsJson: JSON.stringify([{ title: "Started" }, { title: "Streamed" }]),
              eventCount: 2,
              progressiveRecordCount: 5,
              startedAt: "t",
              updatedAt: "t",
            },
          ]),
          stderr: "",
        };
      }
      return { stdout: "[]", stderr: "" };
    };

    const board = await readProjectBoardSnapshot(projectRoot, {
      runCommand,
      includeProgressiveRecordCount: true,
      includeSynthesisEvents: true,
    });

    expect(board.synthesisRuns[0]).toMatchObject({
      eventCount: 2,
      events: [{ title: "Started" }, { title: "Streamed" }],
      progressiveRecordCount: 5,
    });
    const synthesisSql = calls.find((sql) => sql.includes("from project_board_synthesis_runs"));
    expect(synthesisSql).toContain("events_json as eventsJson");
    expect(synthesisSql).toContain("json_array_length(progressive_records_json)");
  });

  it("can opt into proof-scope warning rows without selecting full progressive records", async () => {
    const projectRoot = "/tmp/ambient project";
    const calls = [];
    const runCommand = async (_command, args) => {
      const sql = args.at(-1);
      calls.push(sql);
      if (sql.includes("from project_boards")) {
        return {
          stdout: JSON.stringify([{ id: "board-1", projectPath: projectRoot, status: "active", title: "Board", createdAt: "t", updatedAt: "t" }]),
          stderr: "",
        };
      }
      if (sql.includes("json_each(coalesce(runs.progressive_records_json")) {
        return {
          stdout: JSON.stringify([
            {
              runId: "run-1",
              runStatus: "succeeded",
              runStage: "proposal_created",
              message: "\"Build InputAdapter\" looks like a pure/module-boundary card but has browser proof.",
              createdAt: "2026-05-10T00:00:00.000Z",
              cardId: "synthesis:input-adapter",
              title: "Build InputAdapter",
              proofOwnership: "pure_module",
              visualProofItemsJson: JSON.stringify(["Capture browser proof that the ship accelerates visually."]),
            },
          ]),
          stderr: "",
        };
      }
      if (sql.includes("from project_board_synthesis_runs")) {
        return {
          stdout: JSON.stringify([
            {
              id: "run-1",
              boardId: "board-1",
              status: "succeeded",
              stage: "proposal_created",
              warningCount: 1,
              eventCount: 0,
              progressiveRecordCount: 0,
              startedAt: "t",
              updatedAt: "t",
            },
          ]),
          stderr: "",
        };
      }
      return { stdout: "[]", stderr: "" };
    };

    const board = await readProjectBoardSnapshot(projectRoot, { runCommand, includeProofScopeWarnings: true });

    expect(board.proofScopeWarnings).toEqual([
      {
        code: "proof_scope_mismatch",
        runId: "run-1",
        runStatus: "succeeded",
        runStage: "proposal_created",
        message: "\"Build InputAdapter\" looks like a pure/module-boundary card but has browser proof.",
        createdAt: "2026-05-10T00:00:00.000Z",
        cardRef: "synthesis:input-adapter",
        title: "Build InputAdapter",
        proofOwnership: "pure_module",
        visualProofItems: ["Capture browser proof that the ship accelerates visually."],
      },
    ]);
    const runSql = calls.find((sql) => sql.includes("from project_board_synthesis_runs") && !sql.includes("json_each"));
    const warningSql = calls.find((sql) => sql.includes("json_each(coalesce(runs.progressive_records_json"));
    expect(runSql).not.toContain("progressive_records_json as progressiveRecordsJson");
    expect(warningSql).toContain("proof_scope_mismatch");
  });

  it("reads orchestration tasks and runs directly from the project store", async () => {
    const runCommand = async (_command, args) => {
      const sql = args.at(-1);
      if (sql.includes("from orchestration_tasks")) {
        return {
          stdout: JSON.stringify([
            {
              id: "task-1",
              identifier: "LOCAL-1",
              title: "Create game shell",
              state: "needs_review",
              priority: 1,
              labelsJson: JSON.stringify(["webgl"]),
              blockedByJson: "[]",
              sourceKind: "project_board_card",
              createdAt: "t",
              updatedAt: "t",
            },
          ]),
          stderr: "",
        };
      }
      if (sql.includes("from orchestration_runs")) {
        return {
          stdout: JSON.stringify([
            {
              id: "run-1",
              taskId: "task-1",
              attemptNumber: 1,
              status: "completed",
              workspacePath: "/tmp/work",
              proofOfWorkJson: JSON.stringify({ taskToolActions: [{ action: "task_complete" }] }),
              startedAt: "t",
            },
          ]),
          stderr: "",
        };
      }
      return { stdout: "[]", stderr: "" };
    };

    const board = await readOrchestrationBoardSnapshot("/tmp/project", { runCommand });
    const run = await readOrchestrationRunSnapshot("/tmp/project", "run-1", { runCommand });

    expect(board.tasks[0]).toMatchObject({ id: "task-1", labels: ["webgl"], sourceKind: "project_board_card" });
    expect(board.runs[0]).toMatchObject({ id: "run-1", proofOfWork: { taskToolActions: [{ action: "task_complete" }] } });
    expect(run).toMatchObject({ id: "run-1", status: "completed" });
  });

  it("escapes sqlite string literals used by the dogfood store reader", () => {
    expect(sqlString("Bob's project")).toBe("'Bob''s project'");
  });

  it("does not expose progressive pending proposals as dogfood-ready until synthesis succeeds", () => {
    const pendingProposal = { id: "proposal-1", boardId: "board-1", status: "pending" };
    const board = {
      id: "board-1",
      proposals: [pendingProposal],
      synthesisRuns: [
        { id: "run-1", boardId: "board-1", proposalId: "proposal-1", status: "running", startedAt: "2026-05-05T00:00:00.000Z" },
      ],
    };

    expect(readyPendingProjectBoardProposal(board)).toBeUndefined();

    board.synthesisRuns.push({
      id: "run-2",
      boardId: "board-1",
      proposalId: "proposal-1",
      status: "succeeded",
      startedAt: "2026-05-05T00:01:00.000Z",
    });

    expect(readyPendingProjectBoardProposal(board)).toBe(pendingProposal);
    expect(readyPendingProjectBoardProposal(board, "proposal-1")).toBeUndefined();
    expect(latestSynthesisRunForBoard(board, "board-1").id).toBe("run-2");
  });

  it("detects when Build Board already started a running synthesis pass", () => {
    const board = {
      id: "board-1",
      synthesisRuns: [
        { id: "run-old", boardId: "board-1", status: "succeeded", startedAt: "2026-05-05T00:00:00.000Z" },
        { id: "run-current", boardId: "board-1", status: "running", startedAt: "2026-05-05T00:01:00.000Z" },
      ],
    };

    expect(runningSynthesisRunForBoard(board, "board-1")?.id).toBe("run-current");
  });

  it("separates source-refresh-only runs from card-planning synthesis runs", () => {
    const sourceRefreshRun = {
      id: "source-refresh",
      boardId: "board-1",
      status: "succeeded",
      stage: "sources_persisted",
      responseCharCount: 5219,
      progressiveRecordCount: 0,
      startedAt: "2026-05-05T00:02:00.000Z",
    };
    const planningRun = {
      id: "planning-run",
      boardId: "board-1",
      status: "running",
      stage: "model_request",
      cardCount: 5,
      questionCount: 3,
      progressiveRecordCount: 0,
      startedAt: "2026-05-05T00:01:00.000Z",
    };
    const board = {
      id: "board-1",
      synthesisRuns: [planningRun, sourceRefreshRun],
    };

    expect(isSourceRefreshOnlySynthesisRun(sourceRefreshRun)).toBe(true);
    expect(isSourceRefreshOnlySynthesisRun(planningRun)).toBe(false);
    expect(hasProjectBoardPlanningShape(sourceRefreshRun)).toBe(false);
    expect(hasProjectBoardPlanningShape(planningRun)).toBe(true);
    expect(latestSynthesisRunForBoard(board, "board-1")?.id).toBe("source-refresh");
    expect(runningSynthesisRunForBoard(board, "board-1")).toBeUndefined();
    expect(latestPlanningSynthesisRunForBoard(board, "board-1")?.id).toBe("planning-run");
    expect(runningPlanningSynthesisRunForBoard(board, "board-1")?.id).toBe("planning-run");
    expect(latestPlanningSynthesisRunForBoard(board, "board-1", "planning-run")).toBeUndefined();
  });

  it("does not classify a running source refresh/classification pass as card planning before a baseline exists", () => {
    const runningSourceRefresh = {
      id: "source-refresh",
      boardId: "board-1",
      status: "running",
      stage: "source_classification",
      sourceCount: 12,
      includedSourceCount: 12,
      promptCharCount: 16442,
      responseCharCount: 2446,
      progressiveRecordCount: 0,
      startedAt: "2026-05-05T00:02:00.000Z",
    };
    const board = {
      id: "board-1",
      synthesisRuns: [runningSourceRefresh],
    };

    expect(hasProjectBoardPlanningShape(runningSourceRefresh)).toBe(false);
    expect(latestPlanningSynthesisRunForBoard(board, "board-1")).toBeUndefined();
    expect(runningPlanningSynthesisRunForBoard(board, "board-1")).toBeUndefined();
  });

  it("does not exclude an in-flight kickoff planning run while waiting for PM Review synthesis start", () => {
    const runningEarlyPlanningRun = {
      id: "run-current",
      boardId: "board-1",
      status: "running",
      stage: "source_classification",
      sourceCount: 12,
      includedSourceCount: 12,
      promptCharCount: 16442,
      responseCharCount: 2446,
      progressiveRecordCount: 0,
      startedAt: "2026-05-05T00:02:00.000Z",
    };
    const board = {
      id: "board-1",
      synthesisRuns: [
        { id: "source-refresh", boardId: "board-1", status: "succeeded", stage: "sources_persisted", startedAt: "2026-05-05T00:01:00.000Z" },
        runningEarlyPlanningRun,
      ],
    };

    expect(runningPlanningSynthesisRunForBoard(board, "board-1")).toBeUndefined();
    expect(planningStartIntentForBoard(board, "board-1")).toEqual({
      shouldStartNewRun: false,
      previousRunId: undefined,
      inFlightRun: runningEarlyPlanningRun,
    });
  });

  it("uses the last completed run as the baseline when explicitly starting a new planning run", () => {
    const board = {
      id: "board-1",
      synthesisRuns: [
        { id: "source-refresh", boardId: "board-1", status: "succeeded", stage: "sources_persisted", startedAt: "2026-05-05T00:01:00.000Z" },
      ],
    };

    expect(planningStartIntentForBoard(board, "board-1")).toEqual({
      shouldStartNewRun: true,
      previousRunId: "source-refresh",
      inFlightRun: undefined,
    });
  });

  it("summarizes incremental synthesis cards and first ticketized task milestones", () => {
    const board = {
      id: "board-1",
      synthesisRuns: [
        { id: "run-1", boardId: "board-1", status: "running", stage: "schema_validation", startedAt: "2026-05-05T00:00:00.000Z" },
      ],
      cards: [
        {
          id: "manual-1",
          sourceKind: "manual",
          sourceId: "manual:one",
          title: "Manual card",
          status: "draft",
          candidateStatus: "ready_to_create",
          blockedBy: [],
        },
        {
          id: "card-1",
          sourceKind: "board_synthesis",
          sourceId: "synthesis:shell",
          title: "Create game shell",
          status: "ready",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          blockedBy: [],
          orchestrationTaskId: "task-1",
        },
        {
          id: "card-2",
          sourceKind: "project_board_synthesis",
          sourceId: "synthesis:controls",
          title: "Implement controls",
          status: "draft",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Core Gameplay",
          blockedBy: ["synthesis:shell"],
        },
      ],
    };

    expect(projectBoardIncrementalSynthesisSnapshot(board, "board-1")).toMatchObject({
      run: { id: "run-1" },
      boardSynthesisCardCount: 2,
      ticketizedCardCount: 1,
      firstCard: {
        id: "card-1",
        sourceId: "synthesis:shell",
        title: "Create game shell",
        orchestrationTaskId: "task-1",
      },
      firstTicketizedCard: {
        id: "card-1",
        orchestrationTaskId: "task-1",
      },
    });
  });
});
