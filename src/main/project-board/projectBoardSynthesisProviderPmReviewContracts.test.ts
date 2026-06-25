import { describe, expect, it } from "vitest";

import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { projectBoardPlanningSectionsFromSources } from "./projectBoardSectionedPlanning";
import {
  AmbientProjectBoardSynthesisProvider,
  buildProjectBoardSectionedPlanningPrompt,
  type AmbientProjectBoardSynthesisProgress,
} from "./projectBoardSynthesisProvider";

describe("AmbientProjectBoardSynthesisProvider PM Review and planner contracts", () => {
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
        expectResult: (
          result: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["reviewCharterWithTelemetry"]>>,
          progress: AmbientProjectBoardSynthesisProgress[],
        ) => {
          expect(result.draft.cards).toEqual([]);
          expect(result.draft.questions).toEqual([]);
          expect(result.draft.sourceNotes).toContain("Source confidence: medium");
          expect(result.draft.sourceNotes).toContain(
            "Recommendation: Generate only the calculator shell, arithmetic reducer, and visual proof cards.",
          );
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
        expectResult: (
          result: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["reviewCharterWithTelemetry"]>>,
          progress: AmbientProjectBoardSynthesisProgress[],
        ) => {
          expect(result.draft.cards).toEqual([]);
          expect(result.draft.questions).toEqual(["Should the first board stay local-only, or include cloud sync/account work?"]);
          expect(result.draft.sourceNotes).toContain(
            "Conflict: docs/PRD.md excludes cloud sync, while scratch/collaboration.md proposes cloud sync and login.",
          );
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
        expectResult: (
          result: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["reviewCharterWithTelemetry"]>>,
          progress: AmbientProjectBoardSynthesisProgress[],
        ) => {
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
        expectResult: (
          result: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["reviewCharterWithTelemetry"]>>,
          progress: AmbientProjectBoardSynthesisProgress[],
        ) => {
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
          expect(input.prompt).toContain(
            "Card generation constraints are instructions for the later explicit board-synthesis pass, not cards.",
          );
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
        content:
          "Build an InputAdapter that maps keyboard state to thrust/dodge intents. Browser visual proof belongs to a downstream playable-scene card.",
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
});
