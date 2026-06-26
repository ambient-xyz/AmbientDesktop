import { describe, expect, it } from "vitest";
import {
  projectBoardActionState,
  projectBoardBoardTabShowsDraftCallout,
  projectBoardBoardTabShowsExecutionPanels,
  projectBoardBoardTabStatusLabel,
  projectBoardCharterReviewActionState,
  projectBoardEmptyMessage,
  projectBoardKickoffDefaultAnswer,
  projectBoardKickoffDefaultProviderErrorMessage,
  projectBoardStatusLabel,
  projectBoardSuppressedForWorkflowRecordingThread,
  projectBoardThreadPlanActionState,
} from "./projectBoardUiModel";
import { boardSummary, project } from "./projectBoardUiModelTestHelpers";

describe("projectBoardUiModel setup and kickoff", () => {
  it("opens board setup for the active project when no board exists", () => {
    expect(projectBoardActionState(project(), "/workspace/app")).toMatchObject({
      kind: "open",
      label: "Project Board",
      disabled: false,
      statusLabel: "No board",
    });
    expect(projectBoardActionState(project({ path: "/workspace/other" }), "/workspace/app")).toMatchObject({
      kind: "open",
      disabled: true,
    });
    expect(projectBoardActionState(project(), "/workspace/app").title).toContain("Building starts only from the Build Board button");
  });

  it("suppresses project board entry points in workflow recording chats", () => {
    expect(projectBoardSuppressedForWorkflowRecordingThread(undefined)).toBe(false);
    expect(projectBoardSuppressedForWorkflowRecordingThread({})).toBe(false);
    expect(projectBoardSuppressedForWorkflowRecordingThread({ workflowRecording: { status: "recording" } })).toBe(true);
    expect(projectBoardSuppressedForWorkflowRecordingThread({ workflowRecording: { status: "stopped" } })).toBe(true);
  });

  it("shows open board once a project board exists", () => {
    const withBoard = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "draft",
        title: "App board",
        summary: "Draft",
        charterId: "charter-1",
        cards: [],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(projectBoardActionState(withBoard, "/workspace/app")).toMatchObject({
      kind: "open",
      label: "Open Board",
      disabled: false,
      statusLabel: "Kickoff draft",
    });
    expect(projectBoardActionState(withBoard, "/workspace/app", false, true)).toMatchObject({
      kind: "close",
      label: "Open Chat",
      title: "Return to main chat",
      disabled: false,
      statusLabel: "Kickoff draft",
    });
    expect(projectBoardActionState(withBoard, "/workspace/app", true)).toMatchObject({
      kind: "open",
      label: "Open Board",
      disabled: false,
      statusLabel: "Kickoff draft",
    });
    expect(projectBoardActionState(withBoard, "/workspace/other", false, true)).toMatchObject({
      kind: "open",
      label: "Open Board",
      disabled: true,
    });
    expect(projectBoardStatusLabel(withBoard.board!)).toBe("Kickoff draft");
    expect(projectBoardEmptyMessage(withBoard.board!)).toContain("Answer the kickoff questions");
    expect(
      projectBoardEmptyMessage(
        boardSummary({
          status: "draft",
          cards: [
            {
              id: "draft-1",
              boardId: "board-1",
              title: "Implement compact app",
              description: "Build the single-file local app.",
              status: "draft",
              candidateStatus: "ready_to_create",
              labels: [],
              blockedBy: [],
              acceptanceCriteria: ["App works."],
              testPlan: { unit: [], integration: [], visual: [], manual: ["Manual check."] },
              sourceKind: "planner_plan",
              sourceId: "plan-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      ),
    ).toContain("1 draft candidate exists");

    withBoard.board!.charter = {
      id: "charter-2",
      boardId: "board-1",
      version: 2,
      status: "draft",
      goal: "",
      currentState: "",
      targetUser: "",
      nonGoals: [],
      qualityBar: "",
      testPolicy: {},
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(projectBoardStatusLabel(withBoard.board!)).toBe("Revision draft");
    expect(projectBoardEmptyMessage(withBoard.board!)).toContain("apply or cancel");

    withBoard.board!.status = "active";
    expect(projectBoardStatusLabel(withBoard.board!)).toBe("Active board");
    expect(projectBoardEmptyMessage(withBoard.board!)).toContain("ready for project cards");
  });

  it("treats draft boards with executable cards as an execution board in the Board tab", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "draft",
        title: "App board",
        summary: "Draft",
        charterId: "charter-1",
        cards: [],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardBoardTabStatusLabel(board, 4, 0)).toBe("Execution board");
    expect(projectBoardBoardTabShowsDraftCallout(board, 4)).toBe(false);
    expect(projectBoardBoardTabShowsExecutionPanels(board, 4)).toBe(true);
    expect(projectBoardBoardTabStatusLabel(board, 0, 0)).toBe("Kickoff draft");
    expect(projectBoardBoardTabShowsDraftCallout(board, 0)).toBe(true);
    expect(projectBoardBoardTabShowsExecutionPanels(board, 0)).toBe(false);
  });

  it("gates charter Pi review behind kickoff answers", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "draft",
        title: "App board",
        summary: "Draft",
        charterId: "charter-1",
        cards: [],
        sources: [],
        questions: [
          {
            id: "question-1",
            boardId: "board-1",
            question: "What is the primary outcome?",
            required: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "question-2",
            boardId: "board-1",
            question: "Which sources are authoritative?",
            required: true,
            answer: "Use the GDD first.",
            answeredAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardCharterReviewActionState(board)).toMatchObject({
      label: "Review Charter With Pi",
      disabled: true,
      title: expect.stringContaining("Answer all kickoff questions first"),
    });

    board.questions[0] = { ...board.questions[0], answer: "Build the playable slice.", answeredAt: "2026-01-01T00:00:00.000Z" };
    expect(projectBoardCharterReviewActionState(board)).toMatchObject({
      label: "Review Answers With Pi",
      disabled: false,
      title: expect.stringContaining("saved kickoff answers"),
    });

    board.status = "active";
    expect(projectBoardCharterReviewActionState(board)).toMatchObject({
      label: "Review Charter With Pi",
      disabled: false,
      title: expect.stringContaining("active charter"),
    });
  });

  it("models thread-level Add Plan to Board availability", () => {
    expect(projectBoardThreadPlanActionState(false, 1)).toMatchObject({
      kind: "no_board",
      disabled: false,
      title: "Create a project board and add the ready planner plan.",
    });
    expect(projectBoardThreadPlanActionState(true, 0)).toMatchObject({
      kind: "no_ready_plan",
      disabled: true,
      title: "Create a ready planner plan first.",
    });
    expect(projectBoardThreadPlanActionState(true, 1)).toMatchObject({
      kind: "single_ready_plan",
      disabled: false,
      label: "Add Plan to Board",
    });
    expect(projectBoardThreadPlanActionState(true, 2)).toMatchObject({
      kind: "multiple_ready_plans",
      disabled: false,
    });
    expect(projectBoardThreadPlanActionState(true, 1, true)).toMatchObject({
      kind: "single_ready_plan",
      disabled: true,
      title: "Adding plan to board",
    });
  });

  it("suggests editable kickoff defaults from source authority context", () => {
    const board = {
      id: "board-1",
      projectPath: "/workspace/app",
      status: "draft" as const,
      title: "Asteroids",
      summary: "",
      cards: [],
      sources: [
        {
          id: "durable-plan-source",
          boardId: "board-1",
          title: "Revised Durable Plan",
          kind: "plan_artifact" as const,
          path: ".ambient/board/plans/Asteroids-DurablePlan.html",
          summary: "Authoritative plan.",
          relevance: 1,
          includeInSynthesis: true,
          authorityRole: "primary" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "thread-source",
          boardId: "board-1",
          title: "Planning chat",
          kind: "thread" as const,
          threadId: "thread-1",
          summary: "Older thread.",
          relevance: 1,
          includeInSynthesis: false,
          authorityRole: "ignored" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      questions: [],
      proposals: [],
      events: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(
      projectBoardKickoffDefaultAnswer(
        board,
        {
          id: "question-1",
          boardId: "board-1",
          question: "Which sources are authoritative?",
          required: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        1,
      ),
    ).toContain("Revised Durable Plan");
    expect(
      projectBoardKickoffDefaultAnswer(
        board,
        {
          id: "answered",
          boardId: "board-1",
          question: "Goal?",
          required: true,
          answer: "Saved answer",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      ),
    ).toBe("Saved answer");
    expect(
      projectBoardKickoffDefaultAnswer(
        board,
        {
          id: "execution-policy",
          boardId: "board-1",
          question: "How should Ambient sequence and retry card execution when work is blocked or incomplete?",
          required: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        4,
      ),
    ).toContain("retry transient failures");
  });

  it("formats kickoff default provider errors without leaking raw JSON", () => {
    const message = projectBoardKickoffDefaultProviderErrorMessage(
      'Ambient project-board kickoff default suggestion failed (402): {"error":{"message":"Daily and monthly free usage exhausted. Daily budget resets in 20 hours. Purchase credits for uninterrupted access.","type":"insufficient_quota_error"}}',
    );

    expect(message).toBe(
      "Ambient/Pi default suggestion failed (HTTP 402): Daily and monthly free usage exhausted. Daily budget resets in 20 hours. Purchase credits for uninterrupted access. (quota limit)",
    );
    expect(message).not.toContain('{"error"');
  });
});
