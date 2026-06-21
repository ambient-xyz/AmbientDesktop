import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board candidate edit facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("keeps unclear, evidence, and rejected candidate cards out of executable tasks", () => {
    const thread = store.createThread("Candidate planning thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nClarify and ship." });
    const unclearArtifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Needs scope plan",
      summary: "Needs a user decision before execution.",
      content: message.content,
      steps: [{ id: "step-1", title: "Decide final scope." }],
      openQuestions: ["Which workflow should be prioritized?"],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });
    const evidenceThread = store.createThread("Evidence planning thread");
    const evidenceMessage = store.addMessage({ threadId: evidenceThread.id, role: "assistant", content: "## Plan\nRecord completed work." });
    const evidenceArtifact = store.createPlannerPlanArtifact({
      threadId: evidenceThread.id,
      sourceMessageId: evidenceMessage.id,
      title: "Evidence plan",
      summary: "This may already be done.",
      content: "## Plan\nRecord completed work.",
      steps: [{ id: "step-1", title: "Record completed proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Manual review."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Candidate board" });
    const unclearCard = store.promotePlannerPlanToBoard(unclearArtifact.id);
    const evidenceCard = store.promotePlannerPlanToBoard(evidenceArtifact.id);

    expect(unclearCard).toMatchObject({ status: "draft", candidateStatus: "needs_clarification" });
    expect(() => store.approveProjectBoardCard(unclearCard.id)).toThrow("Only ready-to-create");
    expect(() => store.updateProjectBoardCardCandidateStatus(unclearCard.id, "ready_to_create")).toThrow("Clarification questions");

    const clarifiedCard = store.updateProjectBoardCard({
      cardId: unclearCard.id,
      clarificationQuestions: [],
      clarificationAnswers: [
        {
          question: "Which workflow should be prioritized?",
          answer: "Prioritize the current project-board workflow.",
          answeredAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(clarifiedCard.clarificationQuestions).toEqual([]);
    expect(clarifiedCard.clarificationDecisions?.filter((decision) => decision.state === "open")).toEqual([]);
    // Answering the last open clarification auto-promotes the candidate inside
    // updateProjectBoardCard, so no explicit status transition (or
    // candidate_status_changed event) happens for this card anymore.
    expect(clarifiedCard.candidateStatus).toBe("ready_to_create");

    const ready = store.updateProjectBoardCardCandidateStatus(unclearCard.id, "ready_to_create");
    expect(ready.candidateStatus).toBe("ready_to_create");
    const approved = store.approveProjectBoardCard(unclearCard.id);
    expect(approved).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });

    const evidence = store.updateProjectBoardCardCandidateStatus(evidenceCard.id, "evidence");
    expect(evidence).toMatchObject({ candidateStatus: "evidence", orchestrationTaskId: undefined });
    expect(() => store.approveProjectBoardCard(evidenceCard.id)).toThrow("Only ready-to-create");

    const rejected = store.updateProjectBoardCardCandidateStatus(evidenceCard.id, "rejected");
    expect(rejected).toMatchObject({ candidateStatus: "rejected", orchestrationTaskId: undefined });
    expect(store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "candidate_status_changed").map((event) => event.metadata)).toEqual([
      expect.objectContaining({ cardId: evidenceCard.id, from: "evidence", to: "rejected" }),
      expect.objectContaining({ cardId: evidenceCard.id, from: "ready_to_create", to: "evidence" }),
    ]);
  });

  it("enforces strict project board proof before ready state and approval", () => {
    const board = store.createProjectBoard({ title: "Strict proof board" });
    const thread = store.createThread("Strict proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip without proof first." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Proof-gated card",
      summary: "Should need proof before ticketization.",
      content: message.content,
      steps: [{ id: "step-1", title: "Build the gated behavior." }],
      openQuestions: [],
      risks: [],
      verification: ["Manual proof."],
      decisionQuestions: [],
    });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    store.updateProjectBoardCard({ cardId: card.id, testPlan: { unit: [], integration: [], visual: [], manual: [] } });

    const answers = [
      "Ship strict proof gating.",
      "Use project sources as supporting context.",
      "Proceed when scope is clear.",
      "Require proof before ready or approval.",
      "Keep rerunning proof-gated cards until proof is present or blocked.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, answers[index]);
    }
    expect(store.finalizeProjectBoardKickoff(board.id).charter?.testPolicy).toMatchObject({
      requireProofSpec: true,
      proofScopeWarningPolicy: "advisory",
    });

    expect(() => store.approveProjectBoardCard(card.id)).toThrow("Strict project board proof policy");
    expect(store.updateProjectBoardCardCandidateStatus(card.id, "needs_clarification")).toMatchObject({ candidateStatus: "needs_clarification" });
    expect(() => store.updateProjectBoardCardCandidateStatus(card.id, "ready_to_create")).toThrow("Strict project board proof policy");
    expect(() => store.updateProjectBoardCard({ cardId: card.id, candidateStatus: "ready_to_create" })).toThrow("Strict project board proof policy");

    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
    });
    expect(ready).toMatchObject({ candidateStatus: "ready_to_create", testPlan: { manual: ["Manual proof."] } });
    expect(store.approveProjectBoardCard(card.id)).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
  });

  it("edits candidate card details before ticketization and persists the update", () => {
    const thread = store.createThread("Candidate edit thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nEdit the candidate." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Editable candidate",
      summary: "Initial summary.",
      content: message.content,
      steps: [{ id: "step-1", title: "Initial criterion." }],
      openQuestions: [],
      risks: [],
      verification: ["Initial manual proof."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Editable board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const blocker = store.createOrchestrationTask({ title: "Prerequisite task", state: "review" });
    const updated = store.updateProjectBoardCard({
      cardId: card.id,
      title: " Updated candidate ",
      description: " Updated self-contained description. ",
      candidateStatus: "needs_clarification",
      priority: 101,
      phase: " Phase 2 ",
      labels: ["UI", "ui", "QA"],
      blockedBy: [blocker.identifier, blocker.identifier, " card:other "],
      acceptanceCriteria: ["One", "Two", "One", " "],
      sourceRefs: ["docs/spec.md", "docs/spec.md"],
      clarificationQuestions: [
        "Does 'classic rotation' strictly prohibit any modern control additions (e.g., strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?",
        "Does 'classic rotation' strictly prohibit modern control additions (strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?",
      ],
      clarificationAnswers: [
        {
          question:
            "Does 'classic rotation' strictly prohibit modern control additions (strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?",
          answer: "Use the project charter route.",
          answeredAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      testPlan: {
        unit: ["Unit proof", "Unit proof"],
        integration: ["Integration proof"],
        visual: ["Visual proof"],
        manual: ["Manual proof"],
      },
    });

    expect(updated).toMatchObject({
      title: "Updated candidate",
      description: "Updated self-contained description.",
      candidateStatus: "needs_clarification",
      priority: 100,
      phase: "Phase 2",
      labels: ["ui", "qa"],
      blockedBy: [blocker.identifier, "card:other"],
      acceptanceCriteria: ["One", "Two"],
      sourceRefs: ["docs/spec.md"],
      clarificationQuestions: [
        "Does 'classic rotation' strictly prohibit any modern control additions (e.g., strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?",
      ],
      clarificationAnswers: [
        {
          question:
            "Does 'classic rotation' strictly prohibit modern control additions (strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?",
          answer: "Use the project charter route.",
          answeredAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      testPlan: {
        unit: ["Unit proof"],
        integration: ["Integration proof"],
        visual: ["Visual proof"],
        manual: ["Manual proof"],
      },
    });
    expect(() => store.approveProjectBoardCard(card.id)).toThrow("Only ready-to-create");

    const approved = store.approveProjectBoardCard(
      store.updateProjectBoardCard({ cardId: card.id, candidateStatus: "ready_to_create" }).id,
    );
    expect(approved.orchestrationTaskId).toBeTruthy();
    const approvedTask = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(approvedTask.blockedBy).toEqual([blocker.identifier, "card:other"]);
    expect(approvedTask.description ?? "").toContain("Dependencies / blockers:");
    expect(approvedTask.description ?? "").toContain(`- ${blocker.identifier}`);
    expect(store.getActiveProjectBoard()?.events?.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["card_updated", "card_ticketized"]),
    );
    expect(() => store.updateProjectBoardCard({ cardId: card.id, title: "Too late" })).toThrow("before ticketization");
  });

  it("requires clarification answers before a draft candidate can be marked ready", () => {
    const board = store.createProjectBoard({ title: "Clarification gate board" });
    const card = store.createProjectBoardManualCard({ boardId: board.id, title: "Clarify controls" });
    const sibling = store.createProjectBoardManualCard({ boardId: board.id, title: "Document controls" });

    store.updateProjectBoardCard({
      cardId: card.id,
      acceptanceCriteria: ["Ship responds to input."],
      testPlan: { unit: ["Test input reducer."], integration: [], visual: [], manual: [] },
      clarificationQuestions: ["Should controls use arcade movement or inertia-based thrust?"],
    });
    store.updateProjectBoardCard({
      cardId: sibling.id,
      description: "Document the selected control scheme.",
      acceptanceCriteria: ["Control scheme is documented."],
      clarificationQuestions: ["Should controls use arcade movement or inertia-based thrust?"],
    });

    expect(() => store.updateProjectBoardCard({ cardId: card.id, candidateStatus: "ready_to_create" })).toThrow(
      "Clarification questions must be answered",
    );

    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      clarificationAnswers: [
        {
          question: "Should controls use arcade movement or inertia-based thrust?",
          answer: "Use inertia-based thrust.",
          answeredAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

    expect(ready).toMatchObject({
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      clarificationAnswers: [
        expect.objectContaining({
          answer: "Use inertia-based thrust.",
        }),
      ],
    });

    const event = store
      .getActiveProjectBoard()
      ?.events?.filter((candidate) => candidate.kind === "card_updated" && candidate.title === "Clarification decision answered")
      .at(-1);
    expect(event?.summary).toContain("0 model calls");
    expect(event?.metadata).toMatchObject({
      decisionImpact: {
        triggerType: "clarification_answer",
        modelCallRequired: false,
        targetedRefreshOptional: true,
        affectedCounts: {
          unblockedDrafts: 2,
        },
        affectedCardIds: expect.arrayContaining([card.id, sibling.id]),
      },
    });
  });
});
