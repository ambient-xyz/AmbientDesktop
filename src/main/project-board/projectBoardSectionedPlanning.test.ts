import { describe, expect, it } from "vitest";
import {
  projectBoardPlanningSectionPlanFromSources,
  projectBoardPlanningSectionsFromSources,
  projectBoardShouldUseSectionedPlanning,
} from "./projectBoardSectionedPlanning";
import type { ProjectBoardSynthesisSource } from "./projectBoardSynthesis";

describe("project board sectioned planning", () => {
  it("splits markdown sources by headings while preserving source identity and ranges", () => {
    const sources: ProjectBoardSynthesisSource[] = [
      {
        id: "source-gdd",
        kind: "functional_spec",
        title: "Game Design Document",
        summary: "Authoritative game spec.",
        excerpt: [
          "# Starfall Courier",
          "Opening product context.",
          "",
          "## Movement",
          "Hybrid Newtonian movement with compensation jets and dodge.",
          "",
          "## Combat",
          "Enemy factions, shields, and missile salvos.",
        ].join("\n"),
        path: "GAME_DESIGN_DOCUMENT.md",
        relevance: 99,
      },
    ];

    const sections = projectBoardPlanningSectionsFromSources(sources, { maxSectionChars: 120, minSectionChars: 20 });

    expect(sections).toHaveLength(3);
    expect(sections.map((section) => section.heading)).toEqual(["Starfall Courier", "Movement", "Combat"]);
    expect(sections[0]).toMatchObject({
      sourceId: "source-gdd",
      sourceKind: "functional_spec",
      sourcePath: "GAME_DESIGN_DOCUMENT.md",
      sourceSectionIndex: 0,
      sourceSectionCount: 3,
      sectionIndex: 0,
    });
    expect(sections.every((section) => section.range.startsWith("lines:"))).toBe(true);
  });

  it("chunks long unheaded text and recommends sectioned planning for large corpora", () => {
    const longParagraph = "arcade combat ".repeat(800);
    const sources: ProjectBoardSynthesisSource[] = [
      {
        kind: "functional_spec",
        title: "Large PRD",
        summary: "Large product doc.",
        excerpt: longParagraph,
        path: "PRD.md",
        relevance: 95,
      },
    ];

    const sections = projectBoardPlanningSectionsFromSources(sources, { maxSectionChars: 900, minSectionChars: 300 });

    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((section) => section.charCount <= 900)).toBe(true);
    expect(projectBoardShouldUseSectionedPlanning(sources)).toBe(true);
  });

  it("does not section small ignored or excluded corpora", () => {
    expect(
      projectBoardShouldUseSectionedPlanning([
        { kind: "ignored", title: "Ignored", summary: "Ignore me", relevance: 1 },
        { kind: "functional_spec", title: "Small", summary: "A short spec.", includeInSynthesis: false, relevance: 90 },
      ]),
    ).toBe(false);
  });

it("reports sources dropped by the maxSections cap instead of silently truncating", () => {
  const sources = Array.from({ length: 4 }, (_, index) => ({
    id: `source-${index + 1}`,
    kind: "functional_spec" as const,
    title: `Spec ${index + 1}`,
    summary: `Spec ${index + 1} summary.`,
    excerpt: `Spec ${index + 1} body content with enough text to form a section.`,
    path: `SPEC-${index + 1}.md`,
    relevance: 90 - index,
  }));

  const plan = projectBoardPlanningSectionPlanFromSources(sources, { maxSections: 2 });

  expect(plan.sections).toHaveLength(2);
  expect(plan.truncatedSources.map((source) => source.sourceId)).toEqual(["source-3", "source-4"]);
});
});
