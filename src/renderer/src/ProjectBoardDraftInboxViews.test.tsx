import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectBoardQuestion, ProjectBoardSource, ProjectBoardSynthesisRun, ProjectSummary } from "../../shared/projectBoardTypes";
import {
  projectBoardDraftColumns,
  projectBoardDraftInboxCreateReadyPreview,
  type ProjectBoardPiUpdateReviewQueue,
} from "./projectBoardUiModel";
import {
  ProjectBoardDraftBoard,
  ProjectBoardDraftSourcePicker,
  ProjectBoardKickoffInterview,
  ProjectBoardPiUpdateReviewPanel,
  projectBoardKickoffDefaultDraftingStatus,
  projectBoardQuestionSectionLabel,
} from "./ProjectBoardDraftInboxViews";

describe("ProjectBoardDraftInboxViews", () => {
  it("renders Draft Inbox board controls and candidate action menus behind explicit props", () => {
    const board = projectBoard([projectBoardCard()]);
    const markup = renderToStaticMarkup(
      <ProjectBoardDraftBoard
        columns={projectBoardDraftColumns(board.cards, { board })}
        allCandidateCount={board.cards.length}
        query=""
        filterId="all"
        includeSkipped
        filterOptions={[{ id: "all", label: "All", count: 1, title: "Show all candidates." }]}
        createReadyPreview={projectBoardDraftInboxCreateReadyPreview(board)}
        board={board}
        onSelectCard={() => undefined}
        onQueryChange={() => undefined}
        onFilterChange={() => undefined}
        onIncludeSkippedChange={() => undefined}
        createCardBusy={false}
        createReadyTasksBusy={false}
        onCreateCard={() => undefined}
        onCreateReadyTasks={() => undefined}
        onApproveCard={() => undefined}
        onSplitCard={() => undefined}
        onUpdateCardCandidate={() => undefined}
        onResolveCardPiUpdate={() => undefined}
        onOpenSourcePicker={() => undefined}
        onReviewSources={() => undefined}
      />,
    );

    expect(markup).toContain("Draft board");
    expect(markup).toContain("Add Cards From Sources");
    expect(markup).toContain("Open Source Review");
    expect(markup).toContain("Create-ready preview");
    expect(markup).toContain("Review source panel extraction");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Details");
  });

  it("renders source picker scope controls without taking over source commands", () => {
    const board = projectBoard([]);
    const markup = renderToStaticMarkup(
      <ProjectBoardDraftSourcePicker
        board={board}
        sourceBusy={false}
        sourceImpactBusy={false}
        elaborateBusy={false}
        onRefreshSources={() => undefined}
        onRefreshSourceDrafts={() => undefined}
        onRegenerateSourceDrafts={() => undefined}
        onApplySourceImpactFeedback={() => undefined}
        onElaborateSources={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain("Add Cards From Sources");
    expect(markup).toContain("Choose source scope");
    expect(markup).toContain("Implementation note");
    expect(markup).toContain("Select Visible");
    expect(markup).toContain("Select Sources");
    expect(markup).toContain("Source impact");
  });

  it("renders Pi update queue actions from the stable queue contract", () => {
    const card = projectBoardCard();
    const markup = renderToStaticMarkup(
      <ProjectBoardPiUpdateReviewPanel
        queue={piUpdateQueue(card)}
        showDetails={false}
        onToggleDetails={() => undefined}
        onShowImpactFilter={() => undefined}
        onSelectCard={() => undefined}
        onResolveItems={() => undefined}
      />,
    );

    expect(markup).toContain("Pi update review");
    expect(markup).toContain("Review staged updates");
    expect(markup).toContain("Show impacted");
    expect(markup).toContain("Ignore all");
    expect(markup).toContain("Apply all");
    expect(markup).toContain("Inspect");
  });

  it("renders kickoff interview defaults and moved helper copy", () => {
    const question = projectBoardQuestion();
    const board = projectBoard([], {
      status: "draft",
      questions: [question],
    });

    const markup = renderToStaticMarkup(
      <ProjectBoardKickoffInterview
        board={board}
        finalizeBusy={false}
        suggestDefaultsBusy={false}
        questions={[question]}
        onAnswerQuestion={() => undefined}
        onFinalizeKickoff={() => undefined}
        onCancelRevision={() => undefined}
        onSuggestKickoffDefaults={() => undefined}
        onReviewIgnoredThreads={() => undefined}
      />,
    );

    expect(markup).toContain("Kickoff interview");
    expect(markup).toContain("What primary outcome should this board reach?");
    expect(markup).toContain("Ambient/Pi editable default");
    expect(markup).toContain("Use Default");
    expect(projectBoardQuestionSectionLabel(question, 0)).toBe("Project goal");
    expect(projectBoardKickoffDefaultDraftingStatus(projectBoardWithRunningDefault(question), question.id)).toContain("Question 1/1");
  });
});

function projectBoard(
  cards: ProjectBoardCard[],
  input: Partial<NonNullable<ProjectSummary["board"]>> = {},
): NonNullable<ProjectSummary["board"]> {
  return {
    id: "board-1",
    projectPath: "/tmp/project",
    status: "active",
    title: "Project board Draft Inbox",
    summary: "Move Draft Inbox rendering behind explicit props.",
    charter: {
      id: "charter-1",
      boardId: "board-1",
      version: 1,
      status: "active",
      goal: "Simplify the project board workspace.",
      currentState: "Draft Inbox is embedded in the workspace.",
      targetUser: "Maintainers",
      nonGoals: [],
      qualityBar: "Behavior-preserving extraction.",
      testPolicy: { defaultProof: "Renderer parity is required." },
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "# Charter",
      createdAt: "2026-06-14T10:00:00.000Z",
      updatedAt: "2026-06-14T10:00:00.000Z",
    },
    cards,
    sources: [projectBoardSource()],
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

function projectBoardSource(input: Partial<ProjectBoardSource> = {}): ProjectBoardSource {
  return {
    id: "source-1",
    boardId: "board-1",
    kind: "implementation_file",
    sourceKey: "src/renderer/src/ProjectBoardWorkspace.tsx",
    changeState: "changed",
    title: "Implementation note",
    summary: "Draft Inbox source basis.",
    excerpt: "Draft Inbox source picker should stay behavior-preserving.",
    path: "src/renderer/src/ProjectBoardWorkspace.tsx",
    authorityRole: "primary",
    includeInSynthesis: true,
    relevance: 1,
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Review source panel extraction",
    description: "Keep Draft Inbox actions behind an explicit owner.",
    status: "draft",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "proof",
    labels: ["project-board"],
    blockedBy: [],
    acceptanceCriteria: ["Draft Inbox renders with stable markup."],
    testPlan: {
      unit: ["static render"],
      integration: [],
      visual: [],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "source-1",
    sourceRefs: ["source-1"],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}

function projectBoardQuestion(input: Partial<ProjectBoardQuestion> = {}): ProjectBoardQuestion {
  return {
    id: "question-1",
    boardId: "board-1",
    question: "What primary outcome should this board reach?",
    required: true,
    suggestedAnswer: "Make ProjectBoardWorkspace smaller without changing behavior.",
    suggestedAnswerRationale: "The V3 plan prioritizes broad owner splits.",
    suggestedAnswerConfidence: "high",
    suggestedAnswerSourceIds: ["source-1"],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}

function piUpdateQueue(card: ProjectBoardCard): ProjectBoardPiUpdateReviewQueue {
  const item = {
    card,
    sourceKind: "source" as const,
    sourceLabel: "Source refresh",
    changedFieldLabels: ["Description", "Acceptance criteria"],
    previewLines: ["Description: clarify Draft Inbox owner.", "Acceptance: preserve action controls."],
    actionable: true,
  };
  return {
    visible: true,
    headline: "Review staged updates",
    detail: "Apply or ignore Pi updates before ticketization.",
    items: [item],
    actionableItems: [item],
    decisionCount: 0,
    sourceCount: 1,
    proofCount: 0,
    planningCount: 0,
    blockedCount: 0,
  };
}

function projectBoardWithRunningDefault(question: ProjectBoardQuestion): NonNullable<ProjectSummary["board"]> {
  return projectBoard([], {
    status: "draft",
    questions: [question],
    synthesisRuns: [runningKickoffDefaultsRun(question.id)],
  });
}

function runningKickoffDefaultsRun(questionId: string): ProjectBoardSynthesisRun {
  return {
    id: "run-1",
    boardId: "board-1",
    status: "running",
    stage: "kickoff_defaults",
    sourceCount: 1,
    includedSourceCount: 1,
    sourceCharCount: 1000,
    responseCharCount: 128,
    questionCount: 0,
    warningCount: 0,
    events: [
      {
        stage: "kickoff_defaults",
        title: "Drafting default",
        summary: "Ambient/Pi is drafting a kickoff default.",
        metadata: {
          questionId,
          position: 1,
          total: 1,
        },
        createdAt: "2026-06-14T10:00:00.000Z",
      },
    ],
    startedAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  };
}
