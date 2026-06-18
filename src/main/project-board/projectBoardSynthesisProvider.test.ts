import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AmbientStreamFailureError, aggressiveAmbientRetryPolicy } from "./projectBoardAmbientFacade";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  createProjectBoardPlannerWorkspace,
  readProjectBoardPlannerWorkspaceRecords,
} from "./projectBoardPlannerWorkspace";
import { projectBoardPlanningSectionsFromSources } from "./projectBoardSectionedPlanning";
import {
  AmbientProjectBoardSynthesisProvider,
  buildProjectBoardSectionedPlanningPrompt,
  filterScopeContractCards,
  parseProjectBoardSynthesisJson,
  remainingPlannerCoverageSourceIds,
  type AmbientProjectBoardSynthesisProgress,
} from "./projectBoardSynthesisProvider";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

function plannerBatchFixtureResponse(cardId: string): string {
  return JSON.stringify({
    plannerStatus: "planning_complete",
    records: [
      {
        type: "candidate_card",
        sourceId: cardId,
        title: "Summarize current kanban gaps",
        description: "Create a focused card from the remaining source after compacting the large planner ledger.",
        candidateStatus: "ready_to_create",
        priority: 2,
        phase: "Planning",
        labels: ["kanban"],
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
        clarificationQuestions: [],
        acceptanceCriteria: ["The card identifies remaining board gaps."],
        testPlan: { unit: ["Validate the card model."], integration: [], visual: [], manual: [] },
      },
      {
        type: "source_coverage",
        sourceId: "source-kanban",
        range: "full",
        status: "covered",
        cardIds: [cardId],
        updatedAt: "2026-05-04T12:00:00.000Z",
      },
    ],
  });
}

describe("AmbientProjectBoardSynthesisProvider", () => {
  it("includes settled clarification decisions in sectioned planner prompts", () => {
    const sources = [
      {
        id: "source-calculator-plan",
        kind: "implementation_plan" as const,
        title: "Calculator plan",
        summary: "Keyboard input maps numpad operators and live preview shows parse errors.",
        excerpt: "# Keyboard\nSupport numpad operators.\n# Preview\nShow a muted error indicator.",
        path: "PLAN.md",
        relevance: 99,
      },
    ];
    const [section] = projectBoardPlanningSectionsFromSources(sources);
    expect(section).toBeDefined();
    const deterministicDraft = {
      summary: "Calculator plan.",
      goal: "Build a calculator.",
      currentState: "Source plan exists.",
      targetUser: "Calculator users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [],
    };
    const prompt = buildProjectBoardSectionedPlanningPrompt({
      section: section!,
      sectionIndex: 0,
      sectionCount: 1,
      sources,
      deterministicDraft,
      refinement: {
        previousDraft: deterministicDraft,
        answers: [
          {
            question: "Card clarification (Keyboard input): Should numpad operators map directly to calculator operators?",
            answer: "Yes, support direct numpad operator mapping.",
            source: "card_clarification",
            cardId: "card-keyboard",
            cardTitle: "Keyboard input",
          },
        ],
      },
    });

    expect(prompt).toContain("Settled clarification decision ledger");
    expect(prompt).toContain("card-keyboard");
    expect(prompt).toContain("Do not ask any clarification question that has the same canonicalKey");
    expect(prompt).toContain("If the settled answer removes the last blocker for a card, use ready_to_create");
    expect(prompt).toContain("Card titles must name user-meaningful work packages or deliverables");
  });

  it("records a recoverable validation failure when planner batches reopen settled clarifications", async () => {
    const createdAt = "2026-05-04T12:00:00.000Z";
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      piTextCall: async () =>
        JSON.stringify({
          plannerStatus: "needs_user_decision",
          records: [
            {
              type: "question",
              questionId: "question:live-preview-error-indicator",
              question: "Should the live preview suppress errors silently or display a muted Error indicator?",
              cardId: "synthesis:live-preview",
              required: true,
              createdAt,
            },
          ],
        }),
    });
    const progressiveRecords: ProposalJsonlRecordArtifact[] = [];

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Calculator",
      maxBatches: 1,
      sources: [
        {
          id: "source-calculator-plan",
          kind: "implementation_plan",
          title: "Calculator plan",
          summary: "Implement live preview.",
          path: "PLAN.md",
          relevance: 95,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Calculator plan.",
          goal: "Build a calculator.",
          currentState: "Source plan exists.",
          targetUser: "Calculator users.",
          qualityBar: "Proof required.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [],
        },
        answers: [
          {
            question: "Card clarification (Live preview): Should the live preview display a muted Error indicator?",
            answer: "Yes. Show a muted Error indicator.",
            source: "card_clarification",
            cardId: "card-live-preview",
            cardTitle: "Live preview",
          },
        ],
      },
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:calculator-shell",
          title: "Implement calculator shell",
          description: "Already validated candidate.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["calculator"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-calculator-plan", range: "shell" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["Calculator shell exists."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }),
      ],
      onProgressiveRecords: (batch) => progressiveRecords.push(...batch.records),
    });

    const errorRecord = result.progressiveRecords?.find(
      (record): record is Extract<ProposalJsonlRecordArtifact, { type: "error" }> =>
        record.type === "error" && record.code === "planner_batch_invalid_response",
    );
    expect(result.telemetry.partial).toBe(true);
    expect(errorRecord).toBeDefined();
    expect(errorRecord?.message).toContain("reopened");
    expect(errorRecord?.metadata).toMatchObject({
      failureKind: "settled_clarification_reopened",
      settledClarificationViolationCount: 1,
      plannerStatus: "validation_failed",
    });
    expect(JSON.stringify(errorRecord?.metadata)).toContain("card-live-preview");
    expect(progressiveRecords.some((record) => record.type === "progress" && record.stage === "planner_batch_failed")).toBe(true);
  });

  it("records a recoverable validation failure when planner batches emit duplicate canonical questions", async () => {
    const createdAt = "2026-05-04T12:00:00.000Z";
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      piTextCall: async () =>
        JSON.stringify({
          plannerStatus: "needs_user_decision",
          records: [
            {
              type: "question",
              questionId: "question:numpad-operators",
              question: "Should numpad operators map directly to calculator operators?",
              cardId: "synthesis:keyboard",
              required: true,
              createdAt,
            },
            {
              type: "question",
              questionId: "question:numpad-operators",
              question: "For keyboard input, should we support numpad operators directly or require mapping?",
              cardId: "synthesis:keyboard-follow-up",
              required: true,
              createdAt,
            },
          ],
        }),
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Calculator",
      maxBatches: 1,
      sources: [
        {
          id: "source-calculator-plan",
          kind: "implementation_plan",
          title: "Calculator plan",
          summary: "Implement keyboard input and numpad operators.",
          path: "PLAN.md",
          relevance: 95,
        },
      ],
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:calculator-shell",
          title: "Implement calculator shell",
          description: "Already validated candidate.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["calculator"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-calculator-plan", range: "shell" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["Calculator shell exists."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }),
      ],
    });

    const errorRecord = result.progressiveRecords?.find(
      (record): record is Extract<ProposalJsonlRecordArtifact, { type: "error" }> =>
        record.type === "error" && record.code === "planner_batch_invalid_response",
    );
    expect(result.telemetry.partial).toBe(true);
    expect(errorRecord?.metadata).toMatchObject({
      failureKind: "duplicate_canonical_questions",
      duplicateClarificationQuestionCount: 1,
      plannerStatus: "validation_failed",
    });
    expect(JSON.stringify(errorRecord?.metadata)).toContain("question:numpad-operators");
    expect(JSON.stringify(errorRecord?.metadata)).toContain("question_id");
  });

  it("records a recoverable validation failure when planner batches emit implementation-detail card titles", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      piTextCall: async () =>
        JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:main-wrapper",
              title: "<main> wrapping:",
              description: "Create the calculator app wrapper and layout.",
              candidateStatus: "ready_to_create",
              priority: 2,
              phase: "Layout",
              labels: ["ui"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-calculator-plan", range: "layout" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["The calculator has a semantic main wrapper."],
              testPlan: { unit: ["Render model test."], integration: [], visual: ["Screenshot proof."], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-calculator-plan",
              range: "layout",
              status: "covered",
              cardIds: ["synthesis:main-wrapper"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        }),
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Calculator",
      maxBatches: 1,
      sources: [
        {
          id: "source-calculator-plan",
          kind: "implementation_plan",
          title: "Calculator plan",
          summary: "Implement semantic layout and calculator controls.",
          path: "PLAN.md",
          relevance: 95,
        },
      ],
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:calculator-shell",
          title: "Implement calculator shell",
          description: "Already validated candidate.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["calculator"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-calculator-plan", range: "shell" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["Calculator shell exists."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }),
      ],
    });

    const errorRecord = result.progressiveRecords?.find(
      (record): record is Extract<ProposalJsonlRecordArtifact, { type: "error" }> =>
        record.type === "error" && record.code === "planner_batch_invalid_response",
    );
    expect(result.telemetry.partial).toBe(true);
    expect(errorRecord?.message).toContain("implementation-detail card title");
    expect(errorRecord?.metadata).toMatchObject({
      failureKind: "implementation_detail_card_titles",
      cardTitleQualityViolationCount: 1,
      plannerStatus: "validation_failed",
    });
    expect(JSON.stringify(errorRecord?.metadata)).toContain("<main> wrapping:");
  });

  it("uses a Pi text call for lightweight charter review without generating cards", async () => {
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const report = {
      readiness: "ready_for_card_generation",
      summary: "The active charter is coherent enough for explicit card generation.",
      sourceConfidence: "high",
      sourceConfidenceNotes: ["The PRD is primary and classification confidence is strong."],
      gitState: "git_no_remote",
      gitStateNotes: ["Workspace is a Git repo without a configured remote."],
      blockingQuestions: [],
      risks: ["Keep board synthesis to local-first editor scope."],
      sourceConflicts: [],
      sourceAuthorityNotes: ["Treat the PRD as primary."],
      recommendedActivationScope: "Generate the draft board from the PRD and charter summary.",
      cardGenerationConstraints: ["Do not generate collaboration cards."],
    };
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      piTextCall: async (input) => {
        expect(input.sessionId).toContain("project-board-charter-review-session");
        expect(input.prompt).toContain("Do not generate candidate cards.");
        expect(input.prompt).toContain("Return JSON matching this exact shape");
        expect(input.prompt).toContain("Source confidence input");
        expect(input.prompt).toContain("Git coordination input");
        expect(input.prompt).toContain('"mode": "git_no_remote"');
        return JSON.stringify(report);
      },
    });

    const result = await provider.reviewCharterWithTelemetry({
      projectName: "Editor",
      sources: [
        {
          id: "source-prd",
          kind: "functional_spec",
          title: "PRD",
          summary: "Local-first editor for notes.",
          excerpt: "Build a simple local-first editor.",
          path: "PRD.md",
          classificationConfidence: 0.96,
          authorityRole: "primary",
          changeState: "unchanged",
          relevance: 100,
        },
      ],
      gitContext: {
        mode: "git_no_remote",
        isGitRepository: true,
        hasRemote: false,
        branch: "main",
        ahead: 0,
        behind: 0,
        dirtyBoardFileCount: 0,
        dirtyBoardFiles: [],
        projectionValid: true,
        projectionDifferenceCount: 0,
      },
      onProgress: (event) => progress.push(event),
    });

    expect(result.reviewReport).toEqual(report);
    expect(result.draft.cards).toEqual([]);
    expect(result.draft.questions).toEqual([]);
    expect(result.telemetry).toMatchObject({ cardCount: 0, questionCount: 0 });
    expect(progress.find((event) => event.title === "Validated charter review report")?.metadata).toMatchObject({
      sourceConfidence: "high",
      gitState: "git_no_remote",
    });
    expect(progress.map((event) => event.title)).toEqual([
      "Asked Ambient/Pi for charter review",
      "Received charter review",
      "Validated charter review report",
    ]);
  });

  it("covers lightweight PM Review contract fixtures for constrained readiness, source conflicts, ignored sources, and recommendation scope", async () => {
    const defaultGitContext = {
      mode: "git_ready" as const,
      isGitRepository: true,
      hasRemote: true,
      branch: "main",
      upstream: "origin/main",
      ahead: 0,
      behind: 0,
      dirtyBoardFileCount: 0,
      dirtyBoardFiles: [],
      projectionValid: true,
      projectionDifferenceCount: 0,
      message: "Board artifacts are ready for remote Git coordination.",
    };
    const scenarios = [
      {
        name: "ready_with_constraints",
        sources: [
          {
            id: "source-prd",
            kind: "functional_spec" as const,
            title: "Primary PRD",
            summary: "Build a local-first calculator MVP with keyboard input and visible result history.",
            excerpt: "The first board should cover calculator shell, arithmetic reducer, and visual proof. Collaboration is out of scope.",
            path: "docs/PRD.md",
            authorityRole: "primary" as const,
            classificationConfidence: 0.97,
            changeState: "unchanged" as const,
            relevance: 99,
          },
          {
            id: "source-plan",
            kind: "implementation_plan" as const,
            title: "Changed implementation notes",
            summary: "A recent note proposes a larger settings surface, but the MVP still needs the calculator core first.",
            excerpt: "Settings, theming, and memory functions are follow-up work after arithmetic proof.",
            path: "docs/implementation-notes.md",
            authorityRole: "supporting" as const,
            classificationConfidence: 0.74,
            changeState: "changed" as const,
            relevance: 84,
          },
        ],
        report: {
          readiness: "ready_for_card_generation" as const,
          summary: "The charter is ready for card generation, constrained to the calculator MVP.",
          sourceConfidence: "medium" as const,
          sourceConfidenceNotes: ["Primary PRD is authoritative, but changed implementation notes should constrain card scope."],
          gitState: "git_ready" as const,
          gitStateNotes: ["main tracks origin/main with no board artifact drift."],
          blockingQuestions: [],
          risks: ["Changed implementation notes could pull the first board beyond MVP scope."],
          sourceConflicts: [],
          sourceAuthorityNotes: ["Treat docs/PRD.md as primary over changed implementation notes."],
          recommendedActivationScope: "Generate only the calculator shell, arithmetic reducer, and visual proof cards.",
          cardGenerationConstraints: ["Generate at most three MVP cards.", "Defer settings, theming, memory, and collaboration cards."],
        },
        expectPrompt: (prompt: string) => {
          expect(prompt).toContain('"changedSourceCount": 1');
          expect(prompt).toContain('"primarySourceCount": 1');
          expect(prompt).toContain('"mode": "git_ready"');
          expect(prompt).toContain("Changed implementation notes");
        },
        expectResult: (result: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["reviewCharterWithTelemetry"]>>, progress: AmbientProjectBoardSynthesisProgress[]) => {
          expect(result.draft.cards).toEqual([]);
          expect(result.draft.questions).toEqual([]);
          expect(result.draft.sourceNotes).toContain("Source confidence: medium");
          expect(result.draft.sourceNotes).toContain("Recommendation: Generate only the calculator shell, arithmetic reducer, and visual proof cards.");
          expect(progress.find((event) => event.title === "Validated charter review report")?.metadata).toMatchObject({
            readiness: "ready_for_card_generation",
            sourceConfidence: "medium",
            cardGenerationConstraintCount: 2,
            recommendedActivationScopePresent: true,
          });
        },
      },
      {
        name: "source_conflict_needs_answer",
        sources: [
          {
            id: "source-prd",
            kind: "functional_spec" as const,
            title: "Authoritative PRD",
            summary: "Build a local-only text editor for macOS with autosave to local files.",
            excerpt: "Cloud sync is explicitly out of scope for the first board.",
            path: "docs/PRD.md",
            authorityRole: "primary" as const,
            classificationConfidence: 0.95,
            changeState: "unchanged" as const,
            relevance: 98,
          },
          {
            id: "source-scratch",
            kind: "implementation_plan" as const,
            title: "Scratch collaboration note",
            summary: "A scratch note proposes shared cloud documents and account login.",
            excerpt: "The editor could use cloud sync and collaborative comments.",
            path: "scratch/collaboration.md",
            authorityRole: "supporting" as const,
            classificationConfidence: 0.62,
            changeState: "new" as const,
            relevance: 70,
          },
        ],
        report: {
          readiness: "needs_answers" as const,
          summary: "The charter has a blocking source conflict around sync scope.",
          sourceConfidence: "low" as const,
          sourceConfidenceNotes: ["Primary and scratch sources disagree on whether sync is in scope."],
          gitState: "git_ready" as const,
          gitStateNotes: ["Git state does not block review."],
          blockingQuestions: ["Should the first board stay local-only, or include cloud sync/account work?"],
          risks: ["Generating cards before resolving sync scope would produce conflicting implementation work."],
          sourceConflicts: ["docs/PRD.md excludes cloud sync, while scratch/collaboration.md proposes cloud sync and login."],
          sourceAuthorityNotes: ["Prefer docs/PRD.md unless the PM explicitly overrides sync scope."],
          recommendedActivationScope: "Ask the sync-scope question before card generation.",
          cardGenerationConstraints: ["Do not generate sync, login, or collaboration cards until the PM resolves the conflict."],
        },
        expectPrompt: (prompt: string) => {
          expect(prompt).toContain("Authoritative PRD");
          expect(prompt).toContain("Scratch collaboration note");
          expect(prompt).toContain('"newSourceCount": 1');
        },
        expectResult: (result: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["reviewCharterWithTelemetry"]>>, progress: AmbientProjectBoardSynthesisProgress[]) => {
          expect(result.draft.cards).toEqual([]);
          expect(result.draft.questions).toEqual(["Should the first board stay local-only, or include cloud sync/account work?"]);
          expect(result.draft.sourceNotes).toContain("Conflict: docs/PRD.md excludes cloud sync, while scratch/collaboration.md proposes cloud sync and login.");
          expect(result.draft.sourceNotes).toContain("Authority: Prefer docs/PRD.md unless the PM explicitly overrides sync scope.");
          expect(result.telemetry.questionCount).toBe(1);
          expect(progress.find((event) => event.title === "Validated charter review report")?.metadata).toMatchObject({
            readiness: "needs_answers",
            questionCount: 1,
            sourceConflictCount: 1,
          });
        },
      },
      {
        name: "ignored_source_excluded",
        sources: [
          {
            id: "source-prd",
            kind: "functional_spec" as const,
            title: "Kanban PRD",
            summary: "Build a small local web kanban board with drag and drop, persistence, and visual smoke proof.",
            excerpt: "Focus on board columns, card CRUD, drag/drop, and local persistence.",
            path: "docs/kanban-prd.md",
            authorityRole: "primary" as const,
            classificationConfidence: 0.93,
            changeState: "unchanged" as const,
            relevance: 96,
          },
          {
            id: "source-ignored",
            kind: "ignored" as const,
            title: "Ignored blockchain spike",
            summary: "Do not use this old spike.",
            excerpt: "Use a blockchain ledger and token-gated boards.",
            path: "scratch/ignored-blockchain.md",
            includeInSynthesis: false,
            authorityRole: "supporting" as const,
            classificationConfidence: 0.2,
            changeState: "removed" as const,
            relevance: 100,
          },
        ],
        report: {
          readiness: "ready_for_card_generation" as const,
          summary: "The included PRD is enough for a local kanban board.",
          sourceConfidence: "high" as const,
          sourceConfidenceNotes: ["The ignored blockchain spike was excluded; the included PRD covers the local board scope."],
          gitState: "git_ready" as const,
          gitStateNotes: ["Git coordination is ready."],
          blockingQuestions: [],
          risks: ["Do not reintroduce ignored blockchain scope."],
          sourceConflicts: [],
          sourceAuthorityNotes: ["Only docs/kanban-prd.md should guide the first board."],
          recommendedActivationScope: "Generate local kanban board cards from the PRD only.",
          cardGenerationConstraints: ["Exclude blockchain/token-gated scope."],
        },
        expectPrompt: (prompt: string) => {
          expect(prompt).toContain('"ignoredSourceCount": 1');
          expect(prompt).toContain('"removedSourceCount": 1');
          expect(prompt).toContain("Kanban PRD");
          expect(prompt).not.toContain("Ignored blockchain spike");
          expect(prompt).not.toContain("token-gated boards");
        },
        expectResult: (result: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["reviewCharterWithTelemetry"]>>, progress: AmbientProjectBoardSynthesisProgress[]) => {
          expect(result.draft.cards).toEqual([]);
          expect(result.reviewReport.cardGenerationConstraints).toEqual(["Exclude blockchain/token-gated scope."]);
          expect(progress.find((event) => event.title === "Validated charter review report")?.metadata).toMatchObject({
            sourceConfidence: "high",
            cardGenerationConstraintCount: 1,
          });
        },
      },
      {
        name: "recommendation_scope_ready_for_activation",
        sources: [
          {
            id: "source-gdd",
            kind: "functional_spec" as const,
            title: "Asteroids GDD",
            summary: "Build a modern asteroids clone with movement, shooting, wraparound, collision, score, and visual proof.",
            excerpt: "First activation should create a playable core before polish, powerups, or online leaderboards.",
            path: "docs/asteroids-gdd.md",
            authorityRole: "primary" as const,
            classificationConfidence: 0.91,
            changeState: "unchanged" as const,
            relevance: 97,
          },
        ],
        report: {
          readiness: "ready_for_activation" as const,
          summary: "The charter is ready to activate a narrow first playable asteroids slice.",
          sourceConfidence: "high" as const,
          sourceConfidenceNotes: ["The GDD is primary and covers the first playable slice."],
          gitState: "git_ready" as const,
          gitStateNotes: ["Remote coordination is ready."],
          blockingQuestions: [],
          risks: ["Powerups and online leaderboard work should not enter the first board."],
          sourceConflicts: [],
          sourceAuthorityNotes: ["Treat docs/asteroids-gdd.md as authoritative for first playable scope."],
          recommendedActivationScope: "Activate only player movement, asteroid spawning, shooting, collision, score, and visual proof.",
          cardGenerationConstraints: ["Leave powerups, boss waves, online leaderboard, and monetization to later Add Cards work."],
        },
        expectPrompt: (prompt: string) => {
          expect(prompt).toContain("Recommended activation scope should state whether to activate");
          expect(prompt).toContain("Asteroids GDD");
        },
        expectResult: (result: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["reviewCharterWithTelemetry"]>>, progress: AmbientProjectBoardSynthesisProgress[]) => {
          expect(result.draft.cards).toEqual([]);
          expect(result.reviewReport.readiness).toBe("ready_for_activation");
          expect(result.draft.sourceNotes).toContain(
            "Recommendation: Activate only player movement, asteroid spawning, shooting, collision, score, and visual proof.",
          );
          expect(progress.find((event) => event.title === "Validated charter review report")?.metadata).toMatchObject({
            readiness: "ready_for_activation",
            recommendedActivationScopePresent: true,
            cardGenerationConstraintCount: 1,
          });
        },
      },
    ];

    for (const scenario of scenarios) {
      const progress: AmbientProjectBoardSynthesisProgress[] = [];
      let prompt = "";
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: "zai-org/GLM-5.1-FP8",
        apiKey: "ambient-test-key",
        piTextCall: async (input) => {
          prompt = input.prompt;
          expect(input.responseFormat).toEqual({ type: "json_object" });
          expect(input.prompt).toContain("Do not generate candidate cards.");
          expect(input.prompt).toContain("Card generation constraints are instructions for the later explicit board-synthesis pass, not cards.");
          return JSON.stringify({ reviewReport: scenario.report, cards: [{ title: "must be ignored" }] });
        },
      });

      const result = await provider.reviewCharterWithTelemetry({
        projectName: scenario.name,
        sources: scenario.sources,
        gitContext: defaultGitContext,
        onProgress: (event) => progress.push(event),
      });

      expect(result.reviewReport).toEqual(scenario.report);
      expect(result.telemetry.cardCount).toBe(0);
      expect(progress.map((event) => event.title)).toEqual([
        "Asked Ambient/Pi for charter review",
        "Received charter review",
        "Validated charter review report",
      ]);
      scenario.expectPrompt(prompt);
      scenario.expectResult(result, progress);
    }
  });

  it("includes proof-ownership rules in sectioned planning prompts", () => {
    const prompt = buildProjectBoardSectionedPlanningPrompt({
      section: {
        id: "section-input",
        sourceId: "source-gdd",
        sourceTitle: "Game Design Document",
        sourcePath: "GAME_DESIGN_DOCUMENT.md",
        sourceKind: "functional_spec",
        sourceSummary: "Input adapter, renderer, and HUD requirements.",
        heading: "Input Adapter",
        range: "Input Adapter",
        content: "Build an InputAdapter that maps keyboard state to thrust/dodge intents. Browser visual proof belongs to a downstream playable-scene card.",
        charCount: 132,
        sourceIndex: 0,
        sectionIndex: 0,
        sourceSectionIndex: 0,
        sourceSectionCount: 1,
      },
      sectionIndex: 0,
      sectionCount: 1,
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "Game Design Document",
          summary: "Input adapter and renderer requirements.",
          path: "GAME_DESIGN_DOCUMENT.md",
          relevance: 99,
        },
      ],
      deterministicDraft: {
        summary: "Draft.",
        goal: "Build the game.",
        currentState: "Spec exists.",
        targetUser: "Player.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [],
      },
    });

    expect(prompt).toContain("Proof ownership rules:");
    expect(prompt).toContain("Pure module cards such as input adapters");
    expect(prompt).toContain("downstream renderer/gameplay/HUD/proof card");
    expect(prompt).toContain("only when this card directly changes visible UI");
  });

  it("calls Ambient chat completions and normalizes a synthesis draft", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const progress: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Live refined board.",
                    goal: "Build a playable WebGL spaceship slice.",
                    currentState: "The project has architecture, gameplay notes, and tests.",
                    targetUser: "Browser game prototype developer.",
                    qualityBar: "Each card needs proof.",
                    assumptions: ["Keyboard first."],
                    questions: ["Should mobile touch controls ship in the first slice?"],
                    sourceNotes: ["architecture.md defines state/render separation."],
                    cards: [
                      {
                        sourceId: "shell-bootstrap",
                        title: "Bootstrap Three.js shell",
                        description: "Create a nonblank canvas and render loop.",
                        candidateStatus: "ready",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["webgl"],
                        blockedBy: [],
                        acceptanceCriteria: ["Canvas renders a nonblank scene."],
                        testPlan: {
                          unit: [],
                          integration: ["Run the app."],
                          visual: ["Capture a canvas screenshot."],
                          manual: ["Resize the window."],
                        },
                        sourceRefs: ["docs/architecture.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Starfall Courier",
      sources: [
        {
          kind: "architecture_artifact",
          title: "Architecture",
          summary: "Three.js render loop and state boundaries.",
          path: "docs/architecture.md",
          relevance: 92,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Previous board.",
          goal: "Build a WebGL spaceship game.",
          currentState: "Ambiguous controls and pacing.",
          targetUser: "Browser players.",
          qualityBar: "Proof required.",
          assumptions: ["Controls are undecided."],
          questions: ["Arcade or inertia controls?"],
          sourceNotes: ["gameplay-notes.md conflicts."],
          cards: [
            {
              sourceId: "synthesis:controls",
              title: "Implement controls",
              description: "Choose and implement ship controls.",
              candidateStatus: "needs_clarification",
              priority: 2,
              phase: "Gameplay",
              labels: ["controls"],
              blockedBy: [],
              acceptanceCriteria: ["Ship movement is playable."],
              testPlan: { unit: ["Test controls."], integration: [], visual: [], manual: [] },
              sourceRefs: ["docs/gameplay-notes.md"],
            },
          ],
        },
        answers: [{ question: "Arcade or inertia controls?", answer: "Use arcade controls for the first playable slice." }],
      },
      onProgress: (event) => progress.push(event.stage),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].body.stream).toBe(true);
    expect(calls[0].body).not.toHaveProperty("reasoning");
    expect(JSON.stringify(calls[0].body)).toContain("project-board planning contract");
    expect(JSON.stringify(calls[0].body)).toContain("Project: Starfall Courier");
    expect(JSON.stringify(calls[0].body)).toContain("Previous PM Review proposal or deterministic baseline to refine");
    expect(JSON.stringify(calls[0].body)).toContain("Use arcade controls for the first playable slice.");
    expect(JSON.stringify(calls[0].body)).toContain("Operation overlay: Whole Board Synthesis");
    expect(result.draft.cards[0]).toMatchObject({
      sourceId: "synthesis:ux-mock-approval",
      title: "Create UX mock for approval",
      candidateStatus: "ready_to_create",
      testPlan: expect.objectContaining({ visual: ["Capture desktop and narrow viewport screenshots of the mock for review."] }),
    });
    expect(result.draft.cards[1]).toMatchObject({
      sourceId: "synthesis:shell-bootstrap",
      title: "Bootstrap Three.js shell",
      candidateStatus: "needs_clarification",
      blockedBy: expect.arrayContaining(["synthesis:ux-mock-approval"]),
      testPlan: expect.objectContaining({ visual: ["Capture a canvas screenshot."] }),
    });
    expect(progress).toEqual(["model_request", "model_response", "schema_validation"]);
    expect(result.telemetry).toMatchObject({
      promptCharCount: expect.any(Number),
      responseCharCount: expect.any(Number),
      cardCount: 2,
      questionCount: 1,
    });
    expect(result.telemetry.promptCharCount).toBeGreaterThan(1000);
    expect(result.telemetry.responseCharCount).toBeGreaterThan(100);
  });

  it("aborts direct-chat compatibility requests from the caller signal", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        requestSignal = init?.signal as AbortSignal | undefined;
        controller.abort(new Error("Direct pause abort"));
        if (requestSignal?.aborted) throw requestSignal.reason;
        throw new Error("Expected direct request signal to abort.");
      },
    });

    await expect(
      provider.synthesizeWithTelemetry({
        projectName: "Abort Board",
        signal: controller.signal,
        sources: [
          {
            kind: "functional_spec",
            title: "Spec",
            summary: "Create a simple board.",
            path: "SPEC.md",
            relevance: 90,
          },
        ],
      }),
    ).rejects.toThrow("Direct pause abort");
    expect(requestSignal?.aborted).toBe(true);
  });

  it("threads abort signals into planner-batch Pi calls", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      piTextCall: async (input) => {
        requestSignal = input.signal;
        controller.abort(new Error("Planner pause abort"));
        throw input.signal?.reason ?? new Error("Expected planner signal to abort.");
      },
    });

    await expect(
      provider.synthesizePlannerBatchesWithTelemetry({
        projectName: "Planner Abort Board",
        signal: controller.signal,
        sources: [
          {
            id: "source-planner",
            kind: "functional_spec",
            title: "Planner spec",
            summary: "Create a recoverable board.",
            path: "SPEC.md",
            relevance: 95,
          },
        ],
      }),
    ).rejects.toThrow("Planner pause abort");
    expect(requestSignal).toBe(controller.signal);
  });

  it("can recover a whole-board draft from planner workspace JSONL artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-workspace-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-1",
      projectName: "Workspace Board",
      operation: "board_synthesis",
      sources: [{ id: "source-gdd", kind: "functional_spec", title: "GDD", summary: "Movement spec.", path: "GDD.md", relevance: 90 }],
    });
    const bodies: Record<string, unknown>[] = [];
    const batches: Array<{ records: string[]; accumulated: number }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        await appendProjectBoardPlannerWorkspaceRecords(workspace, [
          validateProposalJsonlRecordArtifact({
            type: "candidate_card",
            sourceId: "synthesis:workspace-card",
            title: "Implement workspace card",
            description: "Card emitted through the planner workspace.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["workspace"],
            blockedBy: [],
            sourceRefs: [{ sourceId: "source-gdd" }],
            acceptanceCriteria: ["Workspace card is valid."],
            testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          }),
          validateProposalJsonlRecordArtifact({
            type: "proposal_final",
            summary: "Workspace proposal.",
            goal: "Build from workspace artifacts.",
            currentState: "Source material is available in the planner workspace.",
            targetUser: "Board reviewer.",
            qualityBar: "Proof required.",
            assumptions: ["Workspace artifacts are authoritative."],
            questions: [],
            sourceNotes: ["source-gdd was used."],
            createdAt: "2026-05-04T12:00:00.000Z",
          }),
        ]);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records: [] }) } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Workspace Board",
      sources: [{ id: "source-gdd", kind: "functional_spec", title: "GDD", summary: "Movement spec.", path: "GDD.md", relevance: 90 }],
      plannerWorkspace: workspace,
      onProgressiveRecords: (batch) =>
        batches.push({ records: batch.records.map((record) => record.type), accumulated: batch.accumulatedRecordCount }),
    });

    expect(JSON.stringify(bodies[0])).toContain(workspace.aggregateJsonlPath);
    expect(batches).toEqual([{ records: ["candidate_card", "proposal_final"], accumulated: 2 }]);
    expect(result.draft).toMatchObject({
      summary: "Workspace proposal.",
      goal: "Build from workspace artifacts.",
    });
    expect(result.draft.cards.map((card) => card.title)).toEqual(["Implement workspace card"]);
    expect(result.progressiveRecords?.some((record) => record.type === "proposal_final")).toBe(true);
  });

  it("completes the run and warns once when planner workspace polling fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-pollfail-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-pollfail",
      projectName: "Poll Failure Board",
      operation: "board_synthesis",
      sources: [{ id: "source-gdd", kind: "functional_spec", title: "GDD", summary: "Movement spec.", path: "GDD.md", relevance: 90 }],
    });
    // Replace one polled JSONL with a directory so every poll fails with a
    // non-ENOENT error (EISDIR) instead of being treated as "file not written yet".
    // The errors output is never appended to by this run, so only polling breaks.
    await rm(workspace.outputPaths.error, { force: true, recursive: true });
    await mkdir(workspace.outputPaths.error, { recursive: true });

    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Board from the model stream.",
                    goal: "Build the slice without workspace imports.",
                    currentState: "Workspace polling is failing.",
                    targetUser: "Board reviewer.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: ["GDD.md"],
                    cards: [
                      {
                        sourceId: "stream-card",
                        title: "Implement movement",
                        description: "Implement the movement slice from the GDD.",
                        candidateStatus: "ready",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["gameplay"],
                        blockedBy: [],
                        acceptanceCriteria: ["Movement works."],
                        testPlan: { unit: ["Test movement."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["GDD.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Poll Failure Board",
      sources: [{ id: "source-gdd", kind: "functional_spec", title: "GDD", summary: "Movement spec.", path: "GDD.md", relevance: 90 }],
      plannerWorkspace: workspace,
      onProgress: (event) => progress.push(event),
    });

    expect(result.draft.cards.some((card) => card.title === "Implement movement")).toBe(true);
    const pollWarnings = progress.filter((event) => event.metadata.workspacePollError === true);
    expect(pollWarnings).toHaveLength(1);
    expect(pollWarnings[0].title).toBe("Planner workspace unavailable");
  });

  it("drives whole-board planning as repeated ledger-backed card batches", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-batches-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-batches",
      projectName: "Batch Board",
      operation: "board_synthesis",
      sources: [
        {
          id: "source-architecture",
          kind: "architecture_artifact",
          title: "Architecture",
          summary: "Create the app shell first.",
          path: "ARCHITECTURE.md",
          relevance: 95,
        },
        {
          id: "source-gameplay",
          kind: "functional_spec",
          title: "Gameplay",
          summary: "Then add movement.",
          path: "GAMEPLAY.md",
          relevance: 90,
        },
      ],
    });
    const prompts: string[] = [];
    const batches: Array<{ records: string[]; accumulated: number }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        prompts.push(prompt);
        const isSecondBatch = prompt.includes("synthesis:app-shell");
        const records = isSecondBatch
          ? [
              {
                type: "candidate_card",
                sourceId: "synthesis:movement",
                title: "Implement movement",
                description: "Add the first movement loop after the app shell exists.",
                candidateStatus: "ready_to_create",
                priority: 2,
                phase: "Gameplay",
                labels: ["movement"],
                blockedBy: ["synthesis:app-shell"],
                sourceRefs: [{ sourceId: "source-gameplay", range: "full" }],
                acceptanceCriteria: ["Movement updates are observable."],
                testPlan: { unit: ["Test movement state updates."], integration: [], visual: [], manual: [] },
              },
              {
                type: "source_coverage",
                sourceId: "source-gameplay",
                range: "full",
                status: "covered",
                cardIds: ["synthesis:movement"],
                updatedAt: "2026-05-04T12:00:00.000Z",
              },
            ]
          : [
              {
                type: "candidate_card",
                sourceId: "synthesis:app-shell",
                title: "Create app shell",
                description: "Create the app shell and initial rendering surface.",
                candidateStatus: "ready_to_create",
                priority: 1,
                phase: "Foundation",
                labels: ["foundation"],
                blockedBy: [],
                sourceRefs: [{ sourceId: "source-architecture", range: "full" }],
                acceptanceCriteria: ["The app shell starts."],
                testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
              },
              {
                type: "source_coverage",
                sourceId: "source-architecture",
                range: "full",
                status: "covered",
                cardIds: ["synthesis:app-shell"],
                updatedAt: "2026-05-04T12:00:00.000Z",
              },
            ];
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    plannerStatus: isSecondBatch ? "planning_complete" : "continue",
                    records,
                    remainingCoverageSummary: isSecondBatch ? "All source work is represented." : "Gameplay still needs movement.",
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Batch Board",
      sources: [
        {
          id: "source-architecture",
          kind: "architecture_artifact",
          title: "Architecture",
          summary: "Create the app shell first.",
          path: "ARCHITECTURE.md",
          relevance: 95,
        },
        {
          id: "source-gameplay",
          kind: "functional_spec",
          title: "Gameplay",
          summary: "Then add movement.",
          path: "GAMEPLAY.md",
          relevance: 90,
        },
      ],
      plannerWorkspace: workspace,
      maxBatches: 4,
      onProgressiveRecords: (batch) =>
        batches.push({ records: batch.records.map((record) => record.type), accumulated: batch.accumulatedRecordCount }),
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("Plan the next small batch");
    expect(prompts[0]).toContain("next 2-3 highest-leverage candidate_card records");
    expect(prompts[1]).toContain("synthesis:app-shell");
    expect(batches).toEqual([
      { records: ["candidate_card", "source_coverage", "progress"], accumulated: 3 },
      { records: ["candidate_card", "source_coverage", "progress"], accumulated: 6 },
    ]);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:app-shell", "synthesis:movement"]);
    expect(result.telemetry).toMatchObject({ plannerBatchCount: 2, batchCardLimit: 3, cardCount: 2 });
    const ledger = JSON.parse(await readFile(workspace.ledgerPath, "utf8")) as Record<string, unknown>;
    expect(ledger).toMatchObject({
      renderedCardLedger: [
        { cardId: "synthesis:app-shell", title: "Create app shell" },
        { cardId: "synthesis:movement", title: "Implement movement" },
      ],
      remainingCoverageLedger: [],
    });
  });

  it("threads lightweight PM Review recommendations into planner-batch board synthesis", async () => {
    const prompts: string[] = [];
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const reviewReport = {
      readiness: "ready_for_card_generation" as const,
      summary: "The charter is coherent enough to generate implementation cards.",
      sourceConfidence: "medium" as const,
      sourceConfidenceNotes: ["The PRD is primary, but scratch notes conflict with collaboration scope."],
      gitState: "git_ready" as const,
      gitStateNotes: ["Board artifacts are ready for remote Git coordination."],
      blockingQuestions: [],
      risks: ["The first board should stay local-first."],
      sourceConflicts: ["Scratch notes mention collaboration, but the PRD excludes collaboration."],
      sourceAuthorityNotes: ["Treat the PRD as primary over scratch notes."],
      recommendedActivationScope: "Generate a local-first editor board and defer collaboration.",
      cardGenerationConstraints: ["Do not generate collaboration cards.", "Start with persistence and editor shell cards."],
    };
    const previousDraft = {
      summary: reviewReport.summary,
      goal: "Build a local-first editor.",
      currentState: "A charter review report is ready.",
      targetUser: "Desktop note taker.",
      qualityBar: "Every generated card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Recommendation: Generate a local-first editor board and defer collaboration."],
      cards: [],
    };
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        prompts.push(body.messages.at(-1)?.content ?? "");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    plannerStatus: "planning_complete",
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:editor-shell",
                        title: "Create local-first editor shell",
                        description: "Build the initial editor shell without collaboration features.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["editor"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-prd", range: "full" }],
                        clarificationQuestions: [],
                        acceptanceCriteria: ["The editor shell runs locally."],
                        testPlan: { unit: ["Validate editor state initialization."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-prd",
                        range: "full",
                        status: "covered",
                        cardIds: ["synthesis:editor-shell"],
                        updatedAt: "2026-05-04T12:00:00.000Z",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Editor Board",
      sources: [
        {
          id: "source-prd",
          kind: "functional_spec",
          title: "PRD",
          summary: "Build a local-first editor.",
          path: "PRD.md",
          relevance: 95,
        },
      ],
      refinement: { previousDraft, answers: [], pmReviewReport: reviewReport },
      maxBatches: 1,
      onProgress: (event) => progress.push(event),
    });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("PM Review activation context");
    expect(prompts[0]).toContain("Generate a local-first editor board and defer collaboration.");
    expect(prompts[0]).toContain("Do not generate collaboration cards.");
    expect(prompts[0]).toContain('"sourceConfidence": "medium"');
    expect(prompts[0]).toContain('"gitState": "git_ready"');
    expect(prompts[0]).toContain("PM Review activation rules");
    expect(progress.find((event) => event.title === "Asked Ambient/Pi for planner batch 1")?.metadata).toMatchObject({
      pmReviewActivation: true,
      pmReviewReadiness: "ready_for_card_generation",
      pmReviewSourceConfidence: "medium",
      pmReviewGitState: "git_ready",
      pmReviewConstraintCount: 2,
    });
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:editor-shell"]);
  });

  it("pauses planner batches after a validated checkpoint", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ambient-planner-pause-"));
    tempRoots.push(workspaceRoot);
    const sources = [
      {
        id: "source-architecture",
        kind: "architecture_artifact" as const,
        title: "Architecture",
        summary: "Create the app shell first.",
        path: "ARCHITECTURE.md",
        relevance: 95,
      },
      {
        id: "source-gameplay",
        kind: "functional_spec" as const,
        title: "Gameplay",
        summary: "Then add movement.",
        path: "GAMEPLAY.md",
        relevance: 90,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: workspaceRoot,
      boardId: "board-pause",
      runId: "run-pause",
      projectName: "Pause Board",
      operation: "board_synthesis",
      sources,
    });
    let fetchCount = 0;
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    plannerStatus: "continue",
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:app-shell",
                        title: "Create app shell",
                        description: "Create the app shell before gameplay work.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["foundation"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-architecture", range: "full" }],
                        acceptanceCriteria: ["The app shell starts."],
                        testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-architecture",
                        range: "full",
                        status: "covered",
                        cardIds: ["synthesis:app-shell"],
                        updatedAt: "2026-05-04T12:00:00.000Z",
                      },
                    ],
                    remainingCoverageSummary: "Gameplay still needs movement.",
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Pause Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 3,
      shouldPause: (checkpoint) => checkpoint.phase === "planner_batch" && checkpoint.batchNumber === 1,
    });

    expect(fetchCount).toBe(1);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:app-shell"]);
    expect(result.telemetry).toMatchObject({
      paused: true,
      pauseReason: "user_cancelled",
      partial: true,
      lastValidRecordId: "source-architecture",
      lastValidRecordType: "source_coverage",
    });
    const progress = result.progressiveRecords?.find((record) => record.type === "progress" && record.stage === "planner_batch_succeeded");
    expect(progress).toMatchObject({
      metadata: expect.objectContaining({
        plannerStatus: "user_cancelled",
        recoverableOutputStop: true,
        stopReason: "pause_requested",
        lastValidRecordId: "source-architecture",
        lastValidRecordType: "source_coverage",
      }),
    });
    const workspaceRecords = await readProjectBoardPlannerWorkspaceRecords(workspace);
    expect(workspaceRecords.some((record) => record.type === "progress" && record.metadata.plannerStatus === "user_cancelled")).toBe(true);
  });

  it("pauses sectioned planning after a validated section checkpoint", async () => {
    const calls: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        const records = [
          {
            type: "candidate_card",
            sourceId: "synthesis:movement-model",
            title: "Implement movement model",
            description: "Add movement from the movement section.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Movement",
            labels: ["movement"],
            blockedBy: [],
            sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-2" }],
            acceptanceCriteria: ["Ship moves."],
            testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          },
          {
            type: "source_coverage",
            sourceId: "source-gdd",
            range: "lines:1-2",
            status: "covered",
            cardIds: ["synthesis:movement-model"],
            updatedAt: "2026-05-04T00:00:00.000Z",
          },
        ];
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records }) } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Sectioned Pause",
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: [
            "## Movement",
            "The ship uses hybrid Newtonian movement.",
            "",
            "## Combat",
            "Enemy ships fire salvos and shields absorb damage.",
          ].join("\n"),
          relevance: 99,
        },
      ],
      shouldPause: (checkpoint) => checkpoint.phase === "section" && checkpoint.sectionIndex === 1,
    });

    expect(calls).toHaveLength(1);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:movement-model"]);
    expect(result.telemetry).toMatchObject({
      paused: true,
      pauseReason: "user_cancelled",
      partial: true,
      sectionCount: 2,
    });
    expect(result.progressiveRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "progress",
          stage: "planning_paused",
          metadata: expect.objectContaining({
            sectionIndex: 1,
            sectionCount: 2,
            stopReason: "pause_requested",
          }),
        }),
      ]),
    );
  });

  it("uses a durable Pi session transport for planner batches when no direct fetch implementation is supplied", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-pi-session-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-architecture",
        kind: "architecture_artifact" as const,
        title: "Architecture",
        summary: "Create the app shell first.",
        path: "ARCHITECTURE.md",
        relevance: 95,
      },
      {
        id: "source-gameplay",
        kind: "functional_spec" as const,
        title: "Gameplay",
        summary: "Then add movement.",
        path: "GAMEPLAY.md",
        relevance: 90,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-pi-session",
      projectName: "Pi Session Board",
      operation: "board_synthesis",
      sources,
    });
    const piCalls: Array<{ sessionId?: string; prompt: string; maxTokens?: number; maxToolRounds?: number; responseFormat?: unknown; toolNames: string[] }> = [];
    const progressTransportModes: unknown[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      maxToolRounds: 6,
      piTextCall: async (callInput) => {
        piCalls.push({
          prompt: callInput.prompt,
          ...(callInput.sessionId ? { sessionId: callInput.sessionId } : {}),
          ...(callInput.maxTokens === undefined ? {} : { maxTokens: callInput.maxTokens }),
          ...(callInput.maxToolRounds === undefined ? {} : { maxToolRounds: callInput.maxToolRounds }),
          ...(callInput.responseFormat === undefined ? {} : { responseFormat: callInput.responseFormat }),
          toolNames: callInput.tools?.map((tool) => tool.name) ?? [],
        });
        callInput.onProgress?.({
          outputChars: 24,
          thinkingChars: 0,
          elapsedMs: 10,
          stage: "streaming",
        });
        return JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:app-shell",
              title: "Create app shell",
              description: "Create the app shell and first movement proof path.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labels: ["foundation"],
              blockedBy: [],
              sourceRefs: [
                { sourceId: "source-architecture", range: "full" },
                { sourceId: "source-gameplay", range: "full" },
              ],
              acceptanceCriteria: ["The app shell starts."],
              testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-architecture",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:app-shell"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
            {
              type: "source_coverage",
              sourceId: "source-gameplay",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:app-shell"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
          remainingCoverageSummary: "All source work is represented.",
        });
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Pi Session Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 2,
      onProgress: (progress) => progressTransportModes.push(progress.metadata.transportMode),
    });

    const plannerPiCalls = piCalls.filter((call) => call.prompt.includes("Plan the next small batch"));
    expect(plannerPiCalls).toHaveLength(1);
    expect(plannerPiCalls[0]).toMatchObject({
      sessionId: workspace.sessionId,
      maxTokens: 7200,
      maxToolRounds: 6,
      responseFormat: { type: "json_object" },
      toolNames: [
        "planner_source_manifest",
        "planner_source_search",
        "planner_source_read",
        "planner_source_qa",
        "planner_ledger_read",
        "planner_card_search",
        "planner_records_append",
      ],
    });
    expect(plannerPiCalls[0].prompt).toContain("planner_records_append");
    expect(plannerPiCalls[0].prompt).toContain(workspace.aggregateJsonlPath);
    expect(progressTransportModes).toContain("pi_session_stream");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:app-shell"]);
    expect(result.telemetry).toMatchObject({
      plannerBatchCount: 1,
      batchCardLimit: 3,
      cardCount: 1,
      outputTokenBudget: 7200,
      modelBudgetProfile: { operation: "planner_card_batch", maxOutputTokens: 7200 },
    });
  });

  it("records recoverable planner-batch output-cap stops with last valid record metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-output-cap-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board.",
        path: "KANBAN.md",
        relevance: 95,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-output-cap",
      projectName: "Output Cap Board",
      operation: "board_synthesis",
      sources,
    });
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        callInput.onProgress?.({
          outputChars: 120,
          thinkingChars: 0,
          elapsedMs: 10,
          stage: "streaming",
        });
        callInput.onCompleted?.({
          finishReason: "length",
          stopReason: "length",
          outputChars: 120,
          thinkingChars: 0,
          maxTokens: callInput.maxTokens,
          toolRound: 0,
        });
        return JSON.stringify({
          plannerStatus: "continue",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:kanban-shell",
              title: "Create kanban shell",
              description: "Create columns and a first card model.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labels: ["kanban"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
              acceptanceCriteria: ["The kanban board renders columns."],
              testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-kanban",
              range: "full",
              status: "partial",
              cardIds: ["synthesis:kanban-shell"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Output Cap Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 3,
      onProgress: (event) => progress.push(event),
    });

    expect(result.telemetry).toMatchObject({
      partial: true,
      finishReason: "length",
      plannerBatchFinishReasons: ["length"],
      recoverableOutputStopCount: 1,
      outputTokenBudget: 7200,
      modelBudgetProfile: {
        operation: "planner_card_batch",
        maxOutputTokens: 7200,
        maxCardsPerBatch: 3,
      },
      lastValidRecordId: "source-kanban",
      lastValidRecordType: "source_coverage",
    });
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:kanban-shell"]);
    const batchProgress = (await readProjectBoardPlannerWorkspaceRecords(workspace)).find(
      (record) => record.type === "progress" && record.stage === "planner_batch_succeeded",
    );
    expect(batchProgress).toMatchObject({
      metadata: {
        plannerStatus: "budget_exhausted",
        finishReason: "length",
        recoverableOutputStop: true,
        outputTokenBudget: 7200,
        modelBudgetProfile: {
          operation: "planner_card_batch",
          maxOutputTokens: 7200,
          maxCardsPerBatch: 3,
        },
        lastValidRecordId: "source-kanban",
        lastValidRecordType: "source_coverage",
      },
    });
    expect(progress.some((event) => event.metadata.recoverableOutputStop === true)).toBe(true);
  });

  it("compacts a large planner ledger before asking for the next cards", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-budget-pressure-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Large kanban fixture",
        summary: "Build a small web kanban board and continue planning from an already large rendered-card ledger.",
        path: "KANBAN.md",
        relevance: 95,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-budget-pressure",
      projectName: "Budget Pressure Board",
      operation: "board_synthesis",
      sources,
    });
    const priorCards = Array.from({ length: 1_500 }, (_, index) => ({
      type: "candidate_card" as const,
      sourceId: `synthesis:prior-card-${index}`,
      title: `Prior rendered card ${index}`,
      description: "Existing rendered card carried forward to test prompt-budget pressure in the planner ledger.",
      candidateStatus: "ready_to_create" as const,
      priority: 1,
      phase: "Existing",
      labels: ["existing"],
      blockedBy: [],
      sourceRefs: [{ sourceId: "source-kanban", range: `prior-${index}` }],
      clarificationQuestions: [],
      acceptanceCriteria: ["Existing card remains rendered and should not be regenerated."],
      testPlan: { unit: ["Existing proof."], integration: [], visual: [], manual: [] },
    }));
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const prompts: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "unknown-model",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        prompts.push(callInput.prompt);
        if (callInput.systemPrompt?.includes("ledger compaction")) {
          return JSON.stringify({
            summary: "The existing board already covers a long run of prior kanban cards. Continue with source-kanban gaps only.",
            renderedCardThemes: ["Existing: 1500 rendered cards"],
            duplicateAvoidanceNotes: ["Do not recreate prior-card titles; use planner_card_search for exact duplicate checks."],
            remainingCoverage: [{ sourceId: "source-kanban", title: "Large kanban fixture", status: "uncovered", summary: "Needs one focused gap card." }],
            openQuestions: [],
            dependencyHints: ["New cards should not depend on omitted prior card details unless searched."],
            citations: ["source-kanban", "synthesis:prior-card-1499"],
          });
        }
        return JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:kanban-summary",
              title: "Summarize current kanban gaps",
              description: "Create a focused card from the remaining source after the large ledger warning.",
              candidateStatus: "ready_to_create",
              priority: 2,
              phase: "Planning",
              labels: ["kanban"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["The card identifies remaining board gaps."],
              testPlan: { unit: ["Validate the card model."], integration: [], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-kanban",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:kanban-summary"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Budget Pressure Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 1,
      resumeFromRecords: priorCards,
      onProgress: (event) => progress.push(event),
    });

    const records = await readProjectBoardPlannerWorkspaceRecords(workspace);
    const compaction = records.find((record) => record.type === "progress" && record.stage === "planner_ledger_compacted");
    const plannerRequest = progress.find(
      (event) => event.stage === "model_request" && event.title === "Asked Ambient/Pi for planner batch 1",
    );

    const plannerPrompts = prompts.filter((prompt) => prompt.includes("Compact project-board planner context") || prompt.includes("Plan the next small batch"));
    expect(plannerPrompts).toHaveLength(2);
    expect(plannerPrompts[0]).toContain("Compact project-board planner context");
    expect(plannerPrompts[0]).toContain("Prior rendered card 1499");
    expect(plannerPrompts[1]).toContain("Compacted planner context:");
    expect(plannerPrompts[1]).toContain("The existing board already covers a long run of prior kanban cards");
    expect(plannerPrompts[1].length).toBeLessThan(plannerPrompts[0].length);
    expect(plannerPrompts[1]).not.toContain("Prior rendered card 100");
    expect(compaction).toMatchObject({
      type: "progress",
      stage: "planner_ledger_compacted",
      metadata: {
        plannerBatchIndex: 1,
        plannerLedgerCompaction: {
          source: "pi_rlm",
          cacheHit: false,
          cacheKey: expect.stringMatching(/^planner-ledger-compaction-/),
          renderedCardCount: 1500,
          omittedRenderedCardCount: 1440,
          rawPromptBudgetStatus: expect.stringMatching(/summarization_recommended|soft_prompt_budget_exceeded|context_budget_exceeded/),
        },
        plannerLedgerCompactionCache: {
          source: "pi_rlm",
          cacheHit: false,
          cacheKey: expect.stringMatching(/^planner-ledger-compaction-/),
          summary: "The existing board already covers a long run of prior kanban cards. Continue with source-kanban gaps only.",
          duplicateAvoidanceNotes: ["Do not recreate prior-card titles; use planner_card_search for exact duplicate checks."],
        },
      },
    });
    expect(plannerRequest?.metadata.promptBudgetAssessment).toMatchObject({
      operation: "planner_card_batch",
      summarizationRecommended: false,
    });
    expect(plannerRequest?.metadata.rawPromptBudgetAssessment).toMatchObject({
      operation: "planner_card_batch",
      summarizationRecommended: true,
    });
    expect(plannerRequest?.metadata.plannerLedgerCompaction).toMatchObject({
      source: "pi_rlm",
      renderedCardCount: 1500,
    });
    expect(plannerRequest?.metadata).toMatchObject({
      latestPromptCharCount: plannerPrompts[1].length,
      cumulativePromptCharCount: plannerPrompts[0].length + plannerPrompts[1].length,
      latestEstimatedInputTokens: Math.ceil(plannerPrompts[1].length / 4),
      cumulativeEstimatedInputTokens: Math.ceil((plannerPrompts[0].length + plannerPrompts[1].length) / 4),
      plannerLedgerCompactionStatus: "used",
    });
    expect(result.telemetry).toMatchObject({
      plannerLedgerCompactionCount: 1,
      plannerLedgerCompactionCacheHitCount: 0,
      promptBudgetWarningCount: 0,
      modelBudgetProfile: { operation: "planner_card_batch" },
    });
    expect(result.telemetry.promptBudgetStatus).toBe("within_budget");
    expect(result.telemetry.lastPlannerLedgerCompaction).toMatchObject({
      source: "pi_rlm",
      cacheHit: false,
      renderedCardCount: 1500,
    });
  });

  it("reuses cached planner ledger compaction for unchanged ledger inputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-budget-cache-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Large kanban fixture",
        summary: "Build a small web kanban board with many already rendered cards.",
        path: "KANBAN.md",
        relevance: 95,
      },
    ];
    const firstWorkspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-budget-cache",
      runId: "run-budget-cache-1",
      projectName: "Budget Cache Board",
      operation: "board_synthesis",
      sources,
    });
    const priorCards = Array.from({ length: 1_500 }, (_, index) => ({
      type: "candidate_card" as const,
      sourceId: `synthesis:prior-card-${index}`,
      title: `Prior rendered card ${index}`,
      description: "Existing rendered card carried forward to test compaction cache reuse.",
      candidateStatus: "ready_to_create" as const,
      priority: 1,
      phase: "Existing",
      labels: ["existing"],
      blockedBy: [],
      sourceRefs: [{ sourceId: "source-kanban", range: `prior-${index}` }],
      clarificationQuestions: [],
      acceptanceCriteria: ["Existing card remains rendered and should not be regenerated."],
      testPlan: { unit: ["Existing proof."], integration: [], visual: [], manual: [] },
    }));
    const firstProvider = new AmbientProjectBoardSynthesisProvider({
      model: "unknown-model",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        if (callInput.systemPrompt?.includes("ledger compaction")) {
          return JSON.stringify({
            summary: "Cached compaction summary for the unchanged kanban ledger.",
            renderedCardThemes: ["Existing: 1500 rendered cards"],
            duplicateAvoidanceNotes: ["Avoid the already-rendered prior-card series."],
            remainingCoverage: [{ sourceId: "source-kanban", title: "Large kanban fixture", status: "uncovered", summary: "One gap remains." }],
            openQuestions: [],
            dependencyHints: ["Search prior cards before adding setup work."],
            citations: ["source-kanban", "synthesis:prior-card-1499"],
          });
        }
        return plannerBatchFixtureResponse("synthesis:first-cache-probe");
      },
    });

    await firstProvider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Budget Cache Board",
      sources,
      plannerWorkspace: firstWorkspace,
      maxBatches: 1,
      resumeFromRecords: priorCards,
    });

    const firstRecords = await readProjectBoardPlannerWorkspaceRecords(firstWorkspace);
    const cachedCompactionRecords = firstRecords.filter(
      (record): record is Extract<ProposalJsonlRecordArtifact, { type: "progress" }> =>
        record.type === "progress" && record.stage === "planner_ledger_compacted",
    );
    expect(cachedCompactionRecords).toHaveLength(1);
    const cachedCompactionMetadata = cachedCompactionRecords[0]?.metadata.plannerLedgerCompaction as { cacheKey: string } | undefined;
    expect(cachedCompactionMetadata?.cacheKey).toMatch(/^planner-ledger-compaction-/);

    const secondWorkspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-budget-cache",
      runId: "run-budget-cache-2",
      projectName: "Budget Cache Board",
      operation: "board_synthesis",
      sources,
    });
    const secondProgress: AmbientProjectBoardSynthesisProgress[] = [];
    const secondPrompts: string[] = [];
    let secondCompactionCalls = 0;
    const secondProvider = new AmbientProjectBoardSynthesisProvider({
      model: "unknown-model",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        secondPrompts.push(callInput.prompt);
        if (callInput.systemPrompt?.includes("ledger compaction")) {
          secondCompactionCalls += 1;
          throw new Error("Second run should reuse the cached ledger compaction.");
        }
        return plannerBatchFixtureResponse("synthesis:second-cache-probe");
      },
    });

    const secondResult = await secondProvider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Budget Cache Board",
      sources,
      plannerWorkspace: secondWorkspace,
      maxBatches: 1,
      resumeFromRecords: [...priorCards, ...cachedCompactionRecords],
      onProgress: (event) => secondProgress.push(event),
    });
    const secondRecords = await readProjectBoardPlannerWorkspaceRecords(secondWorkspace);
    const cacheHitRecord = secondRecords.find(
      (record) =>
        record.type === "progress" &&
        record.stage === "planner_ledger_compacted" &&
        (record.metadata.plannerLedgerCompaction as { cacheHit?: boolean } | undefined)?.cacheHit === true,
    );

    expect(secondCompactionCalls).toBe(0);
    const secondPlannerPrompts = secondPrompts.filter((prompt) => prompt.includes("Plan the next small batch"));
    expect(secondPlannerPrompts).toHaveLength(1);
    expect(secondPlannerPrompts[0]).toContain("Compacted planner context:");
    expect(secondPlannerPrompts[0]).toContain("Cached compaction summary for the unchanged kanban ledger.");
    expect(secondProgress.some((event) => event.title === "Reused cached planner ledger compaction for batch 1")).toBe(true);
    expect(cacheHitRecord).toMatchObject({
      type: "progress",
      stage: "planner_ledger_compacted",
      metadata: {
        plannerLedgerCompaction: {
          cacheHit: true,
          cacheKey: cachedCompactionMetadata?.cacheKey,
          renderedCardCount: 1500,
          omittedRenderedCardCount: 1440,
        },
      },
    });
    expect(secondResult.telemetry).toMatchObject({
      plannerLedgerCompactionCount: 1,
      plannerLedgerCompactionCacheHitCount: 1,
      promptBudgetWarningCount: 0,
    });
    expect(secondResult.telemetry.lastPlannerLedgerCompaction).toMatchObject({
      cacheHit: true,
      cacheKey: cachedCompactionMetadata?.cacheKey,
      renderedCardCount: 1500,
    });
  });

  it("prompts planner-batch retries from an explicit continuation checkpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-continuation-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board.",
        path: "KANBAN.md",
        relevance: 95,
      },
      {
        id: "source-dnd",
        kind: "functional_spec" as const,
        title: "Drag and drop",
        summary: "Cards should move between columns.",
        path: "DND.md",
        relevance: 90,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-continuation",
      projectName: "Continuation Board",
      operation: "board_synthesis",
      sources,
    });
    const prompts: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        prompts.push(callInput.prompt);
        return JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:drag-and-drop",
              title: "Add card drag and drop",
              description: "Move cards between columns with accessible status updates.",
              candidateStatus: "ready_to_create",
              priority: 2,
              phase: "Interaction",
              labels: ["kanban"],
              blockedBy: ["synthesis:kanban-shell"],
              sourceRefs: [{ sourceId: "source-dnd", range: "full" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["Cards can move between columns."],
              testPlan: { unit: [], integration: ["Move a card in a browser test."], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-dnd",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:drag-and-drop"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Continuation Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 2,
      resumeFromRecords: [
        {
          type: "candidate_card",
          sourceId: "synthesis:kanban-shell",
          title: "Create kanban shell",
          description: "Create columns and a first card model.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["kanban"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["The kanban board renders columns."],
          testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
        },
        {
          type: "source_coverage",
          sourceId: "source-kanban",
          range: "full",
          status: "partial",
          cardIds: ["synthesis:kanban-shell"],
          updatedAt: "2026-05-04T12:00:00.000Z",
        },
      ],
      resumeContinuation: {
        retryOfRunId: "run-output-cap",
        finishReason: "length",
        outputTokenBudget: 6000,
        lastValidRecordId: "source-kanban",
        lastValidRecordType: "source_coverage",
        originalRecordCount: 4,
        retainedRecordCount: 2,
        truncatedToLastValidRecord: true,
      },
    });

    const plannerPrompts = prompts.filter((prompt) => prompt.includes("Plan the next small batch"));
    expect(plannerPrompts).toHaveLength(1);
    expect(plannerPrompts[0]).toContain("Continuation checkpoint:");
    expect(plannerPrompts[0]).toContain("The last valid persisted record was source_coverage source-kanban.");
    expect(plannerPrompts[0]).toContain("Do not stitch partial JSON");
    expect(plannerPrompts[0]).toContain("synthesis:kanban-shell");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:kanban-shell", "synthesis:drag-and-drop"]);
  });

  it("describes paused planner-batch continuations with the pause checkpoint reason", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-paused-continuation-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board.",
        path: "KANBAN.md",
        relevance: 95,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-paused-continuation",
      projectName: "Paused Continuation Board",
      operation: "board_synthesis",
      sources,
    });
    const prompts: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        prompts.push(callInput.prompt);
        return JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:drag-and-drop",
              title: "Add card drag and drop",
              description: "Move cards between columns with accessible status updates.",
              candidateStatus: "ready_to_create",
              priority: 2,
              phase: "Interaction",
              labels: ["kanban"],
              blockedBy: ["synthesis:kanban-shell"],
              sourceRefs: [{ sourceId: "source-kanban", range: "later" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["Cards can move between columns."],
              testPlan: { unit: [], integration: ["Move a card in a browser test."], visual: [], manual: [] },
            },
          ],
        });
      },
    });

    await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Paused Continuation Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 1,
      resumeFromRecords: [
        {
          type: "candidate_card",
          sourceId: "synthesis:kanban-shell",
          title: "Create kanban shell",
          description: "Create columns and a first card model.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["kanban"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: "intro" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["The kanban board renders columns."],
          testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
        },
      ],
      resumeContinuation: {
        retryOfRunId: "run-paused",
        finishReason: "user_cancelled",
        stopReason: "pause_requested",
        outputTokenBudget: 7200,
        lastValidRecordId: "synthesis:kanban-shell",
        lastValidRecordType: "candidate_card",
        lastValidRecordIndex: 0,
        plannerBatchIndex: 1,
        plannerBatchCount: 4,
        originalRecordCount: 4,
        retainedRecordCount: 1,
        truncatedToLastValidRecord: true,
      },
    });

    const plannerPrompts = prompts.filter((prompt) => prompt.includes("Plan the next small batch"));
    expect(plannerPrompts).toHaveLength(1);
    expect(plannerPrompts[0]).toContain("Continuation checkpoint:");
    expect(plannerPrompts[0]).toContain("Ambient/Pi previously stopped because of pause_requested.");
    expect(plannerPrompts[0]).not.toContain("previously stopped because of user_cancelled");
    expect(plannerPrompts[0]).toContain("The retry prompt contains 1 validated records through that checkpoint, from 4 prior records.");
  });

  it("keeps resumed planner-batch records recoverable when Pi returns an invalid batch shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-invalid-resume-batch-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board.",
        path: "KANBAN.md",
        relevance: 95,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-invalid-resume-batch",
      projectName: "Invalid Resume Batch Board",
      operation: "board_synthesis",
      sources,
    });
    const progress: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async () => JSON.stringify({ plannerStatus: "continue", cards: { invalid: true } }),
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Invalid Resume Batch Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 1,
      resumeFromRecords: [
        {
          type: "candidate_card",
          sourceId: "synthesis:kanban-shell",
          title: "Create kanban shell",
          description: "Create columns and a first card model.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["kanban"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: "intro" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["The kanban board renders columns."],
          testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
        },
      ],
      resumeContinuation: {
        retryOfRunId: "run-paused",
        finishReason: "user_cancelled",
        stopReason: "pause_requested",
        outputTokenBudget: 7200,
        lastValidRecordId: "synthesis:kanban-shell",
        lastValidRecordType: "candidate_card",
        lastValidRecordIndex: 0,
        originalRecordCount: 4,
        retainedRecordCount: 1,
        truncatedToLastValidRecord: true,
      },
      onProgress: (event) => progress.push(`${event.stage}:${event.title}`),
    });

    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:kanban-shell"]);
    expect(result.telemetry.partial).toBe(true);
    expect(result.progressiveRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "progress", stage: "planner_batch_failed" }),
        expect.objectContaining({ type: "error", code: "planner_batch_invalid_response", recoverable: true }),
      ]),
    );
    expect(progress).toContain("schema_validation:Failed planner batch 1");
  });

  it("filters retry planner-batch cards already present in the rendered-card ledger", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-rendered-duplicate-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board.",
        path: "KANBAN.md",
        relevance: 95,
      },
      {
        id: "source-dnd",
        kind: "functional_spec" as const,
        title: "Drag and drop",
        summary: "Cards should move between columns.",
        path: "DND.md",
        relevance: 90,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-rendered-duplicate",
      projectName: "Continuation Board",
      operation: "board_synthesis",
      sources,
    });
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async () =>
        JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:kanban-shell",
              title: "Create kanban shell",
              description: "Duplicate card that Pi should not have re-emitted.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labels: ["kanban"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["The kanban board renders columns."],
              testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
            },
            {
              type: "candidate_card",
              sourceId: "synthesis:drag-and-drop",
              title: "Add card drag and drop",
              description: "Move cards between columns with accessible status updates.",
              candidateStatus: "ready_to_create",
              priority: 2,
              phase: "Interaction",
              labels: ["kanban"],
              blockedBy: ["synthesis:kanban-shell"],
              sourceRefs: [{ sourceId: "source-dnd", range: "full" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["Cards can move between columns."],
              testPlan: { unit: [], integration: ["Move a card in a browser test."], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-kanban",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:kanban-shell"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
            {
              type: "source_coverage",
              sourceId: "source-dnd",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:drag-and-drop"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        }),
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Continuation Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 2,
      resumeFromRecords: [
        {
          type: "candidate_card",
          sourceId: "synthesis:kanban-shell",
          title: "Create kanban shell",
          description: "Create columns and a first card model.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["kanban"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["The kanban board renders columns."],
          testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
        },
        {
          type: "source_coverage",
          sourceId: "source-kanban",
          range: "full",
          status: "covered",
          cardIds: ["synthesis:kanban-shell"],
          updatedAt: "2026-05-04T12:00:00.000Z",
        },
      ],
      resumeContinuation: {
        retryOfRunId: "run-output-cap",
        finishReason: "length",
        outputTokenBudget: 6000,
        lastValidRecordId: "source-kanban",
        lastValidRecordType: "source_coverage",
        originalRecordCount: 4,
        retainedRecordCount: 2,
        truncatedToLastValidRecord: true,
      },
    });

    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:kanban-shell", "synthesis:drag-and-drop"]);
    expect(result.telemetry).toMatchObject({ renderedCardDuplicateFilterCount: 1 });
    expect(result.progressiveRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "warning",
          code: "planner_batch_rendered_card_duplicate_filtered",
          metadata: expect.objectContaining({
            enforcement: "rendered_card_ledger",
            duplicateCount: 1,
            duplicateCandidates: [
              expect.objectContaining({
                sourceId: "synthesis:kanban-shell",
                matchedCardId: "synthesis:kanban-shell",
                reason: "source_id",
                restartAction: "reuse_rendered_card",
              }),
            ],
          }),
        }),
      ]),
    );
    const workspaceRecords = await readProjectBoardPlannerWorkspaceRecords(workspace);
    expect(
      workspaceRecords.some(
        (record) =>
          record.type === "candidate_card" &&
          record.sourceId === "synthesis:kanban-shell" &&
          record.description === "Duplicate card that Pi should not have re-emitted.",
      ),
    ).toBe(false);
  });

  it("allows planner-batch retry to regenerate rendered cards invalidated by source checksum drift", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-rendered-invalidated-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board with a refreshed interaction model.",
        path: "KANBAN.md",
        contentHash: "hash-kanban-v2",
        relevance: 95,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-rendered-invalidated",
      projectName: "Continuation Board",
      operation: "board_synthesis",
      sources,
    });
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async () =>
        JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:kanban-shell",
              title: "Create kanban shell",
              description: "Regenerated card from the refreshed kanban source.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labels: ["kanban"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["The refreshed kanban board renders columns."],
              testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-kanban",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:kanban-shell"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        }),
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Continuation Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 2,
      resumeFromRecords: [
        {
          type: "candidate_card",
          sourceId: "synthesis:kanban-shell",
          title: "Create kanban shell",
          description: "Stale card from the previous kanban source.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["kanban"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: "full", contentHash: "hash-kanban-v1" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["The old kanban board renders columns."],
          testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
        },
      ],
    });

    expect(result.draft.cards).toHaveLength(1);
    expect(result.draft.cards[0]).toMatchObject({
      sourceId: "synthesis:kanban-shell",
      description: "Regenerated card from the refreshed kanban source.",
    });
    expect(result.telemetry).toMatchObject({ renderedCardDuplicateFilterCount: 0 });
    expect(result.progressiveRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "warning",
          code: "planner_batch_rendered_card_ledger_invalidated",
          metadata: expect.objectContaining({
            enforcement: "rendered_card_ledger",
            invalidatedCount: 1,
            invalidatedCandidates: [
              expect.objectContaining({
                sourceId: "synthesis:kanban-shell",
                matchedCardId: "synthesis:kanban-shell",
                restartAction: "regenerate_card",
                invalidationReasons: ["source_checksum_changed"],
              }),
            ],
          }),
        }),
      ]),
    );
  });

  it("imports sectioned planning records from planner workspace outputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-section-workspace-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-section-1",
      projectName: "Section Workspace",
      operation: "section_elaboration",
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          excerpt: "# Movement\nThe ship uses inertia.",
          path: "GDD.md",
          relevance: 99,
        },
      ],
    });
    const batches: Array<{ records: string[]; accumulated: number }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        expect(String(init?.body)).toContain(workspace.aggregateJsonlPath);
        await appendProjectBoardPlannerWorkspaceRecords(workspace, [
          validateProposalJsonlRecordArtifact({
            type: "candidate_card",
            sourceId: "synthesis:section-workspace-card",
            title: "Implement section workspace card",
            description: "Card emitted through workspace JSONL.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Gameplay",
            labels: ["movement"],
            blockedBy: [],
            sourceRefs: [{ sourceId: "source-gdd", range: "full" }],
            acceptanceCriteria: ["Movement is represented."],
            testPlan: { unit: ["Movement unit proof."], integration: [], visual: [], manual: [] },
          }),
          validateProposalJsonlRecordArtifact({
            type: "source_coverage",
            sourceId: "source-gdd",
            range: "full",
            status: "covered",
            cardIds: ["synthesis:section-workspace-card"],
            updatedAt: "2026-05-04T12:00:00.000Z",
          }),
        ]);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records: [] }) } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Section Workspace",
      sources: workspace.sources.map((source) => ({
        id: source.sourceId,
        kind: source.kind,
        title: source.title,
        summary: source.summary,
        path: source.originalPath,
        relevance: source.relevance,
      })),
      plannerWorkspace: workspace,
      onProgressiveRecords: (batch) =>
        batches.push({ records: batch.records.map((record) => record.type), accumulated: batch.accumulatedRecordCount }),
    });

    expect(batches).toEqual([
      { records: ["candidate_card", "source_coverage"], accumulated: 2 },
      { records: ["progress"], accumulated: 3 },
    ]);
    expect(result.draft.cards.map((card) => card.title)).toEqual(["Implement section workspace card"]);
    expect(result.progressiveRecords?.some((record) => record.type === "proposal_final")).toBe(true);
  });

  it("streams response character progress before validating the final draft", async () => {
    const draft = JSON.stringify({
      summary: "Streamed board.",
      goal: "Build the game.",
      currentState: "Spec exists.",
      targetUser: "Player.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: ["README contains the design."],
      cards: [
        {
          sourceId: "synthesis:streamed-card",
          title: "Implement streamed card",
          description: "Card arrived over SSE.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["game"],
          blockedBy: [],
          acceptanceCriteria: ["Done condition exists."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          sourceRefs: ["README.md"],
        },
      ],
    });
    const chunks = [draft.slice(0, 80), draft.slice(80)];
    const progress: Array<{ stage: string; chars?: number }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              for (const chunk of chunks) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Stream Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
      onProgress: (event) => progress.push({ stage: event.stage, chars: event.responseCharCount }),
    });

    expect(result.draft.cards[0].title).toBe("Implement streamed card");
    expect(result.telemetry.responseCharCount).toBe(draft.length);
    expect(progress.some((event) => event.stage === "model_response" && event.chars === draft.length)).toBe(true);
  });

  it("can disable Ambient reasoning with the official reasoning configuration", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      reasoning: false,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Fast board.",
                    goal: "Build the game.",
                    currentState: "Spec exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:fast-card",
                        title: "Implement fast card",
                        description: "Card generated without reasoning.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["fast"],
                        blockedBy: [],
                        acceptanceCriteria: ["Done condition exists."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["README.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    await provider.synthesizeWithTelemetry({
      projectName: "No Reasoning Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
    });

    expect(bodies[0]).toMatchObject({ reasoning: { effort: "none", enabled: false, exclude: true }, stream: true });
    expect(bodies[0]).not.toHaveProperty("enable_thinking");
  });

  it("can cap Ambient reasoning effort and reasoning tokens for faster board synthesis experiments", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      reasoning: { effort: "low", max_tokens: 750, exclude: true, enabled: true },
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Capped board.",
                    goal: "Build the game.",
                    currentState: "Spec exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:capped-card",
                        title: "Implement capped card",
                        description: "Card generated with capped reasoning.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["fast"],
                        blockedBy: [],
                        acceptanceCriteria: ["Done condition exists."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["README.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    await provider.synthesizeWithTelemetry({
      projectName: "Capped Reasoning Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
    });

    expect(bodies[0]).toMatchObject({ reasoning: { effort: "low", max_tokens: 750, exclude: true, enabled: true }, stream: true });
    expect(bodies[0]).not.toHaveProperty("thinking_budget");
  });

  it("treats Ambient streaming activity as the synthesis timeout heartbeat", async () => {
    const draft = JSON.stringify({
      summary: "Idle-timeout board.",
      goal: "Build the game.",
      currentState: "Spec exists.",
      targetUser: "Player.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:heartbeat-card",
          title: "Implement heartbeat card",
          description: "Card arrived across multiple active stream events.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["game"],
          blockedBy: [],
          acceptanceCriteria: ["Done condition exists."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          sourceRefs: ["README.md"],
        },
      ],
    });
    const chunks = [draft.slice(0, 60), draft.slice(60, 120), draft.slice(120)];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 100,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              void (async () => {
                for (const chunk of chunks) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
                  await new Promise((resolve) => setTimeout(resolve, 45));
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
              })().catch((error) => controller.error(error));
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Heartbeat Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
    });

    expect(result.draft.cards[0].title).toBe("Implement heartbeat card");
    expect(result.telemetry.responseCharCount).toBe(draft.length);
  });

  it("fails with a clear idle-timeout error when Ambient streaming stalls", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 10,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "{\"summary\":" } }] })}\n\n`));
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    await expect(
      provider.synthesizeWithTelemetry({
        projectName: "Stall Test",
        sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
      }),
    ).rejects.toThrow(/stream stalled/);
  });

  it("fails when Ambient never starts a project-board synthesis stream", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 10,
      fetchImpl: async () => new Promise<Response>(() => undefined),
    });

    await expect(
      provider.synthesizeWithTelemetry({
        projectName: "No Stream Test",
        sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
      }),
    ).rejects.toThrow(/stalled before streaming began/);
  });

  it("plans large sources section-by-section and emits progressive record batches before final draft assembly", async () => {
    const calls: string[] = [];
    const batches: Array<{ section: string; records: number; accumulated: number }> = [];
    const progress: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        const isMovement = prompt.includes("Section heading: Movement");
        const isCombat = prompt.includes("Section heading: Combat");
        const records =
          !isMovement && !isCombat
            ? [
                {
                  type: "question",
                  questionId: "question:game-scope",
                  question: "Which MVP scope should the intro optimize for?",
                  required: true,
                  createdAt: "2026-05-04T00:00:00.000Z",
                },
                {
                  type: "source_coverage",
                  sourceId: "source-gdd",
                  range: "lines:1-2",
                  status: "partial",
                  cardIds: [],
                  updatedAt: "2026-05-04T00:00:00.000Z",
                },
              ]
            : [
                {
                  type: "candidate_card",
                  sourceId: isMovement ? "synthesis:movement-model" : "synthesis:combat-loop",
                  title: isMovement ? "Implement movement model" : "Implement combat loop",
                  description: isMovement ? "Add movement from the movement section." : "Add combat from the combat section.",
                  candidateStatus: "needs_clarification",
                  priority: isMovement ? 1 : 2,
                  phase: isMovement ? "Movement" : "Combat",
                  labels: isMovement ? ["movement"] : ["combat"],
                  blockedBy: isCombat ? ["synthesis:movement-model"] : [],
                  sourceRefs: [{ sourceId: "source-gdd", range: isMovement ? "lines:4-5" : "lines:7-8" }],
                  acceptanceCriteria: [isMovement ? "Ship moves." : "Combat resolves."],
                  testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                },
                {
                  type: "source_coverage",
                  sourceId: "source-gdd",
                  range: isMovement ? "lines:4-5" : "lines:7-8",
                  status: "covered",
                  cardIds: [isMovement ? "synthesis:movement-model" : "synthesis:combat-loop"],
                  updatedAt: "2026-05-04T00:00:00.000Z",
                },
              ];
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records }) } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Sectioned Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: [
            "# Game",
            "Overview.",
            "",
            "## Movement",
            "The ship uses hybrid Newtonian movement.",
            "",
            "## Combat",
            "Enemy ships fire salvos and shields absorb damage.",
          ].join("\n"),
          relevance: 99,
        },
      ],
      onProgress: (event) => progress.push(`${event.stage}:${event.title}`),
      onProgressiveRecords: (batch) =>
        batches.push({ section: batch.section.heading, records: batch.records.length, accumulated: batch.accumulatedRecordCount }),
    });

    expect(calls).toHaveLength(3);
    expect(batches).toEqual([
      { section: "Game", records: 3, accumulated: 3 },
      { section: "Movement", records: 3, accumulated: 6 },
      { section: "Combat", records: 3, accumulated: 9 },
    ]);
    expect(progress.filter((item) => item.startsWith("schema_validation:Validated section"))).toHaveLength(3);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:movement-model", "synthesis:combat-loop"]);
    expect(result.telemetry).toMatchObject({
      cardCount: 2,
      sectionCount: 3,
      batchCardLimit: 3,
      progressiveRecordCount: expect.any(Number),
    });
  });

  it("compacts repeated sectioned planner context before long section runs keep accumulating prompt cost", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-section-compaction-"));
    tempRoots.push(root);
    const source = {
      id: "source-long-plan",
      kind: "implementation_plan" as const,
      title: "Long app plan",
      summary: "A long implementation plan with many independent sections.",
      path: "LONG_PLAN.md",
      excerpt: Array.from({ length: 9 }, (_, index) =>
        [`## Feature ${index + 1}`, `Build feature ${index + 1} with source-grounded scope and proof.`].join("\n"),
      ).join("\n\n"),
      relevance: 99,
    };
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-section-compaction",
      runId: "run-section-compaction",
      projectName: "Section Compaction Board",
      operation: "section_elaboration",
      sources: [source],
    });
    const calls: Array<{ systemPrompt?: string; prompt: string }> = [];
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "unknown-model",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        calls.push({ systemPrompt: callInput.systemPrompt, prompt: callInput.prompt });
        if (callInput.systemPrompt?.includes("ledger compaction")) {
          return JSON.stringify({
            summary: "Earlier feature sections are already represented; continue planning only the active feature section.",
            renderedCardThemes: ["Feature implementation sections already represented"],
            duplicateAvoidanceNotes: ["Do not recreate cards for earlier Feature sections."],
            remainingCoverage: [{ sourceId: "source-long-plan", title: "Long app plan", status: "partial", summary: "Later feature sections remain." }],
            openQuestions: [],
            dependencyHints: ["Keep later feature cards dependent on earlier foundations only when source evidence says so."],
            citations: ["source-long-plan"],
          });
        }
        const sectionMatch = /Section:\s+(\d+) of/.exec(callInput.prompt);
        const sectionNumber = Number(sectionMatch?.[1] ?? 1);
        const cardId = `synthesis:feature-${sectionNumber}`;
        return JSON.stringify({
          records: [
            {
              type: "candidate_card",
              sourceId: cardId,
              title: `Implement feature ${sectionNumber}`,
              description: `Implement feature ${sectionNumber} from the active source section.`,
              candidateStatus: "ready_to_create",
              priority: sectionNumber,
              phase: "Implementation",
              labels: ["feature"],
              blockedBy: sectionNumber > 1 ? [`synthesis:feature-${sectionNumber - 1}`] : [],
              sourceRefs: [{ sourceId: "source-long-plan", range: `feature-${sectionNumber}` }],
              clarificationQuestions: [],
              acceptanceCriteria: [`Feature ${sectionNumber} is implemented.`],
              testPlan: { unit: [`Feature ${sectionNumber} unit proof.`], integration: [], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-long-plan",
              range: `feature-${sectionNumber}`,
              status: "covered",
              cardIds: [cardId],
              updatedAt: "2026-05-04T00:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Section Compaction Board",
      sources: [source],
      plannerWorkspace: workspace,
      sectioning: { maxSectionChars: 1000, minSectionChars: 200 },
      onProgress: (event) => progress.push(event),
    });
    const records = await readProjectBoardPlannerWorkspaceRecords(workspace);
    const compactionCalls = calls.filter((call) => call.systemPrompt?.includes("ledger compaction"));
    const sectionCalls = calls.filter((call) => !call.systemPrompt?.includes("ledger compaction"));
    const sectionCompactionRecords = records.filter((record) => record.type === "progress" && record.stage === "section_context_compacted");
    const compactedSectionRequest = progress.find(
      (event) =>
        event.stage === "model_request" &&
        event.title.startsWith("Asked Ambient/Pi for section") &&
        event.metadata.plannerLedgerCompactionStatus === "used",
    );

    expect(compactionCalls.length).toBeGreaterThan(0);
    expect(sectionCalls.some((call) => call.prompt.includes("Compacted planner context:"))).toBe(true);
    expect(sectionCalls.some((call) => call.prompt.includes("Earlier feature sections are already represented"))).toBe(true);
    expect(sectionCompactionRecords.length).toBeGreaterThan(0);
    expect(sectionCompactionRecords[0]).toMatchObject({
      type: "progress",
      stage: "section_context_compacted",
      metadata: {
        sectionContextCompactionReason: expect.stringMatching(/section_count_threshold|repeated_stable_context|cumulative_prompt_budget|section_prompt_budget/),
        plannerLedgerCompaction: {
          source: "pi_rlm",
          cacheHit: false,
        },
      },
    });
    expect(compactedSectionRequest?.metadata).toMatchObject({
      plannerLedgerCompactionStatus: "used",
      sectionContextCompactionReason: expect.stringMatching(/section_count_threshold|repeated_stable_context|cumulative_prompt_budget|section_prompt_budget/),
      plannerLedgerCompaction: { source: "pi_rlm" },
    });
    expect(result.telemetry).toMatchObject({
      sectionCount: 9,
      plannerLedgerCompactionCount: compactionCalls.length,
      plannerLedgerCompactionCacheHitCount: 0,
      lastPlannerLedgerCompaction: { source: "pi_rlm" },
    });
  });

  it("limits each section to a small candidate-card batch", async () => {
    const prompts: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        prompts.push(body.messages.at(-1)?.content ?? "");
        const records: unknown[] = Array.from({ length: 4 }, (_, index) => ({
          type: "candidate_card",
          sourceId: `synthesis:batch-${index + 1}`,
          title: `Implement batch card ${index + 1}`,
          description: `Implement a small batch card ${index + 1}.`,
          candidateStatus: "ready_to_create",
          priority: index + 1,
          phase: "Foundation",
          labels: ["batch"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-5" }],
          acceptanceCriteria: [`Batch card ${index + 1} has proof.`],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }));
        records.push({
          type: "source_coverage",
          sourceId: "source-gdd",
          range: "lines:1-5",
          status: "covered",
          cardIds: ["synthesis:batch-1", "synthesis:batch-2", "synthesis:batch-3", "synthesis:batch-4"],
          updatedAt: "2026-05-04T00:00:00.000Z",
        });
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records }) } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Batch Game",
      maxCardsPerSection: 2,
      sectioning: { maxSectionChars: 1000, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: "# Game\nThe source contains several candidate systems.",
          relevance: 99,
        },
      ],
    });

    expect(prompts[0]).toContain("Emit at most 2 candidate_card records");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:batch-1", "synthesis:batch-2"]);
    expect(result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "section_batch_card_limit")).toBe(true);
    expect(result.telemetry).toMatchObject({ cardCount: 2, batchCardLimit: 2 });
  });

  it("retries zero-output transient Pi section calls before marking the section failed", async () => {
    const previousAttempts = process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS;
    const previousDelay = process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS;
    process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS = "2";
    process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS = "0";
    let calls = 0;
    try {
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: "zai-org/GLM-5.1-FP8",
        apiKey: "ambient-test-key",
        piTextCall: async () => {
          calls += 1;
          if (calls === 1) throw new Error("429 Upstream request failed after 96ms (0 output chars, 0 thinking chars, idle 0ms).");
          return JSON.stringify({
            records: [
              {
                type: "candidate_card",
                sourceId: "synthesis:transient-retry",
                title: "Implement retry-safe section",
                description: "Use the section result after a transient zero-output retry.",
                candidateStatus: "ready_to_create",
                priority: 1,
                phase: "Foundation",
                labels: ["retry"],
                blockedBy: [],
                sourceRefs: [{ sourceId: "source-gdd", range: "full" }],
                acceptanceCriteria: ["The section succeeds after a transient retry."],
                testPlan: { unit: ["Assert retry behavior."], integration: [], visual: [], manual: [] },
              },
              {
                type: "source_coverage",
                sourceId: "source-gdd",
                range: "full",
                status: "covered",
                cardIds: ["synthesis:transient-retry"],
                updatedAt: "2026-05-04T00:00:00.000Z",
              },
            ],
          });
        },
      });

      const result = await provider.synthesizeSectionedWithTelemetry({
        projectName: "Transient Retry Game",
        sectioning: { maxSectionChars: 1000, minSectionChars: 20 },
        sources: [
          {
            id: "source-gdd",
            kind: "functional_spec",
            title: "GDD",
            summary: "Game design.",
            path: "GAME_DESIGN_DOCUMENT.md",
            excerpt: "# Game\nThe source describes one retry-safe card.",
            relevance: 99,
          },
        ],
      });

      expect(calls).toBe(2);
      expect(result.draft.cards.map((card) => card.title)).toEqual(["Implement retry-safe section"]);
      expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_planning_failed")).toBe(false);
    } finally {
      if (previousAttempts === undefined) delete process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS;
      else process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS = previousAttempts;
      if (previousDelay === undefined) delete process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS;
      else process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS = previousDelay;
    }
  });

  it("uses the aggressive retry schedule for zero-output project-board section transport failures", async () => {
    let calls = 0;
    const retryDelays: number[] = [];
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      piTextCall: async () => {
        calls += 1;
        if (calls <= 3) throw new Error("429 Upstream request failed after 96ms (0 output chars, 0 thinking chars, idle 0ms).");
        return JSON.stringify({
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:aggressive-retry",
              title: "Implement aggressive retry recovery",
              description: "Use the section result after aggressive transient retries.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labels: ["retry"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-gdd", range: "full" }],
              acceptanceCriteria: ["The section succeeds after aggressive transient retries."],
              testPlan: { unit: ["Assert aggressive retry schedule."], integration: [], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-gdd",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:aggressive-retry"],
              updatedAt: "2026-05-04T00:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Aggressive Retry Game",
      sectioning: { maxSectionChars: 1000, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: "# Game\nThe source describes one aggressive retry card.",
          relevance: 99,
        },
      ],
      onProgress: (event) => progress.push(event),
    });

    expect(calls).toBe(4);
    expect(retryDelays).toEqual([1_000, 2_000, 3_000]);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:aggressive-retry"]);
    expect(progress.filter((event) => event.metadata.transientRetry === true).map((event) => event.metadata.retryDelayMs)).toEqual([
      1_000,
      2_000,
      3_000,
    ]);
    expect(progress.filter((event) => event.metadata.transientRetry === true).every((event) => event.metadata.aggressiveRetries === true)).toBe(true);
  });

  it("does not retry section transport failures after Pi has observed tool activity", async () => {
    let calls = 0;
    const retryDelays: number[] = [];
    const batches: Array<{ records: ProposalJsonlRecordArtifact[] }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      piTextCall: async () => {
        calls += 1;
        throw new AmbientStreamFailureError(
          "stream_idle_timeout",
          "Ambient/Pi stream stalled after 120000ms without stream activity.",
          { toolCallSeen: true },
        );
      },
    });

    await expect(
      provider.synthesizeSectionedWithTelemetry({
        projectName: "Tool Side Effect Game",
        sectioning: { maxSectionChars: 1000, minSectionChars: 20 },
        sources: [
          {
            id: "source-gdd",
            kind: "functional_spec",
            title: "GDD",
            summary: "Game design.",
            path: "GAME_DESIGN_DOCUMENT.md",
            excerpt: "# Game\nThe source describes one card.",
            relevance: 99,
          },
        ],
        onProgressiveRecords: (batch) => batches.push({ records: batch.records }),
      }),
    ).rejects.toThrow("did not produce any candidate cards");

    expect(calls).toBe(1);
    expect(retryDelays).toEqual([]);
    const emittedRecords = batches.flatMap((batch) => batch.records);
    expect(emittedRecords.some((record) => record.type === "progress" && record.stage === "section_retry_started")).toBe(false);
    expect(emittedRecords.some((record) => record.type === "error" && record.code === "section_planning_failed")).toBe(true);
  });

  it("retries no-record section attempts inline before moving on", async () => {
    let calls = 0;
    const prompts: string[] = [];
    const batches: Array<{ records: ProposalJsonlRecordArtifact[] }> = [];
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        calls += 1;
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        prompts.push(body.messages.at(-1)?.content ?? "");
        if (calls === 1) {
          return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records: [] }) } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:inline-retry",
                        title: "Implement inline retry recovery",
                        description: "Use the section retry result instead of deferring recovery.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["retry"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-gdd", range: "full" }],
                        acceptanceCriteria: ["The active planning run recovers the section."],
                        testPlan: { unit: ["Assert retry records."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-gdd",
                        range: "full",
                        status: "covered",
                        cardIds: ["synthesis:inline-retry"],
                        updatedAt: "2026-05-04T00:00:00.000Z",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Inline Retry Game",
      sectioning: { maxSectionChars: 1000, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: "# Game\nThe source describes one retry-recovered card.",
          relevance: 99,
        },
      ],
      onProgress: (event) => progress.push(event),
      onProgressiveRecords: (batch) => batches.push({ records: batch.records }),
    });

    const stages = result.progressiveRecords?.filter((record) => record.type === "progress").map((record) => record.stage) ?? [];
    expect(calls).toBe(2);
    expect(prompts[1]).toContain("Section retry context:");
    expect(prompts[1]).toContain("Retry attempt: 1 of 2");
    expect(prompts[1]).toContain("Prior failure kind: no_records");
    expect(progress.find((event) => event.title === "Asked Ambient/Pi for section 1/1")?.metadata).toMatchObject({
      latestPromptCharCount: prompts[0].length,
      cumulativePromptCharCount: prompts[0].length,
      latestEstimatedInputTokens: Math.ceil(prompts[0].length / 4),
      cumulativeEstimatedInputTokens: Math.ceil(prompts[0].length / 4),
      plannerLedgerCompactionStatus: "skipped",
      plannerLedgerCompactionSkipReason: "section_prompt_below_threshold",
    });
    expect(progress.find((event) => event.title === "Asked Ambient/Pi to retry section 1/1")?.metadata).toMatchObject({
      latestPromptCharCount: prompts[1].length,
      cumulativePromptCharCount: prompts[0].length + prompts[1].length,
      latestEstimatedInputTokens: Math.ceil(prompts[1].length / 4),
      cumulativeEstimatedInputTokens: Math.ceil((prompts[0].length + prompts[1].length) / 4),
      plannerLedgerCompactionStatus: "skipped",
      plannerLedgerCompactionSkipReason: "section_prompt_below_threshold",
    });
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:inline-retry"]);
    expect(stages).toEqual(expect.arrayContaining(["section_retry_started", "section_retry_succeeded", "section_succeeded"]));
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_no_records")).toBe(false);
    expect(batches.map((batch) => batch.records.map((record) => (record.type === "progress" ? record.stage : record.type)))).toEqual([
      ["section_retry_started"],
      ["candidate_card", "source_coverage", "section_retry_succeeded", "section_succeeded"],
    ]);
  });

  it("stops sectioned synthesis after exhausting inline retries for a zero-output transient provider failure before any cards", async () => {
    const previousAttempts = process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS;
    process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS = "1";
    let calls = 0;
    const batches: Array<{ records: ProposalJsonlRecordArtifact[] }> = [];
    try {
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: "zai-org/GLM-5.1-FP8",
        apiKey: "ambient-test-key",
        piTextCall: async () => {
          calls += 1;
          throw new Error("429 Upstream request failed after 96ms (0 output chars, 0 thinking chars, idle 0ms).");
        },
      });

      await expect(
        provider.synthesizeSectionedWithTelemetry({
          projectName: "Transient Stop Game",
          sectioning: { maxSectionChars: 60, minSectionChars: 20 },
          sources: [
            {
              id: "source-gdd",
              kind: "functional_spec",
              title: "GDD",
              summary: "Game design.",
              path: "GAME_DESIGN_DOCUMENT.md",
              excerpt: "# Game\n## One\nFirst section.\n## Two\nSecond section.",
              relevance: 99,
            },
          ],
          onProgressiveRecords: (batch) => batches.push({ records: batch.records }),
        }),
      ).rejects.toThrow("transient zero-output provider error");

      const emittedRecords = batches.flatMap((batch) => batch.records);
      expect(calls).toBe(3);
      expect(emittedRecords.filter((record) => record.type === "progress" && record.stage === "section_retry_started")).toHaveLength(2);
      expect(emittedRecords.filter((record) => record.type === "progress" && record.stage === "section_retry_exhausted")).toHaveLength(1);
      expect(emittedRecords.filter((record) => record.type === "error" && record.code === "section_planning_failed")).toHaveLength(1);
    } finally {
      if (previousAttempts === undefined) delete process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS;
      else process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS = previousAttempts;
    }
  });

  it("keeps successful section records usable when a later section fails", async () => {
    const batches: Array<{ section: string; records: string[] }> = [];
    const progress: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        if (prompt.includes("Section heading: Combat")) throw new Error("simulated section failure");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:movement-model",
                        title: "Implement movement model",
                        description: "Add movement from the movement section.",
                        candidateStatus: "needs_clarification",
                        priority: 1,
                        phase: "Movement",
                        labels: ["movement"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-gdd", range: "lines:4-5" }],
                        acceptanceCriteria: ["Ship moves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-gdd",
                        range: "lines:4-5",
                        status: "covered",
                        cardIds: ["synthesis:movement-model"],
                        updatedAt: "2026-05-04T00:00:00.000Z",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Recoverable Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: [
            "# Movement",
            "The ship uses hybrid Newtonian movement.",
            "",
            "## Combat",
            "Enemy ships fire salvos and shields absorb damage.",
          ].join("\n"),
          relevance: 99,
        },
      ],
      onProgress: (event) => progress.push(`${event.title}:${event.summary}`),
      onProgressiveRecords: (batch) => batches.push({ section: batch.section.heading, records: batch.records.map((record) => record.type) }),
    });

    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:movement-model"]);
    expect(result.telemetry).toMatchObject({
      cardCount: 1,
      sectionCount: 2,
      failedSectionCount: 1,
      partial: true,
    });
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_planning_failed")).toBe(true);
    expect(batches).toEqual([
      { section: "Movement", records: ["candidate_card", "source_coverage", "progress"] },
      { section: "Combat", records: ["progress"] },
      { section: "Combat", records: ["progress"] },
      { section: "Combat", records: ["progress", "progress", "error", "source_coverage"] },
    ]);
    expect(progress.some((event) => event.includes("Retry exhausted for failed section 2/2"))).toBe(true);
  });

  it("records a retryable section when keepalives continue without semantic content", async () => {
    const batches: Array<{ section: string; records: string[] }> = [];
    const progress: string[] = [];
    let movementStreamCanceled = false;
    let movementKeepalive: ReturnType<typeof setInterval> | undefined;
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 25,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        if (prompt.includes("Section heading: Movement")) {
          return new Response(
            new ReadableStream({
              start(controller) {
                const encoder = new TextEncoder();
                movementKeepalive = setInterval(() => {
                  try {
                    controller.enqueue(encoder.encode(": keepalive\n\n"));
                  } catch {
                    if (movementKeepalive) clearInterval(movementKeepalive);
                  }
                }, 5);
              },
              cancel() {
                movementStreamCanceled = true;
                if (movementKeepalive) clearInterval(movementKeepalive);
              },
            }),
            { status: 200, headers: { "Content-Type": "text/event-stream" } },
          );
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:combat-loop",
                        title: "Implement combat loop",
                        description: "Add combat from the combat section.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Combat",
                        labels: ["combat"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-gdd", range: "lines:4-5" }],
                        acceptanceCriteria: ["Combat resolves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-gdd",
                        range: "lines:4-5",
                        status: "covered",
                        cardIds: ["synthesis:combat-loop"],
                        updatedAt: "2026-05-08T00:00:00.000Z",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Content Idle Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: [
            "# Movement",
            "The ship uses hybrid Newtonian movement.",
            "",
            "## Combat",
            "Enemy ships fire salvos and shields absorb damage.",
          ].join("\n"),
          relevance: 99,
        },
      ],
      onProgress: (event) => progress.push(`${event.title}:${event.summary}`),
      onProgressiveRecords: (batch) => batches.push({ section: batch.section.heading, records: batch.records.map((record) => record.type) }),
    });

    expect(movementStreamCanceled).toBe(true);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:combat-loop"]);
    expect(result.telemetry).toMatchObject({ failedSectionCount: 1, semanticIdleSectionCount: 1, partial: true });
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_semantic_idle_timeout")).toBe(true);
    expect(
      result.progressiveRecords?.some(
        (record) => record.type === "progress" && record.stage === "section_failed" && record.metadata.failureKind === "semantic_idle_timeout",
      ),
    ).toBe(true);
    expect(batches).toEqual([
      { section: "Movement", records: ["progress"] },
      { section: "Movement", records: ["progress"] },
      { section: "Movement", records: ["progress", "progress", "error", "source_coverage"] },
      { section: "Combat", records: ["candidate_card", "source_coverage", "progress"] },
    ]);
    expect(progress.some((event) => event.includes("Retry exhausted for stalled section 1/2"))).toBe(true);
    expect(progress.some((event) => event.includes("without model content"))).toBe(true);
  });

  it("resumes sectioned planning by skipping previously completed sections", async () => {
    const source = {
      id: "source-gdd",
      kind: "functional_spec" as const,
      title: "GDD",
      summary: "Game design.",
      path: "GAME_DESIGN_DOCUMENT.md",
      excerpt: [
        "# Movement",
        "The ship uses hybrid Newtonian movement.",
        "",
        "## Combat",
        "Enemy ships fire salvos and shields absorb damage.",
      ].join("\n"),
      relevance: 99,
    };
    const sections = projectBoardPlanningSectionsFromSources([source], { maxSectionChars: 130, minSectionChars: 20 });
    const movement = sections.find((section) => section.heading === "Movement");
    expect(movement).toBeDefined();
    const calls: string[] = [];
    const batches: Array<{ section: string; records: string[] }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        expect(prompt).toContain("Section heading: Combat");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:combat-loop",
                        title: "Implement combat loop",
                        description: "Add combat from the combat section.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Combat",
                        labels: ["combat"],
                        blockedBy: ["synthesis:movement-model"],
                        sourceRefs: [{ sourceId: "source-gdd", range: "lines:4-5" }],
                        acceptanceCriteria: ["Combat resolves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-gdd",
                        range: "lines:4-5",
                        status: "covered",
                        cardIds: ["synthesis:combat-loop"],
                        updatedAt: "2026-05-04T00:00:00.000Z",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Resumable Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [source],
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:movement-model",
          title: "Implement movement model",
          description: "Add movement from the movement section.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Movement",
          labels: ["movement"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-2" }],
          acceptanceCriteria: ["Ship moves."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_succeeded",
          title: "Completed section 1/2",
          summary: "Movement was completed in a previous run.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: movement!.id, sectionStatus: "succeeded" },
        }),
      ],
      onProgressiveRecords: (batch) => batches.push({ section: batch.section.heading, records: batch.records.map((record) => record.type) }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("Section heading: Movement");
    expect(batches).toEqual([
      { section: "Movement", records: ["progress"] },
      { section: "Combat", records: ["candidate_card", "source_coverage", "progress"] },
    ]);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:movement-model", "synthesis:combat-loop"]);
    expect(result.telemetry).toMatchObject({
      skippedSectionCount: 1,
      failedSectionCount: 0,
      partial: false,
    });
  });

  it("retries failed sections without carrying stale failure artifacts into the resumed proposal", async () => {
    const source = {
      id: "source-gdd",
      kind: "functional_spec" as const,
      title: "GDD",
      summary: "Game design.",
      path: "GAME_DESIGN_DOCUMENT.md",
      excerpt: [
        "# Movement",
        "The ship uses hybrid Newtonian movement.",
        "",
        "## Combat",
        "Enemy ships fire salvos and shields absorb damage.",
      ].join("\n"),
      relevance: 99,
    };
    const sections = projectBoardPlanningSectionsFromSources([source], { maxSectionChars: 130, minSectionChars: 20 });
    const movement = sections.find((section) => section.heading === "Movement");
    const combat = sections.find((section) => section.heading === "Combat");
    expect(movement).toBeDefined();
    expect(combat).toBeDefined();
    const calls: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        expect(prompt).toContain("Section heading: Combat");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:combat-loop",
                        title: "Implement combat loop",
                        description: "Add combat from the retried combat section.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Combat",
                        labels: ["combat"],
                        blockedBy: ["synthesis:movement-model"],
                        sourceRefs: [{ sourceId: "source-gdd", range: combat!.range }],
                        acceptanceCriteria: ["Combat resolves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-gdd",
                        range: combat!.range,
                        status: "covered",
                        cardIds: ["synthesis:combat-loop"],
                        updatedAt: "2026-05-04T00:00:00.000Z",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Retry Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [source],
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:movement-model",
          title: "Implement movement model",
          description: "Add movement from the movement section.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Movement",
          labels: ["movement"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-gdd", range: movement!.range }],
          acceptanceCriteria: ["Ship moves."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_succeeded",
          title: "Completed section 1/2",
          summary: "Movement was completed in a previous run.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: movement!.id, sectionStatus: "succeeded", sourceId: "source-gdd", sectionRange: movement!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_failed",
          title: "Failed section 2/2",
          summary: "Combat failed in the previous run.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: combat!.id, sectionStatus: "failed", sourceId: "source-gdd", sectionRange: combat!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "error",
          code: "section_planning_failed",
          message: "Combat failed in the previous run.",
          recoverable: true,
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: combat!.id, sourceId: "source-gdd", range: combat!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "source_coverage",
          sourceId: "source-gdd",
          range: combat!.range,
          status: "unresolved",
          cardIds: [],
          note: "Combat was unresolved in the previous run.",
          updatedAt: "2026-05-04T00:00:00.000Z",
        }),
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("Section heading: Movement");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:movement-model", "synthesis:combat-loop"]);
    expect(result.telemetry).toMatchObject({ skippedSectionCount: 1, failedSectionCount: 0, partial: false });
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_planning_failed")).toBe(false);
    expect(
      result.progressiveRecords?.some(
        (record) => record.type === "source_coverage" && record.sourceId === "source-gdd" && record.range === combat!.range && record.status === "unresolved",
      ),
    ).toBe(false);
  });

  it("treats prior semantic-idle section artifacts as retryable even without a matching progress record", async () => {
    const source = {
      id: "source-gdd",
      kind: "functional_spec" as const,
      title: "GDD",
      summary: "Game design.",
      path: "GAME_DESIGN_DOCUMENT.md",
      excerpt: [
        "# Movement",
        "The ship uses hybrid Newtonian movement.",
        "",
        "## Combat",
        "Enemy ships fire salvos and shields absorb damage.",
      ].join("\n"),
      relevance: 99,
    };
    const sections = projectBoardPlanningSectionsFromSources([source], { maxSectionChars: 130, minSectionChars: 20 });
    const movement = sections.find((section) => section.heading === "Movement");
    const combat = sections.find((section) => section.heading === "Combat");
    expect(movement).toBeDefined();
    expect(combat).toBeDefined();
    const calls: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        expect(prompt).toContain("Section heading: Movement");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:movement-model",
                        title: "Implement movement model",
                        description: "Add movement from the retried movement section.",
                        candidateStatus: "needs_clarification",
                        priority: 1,
                        phase: "Movement",
                        labels: ["movement"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-gdd", range: movement!.range }],
                        acceptanceCriteria: ["Ship moves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Retry Semantic Idle Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [source],
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
          type: "error",
          code: "section_semantic_idle_timeout",
          message: "Movement stalled after 25ms without model content or planner records.",
          recoverable: true,
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: movement!.id, sourceId: "source-gdd", range: movement!.range, failureKind: "semantic_idle_timeout" },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_succeeded",
          title: "Completed section 2/2",
          summary: "Combat was completed in a previous run.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: combat!.id, sectionStatus: "succeeded", sourceId: "source-gdd", sectionRange: combat!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:combat-loop",
          title: "Implement combat loop",
          description: "Add combat from the completed combat section.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Combat",
          labels: ["combat"],
          blockedBy: ["synthesis:movement-model"],
          sourceRefs: [{ sourceId: "source-gdd", range: combat!.range }],
          acceptanceCriteria: ["Combat resolves."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }),
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("Section heading: Combat");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:combat-loop", "synthesis:movement-model"]);
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_semantic_idle_timeout")).toBe(false);
    expect(result.telemetry).toMatchObject({ skippedSectionCount: 1, failedSectionCount: 0, partial: false });
  });

  it("treats previous no-record section artifacts as retryable even if an older run marked the section succeeded", async () => {
    const source = {
      id: "source-gdd",
      kind: "functional_spec" as const,
      title: "GDD",
      summary: "Game design.",
      path: "GAME_DESIGN_DOCUMENT.md",
      excerpt: [
        "# Movement",
        "The ship uses hybrid Newtonian movement.",
        "",
        "## Combat",
        "Enemy ships fire salvos and shields absorb damage.",
      ].join("\n"),
      relevance: 99,
    };
    const sections = projectBoardPlanningSectionsFromSources([source], { maxSectionChars: 130, minSectionChars: 20 });
    const movement = sections.find((section) => section.heading === "Movement");
    const combat = sections.find((section) => section.heading === "Combat");
    expect(movement).toBeDefined();
    expect(combat).toBeDefined();
    const calls: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        expect(prompt).toContain("Section heading: Movement");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:movement-model",
                        title: "Implement movement model",
                        description: "Add movement from the retried movement section.",
                        candidateStatus: "needs_clarification",
                        priority: 1,
                        phase: "Movement",
                        labels: ["movement"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-gdd", range: movement!.range }],
                        acceptanceCriteria: ["Ship moves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Retry No Records Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [source],
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
          type: "error",
          code: "section_no_records",
          message: "Movement returned no records in the previous run.",
          recoverable: true,
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: movement!.id, sourceId: "source-gdd", range: movement!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_succeeded",
          title: "Completed section 1/2",
          summary: "Older run incorrectly treated no records as a completed section.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: movement!.id, sectionStatus: "succeeded", sourceId: "source-gdd", sectionRange: movement!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "source_coverage",
          sourceId: "source-gdd",
          range: movement!.range,
          status: "unresolved",
          cardIds: [],
          updatedAt: "2026-05-04T00:00:00.000Z",
        }),
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:combat-loop",
          title: "Implement combat loop",
          description: "Add combat from the completed combat section.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Combat",
          labels: ["combat"],
          blockedBy: ["synthesis:movement-model"],
          sourceRefs: [{ sourceId: "source-gdd", range: combat!.range }],
          acceptanceCriteria: ["Combat resolves."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_succeeded",
          title: "Completed section 2/2",
          summary: "Combat was completed in a previous run.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: combat!.id, sectionStatus: "succeeded", sourceId: "source-gdd", sectionRange: combat!.range },
        }),
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("Section heading: Combat");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:combat-loop", "synthesis:movement-model"]);
    expect(result.telemetry).toMatchObject({ skippedSectionCount: 1, failedSectionCount: 0, partial: false });
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_no_records")).toBe(false);
  });

  it("filters exact duplicate cards during additive Add Cards refinement", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Additive board.",
                    goal: "Expand the game.",
                    currentState: "Shell exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:pixijs-game-shell",
                        title: "Create the PixiJS game shell",
                        description: "Duplicate shell card.",
                        candidateStatus: "needs_clarification",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["pixijs"],
                        blockedBy: [],
                        acceptanceCriteria: ["Canvas exists."],
                        testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] },
                        sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
                      },
                      {
                        sourceId: "synthesis:shield-loop",
                        title: "Implement shield loop",
                        description: "New shield gameplay card.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Combat",
                        labels: ["shield"],
                        blockedBy: ["synthesis:pixijs-game-shell"],
                        acceptanceCriteria: ["Shield absorbs damage."],
                        testPlan: { unit: ["Test shield state."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Last Vector",
      sources: [{ kind: "functional_spec", title: "GDD", summary: "Game design.", path: "GAME_DESIGN_DOCUMENT.md", relevance: 99 }],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Build shell.",
          currentState: "Shell card exists.",
          targetUser: "Player.",
          qualityBar: "Proof.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [
            {
              sourceId: "synthesis:pixijs-game-shell",
              title: "Create the PixiJS game shell",
              description: "Existing card.",
              candidateStatus: "needs_clarification",
              priority: 1,
              phase: "Foundation",
              labels: ["pixijs"],
              blockedBy: [],
              acceptanceCriteria: ["Canvas exists."],
              testPlan: { unit: [], integration: [], visual: [], manual: [] },
              sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
            },
          ],
        },
        answers: [{ question: "Add Cards source scope", answer: "This is an additive Add Cards operation. Do not replace or duplicate existing cards." }],
      },
    });

    expect(result.draft.cards.map((card) => card.title)).toEqual(["Implement shield loop"]);
    expect(result.telemetry.cardCount).toBe(1);
    expect(result.progressiveRecords?.filter((record) => record.type === "candidate_card").map((record) => record.title)).toEqual([
      "Implement shield loop",
    ]);
    expect(result.draft.sourceNotes.at(-1)).toContain("Filtered 1 duplicate candidate");
    expect(
      result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered"),
    ).toBe(true);
  });

  it("treats duplicate-only additive Add Cards output as a no-op instead of a failed synthesis", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Additive board.",
                    goal: "Expand the existing board.",
                    currentState: "Implementation card already exists.",
                    targetUser: "Project contributor.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:local-random-picker",
                        title: "Implement Local Random Option Picker",
                        description: "Duplicate of the existing implementation card.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Implementation",
                        labels: ["implementation", "scope:required"],
                        blockedBy: [],
                        acceptanceCriteria: ["Picker displays one random option."],
                        testPlan: { unit: [], integration: ["Open the picker locally."], visual: [], manual: [] },
                        sourceRefs: ["Local-Random-Option-Picker-DurablePlan.html"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Local Random Option Picker",
      sources: [
        {
          kind: "plan_artifact",
          title: "Local Random Option Picker Durable Plan",
          summary: "Simple local picker.",
          path: ".ambient/board/plans/Local-Random-Option-Picker-DurablePlan.html",
          relevance: 99,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Build the picker.",
          currentState: "Implementation card already exists.",
          targetUser: "Local utility user.",
          qualityBar: "Proof required.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [
            {
              sourceId: "synthesis:local-random-picker",
              title: "Implement Local Random Option Picker",
              description: "Existing implementation card.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Implementation",
              labels: ["implementation", "scope:required"],
              blockedBy: [],
              acceptanceCriteria: ["Picker displays one random option."],
              testPlan: { unit: [], integration: ["Open the picker locally."], visual: [], manual: [] },
              sourceRefs: ["Local-Random-Option-Picker-DurablePlan.html"],
            },
          ],
        },
        answers: [{ question: "Add Cards source scope", answer: "Add Cards from the selected source. Do not replace or duplicate existing cards." }],
        mode: "additive" as const,
      },
    });

    expect(result.draft.cards).toEqual([]);
    expect(result.telemetry.cardCount).toBe(0);
    expect(result.draft.sourceNotes.at(-1)).toContain("No net-new cards remain");
    expect(
      result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered"),
    ).toBe(true);
  });

  it("filters near-duplicate additive cards by source basis and intent", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Additive board.",
                    goal: "Expand the game.",
                    currentState: "A cartography card exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:cartography-contract-board",
                        title: "Implement the cartography contracts mission board",
                        description: "Near duplicate of the existing spectral cartography board.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "contracts", "mission-board"],
                        blockedBy: [],
                        acceptanceCriteria: ["Survey contracts are listed."],
                        testPlan: { unit: ["Test contract model."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
                      },
                      {
                        sourceId: "synthesis:route-risk-overlay",
                        title: "Add route-risk HUD overlay",
                        description: "New route-risk visualization for active survey contracts.",
                        candidateStatus: "needs_clarification",
                        priority: 3,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "hud", "route-risk"],
                        blockedBy: ["synthesis:spectral-cartography-board"],
                        acceptanceCriteria: ["Risk bands are visible in the HUD."],
                        testPlan: { unit: [], integration: ["Run HUD state test."], visual: ["Capture overlay."], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Last Vector",
      sources: [
        {
          kind: "functional_spec",
          title: "Spectral Cartography Contracts",
          summary: "Survey contract board, scan ping, and route-risk overlay.",
          path: "docs/spectral-cartography-contracts.md",
          relevance: 99,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Expand the game.",
          currentState: "A cartography card exists.",
          targetUser: "Player.",
          qualityBar: "Proof required.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [
            {
              sourceId: "synthesis:spectral-cartography-board",
              title: "Build spectral cartography contract board",
              description: "Create the mission board data model for comet-lane survey contracts.",
              candidateStatus: "needs_clarification",
              priority: 2,
              phase: "Spectral Cartography",
              labels: ["cartography", "contracts", "mission-board"],
              blockedBy: [],
              acceptanceCriteria: ["Survey contracts are listed."],
              testPlan: { unit: ["Test contract model."], integration: [], visual: [], manual: [] },
              sourceRefs: ["docs/spectral-cartography-contracts.md"],
            },
          ],
        },
        answers: [{ question: "Add Cards source scope", answer: "Add Cards from the selected source. Do not replace or duplicate existing cards." }],
        mode: "additive" as const,
      },
    });

    expect(result.draft.cards.map((card) => card.title)).toEqual(["Add route-risk HUD overlay"]);
    expect(result.progressiveRecords?.filter((record) => record.type === "candidate_card").map((record) => record.title)).toEqual([
      "Add route-risk HUD overlay",
    ]);
    expect(result.draft.sourceNotes.at(-1)).toContain("Filtered 1 duplicate candidate");
    const warning = result.progressiveRecords?.find(
      (record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered",
    );
    expect(warning).toMatchObject({
      type: "warning",
      metadata: {
        duplicateCount: 1,
        duplicateCandidates: [
          expect.objectContaining({
            title: "Implement the cartography contracts mission board",
            matchedTitle: "Build spectral cartography contract board",
            reason: "intent_source_basis",
          }),
        ],
      },
    });
  });

  it("keeps same-source additive cards when their intent is distinct", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Additive board.",
                    goal: "Expand the game.",
                    currentState: "No cartography cards exist.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:cartography-contract-board",
                        title: "Build cartography contract board",
                        description: "Mission board data model for comet-lane contracts.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "contracts"],
                        blockedBy: [],
                        acceptanceCriteria: ["Contracts are listed."],
                        testPlan: { unit: ["Test contracts."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
                      },
                      {
                        sourceId: "synthesis:scan-ping-state",
                        title: "Implement scan-ping state transition",
                        description: "Reveal spectral beacon echoes and hidden salvage pockets when the player fires a scan ping.",
                        candidateStatus: "needs_clarification",
                        priority: 3,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "scan-ping", "beacons"],
                        blockedBy: ["synthesis:cartography-contract-board"],
                        acceptanceCriteria: ["Scan ping reveals beacons."],
                        testPlan: { unit: ["Test ping reducer."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Last Vector",
      sources: [
        {
          kind: "functional_spec",
          title: "Spectral Cartography Contracts",
          summary: "Survey contract board, scan ping, and route-risk overlay.",
          path: "docs/spectral-cartography-contracts.md",
          relevance: 99,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Expand the game.",
          currentState: "No cartography cards exist.",
          targetUser: "Player.",
          qualityBar: "Proof required.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [],
        },
        answers: [{ question: "Add Cards source scope", answer: "Add Cards from the selected source without replacing existing board content." }],
        mode: "additive" as const,
      },
    });

    expect(result.draft.cards.map((card) => card.title)).toEqual([
      "Build cartography contract board",
      "Implement scan-ping state transition",
    ]);
    expect(result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered")).toBe(false);
  });

  it("recovers a draft from progressive JSONL when final proposal JSON is unavailable", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    "```jsonl",
                    JSON.stringify({
                      type: "candidate_card",
                      sourceId: "synthesis:recovered-shell",
                      title: "Recover shell card",
                      description: "Recovered from progressive JSONL.",
                      candidateStatus: "ready_to_create",
                      priority: 1,
                      phase: "Foundation",
                      labels: ["recovered"],
                      blockedBy: [],
                      sourceRefs: [{ path: "GAME_DESIGN_DOCUMENT.md" }],
                      acceptanceCriteria: ["Recovered card has acceptance criteria."],
                      testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] },
                    }),
                    JSON.stringify({
                      type: "question",
                      questionId: "question-recovered",
                      question: "Which control model should the recovered card assume?",
                      required: true,
                      createdAt: "2026-05-04T00:00:00.000Z",
                    }),
                    "```",
                  ].join("\n"),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Recovery Test",
      sources: [{ kind: "functional_spec", title: "GDD", summary: "Game design.", path: "GAME_DESIGN_DOCUMENT.md", relevance: 99 }],
    });

    expect(result.draft.summary).toContain("Recovered");
    expect(result.draft.cards).toEqual([
      expect.objectContaining({
        sourceId: "synthesis:recovered-shell",
        title: "Recover shell card",
        candidateStatus: "ready_to_create",
      }),
    ]);
    expect(result.draft.questions).toEqual(["Which control model should the recovered card assume?"]);
    expect(result.telemetry.cardCount).toBe(1);
    expect(result.telemetry.questionCount).toBe(1);
  });

  it("parses fenced JSON responses", () => {
    expect(parseProjectBoardSynthesisJson('```json\n{"ok": true}\n```')).toEqual({ ok: true });
  });

  it("includes a bounded redacted preview when synthesis returns non-JSON text", () => {
    const secret = "gmi_1234567890abcdef1234567890abcdef";
    const text = `I cannot produce JSON right now. apiKey=${secret} ${"retry later ".repeat(80)}`;

    expect(() => parseProjectBoardSynthesisJson(text)).toThrow(
      /Ambient project-board synthesis did not return valid JSON\. Parser error: .*Response preview: "I cannot produce JSON right now\./,
    );
    try {
      parseProjectBoardSynthesisJson(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("[redacted-secret]");
      expect(message).not.toContain(secret);
      expect(message.length).toBeLessThan(650);
      expect(message).toContain("...");
    }
  });

  it("includes the same bounded preview when extracted JSON is malformed", () => {
    const text = `Here is the board:\n{"cards":[{"sourceId":"synthesis:ux-mock-approval" "title":"Create UX mock"}]}`;

    expect(() => parseProjectBoardSynthesisJson(text)).toThrow(
      /Ambient project-board synthesis did not return valid JSON\. Parser error: .*Response preview: "Here is the board:/,
    );
  });

  it("defaults unlabeled cards to scope:supporting instead of failing the assembled run", () => {
    const card = (sourceId: string, title: string, labels: string[]) => ({
      sourceId,
      title,
      description: "Card description.",
      candidateStatus: "ready_to_create" as const,
      priority: 1,
      phase: "Build",
      labels,
      blockedBy: [],
      acceptanceCriteria: ["Done."],
      testPlan: { unit: ["Proof."], integration: [], visual: [], manual: [] },
      sourceRefs: ["PLAN.md"],
    });
    const draft = {
      summary: "Board.",
      goal: "Build it.",
      currentState: "Sources exist.",
      targetUser: "Users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        card("synthesis:labeled", "Labeled card", ["scope:required"]),
        card("synthesis:unlabeled", "Unlabeled card", ["implementation"]),
        card("synthesis:optional", "Optional extra", ["scope:optional"]),
      ],
    };
    const scopeContract = {
      included: [],
      excluded: [],
      requiredCapabilities: ["core flow"],
      planningDepthHints: [],
      openQuestions: [],
      evidence: [],
    };

    const result = filterScopeContractCards(draft, { sources: [], scopeContract });

    // The unlabeled card survives with a defaulted label; only the explicit
    // scope:optional card is filtered.
    expect(result.draft.cards.map((item) => item.title)).toEqual(["Labeled card", "Unlabeled card"]);
    expect(result.draft.cards[1].labels).toContain("scope:supporting");
    expect(result.diagnostics.map((item) => item.title)).toEqual(["Optional extra"]);
    expect(result.warningRecords.map((record) => (record.type === "warning" ? record.code : record.type))).toEqual([
      "scope_contract_candidate_filtered",
      "scope_contract_unlabeled_candidate_defaulted",
    ]);

    // The hard failure is reserved for runs where every card is explicitly out of scope.
    expect(() =>
      filterScopeContractCards(
        { ...draft, cards: [card("synthesis:optional", "Optional extra", ["scope:optional"])] },
        { sources: [], scopeContract },
      ),
    ).toThrow(/only cards outside explicit scope constraints/);
  });

  it("clears remaining coverage when a later record marks an unresolved source covered", () => {
    const sources = [
      { id: "source-a", kind: "functional_spec" as const, title: "A", summary: "A.", path: "A.md", relevance: 90 },
      { id: "source-b", kind: "functional_spec" as const, title: "B", summary: "B.", path: "B.md", relevance: 80 },
    ];
    const coverage = (sourceId: string, status: "covered" | "unresolved" | "partial") =>
      validateProposalJsonlRecordArtifact({
        type: "source_coverage",
        sourceId,
        range: "full",
        status,
        cardIds: [],
        updatedAt: "2026-05-04T12:00:00.000Z",
      });

    // Unresolved in batch 1, covered in batch 3: the source is complete.
    expect(
      remainingPlannerCoverageSourceIds(sources, [
        coverage("source-a", "unresolved"),
        coverage("source-b", "partial"),
        coverage("source-a", "covered"),
        coverage("source-b", "covered"),
      ]),
    ).toEqual([]);

    // The reverse order still counts as unresolved (last record wins both ways).
    expect(
      remainingPlannerCoverageSourceIds(sources, [
        coverage("source-a", "covered"),
        coverage("source-a", "unresolved"),
      ]),
    ).toEqual(["source-a", "source-b"]);
  });
});
