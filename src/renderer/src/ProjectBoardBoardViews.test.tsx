import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectSummary } from "../../shared/projectBoardTypes";
import { ProjectBoardBoardTab } from "./ProjectBoardBoardViews";
import { projectBoardColumns } from "./projectBoardUiModel";

describe("ProjectBoardBoardViews", () => {
  it("renders the draft-board callout through the moved board tab owner", () => {
    const board = projectBoard({ status: "draft", cards: [] });
    const markup = renderToStaticMarkup(renderBoardTab(board));

    expect(markup).toContain("Project board active cards");
    expect(markup).toContain("0 executable cards");
    expect(markup).toContain("Kickoff draft");
    expect(markup).toContain("Finish kickoff before execution work appears here.");
    expect(markup).toContain("The Draft Inbox can hold proposed cards now");
  });

  it("renders executable lanes, run preparation, and detail mount from explicit props", () => {
    const card = projectBoardCard();
    const board = projectBoard({ status: "active", cards: [card] });
    const markup = renderToStaticMarkup(renderBoardTab(board, { selectedCard: card, selectedCardId: card.id }));

    expect(markup).toContain("1 executable card");
    expect(markup).toContain("1 ready Local Task");
    expect(markup).toContain("Prepare Runs");
    expect(markup).toContain("Implement board shell extraction");
    expect(markup).toContain("Project board execution next step");
    expect(markup).toContain("Ready");
    expect(markup).toContain("Acceptance stays pinned");
  });
});

function renderBoardTab(
  board: NonNullable<ProjectSummary["board"]>,
  options: {
    selectedCard?: ProjectBoardCard;
    selectedCardId?: string;
  } = {},
) {
  return (
    <ProjectBoardBoardTab
      board={board}
      columns={projectBoardColumns(board.cards)}
      boardStatus={board.status}
      synthesisRetryBusy={false}
      runActivityLinesByThread={{}}
      threadRunStatuses={{}}
      selectedCard={options.selectedCard}
      selectedCardId={options.selectedCardId}
      onSelectCard={() => undefined}
      onSelectTab={() => undefined}
      onOpenSourcePicker={() => undefined}
      onJumpToBlocker={() => undefined}
      onJumpToInbox={() => undefined}
      onPrepareRuns={() => undefined}
      onResolveWorkflowImpact={() => undefined}
      onRepairWorkflow={() => undefined}
      onUpdateWorkflowSettings={() => undefined}
      onUpdateWorkflowRaw={() => undefined}
      onStartRun={() => undefined}
      onCancelRun={() => undefined}
      onRevealWorkspace={() => undefined}
      onOpenRunThread={() => undefined}
      onCopySessionToThread={() => undefined}
      onResolveProofDecision={() => undefined}
      onResolveSplitDecision={() => undefined}
      onAddRunFeedback={() => undefined}
      onRetrySynthesis={() => undefined}
      synthesisDeferBusy={false}
      onDeferSynthesisSections={() => undefined}
      onAttachLocalTask={() => undefined}
      onClaimAction={() => undefined}
      inspectorRequest={{ requestId: 0 }}
    />
  );
}

function projectBoard(input: Partial<NonNullable<ProjectSummary["board"]>> = {}): NonNullable<ProjectSummary["board"]> {
  return {
    id: "board-1",
    projectPath: "/tmp/project",
    status: "active",
    title: "Board shell extraction",
    summary: "Move the board tab behind an explicit view owner.",
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    executionArtifacts: [],
    events: [],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Implement board shell extraction",
    description: "Keep board-tab behavior stable while moving its owner file.",
    status: "ready",
    candidateStatus: "ready_to_create",
    priority: 2,
    phase: "Phase 2",
    labels: ["project-board"],
    blockedBy: [],
    acceptanceCriteria: ["Acceptance stays pinned"],
    testPlan: {
      unit: ["static render"],
      integration: [],
      visual: [],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "source-1",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}
