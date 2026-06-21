import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board protected Pi update facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("keeps user-touched synthesis cards and records Pi replacements as reviewable updates", () => {
    const board = store.createProjectBoard({ title: "Progressive merge board" });
    const firstBatch: ProjectBoardSynthesisDraft = {
      summary: "First batch.",
      goal: "Build a spaceship board.",
      currentState: "Pi emitted initial cards.",
      targetUser: "Browser game prototype developer.",
      qualityBar: "Every card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Initial section."],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create game shell",
          description: "Create a nonblank game canvas.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["foundation"],
          blockedBy: [],
          sourceRefs: ["GDD.md#shell"],
          acceptanceCriteria: ["Canvas renders."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        },
        {
          sourceId: "synthesis:controls",
          title: "Implement controls",
          description: "Add keyboard input.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Core",
          labels: ["controls"],
          blockedBy: ["synthesis:shell"],
          sourceRefs: ["GDD.md#controls"],
          acceptanceCriteria: ["Keyboard input moves the ship."],
          testPlan: { unit: ["Input proof."], integration: [], visual: [], manual: [] },
        },
        {
          sourceId: "synthesis:placeholder",
          title: "Placeholder card",
          description: "This untouched draft should be replaced by the next batch.",
          candidateStatus: "needs_clarification",
          priority: 99,
          phase: "Scratch",
          labels: ["placeholder"],
          blockedBy: [],
          sourceRefs: ["notes.md"],
          acceptanceCriteria: ["Placeholder exists."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Manual placeholder."] },
        },
      ],
    };

    const afterFirstBatch = store.applyProjectBoardSynthesis(board.id, firstBatch, { replaceExistingDraft: true, insertQuestions: false });
    const shell = afterFirstBatch.cards.find((card) => card.sourceId === "synthesis:shell");
    const controls = afterFirstBatch.cards.find((card) => card.sourceId === "synthesis:controls");
    expect(shell).toBeTruthy();
    expect(controls).toBeTruthy();

    store.updateProjectBoardCard({ cardId: shell!.id, title: "Create the visible game shell" });
    store.updateProjectBoardCardCandidateStatus(controls!.id, "rejected");

    const afterSecondBatch = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Second batch.",
        sourceNotes: ["Second section."],
        cards: [
          {
            ...firstBatch.cards[0],
            title: "Create the PixiJS game shell",
            description: "Create a PixiJS shell with Matter.js boundaries.",
            labels: ["foundation", "pixijs"],
          },
          {
            ...firstBatch.cards[1],
            title: "Implement hybrid Newtonian controls",
            description: "Use thrust, drift, and compensation jets.",
            candidateStatus: "ready_to_create",
          },
          {
            sourceId: "synthesis:encounters",
            title: "Add enemy encounters",
            description: "Spawn basic hostile drones after the shell and controls exist.",
            candidateStatus: "needs_clarification",
            priority: 3,
            phase: "Core",
            labels: ["encounters"],
            blockedBy: ["synthesis:controls"],
            sourceRefs: ["GDD.md#encounters"],
            acceptanceCriteria: ["A drone can spawn."],
            testPlan: { unit: ["Spawn proof."], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    expect(afterSecondBatch.cards.find((card) => card.sourceId === "synthesis:placeholder")).toBeUndefined();
    expect(afterSecondBatch.cards.find((card) => card.sourceId === "synthesis:encounters")).toMatchObject({
      title: "Add enemy encounters",
      status: "draft",
    });
    const preservedShell = afterSecondBatch.cards.find((card) => card.sourceId === "synthesis:shell");
    expect(preservedShell).toMatchObject({
      id: shell!.id,
      title: "Create the visible game shell",
      userTouchedFields: expect.arrayContaining(["title"]),
      pendingPiUpdate: expect.objectContaining({
        title: "Create the PixiJS game shell",
        description: "Create a PixiJS shell with Matter.js boundaries.",
        changedFields: expect.arrayContaining(["title", "description", "labels"]),
      }),
    });
    const preservedRejected = afterSecondBatch.cards.find((card) => card.sourceId === "synthesis:controls");
    expect(preservedRejected).toMatchObject({
      id: controls!.id,
      candidateStatus: "rejected",
      userTouchedFields: expect.arrayContaining(["candidateStatus"]),
      pendingPiUpdate: expect.objectContaining({
        title: "Implement hybrid Newtonian controls",
        candidateStatus: "ready_to_create",
        changedFields: expect.arrayContaining(["title", "description", "candidateStatus"]),
      }),
    });
    const synthesisEvent = afterSecondBatch.events?.find((event) => event.kind === "board_synthesized");
    expect(synthesisEvent).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({
        protectedPiUpdateCount: 2,
        protectedPiUpdateSourceIds: expect.arrayContaining(["synthesis:shell", "synthesis:controls"]),
        replacedDraftCardCount: 1,
      }),
    });
  });

  it("can apply or ignore pending Pi updates on protected draft cards", () => {
    const board = store.createProjectBoard({ title: "Pi update resolution board" });
    const draft: ProjectBoardSynthesisDraft = {
      summary: "First pass.",
      goal: "Build a spaceship board.",
      currentState: "Initial card exists.",
      targetUser: "Developer.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create game shell",
          description: "Create a nonblank game canvas.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["foundation"],
          blockedBy: [],
          sourceRefs: ["GDD.md#shell"],
          acceptanceCriteria: ["Canvas renders."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        },
      ],
    };
    const first = store.applyProjectBoardSynthesis(board.id, draft, { replaceExistingDraft: true, insertQuestions: false });
    const shell = first.cards.find((card) => card.sourceId === "synthesis:shell");
    expect(shell).toBeTruthy();
    store.updateProjectBoardCard({ cardId: shell!.id, title: "Manual shell title" });
    store.applyProjectBoardSynthesis(
      board.id,
      {
        ...draft,
        cards: [{ ...draft.cards[0], title: "Pi shell title", description: "Pi proposes a richer shell." }],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    const updated = store.resolveProjectBoardCardPiUpdate({ cardId: shell!.id, action: "apply" });
    expect(updated).toMatchObject({
      title: "Pi shell title",
      description: "Pi proposes a richer shell.",
      pendingPiUpdate: undefined,
      userTouchedFields: expect.arrayContaining(["title", "description"]),
    });

    store.applyProjectBoardSynthesis(
      board.id,
      {
        ...draft,
        cards: [{ ...draft.cards[0], title: "Ignored Pi shell title", description: "Ignored description." }],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );
    const ignored = store.resolveProjectBoardCardPiUpdate({ cardId: shell!.id, action: "ignore" });
    expect(ignored).toMatchObject({
      title: "Pi shell title",
      pendingPiUpdate: undefined,
    });
  });

  it("does not restage answered clarification defaults as planning Pi updates", () => {
    const board = store.createProjectBoard({ title: "Answered clarification resynthesis board" });
    const question = "Should numpad operators map directly to calculator operators?";
    const answer = "Map numpad operators directly to matching calculator operators.";
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Keyboard board.",
      goal: "Build keyboard support.",
      currentState: "A draft card needs one PM decision.",
      targetUser: "Calculator user.",
      qualityBar: "Every card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:keyboard",
          title: "Implement keyboard input",
          description: "Handle calculator keyboard input.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Input",
          labels: ["input"],
          blockedBy: [],
          sourceRefs: ["plan.md#keyboard"],
          acceptanceCriteria: ["Numpad operators can be entered from the keyboard."],
          testPlan: { unit: ["Input mapping tests."], integration: [], visual: [], manual: [] },
          clarificationQuestions: [question],
          clarificationSuggestions: [
            {
              question,
              suggestedAnswer: answer,
              rationale: "This is standard calculator behavior and is safe as an implementation default.",
              confidence: "high",
              safeToAccept: true,
              questionKind: "expert_default",
            },
          ],
        },
      ],
    };
    const synthesized = store.applyProjectBoardSynthesis(board.id, synthesisDraft, { replaceExistingDraft: true, insertQuestions: false });
    const keyboard = synthesized.cards.find((card) => card.sourceId === "synthesis:keyboard")!;
    const answeredAt = "2026-01-02T00:00:00.000Z";
    const answered = store.updateProjectBoardCard({
      cardId: keyboard.id,
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      clarificationAnswers: [{ question, answer, answeredAt }],
      clarificationDecisions: (keyboard.clarificationDecisions ?? []).map((decision) => ({
        ...decision,
        state: "answered",
        answer,
        answeredAt,
      })),
    });
    expect(answered).toMatchObject({
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer })],
    });
    (store as unknown as { requireDb: () => { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } })
      .requireDb()
      .prepare("UPDATE project_board_cards SET pending_pi_update_json = ? WHERE id = ?")
      .run(
        JSON.stringify({
          sourceId: "synthesis:keyboard",
          createdAt: answeredAt,
          changedFields: ["candidateStatus", "clarificationDecisions"],
          candidateStatus: "needs_clarification",
          clarificationQuestions: [question],
          clarificationDecisions: (keyboard.clarificationDecisions ?? []).map((decision) => ({
            ...decision,
            state: "open",
            suggestedAnswer: answer,
          })),
        }),
        keyboard.id,
      );
    expect(store.getProjectBoardCard(keyboard.id).pendingPiUpdate).toBeUndefined();

    store.applyProjectBoardSynthesis(board.id, synthesisDraft, { replaceExistingDraft: true, insertQuestions: false });
    expect(store.getProjectBoardCard(keyboard.id).pendingPiUpdate).toBeUndefined();

    store.applyProjectBoardSynthesis(
      board.id,
      {
        ...synthesisDraft,
        cards: [{ ...synthesisDraft.cards[0], title: "Implement keyboard input with settled operator policy" }],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );
    const staged = store.getProjectBoardCard(keyboard.id);
    expect(staged.pendingPiUpdate).toMatchObject({
      title: "Implement keyboard input with settled operator policy",
      changedFields: ["title"],
    });
    expect(staged.pendingPiUpdate?.changedFields).not.toContain("candidateStatus");
    expect(staged.pendingPiUpdate?.changedFields).not.toContain("clarificationQuestions");
    expect(staged.pendingPiUpdate?.changedFields).not.toContain("clarificationDecisions");

    const applied = store.resolveProjectBoardCardPiUpdate({ cardId: keyboard.id, action: "apply" });
    expect(applied).toMatchObject({
      title: "Implement keyboard input with settled operator policy",
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer })],
      pendingPiUpdate: undefined,
    });
  });

  it("stages PM decision draft refreshes as reviewable Pi updates before rewriting draft specs", () => {
    const board = store.createProjectBoard({ title: "Decision refresh board" });
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Animated hello board.",
      goal: "Build a tiny animated hello-world page.",
      currentState: "No implementation exists.",
      targetUser: "Browser user.",
      qualityBar: "Every card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:animation",
          title: "Create animated hello-world page",
          description: "Build a browser page that renders Hello from Ambient.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["html"],
          blockedBy: [],
          sourceRefs: ["DurablePlan.md#animation"],
          acceptanceCriteria: ["Greeting renders."],
          testPlan: { unit: [], integration: ["Run browser smoke."], visual: [], manual: [] },
          clarificationQuestions: ["Should the greeting use a pulse or confetti animation?"],
        },
        {
          sourceId: "synthesis:style",
          title: "Tune greeting animation style",
          description: "Tune the greeting animation style after the base page exists.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Polish",
          labels: ["animation"],
          blockedBy: ["synthesis:animation"],
          sourceRefs: ["DurablePlan.md#animation"],
          acceptanceCriteria: ["Animation style is intentional."],
          testPlan: { unit: [], integration: [], visual: ["Capture animation screenshot."], manual: [] },
          clarificationQuestions: ["Should the greeting use a pulse or confetti animation?"],
        },
        {
          sourceId: "synthesis:approved",
          title: "Prepare approved page shell",
          description: "Approved task that should not be rewritten by decision refresh.",
          candidateStatus: "ready_to_create",
          priority: 3,
          phase: "Foundation",
          labels: ["approved"],
          blockedBy: [],
          sourceRefs: ["DurablePlan.md#shell"],
          acceptanceCriteria: ["Shell task is ready."],
          testPlan: { unit: ["Validate shell helper."], integration: [], visual: [], manual: [] },
        },
      ],
    };
    const synthesized = store.applyProjectBoardSynthesis(board.id, synthesisDraft, { insertQuestions: false });
    const animation = synthesized.cards.find((card) => card.sourceId === "synthesis:animation");
    const style = synthesized.cards.find((card) => card.sourceId === "synthesis:style");
    const approvedDraft = synthesized.cards.find((card) => card.sourceId === "synthesis:approved");
    expect(animation).toBeTruthy();
    expect(style).toBeTruthy();
    expect(approvedDraft).toBeTruthy();
    const approved = store.approveProjectBoardCard(approvedDraft!.id);

    store.stageProjectBoardDecisionDraftPiUpdates({
      cardId: animation!.id,
      question: "Should the greeting use a pulse or confetti animation?",
      answer: "Use a subtle pulse animation.",
      model: "gmi-test-model",
      telemetry: { promptCharCount: 800, responseCharCount: 260, requestDurationMs: 1200 },
      suggestions: [
        {
          cardId: animation!.id,
          description: "Build a browser page that renders Hello from Ambient with a subtle pulse animation.",
          labels: ["html", "animation"],
          acceptanceCriteria: ["Greeting renders.", "Pulse animation is visible but not distracting."],
          testPlan: {
            unit: [],
            integration: ["Run browser smoke."],
            visual: ["Capture desktop and mobile screenshots showing the pulse animation."],
            manual: [],
          },
          clarificationQuestions: [],
          rationale: "The PM selected pulse.",
          confidence: "high",
        },
        {
          cardId: style!.id,
          description: "Tune the greeting pulse animation so it is subtle, accessible, and non-distracting.",
          labels: ["animation", "polish"],
          acceptanceCriteria: ["Pulse timing is subtle.", "Motion remains readable."],
          testPlan: { unit: [], integration: [], visual: ["Capture animation screenshot."], manual: [] },
          clarificationQuestions: [],
          rationale: "Duplicate animation wording resolves to the same PM decision.",
          confidence: "high",
        },
      ],
    });

    const stagedAnimation = store.getProjectBoardCard(animation!.id);
    const stagedStyle = store.getProjectBoardCard(style!.id);
    const untouchedApproved = store.getProjectBoardCard(approved.id);
    expect(stagedAnimation.description).toBe("Build a browser page that renders Hello from Ambient.");
    expect(stagedAnimation.pendingPiUpdate).toMatchObject({
      description: "Build a browser page that renders Hello from Ambient with a subtle pulse animation.",
      changedFields: expect.arrayContaining([
        "description",
        "labels",
        "acceptanceCriteria",
        "testPlan",
        "clarificationQuestions",
        "clarificationAnswers",
        "clarificationDecisions",
      ]),
      clarificationQuestions: [],
      clarificationAnswers: [expect.objectContaining({ answer: "Use a subtle pulse animation." })],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." })],
    });
    expect(stagedStyle.pendingPiUpdate).toMatchObject({
      description: "Tune the greeting pulse animation so it is subtle, accessible, and non-distracting.",
      clarificationQuestions: [],
      clarificationAnswers: [expect.objectContaining({ answer: "Use a subtle pulse animation." })],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." })],
    });
    expect(untouchedApproved.pendingPiUpdate).toBeUndefined();
    expect(untouchedApproved.runFeedback ?? []).toEqual([]);

    const applied = store.resolveProjectBoardCardPiUpdate({ cardId: animation!.id, action: "apply" });
    expect(applied).toMatchObject({
      description: "Build a browser page that renders Hello from Ambient with a subtle pulse animation.",
      labels: ["html", "animation"],
      clarificationQuestions: [],
      pendingPiUpdate: undefined,
      userTouchedFields: expect.arrayContaining(["description", "clarificationAnswers", "clarificationDecisions"]),
    });
    expect(applied.clarificationAnswers).toEqual([expect.objectContaining({ answer: "Use a subtle pulse animation." })]);
    expect(applied.clarificationDecisions).toEqual([expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." })]);

    const event = store.getActiveProjectBoard()?.events?.find((candidate) => candidate.title === "Decision draft Pi refresh proposed");
    expect(event?.metadata).toMatchObject({
      decisionImpact: expect.objectContaining({
        appliedAction: "propose_targeted_draft_refresh",
        modelCallRequired: true,
        pendingPiUpdateCardIds: expect.arrayContaining([animation!.id, style!.id]),
        existingCardsRewritten: false,
        model: "gmi-test-model",
      }),
    });
  });

});
