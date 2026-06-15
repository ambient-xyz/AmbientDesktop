import { describe, expect, it } from "vitest";
import {
  buildProjectBoardPmReviewReportPrompt,
  buildProjectBoardSynthesisPrompt,
  projectBoardDuplicateClarificationQuestionViolations,
  projectBoardSettledClarificationDecisionLedger,
  projectBoardSettledClarificationReopenViolations,
  isAdditiveProjectBoardRefinement,
  normalizeProjectBoardSynthesisDraft,
  synthesizeProjectBoardDraft,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";

describe("project board synthesis", () => {
  it("builds a compact settled clarification ledger from refinement answers", () => {
    const ledger = projectBoardSettledClarificationDecisionLedger({
      previousDraft: {
        summary: "Baseline.",
        goal: "Build a calculator.",
        currentState: "Draft cards exist.",
        targetUser: "Calculator users.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [],
      },
      answers: [
        {
          question: "Card clarification (Keyboard): Should numpad operators map directly to calculator operators?",
          answer: "Yes, map numpad operators directly.",
          source: "card_clarification",
          cardId: "card-keyboard",
          cardTitle: "Keyboard input",
        },
        {
          question: "Should numpad operators map directly to calculator operators?",
          answer: "Duplicate wording should not create a second ledger row.",
          source: "manual",
        },
      ],
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      id: expect.stringContaining("clarification:"),
      question: "Should numpad operators map directly to calculator operators?",
      answer: "Yes, map numpad operators directly.",
      source: "card_clarification",
      cardId: "card-keyboard",
      cardTitle: "Keyboard input",
    });
    expect(ledger[0].canonicalKey).toContain("numpad");
  });

  it("detects duplicate canonical questions emitted in the same planner output", () => {
    const violations = projectBoardDuplicateClarificationQuestionViolations([
      {
        questionId: "question:numpad-operators",
        question: "Should keyboard numpad operators map directly to calculator operator inputs?",
        location: "records[0].question",
        cardId: "synthesis:keyboard",
      },
      {
        question: "Should keyboard numpad operators map directly to calculator operator keys?",
        location: "records[1].clarificationQuestions[0]",
        cardId: "synthesis:keyboard-follow-up",
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      duplicateReason: expect.stringMatching(/canonical_key|near_duplicate/),
      firstQuestion: "Should keyboard numpad operators map directly to calculator operator inputs?",
      duplicateQuestion: "Should keyboard numpad operators map directly to calculator operator keys?",
      firstLocation: "records[0].question",
      duplicateLocation: "records[1].clarificationQuestions[0]",
    });
    expect(violations[0].canonicalKey).toContain("numpad");
  });

  it("detects planner questions that reopen settled clarification decisions", () => {
    const refinement = {
      previousDraft: {
        summary: "Baseline.",
        goal: "Build a calculator.",
        currentState: "Draft cards exist.",
        targetUser: "Calculator users.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [],
      },
      answers: [
        {
          question: "Card clarification (Preview): Should the live preview display a muted Error indicator?",
          answer: "Yes. Show a muted Error indicator when the partial expression cannot be evaluated.",
          source: "card_clarification" as const,
          cardId: "card-preview",
          cardTitle: "Live preview",
        },
      ],
    };

    const violations = projectBoardSettledClarificationReopenViolations(refinement, [
      {
        question: "Should the live preview suppress errors silently or display a muted Error indicator?",
        location: "records[0].question",
        cardId: "card-preview",
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      matchedDecisionId: expect.stringContaining("clarification:"),
      matchedCardId: "card-preview",
      matchedSource: "card_clarification",
      location: "records[0].question",
    });
  });

  it("builds the PM Review prompt with shared report contract sections", () => {
    const sources: ProjectBoardSynthesisSource[] = [
      {
        id: "source-prd",
        kind: "functional_spec",
        title: "PRD",
        summary: "Build a local-first note editor.",
        excerpt: "The first board should cover editor shell, persistence, and proof. Collaboration is out of scope.",
        path: "PRD.md",
        classificationConfidence: 0.94,
        authorityRole: "primary",
        changeState: "unchanged",
        relevance: 100,
      },
    ];
    const deterministicDraft = synthesizeProjectBoardDraft(sources);
    const prompt = buildProjectBoardPmReviewReportPrompt({
      sources,
      projectName: "Editor",
      deterministicDraft,
      gitContext: {
        mode: "git_ready",
        isGitRepository: true,
        hasRemote: true,
        branch: "main",
        upstream: "origin/main",
        ahead: 0,
        behind: 0,
      },
    });

    expect(prompt).toContain("Review the project charter and source evidence for PM readiness.");
    expect(prompt).toContain('"readiness": "ready_for_card_generation"');
    expect(prompt).toContain("Readiness values:");
    expect(prompt).toContain("Source confidence values:");
    expect(prompt).toContain("Git state values:");
    expect(prompt).toContain("- Do not generate candidate cards.");
    expect(prompt).toContain("- Do not include a cards field.");
    expect(prompt).toContain("Source confidence input:");
    expect(prompt).toContain('"mode": "git_ready"');
    expect(prompt).toContain("Return JSON only. Do not use markdown.");
  });

  it("normalizes safe expert clarification suggestions with matching questions", () => {
    const draft = normalizeProjectBoardSynthesisDraft({
      summary: "Calculator board.",
      goal: "Build a calculator.",
      currentState: "Draft exists.",
      targetUser: "Calculator users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "keyboard",
          title: "Implement keyboard input",
          description: "Map keyboard input into calculator operations.",
          candidateStatus: "needs_clarification",
          labels: ["input"],
          blockedBy: [],
          sourceRefs: ["plan.html"],
          clarificationQuestions: ["Should numpad operators map directly to calculator operators?"],
          clarificationSuggestions: [
            {
              question: "Should numpad operators map directly to calculator operators?",
              suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
              rationale: "This is standard calculator behavior and keeps keyboard input ergonomic.",
              confidence: "high",
              safeToAccept: true,
              questionKind: "expert_default",
            },
            {
              question: "Which brand color should the calculator use?",
              suggestedAnswer: "Use blue.",
              rationale: "Unlinked suggestion should be discarded.",
              confidence: "low",
              safeToAccept: true,
              questionKind: "expert_default",
            },
          ],
          acceptanceCriteria: ["Numpad keys work."],
          testPlan: { unit: ["Input mapping tests."], integration: [], visual: [], manual: [] },
        },
      ],
    });

    expect(draft.cards[0].clarificationSuggestions).toEqual([
      expect.objectContaining({
        question: "Should numpad operators map directly to calculator operators?",
        suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
        confidence: "high",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);
  });

  it("normalizes structured clarification decisions as the canonical Pi output", () => {
    const draft = normalizeProjectBoardSynthesisDraft({
      summary: "Calculator board.",
      goal: "Build a calculator.",
      currentState: "Draft exists.",
      targetUser: "Calculator users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "keyboard",
          title: "Implement keyboard input",
          description: "Map keyboard input into calculator operations.",
          candidateStatus: "needs_clarification",
          labels: ["input"],
          blockedBy: [],
          sourceRefs: ["plan.html"],
          clarificationDecisions: [
            {
              id: "clarification:numpad-operators",
              canonicalKey: "numpad operators map calculator operators",
              question: "Should numpad operators map directly to calculator operators?",
              source: "card",
              state: "open",
              suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
              rationale: "This is standard calculator behavior and keeps keyboard input ergonomic.",
              confidence: "high",
              safeToAccept: true,
              questionKind: "expert_default",
            },
          ],
          acceptanceCriteria: ["Numpad keys work."],
          testPlan: { unit: ["Input mapping tests."], integration: [], visual: [], manual: [] },
        },
      ],
    });

    expect(draft.cards[0].clarificationQuestions).toEqual(["Should numpad operators map directly to calculator operators?"]);
    expect(draft.cards[0].clarificationSuggestions).toEqual([
      expect.objectContaining({
        suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);
    expect(draft.cards[0].clarificationDecisions).toEqual([
      expect.objectContaining({
        id: "clarification:numpad-operators",
        state: "open",
        suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
        safeToAccept: true,
      }),
    ]);
  });

  it("rejects implementation-detail card titles while allowing coherent work-package titles", () => {
    const draftForTitle = (title: string) => ({
      summary: "Calculator board.",
      goal: "Build a calculator.",
      currentState: "Draft exists.",
      targetUser: "Calculator users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:calculator-layout",
          title,
          description: "Build the visible calculator layout from the source plan.",
          candidateStatus: "ready_to_create",
          labels: ["ui"],
          blockedBy: [],
          sourceRefs: ["PLAN.md"],
          acceptanceCriteria: ["The calculator layout is visible."],
          testPlan: { unit: ["Layout model test."], integration: [], visual: ["Screenshot check."], manual: [] },
        },
      ],
    });

    expect(() => normalizeProjectBoardSynthesisDraft(draftForTitle("<main> wrapping:"))).toThrow(/implementation-detail card title/);
    expect(() => normalizeProjectBoardSynthesisDraft(draftForTitle("Calculator card: background: rgba(22, 33, 62, 0.7)"))).toThrow(
      /implementation-detail card title/,
    );

    const draft = normalizeProjectBoardSynthesisDraft(draftForTitle("Build calculator layout shell"));
    expect(draft.cards.some((card) => card.title === "Build calculator layout shell")).toBe(true);
  });

  it("injects settled clarification decisions into board-synthesis prompts", () => {
    const sources: ProjectBoardSynthesisSource[] = [
      {
        id: "plan",
        kind: "implementation_plan",
        title: "Calculator plan",
        summary: "Implement keyboard input and live preview.",
        path: "PLAN.md",
        relevance: 90,
      },
    ];
    const deterministicDraft = synthesizeProjectBoardDraft(sources);
    const prompt = buildProjectBoardSynthesisPrompt({
      sources,
      deterministicDraft,
      refinement: {
        previousDraft: deterministicDraft,
        answers: [
          {
            question: "Card clarification (Keyboard): Should numpad operators map directly to calculator operators?",
            answer: "Yes, map numpad * and / directly to x and divide.",
            source: "card_clarification",
            cardId: "card-keyboard",
            cardTitle: "Keyboard input",
          },
        ],
      },
    });

    expect(prompt).toContain("Settled clarification decision ledger");
    expect(prompt).toContain("Do not ask any clarification question that has the same canonicalKey");
    expect(prompt).toContain("card-keyboard");
    expect(prompt).toContain("Should numpad operators map directly to calculator operators?");
    expect(prompt).toContain("ready_to_create instead of needs_clarification");
    expect(prompt).toContain("Card titles must name user-meaningful work packages or deliverables");
  });

  it("decomposes a mixed-quality WebGL spaceship project into linked candidate cards", () => {
    const sources: ProjectBoardSynthesisSource[] = [
      {
        id: "readme",
        kind: "markdown",
        title: "README",
        summary: "Make a browser WebGL spaceship survival game that feels fast and replayable.",
        path: "README.md",
        relevance: 58,
      },
      {
        id: "architecture",
        kind: "architecture_artifact",
        title: "Architecture",
        summary: "Three.js render loop, entity state, input adapter, and game-state reducer. Keep rendering separate from game logic.",
        path: "docs/architecture.md",
        relevance: 92,
      },
      {
        id: "gameplay",
        kind: "functional_spec",
        title: "Gameplay notes",
        summary:
          "Open question: arcade controls might be better, but inertia thrust could feel more spaceship-like. Keyboard first, maybe touch/mobile later. Waves versus endless spawning is undecided.",
        path: "docs/gameplay-notes.md",
        relevance: 86,
      },
      {
        id: "plan",
        kind: "implementation_plan",
        title: "Implementation plan",
        summary: "Phase 1 shell, Phase 2 controls, Phase 3 enemies and collisions, Phase 4 HUD, Phase 5 tests and playable proof.",
        path: "docs/implementation-plan.md",
        relevance: 90,
      },
      {
        id: "todo",
        kind: "markdown",
        title: "TODO",
        summary: "Maybe lasers? TBD boss. Add cool particles eventually.",
        path: "TODO.md",
        relevance: 40,
      },
      {
        id: "tests",
        kind: "test_artifact",
        title: "Vitest config",
        summary: "Vitest unit test configuration for game-state helpers.",
        path: "vitest.config.ts",
        relevance: 80,
      },
    ];

    const draft = synthesizeProjectBoardDraft(sources);

    expect(draft.goal).toMatch(/webgl spaceship game/i);
    expect(draft.questions).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/arcade controls or inertia/i),
        expect.stringMatching(/keyboard-only/i),
        expect.stringMatching(/waves or endless/i),
      ]),
    );
    expect(draft.cards.map((card) => card.title)).toEqual([
      "Create UX mock for approval",
      "Create the WebGL game shell",
      "Implement ship controls and motion",
      "Add enemy encounters and collisions",
      "Build the game loop HUD and session states",
      "Add playable-slice proof and regression checks",
    ]);
    expect(draft.cards.map((card) => card.candidateStatus)).toEqual([
      "ready_to_create",
      "needs_clarification",
      "needs_clarification",
      "needs_clarification",
      "needs_clarification",
      "needs_clarification",
    ]);
    expect(draft.cards[0]).toMatchObject({
      sourceId: "synthesis:ux-mock-approval",
      labels: expect.arrayContaining(["ux-mock-approval"]),
      uiMockRole: "mock_gate",
      requiresUiMockApproval: false,
    });
    expect(draft.cards[0].acceptanceCriteria.join("\n")).toMatch(/self-contained HTML mock\/spec artifact/i);
    expect(draft.cards[0].acceptanceCriteria.join("\n")).toMatch(/desktop and narrow viewport/i);
    expect(draft.cards[0].acceptanceCriteria.join("\n")).toMatch(/User approval, rejection, or revision feedback/i);
    expect(draft.cards[0].testPlan.integration.join("\n")).toMatch(/Open the generated HTML mock locally/i);
    expect(draft.cards[1]).toMatchObject({
      blockedBy: ["synthesis:ux-mock-approval"],
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
    });
    expect(draft.cards[2].blockedBy).toEqual(["synthesis:ux-mock-approval", "synthesis:webgl-game-shell"]);
    expect(draft.cards[2].testPlan.visual).toEqual([]);
    expect(draft.cards[2].testPlan.integration.join("\n")).toMatch(/without depending on screenshot proof/i);
    expect(draft.cards[3].blockedBy).toEqual(["synthesis:ux-mock-approval", "synthesis:ship-controls"]);
    expect(draft.cards[5].testPlan.unit).toEqual(expect.arrayContaining([expect.stringMatching(/unit test/i)]));
    expect(draft.cards[1].description).toContain("Source basis:");
    expect(draft.cards[1].sourceRefs).toEqual(expect.arrayContaining(["architecture", "plan", "gameplay"]));
  });

  it("defers non-game sources to semantic Pi planning instead of generic baseline cards", () => {
    // The old generic project-management fallback was unreachable dead code: the
    // router sends non-game sources to the non-creative fallback, which prepares
    // evidence for Ambient/Pi instead of fabricating baseline cards.
    const draft = synthesizeProjectBoardDraft([
      {
        id: "plan",
        kind: "implementation_plan",
        title: "Project board plan",
        summary: "Build a board, import work, and define proof gates.",
        path: "plan.md",
        relevance: 90,
      },
    ]);

    expect(draft.cards).toEqual([]);
    expect(draft.summary).toContain("Ambient/Pi");
    expect(draft.goal).toContain("plan.md");
  });

  it("uses long design-document excerpts to avoid trivial generic cards", () => {
    const sources: ProjectBoardSynthesisSource[] = [
      {
        id: "gdd",
        kind: "architecture_artifact",
        title: "THE LAST VECTOR - Game Design Document",
        summary: "THE LAST VECTOR is a 2D vector-pixel space fantasy action RPG.",
        excerpt:
          "Tech Stack: TypeScript, PixiJS rendering, Matter.js physics, Howler.js audio. Core mechanics include hybrid Newtonian movement with compensation jets, active shields, dodge, charge attacks, weapon/environment interactions, enemy factions, mothership bosses, mission progression, procedural composition, and proof requirements for browser gameplay.",
        path: "GAME_DESIGN_DOCUMENT.md",
        relevance: 92,
      },
    ];

    const draft = synthesizeProjectBoardDraft(sources);
    const prompt = buildProjectBoardSynthesisPrompt({ sources, deterministicDraft: draft });

    expect(draft.cards[0]).toMatchObject({
      sourceId: "synthesis:ux-mock-approval",
      title: "Create UX mock for approval",
      uiMockRole: "mock_gate",
    });
    expect(draft.cards[1]).toMatchObject({
      sourceId: "synthesis:pixijs-game-shell",
      title: "Create the PixiJS game shell",
    });
    expect(draft.cards.map((card) => card.title)).not.toContain("Clarify the project charter and source authority");
    expect(draft.goal).toMatch(/PixiJS\/HTML5 canvas/i);
    expect(draft.cards[2].blockedBy).toEqual(["synthesis:ux-mock-approval", "synthesis:pixijs-game-shell"]);
    expect(prompt).toContain("Matter.js physics");
    expect(prompt).toContain("Do not collapse them into generic charter/proof cards");
    expect(prompt).toContain("initial batch to emit the next 2-3 highest-leverage executable cards");
    expect(prompt).toContain("Do not merge separately described foundation");
    expect(prompt).toContain("Preserve the major system coverage of the deterministic baseline across the board plan");
    expect(prompt).toContain("Ambient/Pi project-board planning contract");
    expect(prompt).toContain("Name: gameplay-design");
    expect(prompt).toContain("Operation overlay: Whole Board Synthesis");
    expect(prompt).toContain("Lambda RLM extraction");
    expect(prompt).toContain("Propose scope:required and scope:supporting cards only");
    expect(prompt).toContain("professionally defensible default answer when safe");
    expect(prompt).toContain("Every needs_clarification card must include at least one open clarificationDecisions entry");
    expect(prompt).toContain("Pure module cards such as input adapters");
    expect(prompt).toContain("If a source mentions screenshot or visual proof but the current card does not own rendered pixels");
    expect(prompt).toContain("synthesis:ux-mock-approval");
  });

  it("adds a UX mock approval gate to UI-affecting Pi drafts during normalization", () => {
    const draft = normalizeProjectBoardSynthesisDraft({
      summary: "Dashboard board.",
      goal: "Build a responsive dashboard UI.",
      currentState: "Spec exists.",
      targetUser: "Operations users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Dashboard source."],
      cards: [
        {
          sourceId: "synthesis:dashboard-shell",
          title: "Implement dashboard shell",
          description: "Create the dashboard layout and responsive filter panel.",
          candidateStatus: "ready_to_create",
          labels: ["frontend"],
          blockedBy: [],
          sourceRefs: ["docs/dashboard.md"],
          acceptanceCriteria: ["Dashboard layout renders."],
          testPlan: {
            unit: [],
            integration: ["Run a browser smoke check."],
            visual: ["Capture desktop and mobile screenshots."],
            manual: [],
          },
        },
      ],
    });

    expect(draft.cards[0]).toMatchObject({
      sourceId: "synthesis:ux-mock-approval",
      title: "Create UX mock for approval",
      candidateStatus: "ready_to_create",
      uiMockRole: "mock_gate",
      requiresUiMockApproval: false,
    });
    expect(draft.cards[1]).toMatchObject({
      sourceId: "synthesis:dashboard-shell",
      blockedBy: ["synthesis:ux-mock-approval"],
      labels: expect.arrayContaining(["ux-mock-gated"]),
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
    });
  });

  it("keeps Pi-provided UX mock gates ticketizable even when Pi attaches clarification fields", () => {
    const draft = normalizeProjectBoardSynthesisDraft({
      summary: "Dashboard board.",
      goal: "Build a responsive dashboard UI.",
      currentState: "Spec exists.",
      targetUser: "Operations users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:ux-mock-approval",
          title: "Create UX mock for approval",
          description: "Produce a reviewable self-contained HTML mock before UI implementation.",
          candidateStatus: "needs_clarification",
          labels: ["ux-mock-approval"],
          blockedBy: [],
          sourceRefs: ["docs/dashboard.md"],
          acceptanceCriteria: ["HTML mock artifact exists."],
          testPlan: {
            unit: [],
            integration: ["Open the HTML mock locally."],
            visual: ["Capture desktop and narrow screenshots."],
            manual: ["User reviews and approves or requests revisions."],
          },
          uiMockRole: "mock_gate",
          clarificationQuestions: ["Which exact color palette should the mock use?"],
          clarificationDecisions: [
            {
              question: "Which exact color palette should the mock use?",
              state: "open",
              rationale: "Pi asked for visual direction.",
            },
          ],
        },
      ],
    });

    expect(draft.cards[0]).toMatchObject({
      sourceId: "synthesis:ux-mock-approval",
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      uiMockRole: "mock_gate",
    });
  });

  it("backfills UX mock dependencies when Pi provides the mock gate but omits implementation blockers", () => {
    const draft = normalizeProjectBoardSynthesisDraft({
      summary: "Dashboard board.",
      goal: "Build a responsive dashboard UI.",
      currentState: "Spec exists.",
      targetUser: "Operations users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "mock-gate",
          title: "Create UX mock for approval",
          description: "Produce a reviewable self-contained HTML mock before UI implementation.",
          candidateStatus: "ready_to_create",
          labels: ["ux-mock-approval"],
          blockedBy: [],
          sourceRefs: ["docs/dashboard.md"],
          acceptanceCriteria: ["HTML mock artifact exists."],
          testPlan: {
            unit: [],
            integration: ["Open the HTML mock locally."],
            visual: ["Capture desktop and narrow screenshots."],
            manual: ["User reviews and approves or requests revisions."],
          },
          uiMockRole: "mock_gate",
          requiresUiMockApproval: true,
        },
        {
          sourceId: "dashboard-ui",
          title: "Implement dashboard UI",
          description: "Build the dashboard layout and active card inspector.",
          candidateStatus: "ready_to_create",
          labels: ["frontend"],
          blockedBy: [],
          sourceRefs: ["docs/dashboard.md"],
          acceptanceCriteria: ["Dashboard UI renders."],
          testPlan: {
            unit: ["Run renderer tests."],
            integration: [],
            visual: ["Capture dashboard screenshots."],
            manual: [],
          },
          uiMockRole: "gated_implementation",
          requiresUiMockApproval: true,
        },
      ],
    });

    expect(draft.cards[0]).toMatchObject({
      sourceId: "synthesis:ux-mock-approval",
      uiMockRole: "mock_gate",
      requiresUiMockApproval: false,
    });
    expect(draft.cards[1]).toMatchObject({
      sourceId: "synthesis:dashboard-ui",
      blockedBy: ["synthesis:ux-mock-approval"],
      labels: expect.arrayContaining(["ux-mock-gated"]),
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
    });
  });

  it("represents source-scoped Add Cards refinement as additive progressive elaboration", () => {
    const sources: ProjectBoardSynthesisSource[] = [
      {
        id: "gdd",
        kind: "functional_spec",
        title: "THE LAST VECTOR - Game Design Document",
        summary: "Large game design document with movement, shields, factions, bosses, environments, and progression.",
        excerpt:
          "Hybrid Newtonian movement, active shields, dodge, charge attacks, enemy point-buy, mech elites, mothership bosses, environmental hazards, mission progression, upgrades, HUD, audio, and proof requirements.",
        path: "GAME_DESIGN_DOCUMENT.md",
        relevance: 98,
      },
    ];
    const deterministicDraft = synthesizeProjectBoardDraft(sources);
    const prompt = buildProjectBoardSynthesisPrompt({
      sources,
      deterministicDraft,
      refinement: {
        previousDraft: deterministicDraft,
        answers: [
          {
            question: "Add Cards source scope",
            answer:
              "Elaborate candidate cards only from GAME_DESIGN_DOCUMENT.md. This is an additive Add Cards operation, not a global board revision. Do not replace existing board cards.",
          },
          {
            question: "Existing board cards to avoid duplicating",
            answer: "1. Create the PixiJS game shell (needs_clarification, phase Foundation)",
          },
        ],
      },
    });

    expect(prompt).toContain("Add Cards source scope");
    expect(prompt).toContain("additive Add Cards operation");
    expect(prompt).toContain("Existing board cards to avoid duplicating");
    expect(prompt).toContain("Hybrid Newtonian movement");
    expect(prompt).toContain("GAME_DESIGN_DOCUMENT.md");
    expect(prompt).toContain("Operation overlay: Add Cards From Sources");
    expect(prompt).toContain("Add net-new cards from the selected source scope");
    expect(prompt).toContain('"visual"');
    expect(prompt).toContain("only when this card directly changes visible UI");
  });

  it("represents objective-driven Add Cards refinement as additive elaboration with optional source context", () => {
    const sources: ProjectBoardSynthesisSource[] = [
      {
        id: "kanban-notes",
        kind: "functional_spec",
        title: "Kanban Notes",
        summary: "The app has basic columns, persisted cards, and drag state. Remaining gaps include filters and keyboard movement.",
        path: "docs/kanban-notes.md",
        relevance: 94,
      },
    ];
    const deterministicDraft = synthesizeProjectBoardDraft(sources);
    const prompt = buildProjectBoardSynthesisPrompt({
      sources,
      deterministicDraft,
      refinement: {
        previousDraft: deterministicDraft,
        answers: [
          {
            question: "Add Cards objective",
            answer:
              "Generate net-new candidate cards for swimlane filtering and keyboard-accessible drag operations. Do not replace existing board cards.",
          },
          {
            question: "Add Cards source context",
            answer: "Use the recent source scan as grounding evidence for the Add Cards objective.",
          },
          {
            question: "Existing board cards to avoid duplicating",
            answer: "1. Create the basic kanban columns (ready_to_create, phase Foundation)",
          },
        ],
      },
    });

    expect(prompt).toContain("Add Cards objective");
    expect(prompt).toContain("swimlane filtering");
    expect(prompt).toContain("keyboard-accessible drag operations");
    expect(prompt).toContain("Operation overlay: Add Cards From Sources");
    expect(prompt).toContain("Add net-new cards from the selected source scope");
    expect(prompt).toContain("Do not repeat cards whose title or sourceId already appears in the previous draft");
  });

  it("adds a concrete clarification question when Pi omits one for a Needs Clarification card", () => {
    const draft = normalizeProjectBoardSynthesisDraft({
      summary: "Plan.",
      goal: "Build the game.",
      currentState: "Spec exists.",
      targetUser: "Players.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:ship-controls",
          title: "Implement ship controls",
          description: "Add keyboard movement.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Core Gameplay",
          labels: ["controls"],
          blockedBy: [],
          sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
          acceptanceCriteria: ["Ship moves."],
          testPlan: { unit: ["Movement reducer test."], integration: [], visual: [], manual: [] },
        },
      ],
    });

    expect(draft.cards[0].clarificationQuestions).toEqual([
      'What PM decision is still required before "Implement ship controls" can move to Ready To Create?',
    ]);
  });

  it("uses the explicit refinement mode over any answer-text inference", () => {
    const previousDraft = {
      summary: "Baseline.",
      goal: "Build the app.",
      currentState: "Cards exist.",
      targetUser: "Users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [],
    };

    // An organic user answer containing "avoid duplicating" must NOT flip the run
    // to additive when the caller marked it as a normal refinement.
    expect(
      isAdditiveProjectBoardRefinement({
        previousDraft,
        answers: [{ question: "Scope?", answer: "Please avoid duplicating effort across teams." }],
        mode: "refine",
      }),
    ).toBe(false);

    expect(
      isAdditiveProjectBoardRefinement({
        previousDraft,
        answers: [],
        mode: "additive",
      }),
    ).toBe(true);
  });

  it("falls back to system-authored Add Cards markers only when mode is absent", () => {
    const previousDraft = {
      summary: "Baseline.",
      goal: "Build the app.",
      currentState: "Cards exist.",
      targetUser: "Users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [],
    };

    expect(
      isAdditiveProjectBoardRefinement({
        previousDraft,
        answers: [{ question: "Add Cards source scope", answer: "This is an additive Add Cards operation. Do not replace existing cards." }],
      }),
    ).toBe(true);

    // Loose organic phrases no longer trigger the legacy fallback.
    expect(
      isAdditiveProjectBoardRefinement({
        previousDraft,
        answers: [{ question: "Scope?", answer: "Keep things additive and avoid duplicating other teams' work." }],
      }),
    ).toBe(false);
  });
});
