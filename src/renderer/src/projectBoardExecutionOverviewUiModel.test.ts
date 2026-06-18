import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  projectBoardExecutionOverview,
  projectBoardExecutionReadinessRail,
} from "./projectBoardExecutionOverviewUiModel";

function card(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: overrides.id ?? "card-1",
    boardId: overrides.boardId ?? "board-1",
    title: overrides.title ?? "Board card",
    description: overrides.description ?? "",
    status: overrides.status ?? "ready",
    candidateStatus: overrides.candidateStatus ?? "ready_to_create",
    labels: overrides.labels ?? [],
    blockedBy: overrides.blockedBy ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    testPlan: overrides.testPlan ?? { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: overrides.sourceKind ?? "manual",
    sourceId: overrides.sourceId ?? "source-1",
    orchestrationTaskId: overrides.orchestrationTaskId ?? "task-1",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Partial<OrchestrationTask> = {}): OrchestrationTask {
  return {
    id: overrides.id ?? "task-1",
    identifier: overrides.identifier ?? "LOCAL-1",
    title: overrides.title ?? "Board task",
    state: overrides.state ?? "ready",
    labels: overrides.labels ?? [],
    blockedBy: overrides.blockedBy ?? [],
    sourceKind: overrides.sourceKind ?? "project_board_card",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<OrchestrationRun> = {}): OrchestrationRun {
  return {
    id: overrides.id ?? "run-1",
    taskId: overrides.taskId ?? "task-1",
    attemptNumber: overrides.attemptNumber ?? 0,
    status: overrides.status ?? "prepared",
    workspacePath: overrides.workspacePath ?? "/workspace/.ambient/runs/run-1",
    startedAt: overrides.startedAt ?? "2026-01-01T00:05:00.000Z",
    lastEventAt: overrides.lastEventAt,
    finishedAt: overrides.finishedAt,
    proofOfWork: overrides.proofOfWork,
    ...overrides,
  };
}

function board(overrides: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
  return {
    id: overrides.id ?? "board-1",
    projectPath: overrides.projectPath ?? "/workspace",
    status: overrides.status ?? "active",
    title: overrides.title ?? "Board",
    summary: overrides.summary ?? "",
    cards: overrides.cards ?? [],
    sources: overrides.sources ?? [],
    questions: overrides.questions ?? [],
    proposals: overrides.proposals ?? [],
    synthesisRuns: overrides.synthesisRuns ?? [],
    events: overrides.events ?? [],
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("projectBoardExecutionOverviewUiModel", () => {
  it("models draft boards from the execution owner", () => {
    const draftBoard = board({ status: "draft", cards: [card({ status: "draft", orchestrationTaskId: undefined })] });

    expect(projectBoardExecutionOverview(draftBoard)).toMatchObject({
      state: "draft",
      headline: "Finish the charter before execution starts",
      action: { action: "open_charter", label: "Answer Kickoff Questions" },
    });
    expect(projectBoardExecutionReadinessRail(draftBoard)).toMatchObject({
      blockerKind: "draft_board",
      nextActionSummary: "Click Answer Kickoff Questions",
    });
  });

  it("keeps PM decisions ahead of draft ticketization", () => {
    const decisionBoard = board({
      cards: [
        card({
          id: "draft-needs-decision",
          title: "Draft needs decision",
          status: "draft",
          orchestrationTaskId: undefined,
          clarificationQuestions: ["Should this ship as one card or split first?"],
        }),
      ],
    });

    expect(projectBoardExecutionOverview(decisionBoard)).toMatchObject({
      state: "decisions_blocked",
      blockerKind: "decision_blocked",
      headline: "Answer 1 PM decision",
      action: { action: "open_decisions", label: "Answer Decisions" },
      metrics: expect.arrayContaining([
        { label: "Decisions", value: 1 },
        { label: "Draft candidates", value: 1 },
      ]),
    });
  });

  it("models prepared-run and integration-pending execution states", () => {
    const readyBoard = board({ cards: [card({ id: "ready-card", title: "Ready executable" })] });
    const readyTask = task();
    const preparedRun = run();

    expect(projectBoardExecutionOverview(readyBoard, [readyTask], [preparedRun])).toMatchObject({
      state: "start_run",
      headline: "Prepared run is queued",
      action: { action: "start_run", label: "Start Run", cardId: "ready-card", runId: "run-1" },
    });

    const doneBoard = board({ cards: [card({ id: "done-card", title: "Done executable", status: "done" })] });
    const doneTask = task({ state: "done" });
    const completedRun = run({ status: "completed", proofOfWork: { changedFiles: ["index.html", ".ambient/runtime.json"] } });

    expect(projectBoardExecutionOverview(doneBoard, [doneTask], [completedRun])).toMatchObject({
      state: "integration_pending",
      headline: "Executable board closed; integration pending",
      metrics: expect.arrayContaining([{ label: "Pending integration", value: 1 }]),
      action: { action: "open_integration", label: "Open Integration" },
    });
  });
});
