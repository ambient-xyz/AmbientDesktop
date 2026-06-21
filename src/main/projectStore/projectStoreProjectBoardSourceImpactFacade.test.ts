import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board source impact facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("records source selection impact without rewriting affected cards", () => {
    const board = store.createProjectBoard({ title: "Source impact board" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Refined durable plan",
        summary: "Durable implementation plan.",
        path: ".ambient/board/plans/App-DurablePlan.html",
        relevance: 95,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Planning chat",
        summary: "Earlier planning conversation.",
        threadId: "thread-1",
        relevance: 70,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan selected as source of truth; chat thread ignored by default.",
      },
    ]);
    const chat = sources.find((source) => source.threadId === "thread-1")!;

    const draft = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Draft from chat" }).id,
      description: "Still being edited by the PM.",
      sourceRefs: [chat.id],
    });
    const readyCandidate = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Ready from chat" }).id,
      description: "Already approved for execution.",
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["The executable card remains approved."],
      testPlan: { unit: ["Run the deterministic source-impact ledger check."], integration: [], visual: [], manual: [] },
      sourceRefs: [chat.id],
    });
    const approved = store.approveProjectBoardCard(readyCandidate.id);

    const included = store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    expect(included).toMatchObject({ id: chat.id, includeInSynthesis: true, authorityRole: "context" });
    const includeEvent = store.getActiveProjectBoard()?.events?.[0];
    expect(includeEvent).toMatchObject({
      kind: "source_updated",
      title: "Source inclusion updated",
      metadata: {
        sourceId: chat.id,
        from: "thread",
        to: "thread",
        includeInSynthesis: true,
        sourceImpact: expect.objectContaining({
          schemaVersion: 1,
          sourceId: chat.id,
          existingCardsRewritten: false,
          modelCallRequired: false,
          additiveSynthesisAvailable: true,
          targetedRefreshOptional: true,
          nextRunFeedbackRecommended: true,
          affectedDraftCount: 1,
          affectedExecutableCount: 1,
          durablePlanPrimaryCount: 1,
          includedChatCount: 1,
          ignoredChatCount: 0,
          selectedObservationCount: 1,
          recommendedAction: "add_next_run_feedback",
        }),
      },
    });
    const includeImpact = includeEvent?.metadata.sourceImpact as Record<string, unknown>;
    expect(includeImpact.affectedDraftCardIds).toEqual(expect.arrayContaining([draft.id]));
    expect(includeImpact.affectedExecutableCardIds).toEqual(expect.arrayContaining([approved.id]));
    expect(includeImpact.groupSourceIds).toEqual(expect.arrayContaining([chat.id]));
    expect(includeImpact.detail).toContain("without rewriting existing cards or calling Pi");
    expect(includeImpact.detail).toContain("additive next-run feedback");
    expect(includeImpact.estimatedPromptChars).toBeGreaterThan(0);

    const excluded = store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: false });
    expect(excluded).toMatchObject({ id: chat.id, includeInSynthesis: false, authorityRole: "ignored" });
    const excludeEvent = store.getActiveProjectBoard()?.events?.[0];
    expect(excludeEvent).toMatchObject({
      kind: "source_updated",
      title: "Source inclusion updated",
      metadata: {
        sourceId: chat.id,
        includeInSynthesis: false,
        sourceImpact: expect.objectContaining({
          schemaVersion: 1,
          sourceId: chat.id,
          existingCardsRewritten: false,
          modelCallRequired: false,
          additiveSynthesisAvailable: false,
          targetedRefreshOptional: true,
          nextRunFeedbackRecommended: true,
          affectedDraftCount: 1,
          affectedExecutableCount: 1,
          durablePlanPrimaryCount: 1,
          includedChatCount: 0,
          ignoredChatCount: 1,
          selectedObservationCount: 0,
          recommendedAction: "add_next_run_feedback",
        }),
      },
    });
    const excludeImpact = excludeEvent?.metadata.sourceImpact as Record<string, unknown>;
    expect(excludeImpact.affectedDraftCardIds).toEqual(expect.arrayContaining([draft.id]));
    expect(excludeImpact.affectedExecutableCardIds).toEqual(expect.arrayContaining([approved.id]));
    expect(excludeImpact.detail).toContain("ignored chats remain inspectable but excluded by default");
  });

  it("refreshes affected source draft notes without rewriting approved cards or calling Pi", () => {
    const board = store.createProjectBoard({ title: "Source draft refresh board" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Tiny Animation Durable Plan",
        summary: "Durable source of truth for a tiny animated hello-world app.",
        path: ".ambient/board/plans/Tiny-Hello-DurablePlan.html",
        relevance: 98,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Brainstorm chat",
        summary: "Earlier chat asks for an animated gradient greeting.",
        threadId: "thread-animated-hello",
        relevance: 65,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan is available; chat stays ignored unless selected.",
      },
    ]);
    const chat = sources.find((source) => source.threadId === "thread-animated-hello")!;

    const draft = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Animate hello-world hero" }).id,
      description: "Create the draft animation task from the durable plan.",
      sourceRefs: [chat.id],
      acceptanceCriteria: ["Animation copy and motion are clear."],
      testPlan: { unit: [], integration: [], visual: ["Capture animated hero at desktop width."], manual: [] },
    });
    const readyCandidate = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Wire local task scaffold" }).id,
      description: "Approved Local Task card that also cites the chat.",
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Local Task scaffold is ready."],
      testPlan: { unit: ["Check generated files exist."], integration: [], visual: [], manual: [] },
      sourceRefs: [chat.id],
    });
    const approved = store.approveProjectBoardCard(readyCandidate.id);

    store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    const sourceEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "source_updated");
    expect(sourceEvent?.metadata.sourceImpact).toMatchObject({
      targetedRefreshOptional: true,
      nextRunFeedbackRecommended: true,
      affectedDraftCardIds: expect.arrayContaining([draft.id]),
      affectedExecutableCardIds: expect.arrayContaining([approved.id]),
      modelCallRequired: false,
    });

    const refreshedBoard = store.refreshProjectBoardSourceDrafts({ boardId: board.id, sourceImpactEventId: sourceEvent!.id });
    const refreshedDraft = refreshedBoard.cards.find((card) => card.id === draft.id)!;
    const untouchedApproved = refreshedBoard.cards.find((card) => card.id === approved.id)!;

    expect(refreshedDraft.description).toContain("## Source impact refresh");
    expect(refreshedDraft.description).toContain("Source authority was refreshed from 1 source-impact record.");
    expect(refreshedDraft.description).toContain("Brainstorm chat");
    expect(refreshedDraft.description).toContain("Existing draft text was not rewritten by Pi");
    expect(untouchedApproved.description).toBe("Approved Local Task card that also cites the chat.");
    expect(untouchedApproved.runFeedback ?? []).toEqual([]);

    const feedbackBoard = store.applyProjectBoardSourceImpactFeedback({ boardId: board.id, sourceImpactEventId: sourceEvent!.id });
    const feedbackApproved = feedbackBoard.cards.find((card) => card.id === approved.id)!;
    expect(feedbackApproved.description).toBe("Approved Local Task card that also cites the chat.");
    expect(feedbackApproved.runFeedback).toEqual([
      expect.objectContaining({
        source: "source_impact",
        sourceImpactEventId: sourceEvent!.id,
        sourceIds: expect.arrayContaining([chat.id]),
      }),
    ]);
    const taskAfterFeedback = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(taskAfterFeedback.description).toContain("Next-run feedback / additive PM instructions:");
    expect(taskAfterFeedback.description).toContain("Source authority changed after this card was approved");
    expect(taskAfterFeedback.description).toContain("Brainstorm chat");
    expect(taskAfterFeedback.description).toContain("Do not rewrite the approved card scope silently");

    store.applyProjectBoardSourceImpactFeedback({ boardId: board.id, sourceImpactEventId: sourceEvent!.id });
    expect(store.getProjectBoardCard(approved.id).runFeedback).toHaveLength(1);

    const feedbackEvent = store.getActiveProjectBoard()?.events?.find((event) => event.title === "Source impact feedback added");
    expect(feedbackEvent?.metadata).toMatchObject({
      sourceImpact: {
        appliedAction: "create_next_run_feedback",
        sourceImpactEventIds: [sourceEvent!.id],
        affectedDraftCardIds: expect.arrayContaining([draft.id]),
        affectedExecutableCardIds: expect.arrayContaining([approved.id]),
        appliedCardIds: [approved.id],
        existingCardsRewritten: false,
        modelCallRequired: false,
      },
    });

    const refreshEvent = store.getActiveProjectBoard()?.events?.find((event) => event.title === "Source drafts refreshed");
    expect(refreshEvent?.metadata).toMatchObject({
      sourceImpact: {
        appliedAction: "refresh_affected_drafts",
        sourceImpactEventIds: [sourceEvent!.id],
        affectedDraftCardIds: expect.arrayContaining([draft.id]),
        affectedExecutableCardIds: expect.arrayContaining([approved.id]),
        appliedCardIds: [draft.id],
        existingCardsRewritten: false,
        modelCallRequired: false,
      },
    });

    store.refreshProjectBoardSourceDrafts({ boardId: board.id, sourceImpactEventId: sourceEvent!.id });
    const refreshedAgain = store.getProjectBoardCard(draft.id);
    expect(refreshedAgain.description.match(/## Source impact refresh/g)).toHaveLength(1);
  });

  it("stages source impact Pi draft refreshes as reviewable updates before rewriting draft specs", () => {
    const board = store.createProjectBoard({ title: "Source Pi refresh board" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Tiny Animation Durable Plan",
        summary: "Durable source of truth for a tiny animated hello-world app.",
        path: ".ambient/board/plans/Tiny-Hello-DurablePlan.html",
        relevance: 98,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Animation color chat",
        summary: "Chat says the animation should use a calm blue pulse.",
        threadId: "thread-blue-pulse",
        relevance: 65,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan is available; chat stays ignored unless selected.",
      },
    ]);
    const chat = sources.find((source) => source.threadId === "thread-blue-pulse")!;

    const animationDraft = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Animate hello-world hero" }).id,
      description: "Create the draft animation task from the durable plan.",
      sourceRefs: [chat.id],
      labels: ["html"],
      acceptanceCriteria: ["Animation copy and motion are clear."],
      testPlan: { unit: [], integration: [], visual: ["Capture animated hero at desktop width."], manual: [] },
    });
    const styleDraft = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Tune animation color system" }).id,
      description: "Tune the colors after the animation exists.",
      sourceRefs: [chat.id],
      labels: ["color"],
      acceptanceCriteria: ["Color treatment is intentional."],
      testPlan: { unit: [], integration: [], visual: ["Capture the color treatment."], manual: [] },
    });
    const readyCandidate = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Wire local task scaffold" }).id,
      description: "Approved Local Task card that also cites the chat.",
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Local Task scaffold is ready."],
      testPlan: { unit: ["Check generated files exist."], integration: [], visual: [], manual: [] },
      sourceRefs: [chat.id],
    });
    const approved = store.approveProjectBoardCard(readyCandidate.id);

    store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    const sourceEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "source_updated");
    expect(sourceEvent?.metadata.sourceImpact).toMatchObject({
      targetedRefreshOptional: true,
      affectedDraftCardIds: expect.arrayContaining([animationDraft.id, styleDraft.id]),
      affectedExecutableCardIds: expect.arrayContaining([approved.id]),
      existingCardsRewritten: false,
      modelCallRequired: false,
    });

    const refreshedBoard = store.stageProjectBoardSourceDraftPiUpdates({
      boardId: board.id,
      sourceImpactEventId: sourceEvent!.id,
      model: "gmi-test-model",
      telemetry: { promptCharCount: 1100, responseCharCount: 420, requestDurationMs: 1900 },
      suggestions: [
        {
          cardId: animationDraft.id,
          description: "Create the draft animation task with a calm blue pulse from the included chat notes.",
          labels: ["html", "animation", "source-refresh"],
          acceptanceCriteria: ["Animation copy and motion are clear.", "Calm blue pulse is visible without confetti."],
          testPlan: {
            unit: [],
            integration: [],
            visual: ["Capture desktop and mobile screenshots showing the calm blue pulse."],
            manual: [],
          },
          clarificationQuestions: [],
          rationale: "The included chat adds a color and motion constraint.",
          confidence: "high",
        },
        {
          cardId: styleDraft.id,
          description: "Tune the animation color system around a calm blue pulse treatment.",
          labels: ["color", "animation"],
          acceptanceCriteria: ["Color treatment is calm and consistent."],
          testPlan: { unit: [], integration: [], visual: ["Capture the blue pulse treatment."], manual: [] },
          clarificationQuestions: [],
          rationale: "The included chat narrows the animation color direction.",
          confidence: "high",
        },
      ],
    });
    const stagedAnimation = refreshedBoard.cards.find((card) => card.id === animationDraft.id)!;
    const stagedStyle = refreshedBoard.cards.find((card) => card.id === styleDraft.id)!;
    const untouchedApproved = refreshedBoard.cards.find((card) => card.id === approved.id)!;

    expect(stagedAnimation.description).toBe("Create the draft animation task from the durable plan.");
    expect(stagedAnimation.pendingPiUpdate).toMatchObject({
      description: "Create the draft animation task with a calm blue pulse from the included chat notes.",
      labels: ["html", "animation", "source-refresh"],
      changedFields: expect.arrayContaining(["description", "labels", "acceptanceCriteria", "testPlan"]),
      clarificationQuestions: [],
    });
    expect(stagedStyle.pendingPiUpdate).toMatchObject({
      description: "Tune the animation color system around a calm blue pulse treatment.",
      clarificationQuestions: [],
    });
    expect(untouchedApproved.pendingPiUpdate).toBeUndefined();
    expect(untouchedApproved.runFeedback ?? []).toEqual([]);

    const applied = store.resolveProjectBoardCardPiUpdate({ cardId: animationDraft.id, action: "apply" });
    expect(applied).toMatchObject({
      description: "Create the draft animation task with a calm blue pulse from the included chat notes.",
      labels: ["html", "animation", "source-refresh"],
      pendingPiUpdate: undefined,
      userTouchedFields: expect.arrayContaining(["description", "labels", "acceptanceCriteria", "testPlan"]),
    });
    expect(store.getProjectBoardCard(styleDraft.id).pendingPiUpdate).toBeTruthy();

    const event = store.getActiveProjectBoard()?.events?.find((candidate) => candidate.title === "Source draft Pi refresh proposed");
    expect(event?.metadata).toMatchObject({
      sourceImpact: expect.objectContaining({
        appliedAction: "propose_targeted_draft_refresh",
        sourceImpactEventIds: [sourceEvent!.id],
        sourceIds: expect.arrayContaining([chat.id]),
        affectedDraftCardIds: expect.arrayContaining([animationDraft.id, styleDraft.id]),
        affectedExecutableCardIds: expect.arrayContaining([approved.id]),
        pendingPiUpdateCardIds: expect.arrayContaining([animationDraft.id, styleDraft.id]),
        existingCardsRewritten: false,
        modelCallRequired: true,
        model: "gmi-test-model",
        telemetry: {
          promptCharCount: 1100,
          responseCharCount: 420,
          requestDurationMs: 1900,
        },
      }),
    });
  });
});
