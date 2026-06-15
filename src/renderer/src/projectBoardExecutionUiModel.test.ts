import { describe, expect, it } from "vitest";

import type { OrchestrationRun, OrchestrationTask, OrchestrationWorkflowReadiness, ProjectBoardCard, ProjectBoardEvent, ProjectBoardSummary } from "../../shared/types";
import {
  projectBoardBoardDecisionImpactRail,
  projectBoardLatestRunByTaskId,
  projectBoardWorkflowImpactPreview,
} from "./projectBoardExecutionUiModel";

function card(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: overrides.id ?? "card-1",
    boardId: overrides.boardId ?? "board-1",
    title: overrides.title ?? "Executable card",
    description: overrides.description ?? "",
    status: overrides.status ?? "ready",
    candidateStatus: overrides.candidateStatus ?? "ready_to_create",
    labels: overrides.labels ?? [],
    blockedBy: overrides.blockedBy ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    testPlan: overrides.testPlan ?? { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: overrides.sourceKind ?? "planner_plan",
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
    title: overrides.title ?? "Executable task",
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
    workspacePath: overrides.workspacePath ?? "/tmp/workspace",
    startedAt: overrides.startedAt ?? "2026-01-01T00:00:00.000Z",
    lastEventAt: overrides.lastEventAt,
    finishedAt: overrides.finishedAt,
    proofOfWork: overrides.proofOfWork,
    ...overrides,
  };
}

function event(overrides: Partial<ProjectBoardEvent> = {}): ProjectBoardEvent {
  return {
    id: overrides.id ?? "event-1",
    boardId: overrides.boardId ?? "board-1",
    kind: overrides.kind ?? "question_answered",
    title: overrides.title ?? "Decision answered",
    summary: overrides.summary ?? "Decision impact recorded.",
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function board(cards: ProjectBoardCard[], events: ProjectBoardEvent[] = []): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath: "/workspace",
    status: "active",
    title: "Board",
    summary: "Board summary",
    cards,
    sources: [],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    events,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function readyWorkflow(overrides: Partial<OrchestrationWorkflowReadiness> = {}): OrchestrationWorkflowReadiness {
  return {
    status: "ready",
    path: overrides.path ?? "WORKFLOW.md",
    checkedAt: overrides.checkedAt ?? "2026-01-01T00:00:00.000Z",
    workflowHash: overrides.workflowHash ?? "current-workflow-hash-12345",
    warnings: overrides.warnings ?? [],
    autoDispatch: overrides.autoDispatch ?? false,
    maxConcurrentAgents: overrides.maxConcurrentAgents ?? 2,
    maxTurns: overrides.maxTurns ?? 30,
    workspaceStrategy: overrides.workspaceStrategy ?? "directory",
    proofOfWork: overrides.proofOfWork ?? { requireTests: true, requireDiffSummary: false, requireScreenshots: true },
    rawContent: overrides.rawContent ?? "## Workflow\nRun tests.\n",
    rawContentTruncated: overrides.rawContentTruncated ?? false,
  } as OrchestrationWorkflowReadiness;
}

describe("projectBoardExecutionUiModel", () => {
  it("models current workflow impact without mutating card specs", () => {
    const preview = projectBoardWorkflowImpactPreview(board([card()]), [task()], [], readyWorkflow());

    expect(preview).toMatchObject({
      visible: true,
      state: "current_workflow",
      tone: "ready",
      modelCallRequired: false,
      workflowPath: "WORKFLOW.md",
      workflowHashLabel: "current-work",
      affectedCardIds: ["card-1"],
      affectedRunIds: [],
      settings: {
        autoDispatch: false,
        maxConcurrentAgents: 2,
        maxTurns: 30,
        workspaceStrategy: "directory",
        requireTests: true,
        requireDiffSummary: false,
        requireScreenshots: true,
      },
      rawEditor: {
        markdown: "## Workflow\nRun tests.\n",
        lineCount: 2,
        truncated: false,
      },
    });
    expect(preview.actions.map((action) => action.action)).toEqual(["prepare_next"]);
    expect(preview.metrics).toContainEqual(expect.objectContaining({ label: "Model calls", value: "0" }));
  });

  it("detects prepared runs that used older or unknown workflow provenance", () => {
    const staleRun = run({ id: "stale", proofOfWork: { workflowHash: "older-workflow-hash" } });
    const unknownRun = run({ id: "unknown", taskId: "task-2", proofOfWork: {} });
    const current = readyWorkflow({ workflowHash: "newer-workflow-hash" });

    const stalePreview = projectBoardWorkflowImpactPreview(board([card()]), [task()], [staleRun], current);
    const unknownPreview = projectBoardWorkflowImpactPreview(
      board([card({ id: "card-2", orchestrationTaskId: "task-2" })]),
      [task({ id: "task-2", identifier: "LOCAL-2" })],
      [unknownRun],
      current,
    );

    expect(stalePreview).toMatchObject({
      visible: true,
      state: "prepared_workflow_stale",
      tone: "warning",
      affectedCardIds: ["card-1"],
      affectedRunIds: ["stale"],
      modelCallRequired: false,
    });
    expect(stalePreview.actions.map((action) => action.action)).toEqual(["continue_old_prep", "prepare_again"]);
    expect(unknownPreview).toMatchObject({
      visible: true,
      state: "prepared_workflow_unknown",
      tone: "warning",
      affectedCardIds: ["card-2"],
      affectedRunIds: ["unknown"],
      modelCallRequired: false,
    });
  });

  it("keeps decision-impact feedback rails local and deterministic", () => {
    const decisionImpact = event({
      createdAt: "2026-01-01T00:02:00.000Z",
      metadata: {
        decisionImpact: {
          question: "Should auth be in scope?",
          affectedCardIds: ["needs-feedback"],
          affectedCounts: { readyFeedback: 1 },
          appliedAction: "create_next_run_feedback",
        },
      },
    });
    const rail = projectBoardBoardDecisionImpactRail(
      board(
        [
          card({ id: "needs-feedback", title: "Needs feedback", orchestrationTaskId: "task-1" }),
          card({
            id: "feedback-ready",
            title: "Feedback ready",
            orchestrationTaskId: "task-2",
            runFeedback: [
              {
                id: "feedback-1",
                source: "decision_impact",
                feedback: "Keep auth out of the next run.",
                decisionQuestion: "Should auth be in scope?",
                decisionAnswer: "No.",
                createdAt: "2026-01-01T00:03:00.000Z",
              },
            ],
          }),
        ],
        [decisionImpact],
      ),
    );

    expect(rail).toMatchObject({
      visible: true,
      tone: "warning",
      needsFeedbackCount: 1,
      feedbackReadyCount: 1,
      affectedCardIds: ["needs-feedback", "feedback-ready"],
      modelCallRequired: false,
    });
    expect(rail.cards.map((item) => [item.cardId, item.state, item.sourceLabel])).toEqual([
      ["needs-feedback", "needs_feedback", "Decision answered"],
      ["feedback-ready", "feedback_ready", "Feedback ready"],
    ]);
    expect(rail.metrics).toContainEqual(expect.objectContaining({ label: "Model calls", value: "0" }));
  });

  it("preserves latest-run ordering for execution callers that still live in the facade", () => {
    const latestByTask = projectBoardLatestRunByTaskId([
      run({ id: "older", taskId: "task-1", attemptNumber: 0, startedAt: "2026-01-01T00:00:00.000Z", lastEventAt: "2026-01-01T00:01:00.000Z" }),
      run({ id: "newer", taskId: "task-1", attemptNumber: 1, startedAt: "2026-01-01T00:00:00.000Z", lastEventAt: "2026-01-01T00:02:00.000Z" }),
    ]);

    expect(latestByTask.get("task-1")?.id).toBe("newer");
  });
});
