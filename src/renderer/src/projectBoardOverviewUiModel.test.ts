import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import {
  projectBoardHistoryImpactAudit,
  projectBoardImpactQueue,
  projectBoardOverviewModel,
} from "./projectBoardOverviewUiModel";

function card(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: overrides.id ?? "card-1",
    boardId: overrides.boardId ?? "board-1",
    title: overrides.title ?? "Board card",
    description: overrides.description ?? "",
    status: overrides.status ?? "draft",
    candidateStatus: overrides.candidateStatus ?? "ready_to_create",
    labels: overrides.labels ?? [],
    blockedBy: overrides.blockedBy ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? ["Do the work."],
    testPlan: overrides.testPlan ?? { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: overrides.sourceKind ?? "planner_plan",
    sourceId: overrides.sourceId ?? "source-1",
    orchestrationTaskId: overrides.orchestrationTaskId,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function event(overrides: Partial<ProjectBoardEvent> = {}): ProjectBoardEvent {
  return {
    id: overrides.id ?? "event-1",
    boardId: overrides.boardId ?? "board-1",
    kind: overrides.kind ?? "source_updated",
    title: overrides.title ?? "Source updated",
    summary: overrides.summary ?? "",
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? "2026-01-01T00:10:00.000Z",
    ...overrides,
  };
}

function board(cards: ProjectBoardCard[], events: ProjectBoardEvent[] = []): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath: "/workspace",
    status: "active",
    title: "Board",
    summary: "",
    cards,
    sources: [
      {
        id: "source-1",
        boardId: "board-1",
        kind: "plan_artifact",
        title: "Source",
        summary: "Source summary",
        relevance: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    events,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("projectBoardOverviewUiModel", () => {
  it("assembles overview steps and deterministic impact items from owner dependencies", () => {
    const sourceImpact = event({
      id: "event-source-impact",
      metadata: {
        sourceImpact: {
          schemaVersion: 1,
          sourceId: "source-1",
          groupSourceIds: ["source-1"],
          affectedDraftCardIds: ["source-draft"],
          affectedExecutableCardIds: ["source-ready"],
          targetedRefreshOptional: true,
          nextRunFeedbackRecommended: true,
          estimatedPromptChars: 1200,
          detail: "Source changed.",
        },
      },
    });
    const proofImpact = event({
      id: "event-proof-impact",
      kind: "card_updated",
      title: "Proof suggestions staged",
      summary: "Proof suggestions staged.",
      metadata: {
        proofImpact: {
          schemaVersion: 1,
          appliedAction: "suggest_missing_proof",
          affectedCardIds: ["missing-proof"],
          pendingPiUpdateCardIds: ["missing-proof"],
          modelCallRequired: true,
          promptCharCount: 1200,
        },
      },
      createdAt: "2026-01-01T00:11:00.000Z",
    });
    const overviewBoard = board(
      [
        card({ id: "source-draft", title: "Source draft" }),
        card({ id: "source-ready", title: "Source ready", status: "ready", orchestrationTaskId: "task-source" }),
        card({
          id: "staged-card",
          title: "Staged update",
          pendingPiUpdate: {
            sourceId: "source:source-1",
            createdAt: "2026-01-01T00:12:00.000Z",
            changedFields: ["description"],
            description: "Updated source-aware description.",
          },
        }),
        card({ id: "missing-proof", title: "Missing proof" }),
      ],
      [proofImpact, sourceImpact],
    );

    const overview = projectBoardOverviewModel(overviewBoard);
    const impactQueue = projectBoardImpactQueue(overviewBoard);
    const impactAudit = projectBoardHistoryImpactAudit(overviewBoard);

    expect(overview.steps.map((step) => step.id)).toEqual(["charter", "decisions", "draft_inbox", "map", "board", "proof", "integration", "history"]);
    expect(impactQueue.items.map((item) => item.kind)).toEqual(expect.arrayContaining(["source", "staged_update", "proof"]));
    expect(impactQueue.items.find((item) => item.kind === "source")).toMatchObject({
      modelCallRequired: false,
      affectedCardIds: expect.arrayContaining(["source-draft", "source-ready"]),
      metrics: expect.arrayContaining([expect.objectContaining({ label: "Local Tasks", value: 1 })]),
    });
    expect(impactAudit.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "active", kind: "source", title: expect.stringContaining("Source") }),
        expect.objectContaining({ status: "recorded", kind: "proof", title: "Proof suggestions staged", modelCallRequired: true }),
      ]),
    );
  });

  it("suppresses handled source impact and preserves proof recheck audit details", () => {
    const sourceImpact = event({
      id: "event-source-impact",
      metadata: {
        sourceImpact: {
          schemaVersion: 1,
          sourceId: "source-1",
          groupSourceIds: ["source-1"],
          affectedDraftCardIds: ["source-draft"],
          affectedExecutableCardIds: ["source-ready"],
          targetedRefreshOptional: true,
          nextRunFeedbackRecommended: true,
          estimatedPromptChars: 1200,
        },
      },
    });
    const sourceRefreshApplied = event({
      id: "event-source-refresh-applied",
      kind: "card_updated",
      title: "Source drafts refreshed",
      metadata: {
        sourceImpact: {
          schemaVersion: 1,
          appliedAction: "refresh_affected_drafts",
          sourceImpactEventIds: ["event-source-impact"],
          sourceIds: ["source-1"],
          appliedCardIds: ["source-draft"],
        },
      },
      createdAt: "2026-01-01T00:11:00.000Z",
    });
    const proofRecheck = event({
      id: "event-proof-recheck",
      kind: "card_updated",
      title: "Proof coverage rechecked",
      metadata: {
        proofImpact: {
          schemaVersion: 1,
          appliedAction: "recompute_proof_coverage",
          affectedCardIds: ["changed-card"],
          missingProofCardIds: ["changed-card"],
          staleSinceLastRecheck: true,
          driftReasons: ["1 missing-proof card added."],
          addedMissingProofCardIds: ["changed-card"],
          proofKindChangedCardIds: ["changed-card"],
          proofItemCountChangedCardIds: ["changed-card"],
          modelCallRequired: false,
        },
      },
      createdAt: "2026-01-01T00:12:00.000Z",
    });
    const handledBoard = board(
      [
        card({ id: "source-draft", title: "Source draft" }),
        card({
          id: "source-ready",
          title: "Source ready",
          status: "ready",
          orchestrationTaskId: "task-source",
          runFeedback: [
            {
              id: "source-feedback-1",
              source: "source_impact",
              feedback: "Review the updated source on the next run.",
              sourceImpactEventId: "event-source-impact",
              sourceImpactEventIds: ["event-source-impact"],
              sourceIds: ["source-1"],
              createdAt: "2026-01-01T00:13:00.000Z",
            },
          ],
        }),
        card({ id: "changed-card", title: "Changed proof card" }),
      ],
      [proofRecheck, sourceRefreshApplied, sourceImpact],
    );

    expect(projectBoardImpactQueue(handledBoard).items.some((item) => item.kind === "source")).toBe(false);
    expect(projectBoardHistoryImpactAudit(handledBoard).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "event:proof:event-proof-recheck",
          affectedCardIds: ["changed-card"],
          notes: ["1 missing-proof card added."],
          metrics: expect.arrayContaining([
            expect.objectContaining({ label: "Drift", value: "yes" }),
            expect.objectContaining({ label: "New gaps", value: 1 }),
          ]),
        }),
      ]),
    );
  });
});
