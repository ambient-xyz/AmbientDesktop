import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board ticketization facade (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-store-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("attaches existing local tasks to a project board or imports them as evidence", () => {
    const attachedTask = store.createOrchestrationTask({
      title: "Existing implementation task",
      description: "Already queued implementation.",
      state: "todo",
      priority: 4,
      labels: ["frontend"],
    });
    const evidenceTask = store.createOrchestrationTask({
      title: "Completed exploratory task",
      description: "Finished before the board existed.",
      state: "done",
      labels: ["research"],
    });
    const board = store.createProjectBoard({ title: "Import board" });

    const attached = store.attachLocalTaskToProjectBoard({ taskId: attachedTask.id, mode: "attach" });
    const attachedAgain = store.attachLocalTaskToProjectBoard({ taskId: attachedTask.id, mode: "attach" });
    const evidence = store.attachLocalTaskToProjectBoard({ taskId: evidenceTask.id, mode: "evidence" });
    const evidenceAgain = store.attachLocalTaskToProjectBoard({ taskId: evidenceTask.id, mode: "evidence" });

    expect(attachedAgain.id).toBe(attached.id);
    expect(evidenceAgain.id).toBe(evidence.id);
    expect(attached).toMatchObject({
      boardId: board.id,
      title: "Existing implementation task",
      status: "ready",
      candidateStatus: "ready_to_create",
      labels: expect.arrayContaining(["local-task", "frontend"]),
      sourceKind: "local_task_import",
      sourceId: attachedTask.id,
      orchestrationTaskId: attachedTask.id,
      testPlan: { manual: ["Review the existing Local Task proof before closing the board card."] },
    });
    expect(evidence).toMatchObject({
      status: "draft",
      candidateStatus: "evidence",
      sourceKind: "local_task_import",
      sourceId: evidenceTask.id,
      orchestrationTaskId: undefined,
      testPlan: { manual: ["Review imported Local Task history as completed evidence."] },
    });
    expect(store.getActiveProjectBoard()?.events?.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["local_task_imported_as_evidence", "local_task_attached"]),
    );
  });

  it("batch ticketizes ready draft cards and maps board dependencies to Local Task blockers", () => {
    const board = store.createProjectBoard({ title: "Batch ticketization board" });
    const first = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create shared data model",
      description: "Build the project board data model.",
    });
    const second = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Render dependent UI",
      description: "Render the UI after the model exists.",
    });
    const evidence = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Completed research",
      description: "Record completed discovery work.",
    });

    store.updateProjectBoardCard({
      cardId: first.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Data model is persisted."],
      testPlan: { unit: ["Run data model tests."], integration: [], visual: [], manual: [] },
    });
    store.updateProjectBoardCard({
      cardId: second.id,
      candidateStatus: "ready_to_create",
      blockedBy: [first.id],
      acceptanceCriteria: ["Dependent UI renders after data model ticket."],
      testPlan: { unit: [], integration: ["Run project board smoke."], visual: [], manual: [] },
    });
    store.updateProjectBoardCardCandidateStatus(evidence.id, "evidence");

    store.updateProjectBoardStatus(board.id, "active");
    const ticketized = store.createReadyProjectBoardTasks(board.id);
    const ticketizedAgain = store.createReadyProjectBoardTasks(board.id);
    const firstCard = store.getProjectBoardCard(first.id);
    const secondCard = store.getProjectBoardCard(second.id);
    const firstTask = store.getOrchestrationTask(firstCard.orchestrationTaskId!);
    const secondTask = store.getOrchestrationTask(secondCard.orchestrationTaskId!);

    expect(ticketized.map((card) => card.id).sort()).toEqual([first.id, second.id].sort());
    expect(ticketizedAgain).toEqual([]);
    expect(firstCard).toMatchObject({ status: "ready", orchestrationTaskId: firstTask.id });
    expect(secondCard).toMatchObject({ status: "blocked", orchestrationTaskId: secondTask.id });
    expect(firstTask).toMatchObject({
      title: "Create shared data model",
      state: "ready",
      sourceKind: "project_board_card",
      sourceUrl: `project-board-card:${first.id}`,
    });
    expect(secondTask.blockedBy).toEqual([firstTask.identifier]);
    store.updateOrchestrationTask({ id: firstTask.id, state: "needs_review" });
    expect(store.getProjectBoardCard(second.id).status).toBe("ready");
    expect(store.getProjectBoardCard(evidence.id).orchestrationTaskId).toBeUndefined();
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "ready_tasks_created",
      title: "Ready tasks created",
      metadata: expect.objectContaining({
        cardIds: expect.arrayContaining([first.id, second.id]),
        taskIds: expect.arrayContaining([firstTask.id, secondTask.id]),
      }),
    });
    expect(store.listOrchestrationTasks().filter((task) => task.sourceKind === "project_board_card")).toHaveLength(2);
  });

  it("does not create active local task blockers from terminal draft dependencies", () => {
    const board = store.createProjectBoard({ title: "Terminal dependency board" });
    const duplicate = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Duplicate auth backend",
      description: "Already represented elsewhere.",
    });
    const dependent = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "JWT middleware",
      description: "Implement middleware without waiting on duplicate work.",
    });

    store.updateProjectBoardCardCandidateStatus(duplicate.id, "duplicate");
    store.updateProjectBoardCard({
      cardId: dependent.id,
      candidateStatus: "ready_to_create",
      blockedBy: [duplicate.id],
      acceptanceCriteria: ["Middleware is implemented."],
      testPlan: { unit: ["Run middleware tests."], integration: [], visual: [], manual: [] },
    });

    store.updateProjectBoardStatus(board.id, "active");
    const ticketized = store.createReadyProjectBoardTasks(board.id);
    const dependentCard = store.getProjectBoardCard(dependent.id);
    const dependentTask = store.getOrchestrationTask(dependentCard.orchestrationTaskId!);

    expect(ticketized.map((card) => card.id)).toEqual([dependent.id]);
    expect(store.getProjectBoardCard(duplicate.id).orchestrationTaskId).toBeUndefined();
    expect(dependentCard).toMatchObject({ status: "ready" });
    expect(dependentTask.blockedBy).toEqual([]);
  });

  it("unblocks linked tasks when a draft dependency is later marked duplicate", () => {
    const board = store.createProjectBoard({ title: "Terminal dependency resync board" });
    const pendingDependency = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Pending auth backend",
      description: "Unresolved draft dependency.",
    });
    const dependent = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "JWT middleware",
      description: "Implement middleware after auth exists.",
    });

    store.updateProjectBoardCard({
      cardId: dependent.id,
      candidateStatus: "ready_to_create",
      blockedBy: [pendingDependency.id],
      acceptanceCriteria: ["Middleware is implemented."],
      testPlan: { unit: ["Run middleware tests."], integration: [], visual: [], manual: [] },
    });

    store.updateProjectBoardStatus(board.id, "active");
    store.createReadyProjectBoardTasks(board.id);
    const blockedCard = store.getProjectBoardCard(dependent.id);
    const blockedTask = store.getOrchestrationTask(blockedCard.orchestrationTaskId!);

    expect(blockedCard.status).toBe("blocked");
    expect(blockedTask.blockedBy).toEqual([pendingDependency.id]);

    store.updateProjectBoardCardCandidateStatus(pendingDependency.id, "duplicate");
    const unblockedCard = store.getProjectBoardCard(dependent.id);
    const unblockedTask = store.getOrchestrationTask(unblockedCard.orchestrationTaskId!);

    expect(unblockedCard.status).toBe("ready");
    expect(unblockedTask.blockedBy).toEqual([]);
  });

  it("keeps synthesized UI implementation cards unticketized until the UX mock gate is satisfied", () => {
    const board = store.createProjectBoard({ title: "UX mock gate ticketization board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });

    store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Build a dashboard with an explicit UX mock approval gate.",
        goal: "Create a user-facing dashboard flow.",
        currentState: "No dashboard UI exists yet.",
        targetUser: "Operations lead.",
        qualityBar: "UI work waits for approved mock artifacts.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:ux-mock-approval",
            title: "Create UX mock for approval",
            description: "Produce the self-contained HTML mock artifact for review.",
            candidateStatus: "ready_to_create",
            labels: ["ux-mock-approval"],
            blockedBy: [],
            acceptanceCriteria: ["HTML mock artifact is ready for approval."],
            testPlan: { unit: [], integration: [], visual: ["Open the HTML mock artifact."], manual: ["Review desktop and narrow viewports."] },
            sourceRefs: [],
            uiMockRole: "mock_gate",
          },
          {
            sourceId: "synthesis:dashboard-ui",
            title: "Implement dashboard UI",
            description: "Build the approved dashboard UI.",
            candidateStatus: "ready_to_create",
            labels: ["frontend", "ux-mock-gated"],
            blockedBy: ["synthesis:ux-mock-approval"],
            acceptanceCriteria: ["Dashboard UI matches the approved mock."],
            testPlan: { unit: ["Run renderer tests."], integration: [], visual: ["Capture dashboard screenshot."], manual: [] },
            sourceRefs: [],
            uiMockRole: "gated_implementation",
            requiresUiMockApproval: true,
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false, snapshotRunId: run.id, snapshotKind: "final" },
    );
    store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "board_applied",
      title: "Applied UX mock board synthesis",
      summary: "Completed the UX mock gate planning snapshot.",
      status: "succeeded",
      cardCount: 2,
      completedAt: new Date().toISOString(),
    });
    store.updateProjectBoardStatus(board.id, "active");

    const pendingBoard = store.getProjectBoard(board.id)!;
    const mockGate = pendingBoard.cards.find((card) => card.sourceId === "synthesis:ux-mock-approval")!;
    const dashboard = pendingBoard.cards.find((card) => card.sourceId === "synthesis:dashboard-ui")!;

    expect(() => store.approveProjectBoardCard(dashboard.id)).toThrow("Approve the UX mock before creating UI implementation tasks");

    const firstTicketized = store.createReadyProjectBoardTasks(board.id);
    expect(firstTicketized.map((card) => card.id)).toEqual([mockGate.id]);
    expect(store.getProjectBoardCard(dashboard.id)).toMatchObject({
      status: "draft",
      orchestrationTaskId: undefined,
    });

    const ticketizedMockGate = store.getProjectBoardCard(mockGate.id);
    store.updateOrchestrationTask({ id: ticketizedMockGate.orchestrationTaskId!, state: "done" });
    const released = store.createReadyProjectBoardTasks(board.id);
    expect(released.map((card) => card.id)).toEqual([dashboard.id]);
    expect(store.getProjectBoardCard(dashboard.id)).toMatchObject({
      status: "ready",
      orchestrationTaskId: expect.any(String),
    });
  });

  it("blocks ready task creation while board planning is still running", () => {
    const board = store.createProjectBoard({ title: "Active planner board" });
    store.updateProjectBoardStatus(board.id, "active");
    const firstBatch = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "First streamed section.",
        goal: "Build a tiny animated hello board.",
        currentState: "The first ready card is available before the rest of the plan completes.",
        targetUser: "Browser user.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:animated-shell",
            title: "Create animated shell",
            description: "Build a tiny animated hello shell.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["html"],
            blockedBy: [],
            sourceRefs: ["DurablePlan.md#shell"],
            acceptanceCriteria: ["Greeting renders."],
            testPlan: { unit: ["Run shell unit tests."], integration: [], visual: ["Capture desktop screenshot."], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );
    const shell = firstBatch.cards.find((candidate) => candidate.sourceId === "synthesis:animated-shell")!;
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });

    expect(() => store.createReadyProjectBoardTasks(board.id)).toThrow("planning is still running");
    expect(store.getProjectBoardCard(shell.id)).toMatchObject({ status: "draft", orchestrationTaskId: undefined });
    expect(store.listOrchestrationTasks().filter((task) => task.sourceKind === "project_board_card")).toHaveLength(0);
    expect(store.getProjectBoardSynthesisRun(run.id)).toMatchObject({ status: "running" });

    store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "board_applied",
      title: "Applied test board synthesis",
      summary: "Completed the active test planner run.",
      status: "succeeded",
      cardCount: 1,
      completedAt: new Date().toISOString(),
    });

    const afterLaterSection = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Second streamed section.",
        goal: "Build a tiny animated hello board.",
        currentState: "The planner refined the first card while adding the second.",
        targetUser: "Browser user.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:animated-shell",
            title: "Create polished animated shell",
            description: "Pi proposes a richer animated shell before ticketization.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["html", "animation"],
            blockedBy: [],
            sourceRefs: ["DurablePlan.md#shell"],
            acceptanceCriteria: ["Greeting renders with a pulse."],
            testPlan: { unit: ["Run shell unit tests."], integration: [], visual: ["Capture desktop screenshot."], manual: [] },
          },
          {
            sourceId: "synthesis:style-pass",
            title: "Add style pass",
            description: "Tune the animation after the shell exists.",
            candidateStatus: "ready_to_create",
            priority: 2,
            phase: "Polish",
            labels: ["css"],
            blockedBy: ["synthesis:animated-shell"],
            sourceRefs: ["DurablePlan.md#style"],
            acceptanceCriteria: ["Animation timing is documented."],
            testPlan: { unit: [], integration: [], visual: ["Capture animation screenshot."], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false, snapshotRunId: run.id, snapshotKind: "final" },
    );

    expect(afterLaterSection.cards.find((candidate) => candidate.sourceId === "synthesis:animated-shell")).toMatchObject({
      id: shell.id,
      title: "Create polished animated shell",
      description: "Pi proposes a richer animated shell before ticketization.",
      status: "draft",
      orchestrationTaskId: undefined,
    });
    expect(afterLaterSection.cards.find((candidate) => candidate.sourceId === "synthesis:style-pass")).toMatchObject({
      status: "draft",
      candidateStatus: "ready_to_create",
      blockedBy: ["synthesis:animated-shell"],
    });

    const ticketized = store.createReadyProjectBoardTasks(board.id);
    expect(ticketized.map((card) => card.sourceId).sort()).toEqual(["synthesis:animated-shell", "synthesis:style-pass"]);
    expect(ticketized.find((card) => card.sourceId === "synthesis:animated-shell")).toMatchObject({
      id: shell.id,
      status: "ready",
      orchestrationTaskId: expect.any(String),
    });
    expect(store.listOrchestrationTasks().filter((task) => task.sourceKind === "project_board_card")).toHaveLength(2);
  });

  it("blocks ready synthesis cards that are newer than the latest stable planning snapshot", () => {
    const board = store.createProjectBoard({ title: "Stale snapshot board" });
    store.updateProjectBoardStatus(board.id, "active");
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Initial snapshot.",
        goal: "Build the initial task.",
        currentState: "Planner produced one ready card.",
        targetUser: "Operator.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:initial",
            title: "Create initial task",
            description: "Initial snapshot card.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Initial task is defined."],
            testPlan: { unit: ["Inspect task."], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false, snapshotRunId: run.id, snapshotKind: "incremental" },
    );
    store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "board_applied",
      title: "Applied initial snapshot",
      summary: "Initial snapshot is stable.",
      status: "succeeded",
      cardCount: 1,
      completedAt: new Date().toISOString(),
    });
    const stale = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Uncaptured later draft.",
        goal: "Build the initial task and a later task.",
        currentState: "A later draft appeared after the stable snapshot.",
        targetUser: "Operator.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:initial",
            title: "Create initial task",
            description: "Initial snapshot card.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Initial task is defined."],
            testPlan: { unit: ["Inspect task."], integration: [], visual: [], manual: [] },
          },
          {
            sourceId: "synthesis:later",
            title: "Create later task",
            description: "This ready draft was not captured in a stable snapshot.",
            candidateStatus: "ready_to_create",
            priority: 2,
            phase: "Follow-up",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Later task is defined."],
            testPlan: { unit: ["Inspect later task."], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    expect(stale.cards.find((card) => card.sourceId === "synthesis:later")).toMatchObject({ candidateStatus: "ready_to_create" });
    expect(() => store.createReadyProjectBoardTasks(board.id)).toThrow("not part of the latest stable planning snapshot");
    expect(store.listOrchestrationTasks().filter((task) => task.sourceKind === "project_board_card")).toHaveLength(0);
  });

  it("allows ready task creation after a synthesis pause checkpoint is finalized", () => {
    const board = store.createProjectBoard({ title: "Paused planner board" });
    store.updateProjectBoardStatus(board.id, "active");
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create contrast fixture",
      description: "Create the fixture after planner output is paused.",
    });
    store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Fixture exists."],
      testPlan: { unit: ["Inspect fixture JSON."], integration: [], visual: [], manual: [] },
    });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    store.requestProjectBoardSynthesisRunPause({
      boardId: board.id,
      runId: run.id,
      reason: "The desktop process restarted after progressive cards were saved.",
    });

    expect(() => store.createReadyProjectBoardTasks(board.id)).toThrow("planning is still running");

    store.markProjectBoardSynthesisRunPaused({
      boardId: board.id,
      runId: run.id,
      reason: "No active planner stream remains after restart.",
      metadata: { orphanedPauseRequest: true },
    });

    const [ticketized] = store.createReadyProjectBoardTasks(board.id);
    expect(ticketized).toMatchObject({ id: card.id, status: "ready", orchestrationTaskId: expect.any(String) });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toBeUndefined();
  });

  it("blocks ready task creation until the project board charter is active", () => {
    const board = store.createProjectBoard({ title: "Draft charter board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create fixtures",
      description: "Create fixture files after charter activation.",
    });
    store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Fixtures exist."],
      testPlan: { unit: ["Run fixture smoke."], integration: [], visual: [], manual: [] },
    });

    expect(() => store.createReadyProjectBoardTasks(board.id)).toThrow("charter must be active");
    expect(store.getProjectBoardCard(card.id)).toMatchObject({ status: "draft", orchestrationTaskId: undefined });

    store.updateProjectBoardStatus(board.id, "active");
    const [ticketized] = store.createReadyProjectBoardTasks(board.id);
    expect(ticketized).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
  });
});
