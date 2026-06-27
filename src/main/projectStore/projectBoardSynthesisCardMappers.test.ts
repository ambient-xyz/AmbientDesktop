import { describe, expect, it } from "vitest";
import {
  objectiveProvenanceJson,
  normalizeProjectBoardObjectiveProvenance,
  normalizeProjectBoardSynthesisProposalAnswer,
  normalizeProjectBoardSynthesisProposalCard,
  projectBoardRunStatusCanCopySession,
  projectBoardSynthesisDraftWithSourceIdNamespace,
  projectBoardSynthesisProposalCardReviewStatus,
  projectBoardSynthesisProposalCardReviewStillApplies,
  projectBoardSynthesisProposalCardsFromDraft,
} from "./projectBoardSynthesisCardMappers";

describe("project board synthesis card mappers", () => {
  it("namespaces synthesis draft source ids and matching blockers", () => {
    const draft = {
      summary: "Draft",
      goal: "Goal",
      currentState: "Current",
      targetUser: "User",
      qualityBar: "Quality",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: " shell ",
          title: "Shell",
          description: "Build shell.",
          candidateStatus: "ready_to_create" as const,
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: "controls",
          title: "Controls",
          description: "Build controls.",
          candidateStatus: "ready_to_create" as const,
          labels: [],
          blockedBy: ["shell", " unknown "],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: "fresh:already",
          title: "Already namespaced",
          description: "Keep existing namespace.",
          candidateStatus: "ready_to_create" as const,
          labels: [],
          blockedBy: ["controls"],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
      ],
    };

    expect(projectBoardSynthesisDraftWithSourceIdNamespace(draft, " ")).toBe(draft);
    expect(projectBoardSynthesisDraftWithSourceIdNamespace(draft, "fresh:")).toMatchObject({
      cards: [
        { sourceId: "fresh:shell", blockedBy: [] },
        { sourceId: "fresh:controls", blockedBy: ["fresh:shell", " unknown "] },
        { sourceId: "fresh:already", blockedBy: ["fresh:controls"] },
      ],
    });
  });

  it("normalizes project board objective provenance conservatively", () => {
    expect(
      normalizeProjectBoardObjectiveProvenance({
        objective: "  Ship the checkout flow  ",
        groundingMode: "selected_sources",
        selectedSourceIds: ["source-1", 7, "source-2", "source-1"],
        sourceRefCount: 2.6,
        sourceGap: "  Missing mobile copy source.  ",
      }),
    ).toEqual({
      objective: "Ship the checkout flow",
      groundingMode: "selected_sources",
      selectedSourceIds: ["source-1", "source-2"],
      sourceRefCount: 3,
      weakGrounding: false,
      sourceGap: "Missing mobile copy source.",
    });
    expect(
      normalizeProjectBoardObjectiveProvenance({
        objective: "Fallback grounding",
        groundingMode: "unsupported",
      }),
    ).toMatchObject({
      groundingMode: "objective_only",
      selectedSourceIds: [],
      sourceRefCount: 0,
      weakGrounding: true,
    });
    expect(normalizeProjectBoardObjectiveProvenance({ objective: "   " })).toBeUndefined();
    expect(normalizeProjectBoardObjectiveProvenance(null)).toBeUndefined();
  });

  it("serializes project board objective provenance JSON only when normalized", () => {
    expect(
      JSON.parse(
        objectiveProvenanceJson({
          objective: "  Ship the checkout flow  ",
          groundingMode: "selected_sources",
          selectedSourceIds: ["source-1", "source-1", "source-2"],
          sourceRefCount: 1.4,
        }) ?? "",
      ),
    ).toEqual({
      objective: "Ship the checkout flow",
      groundingMode: "selected_sources",
      selectedSourceIds: ["source-1", "source-2"],
      sourceRefCount: 1,
      weakGrounding: false,
    });
    expect(objectiveProvenanceJson({ objective: "   " })).toBeNull();
  });

  it("normalizes project board synthesis proposal answers conservatively", () => {
    const fallbackAnsweredAt = "2026-01-01T00:00:00.000Z";
    expect(
      normalizeProjectBoardSynthesisProposalAnswer(
        {
          questionIndex: 1,
          question: "Which renderer should the shell use?",
          answer: "Use the existing React renderer.",
          answeredAt: "2026-01-01T00:01:00.000Z",
        },
        fallbackAnsweredAt,
      ),
    ).toEqual([
      {
        questionIndex: 1,
        question: "Which renderer should the shell use?",
        answer: "Use the existing React renderer.",
        answeredAt: "2026-01-01T00:01:00.000Z",
      },
    ]);
    expect(
      normalizeProjectBoardSynthesisProposalAnswer(
        {
          questionIndex: 0,
          answer: "Use the default.",
        },
        fallbackAnsweredAt,
      ),
    ).toEqual([{ questionIndex: 0, question: "", answer: "Use the default.", answeredAt: fallbackAnsweredAt }]);
    expect(normalizeProjectBoardSynthesisProposalAnswer({ questionIndex: -1, answer: "Nope" }, fallbackAnsweredAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisProposalAnswer({ questionIndex: 1.5, answer: "Nope" }, fallbackAnsweredAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisProposalAnswer({ questionIndex: 1, answer: "   " }, fallbackAnsweredAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisProposalAnswer(null, fallbackAnsweredAt)).toEqual([]);
  });

  it("normalizes project board synthesis proposal cards conservatively", () => {
    expect(
      normalizeProjectBoardSynthesisProposalCard({
        sourceId: "synthesis:shell",
        title: "Create shell",
        description: "Build the first shell.",
        candidateStatus: "ready_to_create",
        priority: 2,
        phase: "Foundation",
        labels: ["webgl", 7, "shell"],
        blockedBy: ["synthesis:setup", null],
        acceptanceCriteria: ["Canvas renders.", 42],
        testPlan: { unit: [" test helper ", "test helper"], integration: [], visual: [" screenshot "], manual: [] },
        sourceRefs: ["docs/architecture.md", false],
        clarificationQuestions: ["Renderer choice?", undefined],
        clarificationSuggestions: [
          {
            question: " Renderer choice? ",
            suggestedAnswer: " Use the existing renderer. ",
            rationale: " Keeps scope small. ",
            confidence: "medium",
            safeToAccept: true,
            questionKind: "expert_default",
          },
        ],
        objectiveProvenance: {
          objective: "  Ship the render shell.  ",
          groundingMode: "source_scan",
          sourceRefCount: 1,
        },
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
        reviewStatus: "accepted",
        reviewReason: "Reviewed.",
        mergeTargetCardId: "card-1",
        reviewedAt: "2026-01-01T00:01:00.000Z",
      } as never),
    ).toEqual({
      sourceId: "synthesis:shell",
      title: "Create shell",
      description: "Build the first shell.",
      candidateStatus: "ready_to_create",
      priority: 2,
      phase: "Foundation",
      labels: ["webgl", "shell"],
      blockedBy: ["synthesis:setup"],
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["test helper"], integration: [], visual: ["screenshot"], manual: [] },
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: ["Renderer choice?"],
      clarificationSuggestions: [
        {
          question: "Renderer choice?",
          suggestedAnswer: "Use the existing renderer.",
          rationale: "Keeps scope small.",
          confidence: "medium",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ],
      objectiveProvenance: {
        objective: "Ship the render shell.",
        groundingMode: "source_scan",
        selectedSourceIds: [],
        sourceRefCount: 1,
        weakGrounding: false,
      },
      uiMockRole: "mock_gate",
      requiresUiMockApproval: true,
      reviewStatus: "accepted",
      reviewReason: "Reviewed.",
      mergeTargetCardId: "card-1",
      reviewedAt: "2026-01-01T00:01:00.000Z",
    });

    expect(
      normalizeProjectBoardSynthesisProposalCard({
        reviewStatus: "unsupported",
        reviewReason: "   ",
        mergeTargetCardId: "   ",
        reviewedAt: "   ",
      } as never),
    ).toEqual({
      sourceId: "",
      title: "",
      description: "",
      candidateStatus: "needs_clarification",
      priority: undefined,
      phase: undefined,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceRefs: [],
      clarificationQuestions: [],
      clarificationSuggestions: [],
      objectiveProvenance: undefined,
      uiMockRole: undefined,
      requiresUiMockApproval: false,
      reviewStatus: "pending",
      reviewReason: undefined,
      mergeTargetCardId: undefined,
      reviewedAt: undefined,
    });
  });

  it("maps project board synthesis proposal card review statuses", () => {
    expect(projectBoardSynthesisProposalCardReviewStatus("accepted")).toBe("accepted");
    expect(projectBoardSynthesisProposalCardReviewStatus("merged")).toBe("merged");
    expect(projectBoardSynthesisProposalCardReviewStatus("unsupported")).toBeUndefined();
    expect(projectBoardSynthesisProposalCardReviewStatus(undefined)).toBeUndefined();
  });

  it("detects project board run statuses that can copy sessions", () => {
    expect(projectBoardRunStatusCanCopySession("completed")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("failed")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("canceled")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("stalled")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("running")).toBe(false);
    expect(projectBoardRunStatusCanCopySession("paused")).toBe(false);
  });

  it("keeps project board synthesis proposal reviews only while card content still matches", () => {
    const accepted = {
      sourceId: "synthesis:shell",
      title: "Create shell",
      description: "Build the first shell.",
      candidateStatus: "ready_to_create" as const,
      priority: 2,
      phase: "Foundation",
      labels: ["webgl", "shell"],
      blockedBy: ["synthesis:setup"],
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["unit test"], integration: ["integration test"], visual: ["screenshot"], manual: ["review"] },
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: ["Renderer choice?"],
      clarificationSuggestions: [
        {
          question: "Renderer choice?",
          suggestedAnswer: "Use the existing renderer.",
          rationale: "Keeps scope small.",
          confidence: "medium" as const,
          safeToAccept: true,
          questionKind: "expert_default" as const,
        },
      ],
      objectiveProvenance: {
        objective: "Ship the render shell.",
        groundingMode: "source_scan" as const,
        selectedSourceIds: [],
        sourceRefCount: 1,
        weakGrounding: false,
      },
      uiMockRole: "mock_gate" as const,
      requiresUiMockApproval: true,
      reviewStatus: "accepted" as const,
      reviewReason: "Reviewed.",
      reviewedAt: "2026-01-01T00:01:00.000Z",
    };

    expect(projectBoardSynthesisProposalCardReviewStillApplies(accepted, { ...accepted, reviewStatus: "pending" })).toBe(true);
    expect(projectBoardSynthesisProposalCardReviewStillApplies({ ...accepted, reviewStatus: "pending" }, accepted)).toBe(false);
    expect(projectBoardSynthesisProposalCardReviewStillApplies(accepted, { ...accepted, labels: ["shell", "webgl"] })).toBe(false);
    expect(
      projectBoardSynthesisProposalCardReviewStillApplies(accepted, { ...accepted, testPlan: { ...accepted.testPlan, visual: [] } }),
    ).toBe(false);
    expect(
      projectBoardSynthesisProposalCardReviewStillApplies(accepted, {
        ...accepted,
        objectiveProvenance: { ...accepted.objectiveProvenance, sourceRefCount: 2 },
      }),
    ).toBe(false);
  });

  it("maps project board synthesis draft cards into pending proposal cards", () => {
    const cards = projectBoardSynthesisProposalCardsFromDraft({
      summary: "Build the shell.",
      goal: "Ship it.",
      currentState: "Nothing exists.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "   ",
          title: "Skipped",
          description: "Blank source id.",
          candidateStatus: "ready_to_create",
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: "synthesis:blank-title",
          title: "  ",
          description: "Blank title.",
          candidateStatus: "ready_to_create",
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: " synthesis:shell ",
          title: " Create shell ",
          description: " Build the first shell. ",
          candidateStatus: "ready_to_create",
          priority: 1.6,
          phase: " Foundation ",
          labels: [" shell ", "shell", "webgl"],
          blockedBy: [" synthesis:setup ", "synthesis:setup"],
          acceptanceCriteria: [" Canvas renders. ", "Canvas renders."],
          testPlan: { unit: [" unit test "], integration: [], visual: [" screenshot "], manual: [] },
          sourceRefs: [" docs/architecture.md "],
          clarificationQuestions: [" Renderer choice? "],
          clarificationSuggestions: [
            {
              question: " Renderer choice? ",
              suggestedAnswer: " Use the existing renderer. ",
              rationale: " Keeps scope small. ",
              confidence: "medium",
              safeToAccept: true,
              questionKind: "expert_default",
            },
          ],
          objectiveProvenance: {
            objective: " Build the shell. ",
            groundingMode: "source_scan",
            selectedSourceIds: [],
            sourceRefCount: 1,
            weakGrounding: false,
          },
          uiMockRole: "mock_gate",
          requiresUiMockApproval: true,
        },
      ],
    });

    expect(cards).toEqual([
      {
        sourceId: "synthesis:shell",
        title: "Create shell",
        description: "Build the first shell.",
        candidateStatus: "ready_to_create",
        priority: 2,
        phase: "Foundation",
        labels: ["shell", "webgl"],
        blockedBy: ["synthesis:setup"],
        acceptanceCriteria: ["Canvas renders."],
        testPlan: { unit: ["unit test"], integration: [], visual: ["screenshot"], manual: [] },
        sourceRefs: ["docs/architecture.md"],
        clarificationQuestions: ["Renderer choice?"],
        clarificationSuggestions: [
          {
            question: "Renderer choice?",
            suggestedAnswer: "Use the existing renderer.",
            rationale: "Keeps scope small.",
            confidence: "medium",
            safeToAccept: true,
            questionKind: "expert_default",
          },
        ],
        objectiveProvenance: {
          objective: "Build the shell.",
          groundingMode: "source_scan",
          selectedSourceIds: [],
          sourceRefCount: 1,
          weakGrounding: false,
        },
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
        reviewStatus: "pending",
      },
    ]);
  });

  it("preserves project board synthesis proposal card reviews when draft content still matches", () => {
    const draft = {
      summary: "Build the shell.",
      goal: "Ship it.",
      currentState: "Nothing exists.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Build the first shell.",
          candidateStatus: "ready_to_create" as const,
          priority: 2,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          acceptanceCriteria: ["Canvas renders."],
          testPlan: { unit: ["unit test"], integration: [], visual: [], manual: [] },
          sourceRefs: ["docs/architecture.md"],
        },
      ],
    };
    const [existing] = projectBoardSynthesisProposalCardsFromDraft(draft);
    const reviewed = {
      ...existing,
      reviewStatus: "accepted" as const,
      reviewReason: "Looks good.",
      mergeTargetCardId: "card-existing",
      reviewedAt: "2026-01-01T00:01:00.000Z",
    };

    expect(projectBoardSynthesisProposalCardsFromDraft(draft, [reviewed])[0]).toEqual(reviewed);
  });

  it("resets project board synthesis proposal card reviews when draft content changes", () => {
    const draft = {
      summary: "Build the shell.",
      goal: "Ship it.",
      currentState: "Nothing exists.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Build the first shell.",
          candidateStatus: "ready_to_create" as const,
          priority: 2,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          acceptanceCriteria: ["Canvas renders."],
          testPlan: { unit: ["unit test"], integration: [], visual: [], manual: [] },
          sourceRefs: ["docs/architecture.md"],
        },
      ],
    };
    const [existing] = projectBoardSynthesisProposalCardsFromDraft(draft);
    const reviewed = { ...existing, reviewStatus: "accepted" as const, reviewedAt: "2026-01-01T00:01:00.000Z" };
    const changedDraft = { ...draft, cards: [{ ...draft.cards[0], labels: ["shell", "changed"] }] };

    const [next] = projectBoardSynthesisProposalCardsFromDraft(changedDraft, [reviewed]);

    expect(next).toMatchObject({
      sourceId: "synthesis:shell",
      labels: ["shell", "changed"],
      reviewStatus: "pending",
    });
    expect(next.reviewedAt).toBeUndefined();
  });
});
