import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectBoardArtifactExportFromSummary } from "./projectStoreProjectBoardFacade";
import { projectBoardArtifactProjectionFromFiles } from "./projectStoreProjectBoardFacade";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board lifecycle facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("archives a project board so a replacement can be created", () => {
    const first = store.createProjectBoard({ title: "First board" });
    const archived = store.updateProjectBoardStatus(first.id, "archived");
    const second = store.createProjectBoard({ title: "Second board" });

    expect(archived.status).toBe("archived");
    expect(second.id).not.toBe(first.id);
    expect(store.getActiveProjectBoard()).toMatchObject({ id: second.id, title: "Second board" });
  });

  it("resets a project board while preserving Local Task history", () => {
    const board = store.createProjectBoard({ title: "Resettable board" });
    const task = store.createOrchestrationTask({
      title: "Existing task",
      description: "Preserved outside the board.",
      state: "ready",
      labels: ["project-board"],
    });
    store.replaceProjectBoardSources(board.id, [
      {
        kind: "architecture_artifact",
        title: "Architecture notes",
        summary: "Board source context.",
        path: "architecture.md",
        relevance: 80,
      },
    ]);
    const manual = store.createProjectBoardManualCard({ boardId: board.id, title: "Manual candidate" });
    const attached = store.attachLocalTaskToProjectBoard({ taskId: task.id, mode: "attach" });
    const preparedRun = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier),
    });
    const completedRun = store.updateOrchestrationRun({
      id: preparedRun.id,
      status: "completed",
      proofOfWork: {
        summary: "Proof that should reset with the board.",
        commands: ["pnpm test"],
        changedFiles: ["src/App.tsx"],
        handoff: {
          completed: ["Reset artifact was projected."],
          remaining: [],
          risks: [],
          followUps: [],
        },
      },
      finish: true,
      reviewProjectBoardProof: false,
    });
    const projectedWithArtifact = store.applyProjectBoardArtifactProjection(
      workspacePath,
      projectBoardArtifactProjectionFromFiles(
        projectBoardArtifactExportFromSummary(store.getProjectBoard(board.id)!, {
          runtime: { tasks: [store.getOrchestrationTask(task.id)], runs: [completedRun] },
        }).files,
      ),
    );
    const proposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      model: "test-model",
      synthesis: {
        summary: "Reset proposal.",
        goal: "Prove reset deletes proposal state.",
        currentState: "Board exists.",
        targetUser: "Project manager.",
        qualityBar: "Proof required.",
        assumptions: ["Reset should clear board-owned state."],
        questions: ["Should reset preserve Local Tasks?"],
        sourceNotes: ["Architecture notes are board-owned source review."],
        cards: [
          {
            sourceId: "reset-card",
            title: "Generated reset card",
            description: "Generated card that should be removed with the board.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Reset",
            labels: ["reset"],
            blockedBy: [],
            acceptanceCriteria: ["Board reset removes this candidate."],
            testPlan: { unit: ["Exercise reset behavior."], integration: [], visual: [], manual: [] },
            sourceRefs: ["architecture.md"],
          },
        ],
      },
    });
    const synthesisRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    store.recordProjectBoardSynthesisRunEvent(synthesisRun.id, {
      stage: "proposal_created",
      title: "Proposal ready",
      summary: "Stored run state should be reset with the board.",
      status: "succeeded",
      proposalId: proposal.id,
      completedAt: "2026-05-02T12:00:00.000Z",
    });

    expect(store.getActiveProjectBoard()).toMatchObject({
      id: board.id,
      cards: expect.arrayContaining([
        expect.objectContaining({ id: manual.id }),
        expect.objectContaining({ id: attached.id, orchestrationTaskId: task.id }),
      ]),
      sources: [expect.objectContaining({ path: "architecture.md" })],
      proposals: [expect.objectContaining({ id: proposal.id })],
      synthesisRuns: [expect.objectContaining({ id: synthesisRun.id })],
      executionArtifacts: [
        expect.objectContaining({
          id: completedRun.id,
          cardId: attached.id,
          proof: expect.objectContaining({ commands: ["pnpm test"], changedFiles: ["src/App.tsx"] }),
        }),
      ],
    });
    expect(projectedWithArtifact.executionArtifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: completedRun.id, cardId: attached.id })]),
    );

    store.resetProjectBoard(board.id);

    expect(store.getActiveProjectBoard()).toBeUndefined();
    expect(() => store.getProjectBoardCharter(board.charterId!)).toThrow("Project board charter not found");
    expect(store.getProjectBoardSynthesisProposal(proposal.id)).toBeUndefined();
    expect(store.listOrchestrationTasks().map((candidate) => candidate.id)).toContain(task.id);
    expect(store.getOrchestrationRun(completedRun.id)).toMatchObject({ id: completedRun.id, taskId: task.id });

    const replacement = store.createProjectBoard({ title: "Replacement board" });
    expect(replacement.id).not.toBe(board.id);
    expect(replacement.cards).toEqual([]);
    expect(replacement.executionArtifacts).toEqual([]);
    expect(() => store.resetProjectBoard(board.id)).toThrow("Project board not found");
  });

  it("starts board revisions with a new draft charter, preserved answers, and cancel support", () => {
    const board = store.createProjectBoard({ title: "Revision board" });
    const originalCharterId = board.charterId!;
    const initialAnswers = [
      "Ship the first board charter.",
      "Use existing docs first.",
      "Ask when the scope changes.",
      "Require proof for all user-visible work.",
      "Run cards in dependency order and stop only on explicit blockers.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, initialAnswers[index]);
    }
    const active = store.finalizeProjectBoardKickoff(board.id);
    expect(active).toMatchObject({ status: "active", charter: expect.objectContaining({ version: 1, status: "active" }) });

    const revision = store.startProjectBoardRevision({ boardId: board.id, reason: "Product direction changed." });

    expect(revision).toMatchObject({
      status: "draft",
      summary: "Product direction changed.",
      charter: expect.objectContaining({ version: 2, status: "draft" }),
    });
    expect(store.getProjectBoardCharter(originalCharterId).status).toBe("superseded");
    expect(revision.questions.map((question) => question.answer)).toEqual(initialAnswers);
    expect(revision.events?.[0]).toMatchObject({
      kind: "board_revision_started",
      title: "Board revision started",
      entityId: revision.charterId,
      metadata: expect.objectContaining({ previousCharterId: originalCharterId, version: 2 }),
    });

    const canceled = store.cancelProjectBoardRevision(board.id);
    expect(canceled).toMatchObject({
      status: "active",
      charterId: originalCharterId,
      charter: expect.objectContaining({ version: 1, status: "active" }),
    });
    expect(store.getProjectBoardCharter(revision.charterId!).status).toBe("superseded");

    store.startProjectBoardRevision({ boardId: board.id, reason: "Product direction changed again." });

    const revisedAnswers = [
      "Ship the revised board charter.",
      "Treat revised docs as authoritative.",
      "Document assumptions after one clear pass.",
      "Require unit or integration proof.",
      "Sequence revised cards by blockers before priority.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, revisedAnswers[index]);
    }
    const revisedActive = store.finalizeProjectBoardKickoff(board.id);
    expect(revisedActive).toMatchObject({
      status: "active",
      summary: "Ship the revised board charter.",
      charter: expect.objectContaining({ version: 3, status: "active", goal: "Ship the revised board charter." }),
    });
    expect(revisedActive.events?.[0]).toMatchObject({
      kind: "charter_finalized",
      metadata: expect.objectContaining({ version: 3 }),
    });
  });

  it("creates manual draft cards in the board draft inbox", () => {
    const board = store.createProjectBoard({ title: "Manual board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "  Ad hoc QA pass  ",
      description: "  Check the end-to-end board flow.  ",
    });

    expect(card).toMatchObject({
      boardId: board.id,
      title: "Ad hoc QA pass",
      description: "Check the end-to-end board flow.",
      status: "draft",
      candidateStatus: "needs_clarification",
      labels: ["manual"],
      blockedBy: [],
      acceptanceCriteria: ["Define the intended outcome before ticketization."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      orchestrationTaskId: undefined,
    });
    expect(card.sourceId).toMatch(/^manual:/);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "manual_card_created",
      title: "Manual draft card created",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: expect.objectContaining({ cardId: card.id, sourceKind: "manual" }),
    });

    const answers = [
      "Ship strict manual card ticketization.",
      "Use project docs as source context.",
      "Ask before making irreversible calls.",
      "Require proof before ready or approval.",
      "Execute manually approved cards in dependency order.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, answers[index]);
    }
    store.finalizeProjectBoardKickoff(board.id);

    expect(() => store.updateProjectBoardCardCandidateStatus(card.id, "ready_to_create")).toThrow("Strict project board proof policy");
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Manual card is fully scoped."],
      testPlan: { unit: [], integration: ["Run project board smoke."], visual: [], manual: [] },
    });
    expect(ready).toMatchObject({ candidateStatus: "ready_to_create", acceptanceCriteria: ["Manual card is fully scoped."] });
    expect(store.approveProjectBoardCard(card.id)).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
  });
});
