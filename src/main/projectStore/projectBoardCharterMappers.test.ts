import { describe, expect, it } from "vitest";

import type { ProjectBoardQuestion, ProjectBoardSource } from "../../shared/projectBoardTypes";
import {
  buildProjectBoardCharterProjectSummary,
  compileProjectBoardCharter,
  keywordSystemHints,
  projectBoardCharterCoverageGaps,
} from "./projectBoardSourceMappers";

describe("project board charter mappers", () => {
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
});
