import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardSource, ProjectBoardSummary } from "../shared/types";
import type { ProjectBoardSynthesisDraft } from "./projectBoardSynthesis";
import {
  annotateProjectBoardDraftWithObjectiveProvenance,
  annotateProjectBoardProgressiveRecordsWithObjectiveProvenance,
  deterministicProjectBoardSourceElaborationDraft,
  projectBoardSourceScopeAnswersForRefinement,
  selectProjectBoardSynthesisSources,
} from "./projectBoardSourceElaboration";

const now = "2026-05-07T00:00:00.000Z";

function source(overrides: Partial<ProjectBoardSource> & Pick<ProjectBoardSource, "id" | "title" | "summary">): ProjectBoardSource {
  return {
    boardId: "board-1",
    kind: "functional_spec",
    relevance: 90,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function card(overrides: Partial<ProjectBoardCard> & Pick<ProjectBoardCard, "id" | "title" | "sourceId">): ProjectBoardCard {
  return {
    boardId: "board-1",
    description: "Existing board card.",
    status: "draft",
    candidateStatus: "needs_clarification",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: "board_synthesis",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function board(cards: ProjectBoardCard[]): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath: "/project/starship",
    status: "active",
    title: "Starship board",
    summary: "",
    cards,
    sources: [],
    questions: [],
    proposals: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("projectBoardSourceElaboration", () => {
  it("selects only the requested persisted source scope and trims duplicate ids", () => {
    const sources = [
      source({ id: "source-shell", title: "Shell", summary: "Pixi shell.", path: "docs/shell.md" }),
      source({ id: "source-map", title: "Cartography", summary: "Map feature.", path: "docs/cartography.md" }),
    ];

    expect(selectProjectBoardSynthesisSources(sources, undefined)).toMatchObject({
      selected: false,
      selectedSourceIds: [],
      sources,
    });
    expect(selectProjectBoardSynthesisSources(sources, [" source-map ", "source-map"])).toMatchObject({
      selected: true,
      selectedSourceIds: ["source-map"],
      sources: [sources[1]],
    });
    expect(() => selectProjectBoardSynthesisSources(sources, ["missing-source"])).toThrow("Selected source scope was not found");
    expect(() =>
      selectProjectBoardSynthesisSources(
        [
          source({
            id: "source-report",
            title: "Workspace Health Report",
            summary: "Generated report.",
            path: "reports/workspace-health-report.md",
            kind: "report_artifact",
            authorityRole: "ignored",
            includeInSynthesis: false,
          }),
        ],
        ["source-report"],
      ),
    ).toThrow("Selected source scope is ignored for synthesis");
  });

  it("builds additive Add Cards answers from selected sources and existing card context", () => {
    const shellSource = source({ id: "source-shell", title: "Shell", summary: "Existing shell notes.", path: "docs/shell.md" });
    const cartographySource = source({
      id: "source-cartography",
      title: "Spectral Cartography Feature",
      summary: "Adds scan pings, route-risk overlays, and comet contract board work.",
      path: "docs/spectral-cartography.md",
      changeState: "new",
      authorityRole: "primary",
      classifiedBy: "user",
      classificationReason: "User included functional_spec source for project-board synthesis.",
    });

    const answers = projectBoardSourceScopeAnswersForRefinement({
      boardId: "board-1",
      board: board([
        card({
          id: "card-shell",
          title: "Create the PixiJS game shell",
          sourceId: "synthesis:pixijs-game-shell",
          phase: "Foundation",
          sourceRefs: ["docs/shell.md"],
        }),
      ]),
      sources: [cartographySource],
      mode: "source_elaboration",
      selectedSourceScope: true,
    });

    expect(answers).toHaveLength(2);
    expect(answers[0].question).toBe("Add Cards source scope");
    expect(answers[0].answer).toContain("additive Add Cards operation");
    expect(answers[0].answer).toContain("docs/spectral-cartography.md");
    expect(answers[0].answer).toContain("change=new");
    expect(answers[0].answer).toContain("authority=primary");
    expect(answers[0].answer).toContain("classifiedBy=user");
    expect(answers[0].answer).toContain("User included functional_spec source");
    expect(answers[0].answer).toContain("scan pings");
    expect(answers[0].answer).not.toContain(shellSource.summary);
    expect(answers[1].answer).toContain("Create the PixiJS game shell");
    expect(answers[1].answer).toContain("sources docs/shell.md");
  });

  it("builds objective Add Cards answers with optional source context", () => {
    const answers = projectBoardSourceScopeAnswersForRefinement({
      boardId: "board-1",
      board: board([
        card({
          id: "card-shell",
          title: "Create the PixiJS game shell",
          sourceId: "synthesis:pixijs-game-shell",
          phase: "Foundation",
        }),
      ]),
      sources: [
        source({
          id: "source-board",
          title: "Existing kanban notes",
          summary: "The board already has columns, drag state, and local storage.",
          path: "docs/kanban.md",
        }),
      ],
      mode: "source_elaboration",
      selectedSourceScope: false,
      objective: "Add cards for swimlane filtering and keyboard-accessible drag operations.",
    });

    expect(answers).toHaveLength(3);
    expect(answers[0]).toMatchObject({ question: "Add Cards objective" });
    expect(answers[0].answer).toContain("swimlane filtering");
    expect(answers[0].answer).toContain("source grounding is weak");
    expect(answers[1]).toMatchObject({ question: "Add Cards source context" });
    expect(answers[1].answer).toContain("Use the recent source scan context");
    expect(answers[1].answer).toContain("docs/kanban.md");
    expect(answers[2].answer).toContain("Create the PixiJS game shell");
  });

  it("recovers deterministic source-elaboration cards from promoted report recommendations", () => {
    const report = source({
      id: "source-report",
      title: "Workspace Health Report",
      summary: "Generated report recommends remediation work.",
      path: "reports/workspace-health-report.md",
      kind: "report_artifact",
      authorityRole: "supporting",
      includeInSynthesis: true,
      classifiedBy: "user",
      classificationReason: "User included report_artifact source for project-board synthesis.",
      excerpt: [
        "# Workspace Health Report",
        "",
        "Generated by Ambient.",
        "",
        "Recommended cards:",
        "- Add a source review keyboard smoke proof.",
        "- Add a generated report promotion regression.",
      ].join("\n"),
    });

    const draft = deterministicProjectBoardSourceElaborationDraft({
      sources: [report],
      objective: "Create cards from the promoted health report.",
    });

    expect(draft.cards).toHaveLength(2);
    expect(draft.cards[0]).toMatchObject({
      title: "Add a source review keyboard smoke proof",
      sourceRefs: expect.arrayContaining(["source-report", "reports/workspace-health-report.md"]),
      labels: expect.arrayContaining(["report"]),
    });
    expect(draft.cards[0].description).toContain("Promotion decision: User included report_artifact source");
  });

  it("does not add source-scope answers for global refinement", () => {
    expect(
      projectBoardSourceScopeAnswersForRefinement({
        boardId: "board-1",
        sources: [source({ id: "source-map", title: "Cartography", summary: "Map feature." })],
        mode: "charter_review",
      }),
    ).toEqual([]);
  });

  it("annotates objective cards with provenance and weak-grounding warnings", () => {
    const draft: ProjectBoardSynthesisDraft = {
      summary: "Additive cards.",
      goal: "Improve a board.",
      currentState: "Existing board shell.",
      targetUser: "Reviewer.",
      qualityBar: "Grounded cards.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "objective:keyboard",
          title: "Keyboard movement",
          description: "Add keyboard card movement.",
          candidateStatus: "ready_to_create",
          labels: [],
          blockedBy: [],
          sourceRefs: [],
          acceptanceCriteria: ["Cards can move with keyboard controls."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Smoke keyboard movement."] },
        },
      ],
    };

    const annotated = annotateProjectBoardDraftWithObjectiveProvenance(draft, {
      objective: "Add accessible card movement.",
      sourceContextAvailable: true,
    });

    expect(annotated.draft.cards[0].objectiveProvenance).toMatchObject({
      objective: "Add accessible card movement.",
      groundingMode: "source_scan",
      sourceRefCount: 0,
      weakGrounding: true,
    });
    expect(annotated.warningRecords).toHaveLength(1);
    expect(annotated.warningRecords[0]).toMatchObject({
      type: "warning",
      code: "add_cards_objective_weak_grounding",
    });
  });

  it("adds objective provenance to progressive candidate-card records", () => {
    const annotated = annotateProjectBoardProgressiveRecordsWithObjectiveProvenance(
      [
        {
          type: "candidate_card",
          sourceId: "objective:swimlanes",
          title: "Swimlane filters",
          description: "Add swimlane filtering.",
          candidateStatus: "ready_to_create",
          labels: [],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", path: "docs/kanban.md" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["Users can filter cards by swimlane."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Smoke swimlane filtering."] },
        },
      ],
      {
        objective: "Add swimlane filtering.",
        selectedSourceScope: true,
        selectedSourceIds: ["source-kanban"],
        sourceContextAvailable: true,
      },
    );

    expect(annotated.warningRecords).toEqual([]);
    expect(annotated.records[0]).toMatchObject({
      type: "candidate_card",
      objectiveProvenance: {
        objective: "Add swimlane filtering.",
        groundingMode: "selected_sources",
        selectedSourceIds: ["source-kanban"],
        sourceRefCount: 1,
        weakGrounding: false,
      },
    });
  });
});
