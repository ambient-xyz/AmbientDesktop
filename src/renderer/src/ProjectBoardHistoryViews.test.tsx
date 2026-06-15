import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectBoardEvent, ProjectBoardSummary, ProjectBoardSynthesisRun, ProjectSummary } from "../../shared/types";
import {
  ProjectBoardHistoryImpactAuditPanel,
  ProjectBoardHistoryRecoveryPanel,
  ProjectBoardHistoryTab,
  ProjectBoardSupersededCardsPanel,
  projectBoardHistoryRecoveryActionBusy,
  projectBoardHistoryRecoveryActionLabel,
  projectBoardHistoryRecoveryRetryMode,
  projectBoardImpactKindLabel,
  projectBoardProgressiveRecordDetail,
  projectBoardProgressiveRecordTitle,
  projectBoardTabTitle,
} from "./ProjectBoardHistoryViews";
import type { ProjectBoardSupersededCardReview } from "./projectBoardHistoryUiModel";
import type { ProjectBoardHistoryRecoveryRun } from "./projectBoardUiModel";

describe("ProjectBoardHistoryViews", () => {
  it("renders the history tab event ledger from the workspace-owned board state", () => {
    const board = {
      id: "board-1",
      cards: [],
      sources: [],
      events: [
        {
          id: "event-1",
          boardId: "board-1",
          kind: "board_created",
          title: "Board created",
          summary: "The project board was initialized.",
          metadata: {},
          createdAt: "2026-01-01T10:00:00.000Z",
        } satisfies ProjectBoardEvent,
      ],
      synthesisRuns: [],
    } as unknown as NonNullable<ProjectSummary["board"]>;

    const markup = renderToStaticMarkup(<ProjectBoardHistoryTab board={board} />);

    expect(markup).toContain("1 board event");
    expect(markup).toContain("Board created");
    expect(markup).toContain("The project board was initialized.");
    expect(markup).toContain("All");
  });

  it("renders recovery actions and progressive records through explicit action props", () => {
    const recoveryRun = {
      runId: "run-1",
      status: "failed",
      stage: "model_response",
      tone: "warning",
      title: "Planner run needs recovery",
      summary: "Two sections failed before card synthesis completed.",
      completedSectionCount: 3,
      failedSectionCount: 2,
      progressiveRecordCount: 1,
      sourcePaths: ["docs/plan.md"],
      updatedAt: "2026-01-01T10:00:00.000Z",
      actions: [
        {
          id: "retry_failed_sections",
          label: "Retry failed sections",
          title: "Retry failed sections.",
          tone: "primary",
          disabled: false,
        },
        {
          id: "view_progressive_records",
          label: "View records",
          title: "View progressive records.",
          tone: "neutral",
          disabled: false,
        },
      ],
    } as unknown as ProjectBoardHistoryRecoveryRun;
    const sourceRun = {
      id: "run-1",
      progressiveRecords: [
        {
          title: "Recovered card",
          summary: "Saved by the planner before the retry.",
        },
      ],
    } as unknown as ProjectBoardSynthesisRun;

    const markup = renderToStaticMarkup(
      <ProjectBoardHistoryRecoveryPanel
        queue={[recoveryRun]}
        runs={[sourceRun]}
        expandedRunId="run-1"
        retryBusy={false}
        deferBusy={false}
        onAction={() => undefined}
      />,
    );

    expect(markup).toContain("Recovery actions");
    expect(markup).toContain("Planner run needs recovery");
    expect(markup).toContain("Retry failed sections");
    expect(markup).toContain("Progressive planning records");
    expect(markup).toContain("Recovered card");
  });

  it("renders history impact audit cards with tab and card actions", () => {
    const board = {
      cards: [{ id: "card-1", title: "Extract project board history" }],
    } as unknown as ProjectBoardSummary;
    const audit = {
      visible: true,
      tone: "warning",
      headline: "Workflow updates affect history",
      detail: "A workflow change affected one executable card.",
      metrics: [{ label: "Cards", value: 1, title: "Affected cards" }],
      items: [
        {
          id: "impact-1",
          kind: "workflow",
          tone: "warning",
          title: "Workflow hash changed",
          detail: "Prepared runs need review.",
          notes: ["Review before dispatch."],
          status: "active",
          statusLabel: "Active",
          modelCallRequired: true,
          createdAt: "2026-01-01T10:00:00.000Z",
          affectedCardIds: ["card-1"],
          metrics: [{ label: "Runs", value: 2, title: "Affected runs" }],
          tabId: "board",
          actionLabel: "Open Board",
        },
      ],
    } as unknown as Parameters<typeof ProjectBoardHistoryImpactAuditPanel>[0]["audit"];

    const markup = renderToStaticMarkup(
      <ProjectBoardHistoryImpactAuditPanel
        audit={audit}
        board={board}
        onSelectTab={() => undefined}
        onSelectCard={() => undefined}
      />,
    );

    expect(markup).toContain("Impact audit");
    expect(markup).toContain("Workflow hash changed");
    expect(markup).toContain("Targeted Pi");
    expect(markup).toContain("Extract project board history");
  });

  it("keeps moved history helpers compatible through direct owner exports", () => {
    const review = {
      summary: "1 draft card archived by Start Fresh",
      eventCount: 1,
      supersededCount: 1,
      demotedCount: 0,
      preservedCount: 0,
      items: [
        {
          eventId: "event-1",
          cardId: "card-1",
          title: "Old draft",
          category: "superseded",
          status: "draft",
          candidateStatus: "needs_review",
          userTouchedFields: ["title"],
          orchestrationTaskId: undefined,
          executionThreadId: undefined,
          clarificationQuestionCount: 2,
        },
      ],
    } as ProjectBoardSupersededCardReview;

    const markup = renderToStaticMarkup(<ProjectBoardSupersededCardsPanel review={review} />);

    expect(markup).toContain("Start Fresh Review");
    expect(markup).toContain("Old draft");
    expect(markup).toContain("Archived by Start Fresh");
    expect(projectBoardHistoryRecoveryRetryMode("continue_planner_batch")).toBe("continue_batch");
    expect(projectBoardHistoryRecoveryActionBusy("defer_failed_sections", false, true)).toBe(true);
    expect(projectBoardHistoryRecoveryActionLabel({ id: "resume_paused_run", label: "Resume", title: "Resume.", tone: "primary", disabled: false }, true, false)).toBe("Resuming");
    expect(projectBoardImpactKindLabel("staged_update")).toBe("Pi update");
    expect(projectBoardTabTitle("history")).toContain("history");
    expect(projectBoardProgressiveRecordTitle({ question: "What changed?" })).toBe("What changed?");
    expect(projectBoardProgressiveRecordDetail({ metadata: { sectionHeading: "Scope" } })).toContain("Scope");
  });
});
