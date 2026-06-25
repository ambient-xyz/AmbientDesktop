import { describe, expect, it } from "vitest";

import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardQuestion, ProjectBoardSource } from "../../shared/projectBoardTypes";
import {
  buildProjectBoardCharterProjectSummary,
  compileProjectBoardCharter,
  keywordSystemHints,
  projectBoardCanonicalSourceKey,
  projectBoardCharterCoverageGaps,
  projectBoardDescriptionWithSourceImpactRefresh,
  projectBoardSourceDraftRefreshEventMetadata,
  projectBoardSourceDraftRefreshNote,
  projectBoardSourceDraftRefreshRecordKey,
  projectBoardSourceImpactDurablePlanPrimary,
  projectBoardSourceImpactEstimatedPromptChars,
  projectBoardSourceImpactFeedbackText,
  projectBoardSourceImpactGroupKey,
  projectBoardSourceImpactIncluded,
  projectBoardSourceImpactLedgerDetail,
  projectBoardSourceImpactMetadataFromEvent,
  projectBoardSourceImpactNormalizeText,
  projectBoardSourceImpactRecommendedAction,
  projectBoardSourceImpactReferenceKey,
  projectBoardSourceImpactReferenceKeys,
  projectBoardSourceImpactReferenceMatchesAny,
  projectBoardSourceInputFromExisting,
  projectBoardSourcesByCanonicalKey,
  projectBoardSourceUpdateImpactMetadata,
  projectBoardSynthesisMarkdown,
  sourceDisplayName,
  sourceMajorSystemLabel,
  truncateForProjectBoardSummary,
  uniqueLimitedStrings,
  type ProjectBoardSourceUpdateImpactMetadata,
} from "./projectBoardSourceMappers";

describe("project board source and charter mappers", () => {
  const projectBoardSource = (source: Partial<ProjectBoardSource> = {}): ProjectBoardSource =>
    ({
      id: "source-1",
      boardId: "board-1",
      kind: "markdown",
      title: "Source",
      summary: "Summary",
      relevance: 50,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...source,
    }) as ProjectBoardSource;

  const projectBoardQuestion = (question: Partial<ProjectBoardQuestion> = {}): ProjectBoardQuestion =>
    ({
      id: "question-1",
      boardId: "board-1",
      question: "Question?",
      required: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...question,
    }) as ProjectBoardQuestion;

  const projectBoardCard = (card: Partial<ProjectBoardCard> = {}): ProjectBoardCard =>
    ({
      id: "card-1",
      boardId: "board-1",
      title: "Create shell",
      description: "Build the shell.",
      status: "draft",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis",
      sourceId: "synthesis:shell",
      sourceRefs: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...card,
    }) as ProjectBoardCard;

  it("maps project board sources by canonical source key", () => {
    expect(projectBoardCanonicalSourceKey({ sourceKey: " explicit:key ", title: "Ignored" })).toBe("explicit:key");
    expect(projectBoardCanonicalSourceKey({ sourceKey: " ", path: "docs/Guide.md", title: "Guide" })).toBe("file:docs/Guide.md");
    expect(
      projectBoardSourcesByCanonicalKey([
        projectBoardSource({ id: "first", sourceKey: "docs:guide", title: "First" }),
        projectBoardSource({ id: "second", sourceKey: " docs:guide ", title: "Second" }),
        projectBoardSource({ id: "third", path: "docs/Other.md", title: "Other" }),
      ]),
    ).toEqual(
      new Map([
        ["docs:guide", projectBoardSource({ id: "first", sourceKey: "docs:guide", title: "First" })],
        ["file:docs/Other.md", projectBoardSource({ id: "third", path: "docs/Other.md", title: "Other" })],
      ]),
    );
  });

  it("formats project board source display names and major system labels", () => {
    expect(sourceDisplayName({ path: " docs/Guide.md ", title: "Guide", kind: "markdown" })).toBe("docs/Guide.md");
    expect(sourceDisplayName({ title: " Guide title ", kind: "thread" })).toBe("Guide title");
    expect(sourceDisplayName({ title: "   ", kind: "thread" })).toBe("thread");
    expect(sourceMajorSystemLabel(projectBoardSource({ path: "src/features/project-board/BoardStore.ts" }))).toBe(
      "project board BoardStore",
    );
    expect(sourceMajorSystemLabel(projectBoardSource({ path: "docs/architecture.md" }))).toBe("docs architecture");
  });

  it("maps project board source impact inclusion, durable plan, and prompt sizing helpers", () => {
    expect(projectBoardSourceImpactIncluded(projectBoardSource())).toBe(true);
    expect(projectBoardSourceImpactIncluded(projectBoardSource({ kind: "ignored" }))).toBe(false);
    expect(projectBoardSourceImpactIncluded(projectBoardSource({ includeInSynthesis: false }))).toBe(false);
    expect(projectBoardSourceImpactIncluded(projectBoardSource({ authorityRole: "ignored" }))).toBe(false);
    expect(
      projectBoardSourceImpactDurablePlanPrimary(
        projectBoardSource({
          kind: "plan_artifact",
          path: ".ambient\\board\\plans\\durable.md",
          authorityRole: "primary",
        }),
      ),
    ).toBe(true);
    expect(
      projectBoardSourceImpactDurablePlanPrimary(
        projectBoardSource({
          kind: "plan_artifact",
          path: ".ambient/board/plans/durable.md",
          authorityRole: "primary",
          includeInSynthesis: false,
        }),
      ),
    ).toBe(false);
    expect(projectBoardSourceImpactEstimatedPromptChars(projectBoardSource({ byteSize: 12.6 }))).toBe(13);
    const fallbackSource = projectBoardSource({
      title: "Title",
      summary: "Summary",
      excerpt: "Excerpt",
      path: "docs/path.md",
      threadId: "thread-1",
      artifactId: "artifact-1",
      messageId: "message-1",
    });
    expect(projectBoardSourceImpactEstimatedPromptChars(fallbackSource)).toBe(
      ["Title", "Summary", "Excerpt", "docs/path.md", "thread-1", "artifact-1", "message-1"].join("\n").length,
    );
  });

  it("maps project board source impact recommendation and ledger detail helpers", () => {
    expect(
      projectBoardSourceImpactRecommendedAction({
        additiveSynthesisAvailable: true,
        targetedRefreshOptional: true,
        nextRunFeedbackRecommended: true,
      }),
    ).toBe("add_next_run_feedback");
    expect(
      projectBoardSourceImpactRecommendedAction({
        additiveSynthesisAvailable: true,
        targetedRefreshOptional: true,
        nextRunFeedbackRecommended: false,
      }),
    ).toBe("refresh_drafts");
    expect(
      projectBoardSourceImpactRecommendedAction({
        additiveSynthesisAvailable: true,
        targetedRefreshOptional: false,
        nextRunFeedbackRecommended: false,
      }),
    ).toBe("additive_source_elaboration");
    expect(
      projectBoardSourceImpactRecommendedAction({
        additiveSynthesisAvailable: false,
        targetedRefreshOptional: false,
        nextRunFeedbackRecommended: false,
      }),
    ).toBe("none");
    expect(
      projectBoardSourceImpactLedgerDetail({
        additiveSynthesisAvailable: true,
        targetedRefreshOptional: true,
        nextRunFeedbackRecommended: true,
        affectedDraftCount: 1,
        affectedExecutableCount: 2,
        durablePlanPrimaryCount: 1,
        ignoredChatCount: 3,
      }),
    ).toBe(
      [
        "Source selection updated without rewriting existing cards or calling Pi.",
        "The source can be used later for additive card elaboration.",
        "1 draft card cite this source and can be refreshed selectively.",
        "2 ticketized cards cite this source; use additive next-run feedback instead of rewriting approved cards.",
        "Durable-plan authority is active, so ignored chats remain inspectable but excluded by default.",
      ].join(" "),
    );
  });

  it("maps project board source update impact metadata", () => {
    const previousSource = projectBoardSource({
      id: "source-main",
      kind: "thread",
      title: "Implementation Plan ABCD1234",
      summary: "Updated 2026-01-02T03:04:05Z state model",
      threadId: "thread-main",
      sourceKey: "thread:main",
      authorityRole: "ignored",
      includeInSynthesis: false,
      byteSize: 20,
    });
    const nextSource = projectBoardSource({
      ...previousSource,
      kind: "plan_artifact",
      path: ".ambient/board/plans/main.md",
      authorityRole: "primary",
      includeInSynthesis: true,
      byteSize: 18,
    });
    const peerSource = projectBoardSource({
      id: "source-peer",
      title: "Implementation Plan EEEEFFFF",
      summary: "Updated 2026-04-05T06:07:08Z state model",
      path: "docs/plan.md",
      authorityRole: "context",
      includeInSynthesis: true,
      byteSize: 12,
    });
    const includedChat = projectBoardSource({
      id: "chat-included",
      kind: "thread",
      title: "Kickoff chat",
      summary: "Discussed priorities.",
      authorityRole: "context",
      includeInSynthesis: true,
    });
    const ignoredChat = projectBoardSource({
      id: "chat-ignored",
      kind: "thread",
      title: "Old chat",
      summary: "Superseded notes.",
      authorityRole: "ignored",
      includeInSynthesis: false,
    });
    const impact = projectBoardSourceUpdateImpactMetadata({
      previousSource,
      nextSource,
      sources: [nextSource, peerSource, includedChat, ignoredChat],
      cards: [
        projectBoardCard({ id: "draft-card", status: "draft", sourceId: "source-main" }),
        projectBoardCard({ id: "ready-card", status: "ready", sourceId: "synthesis:ready", sourceRefs: ["Docs/Plan.md#scope"] }),
        projectBoardCard({ id: "archived-card", status: "archived", sourceId: "synthesis:archived", sourceRefs: ["source-main"] }),
        projectBoardCard({ id: "unrelated-card", status: "ready", sourceId: "synthesis:unrelated", sourceRefs: ["unrelated"] }),
      ],
    });

    expect(impact).toEqual({
      schemaVersion: 1,
      sourceId: "source-main",
      groupSourceIds: ["source-main", "source-peer"],
      from: {
        kind: "thread",
        authorityRole: "ignored",
        includeInSynthesis: false,
      },
      to: {
        kind: "plan_artifact",
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      existingCardsRewritten: false,
      modelCallRequired: false,
      additiveSynthesisAvailable: true,
      targetedRefreshOptional: true,
      nextRunFeedbackRecommended: true,
      affectedCardIds: ["draft-card", "ready-card", "archived-card"],
      affectedDraftCardIds: ["draft-card"],
      affectedExecutableCardIds: ["ready-card"],
      affectedDraftCount: 1,
      affectedExecutableCount: 1,
      durablePlanPrimaryCount: 1,
      includedChatCount: 1,
      ignoredChatCount: 1,
      selectedObservationCount: 2,
      estimatedPromptChars: 30,
      recommendedAction: "add_next_run_feedback",
      detail: [
        "Source selection updated without rewriting existing cards or calling Pi.",
        "The source can be used later for additive card elaboration.",
        "1 draft card cite this source and can be refreshed selectively.",
        "1 ticketized card cite this source; use additive next-run feedback instead of rewriting approved cards.",
        "Durable-plan authority is active, so ignored chats remain inspectable but excluded by default.",
      ].join(" "),
    });
  });

  it("maps project board source impact event metadata helpers", () => {
    const event = (overrides: Partial<ProjectBoardEvent>): ProjectBoardEvent => ({
      id: "event-1",
      boardId: "board-1",
      kind: "source_updated",
      title: "Source updated",
      summary: "Source metadata changed",
      metadata: {},
      createdAt: "2026-01-02T03:04:05.000Z",
      ...overrides,
    });
    const impact: ProjectBoardSourceUpdateImpactMetadata = {
      schemaVersion: 1,
      sourceId: "source-1",
      groupSourceIds: ["source-b", "source-a"],
      from: { kind: "thread", authorityRole: "context", includeInSynthesis: true },
      to: { kind: "plan_artifact", authorityRole: "primary", includeInSynthesis: true },
      existingCardsRewritten: false,
      modelCallRequired: false,
      additiveSynthesisAvailable: true,
      targetedRefreshOptional: false,
      nextRunFeedbackRecommended: true,
      affectedCardIds: ["card-1"],
      affectedDraftCardIds: ["draft-1"],
      affectedExecutableCardIds: ["run-1"],
      affectedDraftCount: 1,
      affectedExecutableCount: 1,
      durablePlanPrimaryCount: 1,
      includedChatCount: 1,
      ignoredChatCount: 0,
      selectedObservationCount: 2,
      estimatedPromptChars: 120,
      recommendedAction: "add_next_run_feedback",
      detail: "Source selection updated.",
    };
    expect(projectBoardSourceImpactMetadataFromEvent(event({ metadata: { sourceImpact: impact } }))).toBe(impact);
    expect(projectBoardSourceImpactMetadataFromEvent(event({ kind: "board_created", metadata: { sourceImpact: impact } }))).toBeUndefined();
    expect(
      projectBoardSourceImpactMetadataFromEvent(
        event({
          metadata: {
            sourceImpact: {
              ...impact,
              groupSourceIds: "source-a",
            },
          },
        }),
      ),
    ).toBeUndefined();
    expect(projectBoardSourceDraftRefreshRecordKey({ impact })).toBe("source-a|source-b");
    expect(projectBoardSourceDraftRefreshRecordKey({ impact: { ...impact, groupSourceIds: [] } })).toBe("source-1");
    expect(
      projectBoardSourceDraftRefreshEventMetadata(
        event({
          kind: "card_updated",
          metadata: {
            sourceImpact: {
              appliedAction: "refresh_affected_drafts",
              sourceImpactEventIds: ["impact-1", "", 3, " impact-2 "],
              appliedCardIds: ["card-1", " ", false, "card-2"],
            },
          },
        }),
      ),
    ).toEqual({
      sourceImpactEventIds: ["impact-1", " impact-2 "],
      appliedCardIds: ["card-1", "card-2"],
    });
    expect(
      projectBoardSourceDraftRefreshEventMetadata(
        event({
          kind: "card_updated",
          metadata: {
            sourceImpact: {
              appliedAction: "refresh_affected_drafts",
              sourceImpactEventIds: "impact-1",
              appliedCardIds: ["card-1"],
            },
          },
        }),
      ),
    ).toBeUndefined();
    expect(projectBoardSourceDraftRefreshEventMetadata(event({ kind: "source_updated", metadata: {} }))).toBeUndefined();
  });

  it("maps project board source impact refresh note and feedback text helpers", () => {
    const sources = [
      projectBoardSource({ title: "Primary plan", path: ".ambient/board/plans/main.md", authorityRole: "primary" }),
      projectBoardSource({ id: "source-2", title: "Ignored chat", authorityRole: "ignored", includeInSynthesis: false }),
      projectBoardSource({ id: "source-3", title: "Context thread" }),
      projectBoardSource({ id: "source-4", title: "Proof", authorityRole: "proof" }),
      projectBoardSource({ id: "source-5", title: "Hidden extra" }),
    ];
    expect(
      projectBoardSourceDraftRefreshNote({
        sources,
        impactRecordCount: 2,
        selectedObservationCount: 1,
      }),
    ).toBe(
      [
        "Source authority was refreshed from 2 source-impact records.",
        "Current impacted sources: .ambient/board/plans/main.md (primary, included); Ignored chat (ignored, excluded); Context thread (context, included); Proof (proof, included); +1 more.",
        "1 included source observation are available for additive elaboration.",
        "Existing draft text was not rewritten by Pi; review this note before ticketization or run Add Cards for a low-model targeted elaboration.",
      ].join(" "),
    );
    expect(
      projectBoardSourceDraftRefreshNote({
        sources: [],
        impactRecordCount: 1,
        selectedObservationCount: 0,
      }),
    ).toBe(
      [
        "Source authority was refreshed from 1 source-impact record.",
        "Current impacted sources: current source selection.",
        "no included source observations are available for additive elaboration.",
        "Existing draft text was not rewritten by Pi; review this note before ticketization or run Add Cards for a low-model targeted elaboration.",
      ].join(" "),
    );
    expect(
      projectBoardSourceImpactFeedbackText({
        sources,
        impactRecordCount: 2,
        selectedObservationCount: 3,
      }),
    ).toBe(
      [
        "Source authority changed after this card was approved. Reconcile the next run against .ambient/board/plans/main.md (primary, included); Ignored chat (ignored, excluded); Context thread (context, included); Proof (proof, included); +1 more.",
        "3 included source observations are currently eligible for additive source context.",
        "This feedback came from 2 source-impact records.",
        "Do not rewrite the approved card scope silently; if the source change materially broadens work, create a follow-up or split card.",
      ].join(" "),
    );
    expect(
      projectBoardSourceImpactFeedbackText({
        sources: [],
        impactRecordCount: 1,
        selectedObservationCount: 0,
      }),
    ).toBe(
      [
        "Source authority changed after this card was approved. Reconcile the next run against current source selection.",
        "no included source observations are currently eligible for additive source context.",
        "This feedback came from 1 source-impact record.",
        "Do not rewrite the approved card scope silently; if the source change materially broadens work, create a follow-up or split card.",
      ].join(" "),
    );
  });

  it("maps project board synthesis draft markdown", () => {
    const draft: ProjectBoardSynthesisDraft = {
      summary: "Summary",
      goal: "Ship the board.",
      currentState: "The shell exists.",
      targetUser: "Builders",
      qualityBar: "Reliable and clear.",
      assumptions: ["Use existing APIs.", "Keep scope tight."],
      questions: ["Which source wins?"],
      sourceNotes: ["README.md explains the shell.", "plan.md defines scope."],
      cards: [
        {
          sourceId: "source-1",
          title: "Wire board",
          description: "Connect the board.",
          candidateStatus: "ready_to_create",
          labels: [],
          blockedBy: ["card-a", "card-b"],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
          clarificationQuestions: ["Confirm data flow?"],
        },
        {
          sourceId: "source-2",
          title: "Review copy",
          description: "Review wording.",
          candidateStatus: "needs_clarification",
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
      ],
    };
    expect(projectBoardSynthesisMarkdown({ title: "Launch Board" }, draft)).toBe(
      [
        "# Launch Board",
        "",
        "## Synthesized Goal",
        "",
        "Ship the board.",
        "",
        "## Current State",
        "",
        "The shell exists.",
        "",
        "## Target User",
        "",
        "Builders",
        "",
        "## Quality Bar",
        "",
        "Reliable and clear.",
        "",
        "## Assumptions",
        "",
        "- Use existing APIs.\n- Keep scope tight.",
        "",
        "## Open Questions",
        "",
        "- Which source wins?",
        "",
        "## Proposed Cards",
        "",
        "1. Wire board (ready_to_create). Blocked by: card-a, card-b. Questions: Confirm data flow?\n2. Review copy (needs_clarification).",
        "",
        "## Source Basis",
        "",
        "- README.md explains the shell.\n- plan.md defines scope.",
      ].join("\n"),
    );
    expect(
      projectBoardSynthesisMarkdown(
        { title: "Empty Board" },
        {
          ...draft,
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [],
        },
      ),
    ).toContain(["## Assumptions", "", "- None recorded.", "", "## Open Questions", "", "- No synthesis-specific questions."].join("\n"));
  });

  it("maps project board source impact identity and reference keys", () => {
    expect(projectBoardSourceImpactNormalizeText("Plan ABCD1234 updated 2026-01-02T03:04:05Z")).toBe("plan updated");
    expect(projectBoardSourceImpactReferenceKey(" Docs\\Plan  File.md ")).toBe("docs/plan file.md");
    expect(
      projectBoardSourceImpactReferenceKeys(
        projectBoardSource({
          id: "source-1",
          sourceKey: " Source:Key ",
          path: "Docs\\Plan.md",
          title: " Plan Title ",
          artifactId: "Artifact-1",
          threadId: "Thread-1",
          messageId: "Message-1",
        }),
      ),
    ).toEqual(["source-1", "source:key", "docs/plan.md", "plan title", "artifact-1", "thread-1", "message-1"]);
    expect(
      projectBoardSourceImpactGroupKey(projectBoardSource({ title: "Plan ABCD1234", summary: "Updated 2026-01-02T03:04:05Z state model" })),
    ).toBe("content:plan|updated state model");
    expect(
      projectBoardSourceImpactGroupKey(projectBoardSource({ title: "Short", summary: "", kind: "thread", threadId: "thread-1" })),
    ).toBe("thread::thread-1:::source-1");
    expect(projectBoardSourceImpactReferenceMatchesAny("docs/plan.md#section", new Set(["docs/plan.md"]))).toBe(true);
    expect(projectBoardSourceImpactReferenceMatchesAny("plan", new Set(["docs/plan.md"]))).toBe(false);
  });

  it("compiles project board charter policy and markdown", () => {
    const questions = [
      projectBoardQuestion({ id: "question-1", answer: " Build a stable project board. " }),
      projectBoardQuestion({ id: "question-2", answer: " Prefer durable sources. " }),
      projectBoardQuestion({ id: "question-3", answer: " Ask before guessing. " }),
      projectBoardQuestion({ id: "question-4", answer: " Require focused proof. " }),
      projectBoardQuestion({ id: "question-5", answer: " Finish dependency-ready cards first. " }),
    ];
    const compiled = compileProjectBoardCharter({ title: "Project Board", summary: "Fallback summary" }, questions, [
      projectBoardSource({ id: "thread-source", kind: "thread", title: "Kickoff Chat", relevance: 100 }),
      projectBoardSource({ id: "plan-source", kind: "plan_artifact", title: "Plan", path: "docs/plan.md", relevance: 40 }),
      projectBoardSource({ id: "ignored-source", kind: "ignored", title: "Ignored", includeInSynthesis: false, relevance: 90 }),
    ]);
    expect(compiled).toMatchObject({
      goal: "Build a stable project board.",
      currentState: "Kickoff completed with 2 included project sources.",
      targetUser: "",
      nonGoals: [],
      qualityBar: "Require focused proof.",
      testPolicy: {
        defaultProof: "Require focused proof.",
        requireProofSpec: true,
        unit: true,
        integration: true,
        visual: true,
        manual: true,
        proofScopeWarningPolicy: "advisory",
      },
      decisionPolicy: { defaultPolicy: "Ask before guessing." },
      dependencyPolicy: {
        ordering: "blockers_first",
        source: "board_dependencies",
        executionPolicy: "Finish dependency-ready cards first.",
      },
      budgetPolicy: {
        maxPassesPerCard: 6,
        maxRuntimeMsPerCard: 1_200_000,
        pauseOnTerminalBlocker: true,
        executionPolicy: "Finish dependency-ready cards first.",
      },
      sourcePolicy: { policy: "Prefer durable sources.", authoritativeSources: ["docs/plan.md"] },
      summary: "Build a stable project board.",
    });
    expect(compiled.markdown).toBe(
      [
        "# Project Board",
        "",
        "## Goal",
        "",
        "Build a stable project board.",
        "",
        "## Source Authority",
        "",
        "Prefer durable sources.",
        "",
        "## Decision Policy",
        "",
        "Ask before guessing.",
        "",
        "## Proof Policy",
        "",
        "Require focused proof.",
        "",
        "## Execution Policy",
        "",
        "Finish dependency-ready cards first.",
        "",
        "## Source Corpus",
        "",
        "- Kickoff Chat (thread)\n- Plan (plan_artifact: docs/plan.md)",
      ].join("\n"),
    );

    const fallback = compileProjectBoardCharter({ title: "Fallback Board", summary: "" }, [], []);
    expect(fallback.goal).toBe("Fallback Board");
    expect(fallback.currentState).toBe("Kickoff completed with 0 included project sources.");
    expect(fallback.sourcePolicy).toEqual({
      policy: "Use the scanned sources as supporting context and ask when they conflict.",
      authoritativeSources: [],
    });
    expect(fallback.markdown).toContain("- No sources scanned yet.");
  });

  it("builds fallback project board charter project summaries", () => {
    const questions = [
      projectBoardQuestion({
        id: "question-goal",
        question: "What should the board ship?",
        answer: " Build a stable project board. ",
      }),
      projectBoardQuestion({
        id: "question-source",
        question: "How should sources be weighted?",
        answer: " Prefer durable sources. ",
      }),
      projectBoardQuestion({
        id: "question-decision",
        question: "Which source owns release scope?",
        answer: "",
        required: true,
      }),
      projectBoardQuestion({
        id: "question-proof",
        question: "What proof is required?",
        answer: " Require focused proof. ",
      }),
      projectBoardQuestion({
        id: "question-execution",
        question: "How should cards be sequenced?",
        answer: " Finish dependency-ready cards first. ",
      }),
    ];
    const sources = [
      projectBoardSource({
        id: "architecture-source",
        kind: "architecture_artifact",
        title: "Architecture",
        summary: "State persistence must land before provider API work; a blocker risk remains.",
        excerpt: "Use integration tests and manual proof before closing the board.",
        path: "src/features/project-board/BoardStore.ts",
        authorityRole: "primary",
        relevance: 92,
      }),
      projectBoardSource({
        id: "test-source",
        kind: "test_artifact",
        title: "Proof plan",
        summary: "Validation requires unit and integration proof.",
        path: "docs/proof.md",
        authorityRole: "proof",
        relevance: 55,
      }),
      projectBoardSource({
        id: "ignored-source",
        kind: "thread",
        title: "Ignored thread",
        summary: "Old discussion.",
        includeInSynthesis: false,
        relevance: 99,
      }),
    ];
    const compiled = compileProjectBoardCharter({ title: "Project Board", summary: "Fallback summary" }, questions, sources);
    const summary = buildProjectBoardCharterProjectSummary({
      board: { title: "Project Board" },
      questions,
      sources,
      compiled,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(summary).toMatchObject({
      generator: "fallback_heuristic",
      generatedAt: "2026-01-01T00:00:00.000Z",
      summary: expect.stringContaining("Build a stable project board."),
      majorSystems: expect.arrayContaining(["project board BoardStore", "State and persistence"]),
      sourceCoverage: [
        "src/features/project-board/BoardStore.ts - architecture_artifact - 92 relevance - primary authority",
        "docs/proof.md - test_artifact - 55 relevance - proof authority",
      ],
      coverageGaps: [],
      unresolvedDecisions: ["Which source owns release scope?"],
      risks: expect.arrayContaining(["Review src/features/project-board/BoardStore.ts for risks or unresolved scope."]),
      dependencyHints: expect.arrayContaining([
        "Use dependency cues from src/features/project-board/BoardStore.ts.",
        "Finish dependency-ready cards first.",
      ]),
      citations: expect.arrayContaining(["src/features/project-board/BoardStore.ts (src/features/project-board/BoardStore.ts)"]),
      kickoffContextBrief: expect.objectContaining({
        includedSourceCount: 2,
        ignoredSourceCount: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    expect(summary.sourceCoverage).not.toEqual(expect.arrayContaining([expect.stringContaining("Ignored thread")]));
    expect(summary.sourceChecksumSet).toHaveLength(2);
    expect(summary.charterAnswerChecksum).toHaveLength(64);
  });

  it("maps project board charter summary keyword hints and coverage gaps", () => {
    expect(keywordSystemHints("Renderer input state API test auth")).toEqual([
      "Rendering and visual proof",
      "Input and controls",
      "State and persistence",
      "Provider and session integration",
      "Testing and proof",
      "Security and permissions",
    ]);
    expect(keywordSystemHints("No matching domain language.")).toEqual([]);
    expect(projectBoardCharterCoverageGaps([])).toEqual([
      "No authoritative spec, architecture, or implementation plan source was included.",
      "No dedicated test/proof artifact was included.",
      "No included source material was available at charter finalization.",
    ]);
    expect(
      projectBoardCharterCoverageGaps([
        projectBoardSource({ kind: "architecture_artifact" }),
        projectBoardSource({ kind: "test_artifact" }),
      ]),
    ).toEqual([]);
  });

  it("normalizes, limits, and truncates project board summary strings", () => {
    expect(truncateForProjectBoardSummary("  Alpha\n\nBeta\tGamma  ", 50)).toBe("Alpha Beta Gamma");
    expect(truncateForProjectBoardSummary("Alpha Beta Gamma", 10)).toBe("Alpha B...");
    expect(uniqueLimitedStrings([" First item ", "first ITEM", "", undefined, "Second\nitem", "Third item"], 2)).toEqual([
      "First item",
      "Second item",
    ]);
  });

  it("formats project board source impact refresh descriptions", () => {
    expect(projectBoardDescriptionWithSourceImpactRefresh("   ", "  Refresh note.  ")).toBe("## Source impact refresh\nRefresh note.");
    expect(projectBoardDescriptionWithSourceImpactRefresh("Build the shell.", "Refresh note.")).toBe(
      "Build the shell.\n\n## Source impact refresh\nRefresh note.",
    );
    expect(
      projectBoardDescriptionWithSourceImpactRefresh(
        "Build the shell.\n\n## Source impact refresh\nOld note.\n\n## Next\nKeep this.",
        "New note.",
      ),
    ).toBe("Build the shell.\n\n## Source impact refresh\nNew note.\n## Next\nKeep this.");
  });

  it("maps existing project board sources back to source input", () => {
    expect(
      projectBoardSourceInputFromExisting(
        projectBoardSource({
          kind: "plan_artifact",
          sourceKey: "source:key",
          contentHash: "hash",
          changeState: "changed",
          title: "Existing Source",
          summary: "Existing summary",
          excerpt: "Excerpt",
          path: "docs/plan.md",
          threadId: "thread-1",
          artifactId: "artifact-1",
          messageId: "message-1",
          byteSize: 0,
          mtime: "2026-01-01T00:01:00.000Z",
          classificationReason: "Reason",
          classifiedBy: "user",
          classificationConfidence: 0,
          authorityRole: "primary",
          includeInSynthesis: false,
          relevance: 75,
        }),
      ),
    ).toEqual({
      kind: "plan_artifact",
      sourceKey: "source:key",
      contentHash: "hash",
      changeState: "changed",
      title: "Existing Source",
      summary: "Existing summary",
      excerpt: "Excerpt",
      path: "docs/plan.md",
      threadId: "thread-1",
      artifactId: "artifact-1",
      messageId: "message-1",
      byteSize: 0,
      mtime: "2026-01-01T00:01:00.000Z",
      classificationReason: "Reason",
      classifiedBy: "user",
      classificationConfidence: 0,
      authorityRole: "primary",
      includeInSynthesis: false,
      relevance: 75,
    });

    expect(
      projectBoardSourceInputFromExisting(
        projectBoardSource({
          sourceKey: "",
          contentHash: "",
          excerpt: "",
          relevance: 25,
        }),
      ),
    ).toEqual({
      kind: "markdown",
      title: "Source",
      summary: "Summary",
      relevance: 25,
    });
  });
});
