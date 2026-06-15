import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectBoardCard } from "../../shared/types";
import {
  ProjectBoardColumn,
  ProjectBoardObjectiveProvenanceBlock,
  projectBoardCandidateStatusLabel,
  projectBoardCardSourceLabel,
  projectBoardColumnEmptyText,
  projectBoardDraftColumnEmptyText,
  projectBoardObjectiveGroundingLabel,
  projectBoardPhaseDisplayName,
} from "./ProjectBoardLaneViews";

describe("ProjectBoardLaneViews", () => {
  it("renders executable board lanes without owning board state", () => {
    const card = projectBoardCard();
    const markup = renderToStaticMarkup(
      <ProjectBoardColumn
        title="Ready"
        tooltip="Ready cards can be prepared."
        cards={[card]}
        allCards={[card]}
        selectedCardId={card.id}
        onSelectCard={() => undefined}
        taskById={new Map()}
        tasks={[]}
        runs={[]}
        executionArtifacts={[]}
      />,
    );

    expect(markup).toContain("Ready cards can be prepared.");
    expect(markup).toContain("Wire provider adapter");
    expect(markup).toContain("Plan artifact");
    expect(markup).toContain("Verification");
    expect(markup).toContain("Acceptance stays pinned");
    expect(markup).toContain("1 unit");
    expect(markup).toContain("Add Cards objective");
  });

  it("keeps moved lane helper copy stable", () => {
    expect(projectBoardPhaseDisplayName("proof")).toBe("Verification");
    expect(projectBoardCandidateStatusLabel("ready_to_create")).toBe("Ready to create");
    expect(projectBoardCardSourceLabel("local_task_import")).toBe("Local Task import");
    expect(projectBoardObjectiveGroundingLabel("source_scan")).toBe("Source-scan grounded");
    expect(projectBoardDraftColumnEmptyText("Needs Clarification")).toContain("Cards missing scope");
    expect(projectBoardColumnEmptyText("Done")).toContain("Completed cards");
  });

  it("renders objective provenance details in expanded form", () => {
    const markup = renderToStaticMarkup(
      <ProjectBoardObjectiveProvenanceBlock
        provenance={{
          objective: "Clarify provider adapter ownership.",
          groundingMode: "selected_sources",
          selectedSourceIds: ["source-1"],
          sourceRefCount: 2,
          weakGrounding: true,
          sourceGap: "One source is stale.",
        }}
      />,
    );

    expect(markup).toContain("Selected-source grounded");
    expect(markup).toContain("Clarify provider adapter ownership.");
    expect(markup).toContain("2 source refs");
    expect(markup).toContain("Weak grounding");
    expect(markup).toContain("One source is stale.");
  });
});

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Wire provider adapter",
    description: "Move the provider-specific adapter edge behind typed contracts.",
    status: "ready",
    candidateStatus: "ready_to_create",
    priority: 2,
    phase: "proof",
    labels: ["runtime", "provider"],
    blockedBy: [],
    acceptanceCriteria: ["Acceptance stays pinned"],
    testPlan: {
      unit: ["adapter contract"],
      integration: [],
      visual: [],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "plan-1",
    objectiveProvenance: {
      objective: "Clarify provider adapter ownership.",
      groundingMode: "source_scan",
      selectedSourceIds: [],
      sourceRefCount: 1,
      weakGrounding: false,
    },
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}
