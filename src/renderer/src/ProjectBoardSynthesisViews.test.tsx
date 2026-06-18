import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectBoardSynthesisProposal, ProjectBoardSynthesisRun, ProjectSummary } from "../../shared/projectBoardTypes";
import {
  ProjectBoardDecisionQueuePanel,
  ProjectBoardProposalCard,
  ProjectBoardSynthesisActivity,
  ProjectBoardSynthesisRunLedger,
  projectBoardRenderedCardLedgerSummary,
  projectBoardSynthesisActivityEvents,
} from "./ProjectBoardSynthesisViews";
import { projectBoardDecisionQueue } from "./projectBoardUiModel";

describe("ProjectBoardSynthesisViews", () => {
  it("renders the decision queue from an explicit queue contract", () => {
    const board = {
      id: "board-1",
      cards: [],
    } as unknown as NonNullable<ProjectSummary["board"]>;
    const queue = {
      summary: "All decisions are currently closed",
      detail: "Answered and duplicate decisions remain available for audit.",
      openCount: 0,
      missingSuggestionCount: 0,
      safeSuggestionCount: 0,
      userOwnedCount: 0,
      answeredCount: 2,
      duplicateCount: 1,
      proposalGapCount: 0,
      proposalGaps: [],
      openRows: [],
      auditRows: [],
      auditFilterItems: [],
      suggestedAuditCount: 0,
    } as unknown as ReturnType<typeof projectBoardDecisionQueue>;

    const markup = renderToStaticMarkup(
      <ProjectBoardDecisionQueuePanel
        board={board}
        queue={queue}
        onSelectCard={() => undefined}
        onSaveDecisionAnswer={() => undefined}
        onSuggestClarificationDefaults={() => undefined}
        onApplyDecisionImpactFeedback={() => undefined}
        onRefreshDecisionDrafts={() => undefined}
        onRegenerateDecisionDrafts={() => undefined}
      />,
    );

    expect(markup).toContain("Decisions");
    expect(markup).toContain("All decisions are currently closed");
    expect(markup).toContain("No open card-level clarification decisions");
  });

  it("renders synthesis activity and ledger without owning board orchestration", () => {
    const run = synthesisRun({
      status: "running",
      stage: "model_request",
      events: [
        {
          stage: "source_scan",
          title: "Scanned sources",
          summary: "Two source files included.",
          createdAt: "2026-06-14T12:00:00.000Z",
          metadata: { sectionCount: 2 },
        },
        {
          stage: "model_request",
          title: "Asked Ambient/Pi",
          summary: "Prompt budget and source sections are tracked.",
          createdAt: "2026-06-14T12:01:00.000Z",
          metadata: { sectionCount: 2 },
        },
      ],
    });

    const activityMarkup = renderToStaticMarkup(
      <ProjectBoardSynthesisActivity
        run={run}
        action="Planning project board"
        onPause={() => undefined}
      />,
    );
    const ledgerMarkup = renderToStaticMarkup(
      <ProjectBoardSynthesisRunLedger
        run={run}
        onRetryFailedSections={() => undefined}
        onDeferFailedSections={() => undefined}
      />,
    );

    expect(activityMarkup).toContain("Asking Ambient/Pi");
    expect(activityMarkup).toContain("Asked Ambient/Pi");
    expect(ledgerMarkup).toContain("Synthesis run");
    expect(ledgerMarkup).toContain("Prompt budget and source sections are tracked.");
  });

  it("keeps proposal-card rendering behind review callbacks", () => {
    const card = {
      sourceId: "proposal:card-1",
      title: "Extract synthesis views",
      description: "Move proposal and run-ledger rendering into an owned view module.",
      phase: "Phase 2",
      candidateStatus: "ready",
      reviewStatus: "pending",
      priority: 1,
      labels: ["project-board"],
      blockedBy: [],
      acceptanceCriteria: ["Workspace keeps only orchestration state."],
      sourceRefs: [],
      testPlan: {
        unit: ["Static render coverage"],
        integration: [],
        visual: [],
        manual: [],
      },
    } as unknown as ProjectBoardSynthesisProposal["cards"][number];
    const mergeTarget = {
      id: "card-merge",
      title: "Existing draft card",
      status: "draft",
    } as ProjectBoardCard;

    const markup = renderToStaticMarkup(
      <ProjectBoardProposalCard
        card={card}
        proposalId="proposal-1"
        pending
        busy={false}
        mergeTargets={[mergeTarget]}
        planningWarnings={[]}
        onReviewCard={() => undefined}
      />,
    );

    expect(markup).toContain("Extract synthesis views");
    expect(markup).toContain("Accept");
    expect(markup).toContain("Merge");
    expect(markup).toContain("1 proof item");
  });

  it("keeps synthesis helper summaries deterministic", () => {
    const run = synthesisRun({
      status: "succeeded",
      events: [
        {
          stage: "source_scan",
          title: "Scanned sources",
          summary: "Covered source files.",
          createdAt: "2026-06-14T12:00:00.000Z",
          metadata: {},
        },
        {
          stage: "failed",
          title: "Transient failure",
          summary: "Retryable provider interruption.",
          createdAt: "2026-06-14T12:01:00.000Z",
          metadata: {},
        },
      ],
      progressiveSummary: {
        renderedCardCount: 3,
        renderedCardLedger: [
          { restartAction: "reuse_rendered_card" },
          { restartAction: "wait_for_clarification" },
          { restartAction: "regenerate_card", splitLineage: true },
        ],
      } as unknown as ProjectBoardSynthesisRun["progressiveSummary"],
    });

    expect(projectBoardSynthesisActivityEvents(run).map(({ event }) => event.title)).toEqual([
      "Scanned sources",
      "Transient failure",
    ]);
    expect(projectBoardRenderedCardLedgerSummary(run.progressiveSummary)).toContain("3 indexed");
    expect(projectBoardRenderedCardLedgerSummary(run.progressiveSummary)).toContain("1 reusable");
    expect(projectBoardRenderedCardLedgerSummary(run.progressiveSummary)).toContain("1 split child");
  });
});

function synthesisRun(overrides: Partial<ProjectBoardSynthesisRun> = {}): ProjectBoardSynthesisRun {
  return {
    id: "run-1",
    boardId: "board-1",
    status: "running",
    stage: "source_scan",
    model: "gmi-test-model",
    sourceCount: 2,
    includedSourceCount: 2,
    sourceCharCount: 1200,
    responseCharCount: 800,
    progressiveRecordCount: 0,
    cardCount: 1,
    questionCount: 0,
    warningCount: 0,
    startedAt: "2026-06-14T12:00:00.000Z",
    updatedAt: "2026-06-14T12:01:00.000Z",
    events: [
      {
        stage: "source_scan",
        title: "Scanning sources",
        summary: "Collecting board inputs.",
        createdAt: "2026-06-14T12:00:00.000Z",
        metadata: {},
      },
    ],
    ...overrides,
  } as ProjectBoardSynthesisRun;
}
