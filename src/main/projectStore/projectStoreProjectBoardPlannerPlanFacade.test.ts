import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashProjectBoardSourceContent } from "./projectStoreProjectBoardFacade";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board planner-plan facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("saves a durable planner plan into a fresh board when the active board belongs to another thread", () => {
    const oldThread = store.createThread("Time Zone Converter");
    const oldBoard = store.createProjectBoard({ title: "Time Zone Converter board" });
    store.replaceProjectBoardSources(oldBoard.id, [
      {
        kind: "thread",
        title: "Time Zone Converter planning chat",
        summary: "Planning chat from an earlier app.",
        threadId: oldThread.id,
        relevance: 80,
        authorityRole: "context",
        includeInSynthesis: true,
      },
    ]);

    const pickerThread = store.createThread("Local random option picker");
    const pickerMessage = store.addMessage({
      threadId: pickerThread.id,
      role: "assistant",
      content: "Plan: Local Random Option Picker\nScope Contract\nPaste options, click Pick, show one random choice.",
    });
    const pickerArtifact = store.createPlannerPlanArtifact({
      threadId: pickerThread.id,
      sourceMessageId: pickerMessage.id,
      title: "Plan: Local Random Option Picker",
      summary: "Paste options, click Pick, show one random choice.",
      content: pickerMessage.content,
      steps: [
        {
          id: "step-1",
          title: "Implement Local Random Option Picker",
          detail: "Create one self-contained HTML file with textarea input, Pick button, and result display.",
        },
      ],
      openQuestions: [],
      risks: [],
      verification: ["Open index.html and verify picking works."],
    });
    const durableArtifact = store.setPlannerPlanDurableArtifact(pickerArtifact.id, {
      path: ".ambient/board/plans/Local-Random-Option-Picker-DurablePlan.html",
      generatedAt: "2026-06-06T00:00:00.000Z",
    });

    const card = store.promotePlannerPlanToBoard(durableArtifact.id);
    const activeBoard = store.getActiveProjectBoard()!;

    expect(activeBoard.id).not.toBe(oldBoard.id);
    expect(store.getProjectBoard(oldBoard.id)).toMatchObject({ status: "draft", sourceThreadId: oldThread.id });
    expect(card.boardId).toBe(activeBoard.id);
    expect(activeBoard.title).toBe("Local Random Option Picker board");
    expect(activeBoard.sourceThreadId).toBe(pickerThread.id);
    expect(store.getActiveProjectBoard(oldThread.id)?.id).toBe(oldBoard.id);
    expect(store.getActiveProjectBoard(pickerThread.id)?.id).toBe(activeBoard.id);
    expect(activeBoard.sources).toEqual([
      expect.objectContaining({
        artifactId: durableArtifact.id,
        threadId: pickerThread.id,
        authorityRole: "primary",
        includeInSynthesis: true,
      }),
    ]);
  });

  it("promotes a ready planner plan into one idempotent compact card and auto-finalizes kickoff", () => {
    // Planner plans now always stay compact (plannerPlanShouldStayCompact returns
    // true): promotion creates a single durable-plan card instead of per-step cards,
    // and a compact plan with no open questions auto-finalizes board kickoff.
    const thread = store.createThread("Planning thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip the board." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Project board plan",
      summary: "Create the board shell.",
      content: message.content,
      steps: [
        { id: "step-1", title: "Persist board state." },
        { id: "step-2", title: "Render the board surface." },
      ],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Run integration smoke.", "Capture visual screenshots."],
      decisionQuestions: [],
    });

    const card = store.promotePlannerPlanToBoard(artifact.id);
    const board = store.getActiveProjectBoard();
    const duplicate = store.promotePlannerPlanToBoard(artifact.id);
    const cards = store.getActiveProjectBoard()?.cards ?? [];

    expect(duplicate.id).toBe(card.id);
    expect(board).toMatchObject({
      status: "active",
      title: "Project board plan board",
    });
    expect(board?.summary).toContain("Create the board shell.");
    expect(cards).toHaveLength(1);
    expect(card).toMatchObject({
      boardId: board!.id,
      title: "Project board plan",
      status: "draft",
      candidateStatus: "ready_to_create",
      sourceKind: "planner_plan",
      sourceId: artifact.id,
      sourceThreadId: thread.id,
      sourceMessageId: message.id,
      testPlan: {
        unit: ["Run unit tests."],
        integration: ["Run integration smoke."],
        visual: ["Capture visual screenshots."],
      },
    });

    const approved = store.approveProjectBoardCard(card.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const approvedAgain = store.approveProjectBoardCard(card.id);

    expect(approvedAgain.orchestrationTaskId).toBe(task.id);
    expect(approved).toMatchObject({ status: "ready", orchestrationTaskId: task.id });
    expect(task).toMatchObject({
      title: "Project board plan",
      state: "ready",
      sourceKind: "project_board_card",
      labels: expect.arrayContaining(["project-board", "plan"]),
    });
    expect(task.description).toContain("Acceptance criteria:");
    expect(task.description).toContain("Proof expectations:");
    expect(store.getActiveProjectBoard()?.events?.find((event) => event.kind === "plan_promoted")).toMatchObject({
      metadata: expect.objectContaining({ decomposition: "single_card", autoFinalizedCompactPlan: true }),
    });
    expect(store.getActiveProjectBoard()?.events?.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["card_ticketized", "plan_promoted", "board_created"]),
    );
  });

  it("demotes the originating planner-plan card to evidence when a PM-review proposal is applied", () => {
    const thread = store.createThread("Planning thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip the picker." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Picker plan",
      summary: "Build the picker.",
      content: message.content,
      steps: [{ id: "step-1", title: "Build the picker UI." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });
    const planCard = store.promotePlannerPlanToBoard(artifact.id);
    const board = store.getActiveProjectBoard()!;
    expect(planCard).toMatchObject({ status: "draft", candidateStatus: "ready_to_create", sourceKind: "planner_plan" });

    const proposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      synthesis: {
        summary: "Decomposed picker plan.",
        goal: "Build the picker app.",
        currentState: "Plan exists.",
        targetUser: "Picker users.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:picker-ui",
            title: "Implement picker UI",
            description: "Build the picker interface from the plan.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Implementation",
            labels: ["scope:required"],
            blockedBy: [],
            acceptanceCriteria: ["Picker renders options."],
            testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
            sourceRefs: ["plan"],
          },
        ],
      },
    });
    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:picker-ui",
      reviewStatus: "accepted",
    });
    const applied = store.applyProjectBoardSynthesisProposal({ proposalId: proposal.id });

    // The whole-app plan card must not stay ticketizable next to the step cards it
    // spawned; bulk Create Ready Tasks would dispatch it as duplicate work.
    const coveredPlanCard = applied.cards.find((card) => card.id === planCard.id);
    expect(coveredPlanCard).toMatchObject({ candidateStatus: "evidence", sourceKind: "planner_plan" });
    expect(applied.cards.some((card) => card.sourceId === "synthesis:picker-ui")).toBe(true);
    expect(applied.events?.some((event) => event.title === "Planner plan covered by synthesis")).toBe(true);
  });

  it("parks automatic planning while the compact plan card is ticketized or executing", () => {
    const thread = store.createThread("Planning thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip the picker." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Picker plan",
      summary: "Build the picker.",
      content: message.content,
      steps: [{ id: "step-1", title: "Build the picker UI." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });
    const planCard = store.promotePlannerPlanToBoard(artifact.id);
    const board = store.getActiveProjectBoard()!;

    // Fresh draft plan card: planning may proceed.
    expect(store.parkAutomaticPlanningForExecutingPlanCard(board.id)).toBeUndefined();

    // Once the card is ticketized, the automatic pass must park with an audit event.
    store.approveProjectBoardCard(planCard.id);
    const parked = store.parkAutomaticPlanningForExecutingPlanCard(board.id);
    expect(parked?.id).toBe(planCard.id);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      title: "Automatic planning parked",
      metadata: expect.objectContaining({ planningParked: true, executingPlannerPlanCardId: planCard.id }),
    });
  });

  it("persists planner-plan clarification questions on promoted draft cards", () => {
    const thread = store.createThread("Planning thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip the board after one decision." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Project board plan",
      summary: "Create the board shell.",
      content: message.content,
      steps: [{ id: "step-1", title: "Persist board state." }],
      openQuestions: ["Should comma-separated input also be supported?"],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    const card = store.promotePlannerPlanToBoard(artifact.id);

    expect(card).toMatchObject({
      status: "draft",
      candidateStatus: "needs_clarification",
      clarificationQuestions: ["Should comma-separated input also be supported?"],
      clarificationDecisions: [
        expect.objectContaining({
          question: "Should comma-separated input also be supported?",
          state: "open",
        }),
      ],
    });
  });

  it("recovers stale planner step drafts from a compact durable plan when loading the board", () => {
    const thread = store.createThread("Local Random Option Picker planning");
    const message = store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: [
        "## Plan: Local Random Option Picker",
        "A single-page, zero-dependency HTML app that lets you paste options and pick one at random.",
        "No build step, no frameworks, no backend, no auth, no deployment.",
      ].join("\n"),
    });
    const steps = [
      { id: "step-1", title: "Create textarea for one option per line" },
      { id: "step-2", title: "Add Pick button" },
      { id: "step-3", title: "Split textarea by newlines and filter blanks" },
      { id: "step-4", title: "Choose one option with Math.random" },
      { id: "step-5", title: "Display the selected option" },
    ];
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Plan: Local Random Option Picker",
      summary: "A single-page, zero-dependency HTML app that lets you paste options and pick one at random.",
      content: [
        "Scope Contract",
        "Requested: A simple local app where you paste options, click Pick, and see one random choice.",
        "Constraints: No backend, no auth, no deployment.",
        "Assumed: Single HTML file with inline CSS/JS. Pure HTML + CSS + JS in one file.",
        "Out of scope: History of picks, weighted choices, saving/sharing, deployment/build step.",
      ].join("\n"),
      steps,
      openQuestions: [
        "Risk: Minimal - single-file vanilla app with no dependencies",
        'Open question: Should we add a "Clear" button or a history of past picks? (Out of scope for "simple" but easy to add later)',
      ],
      risks: [],
      verification: ["Open random-picker/index.html via browser_local_preview."],
      decisionQuestions: [],
    });
    const board = store.createProjectBoard({
      title: "Local Random Option Picker board",
      summary: artifact.summary,
    });
    const now = new Date().toISOString();
    const db = (store as unknown as { requireDb: () => { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } }).requireDb();
    const insert = db.prepare(
      `INSERT INTO project_board_cards
       (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
        acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id,
        source_thread_id, source_message_id, orchestration_task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    steps.forEach((step, index) => {
      insert.run(
        `stale-step-card-${index + 1}`,
        board.id,
        step.title,
        `Stale step ${index + 1}`,
        "draft",
        "needs_clarification",
        null,
        null,
        JSON.stringify(["plan", "step"]),
        JSON.stringify(index > 0 ? [`${artifact.id}#step:${steps[index - 1].id}`] : []),
        JSON.stringify([step.title]),
        JSON.stringify({ unit: [], integration: [], visual: ["Open random-picker/index.html via browser_local_preview."], manual: [] }),
        JSON.stringify([]),
        JSON.stringify([]),
        "planner_plan",
        `${artifact.id}#step:${step.id}`,
        thread.id,
        message.id,
        null,
        now,
        now,
      );
    });

    expect(store.getProjectBoard(board.id)?.cards).toHaveLength(5);

    const recovered = store.getActiveProjectBoard()!;

    expect(recovered.status).toBe("active");
    expect(recovered.questions.every((question) => question.answer?.trim())).toBe(true);
    expect(recovered.cards).toHaveLength(1);
    expect(recovered.cards[0]).toMatchObject({
      title: "Plan: Local Random Option Picker",
      candidateStatus: "ready_to_create",
      sourceKind: "planner_plan",
      sourceId: artifact.id,
      clarificationQuestions: [],
      acceptanceCriteria: steps.map((step) => step.title),
      labels: ["plan"],
    });
    expect(recovered.events?.find((event) => event.title === "Compact plan recovered")).toMatchObject({
      kind: "plan_promoted",
      metadata: expect.objectContaining({
        artifactId: artifact.id,
        decomposition: "single_card",
        autoFinalizedCompactPlan: true,
        replacedCardIds: steps.map((_, index) => `stale-step-card-${index + 1}`),
      }),
    });
  });

  it("links worktree-backed durable planner artifacts from the project folder as explicit board plan sources", async () => {
    const threadWorkspacePath = join(workspacePath, ".ambient-codex", "worktrees", "planning-thread");
    await mkdir(threadWorkspacePath, { recursive: true });
    const thread = store.createThread("Planning thread", threadWorkspacePath);
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip the board." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Project board plan",
      summary: "Create the board shell.",
      content: message.content,
      steps: [{ id: "step-1", title: "Persist board state." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });
    const durablePath = ".ambient/board/plans/Project-board-plan-DurablePlan.html";
    const durableHtml = "<!doctype html><html><body><main><h1>Project board plan</h1></main></body></html>";
    await mkdir(join(workspacePath, ".ambient", "board", "plans"), { recursive: true });
    await writeFile(join(workspacePath, durablePath), durableHtml, "utf8");
    await expect(access(join(threadWorkspacePath, durablePath))).rejects.toMatchObject({ code: "ENOENT" });
    const finalizing = store.updatePlannerPlanArtifact(artifact.id, { workflowState: "finalizing" });
    const durable = store.setPlannerPlanDurableArtifact(artifact.id, {
      path: durablePath,
      generatedAt: "2026-05-11T00:00:00.000Z",
      validation: { ok: true, checkedAt: "2026-05-11T00:00:00.000Z", errors: [], warnings: [] },
    });
    expect(durable.finalizationAttempt).toMatchObject({
      id: finalizing.finalizationAttempt?.id,
      status: "completed",
      completedAt: expect.any(String),
    });
    store.createProjectBoard({ title: "Execution board" });

    const source = store.promotePlannerDurableArtifactToBoardSource(durable.id);

    expect(source).toMatchObject({
      kind: "plan_artifact",
      artifactId: durable.id,
      path: durablePath,
      contentHash: hashProjectBoardSourceContent(durableHtml),
      byteSize: Buffer.byteLength(durableHtml, "utf8"),
      authorityRole: "primary",
      includeInSynthesis: true,
    });
    expect(store.getActiveProjectBoard()?.events?.find((event) => event.title === "Durable plan linked to board")).toMatchObject({
      kind: "source_updated",
      metadata: expect.objectContaining({
        artifactId: durable.id,
        durablePlanPath: durablePath,
        durablePlanContentHash: hashProjectBoardSourceContent(durableHtml),
        durablePlanGeneratedAt: "2026-05-11T00:00:00.000Z",
        durablePlanValidationOk: true,
      }),
    });

    store.promotePlannerPlanToBoard(durable.id);
    expect(store.getActiveProjectBoard()?.events?.find((event) => event.metadata?.durablePlanContentHash === hashProjectBoardSourceContent(durableHtml))).toMatchObject({
      metadata: expect.objectContaining({
        artifactId: durable.id,
        durablePlanContentHash: hashProjectBoardSourceContent(durableHtml),
      }),
    });
  });
});
