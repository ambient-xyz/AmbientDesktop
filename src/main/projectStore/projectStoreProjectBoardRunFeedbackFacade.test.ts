import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board run feedback facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("adds additive next-run feedback to ticketized cards without rewriting approved fields", () => {
    const board = store.createProjectBoard({ title: "Run feedback board" });
    const card = store.createProjectBoardManualCard({ boardId: board.id, title: "Render hello world" });
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      description: "Render a hello world page.",
      acceptanceCriteria: ["Page says hello world."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Open the page and verify the text."] },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const taskBefore = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(taskBefore.description).not.toContain("Use the PM-approved copy");

    const updated = store.addProjectBoardCardRunFeedback({
      cardId: approved.id,
      feedback: "Use the PM-approved copy exactly: Hello from Ambient.",
      source: "decision_impact",
      decisionQuestion: "What text should the page display?",
      decisionAnswer: "Hello from Ambient.",
    });

    expect(updated).toMatchObject({
      id: approved.id,
      title: "Render hello world",
      description: "Render a hello world page.",
      runFeedback: [
        expect.objectContaining({
          source: "decision_impact",
          feedback: "Use the PM-approved copy exactly: Hello from Ambient.",
          decisionAnswer: "Hello from Ambient.",
        }),
      ],
    });
    const taskAfter = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(taskAfter.description).toContain("Next-run feedback / additive PM instructions:");
    expect(taskAfter.description).toContain("Use the PM-approved copy exactly: Hello from Ambient.");
    expect(() => store.updateProjectBoardCard({ cardId: approved.id, title: "Rewrite approved card" })).toThrow("before ticketization");

    const event = store
      .getActiveProjectBoard()
      ?.events?.filter((candidate) => candidate.kind === "card_updated" && candidate.title === "Run feedback added")
      .at(-1);
    expect(event?.metadata).toMatchObject({
      runFeedback: {
        source: "decision_impact",
        decisionQuestion: "What text should the page display?",
        modelCallRequired: false,
      },
    });
  });

  it("applies clarification impact as next-run feedback for linked ticketized cards", () => {
    const board = store.createProjectBoard({ title: "Decision impact apply board" });
    const question = "What greeting should the app render?";
    const answer = "Hello from Ambient.";
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Choose greeting copy" });
    store.updateProjectBoardCard({
      cardId: draft.id,
      description: "Decide the greeting copy before final implementation.",
      acceptanceCriteria: ["Greeting copy is selected."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Confirm PM answer is recorded."] },
      clarificationQuestions: [question],
    });
    const linked = store.createProjectBoardManualCard({ boardId: board.id, title: "Render greeting" });
    const linkedReady = store.updateProjectBoardCard({
      cardId: linked.id,
      description: `Render the greeting in the HTML app.\n${question}`,
      acceptanceCriteria: ["The app renders the PM-approved greeting."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Open the app and confirm the greeting text."] },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(linkedReady.id);

    const updatedDraft = store.applyProjectBoardDecisionImpactFeedback({ cardId: draft.id, question, answer });

    expect(updatedDraft.clarificationAnswers).toEqual([
      expect.objectContaining({
        question,
        answer,
      }),
    ]);
    const updatedLinked = store.getProjectBoardCard(approved.id);
    expect(updatedLinked).toMatchObject({
      title: "Render greeting",
      description: `Render the greeting in the HTML app.\n${question}`,
      runFeedback: [
        expect.objectContaining({
          source: "decision_impact",
          decisionQuestion: question,
          decisionAnswer: answer,
        }),
      ],
    });
    const taskAfter = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(taskAfter.description).toContain("Next-run feedback / additive PM instructions:");
    expect(taskAfter.description).toContain(answer);
    expect(() => store.updateProjectBoardCard({ cardId: approved.id, title: "Rewrite approved card" })).toThrow("before ticketization");

    store.applyProjectBoardDecisionImpactFeedback({ cardId: draft.id, question, answer });
    expect(store.getProjectBoardCard(approved.id).runFeedback).toHaveLength(1);

    const events = store.getActiveProjectBoard()?.events ?? [];
    expect(events.some((event) => event.title === "Run feedback added")).toBe(true);
    const appliedEvent = events.filter((event) => event.title === "Decision impact applied").at(-1);
    expect(appliedEvent?.metadata).toMatchObject({
      decisionImpact: {
        appliedAction: "create_next_run_feedback",
        modelCallRequired: false,
        affectedCardIds: expect.arrayContaining([approved.id]),
        appliedCardIds: expect.arrayContaining([approved.id]),
      },
    });
  });

  it("applies a ticketized clarification decision as additive next-run feedback without rewriting approved fields", () => {
    const board = store.createProjectBoard({ title: "Ticketized decision board" });
    const question = "Should the hero greeting use pulse or confetti?";
    const answer = "Use a subtle pulse animation.";
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Render animated greeting" });
    store.updateProjectBoardCard({
      cardId: draft.id,
      description: `Render the greeting.\n${question}`,
      acceptanceCriteria: ["The greeting renders with the approved animation."],
      testPlan: { unit: ["Greeting text exists."], integration: [], visual: ["Capture the animated greeting."], manual: [] },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(draft.id);

    const updated = store.applyProjectBoardDecisionImpactFeedback({ cardId: approved.id, question, answer });

    expect(updated).toMatchObject({
      title: "Render animated greeting",
      description: `Render the greeting.\n${question}`,
      clarificationAnswers: [expect.objectContaining({ question, answer })],
      runFeedback: [
        expect.objectContaining({
          source: "decision_impact",
          decisionQuestion: question,
          decisionAnswer: answer,
        }),
      ],
    });
    const taskAfter = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(taskAfter.description).toContain("Next-run feedback / additive PM instructions:");
    expect(taskAfter.description).toContain(answer);
    expect(taskAfter.description).toContain("Apply this PM decision in the next run without rewriting the approved card silently.");

    store.applyProjectBoardDecisionImpactFeedback({ cardId: approved.id, question, answer });
    expect(store.getProjectBoardCard(approved.id).runFeedback).toHaveLength(1);
    expect(store.getProjectBoardCard(approved.id).clarificationAnswers).toHaveLength(1);

    const events = store.getActiveProjectBoard()?.events ?? [];
    expect(events.some((event) => event.title === "Clarification decision answered")).toBe(true);
    expect(events.some((event) => event.title === "Decision impact applied")).toBe(true);
  });

  it("refreshes affected draft questions from one clarification answer without a model call", () => {
    const board = store.createProjectBoard({ title: "Decision draft refresh board" });
    const canonicalQuestion = "Should numpad operators map directly to calculator operators?";
    const variantQuestion = "Should numpad operators map directly to calculator operators?";
    const answer = "Support direct numpad operator mappings.";
    const source = store.createProjectBoardManualCard({ boardId: board.id, title: "Choose keyboard policy" });
    store.updateProjectBoardCard({
      cardId: source.id,
      description: "Resolve the keyboard policy.",
      acceptanceCriteria: ["The keyboard policy is recorded."],
      testPlan: { unit: ["Decision is captured."], integration: [], visual: [], manual: [] },
      clarificationQuestions: [canonicalQuestion],
    });
    const affected = store.createProjectBoardManualCard({ boardId: board.id, title: "Implement keyboard input" });
    store.updateProjectBoardCard({
      cardId: affected.id,
      description: `Implement keyboard input.\n${variantQuestion}`,
      acceptanceCriteria: ["Keyboard input follows the PM-approved policy."],
      testPlan: { unit: ["Keyboard unit tests pass."], integration: [], visual: [], manual: [] },
      clarificationQuestions: [variantQuestion],
    });

    const refreshed = store.refreshProjectBoardDecisionDrafts({ cardId: source.id, question: canonicalQuestion, answer });

    expect(refreshed.clarificationQuestions).toEqual([]);
    expect(refreshed.clarificationAnswers).toEqual([
      expect.objectContaining({
        question: canonicalQuestion,
        answer,
      }),
    ]);
    const refreshedAffected = store.getProjectBoardCard(affected.id);
    expect(refreshedAffected.clarificationQuestions).toEqual([]);
    expect(refreshedAffected.clarificationAnswers).toEqual([
      expect.objectContaining({
        question: variantQuestion,
        answer,
      }),
    ]);
    expect(refreshedAffected.description).toContain("## Clarifications");
    expect(refreshedAffected.description).toContain(answer);

    store.refreshProjectBoardDecisionDrafts({ cardId: source.id, question: canonicalQuestion, answer });
    expect(store.getProjectBoardCard(affected.id).clarificationAnswers).toHaveLength(1);
    const event = store
      .getActiveProjectBoard()
      ?.events?.filter((candidate) => candidate.title === "Decision drafts refreshed")
      .at(-1);
    expect(event?.metadata).toMatchObject({
      decisionImpact: {
        appliedAction: "refresh_affected_drafts",
        modelCallRequired: false,
        appliedCardIds: expect.arrayContaining([source.id, affected.id]),
      },
    });
  });
});
