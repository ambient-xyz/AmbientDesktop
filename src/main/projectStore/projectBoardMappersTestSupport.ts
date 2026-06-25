import type { OrchestrationTask } from "../../shared/workflowTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ProjectBoardCard, ProjectBoardQuestion, ProjectBoardSource } from "../../shared/projectBoardTypes";
import type { BoardEventArtifact, RunHandoffArtifact, RunManifestArtifact, RunProofArtifact } from "./projectStoreProjectBoardFacade";
import type { ProjectBoardCardPendingPiUpdateStoreRow, ProjectBoardCardStoreRow, ProjectBoardStoreRow } from "./projectBoardMappers";

export const boardEventArtifact = (
  event: Pick<BoardEventArtifact, "type"> & Partial<Omit<BoardEventArtifact, "type">>,
): BoardEventArtifact =>
  ({
    schemaVersion: 1,
    eventId: "event-1",
    boardId: "board-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    payload: {},
    ...event,
  }) as BoardEventArtifact;

export const runManifestArtifact = (artifact: Partial<RunManifestArtifact> = {}): RunManifestArtifact =>
  ({
    schemaVersion: 1,
    runId: "run-1",
    boardId: "board-1",
    cardId: "card-manifest",
    status: "running",
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...artifact,
  }) as RunManifestArtifact;

export const runProofArtifact = (artifact: Partial<RunProofArtifact> = {}): RunProofArtifact =>
  ({
    schemaVersion: 1,
    runId: "run-1",
    boardId: "board-1",
    cardId: "card-proof",
    summary: "Proof summary",
    commands: ["pnpm test"],
    changedFiles: ["src/main/example.ts"],
    screenshots: ["screenshots/proof.png"],
    browserTraces: ["traces/proof.zip"],
    visualChecks: [{ name: "canvas", status: "passed" }],
    manualChecks: ["Reviewed proof"],
    createdAt: "2026-01-01T00:02:00.000Z",
    ...artifact,
  }) as RunProofArtifact;

export const runHandoffArtifact = (artifact: Partial<RunHandoffArtifact> = {}): RunHandoffArtifact =>
  ({
    schemaVersion: 1,
    runId: "run-1",
    boardId: "board-1",
    cardId: "card-handoff",
    summary: "Handoff summary",
    completed: ["Done"],
    remaining: ["Later"],
    risks: ["Risk"],
    followUps: [{ title: "Follow up", reason: "Needs polish", blockedBy: ["card-manifest"] }],
    createdAt: "2026-01-01T00:03:00.000Z",
    ...artifact,
  }) as RunHandoffArtifact;

export const projectBoardSource = (source: Partial<ProjectBoardSource> = {}): ProjectBoardSource =>
  ({
    id: "source-1",
    boardId: "board-1",
    kind: "markdown",
    title: "Source",
    summary: "Summary",
    relevance: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...source,
  }) as ProjectBoardSource;

export const projectBoardQuestion = (question: Partial<ProjectBoardQuestion> = {}): ProjectBoardQuestion =>
  ({
    id: "question-1",
    boardId: "board-1",
    question: "Question?",
    required: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...question,
  }) as ProjectBoardQuestion;

export const projectBoardCard = (card: Partial<ProjectBoardCard> = {}): ProjectBoardCard =>
  ({
    id: "card-1",
    boardId: "board-1",
    title: "Create shell",
    description: "Build the shell.",
    status: "draft",
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: "board_synthesis",
    sourceId: "synthesis:shell",
    sourceRefs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...card,
  }) as ProjectBoardCard;

export const projectBoardRow = (row: Partial<ProjectBoardStoreRow> = {}): ProjectBoardStoreRow => ({
  id: "board-1",
  project_path: "/workspace/project",
  status: "active",
  title: "Project Board",
  summary: "Board summary",
  charter_id: null,
  active_draft_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:01:00.000Z",
  ...row,
  source_thread_id: row.source_thread_id ?? null,
});

export const plannerPlanArtifact = (artifact: Partial<PlannerPlanArtifact> = {}): PlannerPlanArtifact =>
  ({
    id: "plan-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    status: "ready",
    workflowState: "durable_ready",
    title: "Build dashboard",
    summary: "Ship the dashboard shell.",
    content: "# Dashboard plan\n\nBuild the dashboard shell.",
    steps: [],
    openQuestions: [],
    risks: [],
    verification: [],
    decisionQuestions: [],
    diagrams: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...artifact,
  }) as PlannerPlanArtifact;

export const projectBoardCardPendingPiUpdateRow = (
  row: Partial<ProjectBoardCardPendingPiUpdateStoreRow> = {},
): ProjectBoardCardPendingPiUpdateStoreRow => ({
  title: "Create shell",
  description: "Build the shell.",
  candidate_status: "ready_to_create",
  priority: 2,
  phase: "Foundation",
  labels_json: JSON.stringify(["shell"]),
  blocked_by_json: JSON.stringify([]),
  acceptance_criteria_json: JSON.stringify(["Canvas renders."]),
  test_plan_json: JSON.stringify({ unit: ["unit test"], integration: [], visual: [], manual: [] }),
  source_refs_json: JSON.stringify(["docs/architecture.md"]),
  clarification_questions_json: JSON.stringify([]),
  clarification_suggestions_json: JSON.stringify([]),
  clarification_answers_json: JSON.stringify([]),
  clarification_decisions_json: JSON.stringify([]),
  ui_mock_role: null,
  requires_ui_mock_approval: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:01:00.000Z",
  ...row,
});

export const projectBoardCardRow = (row: Partial<ProjectBoardCardStoreRow> = {}): ProjectBoardCardStoreRow => ({
  ...projectBoardCardPendingPiUpdateRow(),
  id: "card-row-1",
  board_id: "board-1",
  status: "draft",
  source_kind: "board_synthesis",
  source_id: "synthesis:shell",
  source_thread_id: null,
  source_message_id: null,
  orchestration_task_id: null,
  execution_thread_id: null,
  execution_session_policy: null,
  proof_review_json: null,
  split_outcome_json: null,
  objective_provenance_json: null,
  run_feedback_json: null,
  user_touched_fields_json: null,
  user_touched_at: null,
  pending_pi_update_json: null,
  ...row,
});

export const orchestrationTask = (task: Partial<OrchestrationTask> = {}): OrchestrationTask =>
  ({
    id: "task-1",
    identifier: "TASK-1",
    title: "Task",
    state: "todo",
    labels: [],
    blockedBy: [],
    sourceKind: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...task,
  }) as OrchestrationTask;
